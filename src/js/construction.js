/*
 * construction.js — Meridian Yard, the construction site next to Civic
 * Plaza, and the Yard Run parkour course that runs through it.
 *
 * The route (east → west along the north side, up, then back east):
 *
 *   gate ─► jersey barriers (vault) ─► pallets ─► container A
 *        ─► 2.5 m gap ─► container B ─► crate ─► container C (5.4 m up)
 *        ─► plank bridge ─► scaffold bays, climbing to 9.3 m
 *        ─► a steel beam half a metre wide, nine metres up
 *        ─► the half-built frame's top floor ─► a 3 m gap (sprint!)
 *        ─► drop down the container stack ─► finish
 *
 * Every step is inside Jay's limits (climb ≤ 1.7 m, running jump ≈ 2.9 m,
 * sprint jump ≈ 4.7 m, safe drop ≈ 3.6 m); tools/smoke.mjs runs the hard
 * parts. Each checkpoint knows how low you may fall before you're sent back.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;
  const G = KERB; // site ground level

  function build(world, block) {
    const ctx = world.ctxAt(block.cx, block.cz);
    const ph = world.physics;
    const X0 = block.minX + 4;
    const X1 = block.maxX - 4;
    const Z0 = block.minZ + 4;
    const Z1 = block.maxZ - 4;

    const solid = (bld, x0, y0, z0, x1, y1, z1, color, tag, opts) => {
      bld.box(x0, y0, z0, x1, y1, z1, color, opts);
      ph.addBox(x0, y0 < 0.3 ? 0 : y0, z0, x1, y1, z1, tag || 'static');
    };

    // ------------------------------------------------------- ground, fence
    ctx.asphaltTop.topRect(X0, Z0, X1, Z1, KERB, VH.col(0xc9a77c, 0.95), 6);
    ph.addBox(X0, 0, Z0, X1, KERB + 0.001, Z1, 'dirt', VH.COLLIDE.SOLID);
    const gate = { z0: Z0 + 9, z1: Z0 + 21 };
    const fenceH = 2.5;
    const ply = VH.col(0x2f6fb0);
    const plyTop = VH.col(0xf2f2f2);
    const fence = (x0, z0, x1, z1) => {
      ctx.propMatte.box(x0, KERB, z0, x1, KERB + fenceH, z1, ply, { top: plyTop });
      ctx.propMatte.box(x0 - 0.01, KERB + fenceH - 0.35, z0 - 0.01, x1 + 0.01, KERB + fenceH - 0.2, z1 + 0.01, plyTop);
      ph.addBox(x0, 0, z0, x1, KERB + fenceH, z1, 'fence', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
    };
    const t = 0.15;
    fence(X0 - t, Z0 - t, X1 + t, Z0); //         north
    fence(X0 - t, Z1, X1 + t, Z1 + t); //         south
    fence(X0 - t, Z0, X0, Z1); //                 west
    fence(X1, Z0, X1 + t, gate.z0); //            east, north of the gate
    fence(X1, gate.z1, X1 + t, Z1); //            east, south of the gate
    const signAt = (spec) => {
      world.signs = world.signs || [];
      world.signs.push(spec);
    };
    signAt({ x: X1 + t + 0.02, y: KERB + 1.5, z: (gate.z1 + Z1) / 2, yaw: Math.PI / 2, w: 11, h: 1.9, lines: ['MERIDIAN ONE', 'Offices · Residences · Rooftop Pool — Opening 2027'], style: 'info', frame: 0x1c3552 });
    signAt({ x: X1 + t + 0.02, y: KERB + 1.5, z: (Z0 + gate.z0) / 2, yaw: Math.PI / 2, w: 6.5, h: 1.6, lines: ['DANGER', 'Construction site · Hard hats beyond this point'], style: 'brand', frame: 0x3a1010 });
    signAt({ x: (X0 + X1) / 2, y: KERB + 1.5, z: Z1 + t + 0.02, yaw: 0, w: 14, h: 1.9, lines: ['MERIDIAN YARD', 'A Vicehaven Builds project'], style: 'monolith' });

    // ------------------------------------------------------------ helpers
    const RUST = [0x9c3b2a, 0x2f5d8a, 0x3f6b44, 0xc86a2a, 0xb9b3a8, 0x6d3f7a];
    let containerIndex = 0;
    /** A shipping container: 2.6 m tall, ribbed sides, barred doors at one end. */
    const container = (x0, z0, x1, z1, baseY, hex) => {
      const col = VH.col(hex !== undefined ? hex : RUST[containerIndex++ % RUST.length]);
      const top = baseY + 2.6;
      const bld = ctx.prop;
      bld.box(x0, baseY, z0, x1, top, z1, col, { top: VH.colMul(col, 0.9), bottom: baseY > 0.3 });
      ph.addBox(x0, baseY < 0.3 ? 0 : baseY, z0, x1, top, z1, 'container');
      const alongX = x1 - x0 > z1 - z0;
      const len = alongX ? x1 - x0 : z1 - z0;
      const rib = VH.colMul(col, 0.8);
      for (let p = 0.3; p < len - 0.2; p += 0.32) {
        if (alongX) {
          bld.box(x0 + p, baseY + 0.12, z0 - 0.03, x0 + p + 0.07, top - 0.12, z0, rib);
          bld.box(x0 + p, baseY + 0.12, z1, x0 + p + 0.07, top - 0.12, z1 + 0.03, rib);
        } else {
          bld.box(x0 - 0.03, baseY + 0.12, z0 + p, x0, top - 0.12, z0 + p + 0.07, rib);
          bld.box(x1, baseY + 0.12, z0 + p, x1 + 0.03, top - 0.12, z0 + p + 0.07, rib);
        }
      }
      // Corner posts in a darker shade.
      const post = VH.colMul(col, 0.55);
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        bld.box(cx - 0.06, baseY, cz - 0.06, cx + 0.06, top, cz + 0.06, post);
      }
    };

    /** A scaffold bay: solid to walk on and bump into, drawn as poles, ledgers and a plank deck. */
    const scaffold = (x0, z0, x1, z1, top) => {
      ph.addBox(x0, 0, z0, x1, top, z1, 'scaffold');
      const steel = VH.col(0x9aa1a8);
      const bld = ctx.prop;
      const poleXs = [x0, (x0 + x1) / 2, x1];
      for (const px of poleXs) {
        for (const pz of [z0, z1]) bld.box(px - 0.05, 0, pz - 0.05, px + 0.05, top + 1.0, pz + 0.05, steel);
      }
      for (let y = 1.0; y < top; y += 1.9) {
        bld.box(x0, y, z0 - 0.05, x1, y + 0.08, z0 + 0.05, steel);
        bld.box(x0, y, z1 - 0.05, x1, y + 0.08, z1 + 0.05, steel);
        bld.box(x0 - 0.05, y, z0, x0 + 0.05, y + 0.08, z1, steel);
        bld.box(x1 - 0.05, y, z0, x1 + 0.05, y + 0.08, z1, steel);
      }
      // Diagonal braces on the long faces.
      const brace = new THREE.BoxGeometry(0.06, 0.06, 1);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const dir = new THREE.Vector3();
      for (const pz of [z0 - 0.07, z1 + 0.07]) {
        const a = new THREE.Vector3(x0, 0.3, pz);
        const b = new THREE.Vector3(x1, Math.min(top - 0.2, 4), pz);
        dir.subVectors(b, a);
        const len = dir.length();
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
        m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, len));
        bld.merge(brace, m, steel);
      }
      brace.dispose();
      // Plank deck and toe boards.
      ctx.wood.box(x0, top - 0.06, z0, x1, top, z1, VH.col(0xd9b98a), { uvScale: 2, bottom: true });
      const toe = VH.col(0xc8a070);
      ctx.wood.box(x0, top, z0 - 0.02, x1, top + 0.15, z0 + 0.02, toe, { uvScale: 2 });
      ctx.wood.box(x0, top, z1 - 0.02, x1, top + 0.15, z1 + 0.02, toe, { uvScale: 2 });
    };

    // ------------------------------------------------------------ the course
    const zc = Z0 + 15; // the northern lane
    const cp = []; // checkpoints in order
    const addCP = (x, surfaceY, z, floor, r) => cp.push({ x, y: surfaceY + 1.2, z, surfaceY, r: r || 2.0, floor: floor === undefined ? null : floor });

    const startX = X1 - 3;
    // 1. Jersey barriers across the lane.
    const barrierX = X1 - 12;
    for (let z = zc - 6; z < zc + 6; z += 2) {
      ctx.concrete.box(barrierX - 0.3, KERB, z + 0.03, barrierX + 0.3, KERB + 0.9, z + 1.97, VH.col(0xd6d2c8), { uvScale: 4 });
      ctx.concrete.box(barrierX - 0.31, KERB + 0.55, z + 0.03, barrierX + 0.31, KERB + 0.7, z + 1.97, VH.col(0xd43c2c), { skip: { top: true } });
    }
    // One collider for the whole row, so no seam between blocks can snag a foot.
    ph.addBox(barrierX - 0.3, 0, zc - 6, barrierX + 0.3, KERB + 0.9, zc + 6, 'barrier');
    addCP(X1 - 16, G, zc);

    // 2. Pallets up onto container A.
    const aX0 = X1 - 36, aX1 = X1 - 24;
    solid(ctx.wood, aX1, KERB, zc - 1.0, aX1 + 2.0, KERB + 1.2, zc + 1.0, VH.col(0xb08a5a), 'crate', { uvScale: 2 });
    container(aX0, zc - 1.22, aX1, zc + 1.22, KERB, 0x9c3b2a);
    const cTop1 = KERB + 2.6;
    addCP(aX0 + 4, cTop1, zc);

    // 3. A 2.5 m gap to container B.
    const bX1 = aX0 - 2.5, bX0 = bX1 - 12;
    container(bX0, zc - 1.22, bX1, zc + 1.22, KERB, 0x2f5d8a);
    addCP((bX0 + bX1) / 2 + 1, cTop1, zc, cTop1 - 0.8);

    // 4. A crate, then container C stacked crosswise on B's west end.
    solid(ctx.wood, bX0 + 2.6, cTop1, zc - 0.8, bX0 + 4.1, cTop1 + 1.3, zc + 0.8, VH.col(0xa87a4a), 'crate', { uvScale: 2 });
    const cX0 = bX0, cX1 = bX0 + 2.44;
    const cZ0 = zc - 3, cZ1 = zc + 3;
    container(cX0, cZ0, cX1, cZ1, cTop1, 0xc86a2a);
    const cTop2 = cTop1 + 2.6;
    addCP((cX0 + cX1) / 2, cTop2, zc, cTop1 - 0.8);

    // 5. A plank bridge south to the scaffold.
    const sX0 = cX0 - 2.5, sX1 = cX1 + 3.1;
    const plankX = (cX0 + cX1) / 2;
    const tZ0 = cZ1 + 8;
    solid(ctx.wood, plankX - 0.42, cTop2 - 0.08, cZ1, plankX + 0.42, cTop2, tZ0, VH.col(0xd9b98a), 'plank', { uvScale: 2, bottom: true });
    for (const pz of [cZ1 + 2.7, cZ1 + 5.4]) {
      ctx.prop.box(plankX - 0.05, 0, pz - 0.05, plankX + 0.05, cTop2 - 0.08, pz + 0.05, VH.col(0x9aa1a8));
    }

    // 6. Scaffold bays climbing 1.3 m at a time.
    const bays = [[tZ0, tZ0 + 4, cTop2], [tZ0 + 4, tZ0 + 7.5, cTop2 + 1.3], [tZ0 + 7.5, tZ0 + 11, cTop2 + 2.6], [tZ0 + 11, tZ0 + 15, cTop2 + 3.9]];
    for (const [z0, z1, top] of bays) scaffold(sX0, z0, sX1, z1, top);
    addCP(plankX, cTop2, tZ0 + 2, cTop2 - 1.2);
    const topY = cTop2 + 3.9;
    const beamZ = tZ0 + 13;
    addCP(plankX, topY, beamZ, cTop2 - 1.2);

    // 7. The steel beam east to the frame.
    const fX0 = sX1 + 10, fX1 = fX0 + 20;
    const fZ0 = beamZ - 8, fZ1 = beamZ + 12;
    const red = VH.col(0xc0452c);
    ctx.prop.box(sX1, topY - 0.04, beamZ - 0.25, fX0, topY, beamZ + 0.25, red);
    ctx.prop.box(sX1, topY - 0.28, beamZ - 0.05, fX0, topY - 0.04, beamZ + 0.05, red);
    ctx.prop.box(sX1, topY - 0.32, beamZ - 0.25, fX0, topY - 0.28, beamZ + 0.25, red, { bottom: true });
    ph.addBox(sX1, topY - 0.32, beamZ - 0.25, fX0, topY, beamZ + 0.25, 'beam');

    // 8. The frame: three slabs, the top one with a 3 m hole in it.
    const concrete = VH.col(0xbdb7ab);
    const slab = (x0, x1, top) => solid(ctx.concrete, x0, top - 0.25, fZ0, x1, top, fZ1, concrete, 'slab', { uvScale: 4, bottom: true });
    slab(fX0, fX1, KERB + 3.1);
    slab(fX0, fX1, KERB + 6.1);
    const gapX0 = fX0 + 7, gapX1 = gapX0 + 3;
    slab(fX0, gapX0, topY);
    slab(gapX1, fX1, topY);
    for (const x of [fX0 + 0.3, fX0 + 6.7, gapX1 + 0.3, fX1 - 0.3]) {
      for (const z of [fZ0 + 0.3, fZ1 - 0.3]) {
        solid(ctx.concrete, x - 0.3, 0, z - 0.3, x + 0.3, topY + 0.9, z + 0.3, VH.colMul(concrete, 0.92), 'column', { uvScale: 4 });
        for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
          ctx.prop.box(x + dx - 0.02, topY + 0.9, z + dz - 0.02, x + dx + 0.02, topY + 1.8, z + dz + 0.02, VH.col(0x5a3a2a));
        }
      }
    }
    addCP(fX0 + 3, topY, beamZ, topY - 1.3);
    addCP(gapX1 + 3, topY, beamZ, topY - 1.3);

    // 9. Down the container stack to the finish.
    const dX0 = fX1 + 0.3, dX1 = dX0 + 6;
    container(dX0, beamZ - 1.22, dX1, beamZ + 1.22, KERB, 0x3f6b44);
    container(dX0, beamZ - 1.22, dX1, beamZ + 1.22, cTop1, 0xb9b3a8);
    const eX0 = dX1 + 0.3, eX1 = Math.min(eX0 + 6, X1 - 0.8);
    container(eX0, beamZ - 1.22, eX1, beamZ + 1.22, KERB, 0x6d3f7a);
    addCP((eX0 + eX1) / 2, cTop1, beamZ, cTop1 - 1.0);
    const finish = { x: X1 - 5, z: Math.min(Z1 - 4, beamZ + 18) };
    addCP(finish.x, G, finish.z, null, 2.6);
    cp[cp.length - 1].finish = true;

    // ------------------------------------------------------------ dressing
    // Tower crane over the south-west corner.
    crane(ctx, ph, X0 + 10, Z1 - 12);
    // Site cabin, portable toilets, rebar, cones, floodlights.
    const cabin = { x0: X0 + 3, z0: Z0 + 3, x1: X0 + 15, z1: Z0 + 6 };
    const F = { wall: VH.col(0xe8e4d8), style: 1, ww: 0.6, wh: 0.5, bay: 2, floorH: 2.6, seed: 3.3 };
    ctx.b.wall([cabin.x0, KERB, cabin.z1], 1, 0, cabin.x1 - cabin.x0, 2.6, F.wall, null, [0, 6, 0, 1], [F.ww, F.wh, F.style, F.seed]);
    ctx.b.wall([cabin.x1, KERB, cabin.z0], -1, 0, cabin.x1 - cabin.x0, 2.6, F.wall, null, [0, 6, 0, 1], [0, 0, 0, F.seed]);
    ctx.b.wall([cabin.x1, KERB, cabin.z1], 0, -1, cabin.z1 - cabin.z0, 2.6, F.wall, null, [0, 1, 0, 1], [0, 0, 0, F.seed]);
    ctx.b.wall([cabin.x0, KERB, cabin.z0], 0, 1, cabin.z1 - cabin.z0, 2.6, F.wall, null, [0, 1, 0, 1], [0, 0, 0, F.seed]);
    ctx.propMatte.box(cabin.x0 - 0.1, KERB + 2.6, cabin.z0 - 0.1, cabin.x1 + 0.1, KERB + 2.75, cabin.z1 + 0.1, VH.col(0x6b6f74));
    ph.addBox(cabin.x0, 0, cabin.z0, cabin.x1, KERB + 2.75, cabin.z1, 'building');
    for (let i = 0; i < 3; i++) {
      const x = X0 + 18 + i * 1.5;
      solid(ctx.propMatte, x, KERB, Z0 + 2.5, x + 1.2, KERB + 2.3, Z0 + 3.7, VH.col(0x2f7fd0), 'static', { top: VH.col(0xf2f2f2) });
    }
    for (let i = 0; i < 6; i++) {
      const z = Z1 - 3 - i * 0.35;
      ctx.prop.box(X1 - 22, KERB, z, X1 - 12, KERB + 0.12, z + 0.12, VH.col(0x5a3a2a));
    }
    ph.addBox(X1 - 22, 0, Z1 - 5, X1 - 12, KERB + 0.12, Z1 - 2.8, 'metal', VH.COLLIDE.SOLID);
    for (let i = 0; i < 7; i++) cone(ctx, X1 - 1.2, gate.z1 + 1.5 + i * 1.8);
    for (const [x, z] of [[X1 - 3, Z0 + 3], [X0 + 3, Z1 - 3], [X1 - 3, Z1 - 3]]) floodlight(ctx, world, x, z);
    world.addProp('dumpster', X0 + 30, KERB, Z1 - 3, 0, 1);
    world.addProp('dumpster', X0 + 34, KERB, Z1 - 3, 0, 1);

    const def = {
      id: 'yard_run',
      start: { x: startX, y: G, z: zc, yaw: -Math.PI / 2 },
      marker: { x: X1 + 2.2, y: KERB, z: zc },
      checkpoints: cp,
      bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
    };
    world.courses = world.courses || {};
    world.courses.yard_run = def;
    return def;
  }

  function cone(ctx, x, z) {
    const orange = VH.col(0xf06a1a);
    ctx.propMatte.box(x - 0.2, KERB, z - 0.2, x + 0.2, KERB + 0.05, z + 0.2, VH.col(0x222222));
    ctx.propMatte.cylinder(x, KERB + 0.05, z, 0.16, 0.03, 0.62, 10, orange, true);
    ctx.propMatte.cylinder(x, KERB + 0.3, z, 0.11, 0.09, 0.12, 10, VH.col(0xf2f2f2), false);
  }

  function floodlight(ctx, world, x, z) {
    const steel = VH.col(0x4a4f55);
    ctx.prop.cylinder(x, KERB, z, 0.14, 0.1, 9, 8, steel, true);
    ctx.prop.box(x - 0.9, KERB + 9, z - 0.25, x + 0.9, KERB + 9.5, z + 0.25, VH.col(0x2a2e33));
    ctx.screen.quad([x - 0.8, KERB + 8.99, z - 0.2], [x + 0.8, KERB + 8.99, z - 0.2], [x + 0.8, KERB + 8.99, z + 0.2], [x - 0.8, KERB + 8.99, z + 0.2], [0, -1, 0], VH.col(0xfff4d8, 1.6));
    world.physics.addBox(x - 0.2, 0, z - 0.2, x + 0.2, KERB + 9, z + 0.2, 'prop', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
  }

  /** A tower crane: lattice mast, jib, counter-jib with weights, cab and hook. */
  function crane(ctx, ph, x, z) {
    const yellow = VH.col(0xe2b018);
    const bld = ctx.prop;
    const mastH = 58;
    const w = 1.8;
    const chord = (cx, cz) => bld.box(cx - 0.09, 0, cz - 0.09, cx + 0.09, mastH, cz + 0.09, yellow);
    chord(x - w / 2, z - w / 2);
    chord(x + w / 2, z - w / 2);
    chord(x - w / 2, z + w / 2);
    chord(x + w / 2, z + w / 2);
    const bar = new THREE.BoxGeometry(0.07, 0.07, 1);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const strut = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length();
      q.setFromUnitVectors(zAxis, d.normalize());
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, len));
      bld.merge(bar, m, yellow);
    };
    const faces = [
      [[x - w / 2, z - w / 2], [x + w / 2, z - w / 2]],
      [[x + w / 2, z - w / 2], [x + w / 2, z + w / 2]],
      [[x + w / 2, z + w / 2], [x - w / 2, z + w / 2]],
      [[x - w / 2, z + w / 2], [x - w / 2, z - w / 2]],
    ];
    for (let y = 0; y < mastH - 0.1; y += 2) {
      for (const [[ax, az], [bx, bz]] of faces) {
        const flip = (y / 2) % 2 === 0;
        strut(new THREE.Vector3(ax, y + (flip ? 0 : 2), az), new THREE.Vector3(bx, y + (flip ? 2 : 0), bz));
        bld.box(Math.min(ax, bx) - 0.04, y - 0.04, Math.min(az, bz) - 0.04, Math.max(ax, bx) + 0.04, y + 0.04, Math.max(az, bz) + 0.04, yellow);
      }
    }
    ph.addBox(x - w / 2 - 0.1, 0, z - w / 2 - 0.1, x + w / 2 + 0.1, mastH, z + w / 2 + 0.1, 'crane');
    // Slewing unit and cab.
    bld.box(x - 1.3, mastH, z - 1.3, x + 1.3, mastH + 1.6, z + 1.3, VH.col(0xd0a010));
    bld.box(x + 1.0, mastH + 0.2, z - 1.9, x + 2.6, mastH + 2.0, z - 0.3, VH.col(0xf2f2f2));
    ctx.b.wall([x + 2.6, mastH + 0.9, z - 0.3], 0, -1, 1.6, 1.0, VH.col(0xf2f2f2), null, [0, 1, 0, 1], [0.9, 0.8, 2, 5.5]);
    // Jib (pointing east over the site) and counter-jib (west).
    const jy = mastH + 1.6;
    const jib = 42;
    const jz = 0.7;
    for (const dz of [-jz, jz]) bld.box(x, jy, z + dz - 0.07, x + jib, jy + 0.14, z + dz + 0.07, yellow);
    bld.box(x, jy + 1.6, z - 0.07, x + jib - 2, jy + 1.74, z + 0.07, yellow);
    for (let s = 0; s < jib - 2; s += 2) {
      strut(new THREE.Vector3(x + s, jy, z - jz), new THREE.Vector3(x + s + 1, jy + 1.6, z));
      strut(new THREE.Vector3(x + s + 2, jy, z + jz), new THREE.Vector3(x + s + 1, jy + 1.6, z));
    }
    bld.box(x - 16, jy, z - 1.0, x, jy + 0.3, z + 1.0, yellow);
    bld.box(x - 15, jy + 0.3, z - 1.1, x - 10, jy + 2.3, z + 1.1, VH.col(0x8f8a82));
    // Apex and tie bars.
    bld.box(x - 0.3, jy, z - 0.3, x + 0.3, jy + 7, z + 0.3, yellow);
    strut(new THREE.Vector3(x, jy + 7, z), new THREE.Vector3(x + jib * 0.6, jy + 1.7, z));
    strut(new THREE.Vector3(x, jy + 7, z), new THREE.Vector3(x - 14, jy + 0.3, z));
    // Trolley, cable and hook with a bundle of steel.
    const tx = x + 24;
    bld.box(tx - 0.6, jy - 0.4, z - 0.8, tx + 0.6, jy, z + 0.8, VH.col(0x3a3d42));
    bld.box(tx - 0.02, 16, z - 0.02, tx + 0.02, jy - 0.4, z + 0.02, VH.col(0x222222));
    bld.box(tx - 0.3, 15.2, z - 0.3, tx + 0.3, 16, z + 0.3, VH.col(0xe2b018));
    bld.box(tx - 3, 13.8, z - 0.4, tx + 3, 14.4, z + 0.4, VH.col(0xc0452c));
    bar.dispose();
  }

  VH.Construction = { build };
})();
