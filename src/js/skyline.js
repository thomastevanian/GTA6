/*
 * skyline.js — Northgate Heights, the new financial district north of
 * downtown, between Coral and Pelican Avenues on either side of Grand
 * Avenue and Skyline Drive.
 *
 * Nine towers, each its own shape so the skyline reads from across the
 * city: a tapering octagon, an art-deco stepped tower, a glass wedge, a
 * twisting tower, a round tower with a helipad, twin towers joined by a sky
 * bridge, a three-sided tower, and the tallest, Meridian Heights (258 m,
 * still well under Vicehaven Tower). They stand on paved plazas with
 * lobbies, planters, benches, palms and street lights.
 *
 *   VH.Skyline.build(world, layout)      the geometry (world build time)
 *   VH.Skyline.registerPlaces(world, p)  northgate_heights, northgate_plaza
 *
 * Walls use the shared building material, so windows come from its facade
 * shader and light up at night; crowns are bands of the unlit screen
 * surface. All of it goes into the per-chunk builders: no new draw calls
 * beyond a few chunk meshes.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;
  const SIDEWALK = 4;
  const CHUNK = 192;
  const ORIGIN = -768;

  // The four parcels between the roads (road edges, not centre lines).
  const PARCELS = [
    { id: 'A', x0: -89, x1: -13, z0: -505, z1: -391 },
    { id: 'B', x0: 13, x1: 281, z0: -505, z1: -391 },
    { id: 'C', x0: 13, x1: 281, z0: -650, z1: -519 },
    { id: 'D', x0: -89, x1: -13, z0: -650, z1: -519 },
  ];

  // ------------------------------------------------------------ shapes
  /** Regular polygon, counter-clockwise on a north-up map (what wall() wants). */
  function ring(cx, cz, r, n, rot) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (rot || 0) + (i / n) * Math.PI * 2;
      out.push([cx + Math.cos(a) * r, cz - Math.sin(a) * r]);
    }
    return out;
  }

  /** Rectangle turned by yaw, same winding. */
  function box4(cx, cz, hw, hd, yaw) {
    const c = Math.cos(yaw || 0);
    const s = Math.sin(yaw || 0);
    return [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
  }

  function inset(pts, cx, cz, k) {
    return pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
  }

  /** Windowed walls round a footprint from y0 to y1. */
  function prism(b, pts, y0, y1, F) {
    const h = y1 - y0;
    const v0 = (y0 - KERB) / F.floorH;
    const v1 = v0 + h / F.floorH;
    const fac = F.style ? [F.ww, F.wh, F.style, F.seed] : [0, 0, 0, F.seed];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const dx = c[0] - a[0];
      const dz = c[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const bays = Math.max(1, Math.round(len / F.bay));
      b.wall([a[0], y0, a[1]], dx / len, dz / len, len, h, F.wall, null, [0, bays, v0, v1], fac);
    }
  }

  /** Flat top (gravel unless told otherwise). */
  function cap(b, pts, y, color, seed, plain) {
    b.polygon(pts.map(([x, z]) => [x, y, z]), color, [0, 0, plain ? 0 : -1, seed || 0]);
  }

  /** A plain band (spandrel, cornice) standing slightly proud of the walls. */
  function band(b, pts, cx, cz, y, h, color, out) {
    const p = inset(pts, cx, cz, out || 1.02);
    prism(b, p, y, y + h, { wall: color, style: 0, bay: 4, floorH: 4, seed: 0 });
    cap(b, p, y + h, color, 0, true);
  }

  /** A lit crown: screen quads just outside each face. */
  function glow(ctx, pts, cx, cz, y0, y1, color) {
    const p = inset(pts, cx, cz, 1.004);
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const c = p[(i + 1) % p.length];
      const dx = c[0] - a[0];
      const dz = c[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      ctx.screen.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], [-dz / len, 0, dx / len], color);
    }
  }

  /** Colliders: oriented boxes for rectangles, an octagon of four for round shapes. */
  function solidRect(world, cx, cz, hw, hd, yaw, top) {
    world.physics.addOrientedBox(cx, cz, hw, hd, yaw || 0, 0, top, 'building');
  }
  function solidRound(world, cx, cz, r, top) {
    const t = Math.tan(Math.PI / 8);
    for (let k = 0; k < 4; k++) world.physics.addOrientedBox(cx, cz, r, r * t, (k * Math.PI) / 4, 0, top, 'building');
  }

  const LOBBIES = []; // footprints of the tower being built (for the map)

  /** Storefront lobby on a footprint: two tall floors of glass under a canopy line. */
  function lobby(ctx, pts, cx, cz, color, seed) {
    LOBBIES.push(pts);
    const b = ctx.b;
    const p = inset(pts, cx, cz, 1.0);
    prism(b, p, KERB, KERB + 9, { wall: color, style: 4, ww: 0.9, wh: 0.82, bay: 4.2, floorH: 4.5, seed });
    band(b, p, cx, cz, KERB + 9, 0.7, VH.colMul(color, 0.7), 1.03);
    return KERB + 9.7;
  }

  // ------------------------------------------------------------ towers
  // Each returns { top, obstacles: [[cx, cz, r]] } and adds its own colliders.

  /** Coral Spire: an octagon that steps in every eight floors. */
  function coralSpire(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 11;
    const glass = VH.col(0x86a9c4);
    const F = { wall: glass, style: 2, ww: 0.94, wh: 0.78, bay: 3.4, floorH: 3.9, seed };
    let r = 19;
    let y = lobby(ctx, ring(cx, cz, r + 1.5, 8, Math.PI / 8), cx, cz, VH.col(0x6d7f8e), seed);
    solidRound(world, cx, cz, (r + 1.5) * Math.cos(Math.PI / 8), y);
    for (let k = 0; k < 7; k++) {
      const pts = ring(cx, cz, r, 8, Math.PI / 8);
      const h = 8 * F.floorH;
      prism(b, pts, y, y + h, F);
      y += h;
      band(b, pts, cx, cz, y, 0.9, VH.col(0xd6dde3));
      y += 0.9;
      r *= 0.9;
    }
    const top = ring(cx, cz, r, 8, Math.PI / 8);
    cap(b, top, y, VH.col(0x5f6670), seed);
    glow(ctx, ring(cx, cz, r * 0.8, 8, Math.PI / 8), cx, cz, y, y + 3, VH.col(0x7fe7ff, 1.6));
    prism(b, ring(cx, cz, r * 0.8, 8, Math.PI / 8), y, y + 3, { wall: glass, style: 0, bay: 4, floorH: 4, seed });
    cap(b, ring(cx, cz, r * 0.8, 8, Math.PI / 8), y + 3, VH.col(0x5f6670), seed);
    b.cylinder(cx, y + 3, cz, 1.2, 0.15, 34, 8, VH.col(0xd9dde2), false);
    ctx.addBeacon(cx, y + 37.3, cz);
    solidRound(world, cx, cz, 19 * Math.cos(Math.PI / 8), y);
    return { top: y + 37, obstacles: [[cx, cz, 22]] };
  }

  /** The Harbinger: art-deco setbacks, piers of pale stone, a lantern crown. */
  function harbinger(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 23;
    const stone = VH.col(0xd8cdb4);
    const F = { wall: stone, style: 1, ww: 0.42, wh: 0.66, bay: 2.6, floorH: 3.8, seed };
    const tiers = [[17, 16], [14, 10], [11, 8], [8, 6]];
    let y = lobby(ctx, box4(cx, cz, 18.5, 18.5), cx, cz, VH.col(0x8c7a5a), seed);
    solidRect(world, cx, cz, 18.5, 18.5, 0, y);
    for (const [hw, floors] of tiers) {
      const pts = box4(cx, cz, hw, hw);
      const h = floors * F.floorH;
      prism(b, pts, y, y + h, F);
      // Vertical piers on the corners.
      for (const [px, pz] of pts) b.box(px - 0.9, y, pz - 0.9, px + 0.9, y + h + 1.5, pz + 0.9, VH.col(0xe6dcc3));
      y += h;
      band(b, pts, cx, cz, y, 1.5, VH.col(0xc2b490));
      solidRect(world, cx, cz, hw, hw, 0, y + 1.5);
      y += 1.5;
    }
    // Lantern: a gold-lit drum and a needle.
    const lan = ring(cx, cz, 5.5, 12, 0);
    prism(b, lan, y, y + 8, { wall: VH.col(0xb08d43), style: 3, ww: 1, wh: 0.5, bay: 1.6, floorH: 2.6, seed });
    glow(ctx, ring(cx, cz, 5.6, 12, 0), cx, cz, y + 2.8, y + 6.4, VH.col(0xffc766, 1.7));
    cap(b, lan, y + 8, VH.col(0x8a6c2c), seed, true);
    b.cylinder(cx, y + 8, cz, 2.6, 0.12, 26, 12, VH.col(0xc9a24c), false);
    ctx.addBeacon(cx, y + 34.3, cz);
    return { top: y + 34, obstacles: [[cx, cz, 26]] };
  }

  /** The Wedge: a glass slab whose roof slopes from 236 m down to 196 m. */
  function wedge(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 37;
    const glass = VH.col(0x4f6f8a);
    const hw = 24;
    const hd = 13;
    const F = { wall: glass, style: 2, ww: 0.96, wh: 0.82, bay: 3.6, floorH: 3.9, seed };
    const yL = lobby(ctx, box4(cx, cz, hw + 1.5, hd + 1.5), cx, cz, VH.col(0x34495c), seed);
    solidRect(world, cx, cz, hw + 1.5, hd + 1.5, 0, yL);
    const yLow = 196;
    const yHigh = 236;
    // Long faces rise to a slope; ends are plain rectangles to their own heights.
    const x0 = cx - hw;
    const x1 = cx + hw;
    const z0 = cz - hd;
    const z1 = cz + hd;
    const v = (y) => (y - KERB) / F.floorH;
    const fac = [F.ww, F.wh, F.style, F.seed];
    const bays = Math.round((2 * hw) / F.bay);
    // South face (+Z), from west (low) to east (high).
    b.quad([x0, yL, z1], [x1, yL, z1], [x1, yHigh, z1], [x0, yLow, z1], [0, 0, 1], glass, null,
      [[0, v(yL)], [bays, v(yL)], [bays, v(yHigh)], [0, v(yLow)]], fac);
    // North face (-Z), from east (high) to west (low).
    b.quad([x1, yL, z0], [x0, yL, z0], [x0, yLow, z0], [x1, yHigh, z0], [0, 0, -1], glass, null,
      [[0, v(yL)], [bays, v(yL)], [bays, v(yLow)], [0, v(yHigh)]], fac);
    const dBays = Math.round((2 * hd) / F.bay);
    b.wall([x1, yL, z1], 0, -1, 2 * hd, yHigh - yL, glass, null, [0, dBays, v(yL), v(yHigh)], fac);
    b.wall([x0, yL, z0], 0, 1, 2 * hd, yLow - yL, glass, null, [0, dBays, v(yL), v(yLow)], fac);
    // The sloping roof, with a lit edge along the top.
    const n = [-(yHigh - yLow), 2 * hw, 0];
    const nl = Math.hypot(n[0], n[1]);
    b.quad([x0, yLow, z1], [x1, yHigh, z1], [x1, yHigh, z0], [x0, yLow, z0], [n[0] / nl, n[1] / nl, 0], VH.col(0x2f3d4a));
    const lit = VH.col(0xbfe6ff, 1.6);
    ctx.screen.quad([x0, yLow - 1.2, z1 + 0.05], [x1, yHigh - 1.2, z1 + 0.05], [x1, yHigh, z1 + 0.05], [x0, yLow, z1 + 0.05], [0, 0, 1], lit);
    ctx.screen.quad([x1, yHigh - 1.2, z0 - 0.05], [x0, yLow - 1.2, z0 - 0.05], [x0, yLow, z0 - 0.05], [x1, yHigh, z0 - 0.05], [0, 0, -1], lit);
    ctx.addBeacon(x1 - 1, yHigh + 0.4, cz);
    ctx.addBeacon(x0 + 1, yLow + 0.4, cz);
    solidRect(world, cx, cz, hw, hd, 0, yLow);
    solidRect(world, cx + hw / 2, cz, hw / 2, hd, 0, (yLow + yHigh) / 2 + 8);
    return { top: yHigh, obstacles: [[cx, cz, 28]] };
  }

  /** The Corkscrew: three-floor slices, each turned 6° further than the last. */
  function corkscrew(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 41;
    const glass = VH.col(0x9fbcb3);
    const F = { wall: glass, style: 2, ww: 0.92, wh: 0.74, bay: 3.2, floorH: 3.9, seed };
    let y = lobby(ctx, ring(cx, cz, 21, 8, Math.PI / 8), cx, cz, VH.col(0x5b7a72), seed);
    solidRound(world, cx, cz, 21 * Math.cos(Math.PI / 8), y);
    const slices = 16;
    const hw = 14;
    let yaw = 0;
    for (let k = 0; k < slices; k++) {
      const pts = box4(cx, cz, hw, hw, yaw);
      const h = 3 * F.floorH;
      prism(b, pts, y, y + h, F);
      y += h;
      // A slim white floor plate between slices shows off the twist.
      const plate = box4(cx, cz, hw + 0.5, hw + 0.5, yaw);
      prism(b, plate, y, y + 0.5, { wall: VH.col(0xf2f4f5), style: 0, bay: 4, floorH: 4, seed });
      cap(b, plate, y + 0.5, VH.col(0xf2f4f5), seed, true);
      y += 0.5;
      yaw += (6 * Math.PI) / 180;
    }
    const top = box4(cx, cz, hw * 0.6, hw * 0.6, yaw);
    prism(b, top, y, y + 6, { wall: VH.col(0x52605c), style: 3, ww: 1, wh: 0.4, bay: 2, floorH: 6, seed });
    glow(ctx, top, cx, cz, y + 4.2, y + 5.4, VH.col(0x8affd0, 1.6));
    cap(b, top, y + 6, VH.col(0x52605c), seed);
    ctx.addBeacon(cx, y + 6.4, cz);
    solidRound(world, cx, cz, hw * 1.02, y);
    return { top: y + 6, obstacles: [[cx, cz, 22]] };
  }

  /** The Drum: a round tower with ribbon windows, a blue crown and a helipad. */
  function drum(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 53;
    const wall = VH.col(0xc7ccd1);
    const F = { wall, style: 3, ww: 1, wh: 0.55, bay: 2.8, floorH: 3.7, seed };
    const r = 16;
    const pts = ring(cx, cz, r, 18, 0);
    let y = lobby(ctx, ring(cx, cz, r + 1.5, 18, 0), cx, cz, VH.col(0x7b8794), seed);
    solidRound(world, cx, cz, (r + 1.5) * Math.cos(Math.PI / 18), y);
    const yTop = 146;
    prism(b, pts, y, yTop, F);
    y = yTop;
    const crown = ring(cx, cz, r + 0.6, 18, 0);
    prism(b, crown, y, y + 4, { wall: VH.col(0x26303a), style: 0, bay: 4, floorH: 4, seed });
    glow(ctx, crown, cx, cz, y + 1, y + 3, VH.col(0x5aa8ff, 1.8));
    cap(b, crown, y + 4, VH.col(0x6c727a), seed, true);
    // Helipad: a flat painted H on the roof.
    (world.signs || (world.signs = [])).push({ x: cx, y: y + 4.04, z: cz, yaw: 0, w: 12, h: 12, lines: ['H'], style: 'monolith', flat: true });
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) ctx.addBeacon(cx + Math.cos(a) * (r - 0.6), y + 4.4, cz - Math.sin(a) * (r - 0.6));
    solidRound(world, cx, cz, r * Math.cos(Math.PI / 18), y + 4);
    return { top: y + 4, obstacles: [[cx, cz, 19]], helipad: { x: cx, y: y + 4, z: cz } };
  }

  /** The Twins: two square towers and a glazed sky bridge two-thirds of the way up. */
  function twins(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 67;
    const glass = VH.col(0x8d98a6);
    const F = { wall: glass, style: 2, ww: 0.9, wh: 0.76, bay: 3.0, floorH: 3.9, seed };
    const gap = 30;
    const hw = 11;
    const H = 172;
    for (const side of [-1, 1]) {
      const tx = cx + side * (gap / 2 + hw);
      const pts = box4(tx, cz, hw, hw);
      const y = lobby(ctx, box4(tx, cz, hw + 1.5, hw + 1.5), tx, cz, VH.col(0x4c5562), seed);
      solidRect(world, tx, cz, hw + 1.5, hw + 1.5, 0, y);
      prism(b, pts, y, H, F);
      band(b, pts, tx, cz, H, 1.2, VH.col(0xdfe3e7));
      const crown = box4(tx, cz, hw * 0.7, hw * 0.7);
      prism(b, crown, H + 1.2, H + 9, { wall: VH.col(0x3a4049), style: 3, ww: 1, wh: 0.35, bay: 2, floorH: 7.8, seed });
      glow(ctx, crown, tx, cz, H + 6.5, H + 8, VH.col(0xff9ad5, 1.6));
      cap(b, crown, H + 9, VH.col(0x5f6670), seed);
      b.cylinder(tx, H + 9, cz, 0.6, 0.12, 18, 6, VH.col(0xd9dde2), false);
      ctx.addBeacon(tx, H + 27.3, cz);
      solidRect(world, tx, cz, hw, hw, 0, H + 9);
    }
    // Sky bridge: two floors of glass between the inner faces.
    const yb = 112;
    const bx0 = cx - gap / 2;
    const bx1 = cx + gap / 2;
    const bridge = [[bx0, cz + 4], [bx1, cz + 4], [bx1, cz - 4], [bx0, cz - 4]];
    prism(b, bridge, yb, yb + 8, { wall: VH.col(0x56606c), style: 2, ww: 0.95, wh: 0.8, bay: 3, floorH: 4, seed });
    cap(b, bridge, yb + 8, VH.col(0x5f6670), seed, true);
    b.quad([bx0, yb, cz - 4], [bx1, yb, cz - 4], [bx1, yb, cz + 4], [bx0, yb, cz + 4], [0, -1, 0], VH.col(0x3b424b));
    glow(ctx, bridge, cx, cz, yb - 0.4, yb, VH.col(0xffffff, 1.4));
    world.physics.addBox(bx0, yb, cz - 4, bx1, yb + 8, cz + 4, 'building');
    return { top: H + 27, obstacles: [[cx - gap / 2 - hw, cz, 15], [cx + gap / 2 + hw, cz, 15]] };
  }

  /** Meridian Heights: the tallest, five setbacks of dark glass and a spire. */
  function meridian(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 79;
    const glass = VH.col(0x3f5468);
    const F = { wall: glass, style: 2, ww: 0.95, wh: 0.8, bay: 3.6, floorH: 3.9, seed };
    const tiers = [[26, 18, 13], [22, 15, 12], [18, 12, 10], [14, 9, 8], [10, 7, 6]];
    let y = lobby(ctx, box4(cx, cz, 27.5, 19.5), cx, cz, VH.col(0x2a3644), seed);
    solidRect(world, cx, cz, 27.5, 19.5, 0, y);
    for (const [hw, hd, floors] of tiers) {
      const pts = box4(cx, cz, hw, hd);
      const h = floors * F.floorH;
      prism(b, pts, y, y + h, F);
      y += h;
      band(b, pts, cx, cz, y, 1.0, VH.col(0xb9c2cc));
      glow(ctx, inset(pts, cx, cz, 1.021), cx, cz, y + 0.25, y + 0.75, VH.col(0xfff1d6, 1.4));
      solidRect(world, cx, cz, hw, hd, 0, y + 1);
      y += 1;
    }
    // A spire of three telescoping sections.
    b.cylinder(cx, y, cz, 3.2, 2.4, 10, 8, VH.col(0xc7ced6), true, VH.col(0x9aa3ad));
    b.cylinder(cx, y + 10, cz, 1.8, 1.0, 14, 8, VH.col(0xd6dde4), true, VH.col(0xa5aeb8));
    b.cylinder(cx, y + 24, cz, 0.8, 0.1, 20, 8, VH.col(0xe4e9ee), false);
    ctx.addBeacon(cx, y + 44.3, cz);
    return { top: y + 44, obstacles: [[cx, cz, 32]] };
  }

  /** The Sail: a three-sided tower with clipped corners and a white crown. */
  function sail(world, cx, cz) {
    const ctx = world.ctxAt(cx, cz);
    const b = ctx.b;
    const seed = 89;
    const glass = VH.col(0xa7b8c8);
    const F = { wall: glass, style: 2, ww: 0.93, wh: 0.78, bay: 3.2, floorH: 3.9, seed };
    const tri = (r) => {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
        const a0 = a - 0.3;
        const a1 = a + 0.3;
        out.push([cx + Math.cos(a0) * r, cz - Math.sin(a0) * r], [cx + Math.cos(a1) * r, cz - Math.sin(a1) * r]);
      }
      return out;
    };
    const R = 24;
    let y = lobby(ctx, tri(R + 2), cx, cz, VH.col(0x5d6b79), seed);
    solidRound(world, cx, cz, (R + 2) * 0.62, y);
    const yTop = 126;
    prism(b, tri(R), y, yTop, F);
    y = yTop;
    const crown = tri(R * 0.92);
    prism(b, crown, y, y + 7, { wall: VH.col(0xf3f4f5), style: 0, bay: 4, floorH: 7, seed });
    glow(ctx, crown, cx, cz, y + 5.6, y + 6.6, VH.col(0xffffff, 1.7));
    cap(b, crown, y + 7, VH.col(0x6b7179), seed);
    ctx.addBeacon(cx, y + 7.4, cz);
    solidRound(world, cx, cz, R * 0.62, y + 7);
    return { top: y + 7, obstacles: [[cx, cz, 26]] };
  }

  const TOWERS = [
    { name: 'Coral Spire', fn: coralSpire, x: -51, z: -450 },
    { name: 'The Harbinger', fn: harbinger, x: -51, z: -588 },
    { name: 'The Wedge', fn: wedge, x: 62, z: -448 },
    { name: 'The Corkscrew', fn: corkscrew, x: 148, z: -448 },
    { name: 'The Drum', fn: drum, x: 236, z: -446 },
    { name: 'Meridian Heights', fn: meridian, x: 150, z: -590 },
    { name: 'The Twins', fn: twins, x: 64, z: -592 },
    { name: 'The Sail', fn: sail, x: 238, z: -588 },
  ];

  // ------------------------------------------------------------ ground
  /** Split a rectangle on chunk lines so each piece culls with its own chunk. */
  function chunked(x0, z0, x1, z1, fn) {
    const xs = [x0];
    for (let x = Math.ceil((x0 - ORIGIN) / CHUNK) * CHUNK + ORIGIN; x < x1; x += CHUNK) if (x > x0) xs.push(x);
    xs.push(x1);
    const zs = [z0];
    for (let z = Math.ceil((z0 - ORIGIN) / CHUNK) * CHUNK + ORIGIN; z < z1; z += CHUNK) if (z > z0) zs.push(z);
    zs.push(z1);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) fn(xs[i], zs[j], xs[i + 1], zs[j + 1]);
  }

  function parcel(world, P, obstacles) {
    const { x0, x1, z0, z1 } = P;
    // Kerbed slab, pavement round the edge, granite paving inside.
    chunked(x0, z0, x1, z1, (a0, b0, a1, b1) => {
      const ctx = world.ctxAt((a0 + a1) / 2, (b0 + b1) / 2);
      ctx.concrete.box(a0, 0, b0, a1, KERB, b1, VH.col(0xcfcac0), { skip: { top: true } });
      ctx.sidewalk.topRect(a0, b0, a1, b1, KERB, VH.col(0xffffff), 3);
    });
    world.physics.addBox(x0, -0.5, z0, x1, KERB, z1, 'kerb');
    chunked(x0 + SIDEWALK, z0 + SIDEWALK, x1 - SIDEWALK, z1 - SIDEWALK, (a0, b0, a1, b1) => {
      world.ctxAt((a0 + a1) / 2, (b0 + b1) / 2).plazaTop.topRect(a0, b0, a1, b1, KERB, VH.col(0xd9d6cf), 4);
    });
    const rng = new VH.RNG('northgate-' + P.id);
    const clear = (x, z, pad) => obstacles.every(([ox, oz, r]) => Math.hypot(x - ox, z - oz) > r + pad);
    // Street lights and palms along every edge.
    const edges = [
      { a0: x0, a1: x1, fixed: z0, inward: 1, yaw: Math.PI, alongX: true },
      { a0: x0, a1: x1, fixed: z1, inward: -1, yaw: 0, alongX: true },
      { a0: z0, a1: z1, fixed: x0, inward: 1, yaw: -Math.PI / 2, alongX: false },
      { a0: z0, a1: z1, fixed: x1, inward: -1, yaw: Math.PI / 2, alongX: false },
    ];
    edges.forEach((e, ei) => {
      const pos = (along, d) => (e.alongX ? [along, e.fixed + e.inward * d] : [e.fixed + e.inward * d, along]);
      for (let p = e.a0 + 8 + (ei % 2) * 13; p < e.a1 - 7; p += 26) {
        const [x, z] = pos(p, 0.7);
        world.addProp('streetlight', x, KERB, z, e.yaw, 1);
      }
      for (let p = e.a0 + 21; p < e.a1 - 10; p += 26) {
        const [x, z] = pos(p, 1.6);
        if (clear(x, z, 1)) world.addProp('palmTall', x, KERB, z, rng.range(0, 6.28), rng.range(0.9, 1.15));
      }
    });
    // Planters and benches across the plaza, clear of the towers.
    for (let x = x0 + 14; x < x1 - 10; x += 17) {
      for (let z = z0 + 14; z < z1 - 10; z += 17) {
        const px = x + rng.range(-2, 2);
        const pz = z + rng.range(-2, 2);
        if (!clear(px, pz, 4)) continue;
        const roll = rng.next();
        if (roll < 0.45) world.addProp('planter', px, KERB, pz, rng.pick([0, Math.PI / 2]), 1);
        else if (roll < 0.7) world.addProp('tree', px, KERB, pz, rng.range(0, 6.28), rng.range(0.8, 1.05));
        else if (roll < 0.88) world.addProp('bench', px, KERB, pz, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 1);
        else world.addProp('bin', px, KERB, pz, 0, 1);
      }
    }
  }

  // ================================================================ skyline
  const Skyline = {
    build(world, layout) {
      const obstacles = [];
      const towers = [];
      let tallest = 0;
      for (const t of TOWERS) {
        LOBBIES.length = 0;
        const r = t.fn(world, t.x, t.z);
        obstacles.push(...r.obstacles);
        towers.push({ name: t.name, x: t.x, z: t.z, top: r.top, r: r.obstacles[0][2], obstacles: r.obstacles, foot: LOBBIES.slice(), helipad: r.helipad || null });
        tallest = Math.max(tallest, r.top);
      }
      for (const P of PARCELS) parcel(world, P, obstacles);
      // A name stone at the plaza corner on Grand Avenue and Skyline Drive.
      (world.signs || (world.signs = [])).push({ x: 24, y: 1.6, z: -501.5, yaw: Math.PI, w: 7.5, h: 1.8, lines: ['NORTHGATE HEIGHTS', 'Vicehaven Financial District'], style: 'monolith', posts: true });
      world.stats.tallest = Math.max(world.stats.tallest || 0, tallest);
      world.stats.buildings = (world.stats.buildings || 0) + towers.length + 1;
      layout.skyline = { parcels: PARCELS, towers };
      return layout.skyline;
    },

    registerPlaces(world, places) {
      if (!world.skyline) return;
      places.add('northgate_heights', { name: 'Northgate Heights, Skyline Drive', x: 22, z: -498, yaw: 0, kind: 'skyline', district: 'northgate' });
      places.add('northgate_plaza', { name: 'Meridian Heights plaza', x: 150, z: -546, yaw: Math.PI, kind: 'skyline', district: 'northgate' });
    },
  };

  // ------------------------------------------------------------------ map
  VH.MapPainters = VH.MapPainters || [];
  VH.MapPainters.push((g, layout, o) => {
    const s = layout.skyline;
    if (!s) return;
    // Pavement like the city's blocks, the plaza paving a shade lighter.
    for (const P of s.parcels) {
      g.fillStyle = (o.PAL && o.PAL.pave) || '#283042';
      o.R(P.x0, P.z0, P.x1, P.z1);
      g.fillStyle = '#323a4e';
      o.R(P.x0 + SIDEWALK, P.z0 + SIDEWALK, P.x1 - SIDEWALK, P.z1 - SIDEWALK);
    }
    // Each tower's real footprint, with a drop shadow and a lit roof.
    const poly = (pts, dx, dz, k, cx, cz) => {
      g.beginPath();
      pts.forEach(([x, z], i) => {
        const px = cx + (x - cx) * k + dx;
        const pz = cz + (z - cz) * k + dz;
        if (i) g.lineTo(px, pz);
        else g.moveTo(px, pz);
      });
      g.closePath();
      g.fill();
    };
    for (const t of s.towers) {
      for (const pts of t.foot || []) {
        let cx = 0;
        let cz = 0;
        for (const [x, z] of pts) {
          cx += x;
          cz += z;
        }
        cx /= pts.length;
        cz /= pts.length;
        g.fillStyle = 'rgba(0, 0, 0, 0.4)';
        poly(pts, 4, 4, 1, cx, cz);
        g.fillStyle = (o.PAL && o.PAL.building) || '#1a2031';
        poly(pts, 0, 0, 1, cx, cz);
        g.fillStyle = '#2c3650';
        poly(pts, 0, 0, 0.72, cx, cz);
      }
    }
  });

  VH.Skyline = Skyline;
})();
