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
    uniform vec3 uMoonDir;
    uniform float uOvercast;
    uniform float uStorm;
    uniform float uFlash;
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
        // A second, fainter layer of stars, in a range of colours.
        vec3 sp2 = dir * 520.0;
        vec3 cell2 = floor(sp2);
        float r2 = hash13(cell2 + 17.0);
        float star2 = step(0.993, r2) * (1.0 - smoothstep(0.05, 0.3, length(fract(sp2) - 0.5)));
        vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.7, 0.85, 1.0), hash13(cell2 + 3.0));
        col += tint * star2 * uNight * 0.9 * (1.0 - uCloud);
        // The Milky Way: a soft band along a great circle, broken up by dark dust lanes.
        vec3 gal = normalize(vec3(0.35, 0.8, -0.45));
        float gd = dot(dir, gal);
        float band = exp(-gd * gd * 22.0);
        vec2 gp = vec2(atan(dir.z, dir.x) * 3.0, dir.y * 6.0);
        float dust = fbm(gp * 1.7 + 4.0);
        float cloudy = fbm(gp * 4.5);
        float milky = band * smoothstep(0.25, 0.8, dust) * (0.55 + 0.9 * cloudy);
        col += vec3(0.55, 0.6, 0.85) * milky * 0.28 * uNight * (1.0 - uCloud * 0.9);
      }

      // The moon: a lit disc with maria and a phase, an earthshine-lit dark side and a halo.
      float md = dot(dir, uMoonDir);
      if (uMoonDir.y > -0.05) {
        float halo = pow(max(md, 0.0), 400.0) * 0.22 + pow(max(md, 0.0), 60.0) * 0.025;
        col += vec3(0.62, 0.7, 0.95) * halo * (0.3 + 0.7 * uNight) * (1.0 - uCloud * 0.6) * smoothstep(-0.05, 0.1, uMoonDir.y);
        float moonR = 0.028;
        float ang = md > 0.99 ? acos(clamp(md, -1.0, 1.0)) : 1.0;
        if (ang < moonR && uEnvPass < 0.5) {
          vec3 up0 = abs(uMoonDir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 mt = normalize(cross(up0, uMoonDir));
          vec3 mb = cross(uMoonDir, mt);
          vec2 uv = vec2(dot(dir, mt), dot(dir, mb)) / sin(moonR);
          float rr = dot(uv, uv);
          vec3 n = vec3(uv, sqrt(max(1.0 - rr, 0.0)));
          vec3 phaseDir = normalize(vec3(0.75, 0.25, 0.6));
          float lit = smoothstep(-0.08, 0.12, dot(n, phaseDir));
          float maria = fbm(uv * 2.6 + 7.0);
          float craters = vnoise(uv * 9.0) * 0.5 + vnoise(uv * 19.0) * 0.25;
          vec3 albedo = mix(vec3(0.82, 0.82, 0.86), vec3(0.42, 0.44, 0.5), smoothstep(0.45, 0.62, maria)) * (0.85 + 0.3 * craters);
          vec3 moonCol = albedo * (lit * 2.4 + 0.045);
          float edge = 1.0 - smoothstep(0.92, 1.0, sqrt(rr));
          float vis = (1.0 - uCloud * 0.75) * smoothstep(-0.05, 0.08, uMoonDir.y) * (0.25 + 0.75 * uNight);
          col = mix(col, moonCol, edge * vis);
        }
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
        float fade = mix(smoothstep(-0.02, 0.22, h), smoothstep(-0.06, 0.1, h), uOvercast);
        cover = mix(cover, 1.0, uOvercast * 0.85);
        float lit = clamp(mu * 0.5 + 0.5, 0.0, 1.0);
        vec3 shade = uHorizon * 0.55 + uZenith * 0.2;
        vec3 bright = uSunColor * 0.9 + uHorizon * 0.35;
        vec3 cloudCol = mix(shade, bright, lit * 0.8 + 0.2) * mix(1.0, 0.72 - uStorm * 0.3, smoothstep(0.55, 0.95, n));
        cloudCol *= 1.0 - uStorm * 0.5;
        cloudCol += vec3(0.5, 0.58, 1.0) * uFlash * (0.5 + 0.8 * n);
        cloudCol *= 1.0 - 0.28 * body * (1.0 - uNight);
        cloudCol += uSunColor * rim * (0.35 + 0.9 * pow(max(mu, 0.0), 3.0)) * (1.0 - uEnvPass * 0.7) * (1.0 - uNight) * (1.0 - uOvercast);
        cloudCol = mix(cloudCol, uZenith * 0.25 + vec3(0.02), uNight * 0.85);
        col = mix(col, cloudCol, cover * fade * mix(0.92, 1.0, uOvercast));
      }
      col += vec3(0.4, 0.46, 0.8) * uFlash * 0.4;

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
      // Weather hooks (weather.js): everything is neutral until it drives them.
      this.wx = { cloud: 0, overcast: 0, storm: 0, dark: 0, desat: 0, tint: 0, fogMul: 1, sunMul: 1, hemiMul: 1, envMul: 1, expMul: 1, shaftMul: 1, flash: 0 };
      this.wxTint = new THREE.Color(0.55, 0.42, 0.28);
      this.baseFogDensity = 0.002;
      this._flashOn = false;
      this._base = { hemi: 0, env: 1, fog: new THREE.Color(), fogLin: new THREE.Color(), fogDisp: new THREE.Color() };
      this._flashCol = new THREE.Color(0.62, 0.7, 1.0);
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
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uOvercast: { value: 0 },
        uStorm: { value: 0 },
        uFlash: { value: 0 },
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
      this.baseFogDensity = 1.75 / dd;
      this._applyFog();
    }

    /** Fog density = the quality setting's base × the weather's multiplier. */
    _applyFog() {
      // Flying high clears the haze (ambient.js): keep its factor in the product.
      const amb = VH.game && VH.game.ambient;
      const air = amb && amb._fogK > 0.2 ? amb._fogK : 1;
      this.scene.fog.density = (this.baseFogDensity * this.wx.fogMul * (this._altK || 1)) / air;
      if (this.vhRenderer.post) this.vhRenderer.post.fogDensity = this.scene.fog.density;
    }

    /** Cloud cover as the sky sees it: the base cover pushed towards 1 by the weather. */
    get effectiveCloud() {
      return lerp(this.cloudCover, 1, this.wx.cloud);
    }

    /** Weather hook: merge new multipliers/targets and recompute the lighting. */
    setWeather(p) {
      Object.assign(this.wx, p);
      const u = this.skyUniforms;
      u.uCloud.value = this.effectiveCloud;
      u.uOvercast.value = this.wx.overcast;
      u.uStorm.value = this.wx.storm;
      this._envDirty = true;
      this._applyKeys(this.sunDir.y);
    }

    /** Lightning: brighten sky, fog and ambient light by `f` (0..1) without redoing the whole lighting. */
    _applyFlash() {
      const f = this.wx.flash;
      if (f <= 0.002 && !this._flashOn) return;
      this._flashOn = f > 0.002;
      const b = this._base;
      this.skyUniforms.uFlash.value = f;
      this.hemi.intensity = b.hemi + f * 2.4;
      this.scene.environmentIntensity = b.env + f * 1.8;
      this.scene.fog.color.copy(b.fog).lerp(this._flashCol, f * 0.75);
      this.skyUniforms.uFogLinear.value.copy(b.fogLin).lerp(this._flashCol, f * 0.75);
      this.skyUniforms.uFogDisplay.value.copy(b.fogDisp).lerp(this._flashCol, f * 0.75);
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
      // The moon rides opposite the sun, tilted a little so it isn't always dead overhead at midnight.
      this.skyUniforms.uMoonDir.value.set(-this.sunDir.x * 0.85 + 0.12, -this.sunDir.y * 0.95 + 0.04, -this.sunDir.z * 0.85 - 0.2).normalize();
      this._applyKeys(this.sunDir.y);
      this._envDirty = true;
    }

    setCloudCover(c) {
      this.cloudCover = clamp(c, 0, 1);
      this.skyUniforms.uCloud.value = this.effectiveCloud;
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
      this._gradeSky(zenith, 1);
      this._gradeSky(horizon, 0);
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
      this.sun.intensity = (moon ? intensity * smoothstep(-0.035, -0.12, s) : intensity * smoothstep(-0.02, 0.03, s)) * this.wx.sunMul;

      this.hemi.color.copy(zenith).lerp(horizon, 0.3).lerp(NIGHT_SKY, night * 0.85);
      // Warm bounce from sunlit pavement and walls: without it shaded streets fall to flat navy.
      this.hemi.groundColor.setRGB(0.34, 0.29, 0.22).multiplyScalar(envIntensity).lerp(NIGHT_GROUND, night * 0.8);
      // People and cars are lit by this at night (lamp pools are only on the ground).
      this.hemi.intensity = (0.38 + envIntensity * 0.3 + night * 0.32 * nb) * this.wx.hemiMul;
      // Sky light fills shadows: keep shaded streets readable, not black.
      this.scene.environmentIntensity = (envIntensity * 1.3 + night * 0.2 * nb) * this.wx.envMul;
      // Dull skies call for a longer exposure by day; the night keys are lifted enough already.
      const exposureW = exposure * lerp(this.wx.expMul, 1, night);
      this.vhRenderer.renderer.toneMappingExposure = exposureW;
      this.exposure = exposureW;
      this._base.hemi = this.hemi.intensity;
      this._base.env = this.scene.environmentIntensity;
      // Lift the very darkest tones a touch (post-processing): moonlit, not crushed.
      if (this.vhRenderer.post) this.vhRenderer.post.nightLift = night * nb;
      if (VH.Humanoid && VH.Humanoid.setNightFill) VH.Humanoid.setNightFill(0.075 * night * nb);

      this.skyUniforms.uNight.value = night;
      // Murky weather switches the lamps and windows on even at noon.
      this.shared.uWindowGlow.value = Math.max(smoothstep(0.1, -0.08, s), smoothstep(0.45, 0.8, this.wx.dark) * 0.75);
      this.nightFactor = night;

      const post = this.vhRenderer.postEnabled;
      if (this.vhRenderer.post) {
        const pf = this.vhRenderer.post;
        pf.bloomStrength = 0.55 + night * 0.75;
        pf.sunDir.copy(this.sunDir);
        pf.sunColor.copy(lightColor);
        // Shafts, haze and flare belong to the sun only: they fade out through twilight and stay off under the moon.
        pf.sunAmount = moon ? 0 : smoothstep(-0.02, 0.14, s) * (1 - this.effectiveCloud * 0.55) * this.wx.shaftMul;
      }
      if (post) {
        // Post-processing tone-maps everything together at the end, so fog and
        // sky meet in linear HDR: the fog is simply the horizon colour.
        this.skyUniforms.uFogDisplay.value.copy(horizon);
        this.skyUniforms.uFogLinear.value.copy(horizon);
        this.scene.fog.color.copy(horizon);
        this._storeFogBase();
        return;
      }
      // Fog = the horizon colour as it will appear on screen after tone mapping.
      const hLin = [horizon.r, horizon.g, horizon.b];
      const mapped = acesFilmic(hLin, exposureW);
      this.skyUniforms.uFogLinear.value.copy(horizon);
      // scene.fog.color is converted to the output colour space by three.js on upload.
      this.scene.fog.color.setRGB(mapped[0], mapped[1], mapped[2]);
      // The raw (display) uniform above must not be colour-managed a second time.
      this.skyUniforms.uFogDisplay.value.setRGB(linearToSrgb(mapped[0]), linearToSrgb(mapped[1]), linearToSrgb(mapped[2]), THREE.LinearSRGBColorSpace);
      this._storeFogBase();
    }

    _storeFogBase() {
      this._base.fog.copy(this.scene.fog.color);
      this._base.fogLin.copy(this.skyUniforms.uFogLinear.value);
      this._base.fogDisp.copy(this.skyUniforms.uFogDisplay.value);
      this._applyFog();
    }

    /** Weather grading of a sky colour (in place): towards grey, darker, and tinted for dust. */
    _gradeSky(c, zen) {
      const w = this.wx;
      if (w.dark <= 0 && w.desat <= 0 && w.tint <= 0) return;
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const k = 1 - w.dark * (zen ? 0.62 : 0.5);
      let r = (c.r + (l - c.r) * w.desat) * k;
      let g = (c.g + (l - c.g) * w.desat) * k;
      let bl = (c.b + (l - c.b) * w.desat) * k;
      // Wet skies are cool grey, not beige.
      r *= 1 - 0.07 * w.desat;
      bl *= 1 + 0.09 * w.desat;
      if (w.tint > 0) {
        const t = this.wxTint;
        const tl = Math.max(0.0001, 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b);
        const sc = Math.max(l * k, 0.02) / tl;
        r += (t.r * sc - r) * w.tint;
        g += (t.g * sc - g) * w.tint;
        bl += (t.b * sc - bl) * w.tint;
      }
      c.setRGB(r, g, bl);
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

      // Seen from the air the haze thins out (most of it hugs the ground), so a
      // pilot can see the city and the desert instead of a milky wall.
      const alt = this.vhRenderer.camera.position.y;
      if (Math.abs(alt - this._fogAlt) > 2 && this.baseFogDensity) {
        this._fogAlt = alt;
        const k = 1 - 0.6 * smoothstep(25, 380, alt);
        this._altK = k;
        this._applyFog();
      }
      this.sky.position.copy(focus);
      this._applyFlash();
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
