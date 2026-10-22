/*
 * outskirts.js — the two districts outside the downtown grid.
 *
 *   Saltmarsh Docks (south-east): freight sheds, container yards, the
 *   Pier 9 transfer yard with its numbered loading bays, ship-to-shore
 *   gantry cranes on the quay, a freighter at its berth, a boatyard and the
 *   fish market.
 *
 *   Crestline Estates (west): walled mansions along Crestline Drive with
 *   gates, lawns, pools and palms, and the Voss compound, the biggest of
 *   them all, with a helipad, an infinity pool and a fountain court.
 *
 * Both register named spots with places.js, so the story can stage scenes
 * at "a warehouse in the docks" or "a mansion in Crestline" and always land
 * somewhere that fits.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;
  const F = () => VH.COLLIDE;

  function solid(world, x0, y0, z0, x1, y1, z1, tag) {
    world.physics.addBox(x0, y0, z0, x1, y1, z1, tag || 'building', F().ALL);
  }

  /** Paved yard: concrete top at ground level, with a road-tagged collider for grip and sound. */
  function apron(world, x0, z0, x1, z1, tone) {
    for (let x = x0; x < x1; x += 96) {
      for (let z = z0; z < z1; z += 96) {
        const xa = x;
        const za = z;
        const xb = Math.min(x1, x + 96);
        const zb = Math.min(z1, z + 96);
        const ctx = world.ctxAt((xa + xb) / 2, (za + zb) / 2);
        ctx.concrete.topRect(xa, za, xb, zb, 0.012, VH.col(tone || 0xb8b6b0), 6); // pale dock concrete, not road asphalt
        world.physics.addBox(xa, -1, za, xb, 0, zb, 'road', F().SOLID);
      }
    }
  }

  /** A shipping container (12.2 × 2.44 × 2.6) with end frames and ribbed sides. */
  function container(ctx, x, z, alongX, y, color) {
    const L = 12.2 / 2;
    const W = 2.44 / 2;
    const H = 2.6;
    const hx = alongX ? L : W;
    const hz = alongX ? W : L;
    const c = VH.col(color);
    const dark = VH.colMul(c, 0.62);
    ctx.propMatte.box(x - hx, y, z - hz, x + hx, y + H, z + hz, c);
    // Ribs along the long sides (a few thin strips read as corrugation).
    const n = 9;
    for (let i = 1; i < n; i++) {
      const t = -1 + (2 * i) / n;
      if (alongX) {
        ctx.propMatte.box(x + t * L - 0.06, y + 0.1, z - hz - 0.03, x + t * L + 0.06, y + H - 0.1, z + hz + 0.03, dark);
      } else {
        ctx.propMatte.box(x - hx - 0.03, y + 0.1, z + t * L - 0.06, x + hx + 0.03, y + H - 0.1, z + t * L + 0.06, dark);
      }
    }
    // End frames.
    if (alongX) {
      ctx.propMatte.box(x - hx - 0.05, y, z - hz - 0.05, x - hx + 0.2, y + H + 0.02, z + hz + 0.05, dark);
      ctx.propMatte.box(x + hx - 0.2, y, z - hz - 0.05, x + hx + 0.05, y + H + 0.02, z + hz + 0.05, dark);
    } else {
      ctx.propMatte.box(x - hx - 0.05, y, z - hz - 0.05, x + hx + 0.05, y + H + 0.02, z - hz + 0.2, dark);
      ctx.propMatte.box(x - hx - 0.05, y, z + hz - 0.2, x + hx + 0.05, y + H + 0.02, z + hz + 0.05, dark);
    }
  }

  const BOX_COLORS = [0xb8412c, 0x2d5e8c, 0x3f7d4f, 0xd9a332, 0x7a3f6b, 0xc9cbc4, 0x245a5a, 0xe06a1a, 0x5b6470, 0x8c2f2f];

  function stack(world, x, z, alongX, levels, rng) {
    const ctx = world.ctxAt(x, z);
    for (let i = 0; i < levels; i++) container(ctx, x, z, alongX, i * 2.6, BOX_COLORS[Math.floor(rng() * BOX_COLORS.length)]);
    const hx = alongX ? 6.1 : 1.22;
    const hz = alongX ? 1.22 : 6.1;
    world.physics.addBox(x - hx, 0, z - hz, x + hx, levels * 2.6, z + hz, 'container', F().ALL);
  }

  /** A freight shed: corrugated walls, roll-up doors on the front, a low-pitched roof. */
  function shed(world, x0, z0, x1, z1, frontZ, name, color) {
    const ctx = world.ctxAt((x0 + x1) / 2, (z0 + z1) / 2);
    const wall = VH.col(color || 0x8e959c);
    const trim = VH.colMul(wall, 0.7);
    const h = 11;
    ctx.concrete.box(x0, 0, z0, x1, 1.2, z1, VH.col(0x9a968e), { skip: { top: true } });
    ctx.prop.box(x0, 1.2, z0, x1, h, z1, wall, { skip: { bottom: true } });
    // Vertical ribs.
    for (let x = x0 + 1.5; x < x1 - 0.5; x += 3) {
      ctx.prop.box(x - 0.08, 1.2, z0 - 0.05, x + 0.08, h, z0 + 0.02, trim);
      ctx.prop.box(x - 0.08, 1.2, z1 - 0.02, x + 0.08, h, z1 + 0.05, trim);
    }
    // Roof ridge.
    ctx.prop.box(x0 - 0.4, h, z0 - 0.4, x1 + 0.4, h + 0.35, z1 + 0.4, VH.col(0x5d6168));
    ctx.prop.box(x0 + 1, h + 0.35, (z0 + z1) / 2 - 1.2, x1 - 1, h + 1.2, (z0 + z1) / 2 + 1.2, VH.col(0x6a6f76));
    // Roll-up doors and lamps on the front.
    const fz = frontZ;
    const out = fz === z0 ? -1 : 1;
    const doors = [];
    for (let x = x0 + 7; x < x1 - 6; x += 11) {
      ctx.prop.box(x - 2.6, 0.02, fz + out * 0.02, x + 2.6, 5.2, fz + out * 0.1, VH.col(0x6b7079));
      for (let y = 0.6; y < 5.1; y += 0.5) ctx.prop.box(x - 2.6, y, fz + out * 0.1, x + 2.6, y + 0.08, fz + out * 0.14, VH.col(0x565b63));
      ctx.screen.quad([x - 0.5, 6, fz + out * 0.35], [x + 0.5, 6, fz + out * 0.35], [x + 0.5, 6.3, fz + out * 0.35], [x - 0.5, 6.3, fz + out * 0.35], [0, 0, out], VH.col(0xfff1d8, 1.5));
      doors.push({ x, z: fz + out * 3, yaw: out > 0 ? Math.PI : 0 });
    }
    solid(world, x0, 0, z0, x1, h + 1.2, z1, 'metal');
    if (name) {
      world.signs = world.signs || [];
      world.signs.push({ x: (x0 + x1) / 2, y: h - 1.4, z: fz + out * 0.12, yaw: out > 0 ? 0 : Math.PI, w: Math.min(22, name.length * 0.9 + 3), h: 1.6, lines: [name], style: 'info' });
    }
    return doors;
  }

  /** A ship-to-shore gantry crane straddling the quay, boom out over the water. */
  function gantry(world, x, z, color) {
    const ctx = world.ctxAt(x, z);
    const c = VH.col(color || 0x2b6cb0);
    const legH = 34;
    const legs = [[x - 8, z - 7], [x + 8, z - 7], [x - 8, z + 7], [x + 8, z + 7]];
    for (const [lx, lz] of legs) {
      ctx.prop.box(lx - 0.7, 0, lz - 0.7, lx + 0.7, legH, lz + 0.7, c);
      solid(world, lx - 0.7, 0, lz - 0.7, lx + 0.7, legH, lz + 0.7, 'metal');
      ctx.prop.box(lx - 1, 0, lz - 1.3, lx + 1, 1.1, lz + 1.3, VH.col(0x333333));
    }
    // Cross beams and the portal.
    ctx.prop.box(x - 8.7, legH - 2, z - 7.7, x + 8.7, legH, z - 6.3, c);
    ctx.prop.box(x - 8.7, legH - 2, z + 6.3, x + 8.7, legH, z + 7.7, c);
    ctx.prop.box(x - 8.7, 12, z - 7.5, x - 7.3, 13, z + 7.5, c);
    ctx.prop.box(x + 7.3, 12, z - 7.5, x + 8.7, 13, z + 7.5, c);
    // Boom: back over the land and out over the bay.
    ctx.prop.box(x - 30, legH, z - 1.4, x + 52, legH + 2.4, z + 1.4, c);
    ctx.prop.box(x - 30, legH + 2.4, z - 1, x - 18, legH + 5, z + 1, VH.col(0x444a52)); // machinery house
    // Stays.
    const bar = new THREE.BoxGeometry(0.25, 0.25, 1);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const strut = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length();
      q.setFromUnitVectors(zAxis, d.normalize());
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, len));
      ctx.prop.merge(bar, m, c);
    };
    const apex = new THREE.Vector3(x, legH + 14, z);
    ctx.prop.box(x - 0.6, legH, z - 0.6, x + 0.6, legH + 14, z + 0.6, c);
    strut(apex, new THREE.Vector3(x + 50, legH + 2.4, z));
    strut(apex, new THREE.Vector3(x + 25, legH + 2.4, z));
    strut(apex, new THREE.Vector3(x - 28, legH + 2.4, z));
    // Trolley and spreader over the water.
    ctx.prop.box(x + 20, legH - 1.2, z - 1.8, x + 24, legH, z + 1.8, VH.col(0x2a2e33));
    ctx.prop.box(x + 19, legH - 12, z - 1.3, x + 25, legH - 11.4, z + 1.3, VH.col(0xd9a332));
    world.beacons.push({ x: x + 52, y: legH + 2.6, z });
  }

  /** A freighter at its berth. */
  function ship(world, x0, z0, x1, z1, name) {
    const ctx = world.ctxAt((x0 + x1) / 2, (z0 + z1) / 2);
    const hull = VH.col(0x2a2f38);
    const red = VH.col(0x8c2f2f);
    const deck = 7.5;
    const cx = (x0 + x1) / 2;
    // Hull (tapered at the bow toward +Z).
    ctx.prop.box(x0, -4, z0, x1, deck, z1 - 14, hull);
    ctx.prop.box(x0, -4, z0, x1, 0.8, z1 - 14, red);
    const bow = [[x0, -4, z1 - 14], [x1, -4, z1 - 14], [cx, -4, z1]];
    ctx.prop.polygon([[x0, deck, z1 - 14], [x1, deck, z1 - 14], [cx, deck, z1]], VH.col(0x5a4636));
    ctx.prop.polygon([[x0, -4, z1 - 14], [cx, -4, z1], [cx, deck, z1], [x0, deck, z1 - 14]], hull);
    ctx.prop.polygon([[cx, -4, z1], [x1, -4, z1 - 14], [x1, deck, z1 - 14], [cx, deck, z1]], hull);
    void bow;
    ctx.prop.box(x0 + 0.3, deck, z0 + 0.3, x1 - 0.3, deck + 0.2, z1 - 14, VH.col(0x5a4636));
    // Containers on deck.
    const rng = new VH.RNG(name || 'ship');
    for (let z = z0 + 30; z < z1 - 22; z += 13) {
      for (let x = x0 + 2.5; x < x1 - 2; x += 2.6) {
        const lv = rng.int(1, 3);
        for (let i = 0; i < lv; i++) container(ctx, x, z, false, deck + 0.2 + i * 2.6, BOX_COLORS[rng.int(0, BOX_COLORS.length - 1)]);
      }
    }
    // Superstructure at the stern.
    const bw = VH.col(0xeceae4);
    ctx.b.box(x0 + 2, deck, z0 + 4, x1 - 2, deck + 16, z0 + 20, bw);
    ctx.b.box(x0 - 1, deck + 16, z0 + 8, x1 + 1, deck + 18, z0 + 16, bw);
    ctx.prop.box(cx - 1.5, deck + 18, z0 + 10, cx + 1.5, deck + 26, z0 + 13, red);
    ctx.screen.quad([x0 + 2.01, deck + 12, z0 + 6], [x0 + 2.01, deck + 12, z0 + 18], [x0 + 2.01, deck + 13.4, z0 + 18], [x0 + 2.01, deck + 13.4, z0 + 6], [-1, 0, 0], VH.col(0xfff1d8, 1.2));
    world.physics.addBox(x0, -8, z0, x1, deck + 16, z1, 'metal', F().ALL);
    world.signs = world.signs || [];
    world.signs.push({ x: x0 - 0.05, y: deck - 2, z: z1 - 26, yaw: -Math.PI / 2, w: 16, h: 1.8, lines: [name || 'ESPERANZA'], style: 'monolith' });
  }

  /** A chain-link fence line: posts, rails and a collider. Gaps are left where `gaps` say. */
  function fence(world, x0, z0, x1, z1, gaps) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const fixed = alongX ? z0 : x0;
    const segs = [];
    let cur = a0;
    const gs = (gaps || []).slice().sort((p, q) => p[0] - q[0]);
    for (const [g0, g1] of gs) {
      if (g0 > cur) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < a1) segs.push([cur, a1]);
    const post = VH.col(0x7d838a);
    for (const [s0, s1] of segs) {
      const ctx = world.ctxAt(alongX ? (s0 + s1) / 2 : fixed, alongX ? fixed : (s0 + s1) / 2);
      for (let p = s0; p <= s1 + 0.01; p += 3) {
        const x = alongX ? p : fixed;
        const z = alongX ? fixed : p;
        ctx.prop.box(x - 0.05, 0, z - 0.05, x + 0.05, 2.4, z + 0.05, post);
      }
      for (const y of [0.3, 1.25, 2.3]) {
        if (alongX) ctx.prop.box(s0, y, fixed - 0.03, s1, y + 0.05, fixed + 0.03, post);
        else ctx.prop.box(fixed - 0.03, y, s0, fixed + 0.03, y + 0.05, s1, post);
      }
      // The mesh: a faint dark panel.
      if (alongX) ctx.propMatte.box(s0, 0.3, fixed - 0.01, s1, 2.3, fixed + 0.01, VH.col(0x3a3f45));
      else ctx.propMatte.box(fixed - 0.01, 0.3, s0, fixed + 0.01, 2.3, s1, VH.col(0x3a3f45));
      if (alongX) world.physics.addBox(s0, 0, fixed - 0.1, s1, 2.4, fixed + 0.1, 'fence', F().SOLID | F().CAMERA);
      else world.physics.addBox(fixed - 0.1, 0, s0, fixed + 0.1, 2.4, s1, 'fence', F().SOLID | F().CAMERA);
    }
  }

  /** A 14 m floodlight mast with a lamp head that glows, and its pool of light. */
  function floodMast(world, x, z, radius) {
    const ctx = world.ctxAt(x, z);
    ctx.prop.box(x - 0.18, 0, z - 0.18, x + 0.18, 14, z + 0.18, VH.col(0x8a9099));
    ctx.prop.box(x - 1.3, 13.6, z - 0.35, x + 1.3, 14.4, z + 0.35, VH.col(0x2b2f36));
    ctx.screen.box(x - 1.15, 13.45, z - 0.25, x + 1.15, 13.62, z + 0.25, VH.col(0xf4f7ff, 2.4));
    world.physics.addBox(x - 0.2, 0, z - 0.2, x + 0.2, 14, z + 0.2, 'pole', F().ALL);
    (world.floodlights || (world.floodlights = [])).push({ x, z, r: radius, y: 0.03 });
  }

  /** A knee-high garden lantern and its warm pool of light. */
  function gardenLamp(world, ctx, x, z, radius) {
    ctx.prop.box(x - 0.07, 0, z - 0.07, x + 0.07, 1.0, z + 0.07, VH.col(0x2b2f36));
    ctx.screen.box(x - 0.16, 1.0, z - 0.16, x + 0.16, 1.32, z + 0.16, VH.col(0xffd9a0, 2.2));
    ctx.prop.box(x - 0.2, 1.32, z - 0.2, x + 0.2, 1.4, z + 0.2, VH.col(0x2b2f36));
    (world.floodlights || (world.floodlights = [])).push({ x, z, r: radius, y: 0.03, strength: 0.6, tint: [1.4, 0.92, 0.55] });
  }

  /**
   * Belvedere's front: a two-storey portico of white columns under a
   * pediment, steps, and topiary cones flanking the door.
   */
  function portico(world, ctx, lot, dir) {
    const white = VH.col(0xf4f1ea);
    const trim = VH.col(0xd9d2c4);
    const face = dir > 0 ? lot.maxX : lot.minX; // the gate side of the lot
    const xIn = face - dir * 7; // hidden inside the house
    const xOut = face - dir * 1.2; // the portico's front edge
    const cz = lot.cz;
    const half = 9;
    const yTop = KERB + 6.0;
    // Steps and the porch floor.
    for (let i = 0; i < 3; i++) {
      const xo = xOut + dir * (0.9 - i * 0.45);
      ctx.concrete.box(Math.min(xIn, xo), 0, cz - half - 0.6 + i * 0.2, Math.max(xIn, xo), KERB * 0.4 * (i + 1), cz + half + 0.6 - i * 0.2, white);
    }
    world.physics.addBox(Math.min(xIn, xOut), -0.5, cz - half, Math.max(xIn, xOut), KERB * 1.2, cz + half, 'kerb');
    // Six columns with bases and capitals.
    for (let k = 0; k < 6; k++) {
      const z = cz - half + 1.2 + k * ((half * 2 - 2.4) / 5);
      const x = xOut - dir * 0.6;
      ctx.concrete.box(x - 0.55, KERB * 1.2, z - 0.55, x + 0.55, KERB * 1.2 + 0.35, z + 0.55, trim);
      ctx.concrete.box(x - 0.36, KERB * 1.2 + 0.35, z - 0.36, x + 0.36, yTop - 0.4, z + 0.36, white);
      ctx.concrete.box(x - 0.5, yTop - 0.4, z - 0.5, x + 0.5, yTop, z + 0.5, trim);
      solid(world, x - 0.38, 0, z - 0.38, x + 0.38, yTop, z + 0.38, 'pole');
    }
    // Entablature and pediment.
    ctx.concrete.box(Math.min(xIn, xOut - dir * 1.4), yTop, cz - half - 0.4, Math.max(xIn, xOut - dir * 1.4) + 0.001, yTop + 0.9, cz + half + 0.4, white);
    const xp = xOut - dir * 1.35;
    const yp = yTop + 0.9;
    ctx.concrete.polygon([[xp, yp, cz - half - 0.4], [xp, yp, cz + half + 0.4], [xp, yp + 2.6, cz]].map((v) => v), white);
    ctx.concrete.polygon([[xp, yp, cz + half + 0.4], [xp, yp, cz - half - 0.4], [xp, yp + 2.6, cz]].map((v) => v), white);
    // Uplights under the portico.
    for (const zz of [cz - half + 1, cz, cz + half - 1]) (world.floodlights || (world.floodlights = [])).push({ x: xOut - dir * 0.8, z: zz, r: 7, y: KERB * 1.2 + 0.03, strength: 0.9, tint: [1.4, 1.0, 0.7] });
    // Topiary: clipped cones in planters either side of the steps and along the drive.
    for (const zz of [cz - half - 2.2, cz + half + 2.2, cz - 4.2, cz + 4.2]) {
      const x = face + dir * (zz === cz - 4.2 || zz === cz + 4.2 ? 6 : 0.6);
      ctx.concrete.box(x - 0.7, 0, zz - 0.7, x + 0.7, 0.7, zz + 0.7, trim);
      ctx.hedge.box(x - 0.55, 0.7, zz - 0.55, x + 0.55, 1.9, zz + 0.55, VH.col(0x2e6b34));
      ctx.hedge.box(x - 0.38, 1.9, zz - 0.38, x + 0.38, 2.9, zz + 0.38, VH.col(0x2f7036));
      ctx.hedge.box(x - 0.2, 2.9, zz - 0.2, x + 0.2, 3.5, zz + 0.2, VH.col(0x317538));
      solid(world, x - 0.7, 0, zz - 0.7, x + 0.7, 2, zz + 0.7, 'prop');
    }
  }

  // ------------------------------------------------------------- docks
  function buildDocks(world, layout) {
    const rng = new VH.RNG('saltmarsh');
    const r = () => rng.next();
    const spots = [];
    const spot = (x, z, yaw, kinds, name, y) => spots.push({ x, z, yaw, kinds, name, y });
    const sea = layout.config.seawallX;

    // Paved yards between the roads.
    const yards = [
      [13, 391, 281, 462], [295, 391, sea - 0.4, 462], [13, 478, 281, 573], [295, 478, sea - 0.4, 573], [13, 587, 281, 630], [295, 587, sea - 0.4, 630],
    ];
    for (const [x0, z0, x1, z1] of yards) apron(world, x0, z0, x1, z1, 0xb0aea8);
    for (const [fx, fz] of [[60, 448], [136, 448], [212, 448], [145, 500], [145, 552]]) floodMast(world, fx, fz, 26);
    // Kerbside lamps along the dock roads.
    // (Not where a cross street runs through the kerb line.)
    const lamp = (x, z, yaw, axis) => {
      if (!world.onRoad(x, z, 1, axis)) world.addProp('streetlight', x, 0, z, yaw, 1);
    };
    for (let x = 20; x < 405; x += 32) {
      lamp(x, 461.3, Math.PI, 'x');
      lamp(x + 16, 478.7, 0, 'x');
      lamp(x, 572.3, Math.PI, 'x');
    }
    for (let z = 400; z < 620; z += 34) {
      lamp(280.3, z, Math.PI / 2, 'z');
      lamp(295.7, z + 17, -Math.PI / 2, 'z');
    }

    // Yard A: Saltmarsh Freight sheds.
    const names = ['SALTMARSH FREIGHT 1', 'SALTMARSH FREIGHT 2', 'COLD STORE 3'];
    [[22, 84], [98, 160], [174, 236]].forEach(([x0, x1], i) => {
      const doors = shed(world, x0, 402, x1, 440, 440, names[i], i === 2 ? 0xa9b4b8 : 0x8e959c);
      doors.forEach((d, k) => spot(d.x, d.z, d.yaw, ['warehouse', 'dock', 'garage'], names[i] + ' door ' + (k + 1)));
    });
    for (let x = 250; x < 276; x += 4.5) world.addProp('barrier', x, 0, 455, 0, 1);
    spot(258, 430, 0, ['parking', 'dock'], 'Truck lot');

    // Yard B and C: container stacks.
    for (let z = 400; z < 456; z += 5.2) {
      for (let x = 302; x < 392; x += 15) {
        if (r() < 0.2) continue;
        stack(world, x + 6.1, z + 1.2, true, 1 + Math.floor(r() * 3.2), r);
      }
    }
    spot(335, 427, Math.PI / 2, ['dock', 'alley'], 'Container stacks');
    for (let z = 484; z < 568; z += 6) {
      for (let x = 20; x < 270; x += 15) {
        if ((x > 130 && x < 160) || r() < 0.12) continue; // a lane through the middle
        stack(world, x + 6.1, z + 1.2, true, 1 + Math.floor(r() * 3.6), r);
      }
    }
    spot(145, 525, 0, ['dock', 'alley', 'warehouse'], 'The container maze');
    spot(60, 480.5, 0, ['dock', 'street'], 'Terminal gate');

    // Yard D: the Pier 9 transfer yard (Tidewater): a loading dock with numbered bays.
    const ld = { x0: 300, x1: 318, z0: 486, z1: 566 };
    const ctx = world.ctxAt(309, 526);
    ctx.b.box(ld.x0, 0, ld.z0, ld.x1, 7, ld.z1, VH.col(0xc8c2b4));
    ctx.concrete.box(ld.x1, 0, ld.z0, ld.x1 + 2.5, 1.2, ld.z1, VH.col(0x9a968e));
    solid(world, ld.x0, 0, ld.z0, ld.x1, 7, ld.z1, 'building');
    world.physics.addBox(ld.x1, 0, ld.z0, ld.x1 + 2.5, 1.2, ld.z1, 'kerb', F().ALL);
    world.signs = world.signs || [];
    world.signs.push({ x: ld.x1 + 0.02, y: 5.6, z: 526, yaw: Math.PI / 2, w: 16, h: 1.5, lines: ['PIER 9 TRANSFER YARD'], style: 'info' });
    let bay = 1;
    for (let z = ld.z0 + 3; z < ld.z1 - 2; z += 4.8) {
      ctx.prop.box(ld.x1 + 0.02, 1.2, z - 1.7, ld.x1 + 0.1, 4.6, z + 1.7, VH.col(bay === 14 ? 0xd9a332 : 0x6b7079));
      world.signs.push({ x: ld.x1 + 0.12, y: 5.1, z, yaw: Math.PI / 2, w: 1.2, h: 0.8, lines: [String(bay)], style: 'monolith' });
      // Bay lines on the ground.
      ctx.marks.topRect(ld.x1 + 2.5, z - 2.35, ld.x1 + 16, z - 2.2, 0.02, VH.col(0xe0b12e));
      spot(ld.x1 + 7, z, -Math.PI / 2, ['dock', 'warehouse'], 'Bay ' + bay);
      bay++;
    }
    // Gatehouse and fence.
    ctx.b.box(330, 0, 480, 336, 3.4, 484, VH.col(0xd8d2c6));
    solid(world, 330, 0, 480, 336, 3.4, 484, 'building');
    fence(world, 296, 479.5, sea - 1, 479.5, [[337, 352]]);
    fence(world, 296, 572, sea - 1, 572, [[340, 352]]);
    spot(344, 486, 0, ['dock', 'street', 'parking'], 'Pier 9 gate');
    for (let x = 322; x < 400; x += 26) world.addProp('streetlight', x, 0, 520, Math.PI / 2, 1.1);
    // Floodlight masts over the yard: bay 14 is never dark.
    for (const [fx, fz] of [[326, 496], [326, 548], [366, 496], [366, 548], [384, 536]]) floodMast(world, fx, fz, 24);

    // The quay: gantry cranes and a freighter at the berth.
    gantry(world, sea - 12, 500, 0x2b6cb0);
    gantry(world, sea - 12, 546, 0xe06a1a);
    ship(world, sea + 6, 466, sea + 28, 610, 'ESPERANZA');
    spot(sea - 6, 520, Math.PI / 2, ['dock', 'pier'], 'The quay');
    spot(sea - 6, 590, Math.PI / 2, ['dock', 'pier'], 'Freighter berth');
    for (let z = 470; z < 628; z += 9) world.addProp('bollard', sea - 1.3, 0, z, 0, 1.2);

    // Yard E: the boatyard (hulls on stands) and a big shed.
    shed(world, 22, 592, 110, 626, 592, 'SALTMARSH BOATWORKS', 0xa8a39a);
    const hullCtx = world.ctxAt(190, 608);
    for (let i = 0; i < 4; i++) {
      const x = 130 + i * 36;
      const c = VH.col([0xf2efe8, 0x2d5e8c, 0xb8412c, 0x245a5a][i]);
      hullCtx.prop.box(x, 1.4, 598, x + 22, 5.2, 618, c);
      hullCtx.prop.box(x + 2, 5.2, 600, x + 20, 5.5, 616, VH.col(0x8a6a4a));
      hullCtx.prop.box(x + 4, 5.5, 603, x + 11, 8.5, 613, VH.col(0xeceae4));
      for (const sx of [x + 3, x + 19]) hullCtx.prop.box(sx - 0.3, 0, 604, sx + 0.3, 1.4, 612, VH.col(0x5a5f66));
      solid(world, x, 0, 598, x + 22, 8.5, 618, 'metal');
    }
    spot(120, 588.5, 0, ['dock', 'warehouse', 'garage'], 'Boatworks');

    // Yard F: the fish market (stalls and crates, the Salts' turf).
    const fm = world.ctxAt(360, 608);
    for (let i = 0; i < 6; i++) {
      const x = 302 + i * 19;
      fm.propMatte.box(x, 0, 598, x + 14, 1, 606, VH.col(0x8a6a4a));
      fm.propMatte.box(x, 3.2, 597, x + 14, 3.45, 607, VH.col([0x2f7f86, 0xd8795e, 0xf0a030, 0x3d6b8f, 0xb24a7a, 0x9bc46a][i]));
      for (const px of [x + 0.3, x + 13.7]) fm.prop.box(px - 0.08, 0, 597.3, px + 0.08, 3.2, 597.5, VH.col(0x5a5f66));
      solid(world, x, 0, 598, x + 14, 1, 606, 'crate');
      for (let k = 0; k < 3; k++) world.addProp('bin', x + 2 + k * 4.5, 0, 612, 0, 1);
    }
    world.signs.push({ x: 360, y: 5, z: 596.9, yaw: 0, w: 12, h: 1.4, lines: ['SALTMARSH FISH MARKET'], style: 'neon', posts: true });
    spot(360, 592, 0, ['dock', 'storefront', 'bar', 'diner'], 'Fish market');
    spot(400, 620, Math.PI / 2, ['dock', 'pier', 'overlook'], 'The end of the quay');

    return { spots };
  }

  // ----------------------------------------------------------- estates
  function buildEstates(world, layout) {
    const rng = new VH.RNG('crestline');
    const spots = [];
    const district = VH.Data.districts.find((d) => d.id === 'crestline') || layout.blocks[0].district;
    const pal = { walls: [0xf4f1ea, 0xefe6d8, 0xe9ece8, 0xf2e2d0, 0xdfe8ea], roofs: [0x7a6a5a, 0x9a4e37, 0x5a5f66], accents: [0xffffff, 0x2f7f86] };
    const dist = Object.assign({}, district, { palette: pal });
    const rows = [[-380, -296], [-280, -190], [-186, -98], [-94, -10], [10, 98], [102, 190], [194, 280], [296, 380]];
    const lots = [];
    for (const [z0, z1] of rows) {
      lots.push({ x0: -500, x1: -394, z0, z1, gate: 'w' });
      lots.push({ x0: -628, x1: -520, z0, z1, gate: 'e' });
    }
    // The Voss compound: four western lots merged into one.
    const voss = { x0: -628, x1: -520, z0: -280, z1: -10, gate: 'e', voss: true };
    const plain = lots.filter((l) => !(l.gate === 'e' && l.z0 >= -280 && l.z1 <= -10));
    plain.push(voss);
    for (const L of plain) {
      const spotsHere = mansion(world, L, rng, dist, L.voss);
      spots.push(...spotsHere);
    }
    // Lamps along Crestline Drive.
    for (let z = -370; z < 375; z += 30) {
      if (!world.onRoad(-502.3, z, 1, 'z')) world.addProp('streetlight', -502.3, 0, z, Math.PI / 2, 1);
      if (!world.onRoad(-517.7, z + 15, 1, 'z')) world.addProp('streetlight', -517.7, 0, z + 15, -Math.PI / 2, 1);
      // Median palms, but not in a junction.
      if (Math.abs(z) % 60 < 30 && !world.onRoad(-510, z + 7, 4, 'z')) world.addProp('palmTall', -510, 0, z + 7, z, 1);
    }
    // Barriers at the dead ends.
    for (const z of [-379, 379]) for (let x = -515; x <= -505; x += 3.4) world.addProp('barrier', x, 0, z, 0, 1);
    return { spots };
  }

  function mansion(world, L, rng, dist, isVoss) {
    const spots = [];
    const ctx = world.ctxAt((L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2);
    const wallCol = VH.col(0xefe9dd);
    const h = 2.3;
    const gateX = L.gate === 'e' ? L.x1 : L.x0;
    const gz = (L.z0 + L.z1) / 2;
    const gateHalf = isVoss ? 6 : 4;
    // Perimeter wall with a gate opening on the drive side.
    const wallSeg = (x0, z0, x1, z1) => {
      ctx.concrete.box(x0, 0, z0, x1, h, z1, wallCol);
      ctx.concrete.box(x0 - 0.1, h, z0 - 0.1, x1 + 0.1, h + 0.18, z1 + 0.1, VH.col(0xd8d0c0));
      solid(world, x0, 0, z0, x1, h + 0.2, z1, 'wall');
    };
    wallSeg(L.x0, L.z0, L.x1, L.z0 + 0.4);
    wallSeg(L.x0, L.z1 - 0.4, L.x1, L.z1);
    const farX = L.gate === 'e' ? L.x0 : L.x1 - 0.4;
    wallSeg(farX, L.z0, farX + 0.4, L.z1);
    const gx0 = L.gate === 'e' ? L.x1 - 0.4 : L.x0;
    wallSeg(gx0, L.z0, gx0 + 0.4, gz - gateHalf);
    wallSeg(gx0, gz + gateHalf, gx0 + 0.4, L.z1);
    for (const s of [-1, 1]) {
      const pz = gz + s * (gateHalf + 0.4);
      ctx.concrete.box(gx0 - 0.3, 0, pz - 0.5, gx0 + 0.7, 3.2, pz + 0.5, VH.col(0xd8d0c0));
      ctx.screen.quad([gx0 + (L.gate === 'e' ? 0.71 : -0.31), 2.6, pz - 0.2], [gx0 + (L.gate === 'e' ? 0.71 : -0.31), 2.6, pz + 0.2], [gx0 + (L.gate === 'e' ? 0.71 : -0.31), 2.9, pz + 0.2], [gx0 + (L.gate === 'e' ? 0.71 : -0.31), 2.9, pz - 0.2], [L.gate === 'e' ? 1 : -1, 0, 0], VH.col(0xffe2b0, 2));
      solid(world, gx0 - 0.3, 0, pz - 0.5, gx0 + 0.7, 3.2, pz + 0.5, 'wall');
    }
    // The house, set back from the gate.
    const depth = L.x1 - L.x0;
    const houseW = isVoss ? 46 : 26 + rng.range(-3, 5);
    const houseD = isVoss ? 34 : 20 + rng.range(-2, 4);
    const back = isVoss ? 0.55 : 0.58;
    const hx = L.gate === 'e' ? L.x0 + depth * (1 - back) : L.x1 - depth * (1 - back);
    const lot = {
      minX: hx - houseD / 2, maxX: hx + houseD / 2, minZ: gz - houseW / 2, maxZ: gz + houseW / 2,
      cx: hx, cz: gz, district: dist, kind: 'building', interior: false,
      front: { n: false, s: false, e: L.gate === 'e', w: L.gate === 'w' }, back: {},
      archetype: 'villa', floorRange: [2, 2], seed: rng.int(1, 1e9),
    };
    const hctx = world.ctxAt(lot.cx, lot.cz);
    // The house sits on a low plinth (buildings start at kerb height).
    hctx.concrete.box(lot.minX - 0.6, 0, lot.minZ - 0.6, lot.maxX + 0.6, KERB, lot.maxZ + 0.6, VH.col(0xe0dace));
    world.physics.addBox(lot.minX - 0.6, -0.5, lot.minZ - 0.6, lot.maxX + 0.6, KERB, lot.maxZ + 0.6, 'kerb');
    // Keep the generated house low and wide: clamp the archetype's height by giving it a small floor range.
    const top = VH.Buildings.buildLot(hctx, lot);
    if (isVoss) portico(world, hctx, lot, L.gate === 'e' ? 1 : -1);
    // Driveway and forecourt.
    const dx0 = Math.min(gateX, lot.front.e ? lot.maxX : lot.minX);
    const dx1 = Math.max(gateX, lot.front.e ? lot.maxX : lot.minX);
    ctx.plazaTop.topRect(dx0, gz - 3.2, dx1, gz + 3.2, 0.02, VH.col(0xe8e0d0), 4);
    // Pool behind the house.
    const px = L.gate === 'e' ? lot.minX - 12 : lot.maxX + 12;
    const pw = isVoss ? 26 : 12;
    const pd = isVoss ? 7 : 5;
    ctx.concrete.box(px - pd / 2 - 1.2, 0, gz - pw / 2 - 1.2, px + pd / 2 + 1.2, 0.2, gz + pw / 2 + 1.2, VH.col(0xefe9dd), { skip: { top: false } });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pd, pw), world.materials.fountainWater || world.materials.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, 0.24, gz);
    water.name = 'pool';
    world.chunkAt(px, gz).group.add(water);
    for (let k = -1; k <= 1; k += 2) world.addProp('palm', px + k * (pd / 2 + 3), 0, gz - pw / 2 - 2, k * 1.3, 0.95);
    for (let z = L.z0 + 8; z < L.z1 - 6; z += 14) world.addProp('palmTall', (L.x0 + L.x1) / 2 + (L.gate === 'e' ? 12 : -12), 0, z, z, 0.9 + rng.range(0, 0.2));
    // Hedges along the drive.
    for (const s of [-1, 1]) ctx.hedge.box(dx0 + 2, 0, gz + s * 4.2 - 0.5, dx1 - 2, 1.1, gz + s * 4.2 + 0.5, VH.col(0x355f2c));
    // Garden lamps: the drive, the pool, the gate. Belvedere is lit like a party every night.
    for (let x = dx0 + 3; x < dx1 - 1; x += isVoss ? 8 : 14) for (const s of [-1, 1]) gardenLamp(world, ctx, x, gz + s * 3.5, isVoss ? 7 : 6);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gardenLamp(world, ctx, px + ox * (pd / 2 + 1.5), gz + oz * (pw / 2 + 1.5), 5.5);
    if (isVoss) for (const oz of [-0.5, 0, 0.5]) gardenLamp(world, ctx, px + (pd / 2 + 1.5) * (L.gate === 'e' ? 1 : -1), gz + oz * pw * 0.8, 5.5);
    // Underwater lights: the pool glows turquoise at night.
    for (let z = gz - pw / 2 + pd / 2; z <= gz + pw / 2 - pd / 2 + 0.01; z += pd * 0.8) {
      (world.floodlights || (world.floodlights = [])).push({ x: px, z, r: pd * 0.55, y: 0.26, strength: 0.7, tint: [0.25, 0.95, 1.35] });
    }
    const gateOut = L.gate === 'e' ? 1 : -1;
    spots.push({ x: gateX + gateOut * 3, z: gz, yaw: L.gate === 'e' ? -Math.PI / 2 : Math.PI / 2, kinds: ['mansion', 'street'], name: isVoss ? 'The Voss estate gate' : 'Mansion gate' });
    spots.push({ x: (dx0 + dx1) / 2, z: gz + 1.5, yaw: L.gate === 'e' ? -Math.PI / 2 : Math.PI / 2, kinds: ['mansion', 'parking'], name: isVoss ? 'The Voss forecourt' : 'Mansion driveway' });
    spots.push({ x: px + gateOut * (pd / 2 + 2.5), z: gz, yaw: gateOut > 0 ? Math.PI / 2 : -Math.PI / 2, kinds: ['mansion', 'park', 'overlook'], name: isVoss ? 'The infinity pool' : 'Poolside' });
    if (isVoss) {
      // Helipad and fountain court.
      const hpX = L.gate === 'e' ? L.x0 + 18 : L.x1 - 18;
      const hpZ = L.z0 + 30;
      ctx.concrete.box(hpX - 10, 0, hpZ - 10, hpX + 10, 0.25, hpZ + 10, VH.col(0x7d838a));
      world.signs = world.signs || [];
      world.signs.push({ x: hpX, y: 0.27, z: hpZ, yaw: 0, w: 8, h: 8, lines: ['H'], style: 'monolith', flat: true });
      world.fountains = world.fountains || [];
      world.fountains.push({ x: (dx0 + dx1) / 2, y: 0.45, z: gz + 36, r: 5 });
      ctx.concrete.box((dx0 + dx1) / 2 - 5.6, 0, gz + 30.4, (dx0 + dx1) / 2 + 5.6, 0.5, gz + 41.6, VH.col(0xefe9dd));
      solid(world, (dx0 + dx1) / 2 - 5.6, 0, gz + 30.4, (dx0 + dx1) / 2 + 5.6, 0.5, gz + 41.6, 'wall');
      spots.push({ x: hpX, z: hpZ, yaw: 0, kinds: ['mansion', 'rooftop', 'overlook'], name: 'The helipad', voss: true });
      spots.push({ x: (dx0 + dx1) / 2, z: gz + 28, yaw: 0, kinds: ['mansion', 'park'], name: 'The fountain court', voss: true });
      world.signs.push({ x: gateX + gateOut * 0.8, y: 3.6, z: gz + gateHalf + 2.2, yaw: gateOut > 0 ? Math.PI / 2 : -Math.PI / 2, w: 4, h: 0.9, lines: ['VOSS'], style: 'plaque' });
    }
    void top;
    return spots;
  }

  VH.Docks = {
    build: buildDocks,
    registerPlaces(docks, places) {
      for (const s of docks.spots) places.extra.saltmarsh.push(Object.assign({ y: s.y }, s));
      // Fixed ids the story can rely on.
      const byName = (n) => docks.spots.find((s) => s.name === n);
      const add = (id, n, name) => {
        const s = byName(n);
        if (s) places.add(id, { name: name || s.name, x: s.x, z: s.z, yaw: s.yaw, kind: 'dock', district: 'saltmarsh' });
        if (s) s.used = true;
      };
      add('pier9_gate', 'Pier 9 gate', 'Pier 9 Transfer Yard');
      add('bay_14', 'Bay 14', 'Bay 14');
      add('container_maze', 'The container maze');
      add('the_quay', 'The quay');
      add('freighter_berth', 'Freighter berth', 'The Esperanza');
      add('fish_market', 'Fish market', 'Saltmarsh Fish Market');
      add('boatworks', 'Boatworks', 'Saltmarsh Boatworks');
      add('quay_end', 'The end of the quay');
    },
  };

  VH.Estates = {
    build: buildEstates,
    registerPlaces(estates, places) {
      for (const s of estates.spots) if (!s.voss) places.extra.crestline.push(Object.assign({}, s));
      const vossGate = estates.spots.find((s) => s.name === 'The Voss estate gate');
      const find = (n) => estates.spots.find((s) => s.name === n);
      const add = (id, s, name) => {
        if (!s) return;
        s.used = true;
        places.add(id, { name: name || s.name, x: s.x, z: s.z, yaw: s.yaw, kind: 'mansion', district: 'crestline' });
      };
      add('voss_estate', vossGate, 'The Voss Estate');
      add('voss_forecourt', find('The Voss forecourt'));
      add('voss_pool', find('The infinity pool'), 'The infinity pool');
      add('voss_helipad', find('The helipad'));
      add('voss_fountain', find('The fountain court'));
    },
  };
})();
