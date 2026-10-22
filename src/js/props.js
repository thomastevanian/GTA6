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
  function palmGeometry(height, lean, seed) {
    const rng = new VH.RNG(seed);
    const b = new VH.GeometryBuilder();
    const up = new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const segs = 7;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector3(lean * t * t, height * t, 0));
    }
    const barkA = VH.col(0x8b7152);
    const barkB = VH.col(0x6f583f);
    for (let i = 0; i < segs; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dir = new THREE.Vector3().subVectors(p1, p0);
      const len = dir.length();
      dir.normalize();
      const r0 = 0.26 - 0.1 * (i / segs);
      const r1 = 0.26 - 0.1 * ((i + 1) / segs);
      const g = new THREE.CylinderGeometry(r1, r0 * 1.08, len, 6, 1, true);
      q.setFromUnitVectors(up, dir);
      m.compose(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      b.merge(g, m, i % 2 ? barkA : barkB);
      g.dispose();
    }
    const top = pts[segs];
    // Coconuts.
    const nut = new THREE.IcosahedronGeometry(0.17, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      m.makeTranslation(top.x + Math.cos(a) * 0.28, top.y - 0.3, top.z + Math.sin(a) * 0.28);
      b.merge(nut, m, VH.col(0x5a4326));
    }
    nut.dispose();
    // Fronds: a folded V-strip that arches out and droops.
    const fronds = 8;
    for (let f = 0; f < fronds; f++) {
      const az = (f / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const L = rng.range(3.4, 4.4);
      const lift = rng.range(0.25, 0.6);
      const dx = Math.cos(az);
      const dz = Math.sin(az);
      const sideX = -dz;
      const sideZ = dx;
      const steps = 5;
      const base = VH.col(0x3f6b2a);
      const tip = VH.col(0x7fa846);
      let prev = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const reach = L * t;
        const y = top.y + L * (lift * t - 0.9 * t * t);
        const cx = top.x + dx * reach;
        const cz = top.z + dz * reach;
        const w = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) + 0.05;
        const fold = 0.18 * w;
        const cur = {
          c: [cx, y, cz],
          l: [cx + sideX * w, y - fold, cz + sideZ * w],
          r: [cx - sideX * w, y - fold, cz - sideZ * w],
          col: VH.colMix(base, tip, t),
        };
        if (prev) {
          b.quad(prev.l, cur.l, cur.c, prev.c, [0, 1, 0], cur.col);
          b.quad(prev.c, cur.c, cur.r, prev.r, [0, 1, 0], cur.col);
        }
        prev = cur;
      }
    }
    return fixFlatNormals(b.build());
  }

  /** Quads above were given placeholder normals; compute real ones. */
  function fixFlatNormals(geo) {
    geo.computeVertexNormals();
    return geo;
  }

  const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

  function treeGeometry(seed) {
    const rng = new VH.RNG(seed);
    const b = new VH.GeometryBuilder();
    const m = new THREE.Matrix4();
    const bark = VH.col(0x5b4432);
    b.cylinder(0, 0, 0, 0.24, 0.15, 3.4, 7, bark, false);
    const leafCols = [0x2f5d2a, 0x3b6e2f, 0x46783a, 0x355f2c];
    const blob = new THREE.IcosahedronGeometry(1, 1);
    const blobs = rng.int(4, 6);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = i === 0 ? 0 : rng.range(0.9, 1.6);
      const s = rng.range(1.3, 2.0);
      const y = 4.2 + rng.range(-0.4, 1.0) + (i === 0 ? 0.8 : 0);
      m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.85, s));
      b.merge(blob, m, VH.col(rng.pick(leafCols), rng.range(0.9, 1.1)));
    }
    blob.dispose();
    return b.build();
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

  function shrubGeometry(seed) {
    const rng = new VH.RNG(seed);
    const b = new VH.GeometryBuilder();
    const m = new THREE.Matrix4();
    const blob = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 3; i++) {
      const s = rng.range(0.45, 0.65);
      m.compose(new THREE.Vector3(rng.range(-0.35, 0.35), 0.95 + rng.range(0, 0.25), rng.range(-0.35, 0.35)),
        new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s));
      b.merge(blob, m, VH.col(rng.pick([0x3c6b2e, 0x4a7a36, 0x2f5a27])));
    }
    blob.dispose();
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
        parts: [{ geo: palmGeometry(8.2, 0.9, 11), mat: M.foliage, depth: M.foliageDepth, shadow: true }],
        collider: { r: 0.28, h: 6 }, maxDistance: 700,
      },
      palmTall: {
        parts: [{ geo: palmGeometry(12.5, 1.6, 23), mat: M.foliage, depth: M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 8 }, maxDistance: 800,
      },
      tree: {
        parts: [{ geo: treeGeometry(5), mat: M.foliage, depth: M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 3 }, maxDistance: 650, canopy: true,
      },
      treeB: {
        parts: [{ geo: treeGeometry(77), mat: M.foliage, depth: M.foliageDepth, shadow: true }],
        collider: { r: 0.3, h: 3 }, maxDistance: 650, canopy: true,
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
          { geo: shrubGeometry(3), mat: M.foliage, depth: M.foliageDepth, shadow: true },
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
        col.propType = type;
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
      const def = this.defs[col.propType];
      const hidden = PropSystem._zero || (PropSystem._zero = new THREE.Matrix4().makeScale(0, 0, 0));
      for (const mesh of meshes) {
        mesh.setMatrixAt(col.propIndex, hidden);
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (VH.game && VH.game.fx) VH.game.fx.propDebris(def.parts, it, vehicle, col.propType);
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
