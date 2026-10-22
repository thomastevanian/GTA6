/*
 * props.js — street furniture and vegetation, drawn with instancing.
 *
 * Each prop type is modelled once (procedurally, in local space, standing
 * at the origin with its "front" along +Z) and then drawn as one
 * InstancedMesh per world chunk. That gives per-chunk frustum culling and
 * a per-type draw distance (benches vanish long before towers' palms do),
 * while thousands of props cost only a few dozen draw calls.
 *
 * Adding a prop registers its collider at the same time, so what you see
 * and what you bump into can't disagree.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const F = () => VH.COLLIDE;

  // ------------------------------------------------------------- modelling
  const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

  // ------------------------------------------------------- vegetation
  // Every tree and palm is one geometry drawn with the shared vegetation
  // material (materials.js): an atlas holding bark, leaf clusters, palm
  // fronds and blossoms. Trunks and branches are smooth tapered tubes with
  // tiled bark; foliage is alpha-tested cards. Per-vertex attributes:
  // position, normal, colour (tint/gradient), uv (atlas), aFlex (wind flutter).
  const V3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm(a) {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };

  class VegBuilder {
    constructor() {
      this.pos = [];
      this.nrm = [];
      this.col = [];
      this.uv = [];
      this.flex = [];
      this.idx = [];
    }

    vert(p, n, c, u, v, f) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(c[0], c[1], c[2]);
      this.uv.push(u, v);
      this.flex.push(f || 0);
      return this.pos.length / 3 - 1;
    }

    tri(a, b, c) {
      this.idx.push(a, b, c);
    }

    /**
     * A smooth tube along `pts` (array of [x,y,z]) with radii `rad` (same length).
     * bark: index into the atlas bark cells (tiled by the shader), or -1 for a flat colour.
     */
    tube(pts, rad, sides, color, bark, tile, flex) {
      const n = pts.length;
      const A = VH.Textures.ATLAS;
      const white = A.rect('white', 8);
      const tans = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(n - 1, i + 1)];
        tans.push(V3.norm(V3.sub(b, a)));
      }
      let nv = Math.abs(tans[0][0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
      const base = this.pos.length / 3;
      const rAvg = (rad[0] + rad[n - 1]) * 0.5;
      const ucount = Math.max(1, Math.round((Math.PI * 2 * rAvg) / (tile || 1.2)));
      let dist = 0;
      for (let i = 0; i < n; i++) {
        const t = tans[i];
        nv = V3.norm(V3.sub(nv, V3.mul(t, V3.dot(nv, t))));
        const bv = V3.cross(t, nv);
        if (i) dist += V3.len(V3.sub(pts[i], pts[i - 1]));
        const c = typeof color === 'function' ? color(i / (n - 1)) : color;
        const f = typeof flex === 'function' ? flex(i / (n - 1)) : flex || 0;
        for (let j = 0; j <= sides; j++) {
          const a = (j / sides) * Math.PI * 2;
          const ox = nv[0] * Math.cos(a) + bv[0] * Math.sin(a);
          const oy = nv[1] * Math.cos(a) + bv[1] * Math.sin(a);
          const oz = nv[2] * Math.cos(a) + bv[2] * Math.sin(a);
          const p = [pts[i][0] + ox * rad[i], pts[i][1] + oy * rad[i], pts[i][2] + oz * rad[i]];
          let u;
          let v;
          if (bark >= 0) {
            u = (j / sides) * ucount;
            v = 100 * (bark + 1) + dist / (tile || 1.2);
          } else {
            u = (white.u0 + white.u1) / 2;
            v = (white.v0 + white.v1) / 2;
          }
          this.vert(p, [ox, oy, oz], c, u, v, f);
        }
      }
      const row = sides + 1;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < sides; j++) {
          const a = base + i * row + j;
          this.tri(a, a + row, a + 1);
          this.tri(a + 1, a + row, a + row + 1);
        }
      }
      return this;
    }

    /** A flat card centred at c, spanned by tangent t and bitangent b (half-sizes folded in). */
    card(c, t, b, n, rect, col, flex, flipU) {
      const p = [
        [c[0] - t[0] - b[0], c[1] - t[1] - b[1], c[2] - t[2] - b[2]],
        [c[0] + t[0] - b[0], c[1] + t[1] - b[1], c[2] + t[2] - b[2]],
        [c[0] + t[0] + b[0], c[1] + t[1] + b[1], c[2] + t[2] + b[2]],
        [c[0] - t[0] + b[0], c[1] - t[1] + b[1], c[2] - t[2] + b[2]],
      ];
      const ua = flipU ? rect.u1 : rect.u0;
      const ub = flipU ? rect.u0 : rect.u1;
      const uvs = [[ua, rect.v0], [ub, rect.v0], [ub, rect.v1], [ua, rect.v1]];
      const ids = p.map((q, i) => this.vert(q, n, col, uvs[i][0], uvs[i][1], flex));
      this.tri(ids[0], ids[1], ids[2]);
      this.tri(ids[0], ids[2], ids[3]);
    }

    /**
     * A ribbon made of rows; each row is { p: [left, centre, right], uv: [[u,v] x3], col, flex }.
     * Normals lean upwards so fronds read as lit from above.
     */
    strip(rows, upBlend) {
      const base = this.pos.length / 3;
      const nr = rows.length;
      for (let i = 0; i < nr; i++) {
        const r = rows[i];
        const nx = rows[Math.min(nr - 1, i + 1)];
        const pv = rows[Math.max(0, i - 1)];
        const across = V3.sub(r.p[2], r.p[0]);
        const along = V3.sub(nx.p[1], pv.p[1]);
        let nn = V3.norm(V3.cross(across, along));
        if (nn[1] < 0) nn = V3.mul(nn, -1);
        nn = V3.norm(V3.lerp(nn, [0, 1, 0], upBlend === undefined ? 0.45 : upBlend));
        for (let k = 0; k < 3; k++) this.vert(r.p[k], nn, r.col, r.uv[k][0], r.uv[k][1], r.flex);
      }
      for (let i = 0; i < nr - 1; i++) {
        const a = base + i * 3;
        const b = a + 3;
        this.tri(a, b, a + 1); this.tri(a + 1, b, b + 1);
        this.tri(a + 1, b + 1, a + 2); this.tri(a + 2, b + 1, b + 2);
      }
    }

    /** A low-poly rounded blob (fruit, coconuts) in a flat colour. */
    blob(c, r, sy, col) {
      const g = VegBuilder.ico || (VegBuilder.ico = new THREE.OctahedronGeometry(1, 0));
      const A = VH.Textures.ATLAS.rect('white', 8);
      const pa = g.attributes.position;
      const base = this.pos.length / 3;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i);
        const y = pa.getY(i);
        const z = pa.getZ(i);
        const l = Math.hypot(x, y, z);
        this.vert([c[0] + x * r, c[1] + y * r * sy, c[2] + z * r], [x / l, y / l, z / l], col, (A.u0 + A.u1) / 2, (A.v0 + A.v1) / 2, 0.1);
      }
      for (let i = 0; i < pa.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
    }

    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
      g.setIndex(this.idx);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }

  const BARK = { oak: 0, palm: 1, date: 2, royal: 3, pine: 4 };

  /** A trunk centre-line with a gentle lean and S-bend; returns points and radii. */
  function trunkPath(rng, height, lean, bend, r0, r1, segs, flare) {
    const pts = [];
    const rad = [];
    const phase = rng.range(0, 6.28);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = lean * Math.pow(t, 1.7) + Math.sin(t * 3.1 + phase) * bend * t;
      const z = Math.cos(t * 2.3 + phase) * bend * 0.6 * t;
      const y = height * (t - 0.04 * t * t);
      pts.push([x, y, z]);
      let r = r0 + (r1 - r0) * t;
      if (flare) r *= 1 + flare * Math.exp(-y / 0.55);
      rad.push(r);
    }
    return { pts, rad };
  }

  /** One pinnate frond arching from `top` at azimuth `az`. */
  function addFrond(b, rng, top, az, L, e0, droop, rectName, cols, o) {
    const A = VH.Textures.ATLAS;
    const R = A.rect(rectName, 1);
    const dx = Math.cos(az);
    const dz = Math.sin(az);
    const side = [-dz, 0, dx];
    const segs = o.segs || 5;
    const width = L * (o.wmul || 0.34);
    const rows = [];
    let p = [top[0], top[1], top[2]];
    let a = e0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      if (i) {
        a = e0 - droop * t * (0.5 + 0.7 * t);
        p = [p[0] + dx * Math.cos(a) * (L / segs), p[1] + Math.sin(a) * (L / segs), p[2] + dz * Math.cos(a) * (L / segs)];
      }
      const phi = (o.fold || 0.35) + 0.65 * t * t + (o.hang || 0) * t;
      const hw = width * 0.5 * (0.9 + 0.1 * Math.sin(Math.PI * t));
      const l = [p[0] + side[0] * hw * Math.cos(phi), p[1] - hw * Math.sin(phi), p[2] + side[2] * hw * Math.cos(phi)];
      const r = [p[0] - side[0] * hw * Math.cos(phi), p[1] - hw * Math.sin(phi), p[2] - side[2] * hw * Math.cos(phi)];
      const u = R.u0 + (R.u1 - R.u0) * t;
      rows.push({
        p: [l, p, r],
        uv: [[u, R.v1], [u, (R.v0 + R.v1) / 2], [u, R.v0]],
        col: VH.colMix(cols[0], cols[1], Math.min(1, t * 1.2)),
        flex: 0.15 + 0.85 * t,
      });
    }
    b.strip(rows, 0.5);
  }

  function addCrownShaft(b, top, h, r, col) {
    const pts = [];
    const rad = [];
    for (let i = 0; i <= 2; i++) {
      pts.push([top[0], top[1] - h + (i / 2) * h, top[2]]);
      rad.push(r * (i === 0 ? 1 : i === 2 ? 0.8 : 1.12));
    }
    b.tube(pts, rad, 8, col, -1);
  }

  const PALM_TYPES = {
    // Queen palm: medium, graceful, dense drooping fronds and orange fruit clusters.
    queen: { h: 8.4, lean: 0.9, bend: 0.25, r0: 0.3, r1: 0.19, bark: BARK.palm, fronds: 14, L: [3.7, 4.6], e0: [0.35, 0.8], droop: [1.1, 1.8], rect: 'frondA', shaft: 1.1, fruit: 'orange', seed: 11 },
    // Royal palm: tall, ramrod straight, smooth grey column and a green crownshaft.
    royal: { h: 12.6, lean: 0.5, bend: 0.1, r0: 0.38, r1: 0.26, bark: BARK.royal, fronds: 11, L: [4.4, 5.4], e0: [0.5, 1.0], droop: [0.9, 1.6], rect: 'frondA', shaft: 1.7, fruit: 'purple', seed: 23, bulge: true },
    // Coconut palm: tall and leaning, long drooping fronds, coconuts.
    coconut: { h: 11.5, lean: 1.9, bend: 0.55, r0: 0.3, r1: 0.17, bark: BARK.palm, fronds: 13, L: [4.0, 5.0], e0: [0.3, 0.75], droop: [1.3, 2.0], rect: 'frondA', shaft: 0, fruit: 'coconut', seed: 31 },
    // Date palm: stocky shaggy trunk with diamond leaf-scars, stiff upright fronds, date bunches.
    date: { h: 7.2, lean: 0.4, bend: 0.2, r0: 0.4, r1: 0.32, bark: BARK.date, fronds: 18, L: [3.6, 4.4], e0: [0.7, 1.25], droop: [0.9, 1.5], rect: 'frondB', shaft: 0, fruit: 'date', seed: 47, wmul: 0.3, fold: 0.5 },
  };

  function palmGeometry(type) {
    const P = PALM_TYPES[type];
    const rng = new VH.RNG(P.seed);
    const b = new VegBuilder();
    const trunk = trunkPath(rng, P.h, P.lean, P.bend, P.r0, P.r1, 8, 0.55);
    if (P.bulge) for (let i = 0; i < trunk.rad.length; i++) trunk.rad[i] *= 1 + 0.12 * Math.sin((i / (trunk.rad.length - 1)) * 3.1);
    const tcol = (t) => [0.78 + 0.22 * t, 0.76 + 0.22 * t, 0.74 + 0.2 * t];
    const sides = 7;
    b.tube(trunk.pts, trunk.rad, sides, tcol, P.bark, 1.0, 0);
    const top = trunk.pts[trunk.pts.length - 1];
    const topR = trunk.rad[trunk.rad.length - 1];
    if (P.shaft) addCrownShaft(b, top, P.shaft, topR * 1.02, VH.col(0x7ba84a));
    // Dome over the trunk top.
    const crown = [top[0], top[1] + 0.25, top[2]];
    b.blob([top[0], top[1] + 0.05, top[2]], topR * 1.25, 0.9, VH.col(0x5d7f3a));
    // Fruit.
    const fc = { orange: VH.col(0xe0782a), purple: VH.col(0x5a3a6a), coconut: VH.col(0x6a8a3a), date: VH.col(0xd9892e) }[P.fruit];
    const nFruit = P.fruit === 'date' ? 3 : P.fruit === 'purple' ? 4 : 5;
    for (let i = 0; i < nFruit; i++) {
      const a = (i / nFruit) * Math.PI * 2 + rng.range(0, 1);
      const rr = topR * 1.1 + rng.range(0.05, 0.3);
      if (P.fruit === 'date') {
        for (let k = 0; k < 3; k++) b.blob([top[0] + Math.cos(a) * (rr + k * 0.05), top[1] - 0.35 - k * 0.18, top[2] + Math.sin(a) * (rr + k * 0.05)], 0.1, 1.4, fc);
      } else {
        b.blob([top[0] + Math.cos(a) * rr, top[1] - 0.25 - rng.range(0, 0.35), top[2] + Math.sin(a) * rr], P.fruit === 'coconut' ? 0.2 : 0.1, 1, fc);
      }
    }
    // Fronds.
    const cA = [[0.7, 0.78, 0.66], [1.15, 1.12, 0.95]];
    for (let i = 0; i < P.fronds; i++) {
      const ring = i % 3; // inner (upright) ring to outer (drooping) ring
      const az = (i / P.fronds) * Math.PI * 2 + rng.range(-0.18, 0.18);
      const L = rng.range(P.L[0], P.L[1]) * (ring === 0 ? 0.85 : 1);
      const e0 = rng.range(P.e0[0], P.e0[1]) + (ring === 0 ? 0.35 : ring === 2 ? -0.18 : 0);
      const droop = rng.range(P.droop[0], P.droop[1]) * (ring === 2 ? 1.12 : 1);
      const k = rng.range(0.9, 1.1);
      const cols = [VH.colMul(cA[0], k), VH.colMul(cA[1], k * (0.95 + 0.1 * rng.next()))];
      addFrond(b, rng, crown, az, L, e0, droop, P.rect, cols, { wmul: P.wmul, fold: P.fold, segs: type === 'date' ? 4 : 5 });
    }
    // A couple of old, drooping brown-green fronds.
    if (type === 'queen' || type === 'coconut') {
      for (let i = 0; i < 2; i++) {
        const az = rng.range(0, 6.28);
        addFrond(b, rng, [top[0], top[1] - 0.2, top[2]], az, rng.range(2.4, 3.1), -0.3, 1.1, P.rect, [[3.0, 1.05, 1.1], [4.2, 1.3, 1.4]], { wmul: 0.26, fold: 0.5 });
      }
    }
    return b.build();
  }

  /** Mexican fan palm: thick shaggy trunk, a ball of stiff fans and a skirt of dead leaves. */
  function fanPalmGeometry() {
    const rng = new VH.RNG(59);
    const b = new VegBuilder();
    const H = 6.6;
    const trunk = trunkPath(rng, H, 0.35, 0.18, 0.34, 0.25, 9, 0.5);
    b.tube(trunk.pts, trunk.rad, 8, (t) => [0.8 + 0.2 * t, 0.78 + 0.2 * t, 0.74 + 0.18 * t], BARK.date, 1.0, 0);
    const top = trunk.pts[trunk.pts.length - 1];
    const R = VH.Textures.ATLAS.rect('fan', 1);
    const mkLeaf = (az, len, e0, droop, col, wmul) => {
      const dx = Math.cos(az);
      const dz = Math.sin(az);
      const rows = [];
      let p = [top[0], top[1] + 0.1, top[2]];
      let a = e0;
      const segs = 3;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        if (i) {
          a = e0 - droop * t;
          p = [p[0] + dx * Math.cos(a) * (len / segs), p[1] + Math.sin(a) * (len / segs), p[2] + dz * Math.cos(a) * (len / segs)];
        }
        const hw = len * wmul * (0.55 + 0.45 * Math.min(1, t * 2.2));
        const droopSide = 0.18 * t * hw;
        const l = [p[0] - dz * hw, p[1] - droopSide, p[2] + dx * hw];
        const r = [p[0] + dz * hw, p[1] - droopSide, p[2] - dx * hw];
        const v = R.v0 + (R.v1 - R.v0) * t;
        rows.push({ p: [l, p, r], uv: [[R.u0, v], [(R.u0 + R.u1) / 2, v], [R.u1, v]], col: VH.colMul(col, 0.92 + 0.08 * t), flex: 0.2 + 0.8 * t });
      }
      b.strip(rows, 0.5);
    };
    const n = 17;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const ring = i % 3;
      mkLeaf(az, rng.range(2.3, 2.9) * (ring === 0 ? 0.85 : 1), ring === 0 ? 0.95 : ring === 1 ? 0.55 : 0.2, ring === 2 ? 1.1 : 0.9, VH.colMul([1.0, 1.0, 0.95], rng.range(0.9, 1.1)), 0.46);
    }
    // The dead-leaf skirt hanging below the crown.
    for (let i = 0; i < 7; i++) {
      const az = (i / 7) * Math.PI * 2 + rng.range(0, 0.8);
      mkLeaf(az, rng.range(1.6, 2.2), -0.2 - rng.range(0, 0.4), 1.0, VH.colMul([4.5, 1.1, 1.6], rng.range(0.8, 1)), 0.4);
    }
    return b.build();
  }

  // ---- broadleaf trees -------------------------------------------------
  function leafCardsAround(b, rng, center, rx, ry, count, sizeRange, rectName, colFn, tips, opts) {
    const R = VH.Textures.ATLAS.rect(rectName, 1.5);
    for (let i = 0; i < count; i++) {
      let c;
      if (tips && tips.length && rng.chance(opts && opts.tipBias !== undefined ? opts.tipBias : 0.45)) {
        const tp = tips[rng.int(0, tips.length - 1)];
        c = [tp[0] + rng.range(-1.2, 1.2), tp[1] + rng.range(-0.7, 1.0), tp[2] + rng.range(-1.2, 1.2)];
      } else {
        let v = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
        if (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] < 0.01) v = [0.5, 0.5, 0.5];
        v = V3.norm(v);
        if (v[1] < 0) v[1] *= 0.55;
        const f = 0.55 + 0.45 * Math.sqrt(rng.next());
        c = [center[0] + v[0] * rx * f, center[1] + v[1] * ry * f, center[2] + v[2] * rx * f];
      }
      const rel = [(c[0] - center[0]) / rx, (c[1] - center[1]) / ry, (c[2] - center[2]) / rx];
      const radial = Math.min(1, V3.len(rel));
      let out = V3.norm([rel[0], rel[1] * 0.8, rel[2]]);
      if (radial < 0.05) out = [0, 1, 0];
      let n = V3.norm(V3.add(V3.mul(out, 0.55), [rng.range(-0.55, 0.55), rng.range(-0.45, 0.65), rng.range(-0.55, 0.55)]));
      if (V3.dot(n, out) < 0.1) n = V3.norm(V3.add(n, V3.mul(out, 0.8)));
      let t = V3.cross(n, [0, 1, 0]);
      if (V3.len(t) < 0.2) t = [1, 0, 0];
      t = V3.norm(t);
      let bt = V3.cross(n, t);
      const phi = rng.range(0, 6.28);
      const t2 = V3.add(V3.mul(t, Math.cos(phi)), V3.mul(bt, Math.sin(phi)));
      const b2 = V3.add(V3.mul(t, -Math.sin(phi)), V3.mul(bt, Math.cos(phi)));
      const s = rng.range(sizeRange[0], sizeRange[1]) * (1 - 0.18 * (1 - radial));
      const shadeN = V3.norm(V3.add(V3.mul(out, 0.8), V3.mul(n, 0.2)));
      const col = colFn(radial, rel[1], rng);
      b.card(c, V3.mul(t2, s * 0.5), V3.mul(b2, s * 0.5), shadeN, R, col, 0.35 + 0.65 * radial, rng.chance(0.5));
    }
  }

  function broadleafGeometry(seed, o) {
    const rng = new VH.RNG(seed);
    const b = new VegBuilder();
    const trunkH = o.trunkH;
    const trunk = trunkPath(rng, trunkH, o.lean, 0.3, 0.27, 0.13, 7, 0.9);
    const bark = VH.col(0xffffff, 0.85);
    b.tube(trunk.pts, trunk.rad, 8, bark, BARK.oak, 1.2, 0);
    const crown = [o.lean * 0.5, o.crownY, 0];
    const tips = [];
    const nb = rng.int(o.branches[0], o.branches[1]);
    for (let i = 0; i < nb; i++) {
      const t = rng.range(0.5, 0.92);
      const idx = Math.min(trunk.pts.length - 1, Math.floor(t * (trunk.pts.length - 1)));
      const s = trunk.pts[idx];
      const az = (i / nb) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const el = rng.range(0.35, 0.95);
      const len = rng.range(o.branchLen[0], o.branchLen[1]);
      const dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const pts = [];
      const rad = [];
      for (let k = 0; k <= 4; k++) {
        const f = k / 4;
        pts.push([s[0] + dir[0] * len * f, s[1] + dir[1] * len * f + 0.18 * len * f * f, s[2] + dir[2] * len * f]);
        rad.push(Math.max(0.025, trunk.rad[idx] * 0.55 * (1 - f * 0.85)));
      }
      b.tube(pts, rad, 4, bark, BARK.oak, 1.0, 0);
      tips.push(pts[4]);
    }
    const colFn = (radial, ry, r) => {
      const k = (0.62 + 0.4 * radial + 0.18 * ry) * r.range(0.88, 1.12);
      const j = r.range(-1, 1) * 0.07;
      const c = o.tint;
      return [c[0] * k * (1 + j), c[1] * k, c[2] * k * (1 - j)];
    };
    leafCardsAround(b, rng, crown, o.rx, o.ry, o.cards, o.size, o.leaf || 'oak', colFn, tips, { tipBias: o.tipBias });
    if (o.bloom) {
      const bc = (radial, ry, r) => {
        const c = o.bloom.color;
        const k = r.range(0.85, 1.1);
        return [c[0] * k, c[1] * k, c[2] * k];
      };
      leafCardsAround(b, rng, crown, o.rx * 1.02, o.ry * 1.02, o.bloom.cards, o.bloom.size, o.bloom.rect, bc, tips, { tipBias: 0.2 });
    }
    return b.build();
  }

  function pineGeometry(seed) {
    const rng = new VH.RNG(seed);
    const b = new VegBuilder();
    const H = 8.8;
    const trunk = trunkPath(rng, H, 0.25, 0.15, 0.24, 0.05, 8, 0.6);
    b.tube(trunk.pts, trunk.rad, 7, VH.col(0xffffff, 0.8), BARK.pine, 1.0, 0);
    const R = VH.Textures.ATLAS.rect('pine', 1.5);
    const levels = 11;
    for (let lv = 0; lv < levels; lv++) {
      const t = lv / (levels - 1);
      const y = 2.0 + t * (H - 2.4);
      const reach = 3.0 * (1 - t) + 0.9;
      const cnt = Math.round(8 - t * 3);
      const rot = rng.range(0, 6.28);
      for (let k = 0; k < cnt; k++) {
        const az = rot + (k / cnt) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const dx = Math.cos(az);
        const dz = Math.sin(az);
        const sz = reach * rng.range(0.85, 1.1);
        const droop = 0.35 + 0.15 * (1 - t);
        // Spray lies along (dx,dz), tilting down; its stem is the card's long axis.
        const tilt = [dx * Math.cos(droop), -Math.sin(droop), dz * Math.cos(droop)];
        const c = [dx * sz * 0.5 * Math.cos(droop), y - Math.sin(droop) * sz * 0.5, dz * sz * 0.5 * Math.cos(droop)];
        const side = [-dz, 0, dx];
        let n = V3.norm(V3.cross(side, tilt));
        if (n[1] < 0) n = V3.mul(n, -1);
        const shade = V3.norm(V3.add(V3.mul(n, 0.4), V3.norm([dx, 0.7, dz])));
        const k2 = (0.55 + 0.5 * t + rng.range(0, 0.18));
        // Card: t axis along side, b axis along the spray stem (bottom of the texture at the trunk).
        b.card(c, V3.mul(side, sz * 0.5), V3.mul(tilt, sz * 0.5), shade, R, [0.75 * k2, 0.95 * k2, 0.7 * k2], 0.3 + 0.7 * (1 - t) * 0.6, rng.chance(0.5));
      }
    }
    // Leader tuft.
    for (let k = 0; k < 2; k++) {
      const az = k * Math.PI * 0.5;
      const side = [Math.cos(az), 0, Math.sin(az)];
      b.card([trunk.pts[8][0], H - 0.5, trunk.pts[8][2]], V3.mul(side, 0.6), [0, 1.1, 0], [0, 1, 0], R, [0.6, 0.78, 0.55], 0.5, false);
    }
    return b.build();
  }

  function cypressGeometry(seed) {
    const rng = new VH.RNG(seed);
    const b = new VegBuilder();
    b.tube([[0, -0.1, 0], [0, 1.2, 0]], [0.16, 0.12], 6, VH.col(0xffffff, 0.6), BARK.pine, 1.0, 0);
    const colFn = (radial, ry, r) => {
      const k = (0.55 + 0.35 * radial + 0.1 * ry) * r.range(0.85, 1.1);
      return [0.62 * k, 0.86 * k, 0.6 * k];
    };
    // A slim ellipsoid of dense small-leaf cards.
    leafCardsAround(b, rng, [0, 4.4, 0], 1.25, 4.1, 46, [1.2, 1.9], 'bush', colFn, null, null);
    return b.build();
  }

  function bushGeometry(seed, o) {
    const rng = new VH.RNG(seed);
    const b = new VegBuilder();
    const colFn = (radial, ry, r) => {
      const k = (0.62 + 0.4 * radial + 0.2 * ry) * r.range(0.88, 1.1);
      const c = o.tint;
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    leafCardsAround(b, rng, [0, o.y, 0], o.rx, o.ry, o.cards, o.size, 'bush', colFn, null, null);
    if (o.bloom) {
      const bc = (radial, ry, r) => {
        const c = o.bloom;
        const k = r.range(0.85, 1.1);
        return [c[0] * k, c[1] * k, c[2] * k];
      };
      leafCardsAround(b, rng, [0, o.y, 0], o.rx * 1.05, o.ry * 1.05, 10, [0.45, 0.65], 'bloom2', bc, null, null);
    }
    return b.build();
  }

  const OAK_TINT = [0.9, 1.0, 0.82];
  function treeGeometry(seed, variant) {
    switch (variant) {
      case 'oakB':
        return broadleafGeometry(seed, { trunkH: 3.0, lean: -0.35, crownY: 4.6, rx: 3.2, ry: 2.5, cards: 66, size: [1.5, 2.3], branches: [5, 7], branchLen: [1.6, 3.0], tint: [0.95, 1.0, 0.78], tipBias: 0.5 });
      case 'flower':
        return broadleafGeometry(seed, { trunkH: 2.8, lean: 0.3, crownY: 4.5, rx: 3.0, ry: 2.3, cards: 46, size: [1.4, 2.1], branches: [4, 6], branchLen: [1.4, 2.6], tint: [0.88, 1.0, 0.8], bloom: { cards: 44, size: [1.3, 1.9], rect: 'bloom', color: VH.col(0xff7aa8) } });
      case 'flowerB':
        return broadleafGeometry(seed, { trunkH: 3.2, lean: -0.2, crownY: 4.7, rx: 3.1, ry: 2.4, cards: 50, size: [1.4, 2.2], branches: [4, 6], branchLen: [1.5, 2.8], tint: [0.8, 1.0, 0.85], bloom: { cards: 40, size: [1.3, 1.9], rect: 'bloom', color: VH.col(0xa07ae8) } });
      default:
        return broadleafGeometry(seed, { trunkH: 3.4, lean: 0.3, crownY: 4.7, rx: 3.1, ry: 2.5, cards: 64, size: [1.6, 2.4], branches: [4, 6], branchLen: [1.5, 2.8], tint: OAK_TINT, tipBias: 0.45 });
    }
  }

  function shrubGeometry(seed) {
    return bushGeometry(seed, { y: 1.0, rx: 0.95, ry: 0.55, cards: 16, size: [0.8, 1.2], tint: [0.9, 1.0, 0.82], bloom: seed % 2 ? VH.col(0xff9ab8) : null });
  }

  function streetlightGeometry() {
    const b = new VH.GeometryBuilder();
    const metal = VH.col(0x3b4046);
    b.box(-0.22, 0, -0.22, 0.22, 0.7, 0.22, VH.col(0x2d3136));
    b.cylinder(0, 0.7, 0, 0.1, 0.07, 7.6, 8, metal, true);
    // Arm reaching out over the road (+Z), then the lamp head.
    b.box(-0.05, 8.05, 0, 0.05, 8.17, 2.3, metal);
    b.box(-0.2, 7.92, 1.75, 0.2, 8.14, 2.6, VH.col(0x2a2e33));
    return b.build();
  }

  function streetlightBulbGeometry() {
    const b = new VH.GeometryBuilder();
    b.box(-0.15, 7.88, 1.85, 0.15, 7.92, 2.5, VH.col(0xffffff), { bottom: true });
    return b.build();
  }

  function signalGeometry(arm) {
    const b = new VH.GeometryBuilder();
    const metal = VH.col(0x4a4f55);
    const yellow = VH.col(0x2b2f34);
    b.box(-0.25, 0, -0.25, 0.25, 0.5, 0.25, VH.col(0x33373c));
    b.cylinder(0, 0.5, 0, 0.14, 0.11, 5.9, 8, metal, true);
    b.box(-0.07, 5.85, 0, 0.07, 6.0, arm, metal);
    // Signal head hanging from the arm, lamps facing +X.
    b.box(-0.18, 4.75, arm - 0.8, 0.18, 5.85, arm - 0.4, yellow);
    // Backplate.
    b.box(-0.2, 4.65, arm - 0.92, -0.16, 5.95, arm - 0.28, VH.col(0x1a1c1f));
    // A second head on the pole at eye height for the near side.
    b.box(-0.16, 2.3, -0.2, 0.16, 3.2, 0.2, yellow);
    return b.build();
  }

  /** Where the red / amber / green lamps sit on a signal (local space). */
  function signalLampOffsets(arm) {
    const z = arm - 0.6;
    return [
      { color: 'red', pos: [0.19, 5.58, z] },
      { color: 'amber', pos: [0.19, 5.3, z] },
      { color: 'green', pos: [0.19, 5.02, z] },
      { color: 'red', pos: [0.17, 3.0, 0] },
      { color: 'amber', pos: [0.17, 2.75, 0] },
      { color: 'green', pos: [0.17, 2.5, 0] },
    ];
  }

  function benchGeometry() {
    const b = new VH.GeometryBuilder();
    const wood = VH.col(0x8a5a35);
    const metal = VH.col(0x2e3236);
    for (const x of [-0.8, 0.8]) {
      b.box(x - 0.05, 0, -0.25, x + 0.05, 0.45, 0.2, metal);
      b.box(x - 0.05, 0.45, -0.27, x + 0.05, 0.9, -0.2, metal);
    }
    for (let i = 0; i < 3; i++) b.box(-0.95, 0.43, -0.22 + i * 0.15, 0.95, 0.47, -0.1 + i * 0.15, wood, { bottom: true });
    for (let i = 0; i < 2; i++) b.box(-0.95, 0.58 + i * 0.16, -0.27, 0.95, 0.7 + i * 0.16, -0.23, wood);
    return b.build();
  }

  function binGeometry() {
    const b = new VH.GeometryBuilder();
    b.cylinder(0, 0, 0, 0.3, 0.32, 0.9, 10, VH.col(0x2f4a3a), false);
    b.cylinder(0, 0.9, 0, 0.34, 0.2, 0.12, 10, VH.col(0x1e2a23), true);
    return b.build();
  }

  function hydrantGeometry() {
    const b = new VH.GeometryBuilder();
    const red = VH.col(0xb8322a);
    b.cylinder(0, 0, 0, 0.17, 0.17, 0.08, 8, red, false);
    b.cylinder(0, 0.08, 0, 0.13, 0.12, 0.5, 8, red, false);
    b.cylinder(0, 0.58, 0, 0.14, 0.05, 0.14, 8, red, true);
    b.box(-0.24, 0.36, -0.05, 0.24, 0.46, 0.05, VH.col(0xc9c2b0));
    return b.build();
  }

  function bollardGeometry() {
    const b = new VH.GeometryBuilder();
    b.cylinder(0, 0, 0, 0.11, 0.1, 0.72, 8, VH.col(0x34383d), false);
    b.cylinder(0, 0.72, 0, 0.1, 0.1, 0.07, 8, VH.col(0xd9c24a), false);
    b.cylinder(0, 0.79, 0, 0.1, 0.02, 0.08, 8, VH.col(0x34383d), true);
    return b.build();
  }

  function dumpsterGeometry() {
    const b = new VH.GeometryBuilder();
    const green = VH.col(0x2f5a3c);
    b.box(-0.95, 0.12, -0.6, 0.95, 1.15, 0.6, green);
    b.box(-1.0, 1.15, -0.66, 1.0, 1.22, 0.66, VH.col(0x243a2b));
    for (const x of [-0.8, 0.8]) for (const z of [-0.45, 0.45]) b.box(x - 0.06, 0, z - 0.06, x + 0.06, 0.12, z + 0.06, VH.col(0x222222));
    return b.build();
  }

  function planterGeometry() {
    const b = new VH.GeometryBuilder();
    b.box(-1.0, 0, -1.0, 1.0, 0.7, 1.0, VH.col(0xb9b2a4), { top: VH.col(0x4a3a2a) });
    return b.build();
  }

  function beaconGeometry() {
    const g = new THREE.IcosahedronGeometry(0.45, 1);
    return g;
  }

  function barrierGeometry() {
    const b = new VH.GeometryBuilder();
    const white = VH.col(0xe8e8e8);
    const red = VH.col(0xc0392b);
    for (const x of [-1.6, 1.6]) b.box(x - 0.06, 0, -0.06, x + 0.06, 1.1, 0.06, VH.col(0x777777));
    for (let i = 0; i < 6; i++) {
      const x0 = -1.8 + i * 0.6;
      b.box(x0, 0.75, -0.04, x0 + 0.6, 1.05, 0.04, i % 2 ? white : red);
    }
    return b.build();
  }

  // The world asks for 'palm', 'tree' and so on; the species is picked here from the
  // position, so avenues and parks mix queen, fan and date palms, oaks and flowering
  // trees without every caller (or chunk batch count) having to know.
  const VARIANTS = {
    palm: [['palm', 0.5], ['palmFan', 0.75], ['palmDate', 1]],
    palmTall: [['palmTall', 0.65], ['palmCoconut', 1]],
    tree: [['tree', 0.58], ['treeFlower', 0.78], ['treeFlowerB', 1]],
    treeB: [['treeB', 0.8], ['treeFlowerB', 1]],
  };
  function pickVariant(type, x, z) {
    const list = VARIANTS[type];
    if (!list) return type;
    const h = Math.abs(Math.sin(Math.round(x * 4) * 12.9898 + Math.round(z * 4) * 78.233) * 43758.5453) % 1;
    for (const [name, upTo] of list) if (h < upTo) return name;
    return type;
  }

  // ------------------------------------------------------------- catalogue
  /**
   * Prop definitions. parts: what to draw (geometry key + material key);
   * collider: footprint registered with the collision world; maxDistance:
   * beyond this (scaled by the prop density setting) the chunk's instances
   * are hidden.
   */
  function defineProps(materials) {
    const M = materials;
    const defs = {
      streetlight: {
        parts: [
          { geo: streetlightGeometry(), mat: M.prop, shadow: true },
          { geo: streetlightBulbGeometry(), mat: M.lampGlow, shadow: false },
        ],
        collider: { r: 0.2, h: 8 }, maxDistance: 420,
      },
      signal6: {
        parts: [{ geo: signalGeometry(6.2), mat: M.prop, shadow: true }],
        lamps: signalLampOffsets(6.2), collider: { r: 0.25, h: 6 }, maxDistance: 380,
      },
      signal11: {
        parts: [{ geo: signalGeometry(11.5), mat: M.prop, shadow: true }],
        lamps: signalLampOffsets(11.5), collider: { r: 0.25, h: 6 }, maxDistance: 380,
      },
      palm: {
        parts: [{ geo: palmGeometry('queen'), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.28, h: 6 }, maxDistance: 700, tint: 'palm',
      },
      palmFan: {
        parts: [{ geo: fanPalmGeometry(), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.32, h: 5 }, maxDistance: 600, tint: 'palm',
      },
      palmDate: {
        parts: [{ geo: palmGeometry('date'), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.36, h: 5 }, maxDistance: 650, tint: 'palm',
      },
      palmTall: {
        parts: [{ geo: palmGeometry('royal'), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 8 }, maxDistance: 800, tint: 'palm',
      },
      palmCoconut: {
        parts: [{ geo: palmGeometry('coconut'), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.28, h: 8 }, maxDistance: 800, tint: 'palm',
      },
      tree: {
        parts: [{ geo: treeGeometry(5, "oak"), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 3 }, maxDistance: 650, canopy: true, tint: 'tree',
      },
      treeB: {
        parts: [{ geo: treeGeometry(77, "oakB"), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 3 }, maxDistance: 650, canopy: true, tint: 'tree',
      },
      treeFlower: {
        parts: [{ geo: treeGeometry(131, "flower"), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 3 }, maxDistance: 650, canopy: true, tint: 'tree',
      },
      treeFlowerB: {
        parts: [{ geo: treeGeometry(171, "flowerB"), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 3 }, maxDistance: 650, canopy: true, tint: 'tree',
      },
      pine: {
        parts: [{ geo: pineGeometry(9), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 4 }, maxDistance: 700, tint: 'tree',
      },
      cypress: {
        parts: [{ geo: cypressGeometry(3), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.4, h: 4 }, maxDistance: 600, tint: 'tree',
      },
      bush: {
        parts: [{ geo: bushGeometry(21, { y: 0.8, rx: 1.2, ry: 0.75, cards: 22, size: [0.9, 1.4], tint: [0.9, 1.0, 0.82], bloom: null }), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.7, h: 1.2 }, maxDistance: 320, tint: 'tree',
      },
      bushFlower: {
        parts: [{ geo: bushGeometry(34, { y: 0.8, rx: 1.15, ry: 0.7, cards: 18, size: [0.9, 1.3], tint: [0.88, 1.0, 0.8], bloom: VH.col(0xff6f9a) }), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true }],
        collider: { r: 0.7, h: 1.2 }, maxDistance: 320, tint: 'tree',
      },
      bench: {
        parts: [{ geo: benchGeometry(), mat: M.propMatte, shadow: true }],
        collider: { hx: 0.95, hz: 0.28, h: 0.5 }, maxDistance: 160,
      },
      bin: {
        parts: [{ geo: binGeometry(), mat: M.propMatte, shadow: true }],
        collider: { r: 0.32, h: 1.0 }, maxDistance: 140,
      },
      hydrant: {
        parts: [{ geo: hydrantGeometry(), mat: M.prop, shadow: false }],
        collider: { r: 0.18, h: 0.7 }, maxDistance: 120,
      },
      bollard: {
        parts: [{ geo: bollardGeometry(), mat: M.prop, shadow: false }],
        collider: { r: 0.12, h: 0.85 }, maxDistance: 140,
      },
      dumpster: {
        parts: [{ geo: dumpsterGeometry(), mat: M.propMatte, shadow: true }],
        collider: { hx: 1.0, hz: 0.66, h: 1.22, camera: true }, maxDistance: 220,
      },
      planter: {
        parts: [
          { geo: planterGeometry(), mat: M.propMatte, shadow: true },
          { geo: shrubGeometry(3), mat: M.vegetation || M.foliage, depth: M.vegetationDepth || M.foliageDepth, shadow: true },
        ],
        collider: { hx: 1.0, hz: 1.0, h: 0.7 }, maxDistance: 260,
      },
      barrier: {
        parts: [{ geo: barrierGeometry(), mat: M.prop, shadow: true }],
        collider: { hx: 1.8, hz: 0.1, h: 1.1 }, maxDistance: 260,
      },
      beacon: {
        parts: [{ geo: beaconGeometry(), mat: M.beacon, shadow: false }],
        collider: null, maxDistance: 5000,
      },
    };
    return defs;
  }

  // ------------------------------------------------------------ the system
  class PropSystem {
    constructor(materials, physics, settings) {
      this.materials = materials;
      this.physics = physics;
      this.settings = settings;
      this.defs = defineProps(materials);
      this.pending = new Map(); // chunkKey → type → [instances]
      this.meshes = []; // { mesh, type, center, radius }
      this.signalLamps = []; // { mesh, entries: [{index, group, color}] }
      this.batches = new Map(); // "chunk|type" → the InstancedMeshes drawing it
      this.canopies = []; // street trees, hidden while the camera is in their leaves
      this.count = 0;
      this._cullTimer = 0;
    }

    /**
     * Place a prop. `chunk` is the world chunk key. `group` is only used by
     * traffic signals ('ns' or 'ew').
     */
    add(chunk, type, x, y, z, yaw, scale, group) {
      const orig = type;
      type = pickVariant(type, x, z);
      const def = this.defs[type];
      if (!def) {
        console.warn('[props] unknown prop type', type);
        return;
      }
      let byType = this.pending.get(chunk);
      if (!byType) this.pending.set(chunk, (byType = new Map()));
      let list = byType.get(type);
      if (!list) byType.set(type, (list = []));
      const s = scale || 1;
      list.push({ x, y, z, yaw: yaw || 0, s, group });
      this.count++;

      const c = def.collider;
      if (c) {
        const flags = c.camera ? F().ALL : F().SOLID | F().SHOTS;
        let col;
        if (c.r) col = this.physics.addOrientedBox(x, z, c.r * s, c.r * s, yaw || 0, y - 0.2, y + c.h * s, 'prop', flags);
        else col = this.physics.addOrientedBox(x, z, c.hx * s, c.hz * s, yaw || 0, y - 0.2, y + c.h * s, 'prop', flags);
        // Remember which instance this is, so a car can knock it over (vehicles.js).
        col.propType = orig; // what the world asked for (roadsigns.js reasons about it)
        col.propVariant = type; // the model actually drawn
        col.propKey = chunk + '|' + type;
        col.propIndex = list.length - 1;
        col.propItem = list[list.length - 1];
      }
    }

    /**
     * A car hit this prop: hide its instance(s) and hand it to the effects
     * system as tumbling debris. `col` is the prop's collider.
     */
    smash(col, vehicle) {
      const meshes = this.batches.get(col.propKey);
      if (!meshes) return;
      const it = col.propItem;
      const def = this.defs[col.propVariant || col.propType];
      const hidden = PropSystem._zero || (PropSystem._zero = new THREE.Matrix4().makeScale(0, 0, 0));
      for (const mesh of meshes) {
        mesh.setMatrixAt(col.propIndex, hidden);
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (VH.game && VH.game.fx) VH.game.fx.propDebris(def.parts, it, vehicle, col.propVariant || col.propType);
    }

    /** Turn everything placed so far into instanced meshes, added to each chunk's group. */
    build(chunkGroups) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const sc = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      for (const [chunk, byType] of this.pending) {
        const group = chunkGroups.get(chunk);
        if (!group) continue;
        for (const [type, list] of byType) {
          const def = this.defs[type];
          // Bounding sphere of this batch, for distance culling.
          let cx = 0, cz = 0;
          for (const it of list) {
            cx += it.x;
            cz += it.z;
          }
          cx /= list.length;
          cz /= list.length;
          let radius = 0;
          for (const it of list) radius = Math.max(radius, Math.hypot(it.x - cx, it.z - cz));
          for (const part of def.parts) {
            const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
            list.forEach((it, i) => {
              q.setFromAxisAngle(yAxis, it.yaw);
              p.set(it.x, it.y, it.z);
              sc.set(it.s, it.s, it.s);
              m.compose(p, q, sc);
              mesh.setMatrixAt(i, m);
              if (def.canopy) this.canopies.push({ mesh, i, x: it.x, y: it.y, z: it.z, s: it.s, mat: m.clone(), hidden: false });
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (def.tint) {
              // Per-instance colour variation (brightness and a little hue) so a row of
              // identical trees does not look stamped out.
              const tc = new THREE.Color();
              list.forEach((it, i) => {
                const h1 = Math.abs(Math.sin(it.x * 7.13 + it.z * 3.71) * 9631.7) % 1;
                const h2 = Math.abs(Math.sin(it.x * 2.17 + it.z * 11.3) * 5321.9) % 1;
                const k = 0.86 + h1 * 0.26;
                const j = (h2 - 0.5) * (def.tint === 'tree' ? 0.22 : 0.1);
                tc.setRGB(k * (1 + j), k, k * (1 - j * 1.3));
                mesh.setColorAt(i, tc);
              });
              if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
            mesh.castShadow = !!part.shadow;
            mesh.receiveShadow = true;
            if (part.depth) mesh.customDepthMaterial = part.depth;
            mesh.computeBoundingSphere();
            mesh.name = 'props:' + type;
            group.add(mesh);
            const key = chunk + '|' + type;
            if (!this.batches.has(key)) this.batches.set(key, []);
            this.batches.get(key).push(mesh);
            this.meshes.push({ mesh, def, cx, cz, radius: radius + 15 });
          }
          if (def.lamps) this._buildSignalLamps(group, def, list, cx, cz, radius + 15);
        }
      }
      this.pending.clear();
    }

    _buildSignalLamps(group, def, list, cx, cz, radius) {
      const lampGeo = this._lampGeo || (this._lampGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10).rotateZ(Math.PI / 2));
      const count = list.length * def.lamps.length;
      const mesh = new THREE.InstancedMesh(lampGeo, this.materials.signalLamp, count);
      const m = new THREE.Matrix4();
      const local = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const entries = [];
      let i = 0;
      for (const it of list) {
        q.setFromAxisAngle(yAxis, it.yaw);
        const base = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
        for (const lamp of def.lamps) {
          local.makeTranslation(lamp.pos[0], lamp.pos[1], lamp.pos[2]);
          m.multiplyMatrices(base, local);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, PropSystem.LAMP_OFF[lamp.color]);
          entries.push({ index: i, group: it.group, color: lamp.color });
          i++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = 'props:signal-lamps';
      group.add(mesh);
      this.signalLamps.push({ mesh, entries });
      this.meshes.push({ mesh, def, cx, cz, radius });
    }

    /** Light the lamps: states = { ns: 'green'|'amber'|'red', ew: ... }. */
    setSignalState(states) {
      for (const batch of this.signalLamps) {
        for (const e of batch.entries) {
          const on = states[e.group] === e.color;
          batch.mesh.setColorAt(e.index, on ? PropSystem.LAMP_ON[e.color] : PropSystem.LAMP_OFF[e.color]);
        }
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      }
    }

    /** Hide batches that are further away than their type's draw distance. */
    /**
     * A tree whose leaves the camera is inside is hidden (otherwise the whole
     * screen goes dark green next to a street tree). The canopy is roughly
     * an ellipsoid 3.8 m wide and 2.9 m tall around 4.7 m up, times the scale.
     */
    _cullCanopies(c) {
      let changed = null;
      for (const t of this.canopies) {
        const dx = c.x - t.x;
        const dz = c.z - t.z;
        const R = 3.5 * t.s;
        let inside = false;
        // (A camera below the lowest leaves, walking under the tree, leaves it alone.)
        if (Math.abs(dx) < R && Math.abs(dz) < R && c.y > t.y + 2.1 * t.s) {
          const dy = c.y - (t.y + 4.5 * t.s);
          const k = (dx * dx + dz * dz) / (R * R) + (dy * dy) / (2.5 * t.s * 2.5 * t.s);
          inside = k < (t.hidden ? 1.15 : 1);
        }
        if (inside === t.hidden) continue;
        t.hidden = inside;
        t.mesh.setMatrixAt(t.i, inside ? ZERO_MATRIX : t.mat);
        t.mesh.instanceMatrix.needsUpdate = true;
        changed = true;
      }
      return changed;
    }

    update(dt, camPos) {
      if (this.canopies.length) this._cullCanopies(camPos);
      this._cullTimer -= dt;
      if (this._cullTimer > 0) return;
      this._cullTimer = 0.25;
      const density = this.settings.get('graphics.propDensity') || 1;
      for (const entry of this.meshes) {
        const d = Math.hypot(camPos.x - entry.cx, camPos.z - entry.cz) - entry.radius;
        entry.mesh.visible = d < entry.def.maxDistance * density;
      }
    }

    get visibleBatches() {
      let n = 0;
      for (const e of this.meshes) if (e.mesh.visible) n++;
      return n;
    }
  }

  PropSystem.init = function initLampColours() {
    const c = (r, g, b) => new THREE.Color(r, g, b);
    PropSystem.LAMP_ON = { red: c(3.2, 0.12, 0.06), amber: c(3.0, 1.3, 0.05), green: c(0.1, 2.6, 0.9) };
    PropSystem.LAMP_OFF = { red: c(0.08, 0.01, 0.01), amber: c(0.08, 0.05, 0.0), green: c(0.0, 0.06, 0.03) };
  };

  VH.PropSystem = PropSystem;
})();
