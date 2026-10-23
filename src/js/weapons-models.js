/*
 * weapons-models.js — procedural, stylised models of every weapon.
 *
 *   VH.WeaponModels.build(id)     a THREE.Group for the hand
 *   VH.WeaponModels.pickup(id)    the same model at 1.3x, centred, for the world
 *   VH.WeaponModels.muzzleFlash() an additive star-and-petals flash, hidden
 *
 * Frame (all models): metres, the grip where the hand closes is at the
 * origin, +Z is where the barrel points, +Y is up and -X is the weapon's
 * right side (the ejection port side). Guns are held with the grip running
 * down -Y and slightly back, like a real pistol grip. Melee weapons and the
 * molotov continue that same grip line: the bat, the knife blade and the
 * bottle's neck run along +Y out of the top of the fist, so one hand
 * attachment works for every weapon (with the arm raised to aim, the bat
 * stands up ready to swing and the pistol points forward).
 *
 * Each model's parts are merged into one geometry per material (1-3 draw
 * calls). Geometry is built once per weapon and shared by every copy, so a
 * street full of armed NPCs costs no extra memory.
 *
 * group.userData:
 *   id, kind         weapon id and data kind ('hitscan', 'melee', ...)
 *   muzzle           Vector3, muzzle position (the striking tip for melee,
 *                    the centre for thrown weapons)
 *   twoHanded        bool; offHand is the support-hand grip (Vector3) or null
 *   tip              melee striking point (Vector3) or null
 *   sight            where the eye goes for a scope or sight picture, or null
 *   flashScale       muzzle-flash size for this weapon
 *   flame            molotov only: a small additive flame on the rag, hidden
 *   drawCalls        number of meshes
 */
