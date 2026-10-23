// Headless mission autoplayer for Vicehaven: runs a job from start to finish.
//
//   node tools/missiontest.mjs g01_cash_run [g02_package_run ...] [--timeout 900] [--chunk 0.25] [--chase-watch 8] [--html built.html] [--quiet] [--allow-warnings]
//
// For each mission id it starts a fresh game (noAutoStory/noAutoSave), marks
// the job's prerequisites completed, starts it, then loops: skip dialogue and
// scenes, "play" the current step (teleport to goto/deliver targets, get in
// the car, kill kill/survive targets, wreck chase/destroy cars, walk onto
// collect pickups, drop the wanted level for loseHeat, pick option 1 of a
// choice) and advance simulated time in small chunks. It prints every step
// as it starts and PASS when completed[id] is set, or FAIL with the stuck
// step (and the engine's fail reason, if it failed) after --timeout simulated
// seconds. Before running, it checks the job's data ([data]: unknown places,
// car types, factions, characters, weapons, steps whose kind is 'none'), and
// while running it flags what teleporting hides from it ([play]: a car to get
// in spawned far from Jay, a goto that is already reached, a step the engine
// skips because its place/car/group doesn't exist). Either makes it a FAIL
// (--allow-warnings lets [play] warnings through).
//
// Why a loop of separate page.evaluate calls (and not one long advance()):
// a step's `await` continues in a microtask, which only runs once the
// synchronous evaluate returns; and dialogue lines are timed on the wall
// clock (performance.now), not on simulated time. So each tick skips the
// dialogue itself and returns to Node, letting the engine move on.
//
// Exit code: 1 if any mission FAILs or the page throws ([pageerror]).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opts = {};
const ids = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opts[a.slice(2)] = next; i++; } else opts[a.slice(2)] = true;
  } else ids.push(a);
}
if (!ids.length) {
  console.error('usage: node tools/missiontest.mjs <mission id> [more ids] [--timeout seconds] [--chunk seconds] [--chase-watch seconds] [--html built.html] [--quiet] [--allow-warnings]');
  process.exit(2);
}
const TIMEOUT = +opts.timeout || 900; // simulated seconds per mission
const CHUNK = +opts.chunk || 0.25; // simulated seconds per tick
const WATCH = +opts['chase-watch'] || 8; // seconds a chased/followed car drives before the autoplayer acts

let html = opts.html;
if (!html) {
  html = path.join(os.tmpdir(), `vicehaven-missiontest-${process.pid}.html`);
  execFileSync('node', [path.join(root, 'tools/build.mjs'), html], { stdio: 'inherit' });
}
html = path.resolve(html);

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR, '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const dir of candidates) if (fs.existsSync(dir)) return import(pathToFileURL(path.join(dir, 'index.mjs')).href);
  return import('playwright');
}
const { chromium } = await loadPlaywright();
const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
let exceptions = 0;
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || (t === 'warning' && !/KHR_parallel|GPU stall|ReadPixels/.test(m.text()))) console.log('[console]', t, m.text().slice(0, 500));
});
page.on('pageerror', (e) => { exceptions++; console.log('[pageerror]', String(e).slice(0, 800)); });
await page.goto('file://' + html);
await page.waitForFunction(() => window.VH && VH.game && VH.game.state === 'title', null, { timeout: 120000 });
await page.evaluate(() => {
  VH.settings.applyPreset('low'); // nothing is rendered, keep the world cheap
  VH.settings.set && VH.settings.set('gameplay.voicedDialogue', false);
  VH.game.freeze(true);
});

