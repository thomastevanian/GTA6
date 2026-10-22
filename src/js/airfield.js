/*
 * airfield.js — Vicehaven International, the airport north of the city.
 *
 * Grand Avenue runs north from Northgate Heights through open country to
 * Airport Road, where the terminal stands. Airside, behind the fence: the
 * apron with its jet bridges, a control tower, a general-aviation apron
 * with two hangars and a helipad, a parallel taxiway and runway 09/27
 * (1.3 km, east-west; departures go out over the bay). A service gate off
 * Airport Road lets Jay in.
 *
 *   VH.Airfield.build(world, layout)      the geometry (world build time)
 *   VH.Airfield.registerPlaces(world, p)  airport_terminal, _apron, ...
 *   new VH.Airfield(game)                 the parked aircraft Jay can take
 *                                         (fixed vehicle spots), blips, the
 *                                         tower's radar and the windsock,
 *                                         and the airliners that take off
 *                                         and land on their own.
 *
 * Everything static goes into the shared chunk builders, so the airport
 * costs a handful of draw calls, not one per light.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep } = VH.math;
  const F = () => VH.COLLIDE;

  // ---------------------------------------------------------------- plan
  const RWY = { x0: -1000, x1: 300, z: -1450, w: 60 }; // runway 09/27
  const TWY = { x0: -960, x1: 260, z: -1365, w: 24 }; // parallel taxiway
  const LINKS = [-950, -600, -250, 100, 250]; // runway <-> taxiway connectors (x)
  const APRON = { x0: -520, x1: 60, z0: -1352, z1: -1250 };
  const GA = { x0: 60, x1: 330, z0: -1352, z1: -1200 };
  const SERVICE = { x0: 30, x1: 60, z0: -1250, z1: -1189 }; // gate road from Airport Road
  const TERMINAL = { x0: -430, x1: -80, z0: -1245, z1: -1196, h: 15 };
  const TOWER = { x: -40, z: -1225 };
  const HANGARS = [{ x0: 90, x1: 170 }, { x0: 200, x1: 280 }]; // z -1262..-1205, doors north
  const HELIPAD = { x: 302, z: -1300 };
  const CARPARK = { x0: -400, x1: -120, z0: -1171, z1: -1112 };
  const FENCE_Z = -1194; // the airside fence runs along here (landside is south of it)
  const STANDS = [{ x: -300, z: -1300 }, { x: -160, z: -1300 }];
  const KERB = 0.15;

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
        const ctx = world.ctxAt((x + xb) / 2, (z + zb) / 2);
        ctx.asphaltTop.topRect(x, z, xb, zb, 0.014, VH.col(tone || 0x9a9a9a), 6);
        world.physics.addBox(x, -1, z, xb, 0, zb, 'road', F().SOLID);
      }
    }
  }

  /** A painted rectangle (markings) a hair above the paving. */
  function mark(world, x0, z0, x1, z1, color, y) {
    const ctx = world.ctxAt((x0 + x1) / 2, (z0 + z1) / 2);
    ctx.marks.topRect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y || 0.02, VH.col(color));
  }

  /** A little light on a stalk (runway and taxiway edges, approach lights). */
  function lamp(world, x, z, hex, mul, h) {
    const ctx = world.ctxAt(x, z);
    const top = h || 0.32;
    ctx.prop.box(x - 0.05, 0, z - 0.05, x + 0.05, top - 0.08, z + 0.05, VH.col(0x5a5f66));
    ctx.screen.box(x - 0.14, top - 0.1, z - 0.14, x + 0.14, top + 0.06, z + 0.14, VH.col(hex, mul || 2.4));
  }

  /** A box drawn into a surface and made solid. */
  function solid(world, surf, x0, y0, z0, x1, y1, z1, color, opts, tag) {
    surf.box(x0, y0, z0, x1, y1, z1, VH.col(color), opts);
    world.physics.addBox(x0, Math.min(y0, 0), z0, x1, y1, z1, tag || 'building', F().ALL);
  }

  /** Chain-link fence with gaps (after outskirts.js). */
  function fence(world, x0, z0, x1, z1, gaps) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const fixed = alongX ? z0 : x0;
    const segs = [];
    let cur = a0;
    for (const [g0, g1] of (gaps || []).slice().sort((p, q) => p[0] - q[0])) {
      if (g0 > cur) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < a1) segs.push([cur, a1]);
    const post = VH.col(0x7d838a);
    const mesh = VH.col(0x3a3f45);
    for (const [s0, s1] of segs) {
      for (let c0 = s0; c0 < s1; c0 += 96) {
        const c1 = Math.min(s1, c0 + 96);
        const ctx = world.ctxAt(alongX ? (c0 + c1) / 2 : fixed, alongX ? fixed : (c0 + c1) / 2);
        for (let p = c0; p <= c1 + 0.01; p += 3) {
          const x = alongX ? p : fixed;
          const z = alongX ? fixed : p;
          ctx.prop.box(x - 0.05, 0, z - 0.05, x + 0.05, 2.6, z + 0.05, post);
        }
        for (const y of [0.3, 1.3, 2.45]) {
          if (alongX) ctx.prop.box(c0, y, fixed - 0.03, c1, y + 0.05, fixed + 0.03, post);
          else ctx.prop.box(fixed - 0.03, y, c0, fixed + 0.03, y + 0.05, c1, post);
        }
        if (alongX) ctx.propMatte.box(c0, 0.3, fixed - 0.01, c1, 2.45, fixed + 0.01, mesh);
        else ctx.propMatte.box(fixed - 0.01, 0.3, c0, fixed + 0.01, 2.45, c1, mesh);
      }
      if (alongX) world.physics.addBox(s0, 0, fixed - 0.1, s1, 2.6, fixed + 0.1, 'fence', F().SOLID | F().CAMERA);
      else world.physics.addBox(fixed - 0.1, 0, s0, fixed + 0.1, 2.6, s1, 'fence', F().SOLID | F().CAMERA);
    }
  }

  /** Big block digits for the runway designators, drawn from 3 x 5 cells. */
  const DIGITS = {
    0: ['111', '101', '101', '101', '111'], 2: ['111', '001', '111', '100', '111'],
    7: ['111', '001', '010', '010', '010'], 9: ['111', '101', '111', '001', '111'],
  };
  function designator(world, text, cx, cz, facing) {
    // facing +1: read by a plane rolling east (x grows); -1 rolling west.
    const cell = 3.2;
    const digitW = cell * 3;
    const gap = 3;
    const total = text.length * digitW + (text.length - 1) * gap;
    for (let i = 0; i < text.length; i++) {
      const rows = DIGITS[text[i]];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if (rows[r][c] !== '1') continue;
          // The top of each digit is the far end, as a landing pilot reads it.
          const along = cx + facing * ((2.5 - r) * cell * 1.6);
          const across = cz + facing * (-total / 2 + i * (digitW + gap) + c * cell + cell / 2);
          const a0 = along - cell * 0.8;
          const a1 = along + cell * 0.8;
          mark(world, a0, across - cell / 2, a1, across + cell / 2, 0xf4f4ef, 0.022);
        }
      }
    }
  }

  // --------------------------------------------------------------- build
  class Airfield {
    static build(world, layout) {
      const data = {
        runway: RWY, taxiway: TWY, links: LINKS, apron: APRON, ga: GA, service: SERVICE, terminal: TERMINAL,
        tower: TOWER, hangars: HANGARS, helipad: HELIPAD, carpark: CARPARK, fenceZ: FENCE_Z, stands: STANDS,
        // The airside fence (see _fences): the GPS goes in by the service gate.
        fence: { minX: -1030, maxX: 345, minZ: -1510, maxZ: FENCE_Z }, gate: { x: 45, z: FENCE_Z + 8 },
      };
      layout.airport = data;
      Airfield._runway(world);
      Airfield._aprons(world);
      Airfield._terminal(world);
      Airfield._tower(world);
      Airfield._hangars(world);
      Airfield._landside(world, layout);
      Airfield._fences(world);
      return data;
    }

    static _runway(world) {
      const r = RWY;
      const z0 = r.z - r.w / 2;
      const z1 = r.z + r.w / 2;
      asphalt(world, r.x0 - 60, z0, r.x1 + 60, z1, 0x8c8c8c);
      // Blast pads at the ends (yellow chevrons on darker paving).
      for (const [xa, xb] of [[r.x0 - 60, r.x0], [r.x1, r.x1 + 60]]) {
        for (let x = xa + 6; x < xb - 4; x += 12) {
          mark(world, x, r.z - 1, x + 4, r.z + 1, 0xe0b12e);
          for (const s of [-1, 1]) mark(world, x, r.z + s * 6, x + 3, r.z + s * 9, 0xe0b12e);
        }
      }
      // Edge lines, threshold bars ("piano keys"), centre dashes, touchdown bars, aiming points.
      mark(world, r.x0, z0 + 1, r.x1, z0 + 1.9, 0xf4f4ef);
      mark(world, r.x0, z1 - 1.9, r.x1, z1 - 1, 0xf4f4ef);
      for (const [x, dir] of [[r.x0, 1], [r.x1, -1]]) {
        for (let i = 0; i < 12; i++) {
          const across = z0 + 4 + i * 4.6 + (i >= 6 ? 3.4 : 0);
          mark(world, x + dir * 4, across, x + dir * 34, across + 2.4, 0xf4f4ef);
        }
        mark(world, x + dir * 1, z0 + 2, x + dir * 2.4, z1 - 2, 0xf4f4ef);
        for (const t of [150, 300, 450]) {
          for (const s of [-1, 1]) mark(world, x + dir * t, r.z + s * 7, x + dir * (t + 22), r.z + s * 11, 0xf4f4ef);
        }
        for (const s of [-1, 1]) mark(world, x + dir * 300, r.z + s * 13, x + dir * 350, r.z + s * 20, 0xf4f4ef);
      }
      designator(world, '09', r.x0 + 62, r.z, 1);
      designator(world, '27', r.x1 - 62, r.z, -1);
      for (let x = r.x0 + 110; x < r.x1 - 110; x += 50) mark(world, x, r.z - 0.45, x + 30, r.z + 0.45, 0xf4f4ef);
      // Edge lights; green at the thresholds, red at the ends.
      for (let x = r.x0; x <= r.x1 + 0.1; x += 60) for (const z of [z0 - 1.5, z1 + 1.5]) lamp(world, x, z, 0xfff4dc, 2.2);
      for (let z = z0 + 3; z < z1 - 2; z += 6) {
        lamp(world, r.x0 - 1.5, z, 0x5cff8a, 2.6);
        lamp(world, r.x1 + 1.5, z, 0x5cff8a, 2.6);
        lamp(world, r.x0 - 60, z, 0xff4a3a, 2.6);
        lamp(world, r.x1 + 60, z, 0xff4a3a, 2.6);
      }
      // Approach lights west of the runway (east of it is the bay).
      for (let x = r.x0 - 90; x > r.x0 - 390; x -= 30) {
        for (let k = -2; k <= 2; k++) lamp(world, x, r.z + k * 2.5, 0xffffff, 2.8, 1.2);
      }
      // Windsock pole (the sock itself waves in the runtime) and a sign board.
      const ws = { x: r.x0 + 40, z: z0 - 30 };
      const ctx = world.ctxAt(ws.x, ws.z);
      ctx.prop.box(ws.x - 0.09, 0, ws.z - 0.09, ws.x + 0.09, 6.2, ws.z + 0.09, VH.col(0xd8dcdf));
      world.physics.addBox(ws.x - 0.12, 0, ws.z - 0.12, ws.x + 0.12, 6.2, ws.z + 0.12, 'pole', F().ALL);
      world.airfieldWindsock = { x: ws.x, y: 6.1, z: ws.z };
    }

    static _aprons(world) {
      const t = TWY;
      asphalt(world, t.x0, t.z - t.w / 2, t.x1, t.z + t.w / 2, 0x949494);
      for (let x = t.x0; x < t.x1; x += 10) mark(world, x, t.z - 0.3, Math.min(t.x1, x + 10), t.z + 0.3, 0xe0b12e);
      for (let x = t.x0; x <= t.x1 + 0.1; x += 40) for (const z of [t.z - t.w / 2 - 1, t.z + t.w / 2 + 1]) lamp(world, x, z, 0x3d7bff, 2.6, 0.3);
      const rz1 = RWY.z - RWY.w / 2; // runway north edge (it's north of the taxiway)
      const tz0 = t.z - t.w / 2;
      for (const x of LINKS) {
        asphalt(world, x - 12, rz1, x + 12, tz0, 0x949494);
        mark(world, x - 0.3, rz1, x + 0.3, tz0, 0xe0b12e);
        // Hold-short bars across the link near the runway.
        mark(world, x - 12, rz1 + 6, x + 12, rz1 + 6.5, 0xe0b12e);
        mark(world, x - 12, rz1 + 7.2, x + 12, rz1 + 7.7, 0xe0b12e);
      }
      pave(world, APRON.x0, APRON.z0, APRON.x1, APRON.z1, 0xbcbab3);
      pave(world, GA.x0, GA.z0, GA.x1, GA.z1, 0xb6b4ad);
      pave(world, SERVICE.x0, SERVICE.z0, SERVICE.x1, SERVICE.z1, 0xb0aea7);
      // Stand markings: a lead-in line and a stop bar for each airliner stand.
      for (const s of STANDS) {
        mark(world, s.x - 0.3, APRON.z0, s.x + 0.3, s.z + 22, 0xe0b12e);
        mark(world, s.x - 5, s.z + 19.5, s.x + 5, s.z + 20.2, 0xe0b12e);
        for (const k of [-1, 1]) mark(world, s.x + k * 20, s.z - 24, s.x + k * 20 + 0.4 * k, s.z + 24, 0xf4f4ef);
      }
      // Taxi lines from the taxiway onto the aprons.
      mark(world, -380, APRON.z0 - 1, -170, APRON.z0 - 0.4, 0xe0b12e);
      mark(world, 100, GA.z0 - 1, 300, GA.z0 - 0.4, 0xe0b12e);
      // Helipad: a circle of light posts, an H and a ring.
      const h = HELIPAD;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        lamp(world, h.x + Math.cos(a) * 10.5, h.z + Math.sin(a) * 10.5, 0x8dff9c, 2.2, 0.2);
      }
      mark(world, h.x - 9, h.z - 9, h.x + 9, h.z - 8.4, 0xf4f4ef, 0.021);
      mark(world, h.x - 9, h.z + 8.4, h.x + 9, h.z + 9, 0xf4f4ef, 0.021);
      mark(world, h.x - 9, h.z - 8.4, h.x - 8.4, h.z + 8.4, 0xf4f4ef, 0.021);
      mark(world, h.x + 8.4, h.z - 8.4, h.x + 9, h.z + 8.4, 0xf4f4ef, 0.021);
      mark(world, h.x - 3.4, h.z - 4.5, h.x - 2.2, h.z + 4.5, 0xf4f4ef, 0.022);
      mark(world, h.x + 2.2, h.z - 4.5, h.x + 3.4, h.z + 4.5, 0xf4f4ef, 0.022);
      mark(world, h.x - 2.2, h.z - 0.6, h.x + 2.2, h.z + 0.6, 0xf4f4ef, 0.022);
      // Ground equipment: a fuel bowser, baggage carts, a stair truck.
      const ctx = world.ctxAt(-230, -1275);
      for (const [x, z, sx, sz, c] of [[-232, -1272, 2.4, 7, 0xd7dbe0], [-205, -1262, 1.6, 3, 0xe0b12e], [-200, -1262, 1.6, 3, 0xe0b12e], [-195, -1262, 1.6, 3, 0xe0b12e]]) {
        solid(world, ctx.propMatte, x - sx / 2, 0, z - sz / 2, x + sx / 2, 2.2, z + sz / 2, c, null, 'vehicle');
      }
      world.floodlights = world.floodlights || [];
      for (const [x, z] of [[-470, -1300], [-90, -1340], [20, -1300], [180, -1330]]) Airfield._floodMast(world, x, z, 34);
    }

    static _floodMast(world, x, z, radius) {
      const ctx = world.ctxAt(x, z);
      ctx.prop.box(x - 0.2, 0, z - 0.2, x + 0.2, 18, z + 0.2, VH.col(0x8a9099));
      ctx.prop.box(x - 1.6, 17.6, z - 0.4, x + 1.6, 18.5, z + 0.4, VH.col(0x2b2f36));
      ctx.screen.box(x - 1.45, 17.42, z - 0.3, x + 1.45, 17.62, z + 0.3, VH.col(0xf4f7ff, 2.4));
      world.physics.addBox(x - 0.22, 0, z - 0.22, x + 0.22, 18, z + 0.22, 'pole', F().ALL);
      world.floodlights.push({ x, z, r: radius, y: 0.03 });
    }

    static _terminal(world) {
      const T = TERMINAL;
      const cx = (T.x0 + T.x1) / 2;
      const ctx = world.ctxAt(cx, (T.z0 + T.z1) / 2);
      const b = ctx.b;
      const glass = { bay: 4, floorH: 5, ww: 0.94, wh: 0.86, style: 2, seed: 7 };
      const fac = (blank) => (blank ? [0, 0, 0, 3] : [glass.ww, glass.wh, glass.style, glass.seed]);
      const stone = VH.col(0xe8e2d6);
      const walls = VH.col(0x9fb5c4);
      // A two-storey glass hall on a stone plinth, split into chunk-sized pieces.
      for (let x = T.x0; x < T.x1; x += 70) {
        const x1 = Math.min(T.x1, x + 70);
        const c2 = world.ctxAt((x + x1) / 2, (T.z0 + T.z1) / 2);
        c2.b.box(x, 0, T.z0, x1, 0.8, T.z1, stone, { skip: { top: true } });
        const bays = Math.round((x1 - x) / glass.bay);
        c2.b.wall([x, 0.8, T.z1], 1, 0, x1 - x, 10, walls, null, [0, bays, 0, 2], fac(false));
        c2.b.wall([x1, 0.8, T.z0], -1, 0, x1 - x, 10, walls, null, [0, bays, 0, 2], fac(false));
        // The wave roof: three overlapping bands rising to the middle, overhanging both sides.
        c2.b.box(x, 10.8, T.z0 - 3, x1, 11.4, T.z1 + 3, VH.col(0xf2f0ea), { bottom: true });
        c2.b.box(x, 11.4, T.z0 + 6, x1, 12.6, T.z1 - 6, VH.col(0xf2f0ea));
        c2.b.box(x, 12.6, T.z0 + 15, x1, 13.4, T.z1 - 15, VH.col(0xdedcd5));
      }
      for (const [x, ux, uz] of [[T.x0, 0, 1], [T.x1, 0, -1]]) {
        const o = ux === 0 && uz === 1 ? [T.x0, 0.8, T.z0] : [T.x1, 0.8, T.z1];
        b.wall(o, ux, uz, T.z1 - T.z0, 10, walls, null, [0, Math.round((T.z1 - T.z0) / glass.bay), 0, 2], fac(false));
      }
      world.physics.addBox(T.x0, 0, T.z0, T.x1, 13.4, T.z1, 'building', F().ALL);
      // The forecourt between the doors and Airport Road.
      pave(world, T.x0, T.z1, T.x1, -1189.2, 0xcfcac0, 0.016);
      // Drop-off canopy over the kerb with columns, and the big sign.
      const cz0 = T.z1;
      const cz1 = T.z1 + 6.2;
      for (let x = T.x0 + 20; x < T.x1 - 20; x += 70) {
        const x1 = Math.min(T.x1 - 20, x + 70);
        const c3 = world.ctxAt((x + x1) / 2, cz1);
        c3.prop.box(x, 6.2, cz0, x1, 6.6, cz1, VH.col(0xf2f0ea), { bottom: true });
        c3.screen.box(x + 0.5, 6.15, cz1 - 2, x1 - 0.5, 6.2, cz1 - 1.4, VH.col(0xfff1d8, 1.6));
      }
      for (let x = T.x0 + 25; x < T.x1 - 20; x += 25) solid(world, world.ctxAt(x, cz1).prop, x - 0.3, KERB, cz1 - 1, x + 0.3, 6.2, cz1 - 0.4, 0xd8d4cb, null, 'pole');
      (world.signs || (world.signs = [])).push({ x: cx, y: 9.3, z: T.z1 + 0.12, yaw: 0, w: 46, h: 3.4, lines: ['VICEHAVEN INTERNATIONAL'], style: 'monolith' });
      (world.signs || (world.signs = [])).push({ x: T.x0 + 60, y: 5.2, z: cz1 + 0.05, yaw: 0, w: 12, h: 1.2, lines: ['DEPARTURES  ✈'], style: 'info' });
      (world.signs || (world.signs = [])).push({ x: T.x1 - 60, y: 5.2, z: cz1 + 0.05, yaw: 0, w: 12, h: 1.2, lines: ['ARRIVALS  ✈'], style: 'info' });
      // Jet bridges out to the two stands.
      for (const s of STANDS) {
        const c4 = world.ctxAt(s.x, T.z0 - 12);
        const bx0 = s.x - 6.5;
        solid(world, c4.prop, bx0 - 1.8, 4.2, T.z0 - 14, bx0 + 1.8, 7.0, T.z0, 0xc9ccd0, { bottom: true }, 'bridge');
        solid(world, c4.prop, bx0 - 2.6, 4.0, T.z0 - 19, bx0 + 2.6, 7.4, T.z0 - 14, 0xb5b9be, { bottom: true }, 'bridge');
        solid(world, c4.prop, bx0 - 0.5, 0, T.z0 - 17, bx0 + 0.5, 4.0, T.z0 - 16, 0x5a5f66, null, 'pole');
        c4.screen.box(bx0 - 1.7, 6.95, T.z0 - 13.8, bx0 + 1.7, 7.0, T.z0 - 0.2, VH.col(0xfff1d8, 1.2));
      }
    }

    static _tower(world) {
      const t = TOWER;
      const ctx = world.ctxAt(t.x, t.z);
      const shaft = VH.col(0xe6e3dc);
      ctx.b.box(t.x - 3.6, 0, t.z - 3.6, t.x + 3.6, 44, t.z + 3.6, shaft, { top: shaft });
      // Vertical window slits up the shaft.
      for (const [o, ux, uz] of [[[t.x - 1, 6, t.z + 3.61], 1, 0], [[t.x + 1, 6, t.z - 3.61], -1, 0]]) ctx.b.wall(o, ux, uz, 2, 36, VH.col(0x9fb5c4), null, [0, 1, 0, 12], [0.8, 0.85, 2, 5]);
      // The cab: a wider band of glass, a roof and a mast.
      ctx.b.box(t.x - 6.5, 44, t.z - 6.5, t.x + 6.5, 45.2, t.z + 6.5, VH.col(0xcfcac0), { bottom: true });
      const cab = VH.col(0x4d6a82);
      for (const [o, ux, uz] of [[[t.x - 6, 45.2, t.z + 6], 1, 0], [[t.x + 6, 45.2, t.z - 6], -1, 0], [[t.x + 6, 45.2, t.z + 6], 0, -1], [[t.x - 6, 45.2, t.z - 6], 0, 1]]) {
        ctx.b.wall(o, ux, uz, 12, 5, cab, null, [0, 4, 0, 1], [0.92, 0.9, 2, 9]);
      }
      ctx.screen.box(t.x - 5.9, 45.25, t.z - 5.9, t.x + 5.9, 50.1, t.z + 5.9, VH.col(0x9fd8ff, 0.35));
      ctx.b.box(t.x - 7, 50.2, t.z - 7, t.x + 7, 51.2, t.z + 7, VH.col(0xf2f0ea), { bottom: true });
      ctx.prop.box(t.x - 0.15, 51.2, t.z - 0.15, t.x + 0.15, 58, t.z + 0.15, VH.col(0x8a9099));
      world.physics.addBox(t.x - 3.6, 0, t.z - 3.6, t.x + 3.6, 44, t.z + 3.6, 'building', F().ALL);
      world.physics.addBox(t.x - 7, 44, t.z - 7, t.x + 7, 51.2, t.z + 7, 'building', F().ALL);
      world.beacons.push({ x: t.x, y: 58.2, z: t.z });
      world.airfieldRadar = { x: t.x + 3, y: 51.2, z: t.z + 3 };
    }

    static _hangars(world) {
      const z0 = -1262;
      const z1 = -1205;
      for (const [i, hg] of HANGARS.entries()) {
        const ctx = world.ctxAt((hg.x0 + hg.x1) / 2, (z0 + z1) / 2);
        const wall = VH.col(i ? 0x8e959c : 0x9aa1a8);
        const trim = VH.colMul(wall, 0.72);
        const H = 14;
        // Side and back walls (the front is a big open door facing the apron).
        solid(world, ctx.prop, hg.x0, 0, z0, hg.x0 + 0.5, H, z1, i ? 0x8e959c : 0x9aa1a8);
        solid(world, ctx.prop, hg.x1 - 0.5, 0, z0, hg.x1, H, z1, i ? 0x8e959c : 0x9aa1a8);
        solid(world, ctx.prop, hg.x0, 0, z1 - 0.5, hg.x1, H, z1, i ? 0x8e959c : 0x9aa1a8);
        solid(world, ctx.prop, hg.x0, 10.5, z0, hg.x1, H, z0 + 0.6, i ? 0x8e959c : 0x9aa1a8, { bottom: true });
        // The curved roof: a few stepped slabs, and the inside of it.
        for (let k = 0; k < 4; k++) {
          const inset = k * 7;
          ctx.prop.box(hg.x0 - 0.3, H + k * 0.9, z0 + inset * 0.15 - 0.3, hg.x1 + 0.3, H + (k + 1) * 0.9, z1 - inset * 0.15 + 0.3, k % 2 ? trim : wall, { bottom: k === 0 });
        }
        world.physics.addBox(hg.x0, H, z0, hg.x1, H + 3.6, z1, 'building', F().ALL);
        // Ribs on the walls, lights inside, a floor.
        for (let x = hg.x0 + 4; x < hg.x1 - 2; x += 6) ctx.prop.box(x - 0.1, 0, z1 + 0.0, x + 0.1, H, z1 + 0.15, trim);
        ctx.concrete.topRect(hg.x0 + 0.5, z0, hg.x1 - 0.5, z1 - 0.5, 0.02, VH.col(0x9d9b95), 6);
        for (let x = hg.x0 + 10; x < hg.x1 - 5; x += 15) ctx.screen.box(x - 2, H - 0.25, (z0 + z1) / 2 - 0.4, x + 2, H - 0.1, (z0 + z1) / 2 + 0.4, VH.col(0xf4f7ff, 1.8));
        (world.signs || (world.signs = [])).push({ x: (hg.x0 + hg.x1) / 2, y: 12.2, z: z0 - 0.1, yaw: Math.PI, w: 20, h: 1.8, lines: [i ? 'HANGAR 2  ·  CHARTER' : 'HANGAR 1  ·  ARDEA FLYING CLUB'], style: 'info' });
      }
    }

    static _landside(world, layout) {
      // Car park: bays and lamp posts.
      const C = CARPARK;
      pave(world, C.x0, C.z0, C.x1, C.z1, 0x8f8f8f, 0.014);
      for (let x = C.x0 + 4; x < C.x1 - 4; x += 3) {
        mark(world, x, C.z0 + 4, x + 0.12, C.z0 + 9, 0xf4f4ef, 0.022);
        mark(world, x, C.z1 - 9, x + 0.12, C.z1 - 4, 0xf4f4ef, 0.022);
      }
      for (let x = C.x0 + 20; x < C.x1; x += 40) world.addProp('streetlight', x, 0, (C.z0 + C.z1) / 2, 0, 1);
      // Street lights along Grand Avenue to the airport and along Airport Road,
      // where the roadside strips (suburbs.js) don't already light the pavement.
      const strips = layout.strips || [];
      const onStrip = (x, z) => strips.some((s) => x >= s.x0 - 1 && x <= s.x1 + 1 && z >= s.z0 - 1 && z <= s.z1 + 1);
      const lamp = (x, z, yaw) => {
        if (!onStrip(x, z)) world.addProp('streetlight', x, 0, z, yaw, 1);
      };
      for (let z = -1160; z < -660; z += 38) {
        lamp(15.5, z, -Math.PI / 2);
        if (z + 19 < -655) lamp(-15.5, z + 19, Math.PI / 2); // not inside the Northgate plaza
      }
      for (let x = -740; x < 330; x += 40) {
        if (x > -440 && x < -70) continue; // the terminal's canopy
        if (Math.abs(x) < 20 || (x > 20 && x < 70)) continue; // the junction, the gate
        lamp(x, -1191.5, 0);
        if (Math.abs(x + 20) > 20) lamp(x + 20, -1168.5, Math.PI); // not on Grand Avenue itself
      }
      (world.signs || (world.signs = [])).push({ x: 26, y: 3.2, z: -1150, yaw: -Math.PI / 2, w: 9, h: 3, lines: ['VICEHAVEN', 'INTERNATIONAL ✈'], style: 'welcome' });
      const ctx = world.ctxAt(26, -1150);
      ctx.prop.box(25.8, 0, -1154.2, 26.2, 1.7, -1153.8, VH.col(0x5a5f66));
      ctx.prop.box(25.8, 0, -1146.2, 26.2, 1.7, -1145.8, VH.col(0x5a5f66));
    }

    static _fences(world) {
      const z = FENCE_Z;
      const W = -1030;
      const E = 345;
      const N = -1510;
      // Landside line: west of the terminal, between it and the gate, east of the gate.
      fence(world, W, z, TERMINAL.x0, z);
      fence(world, TERMINAL.x1, z, SERVICE.x0, z);
      fence(world, SERVICE.x1, z, E, z);
      fence(world, E, z, E, N);
      fence(world, W, N, E, N);
      fence(world, W, z, W, N);
      // The gate: a guard hut and a raised barrier arm.
      const ctx = world.ctxAt(SERVICE.x0, z);
      solid(world, ctx.prop, SERVICE.x0 - 4.5, 0, z + 1, SERVICE.x0 - 1, 2.8, z + 4, 0xe8e2d6, null, 'building');
      ctx.screen.box(SERVICE.x0 - 1.02, 1.2, z + 1.5, SERVICE.x0 - 0.98, 2.2, z + 3.5, VH.col(0xfff1d8, 1.0));
      ctx.prop.box(SERVICE.x0 - 0.3, 0, z - 0.3, SERVICE.x0 + 0.3, 1.1, z + 0.3, VH.col(0xe0b12e));
      ctx.prop.box(SERVICE.x0 - 0.08, 1.0, z - 0.08, SERVICE.x0 + 0.08, 7.5, z + 0.08, VH.col(0xd8262e));
      (world.signs || (world.signs = [])).push({ x: SERVICE.x1 + 6, y: 2.4, z: z + 0.5, yaw: 0, w: 8, h: 1.6, lines: ['AIRSIDE', 'Authorised vehicles only'], style: 'info' });
    }

    static registerPlaces(world, places) {
      if (!world.airfield) return;
      const T = TERMINAL;
      places.add('airport_terminal', { name: 'Vicehaven International, Departures', x: (T.x0 + T.x1) / 2, z: T.z1 + 4, yaw: Math.PI, kind: 'airport', district: 'airport' });
      places.add('airport_apron', { name: 'The apron, Vicehaven International', x: -230, z: -1320, yaw: Math.PI, kind: 'airport', district: 'airport' });
      places.add('airport_hangars', { name: 'The hangars, Vicehaven International', x: 185, z: -1285, yaw: 0, kind: 'airport', district: 'airport' });
      places.add('airport_helipad', { name: 'The helipad, Vicehaven International', x: HELIPAD.x - 14, z: HELIPAD.z, yaw: Math.PI / 2, kind: 'airport', district: 'airport' });
      places.add('airport_gate', { name: 'The airside gate, Airport Road', x: 45, z: -1186, yaw: Math.PI, kind: 'airport', district: 'airport' });
    }

    // ------------------------------------------------------------ runtime
    constructor(game) {
      this.game = game;
      this.ok = !!game.world.airfield;
      if (!this.ok) return;
      this.spots = [];
      const V = game.vehicles;
      const add = (type, x, z, yaw, color) => {
        if (!VH.Vehicle.typeSpec(type)) return;
        this.spots.push(V.addFixedSpot({ type, x, z, yaw, color, r: type === 'albatross' ? 24 : type === 'bison' ? 13 : 9 }));
      };
      // Nose out toward the taxiway (it can't push back).
      add('albatross', STANDS[0].x, STANDS[0].z, Math.PI);
      add('skylark', 130, -1290, Math.PI);
      add('skylark', 240, -1290, Math.PI);
      add('kestrel', 200, -1325, Math.PI);
      add('bison', 120, -1335, Math.PI);
      add('sparrow', HELIPAD.x, HELIPAD.z, Math.PI);
      this._buildAnimated();
      this.traffic = new AirTraffic(game);
      this.race = VH.AirRace ? new VH.AirRace(game) : null; // aircraft-races.js
    }

    _buildAnimated() {
      const g = this.game;
      const w = g.world;
      // The windsock: a striped cone that swings with the (fixed) wind.
      const ws = w.airfieldWindsock;
      if (ws) {
        const geo = new THREE.CylinderGeometry(0.42, 0.18, 3.2, 10, 1, true);
        geo.rotateZ(-Math.PI / 2);
        geo.translate(1.6, 0, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.8, side: THREE.DoubleSide });
        this.sock = new THREE.Mesh(geo, mat);
        this.sock.position.set(ws.x, ws.y, ws.z);
        g.scene.add(this.sock);
      }
      const rd = w.airfieldRadar;
      if (rd) {
        const geo = new THREE.BoxGeometry(5, 1.1, 0.25);
        geo.translate(0, 1.6, 0);
        this.radar = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.5 }));
        this.radar.position.set(rd.x, rd.y, rd.z);
        g.scene.add(this.radar);
      }
      this._t = 0;
    }

    update(dt) {
      if (!this.ok) return;
      this._t += dt;
      if (this.radar) this.radar.rotation.y += dt * 1.6;
      if (this.sock) {
        // Wind from the east-southeast, gusting.
        const gust = Math.sin(this._t * 0.7) * 0.15 + Math.sin(this._t * 2.3) * 0.05;
        this.sock.rotation.set(0, Math.PI * 0.9 + gust, -0.18 + gust * 0.6);
      }
      this.traffic.update(dt);
      if (this.race) this.race.update(dt);
    }

    blips(out, missionRunning) {
      if (!this.ok) return; // parked aircraft show during jobs too
      for (const s of this.spots) {
        const v = s.v;
        if (!v || v.removed || v.wrecked || v.driver) continue;
        if (Math.hypot(v.pos.x - s.x, v.pos.z - s.z) > 30) continue;
        out.push({ x: v.pos.x, z: v.pos.z, type: v.kind === 'heli' ? 'heli' : 'plane', heading: v.yaw, noRim: true, label: v.name });
      }
      if (this.race && !missionRunning) this.race.blips(out);
    }

    reset() {
      if (this.traffic) this.traffic.reset();
      if (this.race) this.race.reset();
    }

    stop() {
      if (this.traffic) this.traffic.stopSound();
      if (this.race) this.race.stop();
    }
  }

  // ---------------------------------------------------------- air traffic
  /**
   * Airliners that use the runway on their own: one takes off every few
   * minutes and climbs out over the bay; another comes in over the water,
   * lands, rolls out and turns off. Scenery only (no physics, not in the
   * vehicle list): they hold short if Jay is on the runway, and an arrival
   * goes around. Each has a jet voice that carries a long way.
   */
  class AirTraffic {
    constructor(game) {
      this.game = game;
      this.planes = [];
      this._next = 25; // first movement soon after the game starts
      this._kind = 0;
    }

    _jayOnRunway() {
      const p = this.game.player.pos;
      return p.x > RWY.x0 - 80 && p.x < RWY.x1 + 80 && Math.abs(p.z - RWY.z) < RWY.w / 2 + 10 && p.y < 30;
    }

    update(dt) {
      const g = this.game;
      if (!VH.AircraftModels) return;
      this._next -= dt;
      if (this._next <= 0 && this.planes.length < 2) {
        this._next = 95 + Math.random() * 70;
        this._spawn(this._kind++ % 2 === 0 ? 'departure' : 'arrival');
      }
      for (const pl of this.planes) this._fly(pl, dt);
      for (const pl of this.planes.filter((q) => q.done)) {
        g.scene.remove(pl.model.root);
        pl.model.dispose();
        if (pl.voice) pl.voice.stop();
      }
      this.planes = this.planes.filter((q) => !q.done);
    }

    _spawn(kind) {
      const g = this.game;
      const colors = [0x1fa3a3, 0xff4f8b, 0x1d4fb8, 0xd29a1c];
      const model = VH.AircraftModels.build('albatross', colors[Math.floor(Math.random() * colors.length)]);
      g.scene.add(model.root);
      const pl = { kind, model, t: 0, phase: kind === 'departure' ? 'hold' : 'approach', x: 0, y: 0, z: RWY.z, speed: 0, pitch: 0, yaw: 0, voice: null, done: false };
      if (kind === 'departure') {
        // Lined up at the west end, rolling east.
        pl.x = RWY.x0 + 20;
        pl.yaw = Math.PI / 2;
      } else {
        // Over the bay, three degrees down to the east end, landing westbound.
        pl.x = 3400;
        pl.y = Math.tan(0.052) * (3400 - (RWY.x1 - 150));
        pl.speed = 72;
        pl.yaw = -Math.PI / 2;
      }
      this.planes.push(pl);
    }

    _fly(pl, dt) {
      const g = this.game;
      pl.t += dt;
      const busy = this._jayOnRunway();
      if (pl.kind === 'departure') {
        if (pl.phase === 'hold') {
          if (pl.t > 8 && !busy) pl.phase = 'roll';
        } else if (pl.phase === 'roll') {
          if (busy && pl.speed < 50) pl.speed = Math.max(0, pl.speed - 6 * dt); // reject the takeoff
          else pl.speed += 2.4 * dt;
          if (pl.speed > 66) pl.phase = 'climb';
        } else {
          pl.speed = Math.min(110, pl.speed + 1.2 * dt);
          pl.pitch = Math.min(0.17, pl.pitch + 0.08 * dt);
          pl.y += Math.sin(pl.pitch) * pl.speed * dt;
        }
        pl.x += Math.cos(pl.pitch) * pl.speed * dt;
        if (pl.x > 4200) pl.done = true;
      } else {
        const tdx = RWY.x1 - 150;
        if (pl.phase === 'approach') {
          if (busy && pl.x < tdx + 1600) pl.phase = 'goaround';
          pl.x -= pl.speed * dt;
          pl.y = Math.max(0, Math.tan(0.052) * (pl.x - tdx));
          pl.pitch = 0.04;
          if (pl.x <= tdx) {
            pl.phase = 'rollout';
            pl.y = 0;
          }
        } else if (pl.phase === 'goaround') {
          pl.pitch = Math.min(0.15, pl.pitch + 0.06 * dt);
          pl.speed = Math.min(105, pl.speed + 2 * dt);
          pl.x -= pl.speed * dt;
          pl.y += Math.sin(pl.pitch) * pl.speed * dt;
          if (pl.x < -3000) pl.done = true;
        } else {
          pl.pitch = Math.max(0, pl.pitch - 0.1 * dt);
          pl.speed = Math.max(8, pl.speed - 3.2 * dt);
          pl.x -= pl.speed * dt;
          // Turned off at the far end: gone once nobody's looking.
          if (pl.x < RWY.x0 + 80 && (!g.isVisible(pl.x, 4, pl.z, 25) || pl.x < RWY.x0 - 40)) pl.done = true;
        }
      }
      const m = pl.model;
      m.root.position.set(pl.x, pl.y, pl.z);
      m.root.rotation.set(0, pl.yaw, 0);
      m.body.rotation.set(-pl.pitch, 0, 0);
      m.setNav(true, pl.t);
      if (m.gear) m.gear.visible = pl.y < 120;
      this._sound(pl);
    }

    _sound(pl) {
      const g = this.game;
      const audio = g.audio;
      const fb = g.vehicleFeedback;
      if (!audio || !audio.ready || !audio.createJet || !fb) return;
      const gain = fb._gain(pl.x, pl.z, 70, pl.y) * 0.9;
      if (!pl.voice && gain > 0.02) pl.voice = audio.createJet();
      if (pl.voice) pl.voice.update({ gain, pan: fb._pan(pl.x, pl.z), thrust: pl.kind === 'departure' && pl.phase !== 'hold' ? 0.9 : 0.45, burner: 0 });
    }

    stopSound() {
      for (const pl of this.planes) {
        if (pl.voice) pl.voice.stop();
        pl.voice = null;
      }
    }

    reset() {
      for (const pl of this.planes) pl.done = true;
      this.update(0);
      this._next = 25;
    }
  }

  // ------------------------------------------------------------------ map
  VH.MapPainters = VH.MapPainters || [];
  VH.MapPainters.push((g, layout, o) => {
    const a = layout.airport;
    if (!a) return;
    const R = o.R;
    const r = a.runway;
    g.fillStyle = '#9b9f9c';
    R(a.apron.x0, a.apron.z0, a.apron.x1, a.apron.z1);
    R(a.ga.x0, a.ga.z0, a.ga.x1, a.ga.z1);
    R(a.service.x0, a.service.z0, a.service.x1, a.service.z1);
    R(a.carpark.x0, a.carpark.z0, a.carpark.x1, a.carpark.z1);
    g.fillStyle = '#4d5157';
    R(r.x0 - 60, r.z - r.w / 2, r.x1 + 60, r.z + r.w / 2);
    R(a.taxiway.x0, a.taxiway.z - a.taxiway.w / 2, a.taxiway.x1, a.taxiway.z + a.taxiway.w / 2);
    for (const x of a.links) R(x - 12, r.z + r.w / 2, x + 12, a.taxiway.z - a.taxiway.w / 2);
    g.fillStyle = 'rgba(240, 240, 235, 0.85)';
    for (let x = r.x0 + 110; x < r.x1 - 110; x += 50) R(x, r.z - 0.6, x + 30, r.z + 0.6);
    for (const [x, d] of [[r.x0, 1], [r.x1, -1]]) for (let i = 0; i < 12; i++) R(Math.min(x + d * 4, x + d * 34), r.z - r.w / 2 + 4 + i * 4.6 + (i >= 6 ? 3.4 : 0), Math.max(x + d * 4, x + d * 34), r.z - r.w / 2 + 6.4 + i * 4.6 + (i >= 6 ? 3.4 : 0));
    g.fillStyle = 'rgba(224, 177, 46, 0.8)';
    R(a.taxiway.x0, a.taxiway.z - 0.5, a.taxiway.x1, a.taxiway.z + 0.5);
    // Buildings with a shadow.
    const bld = (x0, z0, x1, z1, col) => {
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      R(x0 + 2, z0 + 2, x1 + 2, z1 + 2);
      g.fillStyle = col;
      R(x0, z0, x1, z1);
    };
    const T = a.terminal;
    bld(T.x0, T.z0, T.x1, T.z1, '#d9dfe4');
    for (const s of a.stands) bld(s.x - 8.3, T.z0 - 19, s.x - 4.7, T.z0, '#c9ccd0');
    for (const h of a.hangars) bld(h.x0, -1262, h.x1, -1205, '#9aa1a8');
    bld(a.tower.x - 6.5, a.tower.z - 6.5, a.tower.x + 6.5, a.tower.z + 6.5, '#e6e3dc');
    g.fillStyle = 'rgba(141, 255, 156, 0.6)';
    o.circle(a.helipad.x, a.helipad.z, 10.5);
    g.fillStyle = '#9b9f9c';
    o.circle(a.helipad.x, a.helipad.z, 9);
    g.fillStyle = 'rgba(244, 244, 239, 0.9)';
    R(a.helipad.x - 3.4, a.helipad.z - 4.5, a.helipad.x - 2.2, a.helipad.z + 4.5);
    R(a.helipad.x + 2.2, a.helipad.z - 4.5, a.helipad.x + 3.4, a.helipad.z + 4.5);
    R(a.helipad.x - 2.2, a.helipad.z - 0.6, a.helipad.x + 2.2, a.helipad.z + 0.6);
    // The fence line.
    g.fillStyle = 'rgba(30, 34, 40, 0.55)';
    const fz = a.fenceZ;
    R(-1030, fz - 0.6, 345, fz + 0.6);
    R(-1030, -1510.6, 345, -1509.4);
    R(-1030.6, -1510, -1029.4, fz);
    R(344.4, -1510, 345.6, fz);
  });

  VH.Airfield = Airfield;
})();