(function () {
  'use strict';

  const VH = window.VH;

  // sRGB hex palette. Vertex colours carry these, so each material is shared.
  const C = {
    gunmetal: 0x3a3f46,
    gunmetal2: 0x484e56,
    slide: 0x575d66,
    blued: 0x1c2026,
    steel: 0x8f969d,
    darkSteel: 0x4b5057,
    stainless: 0xc6cacf,
    stainless2: 0xa9aeb4,
    blade: 0xd8dce0,
    gold: 0xd9a84e,
    polymer: 0x1d1f23,
    polymer2: 0x2b2e34,
    polymer3: 0x121316,
    rubber: 0x151618,
    tan: 0xa89070,
    tanDark: 0x7d6a50,
    olive: 0x565e40,
    oliveDark: 0x3f452f,
    walnut: 0x5e2f17,
    walnutDark: 0x3f1e0e,
    ash: 0xcaa06a,
    bat2: 0x1d1a1b,
    tape: 0x1a1a1c,
    orange: 0xff7a3d,
    pink: 0xff4f8b,
    amber: 0xf2b233,
    lens: 0x3558a8,
    lensWarm: 0xff7a59,
    hole: 0x050506,
    grenade: 0x59623f,
    cloth: 0xcbb58c,
    clothDark: 0x8f6b43,
    glass: 0x9fe0bd,
    fuel: 0xc46a1a,
    label: 0xdcc9a0,
    labelRed: 0xb4442a,
  };

  // ------------------------------------------------------------ materials
  let MATS = null;
  const MAT_ORDER = ['metal', 'poly', 'chrome', 'lacquer', 'glass'];

  function materials() {
    if (MATS) return MATS;
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true }, o));
    MATS = {
      // Gunmetal, blued and anodised parts.
      metal: std({ metalness: 0.8, roughness: 0.4 }),
      // Polymer, rubber, grip tape, cloth and paint.
      poly: std({ metalness: 0, roughness: 0.66 }),
      // Stainless, blades, gold accents and lenses.
      chrome: std({ metalness: 1, roughness: 0.2 }),
      // Varnished wood and the molotov's fuel.
      lacquer: std({ metalness: 0, roughness: 0.34 }),
      // Bottle glass. Transparent + double sided: three.js draws back faces first.
      glass: std({
        metalness: 0, roughness: 0.04, transparent: true, opacity: 0.26,
        depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6,
      }),
    };
    for (const k in MATS) MATS[k].name = 'weapon-' + k;
    return MATS;
  }

  // ------------------------------------------------------ geometry helpers
  /**
   * Box with rounded edges (RoundedBoxGeometry-style), centred on the origin.
   * `seg` bevel segments; `taper` narrows X toward the top (1 = none).
   */
  function roundedBox(w, h, d, r, seg, taper) {
    r = Math.min(r || 0, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5);
    if (!(r > 0)) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (taper && taper !== 1) applyTaper(g, h, taper);
      return g;
    }
    seg = seg || 2;
    const n = seg * 2 + 1;
    const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const half = [w / 2, h / 2, d / 2];
    const inner = [w / 2 - r, h / 2 - r, d / 2 - r];
    const p = [0, 0, 0];
    const c = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      for (let a = 0; a < 3; a++) {
        const u = pos.getComponent(i, a);
        const k = Math.round((u + 0.5) * n);
        let x;
        if (k <= seg) x = -half[a] + r * (k / seg);
        else if (k >= n - seg) x = inner[a] + r * ((k - (n - seg)) / seg);
        else x = -inner[a] + (2 * inner[a]) * ((k - seg) / (n - 2 * seg));
        p[a] = x;
        c[a] = Math.max(-inner[a], Math.min(inner[a], x));
      }
      let dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;
      pos.setXYZ(i, c[0] + dx * r, c[1] + dy * r, c[2] + dz * r);
      nrm.setXYZ(i, dx, dy, dz);
    }
    if (taper && taper !== 1) applyTaper(g, h, taper);
    return g;
  }

  function applyTaper(g, h, taper) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h / 2) / h;
      pos.setX(i, pos.getX(i) * (1 + (taper - 1) * t));
    }
  }

  /**
   * Smooth normals across shared positions, except across creases sharper
   * than `angleDeg` (like three's toCreasedNormals). Returns a non-indexed geometry.
   */
  function creaseNormals(geo, angleDeg) {
    if (geo.index) {
      const flat = geo.toNonIndexed();
      geo.dispose();
      geo = flat;
    }
    const pos = geo.attributes.position.array;
    const n = pos.length / 3;
    const tris = Math.floor(n / 3);
    const fn = new Float32Array(tris * 3);
    const fa = new Float32Array(tris);
    for (let t = 0; t < tris; t++) {
      const a = t * 9;
      const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2];
      const vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const len = Math.hypot(cx, cy, cz);
      if (len > 1e-14) {
        fn[t * 3] = cx / len;
        fn[t * 3 + 1] = cy / len;
        fn[t * 3 + 2] = cz / len;
      }
      fa[t] = len;
    }
    const groups = new Map();
    const q = 2e5;
    for (let i = 0; i < n; i++) {
      const key = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q);
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(i);
    }
    const out = new Float32Array(n * 3);
    const cosT = Math.cos((angleDeg * Math.PI) / 180);
    for (const list of groups.values()) {
      for (const i of list) {
        const t = (i / 3) | 0;
        const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
        let sx = 0, sy = 0, sz = 0;
        for (const j of list) {
          const u = (j / 3) | 0;
          const gx = fn[u * 3], gy = fn[u * 3 + 1], gz = fn[u * 3 + 2];
          if (fx * gx + fy * gy + fz * gz >= cosT) {
            sx += gx * fa[u];
            sy += gy * fa[u];
            sz += gz * fa[u];
          }
        }
        const len = Math.hypot(sx, sy, sz) || 1;
        out[i * 3] = sx / len;
        out[i * 3 + 1] = sy / len;
        out[i * 3 + 2] = sz / len;
      }
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
    return geo;
  }

  /** Trace a point list into a Shape/Path: [x,y] line, [cx,cy,x,y] quadratic, [c1x,c1y,c2x,c2y,x,y] cubic. */
  function trace(target, pts) {
    target.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 2) target.lineTo(p[0], p[1]);
      else if (p.length === 4) target.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else target.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    target.closePath();
    return target;
  }

  /** Extrude a 2D outline by `depth` along +Z (centred), with a rounded bevel that keeps the outline size. */
  function extrude(pts, depth, bevel, holes, curveSegments) {
    const shape = trace(new THREE.Shape(), pts);
    if (holes) for (const h of holes) shape.holes.push(trace(new THREE.Path(), h));
    bevel = Math.min(bevel || 0, depth * 0.45);
    const core = Math.max(0.0002, depth - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: core,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 2,
      curveSegments: curveSegments || 10,
    });
    g.translate(0, 0, -core / 2);
    return g;
  }

  /** Side-view profile: points are (z, y); the thickness runs along X. */
  function sideProfile(pts, width, bevel, holes, curveSegments) {
    const g = extrude(pts, width, bevel, holes, curveSegments);
    g.rotateY(-Math.PI / 2); // shape x → +Z, extrusion → X
    return creaseNormals(g, 38);
  }

  /** Front-view plate: points are (x, y); the depth runs along Z. */
  function frontPlate(pts, depth, bevel, holes, curveSegments) {
    return creaseNormals(extrude(pts, depth, bevel, holes, curveSegments), 38);
  }

  /** Trigger-guard outline open at the top: `outer` and `inner` run rear-top → bottom → front-top. */
  function uShape(outer, inner) {
    return outer.concat(inner.slice().reverse());
  }

  /** Rounded U (a revolver guard): elliptical bottom centred (cz, cy), straight legs up to `top`. */
  function ellipseU(cz, cy, rzO, ryO, rzI, ryI, top, steps) {
    const arc = (rz, ry) => {
      const pts = [[cz - rz, top]];
      for (let i = 0; i <= steps; i++) {
        const a = Math.PI + (i / steps) * Math.PI;
        pts.push([cz + Math.cos(a) * rz, cy + Math.sin(a) * ry]);
      }
      pts.push([cz + rz, top]);
      return pts;
    };
    return uShape(arc(rzO, ryO), arc(rzI, ryI));
  }

  /** Circle outline with `lobes` scallops (a fluted revolver cylinder). */
  function flutedCircle(r, lobes, depth, phase, steps) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const f = Math.pow(Math.max(0, Math.cos(lobes * (a - phase))), 6);
      const rr = r - depth * f;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return pts;
  }

  /** Deterministic jitter of every vertex, identical for shared positions. */
  function crumple(geo, amount, seed) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = VH.math.hash2(Math.round(x * 9000) + seed * 31, Math.round(y * 9000) * 7 + Math.round(z * 9000));
      const h2 = VH.math.hash2(Math.round(z * 9000) + seed, Math.round(x * 9000) * 3 + 11);
      const k = 1 + (h - 0.5) * amount;
      p.setXYZ(i, x * k, y * (1 + (h2 - 0.5) * amount), z * k);
    }
    return creaseNormals(geo, 70);
  }

  // ------------------------------------------------------------------ Kit
  /** Collects parts into one GeometryBuilder per material. */
  class Kit {
    constructor() {
      this.parts = {};
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._e = new THREE.Euler();
      this._p = new THREE.Vector3();
      this._s = new THREE.Vector3();
    }

    /** Merge `geo` (disposed afterwards) at pos / rot (Euler XYZ) / scale. */
    put(mat, geo, hex, pos, rot, scale) {
      this._e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
      this._q.setFromEuler(this._e);
      this._p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
      if (typeof scale === 'number') this._s.set(scale, scale, scale);
      else this._s.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
      this._m.compose(this._p, this._q, this._s);
      let b = this.parts[mat];
      if (!b) b = this.parts[mat] = new VH.GeometryBuilder();
      b.merge(geo, this._m, VH.col(hex));
      geo.dispose();
      return this;
    }

    /** Rounded box from min / max corners. opts: { seg, taper, rot } (rotation about the centre). */
    box(mat, hex, min, max, r, opts) {
      opts = opts || {};
      const g = roundedBox(max[0] - min[0], max[1] - min[1], max[2] - min[2], r, opts.seg, opts.taper);
      return this.put(mat, g, hex, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], opts.rot);
    }

    /** Rounded box by centre and size. */
    boxC(mat, hex, c, size, r, rot, seg) {
      return this.put(mat, roundedBox(size[0], size[1], size[2], r, seg), hex, c, rot);
    }

    /** Cylinder along Z from z0 (radius r0) to z1 (radius r1). */
    cylZ(mat, hex, x, y, z0, z1, r0, r1, seg, open) {
      const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg || 16, 1, !!open);
      g.rotateX(Math.PI / 2);
      return this.put(mat, g, hex, [x, y, (z0 + z1) / 2]);
    }

    /** Cylinder along Y. */
    cylY(mat, hex, x, z, y0, y1, r0, r1, seg, open) {
      const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg || 16, 1, !!open);
      return this.put(mat, g, hex, [x, (y0 + y1) / 2, z]);
    }

    /** Cylinder along X. */
    cylX(mat, hex, y, z, x0, x1, r, seg) {
      const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg || 16);
      g.rotateZ(-Math.PI / 2);
      return this.put(mat, g, hex, [(x0 + x1) / 2, y, z]);
    }

    /** Cylinder between two points. */
    rod(mat, hex, a, b, r, seg) {
      const A = new THREE.Vector3(a[0], a[1], a[2]);
      const B = new THREE.Vector3(b[0], b[1], b[2]);
      const dir = new THREE.Vector3().subVectors(B, A);
      const len = dir.length();
      const g = new THREE.CylinderGeometry(r, r, len, seg || 10);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      return this.put(mat, g, hex, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
    }

    /** Lathe around Y: pts are [radius, y]. */
    latheY(mat, hex, pts, seg, pos) {
      const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 24);
      return this.put(mat, g, hex, pos);
    }

    /** Lathe around Z: pts are [radius, z]. */
    latheZ(mat, hex, pts, seg, x, y) {
      const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 24);
      g.rotateX(Math.PI / 2);
      return this.put(mat, g, hex, [x || 0, y || 0, 0]);
    }

    /** Side profile extrusion (points (z, y)), thickness along X, centred on x. */
    side(mat, hex, pts, width, bevel, holes, x, curveSegments) {
      return this.put(mat, sideProfile(pts, width, bevel, holes, curveSegments), hex, [x || 0, 0, 0]);
    }

    /** Front plate extrusion (points (x, y)), depth along Z, centred on z. */
    plate(mat, hex, pts, depth, bevel, holes, z, curveSegments) {
      return this.put(mat, frontPlate(pts, depth, bevel, holes, curveSegments), hex, [0, 0, z || 0]);
    }

    /** A disc facing +Z (or -Z when back is true). */
    disc(mat, hex, x, y, z, r, seg, back) {
      const g = new THREE.CircleGeometry(r, seg || 16);
      return this.put(mat, g, hex, [x, y, z], back ? [0, Math.PI, 0] : null);
    }

    finish() {
      const geos = {};
      for (const k of MAT_ORDER) {
        const b = this.parts[k];
        if (b && !b.isEmpty) geos[k] = b.build();
      }
      return geos;
    }
  }

  const V = (x, y, z) => ({ x, y, z });

  // ------------------------------------------------------------- the guns
  const MODELS = {};

  MODELS.fists = function () {
    return { muzzle: V(0, 0, 0.05), tip: V(0, 0, 0.05) };
  };

  // Kestrel 9: polymer frame, gunmetal slide, gold barrel hood, orange front sight.
  MODELS.pistol = function (k) {
    // Slide.
    k.box('metal', C.slide, [-0.013, 0.06, -0.03], [0.013, 0.098, 0.16], 0.0045);
    // Rear and front slide serrations.
    for (let i = 0; i < 6; i++) {
      const z = -0.025 + i * 0.0046;
      for (const s of [-1, 1]) k.box('metal', C.blued, [s * 0.013 - 0.0005, 0.066, z], [s * 0.013 + 0.0005, 0.091, z + 0.0019], 0);
    }
    for (let i = 0; i < 3; i++) {
      const z = 0.124 + i * 0.0046;
      for (const s of [-1, 1]) k.box('metal', C.blued, [s * 0.013 - 0.0005, 0.07, z], [s * 0.013 + 0.0005, 0.09, z + 0.0019], 0);
    }
    // Ejection port (right side) with the gold barrel hood inside.
    k.box('metal', C.blued, [-0.0136, 0.0785, 0.016], [0.004, 0.0984, 0.07], 0.001, { seg: 1 });
    k.box('chrome', C.gold, [-0.0139, 0.0815, 0.0195], [0.0012, 0.0987, 0.0665], 0.0012, { seg: 1 });
    // Barrel crown and bore.
    k.cylZ('chrome', C.darkSteel, 0, 0.0795, 0.155, 0.1625, 0.0068, 0.0068, 18);
    k.disc('poly', C.hole, 0, 0.0795, 0.1627, 0.0046, 14);
    // Sights: orange front blade, two-post rear.
    k.box('poly', C.orange, [-0.0019, 0.0975, 0.145], [0.0019, 0.1045, 0.153], 0.0009, { seg: 1 });
    for (const s of [-1, 1]) k.box('metal', C.blued, [s > 0 ? 0.0032 : -0.0092, 0.0975, -0.022], [s > 0 ? 0.0092 : -0.0032, 0.1045, -0.012], 0.001, { seg: 1 });
    // Frame: dust cover under the slide, accessory rail, levers.
    k.box('poly', C.polymer, [-0.0122, 0.039, -0.018], [0.0122, 0.0615, 0.151], 0.004);
    for (let i = 0; i < 3; i++) k.box('poly', C.polymer2, [-0.0095, 0.0355, 0.1 + i * 0.016], [0.0095, 0.0405, 0.108 + i * 0.016], 0.001, { seg: 1 });
    k.box('metal', C.blued, [0.0115, 0.056, 0.03], [0.0138, 0.0625, 0.058], 0.001, { seg: 1 });
    k.box('metal', C.blued, [0.0115, 0.047, 0.07], [0.0136, 0.054, 0.082], 0.001, { seg: 1 });
    // Grip: raked about 14 degrees, beavertail at the top.
    k.side('poly', C.polymer, [
      [0.0318, 0.05], [0.0318, 0.042], [0.028, 0.03], [0.0255, 0.012], [0.0225, 0.0], [0.024, -0.012],
      [0.02, -0.024], [0.0205, -0.036], [0.0165, -0.048], [0.0125, -0.062], [0.01, -0.068],
      [-0.038, -0.068], [-0.037, -0.058], [-0.031, -0.03], [-0.0235, 0.004], [-0.0165, 0.03],
      [-0.019, 0.044], [-0.028, 0.051], [-0.031, 0.056], [-0.026, 0.0605], [0.0318, 0.0605],
    ], 0.029, 0.0045);
    // Stippled side panels.
    for (const s of [-1, 1]) {
      k.boxC('poly', C.polymer2, [s * 0.0142, -0.014, -0.0035], [0.0022, 0.07, 0.028], 0.001, [0.25, 0, 0], 1);
    }
    // Magazine base plate.
    k.box('metal', C.gunmetal2, [-0.0145, -0.0745, -0.041], [0.0145, -0.066, 0.012], 0.0025, { seg: 1 });
    // Trigger guard and trigger.
    k.side('poly', C.polymer, uShape(
      [[0.024, 0.042], [0.0245, 0.009], [0.068, 0.0045], [0.0772, 0.012], [0.0786, 0.042]],
      [[0.0305, 0.042], [0.031, 0.0138], [0.0635, 0.011], [0.0703, 0.0168], [0.0713, 0.042]]), 0.012, 0.0016);
    k.side('metal', C.blued, [[0.043, 0.041], [0.0462, 0.03], [0.0452, 0.02], [0.0425, 0.0172], [0.0395, 0.0235], [0.0392, 0.041]], 0.0055, 0.0012);
    return {
      muzzle: V(0, 0.0795, 0.163),
      sight: V(0, 0.101, -0.03),
      flashScale: 0.8,
    };
  };

  // Hammerhead .44: stainless, fluted cylinder, full-lug barrel, walnut grip.
  MODELS.revolver = function (k) {
    const ax = 0.0705; // cylinder axis height
    const bore = 0.084;
    // Frame with the cylinder window.
    k.side('chrome', C.stainless, [
      [-0.014, 0.0985], [0.05, 0.1015], [0.0635, 0.1005], [0.0645, 0.058], [0.061, 0.049], [0.04, 0.0415],
      [0.012, 0.04], [0.004, 0.028], [-0.018, 0.034], [-0.022, 0.06], [-0.019, 0.086],
    ], 0.027, 0.0014, [[[0.0025, 0.0492], [0.0515, 0.0492], [0.0515, 0.0928], [0.0025, 0.0928]]]);
    // Heavy barrel: tube, full underlug and a top rib.
    k.cylZ('chrome', C.stainless, 0, bore, 0.062, 0.2145, 0.0106, 0.0106, 22);
    k.box('chrome', C.stainless, [-0.0082, 0.0575, 0.062], [0.0082, 0.082, 0.2125], 0.0038);
    k.box('chrome', C.stainless, [-0.0052, 0.091, 0.062], [0.0052, 0.0985, 0.2135], 0.0018, { seg: 1 });
    k.cylZ('chrome', C.stainless2, 0, bore, 0.2135, 0.2155, 0.0106, 0.0098, 22);
    k.disc('poly', C.hole, 0, bore, 0.2157, 0.0058, 14);
    // Sights: ramped front blade with an orange insert, rear notch.
    k.side('chrome', C.stainless2, [[0.192, 0.0985], [0.211, 0.0985], [0.211, 0.1085], [0.206, 0.1085]], 0.0036, 0.0006);
    k.box('poly', C.orange, [-0.0019, 0.1035, 0.2045], [0.0019, 0.1075, 0.2095], 0.0005, { seg: 1 });
    for (const s of [-1, 1]) k.box('poly', C.polymer, [s > 0 ? 0.0022 : -0.007, 0.1005, -0.012], [s > 0 ? 0.007 : -0.0022, 0.106, 0.0], 0.001, { seg: 1 });
    // Fluted cylinder with six chambers.
    const flutes = flutedCircle(0.0212, 6, 0.0042, Math.PI / 2 + Math.PI / 6, 72);
    const cyl = frontPlate(flutes, 0.045, 0.0018, null, 12);
    k.put('chrome', cyl, C.stainless2, [0, ax, 0.027]);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      k.disc('poly', C.hole, Math.cos(a) * 0.0134, ax + Math.sin(a) * 0.0134, 0.0497, 0.0052, 12);
    }
    k.cylZ('chrome', C.stainless, 0, ax, 0.049, 0.062, 0.0032, 0.0032, 10);
    // Hammer.
    k.side('chrome', C.darkSteel, [[-0.012, 0.086], [-0.006, 0.1], [-0.012, 0.1065], [-0.026, 0.1125], [-0.0325, 0.1105], [-0.024, 0.1], [-0.019, 0.085]], 0.008, 0.0016);
    // Trigger guard and trigger.
    k.side('chrome', C.stainless, ellipseU(0.031, 0.026, 0.0215, 0.0205, 0.0142, 0.0132, 0.046, 14), 0.009, 0.0016);
    k.side('chrome', C.stainless2, [[0.0305, 0.041], [0.0328, 0.03], [0.0296, 0.0185], [0.0262, 0.0205], [0.027, 0.041]], 0.0055, 0.0013);
    // Walnut grip with a gold medallion.
    k.side('lacquer', C.walnut, [
      [0.012, 0.042], [0.0055, 0.022], [0.0085, 0.012, 0.004, 0.004], [0.0005, -0.004, 0.0015, -0.014],
      [-0.001, -0.026], [-0.0045, -0.046, -0.012, -0.062], [-0.016, -0.072, -0.03, -0.074],
      [-0.046, -0.074, -0.05, -0.064], [-0.045, -0.03], [-0.037, 0.01], [-0.031, 0.045, -0.026, 0.06],
      [-0.02, 0.07, -0.012, 0.066], [-0.004, 0.056],
    ], 0.034, 0.0065, null, 0, 12);
    for (const s of [-1, 1]) k.cylX('chrome', C.gold, -0.012, -0.02, s > 0 ? 0.016 : -0.0172, s > 0 ? 0.0172 : -0.016, 0.0055, 16);
    return {
      muzzle: V(0, bore, 0.2158),
      sight: V(0, 0.105, -0.02),
      flashScale: 1.25,
      offset: V(0, 0.016, 0.026),
    };
  };

  // Wasp: compact machine pistol, stick magazine through the grip, wire stock, amber accents.
  MODELS.smg = function (k) {
    // Upper receiver (metal) with a top rail.
    k.box('metal', C.gunmetal, [-0.0175, 0.066, -0.075], [0.0175, 0.108, 0.15], 0.005);
    k.box('metal', C.blued, [-0.0105, 0.107, -0.064], [0.0105, 0.1125, 0.136], 0.0012, { seg: 1 });
    for (let i = 0; i < 17; i++) {
      const z = -0.06 + i * 0.0115;
      k.box('metal', C.blued, [-0.0115, 0.1105, z], [0.0115, 0.1165, z + 0.0055], 0.0008, { seg: 1 });
    }
    // Ejection port (right) and the amber charging handle (left).
    k.box('metal', C.blued, [-0.0182, 0.077, 0.018], [-0.0165, 0.098, 0.062], 0.0006, { seg: 1 });
    k.box('poly', C.amber, [0.016, 0.084, 0.118], [0.0275, 0.096, 0.136], 0.0025, { seg: 1 });
    // Lower receiver (polymer).
    k.box('poly', C.polymer, [-0.016, 0.038, -0.07], [0.016, 0.072, 0.102], 0.005);
    // Front shroud with vents, and a hand stop.
    k.box('poly', C.polymer, [-0.0172, 0.05, 0.098], [0.0172, 0.104, 0.2], 0.007);
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) k.box('poly', C.polymer3, [s * 0.0172 - 0.0006, 0.066 + i * 0.0105, 0.12], [s * 0.0172 + 0.0006, 0.0712 + i * 0.0105, 0.184], 0.0005, { seg: 1 });
    }
    k.side('poly', C.polymer, [[0.14, 0.052], [0.172, 0.052], [0.166, 0.032], [0.158, 0.028], [0.15, 0.036]], 0.024, 0.004);
    // Barrel and slotted flash hider.
    k.cylZ('metal', C.darkSteel, 0, 0.085, 0.2, 0.236, 0.0085, 0.0085, 16);
    k.cylZ('metal', C.gunmetal, 0, 0.085, 0.234, 0.266, 0.0115, 0.0112, 18);
    for (let i = 0; i < 3; i++) k.cylZ('metal', C.blued, 0, 0.085, 0.24 + i * 0.008, 0.2435 + i * 0.008, 0.0118, 0.0118, 18);
    k.disc('poly', C.hole, 0, 0.085, 0.2663, 0.006, 12);
    // Flip sights on the rail.
    k.plate('metal', C.blued, [[-0.009, 0.112], [0.009, 0.112], [0.009, 0.124], [0.005, 0.131], [-0.005, 0.131], [-0.009, 0.124]], 0.008, 0.001,
      [[[-0.0028, 0.1215], [0.0028, 0.1215], [0.0028, 0.1265], [-0.0028, 0.1265]]], -0.05);
    k.plate('metal', C.blued, [[-0.008, 0.112], [0.008, 0.112], [0.008, 0.128], [0.0045, 0.128], [0.0045, 0.12], [-0.0045, 0.12], [-0.0045, 0.128], [-0.008, 0.128]], 0.006, 0.0008, null, 0.127);
    k.box('metal', C.blued, [-0.0011, 0.112, 0.124], [0.0011, 0.1265, 0.13], 0);
    // Pistol grip with stippled panels.
    k.side('poly', C.polymer, [
      [0.029, 0.045], [0.026, 0.028], [0.0215, 0.016], [0.0235, 0.004], [0.019, -0.008], [0.0205, -0.02],
      [0.0155, -0.032], [0.0155, -0.052], [-0.0295, -0.052], [-0.0305, -0.03], [-0.025, 0.0], [-0.02, 0.03], [-0.02, 0.045],
    ], 0.029, 0.0045);
    for (const s of [-1, 1]) k.boxC('poly', C.polymer2, [s * 0.0142, -0.004, -0.004], [0.0022, 0.06, 0.03], 0.001, [0.2, 0, 0], 1);
    // Stick magazine below the grip, amber base plate.
    k.boxC('metal', C.gunmetal2, [0, -0.104, -0.0155], [0.021, 0.108, 0.03], 0.003, [0.2, 0, 0], 1);
    k.boxC('poly', C.amber, [0, -0.161, -0.0268], [0.024, 0.009, 0.036], 0.003, [0.2, 0, 0], 1);
    // Trigger guard, trigger, amber selector.
    k.side('poly', C.polymer, uShape(
      [[0.022, 0.044], [0.0235, 0.009], [0.072, 0.009], [0.0765, 0.044]],
      [[0.03, 0.044], [0.0305, 0.016], [0.0645, 0.016], [0.068, 0.044]]), 0.012, 0.0018);
    k.side('metal', C.blued, [[0.044, 0.041], [0.047, 0.031], [0.0458, 0.021], [0.043, 0.019], [0.0405, 0.025], [0.0403, 0.041]], 0.0055, 0.0012);
    k.cylX('poly', C.amber, 0.058, 0.002, 0.0158, 0.0185, 0.0048, 14);
    // Wire stock, collapsed.
    for (const y of [0.1, 0.058]) {
      for (const s of [-1, 1]) k.cylZ('metal', C.darkSteel, s * 0.012, y, -0.158, -0.07, 0.0034, 0.0034, 10);
    }
    k.box('poly', C.rubber, [-0.0185, 0.042, -0.172], [0.0185, 0.114, -0.155], 0.006);
    return {
      muzzle: V(0, 0.085, 0.2665),
      offHand: V(0, 0.04, 0.155),
      sight: V(0, 0.126, -0.06),
      flashScale: 0.75,
    };
  };

  // Gator 12: pump shotgun, walnut stock and ribbed pump, blued steel.
  MODELS.shotgun = function (k) {
    const bore = 0.067;
    // Receiver.
    k.box('metal', C.blued, [-0.0195, 0.031, -0.035], [0.0195, 0.086, 0.176], 0.006, { taper: 0.86 });
    k.box('metal', C.hole, [-0.0188, 0.056, 0.03], [-0.016, 0.078, 0.098], 0.001, { seg: 1 });
    // Barrel with a vent rib and bead, magazine tube, clamp.
    k.cylZ('metal', C.blued, 0, bore, 0.17, 0.632, 0.0118, 0.0112, 20);
    k.disc('poly', C.hole, 0, bore, 0.6322, 0.0092, 14);
    k.box('metal', C.blued, [-0.0042, 0.0775, 0.178], [0.0042, 0.0815, 0.626], 0.0012, { seg: 1 });
    for (let i = 0; i < 12; i++) k.box('metal', C.blued, [-0.0028, 0.076, 0.2 + i * 0.036], [0.0028, 0.0785, 0.206 + i * 0.036], 0);
    k.put('metal', new THREE.SphereGeometry(0.0028, 10, 8), C.stainless, [0, 0.0838, 0.621]);
    k.cylZ('metal', C.blued, 0, 0.041, 0.17, 0.58, 0.0108, 0.0108, 18);
    k.cylZ('metal', C.gunmetal2, 0, 0.041, 0.578, 0.594, 0.0118, 0.0112, 18);
    k.box('metal', C.blued, [-0.009, 0.036, 0.566], [0.009, 0.074, 0.58], 0.003, { seg: 1 });
    // Pump forend: rounded walnut with dark grooves.
    k.box('lacquer', C.walnut, [-0.0215, 0.022, 0.285], [0.0215, 0.061, 0.465], 0.012);
    for (let i = 0; i < 6; i++) {
      const z = 0.308 + i * 0.026;
      k.box('lacquer', C.walnutDark, [-0.0219, 0.0245, z], [0.0219, 0.0585, z + 0.0045], 0.0015, { seg: 1 });
    }
    // Action bars from the pump to the receiver.
    for (const s of [-1, 1]) k.cylZ('metal', C.darkSteel, s * 0.0112, 0.034, 0.176, 0.29, 0.0022, 0.0022, 8);
    // Trigger guard and trigger.
    k.side('metal', C.blued, uShape(
      [[0.011, 0.036], [0.0125, 0.004], [0.062, 0.0], [0.07, 0.009], [0.0715, 0.036]],
      [[0.0205, 0.036], [0.021, 0.0095], [0.0592, 0.0072], [0.0635, 0.0135], [0.0645, 0.036]]), 0.011, 0.0018);
    k.side('metal', C.darkSteel, [[0.039, 0.033], [0.0425, 0.023], [0.0412, 0.013], [0.0386, 0.011], [0.036, 0.017], [0.0356, 0.033]], 0.0055, 0.0012);
    // Walnut stock with a semi-pistol grip.
    k.side('lacquer', C.walnut, [
      [-0.03, 0.084], [-0.12, 0.079], [-0.362, 0.07], [-0.382, -0.085],
      [-0.3, -0.074], [-0.13, -0.03], [-0.075, -0.018, -0.052, -0.03], [-0.046, -0.042], [-0.041, -0.058],
      [-0.006, -0.057], [0.004, -0.04, 0.009, -0.02], [0.0135, 0.004], [0.016, 0.034],
    ], 0.037, 0.007, null, 0, 12);
    // Grip cap and rubber butt pad.
    k.boxC('metal', C.blued, [0, -0.0585, -0.0235], [0.03, 0.005, 0.036], 0.002, [-0.03, 0, 0], 1);
    k.boxC('poly', C.rubber, [0, -0.008, -0.3805], [0.0392, 0.162, 0.018], 0.006, [0.129, 0, 0], 2);
    return {
      muzzle: V(0, bore, 0.633),
      offHand: V(0, 0.034, 0.375),
      sight: V(0, 0.084, -0.02),
      flashScale: 1.5,
    };
  };

  // Mantis AC-7: assault carbine, gunmetal receivers, tan furniture, reflex sight.
  MODELS.rifle = function (k) {
    const bore = 0.075;
    // Upper receiver and rail.
    k.box('metal', C.gunmetal, [-0.0152, 0.062, -0.078], [0.0152, 0.1, 0.166], 0.0045);
    k.box('metal', C.blued, [-0.0108, 0.0995, -0.072], [0.0108, 0.1045, 0.45], 0.0012, { seg: 1 });
    for (let i = 0; i < 37; i++) {
      const z = -0.068 + i * 0.0138;
      k.box('metal', C.blued, [-0.0112, 0.1035, z], [0.0112, 0.1095, z + 0.0068], 0.0008, { seg: 1 });
    }
    // Ejection port cover (right), forward assist, charging handle.
    k.box('metal', C.gunmetal2, [-0.0164, 0.07, 0.0], [-0.0148, 0.092, 0.07], 0.0006, { seg: 1 });
    k.cylZ('metal', C.gunmetal2, -0.0155, 0.086, -0.035, -0.012, 0.0055, 0.0055, 12);
    k.box('metal', C.blued, [-0.018, 0.089, -0.092], [0.018, 0.0985, -0.078], 0.002, { seg: 1 });
    // Lower receiver and magazine well.
    k.box('metal', C.gunmetal2, [-0.0142, 0.034, -0.072], [0.0142, 0.0655, 0.108], 0.004);
    k.box('metal', C.gunmetal2, [-0.0152, 0.012, 0.045], [0.0152, 0.042, 0.1], 0.004);
    // Handguard (tan) with dark slots.
    k.box('poly', C.tan, [-0.0215, 0.05, 0.163], [0.0215, 0.1005, 0.46], 0.011, { seg: 2 });
    for (let i = 0; i < 5; i++) {
      const z = 0.19 + i * 0.052;
      for (const s of [-1, 1]) k.box('poly', C.polymer3, [s * 0.0215 - 0.0006, 0.07, z], [s * 0.0215 + 0.0006, 0.08, z + 0.032], 0.0006, { seg: 1 });
      k.box('poly', C.polymer3, [-0.005, 0.0494, z], [0.005, 0.0506, z + 0.032], 0.0006, { seg: 1 });
    }
    // Barrel, muzzle brake with ports.
    k.cylZ('metal', C.darkSteel, 0, bore, 0.458, 0.534, 0.0088, 0.0082, 16);
    k.box('metal', C.gunmetal, [-0.011, 0.064, 0.53], [0.011, 0.086, 0.586], 0.004);
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) k.box('metal', C.hole, [s * 0.011 - 0.0006, 0.069, 0.538 + i * 0.015], [s * 0.011 + 0.0006, 0.081, 0.546 + i * 0.015], 0.0005, { seg: 1 });
    }
    k.disc('poly', C.hole, 0, bore, 0.5863, 0.0055, 12);
    // Reflex sight: body, hood and a warm reflective lens.
    k.box('poly', C.polymer, [-0.0125, 0.105, 0.012], [0.0125, 0.115, 0.074], 0.003, { seg: 1 });
    k.plate('poly', C.polymer, [[-0.0155, 0.113], [0.0155, 0.113], [0.0155, 0.14], [0.011, 0.147], [-0.011, 0.147], [-0.0155, 0.14]], 0.034, 0.0012,
      [[[-0.0115, 0.1175], [0.0115, 0.1175], [0.0115, 0.1375], [0.008, 0.1425], [-0.008, 0.1425], [-0.0115, 0.1375]]], 0.05);
    k.box('chrome', C.lensWarm, [-0.0118, 0.1165, 0.056], [0.0118, 0.143, 0.0575], 0);
    k.box('poly', C.polymer2, [0.0155, 0.12, 0.04], [0.0185, 0.133, 0.058], 0.001, { seg: 1 });
    // Pistol grip.
    k.side('poly', C.tan, [
      [0.0275, 0.036], [0.023, 0.018], [0.0185, 0.004], [0.0165, -0.012], [0.0115, -0.03], [0.008, -0.058],
      [-0.03, -0.062], [-0.03, -0.05], [-0.0225, -0.02], [-0.017, 0.012], [-0.012, 0.036],
    ], 0.027, 0.0042);
    // Trigger guard and trigger.
    k.side('metal', C.gunmetal2, uShape(
      [[0.0215, 0.038], [0.022, 0.009], [0.052, 0.008], [0.053, 0.038]],
      [[0.0295, 0.038], [0.0298, 0.0145], [0.0455, 0.0145], [0.0458, 0.038]]), 0.011, 0.0018);
    k.side('metal', C.blued, [[0.037, 0.035], [0.0398, 0.026], [0.0388, 0.018], [0.0362, 0.0165], [0.034, 0.022], [0.0337, 0.035]], 0.005, 0.0012);
    // Curved magazine (black polymer) with ribs.
    k.side('poly', C.polymer, [[0.0965, 0.036], [0.0985, -0.05, 0.121, -0.122], [0.0795, -0.136], [0.0575, -0.062, 0.0515, 0.036]], 0.0215, 0.003, null, 0, 14);
    k.side('poly', C.polymer2, [[0.123, -0.119], [0.1265, -0.128], [0.0808, -0.1425], [0.0772, -0.133]], 0.025, 0.003);
    for (const s of [-1, 1]) k.side('poly', C.polymer2, [[0.089, 0.0], [0.0935, -0.06], [0.0955, -0.06], [0.0915, 0.0]], 0.0035, 0.0006, null, s * 0.0107);
    // Buffer tube and collapsible stock (tan) with a rubber pad.
    k.cylZ('metal', C.blued, 0, 0.081, -0.25, -0.074, 0.0138, 0.0138, 18);
    k.side('poly', C.tan, [
      [-0.155, 0.1], [-0.286, 0.103], [-0.29, 0.1], [-0.29, 0.012], [-0.276, 0.008], [-0.22, 0.03], [-0.17, 0.056], [-0.152, 0.068],
    ], 0.036, 0.0055);
    k.box('poly', C.rubber, [-0.0182, 0.008, -0.302], [0.0182, 0.105, -0.286], 0.004);
    return {
      muzzle: V(0, bore, 0.587),
      offHand: V(0, 0.049, 0.32),
      sight: V(0, 0.13, -0.02),
      flashScale: 1.1,
    };
  };

  // Heron LR: bolt-action long rifle, olive chassis, 6x scope, folded bipod.
  MODELS.sniper = function (k) {
    const bore = 0.063;
    // Round receiver, rail, bolt shroud and bolt handle (right side).
    k.cylZ('metal', C.gunmetal, 0, bore, -0.075, 0.155, 0.0152, 0.0152, 22);
    k.box('metal', C.blued, [-0.0095, 0.075, -0.07], [0.0095, 0.0815, 0.15], 0.0012, { seg: 1 });
    k.cylZ('metal', C.blued, 0, bore, -0.105, -0.074, 0.0122, 0.0132, 18);
    k.rod('metal', C.steel, [-0.012, 0.066, -0.035], [-0.043, 0.049, -0.047], 0.0036, 10);
    k.put('metal', new THREE.SphereGeometry(0.0092, 16, 12), C.blued, [-0.046, 0.047, -0.048]);
    // Fluted barrel and a big muzzle brake.
    k.cylZ('metal', C.gunmetal, 0, bore, 0.15, 0.665, 0.0142, 0.0102, 20);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      k.boxC('metal', C.blued, [Math.cos(a) * 0.0118, bore + Math.sin(a) * 0.0118, 0.38], [0.003, 0.003, 0.34], 0, [0, 0, a], 1);
    }
    k.cylZ('metal', C.gunmetal2, 0, bore, 0.66, 0.722, 0.0148, 0.0148, 20);
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) k.box('metal', C.hole, [s * 0.0142 - 0.0015, bore - 0.006, 0.67 + i * 0.016], [s * 0.0142 + 0.0015, bore + 0.006, 0.679 + i * 0.016], 0.001, { seg: 1 });
    }
    k.disc('poly', C.hole, 0, bore, 0.7223, 0.007, 14);
    // Olive chassis stock: fore-end, moulded trigger guard, thumbhole, butt.
    k.side('poly', C.olive, [
      [0.405, 0.058], [0.405, 0.031, 0.385, 0.026], [0.13, 0.018], [0.082, 0.016], [0.074, 0.004], [0.022, 0.0],
      [0.014, -0.02], [0.008, -0.062], [-0.034, -0.064], [-0.03, -0.03], [-0.045, 0.004], [-0.1, -0.022],
      [-0.2, -0.042], [-0.338, -0.078], [-0.365, -0.076], [-0.36, 0.084], [-0.142, 0.084], [-0.085, 0.058],
    ], 0.046, 0.005,
    [
      [[0.026, 0.028], [0.0272, 0.0112], [0.066, 0.0112], [0.069, 0.028]],
      [[-0.052, 0.036], [-0.046, 0.016], [-0.1, 0.0], [-0.16, -0.015], [-0.18, 0.004], [-0.15, 0.03], [-0.085, 0.042]],
    ], 0, 12);
    k.box('poly', C.oliveDark, [-0.0148, 0.083, -0.3], [0.0148, 0.095, -0.13], 0.004);
    k.boxC('poly', C.rubber, [0, 0.004, -0.3695], [0.0472, 0.164, 0.018], 0.006, [0.03, 0, 0], 2);
    k.side('metal', C.blued, [[0.045, 0.027], [0.0482, 0.018], [0.0472, 0.011], [0.0445, 0.0095], [0.042, 0.014], [0.0415, 0.027]], 0.0055, 0.0012);
    // Detachable magazine.
    k.box('metal', C.blued, [-0.0145, -0.004, 0.086], [0.0145, 0.022, 0.13], 0.0025, { seg: 1 });
    // Scope: tube, bells, turrets, rings and lenses.
    const sy = 0.121;
    k.cylZ('metal', C.polymer3, 0, sy, -0.07, 0.205, 0.0152, 0.0152, 24);
    k.latheZ('metal', C.polymer3, [[0.0152, 0.2], [0.0158, 0.214], [0.0262, 0.248], [0.0272, 0.254], [0.0272, 0.288], [0.0258, 0.291], [0.0, 0.291]], 28, 0, sy);
    k.latheZ('metal', C.polymer3, [[0.0, -0.146], [0.0205, -0.146], [0.0215, -0.142], [0.0215, -0.1], [0.0155, -0.082], [0.0152, -0.07]], 28, 0, sy);
    k.cylY('metal', C.polymer3, 0, 0.085, sy + 0.012, sy + 0.03, 0.0112, 0.0112, 20);
    k.cylY('metal', C.darkSteel, 0, 0.085, sy + 0.0295, sy + 0.032, 0.0104, 0.0098, 20);
    k.cylX('metal', C.polymer3, sy, 0.085, -0.032, -0.012, 0.0108, 20);
    k.cylX('metal', C.polymer3, sy, 0.085, 0.012, 0.028, 0.0098, 20);
    for (const z of [0.012, 0.148]) k.box('metal', C.blued, [-0.0135, 0.08, z - 0.008], [0.0135, sy, z + 0.008], 0.003);
    k.disc('chrome', C.lens, 0, sy, 0.2912, 0.0232, 28);
    k.disc('chrome', C.lens, 0, sy, -0.1462, 0.0175, 24, true);
    // Folded bipod.
    k.box('metal', C.blued, [-0.0145, 0.004, 0.34], [0.0145, 0.02, 0.37], 0.003, { seg: 1 });
    for (const s of [-1, 1]) k.cylZ('metal', C.darkSteel, s * 0.0095, 0.009, 0.17, 0.345, 0.0042, 0.0042, 10);
    return {
      muzzle: V(0, bore, 0.7225),
      offHand: V(0, 0.018, 0.27),
      sight: V(0, sy, -0.15),
      flashScale: 1.3,
      scope: true,
    };
  };

  // ------------------------------------------------------------ melee
  // Baseball bat along +Y: natural ash handle with black tape, black lacquered barrel, a pink pinstripe.
  MODELS.bat = function (k) {
    const wood = [[0.0, -0.086], [0.017, -0.086], [0.0225, -0.081], [0.0225, -0.074], [0.0155, -0.066], [0.0126, -0.058],
      [0.0126, 0.18], [0.0152, 0.3], [0.0215, 0.42], [0.0282, 0.515]];
    k.latheY('lacquer', C.ash, wood, 28);
    k.latheY('lacquer', C.bat2, [[0.0281, 0.514], [0.0322, 0.6], [0.0338, 0.68], [0.0336, 0.72], [0.031, 0.742], [0.024, 0.75], [0.012, 0.7535], [0.0, 0.754]], 28);
    k.latheY('lacquer', C.pink, [[0.0283, 0.505], [0.0288, 0.512], [0.0283, 0.516]], 28);
    // Grip tape: ridged wraps.
    const tape = [[0.0126, -0.064]];
    for (let y = -0.062, i = 0; y < 0.17; y += 0.011, i++) {
      tape.push([0.0138, y + 0.0015], [0.0144, y + 0.0055], [0.0137, y + 0.0105]);
    }
    tape.push([0.0126, 0.174]);
    k.latheY('poly', C.tape, tape, 24);
    return {
      muzzle: V(0, 0.62, 0),
      tip: V(0, 0.62, 0),
      offHand: V(0, 0.085, 0),
      twoHanded: true,
    };
  };

  // Combat knife along +Y, edge facing +Z: clip-point blade, steel guard, finger-grooved rubber grip.
  MODELS.knife = function (k) {
    k.side('poly', C.rubber, [
      [-0.0115, -0.06], [-0.0125, 0.052], [0.0118, 0.052], [0.0098, 0.038], [0.0126, 0.024], [0.0098, 0.01],
      [0.0126, -0.004], [0.0098, -0.018], [0.0122, -0.034], [0.0108, -0.052], [0.0075, -0.062],
    ], 0.021, 0.0055, null, 0, 8);
    k.box('chrome', C.steel, [-0.009, -0.0705, -0.0125], [0.009, -0.0595, 0.0105], 0.003);
    k.box('chrome', C.steel, [-0.0085, 0.0505, -0.019], [0.0085, 0.0585, 0.0235], 0.0028);
    k.side('chrome', C.blade, [
      [-0.0095, 0.057], [-0.0095, 0.18], [-0.0045, 0.196], [0.004, 0.236], [0.0085, 0.214, 0.0122, 0.19],
      [0.0132, 0.16], [0.0122, 0.075], [0.0085, 0.06], [0.0085, 0.057],
    ], 0.0046, 0.0018, null, 0, 10);
    return {
      muzzle: V(0, 0.236, 0.004),
      tip: V(0, 0.236, 0.004),
    };
  };

  // ------------------------------------------------------------ thrown
  // Frag grenade: pineapple body, steel fuse, spoon against the palm (-Z), pull ring on the left.
  MODELS.grenade = function (k) {
    const body = new THREE.SphereGeometry(1, 64, 32);
    const p = body.attributes.position;
    const rows = [56.25, 33.75, 11.25, -11.25, -33.75, -56.25].map((d) => (d * Math.PI) / 180);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const lon = Math.atan2(z, x);
      const lat = Math.asin(Math.max(-1, Math.min(1, y)));
      let g = 0;
      if (Math.abs(lat) < 0.99) g = Math.pow(Math.abs(Math.cos(lon * 4)), 30);
      for (const r of rows) g = Math.max(g, Math.exp(-Math.pow((lat - r) / 0.055, 2)));
      const s = 1 - 0.09 * g;
      p.setXYZ(i, x * s * 0.0305, y * s * 0.037, z * s * 0.0305);
    }
    body.computeVertexNormals();
    k.put('poly', body, C.grenade, [0, 0, 0]);
    // Fuse assembly and base plug.
    k.cylY('metal', C.steel, 0, 0, 0.032, 0.0505, 0.011, 0.0095, 18);
    k.cylY('metal', C.darkSteel, 0, 0, 0.05, 0.057, 0.0082, 0.0074, 16);
    k.cylY('metal', C.darkSteel, 0, 0, -0.0395, -0.0345, 0.008, 0.0095, 16);
    // Spoon.
    k.side('metal', C.steel, [
      [0.004, 0.0575], [-0.013, 0.0565], [-0.025, 0.045, -0.0315, 0.028], [-0.0355, 0.0], [-0.0352, -0.014], [-0.0328, -0.014],
      [-0.0325, 0.0], [-0.0285, 0.027, -0.023, 0.041], [-0.0115, 0.0535], [0.004, 0.0548],
    ], 0.0125, 0.0008, null, 0, 8);
    // Pin and pull ring.
    k.cylX('metal', C.stainless, 0.045, 0.004, 0.0, 0.016, 0.0016, 8);
    k.put('metal', new THREE.TorusGeometry(0.0105, 0.0015, 8, 28), C.stainless, [0.0215, 0.038, 0.004], [0, 0.35, 0.5]);
    return { muzzle: V(0, 0, 0) };
  };

  // Molotov: held by the neck, bottle body below (-Y), rag out of the top (+Y).
  MODELS.molotov = function (k) {
    k.latheY('glass', C.glass, [
      [0.0, -0.192], [0.03, -0.192], [0.0355, -0.187], [0.0362, -0.176], [0.0362, -0.066],
      [0.033, -0.048], [0.021, -0.03], [0.0138, -0.018], [0.0132, 0.042], [0.0148, 0.045], [0.0152, 0.055], [0.0128, 0.058],
    ], 32);
    // Fuel inside and a faded label.
    k.latheY('lacquer', C.fuel, [[0.0, -0.188], [0.0335, -0.188], [0.0342, -0.182], [0.0342, -0.09], [0.0, -0.09]], 28);
    const label = new THREE.CylinderGeometry(0.0366, 0.0366, 0.062, 28, 1, true, -2.4, 3.9);
    k.put('poly', label, C.label, [0, -0.12, 0]);
    const band = new THREE.CylinderGeometry(0.0368, 0.0368, 0.011, 28, 1, true, -2.4, 3.9);
    k.put('poly', band, C.labelRed, [0, -0.118, 0]);
    // Rag: stuffed into the neck, knotted over the mouth, two tails draped down the glass.
    k.cylY('poly', C.cloth, 0, 0, 0.03, 0.066, 0.0114, 0.0122, 12);
    k.put('poly', crumple(new THREE.IcosahedronGeometry(0.02, 1), 0.42, 3), C.cloth, [0.001, 0.077, 0.001], [0.3, 0.2, 0.1], [1.1, 0.78, 1.05]);
    k.put('poly', crumple(new THREE.IcosahedronGeometry(0.0125, 1), 0.5, 7), C.clothDark, [-0.008, 0.087, -0.005], [0.8, 0.4, 0.2]);
    k.put('poly', crumple(new THREE.IcosahedronGeometry(0.0105, 1), 0.5, 11), C.cloth, [0.009, 0.088, 0.006], [0.2, 0.9, 0.4]);
    k.boxC('poly', C.cloth, [0.002, 0.047, 0.0168], [0.019, 0.05, 0.0032], 0.0012, [0.1, 0, 0.05], 1);
    k.boxC('poly', C.clothDark, [0.004, 0.036, 0.0158], [0.012, 0.022, 0.0028], 0.001, [0.06, 0, -0.14], 1);
    k.boxC('poly', C.cloth, [-0.0166, 0.052, 0.001], [0.0032, 0.04, 0.015], 0.0012, [0, 0, 0.08], 1);
    return { muzzle: V(0, 0.08, 0), flame: V(0, 0.094, 0) };
  };

  // ----------------------------------------------------------- glow meshes
  /**
   * Additive glow: a star in the XY plane plus `petals` crossed teardrops
   * along the axis. Vertex colours fade to black at the edges, so with
   * additive blending the shape is soft without any texture.
   */
  function glowGeometry(opts) {
    const b = new VH.GeometryBuilder();
    const n = [0, 0, 1];
    const col = (v) => [v, v, v];
    const push = (a, bb, c) => b.idx.push(a, bb, c);
    // Star.
    if (opts.star) {
      const centre = b.vertex(0, 0, opts.starZ || 0, 0, 0, 1, col(1));
      const spikes = opts.spikes || 5;
      const ring = [];
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? opts.star : opts.star * 0.38;
        ring.push(b.vertex(Math.cos(a) * r, Math.sin(a) * r, opts.starZ || 0, 0, 0, 1, col(i % 2 === 0 ? 0 : 0.07)));
      }
      for (let i = 0; i < ring.length; i++) push(centre, ring[i], ring[(i + 1) % ring.length]);
      // A faint round halo so the flash has a soft glow even before bloom.
      const hc = b.vertex(0, 0, (opts.starZ || 0) - 0.001, 0, 0, 1, col(0.1));
      const halo = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        halo.push(b.vertex(Math.cos(a) * opts.star * 1.5, Math.sin(a) * opts.star * 1.5, (opts.starZ || 0) - 0.001, 0, 0, 1, col(0)));
      }
      for (let i = 0; i < 16; i++) push(hc, halo[i], halo[(i + 1) % 16]);
    }
    // Petals along +Z (rotated to +Y for flames by the caller).
    const L = opts.length;
    const W = opts.width;
    for (let p = 0; p < opts.petals; p++) {
      const a = (p / opts.petals) * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      const P = (w, z) => [ca * w, sa * w, z];
      const core = P(0, L * 0.28);
      const v0 = b.vertex(0, 0, 0, n[0], n[1], n[2], col(0.3));
      const v1 = b.vertex(...P(-W, L * 0.3), 0, 0, 1, col(0));
      const v2 = b.vertex(...core, 0, 0, 1, col(1));
      const v3 = b.vertex(...P(W, L * 0.3), 0, 0, 1, col(0));
      const v4 = b.vertex(0, 0, L, 0, 0, 1, col(0));
      const v5 = b.vertex(...P(-W * 0.55, L * 0.66), 0, 0, 1, col(0.04));
      const v6 = b.vertex(...P(W * 0.55, L * 0.66), 0, 0, 1, col(0.04));
      push(v0, v1, v2); push(v0, v2, v3);
      push(v2, v1, v5); push(v2, v6, v3);
      push(v2, v5, v4); push(v2, v4, v6);
    }
    return b.build();
  }

  let flashGeo = null;
  let flashMat = null;
  let flameGeo = null;
  let flameMat = null;

  function glowMaterial(r, g, bl) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(r, g, bl), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
  }

  function muzzleFlash() {
    if (!flashGeo) {
      flashGeo = glowGeometry({ star: 0.052, starZ: 0.004, spikes: 5, petals: 3, length: 0.17, width: 0.03 });
      flashMat = glowMaterial(6, 4, 1.5);
      flashMat.name = 'weapon-flash';
    }
    const m = new THREE.Mesh(flashGeo, flashMat);
    m.name = 'muzzleFlash';
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 5;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.life = 0;
    /** Show one flash: random roll and length, `scale` from the weapon (userData.flashScale). */
    m.userData.pop = function pop(scale, duration) {
      const s = (scale || 1) * (0.85 + Math.random() * 0.3);
      m.scale.set(s, s, s * (0.75 + Math.random() * 0.55));
      m.rotation.z = Math.random() * Math.PI * 2;
      m.visible = true;
      m.userData.life = duration || 0.05;
    };
    /** Call every frame; hides the flash when its life runs out. */
    m.userData.update = function update(dt) {
      if (!m.visible) return;
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false;
    };
    return m;
  }

  function molotovFlame() {
    if (!flameGeo) {
      flameGeo = glowGeometry({ star: 0.02, starZ: 0, spikes: 6, petals: 3, length: 0.085, width: 0.022 });
      flameGeo.rotateX(-Math.PI / 2); // +Z → +Y
      flameMat = glowMaterial(4.5, 1.7, 0.35);
      flameMat.name = 'weapon-flame';
    }
    const m = new THREE.Mesh(flameGeo, flameMat);
    m.name = 'ragFlame';
    m.visible = false;
    m.renderOrder = 5;
    return m;
  }

  // ------------------------------------------------------------- public
  const cache = new Map();

  function prepare(id) {
    let entry = cache.get(id);
    if (entry) return entry;
    const fn = MODELS[id];
    if (!fn) throw new Error('[WeaponModels] unknown weapon "' + id + '"');
    const kit = new Kit();
    const meta = fn(kit) || {};
    const geos = kit.finish();
    const off = meta.offset;
    if (off) for (const k in geos) geos[k].translate(off.x, off.y, off.z);
    const vec = (v) => (v ? new THREE.Vector3(v.x + (off ? off.x : 0), v.y + (off ? off.y : 0), v.z + (off ? off.z : 0)) : null);
    const def = VH.Data && VH.Data.weaponsById ? VH.Data.weaponsById[id] : null;
    entry = {
      geos,
      muzzle: vec(meta.muzzle) || new THREE.Vector3(),
      offHand: vec(meta.offHand),
      tip: vec(meta.tip),
      sight: vec(meta.sight),
      flame: vec(meta.flame),
      twoHanded: meta.twoHanded !== undefined ? meta.twoHanded : !!meta.offHand && id !== 'smg',
      flashScale: meta.flashScale || (def ? def.flash : 1),
      scope: !!meta.scope,
      kind: def ? def.kind : 'hitscan',
    };
    cache.set(id, entry);
    return entry;
  }

  function build(id) {
    const e = prepare(id);
    const M = materials();
    const g = new THREE.Group();
    g.name = 'weapon:' + id;
    for (const k of MAT_ORDER) {
      if (!e.geos[k]) continue;
      const mesh = new THREE.Mesh(e.geos[k], M[k]);
      mesh.name = id + ':' + k;
      mesh.castShadow = k !== 'glass';
      mesh.receiveShadow = true;
      if (k === 'glass') mesh.renderOrder = 2;
      g.add(mesh);
    }
    const drawCalls = g.children.length;
    let flame = null;
    if (e.flame) {
      flame = molotovFlame();
      flame.position.copy(e.flame);
      g.add(flame);
    }
    g.userData = {
      id,
      kind: e.kind,
      muzzle: e.muzzle.clone(),
      twoHanded: e.twoHanded,
      offHand: e.offHand ? e.offHand.clone() : null,
      tip: e.tip ? e.tip.clone() : null,
      sight: e.sight ? e.sight.clone() : null,
      scope: e.scope,
      flashScale: e.flashScale,
      flame,
      drawCalls,
    };
    return g;
  }

  /** World pickup: the model at 1.3x, centred on its bounds, long melee weapons laid flat. */
  function pickup(id) {
    const model = build(id);
    model.scale.setScalar(1.3);
    if (id === 'bat' || id === 'knife') model.rotation.x = Math.PI / 2;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(centre);
    const g = new THREE.Group();
    g.name = 'pickup:' + id;
    g.add(model);
    g.userData = { id, model, radius: size.length() / 2, size };
    return g;
  }

  VH.WeaponModels = {
    build,
    pickup,
    muzzleFlash,
    /** Ids that have a model (fists returns an empty group). */
    ids: Object.keys(MODELS),
    /** Build every model's geometry now (e.g. behind a loading screen). */
    preload() {
      for (const id of Object.keys(MODELS)) prepare(id);
    },
    /** Shared materials, created on first use. */
    materials,
    _helpers: { roundedBox, creaseNormals, sideProfile, frontPlate },
  };
})();
