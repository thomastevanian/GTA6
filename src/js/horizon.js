/*
 * horizon.js — the land beyond the edge of the map.
 *
 * Without it the playable rectangle ends in a hard "table edge" with the sky
 * showing under it, which is very obvious from a plane. This adds a wide
 * ring of rolling scrubland that climbs into hills and ridges away from the
 * map (and fades into the fog), a few kilometres across. It leaves out
 * the rectangle itself (the city's own ground is there) and the sea.
 *
 *   new VH.Horizon(game)      a world system (see WORLD_SYSTEMS in main.js)
 *   .update()                 keeps the sun/ambient light in step
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep } = VH.math;

  // ---- cheap value noise on the CPU (the terrain is built once)
  function hash(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), ux), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), ux), uz);
  }
  function fbm(x, z, oct) {
    let s = 0;
    let a = 0.5;
    for (let i = 0; i < oct; i++) {
      s += a * vnoise(x, z);
      x = x * 2.03 + 17.1;
      z = z * 2.03 + 3.7;
      a *= 0.5;
    }
    return s;
  }

  const VERT = /* glsl */ `
    #include <common>
    #include <fog_pars_vertex>
    attribute vec3 color;
    varying vec3 vColor;
    varying vec3 vN;
    varying vec3 vWorld;
    void main() {
      vColor = color;
      vN = normal;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

  const FRAG = /* glsl */ `
    #include <common>
    #include <fog_pars_fragment>
    uniform vec3 uSunLight;
    uniform vec3 uSunDir;
    uniform vec3 uSky;
    uniform vec3 uGround;
    uniform vec4 uRect;   // minX, maxX, minZ, maxZ of the playable map
    uniform float uSeaX;
    varying vec3 vColor;
    varying vec3 vN;
    varying vec3 vWorld;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      // The map itself and the sea have their own ground.
      if (vWorld.x > uRect.x - 0.5 && vWorld.x < uRect.y + 0.5 && vWorld.z > uRect.z - 0.5 && vWorld.z < uRect.w + 0.5) discard;
      if (vWorld.x > uSeaX) discard;
      vec3 n = normalize(vN);
      float ndl = max(dot(n, uSunDir), 0.0);
      vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
      // Large-scale mottling and fine grain so the hills are not flat colour.
      float m = 0.82 + 0.36 * vn(vWorld.xz * 0.012) * (0.6 + 0.4 * vn(vWorld.xz * 0.11));
      vec3 col = vColor * m * (uSunLight * ndl + amb);
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }
  `;

  class Horizon {
    constructor(game) {
      this.game = game;
      const cfg = game.layout.config;
      const b = cfg.bounds;
      const rect = { x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
      const sea = cfg.seawallX;
      const SPAN = 9000; // half-width of the whole ring
      const N = 190; // cells per side
      const cell = (SPAN * 2) / N;
      const pos = new Float32Array((N + 1) * (N + 1) * 3);
      const col = new Float32Array((N + 1) * (N + 1) * 3);
      const tint = (hex) => new THREE.Color(hex);
      const scrub = tint(0x8a7f55);
      const grass = tint(0x6b7a45);
      const dry = tint(0xa89868);
      const rock = tint(0x6f6258);
      const high = tint(0x9a8e80);
      const c = new THREE.Color();

      const outside = (x, z) => {
        const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
        const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
        return Math.hypot(dx, dz);
      };
      const heightAt = (x, z) => {
        const d = outside(x, z);
        if (d <= 0) return -0.4; // under the city's own ground (and discarded in the shader)
        const ramp = smoothstep(60, 1000, d);
        const far = smoothstep(400, 3000, d);
        const roll = (fbm(x / 240, z / 240, 4) - 0.35) * 40 * smoothstep(20, 300, d);
        const ridge = 1 - Math.abs(2 * fbm(x / 1100 + 5.3, z / 1100 - 2.1, 5) - 1);
        const massif = fbm(x / 3000 - 9, z / 3000 + 4, 3);
        const mountains = Math.pow(ridge, 1.5) * (180 + 700 * massif) * ramp + far * 220 * massif;
        return 0.1 + Math.max(0, roll) * ramp + mountains * 0.6;
      };

      let k = 0;
      const hs = new Float32Array((N + 1) * (N + 1));
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const x = -SPAN + i * cell + (rect.x0 + rect.x1) / 2;
          const z = -SPAN + j * cell + (rect.z0 + rect.z1) / 2;
          const y = heightAt(x, z);
          hs[j * (N + 1) + i] = y;
          pos[k] = x;
          pos[k + 1] = y;
          pos[k + 2] = z;
          k += 3;
        }
      }
      // Colour from altitude, slope and a regional mix (green near the city, drier further out).
      k = 0;
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const y = hs[j * (N + 1) + i];
          const x = pos[k];
          const z = pos[k + 2];
          const hl = hs[j * (N + 1) + Math.max(i - 1, 0)];
          const hr = hs[j * (N + 1) + Math.min(i + 1, N)];
          const hd = hs[Math.max(j - 1, 0) * (N + 1) + i];
          const hu = hs[Math.min(j + 1, N) * (N + 1) + i];
          const slope = clamp(Math.hypot(hr - hl, hu - hd) / (2 * cell) * 1.6, 0, 1);
          const wet = fbm(x / 700 + 11, z / 700 - 7, 4);
          const dist = outside(x, z);
          c.copy(dry).lerp(scrub, smoothstep(0.3, 0.6, wet)).lerp(grass, smoothstep(0.6, 0.8, wet) * (1 - smoothstep(200, 1800, dist)) * 0.8);
          c.lerp(rock, smoothstep(0.2, 0.55, slope));
          c.lerp(high, smoothstep(160, 420, y) * 0.6);
          col[k] = c.r;
          col[k + 1] = c.g;
          col[k + 2] = c.b;
          k += 3;
        }
      }
      const index = new Uint32Array(N * N * 6);
      let q = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const a = j * (N + 1) + i;
          const bI = a + 1;
          const cI = a + N + 1;
          const dI = cI + 1;
          index[q++] = a; index[q++] = cI; index[q++] = bI;
          index[q++] = bI; index[q++] = cI; index[q++] = dI;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeVertexNormals();

      const shared = VH.Materials.shared;
      this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uSunLight: { value: new THREE.Color(1, 1, 1) },
        uSunDir: shared.uSunDir,
        uSky: { value: new THREE.Color(0.4, 0.5, 0.7) },
        uGround: { value: new THREE.Color(0.2, 0.18, 0.14) },
        uRect: { value: new THREE.Vector4(rect.x0, rect.x1, rect.z0, rect.z1) },
        uSeaX: { value: sea - 0.5 },
      }]);
      const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.name = 'horizon';
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false;
      game.scene.add(this.mesh);
    }

    update() {
      const env = this.game.environment;
      if (!env) return;
      const u = this.uniforms;
      const sun = env.sun;
      u.uSunLight.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
      u.uSky.value.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.55 + env.scene.environmentIntensity * 0.3);
      u.uGround.value.copy(env.hemi.groundColor).multiplyScalar(env.hemi.intensity * 0.5);
    }

    reset() {}

    stop() {}
  }

  VH.Horizon = Horizon;
})();
