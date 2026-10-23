/*
 * suburbs.js — the roadside strips along the roads out of town, so driving
 * to the airport or the army base feels like crossing one city, not a
 * field: offices and apartments, then motels, diners and hotels up Grand
 * Avenue to the airport; yards, workshops, a diner and a petrol station
 * along Meridian Boulevard to Fort Breakwater; airport hotels and car
 * rental on Airport Road; and Westbrook, the bungalows and main-street
 * shops on Orchard and Westbrook Avenues and the west ends of Anchor and
 * Heron Streets.
 *
 *   VH.Suburbs.plan(layout)        lays out the strips and their lots
 *                                  (layout.strips) right after CityGen,
 *                                  keeps trees off them (layout.config.zones)
 *                                  and adds a petrol station and a corner
 *                                  shop to layout.stores
 *   VH.Suburbs.registerPlaces(world, p) westbrook, westbrook_main,
 *                                  westbrook_corner, orchard_lots
 *   VH.Suburbs.build(world, layout) kerbed pavements, the buildings (the
 *                                  city's own generator), street lights,
 *                                  trees and benches
 *
 * The strips are kept out of layout.blocks on purpose: story places, the
 * corner-shop plan and the crowd all index the old 8x8 grid.
 *
 * A strip: { id, road, side, axis ('x' runs east-west, 'z' north-south),
 *   x0, x1, z0, z1 (pavement and lots), pave: {x0, x1, z0, z1},
 *   edge (the road-side coordinate), out (+1/-1: away from the road),
 *   a0, a1 (its run along the road), lots: [...], walk: [[x, z], [x, z]] }
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;
  const PAVE = 4; // pavement depth, like the city blocks
  const DEPTH = 30; // lot depth behind the pavement
  const CHUNK = 192;
  const ORIGIN = -768;

  // Palettes for the kinds of street (walls, roofs, accents).
  const LOOKS = {
    offices: { id: 'strip-offices', palette: { walls: [0xb9bcc1, 0x98a1ab, 0xcdc4b3, 0xaab2bb, 0xc2b49c], roofs: [0x6b6e72, 0x5c5f63], accents: [0x2d3440, 0xe8e2d6, 0x445566] } },
    homes: { id: 'strip-homes', palette: { walls: [0xf2e6d0, 0xf4d9c6, 0xe6efe9, 0xf1e3b3, 0xd9e8f0, 0xcfe3d4], roofs: [0xa4553c, 0x9a4e37, 0x7a6a5a], accents: [0xffffff, 0x2f7f86, 0xd8795e, 0x3d6b8f] } },
    motels: { id: 'strip-motels', palette: { walls: [0xf7c6c7, 0xa8e0d8, 0xf9e2a6, 0xf5f0e6, 0xffd3b0, 0xc9d8f5], roofs: [0x8a8f94, 0x9a9da0], accents: [0xffffff, 0x1f8a8a, 0xff6f91, 0xf0a030] } },
    yards: { id: 'strip-yards', palette: { walls: [0x8a8f96, 0x9a968e, 0xa8a39a, 0x7d838a, 0xb8b6b0, 0x6b6f4a], roofs: [0x5a5f66, 0x5d6168, 0x4a4d3a], accents: [0xe06a1a, 0xd8c070, 0x2b4a6b] } },
    hotels: { id: 'strip-hotels', palette: { walls: [0xe9e4da, 0xc9d8f5, 0xdfe3e6, 0xb9c4cc, 0xf5f0e6], roofs: [0x777777, 0x8a8f94], accents: [0x1fa3a3, 0x2d3440, 0xffffff] } },
  };

  // What gets built where: [archetype or 'parking', weight, floors].
  const MIXES = {
    north: { look: 'offices', alt: 'homes', lots: [['office', 3, [3, 6]], ['apartment', 3, [3, 6]], ['hotel', 1, [4, 7]], ['parking', 1]] },
    airport: { look: 'motels', lots: [['apartment', 3, [2, 3]], ['shophouse', 3, [1, 1]], ['hotel', 2, [4, 7]], ['parking', 2]] },
    yards: { look: 'yards', lots: [['office', 3, [2, 3]], ['shophouse', 3, [1, 2]], ['parking', 3]] },
    fortside: { look: 'motels', lots: [['shophouse', 4, [1, 2]], ['apartment', 2, [2, 2]], ['parking', 2]] },
    hotels: { look: 'hotels', lots: [['hotel', 4, [5, 9]], ['office', 2, [3, 5]], ['shophouse', 2, [1, 2]], ['parking', 2]] },
    // Westbrook: bungalows and walk-ups on the avenues, a main street of shops on Anchor and Heron.
    westbrook: { look: 'homes', lots: [['villa', 4, [1, 2]], ['apartment', 3, [2, 4]], ['shophouse', 1, [1, 2]], ['parking', 1]] },
    westmain: { look: 'motels', alt: 'homes', lots: [['shophouse', 4, [1, 2]], ['apartment', 3, [2, 4]], ['office', 1, [2, 3]], ['parking', 2]] },
  };

  /*
   * The strips. Grand Avenue's road edges are x = +-13, Meridian's z = +-9,
   * Airport Road's south edge z = -1171. Gaps: the stunt ramp's landing run
   * east of Grand Avenue (z -860..-740), Skyline parcels to z -650, the
   * airport car park (x -400..-120) and welcome sign (x 26), the fort gate
   * apron (x < -1078) and the Crestline estates (x > -628).
   */
  const PLAN = [
    { id: 'gn_w', road: 'Grand Avenue', axis: 'z', edge: -13, out: -1, a0: -1086, a1: -662, mix: (a) => (a > -900 ? 'north' : 'airport') },
    { id: 'gn_e1', road: 'Grand Avenue', axis: 'z', edge: 13, out: 1, a0: -1086, a1: -860, mix: (a) => (a > -940 ? 'north' : 'airport') },
    { id: 'gn_e2', road: 'Grand Avenue', axis: 'z', edge: 13, out: 1, a0: -740, a1: -662, mix: () => 'north' },
    // Meridian West, broken at Orchard (x -1000) and Westbrook (x -850) Avenues.
    { id: 'mw_n1', road: 'Meridian Boulevard', axis: 'x', edge: -9, out: -1, a0: -1072, a1: -1010, mix: () => 'fortside' },
    { id: 'mw_n2', road: 'Meridian Boulevard', axis: 'x', edge: -9, out: -1, a0: -990, a1: -860, mix: (a) => (a < -960 ? 'fortside' : 'yards') },
    { id: 'mw_n3', road: 'Meridian Boulevard', axis: 'x', edge: -9, out: -1, a0: -840, a1: -652, mix: () => 'yards' },
    { id: 'mw_s1', road: 'Meridian Boulevard', axis: 'x', edge: 9, out: 1, a0: -1072, a1: -1010, mix: () => 'fortside' },
    { id: 'mw_s2', road: 'Meridian Boulevard', axis: 'x', edge: 9, out: 1, a0: -990, a1: -860, mix: (a) => (a < -960 ? 'fortside' : 'yards') },
    { id: 'mw_s3', road: 'Meridian Boulevard', axis: 'x', edge: 9, out: 1, a0: -840, a1: -652, mix: () => 'yards' },
    // Westbrook (x -1045..-640 between Anchor and Heron Streets). The avenue
    // strips stop short of Meridian's strips (z +-43) and run to the cross
    // streets; the street strips stop short of the avenue strips' corners.
    { id: 'wb_wn', road: 'Westbrook Avenue', axis: 'z', edge: -857, out: -1, a0: -281, a1: -47, mix: () => 'westbrook' },
    { id: 'wb_ws', road: 'Westbrook Avenue', axis: 'z', edge: -857, out: -1, a0: 47, a1: 281, mix: () => 'westbrook' },
    { id: 'wb_en', road: 'Westbrook Avenue', axis: 'z', edge: -843, out: 1, a0: -281, a1: -47, mix: () => 'westbrook' },
    { id: 'wb_es', road: 'Westbrook Avenue', axis: 'z', edge: -843, out: 1, a0: 47, a1: 281, mix: () => 'westbrook' },
    { id: 'or_wn', road: 'Orchard Avenue', axis: 'z', edge: -1007, out: -1, a0: -281, a1: -47, mix: () => 'westbrook' },
    { id: 'or_ws', road: 'Orchard Avenue', axis: 'z', edge: -1007, out: -1, a0: 47, a1: 281, mix: () => 'westbrook' },
    { id: 'or_en', road: 'Orchard Avenue', axis: 'z', edge: -993, out: 1, a0: -281, a1: -47, mix: () => 'westbrook' },
    { id: 'or_es', road: 'Orchard Avenue', axis: 'z', edge: -993, out: 1, a0: 47, a1: 281, mix: () => 'westbrook' },
    { id: 'an_n1', road: 'Anchor Street', axis: 'x', edge: -295, out: -1, a0: -993, a1: -857, mix: () => 'westmain' },
    { id: 'an_n2', road: 'Anchor Street', axis: 'x', edge: -295, out: -1, a0: -843, a1: -650, mix: () => 'westmain' },
    { id: 'an_s1', road: 'Anchor Street', axis: 'x', edge: -281, out: 1, a0: -955, a1: -895, mix: () => 'westmain' },
    { id: 'an_s2', road: 'Anchor Street', axis: 'x', edge: -281, out: 1, a0: -805, a1: -650, mix: () => 'westmain' },
    { id: 'hr_s1', road: 'Heron Street', axis: 'x', edge: 295, out: 1, a0: -993, a1: -857, mix: () => 'westmain' },
    { id: 'hr_s2', road: 'Heron Street', axis: 'x', edge: 295, out: 1, a0: -843, a1: -650, mix: () => 'westmain' },
    { id: 'hr_n1', road: 'Heron Street', axis: 'x', edge: 281, out: -1, a0: -955, a1: -895, mix: () => 'westmain' },
    { id: 'hr_n2', road: 'Heron Street', axis: 'x', edge: 281, out: -1, a0: -805, a1: -650, mix: () => 'westmain' },
    { id: 'ar_w', road: 'Airport Road', axis: 'x', edge: -1171, out: 1, a0: -755, a1: -410, mix: () => 'hotels' },
    { id: 'ar_e', road: 'Airport Road', axis: 'x', edge: -1171, out: 1, a0: 38, a1: 335, mix: () => 'hotels' },
  ];

  // Extra shops on the strips (appended to layout.stores, so city shop ids keep their numbers).
  const SHOPS = [
    { strip: 'mw_s3', near: -760, brand: 'tidal' },
    { strip: 'gn_w', near: -1010, brand: 'kwikpik' },
    // Westbrook's main streets and avenues: something to buy, or rob, on every corner.
    { strip: 'an_n2', near: -760, brand: 'sunrise' },
    { strip: 'an_s2', near: -700, brand: 'lustre' },
    { strip: 'an_n1', near: -930, brand: 'bottlebay' },
    { strip: 'hr_s2', near: -720, brand: 'coastline' },
    { strip: 'hr_n2', near: -760, brand: 'gullmart' },
    { strip: 'hr_s1', near: -920, brand: 'pawn' },
    { strip: 'wb_en', near: -160, brand: 'arms' },
    { strip: 'wb_ws', near: 170, brand: 'hilo' },
    { strip: 'wb_es', near: 120, brand: 'tidal' },
    { strip: 'or_en', near: -140, brand: 'kwikpik' },
    { strip: 'or_ws', near: 200, brand: 'sprayshack' },
    { strip: 'or_wn', near: -200, brand: 'bottlebay' },
  ];

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** World rectangle of a run along a strip's road (a0..a1) between two depths from the edge. */
  function rectOf(S, a0, a1, d0, d1) {
    const e0 = S.edge + S.out * d0;
    const e1 = S.edge + S.out * d1;
    const lo = Math.min(e0, e1);
    const hi = Math.max(e0, e1);
    return S.axis === 'z' ? { minX: lo, maxX: hi, minZ: a0, maxZ: a1 } : { minX: a0, maxX: a1, minZ: lo, maxZ: hi };
  }

  /** The lot side that faces the road. */
  function frontSide(S) {
    if (S.axis === 'z') return S.out > 0 ? 'w' : 'e';
    return S.out > 0 ? 'n' : 's';
  }

  /** The lot sides along the road: [the side toward a0, the side toward a1]. */
  function flankSides(S) {
    return S.axis === 'z' ? ['n', 's'] : ['w', 'e'];
  }

  function pick(rng, list) {
    let total = 0;
    for (const e of list) total += e[1];
    let r = rng.next() * total;
    for (const e of list) {
      r -= e[1];
      if (r <= 0) return e;
    }
    return list[list.length - 1];
  }

  // ================================================================ plan
  const Suburbs = {
    plan(layout) {
      const strips = [];
      const zones = layout.config.zones || (layout.config.zones = {});
      let n = 0;
      for (const P of PLAN) {
        const S = Object.assign({}, P);
        const r = rectOf(S, S.a0, S.a1, 0, PAVE + DEPTH);
        Object.assign(S, { x0: r.minX, x1: r.maxX, z0: r.minZ, z1: r.maxZ });
        const pv = rectOf(S, S.a0, S.a1, 0, PAVE);
        S.pave = { x0: pv.minX, x1: pv.maxX, z0: pv.minZ, z1: pv.maxZ };
        // Pedestrians walk the middle of the pavement.
        const wd = S.edge + S.out * 2.2;
        S.walk = S.axis === 'z' ? [[wd, S.a0 + 2], [wd, S.a1 - 2]] : [[S.a0 + 2, wd], [S.a1 - 2, wd]];
        S.lots = [];
        const rng = new VH.RNG('strip-' + S.id);
        const front = frontSide(S);
        const [lo, hi] = flankSides(S);
        let a = S.a0;
        let prevGap = true;
        while (a < S.a1 - 14) {
          // Now and then a driveway or a patch of grass between buildings.
          if (!prevGap && rng.next() < 0.18) {
            S.lots[S.lots.length - 1].back[hi] = true; // its far side looks onto the gap
            a += rng.range(6, 12);
            prevGap = true;
            continue;
          }
          let w = Math.round(rng.range(20, 34));
          if (S.a1 - (a + w) < 16) w = S.a1 - a; // no slivers at the end
          const mixId = S.mix(a + w / 2);
          const mix = MIXES[mixId];
          const e = pick(rng, mix.lots);
          const lookKey = mix.alt && e[0] === 'apartment' ? mix.alt : mix.look;
          const look = LOOKS[lookKey];
          const lr = rectOf(S, a, a + w, PAVE, PAVE + DEPTH);
          const lot = {
            id: 'strip_' + n++,
            minX: lr.minX, maxX: lr.maxX, minZ: lr.minZ, maxZ: lr.maxZ,
            cx: (lr.minX + lr.maxX) / 2, cz: (lr.minZ + lr.maxZ) / 2,
            kind: e[0] === 'parking' ? 'parking' : 'building',
            interior: false,
            front: { n: false, s: false, e: false, w: false },
            back: {},
            archetype: e[0] === 'parking' ? null : e[0],
            floorRange: e[2] || [2, 3],
            seed: hashString(S.id + ':' + a),
            district: look,
            strip: S.id,
            a0: a,
            a1: a + w,
          };
          lot.front[front] = true;
          // Windows on the ends that face a gap or the end of the strip.
          if (prevGap) lot.back[lo] = true;
          S.lots.push(lot);
          prevGap = false;
          a += w;
        }
        // The last lot's far end faces open ground too.
        if (S.lots.length) S.lots[S.lots.length - 1].back[hi] = true;
        zones['strip_' + S.id] = { minX: S.x0, maxX: S.x1, minZ: S.z0, maxZ: S.z1 };
        strips.push(S);
      }
      layout.strips = strips;
      Suburbs._addShops(layout);
      return strips;
    },

    /** A petrol station and a corner shop on the strips, run like the city's (stores.js). */
    _addShops(layout) {
      if (!VH.Stores || !VH.Stores._describe || !layout.stores) return;
      for (const sh of SHOPS) {
        const S = layout.strips.find((s) => s.id === sh.strip);
        if (!S) continue;
        const gas = sh.brand === 'tidal';
        let best = null;
        let bestD = Infinity;
        for (const lot of S.lots) {
          const w = lot.a1 - lot.a0;
          if (w < (gas ? 30 : 16)) continue;
          const d = Math.abs((lot.a0 + lot.a1) / 2 - sh.near);
          if (d < bestD) {
            bestD = d;
            best = lot;
          }
        }
        if (!best) continue;
        best.kind = 'parking';
        best.district = Object.assign({}, best.district, { id: best.district.id });
        const s = VH.Stores._describe(layout, { lot: best, side: frontSide(S), brand: sh.brand }, layout.stores.length);
        layout.stores.push(s);
        best.store = s;
      }
    },

    /** Westbrook's named spots, for the GPS and the jobs set there (story-gangs.js). */
    registerPlaces(world, places) {
      places.add('westbrook', { name: 'Westbrook', x: -872, z: -150, yaw: Math.PI / 2, kind: 'street', district: 'westbrook' });
      places.add('westbrook_main', { name: 'Anchor Street, Westbrook', x: -760, z: -278.2, yaw: Math.PI, kind: 'street', district: 'westbrook' });
      places.add('westbrook_corner', { name: 'Westbrook and Meridian', x: -840.8, z: 62, yaw: -Math.PI / 2, kind: 'street', district: 'westbrook' });
      places.add('orchard_lots', { name: 'Orchard Avenue', x: -1009.2, z: 160, yaw: Math.PI / 2, kind: 'street', district: 'westbrook' });
    },

    // ============================================================== build
    build(world, layout) {
      const strips = layout.strips || [];
      for (const S of strips) buildStrip(world, layout, S);
      return { strips };
    },
  };

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

  /** A point at distance `along` the road and `d` metres in from the road edge. */
  function at(S, along, d) {
    const c = S.edge + S.out * d;
    return S.axis === 'z' ? [c, along] : [along, c];
  }

  /** Street lights face the road: their arm points away from the strip. */
  function lampYaw(S) {
    if (S.axis === 'z') return S.out < 0 ? Math.PI / 2 : -Math.PI / 2;
    return S.out < 0 ? 0 : Math.PI;
  }

  function buildStrip(world, layout, S) {
    // One kerbed slab under the pavement and the lots, like a city block.
    chunked(S.x0, S.z0, S.x1, S.z1, (a0, b0, a1, b1) => {
      const ctx = world.ctxAt((a0 + a1) / 2, (b0 + b1) / 2);
      ctx.concrete.box(a0, 0, b0, a1, KERB, b1, VH.col(0xcfcac0), { skip: { top: true } });
      ctx.sidewalk.topRect(a0, b0, a1, b1, KERB, VH.col(0xffffff), 3);
    });
    world.physics.addBox(S.x0, -0.5, S.z0, S.x1, KERB, S.z1, 'kerb');

    // The buildings: the city's own generator (or a corner shop / petrol station).
    for (const lot of S.lots) {
      const ctx = world.ctxAt(lot.cx, lot.cz);
      const top = lot.store && VH.Stores ? VH.Stores.buildLot(world, ctx, lot) : VH.Buildings.buildLot(ctx, lot);
      lot.top = top || 0;
      if (top > 0) world.stats.buildings++;
      world.stats.tallest = Math.max(world.stats.tallest || 0, top || 0);
    }

    // Street lights, palms, benches, bins and hydrants along the pavement.
    const rng = new VH.RNG('strip-furniture-' + S.id);
    const yaw = lampYaw(S);
    const storeAt = (along) => S.lots.some((l) => l.store && along > l.a0 - 2 && along < l.a1 + 2);
    for (let a = S.a0 + 8; a < S.a1 - 4; a += 26) {
      const [x, z] = at(S, a, 0.7);
      world.addProp('streetlight', x, KERB, z, yaw, 1);
    }
    const tree = /^(mw|wb|or)/.test(S.id) ? 'tree' : 'palmTall';
    for (let a = S.a0 + 21; a < S.a1 - 6; a += 26) {
      if (storeAt(a) || rng.next() < 0.15) continue; // keep shop forecourts open
      const [x, z] = at(S, a, 1.6);
      world.addProp(tree === 'tree' && rng.next() < 0.5 ? 'treeB' : tree, x, KERB, z, rng.range(0, 6.28), rng.range(0.85, 1.1));
    }
    for (let a = S.a0 + 14; a < S.a1 - 8; a += 52) {
      if (storeAt(a)) continue;
      const [x, z] = at(S, a + rng.range(-3, 3), 3.2);
      const roll = rng.next();
      if (roll < 0.45) world.addProp('bench', x, KERB, z, yaw + Math.PI, 1);
      else if (roll < 0.75) world.addProp('bin', x, KERB, z, 0, 1);
      else world.addProp('hydrant', x, KERB, z, yaw, 1);
    }
  }

  // ------------------------------------------------------------------ map
  VH.MapPainters = VH.MapPainters || [];
  VH.MapPainters.push((g, layout, o) => {
    const R = o.R;
    for (const S of layout.strips || []) {
      g.fillStyle = o.PAL.pave || '#283042';
      R(S.x0, S.z0, S.x1, S.z1);
      for (const lot of S.lots) {
        const x0 = lot.minX + 0.8;
        const z0 = lot.minZ + 0.8;
        const x1 = lot.maxX - 0.8;
        const z1 = lot.maxZ - 0.8;
        if (lot.kind === 'parking' && !lot.store) {
          g.fillStyle = o.PAL.parking || '#20273a';
          R(x0, z0, x1, z1);
          continue;
        }
        if (lot.store) continue; // stores.js paints its own shops
        const sh = Math.max(0.9, Math.min(3.2, 0.7 + (lot.top || 8) * 0.07));
        g.fillStyle = 'rgba(2, 4, 10, 0.42)';
        R(x0 + 0.7 * sh, z0 + sh, x1 + 0.7 * sh, z1 + sh);
        g.fillStyle = o.PAL.building || '#1a2031';
        R(x0, z0, x1, z1);
      }
    }
  });

  VH.Suburbs = Suburbs;
})();