// ------------------------------------------------------------------ in page
/** Static checks on a job's data (things the engine silently ignores). */
function lintInPage(id) {
  const ms = VH.game.missions;
  const m = ms.all.get(id);
  if (!m) return { missing: true };
  const story = ms.story;
  const issues = [];
  // Story places plus the city's own (streets, districts: places.js).
  const places = { has: (id) => VH.game.places.has(id) && !!VH.game.places.get(id) };
  const chars = new Set(Object.keys(story.characters || {}).concat(['jay', 'caption', 'DISPATCH']));
  const factions = new Set(Object.keys(story.factions || {}).concat(['civilian', 'crew', 'friendly', 'gang', 'story']));
  const cars = new Set();
  const actors = new Set();
  const groups = new Set();
  const placeOk = (p) => typeof p === 'object' || places.has(p) || cars.has(p) || actors.has(p);
  const checkPlace = (p, where) => { if (p !== undefined && !placeOk(p)) issues.push(where + ': unknown place "' + p + '"'); };
  const checkSay = (say, where) => { for (const l of say || []) if (!chars.has(l[0])) issues.push(where + ': unknown speaker "' + l[0] + '"'); };
  const checkWeapon = (w, where) => { if (w && !VH.Combat.def(w)) issues.push(where + ': unknown weapon "' + w + '"'); };
  if (!places.has(m.start) && !['chain', 'auto', 'intro'].includes(m.start)) issues.push('start: unknown place "' + m.start + '"');
  for (const w of (m.reward && m.reward.weapons) || []) checkWeapon(w, 'reward');
  const walk = (steps, prefix) => (steps || []).forEach((s, i) => {
    const where = prefix + i;
    const kind = ms.constructor.kindOf(s);
    if (kind === 'none') issues.push(where + ': step has no known kind (' + Object.keys(s).join(',') + ')');
    checkSay(s.say, where);
    if (s.scene) {
      checkPlace(s.scene.at, where);
      for (const c of s.scene.cast || []) {
        const id = typeof c === 'string' ? c : c.id;
        if (!chars.has(id)) issues.push(where + ': unknown cast "' + c + '"');
        actors.add(id); // a scene brings its cast on as actors (missions.js _scene)
      }
    }
    if (s.spawnCar) {
      if (!VH.Vehicle.typeSpec(s.type)) issues.push(where + ': unknown car type "' + s.type + '" (would spawn a halcyon)');
      checkPlace(s.at, where);
      cars.add(s.spawnCar);
    }
    if (s.spawn) for (const e of [].concat(s.spawn)) {
      checkPlace(e.at, where);
      if (e.faction && !factions.has(e.faction)) issues.push(where + ': unknown faction "' + e.faction + '"');
      if (e.char && !chars.has(e.char)) issues.push(where + ': unknown char "' + e.char + '"');
      checkWeapon(e.weapon, where);
      if (e.id) {
        actors.add(e.id);
        if ((e.count || 1) > 1) for (let k = 0; k < e.count; k++) actors.add(e.id + '_' + k); // count > 1: ids are id_0, id_1, ...
      }
      if (e.char) actors.add(e.id || e.char);
      if (e.group) groups.add(e.group);
    }
    if (s.goto !== undefined) checkPlace(s.goto, where);
    for (const k of ['getIn', 'deliver', 'chase', 'follow']) if (s[k] !== undefined && s[k] !== 'any' && !cars.has(s[k])) issues.push(where + ': ' + k + ' names car "' + s[k] + '" that no earlier spawnCar made');
    if (s.destroy) for (const c of [].concat(s.destroy)) if (!cars.has(c)) issues.push(where + ': destroy names car "' + c + '" that no earlier spawnCar made');
    if (s.deliver !== undefined) checkPlace(s.to, where);
    if (s.collect) for (const p of [].concat(s.collect)) checkPlace(p, where);
    if (s.chase && s.route) for (const p of s.route) checkPlace(p, where);
    if (s.kill) for (const k of [].concat(s.kill)) {
      const ref = String(k).replace(/^group:/, '');
      if (!groups.has(ref) && !actors.has(ref)) issues.push(where + ': kill names "' + k + '", not a spawned group or id');
    }
    if (s.waves) for (const w of s.waves) {
      checkPlace(w.at, where);
      checkWeapon(w.weapon, where);
      if (w.faction && !factions.has(w.faction)) issues.push(where + ': unknown wave faction "' + w.faction + '"');
    }
    if (s.camera) checkPlace(s.camera, where);
    if (s.teleport) checkPlace(s.teleport, where);
    if (s.then) walk(s.then, where + '.then.');
    if (s.else) walk(s.else, where + '.else.');
    if (s.choice) (s.choice.options || []).forEach((o, k) => walk(o.then, where + '.opt' + k + '.'));
  });
  walk(m.steps, '');
  return { issues, title: m.title, steps: m.steps.length };
}

