# Mission format (as read from `missions.js` and the act files)

The original `docs/mission-format.md` was lost; this is reconstructed from the engine.
Missions are plain data in `src/js/data/story-*.js`, run by `src/js/missions.js`.

## A mission

```js
{ id: 'g01_cash_run', title: 'Cash Run', giver: 'rhea', start: 'kostas_salvage',
  time: 21, estMinutes: 8, summary: '...',
  reward: { money: 3500, weapons: ['smg'], armor: 100, unlock: ['x'] },   // paid on pass
  steps: [ ... ] }
```
- `start`: a place id (a marker you walk into and press E) or `'chain'`/`'auto'`/`'intro'` (starts by itself).
- Main story missions live in `story.missions` and run in order. **Side chains** are
  `S.side.push({ id, title, giver, unlockAfter: '<mission id>', missions: [...] })`: each
  mission requires the previous one, the first requires `unlockAfter`.
- Places, characters and factions (`halberd`, `kings`, `salts`, `vpd`) are in `data/story.js`.
  A faction sets the colours of the people spawned with `faction:`.

## Steps (first matching key decides the kind; extra keys are options)

| step | what it does |
|---|---|
| `scene: {at, cast}` + `say: [[who, line], ...]` | letterboxed cutscene (`'caption'` speaker = narration) |
| `say`, `phone`, `text`, `blackout`, `camera` | ambient line / call / text / title card / establishing shot |
| `spawnCar: id, type, at, color` | a mission car (`exact:true` skips lane-snapping) |
| `getIn: carId` | wait until Jay is in it |
| `goto: place`, `vehicle: bool`, `radius` | go to a place |
| `spawn: [{id, at, count, faction, weapon, behavior, group, char}]` | people; hostile if their faction is not civilian/crew. `behavior`: `guard`, `attack`, `patrol`, `idle`, `cower`, `flee`, `follow`, `drive` |
| `kill: group-or-id` | until they are all dead |
| `survive: seconds, waves: [{delay, at, count, faction, weapon}]` | hold out against waves |
| `collect: [places], item` | walk into cash pickups |
| `deliver: carId, to: place, timeLimit, maxDamage` | drive a car there (damage 0..1) |
| `chase: carId, mode: 'wreck'\|'catch', route: [places]` | a fleeing AI car |
| `follow`, `race`, `destroy`, `protect`, `join`/`leave` (crew) | see `missions.js` |
| `heat: n`, `loseHeat: true` | set the wanted level / wait until it is 0 |
| `timer: seconds` | applies to the next waiting step |
| `choice`, `if: flag, then, else`, `setFlag` | branching |
| `reward: {...}`, `music`, `setTime`, `fade`, `slowmo`, `teleport`, `wait` | misc |
| any step + `checkpoint: true` | a retry starts here |
| any step + `objective: 'text'` | the HUD objective |

Notes: put `reward` on the mission, not as a money step (it would pay twice).

## Step details (read from `missions.js`; the table above is the short version)

- **Where things are.** Any `at`/`goto`/`to`/`collect`/`route` value is resolved when the step
  starts, in this order: an actor id spawned earlier in this job (`spawn` ids; with `count > 1`
  the ids are `id_0`, `id_1`, ...), a car id from `spawnCar`, then a place: `story.places`
  (data/story.js) or the city's own (`places.js`: streets like `grand_avenue`, districts).
  A car or actor id means "where it is right now".
- **Silent failures.** An unknown place makes `goto`/`deliver`/`collect`/`chase`/`follow` return at
  once (the step is skipped, no error); an unknown car type spawns a `halcyon`; `kill` of a group
  that has nobody in it is skipped. `node tools/missiontest.mjs` reports all of these.
