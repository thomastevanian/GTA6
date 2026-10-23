/*
 * fort.js — Fort Breakwater, the army base at the west end of Meridian
 * Boulevard.
 *
 * A walled compound with razor wire, a gatehouse, watchtowers, barracks,
 * an HQ with a flag, a radar dome, fuel tanks, a motor pool with tanks and
 * jeeps, two helipads and a 760 m airstrip with a fighter jet at the end.
 *
 *   VH.Fort.build(world, layout)      the geometry (world build time)
 *   VH.Fort.registerPlaces(world, p)  fort_gate, fort_motor_pool, ...
 *   new VH.Fort(game)                 soldiers (spawned while Jay is near),
 *                                     the restricted area, the alarm, and
 *                                     the military vehicles Jay can steal.
 *
 * Rules: walking (driving, flying low) into the base gets a warning and
 * three seconds to leave; stay, shoot, or steal something and the alarm
 * goes: every soldier opens fire and the police come at four stars (five
 * for a stolen tank, jet or gunship). Killing a soldier counts for four.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, dampAngle } = VH.math;
  const F = () => VH.COLLIDE;

  // ---------------------------------------------------------------- plan
  const WALL = { x0: -1500, x1: -1120, z0: -400, z1: 400, h: 3.4, t: 0.6 };
  const GATE = { z0: -9, z1: 9 };
  const STRIP = { x: -1400, w: 40, z0: -380, z1: 380 };
  const ROAD_X = -1250; // the north-south road inside
  const PARADE = { x0: -1310, x1: -1180, z0: -60, z1: 60 };
  const MOTOR = { x0: -1222, x1: -1140, z0: 150, z1: 345 };
  const HELIPADS = [{ x: -1180, z: -320 }, { x: -1180, z: -262 }];
  const HQ = { x0: -1185, x1: -1140, z0: -110, z1: -72 };
  const BARRACKS = [-205, -165, -125].map((z) => ({ x0: -1362, x1: -1292, z0: z, z1: z + 18 }));
  const TOWERS = [[-1488, -388], [-1488, 388], [-1132, -388], [-1132, 388], [-1132, -24], [-1132, 24]];
  const TOWER_Y = 8;
  const FUEL = [[-1462, 140], [-1462, 168], [-1462, 196]];
  const RADAR = { x: -1460, z: -320 };
  const CENTER = { x: -1310, z: 0 };
  const KERB = 0.15;
  const RANGE = { x0: -1372, x1: -1272, z0: 80, z1: 232 }; // the firing range (lanes run north to south)
  const COURSE = { x0: -1385, x1: -1300, z0: -390, z1: -303 }; // the obstacle course

  function pave(world, x0, z0, x1, z1, color, y) {
    for (let x = x0; x < x1; x += 96) {
      for (let z = z0; z < z1; z += 96) {
        const xb = Math.min(x1, x + 96);
        const zb = Math.min(z1, z + 96);
        const ctx = world.ctxAt((x + xb) / 2, (z + zb) / 2);
        ctx.concrete.topRect(x, z, xb, zb, y || 0.012, VH.col(color), 6);
        world.physics.addBox(x, -1, z, xb, 0, zb, 'road', F().SOLID);
      }
    }
  }

  function asphalt(world, x0, z0, x1, z1, tone) {
    for (let x = x0; x < x1; x += 96) {
      for (let z = z0; z < z1; z += 96) {
        const xb = Math.min(x1, x + 96);
        const zb = Math.min(z1, z + 96);
        world.ctxAt((x + xb) / 2, (z + zb) / 2).asphaltTop.topRect(x, z, xb, zb, 0.014, VH.col(tone || 0x8f8f8f), 6);
        world.physics.addBox(x, -1, z, xb, 0, zb, 'road', F().SOLID);
      }
    }
  }

  function mark(world, x0, z0, x1, z1, color, y) {
    world.ctxAt((x0 + x1) / 2, (z0 + z1) / 2).marks.topRect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y || 0.02, VH.col(color));
  }

  function solid(world, surf, x0, y0, z0, x1, y1, z1, color, opts, tag) {
    surf.box(x0, y0, z0, x1, y1, z1, VH.col(color), opts);
    world.physics.addBox(x0, Math.min(y0, 0), z0, x1, y1, z1, tag || 'building', F().ALL);
  }

  /** A low building with windows (the building shader) and a flat roof. */
  function block(world, x0, z0, x1, z1, h, color, floors, seed) {
    const ctx = world.ctxAt((x0 + x1) / 2, (z0 + z1) / 2);
    const b = ctx.b;
    const wall = VH.col(color);
    const fac = [0.55, 0.5, 1, seed || 3];
    const fl = floors || 2;
    b.box(x0, 0, z0, x1, 0.6, z1, VH.colMul(wall, 0.8), { skip: { top: true } });
    b.wall([x0, 0.6, z1], 1, 0, x1 - x0, h - 0.6, wall, null, [0, Math.round((x1 - x0) / 4), 0, fl], fac);
    b.wall([x1, 0.6, z0], -1, 0, x1 - x0, h - 0.6, wall, null, [0, Math.round((x1 - x0) / 4), 0, fl], fac);
    b.wall([x1, 0.6, z1], 0, -1, z1 - z0, h - 0.6, wall, null, [0, Math.round((z1 - z0) / 4), 0, fl], fac);
    b.wall([x0, 0.6, z0], 0, 1, z1 - z0, h - 0.6, wall, null, [0, Math.round((z1 - z0) / 4), 0, fl], fac);
    b.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], VH.col(0x6b6e62), null, null, [0, 0, -1, seed || 3]);
    ctx.prop.box(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.5, z0 + 0.25, VH.colMul(wall, 0.75));
    ctx.prop.box(x0 - 0.2, h, z1 - 0.25, x1 + 0.2, h + 0.5, z1 + 0.2, VH.colMul(wall, 0.75));
    world.physics.addBox(x0, 0, z0, x1, h + 0.5, z1, 'building', F().ALL);
  }

  /** A stretch of perimeter wall with razor wire on top (split into chunk-sized pieces). */
  function wall(world, x0, z0, x1, z1) {
    const W = WALL;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const fixed = alongX ? z0 : x0;
    const t = W.t / 2;
    const concrete = VH.col(0xb6b1a5);
    const coping = VH.col(0x8e8a80);
    const wire = VH.col(0x2f3234);
    for (let p = a0; p < a1; p += 48) {
      const q = Math.min(a1, p + 48);
      const r = alongX ? [p, fixed - t, q, fixed + t] : [fixed - t, p, fixed + t, q];
      const ctx = world.ctxAt((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
      ctx.concrete.box(r[0], 0, r[1], r[2], W.h, r[3], concrete);
      ctx.prop.box(r[0] - 0.05, W.h, r[1] - 0.05, r[2] + 0.05, W.h + 0.18, r[3] + 0.05, coping);
      // Wire coils: a tube and Y-arms every few metres.
      const wr = alongX ? [p, fixed - 0.18, q, fixed + 0.18] : [fixed - 0.18, p, fixed + 0.18, q];
      ctx.prop.box(wr[0], W.h + 0.55, wr[1], wr[2], W.h + 0.85, wr[3], wire);
      for (let s = p + 1.5; s < q; s += 3) {
        const x = alongX ? s : fixed;
        const z = alongX ? fixed : s;
        ctx.prop.box(x - 0.04, W.h + 0.18, z - 0.04, x + 0.04, W.h + 0.95, z + 0.04, wire);
      }
      // Panels: a joint every 4 m.
      for (let s = p + 4; s < q - 0.5; s += 4) {
        const x = alongX ? s : fixed;
        const z = alongX ? fixed : s;
        if (alongX) ctx.prop.box(x - 0.06, 0, z - t - 0.03, x + 0.06, W.h, z + t + 0.03, coping);
        else ctx.prop.box(x - t - 0.03, 0, z - 0.06, x + t + 0.03, W.h, z + 0.06, coping);
      }
    }
    if (alongX) world.physics.addBox(a0, 0, fixed - t, a1, W.h + 1, fixed + t, 'wall', F().ALL);
    else world.physics.addBox(fixed - t, 0, a0, fixed + t, W.h + 1, a1, 'wall', F().ALL);
  }

  /** A watchtower: four legs, a platform with a parapet, a roof, a searchlight. */
  function watchtower(world, x, z) {
    const ctx = world.ctxAt(x, z);
    const steel = VH.col(0x4d5444);
    const olive = VH.col(0x5d6b3c);
    const y = TOWER_Y;
    for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
      ctx.prop.box(x + dx - 0.15, 0, z + dz - 0.15, x + dx + 0.15, y, z + dz + 0.15, steel);
      world.physics.addBox(x + dx - 0.15, 0, z + dz - 0.15, x + dx + 0.15, y, z + dz + 0.15, 'pole', F().ALL);
    }
    ctx.prop.box(x - 1.7, 3.6, z - 1.75, x + 1.7, 3.8, z - 1.6, steel);
    ctx.prop.box(x - 1.7, 3.6, z + 1.6, x + 1.7, 3.8, z + 1.75, steel);
    // Platform (soldiers stand on it), parapet and roof.
    ctx.prop.box(x - 2.2, y - 0.25, z - 2.2, x + 2.2, y, z + 2.2, olive, { bottom: true });
    world.physics.addBox(x - 2.2, y - 0.25, z - 2.2, x + 2.2, y, z + 2.2, 'platform', F().ALL);
    for (const [a, b, c, d] of [[-2.2, -2.2, 2.2, -2.05], [-2.2, 2.05, 2.2, 2.2], [-2.2, -2.2, -2.05, 2.2], [2.05, -2.2, 2.2, 2.2]]) {
      ctx.prop.box(x + a, y, z + b, x + c, y + 1.1, z + d, olive);
    }
    world.physics.addBox(x - 2.2, y, z - 2.2, x + 2.2, y + 1.1, z - 2.05, 'parapet', F().SOLID | F().CAMERA);
    world.physics.addBox(x - 2.2, y, z + 2.05, x + 2.2, y + 1.1, z + 2.2, 'parapet', F().SOLID | F().CAMERA);
    world.physics.addBox(x - 2.2, y, z - 2.2, x - 2.05, y + 1.1, z + 2.2, 'parapet', F().SOLID | F().CAMERA);
    world.physics.addBox(x + 2.05, y, z - 2.2, x + 2.2, y + 1.1, z + 2.2, 'parapet', F().SOLID | F().CAMERA);
    for (const [dx, dz] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) ctx.prop.box(x + dx - 0.06, y, z + dz - 0.06, x + dx + 0.06, y + 2.6, z + dz + 0.06, steel);
    ctx.prop.box(x - 2.6, y + 2.6, z - 2.6, x + 2.6, y + 2.85, z + 2.6, olive, { bottom: true });
    // Ladder up one leg.
    for (let ly = 0.4; ly < y; ly += 0.45) ctx.prop.box(x + 1.75, ly, z - 1.3, x + 1.85, ly + 0.05, z - 0.7, steel);
    ctx.screen.box(x - 0.35, y + 1.3, z - 0.35, x + 0.35, y + 1.7, z + 0.35, VH.col(0xf4f7ff, 1.8));
  }

  function helipad(world, h) {
    pave(world, h.x - 12, h.z - 12, h.x + 12, h.z + 12, 0x9a9890, 0.016);
    const w = 0xf4f4ef;
    mark(world, h.x - 3.4, h.z - 4.5, h.x - 2.2, h.z + 4.5, w, 0.024);
    mark(world, h.x + 2.2, h.z - 4.5, h.x + 3.4, h.z + 4.5, w, 0.024);
    mark(world, h.x - 2.2, h.z - 0.6, h.x + 2.2, h.z + 0.6, w, 0.024);
    mark(world, h.x - 10, h.z - 10, h.x + 10, h.z - 9.4, 0xe0b12e, 0.024);
    mark(world, h.x - 10, h.z + 9.4, h.x + 10, h.z + 10, 0xe0b12e, 0.024);
    mark(world, h.x - 10, h.z - 9.4, h.x - 9.4, h.z + 9.4, 0xe0b12e, 0.024);
    mark(world, h.x + 9.4, h.z - 9.4, h.x + 10, h.z + 9.4, 0xe0b12e, 0.024);
    const ctx = world.ctxAt(h.x, h.z);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = h.x + Math.cos(a) * 11;
      const z = h.z + Math.sin(a) * 11;
      ctx.screen.box(x - 0.12, 0.05, z - 0.12, x + 0.12, 0.25, z + 0.12, VH.col(0x8dff9c, 2.2));
    }
  }

  /** Sandbags in a horseshoe. */
  function sandbags(world, x, z, yaw) {
    const ctx = world.ctxAt(x, z);
    const c = VH.col(0xa8956a);
    const s = Math.sin(yaw);
    const k = Math.cos(yaw);
    for (const [lx, lz, hx, hz] of [[0, 1.6, 2.2, 0.45], [-2.2, 0.4, 0.45, 1.6], [2.2, 0.4, 0.45, 1.6]]) {
      const cx = x + lx * k + lz * s;
      const cz = z - lx * s + lz * k;
      ctx.propMatte.orientedBox(cx, cz, hx, hz, yaw, 0, 1.1, c);
      world.physics.addOrientedBox(cx, cz, hx, hz, yaw, 0, 1.1, 'sandbags', F().ALL);
    }
  }

  function crates(world, x, z, n, seed) {
    const ctx = world.ctxAt(x, z);
    const rng = new VH.RNG('fortcrates' + seed);
    for (let i = 0; i < n; i++) {
      const cx = x + (i % 3) * 1.6;
      const cz = z + Math.floor(i / 3) * 1.6;
      const h = rng.chance(0.4) ? 2.4 : 1.2;
      ctx.propMatte.box(cx - 0.7, 0, cz - 0.7, cx + 0.7, h, cz + 0.7, VH.col(rng.chance(0.5) ? 0x5d6b3c : 0x6b6545));
      ctx.prop.box(cx - 0.72, 0.5, cz - 0.72, cx + 0.72, 0.6, cz + 0.72, VH.col(0x3a3d36));
      world.physics.addBox(cx - 0.7, 0, cz - 0.7, cx + 0.7, h, cz + 0.7, 'crate', F().ALL);
    }
  }

  function floodMast(world, x, z, radius) {
    const ctx = world.ctxAt(x, z);
    ctx.prop.box(x - 0.18, 0, z - 0.18, x + 0.18, 15, z + 0.18, VH.col(0x6f7468));
    ctx.prop.box(x - 1.3, 14.6, z - 0.35, x + 1.3, 15.4, z + 0.35, VH.col(0x2b2f36));
    ctx.screen.box(x - 1.15, 14.45, z - 0.25, x + 1.15, 14.62, z + 0.25, VH.col(0xf4f7ff, 2.4));
    world.physics.addBox(x - 0.2, 0, z - 0.2, x + 0.2, 15, z + 0.2, 'pole', F().ALL);
    (world.floodlights || (world.floodlights = [])).push({ x, z, r: radius, y: 0.03 });
  }

  // ------------------------------------------------------------ soldiers
  const ARMY_LOOK = { hair: 0x16110d, top: 0x4b5320, trim: 0x4b5320, shirt: 0x3f4a26, bottom: 0x3d4a2a, shoes: 0x1a1a14, cap: true, longHair: false, height: 1.0, build: 1.1 };

  /**
   * A soldier: walks a beat (or holds a post) until the alarm, then fights
   * like any armed enemy. Made on first use (combat.js loads after this file).
   */
  let SoldierBrain = null;
  function soldierBrain() {
    if (SoldierBrain) return SoldierBrain;
    SoldierBrain = class extends VH.CombatBrain {
    constructor(combat, opts, fort, post) {
      super(combat, opts);
      this.fort = fort;
      this.route = post.route || null;
      this.hold = !!post.hold;
      this.wp = 0;
      this.home = { x: post.x, z: post.z, heading: post.heading || 0 };
      this._pause = 0;
    }

    update(a, dt) {
      super.update(a, dt);
      if (a.dead || this.state !== 'idle') return;
      if (this.route) this._walk(a, dt);
      else a.heading = dampAngle(a.heading, this.home.heading, 2, dt);
    }

    _walk(a, dt) {
      if (this._pause > 0) {
        this._pause -= dt;
        return;
      }
      const p = this.route[this.wp];
      const dx = p[0] - a.pos.x;
      const dz = p[1] - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) {
        this.wp = (this.wp + 1) % this.route.length;
        this._pause = 1 + Math.random() * 3;
        return;
      }
      a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 5, dt);
      a.moveSpeed = 1.45;
    }

    _chooseMove(a, d, w) {
      // Snipers in the towers stay up there.
      if (this.hold) {
        this._goal = null;
        return;
      }
      super._chooseMove(a, d, w);
    }

    expired() {
      return false; // the fort removes its own
    }
    };
    return SoldierBrain;
  }

  // ================================================================ fort
  class Fort {
    static build(world, layout) {
      const W = WALL;
      const data = { wall: W, gate: GATE, strip: STRIP, roadX: ROAD_X, parade: PARADE, motor: MOTOR, helipads: HELIPADS, hq: HQ, barracks: BARRACKS, towers: TOWERS, fuel: FUEL, radar: RADAR };
      layout.fort = data;
      // Grounds: the airstrip, roads, the parade ground, the motor pool.
      asphalt(world, STRIP.x - STRIP.w / 2, STRIP.z0, STRIP.x + STRIP.w / 2, STRIP.z1, 0x868686);
      for (let z = STRIP.z0 + 40; z < STRIP.z1 - 40; z += 40) mark(world, STRIP.x - 0.4, z, STRIP.x + 0.4, z + 22, 0xf4f4ef);
      mark(world, STRIP.x - STRIP.w / 2 + 1, STRIP.z0, STRIP.x - STRIP.w / 2 + 1.7, STRIP.z1, 0xf4f4ef);
      mark(world, STRIP.x + STRIP.w / 2 - 1.7, STRIP.z0, STRIP.x + STRIP.w / 2 - 1, STRIP.z1, 0xf4f4ef);
      for (const [z, d] of [[STRIP.z0, 1], [STRIP.z1, -1]]) {
        for (let i = 0; i < 8; i++) mark(world, STRIP.x - 16 + i * 4.2, z + d * 6, STRIP.x - 14 + i * 4.2, z + d * 28, 0xf4f4ef);
      }
      for (let z = STRIP.z0; z <= STRIP.z1; z += 60) for (const x of [STRIP.x - STRIP.w / 2 - 1.2, STRIP.x + STRIP.w / 2 + 1.2]) {
        world.ctxAt(x, z).screen.box(x - 0.12, 0.1, z - 0.12, x + 0.12, 0.3, z + 0.12, VH.col(0xfff4dc, 2.2));
      }
      asphalt(world, WALL.x1 - 10, GATE.z0, WALL.x1 + 22, GATE.z1, 0x8a8a8a); // the gate apron
      asphalt(world, PARADE.x1, GATE.z0 + 1, WALL.x1 - 10, GATE.z1 - 1, 0x8a8a8a);
      asphalt(world, ROAD_X - 6, -370, ROAD_X + 6, 370, 0x8a8a8a);
      asphalt(world, STRIP.x + STRIP.w / 2, 240, ROAD_X - 6, 256, 0x8a8a8a); // taxiway to the strip
      asphalt(world, STRIP.x + STRIP.w / 2, -296, ROAD_X - 6, -284, 0x8a8a8a);
      asphalt(world, ROAD_X + 6, -296, HELIPADS[0].x - 12, -284, 0x8a8a8a);
      pave(world, PARADE.x0, PARADE.z0, PARADE.x1, PARADE.z1, 0xb3b0a6);
      for (let x = PARADE.x0 + 10; x < PARADE.x1 - 5; x += 10) mark(world, x, PARADE.z0 + 4, x + 0.3, PARADE.z1 - 4, 0xe9e6dc);
      pave(world, ROAD_X + 6, MOTOR.z0, MOTOR.x1, MOTOR.z1, 0xa7a49b);
      pave(world, ROAD_X + 6, HQ.z0 - 8, HQ.x1 + 6, HQ.z1 + 30, 0xaeaba2, 0.014);
      for (const h of HELIPADS) helipad(world, h);
      // Walls, the gate and its towers.
      wall(world, W.x0, W.z0, W.x1, W.z0);
      wall(world, W.x0, W.z1, W.x1, W.z1);
      wall(world, W.x0, W.z0, W.x0, W.z1);
      wall(world, W.x1, W.z0, W.x1, GATE.z0);
      wall(world, W.x1, GATE.z1, W.x1, W.z1);
      const gctx = world.ctxAt(W.x1, 0);
      for (const z of [GATE.z0 - 0.8, GATE.z1 + 0.8]) solid(world, gctx.concrete, W.x1 - 0.8, 0, z - 0.8, W.x1 + 0.8, 5, z + 0.8, 0x9c978b, null, 'wall');
      solid(world, gctx.prop, W.x1 - 9, 0, GATE.z1 + 2, W.x1 - 3, 3, GATE.z1 + 7, 0xd8d1bf, null, 'building'); // gatehouse
      gctx.screen.box(W.x1 - 3.02, 1.2, GATE.z1 + 2.6, W.x1 - 2.98, 2.3, GATE.z1 + 6.4, VH.col(0xfff1d8, 1.0));
      gctx.prop.box(W.x1 - 9.3, 3, GATE.z1 + 1.7, W.x1 - 2.7, 3.3, GATE.z1 + 7.3, VH.col(0x5d6b3c), { bottom: true });
      gctx.prop.box(W.x1 + 1.2, 0, GATE.z1 - 0.4, W.x1 + 1.8, 1.1, GATE.z1 + 0.2, VH.col(0xe0b12e));
      gctx.prop.box(W.x1 + 1.43, 1.0, GATE.z1 - 0.2, W.x1 + 1.57, 9, GATE.z1 - 0.06, VH.col(0xd8262e)); // barrier, up
      for (let z = GATE.z0 + 1; z < GATE.z1 - 0.5; z += 2.4) gctx.prop.box(W.x1 + 8, 0, z, W.x1 + 8.6, 0.25, z + 1.2, VH.col(0xe0b12e)); // road blockers, lowered
      (world.signs || (world.signs = [])).push({ x: W.x1 + 0.35, y: 2.2, z: GATE.z0 - 14, yaw: Math.PI / 2, w: 11, h: 2.6, lines: ['FORT BREAKWATER', 'RESTRICTED AREA', 'NO UNAUTHORISED ENTRY'], style: 'brand' });
      (world.signs || (world.signs = [])).push({ x: W.x1 + 0.35, y: 2.2, z: GATE.z1 + 14, yaw: Math.PI / 2, w: 11, h: 2.6, lines: ['WARNING', 'USE OF DEADLY FORCE', 'AUTHORISED'], style: 'brand' });
      for (const [x, z] of TOWERS) watchtower(world, x, z);
      // Buildings.
      block(world, HQ.x0, HQ.z0, HQ.x1, HQ.z1, 8.5, 0xc9c1a8, 2, 11);
      (world.signs || (world.signs = [])).push({ x: (HQ.x0 + HQ.x1) / 2, y: 6.6, z: HQ.z1 + 0.12, yaw: 0, w: 14, h: 1.4, lines: ['HEADQUARTERS · FORT BREAKWATER'], style: 'monolith' });
      for (const [i, br] of BARRACKS.entries()) block(world, br.x0, br.z0, br.x1, br.z1, 5.5, i === 1 ? 0xb8b08f : 0xc2bb9c, 1, 20 + i);
      block(world, ROAD_X + 12, MOTOR.z1 - 1, MOTOR.x1, MOTOR.z1 + 16, 7, 0xa9a48f, 1, 31); // vehicle shed
      // The flag, the radar dome, fuel tanks.
      const fctx = world.ctxAt(HQ.x1 + 5, HQ.z1 + 8);
      fctx.prop.box(HQ.x1 + 4.9, 0, HQ.z1 + 7.9, HQ.x1 + 5.1, 14, HQ.z1 + 8.1, VH.col(0xd8dcdf));
      world.physics.addBox(HQ.x1 + 4.85, 0, HQ.z1 + 7.85, HQ.x1 + 5.15, 14, HQ.z1 + 8.15, 'pole', F().ALL);
      world.fortFlag = { x: HQ.x1 + 5, y: 13.6, z: HQ.z1 + 8 };
      const rctx = world.ctxAt(RADAR.x, RADAR.z);
      rctx.concrete.box(RADAR.x - 3, 0, RADAR.z - 3, RADAR.x + 3, 10, RADAR.z + 3, VH.col(0xb6b1a5));
      rctx.prop.cylinder(RADAR.x, 10, RADAR.z, 4.2, 4.2, 0.6, 18, VH.col(0x8e8a80), true, VH.col(0x8e8a80));
      world.physics.addBox(RADAR.x - 3, 0, RADAR.z - 3, RADAR.x + 3, 10.6, RADAR.z + 3, 'building', F().ALL);
      world.fortRadar = { x: RADAR.x, y: 10.6, z: RADAR.z };
      for (const [x, z] of FUEL) {
        const ctx = world.ctxAt(x, z);
        ctx.prop.cylinder(x, 0, z, 6, 6, 8, 20, VH.col(0xc8c4b6), true, VH.col(0xb0ac9e));
        ctx.prop.box(x - 6.2, 3.6, z - 0.3, x + 6.2, 4.2, z + 0.3, VH.col(0x5d6b3c));
        world.physics.addBox(x - 5, 0, z - 5, x + 5, 8, z + 5, 'tank', F().ALL);
      }
      // A hardened shelter beside the strip (the jet waits on the strip itself).
      const sx0 = STRIP.x - STRIP.w / 2 - 52;
      const sctx = world.ctxAt(sx0 + 22, 300);
      for (let k = 0; k < 5; k++) sctx.concrete.box(sx0 + k * 2, 0, 280 + k * 0.4, sx0 + 44 - k * 2, 8 + k * 1.1, 320 - k * 0.4, VH.col(k % 2 ? 0x9a978d : 0xa8a59a), { skip: { s: k > 0, n: k > 0 } });
      world.physics.addBox(sx0, 0, 280, sx0 + 44, 13.5, 320, 'building', F().ALL);
      // Clutter: sandbags, crates, a camo net, fences round the motor pool.
      sandbags(world, WALL.x1 - 16, GATE.z0 - 8, Math.PI / 2);
      sandbags(world, WALL.x1 - 16, GATE.z1 + 12, Math.PI / 2);
      sandbags(world, HELIPADS[0].x + 18, HELIPADS[0].z, -Math.PI / 2);
      crates(world, -1236, 60, 7, 1);
      crates(world, -1440, 230, 9, 2);
      crates(world, -1330, -260, 6, 3);
      const nctx = world.ctxAt(-1435, 236);
      for (const [x, z] of [[-1442, 228], [-1428, 228], [-1442, 244], [-1428, 244]]) nctx.prop.box(x - 0.08, 0, z - 0.08, x + 0.08, 3.6, z + 0.08, VH.col(0x3a3d36));
      nctx.propMatte.box(-1444, 3.5, 226, -1426, 3.62, 246, VH.col(0x4b5320), { bottom: true });
      // (Clear of the airstrip: masts beside it, not on its centre line.)
      for (const [x, z] of [[-1190, 0], [-1300, -140], [-1300, 140], [-1440, -200], [-1440, 200], [-1180, 250], [-1180, -200]]) floodMast(world, x, z, 34);
      Fort._range(world);
      Fort._course(world);
      Fort._motorPoolDressing(world);
      return data;
    }

    /** A firing range: a concrete pad, six lanes, a sandbag firing line and targets on posts. */
    static _range(world) {
      const R = RANGE;
      pave(world, R.x0, R.z0, R.x1, R.z1, 0xa9a69c, 0.014);
      const ctx = world.ctxAt((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
      const lane = (R.x1 - R.x0) / 6;
      for (let i = 1; i < 6; i++) mark(world, R.x0 + i * lane - 0.15, R.z0 + 6, R.x0 + i * lane + 0.15, R.z1 - 4, 0xf4f4ef, 0.022);
      // The firing line: sandbags with a gap for each lane, and a red flag pole.
      for (let i = 0; i < 6; i++) {
        const x0 = R.x0 + i * lane + 1.2;
        ctx.propMatte.box(x0, 0, R.z0 + 4, x0 + lane - 2.4, 0.9, R.z0 + 5, VH.col(0xa8956a));
        world.physics.addBox(x0, 0, R.z0 + 4, x0 + lane - 2.4, 0.9, R.z0 + 5, 'sandbags', F().ALL);
      }
      ctx.prop.box(R.x0 - 2.1, 0, R.z0 + 2, R.x0 - 1.9, 6, R.z0 + 2.2, VH.col(0xd8dcdf));
      ctx.prop.box(R.x0 - 1.9, 5, R.z0 + 2.1, R.x0 - 0.4, 5.9, R.z0 + 2.15, VH.col(0xd8262e));
      // Targets at the far end: a board, rings, two posts; an earth berm behind.
      for (let i = 0; i < 6; i++) {
        const cx = R.x0 + (i + 0.5) * lane;
        const z = R.z1 - 10;
        ctx.prop.box(cx - 0.9, 0, z - 0.05, cx - 0.8, 2.2, z + 0.05, VH.col(0x6b5a44));
        ctx.prop.box(cx + 0.8, 0, z - 0.05, cx + 0.9, 2.2, z + 0.05, VH.col(0x6b5a44));
        ctx.prop.box(cx - 0.8, 0.9, z - 0.04, cx + 0.8, 2.3, z + 0.04, VH.col(0xf1f2ef));
        ctx.prop.box(cx - 0.55, 1.15, z - 0.05, cx + 0.55, 2.05, z - 0.04, VH.col(0xd8262e));
        ctx.prop.box(cx - 0.35, 1.35, z - 0.06, cx + 0.35, 1.85, z - 0.05, VH.col(0xf1f2ef));
        ctx.prop.box(cx - 0.15, 1.52, z - 0.07, cx + 0.15, 1.68, z - 0.06, VH.col(0xd8262e));
      }
      ctx.propMatte.box(R.x0, 0, R.z1 - 6, R.x1, 4, R.z1, VH.col(0x8f7653));
      world.physics.addBox(R.x0, 0, R.z1 - 6, R.x1, 4, R.z1, 'building', F().ALL);
    }

    /** An obstacle course: walls to vault, a tyre run, a rope frame and a cargo net. */
    static _course(world) {
      const C = COURSE;
      const ctx = world.ctxAt((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2);
      const wood = VH.col(0x7a5a3a);
      const rng = new VH.RNG('fortcourse');
      for (let k = 0; k < 4; k++) {
        const z = C.z0 + 8 + k * 16;
        const h = [1.0, 1.6, 2.2, 1.3][k];
        ctx.propMatte.box(C.x0 + 6, 0, z, C.x0 + 18, h, z + 0.4, wood);
        world.physics.addBox(C.x0 + 6, 0, z, C.x0 + 18, h, z + 0.4, 'crate', F().ALL);
      }
      // A tyre run: two rows of tyres lying flat.
      for (let z = C.z0 + 6; z < C.z1 - 6; z += 1.6) {
        for (const x of [C.x0 + 26, C.x0 + 27.6]) world.ctxAt(x, z).prop.cylinder(x, 0, z, 0.7, 0.7, 0.3, 12, VH.col(0x161616), true, VH.col(0x2a2a2a));
      }
      // A rope frame: two posts, a beam and hanging ropes.
      const fx = C.x0 + 38;
      const fz = (C.z0 + C.z1) / 2;
      for (const z of [fz - 6, fz + 6]) {
        ctx.prop.box(fx - 0.15, 0, z - 0.15, fx + 0.15, 7, z + 0.15, wood);
        world.physics.addBox(fx - 0.15, 0, z - 0.15, fx + 0.15, 7, z + 0.15, 'pole', F().ALL);
      }
      ctx.prop.box(fx - 0.15, 6.8, fz - 6, fx + 0.15, 7.1, fz + 6, wood);
      for (let z = fz - 5; z <= fz + 5; z += 2.5) ctx.prop.box(fx - 0.03, 1.2, z - 0.03, fx + 0.03, 6.8, z + 0.03, VH.col(0xc9b27f));
      // A cargo net climb: a sloping frame of ropes.
      const nx = C.x0 + 50;
      for (let i = 0; i <= 6; i++) {
        const z = C.z0 + 10 + i * 2;
        ctx.prop.box(nx, 0, z - 0.03, nx + 0.06, 5, z + 0.03, VH.col(0xc9b27f));
      }
      for (let y = 0.5; y < 5; y += 0.7) ctx.prop.box(nx, y, C.z0 + 10, nx + 0.06, y + 0.05, C.z0 + 22, VH.col(0xc9b27f));
      ctx.prop.box(nx - 0.2, 5, C.z0 + 9.8, nx + 0.26, 5.25, C.z0 + 22.2, wood);
      // Some crates and a water tank for good measure.
      crates(world, C.x1 - 10, C.z0 + 4, 5, 9 + rng.int(0, 3));
      ctx.prop.cylinder(C.x1 - 6, 0, C.z1 - 8, 2.2, 2.2, 3.5, 14, VH.col(0x5d6b3c), true, VH.col(0x4b5320));
      world.physics.addBox(C.x1 - 8.2, 0, C.z1 - 10.2, C.x1 - 3.8, 3.5, C.z1 - 5.8, 'tank', F().ALL);
    }

    /** Painted bays and a camouflage net over the tanks in the motor pool. */
    static _motorPoolDressing(world) {
      for (let z = MOTOR.z0 + 30; z < MOTOR.z0 + 105; z += 25) mark(world, ROAD_X + 14, z - 0.15, MOTOR.x1 - 4, z + 0.15, 0xf2c500, 0.02);
      const ctx = world.ctxAt(-1180, MOTOR.z0 + 60);
      const x0 = -1215;
      const x1 = -1145;
      const z0 = MOTOR.z0 + 35;
      const z1 = MOTOR.z0 + 92;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]]) {
        ctx.prop.box(x - 0.1, 0, z - 0.1, x + 0.1, 5.2, z + 0.1, VH.col(0x3a3d36));
        world.physics.addBox(x - 0.12, 0, z - 0.12, x + 0.12, 5.2, z + 0.12, 'pole', F().ALL);
      }
      ctx.propMatte.box(x0, 5.1, z0, x1, 5.22, z1, VH.col(0x4b5320), { bottom: true });
      // Leafy tufts over the net.
      const rng = new VH.RNG('camonet');
      for (let i = 0; i < 60; i++) {
        const x = rng.range(x0 + 1, x1 - 1);
        const z = rng.range(z0 + 1, z1 - 1);
        ctx.propMatte.box(x - 0.8, 5.2, z - 0.8, x + 0.8, 5.5, z + 0.8, VH.col(rng.pick([0x5d6b3c, 0x6b6545, 0x3f4a26])));
      }
    }

    static registerPlaces(world, places) {
      if (!world.fort) return;
      places.add('fort_gate', { name: 'The gate of Fort Breakwater, Meridian Boulevard', x: WALL.x1 + 30, z: GATE.z1 + 14, yaw: -Math.PI / 2, kind: 'fort', district: 'fort' });
      places.add('fort_motor_pool', { name: 'The motor pool, Fort Breakwater', x: -1236, z: 250, yaw: Math.PI / 2, kind: 'fort', district: 'fort' });
      places.add('fort_airstrip', { name: 'The airstrip, Fort Breakwater', x: STRIP.x + STRIP.w / 2 + 6, z: 300, yaw: -Math.PI / 2, kind: 'fort', district: 'fort' });
      places.add('fort_helipad', { name: 'The helipads, Fort Breakwater', x: HELIPADS[0].x + 16, z: -290, yaw: -Math.PI / 2, kind: 'fort', district: 'fort' });
    }

    // ------------------------------------------------------------ runtime
    constructor(game) {
      this.game = game;
      this.ok = !!game.world.fort;
      if (!this.ok) return;
      this.saveKey = null;
      this.soldiers = [];
      this.alarm = false;
      this.warn = -1; // seconds left of the warning, -1 when none
      this._clearT = 0;
      this._sawT = 0;
      this.spots = [];
      const V = game.vehicles;
      const add = (type, x, z, yaw, color) => {
        if (!VH.Vehicle.typeSpec(type)) return;
        this.spots.push(V.addFixedSpot({
          type, x, z, yaw, color, r: type === 'phantom' ? 17 : type === 'bison' ? 13 : type === 'talon' ? 12 : type === 'warden' ? 11 : type === 'mule' ? 13 : type === 'kestrel' ? 8 : 6,
          onSpawn: (v) => {
            v.military = true;
          },
        }));
      };
      add('bastion', -1196, 200, -Math.PI / 2);
      add('bastion', -1196, 225, -Math.PI / 2);
      add('bastion', -1160, 200, -Math.PI / 2);
      add('bastion', -1160, 225, -Math.PI / 2);
      add('bastion', -1196, 322, -Math.PI / 2);
      add('scout', -1196, 260, -Math.PI / 2, 0x4b5320);
      add('scout', -1196, 278, -Math.PI / 2, 0x5d6b3c);
      add('scout', -1196, 296, -Math.PI / 2, 0x4b5320);
      add('talon', STRIP.x, STRIP.z1 - 30, Math.PI);
      add('kestrel', STRIP.x - 12, STRIP.z1 - 75, Math.PI);
      add('kestrel', STRIP.x + 12, STRIP.z1 - 75, Math.PI);
      add('bison', STRIP.x, STRIP.z1 - 120, Math.PI);
      add('phantom', STRIP.x, STRIP.z0 + 70, 0);
      add('warden', HELIPADS[0].x, HELIPADS[0].z, -Math.PI / 2);
      add('mule', HELIPADS[1].x, HELIPADS[1].z, -Math.PI / 2);
      this._posts = Fort._posts();
      this._buildHud();
      this._buildAnimated();
      this._bind();
    }

    /** Where the soldiers stand or walk. */
    static _posts() {
      const posts = [
        { x: WALL.x1 + 6, z: GATE.z0 - 4, heading: Math.PI / 2 },
        { x: WALL.x1 + 6, z: GATE.z1 + 4, heading: Math.PI / 2 },
        { x: HELIPADS[0].x + 16, z: HELIPADS[0].z + 4, heading: Math.PI / 2 },
        { x: -1230, z: 190, heading: -Math.PI / 2 },
        { x: -1230, z: 300, heading: -Math.PI / 2 },
        { x: PARADE.x0 + 10, z: PARADE.z0 + 10, route: [[PARADE.x0 + 10, PARADE.z0 + 10], [PARADE.x1 - 10, PARADE.z0 + 10], [PARADE.x1 - 10, PARADE.z1 - 10], [PARADE.x0 + 10, PARADE.z1 - 10]] },
        { x: STRIP.x + 26, z: -300, route: [[STRIP.x + 26, -300], [STRIP.x + 26, 300]] },
        { x: -1270, z: -230, route: [[-1270, -230], [-1270, -95], [-1375, -95], [-1375, -230]] },
        { x: -1190, z: 120, route: [[-1190, 120], [-1190, 350], [-1300, 350], [-1300, 120]] },
      ];
      for (const [x, z] of TOWERS) posts.push({ x, z, hold: true, tower: true, heading: Math.atan2(CENTER.x - x, CENTER.z - z) + Math.PI });
      return posts;
    }

    _bind() {
      VH.events.on('vehicle:enter', (e) => {
        if (!this.ok || !e.v.military || !e.v.fixedSpot) return;
        this._raise('steal');
        const pol = this.game.police;
        if (pol && !(this.game.missions && this.game.missions.suppressHeat)) {
          pol.setLevel(5, 'military');
          pol._sawPlayer();
          pol._dispatch && pol._dispatch('report', { kind: 'stealMilitary', x: e.v.pos.x, z: e.v.pos.z, heat: 5 });
        }
      });
      VH.events.on('agent:died', (e) => {
        if (!this.ok || !e.agent || e.agent.faction !== 'army' || e.source !== 'player') return;
        const pol = this.game.police;
        if (pol) {
          pol.crime('killSoldier', e.agent.pos.x, e.agent.pos.z);
          if (!(this.game.missions && this.game.missions.suppressHeat) && pol.level < 4) {
            pol.setLevel(4, 'military');
            pol._sawPlayer();
          }
        }
        this._raise('kill');
      });
      VH.events.on('gunshot', (e) => {
        if (!this.ok || !e.byPlayer) return;
        if (this._inside(e.x, e.z, 40)) this._raise('shots');
      });
      VH.events.on('agent:hurt', (e) => {
        if (this.ok && e.agent && e.agent.faction === 'army' && e.source === 'player') this._raise('hit');
      });
    }

    _inside(x, z, pad) {
      const p = pad || 0;
      return x > WALL.x0 - p && x < WALL.x1 + p && z > WALL.z0 - p && z < WALL.z1 + p;
    }

    /** Sound the alarm: everybody fights. */
    _raise() {
      if (this.alarm) return;
      this.alarm = true;
      this.warn = -1;
      this._hud(false);
      for (const s of this.soldiers) {
        if (s.a.dead || s.a.removed) continue;
        s.a.brain.hostile = true;
        s.a.brain.setAlert(s.a);
      }
      this.game.hud.notify({ title: 'Fort Breakwater', text: 'The alarm is up. Get out.', icon: '⚠', tone: 'bad' });
    }

    // ---------------------------------------------------------------- HUD
    _buildHud() {
      const el = document.createElement('div');
      el.className = 'vh-restricted';
      el.innerHTML = '<div class="vh-restricted-title">RESTRICTED AREA</div><div class="vh-restricted-sub">Leave now <span class="vh-restricted-count">3</span></div>';
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
      const f = g.world.fortFlag;
      if (f) {
        // Our own flag: teal and sand halves with a white star.
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 80;
        const x = c.getContext('2d');
        x.fillStyle = '#1f6f6a';
        x.fillRect(0, 0, 128, 40);
        x.fillStyle = '#d8c070';
        x.fillRect(0, 40, 128, 40);
        x.fillStyle = '#ffffff';
        x.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 9 : 22;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          x.lineTo(40 + Math.cos(a) * r, 40 + Math.sin(a) * r);
        }
        x.fill();
        const tex = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        this.flagGeo = new THREE.PlaneGeometry(3.2, 2, 12, 1);
        this.flagGeo.translate(1.6, -1, 0);
        this.flagBase = Float32Array.from(this.flagGeo.attributes.position.array);
        this.flag = new THREE.Mesh(this.flagGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
        this.flag.position.set(f.x, f.y, f.z);
        g.scene.add(this.flag);
      }
      const r = g.world.fortRadar;
      if (r) {
        const dish = new THREE.Group();
        const m = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, roughness: 0.6, side: THREE.DoubleSide });
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), m);
        bowl.rotation.x = Math.PI / 2 + 0.5;
        bowl.position.y = 2.4;
        dish.add(bowl);
        dish.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.4, 8).translate(0, 1.2, 0), m));
        dish.position.set(r.x, r.y, r.z);
        g.scene.add(dish);
        this.radar = dish;
      }
      this._t = 0;
    }

    // ------------------------------------------------------------- frame
    update(dt) {
      if (!this.ok) return;
      const g = this.game;
      this._t += dt;
      if (this.radar) this.radar.rotation.y += dt * 0.9;
      if (this.flag) this._wave();
      const p = g.player;
      const v = p.vehicle;
      const pos = p.pos;
      const d = Math.hypot(pos.x - CENTER.x, pos.z - CENTER.z);
      // Soldiers come and go with Jay.
      if (d < 340 && this.soldiers.length === 0) this._spawnSoldiers();
      else if (d > 430 && this.soldiers.length) this._clearSoldiers();
      // The restricted area: inside the walls (or flying low over them).
      const alt = v && v.flying ? v.altitude || 0 : 0;
      const inside = this._inside(pos.x, pos.z) && alt < 120 && !p.isDead && g.state === 'playing';
      const jobArea = g.missions && g.missions.run && g.missions.suppressHeat;
      if (inside && !jobArea) {
        if (!this.alarm) {
          if (this.warn < 0) this.warn = 3;
          this.warn -= dt;
          this._hud(true, Math.max(1, Math.ceil(this.warn)));
          if (this.warn <= 0) this._raise('trespass');
        }
        if (this.alarm) {
          // Inside with the alarm up: four stars, and they always know where he is.
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
      // Gone and forgotten: the alarm resets once he's well away and the heat is off.
      if (this.alarm && d > 450 && (!g.police || g.police.level === 0)) {
        this._clearT += dt;
        if (this._clearT > 20) {
          this.alarm = false;
          this._clearT = 0;
        }
      } else this._clearT = 0;
      this._siren(dt, d);
    }

    _wave() {
      const pos = this.flagGeo.attributes.position;
      const base = this.flagBase;
      const t = this._t;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(x * 2.2 - t * 5) * 0.18 * (x / 3.2);
      }
      pos.needsUpdate = true;
    }

    _siren(dt, d) {
      const g = this.game;
      const audio = g.audio;
      if (!audio || !audio.ready || !audio.createSiren) return;
      const on = this.alarm && d < 700;
      if (on && !this.voice) this.voice = audio.createSiren({ style: 'wail' });
      if (this.voice) {
        const gain = on ? 0.55 / (1 + Math.pow(d / 160, 1.4)) : 0;
        this.voice.update({ gain, pan: g.vehicleFeedback ? g.vehicleFeedback._pan(CENTER.x, CENTER.z) : 0, style: 'wail', dopplerRate: 0.82 });
        if (!on && this.voice) {
          this.voice.stop();
          this.voice = null;
        }
      }
    }

    _spawnSoldiers() {
      const g = this.game;
      for (const post of this._posts) {
        const look = Object.assign({}, ARMY_LOOK, { skin: VH.Crowd.randomLook().skin });
        const a = g.crowd.spawn(post.x, post.z, { look, faction: 'army', role: 'enemy', persistent: true, health: 120, armor: 60, heading: post.heading || 0, name: 'Soldier' });
        a.weapon = 'rifle';
        const opts = { weapon: 'rifle', accuracy: post.tower ? 0.42 : 0.5, hostile: this.alarm, alert: this.alarm, guard: post.tower ? { x: post.x, z: post.z, r: 0.6 } : { x: post.x, z: post.z, r: post.route ? 120 : 14 } };
        a.brain = new (soldierBrain())(g.combat, opts, this, post);
        if (post.tower) {
          a.pos.y = TOWER_Y;
          a.pos.x = post.x;
          a.pos.z = post.z;
        }
        this.soldiers.push({ a, post });
      }
    }

    _clearSoldiers() {
      for (const s of this.soldiers) if (!s.a.removed) this.game.crowd.remove(s.a);
      this.soldiers = [];
    }

    blips(out, missionRunning) {
      if (!this.ok) return; // parked military vehicles show during jobs too
      for (const s of this.spots) {
        const v = s.v;
        if (!v || v.removed || v.wrecked || v.driver) continue;
        if (Math.hypot(v.pos.x - s.x, v.pos.z - s.z) > 30) continue;
        out.push({ x: v.pos.x, z: v.pos.z, type: v.kind === 'tank' ? 'tank' : v.kind === 'heli' ? 'heli' : v.kind === 'plane' ? 'plane' : 'car', heading: v.yaw, noRim: true, label: v.name });
      }
      if (this.alarm) {
        for (const s of this.soldiers) if (!s.a.dead && !s.a.removed) out.push({ x: s.a.pos.x, z: s.a.pos.z, type: 'enemy', noRim: true });
      }
    }

    stop() {
      if (!this.ok) return;
      this._hud(false);
      if (this.voice) {
        this.voice.stop();
        this.voice = null;
      }
    }

    reset() {
      if (!this.ok) return;
      this.stop();
      this._clearSoldiers();
      this.alarm = false;
      this.warn = -1;
      this._clearT = 0;
    }
  }

  // ------------------------------------------------------------------ map
  VH.MapPainters = VH.MapPainters || [];
  VH.MapPainters.push((g, layout, o) => {
    const f = layout.fort;
    if (!f) return;
    const R = o.R;
    const W = f.wall;
    g.fillStyle = 'rgba(120, 124, 96, 0.35)';
    R(W.x0, W.z0, W.x1, W.z1);
    g.fillStyle = '#4d5157';
    R(f.strip.x - f.strip.w / 2, f.strip.z0, f.strip.x + f.strip.w / 2, f.strip.z1);
    g.fillStyle = '#62666b';
    R(f.roadX - 6, -370, f.roadX + 6, 370);
    R(f.parade.x1, f.gate.z0 + 1, W.x1, f.gate.z1 - 1);
    R(f.strip.x + f.strip.w / 2, 240, f.roadX - 6, 256);
    R(f.strip.x + f.strip.w / 2, -296, f.roadX - 6, -284);
    g.fillStyle = '#9b9a92';
    R(f.parade.x0, f.parade.z0, f.parade.x1, f.parade.z1);
    R(f.roadX + 6, f.motor.z0, f.motor.x1, f.motor.z1);
    for (const h of f.helipads) R(h.x - 12, h.z - 12, h.x + 12, h.z + 12);
    g.fillStyle = 'rgba(240, 240, 235, 0.8)';
    for (let z = f.strip.z0 + 40; z < f.strip.z1 - 40; z += 40) R(f.strip.x - 0.6, z, f.strip.x + 0.6, z + 22);
    const bld = (x0, z0, x1, z1, col) => {
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      R(x0 + 2, z0 + 2, x1 + 2, z1 + 2);
      g.fillStyle = col;
      R(x0, z0, x1, z1);
    };
    bld(f.hq.x0, f.hq.z0, f.hq.x1, f.hq.z1, '#c9c1a8');
    for (const b of f.barracks) bld(b.x0, b.z0, b.x1, b.z1, '#c2bb9c');
    bld(f.roadX + 12, f.motor.z1 - 1, f.motor.x1, f.motor.z1 + 16, '#a9a48f');
    bld(f.strip.x - f.strip.w / 2 - 52, 280, f.strip.x - f.strip.w / 2 - 8, 320, '#a8a59a');
    for (const [x, z] of f.fuel) {
      g.fillStyle = '#c8c4b6';
      o.circle(x, z, 6);
    }
    // The walls.
    g.fillStyle = '#d9d4c6';
    R(W.x0 - 0.6, W.z0 - 0.6, W.x1 + 0.6, W.z0 + 0.6);
    R(W.x0 - 0.6, W.z1 - 0.6, W.x1 + 0.6, W.z1 + 0.6);
    R(W.x0 - 0.6, W.z0, W.x0 + 0.6, W.z1);
    R(W.x1 - 0.6, W.z0, W.x1 + 0.6, f.gate.z0);
    R(W.x1 - 0.6, f.gate.z1, W.x1 + 0.6, W.z1);
    g.fillStyle = '#5d6b3c';
    for (const [x, z] of f.towers) R(x - 2.2, z - 2.2, x + 2.2, z + 2.2);
  });

  // Shared with area51.js (the same builder kit and the same guard brain).
  Fort.kit = { pave, asphalt, mark, solid, block, sandbags, crates, floodMast, helipad, ARMY_LOOK, soldierBrain };

  VH.Fort = Fort;
})();
