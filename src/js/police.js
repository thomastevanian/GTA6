/*
 * police.js — the Vicehaven Police Department and the heat you draw.
 *
 * Heat 0–5. Crimes seen by an officer raise it at once; crimes seen only by
 * bystanders get phoned in a few seconds later (sometimes). While you're
 * hot, patrol units hunt you on the road network and switch to direct
 * pursuit (with ramming and PIT attempts) when they have you in sight.
 * From 3 there are roadblocks and armed officers; from 4 the helicopter.
 *
 * Losing them: break line of sight. A search zone appears around where
 * you were last seen; get out of it and stay unseen until the pips stop
 * flashing. Stopping near a unit gets you arrested.
 *
 * Dispatch talks over the radio (subtitles, and the browser's own voice
 * if the player allows it), using real street names.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep } = VH.math;

  const UNITS = [0, 2, 3, 4, 5, 6];
  const SIGHT = [0, 62, 70, 78, 86, 95];
  const EVADE_TIME = [0, 7, 10, 12, 14, 16];
  const SEARCH_R = [0, 85, 110, 135, 150, 165];
  // The helicopter: how far out it can pick Jay up, how far it keeps him
  // once it has him, and how fast it flies (a fast car can outrun it).
  const HELI_ACQUIRE = 70;
  const HELI_KEEP = 115;
  const HELI_SPEED = 25; // 90 km/h: at 100 km/h+ a car slowly pulls away from it
  const HELI_FUEL = 75; // seconds over the city before it goes back to refuel...
  const HELI_REFUEL = 40; // ...and how long until the next one is up

  const COP_LOOK = { skin: 0xc68c64, hair: 0x16110d, top: 0x1c2a4a, trim: 0x1c2a4a, shirt: 0x2a3b61, bottom: 0x141c30, shoes: 0x0e0e0e, cap: true, longHair: false, height: 1.02, build: 1.05 };

  // ------------------------------------------------------ pursuit driver
  class PursuitDriver {
    constructor(police, v) {
      this.police = police;
      this.game = police.game;
      this.lane = new VH.LaneDriver(this.game.traffic, { aggressive: true, speedMul: 1.35, ignoreRed: true, gap: 0.8 });
      this.lane.maxSpeed = 32;
      this.mode = 'road';
      this._routeT = 0;
      this._stuckT = 0;
      this._reverseT = 0;
      this._feel = 0;
      this._avoid = 0;
      this.deployed = false;
      this.v = v;
      const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
    }

    onBump(v, other, speed) {
      if (other && other.driver === 'player') this.police.crime('hitCop', v.pos.x, v.pos.z, speed);
    }

    onJacked() {
      return null;
    }

    update(v, dt) {
      const pol = this.police;
      const game = this.game;
      const p = game.player;
      const tgt = p.inVehicle ? p.vehicle : p;
      const tx = tgt.pos.x;
      const tz = tgt.pos.z;
      const dist = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      v.siren = pol.level > 0;
      v.lightsOn = true;
      if (pol.level === 0) {
        // Called off: cruise normally and fade away.
        this.lane.maxSpeed = 14;
        this.lane.aggressive = false;
        this.lane.ignoreRed = false;
        this.lane.destination = null;
        this.lane.update(v, dt);
        return;
      }
      const seen = pol.seen && dist < SIGHT[pol.level] + 40;
      const direct = seen && dist < 55;
      // On foot and close: stop and send officers out.
      if (!p.inVehicle && dist < 22 && seen) {
        v.input.accel = v.vF > 0.5 ? -1 : 0;
        v.input.steer = 0;
        v.input.handbrake = v.speed < 1 ? 1 : 0;
        if (!this.deployed && v.speed < 2) {
          this.deployed = true;
          pol.deployOfficers(v, pol.level >= 3 ? 2 : 1);
        }
        return;
      }
      if (this._reverseT > 0) {
        this._reverseT -= dt;
        v.input.accel = -0.8;
        v.input.steer = this._revSteer;
        v.input.handbrake = 0;
        return;
      }
      if (!direct) {
        // Navigate the roads toward the player (or the search zone).
        this._routeT -= dt;
        if (this._routeT <= 0) {
          this._routeT = 1;
          const goal = pol.seen ? { x: tx + tgt.vel.x * 2, z: tz + tgt.vel.z * 2 } : pol.searchArea ? { x: pol.searchArea.x + (Math.random() - 0.5) * pol.searchArea.r, z: pol.searchArea.z + (Math.random() - 0.5) * pol.searchArea.r } : { x: tx, z: tz };
          this.lane.destination = goal;
          this.lane.maxSpeed = pol.seen ? 36 : 22;
          // Off the road after a direct chase: get back on it.
          const lp = game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
          if (lp && lp.dist > 6) this.lane.initAt(lp);
        }
        this.lane.update(v, dt);
        this.mode = 'road';
        this._checkStuck(v, dt);
        return;
      }
      // Direct pursuit: aim at where the target will be.
      this.mode = 'direct';
      const closing = Math.max(8, v.speed - (tgt.vel.x * v.forwardX + tgt.vel.z * v.forwardZ) + 6);
      const lead = clamp(dist / closing, 0, 1.3);
      let ax = tx + tgt.vel.x * lead;
      let az = tz + tgt.vel.z * lead;
      // PIT: at high heat, aim at the rear quarter of the car.
      if (p.inVehicle && pol.level >= 3 && dist < 14 && tgt.speed > 8) {
        const side = (v.id % 2 ? 1 : -1) * tgt.hx;
        const back = -tgt.hz * 0.7;
        ax = tgt.pos.x + Math.cos(tgt.yaw) * side + Math.sin(tgt.yaw) * back;
        az = tgt.pos.z - Math.sin(tgt.yaw) * side + Math.cos(tgt.yaw) * back;
      }
      const l = v.worldToLocal(ax, az, this._l || (this._l = {}));
      let angle = Math.atan2(l.x, Math.max(0.1, l.z));
      if (l.z < 0) angle = l.x >= 0 ? 1.2 : -1.2;
      // Feelers against walls.
      this._feel -= dt;
      if (this._feel <= 0) {
        this._feel = 0.1;
        this._avoid = this._feelers(v);
      }
      angle += this._avoid;
      let steer = clamp(angle / 0.5, -1, 1);
      let accel = 1;
      if (Math.abs(angle) > 1.1 && v.speed > 12) accel = -0.4;
      // Box in a stopped car instead of bouncing off it.
      if (tgt.speed < 2 && dist < 9) accel = v.vF > 1 ? -1 : 0;
      v.input.steer = steer;
      v.input.accel = accel;
      v.input.handbrake = Math.abs(angle) > 1.3 && v.speed > 8 ? 1 : 0;
      v.input.boost = 0;
      // Rubber band a little so units don't fall hopelessly behind.
      v.topSpeedBoost = dist > 40 ? 1.12 : 1;
      this._checkStuck(v, dt);
    }

    _feelers(v) {
      const ph = this.game.physics;
      const y = v.pos.y + 0.7;
      const len = 7 + v.speed * 0.7;
      let push = 0;
      for (const [a, w] of [[-0.45, 1], [0.45, -1], [0, 0]]) {
        const yaw = v.yaw + a;
        const dx = Math.sin(yaw);
        const dz = Math.cos(yaw);
        const hit = ph.raycast(v.pos.x + dx * v.hz, y, v.pos.z + dz * v.hz, dx, 0, dz, len, { flags: VH.COLLIDE.SOLID, ground: false });
        if (!hit) continue;
        const k = 1 - hit.t / len;
        if (w === 0) push += (this._lastPush >= 0 ? 0.6 : -0.6) * k;
        else push += w * 0.7 * k; // a wall on the left pushes right, and the other way round
      }
      this._lastPush = push;
      return clamp(push, -0.9, 0.9);
    }

    _checkStuck(v, dt) {
      if (v.speed < 1 && v.input.accel > 0.3) this._stuckT += dt;
      else this._stuckT = Math.max(0, this._stuckT - dt);
      if (this._stuckT > 1.6) {
        this._stuckT = 0;
        this._reverseT = 1.1;
        this._revSteer = -Math.sign(v.input.steer || 1);
      }
    }
  }

  // ---------------------------------------------------- officers on foot
  class OfficerBrain {
    constructor(police, car) {
      this.police = police;
      this.car = car;
      this._fireT = 1 + Math.random();
      this._strafe = Math.random() < 0.5 ? 1 : -1;
      this._strafeT = 0;
    }

    expired(a, d) {
      return (this.police.level === 0 && d > 60) || d > 200 || (a.dead && a.deadTime > 30);
    }

    update(a, dt) {
      const pol = this.police;
      const game = pol.game;
      const p = game.player;
      if (a.dead) return;
      const tgt = p.inVehicle ? p.vehicle : p;
      const dx = tgt.pos.x - a.pos.x;
      const dz = tgt.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const face = Math.atan2(dx, dz);
      if (pol.level === 0) {
        // Stand down: walk back to the car and vanish.
        a.anim.aim = 0;
        a.moveSpeed = 1.3;
        if (this.car && !this.car.removed) a.heading = VH.math.dampAngle(a.heading, Math.atan2(this.car.pos.x - a.pos.x, this.car.pos.z - a.pos.z), 5, dt);
        return;
      }
      const armed = pol.level >= 3 || pol.playerArmed;
      if (armed && d < 32 && pol.canSee(a.pos.x, a.pos.y + 1.5, a.pos.z)) {
        // Shoot from where they stand, sidestepping now and then.
        a.heading = VH.math.dampAngle(a.heading, face, 8, dt);
        a.anim.aim = 1;
        a.anim.weaponPose = 'pistol';
        this._strafeT -= dt;
        if (this._strafeT <= 0) {
          this._strafeT = 1.5 + Math.random() * 2;
          this._strafe = -this._strafe;
        }
        a.moveSpeed = d > 14 ? 2.2 : 0;
        if (d < 14) {
          a.pos.x += Math.cos(face) * this._strafe * 1.4 * dt;
          a.pos.z -= Math.sin(face) * this._strafe * 1.4 * dt;
        }
        this._fireT -= dt;
        if (this._fireT <= 0) {
          this._fireT = 0.55 + Math.random() * 0.7;
          if (game.combat) game.combat.npcFire(a, tgt, 'pistol');
        }
        return;
      }
      // Chase to arrest.
      a.anim.aim = 0;
      a.heading = VH.math.dampAngle(a.heading, face, 7, dt);
      a.moveSpeed = d > 2 ? 5.4 : 0;
      a.anim.sprint = d > 4;
      a.anim.handsUp = 0;
    }
  }

  // ------------------------------------------------------------- police
  class Police {
    constructor(game) {
      this.game = game;
      this.level = 0;
      this.seen = false;
      this.lastSeen = null;
      this.searchArea = null;
      this.evade = 0;
      this.unseenT = 0;
      this.units = [];
      this.officers = [];
      this.bust = 0;
      this.pursuitT = 0;
      this.kills = 0;
      this.playerArmed = false;
      this.heli = null;
      this._losT = 0;
      this._spawnT = 0;
      this._blockT = 20;
      this._reports = [];
      this._sayT = 0;
      this._lastLine = '';
      this.enabled = true;
      // The helicopter's searchlight lives in the scene from the start: adding a
      // light later would make every material recompile mid-chase.
      this.heliSpot = new THREE.SpotLight(0xfff4e0, 0, 140, 0.13, 0.5, 1.2);
      this.heliSpot.position.set(0, -200, 0);
      game.scene.add(this.heliSpot);
      game.scene.add(this.heliSpot.target);
      this._bindEvents();
    }

    _bindEvents() {
      VH.events.on('vehicle:jack', (e) => this.crime('jack', e.x, e.z));
      VH.events.on('vehicle:enter', (e) => {
        if (e.v.isPolice && !e.v.missionOwned) this.crime('stealCop', e.v.pos.x, e.v.pos.z);
      });
      VH.events.on('ped:hitByCar', (e) => {
        if (e.v.driver === 'player' && e.speed > 5) this.crime(e.agent.dead ? 'killPed' : 'hitPed', e.agent.pos.x, e.agent.pos.z);
      });
      VH.events.on('agent:died', (e) => {
        if (e.source !== 'player') return;
        if (e.agent.faction === 'police') this.crime('killCop', e.agent.pos.x, e.agent.pos.z);
        else if (e.agent.faction === 'civilian') this.crime('killPed', e.agent.pos.x, e.agent.pos.z);
      });
      VH.events.on('gunshot', (e) => {
        if (e.byPlayer) this.crime('shots', e.x, e.z);
      });
      VH.events.on('explosion', (e) => {
        if (e.source === 'player' || (e.source && e.source.driver === 'player') || (e.source && e.source.lastHitBy === 'player')) this.crime('explosion', e.x, e.z);
      });
    }

    /** Minimum heat each crime brings, and whether bystanders call it in. */
    static crimeInfo(kind) {
      return {
        jack: { heat: 1, report: 0.45 },
        stealCop: { heat: 2, report: 1 },
        hitPed: { heat: 1, report: 0.7 },
        killPed: { heat: 2, report: 1, add: 1 },
        hitCop: { heat: 1, report: 0 },
        killCop: { heat: 3, report: 1, add: 1 },
        shots: { heat: 1, report: 0.8 },
        explosion: { heat: 2, report: 1 },
        robbery: { heat: 2, report: 1 }, // a corner shop held up (stores.js)
        killSoldier: { heat: 4, report: 1, add: 1 }, // Fort Breakwater (fort.js)
        stealMilitary: { heat: 5, report: 1 },
      }[kind] || { heat: 1, report: 0.5 };
    }

    crime(kind, x, z) {
      if (!this.enabled || this.game.state !== 'playing' && this.game.state !== 'dialog') return;
      if (this.game.missions && this.game.missions.suppressHeat) return;
      const info = Police.crimeInfo(kind);
      const witnessed = this._copWitness(x, z);
      if (witnessed) {
        let lvl = Math.max(this.level, info.heat);
        if (info.add && this.level > 0) lvl = Math.min(5, lvl + (kind === 'killCop' || ++this.kills % 2 === 0 ? info.add : 0));
        if (kind === 'hitCop' && this.level > 0 && Math.random() < 0.25) lvl = Math.min(5, lvl + 1);
        this.setLevel(lvl, kind);
        this._sawPlayer();
        return;
      }
      if (this.level > 0 && info.add) {
        if (++this.kills % 3 === 0) this.setLevel(Math.min(5, this.level + 1), kind);
      }
      // Bystanders phone it in.
      if (Math.random() < info.report && this._civilianWitness(x, z)) {
        this._reports.push({ t: 4 + Math.random() * 5, heat: info.heat, x, z, kind });
      }
    }

    _copWitness(x, z) {
      for (const v of this.units) {
        if (v.removed || v.wrecked) continue;
        if (Math.hypot(v.pos.x - x, v.pos.z - z) < 60 && this.canSee(v.pos.x, v.pos.y + 1.4, v.pos.z)) return true;
      }
      for (const a of this.officers) {
        if (a.dead || a.removed) continue;
        if (Math.hypot(a.pos.x - x, a.pos.z - z) < 45 && this.canSee(a.pos.x, a.pos.y + 1.6, a.pos.z)) return true;
      }
      // Parked or passing patrol cars count too.
      for (const v of this.game.vehicles.list) {
        if (!v.isPolice || v.wrecked || v.driver === 'player') continue;
        if (Math.hypot(v.pos.x - x, v.pos.z - z) < 45 && this.canSee(v.pos.x, v.pos.y + 1.4, v.pos.z)) return true;
      }
      if (this.heli && Math.hypot(this.heli.pos.x - x, this.heli.pos.z - z) < 150) return true;
      return false;
    }

    _civilianWitness(x, z) {
      let n = 0;
      this.game.crowd.near(x, z, 32, (a) => {
        if (!a.dead && a.faction === 'civilian' && !a.brain) n++;
      });
      return n > 0;
    }

    /** Is the player visible from a point? (buildings block the view) */
    canSee(ox, oy, oz) {
      const p = this.game.player;
      const t = p.inVehicle ? p.vehicle.pos : p.pos;
      const tx = t.x;
      const ty = t.y + 1.1;
      const tz = t.z;
      const dx = tx - ox;
      const dy = ty - oy;
      const dz = tz - oz;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1) return true;
      const hit = this.game.physics.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d - 1.2, { flags: VH.COLLIDE.CAMERA, ground: false });
      return !hit;
    }

    setLevel(lvl, reason) {
      lvl = clamp(Math.round(lvl), 0, 5);
      if (lvl === this.level) return;
      const up = lvl > this.level;
      const was = this.level;
      this.level = lvl;
      VH.events.emit('police:level', { level: lvl, was, reason });
      if (lvl === 0) {
        this._clear(false);
        return;
      }
      if (up) {
        if (this.game.audio.heatUp) this.game.audio.heatUp(lvl);
        if (was === 0) {
          this.pursuitT = 0;
          this._dispatch('start');
        } else if (lvl === 4) this._dispatch('air');
        else this._dispatch('escalate');
      }
    }

    _sawPlayer() {
      const p = this.game.player;
      const t = p.inVehicle ? p.vehicle.pos : p.pos;
      this.seen = true;
      this.unseenT = 0;
      this.evade = 0;
      this.lastSeen = { x: t.x, z: t.z };
      this.searchArea = null;
    }

    /** Officers step out of a stopped unit. */
    deployOfficers(car, n) {
      const crowd = this.game.crowd;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? -1 : 1;
        const w = car.localToWorld(side * (car.hx + 0.8), 0.3, {});
        const look = Object.assign({}, COP_LOOK, { skin: VH.Crowd.randomLook().skin });
        const a = crowd.spawn(w.x, w.z, { look, faction: 'police', role: 'cop', health: 100, armor: 50, heading: car.yaw });
        a.brain = new OfficerBrain(this, car);
        a.weapon = 'pistol';
        this.officers.push(a);
      }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
      const game = this.game;
      const p = game.player;
      // Delayed reports from bystanders.
      for (const r of this._reports) r.t -= dt;
      for (const r of this._reports.filter((q) => q.t <= 0)) {
        if (this.level < r.heat) {
          this.setLevel(r.heat, r.kind);
          this.lastSeen = { x: r.x, z: r.z };
          this.seen = false;
          this.searchArea = { x: r.x, z: r.z, r: SEARCH_R[this.level] * 0.8 };
          this._dispatch('report', r);
        }
      }
      this._reports = this._reports.filter((q) => q.t > 0);
      this.playerArmed = game.combat ? game.combat.playerArmed : false;

      this._cleanup();
      if (this.level === 0) {
        this.bust = 0;
        this._updateHeli(dt, false);
        return;
      }
      this.pursuitT += dt;
      // A long chase keeps getting hotter (up to 3 on its own).
      if (this.pursuitT > 75 && this.level < 3 && this.seen) {
        this.pursuitT = 0;
        this.setLevel(this.level + 1, 'pursuit');
      }

      // Line of sight, 5 times a second.
      this._losT -= dt;
      if (this._losT <= 0) {
        this._losT = 0.2;
        let seen = false;
        const t = p.inVehicle ? p.vehicle.pos : p.pos;
        for (const v of this.units) {
          if (v.removed || v.wrecked) continue;
          const d = Math.hypot(v.pos.x - t.x, v.pos.z - t.z);
          if (d < SIGHT[this.level] && this.canSee(v.pos.x, v.pos.y + 1.4, v.pos.z)) {
            seen = true;
            break;
          }
        }
        if (!seen) {
          for (const a of this.officers) {
            if (a.dead || a.removed) continue;
            if (Math.hypot(a.pos.x - t.x, a.pos.z - t.z) < 45 && this.canSee(a.pos.x, a.pos.y + 1.6, a.pos.z)) {
              seen = true;
              break;
            }
          }
        }
        if (!seen && this.heli && this.heli.tracking) seen = true;
        if (seen) this._sawPlayer();
        else this.seen = false;
      }
      const t = p.inVehicle ? p.vehicle.pos : p.pos;
      if (!this.seen) {
        this.unseenT += dt;
        if (this.unseenT > 1.5 && !this.searchArea && this.lastSeen) {
          this.searchArea = { x: this.lastSeen.x, z: this.lastSeen.z, r: SEARCH_R[this.level] };
          this._dispatch('lost');
        }
        if (this.searchArea) {
          const outside = Math.hypot(t.x - this.searchArea.x, t.z - this.searchArea.z) > this.searchArea.r;
          if (outside) this.evade += dt;
          else this.evade = Math.max(0, this.evade - dt * 0.5);
          if (this.evade > EVADE_TIME[this.level]) {
            this._dispatch('escaped');
            this.setLevel(0, 'evaded');
            VH.events.emit('police:evaded', {});
            return;
          }
        }
      }

      // Keep the right number of units on the job.
      this._spawnT -= dt;
      if (this._spawnT <= 0) {
        this._spawnT = 1.2;
        const alive = this.units.filter((v) => !v.removed && !v.wrecked).length;
        if (alive < UNITS[this.level]) this._spawnUnit(t);
      }
      // Roadblocks ahead of a fleeing car.
      if (this.level >= 3 && p.inVehicle && !p.vehicle.flying) {
        this._blockT -= dt;
        if (this._blockT <= 0) {
          this._blockT = 28 + Math.random() * 12;
          this._roadblock(p.vehicle);
        }
      }
      this._updateHeli(dt, this.level >= 4);
      this._updateBust(dt);
    }

    _spawnUnit(t) {
      const game = this.game;
      const p = game.player;
      const vel = p.inVehicle ? p.vehicle.vel : p.vel;
      // Prefer ahead of the player's travel, out of sight. Once they've lost
      // him, new units come to the search area: they don't know where he is.
      const lost = !this.seen && this.searchArea;
      const cx = lost ? this.searchArea.x : t.x + vel.x * 4;
      const cz = lost ? this.searchArea.z : t.z + vel.z * 4;
      let best = null;
      for (let i = 0; i < 12; i++) {
        const lp = game.roadnet.randomLanePoint(Math.random, cx, cz, lost ? 30 : 80, lost ? 140 : 170);
        if (!lp) continue;
        if (game.isVisible(lp.x, 1, lp.z, 4) && lp.dist < 120) continue;
        best = lp;
        break;
      }
      if (!best) return;
      const type = this.level >= 5 && Math.random() < 0.35 && VH.Vehicle.typeSpec('bulwark') ? 'bulwark' : Math.random() < 0.2 && VH.Vehicle.typeSpec('unmarked') ? 'unmarked' : 'interceptor';
      const v = game.vehicles.spawn(type, best.x, best.z, best.heading, { role: 'police' });
      v.role = 'police';
      v.driver = 'ai';
      v.isPolice = true;
      v.siren = true;
      v.controller = new PursuitDriver(this, v);
      v.setSpeed(12);
      this.units.push(v);
    }

    _roadblock(pv) {
      const game = this.game;
      const lp = game.roadnet.nearestLane(pv.pos.x, pv.pos.z, pv.yaw);
      if (!lp) return;
      // Somewhere ahead that Jay can't see yet (over a rise, past a bend, or
      // just far enough): never popping into view on a straight road.
      let center = null;
      let farEnough = null; // the roads are straight and flat: a spot 200 m+ out is a dot on the horizon
      const fogged = 0.75 * (game.settings.get('graphics.drawDistance') || 600); // mostly lost in the haze by here
      for (const extra of [0, 40, 80, 120, 180]) {
        const along = lp.along + lp.dir * (120 + pv.speed * 2 + extra);
        if (along < lp.road.from + 20 || along > lp.road.to - 20) break;
        const c = lp.road.axis === 'z' ? { x: lp.road.coord, z: along } : { x: along, z: lp.road.coord };
        if (game.roadnet.junctionAt(c.x, c.z, 8)) continue;
        if (!farEnough && Math.hypot(c.x - pv.pos.x, c.z - pv.pos.z) >= 200) farEnough = c;
        if (game.isVisible(c.x, 1, c.z, 6) && this.canSee(c.x, 1.5, c.z) && Math.hypot(c.x - pv.pos.x, c.z - pv.pos.z) < fogged) continue;
        center = c;
        break;
      }
      if (!center) center = farEnough;
      if (!center) {
        this._blockT = 4; // try again soon, a little further on
        return;
      }
      const across = lp.road.axis === 'z' ? Math.PI / 2 : 0;
      const half = lp.road.width / 2;
      for (const off of [-half * 0.45, half * 0.45]) {
        const x = lp.road.axis === 'z' ? center.x + off : center.x;
        const z = lp.road.axis === 'z' ? center.z : center.z + off;
        const v = game.vehicles.spawn('interceptor', x, z, across + (off > 0 ? 0.25 : -0.25), { role: 'police', sleeping: true });
        v.role = 'roadblock';
        v.isPolice = true;
        v.siren = true;
        v.lightsOn = true;
        v.sirenTime = Math.random();
        this.units.push(v);
        this.deployOfficers(v, 1);
      }
      this._dispatch('roadblock', { street: lp.road.name });
    }

    _updateBust(dt) {
      const p = this.game.player;
      let close = false;
      if (p.inVehicle) {
        const v = p.vehicle;
        // Hovering over a patrol car isn't being pulled over.
        if (v.speed < 1.8 && !v.flying) {
          for (const u of this.units) {
            if (u.removed || u.wrecked || Math.abs(u.pos.y - v.pos.y) > 3) continue;
            if (Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) < v.hz + u.hz + 2.5) close = true;
          }
          for (const a of this.officers) if (!a.dead && Math.abs(a.pos.y - v.pos.y) < 3 && Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z) < v.hx + 1.6) close = true;
        }
      } else if (p.state !== 'dead') {
        for (const a of this.officers) {
          if (a.dead || a.removed) continue;
          if (Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 1.7) close = true;
        }
      }
      if (close) this.bust += dt / (p.inVehicle ? 2.6 : 1.4);
      else this.bust = Math.max(0, this.bust - dt * 0.8);
      if (this.bust >= 1) {
        this.bust = 0;
        this.game.arrested();
      }
    }

    _cleanup() {
      const game = this.game;
      const focus = game.player.pos;
      this.units = this.units.filter((v) => {
        if (v.removed) return false;
        const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
        const seen = game.isVisible(v.pos.x, v.pos.y + 1, v.pos.z, 3);
        if ((this.level === 0 && d > 90 && !seen) || d > 420 || (v.wrecked && d > 80 && !seen)) {
          if (v.driver !== 'player') game.vehicles.remove(v);
          return false;
        }
        if (v.driver === 'player') return false;
        return true;
      });
      this.officers = this.officers.filter((a) => !a.removed);
    }

    _clear(hard) {
      this.seen = false;
      this.searchArea = null;
      this.lastSeen = null;
      this.evade = 0;
      this.bust = 0;
      this.kills = 0;
      this._reports.length = 0;
      for (const v of this.units) {
        v.siren = false;
        if (hard && v.driver !== 'player') this.game.vehicles.remove(v);
      }
      if (hard) {
        for (const a of this.officers) this.game.crowd.remove(a);
        this.officers.length = 0;
        this.units.length = 0;
      }
      if (this.heli) this.heli.leaving = true;
    }

    /** Wipe everything (new game, arrest, mission restart). */
    reset() {
      this.level = 0;
      this._clear(true);
      this._heliWait = 0;
      if (this.heli) {
        this.heli.dispose();
        this.heli = null;
      }
    }

    // ------------------------------------------------------ helicopter
    _updateHeli(dt, wanted) {
      this._heliWait = Math.max(0, (this._heliWait || 0) - dt);
      if (wanted && !this.heli && this._heliWait <= 0) {
        this.heli = new PoliceHeli(this.game, this.heliSpot);
        this._heliFuel = HELI_FUEL;
      }
      if (!this.heli) return;
      // Low on fuel: it heads home, and there's a gap before the next one.
      if (!this.heli.leaving) {
        this._heliFuel -= dt;
        if (this._heliFuel <= 0) {
          this.heli.leaving = true;
          this._heliWait = HELI_REFUEL;
          this._dispatch('refuel');
        }
      }
      this.heli.update(dt, wanted && !this.heli.leaving);
      if (this.heli.gone) {
        this.heli.dispose();
        this.heli = null;
      }
    }

    // --------------------------------------------------------- dispatch
    _dispatch(kind, info) {
      const game = this.game;
      if (!game.settings.get('gameplay.policeVoice') && kind !== 'start') {
        // Captions still show; the voice is optional.
      }
      const p = game.player;
      const t = p.inVehicle ? p.vehicle.pos : p.pos;
      const street = game.world.roadNameAt(t.x, t.z) || (game.world.districtAt(t.x, t.z) || {}).name || 'the city';
      const car = p.inVehicle ? Police.describeCar(p.vehicle) : null;
      const dir = Police.heading(p.inVehicle ? p.vehicle.vel : p.vel);
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      let line = '';
      switch (kind) {
        case 'start':
          line = car ? pick([
            `All units, be advised: suspect in a ${car}, ${dir ? 'heading ' + dir + ' on ' : 'on '}${street}.`,
            `Dispatch to all units, we have a ${car} fleeing on ${street}. Proceed with caution.`,
            `Units in the area, respond. ${car[0].toUpperCase() + car.slice(1)}, last seen on ${street}.`,
          ]) : pick([
            `All units, suspect on foot near ${street}. Male, late twenties, dark jacket.`,
            `Dispatch, we have a suspect on foot on ${street}. Units respond.`,
          ]);
          break;
        case 'report':
          line = pick([`Dispatch, we have a report of ${Police.crimeText(info.kind)} on ${street}. Units respond.`, `Caller reports ${Police.crimeText(info.kind)} near ${street}.`]);
          break;
        case 'escalate':
          line = pick([`Suspect is armed and dangerous. All units, use caution.`, `Units, suspect is not stopping. Request backup on ${street}.`, `Shots fired, shots fired! Units converging on ${street}.`]);
          break;
        case 'air':
          line = pick([`Air unit is up. Eyes in the sky over ${street}.`, `Air One en route. We'll light him up.`]);
          break;
        case 'refuel':
          line = pick([`Air One is bingo fuel, returning to base. Ground units, keep on him.`, `Air unit breaking off to refuel. Next bird is forty out.`]);
          break;
        case 'lost':
          line = pick([`We've lost visual. All units, search the area around ${street}.`, `Suspect out of sight. Setting up a perimeter near ${street}.`, `Lost him! Last seen on ${street}.`]);
          break;
        case 'escaped':
          line = pick([`Suspect has evaded pursuit. All units, return to patrol.`, `No sign of him. Dispatch, we're calling it off.`, `Damn it, he's gone. Units resume patrol.`]);
          break;
        case 'roadblock':
          line = `Roadblock set on ${info.street}. Nobody gets through.`;
          break;
        case 'arrest':
          line = `Suspect in custody. Good work, everyone.`;
          break;
        default:
          return;
      }
      if (game.time - this._sayT < 5 && kind !== 'start' && kind !== 'escaped') return;
      this._sayT = game.time;
      if (game.audio.radioSquelch) game.audio.radioSquelch();
      if (game.dialogue) game.dialogue.radio('DISPATCH', line, game.settings.get('gameplay.policeVoice'));
    }

    static crimeText(kind) {
      return { jack: 'a carjacking', stealCop: 'a stolen patrol car', hitPed: 'a hit-and-run', killPed: 'a pedestrian down', shots: 'shots fired', explosion: 'an explosion', killCop: 'an officer down', robbery: 'an armed robbery', killSoldier: 'a soldier down at Fort Breakwater', stealMilitary: 'a stolen military vehicle' }[kind] || 'a disturbance';
    }

    static heading(vel) {
      if (!vel || Math.hypot(vel.x, vel.z) < 2) return '';
      const a = Math.atan2(vel.x, -vel.z); // 0 = north
      const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    }

    static describeCar(v) {
      const c = new THREE.Color(v.model.color || 0x888888);
      const hsl = {};
      c.getHSL(hsl);
      let name;
      if (hsl.l < 0.14) name = 'black';
      else if (hsl.s < 0.12) name = hsl.l > 0.7 ? 'white' : hsl.l > 0.42 ? 'silver' : 'grey';
      else {
        const h = hsl.h * 360;
        name = h < 15 || h >= 340 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink';
        if (hsl.l < 0.3 && name !== 'yellow') name = 'dark ' + name;
      }
      return name + ' ' + v.name;
    }
  }

  // -------------------------------------------------------- helicopter
  class PoliceHeli {
    constructor(game, spot) {
      this.game = game;
      this.root = PoliceHeli.buildModel();
      game.scene.add(this.root);
      const p = game.player.pos;
      this.pos = new THREE.Vector3(p.x + 85, 60, p.z - 85); // arrives within a few seconds
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.tracking = false;
      this.leaving = false;
      this.gone = false;
      this.t = 0;
      this._voice = null;
      // Searchlight: a cone and a pool on the ground.
      const coneGeo = new THREE.ConeGeometry(4.5, 1, 24, 1, true).translate(0, -0.5, 0);
      this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.36, 0.32), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.cone.frustumCulled = false;
      game.scene.add(this.cone);
      this.spot = spot;
    }

    static buildModel() {
      const g = new THREE.Group();
      const dark = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.45, metalness: 0.4 });
      const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.2 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.05, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12).scale(1, 0.85, 1.9), dark);
      g.add(body);
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.31, 16, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.12).scale(1, 0.85, 1.9), white);
      g.add(stripe);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.8, 1.2), glass);
      canopy.position.set(0, 0.2, 1.1);
      g.add(canopy);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 5, 8).rotateX(Math.PI / 2), dark);
      tail.position.set(0, 0.3, -4.2);
      g.add(tail);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.8), dark);
      fin.position.set(0, 0.8, -6.5);
      g.add(fin);
      for (const s of [-1, 1]) {
        const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6).rotateX(Math.PI / 2), dark);
        skid.position.set(s * 0.9, -1.3, 0);
        g.add(skid);
      }
      const rotor = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 5.2).translate(0, 0, 2.6), dark);
        blade.rotation.y = (i * Math.PI) / 2;
        rotor.add(blade);
      }
      rotor.position.set(0, 1.25, 0);
      g.add(rotor);
      g.userData.rotor = rotor;
      const tailRotor = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.12), dark);
        blade.rotation.x = (i * Math.PI) / 2;
        tailRotor.add(blade);
      }
      tailRotor.position.set(0.2, 0.9, -6.6);
      g.add(tailRotor);
      g.userData.tailRotor = tailRotor;
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.2) }));
      beacon.position.set(0, -0.9, -1);
      g.add(beacon);
      g.userData.beacon = beacon;
      g.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      return g;
    }

    update(dt, wanted) {
      this.t += dt;
      const game = this.game;
      const p = game.player;
      const t = p.inVehicle ? p.vehicle : p;
      if (!wanted) this.leaving = true;
      const pol = game.police;
      // Does it have Jay? Close enough, and nothing over his head: under a
      // roof, a bridge or in a parkade it can't see him. Once lost, it doesn't
      // know where he is: it circles where the search is until he shows up
      // near it again.
      const horiz0 = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      const covered = game.physics.groundHeight(t.pos.x, t.pos.z, 400) > t.pos.y + 3;
      this.tracking = !this.leaving && !covered && horiz0 < (this.tracking ? HELI_KEEP : HELI_ACQUIRE);
      // While the units on the ground can see him they radio his position in;
      // once nobody can, it only has the search area to go on.
      if (this.tracking || pol.seen) this._last = { x: t.pos.x + t.vel.x * 1.5, z: t.pos.z + t.vel.z * 1.5 };
      const search = (!this.tracking && !pol.seen && pol.searchArea) || this._last || { x: t.pos.x, z: t.pos.z };
      this._aim = this.tracking ? null : search;
      let goal;
      if (this.leaving) goal = new THREE.Vector3(this.pos.x + 400, 90, this.pos.z - 400);
      else if (this.tracking) {
        // Orbit slowly around a point just ahead of the target.
        const a = this.t * 0.22;
        goal = new THREE.Vector3(t.pos.x + t.vel.x * 1.5 + Math.cos(a) * 30, 48, t.pos.z + t.vel.z * 1.5 + Math.sin(a) * 30);
      } else if (pol.seen) {
        // Heading for where the units say he is.
        goal = new THREE.Vector3(search.x, 50, search.z);
      } else {
        // Sweep wide circles over the search area.
        const a = this.t * 0.16;
        const r = Math.min(80, (search.r || 60) * 0.6);
        goal = new THREE.Vector3(search.x + Math.cos(a) * r, 52, search.z + Math.sin(a) * r);
      }
      const maxSpeed = HELI_SPEED;
      const to = goal.clone().sub(this.pos);
      const desired = to.clampLength(0, maxSpeed);
      this.vel.lerp(desired, 1 - Math.exp(-0.8 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.yaw = VH.math.dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 1.2, dt);
      this.root.position.copy(this.pos);
      this.root.rotation.set(clamp(this.vel.length() / maxSpeed, 0, 1) * 0.18, this.yaw, 0, 'YXZ');
      this.root.userData.rotor.rotation.y += dt * 38;
      this.root.userData.tailRotor.rotation.x += dt * 60;
      this.root.userData.beacon.visible = Math.floor(this.t * 1.4) % 2 === 0;
      const horiz = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      // Searchlight on Jay while it has him; otherwise sweeping the ground below it.
      const night = game.fx.night || 0;
      const aimX = this.tracking ? t.pos.x : this.pos.x + Math.sin(this.t * 0.9) * 14;
      const aimZ = this.tracking ? t.pos.z : this.pos.z + Math.cos(this.t * 0.7) * 14;
      const aimY = this.tracking ? t.pos.y : 0;
      const from = new THREE.Vector3(this.pos.x, this.pos.y - 1, this.pos.z);
      const dir = new THREE.Vector3(aimX - from.x, aimY - from.y, aimZ - from.z);
      const len = dir.length();
      this.cone.position.copy(from);
      this.cone.scale.set(1, len, 1);
      this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      this.cone.visible = night > 0.2 && !this.leaving;
      this.cone.material.opacity = 0.12 * night;
      this.spot.position.copy(from);
      this.spot.target.position.set(aimX, aimY, aimZ);
      this.spot.target.updateMatrixWorld();
      this.spot.intensity = this.leaving ? 0 : 400 + night * 2600;
      if (this.leaving && horiz > 500) this.gone = true;
      // Sound.
      const audio = game.audio;
      if (audio.ready && audio.createHelicopter) {
        if (!this._voice) this._voice = audio.createHelicopter();
        const cam = game.renderer.camera.position;
        const d = Math.hypot(this.pos.x - cam.x, this.pos.y - cam.y, this.pos.z - cam.z);
        this._voice.update({ gain: 1 / (1 + Math.pow(d / 40, 1.4)), pan: game.vehicleFeedback._pan(this.pos.x, this.pos.z), rate: 1 });
      }
    }

    dispose() {
      this.game.scene.remove(this.root, this.cone);
      this.spot.intensity = 0;
      this.spot.position.set(0, -200, 0);
      if (this._voice) this._voice.stop();
    }
  }

  Police.COP_LOOK = COP_LOOK;
  Police.PursuitDriver = PursuitDriver;
  Police.OfficerBrain = OfficerBrain;
  VH.Police = Police;
})();
