/*
 * ambient.js — life that isn't about Jay: the things that make the city
 * feel like it carries on without him.
 *
 *   Police chases     every few minutes of quiet, somewhere near Jay, a car
 *                     comes tearing through with a cruiser on its tail,
 *                     siren going. Jay can watch, get in the way, or take
 *                     the getaway car for himself (the police notice that).
 *   Office workers    stroll the plazas of Northgate Heights; travellers
 *                     walk the airport terminal forecourt.
 *   Coast tour        a sightseeing helicopter flies laps over the bay.
 *   Clear air         flying high pushes the haze back so the whole city
 *                     shows from the air.
 *
 * Nothing here is saved: it all comes back on its own.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, dampAngle } = VH.math;
  const GETAWAY = ['vireo', 'zephyr', 'drifter', 'ironclad', 'lowrider', 'tern', 'sovereign', 'halcyon', 'beater'];
  const CHASE_GAP = [150, 300]; // seconds of quiet between chases
  const TOUR = { cx: 520, cz: 0, rx: 105, rz: 420, y: 95, speed: 34 };

  // ------------------------------------------------------------ drivers
  /** The getaway driver: flat out, through the lights, somewhere far away. */
  class RunDriver {
    constructor(game, v, dest) {
      this.lane = new VH.LaneDriver(game.traffic, { speedMul: 1.3, plow: true, aggressive: true });
      this.lane.destination = dest;
      const lp = game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
    }

    update(v, dt) {
      this.lane.update(v, dt);
    }
  }

  /** The cruiser: keeps re-aiming at the car in front. */
  class TailDriver {
    constructor(game, v, target) {
      this.game = game;
      this.target = target;
      this.lane = new VH.LaneDriver(game.traffic, { speedMul: 1.35, plow: true, aggressive: true });
      const lp = game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
      this._t = 0;
    }

    update(v, dt) {
      const t = this.target;
      const gone = !t || t.removed || t.wrecked;
      this._t -= dt;
      if (this._t <= 0) {
        this._t = 0.5;
        if (!gone) {
          this.lane.destination = { x: t.pos.x, z: t.pos.z };
          // Dropping back: put the foot down.
          const gap = Math.hypot(t.pos.x - v.pos.x, t.pos.z - v.pos.z);
          this.lane.speedMul = 1.35 + clamp((gap - 30) / 60, 0, 0.5);
        }
        const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
        if (lp && lp.dist > 7) this.lane.initAt(lp);
      }
      // Caught up with a stopped (or smashed) car: pull up beside it.
      if (gone || (Math.hypot(t.pos.x - v.pos.x, t.pos.z - v.pos.z) < 11 && t.speed < 2)) {
        v.input.accel = v.speed > 0.5 ? -1 : 0;
        v.input.steer = 0;
        v.input.handbrake = v.speed < 4 ? 1 : 0;
        return;
      }
      this.lane.update(v, dt);
    }
  }

  // ------------------------------------------------------------ walkers
  /** Walks a loop of points at a stroll, now and then stopping to look at a phone. */
  class StrollBrain {
    constructor(route, i, dir, speed) {
      this.route = route;
      this.i = i;
      this.dir = dir;
      this.speed = speed;
      this._pause = Math.random() * 4;
      this.hostile = false;
    }

    update(a, dt) {
      if (a.dead) return;
      a.moveSpeed = 0;
      if (this._pause > 0) {
        this._pause -= dt;
        a.anim.phone = this._phone ? 1 : 0;
        return;
      }
      a.anim.phone = 0;
      const p = this.route[this.i];
      const dx = p[0] - a.pos.x;
      const dz = p[1] - a.pos.z;
      if (Math.hypot(dx, dz) < 1.2) {
        this.i = (this.i + this.dir + this.route.length) % this.route.length;
        if (Math.random() < 0.25) {
          this._pause = 2 + Math.random() * 6;
          this._phone = Math.random() < 0.6;
        }
        return;
      }
      a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 4, dt);
      a.moveSpeed = this.speed;
    }

    expired() {
      return false; // ambient.js takes them away
    }
  }

  /** Loops round the paths people walk (built from the world's own plans). */
  function walkZones(layout) {
    const zones = [];
    const sky = layout.skyline;
    if (sky) {
      const loops = sky.parcels.map((P) => {
        const i = 2.2;
        const pts = [];
        const n = 10;
        // Corners and points between them, so stops and turns are spread out.
        const corners = [[P.x0 + i, P.z0 + i], [P.x1 - i, P.z0 + i], [P.x1 - i, P.z1 - i], [P.x0 + i, P.z1 - i]];
        for (let c = 0; c < 4; c++) {
          const a = corners[c];
          const b = corners[(c + 1) % 4];
          for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
        }
        return { pts, count: Math.round(((P.x1 - P.x0) + (P.z1 - P.z0)) / 36) };
      });
      zones.push({ id: 'northgate', x: 96, z: -520, near: 230, far: 300, loops, look: 'business' });
    }
    const air = layout.airport;
    if (air && air.terminal) {
      const T = air.terminal;
      const z = T.z1 + 2.6;
      const pts = [];
      for (let x = T.x0 + 12; x <= T.x1 - 12; x += 22) pts.push([x, z]);
      for (let x = T.x1 - 12; x >= T.x0 + 12; x -= 22) pts.push([x, z + 1.2]);
      zones.push({ id: 'terminal', x: (T.x0 + T.x1) / 2, z, near: 220, far: 290, loops: [{ pts, count: 12 }], look: 'travel' });
    }
    // The pavements of the roadside strips (suburbs.js), in pieces of about 150 m.
    for (const S of layout.strips || []) {
      const len = S.a1 - S.a0;
      const pieces = Math.max(1, Math.round(len / 150));
      const pt = (along, d) => {
        const c = S.edge + S.out * d;
        return S.axis === 'z' ? [c, along] : [along, c];
      };
      for (let k = 0; k < pieces; k++) {
        const a0 = S.a0 + (len * k) / pieces + 3;
        const a1 = S.a0 + (len * (k + 1)) / pieces - 3;
        const pts = [];
        for (let a = a0; a <= a1; a += 12) pts.push(pt(a, 2.4));
        for (let a = a1; a >= a0; a -= 12) pts.push(pt(a, 3.0));
        const [cx, cz] = pt((a0 + a1) / 2, 2);
        zones.push({ id: 'strip_' + S.id + '_' + k, x: cx, z: cz, near: 170, far: 220, loops: [{ pts, count: 3 }], look: S.id.startsWith('ar') ? 'travel' : 'street' });
      }
    }
    return zones;
  }

  const SUITS = [0x1f2a38, 0x2d2f33, 0x3b4452, 0x4a3b2f, 0x22303a, 0x5b5f66];
  const BAGS = [0xd94f5c, 0x2f8fd6, 0xf2b01e, 0x1faa6b, 0x8a3fd1, 0xffffff];

  function lookFor(kind) {
    const look = VH.Crowd.randomLook();
    if (kind === 'business' && Math.random() < 0.7) {
      const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
      look.top = suit;
      look.bottom = suit;
      look.shirt = Math.random() < 0.5 ? 0xf2f2f2 : 0xbcd3ea;
    } else if (kind === 'travel' && Math.random() < 0.5) {
      look.top = BAGS[Math.floor(Math.random() * BAGS.length)];
    }
    return look;
  }

  // ================================================================ ambient
  class Ambient {
    constructor(game) {
      this.game = game;
      this.saveKey = null;
      this.chase = null;
      this._nextChase = 60 + Math.random() * 60;
      this.zones = walkZones(game.layout);
      this.walkers = new Map(); // zone id -> [agents]
      this.tour = null;
      this._tourT = Math.random() * 100;
      this._fogK = 1;
      this.chases = 0;
      this._parkStrips();
      VH.events.on('gunshot', (e) => this._panic(e.x, e.z, 70));
      VH.events.on('vehicle:enter', (e) => this._entered(e.v));
    }

    /** Parked cars in the roadside car parks: extra spots for the vehicle system's own streaming. */
    _parkStrips() {
      const V = this.game.vehicles;
      if (!V || !V.spots || !V.spots.length) return;
      const types = V.spots.map((s) => s.type);
      for (const S of this.game.layout.strips || []) {
        for (const lot of S.lots) {
          if (lot.kind !== 'parking' || lot.store) continue;
          const alongX = lot.maxX - lot.minX >= lot.maxZ - lot.minZ;
          // The bays buildings.js paints: two rows, 2.7 m apart, 5.2 m deep, 1 m in from the edges.
          const rows = alongX ? [[lot.minZ + 3.6, 0], [lot.maxZ - 3.6, Math.PI]] : [[lot.minX + 3.6, Math.PI / 2], [lot.maxX - 3.6, -Math.PI / 2]];
          const a0 = (alongX ? lot.minX : lot.minZ) + 2;
          const a1 = (alongX ? lot.maxX : lot.maxZ) - 2;
          for (const [c, heading] of rows) {
            for (let a = a0; a + 2.7 <= a1; a += 2.7) {
              const h = VH.math.hash2(Math.round(a * 10), Math.round(c * 10) + 31);
              if (h > 0.4) continue;
              const m = a + 1.35;
              V.spots.push({
                x: alongX ? m : c, z: alongX ? c : m, heading: heading + (h < 0.2 ? Math.PI : 0), road: null,
                type: types[Math.floor(h * 1e4) % types.length], seed: Math.floor(h * 1e6), vehicle: null, used: false,
              });
            }
          }
        }
      }
    }

    update(dt) {
      const g = this.game;
      if (g.state !== 'playing' && g.state !== 'dialog') return;
      this._chases(dt);
      this._walkers();
      this._tourFly(dt);
      this._clearAir(dt);
    }

    // ---------------------------------------------------------- chases
    _quiet() {
      const g = this.game;
      const p = g.player;
      if (g.missions && g.missions.run) return false;
      if (g.police && g.police.level > 0) return false;
      if (p.isDead || (p.vehicle && p.vehicle.flying)) return false;
      if (g.traffic && g.traffic.enabled === false) return false;
      const cb = g.layout.config.cityBounds || g.layout.config.bounds;
      return p.pos.x > cb.minX + 60 && p.pos.x < cb.maxX - 60 && p.pos.z > cb.minZ + 60 && p.pos.z < cb.maxZ - 60;
    }

    _chases(dt) {
      const g = this.game;
      if (this.chase) {
        this._chaseStep(dt);
        return;
      }
      this._nextChase -= dt;
      if (this._nextChase > 0) return;
      if (!this._quiet() || !this._startChase()) {
        this._nextChase = 15; // try again shortly
        return;
      }
      this._nextChase = CHASE_GAP[0] + Math.random() * (CHASE_GAP[1] - CHASE_GAP[0]);
    }

    _startChase() {
      const g = this.game;
      const p = g.player.pos;
      const net = g.roadnet;
      for (let i = 0; i < 14; i++) {
        const lp = net.randomLanePoint(Math.random, p.x, p.z, 120, 200);
        if (!lp || g.isVisible(lp.x, 1, lp.z, 5)) continue;
        const bx = lp.x - Math.sin(lp.heading) * 20;
        const bz = lp.z - Math.cos(lp.heading) * 20;
        if (!net.onRoad(bx, bz) || g.isVisible(bx, 1, bz, 5)) continue;
        // Head for the far side of Jay, so they come past him.
        const far = net.randomLanePoint(Math.random, p.x + (p.x - lp.x) * 1.5, p.z + (p.z - lp.z) * 1.5, 0, 160);
        if (!far) continue;
        const V = g.vehicles;
        const type = GETAWAY[Math.floor(Math.random() * GETAWAY.length)];
        if (!VH.Vehicle.typeSpec(type) || !VH.Vehicle.typeSpec('interceptor')) return false;
        const run = V.spawn(type, lp.x, lp.z, lp.heading, { role: 'ambient', persistent: true });
        run.role = 'ambient';
        run.driver = 'ai';
        run.plow = true;
        run.controller = new RunDriver(g, run, { x: far.x, z: far.z });
        run.setSpeed && run.setSpeed(16);
        const cop = V.spawn('interceptor', bx, bz, lp.heading, { role: 'ambient', persistent: true });
        cop.role = 'ambient';
        cop.driver = 'ai';
        cop.isPolice = true;
        cop.ambientCop = true;
        cop.siren = true;
        cop.plow = true;
        cop.controller = new TailDriver(g, cop, run);
        cop.setSpeed && cop.setSpeed(15);
        this.chase = { run, cop, t: 0, over: false };
        this.chases++;
        return true;
      }
      return false;
    }

    _chaseStep(dt) {
      const g = this.game;
      const c = this.chase;
      c.t += dt;
      const p = g.player.pos;
      const gone = (v) => !v || v.removed;
      const far = (v) => gone(v) || (Math.hypot(v.pos.x - p.x, v.pos.z - p.z) > 260 && !g.isVisible(v.pos.x, 1, v.pos.z, 4));
      // Something changed: the getaway car is smashed, taken, or the job or the heat is on.
      if (!c.over && (gone(c.run) || c.run.wrecked || c.run.driver !== 'ai' || (g.missions && g.missions.run) || (g.police && g.police.level > 0))) c.over = true;
      // Done when both are out of the picture (or after three minutes, once unseen).
      if ((far(c.run) && far(c.cop)) || (c.t > 180 && far(c.cop) && (far(c.run) || c.run.driver !== 'ai'))) this._endChase();
    }

    _endChase() {
      const c = this.chase;
      if (!c) return;
      this.chase = null;
      const V = this.game.vehicles;
      for (const v of [c.run, c.cop]) {
        if (!v || v.removed || v.driver === 'player') continue;
        V.remove(v);
      }
    }

    /** Jay takes the getaway car (or the cruiser): now it's his problem. */
    _entered(v) {
      const c = this.chase;
      if (!c || (v !== c.run && v !== c.cop)) return;
      v.persistent = true;
      v.role = 'player';
      if (v === c.run) {
        c.run = null;
        const pol = this.game.police;
        if (pol && !(this.game.missions && this.game.missions.suppressHeat)) {
          pol.setLevel(Math.max(pol.level, 2), 'stealCar');
          pol._sawPlayer();
        }
      } else {
        c.cop = null;
      }
      c.over = true;
    }

    // ---------------------------------------------------------- walkers
    _walkers() {
      const g = this.game;
      if (g.crowd && g.crowd.enabled === false) return;
      const p = g.player.pos;
      for (const z of this.zones) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        const list = this.walkers.get(z.id);
        if (!list && d < z.near) this._spawnZone(z);
        else if (list && d > z.far) this._clearZone(z);
        else if (list) {
          for (let i = list.length - 1; i >= 0; i--) if (list[i].removed || list[i].dead || !(list[i].brain instanceof StrollBrain)) list.splice(i, 1);
        }
      }
    }

    _spawnZone(z) {
      const g = this.game;
      const list = [];
      for (const loop of z.loops) {
        for (let k = 0; k < loop.count; k++) {
          const i = Math.floor(Math.random() * loop.pts.length);
          const [x, zz] = loop.pts[i];
          const dir = Math.random() < 0.5 ? 1 : -1;
          const a = g.crowd.spawn(x + (Math.random() - 0.5), zz + (Math.random() - 0.5), { look: lookFor(z.look), faction: 'civilian', role: 'ambient', persistent: true, heading: Math.random() * 6.28 });
          a.brain = new StrollBrain(loop.pts, i, dir, 1.15 + Math.random() * 0.4);
          list.push(a);
        }
      }
      this.walkers.set(z.id, list);
    }

    _clearZone(z) {
      const list = this.walkers.get(z.id) || [];
      for (const a of list) if (!a.removed && a.brain instanceof StrollBrain) this.game.crowd.remove(a);
      this.walkers.delete(z.id);
    }

    /** Shots nearby: everyone runs and becomes an ordinary pedestrian. */
    _panic(x, z, r) {
      if (x === undefined) return;
      const crowd = this.game.crowd;
      for (const list of this.walkers.values()) {
        for (const a of list) {
          if (a.dead || a.removed || !(a.brain instanceof StrollBrain)) continue;
          if (Math.hypot(a.pos.x - x, a.pos.z - z) > r) continue;
          a.brain = null;
          a.persistent = false;
          a.anim.phone = 0;
          crowd._flee(a, x, z, 8 + Math.random() * 4);
        }
      }
    }

    // ---------------------------------------------------------- coast tour
    _tourFly(dt) {
      const g = this.game;
      const p = g.player.pos;
      const near = Math.hypot(p.x - TOUR.cx, p.z - TOUR.cz) < 1300;
      if (!this.tour && near && VH.AircraftModels && VH.AircraftModels.spec('sparrow')) {
        const model = VH.AircraftModels.build('sparrow', 0xff4f8b);
        g.scene.add(model.root);
        this.tour = { model, voice: null };
      } else if (this.tour && !near) {
        this._tourGone();
        return;
      }
      if (!this.tour) return;
      const m = this.tour.model;
      // An ellipse round the bay, flown anticlockwise at a steady speed.
      const perim = Math.PI * (3 * (TOUR.rx + TOUR.rz) - Math.sqrt((3 * TOUR.rx + TOUR.rz) * (TOUR.rx + 3 * TOUR.rz)));
      this._tourT += (dt * TOUR.speed) / perim;
      const a = this._tourT * Math.PI * 2;
      const x = TOUR.cx + Math.cos(a) * TOUR.rx;
      const z = TOUR.cz - Math.sin(a) * TOUR.rz;
      const vx = -Math.sin(a) * TOUR.rx;
      const vz = -Math.cos(a) * TOUR.rz;
      const y = TOUR.y + Math.sin(a * 2) * 12;
      const heading = Math.atan2(vx, vz);
      // Bank into the turn: hardest at the ends of the ellipse.
      const bank = clamp(0.32 * Math.abs(Math.cos(a)) * (TOUR.rz / TOUR.rx) * 0.25, 0, 0.3);
      m.root.position.set(x, y, z);
      m.root.rotation.set(0, heading, 0);
      m.body.rotation.set(0.08, 0, bank);
      if (m.rotor) {
        m.rotor.rotation.y += dt * 38;
        if (m.rotorDisc) m.rotorDisc.visible = true;
      }
      m.setNav(true, this._tourT * 60);
      const audio = g.audio;
      if (audio && audio.ready && audio.createHelicopter && g.vehicleFeedback) {
        const cam = g.renderer.camera.position;
        const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
        const gain = 0.7 / (1 + Math.pow(d / 45, 1.4));
        if (!this.tour.voice && gain > 0.02) this.tour.voice = audio.createHelicopter();
        if (this.tour.voice) this.tour.voice.update({ gain, pan: g.vehicleFeedback._pan(x, z), rate: 1 });
      }
    }

    _tourGone() {
      if (!this.tour) return;
      this.game.scene.remove(this.tour.model.root);
      this.tour.model.dispose();
      if (this.tour.voice) this.tour.voice.stop();
      this.tour = null;
    }

    // ---------------------------------------------------------- clear air
    /** High in an aircraft the haze thins and the far plane goes out to match. */
    _clearAir(dt) {
      const g = this.game;
      const v = g.player.vehicle;
      const alt = v && v.flying ? v.altitude || v.pos.y : 0;
      const want = 1 + clamp((alt - 40) / 260, 0, 1) * 0.9;
      this._fogK += (want - this._fogK) * Math.min(1, dt * 1.5);
      if (Math.abs(this._fogK - want) < 0.002) this._fogK = want;
      this._applyAir();
    }

    _applyAir() {
      const g = this.game;
      const k = this._fogK;
      if (Math.abs(k - (this._appliedK || 1)) < 0.003) return;
      this._appliedK = k;
      const dd = g.settings ? g.settings.get('graphics.drawDistance') : 800;
      if (g.scene.fog) g.scene.fog.density = 1.75 / (dd * k);
      const cam = g.renderer.camera;
      cam.far = dd * k + 200;
      cam.updateProjectionMatrix();
    }

    // ---------------------------------------------------------- contract
    blips(out, missionRunning) {
      const c = this.chase;
      if (!c || missionRunning) return;
      if (c.cop && !c.cop.removed) out.push({ x: c.cop.pos.x, z: c.cop.pos.z, type: 'police', heading: c.cop.yaw, noRim: true });
    }

    stop() {
      if (this.tour && this.tour.voice) {
        this.tour.voice.stop();
        this.tour.voice = null;
      }
      this._fogK = 1;
      this._applyAir();
    }

    reset() {
      this.stop();
      this._endChase();
      for (const z of this.zones) this._clearZone(z);
      this._tourGone();
      this._nextChase = 60 + Math.random() * 60;
    }
  }

  VH.Ambient = Ambient;
})();
