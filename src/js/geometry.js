/*
 * geometry.js — GeometryBuilder, the tool the city is built with.
 *
 * Static scenery is never made of thousands of separate meshes. Instead each
 * world chunk pours its buildings, pavements and props into a builder, and
 * the builder produces one merged BufferGeometry per material. Colour
 * variation travels in vertex colours so everything can share one material,
 * which keeps draw calls low enough for integrated GPUs.
 *
 * Optional per-vertex channels:
 *   uv      world-scaled texture coordinates (roads, pavements, grass)
 *   grid    facade window-grid coordinates: u = bay index, v = floor index
 *   facade  vec4 (windowWidth, windowHeight, style, seed) for materials.js
 */
(function () {
  'use strict';

  const VH = window.VH;

  const colorCache = new Map();

  /** sRGB hex → linear [r, g, b], optionally scaled. Cached. */
  VH.col = function col(hex, mul) {
    const key = hex + '|' + (mul || 1);
    let c = colorCache.get(key);
    if (!c) {
      const tc = new THREE.Color(hex);
      const m = mul === undefined ? 1 : mul;
      c = [tc.r * m, tc.g * m, tc.b * m];
      colorCache.set(key, c);
    }
    return c;
  };

  /** Linear blend of two [r,g,b] colours. */
  VH.colMix = function colMix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  VH.colMul = function colMul(a, m) {
    return [a[0] * m, a[1] * m, a[2] * m];
  };

  const NO_FACADE = [0, 0, 0, 0];

  class GeometryBuilder {
    constructor(opts) {
      opts = opts || {};
      this.hasUv = !!opts.uv;
      this.hasGrid = !!opts.grid;
      this.hasFacade = !!opts.facade;
      this.uvScale = opts.uvScale || 1;
      this.pos = [];
      this.nrm = [];
      this.col = [];
      this.uv = [];
      this.grid = [];
      this.fac = [];
      this.idx = [];
      this.count = 0;
    }

    get isEmpty() {
      return this.count === 0;
    }

    vertex(x, y, z, nx, ny, nz, c, u, v, gu, gv, f) {
      this.pos.push(x, y, z);
      this.nrm.push(nx, ny, nz);
      this.col.push(c[0], c[1], c[2]);
      if (this.hasUv) this.uv.push(u || 0, v || 0);
      if (this.hasGrid) this.grid.push(gu || 0, gv || 0);
      if (this.hasFacade) {
        const ff = f || NO_FACADE;
        this.fac.push(ff[0], ff[1], ff[2], ff[3]);
      }
      return this.count++;
    }

    /**
     * A flat quad. Corners a, b, c, d are [x, y, z] in counter-clockwise order
     * as seen from the front. `uvs` and `grids` are optional arrays of four [u, v].
     */
    quad(a, b, c, d, n, color, uvs, grids, facade) {
      const i0 = this.vertex(a[0], a[1], a[2], n[0], n[1], n[2], color,
        uvs && uvs[0][0], uvs && uvs[0][1], grids && grids[0][0], grids && grids[0][1], facade);
      const i1 = this.vertex(b[0], b[1], b[2], n[0], n[1], n[2], color,
        uvs && uvs[1][0], uvs && uvs[1][1], grids && grids[1][0], grids && grids[1][1], facade);
      const i2 = this.vertex(c[0], c[1], c[2], n[0], n[1], n[2], color,
        uvs && uvs[2][0], uvs && uvs[2][1], grids && grids[2][0], grids && grids[2][1], facade);
      const i3 = this.vertex(d[0], d[1], d[2], n[0], n[1], n[2], color,
        uvs && uvs[3][0], uvs && uvs[3][1], grids && grids[3][0], grids && grids[3][1], facade);
      this.idx.push(i0, i1, i2, i0, i2, i3);
    }

    /**
     * A flat convex polygon (points in counter-clockwise order seen from the
     * front), triangulated as a fan. The normal is computed from the points.
     */
    polygon(pts, color, facade) {
      const a = pts[0];
      const b = pts[1];
      const c = pts[2];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const base = this.count;
      for (const p of pts) this.vertex(p[0], p[1], p[2], nx, ny, nz, color, p[0] / this.uvScale, -p[2] / this.uvScale, 0, 0, facade);
      for (let i = 1; i < pts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
    }

    /** Horizontal rectangle facing up at height y, with world-scaled UVs. */
    topRect(x0, z0, x1, z1, y, color, uvScale) {
      const s = uvScale || this.uvScale;
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color,
        [[x0 / s, -z1 / s], [x1 / s, -z1 / s], [x1 / s, -z0 / s], [x0 / s, -z0 / s]]);
    }

    /**
     * A vertical wall face. `o` is the bottom-left corner seen from outside,
     * (ux, uz) the unit direction along the wall, `len` its length and
     * `h` its height. The outward normal is (ux, 0, uz) × up.
     */
    wall(o, ux, uz, len, h, color, uvScale, grid, facade) {
      const nx = -uz;
      const nz = ux;
      const a = [o[0], o[1], o[2]];
      const b = [o[0] + ux * len, o[1], o[2] + uz * len];
      const c = [b[0], o[1] + h, b[2]];
      const d = [o[0], o[1] + h, o[2]];
      let uvs = null;
      if (this.hasUv) {
        const s = uvScale || this.uvScale;
        // Continuous along the wall's world position so neighbouring walls line up.
        const u0 = (ux !== 0 ? o[0] * ux : o[2] * uz) / s;
        const u1 = u0 + len / s;
        uvs = [[u0, o[1] / s], [u1, o[1] / s], [u1, (o[1] + h) / s], [u0, (o[1] + h) / s]];
      }
      let grids = null;
      if (grid) {
        // grid = [u0, u1, v0, v1]
        grids = [[grid[0], grid[2]], [grid[1], grid[2]], [grid[1], grid[3]], [grid[0], grid[3]]];
      }
      this.quad(a, b, c, d, [nx, 0, nz], color, uvs, grids, facade);
    }

    /**
     * Axis-aligned box. opts:
     *   top      colour of the top face (defaults to `color`)
     *   bottom   include the bottom face (default false — rarely visible)
     *   skip     { n, s, e, w, top } faces to leave out
     *   uvScale  metres per texture repeat
     */
    box(x0, y0, z0, x1, y1, z1, color, opts) {
      opts = opts || {};
      const skip = opts.skip || {};
      const h = y1 - y0;
      const s = opts.uvScale;
      if (!skip.s) this.wall([x0, y0, z1], 1, 0, x1 - x0, h, color, s); //  south, +Z
      if (!skip.n) this.wall([x1, y0, z0], -1, 0, x1 - x0, h, color, s); // north, -Z
      if (!skip.e) this.wall([x1, y0, z1], 0, -1, z1 - z0, h, color, s); // east, +X
      if (!skip.w) this.wall([x0, y0, z0], 0, 1, z1 - z0, h, color, s); //  west, -X
      if (!skip.top) this.topRect(x0, z0, x1, z1, y1, opts.top || color, s);
      if (opts.bottom) {
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color);
      }
    }

    /** Box centred at (cx, cz) with half sizes, rotated by `yaw` about +Y. */
    orientedBox(cx, cz, hx, hz, yaw, y0, y1, color, topColor) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // Local → world: x' = cx + lx*c + lz*s, z' = cz - lx*s + lz*c  (yaw faces +Z at 0)
      const P = (lx, lz, y) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
      const corners = [P(-hx, hz, 0), P(hx, hz, 0), P(hx, -hz, 0), P(-hx, -hz, 0)];
      const faces = [
        [0, 1, [s, 0, c]], //   local +Z
        [1, 2, [c, 0, -s]], //  local +X
        [2, 3, [-s, 0, -c]], // local -Z
        [3, 0, [-c, 0, s]], //  local -X
      ];
      for (const [i, j, n] of faces) {
        const a = corners[i];
        const b = corners[j];
        this.quad([a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], y1, b[2]], [a[0], y1, a[2]], n, color);
      }
      const t = topColor || color;
      this.quad([corners[0][0], y1, corners[0][2]], [corners[1][0], y1, corners[1][2]],
        [corners[2][0], y1, corners[2][2]], [corners[3][0], y1, corners[3][2]], [0, 1, 0], t);
    }

    /** Vertical cylinder or cone frustum. */
    cylinder(cx, y0, cz, rBottom, rTop, h, segments, color, capTop, capColor) {
      const base = this.count;
      const n = segments;
      const slope = (rBottom - rTop) / h;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const len = Math.hypot(1, slope);
        this.vertex(cx + ca * rBottom, y0, cz + sa * rBottom, ca / len, slope / len, sa / len, color);
        this.vertex(cx + ca * rTop, y0 + h, cz + sa * rTop, ca / len, slope / len, sa / len, color);
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2;
        this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      if (capTop && rTop > 0) {
        const cc = capColor || color;
        const center = this.vertex(cx, y0 + h, cz, 0, 1, 0, cc);
        const ring = this.count;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.vertex(cx + Math.cos(a) * rTop, y0 + h, cz + Math.sin(a) * rTop, 0, 1, 0, cc);
        }
        for (let i = 0; i < n; i++) this.idx.push(center, ring + i + 1, ring + i);
      }
    }

    /**
     * Merge an existing three.js BufferGeometry, transformed by `matrix`
     * (a THREE.Matrix4) and painted a single colour.
     */
    merge(geometry, matrix, color, facade) {
      const pos = geometry.attributes.position;
      const nrm = geometry.attributes.normal;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const v = new THREE.Vector3();
      const nv = new THREE.Vector3();
      const base = this.count;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        if (nrm) nv.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
        else nv.set(0, 1, 0);
        this.vertex(v.x, v.y, v.z, nv.x, nv.y, nv.z, color, v.x / this.uvScale, -v.z / this.uvScale, 0, 0, facade);
      }
      if (geometry.index) {
        const ix = geometry.index.array;
        for (let i = 0; i < ix.length; i++) this.idx.push(base + ix[i]);
      } else {
        for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
      }
    }

    /** Append another builder's contents (same channel layout). */
    append(other) {
      const base = this.count;
      // Plain loops: spreading very large arrays into push() overflows the stack.
      const copy = (dst, src) => {
        for (let i = 0; i < src.length; i++) dst.push(src[i]);
      };
      copy(this.pos, other.pos);
      copy(this.nrm, other.nrm);
      copy(this.col, other.col);
      if (this.hasUv) copy(this.uv, other.uv);
      if (this.hasGrid) copy(this.grid, other.grid);
      if (this.hasFacade) copy(this.fac, other.fac);
      for (let i = 0; i < other.idx.length; i++) this.idx.push(base + other.idx[i]);
      this.count += other.count;
    }

    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      if (this.hasUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      if (this.hasGrid) g.setAttribute('aGrid', new THREE.Float32BufferAttribute(this.grid, 2));
      if (this.hasFacade) g.setAttribute('aFacade', new THREE.Float32BufferAttribute(this.fac, 4));
      g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      return g;
    }
  }

  VH.GeometryBuilder = GeometryBuilder;
})();
