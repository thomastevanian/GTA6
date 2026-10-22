/*
 * roadsigns.js — green direction signs and gantries pointing the way to the
 * airport, the army base, Northgate Heights and back downtown.
 *
 *   VH.RoadSigns.build(world, layout)   steel gantries over Grand Avenue and
 *                                       Meridian Boulevard, roadside signs on
 *                                       posts, and a brown sign for the stunt
 *                                       ramps (world build time, after the
 *                                       roadside strips, before signs are
 *                                       painted)
 *
 * The faces are ordinary world.signs in the 'road' style (signs.js paints
 * them); this file adds the steelwork and the colliders. Each sign is
 * checked against what is already standing (lamps, palms, buildings) and
 * slides a few metres along the road, or is left out, if anything is in
 * the way: the strips along these roads are built just before.
 *
 * A face looks along (sin yaw, cos yaw): yaw 0 faces south, so it is read
 * by northbound traffic.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KM = (m) => (m / 1000).toFixed(1) + ' km';

  // Gantry heights (metres): the panel hangs in front of a two-chord beam.
  const PANEL_H = 3;
  const PANEL_Y = 6.85; // centre: 5.35 m clear underneath
  const CHORD_LO = [5.75, 6.05];
  const CHORD_HI = [7.75, 8.15];
  const LEG_TOP = 8.45;
  const FACE_OFF = 0.29; // beam centre line to the panel's centre
  const STEEL = 0x8e959c;
  const FRAME = 0x8a9097; // galvanised backs and posts
  const BROWN = { bg: ['#7a4524', '#5f3519'] };

  /*
   * Gantries. axis: the road's direction ('z' north-south, 'x' east-west);
   * at: where along it; legs: the two leg positions across it (one on the
   * median, one on the far pavement 1.1 m from the kerb); panels: centre
   * across the road and width. Every gantry sits midway between two median
   * palms and clear of the kerbside street lights.
   */
  const GANTRIES = [
    // Northbound Grand Avenue, approaching Northgate Street.
    {
      id: 'G1', axis: 'z', at: -342.9, legs: [1.3, 14.1], yaw: 0,
      panels: [{ c: 6.6, w: 8, lines: ['↑ AIRPORT ✈ | ' + KM(1090), '↑ Northgate Heights', '← Old Market'] }],
    },
    // Southbound Grand Avenue through Northgate Heights, back into town.
    {
      id: 'G2', axis: 'z', at: -420.4, legs: [-1.3, -14.1], yaw: Math.PI,
      panels: [{ c: -6.6, w: 8.4, lines: ['↑ DOWNTOWN', '↑ Oceanview Pier', '→ Old Market', 'Fort Breakwater: Meridian Blvd west'] }],
    },
    // Northbound Grand Avenue at the Airport Road T-junction.
    {
      id: 'G4', axis: 'z', at: -1102.4, legs: [1.3, 14.1], yaw: 0,
      panels: [{ c: 7.4, w: 10, lines: ['← TERMINAL · DEPARTURES ✈', '← Arrivals · Parking', 'Cargo · Hangars · Airside →'] }],
    },
    // Westbound Meridian Boulevard, approaching Cypress Parkway.
    {
      id: 'M1', axis: 'x', at: -340.4, legs: [-0.5, -10.1], yaw: Math.PI / 2,
      panels: [{ c: -5.25, w: 6.6, lines: ['↑ FORT BREAKWATER | ' + KM(760), '↑ Crestline Estates', '→ Old Market'] }],
    },
  ];

  // Roadside signs on two posts, faces only towards the traffic.
  const POSTS = [
    // Southbound Grand Avenue, leaving the airport.
    { id: 'P1', x: -19.5, z: -1122, yaw: Math.PI, w: 4.8, h: 2.4, lines: ['↑ DOWNTOWN | ' + KM(1120), '↑ Northgate Heights | ' + KM(610), 'Fort Breakwater: via Meridian Blvd'] },
    // Eastbound Meridian Boulevard, out of the fort's gate (before the strip's first lot).
    { id: 'P2', x: -1082, z: 12.6, yaw: -Math.PI / 2, w: 4.6, h: 2.4, lines: ['↑ DOWNTOWN | ' + KM(1080), '↑ Crestline Estates | ' + KM(440), 'Airport ✈: via Grand Ave'] },
    // Eastbound Airport Road, before the Grand Avenue junction.
    { id: 'P3', x: -90, z: -1166.6, yaw: -Math.PI / 2, w: 4.4, h: 2.2, lines: ['→ DOWNTOWN · Grand Ave | ' + KM(1170), '→ Northgate Heights | ' + KM(760), '↑ Cargo · Hangars'] },
    // Northbound Grand Avenue, leaving Northgate Heights (on the plaza's edge).
    { id: 'P5', x: 18.2, z: -609.5, yaw: 0, w: 4.4, h: 2.2, lines: ['↑ AIRPORT ✈ | ' + KM(830), '↑ Stunt Park | ' + KM(160)] },
    // Brown tourist sign: the stunt ramps in the north pasture, in the gap between the strips.
    { id: 'P4', x: 16.5, z: -768, yaw: 0, w: 4.4, h: 2, lines: ['→ STUNT PARK', 'North pasture ramps'], colors: BROWN },
  ];

  // What stands in the way. Crowns: how far a tree's leaves reach (gantries clear them).
  const CROWN = { palm: 5.0, palmTall: 5.3, tree: 3.4, treeB: 3.4 };
  const LOW_CROWN = { palm: 0.8, palmTall: 0.8, tree: 2.6, treeB: 2.6 }; // under a post sign's top
  const SLIDE_GANTRY = [0, 1, -1, 2, -2, 3, -3];
  const SLIDE_POST = [0, 2, -2, 4, -4, 6, -6];

  /** An oriented rectangle in the collider's own shape (physics.js). */
  function obb(cx, cz, hx, hz, yaw) {
    return { cx, cz, hx, hz, cos: Math.cos(yaw), sin: Math.sin(yaw) };
  }

  /** Distance from (x, z) to an oriented rectangle (0 inside). */
  function rectDist(o, x, z) {
    const dx = x - o.cx;
    const dz = z - o.cz;
    const lx = dx * o.cos - dz * o.sin;
    const lz = dx * o.sin + dz * o.cos;
    return Math.hypot(Math.max(0, Math.abs(lx) - o.hx), Math.max(0, Math.abs(lz) - o.hz));
  }

  /** Solid colliders (not the road or a kerb) within r of (x, z) between heights y0 and y1. */
  function solidNear(world, x, z, r, y0, y1) {
    const out = [];
    world.physics.query(x - r, z - r, x + r, z + r, (col) => {
      if (!(col.flags & VH.COLLIDE.SOLID) || col.minY >= y1 || col.maxY <= y0) return;
      if (rectDist(col, x, z) < r) out.push(col);
    });
    return out;
  }

  /**
   * Is a sign's footprint clear? `feet`: [x, z, r, top] ground-level
   * footprints (legs, posts); `span`: the panel or beam rectangle with its
   * heights; `crowns`: how far each kind of tree must be kept from it;
   * `lampGap`: how far street lights must be kept from it. Returns what is
   * in the way, or null.
   */
  function blocked(world, feet, span, crowns, lampGap) {
    for (const [x, z, r, top] of feet) {
      const hit = solidNear(world, x, z, r, 0.35, top);
      if (hit.length) return hit[0].propType || hit[0].tag;
    }
    // Sample along the span for anything at its height.
    const n = Math.max(1, Math.ceil(span.hx / 0.5));
    for (let i = -n; i <= n; i++) {
      const u = (i / n) * span.hx;
      const x = span.cx + u * span.cos;
      const z = span.cz - u * span.sin;
      const hit = solidNear(world, x, z, span.hz + 0.15, span.y0, span.y1);
      if (hit.length) return hit[0].propType || hit[0].tag;
    }
    let why = null;
    const reach = Math.max(span.hx, span.hz) + 6;
    world.physics.query(span.cx - reach, span.cz - reach, span.cx + reach, span.cz + reach, (col) => {
      const crown = crowns[col.propType];
      if (!crown || rectDist(span, col.cx, col.cz) >= crown) return true;
      why = col.propType;
      return false;
    });
    if (why) return why;
    for (const l of world.lamps) {
      if (Math.abs(l.x - span.cx) < reach && Math.abs(l.z - span.cz) < reach && rectDist(span, l.x, l.z) < lampGap) return 'streetlight';
    }
    return null;
  }

  /** A box drawn with its underside too (the beam is seen from below). */
  function slab(b, cx, cz, hx, hz, yaw, y0, y1, color) {
    b.orientedBox(cx, cz, hx, hz, yaw, y0, y1, color);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (lx, lz) => [cx + lx * c + lz * s, y0, cz - lx * s + lz * c];
    b.quad(P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz), [0, -1, 0], color);
  }

  // ------------------------------------------------------------ gantries
  function gantryPlan(G, slide) {
    const at = G.at + slide;
    const pt = (across) => (G.axis === 'z' ? [across, at] : [at, across]);
    const A = pt(G.legs[0]);
    const B = pt(G.legs[1]);
    const mx = (A[0] + B[0]) / 2;
    const mz = (A[1] + B[1]) / 2;
    const half = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2;
    const fx = Math.sin(G.yaw);
    const fz = Math.cos(G.yaw);
    // The beam with the panels on its face, as one rectangle.
    const span = obb(mx + fx * 0.1, mz + fz * 0.1, half + 0.3, 0.42, G.yaw);
    span.y0 = PANEL_Y - PANEL_H / 2 - 0.1;
    span.y1 = LEG_TOP + 0.1;
    return { at, pt, A, B, mx, mz, half, fx, fz, span };
  }

  function buildGantry(world, G, plan) {
    const { A, B, mx, mz, half, fx, fz, pt } = plan;
    const yaw = G.yaw;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const steel = VH.col(STEEL);
    const flags = VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS;
    // Legs: a concrete footing, a square steel column and a cap.
    for (const [lx, lz] of [A, B]) {
      const lctx = world.ctxAt(lx, lz);
      lctx.concrete.orientedBox(lx, lz, 0.45, 0.45, yaw, 0, 0.4, VH.col(0xb9b4aa));
      lctx.prop.orientedBox(lx, lz, 0.21, 0.21, yaw, 0.4, LEG_TOP, steel);
      lctx.prop.orientedBox(lx, lz, 0.27, 0.27, yaw, LEG_TOP, LEG_TOP + 0.08, steel);
      world.physics.addOrientedBox(lx, lz, 0.45, 0.45, yaw, -0.2, 0.4, 'sign', flags);
      world.physics.addOrientedBox(lx, lz, 0.22, 0.22, yaw, 0.4, LEG_TOP + 0.08, 'sign', flags);
    }
    // The beam: two chords joined by struts, like a ladder truss.
    const b = world.ctxAt(mx, mz).prop;
    for (const [y0, y1] of [CHORD_LO, CHORD_HI]) slab(b, mx, mz, half, 0.2, yaw, y0, y1, steel);
    const struts = Math.max(2, Math.round((half * 2) / 1.5));
    for (let i = 0; i <= struts; i++) {
      const u = -half + 0.3 + ((half * 2 - 0.6) * i) / struts;
      for (const d of [-0.14, 0.14]) {
        b.orientedBox(mx + u * c + d * s, mz - u * s + d * c, 0.035, 0.035, yaw, CHORD_LO[1], CHORD_HI[0], steel);
      }
    }
    world.physics.addOrientedBox(plan.span.cx, plan.span.cz, plan.span.hx, plan.span.hz, yaw, plan.span.y0, plan.span.y1, 'sign', flags);
    // The panels hang on the face of the beam.
    const signs = world.signs || (world.signs = []);
    for (const p of G.panels) {
      const [px, pz] = pt(p.c);
      signs.push({
        x: px + fx * FACE_OFF, y: PANEL_Y, z: pz + fz * FACE_OFF, yaw, w: p.w, h: PANEL_H,
        lines: p.lines, style: 'road', frame: FRAME,
      });
    }
  }

  // --------------------------------------------------------- post signs
  function postPlan(P, slide) {
    const fx = Math.sin(P.yaw);
    const fz = Math.cos(P.yaw);
    const x = P.x + fx * slide;
    const z = P.z + fz * slide;
    const y = 2.1 + P.h / 2; // 2.1 m clear underneath
    const rx = Math.cos(P.yaw) * P.w * 0.38;
    const rz = -Math.sin(P.yaw) * P.w * 0.38;
    const span = obb(x, z, P.w / 2 + 0.06, 0.1, P.yaw);
    span.y0 = y - P.h / 2 - 0.1;
    span.y1 = y + P.h / 2 + 0.1;
    const feet = [[x - rx, z - rz, 0.3, span.y0], [x + rx, z + rz, 0.3, span.y0]];
    return { x, z, y, span, feet };
  }

  function buildPost(world, P, plan) {
    const signs = world.signs || (world.signs = []);
    const spec = {
      x: plan.x, y: plan.y, z: plan.z, yaw: P.yaw, w: P.w, h: P.h,
      lines: P.lines, style: 'road', posts: true, oneSided: true, frame: FRAME,
    };
    if (P.colors) spec.colors = P.colors;
    signs.push(spec);
    // The posts' colliders are added with the face (world._buildSigns); this covers the panel.
    world.physics.addOrientedBox(plan.x, plan.z, P.w / 2 + 0.06, 0.08, P.yaw, plan.span.y0, plan.span.y1, 'sign', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
  }

  // ================================================================ build
  const RoadSigns = {
    GANTRIES,
    POSTS,

    build(world, layout) {
      const placed = [];
      const skipped = [];
      const place = (def, slides, planFn, check, buildFn) => {
        let why = null;
        for (const slide of slides) {
          const plan = planFn(def, slide);
          why = check(plan);
          if (why) continue;
          buildFn(world, def, plan);
          placed.push({ id: def.id, slide, x: plan.span.cx, z: plan.span.cz, lines: def.lines || def.panels.map((p) => p.lines).flat() });
          return;
        }
        skipped.push({ id: def.id, why });
      };
      for (const G of GANTRIES) {
        place(G, SLIDE_GANTRY, gantryPlan, (pl) => {
          const feet = [[pl.A[0], pl.A[1], 0.6, LEG_TOP], [pl.B[0], pl.B[1], 0.6, LEG_TOP]];
          return blocked(world, feet, pl.span, CROWN, 1.6);
        }, buildGantry);
      }
      for (const P of POSTS) {
        place(P, SLIDE_POST, postPlan, (pl) => blocked(world, pl.feet, pl.span, LOW_CROWN, 0.8), buildPost);
      }
      return { placed, skipped };
    },
  };

  VH.RoadSigns = RoadSigns;
})();
