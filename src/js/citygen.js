/*
 * citygen.js — lays out the city as pure data: roads, intersections,
 * blocks, lots and the waterfront. Nothing here touches three.js, so the
 * same layout later feeds traffic lanes, pedestrian paths, the minimap and
 * mission placement.
 *
 * Phase 1 builds the downtown core of Vicehaven: a 9 × 9 grid of avenues
 * (north–south) and streets (east–west) 96 m apart, with Grand Avenue and
 * Meridian Boulevard as wider boulevards, and the bay along the east side.
 * Phase 3 extends this layout with more districts, highways and bridges.
 */
(function () {
  'use strict';

  const VH = window.VH;

  const LINES = [-384, -288, -192, -96, 0, 96, 192, 288, 384];
  const SIDEWALK = 4;
  const LANE = 3.5;

  /** Roads outside the downtown grid (the docks, the estates, the airport, Northgate). */
  const EXTRA_ROADS = [
    { id: 'airport_rd', kind: 'street', axis: 'x', coord: -1180, width: 18, median: 2, name: 'Airport Road', from: -760, to: 340, isNew: true },
    { id: 'skyline_dr', kind: 'street', axis: 'x', coord: -512, width: 14, name: 'Skyline Drive', from: -96, to: 288, isNew: true },
    { id: 'crestline', kind: 'avenue', axis: 'z', coord: -510, width: 14, name: 'Crestline Drive', from: -380, to: 380 },
    // Westbrook (suburbs.js): two avenues between Anchor and Heron Streets, across Meridian Boulevard.
    { id: 'westbrook_ave', kind: 'avenue', axis: 'z', coord: -850, width: 14, name: 'Westbrook Avenue', from: -288, to: 288, isNew: true },
    { id: 'orchard_ave', kind: 'avenue', axis: 'z', coord: -1000, width: 14, name: 'Orchard Avenue', from: -288, to: 288, isNew: true },
    { id: 'harbor_rd', kind: 'street', axis: 'x', coord: 470, width: 16, name: 'Harbor Road', from: 0, to: 410 },
    { id: 'quay_st', kind: 'street', axis: 'x', coord: 580, width: 14, name: 'Quay Street', from: 0, to: 410 },
  ];

  const CONFIG = {
    lines: LINES,
    sidewalk: SIDEWALK,
    kerbHeight: 0.15,
    laneWidth: LANE,
    avenueWidth: (x) => (x === 0 ? 26 : 14),
    avenueMedian: (x) => (x === 0 ? 4 : 0),
    streetWidth: (z) => (z === 0 ? 18 : 14),
    streetMedian: (z) => (z === 0 ? 3 : 0),
    seawallX: 424,
    waterLevel: -1.1,
    // The playable world: the city, the airport to the north, Fort Breakwater to the west.
    bounds: { minX: -1600, maxX: 424, minZ: -1800, maxZ: 640 },
    // The old city limits (its outskirts trees and road-end barriers were laid out in these).
    cityBounds: { minX: -640, maxX: 424, minZ: -640, maxZ: 640 },
    // Ground kept clear of trees for the big new places (airfield.js, skyline.js, fort.js).
    zones: {
      northgate: { minX: -96, maxX: 300, minZ: -650, maxZ: -391 },
      airport: { minX: -1080, maxX: 380, minZ: -1560, maxZ: -1090 },
      fort: { minX: -1520, maxX: -1080, minZ: -420, maxZ: 420 },
      // Area 51 (area51.js): the empty ground between the fort and the west end of the airport.
      area51: { minX: -1600, maxX: -1100, minZ: -1750, maxZ: -480 },
      // The two stunt ramps north of Northgate Heights (activities.js).
      pasture: { minX: 30, maxX: 185, minZ: -840, maxZ: -765 },
    },
    pier: { x0: 424, x1: 588, z0: -7, z1: 7 },
  };

  function districtAt(x, z) {
    const list = VH.Data.districts;
    for (let i = 0; i < list.length; i++) {
      const r = list[i].rect;
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return list[i];
    }
    return list[list.length - 1];
  }

  function landmarkForBlock(bx, bz) {
    return VH.Data.landmarks.find((l) => l.block && l.block[0] === bx && l.block[1] === bz) || null;
  }

  /** Recursively split a rectangle into lots between min and max size. */
  function splitLots(rng, rect, lotCfg, out, depth) {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const canSplitX = w >= lotCfg.min * 2;
    const canSplitZ = d >= lotCfg.min * 2;
    const tooBig = w > lotCfg.max || d > lotCfg.max;
    if (depth > 7 || !tooBig || (!canSplitX && !canSplitZ)) {
      out.push(rect);
      return;
    }
    const alongX = canSplitX && (!canSplitZ || w > d || (w === d && rng.chance(0.5)));
    if (alongX) {
      const lo = rect.minX + lotCfg.min;
      const hi = rect.maxX - lotCfg.min;
      const cut = Math.round(VH.math.lerp(lo, hi, rng.range(0.3, 0.7)));
      splitLots(rng, { minX: rect.minX, maxX: cut, minZ: rect.minZ, maxZ: rect.maxZ }, lotCfg, out, depth + 1);
      splitLots(rng, { minX: cut, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ }, lotCfg, out, depth + 1);
    } else {
      const lo = rect.minZ + lotCfg.min;
      const hi = rect.maxZ - lotCfg.min;
      const cut = Math.round(VH.math.lerp(lo, hi, rng.range(0.3, 0.7)));
      splitLots(rng, { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: cut }, lotCfg, out, depth + 1);
      splitLots(rng, { minX: rect.minX, maxX: rect.maxX, minZ: cut, maxZ: rect.maxZ }, lotCfg, out, depth + 1);
    }
  }

  function generate(seed) {
    const rng = new VH.RNG(seed || 'vicehaven');
    const names = VH.Data.streetNames;
    const layout = {
      seed,
      config: CONFIG,
      roads: [],
      segments: [],
      intersections: [],
      blocks: [],
      lots: [],
      bounds: CONFIG.bounds,
    };

    // ------------------------------------------------------------ roads
    const minLine = LINES[0];
    const maxLine = LINES[LINES.length - 1];
    for (const x of LINES) {
      const w = CONFIG.avenueWidth(x);
      const road = {
        id: 'ave' + x, kind: 'avenue', axis: 'z', coord: x, width: w, median: CONFIG.avenueMedian(x),
        name: names.avenues[String(x)] || 'Avenue', from: minLine, to: maxLine,
      };
      // Grand Avenue carries on out of the grid: south to the docks, north
      // through Northgate Heights to the airport.
      if (x === 0) {
        road.cityFrom = -620;
        road.from = -1180;
        road.to = 620;
      }
      // Coral and Pelican Avenues run north to Skyline Drive.
      if (x === -96 || x === 288) {
        road.cityFrom = road.from;
        road.from = -512;
      }
      layout.roads.push(road);
    }
    for (const z of LINES) {
      const w = CONFIG.streetWidth(z);
      const road = {
        id: 'st' + z, kind: 'street', axis: 'x', coord: z, width: w, median: CONFIG.streetMedian(z),
        name: names.streets[String(z)] || 'Street', from: minLine, to: maxLine,
      };
      if (z === 0) {
        // Meridian Boulevard leads west out of town, to the gate of Fort Breakwater.
        road.cityFrom = -620;
        road.from = -1100;
        road.openStart = true; // the fort's gate, not a row of barriers
      }
      // Anchor and Heron Streets run west past Crestline Estates to Westbrook.
      if (z === -288 || z === 288) {
        road.cityFrom = -620;
        road.from = -1000;
      }
      layout.roads.push(road);
    }
    // Pelican Avenue carries on south into Saltmarsh Docks.
    const pelican = layout.roads.find((r) => r.axis === 'z' && r.coord === 288);
    if (pelican) pelican.to = 620;
    // Crestline Drive, through the estates; Harbor Road and Quay Street across the port.
    for (const extra of EXTRA_ROADS) {
      layout.roads.push(Object.assign({ median: 0 }, extra));
    }
    layout.zones = CONFIG.zones;
    for (const r of layout.roads) {
      const perDir = Math.max(1, Math.floor((r.width - r.median - 1) / 2 / LANE));
      r.lanesPerDirection = perDir;
    }
    const avenues = layout.roads.filter((r) => r.axis === 'z');
    const streets = layout.roads.filter((r) => r.axis === 'x');

    // ---------------------------------------------------- intersections
    for (const a of avenues) {
      for (const s of streets) {
        if (s.coord < a.from || s.coord > a.to || a.coord < s.from || a.coord > s.to) continue;
        const corner = (a.coord === minLine || a.coord === maxLine) && (s.coord === minLine || s.coord === maxLine);
        const inGrid = a.coord >= minLine && a.coord <= maxLine && s.coord >= minLine && s.coord <= maxLine;
        layout.intersections.push({
          id: 'x' + a.coord + '_' + s.coord,
          x: a.coord, z: s.coord,
          halfX: a.width / 2, halfZ: s.width / 2,
          avenue: a, street: s,
          signal: !corner && inGrid,
          // Cross-walks on every leg that has road beyond the junction.
          legs: {
            n: s.coord > a.from, s: s.coord < a.to,
            w: a.coord > s.from, e: a.coord < s.to,
          },
        });
      }
    }

    // --------------------------------------------------------- segments
    // The stretches of road between junctions (junction squares are drawn separately).
    for (const r of layout.roads) {
      const crossers = (r.axis === 'z' ? streets : avenues)
        .filter((c) => c.coord >= r.from && c.coord <= r.to && r.coord >= c.from && r.coord <= c.to)
        .sort((p, q) => p.coord - q.coord);
      const stops = [];
      let cursor = r.from;
      for (const c of crossers) {
        const edge0 = c.coord - c.width / 2;
        if (edge0 > cursor + 0.01) stops.push([cursor, edge0]);
        cursor = c.coord + c.width / 2;
      }
      if (r.to > cursor + 0.01) stops.push([cursor, r.to]);
      for (const [a, b] of stops) {
        const seg = { road: r, axis: r.axis, from: a, to: b };
        if (r.axis === 'z') {
          seg.minX = r.coord - r.width / 2;
          seg.maxX = r.coord + r.width / 2;
          seg.minZ = a;
          seg.maxZ = b;
        } else {
          seg.minZ = r.coord - r.width / 2;
          seg.maxZ = r.coord + r.width / 2;
          seg.minX = a;
          seg.maxX = b;
        }
        // Does this segment end at a junction (so it needs a stop line and crossing)?
        seg.startsAtJunction = crossers.some((c) => Math.abs(c.coord + c.width / 2 - a) < 0.01);
        seg.endsAtJunction = crossers.some((c) => Math.abs(c.coord - c.width / 2 - b) < 0.01);
        layout.segments.push(seg);
      }
    }

    // ----------------------------------------------------------- blocks
    for (let bx = 0; bx < LINES.length - 1; bx++) {
      for (let bz = 0; bz < LINES.length - 1; bz++) {
        const x0 = LINES[bx] + CONFIG.avenueWidth(LINES[bx]) / 2;
        const x1 = LINES[bx + 1] - CONFIG.avenueWidth(LINES[bx + 1]) / 2;
        const z0 = LINES[bz] + CONFIG.streetWidth(LINES[bz]) / 2;
        const z1 = LINES[bz + 1] - CONFIG.streetWidth(LINES[bz + 1]) / 2;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const district = districtAt(cx, cz);
        const landmark = landmarkForBlock(bx, bz);
        const block = {
          id: 'b' + bx + '_' + bz, bx, bz,
          minX: x0, maxX: x1, minZ: z0, maxZ: z1, cx, cz,
          district,
          kind: landmark ? landmark.kind : 'buildings',
          landmark,
          alley: null,
          lots: [],
        };
        if (block.kind === 'buildings') planBlock(block, rng.fork(block.id));
        layout.blocks.push(block);
        for (const lot of block.lots) layout.lots.push(lot);
      }
    }

    // ------------------------------------------------------- waterfront
    const east = maxLine + CONFIG.avenueWidth(maxLine) / 2;
    layout.waterfront = {
      promenade: { minX: east, maxX: CONFIG.seawallX, minZ: CONFIG.bounds.minZ, maxZ: CONFIG.bounds.maxZ },
      boardwalk: { minX: east + SIDEWALK, maxX: CONFIG.seawallX, minZ: minLine - 7, maxZ: maxLine + 7 },
      seawallX: CONFIG.seawallX,
      waterLevel: CONFIG.waterLevel,
      pier: CONFIG.pier,
    };

    // ------------------------------------------------------------ spawn
    const plaza = layout.blocks.find((b) => b.kind === 'plaza');
    layout.spawn = plaza
      ? { x: plaza.cx, y: CONFIG.kerbHeight, z: plaza.maxZ - 10, yaw: Math.PI }
      : { x: 0, y: 0.2, z: 40, yaw: Math.PI };
    layout.plazaBlock = plaza || null;

    layout.districtAt = districtAt;
    return layout;
  }

  /** Divide a building block into lots (and maybe a service alley). */
  function planBlock(block, rng) {
    const d = block.district;
    const inner = {
      minX: block.minX + SIDEWALK, maxX: block.maxX - SIDEWALK,
      minZ: block.minZ + SIDEWALK, maxZ: block.maxZ - SIDEWALK,
    };
    const areas = [];
    if (rng.chance(d.alleyChance)) {
      const w = 6;
      const alongX = rng.chance(0.5);
      if (alongX) {
        const mid = Math.round((inner.minZ + inner.maxZ) / 2 + rng.range(-6, 6));
        block.alley = { minX: block.minX, maxX: block.maxX, minZ: mid - w / 2, maxZ: mid + w / 2, axis: 'x' };
        areas.push({ minX: inner.minX, maxX: inner.maxX, minZ: inner.minZ, maxZ: mid - w / 2, alleySide: 's' });
        areas.push({ minX: inner.minX, maxX: inner.maxX, minZ: mid + w / 2, maxZ: inner.maxZ, alleySide: 'n' });
      } else {
        const mid = Math.round((inner.minX + inner.maxX) / 2 + rng.range(-6, 6));
        block.alley = { minX: mid - w / 2, maxX: mid + w / 2, minZ: block.minZ, maxZ: block.maxZ, axis: 'z' };
        areas.push({ minX: inner.minX, maxX: mid - w / 2, minZ: inner.minZ, maxZ: inner.maxZ, alleySide: 'e' });
        areas.push({ minX: mid + w / 2, maxX: inner.maxX, minZ: inner.minZ, maxZ: inner.maxZ, alleySide: 'w' });
      }
    } else {
      areas.push(Object.assign({ alleySide: null }, inner));
    }

    for (const area of areas) {
      const rects = [];
      splitLots(rng, area, d.lot, rects, 0);
      for (const r of rects) {
        const eps = 0.01;
        // Which sides face the street (touch the inner edge of the pavement)?
        const front = {
          n: Math.abs(r.minZ - inner.minZ) < eps,
          s: Math.abs(r.maxZ - inner.maxZ) < eps,
          w: Math.abs(r.minX - inner.minX) < eps,
          e: Math.abs(r.maxX - inner.maxX) < eps,
        };
        const back = {
          n: area.alleySide === 'n' && Math.abs(r.minZ - area.minZ) < eps,
          s: area.alleySide === 's' && Math.abs(r.maxZ - area.maxZ) < eps,
          w: area.alleySide === 'w' && Math.abs(r.minX - area.minX) < eps,
          e: area.alleySide === 'e' && Math.abs(r.maxX - area.maxX) < eps,
        };
        const interior = !front.n && !front.s && !front.w && !front.e;
        let kind = 'building';
        if (rng.chance(d.emptyLotChance)) kind = 'parking';
        if (interior) kind = rng.chance(0.5) ? 'building' : 'courtyard';
        const arche = d.archetypes.length ? rng.weighted(d.archetypes) : null;
        block.lots.push({
          id: block.id + '_l' + block.lots.length,
          minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ,
          cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2,
          district: d, block, kind, interior, front, back,
          archetype: arche ? arche.type : null,
          floorRange: arche ? arche.floors : [2, 3],
          seed: rng.int(1, 1e9),
        });
      }
    }
  }

  /** Name of the road at a point, or null (used by the HUD location readout). */
  function roadNameAt(layout, x, z) {
    let best = null;
    let bestScore = Infinity;
    for (const r of layout.roads) {
      const along = r.axis === 'z' ? z : x;
      const across = r.axis === 'z' ? x - r.coord : z - r.coord;
      if (along < r.from - 8 || along > r.to + 8) continue;
      const half = r.width / 2 + SIDEWALK + 1;
      const score = Math.abs(across) / half;
      if (score < 1 && score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best ? best.name : null;
  }

  VH.CityGen = { CONFIG, EXTRA_ROADS, generate, districtAt, roadNameAt };
})();
