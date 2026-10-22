/*
 * weather.js — rain, storms, fog and a wet city.
 *
 *   states      clear, cloudy, overcast, drizzle, rain, storm, fog, dust.
 *               Each one is a bundle of numbers (cloud cover, sky darkening,
 *               fog density, sun strength, rain, wind, lightning rate) and
 *               the current weather is a smooth blend between two bundles.
 *   director    in "auto" it walks plausible chains (clear → cloudy →
 *               overcast → drizzle → rain → storm and back) with long spells
 *               of sunshine in between: Vicehaven gets 312 days of it.
 *               Settings → Gameplay → Weather (or the `weather` debug command)
 *               pins one state instead.
 *   rain        one instanced mesh of streaks that fall in a box around the
 *               camera (all motion is in the vertex shader), plus ground
 *               splash rings around the player. No per-frame allocation.
 *   wet world   `uWet` / `uRain` in the shared uniforms (materials.js) make
 *               roads, pavements, grass and walls darker and glossier, fill
 *               puddles and ring them while it rains.
 *   sky         environment.js multipliers (cloud cover, darkening, fog, sun,
 *               ambient, exposure) are driven through Environment.setWeather.
 *   lightning   flashes light the sky, fog and ambient light, a forked bolt
 *               is drawn far away, and thunder rolls in later by distance.
 *   audio       rain hiss and patter (muffled inside vehicles), wind, thunder:
 *               all synthesised on the existing Web Audio engine.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep } = VH.math;

  // ---------------------------------------------------------------- states
  // cloud: push of the cloud cover towards 1 · overcast: sky shader's solid deck · storm: dark clouds
  // dark/desat: sky and fog colour grading · tint: dust colour · fogMul: fog density multiplier
  // sunMul/hemiMul/envMul/expMul: light levels · shaftMul: sun shafts · rain 0..1 · wind 0..1 · ltn: lightning
  const KEYS = ['cloud', 'overcast', 'storm', 'dark', 'desat', 'tint', 'fogMul', 'sunMul', 'hemiMul', 'envMul', 'expMul', 'shaftMul', 'rain', 'wind', 'ltn'];
  const mk = (a) => {
    const o = {};
    KEYS.forEach((k, i) => (o[k] = a[i]));
    return o;
  };
  //              cloud overc storm dark  desat tint  fogM  sun   hemi  env   exp   shaft rain  wind  ltn
  const STATES = {
    clear: mk([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.2, 0.0]),
    cloudy: mk([0.4, 0.1, 0.0, 0.14, 0.18, 0.0, 1.15, 0.8, 1.0, 1.0, 1.0, 0.5, 0.0, 0.35, 0.0]),
    overcast: mk([0.85, 0.75, 0.1, 0.34, 0.45, 0.0, 1.6, 0.4, 1.1, 1.0, 1.1, 0.1, 0.0, 0.45, 0.0]),
    drizzle: mk([0.92, 0.9, 0.2, 0.42, 0.55, 0.0, 2.2, 0.28, 1.15, 1.0, 1.18, 0.05, 0.35, 0.4, 0.0]),
    rain: mk([1.0, 1.0, 0.5, 0.6, 0.7, 0.0, 3.2, 0.15, 1.2, 1.0, 1.3, 0.0, 0.8, 0.6, 0.0]),
    storm: mk([1.0, 1.0, 1.0, 0.82, 0.75, 0.0, 4.2, 0.07, 1.25, 1.0, 1.35, 0.0, 1.0, 1.0, 1.0]),
    fog: mk([0.5, 0.55, 0.0, 0.1, 0.6, 0.0, 8.0, 0.45, 1.2, 1.0, 1.12, 0.15, 0.0, 0.05, 0.0]),
    dust: mk([0.35, 0.3, 0.0, 0.12, 0.0, 0.85, 5.5, 0.55, 1.15, 1.0, 1.1, 0.25, 0.0, 1.0, 0.0]),
  };
  const NAMES = Object.keys(STATES);
  const ALIASES = { sun: 'clear', sunny: 'clear', cloud: 'cloudy', clouds: 'cloudy', grey: 'overcast', gray: 'overcast', light: 'drizzle', lightrain: 'drizzle', light_rain: 'drizzle', heavy: 'rain', heavyrain: 'rain', thunder: 'storm', thunderstorm: 'storm', mist: 'fog', sandstorm: 'dust', haze: 'dust' };

  // How long each spell lasts [min, max] seconds, and what can follow it.
  const HOLD = { clear: [300, 720], cloudy: [100, 220], overcast: [70, 150], drizzle: [90, 200], rain: [80, 180], storm: [70, 140], fog: [120, 260], dust: [100, 200] };
  const NEXT = {
    clear: { cloudy: 6, fog: 1, dust: 2 },
    cloudy: { clear: 5, overcast: 3, drizzle: 1 },
    overcast: { cloudy: 3, clear: 1.5, drizzle: 3, rain: 1.5 },
    drizzle: { overcast: 3, rain: 2, cloudy: 2.5, clear: 0.5 },
    rain: { drizzle: 3, storm: 1.6, overcast: 2.5 },
    storm: { rain: 4, drizzle: 1.5, overcast: 1 },
    fog: { clear: 4, cloudy: 2.5 },
    dust: { clear: 5, cloudy: 1 },
  };
  // What the Settings → Gameplay → Weather choices pin.
  const SETTING_STATE = { clear: 'clear', cloudy: 'cloudy', rain: 'rain', storm: 'storm', fog: 'fog' };

  const MAX_STREAKS = 12000;
  const MAX_SPLASH = 520;
  const MAX_BOLT_SEGS = 420;

  // --------------------------------------------------------------- shaders
  const RAIN_VERT = /* glsl */ `
    attribute vec2 aCorner;
    attribute vec4 aSeed;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uBase;
    uniform float uH;
    uniform float uBox;
    uniform float uFall;
    uniform float uLen;
    uniform vec2 uWind;
    uniform vec3 uColor;
    varying vec3 vCol;
    varying vec2 vUv;
    varying float vA;
    void main() {
      float on = step(aSeed.w, uIntensity);
      vec2 cam = cameraPosition.xz;
      vec2 xz = cam + (fract(aSeed.xy - cam / uBox) - 0.5) * uBox;
      float sv = 0.85 + 0.3 * fract(aSeed.w * 37.1);
      float f = fract(aSeed.z - uTime * uFall * sv / uH);
      float y = uBase + f * uH;
      xz += uWind * ((1.0 - f) * uH / (uFall * sv));
      vec3 p = vec3(xz.x, y, xz.y);
      vec3 toCam = p - cameraPosition;
      float dist = length(toCam);
      vec3 v = normalize(vec3(uWind.x, -uFall, uWind.y));
      float len = uLen * (0.75 + 0.5 * fract(aSeed.w * 91.7));
      vec3 side = normalize(cross(v, toCam / dist));
      float w = 0.006 + dist * 0.0016;
      vec3 P = p - v * len * aCorner.y + side * aCorner.x * w;
      float fade = (1.0 - smoothstep(5.0, uBox * 0.47, dist)) * smoothstep(0.5, 2.4, dist);
      // Drops die at the ground and at the top of the volume.
      fade *= smoothstep(0.0, 0.5, f * uH) * (1.0 - smoothstep(0.88, 1.0, f));
      vA = on * fade * (1.0 - aCorner.y * 0.6) * (0.8 + 0.2 * fract(aSeed.w * 13.3));
      vCol = uColor;
      vUv = aCorner;
      gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
    }
  `;
  const RAIN_FRAG = /* glsl */ `
    varying vec3 vCol;
    varying vec2 vUv;
    varying float vA;
    void main() {
      float a = vA * (1.0 - vUv.x * vUv.x);
      if (a < 0.003) discard;
      gl_FragColor = vec4(vCol, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  const SPLASH_VERT = /* glsl */ `
    attribute vec2 aCorner;
    attribute vec4 aSeed;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uGround;
    uniform float uBox;
    uniform vec3 uColor;
    varying vec2 vLocal;
    varying float vPh;
    varying float vA;
    varying float vRot;
    float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
    void main() {
      float t = uTime * 2.2 + aSeed.z * 9.0;
      float cyc = floor(t);
      float ph = fract(t);
      vec2 jit = vec2(hash(aSeed.w * 7.0 + cyc * 1.7), hash(aSeed.w * 3.1 + cyc * 2.3));
      vec2 s = fract(aSeed.xy + jit);
      vec2 cam = cameraPosition.xz;
      vec2 xz = cam + (fract(s - cam / uBox) - 0.5) * uBox;
      float dist = length(xz - cam);
      float on = step(hash(aSeed.w * 5.0 + cyc * 0.37), uIntensity);
      vA = on * (1.0 - smoothstep(uBox * 0.2, uBox * 0.5, dist)) * smoothstep(0.8, 2.0, dist);
      vPh = ph;
      vLocal = aCorner;
      vRot = hash(aSeed.w + cyc) * 6.283;
      vec3 P = vec3(xz.x, uGround + 0.035, xz.y) + vec3(aCorner.x, 0.0, aCorner.y) * 0.3;
      gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
    }
  `;
  const SPLASH_FRAG = /* glsl */ `
    uniform vec3 uColor;
    varying vec2 vLocal;
    varying float vPh;
    varying float vA;
    varying float vRot;
    void main() {
      if (vA < 0.004) discard;
      float r = length(vLocal) * 0.3;
      float ringR = mix(0.025, 0.2, sqrt(vPh));
      float d = (r - ringR) / 0.014;
      float ring = exp(-d * d) * pow(1.0 - vPh, 1.6);
      // A crown of droplets thrown up in the first instants.
      float ang = atan(vLocal.y, vLocal.x) + vRot;
      float spokes = pow(max(cos(ang * 4.0), 0.0), 6.0);
      float dc = (r - ringR * 0.7) / 0.02;
      float crown = exp(-dc * dc) * spokes * (1.0 - smoothstep(0.0, 0.3, vPh));
      float a = (ring * 0.55 + crown * 0.9) * vA;
      if (a < 0.004) discard;
      gl_FragColor = vec4(uColor, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  /** Camera-facing quad geometry shared by the rain and splash meshes. */
  function instancedQuads(max, flat) {
    const geo = new THREE.InstancedBufferGeometry();
    const corners = flat ? [-1, -1, 1, -1, -1, 1, 1, 1] : [-1, 0, 1, 0, -1, 1, 1, 1];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array(corners), 2));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    const seed = new Float32Array(max * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.instanceCount = 0;
    return geo;
  }

  // --------------------------------------------------------------- the system
  class Weather {
    constructor(game) {
      this.game = game;
      this.env = game.environment;
      this.shared = VH.Materials.shared;
      this.saveKey = 'weather';
      this.t = 0;
      this.state = 'clear';
      this.mode = 'auto'; // 'auto', or a state pinned by the setting / the debug command
      this.cur = Object.assign({}, STATES.clear);
      this._from = Object.assign({}, STATES.clear);
      this._to = Object.assign({}, STATES.clear);
      this._k = 1;
      this._dur = 30;
      this.hold = this._rollHold('clear');
      this.wet = 0;
      this.rainNow = 0;
      this._push = 0;
      this._dirty = true;
      this._windAng = Math.random() * 6.28;
      this._ground = 0;
      this._groundT = 0;
      this._snd = 0;
      this._tmpC = new THREE.Color();
      this.flash = 0;
      this._pulses = [];
      for (let i = 0; i < 5; i++) this._pulses.push({ t: 1e9, a: 0 });
      this._boltT = 1e9;
      this._boltLife = 0;
      this._nextBolt = 20;
      this._thunders = [];
      this._build();
      this._applyQuality();
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'graphics' || e.path.startsWith('graphics.') || e.path === '*') this._applyQuality();
        if (e.path === 'gameplay.weather' || e.path === '*') this._applySetting(false);
      });
      this._applySetting(true);
      this._pushEnv();
    }

    // ------------------------------------------------------------ building
    _build() {
      const scene = this.game.scene;
      const sh = this.shared;
      // Rain streaks.
      this.rainU = {
        uTime: { value: 0 }, uIntensity: { value: 0 }, uBase: { value: 0 }, uH: { value: 24 }, uBox: { value: 46 },
        uFall: { value: 15 }, uLen: { value: 0.55 }, uWind: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0.5, 0.55, 0.62) },
      };
      this.rainGeo = instancedQuads(MAX_STREAKS, false);
      this.rain = new THREE.Mesh(this.rainGeo, new THREE.ShaderMaterial({
        uniforms: this.rainU, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      this.rain.frustumCulled = false;
      this.rain.renderOrder = 20;
      this.rain.visible = false;
      this.rain.name = 'rain';
      scene.add(this.rain);
      // Splash rings on the ground.
      this.splashU = {
        uTime: this.rainU.uTime, uIntensity: { value: 0 }, uGround: { value: 0 }, uBox: { value: 26 }, uColor: { value: new THREE.Color(0.7, 0.75, 0.85) },
      };
      this.splashGeo = instancedQuads(MAX_SPLASH, true);
      this.splash = new THREE.Mesh(this.splashGeo, new THREE.ShaderMaterial({
        uniforms: this.splashU, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG,
        transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }));
      this.splash.frustumCulled = false;
      this.splash.renderOrder = 19;
      this.splash.visible = false;
      this.splash.name = 'rain splashes';
      scene.add(this.splash);
      // Lightning bolt.
      this.boltPos = new Float32Array(MAX_BOLT_SEGS * 6);
      this.boltGeo = new THREE.BufferGeometry();
      this.boltGeo.setAttribute('position', new THREE.BufferAttribute(this.boltPos, 3).setUsage(THREE.DynamicDrawUsage));
      this.boltGeo.setDrawRange(0, 0);
      this.boltMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(5, 5.6, 8), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      this.bolt = new THREE.LineSegments(this.boltGeo, this.boltMat);
      this.bolt.frustumCulled = false;
      this.bolt.renderOrder = 15;
      this.bolt.visible = false;
      this.bolt.name = 'lightning';
      scene.add(this.bolt);
    }

    _applyQuality() {
      const s = VH.settings;
      const fx = s.get('graphics.effects');
      const ultra = s.get('graphics.quality') === 'ultra';
      this.streakMax = fx === 'low' ? 1800 : fx === 'medium' ? 4800 : ultra ? 12000 : 8500;
      this.splashMax = fx === 'low' ? 0 : fx === 'medium' ? 260 : MAX_SPLASH;
      this.rainU.uBox.value = fx === 'low' ? 30 : 38;
      this._lastCount = -1;
    }

    // ------------------------------------------------------------ control
    /** The state names, for the console. */
    static get names() {
      return NAMES.slice();
    }

    _resolve(name) {
      if (!name) return null;
      const n = String(name).toLowerCase();
      if (STATES[n]) return n;
      return ALIASES[n] || null;
    }

    _rollHold(state) {
      const h = HOLD[state];
      return h[0] + Math.random() * (h[1] - h[0]);
    }

    /** Blend towards a state over `seconds` (0 = at once). */
    goto(state, seconds) {
      if (!STATES[state]) return;
      this.state = state;
      this._from = Object.assign(this._from, this.cur);
      this._to = Object.assign(this._to, STATES[state]);
      this._dur = Math.max(0, seconds === undefined ? 25 + Math.random() * 15 : seconds);
      this._k = this._dur <= 0 ? 1 : 0;
      if (this._dur <= 0) {
        Object.assign(this.cur, this._to);
        this._dirty = true;
      }
      this.hold = this._rollHold(state);
    }

    /** Jump (or blend) to a state; instant = true also soaks the world straight away. */
    set(state, instant) {
      const s = this._resolve(state);
      if (!s) return false;
      this.mode = 'manual';
      this.goto(s, instant ? 0 : 12);
      if (instant) {
        this.wet = Math.max(this.wet, this._wetTarget(STATES[s]));
        this.rainNow = STATES[s].rain;
        this._pushEnv();
      }
      return true;
    }

    /** Debug console: `weather <state|auto> [seconds]`. */
    command(arg, secs) {
      if (!arg) return 'Weather: ' + this.describe() + '. Usage: weather <' + NAMES.join('|') + '|auto|dry|soak> [seconds]';
      const a = String(arg).toLowerCase();
      if (a === 'auto') {
        this.mode = 'auto';
        this.goto('clear', 8);
        return 'Weather back on automatic.';
      }
      if (a === 'dry') {
        this.wet = 0;
        return 'Dried the streets.';
      }
      if (a === 'soak') {
        this.wet = 1;
        return 'Soaked the streets.';
      }
      if (a === 'bolt' || a === 'lightning') {
        this.strike(false);
        return 'Lightning.';
      }
      const s = this._resolve(a);
      if (!s) return 'Unknown weather "' + arg + '". Try ' + NAMES.join(', ') + ', auto.';
      const sec = secs !== undefined && !isNaN(parseFloat(secs)) ? parseFloat(secs) : 10;
      this.mode = 'manual';
      this.goto(s, sec);
      if (sec <= 0) {
        this.wet = Math.max(this.wet, this._wetTarget(STATES[s]));
        this.rainNow = STATES[s].rain;
        this._pushEnv();
      }
      return 'Weather: ' + s + (sec > 0 ? ' (over ' + sec + ' s)' : '');
    }

    describe() {
      return this.state + (this._k < 1 ? ' (changing)' : '') + (this.mode === 'auto' ? ', automatic' : ', pinned') + ', wet ' + this.wet.toFixed(2);
    }

    _applySetting(initial) {
      const v = VH.settings.get('gameplay.weather') || 'auto';
      if (v === 'auto') {
        if (this.mode !== 'auto' && !initial) {
          this.mode = 'auto';
          this.goto('clear', 25);
        }
        return;
      }
      const s = SETTING_STATE[v];
      if (!s) return;
      this.mode = 'setting';
      this.goto(s, initial ? 0 : 25);
      if (initial) this.wet = this._wetTarget(STATES[s]);
    }

    _wetTarget(p) {
      return p.rain > 0.05 ? clamp(0.4 + p.rain * 0.65, 0, 1) : p.fogMul > 7 ? 0.25 : 0;
    }

    _pickNext() {
      const table = NEXT[this.state];
      const g = this.game;
      const desert = g.player && g.player.pos.x < -900;
      const morning = this.env.hours > 3 && this.env.hours < 9.5;
      let sum = 0;
      for (const k in table) sum += this._weight(k, table[k], desert, morning);
      let r = Math.random() * sum;
      let pick = 'clear';
      for (const k in table) {
        r -= this._weight(k, table[k], desert, morning);
        if (r <= 0) {
          pick = k;
          break;
        }
      }
      // Soaked streets under a blue sky are rare: after rain, clouds clear gradually.
      this.goto(pick, 25 + Math.random() * 15);
    }

    _weight(k, w, desert, morning) {
      if (k === 'dust') return desert ? w * 2 : 0;
      if (k === 'fog') return w * (morning ? 3 : 0.25);
      return w;
    }

    // ------------------------------------------------------------- update
    update(dt) {
      if (!(dt > 0)) return;
      if (dt > 0.25) dt = 0.25;
      this.t += dt;
      const cur = this.cur;

      // Blend between the two state bundles, then pick the next one when the spell is over.
      if (this._k < 1) {
        this._k = Math.min(1, this._k + dt / this._dur);
        const e = smoothstep(0, 1, this._k);
        for (let i = 0; i < KEYS.length; i++) {
          const key = KEYS[i];
          cur[key] = this._from[key] + (this._to[key] - this._from[key]) * e;
        }
        this._dirty = true;
      } else if (this.mode === 'auto') {
        this.hold -= dt;
        if (this.hold <= 0) this._pickNext();
      }

      // The streets get wet while it rains and dry out slowly afterwards (quicker in sunshine).
      const target = this._wetTarget(cur);
      if (this.wet < target) this.wet = Math.min(target, this.wet + dt * (0.012 + cur.rain * 0.05));
      else {
        const sun = smoothstep(0.35, 0.9, cur.sunMul);
        this.wet = Math.max(target, this.wet - dt / (330 - sun * 200));
      }
      // Rain eases in and out of the streaks on its own short ramp.
      this.rainNow += (cur.rain - this.rainNow) * Math.min(1, dt * 1.5);
      if (Math.abs(this.rainNow - cur.rain) < 0.002) this.rainNow = cur.rain;

      // Push to the sky at ~8 Hz while anything is changing.
      this._push -= dt;
      if (this._dirty && this._push <= 0) {
        this._push = 0.12;
        this._dirty = false;
        this._pushEnv();
      }

      this._wind(dt);
      this._lightning(dt);
      this._visuals(dt);
      this._audio(dt);
      this.shared.uWet.value = this.wet;
      this.shared.uWetGlow.value = this.env.nightFactor || 0;
      this.shared.uRain.value = this.rainNow;
    }

    _pushEnv() {
      const c = this.cur;
      const env = this.env;
      env.wxTint.setRGB(0.62, 0.44, 0.26);
      env.setWeather({
        cloud: c.cloud, overcast: c.overcast, storm: c.storm, dark: c.dark, desat: c.desat, tint: c.tint,
        fogMul: c.fogMul, sunMul: c.sunMul, hemiMul: c.hemiMul, envMul: c.envMul, expMul: c.expMul, shaftMul: c.shaftMul,
      });
      this.shared.uWind.value = 1 + c.wind * 2.2;
    }

    _wind(dt) {
      this._windAng += dt * 0.02 * (0.5 + Math.sin(this.t * 0.013));
      const gust = 0.8 + 0.2 * Math.sin(this.t * 0.9) * Math.sin(this.t * 0.31 + 1.3);
      const sp = (1.2 + this.cur.wind * 7) * gust;
      this.windX = Math.cos(this._windAng) * sp;
      this.windZ = Math.sin(this._windAng) * sp;
    }

    // ---------------------------------------------------------- visuals
    _visuals(dt) {
      const r = this.rainNow;
      const env = this.env;
      const cam = this.game.renderer.camera;
      const U = this.rainU;
      const show = r > 0.01;
      this.rain.visible = show;
      this.splash.visible = show && this.splashMax > 0;
      if (!show) {
        return;
      }
      // Ground under the player (a few times a second).
      this._groundT -= dt;
      if (this._groundT <= 0) {
        this._groundT = 0.2;
        const ph = this.game.physics;
        const p = this.game.player.renderPos;
        const g = ph && ph.groundHeight ? ph.groundHeight(cam.position.x, cam.position.z, Math.max(cam.position.y, p.y) + 0.5) : p.y;
        this._ground += (g - this._ground) * 0.6;
        if (Math.abs(g - this._ground) < 0.02) this._ground = g;
      }
      const n = Math.floor(this.streakMax * smoothstep(0, 0.12, r));
      if (n !== this._lastCount) {
        this.rainGeo.instanceCount = n;
        this._lastCount = n;
      }
      this.splashGeo.instanceCount = this.splashMax;
      U.uTime.value = this.t;
      U.uIntensity.value = r;
      U.uBase.value = Math.max(this._ground, cam.position.y - U.uH.value * 0.55);
      U.uWind.value.set(this.windX * 0.55, this.windZ * 0.55);
      // Light rain is a thin hiss of fine drops; a storm hammers down, slanted.
      U.uFall.value = 13 + r * 5;
      U.uLen.value = 0.4 + r * 0.25;
      const night = env.nightFactor || 0;
      const lit = lerp(0.62, 0.24, night) * (0.7 + 0.3 * (1 - this.cur.dark));
      const f = this.flash;
      U.uColor.value.setRGB(lit * 0.92 + f * 1.4, lit * 1.0 + f * 1.5, lit * 1.12 + f * 2.2);
      this.splashU.uIntensity.value = r;
      this.splashU.uGround.value = this._ground;
      this.splashU.uColor.value.setRGB(lit * 1.1 + f, lit * 1.15 + f, lit * 1.3 + f * 1.4);
    }

    // --------------------------------------------------------- lightning
    _lightning(dt) {
      const c = this.cur;
      // Schedule.
      if (c.ltn > 0.2 && c.storm > 0.6) {
        this._nextBolt -= dt;
        if (this._nextBolt <= 0) {
          this._nextBolt = lerp(34, 7, c.ltn) * (0.5 + Math.random());
          this.strike(Math.random() < 0.35);
        }
      } else this._nextBolt = Math.max(this._nextBolt, 6);

      // Flash envelope: a few quick strokes, each decaying fast.
      let f = 0;
      for (let i = 0; i < this._pulses.length; i++) {
        const p = this._pulses[i];
        const age = this.t - p.t;
        if (age >= 0 && age < 1.2) f = Math.max(f, p.a * Math.exp(-age / 0.09));
      }
      const reduced = VH.settings.get('accessibility.reducedFlashing');
      // By day the flash is a weaker contrast against a bright sky; reduced flashing dims it further.
      this.flash = f * (reduced ? 0.3 : 0.55 + 0.45 * (this.env.nightFactor || 0));
      this.env.wx.flash = this.flash;

      // The bolt itself flickers with the strokes.
      if (this.bolt.visible) {
        const age = this.t - this._boltT;
        if (age > this._boltLife) this.bolt.visible = false;
        else this.boltMat.opacity = clamp(0.35 + f * 1.1, 0, 1);
      }

      // Thunder arrives later.
      for (let i = this._thunders.length - 1; i >= 0; i--) {
        const th = this._thunders[i];
        if (this.t >= th.at) {
          this._thunder(th.dist, th.amp);
          this._thunders.splice(i, 1);
        }
      }
    }

    /** A lightning strike somewhere around the player. `sheet` = lit clouds only, no visible bolt. */
    strike(sheet, bearingOverride) {
      const cam = this.game.renderer.camera;
      // Prefer the sky in front of the camera so the player sees it.
      cam.getWorldDirection(this._tmpDir || (this._tmpDir = new THREE.Vector3()));
      const fwd = Math.atan2(this._tmpDir.z, this._tmpDir.x);
      const bearing = bearingOverride !== undefined ? bearingOverride : Math.random() < 0.7 ? fwd + (Math.random() - 0.5) * 1.8 : Math.random() * Math.PI * 2;
      const dist = 280 + Math.random() * Math.random() * 1500 + (sheet ? 500 : 0);
      const cx = cam.position.x + Math.cos(bearing) * dist;
      const cz = cam.position.z + Math.sin(bearing) * dist;
      const amp = clamp(1.15 - dist / 1900, 0.3, 1);
      // Strokes.
      const n = 2 + Math.floor(Math.random() * 3);
      let t = this.t;
      for (let i = 0; i < this._pulses.length; i++) {
        const p = this._pulses[i];
        if (i < n) {
          p.t = t;
          p.a = amp * (i === 0 ? 1 : 0.45 + Math.random() * 0.5);
          t += 0.07 + Math.random() * 0.17;
        } else p.t = 1e9;
      }
      const reduced = VH.settings.get('accessibility.reducedFlashing');
      const post = this.game.renderer.post;
      if (post && post.pulse && !reduced) post.pulse(0.1 + amp * 0.12, [0.74, 0.8, 1]);
      if (!sheet) this._buildBolt(cx, cz, cam.position);
      this._thunders.push({ at: this.t + dist / 343, dist, amp });
      if (this._thunders.length > 6) this._thunders.shift();
    }

    _buildBolt(cx, cz, camPos) {
      const P = this.boltPos;
      let n = 0;
      const dx = cx - camPos.x;
      const dz = cz - camPos.z;
      const D = Math.hypot(dx, dz);
      // Unit vector sideways of the view direction, for the jaggedness.
      const sx = -dz / D;
      const sz = dx / D;
      const top = 520 + Math.random() * 180;
      const seg = (ax, ay, az, bx, by, bz) => {
        // Three nearly coincident copies so the line is a few pixels wide at any distance.
        const j = D * 0.0011;
        for (let k = 0; k < 3 && n < MAX_BOLT_SEGS; k++) {
          const ox = k === 0 ? 0 : (k === 1 ? j : -j) * sx;
          const oz = k === 0 ? 0 : (k === 1 ? j : -j) * sz;
          const o = n * 6;
          P[o] = ax + ox; P[o + 1] = ay; P[o + 2] = az + oz;
          P[o + 3] = bx + ox; P[o + 4] = by; P[o + 5] = bz + oz;
          n++;
        }
      };
      const steps = 22 + Math.floor(Math.random() * 6);
      let px = cx;
      let py = top;
      let pz = cz;
      let off = 0;
      const nodes = [];
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        off += (Math.random() - 0.5) * 70;
        off *= 0.92;
        const taper = Math.pow(Math.sin(Math.min(1, u * 1.02) * Math.PI * 0.5 + 0.0001), 0.3);
        const x = cx + sx * off * (1 - u * 0.6) * taper + (Math.random() - 0.5) * 14;
        const z = cz + sz * off * (1 - u * 0.6) * taper + (Math.random() - 0.5) * 14;
        const y = i === steps ? 8 : top * (1 - u);
        seg(px, py, pz, x, y, z);
        if (i > 3 && i < steps - 3) nodes.push([x, y, z]);
        px = x; py = y; pz = z;
      }
      // Forks.
      const forks = Math.min(nodes.length, 3 + Math.floor(Math.random() * 3));
      for (let f = 0; f < forks; f++) {
        const nd = nodes[Math.floor(Math.random() * nodes.length)];
        let x = nd[0];
        let y = nd[1];
        let z = nd[2];
        const dir = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7);
        const len = 6 + Math.floor(Math.random() * 7);
        for (let i = 0; i < len; i++) {
          const nx = x + sx * dir * 24 + (Math.random() - 0.5) * 30;
          const nz = z + sz * dir * 24 + (Math.random() - 0.5) * 30;
          const ny = y - 20 - Math.random() * 26;
          if (ny < 30) break;
          seg(x, y, z, nx, ny, nz);
          x = nx; y = ny; z = nz;
        }
      }
      this.boltGeo.attributes.position.needsUpdate = true;
      this.boltGeo.setDrawRange(0, n * 2);
      this._boltT = this.t;
      this._boltLife = 0.55;
      this.boltMat.opacity = 1;
      this.bolt.visible = true;
    }

    // ------------------------------------------------------------- audio
    _audio(dt) {
      this._snd -= dt;
      if (this._snd > 0) return;
      this._snd = 0.12;
      const a = this.game.audio;
      if (!a || !a.ready) return;
      if (!this._loops) {
        if (this.rainNow < 0.02 && this.cur.wind < 0.5) return;
        const mk = (buf, type, f, q) => a._loop(buf, type, f, q);
        this._loops = {
          hiss: mk(a.white, 'highpass', 3800, 0.3),
          patter: mk(a.white, 'bandpass', 1500, 0.55),
          roof: mk(a.brown, 'lowpass', 420, 0.6),
          gale: mk(a.white, 'bandpass', 420, 0.8),
        };
      }
      const L = this._loops;
      const t = a.ctx.currentTime;
      const r = this.rainNow;
      const inCar = this.game.player && this.game.player.inVehicle;
      const k = inCar ? 0.35 : 1;
      const gust = 0.75 + 0.25 * Math.sin(this.t * 0.8) * Math.sin(this.t * 0.27 + 0.4);
      L.hiss.gain.gain.setTargetAtTime(0.05 * r * r * k * gust, t, 0.3);
      L.patter.gain.gain.setTargetAtTime(0.1 * r * k * (0.8 + 0.2 * gust), t, 0.3);
      L.patter.filter.frequency.setTargetAtTime(inCar ? 900 : 1500 + r * 600, t, 0.3);
      L.roof.gain.gain.setTargetAtTime((inCar ? 0.38 : 0.14) * r, t, 0.3);
      const storm = this.cur.wind;
      L.gale.gain.gain.setTargetAtTime(Math.max(0, storm - 0.35) * 0.1 * gust * (inCar ? 0.5 : 1), t, 0.5);
      L.gale.filter.frequency.setTargetAtTime(300 + storm * 380 * gust, t, 0.4);
    }

    /** Thunder from `dist` metres away: a crack if it is close, then a long rolling rumble. */
    _thunder(dist, amp) {
      const a = this.game.audio;
      if (!a || !a.ready) return;
      const ctx = a.ctx;
      const t0 = ctx.currentTime;
      const k = clamp(1.25 - dist / 1800, 0.18, 1) * amp;
      const pan = Math.random() * 1.2 - 0.6;
      const bus = a.sfx;
      if (dist < 750) {
        a._hit({ t: t0, type: 'highpass', freq: 1500, q: 0.5, peak: 0.55 * k, attack: 0.002, decay: 0.28, pan, bus });
        a._hit({ t: t0, freq: 700, freqEnd: 150, q: 0.7, peak: 0.5 * k, attack: 0.004, decay: 0.45, pan, bus });
      }
      // The rumble: several overlapping lowpassed noise swells that sink in pitch.
      const swells = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < swells; i++) {
        const when = t0 + 0.05 + i * (0.35 + Math.random() * 0.5);
        a._hit({
          t: when, brown: true, type: 'lowpass', freq: 380 + Math.random() * 420, freqEnd: 60 + Math.random() * 40, q: 0.9,
          peak: (0.9 - i * 0.08) * k * (0.5 + Math.random() * 0.6), attack: 0.12 + Math.random() * 0.25, decay: 1.0 + Math.random() * 1.1, pan: pan + (Math.random() - 0.5) * 0.4, bus,
        });
      }
      a._tone({ t: t0 + 0.1, freq: 58, freqEnd: 30, wave: 'sine', peak: 0.38 * k, attack: 0.25, decay: 3.2, bus, pan });
    }

    // ------------------------------------------------------- the contract
    stop() {
      if (this._loops && this.game.audio && this.game.audio.ctx) {
        const t = this.game.audio.ctx.currentTime;
        for (const k in this._loops) this._loops[k].gain.gain.setTargetAtTime(0, t, 0.2);
      }
      this._thunders.length = 0;
    }

    reset() {
      this.stop();
      this.mode = 'auto';
      this.flash = 0;
      this.env.wx.flash = 0;
      this.goto('clear', 0);
      this.wet = 0;
      this.rainNow = 0;
      this._nextBolt = 25;
      this.bolt.visible = false;
      for (const p of this._pulses) p.t = 1e9;
      this._applySetting(true);
      this._pushEnv();
    }

    serialize() {
      return { state: this.state, wet: +this.wet.toFixed(2), hold: Math.round(this.hold) };
    }

    load(d) {
      if (!d || !STATES[d.state]) return;
      if (this.mode !== 'auto') return;
      this.goto(d.state, 0);
      this.wet = clamp(+d.wet || 0, 0, 1);
      this.rainNow = STATES[d.state].rain;
      this.hold = clamp(+d.hold || 60, 20, 900);
      this._pushEnv();
    }

    stats() {
      return [];
    }
  }

  VH.Weather = Weather;
})();
