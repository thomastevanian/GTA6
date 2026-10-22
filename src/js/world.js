/*
 * world.js — turns the city layout into things you can see and bump into.
 *
 * The map is cut into 192 m chunks. Everything static in a chunk is poured
 * into one GeometryBuilder per material and becomes a single mesh, so the
 * whole city draws in a few hundred calls, and three.js frustum-culls whole
 * chunks at once. Props are instanced per chunk (props.js) and hidden by
 * distance. Chunks are also the unit later phases stream in and out.
 *
 * Building is asynchronous and time-sliced: the loading bar keeps moving
 * and the tab never freezes while ~600 buildings are generated.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const CHUNK = 192;
  const ORIGIN = -768;
  const KERB = 0.15;

  /** Which builder channels each surface uses, and how its mesh is drawn. */
  const SURFACES = {
    building: { opts: { grid: true, facade: true }, mat: 'building', cast: true, receive: true },
    road: { opts: { uv: true, uvScale: 6 }, mat: 'road', cast: false, receive: true },
    marks: { opts: {}, mat: 'markings', cast: false, receive: true },
    decal: { opts: {}, mat: 'decal', cast: false, receive: true },
    sidewalk: { opts: { uv: true, uvScale: 3 }, mat: 'sidewalk', cast: false, receive: true },
    plaza: { opts: { uv: true, uvScale: 4 }, mat: 'plaza', cast: false, receive: true },
    grass: { opts: { uv: true, uvScale: 6 }, mat: 'grass', cast: false, receive: true },
    grassTop: { opts: { uv: true, uvScale: 6 }, mat: 'grassTop', cast: false, receive: true },
    plazaTop: { opts: { uv: true, uvScale: 4 }, mat: 'plazaTop', cast: false, receive: true },
    asphaltTop: { opts: { uv: true, uvScale: 6 }, mat: 'asphaltTop', cast: false, receive: true },
    concrete: { opts: { uv: true, uvScale: 4 }, mat: 'concrete', cast: true, receive: true },
    wood: { opts: { uv: true, uvScale: 2 }, mat: 'wood', cast: true, receive: true },
    prop: { opts: {}, mat: 'prop', cast: true, receive: true },
    propMatte: { opts: {}, mat: 'propMatte', cast: true, receive: true },
    hedge: { opts: {}, mat: 'foliage', cast: true, receive: true },
    screen: { opts: {}, mat: 'emissiveScreen', cast: false, receive: false },
    // Inside a roofed room (the corner shops): lit like the street, never in the roof's shadow.
    interior: { opts: {}, mat: 'prop', cast: false, receive: false },
  };

  function chunkIndex(v) {
    return Math.floor((v - ORIGIN) / CHUNK);
  }

  /** Remove `hole` from each rectangle in `rects`, splitting as needed. */
  function subtractRect(rects, hole) {
    const out = [];
    for (const r of rects) {
      if (hole.maxX <= r.minX || hole.minX >= r.maxX || hole.maxZ <= r.minZ || hole.minZ >= r.maxZ) {
        out.push(r);
        continue;
      }
      if (hole.minZ > r.minZ) out.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: hole.minZ });
      if (hole.maxZ < r.maxZ) out.push({ minX: r.minX, maxX: r.maxX, minZ: hole.maxZ, maxZ: r.maxZ });
      const z0 = Math.max(r.minZ, hole.minZ);
      const z1 = Math.min(r.maxZ, hole.maxZ);
      if (hole.minX > r.minX) out.push({ minX: r.minX, maxX: hole.minX, minZ: z0, maxZ: z1 });
      if (hole.maxX < r.maxX) out.push({ minX: hole.maxX, maxX: r.maxX, minZ: z0, maxZ: z1 });
    }
    return out;
  }

  class World {
    constructor(scene, materials, physics, settings) {
      this.scene = scene;
      this.materials = materials;
      this.physics = physics;
      this.settings = settings;
      this.chunks = new Map();
      this.root = new THREE.Group();
      this.root.name = 'world';
      scene.add(this.root);
      this.props = new VH.PropSystem(materials, physics, settings);
      this.interactables = [];
      this.beacons = [];
      this.lawns = []; // rectangles of grass (for footstep sounds)
      this.lamps = []; // street lamps (for the night-time light pools in fx.js)
      this.layout = null;
      this.stats = { buildings: 0, lots: 0, tallest: 0, triangles: 0, meshes: 0 };
      this._signalTimer = 0;
      this._signalPhase = 0;
      this.signalState = { ns: 'green', ew: 'red' };
      this._beaconTime = 0;
    }

    // ------------------------------------------------------------ chunks
    chunkAt(x, z) {
      const ix = chunkIndex(x);
      const iz = chunkIndex(z);
      const key = ix + ',' + iz;
      let c = this.chunks.get(key);
      if (!c) {
        const group = new THREE.Group();
        group.name = 'chunk ' + key;
        c = { key, ix, iz, group, builders: {}, ctx: null };
        c.center = { x: ORIGIN + (ix + 0.5) * CHUNK, z: ORIGIN + (iz + 0.5) * CHUNK };
        this.chunks.set(key, c);
        this.root.add(group);
      }
      return c;
    }

    builder(chunk, surface) {
      let b = chunk.builders[surface];
      if (!b) b = chunk.builders[surface] = new VH.GeometryBuilder(SURFACES[surface].opts);
      return b;
    }

    /** Everything a generator needs to add to the chunk that contains (x, z). */
    ctxAt(x, z) {
      const chunk = this.chunkAt(x, z);
      if (chunk.ctx) return chunk.ctx;
      const world = this;
      const lazy = (surface) => ({
        get() {
          return world.builder(chunk, surface);
        },
      });
      const ctx = {
        chunk,
        physics: this.physics,
        addProp: (type, px, pz, yaw, scale, y) => this.addProp(type, px, y === undefined ? KERB : y, pz, yaw, scale),
        addBeacon: (bx, by, bz) => this.beacons.push({ x: bx, y: by, z: bz }),
        addInteractable: (def) => this.interactables.push(def),
        addLawn: (x0, z0, x1, z1) => this.addLawn(x0, z0, x1, z1),
      };
      Object.defineProperties(ctx, {
        b: lazy('building'),
        asphalt: lazy('road'),
        road: lazy('road'),
        marks: lazy('marks'),
        decal: lazy('decal'),
        sidewalk: lazy('sidewalk'),
        plaza: lazy('plaza'),
        grass: lazy('grass'),
        grassTop: lazy('grassTop'),
        plazaTop: lazy('plazaTop'),
        asphaltTop: lazy('asphaltTop'),
        concrete: lazy('concrete'),
        wood: lazy('wood'),
        prop: lazy('prop'),
        propMatte: lazy('propMatte'),
        hedge: lazy('hedge'),
        screen: lazy('screen'),
        interior: lazy('interior'),
      });
      chunk.ctx = ctx;
      return ctx;
    }

    addLawn(minX, minZ, maxX, maxZ) {
      this.lawns.push({ minX, minZ, maxX, maxZ });
    }

    /** Surface name for footsteps, from the collider underfoot and the lawn map. */
    surfaceAt(x, z, col) {
      const tag = col ? col.tag : 'ground';
      switch (tag) {
        case 'road':
          return 'asphalt';
        case 'boardwalk':
        case 'pier':
        case 'crate':
        case 'plank':
        case 'scaffold':
          return 'wood';
        case 'container':
        case 'beam':
        case 'metal':
          return 'metal';
        case 'dirt':
          return 'gravel';
        case 'ground':
          return x > -391 && x < 391 && z > -391 && z < 391 ? 'asphalt' : 'grass';
        default:
          break;
      }
      for (const r of this.lawns) {
        if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return 'grass';
      }
      return 'concrete';
    }

    addProp(type, x, y, z, yaw, scale, group) {
      if (type === 'streetlight') this.lamps.push({ x, z, yaw: yaw || 0 });
      const chunk = this.chunkAt(x, z);
      this.props.add(chunk.key, type, x, y, z, yaw, scale, group);
    }

    // ------------------------------------------------------------- build
    async build(layout, onProgress) {
      this.layout = layout;
      const slicer = VH.util.createTimeSlicer(14);
      const progress = (p, label) => onProgress && onProgress(p, label);
      const physics = this.physics;
      const cfg = layout.config;

      // Terrain: flat city, sea floor beyond the seawall.
      physics.terrain = (x) => (x > cfg.seawallX ? -8 : 0);

      progress(0.02, 'Surveying the outskirts');
      this._buildGround(layout);
      await slicer.tick();

      progress(0.06, 'Paving the streets');
      let n = 0;
      for (const seg of layout.segments) {
        this._buildSegment(seg);
        if (++n % 12 === 0) await slicer.tick();
      }
      for (const j of layout.intersections) {
        this._buildIntersection(j);
        if (++n % 20 === 0) await slicer.tick();
      }

      progress(0.14, 'Raising the city');
      const blocks = layout.blocks;
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        this._buildBlock(block);
        progress(0.14 + 0.66 * ((i + 1) / blocks.length), 'Raising ' + block.district.name);
        await slicer.tick();
      }

      progress(0.82, 'Building the waterfront');
      VH.Landmarks.buildWaterfront(this, layout);
      await slicer.tick();
      progress(0.84, 'Stacking containers in Saltmarsh');
      if (VH.Docks) this.docks = VH.Docks.build(this, layout);
      await slicer.tick();
      progress(0.85, 'Watering the lawns in Crestline');
      if (VH.Estates) this.estates = VH.Estates.build(this, layout);
      await slicer.tick();
      // Beyond the old city limits: Northgate Heights, the airport, the fort.
      progress(0.852, 'Topping out Northgate Heights');
      if (VH.Skyline) this.skyline = VH.Skyline.build(this, layout);
      await slicer.tick();
      progress(0.855, 'Painting the runway');
      if (VH.Airfield) this.airfield = VH.Airfield.build(this, layout);
      await slicer.tick();
      progress(0.858, 'Fencing off Fort Breakwater');
      if (VH.Fort) this.fort = VH.Fort.build(this, layout);
      await slicer.tick();
      // The roads out of town: roadside strips (suburbs.js) and direction signs (roadsigns.js).
      progress(0.859, 'Opening the motels on the airport road');
      if (VH.Suburbs) this.suburbs = VH.Suburbs.build(this, layout);
      if (VH.RoadSigns) this.roadsigns = VH.RoadSigns.build(this, layout);
      await slicer.tick();

      progress(0.86, 'Planting palms and street lights');
      this._buildBoundary(layout);
      this._buildOutskirtsTrees(layout);
      for (const beacon of this.beacons) this.addProp('beacon', beacon.x, beacon.y, beacon.z, 0, 1);
      await slicer.tick();

      this._buildSigns();
      this._buildFountains();

      progress(0.9, 'Merging geometry');
      let meshes = 0;
      let tris = 0;
      for (const chunk of this.chunks.values()) {
        for (const surface of Object.keys(chunk.builders)) {
          const b = chunk.builders[surface];
          if (b.isEmpty) continue;
          const spec = SURFACES[surface];
          const geo = b.build();
          const mesh = new THREE.Mesh(geo, this.materials[spec.mat]);
          mesh.castShadow = spec.cast;
          mesh.receiveShadow = spec.receive;
          if (surface === 'hedge') mesh.customDepthMaterial = this.materials.foliageDepth;
          mesh.name = surface + ' ' + chunk.key;
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          chunk.group.add(mesh);
          meshes++;
          tris += geo.index.count / 3;
          chunk.builders[surface] = null;
        }
        chunk.builders = {};
        await slicer.tick();
      }
      progress(0.96, 'Placing street furniture');
      const groups = new Map();
      for (const chunk of this.chunks.values()) groups.set(chunk.key, chunk.group);
      this.props.build(groups);
      this.stats.meshes = meshes;
      this.stats.triangles = tris;
      this.stats.props = this.props.count;
      this.stats.colliders = physics.count;
      this.props.setSignalState(this.signalState);
      progress(1, 'City ready');
    }

    // ------------------------------------------------------------ ground
    _buildGround(layout) {
      const cfg = layout.config;
      const lines = cfg.lines;
      const edge = lines[lines.length - 1] + 7;
      const far = 2600;
      let rects = [{ minX: -far, maxX: cfg.seawallX, minZ: -far, maxZ: far }];
      // The city core is fully paved.
      rects = subtractRect(rects, { minX: -edge, maxX: cfg.seawallX, minZ: -edge, maxZ: edge });
      // Roads that run out into the countryside.
      for (const seg of layout.segments) {
        if (seg.minX < -edge || seg.maxX > edge || seg.minZ < -edge || seg.maxZ > edge) rects = subtractRect(rects, seg);
      }
      const white = VH.col(0xffffff);
      for (const r of rects) {
        // Split into chunk-sized tiles so each lands in (and is culled with) its chunk.
        for (let x = r.minX; x < r.maxX; x += CHUNK) {
          for (let z = r.minZ; z < r.maxZ; z += CHUNK) {
            const x1 = Math.min(r.maxX, x + CHUNK);
            const z1 = Math.min(r.maxZ, z + CHUNK);
            // Tiles far outside the playable area are not worth a chunk each.
            const ctx = this.ctxAt(VH.math.clamp((x + x1) / 2, -900, 900), VH.math.clamp((z + z1) / 2, -900, 900));
            ctx.grass.topRect(x, z, x1, z1, 0, white, 6);
          }
        }
      }
    }

    // ------------------------------------------------------------- roads
    /** Map a road-local rectangle (along the road, across it) to world XZ. */
    static _roadRect(road, a0, a1, c0, c1) {
      if (road.axis === 'z') return [road.coord + c0, a0, road.coord + c1, a1];
      return [a0, road.coord + c0, a1, road.coord + c1];
    }

    _buildSegment(seg) {
      const road = seg.road;
      const ctx = this.ctxAt((seg.minX + seg.maxX) / 2, (seg.minZ + seg.maxZ) / 2);
      const tone = 0.94 + VH.math.hash2(Math.round(seg.minX), Math.round(seg.minZ)) * 0.1;
      ctx.road.topRect(seg.minX, seg.minZ, seg.maxX, seg.maxZ, 0, [tone, tone, tone]);
      this.physics.addBox(seg.minX, -1, seg.minZ, seg.maxX, 0, seg.maxZ, 'road', VH.COLLIDE.SOLID);

      const W = road.width;
      const M = road.median;
      const half = W / 2;
      const n = road.lanesPerDirection;
      const laneW = (half - M / 2 - 0.5) / n;
      const a = seg.from;
      const b = seg.to;
      const CW = 4.2; // crossing band incl. margins
      const sj = seg.startsAtJunction;
      const ej = seg.endsAtJunction;
      const WHITE = VH.col(0xe9e7df);
      const YELLOW = VH.col(0xe0b12e);
      const mark = (a0, a1, c0, c1, col) => {
        if (a1 - a0 < 0.05) return;
        const r = World._roadRect(road, a0, a1, c0, c1);
        ctx.marks.topRect(r[0], r[1], r[2], r[3], 0.005, col);
      };
      const lineStart = a + (sj ? CW + 1.4 : 0);
      const lineEnd = b - (ej ? CW + 1.4 : 0);

      // Edge lines.
      for (const s of [-1, 1]) {
        const c = s * (half - 0.4);
        mark(a + (sj ? CW : 0), b - (ej ? CW : 0), c - 0.075, c + 0.075, WHITE);
      }
      // Centre line (double yellow) where there's no median.
      if (M === 0) {
        mark(lineStart, lineEnd, -0.22, -0.1, YELLOW);
        mark(lineStart, lineEnd, 0.1, 0.22, YELLOW);
      }
      // Dashed lane dividers.
      for (let k = 1; k < n; k++) {
        const off = M / 2 + k * laneW;
        for (const s of [-1, 1]) {
          for (let p = lineStart + 1; p < lineEnd - 1; p += 8) {
            mark(p, Math.min(p + 3, lineEnd - 1), s * off - 0.07, s * off + 0.07, WHITE);
          }
        }
      }
      // Stop lines. On avenues the +across (east) lanes head north (towards `from`);
      // on streets the +across (south) lanes head east (towards `to`).
      const posApproachStart = road.axis === 'z';
      const stop = (atStart, c0, c1) => {
        if (atStart && sj) mark(a + CW + 0.3, a + CW + 0.85, c0, c1, WHITE);
        if (!atStart && ej) mark(b - CW - 0.85, b - CW - 0.3, c0, c1, WHITE);
      };
      stop(posApproachStart, M / 2 + 0.2, half - 0.4);
      stop(!posApproachStart, -half + 0.4, -M / 2 - 0.2);

      // Zebra crossings at junction ends.
      const zebra = (a0, a1) => {
        for (let c = -half + 0.8; c < half - 0.8; c += 1.2) mark(a0, a1, c, c + 0.6, WHITE);
      };
      if (sj) zebra(a + 0.7, a + CW - 0.6);
      if (ej) zebra(b - CW + 0.6, b - 0.7);

      // Raised, planted median.
      if (M > 0) {
        const m0 = a + (sj ? CW + 0.4 : 0);
        const m1 = b - (ej ? CW + 0.4 : 0);
        if (m1 - m0 > 2) {
          const r = World._roadRect(road, m0, m1, -M / 2, M / 2);
          ctx.concrete.box(r[0], 0, r[1], r[2], KERB, r[3], VH.col(0xc9c4b8), { skip: { top: true } });
          ctx.grass.topRect(r[0], r[1], r[2], r[3], KERB, VH.col(0xffffff), 6);
          this.addLawn(r[0], r[1], r[2], r[3]);
          this.physics.addBox(r[0], -0.5, r[1], r[2], KERB, r[3], 'kerb');
          const spacing = road.coord === 0 ? 16 : 20;
          for (let p = m0 + spacing / 2; p < m1 - 2; p += spacing) {
            const px = road.axis === 'z' ? road.coord : p;
            const pz = road.axis === 'z' ? p : road.coord;
            const type = road.axis === 'z' ? 'palmTall' : (Math.round(p / spacing) % 2 ? 'tree' : 'treeB');
            this.addProp(type, px, KERB, pz, VH.math.hash2(Math.round(p), 7) * 6.28, 0.9 + VH.math.hash2(Math.round(p), 3) * 0.25);
          }
        }
      }
      // Roads out of town that just stop end at barriers (not where they meet
      // another road, and not at the fort's gate).
      const limit = this.layout.config.cityBounds || this.layout.config.bounds;
      const outEnd = road.axis === 'z' && !ej && b >= limit.maxZ - 30;
      const outStart = !sj && !road.openStart && a <= (road.axis === 'z' ? limit.minZ : limit.minX) + 30;
      if (outEnd || outStart) {
        const p = outEnd ? b - 1 : a + 1;
        for (let c = -half + 2; c <= half - 2; c += 3.8) {
          const px = road.axis === 'z' ? road.coord + c : p;
          const pz = road.axis === 'z' ? p : road.coord + c;
          this.addProp('barrier', px, 0, pz, road.axis === 'z' ? 0 : Math.PI / 2, 1);
        }
      }
    }

    _buildIntersection(j) {
      const ctx = this.ctxAt(j.x, j.z);
      const x0 = j.x - j.halfX;
      const x1 = j.x + j.halfX;
      const z0 = j.z - j.halfZ;
      const z1 = j.z + j.halfZ;
      ctx.road.topRect(x0, z0, x1, z1, 0, [0.97, 0.97, 0.97]);
      this.physics.addBox(x0, -1, z0, x1, 0, z1, 'road', VH.COLLIDE.SOLID);
      if (!j.signal) return;
      const off = 1.0;
      const nsArm = j.halfX > 8 ? 'signal11' : 'signal6';
      const ewArm = j.halfZ > 8 ? 'signal11' : 'signal6';
      // Only on real pavement (junctions on the edge of town have open ground on one side).
      const edge = this.layout.config.lines[this.layout.config.lines.length - 1] + 7;
      const onPavement = (x, z) => x > -edge && x < this.layout.config.seawallX && z > -edge && z < edge;
      const pole = (type, x, z, yaw, group) => {
        if (onPavement(x, z)) this.addProp(type, x, KERB, z, yaw, 1, group);
      };
      // Each pole stands on the far-right corner for the traffic it controls.
      pole(nsArm, x1 + off, z0 - off, -Math.PI / 2, 'ns'); // northbound
      pole(nsArm, x0 - off, z1 + off, Math.PI / 2, 'ns'); //  southbound
      pole(ewArm, x1 + off, z1 + off, Math.PI, 'ew'); //       eastbound
      pole(ewArm, x0 - off, z0 - off, 0, 'ew'); //             westbound
    }

    // ------------------------------------------------------------ blocks
    _buildBlock(block) {
      const ctx = this.ctxAt(block.cx, block.cz);
      const { minX, maxX, minZ, maxZ } = block;
      // Pavement slab with kerbs.
      ctx.concrete.box(minX, 0, minZ, maxX, KERB, maxZ, VH.col(0xcfcac0), { skip: { top: true } });
      ctx.sidewalk.topRect(minX, minZ, maxX, maxZ, KERB, VH.col(0xffffff), 3);
      this.physics.addBox(minX, -0.5, minZ, maxX, KERB, maxZ, 'kerb');

      if (block.kind === 'plaza') VH.Landmarks.buildPlaza(this, block);
      else if (block.kind === 'park') VH.Landmarks.buildPark(this, block);
      else if (block.kind === 'tower') VH.Landmarks.buildTowerBlock(this, block);
      else if (block.kind === 'construction') VH.Construction.build(this, block);
      else {
        if (block.alley) this._buildAlley(ctx, block);
        for (const lot of block.lots) {
          const lctx = this.ctxAt(lot.cx, lot.cz);
          // A corner shop (stores.js) stands on some of the car parks.
          const top = lot.store && VH.Stores ? VH.Stores.buildLot(this, lctx, lot) : VH.Buildings.buildLot(lctx, lot);
          lot.top = top || 0;
          if (top > 0) this.stats.buildings++;
          this.stats.tallest = Math.max(this.stats.tallest, top || 0);
        }
        this.stats.lots += block.lots.length;
      }
      this._streetFurniture(block);
    }

    _buildAlley(ctx, block) {
      const a = block.alley;
      ctx.asphaltTop.topRect(a.minX, a.minZ, a.maxX, a.maxZ, KERB, VH.col(0xbdbdbd), 6);
      const rng = new VH.RNG(block.id + 'alley');
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        if (a.axis === 'x') {
          const x = rng.range(a.minX + 8, a.maxX - 8);
          const side = rng.chance(0.5) ? a.minZ + 0.9 : a.maxZ - 0.9;
          this.addProp('dumpster', x, KERB, side, 0, 1);
        } else {
          const z = rng.range(a.minZ + 8, a.maxZ - 8);
          const side = rng.chance(0.5) ? a.minX + 0.9 : a.maxX - 0.9;
          this.addProp('dumpster', side, KERB, z, Math.PI / 2, 1);
        }
      }
    }

    /** Street lights, trees, hydrants, benches and bins along a block's pavements. */
    _streetFurniture(block) {
      const rng = new VH.RNG(block.id + 'furniture');
      const d = block.district.id;
      const alley = block.alley;
      const inAlley = (x, z) => alley && x > alley.minX - 3 && x < alley.maxX + 3 && z > alley.minZ - 3 && z < alley.maxZ + 3;
      const edges = [
        { side: 'n', a0: block.minX, a1: block.maxX, fixed: block.minZ, inward: 1, yaw: Math.PI, alongX: true },
        { side: 's', a0: block.minX, a1: block.maxX, fixed: block.maxZ, inward: -1, yaw: 0, alongX: true },
        { side: 'w', a0: block.minZ, a1: block.maxZ, fixed: block.minX, inward: 1, yaw: -Math.PI / 2, alongX: false },
        { side: 'e', a0: block.minZ, a1: block.maxZ, fixed: block.maxX, inward: -1, yaw: Math.PI / 2, alongX: false },
      ];
      const treeType = d === 'palmcrescent' ? 'palm' : d === 'oldmarket' ? 'tree' : d === 'harborpoint' ? 'palmTall' : 'palm';
      const treeSpacing = d === 'palmcrescent' ? 18 : 30;
      const treeChance = d === 'oldmarket' ? 0.45 : d === 'downtown' ? 0.75 : 0.9;
      const noTrees = block.kind === 'plaza' || block.kind === 'tower' || block.kind === 'construction';
      edges.forEach((e, ei) => {
        const pos = (along, inset) => (e.alongX ? [along, e.fixed + e.inward * inset] : [e.fixed + e.inward * inset, along]);
        const start = e.a0 + 8 + (ei % 2) * 15;
        for (let p = start; p < e.a1 - 7; p += 30) {
          const [x, z] = pos(p, 0.7);
          if (inAlley(x, z)) continue;
          this.addProp('streetlight', x, KERB, z, e.yaw, 1);
        }
        if (!noTrees) {
          for (let p = e.a0 + 8 + treeSpacing / 2 + (ei % 2) * 7; p < e.a1 - 7; p += treeSpacing) {
            if (!rng.chance(treeChance)) continue;
            const [x, z] = pos(p, 1.4);
            if (inAlley(x, z)) continue;
            this.addProp(treeType === 'tree' && rng.chance(0.5) ? 'treeB' : treeType, x, KERB, z, rng.range(0, 6.28), rng.range(0.8, 1.1));
          }
        }
        if (rng.chance(0.6)) {
          const [x, z] = pos(rng.range(e.a0 + 10, e.a1 - 10), 0.5);
          if (!inAlley(x, z)) this.addProp('hydrant', x, KERB, z, e.yaw, 1);
        }
        if (rng.chance(0.4)) {
          const p = rng.range(e.a0 + 12, e.a1 - 12);
          const [x, z] = pos(p, 2.9);
          if (!inAlley(x, z)) {
            this.addProp('bench', x, KERB, z, e.yaw, 1);
            const [bx, bz] = pos(p + 1.8, 2.9);
            this.addProp('bin', bx, KERB, bz, 0, 1);
          }
        }
      });
    }

    // ----------------------------------------------------- world edges
    _buildBoundary(layout) {
      const b = layout.config.bounds;
      const hedgeH = 2.6;
      const t = 1.6;
      const green = VH.col(0x355f2c);
      const segs = [
        { minX: b.minX - t, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ },
        { minX: b.minX, maxX: b.maxX, minZ: b.minZ - t, maxZ: b.minZ },
        { minX: b.minX, maxX: b.maxX, minZ: b.maxZ, maxZ: b.maxZ + t },
      ];
      for (const s of segs) {
        // Chunk-sized pieces of hedge.
        const alongX = s.maxX - s.minX > s.maxZ - s.minZ;
        const a0 = alongX ? s.minX : s.minZ;
        const a1 = alongX ? s.maxX : s.maxZ;
        for (let p = a0; p < a1; p += 48) {
          const q = Math.min(a1, p + 48);
          const r = alongX ? [p, s.minZ, q, s.maxZ] : [s.minX, p, s.maxX, q];
          const ctx = this.ctxAt((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
          ctx.hedge.box(r[0], 0, r[1], r[2], hedgeH, r[3], VH.colMul(green, 0.9 + VH.math.hash2(p, 1) * 0.2));
        }
        // An invisible wall well above the hedge so it can't be climbed.
        this.physics.addBox(s.minX, -2, s.minZ, s.maxX, 40, s.maxZ, 'boundary', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
      }
    }

    /**
     * Is (x, z) on a carriageway (widened by `margin`)? `skipAxis` leaves out
     * roads running that way: a lamp at the kerb of an x-running road only
     * cares about the cross streets it might stand in.
     */
    onRoad(x, z, margin, skipAxis, cityOnly) {
      const m = margin || 0;
      for (const r of this.layout.roads) {
        if (skipAxis && r.axis === skipAxis) continue;
        // cityOnly: the roads as they were inside the old city limits.
        if (cityOnly && r.isNew) continue;
        const from = cityOnly && r.cityFrom !== undefined ? r.cityFrom : r.from;
        const along = r.axis === 'z' ? z : x;
        if (along < from - m || along > r.to + m) continue;
        const across = r.axis === 'z' ? x - r.coord : z - r.coord;
        if (Math.abs(across) < r.width / 2 + m) return true;
      }
      return false;
    }

    _buildOutskirtsTrees(layout) {
      const cfg = layout.config;
      const zones = Object.values(cfg.zones || {});
      const inZone = (x, z, pad) => zones.some((r) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad);
      // The trees of the old outskirts, exactly where they always were (the
      // same random draws, judged against the old roads), minus the ones that
      // now stand on a new road or in Northgate Heights.
      const rng = new VH.RNG('outskirts-trees');
      const b = cfg.cityBounds || cfg.bounds;
      const edge = cfg.lines[cfg.lines.length - 1] + 12;
      let placed = 0;
      for (let i = 0; i < 900 && placed < 260; i++) {
        const x = rng.range(b.minX + 4, b.maxX - 4);
        const z = rng.range(b.minZ + 4, b.maxZ - 4);
        if (Math.abs(x) < edge && Math.abs(z) < edge) continue;
        if (x > 380) continue;
        // Keep clear of the roads leading out of town, and of every other road.
        if (Math.abs(x) < 20 || Math.abs(z) < 16) continue;
        if (this.onRoad(x, z, 3, null, true)) continue;
        const type = rng.chance(0.7) ? (rng.chance(0.5) ? 'tree' : 'treeB') : 'palm';
        const yaw = rng.range(0, 6.28);
        const scale = rng.range(0.8, 1.35);
        placed++;
        if (inZone(x, z, 6) || this.onRoad(x, z, 3)) continue;
        this.addProp(type, x, 0, z, yaw, scale);
      }
      // The new land: north to the airport, west to the fort.
      const all = cfg.bounds;
      const rng2 = new VH.RNG('outskirts-trees-2');
      let more = 0;
      for (let i = 0; i < 4000 && more < 620; i++) {
        const x = rng2.range(all.minX + 4, all.maxX - 4);
        const z = rng2.range(all.minZ + 4, all.maxZ - 4);
        if (x > b.minX - 6 && x < b.maxX + 6 && z > b.minZ - 6 && z < b.maxZ + 6) continue;
        if (x > 380 || inZone(x, z, 14) || this.onRoad(x, z, 5)) continue;
        const type = rng2.chance(0.75) ? (rng2.chance(0.5) ? 'tree' : 'treeB') : 'palm';
        this.addProp(type, x, 0, z, rng2.range(0, 6.28), rng2.range(0.8, 1.4));
        more++;
      }
    }

    // ------------------------------------------------------ signs, water
    _buildSigns() {
      this.signMaterials = [];
      for (const spec of this.signs || []) {
        const ctx = this.ctxAt(spec.x, spec.z);
        const tex = VH.Signs.paint(spec, this.materials._anisotropy || 4);
        const mat = new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex, emissive: new THREE.Color(0, 0, 0), roughness: 0.55, metalness: 0,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
        });
        mat.userData.neon = spec.style === 'neon' || spec.style === 'brand' || spec.style === 'road';
        this.signMaterials.push(mat);
        const fx = Math.sin(spec.yaw);
        const fz = Math.cos(spec.yaw);
        const depth = 0.1;
        if (spec.flat) {
          // Painted on the ground (a helipad, a bay number).
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), mat);
          mesh.rotation.set(-Math.PI / 2, 0, spec.yaw || 0);
          mesh.position.set(spec.x, spec.y, spec.z);
          mesh.receiveShadow = true;
          ctx.chunk.group.add(mesh);
          continue;
        }
        const faces = (spec.twoSided || spec.posts) && !spec.oneSided ? [1, -1] : [1];
        for (const side of faces) {
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), mat);
          const off = side > 0 ? depth / 2 + 0.002 : -(depth / 2 + 0.002);
          mesh.position.set(spec.x + fx * off, spec.y, spec.z + fz * off);
          mesh.rotation.y = spec.yaw + (side > 0 ? 0 : Math.PI);
          mesh.receiveShadow = true;
          mesh.name = 'sign ' + spec.lines[0];
          ctx.chunk.group.add(mesh);
        }
        // Backing board, and posts for free-standing signs.
        const frame = VH.col(spec.frame || 0x2b2f35);
        ctx.prop.orientedBox(spec.x, spec.z, spec.w / 2 + 0.06, depth / 2, spec.yaw, spec.y - spec.h / 2 - 0.06, spec.y + spec.h / 2 + 0.06, frame);
        if (spec.posts) {
          const bottom = 0;
          for (const s of [-1, 1]) {
            const px = spec.x + Math.cos(spec.yaw) * s * spec.w * 0.38;
            const pz = spec.z - Math.sin(spec.yaw) * s * spec.w * 0.38;
            ctx.prop.orientedBox(px, pz, 0.09, 0.09, spec.yaw, bottom, spec.y - spec.h / 2, frame);
            this.physics.addOrientedBox(px, pz, 0.12, 0.12, spec.yaw, -0.2, spec.y - spec.h / 2, 'sign', VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS);
          }
        }
      }
    }

    _buildFountains() {
      for (const f of this.fountains || []) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(f.r, 32), this.materials.fountainWater);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(f.x, f.y, f.z);
        disc.name = 'fountain water';
        this.chunkAt(f.x, f.z).group.add(disc);
      }
    }

    // ------------------------------------------------------------ queries
    districtAt(x, z) {
      return VH.CityGen.districtAt(x, z);
    }

    roadNameAt(x, z) {
      return VH.CityGen.roadNameAt(this.layout, x, z);
    }

    /** The named place at a point, if any (e.g. "Civic Plaza"). */
    placeAt(x, z) {
      for (const block of this.layout.blocks) {
        if (block.landmark && x >= block.minX && x <= block.maxX && z >= block.minZ && z <= block.maxZ) return block.landmark.name;
      }
      const pier = this.layout.waterfront.pier;
      if (x >= pier.x0 && x <= pier.x1 && z >= pier.z0 - 2 && z <= pier.z1 + 2) return 'Oceanview Pier';
      const bw = this.layout.waterfront.boardwalk;
      if (x >= bw.minX && x <= bw.maxX && z >= bw.minZ && z <= bw.maxZ) return 'The Boardwalk';
      return null;
    }

    // ------------------------------------------------------------ update
    update(dt, camPos) {
      this.props.update(dt, camPos);

      // Traffic signals cycle (Phase 5 traffic obeys this state).
      const PHASES = [
        { ns: 'green', ew: 'red', t: 14 },
        { ns: 'amber', ew: 'red', t: 3 },
        { ns: 'red', ew: 'red', t: 1.5 },
        { ns: 'red', ew: 'green', t: 14 },
        { ns: 'red', ew: 'amber', t: 3 },
        { ns: 'red', ew: 'red', t: 1.5 },
      ];
      this._signalTimer += dt;
      const cur = PHASES[this._signalPhase];
      if (this._signalTimer >= cur.t) {
        this._signalTimer = 0;
        this._signalPhase = (this._signalPhase + 1) % PHASES.length;
        const next = PHASES[this._signalPhase];
        this.signalState = { ns: next.ns, ew: next.ew };
        this.props.setSignalState(this.signalState);
      }

      // Aircraft warning lights blink.
      this._beaconTime += dt;
      const on = (this._beaconTime % 1.6) < 0.5;
      this.materials.beacon.color.setRGB(on ? 4 : 0.3, on ? 0.12 : 0.01, on ? 0.08 : 0.01);
    }

    /** Street lamps brighten as night falls. */
    setNightFactor(glow) {
      const g = 0.35 + glow * 5;
      this.materials.lampGlow.color.setRGB(1.0 * g, 0.86 * g, 0.62 * g);
      for (const m of this.signMaterials || []) {
        const e = m.userData.neon ? 0.55 + glow * 1.6 : glow * 0.7;
        m.emissive.setRGB(e, e, e);
      }
    }
  }

  World.CHUNK = CHUNK;
  World.KERB = KERB;
  World.subtractRect = subtractRect;
  VH.World = World;
})();
