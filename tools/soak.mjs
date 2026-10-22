// Headless soak test: boots the game, then exercises weapons, every vehicle type,
// police chases, time-of-day/cloud sweeps and long idle runs looking for exceptions
// and NaNs. Software WebGL is slow, so it keeps rendering to a minimum.
//
//   node tools/soak.mjs [--html built.html] [--quality high] [--only weapons,vehicles,police,sky,places]
// Exit code 1 if anything threw.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
let html = args.html;
if (!html) {
  html = path.join(os.tmpdir(), `vicehaven-soak-${process.pid}.html`);
  execFileSync('node', [path.join(root, 'tools/build.mjs'), html], { stdio: 'inherit' });
}
html = path.resolve(html);
const only = args.only && args.only !== true ? String(args.only).split(',') : ['weapons', 'vehicles', 'police', 'sky', 'places'];
// 'missions' and 'long' are opt-in (slow): --only missions / --only long

const pwDir = [process.env.PLAYWRIGHT_DIR, '/opt/node-tools/node_modules/playwright'].filter(Boolean).find((d) => fs.existsSync(d));
const { chromium } = pwDir ? await import(pathToFileURL(path.join(pwDir, 'index.mjs')).href) : await import('playwright');
const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') { console.log('[console error]', m.text().slice(0, 300)); problems.push('console: ' + m.text().slice(0, 200)); } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e).slice(0, 400)); problems.push('pageerror: ' + String(e).slice(0, 200)); });
await page.goto('file://' + html);
await page.waitForFunction(() => window.VH && VH.game && VH.game.state === 'title', null, { timeout: 120000 });
await page.evaluate((q) => {
  VH.settings.applyPreset(q);
  const g = VH.game; g.noAutoStory = true; g.noAutoSave = true;
  g.newGame(); g.advance(3);
  g.environment.clockRunning = false;
  g.freeze(true);
  window.__soak = (name, fn) => { try { return { name, out: fn() }; } catch (e) { return { name, error: String(e && e.stack || e).slice(0, 600) }; } };
}, args.quality && args.quality !== true ? args.quality : 'high');