/** New game, prerequisites done, job started, step log hooked. */
function setupInPage(id) {
  const g = VH.game;
  g.noAutoStory = true;
  g.noAutoSave = true;
  g.newGame();
  g.advance(3);
  g.environment.clockRunning = false;
  const ms = g.missions;
  const m = ms.all.get(id);
  const done = (mm) => {
    for (const r of mm.requires || []) {
      if (ms.completed[r]) continue;
      ms.completed[r] = true;
      const rm = ms.all.get(r);
      if (rm) done(rm);
    }
    if (mm.requiresFlag) for (const f of [].concat(mm.requiresFlag)) if (!f.startsWith('!')) ms.flags[f] = true;
  };
  done(m);
  g.police.setLevel(0);
  g.player.godMode = true;
  // Log every step the engine executes (an instance patch: _runSteps calls this._exec for each step).
  const T = (window.__mt = { log: [], notes: [], failed: null, passed: false, cur: null, mover: null });
  if (!ms.__mtPatched) {
    ms.__mtPatched = true;
    const orig = ms._exec;
    ms._exec = function (step, run, setup) {
      if (!setup && window.__mt) {
        const kind = ms.constructor.kindOf(step);
        const pp = VH.game.player.pos;
        const far = (o) => (o ? Math.round(Math.hypot(o.x - pp.x, o.z - pp.z)) : -1);
        // Things a teleporting autoplayer gets through but a player would trip on.
        const warn = [];
        if (kind === 'getIn' && step.getIn !== 'any') {
          const v = run.cars.get(step.getIn);
          if (!v) warn.push('no car "' + step.getIn + '": the step is skipped');
          else if (far(v.pos) > 120 && !VH.game.player.vehicle) warn.push('the car is ' + far(v.pos) + ' m from Jay (on foot)');
        }
        if (kind === 'goto') {
          const pl = this._place(step.goto);
          if (!pl) warn.push('no place: the step is skipped');
          else if (far(pl) <= (step.radius || (step.vehicle ? 7 : 3.2))) warn.push('Jay is already there: the step ends at once');
        }
        if (kind === 'kill' && !this._group(step.kill, run).length) warn.push('nobody to kill: the step is skipped');
        if ((kind === 'deliver' && !this._place(step.to)) || (kind === 'collect' && ![].concat(step.collect).some((c) => this._place(c)))) warn.push('no place: the step is skipped');
        if ((kind === 'chase' || kind === 'follow') && !run.cars.get(step[kind])) warn.push('no car: the step is skipped');
        if (kind === 'collect') for (const c of [].concat(step.collect)) {
          const pl = this._place(c);
          if (!pl) continue;
          // A pickup under a car Jay can't move (a wreck, a locked car) can't be reached.
          for (const v of VH.game.vehicles.list) {
            if (v.removed || Math.abs(v.pos.x - pl.x) > 8 || Math.abs(v.pos.z - pl.z) > 8) continue;
            const l = v.worldToLocal(pl.x, pl.z, {});
            if (Math.abs(l.x) < v.hx && Math.abs(l.z) < v.hz && (v.wrecked || v.noEnter)) warn.push('the pickup at "' + c + '" is under a ' + (v.wrecked ? 'wrecked ' : 'locked ') + v.type + ': it can\'t be reached');
          }
        }
        window.__mt.cur = step;
        window.__mt.log.push({ idx: run.depth ? run.stepIndex + '+' : String(run.stepIndex), kind, objective: step.objective || '', warn });
      }
      return orig.call(this, step, run, setup);
    };
    VH.events.on('mission:fail', (e) => { if (window.__mt) window.__mt.failed = e.reason; });
    VH.events.on('mission:pass', () => { if (window.__mt) window.__mt.passed = true; });
  }
  ms.start(m);
  return !!ms.run;
}

