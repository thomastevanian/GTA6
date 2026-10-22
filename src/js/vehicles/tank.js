/*
 * tank.js — the Bastion main battle tank (Fort Breakwater's motor pool).
 *
 * A Vehicle subclass picked by the type's kind (see vehicles.spawn). Tracks
 * instead of tyres: W/S drive, A/D turn the hull (on the spot, too). The
 * turret swings to wherever the view points, the gun lifts to the crosshair,
 * and the left mouse button fires a shell (one every few seconds); hold the
 * right button for the coaxial machine gun. Fifty-odd tonnes: cars get
 * shoved aside and crushed, bullets barely scratch it, and only explosions
 * really hurt.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, damp, moveTowards, wrapAngle } = VH.math;

  const G = 9.81;
  const RELOAD = 2.6; // seconds between shells
  const MAX_F = 15; // m/s forward (54 km/h)
  const MAX_R = 6;

  const SPEC = {
    id: 'bastion', kind: 'tank', name: 'Bastion MBT', make: 'Breakwater Arsenal', cls: 'tank',
    length: 9.6, width: 3.7, height: 2.9, mass: 52000, topSpeed: 28, accel: 0.4, grip: 1, seats: 3,
    wheelbase: 6.2, trackWidth: 3.1, wheelRadius: 0.4, siren: null,
    palette: [0x5d6b3c, 0x6b6545, 0x4b5320], military: true,
  };

  // ------------------------------------------------------------- model
  let MATS = null;
  function mats() {
    if (MATS) return MATS;
    MATS = {
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.24, 0.2) }),
      lampOn: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.2) }),
    };
    return MATS;
  }
  const GEO = new Map();

  function shadeHex(hex, k) {
    const r = Math.round(((hex >> 16) & 255) * k);
    const g = Math.round(((hex >> 8) & 255) * k);
    const b = Math.round((hex & 255) * k);
    return (r << 16) | (g << 8) | b;
  }

  /** Hull, turret and gun, built with the aircraft model kit (aircraft.js). */
  function buildGeometry(color) {
    const K = () => new VH.AircraftKit();
    const hull = K();
    const dark = 0x23251f;
    const steel = 0x3a3d36;
    const shade = shadeHex(color, 0.82);
    // Hull: a sloped glacis in front, flat deck, angled rear.
    hull.slab([[-3.9, 0.55], [3.35, 0.55], [4.05, 1.0], [3.45, 1.6], [-3.75, 1.6], [-3.95, 1.25]], -1.42, 1.42, color, 'zy');
    // Tracks, road wheels and skirts.
    for (const s of [1, -1]) {
      hull.box(0.62, 0.95, 7.95, s * 1.62, 0.55, -0.1, dark);
      for (let i = 0; i < 7; i++) hull.cyl(0.36, 0.36, 0.5, 12, s * 1.62, 0.42, -3.3 + i * 1.08, steel, 0, Math.PI / 2);
      hull.cyl(0.32, 0.32, 0.5, 12, s * 1.62, 0.78, 3.75, steel, 0, Math.PI / 2);
      hull.box(0.1, 0.55, 7.2, s * 1.95, 1.25, 0.1, shade);
      hull.box(0.3, 0.12, 0.5, s * 1.1, 1.66, -3.4, steel); // stowage
      hull.box(0.22, 0.18, 0.22, s * 1.2, 1.42, 3.55, 0x111111); // headlight housings
    }
    hull.box(2.2, 0.35, 0.9, 0, 1.78, -3.2, shade); // engine deck
    hull.box(1.9, 0.08, 1.5, 0, 1.97, -3.2, dark);
    // Turret: a faceted plan on a ring, with a commander's hatch and smoke launchers.
    const turret = K();
    turret.cyl(1.25, 1.25, 0.2, 18, 0, 0.0, 0, steel, Math.PI / 2);
    turret.slab([[-1.55, -2.0], [1.55, -2.0], [1.8, 0.3], [1.05, 1.95], [-1.05, 1.95], [-1.8, 0.3]], 0.05, 0.85, color, 'xz');
    turret.slab([[-1.3, -1.8], [1.3, -1.8], [1.5, 0.2], [0.9, 1.6], [-0.9, 1.6], [-1.5, 0.2]], 0.85, 1.0, shade, 'xz');
    turret.box(1.6, 0.3, 0.9, 0, 0.55, -2.3, shade); // bustle rack
    turret.cyl(0.38, 0.38, 0.22, 12, 0.6, 1.1, -0.5, steel, Math.PI / 2);
    turret.cyl(0.3, 0.3, 0.2, 12, -0.65, 1.05, -0.2, steel, Math.PI / 2);
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) turret.cyl(0.07, 0.07, 0.35, 6, s * (1.55 - i * 0.12), 0.75, 0.9 + i * 0.12, dark, -0.4, s * 0.5);
    turret.strut([-0.9, 1.0, -1.6], [-0.95, 3.3, -1.75], 0.02, dark);
    // Gun: mantlet, barrel, fume extractor, muzzle brake (points down +Z from the trunnion).
    const gun = K();
    gun.box(1.1, 0.7, 0.6, 0, 0, 0.2, color);
    gun.cyl(0.13, 0.15, 5.4, 12, 0, 0, 2.95, steel);
    gun.cyl(0.19, 0.19, 0.9, 12, 0, 0, 3.6, steel);
    gun.cyl(0.2, 0.2, 0.45, 12, 0, 0, 5.7, dark);
    gun.box(0.18, 0.12, 0.6, 0.45, 0.2, 0.5, dark); // coaxial MG
    return { hull: hull.geometry(), turret: turret.geometry(), gun: gun.geometry() };
  }

  class TankModel {
    constructor(opts, seed) {
      const pal = SPEC.palette;
      this.color = opts.color !== undefined && opts.color !== null ? opts.color : pal[Math.floor(VH.math.hash2(seed || 1, 31) * pal.length) % pal.length];
      let g = GEO.get(this.color);
      if (!g) {
        g = buildGeometry(this.color);
        GEO.set(this.color, g);
      }
      this.root = new THREE.Group();
      this.root.name = 'tank';
      this.body = new THREE.Group();
      this.root.add(this.body);
      this.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
      this.meshes = [];
      const add = (geo, parent) => {
        const m = new THREE.Mesh(geo, this.paint);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
        this.meshes.push(m);
        return m;
      };
      add(g.hull, this.body);
      this.turret = new THREE.Group();
      this.turret.position.set(0, 1.6, -0.3);
      this.body.add(this.turret);
      add(g.turret, this.turret);
      this.gun = new THREE.Group();
      this.gun.position.set(0, 0.45, 1.75);
      this.turret.add(this.gun);
      add(g.gun, this.gun);
      const M = mats();
      this.lamps = [1, -1].map((s) => {
        const l = new THREE.Mesh(LAMP_GEO, M.lamp);
        l.position.set(s * 1.2, 1.42, 3.67);
        this.body.add(l);
        return l;
      });
      this.wheels = [];
      this.anchors = {};
      this._lit = false;
    }

    setHeadlights(on) {
      if (on === this._lit) return;
      this._lit = on;
      const M = mats();
      for (const l of this.lamps) l.material = on ? M.lampOn : M.lamp;
    }

    setBrake() {}
    setReverse() {}
    setSiren() {
      return null;
    }

    setDamage(k) {
      this.paint.color.setScalar(1 - clamp(k, 0, 1) * 0.65);
    }

    setVisible(v) {
      this.root.visible = v;
    }

    setShadows(cast) {
      for (const m of this.meshes) m.castShadow = cast;
    }

    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      this.paint.dispose();
    }
  }
  const LAMP_GEO = new THREE.CircleGeometry(0.08, 10);

  // -------------------------------------------------------------- tank
  class Tank extends VH.Vehicle {
    constructor(system, typeId, opts) {
      super(system, typeId, opts);
      this.military = true;
      this.aimCamera = true; // camera.js: never swing the view (and the turret) back behind
      this.crosshair = true;
      this.topSpeed = MAX_F;
      this.turretYaw = 0;
      this.gunPitch = 0;
      this.reload = 0;
      this._mgT = 0;
      this._aimT = 0;
      this._aimYaw = 0;
      this._aimPitch = 0;
      this.voiceRange = 160;
      this.voiceRef = 18;
    }

    _buildModel(typeId, opts) {
      return new TankModel(opts, this.id);
    }

    playerControls(inp, dt, game) {
      const pad = inp.pad && inp.pad.connected ? inp.pad : null;
      let accel = (inp.down('moveForward') ? 1 : 0) - (inp.down('moveBack') ? 1 : 0);
      let steer = (inp.down('moveLeft') ? 1 : 0) - (inp.down('moveRight') ? 1 : 0);
      if (pad && (pad.rt > 0.05 || pad.lt > 0.05)) accel = pad.rt - pad.lt;
      if (pad && Math.abs(pad.move.x) > 0.05) steer = -pad.move.x;
      if (game.frozenControls) accel = steer = 0;
      this.input.accel = accel;
      this.input.steer = steer;
      this.input.handbrake = inp.down('jump') ? 1 : 0;
      if (inp.consume('lights')) this.lightsOn = !this.lightsOn;
      // Where the crosshair points: the turret and gun turn to it.
      this._aimT -= dt;
      if (this._aimT <= 0 && game.combat) {
        this._aimT = 0.05;
        const ray = game.combat._aimRay(0);
        const o = ray.o;
        const d = ray.d;
        const t0 = Math.max(0, (this.pos.x - o.x) * d.x + (this.pos.y - o.y) * d.y + (this.pos.z - o.z) * d.z + this.hz);
        const hit = game.combat.trace(o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0, d.x, d.y, d.z, 450, null, this);
        const t = t0 + hit.t;
        const px = o.x + d.x * t;
        const py = o.y + d.y * t;
        const pz = o.z + d.z * t;
        const pv = this._pivot();
        this._aimYaw = Math.atan2(px - pv.x, pz - pv.z);
        this._aimPitch = Math.atan2(py - pv.y, Math.hypot(px - pv.x, pz - pv.z));
      }
    }

    /** The trunnion, in the world. */
    _pivot() {
      const w = this.localToWorld(0, -0.3 + 1.75, this._pv || (this._pv = {}));
      w.y = this.pos.y + 1.6 + 0.45;
      return w;
    }

    fixedUpdate(dt) {
      this.prevPos.copy(this.pos);
      this.prevYaw = this.yaw;
      if (this.sleeping) return;
      const inp = this.input;
      if (this.wrecked || !this.driver) {
        inp.accel = 0;
        inp.steer = 0;
      }
      // Tracks: no sliding, turns on the spot.
      const tgt = inp.accel >= 0 ? inp.accel * MAX_F : inp.accel * MAX_R;
      const rate = Math.abs(tgt) > Math.abs(this.vF) && Math.sign(tgt) === Math.sign(this.vF || tgt) ? 3.2 : 6;
      this.vF = moveTowards(this.vF, inp.handbrake ? 0 : tgt, rate * dt);
      const turn = inp.steer * (0.95 - 0.4 * Math.min(1, Math.abs(this.vF) / MAX_F));
      this.omega = turn;
      this.yaw = wrapAngle(this.yaw + turn * dt);
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      // Pushed by a collision last step? Keep a little of it, then the tracks win.
      const along = this.vel.x * s + this.vel.z * c;
      const sideX = this.vel.x - s * along;
      const sideZ = this.vel.z - c * along;
      const keep = Math.exp(-8 * dt);
      this.vel.x = s * this.vF + sideX * keep;
      this.vel.z = c * this.vF + sideZ * keep;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      // Ground: follow it over kerbs and ramps, fall off ledges.
      this._ground4();
      const g = this._groundAvg;
      if (this.pos.y - g > 0.35 || this.vel.y > 0.5) {
        this.grounded = false;
        this.vel.y -= G * 1.2 * dt;
        this.pos.y += this.vel.y * dt;
        if (this.pos.y <= g) {
          const impact = -this.vel.y;
          this.pos.y = g;
          this.vel.y = 0;
          this.grounded = true;
          if (impact > 3) this.sys.onLand(this, impact, this.airTime);
        }
      } else {
        this.grounded = true;
        this.pos.y = g;
        this.vel.y = 0;
        const gr = this._ground;
        const front = (gr[0] + gr[1]) / 2;
        const rear = (gr[2] + gr[3]) / 2;
        const left = (gr[0] + gr[2]) / 2;
        const right = (gr[1] + gr[3]) / 2;
        this.pitch = damp(this.pitch, Math.atan2(rear - front, this.a + this.b), 10, dt);
        this.roll = damp(this.roll, Math.atan2(left - right, this.track), 10, dt);
      }
      this.sys.collideStatic(this);
      // Against a wall the tracks stall rather than grind on at full speed.
      this.vF = clamp(this.vel.x * s + this.vel.z * c, -MAX_R, MAX_F);
      this._crush(dt);
      // Turret and gun follow the aim.
      if (this.driver === 'player') {
        const want = VH.math.angleDelta(this.turretYaw, wrapAngle(this._aimYaw - this.yaw));
        this.turretYaw = wrapAngle(this.turretYaw + clamp(want, -1.1 * dt, 1.1 * dt));
        this.gunPitch = moveTowards(this.gunPitch, clamp(this._aimPitch, -0.12, 0.36), 0.7 * dt);
      }
      this.reload = Math.max(0, this.reload - dt);
      this._mgT -= dt;
      // Sound and the HUD.
      this.rpm = 0.15 + Math.min(1, Math.abs(this.vF) / MAX_F) * 0.6 + Math.abs(inp.accel) * 0.25;
      this.gear = 1;
      this.reversing = this.vF < -0.3;
      this.ax = 0;
      this._afterStep(dt);
    }

    /** Cars under the tracks get flattened. */
    _crush(dt) {
      if (Math.abs(this.vF) < 1.5) return;
      const ahead = this.vF > 0 ? 1 : -1;
      const p = this.localToWorld(0, ahead * (this.hz - 0.6), this._cp || (this._cp = {}));
      for (const o of this.sys.list) {
        if (o === this || o.wrecked || o.kind === 'tank' || Math.abs(o.pos.y - this.pos.y) > 2) continue;
        if (Math.hypot(o.pos.x - p.x, o.pos.z - p.z) > o.hz + 1.4) continue;
        o.damage(260 * dt * (1 + Math.abs(this.vF) / 5), this.driver === 'player' ? 'player' : null, 'crush');
        o.wake();
      }
    }

    damage(amount, source, kind) {
      // Bullets barely scratch it; bumps don't do much; explosions are what count.
      const k = kind === 'bullet' ? 0.06 : kind === 'blast' ? 0.5 : kind === 'crash' || !kind ? 0.2 : 0.35;
      super.damage(amount * k, source, kind);
    }

    updateVisual(dt, alpha, night) {
      super.updateVisual(dt, alpha, night);
      const m = this.model;
      m.turret.rotation.y = this.turretYaw;
      m.gun.rotation.x = -this.gunPitch;
      if (this._recoilT > 0) {
        this._recoilT = Math.max(0, this._recoilT - dt * 3);
        m.gun.position.z = 1.75 - this._recoilT * 0.5;
      }
    }

    /** The gun's direction and its muzzle, in the world. */
    _barrel(out) {
      const a = this.yaw + this.turretYaw;
      const cp = Math.cos(this.gunPitch);
      const d = out.d.set(Math.sin(a) * cp, Math.sin(this.gunPitch), Math.cos(a) * cp);
      const pv = this._pivot();
      out.m.set(pv.x + d.x * 6.0, pv.y + d.y * 6.0, pv.z + d.z * 6.0);
      return out;
    }

    fireWeapon(combat, inp, firing, pressed, dt) {
      const g = this.sys.game;
      const b = this._barrel(this._b || (this._b = { d: new THREE.Vector3(), m: new THREE.Vector3() }));
      if (pressed && this.reload <= 0) {
        this.reload = RELOAD;
        this._recoilT = 1;
        combat.thrown.push(new VH.Rocket(g, this, b.m, b.d, 190, 10, 380));
        g.fx.muzzle(b.m.x, b.m.y, b.m.z, true);
        if (g.fx.dust) g.fx.dust(b.m.x, this.pos.y + 0.3, b.m.z, 14);
        if (g.audio.explosion) g.audio.explosion(0.55, 0);
        if (g.audio.gunshot) g.audio.gunshot('sniper', 0, 1, false);
        g.cameraRig.addShake(0.45);
        this.vF -= 0.8;
        VH.events.emit('gunshot', { x: this.pos.x, z: this.pos.z, byPlayer: true, loud: true });
      }
      // Coaxial machine gun on the right button.
      if (inp.down('aim') && this._mgT <= 0) {
        this._mgT = 1 / 11;
        const d = b.d;
        const hit = combat.trace(b.m.x, b.m.y, b.m.z, d.x, d.y, d.z, 220, null, this);
        const x = b.m.x + d.x * hit.t;
        const y = b.m.y + d.y * hit.t;
        const z = b.m.z + d.z * hit.t;
        g.fx.tracer(b.m.x, b.m.y, b.m.z, x, y, z);
        if (hit.type === 'agent') {
          hit.agent.damage(18, 'player', 'bullet', { x, y, z, dx: d.x, dy: d.y, dz: d.z, head: hit.head });
          if (hit.agent.brain && hit.agent.brain.setAlert) hit.agent.brain.setAlert(hit.agent);
          g.fx.impact(x, y, z, -d.x, -d.y, -d.z, 'flesh');
          combat.hitMarkerT = 0.18;
        } else if (hit.type === 'car') {
          hit.v.damage(9, 'player', 'bullet');
          g.fx.impact(x, y, z, -d.x, 0, -d.z, 'car');
        } else if (hit.type === 'world') g.fx.impact(x, y, z, hit.hit.nx, hit.hit.ny, hit.hit.nz, 'concrete');
        if (g.audio.gunshot) g.audio.gunshot('rifle', 0, 0.8, false);
        VH.events.emit('gunshot', { x: this.pos.x, z: this.pos.z, byPlayer: true, loud: true });
      }
    }

    hudInfo() {
      return {
        kmh: Math.abs(this.vF) * 3.6,
        max: MAX_F * 3.6 * 1.2,
        gear: this.reload > 0 ? '…' : this.vF < -0.3 ? 'R' : 'D',
        bar: 1 - this.reload / RELOAD,
        barLabel: this.reload > 0 ? 'RELOADING' : 'CANNON READY',
      };
    }

    createEngineVoice(audio) {
      return audio.createEngine({ kind: 'tank', player: this.driver === 'player' });
    }

    updateEngineVoice(vo, gain, pan) {
      vo.update({ rpm: this.driver ? this.rpm : 0.12, throttle: Math.abs(this.input.accel), load: Math.abs(this.input.accel) * 0.8, gain, pan });
    }
  }

  VH.CarModels.TYPES.bastion = SPEC;
  VH.VehicleKinds = Object.assign(VH.VehicleKinds || {}, { tank: Tank });
  VH.Tank = Tank;
})();
