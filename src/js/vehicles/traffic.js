/*
 * traffic.js — AI drivers and the traffic that fills the streets.
 *
 * LaneDriver is the brain every AI car shares. It follows a queue of road
 * pieces (roadnet.js) by pure pursuit, picks a turn at each junction, keeps
 * its distance with the Intelligent Driver Model, stops at red lights, and
 * reacts when it gets hit. Police and racers use the same driver with a
 * destination, which makes it pick the turn that heads toward a target
 * instead of a random one.
 *
 * TrafficSystem keeps a density of cars around Jay: it spawns them on lanes
 * out of view, 70–200 m away, and removes them when they are far off and
 * unseen.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep } = VH.math;
  const RoadNet = () => VH.RoadNet;

  const TRAFFIC_TYPES = [
    ['halcyon', 28], ['pipit', 16], ['cab', 10], ['mesa', 9], ['porter', 8], ['tern', 9], ['ironclad', 5],
    ['vireo', 3], ['sovereign', 3], ['hauler', 5], ['beater', 4], ['drifter', 2], ['lowrider', 2], ['zephyr', 1],
    // The newer models: electric cars, pickups, a wagon and the odd muscle car or supercar.
    ['volta', 4], ['voltaic', 4], ['forge', 6], ['sprint', 4], ['estate', 3], ['gallop', 2], ['trailhand', 2], ['drover', 2], ['monolith', 1], ['stinger', 1], ['corvid', 1],
  ];

  class LaneDriver {
    constructor(sys, opts) {
      opts = opts || {};
      this.sys = sys;
      this.net = sys.net;
      this.pieces = [];
      this.t = 0;
      this.speedMul = opts.speedMul || 0.82 + Math.random() * 0.26;
      this.gap = opts.gap || 1.6 + Math.random() * 0.8; // time headway (s)
      this.obeySignals = opts.obeySignals !== false;
      this.destination = null; // { x, z } → turns head toward it
      this.state = 'drive'; // drive | shaken | stuck
      this._stateT = 0;
      this._sense = 0;
      this._blockedBy = null;
      this._gapAhead = Infinity;
      this._speedAhead = 0;
      this._stuckT = 0;
      this._honkT = 0;
      this._reverseT = 0;
      this.maxSpeed = opts.maxSpeed || null;
      this.aggressive = !!opts.aggressive;
      this.ignoreRed = !!opts.ignoreRed;
      // A plough (the van Jay tails, a car fleeing him) never queues: it runs
      // the lights, swerves round anything stopped and shoves through the rest.
      this.plow = !!opts.plow;
      if (this.plow) this.ignoreRed = true;
      this._personGap = Infinity;
      this._hardAhead = false;
    }

    /** Start on a lane position { road, dir, lane, along }. */
    initAt(lp) {
      this.pieces.length = 0;
      const j = this.net.nextJunction(lp.road, lp.dir, lp.along);
      const end = j ? RoadNet().edges(lp.road, lp.dir, j).enter : lp.dir > 0 ? lp.road.to : lp.road.from;
      const piece = this.net.linePiece(lp.road, lp.dir, lp.lane, lp.along, end);
      piece.endJunction = j;
      this.pieces.push(piece);
      this.t = 0;
      this._fill();
    }

    /** Re-acquire the nearest lane (after being knocked off the road); reach: how far to look. */
    reacquire(v, reach) {
      const lp = this.net.nearestLane(v.pos.x, v.pos.z, v.yaw, reach);
      if (!lp) return false;
      // Start a little ahead so the target isn't behind us.
      lp.along = clamp(lp.along + lp.dir * 4, lp.road.from, lp.road.to);
      this.initAt(lp);
      return true;
    }

    _chooseExit(road, dir, j) {
      const exits = this.net.exits(road, dir, j);
      if (!exits.length) return null;
      if (this.destination) {
        // Head for the target: the exit whose far side is closest to it.
        let best = exits[0];
        let bestD = Infinity;
        for (const e of exits) {
          const p = this.net.lanePoint(e.road, e.dir, 0, RoadNet().edges(e.road, e.dir, j).exit + e.dir * 60);
          const d = Math.hypot(p.x - this.destination.x, p.z - this.destination.z) + (e.turn === 'straight' ? 0 : 6);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        return best;
      }
      const w = { straight: 0.58, right: 0.24, left: 0.18 };
      let total = 0;
      for (const e of exits) total += w[e.turn];
      let r = Math.random() * total;
      for (const e of exits) {
        r -= w[e.turn];
        if (r <= 0) return e;
      }
      return exits[0];
    }

    /** Keep a few pieces of road queued ahead. */
    _fill() {
      let guard = 0;
      while (this.pieces.length < 4 && guard++ < 8) {
        const last = this.pieces[this.pieces.length - 1];
        if (last.type === 'line' && !last.junction) {
          const j = last.endJunction;
          if (!j) {
            // The end of a road out of town: turn round, or wait to (see update).
            const end = last.dir > 0 ? last.road.endTo : last.road.endFrom;
            if (end === 'uturn') {
              this._uturn(last);
              continue;
            }
            if (end === 'flip') last.flipEnd = true;
            return;
          }
          const exit = this._chooseExit(last.road, last.dir, j);
          if (!exit) return;
          const turn = this.net.turnPiece(last.road, last.dir, last.lane, j, exit);
          turn.signal = j.signal ? RoadNet().signalGroup(last.road) : null;
          this.pieces.push(turn);
        } else {
          // After a junction: the straight run to the next one.
          const road = last.road;
          const dir = last.dir;
          const lane = clamp(last.nextLane !== undefined ? last.nextLane : last.lane, 0, road.lanesPerDirection - 1);
          const start = RoadNet().edges(road, dir, last.junction).exit;
          const j = this.net.nextJunction(road, dir, start + dir * 0.5);
          const end = j ? RoadNet().edges(road, dir, j).enter : dir > 0 ? road.to : road.from;
          const piece = this.net.linePiece(road, dir, lane, start, end);
          piece.endJunction = j;
          this.pieces.push(piece);
        }
      }
    }

    /**
     * A U-turn at an open road end: two quarter curves out past the end and
     * back into the inner lane the other way, then the run back to the next
     * junction.
     */
    _uturn(last) {
      const road = last.road;
      const dir = last.dir;
      const back = -dir;
      const aE = dir > 0 ? road.to : road.from;
      const T = this.net.lanePoint(road, back, 0, aE);
      const fx = road.axis === 'z' ? 0 : dir;
      const fz = road.axis === 'z' ? dir : 0;
      const r = Math.max(3.5, Math.hypot(T.x - last.x1, T.z - last.z1) / 2);
      const mx = (last.x1 + T.x) / 2 + fx * r;
      const mz = (last.z1 + T.z) / 2 + fz * r;
      const curve = (x0, z0, cx, cz, x1, z1) => {
        const c = { type: 'curve', road, dir: back, lane: 0, fromRoad: road, x0, z0, cx, cz, x1, z1, junction: null, turn: 'uturn', nextLane: 0, limit: 4.2, uturn: true };
        c.length = RoadNet().curveLength(c);
        return c;
      };
      this.pieces.push(curve(last.x1, last.z1, last.x1 + fx * r, last.z1 + fz * r, mx, mz));
      this.pieces.push(curve(mx, mz, T.x + fx * r, T.z + fz * r, T.x, T.z));
      const j = this.net.nextJunction(road, back, aE + back * 0.5);
      const end = j ? RoadNet().edges(road, back, j).enter : back > 0 ? road.to : road.from;
      const run = this.net.linePiece(road, back, 0, aE, end);
      run.endJunction = j;
      this.pieces.push(run);
    }

    /** Turn round at a closed road end, out of sight: back into the other carriageway. */
    _flip(v, p) {
      const road = p.road;
      const dir = -p.dir;
      const along = p.dir > 0 ? road.to - 8 : road.from + 8;
      const q = this.net.lanePoint(road, dir, 0, along);
      v.place(q.x, q.z, q.heading);
      v.setSpeed(2);
      this.atEnd = false;
      this.initAt({ road, dir, lane: 0, along });
    }

    /** Point `dist` metres ahead of the current progress along the queue. */
    _ahead(dist, out) {
      let i = 0;
      let t = this.t;
      let remaining = dist;
      while (i < this.pieces.length) {
        const p = this.pieces[i];
        const left = (1 - t) * p.length;
        if (remaining <= left || i === this.pieces.length - 1) {
          const tt = p.length > 0 ? Math.min(1, t + remaining / p.length) : 1;
          return RoadNet().pointOn(p, tt, out);
        }
        remaining -= left;
        i++;
        t = 0;
      }
      return RoadNet().pointOn(this.pieces[this.pieces.length - 1], 1, out);
    }

    onBump(v, other, speed) {
      if (speed < 2.5) return;
      this.state = 'shaken';
      this._stateT = 1.2 + Math.random() * 1.5;
      if (other && other.driver === 'player' && Math.random() < 0.7) this._honkT = 0.5 + Math.random() * 0.6;
    }

    onJacked() {
      return null;
    }

    update(v, dt) {
      if (!this.pieces.length) {
        if (!this.reacquire(v, 80)) {
          // Nowhere near a road at all: sit still rather than reverse forever.
          v.input.accel = 0;
          v.input.steer = 0;
          v.input.handbrake = 1;
          return;
        }
      }
      // Progress along the current piece.
      let p = this.pieces[0];
      this.t = RoadNet().project(p, v.pos.x, v.pos.z, this.t);
      while (this.t > 0.985 && this.pieces.length > 1) {
        this.pieces.shift();
        p = this.pieces[0];
        this.t = RoadNet().project(p, v.pos.x, v.pos.z, 0);
      }
      this._fill();
      if (this.t > 0.985 && this.pieces.length === 1) {
        // Barriers ahead: turn round once nobody's watching.
        if (this.pieces[0].flipEnd && this.sys.game && !this.sys.game.isVisible(v.pos.x, 1, v.pos.z, 5)) {
          this._flip(v, this.pieces[0]);
          return;
        }
        // The end of the line (a road out of town): stop.
        v.input.accel = v.speed > 0.5 ? -1 : 0;
        v.input.steer = 0;
        this.atEnd = true;
        return;
      }

      // Off the path (knocked sideways, or bumped onto the pavement)?
      const here = RoadNet().pointOn(p, this.t, this._tmp || (this._tmp = {}));
      const off = Math.hypot(here.x - v.pos.x, here.z - v.pos.z);
      if (off > 9) {
        this._rejoin(v, dt);
        return;
      }
      this._rejoinT = 0;

      // Steering: pure pursuit on a point ahead.
      const speed = Math.max(0, v.vF);
      const look = 3.2 + speed * 0.5;
      const target = this._ahead(look, this._tmp2 || (this._tmp2 = {}));
      const by = this._bypassStep(v, dt);
      if (by) {
        // Round a stopped car: aim a lane-width to the side of the path.
        target.x += Math.cos(target.heading) * by;
        target.z -= Math.sin(target.heading) * by;
      }
      const l = v.worldToLocal(target.x, target.z, this._tmp3 || (this._tmp3 = {}));
      const d2 = l.x * l.x + l.z * l.z;
      const curvature = d2 > 0.01 ? (2 * l.x) / d2 : 0;
      const angle = Math.atan(v.wheelbase * curvature);
      const lock = lerp(0.62, 0.15, smoothstep(4, 46, Math.abs(v.vF))) * v.tune.steer;
      let steer = clamp(angle / Math.max(0.05, lock), -1, 1);

      // Speed: the limit, slowing for bends and red lights, and IDM behind whatever is ahead.
      let desired = p.limit * this.speedMul;
      if (this.maxSpeed) desired = Math.min(desired, this.maxSpeed);
      if (this._bypass) desired = Math.min(desired, 7);
      const next = this.pieces[1];
      const distToEnd = (1 - this.t) * p.length;
      if (next && next.type === 'curve') {
        // Brake ahead of a turn.
        const vTurn = next.limit;
        const brakeDist = Math.max(0, (speed * speed - vTurn * vTurn) / (2 * 4.5));
        if (distToEnd < brakeDist + 6) desired = Math.min(desired, lerp(vTurn, desired, clamp((distToEnd - 6) / (brakeDist + 1), 0, 1)));
      }
      let stopDist = Infinity;
      if (this.obeySignals && !this.ignoreRed && next && next.signal && p.type === 'line') {
        const state = this.sys.world.signalState[next.signal];
        const toLine = distToEnd - RoadNet().STOP_BACK - v.hz;
        if (state !== 'green' && toLine > -0.5) {
          const canStop = toLine > (speed * speed) / (2 * 6.5);
          if (state === 'red' || canStop) stopDist = Math.max(0.01, toLine);
        }
      }

      // Sense what's ahead (4 times a second; staggered).
      this._sense -= dt;
      if (this._sense <= 0) {
        this._sense = 0.12 + Math.random() * 0.06;
        this._senseAhead(v, speed);
      }
      let gap = Math.min(this._gapAhead, stopDist);
      const vLead = this._gapAhead <= stopDist ? this._speedAhead : 0;
      if (this.plow && !this._hardAhead) {
        // Barge on at a shoving pace into the cars ahead instead of waiting
        // behind them. (Jay's car and people still stop it: _hardAhead.)
        if (this._gapAhead < 14) desired = Math.min(desired, 9);
        gap = Math.min(stopDist, this._personGap);
      }

      // Intelligent Driver Model.
      const a = 2.2 * (this.aggressive ? 1.6 : 1);
      const b = 3.2;
      const s0 = 2.2;
      const T = this.aggressive ? 0.9 : this.gap;
      const dv = speed - vLead;
      const sStar = s0 + Math.max(0, speed * T + (speed * dv) / (2 * Math.sqrt(a * b)));
      let acc = a * (1 - Math.pow(speed / Math.max(1, desired), 4));
      if (gap < 60) acc -= a * Math.pow(sStar / Math.max(0.3, gap), 2);
      if (this.state === 'shaken') {
        this._stateT -= dt;
        acc = Math.min(acc, -3);
        if (this._stateT <= 0) this.state = 'drive';
      }

      // Stuck (blocked for ages, or wedged against a wall): back up and try again.
      if (speed < 0.6 && acc > 0.5) this._stuckT += dt;
      else this._stuckT = Math.max(0, this._stuckT - dt * 2);
      if (this._reverseT > 0) {
        this._reverseT -= dt;
        v.input.accel = -0.7;
        v.input.steer = -steer;
        v.input.handbrake = 0;
        return;
      }
      if (this._stuckT > (this.plow ? 1.6 : this._gapAhead < 8 ? 7 : 2.5)) {
        this._stuckT = 0;
        this._reverseT = 1.4;
      }

      // Honk at whoever blocks us for a while.
      if (this._blockedBy && this._blockedBy.driver === 'player' && speed < 1 && Math.random() < dt * 0.4) this._honkT = 0.35 + Math.random() * 0.4;
      if (this._honkT > 0) {
        this._honkT -= dt;
        v.horn = true;
      } else v.horn = false;

      v.input.steer = steer;
      v.input.handbrake = 0;
      if (acc >= 0) v.input.accel = clamp(acc / (v.accelG * 9.81 * 0.55), 0, 1);
      else v.input.accel = clamp(acc / 6.5, -1, 0);
      if (speed < 0.3 && acc < 0) v.input.accel = 0;
      if (speed < 0.3 && gap < 3) {
        v.input.accel = 0;
        v.input.handbrake = 1;
      }
    }

    /**
     * Knocked (or put down) well away from the lane: find the nearest lane
     * going our way and drive back to it, backing out if wedged. Always
     * writes the controls, so a car never coasts on stale pedals.
     */
    _rejoin(v, dt) {
      this._rejoinT = (this._rejoinT || 0) - dt;
      if (this._rejoinT <= 0) {
        this._rejoinT = 0.6;
        this.reacquire(v, 80);
      }
      const p = this.pieces[0];
      if (!p) {
        v.input.accel = 0;
        v.input.handbrake = 1;
        return;
      }
      const tgt = RoadNet().pointOn(p, Math.min(1, this.t + 0.05), this._tmp6 || (this._tmp6 = {}));
      const l = v.worldToLocal(tgt.x, tgt.z, this._tmp3 || (this._tmp3 = {}));
      const speed = Math.max(0, v.vF);
      if (speed < 0.5) this._stuckT += dt;
      else this._stuckT = 0;
      if (this._reverseT > 0 || this._stuckT > 2.5) {
        if (this._stuckT > 2.5) {
          this._stuckT = 0;
          this._reverseT = 1.3;
        }
        this._reverseT -= dt;
        v.input.accel = -0.6;
        v.input.steer = -clamp(Math.sign(l.x || 1), -1, 1);
        v.input.handbrake = 0;
        return;
      }
      const d2 = l.x * l.x + l.z * l.z;
      v.input.steer = l.z < 1 ? Math.sign(l.x || 1) : clamp((2 * l.x * v.wheelbase) / Math.max(1, d2) / 0.35, -1, 1);
      v.input.accel = speed > 8 ? 0 : 0.5;
      v.input.handbrake = 0;
      v.horn = false;
    }

    /**
     * A car stopped in our lane that isn't going anywhere (parked, wrecked,
     * abandoned, a finished racer, Jay's car left in the road): after a short
     * wait, pull round it on whichever side is clear. Returns the sideways
     * offset to steer by (0 when not bypassing).
     */
    _bypassStep(v, dt) {
      const b = this._bypass;
      if (b) {
        b.t += dt;
        const car = b.car;
        const l = car.removed ? { z: -99 } : v.worldToLocal(car.pos.x, car.pos.z, this._tmp7 || (this._tmp7 = {}));
        // Done once past it, once it drives off again (a queue moving at green), or after 9 s.
        if (l.z < -(car.hz + v.hz + 2) || car.speed > 3 || b.t > 9) b.leaving = (b.leaving || 0) + dt;
        if (b.leaving > 1.2) {
          this._bypass = null;
          return 0;
        }
        return b.side * 3.3 * (b.leaving ? 1 - b.leaving / 1.2 : Math.min(1, b.t / 0.8));
      }
      const o = this._blockedBy;
      const plow = this.plow;
      // A plough goes round anything slow (a queue at the lights too); others only round a parked or broken-down car.
      const parkedish = o && o.pos && !o.removed && (plow ? o.speed < 2 && o.driver !== 'player' : o.speed < 0.3 && (o.wrecked || !o.controller || o.driver !== 'ai' || o.controller.finished || o.controller.atEnd));
      if (!parkedish || this._gapAhead > (plow ? 18 : 12) || v.speed > (plow ? 7 : 1.5)) {
        this._waitT = 0;
        return 0;
      }
      // Waiting at a red or amber light (behind Jay, say) is not being blocked.
      const p0 = this.pieces[0];
      const next = this.pieces[1];
      if (!this.ignoreRed && p0 && next && next.signal && this.sys.world.signalState[next.signal] !== 'green' && (1 - this.t) * p0.length < this._gapAhead + 30) {
        this._waitT = 0;
        return 0;
      }
      this._waitT = (this._waitT || 0) + dt;
      if (this._waitT < (plow ? 0.25 : o.driver === 'player' ? 4 : 1.5)) return 0;
      this._waitT = 0;
      // Which side has room: no car in the way and no wall for the next 20 m.
      const ph = this.sys.game.physics;
      const h = v.yaw;
      const fx = Math.sin(h), fz = Math.cos(h);
      const lx = Math.cos(h), lz = -Math.sin(h);
      for (const side of [1, -1]) {
        let clear = true;
        for (let s = 0; s <= 20 && clear; s += 4) {
          const x = v.pos.x + fx * s + lx * side * 3.3;
          const z = v.pos.z + fz * s + lz * side * 3.3;
          if (ph.overlaps(x, z, 1.0, v.pos.y + 0.35, v.pos.y + 1.4)) clear = false;
          // (A plough only minds walls: cars on that side get shoved.)
          if (!plow) {
            for (const c of this.sys.vehicles.list) {
              if (c !== v && c !== o && Math.hypot(c.pos.x - x, c.pos.z - z) < 4) clear = false;
            }
          }
        }
        if (clear) {
          this._bypass = { car: o, side, t: 0 };
          return 0;
        }
      }
      // Walls both sides: a plough just goes straight through the car.
      return 0;
    }

    /** Nearest obstacle along the path ahead: cars, Jay on foot, pedestrians on the road. */
    _senseAhead(v, speed) {
      const reach = Math.min(48, 10 + speed * 2.4);
      let best = Infinity;
      let bestSpeed = 0;
      let blocker = null;
      let person = Infinity; // Jay on foot or a pedestrian: even a plough stops for them
      const pt = this._tmp4 || (this._tmp4 = {});
      const list = this.sys.vehicles.list;
      const player = this.sys.game.player;
      const crowd = this.sys.game.crowd;
      for (let s = 2; s <= reach; s += 2.6) {
        this._ahead(s, pt);
        for (const o of list) {
          if (o === v || (this._bypass && o === this._bypass.car)) continue;
          if (Math.abs(o.pos.y - v.pos.y) > 4) continue; // an aircraft overhead isn't in the lane
          const dx = o.pos.x - pt.x;
          const dz = o.pos.z - pt.z;
          const r = o.hx + 1.1;
          if (dx * dx + dz * dz > (o.hz + r) * (o.hz + r)) continue;
          const lo = o.worldToLocal(pt.x, pt.z, this._tmp5 || (this._tmp5 = {}));
          if (Math.abs(lo.x) > o.hx + 1.0 || Math.abs(lo.z) > o.hz + 0.6) continue;
          const gap = s - v.hz - Math.max(0, o.hz - Math.abs(lo.z)) - 0.3;
          if (gap < best) {
            best = gap;
            // Speed of the obstacle along our path.
            bestSpeed = Math.max(0, o.vel.x * Math.sin(pt.heading) + o.vel.z * Math.cos(pt.heading));
            blocker = o;
          }
        }
        if (player && !player.inVehicle && player.state !== 'dead') {
          const dx = player.pos.x - pt.x;
          const dz = player.pos.z - pt.z;
          if (dx * dx + dz * dz < 2.2 && Math.abs(player.pos.y - v.pos.y) < 1.5) {
            const gap = s - v.hz - 0.8;
            person = Math.min(person, gap);
            if (gap < best) {
              best = gap;
              bestSpeed = 0;
              blocker = { driver: 'player' };
            }
          }
        }
        if (crowd && crowd.blockingPoint && crowd.blockingPoint(pt.x, pt.z, 1.3)) {
          const gap = s - v.hz - 0.8;
          person = Math.min(person, gap);
          if (gap < best) {
            best = gap;
            bestSpeed = 0;
          }
        }
        if (best < s) break;
      }
      this._gapAhead = best;
      this._speedAhead = bestSpeed;
      this._blockedBy = blocker;
      this._personGap = person;
      // Jay's own car isn't shoved aside (you can box a runaway in).
      this._hardAhead = !!(blocker && blocker.pos && blocker.driver === 'player');
    }
  }

  function weightedPick(list) {
    const ok = list.filter(([id]) => VH.Vehicle.typeSpec(id));
    let total = 0;
    for (const [, w] of ok) total += w;
    let r = Math.random() * total;
    for (const [id, w] of ok) {
      r -= w;
      if (r <= 0) return id;
    }
    return ok[0][0];
  }

  class TrafficSystem {
    constructor(game) {
      this.game = game;
      this.vehicles = game.vehicles;
      this.net = game.roadnet;
      this.world = game.world;
      this.settings = game.settings;
      this._timer = 0;
      this.enabled = true;
      this.densityScale = 1;
      this._rng = Math.random;
    }

    get targetCount() {
      const q = this.settings.get('graphics.quality');
      const base = q === 'low' ? 10 : q === 'medium' ? 15 : q === 'ultra' ? 26 : 20;
      const night = this.game.environment.nightFactor || 0;
      return Math.round(base * this.densityScale * (1 - night * 0.3));
    }

    /** Make a car into AI traffic at a lane position. */
    spawnAt(lp, type) {
      const v = this.vehicles.spawn(type || weightedPick(TRAFFIC_TYPES), lp.x, lp.z, lp.heading, { role: 'traffic' });
      v.role = 'traffic';
      v.driver = 'ai';
      v.controller = new LaneDriver(this);
      v.controller.initAt(lp);
      v.setSpeed(lp.road.speedLimit * 0.75);
      return v;
    }

    update(dt, focus) {
      this._timer -= dt;
      if (this._timer > 0) return;
      this._timer = 0.4;
      const list = this.vehicles.list;
      let count = 0;
      const last = this.vehicles.lastPlayerCar;
      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        if (v.persistent || v === last || v.driver === 'player') continue;
        const traffic = v.role === 'traffic' || v.role === 'abandoned' || v.role === 'wreck';
        if (!traffic) continue;
        const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
        const seen = this.game.isVisible(v.pos.x, v.pos.y + 1, v.pos.z, 3);
        const tooFar = d > 270 || (d > 170 && !seen);
        const dead = (v.wrecked && d > 60 && !seen) || (v.controller && v.controller.atEnd && !seen && d > 40);
        if (tooFar || dead) {
          this.vehicles.remove(v);
          continue;
        }
        if (v.role === 'traffic') count++;
      }
      if (!this.enabled) return;
      const want = this.targetCount;
      let spawned = 0;
      while (count < want && spawned < 3) {
        const lp = this.net.randomLanePoint(this._rng, focus.x, focus.z, 70, 200);
        spawned++;
        if (!lp) continue;
        if (this.game.isVisible(lp.x, 1, lp.z, 4) && Math.hypot(lp.x - focus.x, lp.z - focus.z) < 150) continue;
        let clear = true;
        for (const v of list) {
          if (Math.hypot(v.pos.x - lp.x, v.pos.z - lp.z) < 14) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        this.spawnAt(lp);
        count++;
      }
    }
  }

  /**
   * After everything was cleared (a respawn): fill the streets around (x, z)
   * straight away. The screen is faded, so cars may appear in view.
   */
  TrafficSystem.prototype.repopulate = function (x, z) {
    const list = this.vehicles.list;
    const want = this.targetCount;
    let count = list.filter((v) => v.role === 'traffic').length;
    for (let tries = 0; tries < want * 4 && count < want; tries++) {
      const lp = this.net.randomLanePoint(this._rng, x, z, 30, 190);
      if (!lp) continue;
      if (list.some((v) => Math.hypot(v.pos.x - lp.x, v.pos.z - lp.z) < 14)) continue;
      this.spawnAt(lp);
      count++;
    }
    this._timer = 0;
  };

  TrafficSystem.TYPES = TRAFFIC_TYPES;
  VH.LaneDriver = LaneDriver;
  VH.TrafficSystem = TrafficSystem;
})();
