/*
 * player.js — Jay Mercer: the on-foot character controller.
 *
 * Runs on the fixed 60 Hz simulation step (main.js) and is drawn
 * interpolated between steps, so movement is identical at any frame rate
 * and smooth on high-refresh displays.
 *
 * Movement model:
 *   - velocity accelerates toward a target (never snaps), with separate
 *     rates for speeding up, slowing down and air control
 *   - walk / run / sprint / crouch speeds, aim-walk while aiming
 *   - buffered jumps and coyote time, so jumps feel reliable
 *   - step-up over kerbs and stairs, snap-down when walking down them
 *   - climb onto ledges up to 1.7 m, vault low walls when running, and
 *     grab a ledge in mid-air after a jump
 *   - fall damage, a knockout and respawn
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, damp, dampAngle, lerp, lerpAngle, smoothstep } = VH.math;

  // How hard the city hits Jay and how quickly he gets his breath back
  // (Settings → Gameplay → Difficulty). Health refills all the way.
  const TOUGHNESS = {
    easy: { taken: 0.4, delay: 2.5, regen: 12 },
    normal: { taken: 0.6, delay: 3.5, regen: 8 },
    hard: { taken: 0.9, delay: 5, regen: 4 },
  };
  const toughness = () => TOUGHNESS[VH.settings && VH.settings.get('gameplay.difficulty')] || TOUGHNESS.normal;

  const P = {
    radius: 0.3,
    height: 1.8,
    crouchHeight: 1.2,
    eyeHeight: 1.62,
    crouchEye: 1.08,
    stepHeight: 0.45,
    snapDown: 0.4,
    walkSpeed: 1.75,
    runSpeed: 4.6,
    sprintSpeed: 7.4,
    crouchSpeed: 1.9,
    aimSpeed: 2.8,
    accel: 30,
    sprintAccel: 13,
    decel: 24,
    airAccel: 5,
    gravity: 20,
    jumpVelocity: 6.4,
    coyoteTime: 0.12,
    jumpBuffer: 0.15,
    climbMax: 1.7,
    vaultMax: 1.15,
    airGrabReach: 1.3,
    safeFallSpeed: 12,
    fallDamagePerMs: 8,
  };

  class Player {
    constructor(scene, physics, input, settings) {
      this.physics = physics;
      this.input = input;
      this.settings = settings;
      this.name = 'Jay Mercer';

      this.pos = new THREE.Vector3();
      this.prevPos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.heading = Math.PI;
      this.prevHeading = Math.PI;
      this.renderPos = new THREE.Vector3();

      this.grounded = true;
      this.state = 'ground'; // ground | air | climb | dead
      this.crouched = false;
      this.wantCrouch = false;
      this.crouchAmount = 0;
      this.walkToggle = false;
      this.sprinting = false;
      this.aiming = false;
      this.aimAmount = 0;
      this.noclip = false;
      this.godMode = false;

      this.health = 100;
      this.maxHealth = 100;
      this.armor = 0;
      this.maxArmor = 100;
      this.money = 2500;

      this._coyote = 0;
      this._jumpBuffer = 0;
      this._land = 0;
      this._stagger = 0;
      this._stepOffset = 0;
      this._sinceDamage = 99;
      this._deadTimer = 0;
      this._fallStartY = 0;
      this.climb = null;
      this.spawnPoint = { x: 0, y: 0.2, z: 0, yaw: Math.PI };
      this.vehicle = null; // the car Jay is driving (vehicles.js), or null
      this.enteringVehicle = false;
      this.entry = null; // pose driver for the car door animations: { board, reach, pull }
      this.visualLift = 0; // raises the model while he is climbing into a seat
      this.parachute = null; // { t, open } after jumping out of an aircraft
      this._canopy = null;
      this._knockT = 0;
      this.dynamicResolver = null; // set by main.js: pushes Jay out of cars, reports being run over
      this.extraGround = null; // set by main.js: car roofs to stand on

      this.stats = {
        distanceOnFoot: 0, sprintDistance: 0, jumps: 0, climbs: 0, vaults: 0, deaths: 0, longestFall: 0,
        distanceDriven: 0, carsStolen: 0, topSpeed: 0, longestJump: 0, nearMisses: 0, timesArrested: 0,
      };

      this.model = new VH.Humanoid(VH.Humanoid.JAY_LOOK);
      scene.add(this.model.root);
      this.model.onStep = (speed) => VH.events.emit('player:step', { speed, surface: this.surface() });
      this.surfaceResolver = null; // set by main.js: (x, z, collider) → surface name

      this._resolveOut = { x: 0, z: 0, hit: false };
      this._next = { x: 0, z: 0 };
    }

    get params() {
      return P;
    }

    // ------------------------------------------------------------- setup
    spawn(sp) {
      this.spawnPoint = Object.assign({}, sp);
      this.teleport(sp.x, sp.z, sp.yaw, sp.y);
      this.health = this.maxHealth;
      this.state = 'ground';
      this.model.root.rotation.set(0, this.heading, 0);
    }

    teleport(x, z, yaw, y) {
      const g = this.physics.groundHeight(x, z, y !== undefined ? y + 2 : 1000);
      this.pos.set(x, g, z);
      this.prevPos.copy(this.pos);
      this.vel.set(0, 0, 0);
      if (yaw !== undefined) this.heading = this.prevHeading = yaw;
      this.grounded = true;
      this.state = 'ground';
      this.climb = null;
      this._stepOffset = 0;
    }

    currentHeight() {
      return lerp(P.height, P.crouchHeight, this.crouchAmount);
    }

    eyeHeight() {
      return lerp(P.eyeHeight, P.crouchEye, this.crouchAmount);
    }

    /** Highest ground under the character's footprint (centre plus four points). */
    _groundFootprint(x, z, maxY) {
      const ph = this.physics;
      const o = P.radius * 0.6;
      let g = ph.groundHeight(x, z, maxY);
      if (this.extraGround) g = Math.max(g, this.extraGround(x, z, maxY));
      g = Math.max(g, ph.groundHeight(x + o, z, maxY));
      g = Math.max(g, ph.groundHeight(x - o, z, maxY));
      g = Math.max(g, ph.groundHeight(x, z + o, maxY));
      g = Math.max(g, ph.groundHeight(x, z - o, maxY));
      return g;
    }

    /** What Jay is standing on: concrete, asphalt, wood, metal, grass or gravel. */
    surface() {
      const ph = this.physics;
      ph.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.05);
      const col = ph.lastGround;
      if (this.surfaceResolver) return this.surfaceResolver(this.pos.x, this.pos.z, col);
      return 'concrete';
    }

    canStand() {
      return !this.physics.overlaps(this.pos.x, this.pos.z, P.radius * 0.95, this.pos.y + P.crouchHeight - 0.05, this.pos.y + P.height);
    }

    // --------------------------------------------------------- fixed step
    fixedUpdate(dt, camYaw) {
      this.prevPos.copy(this.pos);
      this.prevHeading = this.heading;
      this._sinceDamage += dt;

      if (this.state === 'dead') {
        this._deadTimer += dt;
        return;
      }
      const T = toughness();
      if (this._sinceDamage > T.delay && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * T.regen);
      if (this.state === 'vehicle' && this.vehicle) {
        // Riding along: the car carries Jay.
        const v = this.vehicle;
        this.pos.copy(v.pos);
        this.prevPos.copy(v.prevPos);
        this.vel.copy(v.vel);
        this.heading = v.yaw;
        this.prevHeading = v.prevYaw;
        this.grounded = true;
        this.sprinting = false;
        return;
      }
      if (this.state === 'knocked') {
        this._knockStep(dt);
        return;
      }
      if (this.noclip) {
        this._noclipStep(dt, camYaw);
        return;
      }
      if (this.frozen) {
        // Held in place (a challenge countdown): no movement, presses are dropped.
        this.vel.set(0, 0, 0);
        this.input.discard('jump');
        this.input.discard('crouch');
        return;
      }
      if (this.state === 'climb') {
        this._climbStep(dt);
        return;
      }

      const inp = this.input;
      const move = inp.moveVector();
      const mag = Math.min(1, Math.hypot(move.x, move.y));
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      // Right of a direction (sin a, cos a) is (-cos a, sin a).
      let wx = fx * move.y - fz * move.x;
      let wz = fz * move.y + fx * move.x;
      const wl = Math.hypot(wx, wz);
      if (wl > 1e-4) {
        wx /= wl;
        wz /= wl;
      }

      // Toggles.
      if (inp.consume('crouch')) this.wantCrouch = !this.wantCrouch;
      if (inp.consume('walk')) this.walkToggle = !this.walkToggle;
      this.aiming = inp.down('aim');
      if (this.wantCrouch) this.crouched = true;
      else if (this.crouched && this.canStand()) this.crouched = false;
      this.sprinting = inp.down('sprint') && !this.crouched && !this.aiming && mag > 0.3 && this.grounded;
      if (this.sprinting && this.wantCrouch) this.wantCrouch = false;

      let target = P.runSpeed;
      if (this.crouched) target = P.crouchSpeed;
      else if (this.aiming) target = P.aimSpeed;
      else if (this.sprinting) target = P.sprintSpeed;
      else if (this.walkToggle) target = P.walkSpeed;
      // A gently pushed analogue stick walks.
      if (inp.lastDevice === 'gamepad' && mag < 0.55 && !this.sprinting) target = Math.min(target, P.walkSpeed);
      if (this._stagger > 0) target *= 0.35;
      // Keys are all-or-nothing; a stick scales speed with how far it is pushed.
      const scale = mag < 0.05 ? 0 : inp.lastDevice === 'gamepad' ? mag : 1;
      const desiredX = wx * target * scale;
      const desiredZ = wz * target * scale;

      // Accelerate the horizontal velocity toward the target.
      const vx = this.vel.x;
      const vz = this.vel.z;
      let rate;
      if (this.grounded) {
        const speeding = desiredX * desiredX + desiredZ * desiredZ > vx * vx + vz * vz;
        rate = speeding ? (this.sprinting ? P.sprintAccel : P.accel) : P.decel;
        // Sharp reversals get the stronger rate so turning feels responsive.
        if (desiredX * vx + desiredZ * vz < 0) rate = P.accel;
      } else {
        rate = P.airAccel;
      }
      const dx = desiredX - vx;
      const dz = desiredZ - vz;
      const dl = Math.hypot(dx, dz);
      const maxStep = rate * dt;
      if (dl <= maxStep || dl < 1e-6) {
        this.vel.x = desiredX;
        this.vel.z = desiredZ;
      } else if (this.grounded || mag > 0.05) {
        this.vel.x += (dx / dl) * maxStep;
        this.vel.z += (dz / dl) * maxStep;
      }

      // Jump, climb or vault.
      this._jumpBuffer -= dt;
      if (inp.consume('jump')) this._jumpBuffer = P.jumpBuffer;
      this._coyote = this.grounded ? P.coyoteTime : this._coyote - dt;
      if (this._jumpBuffer > 0 && this._coyote > 0) {
        this._jumpBuffer = 0;
        if (this.crouched && this.canStand()) {
          this.wantCrouch = false;
          this.crouched = false;
        }
        const dir = wl > 0.2 ? { x: wx, z: wz } : { x: Math.sin(this.heading), z: Math.cos(this.heading) };
        const hSpeed = Math.hypot(this.vel.x, this.vel.z);
        const climb = this._detectClimb(dir, hSpeed, P.climbMax);
        if (climb) {
          this._startClimb(climb);
          return;
        }
        this.vel.y = P.jumpVelocity;
        this.grounded = false;
        this.state = 'air';
        this._coyote = 0;
        this._fallStartY = this.pos.y;
        this.stats.jumps++;
        VH.events.emit('player:jump', {});
      }

      // In the air, grab a ledge that's within reach of the hands.
      if (!this.grounded && this.vel.y < 2.5 && wl > 0.2) {
        const grab = this._detectClimb({ x: wx, z: wz }, 0, P.airGrabReach, true);
        if (grab) {
          this._startClimb(grab);
          return;
        }
      }

      // Gravity.
      if (!this.grounded) this.vel.y = Math.max(-55, this.vel.y - P.gravity * dt);
      // Under a parachute: a slow drift down, steered with the move keys.
      const chute = this.parachute;
      if (chute && (this.grounded || this.state !== 'air')) this.parachute = null;
      else if (chute) {
        chute.t += dt;
        if (!chute.open && chute.t > 0.7) chute.open = true;
        if (chute.open) {
          this.vel.y = Math.max(this.vel.y, -5);
          if (this.vel.y < -5) this.vel.y = -5;
          const want = 7 * (mag > 0.05 ? 1 : 0.4);
          const fx = wl > 0.2 ? wx : Math.sin(this.heading);
          const fz = wl > 0.2 ? wz : Math.cos(this.heading);
          const k = 1 - Math.exp(-1.6 * dt);
          this.vel.x += (fx * want - this.vel.x) * k;
          this.vel.z += (fz * want - this.vel.z) * k;
        }
      }

      // Horizontal move and collision.
      const next = this._next;
      next.x = this.pos.x + this.vel.x * dt;
      next.z = this.pos.z + this.vel.z * dt;
      const h = this.currentHeight();
      const step = this.grounded ? P.stepHeight : 0.12;
      const res = this.physics.resolveCircle(next, P.radius, this.pos.y, this.pos.y + h, step, this._resolveOut);
      if (this.dynamicResolver) {
        const hit = this.dynamicResolver(next, P.radius, this.pos.y, this.pos.y + h, res);
        if (hit) {
          this.vel.x = hit.v.vel.x * 0.75 + hit.nx * 3;
          this.vel.z = hit.v.vel.z * 0.75 + hit.nz * 3;
          this.vel.y = 2 + hit.speed * 0.25;
          this.pos.x = next.x;
          this.pos.z = next.z;
          this.knock(8 + hit.speed * 3.2, 'car');
          VH.events.emit('player:hitByCar', { v: hit.v, speed: hit.speed });
          return;
        }
      }
      if (res.hit) {
        const vn = this.vel.x * res.x + this.vel.z * res.z;
        if (vn < 0) {
          this.vel.x -= vn * res.x;
          this.vel.z -= vn * res.z;
        }
      }
      const movedX = next.x - this.pos.x;
      const movedZ = next.z - this.pos.z;
      this.pos.x = next.x;
      this.pos.z = next.z;

      // Vertical: stick to the ground, or fly and land.
      if (this.grounded) {
        const g = this._groundFootprint(this.pos.x, this.pos.z, this.pos.y + P.stepHeight);
        if (g >= this.pos.y - P.snapDown) {
          this._stepOffset += this.pos.y - g;
          this.pos.y = g;
          this.vel.y = 0;
        } else {
          this.grounded = false;
          this.state = 'air';
          this.vel.y = 0;
          this._coyote = P.coyoteTime;
          this._fallStartY = this.pos.y;
        }
      } else {
        const prevY = this.pos.y;
        this.pos.y += this.vel.y * dt;
        if (this.vel.y > 0) {
          const ceil = this.physics.ceilingHeight(this.pos.x, this.pos.z, prevY + 0.3);
          if (ceil < this.pos.y + h) {
            this.pos.y = Math.max(prevY, ceil - h);
            this.vel.y = 0;
          }
        }
        const g = this._groundFootprint(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y) + 0.02);
        if (this.pos.y <= g) {
          this._landOn(g);
        }
      }

      // Facing.
      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      let targetHeading = this.heading;
      if (this.aiming) targetHeading = camYaw;
      else if (hSpeed > 0.4 && mag > 0.05) targetHeading = Math.atan2(this.vel.x, this.vel.z);
      this.heading = dampAngle(this.heading, targetHeading, this.grounded ? (this.aiming ? 18 : 11) : 4, dt);

      // Bookkeeping.
      const moved = Math.hypot(movedX, movedZ);
      if (this.grounded) {
        this.stats.distanceOnFoot += moved;
        if (this.sprinting) this.stats.sprintDistance += moved;
      }
      if (this._land > 0) this._land = Math.max(0, this._land - dt * 3.2);
      if (this._stagger > 0) this._stagger -= dt;
      if (this.pos.y < -25) this._fellOutOfWorld();
    }

    /** Jumped out of an aircraft: the canopy opens after a moment (see the air step). */
    openParachute() {
      this.parachute = { t: 0, open: false };
    }

    _landOn(g) {
      // A parachute landing is a gentle one.
      const impact = this.parachute && this.parachute.open ? Math.min(-this.vel.y, 5) : -this.vel.y;
      this.parachute = null;
      this.pos.y = g;
      this.vel.y = 0;
      this.grounded = true;
      this.state = 'ground';
      const fall = this._fallStartY - g;
      this.stats.longestFall = Math.max(this.stats.longestFall, fall);
      this._land = clamp((impact - 4) / 10, 0, 1);
      if (impact > 13) this._stagger = 0.35;
      if (impact > P.safeFallSpeed) {
        const dmg = (impact - P.safeFallSpeed) * P.fallDamagePerMs;
        this.damage(dmg, 'fall');
      }
      VH.events.emit('player:land', { impact, fall, surface: this.surface() });
    }

    /**
     * Look for a ledge in `dir`. Returns a climb plan, or null.
     * `reach` is how far above the feet a ledge may be.
     */
    _detectClimb(dir, hSpeed, reach, airborne) {
      const ph = this.physics;
      const feet = this.pos.y;
      const r = P.radius;
      // Look a little further ahead when running, so a slightly early press still vaults.
      // Probes every 20 cm so thin walls can't slip between them.
      const maxProbe = airborne || hSpeed < 2.5 ? r + 0.5 : r + 0.5 + hSpeed * 0.15;
      const probes = [];
      for (let d = r + 0.22; d < maxProbe + 0.001; d += 0.2) probes.push(d);
      for (const dist of probes) {
        const px = this.pos.x + dir.x * dist;
        const pz = this.pos.z + dir.z * dist;
        const top = ph.groundHeight(px, pz, feet + reach + 0.01);
        const rise = top - feet;
        const minRise = airborne ? 0.25 : P.stepHeight;
        if (rise <= minRise || rise > reach) continue;
        // A ledge, not a ramp: somewhere between Jay and the probe the ground must step up sharply.
        if (!this._stepBetween(dir, dist, feet + reach + 0.01)) continue;
        // Room to stand (or crouch) on top?
        const lx = this.pos.x + dir.x * (dist + r * 0.8);
        const lz = this.pos.z + dir.z * (dist + r * 0.8);
        const landTop = ph.groundHeight(lx, lz, top + 0.1);
        if (Math.abs(landTop - top) > 0.25) {
          // Too narrow to stand on — maybe it's a wall to vault over.
          if (!airborne && rise <= P.vaultMax && hSpeed > 2.5) {
            const vault = this._planVault(dir, top, dist);
            if (vault) return vault;
          }
          continue;
        }
        const fitsStanding = !ph.overlaps(lx, lz, r * 0.9, top + 0.05, top + P.height);
        const fitsCrouched = !ph.overlaps(lx, lz, r * 0.9, top + 0.05, top + P.crouchHeight);
        if (!fitsStanding && !fitsCrouched) continue;
        // Nothing blocking the body on the way up.
        if (ph.overlaps(this.pos.x, this.pos.z, r * 0.8, feet + 0.6, top + (fitsStanding ? P.height : P.crouchHeight))) continue;
        // Running at a low wall vaults it instead of stopping on top.
        if (!airborne && rise <= P.vaultMax && hSpeed > 3.2) {
          const vault = this._planVault(dir, top, dist);
          if (vault) return vault;
        }
        return {
          type: 'climb',
          from: this.pos.clone(),
          top,
          to: new THREE.Vector3(lx, top, lz),
          dir: { x: dir.x, z: dir.z },
          crouch: !fitsStanding,
          duration: 0.42 + 0.33 * (rise / P.climbMax),
          speedAfter: 0,
          t: 0,
        };
      }
      return null;
    }

    /** True if the ground along `dir` jumps up by 0.25 m or more within 12 cm, up to `dist` ahead. */
    _stepBetween(dir, dist, maxY) {
      const ph = this.physics;
      let prev = ph.groundHeight(this.pos.x, this.pos.z, maxY);
      for (let d = 0.12; d <= dist + 0.001; d += 0.12) {
        const h = ph.groundHeight(this.pos.x + dir.x * d, this.pos.z + dir.z * d, maxY);
        if (h - prev >= 0.25) return true;
        prev = h;
      }
      return false;
    }

    _planVault(dir, top, dist) {
      const ph = this.physics;
      for (const beyond of [1.0, 1.35]) {
        const bx = this.pos.x + dir.x * (dist + beyond);
        const bz = this.pos.z + dir.z * (dist + beyond);
        const g = ph.groundHeight(bx, bz, top + 0.05);
        if (g > top - 0.35) continue;
        if (ph.overlaps(bx, bz, P.radius * 0.9, g + 0.1, g + P.height)) continue;
        return {
          type: 'vault',
          from: this.pos.clone(),
          top,
          to: new THREE.Vector3(bx, Math.max(g, top - 0.2), bz),
          dir: { x: dir.x, z: dir.z },
          crouch: false,
          duration: 0.5,
          speedAfter: Math.min(5, Math.hypot(this.vel.x, this.vel.z)),
          t: 0,
        };
      }
      return null;
    }

    _startClimb(c) {
      this.climb = c;
      this.state = 'climb';
      this.grounded = false;
      this.vel.set(0, 0, 0);
      this.heading = Math.atan2(c.dir.x, c.dir.z);
      if (c.crouch) {
        this.wantCrouch = true;
        this.crouched = true;
      }
      if (c.type === 'vault') this.stats.vaults++;
      else this.stats.climbs++;
      VH.events.emit('player:climb', { type: c.type, height: c.top - c.from.y });
    }

    _climbStep(dt) {
      const c = this.climb;
      c.t = Math.min(1, c.t + dt / c.duration);
      const t = c.t;
      if (c.type === 'climb') {
        // Rise at the wall, then pull forward onto the top.
        const up = smoothstep(0, 0.62, t);
        const fwd = smoothstep(0.45, 1, t);
        this.pos.x = lerp(c.from.x, c.to.x, fwd);
        this.pos.z = lerp(c.from.z, c.to.z, fwd);
        this.pos.y = lerp(c.from.y, c.top + 0.02, up);
      } else {
        // Vault: up and over in one arc.
        const fwd = smoothstep(0, 1, t);
        const arc = Math.sin(Math.min(1, t * 1.25) * Math.PI);
        this.pos.x = lerp(c.from.x, c.to.x, fwd);
        this.pos.z = lerp(c.from.z, c.to.z, fwd);
        const base = lerp(c.from.y, c.to.y, fwd);
        this.pos.y = Math.max(base, lerp(c.from.y, c.top + 0.15, Math.min(1, t * 2.2))) + arc * 0.08;
      }
      if (t >= 1) {
        this.climb = null;
        if (c.type === 'vault') {
          this.state = 'air';
          this.grounded = false;
          this.vel.x = c.dir.x * c.speedAfter;
          this.vel.z = c.dir.z * c.speedAfter;
          this.vel.y = 0;
          this._fallStartY = this.pos.y;
        } else {
          this.state = 'ground';
          this.grounded = true;
          this.pos.y = this.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.1);
          this.vel.set(0, 0, 0);
        }
      }
    }

    _noclipStep(dt, camYaw) {
      const inp = this.input;
      const move = inp.moveVector();
      const pitch = this._camPitch || 0;
      const speed = inp.down('sprint') ? 60 : 18;
      const fx = Math.sin(camYaw) * Math.cos(pitch);
      const fz = Math.cos(camYaw) * Math.cos(pitch);
      const fy = Math.sin(pitch);
      this.pos.x += (fx * move.y - Math.cos(camYaw) * move.x) * speed * dt;
      this.pos.z += (fz * move.y + Math.sin(camYaw) * move.x) * speed * dt;
      this.pos.y += fy * move.y * speed * dt;
      if (inp.down('jump')) this.pos.y += speed * dt;
      if (inp.down('crouch')) this.pos.y -= speed * dt;
      inp.discard('jump');
      inp.discard('crouch');
      this.vel.set(0, 0, 0);
      this.heading = camYaw;
      this.grounded = false;
    }

    // ------------------------------------------------------------ health
    damage(amount, source) {
      if (this.godMode || this.state === 'dead' || amount <= 0) return;
      if (source !== 'fall') amount *= toughness().taken;
      this._sinceDamage = 0;
      let rest = amount;
      if (this.armor > 0 && source !== 'fall') {
        const absorbed = Math.min(this.armor, rest * 0.7);
        this.armor -= absorbed;
        rest -= absorbed;
      }
      this.health = Math.max(0, this.health - rest);
      VH.events.emit('player:damaged', { amount, source, health: this.health });
      if (this.health <= 0) this._die(source);
    }

    /** Knocked off his feet (hit by a car, an explosion, bailing out): falls, then gets up. */
    knock(damage, source) {
      if (this.state === 'dead' || this.noclip) return;
      this.state = 'knocked';
      this._knockT = 0;
      this.grounded = false;
      this.climb = null;
      this.damage(damage, source);
    }

    _knockStep(dt) {
      this._knockT += dt;
      if (!this.grounded) this.vel.y = Math.max(-40, this.vel.y - P.gravity * dt);
      const next = this._next;
      next.x = this.pos.x + this.vel.x * dt;
      next.z = this.pos.z + this.vel.z * dt;
      const res = this.physics.resolveCircle(next, P.radius, this.pos.y + 0.2, this.pos.y + 1.0, 0.3, this._resolveOut);
      if (res.hit) {
        const vn = this.vel.x * res.x + this.vel.z * res.z;
        if (vn < 0) {
          this.vel.x -= 1.4 * vn * res.x;
          this.vel.z -= 1.4 * vn * res.z;
        }
      }
      this.pos.x = next.x;
      this.pos.z = next.z;
      const prevY = this.pos.y;
      this.pos.y += this.vel.y * dt;
      const g = this._groundFootprint(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y) + 0.3);
      if (this.pos.y <= g) {
        this.pos.y = g;
        if (this.vel.y < -4) this.vel.y *= -0.25;
        else {
          this.vel.y = 0;
          this.grounded = true;
        }
        const f = Math.exp(-5.5 * dt);
        this.vel.x *= f;
        this.vel.z *= f;
      } else this.grounded = false;
      if (this.state === 'dead') return;
      if (this._knockT > 1.9 && this.grounded && Math.hypot(this.vel.x, this.vel.z) < 0.6) {
        this.state = 'ground';
        this.vel.set(0, 0, 0);
        this._land = 0.6;
      }
    }

    heal(amount) {
      this.health = Math.min(this.maxHealth, this.health + amount);
    }

    _die(source) {
      if (this.vehicle) this.vehicle = null;
      this.parachute = null;
      if (this._canopy) this._canopy.visible = false;
      this.state = 'dead';
      this._deadTimer = 0;
      this.vel.set(0, 0, 0);
      this.stats.deaths++;
      VH.events.emit('player:died', { source });
    }

    _fellOutOfWorld() {
      VH.events.emit('notify', { title: 'Back on solid ground', text: 'You fell out of the world, so you were put back.', icon: '↩' });
      this.teleport(this.spawnPoint.x, this.spawnPoint.z, this.spawnPoint.yaw);
    }

    /** Back from a ragdoll: the animation only writes some axes of each joint, so clear what the ragdoll twisted. */
    _clearRagdoll() {
      if (this._ragdoll) {
        for (const k of Object.keys(this.model.joints)) this.model.joints[k].rotation.set(0, 0, 0);
        this.model.root.rotation.set(0, this.heading, 0);
      }
      this._ragdoll = null;
      this._ragdollFinal = false;
    }

    /** Back on his feet where he is, at full health (retrying a job after being knocked out). */
    revive() {
      this._clearRagdoll();
      this.state = 'ground';
      this._deadTimer = 0;
      this.health = this.maxHealth;
      this.vel.set(0, 0, 0);
      this.model.root.rotation.set(0, this.heading, 0);
    }

    respawn() {
      this._clearRagdoll();
      this.spawn(this.spawnPoint);
      this.wantCrouch = false;
      this.crouched = false;
      this.model.root.rotation.set(0, this.heading, 0);
    }

    // ---------------------------------------------------------- rendering
    /** Called every frame with the fixed-step interpolation factor. */
    updateVisual(dt, alpha, lookPitch) {
      const rp = this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);
      this._stepOffset = damp(this._stepOffset, 0, 16, dt);
      if (Math.abs(this._stepOffset) > 0.5) this._stepOffset = 0;
      this.crouchAmount = damp(this.crouchAmount, this.crouched ? 1 : 0, 10, dt);
      this.aimAmount = damp(this.aimAmount, this.aiming ? 1 : 0, 14, dt);

      const root = this.model.root;
      // Alive again by any route (a job retry, a checkpoint, bail, a teleport),
      // not only the hospital: stand up straight, don't keep the ragdoll's pose.
      if (this._ragdoll && this.state !== 'dead') this._clearRagdoll();
      root.position.set(rp.x, rp.y + this._stepOffset + (this.visualLift || 0), rp.z);
      if (this.state === 'vehicle' && !this.entry) {
        root.visible = false;
        return rp;
      }
      if (this.state === 'knocked') {
        // Thrown down, then back up.
        const t = this._knockT;
        const down = smoothstep(0, 0.35, t) * (1 - smoothstep(1.6, 2.1, t));
        root.rotation.set(-1.45 * down, this.heading, 0);
        root.position.y += 0.15 * down;
        this.model.animate(dt, { speed: 0, grounded: false, vy: -4, crouch: 0, aim: 0, climb: -1, sprint: false, backwards: false, land: 0, lookPitch: 0 });
        return rp;
      }
      if (this.state === 'dead' && VH.Ragdoll) {
        // Down as a ragdoll, thrown away from whatever hit him last.
        if (!this._ragdoll) {
          root.rotation.set(0, this.heading, 0);
          const h = this.lastHitFrom;
          let ix = 0, iz = 0;
          if (h && VH.game && VH.game.time - h.t < 1.5) {
            const l = Math.hypot(this.pos.x - h.x, this.pos.z - h.z) || 1;
            ix = ((this.pos.x - h.x) / l) * 3.5;
            iz = ((this.pos.z - h.z) / l) * 3.5;
          }
          this._ragdoll = new VH.Ragdoll(this.model, this.physics, { vx: this.vel.x, vy: Math.min(this.vel.y, 4), vz: this.vel.z, hit: ix || iz ? { x: ix / 3.5, y: 0.15, z: iz / 3.5, power: 3.5 } : null });
          this._pooled = false;
        }
        const r = this._ragdoll;
        if (!r.settled || !this._ragdollFinal) {
          r.step(dt);
          r.apply(this.model);
          this._ragdollFinal = r.settled;
        }
        if (!this._pooled && (r.settled || r.t > 1.2)) {
          this._pooled = true;
          if (VH.game && VH.game.fx && VH.game.fx.bloodPool) VH.game.fx.bloodPool(r.pelvis.x, r.pelvis.y, r.pelvis.z, 1.6);
        }
        return rp;
      }
      if (this.state === 'dead') {
        // Collapse backwards.
        const t = smoothstep(0, 0.8, this._deadTimer);
        root.rotation.set(-1.45 * t, this.heading, 0);
        root.position.y += 0.15 * t;
      } else {
        root.rotation.set(0, lerpAngle(this.prevHeading, this.heading, alpha), 0);
      }

      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      const facingX = Math.sin(this.heading);
      const facingZ = Math.cos(this.heading);
      const backwards = this.aiming && (this.vel.x * facingX + this.vel.z * facingZ) < -0.3;
      this.model.animate(dt, {
        speed: this.entry && this.entry.speed !== undefined ? this.entry.speed : this.state === 'climb' ? 0 : hSpeed,
        grounded: this.grounded || this.state === 'climb',
        vy: this.vel.y,
        crouch: this.crouchAmount,
        aim: this.aimAmount,
        climb: this.climb ? this.climb.t : -1,
        sprint: this.sprinting,
        backwards,
        land: this._land,
        lookPitch,
        weaponPose: this.weaponPose,
        // Jay talks with his hands in scenes too.
        talk: this._talk = (this._talk || 0) + ((VH.game && VH.game.dialogue ? VH.game.dialogue.talkLevel('jay') : 0) - (this._talk || 0)) * Math.min(1, dt * 9),
        talkEnergy: VH.game && VH.game.dialogue ? VH.game.dialogue.talkEnergy('jay') : 0,
        // On the dance floor (club.js sets this.dancing to { style, beat, beatN }).
        dance: this.dancing ? 1 : 0,
        danceStyle: this.dancing ? this.dancing.style : 0,
        beat: this.dancing ? this.dancing.beat : undefined,
        beatN: this.dancing ? this.dancing.beatN : undefined,
        recoil: (this._recoil || 0) * (this._recoilKick || 1),
        swing: this._meleeSwing || 0,
        // Combat poses (combat.js sets these): reloading, drawing a weapon, winding up a throw, melee combos.
        reload: this._reload || 0,
        reloadStyle: this._reloadStyle || 0,
        reloadLoop: this._reloadLoop || 0,
        draw: this._draw || 0,
        throwWind: this._throwWind || 0,
        meleeCombo: this._meleeCombo || 0,
        meleeStyle: this._meleeStyle || 0,
        handsUp: this.parachute && this.parachute.open ? 0.85 : 0,
        // Getting into / out of a car or hauling a driver out (vehicles.js sets this.entry).
        board: this.entry ? this.entry.board : undefined,
        reach: this.entry ? this.entry.reach || 0 : 0,
        pull: this.entry ? this.entry.pull || 0 : 0,
      });
      this._updateCanopy(dt);
      if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 9);
      // A landed blow freezes the swing for a beat (hit-stop).
      if (this._hitStop > 0) this._hitStop -= dt;
      else if (this._meleeSwing > 0) this._meleeSwing = Math.max(0, this._meleeSwing - dt * (this._meleeRate || 3.2));
      else this._meleeCombo = 0;
      if (this._draw > 0) this._draw = Math.max(0, this._draw - dt * (this._drawRate || 3));
      return rp;
    }

    /** The parachute canopy over Jay's head (built the first time he needs one). */
    _updateCanopy(dt) {
      const open = !!(this.parachute && this.parachute.open);
      if (!open && !this._canopy) return;
      if (!this._canopy) {
        const g = new THREE.Group();
        const dome = new THREE.SphereGeometry(3.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
        dome.scale(1.25, 0.55, 0.85);
        const cols = [0xff6a1a, 0xf2f2ee, 0x1fa3a3];
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
        const c = new Float32Array(dome.attributes.position.count * 3);
        for (let i = 0; i < dome.attributes.position.count; i++) {
          const x = dome.attributes.position.getX(i);
          const col = new THREE.Color(cols[Math.floor((x + 4) / 1.35) % 3]).convertSRGBToLinear();
          c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
        }
        dome.setAttribute('color', new THREE.BufferAttribute(c, 3));
        const canopy = new THREE.Mesh(dome, mat);
        canopy.position.y = 4.4;
        canopy.castShadow = true;
        g.add(canopy);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
        const pts = [];
        for (const [x, z] of [[-3.6, -1.5], [3.6, -1.5], [-3.6, 1.5], [3.6, 1.5], [0, -2.5], [0, 2.5]]) pts.push(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(x, 4.5, z));
        g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        this.model.root.add(g);
        this._canopy = g;
        this._canopyK = 0;
      }
      this._canopyK = damp(this._canopyK || 0, open ? 1 : 0, open ? 5 : 9, dt);
      this._canopy.visible = this._canopyK > 0.02;
      this._canopy.scale.setScalar(Math.max(0.01, this._canopyK));
    }

    /** Where the camera should orbit around (interpolated feet + eye height). */
    focusPoint(out) {
      return out.set(this.renderPos.x, this.renderPos.y + this._stepOffset * 0.5, this.renderPos.z);
    }

    get inVehicle() {
      return this.state === 'vehicle' && !!this.vehicle;
    }

    get isDead() {
      return this.state === 'dead';
    }

    get deadTime() {
      return this._deadTimer;
    }

    get speed() {
      return Math.hypot(this.vel.x, this.vel.z);
    }
  }

  Player.PARAMS = P;
  VH.Player = Player;
})();
