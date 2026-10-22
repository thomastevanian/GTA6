/*
 * missions.js — the story engine. Runs the missions in VH.Data.story
 * (see docs/mission-format.md), step by step:
 *
 *   start markers    available jobs glow on the street (and on the map);
 *                    walk into one and press E. You can't start one with
 *                    the police on your tail
 *   steps            scenes, blackouts, phone calls, texts, goto, cars,
 *                    people, crew, fights, waves, chases, tails, races,
 *                    deliveries, pickups, heat, choices and branches
 *   fail conditions  knocked out, arrested, a protected character killed,
 *                    a mission car wrecked, crew left behind, time up,
 *                    a target escaping or spotting you
 *   checkpoints      a failed mission can be retried from its last checkpoint
 *   cinematics       letterboxed cutscenes with an automatic camera that
 *                    cuts between speakers
 *
 * Progress (completed jobs, flags, money, weapons, stats) is saved to the
 * browser after every job, and on Save in the pause menu.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep, dampAngle } = VH.math;
  const SAVE_KEY = 'vicehaven.save.v1';

  class MissionFailed extends Error {
    constructor(reason) {
      super(reason);
      this.reason = reason;
    }
  }

  class Aborted extends Error {}

  // Steps a checkpoint replay rebuilds (they only set the world up).
  const SETUP_STEPS = new Set(['spawnCar', 'spawn', 'join', 'leave', 'setFlag', 'protect', 'music', 'setTime']);
  // Steps that wait for Jay to do something; their objective ends with them.
  const OBJECTIVE_STEPS = new Set(['goto', 'getIn', 'kill', 'survive', 'chase', 'follow', 'race', 'deliver', 'collect', 'destroy', 'loseHeat']);

  // ------------------------------------------------------------ brains
  /** A story character standing about: faces Jay, gestures when speaking. */
  // Story cars with names of their own ("Lulu", "Constance") don't take "the".
  const CAR_NAMES = {
    lulu: 'Lulu', medic12: 'Medic 12', constance: 'Constance', foxes_car: 'the Foxes\' car', dex_tow: 'Dex\'s tow truck',
    calder_car: 'Calder\'s car', horne_cruiser: 'Horne\'s cruiser', voss_car: 'Voss\'s Sovereign', solace_van: 'Solace\'s van', teo_ride: 'Teo\'s lowrider',
  };
  function carRef(v, capital) {
    const n = v.storyName || 'the ' + v.name;
    return capital ? n.charAt(0).toUpperCase() + n.slice(1) : n;
  }

  class IdleBrain {
    constructor(engine) {
      this.engine = engine;
    }

    update(a, dt) {
      a.moveSpeed = 0;
      const p = this.engine.game.player;
      const d = Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
      if (a.lookAt) a.heading = dampAngle(a.heading, Math.atan2(a.lookAt.x - a.pos.x, a.lookAt.z - a.pos.z), 4, dt);
      else if (d < 9) a.heading = dampAngle(a.heading, Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z), 3, dt);
      talkAnim(a, this.engine.game.dialogue, dt);
      if (a.goal) {
        const gx = a.goal.x - a.pos.x;
        const gz = a.goal.z - a.pos.z;
        const gd = Math.hypot(gx, gz);
        if (gd > 0.5) {
          a.heading = dampAngle(a.heading, Math.atan2(gx, gz), 8, dt);
          a.moveSpeed = a.goal.run ? 5 : 1.5;
          a.anim.sprint = !!a.goal.run;
        } else a.goal = null;
      }
    }
  }

  /** Talking gestures follow the voice: while it plays, bigger when shouting, a lift on each word. */
  function talkAnim(a, dialogue, dt) {
    const target = dialogue.talkLevel(a.charId);
    a.anim.talk += (target - a.anim.talk) * Math.min(1, dt * 9);
    a.anim.talkEnergy = dialogue.talkEnergy(a.charId);
  }

  /** Crew: follows Jay, rides in his car, fights beside him. */
  class CrewBrain {
    constructor(engine, weapon) {
      this.engine = engine;
      this.weapon = weapon || 'pistol';
      this._fireT = 1;
      this._think = 0;
      this.target = null;
      this.seat = null;
    }

    update(a, dt) {
      if (a.dead) return;
      const game = this.engine.game;
      const p = game.player;
      const v = p.vehicle;
      // Riding along.
      if (a.inCar) {
        const car = a.inCar;
        if (car.removed || car.wrecked || car !== v) {
          this._getOut(a, car);
        } else {
          a.pos.copy(car.pos);
          a.pos.y += 0.3;
          // Shoot out of the window at enemies and police.
          this._fireT -= dt;
          if (this._fireT <= 0) {
            this._fireT = 0.6 + Math.random() * 0.8;
            const t = this._nearestHostile(a, 30);
            if (t && game.combat) game.combat.npcFire(a, t, this.weapon, 0.35);
          }
          return;
        }
      }
      if (v && !a.inCar) {
        // Get in: run to the car, then hop in. The crew always fit, whatever
        // Jay is driving (the back of a van, three across in a two-seater):
        // being left on the kerb because Jay likes his sports car isn't a job.
        const d = Math.hypot(v.pos.x - a.pos.x, v.pos.z - a.pos.z);
        if (d < v.hx + 1.8 || (d < 25 && this._waitCar > 6)) {
          a.inCar = v;
          a.hidden = true;
          this._waitCar = 0;
          VH.events.emit('vehicle:door', { v, open: true });
          return;
        }
        this._waitCar = (this._waitCar || 0) + dt;
        a.heading = dampAngle(a.heading, Math.atan2(v.pos.x - a.pos.x, v.pos.z - a.pos.z), 8, dt);
        a.moveSpeed = d > 1.5 ? 5.2 : 0;
        a.anim.sprint = true;
        a.anim.aim = 0;
        return;
      }
      this._waitCar = 0;
      // Fight nearby enemies.
      this._think -= dt;
      if (this._think <= 0) {
        this._think = 0.5;
        this.target = this._nearestHostile(a, 35);
      }
      const t = this.target;
      if (t && !t.dead) {
        const dx = t.pos.x - a.pos.x;
        const dz = t.pos.z - a.pos.z;
        a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 8, dt);
        a.anim.aim = 1;
        a.anim.weaponPose = this.weapon === 'pistol' || this.weapon === 'revolver' ? 'pistol' : 'rifle';
        a.moveSpeed = 0;
        this._fireT -= dt;
        if (this._fireT <= 0) {
          this._fireT = 0.45 + Math.random() * 0.6;
          if (game.combat) game.combat.npcFire(a, t, this.weapon, 0.55);
        }
        return;
      }
      // Follow Jay.
      a.anim.aim = 0;
      const dx = p.pos.x - a.pos.x;
      const dz = p.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const slot = this.engine.crewIndex(a);
      if (d > 2.4 + slot * 0.9) {
        a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 7, dt);
        a.moveSpeed = d > 7 ? 5.3 : d > 4 ? 3.2 : 1.6;
        a.anim.sprint = d > 7;
      } else {
        a.moveSpeed = 0;
        talkAnim(a, game.dialogue, dt);
        if (d > 0.1) a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 3, dt);
      }
      // Too far behind (Jay drove off on foot?): catch up.
      if (d > 60 && !p.inVehicle) {
        a.pos.set(p.pos.x - Math.sin(p.heading) * 3, p.pos.y, p.pos.z - Math.cos(p.heading) * 3);
      }
    }

    _getOut(a, car) {
      a.inCar = null;
      a.hidden = false;
      const side = (this.engine.crewIndex(a) % 2 ? -1 : 1);
      const w = car.localToWorld(side * (car.hx + 0.7), -0.6 - this.engine.crewIndex(a) * 0.4, {});
      a.pos.set(w.x, this.engine.game.physics.groundHeight(w.x, w.z, car.pos.y + 1.5), w.z);
      a.heading = car.yaw;
    }

    _nearestHostile(a, r) {
      let best = null;
      let bestD = r;
      for (const b of this.engine.game.crowd.agents) {
        if (b.dead || b.hidden || !this.engine.isHostile(b)) continue;
        const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best;
    }
  }

  /** Runs, then cowers. */
  class FleeBrain {
    constructor(engine, from, seconds) {
      this.engine = engine;
      this.from = from;
      this.t = seconds || 6 + Math.random() * 3;
    }

    update(a, dt) {
      this.t -= dt;
      const p = this.from || this.engine.game.player.pos;
      if (this.t > 0) {
        // Away from the threat, but round walls: every so often pick the most
        // open heading near "straight away" instead of sprinting into a wall.
        this._pick = (this._pick || 0) - dt;
        if (this._pick <= 0 || this._want === undefined) {
          this._pick = 0.4;
          const away = Math.atan2(a.pos.x - p.x, a.pos.z - p.z);
          const ph = this.engine.game.physics;
          let best = away;
          let bestScore = -Infinity;
          for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1]) {
            const h = away + off;
            let free = 0;
            for (let s = 1.5; s <= 7.5; s += 1.5) {
              if (ph.overlaps(a.pos.x + Math.sin(h) * s, a.pos.z + Math.cos(h) * s, 0.35, a.pos.y + 0.3, a.pos.y + 1.6)) break;
              free = s;
            }
            const score = free * 2 - Math.abs(off) * 1.2;
            if (score > bestScore) {
              bestScore = score;
              best = h;
            }
          }
          this._want = best;
        }
        a.heading = dampAngle(a.heading, this._want, 6, dt);
        a.moveSpeed = 5;
        a.anim.sprint = true;
      } else if (!a.persistent && this.t < -3) {
        // Nobody needs them any more (a stood-down gang member): back to
        // being a pedestrian, who streams out like any other.
        a.anim.cower = 0;
        a.anim.sprint = false;
        a.brain = null;
        a.walk = null;
      } else {
        a.moveSpeed = 0;
        a.anim.cower = 1;
      }
    }

    expired(a, d) {
      return !a.persistent && (d > 140 || (a.dead && a.deadTime > 30));
    }
  }

  /** Someone who has left the crew: they walk off and fade out of the scene. */
  class LeaveBrain {
    constructor(engine, to) {
      this.engine = engine;
      this.to = to || null; // walk in through this door (else just away from Jay)
      this.t = 0;
    }

    /** Once the job is over (not persistent any more): gone when out of sight or inside. */
    expired(a) {
      return !a.persistent && (a.hidden || this.t > 45);
    }

    update(a, dt) {
      const game = this.engine.game;
      this.t += dt;
      talkAnim(a, game.dialogue, dt);
      if (this.t < 1.2) {
        a.moveSpeed = 0;
        return;
      }
      const p = game.player.pos;
      if (this.to) {
        a.heading = dampAngle(a.heading, Math.atan2(this.to.x - a.pos.x, this.to.z - a.pos.z), 3, dt);
        a.moveSpeed = 1.5;
        if (Math.hypot(this.to.x - a.pos.x, this.to.z - a.pos.z) < 1.6 || this.t > 30) {
          a.hidden = true;
          a.moveSpeed = 0;
        }
        return;
      }
      a.heading = dampAngle(a.heading, Math.atan2(a.pos.x - p.x, a.pos.z - p.z), 2, dt);
      a.moveSpeed = 1.4;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if ((d > 35 && !game.isVisible(a.pos.x, a.pos.y + 1, a.pos.z, 1)) || d > 70 || this.t > 40) {
        a.hidden = true;
        a.moveSpeed = 0;
      }
    }
  }

  // --------------------------------------------------- AI drivers for story
  /** A target car that runs through the city. */
  class FleeDriver {
    constructor(engine, v, route) {
      this.engine = engine;
      this.game = engine.game;
      this.lane = new VH.LaneDriver(this.game.traffic, { aggressive: true, speedMul: 1.4, ignoreRed: true, gap: 0.7, plow: true });
      this.lane.maxSpeed = 31;
      v.plow = true; // nothing in the street stops a car running from Jay
      this.route = route || null;
      this.ri = 0;
      const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
      this._t = 0;
    }

    onBump() {}

    /** Out of road and nerve: pull over and stop (the chase step decides when). */
    giveUp(v) {
      this.gaveUp = true;
      v.plow = false;
    }

    update(v, dt) {
      if (this.gaveUp) {
        v.input.accel = v.speed > 0.5 ? -1 : 0;
        v.input.steer = 0;
        v.input.boost = 0;
        v.input.handbrake = v.speed < 4 ? 1 : 0;
        return;
      }
      this._t -= dt;
      if (this._t <= 0) {
        this._t = 2;
        if (this.route && this.route.length) {
          const p = this.route[this.ri % this.route.length];
          if (Math.hypot(p.x - v.pos.x, p.z - v.pos.z) < 40) this.ri++;
          this.lane.destination = this.route[this.ri % this.route.length];
        } else {
          // Away from Jay.
          const pp = this.game.player.pos;
          this.lane.destination = { x: v.pos.x + (v.pos.x - pp.x) * 3, z: v.pos.z + (v.pos.z - pp.z) * 3 };
        }
        const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
        if (lp && lp.dist > 7) this.lane.initAt(lp);
      }
      this.lane.update(v, dt);
    }
  }

  /** Drives somewhere at normal speed (the car Jay tails). */
  class TourDriver {
    constructor(engine, v, dest, opts) {
      this.game = engine.game;
      // The car Jay tails never gets stuck in a queue or behind a parked car:
      // it ploughs through (see LaneDriver.plow).
      this.lane = new VH.LaneDriver(this.game.traffic, Object.assign({ speedMul: 0.95, plow: true }, opts || {}));
      this.dest = dest;
      // Where it actually pulls up: the lane nearest the destination (a place
      // like a shop front or a loading bay is often 15-30 m off the road).
      const stop = this.game.roadnet.nearestLane(dest.x, dest.z, undefined, 80);
      this.stopAt = stop ? { x: stop.x, z: stop.z } : dest;
      this.lane.destination = this.stopAt;
      this.t = 0;
      this._nearT = 0;
      v.plow = true;
      const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
    }

    onBump(v, other) {
      if (other && other.driver === 'player') this.bumped = true;
    }

    update(v, dt) {
      this.t += dt;
      // Following another car (an escort): the stop point moves with it, and
      // pulling up behind it is a pause, not the end of the drive.
      if (this.follow) {
        this._followT = (this._followT || 0) - dt;
        if (this._followT <= 0) {
          this._followT = 1;
          this.stopAt = { x: this.dest.x, z: this.dest.z };
          this.lane.destination = this.stopAt;
          const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
          if (lp && lp.dist > 7) this.lane.initAt(lp);
        }
        if (Math.hypot(this.dest.x - v.pos.x, this.dest.z - v.pos.z) < 12) {
          v.input.accel = v.speed > 0.5 ? -1 : 0;
          v.input.steer = 0;
          v.input.handbrake = v.speed < 4 ? 1 : 0;
          return;
        }
        this.lane.update(v, dt);
        return;
      }
      const d = Math.hypot(this.dest.x - v.pos.x, this.dest.z - v.pos.z);
      const dStop = Math.hypot(this.stopAt.x - v.pos.x, this.stopAt.z - v.pos.z);
      // Circling the block near the destination counts as being there.
      if (d < 90) this._nearT += dt;
      // It always gets somewhere: at the kerb by the destination, close to it
      // for a while, or (never driving forever) after five minutes.
      if (this.arrived || d < 14 || dStop < 16 || this._nearT > 20 || this.t > 300) {
        v.input.accel = v.speed > 0.5 ? -1 : 0;
        v.input.steer = 0;
        v.input.handbrake = v.speed < 4 ? 1 : 0;
        this.arrived = true;
        v.plow = false;
        return;
      }
      this.lane.update(v, dt);
    }
  }

  /**
   * Comes after Jay (Halberd boxing in Lulu): through traffic on the roads
   * while he's far, then straight at his car to ram it. Jay on foot: pulls
   * up short of him.
   */
  class HuntDriver {
    constructor(engine, v) {
      this.game = engine.game;
      this.lane = new VH.LaneDriver(this.game.traffic, { aggressive: true, speedMul: 1.3, ignoreRed: true, gap: 0.7, plow: true });
      this.lane.maxSpeed = 30;
      v.plow = true; // through traffic; it's never heavier than Jay's car (see vehicles._resolvePair)
      this._routeT = 0;
      this._stuckT = 0;
      this._reverseT = 0;
      this._feelT = 0;
      this._avoid = 0;
      this._l = {};
      const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
    }

    onBump() {}

    update(v, dt) {
      const p = this.game.player;
      const tgt = p.inVehicle ? p.vehicle : p;
      const dist = Math.hypot(tgt.pos.x - v.pos.x, tgt.pos.z - v.pos.z);
      v.input.boost = 0;
      if (this._reverseT > 0) {
        this._reverseT -= dt;
        v.input.accel = -0.8;
        v.input.steer = this._revSteer;
        v.input.handbrake = 0;
        return;
      }
      if (!p.inVehicle && dist < 16) {
        v.input.accel = v.vF > 0.5 ? -1 : 0;
        v.input.steer = 0;
        v.input.handbrake = v.speed < 1 ? 1 : 0;
        return;
      }
      if (dist > 45 || !p.inVehicle) {
        this._routeT -= dt;
        if (this._routeT <= 0) {
          this._routeT = 1;
          this.lane.destination = { x: tgt.pos.x + (tgt.vel ? tgt.vel.x * 2 : 0), z: tgt.pos.z + (tgt.vel ? tgt.vel.z * 2 : 0) };
          const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
          if (lp && lp.dist > 6) this.lane.initAt(lp);
        }
        this.lane.update(v, dt);
        this._checkStuck(v, dt);
        return;
      }
      // Close: aim where his car will be and drive into it.
      const closing = Math.max(8, v.speed - (tgt.vel.x * v.forwardX + tgt.vel.z * v.forwardZ) + 6);
      const lead = clamp(dist / closing, 0, 1.2);
      const l = v.worldToLocal(tgt.pos.x + tgt.vel.x * lead, tgt.pos.z + tgt.vel.z * lead, this._l);
      let angle = Math.atan2(l.x, Math.max(0.1, l.z));
      if (l.z < 0) angle = l.x >= 0 ? 1.2 : -1.2;
      this._feelT -= dt;
      if (this._feelT <= 0) {
        this._feelT = 0.1;
        this._avoid = this._feelers(v, tgt);
      }
      angle += this._avoid;
      v.input.steer = clamp(angle / 0.5, -1, 1);
      v.input.accel = Math.abs(angle) > 1.1 && v.speed > 12 ? -0.4 : 1;
      v.input.handbrake = Math.abs(angle) > 1.3 && v.speed > 8 ? 1 : 0;
      v.topSpeedBoost = dist > 30 ? 1.1 : 1;
      this._checkStuck(v, dt);
    }

    /** Walls ahead push the steering away (Jay's car doesn't count). */
    _feelers(v, tgt) {
      const ph = this.game.physics;
      const y = v.pos.y + 0.7;
      const len = 6 + v.speed * 0.6;
      let push = 0;
      for (const [a, w] of [[-0.45, 1], [0.45, -1]]) {
        const yaw = v.yaw + a;
        const dx = Math.sin(yaw);
        const dz = Math.cos(yaw);
        const hit = ph.raycast(v.pos.x + dx * v.hz, y, v.pos.z + dz * v.hz, dx, 0, dz, len, { flags: VH.COLLIDE.SOLID, ground: false });
        if (hit && hit.t < Math.hypot(tgt.pos.x - v.pos.x, tgt.pos.z - v.pos.z)) push += w * 0.7 * (1 - hit.t / len);
      }
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

  /** A street racer: follows the checkpoints on the road network, fast. */
  class RaceDriver {
    constructor(engine, v, checkpoints, skill) {
      this.game = engine.game;
      this.cps = checkpoints;
      this.i = 0;
      this.skill = skill || 1;
      this.lane = new VH.LaneDriver(this.game.traffic, { aggressive: true, speedMul: 1.5 * this.skill, ignoreRed: true, gap: 0.6 });
      this.lane.maxSpeed = 30 + 12 * this.skill;
      const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
      this.lane.destination = this.cps[0];
      this.finished = false;
      this.go = false;
    }

    onBump() {}

    update(v, dt) {
      if (!this.go) {
        v.input.accel = 0;
        v.input.handbrake = 1;
        return;
      }
      if (this.finished) {
        // Over the line: ease off and cruise on with the traffic, not park in the lane.
        if (!this._cruising) {
          this._cruising = true;
          this.lane.destination = null;
          this.lane.aggressive = false;
          this.lane.ignoreRed = false;
          this.lane.speedMul = 0.7;
          this.lane.maxSpeed = 14;
        }
        this.lane.update(v, dt);
        v.input.boost = 0;
        return;
      }
      const cp = this.cps[this.i];
      const dCp = Math.hypot(cp.x - v.pos.x, cp.z - v.pos.z);
      // Lost (knocked off line, looping a block): if the checkpoint hasn't got
      // closer for a while, re-plan from the lane that heads its way.
      if (this._bestD === undefined || dCp < this._bestD - 5) {
        this._bestD = dCp;
        this._noProgress = 0;
      } else this._noProgress = (this._noProgress || 0) + dt;
      if (this._noProgress > 6) {
        this._noProgress = 0;
        this._bestD = dCp;
        const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, Math.atan2(cp.x - v.pos.x, cp.z - v.pos.z), 30);
        if (lp) this.lane.initAt(lp);
        this.lane.destination = cp;
      }
      if (dCp < 14) {
        this.i++;
        if (this.i >= this.cps.length) {
          this.finished = true;
          this.finishTime = this.game.time;
          return;
        }
        this.lane.destination = this.cps[this.i];
        this._bestD = undefined;
        const lp = this.game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
        if (lp) this.lane.initAt(lp);
      }
      // Close to the checkpoint and off the lane path: aim straight at it.
      this.lane.update(v, dt);
      v.input.boost = 0;
    }
  }

  // ------------------------------------------------------------- engine
  class MissionEngine {
    constructor(game) {
      this.game = game;
      this.story = VH.Data.story || { characters: {}, places: {}, missions: [], side: [] };
      this.completed = {};
      this.flags = {};
      this.run = null; // the mission in progress
      this.markers = [];
      this.cinematic = null;
      this.suppressHeat = false;
      this._waiters = [];
      this._abort = null;
      this._markerTime = 0;
      this.stats = { missions: 0, side: 0 };
      this.game.dialogue.addCast(this.story.characters || {});
      this.game.places.define(this.story.places || {});
      this._index();
      this._buildMarkerAssets();
      this._bindEvents();
    }

    _index() {
      this.all = new Map();
      this.main = (this.story.missions || []).slice();
      this.main.forEach((m, i) => {
        m._main = true;
        m._index = i;
        if (!m.requires) m.requires = i > 0 ? [this.main[i - 1].id] : [];
        this.all.set(m.id, m);
      });
      this.side = this.story.side || [];
      for (const chain of this.side) {
        chain.missions.forEach((m, i) => {
          m._chain = chain;
          if (!m.requires) m.requires = i > 0 ? [chain.missions[i - 1].id] : chain.unlockAfter ? [chain.unlockAfter] : [];
          if (!m.giver) m.giver = chain.giver;
          this.all.set(m.id, m);
        });
      }
    }

    _bindEvents() {
      VH.events.on('player:died', () => this.fail('You were knocked out.'));
      VH.events.on('player:arrested', () => this.fail('You were arrested.'));
    }

    // --------------------------------------------------------- progress
    isAvailable(m) {
      if (this.completed[m.id] && !m.repeatable) return false;
      for (const r of m.requires || []) if (!this.completed[r]) return false;
      if (m.requiresFlag && !this.flags[m.requiresFlag]) return false;
      return true;
    }

    available() {
      const out = [];
      for (const m of this.all.values()) if (this.isAvailable(m)) out.push(m);
      return out;
    }

    get nextMain() {
      return this.main.find((m) => !this.completed[m.id]) || null;
    }

    get progress() {
      const total = this.all.size;
      const done = Object.keys(this.completed).filter((id) => this.all.has(id)).length;
      return { done, total, pct: total ? done / total : 0 };
    }

    // ---------------------------------------------------------- markers
    _buildMarkerAssets() {
      this._ringGeo = new THREE.RingGeometry(1.8, 2.3, 48).rotateX(-Math.PI / 2);
      this._beamGeo = new THREE.CylinderGeometry(0.9, 0.9, 30, 20, 1, true).translate(0, 15, 0);
      this._objGroup = new THREE.Group();
      this._objGroup.name = 'mission objective';
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      const beam = new THREE.Mesh(this._beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.2), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this._objGroup.add(ring, beam);
      this._objRing = ring;
      this._objGroup.visible = false;
      this.game.scene.add(this._objGroup);
      // A bobbing arrow over a moving target (the car to chase, the people to stop).
      const arrowGeo = new THREE.ConeGeometry(0.55, 1.1, 4).rotateX(Math.PI);
      this._objArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.25), transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
      this._objArrow.renderOrder = 20; // seen through buildings, like the HUD marker
      this._objArrow.visible = false;
      this._objArrow.name = 'mission target arrow';
      this.game.scene.add(this._objArrow);
    }

    _markerFor(m, taken) {
      // A chained job normally starts by itself; if that moment was missed
      // (quit, or a failed attempt) it waits at its resumeAt place instead.
      let place = this._place(MissionEngine.selfStarting(m) ? m.resumeAt : m.start);
      if (!place) return null;
      // Two jobs starting at one place get a ring each, side by side.
      if (taken && taken.some((t) => Math.hypot(t.x - place.x, t.z - place.z) < 4)) {
        const ph = this.game.physics;
        const yaw = place.yaw || 0;
        const y = place.y || 0;
        for (const d of [4.5, -4.5, 9, -9, 13.5, -13.5]) {
          const x = place.x + Math.cos(yaw) * d;
          const z = place.z - Math.sin(yaw) * d;
          if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
          const gh = ph.groundHeight(x, z, y + 1);
          if (Math.abs(gh - y) > 0.8 && !(y === 0 && gh < 0.8)) continue;
          if (ph.overlaps(x, z, 0.6, gh + 0.3, gh + 1.8)) continue;
          place = Object.assign({}, place, { x, z });
          break;
        }
      }
      if (taken) taken.push(place);
      const color = m._main ? new THREE.Color(3, 1.3, 0.35) : new THREE.Color(0.4, 1.6, 3);
      const g = new THREE.Group();
      const ring = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      const beam = new THREE.Mesh(this._beamGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.55), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.add(ring, beam);
      g.position.set(place.x, (place.y || 0.15) + 0.03, place.z);
      g.name = 'job marker ' + m.id;
      this.game.scene.add(g);
      const item = {
        id: 'mission:' + m.id, kind: 'mission', mission: m, x: place.x, y: (place.y || 0.15) + 1, z: place.z, radius: 2.8,
        label: (m._main ? 'Start ' : 'Side job: ') + '“' + m.title + '”',
      };
      this.game.interaction.register(item);
      return { m, g, ring, item, place };
    }

    refreshMarkers() {
      for (const mk of this.markers) {
        this.game.scene.remove(mk.g);
        mk.item.enabled = false;
      }
      this.game.interaction.items = this.game.interaction.items.filter((it) => it.kind !== 'mission');
      this.markers = [];
      if (this.run) return;
      const taken = [];
      // Story jobs first, so they keep the spot and the side job moves over.
      const list = this.available().slice().sort((a, b) => (b._main ? 1 : 0) - (a._main ? 1 : 0));
      for (const m of list) {
        if (MissionEngine.selfStarting(m) && (!m.resumeAt || this._chainPending === m.id)) continue;
        const mk = this._markerFor(m, taken);
        if (mk) this.markers.push(mk);
      }
    }

    /** Minimap blips for jobs and the current objective. */
    blips(out) {
      if (!this.run) {
        for (const mk of this.markers) out.push({ x: mk.place.x, z: mk.place.z, type: mk.m._main ? 'mission' : mk.m.giver === 'race' ? 'race' : 'challenge', label: mk.m.title });
        return;
      }
      const r = this.run;
      if (r.marker) out.push({ x: r.marker.x, z: r.marker.z, type: 'objective', label: r.objective || '' });
      for (const a of r.targets || []) if (!a.dead && !a.hidden) out.push({ x: a.pos.x, z: a.pos.z, type: 'enemy' });
      for (const c of r.targetCars || []) if (!c.removed && !c.wrecked) out.push({ x: c.pos.x, z: c.pos.z, type: 'enemy', heading: c.yaw });
      for (const id of r.crew) {
        const a = r.actors.get(id);
        if (a && !a.dead && !a.hidden) out.push({ x: a.pos.x, z: a.pos.z, type: 'mission', label: a.name });
      }
      for (const c of r.watchCars || []) if (!c.removed && !c.wrecked && c.driver !== 'player') out.push({ x: c.pos.x, z: c.pos.z, type: 'car' });
    }

    // ------------------------------------------------------------- start
    start(m, fromCheckpoint) {
      const game = this.game;
      if (this.run) return;
      const isRetry = this._retriedFrom === m.id;
      this._retriedFrom = null;
      if (game.police.level > 0) {
        game.hud.notify({ title: 'Too hot', text: 'Lose the police before you start a job.', icon: '✕', tone: 'bad' });
        return;
      }
      if (game.challenges && game.challenges.active) game.challenges.abandon(true);
      // What an autosave falls back to while this job runs. Retrying the same
      // job keeps the snapshot from before the first attempt.
      if (!(this._preRun && this._preRunFor === m.id && isRetry)) {
        this._preRun = this._saveData();
        this._preRunFor = m.id;
      }
      this._chainPending = null;
      const run = (this.run = {
        m, actors: new Map(), cars: new Map(), groups: new Map(), crew: [], protect: new Set(), failIf: (m.failIf || []).slice(),
        marker: null, objective: '', timer: null, targets: [], targetCars: [], watchCars: [], checkpoint: fromCheckpoint || 0,
        stepIndex: 0, started: game.time, token: {}, money: game.player.money,
      });
      this._abort = run.token;
      document.body.classList.add('on-mission');
      this.refreshMarkers();
      game.hud.missionTitle(m.title, m._main ? 'Act ' + (m.act || 1) : (m._chain ? m._chain.title : 'Side job'));
      if (game.audio.missionStart) game.audio.missionStart();
      VH.events.emit('mission:start', { m });
      if (m.time !== undefined && !fromCheckpoint) this._setTime(m.time, true);
      this._runSteps(m.steps, run, fromCheckpoint || 0)
        .then(() => {
          if (this.run === run) this._pass(run);
        })
        .catch((err) => {
          if (err instanceof Aborted) return;
          // A waiter's failure was already handled by _failNow (this.run is
          // null by now); one thrown between steps (a lost race) wasn't.
          if (err instanceof MissionFailed) {
            if (this.run === run) this._failNow(run, err.reason);
            return;
          }
          console.error('[missions] step error', err);
          if (this.run === run) this._failNow(run, 'Something went wrong (' + err.message + ')');
        });
    }

    async _runSteps(steps, run, startAt) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (run.token !== this._abort) throw new Aborted();
        if (startAt && i < startAt) {
          // Replaying up to a checkpoint: only rebuild the world state.
          const kind = MissionEngine.kindOf(step);
          if (SETUP_STEPS.has(kind)) await this._exec(step, run, true);
          continue;
        }
        if (!run.depth && steps === run.m.steps) run.stepIndex = i; // depth is 0, not undefined, after a branch
        if (step.checkpoint && steps === run.m.steps) {
          run.checkpoint = i;
          this._checkpointPos = this._snapshotPlayer();
          // What a retry from here starts with (choices made before it stay made).
          run.cpFlags = JSON.parse(JSON.stringify(this.flags));
          run.cpMoney = run.midMoney || 0;
        }
        await this._exec(step, run, false);
        // Done is done: "(0 left)" doesn't hang about through the scene that follows.
        const kind = MissionEngine.kindOf(step);
        if (this.run === run && (OBJECTIVE_STEPS.has(kind) || (step.objective && kind !== 'objective' && !SETUP_STEPS.has(kind)))) this._objective(null);
      }
    }

    /** Jobs that start by themselves (the opening, chained finales) rather than at a marker. */
    static selfStarting(m) {
      return m.start === 'chain' || m.start === 'auto' || m.start === 'intro';
    }

    static kindOf(step) {
      const keys = ['scene', 'blackout', 'phone', 'text', 'goto', 'spawnCar', 'getIn', 'spawn', 'join', 'leave', 'kill', 'survive', 'protect', 'chase', 'follow', 'race', 'deliver', 'collect', 'destroy', 'heat', 'loseHeat', 'wait', 'timer', 'choice', 'if', 'setFlag', 'music', 'slowmo', 'setTime', 'fade', 'teleport', 'camera', 'reward', 'objective', 'checkpoint'];
      for (const k of keys) if (step[k] !== undefined) return k;
      if (step.say) return 'say';
      return 'none';
    }

    // ------------------------------------------------------------- steps
    async _exec(step, run, setup) {
      const game = this.game;
      const kind = MissionEngine.kindOf(step);
      if (step.objective && kind !== 'objective') this._objective(step.objective);
      // Ambient lines alongside the step (car banter, radio chatter).
      if (step.say && kind !== 'say' && kind !== 'scene' && kind !== 'phone' && !setup) game.dialogue.play(step.say, { mode: 'ambient' });
      switch (kind) {
        case 'say':
          if (!setup) await game.dialogue.play(step.say, { mode: step.mode || 'ambient' });
          return;
        case 'scene':
          if (!setup) await this._scene(step, run);
          return;
        case 'blackout':
          if (!setup) await this._blackout(step.blackout);
          return;
        case 'phone':
          if (!setup) await game.dialogue.play(step.say || [], { mode: 'phone', from: step.phone });
          return;
        case 'text':
          if (!setup) game.dialogue.text(step.text, step.message || '');
          return;
        case 'objective':
          this._objective(step.objective);
          return;
        case 'checkpoint':
          return;
        case 'goto':
          return this._goto(step, run);
        case 'spawnCar':
          this._spawnCar(step, run);
          return;
        case 'getIn':
          return this._getIn(step, run);
        case 'spawn':
          this._spawnPeople(step.spawn, run);
          return;
        case 'join':
          for (const id of [].concat(step.join)) this._join(id, run, step.weapon);
          return;
        case 'leave':
          for (const id of [].concat(step.leave)) this._leave(id, run, step);
          return;
        case 'protect':
          for (const id of [].concat(step.protect)) run.protect.add(id);
          return;
        case 'kill':
          return this._kill(step, run);
        case 'survive':
          return this._survive(step, run);
        case 'chase':
          return this._chase(step, run);
        case 'follow':
          return this._follow(step, run);
        case 'race':
          return this._race(step, run);
        case 'deliver':
          return this._deliver(step, run);
        case 'collect':
          return this._collect(step, run);
        case 'destroy':
          return this._destroy(step, run);
        case 'heat':
          game.police.setLevel(step.heat, 'mission');
          game.police._sawPlayer();
          return;
        case 'loseHeat':
          this._objective(step.objective || 'Lose the cops');
          this._setMarker(null);
          return this._until(() => game.police.level === 0, run);
        case 'wait':
          if (!setup) await this._sleep(step.wait, run);
          return;
        case 'timer':
          run.pendingTimer = step.timer;
          return;
        case 'choice':
          return this._choice(step, run);
        case 'if': {
          const ok = MissionEngine.testFlag(Object.assign({}, this.completed, this.flags), step.if); // mission ids count as flags once passed
          const branch = ok ? step.then : step.else;
          if (branch) {
            run.depth = (run.depth || 0) + 1;
            await this._runSteps(branch, run, 0);
            run.depth--;
          }
          return;
        }
        case 'setFlag':
          for (const f of [].concat(step.setFlag)) this.flags[f] = true;
          return;
        case 'music':
          this._music(step.music);
          return;
        case 'slowmo':
          if (!setup) game.slowmo(step.slowmo, 0.3);
          return;
        case 'setTime':
          this._setTime(step.setTime, !setup);
          return;
        case 'fade':
          if (!setup) {
            game.hud.setFade(step.fade === 'out' ? 1 : 0, 700);
            await this._sleep(0.75, run);
          }
          return;
        case 'teleport':
          this._teleport(step.teleport, step.vehicle);
          return;
        case 'camera':
          if (!setup) await this._establish(step.camera, step.seconds || 4, run);
          return;
        case 'reward':
          if (!setup) {
            this._reward(step.reward, true);
            run.midMoney = (run.midMoney || 0) + ((step.reward && step.reward.money) || 0);
          }
          return;
        default:
          return;
      }
    }

    static testFlag(flags, expr) {
      if (Array.isArray(expr)) return expr.every((e) => MissionEngine.testFlag(flags, e));
      if (typeof expr === 'string' && expr.startsWith('!')) return !flags[expr.slice(1)];
      return !!flags[expr];
    }

    // ---------------------------------------------------------- helpers
    _until(fn, run, timeLimit, timeoutReason) {
      return new Promise((resolve, reject) => {
        const limit = timeLimit !== undefined ? timeLimit : run.pendingTimer;
        run.pendingTimer = null;
        const w = { fn, resolve, reject, run, t: 0, limit, reason: timeoutReason || 'You ran out of time.' };
        if (limit) {
          run.timer = { left: limit };
          this.game.hud.setMissionTimer(limit);
        }
        this._waiters.push(w);
      });
    }

    _sleep(seconds, run) {
      let t = 0;
      return this._until(() => (t += this._dt || 0) >= seconds, run, 0);
    }

    _objective(text) {
      if (!this.run) return;
      this.run.objective = text;
      this.game.hud.setObjectiveText(text);
    }

    /**
     * The objective is something that moves (a car to chase, people to stop):
     * the marker, the arrow over it and the GPS route follow whatever getter()
     * returns each frame (null when there's nothing left to point at).
     */
    _track(getter) {
      const run = this.run;
      if (!run) return;
      this._setMarker(null);
      run.track = getter;
    }

    /** The nearest of a list that is still in play (people or cars). */
    _nearestOf(list) {
      const p = this.game.player.pos;
      let best = null;
      let bd = Infinity;
      for (const o of list) {
        if (!o || o.dead || o.removed || o.wrecked || o.hidden) continue;
        const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      return best;
    }

    _setMarker(pos, opts) {
      const run = this.run;
      if (!run) return;
      run.track = null;
      if (this._objArrow) this._objArrow.visible = false;
      run.marker = pos ? { x: pos.x, y: pos.y || 0, z: pos.z, r: (opts && opts.r) || 4 } : null;
      this._objGroup.visible = !!pos && !(opts && opts.noRing);
      if (pos) {
        this._objGroup.position.set(pos.x, (pos.y || this.game.physics.groundHeight(pos.x, pos.z, 50)) + 0.04, pos.z);
        const s = ((opts && opts.r) || 4) / 2.5;
        this._objRing.scale.set(s, 1, s);
      }
      this._routeTo = pos && !(opts && opts.noRoute) ? pos : null;
      this._routeT = 0;
    }

    _snapshotPlayer() {
      const p = this.game.player;
      const v = p.vehicle;
      return { x: p.pos.x, z: p.pos.z, yaw: p.heading, car: v ? { type: v.type, color: v.model.color, x: v.pos.x, z: v.pos.z, yaw: v.yaw, id: this._carIdOf(v) } : null };
    }

    _carIdOf(v) {
      if (!this.run) return null;
      for (const [id, c] of this.run.cars) if (c === v) return id;
      return null;
    }

    // --------------------------------------------------------- people
    lookFor(charId) {
      const c = (this.story.characters || {})[charId];
      if (!c) return null;
      const L = c.look || {};
      const build = L.build || 'average';
      return {
        skin: L.skin || 0xc68c64, hair: L.hair || 0x1a1410, top: L.top || 0x33415c, trim: L.trim || L.top || 0x33415c,
        shirt: L.shirt || L.top || 0xe9e7e1, bottom: L.bottom || 0x2e3f5c, shoes: L.shoes || 0x202020,
        cap: !!L.hat, longHair: L.longHair !== undefined ? !!L.longHair : (c.voice && c.voice.gender === 'female'), bag: !!L.bag,
        height: L.height || (build === 'tall' ? 1.07 : build === 'slim' ? 0.98 : 1.0),
        build: build === 'heavy' ? 1.16 : build === 'slim' ? 0.9 : 1.0,
      };
    }

    factionLook(fid, i) {
      const f = (this.story.factions || {})[fid];
      const base = VH.Crowd.randomLook();
      if (fid === 'police' || fid === 'vpd') return Object.assign({}, VH.Police.COP_LOOK, { skin: base.skin });
      if (!f || !f.colors) return base;
      const colors = f.colors;
      base.top = colors[i % colors.length];
      base.trim = base.top;
      base.shirt = colors[(i + 1) % colors.length];
      base.bottom = f.bottom || 0x1c1c1f;
      base.cap = f.caps !== undefined ? f.caps && Math.random() < 0.6 : Math.random() < 0.4;
      return base;
    }

    isHostile(a) {
      return !!a.missionHostile || (a.brain instanceof VH.CombatBrain && a.brain.hostile && a.faction !== 'civilian');
    }

    crewIn(v) {
      const out = [];
      if (!this.run) return out;
      for (const id of this.run.crew) {
        const a = this.run.actors.get(id);
        if (a && a.inCar === v) out.push(a);
      }
      return out;
    }

    /**
     * Jay pulled the driver out of a job car (vehicles.js 'vehicle:jack'):
     * whoever the job put at the wheel lands on the road by the door and runs
     * (an armed enemy stays to fight). Returns false if the car had no such
     * driver, so the crowd can put an ordinary one there.
     */
    ejectDriver(v, side) {
      const run = this.run;
      if (!run) return false;
      for (const [id, a] of run.actors) {
        if (a.inCar !== v || a.dead || run.crew.includes(id)) continue;
        a.inCar = null;
        a.hidden = false;
        const w = v.localToWorld((side || 1) * (v.hx + 1.1), v.hz * 0.1, {});
        a.pos.set(w.x, this.game.physics.groundHeight(w.x, w.z, v.pos.y + 1.5), w.z);
        a.heading = v.yaw + (side || 1) * Math.PI / 2;
        if (!(a.brain instanceof VH.CombatBrain)) a.brain = new FleeBrain(this, { x: v.pos.x, z: v.pos.z }, 8);
        return true;
      }
      return false;
    }

    crewIndex(a) {
      return this.run ? Math.max(0, this.run.crew.indexOf(a.charId)) : 0;
    }

    _spawnPeople(list, run) {
      const game = this.game;
      const placed = [];
      for (const e of [].concat(list)) {
        const place = this._place(e.at) || game.player.pos;
        const floor = this._floorOf(place);
        const count = e.count || 1;
        // Someone already in this job (a scene brought them on) isn't doubled: the earlier copy goes.
        if (e.char) this._retire(e.id || e.char, run);
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + (e.char ? 0 : Math.random() * 0.5);
          const r = count > 1 ? 1.5 + Math.random() * 3.5 : 0;
          // On the floor of the place (a roof's people stand on the roof), clear of walls and cars.
          const spot = this._standSpot(place.x + Math.cos(ang) * r + (e.offset ? e.offset[0] : 0), place.z + Math.sin(ang) * r + (e.offset ? e.offset[1] : 0), floor, placed);
          placed.push(spot);
          const x = spot.x;
          const z = spot.z;
          const hostile = e.hostile !== undefined ? e.hostile : e.faction && e.faction !== 'civilian' && e.faction !== 'crew' && e.faction !== 'friendly';
          const look = e.char ? this.lookFor(e.char) : this.factionLook(e.faction, i);
          const opts = { look, faction: e.faction || (e.char ? 'story' : 'civilian'), role: 'story', persistent: true, health: e.health || (hostile ? 100 : 150), armor: e.armor || 0, heading: place.yaw || 0, name: e.char ? (this.story.characters[e.char] || {}).name : null };
          let a;
          const behavior = e.behavior || (hostile ? 'guard' : 'idle');
          if (hostile || behavior === 'attack' || behavior === 'guard' || behavior === 'patrol') {
            a = game.combat.spawnEnemy(x, z, Object.assign({}, opts, { weapon: e.weapon || 'pistol', alert: behavior === 'attack', guard: behavior === 'guard' ? { x, z, r: 7 } : null, accuracy: e.accuracy, hostile }));
            a.missionHostile = hostile;
            if (hostile) run.targets.push(a);
          } else {
            a = game.crowd.spawn(x, z, opts);
            a.brain = behavior === 'flee' ? new FleeBrain(this, null, e.flee) : behavior === 'cower' ? { update: (ag) => { ag.moveSpeed = 0; ag.anim.cower = 1; } } : behavior === 'wander' ? null : new IdleBrain(this);
            if (behavior === 'follow') a.brain = new CrewBrain(this, e.weapon);
          }
          a.pos.y = spot.y;
          a.charId = e.char || null;
          a.weapon = e.weapon || a.weapon || null;
          const id = e.char ? (e.id || e.char) : e.id ? (count > 1 ? e.id + '_' + i : e.id) : 'npc_' + a.id;
          run.actors.set(id, a);
          if (e.group) {
            if (!run.groups.has(e.group)) run.groups.set(e.group, []);
            run.groups.get(e.group).push(a);
          }
          if (e.car && behavior === 'drive') {
            const car = run.cars.get(e.car);
            if (car) {
              a.hidden = true;
              a.inCar = car;
              car.driver = 'ai';
              const after = run.cars.get(e.to);
              if (after && after === game.player.vehicle) car.controller = new HuntDriver(this, car);
              else {
                car.controller = new TourDriver(this, car, this._place(e.to) || { x: car.pos.x, z: car.pos.z });
                if (after) car.controller.follow = true;
              }
            }
          }
          if (behavior === 'follow') this._join(id, run, e.weapon);
        }
      }
    }

    /** Take an earlier copy of a story character out of the world (it's about to be placed again). */
    _retire(id, run) {
      const a = run.actors.get(id);
      this._retireStrays(id);
      if (!a || a.dead || a.removed) return;
      a.inCar = null;
      this.game.crowd.remove(a);
      run.actors.delete(id);
    }

    /**
     * A finished job lets its cast wander off as pedestrians; when a later job
     * brings the same character on (often at the same place), that leftover
     * copy goes, so Mae isn't standing next to Mae.
     */
    _retireStrays(charId, keep) {
      if (!charId) return;
      for (const a of this.game.crowd.agents.slice()) {
        if (a.charId === charId && a !== keep && !a.persistent && !a.dead) this.game.crowd.remove(a);
      }
    }

    _join(id, run, weapon) {
      let a = run.actors.get(id);
      if (!a && (this.story.characters || {})[id]) {
        // Not placed yet: bring them in next to Jay.
        const p = this.game.player;
        const spot = this._standSpot(p.pos.x - Math.sin(p.heading) * 2, p.pos.z - Math.cos(p.heading) * 2, p.pos.y, [p.pos], 6);
        a = this.game.crowd.spawn(spot.x, spot.z, { look: this.lookFor(id), faction: 'crew', role: 'story', persistent: true, health: 200, name: this.story.characters[id].name });
        a.pos.y = spot.y;
        a.charId = id;
        run.actors.set(id, a);
      }
      if (!a) return;
      this._retireStrays(a.charId, a);
      a.brain = new CrewBrain(this, weapon || a.weapon || 'pistol');
      a.faction = 'crew';
      // Named crew are plot: losing the job because the AI wandered into a
      // grenade isn't fair. They can still go down if Jay leaves them exposed.
      if (a.charId) {
        a.damageScale = 0.3;
        a.health = Math.max(a.health, 200);
      }
      if (!run.crew.includes(id)) run.crew.push(id);
      // Hop straight into Jay's car if he's in one.
      const v = this.game.player.vehicle;
      if (v && Math.hypot(v.pos.x - a.pos.x, v.pos.z - a.pos.z) < 30) {
        a.inCar = v;
        a.hidden = true;
      }
    }

    /**
     * Someone leaves the job. { vanish: true } is gone at once (a disappearing
     * act); { into: place } walks to that place's door and goes inside (a
     * prisoner handed in); otherwise they get out and stroll off.
     */
    _leave(id, run, opts) {
      const a = run.actors.get(id);
      run.crew = run.crew.filter((c) => c !== id);
      if (!a) return;
      if (opts && opts.vanish) {
        this._retire(id, run);
        return;
      }
      if (a.inCar) {
        const car = a.inCar;
        a.brain._getOut && a.brain._getOut(a, car);
      }
      const into = opts && opts.into ? this._place(opts.into) : null;
      a.brain = new LeaveBrain(this, into && (into.door || into));
      a.faction = 'story';
      a.damageScale = 0;
      a.leaving = true;
    }

    _spawnCar(step, run) {
      const game = this.game;
      let place = this._place(step.at) || game.player.pos;
      // A rooftop's cars wait in the street by its stairs, not up on the roof.
      if (place.roof && place.door) place = place.door;
      let x = place.x;
      let z = place.z;
      let heading = step.heading !== undefined ? step.heading : place.yaw || 0;
      // Put it on the nearest lane (or kerbside) unless the place says otherwise.
      let kerb = false;
      if (!step.exact) {
        // A car the job will hand to an AI driver (a chase, a tail) starts in a
        // lane, even from a yard or a quay, so it can drive off at once.
        const driven = this._drivenLater(run, step.spawnCar);
        const lp = game.roadnet.nearestLane(x, z, undefined, driven ? 100 : undefined);
        if (lp && lp.dist < (driven ? 100 : 40)) {
          let pk = this._kerbPoint(lp);
          if (driven) {
            // In the lane, facing the way with more road ahead (not into a dead end).
            const r = lp.road;
            const ahead = lp.dir > 0 ? r.to - lp.along : lp.along - r.from;
            const dir = ahead < 80 ? -lp.dir : lp.dir;
            pk = game.roadnet.lanePoint(r, dir, lp.lane, Math.min(r.to - 6, Math.max(r.from + 6, lp.along)), {});
          }
          x = pk.x;
          z = pk.z;
          heading = pk.heading;
          kerb = true;
        }
      }
      const kx = x;
      const kz = z;
      if (step.offset) {
        x += step.offset[0];
        z += step.offset[1];
      }
      // Somewhere it fits: not on a roof, in a wall or on top of another car.
      if (!step.exact) {
        const spot = this._carSpot(x, z, heading, kx, kz, kerb);
        x = spot.x;
        z = spot.z;
        heading = spot.heading;
      }
      const type = VH.Vehicle.typeSpec(step.type) ? step.type : 'halcyon';
      const v = game.vehicles.spawn(type, x, z, heading, { color: step.color, role: 'mission', persistent: true });
      v.role = 'mission';
      v.persistent = true;
      v.missionOwned = true;
      if (step.locked) v.noEnter = true;
      if (step.police) v.isPolice = true;
      run.cars.set(step.spawnCar, v);
      if (step.name || CAR_NAMES[step.spawnCar]) v.storyName = step.name || CAR_NAMES[step.spawnCar];
      if (run.failIf.includes('wrecked:' + step.spawnCar)) v.damageScale = 0.4;
      if (step.watch !== false) run.watchCars.push(v);
      return v;
    }

    /** Does a later step of this job give car `id` an AI driver? */
    _drivenLater(run, id) {
      const walk = (list) => (list || []).some((st) => st && typeof st === 'object' && (st.chase === id || st.follow === id ||
        (st.spawn || []).some((e) => e && e.car === id && e.behavior === 'drive') ||
        ['steps', 'then', 'else', 'branch'].some((k) => Array.isArray(st[k]) && walk(st[k]))));
      return !!(id && run && run.m && walk(run.m.steps));
    }

    _kerbPoint(lp) {
      const pk = lp.road.parking ? this.game.roadnet.parkingPoint(lp.road, lp.dir, lp.along) : lp;
      return { x: pk.x, z: pk.z, heading: pk.heading };
    }

    // ------------------------------------------------------- placement
    /** Can a car stand here: on the street (not a roof, the sand or the bay), clear of walls and other cars? */
    _carFits(x, z, heading, clearance) {
      const ph = this.game.physics;
      const g = ph.groundHeight(x, z, 50);
      if (g > 0.8 || g < -0.1) return false;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      for (const k of [-1.7, 0, 1.7]) if (ph.overlaps(x + fx * k, z + fz * k, 1.05, g + 0.35, g + 1.5)) return false;
      const c = clearance || 5.6;
      return !this.game.vehicles.list.some((o) => !o.removed && Math.hypot(o.pos.x - x, o.pos.z - z) < c);
    }

    /**
     * The nearest spot to (x, z) a car fits: back towards its base point
     * (kx, kz) if an offset pushed it into a building, then along the kerb
     * or yard it was put on (both ways); a place no car can stand on (the
     * sand, a roof) sends it to the nearest kerb within 80 m instead.
     */
    _carSpot(x, z, heading, kx, kz, kerb) {
      if (this._carFits(x, z, heading)) return { x, z, heading };
      if (kx !== x || kz !== z) {
        for (let i = 1; i <= 8; i++) {
          const qx = x + ((kx - x) * i) / 8;
          const qz = z + ((kz - z) * i) / 8;
          if (this._carFits(qx, qz, heading)) return { x: qx, z: qz, heading };
        }
      }
      // Slide in steps of a car length and a bit along `dir` (both ways), keeping heading h.
      const along = (px, pz, h, dir) => {
        const d = dir === undefined ? h : dir;
        for (let k = 1; k <= 6; k++) {
          for (const sgn of [1, -1]) {
            const qx = px + Math.sin(d) * 6.6 * k * sgn;
            const qz = pz + Math.cos(d) * 6.6 * k * sgn;
            if (this._carFits(qx, qz, h)) return { x: qx, z: qz, heading: h };
          }
        }
        return null;
      };
      // Along the kerb; or, on an open yard it was already standing on, along
      // the frontage it faces (a car at a warehouse door shuffles up beside
      // the next door, not out into the yard or off to the road).
      const g0 = this.game.physics.groundHeight(kx, kz, 50);
      if (kerb) {
        const slid = along(kx, kz, heading);
        if (slid) return slid;
      } else if (g0 <= 0.8 && g0 >= -0.1) {
        const slid = along(kx, kz, heading, heading + Math.PI / 2) || along(kx, kz, heading);
        if (slid) return slid;
      }
      const lp = this.game.roadnet.nearestLane(kx, kz, undefined, 80);
      if (lp) {
        const pk = this._kerbPoint(lp);
        if (this._carFits(pk.x, pk.z, pk.heading)) return pk;
        const slid = along(pk.x, pk.z, pk.heading);
        if (slid) return slid;
      }
      return along(kx, kz, heading) || { x: kx, z: kz, heading };
    }

    /** Is (x, z) inside (or within `pad` of) a car's body? */
    _inCar(x, z, pad) {
      const l = this._tmpLocal || (this._tmpLocal = {});
      for (const v of this.game.vehicles.list) {
        if (v.removed || Math.abs(v.pos.x - x) > 7 || Math.abs(v.pos.z - z) > 7) continue;
        v.worldToLocal(x, z, l);
        if (Math.abs(l.x) < v.hx + pad && Math.abs(l.z) < v.hz + pad) return true;
      }
      return false;
    }

    /** The floor people stand on at a place: its own height (a rooftop's is the roof), or the street. */
    _floorOf(place) {
      return place.y !== undefined ? place.y : this.game.physics.groundHeight(place.x, place.z, 2);
    }

    /**
     * Somewhere a person can stand near (x, z): a floor within a step of `y`
     * (so never off a roof edge, down on the sand or in the bay), clear of
     * walls, cars and anyone in `avoid`. Rings outward when the spot is taken.
     */
    _standSpot(x, z, y, avoid, maxR) {
      const ph = this.game.physics;
      const test = (px, pz) => {
        const g = ph.groundHeight(px, pz, y + 0.7);
        if (Math.abs(g - y) > 0.7) return null;
        if (ph.overlaps(px, pz, 0.38, g + 0.3, g + 1.75)) return null;
        if (this._inCar(px, pz, 0.45)) return null;
        if (avoid) for (const o of avoid) if (Math.hypot(o.x - px, o.z - pz) < 0.8) return null;
        return g;
      };
      const g0 = test(x, z);
      if (g0 !== null) return { x, y: g0, z };
      for (let r = 0.8; r <= (maxR || 10); r += 0.8) {
        const n = Math.max(8, Math.round(r * 5));
        for (let i = 0; i < n; i++) {
          const a = r * 1.7 + (i / n) * Math.PI * 2;
          const px = x + Math.cos(a) * r;
          const pz = z + Math.sin(a) * r;
          const g = test(px, pz);
          if (g !== null) return { x: px, y: g, z: pz };
        }
      }
      return { x, y, z };
    }

    _place(id) {
      if (!id) return null;
      if (typeof id === 'object') return id;
      const run = this.run;
      if (run && run.actors.has(id)) return run.actors.get(id).pos;
      if (run && run.cars.has(id)) return run.cars.get(id).pos;
      return this.game.places.get(id);
    }

    // ------------------------------------------------------------ goto
    async _goto(step, run) {
      const game = this.game;
      const place = this._place(step.goto);
      if (!place) return;
      const radius = step.radius || (step.vehicle ? 7 : 3.2);
      const needCar = step.vehicle === true;
      const carId = typeof step.vehicle === 'string' ? step.vehicle : null;
      const onFoot = step.vehicle === false;
      const label = step.objective || 'Go to ' + (place.name || 'the marker');
      // Rooftops: the door first, then up the stairs.
      if (place.roof && place.door) {
        await this._goto(Object.assign({}, step, { goto: place.door, objective: step.objective || 'Take the stairs to the roof', vehicle: false, radius: 2.5 }), run);
        game.hud.setFade(1, 500);
        await this._sleep(0.55, run);
        game.player.teleport(place.x, place.z, place.yaw || 0, place.y);
        game.cameraRig.snapBehind(game.player);
        game.hud.setFade(0, 700);
        return;
      }
      this._setMarker(place, { r: radius });
      this._objective(label);
      await this._until(() => {
        const p = game.player;
        const v = p.vehicle;
        // Vehicle requirements change what the HUD asks for.
        if (needCar && !v) {
          this._objective('Get a car');
          return false;
        }
        if (carId) {
          const car = run.cars.get(carId);
          if (car && car.wrecked) throw new MissionFailed(carRef(car, true) + ' was wrecked.');
          if (car && v !== car) {
            this._objective('Get back in ' + carRef(car));
            return false;
          }
        }
        if (onFoot && v) {
          if (Math.hypot(p.pos.x - place.x, p.pos.z - place.z) < radius + 12) this._objective('Get out of the car');
          return false;
        }
        this._objective(label);
        const d = Math.hypot(p.pos.x - place.x, p.pos.z - place.z);
        if (d > radius) return false;
        if (step.stop !== false && v && v.speed > 2) {
          this._objective('Stop the car');
          return false;
        }
        return true;
      }, run);
      this._setMarker(null);
    }

    async _getIn(step, run) {
      const game = this.game;
      const id = step.getIn;
      if (id === 'any') {
        this._objective(step.objective || 'Get a car');
        this._setMarker(null);
        return this._until(() => !!game.player.vehicle, run);
      }
      const car = run.cars.get(id);
      if (!car) return;
      // Whatever locked it earlier (a chase, a tail, `locked`), Jay is told to get in now.
      car.noEnter = false;
      this._objective(step.objective || 'Get in ' + carRef(car));
      await this._until(() => {
        if (car.wrecked) throw new MissionFailed(carRef(car, true) + ' was wrecked.');
        this._setMarker(car.pos, { r: 3, noRing: true });
        return game.player.vehicle === car;
      }, run);
      this._setMarker(null);
    }

    // ---------------------------------------------------------- scenes
    async _scene(step, run) {
      const game = this.game;
      const sc = step.scene || {};
      const p = game.player;
      // Scenes happen on foot.
      if (p.inVehicle) {
        game.hud.setFade(1, 400);
        await this._sleep(0.45, run);
        const v = p.vehicle;
        v.vel.set(0, 0, 0);
        game.vehicles.exitVehicle();
        game.hud.setFade(0, 500);
      }
      const place = this._place(sc.at) || p.pos;
      // Everyone stands on the place's floor (a rooftop scene is up on the roof), clear of walls and cars.
      const floor = this._floorOf(place);
      // A scene somewhere else: cut there.
      if (Math.hypot(place.x - p.pos.x, place.z - p.pos.z) > 40) {
        game.hud.setFade(1, 400);
        await this._sleep(0.45, run);
        const js = this._standSpot(place.x - Math.sin(place.yaw || 0) * 3, place.z - Math.cos(place.yaw || 0) * 3, floor, null, 6);
        p.teleport(js.x, js.z, place.yaw || 0, js.y);
        game.hud.setFade(0, 500);
      }
      const cast = [];
      const taken = [p.pos];
      (sc.cast || []).forEach((c, i) => {
        const id = typeof c === 'string' ? c : c.id;
        if (id === 'jay') return;
        let a = run.actors.get(id);
        const ang = Math.PI * 0.6 + i * 0.9;
        const spot = () => this._standSpot(place.x + Math.sin((place.yaw || 0) + ang) * 2.2, place.z + Math.cos((place.yaw || 0) + ang) * 2.2, floor, taken, 6);
        // Someone who walked off earlier, or is across town: they're here now.
        if (a && !a.dead && !a.inCar && (a.hidden || a.leaving || Math.hypot(a.pos.x - place.x, a.pos.z - place.z) > 30)) {
          a.hidden = false;
          a.leaving = false;
          const s = spot();
          a.pos.set(s.x, s.y, s.z);
          if (!run.crew.includes(id)) a.brain = new IdleBrain(this);
        }
        if (!a || a.dead) {
          const s = spot();
          a = game.crowd.spawn(s.x, s.z, { look: this.lookFor(id) || VH.Crowd.randomLook(), faction: 'story', role: 'story', persistent: true, health: 200, name: (this.story.characters[id] || {}).name });
          a.pos.y = s.y;
          a.charId = id;
          a.brain = new IdleBrain(this);
          run.actors.set(id, a);
        }
        if (a.inCar) {
          a.brain._getOut && a.brain._getOut(a, a.inCar);
        }
        this._retireStrays(id, a);
        taken.push(a.pos);
        cast.push(a);
      });
      // Everyone faces the group's middle.
      let mx = p.pos.x;
      let mz = p.pos.z;
      for (const a of cast) {
        mx += a.pos.x;
        mz += a.pos.z;
      }
      mx /= cast.length + 1;
      mz /= cast.length + 1;
      for (const a of cast) a.lookAt = { x: mx, z: mz };
      p.frozen = true;
      game.frozenControls = true;
      document.body.classList.add('cutscene');
      game.dialogue.letterbox(true);
      this.cinematic = { cast, place, mid: { x: mx, z: mz }, shot: -1, cut: 0, t: 0, run };
      await game.dialogue.play(step.say || [], { mode: 'scene' });
      this.cinematic = null;
      for (const a of cast) a.lookAt = null;
      game.dialogue.letterbox(false);
      document.body.classList.remove('cutscene');
      p.frozen = false;
      game.frozenControls = false;
      game.cameraRig.snapBehind(p);
    }

    async _blackout(lines) {
      const game = this.game;
      game.player.frozen = true;
      game.frozenControls = true;
      document.body.classList.add('cutscene');
      await game.dialogue.play(lines || [], { mode: 'blackout' });
      document.body.classList.remove('cutscene');
      game.player.frozen = false;
      game.frozenControls = false;
    }

    async _establish(placeId, seconds, run) {
      const place = this._place(placeId);
      if (!place) return;
      this.cinematic = Object.assign({ establish: place, t: 0, dur: seconds }, this._establishOrbit(place, seconds));
      document.body.classList.add('cutscene');
      this.game.dialogue.letterbox(true);
      await this._sleep(seconds, run);
      this.cinematic = null;
      this.game.dialogue.letterbox(false);
      document.body.classList.remove('cutscene');
      this.game.cameraRig.snapBehind(this.game.player);
    }

    /** The cutscene camera: over the shoulder of whoever listens, on whoever speaks. */
    updateCamera(dt, cam) {
      const c = this.cinematic;
      if (!c) return false;
      c.t += dt;
      if (c.establish) {
        const p = c.establish;
        if (c.a0 === undefined) Object.assign(c, this._establishOrbit(p, c.dur || 4));
        const look = this._v1 || (this._v1 = new THREE.Vector3());
        look.set(p.x, (p.y || 0) + 2, p.z);
        this._orbitPos(p, c, c.t, cam.position);
        this._unblock(look, cam.position);
        cam.lookAt(look);
        cam.updateMatrixWorld();
        return true;
      }
      const game = this.game;
      const speakerId = game.dialogue.speaker;
      const players = [game.player].concat(c.cast);
      const posOf = (who) => (who === game.player ? game.player.renderPos : who.pos);
      let speaker = players.find((a) => a !== game.player && a.charId === speakerId) || (speakerId === 'jay' ? game.player : null);
      if (!speaker) speaker = c.cast[0] || game.player;
      if (speaker !== c.lastSpeaker) {
        c.lastSpeaker = speaker;
        c.shot++;
        c.cut = 0;
      }
      c.cut += dt;
      const sp = posOf(speaker);
      const mode = c.shot === 0 && c.t < 3 ? 'wide' : 'close';
      if (mode !== c.mode) {
        c.mode = mode;
        c.rot = null; // a new kind of shot looks for its own clear angle
      }
      // Listener: someone else in the scene (Jay by default).
      const listener = speaker === game.player ? c.cast[c.shot % Math.max(1, c.cast.length)] || null : game.player;
      const headY = (speaker === game.player ? sp.y : sp.y) + 1.58;
      let from;
      if (c.shot === 0 && c.t < 3) {
        // Opening wide shot.
        const a = Math.atan2(sp.x - c.mid.x, sp.z - c.mid.z) + 1.9;
        from = new THREE.Vector3(c.mid.x + Math.sin(a) * 7.5, headY + 1.8 - c.t * 0.3, c.mid.z + Math.cos(a) * 7.5);
      } else if (listener) {
        const lp = posOf(listener);
        const dx = sp.x - lp.x;
        const dz = sp.z - lp.z;
        const d = Math.hypot(dx, dz) || 1;
        const side = c.shot % 2 ? 1 : -1;
        // Behind the listener's shoulder.
        from = new THREE.Vector3(lp.x - (dx / d) * 1.1 + (-dz / d) * 0.55 * side, headY + 0.05, lp.z - (dz / d) * 1.1 + (dx / d) * 0.55 * side);
      } else {
        const yaw = speaker.heading || 0;
        from = new THREE.Vector3(sp.x + Math.sin(yaw) * 2.4, headY, sp.z + Math.cos(yaw) * 2.4);
      }
      // Slow push-in on each shot.
      const look = new THREE.Vector3(sp.x, headY - 0.05, sp.z);
      // Each shot swings round (once, when it starts) to an angle with nothing
      // between the camera and the speaker, and never sits inside a wall.
      if (c.rot === null || c.rot === undefined || c.cut < dt * 1.5) c.rot = this._clearAngle(look, from);
      if (c.rot) this._swing(look, from, c.rot);
      const push = smoothstep(0, 6, c.cut) * 0.35;
      from.lerp(look, push * 0.25);
      this._unblock(look, from);
      if (!c.camPos || c.cut < dt * 1.5) c.camPos = from.clone();
      else c.camPos.lerp(from, 1 - Math.exp(-3 * dt));
      cam.position.copy(c.camPos);
      cam.lookAt(look);
      if (cam.fov !== 42) {
        cam.fov = 42;
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld();
      return true;
    }

    // --------------------------------------------------- camera clearance
    /** Where the establishing orbit is at time t (radius, start angle and height from _establishOrbit). */
    _orbitPos(p, o, t, out) {
      const a = o.a0 + t * 0.12;
      return out.set(p.x + Math.cos(a) * o.radius, (p.y || 0) + o.height + t * 0.6, p.z + Math.sin(a) * o.radius);
    }

    /** How much of the way from `look` to `from` the camera can see (1 = all of it), and it's not inside anything. */
    _clearFrac(look, from) {
      const ph = this.game.physics;
      const dx = from.x - look.x;
      const dy = from.y - look.y;
      const dz = from.z - look.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.01) return 1;
      if (ph.overlaps(from.x, from.z, 0.3, from.y - 0.3, from.y + 0.3, VH.COLLIDE.CAMERA)) return 0;
      const hit = ph.raycast(look.x, look.y, look.z, dx / d, dy / d, dz / d, d, { flags: VH.COLLIDE.CAMERA, inflate: 0.15, ignoreInside: true });
      return hit ? hit.t / d : 1;
    }

    /**
     * An establishing shot circles the place from 26 m out and 11 m up. Pick
     * the first start angle (then a tighter radius) whose whole move keeps
     * the place in view; boxed in on every side, look down from high above.
     */
    _establishOrbit(p, dur) {
      const look = new THREE.Vector3(p.x, (p.y || 0) + 2, p.z);
      const at = new THREE.Vector3();
      let best = null;
      for (const radius of [26, 18, 12]) {
        for (let k = 0; k < 12; k++) {
          const o = { a0: 0.8 + (k * Math.PI) / 6, radius, height: 11 };
          let seen = 0;
          for (const t of [0, dur * 0.5, dur]) seen += this._clearFrac(look, this._orbitPos(p, o, t, at)) > 0.97 ? 1 : 0;
          if (seen === 3) return o;
          if (!best || seen > best.seen) best = Object.assign(o, { seen });
        }
      }
      return best && best.seen >= 2 ? best : { a0: 0.8, radius: 5, height: 34 };
    }

    /** Swing `from` round `look` by `rot` radians (level). */
    _swing(look, from, rot) {
      const dx = from.x - look.x;
      const dz = from.z - look.z;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      from.x = look.x + dx * c - dz * s;
      from.z = look.z + dx * s + dz * c;
      return from;
    }

    /** The smallest swing round `look` that gives `from` a clear view of it (0 if it already has one). */
    _clearAngle(look, from) {
      if (this._clearFrac(look, from) > 0.9) return 0;
      const v = from.clone();
      let best = 0;
      let bestF = -1;
      for (const r of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, Math.PI]) {
        const f = this._clearFrac(look, this._swing(look, v.copy(from), r));
        if (f > 0.9) return r;
        if (f > bestF) {
          bestF = f;
          best = r;
        }
      }
      return best;
    }

    /** Pull the camera in front of whatever still stands between it and `look` (a wall, a parked van). */
    _unblock(look, from) {
      const dx = from.x - look.x;
      const dy = from.y - look.y;
      const dz = from.z - look.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.5) return from;
      const hit = this.game.physics.raycast(look.x, look.y, look.z, dx / d, dy / d, dz / d, d, { flags: VH.COLLIDE.CAMERA, inflate: 0.15, ignoreInside: true });
      if (!hit) return from;
      const k = Math.max(0.6, hit.t - 0.3) / d;
      return from.set(look.x + dx * k, look.y + dy * k, look.z + dz * k);
    }

    // ----------------------------------------------------------- fights
    _group(ref, run) {
      if (typeof ref === 'string' && ref.startsWith('group:')) return run.groups.get(ref.slice(6)) || [];
      const out = [];
      for (const id of [].concat(ref)) {
        if (run.groups.has(id)) out.push(...run.groups.get(id));
        else if (run.actors.has(id)) out.push(run.actors.get(id));
        else {
          for (const [k, a] of run.actors) if (k.startsWith(id + '_')) out.push(a);
        }
      }
      return out;
    }

    async _kill(step, run) {
      const list = this._group(step.kill, run);
      if (!list.length) return;
      run.targets = list;
      for (const a of list) if (a.brain && a.brain.setAlert && step.alert !== false) a.brain.setAlert(a);
      const need = step.count || list.length;
      const base = step.objective || 'Take them out';
      this._track(() => this._nearestOf(list));
      await this._until(() => {
        const dead = list.filter((a) => a.dead || a.removed).length;
        this._objective(base + (list.length > 1 ? ' (' + Math.max(0, need - dead) + ' left)' : ''));
        return dead >= need;
      }, run);
      run.targets = [];
    }

    async _survive(step, run) {
      const game = this.game;
      const waves = step.waves || [];
      let t = 0;
      const spawned = new Set();
      const mine = []; // this step's waves (other enemies in the job may still have work to do)
      this._objective(step.objective || 'Hold out');
      this._track(() => this._nearestOf(run.targets));
      run.timer = { left: step.survive };
      game.hud.setMissionTimer(step.survive);
      await this._until(() => {
        t += this._dt;
        waves.forEach((w, i) => {
          if (spawned.has(i) || t < (w.delay || 0)) return;
          spawned.add(i);
          const place = this._place(w.at) || game.player.pos;
          // Waves arrive from out of sight, 25–45 m out, then close in.
          const from = this._waveSpot(place);
          const taken = [];
          for (let k = 0; k < (w.count || 3); k++) {
            const ang = Math.random() * Math.PI * 2;
            const r = 1.5 + Math.random() * 3;
            const s = this._standSpot(from.x + Math.cos(ang) * r, from.z + Math.sin(ang) * r, from.y, taken, 6);
            taken.push(s);
            const a = game.combat.spawnEnemy(s.x, s.z, {
              look: this.factionLook(w.faction || 'gang', k), faction: w.faction || 'gang', weapon: w.weapon || 'pistol', alert: true, accuracy: w.accuracy,
            });
            a.pos.y = s.y;
            a.missionHostile = true;
            run.targets.push(a);
            mine.push(a);
          }
        });
        run.timer.left = Math.max(0, step.survive - t);
        return t >= step.survive;
      }, run, 0);
      game.hud.setMissionTimer(null);
      run.timer = null;
      this._standDown(run, mine);
    }

    /** Where a wave comes from: 25–45 m out, on the same level, somewhere Jay can't see it appear. */
    _waveSpot(place) {
      const game = this.game;
      const floor = this._floorOf(place);
      let fallback = null;
      for (let k = 0; k < 16; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 25 + Math.random() * 20;
        const s = this._standSpot(place.x + Math.cos(ang) * r, place.z + Math.sin(ang) * r, floor, null, 4);
        if (Math.abs(s.y - floor) > 1.2 || Math.hypot(s.x - place.x, s.z - place.z) < 18) continue;
        // (_standSpot hands back the raw point when nothing near is free: check it's real ground, not a wall or the bay.)
        const gh = game.physics.groundHeight(s.x, s.z, floor + 0.7);
        if (Math.abs(gh - floor) > 0.7 || game.physics.overlaps(s.x, s.z, 0.38, gh + 0.3, gh + 1.75)) continue;
        if (!game.isVisible(s.x, s.y + 1, s.z, 1.2)) return s;
        fallback = fallback || s;
      }
      return fallback || this._standSpot(place.x, place.z, floor);
    }

    /** The fight is over: whoever is left of the attackers (list, or all of them) gives up and runs, and stops counting as a mission enemy. */
    _standDown(run, list) {
      const who = list || run.targets || [];
      for (const a of who) {
        if (a.dead || a.removed) continue;
        a.missionHostile = false;
        a.persistent = false;
        if (a.brain && a.brain.hostile !== undefined) a.brain.hostile = false;
        a.faction = 'fled'; // not a civilian: shooting one isn't murdering a passer-by
        a.anim.aim = 0;
        a.anim.weaponPose = null;
        a.brain = new FleeBrain(this, this.game.player.pos, 10);
      }
      run.targets = list ? (run.targets || []).filter((a) => !list.includes(a)) : [];
    }

    async _chase(step, run) {
      const game = this.game;
      const car = run.cars.get(step.chase);
      if (!car) return;
      const route = (step.route || []).map((id) => this._place(id)).filter(Boolean);
      car.driver = 'ai';
      car.controller = new FleeDriver(this, car, route.length ? route : null);
      car.noEnter = true;
      run.targetCars = [car];
      const mode = step.mode || 'wreck';
      this._objective(step.objective || (mode === 'catch' ? 'Stop ' + carRef(car) : 'Take out ' + carRef(car)));
      this._track(() => (car.wrecked || car.removed ? null : car));
      let lostT = 0;
      let boxT = 0;
      let onTail = 0;
      await this._until(() => {
        const p = game.player;
        const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
        if (car.wrecked || car.health < 60) return true;
        // Keep on their tail long enough and they give up and pull over, so a
        // chase always ends (sooner the more Jay has knocked them about).
        if (d < 90) onTail += this._dt * (car.health < 600 ? 2 : 1);
        if (car.controller && !car.controller.gaveUp && car.controller.giveUp && onTail > (step.giveUpAfter || 60)) {
          car.controller.giveUp(car);
          this._objective(mode === 'catch' ? 'They\'re pulling over. Get alongside to stop them.' : 'They\'ve stopped. Finish it.');
        }
        if (mode === 'catch') {
          if (car.speed < 2.5 && d < car.hz + 9) boxT += this._dt;
          else boxT = Math.max(0, boxT - this._dt);
          if (boxT > 1.8 || car.health < 300) {
            car.controller = null;
            car.driver = null;
            car.plow = false;
            car.input.accel = 0;
            car.input.handbrake = 1;
            // Caught, not wrecked: it's often the car Jay has to drive next.
            car.health = Math.max(car.health, 550);
            car.burning = 0;
            car.noEnter = false;
            return true;
          }
        }
        if (d > (step.escape || 260)) lostT += this._dt;
        else lostT = 0;
        if (lostT > 6) throw new MissionFailed('They got away.');
        return false;
      }, run);
      run.targetCars = [];
    }

    async _follow(step, run) {
      const game = this.game;
      const car = run.cars.get(step.follow);
      if (!car) return;
      const dest = this._place(step.to) || { x: car.pos.x + 300, z: car.pos.z };
      const drv = new TourDriver(this, car, dest, { speedMul: step.speed || 0.9 });
      car.driver = 'ai';
      car.controller = drv;
      car.noEnter = true;
      run.targetCars = [car];
      const min = step.min || 12;
      const max = step.max || 110;
      let close = 0;
      let far = 0;
      this._objective(step.objective || 'Follow ' + carRef(car) + ' — not too close');
      this._track(() => (car.wrecked || car.removed ? null : car));
      await this._until(() => {
        const p = game.player;
        const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
        if (car.wrecked) throw new MissionFailed('You wrecked the car you were supposed to follow.');
        if (drv.bumped) throw new MissionFailed('You hit them. Cover blown.');
        if (d < min) close += this._dt;
        else close = Math.max(0, close - this._dt * 0.5);
        if (d > max) far += this._dt;
        else far = Math.max(0, far - this._dt);
        game.hud.setSuspicion(Math.max(close / 4, far / 8));
        if (close > 4) throw new MissionFailed('They spotted you.');
        if (far > 8) throw new MissionFailed('You lost them.');
        return drv.arrived;
      }, run);
      game.hud.setSuspicion(null);
      run.targetCars = [];
    }

    async _race(step, run) {
      const game = this.game;
      const r = step.race;
      const laps = r.laps || 1;
      const cps = [];
      for (let l = 0; l < laps; l++) for (const id of r.checkpoints) cps.push(this._place(id));
      const valid = cps.filter(Boolean);
      if (!valid.length) return;
      const p = game.player;
      // Rivals line up beside Jay.
      const rivals = [];
      const v0 = p.vehicle;
      const base = v0 ? { x: v0.pos.x, z: v0.pos.z, yaw: v0.yaw } : { x: p.pos.x, z: p.pos.z, yaw: p.heading };
      // The grid is on the lanes going the race's way (two abreast where there
      // are two, else single file), behind the line: a rival put off the road
      // or on the oncoming side would never get going.
      const lp0 = game.roadnet.nearestLane(base.x, base.z, base.yaw, 30);
      (r.rivals || []).forEach((rv, i) => {
        let x;
        let z;
        let yaw = base.yaw;
        if (lp0) {
          const two = lp0.road.lanesPerDirection > 1;
          const other = lp0.lane === 0 ? 1 : 0;
          const lane = two && i % 2 === 0 ? other : lp0.lane;
          const row = two ? (i % 2 === 0 ? i / 2 : (i + 1) / 2) : i + 1;
          for (let k = 0; k < 6; k++) {
            const along = VH.math.clamp(lp0.along - lp0.dir * (row + k) * 7.5, lp0.road.from, lp0.road.to);
            const pt = game.roadnet.lanePoint(lp0.road, lp0.dir, lane, along);
            x = pt.x;
            z = pt.z;
            yaw = pt.heading;
            if (this._carFits(x, z, yaw, 3)) break;
          }
        } else {
          const spot = this._carSpot(base.x - Math.sin(base.yaw) * 7.5 * (i + 1), base.z - Math.cos(base.yaw) * 7.5 * (i + 1), base.yaw, base.x, base.z, true);
          x = spot.x;
          z = spot.z;
        }
        const type = VH.Vehicle.typeSpec(rv.car) ? rv.car : 'vireo';
        const v = game.vehicles.spawn(type, x, z, yaw, { color: rv.color, role: 'mission', persistent: true });
        v.driver = 'ai';
        v.noEnter = true;
        v.controller = new RaceDriver(this, v, valid, rv.skill || 0.85 + i * 0.05);
        v.racerName = rv.char ? (this.story.characters[rv.char] || {}).name || rv.char : rv.name || 'Rival';
        rivals.push(v);
        run.cars.set('rival' + i, v);
      });
      run.watchCars.push(...rivals);
      // Countdown.
      game.frozenControls = true;
      for (const n of [3, 2, 1]) {
        game.hud.bigText(String(n));
        if (game.audio.countdown) game.audio.countdown(n);
        await this._sleep(0.9, run);
      }
      game.hud.bigText('GO!', true);
      if (game.audio.countdown) game.audio.countdown(0);
      game.frozenControls = false;
      for (const v of rivals) v.controller.go = true;
      let i = 0;
      const startT = game.time;
      await this._until(() => {
        const cp = valid[i];
        this._setMarker(cp, { r: 9 });
        // Position: count rivals ahead.
        const myProg = i + 1 - Math.hypot(cp.x - p.pos.x, cp.z - p.pos.z) / 1000;
        let ahead = 0;
        for (const v of rivals) {
          const c = v.controller;
          if (c.finished) {
            ahead++;
            continue;
          }
          const vp = c.i + 1 - Math.hypot(valid[Math.min(c.i, valid.length - 1)].x - v.pos.x, valid[Math.min(c.i, valid.length - 1)].z - v.pos.z) / 1000;
          if (vp > myProg) ahead++;
        }
        this._objective('Race: position ' + (ahead + 1) + ' / ' + (rivals.length + 1) + ' · checkpoint ' + (i + 1) + ' / ' + valid.length);
        if (Math.hypot(cp.x - p.pos.x, cp.z - p.pos.z) < 12) {
          i++;
          if (game.audio.checkpoint) game.audio.checkpoint();
          if (i >= valid.length) {
            run.racePlace = ahead + 1;
            return true;
          }
        }
        return false;
      }, run);
      this._setMarker(null);
      const place = run.racePlace;
      const secs = game.time - startT;
      // The place and time go in the result panel (a banner here would print under it).
      const time = Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
      const nth = ['1st', '2nd', '3rd', '4th', '5th', '6th'][place - 1] || place + 'th';
      run.raceResult = (place === 1 ? 'First place' : 'Finished ' + nth) + ' · ' + time;
      if (r.mustWin !== false && place !== 1) throw new MissionFailed('You finished ' + nth + ' (' + time + '). Only a win counts.');
      for (const v of rivals) v.controller.finished = true;
    }

    async _deliver(step, run) {
      const game = this.game;
      const car = run.cars.get(step.deliver) || game.player.vehicle;
      const place = this._place(step.to);
      if (!car || !place) return;
      const minHealth = 1000 * (1 - (step.maxDamage === undefined ? 0.6 : step.maxDamage));
      this._setMarker(place, { r: 7 });
      if (step.timeLimit) run.pendingTimer = step.timeLimit;
      await this._until(() => {
        if (car.wrecked || car.health < minHealth) throw new MissionFailed(carRef(car, true) + ' is too damaged.');
        if (game.player.vehicle !== car) {
          this._objective('Get back in ' + carRef(car));
          return false;
        }
        this._objective(step.objective || 'Deliver ' + carRef(car) + ' (' + Math.round(car.health / 10) + '% condition)');
        return Math.hypot(car.pos.x - place.x, car.pos.z - place.z) < 7 && car.speed < 2;
      }, run);
      this._setMarker(null);
    }

    async _collect(step, run) {
      const game = this.game;
      const places = [].concat(step.collect).map((id) => this._place(id)).filter(Boolean);
      const items = places.map((pl) => {
        const pk = game.combat.addPickup('cash', null, 0, pl.x, (pl.y || 0.15) + 0.7, pl.z, 0);
        pk.missionItem = true;
        pk.collected = false;
        pk.combat = game.combat;
        const orig = game.combat.collect.bind(game.combat);
        pk.collectOverride = true;
        return pk;
      });
      // Mission items are picked up by walking (or driving slowly) into them.
      run.watchItems = items;
      const label = step.objective || 'Collect the ' + (step.item || 'packages');
      await this._until(() => {
        let left = 0;
        for (const it of items) {
          if (it.collected) continue;
          const p = game.player;
          const d = Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z);
          if (d < (p.inVehicle ? 3 : 1.4)) {
            it.collected = true;
            it.dispose();
            if (game.audio.pickup) game.audio.pickup();
            continue;
          }
          left++;
        }
        const next = items.find((it) => !it.collected);
        this._setMarker(next ? next.pos : null, { r: 2 });
        this._objective(label + ' (' + left + ' left)');
        return left === 0;
      }, run);
      this._setMarker(null);
    }

    async _destroy(step, run) {
      const cars = [].concat(step.destroy).map((id) => run.cars.get(id)).filter(Boolean);
      run.targetCars = cars;
      // "Take out" a car somebody is driving: wrecking it counts, and so does
      // its driver being dead or out of it (Jay pulled them out and took it).
      // Parked targets (a jammer, a barricade) still have to be wrecked.
      const drivers = new Map();
      for (const [id, a] of run.actors) {
        if (a.inCar && cars.includes(a.inCar) && !run.crew.includes(id)) drivers.set(a.inCar, a);
      }
      const out = (c) => {
        if (c.wrecked || c.removed) return true;
        const a = drivers.get(c);
        return !!a && (a.dead || a.removed || a.inCar !== c || c.driver === 'player');
      };
      this._objective(step.objective || 'Destroy the ' + (cars.length === 1 ? cars[0].name : 'cars'));
      this._track(() => this._nearestOf(cars.filter((c) => !out(c))));
      await this._until(() => cars.every(out), run);
      run.targetCars = [];
    }

    async _choice(step, run) {
      const game = this.game;
      const c = step.choice;
      const i = await game.dialogue.choice(c.prompt, c.options);
      const opt = c.options[i];
      if (opt.flag) this.flags[opt.flag] = true;
      VH.events.emit('mission:choice', { flag: opt.flag, label: opt.label });
      if (opt.then) {
        run.depth = (run.depth || 0) + 1;
        await this._runSteps(opt.then, run, 0);
        run.depth--;
      }
    }

    _music(mood) {
      const a = this.game.audio;
      if (!a.ready) return;
      if (mood === 'off' || mood === 'sad' || mood === 'hope') {
        a.stopMusic(1.5);
        if (a.moodPad) a.moodPad(mood === 'off' ? null : mood);
        return;
      }
      if (a.moodPad) a.moodPad(null);
      a.startMusic();
      a.setIntensity(mood === 'action' ? 0.9 : mood === 'triumph' ? 0.6 : 0.4);
    }

    _setTime(hours, fade) {
      const env = this.game.environment;
      if (fade) {
        this.game.hud.setFade(1, 300);
        setTimeout(() => {
          env.setTime(hours);
          this.game.world.setNightFactor(env.shared.uWindowGlow.value);
          this.game.hud.setFade(0, 800);
        }, 320);
      } else {
        env.setTime(hours);
        this.game.world.setNightFactor(env.shared.uWindowGlow.value);
      }
    }

    _teleport(id, withCar) {
      const game = this.game;
      const place = this._place(id);
      if (!place) return;
      const p = game.player;
      if (p.inVehicle && withCar !== false) {
        const v = p.vehicle;
        const yaw = place.yaw || v.yaw;
        // Jay's car among the others, never parked on a roof or in a shopfront.
        const s = this._carFits(place.x, place.z, yaw) ? { x: place.x, z: place.z, heading: yaw } : this._carSpot(place.x, place.z, yaw, place.x, place.z);
        v.place(s.x, s.z, s.heading);
      } else {
        if (p.inVehicle) game.vehicles.exitVehicle();
        p.teleport(place.x, place.z, place.yaw || 0, place.y);
      }
      game.cameraRig.snapBehind(p);
      const taken = [p.pos];
      for (const id2 of this.run ? this.run.crew : []) {
        const a = this.run.actors.get(id2);
        if (!a || a.inCar) continue;
        const s = this._standSpot(place.x + 1.5, place.z + 1.5, p.pos.y, taken, 6);
        a.pos.set(s.x, s.y, s.z);
        taken.push(a.pos);
      }
    }

    _reward(r, mid) {
      const game = this.game;
      if (!r) return;
      if (r.money) game.giveMoney(r.money, 'job');
      if (r.armor) game.player.armor = Math.min(game.player.maxArmor, game.player.armor + r.armor);
      for (const w of r.weapons || []) game.combat.giveWeapon(w, undefined, !mid);
      for (const u of r.unlock || []) this.flags['unlocked:' + u] = true;
    }

    // --------------------------------------------------- pass and fail
    _pass(run) {
      const game = this.game;
      const m = run.m;
      document.body.classList.remove('on-mission');
      this._clearWaiters(run);
      this.run = null;
      this._clearPresentation();
      this._cleanup(run, false);
      this.completed[m.id] = true;
      if (m._main) this.stats.missions++;
      else this.stats.side++;
      this._reward(m.reward, false);
      const money = (m.reward && m.reward.money) || 0;
      game.hud.missionResult(true, m.title, [run.raceResult, money ? '+' + VH.util.formatMoney(money) : ''].filter(Boolean).join('  ·  '), m.reward && m.reward.weapons ? 'New: ' + m.reward.weapons.map((w) => (VH.Combat.def(w) || { name: w }).name).join(', ') : '');
      if (game.audio.missionPassed) game.audio.missionPassed();
      VH.events.emit('mission:pass', { m });
      this._music('off');
      this.save();
      setTimeout(() => this.refreshMarkers(), 2500);
      // The last main job: roll the credits.
      if (m._main && !this.nextMain && !this.completed._credits) {
        this.completed._credits = true;
        setTimeout(() => game.endCredits && game.endCredits(), 6500);
      }
      // Chained missions start straight away.
      const next = this.available().find((n) => n.start === 'chain' && (n.requires || []).includes(m.id));
      if (next) {
        this._chainPending = next.id;
        setTimeout(() => {
          if (this._chainPending !== next.id) return;
          this._chainPending = null;
          if (this.run || this.game.state === 'title') return this.refreshMarkers();
          this.start(next);
          if (!this.run) this.refreshMarkers(); // refused (police): its marker shows instead
        }, 4200);
      }
      // Ambient texts after this mission.
      for (const t of this.story.texts || []) {
        if (t.after !== m.id || (t.requiresFlag && !MissionEngine.testFlag(Object.assign({}, this.completed, this.flags), t.requiresFlag))) continue;
        setTimeout(() => {
          if (!this.run || !this.run.m._main) game.dialogue.text(t.from, t.message);
        }, (t.delay || 20) * 1000);
      }
    }

    /** Fail from anywhere (events, waiters). */
    fail(reason) {
      if (!this.run) return;
      this._failNow(this.run, reason);
    }

    _failNow(run, reason) {
      const game = this.game;
      document.body.classList.remove('on-mission');
      this._clearWaiters(run, reason);
      this.run = null;
      this._abort = null;
      game.dialogue.stop();
      this._clearPresentation();
      this._cleanup(run, true);
      game.hud.missionResult(false, run.m.title, reason, 'Press ' + game.input.labelFor('interact') + ' to retry' + (run.checkpoint ? ' from the checkpoint' : ''));
      if (game.audio.missionFailedSting) game.audio.missionFailedSting();
      else if (game.audio.fail) game.audio.fail();
      this._music('off');
      VH.events.emit('mission:fail', { m: run.m, reason });
      // A failed attempt leaves nothing behind: its choices and the money it
      // paid out mid-job are rolled back (a retry from a checkpoint gets back
      // whatever was decided and paid before that checkpoint).
      if (this._preRun && this._preRunFor === run.m.id) this.flags = JSON.parse(JSON.stringify(this._preRun.flags));
      if (run.midMoney) game.player.money = Math.max(0, game.player.money - run.midMoney);
      this._retry = { m: run.m, checkpoint: run.checkpoint, pos: this._checkpointPos, until: game.time + 14, cpFlags: run.cpFlags || null, cpMoney: run.cpMoney || 0 };
      setTimeout(() => this.refreshMarkers(), 1500);
    }

    /** A job never leaves the screen black, letterboxed or in a cutscene camera behind it. */
    _clearPresentation() {
      const game = this.game;
      this.cinematic = null;
      game.dialogue.letterbox(false);
      document.body.classList.remove('cutscene');
      game.player.frozen = false;
      game.frozenControls = false;
      game.hud.setFade(0, 900);
    }

    _clearWaiters(run, reason) {
      const ws = this._waiters.filter((w) => w.run === run);
      this._waiters = this._waiters.filter((w) => w.run !== run);
      for (const w of ws) w.reject(reason ? new MissionFailed(reason) : new Aborted());
      this._setMarker(null);
      this.game.hud.setObjectiveText(null);
      this.game.hud.setMissionTimer(null);
      this.game.hud.setSuspicion(null);
      this._objGroup.visible = false;
      if (this._objArrow) this._objArrow.visible = false;
      this.game.route = null;
    }

    _cleanup(run, failed) {
      const game = this.game;
      if (failed) {
        // A failed job leaves nothing behind: the retry starts from a clean
        // street instead of on top of the last attempt's cars and cast.
        for (const [, a] of run.actors) if (!a.dead && !a.removed) game.crowd.remove(a);
        for (const a of run.targets || []) if (!a.dead && !a.removed) game.crowd.remove(a);
        for (const [, v] of run.cars) if (v.driver !== 'player' && !v.removed) game.vehicles.remove(v);
      }
      for (const [, a] of run.actors) {
        if (a.removed) continue;
        // Someone already walking off (a prisoner on their way into the
        // precinct) finishes that walk, then goes (LeaveBrain.expired).
        if (!failed && a.leaving && a.brain instanceof LeaveBrain) {
          a.persistent = false;
          continue;
        }
        if (a.inCar && a.brain && a.brain._getOut) a.brain._getOut(a, a.inCar);
        a.persistent = false;
        a.brain = a.dead ? null : new FleeBrain(this, game.player.pos);
        if (!a.dead) {
          a.brain.t = 0;
          a.brain = null; // back to being an ordinary pedestrian
          a.walk = null;
          a.anim.cower = 0; // (a job's 'cower' would otherwise stay on as they walk off)
        }
      }
      for (const [, v] of run.cars) {
        v.missionOwned = false; // the job's over: once Jay leaves it, it's just a car
        v.plow = false;
        if (v.driver === 'player') {
          v.persistent = true;
          continue;
        }
        if (failed || v.role === 'mission') {
          v.persistent = false;
          v.role = 'abandoned';
          if (v.driver === 'ai') v.controller = null;
          v.driver = null;
          v.noEnter = false;
        }
        // A job car Jay got out of along the way streams out like any other.
        if (!v.keep) v.persistent = false;
      }
      for (const it of run.watchItems || []) if (!it.gone) it.dispose();
      if (!failed) this._standDown(run);
      if (failed) game.police.reset();
    }

    /** Retry the last failed job (E within a few seconds). */
    tryRetry() {
      const r = this._retry;
      if (!r || this.run || this.game.time > r.until) return false;
      this._retry = null;
      this._retriedFrom = r.m.id;
      if (r.checkpoint && r.cpFlags) {
        this.flags = JSON.parse(JSON.stringify(r.cpFlags));
        if (r.cpMoney) this.game.player.money += r.cpMoney;
      }
      this.game.hud.missionResult(null);
      const game = this.game;
      // Knocked out when it failed: on his feet again for the retry (not left
      // lying there, or in the ragdoll's pose, with no health).
      if (game.player.isDead) {
        game.player.revive();
        if (game.police) game.police.reset();
      }
      if (r.checkpoint && r.pos) {
        game.hud.setFade(1, 300);
        setTimeout(() => {
          const p = game.player;
          if (p.inVehicle) game.vehicles.exitVehicle();
          p.teleport(r.pos.x, r.pos.z, r.pos.yaw);
          if (r.pos.car) {
            const v = game.vehicles.spawn(r.pos.car.type, r.pos.car.x, r.pos.car.z, r.pos.car.yaw, { color: r.pos.car.color, persistent: true });
            game.vehicles.beginEnter({ v, side: 1, x: p.pos.x, z: p.pos.z });
            game.vehicles._finishEnter();
          }
          // Every car back to fresh, like a reload (after Jay's car, so it's kept,
          // and a gold King of the Road car he was in isn't doubled).
          if (game.resetCars) game.resetCars();
          game.hud.setFade(0, 600);
          this.start(r.m, r.checkpoint);
        }, 350);
      } else {
        const place = this.game.places.get(r.m.start);
        if (place && Math.hypot(place.x - game.player.pos.x, place.z - game.player.pos.z) > 60) {
          game.hud.setFade(1, 300);
          setTimeout(() => {
            // A job that wants Jay in a car (a race) takes the car back to the start with him.
            const pv = game.player.vehicle;
            const steps = r.m.steps || [];
            const wantsCar = steps.slice(0, 2).some((st) => st && (st.getIn || (st.goto && st.vehicle === true)));
            if (pv && wantsCar && !pv.wrecked && !pv.burning && !pv.removed) {
              const lp = game.roadnet.nearestLane(place.x, place.z, place.yaw || 0, 30);
              const at = lp ? { x: lp.x, z: lp.z, heading: lp.heading } : { x: place.x, z: place.z, heading: place.yaw || 0 };
              const spot = this._carSpot(at.x, at.z, at.heading, at.x, at.z, !!lp);
              pv.place(spot.x, spot.z, spot.heading);
              game.player.pos.copy(pv.pos);
              if (game.cameraRig.snapToCar) game.cameraRig.snapToCar(pv);
            } else {
              if (game.player.inVehicle) game.vehicles.exitVehicle();
              game.player.teleport(place.x, place.z, place.yaw || 0);
            }
            if (game.resetCars) game.resetCars(); // (repairs the car Jay is in)
            game.hud.setFade(0, 600);
            this.start(r.m, 0);
          }, 350);
        } else {
          // Close by: still a fade, and every car back to fresh.
          game.hud.setFade(1, 250);
          setTimeout(() => {
            if (game.resetCars) game.resetCars();
            game.hud.setFade(0, 600);
            this.start(r.m, 0);
          }, 300);
        }
      }
      return true;
    }

    // ------------------------------------------------------------ frame
    update(dt) {
      const game = this.game;
      this._dt = dt;
      this._markerTime += dt;
      for (const mk of this.markers) {
        mk.ring.rotation.y += dt * 0.6;
        mk.ring.material.opacity = 0.65 + 0.3 * Math.sin(this._markerTime * 2.5);
      }
      if (this._objGroup.visible) {
        this._objRing.rotation.y -= dt * 0.8;
        this._objRing.material.opacity = 0.6 + 0.35 * Math.sin(this._markerTime * 3);
      }
      if (this._retry && game.input.consume('interact') && !game.interaction.current) {
        if (this.tryRetry()) return;
      }
      if (this._retry && game.time > this._retry.until) {
        this._retry = null;
        game.hud.missionResult(null);
      }
      const run = this.run;
      if (!run) return;
      // A moving objective: the marker, arrow and route follow it.
      if (run.track) {
        const o = run.track();
        if (o) {
          const pos = o.renderPos || o.pos;
          const top = o.height ? o.height + 1.6 : 2.6;
          run.marker = { x: pos.x, y: pos.y, z: pos.z, r: 3, moving: true };
          this._routeTo = run.marker;
          const bob = Math.sin(game.time * 4) * 0.25;
          this._objArrow.position.set(pos.x, pos.y + top + bob, pos.z);
          this._objArrow.rotation.y += dt * 2.2;
          this._objArrow.visible = true;
        } else {
          run.marker = null;
          this._routeTo = null;
          this._objArrow.visible = false;
        }
      }
      // GPS route to the marker.
      if (this._routeTo && VH.Minimap) {
        this._routeT -= dt;
        if (this._routeT <= 0) {
          this._routeT = 1;
          const p = game.player.pos;
          game.route = Math.hypot(this._routeTo.x - p.x, this._routeTo.z - p.z) > 30 ? VH.Minimap.route(game.layout, p.x, p.z, this._routeTo.x, this._routeTo.z) : null;
        }
      } else game.route = null;
      // HUD marker on screen.
      if (run.marker) game.hud.trackObjective(run.marker, game.renderer.camera);
      else game.hud.trackObjective(null);
      // Timer.
      if (run.timer) {
        if (!this._waiters.some((w) => w.run === run && w.limit)) {
          // survive() drives its own timer
        }
        game.hud.setMissionTimer(run.timer.left);
      }
      // Fail conditions.
      try {
        this._checkFails(run);
        for (const w of this._waiters.slice()) {
          if (w.run !== run) continue;
          if (w.limit) {
            w.t += dt;
            run.timer = { left: Math.max(0, w.limit - w.t) };
            if (w.t >= w.limit) throw new MissionFailed(w.reason);
          }
          let done = false;
          try {
            done = w.fn();
          } catch (err) {
            if (err instanceof MissionFailed) throw err;
            throw err;
          }
          if (done) {
            this._waiters.splice(this._waiters.indexOf(w), 1);
            if (w.limit) {
              run.timer = null;
              game.hud.setMissionTimer(null);
            }
            w.resolve();
          }
        }
      } catch (err) {
        if (err instanceof MissionFailed) this._failNow(run, err.reason);
        else throw err;
      }
    }

    _checkFails(run) {
      for (const id of run.protect) {
        const a = run.actors.get(id);
        if (a && a.dead) throw new MissionFailed((a.name || 'They') + ' died.');
      }
      for (const cond of run.failIf) {
        const [kind, id] = cond.split(':');
        if (kind === 'dead') {
          const a = run.actors.get(id);
          if (a && a.dead) throw new MissionFailed((a.name || id) + ' died.');
        } else if (kind === 'wrecked') {
          const v = run.cars.get(id);
          if (v && v.wrecked) throw new MissionFailed(carRef(v, true) + ' was destroyed.');
        } else if (kind === 'left') {
          const a = run.actors.get(id);
          if (a && !a.inCar && Math.hypot(a.pos.x - this.game.player.pos.x, a.pos.z - this.game.player.pos.z) > 160) throw new MissionFailed('You left ' + (a.name || id) + ' behind.');
        } else if (kind === 'heat') {
          if (this.game.police.level > 0) throw new MissionFailed('You drew the cops.');
        }
      }
      // Named crew dying always fails the job (extras who tag along don't).
      for (const id of run.crew) {
        const a = run.actors.get(id);
        if (a && a.dead && a.charId) throw new MissionFailed((a.name || id) + ' died.');
      }
    }

    // ------------------------------------------------------------- save
    /** Everything a save holds, as it stands right now (a detached copy). */
    _saveData() {
      const g = this.game;
      const p = g.player;
      const v = p.vehicle;
      const data = {
        version: 1,
        savedAt: Date.now(),
        completed: this.completed,
        flags: this.flags,
        stats: this.stats,
        money: p.money,
        health: p.health,
        armor: p.armor,
        playerStats: p.stats,
        playTime: g.playTime,
        hours: g.environment.hours,
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.heading },
        // The car Jay is sitting in comes back with him.
        // An aircraft in the air isn't saved (Jay comes back on the ground below).
        vehicle: v && !v.wrecked && !v.removed && !v.burning && !v.flying ? { type: v.type, color: v.model.color, x: v.pos.x, y: v.pos.y, z: v.pos.z, yaw: v.yaw } : null,
        // Closing the tab is not a way to lose the police.
        heat: g.police.level || 0,
        weapons: g.combat.serialize(),
        activities: g.activities ? g.activities.serialize() : null,
        systems: g.saveSystems ? g.saveSystems() : null,
      };
      return JSON.parse(JSON.stringify(data));
    }

    save(opts) {
      const o = opts || {};
      const data = o.data || this._saveData();
      data.savedAt = Date.now();
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        this._knownSavedAt = data.savedAt;
        if (!o.silent) this.game.hud.showToast('Progress saved');
        return true;
      } catch (err) {
        return false;
      }
    }

    /**
     * A quiet save for closing the tab, switching away, quitting and the
     * timer. In the middle of a job it writes the state from just before the
     * job began (with the time played brought up to date), so the job starts
     * over from its marker next time instead of leaving a half-built mission.
     */
    autoSave() {
      const g = this.game;
      this.lastSaveRefusal = null;
      const refuse = (why) => {
        this.lastSaveRefusal = why;
        return false;
      };
      if (!['playing', 'paused', 'dialog'].includes(g.state)) return refuse('state');
      // The game open in two tabs: never let the older one overwrite newer
      // progress made in the other (for example when it is finally closed).
      const cur = MissionEngine.loadSave();
      if (cur && cur.savedAt > (this._knownSavedAt || 0) + 1) {
        if (!this._warnedOtherTab) {
          this._warnedOtherTab = true;
          g.hud.notify({ title: 'Open in another tab', text: 'Vicehaven was saved from another tab, so this one has stopped saving. Reload the page to carry on from the newest save.', icon: '⚠', tone: 'bad', duration: 10000 });
        }
        return refuse('other-tab');
      }
      // Knocked out or being arrested: keep the last good save.
      if (g.player.state === 'dead' || g._arresting) return refuse('busy');
      let data;
      if (this.run) {
        if (!this._preRun) return refuse('state');
        data = Object.assign({}, this._preRun, { playTime: g.playTime, interrupted: this.run.m.id });
      } else data = this._saveData();
      return this.save({ data, silent: true }) || refuse('storage');
    }

    static loadSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return null;
      }
    }

    static clearSave() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (err) {
        /* ignore */
      }
    }

    load(data) {
      const g = this.game;
      this._knownSavedAt = data.savedAt || 0;
      this._warnedOtherTab = false;
      this.completed = data.completed || {};
      this.flags = data.flags || {};
      this.stats = data.stats || { missions: 0, side: 0 };
      g.player.money = data.money || 0;
      g.player.health = data.health || 100;
      g.player.armor = data.armor || 0;
      Object.assign(g.player.stats, data.playerStats || {});
      g.playTime = data.playTime || 0;
      if (data.hours !== undefined) g.environment.setTime(data.hours);
      g.combat.load(data.weapons);
      if (g.activities && data.activities) g.activities.load(data.activities);
      if (g.loadSystems) g.loadSystems(data.systems);
      if (data.pos) g.player.teleport(data.pos.x, data.pos.z, data.pos.yaw, data.pos.y);
      this._preRun = null;
      this._chainPending = null;
      const c = data.vehicle;
      if (c && VH.CarModels && VH.CarModels.list().includes(c.type)) {
        const v = g.vehicles.spawn(c.type, c.x, c.z, c.yaw, { color: c.color, persistent: true, y: c.y });
        if (v) {
          // The kerbside space it stands in is taken (no parked twin on top of it).
          for (const s of g.vehicles.spots || []) if (Math.hypot(s.x - v.pos.x, s.z - v.pos.z) < 6) s.used = true;
          const stolen = g.player.stats.carsStolen;
          g.vehicles.beginEnter({ v, side: 1, x: g.player.pos.x, z: g.player.pos.z });
          g.vehicles._finishEnter();
          g.player.stats.carsStolen = stolen; // getting back in isn't a theft
        }
      }
      if (g.activities && g.activities._spawnKingCar) g.activities._spawnKingCar();
    }

    reset() {
      if (this.run) {
        const run = this.run;
        this._clearWaiters(run);
        this.run = null;
        this._cleanup(run, true);
      }
      this.cinematic = null;
      document.body.classList.remove('on-mission');
      this.completed = {};
      this.flags = {};
      this.stats = { missions: 0, side: 0 };
      this._retry = null;
      this._preRun = null;
      this._chainPending = null;
      // A new story may replace whatever save exists (the title screen asked).
      const cur = MissionEngine.loadSave();
      this._knownSavedAt = cur ? cur.savedAt || 0 : 0;
      this._warnedOtherTab = false;
    }
  }

  MissionEngine.SAVE_KEY = SAVE_KEY;
  MissionEngine.MissionFailed = MissionFailed;
  VH.MissionEngine = MissionEngine;
  VH.MissionBrains = { IdleBrain, CrewBrain, FleeBrain, FleeDriver, TourDriver, RaceDriver };
})();
