/*
 * aircraft-races.js — the Vicehaven air race (OWNER: Account B).
 *
 * A course of glowing rings in the sky: it starts over the airport runway,
 * goes out over the bay, along the coast, over downtown and back to the
 * runway. Fly any plane or helicopter (or the UFO) through the start ring
 * and the clock starts; thread every ring in order before it runs out.
 * The next ring glows orange with a beacon above it, the one after is dim,
 * the rest are hidden. Best time is kept in this browser.
 *
 *   new VH.AirRace(game)   made by the airfield (airfield.js) at start-up
 *     .update(dt)          every fixed step (driven by Airfield.update)
 *     .blips(out)          the start ring on the radar
 *     .reset() .stop()
 *
 * Races are off while a story job is running.
 */
(function () {
  'use strict';

  const VH = window.VH;

  // The course: [x, y, z], first entry is the start gate, last is the finish.
  const COURSE = [
    [150, 45, -1450], [430, 80, -1150], [520, 100, -620], [420, 120, -80], [180, 95, 320],
    [-160, 150, 230], [-380, 120, -180], [-640, 90, -620], [-950, 70, -960], [-620, 55, -1330],
    [-250, 40, -1450],
  ];
  const RING_R = 16; // fly within this of the centre
  const TIME_LIMIT = 240;
  const PRIZE = 4000;
  const BEST_KEY = 'vicehaven.airrace.best';

  class AirRace {
    constructor(game) {
      this.game = game;
      this.active = false;
      this.next = 0;
      this.t = 0;
      this.best = AirRace._loadBest();
      const geo = new THREE.TorusGeometry(RING_R, 1.1, 10, 40);
      this.hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 1.6, 0.4) });
      this.dim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 0.25), transparent: true, opacity: 0.45 });
      this.start = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.2, 2.6) });
      this.rings = COURSE.map((p, i) => {
        const m = new THREE.Mesh(geo, this.dim);
        m.position.set(p[0], p[1], p[2]);
        // Face along the course: from the previous point to the next.
        const a = COURSE[Math.max(0, i - 1)];
        const b = COURSE[Math.min(COURSE.length - 1, i + 1)];
        m.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
        m.visible = false;
        m.frustumCulled = false;
        game.scene.add(m);
        return m;
      });
      // A light beam above the ring to fly to.
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.0, 0.3), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.beam.frustumCulled = false;
      game.scene.add(this.beam);
      this._idle();
    }

    static _loadBest() {
      try {
        const v = parseFloat(localStorage.getItem(BEST_KEY));
        return Number.isFinite(v) ? v : null;
      } catch (e) {
        return null;
      }
    }

    static _saveBest(v) {
      try {
        localStorage.setItem(BEST_KEY, String(v));
      } catch (e) {
        /* private mode: the best time just isn't kept */
      }
    }

    /** Waiting for a racer: only the start ring shows, glowing teal. */
    _idle() {
      this.active = false;
      this.next = 0;
      this.rings.forEach((r, i) => {
        r.visible = i === 0;
        r.material = this.start;
      });
      const s = COURSE[0];
      this.beam.position.set(s[0], s[1] + RING_R, s[2]);
      this.beam.visible = true;
    }

    _show() {
      this.rings.forEach((r, i) => {
        r.visible = i === this.next || i === this.next + 1;
        r.material = i === this.next ? this.hot : this.dim;
      });
      const p = COURSE[this.next];
      this.beam.position.set(p[0], p[1] + RING_R, p[2]);
    }

    _aircraft() {
      const p = this.game.player;
      const v = p.inVehicle ? p.vehicle : null;
      return v && (v.kind === 'plane' || v.kind === 'heli') ? v : null;
    }

    _through(v, i) {
      const c = COURSE[i];
      return Math.hypot(v.pos.x - c[0], v.pos.y + 1.5 - c[1], v.pos.z - c[2]) < RING_R;
    }

    update(dt) {
      const g = this.game;
      const busy = g.missions && g.missions.run;
      const v = this._aircraft();
      if (!this.active) {
        if (!busy && v && this._through(v, 0)) this._begin();
        return;
      }
      if (busy || !v || v.wrecked || g.player.isDead) {
        this._end(false, busy ? null : 'You left the race.');
        return;
      }
      this.t += dt;
      const left = TIME_LIMIT - this.t;
      g.hud.setMissionTimer(left);
      if (left <= 0) {
        this._end(false, 'Out of time.');
        return;
      }
      if (this._through(v, this.next)) {
        if (g.audio.pickup) g.audio.pickup();
        this.next++;
        if (this.next >= COURSE.length) {
          this._end(true);
          return;
        }
        g.hud.setObjectiveText('Air race: ring ' + this.next + ' of ' + (COURSE.length - 1));
        this._show();
      }
      this.rings.forEach((r) => {
        if (r.visible) r.rotation.z += dt * 0.6;
      });
    }

    _begin() {
      const g = this.game;
      this.active = true;
      this.t = 0;
      this.next = 1;
      g.hud.notify({ title: 'Air race', text: 'Through every ring before the clock runs out. Go!', icon: '✈', tone: 'good' });
      g.hud.setObjectiveText('Air race: ring 1 of ' + (COURSE.length - 1));
      this._show();
    }

    _end(won, why) {
      const g = this.game;
      g.hud.setMissionTimer(null);
      g.hud.setObjectiveText('');
      if (won) {
        const time = this.t;
        const record = this.best === null || time < this.best;
        if (record) {
          this.best = time;
          AirRace._saveBest(time);
        }
        const bonus = Math.round(Math.max(0, TIME_LIMIT - time) * 20);
        g.giveMoney(PRIZE + bonus, 'race');
        const fmt = (s) => Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0');
        g.hud.notify({ title: record ? 'Air race: new record!' : 'Air race complete', text: fmt(time) + (this.best !== null && !record ? '  (best ' + fmt(this.best) + ')' : '') + '  +$' + (PRIZE + bonus), icon: '🏁', tone: 'good' });
      } else if (why) {
        g.hud.notify({ title: 'Air race failed', text: why, icon: '✈', tone: 'bad' });
      }
      this._idle();
    }

    blips(out) {
      if (this.active) {
        const c = COURSE[this.next];
        out.push({ x: c[0], z: c[2], type: 'race', label: 'Next ring' });
      } else {
        const s = COURSE[0];
        out.push({ x: s[0], z: s[2], type: 'race', label: 'Air race (fly through the ring)' });
      }
    }

    reset() {
      if (this.active) this._end(false, null);
      this._idle();
    }

    stop() {
      if (this.active) this._end(false, null);
    }
  }

  AirRace.COURSE = COURSE;
  VH.AirRace = AirRace;
})();
