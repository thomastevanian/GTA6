/*
 * stores.js — corner shops and petrol stations Jay can walk into, buy a
 * snack in, or hold up.
 *
 *   VH.Stores.plan(layout)              picks car parks across the city for
 *                                       the shops (right after CityGen)
 *   VH.Stores.buildLot(world, ctx, lot) builds one: a single-storey shop at
 *                                       the back of the lot with a real
 *                                       interior (counter, shelves, fridges),
 *                                       a forecourt in front, and for the
 *                                       petrol stations a canopy and pumps
 *   new VH.Stores(game)                 the clerks and the hold-ups
 *
 * Kinds: corner shops and petrol stations, plus liquor stores, pawn shops,
 * jewellers (an armed guard), a bank downtown (two guards, four stars) and
 * Breakwater Arms, the gun shop, which sells ammo and body armour and whose
 * owner always fights back.
 *
 * A hold-up: aim a gun at the clerk from inside the shop. His hands go up
 * and the meter fills while you keep him covered, paying out as it goes.
 * Someone always hits the silent alarm (two stars a few seconds later),
 * and one clerk in five keeps a shotgun under the counter. An emptied till
 * takes eight minutes of play to fill up again.
 *
 * Every shop is laid out in its own frame: u runs along the street front
 * (left to right seen from the street) and v runs inwards from the front
 * edge of the lot. The frames are mirror images of the world axes, so the
 * helpers below always convert to world coordinates before drawing.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, dampAngle } = VH.math;
  const KERB = 0.15;
  const WALL_H = 4.0; // top of the walls above the kerb
  const CEIL = 3.4; // inside ceiling above the kerb
  const GLASS_H = 2.9; // shop windows below the brand fascia
  const T = 0.3; // wall thickness
  const REFILL = 480; // seconds of play before a till is worth robbing again
  const AMMO_PRICE = 150; // Breakwater Arms: +100 rounds for every gun you own, +4 grenades
  const ARMOR_PRICE = 400;
  const ATM_SECS = 6; // standing at it with the laptop out
  const ATM_COOL = 600; // seconds of play before that ATM can be hacked again
  // The plan's shuffle. This one leaves alone the car parks the story already
  // uses (places.js steps past a shop lot anyway, but then a place would move).
  const SALT = 'shops-60';

  // Original brands only.
  const BRANDS = {
    sunrise: { name: 'Sunrise 24/7', sign: ['SUNRISE', 'OPEN 24/7'], bg: ['#ff8a1f', '#e2471b'], fg: '#ffffff', band: 0xe8641e, trim: 0xffd27a, shirt: 0xe8641e },
    gullmart: { name: 'Gull Mart', sign: ['GULL MART', 'GROCERIES · SNACKS'], bg: ['#1aa6a6', '#0d6f80'], fg: '#ffffff', band: 0x138c94, trim: 0xe9f7f5, shirt: 0x138c94 },
    hilo: { name: 'Hi-Lo Market', sign: ['HI-LO MARKET'], bg: ['#2fa84f', '#1c6e33'], fg: '#fff6d8', band: 0x23843f, trim: 0xfff2c4, shirt: 0x23843f },
    kwikpik: { name: 'Kwik Pik', sign: ['KWIK PIK', 'COLD DRINKS'], bg: ['#2457d6', '#16348c'], fg: '#ffd84a', band: 0x2050c0, trim: 0xffd84a, shirt: 0x2050c0 },
    tidal: { name: 'Tidal Fuel', sign: ['TIDAL FUEL', 'FOOD MART'], bg: ['#0f8fd6', '#0a4f8c'], fg: '#ffffff', band: 0x0f7fc4, trim: 0xf5c400, shirt: 0x0f6fb0, gas: true },
    // The specialist shops (same building, their own fittings and their own hold-up).
    bottlebay: { name: 'Bottle Bay Liquor', sign: ['BOTTLE BAY', 'LIQUOR · WINE'], bg: ['#7a1f3d', '#4a0f24'], fg: '#ffe9b0', band: 0x6e1c38, trim: 0xe8c27a, shirt: 0x6e1c38, kind: 'liquor' },
    arms: { name: 'Breakwater Arms', sign: ['BREAKWATER ARMS', 'GUNS · AMMO'], bg: ['#3a3f45', '#1c1f23'], fg: '#ff5a3c', band: 0x2e3237, trim: 0xff5a3c, shirt: 0x4b5320, kind: 'guns' },
    pawn: { name: 'Lucky Strike Pawn', sign: ['LUCKY STRIKE', 'PAWN · CASH 4 GOLD'], bg: ['#d4a017', '#9a6f0a'], fg: '#1a1a1a', band: 0xc4920f, trim: 0x1a1a1a, shirt: 0x6b4a2e, kind: 'pawn' },
    lustre: { name: 'Lustre Jewellers', sign: ['LUSTRE', 'FINE JEWELLERY'], bg: ['#f4f0e6', '#cfc6b0'], fg: '#1d2b4a', band: 0xe9e3d3, trim: 0x1d2b4a, shirt: 0x1d2b4a, kind: 'jewel' },
    sprayshack: { name: 'Spray Shack', sign: ['SPRAY SHACK', 'RESPRAY · REPAIRS'], bg: ['#2ad4c4', '#127a8c'], fg: '#ffffff', band: 0x1aa6a6, trim: 0xff4f8b, shirt: 0x1aa6a6, kind: 'spray' },
    threads: { name: 'Threads', sign: ['THREADS', 'CLOTHING · SHOES'], bg: ['#ff6fa8', '#8c2d6b'], fg: '#ffffff', band: 0xd94f8c, trim: 0xffe0ef, shirt: 0x2d2d33, kind: 'clothes' },
    coastline: { name: 'Coastline Savings', sign: ['COASTLINE SAVINGS', 'BANK · ATM'], bg: ['#1d4fb8', '#0f2f73'], fg: '#ffffff', band: 0x1d4fb8, trim: 0xf2c94c, shirt: 0x1c2a44, kind: 'bank' },
  };
  // How each kind of shop is held up: cash (base + up to extra), seconds of
  // covering the clerk to empty it, the stars the alarm brings, the chance the
  // clerk fights back, and armed guards on the floor.
  const ROB = {
    mart: { base: 260, extra: 300, secs: 5.5, heat: 2, fight: 0.2, guards: 0 },
    gas: { base: 420, extra: 380, secs: 5.5, heat: 2, fight: 0.2, guards: 0 },
    liquor: { base: 450, extra: 400, secs: 6, heat: 2, fight: 0.35, guards: 0 },
    pawn: { base: 900, extra: 700, secs: 8, heat: 3, fight: 0.4, guards: 0 },
    clothes: { base: 380, extra: 350, secs: 6, heat: 2, fight: 0.15, guards: 0 },
    guns: { base: 700, extra: 500, secs: 7, heat: 3, fight: 1, guards: 0 },
    jewel: { base: 1800, extra: 1400, secs: 9, heat: 3, fight: 0, guards: 1 },
    bank: { base: 3500, extra: 3000, secs: 12, heat: 4, fight: 0, guards: 2 },
  };
  // Big Otto's Scrapyard (a story place) buys stolen cars.
  const CHOP_PLACE = 'market_scrapyard';
  const CHOP_R = 14;
  const CHOP_NO = new Set(['police', 'taxi']); // classes Otto won't touch (too hot)
  const CHOP_MUL = { sports: 1.4, ev: 1.25, muscle: 1.2, suv: 1.0, sedan: 0.9, pickup: 0.85, compact: 0.7, van: 0.6 };
  const SPRAY_MAX = 3;
  const SPRAY_PRICE = 250;
  const SPRAY_COLORS = [0xd8262e, 0x1d4fb8, 0xf2c500, 0x1faa6b, 0xf1f2ef, 0x1c1c1f, 0xff4f8b, 0x13b5b1, 0x8a3fd1, 0xc4561d, 0x9aa1a8];
  const kindOf = (s) => BRANDS[s.brand].kind || (s.gas ? 'gas' : 'mart');
  // Dealt over the non-mart shops (every other one), in this order.
  const SPECIALS = ['arms', 'lustre', 'pawn', 'bottlebay', 'arms', 'pawn', 'bottlebay', 'lustre', 'bottlebay', 'arms', 'threads', 'threads'];

  // Threads' rail (Humanoid look overrides on Jay's own; 'jacket' is the top's colour).
  const OUTFITS = [
    { id: 'classic', name: 'Driving jacket', price: 0, look: {} },
    { id: 'hoodie', name: 'Night hoodie', price: 120, look: { outfit: 'hoodie', jacket: 0x1d1f26, jacketTrim: 0xff4f8b, shirt: 0x1d1f26, leather: false } },
    { id: 'beach', name: 'Beach shirt', price: 90, look: { outfit: 'shirt', jacket: 0xf2a03a, jacketTrim: 0x1fa3a3, shirt: 0xffffff, pants: 0xd8c8a0, bottomStyle: 'shorts', glasses: 'sun', leather: false } },
    { id: 'track', name: 'Teal tracksuit', price: 150, look: { outfit: 'hoodie', jacket: 0x1fa3a3, jacketTrim: 0xffffff, shirt: 0xffffff, pants: 0x1fa3a3, hat: 'cap', leather: false } },
    { id: 'tank', name: 'Tank top', price: 60, look: { outfit: 'tank', jacket: 0xf4f1ea, shirt: 0xf4f1ea, pants: 0x3a5f8c, bottomStyle: 'shorts', hat: 'bandana', leather: false } },
    { id: 'polo', name: 'Clubhouse polo', price: 180, look: { outfit: 'polo', jacket: 0x2d6b4f, jacketTrim: 0xf4f1ea, shirt: 0x2d6b4f, pants: 0xd8c8a0, shoeStyle: 'dress', leather: false } },
    { id: 'night', name: 'Night-out black', price: 400, look: { outfit: 'shirt', jacket: 0x14161c, jacketTrim: 0x2a2d35, shirt: 0x14161c, pants: 0x14161c, shoes: 0x111111, shoeStyle: 'dress', glasses: 'sun', leather: false } },
    { id: 'biker', name: 'Black biker leathers', price: 650, look: { outfit: 'jacket', jacket: 0x121212, jacketTrim: 0x2a2a2a, shirt: 0x3a3a3a, pants: 0x1a1d22, hat: 'beanie', shoeStyle: 'boot', glasses: 'sun', leather: true } },
  ];
  const MARTS = ['sunrise', 'gullmart', 'hilo', 'kwikpik'];
  // Shops per district (the docks and estates have their own builders).
  const QUOTA = { oldmarket: 9, harborpoint: 9, palmcrescent: 6, downtown: 4 };
  const GAS_MAX = 3;
  const AVOID_BLOCKS = new Set(['b2_3']); // the smoke test climbs this block's walls
  const SPACING = 72;

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ------------------------------------------------------------ frames
  /** The shop's frame on a lot whose street front is `side`. */
  function frameFor(lot, side) {
    const X = lot.maxX - lot.minX;
    const Z = lot.maxZ - lot.minZ;
    if (side === 's') return { side, W: X, D: Z, ox: lot.minX, oz: lot.maxZ, ux: 1, uz: 0, vx: 0, vz: -1 };
    if (side === 'n') return { side, W: X, D: Z, ox: lot.maxX, oz: lot.minZ, ux: -1, uz: 0, vx: 0, vz: 1 };
    if (side === 'e') return { side, W: Z, D: X, ox: lot.maxX, oz: lot.maxZ, ux: 0, uz: -1, vx: -1, vz: 0 };
    return { side, W: Z, D: X, ox: lot.minX, oz: lot.minZ, ux: 0, uz: 1, vx: 1, vz: 0 };
  }

  function P(f, u, v) {
    return [f.ox + f.ux * u + f.vx * v, f.oz + f.uz * u + f.vz * v];
  }

  /** Local coordinates of a world point. */
  function local(f, x, z) {
    const dx = x - f.ox;
    const dz = z - f.oz;
    return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz];
  }

  function sideOf(dx, dz) {
    if (dx > 0.5) return 'e';
    if (dx < -0.5) return 'w';
    return dz > 0 ? 's' : 'n';
  }

  /** World rectangle of a local one. */
  function rect(f, u0, v0, u1, v1) {
    const a = P(f, u0, v0);
    const b = P(f, u1, v1);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }

  /** Which shop lots fit, and facing which street. */
  function fit(lot, gas) {
    for (const side of ['s', 'n', 'e', 'w']) {
      if (!lot.front[side]) continue;
      const f = frameFor(lot, side);
      if (gas ? f.W >= 30 && f.D >= 27 : f.W >= 13 && f.D >= 14) return side;
    }
    return null;
  }

  // ------------------------------------------------------------ drawing
  /**
   * A builder that draws in a shop's frame. Boxes are axis-aligned in the
   * world, so a local box is just its world rectangle; faces named in the
   * frame (front/back/left/right) are mapped to world sides for `skip`.
   */
  function drawer(ctx, f) {
    const sides = {
      front: sideOf(-f.vx, -f.vz),
      back: sideOf(f.vx, f.vz),
      left: sideOf(-f.ux, -f.uz),
      right: sideOf(f.ux, f.uz),
    };
    const box = (surf, u0, y0, v0, u1, y1, v1, col, opts) => {
      const r = rect(f, u0, v0, u1, v1);
      let o = opts;
      if (opts && opts.skipLocal) {
        const skip = Object.assign({}, opts.skip || {});
        for (const k of opts.skipLocal) skip[sides[k]] = true;
        o = Object.assign({}, opts, { skip });
      }
      ctx[surf].box(r[0], y0, r[1], r[2], y1, r[3], col, o);
    };
    const collide = (u0, y0, v0, u1, y1, v1, tag, flags) => {
      const r = rect(f, u0, v0, u1, v1);
      ctx.physics.addBox(r[0], y0, r[1], r[2], y1, r[3], tag, flags);
    };
    /** A vertical quad from (u0, v0) to (u1, v1), facing local normal (nu, nv). */
    const vquad = (surf, u0, v0, u1, v1, y0, y1, nu, nv, col) => {
      let a = P(f, u0, v0);
      let b = P(f, u1, v1);
      const nx = nu * f.ux + nv * f.vx;
      const nz = nu * f.uz + nv * f.vz;
      let dx = b[0] - a[0];
      let dz = b[1] - a[1];
      if (-dz * nx + dx * nz < 0) {
        [a, b] = [b, a];
        dx = -dx;
        dz = -dz;
      }
      ctx[surf].quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [nx, 0, nz], col);
    };
    /** A horizontal quad at height y facing up (dir 1) or down (dir -1). */
    const hquad = (surf, u0, v0, u1, v1, y, dir, col) => {
      const r = rect(f, u0, v0, u1, v1);
      if (dir > 0) ctx[surf].topRect(r[0], r[1], r[2], r[3], y, col);
      else ctx[surf].quad([r[0], y, r[1]], [r[2], y, r[1]], [r[2], y, r[3]], [r[0], y, r[3]], [0, -1, 0], col);
    };
    /** A storefront facade on the building surface along a local wall line. */
    const facade = (u0, v0, u1, v1, y0, h, nu, nv, col, F) => {
      let a = P(f, u0, v0);
      let b = P(f, u1, v1);
      const nx = nu * f.ux + nv * f.vx;
      const nz = nu * f.uz + nv * f.vz;
      let dx = b[0] - a[0];
      let dz = b[1] - a[1];
      if (-dz * nx + dx * nz < 0) {
        [a, b] = [b, a];
        dx = -dx;
        dz = -dz;
      }
      const len = Math.hypot(dx, dz);
      if (len < 0.05) return;
      const bays = Math.max(1, Math.round(len / F.bay));
      ctx.b.wall([a[0], y0, a[1]], dx / len, dz / len, len, h, col, null, [0, bays, 0, 1], F.style ? [F.ww, F.wh, F.style, F.seed] : [0, 0, 0, F.seed]);
    };
    return { box, collide, vquad, hquad, facade, sides };
  }

  // ------------------------------------------------------------ the shop
  function buildShop(world, ctx, s) {
    const f = s.f;
    const D = drawer(ctx, f);
    const brand = BRANDS[s.brand];
    const rng = new VH.RNG(s.seed);
    const a0 = s.a;
    const a1 = s.a + s.SW;
    const v0 = s.vb0;
    const v1 = s.vb1;
    const y0 = KERB;
    const yTop = KERB + WALL_H;
    const band = VH.col(brand.band);
    const trim = VH.col(brand.trim);
    const wallCol = VH.col(rng.pick([0xe7e1d3, 0xd9d2c3, 0xefe8dc, 0xcfc8ba]));
    const seed = rng.range(0, 100);
    const shopF = { ww: 0.9, wh: 0.82, style: 4, bay: 2.6, seed };
    const blankF = { style: 0, bay: 4, seed };
    const lot = s.lot;

    // Forecourt: asphalt round the shop, painted bays.
    const W = f.W;
    const asphaltPieces = [[0, 0, W, v0], [0, v1, W, f.D], [0, v0, a0, v1], [a1, v0, W, v1]];
    for (const [u0, q0, u1, q1] of asphaltPieces) {
      if (u1 - u0 < 0.05 || q1 - q0 < 0.05) continue;
      const r = rect(f, u0, q0, u1, q1);
      ctx.asphaltTop.topRect(r[0], r[1], r[2], r[3], KERB, VH.col(0xd8d8d8), 6);
    }
    const white = VH.col(0xe8e8e0);
    const line = (u, q0, q1) => {
      const r = rect(f, u - 0.06, q0, u + 0.06, q1);
      ctx.marks.box(r[0], KERB, r[1], r[2], KERB + 0.001, r[3], white, { skip: { n: true, s: true, e: true, w: true } });
    };
    if (!s.gas && v0 >= 6) {
      // Nose-in bays along the shop front, leaving the door clear.
      for (let u = a0 + 0.4; u <= a1 + 0.01; u += 2.7) {
        if (u > s.d0 - 2.2 && u < s.d1 + 2.2) continue;
        line(u, v0 - 5.6, v0 - 0.9);
      }
      // A wheel stop strip and bollards keep cars out of the glass.
      for (let u = a0 + 0.6; u < a1 - 0.3; u += 2.2) {
        if (u > s.d0 - 0.8 && u < s.d1 + 0.8) continue;
        const [bx, bz] = P(f, u, v0 - 0.45);
        ctx.addProp('bollard', bx, bz, 0, 1);
      }
    }

    // --- shell: walls (building surface), storefront glass on street sides
    // Faces that a facade quad or the lit interior covers are left out (no z-fighting).
    const wallBox = (u0, q0, u1, q1, h0, h1, skipLocal, bottom) =>
      D.box('b', u0, h0, q0, u1, h1, q1, wallCol, { skipLocal, bottom, skip: { top: true } });
    const leftStreet = !!lot.front[D.sides.left];
    const rightStreet = !!lot.front[D.sides.right];
    const backStreet = !!lot.front[D.sides.back];
    // Back and side walls, full height.
    const backSkip = ['front'];
    if (backStreet) backSkip.push('back');
    if (leftStreet) backSkip.push('left');
    if (rightStreet) backSkip.push('right');
    wallBox(a0, v1 - T, a1, v1, y0, yTop, backSkip);
    wallBox(a0, v0, a0 + T, v1 - T, y0, yTop, leftStreet ? ['left', 'right', 'front'] : ['right', 'front']);
    wallBox(a1 - T, v0, a1, v1 - T, y0, yTop, rightStreet ? ['right', 'left', 'front'] : ['left', 'front']);
    if (leftStreet) {
      D.facade(a0, v1, a0, v0, y0, GLASS_H, -1, 0, wallCol, shopF);
      D.facade(a0, v1, a0, v0, y0 + GLASS_H, WALL_H - GLASS_H, -1, 0, wallCol, blankF);
    }
    if (rightStreet) {
      D.facade(a1, v0, a1, v1, y0, GLASS_H, 1, 0, wallCol, shopF);
      D.facade(a1, v0, a1, v1, y0 + GLASS_H, WALL_H - GLASS_H, 1, 0, wallCol, blankF);
    }
    if (backStreet) D.facade(a1, v1, a0, v1, y0, WALL_H, 0, 1, wallCol, blankF);
    // Front wall: glass either side of the door, a lintel, the fascia above.
    const DOOR_H = 2.45;
    wallBox(a0 + T, v0, s.d0, v0 + T, y0, y0 + GLASS_H, ['front', 'back']);
    wallBox(s.d1, v0, a1 - T, v0 + T, y0, y0 + GLASS_H, ['front', 'back']);
    D.facade(a0, v0, s.d0, v0, y0, GLASS_H, 0, -1, wallCol, shopF);
    D.facade(s.d1, v0, a1, v0, y0, GLASS_H, 0, -1, wallCol, shopF);
    wallBox(s.d0, v0, s.d1, v0 + T, y0 + DOOR_H, y0 + GLASS_H, ['back'], true);
    wallBox(a0 + T, v0, a1 - T, v0 + T, y0 + GLASS_H, yTop, ['back']);
    // The brand fascia stands proud of the wall, with a trim line under it.
    D.box('b', a0 - 0.15, y0 + GLASS_H, v0 - 0.2, a1 + 0.15, yTop + 0.15, v0, band, { bottom: true });
    D.box('prop', a0 - 0.16, y0 + GLASS_H - 0.12, v0 - 0.22, a1 + 0.16, y0 + GLASS_H, v0, trim, { bottom: true });
    // Door frame: dark metal posts and a glass door standing open inwards.
    const metal = VH.col(0x2b2f35);
    D.box('prop', s.d0, y0, v0 - 0.02, s.d0 + 0.08, y0 + DOOR_H, v0 + T + 0.02, metal);
    D.box('prop', s.d1 - 0.08, y0, v0 - 0.02, s.d1, y0 + DOOR_H, v0 + T + 0.02, metal);
    // ATMs on the front wall (corner shops, petrol stations, two at the bank).
    const atmKind = kindOf(s);
    if (atmKind === 'mart' || atmKind === 'gas' || atmKind === 'bank') {
      const spots = atmKind === 'bank' ? [s.d0 - 1.4, s.d0 - 2.7] : [s.d0 - 1.4];
      spots.forEach((au, k) => {
        if (au < a0 + 0.6 || au > a1 - 1.3) return;
        D.box('prop', au, y0, v0 - 0.55, au + 0.75, y0 + 1.75, v0, VH.col(0x3a3f45));
        D.box('prop', au - 0.02, y0 + 1.75, v0 - 0.57, au + 0.77, y0 + 1.95, v0, band);
        D.vquad('screen', au + 0.12, v0 - 0.56, au + 0.63, v0 - 0.56, y0 + 1.15, y0 + 1.5, 0, -1, VH.col(0x6fe0c8, 1.3));
        D.box('prop', au + 0.15, y0 + 0.85, v0 - 0.66, au + 0.6, y0 + 0.95, v0 - 0.55, VH.col(0x9aa0a6));
        D.collide(au, 0, v0 - 0.55, au + 0.75, y0 + 1.95, v0, 'atm', VH.COLLIDE.ALL);
        const [mx, mz] = P(f, au + 0.37, v0 - 1.1);
        ctx.addInteractable({ id: s.id + '_atm' + k, kind: 'atm', store: s.id, x: mx, y: y0 + 1.0, z: mz, radius: 1.3, label: 'Hack the ATM' });
      });
    }
    // Roof: gravel, parapet, a couple of AC units.
    const r = rect(f, a0, v0 - 0.2, a1, v1);
    ctx.b.quad([r[0], yTop, r[3]], [r[2], yTop, r[3]], [r[2], yTop, r[1]], [r[0], yTop, r[1]], [0, 1, 0], VH.col(0x8f8c86), null, null, [0, 0, -1, seed]);
    const par = VH.colMul(wallCol, 0.9);
    D.box('b', a0, yTop, v1 - 0.25, a1, yTop + 0.5, v1, par);
    D.box('b', a0, yTop, v0 + T - 0.25, a0 + 0.25, yTop + 0.5, v1 - 0.25, par);
    D.box('b', a1 - 0.25, yTop, v0 + T - 0.25, a1, yTop + 0.5, v1 - 0.25, par);
    for (let i = 0; i < 2; i++) {
      const cu = a0 + 2.5 + i * (s.SW - 5);
      const cv = v0 + s.SD * 0.6;
      D.box('prop', cu - 0.8, yTop, cv - 0.6, cu + 0.8, yTop + 1.0, cv + 0.6, VH.col(0xb9bcbf));
    }

    // Colliders: walls, the lintel, and the roof over the room.
    const FLAGS = VH.COLLIDE.ALL;
    D.collide(a0, 0, v1 - T, a1, yTop + 0.5, v1, 'building', FLAGS);
    D.collide(a0, 0, v0, a0 + T, yTop + 0.5, v1, 'building', FLAGS);
    D.collide(a1 - T, 0, v0, a1, yTop + 0.5, v1, 'building', FLAGS);
    D.collide(a0, 0, v0 - 0.2, s.d0, yTop + 0.5, v0 + T, 'building', FLAGS);
    D.collide(s.d1, 0, v0 - 0.2, a1, yTop + 0.5, v0 + T, 'building', FLAGS);
    D.collide(s.d0, y0 + DOOR_H, v0 - 0.2, s.d1, yTop + 0.5, v0 + T, 'building', FLAGS);
    D.collide(a0, y0 + CEIL, v0, a1, yTop + 0.5, v1, 'building', FLAGS);

    // --- interior (lit surface, never in the roof's shadow)
    const i0 = a0 + T;
    const i1 = a1 - T;
    const q0 = v0 + T;
    const q1 = v1 - T;
    const yc = y0 + CEIL;
    const dado = VH.colMix(band, VH.col(0xffffff), 0.35);
    const paint = VH.col(0xf1ede4);
    const two = (u0, v0_, u1, v1_, nu, nv) => {
      D.vquad('interior', u0, v0_, u1, v1_, y0, y0 + 1.0, nu, nv, dado);
      D.vquad('interior', u0, v0_, u1, v1_, y0 + 1.0, yc, nu, nv, paint);
    };
    two(i0, q1, i1, q1, 0, -1); // back
    two(i0, q0, i0, q1, 1, 0); // left
    two(i1, q0, i1, q1, -1, 0); // right
    two(i0, q0, s.d0, q0, 0, 1); // front, left of the door
    two(s.d1, q0, i1, q0, 0, 1); // front, right of the door
    D.vquad('interior', s.d0, q0, s.d1, q0, y0 + DOOR_H, yc, 0, 1, paint);
    // Daylight through the windows (seen from inside).
    const sky = VH.col(0xcfe4f2, 1.05);
    D.vquad('screen', i0 + 0.4, q0 + 0.01, s.d0 - 0.3, q0 + 0.01, y0 + 1.05, y0 + 2.6, 0, 1, sky);
    if (s.d1 + 0.3 < i1 - 0.4) D.vquad('screen', s.d1 + 0.3, q0 + 0.01, i1 - 0.4, q0 + 0.01, y0 + 1.05, y0 + 2.6, 0, 1, sky);
    // Floor tiles in two tones, the ceiling and its light panels.
    D.hquad('interior', i0, q0, i1, q1, y0 + 0.012, 1, VH.col(0xd9d4c8));
    const tile = VH.col(0xc4beb1);
    for (let u = i0 + 1.2; u < i1 - 0.6; u += 2.4) D.hquad('interior', u, q0, Math.min(u + 0.6, i1), q1, y0 + 0.02, 1, tile);
    D.hquad('interior', i0, q0, i1, q1, yc, -1, VH.col(0xe8e6e1));
    const lamp = VH.col(0xfff6e6, 1.4);
    for (let u = i0 + 1.6; u < i1 - 1.0; u += 3.2) {
      for (let v = q0 + 1.6; v < q1 - 1.0; v += 2.8) D.hquad('screen', u, v, u + 1.3, v + 0.45, yc - 0.01, -1, lamp);
    }
    // An entrance mat.
    D.hquad('interior', s.d0, q0, s.d1, q0 + 1.4, y0 + 0.028, 1, VH.col(0x3a3d42));

    // Counter along the left wall, the clerk behind it, a rack behind him.
    const c0 = a0 + 1.8;
    const c1 = a0 + 2.6;
    const cv0 = v0 + 1.6;
    const cv1 = v0 + 5.0;
    D.box('interior', c0, y0, cv0, c1, y0 + 1.0, cv1, VH.colMix(band, VH.col(0x2a2a2a), 0.35));
    D.box('interior', c0 - 0.06, y0 + 1.0, cv0 - 0.06, c1 + 0.08, y0 + 1.06, cv1 + 0.06, VH.col(0x3b342d));
    D.collide(c0, 0, cv0, c1, y0 + 1.06, cv1, 'counter', FLAGS);
    // Till and card reader.
    const tv = v0 + 2.4;
    D.box('interior', c0 + 0.15, y0 + 1.06, tv - 0.25, c0 + 0.55, y0 + 1.18, tv + 0.25, VH.col(0x2a2c30));
    D.box('interior', c0 + 0.25, y0 + 1.18, tv - 0.18, c0 + 0.32, y0 + 1.48, tv + 0.18, VH.col(0x2a2c30));
    D.vquad('screen', c0 + 0.325, tv - 0.15, c0 + 0.325, tv + 0.15, y0 + 1.22, y0 + 1.45, 1, 0, VH.col(0x6fe0c8, 1.2));
    // Sweets on the counter front, facing the customers.
    for (let v = cv0 + 0.2; v < cv1 - 0.3; v += 0.5) {
      const col = VH.col(rng.pick([0xe24a3b, 0xf2b01e, 0x2a7de1, 0x1faa6b, 0x8a3fd1, 0xf06292]));
      D.box('interior', c1, y0 + 0.5, v, c1 + 0.12, y0 + 0.85, v + 0.38, col);
    }
    // The rack behind the counter.
    D.box('interior', i0, y0, cv0, i0 + 0.45, y0 + 2.2, cv1, VH.col(0x5a4a3c));
    for (let lvl = 0; lvl < 4; lvl++) {
      const y = y0 + 0.9 + lvl * 0.32;
      for (let v = cv0 + 0.1; v < cv1 - 0.2; v += 0.34) {
        const col = VH.col(rng.pick([0xd93b48, 0xf2c94c, 0x3d7be0, 0x27ae60, 0xffffff, 0xef6c2f, 0x16a3a3]));
        D.box('interior', i0 + 0.45, y, v, i0 + 0.5, y + 0.24, v + 0.26, col);
      }
    }
    D.collide(i0, 0, cv0, i0 + 0.5, y0 + 2.2, cv1, 'shelf', FLAGS);

    const drinks = [0xd93b48, 0xf2b01e, 0x2a7de1, 0x1faa6b, 0xffffff, 0x8a3fd1, 0xef6c2f];
    const kind = kindOf(s);
    const foodShop = kind === 'mart' || kind === 'gas' || kind === 'liquor';
    // Fridges along the back wall: glowing doors with drinks behind them.
    const fu0 = a0 + 3.2;
    const fu1 = i1;
    const fv = q1 - 0.8;
    if (!foodShop) buildSpecialFittings(world, ctx, s, D, kind, { i0, i1, q0, q1, y0, yc, fu0, fv, band, rng, FLAGS, c1, cv0, cv1 });
    if (foodShop) {
    D.box('interior', fu0, y0, fv, fu1, y0 + 2.2, q1, VH.col(0x34383e));
    D.vquad('screen', fu0 + 0.05, fv - 0.005, fu1 - 0.05, fv - 0.005, y0 + 0.2, y0 + 2.0, 0, -1, VH.col(0xd8ecff, 1.15));
    for (let lvl = 0; lvl < 4; lvl++) {
      const y = y0 + 0.3 + lvl * 0.43;
      for (let u = fu0 + 0.15; u < fu1 - 0.25; u += 0.55) {
        D.vquad('screen', u, fv - 0.012, u + 0.42, fv - 0.012, y, y + 0.28, 0, -1, VH.col(rng.pick(drinks), 0.9));
      }
    }
    for (let u = fu0; u <= fu1 + 0.01; u += 1.0) D.box('interior', u - 0.03, y0 + 0.15, fv - 0.04, u + 0.03, y0 + 2.05, fv, metal);
    D.collide(fu0, 0, fv, fu1, y0 + 2.2, q1, 'fridge', FLAGS);
    }

    // A wall shelf down the right-hand side.
    const wv0 = q0 + 2.0;
    const wv1 = fv - 1.2;
    if (foodShop && wv1 - wv0 > 1.5) {
      D.box('interior', i1 - 0.55, y0, wv0, i1, y0 + 1.9, wv1, VH.col(0xe2e0da));
      for (let lvl = 0; lvl < 4; lvl++) {
        const y = y0 + 0.25 + lvl * 0.42;
        for (let v = wv0 + 0.1; v < wv1 - 0.3; v += 0.4) {
          D.box('interior', i1 - 0.62, y, v, i1 - 0.55, y + rng.range(0.2, 0.32), v + 0.32, VH.col(rng.pick(drinks)));
        }
      }
      D.collide(i1 - 0.6, 0, wv0, i1, y0 + 1.9, wv1, 'shelf', FLAGS);
    }

    // Gondolas down the middle.
    const gu0 = a0 + 4.4;
    const gu1 = i1 - 0.6 - 1.3;
    const gv0 = q0 + 2.2;
    const gv1 = fv - 1.4;
    const n = foodShop || kind === 'pawn' ? Math.floor((gu1 - gu0 + 1.4) / 2.3) : 0;
    const goods = [0xd93b48, 0xf2c94c, 0x3d7be0, 0x27ae60, 0xf5f0e6, 0xef6c2f, 0x16a3a3, 0x8e5a3c, 0xb03a8c];
    for (let k = 0; k < n && gv1 - gv0 > 1.5; k++) {
      const gu = gu0 + k * 2.3;
      D.box('interior', gu, y0, gv0, gu + 0.9, y0 + 1.5, gv1, VH.col(0xdedcd6));
      for (const [su, out] of [[gu, -1], [gu + 0.9, 1]]) {
        for (let lvl = 0; lvl < 3; lvl++) {
          const y = y0 + 0.2 + lvl * 0.42;
          for (let v = gv0 + 0.08; v < gv1 - 0.3; v += 0.4) {
            const col = VH.col(rng.pick(goods));
            const top = y + rng.range(0.18, 0.3);
            if (out < 0) D.box('interior', su - 0.07, y, v, su, top, v + 0.32, col);
            else D.box('interior', su, y, v, su + 0.07, top, v + 0.32, col);
          }
        }
      }
      // A price card on the end facing the door.
      D.box('interior', gu + 0.15, y0 + 1.5, gv0 - 0.02, gu + 0.75, y0 + 1.9, gv0 + 0.02, band);
      D.collide(gu - 0.06, 0, gv0, gu + 0.96, y0 + 1.5, gv1, 'shelf', FLAGS);
    }

    // The brand sign on the fascia.
    const yawOut = Math.atan2(-f.vx, -f.vz);
    const [sx, sz] = P(f, (a0 + a1) / 2, v0 - 0.28);
    const signs = world.signs || (world.signs = []);
    signs.push({ x: sx, y: y0 + GLASS_H + (WALL_H - GLASS_H) / 2 + 0.05, z: sz, yaw: yawOut, w: Math.min(s.SW - 2.5, 9), h: 0.85, lines: brand.sign, style: 'brand', colors: { bg: brand.bg, fg: brand.fg }, frame: brand.band });
    // An OPEN sign in the window and a glow on the pavement at night.
    const [ox, oz] = P(f, s.d0 - 1.0, v0 - 0.02);
    signs.push({ x: ox, y: y0 + 2.2, z: oz, yaw: yawOut, w: 0.9, h: 0.35, lines: ['OPEN'], style: 'neon' });
    const [cx, cz] = P(f, (a0 + a1) / 2, (v0 + v1) / 2);
    const pools = world.floodlights || (world.floodlights = []);
    pools.push({ x: cx, z: cz, r: Math.min(s.SW, s.SD) * 0.55, y: KERB + 0.03 });
    const [fx, fz] = P(f, (a0 + a1) / 2, v0 - 3);
    pools.push({ x: fx, z: fz, r: 5, y: KERB + 0.03 });

    // Snacks at the counter (interaction.js picks this up); the gun shop sells ammo and armour instead.
    const [bx, bz] = P(f, c1 + 0.55, (cv0 + cv1) / 2);
    if (foodShop) ctx.addInteractable({ id: s.id + '_buy', kind: 'storeBuy', store: s.id, x: bx, y: y0 + 1.0, z: bz, radius: 1.7, label: kind === 'liquor' ? 'Buy a drink' : 'Buy snacks', price: 6, heal: 35 });
    if (kind === 'guns') {
      const [ax, az] = P(f, c1 + 0.55, cv0 + 0.6);
      const [rx, rz] = P(f, c1 + 0.55, cv1 - 0.6);
      ctx.addInteractable({ id: s.id + '_ammo', kind: 'storeAmmo', store: s.id, x: ax, y: y0 + 1.0, z: az, radius: 1.3, label: 'Buy ammo for every gun', price: AMMO_PRICE });
      ctx.addInteractable({ id: s.id + '_armor', kind: 'storeArmor', store: s.id, x: rx, y: y0 + 1.0, z: rz, radius: 1.3, label: 'Buy body armour', price: ARMOR_PRICE });
    }
    if (kind === 'clothes') {
      const [tx, tz] = P(f, c1 + 0.55, (cv0 + cv1) / 2);
      ctx.addInteractable({ id: s.id + '_outfit', kind: 'storeOutfit', store: s.id, x: tx, y: y0 + 1.0, z: tz, radius: 1.7, label: 'Try on: ' + OUTFITS[1].name, price: OUTFITS[1].price });
    }
    if (s.gas) buildForecourt(world, ctx, s, D);
    return yTop + 1.0;
  }

  /**
   * The specialists' fittings instead of fridges and snack aisles: the gun
   * shop's rifle wall and glass counters, the jeweller's lit cases, the
   * bank's teller screens and vault door, the pawn shop's wall of stuff.
   * (u runs along the front, v inwards; see the frame notes at the top.)
   */
  function buildSpecialFittings(world, ctx, s, D, kind, o) {
    const { i0, i1, q1, y0, fu0, fv, band, rng, FLAGS } = o;
    const dark = VH.col(0x23262b);
    const glass = VH.col(0xcfe9ff, 1.25);
    const wood = VH.col(0x5a3d28);
    const mu0 = s.a + 4.4; // the open floor, right of the counter
    const mu1 = i1 - 1.2;
    const mv0 = s.vb0 + 3.0;
    const mv1 = fv - 1.4;
    const caseAt = (u0, v0, u1, v1, h, top, items) => {
      D.box('interior', u0, y0, v0, u1, y0 + h, v1, dark);
      D.hquad('screen', u0 + 0.05, v0 + 0.05, u1 - 0.05, v1 - 0.05, y0 + h + 0.01, 1, top);
      for (let v = v0 + 0.25; v < v1 - 0.2; v += 0.45) {
        for (let u = u0 + 0.2; u < u1 - 0.15; u += 0.4) D.box('interior', u, y0 + h + 0.02, v, u + 0.18, y0 + h + 0.09, v + 0.12, VH.col(rng.pick(items)));
      }
      D.collide(u0, 0, v0, u1, y0 + h, v1, 'counter', FLAGS);
    };
    // The back wall: a panel in the brand colour.
    D.box('interior', fu0, y0, fv + 0.5, i1, y0 + 2.6, q1, kind === 'guns' ? VH.col(0x3a3d36) : kind === 'bank' ? VH.col(0x2b3a55) : wood);
    D.box('interior', fu0, y0 + 2.6, fv + 0.5, i1, y0 + 2.75, q1, band);
    D.collide(fu0, 0, fv + 0.5, i1, y0 + 2.75, q1, 'shelf', FLAGS);
    if (kind === 'guns') {
      // Long guns racked across the back wall, three rows.
      for (let row = 0; row < 3; row++) {
        const y = y0 + 0.9 + row * 0.55;
        for (let u = fu0 + 0.3; u < i1 - 1.3; u += 1.45) {
          D.box('interior', u, y, fv + 0.4, u + 1.15, y + 0.09, fv + 0.48, VH.col(0x16181b));
          D.box('interior', u, y - 0.12, fv + 0.4, u + 0.32, y + 0.04, fv + 0.48, VH.col(rng.pick([0x4a3626, 0x16181b, 0x5d6b3c])));
        }
      }
      // Two glass counters full of pistols and ammo boxes.
      for (let k = 0; k < 2; k++) {
        const u0 = mu0 + k * 2.4;
        if (u0 + 1.2 > mu1) break;
        caseAt(u0, mv0, u0 + 1.2, mv1, 0.95, glass, [0x16181b, 0x2a2c30, 0xd8a032, 0x5d6b3c]);
      }
    } else if (kind === 'jewel') {
      // Lit display cases with gold, silver and stones.
      for (let k = 0; k < 3; k++) {
        const u0 = mu0 + k * 1.9;
        if (u0 + 1.0 > mu1) break;
        caseAt(u0, mv0, u0 + 1.0, mv1, 1.0, VH.col(0xfff4dc, 1.5), [0xd4a017, 0xf2c94c, 0xe8e8e8, 0x2a7de1, 0xd93b48, 0x1faa6b]);
      }
    } else if (kind === 'bank') {
      // A teller line: a long counter with glass screens, and the vault door behind.
      const tv = (mv0 + mv1) / 2;
      D.box('interior', mu0 - 1.2, y0, tv - 0.35, mu1 + 0.6, y0 + 1.1, tv + 0.35, wood);
      D.collide(mu0 - 1.2, 0, tv - 0.35, mu1 + 0.6, y0 + 2.4, tv + 0.35, 'counter', FLAGS);
      D.vquad('screen', mu0 - 1.2, tv - 0.36, mu1 + 0.6, tv - 0.36, y0 + 1.1, y0 + 2.4, 0, -1, VH.col(0xcfe9ff, 0.55));
      const vu = (fu0 + i1) / 2;
      D.box('interior', vu - 1.1, y0 + 0.2, fv + 0.42, vu + 1.1, y0 + 2.4, fv + 0.5, VH.col(0x8d96a1));
      D.box('interior', vu - 0.15, y0 + 1.1, fv + 0.36, vu + 0.15, y0 + 1.4, fv + 0.42, VH.col(0x4a525c));
    } else if (kind === 'pawn') {
      // Televisions and guitars on the back wall.
      for (let u = fu0 + 0.3; u < i1 - 1.0; u += 1.2) {
        if (rng.chance(0.5)) {
          D.box('interior', u, y0 + 1.1, fv + 0.3, u + 0.9, y0 + 1.75, fv + 0.48, dark);
          D.vquad('screen', u + 0.05, fv + 0.29, u + 0.85, fv + 0.29, y0 + 1.15, y0 + 1.7, 0, -1, VH.col(rng.pick([0x6fa8dc, 0x93c47d, 0xe06666]), 0.7));
        } else {
          D.box('interior', u + 0.3, y0 + 0.9, fv + 0.38, u + 0.65, y0 + 1.35, fv + 0.48, VH.col(rng.pick([0x8a4b22, 0xc0392b, 0x1d2025])));
          D.box('interior', u + 0.43, y0 + 1.35, fv + 0.42, u + 0.52, y0 + 2.1, fv + 0.48, wood);
        }
      }
    } else if (kind === 'clothes') {
      // Shirts on the back wall in every colour, two rails and a mannequin.
      const shirts = [0xff6fa8, 0x1fa3a3, 0xf2a03a, 0x14161c, 0xf4f1ea, 0x2d6b4f, 0x3d7be0, 0xd93b48];
      for (let row = 0; row < 2; row++) {
        const y = y0 + 1.0 + row * 0.85;
        D.box('interior', fu0 + 0.2, y + 0.55, fv + 0.36, i1 - 0.2, y + 0.58, fv + 0.42, VH.col(0xb8bcc2));
        for (let u = fu0 + 0.3; u < i1 - 0.5; u += 0.36) D.box('interior', u, y, fv + 0.3, u + 0.3, y + 0.52, fv + 0.46, VH.col(rng.pick(shirts)));
      }
      for (let k = 0; k < 2; k++) {
        const v = mv0 + 0.4 + k * 1.6;
        if (v + 0.3 > mv1) break;
        D.box('interior', mu0, y0 + 1.45, v, mu1 - 1.4, y0 + 1.5, v + 0.05, VH.col(0xb8bcc2));
        D.box('interior', mu0, y0, v, mu0 + 0.05, y0 + 1.5, v + 0.05, VH.col(0xb8bcc2));
        D.box('interior', mu1 - 1.45, y0, v, mu1 - 1.4, y0 + 1.5, v + 0.05, VH.col(0xb8bcc2));
        for (let u = mu0 + 0.2; u < mu1 - 1.6; u += 0.22) D.box('interior', u, y0 + 0.75, v - 0.2, u + 0.06, y0 + 1.42, v + 0.25, VH.col(rng.pick(shirts)));
        D.collide(mu0, 0, v - 0.2, mu1 - 1.4, y0 + 1.5, v + 0.25, 'shelf', FLAGS);
      }
      // A mannequin in this season's colour by the window.
      const mu = mu1 - 0.6;
      const mv = mv0 + 0.4;
      D.box('interior', mu - 0.25, y0, mv - 0.25, mu + 0.25, y0 + 0.08, mv + 0.25, dark);
      D.box('interior', mu - 0.06, y0 + 0.08, mv - 0.06, mu + 0.06, y0 + 0.9, mv + 0.06, VH.col(0xe8e2d6));
      D.box('interior', mu - 0.24, y0 + 0.9, mv - 0.14, mu + 0.24, y0 + 1.55, mv + 0.14, VH.col(0xff6fa8));
      D.box('interior', mu - 0.1, y0 + 1.55, mv - 0.1, mu + 0.1, y0 + 1.82, mv + 0.1, VH.col(0xe8e2d6));
      D.collide(mu - 0.25, 0, mv - 0.25, mu + 0.25, y0 + 1.8, mv + 0.25, 'prop', FLAGS);
    }
    void i0;
  }

  /**
   * The Spray Shack: a drive-in garage with the roll-up door up, spray-booth
   * lights inside and a sign over the door. Returns the roof height.
   */
  function buildSpray(world, ctx, s) {
    const f = s.f;
    const D = drawer(ctx, f);
    const brand = BRANDS[s.brand];
    const band = VH.col(brand.band);
    const trim = VH.col(brand.trim);
    const wall = VH.col(0xd9dcdf);
    const a0 = s.a;
    const a1 = s.a + s.SW;
    const v0 = s.vb0;
    const v1 = s.vb1;
    const y0 = KERB;
    const H = 5.2;
    const FLAGS = VH.COLLIDE.ALL;
    // Floor, walls, roof.
    D.box('concrete', a0, 0, v0, a1, y0, v1, VH.col(0x8f8f8f));
    D.box('b', a0, y0, v0, a0 + T, H, v1, wall);
    D.box('b', a1 - T, y0, v0, a1, H, v1, wall);
    D.box('b', a0, y0, v1 - T, a1, H, v1, wall);
    D.box('b', a0, H - 1.0, v0, a1, H, v0 + T, band); // the header over the opening
    D.box('b', a0 - 0.1, H, v0 - 0.1, a1 + 0.1, H + 0.35, v1 + 0.1, VH.col(0x6b727a), { bottom: true });
    D.box('prop', a0 + 0.4, H - 1.6, v0 + 0.3, a1 - 0.4, H - 1.0, v0 + 0.9, VH.col(0x9aa0a6)); // the rolled-up door
    D.box('prop', a0 - 0.12, H - 1.12, v0 - 0.14, a1 + 0.12, H - 1.0, v0, trim);
    D.collide(a0, 0, v0, a0 + T, H, v1, 'building', FLAGS);
    D.collide(a1 - T, 0, v0, a1, H, v1, 'building', FLAGS);
    D.collide(a0, 0, v1 - T, a1, H, v1, 'building', FLAGS);
    D.collide(a0, H - 1.6, v0, a1, H + 0.35, v1, 'building', FLAGS);
    // Inside: striped booth walls and bright strip lights.
    for (let v = v0 + 2; v < v1 - 1; v += 2.5) {
      D.box('interior', a0 + T, y0, v, a0 + T + 0.05, H - 1.6, v + 0.25, trim);
      D.box('interior', a1 - T - 0.05, y0, v, a1 - T, H - 1.6, v + 0.25, trim);
    }
    const lamp = VH.col(0xffffff, 1.6);
    for (let v = v0 + 1.5; v < v1 - 1; v += 3) D.hquad('screen', a0 + 1.5, v, a1 - 1.5, v + 0.35, H - 1.62, -1, lamp);
    // Hazard stripes across the threshold, and the sign.
    for (let u = a0 + 0.4, n = 0; u < a1 - 0.4; u += 1.0, n++) D.hquad('concrete', u, v0 - 0.6, u + 1.0, v0 + 0.4, y0 + 0.01, 1, VH.col(n % 2 ? 0x1a1a1a : 0xf2c500));
    const yawOut = Math.atan2(-f.vx, -f.vz);
    const [sx, sz] = P(f, (a0 + a1) / 2, v0 - 0.15);
    (world.signs || (world.signs = [])).push({ x: sx, y: H - 0.5, z: sz, yaw: yawOut, w: Math.min(s.SW - 1.5, 8), h: 0.85, lines: brand.sign, style: 'brand', colors: { bg: brand.bg, fg: brand.fg }, frame: brand.band });
    const [cx, cz] = P(f, (a0 + a1) / 2, (v0 + v1) / 2);
    (world.floodlights || (world.floodlights = [])).push({ x: cx, z: cz, r: s.SW * 0.5, y: KERB + 0.03 });
    return H + 1;
  }

  /** Petrol station extras: the canopy, two pump islands and a price pylon. */
  function buildForecourt(world, ctx, s, D) {
    const f = s.f;
    const brand = BRANDS[s.brand];
    const band = VH.col(brand.band);
    const trim = VH.col(brand.trim);
    const cu = f.W / 2;
    const hw = Math.min(11, f.W / 2 - 4);
    const cv0 = 3;
    const cv1 = s.vb0 - 3.5;
    const y0 = KERB;
    const yu = KERB + 5.0;
    const steel = VH.col(0xd9dcdf);
    // The canopy: white underside full of lights, brand fascia round the edge.
    D.box('prop', cu - hw, yu, cv0, cu + hw, yu + 0.25, cv1, steel, { bottom: true });
    D.box('prop', cu - hw - 0.1, yu + 0.25, cv0 - 0.1, cu + hw + 0.1, yu + 1.05, cv1 + 0.1, band);
    D.box('prop', cu - hw - 0.12, yu + 0.2, cv0 - 0.12, cu + hw + 0.12, yu + 0.32, cv1 + 0.12, trim);
    const lamp = VH.col(0xffffff, 1.5);
    for (let u = cu - hw + 1.5; u < cu + hw - 1.5; u += 3.2) {
      for (let v = cv0 + 1.5; v < cv1 - 1.0; v += 3.0) D.hquad('screen', u, v, u + 1.6, v + 0.5, yu - 0.01, -1, lamp);
    }
    // Columns and pump islands.
    const islands = [cu - hw * 0.45, cu + hw * 0.45];
    for (const iu of islands) {
      for (const cv of [cv0 + 1.6, cv1 - 1.6]) {
        D.box('prop', iu - 0.25, y0, cv - 0.25, iu + 0.25, yu, cv + 0.25, steel);
        D.collide(iu - 0.3, 0, cv - 0.3, iu + 0.3, yu, cv + 0.3, 'pole', VH.COLLIDE.ALL);
      }
      D.box('concrete', iu - 0.7, y0, cv0 + 2.2, iu + 0.7, y0 + 0.2, cv1 - 2.2, VH.col(0xc9c4b8));
      D.collide(iu - 0.7, 0, cv0 + 2.2, iu + 0.7, y0 + 0.2, cv1 - 2.2, 'kerb', VH.COLLIDE.SOLID);
      for (const pv of [cv0 + 3.4, cv1 - 3.4]) {
        D.box('prop', iu - 0.35, y0 + 0.2, pv - 0.5, iu + 0.35, y0 + 1.75, pv + 0.5, VH.col(0xeeeeea));
        D.box('prop', iu - 0.36, y0 + 1.75, pv - 0.52, iu + 0.36, y0 + 2.05, pv + 0.52, band);
        D.vquad('screen', iu - 0.36, pv - 0.3, iu - 0.36, pv + 0.3, y0 + 1.25, y0 + 1.6, -1, 0, VH.col(0x7ff0d0, 1.1));
        D.vquad('screen', iu + 0.36, pv - 0.3, iu + 0.36, pv + 0.3, y0 + 1.25, y0 + 1.6, 1, 0, VH.col(0x7ff0d0, 1.1));
        D.collide(iu - 0.4, 0, pv - 0.55, iu + 0.4, y0 + 2.05, pv + 0.55, 'pump', VH.COLLIDE.ALL);
      }
    }
    D.collide(cu - hw, yu, cv0, cu + hw, yu + 1.05, cv1, 'building', VH.COLLIDE.ALL);
    // Price pylon at the front corner.
    const [px, pz] = P(f, 1.6, 1.4);
    (world.signs || (world.signs = [])).push({ x: px, y: 4.2, z: pz, yaw: Math.atan2(-f.vx, -f.vz), w: 2.6, h: 2.2, lines: ['TIDAL', 'UNLEADED 1.89', 'DIESEL 1.97'], style: 'brand', colors: { bg: brand.bg, fg: brand.fg }, posts: true, frame: brand.band });
    const [fx, fz] = P(f, cu, (cv0 + cv1) / 2);
    (world.floodlights || (world.floodlights = [])).push({ x: fx, z: fz, r: hw + 2, y: KERB + 0.03 });
  }

  // ------------------------------------------------------------ the clerk
  class ClerkBrain {
    constructor(stores, s) {
      this.stores = stores;
      this.s = s;
      this.mode = 'idle'; // idle | hands | cower
      this.watch = false;
      this.hostile = false;
      this._scared = 0;
    }

    update(a, dt) {
      if (a.dead) return;
      const post = this.s.clerk;
      a.moveSpeed = 0;
      if (this._scared > 0) {
        this._scared -= dt;
        if (this._scared <= 0 && this.mode === 'cower') this.mode = 'idle';
      }
      const dx = post.x - a.pos.x;
      const dz = post.z - a.pos.z;
      if (this.mode === 'idle' && Math.hypot(dx, dz) > 0.45) {
        a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 8, dt);
        a.moveSpeed = 1.1;
      } else {
        let want = post.heading;
        const p = this.stores.game.player;
        if (this.watch && this.mode !== 'cower') want = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
        a.heading = dampAngle(a.heading, want, 5, dt);
      }
      const hands = this.mode === 'hands' ? 1 : 0;
      const cower = this.mode === 'cower' ? 1 : 0;
      a.anim.handsUp += (hands - a.anim.handsUp) * Math.min(1, dt * 8);
      a.anim.cower += (cower - a.anim.cower) * Math.min(1, dt * 6);
      a.anim.talk = 0;
    }

    scare(seconds) {
      if (this.mode !== 'hands') this.mode = 'cower';
      this._scared = Math.max(this._scared, seconds);
    }

    setAlert() {
      this.scare(8);
    }

    expired() {
      return false; // the shop keeps its own clerk
    }
  }

  // ================================================================ stores
  class Stores {
    /** Choose the car parks that become shops. Runs once, before the world is built. */
    static plan(layout) {
      const lots = [];
      for (const b of layout.blocks) {
        if (b.kind !== 'buildings' || AVOID_BLOCKS.has(b.id)) continue;
        for (const l of b.lots) if (l.kind === 'parking') lots.push(l);
      }
      lots.sort((p, q) => hashString(p.id + SALT) - hashString(q.id + SALT));
      const chosen = [];
      const far = (l) => chosen.every((c) => Math.hypot(c.lot.cx - l.cx, c.lot.cz - l.cz) > SPACING);
      const count = {};
      // Petrol stations first, one per district at most, on the big lots.
      for (const l of lots) {
        if (chosen.length >= GAS_MAX) break;
        const d = l.district.id;
        if (!QUOTA[d] || count[d]) continue;
        const side = fit(l, true);
        if (!side || !far(l)) continue;
        chosen.push({ lot: l, side, brand: 'tidal' });
        count[d] = 1;
      }
      for (const l of lots) {
        const d = l.district.id;
        if (!QUOTA[d] || (count[d] || 0) >= QUOTA[d] || chosen.some((c) => c.lot === l)) continue;
        const side = fit(l, false);
        if (!side || !far(l)) continue;
        chosen.push({ lot: l, side, brand: null });
        count[d] = (count[d] || 0) + 1;
      }
      // Spray Shacks on a few more car parks, spread well apart.
      const sprays = [];
      for (const l of lots) {
        if (sprays.length >= SPRAY_MAX) break;
        if (!QUOTA[l.district.id] || chosen.some((c) => c.lot === l)) continue;
        let side = null;
        for (const sd of ['s', 'n', 'e', 'w']) {
          if (!l.front[sd]) continue;
          const fr = frameFor(l, sd);
          if (fr.W >= 13 && fr.D >= 16) {
            side = sd;
            break;
          }
        }
        if (!side || !chosen.every((c) => Math.hypot(c.lot.cx - l.cx, c.lot.cz - l.cz) > 30)) continue;
        if (!sprays.every((c) => Math.hypot(c.lot.cx - l.cx, c.lot.cz - l.cz) > 320)) continue;
        sprays.push({ lot: l, side, brand: 'sprayshack' });
      }
      for (const c of sprays) chosen.push(c);
      // A fixed order (west to east, north to south) so ids are stable.
      chosen.sort((p, q) => p.lot.cx - q.lot.cx || p.lot.cz - q.lot.cz);
      // Deal the corner-shop chains out in turn so neighbours differ.
      let m = 0;
      for (const c of chosen) if (!c.brand) c.brand = MARTS[m++ % MARTS.length];
      // A bank downtown, then the specialists over every other remaining shop.
      const shops = chosen.filter((c) => !BRANDS[c.brand].gas);
      const bank = shops.find((c) => c.lot.district.id === 'downtown');
      if (bank) bank.brand = 'coastline';
      const deck = SPECIALS.slice();
      shops.filter((c) => c !== bank)
        .sort((p, q) => hashString(p.lot.id + 'kinds') - hashString(q.lot.id + 'kinds'))
        .forEach((c, i) => {
          if (i % 2 === 0 && deck.length) c.brand = deck.shift();
        });
      layout.stores = chosen.map((c, i) => Stores._describe(layout, c, i));
      for (const s of layout.stores) s.lot.store = s;
      return layout.stores;
    }

    static _describe(layout, c, i) {
      const lot = c.lot;
      const f = frameFor(lot, c.side);
      const gas = !!BRANDS[c.brand].gas;
      const spray = BRANDS[c.brand].kind === 'spray';
      const SW = spray ? clamp(Math.floor(f.W - 2), 11, 13) : gas ? 14 : clamp(Math.floor(f.W - 3), 11, 18);
      const SD = spray ? clamp(Math.floor(f.D - 1.5), 14, 16) : gas ? 10 : clamp(Math.floor(f.D - 8.5), 9, 13);
      const a = (f.W - SW) / 2;
      const vb1 = f.D - 0.6;
      const vb0 = vb1 - SD;
      const d1 = spray ? a + SW - 0.8 : a + SW - 1.8;
      const d0 = spray ? a + 0.8 : d1 - 2.0;
      const at = (u, v) => {
        const [x, z] = P(f, u, v);
        return { x, z };
      };
      const clerk = at(a + 1.15, vb0 + 3.3);
      clerk.heading = Math.atan2(f.ux, f.uz);
      const front = at((d0 + d1) / 2, -3);
      const road = VH.CityGen.roadNameAt(layout, front.x, front.z);
      const brand = BRANDS[c.brand];
      return {
        id: 'store_' + (i + 1),
        brand: c.brand,
        name: brand.name + (road ? ', ' + road : ''),
        gas,
        lot,
        district: lot.district.id,
        f, a, SW, SD, vb0, vb1, d0, d1,
        clerk,
        door: at((d0 + d1) / 2, vb0 - 1.2),
        centre: at(a + SW / 2, (vb0 + vb1) / 2),
        yawIn: Math.atan2(f.vx, f.vz),
        seed: hashString(lot.id + SALT),
      };
    }

    /** World build: the shop on a planned lot. Returns the roof height. */
    static buildLot(world, ctx, lot) {
      if (kindOf(lot.store) === 'spray') return buildSpray(world, ctx, lot.store);
      return buildShop(world, ctx, lot.store);
    }

    static registerPlaces(world, places) {
      for (const s of places.layout.stores || []) {
        places.add(s.id, { name: s.name, x: s.door.x, z: s.door.z, yaw: s.yawIn, kind: 'store', district: s.district });
      }
    }

    // ------------------------------------------------------------ runtime
    constructor(game) {
      this.game = game;
      this.list = game.layout.stores || [];
      this.ok = this.list.length > 0;
      this.saveKey = 'stores';
      this.byId = new Map(this.list.map((s) => [s.id, s]));
      this.until = {}; // store id -> playTime when the till is full again
      this.robbed = 0;
      this.cash = 0;
      this.outfit = 'classic'; // what Jay's wearing (Threads)
      this.wardrobe = new Set(['classic']); // outfits he owns
      this.clerks = new Map(); // store id -> agent
      this.killed = new Set(); // shops whose clerk was killed: shut until the till refills
      this.active = null;
      this._tipShown = false;
      this._emptyTold = null;
      this._v = new THREE.Vector3();
      if (!this.ok) return;
      this._buildHud();
      this._bind();
    }

    _bind() {
      const g = this.game;
      g.interaction.on('storeBuy', (item, player) => this._buy(item, player));
      g.interaction.on('storeAmmo', (item, player) => this._buyAmmo(item, player));
      g.interaction.on('storeArmor', (item, player) => this._buyArmor(item, player));
      g.interaction.on('storeOutfit', (item, player) => this._tryOn(item, player));
      g.interaction.on('atm', (item) => this._startHack(item));
      VH.events.on('agent:died', (e) => {
        const s = this._storeOfClerk(e.agent);
        if (!s) return;
        this.until[s.id] = Math.max(this.until[s.id] || 0, g.playTime + REFILL);
        this.killed.add(s.id);
        if (this.active && this.active.s === s) this._end(false);
      });
      VH.events.on('agent:hurt', (e) => {
        const s = this._storeOfClerk(e.agent);
        if (!s) return;
        if (this.active && this.active.s === s) this.active.meter = Math.min(0.99, this.active.meter + 0.15);
      });
      VH.events.on('gunshot', (e) => {
        if (!e.byPlayer) return;
        for (const s of this.list) {
          const a = this.clerks.get(s.id);
          if (!a || a.dead || !(a.brain instanceof ClerkBrain)) continue;
          if (Math.hypot(e.x - s.centre.x, e.z - s.centre.z) < 30) a.brain.scare(10);
        }
      });
    }

    _storeOfClerk(agent) {
      if (!agent) return null;
      for (const [id, a] of this.clerks) if (a === agent) return this.byId.get(id);
      return null;
    }

    /** The shop whose room contains (x, z), if any. */
    storeAt(x, z) {
      for (const s of this.list) {
        if (kindOf(s) === 'spray') continue;
        if (Math.abs(x - s.centre.x) > 14 || Math.abs(z - s.centre.z) > 14) continue;
        const [u, v] = local(s.f, x, z);
        if (u > s.a + T && u < s.a + s.SW - T && v > s.vb0 + T * 0.5 && v < s.vb1 - T) return s;
      }
      return null;
    }

    isOpen(s) {
      return this.game.playTime >= (this.until[s.id] || 0);
    }

    // ---------------------------------------------------------- clerks
    _spawnClerk(s) {
      const g = this.game;
      const look = Object.assign({}, VH.Crowd.randomLook(), { top: BRANDS[s.brand].shirt, shirt: BRANDS[s.brand].shirt });
      const a = g.crowd.spawn(s.clerk.x, s.clerk.z, { look, faction: 'civilian', role: 'clerk', persistent: true, heading: s.clerk.heading, name: 'Clerk', health: 60 });
      a.brain = new ClerkBrain(this, s);
      this.clerks.set(s.id, a);
      return a;
    }

    _removeClerk(s) {
      const a = this.clerks.get(s.id);
      if (a && !a.removed) this.game.crowd.remove(a);
      this.clerks.delete(s.id);
    }

    _clearClerks() {
      for (const s of this.list) this._removeClerk(s);
    }

    // ---------------------------------------------------------- update
    update(dt) {
      if (!this.ok) return;
      const g = this.game;
      const p = g.player;
      const px = p.pos.x;
      const pz = p.pos.z;
      for (const s of this.list) {
        if (kindOf(s) === 'spray') continue;
        const d = Math.hypot(px - s.centre.x, pz - s.centre.z);
        let a = this.clerks.get(s.id);
        if (a && a.removed) {
          this.clerks.delete(s.id);
          a = null;
        }
        if (this.killed.has(s.id) && this.isOpen(s) && !a) this.killed.delete(s.id);
        if (!a && d < 75 && !this.killed.has(s.id)) a = this._spawnClerk(s);
        else if (a && d > 110 && !(this.active && this.active.s === s)) this._removeClerk(s);
      }
      const inside = p.inVehicle || p.isDead ? null : this.storeAt(px, pz);
      for (const s of this.list) {
        const a = this.clerks.get(s.id);
        if (a && a.brain instanceof ClerkBrain) a.brain.watch = inside === s;
      }
      if (inside !== this._lastInside) {
        this._lastInside = inside;
        this._emptyTold = null;
        if (inside && !this._tipShown && g.combat.playerArmed && this.robbed === 0 && this.isOpen(inside)) {
          this._tipShown = true;
          g.hud.showToast('Aim a gun at the clerk to hold the shop up');
        }
      }
      if (this.hack) this._hackStep(dt);
      this._sprayCheck(dt);
      this._chopCheck(dt);
      this._atmT = (this._atmT || 0) - dt;
      if (this._atmT <= 0) {
        this._atmT = 1;
        for (const it of g.interaction.items) if (it.kind === 'atm') it.enabled = g.playTime >= (this.until[it.id] || 0);
      }
      if (this.active) this._holdUp(dt, inside);
      else if (inside) this._maybeStart(inside);
      if (this.guards && this.guards.length) {
        this.guards = this.guards.filter((a) => {
          if (a.removed) return false;
          if (Math.hypot(a.pos.x - px, a.pos.z - pz) > 140) {
            g.crowd.remove(a);
            return false;
          }
          return true;
        });
      }
      this._hudUpdate();
    }

    /** Is Jay covering this clerk with a gun? */
    _covering(a) {
      const g = this.game;
      const p = g.player;
      const w = g.combat.weapon;
      if (!w || (w.kind !== 'hitscan' && w.kind !== 'pellets')) return false;
      if (!p.aiming || p.aimAmount < 0.5 || a.dead) return false;
      const cam = g.renderer.camera;
      const dir = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const tx = a.pos.x - cam.position.x;
      const ty = a.pos.y + 1.2 - cam.position.y;
      const tz = a.pos.z - cam.position.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > 22 || dist < 0.01) return false;
      const cos = (tx * dir.x + ty * dir.y + tz * dir.z) / dist;
      return cos > Math.cos(clamp(1.1 / dist, 0.13, 0.4));
    }

    _maybeStart(s) {
      const g = this.game;
      const a = this.clerks.get(s.id);
      if (!a || a.dead || !(a.brain instanceof ClerkBrain)) return;
      if (!this._covering(a)) return;
      if (g.missions && g.missions.run) {
        a.brain.scare(4);
        return;
      }
      if (!this.isOpen(s)) {
        a.brain.mode = 'hands';
        a.brain._scared = 2;
        if (this._emptyTold !== s) {
          this._emptyTold = s;
          g.hud.showToast("The till's empty. Come back later.");
        }
        return;
      }
      const R = ROB[kindOf(s)];
      // More stars, more nerve: the take grows with the heat you're already carrying.
      const heatBonus = 1 + 0.2 * ((g.police && g.police.level) || 0);
      const total = Math.round((R.base + new VH.RNG(s.seed + g.playTime).range(0, R.extra)) * heatBonus);
      this.active = { s, a, meter: 0, paid: 0, total, chunks: 0, idle: 0, fight: Math.random() < R.fight, secs: R.secs };
      if (R.guards) this._spawnGuards(s, R.guards);
      a.brain.mode = 'hands';
      a.brain._scared = 999;
      // Somebody hits the silent alarm.
      const pol = g.police;
      if (pol && !(g.missions && g.missions.suppressHeat)) pol._reports.push({ t: R.heat >= 4 ? 3 : 7, heat: R.heat, x: s.centre.x, z: s.centre.z, kind: 'robbery' });
    }

    _holdUp(dt, inside) {
      const g = this.game;
      const h = this.active;
      const p = g.player;
      if (inside !== h.s || p.isDead || h.a.dead || h.a.removed || g.state !== 'playing' && g.state !== 'dialog') {
        this._end(h.chunks > 0);
        return;
      }
      if (this._covering(h.a)) {
        h.meter = Math.min(1, h.meter + dt / (h.secs || 5.5));
        h.idle = 0;
      } else {
        h.meter = Math.max(0, h.meter - dt * 0.05);
        h.idle += dt;
        if (h.idle > 6) {
          this._end(h.chunks > 0);
          return;
        }
      }
      // The odd clerk fights back.
      if (h.fight && h.meter > 0.3) {
        this._fight(h);
        return;
      }
      // Pay out in five handfuls.
      const due = Math.floor(h.meter * 5 + 1e-6);
      while (h.chunks < due) {
        h.chunks++;
        const amount = h.chunks === 5 ? h.total - h.paid : Math.round(h.total / 5);
        h.paid += amount;
        g.giveMoney(amount, 'hold-up');
        if (g.audio && g.audio.cash) g.audio.cash();
        g.hud.popScore('HOLD-UP', amount);
      }
      if (h.chunks >= 5) this._end(true);
    }

    _fight(h) {
      const g = this.game;
      const s = h.s;
      const a = h.a;
      this.active = null;
      a.anim.handsUp = 0;
      a.weapon = 'shotgun';
      const brain = new VH.CombatBrain(g.combat, { weapon: 'shotgun', alert: true, hostile: true, accuracy: 0.4, aggression: 0.25, guard: { x: s.clerk.x, z: s.clerk.z, r: 2.5 } });
      brain.expired = () => false;
      a.brain = brain;
      this.until[s.id] = g.playTime + REFILL;
      if (h.chunks > 0) this._count(h);
      g.hud.notify({ title: BRANDS[s.brand].name, text: 'The clerk had a shotgun under the counter!', icon: '⚠', tone: 'bad' });
    }

    _count(h) {
      this.robbed++;
      this.cash += h.paid;
    }

    /** Finish (or abandon) the hold-up in progress. */
    _end(robbed) {
      const g = this.game;
      const h = this.active;
      if (!h) return;
      this.active = null;
      if (h.a && h.a.brain instanceof ClerkBrain) {
        h.a.brain.mode = 'cower';
        h.a.brain._scared = 12;
      }
      if (robbed) {
        this.until[h.s.id] = g.playTime + REFILL;
        this._count(h);
        g.hud.notify({ title: BRANDS[h.s.brand].name, text: (h.chunks >= 5 ? 'Till emptied: ' : 'You got away with ') + VH.util.formatMoney(h.paid) + '. The cops are on the way.', icon: '$', tone: 'good' });
      }
    }

    // ---------------------------------------------------------- snacks
    _buy(item, player) {
      const g = this.game;
      const s = this.byId.get(item.store);
      const a = s && this.clerks.get(s.id);
      if (!a || a.dead || !(a.brain instanceof ClerkBrain) || a.brain.mode !== 'idle' || this.active) {
        g.hud.showToast("Nobody's serving.");
        return 1;
      }
      if (player.money < item.price) {
        VH.events.emit('notify', { title: 'Not enough cash', text: 'Snacks cost ' + VH.util.formatMoney(item.price) + '.', icon: '✕', tone: 'bad' });
        return 1;
      }
      player.money -= item.price;
      const before = player.health;
      player.heal(item.heal);
      VH.events.emit('money:changed', { delta: -item.price, reason: 'snacks' });
      const lines = ['A meat pie and an iced coffee.', 'Two-for-one chocolate bars.', 'Hot chips and a Sunfizz.', 'A sausage roll, still warm.', 'Beef jerky and a lemon squash.'];
      const line = lines[Math.floor(Math.random() * lines.length)];
      VH.events.emit('notify', { title: BRANDS[s.brand].name, text: line + (player.health > before ? ' +' + Math.round(player.health - before) + ' health' : ''), icon: '🛒' });
      return 1.5;
    }

    // ----------------------------------------------------- Spray Shack
    /** Drive into a Spray Shack unseen: the car is fixed, resprayed, and the heat's off. */
    _sprayCheck(dt) {
      const g = this.game;
      const p = g.player;
      const v = p.inVehicle ? p.vehicle : null;
      this._sprayCool = Math.max(0, (this._sprayCool || 0) - dt);
      if (!v || v.flying || v.kind === 'plane' || v.kind === 'heli' || v.kind === 'tank') {
        this._inSpray = null;
        return;
      }
      let here = null;
      for (const s of this.list) {
        if (kindOf(s) !== 'spray' || Math.abs(v.pos.x - s.centre.x) > 14 || Math.abs(v.pos.z - s.centre.z) > 14) continue;
        const [u, w] = local(s.f, v.pos.x, v.pos.z);
        if (u > s.a + 0.5 && u < s.a + s.SW - 0.5 && w > s.vb0 + 1 && w < s.vb1 - 0.5) here = s;
      }
      if (here !== this._inSpray) {
        this._inSpray = here;
        this._sprayTold = false;
      }
      if (!here || v.speed > 1.5 || this._sprayCool > 0) return;
      const pol = g.police;
      if (pol && pol.level > 0 && pol.seen) {
        if (!this._sprayTold) {
          this._sprayTold = true;
          g.hud.showToast('The cops saw you drive in. Lose them first.');
        }
        return;
      }
      if (p.money < SPRAY_PRICE) {
        if (!this._sprayTold) {
          this._sprayTold = true;
          g.hud.showToast('A respray is ' + VH.util.formatMoney(SPRAY_PRICE) + '. Come back with the cash.');
        }
        return;
      }
      if (this._sprayTold === 'done') return;
      this._sprayTold = 'done';
      this._sprayCool = 6;
      p.money -= SPRAY_PRICE;
      VH.events.emit('money:changed', { delta: -SPRAY_PRICE, reason: 'respray' });
      g.hud.setFade(1, 350);
      setTimeout(() => {
        v.repair();
        const old = v.model.color;
        const choices = SPRAY_COLORS.filter((c) => c !== old);
        if (v.model.repaint) v.model.repaint(choices[Math.floor(Math.random() * choices.length)]);
        if (pol) pol.setLevel(0, 'respray');
        g.hud.setFade(0, 700);
        g.hud.notify({ title: 'Spray Shack', text: 'New paint, no dents, no heat. ' + VH.util.formatMoney(SPRAY_PRICE) + '.', icon: '🎨', tone: 'good' });
      }, 450);
      this.sprays = (this.sprays || 0) + 1;
    }

    // ---------------------------------------------------------- chop shop
    /** What Otto pays for a car: its class and speed, less the dents; double for the car on his list. */
    chopValue(v) {
      const spec = v.spec || VH.Vehicle.typeSpec(v.type) || {};
      if (CHOP_NO.has(spec.cls) || v.isPolice || v.military || v.kind !== 'car' || v.missionOwned) return 0;
      const base = (spec.topSpeed || 45) * 40 + (spec.accel || 0.5) * 900;
      const value = base * (CHOP_MUL[spec.cls] || 0.85) * (0.3 + 0.7 * Math.max(0, v.health) / 1000);
      return Math.round((value * (v.type === this.chopWanted() ? 2 : 1)) / 10) * 10;
    }

    /** The model on Otto's list this ten minutes of play. */
    chopWanted() {
      const ids = this._chopIds || (this._chopIds = VH.CarModels.list().filter((id) => {
        const t = VH.CarModels.TYPES[id];
        return t && !t.kind && !CHOP_NO.has(t.cls) && !t.military && t.cls !== 'van';
      }));
      if (!ids.length) return null;
      return ids[Math.floor((this.game.playTime || 0) / 600) % ids.length];
    }

    _chopCheck(dt) {
      const g = this.game;
      const pl = g.places && g.places.get(CHOP_PLACE);
      const p = g.player;
      const v = p.inVehicle ? p.vehicle : null;
      if (!pl || !v || g.missions && g.missions.run) {
        this._chop = null;
        return;
      }
      const near = Math.hypot(v.pos.x - pl.x, v.pos.z - pl.z) < CHOP_R;
      if (!near) {
        this._chop = null;
        return;
      }
      if (!this._chop || this._chop.v !== v) {
        const price = this.chopValue(v);
        this._chop = { v, t: 0, price, sold: false };
        g.hud.showToast(price ? "Big Otto pays " + VH.util.formatMoney(price) + ' for this ' + v.name + '. Stop to sell it.' : "Otto won't touch this one. Too hot.");
      }
      const c = this._chop;
      if (c.sold || !c.price) return;
      if (g.police && g.police.level > 0) {
        if (!c.told) {
          c.told = true;
          g.hud.showToast('Not with the cops on you. Lose them first.');
        }
        return;
      }
      c.t = v.speed < 1 ? c.t + dt : 0;
      if (c.t < 1.5) return;
      c.sold = true;
      g.giveMoney(c.price, 'chop shop');
      if (g.audio && g.audio.cash) g.audio.cash();
      g.hud.notify({ title: "Big Otto's Scrapyard", text: v.name + ' sold for ' + VH.util.formatMoney(c.price) + '. Next on his list: ' + ((VH.CarModels.TYPES[this.chopWanted()] || {}).name || 'anything clean') + '.', icon: '$', tone: 'good' });
      this.carsSold = (this.carsSold || 0) + 1;
      this.cash += c.price;
      g.vehicles.exitVehicle();
      setTimeout(() => {
        if (g.player.vehicle !== v && !v.removed) g.vehicles.remove(v);
      }, 2500);
    }

    // ------------------------------------------------------------ ATMs
    _startHack(item) {
      const g = this.game;
      if (this.hack || this.active) return 1;
      if (g.playTime < (this.until[item.id] || 0)) {
        g.hud.showToast('This ATM is offline. Try another one.');
        return 1;
      }
      this.hack = { item, t: 0, bank: (this.byId.get(item.store) || {}).brand === 'coastline' };
      g.hud.showToast('Hacking: stay at the ATM');
      return 0.5;
    }

    _hackStep(dt) {
      const g = this.game;
      const h = this.hack;
      const p = g.player;
      if (p.inVehicle || p.isDead || Math.hypot(p.pos.x - h.item.x, p.pos.z - h.item.z) > 1.9 || g.state !== 'playing') {
        this.hack = null;
        g.hud.showToast('Hack abandoned.');
        return;
      }
      h.t += dt;
      if (h.t < ATM_SECS) return;
      const amount = Math.round((150 + Math.random() * 300) * (h.bank ? 2 : 1));
      g.giveMoney(amount, 'atm');
      if (g.audio && g.audio.cash) g.audio.cash();
      g.hud.popScore('ATM HACKED', amount);
      this.until[h.item.id] = g.playTime + ATM_COOL;
      h.item.enabled = false;
      this.atms = (this.atms || 0) + 1;
      this.cash += amount;
      // The camera above the screen got a good look at you.
      const pol = g.police;
      if (pol && !(g.missions && g.missions.suppressHeat)) pol._reports.push({ t: 4, heat: 1, x: h.item.x, z: h.item.z, kind: 'robbery' });
      this.hack = null;
    }

    /** Armed guards on the floor of a bank or a jeweller's (they open fire at once). */
    _spawnGuards(s, n) {
      const g = this.game;
      this.guards = (this.guards || []).filter((a) => !a.dead && !a.removed);
      for (let i = 0; i < n; i++) {
        const u = s.a + s.SW - 1.6 - i * 1.4;
        const v = s.vb0 + 1.6 + i * 1.2;
        const [x, z] = P(s.f, u, v);
        const look = Object.assign({}, VH.Crowd.randomLook(), { top: 0x2b3a55, shirt: 0xe8e8e8, bottom: 0x1c1f23, cap: true });
        const a = g.combat.spawnEnemy(x, z, { look, faction: 'security', weapon: 'pistol', alert: true, hostile: true, accuracy: 0.45, health: 120, armor: 40, name: 'Guard' });
        this.guards.push(a);
      }
      g.hud.notify({ title: BRANDS[s.brand].name, text: n > 1 ? 'Security guards!' : 'A security guard draws on you!', icon: '⚠', tone: 'bad' });
    }

    /** Breakwater Arms: 100 more rounds for every gun you carry, and grenades. */
    _buyAmmo(item, player) {
      const g = this.game;
      if (player.money < item.price) {
        VH.events.emit('notify', { title: 'Not enough cash', text: 'Ammo costs ' + VH.util.formatMoney(item.price) + '.', icon: '✕', tone: 'bad' });
        return 1;
      }
      let n = 0;
      for (const id of Object.keys(g.combat.inventory)) {
        const w = VH.Combat.def(id);
        if (!w || (w.kind !== 'hitscan' && w.kind !== 'pellets')) continue;
        g.combat.giveWeapon(id, 100, true);
        n++;
      }
      g.combat.giveWeapon('grenade', 4, true);
      player.money -= item.price;
      VH.events.emit('money:changed', { delta: -item.price, reason: 'ammo' });
      VH.events.emit('notify', { title: 'Breakwater Arms', text: '+100 rounds for ' + n + ' gun' + (n === 1 ? '' : 's') + ', +4 grenades.', icon: '🛒' });
      if (g.audio.pickup) g.audio.pickup();
      return 1.2;
    }

    _buyArmor(item, player) {
      const g = this.game;
      if (player.armor >= player.maxArmor) {
        g.hud.showToast('Your armour is already full.');
        return 1;
      }
      if (player.money < item.price) {
        VH.events.emit('notify', { title: 'Not enough cash', text: 'Armour costs ' + VH.util.formatMoney(item.price) + '.', icon: '✕', tone: 'bad' });
        return 1;
      }
      player.money -= item.price;
      player.armor = player.maxArmor;
      VH.events.emit('money:changed', { delta: -item.price, reason: 'armour' });
      VH.events.emit('notify', { title: 'Breakwater Arms', text: 'Body armour on.', icon: '🛡' });
      return 1.2;
    }

    // ------------------------------------------------------- clothes
    /** The next outfit on Threads' rail after the one Jay's wearing. */
    _nextOutfit() {
      const i = OUTFITS.findIndex((o) => o.id === this.outfit);
      return OUTFITS[(i + 1) % OUTFITS.length];
    }

    /** Label every Threads counter with what's next on the rail. */
    _syncOutfitItems() {
      const next = this._nextOutfit();
      const owned = this.wardrobe.has(next.id);
      for (const it of this.game.interaction.items) {
        if (it.kind !== 'storeOutfit') continue;
        it.label = (owned ? 'Change into: ' : 'Buy and wear: ') + next.name;
        it.price = owned ? undefined : next.price;
      }
      const cur = this.game.interaction.current;
      if (cur && cur.kind === 'storeOutfit') VH.events.emit('interaction:focus', { item: cur });
    }

    /** Dress Jay (the model keeps its joints, so a gun in hand stays put). */
    _wear(id) {
      const o = OUTFITS.find((x) => x.id === id) || OUTFITS[0];
      this.outfit = o.id;
      const m = this.game.player.model;
      if (m && m.setLook) m.setLook(Object.assign({}, VH.Humanoid.JAY_LOOK, o.look));
    }

    _tryOn(item, player) {
      const g = this.game;
      const next = this._nextOutfit();
      if (!this.wardrobe.has(next.id)) {
        if (player.money < next.price) {
          VH.events.emit('notify', { title: 'Not enough cash', text: next.name + ' costs ' + VH.util.formatMoney(next.price) + '.', icon: '✕', tone: 'bad' });
          return 1;
        }
        player.money -= next.price;
        VH.events.emit('money:changed', { delta: -next.price, reason: next.name });
        this.wardrobe.add(next.id);
      }
      this._wear(next.id);
      if (g.audio.pickup) g.audio.pickup();
      g.hud.showToast(next.name + (next.id === 'classic' ? ': the old jacket back on' : ''));
      this._syncOutfitItems();
      return 0.8;
    }

    // ---------------------------------------------------------- HUD
    _buildHud() {
      const el = document.createElement('div');
      el.className = 'vh-holdup';
      el.innerHTML = '<span>HOLD-UP</span><div class="vh-holdup-fill"></div><em></em>';
      this.game.hud.root.appendChild(el);
      this.hudEl = el;
      this.fillEl = el.querySelector('.vh-holdup-fill');
      this.cashEl = el.querySelector('em');
    }

    _hudUpdate() {
      if (!this.hudEl) return;
      const h = this.active || (this.hack && { meter: this.hack.t / ATM_SECS, paid: 0, hack: true });
      const on = !!h;
      if (on !== this._hudOn) {
        this._hudOn = on;
        this.hudEl.classList.toggle('visible', on);
      }
      if (!on) return;
      const pct = Math.round(h.meter * 100);
      if (pct !== this._hudPct) {
        this._hudPct = pct;
        this.fillEl.style.width = pct + '%';
      }
      const label = h.hack ? 'HACKING ATM' : 'HOLD-UP';
      if (label !== this._hudLabel) {
        this._hudLabel = label;
        this.hudEl.querySelector('span').textContent = label;
      }
      const txt = h.hack ? '' : VH.util.formatMoney(h.paid);
      if (txt !== this._hudCash) {
        this._hudCash = txt;
        this.cashEl.textContent = txt;
      }
    }

    // ---------------------------------------------------------- contract
    blips(out, missionRunning) {
      if (!this.ok) return; // shown during jobs too: they're places, not distractions
      const chop = this.game.places && this.game.places.get(CHOP_PLACE);
      if (chop) out.push({ x: chop.x, z: chop.z, type: 'store', label: "Big Otto's · buys stolen cars (wants: " + ((VH.CarModels.TYPES[this.chopWanted()] || {}).name || 'anything') + ')', noRim: true });
      for (const s of this.list) {
        if (!this.isOpen(s)) continue;
        const k = kindOf(s);
        const tag = k === 'spray' ? ' · lose the cops' : k === 'clothes' ? ' · clothes' : k === 'guns' ? ' · ammo & armour' : k === 'bank' ? ' · bank' : k === 'jewel' ? ' · jeweller' : k === 'pawn' ? ' · pawn shop' : '';
        out.push({ x: s.door.x, z: s.door.z, type: 'store', label: BRANDS[s.brand].name + tag, noRim: true });
      }
    }

    stats() {
      if (!this.ok) return [];
      return [['Shops held up', String(this.robbed)], ['ATMs hacked', String(this.atms || 0)], ['Cars sold to Otto', String(this.carsSold || 0)], ['Cash from hold-ups and ATMs', VH.util.formatMoney(this.cash)]];
    }

    serialize() {
      const until = {};
      for (const k of Object.keys(this.until)) if (this.until[k] > this.game.playTime) until[k] = Math.round(this.until[k]);
      return { until, robbed: this.robbed, cash: this.cash, atms: this.atms || 0, carsSold: this.carsSold || 0, outfit: this.outfit, wardrobe: [...this.wardrobe] };
    }

    load(data) {
      data = data || {};
      this.until = Object.assign({}, data.until || {});
      this.robbed = data.robbed || 0;
      this.cash = data.cash || 0;
      this.atms = data.atms || 0;
      this.carsSold = data.carsSold || 0;
      this.active = null;
      this.hack = null;
      this.wardrobe = new Set(['classic'].concat(data.wardrobe || []));
      this._wear(this.wardrobe.has(data.outfit) ? data.outfit : 'classic');
      if (this.ok) this._syncOutfitItems();
    }

    stop() {
      if (!this.ok) return;
      this.active = null;
      this.hack = null;
      this._hudUpdate();
    }

    reset() {
      if (!this.ok) return;
      this.stop();
      this._clearClerks();
      for (const a of this.guards || []) if (!a.removed) this.game.crowd.remove(a);
      this.guards = [];
      this.until = {};
      this.killed.clear();
      this.robbed = 0;
      this.cash = 0;
      this._tipShown = false;
      this._lastInside = null;
      this.wardrobe = new Set(['classic']);
      this._wear('classic');
      this._syncOutfitItems();
    }
  }

  // ------------------------------------------------------------------ map
  VH.MapPainters = VH.MapPainters || [];
  VH.MapPainters.push((g, layout, o) => {
    for (const s of layout.stores || []) {
      const r = rect(s.f, s.a, s.vb0, s.a + s.SW, s.vb1);
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      o.R(r[0] + 1, r[1] + 1, r[2] + 1, r[3] + 1);
      g.fillStyle = '#' + BRANDS[s.brand].band.toString(16).padStart(6, '0');
      o.R(r[0], r[1], r[2], r[3]);
      if (s.gas) {
        const hw = Math.min(11, s.f.W / 2 - 4);
        const c = rect(s.f, s.f.W / 2 - hw, 3, s.f.W / 2 + hw, s.vb0 - 3.5);
        g.fillStyle = 'rgba(235, 238, 240, 0.85)';
        o.R(c[0], c[1], c[2], c[3]);
      }
    }
  });

  VH.Stores = Stores;
})();
