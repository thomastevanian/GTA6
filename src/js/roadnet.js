/*
 * roadnet.js — the drivable road network, derived from the city layout.
 *
 * Traffic, police and racers all drive the same lanes:
 *
 *   lane positions   every road has lanes in each direction (right-hand
 *                    traffic); on the 14 m streets the single lane sits
 *                    towards the centre line, leaving a parking strip by
 *                    the kerb
 *   junctions        each junction knows its signal group (avenues obey
 *                    "ns", streets "ew") and which legs leave it
 *   paths            a route is a list of pieces: straight lane runs and
 *                    quadratic curves through junctions (right, left or
 *                    straight on); drivers follow them by pure pursuit
 *
 * Conventions: +X east, +Z south; a heading a points along (sin a, cos a).
 * Avenues run north–south (axis 'z'), streets east–west (axis 'x'). On an
 * avenue dir +1 is southbound; on a street dir +1 is eastbound.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp } = VH.math;

  const SINGLE_LANE_OFFSET = 2.4; // centre of the travel lane on 14 m roads
  const PARKING_OFFSET = 5.35; // centre of a parked car on 14 m roads
  const STOP_BACK = 5.4; // how far before the junction box cars stop (the stop line)

  class RoadNet {
    constructor(layout) {
      this.layout = layout;
      this.roads = layout.roads;
      this.junctions = layout.intersections;
      this.byKey = new Map();
      for (const j of this.junctions) this.byKey.set(j.x + ',' + j.z, j);
      // Junctions along each road, sorted by the road's own coordinate.
      for (const r of this.roads) {
        r.junctions = this.junctions
          .filter((j) => (r.axis === 'z' ? j.avenue === r : j.street === r))
          .sort((a, b) => (r.axis === 'z' ? a.z - b.z : a.x - b.x));
        const half = r.width / 2;
        const n = r.lanesPerDirection;
        r.laneWidth = (half - r.median / 2 - 0.5) / n;
        r.speedLimit = r.width >= 18 ? 17.5 : 13.5;
        r.parking = n === 1;
      }
      this._markRoadEnds(layout);
    }

    /**
     * Roads out of town that just stop (Airport Road, Meridian Boulevard at
     * the fort's gate) get a turnaround so traffic can use them: 'uturn'
     * where the end is open ground or the gate apron, 'flip' where barriers
     * close it (cars turn round there only while nobody's looking).
     * Roads ending at the old city's edge keep their old behaviour.
     */
    _markRoadEnds(layout) {
      const cb = layout.config.cityBounds || layout.config.bounds;
      const outside = (x, z) => x < cb.minX - 1 || x > cb.maxX + 1 || z < cb.minZ - 1 || z > cb.maxZ + 1;
      for (const r of this.roads) {
        r.endFrom = null;
        r.endTo = null;
        const js = r.junctions;
        for (const end of ['from', 'to']) {
          const a = r[end];
          const x = r.axis === 'z' ? r.coord : a;
          const z = r.axis === 'z' ? a : r.coord;
          if (!outside(x, z)) continue;
          const j = end === 'from' ? js[0] : js[js.length - 1];
          if (j && Math.abs(RoadNet.junctionAlong(r, j) - a) < RoadNet.junctionHalf(r, j) + 40) continue; // a junction, not an end
          // world.js puts barriers across starts out of town (not the fort's open start) and the far south ends.
          const barrier = end === 'from' ? !r.openStart && a <= (r.axis === 'z' ? cb.minZ : cb.minX) + 30 : r.axis === 'z' && a >= cb.maxZ - 30;
          r[end === 'from' ? 'endFrom' : 'endTo'] = barrier ? 'flip' : 'uturn';
        }
      }
    }

    /** Distance of lane `k` (0 = nearest the centre) from the road's centre line. */
    laneOffset(road, k) {
      if (road.lanesPerDirection === 1) return SINGLE_LANE_OFFSET;
      return road.median / 2 + (k + 0.5) * road.laneWidth;
    }

    /** World point and heading of a lane at a coordinate along its road. */
    lanePoint(road, dir, k, along, out) {
      const o = out || {};
      const off = this.laneOffset(road, k);
      if (road.axis === 'z') {
        o.x = road.coord - dir * off;
        o.z = along;
        o.heading = dir > 0 ? 0 : Math.PI;
      } else {
        o.x = along;
        o.z = road.coord + dir * off;
        o.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      return o;
    }

    /** A parking spot beside the kerb (single-lane roads only). */
    parkingPoint(road, dir, along) {
      const p = { x: 0, z: 0, heading: 0 };
      if (road.axis === 'z') {
        p.x = road.coord - dir * PARKING_OFFSET;
        p.z = along;
        p.heading = dir > 0 ? 0 : Math.PI;
      } else {
        p.x = along;
        p.z = road.coord + dir * PARKING_OFFSET;
        p.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      return p;
    }

    /** The coordinate of a junction on a given road (the crossing road's coord). */
    static junctionAlong(road, j) {
      return road.axis === 'z' ? j.z : j.x;
    }

    /** Half size of a junction measured along a road. */
    static junctionHalf(road, j) {
      return road.axis === 'z' ? j.halfZ : j.halfX;
    }

    /** The next junction ahead of `along` on `road` in direction `dir` (or null). */
    nextJunction(road, dir, along) {
      const list = road.junctions;
      if (dir > 0) {
        for (let i = 0; i < list.length; i++) {
          const j = list[i];
          if (RoadNet.junctionAlong(road, j) - RoadNet.junctionHalf(road, j) > along - 0.01) return j;
        }
      } else {
        for (let i = list.length - 1; i >= 0; i--) {
          const j = list[i];
          if (RoadNet.junctionAlong(road, j) + RoadNet.junctionHalf(road, j) < along + 0.01) return j;
        }
      }
      return null;
    }

    /** Where a car on `road`/`dir` enters and leaves junction `j`, along that road. */
    static edges(road, dir, j) {
      const c = RoadNet.junctionAlong(road, j);
      const h = RoadNet.junctionHalf(road, j);
      return dir > 0 ? { enter: c - h, exit: c + h } : { enter: c + h, exit: c - h };
    }

    /** The road crossing `road` at junction j. */
    static crossing(road, j) {
      return road.axis === 'z' ? j.street : j.avenue;
    }

    /** Does a road continue out of junction j in the given travel direction? */
    static hasLeg(j, road, dir) {
      if (road.axis === 'z') return dir > 0 ? j.legs.s : j.legs.n;
      return dir > 0 ? j.legs.e : j.legs.w;
    }

    /**
     * Is there another junction beyond j along road/dir, or a turnaround at
     * the road's end? (Dead ends at the edge of town are avoided.)
     */
    static continuesPast(road, dir, j) {
      const list = road.junctions;
      const i = list.indexOf(j);
      if (dir > 0 ? i < list.length - 1 : i > 0) return true;
      const end = dir > 0 ? road.endTo : road.endFrom;
      return !!end && Math.abs((dir > 0 ? road.to : road.from) - RoadNet.junctionAlong(road, j)) > RoadNet.junctionHalf(road, j) + 40;
    }

    /**
     * The exits available at junction j for a car arriving on road/dir:
     * [{ turn: 'straight'|'left'|'right', road, dir }]. Dead ends are left out.
     */
    exits(road, dir, j) {
      const out = [];
      if (RoadNet.hasLeg(j, road, dir) && RoadNet.continuesPast(road, dir, j)) out.push({ turn: 'straight', road, dir });
      const cross = RoadNet.crossing(road, j);
      // Right of a heading (sin a, cos a) is (-cos a, sin a).
      let rightDir;
      if (road.axis === 'z') rightDir = dir > 0 ? -1 : 1; // southbound turns right onto westbound
      else rightDir = dir > 0 ? 1 : -1; // eastbound turns right onto southbound
      for (const [turn, d] of [['right', rightDir], ['left', -rightDir]]) {
        if (RoadNet.hasLeg(j, cross, d) && RoadNet.continuesPast(cross, d, j)) out.push({ turn, road: cross, dir: d });
      }
      return out;
    }

    /** Signal group that governs traffic on a road. */
    static signalGroup(road) {
      return road.axis === 'z' ? 'ns' : 'ew';
    }

    // ------------------------------------------------------------ pieces
    /** A straight lane piece from along a0 to a1. */
    linePiece(road, dir, lane, a0, a1) {
      const p0 = this.lanePoint(road, dir, lane, a0);
      const p1 = this.lanePoint(road, dir, lane, a1);
      return {
        type: 'line', road, dir, lane,
        x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z,
        heading: p0.heading,
        length: Math.abs(a1 - a0),
        limit: road.speedLimit,
      };
    }

    /** The piece that takes a car through junction j onto `exit` (from exits()). */
    turnPiece(road, dir, lane, j, exit) {
      const inE = RoadNet.edges(road, dir, j);
      const entry = this.lanePoint(road, dir, lane, inE.enter);
      if (exit.turn === 'straight') {
        const piece = this.linePiece(road, dir, lane, inE.enter, inE.exit);
        piece.junction = j;
        piece.turn = 'straight';
        piece.nextLane = lane;
        return piece;
      }
      const nLanes = exit.road.lanesPerDirection;
      const outLane = exit.turn === 'right' ? nLanes - 1 : 0;
      const outE = RoadNet.edges(exit.road, exit.dir, j);
      const leave = this.lanePoint(exit.road, exit.dir, outLane, outE.exit);
      // Control point: where the entry lane line meets the exit lane line.
      const cx = road.axis === 'z' ? entry.x : leave.x;
      const cz = road.axis === 'z' ? leave.z : entry.z;
      const piece = {
        type: 'curve', road: exit.road, dir: exit.dir, lane: outLane, fromRoad: road,
        x0: entry.x, z0: entry.z, cx, cz, x1: leave.x, z1: leave.z,
        junction: j, turn: exit.turn, nextLane: outLane,
        limit: exit.turn === 'right' ? 7.5 : 8.5,
      };
      piece.length = RoadNet.curveLength(piece);
      return piece;
    }

    static curveLength(p) {
      let len = 0;
      let px = p.x0;
      let pz = p.z0;
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const u = 1 - t;
        const x = u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1;
        const z = u * u * p.z0 + 2 * u * t * p.cz + t * t * p.z1;
        len += Math.hypot(x - px, z - pz);
        px = x;
        pz = z;
      }
      return len;
    }

    /** Point on a piece at arc-length fraction t (0..1). */
    static pointOn(p, t, out) {
      const o = out || {};
      t = clamp(t, 0, 1);
      if (p.type === 'line') {
        o.x = p.x0 + (p.x1 - p.x0) * t;
        o.z = p.z0 + (p.z1 - p.z0) * t;
        o.heading = p.heading;
        return o;
      }
      const u = 1 - t;
      o.x = u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1;
      o.z = u * u * p.z0 + 2 * u * t * p.cz + t * t * p.z1;
      const dx = 2 * u * (p.cx - p.x0) + 2 * t * (p.x1 - p.cx);
      const dz = 2 * u * (p.cz - p.z0) + 2 * t * (p.z1 - p.cz);
      o.heading = Math.atan2(dx, dz);
      return o;
    }

    /** Fraction along a piece closest to (x, z), searching near `hint`. */
    static project(p, x, z, hint) {
      if (p.type === 'line') {
        const dx = p.x1 - p.x0;
        const dz = p.z1 - p.z0;
        const l2 = dx * dx + dz * dz || 1;
        return clamp(((x - p.x0) * dx + (z - p.z0) * dz) / l2, 0, 1);
      }
      let best = hint || 0;
      let bestD = Infinity;
      const tmp = {};
      const lo = Math.max(0, (hint || 0) - 0.25);
      const hi = Math.min(1, (hint || 0) + 0.35);
      for (let i = 0; i <= 14; i++) {
        const t = lo + ((hi - lo) * i) / 14;
        RoadNet.pointOn(p, t, tmp);
        const d = (tmp.x - x) * (tmp.x - x) + (tmp.z - z) * (tmp.z - z);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      return best;
    }

    // ------------------------------------------------------------ queries
    /**
     * The nearest lane to a point, optionally preferring lanes whose heading
     * agrees with `heading`. Only roads within `reach` metres of the kerb
     * count (6 by default: the point is on or beside the road).
     * Returns { road, dir, lane, along, dist, x, z, heading }.
     */
    nearestLane(x, z, heading, reach) {
      const far = reach === undefined ? 6 : reach;
      let best = null;
      let bestScore = Infinity;
      const tmp = {};
      for (const r of this.roads) {
        const along = r.axis === 'z' ? z : x;
        // (A long reach also finds the end of a road that stops short of the point.)
        const pastEnd = Math.max(5, far);
        if (along < r.from - pastEnd || along > r.to + pastEnd) continue;
        const across = r.axis === 'z' ? x - r.coord : z - r.coord;
        if (Math.abs(across) > r.width / 2 + far) continue;
        for (const dir of [1, -1]) {
          for (let k = 0; k < r.lanesPerDirection; k++) {
            this.lanePoint(r, dir, k, clamp(along, r.from, r.to), tmp);
            const d = Math.hypot(tmp.x - x, tmp.z - z);
            let score = d;
            if (heading !== undefined) {
              const diff = Math.abs(VH.math.wrapAngle(heading - tmp.heading));
              score += diff * 6;
            }
            if (score < bestScore) {
              bestScore = score;
              best = { road: r, dir, lane: k, along: clamp(along, r.from, r.to), dist: d, x: tmp.x, z: tmp.z, heading: tmp.heading };
            }
          }
        }
      }
      return best;
    }

    /** True if (x, z) is on the carriageway of any road (or inside a junction). */
    onRoad(x, z) {
      for (const r of this.roads) {
        const along = r.axis === 'z' ? z : x;
        if (along < r.from || along > r.to) continue;
        const across = r.axis === 'z' ? x - r.coord : z - r.coord;
        if (Math.abs(across) < r.width / 2) return true;
      }
      return false;
    }

    /** Random lane position (for spawning), within [minD, maxD] of (x, z). */
    randomLanePoint(rng, x, z, minD, maxD) {
      // Only the stretches of road within reach, weighted by their length, so
      // the long roads out of town fill up as readily as downtown does.
      const cands = this._cands || (this._cands = []);
      cands.length = 0;
      let total = 0;
      for (const r of this.roads) {
        const across = r.axis === 'z' ? x - r.coord : z - r.coord;
        if (Math.abs(across) > maxD) continue;
        const at = r.axis === 'z' ? z : x;
        const reach = Math.sqrt(maxD * maxD - across * across);
        const a0 = Math.max(r.from + 20, at - reach);
        const a1 = Math.min(r.to - 20, at + reach);
        if (a1 <= a0) continue;
        cands.push(r, a0, a1);
        total += a1 - a0;
      }
      if (!total) return null;
      for (let tries = 0; tries < 30; tries++) {
        let pickAt = rng() * total;
        let k = 0;
        while (k < cands.length - 3 && pickAt > cands[k + 2] - cands[k + 1]) {
          pickAt -= cands[k + 2] - cands[k + 1];
          k += 3;
        }
        const r = cands[k];
        const dir = rng() < 0.5 ? 1 : -1;
        const lane = Math.floor(rng() * r.lanesPerDirection);
        const along = cands[k + 1] + Math.min(pickAt, cands[k + 2] - cands[k + 1]);
        const p = this.lanePoint(r, dir, lane, along);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < minD || d > maxD) continue;
        // Not inside a junction box.
        const j = this.nextJunction(r, dir, along);
        if (j) {
          const e = RoadNet.edges(r, dir, j);
          if (Math.abs(along - e.enter) < 12) continue;
        }
        let inside = false;
        for (const jj of r.junctions) {
          const c = RoadNet.junctionAlong(r, jj);
          if (Math.abs(along - c) < RoadNet.junctionHalf(r, jj) + 2) inside = true;
        }
        if (inside) continue;
        return { road: r, dir, lane, along, x: p.x, z: p.z, heading: p.heading, dist: d };
      }
      return null;
    }

    /** The junction a point is inside, if any. */
    junctionAt(x, z, pad) {
      const m = pad || 0;
      for (const j of this.junctions) {
        if (Math.abs(x - j.x) < j.halfX + m && Math.abs(z - j.z) < j.halfZ + m) return j;
      }
      return null;
    }
  }

  RoadNet.STOP_BACK = STOP_BACK;
  RoadNet.PARKING_OFFSET = PARKING_OFFSET;
  VH.RoadNet = RoadNet;
})();
