/*
 * vigilante.js — GTA's vigilante side job (OWNER: Account B). In a police
 * car (stolen or not), P starts it: dispatch names a fleeing car somewhere
 * nearby. Run it off the road: wreck it, or box it in until it stops, and
 * the crooks bail out shooting; take them down. Each level pays more
 * ($250 x level) and puts more crooks in the car; a time limit per level,
 * and leaving the police car for 15 s calls it off. P again stops.
 *
 *   new VH.Vigilante(game)   .handleKey() (activities.js hands P over in a
 *                            police car) .update(dt) .blips(out) ...
 */
(function () {
  'use strict';

  const VH = window.VH;
  const RUNNERS = ['vireo', 'zephyr', 'drifter', 'ironclad', 'gallop', 'stinger', 'sovereign', 'tern', 'mesa', 'corvid'];
  const POLICE_TYPES = new Set(['interceptor', 'unmarked']);

  /** Two parked vehicles of `type` at the kerb in front of place `id` (fixed spots: they come back). */
  function parkAt(game, id, type) {
    const p = game.places && game.places.get(id);
    if (!p || !VH.Vehicle.typeSpec(type) || !game.roadnet) return;
    // A road with street parking if there's one close by (so they don't sit in a traffic lane).
    let lp = null;
    for (const [dx, dz] of [[0, 0], [15, 0], [-15, 0], [0, 15], [0, -15], [30, 0], [-30, 0], [0, 30], [0, -30]]) {
      const c = game.roadnet.nearestLane(p.x + dx, p.z + dz, undefined, 40);
      if (c && (!lp || (c.road.parking && !lp.road.parking))) lp = c;
      if (lp && lp.road.parking) break;
    }
    if (!lp) return;
    const r = lp.road;
    for (const off of [-7, 7]) {
      const along = Math.max(r.from + 6, Math.min(r.to - 6, lp.along + off));
      const pk = r.parking ? game.roadnet.parkingPoint(r, lp.dir, along) : game.roadnet.lanePoint(r, lp.dir, r.lanesPerDirection - 1, along, {});
      game.vehicles.addFixedSpot({ type, x: pk.x, z: pk.z, yaw: pk.heading, r: 6 });
    }
  }

  /** The runner: a lane driver that keeps picking somewhere far from Jay. */
  class FleeDriver {
    constructor(game, v) {
      this.game = game;
      this.lane = new VH.LaneDriver(game.traffic, { speedMul: 1.35, plow: true, aggressive: true });
      const lp = game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
      this._t = 0;
      this._pick(v);
    }

    _pick(v) {
      const g = this.game;
      const p = g.player.pos;
      const far = g.roadnet.randomLanePoint(Math.random, v.pos.x + (v.pos.x - p.x) * 2, v.pos.z + (v.pos.z - p.z) * 2, 0, 220);
      if (far) this.lane.destination = { x: far.x, z: far.z };
    }

    update(v, dt) {
      this._t -= dt;
      if (this._t <= 0) {
        this._t = 1;
        const d = this.lane.destination;
        if (!d || Math.hypot(d.x - v.pos.x, d.z - v.pos.z) < 40) this._pick(v);
        const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
        if (lp && lp.dist > 7) this.lane.initAt(lp);
      }
      this.lane.update(v, dt);
    }
  }

  class Vigilante {
    constructor(game) {
      this.game = game;
      this.saveKey = 'vigilante';
      this.on = false;
      this.level = 0;
      this.best = 0;
      this.caught = 0;
      this.target = null; // { car, crooks: [], t, bailed, still }
      this.outT = 0;
      parkAt(game, 'vpd_central', 'interceptor'); // cruisers outside the precinct
    }

    _inPoliceCar() {
      const v = this.game.player.vehicle;
      return !!(v && (v.isPolice || POLICE_TYPES.has(v.type)) && v.kind === 'car');
    }

    /** P in a police car: start or stop. Returns true if it took the key. */
    handleKey() {
      if (!this._inPoliceCar() && !this.on) return false;
      if (this.game.missions && this.game.missions.run) return false;
      if (this.on) this._stop('Vigilante: off duty.');
      else this._start();
      return true;
    }

    _start() {
      this.on = true;
      this.level = 0;
      this.outT = 0;
      this.game.hud.centerBanner('VIGILANTE', 'Dispatch will call in the runners. Wreck them or box them in.');
      this._next();
    }

    _stop(msg) {
      this._clearTarget(true);
      this.on = false;
      if (this.level > this.best) this.best = this.level;
      if (msg) this.game.hud.showToast(msg + (this.level > 1 ? ' Reached level ' + this.level + '.' : ''));
    }

    _next() {
      const g = this.game;
      this.level++;
      const p = g.player.pos;
      let lp = null;
      for (let i = 0; i < 20 && !lp; i++) {
        const c = g.roadnet.randomLanePoint(Math.random, p.x, p.z, 140, 260);
        if (c && (i > 14 || !g.isVisible(c.x, 1, c.z, 6))) lp = c;
      }
      if (!lp) return this._stop('Vigilante: no runners out here.');
      const type = RUNNERS[Math.floor(Math.random() * RUNNERS.length)];
      if (!VH.Vehicle.typeSpec(type)) return this._stop(null);
      const car = g.vehicles.spawn(type, lp.x, lp.z, lp.heading, { role: 'ambient', persistent: true });
      car.role = 'ambient';
      car.driver = 'ai';
      car.plow = true;
      car.lightsOn = true;
      car.controller = new FleeDriver(g, car);
      car.setSpeed(15);
      const time = 110 + this.level * 10;
      this.target = { car, crooks: [], t: time, bailed: false, still: 0, n: Math.min(4, 1 + Math.floor((this.level + 1) / 2)) };
      const name = (VH.CarModels.TYPES[type] || {}).name || 'car';
      g.hud.notify({ title: 'Dispatch · level ' + this.level, text: 'Suspects fleeing in a ' + name + '. ' + Math.round(time) + ' s. Run them off the road.', icon: '🚨' });
    }

    _bail() {
      const g = this.game;
      const T = this.target;
      const c = T.car;
      T.bailed = true;
      c.driver = null;
      c.controller = null;
      c.setSpeed && c.setSpeed(0);
      for (let i = 0; i < T.n; i++) {
        const side = i % 2 ? 1 : -1;
        const x = c.pos.x + Math.cos(c.yaw) * side * 2.2 - Math.sin(c.yaw) * (i > 1 ? 1.4 : -0.6);
        const z = c.pos.z - Math.sin(c.yaw) * side * 2.2 - Math.cos(c.yaw) * (i > 1 ? 1.4 : -0.6);
        const a = g.combat.spawnEnemy(x, z, { faction: 'gang', weapon: this.level >= 4 && i === 0 ? 'smg' : 'pistol', alert: true, accuracy: 0.35 + Math.min(0.25, this.level * 0.03), aggression: 0.7 });
        T.crooks.push(a);
      }
      g.hud.showToast('They\'re bailing out! Take them down.');
    }

    _done() {
      const g = this.game;
      const pay = 250 * this.level;
      this.caught += this.target ? this.target.n : 0;
      g.giveMoney(pay, 'vigilante');
      g.hud.centerBanner('SUSPECTS DOWN', 'Level ' + this.level + ' · +' + VH.util.formatMoney(pay));
      this._clearTarget(false);
      this.nextIn = 5;
    }

    _clearTarget(hard) {
      const g = this.game;
      const T = this.target;
      this.target = null;
      if (!T) return;
      const p = g.player.pos;
      const far = (o) => Math.hypot(o.pos.x - p.x, o.pos.z - p.z) > 60;
      for (const a of T.crooks) {
        if (a.removed) continue;
        if (a.dead || !far(a)) a.persistent = false;
        else g.crowd.remove(a);
      }
      const c = T.car;
      if (c && !c.removed && c.driver !== 'player') {
        if (hard && far(c) && !c.wrecked) g.vehicles.remove(c);
        else {
          c.controller = null;
          if (c.driver === 'ai') c.driver = null;
          c.persistent = false;
        }
      }
    }

    update(dt) {
      if (!this.on) return;
      const g = this.game;
      if ((g.missions && g.missions.run) || g.player.state === 'dead') return this._stop('Vigilante: called off.');
      if (!this._inPoliceCar()) {
        this.outT += dt;
        if (this.outT > 15) return this._stop('Vigilante: you left the police car.');
      } else this.outT = 0;
      if (this.nextIn !== undefined) {
        this.nextIn -= dt;
        if (this.nextIn <= 0) {
          this.nextIn = undefined;
          this._next();
        }
        return;
      }
      const T = this.target;
      if (!T) return;
      T.t -= dt;
      if (T.t <= 0) return this._stop('Vigilante: they got away.');
      const c = T.car;
      if (!T.bailed) {
        if (c.removed) return this._stop('Vigilante: lost them.');
        if (c.wrecked) return this._done();
        if (c.driver === 'player') return this._stop('Vigilante: that\'s not how arrests work.');
        // Boxed in or spun out: stopped for two seconds near Jay, and out they come.
        const near = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z) < 30;
        T.still = c.speed < 1.5 && near ? T.still + dt : 0;
        if (T.still > 2) this._bail();
        return;
      }
      if (T.crooks.every((a) => a.dead || a.removed)) this._done();
    }

    reset() {
      if (this.on) this._stop(null);
    }

    stop() {
      if (this.on) this._stop(null);
    }

    blips(out) {
      const T = this.target;
      if (!this.on || !T) return;
      if (!T.bailed && !T.car.removed) out.push({ x: T.car.pos.x, z: T.car.pos.z, type: 'enemy', flash: true, label: 'Suspects · ' + Math.ceil(T.t) + ' s' });
      for (const a of T.crooks) if (!a.dead && !a.removed) out.push({ x: a.pos.x, z: a.pos.z, type: 'enemy' });
    }

    stats() {
      return [['Vigilante: best level', String(Math.max(this.best, this.on ? this.level : 0))], ['Vigilante: crooks taken down', String(this.caught)]];
    }

    serialize() {
      return { best: this.best, caught: this.caught };
    }

    load(data) {
      data = data || {};
      this.best = data.best || 0;
      this.caught = data.caught || 0;
    }
  }

  VH.Vigilante = Vigilante;
})();
