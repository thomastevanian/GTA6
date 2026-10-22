/*
 * core.js — the shared foundation every other file builds on.
 *
 *   VH            the single global namespace (every file adds itself to it)
 *   VH.events     a tiny publish/subscribe event bus for loose coupling
 *   VH.math       scalar helpers: clamp, lerp, frame-rate independent damping, angles
 *   VH.RNG        a seeded random generator, so the city is the same every visit
 *   VH.noise      seeded 2D value noise + fBm for procedural textures and variation
 *   VH.util       async time slicing (so generation never freezes the tab), formatting
 *   VH.features   what this browser supports, detected once at start-up
 *
 * World conventions used everywhere: metres, seconds, radians. +Y is up,
 * +X is east and -Z is north. A yaw angle `a` faces the direction
 * (sin a, 0, cos a), so yaw 0 faces south (+Z) and yaw PI faces north.
 *
 * Note for contributors: no file may touch `THREE` at load time (top level).
 * main.js can fall back to fetching three.js from a CDN after the other
 * scripts have run, so `THREE` is only guaranteed to exist once boot starts.
 */
(function () {
  'use strict';

  const VH = (window.VH = window.VH || {});
  VH.VERSION = '1.1.0';
  VH.BUILD_NAME = 'Ten and Two';
  VH.UPDATE_NAME = 'Open world update';

  // ---------------------------------------------------------------- events
  class EventBus {
    constructor() {
      this._handlers = new Map();
    }

    /** Subscribe. Returns a function that unsubscribes. */
    on(type, fn) {
      let list = this._handlers.get(type);
      if (!list) this._handlers.set(type, (list = []));
      list.push(fn);
      return () => this.off(type, fn);
    }

    once(type, fn) {
      const off = this.on(type, (payload) => {
        off();
        fn(payload);
      });
      return off;
    }

    off(type, fn) {
      const list = this._handlers.get(type);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }

    emit(type, payload) {
      const list = this._handlers.get(type);
      if (!list || list.length === 0) return;
      // Copy so handlers may unsubscribe while being called.
      for (const fn of list.slice()) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[VH.events] handler for "' + type + '" failed:', err);
        }
      }
    }
  }
  VH.EventBus = EventBus;
  VH.events = new EventBus();

  // ------------------------------------------------------------------ math
  const TAU = Math.PI * 2;

  VH.math = {
    TAU,
    DEG: Math.PI / 180,

    clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    },
    saturate(v) {
      return v < 0 ? 0 : v > 1 ? 1 : v;
    },
    lerp(a, b, t) {
      return a + (b - a) * t;
    },
    invLerp(a, b, v) {
      return a === b ? 0 : (v - a) / (b - a);
    },
    smoothstep(e0, e1, x) {
      const t = VH.math.saturate((x - e0) / (e1 - e0));
      return t * t * (3 - 2 * t);
    },
    /**
     * Frame-rate independent exponential smoothing: moves `a` toward `b`
     * so that the remaining gap shrinks by e^(-lambda) per second.
     */
    damp(a, b, lambda, dt) {
      return b + (a - b) * Math.exp(-lambda * dt);
    },
    /** Wrap an angle to (-PI, PI]. */
    wrapAngle(a) {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    },
    /** Shortest signed difference b - a between two angles. */
    angleDelta(a, b) {
      return VH.math.wrapAngle(b - a);
    },
    dampAngle(a, b, lambda, dt) {
      return a + VH.math.angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
    },
    lerpAngle(a, b, t) {
      return a + VH.math.angleDelta(a, b) * t;
    },
    /** Move `v` toward `target` by at most `maxDelta`. */
    moveTowards(v, target, maxDelta) {
      const d = target - v;
      if (Math.abs(d) <= maxDelta) return target;
      return v + Math.sign(d) * maxDelta;
    },
    /** Cheap deterministic hash of two integers to [0, 1). */
    hash2(x, y) {
      let h = (x | 0) * 374761393 + (y | 0) * 668265263;
      h = (h ^ (h >>> 13)) * 1274126177;
      h = h ^ (h >>> 16);
      return (h >>> 0) / 4294967296;
    },
  };

  // ------------------------------------------------------------------- RNG
  /** Seeded pseudo-random generator (mulberry32). Deterministic per seed. */
  class RNG {
    constructor(seed) {
      this.seed = (typeof seed === 'string' ? RNG.hashString(seed) : seed) >>> 0;
      this.state = this.seed || 0x9e3779b9;
    }

    static hashString(str) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    next() {
      let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(lo, hi) {
      return lo + (hi - lo) * this.next();
    }

    int(lo, hi) {
      return lo + Math.floor(this.next() * (hi - lo + 1));
    }

    chance(p) {
      return this.next() < p;
    }

    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    }

    /** Pick from [{ weight, ...}, ...] or from parallel arrays. */
    weighted(items, weights) {
      let total = 0;
      for (let i = 0; i < items.length; i++) total += weights ? weights[i] : items[i].weight;
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights ? weights[i] : items[i].weight;
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    }

    /** A child generator whose sequence depends on this one's seed and a label. */
    fork(label) {
      return new RNG((this.seed ^ RNG.hashString(String(label))) >>> 0);
    }
  }
  VH.RNG = RNG;

  // ----------------------------------------------------------------- noise
  /** Seeded 2D value noise with smooth interpolation, plus fractal sums. */
  class ValueNoise {
    constructor(seed) {
      const rng = new RNG(seed);
      this.perm = new Uint8Array(512);
      this.values = new Float32Array(256);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        p[i] = i;
        this.values[i] = rng.next();
      }
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = p[i];
        p[i] = p[j];
        p[j] = t;
      }
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    /** Noise in [0, 1]. `period` (optional) makes it tile every `period` units. */
    noise2(x, y, period) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      let x0 = xi, y0 = yi, x1 = xi + 1, y1 = yi + 1;
      if (period) {
        x0 = ((x0 % period) + period) % period;
        y0 = ((y0 % period) + period) % period;
        x1 = ((x1 % period) + period) % period;
        y1 = ((y1 % period) + period) % period;
      }
      const P = this.perm;
      const V = this.values;
      const v00 = V[P[(P[x0 & 255] + y0) & 511]];
      const v10 = V[P[(P[x1 & 255] + y0) & 511]];
      const v01 = V[P[(P[x0 & 255] + y1) & 511]];
      const v11 = V[P[(P[x1 & 255] + y1) & 511]];
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      return (v00 + (v10 - v00) * u) + ((v01 + (v11 - v01) * u) - (v00 + (v10 - v00) * u)) * v;
    }

    /** Fractal Brownian motion in [0, 1]. Tiles if `period` is given. */
    fbm2(x, y, octaves, period) {
      let sum = 0;
      let amp = 0.5;
      let norm = 0;
      let freq = 1;
      for (let o = 0; o < octaves; o++) {
        sum += amp * this.noise2(x * freq, y * freq, period ? period * freq : 0);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      return sum / norm;
    }
  }
  VH.ValueNoise = ValueNoise;
  VH.noise = new ValueNoise(1337);

  // ------------------------------------------------------------------ util
  // A MessageChannel yield is not clamped the way setTimeout is, so a long
  // generation job can hand control back to the browser (to paint the
  // progress bar and stay responsive) many times per frame at little cost.
  const channel = new MessageChannel();
  const pending = [];
  channel.port1.onmessage = () => {
    const fn = pending.shift();
    if (fn) fn();
  };

  VH.util = {
    yieldToBrowser() {
      return new Promise((resolve) => {
        pending.push(resolve);
        channel.port2.postMessage(0);
      });
    },

    nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    },

    /**
     * Returns an object whose `tick()` resolves immediately while the time
     * budget for the current slice remains, and yields a frame once the
     * slice is used up. Use `await slicer.tick()` inside generation loops.
     */
    createTimeSlicer(budgetMs) {
      let sliceStart = performance.now();
      return {
        async tick() {
          if (performance.now() - sliceStart < budgetMs) return;
          // A real frame (not just a task) so the progress bar actually paints.
          await VH.util.nextFrameOrTimeout(50);
          sliceStart = performance.now();
        },
      };
    },

    /** requestAnimationFrame never fires in a hidden tab; fall back to a timer. */
    nextFrameOrTimeout(ms) {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        requestAnimationFrame(finish);
        setTimeout(finish, ms);
      });
    },

    formatMoney(amount) {
      const sign = amount < 0 ? '-' : '';
      return sign + '$' + Math.abs(Math.round(amount)).toLocaleString('en-US');
    },

    /** "KeyW" → "W", "ShiftLeft" → "Shift", "Mouse0" → "LMB" ... */
    keyLabel(code) {
      if (!code) return '—';
      const named = {
        Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl',
        ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'AltGr', Escape: 'Esc', Tab: 'Tab',
        Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock', Backquote: '`',
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '-', Equal: '=',
        BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
        Slash: '/', Backslash: '\\', Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4',
        Mouse4: 'Mouse 5', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓', Pause: 'Pause',
      };
      if (named[code]) return named[code];
      if (VH.util._layoutMap && VH.util._layoutMap.has(code)) {
        return VH.util._layoutMap.get(code).toUpperCase();
      }
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
      return code;
    },

    /** Fill in real key labels for non-QWERTY layouts where the browser allows it. */
    async loadKeyboardLayout() {
      try {
        if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
          VH.util._layoutMap = await navigator.keyboard.getLayoutMap();
        }
      } catch (err) {
        // Not available (e.g. inside some iframes). QWERTY labels are fine.
      }
    },

    el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    },
  };

  // -------------------------------------------------------------- features
  VH.features = (function detect() {
    const f = {
      webgl2: false,
      webgl2Error: '',
      pointerLock: 'requestPointerLock' in HTMLCanvasElement.prototype,
      gamepad: typeof navigator.getGamepads === 'function',
      webAudio: !!(window.AudioContext || window.webkitAudioContext),
      localStorage: false,
      keyboardLock: !!(navigator.keyboard && navigator.keyboard.lock),
      fullscreen: !!document.documentElement.requestFullscreen,
      memory: !!(performance && performance.memory),
      fileProtocol: location.protocol === 'file:',
      isEdge: /Edg\//.test(navigator.userAgent),
      deviceMemory: navigator.deviceMemory || 0,
      cores: navigator.hardwareConcurrency || 4,
    };
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      f.webgl2 = !!gl;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        f.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        f.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (err) {
      f.webgl2Error = String(err && err.message ? err.message : err);
    }
    try {
      const k = '__vh_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      f.localStorage = true;
    } catch (err) {
      f.localStorage = false;
    }
    return f;
  })();
})();
