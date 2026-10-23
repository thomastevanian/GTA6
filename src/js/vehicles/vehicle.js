/*
 * vehicle.js — one car: tyre-model physics, suspension, damage and state.
 *
 * Physics runs on the game's fixed 60 Hz step, split into two substeps. It
 * is a "bicycle" model: each axle has a slip angle, and the lateral tyre
 * force follows a curve that peaks and then falls away. That is what makes
 * cars grip, understeer when pushed, and slide when the rear lets go.
 *
 *   - weight transfer under braking and throttle (lift-off oversteer)
 *   - a friction circle per axle (full throttle costs rear grip)
 *   - a handbrake that locks the rears for drifts, with a drift assist
 *     for the player that keeps slides controllable
 *   - speed-sensitive steering, and a kinematic blend at walking pace so
 *     parking and three-point turns don't jitter
 *   - four wheels sample the ground: kerbs, ramps and jumps, airtime,
 *     heavy landings
 *   - collisions against the static city (oriented boxes, separating
 *     axis test) with impulses, spin, scraping and damage
 *
 * Controls (vehicle.input, set by the player or an AI driver):
 *   accel     -1..1   W = +1; S brakes while rolling forward, then reverses
 *   steer     -1..1   positive steers left
 *   handbrake 0/1
 *   boost     0/1     nitro (player only)
 *
 * Local frame: +Z forward, +X left, +Y up. World heading a points along
 * (sin a, cos a); the car's left is (cos a, -sin a).
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep, wrapAngle, lerpAngle } = VH.math;
  const G = 9.81;
  const SUBSTEPS = 2;

  /** Handling character per vehicle class. */
  const CLASS = {
    sports: { rear: 0.62, steer: 1.0, assist: 0.55, down: 0.9, h: 0.42, brake: 1.15 },
    muscle: { rear: 1.0, steer: 0.92, assist: 0.45, down: 0.35, h: 0.52, brake: 0.95 },
    sedan: { rear: 0.6, steer: 0.95, assist: 0.7, down: 0.25, h: 0.55, brake: 1.0 },
    compact: { rear: 0.45, steer: 1.0, assist: 0.75, down: 0.2, h: 0.55, brake: 1.0 },
    taxi: { rear: 0.6, steer: 0.95, assist: 0.7, down: 0.25, h: 0.55, brake: 1.0 },
    police: { rear: 0.7, steer: 1.0, assist: 0.7, down: 0.55, h: 0.52, brake: 1.15 },
    van: { rear: 0.6, steer: 0.82, assist: 0.8, down: 0.1, h: 0.85, brake: 0.85 },
    pickup: { rear: 0.8, steer: 0.88, assist: 0.7, down: 0.15, h: 0.72, brake: 0.9 },
  };

  /** Tyre force curve: rises to 1 at the peak slip, then falls away gently. */
  function tyre(x) {
    const ax = Math.abs(x);
    const y = ax < 1 ? ax * (2 - ax) : 1 - 0.22 * Math.min(1, (ax - 1) / 2.5);
    return x < 0 ? -y : y;
  }

  function approach(cur, target, maxStep) {
    if (cur < target) return Math.min(target, cur + maxStep);
    return Math.max(target, cur - maxStep);
  }

  function typeSpec(id) {
    const T = VH.CarModels.TYPES;
    if (Array.isArray(T)) return T.find((t) => t.id === id);
    return T[id];
  }

  let nextId = 1;

  class Vehicle {
    constructor(system, typeId, opts) {
      opts = opts || {};
      this.id = nextId++;
      this.sys = system;
      this.type = typeId;
      this.spec = typeSpec(typeId);
      if (!this.spec) throw new Error('Unknown vehicle type ' + typeId);
      const s = this.spec;
      // 'car' for everything on wheels; aircraft and tanks (aircraft.js,
      // tank.js) subclass Vehicle and build their own models.
      this.kind = s.kind || 'car';
      this.model = this._buildModel(typeId, opts);
      system.scene.add(this.model.root);
      this.name = s.name;
      this.cls = s.cls;
      this.tune = CLASS[s.cls] || CLASS.sedan;
      this.isPolice = s.cls === 'police';

      // Dimensions and mass.
      this.hx = s.width / 2;
      this.hz = s.length / 2;
      this.height = s.height;
      this.mass = s.mass || 1400;
      this.inertia = (this.mass * (s.length * s.length + s.width * s.width)) / 12 * 1.15;
      this.wheelbase = s.wheelbase;
      this.track = s.trackWidth;
      this.a = s.wheelbase / 2; // CG to front axle
      this.b = s.wheelbase / 2; // CG to rear axle
      this.wheelRadius = s.wheelRadius;
      this.topSpeed = clamp(s.topSpeed || 45, 28, 72);
      this.accelG = 0.38 + 0.62 * clamp(s.accel === undefined ? 0.5 : s.accel, 0, 1);
      this.mu = 0.95 + 0.5 * clamp(s.grip === undefined ? 0.5 : s.grip, 0, 1);

      // State.
      this.pos = new THREE.Vector3();
      this.prevPos = new THREE.Vector3();
      this.renderPos = new THREE.Vector3();
      this.vel = new THREE.Vector3(); // world, m/s (y used in the air)
      this.yaw = 0;
      this.prevYaw = 0;
      this.renderYaw = 0;
      this.omega = 0; // yaw rate, + = turning left
      this.steer = 0; // front wheel angle, + = left
      this.input = { accel: 0, steer: 0, handbrake: 0, boost: 0 };
      this.grounded = true;
      this.airTime = 0;
      this.pitch = 0; // terrain/air pitch (rad, + = nose down)
      this.roll = 0; // terrain roll (rad)
      this._visPitch = 0;
      this._visPitchV = 0;
      this._visRoll = 0;
      this._visRollV = 0;
      this._bounce = 0;
      this._bounceV = 0;
      this.ax = 0; // longitudinal acceleration (for weight transfer and body pitch)
      this.aL = 0; // lateral acceleration
      this.vF = 0;
      this.vL = 0;
      this.slipRear = 0;
      this.slipFront = 0;
      this.skid = [0, 0, 0, 0]; // per-wheel skid intensity for marks and sound
      this.wheelSpin = 0;
      this.surface = 'asphalt';
      this.drifting = 0;
      this.braking = false;
      this.reversing = false;

      // Engine (for sound): a simple five-speed box.
      this.gear = 1;
      this.rpm = 0.1;
      this._shiftTimer = 0;

      // Ownership and life.
      this.driver = null; // 'player' | 'ai' | null
      this.controller = null; // AI controller with update(vehicle, dt)
      this.role = opts.role || 'traffic'; // traffic | parked | police | mission | player
      this.health = 1000;
      this.wrecked = false;
      this.burning = 0;
      this.sleeping = !!opts.sleeping;
      this.lightsOn = false;
      this.siren = false;
      this.sirenTime = 0;
      this.horn = false;
      this.persistent = !!opts.persistent; // never despawned by streaming
      this.lastHitBy = null;
      this.lastImpact = 0;
      this.spawnTime = system.time;
      this.boostFx = 0;

      this._wheelPos = [
        { x: this.track / 2, z: this.a }, // FL (left is +X)
        { x: -this.track / 2, z: this.a }, // FR
        { x: this.track / 2, z: -this.b }, // RL
        { x: -this.track / 2, z: -this.b }, // RR
      ];
      this._ground = [0, 0, 0, 0];
      this._corner = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
      this.model.setShadows(true);
    }

    /** The 3D model (a CarModels car; other kinds override this). */
    _buildModel(typeId, opts) {
      return VH.CarModels.build(typeId, { color: opts.color, seed: opts.seed || this.id * 7919, lod: opts.lod || 0 });
    }

    // ------------------------------------------------------------ setup
    place(x, z, heading, y) {
      const g = y !== undefined ? y : this.sys.physics.groundHeight(x, z, 50);
      this.pos.set(x, g, z);
      this.prevPos.copy(this.pos);
      this.renderPos.copy(this.pos);
      this.yaw = this.prevYaw = this.renderYaw = heading;
      this.vel.set(0, 0, 0);
      this.omega = 0;
      this.steer = 0;
      this.grounded = true;
      this.pitch = this.roll = 0;
      this._syncModel(1);
    }

    /** Give the car a speed along its heading (spawning traffic already moving). */
    setSpeed(v) {
      this.vel.x = Math.sin(this.yaw) * v;
      this.vel.z = Math.cos(this.yaw) * v;
    }

    get speed() {
      return Math.hypot(this.vel.x, this.vel.z);
    }

    get forwardX() {
      return Math.sin(this.yaw);
    }

    get forwardZ() {
      return Math.cos(this.yaw);
    }

    /** World position of a point given in the car's local frame (x = left, z = forward). */
    localToWorld(lx, lz, out) {
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      const o = out || {};
      o.x = this.pos.x + lx * c + lz * s;
      o.z = this.pos.z - lx * s + lz * c;
      return o;
    }

    /** Local coordinates (x = left, z = forward) of a world point. */
    worldToLocal(x, z, out) {
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      const dx = x - this.pos.x;
      const dz = z - this.pos.z;
      const o = out || {};
      o.x = dx * c - dz * s;
      o.z = dx * s + dz * c;
      return o;
    }

    wake() {
      this.sleeping = false;
    }

    // --------------------------------------------------------- simulation
    fixedUpdate(dt) {
      this.prevPos.copy(this.pos);
      this.prevYaw = this.yaw;
      if (this.sleeping) return;
      if (this.wrecked) {
        this.input.accel = 0;
        this.input.steer = 0;
        this.input.handbrake = 1;
        this.input.boost = 0;
      }
      const h = dt / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) this._substep(h);
      this._engine(dt);
      this._afterStep(dt);
    }

    _substep(dt) {
      const inp = this.input;
      const cy = Math.cos(this.yaw);
      const sy = Math.sin(this.yaw);
      // fwd = (sy, cy), left = (cy, -sy)
      const vF = this.vel.x * sy + this.vel.z * cy;
      const vL = this.vel.x * cy - this.vel.z * sy;
      const speed = Math.abs(vF);
      const m = this.mass;
      const T = this.tune;
      const player = this.driver === 'player';

      // Steering: less lock at speed, eased toward the target.
      const lock = lerp(0.62, 0.15, smoothstep(4, 46, speed)) * T.steer;
      let target = clamp(inp.steer, -1, 1) * lock;
      if (player && this.grounded && speed > 6) {
        // Drift assist: when the tail is out, nudge the wheels into the slide.
        const slide = Math.atan2(vL, speed);
        if (Math.abs(slide) > 0.12) target = clamp(target + slide * 0.55, -0.7, 0.7);
      }
      const rate = Math.abs(target) < Math.abs(this.steer) ? 4.8 : 3.4;
      this.steer = approach(this.steer, target, rate * dt);
      const delta = this.steer;
      const sd = Math.sin(delta);
      const cd = Math.cos(delta);

      if (!this.grounded) {
        // Ballistic: gravity, a little air drag, a slow pitch toward the flight path.
        this.vel.y -= G * 1.45 * dt;
        this.vel.x *= 1 - 0.02 * dt;
        this.vel.z *= 1 - 0.02 * dt;
        this.omega *= 1 - 0.8 * dt;
        this.yaw = wrapAngle(this.yaw + this.omega * dt);
        this.pitch = lerp(this.pitch, clamp(-Math.atan2(this.vel.y, Math.max(4, speed)) * 0.8, -0.5, 0.6), 1 - Math.exp(-2.2 * dt));
        this.roll *= 1 - 1.5 * dt;
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        this.pos.y += this.vel.y * dt;
        this._ground4();
        const g = this._groundAvg;
        if (this.pos.y <= g) this._land(g);
        this.vF = vF;
        this.vL = vL;
        this.sys.collideStatic(this);
        return;
      }

      // Throttle, braking, reverse.
      let accel = clamp(inp.accel, -1, 1);
      let drive = 0;
      let brake = 0;
      this.reversing = false;
      if (accel > 0) {
        if (vF < -1.2) brake = accel;
        else drive = accel;
      } else if (accel < 0) {
        if (vF > 1.2) brake = -accel;
        else {
          drive = accel; // reverse
          this.reversing = true;
        }
      }
      this.braking = brake > 0.1;
      const boosting = inp.boost > 0 && drive > 0 && this.sys.boostAvailable(this);
      this.boostFx = boosting ? 1 : Math.max(0, this.boostFx - dt * 3);
      const vt = this.topSpeed * (boosting ? 1.2 : 1) * (this.topSpeedBoost || 1);
      let engineF = 0;
      if (drive > 0) {
        const r = clamp(vF / vt, 0, 1.2);
        engineF = drive * m * G * this.accelG * Math.max(0, 1 - Math.pow(r, 2.6)) * (boosting ? 1.75 : 1);
        if (this._shiftTimer > 0) engineF *= 0.55;
      } else if (drive < 0) {
        const r = clamp(-vF / 9, 0, 1.2);
        engineF = drive * m * G * 0.45 * Math.max(0, 1 - r * r);
      }

      // Axle loads with weight transfer and a touch of downforce.
      const L = this.wheelbase;
      const down = T.down * 0.0045 * m * speed * speed * 0.1;
      let NF = m * G * (this.b / L) - (m * this.ax * T.h) / L + down * 0.45;
      let NR = m * G * (this.a / L) + (m * this.ax * T.h) / L + down * 0.55;
      NF = Math.max(NF, m * G * 0.12);
      NR = Math.max(NR, m * G * 0.12);
      let mu = this.mu * (this.surface === 'grass' ? 0.68 : this.surface === 'gravel' ? 0.78 : 1);
      if (this.burning > 0 || this.wrecked) mu *= 0.8;

      // Longitudinal forces per axle.
      let FxF = engineF * (1 - T.rear);
      let FxR = engineF * T.rear;
      const brakeF = brake * mu * m * G * 0.95 * T.brake;
      const sgn = vF >= 0 ? 1 : -1;
      if (brake > 0) {
        FxF -= sgn * brakeF * 0.62;
        FxR -= sgn * brakeF * 0.38;
      }
      const hand = inp.handbrake > 0;
      if (hand) FxR -= sgn * mu * NR * 0.55 * Math.min(1, speed / 2);
      // Rolling resistance and engine braking; aerodynamic drag.
      const coast = drive === 0 ? 0.055 : 0.012;
      const resist = -sgn * m * G * coast * Math.min(1, speed / 2.5) - 0.42 * vF * speed;

      // Slip angles at each axle, in the wheel's own frame.
      const latF0 = vL + this.omega * this.a;
      const lonF = latF0 * sd + vF * cd;
      const latF = latF0 * cd - vF * sd;
      const latR = vL - this.omega * this.b;
      const alphaF = Math.atan2(latF, Math.max(Math.abs(lonF), 0.8));
      const alphaR = Math.atan2(latR, Math.max(Math.abs(vF), 0.8));
      const peak = 0.15;
      let rearGrip = 1;
      if (hand) rearGrip = player ? 0.42 : 0.5;
      else if (this.drifting > 0 && player) rearGrip = lerp(1, 0.78, this.drifting);
      let FyF = -mu * NF * tyre(alphaF / peak);
      let FyR = -mu * NR * rearGrip * tyre(alphaR / peak);

      // Friction circles.
      const capF = mu * NF;
      const capR = mu * NR * (hand ? 0.9 : 1);
      let t = Math.hypot(FxF, FyF);
      if (t > capF) {
        FxF *= capF / t;
        FyF *= capF / t;
      }
      t = Math.hypot(FxR, FyR);
      if (t > capR) {
        FxR *= capR / t;
        FyR *= capR / t;
      }
      this.slipFront = Math.abs(alphaF);
      this.slipRear = Math.abs(alphaR);

      // Sum in the local frame (x = left, z = forward).
      const frontL = FxF * sd + FyF * cd;
      const frontF = FxF * cd - FyF * sd;
      let FL = frontL + FyR;
      let FF = frontF + FxR + resist;
      let torque = this.a * frontL - this.b * FyR;

      // Arcade stability: some extra lateral bite and yaw damping, relaxed in a slide.
      const assist = T.assist * (player ? 0.55 : 1) * (hand ? 0.15 : 1) * (1 - this.drifting * 0.6);
      FL += -vL * m * assist * 1.6;
      torque += -this.omega * this.inertia * (hand ? 0.15 : 0.55) * (player ? 0.7 : 1);

      // Integrate in world space.
      const wx = cy * FL + sy * FF;
      const wz = -sy * FL + cy * FF;
      this.vel.x += (wx / m) * dt;
      this.vel.z += (wz / m) * dt;
      this.omega += (torque / this.inertia) * dt;
      this.omega = clamp(this.omega, -3.6, 3.6);

      // At walking pace, blend to kinematic steering (no jitter, no sideways creep).
      const nvF = this.vel.x * sy + this.vel.z * cy;
      const nvL = this.vel.x * cy - this.vel.z * sy;
      const w = smoothstep(1.2, 4.5, Math.abs(nvF));
      if (w < 1) {
        const omegaKin = (nvF * Math.tan(delta)) / L;
        this.omega = lerp(omegaKin, this.omega, w);
        const vLk = nvL * Math.exp(-12 * dt);
        const newL = lerp(vLk, nvL, w);
        let newF = nvF;
        // Stop cleanly instead of creeping when braking to a halt.
        if (brake > 0 && Math.abs(newF) < brakeF / m * dt * 1.5) newF = 0;
        if (drive === 0 && brake === 0 && Math.abs(newF) < 0.25) newF *= 0.8;
        this.vel.x = sy * newF + cy * newL;
        this.vel.z = cy * newF - sy * newL;
      }
      this.yaw = wrapAngle(this.yaw + this.omega * dt);

      this.ax = lerp(this.ax, FF / m, 1 - Math.exp(-10 * dt));
      this.aL = lerp(this.aL, FL / m, 1 - Math.exp(-10 * dt));
      this.vF = nvF;
      this.vL = nvL;

      // Drift state (player): sustained while sliding with throttle.
      const sliding = Math.abs(Math.atan2(nvL, Math.max(3, Math.abs(nvF)))) > 0.2 && Math.abs(nvF) > 7;
      if (player) {
        if ((hand || this.drifting > 0) && sliding && drive > 0.3) this.drifting = Math.min(1, this.drifting + dt * 3);
        else this.drifting = Math.max(0, this.drifting - dt * (sliding ? 0.8 : 2.5));
      }

      // Skid intensity per wheel.
      const skidF = smoothstep(0.18, 0.5, this.slipFront) * smoothstep(3, 8, speed);
      let skidR = smoothstep(0.16, 0.45, this.slipRear) * smoothstep(3, 8, speed);
      if (hand && speed > 3) skidR = Math.max(skidR, 0.8);
      if (drive > 0.8 && speed < 7 && this.tune.rear > 0.55 && this.accelG > 0.7) skidR = Math.max(skidR, 0.7 * (1 - speed / 7)); // launch
      if (brake > 0.85 && speed > 8) {
        this.skid[0] = this.skid[1] = Math.max(skidF, 0.55);
        this.skid[2] = this.skid[3] = Math.max(skidR, 0.5);
      } else {
        this.skid[0] = this.skid[1] = skidF;
        this.skid[2] = this.skid[3] = skidR;
      }

      // Move, then settle on the ground.
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this._ground4();
      const g = this._groundAvg;
      const drop = this.pos.y - g;
      if (drop > 0.32) {
        // The ground fell away (a ramp's lip, a ledge): fly.
        this.grounded = false;
        this.airTime = 0;
        this.vel.y = Math.max(this.vel.y, 0);
      } else {
        const vyGround = (g - this.pos.y) / dt;
        this.vel.y = lerp(this.vel.y, clamp(vyGround, -20, 30), 0.5);
        this.pos.y = g;
        // Terrain pitch and roll from the wheel heights.
        const gFront = (this._ground[0] + this._ground[1]) / 2;
        const gRear = (this._ground[2] + this._ground[3]) / 2;
        const gLeft = (this._ground[0] + this._ground[2]) / 2;
        const gRight = (this._ground[1] + this._ground[3]) / 2;
        this.pitch = lerp(this.pitch, -Math.atan2(gFront - gRear, L), 1 - Math.exp(-18 * dt));
        this.roll = lerp(this.roll, Math.atan2(gLeft - gRight, this.track), 1 - Math.exp(-18 * dt));
      }
      this.sys.collideStatic(this);
    }

    /** Ground height under the four wheels (and their average). */
    _ground4() {
      const ph = this.sys.physics;
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      const maxY = this.pos.y + Vehicle.STEP;
      let sum = 0;
      let surfaceCol = null;
      for (let i = 0; i < 4; i++) {
        const w = this._wheelPos[i];
        const x = this.pos.x + w.x * c + w.z * s;
        const z = this.pos.z - w.x * s + w.z * c;
        const gh = ph.groundHeight(x, z, maxY);
        if (i === 0) surfaceCol = ph.lastGround;
        this._ground[i] = gh;
        sum += gh;
      }
      // The body can rest on a raised surface under its middle (a car roof, a ramp crest).
      const mid = ph.groundHeight(this.pos.x, this.pos.z, maxY);
      this._groundAvg = Math.max(sum / 4, mid - 0.25);
      this._surfaceCol = surfaceCol;
    }

    _land(g) {
      const impact = -this.vel.y;
      this.pos.y = g;
      this.grounded = true;
      this.vel.y = 0;
      this._bounceV -= Math.min(4, impact * 0.25);
      if (impact > 11) this.damage((impact - 11) * 28, null, 'landing');
      this.sys.onLand(this, impact, this.airTime);
      this.airTime = 0;
    }

    /** Gearbox and engine speed (sound only). */
    _engine(dt) {
      const v = Math.abs(this.vF);
      const vt = this.topSpeed;
      const shifts = [0, 0.18, 0.36, 0.56, 0.78, 1.2];
      if (this._shiftTimer > 0) this._shiftTimer -= dt;
      const r = v / vt;
      let gear = this.gear;
      if (this.reversing) gear = 1;
      else {
        while (gear < 5 && r > shifts[gear] * 0.98) gear++;
        while (gear > 1 && r < shifts[gear - 1] * 0.82) gear--;
      }
      if (gear !== this.gear) {
        if (gear > this.gear && this.input.accel > 0.5) {
          this._shiftTimer = 0.12;
          this.sys.onGearShift(this);
        }
        this.gear = gear;
      }
      const lo = shifts[gear - 1];
      const hi = shifts[gear];
      let target = 0.12 + 0.88 * clamp((r - lo * 0.8) / (hi - lo * 0.8), 0, 1);
      const acc = Math.max(0, this.input.accel);
      // Wheelspin, handbrake revs and air revs.
      if (!this.grounded) target = lerp(target, 0.35 + acc * 0.6, 0.6);
      if (this.skid[2] > 0.5 && acc > 0.5) target = Math.max(target, 0.75);
      if (this.speed < 1 && acc === 0) target = 0.1;
      if (this.wrecked) target = 0;
      this.rpm = lerp(this.rpm, target, 1 - Math.exp(-(target > this.rpm ? 9 : 5) * dt));
    }

    _afterStep(dt) {
      if (!this.grounded) this.airTime += dt;
      // Visual suspension: body pitch/roll springs driven by accelerations.
      const k = 90;
      const c = 12;
      const pitchT = clamp(-this.ax * 0.011, -0.07, 0.07);
      const rollT = clamp(this.aL * 0.013, -0.075, 0.075);
      this._visPitchV += (k * (pitchT - this._visPitch) - c * this._visPitchV) * dt;
      this._visPitch += this._visPitchV * dt;
      this._visRollV += (k * (rollT - this._visRoll) - c * this._visRollV) * dt;
      this._visRoll += this._visRollV * dt;
      this._bounceV += (-140 * this._bounce - 11 * this._bounceV) * dt;
      this._bounce += this._bounceV * dt;
      this.wheelSpin += (this.vF / this.wheelRadius) * dt;
      if (this.skid[2] > 0.6 && this.input.accel > 0.5 && this.speed < 8) this.wheelSpin += 25 * dt; // burnout
      // Fire: burns down, then explodes.
      if (this.burning > 0 && !this.wrecked) {
        this.burning += dt;
        if (this.burning > 7) this.explode();
      }
      if (this.siren) this.sirenTime += dt;
    }

    // ------------------------------------------------------------- damage
    damage(amount, source, kind) {
      if (this.wrecked || amount <= 0) return;
      // Story cars that must survive are tougher, and nearly bulletproof while
      // parked: losing Lulu to a stray round while Jay is on foot isn't fair.
      if (this.damageScale) amount *= this.damageScale * (this.driver === 'player' ? 1 : 0.25);
      else if (this.type === 'bulwark') amount *= 0.45; // armoured
      this.health -= amount;
      if (source) this.lastHitBy = source;
      if (this.health < 150 && this.burning === 0) this.burning = 0.001;
      if (this.health <= 0) {
        this.health = 0;
        this.explode();
      }
      this.model.setDamage(clamp(1 - this.health / 1000, 0, 1) * 0.9);
      void kind;
    }

    /** Good as new (a respawn hands Jay his car back fixed). Not for wrecks. */
    repair() {
      if (this.wrecked) return;
      this.health = 1000;
      this.burning = 0;
      this.model.setDamage(0);
    }

    explode() {
      if (this.wrecked) return;
      this.wrecked = true;
      this.burning = 0;
      this.health = 0;
      this.siren = false;
      this.model.setDamage(1);
      this.model.setHeadlights(false);
      this.model.setBrake(false);
      if (this.isPolice) this.model.setSiren(null);
      this.vel.y = 4.5;
      this.grounded = false;
      this.omega += (Math.random() - 0.5) * 2;
      this.sys.onExplode(this);
    }

    // ------------------------------------------------------------- visuals
    /** Called every frame with the fixed-step interpolation factor. */
    updateVisual(dt, alpha, night) {
      this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);
      this.renderYaw = lerpAngle(this.prevYaw, this.yaw, alpha);
      this._syncModel(alpha);
      const m = this.model;
      m.setHeadlights(!this.wrecked && (this.lightsOn || (night > 0.35 && this.driver !== null) || (night > 0.35 && this.role !== 'parked')));
      m.setBrake(!this.wrecked && (this.braking || (this.driver && this.speed < 0.5 && this.role !== 'parked')));
      m.setReverse(!this.wrecked && this.reversing && this.vF < -0.5);
      if (this.isPolice) m.setSiren(this.siren && !this.wrecked ? this.sirenTime : null);
    }

    _syncModel() {
      const m = this.model;
      const root = m.root;
      root.position.copy(this.renderPos);
      root.rotation.y = this.renderYaw;
      // Body: terrain attitude plus the suspension springs.
      m.body.rotation.x = this.pitch + this._visPitch;
      m.body.rotation.z = this.roll + this._visRoll;
      m.body.position.y = this._bounce * 0.12;
      const wheels = m.wheels;
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (w.front) w.pivot.rotation.y = this.steer;
        w.spin.rotation.x = this.wheelSpin;
      }
    }

    dispose() {
      this.sys.scene.remove(this.model.root);
      this.model.dispose();
    }
  }

  Vehicle.STEP = 0.42; // ledges up to this height are driven over (kerbs, stairs); higher ones are walls
  Vehicle.CLASS = CLASS;
  Vehicle.typeSpec = typeSpec;
  VH.Vehicle = Vehicle;
})();
