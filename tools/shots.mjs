// Headless screenshot / smoke-test harness for Vicehaven (software WebGL).
//
//   node tools/shots.mjs --scenario shots.json [--out shots] [--quality high] [--html index.html]
//
// By default it builds src/ into a temp file first, so you always test your
// working tree. A scenario is a JSON array of shots:
//   { "name": "plaza",            file name (png) inside --out
//     "tp": [x, z], "heading": 0, put Jay there (heading in radians, 0 = facing -z/north? see camera)
//     "time": 17.2,               hour of day 0-24
//     "clouds": 0.4,              cloud cover 0-1
//     "hud": false,               hide the HUD (default: shown)
//     "cam": {"pos":[x,y,z], "look":[x,y,z], "fov":60},   free camera instead of the follow camera
//     "pre": "js to eval in the page before the shot (VH.game is the game)",
//     "settle": 1.5 }             seconds of simulated time before the shot
// Console errors and page exceptions are printed; the exit code is 1 if any
// page exception happened.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
if (!args.scenario) { console.error('usage: node tools/shots.mjs --scenario file.json [--out dir] [--quality low|medium|high|ultra] [--html built.html]'); process.exit(2); }

let html = args.html;
if (!html) {
  html = path.join(os.tmpdir(), `vicehaven-test-${process.pid}.html`);
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

const outDir = path.resolve(args.out || 'shots');
fs.mkdirSync(outDir, { recursive: true });
const scenario = JSON.parse(fs.readFileSync(args.scenario, 'utf8'));
const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +args.width || 1280, height: +args.height || 720 } });
let exceptions = 0;
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || (t === 'warning' && !/KHR_parallel/.test(m.text()))) console.log('[console]', t, m.text().slice(0, 500));
});
page.on('pageerror', (e) => { exceptions++; console.log('[pageerror]', String(e).slice(0, 800)); });
await page.goto('file://' + html);
await page.waitForFunction(() => window.VH && VH.game && VH.game.state === 'title', null, { timeout: 120000 });
if (args.quality && args.quality !== true) await page.evaluate((q) => VH.settings.applyPreset(q), args.quality);
await page.evaluate(() => {
  const g = VH.game;
  g.noAutoStory = true; g.noAutoSave = true;
  g.newGame(); g.advance(3);
  g.environment.clockRunning = false;
  g.freeze(true); // stop the live render loop: software WebGL is slow, we draw only the shots
});
for (const s of scenario) {
  const t0 = Date.now();
  const note = await page.evaluate((s) => {
    const g = VH.game, p = g.player;
    if (s.pre) (0, eval)(s.pre);
    if (s.time !== undefined) g.environment.setTime(s.time);
    if (s.clouds !== undefined) g.environment.setCloudCover(s.clouds);
    if (s.tp) { p.teleport(s.tp[0], s.tp[1], s.heading || 0); g.cameraRig.snapBehind(p); }
    g.hud.show(s.hud !== false);
    g.advance(s.settle === undefined ? 1.5 : s.settle);
    if (s.cam) {
      g.world.update(1, new THREE.Vector3(...s.cam.pos));
      g.environment.update(0, p.renderPos);
      const cam = g.renderer.camera;
      cam.position.set(...s.cam.pos); cam.lookAt(...s.cam.look);
      if (s.cam.fov) { cam.fov = s.cam.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(true);
      g.renderer.render(g.scene, 1 / 60); // twice: the first primes temporal effects (motion blur)
      g.renderer.render(g.scene, 1 / 60);
    } else { g.renderOnce(); g.renderOnce(); }
    if (s.post) return (0, eval)(s.post);
  }, s);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, `${s.name}.png`), timeout: 120000 });
  console.log(s.name, ((Date.now() - t0) / 1000).toFixed(1) + 's', note === undefined ? '' : JSON.stringify(note));
}
await browser.close();
if (!args.html) fs.rmSync(html, { force: true });
process.exit(exceptions ? 1 : 0);
