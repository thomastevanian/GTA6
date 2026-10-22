/*
 * landmarks.js — the hand-designed places of the Phase 1 city.
 *
 *   Civic Plaza      where Jay starts: the movement test ground (stairs, a
 *                    ramp, crate steps, vault walls, a climbable wall), the
 *                    Beacon monument, vending machines and a city guide kiosk
 *   Founders Park    lawns, paths, a fountain and a gazebo
 *   Vicehaven Tower  the tallest building in the city
 *   The waterfront   promenade, boardwalk, seawall, Harbor Beach, the bay
 *                    and Oceanview Pier
 *
 * All positions are derived from the block rectangles citygen.js produced,
 * so the landmarks follow the street grid if it changes.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;

  // ------------------------------------------------------------ helpers
  /** A box that is both drawn (into builder `bld`) and solid. */
  function solidBox(world, bld, x0, y0, z0, x1, y1, z1, color, opts, tag) {
    bld.box(x0, y0, z0, x1, y1, z1, color, opts);
    world.physics.addBox(x0, Math.min(y0, 0), z0, x1, y1, z1, tag || 'static');
  }

  /** A metal railing between two points on the ground, with a collider. */
  function railing(world, ctx, x0, z0, x1, z1, y, opts) {
    opts = opts || {};
    const h = opts.height || 1.05;
    const metal = VH.col(opts.color || 0x3f454c);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    for (let i = 0; i <= n; i++) {
      const px = x0 + dx * (len * i) / n;
      const pz = z0 + dz * (len * i) / n;
      ctx.prop.box(px - 0.04, y, pz - 0.04, px + 0.04, y + h, pz + 0.04, metal);
    }
    const t = 0.035;
    const rail = (yy, th) => {
      if (Math.abs(dx) > Math.abs(dz)) ctx.prop.box(Math.min(x0, x1), yy, z0 - t, Math.max(x0, x1), yy + th, z0 + t, metal, { bottom: true });
      else ctx.prop.box(x0 - t, yy, Math.min(z0, z1), x0 + t, yy + th, Math.max(z0, z1), metal, { bottom: true });
    };
    rail(y + h - 0.06, 0.06);
    rail(y + h * 0.5, 0.04);
    const pad = 0.08;
    world.physics.addBox(Math.min(x0, x1) - pad, y - 0.3, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, y + h, Math.max(z0, z1) + pad,
      'railing', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
  }

  /** An invisible wall — keeps the player out of places later phases open up. */
  function invisibleWall(world, x0, z0, x1, z1) {
    world.physics.addBox(x0, -10, z0, x1, 40, z1, 'boundary', VH.COLLIDE.SOLID);
  }

  function sign(world, spec) {
    world.signs = world.signs || [];
    world.signs.push(spec);
  }

  // --------------------------------------------------------- Civic Plaza
  function buildPlaza(world, block) {
    const ctx = world.ctxAt(block.cx, block.cz);
    const ix0 = block.minX + 4;
    const ix1 = block.maxX - 4;
    const iz0 = block.minZ + 4;
    const iz1 = block.maxZ - 4;
    const cx = (ix0 + ix1) / 2;
    const cz = (iz0 + iz1) / 2;
    const base = KERB;
    const stone = VH.col(0xd6cfc2);
    const stoneDark = VH.col(0xa39c90);

    // Paving.
    ctx.plazaTop.topRect(ix0, iz0, ix1, iz1, KERB, VH.col(0xffffff), 4);

    // The Beacon — a stepped plinth, a pedestal and a bronze obelisk.
    const mx = cx;
    const mz = cz - 2;
    solidBox(world, ctx.concrete, mx - 5, base, mz - 5, mx + 5, base + 0.3, mz + 5, stone, { uvScale: 4 });
    solidBox(world, ctx.concrete, mx - 3.5, base + 0.3, mz - 3.5, mx + 3.5, base + 0.6, mz + 3.5, stone, { uvScale: 4 });
    solidBox(world, ctx.concrete, mx - 1.3, base + 0.6, mz - 1.3, mx + 1.3, base + 3.0, mz + 1.3, stoneDark, { uvScale: 4 });
    const bronze = VH.col(0x8c6a3a);
    ctx.prop.cylinder(mx, base + 3.0, mz, 0.95, 0.42, 9.5, 4, bronze, false);
    ctx.prop.cylinder(mx, base + 12.5, mz, 0.42, 0.0, 1.4, 4, VH.col(0xd9b45a), false);
    world.physics.addBox(mx - 0.9, 0, mz - 0.9, mx + 0.9, base + 13.9, mz + 0.9, 'monument');
    sign(world, { x: mx, y: base + 1.9, z: mz + 1.32, yaw: 0, w: 2.2, h: 0.9, lines: ['THE BEACON', 'Vicehaven · est. 1911'], style: 'plaque' });

    // Planters with trees and benches around the monument.
    for (const [px, pz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      world.addProp('planter', mx + px, base, mz + pz, 0, 1);
      world.addProp('tree', mx + px, base + 0.7, mz + pz, (px + pz) * 0.1, 0.75);
    }
    world.addProp('bench', mx, base, mz + 8.5, Math.PI, 1);
    world.addProp('bench', mx, base, mz - 8.5, 0, 1);
    world.addProp('bench', mx + 8.5, base, mz, -Math.PI / 2, 1);
    world.addProp('bench', mx - 8.5, base, mz, Math.PI / 2, 1);

    // --- North-west: the terrace, with stairs on its south side and a ramp on its east side.
    const tx0 = ix0;
    const tx1 = ix0 + 18;
    const tz0 = iz0;
    const tz1 = iz0 + 16;
    const tH = 2.4;
    const tTop = base + tH;
    solidBox(world, ctx.concrete, tx0, base, tz0, tx1, tTop, tz1, VH.col(0xc8c1b4), { uvScale: 4, skip: { top: true } }, 'terrace');
    ctx.plaza.topRect(tx0, tz0, tx1, tz1, tTop, VH.col(0xf0ebe0), 4);
    // Stairs: eight 0.3 m risers, each 0.4 m deep.
    const sx0 = tx0 + 3;
    const sx1 = tx0 + 11;
    for (let k = 0; k < 8; k++) {
      const h = (8 - k) * 0.3;
      const z0 = tz1 + k * 0.4;
      solidBox(world, ctx.concrete, sx0, base, z0, sx1, base + h, z0 + 0.4, VH.col(0xd2cbbe), { uvScale: 4 }, 'stairs');
    }
    // Ramp: 14 m run up to the terrace, rising westwards (towards -X).
    const rz0 = tz0 + 2;
    const rz1 = tz0 + 8;
    const rxHigh = tx1;
    const rxLow = tx1 + 14;
    const rampCol = VH.col(0xbdb6a9);
    ctx.concrete.polygon([[rxHigh, tTop, rz1], [rxLow, base, rz1], [rxLow, base, rz0], [rxHigh, tTop, rz0]], rampCol);
    ctx.concrete.polygon([[rxHigh, base, rz1], [rxLow, base, rz1], [rxHigh, tTop, rz1]], VH.colMul(rampCol, 0.85));
    ctx.concrete.polygon([[rxLow, base, rz0], [rxHigh, base, rz0], [rxHigh, tTop, rz0]], VH.colMul(rampCol, 0.85));
    world.physics.addRamp((rxHigh + rxLow) / 2, (rz0 + rz1) / 2, (rz1 - rz0) / 2, (rxLow - rxHigh) / 2, -Math.PI / 2, 0, base, tTop, 'ramp');
    // Railings on the terrace edges, leaving the stair and ramp openings.
    const ry = tTop;
    railing(world, ctx, tx0 + 0.2, tz0 + 0.2, tx1 - 0.2, tz0 + 0.2, ry); //   north
    railing(world, ctx, tx0 + 0.2, tz0 + 0.2, tx0 + 0.2, tz1 - 0.2, ry); //   west
    railing(world, ctx, tx0 + 0.2, tz1 - 0.2, sx0, tz1 - 0.2, ry); //         south, west of stairs
    railing(world, ctx, sx1, tz1 - 0.2, tx1 - 0.2, tz1 - 0.2, ry); //         south, east of stairs
    railing(world, ctx, tx1 - 0.2, tz0 + 0.2, tx1 - 0.2, rz0, ry); //         east, north of ramp
    railing(world, ctx, tx1 - 0.2, rz1, tx1 - 0.2, tz1 - 0.2, ry); //         east, south of ramp
    world.addProp('bench', tx0 + 5, tTop, tz0 + 3, 0, 1);
    world.addProp('bench', tx0 + 12, tTop, tz0 + 3, 0, 1);
    world.addProp('planter', tx0 + 4, tTop, tz0 + 11, 0, 1);
    world.addProp('palm', tx0 + 4, tTop + 0.7, tz0 + 11, 1.2, 0.8);
    sign(world, { x: sx0 - 1.2, y: base + 1.4, z: tz1 + 0.02, yaw: 0, w: 2.4, h: 1.0, lines: ['OBSERVATION TERRACE', 'Stairs · Ramp'], style: 'plaque' });

    // --- North-east: the parkour test ground.
    const wood = VH.col(0xa87a4a);
    const px0 = cx + 8;
    const crateZ0 = iz0 + 3;
    const crateZ1 = crateZ0 + 1.8;
    const heights = [0.5, 1.0, 1.5, 2.0];
    heights.forEach((h, i) => {
      const x0 = px0 + i * 1.9;
      solidBox(world, ctx.wood, x0, base, crateZ0, x0 + 1.8, base + h, crateZ1, wood, { uvScale: 2 }, 'crate');
    });
    // A 3.4 m wall: too tall to climb from the ground, reachable from the top crate.
    const wallX0 = px0 + heights.length * 1.9;
    solidBox(world, ctx.concrete, wallX0, base, crateZ0 - 1.2, wallX0 + 2.2, base + 3.4, crateZ1 + 1.2, VH.col(0x9a948a), { uvScale: 4 }, 'wall');
    sign(world, { x: px0 + 3.8, y: base + 1.2, z: crateZ1 + 0.9, yaw: 0, w: 3.6, h: 1.3,
      lines: ['CLIMBING TEST', 'Run at a crate and press JUMP', 'to climb up. Top crate → big wall.'], style: 'info' });
    // Vault walls of increasing height.
    const walls = [0.6, 1.0, 1.4];
    walls.forEach((h, i) => {
      const z0 = iz0 + 12 + i * 5;
      solidBox(world, ctx.concrete, px0, base, z0, px0 + 6, base + h, z0 + 0.4, VH.col(0xb3ada3), { uvScale: 4 }, 'wall');
    });
    sign(world, { x: px0 + 9.2, y: base + 1.2, z: iz0 + 17, yaw: -Math.PI / 2, w: 3.4, h: 1.3,
      lines: ['VAULT TEST', 'Low walls: JUMP while running', 'to vault. 0.6 m · 1.0 m · 1.4 m'], style: 'info' });
    // Loose boxes to jump across.
    for (let i = 0; i < 4; i++) {
      const bx = px0 + 1 + i * 3.2;
      const bz = iz0 + 30;
      solidBox(world, ctx.wood, bx, base, bz, bx + 1.2, base + 0.9, bz + 1.2, VH.colMul(wood, 0.9 + i * 0.05), { uvScale: 2 }, 'crate');
    }

    // --- South: the arrival area (Jay spawns here, facing north).
    const vendY = base;
    const vendZ = iz1 - 1.2;
    const vendX = [ix1 - 9, ix1 - 7.6];
    for (const vx of vendX) vendingMachine(world, ctx, vx, vendY, vendZ, Math.PI);
    kiosk(world, ctx, cx - 9, base, iz1 - 6, 0);
    sign(world, { x: cx, y: base + 3.2, z: iz1 - 0.6, yaw: Math.PI, w: 9, h: 2.2, lines: ['WELCOME TO', 'VICEHAVEN'], style: 'welcome', posts: true });

    // Lamps inside the plaza, facing in.
    world.addProp('streetlight', ix0 + 26, base, iz1 - 2, Math.PI, 1);
    world.addProp('streetlight', ix1 - 20, base, iz1 - 2, Math.PI, 1);
    world.addProp('streetlight', ix0 + 30, base, iz0 + 1.5, 0, 1);
    world.addProp('bench', cx + 14, base, iz1 - 3, Math.PI, 1);
    world.addProp('bin', cx + 16, base, iz1 - 3, 0, 1);
    world.addProp('bench', cx - 16, base, cz + 10, Math.PI / 2, 1);
    for (let i = 0; i < 6; i++) world.addProp('bollard', ix0 + 30 + i * 2.2, base, iz1 - 0.5, 0, 1);
  }

  function vendingMachine(world, ctx, x, y, z, yaw) {
    // Modelled facing +Z, then rotated by yaw (only 0 or PI are used here).
    const flip = Math.cos(yaw) < 0 ? -1 : 1;
    const body = VH.col(0xc9302c);
    const hw = 0.5;
    const hd = 0.42;
    ctx.propMatte.box(x - hw, y, z - hd, x + hw, y + 1.95, z + hd, body, { top: VH.col(0x8f1f1c) });
    // Glowing front panel.
    const fz = z + flip * (hd + 0.01);
    const panel = VH.col(0xfff2d6);
    const logo = VH.col(0xffb347);
    if (flip > 0) {
      ctx.screen.quad([x - 0.42, y + 0.8, fz], [x + 0.2, y + 0.8, fz], [x + 0.2, y + 1.8, fz], [x - 0.42, y + 1.8, fz], [0, 0, 1], panel);
      ctx.screen.quad([x + 0.26, y + 1.5, fz], [x + 0.44, y + 1.5, fz], [x + 0.44, y + 1.8, fz], [x + 0.26, y + 1.8, fz], [0, 0, 1], logo);
    } else {
      ctx.screen.quad([x + 0.42, y + 0.8, fz], [x - 0.2, y + 0.8, fz], [x - 0.2, y + 1.8, fz], [x + 0.42, y + 1.8, fz], [0, 0, -1], panel);
      ctx.screen.quad([x - 0.26, y + 1.5, fz], [x - 0.44, y + 1.5, fz], [x - 0.44, y + 1.8, fz], [x - 0.26, y + 1.8, fz], [0, 0, -1], logo);
    }
    world.physics.addBox(x - hw, 0, z - hd, x + hw, y + 1.95, z + hd, 'vending');
    world.interactables.push({
      id: 'vending_' + Math.round(x * 10) + '_' + Math.round(z * 10),
      kind: 'vending',
      x, y: y + 1.0, z: z + flip * 1.1,
      radius: 1.4,
      label: 'Buy a Sunfizz soda',
      price: 2,
      heal: 15,
    });
    sign(world, { x, y: y + 2.18, z: fz + flip * 0.01, yaw, w: 0.95, h: 0.34, lines: ['SUNFIZZ'], style: 'brand' });
  }

  function kiosk(world, ctx, x, y, z, yaw) {
    const metal = VH.col(0x2d3a4a);
    ctx.prop.box(x - 0.08, y, z - 0.08, x + 0.08, y + 2.4, z + 0.08, metal);
    ctx.prop.box(x - 1.3, y + 1.0, z - 0.12, x + 1.3, y + 2.5, z + 0.12, metal);
    world.physics.addBox(x - 1.3, 0, z - 0.15, x + 1.3, y + 2.5, z + 0.15, 'kiosk', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
    sign(world, { x, y: y + 1.75, z: z + 0.13, yaw, w: 2.4, h: 1.35,
      lines: ['CITY GUIDE', 'Press E to read', 'Civic Plaza · Downtown'], style: 'info' });
    sign(world, { x, y: y + 1.75, z: z - 0.13, yaw: yaw + Math.PI, w: 2.4, h: 1.35,
      lines: ['CITY GUIDE', 'Press E to read', 'Civic Plaza · Downtown'], style: 'info' });
    for (const side of [1, -1]) {
      world.interactables.push({
        id: 'kiosk_' + side, kind: 'kiosk', x, y: y + 1, z: z + side * 1.0, radius: 1.6, label: 'Read the city guide',
      });
    }
  }

  // ------------------------------------------------------- Founders Park
  function buildPark(world, block) {
    const ctx = world.ctxAt(block.cx, block.cz);
    const ix0 = block.minX + 4;
    const ix1 = block.maxX - 4;
    const iz0 = block.minZ + 4;
    const iz1 = block.maxZ - 4;
    const cx = (ix0 + ix1) / 2;
    const cz = (iz0 + iz1) / 2;
    const white = VH.col(0xffffff);
    const lawnTop = KERB;
    // Paths (a cross) meeting at a square around the fountain; lawn everywhere else.
    const pathTop = KERB;
    const pw = 2;
    const sq = 11;
    const paths = [
      { minX: cx - pw, maxX: cx + pw, minZ: iz0, maxZ: cz - sq },
      { minX: cx - pw, maxX: cx + pw, minZ: cz + sq, maxZ: iz1 },
      { minX: ix0, maxX: cx - sq, minZ: cz - pw, maxZ: cz + pw },
      { minX: cx + sq, maxX: ix1, minZ: cz - pw, maxZ: cz + pw },
      { minX: cx - sq, maxX: cx + sq, minZ: cz - sq, maxZ: cz + sq },
    ];
    let lawn = [{ minX: ix0, maxX: ix1, minZ: iz0, maxZ: iz1 }];
    for (const p of paths) {
      lawn = VH.World.subtractRect(lawn, p);
      ctx.plazaTop.topRect(p.minX, p.minZ, p.maxX, p.maxZ, KERB, VH.col(0xe8e0d0), 4);
    }
    for (const r of lawn) {
      ctx.grassTop.topRect(r.minX, r.minZ, r.maxX, r.maxZ, KERB, white, 6);
      world.addLawn(r.minX, r.minZ, r.maxX, r.maxZ);
    }

    // Fountain: a solid stone basin with the water at its brim, a column and a bowl.
    const stone = VH.col(0xcfc6b6);
    ctx.propMatte.cylinder(cx, pathTop, cz, 6.2, 6.0, 0.6, 24, stone, true, VH.colMul(stone, 0.8));
    ctx.propMatte.cylinder(cx, pathTop + 0.6, cz, 0.7, 0.55, 1.8, 10, stone, true);
    ctx.propMatte.cylinder(cx, pathTop + 2.4, cz, 1.2, 2.0, 0.45, 16, stone, true);
    world.fountains = world.fountains || [];
    world.fountains.push({ x: cx, y: pathTop + 0.6, z: cz, r: 5.7 });
    // The rim is solid; inside, the floor is lower so you wade knee-deep.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const yaw = -a - Math.PI / 2; // local X runs along the rim
      world.physics.addOrientedBox(cx + Math.cos(a) * 5.95, cz + Math.sin(a) * 5.95, 2.5, 0.3, yaw, 0, pathTop + 0.6, 'fountain');
      world.physics.addOrientedBox(cx + Math.cos(a) * 2.9, cz + Math.sin(a) * 2.9, 2.4, 2.9, yaw, 0, pathTop + 0.2, 'fountain');
    }
    world.physics.addBox(cx - 0.7, 0, cz - 0.7, cx + 0.7, pathTop + 2.85, cz + 0.7, 'fountain');

    // Gazebo in the north-east lawn.
    const gx = cx + 20;
    const gz = cz - 20;
    const white2 = VH.col(0xf1ede4);
    ctx.propMatte.cylinder(gx, lawnTop, gz, 4.2, 4.0, 0.3, 12, VH.col(0xd9d1c3), true);
    world.physics.addBox(gx - 3.6, 0, gz - 3.6, gx + 3.6, lawnTop + 0.3, gz + 3.6, 'gazebo');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = gx + Math.cos(a) * 3.4;
      const pz = gz + Math.sin(a) * 3.4;
      ctx.propMatte.cylinder(px, lawnTop + 0.3, pz, 0.16, 0.14, 3.0, 8, white2, false);
      world.physics.addBox(px - 0.18, 0, pz - 0.18, px + 0.18, lawnTop + 3.3, pz + 0.18, 'gazebo');
    }
    ctx.propMatte.cylinder(gx, lawnTop + 3.3, gz, 4.6, 4.6, 0.25, 12, white2, false);
    ctx.propMatte.cylinder(gx, lawnTop + 3.55, gz, 4.6, 0.3, 2.2, 12, VH.col(0x5f7d6e), true);
    world.physics.addBox(gx - 3.8, lawnTop + 3.3, gz - 3.8, gx + 3.8, lawnTop + 5.6, gz + 3.8, 'gazebo');

    // Trees on the lawns, benches and lamps along the paths.
    const rng = new VH.RNG('founders-park');
    let trees = 0;
    for (let i = 0; i < 120 && trees < 22; i++) {
      const x = rng.range(ix0 + 3, ix1 - 3);
      const z = rng.range(iz0 + 3, iz1 - 3);
      if (Math.abs(x - cx) < pw + 3 || Math.abs(z - cz) < pw + 3) continue;
      if (Math.abs(x - cx) < sq + 3 && Math.abs(z - cz) < sq + 3) continue;
      if (Math.hypot(x - gx, z - gz) < 8) continue;
      world.addProp(rng.chance(0.3) ? 'palm' : rng.chance(0.5) ? 'tree' : 'treeB', x, lawnTop, z, rng.range(0, 6.28), rng.range(0.9, 1.35));
      trees++;
    }
    // Benches beside the paths, facing them.
    for (const t of [0.45, 0.8]) {
      const along = ((iz1 - iz0) / 2) * t;
      world.addProp('bench', cx + pw + 1.0, lawnTop, cz - along, -Math.PI / 2, 1);
      world.addProp('bench', cx + pw + 1.0, lawnTop, cz + along, -Math.PI / 2, 1);
      world.addProp('bench', cx - along, lawnTop, cz + pw + 1.0, Math.PI, 1);
      world.addProp('bench', cx + along, lawnTop, cz + pw + 1.0, Math.PI, 1);
    }
    // Lamps, their arms reaching over the paths.
    for (const [x, z, yaw] of [
      [cx - pw - 0.6, iz0 + 12, Math.PI / 2], [cx + pw + 0.6, iz1 - 12, -Math.PI / 2],
      [ix0 + 12, cz + pw + 0.6, Math.PI], [ix1 - 12, cz - pw - 0.6, 0],
      [cx - sq + 1, cz - sq + 1, Math.PI / 4], [cx + sq - 1, cz + sq - 1, -3 * Math.PI / 4],
    ]) {
      world.addProp('streetlight', x, lawnTop, z, yaw, 0.8);
    }
    sign(world, { x: cx - pw - 2.6, y: KERB + 1.3, z: iz1 - 0.4, yaw: 0, w: 3.2, h: 1.1, lines: ['FOUNDERS PARK', 'Open dawn to dusk'], style: 'park', posts: true });
  }

  // ---------------------------------------------------- Vicehaven Tower
  function buildTowerBlock(world, block) {
    const ctx = world.ctxAt(block.cx, block.cz);
    const ix0 = block.minX + 4;
    const ix1 = block.maxX - 4;
    const iz0 = block.minZ + 4;
    const iz1 = block.maxZ - 4;
    ctx.plazaTop.topRect(ix0, iz0, ix1, iz1, KERB, VH.col(0xe6e1d8), 4);
    const top = VH.Buildings.buildVicehavenTower(ctx, block);
    world.stats.tallest = Math.max(world.stats.tallest, top);
    world.stats.buildings++;
    for (const x of [ix0 + 3, ix1 - 3]) {
      for (const z of [iz0 + 3, iz1 - 3]) world.addProp('planter', x, KERB, z, 0, 1);
    }
    for (const x of [block.cx - 12, block.cx + 12]) world.addProp('palm', x, KERB, iz1 - 2.5, 0.5, 1);
    sign(world, { x: block.cx, y: KERB + 1.0, z: iz1 - 0.5, yaw: 0, w: 6, h: 1.1, lines: ['VICEHAVEN TOWER'], style: 'monolith' });
  }

  // --------------------------------------------------------- waterfront
  function buildWaterfront(world, layout) {
    const wf = layout.waterfront;
    const cfg = layout.config;
    const b = cfg.bounds;
    const road = cfg.lines[cfg.lines.length - 1] + 7; // east kerb of Seawall Drive
    const sea = wf.seawallX;
    const pier = wf.pier;
    const z0 = cfg.lines[0] - 7;
    const z1 = cfg.lines[cfg.lines.length - 1] + 7;

    for (let z = z0; z < z1; z += 48) {
      const za = z;
      const zb = Math.min(z1, z + 48);
      const ctx = world.ctxAt((road + sea) / 2, (za + zb) / 2);
      // Pavement along the road, then the timber boardwalk.
      ctx.concrete.box(road, 0, za, road + 4, KERB, zb, VH.col(0xcfcac0), { skip: { top: true, n: za > z0, s: zb < z1 } });
      ctx.sidewalk.topRect(road, za, road + 4, zb, KERB, VH.col(0xffffff), 3);
      ctx.wood.box(road + 4, 0, za, sea, KERB, zb, VH.col(0xffffff), { skip: { n: za > z0, s: zb < z1, e: true }, uvScale: 2 });
      world.physics.addBox(road, -0.5, za, sea, KERB, zb, 'boardwalk');
    }

    // Harbor Beach: a strip of sand under the seawall south of the pier, down
    // a flight of steps from the boardwalk, with a bonfire ring and driftwood.
    // places.js puts 'harbor_beach' at beach.spot.
    const beach = (wf.beach = {
      x0: sea + 0.5, x1: sea + 22, z0: -104, z1: -24, stairZ0: -64, stairZ1: -60, sandY: -0.45,
      fire: { x: sea + 11, z: -50 }, spot: { x: sea + 8, z: -54 },
    });

    // Seawall with a raised coping, and the railing along it (open where the pier and the beach steps start).
    const gaps = [[pier.z0, pier.z1], [beach.stairZ0, beach.stairZ1]];
    for (let z = b.minZ; z < b.maxZ; z += 48) {
      const za = z;
      const zb = Math.min(b.maxZ, z + 48);
      const ctx = world.ctxAt(sea, (za + zb) / 2);
      let pieces = [[za, zb]];
      for (const [ga, gb] of gaps) {
        const next = [];
        for (const [pa, pb] of pieces) {
          if (pb <= ga || pa >= gb) next.push([pa, pb]);
          else {
            if (pa < ga) next.push([pa, ga]);
            if (pb > gb) next.push([gb, pb]);
          }
        }
        pieces = next;
      }
      ctx.concrete.box(sea - 0.3, -8, za, sea + 0.5, KERB + (pieces.length ? 0.02 : 0), zb, VH.col(0xa9a39a), { uvScale: 4 });
      for (const [pa, pb] of pieces) {
        ctx.concrete.box(sea - 0.35, KERB, pa, sea + 0.55, KERB + 0.14, pb, VH.col(0xd8d2c6), { uvScale: 4 });
        railing(world, ctx, sea, pa, sea, pb, KERB + 0.14, { height: 1.0 });
        invisibleWall(world, sea + 0.25, pa, sea + 0.9, pb);
      }
    }

    // The beach: dry sand, a darker wet strip lower down, fenced off from the bay.
    {
      const ctx = world.ctxAt((beach.x0 + beach.x1) / 2, (beach.z0 + beach.z1) / 2);
      const wet = beach.x1 - 5;
      const sy = beach.sandY;
      ctx.propMatte.box(beach.x0, -1.6, beach.z0, wet, sy, beach.z1, VH.col(0xe6d4a6));
      ctx.propMatte.box(wet, -1.6, beach.z0, beach.x1, sy - 0.3, beach.z1, VH.col(0xc2a878));
      world.physics.addBox(beach.x0, -2, beach.z0, wet, sy, beach.z1, 'sand');
      world.physics.addBox(wet, -2, beach.z0, beach.x1, sy - 0.3, beach.z1, 'sand');
      invisibleWall(world, beach.x1, beach.z0 - 1, beach.x1 + 1, beach.z1 + 1);
      invisibleWall(world, sea, beach.z0 - 1, beach.x1 + 1, beach.z0);
      invisibleWall(world, sea, beach.z1, beach.x1 + 1, beach.z1 + 1);
      // Steps down from the gap in the railing (the seawall top bridges the boardwalk to them).
      world.physics.addBox(sea, -1, beach.stairZ0, beach.x0, KERB + 0.02, beach.stairZ1, 'seawall');
      for (let i = 0; i < 3; i++) {
        const top = KERB - 0.15 * (i + 1);
        const xa = beach.x0 + i * 0.6;
        ctx.concrete.box(xa, -1.2, beach.stairZ0, xa + 0.6, top, beach.stairZ1, VH.col(0xbdb7ac), { uvScale: 4 });
        world.physics.addBox(xa, -1.2, beach.stairZ0, xa + 0.6, top, beach.stairZ1, 'stairs');
      }
      // Bonfire ring: stones, charred logs and a bed of embers.
      const f = beach.fire;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const sx = f.x + Math.cos(a) * 0.9;
        const sz = f.z + Math.sin(a) * 0.9;
        ctx.propMatte.box(sx - 0.16, sy, sz - 0.14, sx + 0.16, sy + 0.2 + (i % 3) * 0.04, sz + 0.14, VH.col(0x77726b));
      }
      ctx.propMatte.box(f.x - 0.6, sy, f.z - 0.09, f.x + 0.6, sy + 0.16, f.z + 0.09, VH.col(0x2b211b));
      ctx.propMatte.box(f.x - 0.09, sy + 0.1, f.z - 0.55, f.x + 0.09, sy + 0.26, f.z + 0.55, VH.col(0x2b211b));
      ctx.screen.box(f.x - 0.4, sy + 0.01, f.z - 0.4, f.x + 0.4, sy + 0.07, f.z + 0.4, VH.col(0xff6a20, 1.5));
      // Driftwood to sit on round it (low enough to step over).
      ctx.propMatte.box(f.x - 3.2, sy, f.z - 1.3, f.x - 2.8, sy + 0.36, f.z + 1.4, VH.col(0x9c8b74));
      ctx.propMatte.box(f.x - 1.2, sy, f.z + 2.6, f.x + 1.5, sy + 0.34, f.z + 3.0, VH.col(0x8f7f69));
      ctx.propMatte.box(f.x + 2.7, sy, f.z - 1.6, f.x + 3.1, sy + 0.32, f.z + 0.9, VH.col(0xa39079));
    }

    // Lamps, palms and benches along the boardwalk.
    for (let z = z0 + 10; z < z1 - 6; z += 24) {
      world.addProp('streetlight', sea - 1.4, KERB, z, -Math.PI / 2, 1);
      if (Math.abs(z) > 12) world.addProp('bench', sea - 2.2, KERB, z + 12, Math.PI / 2, 1);
    }
    // The Velvet Tide: an open-air club on the boardwalk just north of the pier.
    const club = (wf.club = {
      x0: road + 6, x1: sea - 6, z0: 15, z1: 45, doorZ0: 28, doorZ1: 31, wallH: 6,
    });
    club.floor = { x0: club.x0 + 5, x1: club.x0 + 15, z0: 24.5, z1: 34.5 };
    club.stage = { x0: club.x1 - 4, x1: club.x1 - 0.4, z0: 22, z1: 37, top: KERB + 0.9 };
    club.bar = { x0: club.x0 + 3, x1: club.x0 + 14, z0: 40.6, z1: 41.4 };
    club.vip = { x1: club.x0 + 15, z1: 19.2, top: 2.8, stairW: 2.2, stairZ: 23.4 };
    buildClub(world, club);

    for (let z = z0 + 4; z < z1 - 4; z += 22) {
      if (Math.abs(z) < 10) continue;
      if (z > club.z0 - 2 && z < club.z1 + 2) continue; // the club stands here
      world.addProp('palmTall', road + 17, KERB, z, z * 0.37, 0.9 + ((z * 7) % 3) * 0.08);
    }
    for (let z = z0 + 8; z < z1 - 7; z += 30) world.addProp('streetlight', road + 0.7, KERB, z, -Math.PI / 2, 1);

    // Oceanview Pier.
    const deckTop = KERB;
    for (let x = pier.x0; x < pier.x1; x += 48) {
      const xa = x;
      const xb = Math.min(pier.x1, x + 48);
      const ctx = world.ctxAt((xa + xb) / 2, 0);
      ctx.wood.box(xa, deckTop - 0.45, pier.z0, xb, deckTop, pier.z1, VH.col(0xf2e6d6), { uvScale: 2, bottom: true, skip: { w: xa > pier.x0, e: xb < pier.x1 } });
      world.physics.addBox(xa, deckTop - 0.45, pier.z0, xb, deckTop, pier.z1, 'pier');
      for (let px = xa + 2; px < xb; px += 8) {
        for (const pz of [pier.z0 + 0.5, pier.z1 - 0.5, 0]) {
          ctx.propMatte.cylinder(px, -8, pz, 0.3, 0.3, 8 + deckTop - 0.45, 8, VH.col(0x5b4a3a), false);
        }
      }
      railing(world, ctx, xa, pier.z0 + 0.15, xb, pier.z0 + 0.15, deckTop, { color: 0xe8e4dc });
      railing(world, ctx, xa, pier.z1 - 0.15, xb, pier.z1 - 0.15, deckTop, { color: 0xe8e4dc });
    }
    const endCtx = world.ctxAt(pier.x1 - 10, 0);
    railing(world, endCtx, pier.x1 - 0.15, pier.z0, pier.x1 - 0.15, pier.z1, deckTop, { color: 0xe8e4dc });
    invisibleWall(world, pier.x0 + 0.5, pier.z0 - 1.2, pier.x1 + 1, pier.z0 + 0.1);
    invisibleWall(world, pier.x0 + 0.5, pier.z1 - 0.1, pier.x1 + 1, pier.z1 + 1.2);
    invisibleWall(world, pier.x1 - 0.1, pier.z0 - 1.2, pier.x1 + 1.2, pier.z1 + 1.2);

    // The pier café at the far end.
    const hx0 = pier.x1 - 20;
    const hx1 = pier.x1 - 8;
    const hz0 = -3.5;
    const hz1 = 3.5;
    const hut = VH.col(0xa8e0d8);
    const F = { wall: hut, style: 4, ww: 0.8, wh: 0.75, bay: 3, floorH: 3.4, seed: 7.7 };
    const bld = endCtx.b;
    bld.wall([hx0, deckTop, hz0], 0, 1, hz1 - hz0, 3.4, hut, null, [0, 2, 0, 1], [F.ww, F.wh, F.style, F.seed]);
    bld.wall([hx1, deckTop, hz1], 0, -1, hz1 - hz0, 3.4, hut, null, [0, 2, 0, 1], [0, 0, 0, 7.7]);
    bld.wall([hx0, deckTop, hz1], 1, 0, hx1 - hx0, 3.4, hut, null, [0, 4, 0, 1], [F.ww, F.wh, F.style, F.seed]);
    bld.wall([hx1, deckTop, hz0], -1, 0, hx1 - hx0, 3.4, hut, null, [0, 4, 0, 1], [F.ww, F.wh, F.style, F.seed]);
    endCtx.propMatte.box(hx0 - 0.6, deckTop + 3.4, hz0 - 0.6, hx1 + 0.6, deckTop + 3.7, hz1 + 0.6, VH.col(0xf5f0e6), { bottom: true });
    endCtx.propMatte.box(hx0 - 1.6, deckTop + 2.7, hz0, hx0, deckTop + 2.85, hz1, VH.col(0xff6f91), { bottom: true });
    world.physics.addBox(hx0, 0, hz0, hx1, deckTop + 3.7, hz1, 'building');
    sign(world, { x: hx0 - 0.05, y: deckTop + 3.05, z: 0, yaw: -Math.PI / 2, w: 4.6, h: 0.7, lines: ['PIER CAFÉ'], style: 'neon' });
    for (let x = pier.x0 + 12; x < hx0 - 4; x += 16) {
      world.addProp('streetlight', x, deckTop, pier.z0 + 0.7, Math.PI, 0.75);
      world.addProp('streetlight', x + 8, deckTop, pier.z1 - 0.7, 0, 0.75);
      world.addProp('bench', x + 4, deckTop, pier.z1 - 1.3, 0, 1);
      world.addProp('bench', x + 12, deckTop, pier.z0 + 1.3, Math.PI, 1);
    }
    sign(world, { x: pier.x0 + 1.5, y: deckTop + 3.6, z: 0, yaw: -Math.PI / 2, w: 8, h: 1.4, lines: ['OCEANVIEW PIER'], style: 'neon', arch: pier.z1 - pier.z0 });
    const archCtx = world.ctxAt(pier.x0 + 2, 0);
    for (const pz of [pier.z0 + 0.6, pier.z1 - 0.6]) {
      archCtx.prop.box(pier.x0 + 1.3, deckTop, pz - 0.2, pier.x0 + 1.7, deckTop + 4.4, pz + 0.2, VH.col(0xf5f0e6));
      world.physics.addBox(pier.x0 + 1.3, 0, pz - 0.2, pier.x0 + 1.7, deckTop + 4.4, pz + 0.2, 'arch');
    }
    archCtx.prop.box(pier.x0 + 1.3, deckTop + 4.3, pier.z0 + 0.4, pier.x0 + 1.7, deckTop + 4.6, pier.z1 - 0.4, VH.col(0xf5f0e6), { bottom: true });

    // The bay.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), world.materials.water);
    water.rotation.x = -Math.PI / 2;
    const span = 9000;
    water.scale.set(span, span, 1);
    water.position.set(sea + span / 2 - 0.2, wf.waterLevel, 0);
    water.name = 'bay';
    water.receiveShadow = false;
    world.root.add(water);
    world.water = water;
  }


  // ----------------------------------------------------- The Velvet Tide
  /**
   * An open-air dance club on the boardwalk north of the pier: walls with a
   * door onto Seawall Drive, a DJ stage, a juice bar under a canopy, and a
   * VIP balcony up a flight of stairs. The moving parts (the light-up dance
   * floor, the beams, the music, the people) are club.js.
   */
  function buildClub(world, c) {
    const ctx = world.ctxAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2);
    const y0 = KERB;
    const H = c.wallH;
    const T = 0.4;
    const wall = VH.col(0x1b1630);
    const trim = VH.col(0x2c2448);
    const add = (x0, ya, z0, x1, yb, z1, color, solid) => {
      ctx.propMatte.box(x0, ya, z0, x1, yb, z1, color);
      if (solid) world.physics.addBox(x0, Math.min(ya, 0), z0, x1, yb, z1, 'club');
    };
    // Walls (the west one has the door, under a header).
    add(c.x0, 0, c.z0, c.x0 + T, H, c.doorZ0, wall, true);
    add(c.x0, 0, c.doorZ1, c.x0 + T, H, c.z1, wall, true);
    ctx.propMatte.box(c.x0, 3.3, c.doorZ0, c.x0 + T, H, c.doorZ1, wall);
    world.physics.addBox(c.x0, 3.3, c.doorZ0, c.x0 + T, H, c.doorZ1, 'club');
    add(c.x1 - T, 0, c.z0, c.x1, H, c.z1, wall, true);
    add(c.x0, 0, c.z1 - T, c.x1, H, c.z1, wall, true);
    add(c.x0, 0, c.z0, c.x1, H, c.z0 + T, wall, true);
    // A cap along the top of the walls.
    for (const [a, b, d, e] of [[c.x0 - 0.1, c.z0 - 0.1, c.x1 + 0.1, c.z0 + T + 0.1], [c.x0 - 0.1, c.z1 - T - 0.1, c.x1 + 0.1, c.z1 + 0.1], [c.x0 - 0.1, c.z0, c.x0 + T + 0.1, c.z1], [c.x1 - T - 0.1, c.z0, c.x1 + 0.1, c.z1]]) {
      ctx.propMatte.box(a, H, b, d, H + 0.25, e, trim);
    }
    // A dark floor over the boardwalk boards.
    ctx.propMatte.box(c.x0 + T, y0, c.z0 + T, c.x1 - T, y0 + 0.012, c.z1 - T, VH.col(0x14111d));

    const ix0 = c.x0 + T;
    const ix1 = c.x1 - T;
    const iz0 = c.z0 + T;
    const iz1 = c.z1 - T;
    const neonPink = VH.col(0xff3d8b);
    const neonCyan = VH.col(0x37e6ff);
    const neonGold = VH.col(0xffc247);
    // Neon strips round the inside of the walls, and round the door outside.
    // (Corners listed left to right as seen from behind the glow: wound so the lit face points along n.)
    const strip = (pts, n, col) => ctx.screen.quad(pts[1], pts[0], pts[3], pts[2], n, col);
    const ny = 4.6;
    const nh = 0.12;
    strip([[ix0, ny, iz1 - 0.01], [ix1, ny, iz1 - 0.01], [ix1, ny + nh, iz1 - 0.01], [ix0, ny + nh, iz1 - 0.01]], [0, 0, -1], neonPink);
    strip([[ix1, ny, iz0 + 0.01], [ix0, ny, iz0 + 0.01], [ix0, ny + nh, iz0 + 0.01], [ix1, ny + nh, iz0 + 0.01]], [0, 0, 1], neonPink);
    strip([[ix1 - 0.01, ny, iz1], [ix1 - 0.01, ny, iz0], [ix1 - 0.01, ny + nh, iz0], [ix1 - 0.01, ny + nh, iz1]], [-1, 0, 0], neonCyan);
    strip([[ix0 + 0.01, ny, iz0], [ix0 + 0.01, ny, iz1], [ix0 + 0.01, ny + nh, iz1], [ix0 + 0.01, ny + nh, iz0]], [1, 0, 0], neonCyan);
    const ox = c.x0 - 0.01;
    for (const [za, zb, ya, yb] of [[c.doorZ0 - 0.25, c.doorZ0 - 0.1, y0, 3.45], [c.doorZ1 + 0.1, c.doorZ1 + 0.25, y0, 3.45], [c.doorZ0 - 0.25, c.doorZ1 + 0.25, 3.3, 3.45]]) {
      strip([[ox, ya, zb], [ox, ya, za], [ox, yb, za], [ox, yb, zb]], [-1, 0, 0], neonPink);
    }
    sign(world, { x: c.x0 - 0.17, y: H + 1.1, z: (c.doorZ0 + c.doorZ1) / 2, yaw: -Math.PI / 2, w: 9, h: 1.9, lines: ['VELVET TIDE'], style: 'neon' });
    ctx.propMatte.box(c.x0 - 0.12, H - 0.2, (c.doorZ0 + c.doorZ1) / 2 - 4.7, c.x0, H + 2.2, (c.doorZ0 + c.doorZ1) / 2 + 4.7, VH.col(0x0b0d18));
    // A cyan band along the front, and neon up the two front corners.
    for (const [za, zb] of [[c.z0, c.doorZ0 - 0.4], [c.doorZ1 + 0.4, c.z1]]) {
      strip([[ox, 4.9, zb], [ox, 4.9, za], [ox, 5.04, za], [ox, 5.04, zb]], [-1, 0, 0], neonCyan);
      strip([[ox, 1.0, zb], [ox, 1.0, za], [ox, 1.08, za], [ox, 1.08, zb]], [-1, 0, 0], neonPink);
    }
    for (const z of [c.z0 + 0.05, c.z1 - 0.2]) strip([[ox, y0, z + 0.15], [ox, y0, z], [ox, H, z], [ox, H, z + 0.15]], [-1, 0, 0], neonPink);
    // An awning over the door.
    ctx.propMatte.box(c.x0 - 1.6, 3.55, c.doorZ0 - 1.2, c.x0, 3.75, c.doorZ1 + 1.2, VH.col(0x6b1f3d));
    strip([[c.x0 - 1.61, 3.55, c.doorZ1 + 1.2], [c.x0 - 1.61, 3.55, c.doorZ0 - 1.2], [c.x0 - 1.61, 3.75, c.doorZ0 - 1.2], [c.x0 - 1.61, 3.75, c.doorZ1 + 1.2]], [-1, 0, 0], neonGold);

    // The DJ stage at the back, a console, and stacks of speakers.
    const st = c.stage;
    add(st.x0, 0, st.z0, st.x1, st.top, st.z1, VH.col(0x221b38), true);
    strip([[st.x0 - 0.01, st.top - 0.12, st.z1], [st.x0 - 0.01, st.top - 0.12, st.z0], [st.x0 - 0.01, st.top - 0.02, st.z0], [st.x0 - 0.01, st.top - 0.02, st.z1]], [-1, 0, 0], neonGold);
    const cz = (st.z0 + st.z1) / 2;
    add(st.x0 + 0.6, st.top, cz - 2, st.x0 + 1.4, st.top + 1.0, cz + 2, VH.col(0x0f0f14), true);
    strip([[st.x0 + 0.59, st.top + 0.55, cz + 1.8], [st.x0 + 0.59, st.top + 0.55, cz - 1.8], [st.x0 + 0.59, st.top + 0.9, cz - 1.8], [st.x0 + 0.59, st.top + 0.9, cz + 1.8]], [-1, 0, 0], neonCyan);
    for (const z of [st.z0 + 0.2, st.z1 - 1.6]) {
      add(st.x1 - 2.0, st.top, z, st.x1 - 0.2, st.top + 2.8, z + 1.4, VH.col(0x101014), true);
      for (const yy of [0.55, 1.45, 2.3]) ctx.propMatte.box(st.x1 - 2.06, st.top + yy - 0.32, z + 0.38, st.x1 - 2.0, st.top + yy + 0.32, z + 1.02, VH.col(0x2a2a33));
    }

    // The juice bar along the north wall, under a canopy.
    const bar = c.bar;
    add(bar.x0, 0, bar.z0, bar.x1, y0 + 1.1, bar.z1, VH.col(0x3a2a55), true);
    ctx.propMatte.box(bar.x0 - 0.1, y0 + 1.1, bar.z0 - 0.15, bar.x1 + 0.1, y0 + 1.16, bar.z1 + 0.1, VH.col(0xd9d2e8));
    strip([[bar.x0, y0 + 0.9, bar.z0 - 0.01], [bar.x1, y0 + 0.9, bar.z0 - 0.01], [bar.x1, y0 + 1.0, bar.z0 - 0.01], [bar.x0, y0 + 1.0, bar.z0 - 0.01]], [0, 0, -1], neonPink);
    add(bar.x0, 0, iz1 - 0.6, bar.x1, 2.5, iz1, VH.col(0x241c36), true);
    // Rows of bright bottles on the back shelf.
    for (const yy of [1.25, 1.85]) {
      for (let x = bar.x0 + 0.3; x < bar.x1 - 0.2; x += 0.42) {
        const col = [neonCyan, neonGold, neonPink, VH.col(0x9dff6b)][Math.floor(x * 7 + yy * 3) % 4];
        strip([[x, yy, iz1 - 0.61], [x + 0.18, yy, iz1 - 0.61], [x + 0.18, yy + 0.38, iz1 - 0.61], [x, yy + 0.38, iz1 - 0.61]], [0, 0, -1], col);
      }
    }
    ctx.propMatte.box(ix0, 5.0, bar.z0 - 1.2, ix1, 5.2, iz1, VH.col(0x2a2240));

    // The VIP balcony on the south side, up a flight of stairs by the door.
    const v = c.vip;
    add(ix0, 0, iz0, v.x1, v.top, v.z1, VH.col(0x201a33), true);
    strip([[v.x1, v.top - 0.14, v.z1 + 0.01], [ix0 + v.stairW, v.top - 0.14, v.z1 + 0.01], [ix0 + v.stairW, v.top - 0.04, v.z1 + 0.01], [v.x1, v.top - 0.04, v.z1 + 0.01]], [0, 0, 1], neonGold);
    railing(world, ctx, ix0 + v.stairW, v.z1 - 0.1, v.x1 - 0.1, v.z1 - 0.1, v.top, { color: 0xc9a45c });
    railing(world, ctx, v.x1 - 0.1, iz0, v.x1 - 0.1, v.z1 - 0.1, v.top, { color: 0xc9a45c });
    // The stairs: a ramp underfoot, steps to look at.
    const s0 = v.z1;
    const s1 = v.stairZ;
    world.physics.addRamp(ix0 + v.stairW / 2, (s0 + s1) / 2, v.stairW / 2, (s1 - s0) / 2, Math.PI, 0, y0, v.top, 'club');
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const za = s1 - ((i + 1) * (s1 - s0)) / steps;
      ctx.propMatte.box(ix0, 0, za, ix0 + v.stairW, y0 + ((i + 0.5) * (v.top - y0)) / steps, za + (s1 - s0) / steps, VH.col(i % 2 ? 0x2a2342 : 0x302848));
    }
    // A solid side to the stairs, so the VIP rope at the bottom can't just be walked round.
    add(ix0 + v.stairW, 0, s0, ix0 + v.stairW + 0.12, v.top + 1.05, s1 + 0.1, VH.col(0x2a2342), true);
    strip([[ix0 + v.stairW + 0.13, v.top + 0.9, s0], [ix0 + v.stairW + 0.13, v.top + 0.9, s1 + 0.1], [ix0 + v.stairW + 0.13, v.top + 1.0, s1 + 0.1], [ix0 + v.stairW + 0.13, v.top + 1.0, s0]], [1, 0, 0], neonGold);
    // Lounge sofas and a low table up there.
    for (const x of [v.x1 - 9, v.x1 - 5]) {
      add(x, v.top, iz0 + 0.1, x + 3, v.top + 0.45, iz0 + 1.0, VH.col(0x6b1f3d), true);
      ctx.propMatte.box(x, v.top + 0.45, iz0 + 0.1, x + 3, v.top + 1.0, iz0 + 0.3, VH.col(0x6b1f3d));
    }
    add(v.x1 - 7.2, v.top, iz0 + 1.6, v.x1 - 5.8, v.top + 0.4, iz0 + 2.4, VH.col(0x111015), true);
    sign(world, { x: (ix0 + v.x1) / 2 + 2, y: v.top + 1.6, z: iz0 + 0.02, yaw: 0, w: 2.6, h: 0.8, lines: ['VIP'], style: 'neon' });

    // A lighting truss across the top.
    for (const z of [c.floor.z0 + 1, (c.floor.z0 + c.floor.z1) / 2, c.floor.z1 - 1]) {
      ctx.propMatte.box(c.floor.x0 - 1.5, 5.55, z - 0.1, c.floor.x1 + 1.5, 5.75, z + 0.1, VH.col(0x4a4a55));
    }
    // Velvet ropes along the queue outside.
    for (const z of [c.doorZ0 - 3.5, c.doorZ0 - 2, c.doorZ1 + 2, c.doorZ1 + 3.5]) {
      ctx.prop.cylinder(c.x0 - 1.3, y0, z, 0.05, 0.05, 1.0, 8, VH.col(0xd4af37), false);
    }
    ctx.propMatte.box(c.x0 - 1.33, y0 + 0.82, c.doorZ0 - 3.5, c.x0 - 1.27, y0 + 0.88, c.doorZ0 - 2, VH.col(0x8b0f2e));
    ctx.propMatte.box(c.x0 - 1.33, y0 + 0.82, c.doorZ1 + 2, c.x0 - 1.27, y0 + 0.88, c.doorZ1 + 3.5, VH.col(0x8b0f2e));
  }

  VH.Landmarks = { buildPlaza, buildPark, buildTowerBlock, buildWaterfront };
})();
