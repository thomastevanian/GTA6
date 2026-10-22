/*
 * settings.js — every player-facing option, with defaults, quality presets,
 * key bindings and persistence to localStorage.
 *
 *   VH.settings.get('graphics.fov')         read a value by path
 *   VH.settings.set('graphics.fov', 70)     write, persist and broadcast
 *   VH.settings.applyPreset('medium')       set the graphics block from a preset
 *
 * Every change emits 'settings:changed' on VH.events with { path, value }, so
 * systems react to changes instead of polling.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const STORAGE_KEY = 'vicehaven.settings.v1';

  /** Quality presets. Each one fills the whole graphics block except fov/showFps. */
  const PRESETS = {
    low: {
      renderScale: 0.75, maxPixelRatio: 1, shadows: 'off', drawDistance: 520,
      antialias: false, propDensity: 0.6, effects: 'low',
      ambientOcclusion: 'off', lightShafts: 'off', motionBlur: 'off', lensEffects: 'off',
    },
    medium: {
      renderScale: 0.9, maxPixelRatio: 1, shadows: 'low', drawDistance: 720,
      antialias: false, propDensity: 0.85, effects: 'medium',
      ambientOcclusion: 'off', lightShafts: 'on', motionBlur: 'off', lensEffects: 'off',
    },
    high: {
      renderScale: 1.0, maxPixelRatio: 1.25, shadows: 'high', drawDistance: 950,
      antialias: true, propDensity: 1.0, effects: 'high',
      ambientOcclusion: 'low', lightShafts: 'on', motionBlur: 'light', lensEffects: 'on',
    },
    ultra: {
      renderScale: 1.0, maxPixelRatio: 2, shadows: 'ultra', drawDistance: 1400,
      antialias: true, propDensity: 1.0, effects: 'high',
      ambientOcclusion: 'high', lightShafts: 'on', motionBlur: 'full', lensEffects: 'on',
    },
    // Everything the engine has, for a desktop GPU with power to spare: the picture is
    // rendered at 1.5x and scaled down (supersampling), 8k shadows, full-resolution
    // ambient occlusion and sun shafts, the longest view distance and densest detail.
    max: {
      renderScale: 1.5, maxPixelRatio: 2, shadows: 'max', drawDistance: 2000,
      antialias: true, propDensity: 1.5, effects: 'high',
      ambientOcclusion: 'max', lightShafts: 'on', motionBlur: 'full', lensEffects: 'on',
    },
  };

  /** Shadow tiers: shadow map resolution and the half-width of the area it covers. */
  const SHADOW_TIERS = {
    off: { enabled: false, mapSize: 0, extent: 0 },
    low: { enabled: true, mapSize: 1024, extent: 55 },
    high: { enabled: true, mapSize: 2048, extent: 85 },
    ultra: { enabled: true, mapSize: 4096, extent: 120 },
    max: { enabled: true, mapSize: 8192, extent: 150 },
  };

  /**
   * Default key bindings. Each action has up to two codes (KeyboardEvent.code,
   * or Mouse0/1/2 for buttons). Actions for later phases are listed already so
   * the controls screen shows the whole scheme and bindings never need migrating.
   */
  const DEFAULT_BINDINGS = {
    moveForward: ['KeyW', 'ArrowUp'],
    moveBack: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space', null],
    crouch: ['ControlLeft', 'KeyC'],
    walk: ['CapsLock', null],
    interact: ['KeyE', null],
    vehicle: ['KeyF', null],
    reload: ['KeyR', null],
    fire: ['Mouse0', null],
    aim: ['Mouse2', null],
    weaponWheel: ['Tab', null],
    map: ['KeyM', null],
    daytime: ['KeyT', null],
    phone: ['KeyP', null],
    camera: ['KeyV', null],
    lookBehind: ['KeyB', null],
    horn: ['KeyH', null],
    lights: ['KeyG', null],
    weapon1: ['Digit1', null],
    weapon2: ['Digit2', null],
    weapon3: ['Digit3', null],
    weapon4: ['Digit4', null],
    weapon5: ['Digit5', null],
    weapon6: ['Digit6', null],
    weapon7: ['Digit7', null],
    weapon8: ['Digit8', null],
    pause: ['Escape', 'Pause'],
    debug: ['F8', null],
  };

  /** Human-readable names and grouping for the controls screen. */
  const ACTION_INFO = {
    moveForward: { label: 'Move forward', group: 'On foot' },
    moveBack: { label: 'Move back', group: 'On foot' },
    moveLeft: { label: 'Move left', group: 'On foot' },
    moveRight: { label: 'Move right', group: 'On foot' },
    sprint: { label: 'Sprint (hold) / nitro in a car', group: 'On foot' },
    jump: { label: 'Jump / climb / handbrake', group: 'On foot' },
    crouch: { label: 'Crouch (toggle)', group: 'On foot' },
    walk: { label: 'Walk (toggle)', group: 'On foot' },
    interact: { label: 'Interact / enter / exit', group: 'On foot' },
    camera: { label: 'Change camera', group: 'Camera' },
    lookBehind: { label: 'Look behind', group: 'Camera' },
    aim: { label: 'Aim', group: 'Combat' },
    fire: { label: 'Fire / attack', group: 'Combat' },
    reload: { label: 'Reload (next radio station in a car)', group: 'Combat' },
    weaponWheel: { label: 'Weapon wheel (hold)', group: 'Combat' },
    weapon1: { label: 'Weapon slot 1', group: 'Combat' },
    weapon2: { label: 'Weapon slot 2', group: 'Combat' },
    weapon3: { label: 'Weapon slot 3', group: 'Combat' },
    weapon4: { label: 'Weapon slot 4', group: 'Combat' },
    weapon5: { label: 'Weapon slot 5', group: 'Combat' },
    weapon6: { label: 'Weapon slot 6', group: 'Combat' },
    weapon7: { label: 'Weapon slot 7', group: 'Combat' },
    weapon8: { label: 'Weapon slot 8', group: 'Combat' },
    vehicle: { label: 'Get in / out of a car', group: 'Vehicles' },
    horn: { label: 'Horn', group: 'Vehicles' },
    lights: { label: 'Headlights / siren', group: 'Vehicles' },
    map: { label: 'City map', group: 'Interface' },
    daytime: { label: 'Daytime on / off', group: 'Interface' },
    phone: { label: 'Taxi duty on / off (in a cab)', group: 'Vehicles' },
    pause: { label: 'Pause', group: 'Interface', fixed: true },
    debug: { label: 'Developer overlay', group: 'Interface' },
  };

  function defaults() {
    return {
      version: 1,
      graphics: Object.assign({ quality: 'high', fov: 65, showFps: true, nightBrightness: 1, filmGrain: 'light' }, PRESETS.high),
      gameplay: {
        difficulty: 'normal',
        mouseSensitivity: 1.0,
        invertY: false,
        aimAssist: true,
        cameraShake: true,
        gamepadSensitivity: 1.0,
        confirmClose: true,
        showHints: true,
        slowMotion: true,
        timeOfDay: 'cycle',
        alwaysDay: false,
        voicedDialogue: true,
        policeVoice: true,
        blood: 'lots',
      },
      audio: { master: 0.8, music: 0.6, effects: 0.8, ambience: 0.7, dialogue: 0.9 },
      accessibility: {
        subtitles: true,
        subtitleSize: 1.0,
        textScale: 1.0,
        colorBlind: false,
        reducedFlashing: false,
        strongLanguage: true,
      },
      controls: { bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)) },
    };
  }

  /** Recursively copy known keys from `src` into `dst`, keeping dst's shape. */
  function mergeKnown(dst, src) {
    if (!src || typeof src !== 'object') return dst;
    for (const key of Object.keys(dst)) {
      if (!(key in src)) continue;
      const d = dst[key];
      const s = src[key];
      if (d && typeof d === 'object' && !Array.isArray(d)) mergeKnown(d, s);
      else if (Array.isArray(d) && Array.isArray(s)) dst[key] = s.slice(0, d.length);
      else if (typeof d === typeof s) dst[key] = s;
    }
    return dst;
  }

  class Settings {
    constructor() {
      this.data = defaults();
      this.persistent = VH.features.localStorage;
      this.load();
    }

    load() {
      if (!this.persistent) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          this._autodetectQuality();
          return;
        }
        const saved = JSON.parse(raw);
        const merged = mergeKnown(defaults(), saved);
        // Bindings may gain new actions in later phases; keep defaults for those.
        if (saved && saved.controls && saved.controls.bindings) {
          for (const action of Object.keys(DEFAULT_BINDINGS)) {
            const b = saved.controls.bindings[action];
            if (Array.isArray(b)) merged.controls.bindings[action] = [b[0] || null, b[1] || null];
          }
        }
        this.data = merged;
      } catch (err) {
        console.warn('[settings] could not read saved settings, using defaults', err);
        this.data = defaults();
      }
    }

    /** First visit: pick a sensible preset from what the device reports. */
    _autodetectQuality() {
      const f = VH.features;
      const gpu = String(f.gpu || '').toLowerCase();
      let preset = 'high';
      const integrated = /intel|uhd|iris|mali|adreno|swiftshader|llvmpipe|microsoft basic/.test(gpu);
      if (/swiftshader|llvmpipe|microsoft basic/.test(gpu)) preset = 'low';
      else if (integrated || (f.deviceMemory && f.deviceMemory <= 4) || f.cores <= 4) preset = 'medium';
      this.applyPreset(preset, true);
    }

    save() {
      if (!this.persistent) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (err) {
        console.warn('[settings] could not save settings', err);
      }
    }

    get(path) {
      let node = this.data;
      for (const part of path.split('.')) {
        if (node == null) return undefined;
        node = node[part];
      }
      return node;
    }

    set(path, value, silent) {
      const parts = path.split('.');
      let node = this.data;
      for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
      const key = parts[parts.length - 1];
      if (node[key] === value) return;
      node[key] = value;
      // Editing a preset-controlled graphics value turns the preset into "custom".
      if (parts[0] === 'graphics' && key in PRESETS.high && this.data.graphics.quality !== 'custom') {
        const preset = PRESETS[this.data.graphics.quality];
        if (preset && preset[key] !== value) {
          this.data.graphics.quality = 'custom';
          if (!silent) VH.events.emit('settings:changed', { path: 'graphics.quality', value: 'custom' });
        }
      }
      this.save();
      if (!silent) VH.events.emit('settings:changed', { path, value });
    }

    applyPreset(name, silent) {
      const preset = PRESETS[name];
      if (!preset) return;
      Object.assign(this.data.graphics, preset);
      this.data.graphics.quality = name;
      this.save();
      if (!silent) VH.events.emit('settings:changed', { path: 'graphics', value: name });
    }

    setBinding(action, slot, code) {
      const bindings = this.data.controls.bindings;
      if (!bindings[action]) return;
      // A key can only do one thing: remove it from wherever else it is bound.
      if (code) {
        for (const other of Object.keys(bindings)) {
          for (let s = 0; s < 2; s++) {
            if (bindings[other][s] === code && !(other === action && s === slot)) bindings[other][s] = null;
          }
        }
      }
      bindings[action][slot] = code;
      this.save();
      VH.events.emit('settings:changed', { path: 'controls.bindings', value: bindings });
    }

    resetBindings() {
      this.data.controls.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      this.save();
      VH.events.emit('settings:changed', { path: 'controls.bindings', value: this.data.controls.bindings });
    }

    resetAll() {
      this.data = defaults();
      this._autodetectQuality();
      this.save();
      VH.events.emit('settings:changed', { path: '*', value: null });
    }

    shadowTier() {
      return SHADOW_TIERS[this.data.graphics.shadows] || SHADOW_TIERS.off;
    }
  }

  VH.Settings = Settings;
  VH.SETTINGS_PRESETS = PRESETS;
  VH.SHADOW_TIERS = SHADOW_TIERS;
  VH.DEFAULT_BINDINGS = DEFAULT_BINDINGS;
  VH.ACTION_INFO = ACTION_INFO;
  VH.settings = new Settings();
})();