/** One tick: skip talk, play the current step, advance simulated time. */
function tickInPage({ chunk, watch }) {
  const g = VH.game;
  const ms = g.missions;
  const T = window.__mt;
  const p = g.player;
  const d = g.dialogue;
  const run = ms.run;
  // Dialogue and choices: skip.
  if (d._choice) d._pick(0);
  for (let k = 0; k < 50 && d.current; k++) {
    d.current.i = d.current.lines.length;
    d._line();
  }
  p.godMode = true;
  p.health = p.maxHealth;
  g.police.bust = 0; // no arrests: an autoplayer stands still next to cops (a chunk is too short to reach a bust)
  const step = T.cur;
  const kind = step ? ms.constructor.kindOf(step) : 'none';

  const carOf = (id) => (run && id ? run.cars.get(id) : null);
  const live = (v) => v && !v.removed && !v.wrecked;
  const moveTo = (x, z, yaw) => {
    if (p.vehicle) {
      const v = p.vehicle;
      v.place(x, z, yaw !== undefined ? yaw : v.yaw);
      v.vel.set(0, 0, 0);
      p.pos.copy(v.pos);
    } else {
      p.teleport(x, z, yaw !== undefined ? yaw : p.heading);
    }
    g.cameraRig.snapBehind(p);
  };
  const enter = (v) => {
    if (!live(v) || p.vehicle === v) return;
    if (p.vehicle) g.vehicles.exitVehicle();
    if (g.vehicles.entering) return;
    v.noEnter = false;
    v.vel.set(0, 0, 0);
    const door = g.vehicles._doorPoint(v, 1, 0.5, {});
    p.teleport(door.x, door.z, p.heading);
    g.vehicles.beginEnter({ v, side: 1, x: door.x, z: door.z });
  };
  const behind = (car, dist) => moveTo(car.pos.x - Math.sin(car.yaw) * dist, car.pos.z - Math.cos(car.yaw) * dist, car.yaw);
  /** Keeps Jay behind a driven car for `watch` seconds; true while still watching. Warns if it barely moved. */
  const watchMover = (car) => {
    if (!T.mover || T.mover.step !== step) T.mover = { step, t: 0, x: car.pos.x, z: car.pos.z, done: false };
    const mv = T.mover;
    if (mv.done) return false;
    mv.t += chunk;
    if (mv.t < watch) {
      if (!p.vehicle) {
        const mine = [...run.cars.values()].find((v) => live(v) && v !== car && v.driver !== 'ai');
        if (mine) { enter(mine); return true; }
      }
      if (!g.vehicles.entering) behind(car, 30);
      return true;
    }
    mv.done = true;
    const moved = Math.round(Math.hypot(car.pos.x - mv.x, car.pos.z - mv.z));
    const stuck = moved < 4 * watch; // under ~15 km/h on average
    T.notes.push({ idx: String(run.stepIndex), text: 'the ' + car.type + ' moved ' + moved + ' m in its first ' + watch + ' s (now ' + Math.round(car.speed * 3.6) + ' km/h)' + (stuck ? ': it never got going' : ''), warn: stuck });
    return false;
  };
  const killAll = (list) => { for (const a of list || []) if (a && !a.dead && !a.removed) a.damage(99999, 'player', 'bullet'); };

  if (run && step) {
    switch (kind) {
      case 'getIn': {
        if (step.getIn === 'any') {
          if (!p.vehicle) {
            const near = g.vehicles.findEnterable(p.pos.x, p.pos.z, 60);
            if (near) enter(near.v);
            else enter(g.vehicles.spawn('halcyon', p.pos.x + 4, p.pos.z, 0, {}));
          }
        } else enter(carOf(step.getIn));
        break;
      }
      case 'goto': {
        let place = ms._place(step.goto);
        if (!place) break;
        if (place.roof && place.door && Math.hypot(p.pos.x - place.door.x, p.pos.z - place.door.z) > 2) place = place.door;
        const carId = typeof step.vehicle === 'string' ? step.vehicle : null;
        if (step.vehicle === false && p.vehicle) g.vehicles.exitVehicle();
        else if (carId && p.vehicle !== carOf(carId)) { enter(carOf(carId)); break; }
        else if (step.vehicle === true && !p.vehicle) {
          const mine = [...run.cars.values()].find((v) => live(v) && !v.noEnter && v.driver !== 'ai');
          // No mission car: take the nearest one, or one off the lot (like a player would).
          const near = mine ? null : g.vehicles.findEnterable(p.pos.x, p.pos.z, 60);
          enter(mine || (near && near.v) || g.vehicles.spawn('halcyon', p.pos.x + 4, p.pos.z, 0, {}));
          break;
        }
        if (g.vehicles.entering) break;
        const r = step.radius || (step.vehicle ? 7 : 3.2);
        const dd = Math.hypot(p.pos.x - place.x, p.pos.z - place.z);
        // Stop inside the ring but short of its centre, coming from where Jay was (as a driver would).
        if (dd > r * 0.7) {
          const k = p.vehicle ? Math.min(r * 0.6, 5) / dd : 0;
          moveTo(place.x + (p.pos.x - place.x) * k, place.z + (p.pos.z - place.z) * k);
        }
        break;
      }
      case 'deliver': {
        const car = carOf(step.deliver) || p.vehicle;
        const place = ms._place(step.to);
        if (!car || !place) break;
        if (p.vehicle !== car) { enter(car); break; }
        if (Math.hypot(car.pos.x - place.x, car.pos.z - place.z) > 1) moveTo(place.x, place.z);
        break;
      }
      case 'kill':
        killAll(ms._group(step.kill, run));
        break;
      case 'survive':
      case 'protect':
        killAll(run.targets);
        break;
      case 'collect': {
        const next = (run.watchItems || []).find((it) => !it.collected);
        if (next) moveTo(next.pos.x, next.pos.z);
        break;
      }
      case 'loseHeat':
        g.police.setLevel(0);
        break;
      case 'chase': {
        const car = carOf(step.chase);
        if (!live(car)) break;
        // Let it run for a few seconds first (Jay on its tail): a target that
        // never gets going is a broken chase, even if wrecking it passes.
        if (watchMover(car)) break;
        if ((step.mode || 'wreck') === 'catch') car.health = Math.min(car.health, 250);
        else car.explode();
        break;
      }
      case 'destroy':
        for (const id of [].concat(step.destroy)) { const c = carOf(id); if (live(c)) c.explode(); }
        break;
      case 'follow': {
        const car = carOf(step.follow);
        if (!live(car)) break;
        if (!p.vehicle) {
          const mine = [...run.cars.values()].find((v) => live(v) && v !== car && v.driver !== 'ai');
          if (mine) { enter(mine); break; }
        }
        watchMover(car);
        behind(car, 40);
        break;
      }
      case 'race':
        if (run.marker) moveTo(run.marker.x, run.marker.z);
        break;
      default:
        break;
    }
    // Anything else that waits with a marker (or a step kind not handled above): go to the marker.
    if (!['goto', 'deliver', 'collect', 'race', 'getIn', 'follow', 'chase', 'scene', 'wait', 'camera', 'fade', 'blackout', 'say', 'phone'].includes(kind) && run.marker && !run.marker.moving && ms._waiters.some((w) => w.run === run)) {
      if (Math.hypot(p.pos.x - run.marker.x, p.pos.z - run.marker.z) > (run.marker.r || 3)) moveTo(run.marker.x, run.marker.z);
    }
  }
  g.advance(chunk);
  const r = ms.run;
  return {
    log: T.log.splice(0),
    notes: T.notes.splice(0),
    passed: T.passed,
    failed: T.failed,
    running: !!r,
    stepIndex: r ? r.stepIndex : null,
    kind,
    objective: r ? r.objective : null,
    heat: g.police.level,
    inCar: p.vehicle ? p.vehicle.type : null,
    pos: [Math.round(p.pos.x), Math.round(p.pos.z)],
  };
}

