/*
 * input.js — keyboard, mouse, pointer lock and gamepad, mapped to actions.
 *
 * Game code never asks about keys, only about actions ("jump", "sprint"),
 * so rebinding in the settings menu changes behaviour everywhere at once.
 *
 *   input.down('sprint')      true while any bound key/button is held
 *   input.consume('jump')     true once per press (presses are queued until
 *                             consumed, so a fixed-rate simulation never
 *                             misses a tap that happened between its steps)
 *   input.moveVector()        { x, y } in [-1, 1], keyboard and left stick combined
 *   input.takeMouseDelta()    pixels moved since the last call
 *   input.takeWheel()         wheel notches since the last call
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp } = VH.math;

  // Keys whose browser default would scroll, change focus or open something.
  const PREVENT_DEFAULT = new Set([
    'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F8', 'Backquote',
    'ControlLeft', 'AltLeft', 'AltRight', 'PageUp', 'PageDown', 'Home', 'End',
  ]);

  // Standard-mapping gamepad buttons → actions (Xbox names / PlayStation names).
  const PAD_BUTTONS = {
    0: 'jump', //        A / Cross
    1: 'crouch', //      B / Circle
    2: 'reload', //      X / Square
    3: ['interact', 'vehicle'], // Y / Triangle: talk, use, get in or out
    4: 'weaponWheel', // LB / L1
    5: 'camera', //      RB / R1
    6: 'aim', //         LT / L2
    7: 'fire', //        RT / R2
    8: 'map', //         View / Share
    9: 'pause', //       Menu / Options
    10: 'sprint', //     Left stick press
    11: 'lookBehind', // Right stick press
    12: 'phone', //      D-pad up (taxi duty)
    13: 'horn', //       D-pad down
    14: 'lights', //     D-pad left
    15: 'daytime', //    D-pad right
  };

  const STICK_DEADZONE = 0.18;

  function applyDeadzone(v) {
    const a = Math.abs(v);
    if (a < STICK_DEADZONE) return 0;
    return Math.sign(v) * ((a - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  }

  class Input {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.settings = settings;
      this.enabled = false; // game input only flows while playing
      this.codesDown = new Set();
      this.pressQueue = new Map(); // action → pending press count
      this.codeToActions = new Map();
      this.mouseDX = 0;
      this.mouseDY = 0;
      this.wheel = 0;
      this.locked = false;
      this.lastDevice = 'keyboard';
      this.pad = { connected: false, id: '', move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, down: new Set() };
      this._padPrev = new Set();
      this._capture = null; // rebinding callback
      this._rebuildBindings();

      VH.events.on('settings:changed', (e) => {
        if (e.path === 'controls.bindings' || e.path === '*') this._rebuildBindings();
      });

      window.addEventListener('keydown', (e) => this._onKeyDown(e));
      window.addEventListener('keyup', (e) => this._onKeyUp(e));
      window.addEventListener('blur', () => this.releaseAll());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.releaseAll();
      });

      document.addEventListener('mousedown', (e) => this._onMouseDown(e));
      document.addEventListener('mouseup', (e) => this._onMouseUp(e));
      document.addEventListener('mousemove', (e) => this._onMouseMove(e));
      document.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
      document.addEventListener('contextmenu', (e) => {
        if (this.enabled || this.locked) e.preventDefault();
      });

      document.addEventListener('pointerlockchange', () => {
        const wasLocked = this.locked;
        this.locked = document.pointerLockElement === this.canvas;
        if (!this.locked) this.releaseAll();
        // Chromium can report one large, bogus movement right after locking; ignore the first moments.
        this.mouseDX = this.mouseDY = 0;
        this._ignoreMouseUntil = performance.now() + 120;
        if (wasLocked !== this.locked) VH.events.emit('input:lockchange', { locked: this.locked });
      });
      document.addEventListener('pointerlockerror', () => {
        VH.events.emit('input:lockerror', {});
      });

      window.addEventListener('gamepadconnected', (e) => {
        VH.events.emit('notify', { title: 'Controller connected', text: e.gamepad.id.replace(/\(.*\)/, '').trim() || 'Gamepad', icon: '🎮' });
      });
      window.addEventListener('gamepaddisconnected', () => {
        this.pad.connected = false;
        VH.events.emit('notify', { title: 'Controller disconnected', text: 'Keyboard and mouse still work.', icon: '🎮' });
      });
    }

    _rebuildBindings() {
      this.bindings = this.settings.get('controls.bindings');
      this.codeToActions.clear();
      for (const action of Object.keys(this.bindings)) {
        for (const code of this.bindings[action]) {
          if (!code) continue;
          let list = this.codeToActions.get(code);
          if (!list) this.codeToActions.set(code, (list = []));
          list.push(action);
        }
      }
    }

    /** Label for the first key bound to an action, e.g. "E". */
    labelFor(action) {
      if (this.lastDevice === 'gamepad') {
        const pad = { jump: 'A', crouch: 'B', reload: 'X', interact: 'Y', aim: 'LT', fire: 'RT', sprint: 'L3', camera: 'RB', pause: 'Menu', daytime: 'D-pad →' };
        if (pad[action]) return pad[action];
      }
      const b = this.bindings[action];
      if (!b) return '—';
      return VH.util.keyLabel(b[0] || b[1]);
    }

    // ------------------------------------------------------------ keyboard
    _onKeyDown(e) {
      if (this._capture) {
        e.preventDefault();
        e.stopPropagation();
        const cb = this._capture;
        this._capture = null;
        cb(e.code === 'Escape' ? null : e.code, e.code === 'Escape');
        return;
      }
      // Typing into a text field (e.g. the debug console) never drives the game.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      this.lastDevice = 'keyboard';
      const actions = this.codeToActions.get(e.code);
      const inGame = this.enabled || this.locked;
      if (inGame && (PREVENT_DEFAULT.has(e.code) || actions)) {
        // Never swallow browser shortcuts the player may genuinely want.
        if (!(e.ctrlKey && (e.code === 'KeyR' || e.code === 'KeyF' || e.code === 'KeyP' || e.code === 'KeyW'))) {
          if (e.code !== 'F5' && e.code !== 'F11' && e.code !== 'F12') e.preventDefault();
        }
      }
      if (e.repeat) return;
      this.codesDown.add(e.code);
      if (actions) {
        for (const a of actions) {
          // Pause and debug work in menus too; everything else only in play.
          if (this.enabled || a === 'pause' || a === 'debug') this._queuePress(a);
        }
      }
      VH.events.emit('input:key', { code: e.code, down: true });
    }

    _onKeyUp(e) {
      this.codesDown.delete(e.code);
      VH.events.emit('input:key', { code: e.code, down: false });
    }

    // --------------------------------------------------------------- mouse
    _onMouseDown(e) {
      const code = 'Mouse' + e.button;
      if (this._capture) {
        e.preventDefault();
        const cb = this._capture;
        this._capture = null;
        cb(code, false);
        return;
      }
      this.lastDevice = 'keyboard';
      if (!this.locked && e.target !== this.canvas) return; // clicks on menus
      this.codesDown.add(code);
      const actions = this.codeToActions.get(code);
      if (actions && this.enabled) for (const a of actions) this._queuePress(a);
    }

    _onMouseUp(e) {
      this.codesDown.delete('Mouse' + e.button);
    }

    _onMouseMove(e) {
      // The weapon wheel (combat.js) asks for movement even without pointer lock, so it can be steered right after loading.
      if (!this.locked && !this.wantDeltas) return;
      if (this._ignoreMouseUntil && performance.now() < this._ignoreMouseUntil) return;
      // Some drivers report a huge spurious jump right after locking; clamp it.
      const dx = clamp(e.movementX || 0, -300, 300);
      const dy = clamp(e.movementY || 0, -300, 300);
      this.mouseDX += dx;
      this.mouseDY += dy;
      if (dx || dy) this.lastDevice = 'keyboard';
    }

    _onWheel(e) {
      if (!this.enabled && !this.locked) return;
      e.preventDefault();
      // Normalise pixel, line and page deltas to "notches".
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 33;
      else if (e.deltaMode === 2) d *= 400;
      this.wheel += clamp(d / 100, -3, 3);
    }

    // -------------------------------------------------------- pointer lock
    requestLock() {
      if (!VH.features.pointerLock || this.locked) return Promise.resolve(this.locked);
      if (this._lockPending) return this._lockPending;
      const canvas = this.canvas;
      const attempt = (opts) => {
        try {
          const result = opts ? canvas.requestPointerLock(opts) : canvas.requestPointerLock();
          return result && typeof result.then === 'function' ? result : Promise.resolve();
        } catch (err) {
          return Promise.reject(err);
        }
      };
      // Raw (unaccelerated) mouse input where supported, which feels better for aiming.
      this._lockPending = attempt({ unadjustedMovement: true })
        .catch((err) => {
          if (err && err.name === 'NotSupportedError') return attempt(null);
          throw err;
        })
        .then(() => true)
        .catch((err) => {
          // Usually "exited the lock too recently" — the player just clicks again.
          console.info('[input] pointer lock not granted:', err && err.message ? err.message : err);
          VH.events.emit('input:lockerror', { error: err });
          return false;
        })
        .finally(() => {
          this._lockPending = null;
        });
      return this._lockPending;
    }

    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    }

    // -------------------------------------------------------------- gamepad
    pollGamepad() {
      if (!VH.features.gamepad) return;
      let pads;
      try {
        pads = navigator.getGamepads();
      } catch (err) {
        return;
      }
      let gp = null;
      for (const p of pads) {
        if (p && p.connected) {
          gp = p;
          break;
        }
      }
      const pad = this.pad;
      if (!gp) {
        pad.connected = false;
        pad.move.x = pad.move.y = pad.look.x = pad.look.y = 0;
        pad.lt = pad.rt = 0;
        pad.down.clear();
        return;
      }
      pad.connected = true;
      pad.id = gp.id;
      pad.move.x = applyDeadzone(gp.axes[0] || 0);
      pad.move.y = -applyDeadzone(gp.axes[1] || 0);
      pad.look.x = applyDeadzone(gp.axes[2] || 0);
      pad.look.y = applyDeadzone(gp.axes[3] || 0);
      // Analogue triggers (throttle and brake when driving).
      const trig = (i) => {
        const btn = gp.buttons[i];
        if (!btn) return 0;
        return typeof btn === 'object' ? btn.value || (btn.pressed ? 1 : 0) : btn;
      };
      pad.lt = trig(6);
      pad.rt = trig(7);

      const now = new Set();
      gp.buttons.forEach((b, i) => {
        const pressed = typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5;
        if (pressed && PAD_BUTTONS[i]) for (const act of [].concat(PAD_BUTTONS[i])) now.add(act);
      });
      for (const action of now) {
        if (!this._padPrev.has(action) && (this.enabled || action === 'pause')) this._queuePress(action);
      }
      if (now.size || pad.move.x || pad.move.y || pad.look.x || pad.look.y) this.lastDevice = 'gamepad';
      pad.down = now;
      this._padPrev = now;
    }

    // ---------------------------------------------------------- action API
    _queuePress(action) {
      this.pressQueue.set(action, Math.min(4, (this.pressQueue.get(action) || 0) + 1));
    }

    down(action) {
      if (!this.enabled) return false;
      if (this.pad.down.has(action)) return true;
      const codes = this.bindings[action];
      if (!codes) return false;
      return (codes[0] && this.codesDown.has(codes[0])) || (codes[1] && this.codesDown.has(codes[1])) || false;
    }

    /** True once for every press of the action since it was last consumed. */
    consume(action) {
      const n = this.pressQueue.get(action) || 0;
      if (n <= 0) return false;
      if (n === 1) this.pressQueue.delete(action);
      else this.pressQueue.set(action, n - 1);
      return true;
    }

    /** Drop any queued presses of an action without acting on them. */
    discard(action) {
      this.pressQueue.delete(action);
    }

    moveVector() {
      if (!this.enabled) return { x: 0, y: 0 };
      let x = 0;
      let y = 0;
      if (this.down('moveForward')) y += 1;
      if (this.down('moveBack')) y -= 1;
      if (this.down('moveRight')) x += 1;
      if (this.down('moveLeft')) x -= 1;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      if (this.pad.connected && (this.pad.move.x || this.pad.move.y)) {
        x = this.pad.move.x;
        y = this.pad.move.y;
        const l = Math.hypot(x, y);
        if (l > 1) {
          x /= l;
          y /= l;
        }
      }
      return { x, y };
    }

    lookVector() {
      if (!this.enabled || !this.pad.connected) return { x: 0, y: 0 };
      return { x: this.pad.look.x, y: this.pad.look.y };
    }

    takeMouseDelta() {
      const d = { x: this.mouseDX, y: this.mouseDY };
      this.mouseDX = 0;
      this.mouseDY = 0;
      if (!this.enabled) d.x = d.y = 0;
      return d;
    }

    takeWheel() {
      const w = this.wheel;
      this.wheel = 0;
      return this.enabled ? w : 0;
    }

    releaseAll() {
      this.codesDown.clear();
      this.mouseDX = this.mouseDY = 0;
    }

    clearPresses() {
      this.pressQueue.clear();
    }

    /** Wait for the next key or mouse button (used by the rebinding screen). */
    captureNext(callback) {
      this._capture = callback;
    }

    cancelCapture() {
      this._capture = null;
    }
  }

  VH.Input = Input;
})();
