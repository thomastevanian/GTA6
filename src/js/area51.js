/*
 * area51.js — Area 51, the secret desert research base (OWNER: Account B).
 *
 * A fenced desert compound west of the airport, reached by a road from the
 * end of the airport taxiway: a checkpoint, a 620 m runway, three hangars
 * (the middle one holds a recovered flying saucer), two laboratories, a
 * control tower, radar dishes, fuel tanks and a bunker with a blast door.
 * The contract is the same as fort.js / airfield.js:
 *
 *   VH.Area51.build(world, layout)       static, world build time: geometry,
 *                                        colliders, signs. Returns the data
 *                                        stored as world.area51.
 *   VH.Area51.registerPlaces(world, p)   named places for the GPS / map.
 *   new VH.Area51(game)                  runtime: guards (spawned while Jay
 *        .update(dt)                     is near), the restricted area with
 *        .reset() .stop() .blips()       its warning and alarm, the parked
 *                                        aircraft, the spinning radars.
 *
 * Rules: walking (driving, flying low) inside the fence gets a warning and
 * three seconds to leave; stay, shoot or steal and the alarm goes: the
 * guards open fire and the police come at four stars. Killing a guard
 * counts for four. It builds with the fort's kit (Fort.kit).
 *
 * Reserved ground: layout.zones.area51 (citygen.js), x -1600..-1100,
 * z -1750..-480 — no outskirts trees are planted inside it.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const F = () => VH.COLLIDE;

  // ---------------------------------------------------------------- plan
  const BASE = { x0: -1560, x1: -1110, z0: -1700, z1: -1030, h: 3 };
  const GATE = { z0: -1377, z1: -1353 };
  const CENTER = { x: -1335, z: -1365 };
  const RUNWAY = { x: -1500, w: 34, z0: -1680, z1: -1060 };
  const HANGARS = [-1640, -1560, -1480].map((z) => ({ x0: -1462, x1: -1400, z0: z, z1: z + 50, h: 13 }));
  const LABS = [{ x0: -1340, x1: -1270, z0: -1440, z1: -1392, h: 9 }, { x0: -1340, x1: -1270, z0: -1338, z1: -1290, h: 9 }];
  const CONTROL = { x: -1250, z: -1230 };
  const DISHES = [[-1240, -1520], [-1190, -1490]];
  const BUNKER = { x0: -1210, x1: -1160, z0: -1650, z1: -1612, h: 6 };
  const FUEL = [[-1180, -1090], [-1160, -1090]];
  const SAUCER = { x: -1431, z: -1535 };
  const TOWERS = [[-1552, -1692], [-1552, -1038], [-1118, -1692], [-1118, -1038], [-1118, -1397], [-1118, -1333], [-1335, -1692], [-1335, -1038]];
  const TOWER_Y = 8;
  const SAND = 0xcdb88a;

  const K = () => VH.Fort.kit;

  /** A chain-link fence with a wire top (split into chunk-sized pieces). */
  function fence(world, x0, z0, x1, z1) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const fixed = alongX ? z0 : x0;
    const t = 0.1;
    const mesh = VH.col(0x8f969c);
    const post = VH.col(0x4d5258);
    for (let p = a0; p < a1; p += 48) {
      const q = Math.min(a1, p + 48);
      const r = alongX ? [p, fixed - t, q, fixed + t] : [fixed - t, p, fixed + t, q];
      const ctx = world.ctxAt((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
      ctx.prop.box(r[0], 0.3, r[1], r[2], BASE.h, r[3], mesh);
      ctx.prop.box(r[0], BASE.h, r[1], r[2], BASE.h + 0.12, r[3], post);
      for (let s = p; s <= q; s += 6) {
        const x = alongX ? s : fixed;
        const z = alongX ? fixed : s;
        ctx.prop.box(x - 0.1, 0, z - 0.1, x + 0.1, BASE.h + 0.6, z + 0.1, post);
        // Outward-leaning barbed arms.
        ctx.prop.box(x - 0.05, BASE.h + 0.3, z - 0.05, x + 0.05, BASE.h + 0.65, z + 0.05, post);
      }
    }
    if (alongX) world.physics.addBox(a0, 0, fixed - t, a1, BASE.h + 1, fixed + t, 'wall', F().ALL);
    else world.physics.addBox(fixed - t, 0, a0, fixed + t, BASE.h + 1, a1, 'wall', F().ALL);
  }

  /** A grey guard tower: four legs, a platform with a parapet, a roof and a searchlight. */
  function guardTower(world, x, z) {
    const ctx = world.ctxAt(x, z);
    const steel = VH.col(0x565c63);
    const grey = VH.col(0x7b8189);
    const y = TOWER_Y;
    for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
      ctx.prop.box(x + dx - 0.15, 0, z + dz - 0.15, x + dx + 0.15, y, z + dz + 0.15, steel);
      world.physics.addBox(x + dx - 0.15, 0, z + dz - 0.15, x + dx + 0.15, y, z + dz + 0.15, 'pole', F().ALL);
    }
    ctx.prop.box(x - 2.2, y - 0.25, z - 2.2, x + 2.2, y, z + 2.2, grey, { bottom: true });
    world.physics.addBox(x - 2.2, y - 0.25, z - 2.2, x + 2.2, y, z + 2.2, 'platform', F().ALL);
    for (const [a, b, c, d] of [[-2.2, -2.2, 2.2, -2.05], [-2.2, 2.05, 2.2, 2.2], [-2.2, -2.2, -2.05, 2.2], [2.05, -2.2, 2.2, 2.2]]) {
      ctx.prop.box(x + a, y, z + b, x + c, y + 1.1, z + d, grey);
      world.physics.addBox(x + a, y, z + b, x + c, y + 1.1, z + d, 'parapet', F().SOLID | F().CAMERA);
    }
    for (const [dx, dz] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) ctx.prop.box(x + dx - 0.06, y, z + dz - 0.06, x + dx + 0.06, y + 2.6, z + dz + 0.06, steel);
    ctx.prop.box(x - 2.6, y + 2.6, z - 2.6, x + 2.6, y + 2.85, z + 2.6, grey, { bottom: true });
    ctx.screen.box(x - 0.35, y + 1.3, z - 0.35, x + 0.35, y + 1.7, z + 0.35, VH.col(0xf4f7ff, 1.8));
  }

  /** An open-fronted hangar (the open side faces the runway, -x). */
  function hangar(world, h, i) {
    const k = K();
    const ctx = world.ctxAt((h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2);
    const wall = 0xb9bcc0;
    k.pave(world, h.x0 - 8, h.z0 - 4, h.x1, h.z1 + 4, 0x9c9a92, 0.016);
    k.solid(world, ctx.prop, h.x1 - 0.8, 0, h.z0, h.x1, h.h, h.z1, wall, null, 'building');
    k.solid(world, ctx.prop, h.x0, 0, h.z0, h.x1, h.h, h.z0 + 0.8, wall, null, 'building');
    k.solid(world, ctx.prop, h.x0, 0, h.z1 - 0.8, h.x1, h.h, h.z1, wall, null, 'building');
    ctx.prop.box(h.x0 - 1.2, h.h - 1.6, h.z0 - 0.4, h.x1 + 0.4, h.h, h.z1 + 0.4, VH.col(0x6b727a)); // roof (no collider: things spawn and park inside)
    ctx.screen.box(h.x0 + 4, h.h - 1.8, h.z0 + 4, h.x1 - 4, h.h - 1.7, h.z0 + 5, VH.col(0xfff4dc, 2.0)); // strip lights
    ctx.screen.box(h.x0 + 4, h.h - 1.8, h.z1 - 5, h.x1 - 4, h.h - 1.7, h.z1 - 4, VH.col(0xfff4dc, 2.0));
    ctx.prop.box(h.x1 - 0.85, 4.5, h.z0 + 8, h.x1 - 0.8, 7, h.z1 - 8, VH.col(0x2b2f36)); // dark back panel
    (world.signs || (world.signs = [])).push({ x: h.x0 - 1.3, y: h.h - 3.2, z: (h.z0 + h.z1) / 2, yaw: -Math.PI / 2, w: 12, h: 1.6, lines: ['HANGAR ' + (i + 1)], style: 'monolith' });
  }

  /** The recovered flying saucer, resting on three legs in the middle hangar. */
  function saucer(world, s) {
    const ctx = world.ctxAt(s.x, s.z);
    const hull = VH.col(0xb6bdc6);
    const dark = VH.col(0x6a727c);
    for (const a of [0, 2.094, 4.189]) {
      const lx = s.x + Math.cos(a) * 4.8;
      const lz = s.z + Math.sin(a) * 4.8;
      ctx.prop.box(lx - 0.2, 0, lz - 0.2, lx + 0.2, 1.4, lz + 0.2, dark);
      ctx.prop.box(lx - 0.6, 0, lz - 0.6, lx + 0.6, 0.12, lz + 0.6, dark);
    }
    ctx.prop.cylinder(s.x, 1.3, s.z, 3.2, 7.2, 0.9, 28, hull, true, dark);
    ctx.prop.cylinder(s.x, 2.2, s.z, 7.6, 7.6, 0.35, 28, VH.col(0x8d96a1), true, VH.col(0x8d96a1));
    ctx.prop.cylinder(s.x, 2.55, s.z, 7.2, 3.4, 1.0, 28, hull, true, hull);
    ctx.prop.cylinder(s.x, 3.55, s.z, 3.4, 2.4, 0.5, 20, dark, true, dark);
    ctx.prop.cylinder(s.x, 4.05, s.z, 2.4, 1.0, 0.6, 16, VH.col(0x9fd6e8), true, VH.col(0x9fd6e8));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const gx = s.x + Math.cos(a) * 7.62;
      const gz = s.z + Math.sin(a) * 7.62;
      ctx.screen.box(gx - 0.15, 2.3, gz - 0.15, gx + 0.15, 2.5, gz + 0.15, VH.col(0x7dffb2, 2.6));
    }
    // A scorch mark and a few warning cones.
    k_mark(world, s.x - 9, s.z - 9, s.x + 9, s.z + 9, 0x2c2a26, 0.02);
    world.physics.addBox(s.x - 7.5, 0, s.z - 7.5, s.x + 7.5, 4.7, s.z + 7.5, 'building', F().ALL);
  }

  function k_mark(world, x0, z0, x1, z1, color, y) {
    K().mark(world, x0, z0, x1, z1, color, y);
  }

  /** A radar mast; the dish itself is a runtime object (it turns). */
  function radarMast(world, x, z) {
    const ctx = world.ctxAt(x, z);
    ctx.concrete.box(x - 2, 0, z - 2, x + 2, 1, z + 2, VH.col(0xa9a69d));
    ctx.prop.box(x - 0.4, 1, z - 0.4, x + 0.4, 13, z + 0.4, VH.col(0xcfd3d6));
    world.physics.addBox(x - 2, 0, z - 2, x + 2, 13, z + 2, 'building', F().ALL);
  }

  // ----------------------------------------------------------- guards
  // The Area 51 guards: black fatigues, same behaviour as the fort's soldiers.
  const GUARD_LOOK = { hair: 0x16110d, top: 0x23272d, trim: 0x23272d, shirt: 0x2c3138, bottom: 0x23272d, shoes: 0x0e0e0e, cap: true, longHair: false, height: 1.02, build: 1.08 };

  // ============================================================ Area 51
  class Area51 {
    static build(world, layout) {
      const k = K();
      const data = { base: BASE, gate: GATE, runway: RUNWAY, hangars: HANGARS, labs: LABS, control: CONTROL, dishes: DISHES, bunker: BUNKER, fuel: FUEL, saucer: SAUCER, towers: TOWERS };
      layout.area51 = data;
      // Desert ground inside the fence, the runway, the access road.
      k.pave(world, BASE.x0, BASE.z0, BASE.x1, BASE.z1, SAND, 0.008);
      k.asphalt(world, RUNWAY.x - RUNWAY.w / 2, RUNWAY.z0, RUNWAY.x + RUNWAY.w / 2, RUNWAY.z1, 0x7d7d7d);
      for (let z = RUNWAY.z0 + 30; z < RUNWAY.z1 - 30; z += 36) k.mark(world, RUNWAY.x - 0.4, z, RUNWAY.x + 0.4, z + 20, 0xf4f4ef);
      k.mark(world, RUNWAY.x - RUNWAY.w / 2 + 1, RUNWAY.z0, RUNWAY.x - RUNWAY.w / 2 + 1.7, RUNWAY.z1, 0xf4f4ef);
      k.mark(world, RUNWAY.x + RUNWAY.w / 2 - 1.7, RUNWAY.z0, RUNWAY.x + RUNWAY.w / 2 - 1, RUNWAY.z1, 0xf4f4ef);
      for (let z = RUNWAY.z0; z <= RUNWAY.z1; z += 60) for (const x of [RUNWAY.x - RUNWAY.w / 2 - 1.2, RUNWAY.x + RUNWAY.w / 2 + 1.2]) {
        world.ctxAt(x, z).screen.box(x - 0.12, 0.1, z - 0.12, x + 0.12, 0.3, z + 0.12, VH.col(0xfff4dc, 2.2));
      }
      k.asphalt(world, RUNWAY.x + RUNWAY.w / 2, GATE.z0, BASE.x1 + 26, GATE.z1, 0x8a8a8a); // the main road, gate to runway
      k.asphalt(world, BASE.x1 + 26, GATE.z0, -960, GATE.z1, 0x8a8a8a); // out to the airport taxiway
      k.asphalt(world, CONTROL.x - 8, -1365 + 12, CONTROL.x + 8, CONTROL.z - 8, 0x8a8a8a);
      // The fence and the gate.
      fence(world, BASE.x0, BASE.z0, BASE.x1, BASE.z0);
      fence(world, BASE.x0, BASE.z1, BASE.x1, BASE.z1);
      fence(world, BASE.x0, BASE.z0, BASE.x0, BASE.z1);
      fence(world, BASE.x1, BASE.z0, BASE.x1, GATE.z0);
      fence(world, BASE.x1, GATE.z1, BASE.x1, BASE.z1);
      const gctx = world.ctxAt(BASE.x1, CENTER.z);
      k.solid(world, gctx.prop, BASE.x1 - 9, 0, GATE.z1 + 2, BASE.x1 - 3, 3, GATE.z1 + 7, 0xc5c8cc, null, 'building');
      gctx.screen.box(BASE.x1 - 3.02, 1.2, GATE.z1 + 2.6, BASE.x1 - 2.98, 2.3, GATE.z1 + 6.4, VH.col(0xfff1d8, 1.0));
      gctx.prop.box(BASE.x1 - 9.3, 3, GATE.z1 + 1.7, BASE.x1 - 2.7, 3.3, GATE.z1 + 7.3, VH.col(0x565c63), { bottom: true });
      gctx.prop.box(BASE.x1 + 1.2, 0, GATE.z1 - 0.4, BASE.x1 + 1.8, 1.1, GATE.z1 + 0.2, VH.col(0xe0b12e));
      gctx.prop.box(BASE.x1 + 1.43, 1.0, GATE.z1 - 0.2, BASE.x1 + 1.57, 9, GATE.z1 - 0.06, VH.col(0xd8262e)); // barrier, up
      for (let z = GATE.z0 + 1; z < GATE.z1 - 0.5; z += 2.4) gctx.prop.box(BASE.x1 + 8, 0, z, BASE.x1 + 8.6, 0.25, z + 1.2, VH.col(0xe0b12e));
      const signs = world.signs || (world.signs = []);
      signs.push({ x: BASE.x1 + 0.35, y: 2.4, z: GATE.z0 - 16, yaw: Math.PI / 2, w: 12, h: 3, lines: ['AREA 51', 'RESTRICTED AREA', 'NO PHOTOGRAPHY'], style: 'brand' });
      signs.push({ x: BASE.x1 + 0.35, y: 2.4, z: GATE.z1 + 16, yaw: Math.PI / 2, w: 12, h: 3, lines: ['WARNING', 'USE OF DEADLY FORCE', 'AUTHORISED'], style: 'brand' });
      for (const [x, z] of TOWERS) guardTower(world, x, z);
      // Hangars and the saucer.
      HANGARS.forEach((h, i) => hangar(world, h, i));
      saucer(world, SAUCER);
      // Laboratories.
      LABS.forEach((l, i) => {
        k.block(world, l.x0, l.z0, l.x1, l.z1, l.h, i ? 0xd6dadd : 0xcfd4d8, 2, 41 + i);
        signs.push({ x: (l.x0 + l.x1) / 2, y: l.h - 1.8, z: i ? l.z0 - 0.12 : l.z1 + 0.12, yaw: i ? Math.PI : 0, w: 12, h: 1.4, lines: [i ? 'LEVEL 4 · BIOLOGY' : 'LEVEL 4 · PROPULSION'], style: 'monolith' });
      });
      // The control tower: shaft, glass cab, a beacon.
      const tctx = world.ctxAt(CONTROL.x, CONTROL.z);
      tctx.concrete.box(CONTROL.x - 3, 0, CONTROL.z - 3, CONTROL.x + 3, 16, CONTROL.z + 3, VH.col(0xc9ccd0));
      tctx.prop.box(CONTROL.x - 5, 16, CONTROL.z - 5, CONTROL.x + 5, 16.6, CONTROL.z + 5, VH.col(0x565c63), { bottom: true });
      tctx.screen.box(CONTROL.x - 4.6, 16.6, CONTROL.z - 4.6, CONTROL.x + 4.6, 19, CONTROL.z + 4.6, VH.col(0x9fd6e8, 0.9));
      tctx.prop.box(CONTROL.x - 5.2, 19, CONTROL.z - 5.2, CONTROL.x + 5.2, 19.5, CONTROL.z + 5.2, VH.col(0x565c63), { bottom: true });
      tctx.screen.box(CONTROL.x - 0.3, 19.6, CONTROL.z - 0.3, CONTROL.x + 0.3, 20.4, CONTROL.z + 0.3, VH.col(0xff3030, 2.6));
      world.physics.addBox(CONTROL.x - 3, 0, CONTROL.z - 3, CONTROL.x + 3, 20, CONTROL.z + 3, 'building', F().ALL);
      // Radar masts, fuel tanks, the bunker.
      for (const [x, z] of DISHES) radarMast(world, x, z);
      world.area51Radars = DISHES.map(([x, z]) => ({ x, y: 13, z }));
      for (const [x, z] of FUEL) {
        const ctx = world.ctxAt(x, z);
        ctx.prop.cylinder(x, 0, z, 6, 6, 8, 20, VH.col(0xd0d3d6), true, VH.col(0xb6b9bc));
        world.physics.addBox(x - 5, 0, z - 5, x + 5, 8, z + 5, 'tank', F().ALL);
      }
      const bctx = world.ctxAt((BUNKER.x0 + BUNKER.x1) / 2, (BUNKER.z0 + BUNKER.z1) / 2);
      for (let i = 0; i < 4; i++) bctx.concrete.box(BUNKER.x0 - i * 2.5, 0, BUNKER.z0 - i * 1.5, BUNKER.x1 + i * 2.5, BUNKER.h - i * 1.4, BUNKER.z1 + i * 1.5, VH.col(i % 2 ? 0x9a978d : 0xa8a59a), { skip: { s: i > 0, n: i > 0 } });
      bctx.prop.box(BUNKER.x1 - 0.05, 0, (BUNKER.z0 + BUNKER.z1) / 2 - 3, BUNKER.x1 + 0.4, 5, (BUNKER.z0 + BUNKER.z1) / 2 + 3, VH.col(0x2b2f36)); // blast door
      world.physics.addBox(BUNKER.x0 - 7.5, 0, BUNKER.z0 - 4.5, BUNKER.x1 + 7.5, BUNKER.h, BUNKER.z1 + 4.5, 'building', F().ALL);
      signs.push({ x: BUNKER.x1 + 0.6, y: 6.2, z: (BUNKER.z0 + BUNKER.z1) / 2, yaw: Math.PI / 2, w: 8, h: 1.2, lines: ['SUBLEVEL 3 · NO ACCESS'], style: 'monolith' });
      // Clutter and light.
      k.crates(world, -1385, -1180, 8, 51);
      k.crates(world, -1300, -1580, 6, 52);
      k.sandbags(world, BASE.x1 - 16, GATE.z0 - 8, Math.PI / 2);
      k.sandbags(world, BASE.x1 - 16, GATE.z1 + 12, Math.PI / 2);
      for (const [x, z] of [[-1190, -1365], [-1335, -1200], [-1335, -1530], [-1400, -1420], [-1400, -1300], [-1200, -1220], [-1200, -1480]]) k.floodMast(world, x, z, 34);
      return data;
    }

    static registerPlaces(world, places) {
      if (!world.area51) return;
      places.add('area51_gate', { name: 'The gate of Area 51', x: BASE.x1 + 30, z: GATE.z1 + 14, yaw: -Math.PI / 2, kind: 'fort', district: 'fort' });
      places.add('area51_hangar', { name: 'Hangar 2, Area 51', x: -1396, z: SAUCER.z, yaw: -Math.PI / 2, kind: 'fort', district: 'fort' });
      places.add('area51_runway', { name: 'The runway, Area 51', x: RUNWAY.x + RUNWAY.w / 2 + 6, z: -1500, yaw: -Math.PI / 2, kind: 'fort', district: 'fort' });
    }

    // ------------------------------------------------------------ runtime
    constructor(game) {
      this.game = game;
      this.ok = !!game.world.area51;
      if (!this.ok) return;
      this.saveKey = null;
      this.guards = [];
      this.alarm = false;
      this.warn = -1;
      this._clearT = 0;
      this._sawT = 0;
      this._t = 0;
      this.spots = [];
      const add = (type, x, z, yaw, color) => {
        if (!VH.Vehicle.typeSpec(type)) return;
        this.spots.push(game.vehicles.addFixedSpot({
          type, x, z, yaw, color, r: type === 'bison' ? 13 : type === 'ufo' ? 10 : 8,
          onSpawn: (v) => {
            v.military = true;
          },
        }));
      };
      add('kestrel', RUNWAY.x + 24, RUNWAY.z0 + 90, 0, 0x9aa1a8);
      add('kestrel', RUNWAY.x + 24, RUNWAY.z0 + 120, 0, 0x9aa1a8);
      add('bison', RUNWAY.x + 28, RUNWAY.z0 + 180, 0, 0x4b5320);
      add('ufo', -1431, -1455, -Math.PI / 2, 0xb6bdc6);
      this._posts = Area51._posts();
      this._buildHud();
      this._buildAnimated();
      this._bind();
    }

    /** Where the guards stand or walk. */
    static _posts() {
      const posts = [
        { x: BASE.x1 - 6, z: GATE.z0 - 4, heading: Math.PI / 2 },
        { x: BASE.x1 - 6, z: GATE.z1 + 4, heading: Math.PI / 2 },
        { x: -1395, z: SAUCER.z - 20, heading: -Math.PI / 2 },
        { x: -1395, z: SAUCER.z + 20, heading: -Math.PI / 2 },
        { x: -1265, z: -1365, heading: Math.PI / 2 },
        { x: -1250, z: -1255, heading: 0 },
        { x: -1190, z: -1590, heading: Math.PI },
        { x: -1335, z: -1365, route: [[-1335, -1450], [-1335, -1280], [-1260, -1280], [-1260, -1450]] },
        { x: RUNWAY.x + 22, z: -1660, route: [[RUNWAY.x + 22, -1660], [RUNWAY.x + 22, -1080]] },
        { x: -1430, z: -1620, route: [[-1430, -1620], [-1430, -1420], [-1370, -1420], [-1370, -1620]] },
        { x: -1160, z: -1060, route: [[-1160, -1060], [-1160, -1180], [-1280, -1180], [-1280, -1060]] },
      ];
      for (const [x, z] of TOWERS) posts.push({ x, z, hold: true, tower: true, heading: Math.atan2(CENTER.x - x, CENTER.z - z) + Math.PI });
      return posts;
    }

    _bind() {
      VH.events.on('agent:died', (e) => {
        if (!this.ok || !e.agent || e.agent.faction !== 'area51' || e.source !== 'player') return;
        const pol = this.game.police;
        if (pol) {
          pol.crime('killSoldier', e.agent.pos.x, e.agent.pos.z);
          if (!(this.game.missions && this.game.missions.suppressHeat) && pol.level < 4) {
            pol.setLevel(4, 'military');
            pol._sawPlayer();
          }
        }
        this._raise();
      });
      VH.events.on('gunshot', (e) => {
        if (!this.ok || !e.byPlayer) return;
        if (this._inside(e.x, e.z, 40)) this._raise();
      });
      VH.events.on('agent:hurt', (e) => {
        if (this.ok && e.agent && e.agent.faction === 'area51' && e.source === 'player') this._raise();
      });
      VH.events.on('vehicle:enter', (e) => {
        if (!this.ok || !e.v.military || !e.v.fixedSpot || !this._inside(e.v.pos.x, e.v.pos.z, 0)) return;
        this._raise();
        const pol = this.game.police;
        if (pol && !(this.game.missions && this.game.missions.suppressHeat) && pol.level < 4) {
          pol.setLevel(4, 'military');
          pol._sawPlayer();
        }
      });
    }

    _inside(x, z, pad) {
      const p = pad || 0;
      return x > BASE.x0 - p && x < BASE.x1 + p && z > BASE.z0 - p && z < BASE.z1 + p;
    }

    /** Sound the alarm: every guard fights. */
    _raise() {
      if (this.alarm) return;
      this.alarm = true;
      this.warn = -1;
      this._hud(false);
      for (const s of this.guards) {
        if (s.a.dead || s.a.removed) continue;
        s.a.brain.hostile = true;
        s.a.brain.setAlert(s.a);
      }
      this.game.hud.notify({ title: 'Area 51', text: 'Security breach. Guards are shooting on sight.', icon: '⚠', tone: 'bad' });
    }

    _buildHud() {
      const el = document.createElement('div');
      el.className = 'vh-restricted';
      el.innerHTML = '<div class="vh-restricted-title">AREA 51 · RESTRICTED</div><div class="vh-restricted-sub">Leave now <span class="vh-restricted-count">3</span></div>';
      this.game.hud.root.appendChild(el);
      this.hudEl = el;
      this.countEl = el.querySelector('.vh-restricted-count');
    }

    _hud(on, n) {
      if (!this.hudEl) return;
      this.hudEl.classList.toggle('visible', !!on);
      if (on && this.countEl.textContent !== String(n)) this.countEl.textContent = String(n);
    }

    _buildAnimated() {
      const g = this.game;
      this.dishes = [];
      for (const r of g.world.area51Radars || []) {
        const dish = new THREE.Group();
        const m = new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.55, side: THREE.DoubleSide });
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), m);
        bowl.rotation.x = Math.PI / 2 + 0.55;
        bowl.position.y = 2.6;
        dish.add(bowl);
        dish.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.6, 8).translate(0, 1.3, 0), m));
        dish.position.set(r.x, r.y, r.z);
        g.scene.add(dish);
        this.dishes.push(dish);
      }
    }

    // ------------------------------------------------------------- frame
    update(dt) {
      if (!this.ok) return;
      const g = this.game;
      this._t += dt;
      this.dishes.forEach((d, i) => { d.rotation.y += dt * (0.7 + i * 0.25); });
      const p = g.player;
      const v = p.vehicle;
      const pos = p.pos;
      const d = Math.hypot(pos.x - CENTER.x, pos.z - CENTER.z);
      if (d < 360 && this.guards.length === 0) this._spawnGuards();
      else if (d > 450 && this.guards.length) this._clearGuards();
      const alt = v && v.flying ? v.altitude || 0 : 0;
      const inside = this._inside(pos.x, pos.z) && alt < 120 && !p.isDead && g.state === 'playing';
      const jobArea = g.missions && g.missions.run && g.missions.suppressHeat;
      if (inside && !jobArea) {
        if (!this.alarm) {
          if (this.warn < 0) this.warn = 3;
          this.warn -= dt;
          this._hud(true, Math.max(1, Math.ceil(this.warn)));
          if (this.warn <= 0) this._raise();
        }
        if (this.alarm) {
          this._sawT -= dt;
          if (this._sawT <= 0) {
            this._sawT = 1;
            const pol = g.police;
            if (pol && pol.level < 4) pol.setLevel(4, 'military');
            if (pol) pol._sawPlayer();
          }
        }
      } else if (this.warn >= 0) {
        this.warn = -1;
        this._hud(false);
      }
      if (this.alarm && d > 480 && (!g.police || g.police.level === 0)) {
        this._clearT += dt;
        if (this._clearT > 20) {
          this.alarm = false;
          this._clearT = 0;
        }
      } else this._clearT = 0;
    }

    _spawnGuards() {
      const g = this.game;
      const Brain = K().soldierBrain();
      for (const post of this._posts) {
        const look = Object.assign({}, GUARD_LOOK, { skin: VH.Crowd.randomLook().skin });
        const a = g.crowd.spawn(post.x, post.z, { look, faction: 'area51', role: 'enemy', persistent: true, health: 130, armor: 70, heading: post.heading || 0, name: 'Guard' });
        a.weapon = 'rifle';
        const opts = { weapon: 'rifle', accuracy: post.tower ? 0.45 : 0.55, hostile: this.alarm, alert: this.alarm, guard: post.tower ? { x: post.x, z: post.z, r: 0.6 } : { x: post.x, z: post.z, r: post.route ? 120 : 14 } };
        a.brain = new Brain(g.combat, opts, this, post);
        if (post.tower) {
          a.pos.y = TOWER_Y;
          a.pos.x = post.x;
          a.pos.z = post.z;
        }
        this.guards.push({ a, post });
      }
    }

    _clearGuards() {
      for (const s of this.guards) if (!s.a.removed) this.game.crowd.remove(s.a);
      this.guards = [];
    }

    blips(out) {
      if (!this.ok) return;
      for (const s of this.spots) {
        const v = s.v;
        if (!v || v.removed || v.wrecked || v.driver) continue;
        if (Math.hypot(v.pos.x - s.x, v.pos.z - s.z) > 30) continue;
        out.push({ x: v.pos.x, z: v.pos.z, type: v.kind === 'plane' ? 'plane' : 'car', heading: v.yaw, noRim: true, label: v.name });
      }
      if (this.alarm) {
        for (const s of this.guards) if (!s.a.dead && !s.a.removed) out.push({ x: s.a.pos.x, z: s.a.pos.z, type: 'enemy', noRim: true });
      }
    }

    stop() {
      if (!this.ok) return;
      this._hud(false);
    }

    reset() {
      if (!this.ok) return;
      this.stop();
      this._clearGuards();
      this.alarm = false;
      this.warn = -1;
      this._clearT = 0;
    }
  }

  // ------------------------------------------------------------------ map
  VH.MapPainters = VH.MapPainters || [];
  VH.MapPainters.push((g, layout, o) => {
    const a = layout.area51;
    if (!a) return;
    const R = o.R;
    g.fillStyle = 'rgba(205, 184, 138, 0.45)';
    R(a.base.x0, a.base.z0, a.base.x1, a.base.z1);
    g.fillStyle = '#4d5157';
    R(a.runway.x - a.runway.w / 2, a.runway.z0, a.runway.x + a.runway.w / 2, a.runway.z1);
    g.fillStyle = '#62666b';
    R(a.runway.x + a.runway.w / 2, a.gate.z0, -960, a.gate.z1);
    const bld = (x0, z0, x1, z1, col) => {
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      R(x0 + 2, z0 + 2, x1 + 2, z1 + 2);
      g.fillStyle = col;
      R(x0, z0, x1, z1);
    };
    for (const h of a.hangars) bld(h.x0, h.z0, h.x1, h.z1, '#b9bcc0');
    for (const l of a.labs) bld(l.x0, l.z0, l.x1, l.z1, '#cfd4d8');
    bld(a.bunker.x0, a.bunker.z0, a.bunker.x1, a.bunker.z1, '#9a978d');
    for (const [x, z] of a.fuel) {
      g.fillStyle = '#d0d3d6';
      o.circle(x, z, 6);
    }
    g.fillStyle = '#6b727a';
    for (const [x, z] of a.towers) R(x - 2.2, z - 2.2, x + 2.2, z + 2.2);
  });

  VH.Area51 = Area51;
})();