async function run(label, fn, arg) {
  const t0 = Date.now();
  const r = await page.evaluate(fn, arg);
  const items = Array.isArray(r) ? r : [r];
  for (const it of items) {
    if (it && it.error) { problems.push(`${label}/${it.name}: ${it.error}`); console.log(`FAIL ${label}/${it.name}: ${it.error.split('\n')[0]}`); }
    else console.log(`ok   ${label}/${it && it.name}${it && it.out !== undefined ? ' ' + JSON.stringify(it.out) : ''}`);
  }
  console.log(`  (${label} ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

if (only.includes('weapons')) {
  await run('weapons', () => {
    const g = VH.game, c = g.combat, p = g.player, res = [];
    p.teleport(0, -250, 0); g.cameraRig.snapBehind(p); g.advance(1);
    const input = g.input, origDown = input.down, origConsume = input.consume;
    for (const w of VH.Data.weapons) {
      res.push(window.__soak('weapon ' + w.id, () => {
        c.inventory = { fists: { ammo: 0, mag: 0 } };
        c.giveWeapon(w.id, undefined, true);
        c.select(w.id);
        const before = JSON.stringify(c.inventory[w.id]);
        let presses = 0;
        input.down = (a) => a === 'fire' || a === 'aim' || origDown.call(input, a);
        input.consume = (a) => (a === 'fire' && presses++ % 12 === 0) || origConsume.call(input, a);
        g.advance(2.5);
        input.down = origDown; input.consume = origConsume;
        const after = c.inventory[w.id];
        if (after && (Number.isNaN(after.mag) || Number.isNaN(after.ammo))) throw new Error('bad ammo ' + JSON.stringify(after));
        return { before, after: after ? JSON.stringify(after) : 'used up' };
      }));
    }
    input.down = origDown; input.consume = origConsume;
    return res;
  });
}

if (only.includes('vehicles')) {
  const types = await page.evaluate(() => VH.CarModels.list());
  console.log(`vehicle types (${types.length}): ${types.join(' ')}`);
  for (const type of types) {
    await run('vehicle', (type) => window.__soak(type, () => {
      const g = VH.game, p = g.player, vs = g.vehicles;
      p.teleport(0, -250, 0); g.advance(0.5);
      const v = vs.spawn(type, p.pos.x + 4, p.pos.z, 0, { persistent: true });
      if (!v) throw new Error('spawn returned nothing');
      const d = vs._doorPoint(v, 1, 0.5, {});
      vs.beginEnter({ v, side: 1, x: d.x, z: d.z });
      g.advance(1.8);
      if (p.vehicle !== v && vs.entering && vs.entering.v === v) { vs.entering.phase = 'in'; vs._finishEnter(); } // big aircraft have their door elsewhere
      if (p.vehicle !== v) throw new Error('could not get in');
      v.input.accel = 1; v.input.steer = 0.3;
      g.advance(4);
      v.input.steer = -0.5; v.input.handbrake = 1;
      g.advance(2);
      for (const k of ['x', 'y', 'z']) if (!Number.isFinite(v.pos[k])) throw new Error('NaN position ' + k);
      g.renderOnce();
      vs.exitVehicle(); g.advance(1.2);
      v.damage && v.damage(99999, 'player', 'test'); g.advance(2);
      vs.remove(v); g.advance(0.2);
      return { speed: +v.speed.toFixed(1) };
    }), type);
  }
}

if (only.includes('police')) {
  await run('police', () => [window.__soak('chase 3 stars 40s', () => {
    const g = VH.game, p = g.player;
    p.teleport(0, -250, 0); g.advance(0.5);
    g.police.setLevel(3, 'soak'); g.police._sawPlayer();
    const car = g.vehicles.spawn('vireo', p.pos.x + 4, p.pos.z, 0, { persistent: true });
    const d = g.vehicles._doorPoint(car, 1, 0.5, {});
    g.vehicles.beginEnter({ v: car, side: 1, x: d.x, z: d.z }); g.advance(1.2);
    car.input.accel = 1;
    g.advance(40);
    g.police.setLevel(5, 'soak'); g.advance(20);
    g.police.reset();
    return { level: g.police.level };
  })]);
}

if (only.includes('sky')) {
  await run('sky', () => {
    const g = VH.game, res = [];
    g.player.teleport(0, -250, 0); g.advance(1);
    for (const h of [0, 3, 5.5, 6.5, 9, 12, 15, 17.5, 18.5, 19.5, 21]) {
      for (const cl of [0, 0.5, 1]) {
        res.push(window.__soak(`time ${h} clouds ${cl}`, () => { g.environment.setTime(h); g.environment.setCloudCover(cl); g.advance(0.3); g.renderOnce(); }));
      }
    }
    return res;
  });
}

if (only.includes('places')) {
  const places = [['downtown', 0, -250], ['pier', 500, 0], ['airport', 100, -1190], ['fort', -1250, 0], ['area51', -1350, -1100], ['north', 60, -520], ['market', -330, -150], ['harbor', 300, 150]];
  for (const [name, x, z] of places) {
    await run('place', ([name, x, z]) => window.__soak(name, () => {
      const g = VH.game;
      g.player.teleport(x, z, 0); g.cameraRig.snapBehind(g.player);
      g.advance(20);
      g.renderOnce();
      if (!Number.isFinite(g.player.pos.y)) throw new Error('NaN y');
      return { y: +g.player.pos.y.toFixed(1), fps: g.fps };
    }), [name, x, z]);
  }
}

if (only.includes('long')) {
  // Ten simulated minutes in town with the weather director running: look for exceptions and for things that only ever grow.
  for (let i = 0; i < 10; i++) {
    await run('long', (i) => window.__soak('minute ' + (i + 1), () => {
      const g = VH.game;
      if (i === 0) { g.player.teleport(0, -250, 0); g.settings.set('gameplay.weather', 'auto'); }
      g.advance(60);
      g.renderOnce();
      const info = g.renderer.renderer.info;
      return { scene: g.scene.children.length, geos: info.memory.geometries, tex: info.memory.textures, agents: g.crowd.agents.length, cars: g.vehicles.list.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0 };
    }), i);
  }
}

if (only.includes('missions')) {
  const ids = await page.evaluate(() => Array.from(VH.game.missions.all.keys()));
  console.log(`missions (${ids.length})`);
  for (const id of ids) {
    await run('mission', (id) => window.__soak(id, () => {
      const g = VH.game, m = g.missions.all.get(id);
      g.police.reset();
      g.missions.start(m);
      g.advance(8);
      const run = g.missions.run;
      const info = { running: !!run, step: run && (run.stepIndex !== undefined ? run.stepIndex : run.i) };
      g.missions._abort = null; g.missions.cinematic = null; g.dialogue.stop();
      document.body.classList.remove('cutscene'); g.player.frozen = false; g.frozenControls = false;
      if (run) { g.missions._clearWaiters(run); g.missions._pass(run); }
      g.advance(2);
      g.missions.reset && 0;
      return info;
    }), id);
  }
}

await browser.close();
if (!args.html) fs.rmSync(html, { force: true });
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ` + problems.join('\n - ') : '\nSOAK OK');
process.exit(problems.length ? 1 : 0);
