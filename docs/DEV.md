# Vicehaven developer notes

`index.html` at the repo root is the **built** single-file game (double-click it to play).
Never edit it by hand: edit `src/` and run `node tools/build.mjs`.

## Layout

- `src/index.html` – page template. Every `<script data-src="js/x.js">` / `<style data-src="css/x.css">` block contains one
  `@@include js/x.js` line that the build replaces with `src/js/x.js`. **Script order = dependency order.**
  To add a file: create it in `src/js/`, then add a `<script data-src="js/new.js">` / `@@include js/new.js` / `</script>` block at the right spot.
- `src/js/*.js` – classic scripts (no modules) that each add themselves to the global `VH` namespace (`VH.Foo = ...`).
  three.js r186 is global `THREE` (`src/js/lib/three.min.js`, an IIFE build; no examples/addons are available).
- `tools/build.mjs [out.html]` – bundles `src/` into `index.html` (or `out.html`).
- `tools/shots.mjs` – headless screenshots + smoke test (see below).

## Useful entry points

- `VH.game` – the game singleton: `.scene .renderer (VH.Renderer; .renderer.renderer is the THREE.WebGLRenderer, .post the PostFX) .environment .world .player .vehicles .combat .fx .cameraRig .hud`.
- Test hooks in `main.js`: `game.noAutoStory`, `game.noAutoSave`, `game.newGame()`, `game.advance(seconds)` (simulate without rendering), `game.renderOnce()`.
- Developer console in game: F8, then Enter to type a command: `tp <x> <z>`, `tp airport|fort|pier|...`, `car <type>`, `give all`, `noclip`, `god`, `time <h>`, `clouds <0-1>`, `quality <low|medium|high|ultra>`; see `debug.js`.
- World: x runs east (the sea is at x > ~250), z runs south (the airport is at z ≈ -1200, i.e. north), Fort Breakwater is west at x ≈ -1300. Heading 0 faces +z? Check `player.js` – test with a screenshot.
- Settings/quality presets: `settings.js` (`VH.SETTINGS_PRESETS`, shadow tiers). Postfx level `effects: 'low'` skips the whole HDR chain.

## Testing changes

**Always pass `--quality high` (or `max`).** The headless browser reports a software GPU, so the game's first-visit auto-detect picks the Low preset (no shadows, no post-processing) and your screenshots would not show what players see.

```sh
node tools/shots.mjs --scenario my-shots.json --out shots --quality high
```
Scenario = JSON array, see the comment at the top of `tools/shots.mjs`. It builds `src/` to a temp file, loads it in headless
Chromium with software WebGL (slow: ~5-15 s per shot), starts a new game and walks through the shots. Look at the PNGs.
Page exceptions fail the run. Always check there are no new `[pageerror]` / `[console] error` lines.

## Conventions

- Match the surrounding style (2-space indent, `'use strict'` IIFEs, JSDoc-ish header comment on every file).
- Keep per-frame allocations out of update loops; reuse temp vectors.
- Anything heavy must respect the quality presets in `settings.js` (low/medium/high/ultra) and `effects: 'low'` (no post-processing).
- New gameplay/visual features should degrade gracefully: wrap optional systems so a failure doesn't stop the game from booting.

## People (`humanoid.js`)

Everyone (Jay, pedestrians, cops, soldiers) is a `VH.Humanoid`: the same 14-joint rig, bodies built from smooth lofted
parts (see the header of `humanoid.js`). A *look* is data; besides the colours (`skin hair top trim shirt bottom shoes`) it
may carry `hairStyle` (bald short long buzz pony afro mohawk bob), `hat` (cap helmet beanie police bandana), `outfit`
(tee shirt jacket hoodie tank cop soldier polo), `bottomStyle` (jeans shorts skirt), `shoeStyle` (sneaker boot dress),
`beard`, `mustache`, `glasses` (`true` or `'sun'`), `tattoo`. Looks without them get a stable variety derived from their
colours and the faction (`police`, `army`, anything else non-civilian = thug), see `Humanoid.styleOf`.
Jay is built into a few vertex-coloured meshes; the crowd uploads the whole blueprint once (`Humanoid.crowdBlueprint`) and
hides the features an instance lacks in the vertex shader (`Humanoid.crowdShader`). Face detail is only drawn within 24 m.
