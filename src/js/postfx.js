/*
 * postfx.js — the post-processing chain that gives Vicehaven its look.
 *
 *   scene ──► HDR target (half float, optional 4× MSAA)
 *               │
 *               ├─► bloom: bright-pass + 13-tap downsample through 5 mips,
 *               │          then tent-filter upsample back up, additively
 *               │
 *               ├─► depth texture → screen-space ambient occlusion (half
 *               │                    res, bilateral blur), sun shafts (radial
 *               │                    march through the sky mask)
 *               │
 *               └─► composite: scene × AO + sun haze + shafts + bloom
 *                   (+ motion blur, sharpening, chromatic fringe, lens flare)
 *                   → exposure → ACES filmic → colour grade (saturation, teal
 *                   shadows / warm highlights) → vignette → sRGB → grain and
 *                   dither → (FXAA when MSAA is off)
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

  // ------------------------------------------------------------ depth helpers
  const DEPTH_COMMON = /* glsl */ `
    uniform sampler2D tDepth;
    uniform mat4 uProjInv;
    vec3 viewPosAt(vec2 uv, float d) {
      vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    vec3 viewPosAt(vec2 uv) { return viewPosAt(uv, texture2D(tDepth, uv).x); }
    // The sky dome is drawn at the far plane; anything nearer is geometry.
    const float SKY_DEPTH = 0.99997;
  `;

  // Screen-space ambient occlusion: a normal-oriented hemisphere kernel,
  // rotated per pixel with interleaved gradient noise (then blurred).
  const AO_FRAGMENT = /* glsl */ `
    ${DEPTH_COMMON}
    uniform mat4 uProj;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uTime;
    varying vec2 vUv;
    #define AO_SAMPLES SAMPLES_DEF

    void main() {
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 > SKY_DEPTH) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewPosAt(vUv, d0);
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      if (dot(N, P) > 0.0) N = -N;
      vec3 up = abs(N.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 T = normalize(cross(up, N));
      vec3 B = cross(N, T);
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float rot = ign * 6.2831853;
      float radius = uRadius * (0.6 + 0.4 * clamp(-P.z / 30.0, 0.0, 1.0));
      float occ = 0.0;
      for (int i = 0; i < AO_SAMPLES; i++) {
        float t = (float(i) + 0.5) / float(AO_SAMPLES);
        float a = rot + float(i) * 2.399963;
        float rr = sqrt(t);
        vec3 s = T * (cos(a) * rr) + B * (sin(a) * rr) + N * sqrt(max(1.0 - t, 0.02));
        float len = radius * mix(0.12, 1.0, t * t);
        vec3 Q = P + s * len;
        vec4 clip = uProj * vec4(Q, 1.0);
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
        float ds = texture2D(tDepth, uv).x;
        if (ds > SKY_DEPTH) continue;
        float sz = viewPosAt(uv, ds).z;
        float diff = sz - Q.z; // > 0: the surface at that pixel is in front of the sample point
        float range = smoothstep(0.0, 1.0, radius / max(abs(P.z - sz), 1e-3));
        occ += step(0.03 * len + 0.01, diff) * range;
      }
      float ao = 1.0 - occ / float(AO_SAMPLES) * uStrength;
      // AO is a close-range effect: fade it out with distance.
      ao = mix(ao, 1.0, smoothstep(70.0, 170.0, -P.z));
      gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
    }
  `;

  // Depth-aware 4x4 blur that removes the rotation noise.
  const AO_BLUR_FRAGMENT = /* glsl */ `
    ${DEPTH_COMMON}
    uniform sampler2D tAO;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float zc = viewPosAt(vUv).z;
      float sum = 0.0;
      float wsum = 0.0;
      for (int x = -2; x < 2; x++) {
        for (int y = -2; y < 2; y++) {
          vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * uTexel;
          float z = viewPosAt(uv).z;
          float w = exp(-abs(z - zc) * 2.5 / max(0.5, -zc * 0.04 + 0.5));
          sum += texture2D(tAO, uv).r * w;
          wsum += w;
        }
      }
      gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
    }
  `;

  // Sun shafts: march from each pixel toward the sun, collecting sky light
  // that isn't blocked by buildings.
  const SHAFT_FRAGMENT = /* glsl */ `
    uniform sampler2D tDepth;
    uniform vec2 uSunUV;
    uniform float uDensity;
    varying vec2 vUv;
    #define SHAFT_STEPS 28
    void main() {
      vec2 delta = (uSunUV - vUv) * uDensity / float(SHAFT_STEPS);
      vec2 uv = vUv + delta * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      float illum = 1.0;
      float sum = 0.0;
      for (int i = 0; i < SHAFT_STEPS; i++) {
        uv += delta;
        float sky = step(SKY_DEPTH_C, texture2D(tDepth, uv).x);
        // Soft in-sky falloff so the shafts fan out from the disc, not the whole dome.
        float near = 1.0 - smoothstep(0.0, 0.85, length(uv - uSunUV));
        sum += sky * illum * (0.25 + 0.75 * near);
        illum *= 0.955;
      }
      gl_FragColor = vec4(vec3(sum / float(SHAFT_STEPS) * 2.2), 1.0);
    }
  `.replace('SKY_DEPTH_C', '0.99997');

  const COMPOSITE_FRAGMENT = /* glsl */ `
    ${DEPTH_COMMON}
    uniform sampler2D tScene;
    uniform sampler2D tBloom;
    uniform sampler2D tAO;
    uniform sampler2D tShaft;
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
    uniform float uAOAmount;
    uniform float uShafts;
    uniform float uHaze;
    uniform float uFogDensity;
    uniform vec3 uSunColor;
    uniform vec3 uSunViewDir;
    uniform vec2 uSunUV;
    uniform float uFlare;
    uniform float uSharpen;
    uniform float uFringe;
    uniform float uBlur;
    uniform mat4 uReproj;
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
    float luma3(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    // A soft disc used for the lens-flare ghosts.
    float disc(vec2 p, float r) { return smoothstep(r, r * 0.35, length(p)); }

    void main() {
      float depth = texture2D(tDepth, vUv).x;
      bool isSky = depth > SKY_DEPTH;
      vec3 scene = texture2D(tScene, vUv).rgb;

      // Motion blur: smear along the screen-space velocity of this pixel.
      if (uBlur > 0.0) {
        vec4 cur = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 prev = uReproj * cur;
        vec2 vel = (cur.xy - prev.xy / prev.w) * 0.5 * uBlur;
        float vl = length(vel);
        vel *= min(1.0, 0.035 / max(vl, 1e-5));
        float jitter = hash(gl_FragCoord.xy + fract(uTime) * 31.0) - 0.5;
        vec3 acc = scene;
        for (int i = 1; i < 6; i++) {
          float t = (float(i) / 5.0 - 0.5 + jitter * 0.2);
          acc += texture2D(tScene, clamp(vUv + vel * t, 0.001, 0.999)).rgb;
        }
        scene = acc / 6.0;
      }

      // Sharpen (contrast-adaptive: never overshoots the neighbourhood).
      if (uSharpen > 0.0) {
        vec2 px = 1.0 / uResolution;
        vec3 n0 = texture2D(tScene, vUv + vec2(px.x, 0.0)).rgb;
        vec3 n1 = texture2D(tScene, vUv - vec2(px.x, 0.0)).rgb;
        vec3 n2 = texture2D(tScene, vUv + vec2(0.0, px.y)).rgb;
        vec3 n3 = texture2D(tScene, vUv - vec2(0.0, px.y)).rgb;
        vec3 mn = min(scene, min(min(n0, n1), min(n2, n3)));
        vec3 mx = max(scene, max(max(n0, n1), max(n2, n3)));
        vec3 sharp = scene + (scene - (n0 + n1 + n2 + n3) * 0.25) * uSharpen;
        scene = clamp(sharp, mn, mx);
      }

      // A faint colour fringe toward the screen edges, like a real lens.
      if (uFringe > 0.0) {
        vec2 dir = (vUv - 0.5);
        vec2 off = dir * dot(dir, dir) * uFringe;
        scene.r = texture2D(tScene, vUv + off).r;
        scene.b = texture2D(tScene, vUv - off).b;
      }

      // Ambient occlusion darkens creases and contact points.
      if (uAOAmount > 0.0 && !isSky) {
        float ao = texture2D(tAO, vUv).r;
        scene *= mix(1.0, ao, uAOAmount);
      }

      // Sun haze: distant geometry scatters the sun's colour toward the sun.
      if (uHaze > 0.0 && !isSky) {
        vec3 P = viewPosAt(vUv, depth);
        float dist = length(P);
        float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        float cosA = max(dot(P / dist, uSunViewDir), 0.0);
        scene += uSunColor * (pow(cosA, 6.0) * 0.55 + pow(cosA, 64.0) * 0.6) * f * uHaze;
      }

      // Sun shafts.
      if (uShafts > 0.0) scene += uSunColor * texture2D(tShaft, vUv).r * uShafts;

      vec3 hdr = scene + texture2D(tBloom, vUv).rgb * uBloom;

      // Lens flare: a few ghosts mirrored through the centre, only when the sun is clear.
      if (uFlare > 0.0) {
        vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
        vec2 toC = (0.5 - uSunUV);
        vec3 fl = vec3(0.0);
        for (int i = 1; i < 5; i++) {
          float k = float(i) * 0.42 - 0.25;
          vec2 gp = uSunUV + toC * k * 2.0;
          float sz = 0.025 + 0.018 * float(i);
          vec3 tint = i == 1 ? vec3(1.0, 0.75, 0.45) : i == 2 ? vec3(0.5, 0.8, 1.0) : i == 3 ? vec3(0.9, 0.5, 0.9) : vec3(0.6, 1.0, 0.7);
          fl += tint * disc((vUv - gp) * asp, sz) * (0.35 / float(i));
        }
        // A soft anamorphic streak through the sun.
        vec2 sd = (vUv - uSunUV) * asp;
        fl += vec3(0.55, 0.7, 1.0) * exp(-abs(sd.y) * 90.0) * exp(-abs(sd.x) * 2.2) * 0.35;
        hdr += uSunColor * fl * uFlare;
      }

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

  // FXAA (compact 3.11-style): used when MSAA is off so edges aren't left jagged.
  const FXAA_FRAGMENT = /* glsl */ `
    uniform sampler2D tSrc;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float lumaOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 px = 1.0 / uResolution;
      vec3 rgbM = texture2D(tSrc, vUv).rgb;
      vec3 rgbNW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * px).rgb;
      vec3 rgbNE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * px).rgb;
      vec3 rgbSW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * px).rgb;
      vec3 rgbSE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * px).rgb;
      float lM = lumaOf(rgbM), lNW = lumaOf(rgbNW), lNE = lumaOf(rgbNE), lSW = lumaOf(rgbSW), lSE = lumaOf(rgbSE);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * px;
      vec3 rgbA = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tSrc, vUv + dir * -0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
      float lB = lumaOf(rgbB);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
    }
  `;

  const WHITE = (() => {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  })();

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
      // Set by environment.js: the sun in world space, its colour, how much
      // fog there is, and how strong haze / shafts / flare should be (0 at night).
      this.sunDir = new THREE.Vector3(0, 1, 0);
      this.sunColor = new THREE.Color(1, 1, 1);
      this.sunAmount = 0;
      this.fogDensity = 0.0015;
      this.ao = false;
      this.shafts = false;
      this.motionBlur = 0;
      this.lens = false;
      this._prevVP = new THREE.Matrix4();
      this._havePrev = false;
      this._vp = new THREE.Matrix4();
      this._reproj = new THREE.Matrix4();
      this._fwd = new THREE.Vector3();
      this._prevFwd = new THREE.Vector3();
      this._prevPos = new THREE.Vector3();
      this._sunV = new THREE.Vector3();
      this._sunP = new THREE.Vector3();
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
        tScene: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tAO: { value: WHITE }, tShaft: { value: WHITE },
        uBloom: { value: 0.5 }, uExposure: { value: 1 },
        uSaturation: { value: 1.07 }, uContrast: { value: 1.05 }, uNightLift: { value: 0 },
        uShadowTint: { value: new THREE.Vector3(-0.004, 0.002, 0.012) },
        uHighlightTint: { value: new THREE.Vector3(0.028, 0.012, -0.018) },
        uVignette: { value: 0.32 }, uGrain: { value: 0.025 }, uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) }, uFlash: { value: 0 }, uFlashColor: { value: this.flashColor },
        uProjInv: { value: new THREE.Matrix4() }, uReproj: { value: new THREE.Matrix4() },
        uAOAmount: { value: 0 }, uShafts: { value: 0 }, uHaze: { value: 0 }, uFogDensity: { value: 0.0015 },
        uSunColor: { value: new THREE.Vector3(1, 1, 1) }, uSunViewDir: { value: new THREE.Vector3(0, 0, -1) },
        uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uFlare: { value: 0 }, uSharpen: { value: 0 },
        uFringe: { value: 0 }, uBlur: { value: 0 },
      });
      this.fxaaMat = mat(FXAA_FRAGMENT, { tSrc: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) } });
      this.aoMat = null;
      this.aoBlurMat = null;
      this.shaftMat = null;

      this.sceneRT = null;
      this.mips = [];
      this.aoRT = null;
      this.aoRT2 = null;
      this.shaftRT = null;
      this.ldrRT = null;
      this.configure();
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'graphics' || e.path === 'graphics.effects' || e.path === 'graphics.antialias' || e.path === '*'
          || e.path === 'graphics.ambientOcclusion' || e.path === 'graphics.lightShafts' || e.path === 'graphics.motionBlur' || e.path === 'graphics.lensEffects') this.configure();
        else if (e.path === 'graphics.filmGrain') this._applyGrain();
      });
    }

    /** Settings with a fallback for saves from before an option existed. */
    _opt(key, fallback) {
      const v = this.settings.data.graphics[key];
      return v === undefined ? fallback : v;
    }

    /** (Re)build targets for the current effects level. */
    configure() {
      const g = this.settings.data.graphics;
      const level = g.effects || 'high';
      this.enabled = level !== 'low';
      this.level = level;
      this.msaa = g.antialias && level === 'high' ? 4 : 0;
      const ao = this._opt('ambientOcclusion', 'low');
      this.aoQuality = level === 'low' ? 'off' : level === 'medium' && ao === 'high' ? 'low' : ao;
      this.ao = this.enabled && this.aoQuality !== 'off';
      this.shafts = this.enabled && this._opt('lightShafts', 'on') !== 'off';
      this.motionBlur = this.enabled && level === 'high' ? { off: 0, light: 0.55, full: 1.0 }[this._opt('motionBlur', 'light')] || 0 : 0;
      this.lens = this.enabled && level === 'high' && this._opt('lensEffects', 'on') !== 'off';
      this._dispose();
      if (this.enabled) {
        this.mipCount = level === 'high' ? 5 : 4;
        this._applyGrain();
        this._buildMaterials();
        this._allocate(this.width, this.height);
      }
      this._havePrev = false;
      VH.events.emit('postfx:changed', { enabled: this.enabled });
    }

    _buildMaterials() {
      const samples = this.aoQuality === 'high' ? 20 : 12;
      if (this.ao && this._aoSamples !== samples) {
        this._aoSamples = samples;
        if (this.aoMat) this.aoMat.dispose();
        this.aoMat = null;
      }
      const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
        uniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
      });
      if (this.ao && !this.aoMat) {
        this.aoMat = mat(AO_FRAGMENT.replace('SAMPLES_DEF', String(samples)), {
          tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
          uRadius: { value: 1.4 }, uStrength: { value: 1.6 }, uTime: { value: 0 },
        });
        this.aoBlurMat = mat(AO_BLUR_FRAGMENT, {
          tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, tAO: { value: null }, uTexel: { value: new THREE.Vector2() },
        });
      }
      if (this.shafts && !this.shaftMat) {
        this.shaftMat = mat(SHAFT_FRAGMENT, { tDepth: { value: null }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uDensity: { value: 0.9 } });
      }
    }

    /** Settings → Graphics → Film grain (only with post-processing on High). */
    _applyGrain() {
      const amount = { off: 0, light: 0.008, strong: 0.025 }[this.settings.data.graphics.filmGrain];
      this.compMat.uniforms.uGrain.value = this.level === 'high' ? (amount === undefined ? 0.008 : amount) : 0;
    }

    _dispose() {
      for (const t of [this.sceneRT, this.aoRT, this.aoRT2, this.shaftRT, this.ldrRT]) if (t) t.dispose();
      if (this.sceneRT && this.sceneRT.depthTexture) this.sceneRT.depthTexture.dispose();
      for (const m of this.mips) m.dispose();
      this.sceneRT = this.aoRT = this.aoRT2 = this.shaftRT = this.ldrRT = null;
      this.mips = [];
    }

    _allocate(w, h) {
      const common = {
        type: this.hdrType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      };
      const depthTexture = new THREE.DepthTexture(w, h);
      depthTexture.type = THREE.UnsignedIntType;
      this.sceneRT = new THREE.WebGLRenderTarget(w, h, Object.assign({ depthBuffer: true, depthTexture, samples: this.msaa }, common));
      this.mips = [];
      // Bloom starts at half resolution ("medium" at quarter) and halves each level.
      let mw = Math.max(1, Math.floor(w / (this.level === 'high' ? 2 : 4)));
      let mh = Math.max(1, Math.floor(h / (this.level === 'high' ? 2 : 4)));
      for (let i = 0; i < this.mipCount; i++) {
        this.mips.push(new THREE.WebGLRenderTarget(mw, mh, Object.assign({ depthBuffer: false }, common)));
        mw = Math.max(1, Math.floor(mw / 2));
        mh = Math.max(1, Math.floor(mh / 2));
      }
      const ldr = Object.assign({}, common, { type: THREE.UnsignedByteType, depthBuffer: false });
      const half = (div) => new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w / div)), Math.max(1, Math.floor(h / div)), ldr);
      if (this.ao) {
        this.aoRT = half(2);
        this.aoRT2 = half(2);
      }
      if (this.shafts) this.shaftRT = half(this.level === 'high' ? 2 : 4);
      if (this.msaa === 0) this.ldrRT = new THREE.WebGLRenderTarget(w, h, Object.assign({}, ldr, { minFilter: THREE.LinearFilter }));
    }

    setSize(w, h) {
      this.width = Math.max(1, w);
      this.height = Math.max(1, h);
      if (!this.enabled) return;
      this._dispose();
      this._allocate(this.width, this.height);
      this._havePrev = false;
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

    /** Forget the previous frame (after a teleport or a camera cut) so motion blur doesn't smear it. */
    cut() {
      this._havePrev = false;
    }

    render(scene, camera, dt) {
      const r = this.r;
      this.time += dt || 0.016;
      this.flash = Math.max(0, this.flash - (dt || 0.016) * 2.5);

      r.setRenderTarget(this.sceneRT);
      r.render(scene, camera);

      const depthTex = this.sceneRT.depthTexture;
      camera.updateMatrixWorld();
      const projInv = camera.projectionMatrixInverse;

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

      // Ambient occlusion (half resolution, then a depth-aware blur).
      c.uAOAmount.value = 0;
      c.tAO.value = WHITE;
      if (this.ao && this.aoRT) {
        const u = this.aoMat.uniforms;
        u.tDepth.value = depthTex;
        u.uProj.value.copy(camera.projectionMatrix);
        u.uProjInv.value.copy(projInv);
        u.uTime.value = this.time;
        this._pass(this.aoMat, this.aoRT);
        const b = this.aoBlurMat.uniforms;
        b.tDepth.value = depthTex;
        b.uProjInv.value.copy(projInv);
        b.tAO.value = this.aoRT.texture;
        b.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
        this._pass(this.aoBlurMat, this.aoRT2);
        c.tAO.value = this.aoRT2.texture;
        c.uAOAmount.value = 0.9 - 0.35 * Math.min(1, this.nightLift);
      }

      // Where is the sun on screen, and how much of it is there to see?
      this._sunV.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
      this._sunP.copy(camera.position).addScaledVector(this.sunDir, 1000).project(camera);
      const facing = -this._sunV.z; // > 0: the sun is in front of the camera
      const sunUvX = this._sunP.x * 0.5 + 0.5;
      const sunUvY = this._sunP.y * 0.5 + 0.5;
      const sunOn = this.sunAmount > 0.001 && facing > 0.02;
      c.uSunUV.value.set(sunUvX, sunUvY);
      c.uSunViewDir.value.copy(this._sunV);
      c.uSunColor.value.set(this.sunColor.r, this.sunColor.g, this.sunColor.b);
      c.uFogDensity.value = this.fogDensity;
      c.uHaze.value = this.sunAmount * 0.9;

      c.tShaft.value = WHITE;
      c.uShafts.value = 0;
      if (this.shafts && this.shaftRT && sunOn) {
        const u = this.shaftMat.uniforms;
        u.tDepth.value = depthTex;
        u.uSunUV.value.set(sunUvX, sunUvY);
        this._pass(this.shaftMat, this.shaftRT);
        c.tShaft.value = this.shaftRT.texture;
        c.uShafts.value = this.sunAmount * Math.min(1, facing * 1.6) * 0.45;
      }
      c.uFlare.value = this.lens && sunOn && sunUvX > -0.2 && sunUvX < 1.2 && sunUvY > -0.2 && sunUvY < 1.2 ? this.sunAmount * Math.min(1, facing * 2.0) * 0.22 : 0;
      c.uSharpen.value = this.lens ? 0.35 : 0;
      c.uFringe.value = this.lens ? 0.012 : 0;

      // Motion blur from how far the camera moved since the last frame. A cut
      // (teleport, respawn, a new cutscene shot) must not smear the old view in.
      this._fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
      if (this._havePrev && (camera.position.distanceToSquared(this._prevPos) > 36 || this._fwd.dot(this._prevFwd) < 0.9)) this._havePrev = false;
      this._prevPos.copy(camera.position);
      this._prevFwd.copy(this._fwd);
      this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (this.motionBlur > 0 && this._havePrev) {
        this._reproj.multiplyMatrices(this._prevVP, camera.matrixWorld).multiply(projInv);
        c.uReproj.value.copy(this._reproj);
        c.uBlur.value = this.motionBlur;
      } else c.uBlur.value = 0;
      this._prevVP.copy(this._vp);
      this._havePrev = true;

      c.tScene.value = this.sceneRT.texture;
      c.tBloom.value = this.mips[0].texture;
      c.tDepth.value = depthTex;
      c.uProjInv.value.copy(projInv);
      c.uBloom.value = this.bloomStrength / this.mips.length;
      c.uExposure.value = r.toneMappingExposure;
      c.uNightLift.value = this.nightLift;
      c.uTime.value = this.time;
      c.uResolution.value.set(this.width, this.height);
      c.uFlash.value = Math.min(0.85, this.flash);
      if (this.ldrRT) {
        this._pass(this.compMat, this.ldrRT);
        this.fxaaMat.uniforms.tSrc.value = this.ldrRT.texture;
        this.fxaaMat.uniforms.uResolution.value.set(this.width, this.height);
        this._pass(this.fxaaMat, null);
      } else this._pass(this.compMat, null);
    }
  }

  VH.PostFX = PostFX;
})();
