/*
 * camera.js — the player camera.
 *
 * Modes (V cycles): close third-person, far third-person, first-person.
 * Holding Aim tightens to an over-the-shoulder view; the mouse wheel
 * adjusts distance; B looks behind.
 *
 * Collision: the camera sits at the end of a short arm from Jay's head to
 * the shoulder, then back from the shoulder along the view direction. Both
 * legs are ray-cast against the collision world with a fattened ray (a
 * cheap sphere cast), so the camera slides in front of walls instead of
 * through them. It pulls in instantly and eases back out, so it never
 * clips but also never jitters.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, damp, lerp } = VH.math;

  const MODES = [
    { id: 'near', label: 'Close', distance: 3.5, height: 0.2 },
    { id: 'far', label: 'Far', distance: 5.8, height: 0.45 },
    { id: 'first', label: 'First person', distance: 0, height: 0 },
  ];

  // Vehicle cameras (V cycles): chase, far chase, bonnet.
  const CAR_MODES = [
    { id: 'chase', label: 'Chase', dist: 1.0, height: 1.0 },
    { id: 'farchase', label: 'Far chase', dist: 1.55, height: 1.35 },
    { id: 'bonnet', label: 'Bonnet', dist: 0, height: 0 },
  ];

  class CameraRig {
    constructor(camera, physics, settings, input) {
      this.vehicles = null; // set by the game: the camera keeps out of cars
      this.camera = camera;
      this.physics = physics;
      this.settings = settings;
      this.input = input;
      this.yaw = Math.PI;
      this.pitch = -0.12;
      this.modeIndex = 0;
      this.zoom = 0;
      this.pivot = new THREE.Vector3();
      this.curDist = 3.5;
      this.fov = settings.get('graphics.fov');
      this._behind = 0;
      this._dip = 0;
      this._shake = 0;
      this._initialised = false;
      this.carModeIndex = 0;
      this._lookIdle = 0;
      this._carYaw = 0;
      this._carPivot = new THREE.Vector3();
      this._carInit = false;
      this._speedShake = 0;
      this._fwd = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._shoulder = new THREE.Vector3();
      this._eye = new THREE.Vector3();
      this._tmp = new THREE.Vector3();
      this.position = camera.position;

      VH.events.on('player:land', (e) => {
        this._dip = Math.min(0.3, Math.max(0, e.impact - 3) * 0.02);
        if (e.impact > 13) this.addShake(Math.min(1, (e.impact - 13) / 12));
      });
    }

    get mode() {
      return MODES[this.modeIndex];
    }

    get isFirstPerson() {
      return this.mode.id === 'first';
    }

    addShake(amount) {
      if (!this.settings.get('gameplay.cameraShake')) return;
      this._shake = Math.min(1, this._shake + amount);
    }

    /** Point the camera the way the player faces (after spawning or respawning). */
    snapBehind(player) {
      this.yaw = player.heading;
      this.pitch = -0.12;
      this._initialised = false;
    }

    cycleMode() {
      if (this._inCar) {
        this.carModeIndex = (this.carModeIndex + 1) % CAR_MODES.length;
        VH.events.emit('camera:mode', { mode: CAR_MODES[this.carModeIndex] });
        return;
      }
      this.modeIndex = (this.modeIndex + 1) % MODES.length;
      this.zoom = 0;
      VH.events.emit('camera:mode', { mode: this.mode });
    }

    /** Read mouse/stick look input. Called once per frame while playing. */
    handleInput(dt, aiming) {
      const inp = this.input;
      const md = inp.takeMouseDelta();
      if (md.x || md.y) this._lookIdle = 0;
      const sens = 0.0022 * this.settings.get('gameplay.mouseSensitivity') * (aiming ? 0.62 : 1);
      const invert = this.settings.get('gameplay.invertY') ? -1 : 1;
      this.yaw -= md.x * sens;
      this.pitch -= md.y * sens * invert;
      const look = inp.lookVector();
      if (look.x || look.y) {
        this._lookIdle = 0;
        const ps = this.settings.get('gameplay.gamepadSensitivity') * (aiming ? 0.55 : 1);
        this.yaw -= look.x * Math.abs(look.x) * 3.4 * ps * dt;
        this.pitch -= look.y * Math.abs(look.y) * 2.3 * ps * dt * invert;
      }
      this.yaw = VH.math.wrapAngle(this.yaw);
      const first = this.isFirstPerson;
      // Flying, the view (and with it the aircraft) can point nearly straight up or down.
      const wide = first || this._air;
      this.pitch = clamp(this.pitch, wide ? -1.45 : -1.2, wide ? 1.45 : 0.95);
      this._lookIdle += dt;

      const wheel = inp.takeWheel();
      if (wheel && !first) this.zoom = clamp(this.zoom + wheel * 0.55, -1.6, 3.5);
      if (inp.consume('camera')) this.cycleMode();
    }

    /** Place the camera for this frame. `player` is drawn at player.renderPos. */
    /** Nearest hit of a ray with any car near it (each car a box, slightly inflated), or null. */
    _carHit(o, dx, dy, dz, maxT, player) {
      const list = this.vehicles && this.vehicles.list;
      if (!list) return null;
      let best = null;
      const pad = 0.2;
      for (const v of list) {
        if (v.removed || v === player.vehicle) continue;
        const ox = o.x - v.pos.x;
        const oz = o.z - v.pos.z;
        const reach = maxT + v.hz + 1;
        if (ox * ox + oz * oz > reach * reach) continue;
        // Into the car's frame: right = (cos yaw, -sin yaw), forward = (sin yaw, cos yaw).
        const c = Math.cos(v.yaw);
        const sn = Math.sin(v.yaw);
        const lo = [ox * c - oz * sn, o.y - v.pos.y, ox * sn + oz * c];
        const ld = [dx * c - dz * sn, dy, dx * sn + dz * c];
        const lo3 = [-v.hx - pad, -pad, -v.hz - pad];
        const hi3 = [v.hx + pad, (v.height || 1.5) + pad, v.hz + pad];
        let t0 = 0;
        let t1 = maxT;
        let ok = true;
        for (let k = 0; k < 3 && ok; k++) {
          if (Math.abs(ld[k]) < 1e-6) {
            if (lo[k] < lo3[k] || lo[k] > hi3[k]) ok = false;
          } else {
            let a = (lo3[k] - lo[k]) / ld[k];
            let b = (hi3[k] - lo[k]) / ld[k];
            if (a > b) [a, b] = [b, a];
            t0 = Math.max(t0, a);
            t1 = Math.min(t1, b);
            if (t0 > t1) ok = false;
          }
        }
        // Starting inside a car (Jay pressed against it): leave it to the static test.
        if (ok && t0 > 0 && (best === null || t0 < best)) best = t0;
      }
      return best;
    }

    update(dt, player) {
      if (player.inVehicle) {
        const v = player.vehicle;
        this._inCar = true;
        // A tank's turret follows the view: never swing it back behind.
        this._aimingInCar = player.aiming || !!v.aimCamera;
        this._air = !!v.airCamera;
        if (this._air) this._updateAir(dt, v);
        else this._updateCar(dt, v);
        return;
      }
      this._air = false;
      if (this._inCar) {
        // Just got out: face the way the car was going.
        this._inCar = false;
        this._carInit = false;
        this._initialised = false;
      }
      const cam = this.camera;
      const settings = this.settings;
      const first = this.isFirstPerson;
      const aim = player.aimAmount;

      // Look-behind is a smoothed 180° turn of the view only.
      const behind = this.input.down('lookBehind') ? 1 : 0;
      this._behind = damp(this._behind, behind, 12, dt);
      const yaw = this.yaw + Math.PI * this._behind;
      const pitch = this.pitch * (1 - this._behind);

      // Pivot: head height above the interpolated feet, smoothed a little
      // vertically so steps and jumps don't jolt the view.
      const eye = this._eye.copy(player.renderPos);
      eye.y += player.eyeHeight() + player._stepOffset * 0.3;
      if (!this._initialised) {
        this.pivot.copy(eye);
        this.curDist = this.mode.distance;
        this._initialised = true;
      }
      this.pivot.x = damp(this.pivot.x, eye.x, 30, dt);
      this.pivot.z = damp(this.pivot.z, eye.z, 30, dt);
      this.pivot.y = damp(this.pivot.y, eye.y, player.state === 'climb' ? 7 : 11, dt);
      this._dip = damp(this._dip, 0, 5, dt);

      const cp = Math.cos(pitch);
      const fwd = this._fwd.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      const right = this._right.set(-Math.cos(yaw), 0, Math.sin(yaw));

      let targetFov = settings.get('graphics.fov');
      const sprintFactor = player.sprinting ? clamp((player.speed - 4.6) / 2.8, 0, 1) : 0;
      targetFov += sprintFactor * 7 - aim * 16;

      if (first) {
        player.model.setVisible(true);
        player.model.setHeadVisible(false);
        cam.near = 0.05;
        cam.position.set(eye.x + Math.sin(yaw) * 0.14, eye.y + 0.02, eye.z + Math.cos(yaw) * 0.14);
      } else {
        player.model.setHeadVisible(true);
        cam.near = 0.1;
        const m = this.mode;
        const baseDist = Math.max(1.4, m.distance + this.zoom);
        const dist = lerp(baseDist + sprintFactor * 0.5, 1.75, aim);
        let side = lerp(0.42, 0.62, aim);
        const up = lerp(m.height, 0.08, aim) - this._dip;

        // Leg 1: head → shoulder (the shoulder offset must not poke into a wall).
        const hitSide = this.physics.raycast(this.pivot.x, this.pivot.y, this.pivot.z, right.x, 0, right.z, side + 0.25,
          { inflate: 0.12, flags: VH.COLLIDE.CAMERA, ground: false, ignoreInside: true });
        if (hitSide) side = Math.max(0, hitSide.t - 0.25);
        // ...nor into a van or truck beside Jay (cast from his head, which is never inside one).
        const sideCar = this._carHit(this.pivot, right.x, 0, right.z, side + 0.25, player);
        if (sideCar !== null) side = Math.min(side, Math.max(0, sideCar - 0.25));
        const shoulder = this._shoulder.copy(this.pivot).addScaledVector(right, side);
        shoulder.y += up;

        // Leg 2: shoulder → back along the view direction.
        const hit = this.physics.raycast(shoulder.x, shoulder.y, shoulder.z, -fwd.x, -fwd.y, -fwd.z, dist + 0.3,
          { inflate: 0.2, flags: VH.COLLIDE.CAMERA, ground: true, ignoreInside: true });
        let allowed = hit ? Math.max(0.3, hit.t - 0.15) : dist;
        // Cars aren't in the static world: keep the camera out of a parked van behind Jay.
        const carT = this._carHit(shoulder, -fwd.x, -fwd.y, -fwd.z, allowed + 0.3, player);
        if (carT !== null) allowed = Math.max(0.3, carT - 0.25);
        if (allowed < this.curDist) this.curDist = allowed;
        else this.curDist = damp(this.curDist, allowed, 4.5, dt);

        cam.position.copy(shoulder).addScaledVector(fwd, -this.curDist);
        // Too close to the head: hide Jay rather than show the inside of his skull.
        player.model.setVisible(this.curDist > 0.7);
      }

      // Camera shake (landings now; explosions and gunfire later).
      if (this._shake > 0.001) {
        const t = performance.now() / 1000;
        const s = this._shake * 0.08;
        cam.position.x += Math.sin(t * 37.1) * s;
        cam.position.y += Math.sin(t * 43.7 + 1.3) * s;
        cam.position.z += Math.sin(t * 29.3 + 2.1) * s;
        this._shake = damp(this._shake, 0, 6, dt);
      }

      this.fov = damp(this.fov, targetFov, 8, dt);
      if (Math.abs(cam.fov - this.fov) > 0.01 || cam.near !== this._lastNear) {
        cam.fov = this.fov;
        cam.updateProjectionMatrix();
        this._lastNear = cam.near;
      }
      cam.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
      cam.updateMatrixWorld();
    }

    /** On entering a car: look the way it faces. */
    snapToCar(v) {
      this.yaw = v.yaw;
      this.pitch = -0.14;
      this._carInit = false;
    }

    /**
     * Chase camera: trails the car with a little lag, swings toward the
     * direction of travel in a drift, pulls back and widens with speed,
     * and hands control to the mouse until it's left alone for a moment.
     */
    _updateCar(dt, v) {
      const cam = this.camera;
      const settings = this.settings;
      const mode = CAR_MODES[this.carModeIndex];
      const speed = v.speed;
      const pos = v.renderPos;
      // Where "behind" is: the heading, leaning toward the velocity in a slide.
      let base = v.renderYaw;
      if (speed > 4 && v.vF > -1) {
        const velYaw = Math.atan2(v.vel.x, v.vel.z);
        base = VH.math.lerpAngle(base, velYaw, v.grounded ? 0.45 : 0.8);
      }
      if (!this._carInit) {
        this._carYaw = base;
        this._carPivot.set(pos.x, pos.y + v.height * 0.8, pos.z);
        this._carInit = true;
        this._carDist = 6;
      }
      // Mouse look overrides; after a moment of no input, drift back behind (not while aiming a drive-by).
      if (this._lookIdle > 1.1 && !this._aimingInCar) {
        this.yaw = VH.math.dampAngle(this.yaw, base, speed > 2 ? 3.2 : 1.2, dt);
        this.pitch = damp(this.pitch, -0.12 - smoothstepLocal(8, 40, speed) * 0.04, 2.5, dt);
      } else if (speed > 3) {
        // Even while looking around, the view is carried round with the car.
        this.yaw += VH.math.angleDelta(this._carYaw, base);
      }
      this._carYaw = base;
      const behind = this._behind = damp(this._behind, this.input.down('lookBehind') ? 1 : 0, 12, dt);
      const yaw = this.yaw + Math.PI * behind;
      const pitch = clamp(this.pitch, -0.9, 0.45) * (1 - behind * 0.7);

      // Pivot follows the car with a soft vertical spring (jumps feel big).
      const pv = this._carPivot;
      pv.x = damp(pv.x, pos.x, 18, dt);
      pv.z = damp(pv.z, pos.z, 18, dt);
      pv.y = damp(pv.y, pos.y + v.height * 0.8, v.grounded ? 9 : 3.5, dt);

      const cp = Math.cos(pitch);
      const fwd = this._fwd.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      const sp = smoothstepLocal(0, 45, speed);
      let targetFov = settings.get('graphics.fov') + sp * 13 + v.boostFx * 9;

      if (mode.id === 'bonnet') {
        const f = Math.sin(v.renderYaw);
        const g = Math.cos(v.renderYaw);
        cam.near = 0.1;
        cam.position.set(pos.x + f * (v.hz * 0.35), pos.y + v.height * 0.82, pos.z + g * (v.hz * 0.35));
        cam.rotation.set(pitch * 0.5 + v._visPitch * 0.5, yaw + Math.PI, -v._visRoll * 0.4, 'YXZ');
        targetFov += 4;
      } else {
        cam.near = 0.15;
        const baseDist = (4.2 + v.hz * 0.95) * mode.dist + this.zoom * 0.8;
        const dist = baseDist + sp * 1.6 + v.boostFx * 0.8;
        const up = (0.55 + v.height * 0.35) * mode.height;
        const origin = this._shoulder.copy(pv);
        origin.y += up;
        const hit = this.physics.raycast(origin.x, origin.y, origin.z, -fwd.x, -fwd.y, -fwd.z, dist + 0.3,
          { inflate: 0.25, flags: VH.COLLIDE.CAMERA, ground: true, ignoreInside: true });
        const allowed = hit ? Math.max(1.2, hit.t - 0.2) : dist;
        if (allowed < this._carDist) this._carDist = allowed;
        else this._carDist = damp(this._carDist, allowed, 3, dt);
        cam.position.copy(origin).addScaledVector(fwd, -this._carDist);
        // Look slightly ahead of the car.
        cam.rotation.set(pitch - 0.06, yaw + Math.PI, 0, 'YXZ');
      }

      // Shake: impacts (addShake) and a fine rumble at speed.
      this._speedShake = damp(this._speedShake, v.grounded ? smoothstepLocal(25, 55, speed) * 0.35 + v.boostFx * 0.35 : 0, 4, dt);
      const shake = this._shake + this._speedShake * 0.25;
      if (shake > 0.001 && settings.get('gameplay.cameraShake')) {
        const t = performance.now() / 1000;
        const s = shake * 0.09;
        cam.position.x += Math.sin(t * 37.1) * s;
        cam.position.y += Math.sin(t * 43.7 + 1.3) * s;
        cam.position.z += Math.sin(t * 29.3 + 2.1) * s;
      }
      this._shake = damp(this._shake, 0, 5, dt);

      this.fov = damp(this.fov, targetFov, 5, dt);
      if (Math.abs(cam.fov - this.fov) > 0.01 || cam.near !== this._lastNear) {
        cam.fov = this.fov;
        cam.updateProjectionMatrix();
        this._lastNear = cam.near;
      }
      cam.updateMatrixWorld();
    }

    /**
     * Aircraft: the mouse points the view and the aircraft flies where it
     * looks (aircraft.js reads cameraRig.yaw/pitch), so the camera simply
     * sits behind the view direction, a long way back for big aircraft.
     * No recentring: holding still holds the heading.
     */
    _updateAir(dt, v) {
      const cam = this.camera;
      const settings = this.settings;
      const mode = CAR_MODES[this.carModeIndex];
      const pos = v.renderPos;
      const lift = v.camLift !== undefined ? v.camLift : v.height * 0.7;
      if (!this._carInit) {
        this._carPivot.set(pos.x, pos.y + lift, pos.z);
        this._carInit = true;
        this._carDist = 8;
      }
      const behind = this._behind = damp(this._behind, this.input.down('lookBehind') ? 1 : 0, 12, dt);
      const yaw = this.yaw + Math.PI * behind;
      const pitch = this.pitch * (1 - behind);
      const pv = this._carPivot;
      // Tight follow: at 100 m/s a soft spring would leave the aircraft behind the camera.
      pv.x = damp(pv.x, pos.x, 24, dt);
      pv.z = damp(pv.z, pos.z, 24, dt);
      pv.y = damp(pv.y, pos.y + lift, 16, dt);
      const cp = Math.cos(pitch);
      const fwd = this._fwd.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      const speed = Math.hypot(v.vel.x, v.vel.y, v.vel.z);
      const sp = smoothstepLocal(10, 110, speed);
      let targetFov = settings.get('graphics.fov') + sp * 10 + (v.boostFx || 0) * 8;
      if (mode.id === 'bonnet') {
        // From the cockpit, looking where the mouse points.
        const nose = v.cockpit || { z: v.hz * 0.45, y: v.height * 0.7 };
        const f = Math.sin(v.renderYaw);
        const g = Math.cos(v.renderYaw);
        cam.near = 0.1;
        cam.position.set(pos.x + f * nose.z, pos.y + nose.y, pos.z + g * nose.z);
        cam.rotation.set(pitch, yaw + Math.PI, -(v.roll || 0) * 0.6, 'YXZ');
        targetFov += 4;
      } else {
        cam.near = 0.2;
        const baseDist = (v.camDist || 6 + v.hz * 1.6) * mode.dist + this.zoom * 1.2;
        const dist = baseDist + sp * 3;
        const origin = this._shoulder.copy(pv);
        origin.y += (v.camUp !== undefined ? v.camUp : 1.2) * mode.height;
        const hit = this.physics.raycast(origin.x, origin.y, origin.z, -fwd.x, -fwd.y, -fwd.z, dist + 0.3,
          { inflate: 0.25, flags: VH.COLLIDE.CAMERA, ground: true, ignoreInside: true });
        const allowed = hit ? Math.max(2, hit.t - 0.3) : dist;
        if (allowed < this._carDist) this._carDist = allowed;
        else this._carDist = damp(this._carDist, allowed, 3, dt);
        cam.position.copy(origin).addScaledVector(fwd, -this._carDist);
        cam.rotation.set(pitch - 0.05, yaw + Math.PI, 0, 'YXZ');
      }
      const shake = this._shake;
      if (shake > 0.001 && settings.get('gameplay.cameraShake')) {
        const t = performance.now() / 1000;
        const s = shake * 0.09;
        cam.position.x += Math.sin(t * 37.1) * s;
        cam.position.y += Math.sin(t * 43.7 + 1.3) * s;
        cam.position.z += Math.sin(t * 29.3 + 2.1) * s;
      }
      this._shake = damp(this._shake, 0, 5, dt);
      this.fov = damp(this.fov, targetFov, 4, dt);
      if (Math.abs(cam.fov - this.fov) > 0.01 || cam.near !== this._lastNear) {
        cam.fov = this.fov;
        cam.updateProjectionMatrix();
        this._lastNear = cam.near;
      }
      cam.updateMatrixWorld();
    }

    /**
     * Title-screen shot: a slow orbit around downtown, with the ocean
     * swinging through the frame.
     */
    titleShot(t, center) {
      const cam = this.camera;
      const a = t * 0.035 + 2.2;
      const r = 430;
      cam.near = 0.5;
      cam.fov = 50;
      cam.updateProjectionMatrix();
      cam.position.set(center.x + Math.cos(a) * r, 95 + Math.sin(t * 0.05) * 20, center.z + Math.sin(a) * r);
      cam.lookAt(center.x, 55, center.z);
      cam.updateMatrixWorld();
      this._lastNear = cam.near;
    }

    /** Forward direction on the ground plane (for the player's movement). */
    get flatYaw() {
      return this.yaw;
    }
  }

  function smoothstepLocal(a, b, x) {
    return VH.math.smoothstep(a, b, x);
  }

  CameraRig.MODES = MODES;
  CameraRig.CAR_MODES = CAR_MODES;
  VH.CameraRig = CameraRig;
})();
