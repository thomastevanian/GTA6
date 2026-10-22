/*
 * feedback.js — what cars look and sound like while they do things.
 *
 * Per frame, for the cars near the camera: skid marks and tyre smoke,
 * engine smoke and fire on damaged cars, nitro flames, headlight beams and
 * emergency-light pools on the road at night, and the positional mix of
 * engine, tyre, siren, horn and fire voices. On events: crash sparks,
 * glass and sounds, scrapes, explosions (with area damage), landings, door
 * sounds, near-miss rewards and camera shake.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, smoothstep } = VH.math;

  const ENGINE_VOICES = 5;
  const SIREN_VOICES = 4;

  class VehicleFeedback {
    constructor(game) {
      this.game = game;
      this.sys = game.vehicles;
      this.fx = game.fx;
      this.audio = game.audio;
      this._voiceTimer = 0;
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._p = new THREE.Vector3();
      this._s = new THREE.Vector3(1, 1, 1);
      this._y = new THREE.Vector3(0, 1, 0);
      this._w = { x: 0, z: 0 };
      this._camRight = new THREE.Vector3();
      this.voices = this.sys.voices;

      // A light for the nearest flashing light bar, and the player's headlights.
      this.sirenLight = new THREE.PointLight(0xff2020, 0, 28, 2);
      this.sirenLight.position.set(0, -100, 0);
      game.scene.add(this.sirenLight);
      this.headlight = new THREE.SpotLight(0xfff1dc, 0, 80, 0.7, 0.5, 1.4);
      this.headlight.position.set(0, -100, 0);
      game.scene.add(this.headlight);
      game.scene.add(this.headlight.target);
      this._bindEvents();
    }

    _bindEvents() {
      const fx = this.fx;
      VH.events.on('vehicle:impact', (e) => {
        const pan = this._pan(e.x, e.z);
        const gain = this._gain(e.x, e.z, 10);
        if (e.speed > 3.5) {
          fx.sparks(e.x, e.y, e.z, e.nx, e.nz, Math.min(40, Math.round(e.speed * 1.6)), 3 + e.speed * 0.3);
          if (this.audio.crash) this.audio.crash(clamp(e.speed / 22, 0.1, 1) * gain, pan);
        }
        if (e.speed > 13) fx.glass(e.x, e.y + 0.4, e.z, 18);
        if (e.slide > 4 && e.speed < 3.5) {
          fx.sparks(e.x, e.y - 0.2, e.z, e.nx, e.nz, 3, 2);
          if (this.audio.scrape && Math.random() < 0.3) this.audio.scrape(clamp(e.slide / 20, 0.1, 0.8) * gain, pan);
        }
        const pv = this.sys.playerVehicle;
        if (pv && (e.v === pv || e.other === pv) && e.speed > 3) {
          this.game.cameraRig.addShake(clamp(e.speed / 18, 0.1, 1));
          if (e.speed > 20) this.game.slowmo(0.55, 0.35);
        }
      });
      VH.events.on('vehicle:smash', (e) => {
        if (this.audio.crash) this.audio.crash(e.pole ? 0.45 : 0.2, this._pan(e.x, e.z));
      });
      VH.events.on('vehicle:explode', (e) => {
        const v = e.v || e;
        this.explosion(v.pos.x, v.pos.y + 0.6, v.pos.z, 1, v);
        this.fx.fireAt(v.pos.x, v.pos.y + 0.8, v.pos.z, 25, 0.9);
      });
      VH.events.on('vehicle:land', (e) => {
        if (e.impact > 5) {
          this.fx.dust(e.v.pos.x, e.v.pos.y, e.v.pos.z, Math.min(14, Math.round(e.impact)));
          if (this.audio.crash) this.audio.crash(clamp(e.impact / 30, 0.05, 0.6) * this._gain(e.v.pos.x, e.v.pos.z, 12), this._pan(e.v.pos.x, e.v.pos.z));
        }
        if (e.v === this.sys.playerVehicle && e.impact > 6) this.game.cameraRig.addShake(clamp(e.impact / 25, 0.1, 0.8));
      });
      VH.events.on('vehicle:door', (e) => {
        if (this.audio.carDoor) this.audio.carDoor(e.open, this._pan(e.v.pos.x, e.v.pos.z));
      });
      VH.events.on('vehicle:nearMiss', (e) => {
        if (this.audio.nearMiss) this.audio.nearMiss(this._pan(e.other.pos.x, e.other.pos.z));
        this.game.player.stats.nearMisses++;
        this.game.hud.popScore && this.game.hud.popScore('NEAR MISS', 25);
        this.game.giveMoney(25, null, true);
      });
    }

    /** A blast: effects, sound, and damage to everything nearby. */
    explosion(x, y, z, scale, source) {
      const s = scale || 1;
      this.fx.explosion(x, y, z, s);
      const d = Math.hypot(x - this.game.renderer.camera.position.x, z - this.game.renderer.camera.position.z);
      if (this.audio.explosion) this.audio.explosion(clamp(1.2 - d / 180, 0.15, 1) * s, this._pan(x, z));
      this.game.cameraRig.addShake(clamp(1.3 - d / 60, 0, 1));
      const radius = 8 * s;
      for (const v of this.sys.list) {
        if (v === source) continue;
        const dd = Math.hypot(v.pos.x - x, v.pos.z - z);
        if (dd > radius) continue;
        const k = 1 - dd / radius;
        v.wake();
        v.damage(420 * k * s, source && source.driver === 'player' ? 'player' : null, 'blast');
        const nx = (v.pos.x - x) / (dd || 1);
        const nz = (v.pos.z - z) / (dd || 1);
        v.vel.x += nx * 9 * k;
        v.vel.z += nz * 9 * k;
        v.vel.y += 5 * k;
        v.grounded = false;
        v.omega += (Math.random() - 0.5) * 3 * k;
      }
      VH.events.emit('explosion', { x, y, z, radius: radius * 1.2, power: s, source });
    }

    _pan(x, z) {
      const cam = this.game.renderer.camera;
      const r = this._camRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const dx = x - cam.position.x;
      const dz = z - cam.position.z;
      const d = Math.hypot(dx, dz) || 1;
      return clamp((dx * r.x + dz * r.z) / d, -1, 1) * 0.85;
    }

    _gain(x, z, ref, y) {
      const cam = this.game.renderer.camera.position;
      const d = Math.hypot(x - cam.x, z - cam.z, y !== undefined ? y - cam.y : 0);
      return 1 / (1 + Math.pow(d / (ref || 10), 1.5));
    }

    update(dt) {
      const sys = this.sys;
      const fx = this.fx;
      const cam = this.game.renderer.camera.position;
      const night = fx.night || 0;
      const pv = sys.playerVehicle;
      fx.beginCarPools();
      let nearestSiren = null;
      let nearestSirenD = 60;
      for (const v of sys.list) {
        const dx = v.renderPos.x - cam.x;
        const dz = v.renderPos.z - cam.z;
        const d = Math.hypot(dx, dz);
        if (d > 160) continue;
        const c = Math.cos(v.renderYaw);
        const s = Math.sin(v.renderYaw);
        // Skid marks and smoke.
        if (d < 95 && v.grounded && !v.sleeping) {
          const wheels = v._wheelPos;
          for (let i = 0; i < 4; i++) {
            const k = v.skid[i];
            const wx = v.renderPos.x + wheels[i].x * c + wheels[i].z * s;
            const wz = v.renderPos.z - wheels[i].x * s + wheels[i].z * c;
            fx.skids.add(v.id * 4 + i, wx, v.renderPos.y, wz, 0, 0, k, 0.24, false);
            if (k > 0.3 && Math.random() < k * (v.surface === 'asphalt' ? 0.3 : 0.6) * dt * 60 * 0.5) {
              fx.tyreSmoke(wx, v.renderPos.y, wz, k, v.vel.x, v.vel.z, v.surface);
            }
          }
        }
        // Damage smoke and fire.
        if (!v.wrecked && v.health < 450 && d < 120) {
          const hood = v.localToWorld(0, v.hz * 0.62, this._w);
          const rate = (450 - v.health) / 450;
          if (Math.random() < 0.25 + rate * 0.6) fx.engineSmoke(hood.x, v.renderPos.y + v.height * 0.75, hood.z, rate, v.vel.x, v.vel.z);
          if (v.burning > 0 && Math.random() < 0.9) fx.flame(hood.x, v.renderPos.y + v.height * 0.62, hood.z, 0.8);
        }
        // Nitro.
        if (v.boostFx > 0.5 && v.kind === 'car') {
          for (const side of [-0.35, 0.35]) {
            const ex = v.localToWorld(side, -v.hz - 0.1, this._w);
            fx.nitro(ex.x, v.renderPos.y + 0.35, ex.z, s, c);
          }
        }
        // Night lights on the road.
        if (night > 0.05 && !v.wrecked && d < 130) {
          const lit = v.lightsOn || (v.driver !== null) || v.role !== 'parked';
          if (lit && v.role !== 'parked' && v.kind === 'car') {
            this._q.setFromAxisAngle(this._y, v.renderYaw);
            this._p.set(v.renderPos.x + s * (v.hz + 10.5), v.renderPos.y + 0.012, v.renderPos.z + c * (v.hz + 10.5));
            this._s.set(0.42, 1, 1);
            this._m.compose(this._p, this._q, this._s);
            fx.carPool(this._m, 0, 0, 11, 0.85 * night, null);
          }
          if (v.siren) {
            const phase = Math.floor(v.sirenTime * 5) % 2;
            this._q.setFromAxisAngle(this._y, v.renderYaw);
            this._p.set(v.renderPos.x, v.renderPos.y + 0.012, v.renderPos.z);
            this._s.set(1, 1, 1);
            this._m.compose(this._p, this._q, this._s);
            fx.carPool(this._m, 0, 0, 8, 1.1 * night, phase ? [0.25, 0.4, 3] : [3, 0.25, 0.2]);
          }
        }
        if (v.siren && !v.wrecked && d < nearestSirenD) {
          nearestSiren = v;
          nearestSirenD = d;
        }
      }
      fx.endCarPools();

      // Emergency light bouncing off the street.
      if (nearestSiren) {
        const phase = Math.floor(nearestSiren.sirenTime * 5) % 2;
        this.sirenLight.color.setRGB(phase ? 0.15 : 1, phase ? 0.3 : 0.08, phase ? 1 : 0.06);
        this.sirenLight.position.set(nearestSiren.renderPos.x, nearestSiren.renderPos.y + nearestSiren.height + 0.6, nearestSiren.renderPos.z);
        this.sirenLight.intensity = 6 + night * 40;
      } else this.sirenLight.intensity = 0;

      // The player's headlights light the street ahead at night.
      if (pv && night > 0.2 && !pv.wrecked && !pv.airCamera) {
        const f = Math.sin(pv.renderYaw);
        const g = Math.cos(pv.renderYaw);
        this.headlight.position.set(pv.renderPos.x + f * pv.hz, pv.renderPos.y + 0.8, pv.renderPos.z + g * pv.hz);
        this.headlight.target.position.set(pv.renderPos.x + f * (pv.hz + 24), pv.renderPos.y - 0.6, pv.renderPos.z + g * (pv.hz + 24));
        this.headlight.target.updateMatrixWorld();
        this.headlight.intensity = 170 * night;
      } else this.headlight.intensity = 0;

      this._mixVoices(dt);
    }

    // ------------------------------------------------------------ sound
    _mixVoices(dt) {
      const audio = this.audio;
      if (!audio.ready || !audio.createEngine) return;
      const sys = this.sys;
      const cam = this.game.renderer.camera.position;
      this._voiceTimer -= dt;
      if (this._voiceTimer <= 0) {
        this._voiceTimer = 0.25;
        // Choose which cars get an engine voice and which police cars get a siren.
        const byDist = sys.list
          .filter((v) => !v.wrecked && (v.driver || v.role === 'traffic' || v.role === 'police' || v.speed > 1))
          .map((v) => [Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z), v])
          .sort((a, b) => a[0] - b[0]);
        const want = new Set();
        const pv = sys.playerVehicle;
        if (pv) want.add(pv.id);
        for (const [d, v] of byDist) {
          if (want.size >= ENGINE_VOICES) break;
          if (d < (v.voiceRange || 70)) want.add(v.id);
        }
        const sirens = new Set();
        for (const [d, v] of byDist) {
          if (sirens.size >= SIREN_VOICES) break;
          if (v.siren && d < 320) sirens.add(v.id);
        }
        for (const v of sys.list) {
          let vo = this.voices.get(v.id);
          const needEngine = want.has(v.id);
          const needSiren = sirens.has(v.id);
          if (!vo && (needEngine || needSiren)) {
            vo = {};
            this.voices.set(v.id, vo);
          }
          if (!vo) continue;
          // Aircraft and tanks bring their own engine sound (aircraft.js, tank.js).
          if (needEngine && !vo.engine) vo.engine = v.createEngineVoice ? v.createEngineVoice(audio) : audio.createEngine({ kind: v.cls, player: v.driver === 'player' });
          if (!needEngine && vo.engine) {
            vo.engine.stop();
            vo.engine = null;
          }
          if (needEngine && !vo.skid && v.kind === 'car' && (v.driver === 'player' || v.skid[2] > 0.2)) vo.skid = audio.createSkid();
          if (needSiren && !vo.siren) vo.siren = audio.createSiren({ style: 'wail' });
          if (!needSiren && vo.siren) {
            vo.siren.stop();
            vo.siren = null;
          }
          if (v.horn && !vo.horn) vo.horn = audio.createHorn();
          if (v.burning > 0 && !vo.fire && audio.createFire) vo.fire = audio.createFire();
          if (!needEngine && !needSiren && !v.horn && !vo.fire) {
            for (const k of Object.keys(vo)) if (vo[k] && vo[k].stop) vo[k].stop();
            this.voices.delete(v.id);
          }
        }
        // Voices of removed cars.
        for (const id of Array.from(this.voices.keys())) {
          if (!sys.list.some((v) => v.id === id)) {
            const vo = this.voices.get(id);
            for (const k of Object.keys(vo)) if (vo[k] && vo[k].stop) vo[k].stop();
            this.voices.delete(id);
          }
        }
      }
      const pv = sys.playerVehicle;
      for (const v of sys.list) {
        const vo = this.voices.get(v.id);
        if (!vo) continue;
        const inside = v === pv;
        const pan = inside ? 0 : this._pan(v.renderPos.x, v.renderPos.z);
        const gain = inside ? 1 : this._gain(v.renderPos.x, v.renderPos.z, v.voiceRef || 9, v.voiceRef ? v.renderPos.y : undefined);
        if (vo.engine && v.updateEngineVoice) v.updateEngineVoice(vo.engine, (inside ? 0.9 : 0.75) * gain * (v.wrecked ? 0 : 1), pan, inside);
        else if (vo.engine) {
          vo.engine.update({
            rpm: v.rpm, throttle: Math.max(0, v.input.accel), load: clamp(Math.abs(v.ax) / 6, 0, 1),
            gain: (inside ? 0.9 : 0.75) * gain * (v.wrecked ? 0 : 1), pan,
          });
        }
        if (vo.skid) {
          const slip = Math.max(v.skid[0], v.skid[2]);
          vo.skid.update({ slip, gain: gain * (v.grounded ? 1 : 0), pan, surface: v.surface });
        }
        if (vo.siren) {
          // A crude Doppler: approaching sounds higher.
          const cam3 = this.game.renderer.camera.position;
          const dx = cam3.x - v.renderPos.x;
          const dz = cam3.z - v.renderPos.z;
          const d = Math.hypot(dx, dz) || 1;
          const closing = (v.vel.x * dx + v.vel.z * dz) / d;
          vo.siren.update({ gain: this._gain(v.renderPos.x, v.renderPos.z, 30) * (v.siren ? 1 : 0), pan, style: v.sirenStyle || 'wail', dopplerRate: clamp(1 + closing / 340, 0.9, 1.1) });
        }
        if (vo.horn) vo.horn.update({ on: !!v.horn && !v.wrecked, gain, pan });
        if (vo.fire) vo.fire.update({ gain: v.burning > 0 || v.wrecked ? gain * 0.8 : 0, pan });
      }
    }
  }

  VehicleFeedback.smoothstep = smoothstep;
  VH.VehicleFeedback = VehicleFeedback;
})();
