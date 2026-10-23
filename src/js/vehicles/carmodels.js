/*
 * vehicles/carmodels.js — procedurally modelled cars. Nothing is loaded from files.
 *
 *   VH.CarModels.TYPES        { id: spec } for every vehicle type
 *   VH.CarModels.list()       the type ids
 *   VH.CarModels.build(id, { color, seed, lod })  → CarModel
 *
 * Local frame: the car faces +Z, +X is the car's LEFT, +Y is up, the origin is
 * the centre of the footprint at ground level and the tyres touch y = 0.
 *
 * How a body is made
 *   A side profile (a closed contour in the z–y plane, with the wheel arches cut
 *   out as arcs) is extruded across the width by a custom extruder that rounds
 *   every edge with a true quarter-round bevel and analytic normals. The side
 *   caps are re-triangulated into small triangles so the body can then be bent:
 *   plan-view taper and rounded nose and tail, tumblehome, fender peaks. Normals
 *   follow the bend through the deformation's Jacobian, so reflections stay
 *   smooth. The glasshouse is a second, narrower extrusion.
 *   Lamps, grilles, glass, plates, seams and decals are "patches": small grids
 *   ray-cast onto the finished body so they hug its curves exactly.
 *
 * Draw calls: every static part is merged (VH.GeometryBuilder) into one of three
 * meshes, plus one mesh per wheel = 7 calls per car.
 *   paint   MeshPhysicalMaterial, clearcoat; one shared material per colour
 *   trim    glass, rubber, chrome, plastic; ONE shared material for all cars and
 *           wheels (roughness and metalness travel per vertex in aRM)
 *   lights  lamps, plates and decals; one small material per car so lamps can be
 *           switched: an aLight group id per vertex indexes a uniform array of
 *           HDR emissive colours (headlights, tails, reverse, siren red / blue ...)
 * Geometry is cached per (type, lod, livery colour) and wheels per (size, style).
 *
 * No THREE access at load time: everything happens inside functions.
 */
