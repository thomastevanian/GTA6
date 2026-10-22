/*
 * buildings.js — procedural building generator.
 *
 * Given a lot from citygen.js, emits merged geometry (walls with window
 * grids, roofs, cornices, balconies, awnings, rooftop machinery) into the
 * chunk's builders, registers collision boxes, and asks for props (garden
 * palms, dumpsters) through ctx.addProp.
 *
 * Window grids: every wall gets integer bay counts so windows are centred
 * and whole; v counts floors from the bottom of each mass. The shader in
 * materials.js turns (grid, facade) into actual windows.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;

  // --------------------------------------------------------------- helpers
  function shade(color, rng, amount) {
    const m = 1 + rng.range(-amount, amount);
    return [color[0] * m, color[1] * m, color[2] * m];
  }

  function pick(rng, list, amount) {
    return shade(VH.col(rng.pick(list)), rng, amount === undefined ? 0.06 : amount);
  }

  function facadeVec(F, blank) {
    return blank ? [0, 0, 0, F.seed] : [F.ww, F.wh, F.style, F.seed];
  }

  /**
   * Walls of a box with window grids. `sides` maps n/s/e/w to 'win',
   * 'blank' (no windows) or 'skip' (not drawn). Missing entries mean 'win'.
   */
  function facadeWalls(b, x0, y0, z0, x1, y1, z1, F, sides) {
    const h = y1 - y0;
    const v0 = F.vStart || 0;
    const v1 = v0 + h / F.floorH;
    const faces = [
      ['s', [x0, y0, z1], 1, 0, x1 - x0],
      ['n', [x1, y0, z0], -1, 0, x1 - x0],
      ['e', [x1, y0, z1], 0, -1, z1 - z0],
      ['w', [x0, y0, z0], 0, 1, z1 - z0],
    ];
    for (const [side, o, ux, uz, len] of faces) {
      const mode = (sides && sides[side]) || 'win';
      if (mode === 'skip' || len <= 0.01) continue;
      const blank = mode === 'blank' || F.style === 0;
      const bays = Math.max(1, Math.round(len / F.bay));
      b.wall(o, ux, uz, len, h, F.wall, null, [0, bays, v0, v1], facadeVec(F, blank));
    }
  }

  function roof(b, x0, z0, x1, z1, y, color, seed, gravel) {
    b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, null, null,
      [0, 0, gravel === false ? 0 : -1, seed]);
  }

  function parapet(b, x0, z0, x1, z1, y, h, t, color) {
    b.box(x0, y, z0, x1, y + h, z0 + t, color);
    b.box(x0, y, z1 - t, x1, y + h, z1, color);
    b.box(x0, y, z0 + t, x0 + t, y + h, z1 - t, color);
    b.box(x1 - t, y, z0 + t, x1, y + h, z1 - t, color);
  }

  function cornice(b, x0, z0, x1, z1, y, h, out, color) {
    b.box(x0 - out, y, z0 - out, x1 + out, y + h, z1 + out, color, { bottom: true });
  }

  function waterTank(b, cx, cz, y, rng) {
    const wood = VH.col(0x6b4f3a, rng.range(0.85, 1.1));
    const legs = VH.col(0x3a3a3a);
    const r = rng.range(1.2, 1.7);
    const legH = 2.2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = cx + dx * r * 0.6;
      const lz = cz + dz * r * 0.6;
      b.box(lx - 0.1, y, lz - 0.1, lx + 0.1, y + legH, lz + 0.1, legs);
    }
    b.cylinder(cx, y + legH, cz, r, r, r * 2.1, 10, wood, false);
    b.cylinder(cx, y + legH + r * 2.1, cz, r * 1.05, 0.15, r * 0.9, 10, VH.col(0x4a4038), false);
  }

  /** Air-conditioning units, vents and a stair bulkhead scattered on a flat roof. */
  function rooftopClutter(b, rng, x0, z0, x1, z1, y, opts) {
    const w = x1 - x0;
    const d = z1 - z0;
    if (w < 6 || d < 6) return;
    const metal = VH.col(0x9aa0a6);
    const dark = VH.col(0x5d6166);
    const n = Math.min(8, Math.floor((w * d) / 120) + rng.int(0, 2));
    for (let i = 0; i < n; i++) {
      const sx = rng.range(1.4, 3.2);
      const sz = rng.range(1.2, 2.4);
      const px = rng.range(x0 + 1.5, x1 - 1.5 - sx);
      const pz = rng.range(z0 + 1.5, z1 - 1.5 - sz);
      const h = rng.range(0.9, 1.8);
      b.box(px, y, pz, px + sx, y + h, pz + sz, rng.chance(0.5) ? metal : dark);
    }
    if (rng.chance(0.7)) {
      // Stair and lift bulkhead.
      const bw = Math.min(6, w * 0.3);
      const bd = Math.min(5, d * 0.3);
      const px = rng.range(x0 + 2, x1 - 2 - bw);
      const pz = rng.range(z0 + 2, z1 - 2 - bd);
      const col = opts && opts.wall ? opts.wall : VH.col(0xb0aca4);
      b.box(px, y, pz, px + bw, y + 3.2, pz + bd, col);
    }
    if (opts && opts.tanks && rng.chance(opts.tanks)) {
      waterTank(b, rng.range(x0 + 3, x1 - 3), rng.range(z0 + 3, z1 - 3), y, rng);
    }
  }

  /** Which way each side of a lot faces: street ('win'), alley ('win') or neighbour ('blank'). */
  function sideModes(lot, inset) {
    const out = {};
    for (const s of ['n', 's', 'e', 'w']) {
      if (lot.front[s] || lot.back[s]) out[s] = 'win';
      else out[s] = inset[s] > 1.5 ? 'win' : 'blank';
    }
    return out;
  }

  function insetRect(lot, inset) {
    return {
      x0: lot.minX + inset.w,
      x1: lot.maxX - inset.e,
      z0: lot.minZ + inset.n,
      z1: lot.maxZ - inset.s,
    };
  }

  /** Ground-floor storefronts on street sides, blank on the others. */
  function groundFloor(b, r, y0, h, lot, wall, seed, rng) {
    const F = { wall, style: 4, ww: rng.range(0.78, 0.9), wh: 0.8, bay: rng.range(4.5, 6.5), floorH: h, seed };
    const sides = {};
    for (const s of ['n', 's', 'e', 'w']) sides[s] = lot.front[s] ? 'win' : 'blank';
    facadeWalls(b, r.x0, y0, r.z0, r.x1, y0 + h, r.z1, F, sides);
  }

  function frontFaces(lot) {
    return ['n', 's', 'e', 'w'].filter((s) => lot.front[s]);
  }

  /** Run fn(x0, z0, x1, z1, outX, outZ) for the strip just outside a face. */
  function alongFace(r, side, depth, fn) {
    if (side === 's') fn(r.x0, r.z1, r.x1, r.z1 + depth, 0, 1);
    else if (side === 'n') fn(r.x0, r.z0 - depth, r.x1, r.z0, 0, -1);
    else if (side === 'e') fn(r.x1, r.z0, r.x1 + depth, r.z1, 1, 0);
    else fn(r.x0 - depth, r.z0, r.x0, r.z1, -1, 0);
  }

  function addCollider(ctx, x0, z0, x1, z1, top) {
    ctx.physics.addBox(x0, 0, z0, x1, top, z1, 'building');
  }

  // ------------------------------------------------------------ archetypes
  function tower(ctx, lot, rng) {
    const b = ctx.b;
    const pal = lot.district.palette;
    const seed = rng.range(0, 100);
    const focus = lot.district.heightFocus;
    let f = 0;
    if (focus) {
      const dist = Math.hypot(lot.cx - focus.x, lot.cz - focus.z);
      f = Math.max(0, 1 - dist / focus.radius) * focus.boost;
    }
    const [fMin, fMax] = lot.floorRange;
    let floors = Math.round(VH.math.lerp(fMin, fMax, Math.pow(rng.next(), 1.2)) * (0.55 + 0.85 * f));
    floors = VH.math.clamp(floors, Math.round(fMin * 0.6), Math.round(fMax * 1.25));

    const inset = { n: 0.5, s: 0.5, e: 0.5, w: 0.5 };
    const podium = insetRect(lot, inset);
    const pw = podium.x1 - podium.x0;
    const pd = podium.z1 - podium.z0;
    const frame = pick(rng, pal.walls, 0.08);
    const podiumFloors = rng.int(2, 4);
    const groundH = 5.6;
    const podH = groundH + (podiumFloors - 1) * 4.2;
    groundFloor(b, podium, KERB, groundH, lot, frame, seed, rng);
    const podF = { wall: frame, style: rng.chance(0.5) ? 3 : 2, ww: 1, wh: rng.range(0.5, 0.62), bay: 3.2, floorH: 4.2, seed };
    if (podF.style === 2) podF.ww = 0.9;
    if (podiumFloors > 1) facadeWalls(b, podium.x0, KERB + groundH, podium.z0, podium.x1, KERB + podH, podium.z1, podF, sideModes(lot, inset));
    roof(b, podium.x0, podium.z0, podium.x1, podium.z1, KERB + podH, pick(rng, pal.roofs), seed);
    addCollider(ctx, podium.x0, podium.z0, podium.x1, podium.z1, KERB + podH);

    // Shaft: set back from the podium when the lot is big enough.
    const set = Math.min(pw, pd) > 30 ? rng.range(3, 6) : Math.min(pw, pd) > 22 ? rng.range(1.5, 3) : 0;
    let sx0 = podium.x0 + set;
    let sx1 = podium.x1 - set;
    let sz0 = podium.z0 + set;
    let sz1 = podium.z1 - set;
    const style = rng.weighted([2, 1, 3], [6, 2, 2]);
    const F = {
      wall: frame, style,
      ww: style === 2 ? rng.range(0.9, 0.96) : style === 3 ? 1 : rng.range(0.5, 0.68),
      wh: style === 2 ? rng.range(0.7, 0.82) : style === 3 ? rng.range(0.5, 0.62) : rng.range(0.55, 0.68),
      bay: style === 1 ? rng.range(2.4, 3.2) : rng.range(3.0, 3.8),
      floorH: 3.9, seed,
    };
    const shaftFloors = Math.max(4, floors - podiumFloors);
    let tiers = 1;
    if (shaftFloors > 22 && rng.chance(0.65)) tiers = shaftFloors > 34 ? 3 : 2;
    let y = KERB + podH;
    let remaining = shaftFloors;
    for (let t = 0; t < tiers; t++) {
      const tf = t === tiers - 1 ? remaining : Math.round(remaining * rng.range(0.45, 0.6));
      remaining -= tf;
      const h = tf * F.floorH;
      F.vStart = 0;
      facadeWalls(b, sx0, y, sz0, sx1, y + h, sz1, F);
      y += h;
      // A slim spandrel band at each setback.
      cornice(b, sx0, sz0, sx1, sz1, y, 0.8, 0.25, VH.colMul(frame, 0.8));
      roof(b, sx0 - 0.25, sz0 - 0.25, sx1 + 0.25, sz1 + 0.25, y + 0.8, pick(rng, pal.roofs), seed);
      addCollider(ctx, sx0, sz0, sx1, sz1, y + 0.8);
      y += 0.8;
      if (t < tiers - 1) {
        const step = Math.min(sx1 - sx0, sz1 - sz0) * rng.range(0.08, 0.15);
        sx0 += step;
        sx1 -= step;
        sz0 += step;
        sz1 -= step;
      }
    }

    // Crown: a mechanical penthouse, sometimes a mast.
    const cw = (sx1 - sx0) * 0.55;
    const cd = (sz1 - sz0) * 0.55;
    const ccx = (sx0 + sx1) / 2;
    const ccz = (sz0 + sz1) / 2;
    const crownH = rng.range(4, 7);
    const crownF = { wall: VH.colMul(frame, 0.75), style: 3, ww: 1, wh: 0.35, bay: 2, floorH: crownH, seed };
    facadeWalls(b, ccx - cw / 2, y, ccz - cd / 2, ccx + cw / 2, y + crownH, ccz + cd / 2, crownF);
    roof(b, ccx - cw / 2, ccz - cd / 2, ccx + cw / 2, ccz + cd / 2, y + crownH, pick(rng, pal.roofs), seed);
    rooftopClutter(b, rng, sx0, sz0, ccx - cw / 2, sz1, y, {});
    if (rng.chance(0.45)) {
      const mastH = rng.range(10, 28);
      b.cylinder(ccx, y + crownH, ccz, 0.5, 0.18, mastH, 6, VH.col(0xb8bcc2), false);
      ctx.addBeacon(ccx, y + crownH + mastH + 0.3, ccz);
    }
    return y + crownH;
  }

  function office(ctx, lot, rng) {
    const b = ctx.b;
    const pal = lot.district.palette;
    const seed = rng.range(0, 100);
    const floors = rng.int(lot.floorRange[0], lot.floorRange[1]);
    const inset = {
      n: lot.front.n ? 0 : lot.back.n ? rng.range(0.5, 2) : 0,
      s: lot.front.s ? 0 : lot.back.s ? rng.range(0.5, 2) : 0,
      e: lot.front.e ? 0 : lot.back.e ? rng.range(0.5, 2) : 0,
      w: lot.front.w ? 0 : lot.back.w ? rng.range(0.5, 2) : 0,
    };
    const r = insetRect(lot, inset);
    const wall = pick(rng, pal.walls, 0.07);
    const groundH = 4.8;
    groundFloor(b, r, KERB, groundH, lot, VH.colMul(wall, 0.85), seed, rng);
    const style = rng.chance(0.3) ? 3 : 1;
    const F = {
      wall, style,
      ww: style === 3 ? 1 : rng.range(0.45, 0.66),
      wh: style === 3 ? rng.range(0.42, 0.55) : rng.range(0.5, 0.64),
      bay: rng.range(2.6, 3.6), floorH: 3.6, seed,
    };
    const top = KERB + groundH + (floors - 1) * F.floorH;
    facadeWalls(b, r.x0, KERB + groundH, r.z0, r.x1, top, r.z1, F, sideModes(lot, inset));
    const accent = pick(rng, pal.accents, 0.05);
    // A band between shops and offices, and a cornice at the top.
    cornice(b, r.x0, r.z0, r.x1, r.z1, KERB + groundH - 0.1, 0.45, 0.2, accent);
    cornice(b, r.x0, r.z0, r.x1, r.z1, top, 0.7, 0.35, accent);
    roof(b, r.x0, r.z0, r.x1, r.z1, top + 0.7, pick(rng, pal.roofs), seed);
    parapet(b, r.x0, r.z0, r.x1, r.z1, top + 0.7, 0.8, 0.3, VH.colMul(wall, 0.9));
    rooftopClutter(b, rng, r.x0, r.z0, r.x1, r.z1, top + 0.7, { tanks: lot.district.id === 'oldmarket' ? 0.4 : 0.1 });
    addCollider(ctx, r.x0, r.z0, r.x1, r.z1, top + 1.5);
    shopSigns(ctx, lot, r, rng, KERB + groundH - 1.3);
    return top;
  }

  function shophouse(ctx, lot, rng) {
    const b = ctx.b;
    const pal = lot.district.palette;
    const seed = rng.range(0, 100);
    const floors = rng.int(lot.floorRange[0], lot.floorRange[1]);
    const inset = { n: 0, s: 0, e: 0, w: 0 };
    for (const s of ['n', 's', 'e', 'w']) if (lot.back[s]) inset[s] = rng.range(0.5, 2.5);
    const r = insetRect(lot, inset);
    const wall = pick(rng, pal.walls, 0.1);
    const groundH = 4.2;
    groundFloor(b, r, KERB, groundH, lot, VH.colMul(wall, 0.8), seed, rng);
    const F = { wall, style: 1, ww: rng.range(0.38, 0.52), wh: rng.range(0.55, 0.66), bay: rng.range(2.4, 3.2), floorH: 3.4, seed };
    const top = KERB + groundH + (floors - 1) * F.floorH;
    if (floors > 1) facadeWalls(b, r.x0, KERB + groundH, r.z0, r.x1, top, r.z1, F, sideModes(lot, inset));
    const trim = pick(rng, pal.accents, 0.05);
    cornice(b, r.x0, r.z0, r.x1, r.z1, top, 0.6, 0.3, trim);
    roof(b, r.x0, r.z0, r.x1, r.z1, top + 0.6, pick(rng, pal.roofs), seed);
    parapet(b, r.x0, r.z0, r.x1, r.z1, top + 0.6, 0.9, 0.3, VH.colMul(wall, 0.92));
    rooftopClutter(b, rng, r.x0, r.z0, r.x1, r.z1, top + 0.6, { tanks: 0.55 });
    addCollider(ctx, r.x0, r.z0, r.x1, r.z1, top + 1.5);

    // Striped canvas awnings over the shopfronts.
    for (const side of frontFaces(lot)) {
      const awning = pick(rng, pal.accents, 0.05);
      alongFace(r, side, 1.5, (x0, z0, x1, z1, ox, oz) => {
        const inX = ox === 0;
        const a0 = inX ? x0 + 1 : x0;
        const a1 = inX ? x1 - 1 : x1;
        const b0 = inX ? z0 : z0 + 1;
        const b1 = inX ? z1 : z1 - 1;
        b.box(a0, 3.25, b0, a1, 3.38, b1, awning, { bottom: true });
        // Valance along the outer edge.
        if (ox === 1) b.box(x1 - 0.06, 2.95, b0, x1, 3.38, b1, awning);
        if (ox === -1) b.box(x0, 2.95, b0, x0 + 0.06, 3.38, b1, awning);
        if (oz === 1) b.box(a0, 2.95, z1 - 0.06, a1, 3.38, z1, awning);
        if (oz === -1) b.box(a0, 2.95, z0, a1, 3.38, z0 + 0.06, awning);
      });
    }
    shopSigns(ctx, lot, r, rng, 3.5);
    return top;
  }

  function apartment(ctx, lot, rng) {
    const b = ctx.b;
    const pal = lot.district.palette;
    const seed = rng.range(0, 100);
    const floors = rng.int(lot.floorRange[0], lot.floorRange[1]);
    const setback = lot.district.id === 'palmcrescent' ? rng.range(1.5, 4) : 0;
    const inset = {
      n: lot.front.n ? setback : 0.5, s: lot.front.s ? setback : 0.5,
      e: lot.front.e ? setback : 0.5, w: lot.front.w ? setback : 0.5,
    };
    const r = insetRect(lot, inset);
    if (r.x1 - r.x0 < 8 || r.z1 - r.z0 < 8) return villa(ctx, lot, rng);
    const wall = pick(rng, pal.walls, 0.06);
    const groundH = 4.0;
    const commercial = setback < 1;
    if (commercial) groundFloor(b, r, KERB, groundH, lot, VH.colMul(wall, 0.86), seed, rng);
    else {
      const G = { wall: VH.colMul(wall, 0.92), style: 1, ww: 0.5, wh: 0.55, bay: 3.2, floorH: groundH, seed };
      facadeWalls(b, r.x0, KERB, r.z0, r.x1, KERB + groundH, r.z1, G, sideModes(lot, inset));
    }
    const F = { wall, style: 1, ww: rng.range(0.42, 0.58), wh: rng.range(0.5, 0.62), bay: rng.range(3.0, 3.8), floorH: 3.1, seed };
    const top = KERB + groundH + (floors - 1) * F.floorH;
    facadeWalls(b, r.x0, KERB + groundH, r.z0, r.x1, top, r.z1, F, sideModes(lot, inset));
    const trim = pick(rng, pal.accents, 0.04);
    cornice(b, r.x0, r.z0, r.x1, r.z1, top, 0.5, 0.25, trim);
    roof(b, r.x0, r.z0, r.x1, r.z1, top + 0.5, pick(rng, pal.roofs), seed);
    parapet(b, r.x0, r.z0, r.x1, r.z1, top + 0.5, 1.0, 0.25, VH.colMul(wall, 0.95));
    rooftopClutter(b, rng, r.x0, r.z0, r.x1, r.z1, top + 0.5, { tanks: 0.3 });
    addCollider(ctx, r.x0, r.z0, r.x1, r.z1, top + 1.5);

    // Continuous balconies on the street faces: a slab and a glass-look rail per floor.
    const slabCol = VH.colMul(wall, 1.05);
    const railCol = rng.chance(0.5) ? VH.col(0x9fb7c2) : trim;
    for (const side of frontFaces(lot)) {
      for (let fl = 1; fl < floors; fl++) {
        const y = KERB + groundH + (fl - 1) * F.floorH;
        alongFace(r, side, 1.2, (x0, z0, x1, z1, ox, oz) => {
          const inX = ox === 0;
          const a0 = inX ? x0 + 1.2 : x0;
          const a1 = inX ? x1 - 1.2 : x1;
          const c0 = inX ? z0 : z0 + 1.2;
          const c1 = inX ? z1 : z1 - 1.2;
          if (a1 - a0 < 2 || c1 - c0 < 0.5) return;
          b.box(a0, y, c0, a1, y + 0.18, c1, slabCol, { bottom: true });
          if (ox === 1) b.box(x1 - 0.06, y + 0.18, c0, x1, y + 1.1, c1, railCol);
          if (ox === -1) b.box(x0, y + 0.18, c0, x0 + 0.06, y + 1.1, c1, railCol);
          if (oz === 1) b.box(a0, y + 0.18, z1 - 0.06, a1, y + 1.1, z1, railCol);
          if (oz === -1) b.box(a0, y + 0.18, z0, a1, y + 1.1, z0 + 0.06, railCol);
        });
      }
    }
    if (setback > 1.2) frontGarden(ctx, lot, r, rng);
    return top;
  }

  function hotel(ctx, lot, rng) {
    const b = ctx.b;
    const pal = lot.district.palette;
    const seed = rng.range(0, 100);
    const floors = rng.int(lot.floorRange[0], lot.floorRange[1]);
    const inset = {
      n: lot.front.n ? rng.range(0, 2) : 0.5, s: lot.front.s ? rng.range(0, 2) : 0.5,
      e: lot.front.e ? rng.range(0, 2) : 0.5, w: lot.front.w ? rng.range(0, 2) : 0.5,
    };
    const r = insetRect(lot, inset);
    const wall = pick(rng, pal.walls, 0.04);
    const groundH = 5.2;
    groundFloor(b, r, KERB, groundH, lot, VH.colMul(wall, 0.9), seed, rng);
    const F = { wall, style: rng.chance(0.4) ? 3 : 1, ww: 0.62, wh: 0.58, bay: rng.range(3.2, 4.0), floorH: 3.2, seed };
    if (F.style === 3) {
      F.ww = 1;
      F.wh = 0.5;
    }
    const top = KERB + groundH + (floors - 1) * F.floorH;
    facadeWalls(b, r.x0, KERB + groundH, r.z0, r.x1, top, r.z1, F, sideModes(lot, inset));
    const accent = pick(rng, pal.accents, 0.03);
    // Art-deco style vertical fins up the street faces.
    for (const side of frontFaces(lot)) {
      const len = side === 'n' || side === 's' ? r.x1 - r.x0 : r.z1 - r.z0;
      const bays = Math.max(1, Math.round(len / F.bay));
      const bw = len / bays;
      const every = bays > 8 ? 3 : 2;
      for (let i = 0; i <= bays; i += every) {
        const p = i * bw;
        const t = 0.35;
        const dp = 0.7;
        if (side === 's') b.box(r.x0 + p - t / 2, KERB + groundH, r.z1, r.x0 + p + t / 2, top + 1.6, r.z1 + dp, accent);
        else if (side === 'n') b.box(r.x0 + p - t / 2, KERB + groundH, r.z0 - dp, r.x0 + p + t / 2, top + 1.6, r.z0, accent);
        else if (side === 'e') b.box(r.x1, KERB + groundH, r.z0 + p - t / 2, r.x1 + dp, top + 1.6, r.z0 + p + t / 2, accent);
        else b.box(r.x0 - dp, KERB + groundH, r.z0 + p - t / 2, r.x0, top + 1.6, r.z0 + p + t / 2, accent);
      }
    }
    cornice(b, r.x0, r.z0, r.x1, r.z1, KERB + groundH - 0.2, 0.5, 0.6, accent);
    cornice(b, r.x0, r.z0, r.x1, r.z1, top, 0.9, 0.3, accent);
    roof(b, r.x0, r.z0, r.x1, r.z1, top + 0.9, pick(rng, pal.roofs), seed);
    // Stepped crown.
    const cw = (r.x1 - r.x0) * 0.4;
    const cd = (r.z1 - r.z0) * 0.4;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const ch = rng.range(3, 5);
    b.box(cx - cw / 2, top + 0.9, cz - cd / 2, cx + cw / 2, top + 0.9 + ch, cz + cd / 2, wall, { top: VH.colMul(wall, 0.8) });
    b.box(cx - cw / 4, top + 0.9 + ch, cz - cd / 4, cx + cw / 4, top + 0.9 + ch + 2, cz + cd / 4, accent);
    parapet(b, r.x0, r.z0, r.x1, r.z1, top + 0.9, 0.8, 0.25, wall);
    addCollider(ctx, r.x0, r.z0, r.x1, r.z1, top + 1.7);
    return top;
  }

  function villa(ctx, lot, rng) {
    const b = ctx.b;
    const pal = lot.district.palette;
    const seed = rng.range(0, 100);
    const inset = {
      n: lot.front.n ? rng.range(4, 6) : 2.5, s: lot.front.s ? rng.range(4, 6) : 2.5,
      e: lot.front.e ? rng.range(4, 6) : 2.5, w: lot.front.w ? rng.range(4, 6) : 2.5,
    };
    const r = insetRect(lot, inset);
    if (r.x1 - r.x0 < 6 || r.z1 - r.z0 < 6) return 0;
    const wall = pick(rng, pal.walls, 0.05);
    const F = { wall, style: 1, ww: 0.55, wh: 0.6, bay: rng.range(3.2, 4.2), floorH: 3.2, seed };
    const top = KERB + 2 * F.floorH;
    facadeWalls(b, r.x0, KERB, r.z0, r.x1, top, r.z1, F);
    // Gable roof along the longer side, with a small overhang.
    const tile = pick(rng, pal.roofs, 0.06);
    const o = 0.5;
    const x0 = r.x0 - o, x1 = r.x1 + o, z0 = r.z0 - o, z1 = r.z1 + o;
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
    const rise = Math.min(3.2, (alongX ? r.z1 - r.z0 : r.x1 - r.x0) * 0.32);
    const yr = top + rise;
    // Eaves trim, standing just proud of the walls so the two never z-fight.
    b.box(r.x0 - 0.08, top - 0.3, r.z0 - 0.08, r.x1 + 0.08, top, r.z1 + 0.08, VH.colMul(wall, 0.9), { skip: { top: true }, bottom: true });
    if (alongX) {
      const zm = (z0 + z1) / 2;
      b.polygon([[x0, top, z1], [x1, top, z1], [x1, yr, zm], [x0, yr, zm]], tile);
      b.polygon([[x1, top, z0], [x0, top, z0], [x0, yr, zm], [x1, yr, zm]], tile);
      b.polygon([[r.x1, top, r.z1], [r.x1, top, r.z0], [r.x1, yr, zm]], wall, [0, 0, 0, seed]);
      b.polygon([[r.x0, top, r.z0], [r.x0, top, r.z1], [r.x0, yr, zm]], wall, [0, 0, 0, seed]);
    } else {
      const xm = (x0 + x1) / 2;
      b.polygon([[x1, top, z1], [x1, top, z0], [xm, yr, z0], [xm, yr, z1]], tile);
      b.polygon([[x0, top, z0], [x0, top, z1], [xm, yr, z1], [xm, yr, z0]], tile);
      b.polygon([[r.x0, top, r.z1], [r.x1, top, r.z1], [xm, yr, r.z1]], wall, [0, 0, 0, seed]);
      b.polygon([[r.x1, top, r.z0], [r.x0, top, r.z0], [xm, yr, r.z0]], wall, [0, 0, 0, seed]);
    }
    addCollider(ctx, r.x0, r.z0, r.x1, r.z1, top + rise * 0.6);
    frontGarden(ctx, lot, r, rng);
    return yr;
  }

  /** Grass between the building and the pavement, a low wall with a gate, and palms. */
  function frontGarden(ctx, lot, r, rng) {
    const wallCol = VH.col(rng.pick([0xe9e1d0, 0xd8cdb8, 0xf2efe8, 0xc9b79c]));
    const h = rng.range(0.7, 1.1);
    const t = 0.3;
    for (const side of frontFaces(lot)) {
      // Garden strip.
      let gx0, gx1, gz0, gz1;
      if (side === 'n') { gx0 = lot.minX; gx1 = lot.maxX; gz0 = lot.minZ; gz1 = r.z0; }
      else if (side === 's') { gx0 = lot.minX; gx1 = lot.maxX; gz0 = r.z1; gz1 = lot.maxZ; }
      else if (side === 'w') { gx0 = lot.minX; gx1 = r.x0; gz0 = lot.minZ; gz1 = lot.maxZ; }
      else { gx0 = r.x1; gx1 = lot.maxX; gz0 = lot.minZ; gz1 = lot.maxZ; }
      if (gx1 - gx0 < 1 || gz1 - gz0 < 1) continue;
      ctx.grassTop.topRect(gx0, gz0, gx1, gz1, KERB, VH.col(0xffffff), 6);
      if (ctx.addLawn) ctx.addLawn(gx0, gz0, gx1, gz1);
      // Wall along the lot edge with a gate gap in the middle.
      const horizontal = side === 'n' || side === 's';
      const edge = side === 'n' ? lot.minZ : side === 's' ? lot.maxZ - t : side === 'w' ? lot.minX : lot.maxX - t;
      const a = horizontal ? lot.minX : lot.minZ;
      const bEnd = horizontal ? lot.maxX : lot.maxZ;
      const mid = (a + bEnd) / 2;
      const gap = 1.8;
      for (const [s0, s1] of [[a, mid - gap], [mid + gap, bEnd]]) {
        if (s1 - s0 < 0.5) continue;
        if (horizontal) {
          ctx.b.box(s0, KERB, edge, s1, KERB + h, edge + t, wallCol);
          ctx.physics.addBox(s0, 0, edge, s1, KERB + h, edge + t, 'wall');
        } else {
          ctx.b.box(edge, KERB, s0, edge + t, KERB + h, s1, wallCol);
          ctx.physics.addBox(edge, 0, s0, edge + t, KERB + h, s1, 'wall');
        }
      }
      // A palm or two in the garden.
      const gw = gx1 - gx0;
      const gd = gz1 - gz0;
      if (Math.min(gw, gd) > 2.5) {
        const n = rng.int(1, 2);
        for (let i = 0; i < n; i++) {
          const px = horizontal ? VH.math.lerp(gx0 + 2, gx1 - 2, rng.next()) : (gx0 + gx1) / 2;
          const pz = horizontal ? (gz0 + gz1) / 2 : VH.math.lerp(gz0 + 2, gz1 - 2, rng.next());
          if (Math.abs((horizontal ? px : pz) - mid) < 3) continue;
          ctx.addProp('palm', px, pz, rng.range(0, Math.PI * 2), rng.range(0.7, 1.0), KERB);
        }
      }
    }
  }

  /** Coloured sign panels over shopfronts (lettering arrives with the shops in Phase 10). */
  function shopSigns(ctx, lot, r, rng, y) {
    const b = ctx.b;
    const colours = [0xd93b48, 0x2a7de1, 0x1faa6b, 0xf2b01e, 0x8a3fd1, 0xef6c2f, 0x16a3a3, 0x222222];
    for (const side of frontFaces(lot)) {
      const len = side === 'n' || side === 's' ? r.x1 - r.x0 : r.z1 - r.z0;
      const n = Math.max(1, Math.floor(len / 9));
      for (let i = 0; i < n; i++) {
        if (!rng.chance(0.75)) continue;
        const col = VH.col(rng.pick(colours));
        const w = rng.range(3, 6);
        const c = (i + 0.5) * (len / n);
        const p0 = c - w / 2;
        const p1 = c + w / 2;
        const d = 0.18;
        const h = 0.9;
        if (side === 's') b.box(r.x0 + p0, y, r.z1, r.x0 + p1, y + h, r.z1 + d, col);
        else if (side === 'n') b.box(r.x0 + p0, y, r.z0 - d, r.x0 + p1, y + h, r.z0, col);
        else if (side === 'e') b.box(r.x1, y, r.z0 + p0, r.x1 + d, y + h, r.z0 + p1, col);
        else b.box(r.x0 - d, y, r.z0 + p0, r.x0, y + h, r.z0 + p1, col);
      }
    }
  }

  /** Surface car park with painted bays and a few bollards. */
  function parking(ctx, lot) {
    const x0 = lot.minX, x1 = lot.maxX, z0 = lot.minZ, z1 = lot.maxZ;
    ctx.asphaltTop.topRect(x0, z0, x1, z1, KERB, VH.col(0xd8d8d8), 6);
    const white = VH.col(0xe8e8e0);
    const y = KERB;
    const alongX = x1 - x0 >= z1 - z0;
    const bay = 2.7;
    const depth = 5.2;
    if (alongX) {
      for (const [r0, r1] of [[z0 + 1, z0 + 1 + depth], [z1 - 1 - depth, z1 - 1]]) {
        for (let x = x0 + 2; x <= x1 - 2; x += bay) {
          ctx.marks.box(x - 0.06, y, r0, x + 0.06, y + 0.001, r1, white, { skip: { n: true, s: true, e: true, w: true } });
        }
      }
    } else {
      for (const [r0, r1] of [[x0 + 1, x0 + 1 + depth], [x1 - 1 - depth, x1 - 1]]) {
        for (let z = z0 + 2; z <= z1 - 2; z += bay) {
          ctx.marks.box(r0, y, z - 0.06, r1, y + 0.001, z + 0.06, white, { skip: { n: true, s: true, e: true, w: true } });
        }
      }
    }
    // Bollards along the street edges.
    for (const side of frontFaces(lot)) {
      const horizontal = side === 'n' || side === 's';
      const a = horizontal ? x0 + 1 : z0 + 1;
      const bEnd = horizontal ? x1 - 1 : z1 - 1;
      for (let p = a; p <= bEnd; p += 3.2) {
        if (Math.abs(p - (a + bEnd) / 2) < 3.5) continue; // entrance
        const bx = horizontal ? p : side === 'w' ? x0 + 0.3 : x1 - 0.3;
        const bz = horizontal ? (side === 'n' ? z0 + 0.3 : z1 - 0.3) : p;
        ctx.addProp('bollard', bx, bz, 0, 1);
      }
    }
  }

  function courtyard(ctx, lot, rng) {
    ctx.grassTop.topRect(lot.minX, lot.minZ, lot.maxX, lot.maxZ, KERB, VH.col(0xffffff), 6);
    if (ctx.addLawn) ctx.addLawn(lot.minX, lot.minZ, lot.maxX, lot.maxZ);
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      ctx.addProp('tree', rng.range(lot.minX + 3, lot.maxX - 3), rng.range(lot.minZ + 3, lot.maxZ - 3),
        rng.range(0, 6.28), rng.range(0.8, 1.2), KERB);
    }
  }

  const ARCHETYPES = { tower, office, shophouse, apartment, hotel, villa };

  const Buildings = {
    /** Build one lot. Returns the height of the tallest point. */
    buildLot(ctx, lot) {
      const rng = new VH.RNG(lot.seed);
      if (lot.kind === 'parking') {
        parking(ctx, lot);
        return 0;
      }
      if (lot.kind === 'courtyard') {
        courtyard(ctx, lot, rng);
        return 0;
      }
      const fn = ARCHETYPES[lot.archetype] || office;
      // Downtown interior lots stay lower so street walls read clearly.
      if (lot.interior && lot.archetype === 'tower') return office(ctx, lot, rng);
      return fn(ctx, lot, rng);
    },

    /** The landmark tower: three glass tiers, a lit crown band and a spire. */
    buildVicehavenTower(ctx, block) {
      const b = ctx.b;
      const rng = new VH.RNG('vicehaven-tower');
      const cx = block.cx;
      const cz = block.cz;
      const seed = 42.5;
      const frame = VH.col(0x3c4a57);
      const roofCol = VH.col(0x4a4f55);
      // Podium with a colonnade of storefronts.
      const pw = 30;
      const podH = 16;
      const lot = { front: { n: true, s: true, e: true, w: true } };
      groundFloor(b, { x0: cx - pw, x1: cx + pw, z0: cz - pw, z1: cz + pw }, KERB, 6, lot, VH.col(0x2e3a45), seed, rng);
      facadeWalls(b, cx - pw, KERB + 6, cz - pw, cx + pw, KERB + podH, cz + pw,
        { wall: frame, style: 3, ww: 1, wh: 0.55, bay: 3.2, floorH: 5, seed });
      roof(b, cx - pw, cz - pw, cx + pw, cz + pw, KERB + podH, roofCol, seed);
      ctx.physics.addBox(cx - pw, 0, cz - pw, cx + pw, KERB + podH, cz + pw, 'building');

      const F = { wall: frame, style: 2, ww: 0.94, wh: 0.8, bay: 3.2, floorH: 4, seed };
      const tiers = [[21, 118], [17, 64], [13, 40]];
      let y = KERB + podH;
      for (const [half, h] of tiers) {
        facadeWalls(b, cx - half, y, cz - half, cx + half, y + h, cz + half, F);
        // Lit band at each setback.
        const band = { wall: VH.col(0x1b2630), style: 3, ww: 1, wh: 0.7, bay: 1.6, floorH: 1.6, seed: 91.3 };
        facadeWalls(b, cx - half - 0.3, y + h, cz - half - 0.3, cx + half + 0.3, y + h + 1.6, cz + half + 0.3, band);
        roof(b, cx - half - 0.3, cz - half - 0.3, cx + half + 0.3, cz + half + 0.3, y + h + 1.6, roofCol, seed);
        ctx.physics.addBox(cx - half, 0, cz - half, cx + half, y + h + 1.6, cz + half, 'building');
        y += h + 1.6;
      }
      // Crown and spire.
      facadeWalls(b, cx - 8, y, cz - 8, cx + 8, y + 10, cz + 8, { wall: VH.col(0x26313b), style: 3, ww: 1, wh: 0.8, bay: 2, floorH: 2.5, seed: 17.7 });
      roof(b, cx - 8, cz - 8, cx + 8, cz + 8, y + 10, roofCol, seed, false);
      b.cylinder(cx, y + 10, cz, 2.2, 0.35, 48, 8, VH.col(0xc9ced4), false);
      ctx.addBeacon(cx, y + 58.5, cz);
      return y + 58;
    },
  };

  VH.Buildings = Buildings;
})();
