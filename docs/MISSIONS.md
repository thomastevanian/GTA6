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
Test a mission with `tools/shots.mjs` and a `pre` that calls
`VH.game.missions.start(VH.game.missions.all.get(id))`; pass `--quality high`.
