/*
 * boat.js — boats on the bay (OWNER: Account B): the Squall speedboat and
 * the Sprite jet ski. A Vehicle subclass picked by the type's kind (see
 * vehicles.spawn), like the tank: W/S throttle and reverse, A/D steer (it
 * only bites with some speed, and the stern slides out in a hard turn).
 * The hull floats at the waterline and bobs; at speed the bow lifts onto
 * the plane and it leans into turns. The shore stops it: it bumps off the
 * seawall and the quays, and a boat dragged onto land just sits there.
 *
 * Also VH.Marina, a small world system: boats moored along the seawall, the
 * pier and the docks (fixed spots: they come back), the Bay Sprint boat race
 * (an aircraft-races.js course of buoy rings), and since Jay can't swim, a
 * fall into the bay puts him back on the seawall.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, damp, moveTowards, wrapAngle } = VH.math;

  const TYPES = {
    squall: {
      spec: {
        id: 'squall', kind: 'boat', name: 'Squall', make: 'Kobo Marine', cls: 'boat',
        length: 7.2, width: 2.5, height: 1.5, mass: 1900, topSpeed: 30, accel: 0.7, grip: 0.5, seats: 2,
        wheelbase: 4, trackWidth: 2, wheelRadius: 0.4, siren: null,
        palette: [0xf2f2ee, 0xc8102e, 0x1d4fb8, 0x151618, 0xffc400, 0x1fa3a3],
      },
      maxF: 27, maxR: 5, turn: 1.15, draft: 0.38, grip: 1.7, voice: 'muscle',
    },
    sprite: {
      spec: {
        id: 'sprite', kind: 'boat', name: 'Sprite', make: 'Kobo Marine', cls: 'boat',
        length: 3.1, width: 1.2, height: 1.1, mass: 380, topSpeed: 26, accel: 0.9, grip: 0.6, seats: 1,
        wheelbase: 2, trackWidth: 1, wheelRadius: 0.3, siren: null,
        palette: [0xffc400, 0x1fa3a3, 0xff4f8b, 0xf2f2ee, 0x7d3cff],
      },
      maxF: 24, maxR: 3, turn: 1.9, draft: 0.22, grip: 1.2, voice: 'compact',
    },
  };

  // ------------------------------------------------------------- model
  const GEO = new Map();

  function shade(hex, k) {
    return (Math.round(((hex >> 16) & 255) * k) << 16) | (Math.round(((hex >> 8) & 255) * k) << 8) | Math.round((hex & 255) * k);
  }

  function buildGeometry(type, color) {
    const K = new VH.AircraftKit();
    const white = 0xf2f2ee;
    const dark = 0x1c1e22;
    const glass = 0x9fc6e0;
    if (type === 'sprite') {
      // A jet ski: a pointed hull, a seat, handlebars.
      K.slab([[-0.55, -1.5], [0.55, -1.5], [0.6, 0.4], [0.3, 1.3], [0, 1.55], [-0.3, 1.3], [-0.6, 0.4]], 0, 0.45, color, 'xz');
      K.slab([[-0.5, -1.4], [0.5, -1.4], [0.52, 0.3], [0.25, 1.15], [-0.25, 1.15], [-0.52, 0.3]], 0.45, 0.6, white, 'xz');
      K.box(0.42, 0.22, 1.1, 0, 0.72, -0.55, dark); // seat
      K.box(0.5, 0.28, 0.5, 0, 0.74, 0.45, color); // steering column
      K.box(0.85, 0.06, 0.06, 0, 0.95, 0.55, dark); // handlebar
      K.box(0.9, 0.1, 0.14, 0, 0.12, -1.45, shade(color, 0.7)); // stern
      return K.geometry();
    }
    // The Squall: a deep-V runabout with a wraparound screen and an outboard.
    const plan = [[-1.2, -3.55], [1.2, -3.55], [1.25, 0.8], [0.85, 2.6], [0.3, 3.45], [0, 3.6], [-0.3, 3.45], [-0.85, 2.6], [-1.25, 0.8]];
    K.slab(plan, 0, 0.55, white, 'xz'); // hull bottom (white below the stripe)
    K.slab(plan, 0.55, 0.95, color, 'xz'); // topsides in the boat's colour
    K.slab(plan.map(([x, z]) => [x * 0.94, z * 0.97]), 0.95, 1.0, white, 'xz'); // gunwale
    K.slab([[-1.0, -3.2], [1.0, -3.2], [1.05, 0.7], [-1.05, 0.7]], 0.98, 1.02, shade(0xd8c8a0, 0.9), 'xz'); // teak deck
    K.slab([[-0.75, 0.7], [0.75, 0.7], [0.6, 2.4], [0, 3.1], [-0.6, 2.4]], 0.99, 1.08, white, 'xz'); // foredeck
    // Windscreen, console and seats.
    K.box(1.9, 0.5, 0.08, 0, 1.3, 0.75, glass, -0.35);
    K.box(0.7, 0.6, 0.5, 0.45, 1.3, 0.25, white);
    K.box(0.55, 0.12, 0.08, 0.45, 1.62, 0.4, dark, -0.5); // dash
    for (const x of [-0.45, 0.45]) {
      K.box(0.62, 0.32, 0.6, x, 1.17, -0.55, dark);
      K.box(0.62, 0.55, 0.14, x, 1.45, -0.86, dark);
    }
    K.box(2.0, 0.34, 0.7, 0, 1.17, -2.6, dark); // stern bench
    // The outboard on the transom.
    K.box(0.55, 0.7, 0.55, 0, 1.25, -3.75, 0x2a2c30);
    K.box(0.18, 1.1, 0.2, 0, 0.4, -3.8, 0x2a2c30);
    K.box(0.04, 0.3, 0.6, 0, 1.3, -3.45, color); // the brand flash
    // Rails and a stripe.
    for (const s of [1, -1]) K.strut([s * 1.05, 1.0, 0.7], [s * 0.6, 1.25, 2.4], 0.025, 0xc8ccd2);
    return K.geometry();
  }

  class BoatModel {
    constructor(type, opts, seed) {
      const pal = TYPES[type].spec.palette;
      this.color = opts.color !== undefined && opts.color !== null ? opts.color : pal[Math.floor(VH.math.hash2(seed || 1, 17) * pal.length) % pal.length];
      const key = type + ':' + this.color;
      let g = GEO.get(key);
      if (!g) GEO.set(key, (g = buildGeometry(type, this.color)));
      this.root = new THREE.Group();
      this.root.name = 'boat';
      this.body = new THREE.Group();
      this.root.add(this.body);
      this.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
      const m = new THREE.Mesh(g, this.paint);
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
      this.meshes = [m];
      this.wheels = [];
      this.anchors = {};
    }

    setHeadlights() {}
    setBrake() {}
    setReverse() {}
    setSiren() {
      return null;
    }

    setDamage(k) {
      this.paint.color.setScalar(1 - clamp(k, 0, 1) * 0.6);
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

  // -------------------------------------------------------------- boat
  class Boat extends VH.Vehicle {
    constructor(system, typeId, opts) {
      super(system, typeId, opts);
      this.cfg = TYPES[typeId];
      this.topSpeed = this.cfg.maxF;
      this.water = (system.game && system.game.layout && system.game.layout.config.waterLevel) || -1.1;
      this._t = Math.random() * 10;
      this._sprayT = 0;
      this.voiceRange = 140;
      this.voiceRef = 14;
    }

    _buildModel(typeId, opts) {
      return new BoatModel(typeId, opts, this.id);
    }

    /** Deep enough to float at (x, z)? */
    _afloat(x, z) {
      return this.sys.physics.groundHeight(x, z, this.water + 0.2) < this.water - 0.6;
    }

    place(x, z, heading, y) {
      super.place(x, z, heading, y);
      if (this._afloat(x, z)) {
        this.pos.y = this.prevPos.y = this.renderPos.y = this.water - this.cfg.draft;
        this._syncModel(1);
      }
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
      this.input.handbrake = 0;
      this.input.boost = inp.down('sprint') ? 1 : 0;
    }

    fixedUpdate(dt) {
      this.prevPos.copy(this.pos);
      this.prevYaw = this.yaw;
      const C = this.cfg;
      const inp = this.input;
      if (this.wrecked || !this.driver) {
        inp.accel = 0;
        inp.steer = 0;
        inp.boost = 0;
      }
      if (this.sleeping && !this.driver) return;
      this._t += dt;
      const afloat = this._afloat(this.pos.x, this.pos.z);
      if (!afloat) {
        // Beached: it just sits there.
        this.vel.set(0, 0, 0);
        this.vF = 0;
        this.pos.y = this.sys.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1);
        this.rpm = 0.12;
        this._afterStep(dt);
        return;
      }
      // Throttle: quick to spool, water drag when it's off.
      const maxF = C.maxF * (inp.boost && inp.accel > 0 ? 1.15 : 1);
      const tgt = inp.accel >= 0 ? inp.accel * maxF : inp.accel * C.maxR;
      const rate = inp.accel ? (Math.abs(tgt) > Math.abs(this.vF) ? 5.5 : 9) : 2.2;
      this.vF = moveTowards(this.vF, tgt, rate * dt);
      // Steering needs water flowing past the rudder.
      const flow = clamp(0.2 + Math.abs(this.vF) / 10, 0, 1);
      const turn = inp.steer * C.turn * flow * (this.vF < -0.3 ? -1 : 1);
      this.omega = damp(this.omega, turn, 5, dt);
      this.yaw = wrapAngle(this.yaw + this.omega * dt);
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      // The hull carves, but the stern slides out a little in hard turns.
      const along = this.vel.x * s + this.vel.z * c;
      const sideX = this.vel.x - s * along;
      const sideZ = this.vel.z - c * along;
      const keep = Math.exp(-C.grip * dt);
      this.vel.x = s * this.vF + sideX * keep;
      this.vel.z = c * this.vF + sideZ * keep;
      this.aL = -this.omega * this.vF;
      // The shore, the seawall and the quays: bump off them.
      const nx = this.pos.x + this.vel.x * dt;
      const nz = this.pos.z + this.vel.z * dt;
      const nose = this.localToWorld(0, this.hz * 0.9 * Math.sign(this.vF || 1), this._n || (this._n = {}));
      const ok = (x, z) => this._afloat(x, z) && this._afloat(nose.x + x - this.pos.x, nose.z + z - this.pos.z);
      if (ok(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else {
        // The shore: slide along it (whichever way is still water), losing speed; a hard hit hurts.
        const hit = this.speed;
        if (ok(nx, this.pos.z)) {
          this.pos.x = nx;
          this.vel.z *= -0.2;
        } else if (ok(this.pos.x, nz)) {
          this.pos.z = nz;
          this.vel.x *= -0.2;
        } else this.vel.multiplyScalar(-0.25);
        this.vel.multiplyScalar(0.85);
        if (hit > 8) this.damage(hit * 5, null, 'crash');
        if (hit > 4 && this.sys.game && this.sys.game.cameraRig && this.driver === 'player') this.sys.game.cameraRig.addShake(Math.min(0.5, hit * 0.03));
      }
      // Way out in the bay: the current pushes it back.
      if (this.pos.x > 2400) this.vel.x -= 6 * dt;
      // Float: bob on the swell; up on the plane at speed; lean into turns.
      const plane = clamp(Math.abs(this.vF) / C.maxF, 0, 1);
      const swell = Math.sin(this._t * 1.7) * 0.06 + Math.sin(this._t * 0.9 + 1.3) * 0.04;
      this.pos.y = this.water - C.draft + swell * (1 - plane * 0.6) + plane * 0.12;
      this.vel.y = 0;
      this.grounded = true;
      this.pitch = damp(this.pitch, -plane * 0.11 + Math.sin(this._t * 1.3) * 0.02 * (1 - plane), 3, dt);
      this.roll = damp(this.roll, -this.omega * 0.18 * plane + Math.sin(this._t * 1.1) * 0.03, 3, dt);
      this.sys.collideStatic(this);
      this.vF = clamp(this.vel.x * s + this.vel.z * c, -C.maxR, maxF);
      // Spray off the bow at speed.
      this._sprayT -= dt;
      const fx = this.sys.game && this.sys.game.fx;
      if (plane > 0.35 && this._sprayT <= 0 && fx && VH.CombatFX && VH.CombatFX.impact) {
        this._sprayT = 0.22;
        // Thrown off the bow quarters, well ahead of the chase camera.
        const side = Math.random() < 0.5 ? -1 : 1;
        const w = this.localToWorld(side * (this.hx + 0.3), this.hz * 0.35, this._w || (this._w = {}));
        VH.CombatFX.impact(fx, w.x, this.water + 0.05, w.z, 0, 1, 0, 'water', true);
      }
      this.rpm = 0.14 + plane * 0.7 + Math.abs(inp.accel) * 0.2;
      this.gear = 1;
      this.reversing = this.vF < -0.3;
      this.ax = 0;
      this._afterStep(dt);
    }

    /** Getting out beside a quay, the seawall or the pier: step onto it (vehicles.exitVehicle). */
    exitSpot() {
      const ph = this.sys.physics;
      const w = {};
      for (const d of [0.8, 1.6, 2.6, 3.6]) {
        for (const [lx, lz] of [[1, 0], [-1, 0], [1, 0.5], [-1, 0.5], [1, -0.5], [-1, -0.5], [0, 1], [0, -1]]) {
          this.localToWorld(lx * (this.hx + d), lz * (this.hz + (lx ? 0 : d)), w);
          const g = ph.groundHeight(w.x, w.z, this.pos.y + 4);
          if (g < this.water + 0.2) continue; // more water
          if (ph.overlaps(w.x, w.z, 0.3, g + 0.3, g + 1.7)) continue;
          return { x: w.x, z: w.z, y: g };
        }
      }
      return null;
    }

    hudInfo() {
      return { kmh: Math.abs(this.vF) * 3.6, max: this.cfg.maxF * 3.6 * 1.2, gear: this.vF < -0.3 ? 'R' : 'D' };
    }

    createEngineVoice(audio) {
      return audio.createEngine({ kind: this.cfg.voice, player: this.driver === 'player' });
    }

    updateEngineVoice(vo, gain, pan) {
      vo.update({ rpm: this.driver ? this.rpm : 0.1, throttle: Math.abs(this.input.accel), load: Math.abs(this.input.accel) * 0.6, gain, pan });
    }
  }

  for (const id of Object.keys(TYPES)) VH.CarModels.TYPES[id] = TYPES[id].spec;
  VH.VehicleKinds = Object.assign(VH.VehicleKinds || {}, { boat: Boat });
  VH.Boat = Boat;

  // ------------------------------------------------------------ marina
  // Moorings: tied up alongside the seawall below the boardwalk, along both
  // sides of the pier, and at the docks (close enough to step aboard).
  const MOORINGS = [
    ['squall', 427.4, 36, 0], ['sprite', 426.6, 50, 0], ['squall', 427.4, -38, Math.PI], ['sprite', 426.6, -52, Math.PI],
    ['squall', 480, 9.1, Math.PI / 2], ['sprite', 530, -8.4, Math.PI / 2], ['squall', 555, -9.1, -Math.PI / 2],
    ['squall', 427.4, 160, 0], ['squall', 427.4, -170, Math.PI], ['sprite', 426.6, 300, 0], ['squall', 427.4, 445, 0],
  ];

  // The Bay Sprint: a buoy-ring course round the pier end and back (aircraft-races.js runs it).
  const SPRINT = [[470, 40], [560, 140], [700, 230], [830, 90], [700, 0], [780, -150], [620, -260], [480, -200], [455, -50]];

  class Marina {
    constructor(game) {
      this.game = game;
      const cfg = game.layout && game.layout.config;
      this.seawall = cfg ? cfg.seawallX : 424;
      this.water = cfg ? cfg.waterLevel : -1.1;
      const ph = game.physics;
      for (const [type, x, z, yaw] of MOORINGS) {
        if (ph.groundHeight(x, z, this.water + 0.2) >= this.water - 0.6) continue; // a quay or a pier deck there
        game.vehicles.addFixedSpot({ type, x, z, yaw, r: type === 'squall' ? 6 : 4, y: this.water - TYPES[type].draft });
      }
      this.race = VH.AirRace ? new VH.AirRace(game, {
        course: SPRINT.map(([x, z]) => [x, this.water + 0.4, z]), ringR: 9, timeLimit: 95, prize: 2500,
        bestKey: 'vicehaven.baysprint.best', name: 'Bay Sprint', kinds: ['boat'], flat: true, icon: '🚤', verb: 'drive a boat',
      }) : null;
    }

    update(dt) {
      if (this.race) this.race.update(dt);
      const g = this.game;
      const p = g.player;
      if (p.vehicle || p.state === 'dead' || p.pos.x < this.seawall + 0.5 || p.pos.y > this.water - 0.2) return;
      // Jay can't swim: he hauls himself out onto the seawall.
      const x = this.seawall - 2.5;
      const z = clamp(p.pos.z, -1700, 600);
      p.teleport(x, z, -Math.PI / 2);
      if (g.cameraRig) g.cameraRig.snapBehind(p);
      g.hud.showToast('Jay can\'t swim. He hauls himself out onto the seawall, soaked.');
    }

    reset() {
      if (this.race) this.race.reset();
    }

    stop() {
      if (this.race) this.race.stop();
    }

    blips(out, missionRunning) {
      if (this.race && !missionRunning) this.race.blips(out);
      const p = this.game.player.pos;
      if (p.x < this.seawall - 260) return;
      for (const v of this.game.vehicles.list) {
        if (v.kind !== 'boat' || v.removed || v.wrecked || v.driver) continue;
        if (Math.abs(v.pos.x - p.x) > 260 || Math.abs(v.pos.z - p.z) > 260) continue;
        out.push({ x: v.pos.x, z: v.pos.z, type: 'car', heading: v.yaw, label: v.name, noRim: true });
      }
    }
  }

  VH.Marina = Marina;
})();
