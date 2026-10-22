/*
 * textures.js — every texture in the game is painted procedurally on a
 * canvas at load time. Nothing is downloaded, which keeps the game working
 * from a file:// page (where WebGL may not read image files) and offline.
 *
 * All colour textures tile seamlessly: the noise is periodic and anything
 * drawn near an edge is drawn again on the opposite edge.
 */
(function () {
  'use strict';

  const VH = window.VH;

  function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function toTexture(canvas, srgb, anisotropy) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = anisotropy || 1;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  }

  /** Fill every pixel from fn(u, v, x, y) → [r, g, b] in 0..255. */
  function paint(canvas, fn) {
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    let i = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = fn(x / size, y / size, x, y);
        d[i++] = c[0];
        d[i++] = c[1];
        d[i++] = c[2];
        d[i++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return ctx;
  }

  /** Draw with `draw(ctx)` nine times, offset by the canvas size, so strokes wrap. */
  function drawWrapped(ctx, size, draw) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.save();
        ctx.translate(ox * size, oy * size);
        draw(ctx);
        ctx.restore();
      }
    }
  }

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  // ------------------------------------------------------------ painters
  function asphalt(size, rng, noise) {
    const c = makeCanvas(size);
    const ctx = paint(c, (u, v) => {
      const blotch = noise.fbm2(u * 6, v * 6, 4, 6);
      const grain = rng.next();
      let g = 0.25 + (blotch - 0.5) * 0.09 + (grain - 0.5) * 0.07;
      if (grain > 0.992) g += 0.14; // bright aggregate stones
      else if (grain < 0.01) g -= 0.06;
      const k = g * 255;
      return [clamp255(k * 0.96), clamp255(k * 0.98), clamp255(k * 1.03)];
    });
    // Hairline cracks and a couple of sealed repair seams.
    ctx.lineCap = 'round';
    for (let n = 0; n < 7; n++) {
      const pts = [];
      let x = rng.range(0, size);
      let y = rng.range(0, size);
      let a = rng.range(0, Math.PI * 2);
      const steps = rng.int(6, 16);
      for (let s = 0; s < steps; s++) {
        pts.push([x, y]);
        a += rng.range(-0.7, 0.7);
        x += Math.cos(a) * rng.range(6, 18);
        y += Math.sin(a) * rng.range(6, 18);
      }
      const width = rng.chance(0.3) ? rng.range(3, 5) : rng.range(0.8, 1.6);
      const shade = width > 2 ? 'rgba(18,19,22,0.55)' : 'rgba(20,21,24,0.6)';
      drawWrapped(ctx, size, (g) => {
        g.strokeStyle = shade;
        g.lineWidth = width;
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.stroke();
      });
    }
    return c;
  }

  function paving(size, rng, noise, opts) {
    // Square slabs with joints; opts.tiles per side and two alternating tones.
    const tiles = opts.tiles;
    const tile = size / tiles;
    const tones = [];
    for (let i = 0; i < tiles * tiles; i++) tones.push(rng.range(-0.05, 0.05));
    const c = makeCanvas(size);
    paint(c, (u, v, x, y) => {
      const tx = Math.floor(x / tile);
      const ty = Math.floor(y / tile);
      const lx = x - tx * tile;
      const ly = y - ty * tile;
      const edge = Math.min(lx, ly, tile - 1 - lx, tile - 1 - ly);
      let base = opts.base;
      if (opts.alt && (tx + ty) % 2 === 1) base = opts.alt;
      const stain = noise.fbm2(u * 5, v * 5, 4, 5);
      const grain = rng.next();
      let m = 1 + tones[ty * tiles + tx] + (stain - 0.5) * 0.16 + (grain - 0.5) * 0.08;
      if (edge < 1.5) m *= 0.62; // joint
      else if (edge < 3) m *= 0.9; // bevel
      return [clamp255(base[0] * m), clamp255(base[1] * m), clamp255(base[2] * m)];
    });
    return c;
  }

  function grass(size, rng, noise) {
    const c = makeCanvas(size);
    paint(c, (u, v) => {
      const patch = noise.fbm2(u * 4, v * 4, 4, 4);
      const clump = noise.fbm2(u * 24 + 7, v * 24 + 3, 3, 24);
      const blade = rng.next();
      const dry = Math.max(0, patch - 0.58) * 2.2;
      const m = 0.78 + clump * 0.4 + (blade - 0.5) * 0.22;
      const r = (48 + dry * 70) * m;
      const g = (92 + dry * 35) * m;
      const b = (34 + dry * 12) * m;
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    return c;
  }

  function concrete(size, rng, noise) {
    const c = makeCanvas(size);
    paint(c, (u, v) => {
      const n = noise.fbm2(u * 8, v * 8, 5, 8);
      const g = rng.next();
      const k = 150 * (0.86 + (n - 0.5) * 0.3 + (g - 0.5) * 0.06);
      return [clamp255(k), clamp255(k * 0.99), clamp255(k * 0.96)];
    });
    return c;
  }

  function wood(size, rng, noise) {
    const planks = 10;
    const pw = size / planks;
    const tones = [];
    const offsets = [];
    for (let i = 0; i < planks; i++) {
      tones.push(rng.range(0.82, 1.12));
      offsets.push(rng.range(0, 1));
    }
    const c = makeCanvas(size);
    paint(c, (u, v, x, y) => {
      const p = Math.floor(y / pw);
      const ly = y - p * pw;
      const grainN = noise.fbm2(u * 3 + offsets[p] * 7, v * 60, 3, 3);
      let m = tones[p] * (0.85 + grainN * 0.3);
      if (ly < 1.5 || ly > pw - 1.5) m *= 0.45; // gap between planks
      // Butt joints, staggered per plank.
      const jointU = (u + offsets[p]) % 0.5;
      if (jointU < 0.004) m *= 0.5;
      return [clamp255(148 * m), clamp255(112 * m), clamp255(78 * m)];
    });
    return c;
  }

  function gravel(size, rng, noise) {
    const c = makeCanvas(size);
    paint(c, (u, v) => {
      const n = noise.fbm2(u * 10, v * 10, 4, 10);
      const g = rng.next();
      const k = 118 * (0.8 + n * 0.35 + (g - 0.5) * 0.3);
      return [clamp255(k), clamp255(k * 0.97), clamp255(k * 0.92)];
    });
    return c;
  }

  /** Greyscale weathering for building walls: rain streaks and blotches. */
  function grime(size, rng, noise) {
    const c = makeCanvas(size);
    paint(c, (u, v) => {
      const streak = noise.fbm2(u * 48, v * 3, 3, 48);
      const blotch = noise.fbm2(u * 5 + 11, v * 5 + 5, 4, 5);
      const g = rng.next();
      let k = 1 - Math.max(0, streak - 0.45) * 0.55 - Math.max(0, blotch - 0.5) * 0.35 + (g - 0.5) * 0.05;
      k = Math.max(0.55, Math.min(1, k));
      const b = k * 255;
      return [b, b, b];
    });
    return c;
  }

  // ======================================================================
  // High-resolution painters. These keep the old texture keys but replace
  // the cloudy 256/512px versions with sharper, better detailed ones, plus
  // matching tangent-space normal maps derived from the colour's luminance.
  // ======================================================================

  /** Like paint(), but fn(u, v, x, y, out) fills out[0..2] (no allocation per pixel). */
  function paintFast(size, fn) {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const o = [0, 0, 0];
    let i = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        fn(x / size, y / size, x, y, o);
        d[i++] = o[0];
        d[i++] = o[1];
        d[i++] = o[2];
        d[i++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return ctx;
  }

  /** A tileable fbm field sampled on a res x res grid (cheap to upsample). */
  function field(noise, res, freq, oct, ox, oy) {
    const f = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) f[y * res + x] = noise.fbm2((x / res) * freq + (ox || 0), (y / res) * freq + (oy || 0), oct, freq);
    }
    f.res = res;
    return f;
  }

  /** Bilinear, wrapping lookup, u and v in [0, 1). */
  function fld(f, u, v) {
    const res = f.res;
    const x = u * res;
    const y = v * res;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const xa = ((x0 % res) + res) % res;
    const ya = ((y0 % res) + res) % res;
    const xb = (xa + 1) % res;
    const yb = (ya + 1) % res;
    const a = f[ya * res + xa] + (f[ya * res + xb] - f[ya * res + xa]) * fx;
    const b = f[yb * res + xa] + (f[yb * res + xb] - f[yb * res + xa]) * fx;
    return a + (b - a) * fy;
  }

  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /** Tangent-space normal map from a canvas's luminance (wraps at the edges). */
  function normalMapFrom(canvas, strength) {
    const size = canvas.width;
    const src = canvas.getContext('2d').getImageData(0, 0, size, size).data;
    const h = new Float32Array(size * size);
    for (let i = 0; i < h.length; i++) h[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
    const out = makeCanvas(size);
    const octx = out.getContext('2d', { willReadFrequently: true });
    const img = octx.createImageData(size, size);
    const d = img.data;
    let i = 0;
    for (let y = 0; y < size; y++) {
      const yt = ((y - 1 + size) % size) * size;
      const yb = ((y + 1) % size) * size;
      const yc = y * size;
      for (let x = 0; x < size; x++) {
        const xl = (x - 1 + size) % size;
        const xr = (x + 1) % size;
        const dx = (h[yc + xr] - h[yc + xl]) * strength;
        const dy = (h[yb + x] - h[yt + x]) * strength;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        d[i++] = (-dx * il * 0.5 + 0.5) * 255;
        d[i++] = (dy * il * 0.5 + 0.5) * 255;
        d[i++] = (il * 0.5 + 0.5) * 255;
        d[i++] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  /** Cracks as meandering polylines (with the odd branch), wrapped over the tile edges. */
  function drawCracks(ctx, size, rng, count, widthMin, widthMax, style, S) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let n = 0; n < count; n++) {
      const strokes = [];
      const walk = (x, y, a, steps, w) => {
        const pts = [];
        for (let s = 0; s < steps; s++) {
          pts.push([x, y]);
          a += rng.range(-0.55, 0.55);
          const step = rng.range(5, 16) * S;
          x += Math.cos(a) * step;
          y += Math.sin(a) * step;
          if (s > 3 && rng.chance(0.07) && w > 1) walk(x, y, a + rng.range(-1.2, 1.2), Math.floor(steps / 2), w * 0.6);
        }
        strokes.push({ pts, w });
      };
      walk(rng.range(0, size), rng.range(0, size), rng.range(0, Math.PI * 2), rng.int(8, 24), rng.range(widthMin, widthMax) * S);
      drawWrapped(ctx, size, (g) => {
        for (const st of strokes) {
          g.strokeStyle = style;
          g.lineWidth = st.w;
          g.beginPath();
          st.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.stroke();
        }
      });
    }
  }

  /** Draw `fn` at the tile position and again wherever it spills over an edge. */
  function wrapNear(size, x, y, r, fn) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const px = x + ox * size;
        const py = y + oy * size;
        if (px < -r || py < -r || px > size + r || py > size + r) continue;
        fn(px, py);
      }
    }
  }

  function asphaltHD(size, rng, noise) {
    const S = size / 512;
    const low = field(noise, 128, 5, 4, 0, 0);
    const mid = field(noise, 256, 40, 3, 3, 5);
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const L = fld(low, u, v);
      const M = fld(mid, u, v);
      const grain = rng.next();
      const r2 = rng.next();
      let g = 0.235 + (L - 0.5) * 0.085 + (M - 0.5) * 0.075 + (grain - 0.5) * 0.11;
      if (r2 > 0.972) g += 0.05 + rng.next() * 0.13; // aggregate stones catching the light
      else if (r2 < 0.025) g -= 0.05; // pits between stones
      const k = g * 255;
      const warm = (L - 0.5) * 6;
      o[0] = k * 0.97 + warm;
      o[1] = k * 0.985;
      o[2] = k * 1.035 - warm;
    });
    // Repair patches, with a sealed seam round the edge.
    for (let n = 0; n < 3; n++) {
      const w = rng.range(0.1, 0.28) * size;
      const h = rng.range(0.08, 0.22) * size;
      const px = rng.range(0, size);
      const py = rng.range(0, size);
      const dark = rng.chance(0.65);
      drawWrapped(ctx, size, (g) => {
        g.fillStyle = dark ? 'rgba(6,6,8,0.30)' : 'rgba(150,150,155,0.10)';
        g.fillRect(px, py, w, h);
        g.strokeStyle = 'rgba(8,8,10,0.55)';
        g.lineWidth = 2.2 * S;
        g.strokeRect(px, py, w, h);
        g.strokeStyle = 'rgba(190,190,195,0.08)';
        g.lineWidth = 1 * S;
        g.strokeRect(px + 2.5 * S, py + 2.5 * S, w - 5 * S, h - 5 * S);
      });
    }
    // Oil drips and tyre-rubber smears.
    for (let n = 0; n < 7; n++) {
      const px = rng.range(0, size);
      const py = rng.range(0, size);
      const r = rng.range(10, 34) * S;
      const sq = rng.range(0.6, 1);
      const rot = rng.range(0, 3);
      wrapNear(size, px, py, r, (cx, cy) => {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, 'rgba(6,6,9,0.34)');
        grd.addColorStop(0.6, 'rgba(8,8,10,0.16)');
        grd.addColorStop(1, 'rgba(8,8,10,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * sq, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.lineCap = 'round';
    for (let n = 0; n < 7; n++) {
      const horiz = rng.chance(0.5);
      const a = rng.range(0, size);
      const b = rng.range(0, size);
      const len = rng.range(0.25, 0.6) * size;
      const wd = rng.range(8, 20) * S;
      const wob = rng.range(-6, 6);
      drawWrapped(ctx, size, (g) => {
        g.strokeStyle = 'rgba(4,4,6,0.075)';
        g.lineWidth = wd;
        g.beginPath();
        if (horiz) { g.moveTo(b, a); g.lineTo(b + len, a + wob); } else { g.moveTo(a, b); g.lineTo(a + wob, b + len); }
        g.stroke();
      });
    }
    drawCracks(ctx, size, rng, 8, 0.7, 1.7, 'rgba(10,10,12,0.62)', S);
    drawCracks(ctx, size, rng, 2, 2.5, 4, 'rgba(8,8,10,0.5)', S); // a couple of old wide ones
    return ctx.canvas;
  }

  function pavingHD(size, rng, noise, opts) {
    const S = size / 512;
    const tiles = opts.tiles;
    const tile = size / tiles;
    const tones = [];
    for (let i = 0; i < tiles * tiles; i++) tones.push(rng.range(-0.06, 0.06));
    const stainF = field(noise, 128, 5, 4, 0, 0);
    const fineF = field(noise, 256, 36, 2, 1, 2);
    const jw = (opts.joint || 1.5) * S;
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const tx = Math.floor(x / tile);
      const ty = Math.floor(y / tile);
      const lx = x - tx * tile;
      const ly = y - ty * tile;
      const edge = Math.min(lx, ly, tile - 1 - lx, tile - 1 - ly);
      let base = opts.base;
      if (opts.alt && (tx + ty) % 2 === 1) base = opts.alt;
      const stain = fld(stainF, u, v);
      const fine = fld(fineF, u, v);
      const grain = rng.next();
      let m = 1 + tones[ty * tiles + tx] + (stain - 0.5) * 0.22 + (fine - 0.5) * 0.1 + (grain - 0.5) * 0.09;
      // Slabs are a touch darker and dirtier at their edges.
      m *= 0.93 + 0.07 * smooth(0, 14 * S, edge);
      if (edge < jw) m *= 0.5; // sealed joint
      else if (edge < jw + 1.6 * S) m *= 1.07; // chamfer catching the light
      else if (edge < jw + 3.2 * S) m *= 0.93;
      if (grain > 0.985) m *= 1.12;
      else if (grain < 0.012) m *= 0.8;
      o[0] = base[0] * m;
      o[1] = base[1] * m;
      o[2] = base[2] * m;
    });
    ctx.lineCap = 'round';
    // Chewing gum, dirt spots and the odd hairline crack.
    for (let n = 0; n < 60; n++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const r = rng.range(0.8, 2.6) * S;
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(40,36,32,0.30)' : 'rgba(250,246,236,0.12)';
      wrapNear(size, x, y, r, (cx, cy) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); });
    }
    drawCracks(ctx, size, rng, tiles * tiles > 4 ? 6 : 3, 0.6, 1.2, 'rgba(30,28,26,0.5)', S);
    for (let n = 0; n < 3; n++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const r = rng.range(14, 40) * S;
      wrapNear(size, x, y, r, (cx, cy) => {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, 'rgba(40,34,26,0.20)');
        grd.addColorStop(1, 'rgba(40,34,26,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    }
    return ctx.canvas;
  }

  function grassHD(size, rng, noise) {
    const S = size / 512;
    const patchF = field(noise, 128, 4, 4, 0, 0);
    const bareF = field(noise, 128, 7, 3, 9, 4);
    const clumpF = field(noise, 256, 30, 3, 5, 7);
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const patch = fld(patchF, u, v);
      const clump = fld(clumpF, u, v);
      const bare = smooth(0.66, 0.74, fld(bareF, u, v)) * smooth(0.45, 0.65, clump);
      const dry = Math.max(0, patch - 0.55) * 2.0;
      const blade = rng.next();
      const m = 0.68 + clump * 0.55 + (blade - 0.5) * 0.24;
      let r = (46 + dry * 62) * m;
      let g = (94 + dry * 30) * m;
      let b = (32 + dry * 10) * m;
      r += (104 - r) * bare * 0.7;
      g += (88 - g) * bare * 0.7;
      b += (56 - b) * bare * 0.7;
      o[0] = r;
      o[1] = g;
      o[2] = b;
    });
    // Blades: thousands of short strokes, lighter and darker than the base.
    ctx.lineCap = 'round';
    const palette = ['rgba(120,170,60,0.32)', 'rgba(22,58,22,0.34)', 'rgba(150,176,70,0.22)', 'rgba(60,110,36,0.3)'];
    for (const col of palette) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.1 * S + 0.3;
      for (let batch = 0; batch < 6; batch++) {
        ctx.beginPath();
        for (let n = 0; n < 1100; n++) {
          const x = rng.range(0, size);
          const y = rng.range(0, size);
          const a = -Math.PI / 2 + rng.range(-0.9, 0.9);
          const len = rng.range(3, 9) * S;
          wrapNear(size, x, y, 12 * S, (cx, cy) => {
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          });
        }
        ctx.stroke();
      }
    }
    // Clover patches and the odd wildflower.
    for (let n = 0; n < 20; n++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const r = rng.range(8, 22) * S;
      wrapNear(size, x, y, r, (cx, cy) => {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, 'rgba(46,112,44,0.38)');
        grd.addColorStop(1, 'rgba(46,112,44,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    }
    const flowers = ['rgba(240,240,228,0.9)', 'rgba(240,212,70,0.9)', 'rgba(236,236,226,0.85)', 'rgba(176,130,206,0.85)', 'rgba(244,150,170,0.8)'];
    for (let n = 0; n < 110; n++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const r = rng.range(0.7, 1.4) * S;
      ctx.fillStyle = flowers[n % flowers.length];
      wrapNear(size, x, y, r, (cx, cy) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); });
    }
    return ctx.canvas;
  }

  /** Runway / apron / yard concrete: 2x2 poured slabs with sealed joints, stains, tyre marks. */
  function concreteHD(size, rng, noise) {
    const S = size / 512;
    const slabs = 2;
    const slab = size / slabs;
    const tones = [];
    for (let i = 0; i < slabs * slabs; i++) tones.push(rng.range(-0.05, 0.05));
    const stainF = field(noise, 128, 6, 4, 0, 0);
    const fineF = field(noise, 256, 48, 3, 2, 3);
    const jw = 2 * S;
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const tx = Math.floor(x / slab);
      const ty = Math.floor(y / slab);
      const lx = x - tx * slab;
      const ly = y - ty * slab;
      const edge = Math.min(lx, ly, slab - 1 - lx, slab - 1 - ly);
      const stain = fld(stainF, u, v);
      const fine = fld(fineF, u, v);
      const g = rng.next();
      let k = 152 * (0.88 + tones[ty * slabs + tx] + (stain - 0.5) * 0.26 + (fine - 0.5) * 0.12 + (g - 0.5) * 0.07);
      k *= 0.95 + 0.05 * smooth(0, 16 * S, edge);
      if (g > 0.99) k *= 1.1;
      else if (g < 0.008) k *= 0.78; // air pits
      if (edge < jw) k *= 0.58;
      else if (edge < jw + 2 * S) k *= 1.06;
      o[0] = k;
      o[1] = k * 0.99;
      o[2] = k * 0.955;
    });
    // Hairline cracks, tyre-rubber arcs and oil.
    drawCracks(ctx, size, rng, 5, 0.6, 1.4, 'rgba(40,38,34,0.5)', S);
    ctx.lineCap = 'round';
    for (let n = 0; n < 5; n++) {
      const cx = rng.range(0, size);
      const cy = rng.range(0, size);
      const rad = rng.range(80, 260) * S;
      const a0 = rng.range(0, 6.28);
      const span = rng.range(0.3, 0.9);
      const wd = rng.range(5, 9) * S;
      for (const off of [0, 11 * S]) {
        drawWrapped(ctx, size, (g) => {
          g.strokeStyle = 'rgba(14,14,16,0.10)';
          g.lineWidth = wd;
          g.beginPath();
          g.arc(cx, cy, rad + off, a0, a0 + span);
          g.stroke();
        });
      }
    }
    for (let n = 0; n < 4; n++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const r = rng.range(14, 38) * S;
      wrapNear(size, x, y, r, (cx, cy) => {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, 'rgba(24,20,16,0.30)');
        grd.addColorStop(1, 'rgba(24,20,16,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    }
    return ctx.canvas;
  }

  /** Gravel: hundreds of individually shaded stones over a dark bed. */
  function gravelHD(size, rng, noise) {
    const S = size / 512;
    const bedF = field(noise, 128, 8, 3, 0, 0);
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const n = fld(bedF, u, v);
      const g = rng.next();
      const k = 62 * (0.7 + n * 0.5 + (g - 0.5) * 0.3);
      o[0] = k;
      o[1] = k * 0.96;
      o[2] = k * 0.9;
    });
    const tones = [[150, 142, 128], [120, 114, 104], [176, 164, 140], [96, 92, 86], [140, 120, 98]];
    const count = Math.round(2600 * S * S);
    for (let n = 0; n < count; n++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const rx = rng.range(2.2, 6.5) * S;
      const ry = rx * rng.range(0.6, 1);
      const rot = rng.range(0, 3.14);
      const t = rng.pick(tones);
      const k = rng.range(0.82, 1.12);
      wrapNear(size, x, y, rx + 2, (cx, cy) => {
        const grd = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.35, 0, cx, cy, rx * 1.1);
        grd.addColorStop(0, `rgb(${Math.min(255, t[0] * k * 1.18) | 0},${Math.min(255, t[1] * k * 1.18) | 0},${Math.min(255, t[2] * k * 1.18) | 0})`);
        grd.addColorStop(1, `rgb(${(t[0] * k * 0.62) | 0},${(t[1] * k * 0.62) | 0},${(t[2] * k * 0.62) | 0})`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    return ctx.canvas;
  }

  /** Dry beach / outskirts sand with wind ripples. */
  function sandHD(size, rng, noise) {
    const warpF = field(noise, 128, 4, 3, 0, 0);
    const fineF = field(noise, 256, 64, 2, 1, 1);
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const w = fld(warpF, u, v);
      const ripple = 0.5 + 0.5 * Math.sin((u * 5 + v * 2 + w * 1.6) * Math.PI * 2);
      const fine = fld(fineF, u, v);
      const g = rng.next();
      const m = 0.84 + ripple * 0.12 + (fine - 0.5) * 0.14 + (g - 0.5) * 0.12 + (w - 0.5) * 0.1;
      o[0] = 206 * m;
      o[1] = 184 * m;
      o[2] = 140 * m;
    });
    return ctx.canvas;
  }

  /** Large-scale mottling used to break tiling on huge surfaces (sampled in world space, see materials.js). */
  function macroMottle(size, rng, noise) {
    const a = field(noise, 128, 4, 4, 0, 0);
    const b = field(noise, 128, 12, 3, 4, 6);
    const ctx = paintFast(size, (u, v, x, y, o) => {
      const k = (0.62 * fld(a, u, v) + 0.38 * fld(b, u, v)) * 255;
      o[0] = o[1] = o[2] = k;
    });
    return ctx.canvas;
  }

  // ======================================================================
  // Vegetation atlas: one RGBA texture holding every leaf, frond and bark
  // the trees and palms use, so a whole tree is one material (one draw call,
  // one shadow draw). Leaves are alpha-tested cards; bark cells are tiled
  // by the vegetation shader (materials.js), which repeats a cell inside
  // its own rectangle when a vertex's V coordinate is >= 100.
  // ======================================================================
  const ATLAS_SIZE = 1024;
  const ATLAS = {
    size: ATLAS_SIZE,
    cells: {
      oak: { x: 0, y: 0, w: 256, h: 256 },
      bloom: { x: 256, y: 0, w: 256, h: 256 },
      pine: { x: 512, y: 0, w: 256, h: 256 },
      bush: { x: 768, y: 0, w: 256, h: 256 },
      frondA: { x: 0, y: 256, w: 1024, h: 128 },
      frondB: { x: 0, y: 384, w: 1024, h: 128 },
      fan: { x: 0, y: 512, w: 256, h: 256 },
      barkOak: { x: 256, y: 512, w: 256, h: 256 },
      barkPalm: { x: 512, y: 512, w: 256, h: 256 },
      barkDate: { x: 768, y: 512, w: 256, h: 256 },
      white: { x: 0, y: 768, w: 64, h: 64 },
      barkRoyal: { x: 256, y: 768, w: 256, h: 256 },
      barkPine: { x: 512, y: 768, w: 256, h: 256 },
      bloom2: { x: 768, y: 768, w: 256, h: 256 },
    },
    /** Bark cells in the order the shader indexes them (V >= 100 * (index + 1)). */
    barks: ['barkOak', 'barkPalm', 'barkDate', 'barkRoyal', 'barkPine'],
    /** UV rectangle (V up) of a cell, `inset` pixels in from its edge. */
    rect(name, inset) {
      const c = this.cells[name];
      const i = inset === undefined ? 1.5 : inset;
      const S = this.size;
      return { u0: (c.x + i) / S, u1: (c.x + c.w - i) / S, v0: 1 - (c.y + c.h - i) / S, v1: 1 - (c.y + i) / S };
    },
  };

  function leafPath(g, len, wid, curl) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.25, -wid * 1.1 + curl, len * 0.75, -wid * 0.8 + curl, len, curl * 0.5);
    g.bezierCurveTo(len * 0.75, wid * 0.8 + curl, len * 0.25, wid * 1.1 + curl, 0, 0);
    g.closePath();
  }

  function drawLeaf(g, x, y, ang, len, wid, fill, vein, curl) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    leafPath(g, len, wid, curl || 0);
    g.fillStyle = fill;
    g.fill();
    if (vein) {
      g.strokeStyle = vein;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(len * 0.05, 0);
      g.quadraticCurveTo(len * 0.5, (curl || 0) * 0.8, len * 0.92, (curl || 0) * 0.4);
      g.stroke();
    }
    g.restore();
  }

  function paintLeafCluster(g, cell, rng, opts) {
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, cell.w, cell.h);
    g.clip();
    g.translate(cell.x, cell.y);
    const cx = cell.w / 2;
    const cy = cell.h / 2;
    const R = cell.w * 0.41;
    // Twigs first.
    g.strokeStyle = 'rgb(70,54,38)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, 6.28);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7);
      g.stroke();
    }
    const passes = [
      { n: opts.n, cols: opts.dark, k: 1 },
      { n: Math.round(opts.n * 0.8), cols: opts.mid, k: 0.9 },
      { n: Math.round(opts.n * 0.5), cols: opts.light, k: 0.75 },
    ];
    for (const p of passes) {
      for (let i = 0; i < p.n; i++) {
        const r = R * Math.sqrt(rng.next()) * p.k;
        const a = rng.range(0, 6.28);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const ang = a + rng.range(-0.9, 0.9);
        const len = rng.range(opts.len[0], opts.len[1]);
        const wid = len * rng.range(opts.aspect[0], opts.aspect[1]);
        drawLeaf(g, x, y, ang, len, wid, rng.pick(p.cols), opts.vein, rng.range(-3, 3));
      }
    }
    g.restore();
  }

  function paintBloom(g, cell, rng, count, rMin, rMax, petals) {
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, cell.w, cell.h);
    g.clip();
    g.translate(cell.x, cell.y);
    const c = cell.w / 2;
    const R = cell.w * 0.4;
    for (let n = 0; n < count; n++) {
      const rr = R * Math.sqrt(rng.next());
      const a = rng.range(0, 6.28);
      const x = c + Math.cos(a) * rr;
      const y = c + Math.sin(a) * rr;
      const fr = rng.range(rMin, rMax);
      const rot = rng.range(0, 6.28);
      const shade = rng.range(0.86, 1);
      for (let p = 0; p < petals; p++) {
        const pa = rot + (p / petals) * Math.PI * 2;
        g.fillStyle = `rgb(${(250 * shade) | 0},${(244 * shade) | 0},${(246 * shade) | 0})`;
        g.beginPath();
        g.ellipse(x + Math.cos(pa) * fr * 0.55, y + Math.sin(pa) * fr * 0.55, fr * 0.55, fr * 0.36, pa, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgb(255,214,120)';
      g.beginPath();
      g.arc(x, y, fr * 0.2, 0, Math.PI * 2);
      g.fill();
    }
    // A scatter of leaves peeking out, so the cluster is not all petals.
    for (let n = 0; n < 14; n++) {
      const rr = R * Math.sqrt(rng.next());
      const a = rng.range(0, 6.28);
      drawLeaf(g, c + Math.cos(a) * rr, c + Math.sin(a) * rr, a + rng.range(-1, 1), rng.range(26, 38), rng.range(7, 11), 'rgb(120,150,90)', null, 0);
    }
    g.restore();
  }

  function paintPineSpray(g, cell, rng) {
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, cell.w, cell.h);
    g.clip();
    g.translate(cell.x, cell.y);
    const cx = cell.w / 2;
    const sprays = [[cx, cell.h - 6, 0, 1], [cx - 70, cell.h - 20, -0.5, 0.6], [cx + 70, cell.h - 20, 0.5, 0.6]];
    for (const [sx, sy, tilt, sc] of sprays) {
      g.save();
      g.translate(sx, sy);
      g.rotate(tilt);
      const H = (cell.h - 20) * sc;
      g.strokeStyle = 'rgb(86,62,40)';
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -H);
      g.stroke();
      const N = Math.round(62 * sc);
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const y = -t * H;
        const len = (36 + 38 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12))) * (0.85 + 0.3 * rng.next()) * (0.55 + 0.45 * sc);
        for (const side of [-1, 1]) {
          const ang = -Math.PI / 2 + side * rng.range(0.7, 1.15);
          const tx = Math.cos(ang) * len;
          const ty = y + Math.sin(ang) * len;
          const grd = g.createLinearGradient(0, y, tx, ty);
          grd.addColorStop(0, 'rgb(34,66,32)');
          grd.addColorStop(1, 'rgb(84,128,58)');
          g.strokeStyle = grd;
          g.lineWidth = 2.4;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(tx, ty);
          g.stroke();
          // Needle fringe along each shoot.
          g.lineWidth = 1.3;
          for (let k = 1; k < 5; k++) {
            const f = k / 5;
            const px = tx * f;
            const py = y + (ty - y) * f;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px + Math.cos(ang - side * 0.9) * len * 0.3, py + Math.sin(ang - side * 0.9) * len * 0.3 - 3);
            g.stroke();
          }
        }
      }
      g.restore();
    }
    g.restore();
  }

  /** A palm frond lying along +x in a wide strip: rachis plus pairs of leaflets. */
  function paintFrond(g, cell, rng, style) {
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, cell.w, cell.h);
    g.clip();
    g.translate(cell.x, cell.y);
    const W = cell.w;
    const mid = cell.h / 2;
    const x0 = 8;
    const x1 = W - 6;
    const N = style === 'date' ? 62 : 100;
    const maxL = cell.h * (style === 'date' ? 0.5 : 0.46);
    const lw = style === 'date' ? 5.4 : 6.2;
    for (let i = 0; i < N; i++) {
      const f = i / N;
      const x = x0 + f * (x1 - x0);
      const prof = Math.sin(Math.PI * Math.min(1, f * 0.9 + 0.1));
      const base = style === 'date' ? 0.5 : 0.35;
      const L = maxL * (base + (1 - base) * prof) * (1 - 0.25 * f) * rng.range(0.9, 1.08);
      for (const side of [-1, 1]) {
        const fwd = style === 'date' ? 0.35 + rng.range(-0.1, 0.15) : 0.62 + rng.range(-0.08, 0.08);
        const tx = x + L * fwd;
        const ty = mid + side * L * (style === 'date' ? 0.96 : 0.82);
        const bow = side * L * 0.08;
        const grd = g.createLinearGradient(x, mid, tx, ty);
        const lt = rng.range(0.9, 1.1);
        if (style === 'date') {
          grd.addColorStop(0, `rgb(${(70 * lt) | 0},${(104 * lt) | 0},${(62 * lt) | 0})`);
          grd.addColorStop(1, `rgb(${(128 * lt) | 0},${(158 * lt) | 0},${(96 * lt) | 0})`);
        } else {
          grd.addColorStop(0, `rgb(${(50 * lt) | 0},${(104 * lt) | 0},${(36 * lt) | 0})`);
          grd.addColorStop(1, `rgb(${(110 * lt) | 0},${(160 * lt) | 0},${(60 * lt) | 0})`);
        }
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x - lw * 0.4, mid);
        g.quadraticCurveTo(x + (tx - x) * 0.5 - side * 0, mid + (ty - mid) * 0.5 + bow, tx, ty);
        g.quadraticCurveTo(x + (tx - x) * 0.5 + lw * 0.6, mid + (ty - mid) * 0.5 + bow, x + lw * 0.9, mid);
        g.closePath();
        g.fill();
      }
    }
    // Rachis (midrib), tapering towards the tip.
    const grd = g.createLinearGradient(x0, 0, x1, 0);
    grd.addColorStop(0, 'rgb(150,150,70)');
    grd.addColorStop(1, 'rgb(120,150,70)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, mid - 3.2);
    g.lineTo(x1, mid - 0.8);
    g.lineTo(x1, mid + 0.8);
    g.lineTo(0, mid + 3.2);
    g.closePath();
    g.fill();
    g.restore();
  }

  function paintFan(g, cell, rng) {
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, cell.w, cell.h);
    g.clip();
    g.translate(cell.x, cell.y);
    const bx = cell.w / 2;
    const by = cell.h - 10;
    const segs = 23;
    const span = (210 * Math.PI) / 180;
    for (let i = 0; i < segs; i++) {
      const a = -span / 2 + (i / (segs - 1)) * span; // from vertical
      const L = 112 + 108 * Math.cos(a * 0.9) * (0.92 + 0.12 * rng.next());
      const arc = (span / (segs - 1)) * 0.95;
      g.save();
      g.translate(bx, by);
      g.rotate(a);
      const lt = rng.range(0.88, 1.1);
      const grd = g.createLinearGradient(0, 0, 0, -L);
      grd.addColorStop(0, `rgb(${(70 * lt) | 0},${(100 * lt) | 0},${(40 * lt) | 0})`);
      grd.addColorStop(1, `rgb(${(96 * lt) | 0},${(150 * lt) | 0},${(56 * lt) | 0})`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(-2, -8);
      g.lineTo(-L * arc * 0.5, -L * 0.62);
      g.lineTo(0, -L); // pointed tip
      g.lineTo(L * arc * 0.5, -L * 0.62);
      g.lineTo(2, -8);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(190,200,110,0.7)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(0, -L * 0.96);
      g.stroke();
      g.restore();
    }
    // Petiole.
    g.strokeStyle = 'rgb(120,130,60)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(bx, cell.h);
    g.lineTo(bx, by - 6);
    g.stroke();
    g.restore();
  }

  function barkTile(size, rng, noise, kind) {
    const warp = field(noise, 64, 4, 3, 0, 0);
    const fine = field(noise, 128, 24, 2, 2, 3);
    const blot = field(noise, 64, 3, 3, 7, 2);
    const hash = (a, b) => {
      let h = Math.imul(a * 73856093 ^ b * 19349663, 2654435761) >>> 0;
      h ^= h >>> 15;
      return (h % 1000) / 1000;
    };
    let vor = null;
    if (kind === 'pine') {
      const cols = 6;
      const rows = 11;
      vor = { cols, rows, pts: [] };
      for (let i = 0; i < cols * rows; i++) vor.pts.push([rng.next(), rng.next(), rng.next()]);
    }
    return paintFast(size, (u, v, x, y, o) => {
      const w = fld(warp, u, v);
      const f = fld(fine, u, v);
      const b = fld(blot, u, v);
      const g = rng.next();
      let r;
      let gr;
      let bl;
      if (kind === 'oak') {
        const t = Math.abs(Math.sin((u * 17 + w * 2.6) * Math.PI));
        const fis = smooth(0.55, 0.95, t) * (0.35 + 0.9 * fld(warp, (u * 2) % 1, (v * 3) % 1));
        const k = 0.78 + f * 0.5 + (g - 0.5) * 0.14;
        const m = Math.min(0.8, fis);
        r = 118 * k * (1 - m) + 52 * m;
        gr = 104 * k * (1 - m) + 44 * m;
        bl = 90 * k * (1 - m) + 38 * m;
      } else if (kind === 'palm') {
        const t = 0.5 + 0.5 * Math.sin((v * 8 + (w - 0.5) * 0.5) * Math.PI * 2);
        const groove = smooth(0.62, 1, t);
        const streak = 0.9 + 0.1 * Math.sin((u * 48 + w * 5) * Math.PI);
        const k = (0.8 + f * 0.4 + (g - 0.5) * 0.14) * streak * (1 - 0.18 * (1 - t));
        r = 150 * k * (1 - groove * 0.6);
        gr = 128 * k * (1 - groove * 0.62);
        bl = 100 * k * (1 - groove * 0.66);
      } else if (kind === 'date') {
        const a = (u * 5 + v * 5) % 1;
        const c = (u * 5 - v * 5 + 5) % 1;
        const dd = Math.max(Math.abs(a - 0.5), Math.abs(c - 0.5));
        const ia = Math.floor((u * 5 + v * 5) % 10);
        const ib = Math.floor(((u * 5 - v * 5) % 10 + 10) % 10);
        const tone = 0.75 + hash(ia, ib) * 0.5;
        const seam = smooth(0.36, 0.5, dd) * 0.75;
        const k = tone * (0.8 + f * 0.45) * (1 + (g - 0.5) * 0.14);
        r = 150 * k * (1 - seam * 0.6);
        gr = 120 * k * (1 - seam * 0.64);
        bl = 84 * k * (1 - seam * 0.68);
      } else if (kind === 'royal') {
        const t = 0.5 + 0.5 * Math.sin((v * 3 + (w - 0.5) * 0.3) * Math.PI * 2);
        const ring = smooth(0.8, 1, t);
        const streak = 0.94 + 0.06 * Math.sin((u * 60 + w * 6) * Math.PI);
        const k = (0.9 + f * 0.2 + (g - 0.5) * 0.07) * streak * (1 - ring * 0.22);
        const lichen = smooth(0.58, 0.8, b) * 0.15;
        r = 178 * k * (1 - lichen);
        gr = 172 * k;
        bl = 160 * k * (1 - lichen * 0.8);
      } else {
        // pine plates: wrapped voronoi
        const cx = u * vor.cols;
        const cy = v * vor.rows;
        const ix = Math.floor(cx);
        const iy = Math.floor(cy);
        let d1 = 9;
        let d2 = 9;
        let id = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const nx = (((ix + i) % vor.cols) + vor.cols) % vor.cols;
            const ny = (((iy + j) % vor.rows) + vor.rows) % vor.rows;
            const p = vor.pts[ny * vor.cols + nx];
            const dx = ix + i + p[0] - cx;
            const dy = (iy + j + p[1] - cy) * 0.5; // plates are taller than wide
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < d1) { d2 = d1; d1 = dist; id = p[2]; } else if (dist < d2) d2 = dist;
          }
        }
        const plate = smooth(0.0, 0.14, d2 - d1);
        const k = (0.7 + id * 0.5) * (0.8 + f * 0.4) * (1 + (g - 0.5) * 0.12) * (0.75 + 0.25 * plate);
        r = 118 * k * (0.25 + 0.75 * plate);
        gr = 82 * k * (0.25 + 0.75 * plate);
        bl = 60 * k * (0.25 + 0.75 * plate);
      }
      o[0] = r;
      o[1] = gr;
      o[2] = bl;
    }).canvas;
  }

  function vegetationAtlasCanvas() {
    const rng = new VH.RNG('vicehaven-vegetation');
    const noise = new VH.ValueNoise(777);
    const c = makeCanvas(ATLAS_SIZE);
    const g = c.getContext('2d', { willReadFrequently: true });
    const C = ATLAS.cells;
    paintLeafCluster(g, C.oak, rng, {
      n: 56, len: [34, 54], aspect: [0.36, 0.52], vein: 'rgba(190,210,120,0.55)',
      dark: ['rgb(44,86,36)', 'rgb(50,92,38)', 'rgb(40,78,34)'],
      mid: ['rgb(66,116,44)', 'rgb(72,122,46)', 'rgb(60,108,42)'],
      light: ['rgb(98,148,58)', 'rgb(110,158,62)', 'rgb(88,138,54)'],
    });
    paintBloom(g, C.bloom, rng, 30, 11, 17, 5);
    paintPineSpray(g, C.pine, rng);
    paintLeafCluster(g, C.bush, rng, {
      n: 120, len: [20, 32], aspect: [0.4, 0.55], vein: null,
      dark: ['rgb(36,78,34)', 'rgb(40,84,36)'],
      mid: ['rgb(56,108,42)', 'rgb(62,114,44)'],
      light: ['rgb(86,138,54)', 'rgb(96,148,58)'],
    });
    paintFrond(g, C.frondA, rng, 'queen');
    paintFrond(g, C.frondB, rng, 'date');
    paintFan(g, C.fan, rng);
    paintBloom(g, C.bloom2, rng, 70, 5, 8, 5);
    g.fillStyle = 'rgb(255,255,255)';
    g.fillRect(C.white.x, C.white.y, C.white.w, C.white.h);
    const barks = { barkOak: 'oak', barkPalm: 'palm', barkDate: 'date', barkRoyal: 'royal', barkPine: 'pine' };
    for (const key of Object.keys(barks)) g.drawImage(barkTile(256, rng, noise, barks[key]), C[key].x, C[key].y);
    return c;
  }

  /** Canvas -> mipmapped sRGB DataTexture with clean colour under transparent pixels (no dark halos). */
  function atlasTexture(canvas, anisotropy) {
    const W = canvas.width;
    const src = canvas.getContext('2d').getImageData(0, 0, W, W).data;
    // Mean opaque colour per cell, to fill the colour under transparent pixels.
    for (const key of Object.keys(ATLAS.cells)) {
      const c = ATLAS.cells[key];
      let r = 0, gg = 0, b = 0, n = 0;
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          const i = (y * W + x) * 4;
          if (src[i + 3] > 200) { r += src[i]; gg += src[i + 1]; b += src[i + 2]; n++; }
        }
      }
      if (!n) continue;
      r /= n; gg /= n; b /= n;
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          const i = (y * W + x) * 4;
          if (src[i + 3] < 48) { src[i] = r; src[i + 1] = gg; src[i + 2] = b; }
        }
      }
    }
    // Fill the atlas's unused area with a neutral green too.
    const out = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) {
      out.set(src.subarray(y * W * 4, (y + 1) * W * 4), (W - 1 - y) * W * 4);
    }
    const tex = new THREE.DataTexture(out, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = anisotropy || 1;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }

  // ------------------------------------------------------------ public API
  const Textures = {
    list: {},
    ATLAS,

    /** Generate every texture, yielding between them. onProgress(0..1, label). */
    async generate(anisotropy, onProgress) {
      const rng = new VH.RNG('vicehaven-textures');
      const noise = new VH.ValueNoise(4242);
      const jobs = [
        ['asphalt', 'Paving the roads', () => toTexture(asphaltHD(1024, rng, noise), true, anisotropy)],
        ['sidewalk', 'Laying pavements', () => toTexture(pavingHD(1024, rng, noise, { tiles: 2, base: [184, 180, 170] }), true, anisotropy)],
        ['plaza', 'Tiling the plaza', () => toTexture(pavingHD(1024, rng, noise, { tiles: 4, base: [200, 191, 175], alt: [184, 178, 168], joint: 1.2 }), true, anisotropy)],
        ['grass', 'Growing grass', () => toTexture(grassHD(1024, rng, noise), true, anisotropy)],
        ['concrete', 'Pouring concrete', () => toTexture(concreteHD(1024, rng, noise), true, anisotropy)],
        ['wood', 'Cutting boardwalk planks', () => toTexture(wood(512, rng, noise), true, anisotropy)],
        ['gravel', 'Spreading roof gravel', () => toTexture(gravelHD(512, rng, noise), true, anisotropy)],
        ['grime', 'Weathering walls', () => toTexture(grime(256, rng, noise), false, anisotropy)],
        ['sand', 'Raking the sand', () => toTexture(sandHD(512, rng, noise), true, anisotropy)],
        ['macro', 'Mottling the ground', () => toTexture(macroMottle(256, rng, noise), false, anisotropy)],
        ['vegAtlas', 'Growing trees', () => atlasTexture(vegetationAtlasCanvas(), anisotropy)],
        // Tangent-space normal maps (same UVs as the colour textures).
        ['asphaltN', 'Roughing up the roads', () => toTexture(normalMapFrom(this.list.asphalt.image, 5.5), false, anisotropy)],
        ['sidewalkN', 'Chamfering slabs', () => toTexture(normalMapFrom(this.list.sidewalk.image, 4.5), false, anisotropy)],
        ['plazaN', 'Chamfering tiles', () => toTexture(normalMapFrom(this.list.plaza.image, 4.5), false, anisotropy)],
        ['concreteN', 'Casting joints', () => toTexture(normalMapFrom(this.list.concrete.image, 4), false, anisotropy)],
        ['grassN', 'Combing the lawn', () => toTexture(normalMapFrom(this.list.grass.image, 2.4), false, anisotropy)],
        ['gravelN', 'Raking gravel', () => toTexture(normalMapFrom(this.list.gravel.image, 5), false, anisotropy)],
      ];
      for (let i = 0; i < jobs.length; i++) {
        const [key, label, make] = jobs[i];
        if (onProgress) onProgress(i / jobs.length, label);
        await VH.util.nextFrameOrTimeout(30);
        this.list[key] = make();
      }
      if (onProgress) onProgress(1, 'Textures ready');
      return this.list;
    },

    get(key) {
      return this.list[key];
    },
  };

  VH.Textures = Textures;
})();
