/*
 * environment.js — sky, sun, moon, ambient light, fog and reflections.
 *
 * Everything is driven by one number, the time of day in hours. The sun's
 * height picks colours from a small table of keys (night → twilight →
 * sunset → golden hour → afternoon → noon), which feed the sky shader, the
 * directional light, the fog and the water.
 *
 * Phase 1 holds the clock still at a late afternoon. Phase 12 (day/night)
 * only needs to advance `hours`; the lighting already follows it.
 *
 * Reflections: the sky (without the sun disc) is rendered into a PMREM
 * environment map, which gives glass towers, water-like sheen and the
 * soft ambient light every standard material receives.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep } = VH.math;

  // Sun elevation (sin of altitude) → colours. Hex values are sRGB.
  const KEYS = [
    // Night is a moonlit blue, not black: you have to be able to drive in it.
    { s: -0.4, zenith: 0x07102a, horizon: 0x1c2852, light: 0xa0b6ff, intensity: 1.0, env: 0.72, exposure: 1.9 },
    { s: -0.12, zenith: 0x0b1534, horizon: 0x29325e, light: 0xa0b6ff, intensity: 0.8, env: 0.66, exposure: 1.75 },
    { s: -0.03, zenith: 0x1a274e, horizon: 0x6a4a5c, light: 0xff7a4a, intensity: 0.0, env: 0.6, exposure: 1.45 },
    { s: 0.03, zenith: 0x2a4378, horizon: 0xf09a62, light: 0xff9050, intensity: 1.0, env: 0.55, exposure: 1.05 },
    { s: 0.14, zenith: 0x3563a6, horizon: 0xf2c796, light: 0xffc890, intensity: 2.0, env: 0.65, exposure: 1.0 },
    { s: 0.38, zenith: 0x2f68bd, horizon: 0xbcd5ec, light: 0xfff1de, intensity: 2.35, env: 0.72, exposure: 0.95 },
    { s: 0.95, zenith: 0x2560bd, horizon: 0xc6ddf2, light: 0xfff8ef, intensity: 2.5, env: 0.75, exposure: 0.92 },
  ];

  // ---------------------------------------------------- tone mapping (CPU)
  // A port of three.js's ACESFilmicToneMapping so the fog can be given the
  // exact on-screen colour of the sky's horizon.
  // Moonlight and the orange bounce of street lamps fill the shadows at night.
  const NIGHT_SKY = new THREE.Color(0x5a6ca4);
  // Night brightness at 100% sits a quarter above where nights started out (players found them too dark).
  const NIGHT_LIFT = 1.25;
  const NIGHT_GROUND = new THREE.Color(0x4a3a2a);

  function acesFilmic(rgb, exposure) {
    const e = exposure / 0.6;
    const r = rgb[0] * e, g = rgb[1] * e, b = rgb[2] * e;
    // Input matrix (columns as in the GLSL source).
    let x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
    let y = 0.076 * r + 0.90834 * g + 0.01566 * b;
    let z = 0.0284 * r + 0.13383 * g + 0.83777 * b;
    const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
    x = fit(x);
    y = fit(y);
    z = fit(z);
    const outR = 1.60475 * x - 0.53108 * y - 0.07367 * z;
    const outG = -0.10208 * x + 1.10813 * y - 0.00605 * z;
    const outB = -0.00327 * x - 0.07276 * y + 1.07602 * z;
    return [clamp(outR, 0, 1), clamp(outG, 0, 1), clamp(outB, 0, 1)];
  }

  function linearToSrgb(v) {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  // ------------------------------------------------------------ sky shader
  const SKY_VERTEX = /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
      gl_Position = vec4(p.xy, p.w * 0.99995, p.w);
    }
  `;

  const SKY_FRAGMENT = /* glsl */ `
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uFog;
    uniform float uCloud;
    uniform float uTime;
    uniform float uNight;
    uniform float uEnvPass;
    varying vec3 vDir;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float hash13(vec3 p3) {
      p3 = fract(p3 * 0.1031);
      p3 += dot(p3, p3.zyx + 31.32);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash12(i);
      float b = hash12(i + vec2(1.0, 0.0));
      float c = hash12(i + vec2(0.0, 1.0));
      float d = hash12(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        s += a * vnoise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return s;
    }

    void main() {
      vec3 dir = normalize(vDir);
      float h = dir.y;
      float mu = dot(dir, uSunDir);

      vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
      if (h < 0.0) col = mix(uHorizon, uHorizon * 0.6, clamp(-h * 4.0, 0.0, 1.0));

      // Forward scattering around the sun, strongest at low sun.
      float mup = max(mu, 0.0);
      float glow = pow(mup, 5.0) * 0.28 + pow(mup, 40.0) * 0.55;
      col += uSunColor * glow * (1.0 - uEnvPass * 0.7) * smoothstep(-0.2, 0.0, uSunDir.y);

      // Stars.
      if (uNight > 0.001 && h > 0.0) {
        vec3 sp = dir * 260.0;
        vec3 cell = floor(sp);
        float r = hash13(cell);
        float star = step(0.9965, r) * (1.0 - smoothstep(0.08, 0.32, length(fract(sp) - 0.5)));
        float twinkle = 0.65 + 0.35 * sin(uTime * (2.0 + r * 5.0) + r * 60.0);
        col += vec3(0.9, 0.95, 1.0) * star * twinkle * uNight * 2.2 * (1.0 - uCloud);
      }

      // Clouds on a virtual plane above the city.
      if (h > -0.05) {
        vec2 uv = dir.xz / (h + 0.14) * 1.25 + vec2(uTime * 0.0035, uTime * 0.0012);
        float n = fbm(uv);
        float cover = smoothstep(1.02 - uCloud * 0.9, 1.3 - uCloud * 0.75, n + 0.25);
        // Fake self-shadowing: sample the cloud field a step toward the sun. Thicker on the
        // sun side means the lit rim is thin (bright) and the body shades darker.
        float nSun = fbm(uv + uSunDir.xz * 0.07 / max(h + 0.14, 0.2));
        float body = clamp((nSun - n) * 4.0 + 0.5, 0.0, 1.0);
        float rim = clamp((n - nSun) * 5.0, 0.0, 1.0) * smoothstep(0.1, 0.5, cover) * (1.0 - smoothstep(0.55, 0.95, cover));
        float fade = smoothstep(-0.02, 0.22, h);
        float lit = clamp(mu * 0.5 + 0.5, 0.0, 1.0);
        vec3 shade = uHorizon * 0.55 + uZenith * 0.2;
        vec3 bright = uSunColor * 0.9 + uHorizon * 0.35;
        vec3 cloudCol = mix(shade, bright, lit * 0.8 + 0.2) * mix(1.0, 0.72, smoothstep(0.55, 0.95, n));
        cloudCol *= 1.0 - 0.28 * body * (1.0 - uNight);
        cloudCol += uSunColor * rim * (0.35 + 0.9 * pow(max(mu, 0.0), 3.0)) * (1.0 - uEnvPass * 0.7) * (1.0 - uNight);
        cloudCol = mix(cloudCol, uZenith * 0.25 + vec3(0.02), uNight * 0.85);
        col = mix(col, cloudCol, cover * fade * 0.92);
      }

      // The sun itself (left out of the reflection map to avoid double lighting).
      float disc = smoothstep(0.99935, 0.99972, mu);
      col += uSunColor * disc * 30.0 * (1.0 - uEnvPass) * smoothstep(-0.03, 0.02, uSunDir.y);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      // Melt into the fog at the horizon so distant buildings have no edge.
      float band = 1.0 - smoothstep(-0.03, 0.16, h);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, band);
    }
  `;

  function makeSkyMaterial(uniforms, envPass) {
    const u = Object.assign({}, uniforms, {
      uEnvPass: { value: envPass ? 1 : 0 },
      uFog: envPass ? uniforms.uFogLinear : uniforms.uFogDisplay,
    });
    return new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
  }

  class Environment {
    constructor(scene, vhRenderer, settings, shared) {
      this.scene = scene;
      this.vhRenderer = vhRenderer;
      this.settings = settings;
      this.shared = shared;
      this.hours = 16.3;
      this.cloudCover = 0.38;
      this.clockRunning = false; // Phase 12 turns this on
      this._envDirty = true;
      this._envTimer = 0;
      this._envTarget = null;
      this.sunDir = new THREE.Vector3();
      this.lightDir = new THREE.Vector3();
      this._tmpA = new THREE.Vector3();
      this._tmpB = new THREE.Vector3();
      this._tmpC = new THREE.Vector3();
      this._focus = new THREE.Vector3();
    }

    init() {
      const scene = this.scene;
      this.skyUniforms = {
        uSunDir: this.shared.uSunDir,
        uSunColor: this.shared.uSunColor,
        uZenith: this.shared.uSkyZenith,
        uHorizon: this.shared.uSkyHorizon,
        uFogDisplay: { value: new THREE.Color() },
        uFogLinear: { value: new THREE.Color() },
        uCloud: { value: this.cloudCover },
        uTime: this.shared.uTime,
        uNight: { value: 0 },
      };
      const geo = new THREE.SphereGeometry(1, 48, 24);
      this.sky = new THREE.Mesh(geo, makeSkyMaterial(this.skyUniforms, false));
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -1000;
      this.sky.name = 'sky';
      scene.add(this.sky);

      // A tiny scene holding only the sky, rendered into the reflection map.
      this.envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(geo, makeSkyMaterial(this.skyUniforms, true));
      envSky.frustumCulled = false;
      this.envScene.add(envSky);
      this.pmrem = new THREE.PMREMGenerator(this.vhRenderer.renderer);

      this.sun = new THREE.DirectionalLight(0xffffff, 3);
      this.sun.name = 'sun';
      scene.add(this.sun);
      scene.add(this.sun.target);

      this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4238, 0.35);
      scene.add(this.hemi);

      scene.fog = new THREE.FogExp2(0xbcd5ec, 0.002);

      this.applySettings();
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'graphics' || e.path.startsWith('graphics.') || e.path === '*') {
          this.applySettings();
          this._applyKeys(this.sunDir.y);
        }
      });
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'gameplay.alwaysDay' || e.path === '*') this.setTime(this.hours);
      });
      VH.events.on('postfx:changed', () => this._applyKeys(this.sunDir.y));
      this.setTime(this.hours);
    }

    /** Temporarily cover a wider area with the shadow map (the title screen's aerial view). null restores. */
    setShadowExtent(extent) {
      this._extentOverride = extent;
      this.applySettings();
    }

    applySettings() {
      this.nightBrightness = VH.math.clamp(+this.settings.get('graphics.nightBrightness') || 1, 0.5, 2) * NIGHT_LIFT;
      const base = this.settings.shadowTier();
      const tier = Object.assign({}, base, this._extentOverride && base.enabled ? { extent: this._extentOverride } : null);
      const sun = this.sun;
      const maxTex = this.vhRenderer.renderer.capabilities.maxTextureSize || 4096;
      if (tier.mapSize > maxTex) tier.mapSize = maxTex;
      sun.castShadow = tier.enabled;
      if (tier.enabled) {
        if (sun.shadow.mapSize.x !== tier.mapSize) {
          sun.shadow.mapSize.set(tier.mapSize, tier.mapSize);
          if (sun.shadow.map) {
            sun.shadow.map.dispose();
            sun.shadow.map = null;
          }
        }
        const cam = sun.shadow.camera;
        cam.left = cam.bottom = -tier.extent;
        cam.right = cam.top = tier.extent;
        cam.near = 1;
        cam.far = 900;
        cam.updateProjectionMatrix();
        // Bias scaled with texel size: bigger texels need more help against acne.
        const texel = (2 * tier.extent) / tier.mapSize;
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = texel * 0.9;
        sun.shadow.radius = 1;
      }
      this.shadowExtent = tier.extent;
      this.shadowMapSize = tier.mapSize;
      // Exponential fog reaching ~95% at the draw distance.
      const dd = this.settings.get('graphics.drawDistance');
      this.scene.fog.density = 1.75 / dd;
      if (this.vhRenderer.post) this.vhRenderer.post.fogDensity = this.scene.fog.density;
    }

    /** Set the time of day (hours, 0–24) and recompute all lighting. */
    setTime(hours) {
      this.hours = ((hours % 24) + 24) % 24;
      // Always daytime (Settings → Gameplay): daytime hours stand, anything else becomes midday.
      if (this.settings.get('gameplay.alwaysDay') && (this.hours < 9 || this.hours > 16.5)) this.hours = 12.5;
      // Sunrise ~06:00, sunset ~18:00; the sun crosses the southern sky (+Z).
      const t = ((this.hours - 6) / 12) * Math.PI;
      const maxAlt = 66 * VH.math.DEG;
      this.sunDir.set(Math.cos(t), Math.sin(t) * Math.sin(maxAlt), Math.sin(t) * Math.cos(maxAlt) * 0.8 + 0.12).normalize();
      this.shared.uSunDir.value.copy(this.sunDir);
      this._applyKeys(this.sunDir.y);
      this._envDirty = true;
    }

    setCloudCover(c) {
      this.cloudCover = clamp(c, 0, 1);
      this.skyUniforms.uCloud.value = this.cloudCover;
      this._envDirty = true;
      this._applyKeys(this.sunDir.y);
    }

    _applyKeys(s) {
      let i = 0;
      while (i < KEYS.length - 2 && s > KEYS[i + 1].s) i++;
      const a = KEYS[i];
      const b = KEYS[i + 1];
      const k = clamp((s - a.s) / (b.s - a.s), 0, 1);
      const mixHex = (ha, hb, target) => {
        const ca = new THREE.Color(ha);
        const cb = new THREE.Color(hb);
        target.setRGB(lerp(ca.r, cb.r, k), lerp(ca.g, cb.g, k), lerp(ca.b, cb.b, k));
        return target;
      };
      const zenith = mixHex(a.zenith, b.zenith, this.shared.uSkyZenith.value);
      const horizon = mixHex(a.horizon, b.horizon, this.shared.uSkyHorizon.value);
      const lightColor = mixHex(a.light, b.light, new THREE.Color());
      const intensity = lerp(a.intensity, b.intensity, k);
      const envIntensity = lerp(a.env, b.env, k);
      const night = smoothstep(-0.04, -0.22, s);
      // Settings → Night brightness scales everything night adds on top of the day.
      const nb = this.nightBrightness;
      const exposure = lerp(a.exposure, b.exposure, k) * (1 + (nb - 1) * night * 0.6);

      // Above the horizon the sun lights the city; below it, the moon.
      const moon = s < -0.035;
      if (moon) this.lightDir.set(-this.sunDir.x * 0.6, 0.75, -this.sunDir.z * 0.6 + 0.25).normalize();
      else this.lightDir.copy(this.sunDir);
      // The sun's colour as seen in the sky and on the water fades out through twilight.
      this.shared.uSunColor.value.copy(lightColor).multiplyScalar(smoothstep(-0.12, 0.0, s));
      this.sun.color.copy(lightColor);
      this.sun.intensity = moon ? intensity * smoothstep(-0.035, -0.12, s) : intensity * smoothstep(-0.02, 0.03, s);

      this.hemi.color.copy(zenith).lerp(horizon, 0.3).lerp(NIGHT_SKY, night * 0.85);
      // Warm bounce from sunlit pavement and walls: without it shaded streets fall to flat navy.
      this.hemi.groundColor.setRGB(0.34, 0.29, 0.22).multiplyScalar(envIntensity).lerp(NIGHT_GROUND, night * 0.8);
      // People and cars are lit by this at night (lamp pools are only on the ground).
      this.hemi.intensity = 0.38 + envIntensity * 0.3 + night * 0.32 * nb;
      // Sky light fills shadows: keep shaded streets readable, not black.
      this.scene.environmentIntensity = envIntensity * 1.3 + night * 0.2 * nb;
      this.vhRenderer.renderer.toneMappingExposure = exposure;
      this.exposure = exposure;
      // Lift the very darkest tones a touch (post-processing): moonlit, not crushed.
      if (this.vhRenderer.post) this.vhRenderer.post.nightLift = night * nb;
      if (VH.Humanoid && VH.Humanoid.setNightFill) VH.Humanoid.setNightFill(0.075 * night * nb);

      this.skyUniforms.uNight.value = night;
      this.shared.uWindowGlow.value = smoothstep(0.1, -0.08, s);
      this.nightFactor = night;

      const post = this.vhRenderer.postEnabled;
      if (this.vhRenderer.post) {
        const pf = this.vhRenderer.post;
        pf.bloomStrength = 0.55 + night * 0.75;
        pf.sunDir.copy(this.sunDir);
        pf.sunColor.copy(lightColor);
        // Shafts, haze and flare belong to the sun only: they fade out through twilight and stay off under the moon.
        pf.sunAmount = moon ? 0 : smoothstep(-0.02, 0.14, s) * (1 - this.cloudCover * 0.55);
      }
      if (post) {
        // Post-processing tone-maps everything together at the end, so fog and
        // sky meet in linear HDR: the fog is simply the horizon colour.
        this.skyUniforms.uFogDisplay.value.copy(horizon);
        this.skyUniforms.uFogLinear.value.copy(horizon);
        this.scene.fog.color.copy(horizon);
        return;
      }
      // Fog = the horizon colour as it will appear on screen after tone mapping.
      const hLin = [horizon.r, horizon.g, horizon.b];
      const mapped = acesFilmic(hLin, exposure);
      this.skyUniforms.uFogLinear.value.copy(horizon);
      // scene.fog.color is converted to the output colour space by three.js on upload.
      this.scene.fog.color.setRGB(mapped[0], mapped[1], mapped[2]);
      // The raw (display) uniform above must not be colour-managed a second time.
      this.skyUniforms.uFogDisplay.value.setRGB(linearToSrgb(mapped[0]), linearToSrgb(mapped[1]), linearToSrgb(mapped[2]), THREE.LinearSRGBColorSpace);
    }

    _regenerateEnvMap() {
      const rt = this.pmrem.fromScene(this.envScene, 0.03, 0.1, 100);
      if (this._envTarget) this._envTarget.dispose();
      this._envTarget = rt;
      this.scene.environment = rt.texture;
      this._envDirty = false;
    }

    /** Per-frame: advance time (if running), follow the focus with the shadow map. */
    update(dt, focus) {
      this.shared.uTime.value += dt;
      if (this.clockRunning && !this.settings.get('gameplay.alwaysDay')) this.setTime(this.hours + dt / 60);

      // Reflections follow the sky at most every 2 s of *real* time: fast-forwarding
      // the simulation must not queue up hundreds of PMREM renders on the GPU.
      const now = performance.now();
      if (this._envDirty && (!this._envLast || now - this._envLast > 2000)) {
        this._regenerateEnvMap();
        this._envLast = now;
      }

      this.sky.position.copy(focus);
      if (this.sun.castShadow) this._placeShadow(focus);
      else {
        this.sun.position.copy(focus).addScaledVector(this.lightDir, 400);
        this.sun.target.position.copy(focus);
      }
    }

    /**
     * Centre the shadow map on the focus point, snapped to whole shadow
     * texels in light space so shadows don't crawl as the player moves.
     */
    _placeShadow(focus) {
      const L = this.lightDir;
      const up = this._tmpA.set(0, 1, 0);
      const right = this._tmpB.crossVectors(up, L).normalize();
      const upL = this._tmpC.crossVectors(L, right);
      const texel = (2 * this.shadowExtent) / this.shadowMapSize;
      const a = focus.dot(right);
      const b = focus.dot(upL);
      const da = Math.round(a / texel) * texel - a;
      const db = Math.round(b / texel) * texel - b;
      const center = this._focus.copy(focus).addScaledVector(right, da).addScaledVector(upL, db);
      // A low sun grazes the ground, which needs more bias to keep shadow acne away.
      const low = VH.math.clamp((0.55 - L.y) / 0.45, 0, 1);
      this.sun.shadow.bias = -0.0002 - 0.0009 * low;
      this.sun.shadow.normalBias = texel * (0.9 + 2.2 * low);
      this.sun.target.position.copy(center);
      this.sun.position.copy(center).addScaledVector(L, 450);
      this.sun.target.updateMatrixWorld();
      this.sun.updateMatrixWorld();
    }

    /** "16:36" */
    clockText() {
      const h = Math.floor(this.hours);
      const m = Math.floor((this.hours - h) * 60);
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
  }

  VH.Environment = Environment;
})();
