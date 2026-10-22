/*
 * postfx.js — the post-processing chain that gives Vicehaven its look.
 *
 *   scene ──► HDR target (half float, optional 4× MSAA)
 *               │
 *               ├─► bloom: bright-pass + 13-tap downsample through 5 mips,
 *               │          then tent-filter upsample back up, additively
 *               │
 *               └─► composite: scene + bloom → exposure → ACES filmic
 *                   → colour grade (saturation, teal shadows / warm
 *                   highlights) → vignette → sRGB → grain and dither
 *
 * Because the scene is kept in linear HDR until the very end, anything
 * brighter than white (the sun, lamps, lit windows, neon, glints on the
 * water) blooms naturally instead of clipping flat.
 *
 * Effects "low" skips all of this and renders straight to the screen with
 * the renderer's own tone mapping, for older machines.
 */
(function () {
  'use strict';

  const VH = window.VH;

  const FULLSCREEN_VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // 13-tap downsample (the "Call of Duty" filter). On the first pass it also
  // applies a soft-knee threshold and a Karis average against fireflies.
  const DOWNSAMPLE_FRAGMENT = /* glsl */ `
    uniform sampler2D tSrc;
    uniform vec2 uTexel;
    uniform float uPrefilter;
    uniform float uThreshold;
    uniform float uKnee;
    varying vec2 vUv;

    vec3 sampleSrc(vec2 o) { return texture2D(tSrc, vUv + uTexel * o).rgb; }
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    vec3 karis(vec3 c) { return c / (1.0 + luma(c)); }
    vec3 threshold(vec3 c) {
      float br = max(c.r, max(c.g, c.b));
      float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
      rq = rq * rq / (4.0 * uKnee + 1e-4);
      float w = max(rq, br - uThreshold) / max(br, 1e-4);
      return c * w;
    }

    void main() {
      vec3 a = sampleSrc(vec2(-2.0, 2.0));
      vec3 b = sampleSrc(vec2(0.0, 2.0));
      vec3 c = sampleSrc(vec2(2.0, 2.0));
      vec3 d = sampleSrc(vec2(-2.0, 0.0));
      vec3 e = sampleSrc(vec2(0.0, 0.0));
      vec3 f = sampleSrc(vec2(2.0, 0.0));
      vec3 g = sampleSrc(vec2(-2.0, -2.0));
      vec3 h = sampleSrc(vec2(0.0, -2.0));
      vec3 i = sampleSrc(vec2(2.0, -2.0));
      vec3 j = sampleSrc(vec2(-1.0, 1.0));
      vec3 k = sampleSrc(vec2(1.0, 1.0));
      vec3 l = sampleSrc(vec2(-1.0, -1.0));
      vec3 m = sampleSrc(vec2(1.0, -1.0));
      vec3 col;
      if (uPrefilter > 0.5) {
        // Karis-weighted groups, then the threshold.
        vec3 g0 = karis((j + k + l + m) * 0.25) * 0.5;
        vec3 g1 = karis((a + b + d + e) * 0.25) * 0.125;
        vec3 g2 = karis((b + c + e + f) * 0.25) * 0.125;
        vec3 g3 = karis((d + e + g + h) * 0.25) * 0.125;
        vec3 g4 = karis((e + f + h + i) * 0.25) * 0.125;
        col = g0 + g1 + g2 + g3 + g4;
        col = col / max(1.0 - luma(col), 1e-3);
        col = threshold(col);
      } else {
        col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
      }
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `;

  // 9-tap tent upsample, blended additively onto the next larger mip.
  const UPSAMPLE_FRAGMENT = /* glsl */ `
    uniform sampler2D tSrc;
    uniform vec2 uTexel;
    uniform float uRadius;
    uniform float uWeight;
    varying vec2 vUv;
    void main() {
      vec2 r = uTexel * uRadius;
      vec3 s = texture2D(tSrc, vUv + vec2(-r.x, r.y)).rgb
             + texture2D(tSrc, vUv + vec2(0.0, r.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(r.x, r.y)).rgb
             + texture2D(tSrc, vUv + vec2(-r.x, 0.0)).rgb * 2.0
             + texture2D(tSrc, vUv).rgb * 4.0
             + texture2D(tSrc, vUv + vec2(r.x, 0.0)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(-r.x, -r.y)).rgb
             + texture2D(tSrc, vUv + vec2(0.0, -r.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(r.x, -r.y)).rgb;
      gl_FragColor = vec4(s * (uWeight / 16.0), 1.0);
    }
  `;

  const COMPOSITE_FRAGMENT = /* glsl */ `
    uniform sampler2D tScene;
    uniform sampler2D tBloom;
    uniform float uBloom;
    uniform float uExposure;
    uniform float uSaturation;
    uniform float uNightLift;
    uniform float uContrast;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    varying vec2 vUv;

    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFilmic(vec3 color) {
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color = inM * color;
      color = RRTAndODTFit(color);
      color = outM * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec3 hdr = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
      vec3 c = acesFilmic(hdr * (uExposure / 0.6));

      // Grade: gentle contrast about mid-grey, saturation, split toning.
      c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + uHighlightTint * smoothstep(0.45, 1.0, l);

      // Night: raise the black level toward moonlit blue so shapes stay readable.
      c += vec3(0.022, 0.03, 0.055) * uNightLift * (1.0 - smoothstep(0.0, 0.35, l));

      // Vignette (lighter at night, when the edges are dark already).
      vec2 d = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      c *= 1.0 - smoothstep(0.35, 1.25, length(d)) * uVignette * (1.0 - 0.45 * min(uNightLift, 1.0));

      // Full-screen flash (checkpoints, finishes, hard landings, getting hit).
      if (uFlash > 0.0) c = mix(c, uFlashColor, uFlash);

      c = toSRGB(clamp(c, 0.0, 1.0));
      // Film grain plus a little dither, which also hides banding in the sky.
      // The grain fades in the shadows, where it would only read as noise.
      float n = hash(vUv * uResolution + fract(uTime) * 97.0) - 0.5;
      c += n * (uGrain * (0.3 + 0.7 * dot(c, vec3(0.3333))) + 1.0 / 255.0);
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  class PostFX {
    constructor(vhRenderer, settings) {
      this.vh = vhRenderer;
      this.r = vhRenderer.renderer;
      this.settings = settings;
      this.enabled = false;
      this.width = 1;
      this.height = 1;
      this.bloomStrength = 0.55;
      this.nightLift = 0;
      this.flash = 0;
      this.flashColor = new THREE.Color(1, 1, 1);
      this.time = 0;
      const ext = this.r.extensions;
      this.hdrType = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;

      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      this.quad.frustumCulled = false;
      this.quadScene = new THREE.Scene();
      this.quadScene.add(this.quad);
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const mat = (fragmentShader, uniforms, blending) =>
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: FULLSCREEN_VERTEX,
          fragmentShader,
          depthTest: false,
          depthWrite: false,
          blending: blending || THREE.NoBlending,
          toneMapped: false,
        });
      this.downMat = mat(DOWNSAMPLE_FRAGMENT, {
        tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 },
        uThreshold: { value: 1.05 }, uKnee: { value: 0.5 },
      });
      this.upMat = mat(UPSAMPLE_FRAGMENT, {
        tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 }, uWeight: { value: 1.0 },
      }, THREE.AdditiveBlending);
      this.upMat.blending = THREE.CustomBlending;
      this.upMat.blendSrc = THREE.OneFactor;
      this.upMat.blendDst = THREE.OneFactor;
      this.upMat.blendEquation = THREE.AddEquation;
      this.compMat = mat(COMPOSITE_FRAGMENT, {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.5 }, uExposure: { value: 1 },
        uSaturation: { value: 1.07 }, uContrast: { value: 1.05 }, uNightLift: { value: 0 },
        uShadowTint: { value: new THREE.Vector3(-0.004, 0.002, 0.012) },
        uHighlightTint: { value: new THREE.Vector3(0.028, 0.012, -0.018) },
        uVignette: { value: 0.32 }, uGrain: { value: 0.025 }, uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) }, uFlash: { value: 0 }, uFlashColor: { value: this.flashColor },
      });

      this.sceneRT = null;
      this.mips = [];
      this.configure();
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'graphics' || e.path === 'graphics.effects' || e.path === 'graphics.antialias' || e.path === '*') this.configure();
        else if (e.path === 'graphics.filmGrain') this._applyGrain();
      });
    }

    /** (Re)build targets for the current effects level. */
    configure() {
      const g = this.settings.data.graphics;
      const level = g.effects || 'high';
      this.enabled = level !== 'low';
      this.level = level;
      this.msaa = g.antialias && level === 'high' ? 4 : 0;
      this._dispose();
      if (this.enabled) {
        this.mipCount = level === 'high' ? 5 : 4;
        this._applyGrain();
        this._allocate(this.width, this.height);
      }
      VH.events.emit('postfx:changed', { enabled: this.enabled });
    }

    /** Settings → Graphics → Film grain (only with post-processing on High). */
    _applyGrain() {
      const amount = { off: 0, light: 0.008, strong: 0.025 }[this.settings.data.graphics.filmGrain];
      this.compMat.uniforms.uGrain.value = this.level === 'high' ? (amount === undefined ? 0.008 : amount) : 0;
    }

    _dispose() {
      if (this.sceneRT) this.sceneRT.dispose();
      for (const m of this.mips) m.dispose();
      this.sceneRT = null;
      this.mips = [];
    }

    _allocate(w, h) {
      const common = {
        type: this.hdrType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      };
      this.sceneRT = new THREE.WebGLRenderTarget(w, h, Object.assign({ depthBuffer: true, samples: this.msaa }, common));
      this.mips = [];
      // Bloom starts at half resolution ("medium" at quarter) and halves each level.
      let mw = Math.max(1, Math.floor(w / (this.level === 'high' ? 2 : 4)));
      let mh = Math.max(1, Math.floor(h / (this.level === 'high' ? 2 : 4)));
      for (let i = 0; i < this.mipCount; i++) {
        this.mips.push(new THREE.WebGLRenderTarget(mw, mh, Object.assign({ depthBuffer: false }, common)));
        mw = Math.max(1, Math.floor(mw / 2));
        mh = Math.max(1, Math.floor(mh / 2));
      }
    }

    setSize(w, h) {
      this.width = Math.max(1, w);
      this.height = Math.max(1, h);
      if (!this.enabled) return;
      this._dispose();
      this._allocate(this.width, this.height);
    }

    _pass(material, target) {
      this.quad.material = material;
      this.r.setRenderTarget(target);
      this.r.render(this.quadScene, this.quadCam);
    }

    /** Draw a white (or coloured) flash that fades by itself. */
    pulse(amount, color) {
      if (this.settings.get('accessibility.reducedFlashing')) amount *= 0.25;
      this.flash = Math.max(this.flash, amount);
      // A colour, or [r, g, b]. Anything else would put NaN in the shader,
      // and NaN turns the whole picture black.
      if (Array.isArray(color)) this.flashColor.setRGB(color[0], color[1], color[2]);
      else if (color && color.isColor) this.flashColor.copy(color);
      else this.flashColor.setRGB(1, 1, 1);
      if (!Number.isFinite(this.flashColor.r + this.flashColor.g + this.flashColor.b)) this.flashColor.setRGB(1, 1, 1);
    }

    render(scene, camera, dt) {
      const r = this.r;
      this.time += dt || 0.016;
      this.flash = Math.max(0, this.flash - (dt || 0.016) * 2.5);

      r.setRenderTarget(this.sceneRT);
      r.render(scene, camera);

      // Bloom down…
      const down = this.downMat.uniforms;
      let src = this.sceneRT;
      for (let i = 0; i < this.mips.length; i++) {
        down.tSrc.value = src.texture;
        down.uTexel.value.set(1 / src.width, 1 / src.height);
        down.uPrefilter.value = i === 0 ? 1 : 0;
        this._pass(this.downMat, this.mips[i]);
        src = this.mips[i];
      }
      // …and back up, adding each level onto the next larger one.
      const up = this.upMat.uniforms;
      for (let i = this.mips.length - 1; i > 0; i--) {
        const s = this.mips[i];
        up.tSrc.value = s.texture;
        up.uTexel.value.set(1 / s.width, 1 / s.height);
        up.uWeight.value = 1.0;
        this._pass(this.upMat, this.mips[i - 1]);
      }

      const c = this.compMat.uniforms;
      c.tScene.value = this.sceneRT.texture;
      c.tBloom.value = this.mips[0].texture;
      c.uBloom.value = this.bloomStrength / this.mips.length;
      c.uExposure.value = r.toneMappingExposure;
      c.uNightLift.value = this.nightLift;
      c.uTime.value = this.time;
      c.uResolution.value.set(this.width, this.height);
      c.uFlash.value = Math.min(0.85, this.flash);
      this._pass(this.compMat, null);
    }
  }

  VH.PostFX = PostFX;
})();
