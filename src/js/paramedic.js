/*
 * paramedic.js — GTA's paramedic side job (OWNER: Account B). In an
 * ambulance (the Medic One van), P starts it: somebody is hurt on a
 * pavement nearby. Stop beside them to load them up, then get them to St.
 * Agnes Mercy General before the clock runs out. Each level pays more
 * ($300 + $100 x level) and every fifth level patches Jay up too. Leaving
 * the ambulance for 15 s, or a patient running out of time, ends the shift.
 *
 *   new VH.Paramedic(game)   .handleKey() (activities.js hands P over in an
 *                            ambulance) .update(dt) .blips(out) ...
 */
(function () {
  'use strict';

  const VH = window.VH;
  const AMBULANCES = new Set(['medic']);
  /** Holds a patient still (the crowd skips its walker logic). */
  const HOLD = { hostile: false, update() {}, expired() { return false; } };

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

  class Paramedic {
    constructor(game) {
      this.game = game;
      this.saveKey = 'paramedic';
      this.on = false;
      this.level = 0;
      this.best = 0;
      this.saved = 0;
      this.job = null; // { phase: 'pickup' | 'deliver', patient, x, z, t }
      this.outT = 0;
      this.nextIn = undefined;
      parkAt(game, 'mercy_general', 'medic'); // ambulances outside the hospital
    }

    _inAmbulance() {
      const v = this.game.player.vehicle;
      return !!(v && AMBULANCES.has(v.type));
    }

    _hospital() {
      const p = this.game.places && this.game.places.get('mercy_general');
      return p ? { x: p.x, z: p.z } : null;
    }

    handleKey() {
      if (!this._inAmbulance() && !this.on) return false;
      if (this.game.missions && this.game.missions.run) return false;
      if (this.on) this._stop('Paramedic: off shift.');
      else if (!this._hospital()) this.game.hud.showToast('No hospital to take them to.');
      else this._start();
      return true;
    }

    _start() {
      this.on = true;
      this.level = 0;
      this.outT = 0;
      this.game.hud.centerBanner('PARAMEDIC', 'Pick up the patient, then get them to Mercy General. Drive like it matters.');
      this._next();
    }

    _stop(msg) {
      this._clearPatient();
      this.job = null;
      this.nextIn = undefined;
      this.on = false;
      if (this.level - 1 > this.best) this.best = this.level - 1;
      if (msg) this.game.hud.showToast(msg + (this.level > 1 ? ' Patients saved this shift: ' + (this.level - 1) + '.' : ''));
    }

    /** Somewhere on a pavement: the kerb side of a random lane, on clear street-level ground. */
    _pavementSpot() {
      const g = this.game;
      const p = g.player.pos;
      const ph = g.physics;
      for (let i = 0; i < 30; i++) {
        const lp = g.roadnet.randomLanePoint(Math.random, p.x, p.z, 110, 230);
        if (!lp) continue;
        const r = lp.road;
        const off = r.width / 2 + 2.2;
        const x = r.axis === 'z' ? r.coord - lp.dir * off : lp.x;
        const z = r.axis === 'z' ? lp.z : r.coord + lp.dir * off;
        const gh = ph.groundHeight(x, z, 1);
        if (gh > 0.6 || gh < -0.3 || ph.groundHeight(x, z, 50) > gh + 0.5) continue;
        if (ph.overlaps(x, z, 0.5, gh + 0.3, gh + 1.8)) continue;
        if (g.world.onRoad && g.world.onRoad(x, z, 0.5)) continue;
        return { x, z, heading: lp.heading };
      }
      return null;
    }

    _next() {
      const g = this.game;
      this.level++;
      const s = this._pavementSpot();
      if (!s) return this._stop('Paramedic: no calls out here.');
      const a = g.crowd.spawn(s.x, s.z, { persistent: true, faction: 'civilian', role: 'event', heading: s.heading });
      a.brain = HOLD;
      a.anim.cower = 1;
      a.anim.sprint = false;
      a.moveSpeed = 0;
      const d = Math.hypot(s.x - g.player.pos.x, s.z - g.player.pos.z);
      this.job = { phase: 'pickup', patient: a, x: s.x, z: s.z, t: Math.round(35 + d / 6) };
      g.hud.notify({ title: 'Dispatch · patient ' + this.level, text: 'Someone\'s down on the pavement ' + Math.round(d) + ' m away. ' + this.job.t + ' s.', icon: '🚑' });
    }

    _clearPatient() {
      const J = this.job;
      if (!J || !J.patient || J.patient.removed) return;
      this.game.crowd.remove(J.patient);
    }

    update(dt) {
      if (!this.on) return;
      const g = this.game;
      if ((g.missions && g.missions.run) || g.player.state === 'dead') return this._stop('Paramedic: called off.');
      const v = g.player.vehicle;
      if (!this._inAmbulance()) {
        this.outT += dt;
        if (this.outT > 15) return this._stop('Paramedic: you left the ambulance.');
      } else this.outT = 0;
      if (this.nextIn !== undefined) {
        this.nextIn -= dt;
        if (this.nextIn <= 0) {
          this.nextIn = undefined;
          this._next();
        }
        return;
      }
      const J = this.job;
      if (!J) return;
      J.t -= dt;
      if (J.t <= 0) return this._stop(J.phase === 'pickup' ? 'Paramedic: too late, someone else got there.' : 'Paramedic: the patient didn\'t make it.');
      if (J.phase === 'pickup') {
        if (J.patient.dead || J.patient.removed) return this._stop('Paramedic: the patient is gone.');
        if (!v || !this._inAmbulance()) return;
        const d = Math.hypot(v.pos.x - J.x, v.pos.z - J.z);
        if (d < 8 && Math.abs(v.speed) < 2) {
          this._clearPatient();
          const H = this._hospital();
          const dh = Math.hypot(H.x - v.pos.x, H.z - v.pos.z);
          this.job = { phase: 'deliver', x: H.x, z: H.z, t: Math.round(30 + dh / 6) };
          g.hud.showToast('Patient aboard. Mercy General: ' + this.job.t + ' s. Smooth driving!');
        }
        return;
      }
      if (!v || !this._inAmbulance()) return;
      if (Math.hypot(v.pos.x - J.x, v.pos.z - J.z) < 14 && Math.abs(v.speed) < 3) {
        const pay = 300 + 100 * this.level;
        this.saved++;
        g.giveMoney(pay, 'paramedic');
        let sub = 'Patient ' + this.level + ' saved · +' + VH.util.formatMoney(pay);
        if (this.level % 5 === 0) {
          g.player.heal(g.player.maxHealth);
          sub += ' · the nurses patch you up too';
        }
        g.hud.centerBanner('PATIENT DELIVERED', sub);
        this.job = null;
        this.nextIn = 3;
      }
    }

    reset() {
      if (this.on) this._stop(null);
    }

    stop() {
      if (this.on) this._stop(null);
    }

    blips(out) {
      const J = this.job;
      if (!this.on || !J) return;
      out.push({ x: J.x, z: J.z, type: 'objective', label: (J.phase === 'pickup' ? 'Patient' : 'Mercy General') + ' · ' + Math.ceil(J.t) + ' s' });
    }

    stats() {
      return [['Paramedic: best shift', String(Math.max(this.best, this.on ? this.level - 1 : 0))], ['Paramedic: patients saved', String(this.saved)]];
    }

    serialize() {
      return { best: this.best, saved: this.saved };
    }

    load(data) {
      data = data || {};
      this.best = data.best || 0;
      this.saved = data.saved || 0;
    }
  }

  VH.Paramedic = Paramedic;
})();
