/*
 * photo.js — photo mode (F2).
 *
 * Freezes the world, hides the HUD and hands you a free camera:
 *
 *   mouse        look                 wheel      field of view
 *   W A S D      fly                  Space/Ctrl up / down      Shift  fast
 *   [ ]          time of day (Shift = bigger steps)
 *   - =          depth of field: less / more      F  auto-focus on/off
 *   , .          focus nearer / further (manual focus)
 *   C            next look (cinematic, vivid, noir, warm, cool, faded)
 *   H            hide / show this help
 *   Enter        save the picture (PNG)           Esc / F2   back to the game
 *
 * The picture is saved at the size the game is rendering at, so on the Max
 * preset (supersampled) it is a large, very clean image.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp } = VH.math;

  const LOOKS = [
    { name: 'Cinematic', sat: null, con: null, shadow: null, high: null },
    { name: 'Vivid', sat: 1.35, con: 1.1, shadow: [-0.004, 0.0, 0.01], high: [0.03, 0.014, -0.02] },
    { name: 'Noir', sat: 0.0, con: 1.25, shadow: [0, 0, 0], high: [0, 0, 0] },
    { name: 'Warm', sat: 1.1, con: 1.05, shadow: [0.01, 0.003, -0.01], high: [0.05, 0.025, -0.03] },
    { name: 'Cool', sat: 1.0, con: 1.05, shadow: [-0.01, 0.004, 0.025], high: [-0.01, 0.012, 0.04] },
    { name: 'Faded', sat: 0.7, con: 0.9, shadow: [0.025, 0.02, 0.03], high: [0.02, 0.02, 0.01] },
  ];

  class PhotoMode {
    constructor(game) {
      this.game = game;
      this.active = false;
      this.yaw = 0;
      this.pitch = 0;
      this.pos = new THREE.Vector3();
      this.fov = 60;
      this.autoFocus = true;
      this.focus = 20;
      this.dof = 0.0;
      this.look = 0;
      this._dir = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._last = 0;
      this._focusT = 0;
      this._onKey = (e) => this._key(e);
      this._onLock = () => {
        if (this.active && !document.pointerLockElement) this.exit();
      };
      window.addEventListener('keydown', (e) => {
        if (e.code === 'F2' && !e.repeat) {
          e.preventDefault();
          if (this.active) this.exit();
          else this.enter();
        }
      });
    }

    update() {}

    reset() {
      if (this.active) this.exit();
    }

    stop() {
      if (this.active) this.exit();
    }

    enter() {
      const g = this.game;
      if (this.active || g.state !== 'playing' || g.frozen || document.body.classList.contains('cutscene')) return;
      this.active = true;
      this._prevState = g.state;
      this._prevFov = g.renderer.camera.fov;
      const cam = g.renderer.camera;
      this.pos.copy(cam.position);
      const d = cam.getWorldDirection(this._dir);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = Math.asin(clamp(d.y, -1, 1));
      this.fov = cam.fov;
      g.state = 'photo';
      g.frozen = true; // stops the game's own frame loop; we render below
      g.input.releaseAll();
      g.input.takeMouseDelta();
      g.input.takeWheel();
      g.input.requestLock();
      g.hud.root.style.display = 'none';
      this._buildHelp();
      window.addEventListener('keydown', this._onKey, true);
      document.addEventListener('pointerlockchange', this._onLock);
      this._last = performance.now();
      this._loop = (now) => this._frame(now);
      requestAnimationFrame(this._loop);
    }

    exit() {
      const g = this.game;
      if (!this.active) return;
      this.active = false;
      window.removeEventListener('keydown', this._onKey, true);
      document.removeEventListener('pointerlockchange', this._onLock);
      const post = g.renderer.post;
      if (post) {
        post.dofAmount = 0;
        this._applyLook(LOOKS[0]);
        post.cut();
      }
      const cam = g.renderer.camera;
      cam.fov = this._prevFov;
      cam.updateProjectionMatrix();
      g.hud.root.style.display = '';
      if (this.help) this.help.remove();
      this.help = null;
      g.state = this._prevState;
      g.frozen = false;
      g.input.releaseAll();
      g.input.takeMouseDelta();
      g._last = performance.now();
      if (!g.input.locked) g.hud.showToast && g.hud.showToast('Click the game to capture the mouse');
    }

    _buildHelp() {
      const el = VH.util.el;
      this.help = el('div', 'photo-help');
      Object.assign(this.help.style, {
        position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)', zIndex: 60,
        background: 'rgba(9,13,26,0.74)', color: '#f1f4ff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '10px',
        padding: '8px 14px', font: '600 12px/1.5 system-ui, sans-serif', letterSpacing: '0.02em', textAlign: 'center', pointerEvents: 'none',
        maxWidth: '92vw',
      });
      this.helpLine = el('div', '');
      this.helpKeys = el('div', '');
      this.helpKeys.style.opacity = '0.7';
      this.helpKeys.textContent = 'Mouse look · WASD fly · Space/Ctrl up/down · Shift fast · [ ] time · - = blur · F auto-focus · , . focus · C look · H help · Enter save · Esc exit';
      this.help.append(this.helpLine, this.helpKeys);
      document.body.append(this.help);
    }

    _applyLook(look) {
      const post = this.game.renderer.post;
      if (!post) return;
      const u = post.compMat.uniforms;
      const base = this._baseGrade || (this._baseGrade = {
        sat: u.uSaturation.value, con: u.uContrast.value, shadow: u.uShadowTint.value.clone(), high: u.uHighlightTint.value.clone(),
      });
      u.uSaturation.value = look.sat === null ? base.sat : look.sat;
      u.uContrast.value = look.con === null ? base.con : look.con;
      if (look.shadow) u.uShadowTint.value.set(...look.shadow);
      else u.uShadowTint.value.copy(base.shadow);
      if (look.high) u.uHighlightTint.value.set(...look.high);
      else u.uHighlightTint.value.copy(base.high);
    }

    _key(e) {
      const g = this.game;
      const post = g.renderer.post;
      let used = true;
      switch (e.code) {
        case 'Escape':
          this.exit();
          break;
        case 'Enter':
          if (!e.repeat) this._capture();
          break;
        case 'KeyH':
          if (this.help) this.help.style.display = this.help.style.display === 'none' ? '' : 'none';
          break;
        case 'KeyC':
          this.look = (this.look + 1) % LOOKS.length;
          this._applyLook(LOOKS[this.look]);
          break;
        case 'KeyF':
          this.autoFocus = !this.autoFocus;
          break;
        case 'Comma':
          this.autoFocus = false;
          this.focus = clamp(this.focus / (e.shiftKey ? 1.5 : 1.12), 0.5, 3000);
          break;
        case 'Period':
          this.autoFocus = false;
          this.focus = clamp(this.focus * (e.shiftKey ? 1.5 : 1.12), 0.5, 3000);
          break;
        case 'Minus':
          this.dof = clamp(this.dof - 0.25, 0, 4);
          break;
        case 'Equal':
          this.dof = clamp(this.dof + 0.25, 0, 4);
          break;
        case 'BracketLeft':
        case 'BracketRight': {
          const step = (e.shiftKey ? 1 : 0.25) * (e.code === 'BracketLeft' ? -1 : 1);
          g.environment.setTime(g.environment.hours + step);
          break;
        }
        default:
          used = false;
      }
      if (used) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (post && !post.enabled && (e.code === 'Minus' || e.code === 'Equal')) this._note = 'Depth of field needs post-processing (Settings → Graphics).';
    }

    _capture() {
      const g = this.game;
      const r = g.renderer;
      const post = r.post;
      this._render(0.016);
      if (post) post.pulse(0.35);
      r.canvas.toBlob((blob) => {
        if (!blob) return;
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vicehaven-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this._note = 'Saved ' + a.download;
        this._noteT = 3;
      }, 'image/png');
    }

    _render(dt) {
      const g = this.game;
      const cam = g.renderer.camera;
      const post = g.renderer.post;
      cam.position.copy(this.pos);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      g.world.update(1, cam.position);
      g.environment.update(0, g.player.renderPos);
      if (post) {
        post.dofAmount = this.dof;
        post.dofFocus = this.focus;
        post.flash = Math.max(0, post.flash - dt * 2.5);
      }
      g.renderer.render(g.scene, dt);
    }

    _frame(now) {
      if (!this.active) return;
      requestAnimationFrame(this._loop);
      const g = this.game;
      const inp = g.input;
      const dt = Math.min(0.1, Math.max(0.001, (now - this._last) / 1000));
      this._last = now;
      const md = inp.takeMouseDelta();
      const sens = 0.0022 * (this.fov / 60);
      this.yaw -= md.x * sens;
      this.pitch = clamp(this.pitch - md.y * sens, -1.5, 1.5);
      const wheel = inp.takeWheel();
      if (wheel) this.fov = clamp(this.fov + wheel * 3, 12, 100);
      const dir = this._dir.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const speed = (inp.down('sprint') ? 40 : 9) * (this.fov / 60);
      let f = 0;
      let s = 0;
      let u = 0;
      if (inp.down('moveForward')) f += 1;
      if (inp.down('moveBack')) f -= 1;
      if (inp.down('moveRight')) s += 1;
      if (inp.down('moveLeft')) s -= 1;
      if (inp.down('jump')) u += 1;
      if (inp.down('crouch')) u -= 1;
      this.pos.addScaledVector(dir, f * speed * dt).addScaledVector(right, s * speed * dt);
      this.pos.y = Math.max(0.3, this.pos.y + u * speed * dt);
      // Auto-focus: measure what is under the centre of the frame.
      this._focusT -= dt;
      if (this.autoFocus && this._focusT <= 0) {
        this._focusT = 0.15;
        const hit = g.combat.trace(this.pos.x, this.pos.y, this.pos.z, dir.x, dir.y, dir.z, 600, null, null);
        const target = hit && hit.type !== 'none' ? hit.t : 600;
        this.focus += (target - this.focus) * 0.6;
      }
      this._render(dt);
      if (this._noteT > 0) this._noteT -= dt;
      const post = g.renderer.post;
      const dofText = this.dof > 0 ? `blur ${this.dof.toFixed(2)} · focus ${this.focus.toFixed(1)} m${this.autoFocus ? ' (auto)' : ''}` : 'blur off';
      const note = this._noteT > 0 && this._note ? ' · ' + this._note : '';
      this.helpLine.textContent = `PHOTO MODE · ${g.environment.clockText()} · FOV ${Math.round(this.fov)}° · ${dofText} · look: ${LOOKS[this.look].name}${post && post.enabled ? '' : ' · (post-processing off)'}${note}`;
    }
  }

  VH.PhotoMode = PhotoMode;
})();