// --------------------------------------------------------------- main loop
const results = [];
for (const id of ids) {
  const lint = await page.evaluate(lintInPage, id);
  if (lint.missing) {
    console.log(`FAIL ${id}: no such mission`);
    results.push([id, false]);
    continue;
  }
  console.log(`\n=== ${id} "${lint.title}" (${lint.steps} steps)`);
  for (const i of lint.issues) console.log('  [data] ' + i);
  const started = await page.evaluate(setupInPage, id);
  if (!started) {
    console.log(`FAIL ${id}: the engine refused to start it`);
    results.push([id, false]);
    continue;
  }
  let t = 0;
  let last = null;
  let ok = false;
  let failReason = null;
  const warnings = [];
  const t0 = Date.now();
  while (t < TIMEOUT) {
    const s = await page.evaluate(tickInPage, { chunk: CHUNK, watch: WATCH });
    t += CHUNK;
    for (const e of s.log) {
      console.log(`  step ${e.idx.padStart(3)}  ${e.kind.padEnd(9)} ${e.objective}`);
      for (const w of e.warn) { console.log(`  [play] step ${e.idx}: ${w}`); warnings.push(w); }
    }
    for (const n of s.notes) {
      console.log(`  [${n.warn ? 'play' : 'info'}] step ${n.idx}: ${n.text.replace(/^WARN /, '')}`);
      if (n.warn) warnings.push(n.text);
    }
    if (s.running && !opts.quiet && s.objective && s.objective !== (last && last.objective) && s.kind !== 'scene') console.log(`           · ${s.objective}`);
    last = s;
    if (s.failed) { failReason = s.failed; break; }
    if (!s.running) {
      ok = await page.evaluate((id) => !!VH.game.missions.completed[id], id);
      break;
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const problems = lint.issues.length + (opts['allow-warnings'] ? 0 : warnings.length);
  if (ok && !problems) console.log(`PASS ${id} (${t.toFixed(1)} s simulated, ${secs} s real)`);
  else if (ok) console.log(`FAIL ${id}: completed, but with ${lint.issues.length} [data] issue(s) and ${warnings.length} [play] warning(s) above`);
  else if (failReason) console.log(`FAIL ${id}: mission failed at step ${last && last.stepIndex} (${last && last.kind}): ${failReason}`);
  else console.log(`FAIL ${id}: stuck at step ${last && last.stepIndex} (${last && last.kind}) "${last && last.objective}" after ${t.toFixed(0)} s simulated; heat ${last && last.heat}, car ${last && last.inCar}, at ${last && last.pos}`);
  results.push([id, ok && !problems]);
}
await browser.close();
if (!opts.html) fs.rmSync(html, { force: true });
console.log('\n' + results.map(([id, ok]) => (ok ? 'PASS ' : 'FAIL ') + id).join('\n'));
if (exceptions) console.log(`${exceptions} page exception(s)`);
process.exit(exceptions || results.some(([, ok]) => !ok) ? 1 : 0);
