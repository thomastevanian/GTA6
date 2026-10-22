# Work in progress (NOT applied)

Unfinished work saved at the end of the 2026-10-22 session so it isn't lost with the
container. None of it is in the game. Apply with `git apply docs/wip/<file>.patch`, then
finish and test it.

- `tank-gunner.patch`: AI tank crew for 5-star police (tank.js `_aiGun`, police.js sends
  one Bastion at 5 stars, a proximity fuse for AI shells in aircraft.js). **Known bug:** the
  gun pitch pins at its lower limit and the shells overshoot; debug `_aiGun` pitch maths and
  `_pivot()` before shipping.
- `aircraft-pelican-mule.patch`: a helper's unfinished seaplane (`pelican`) and twin-rotor
  heli (`mule`) in aircraft.js, plus parking spots. Never smoke-tested.
- `missions-harness.patch`: a helper's unfinished `tools/missiontest.mjs` (drives a mission
  to completion headless) and edits to `story-gangs.js` / `docs/MISSIONS.md`. Never run to
  completion; review the story-gangs.js changes carefully.
