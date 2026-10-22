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

  // ------------------------------------------------------------ public API
  const Textures = {
    list: {},

    /** Generate every texture, yielding between them. onProgress(0..1, label). */
    async generate(anisotropy, onProgress) {
      const rng = new VH.RNG('vicehaven-textures');
      const noise = new VH.ValueNoise(4242);
      const jobs = [
        ['asphalt', 'Paving the roads', () => toTexture(asphalt(512, rng, noise), true, anisotropy)],
        ['sidewalk', 'Laying pavements', () => toTexture(paving(512, rng, noise, { tiles: 2, base: [184, 180, 170] }), true, anisotropy)],
        ['plaza', 'Tiling the plaza', () => toTexture(paving(512, rng, noise, { tiles: 4, base: [200, 191, 175], alt: [184, 178, 168] }), true, anisotropy)],
        ['grass', 'Growing grass', () => toTexture(grass(512, rng, noise), true, anisotropy)],
        ['concrete', 'Pouring concrete', () => toTexture(concrete(256, rng, noise), true, anisotropy)],
        ['wood', 'Cutting boardwalk planks', () => toTexture(wood(512, rng, noise), true, anisotropy)],
        ['gravel', 'Spreading roof gravel', () => toTexture(gravel(256, rng, noise), true, anisotropy)],
        ['grime', 'Weathering walls', () => toTexture(grime(256, rng, noise), false, anisotropy)],
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
