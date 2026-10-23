/*
 * physics.js — the static collision world.
 *
 * Every solid thing in the city is described as a box that can be rotated
 * about the vertical axis, or as a ramp (a box whose top slopes along its
 * local +Z). Colliders live in a uniform spatial hash grid so queries only
 * look at what is nearby.
 *
 * Queries:
 *   groundHeight(x, z, maxY)            highest walkable surface at a point
 *   ceilingHeight(x, z, minY)           lowest underside above a point
 *   resolveCircle(pos, r, y0, y1, step) push a vertical capsule out of walls
 *   raycast(origin, dir, maxDist, opts) first hit along a ray (camera, bullets)
 *   overlaps(x, z, r, y0, y1)           is this space free? (stand up, climb)
 *
 * Collider flags say what a collider blocks: SOLID (characters and vehicles),
 * CAMERA (camera collision — thin poles leave this off so the camera doesn't
 * jump behind every lamp post) and SHOTS (bullets, Phase 7).
 */
(function () {
  'use strict';

  const VH = window.VH;

  const BOX = 0;
  const RAMP = 1;
  const FLAGS = { SOLID: 1, CAMERA: 2, SHOTS: 4, ALL: 7 };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  class CollisionWorld {
    constructor(cellSize) {
      this.cellSize = cellSize || 16;
      this.colliders = [];
      this.cells = new Map();
      this.stamp = 1;
      this.terrain = () => 0;
      this.lastGround = null;
    }

    _key(ix, iz) {
      return (ix + 32768) * 65536 + (iz + 32768);
    }

    _insert(col) {
      const cs = this.cellSize;
      const ix0 = Math.floor(col.minX / cs);
      const ix1 = Math.floor(col.maxX / cs);
      const iz0 = Math.floor(col.minZ / cs);
      const iz1 = Math.floor(col.maxZ / cs);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = this._key(ix, iz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(col);
        }
      }
    }

    _make(type, cx, cz, hx, hz, yaw, minY, maxY, y0, y1, tag, flags) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // World-space XZ bounds of the rotated rectangle.
      const ex = Math.abs(hx * c) + Math.abs(hz * s);
      const ez = Math.abs(hx * s) + Math.abs(hz * c);
      const col = {
        id: this.colliders.length,
        type, cx, cz, hx, hz, yaw, cos: c, sin: s, minY, maxY, y0, y1,
        tag: tag || 'static',
        flags: flags === undefined ? FLAGS.ALL : flags,
        minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez,
        _stamp: 0,
      };
      this.colliders.push(col);
      this._insert(col);
      return col;
    }

    /** Axis-aligned box from min/max corners. */
    addBox(minX, minY, minZ, maxX, maxY, maxZ, tag, flags) {
      return this._make(BOX, (minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2,
        0, minY, maxY, maxY, maxY, tag, flags);
    }

    /** Box centred at (cx, cz), half sizes hx/hz, rotated by yaw. */
    addOrientedBox(cx, cz, hx, hz, yaw, minY, maxY, tag, flags) {
      return this._make(BOX, cx, cz, hx, hz, yaw, minY, maxY, maxY, maxY, tag, flags);
    }

    /** Ramp whose top rises from yLow at local -Z to yHigh at local +Z. */
    addRamp(cx, cz, hx, hz, yaw, baseY, yLow, yHigh, tag, flags) {
      return this._make(RAMP, cx, cz, hx, hz, yaw, baseY, Math.max(yLow, yHigh), yLow, yHigh, tag, flags);
    }

    /** Visit each collider overlapping an XZ rectangle exactly once. */
    query(minX, minZ, maxX, maxZ, fn) {
      const cs = this.cellSize;
      const stamp = ++this.stamp;
      const ix0 = Math.floor(minX / cs);
      const ix1 = Math.floor(maxX / cs);
      const iz0 = Math.floor(minZ / cs);
      const iz1 = Math.floor(maxZ / cs);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const list = this.cells.get(this._key(ix, iz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const col = list[i];
            if (col._stamp === stamp) continue;
            col._stamp = stamp;
            if (col.maxX < minX || col.minX > maxX || col.maxZ < minZ || col.minZ > maxZ) continue;
            if (fn(col) === false) return;
          }
        }
      }
    }

    /** Height of a collider's top at local z (ramps slope, boxes are flat). */
    static topAt(col, lz) {
      if (col.type === BOX) return col.maxY;
      const t = clamp((lz + col.hz) / (2 * col.hz), 0, 1);
      return col.y0 + (col.y1 - col.y0) * t;
    }

    /** Highest surface at (x, z) that is not above maxY. Includes the terrain. */
    groundHeight(x, z, maxY) {
      let best = this.terrain(x, z);
      let bestCol = null;
      this.query(x, z, x, z, (col) => {
        if (!(col.flags & FLAGS.SOLID)) return;
        const dx = x - col.cx;
        const dz = z - col.cz;
        const lx = dx * col.cos - dz * col.sin;
        const lz = dx * col.sin + dz * col.cos;
        if (lx < -col.hx || lx > col.hx || lz < -col.hz || lz > col.hz) return;
        const top = CollisionWorld.topAt(col, lz);
        if (top <= maxY + 1e-4 && top > best) {
          best = top;
          bestCol = col;
        }
      });
      this.lastGround = bestCol;
      return best;
    }

    /** Lowest collider underside above minY at (x, z), or Infinity. */
    ceilingHeight(x, z, minY) {
      let best = Infinity;
      this.query(x, z, x, z, (col) => {
        if (!(col.flags & FLAGS.SOLID)) return;
        const dx = x - col.cx;
        const dz = z - col.cz;
        const lx = dx * col.cos - dz * col.sin;
        const lz = dx * col.sin + dz * col.cos;
        if (lx < -col.hx || lx > col.hx || lz < -col.hz || lz > col.hz) return;
        if (col.minY >= minY && col.minY < best) best = col.minY;
      });
      return best;
    }

    /**
     * Push a vertical capsule (circle of radius r spanning y0..y1) out of
     * every solid collider it overlaps. Anything whose top at the contact
     * point is within `stepHeight` of the feet is ignored — the ground check
     * lifts the character onto it instead. Mutates `pos` ({x, z}) and returns
     * the summed push direction { x, z, hit } for sliding the velocity.
     */
    resolveCircle(pos, r, y0, y1, stepHeight, out) {
      const result = out || { x: 0, z: 0, hit: false };
      result.x = 0;
      result.z = 0;
      result.hit = false;
      for (let iter = 0; iter < 4; iter++) {
        let pushed = false;
        this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (col) => {
          if (!(col.flags & FLAGS.SOLID)) return;
          if (col.minY >= y1 || col.maxY <= y0 + 0.001) return;
          const dx = pos.x - col.cx;
          const dz = pos.z - col.cz;
          const lx = dx * col.cos - dz * col.sin;
          const lz = dx * col.sin + dz * col.cos;
          const qx = clamp(lx, -col.hx, col.hx);
          const qz = clamp(lz, -col.hz, col.hz);
          const ddx = lx - qx;
          const ddz = lz - qz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= r * r) return;
          const top = CollisionWorld.topAt(col, qz);
          if (top <= y0 + stepHeight) return;
          let nlx;
          let nlz;
          let pen;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            nlx = ddx / d;
            nlz = ddz / d;
            pen = r - d;
          } else {
            // Centre is inside the footprint: leave by the nearest side.
            const px = col.hx - Math.abs(lx);
            const pz = col.hz - Math.abs(lz);
            if (px < pz) {
              nlx = lx >= 0 ? 1 : -1;
              nlz = 0;
              pen = px + r;
            } else {
              nlx = 0;
              nlz = lz >= 0 ? 1 : -1;
              pen = pz + r;
            }
          }
          const wx = nlx * col.cos + nlz * col.sin;
          const wz = -nlx * col.sin + nlz * col.cos;
          pos.x += wx * (pen + 1e-4);
          pos.z += wz * (pen + 1e-4);
          result.x += wx;
          result.z += wz;
          result.hit = true;
          pushed = true;
        });
        if (!pushed) break;
      }
      const len = Math.hypot(result.x, result.z);
      if (len > 0) {
        result.x /= len;
        result.z /= len;
      }
      return result;
    }

    /** True if a vertical capsule at (x, z) spanning y0..y1 touches any solid collider. */
    overlaps(x, z, r, y0, y1, flags, minTop) {
      const mask = flags || FLAGS.SOLID;
      let hit = false;
      this.query(x - r, z - r, x + r, z + r, (col) => {
        if (!(col.flags & mask)) return;
        if (minTop !== undefined && col.maxY < minTop) return; // ground slabs (roads, kerbs) don't count
        if (col.minY >= y1 || col.maxY <= y0) return;
        const dx = x - col.cx;
        const dz = z - col.cz;
        const lx = dx * col.cos - dz * col.sin;
        const lz = dx * col.sin + dz * col.cos;
        const qx = clamp(lx, -col.hx, col.hx);
        const qz = clamp(lz, -col.hz, col.hz);
        if ((lx - qx) * (lx - qx) + (lz - qz) * (lz - qz) >= r * r) return;
        if (CollisionWorld.topAt(col, qz) <= y0) return;
        hit = true;
        return false;
      });
      return hit;
    }

    /** Ray against one collider in its local frame. Returns t or -1; writes the normal. */
    static _rayCollider(col, ox, oy, oz, dx, dy, dz, inflate, maxT, nOut) {
      const rx = ox - col.cx;
      const rz = oz - col.cz;
      const c = col.cos;
      const s = col.sin;
      const lox = rx * c - rz * s;
      const loz = rx * s + rz * c;
      const ldx = dx * c - dz * s;
      const ldz = dx * s + dz * c;
      const hx = col.hx + inflate;
      const hz = col.hz + inflate;
      const y0 = col.minY - inflate;
      const y1 = col.maxY + inflate;

      let tEnter = -Infinity;
      let tExit = Infinity;
      let axis = -1;
      let sign = 0;

      // Slabs on local X, Y, Z.
      const slab = (o, d, lo, hi, ax) => {
        if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
        let t0 = (lo - o) / d;
        let t1 = (hi - o) / d;
        let sg = -1;
        if (t0 > t1) {
          const tmp = t0;
          t0 = t1;
          t1 = tmp;
          sg = 1;
        }
        if (t0 > tEnter) {
          tEnter = t0;
          axis = ax;
          sign = sg;
        }
        if (t1 < tExit) tExit = t1;
        return tEnter <= tExit;
      };
      if (!slab(lox, ldx, -hx, hx, 0)) return -1;
      if (!slab(oy, dy, y0, y1, 1)) return -1;
      if (!slab(loz, ldz, -hz, hz, 2)) return -1;

      let slopeNormal = false;
      if (col.type === RAMP) {
        // Keep the part of the ray below the sloped top: y - k*lz <= d.
        const k = (col.y1 - col.y0) / (2 * col.hz);
        const d = col.y0 + k * col.hz + inflate * Math.sqrt(1 + k * k);
        const num = d - (oy - k * loz);
        const den = dy - k * ldz;
        if (Math.abs(den) < 1e-12) {
          if (num < 0) return -1;
        } else {
          const tp = num / den;
          if (den < 0) {
            if (tp > tEnter) {
              tEnter = tp;
              slopeNormal = true;
            }
          } else if (tp < tExit) tExit = tp;
        }
        if (tEnter > tExit) return -1;
        if (slopeNormal) {
          const len = Math.sqrt(1 + k * k);
          const nlx = 0;
          const nlz = -k / len;
          nOut.x = nlx * c + nlz * s;
          nOut.z = -nlx * s + nlz * c;
          nOut.y = 1 / len;
        }
      }
      if (tExit < 0 || tEnter > maxT) return -1;
      if (!slopeNormal) {
        let nlx = 0;
        let nly = 0;
        let nlz = 0;
        if (axis === 0) nlx = sign;
        else if (axis === 1) nly = sign;
        else nlz = sign;
        nOut.x = nlx * c + nlz * s;
        nOut.y = nly;
        nOut.z = -nlx * s + nlz * c;
      }
      nOut.inside = tEnter < 0;
      return tEnter < 0 ? 0 : tEnter;
    }

    /**
     * First hit along a ray. dir must be normalised. opts:
     *   inflate  treat every collider as this much bigger (a cheap sphere cast)
     *   flags    which collider flags count (default: CAMERA)
     *   ground   also hit the terrain (default true)
     *   ignoreInside  skip colliders the ray starts inside
     * Returns { t, x, y, z, nx, ny, nz, collider } or null.
     */
    raycast(ox, oy, oz, dx, dy, dz, maxDist, opts) {
      opts = opts || {};
      const inflate = opts.inflate || 0;
      const mask = opts.flags || FLAGS.CAMERA;
      let bestT = maxDist;
      let best = null;
      const n = { x: 0, y: 0, z: 0, inside: false };

      if (opts.ground !== false && dy < -1e-6) {
        const g = this.terrain(ox, oz);
        const tg = (oy - inflate - g) / -dy;
        if (tg >= 0 && tg < bestT) {
          bestT = tg;
          best = { t: tg, nx: 0, ny: 1, nz: 0, collider: null };
        }
      }

      // Walk the grid cells the ray crosses (2D DDA in XZ).
      const cs = this.cellSize;
      let ix = Math.floor(ox / cs);
      let iz = Math.floor(oz / cs);
      const stepX = dx > 0 ? 1 : -1;
      const stepZ = dz > 0 ? 1 : -1;
      const tDeltaX = Math.abs(dx) > 1e-12 ? cs / Math.abs(dx) : Infinity;
      const tDeltaZ = Math.abs(dz) > 1e-12 ? cs / Math.abs(dz) : Infinity;
      let tMaxX = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (ix + 1) * cs - ox : ox - ix * cs) / Math.abs(dx)) : Infinity;
      let tMaxZ = Math.abs(dz) > 1e-12 ? ((dz > 0 ? (iz + 1) * cs - oz : oz - iz * cs) / Math.abs(dz)) : Infinity;
      const stamp = ++this.stamp;
      // Inflated colliders can poke into a neighbouring cell; check a ring when inflating.
      const ring = inflate > 0 ? 1 : 0;
      let tCell = 0;
      for (let guard = 0; guard < 512; guard++) {
        for (let ax = -ring; ax <= ring; ax++) {
          for (let az = -ring; az <= ring; az++) {
            const list = this.cells.get(this._key(ix + ax, iz + az));
            if (!list) continue;
            for (let i = 0; i < list.length; i++) {
              const col = list[i];
              if (col._stamp === stamp) continue;
              col._stamp = stamp;
              if (!(col.flags & mask)) continue;
              const t = CollisionWorld._rayCollider(col, ox, oy, oz, dx, dy, dz, inflate, bestT, n);
              if (t < 0 || t >= bestT) continue;
              if (n.inside && opts.ignoreInside) continue;
              bestT = t;
              best = { t, nx: n.x, ny: n.y, nz: n.z, collider: col };
            }
          }
        }
        const tNext = Math.min(tMaxX, tMaxZ);
        if (bestT <= tNext || tNext > maxDist) break;
        tCell = tNext;
        if (tMaxX < tMaxZ) {
          ix += stepX;
          tMaxX += tDeltaX;
        } else {
          iz += stepZ;
          tMaxZ += tDeltaZ;
        }
      }
      void tCell;
      if (best) {
        best.x = ox + dx * best.t;
        best.y = oy + dy * best.t;
        best.z = oz + dz * best.t;
      }
      return best;
    }

    /** Visit colliders within `radius` of (x, z) — used by the debug view. */
    forEachNear(x, z, radius, fn) {
      this.query(x - radius, z - radius, x + radius, z + radius, fn);
    }

    get count() {
      return this.colliders.length;
    }
  }

  CollisionWorld.BOX = BOX;
  CollisionWorld.RAMP = RAMP;
  CollisionWorld.FLAGS = FLAGS;
  VH.CollisionWorld = CollisionWorld;
  VH.COLLIDE = FLAGS;
})();