- `spawnCar`: snapped to the nearest lane/kerb within 40 m (100 m, in a lane facing the open road,
  if a later `chase`/`follow`/`behavior: 'drive'` gives it a driver). `exact: true` puts it exactly
  on the place (use it for a helicopter on a beach or in a lot), `offset: [dx, dz]`, `heading`,
  `locked` (Jay can't get in until a `getIn` names it), `name` (what the HUD calls it), `police`.
  Spawn the car where the job **starts** if Jay is meant to drive it there.
- `getIn: 'any'` waits for any car. `getIn` unlocks the car.
- `goto`: `vehicle: true` (any car), `'carId'` (that car), `false` (on foot); `radius` (default 7 in a
  car, 3.2 on foot); in a car Jay must also stop (speed < 2) unless `stop: false`. Rooftop places
  route through their `door` and fade up the stairs.
- `kill`: a group name, an id, `'group:x'`, or a list; `count` kills fewer than all.
- `survive`: lasts `survive` seconds whatever happens; wave enemies arrive 25–45 m out, out of
  sight; whoever is left runs off when it ends.
- `collect`: one cash pickup per entry; picked up within 1.4 m on foot, 3 m in a car. Don't put
  one where a car will be: `collect: ['someCar']` puts it inside the car (out of reach). Loot from
  a wreck: spawn the crew beside the wreck and `collect` at their ids (see g04), after a `wait`
  so the wreck has stopped rolling.
- `deliver`: done when the car is within 7 m of `to` and nearly stopped (speed < 2), Jay driving.
  Fails when it is wrecked or below `1000 * (1 - maxDamage)` health (`maxDamage` default 0.6).
  `timeLimit` starts a countdown. Works for aircraft too (hover/land within 7 m).
- `chase`: ends when the car is wrecked or under 60 health (`mode: 'wreck'`), or boxed in /
  below 300 (`mode: 'catch'`, the car is left drivable). After `giveUpAfter` seconds on its tail
  (default 60) it pulls over. More than `escape` m away (default 260) for 6 s fails the job.
  A `bulwark` takes 45 % damage: expect the give-up to end most van chases.
- `destroy`: a parked car must be wrecked; a driven one also counts once its driver is dead or out.
- `heat: n` sets the wanted level; `loseHeat` waits for 0. A job **can't start** while the level is
  above 0. Order matters: put `loseHeat` *before* the `deliver` home if the text says "don't lead
  them back".
- `timer: s` applies to the next waiting step (`survive` keeps its own).
- `wait: s` pauses the job (simulated seconds).
- `scene`: Jay gets out of any car first; a scene more than 40 m away cuts (fades) there.
- `failIf: ['dead:id', 'wrecked:carId', 'left:id', 'heat']` on the mission fails it on those.
- `reward`: `money`, `armor`, `weapons` (ids from `weapons-data.js`: fists bat knife pistol revolver
  smg shotgun rifle sniper grenade molotov), `unlock: [x]` sets the flag `unlocked:x` (nothing
  reads these yet; they are for later content).

## Testing a mission: `tools/missiontest.mjs`

```sh
node tools/missiontest.mjs g01_cash_run [g02_package_run ...] [--timeout 900] [--chunk 0.25] [--quiet] [--allow-warnings] [--html built.html]
```
Builds `src/` to a temp file, opens it in headless Chromium (same setup as `shots.mjs`) and, per
mission: a new game (`noAutoStory`/`noAutoSave`), the prerequisites marked completed, the job
started; then it plays it. Each tick skips any dialogue/choice, does what the current step asks
(teleports Jay or his car to `goto`/`deliver`, gets him into the car via `vehicles.beginEnter`,
kills `kill`/`survive` targets with `agent.damage`, explodes `chase`/`destroy` cars after letting a
chased car drive for 6 s, walks onto `collect` pickups, sets the police level to 0 for
`loseHeat`, takes option 1 of a `choice`) and advances 0.25 s of simulated time. Jay is in god
mode and can't be arrested. It prints each step (`step 3  goto  Drive to ...`) and
`PASS <id>` when `completed[id]` is set, or `FAIL` with the step it was stuck on / the engine's
fail reason. Warnings that fail the run too:
- `[data]` unknown places, car types, factions, cast, weapons, steps with no known kind, ids
  that no earlier `spawnCar`/`spawn` made;
- `[play]` what teleporting would hide: the car for a `getIn` spawned >120 m from Jay on foot, a
  `goto` that is already reached, a step the engine skips, a chased car that doesn't move, a
  pickup under a wreck or a locked car.

Exit code 1 on any FAIL or `[pageerror]`. All six Street Money jobs pass. It checks the logic
and the data, not the driving: look at the places with `tools/shots.mjs` (`--quality high`).

**Why driving a mission with one long `advance()` gets stuck** (e.g. a `shots.mjs` `pre` that starts a
job and a big `settle`): every step is `await`ed, and an `await` continues in a microtask, which only
runs after the synchronous `page.evaluate` returns, so one evaluate moves each chain on by at most
one wait. Dialogue lines are timed on the wall clock (`performance.now()`), not simulated time,
and `dialogue.update()` adds any gap over 250 ms between calls back onto the line, so time spent
between evaluates never counts: a `scene` sits on its first line. Patching `_scene` or
`dialogue.play` after `missions.start()` is too late for step 0 (start runs synchronously into the
first step). `advance()` also only updates missions while `state === 'playing'` (the intro lasts
2.2 s after `newGame()`). The harness calls a short `advance()` per evaluate and skips dialogue by
finishing each line itself (`d.current.i = d.current.lines.length; d._line()`).