(function () {
  'use strict';

  const VH = window.VH;

  // ------------------------------------------------------------- helpers
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function sstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  /** Smooth interpolation through [t, value] keys sorted by t. */
  function keyed(keys, t) {
    if (!keys || !keys.length) return 1;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], sstep(keys[i - 1][0], keys[i][0], t));
    }
    return keys[keys.length - 1][1];
  }

  // Roughness / metalness presets for the trim and lights materials.
  const RM = {
    glass: [0.03, 0.0],
    rubber: [0.9, 0.0],
    tread: [0.95, 0.0],
    plastic: [0.62, 0.0],
    satin: [0.42, 0.35],
    chrome: [0.1, 1.0],
    alloy: [0.26, 0.9],
    metal: [0.4, 0.85],
    disc: [0.45, 0.8],
    lens: [0.08, 0.35],
    tail: [0.1, 0.1],
    decal: [0.34, 0.0],
    gloss: [0.22, 0.1],
    dark: [0.55, 0.2],
  };

  const COL = {
    glass: 0x0f161c,
    black: 0x0b0b0c,
    plastic: 0x17181a,
    grille: 0x0a0b0c,
    chrome: 0xdadde0,
    rubber: 0x141414,
    liner: 0x070707,
    headLens: 0xd2d8de,
    tailLens: 0x8c0a0c,
    reverse: 0xdadada,
    amber: 0xc0620a,
    white: 0xffffff,
    mirror: 0x3c4852,
  };

  // Emissive light groups (index into the per-car uniform array).
  const G = { NONE: 0, HEAD: 1, DRL: 2, TAIL: 3, REVERSE: 4, RED: 5, BLUE: 6, SIGN: 7, PLATE: 8, AMBER: 9, WHITE: 10 };
  const GROUPS = 11;

  // ------------------------------------------------------------ MeshData
  /** A small indexed mesh under construction (positions, normals, optional uv). */
  class MeshData {
    constructor() {
      this.p = [];
      this.n = [];
      this.i = [];
      this.uv = null;
    }
    v(x, y, z, nx, ny, nz) {
      this.p.push(x, y, z);
      const l = Math.hypot(nx, ny, nz) || 1;
      this.n.push(nx / l, ny / l, nz / l);
      return this.p.length / 3 - 1;
    }
    /** A triangle, wound so its face agrees with its vertex normals. */
    tri(a, b, c) {
      const P = this.p, N = this.n;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
      const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * fx + fy * fy + fz * fz < 1e-16) return;
      const nx = N[a * 3] + N[b * 3] + N[c * 3];
      const ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1];
      const nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
      if (fx * nx + fy * ny + fz * nz < 0) this.i.push(a, c, b);
      else this.i.push(a, b, c);
    }
    quad(a, b, c, d) {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }
    /** A flat quad with its own vertices; `hint` says which way is outward. */
    flat(p0, p1, p2, p3, hint) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz);
      const b = this.v(p1[0], p1[1], p1[2], nx, ny, nz);
      const c = this.v(p2[0], p2[1], p2[2], nx, ny, nz);
      const d = this.v(p3[0], p3[1], p3[2], nx, ny, nz);
      this.quad(a, b, c, d);
    }
    append(o) {
      const base = this.p.length / 3;
      for (let k = 0; k < o.p.length; k++) {
        this.p.push(o.p[k]);
        this.n.push(o.n[k]);
      }
      for (let k = 0; k < o.i.length; k++) this.i.push(base + o.i[k]);
      return this;
    }
    /** Apply a THREE.Matrix4 (positions and normals). */
    applyMatrix(m) {
      const e = m.elements;
      const nm = new THREE.Matrix3().getNormalMatrix(m).elements;
      const P = this.p, N = this.n;
      for (let k = 0; k < P.length; k += 3) {
        const x = P[k], y = P[k + 1], z = P[k + 2];
        P[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = N[k], b = N[k + 1], c = N[k + 2];
        let nx = nm[0] * a + nm[3] * b + nm[6] * c;
        let ny = nm[1] * a + nm[4] * b + nm[7] * c;
        let nz = nm[2] * a + nm[5] * b + nm[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        N[k] = nx / l;
        N[k + 1] = ny / l;
        N[k + 2] = nz / l;
      }
      // A mirroring matrix flips the winding.
      if (m.determinant() < 0) {
        for (let k = 0; k < this.i.length; k += 3) {
          const t = this.i[k + 1];
          this.i[k + 1] = this.i[k + 2];
          this.i[k + 2] = t;
        }
      }
      return this;
    }
    at(x, y, z, ry, rx, rz) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ'));
      m.setPosition(x, y, z);
      return this.applyMatrix(m);
    }
    get triCount() {
      return this.i.length / 3;
    }
    toGeometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setIndex(this.i);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }

  function fromGeometry(geo) {
    const md = new MeshData();
    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) md.v(pos.getX(k), pos.getY(k), pos.getZ(k), nrm.getX(k), nrm.getY(k), nrm.getZ(k));
    if (geo.index) for (let k = 0; k < geo.index.count; k++) md.i.push(geo.index.getX(k));
    else for (let k = 0; k < pos.count; k++) md.i.push(k);
    return md;
  }

  // ------------------------------------------------------------ contours
  /**
   * Control points → a finely sampled closed contour in (z, y).
   *   [z, y]        a sharp corner         [z, y, r]  rounded over about r metres
   *   { arch: [zc, yc, radius], y }         a wheel arch cut up from the base line y
   */
  function contour(points, segs, maxSeg) {
    const base = [];
    for (const p of points) {
      if (p.arch) {
        const zc = p.arch[0], yc = p.arch[1], ra = p.arch[2];
        const a0 = Math.asin(clamp((p.y - yc) / ra, -0.99, 0.99));
        const nA = Math.max(6, Math.round(segs * 3.6));
        for (let i = 0; i <= nA; i++) {
          const a = lerp(Math.PI - a0, a0, i / nA);
          base.push([zc + ra * Math.cos(a), yc + ra * Math.sin(a), 0]);
        }
      } else base.push([p[0], p[1], p[2] || 0]);
    }
    const out = [];
    const n = base.length;
    for (let i = 0; i < n; i++) {
      const p = base[i], r = p[2];
      if (!r) {
        out.push([p[0], p[1]]);
        continue;
      }
      const a = base[(i + n - 1) % n], b = base[(i + 1) % n];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1, lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
      const ta = Math.min(r, la * 0.5) / la, tb = Math.min(r, lb * 0.5) / lb;
      const A = [p[0] + (a[0] - p[0]) * ta, p[1] + (a[1] - p[1]) * ta];
      const B = [p[0] + (b[0] - p[0]) * tb, p[1] + (b[1] - p[1]) * tb];
      const d1x = (p[0] - a[0]) / la, d1y = (p[1] - a[1]) / la, d2x = (b[0] - p[0]) / lb, d2y = (b[1] - p[1]) / lb;
      const ang = Math.acos(clamp(d1x * d2x + d1y * d2y, -1, 1));
      const k = Math.max(1, Math.ceil(segs * ang / (Math.PI / 2)));
      for (let s = 0; s <= k; s++) {
        const t = s / k, u = 1 - t;
        out.push([u * u * A[0] + 2 * u * t * p[0] + t * t * B[0], u * u * A[1] + 2 * u * t * p[1] + t * t * B[1]]);
      }
    }
    // Split long straight runs so the body can bend smoothly; drop duplicates.
    const res = [];
    for (let i = 0; i < out.length; i++) {
      const p = out[i], q = out[(i + 1) % out.length];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < 1e-4) continue;
      res.push(p);
      const k = Math.ceil(d / maxSeg);
      for (let s = 1; s < k; s++) res.push([lerp(p[0], q[0], s / k), lerp(p[1], q[1], s / k)]);
    }
    // Counter-clockwise seen from +X (z to the right, y up).
    let area = 0;
    for (let i = 0; i < res.length; i++) {
      const p = res[i], q = res[(i + 1) % res.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (area < 0) res.reverse();
    return res;
  }

  /** Longest-edge bisection of a 2D triangulation until every edge is short. */
  function refine(verts, tris, maxLen) {
    const max2 = maxLen * maxLen;
    const d2 = (a, b) => {
      const dx = verts[a][0] - verts[b][0], dy = verts[a][1] - verts[b][1];
      return dx * dx + dy * dy;
    };
    let guard = 0;
    for (let t = 0; t < tris.length && guard < 6000; ) {
      const T = tris[t];
      let e = 0, best = d2(T[0], T[1]);
      const l1 = d2(T[1], T[2]), l2 = d2(T[2], T[0]);
      if (l1 > best) {
        best = l1;
        e = 1;
      }
      if (l2 > best) {
        best = l2;
        e = 2;
      }
      if (best <= max2) {
        t++;
        continue;
      }
      guard++;
      const a = T[e], b = T[(e + 1) % 3];
      const m = verts.length;
      verts.push([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2]);
      for (let s = 0, n = tris.length; s < n; s++) {
        const S = tris[s];
        for (let k = 0; k < 3; k++) {
          const p = S[k], q = S[(k + 1) % 3];
          if ((p === a && q === b) || (p === b && q === a)) {
            const r = S[(k + 2) % 3];
            tris[s] = [p, m, r];
            tris.push([m, q, r]);
            break;
          }
        }
      }
    }
  }

  const CREASE_COS = Math.cos(40 * Math.PI / 180);

  /**
   * Extrude a contour across the car's width (x) with quarter-round edges of
   * radius `bevel`. Normals are analytic; flat side caps are re-triangulated
   * into triangles no longer than `capEdge` so they can be bent later.
   */
  function extrude(cont, width, bevel, bevelSegs, steps, capEdge) {
    const n = cont.length;
    const recs = [];
    for (let k = 0; k < n; k++) {
      const p = cont[k], a = cont[(k + n - 1) % n], b = cont[(k + 1) % n];
      let dz = p[0] - a[0], dy = p[1] - a[1];
      let l = Math.hypot(dz, dy) || 1;
      const n1z = dy / l, n1y = -dz / l;
      dz = b[0] - p[0];
      dy = b[1] - p[1];
      l = Math.hypot(dz, dy) || 1;
      const n2z = dy / l, n2y = -dz / l;
      const dot = n1z * n2z + n1y * n2y;
      let mz = (n1z + n2z) / (1 + dot), my = (n1y + n2y) / (1 + dot);
      const ml = Math.hypot(mz, my);
      if (ml > 2.2) {
        mz *= 2.2 / ml;
        my *= 2.2 / ml;
      }
      if (dot < CREASE_COS) {
        recs.push({ z: p[0], y: p[1], nz: n1z, ny: n1y, mz, my });
        recs.push({ z: p[0], y: p[1], nz: n2z, ny: n2y, mz, my, dup: true });
      } else {
        const sz = n1z + n2z, sy = n1y + n2y, sl = Math.hypot(sz, sy) || 1;
        recs.push({ z: p[0], y: p[1], nz: sz / sl, ny: sy / sl, mz, my });
      }
    }
    const hw = width / 2, b = Math.min(bevel, hw * 0.9);
    const rings = [];
    const ring = (sign, t) => rings.push({ x: sign * (hw - b + b * Math.cos(t)), d: b * (1 - Math.sin(t)), cx: sign * Math.cos(t), s: Math.sin(t) });
    for (let j = 0; j <= bevelSegs; j++) ring(1, (j / bevelSegs) * Math.PI / 2);
    for (let s = 1; s < steps; s++) rings.push({ x: hw - b - (2 * (hw - b) * s) / steps, d: 0, cx: 0, s: 1 });
    for (let j = bevelSegs; j >= 0; j--) ring(-1, (j / bevelSegs) * Math.PI / 2);

    const md = new MeshData();
    const idx = rings.map((r) => recs.map((q) => md.v(r.x, q.y - q.my * r.d, q.z - q.mz * r.d, r.cx, q.ny * r.s, q.nz * r.s)));
    const R = recs.length;
    for (let r = 0; r < rings.length - 1; r++) {
      for (let q = 0; q < R; q++) {
        const q2 = (q + 1) % R;
        if (recs[q2].dup) continue;
        md.quad(idx[r][q], idx[r][q2], idx[r + 1][q2], idx[r + 1][q]);
      }
    }
    // Side caps.
    const capRec = [];
    recs.forEach((q, k) => {
      if (!q.dup) capRec.push(k);
    });
    const verts = capRec.map((k) => [recs[k].z - recs[k].mz * b, recs[k].y - recs[k].my * b]);
    const tris = THREE.ShapeUtils.triangulateShape(verts.map((v) => new THREE.Vector2(v[0], v[1])), []);
    const nb = verts.length;
    refine(verts, tris, capEdge);
    for (const side of [0, rings.length - 1]) {
      const sgn = side === 0 ? 1 : -1;
      const map = [];
      for (let k = 0; k < verts.length; k++) {
        map.push(k < nb ? idx[side][capRec[k]] : md.v(sgn * hw, verts[k][1], verts[k][0], sgn, 0, 0));
      }
      for (const T of tris) md.tri(map[T[0]], map[T[1]], map[T[2]]);
    }
    return md;
  }

  /** Bend a mesh by fn(x, y, z, out); normals follow via the Jacobian. */
  function deform(md, fn) {
    const P = md.p, N = md.n, e = 1e-3;
    const o = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0];
    const c0 = [0, 0, 0], c1 = [0, 0, 0], c2 = [0, 0, 0];
    const diff = (c) => {
      c[0] = (a[0] - b[0]) / (2 * e);
      c[1] = (a[1] - b[1]) / (2 * e);
      c[2] = (a[2] - b[2]) / (2 * e);
    };
    for (let k = 0; k < P.length; k += 3) {
      const x = P[k], y = P[k + 1], z = P[k + 2];
      fn(x + e, y, z, a); fn(x - e, y, z, b); diff(c0);
      fn(x, y + e, z, a); fn(x, y - e, z, b); diff(c1);
      fn(x, y, z + e, a); fn(x, y, z - e, b); diff(c2);
      fn(x, y, z, o);
      const nx = N[k], ny = N[k + 1], nz = N[k + 2];
      // Cofactor matrix times the normal (the inverse transpose up to scale).
      const rx = (c1[1] * c2[2] - c1[2] * c2[1]) * nx + (c2[1] * c0[2] - c2[2] * c0[1]) * ny + (c0[1] * c1[2] - c0[2] * c1[1]) * nz;
      const ry = (c1[2] * c2[0] - c1[0] * c2[2]) * nx + (c2[2] * c0[0] - c2[0] * c0[2]) * ny + (c0[2] * c1[0] - c0[0] * c1[2]) * nz;
      const rz = (c1[0] * c2[1] - c1[1] * c2[0]) * nx + (c2[0] * c0[1] - c2[1] * c0[0]) * ny + (c0[0] * c1[1] - c0[1] * c1[0]) * nz;
      const l = Math.hypot(rx, ry, rz) || 1;
      P[k] = o[0];
      P[k + 1] = o[1];
      P[k + 2] = o[2];
      N[k] = rx / l;
      N[k + 1] = ry / l;
      N[k + 2] = rz / l;
    }
    return md;
  }

  // ------------------------------------------------------------- surface
  let surfMat = null;
  /** Ray casting against the finished body, for laying patches onto it. */
  class Surface {
    constructor(mds) {
      if (!surfMat) surfMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      this.meshes = mds.map((md) => new THREE.Mesh(md.toGeometry(), surfMat));
      this.rc = new THREE.Raycaster();
      this.o = new THREE.Vector3();
      this.d = new THREE.Vector3();
    }
    cast(ox, oy, oz, dx, dy, dz) {
      this.rc.set(this.o.set(ox, oy, oz), this.d.set(dx, dy, dz).normalize());
      const hits = this.rc.intersectObjects(this.meshes, false);
      if (!hits.length) return null;
      const h = hits[0];
      const n = (h.normal || h.face.normal).clone().normalize();
      if (n.dot(this.d) > 0) n.negate();
      return { p: h.point.clone(), n };
    }
    face(face, a, b) {
      switch (face) {
        case 'front': return this.cast(a, b, 30, 0, 0, -1);
        case 'rear': return this.cast(a, b, -30, 0, 0, 1);
        case 'left': return this.cast(30, b, a, -1, 0, 0);
        case 'right': return this.cast(-30, b, a, 1, 0, 0);
        case 'top': return this.cast(a, 30, b, 0, -1, 0);
        default: {
          // { o(a, b) → [x, y, z], d: [dx, dy, dz] }
          const o = face.o(a, b);
          return this.cast(o[0], o[1], o[2], face.d[0], face.d[1], face.d[2]);
        }
      }
    }
    dispose() {
      for (const m of this.meshes) m.geometry.dispose();
    }
  }

  /** (u, v) in [0, 1]² → a rounded / skewed / tapered rectangle in plane coords. */
  function rectMap(cx, cy, w, h, round, skew, taper) {
    return (u, v) => {
      let x = u * 2 - 1, y = v * 2 - 1;
      if (round) {
        const dx = x * Math.sqrt(1 - (y * y) / 2), dy = y * Math.sqrt(1 - (x * x) / 2);
        x = lerp(x, dx, round);
        y = lerp(y, dy, round);
      }
      const sx = 1 + (taper || 0) * y;
      return [cx + x * w * 0.5 * sx + (skew || 0) * y * h * 0.5, cy + y * h * 0.5];
    };
  }
  /** Bilinear quad: c0 (u0 v0), c1 (u1 v0), c2 (u1 v1), c3 (u0 v1). */
  function quadMap(c0, c1, c2, c3) {
    return (u, v) => [
      lerp(lerp(c0[0], c1[0], u), lerp(c3[0], c2[0], u), v),
      lerp(lerp(c0[1], c1[1], u), lerp(c3[1], c2[1], u), v),
    ];
  }

  /**
   * A grid laid onto the surface: each grid point is ray-cast and lifted `off`
   * along the surface normal. With `thick`, the panel stands proud of the body
   * on little walls. Returns null if any ray misses.
   */
  function projectPatch(surf, face, map, nu, nv, off, thick) {
    const grid = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const ab = map(i / nu, j / nv);
        const h = surf.face(face, ab[0], ab[1]);
        if (!h) return null;
        grid.push(h);
      }
    }
    const md = new MeshData();
    md.uv = [];
    const o = off + (thick || 0);
    const top = grid.map((h, k) => {
      md.uv.push((k % (nu + 1)) / nu, Math.floor(k / (nu + 1)) / nv);
      return md.v(h.p.x + h.n.x * o, h.p.y + h.n.y * o, h.p.z + h.n.z * o, h.n.x, h.n.y, h.n.z);
    });
    const at = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) md.quad(top[at(i, j)], top[at(i + 1, j)], top[at(i + 1, j + 1)], top[at(i, j + 1)]);
    if (thick > 0) {
      const border = [];
      for (let i = 0; i < nu; i++) border.push(at(i, 0));
      for (let j = 0; j < nv; j++) border.push(at(nu, j));
      for (let i = nu; i > 0; i--) border.push(at(i, nv));
      for (let j = nv; j > 0; j--) border.push(at(0, j));
      let cx = 0, cy = 0, cz = 0;
      for (const h of grid) {
        cx += h.p.x;
        cy += h.p.y;
        cz += h.p.z;
      }
      cx /= grid.length;
      cy /= grid.length;
      cz /= grid.length;
      for (let k = 0; k < border.length; k++) {
        const g1 = grid[border[k]], g2 = grid[border[(k + 1) % border.length]];
        const A = [g1.p.x + g1.n.x * o, g1.p.y + g1.n.y * o, g1.p.z + g1.n.z * o];
        const B = [g2.p.x + g2.n.x * o, g2.p.y + g2.n.y * o, g2.p.z + g2.n.z * o];
        const C = [g2.p.x - g2.n.x * 0.01, g2.p.y - g2.n.y * 0.01, g2.p.z - g2.n.z * 0.01];
        const D = [g1.p.x - g1.n.x * 0.01, g1.p.y - g1.n.y * 0.01, g1.p.z - g1.n.z * 0.01];
        const mx = (g1.p.x + g2.p.x) / 2 - cx, my = (g1.p.y + g2.p.y) / 2 - cy, mz = (g1.p.z + g2.p.z) / 2 - cz;
        const b0 = md.p.length / 3;
        md.flat(A, B, C, D, [mx, my, mz]);
        for (let q = 0; q < 4; q++) md.uv.push(md.uv[top[border[k]] * 2], md.uv[top[border[k]] * 2 + 1]);
        void b0;
      }
    }
    return md;
  }

  // ---------------------------------------------------------- primitives
  /** Rounded box centred at the origin (sx, sy, sz full sizes, r edge radius). */
  function roundBox(sx, sy, sz, r, lod) {
    const md = new MeshData();
    const h = [sx / 2, sy / 2, sz / 2];
    r = Math.min(r, h[0] * 0.95, h[1] * 0.95, h[2] * 0.95);
    const vals = (k) => {
      if (lod || r < 0.012) return [-1, 1];
      const t = 1 - r / h[k];
      return [-1, -t, t, 1];
    };
    // Each face: axis `ax` fixed at ±1, the other two axes sampled.
    for (let ax = 0; ax < 3; ax++) {
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      const s1 = vals(a1), s2 = vals(a2);
      for (const sg of [-1, 1]) {
        const ids = [];
        for (let j = 0; j < s2.length; j++) {
          for (let i = 0; i < s1.length; i++) {
            const q = [0, 0, 0];
            q[ax] = sg * h[ax];
            q[a1] = s1[i] * h[a1];
            q[a2] = s2[j] * h[a2];
            const inner = [0, 1, 2].map((k) => clamp(q[k], -(h[k] - r), h[k] - r));
            let dx = q[0] - inner[0], dy = q[1] - inner[1], dz = q[2] - inner[2];
            const l = Math.hypot(dx, dy, dz);
            if (l < 1e-6 || lod || r < 0.012) {
              const nn = [0, 0, 0];
              nn[ax] = sg;
              ids.push(md.v(q[0], q[1], q[2], nn[0], nn[1], nn[2]));
            } else {
              dx /= l;
              dy /= l;
              dz /= l;
              ids.push(md.v(inner[0] + dx * r, inner[1] + dy * r, inner[2] + dz * r, dx, dy, dz));
            }
          }
        }
        const w = s1.length;
        for (let j = 0; j < s2.length - 1; j++) {
          for (let i = 0; i < w - 1; i++) md.quad(ids[j * w + i], ids[j * w + i + 1], ids[(j + 1) * w + i + 1], ids[(j + 1) * w + i]);
        }
      }
    }
    return md;
  }

  /** Cylinder along X (axle direction), radius r, length len, centred. */
  function cylX(r, len, segs, capOut) {
    const md = new MeshData();
    const ring = [];
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      ring.push([md.v(-len / 2, c * r, sn * r, 0, c, sn), md.v(len / 2, c * r, sn * r, 0, c, sn)]);
    }
    for (let s = 0; s < segs; s++) md.quad(ring[s][0], ring[s + 1][0], ring[s + 1][1], ring[s][1]);
    if (capOut) {
      for (const sg of capOut === 2 ? [-1, 1] : [1]) {
        const c0 = md.v((sg * len) / 2, 0, 0, sg, 0, 0);
        const rim = [];
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          rim.push(md.v((sg * len) / 2, Math.cos(a) * r, Math.sin(a) * r, sg, 0, 0));
        }
        for (let s = 0; s < segs; s++) md.tri(c0, rim[s], rim[s + 1]);
      }
    }
    return md;
  }

  /** Surface of revolution about the X axis. prof: [[radius, axial, sharp?], ...]. */
  function revolve(prof, segs) {
    const recs = [];
    const n = prof.length;
    for (let k = 0; k < n; k++) {
      const p = prof[k], a = prof[Math.max(0, k - 1)], b = prof[Math.min(n - 1, k + 1)];
      const t1 = [p[0] - a[0], p[1] - a[1]], t2 = [b[0] - p[0], b[1] - p[1]];
      const nrm = (t) => {
        const l = Math.hypot(t[0], t[1]) || 1;
        return [t[1] / l, -t[0] / l]; // (radial, axial)
      };
      if (p[2] && k > 0 && k < n - 1) {
        recs.push({ r: p[0], a: p[1], n: nrm(t1) });
        recs.push({ r: p[0], a: p[1], n: nrm(t2), dup: true });
      } else {
        const t = [t1[0] + t2[0], t1[1] + t2[1]];
        recs.push({ r: p[0], a: p[1], n: nrm(k === 0 ? t2 : k === n - 1 ? t1 : t) });
      }
    }
    const md = new MeshData();
    const rows = [];
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
      rows.push(recs.map((q) => md.v(q.a, q.r * c, q.r * sn, q.n[1], q.n[0] * c, q.n[0] * sn)));
    }
    for (let s = 0; s < segs; s++) {
      for (let k = 0; k < recs.length - 1; k++) {
        if (recs[k + 1].dup) continue;
        md.quad(rows[s][k], rows[s][k + 1], rows[s + 1][k + 1], rows[s + 1][k]);
      }
    }
    return md;
  }

  // -------------------------------------------------------- part builder
  const WHITE_UV = [0.5, 0.2];

  /** Wraps VH.GeometryBuilder and carries the extra per-vertex channels. */
  class PartBuilder {
    constructor(kind) {
      this.kind = kind; // 'paint' | 'trim' | 'lights'
      this.gb = new VH.GeometryBuilder();
      this.rm = [];
      this.lt = kind === 'lights' ? [] : null;
      this.uv = kind === 'lights' ? [] : null;
    }
    /**
     * Add a MeshData. color: sRGB hex or linear [r, g, b]; rm: [roughness, metalness];
     * light: emissive group; uvRect: atlas rect [u0, v0, u1, v1] (with flipU);
     * shade(x, y, z, nx, ny, nz) → brightness multiplier (optional).
     */
    add(md, color, rm, light, uvRect, flipU, shade) {
      if (!md) return;
      const gb = this.gb, base = gb.count, P = md.p, N = md.n;
      const c = Array.isArray(color) ? color : VH.col(color);
      rm = rm || RM.plastic;
      for (let k = 0, v = 0; k < P.length; k += 3, v++) {
        let cc = c;
        if (shade) {
          const m = shade(P[k], P[k + 1], P[k + 2], N[k], N[k + 1], N[k + 2]);
          if (m !== 1) cc = [c[0] * m, c[1] * m, c[2] * m];
        }
        gb.vertex(P[k], P[k + 1], P[k + 2], N[k], N[k + 1], N[k + 2], cc);
        this.rm.push(rm[0], rm[1]);
        if (this.lt) {
          this.lt.push(light || 0);
          if (uvRect && md.uv) {
            const u = flipU ? 1 - md.uv[v * 2] : md.uv[v * 2];
            this.uv.push(lerp(uvRect[0], uvRect[2], u), lerp(uvRect[1], uvRect[3], md.uv[v * 2 + 1]));
          } else this.uv.push(WHITE_UV[0], WHITE_UV[1]);
        }
      }
      for (let k = 0; k < md.i.length; k++) gb.idx.push(base + md.i[k]);
    }
    get tris() {
      return this.gb.idx.length / 3;
    }
    build() {
      if (this.gb.isEmpty) {
        // Keep the mesh valid: a single degenerate triangle.
        const md = new MeshData();
        md.v(0, 0, 0, 0, 1, 0);
        md.i.push(0, 0, 0);
        this.add(md, COL.black, RM.plastic);
      }
      const g = this.gb.build();
      if (this.kind !== 'paint') g.setAttribute('aRM', new THREE.Float32BufferAttribute(this.rm, 2));
      if (this.lt) {
        g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.lt, 1));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      }
      return g;
    }
  }

  // ----------------------------------------------------------- materials
  const cache = { paint: new Map(), bodies: new Map(), wheels: new Map(), trim: null, atlas: null, programs: 0 };

  /** Canvas atlas: police and ambulance door panels, CAB sign, plates, checker. */
  const ATLAS = { W: 1024, H: 1024 };
  function reg(x0, y0, x1, y1) {
    // Canvas pixels (y down) → uv rect with v up (CanvasTexture flips Y).
    return [x0 / ATLAS.W, 1 - y1 / ATLAS.H, x1 / ATLAS.W, 1 - y0 / ATLAS.H];
  }
  const UVR = {
    police: reg(0, 0, 1024, 300),
    cab: reg(0, 300, 512, 428),
    plate: reg(512, 300, 1024, 428),
    checker: reg(0, 428, 1024, 460),
    medic: reg(0, 460, 1024, 700),
    cross: reg(0, 700, 240, 940),
    cash: reg(240, 700, 1024, 900),
  };
  function atlasTexture() {
    if (cache.atlas) return cache.atlas;
    const cv = document.createElement('canvas');
    cv.width = ATLAS.W;
    cv.height = ATLAS.H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, ATLAS.W, ATLAS.H);
    const font = (w, px, fam) => (g.font = w + ' ' + px + 'px ' + (fam || '"Arial Black", "Segoe UI", Arial, sans-serif'));
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // Police door panel (white doors): star badge, VICEHAVEN over POLICE, a pin stripe.
    g.fillStyle = '#0b1c3d';
    g.fillRect(0, 262, 1024, 10);
    font('bold', 50);
    g.fillStyle = '#0b1c3d';
    g.fillText('V I C E H A V E N', 560, 80);
    font('900', 140);
    g.fillText('POLICE', 560, 180);
    const star = (cx, cy, R, r, col) => {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r : R;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = col;
      g.fill();
    };
    g.beginPath();
    g.arc(120, 140, 86, 0, Math.PI * 2);
    g.fillStyle = '#0b1c3d';
    g.fill();
    g.beginPath();
    g.arc(120, 140, 74, 0, Math.PI * 2);
    g.fillStyle = '#d7b04a';
    g.fill();
    star(120, 140, 62, 26, '#0b1c3d');

    // CAB roof sign: glowing letters on a dark panel.
    g.fillStyle = '#0d0b08';
    g.fillRect(0, 300, 512, 128);
    font('900', 104);
    g.fillStyle = '#ffe7a8';
    g.fillText('CAB', 256, 368);

    // Number plate.
    g.fillStyle = '#eceae2';
    g.fillRect(512, 300, 512, 128);
    g.strokeStyle = '#1b2a52';
    g.lineWidth = 8;
    g.strokeRect(520, 308, 496, 112);
    font('bold', 22, 'Arial, sans-serif');
    g.fillStyle = '#b3202a';
    g.fillText('VICEHAVEN', 768, 330);
    font('bold', 76, '"Arial Narrow", Arial, sans-serif');
    g.fillStyle = '#1b2a52';
    g.fillText('VH 4821', 768, 380);

    // Taxi checker strip: 2 rows of 16 px squares.
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? '#101010' : '#f4f4f0';
        g.fillRect(x * 16, 428 + y * 16, 16, 16);
      }
    }

    // Ambulance side panel: red stripe band and lettering on white.
    g.fillStyle = '#c3121b';
    g.fillRect(0, 560, 1024, 70);
    g.fillStyle = '#f2c21b';
    g.fillRect(0, 630, 1024, 14);
    font('900', 96);
    g.fillStyle = '#c3121b';
    g.fillText('AMBULANCE', 512, 505);
    font('bold', 40);
    g.fillStyle = '#ffffff';
    g.fillText('VICEHAVEN MEDICAL', 512, 596);

    // Medical cross (for rear doors and roof).
    g.fillStyle = '#ffffff';
    g.fillRect(0, 700, 240, 240);
    g.fillStyle = '#c3121b';
    g.fillRect(90, 720, 60, 200);
    g.fillRect(20, 790, 200, 60);

    // Cash-in-transit side: a green band with a shield.
    g.fillStyle = '#1d3b2a';
    g.fillRect(240, 700, 784, 200);
    g.fillStyle = '#d7b04a';
    g.fillRect(240, 700, 784, 10);
    g.fillRect(240, 890, 784, 10);
    font('900', 80);
    g.fillStyle = '#e9e4d0';
    g.fillText('BULWARK SECURE', 660, 800);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.atlas = tex;
    return tex;
  }

  const RM_VERTEX = /* glsl */ `
    attribute vec2 aRM;
    varying vec2 vRM;
  `;
  const LIGHT_VERTEX = /* glsl */ `
    attribute float aLight;
    flat varying float vLight;
  `;

  function injectCarShader(shader, lights) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + RM_VERTEX + (lights ? LIGHT_VERTEX : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;' + (lights ? '\nvLight = aLight;' : ''));
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;\n' + (lights ? 'flat varying float vLight;\nuniform vec3 uLE[' + GROUPS + '];\n' : ''))
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
    if (lights) {
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        `{
          int vhG = int(vLight + 0.5);
          vec3 vhE = uLE[vhG];
          // Signs and plates glow through their printed texture.
          if (vhG == 7 || vhG == 8) vhE *= diffuseColor.rgb;
          totalEmissiveRadiance = vhE;
        }`
      );
    }
    shader.fragmentShader = fs;
  }

  /** The one trim material shared by every car and wheel. */
  function trimMaterial() {
    if (cache.trim) return cache.trim;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => injectCarShader(shader, false);
    m.customProgramCacheKey = () => 'vh-car-trim-v1';
    m.name = 'car-trim';
    cache.trim = m;
    return m;
  }

  /** Clearcoated metallic paint, shared per colour. `finish` tweaks matte / solid colours. */
  function paintParams(hex, finish) {
    const c = new THREE.Color(hex);
    const light = c.r + c.g + c.b > 1.9; // very pale colours read grey when too metallic
    const p = { color: hex, vertexColors: true, metalness: light ? 0.22 : 0.5, roughness: light ? 0.3 : 0.35, clearcoat: 1, clearcoatRoughness: 0.08 };
    if (finish === 'matte') Object.assign(p, { metalness: 0.05, roughness: 0.78, clearcoat: 0.08, clearcoatRoughness: 0.6 });
    if (finish === 'candy') Object.assign(p, { metalness: 0.7, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 });
    if (finish === 'steel') Object.assign(p, { metalness: 0.62, roughness: 0.4, clearcoat: 0.15, clearcoatRoughness: 0.5 });
    if (finish === 'satin') Object.assign(p, { metalness: 0.45, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    if (finish === 'pearl') Object.assign(p, { metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: 0xfff2e0 });
    return p;
  }
  function paintMaterial(hex, finish) {
    const key = hex + '|' + (finish || '');
    let m = cache.paint.get(key);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial(paintParams(hex, finish));
      m.name = 'car-paint-' + hex.toString(16);
      cache.paint.set(key, m);
    }
    return m;
  }

  // Damage: dents pushed in along the normal (strongest at the nose and tail),
  // darker, dirtier and rougher paint with a dulled clearcoat.
  function damagedPaintMaterial(hex, finish, halfLength) {
    const m = new THREE.MeshPhysicalMaterial(paintParams(hex, finish));
    const u = { uDamage: { value: 0 }, uHalfLen: { value: halfLength } };
    m.userData.uniforms = u;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDamage = u.uDamage;
      shader.uniforms.uHalfLen = u.uHalfLen;
      const noise = `
        float vhN(vec3 p) {
          return sin(p.x * 7.1 + sin(p.z * 3.3)) * sin(p.z * 5.3 + p.y * 4.1) * sin(p.y * 9.7 + p.x * 2.3);
        }`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uDamage;\nuniform float uHalfLen;\nvarying vec3 vDmgPos;\n' + noise)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vDmgPos = position;
          {
            float ends = smoothstep(uHalfLen * 0.45, uHalfLen, abs(position.z));
            float dent = max(0.0, vhN(position * 1.7)) * (0.35 + ends * 1.4);
            transformed -= objectNormal * dent * uDamage * 0.055;
          }`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDamage;\nvarying vec3 vDmgPos;\n' + noise)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float vhDirt = clamp(0.5 + 0.5 * vhN(vDmgPos * 3.1) + 0.3 * vhN(vDmgPos * 11.0), 0.0, 1.0) * uDamage;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + vec3(0.035, 0.028, 0.02), vhDirt * 0.9);`
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, uDamage * 0.85);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= 1.0 - uDamage * 0.9;');
    };
    m.customProgramCacheKey = () => 'vh-car-paint-damage-v1';
    return m;
  }

  function lightsMaterial(le) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlasTexture(), roughness: 1, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLE = { value: le };
      injectCarShader(shader, true);
    };
    m.customProgramCacheKey = () => 'vh-car-lights-v1';
    m.name = 'car-lights';
    return m;
  }

  // -------------------------------------------------------------- wheels
  /**
   * Wheel styles:
   *   alloy  5 wide spokes, silver        split  5 twin spokes, graphite, polished lip
   *   mag    5 chunky chrome spokes        steel  dished steel with a hubcap
   *   truck  6 spokes, black, machined lip  wire  chrome wire / many thin spokes (lowrider)
   *   mesh   8 spokes, bronze (tuner)      wwall  steel + chrome cap with a white sidewall
   */
  const WHEEL_STYLES = {
    alloy: { spokes: 5, pair: 0, w0: 0.07, w1: 0.1, col: 0xc3c7cb, rm: RM.alloy, lip: 0xc3c7cb, dish: 0.035 },
    split: { spokes: 5, pair: 0.12, w0: 0.034, w1: 0.05, col: 0x2e3135, rm: [0.3, 0.8], lip: 0xd0d3d6, dish: 0.05 },
    mag: { spokes: 5, pair: 0, w0: 0.1, w1: 0.12, col: 0xe2e4e6, rm: RM.chrome, lip: 0xe2e4e6, dish: 0.045 },
    steel: { steel: true, col: 0x2a2b2d, rm: [0.45, 0.6], cap: 0xd6d8da, lip: 0x2a2b2d },
    silversteel: { steel: true, col: 0x9a9da1, rm: [0.4, 0.7], cap: 0xb8bbbe, lip: 0x9a9da1 },
    truck: { spokes: 6, pair: 0, w0: 0.08, w1: 0.1, col: 0x232426, rm: [0.4, 0.6], lip: 0xb9bcc0, dish: 0.03 },
    wire: { spokes: 14, pair: 0, w0: 0.012, w1: 0.016, col: 0xe8eaec, rm: RM.chrome, lip: 0xe8eaec, dish: 0.07, knock: true },
    mesh: { spokes: 8, pair: 0, w0: 0.03, w1: 0.05, col: 0x8a6a3a, rm: [0.3, 0.9], lip: 0xd0d3d6, dish: 0.06 },
    rusty: { steel: true, col: 0x5a4636, rm: [0.8, 0.3], cap: 0x5a4636, lip: 0x5a4636 },
  };

  function wheelGeometry(R, width, styleName, lod, whitewall) {
    const key = [R.toFixed(3), width.toFixed(3), styleName, lod, whitewall ? 1 : 0].join('|');
    let g = cache.wheels.get(key);
    if (g) return g;
    const st = WHEEL_STYLES[styleName] || WHEEL_STYLES.alloy;
    const pb = new PartBuilder('trim');
    const segs = lod ? 10 : 16;
    const hw = width / 2;
    const rimR = R * (st.rimK || (styleName === 'truck' || styleName === 'steel' || styleName === 'silversteel' || styleName === 'rusty' || whitewall ? 0.62 : 0.7));

    // Tyre: rounded shoulders, slightly bulged sidewalls. Outboard is +X.
    const sh = Math.min(0.045, width * 0.2);
    const tyre = revolve(lod ? [
      [rimR - 0.005, -hw + 0.02], [R - sh, -hw + 0.004], [R, -hw + sh], [R, hw - sh], [R - sh, hw - 0.004], [rimR - 0.005, hw - 0.02],
    ] : [
      [rimR - 0.005, -hw + 0.025],
      [R - sh * 0.9, -hw + 0.004],
      [R - sh * 0.25, -hw + sh * 0.35],
      [R, -hw + sh],
      [R, hw - sh],
      [R - sh * 0.25, hw - sh * 0.35],
      [R - sh * 0.9, hw - 0.004],
      [rimR - 0.005, hw - 0.025],
    ], segs);
    pb.add(tyre, COL.rubber, RM.rubber, 0, null, false, (x, y, z, nx) => (Math.abs(x) < hw - sh * 0.6 ? 0.8 : 1));
    if (whitewall) {
      // A white band on the outboard sidewall.
      const ww = revolve([[rimR + 0.012, hw - 0.0005], [rimR + (R - rimR) * 0.6, hw + 0.0015]], segs);
      pb.add(ww, 0xecebe6, [0.6, 0], 0);
    }

    // Barrel (inside of the rim, seen through the spokes).
    if (!lod) pb.add(revolve([[rimR - 0.004, hw - 0.03], [rimR - 0.004, -hw + 0.03]], segs), 0x3a3c40, RM.metal);
    // Lip / flange.
    pb.add(revolve(lod ? [[rimR + 0.01, hw - 0.02], [rimR - 0.03, hw - 0.03]] : [
      [rimR + 0.014, hw - 0.018],
      [rimR - 0.006, hw - 0.01],
      [rimR - 0.03, hw - 0.028],
    ], segs), st.lip, st.rm === RM.chrome ? RM.chrome : RM.alloy);

    // Brake disc behind the spokes.
    const aDisc = hw - 0.12;
    if (!lod) {
      pb.add(revolve([[rimR - 0.045, aDisc], [0.07, aDisc]], segs), 0x6f7174, RM.disc);
    }

    const aRim = hw - 0.03; // outer face of the spokes at the rim
    if (st.steel) {
      // Dished steel wheel with vent holes and a hubcap.
      const face = revolve(lod ? [[rimR - 0.028, hw - 0.055], [0.001, hw - 0.075]] : [
        [rimR - 0.028, hw - 0.055],
        [rimR * 0.55, hw - 0.065, 1],
        [0.001, hw - 0.075],
      ], segs);
      pb.add(face, st.col, st.rm);
      if (!lod) {
        const holes = new MeshData();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3, r0 = rimR * 0.62, c = Math.cos(a), s = Math.sin(a);
          const tx = -s, tz = c;
          const x = hw - 0.064;
          const p = (dr, dt) => [x, (r0 + dr) * c + dt * tx, (r0 + dr) * s + dt * tz];
          holes.flat(p(-0.035, -0.022), p(0.035, -0.022), p(0.035, 0.022), p(-0.035, 0.022), [1, 0, 0]);
        }
        pb.add(holes, 0x050505, RM.plastic);
      }
      pb.add(revolve([[0.001, hw - 0.035], [0.06, hw - 0.045], [0.09, hw - 0.075]], lod ? 6 : 10), st.cap, st.rm === RM.chrome ? RM.chrome : [0.2, 0.9]);
    } else {
      const spokes = new MeshData();
      const n = st.spokes;
      const r0 = 0.07, r1 = rimR - 0.024;
      const aHub = aRim - st.dish;
      const list = [];
      for (let k = 0; k < n; k++) {
        const base = (k / n) * Math.PI * 2;
        if (st.pair) list.push(base - st.pair, base + st.pair);
        else list.push(base);
      }
      const th = 0.026;
      for (const a of list) {
        const c = Math.cos(a), s = Math.sin(a), tx = -s, tz = c;
        const P = (r, w, ax) => [ax, r * c + w * tx, r * s + w * tz];
        const f0 = P(r0, -st.w0 / 2, aHub), f1 = P(r0, st.w0 / 2, aHub), f2 = P(r1, st.w1 / 2, aRim), f3 = P(r1, -st.w1 / 2, aRim);
        const b0 = P(r0, -st.w0 / 2, aHub - th), b1 = P(r0, st.w0 / 2, aHub - th), b2 = P(r1, st.w1 / 2, aRim - th), b3 = P(r1, -st.w1 / 2, aRim - th);
        spokes.flat(f0, f1, f2, f3, [1, 0, 0]);
        if (!lod) {
          spokes.flat(f1, b1, b2, f2, [0, tx, tz]);
          spokes.flat(f0, f3, b3, b0, [0, -tx, -tz]);
        }
      }
      if (st.knock && !lod) {
        // Wire wheels: a second, crossed layer of spokes.
        for (let k = 0; k < n; k++) {
          const a = ((k + 0.5) / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), tx = -s, tz = c;
          const P = (r, w, ax) => [ax, r * c + w * tx, r * s + w * tz];
          spokes.flat(P(r0, -0.006, aHub - 0.02), P(r0, 0.006, aHub - 0.02), P(r1, 0.008, aRim - 0.03), P(r1, -0.008, aRim - 0.03), [1, 0, 0]);
        }
      }
      pb.add(spokes, st.col, st.rm);
      // Hub and centre cap.
      pb.add(revolve([[0.001, aHub + 0.012], [0.06, aHub + 0.006], [0.082, aHub - 0.03]], lod ? 6 : 10), st.col, st.rm);
      if (!lod) pb.add(revolve([[0.001, aHub + 0.02], [0.032, aHub + 0.012]], 8), st.knock ? 0xe8eaec : 0x1a1b1d, st.knock ? RM.chrome : RM.gloss);
      if (false) {
        const nuts = new MeshData();
        const cnt = n === 6 ? 6 : 5;
        for (let k = 0; k < cnt; k++) {
          const a = (k / cnt) * Math.PI * 2 + Math.PI / cnt;
          nuts.append(cylX(0.011, 0.02, 6, 1).at(aHub + 0.012, Math.cos(a) * 0.052, Math.sin(a) * 0.052));
        }
        pb.add(nuts, 0xd0d3d6, RM.chrome);
      }
    }
    g = pb.build();
    g.userData.tris = pb.tris;
    cache.wheels.set(key, g);
    return g;
  }

  // ------------------------------------------------------ body pipeline
  const LODQ = [
    { segs: 3, maxSeg: 0.3, bevelSegs: 2, steps: 3, capEdge: 0.5, cabSteps: 3, nu: 1 },
    { segs: 1, maxSeg: 0.6, bevelSegs: 1, steps: 1, capEdge: 1.1, cabSteps: 1, nu: 0.5 },
  ];

  function bodyDeform(d) {
    const hw = d.W / 2, zN = d.L / 2, zT = -d.L / 2, endLen = d.endLen || 0.5;
    return (x, y, z, o) => {
      const pm = d.plan ? keyed(d.plan, z) : 1;
      const tb = d.tumble ? 1 - d.tumble[2] * sstep(d.tumble[0], d.tumble[1], y) : 1;
      const q = (x / hw) * (x / hw);
      let Z = z;
      if (d.nose) Z -= d.nose * q * sstep(zN - endLen, zN, z);
      if (d.tail) Z += d.tail * q * sstep(zT + endLen, zT, z);
      let Y = y;
      if (d.dip) {
        // Fender peaks: the middle of the hood (and deck) sits lower than the wings.
        for (const dp of d.dip) {
          const m = sstep(dp[0], dp[0] + 0.35, z) * (1 - sstep(dp[1] - 0.35, dp[1], z));
          const bump = 1 - sstep(dp[4] || 0.3, (dp[4] || 0.3) + 0.4, Math.abs(x) / hw);
          if (y > dp[3]) Y = dp[3] + (Y - dp[3]) * (1 - dp[2] * m * bump);
        }
      }
      if (d.rake) Y += d.rake * z; // stance: nose-down tilt
      let X = x * pm * tb;
      if (d.dents) {
        // Static dents [x, y, z, radius, depth]: pushed in toward the car's centre.
        for (const dn of d.dents) {
          const dx = x - dn[0], dy = y - dn[1], dz = z - dn[2];
          const r2 = (dx * dx + dy * dy + dz * dz) / (dn[3] * dn[3]);
          if (r2 < 1) {
            const f = (1 - r2) * (1 - r2) * dn[4];
            if (Math.abs(dn[0]) > 0.3) X -= Math.sign(dn[0]) * f;
            else Z -= Math.sign(dn[2]) * f;
          }
        }
      }
      o[0] = X;
      o[1] = Y;
      o[2] = Z;
    };
  }

  function cabinDeform(c) {
    const hw = c.width / 2;
    return (x, y, z, o) => {
      const t = clamp((y - c.y0) / (c.y1 - c.y0), 0, 1);
      const q = (x / hw) * (x / hw);
      o[0] = x * (1 - (c.tumble || 0) * t) * (c.plan ? keyed(c.plan, z) : 1);
      o[1] = y + (c.crown || 0) * (1 - q) * sstep(c.y1 - 0.3, c.y1, y);
      let Z = z;
      if (c.wf) Z -= c.wf[0] * q * sstep(c.wf[1], c.wf[2], z);
      if (c.wr) Z += c.wr[0] * q * sstep(c.wr[1], c.wr[2], z);
      o[2] = Z;
    };
  }

  /**
   * A glasshouse from a few numbers. Returns the contour points and the two
   * glass lines (windshield base → top, rear window top → base).
   *   zb, yb      windshield base          top: [z, y]  windshield top / roof front
   *   rear: [z, y] roof rear               base: [z, y] rear glass base
   *   bot          hidden bottom y          r: corner radii [base, top, rear, base]
   */
  function greenhouse(g) {
    const r = g.r || [0.03, 0.2, 0.2, 0.05];
    const pts = [[g.zb + 0.07, g.bot], [g.zb, g.yb, r[0]], [g.top[0], g.top[1], r[1]]];
    if (g.mid) pts.push([g.mid[0], g.mid[1], g.mid[2] || 0.4]);
    pts.push([g.rear[0], g.rear[1], r[2]], [g.base[0], g.base[1], r[3]], [g.base[0] - (g.baseOut || 0.06), g.bot]);
    return { pts, ws: [[g.zb, g.yb], g.top], rw: [g.rear, g.base] };
  }

  const zAt = (line, y) => lerp(line[0][0], line[1][0], (y - line[0][1]) / (line[1][1] - line[0][1]));

  class Ctx {
    constructor(def, lod, surf, hex) {
      this.def = def;
      this.lod = lod;
      this.q = LODQ[lod];
      this.surf = surf;
      this.hex = hex;
      this.paint = new PartBuilder('paint');
      this.trim = new PartBuilder('trim');
      this.lights = new PartBuilder('lights');
      this.bodyCol = def.livery ? VH.col(hex) : [1, 1, 1];
      this.anchors = { headlights: [], taillights: [], exhaust: [], siren: null };
    }
    col(c) {
      if (c === 'body') return this.bodyCol;
      return c === undefined ? COL.black : c;
    }
    /** A patch laid onto the body. See projectPatch; o.part picks the mesh. */
    patch(face, map, o) {
      if (o.lod0 && this.lod) return null;
      const f = this.q.nu;
      const nu = Math.max(1, Math.round((o.nu || 4) * f)), nv = Math.max(1, Math.round((o.nv || 1) * f));
      const md = projectPatch(this.surf, face, map, nu, nv, o.off === undefined ? 0.004 : o.off, this.lod ? 0 : o.thick || 0);
      if (!md) return null;
      const pb = this[o.part || 'trim'];
      const flip = o.text ? face === 'left' || face === 'rear' : !!o.flipU;
      pb.add(md, this.col(o.color), o.rm, o.light, o.uv, flip);
      if (o.mirror) {
        let f2 = face, map2 = map;
        if (face === 'left') f2 = 'right';
        else if (face === 'right') f2 = 'left';
        else if (typeof face === 'string') map2 = (u, v) => {
          const ab = map(u, v);
          return [-ab[0], ab[1]];
        };
        else {
          const fo = face.o;
          f2 = { o: (a, b) => { const p = fo(a, b); return [-p[0], p[1], p[2]]; }, d: [-face.d[0], face.d[1], face.d[2]] };
        }
        const md2 = projectPatch(this.surf, f2, map2, nu, nv, o.off === undefined ? 0.004 : o.off, this.lod ? 0 : o.thick || 0);
        const flip2 = o.text ? f2 === 'left' || f2 === 'rear' : !!o.flipU;
        if (md2) pb.add(md2, this.col(o.color), o.rm, o.light, o.uv, flip2);
      }
      return md;
    }
    rect(face, cx, cy, w, h, o) {
      return this.patch(face, rectMap(cx, cy, w, h, o.round, o.skew, o.taper), o);
    }
    quad(face, c0, c1, c2, c3, o) {
      return this.patch(face, quadMap(c0, c1, c2, c3), o);
    }
    hit(face, a, b) {
      return this.surf.face(face, a, b);
    }
    add(part, md, color, rm, light) {
      this[part].add(md, this.col(color), rm, light);
    }
    /** Rounded box, optionally mirrored across x. */
    box(part, x, y, z, sx, sy, sz, r, color, rm, o) {
      o = o || {};
      if (o.lod0 && this.lod) return;
      const make = (sx0) => roundBox(sx, sy, sz, r, this.lod).at(sx0, y, z, o.ry || 0, o.rx || 0, o.rz || 0);
      this.add(part, make(x), color, rm, o.light);
      if (o.mirror) {
        const md = roundBox(sx, sy, sz, r, this.lod).at(-x, y, z, -(o.ry || 0), o.rx || 0, -(o.rz || 0));
        this.add(part, md, color, rm, o.light);
      }
    }

    // ---- detail kit -------------------------------------------------
    headlight(face, x, y, w, h, o) {
      o = o || {};
      const round = o.round === undefined ? 0.5 : o.round;
      if (o.bezel !== null) this.rect(face, x, y, w + 0.024, h + 0.024, { round, skew: o.skew, taper: o.taper, color: o.bezel || COL.black, rm: RM.gloss, nu: 5, nv: 2, off: 0.003, mirror: o.mirror !== false });
      this.rect(face, x, y, w, h, { part: 'lights', round, skew: o.skew, taper: o.taper, color: o.lens || COL.headLens, rm: RM.lens, light: o.group || G.HEAD, nu: 5, nv: 2, off: 0.0055, mirror: o.mirror !== false });
      if (o.drl) {
        const d = o.drl;
        this.rect(face, x + (d.dx || 0), y + d.dy, w * (d.w || 0.9), d.h || 0.018, { part: 'lights', round: 0.8, skew: o.skew, color: 0xffffff, rm: RM.lens, light: G.DRL, nu: 5, off: 0.0075, mirror: o.mirror !== false, lod0: true });
      }
      if (o.pods && !this.lod) {
        for (let k = 0; k < o.pods; k++) {
          const px = x + (k - (o.pods - 1) / 2) * (w / (o.pods + 0.4));
          this.rect(face, px, y + (o.podDy || 0), Math.min(h * 0.62, w / (o.pods + 1)), Math.min(h * 0.62, w / (o.pods + 1)), { part: 'lights', round: 1, color: 0x8e98a2, rm: RM.chrome, light: o.group || G.HEAD, nu: 4, nv: 2, off: 0.0075, mirror: o.mirror !== false });
        }
      }
      const hp = this.hit(face, x, y);
      if (hp) {
        this.anchors.headlights.push(hp.p.clone());
        if (o.mirror !== false) this.anchors.headlights.push(new THREE.Vector3(-hp.p.x, hp.p.y, hp.p.z));
      }
    }
    taillight(face, x, y, w, h, o) {
      o = o || {};
      const round = o.round === undefined ? 0.35 : o.round;
      if (o.bezel !== null) this.rect(face, x, y, w + 0.02, h + 0.02, { round, skew: o.skew, taper: o.taper, color: o.bezel || COL.black, rm: RM.gloss, nu: 5, nv: 2, off: 0.003, mirror: o.mirror !== false });
      this.rect(face, x, y, w, h, { part: 'lights', round, skew: o.skew, taper: o.taper, color: o.lens || COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 5, nv: 2, off: 0.0055, mirror: o.mirror !== false });
      if (o.rev) {
        const r = o.rev;
        this.rect(face, x + (r.dx || 0), y + (r.dy || 0), r.w, r.h, { part: 'lights', round: r.round || 0.4, color: COL.reverse, rm: RM.lens, light: G.REVERSE, nu: 3, off: 0.0075, mirror: o.mirror !== false });
      }
      if (o.line && !this.lod) this.rect(face, x, y + o.line, w * 0.96, 0.012, { part: 'lights', round: 0.5, color: 0xff3030, rm: RM.tail, light: G.TAIL, nu: 5, off: 0.0075, mirror: o.mirror !== false });
      const hp = this.hit(face, x, y);
      if (hp) {
        this.anchors.taillights.push(hp.p.clone());
        if (o.mirror !== false) this.anchors.taillights.push(new THREE.Vector3(-hp.p.x, hp.p.y, hp.p.z));
      }
    }
    plate(face, y, o) {
      o = o || {};
      const w = o.w || 0.46, h = o.h || 0.115;
      this.rect(face, o.x || 0, y, w, h, { part: 'lights', round: 0.1, color: 0xffffff, rm: RM.decal, light: face === 'rear' ? G.PLATE : G.NONE, uv: UVR.plate, text: true, nu: 2, off: o.off || 0.01, thick: 0.006 });
    }
    grille(y, w, h, o) {
      o = o || {};
      const round = o.round === undefined ? 0.3 : o.round;
      if (o.surround) this.rect('front', o.x || 0, y, w + 0.04, h + 0.04, { round, taper: o.taper, color: o.surround, rm: o.surround === COL.chrome ? RM.chrome : RM.gloss, nu: 6, nv: 2, off: 0.003, thick: 0.006 });
      this.rect('front', o.x || 0, y, w, h, { round, taper: o.taper, color: o.color || COL.grille, rm: RM.dark, nu: 6, nv: 2, off: o.surround ? 0.006 : 0.003 });
      const bars = this.lod ? 0 : o.bars || 0;
      for (let k = 0; k < bars; k++) {
        const by = y - h / 2 + (h * (k + 1)) / (bars + 1);
        this.rect('front', o.x || 0, by, w * 0.96, o.barH || 0.012, { round: 0.2, taper: o.taper, color: o.barColor || COL.chrome, rm: o.barColor ? RM.satin : RM.chrome, nu: 6, off: 0.009 });
      }
      const vbars = this.lod ? 0 : o.vbars || 0;
      for (let k = 0; k < vbars; k++) {
        const bx = (o.x || 0) - w / 2 + (w * (k + 1)) / (vbars + 1);
        this.rect('front', bx, y, 0.012, h * 0.94, { round: 0.2, color: o.barColor || COL.chrome, rm: o.barColor ? RM.satin : RM.chrome, nu: 1, nv: 2, off: 0.009 });
      }
    }
    /** Thin dark panel gaps on both sides: vertical lines at the given z. */
    seams(list) {
      if (this.lod) return;
      for (const s of list) {
        if (s.z !== undefined) this.quad('left', [s.z - 0.004 + (s.lean || 0) * 0, s.y0], [s.z + 0.004, s.y0], [s.z + 0.004 + (s.lean || 0), s.y1], [s.z - 0.004 + (s.lean || 0), s.y1], { color: 0x050505, rm: RM.plastic, nu: 1, nv: 3, off: 0.0025, mirror: true });
        else this.quad('left', [s.z0, s.y - 0.004], [s.z1, s.y - 0.004], [s.z1, s.y + 0.004], [s.z0, s.y + 0.004], { color: 0x050505, rm: RM.plastic, nu: 6, nv: 1, off: 0.0025, mirror: true });
      }
    }
    handles(zs, y, color) {
      if (this.lod) return;
      for (const z of zs) this.rect('left', z, y, 0.15, 0.032, { round: 0.9, color: color || COL.chrome, rm: color ? RM.gloss : RM.chrome, nu: 3, off: 0.003, thick: 0.01, mirror: true });
    }
    /** Door mirrors at (z, y) on the body side; `reach` how far they stand out. */
    mirrors(z, y, o) {
      if (this.lod) return;
      o = o || {};
      const h = this.hit('left', z, y - 0.12) || this.hit('left', z, y);
      if (!h) return;
      const reach = o.reach === undefined ? 0.05 : o.reach, sx = o.sx || 0.07, sy = o.sy || 0.1, sz = o.sz || 0.18;
      const x = h.p.x + reach + sx * 0.5;
      const col = o.color || 'body';
      this.box(col === 'body' ? 'paint' : 'trim', x, y + 0.05, z, sx, sy, sz, 0.03, col, RM.gloss, { mirror: true, ry: 0.12 });
      this.box('trim', (h.p.x - 0.1 + x) / 2, y + 0.02, z + 0.02, x - h.p.x + 0.1, 0.03, 0.05, 0.01, COL.black, RM.plastic, { mirror: true });
      // Mirror glass on the rear face.
      const g = new MeshData();
      const zz = z - sz / 2 - 0.002;
      g.flat([x - sx * 0.35, y + 0.01, zz], [x + sx * 0.4, y + 0.01, zz + 0.01], [x + sx * 0.4, y + 0.09, zz + 0.01], [x - sx * 0.35, y + 0.09, zz], [0, 0, -1]);
      this.add('trim', g, COL.mirror, RM.chrome);
      const g2 = new MeshData();
      g2.flat([-x + sx * 0.35, y + 0.01, zz], [-x - sx * 0.4, y + 0.01, zz + 0.01], [-x - sx * 0.4, y + 0.09, zz + 0.01], [-x + sx * 0.35, y + 0.09, zz], [0, 0, -1]);
      this.add('trim', g2, COL.mirror, RM.chrome);
    }
    exhaust(xs, y, r, o) {
      o = o || {};
      for (const x of xs) {
        const h = this.hit('rear', x, y + r + 0.02);
        const z = h ? h.p.z - 0.04 : -this.def.L / 2 + 0.05;
        const md = cylX(r, 0.16, this.lod ? 8 : 14, 0).at(x, y, z - 0.03, Math.PI / 2);
        this.add('trim', md, o.color || COL.chrome, o.color ? RM.metal : RM.chrome);
        if (!this.lod) this.add('trim', cylX(r * 0.8, 0.02, 12, 1).at(x, y, z - 0.1, -Math.PI / 2), 0x050505, RM.plastic);
        this.anchors.exhaust.push(new THREE.Vector3(x, y, z - 0.12));
      }
    }
    /** A roof sign / light bar body with its base; returns the roof height used. */
    roofY(z, x) {
      const h = this.hit('top', x || 0, z);
      return h ? h.p.y : this.def.H;
    }
  }

  // ------------------------------------------------------------ glass
  function addGlass(ctx, target, g) {
    const d = ctx.def;
    const inset = g.inset || 0.075;
    const nu = 7, nv = 3;
    // Windshield / rear window: rays along the glass line's outward normal.
    const line = (ln, sign, t0, t1, ins) => {
      const [p0, p1] = ln;
      let nz = p1[1] - p0[1], ny = -(p1[0] - p0[0]);
      const l = Math.hypot(nz, ny) || 1;
      nz /= l;
      ny /= l;
      if (nz * sign < 0) {
        nz = -nz;
        ny = -ny;
      }
      const face = {
        o: (a, b) => {
          const z = lerp(p0[0], p1[0], b), y = lerp(p0[1], p1[1], b);
          return [a, y + ny * 2, z + nz * 2];
        },
        d: [0, -ny, -nz],
      };
      // Half width at each height from a sideways ray just inside the glass.
      const halfAt = (b) => {
        const z = lerp(p0[0], p1[0], b) - nz * 0.06, y = lerp(p0[1], p1[1], b) - ny * 0.06;
        const h = ctx.surf.cast(5, y, z, -1, 0, 0);
        return h ? Math.abs(h.p.x) : d.W * 0.4;
      };
      const hb0 = halfAt(t0 + 0.02) - ins, hb1 = halfAt(t1 - 0.02) - ins;
      const map = (u, v) => {
        const b = lerp(t0, t1, v);
        return [(u * 2 - 1) * lerp(hb0, hb1, v), b];
      };
      ctx.patch(face, map, { color: COL.glass, rm: RM.glass, nu, nv, off: 0.004 });
      return { face, hb0, hb1 };
    };
    if (g.ws) {
      line(g.ws, 1, g.wsT ? g.wsT[0] : 0.05, g.wsT ? g.wsT[1] : 0.9, inset);
      // Wipers.
      if (!ctx.lod && g.wipers !== false) {
        const [p0, p1] = g.ws;
        const z = lerp(p0[0], p1[0], 0.1), y = lerp(p0[1], p1[1], 0.1);
        for (const x of [0.28, -0.32]) {
          const h = ctx.surf.cast(x, y + 2, z, 0, -1, 0);
          if (h) ctx.add('trim', roundBox(0.55, 0.012, 0.02, 0.005, 1).at(x - 0.06, h.p.y + 0.012, h.p.z + 0.01, 0, 0, -0.18), COL.black, RM.plastic);
        }
      }
    }
    if (g.rw) line(g.rw, -1, g.rwT ? g.rwT[0] : 0.08, g.rwT ? g.rwT[1] : 0.92, g.rwInset || inset);
    // Side windows: quads in (z, y) on the left side, mirrored.
    for (const w of g.side || []) {
      const zf = (y) => (w.f === 'A' ? zAt(g.ws, y) - (g.aw || 0.1) : w.f);
      const zr = (y) => (w.r === 'C' ? zAt(g.rw, y) + (g.cw || 0.12) : w.r);
      const b = w.b, t = w.t;
      ctx.quad('left', [zf(b), b], [zr(b), b], [zr(t), t], [zf(t), t], { color: COL.glass, rm: RM.glass, nu: 4, nv: 2, off: 0.004, mirror: true });
      if (g.seats && !ctx.lod) {
        // Seat backs and headrests seen through the tint (a hint of interior).
        const wh = t - b, zhi = Math.min(zf(b), zf(t)) - 0.1, zlo = Math.max(zr(b), zr(t)) + 0.1;
        for (const sz of g.seats) {
          if (sz > zhi || sz < zlo) continue;
          ctx.rect('left', sz, b + wh * 0.3, 0.36, wh * 0.58, { color: 0x34363b, rm: RM.plastic, round: 0.4, nu: 3, nv: 2, off: 0.0058, mirror: true });
          ctx.rect('left', sz, b + wh * 0.8, 0.2, wh * 0.22, { color: 0x3d4046, rm: RM.plastic, round: 0.7, nu: 3, nv: 2, off: 0.0062, mirror: true });
        }
      }
      if (w.trim !== false && !ctx.lod) {
        // Belt moulding under the window.
        ctx.quad('left', [zf(b) + 0.01, b - 0.022], [zr(b) - 0.01, b - 0.022], [zr(b) - 0.01, b - 0.004], [zf(b) + 0.01, b - 0.004], { color: g.beltColor || COL.black, rm: g.beltColor ? RM.chrome : RM.gloss, nu: 4, nv: 1, off: 0.003, mirror: true });
      }
    }
  }

  // ------------------------------------------------------- arch liners
  function addArchLiners(ctx, wheels, arches) {
    const segs = ctx.lod ? 6 : 12;
    for (const w of wheels) {
      if (w.x < 0) continue;
      const a = arches[w.front ? 0 : 1];
      if (!a) continue;
      const ra = a.ra - 0.012;
      const a0 = Math.asin(clamp((ctx.def.sill - a.yc) / a.ra, -0.99, 0.99));
      const xIn = w.x - w.width / 2 - 0.035;
      const hit = ctx.hit('left', w.z + a.ra + 0.06, a.yc + 0.05);
      const xOut = (hit ? hit.p.x : ctx.def.W / 2) - ctx.def.bevel * 0.6;
      for (const sg of [1, -1]) {
        const md = new MeshData();
        const row = [];
        for (let s = 0; s <= segs; s++) {
          const ang = lerp(a0, Math.PI - a0, s / segs), c = Math.cos(ang), sn = Math.sin(ang);
          const y = a.yc + ra * sn, z = w.z + ra * c;
          row.push([md.v(sg * xIn, y, z, 0, -sn, -c), md.v(sg * xOut, y, z, 0, -sn, -c)]);
        }
        for (let s = 0; s < segs; s++) md.quad(row[s][0], row[s + 1][0], row[s + 1][1], row[s][1]);
        // Blocker disc: hides the tunnel through the body and the far wheel.
        const c0 = md.v(sg * xIn, a.yc, w.z, sg, 0, 0);
        const rim = [];
        for (let s = 0; s <= segs * 2; s++) {
          const ang = (s / (segs * 2)) * Math.PI * 2;
          rim.push(md.v(sg * xIn, a.yc + Math.sin(ang) * a.ra, w.z + Math.cos(ang) * a.ra, sg, 0, 0));
        }
        for (let s = 0; s < segs * 2; s++) md.tri(c0, rim[s], rim[s + 1]);
        ctx.add('trim', md, COL.liner, RM.rubber);
      }
    }
  }

  // --------------------------------------------------- building a body
  const shadeUnder = (x, y, z, nx, ny) => (ny < -0.45 ? 0.12 : 1);

  function buildBody(id, lod, hex) {
    const d = DEFS[id];
    const key = id + '|' + lod + (d.livery ? '|' + hex : '');
    const hit = cache.bodies.get(key);
    if (hit) return hit;
    const q = LODQ[lod];
    const t0 = performance.now();

    const zF = d.L / 2 - d.fo, zR = -d.L / 2 + d.ro;
    const raF = d.R + (d.archGap === undefined ? 0.06 : d.archGap), raR = d.R + (d.archGapR === undefined ? (d.archGap === undefined ? 0.06 : d.archGap) : d.archGapR);
    const pts = d.body.concat(d.noRearArch ? [{ arch: [zF, d.R, raF], y: d.sill }] : [{ arch: [zR, d.R, raR], y: d.sill }, { arch: [zF, d.R, raF], y: d.sill }]);
    const lower = extrude(contour(pts, q.segs, q.maxSeg), d.W, d.bevel, q.bevelSegs, q.steps, q.capEdge);
    deform(lower, bodyDeform(d));
    const parts = [lower];
    let cab = null;
    if (d.cabin) {
      const c = d.cabin;
      cab = extrude(contour(c.pts, q.segs, q.maxSeg), c.width, c.bevel || 0.07, q.bevelSegs, q.cabSteps, q.capEdge);
      deform(cab, cabinDeform(c));
      parts.push(cab);
    }
    const extra = d.extraBodies ? d.extraBodies(q, lod) : [];
    for (const e of extra) parts.push(e.md);

    const surf = new Surface(parts);
    const ctx = new Ctx(d, lod, surf, hex);
    ctx.paint.add(lower, ctx.bodyCol, null, 0, null, false, shadeUnder);
    if (cab) ctx.paint.add(cab, d.cabin.color ? ctx.col(d.cabin.color) : ctx.bodyCol, null, 0, null, false, shadeUnder);
    for (const e of extra) ctx.add(e.part || 'paint', e.md, e.color || 'body', e.rm, e.light);

    // Wheels: tyres sit just inside the body side at each axle.
    const wheels = [];
    const tyreW = d.tyreW || 0.22, tyreWR = d.tyreWR || tyreW;
    const sideX = (z) => {
      const h = surf.face('left', z, d.R + 0.05);
      return h ? h.p.x : d.W / 2;
    };
    const xF = sideX(zF + raF + 0.06) - tyreW / 2 - (d.inset === undefined ? 0.025 : d.inset);
    const xR = sideX(zR + raR + 0.06) - tyreWR / 2 - (d.inset === undefined ? 0.025 : d.inset);
    for (const [x, z, front, w] of [[xF, zF, true, tyreW], [-xF, zF, true, tyreW], [xR, zR, false, tyreWR], [-xR, zR, false, tyreWR]]) {
      wheels.push({ x, z, front, width: w, radius: d.R });
    }
    addArchLiners(ctx, wheels, [{ ra: raF, yc: d.R }, d.noRearArch ? null : { ra: raR, yc: d.R }]);
    if (d.glass) addGlass(ctx, cab, d.glass);
    if (d.details) d.details(ctx, d);

    const out = {
      paint: ctx.paint.build(),
      trim: ctx.trim.build(),
      lights: ctx.lights.build(),
      wheels,
      anchors: ctx.anchors,
      tris: ctx.paint.tris + ctx.trim.tris + ctx.lights.tris,
      trackF: xF * 2,
      trackR: xR * 2,
      ms: performance.now() - t0,
    };
    surf.dispose();
    cache.bodies.set(key, out);
    return out;
  }

  // ------------------------------------------------------ shared details
  /** A textured quad (uv 0..1) with its own normal. */
  function uvQuad(p0, p1, p2, p3, hint) {
    const md = new MeshData();
    md.flat(p0, p1, p2, p3, hint);
    md.uv = [0, 0, 1, 0, 1, 1, 0, 1];
    return md;
  }

  /** Black wheel-arch flares following the arch lip on both sides. */
  function flares(ctx, zc, ra, yc, width, color) {
    const a0 = Math.asin(clamp((ctx.def.sill - yc) / ra, -0.99, 0.99));
    const map = (u, v) => {
      const ang = lerp(Math.PI - a0 + 0.05, a0 - 0.05, u), r = ra + lerp(0.004, width, v);
      return [zc + r * Math.cos(ang), yc + r * Math.sin(ang)];
    };
    ctx.patch('left', map, { color: color || COL.plastic, rm: RM.plastic, nu: 10, nv: 1, off: 0.004, thick: 0.014, mirror: true });
  }

  /** Rear wing on two stalks. */
  function wing(ctx, z, y, span, chord, o) {
    o = o || {};
    const col = o.color || 0x131416;
    const part = col === 'body' ? 'paint' : 'trim';
    ctx.box(part, 0, y, z, span, 0.035, chord, 0.015, col, RM.satin, { rx: o.tilt === undefined ? -0.12 : o.tilt });
    if (o.plates !== false) ctx.box(part, span / 2, y + 0.02, z - 0.01, 0.018, o.plateH || 0.16, chord * 1.2, 0.006, col, RM.satin, { mirror: true });
    const deck = ctx.hit('top', span * 0.3, z);
    const y0 = deck ? deck.p.y : y - 0.2;
    const h = y - y0;
    ctx.box('trim', span * 0.3, y0 + h / 2, z + 0.02, 0.03, h + 0.02, 0.12, 0.008, 0x1a1b1d, RM.satin, { mirror: true });
  }

  /** Roof light bar (police red / blue or ambulance red / white). */
  function lightBar(ctx, z, o) {
    o = o || {};
    const w = o.w || 1.2;
    const y = ctx.roofY(z, 0);
    ctx.box('trim', 0, y + 0.03, z, w + 0.04, 0.05, 0.3, 0.02, COL.black, RM.gloss);
    const seg = w / 2 - 0.08;
    const lens = (x, sw, group, col) => ctx.box('lights', x, y + 0.095, z, sw, 0.08, 0.25, 0.03, col, RM.lens, { light: group });
    lens(0.08 + seg / 2, seg, o.left || G.RED, o.leftCol || 0xa8121a);
    lens(-0.08 - seg / 2, seg, o.right || G.BLUE, o.rightCol || 0x1636b0);
    lens(0, 0.14, o.mid || G.NONE, 0xd8dde2);
    ctx.anchors.siren = new THREE.Vector3(0, y + 0.1, z);
  }

  /** The common sedan face and tail (Halcyon and its taxi / police versions). */
  function halcyonDetails(ctx, o) {
    o = o || {};
    ctx.headlight('front', 0.6, 0.665, 0.44, 0.115, { round: 0.45, taper: 0.12, pods: 2, drl: { dy: -0.047, h: 0.014, w: 0.86 } });
    ctx.grille(0.6, 0.64, 0.12, { surround: o.chrome === false ? COL.black : COL.chrome, bars: 2, round: 0.35, barColor: o.chrome === false ? 0x2a2c2f : undefined });
    ctx.rect('front', 0, 0.345, 1.02, 0.11, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
    ctx.rect('front', 0.66, 0.35, 0.1, 0.055, { part: 'lights', round: 0.7, color: 0xe8edf0, rm: RM.lens, light: G.DRL, nu: 3, off: 0.005, mirror: true, lod0: true });
    ctx.rect('front', 0, 0.265, 1.5, 0.04, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003, thick: 0.01 });
    ctx.plate('front', 0.465);
    // Tail.
    ctx.taillight('rear', 0.62, 0.84, 0.42, 0.12, { round: 0.3, taper: -0.1, rev: { dx: -0.13, dy: -0.025, w: 0.1, h: 0.04 }, line: 0.03 });
    ctx.rect('rear', 0, 0.865, 0.74, 0.03, { round: 0.4, color: o.chrome === false ? COL.black : COL.chrome, rm: o.chrome === false ? RM.gloss : RM.chrome, nu: 5, off: 0.004 });
    ctx.plate('rear', 0.63);
    ctx.rect('rear', 0, 0.345, 1.5, 0.12, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003 });
    ctx.rect('rear', 0.7, 0.42, 0.1, 0.03, { part: 'lights', round: 0.6, color: 0x700a0a, rm: RM.tail, light: G.NONE, nu: 2, off: 0.005, mirror: true, lod0: true });
    ctx.exhaust([-0.55], 0.29, 0.036);
    // Sides.
    ctx.seams([
      { z: 0.95, y0: 0.26, y1: 0.93 },
      { z: -0.38, y0: 0.25, y1: 0.95 },
      { z: -1.0, y0: 0.58, y1: 0.95, lean: 0.03 },
    ]);
    ctx.handles([0.18, -0.72], 0.8, o.chrome === false ? COL.black : undefined);
    ctx.rect('left', 0, 0.255, 1.9, 0.05, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.01, mirror: true });
    ctx.mirrors(0.6, 0.965, { color: o.mirrorColor || 'body' });
    ctx.rect('left', 1.9, 0.62, 0.07, 0.03, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
  }

  function sedanGlass() {
    const gh = greenhouse({ zb: 0.74, yb: 0.93, top: [-0.12, 1.42], mid: [-0.6, 1.46, 0.35], rear: [-1.08, 1.42], base: [-1.72, 1.0], bot: 0.84, r: [0.03, 0.22, 0.22, 0.05] });
    return {
      cabin: { pts: gh.pts, width: 1.62, bevel: 0.07, tumble: 0.16, y0: 0.92, y1: 1.46, crown: 0.02, wf: [0.07, -0.12, 0.74], wr: [0.05, -1.08, -1.72] },
      glass: { ws: gh.ws, rw: gh.rw, aw: 0.09, cw: 0.2, side: [{ f: 'A', r: -0.34, b: 0.99, t: 1.37 }, { f: -0.42, r: 'C', b: 0.99, t: 1.37 }] },
    };
  }

  // ------------------------------------------------------- definitions
  // Body numbers are metres in the car frame. Profiles run from the front
  // bottom, up the nose, over the top and down the tail; the arches are added.
  const DEFS = {};

  // 1. Vireo GT: low, wide mid-engine coupe.
  const VIREO_GH = greenhouse({ zb: 0.62, yb: 0.84, top: [-0.28, 1.14], mid: [-0.62, 1.16, 0.35], rear: [-0.95, 1.12], base: [-1.85, 0.93], bot: 0.72, r: [0.03, 0.25, 0.3, 0.1] });
  DEFS.vireo = {
    cabin: { pts: VIREO_GH.pts, width: 1.4, bevel: 0.08, tumble: 0.18, y0: 0.85, y1: 1.16, crown: 0.02, wf: [0.1, -0.28, 0.62], wr: [0.08, -0.95, -1.85] },
    glass: { ws: VIREO_GH.ws, rw: VIREO_GH.rw, rwT: [0.05, 0.45], aw: 0.09, side: [{ f: 'A', r: -0.85, b: 0.9, t: 1.08 }] },
    L: 4.45, W: 1.98, H: 1.17, fo: 0.98, ro: 0.86, R: 0.34, tyreW: 0.25, tyreWR: 0.31, sill: 0.13, archGap: 0.04, wheel: 'split',
    body: [
      [2.06, 0.15, 0.03], [2.225, 0.28, 0.08], [2.2, 0.42, 0.12], [1.85, 0.6, 0.3], [1.2, 0.8, 0.4], [0.55, 0.86, 0.1],
      [-0.3, 0.9, 0.4], [-1.3, 0.98, 0.3], [-1.95, 0.97, 0.12], [-2.18, 0.94, 0.05], [-2.225, 0.78, 0.08], [-2.2, 0.45, 0.06],
      [-2.08, 0.2, 0.04], [-1.95, 0.15, 0.02],
    ],
    bevel: 0.06,
    plan: [[-2.225, 0.9], [-1.8, 0.99], [-1.365, 1.0], [-0.6, 0.93], [0.3, 0.91], [1.245, 0.955], [1.8, 0.9], [2.225, 0.78]],
    nose: 0.12, tail: 0.08, endLen: 0.55, tumble: [0.5, 0.97, 0.12],
    dip: [[0.75, 2.3, 0.07, 0.3, 0.2]],
    seatZ: -0.35,
    details(ctx) {
      ctx.headlight('front', 0.64, 0.5, 0.36, 0.065, { round: 0.6, skew: 0.5, taper: -0.2, drl: { dy: -0.028, h: 0.012, w: 0.9 }, pods: 2 });
      ctx.rect('front', 0.58, 0.27, 0.44, 0.14, { round: 0.5, taper: 0.15, color: COL.grille, rm: RM.dark, nu: 5, off: 0.003, mirror: true });
      ctx.rect('front', 0, 0.3, 0.52, 0.1, { round: 0.5, color: COL.grille, rm: RM.dark, nu: 5, off: 0.003 });
      ctx.rect('front', 0, 0.17, 1.74, 0.035, { round: 0.3, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.014 });
      // Side intakes ahead of the rear wheels, skirts.
      ctx.rect('left', -0.64, 0.56, 0.4, 0.2, { round: 0.5, taper: -0.3, skew: -0.3, color: COL.grille, rm: RM.dark, nu: 4, nv: 2, off: 0.003, mirror: true });
      ctx.rect('left', -0.05, 0.19, 1.7, 0.06, { round: 0.4, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.012, mirror: true });
      ctx.seams([{ z: 0.72, y0: 0.22, y1: 0.84, lean: -0.08 }, { z: -0.44, y0: 0.24, y1: 0.9, lean: 0.06 }]);
      ctx.mirrors(0.42, 0.86, { reach: 0.1, sy: 0.08, sz: 0.16 });
      // Tail: a full-width light blade, diffuser with fins, twin centre exhausts.
      ctx.rect('rear', 0, 0.83, 1.66, 0.032, { part: 'lights', round: 0.6, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 10, off: 0.005 });
      ctx.taillight('rear', 0.66, 0.8, 0.34, 0.07, { round: 0.7, skew: -0.4, rev: { dx: -0.08, dy: -0.005, w: 0.08, h: 0.03 } });
      ctx.rect('rear', 0, 0.31, 1.5, 0.24, { round: 0.4, color: COL.grille, rm: RM.dark, nu: 6, nv: 2, off: 0.003 });
      if (!ctx.lod) for (const x of [0.3, 0.52, 0.74]) ctx.rect('rear', x, 0.28, 0.018, 0.2, { color: 0x1a1b1d, rm: RM.satin, nu: 1, nv: 2, off: 0.003, thick: 0.05, mirror: true });
      ctx.plate('rear', 0.58);
      ctx.exhaust([-0.12, 0.12], 0.38, 0.045);
      ctx.rect('rear', 0, 0.5, 1.2, 0.1, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003, lod0: true });
      // Engine cover louvres and a low wing.
      if (!ctx.lod) for (let k = 0; k < 5; k++) ctx.rect('top', 0, -1.3 - k * 0.1, 0.9, 0.028, { color: 0x0c0d0e, rm: RM.dark, nu: 4, off: 0.003, thick: 0.01 });
      wing(ctx, -1.98, 1.06, 1.66, 0.26, { tilt: -0.1, plateH: 0.12 });
    },
  };

  // 2. Halcyon: the everyday four-door.
  DEFS.halcyon = Object.assign({
    L: 4.72, W: 1.84, H: 1.48, fo: 0.96, ro: 1.0, R: 0.335, tyreW: 0.225, sill: 0.22, archGap: 0.06, wheel: 'alloy',
    body: [
      [2.28, 0.26, 0.04], [2.36, 0.42, 0.1], [2.35, 0.62, 0.1], [2.24, 0.77, 0.14], [1.4, 0.88, 0.4], [0.74, 0.93, 0.1],
      [-1.0, 0.95, 0.4], [-1.7, 0.99, 0.2], [-2.22, 0.99, 0.14], [-2.35, 0.88, 0.1], [-2.36, 0.6, 0.1], [-2.33, 0.32, 0.06],
      [-2.22, 0.25, 0.03],
    ],
    bevel: 0.06,
    plan: [[-2.36, 0.9], [-1.9, 0.975], [-1.2, 1.0], [0.6, 1.0], [1.5, 0.985], [2.0, 0.95], [2.36, 0.87]],
    nose: 0.1, tail: 0.08, endLen: 0.5, tumble: [0.62, 1.0, 0.07],
    details(ctx) {
      halcyonDetails(ctx);
    },
  }, sedanGlass());

  // 3. Pipit: small hatchback.
  (function () {
    const gh = greenhouse({ zb: 0.86, yb: 0.92, top: [0.08, 1.44], mid: [-0.7, 1.49, 0.4], rear: [-1.58, 1.46], base: [-1.86, 1.0], bot: 0.84, r: [0.03, 0.22, 0.14, 0.05], baseOut: 0.02 });
    DEFS.pipit = {
      L: 3.86, W: 1.72, H: 1.5, fo: 0.76, ro: 0.62, R: 0.3, tyreW: 0.195, sill: 0.2, archGap: 0.055, wheel: 'alloy',
      body: [
        [1.84, 0.24, 0.04], [1.93, 0.42, 0.1], [1.91, 0.62, 0.1], [1.78, 0.76, 0.14], [1.2, 0.87, 0.3], [0.86, 0.92, 0.08],
        [-0.6, 0.97, 0.4], [-1.84, 0.99, 0.08], [-1.93, 0.9, 0.08], [-1.93, 0.45, 0.1], [-1.88, 0.28, 0.05], [-1.8, 0.23, 0.03],
      ],
      bevel: 0.06,
      plan: [[-1.93, 0.92], [-1.5, 0.99], [0.5, 1.0], [1.2, 0.98], [1.6, 0.94], [1.93, 0.86]],
      nose: 0.1, tail: 0.06, endLen: 0.45, tumble: [0.62, 0.99, 0.06],
      cabin: { pts: gh.pts, width: 1.56, bevel: 0.07, tumble: 0.15, y0: 0.92, y1: 1.49, crown: 0.02, wf: [0.06, 0.08, 0.86], wr: [0.02, -1.58, -1.86] },
      glass: { ws: gh.ws, rw: gh.rw, rwT: [0.06, 0.85], aw: 0.09, cw: 0.14, side: [{ f: 'A', r: -0.25, b: 0.98, t: 1.41 }, { f: -0.33, r: 'C', b: 0.98, t: 1.41 }] },
      details(ctx, d) {
        pipitDetails(ctx, d);
      },
    };
  })();
  function pipitDetails(ctx, d) {
    const beater = !!d.beater;
    ctx.headlight('front', 0.56, 0.665, 0.32, 0.15, { round: 0.75, pods: 1, lens: beater ? 0x8a8a80 : undefined, drl: beater ? null : { dy: -0.06, h: 0.014, w: 0.7 } });
    ctx.grille(0.63, 0.48, 0.08, { round: 0.6, bars: 1, barColor: 0x303235 });
    ctx.rect('front', 0, 0.36, 0.92, 0.13, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
    ctx.plate('front', 0.49, { w: 0.42, h: 0.105 });
    ctx.taillight('rear', 0.66, 0.84, 0.19, 0.2, { round: 0.3, rev: { dy: -0.06, w: 0.12, h: 0.035 } });
    ctx.plate('rear', 0.62, { w: 0.42, h: 0.105 });
    ctx.rect('rear', 0, 0.34, 1.4, 0.12, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003 });
    ctx.exhaust([-0.5], 0.27, 0.03, { color: beater ? 0x3a3027 : undefined });
    ctx.seams([{ z: 0.8, y0: 0.24, y1: 0.93 }, { z: -0.29, y0: 0.24, y1: 0.96 }, { z: -0.9, y0: 0.52, y1: 0.97, lean: 0.02 }]);
    ctx.handles([0.1, -0.65], 0.81, COL.black);
    ctx.rect('left', -0.05, 0.25, 1.6, 0.05, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003, thick: 0.008, mirror: true });
    ctx.mirrors(0.72, 0.955, { color: beater ? COL.black : 'body', sy: 0.09, sz: 0.15 });
    // Roof spoiler over the hatch.
    const y = ctx.roofY(-1.55, 0);
    ctx.box('paint', 0, y + 0.015, -1.62, 1.28, 0.04, 0.2, 0.018, 'body', null, { rx: 0.18 });
    if (beater) {
      // Mismatched primer door, rust, a dented rear quarter (see dents below).
      ctx.quad('left', [0.8, 0.27], [-0.28, 0.27], [-0.28, 0.95], [0.8, 0.94], { part: 'paint', color: 0x8b8e86, nu: 4, nv: 3, off: 0.0035 });
      for (const [z, yy, s] of [[1.52, 0.44, 0.12], [-1.62, 0.5, 0.16], [-0.1, 0.28, 0.1], [1.1, 0.75, 0.08]]) {
        ctx.rect('left', z, yy, s * 1.3, s, { round: 1, color: 0x5b3a22, rm: [0.95, 0.1], nu: 3, nv: 2, off: 0.003, mirror: z < 0 });
      }
      ctx.rect('rear', -0.3, 0.72, 0.3, 0.14, { round: 1, color: 0x5b3a22, rm: [0.95, 0.1], nu: 3, nv: 2, off: 0.003, lod0: true });
    }
  }

  // 4. Ironclad 68: long-hood fastback muscle car with a scoop and twin stripes.
  (function () {
    const gh = greenhouse({ zb: 0.45, yb: 0.92, top: [-0.28, 1.32], mid: [-0.7, 1.34, 0.3], rear: [-1.05, 1.31], base: [-2.1, 0.99], bot: 0.84, r: [0.03, 0.18, 0.3, 0.1] });
    DEFS.ironclad = {
      L: 5.0, W: 1.92, H: 1.35, fo: 1.08, ro: 1.12, R: 0.345, tyreW: 0.25, tyreWR: 0.27, sill: 0.2, archGap: 0.065, wheel: 'mag', livery: true,
      body: [
        [2.42, 0.25, 0.03], [2.5, 0.36, 0.04], [2.51, 0.72, 0.05], [2.44, 0.84, 0.06], [1.6, 0.89, 0.5], [0.45, 0.92, 0.1],
        [-0.5, 0.93, 0.3], [-1.35, 0.98, 0.3], [-2.3, 0.98, 0.1], [-2.5, 0.93, 0.05], [-2.5, 0.4, 0.05], [-2.42, 0.25, 0.03],
      ],
      bevel: 0.05,
      plan: [[-2.5, 0.93], [-2.1, 0.985], [-1.38, 1.0], [-0.5, 0.965], [0.6, 0.97], [1.42, 0.985], [2.2, 0.96], [2.5, 0.92]],
      nose: 0.05, tail: 0.04, endLen: 0.4, tumble: [0.66, 0.98, 0.06],
      cabin: { pts: gh.pts, width: 1.52, bevel: 0.07, tumble: 0.15, y0: 0.92, y1: 1.34, crown: 0.015, wf: [0.05, -0.28, 0.45], wr: [0.03, -1.05, -2.1] },
      glass: { ws: gh.ws, rw: gh.rw, rwT: [0.04, 0.55], aw: 0.09, cw: 0.35, beltColor: COL.chrome, side: [{ f: 'A', r: -0.62, b: 0.98, t: 1.28 }, { f: -0.7, r: 'C', b: 0.99, t: 1.26 }] },
      seatZ: -0.25,
      details(ctx) {
        const stripe = stripeFor(ctx.hex);
        // Full-width grille with four round lamps.
        ctx.grille(0.6, 1.74, 0.22, { surround: COL.chrome, round: 0.15, bars: 1, vbars: 0 });
        for (const x of [0.74, 0.54]) ctx.headlight('front', x, 0.6, 0.15, 0.15, { round: 1, bezel: COL.chrome, pods: 0 });
        ctx.rect('front', 0, 0.6, 0.3, 0.1, { color: 0x1a1b1d, rm: RM.satin, round: 0.3, nu: 3, off: 0.01, lod0: true });
        ctx.box('trim', 0, 0.36, 2.52, 1.84, 0.1, 0.1, 0.035, COL.chrome, RM.chrome);
        ctx.plate('front', 0.36, { off: 0.07 });
        // Tail panel with wide lamps; chrome bumper.
        ctx.rect('rear', 0, 0.75, 1.74, 0.2, { round: 0.15, color: 0x0c0c0d, rm: RM.gloss, nu: 8, off: 0.003 });
        ctx.taillight('rear', 0.5, 0.75, 0.66, 0.13, { round: 0.12, bezel: COL.chrome, rev: { dx: -0.26, w: 0.1, h: 0.08, round: 0.2 } });
        ctx.box('trim', 0, 0.38, -2.52, 1.84, 0.1, 0.1, 0.035, COL.chrome, RM.chrome);
        ctx.plate('rear', 0.56);
        ctx.exhaust([0.55, -0.55], 0.25, 0.04);
        ctx.seams([{ z: 0.92, y0: 0.24, y1: 0.92 }, { z: -0.62, y0: 0.26, y1: 0.93, lean: 0.03 }]);
        ctx.handles([-0.45], 0.82);
        ctx.rect('left', -0.05, 0.27, 2.1, 0.022, { color: COL.chrome, rm: RM.chrome, nu: 8, off: 0.003, mirror: true });
        ctx.mirrors(0.38, 0.95, { color: COL.chrome, sx: 0.06, sy: 0.07, sz: 0.12, reach: 0.08 });
        // Twin stripes over hood, roof, fastback and deck, and a hood scoop.
        for (const x of [0.13, -0.13]) {
          for (const [z0, z1, n] of [[0.52, 2.47, 16], [-1.07, -0.26, 8], [-2.47, -1.64, 8]]) {
            ctx.rect('top', x, (z0 + z1) / 2, 0.16, z1 - z0, { part: 'paint', color: stripe, nu: 1, nv: n, off: 0.006 });
          }
        }
        const hy = ctx.roofY(1.3, 0);
        ctx.box('paint', 0, hy + 0.04, 1.3, 0.62, 0.1, 0.72, 0.04, 'body');
        ctx.box('trim', 0, hy + 0.05, 1.67, 0.5, 0.055, 0.03, 0.012, COL.grille, RM.dark);
      },
    };
  })();
  function stripeFor(hex) {
    const c = new THREE.Color(hex);
    return c.r + c.g + c.b > 1.4 ? 0x141414 : 0xf1efe8;
  }

  // 5. Porter: boxy high-roof delivery van (6th: medic uses the same body).
  DEFS.porter = {
    L: 5.2, W: 2.02, H: 2.44, fo: 0.95, ro: 0.98, R: 0.36, tyreW: 0.225, sill: 0.3, archGap: 0.075, wheel: 'silversteel',
    body: [
      [2.52, 0.33, 0.03], [2.6, 0.48, 0.06], [2.59, 0.86, 0.12], [2.42, 1.08, 0.2], [1.95, 1.2, 0.12], [1.28, 2.08, 0.28],
      [0.7, 2.4, 0.3], [-2.45, 2.42, 0.12], [-2.6, 2.3, 0.08], [-2.6, 0.52, 0.05], [-2.54, 0.34, 0.03],
    ],
    bevel: 0.08,
    plan: [[-2.6, 0.97], [-2.3, 1.0], [1.7, 1.0], [2.2, 0.96], [2.6, 0.88]],
    nose: 0.14, tail: 0.03, endLen: 0.6, tumble: [1.4, 2.42, 0.07],
    glass: { ws: [[1.95, 1.2], [1.28, 2.08]], wsT: [0.08, 0.86], inset: 0.09, aw: 0.1, side: [{ f: 'A', r: 0.42, b: 1.25, t: 1.95 }] },
    seatZ: 0.95,
    details(ctx, d) {
      vanDetails(ctx, d);
    },
  };
  function vanDetails(ctx, d) {
    const medic = !!d.medic;
    ctx.headlight('front', 0.72, 0.95, 0.36, 0.16, { round: 0.3, pods: 1, drl: { dy: -0.065, h: 0.014, w: 0.8 } });
    ctx.grille(0.88, 0.86, 0.18, { round: 0.3, bars: 3, barColor: 0x3a3c3f });
    ctx.rect('front', 0, 0.46, 2.0, 0.26, { round: 0.3, color: COL.plastic, rm: RM.plastic, nu: 8, nv: 2, off: 0.004, thick: 0.03 });
    ctx.plate('front', 0.5, { off: 0.045 });
    ctx.taillight('rear', 0.9, 1.0, 0.13, 0.5, { round: 0.2, rev: { dy: -0.18, w: 0.1, h: 0.08 } });
    ctx.rect('rear', 0, 0.45, 2.0, 0.22, { round: 0.3, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.004, thick: 0.03 });
    ctx.plate('rear', 0.72, { w: 0.42 });
    ctx.rect('rear', 0, 1.4, 0.008, 1.8, { color: 0x050505, rm: RM.plastic, nu: 1, nv: 3, off: 0.003, lod0: true });
    for (const x of [0.46, -0.46]) ctx.rect('rear', x, 1.78, 0.62, 0.42, { round: 0.2, color: COL.glass, rm: RM.glass, nu: 2, off: 0.004 });
    ctx.exhaust([-0.6], 0.35, 0.035, { color: 0x4a4a4a });
    ctx.seams([
      { z: 1.2, y0: 0.82, y1: 1.3 }, { z: 0.36, y0: 0.35, y1: 2.05 }, { z: -0.92, y0: 0.35, y1: 2.05 },
      { z0: -0.92, z1: 0.36, y: 2.05 },
    ]);
    ctx.handles([0.5, -0.8], 1.02, COL.black);
    ctx.rect('left', -0.2, 0.62, 4.4, 0.09, { round: 0.3, color: COL.plastic, rm: RM.plastic, nu: 10, off: 0.003, thick: 0.012, mirror: true });
    ctx.mirrors(1.45, 1.32, { reach: 0.16, sx: 0.07, sy: 0.24, sz: 0.2, color: COL.black });
    ctx.rect('left', 2.35, 0.9, 0.06, 0.035, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
    if (medic) {
      ctx.rect('left', -1.0, 1.32, 2.9, 0.68, { part: 'lights', color: 0xffffff, rm: RM.decal, uv: UVR.medic, text: true, nu: 6, nv: 2, off: 0.0045, mirror: true });
      ctx.rect('left', 1.28, 1.13, 0.95, 0.07, { part: 'lights', color: 0xc3121b, rm: RM.decal, nu: 4, off: 0.0045, mirror: true });
      for (const x of [0.46, -0.46]) ctx.rect('rear', x, 1.2, 0.34, 0.34, { part: 'lights', color: 0xffffff, rm: RM.decal, uv: UVR.cross, nu: 2, off: 0.005 });
      ctx.rect('front', 0, 1.62, 0.5, 0.5, { part: 'lights', color: 0xffffff, rm: RM.decal, uv: UVR.cross, nu: 2, nv: 2, off: 0.005, lod0: true });
      lightBar(ctx, 0.95, { w: 1.5, left: G.RED, right: G.RED, mid: G.WHITE, leftCol: 0xa8121a, rightCol: 0xa8121a });
      for (const x of [0.92, -0.92]) {
        const y = ctx.roofY(-2.4, x * 0.9);
        ctx.box('lights', x * 0.95, y + 0.05, -2.42, 0.14, 0.1, 0.14, 0.03, x > 0 ? 0xa8121a : 0xd8dde2, RM.lens, { light: x > 0 ? G.RED : G.WHITE });
      }
      ctx.rect('front', 0.3, 0.62, 0.12, 0.05, { part: 'lights', round: 0.5, color: 0xd8dde2, rm: RM.lens, light: G.WHITE, nu: 2, off: 0.01, mirror: true, lod0: true });
    }
  }

  // 6. Mesa: pickup with an open bed.
  (function () {
    const gh = greenhouse({ zb: 0.95, yb: 1.28, top: [0.25, 1.86], mid: [-0.3, 1.88, 0.2], rear: [-0.78, 1.87], base: [-0.84, 1.32], bot: 1.2, r: [0.03, 0.14, 0.06, 0.02], baseOut: 0.02 });
    DEFS.mesa = {
      L: 5.4, W: 2.0, H: 1.89, fo: 0.95, ro: 1.12, R: 0.41, tyreW: 0.27, sill: 0.4, archGap: 0.07, wheel: 'truck',
      body: [
        [2.62, 0.42, 0.03], [2.7, 0.55, 0.05], [2.7, 1.02, 0.06], [2.6, 1.17, 0.08], [1.6, 1.24, 0.3], [0.95, 1.28, 0.05],
        [-0.82, 1.3, 0.02], [-0.86, 1.3], [-0.86, 1.0], [-2.64, 1.0, 0.02], [-2.7, 0.94, 0.03], [-2.7, 0.52, 0.04], [-2.62, 0.42, 0.03],
      ],
      bevel: 0.06,
      plan: [[-2.7, 0.99], [1.8, 1.0], [2.3, 0.98], [2.7, 0.93]],
      nose: 0.06, tail: 0.0, endLen: 0.4, tumble: [1.0, 1.3, 0.03],
      cabin: { pts: gh.pts, width: 1.84, bevel: 0.06, tumble: 0.1, y0: 1.28, y1: 1.88, crown: 0.015, wf: [0.05, 0.25, 0.95] },
      glass: { ws: gh.ws, rw: gh.rw, rwT: [0.15, 0.85], rwInset: 0.25, aw: 0.1, side: [{ f: 'A', r: -0.05, b: 1.36, t: 1.8 }, { f: -0.13, r: -0.66, b: 1.36, t: 1.8 }] },
      seatZ: 0.25,
      extraBodies(q, lod) {
        // Bed walls and tailgate are part of the surface, so lamps can sit on them.
        const x = 0.99 - 0.04;
        return [
          { md: roundBox(0.08, 0.34, 1.8, 0.03, lod).at(x, 1.15, -1.78) },
          { md: roundBox(0.08, 0.34, 1.8, 0.03, lod).at(-x, 1.15, -1.78) },
          { md: roundBox(1.84, 0.33, 0.07, 0.025, lod).at(0, 1.145, -2.655) },
        ];
      },
      details(ctx) {
        ctx.grille(0.92, 1.3, 0.34, { surround: COL.chrome, bars: 3, vbars: 2, round: 0.15 });
        ctx.headlight('front', 0.8, 0.95, 0.28, 0.2, { round: 0.2, pods: 2, drl: { dy: -0.085, h: 0.014, w: 0.9 } });
        ctx.box('trim', 0, 0.56, 2.72, 1.96, 0.2, 0.16, 0.04, 0x2a2b2d, RM.satin);
        ctx.box('trim', 0.45, 0.5, 2.82, 0.06, 0.06, 0.06, 0.02, 0xb01818, RM.gloss, { mirror: true, lod0: true });
        // Bed: floor, wheel humps, rail caps, tailgate handle.
        ctx.box('trim', 0, 1.012, -1.78, 1.82, 0.02, 1.76, 0.005, 0x1a1a1b, RM.rubber);
        ctx.box('trim', 0.72, 1.07, -1.58, 0.3, 0.14, 0.95, 0.05, 0x1a1a1b, RM.rubber, { mirror: true });
        ctx.box('trim', 0.95, 1.33, -1.78, 0.1, 0.025, 1.82, 0.01, COL.plastic, RM.plastic, { mirror: true });
        ctx.rect('rear', 0, 1.24, 0.22, 0.04, { color: COL.black, rm: RM.gloss, round: 0.6, nu: 2, off: 0.003, thick: 0.01 });
        ctx.taillight('rear', 0.95, 1.12, 0.07, 0.28, { round: 0.2, rev: { dy: -0.1, w: 0.05, h: 0.07 }, bezel: null });
        ctx.box('trim', 0, 0.56, -2.74, 1.96, 0.16, 0.14, 0.04, 0x2a2b2d, RM.satin);
        ctx.plate('rear', 0.77);
        ctx.exhaust([-0.7], 0.46, 0.04, { color: 0x505050 });
        flares(ctx, 1.75, 0.48, 0.41, 0.075);
        flares(ctx, -1.58, 0.48, 0.41, 0.075);
        ctx.box('trim', 1.0, 0.42, 0.1, 0.14, 0.035, 1.5, 0.012, COL.plastic, RM.plastic, { mirror: true });
        ctx.seams([{ z: 1.2, y0: 0.9, y1: 1.28 }, { z: -0.08, y0: 0.5, y1: 1.3 }, { z0: 1.2, z1: 1.26, y: 0.9 }]);
        ctx.handles([0.35, -0.5], 1.12, COL.black);
        ctx.mirrors(0.78, 1.38, { reach: 0.16, sx: 0.07, sy: 0.2, sz: 0.2, color: COL.black });
      },
    };
  })();

  // 6b. Scout: the army's jeep, a Mesa with a roll cage, a spare and a matt coat.
  DEFS.scout = Object.assign({}, DEFS.mesa, {
    finish: 'matte',
    details(ctx, d) {
      DEFS.mesa.details(ctx, d);
      const cage = 0x26281f;
      ctx.box('trim', 0, 1.98, -0.9, 1.74, 0.07, 0.07, 0.02, cage, RM.satin);
      ctx.box('trim', 0.84, 1.66, -0.9, 0.07, 0.66, 0.07, 0.02, cage, RM.satin, { mirror: true });
      ctx.box('trim', 0.84, 1.66, -2.45, 0.07, 0.66, 0.07, 0.02, cage, RM.satin, { mirror: true });
      ctx.box('trim', 0.84, 1.98, -1.68, 0.07, 0.07, 1.55, 0.02, cage, RM.satin, { mirror: true });
      ctx.box('trim', 0, 1.3, -2.25, 0.62, 0.62, 0.24, 0.12, 0x151515, RM.rubber);
      ctx.box('trim', 0, 1.9, 2.0, 1.5, 0.05, 0.05, 0.01, cage, RM.satin);
    },
  });

  // 7. Halcyon Cab: the taxi.
  DEFS.cab = Object.assign({}, DEFS.halcyon, {
    wheel: 'silversteel',
    details(ctx) {
      halcyonDetails(ctx);
      ctx.rect('left', -0.02, 0.72, 1.86, 0.062, { part: 'lights', color: 0xffffff, rm: RM.decal, uv: UVR.checker, nu: 8, off: 0.0045, mirror: true });
      const z = -0.55, y = ctx.roofY(z, 0);
      ctx.box('trim', 0, y + 0.02, z, 0.5, 0.03, 0.22, 0.01, COL.black, RM.gloss);
      ctx.box('paint', 0, y + 0.115, z, 0.74, 0.17, 0.2, 0.05, 'body');
      for (const s of [1, -1]) {
        const zz = z + s * 0.101, hw = 0.33, y0 = y + 0.05, y1 = y + 0.18;
        const q = s > 0 ? uvQuad([-hw, y0, zz], [hw, y0, zz], [hw, y1, zz], [-hw, y1, zz], [0, 0, 1]) : uvQuad([hw, y0, zz], [-hw, y0, zz], [-hw, y1, zz], [hw, y1, zz], [0, 0, -1]);
        ctx.lights.add(q, 0xffffff, RM.lens, G.SIGN, UVR.cab, false);
      }
    },
  });

  // 8. Halcyon Interceptor: black-and-white police car.
  DEFS.interceptor = Object.assign({}, DEFS.halcyon, {
    wheel: 'steel', livery: true, siren: 'police',
    details(ctx) {
      halcyonDetails(ctx, { chrome: false, mirrorColor: COL.black });
      policeExtras(ctx, true);
    },
  });
  function policeExtras(ctx, marked) {
    if (marked) {
      ctx.rect('left', 0.02, 0.61, 1.86, 0.64, { part: 'lights', color: 0xffffff, rm: RM.decal, uv: UVR.police, text: true, nu: 6, nv: 3, off: 0.0045, mirror: true });
      ctx.rect('top', 0, -0.6, 1.24, 0.92, { part: 'paint', color: 0xf2f2f0, nu: 4, nv: 4, off: 0.003 });
      lightBar(ctx, -0.42, { w: 1.2 });
      // Push bar.
      for (const x of [0.3, -0.3]) ctx.box('trim', x, 0.52, 2.44, 0.06, 0.46, 0.06, 0.02, COL.black, RM.gloss);
      for (const y of [0.4, 0.7]) ctx.box('trim', 0, y, 2.46, 0.84, 0.05, 0.05, 0.02, COL.black, RM.gloss);
    }
    // Grille and rear-deck strobes.
    for (const [x, g, c] of [[0.2, G.RED, 0x5a0a0a], [-0.2, G.BLUE, 0x0a1450]]) {
      ctx.rect('front', x, 0.6, 0.12, 0.035, { part: 'lights', round: 0.5, color: c, rm: RM.lens, light: g, nu: 2, off: 0.012 });
      ctx.rect('front', x * 3.2, 0.35, 0.07, 0.03, { part: 'lights', round: 0.5, color: c, rm: RM.lens, light: g, nu: 2, off: 0.008 });
    }
    if (!marked) {
      const rw = DEFS.halcyon.glass.rw;
      const z = lerp(rw[0][0], rw[1][0], 0.12), y = lerp(rw[0][1], rw[1][1], 0.12);
      for (const [x, g, c] of [[0.3, G.RED, 0x3a0808], [-0.3, G.BLUE, 0x08103a]]) {
        const h = ctx.surf.cast(x, y + 2, z, 0, -1, 0);
        if (h) ctx.box('lights', x, h.p.y - 0.005, h.p.z + 0.01, 0.34, 0.035, 0.05, 0.012, c, RM.lens, { light: g });
      }
      ctx.anchors.siren = new THREE.Vector3(0, 1.3, -1.1);
    }
  }

  // 9. Zephyr RS: wedge hypercar with scissor-door lines and a big wing.
  (function () {
    const gh = greenhouse({ zb: 0.72, yb: 0.78, top: [-0.35, 1.06], mid: [-0.65, 1.08, 0.3], rear: [-0.95, 1.05], base: [-2.0, 0.93], bot: 0.66, r: [0.02, 0.35, 0.4, 0.2] });
    DEFS.zephyr = {
      L: 4.6, W: 2.04, H: 1.1, fo: 1.02, ro: 0.98, R: 0.35, tyreW: 0.26, tyreWR: 0.34, sill: 0.11, archGap: 0.035, wheel: 'split',
      body: [
        [2.18, 0.13, 0.02], [2.3, 0.2, 0.03], [2.26, 0.3, 0.06], [1.7, 0.56, 0.2], [1.28, 0.78, 0.3], [0.6, 0.8, 0.1],
        [-0.4, 0.86, 0.3], [-1.32, 0.96, 0.3], [-2.1, 0.96, 0.06], [-2.3, 0.9, 0.05], [-2.3, 0.4, 0.05], [-2.2, 0.16, 0.03], [-2.05, 0.12, 0.02],
      ],
      bevel: 0.06,
      plan: [[-2.3, 0.92], [-1.9, 0.99], [-1.32, 1.0], [-0.5, 0.9], [0.4, 0.9], [1.28, 0.96], [1.9, 0.88], [2.3, 0.72]],
      nose: 0.2, tail: 0.06, endLen: 0.7, tumble: [0.4, 0.95, 0.14],
      dip: [[0.8, 2.3, 0.18, 0.2, 0.28]],
      cabin: { pts: gh.pts, width: 1.3, bevel: 0.08, tumble: 0.2, y0: 0.78, y1: 1.08, crown: 0.03, wf: [0.14, -0.35, 0.72], wr: [0.1, -0.95, -2.0] },
      glass: { ws: gh.ws, rw: gh.rw, rwT: [0.05, 0.4], aw: 0.08, side: [{ f: 'A', r: -0.68, b: 0.84, t: 1.0 }] },
      seatZ: -0.4,
      details(ctx) {
        ctx.headlight('front', 0.62, 0.36, 0.42, 0.045, { round: 0.8, skew: 0.8, taper: -0.3, pods: 3, podDy: 0.002, drl: { dy: -0.022, h: 0.01, w: 0.95 } });
        ctx.rect('front', 0.55, 0.2, 0.5, 0.1, { round: 0.5, taper: 0.2, color: COL.grille, rm: RM.dark, nu: 5, off: 0.003, mirror: true });
        ctx.rect('front', 0, 0.14, 1.8, 0.03, { round: 0.3, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.014 });
        ctx.rect('top', 0, 1.35, 0.5, 0.35, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 3, nv: 2, off: 0.003, lod0: true });
        ctx.rect('left', -0.78, 0.5, 0.58, 0.3, { round: 0.5, taper: -0.4, skew: -0.5, color: COL.grille, rm: RM.dark, nu: 4, nv: 2, off: 0.003, mirror: true });
        ctx.rect('left', -0.05, 0.17, 1.9, 0.06, { round: 0.4, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.012, mirror: true });
        ctx.seams([{ z: 0.84, y0: 0.2, y1: 0.8, lean: -0.32 }, { z: -0.56, y0: 0.22, y1: 0.86, lean: 0.1 }, { z0: -0.56, z1: 0.84, y: 0.44 }]);
        ctx.mirrors(0.52, 0.8, { reach: 0.12, sy: 0.07, sz: 0.15 });
        ctx.rect('rear', 0, 0.8, 1.84, 0.03, { part: 'lights', round: 0.6, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 10, off: 0.005 });
        ctx.rect('rear', 0.4, 0.76, 0.12, 0.025, { part: 'lights', round: 0.6, color: COL.reverse, rm: RM.lens, light: G.REVERSE, nu: 2, off: 0.005, mirror: true });
        ctx.rect('rear', 0, 0.3, 1.74, 0.28, { round: 0.4, color: COL.grille, rm: RM.dark, nu: 6, nv: 2, off: 0.003 });
        ctx.rect('rear', 0, 0.6, 1.2, 0.16, { round: 0.5, color: 0x0c0d0e, rm: RM.dark, nu: 6, off: 0.003 });
        if (!ctx.lod) for (const x of [0.25, 0.5, 0.75]) ctx.rect('rear', x, 0.27, 0.016, 0.24, { color: 0x1a1b1d, rm: RM.satin, nu: 1, nv: 2, off: 0.003, thick: 0.07, mirror: true });
        ctx.plate('rear', 0.44, { w: 0.4, h: 0.1 });
        ctx.exhaust([-0.09, 0.09], 0.6, 0.05, { color: 0x3a3632 });
        wing(ctx, -2.02, 1.3, 1.92, 0.36, { tilt: -0.16, plateH: 0.22 });
      },
    };
  })();

  // 10. Tern: mid-size SUV with roof rails.
  (function () {
    const gh = greenhouse({ zb: 0.82, yb: 1.1, top: [0.02, 1.66], mid: [-1.0, 1.7, 0.5], rear: [-2.12, 1.66], base: [-2.3, 1.16], bot: 1.02, r: [0.03, 0.2, 0.14, 0.06], baseOut: 0.03 });
    DEFS.tern = {
      L: 4.75, W: 1.92, H: 1.76, fo: 0.95, ro: 1.0, R: 0.37, tyreW: 0.24, sill: 0.33, archGap: 0.07, wheel: 'alloy',
      body: [
        [2.3, 0.36, 0.03], [2.375, 0.52, 0.08], [2.36, 0.82, 0.1], [2.24, 0.98, 0.14], [1.4, 1.06, 0.35], [0.82, 1.1, 0.08],
        [-1.9, 1.14, 0.08], [-2.3, 1.13, 0.08], [-2.375, 1.0, 0.08], [-2.375, 0.55, 0.1], [-2.3, 0.37, 0.04],
      ],
      bevel: 0.07,
      plan: [[-2.375, 0.94], [-1.9, 0.99], [1.5, 1.0], [2.0, 0.965], [2.375, 0.9]],
      nose: 0.1, tail: 0.06, endLen: 0.5, tumble: [0.8, 1.14, 0.06],
      cabin: { pts: gh.pts, width: 1.76, bevel: 0.07, tumble: 0.12, y0: 1.1, y1: 1.7, crown: 0.02, wf: [0.07, 0.02, 0.82], wr: [0.03, -2.12, -2.3] },
      glass: { ws: gh.ws, rw: gh.rw, rwT: [0.08, 0.85], aw: 0.1, cw: 0.13, side: [{ f: 'A', r: -0.28, b: 1.16, t: 1.6 }, { f: -0.36, r: -1.28, b: 1.16, t: 1.6 }, { f: -1.36, r: 'C', b: 1.16, t: 1.58 }] },
      seatZ: 0.15,
      details(ctx) {
        ctx.headlight('front', 0.64, 0.93, 0.4, 0.1, { round: 0.4, skew: -0.3, taper: -0.15, pods: 2, drl: { dy: -0.042, h: 0.013, w: 0.9 } });
        ctx.grille(0.79, 0.92, 0.24, { surround: 0x6d7075, bars: 3, round: 0.3, barColor: 0x2c2e31 });
        ctx.rect('front', 0, 0.47, 0.9, 0.1, { round: 0.4, color: 0xa8acb0, rm: RM.satin, nu: 5, off: 0.004, thick: 0.01 });
        ctx.rect('front', 0, 0.58, 1.8, 0.1, { round: 0.4, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003 });
        ctx.plate('front', 0.64, { off: 0.012 });
        ctx.taillight('rear', 0.66, 1.0, 0.34, 0.13, { round: 0.3, skew: 0.2, rev: { dx: -0.1, dy: -0.03, w: 0.1, h: 0.04 }, line: 0.035 });
        ctx.plate('rear', 0.8);
        ctx.rect('rear', 0, 0.48, 1.74, 0.18, { round: 0.4, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.012 });
        ctx.rect('rear', 0, 0.44, 0.8, 0.06, { round: 0.4, color: 0xa8acb0, rm: RM.satin, nu: 4, off: 0.006 });
        ctx.exhaust([-0.6], 0.4, 0.04);
        flares(ctx, 2.375 - 0.95, 0.44, 0.37, 0.06);
        flares(ctx, -2.375 + 1.0, 0.44, 0.37, 0.06);
        ctx.rect('left', 0.02, 0.42, 1.55, 0.14, { round: 0.3, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003, thick: 0.01, mirror: true });
        ctx.seams([{ z: 0.93, y0: 0.4, y1: 1.1 }, { z: -0.32, y0: 0.36, y1: 1.14 }, { z: -1.06, y0: 0.82, y1: 1.14, lean: 0.03 }]);
        ctx.handles([0.35, -0.72], 1.0);
        ctx.mirrors(0.72, 1.14, { reach: 0.12, sy: 0.12, sz: 0.19 });
        // Roof rails.
        for (const x of [0.62]) {
          const y = ctx.roofY(-1.0, x);
          ctx.box('trim', x, y + 0.055, -1.0, 0.04, 0.03, 2.0, 0.012, 0xb4b8bc, RM.alloy, { mirror: true });
          for (const z of [-0.08, -1.92]) {
            const yy = ctx.roofY(z, x);
            ctx.box('trim', x, (yy + y + 0.05) / 2, z, 0.05, y + 0.06 - yy, 0.08, 0.012, COL.plastic, RM.plastic, { mirror: true });
          }
        }
      },
    };
  })();

  // 11. Sovereign: long luxury saloon with chrome everywhere.
  WHEEL_STYLES.lux = { spokes: 10, pair: 0, w0: 0.028, w1: 0.045, col: 0xdfe2e5, rm: RM.chrome, lip: 0xdfe2e5, dish: 0.04 };
  (function () {
    const gh = greenhouse({ zb: 1.0, yb: 0.98, top: [0.1, 1.47], mid: [-0.7, 1.5, 0.5], rear: [-1.35, 1.47], base: [-2.0, 1.04], bot: 0.88, r: [0.03, 0.22, 0.24, 0.05] });
    DEFS.sovereign = {
      L: 5.6, W: 1.95, H: 1.52, fo: 1.0, ro: 1.15, R: 0.36, tyreW: 0.245, sill: 0.22, archGap: 0.06, wheel: 'lux',
      finishFor: (hex) => (new THREE.Color(hex).r > 0.6 ? 'pearl' : ''),
      body: [
        [2.72, 0.26, 0.04], [2.8, 0.42, 0.08], [2.8, 0.7, 0.08], [2.7, 0.84, 0.1], [1.7, 0.94, 0.5], [1.0, 0.98, 0.1],
        [-1.4, 1.0, 0.4], [-2.0, 1.03, 0.2], [-2.68, 1.02, 0.1], [-2.8, 0.92, 0.08], [-2.8, 0.55, 0.08], [-2.74, 0.3, 0.05], [-2.64, 0.25, 0.03],
      ],
      bevel: 0.06,
      plan: [[-2.8, 0.93], [-2.3, 0.985], [-1.6, 1.0], [1.8, 1.0], [2.4, 0.975], [2.8, 0.92]],
      nose: 0.06, tail: 0.06, endLen: 0.5, tumble: [0.66, 1.03, 0.06],
      cabin: { pts: gh.pts, width: 1.7, bevel: 0.07, tumble: 0.14, y0: 0.98, y1: 1.5, crown: 0.02, wf: [0.07, 0.1, 1.0], wr: [0.05, -1.35, -2.0] },
      glass: { ws: gh.ws, rw: gh.rw, aw: 0.1, cw: 0.2, beltColor: COL.chrome, side: [{ f: 'A', r: -0.26, b: 1.04, t: 1.41 }, { f: -0.34, r: -1.18, b: 1.04, t: 1.41 }, { f: -1.26, r: 'C', b: 1.04, t: 1.4 }] },
      seatZ: 0.35,
      details(ctx) {
        ctx.grille(0.64, 0.5, 0.26, { surround: COL.chrome, vbars: 7, bars: 0, round: 0.12 });
        ctx.box('trim', 0, ctx.roofY(2.62, 0) + 0.03, 2.62, 0.02, 0.06, 0.07, 0.006, COL.chrome, RM.chrome, { lod0: true });
        ctx.headlight('front', 0.66, 0.7, 0.36, 0.1, { round: 0.4, taper: 0.1, pods: 2, bezel: COL.chrome, drl: { dy: -0.04, h: 0.012, w: 0.86 } });
        ctx.rect('front', 0, 0.37, 1.5, 0.12, { round: 0.5, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
        ctx.rect('front', 0, 0.44, 1.56, 0.02, { color: COL.chrome, rm: RM.chrome, nu: 6, off: 0.005 });
        ctx.plate('front', 0.34, { off: 0.012 });
        ctx.taillight('rear', 0.64, 0.86, 0.42, 0.1, { round: 0.3, bezel: COL.chrome, rev: { dx: -0.14, w: 0.1, h: 0.04 }, line: 0.025 });
        ctx.rect('rear', 0, 0.87, 0.84, 0.035, { round: 0.3, color: COL.chrome, rm: RM.chrome, nu: 5, off: 0.004 });
        ctx.plate('rear', 0.64);
        ctx.rect('rear', 0, 0.36, 1.6, 0.12, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003 });
        ctx.rect('rear', 0, 0.43, 1.6, 0.02, { color: COL.chrome, rm: RM.chrome, nu: 6, off: 0.005 });
        ctx.exhaust([0.55, -0.55], 0.3, 0.04);
        ctx.seams([{ z: 1.33, y0: 0.26, y1: 0.98 }, { z: -0.3, y0: 0.25, y1: 1.0 }, { z: -1.22, y0: 0.62, y1: 1.02, lean: 0.03 }]);
        ctx.handles([0.55, -0.95], 0.84);
        ctx.rect('left', 0, 0.36, 4.2, 0.025, { color: COL.chrome, rm: RM.chrome, nu: 10, off: 0.003, mirror: true });
        ctx.mirrors(0.92, 1.03, { color: 'body', sz: 0.19 });
      },
    };
  })();

  // 12. Bulwark: armoured cash-in-transit truck.
  DEFS.bulwark = {
    L: 6.0, W: 2.3, H: 2.7, fo: 1.1, ro: 1.25, R: 0.46, tyreW: 0.3, sill: 0.45, archGap: 0.07, wheel: 'truck',
    body: [
      [2.9, 0.45, 0.03], [3.0, 0.6, 0.04], [3.0, 1.2, 0.06], [2.9, 1.34, 0.08], [2.2, 1.42, 0.1], [1.95, 1.46, 0.04],
      [1.55, 2.25, 0.12], [0.9, 2.3, 0.06], [0.85, 2.3], [0.8, 2.66, 0.05], [-2.92, 2.66, 0.06], [-3.0, 2.58, 0.05],
      [-3.0, 0.62, 0.04], [-2.92, 0.47, 0.03],
    ],
    bevel: 0.05,
    plan: [[-3.0, 1.0], [2.2, 1.0], [3.0, 0.94]],
    nose: 0.05, tail: 0, endLen: 0.5, tumble: [1.6, 2.66, 0.04],
    glass: { ws: [[1.95, 1.46], [1.55, 2.25]], wsT: [0.1, 0.85], inset: 0.12, aw: 0.12, side: [{ f: 'A', r: 1.05, b: 1.62, t: 2.12 }] },
    seatZ: 1.3,
    details(ctx) {
      ctx.grille(1.05, 1.3, 0.35, { bars: 4, barColor: 0x3a3c3f, round: 0.1 });
      ctx.headlight('front', 0.84, 1.05, 0.26, 0.2, { round: 0.2, pods: 1 });
      ctx.box('trim', 0, 0.62, 3.03, 2.3, 0.26, 0.2, 0.03, 0x1c1d1f, RM.satin);
      ctx.plate('front', 0.62, { off: 0.11 });
      ctx.taillight('rear', 1.02, 1.1, 0.12, 0.4, { round: 0.2, rev: { dy: -0.14, w: 0.09, h: 0.07 } });
      ctx.box('trim', 0, 0.6, -3.03, 2.3, 0.24, 0.18, 0.03, 0x1c1d1f, RM.satin);
      ctx.plate('rear', 0.95);
      ctx.rect('rear', 0, 1.7, 0.01, 1.7, { color: 0x050505, rm: RM.plastic, nu: 1, nv: 3, off: 0.003, lod0: true });
      for (const x of [0.4, -0.4]) ctx.rect('rear', x, 2.1, 0.24, 0.14, { round: 0.2, color: COL.glass, rm: RM.glass, nu: 1, off: 0.004 });
      for (const y of [1.1, 2.3]) for (const x of [1.02, -1.02]) ctx.box('trim', x, y, -3.02, 0.06, 0.16, 0.04, 0.01, 0x505356, RM.metal, { lod0: true });
      // Armour plate lines, gun-port windows, a side hatch, the company band.
      ctx.seams([
        { z0: -2.95, z1: 0.75, y: 1.3 }, { z0: -2.95, z1: 0.75, y: 2.4 }, { z: -0.6, y0: 1.3, y1: 2.4 }, { z: -1.9, y0: 1.3, y1: 2.4 },
        { z: 1.05, y0: 0.9, y1: 2.2 }, { z: 0.72, y0: 0.6, y1: 2.6 },
      ]);
      for (const z of [0.0, -2.4]) ctx.rect('left', z, 2.12, 0.34, 0.12, { round: 0.2, color: COL.glass, rm: RM.glass, nu: 1, off: 0.004, mirror: true });
      ctx.rect('left', -1.25, 1.84, 1.1, 0.72, { part: 'lights', color: 0xffffff, rm: RM.decal, uv: UVR.cash, text: true, nu: 4, nv: 2, off: 0.0045, mirror: true });
      ctx.handles([0.9], 1.4, COL.black);
      ctx.box('trim', 1.12, 0.5, -0.4, 0.14, 0.04, 1.6, 0.012, COL.plastic, RM.plastic, { mirror: true });
      ctx.mirrors(1.7, 1.72, { reach: 0.18, sx: 0.07, sy: 0.26, sz: 0.22, color: COL.black });
      for (const x of [1.0, -1.0]) {
        const y = ctx.roofY(0.6, x);
        ctx.box('lights', x, y + 0.04, 0.62, 0.12, 0.07, 0.07, 0.02, COL.amber, RM.lens, { light: G.AMBER });
      }
      ctx.exhaust([-0.8], 0.5, 0.05, { color: 0x505050 });
    },
  };

  // 13. Hauler: box truck (cab plus a cargo box on a chassis).
  DEFS.hauler = {
    L: 6.8, W: 2.3, H: 3.2, fo: 1.15, ro: 1.6, R: 0.47, tyreW: 0.28, tyreWR: 0.34, sill: 0.48, archGap: 0.07, wheel: 'silversteel', livery: true, noRearArch: true,
    body: [
      [3.3, 0.5, 0.03], [3.4, 0.64, 0.05], [3.4, 1.28, 0.08], [3.3, 1.44, 0.1], [2.85, 1.52, 0.1], [2.62, 1.56, 0.04],
      [2.25, 2.55, 0.18], [1.4, 2.66, 0.12], [1.05, 2.64, 0.06], [1.0, 2.5], [1.0, 0.55], [1.1, 0.5, 0.02],
    ],
    bevel: 0.07,
    plan: [[1.0, 1.0], [2.8, 1.0], [3.4, 0.95]],
    nose: 0.06, tail: 0, endLen: 0.5, tumble: [1.7, 2.66, 0.05],
    glass: { ws: [[2.62, 1.56], [2.25, 2.55]], wsT: [0.08, 0.86], inset: 0.1, aw: 0.1, side: [{ f: 'A', r: 1.35, b: 1.8, t: 2.45 }] },
    seatZ: 1.9,
    extraBodies(q, lod) {
      return [{ md: roundBox(2.36, 2.1, 4.36, 0.05, lod).at(0, 2.11, -1.2), color: 0xefefeb }];
    },
    details(ctx) {
      ctx.grille(1.05, 1.4, 0.4, { bars: 4, barColor: 0x3a3c3f, round: 0.1 });
      ctx.headlight('front', 0.85, 1.02, 0.3, 0.2, { round: 0.25, pods: 1, drl: { dy: -0.085, h: 0.014 } });
      ctx.box('trim', 0, 0.66, 3.44, 2.3, 0.26, 0.16, 0.03, 0x2a2b2d, RM.satin);
      ctx.plate('front', 0.66, { off: 0.1 });
      ctx.seams([{ z: 2.0, y0: 0.9, y1: 2.5 }, { z: 1.1, y0: 0.62, y1: 2.5 }]);
      ctx.handles([1.3], 1.55, COL.black);
      ctx.mirrors(2.4, 1.95, { reach: 0.2, sx: 0.07, sy: 0.28, sz: 0.22, color: COL.black });
      // Chassis, fuel tank, rear mudguards and bumper.
      ctx.box('trim', 0, 0.8, -1.3, 1.0, 0.18, 4.2, 0.02, 0x161718, RM.satin);
      ctx.box('trim', 0.8, 0.78, -0.2, 0.36, 0.34, 0.8, 0.12, 0x9ea1a4, RM.alloy, { lod0: true });
      ctx.box('trim', 1.0, 1.02, -1.8, 0.4, 0.04, 1.1, 0.015, COL.plastic, RM.plastic, { mirror: true });
      ctx.box('trim', 0, 0.66, -3.32, 2.2, 0.14, 0.12, 0.02, 0x2a2b2d, RM.satin);
      for (const x of [0.95, -0.95]) {
        ctx.box('lights', x, 0.84, -3.33, 0.24, 0.1, 0.05, 0.015, COL.tailLens, RM.tail, { light: G.TAIL });
        ctx.box('lights', x * 0.78, 0.84, -3.33, 0.08, 0.08, 0.05, 0.015, COL.reverse, RM.lens, { light: G.REVERSE });
      }
      ctx.anchors.taillights.push(new THREE.Vector3(0.95, 0.84, -3.36), new THREE.Vector3(-0.95, 0.84, -3.36));
      ctx.plate('rear', 1.3, { w: 0.42 });
      // Box: roll-up door with slats, a colour band, side markers.
      ctx.rect('rear', 0, 2.0, 2.06, 1.8, { color: 0xd4d6d6, rm: RM.satin, nu: 2, nv: 2, off: 0.004 });
      if (!ctx.lod) for (let k = 1; k < 9; k++) ctx.rect('rear', 0, 1.1 + k * 0.2, 2.04, 0.008, { color: 0x8a8d90, rm: RM.satin, nu: 2, off: 0.006 });
      ctx.rect('left', -1.2, 1.35, 4.2, 0.16, { part: 'paint', color: 'body', nu: 8, off: 0.003, mirror: true });
      for (const z of [0.6, -1.2, -3.0]) ctx.rect('left', z, 1.14, 0.08, 0.04, { part: 'lights', color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 1, off: 0.004, mirror: true, lod0: true });
      ctx.exhaust([-0.9], 0.55, 0.05, { color: 0x505050 });
    },
  };

  // 14. Medic One: ambulance on the Porter body.
  DEFS.medic = Object.assign({}, DEFS.porter, { medic: true, siren: 'medic', wheel: 'silversteel' });

  // 15. Drifter S: tuned rear-drive coupe with a lip kit, a wing and stance.
  (function () {
    const gh = greenhouse({ zb: 0.72, yb: 0.82, top: [-0.2, 1.27], mid: [-0.6, 1.3, 0.3], rear: [-1.0, 1.26], base: [-1.62, 0.9], bot: 0.74, r: [0.03, 0.2, 0.25, 0.06] });
    DEFS.drifter = {
      L: 4.3, W: 1.8, H: 1.3, fo: 0.9, ro: 0.9, R: 0.32, tyreW: 0.235, tyreWR: 0.255, sill: 0.13, archGap: 0.035, inset: 0.004, wheel: 'mesh',
      body: [
        [2.05, 0.15, 0.03], [2.15, 0.3, 0.06], [2.14, 0.5, 0.08], [2.02, 0.64, 0.12], [1.3, 0.76, 0.35], [0.72, 0.82, 0.08],
        [-0.9, 0.86, 0.4], [-1.6, 0.9, 0.15], [-2.05, 0.9, 0.08], [-2.15, 0.8, 0.06], [-2.15, 0.45, 0.08], [-2.08, 0.2, 0.04], [-1.98, 0.15, 0.02],
      ],
      bevel: 0.055,
      plan: [[-2.15, 0.9], [-1.7, 0.99], [-1.25, 1.0], [0.0, 0.965], [1.25, 1.0], [1.8, 0.95], [2.15, 0.85]],
      nose: 0.1, tail: 0.08, endLen: 0.5, tumble: [0.55, 0.9, 0.08],
      cabin: { pts: gh.pts, width: 1.5, bevel: 0.07, tumble: 0.16, y0: 0.82, y1: 1.3, crown: 0.02, wf: [0.07, -0.2, 0.72], wr: [0.05, -1.0, -1.62] },
      glass: { ws: gh.ws, rw: gh.rw, aw: 0.09, cw: 0.14, side: [{ f: 'A', r: -0.55, b: 0.88, t: 1.22 }, { f: -0.62, r: 'C', b: 0.89, t: 1.2 }] },
      seatZ: -0.2,
      details(ctx) {
        ctx.headlight('front', 0.58, 0.575, 0.4, 0.07, { round: 0.5, skew: 0.3, taper: -0.2, pods: 2, drl: { dy: -0.03, h: 0.01, w: 0.9 } });
        ctx.rect('front', 0, 0.31, 1.26, 0.15, { round: 0.5, taper: 0.1, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
        ctx.rect('front', 0, 0.165, 1.74, 0.04, { round: 0.3, color: 0x0d0e0f, rm: RM.satin, nu: 8, off: 0.003, thick: 0.018 });
        ctx.box('trim', -0.5, 0.2, 2.13, 0.06, 0.03, 0.06, 0.01, 0xd01818, RM.gloss, { lod0: true });
        ctx.plate('front', 0.44, { w: 0.4, h: 0.1 });
        ctx.rect('left', -0.02, 0.19, 2.3, 0.075, { round: 0.3, color: 0x0d0e0f, rm: RM.satin, nu: 8, off: 0.003, thick: 0.022, mirror: true });
        ctx.seams([{ z: 0.72, y0: 0.22, y1: 0.82 }, { z: -0.72, y0: 0.24, y1: 0.87, lean: 0.03 }]);
        ctx.handles([-0.55], 0.74, COL.black);
        ctx.mirrors(0.55, 0.85, { reach: 0.1, sy: 0.075, sz: 0.15 });
        for (const x of [0.66, 0.45]) ctx.taillight('rear', x, 0.76, 0.14, 0.14, { round: 1, bezel: COL.black, rev: x < 0.5 ? { w: 0.05, h: 0.05, round: 1 } : null });
        ctx.rect('rear', 0, 0.3, 1.5, 0.2, { round: 0.4, color: 0x0d0e0f, rm: RM.satin, nu: 6, off: 0.003, thick: 0.012 });
        ctx.plate('rear', 0.56, { w: 0.4, h: 0.1 });
        ctx.exhaust([-0.55], 0.27, 0.058, { color: 0x6b5a48 });
        wing(ctx, -1.96, 1.12, 1.62, 0.26, { tilt: -0.14, plateH: 0.15 });
      },
    };
  })();

  // 16. Duchess: 70s convertible land yacht, top down, candy paint, whitewalls.
  DEFS.lowrider = {
    L: 5.7, W: 2.02, H: 1.26, fo: 1.2, ro: 1.3, R: 0.34, tyreW: 0.21, sill: 0.18, archGap: 0.07, wheel: 'wire', whitewall: true, finish: 'candy',
    body: [
      [2.76, 0.24, 0.03], [2.85, 0.34, 0.04], [2.86, 0.66, 0.05], [2.8, 0.78, 0.06], [1.8, 0.85, 0.6], [0.6, 0.9, 0.04],
      [0.5, 0.9], [0.48, 0.6], [-1.15, 0.6], [-1.17, 0.91], [-2.5, 0.93, 0.3], [-2.8, 0.9, 0.06], [-2.86, 0.8, 0.05],
      [-2.86, 0.4, 0.05], [-2.76, 0.24, 0.03],
    ],
    bevel: 0.05,
    plan: [[-2.86, 0.94], [-2.3, 0.995], [-1.6, 1.0], [1.8, 1.0], [2.4, 0.975], [2.86, 0.93]],
    nose: 0.05, tail: 0.05, endLen: 0.4,
    seatZ: -0.05,
    extraBodies(q, lod) {
      // Door tops beside the open cockpit.
      const x = 1.01 - 0.045;
      return [
        { md: roundBox(0.09, 0.33, 1.7, 0.035, lod).at(x, 0.745, -0.33) },
        { md: roundBox(0.09, 0.33, 1.7, 0.035, lod).at(-x, 0.745, -0.33) },
      ];
    },
    details(ctx) {
      ctx.grille(0.56, 1.44, 0.2, { surround: COL.chrome, vbars: 10, round: 0.08 });
      for (const x of [0.62, 0.82]) ctx.headlight('front', x, 0.6, 0.17, 0.14, { round: 0.3, bezel: COL.chrome, pods: 0 });
      ctx.box('trim', 0, 0.34, 2.9, 2.0, 0.14, 0.12, 0.05, COL.chrome, RM.chrome);
      ctx.plate('front', 0.34, { off: 0.07 });
      ctx.taillight('rear', 0.55, 0.62, 0.8, 0.1, { round: 0.1, bezel: COL.chrome, rev: { dx: -0.34, w: 0.08, h: 0.06 } });
      ctx.box('trim', 0, 0.36, -2.9, 2.0, 0.14, 0.12, 0.05, COL.chrome, RM.chrome);
      ctx.plate('rear', 0.5);
      ctx.exhaust([-0.6], 0.24, 0.04);
      ctx.rect('left', -0.1, 0.62, 4.9, 0.028, { color: COL.chrome, rm: RM.chrome, nu: 12, off: 0.003, mirror: true });
      ctx.seams([{ z: 0.48, y0: 0.24, y1: 0.9 }, { z: -1.15, y0: 0.52, y1: 0.9 }]);
      ctx.handles([-0.9], 0.8);
      ctx.box('trim', 0, ctx.roofY(2.7, 0) + 0.035, 2.72, 0.03, 0.06, 0.1, 0.01, COL.chrome, RM.chrome, { lod0: true });
      // Open cockpit: carpet, benches, dash, wheel, windshield, folded top.
      const seat = 0xe9dcc4, carpet = 0x2a0d12;
      ctx.box('trim', 0, 0.605, -0.33, 1.84, 0.012, 1.62, 0.004, carpet, RM.rubber);
      for (const [z, back] of [[-0.02, -0.26], [-0.8, -1.05]]) {
        ctx.box('trim', 0, 0.68, z, 1.8, 0.16, 0.5, 0.06, seat, [0.55, 0], {});
        ctx.box('trim', 0, 0.87, back, 1.8, 0.4, 0.13, 0.06, seat, [0.55, 0], { rx: 0.14 });
      }
      ctx.box('trim', 0, 0.86, 0.4, 1.84, 0.13, 0.22, 0.04, 0x1a0a0c, RM.plastic);
      if (!ctx.lod) {
        const ring = fromGeometry(new THREE.TorusGeometry(0.18, 0.016, 6, 18)).at(0.42, 0.97, 0.22, 0, -0.45);
        ctx.add('trim', ring, COL.chrome, RM.chrome);
      }
      const th = -0.62, h = 0.44, zb = 0.5, yb = 0.9;
      const cy = yb + (h / 2) * Math.cos(th), cz = zb + (h / 2) * Math.sin(th);
      ctx.box('trim', 0, cy, cz, 1.64, h, 0.012, 0.004, COL.glass, RM.glass, { rx: th });
      ctx.box('trim', 0, yb + h * Math.cos(th), zb + h * Math.sin(th), 1.7, 0.028, 0.03, 0.01, COL.chrome, RM.chrome, { rx: th });
      ctx.box('trim', 0.84, cy, cz, 0.028, h + 0.02, 0.03, 0.01, COL.chrome, RM.chrome, { rx: th, mirror: true });
      ctx.box('trim', 0, 0.98, -1.28, 1.76, 0.12, 0.3, 0.05, 0xd8ccb2, [0.7, 0]);
      ctx.mirrors(0.62, 0.92, { color: COL.chrome, sx: 0.06, sy: 0.06, sz: 0.11, reach: 0.06 });
    },
  };

  // 17. Pipit Rustbucket: an old beaten-up compact.
  DEFS.beater = Object.assign({}, DEFS.pipit, {
    livery: true, beater: true, finish: 'matte', wheel: 'rusty',
    dents: [[0.86, 0.62, -1.55, 0.34, 0.06], [0.3, 0.55, 1.93, 0.3, 0.05]],
  });

  // 18. Halcyon Detective: unmarked police sedan with hidden strobes.
  DEFS.unmarked = Object.assign({}, DEFS.halcyon, {
    wheel: 'steel', siren: 'police',
    details(ctx) {
      halcyonDetails(ctx, { chrome: false });
      policeExtras(ctx, false);
      if (!ctx.lod) {
        const h = ctx.hit('left', 0.66, 1.0);
        if (h) ctx.add('trim', cylX(0.05, 0.12, 10, 1).at(h.p.x + 0.07, 1.06, 0.62, Math.PI / 2), COL.chrome, RM.chrome);
        const t = ctx.hit('top', -0.5, -2.0);
        if (t) ctx.box('trim', -0.5, t.p.y + 0.12, -2.0, 0.008, 0.25, 0.008, 0.003, COL.black, RM.plastic);
      }
    },
  });

  // ======================================================================
  // Roster v2: modern, classic and off-road cars. Invented makes; the shapes
  // follow well-known real-world silhouettes (proportions in metres).
  // ======================================================================
  WHEEL_STYLES.aero = { spokes: 8, pair: 0, w0: 0.08, w1: 0.105, col: 0x474a4f, rm: [0.3, 0.85], lip: 0x8f9296, dish: 0.02 };
  WHEEL_STYLES.sport = { spokes: 7, pair: 0.075, w0: 0.03, w1: 0.046, col: 0x2c2e32, rm: [0.3, 0.85], lip: 0x8f9296, dish: 0.055 };
  WHEEL_STYLES.blackalloy = { spokes: 6, pair: 0, w0: 0.075, w1: 0.1, col: 0x17181a, rm: [0.4, 0.6], lip: 0x17181a, dish: 0.035, rimK: 0.64 };
  WHEEL_STYLES.cover = { spokes: 18, pair: 0, w0: 0.09, w1: 0.145, col: 0x3d4045, rm: [0.35, 0.85], lip: 0x3d4045, dish: 0.012, rimK: 0.66 };
  WHEEL_STYLES.crager = { spokes: 5, pair: 0, w0: 0.06, w1: 0.07, col: 0xd9dcde, rm: RM.chrome, lip: 0xd9dcde, dish: 0.03, rimK: 0.66 };
  WHEEL_STYLES.fivestar = { spokes: 5, pair: 0.05, w0: 0.026, w1: 0.04, col: 0xb7bbbf, rm: RM.alloy, lip: 0xd0d3d6, dish: 0.045 };

  /** Black arch flares round both axles (uses the body's own arch numbers). */
  function archFlares(ctx, width, color) {
    const d = ctx.def, zF = d.L / 2 - d.fo, zR = -d.L / 2 + d.ro;
    const g = d.archGap === undefined ? 0.06 : d.archGap;
    flares(ctx, zF, d.R + g, d.R, width, color);
    flares(ctx, zR, d.R + (d.archGapR === undefined ? g : d.archGapR), d.R, width, color);
  }
  /** Flush door handle: a slim dark slot with a bright lip. */
  function flushHandles(ctx, zs, y, color) {
    if (ctx.lod) return;
    for (const z of zs) {
      ctx.rect('left', z, y, 0.15, 0.022, { round: 0.9, color: color || 0x15171a, rm: RM.gloss, nu: 3, off: 0.0022, mirror: true });
      ctx.rect('left', z, y + 0.014, 0.15, 0.004, { round: 0.9, color: 0xc4c8cc, rm: RM.chrome, nu: 3, off: 0.0028, mirror: true, lod0: true });
    }
  }
  const GLASS_ROOF = 0x131b23;

  // ---- 19. Volta S: electric fastback sedan, light bars and flush handles.
  (function () {
    const gh = greenhouse({ zb: 0.8, yb: 0.97, top: [0.02, 1.43], mid: [-0.85, 1.45, 0.6], rear: [-1.75, 1.35], base: [-2.42, 1.02], bot: 0.88, r: [0.03, 0.25, 0.4, 0.1] });
    DEFS.volta = {
      L: 4.98, W: 1.96, H: 1.45, fo: 0.9, ro: 1.12, R: 0.352, tyreW: 0.245, tyreWR: 0.265, sill: 0.2, archGap: 0.05, wheel: 'aero',
      body: [
        [2.4, 0.28, 0.04], [2.49, 0.4, 0.08], [2.49, 0.64, 0.1], [2.38, 0.78, 0.14], [1.5, 0.91, 0.5], [0.84, 1.0, 0.1],
        [-0.9, 1.0, 0.4], [-1.9, 1.02, 0.3], [-2.42, 0.99, 0.14], [-2.5, 0.9, 0.1], [-2.5, 0.55, 0.1], [-2.46, 0.34, 0.05], [-2.36, 0.28, 0.03],
      ],
      bevel: 0.07,
      plan: [[-2.5, 0.88], [-2.1, 0.97], [-1.4, 1.0], [0.8, 1.0], [1.6, 0.98], [2.1, 0.93], [2.5, 0.8]],
      nose: 0.14, tail: 0.1, endLen: 0.55, tumble: [0.7, 1.0, 0.07],
      cabin: { pts: gh.pts, width: 1.66, bevel: 0.08, tumble: 0.17, y0: 0.95, y1: 1.45, crown: 0.025, wf: [0.08, 0.02, 0.8], wr: [0.06, -1.75, -2.42] },
      glass: { seats: [-0.05, -1.0], ws: gh.ws, rw: gh.rw, rwT: [0.06, 0.88], aw: 0.09, cw: 0.2, side: [{ f: 'A', r: -0.34, b: 1.04, t: 1.38 }, { f: -0.42, r: -1.3, b: 1.04, t: 1.3 }] },
      seatZ: 0.1,
      details(ctx) {
        ctx.headlight('front', 0.66, 0.7, 0.4, 0.07, { round: 0.8, skew: 0.55, taper: -0.1, drl: { dy: -0.036, h: 0.011, w: 0.96 } });
        ctx.rect('front', 0, 0.36, 1.1, 0.1, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
        ctx.rect('front', 0.68, 0.42, 0.2, 0.05, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 3, off: 0.003, mirror: true, lod0: true });
        ctx.rect('front', 0, 0.22, 1.7, 0.035, { round: 0.3, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.01 });
        ctx.plate('front', 0.5, { off: 0.012 });
        ctx.taillight('rear', 0.7, 0.9, 0.46, 0.07, { round: 0.6, skew: -0.45, bezel: null, rev: { dx: -0.17, dy: -0.04, w: 0.06, h: 0.025 } });
        ctx.rect('rear', 0, 0.9, 0.92, 0.018, { part: 'lights', round: 0.6, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 6, off: 0.006 });
        ctx.plate('rear', 0.7);
        ctx.rect('rear', 0, 0.4, 1.56, 0.16, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003 });
        ctx.rect('rear', 0.7, 0.55, 0.1, 0.03, { part: 'lights', round: 0.6, color: 0x700a0a, rm: RM.tail, nu: 2, off: 0.005, mirror: true, lod0: true });
        ctx.seams([{ z: 0.68, y0: 0.27, y1: 0.97 }, { z: -0.22, y0: 0.26, y1: 1.0 }, { z: -1.14, y0: 0.3, y1: 1.0, lean: 0.03 }, { z0: -1.14, z1: 0.68, y: 0.26 }]);
        flushHandles(ctx, [0.2, -0.78], 0.935);
        ctx.rect('left', -0.0, 0.245, 2.3, 0.05, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.008, mirror: true });
        ctx.mirrors(0.66, 0.985, { sy: 0.095, sz: 0.17 });
        ctx.rect('left', 1.45, 0.68, 0.07, 0.025, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
        // Panoramic glass roof.
        ctx.rect('top', 0, -0.52, 1.18, 2.0, { round: 0.25, color: GLASS_ROOF, rm: RM.glass, nu: 3, nv: 8, off: 0.004 });
        // Subtle ducktail.
        ctx.box('paint', 0, ctx.roofY(-2.36, 0) + 0.004, -2.4, 1.3, 0.025, 0.1, 0.012, 'body', null, { rx: 0.1, lod0: true });
      },
    };
  })();

  // ---- 20. Volta Y: electric crossover, tall hatch, glass roof, black lower trim.
  (function () {
    const gh = greenhouse({ zb: 0.8, yb: 1.05, top: [0.1, 1.58], mid: [-0.9, 1.61, 0.5], rear: [-1.75, 1.52], base: [-2.33, 1.1], bot: 0.96, r: [0.03, 0.22, 0.3, 0.08], baseOut: 0.03 });
    DEFS.voltaic = {
      L: 4.75, W: 1.94, H: 1.63, fo: 0.88, ro: 0.98, R: 0.365, tyreW: 0.24, tyreWR: 0.255, sill: 0.28, archGap: 0.055, wheel: 'aero',
      body: [
        [2.28, 0.34, 0.04], [2.375, 0.46, 0.08], [2.37, 0.7, 0.1], [2.26, 0.84, 0.14], [1.4, 0.98, 0.5], [0.82, 1.06, 0.1],
        [-1.2, 1.1, 0.4], [-2.2, 1.12, 0.2], [-2.36, 1.08, 0.1], [-2.375, 0.9, 0.1], [-2.375, 0.55, 0.1], [-2.32, 0.38, 0.05], [-2.24, 0.34, 0.03],
      ],
      bevel: 0.07,
      plan: [[-2.375, 0.9], [-2.0, 0.98], [-1.4, 1.0], [0.8, 1.0], [1.6, 0.985], [2.0, 0.95], [2.375, 0.84]],
      nose: 0.12, tail: 0.1, endLen: 0.5, tumble: [0.8, 1.12, 0.07],
      cabin: { pts: gh.pts, width: 1.72, bevel: 0.08, tumble: 0.14, y0: 1.04, y1: 1.62, crown: 0.025, wf: [0.07, 0.1, 0.8], wr: [0.05, -1.75, -2.33] },
      glass: { seats: [-0.06, -0.98], ws: gh.ws, rw: gh.rw, rwT: [0.08, 0.88], aw: 0.1, cw: 0.18, side: [{ f: 'A', r: -0.3, b: 1.12, t: 1.5 }, { f: -0.38, r: 'C', b: 1.12, t: 1.44 }] },
      seatZ: 0.1,
      details(ctx) {
        ctx.headlight('front', 0.66, 0.9, 0.4, 0.075, { round: 0.8, skew: 0.5, taper: -0.1, drl: { dy: -0.038, h: 0.011, w: 0.96 } });
        ctx.rect('front', 0, 0.5, 1.0, 0.12, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
        ctx.rect('front', 0, 0.37, 1.8, 0.16, { round: 0.4, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.008 });
        ctx.plate('front', 0.5, { off: 0.012 });
        ctx.taillight('rear', 0.7, 1.0, 0.44, 0.075, { round: 0.6, skew: -0.4, bezel: null, rev: { dx: -0.16, dy: -0.04, w: 0.06, h: 0.025 } });
        ctx.rect('rear', 0, 1.0, 0.96, 0.018, { part: 'lights', round: 0.6, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 6, off: 0.006 });
        ctx.plate('rear', 0.78);
        ctx.rect('rear', 0, 0.46, 1.8, 0.2, { round: 0.4, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.01 });
        ctx.seams([{ z: 0.7, y0: 0.4, y1: 1.1 }, { z: -0.24, y0: 0.36, y1: 1.12 }, { z: -1.1, y0: 0.4, y1: 1.12, lean: 0.03 }]);
        flushHandles(ctx, [0.22, -0.78], 1.03);
        archFlares(ctx, 0.05);
        ctx.rect('left', 0.0, 0.41, 2.6, 0.12, { round: 0.3, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.01, mirror: true });
        ctx.mirrors(0.7, 1.12, { sy: 0.1, sz: 0.18 });
        ctx.rect('top', 0, -0.9, 1.3, 2.1, { round: 0.25, color: GLASS_ROOF, rm: RM.glass, nu: 3, nv: 8, off: 0.004 });
        const rr = ctx.roofY(-1.55, 0);
        ctx.box('paint', 0, rr + 0.0, -2.38, 1.34, 0.045, 0.12, 0.02, 'body', null, { rx: 0.1, lod0: true });
      },
    };
  })();

  // ---- 21. Monolith: angular stainless-steel electric truck.
  (function () {
    DEFS.monolith = {
      L: 5.7, W: 2.04, H: 1.8, fo: 0.95, ro: 0.97, R: 0.43, tyreW: 0.285, sill: 0.46, archGap: 0.05, wheel: 'cover',
      finishFor: (hex) => (hex === 0xb7babd || hex === 0x9c9fa3 || hex === 0xcdd0d2 ? 'steel' : 'satin'),
      body: [
        [2.8, 0.5, 0.025], [2.85, 0.58, 0.02], [2.85, 0.86, 0.03], [1.55, 1.29, 0.03], [0.4, 1.77, 0.07], [-0.6, 1.72, 0.04],
        [-2.8, 1.25, 0.03], [-2.85, 1.2, 0.02], [-2.85, 0.62, 0.03], [-2.78, 0.5, 0.025],
      ],
      bevel: 0.025,
      plan: [[-2.85, 0.95], [-2.0, 1.0], [2.0, 1.0], [2.85, 0.94]],
      nose: 0.0, tail: 0.0, endLen: 0.3, tumble: [1.0, 1.77, 0.17],
      glass: { seats: [0.15, -0.7],
        ws: [[1.2, 1.44], [0.48, 1.74]], wsT: [0.0, 0.95], inset: 0.12, aw: 0.1, wipers: false,
        side: [{ f: 'A', r: -0.1, b: 1.36, t: 1.63 }, { f: -0.17, r: -1.1, b: 1.36, t: 1.55 }],
      },
      seatZ: 0.2,
      details(ctx) {
        // Full-width light bar, slit headlamps, black lower bumper.
        ctx.rect('front', 0, 0.8, 1.84, 0.03, { part: 'lights', round: 0.8, color: 0xffffff, rm: RM.lens, light: G.DRL, nu: 14, off: 0.006 });
        ctx.headlight('front', 0.74, 0.66, 0.3, 0.05, { round: 0.8, skew: 0.3, drl: null });
        ctx.rect('front', 0, 0.54, 1.96, 0.22, { round: 0.1, color: COL.plastic, rm: RM.plastic, nu: 8, nv: 2, off: 0.004 });
        ctx.plate('front', 0.58, { off: 0.012 });
        ctx.rect('rear', 0, 1.13, 1.9, 0.034, { part: 'lights', round: 0.6, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 14, off: 0.006 });
        for (const s of [1, -1]) ctx.anchors.taillights.push(new THREE.Vector3(s * 0.85, 1.13, -2.88));
        ctx.rect('rear', 0.52, 0.98, 0.14, 0.03, { part: 'lights', round: 0.6, color: COL.reverse, rm: RM.lens, light: G.REVERSE, nu: 2, off: 0.006, mirror: true });
        ctx.plate('rear', 0.82);
        ctx.rect('rear', 0, 0.58, 1.96, 0.2, { round: 0.1, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.004 });
        // Faceted side: shut lines, a black sill and cladding, flush handles.
        ctx.seams([{ z: 1.15, y0: 0.52, y1: 1.4, lean: -0.55 }, { z: 0.12, y0: 0.5, y1: 1.76, lean: 0.05 }, { z: -0.95, y0: 0.5, y1: 1.58, lean: 0.12 }, { z0: -2.7, z1: -0.95, y: 1.28 }]);
        flushHandles(ctx, [0.55, -0.45], 1.28, 0x2a2c2f);
        ctx.rect('left', 0.0, 0.5, 3.4, 0.13, { round: 0.2, color: COL.plastic, rm: RM.plastic, nu: 10, off: 0.003, thick: 0.01, mirror: true });
        archFlares(ctx, 0.09);
        ctx.mirrors(0.95, 1.4, { reach: 0.05, sx: 0.06, sy: 0.12, sz: 0.2, color: COL.black });
        // Glass roof panel and the bed cover's seam.
        ctx.rect('top', 0, -0.62, 1.2, 1.6, { color: GLASS_ROOF, rm: RM.glass, nu: 3, nv: 6, off: 0.004 });
        ctx.rect('top', 0, -1.9, 1.5, 0.012, { color: 0x0b0b0c, rm: RM.plastic, nu: 4, off: 0.003, lod0: true });
      },
    };
  })();

  // ---- 22. Forge 1500: full-size crew-cab pickup with a long bed.
  (function () {
    const gh = greenhouse({ zb: 1.05, yb: 1.42, top: [0.4, 1.96], mid: [-0.4, 1.98, 0.2], rear: [-0.88, 1.97], base: [-0.92, 1.44], bot: 1.3, r: [0.03, 0.14, 0.06, 0.02], baseOut: 0.02 });
    DEFS.forge = {
      L: 5.92, W: 2.03, H: 1.98, fo: 0.97, ro: 1.26, R: 0.41, tyreW: 0.275, sill: 0.42, archGap: 0.07, wheel: 'truck',
      body: [
        [2.9, 0.45, 0.03], [2.96, 0.58, 0.05], [2.96, 1.05, 0.06], [2.86, 1.22, 0.1], [1.9, 1.34, 0.4], [1.05, 1.4, 0.05],
        [-0.86, 1.42, 0.02], [-0.9, 1.42], [-0.9, 1.08], [-2.88, 1.08, 0.02], [-2.96, 1.02, 0.03], [-2.96, 0.58, 0.04], [-2.88, 0.45, 0.03],
      ],
      bevel: 0.06,
      plan: [[-2.96, 0.99], [1.9, 1.0], [2.4, 0.98], [2.96, 0.93]],
      nose: 0.06, tail: 0.0, endLen: 0.4, tumble: [1.1, 1.42, 0.03],
      cabin: { pts: gh.pts, width: 1.9, bevel: 0.06, tumble: 0.09, y0: 1.4, y1: 1.97, crown: 0.015, wf: [0.05, 0.4, 1.05] },
      glass: { seats: [0.35, -0.5], ws: gh.ws, rw: gh.rw, rwT: [0.15, 0.85], rwInset: 0.25, aw: 0.1, side: [{ f: 'A', r: -0.04, b: 1.5, t: 1.88 }, { f: -0.12, r: -0.84, b: 1.5, t: 1.88 }] },
      seatZ: 0.35,
      extraBodies(q, lod) {
        const x = 1.015 - 0.045;
        return [
          { md: roundBox(0.09, 0.4, 2.03, 0.03, lod).at(x, 1.27, -1.915) },
          { md: roundBox(0.09, 0.4, 2.03, 0.03, lod).at(-x, 1.27, -1.915) },
          { md: roundBox(1.94, 0.4, 0.08, 0.025, lod).at(0, 1.27, -2.925) },
        ];
      },
      details(ctx) {
        ctx.grille(0.9, 1.22, 0.36, { surround: COL.chrome, bars: 3, vbars: 0, round: 0.12 });
        ctx.headlight('front', 0.84, 1.0, 0.3, 0.13, { round: 0.3, skew: 0.2, pods: 0, drl: { dy: -0.055, h: 0.014, w: 0.95 } });
        ctx.box('trim', 0, 0.62, 3.0, 2.02, 0.22, 0.16, 0.05, COL.chrome, RM.chrome);
        ctx.rect('front', 0, 0.42, 1.7, 0.1, { round: 0.3, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, lod0: true });
        ctx.box('trim', 0.74, 0.42, 2.97, 0.17, 0.07, 0.04, 0.02, 0x23262a, RM.dark, { mirror: true, lod0: true });
        ctx.plate('front', 0.64, { off: 0.1 });
        // Bed: liner, wheel humps, rail caps, chrome step bumper, tail lamps on the gate.
        ctx.box('trim', 0, 1.082, -1.91, 1.9, 0.02, 2.0, 0.005, 0x1a1a1b, RM.rubber);
        ctx.box('trim', 0.76, 1.15, -1.6, 0.34, 0.16, 1.0, 0.06, 0x1a1a1b, RM.rubber, { mirror: true });
        ctx.box('trim', 0.985, 1.475, -1.915, 0.11, 0.025, 2.05, 0.01, COL.plastic, RM.plastic, { mirror: true });
        ctx.box('trim', 0, 1.475, -2.925, 1.96, 0.025, 0.11, 0.01, COL.plastic, RM.plastic);
        ctx.rect('rear', 0, 1.36, 0.3, 0.045, { color: COL.black, rm: RM.gloss, round: 0.6, nu: 2, off: 0.003, thick: 0.01 });
        ctx.taillight('rear', 0.93, 1.27, 0.07, 0.3, { round: 0.2, rev: { dy: -0.1, w: 0.05, h: 0.07 }, bezel: null });
        ctx.box('trim', 0, 0.66, -3.03, 2.02, 0.2, 0.14, 0.05, COL.chrome, RM.chrome);
        ctx.box('trim', 0, 0.52, -3.0, 1.9, 0.16, 0.1, 0.04, 0x2a2b2d, RM.satin, { lod0: true });
        ctx.plate('rear', 1.16, { off: 0.01 });
        ctx.exhaust([-0.8], 0.46, 0.04, { color: 0x505050 });
        archFlares(ctx, 0.07);
        ctx.box('trim', 1.0, 0.5, 0.1, 0.14, 0.04, 2.1, 0.015, COL.plastic, RM.plastic, { mirror: true });
        ctx.seams([{ z: 1.12, y0: 0.9, y1: 1.4 }, { z: 0.1, y0: 0.55, y1: 1.92 }, { z: -0.88, y0: 0.6, y1: 1.92 }, { z0: 1.12, z1: 1.2, y: 0.9 }]);
        ctx.handles([0.6, -0.34], 1.58);
        ctx.mirrors(0.98, 1.58, { reach: 0.17, sx: 0.08, sy: 0.22, sz: 0.2, color: COL.black });
        if (!ctx.lod) for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) {
          const y = ctx.roofY(0.3, x);
          ctx.box('lights', x, y + 0.02, 0.5, 0.06, 0.035, 0.04, 0.012, COL.amber, RM.lens, { light: G.AMBER });
        }
      },
    };
  })();

  // ---- 23. Drover: 90s compact regular-cab work truck.
  (function () {
    const gh = greenhouse({ zb: 0.78, yb: 1.12, top: [0.36, 1.55], mid: [-0.1, 1.57, 0.2], rear: [-0.4, 1.55], base: [-0.44, 1.16], bot: 1.02, r: [0.03, 0.1, 0.06, 0.02], baseOut: 0.02 });
    DEFS.drover = {
      L: 4.75, W: 1.76, H: 1.58, fo: 0.82, ro: 0.98, R: 0.335, tyreW: 0.2, sill: 0.35, archGap: 0.06, wheel: 'silversteel',
      finish: 'satin',
      body: [
        [2.3, 0.42, 0.03], [2.375, 0.52, 0.05], [2.375, 0.85, 0.05], [2.28, 1.0, 0.07], [1.4, 1.04, 0.3], [0.8, 1.1, 0.05],
        [-0.4, 1.12, 0.02], [-0.46, 1.12], [-0.48, 0.88], [-2.3, 0.88, 0.02], [-2.375, 0.84, 0.03], [-2.375, 0.52, 0.03], [-2.3, 0.42, 0.03],
      ],
      bevel: 0.05,
      plan: [[-2.375, 0.99], [1.8, 1.0], [2.375, 0.94]],
      nose: 0.05, tail: 0, endLen: 0.4, tumble: [0.9, 1.12, 0.04],
      cabin: { pts: gh.pts, width: 1.58, bevel: 0.06, tumble: 0.1, y0: 1.1, y1: 1.56, crown: 0.012, wf: [0.04, 0.36, 0.78] },
      glass: { seats: [0.1], ws: gh.ws, rw: gh.rw, rwT: [0.12, 0.85], rwInset: 0.2, aw: 0.09, side: [{ f: 'A', r: -0.34, b: 1.2, t: 1.48 }] },
      seatZ: 0.1,
      extraBodies(q, lod) {
        const x = 0.88 - 0.035;
        return [
          { md: roundBox(0.07, 0.26, 1.86, 0.025, lod).at(x, 1.0, -1.43) },
          { md: roundBox(0.07, 0.26, 1.86, 0.025, lod).at(-x, 1.0, -1.43) },
          { md: roundBox(1.66, 0.26, 0.06, 0.02, lod).at(0, 1.0, -2.35) },
        ];
      },
      details(ctx) {
        ctx.grille(0.8, 0.96, 0.14, { surround: 0x34373a, bars: 2, round: 0.15, barColor: 0x4a4d50 });
        ctx.headlight('front', 0.64, 0.82, 0.34, 0.14, { round: 0.12, bezel: COL.chrome, pods: 0 });
        ctx.rect('front', 0, 0.5, 1.5, 0.12, { round: 0.3, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003, lod0: true });
        ctx.box('trim', 0, 0.56, 2.43, 1.8, 0.14, 0.12, 0.04, COL.chrome, RM.chrome);
        ctx.box('trim', 0, 0.38, 2.4, 1.0, 0.07, 0.07, 0.025, 0x2b2c2e, RM.satin, { lod0: true });
        ctx.plate('front', 0.56, { off: 0.07 });
        ctx.box('trim', 0, 0.882, -1.43, 1.62, 0.02, 1.84, 0.005, 0x2a2a2b, RM.rubber);
        ctx.box('trim', 0.62, 0.95, -1.15, 0.22, 0.12, 0.7, 0.05, 0x2a2a2b, RM.rubber, { mirror: true });
        ctx.box('trim', 0.86, 1.135, -1.43, 0.08, 0.02, 1.88, 0.008, COL.chrome, RM.chrome, { mirror: true, lod0: true });
        ctx.taillight('rear', 0.72, 1.0, 0.13, 0.2, { round: 0.2, rev: { dy: -0.06, w: 0.09, h: 0.04 }, bezel: COL.chrome });
        ctx.rect('rear', 0, 1.1, 1.2, 0.03, { color: COL.chrome, rm: RM.chrome, nu: 6, off: 0.004 });
        ctx.box('trim', 0, 0.55, -2.43, 1.78, 0.13, 0.12, 0.04, COL.chrome, RM.chrome);
        ctx.plate('rear', 0.52, { off: 0.07 });
        ctx.exhaust([-0.6], 0.38, 0.035, { color: 0x4a4a4a });
        ctx.seams([{ z: 0.8, y0: 0.8, y1: 1.1 }, { z: -0.1, y0: 0.5, y1: 1.5 }, { z0: 0.8, z1: 0.85, y: 0.8 }]);
        ctx.handles([0.02], 1.22, COL.chrome);
        ctx.rect('left', 0, 0.47, 1.6, 0.06, { round: 0.4, color: COL.chrome, rm: RM.chrome, nu: 6, off: 0.003, thick: 0.01, mirror: true, lod0: true });
        ctx.mirrors(0.66, 1.3, { reach: 0.16, sx: 0.06, sy: 0.19, sz: 0.1, color: COL.black });
        ctx.rect('left', 2.15, 0.78, 0.07, 0.035, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
      },
    };
  })();

  // ---- 24. Trailhand: boxy body-on-frame off-roader with round lamps and a tailgate spare.
  (function () {
    const gh = greenhouse({ zb: 0.85, yb: 1.2, top: [0.48, 1.82], mid: [-1.0, 1.84, 0.2], rear: [-2.17, 1.83], base: [-2.3, 1.22], bot: 1.1, r: [0.03, 0.08, 0.08, 0.03], baseOut: 0.02 });
    DEFS.trailhand = {
      L: 4.7, W: 2.0, H: 1.86, fo: 0.85, ro: 0.9, R: 0.4, tyreW: 0.285, sill: 0.4, archGap: 0.085, wheel: 'blackalloy', finish: 'satin',
      body: [
        [2.3, 0.5, 0.03], [2.35, 0.6, 0.03], [2.35, 1.0, 0.04], [2.28, 1.12, 0.05], [1.2, 1.16, 0.1], [0.85, 1.2, 0.04],
        [-2.2, 1.2, 0.04], [-2.35, 1.15, 0.03], [-2.35, 0.6, 0.03], [-2.28, 0.5, 0.03],
      ],
      bevel: 0.05,
      plan: [[-2.35, 0.97], [-1.9, 1.0], [1.9, 1.0], [2.35, 0.96]],
      nose: 0.03, tail: 0.02, endLen: 0.4, tumble: [1.0, 1.2, 0.03],
      cabin: { pts: gh.pts, width: 1.88, bevel: 0.06, tumble: 0.05, y0: 1.18, y1: 1.84, crown: 0.012, wf: [0.03, 0.48, 0.85], wr: [0.02, -2.17, -2.3] },
      glass: { seats: [0.3, -0.55], ws: gh.ws, rw: gh.rw, rwT: [0.1, 0.85], rwInset: 0.14, aw: 0.07, side: [{ f: 'A', r: -0.04, b: 1.32, t: 1.74 }, { f: -0.12, r: -0.95, b: 1.32, t: 1.74 }, { f: -1.2, r: -2.02, b: 1.34, t: 1.72 }] },
      seatZ: 0.2,
      details(ctx) {
        ctx.grille(0.88, 0.88, 0.24, { surround: 0x2b2d30, vbars: 7, bars: 0, round: 0.1, barColor: 0x1a1b1d });
        ctx.rect('front', 0, 0.88, 0.5, 0.05, { part: 'lights', round: 0.5, color: 0xe9ecef, rm: RM.lens, light: G.DRL, nu: 4, off: 0.012, lod0: true });
        ctx.headlight('front', 0.7, 0.92, 0.22, 0.22, { round: 1, bezel: 0x1c1d1f, pods: 0 });
        for (const x of [0.65, -0.65]) if (!ctx.lod) ctx.rect('front', x, 0.64, 0.12, 0.08, { part: 'lights', round: 0.6, color: 0xd4d8dc, rm: RM.lens, light: G.WHITE, nu: 3, off: 0.01, lod0: true });
        ctx.box('trim', 0, 0.56, 2.41, 2.0, 0.24, 0.14, 0.04, 0x2a2c2f, RM.satin);
        for (const x of [0.42, -0.42]) ctx.box('trim', x, 0.55, 2.5, 0.06, 0.05, 0.08, 0.02, 0xb01818, RM.gloss, { lod0: true });
        ctx.plate('front', 0.58, { off: 0.1 });
        // Rear: swing-away spare, vertical tail lamps, step bumper.
        ctx.taillight('rear', 0.92, 0.98, 0.09, 0.3, { round: 0.2, rev: { dy: -0.08, w: 0.06, h: 0.05 }, bezel: COL.black });
        ctx.box('trim', 0, 0.56, -2.43, 2.0, 0.24, 0.14, 0.04, 0x2a2c2f, RM.satin);
        ctx.plate('rear', 0.5, { off: 0.1 });
        if (!ctx.lod) {
          const tyre = revolve([[0.19, -0.14], [0.37, -0.125], [0.405, -0.09], [0.405, 0.09], [0.37, 0.125], [0.19, 0.14]], 22).at(0, 1.0, -2.55, Math.PI / 2);
          ctx.add('trim', tyre, COL.rubber, RM.rubber);
          ctx.add('trim', revolve([[0.001, 0.145], [0.2, 0.14], [0.2, 0.12]], 16).at(0, 1.0, -2.55, -Math.PI / 2), 0x2a2c2f, RM.satin);
        }
        ctx.exhaust([-0.7], 0.4, 0.04, { color: 0x4a4a4a });
        archFlares(ctx, 0.1, 0x1b1c1e);
        ctx.rect('left', 0.0, 0.5, 2.5, 0.07, { round: 0.3, color: 0x1b1c1e, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.03, mirror: true });
        ctx.seams([{ z: 0.88, y0: 0.7, y1: 1.2 }, { z: 0.0, y0: 0.55, y1: 1.8 }, { z: -1.0, y0: 0.55, y1: 1.8 }, { z0: -1.0, z1: 0.0, y: 0.58 }, { z: -2.2, y0: 0.6, y1: 1.2 }]);
        ctx.handles([0.4, -0.55], 1.25, COL.black);
        ctx.mirrors(0.92, 1.4, { reach: 0.14, sx: 0.08, sy: 0.2, sz: 0.14, color: 0x1b1c1e });
        // Roof rack and a removable-top seam.
        const y = ctx.roofY(-0.8, 0);
        ctx.box('trim', 0.7, y + 0.045, -0.9, 0.035, 0.035, 2.2, 0.012, 0x1d1e20, RM.satin, { mirror: true });
        for (const z of [-0.1, -0.9, -1.7]) ctx.box('trim', 0, y + 0.06, z, 1.42, 0.03, 0.04, 0.012, 0x1d1e20, RM.satin, { lod0: true });
        ctx.rect('left', 0.32, 0.55, 0.07, 0.035, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
      },
    };
  })();

  // ---- 25. Gallop GT: modern fastback pony car, long hood, tri-bar tails, optional twin stripes.
  const GALLOP_STRIPES = { 0xf1f1ee: 0x1d3b8a, 0x1f6fb5: 0xf1efe8, 0x14161a: 0xc1272d };
  (function () {
    const gh = greenhouse({ zb: 0.5, yb: 0.99, top: [-0.3, 1.34], mid: [-0.75, 1.36, 0.3], rear: [-1.12, 1.32], base: [-2.0, 1.02], bot: 0.88, r: [0.03, 0.2, 0.3, 0.1] });
    DEFS.gallop = {
      L: 4.8, W: 1.94, H: 1.38, fo: 0.92, ro: 1.16, R: 0.345, tyreW: 0.255, tyreWR: 0.275, sill: 0.2, archGap: 0.05, wheel: 'sport', livery: true,
      body: [
        [2.32, 0.26, 0.03], [2.4, 0.36, 0.05], [2.4, 0.66, 0.06], [2.3, 0.8, 0.1], [1.5, 0.92, 0.5], [0.55, 0.99, 0.1],
        [-0.6, 1.0, 0.3], [-1.5, 1.03, 0.3], [-2.2, 1.04, 0.1], [-2.4, 0.98, 0.06], [-2.4, 0.55, 0.06], [-2.34, 0.28, 0.03],
      ],
      bevel: 0.055,
      plan: [[-2.4, 0.92], [-2.0, 0.985], [-1.3, 1.0], [-0.4, 0.97], [0.6, 0.97], [1.4, 0.99], [2.0, 0.965], [2.4, 0.9]],
      nose: 0.1, tail: 0.06, endLen: 0.45, tumble: [0.7, 1.04, 0.07],
      dip: [[0.8, 2.3, 0.04, 0.8, 0.3]],
      cabin: { pts: gh.pts, width: 1.58, bevel: 0.07, tumble: 0.17, y0: 0.96, y1: 1.36, crown: 0.02, wf: [0.06, -0.3, 0.5], wr: [0.05, -1.12, -2.0] },
      glass: { seats: [-0.15], ws: gh.ws, rw: gh.rw, rwT: [0.05, 0.6], aw: 0.09, cw: 0.3, side: [{ f: 'A', r: -0.7, b: 1.05, t: 1.3 }] },
      seatZ: -0.2,
      details(ctx) {
        const stripe = GALLOP_STRIPES[ctx.hex];
        // Face: trapezoid grille, three-element lamps with a C of LEDs, low splitter.
        ctx.grille(0.54, 1.08, 0.2, { surround: 0x1b1c1e, round: 0.15, taper: 0.1, vbars: 9, bars: 2, barColor: 0x2a2c2f });
        ctx.headlight('front', 0.74, 0.74, 0.3, 0.075, { round: 0.6, skew: 0.5, taper: -0.15, pods: 2, drl: { dy: -0.036, h: 0.012, w: 0.92 } });
        ctx.rect('front', 0.7, 0.33, 0.34, 0.1, { round: 0.5, color: COL.grille, rm: RM.dark, nu: 4, off: 0.003, mirror: true });
        ctx.rect('front', 0, 0.3, 0.6, 0.08, { round: 0.5, color: COL.grille, rm: RM.dark, nu: 4, off: 0.003 });
        ctx.rect('front', 0, 0.16, 1.8, 0.04, { round: 0.3, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.014 });
        ctx.plate('front', 0.4, { off: 0.012, w: 0.4, h: 0.1 });
        // Tail: three light bars a side, centre diffuser, quad tips.
        ctx.rect('rear', 0.5, 0.82, 0.58, 0.17, { round: 0.2, color: 0x0a0a0b, rm: RM.gloss, nu: 5, off: 0.003, mirror: true });
        for (let k = 0; k < 3; k++) ctx.rect('rear', 0.33 + k * 0.17, 0.82, 0.12, 0.14, { part: 'lights', round: 0.3, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 2, nv: 2, off: 0.006, mirror: true });
        ctx.rect('rear', 0.76, 0.82, 0.08, 0.04, { part: 'lights', round: 0.4, color: COL.reverse, rm: RM.lens, light: G.REVERSE, nu: 2, off: 0.006, mirror: true, lod0: true });
        for (const s of [1, -1]) ctx.anchors.taillights.push(new THREE.Vector3(s * 0.55, 0.82, -2.43));
        ctx.plate('rear', 0.62, { w: 0.42, h: 0.1 });
        ctx.rect('rear', 0, 0.34, 1.5, 0.2, { round: 0.4, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
        if (!ctx.lod) for (const x of [0.3, 0.5, 0.7]) ctx.rect('rear', x, 0.34, 0.014, 0.16, { color: 0x1a1b1d, rm: RM.satin, nu: 1, nv: 2, off: 0.003, thick: 0.05, mirror: true });
        ctx.exhaust([0.62, 0.46, -0.46, -0.62], 0.3, 0.036);
        // Sides: shut lines, gills, hood vents, door-mounted mirrors.
        ctx.seams([{ z: 0.62, y0: 0.27, y1: 0.97 }, { z: -0.62, y0: 0.26, y1: 1.0, lean: 0.03 }, { z: -1.45, y0: 0.4, y1: 0.97 }]);
        ctx.handles([-0.35], 0.88, COL.black);
        ctx.rect('left', 0.9, 0.7, 0.22, 0.1, { round: 0.5, skew: -0.4, color: COL.grille, rm: RM.dark, nu: 3, off: 0.003, thick: 0.006, mirror: true });
        ctx.rect('left', -0.0, 0.245, 2.0, 0.05, { round: 0.5, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.012, mirror: true });
        for (const x of [0.3, -0.3]) ctx.rect('top', x, 1.68, 0.17, 0.4, { round: 0.2, color: COL.grille, rm: RM.dark, nu: 3, nv: 4, off: 0.004, thick: 0.01 });
        ctx.mirrors(0.34, 0.99, { sy: 0.085, sz: 0.15, reach: 0.08 });
        ctx.rect('left', 1.88, 0.62, 0.07, 0.03, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
        // Ducktail.
        ctx.box('paint', 0, ctx.roofY(-2.32, 0) + 0.025, -2.34, 1.5, 0.04, 0.16, 0.018, 'body', null, { rx: 0.14, lod0: true });
        if (stripe) {
          for (const x of [0.14, -0.14]) for (const [z0, z1, n] of [[0.58, 2.36, 14], [-0.88, -0.28, 6], [-2.36, -2.04, 4]]) {
            ctx.rect('top', x, (z0 + z1) / 2, 0.15, z1 - z0, { part: 'paint', color: stripe, nu: 1, nv: n, off: 0.006 });
          }
        }
      },
    };
  })();

  // ---- 26. Stinger 66: classic two-door hardtop coupe with Coke-bottle hips and chrome.
  (function () {
    const gh = greenhouse({ zb: 0.62, yb: 0.94, top: [-0.1, 1.34], mid: [-0.7, 1.36, 0.3], rear: [-1.1, 1.32], base: [-1.6, 0.99], bot: 0.84, r: [0.03, 0.2, 0.25, 0.08] });
    DEFS.stinger = {
      L: 4.95, W: 1.88, H: 1.38, fo: 1.0, ro: 1.13, R: 0.34, tyreW: 0.22, tyreWR: 0.24, sill: 0.22, archGap: 0.06, wheel: 'crager',
      body: [
        [2.4, 0.3, 0.03], [2.475, 0.4, 0.05], [2.475, 0.72, 0.05], [2.4, 0.84, 0.08], [1.5, 0.9, 0.6], [0.58, 0.94, 0.1],
        [-1.2, 0.96, 0.4], [-2.2, 1.0, 0.15], [-2.4, 0.98, 0.05], [-2.475, 0.9, 0.04], [-2.475, 0.45, 0.05], [-2.4, 0.3, 0.03],
      ],
      bevel: 0.05,
      plan: [[-2.475, 0.9], [-2.2, 0.98], [-1.35, 1.0], [-0.4, 0.955], [0.6, 0.95], [1.4, 0.985], [2.0, 0.97], [2.475, 0.92]],
      nose: 0.06, tail: 0.05, endLen: 0.4, tumble: [0.66, 1.0, 0.06],
      cabin: { pts: gh.pts, width: 1.5, color: 0x1b1b1d, bevel: 0.07, tumble: 0.16, y0: 0.94, y1: 1.3, crown: 0.015, wf: [0.05, -0.1, 0.62], wr: [0.04, -1.1, -1.6] },
      glass: { seats: [-0.15], ws: gh.ws, rw: gh.rw, rwT: [0.05, 0.85], aw: 0.09, cw: 0.15, beltColor: COL.chrome, side: [{ f: 'A', r: -0.55, b: 1.0, t: 1.28 }, { f: -0.62, r: 'C', b: 1.0, t: 1.26 }] },
      seatZ: -0.15,
      details(ctx) {
        ctx.headlight('front', 0.56, 0.62, 0.2, 0.2, { round: 1, bezel: COL.chrome, pods: 0 });
        ctx.rect('front', 0.56, 0.62, 0.075, 0.075, { color: 0x1a1b1d, rm: RM.satin, round: 1, nu: 3, off: 0.012, mirror: true, lod0: true });
        ctx.grille(0.6, 0.62, 0.2, { surround: COL.chrome, vbars: 9, bars: 1, round: 0.1, barColor: 0xa6aaae });
        ctx.rect('front', 0, 0.62, 0.1, 0.08, { color: 0xb11c22, rm: RM.gloss, round: 0.3, nu: 2, off: 0.012, lod0: true });
        ctx.box('trim', 0, 0.38, 2.5, 1.86, 0.12, 0.1, 0.04, COL.chrome, RM.chrome);
        for (const x of [0.5, -0.5]) ctx.box('trim', x, 0.42, 2.56, 0.07, 0.2, 0.06, 0.03, COL.chrome, RM.chrome, { lod0: true });
        ctx.plate('front', 0.36, { off: 0.08 });
        ctx.taillight('rear', 0.62, 0.76, 0.5, 0.15, { round: 0.2, bezel: COL.chrome, rev: { dx: -0.2, dy: 0, w: 0.07, h: 0.06, round: 0.3 } });
        ctx.rect('rear', 0, 0.76, 0.52, 0.02, { color: COL.chrome, rm: RM.chrome, nu: 5, off: 0.004 });
        ctx.box('trim', 0, 0.4, -2.54, 1.86, 0.12, 0.1, 0.04, COL.chrome, RM.chrome);
        ctx.plate('rear', 0.58);
        ctx.exhaust([0.55, -0.55], 0.27, 0.04);
        ctx.seams([{ z: 0.62, y0: 0.26, y1: 0.93 }, { z: -0.72, y0: 0.26, y1: 0.97, lean: 0.02 }]);
        ctx.handles([-0.4], 0.86);
        ctx.rect('left', -0.05, 0.28, 2.3, 0.022, { color: COL.chrome, rm: RM.chrome, nu: 10, off: 0.003, mirror: true });
        ctx.rect('left', 1.05, 0.66, 0.34, 0.11, { round: 0.4, color: COL.grille, rm: RM.dark, nu: 3, off: 0.003, thick: 0.006, mirror: true });
        for (const x of [0.28, -0.28]) ctx.rect('top', x, 1.6, 0.26, 0.46, { round: 0.2, color: 0x16171a, rm: RM.satin, nu: 3, nv: 6, off: 0.004, thick: 0.014 });
        ctx.mirrors(0.52, 0.96, { color: COL.chrome, sx: 0.06, sy: 0.07, sz: 0.12, reach: 0.08 });
        ctx.box('trim', 0, ctx.roofY(2.4, 0) + 0.025, 2.38, 0.03, 0.04, 0.07, 0.01, COL.chrome, RM.chrome, { lod0: true });
      },
    };
  })();

  // ---- 27. Sprint RS: hot hatch with a honeycomb grille, red trim line and a roof spoiler.
  (function () {
    const gh = greenhouse({ zb: 0.75, yb: 0.93, top: [0.08, 1.42], mid: [-0.7, 1.45, 0.4], rear: [-1.5, 1.42], base: [-2.08, 1.0], bot: 0.84, r: [0.03, 0.22, 0.14, 0.05], baseOut: 0.02 });
    DEFS.sprint = {
      L: 4.3, W: 1.8, H: 1.47, fo: 0.88, ro: 0.79, R: 0.325, tyreW: 0.225, sill: 0.2, archGap: 0.04, wheel: 'sport',
      body: [
        [2.07, 0.28, 0.04], [2.15, 0.4, 0.08], [2.14, 0.62, 0.1], [2.04, 0.76, 0.14], [1.3, 0.86, 0.35], [0.88, 0.92, 0.08],
        [-0.6, 0.95, 0.4], [-2.06, 0.97, 0.1], [-2.15, 0.9, 0.08], [-2.15, 0.5, 0.08], [-2.08, 0.3, 0.04],
      ],
      bevel: 0.06,
      plan: [[-2.15, 0.93], [-1.6, 0.99], [0.4, 1.0], [1.2, 0.99], [1.7, 0.95], [2.15, 0.87]],
      nose: 0.1, tail: 0.05, endLen: 0.45, tumble: [0.62, 0.97, 0.06],
      cabin: { pts: gh.pts, width: 1.54, bevel: 0.07, tumble: 0.15, y0: 0.92, y1: 1.46, crown: 0.02, wf: [0.06, 0.08, 0.75], wr: [0.03, -1.5, -2.08] },
      glass: { seats: [0.0, -0.85], ws: gh.ws, rw: gh.rw, rwT: [0.06, 0.85], aw: 0.09, cw: 0.22, side: [{ f: 'A', r: -0.28, b: 0.98, t: 1.39 }, { f: -0.36, r: 'C', b: 0.98, t: 1.36 }] },
      seatZ: 0.0,
      details(ctx) {
        ctx.headlight('front', 0.62, 0.66, 0.36, 0.085, { round: 0.5, skew: 0.45, taper: -0.1, drl: { dy: -0.04, h: 0.013, w: 0.95 } });
        ctx.grille(0.62, 0.86, 0.09, { surround: COL.black, round: 0.3, vbars: 14, bars: 0, barColor: 0x2b2d30 });
        ctx.rect('front', 0, 0.685, 1.0, 0.012, { color: 0xc0121b, rm: RM.gloss, nu: 6, off: 0.009 });
        ctx.rect('front', 0, 0.4, 1.1, 0.17, { round: 0.4, color: COL.grille, rm: RM.dark, nu: 6, nv: 2, off: 0.003 });
        ctx.rect('front', 0.66, 0.4, 0.14, 0.1, { part: 'lights', round: 0.6, color: 0xe0e6ea, rm: RM.lens, light: G.WHITE, nu: 3, off: 0.007, mirror: true, lod0: true });
        ctx.rect('front', 0, 0.24, 1.6, 0.035, { round: 0.3, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.012 });
        ctx.plate('front', 0.52, { off: 0.012, w: 0.42, h: 0.105 });
        ctx.taillight('rear', 0.62, 0.86, 0.26, 0.12, { round: 0.3, skew: 0.2, line: 0.0, rev: { dx: -0.1, dy: -0.04, w: 0.07, h: 0.03 } });
        ctx.rect('rear', 0, 0.9, 0.9, 0.014, { part: 'lights', round: 0.6, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 6, off: 0.006, lod0: true });
        ctx.plate('rear', 0.66, { w: 0.42, h: 0.105 });
        ctx.rect('rear', 0, 0.36, 1.5, 0.22, { round: 0.4, color: 0x0d0e0f, rm: RM.satin, nu: 6, nv: 2, off: 0.003, thick: 0.012 });
        ctx.exhaust([0.5, -0.5], 0.3, 0.038);
        ctx.seams([{ z: 0.68, y0: 0.24, y1: 0.93 }, { z: -0.3, y0: 0.24, y1: 0.96 }, { z: -1.1, y0: 0.55, y1: 0.97, lean: 0.02 }]);
        ctx.handles([0.15, -0.72], 0.82, COL.black);
        ctx.rect('left', 0, 0.255, 1.9, 0.05, { round: 0.5, color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.01, mirror: true });
        ctx.rect('left', 0.02, 0.29, 1.9, 0.01, { color: 0xc0121b, rm: RM.gloss, nu: 8, off: 0.006, mirror: true, lod0: true });
        ctx.mirrors(0.6, 0.97, { color: 0x111214, sy: 0.085, sz: 0.15 });
        const y = ctx.roofY(-1.5, 0);
        ctx.box('paint', 0, y + 0.02, -1.62, 1.3, 0.05, 0.24, 0.02, 'body', null, { rx: 0.2 });
        ctx.box('paint', 0.66, y - 0.02, -1.62, 0.03, 0.12, 0.22, 0.01, 'body', null, { mirror: true, lod0: true });
      },
    };
  })();

  // ---- 28. Halcyon Estate: long-roof family wagon with rails.
  (function () {
    const gh = greenhouse({ zb: 0.8, yb: 0.97, top: [0.05, 1.45], mid: [-1.0, 1.47, 0.5], rear: [-2.15, 1.44], base: [-2.35, 1.02], bot: 0.9, r: [0.03, 0.2, 0.1, 0.05], baseOut: 0.02 });
    DEFS.estate = {
      L: 4.95, W: 1.86, H: 1.5, fo: 0.95, ro: 1.15, R: 0.34, tyreW: 0.225, sill: 0.22, archGap: 0.06, wheel: 'fivestar',
      body: [
        [2.4, 0.28, 0.04], [2.475, 0.42, 0.08], [2.46, 0.65, 0.1], [2.36, 0.78, 0.14], [1.5, 0.88, 0.4], [0.82, 0.96, 0.08],
        [-1.5, 0.98, 0.3], [-2.35, 1.0, 0.1], [-2.475, 0.92, 0.08], [-2.475, 0.5, 0.08], [-2.4, 0.3, 0.04],
      ],
      bevel: 0.06,
      plan: [[-2.475, 0.9], [-2.0, 0.98], [-1.3, 1.0], [1.4, 1.0], [2.0, 0.96], [2.475, 0.88]],
      nose: 0.1, tail: 0.04, endLen: 0.5, tumble: [0.65, 1.0, 0.06],
      cabin: { pts: gh.pts, width: 1.64, bevel: 0.07, tumble: 0.14, y0: 0.94, y1: 1.47, crown: 0.02, wf: [0.07, 0.05, 0.8], wr: [0.03, -2.15, -2.35] },
      glass: { seats: [0.15, -0.8], ws: gh.ws, rw: gh.rw, rwT: [0.08, 0.86], aw: 0.09, cw: 0.13, side: [{ f: 'A', r: -0.32, b: 1.0, t: 1.38 }, { f: -0.4, r: -1.2, b: 1.0, t: 1.38 }, { f: -1.28, r: 'C', b: 1.0, t: 1.37 }] },
      seatZ: 0.2,
      details(ctx) {
        ctx.headlight('front', 0.62, 0.68, 0.42, 0.11, { round: 0.45, taper: 0.1, pods: 2, drl: { dy: -0.046, h: 0.013, w: 0.88 } });
        ctx.grille(0.62, 0.62, 0.12, { surround: COL.chrome, bars: 2, round: 0.35 });
        ctx.rect('front', 0, 0.36, 1.1, 0.11, { round: 0.6, color: COL.grille, rm: RM.dark, nu: 6, off: 0.003 });
        ctx.rect('front', 0, 0.27, 1.5, 0.04, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003, thick: 0.01 });
        ctx.plate('front', 0.47);
        ctx.taillight('rear', 0.76, 0.98, 0.1, 0.5, { round: 0.2, rev: { dy: -0.17, w: 0.07, h: 0.07 }, bezel: COL.black });
        ctx.rect('rear', 0, 1.1, 1.1, 0.025, { color: COL.chrome, rm: RM.chrome, nu: 5, off: 0.004, lod0: true });
        ctx.plate('rear', 0.76, { off: 0.012 });
        ctx.rect('rear', 0, 0.36, 1.55, 0.14, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 6, off: 0.003 });
        ctx.exhaust([-0.55], 0.3, 0.036);
        ctx.seams([{ z: 0.92, y0: 0.26, y1: 0.97 }, { z: -0.1, y0: 0.25, y1: 1.0 }, { z: -1.2, y0: 0.3, y1: 1.0, lean: 0.02 }, { z: -2.3, y0: 0.9, y1: 1.4, lean: 0.01 }]);
        ctx.handles([0.28, -0.7, -1.7], 0.84);
        ctx.rect('left', 0, 0.255, 2.3, 0.05, { round: 0.5, color: COL.plastic, rm: RM.plastic, nu: 8, off: 0.003, thick: 0.01, mirror: true });
        ctx.mirrors(0.66, 0.98, {});
        ctx.rect('left', 2.0, 0.64, 0.07, 0.03, { part: 'lights', round: 0.7, color: COL.amber, rm: RM.lens, light: G.AMBER, nu: 2, off: 0.004, mirror: true, lod0: true });
        for (const x of [0.62]) {
          const y = ctx.roofY(-0.8, x);
          ctx.box('trim', x, y + 0.055, -0.9, 0.04, 0.03, 2.5, 0.012, 0xb4b8bc, RM.alloy, { mirror: true });
          for (const z of [0.1, -1.9]) {
            const yy = ctx.roofY(z, x);
            ctx.box('trim', x, (yy + y + 0.05) / 2, z, 0.05, y + 0.06 - yy, 0.08, 0.012, COL.plastic, RM.plastic, { mirror: true });
          }
        }
      },
    };
  })();

  // ---- 29. Corvid LM: angular mid-engine hypercar with Y-lamps, hex exhausts and a wing.
  (function () {
    const gh = greenhouse({ zb: 0.75, yb: 0.8, top: [-0.2, 1.1], mid: [-0.7, 1.12, 0.3], rear: [-1.0, 1.08], base: [-2.0, 0.92], bot: 0.64, r: [0.02, 0.3, 0.3, 0.15] });
    DEFS.corvid = {
      L: 4.78, W: 2.03, H: 1.13, fo: 1.0, ro: 1.08, R: 0.34, tyreW: 0.265, tyreWR: 0.345, sill: 0.12, archGap: 0.035, wheel: 'split',
      body: [
        [2.3, 0.14, 0.02], [2.39, 0.22, 0.03], [2.39, 0.34, 0.03], [1.95, 0.6, 0.08], [1.4, 0.84, 0.08], [0.7, 0.86, 0.04],
        [-0.5, 0.86, 0.1], [-1.4, 0.96, 0.1], [-2.1, 0.96, 0.03], [-2.39, 0.88, 0.03], [-2.39, 0.45, 0.04], [-2.3, 0.16, 0.03],
      ],
      bevel: 0.04,
      plan: [[-2.39, 0.9], [-1.9, 0.99], [-1.3, 1.0], [-0.5, 0.92], [0.4, 0.92], [1.2, 0.97], [1.9, 0.88], [2.39, 0.66]],
      nose: 0.08, tail: 0.04, endLen: 0.5, tumble: [0.4, 0.96, 0.12],
      cabin: { pts: gh.pts, width: 1.3, bevel: 0.07, tumble: 0.22, y0: 0.8, y1: 1.1, crown: 0.02, wf: [0.12, -0.2, 0.75], wr: [0.09, -1.0, -2.0] },
      glass: { seats: [-0.35], ws: gh.ws, rw: gh.rw, rwT: [0.05, 0.45], aw: 0.08, side: [{ f: 'A', r: -0.68, b: 0.86, t: 1.02 }] },
      seatZ: -0.35,
      details(ctx) {
        ctx.headlight('front', 0.66, 0.46, 0.4, 0.04, { round: 0.8, skew: 0.9, taper: -0.2, drl: null });
        ctx.rect('front', 0.66, 0.5, 0.36, 0.022, { part: 'lights', round: 0.8, skew: -0.9, color: 0xffffff, rm: RM.lens, light: G.DRL, nu: 6, off: 0.008, mirror: true, lod0: true });
        ctx.rect('front', 0.6, 0.24, 0.62, 0.1, { round: 0.3, taper: 0.2, color: COL.grille, rm: RM.dark, nu: 5, off: 0.003, mirror: true });
        ctx.rect('front', 0, 0.26, 0.5, 0.12, { round: 0.3, taper: 0.2, color: COL.grille, rm: RM.dark, nu: 4, off: 0.003 });
        ctx.rect('front', 0, 0.16, 1.9, 0.03, { color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.014 });
        ctx.rect('top', 0, 1.7, 0.7, 0.34, { round: 0.2, color: COL.grille, rm: RM.dark, nu: 3, nv: 2, off: 0.003, lod0: true });
        ctx.quad('left', [-1.3, 0.42], [-0.45, 0.58], [-0.45, 0.8], [-1.3, 0.72], { color: COL.grille, rm: RM.dark, nu: 4, nv: 2, off: 0.003, mirror: true });
        ctx.rect('left', 0.8, 0.28, 0.5, 0.06, { round: 0.3, color: 0x101113, rm: RM.satin, nu: 4, off: 0.003, thick: 0.01, mirror: true });
        ctx.rect('left', -0.05, 0.19, 1.9, 0.06, { color: 0x101113, rm: RM.satin, nu: 8, off: 0.003, thick: 0.012, mirror: true });
        ctx.seams([{ z: 0.78, y0: 0.2, y1: 0.8, lean: -0.3 }, { z: -0.5, y0: 0.22, y1: 0.86, lean: 0.12 }, { z0: -0.5, z1: 0.78, y: 0.4 }]);
        ctx.mirrors(0.5, 0.82, { reach: 0.12, sy: 0.07, sz: 0.15 });
        ctx.taillight('rear', 0.6, 0.78, 0.5, 0.05, { round: 0.6, skew: -0.8, bezel: null, rev: { dx: -0.3, w: 0.06, h: 0.025 } });
        ctx.rect('rear', 0, 0.7, 1.0, 0.024, { part: 'lights', round: 0.5, color: COL.tailLens, rm: RM.tail, light: G.TAIL, nu: 8, off: 0.006 });
        ctx.rect('rear', 0, 0.32, 1.84, 0.3, { round: 0.2, color: COL.grille, rm: RM.dark, nu: 6, nv: 2, off: 0.003 });
        if (!ctx.lod) for (const x of [0.25, 0.5, 0.75]) ctx.rect('rear', x, 0.3, 0.016, 0.26, { color: 0x1a1b1d, rm: RM.satin, nu: 1, nv: 2, off: 0.003, thick: 0.07, mirror: true });
        ctx.plate('rear', 0.52, { w: 0.4, h: 0.1 });
        ctx.exhaust([-0.14, 0, 0.14], 0.52, 0.048, { color: 0x3a3632 });
        if (!ctx.lod) for (let k = 0; k < 6; k++) ctx.rect('top', 0, -1.3 - k * 0.1, 0.9, 0.03, { color: 0x0c0d0e, rm: RM.dark, nu: 4, off: 0.003, thick: 0.01 });
        wing(ctx, -2.0, 1.22, 1.9, 0.36, { tilt: -0.14, plateH: 0.2 });
      },
    };
  })();

  // --------------------------------------------------------------- specs
  const INFO = {
    vireo: ['Vireo GT', 'Aurel', 'sports', 1420, 71, 0.92, 0.9, 2, [0xff6a1a, 0xff3d8b, 0x13b5b1, 0xf2f2ee, 0x121314]],
    halcyon: ['Halcyon', 'Merrow', 'sedan', 1480, 55, 0.48, 0.58, 4, [0xb8bcc0, 0x1d2e52, 0x5c1420, 0xefefea, 0xcbbd9c, 0x3a3d42, 0x1f4030]],
    pipit: ['Pipit', 'Kobo', 'compact', 1050, 46, 0.4, 0.56, 4, [0xf2c61f, 0x9fe0c4, 0xc8202a, 0x78b8e8, 0xf2f2ee]],
    ironclad: ['Ironclad 68', 'Dunmore', 'muscle', 1650, 66, 0.8, 0.5, 4, [0x0e0e10, 0xa8101c, 0x3b1558, 0xd29a1c]],
    porter: ['Porter', 'Hask', 'van', 2400, 40, 0.22, 0.42, 2, [0xf1f1ee, 0xb9bcbf, 0x6b4a32]],
    mesa: ['Mesa', 'Dunmore', 'pickup', 2150, 50, 0.45, 0.5, 4, [0xa8161c, 0x1f3a26, 0xb59a70, 0x111214]],
    scout: ['Scout 4x4', 'Breakwater Arsenal', 'pickup', 2300, 46, 0.52, 0.62, 4, [0x4b5320, 0x5d6b3c, 0x6b6545]],
    cab: ['Halcyon Cab', 'Merrow', 'taxi', 1520, 52, 0.45, 0.56, 4, [0xf5b800]],
    interceptor: ['Halcyon Interceptor', 'Merrow', 'police', 1620, 64, 0.72, 0.68, 4, [0x0d0e10]],
    zephyr: ['Zephyr RS', 'Aurel', 'sports', 1350, 72, 1.0, 0.95, 2, [0xe8e6e0, 0x1a1c20, 0xd4ff1e, 0x2a55d8, 0xb81c1c]],
    tern: ['Tern', 'Kobo', 'suv', 1780, 52, 0.5, 0.55, 5, [0xeeeeea, 0x2b2f35, 0x7a8288, 0x6e1a1a, 0x2b4a6e, 0x4d5a3a]],
    sovereign: ['Sovereign', 'Merrow', 'sedan', 2250, 60, 0.6, 0.6, 4, [0x0a0a0c, 0xeeeae2, 0x0a0a0c, 0x141c33, 0xb9a98c]],
    bulwark: ['Bulwark', 'Hask', 'van', 6000, 32, 0.1, 0.35, 2, [0xdcdad2, 0x8c8f93, 0x1f3a2a]],
    hauler: ['Hauler', 'Hask', 'van', 5000, 30, 0.1, 0.35, 2, [0xf1f1ee, 0x1e4f9a, 0xb8161c, 0x2a6a3a, 0xe0a81a]],
    medic: ['Medic One', 'Hask', 'van', 2800, 42, 0.28, 0.45, 2, [0xf4f4f1]],
    drifter: ['Drifter S', 'Kobo', 'sports', 1180, 62, 0.74, 0.38, 4, [0xf1f0ea, 0x3a2a5e, 0xf2c500, 0x1d4fb8, 0x111111]],
    lowrider: ['Duchess', 'Dunmore', 'muscle', 2100, 48, 0.38, 0.4, 4, [0x9a0a1e, 0x4a0f5e, 0x0a6f7a, 0xb8862a, 0x1f6b2a]],
    beater: ['Pipit Rustbucket', 'Kobo', 'compact', 980, 36, 0.18, 0.4, 4, [0x7a8c7e, 0x9c6d5a, 0x8f8a73, 0x5f6f86]],
    unmarked: ['Halcyon Detective', 'Merrow', 'police', 1580, 62, 0.7, 0.66, 4, [0x3a3d42, 0x23262b, 0x4a4d52]],
    // Roster v2. [name, make, class, mass kg, top speed m/s, accel 0..1, grip 0..1, seats, palette]
    volta: ['Volta S', 'Arcus', 'ev', 2100, 62, 0.95, 0.74, 5, [0xf3f3f1, 0x2a2d33, 0x8a8f95, 0x8a1626, 0x24478a, 0xc9ccd0]],
    voltaic: ['Volta Y', 'Arcus', 'ev', 1980, 57, 0.86, 0.66, 5, [0xf3f3f1, 0x2a2d33, 0x8a8f95, 0x8a1626, 0x24478a, 0xe8e9ea]],
    monolith: ['Monolith', 'Arcus', 'pickup', 3100, 50, 0.84, 0.62, 5, [0xb7babd, 0x9c9fa3, 0xcdd0d2, 0x3a3d42, 0x4a6a44]],
    forge: ['Forge 1500', 'Dunmore', 'pickup', 2500, 52, 0.6, 0.5, 5, [0xf1f1ee, 0x2a2d33, 0x9aa0a6, 0x8a1d22, 0x2a5a8a, 0x4a6a44]],
    drover: ['Drover', 'Hask', 'pickup', 1450, 40, 0.34, 0.42, 3, [0x7a2a22, 0x2e4a6a, 0xdcd6c4, 0x4a5a3a, 0xb8a66a]],
    trailhand: ['Trailhand', 'Rook', 'suv', 2300, 45, 0.5, 0.6, 5, [0x5a6b3a, 0xd9d3c4, 0x1e5a94, 0xc8541a, 0x2a2d33, 0xefefea]],
    gallop: ['Gallop GT', 'Dunmore', 'muscle', 1760, 69, 0.86, 0.62, 4, [0xc1272d, 0x1f6fb5, 0x14161a, 0xf1f1ee, 0xd9a41a, 0x3a4a3a]],
    stinger: ['Stinger 66', 'Dunmore', 'muscle', 1560, 62, 0.7, 0.45, 4, [0x1f5a3a, 0xb02a2a, 0xe8d8a0, 0x2a4a8a, 0xd4a017, 0x14161a]],
    sprint: ['Sprint RS', 'Kobo', 'compact', 1320, 58, 0.74, 0.76, 4, [0xc8202a, 0xf1f1ee, 0x14161a, 0x1d4fb8, 0x8a8f95, 0xf2c500]],
    estate: ['Halcyon Estate', 'Merrow', 'sedan', 1720, 54, 0.5, 0.6, 5, [0x2a3d33, 0xb8bcc0, 0x1d2e52, 0xefefea, 0x5c1420, 0x7b6a52]],
    corvid: ['Corvid LM', 'Aurel', 'sports', 1480, 72, 1.0, 0.96, 2, [0xf26b00, 0xf2f2ee, 0x151618, 0xc8102e, 0x6a1fa0, 0xffc400]],
  };

  const TYPES = {};
  for (const id of Object.keys(INFO)) {
    const i = INFO[id], d = DEFS[id];
    const zF = d.L / 2 - d.fo, zR = -d.L / 2 + d.ro;
    const inset = d.inset === undefined ? 0.025 : d.inset;
    const track = 2 * ((d.W / 2) * keyed(d.plan, zF) - (d.tyreW || 0.22) / 2 - inset);
    TYPES[id] = {
      id, name: i[0], make: i[1], cls: i[2],
      length: d.L, width: d.W, height: d.H,
      wheelbase: +(zF - zR).toFixed(3), trackWidth: +track.toFixed(3), wheelRadius: d.R,
      mass: i[3], topSpeed: i[4], accel: i[5], grip: i[6], seats: i[7], palette: i[8],
      siren: d.siren || null,
    };
  }

  // ------------------------------------------------------------ CarModel
  const E = {
    headOn: [4, 3.8, 3.3], headOff: [0.15, 0.15, 0.15],
    drlOn: [3.2, 3.1, 2.9], drlOff: [0.12, 0.12, 0.12],
    tailRun: [1.2, 0.03, 0.02], tailBrake: [6, 0.12, 0.05], tailOff: [0.22, 0.006, 0.004],
    revOn: [3, 3, 3], revOff: [0.04, 0.04, 0.04],
    red: [6, 0.2, 0.1], blue: [0.2, 0.5, 7], white: [6, 6, 6], sirenOff: [0.05, 0.05, 0.05],
    signOn: [2.6, 2.3, 1.5], signDay: [1.1, 1.0, 0.7],
    plateOn: [0.3, 0.3, 0.28], zero: [0, 0, 0],
    amberOn: [1.2, 0.45, 0.03], amberOff: [0.06, 0.025, 0.0],
  };

  class CarModel {
    constructor(id, opts) {
      opts = opts || {};
      const spec = TYPES[id], d = DEFS[id];
      this.id = id;
      this.spec = spec;
      this.lod = opts.lod ? 1 : 0;
      let color = opts.color;
      if (color === undefined || color === null) {
        const rng = new VH.RNG((opts.seed || 0) >>> 0);
        rng.next();
        color = spec.palette[Math.floor(rng.next() * spec.palette.length) % spec.palette.length];
      }
      this.color = color;
      const B = buildBody(id, this.lod, color);
      this.stats = { triangles: B.tris, buildMs: B.ms };
      this.finish = d.finishFor ? d.finishFor(color) : d.finish || '';
      this._paintHex = d.livery ? 0xffffff : color;
      this._paintShared = paintMaterial(this._paintHex, this.finish);
      this._dmgMat = null;
      this.le = new Float32Array(GROUPS * 3);
      this.lightMat = lightsMaterial(this.le);

      this.root = new THREE.Group();
      this.root.name = 'car-' + id;
      this.body = new THREE.Group();
      this.body.name = 'car-body';
      this.root.add(this.body);
      this.meshes = [];
      const mk = (geo, mat, parent, name) => {
        const m = new THREE.Mesh(geo, mat);
        m.name = name;
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
        this.meshes.push(m);
        return m;
      };
      this.paintMesh = mk(B.paint, this._paintShared, this.body, 'paint');
      this.trimMesh = mk(B.trim, trimMaterial(), this.body, 'trim');
      this.lightsMesh = mk(B.lights, this.lightMat, this.body, 'lights');

      this.wheels = [];
      for (const w of B.wheels) {
        const pivot = new THREE.Group();
        pivot.position.set(w.x, w.radius, w.z);
        const spin = new THREE.Object3D();
        pivot.add(spin);
        const geo = wheelGeometry(w.radius, w.width, d.wheel || 'alloy', this.lod, d.whitewall);
        const mesh = mk(geo, trimMaterial(), spin, 'wheel');
        if (w.x < 0) mesh.rotation.y = Math.PI;
        this.root.add(pivot);
        this.wheels.push({ pivot, spin, mesh, x: w.x, z: w.z, radius: w.radius, width: w.width, front: w.front });
        this.stats.triangles += geo.userData.tris || 0;
      }
      this.stats.drawCalls = this.meshes.length;

      const seatZ = d.seatZ === undefined ? 0 : d.seatZ;
      const A = B.anchors;
      this.anchors = {
        driverSeat: new THREE.Vector3(0.37, d.sill + 0.34, seatZ),
        doorLeft: new THREE.Vector3(d.W / 2 + 0.45, 0, seatZ + 0.25),
        doorRight: new THREE.Vector3(-d.W / 2 - 0.45, 0, seatZ + 0.25),
        headlights: A.headlights.map((v) => v.clone()),
        taillights: A.taillights.map((v) => v.clone()),
        exhaust: A.exhaust.map((v) => v.clone()),
        siren: A.siren ? A.siren.clone() : null,
      };
      this.state = { head: false, brake: false, reverse: false, siren: null, damage: 0 };
      this.sirenState = { red: 0, blue: 0 };
      this._apply();
    }

    _set(g, v) {
      this.le[g * 3] = v[0];
      this.le[g * 3 + 1] = v[1];
      this.le[g * 3 + 2] = v[2];
    }

    _apply() {
      const s = this.state;
      this._set(G.NONE, E.zero);
      this._set(G.HEAD, s.head ? E.headOn : E.headOff);
      this._set(G.DRL, s.head ? E.drlOn : E.drlOff);
      this._set(G.TAIL, s.brake ? E.tailBrake : s.head ? E.tailRun : E.tailOff);
      this._set(G.REVERSE, s.reverse ? E.revOn : E.revOff);
      this._set(G.SIGN, s.head ? E.signOn : E.signDay);
      this._set(G.PLATE, s.head ? E.plateOn : E.zero);
      this._set(G.AMBER, s.head ? E.amberOn : E.amberOff);
      const r = this.sirenState;
      const medic = this.spec.siren === 'medic';
      this._set(G.RED, r.red ? E.red : E.sirenOff);
      this._set(G.BLUE, r.blue ? E.blue : E.sirenOff);
      this._set(G.WHITE, medic && r.blue ? E.white : E.sirenOff);
    }

    setHeadlights(on) {
      on = !!on;
      if (on !== this.state.head) {
        this.state.head = on;
        this._apply();
      }
    }
    setBrake(on) {
      on = !!on;
      if (on !== this.state.brake) {
        this.state.brake = on;
        this._apply();
      }
    }
    setReverse(on) {
      on = !!on;
      if (on !== this.state.reverse) {
        this.state.reverse = on;
        this._apply();
      }
    }

    /**
     * Emergency lights. t = time in seconds (null = off). Sides alternate
     * 2.5 times a second; each side's turn is a quad flash (four strobes).
     * Returns { red, blue } (0 or 1) so the game can drive a real light.
     * For the ambulance, "blue" is its white phase.
     */
    setSiren(t) {
      if (!this.spec.siren) return null;
      const r = this.sirenState;
      let red = 0, blue = 0;
      if (t !== null && t !== undefined && isFinite(t)) {
        const cyc = (((t * 1.25) % 1) + 1) % 1;
        const k = ((cyc % 0.5) * 2) * 4;
        const on = k - Math.floor(k) < 0.55 ? 1 : 0;
        red = cyc < 0.5 ? on : 0;
        blue = cyc < 0.5 ? 0 : on;
      }
      if (red !== r.red || blue !== r.blue) {
        r.red = red;
        r.blue = blue;
        this._apply();
      }
      return r;
    }

    /** 0..1: dents at the nose and tail, darker, rougher, dulled paint. */
    setDamage(dmg) {
      dmg = clamp(+dmg || 0, 0, 1);
      this.state.damage = dmg;
      if (dmg > 0.02) {
        if (!this._dmgMat) {
          this._dmgMat = damagedPaintMaterial(this._paintHex, this.finish, this.spec.length / 2);
          this.paintMesh.material = this._dmgMat;
        }
        this._dmgMat.userData.uniforms.uDamage.value = dmg;
      } else if (this._dmgMat) {
        this.paintMesh.material = this._paintShared;
        this._dmgMat.dispose();
        this._dmgMat = null;
      }
    }

    /** A new colour (stores.js: the Spray Shack). Liveried cars keep their livery. */
    repaint(hex) {
      const d = DEFS[this.id];
      if (!d || d.livery) return false;
      this.color = hex;
      this._paintHex = hex;
      this.finish = d.finishFor ? d.finishFor(hex) : d.finish || '';
      this._paintShared = paintMaterial(hex, this.finish);
      if (this._dmgMat) {
        this._dmgMat.dispose();
        this._dmgMat = null;
      }
      this.paintMesh.material = this._paintShared;
      return true;
    }

    setVisible(v) {
      this.root.visible = !!v;
    }

    setShadows(cast) {
      for (const m of this.meshes) m.castShadow = !!cast;
    }

    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      this.lightMat.dispose();
      if (this._dmgMat) this._dmgMat.dispose();
      this._dmgMat = null;
    }
  }

  // ----------------------------------------------------------------- API
  VH.CarModels = {
    TYPES,
    GROUPS: G,
    list() {
      return Object.keys(TYPES);
    },
    /** build(typeId, { color, seed, lod }) → CarModel. */
    build(typeId, opts) {
      if (!TYPES[typeId]) throw new Error('Unknown car type ' + typeId);
      return new CarModel(typeId, opts);
    },
    /** Build (and cache) the geometry for some types ahead of time. */
    prebuild(ids, lods) {
      for (const id of ids || Object.keys(TYPES)) {
        for (const lod of lods || [0, 1]) {
          const d = DEFS[id];
          buildBody(id, lod, d.livery ? TYPES[id].palette[0] : 0);
        }
      }
    },
    /** Free every cached geometry and shared material (for a full reload). */
    clearCache() {
      for (const b of cache.bodies.values()) {
        b.paint.dispose();
        b.trim.dispose();
        b.lights.dispose();
      }
      for (const g of cache.wheels.values()) g.dispose();
      for (const m of cache.paint.values()) m.dispose();
      if (cache.trim) cache.trim.dispose();
      if (cache.atlas) cache.atlas.dispose();
      cache.bodies.clear();
      cache.wheels.clear();
      cache.paint.clear();
      cache.trim = null;
      cache.atlas = null;
    },
    CarModel,
  };
})();
