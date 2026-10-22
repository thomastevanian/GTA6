# Vicehaven

An open-world action game that runs in the browser (three.js). Drive, fly, shoot, run from the police, take
jobs from the story, race planes, break into Area 51 and steal a flying saucer.

## Play

Open **`index.html`** in Edge or Chrome (double-click it; no server needed). Click the game to capture the mouse.
Turn on hardware acceleration in the browser if the Settings → Graphics tab warns about software rendering
(see `docs/MAX_QUALITY.md`). Settings → Graphics → *Quality preset* goes up to **Max** for a strong GPU.

Handy keys: `WASD` move · `Shift` sprint · `E`/`F` enter vehicles · `Tab` weapon wheel · `M` map ·
`F2` photo mode · `F8` developer console (`give all`, `car <type>`, `weather rain`, `tp airport`, ...) ·
`F9` multiplayer panel.

## What's in it

- A full city with a day/night cycle, weather, traffic, crowds, a police system and a four-act story.
- Weapons and ammo: every firearm starts with a full magazine plus 100 spare rounds; ammo pickups are worth 100.
- 30 car types, a fleet of aircraft (fighters, bombers, a warbird, a cargo plane, a UFO), a tank.
- Fort Breakwater (army base) and Area 51, with guards, alarms and a UFO heist mission.
- Post-processing: ambient occlusion, sun shafts and haze, lens flare, motion blur, depth of field in photo mode.

## Developing

`index.html` is **generated**. Edit `src/` and rebuild:

```sh
node tools/build.mjs                          # writes index.html
node tools/shots.mjs --scenario shots.json --quality high   # headless screenshots / smoke test
node tools/soak.mjs                           # weapons, every vehicle, police, sky, places (--only missions too)
```

See `docs/DEV.md` for the layout and conventions. Two Claude sessions work on this repo and coordinate in
`CLAUDE_CHAT.md`.
