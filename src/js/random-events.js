/*
 * random-events.js — strangers, trouble and chances that turn up while
 * Jay walks or drives around, GTA-style.
 *
 * A director waits 60-150 s, then (when nothing else is going on: no job,
 * no heat, no cutscene) starts ONE event near Jay, out of sight, on the roads
 * and pavements. Each event has a radar blip, a one-line hint, a reward or a
 * consequence, and cleans up after itself: it ends when resolved, when Jay
 * ignores it and walks away (~40 s), or when it is far behind.
 *
 *   mugging    a thug robs a pedestrian. Hit him and he drops the wallet.
 *   chase      a stolen car races past with police on its tail. Ram it for a tip-off.
 *   van        an armoured van: shoot it up, guards pile out, grab the cash (heat 3 if seen).
 *   stranded   a smoking car by the kerb, its owner waving. Stop and help (or honk) for a tip.
 *   hitch      a hitchhiker flags Jay's car down; drive them to the marker for a fare.
 *   race       a sports car revs beside Jay; first to the checkpoint wins the pot.
 *   brawl      two people trade punches, onlookers film. Break it up, or pile in.
 *   accident   a collision, a hurt driver, an ambulance on its way. Stay with them.
 *
 * Debug: `event <name>` (F8 console) starts one now; `event end` clears it.
 * Nothing here is saved.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, dampAngle } = VH.math;

  const GAP = [60, 150]; // seconds between events
  const CAR_TYPES = ['vireo', 'zephyr', 'drifter', 'ironclad', 'lowrider', 'tern', 'sovereign', 'halcyon', 'beater', 'gallop', 'corvid', 'stinger'];
  const BROKEN_TYPES = ['beater', 'drifter', 'lowrider', 'halcyon', 'tern', 'sovereign'];
  const RACERS = ['vireo', 'zephyr', 'corvid', 'stinger', 'gallop'];

  /** Holds an agent still for the event to puppeteer it (the crowd skips its walker logic). */
  const HOLD = { hostile: false, update() {}, expired() { return false; } };

  const byJay = (src) => src === 'player' || (src && src.driver === 'player');
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------ puppeteering
  function usable(a) {
    if (!a || a.removed || a.dead) return false;
    if (a.state === 'flee') a.state = 'walk'; // got up after a knock: back to the event's script
    return a.state !== 'down';
  }

  function face(a, x, z, dt, rate) {
    a.heading = dampAngle(a.heading, Math.atan2(x - a.pos.x, z - a.pos.z), rate || 8, dt);
  }

  /** Walk (or run) towards a point; returns the distance left. */
  function goTo(a, x, z, speed, dt, stop) {
    const dx = x - a.pos.x;
    const dz = z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < (stop || 0.5)) {
      a.moveSpeed = 0;
      a.anim.sprint = false;
      return d;
    }
    a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 7, dt);
    a.moveSpeed = speed;
    a.anim.sprint = speed > 3;
    return d;
  }

  function ease(an, key, to, dt, rate) {
    an[key] += (to - an[key]) * Math.min(1, dt * (rate || 7));
    if (Math.abs(an[key] - to) < 0.01) an[key] = to;
  }

  /** Stand still, hands down. */
  function settle(a, dt) {
    a.moveSpeed = 0;
    a.anim.sprint = false;
    ease(a.anim, 'handsUp', 0, dt);
    ease(a.anim, 'cower', 0, dt);
    ease(a.anim, 'aim', 0, dt);
  }

  function wave(a, t) {
    a.anim.handsUp = 0.5 + 0.45 * Math.sin(t * 7.5 + a.id);
  }

  function thugLook() {
    const l = VH.Crowd.randomLook();
    l.outfit = 'hoodie';
    l.top = 0x26272b;
    l.shirt = 0x26272b;
    l.trim = 0x26272b;
    l.bottom = 0x15161a;
    l.hairStyle = 'buzz';
    l.hat = 'bandana';
    l.cap = true;
    l.glasses = Math.random() < 0.4 ? 'sun' : false;
    return l;
  }

  function uniformLook(top, hat) {
    const l = VH.Crowd.randomLook();
    l.outfit = 'polo';
    l.top = top;
    l.shirt = top;
    l.trim = top;
    l.bottom = 0x1c2230;
    l.hairStyle = 'short';
    if (hat) {
      l.hat = hat;
      l.cap = true;
    }
    return l;
  }

  // ------------------------------------------------------------ car drivers
  /** The getaway driver: flat out, through the lights. */
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
    constructor(game, v, target, mul) {
      this.game = game;
      this.target = target;
      this.mul = mul || 1.35;
      this.lane = new VH.LaneDriver(game.traffic, { speedMul: this.mul, plow: true, aggressive: true });
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
          const gap = Math.hypot(t.pos.x - v.pos.x, t.pos.z - v.pos.z);
          this.lane.speedMul = this.mul + clamp((gap - 30) / 60, 0, 0.5);
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

  /** Brakes to a stop and stays there. */
  const STOPPER = {
    update(v) {
      v.input.accel = v.speed > 1 ? -0.6 : 0;
      v.input.steer = 0;
      v.input.handbrake = 1;
      v.horn = false;
    },
  };

  /** The street racer: sits revving until the start, then drives the road to the checkpoint. */
  class RacerDriver {
    constructor(game, v, dest) {
      this.go = false;
      this.finished = false;
      this.t = 0;
      this.lane = new VH.LaneDriver(game.traffic, { speedMul: 1.3, aggressive: true, ignoreRed: true, plow: true });
      this.lane.destination = dest;
      const lp = game.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
      if (lp) this.lane.initAt(lp);
    }

    update(v, dt) {
      this.t += dt;
      if (this.finished) {
        STOPPER.update(v);
        return;
      }
      if (!this.go) {
        // Revving: stabs of throttle against the handbrake.
        v.input.accel = Math.sin(this.t * 9) > 0.2 ? 1 : 0;
        v.input.handbrake = 1;
        v.input.steer = 0;
        return;
      }
      this.lane.update(v, dt);
    }
  }

  // ================================================================ events
  class Ev {
    constructor(D) {
      this.D = D;
      this.g = D.game;
      this.agents = [];
      this.cars = [];
      this.props = [];
      this.t = 0;
      this.resolved = false;
      this.resT = 0;
      this.linger = 10; // seconds between "resolved" and the clean-up
      this.ignoreAfter = 40; // seconds Jay may stay away (> 70 m) before it lapses
      this.farEnd = 260;
      this.timeout = 300;
      this.ax = 0; // the event's centre, for distance checks
      this.az = 0;
      this.hint = null; // { title, text, icon }
      this.bl = []; // reusable blip objects
    }

    ped(x, z, o) {
      const a = this.g.crowd.spawn(x, z, Object.assign({ persistent: true, faction: 'civilian', role: 'event' }, o));
      a.brain = HOLD;
      this.agents.push(a);
      return a;
    }

    car(type, x, z, h, o) {
      const v = this.g.vehicles.spawn(type, x, z, h, Object.assign({ role: 'ambient', persistent: true }, o));
      v.role = 'ambient';
      this.cars.push(v);
      return v;
    }

    prop(obj) {
      this.g.scene.add(obj);
      this.props.push(obj);
      return obj;
    }

    dropProp(obj) {
      const i = this.props.indexOf(obj);
      if (i >= 0) this.props.splice(i, 1);
      this.g.scene.remove(obj);
    }

    resolve(linger) {
      if (this.resolved) return;
      this.resolved = true;
      this.resT = 0;
      if (linger !== undefined) this.linger = linger;
    }

    blip(i, x, z, type, label, heading) {
      let b = this.bl[i];
      if (!b) b = this.bl[i] = { x: 0, z: 0, type, label, heading: undefined, flash: false, noRim: false };
      b.x = x;
      b.z = z;
      b.type = type;
      b.label = label;
      b.heading = heading;
      b.off = false;
      return b;
    }

    blips(out) {
      for (const b of this.bl) if (b && !b.off) out.push(b);
    }

    onEvent() {}

    /** A vehicle of the event became Jay's. */
    taken() {}

    /** Detach everything: leftovers are handed to the director to tidy up when out of sight. */
    cleanup(hard) {
      const D = this.D;
      for (const o of this.props) this.g.scene.remove(o);
      this.props.length = 0;
      for (const a of this.agents) {
        if (a.removed) continue;
        if (hard) {
          this.g.crowd.remove(a);
          continue;
        }
        a.brain = a.brain === HOLD ? null : a.brain;
        a.hidden = false;
        a.persistent = false;
        a.moveSpeed = 0;
        a.anim.sprint = false;
        a.anim.phone = 0;
        a.anim.aim = 0;
        a.anim.handsUp = 0;
        a.anim.cower = 0;
        a.anim.talk = 0;
        a.anim.swing = 0;
        if (!a.dead && a.state !== 'down') a.state = 'walk';
        D.litter.push(a);
      }
      for (const v of this.cars) {
        if (v.removed || v.driver === 'player') continue;
        if (hard) {
          this.g.vehicles.remove(v);
          continue;
        }
        v.siren = false;
        v.horn = false;
        v.persistent = false;
        D.litter.push(v);
      }
      this.agents.length = 0;
      this.cars.length = 0;
      if (this.g.route && this.g.route === this._route) this.g.route = null;
      this._route = null;
    }

    /** A GPS route to a point for the player's map, kept fresh every 1.5 s. */
    route(dt, x, z) {
      this._routeT = (this._routeT || 0) - dt;
      if (this._routeT > 0) return;
      this._routeT = 1.5;
      const g = this.g;
      if (!VH.Minimap || !VH.Minimap.route || (g.missions && g.missions.run)) return;
      const p = g.player.vehicle || g.player;
      this._route = g.route = Math.hypot(x - p.pos.x, z - p.pos.z) > 30 ? VH.Minimap.route(g.layout, p.pos.x, p.pos.z, x, z) : null;
    }
  }

  // ---------------------------------------------------------------- mugging
  class Mugging extends Ev {
    start(forced) {
      const D = this.D;
      const s = D.pavement(forced, 70, 130);
      if (!s) return false;
      this.s = s;
      const a = s.pos(0, 0);
      const b = s.pos(1.25, 0);
      this.vic = this.ped(a.x, a.z, { heading: Math.atan2(b.x - a.x, b.z - a.z) });
      this.thug = this.ped(b.x, b.z, { faction: 'gang', health: 70, look: thugLook(), heading: Math.atan2(a.x - b.x, a.z - b.z) });
      this.thug.weapon = 'pistol';
      this.thug.anim.aim = 1;
      this.thug.anim.weaponPose = 'pistol';
      this.vic.anim.handsUp = 1;
      this.phase = 'rob';
      this.robT = 0;
      this.ax = s.x;
      this.az = s.z;
      this.fx = s.x + s.ax * 260;
      this.fz = s.z + s.az * 260;
      this.hint = { title: 'Mugging!', text: 'A thug is robbing someone. Stop him and get the wallet back.', icon: '⚠' };
      D.say('Mugger', 'Wallet. Now. Don\'t make me ask twice.');
      return true;
    }

    blipsUpdate() {
      const t = this.thug;
      const b = this.blip(0, t.pos.x, t.pos.z, 'challenge', 'Mugging');
      b.off = this.phase === 'done';
      if (this.wallet) this.blip(1, this.wallet.position.x, this.wallet.position.z, 'objective', 'Wallet');
      else if (this.bl[1]) this.bl[1].off = true;
    }

    flee() {
      if (this.phase === 'flee' || this.phase === 'drop') return;
      this.phase = 'flee';
      this.fleeT = 0;
      // Run along the road, away from Jay.
      const p = this.D.player.pos;
      const dir = Math.sign(this.s.ax * (this.thug.pos.x - p.x) + this.s.az * (this.thug.pos.z - p.z)) || 1;
      this.fx = this.thug.pos.x + this.s.ax * dir * 260;
      this.fz = this.thug.pos.z + this.s.az * dir * 260;
      this.D.say('Mugger', 'Pleasure doing business!');
    }

    dropWallet() {
      if (this.wallet || this.phase === 'done') return;
      const t = this.thug;
      this.wallet = this.prop(this.D.pickup(0xd2a23a, 'wallet'));
      this.wallet.position.set(t.pos.x, t.pos.y + 0.15, t.pos.z);
      this.phase = 'drop';
      this.dropT = 0;
      this.D.say('Victim', 'My wallet! Please, get it!');
      this.D.toast('He dropped the wallet. Pick it up!');
      const p = this.D.player.pos;
      const dir = Math.sign(this.s.ax * (t.pos.x - p.x) + this.s.az * (t.pos.z - p.z)) || 1;
      this.fx = t.pos.x + this.s.ax * dir * 260;
      this.fz = t.pos.z + this.s.az * dir * 260;
    }

    onEvent(kind, e) {
      if ((kind === 'hurt' || kind === 'died') && e.agent === this.thug && byJay(e.source)) this.dropWallet();
    }

    update(dt) {
      const D = this.D;
      const { vic, thug } = this;
      const J = D.player.pos;
      const dJ = Math.hypot(J.x - thug.pos.x, J.z - thug.pos.z);
      const vOk = usable(vic);
      const tOk = usable(thug);
      this.blipsUpdate();
      if (this.wallet) {
        this.wallet.rotation.y += dt * 2;
        this.wallet.children[0].position.y = 0.12 * Math.sin(this.t * 3);
      }
      if (this.phase === 'rob') {
        this.robT += dt;
        if (tOk) {
          face(thug, vic.pos.x, vic.pos.z, dt);
          thug.moveSpeed = 0;
          ease(thug.anim, 'aim', 1, dt);
          thug.anim.talk = Math.sin(this.t * 2.3) > 0.6 ? 1 : 0;
        }
        if (vOk) {
          face(vic, thug.pos.x, thug.pos.z, dt);
          vic.moveSpeed = 0;
          ease(vic.anim, 'handsUp', 1, dt);
          vic.anim.talk = Math.sin(this.t * 3.1) > 0.5 ? 1 : 0;
        }
        if (!this.shout && dJ < 36) {
          this.shout = true;
          D.say('Victim', 'Help! He\'s got a gun!');
        }
        if (this.robT > (dJ < 30 ? 30 : 14) || !vOk) this.flee();
        if (!tOk && !thug.dead) this.flee();
        if (thug.dead) this.dropWallet();
      } else if (this.phase === 'flee') {
        this.fleeT += dt;
        if (tOk) {
          ease(thug.anim, 'aim', 0, dt);
          goTo(thug, this.fx, this.fz, 5.4, dt);
        }
        if (vOk) {
          // Shaken: crouches, then calls it in.
          if (this.fleeT < 4) {
            ease(vic.anim, 'cower', 1, dt);
            ease(vic.anim, 'handsUp', 0, dt);
          } else {
            ease(vic.anim, 'cower', 0, dt);
            vic.anim.phone = 1;
          }
        }
        if (this.fleeT > 9) this.phase = 'done';
        if (this.fleeT > 9) this.resolve(3);
      } else if (this.phase === 'drop') {
        this.dropT += dt;
        if (tOk) {
          ease(thug.anim, 'aim', 0, dt);
          goTo(thug, this.fx, this.fz, 5.6, dt);
        }
        if (vOk) {
          face(vic, J.x, J.z, dt, 5);
          vic.moveSpeed = 0;
          wave(vic, this.t);
          vic.anim.talk = 1;
        }
        const w = this.wallet;
        if (Math.hypot(J.x - w.position.x, J.z - w.position.z) < 1.7) {
          const n = 160 + Math.floor(Math.random() * 120);
          this.dropProp(w);
          this.wallet = null;
          D.reward(n, 'wallet', 'Wallet returned');
          D.say('Victim', 'You\'re a hero! Please, take this.');
          this.phase = 'thanks';
          this.thanksT = 0;
        } else if (this.dropT > 50) {
          this.dropProp(w);
          this.wallet = null;
          this.phase = 'done';
          this.resolve(3);
        }
      } else if (this.phase === 'thanks') {
        this.thanksT += dt;
        if (tOk) goTo(thug, this.fx, this.fz, 5.6, dt);
        if (vOk) {
          face(vic, J.x, J.z, dt, 5);
          vic.moveSpeed = 0;
          wave(vic, this.t);
          vic.anim.talk = 1;
        }
        if (this.thanksT > 5) {
          this.phase = 'done';
          this.resolve(2);
        }
      } else if (tOk) {
        goTo(thug, this.fx, this.fz, 5.4, dt);
      }
      if (this.phase === 'done' && vOk) settle(vic, dt);
      if (vOk) {
        this.ax = vic.pos.x;
        this.az = vic.pos.z;
      }
    }
  }

  // ------------------------------------------------------------------ chase
  class Chase extends Ev {
    start(forced) {
      const D = this.D;
      const g = this.g;
      const net = g.roadnet;
      const p = g.player.pos;
      for (let i = 0; i < 24; i++) {
        const lp = net.randomLanePoint(Math.random, p.x, p.z, forced ? 70 : 120, forced ? 130 : 200);
        if (!lp || (i < 20 && g.isVisible(lp.x, 1, lp.z, 6))) continue;
        const sx = Math.sin(lp.heading);
        const sz = Math.cos(lp.heading);
        // The pack behind it, on the same road.
        const behind = [];
        for (const gap of [24, 38, 52]) {
          const bx = lp.x - sx * gap;
          const bz = lp.z - sz * gap;
          if (net.onRoad(bx, bz) && (i >= 20 || !g.isVisible(bx, 1, bz, 6))) behind.push([bx, bz]);
        }
        if (behind.length < 2) continue;
        const far = net.randomLanePoint(Math.random, p.x + (p.x - lp.x) * 1.5, p.z + (p.z - lp.z) * 1.5, 0, 160);
        if (!far) continue;
        if (!VH.Vehicle.typeSpec('interceptor')) return false;
        const type = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
        const run = this.fug = this.car(type, lp.x, lp.z, lp.heading);
        run.driver = 'ai';
        run.plow = true;
        run.lightsOn = true;
        run.controller = new RunDriver(g, run, { x: far.x, z: far.z });
        run.setSpeed(18);
        this.cops = [];
        for (const [bx, bz] of behind) {
          const cop = this.car('interceptor', bx, bz, lp.heading);
          cop.driver = 'ai';
          cop.isPolice = true;
          cop.ambientCop = true;
          cop.siren = true;
          cop.plow = true;
          cop.controller = new TailDriver(g, cop, run, 1.35 + this.cops.length * 0.04);
          cop.setSpeed(17);
          this.cops.push(cop);
        }
        this.rams = 0;
        this.paid = false;
        this.ax = lp.x;
        this.az = lp.z;
        this.linger = 25;
        this.ignoreAfter = 25;
        this.timeout = 200;
        this.hint = { title: 'Police chase', text: 'A stolen car is being chased. Ram it from behind for a tip-off reward.', icon: '🚓' };
        void D;
        return true;
      }
      return false;
    }

    onEvent(kind, e) {
      const f = this.fug;
      if (kind === 'enter') {
        if (e.v === f) {
          // Jay took the getaway car: now it is his problem.
          this.fug = null;
          this.D.takeCar(this, e.v);
          const pol = this.g.police;
          if (pol && !(this.g.missions && this.g.missions.suppressHeat)) {
            pol.setLevel(Math.max(pol.level, 2), 'stealCar');
            pol._sawPlayer();
          }
          this.resolve(5);
        } else if (this.cops && this.cops.indexOf(e.v) >= 0) {
          this.cops.splice(this.cops.indexOf(e.v), 1);
          this.D.takeCar(this, e.v);
        }
      } else if (kind === 'impact' && f && !this.paid && !f.removed) {
        const jv = this.g.player.vehicle;
        if (jv && ((e.v === f && e.other === jv) || (e.other === f && e.v === jv)) && e.speed > 5) {
          this.rams++;
          if (this.rams >= 1) {
            this.paid = true;
            this.D.reward(350, 'tipoff', 'Tip-off bounty');
            this.D.toast('Nice hit! The cops will take it from here.');
            this.resolve(25);
          }
        }
      }
    }

    update() {
      const f = this.fug;
      const alive = f && !f.removed;
      if (alive) {
        this.ax = f.pos.x;
        this.az = f.pos.z;
        const b = this.blip(0, f.pos.x, f.pos.z, 'enemy', 'Fugitive');
        b.off = false;
        b.flash = true;
        if (f.wrecked && !this.resolved) this.resolve(15);
      } else if (this.bl[0]) this.bl[0].off = true;
      for (let i = 0; i < 3; i++) {
        const c = this.cops && this.cops[i];
        if (c && !c.removed && !c.wrecked) {
          this.blip(1 + i, c.pos.x, c.pos.z, 'police', null, c.yaw).noRim = true;
        } else if (this.bl[1 + i]) this.bl[1 + i].off = true;
      }
      // Gave up: the fugitive is smashed and the cruisers are on top of it.
      if (alive && f.wrecked && !this.resolved) this.resolve(15);
    }
  }

  // -------------------------------------------------------------------- van
  class Van extends Ev {
    start(forced) {
      const g = this.g;
      const net = g.roadnet;
      const p = g.player.pos;
      if (!VH.Vehicle.typeSpec('bulwark')) return false;
      for (let i = 0; i < 24; i++) {
        const lp = net.randomLanePoint(Math.random, p.x, p.z, forced ? 60 : 100, forced ? 100 : 160);
        if (!lp || (i < 20 && g.isVisible(lp.x, 1, lp.z, 8))) continue;
        const far = net.randomLanePoint(Math.random, p.x + (p.x - lp.x) * 1.2, p.z + (p.z - lp.z) * 1.2, 0, 160);
        if (!far) continue;
        const v = this.van = this.car('bulwark', lp.x, lp.z, lp.heading);
        v.driver = 'ai';
        v.setSpeed(9);
        const lane = new VH.LaneDriver(g.traffic, { speedMul: 0.62, maxSpeed: 12 });
        lane.destination = { x: far.x, z: far.z };
        const l2 = net.nearestLane(v.pos.x, v.pos.z, v.yaw);
        if (l2) lane.initAt(l2);
        v.controller = lane;
        this.hp0 = v.health;
        this.phase = 'drive';
        this.ax = lp.x;
        this.az = lp.z;
        this.linger = 14;
        this.ignoreAfter = 25;
        this.hint = { title: 'Armoured van', text: 'Cash in transit. Shoot out its tyres, then grab the cash. Police won\'t like it.', icon: '💰' };
        return true;
      }
      return false;
    }

    disable() {
      const v = this.van;
      const g = this.g;
      this.phase = 'stopped';
      this.stopT = 0;
      v.controller = STOPPER;
      v.lightsOn = true;
      if (g.fx) {
        for (const w of v._wheelPos) {
          const p = v.localToWorld(w.x, w.z, {});
          g.fx.sparks(p.x, v.pos.y + 0.3, p.z, 0, 1, 8, 4);
          g.fx.tyreSmoke(p.x, v.pos.y, p.z, 1.2, 0, 0, 'asphalt');
        }
      }
      this.D.toast('Tyres gone. The guards are bailing out!');
      // Two guards climb out and open fire.
      const gl = [0x1c2a48, 0x23304f];
      for (let k = 0; k < 2; k++) {
        const side = k ? -1 : 1;
        const w = v.localToWorld(side * (v.hx + 0.9), v.hz * 0.3, {});
        const a = g.combat.spawnEnemy(w.x, w.z, {
          faction: 'guard', weapon: 'pistol', alert: true, hostile: true, accuracy: 0.3, health: 70,
          look: uniformLook(gl[k], 'cap'), heading: v.yaw + side * 1.2,
        });
        a.role = 'enemy';
        this.agents.push(a);
      }
    }

    onEvent(kind, e) {
      if (kind === 'enter' && e.v === this.van) {
        this.van = null;
        this.D.takeCar(this, e.v);
        this.D.heat(3, 'robbery', e.v.pos.x, e.v.pos.z);
        this.resolve(5);
      }
    }

    update(dt) {
      const g = this.g;
      const v = this.van;
      if (!v || v.removed) {
        if (this.bl[0]) this.bl[0].off = true;
        return;
      }
      this.ax = v.pos.x;
      this.az = v.pos.z;
      this.blip(0, v.pos.x, v.pos.z, 'challenge', 'Armoured van');
      if (this.cash) this.blip(1, this.cash.position.x, this.cash.position.z, 'objective', 'Cash');
      if (this.phase === 'drive') {
        const hit = v.lastHitBy && (v.lastHitBy === 'player' || v.lastHitBy.driver === 'player');
        if (v.wrecked) {
          // Blown up: the money goes with it.
          this.D.toast('The van blew up. So did the cash.');
          this.phase = 'done';
          this.resolve(8);
        } else if (hit && v.health < this.hp0 - 40) this.disable();
        else if (v.health < this.hp0 - 40 && v.driver !== 'ai') this.phase = 'done';
      } else if (this.phase === 'stopped') {
        this.stopT += dt;
        if (g.fx && this.stopT < 8 && (this.fxT = (this.fxT || 0) - dt) < 0) {
          this.fxT = g.settings.get('graphics.quality') === 'low' ? 0.5 : 0.18;
          const p = v.localToWorld(0, v.hz * 0.8, {});
          g.fx.engineSmoke(p.x, v.pos.y + 1.2, p.z, 0.3, 0, 0);
        }
        if (!this.cash && this.stopT > 1.5) {
          // The back doors swing open: bags of cash on the road.
          const w = v.localToWorld(0, -v.hz - 1.1, {});
          this.cash = this.prop(this.D.pickup(0x3fbf5a, 'cash'));
          this.cash.position.set(w.x, g.physics.groundHeight(w.x, w.z, v.pos.y + 2) + 0.2, w.z);
          this.D.say('Guard', 'Stay away from the truck!');
        }
        if (this.cash) {
          this.cash.rotation.y += dt * 1.8;
          this.cash.children[0].position.y = 0.1 * Math.sin(this.t * 3);
          const J = g.player.pos;
          const c = this.cash.position;
          if (Math.hypot(J.x - c.x, J.z - c.z) < 2.4) {
            const n = 800 + Math.floor(Math.random() * 700);
            this.dropProp(this.cash);
            this.cash = null;
            this.phase = 'done';
            this.D.reward(n, 'cash', 'Cash grabbed');
            // Seen by the police: that is a bank job.
            this.D.heat(3, 'robbery', c.x, c.z);
            this.resolve(10);
          }
        }
        if (this.stopT > 90) {
          this.phase = 'done';
          this.resolve(2);
        }
      }
    }
  }

  // --------------------------------------------------------------- stranded
  class Stranded extends Ev {
    start(forced) {
      const D = this.D;
      const g = this.g;
      const lp = D.roadSpot(forced, 70, 130);
      if (!lp) return false;
      const r = lp.road;
      // Pulled over at the kerb side of the lane.
      const type = BROKEN_TYPES[Math.floor(Math.random() * BROKEN_TYPES.length)];
      const v = this.v = this.car(type, lp.x, lp.z, lp.heading);
      v.lightsOn = true;
      v.health = 420;
      v.model.setDamage(0.3);
      v.driver = null;
      const w = v.localToWorld(v.hx + 0.95, v.hz * 0.55, {});
      this.owner = this.ped(w.x, w.z, { heading: v.yaw - Math.PI / 2 });
      this.helpT = 0;
      this.ax = lp.x;
      this.az = lp.z;
      this.state = 'broken';
      this.linger = 12;
      this.ignoreAfter = 30;
      this.hint = { title: 'Broken-down car', text: 'A driver is stranded. Stop beside them (or honk) to lend a hand.', icon: '🔧' };
      void r;
      void g;
      return true;
    }

    update(dt) {
      const g = this.g;
      const v = this.v;
      const o = this.owner;
      const J = g.player;
      const oOk = usable(o);
      if (!v || v.removed) return;
      this.ax = v.pos.x;
      this.az = v.pos.z;
      this.blip(0, v.pos.x, v.pos.z, 'challenge', 'Stranded driver');
      const dJ = Math.hypot(J.pos.x - o.pos.x, J.pos.z - o.pos.z);
      if (this.state === 'broken') {
        // Smoke from under the bonnet.
        this.fxT = (this.fxT || 0) - dt;
        if (g.fx && this.fxT <= 0) {
          this.fxT = g.settings.get('graphics.quality') === 'low' ? 0.35 : 0.12;
          const p = v.localToWorld(0, v.hz * 0.7, {});
          g.fx.engineSmoke(p.x, v.pos.y + 1.0, p.z, 0.45, 0, 0);
        }
        v.input.handbrake = 1;
        if (oOk) {
          if (dJ < 70) {
            // Flags Jay down; turns to talk once he is close.
            face(o, J.pos.x, J.pos.z, dt, 5);
            if (dJ > 5) wave(o, this.t);
            else {
              ease(o.anim, 'handsUp', 0, dt);
              o.anim.talk = 1;
            }
            o.anim.phone = 0;
          } else {
            o.anim.phone = 1;
            ease(o.anim, 'handsUp', 0, dt);
          }
        }
        // Standing by (on foot, or stopped in a car) for a few seconds; the horn counts triple.
        const veh = J.vehicle;
        const near = veh ? dJ < 9 && veh.speed < 3 : dJ < 4.2;
        const honk = veh && veh.horn && dJ < 16 && veh.speed < 4;
        if (near || honk) {
          this.helpT += dt * (honk ? 3 : 1);
          if (this.helpT > 0.6 && !this.said1) {
            this.said1 = true;
            this.D.say('Driver', veh ? 'Could you give me a jump? Battery\'s dead!' : 'Engine\'s cooked. Give me a hand?');
          }
        } else this.helpT = Math.max(0, this.helpT - dt * 0.5);
        if (this.helpT > 2.6) {
          const n = 90 + Math.floor(Math.random() * 70);
          this.D.reward(n, 'tip', 'Good samaritan');
          this.D.say('Driver', 'You\'re a lifesaver! Here, for your trouble.');
          this.state = 'fixed';
          this.fixT = 0;
        }
      } else if (this.state === 'fixed') {
        this.fixT += dt;
        if (oOk) {
          const d = goTo(o, v.pos.x - Math.cos(v.yaw) * (v.hx + 0.4), v.pos.z + Math.sin(v.yaw) * (v.hx + 0.4), 2.2, dt, 0.9);
          if (this.fixT < 1.5 || d > 1.2) wave(o, this.t);
          if (d <= 1.2 && this.fixT > 2.5) {
            o.hidden = true;
            this.state = 'leaving';
            v.health = 900;
            v.model.setDamage(0.1);
            v.driver = 'ai';
            const lane = new VH.LaneDriver(g.traffic, {});
            const lp = g.roadnet.nearestLane(v.pos.x, v.pos.z, v.yaw);
            if (lp) lane.initAt(lp);
            v.controller = lane;
            this.resolve(10);
          }
        } else this.state = 'leaving';
      }
    }
  }

  // ------------------------------------------------------------------ hitch
  class Hitch extends Ev {
    start(forced) {
      const D = this.D;
      const g = this.g;
      const p = g.player;
      const jv = p.vehicle;
      if (!jv || jv.kind !== 'car' || jv.flying || jv.isPolice) return false;
      const s = D.pavementAhead(jv, forced ? 55 : 85);
      if (!s) return false;
      this.s = s;
      const a = s.pos(0, 0);
      this.ped1 = this.ped(a.x, a.z, { heading: Math.atan2(s.tx, s.tz) });
      this.state = 'wave';
      this.ax = s.x;
      this.az = s.z;
      this.ignoreAfter = 10;
      this.linger = 8;
      this.hint = { title: 'Hitchhiker', text: 'Someone is flagging you down. Pull over beside them for a fare.', icon: '🚕' };
      return true;
    }

    update(dt) {
      const g = this.g;
      const a = this.ped1;
      const J = g.player;
      const jv = J.vehicle;
      const aOk = usable(a) || a.hidden;
      if (!aOk && this.state !== 'done') {
        if (this.state === 'ride') this.D.toast('Your fare won\'t be needing a ride now.');
        this.state = 'done';
        this.resolve(2);
        this.endRoute();
        return;
      }
      if (this.state === 'wave') {
        this.blip(0, a.pos.x, a.pos.z, 'challenge', 'Hitchhiker');
        const dist = Math.hypot(J.pos.x - a.pos.x, J.pos.z - a.pos.z);
        if (dist < 70) {
          // Facing the road, facing the car, one arm up.
          face(a, jv ? jv.pos.x : J.pos.x, jv ? jv.pos.z : J.pos.z, dt, 5);
          wave(a, this.t);
          a.anim.talk = 0;
        }
        if (jv && jv.kind === 'car' && !jv.flying && dist < 11 && jv.speed < 2.5) {
          this.state = 'board';
          this.boardT = 0;
          this.car1 = jv;
          this.D.say('Hitchhiker', 'Oh, thank you! Quick, I\'m late.');
        } else if (dist > 45 && this.t > 8 && (!jv || dist > 70)) this.ignoreT = 99;
      } else if (this.state === 'board') {
        this.boardT += dt;
        this.bl[0].off = true;
        const jc = this.car1;
        if (jv !== jc) {
          this.state = 'done';
          this.resolve(1);
          return;
        }
        const d = goTo(a, jc.pos.x, jc.pos.z, 2.8, dt, 1.4);
        ease(a.anim, 'handsUp', 0, dt);
        if (d < 1.5 || this.boardT > 3) {
          a.hidden = true;
          a.moveSpeed = 0;
          this.state = 'ride';
          this.rideT = 0;
          // Somewhere across town.
          const net = g.roadnet;
          let lp = null;
          for (let i = 0; i < 12 && !lp; i++) lp = net.randomLanePoint(Math.random, a.pos.x, a.pos.z, 350, 650);
          if (!lp) lp = net.randomLanePoint(Math.random, a.pos.x, a.pos.z, 150, 500);
          this.dest = lp ? { x: lp.x, z: lp.z } : { x: a.pos.x + 400, z: a.pos.z };
          this.startPos = { x: a.pos.x, z: a.pos.z };
          this.dist = Math.hypot(this.dest.x - a.pos.x, this.dest.z - a.pos.z);
          this.limit = this.dist / 10 + 28;
          this.marker = this.prop(this.D.marker(0xffd23a, 5));
          const gy = g.physics.groundHeight(this.dest.x, this.dest.z, 50);
          this.marker.position.set(this.dest.x, gy, this.dest.z);
          this.ax = this.dest.x;
          this.az = this.dest.z;
          this.ignoreAfter = 9999; // a fare is not ignorable
          this.D.toast('Take the fare to the marker (on the map).');
          this.D.say('Hitchhiker', 'Take me over to the yellow marker. I\'ll make it worth your while.');
        }
      } else if (this.state === 'ride') {
        this.rideT += dt;
        const jc = this.car1;
        this.blip(0, this.dest.x, this.dest.z, 'objective', 'Fare drop-off');
        this.route(dt, this.dest.x, this.dest.z);
        a.pos.x = jc.pos.x;
        a.pos.z = jc.pos.z;
        this.marker.rotation.y += dt;
        if (jv !== jc || jc.removed) {
          this.D.say('Hitchhiker', 'Forget it, I\'ll walk!');
          a.hidden = false;
          this.state = 'done';
          this.endRoute();
          this.resolve(1);
          return;
        }
        if (this.rideT > this.limit && !this.late) {
          this.late = true;
          this.D.say('Hitchhiker', 'Forget the tip, man.');
        }
        if (Math.hypot(jc.pos.x - this.dest.x, jc.pos.z - this.dest.z) < 11 && jc.speed < 3) {
          const base = 40 + Math.round(this.dist * 0.12);
          const tip = this.rideT <= this.limit ? 50 : 0;
          this.D.reward(base + tip, 'fare', 'Fare');
          this.D.say('Hitchhiker', tip ? 'Right on time. Keep the change!' : 'Thanks for the lift.');
          // Out of the door and off down the pavement.
          const w = jc.localToWorld(jc.hx + 0.9, 0, {});
          a.hidden = false;
          a.pos.x = w.x;
          a.pos.z = w.z;
          a.heading = jc.yaw - Math.PI / 2;
          this.state = 'done';
          this.endRoute();
          this.dropProp(this.marker);
          this.resolve(6);
        }
        this.lastSpeed = jc.speed;
        this.ax = this.dest.x;
        this.az = this.dest.z;
      } else if (this.state === 'done') {
        if (a.hidden) a.hidden = false;
        if (usable(a)) settle(a, dt);
      }
    }

    onEvent(kind, e) {
      if (kind === 'impact' && this.state === 'ride' && e.speed > 9 && (e.v === this.car1 || e.other === this.car1)) this.D.say('Hitchhiker', 'Watch it! I\'m in here!');
    }

    endRoute() {
      if (this.g.route && this.g.route === this._route) this.g.route = null;
      this._route = null;
      if (this.bl[0]) this.bl[0].off = true;
    }
  }

  // ------------------------------------------------------------------- race
  class Race extends Ev {
    start() {
      const g = this.g;
      const p = g.player;
      const jv = p.vehicle;
      if (!jv || jv.kind !== 'car' || jv.flying || jv.speed > 4 || !g.roadnet.onRoad(jv.pos.x, jv.pos.z)) return false;
      // Pulls up on whichever side is road.
      let spot = null;
      for (const side of [-1, 1]) {
        const w = jv.localToWorld(side * 3.7, 1.2, {});
        if (g.roadnet.onRoad(w.x, w.z) && !g.physics.overlaps(w.x, w.z, 1.2, jv.pos.y + 0.4, jv.pos.y + 1.4)) {
          spot = w;
          break;
        }
      }
      if (!spot) return false;
      // The finish: some way down the road ahead.
      const net = g.roadnet;
      let lp = null;
      for (let i = 0; i < 40 && !lp; i++) {
        const c = net.randomLanePoint(Math.random, jv.pos.x, jv.pos.z, 330, 520);
        if (!c) continue;
        const dx = c.x - jv.pos.x;
        const dz = c.z - jv.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        if ((dx * Math.sin(jv.yaw) + dz * Math.cos(jv.yaw)) / d > 0.35) lp = c;
      }
      if (!lp) return false;
      this.finish = { x: lp.x, z: lp.z };
      const type = RACERS[Math.floor(Math.random() * RACERS.length)];
      const v = this.racer = this.car(type, spot.x, spot.z, jv.yaw);
      v.driver = 'ai';
      v.lightsOn = true;
      v.setSpeed(0);
      this.drv = v.controller = new RacerDriver(g, v, this.finish);
      this.jv = jv;
      this.state = 'rev';
      this.startT = 0;
      this.count = 4;
      this.marker = this.prop(this.D.marker(0x3fe0ff, 6));
      this.marker.position.set(lp.x, g.physics.groundHeight(lp.x, lp.z, 50), lp.z);
      this.ax = jv.pos.x;
      this.az = jv.pos.z;
      this.pot = 400;
      this.ignoreAfter = 9999;
      this.timeout = 160;
      this.linger = 8;
      this.hint = { title: 'Street race!', text: 'The driver beside you wants a race to the marker. Win $' + this.pot + ', lose $100.', icon: '🏁' };
      return true;
    }

    update(dt) {
      const g = this.g;
      const r = this.racer;
      const J = g.player;
      const jv = J.vehicle;
      this.blip(0, this.finish.x, this.finish.z, 'objective', 'Finish');
      if (r && !r.removed) this.blip(1, r.pos.x, r.pos.z, 'enemy', 'Racer', r.yaw);
      this.marker.rotation.y += dt;
      if (this.state === 'rev') {
        this.startT += dt;
        this.ax = r.pos.x;
        this.az = r.pos.z;
        if (this.startT > 0.8 && this.startT < 1.1 && !this.honk) {
          this.honk = true;
          this.D.say('Racer', 'Nice ride. Think you can keep up? First to the marker.');
        }
        const n = 4 - Math.floor((this.startT - 0.5) / 1.1);
        if (n < this.count && n >= 1 && n <= 3) {
          this.count = n;
          g.hud.showToast('' + n);
        }
        if (this.startT > 4.3) {
          this.state = 'go';
          this.drv.go = true;
          g.hud.showToast('GO!');
        }
      } else if (this.state === 'go') {
        this.route(dt, this.finish.x, this.finish.z);
        const fj = jv ? Math.hypot(jv.pos.x - this.finish.x, jv.pos.z - this.finish.z) : 1e9;
        const fr = r && !r.removed ? Math.hypot(r.pos.x - this.finish.x, r.pos.z - this.finish.z) : 1e9;
        this.ax = jv ? jv.pos.x : J.pos.x;
        this.az = jv ? jv.pos.z : J.pos.z;
        if (fj < 14) {
          this.D.reward(this.pot, 'race', 'Race won');
          this.D.say('Racer', 'Okay, okay. You earned it.');
          this.finishUp();
        } else if (fr < 14) {
          this.D.say('Racer', 'Better luck next time!');
          g.giveMoney(-100, 'race');
          this.D.toast('You lost the race: -$100.');
          this.finishUp();
        } else if (this.t > 120 || (!r || r.removed || r.wrecked)) {
          if (r && r.wrecked) this.D.toast('The racer wrecked. Race void.');
          this.finishUp();
        } else if (!jv && this.t > 8) {
          // Jay got out: he forfeits.
          this.D.toast('You forfeited the race.');
          this.finishUp();
        }
      }
    }

    finishUp() {
      this.state = 'done';
      if (this.drv) this.drv.finished = true;
      if (this.g.route && this.g.route === this._route) this.g.route = null;
      this._route = null;
      this.bl[0].off = true;
      this.dropProp(this.marker);
      this.resolve(8);
    }
  }

  // ------------------------------------------------------------------ brawl
  class Brawl extends Ev {
    start(forced) {
      const D = this.D;
      const s = D.pavement(forced, 70, 130);
      if (!s) return false;
      this.s = s;
      const a = s.pos(-0.65, 0);
      const b = s.pos(0.65, 0);
      this.f1 = this.ped(a.x, a.z, { heading: s.ax > 0.5 || s.az > 0.5 ? 1.57 : -1.57 });
      this.f2 = this.ped(b.x, b.z, { heading: 0 });
      face(this.f1, b.x, b.z, 1, 99);
      face(this.f2, a.x, a.z, 1, 99);
      // Onlookers in a rough ring.
      this.watch = [];
      const n = 3 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.8;
        const r = 3.6 + Math.random() * 1.2;
        const x = s.x + Math.cos(ang) * r;
        const z = s.z + Math.sin(ang) * r;
        if (D.game.roadnet.onRoad(x, z) && Math.random() < 0.7) continue;
        const w = this.ped(x, z, {});
        w.anim.phone = i % 2 === 0 ? 1 : 0;
        w.cheer = i % 2 === 1;
        this.watch.push(w);
      }
      this.state = 'fight';
      this.swingT = [0.4, 0.9];
      this.fightT = 0;
      this.stepT = 0;
      this.stopT = 0;
      this.ax = s.x;
      this.az = s.z;
      this.ignoreAfter = 35;
      this.hint = { title: 'Street fight', text: 'Two people are fighting. Step in to break it up, or join in.', icon: '👊' };
      D.say('Onlooker', 'Fight! Fight!');
      return true;
    }

    onEvent(kind, e) {
      if (this.state === 'done') return;
      if (kind === 'hurt' || kind === 'died') {
        if ((e.agent === this.f1 || e.agent === this.f2) && byJay(e.source) && this.state === 'fight') {
          // Jay joined in: the one he hit comes for him.
          this.foe = e.agent;
          this.other = e.agent === this.f1 ? this.f2 : this.f1;
          this.state = 'vsJay';
          this.vsT = 0;
          this.hitT = 0.5;
          this.D.say('Fighter', 'You want some too?!');
        }
      } else if (kind === 'gunshot' && this.state === 'fight' && e.byPlayer) {
        const dx = e.x - this.ax;
        const dz = e.z - this.az;
        if (dx * dx + dz * dz < 900) this.scatter();
      }
    }

    scatter() {
      this.state = 'scatter';
      this.scT = 0;
      for (const a of this.agents) {
        if (!usable(a)) continue;
        a.anim.sprint = true;
        a.anim.phone = 0;
      }
    }

    update(dt) {
      const g = this.g;
      const { f1, f2 } = this;
      const J = g.player;
      const k1 = usable(f1);
      const k2 = usable(f2);
      this.blip(0, this.ax, this.az, 'challenge', 'Fight').off = this.state === 'done';
      for (const f of [f1, f2]) if (f.anim.swing > 0) f.anim.swing = Math.max(0, f.anim.swing - dt * 2.4);
      this.fightT += dt;
      if (this.state === 'fight') {
        // They trade blows and shove each other about.
        if (k1) { face(f1, f2.pos.x, f2.pos.z, dt, 12); f1.anim.talk = 0; ease(f1.anim, 'aim', 0, dt); }
        if (k2) { face(f2, f1.pos.x, f1.pos.z, dt, 12); f2.anim.talk = 0; ease(f2.anim, 'aim', 0, dt); }
        const d = Math.hypot(f1.pos.x - f2.pos.x, f1.pos.z - f2.pos.z);
        this.stepT -= dt;
        const closing = d > 1.35;
        if (k1) f1.moveSpeed = closing ? 1.6 : 0;
        if (k2) f2.moveSpeed = closing ? 1.6 : 0;
        for (let i = 0; i < 2; i++) {
          this.swingT[i] -= dt;
          if (this.swingT[i] <= 0) {
            this.swingT[i] = rnd(0.55, 1.15);
            const a = i ? f2 : f1;
            const b = i ? f1 : f2;
            if (usable(a) && usable(b) && d < 1.9) {
              a.anim.swing = 1;
              if (Math.random() < 0.7) {
                // The other one reels back from the blow.
                const nx = (b.pos.x - a.pos.x) / (d || 1);
                const nz = (b.pos.z - a.pos.z) / (d || 1);
                b.pos.x += nx * 0.18;
                b.pos.z += nz * 0.18;
                if (g.audio.meleeHit) g.audio.meleeHit(false);
              }
            }
          }
        }
        for (const w of this.watch) {
          if (!usable(w)) continue;
          face(w, this.ax, this.az, dt, 5);
          w.moveSpeed = 0;
          if (w.cheer) {
            wave(w, this.t);
            w.anim.talk = 1;
          }
        }
        // Jay steps between them: that breaks it up.
        const jd = Math.min(Math.hypot(J.pos.x - f1.pos.x, J.pos.z - f1.pos.z), Math.hypot(J.pos.x - f2.pos.x, J.pos.z - f2.pos.z));
        if (!J.vehicle && jd < 2.6) this.stopT += dt;
        else this.stopT = Math.max(0, this.stopT - dt);
        if (this.stopT > 1.3) {
          this.state = 'apart';
          this.apT = 0;
          this.D.reward(60, 'peace', 'Fight broken up');
          this.D.say('Fighter', 'Alright, alright! He started it!');
        } else if (this.fightT > 45 || (!k1 && !k2)) this.scatter();
        else if (!k1 || !k2) this.scatter();
      } else if (this.state === 'vsJay') {
        this.vsT += dt;
        const foe = this.foe;
        const other = this.other;
        if (usable(foe)) {
          face(foe, J.pos.x, J.pos.z, dt, 10);
          const d = Math.hypot(J.pos.x - foe.pos.x, J.pos.z - foe.pos.z);
          foe.moveSpeed = d > 1.3 && !J.vehicle ? 4.4 : 0;
          foe.anim.sprint = d > 4;
          this.hitT -= dt;
          if (d < 1.7 && this.hitT <= 0 && !J.isDead) {
            this.hitT = rnd(0.8, 1.3);
            foe.anim.swing = 1;
            J.damage(6, 'melee');
            if (g.audio.meleeHit) g.audio.meleeHit(false);
            g.cameraRig.addShake(0.15);
          }
        }
        if (usable(other)) {
          // The other one backs off and cheers it on, then slips away.
          ease(other.anim, 'handsUp', 0.5, dt);
          other.moveSpeed = 0;
          face(other, J.pos.x, J.pos.z, dt);
        }
        for (const w of this.watch) {
          if (!usable(w)) continue;
          w.moveSpeed = 0;
          face(w, foe.pos.x, foe.pos.z, dt, 5);
        }
        if (this.vsT > 14 || !usable(foe)) {
          if (usable(foe)) this.D.say('Fighter', 'Crazy... let\'s get out of here!');
          this.scatter();
        }
      } else if (this.state === 'apart') {
        this.apT += dt;
        for (const f of [f1, f2]) {
          if (!usable(f)) continue;
          const away = f === f1 ? -1 : 1;
          if (this.apT < 2.2) {
            f.moveSpeed = 0;
            face(f, J.pos.x, J.pos.z, dt, 5);
            f.anim.talk = 1;
            ease(f.anim, 'handsUp', 0.6, dt);
          } else {
            ease(f.anim, 'handsUp', 0, dt);
            goTo(f, f.pos.x + this.s.ax * away * 40, f.pos.z + this.s.az * away * 40, 1.8, dt);
          }
        }
        for (const w of this.watch) {
          if (!usable(w)) continue;
          w.anim.phone = 0;
          if (this.apT > 1.5) goTo(w, w.pos.x - this.s.tx * 30 + this.s.ax * 10, w.pos.z - this.s.tz * 30 + this.s.az * 10, 1.4, dt);
        }
        if (this.apT > 8) {
          this.state = 'done';
          this.resolve(3);
        }
      } else if (this.state === 'scatter') {
        this.scT += dt;
        for (const a of this.agents) {
          if (!usable(a)) continue;
          ease(a.anim, 'handsUp', 0, dt);
          const dx = a.pos.x - J.pos.x;
          const dz = a.pos.z - J.pos.z;
          a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 6, dt);
          a.moveSpeed = 5;
          a.anim.sprint = true;
        }
        if (this.scT > 7) {
          this.state = 'done';
          this.resolve(2);
        }
      } else if (this.state === 'done') {
        for (const a of this.agents) if (usable(a)) settle(a, dt);
      }
    }
  }

  // --------------------------------------------------------------- accident
  class Accident extends Ev {
    start(forced) {
      const D = this.D;
      const g = this.g;
      const lp = D.roadSpot(forced, 80, 140);
      if (!lp) return false;
      if (!VH.Vehicle.typeSpec('medic')) return false;
      const h = lp.heading;
      const sx = Math.sin(h);
      const sz = Math.cos(h);
      const t1 = BROKEN_TYPES[Math.floor(Math.random() * BROKEN_TYPES.length)];
      const t2 = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
      const c1 = this.c1 = this.car(t1, lp.x, lp.z, h);
      const c2 = this.c2 = this.car(t2, lp.x + sx * (c1.hz + 2.3) - sz * 1.0, lp.z + sz * (c1.hz + 2.3) + sx * 1.0, h + 1.0);
      for (const c of [c1, c2]) {
        c.health = 380;
        c.model.setDamage(0.55);
        c.lightsOn = true;
        c.driver = null;
      }
      // Hurt driver crouched at the door; the other one on the phone, shaken.
      const w1 = c1.localToWorld(c1.hx + 1.0, 0.3, {});
      const w2 = c2.localToWorld(-(c2.hx + 1.0), 0, {});
      this.hurt = this.ped(w1.x, w1.z, { heading: c1.yaw - Math.PI / 2 });
      this.other = this.ped(w2.x, w2.z, { heading: c2.yaw + Math.PI / 2 });
      this.hurt.anim.cower = 1;
      this.hurt.anim.sprint = false;
      this.other.anim.phone = 1;
      this.ax = lp.x;
      this.az = lp.z;
      this.helpT = 0;
      this.state = 'wait';
      this.medics = [];
      this.linger = 12;
      this.ignoreAfter = 35;
      this.timeout = 200;
      this.hint = { title: 'Car accident', text: 'Two cars collided and a driver is hurt. An ambulance is on the way: stay with them.', icon: '🚑' };
      // The ambulance comes screaming in from afar.
      const net = g.roadnet;
      const p = g.player.pos;
      for (let i = 0; i < 20 && !this.amb; i++) {
        const a = net.randomLanePoint(Math.random, lp.x, lp.z, 120, 190);
        if (!a || (i < 15 && g.isVisible(a.x, 1, a.z, 6)) || Math.hypot(a.x - p.x, a.z - p.z) < 60) continue;
        const v = this.amb = this.car('medic', a.x, a.z, a.heading);
        v.driver = 'ai';
        v.siren = true;
        v.plow = true;
        const lane = new VH.LaneDriver(g.traffic, { speedMul: 1.25, plow: true, aggressive: true });
        lane.destination = { x: lp.x, z: lp.z };
        const l2 = net.nearestLane(v.pos.x, v.pos.z, v.yaw);
        if (l2) lane.initAt(l2);
        v.controller = lane;
        v.setSpeed(14);
      }
      void D;
      return true;
    }

    update(dt) {
      const g = this.g;
      const J = g.player;
      const { hurt, other, amb } = this;
      this.blip(0, this.ax, this.az, 'challenge', 'Accident');
      // Smoke from the engines.
      this.fxT = (this.fxT || 0) - dt;
      if (g.fx && this.fxT <= 0 && this.state !== 'done') {
        this.fxT = g.settings.get('graphics.quality') === 'low' ? 0.5 : 0.2;
        const p = this.c1.localToWorld(0, this.c1.hz * 0.7, {});
        g.fx.engineSmoke(p.x, this.c1.pos.y + 1.0, p.z, 0.6, 0, 0);
      }
      const hOk = usable(hurt);
      const oOk = usable(other);
      const dJ = hOk ? Math.hypot(J.pos.x - hurt.pos.x, J.pos.z - hurt.pos.z) : 99;
      if (oOk) {
        face(other, hurt.pos.x, hurt.pos.z, dt, 4);
        other.anim.phone = this.state === 'wait' ? 1 : 0;
      }
      if (amb && !amb.removed) {
        this.blip(1, amb.pos.x, amb.pos.z, 'police', null, amb.yaw).noRim = true;
        amb.model.setSiren && amb.model.setSiren(amb.sirenTime);
        const dAmb = Math.hypot(amb.pos.x - this.ax, amb.pos.z - this.az);
        if (this.state === 'wait' && dAmb < 16) {
          amb.controller = STOPPER;
          this.state = 'medics';
          this.medT = 0;
          for (let k = 0; k < 2; k++) {
            const w = amb.localToWorld((k ? -1 : 1) * (amb.hx + 0.9), 0.5, {});
            const m = this.ped(w.x, w.z, { look: uniformLook(0xf4f4f1, null), heading: amb.yaw });
            this.medics.push(m);
          }
          this.D.say('Medic', 'Paramedics! Let us through, please!');
        }
      } else if (this.bl[1]) this.bl[1].off = true;
      if (this.state === 'wait') {
        if (hOk) {
          ease(hurt.anim, 'cower', 1, dt);
          hurt.anim.talk = dJ < 8 && Math.sin(this.t * 2) > 0.2 ? 1 : 0;
          if (dJ < 6) face(hurt, J.pos.x, J.pos.z, dt, 3);
        }
        if (!amb || amb.removed) {
          // No ambulance could be sent: they get up on their own.
          this.state = 'medics';
          this.medT = 6;
        }
      } else if (this.state === 'medics') {
        this.medT += dt;
        for (const m of this.medics) {
          if (!usable(m)) continue;
          if (hOk) {
            const d = goTo(m, hurt.pos.x + 0.9, hurt.pos.z + 0.4, 2.6, dt, 1.2);
            if (d < 1.4) face(m, hurt.pos.x, hurt.pos.z, dt);
          }
        }
        if (this.medT > 7 && hOk) {
          ease(hurt.anim, 'cower', 0, dt);
          if (this.medT > 9) this.state = 'done2';
        }
      } else if (this.state === 'done2') {
        for (const m of this.medics) if (usable(m)) settle(m, dt);
        if (hOk) settle(hurt, dt);
        this.doneT = (this.doneT || 0) + dt;
        if (this.doneT > 4) {
          this.state = 'done';
          this.resolve(3);
        }
      }
      // Staying with the casualty is the decent thing to do.
      if (!this.paid && hOk && dJ < 4.5 && !J.vehicle) {
        this.helpT += dt;
        if (this.helpT > 3.2) {
          this.paid = true;
          this.D.reward(80 + Math.floor(Math.random() * 40), 'tip', 'Stayed with the victim');
          this.D.say('Driver', 'Thank you for staying with me.');
        }
      } else if (!this.paid) this.helpT = Math.max(0, this.helpT - dt * 0.5);
      if (oOk) {
        this.ax = hOk ? hurt.pos.x : this.ax;
        this.az = hOk ? hurt.pos.z : this.az;
      }
    }
  }

  const EVENTS = {
    mugging: { cls: Mugging, w: 3 },
    chase: { cls: Chase, w: 2 },
    van: { cls: Van, w: 1.5 },
    stranded: { cls: Stranded, w: 2.5 },
    hitch: { cls: Hitch, w: 2, needs: 'drive' },
    race: { cls: Race, w: 1.6, needs: 'stopped' },
    brawl: { cls: Brawl, w: 2.5 },
    accident: { cls: Accident, w: 1.5 },
  };

  // ============================================================== director
  class RandomEvents {
    constructor(game) {
      this.game = game;
      this.saveKey = null;
      this.ev = null;
      this.enabled = true;
      this.litter = [];
      this._litterT = 0;
      this._next = rnd(40, 80);
      this._sayT = -1e5;
      this._farT = 0;
      this._ignoreT = 0;
      this.count = 0;
      this.last = null;
      this._mats = new Map();
      this._geo = {};
      VH.events.on('agent:hurt', (e) => this.ev && this.ev.onEvent('hurt', e));
      VH.events.on('agent:died', (e) => this.ev && this.ev.onEvent('died', e));
      VH.events.on('gunshot', (e) => this.ev && this.ev.onEvent('gunshot', e));
      VH.events.on('vehicle:impact', (e) => this.ev && this.ev.onEvent('impact', e));
      VH.events.on('vehicle:enter', (e) => this.ev && this.ev.onEvent('enter', e));
    }

    get player() {
      return this.game.player;
    }

    // ---------------------------------------------------------- helpers
    say(who, text) {
      const d = this.game.dialogue;
      const now = performance.now();
      if (!d || now - this._sayT < 2200 || d.active || (d.queue && d.queue.length)) return;
      this._sayT = now;
      try {
        d.play([[who, text]], { mode: 'ambient' });
      } catch (e) { /* subtitles are a nicety */ }
    }

    toast(text) {
      this.game.hud.showToast(text);
    }

    reward(n, reason, title) {
      const g = this.game;
      g.giveMoney(n, reason);
      g.hud.popScore(title.toUpperCase(), n);
      if (g.audio.cash) g.audio.cash();
    }

    /** A crime in plain sight of the police is worth heat (min level); otherwise bystanders may phone it in. */
    heat(level, kind, x, z) {
      const pol = this.game.police;
      if (!pol || (this.game.missions && this.game.missions.suppressHeat)) return;
      if (pol._copWitness && pol._copWitness(x, z)) {
        pol.setLevel(Math.max(pol.level, level), kind);
        pol._sawPlayer();
      } else pol.crime(kind, x, z);
    }

    /** A vehicle of the event is now Jay's: it is no longer the event's to tidy. */
    takeCar(ev, v) {
      const i = ev.cars.indexOf(v);
      if (i >= 0) ev.cars.splice(i, 1);
      v.persistent = true;
      v.role = 'player';
      v.siren = v.isPolice ? v.siren : false;
    }

    /** Pavement spot beside a road. s.pos(along, towardRoad) places things round it. */
    _site(r, along, side) {
      const g = this.game;
      const off = r.width / 2 + 1.9;
      const x = r.axis === 'z' ? r.coord + side * off : along;
      const z = r.axis === 'z' ? along : r.coord + side * off;
      const y = g.physics.groundHeight(x, z, 50);
      if (y > 0.8 || y < -0.1) return null;
      if (g.physics.overlaps(x, z, 1.0, y + 0.3, y + 1.7)) return null;
      const s = {
        x, z, y, side, road: r,
        ax: r.axis === 'z' ? 0 : 1, az: r.axis === 'z' ? 1 : 0, // along the road
        tx: r.axis === 'z' ? -side : 0, tz: r.axis === 'z' ? 0 : -side, // towards the road
        pos(a, t) {
          return { x: this.x + this.ax * a + this.tx * t, z: this.z + this.az * a + this.tz * t };
        },
      };
      return s;
    }

    /** A pavement spot near Jay, out of sight (or, when forced, in front of him). */
    pavement(forced, lo, hi) {
      const g = this.game;
      const p = g.player.pos;
      const net = g.roadnet;
      for (let i = 0; i < 30; i++) {
        let lp;
        if (forced) {
          const a = g.player.heading + (Math.random() - 0.5) * 1.0;
          const d = 16 + Math.random() * 10;
          lp = net.nearestLane(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, undefined, 40);
        } else lp = net.randomLanePoint(Math.random, p.x, p.z, lo, hi);
        if (!lp) continue;
        const r = lp.road;
        const s = this._site(r, lp.along, Math.random() < 0.5 ? 1 : -1);
        if (!s) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (forced ? d < 7 : g.isVisible(s.x, 1, s.z, 7)) continue;
        // Room for a scene: the pavement must run on a few metres each way.
        let ok = true;
        for (const a of [-4, 4]) {
          const q = s.pos(a, 0);
          const y = g.physics.groundHeight(q.x, q.z, 50);
          if (y > 0.8 || y < -0.1 || g.physics.overlaps(q.x, q.z, 0.6, y + 0.3, y + 1.7)) ok = false;
        }
        if (ok) return s;
      }
      return null;
    }

    /** A pavement spot on Jay's road, `dist` m ahead of his car (on the kerb side of his lane). */
    pavementAhead(jv, dist) {
      const g = this.game;
      const lp = g.roadnet.nearestLane(jv.pos.x, jv.pos.z, jv.yaw, 12);
      if (!lp || lp.dist > 7) return null;
      const r = lp.road;
      const along = clamp(lp.along + lp.dir * dist, r.from + 30, r.to - 30);
      const out = {};
      g.roadnet.lanePoint(r, lp.dir, 0, along, out);
      const off = r.axis === 'z' ? out.x - r.coord : out.z - r.coord;
      for (const side of [Math.sign(off) || 1, -(Math.sign(off) || 1)]) {
        const s = this._site(r, along, side);
        if (s) return s;
      }
      return null;
    }

    /** A lane point near Jay (out of sight, or ahead of him when forced). */
    roadSpot(forced, lo, hi) {
      const g = this.game;
      const p = g.player.pos;
      const net = g.roadnet;
      for (let i = 0; i < 30; i++) {
        let lp;
        if (forced) {
          const a = g.player.heading + (Math.random() - 0.5) * 0.8;
          const d = 26 + Math.random() * 12;
          lp = net.nearestLane(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, undefined, 30);
          if (lp && lp.dist > 6) lp = null;
        } else lp = net.randomLanePoint(Math.random, p.x, p.z, lo, hi);
        if (!lp) continue;
        if (!forced && g.isVisible(lp.x, 1, lp.z, 7)) continue;
        if (Math.hypot(lp.x - p.x, lp.z - p.z) < 10) continue;
        // Not in the middle of a junction.
        if (g.roadnet.nextJunction) {
          const j = g.roadnet.nextJunction(lp.road, lp.dir, lp.along);
          if (j) {
            const e = VH.RoadNet.edges(lp.road, lp.dir, j);
            if (Math.abs(lp.along - e.enter) < 20) continue;
          }
        }
        return lp;
      }
      return null;
    }

    // ------------------------------------------------------- 3D markers
    _mat(color, opacity) {
      const k = color + ':' + opacity;
      let m = this._mats.get(k);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        this._mats.set(k, m);
      }
      return m;
    }

    /** A bobbing pickup: children[0] is the bobbing part. */
    pickup(color, kind) {
      const g = new THREE.Group();
      const inner = new THREE.Group();
      let body;
      if (kind === 'cash') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2f8a45, roughness: 0.7, emissive: 0x0a3a14 });
        body = new THREE.Mesh(this._box(0.55, 0.28, 0.38), mat);
        const band = new THREE.Mesh(this._box(0.12, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.8 }));
        inner.add(band);
      } else {
        body = new THREE.Mesh(this._box(0.26, 0.06, 0.17), new THREE.MeshStandardMaterial({ color: 0x6b3f28, roughness: 0.6, emissive: 0x3a2200 }));
      }
      inner.add(body);
      inner.position.y = 0.45;
      g.add(inner);
      const beam = new THREE.Mesh(this._geo.beam || (this._geo.beam = new THREE.CylinderGeometry(0.4, 0.4, 5, 10, 1, true)), this._mat(color, 0.22));
      beam.position.y = 2.5;
      beam.renderOrder = 3;
      g.add(beam);
      return g;
    }

    _box(x, y, z) {
      const k = x + ',' + y + ',' + z;
      return this._geo[k] || (this._geo[k] = new THREE.BoxGeometry(x, y, z));
    }

    /** A tall beam and a ring on the ground. */
    marker(color, radius) {
      const g = new THREE.Group();
      const k = 'beam' + radius;
      const beam = new THREE.Mesh(this._geo[k] || (this._geo[k] = new THREE.CylinderGeometry(radius, radius, 70, 24, 1, true)), this._mat(color, 0.2));
      beam.position.y = 35;
      beam.renderOrder = 3;
      const ring = new THREE.Mesh(this._geo['ring' + radius] || (this._geo['ring' + radius] = new THREE.RingGeometry(radius * 0.8, radius, 32)), this._mat(color, 0.55));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.2;
      ring.renderOrder = 3;
      g.add(beam, ring);
      return g;
    }

    // ----------------------------------------------------- the director
    _quiet() {
      const g = this.game;
      const p = g.player;
      if (g.state !== 'playing') return false;
      if (g.missions && (g.missions.run || g.missions.cinematic)) return false;
      if (g.police && g.police.level > 0) return false;
      if (p.isDead || p.frozen || (p.vehicle && p.vehicle.flying)) return false;
      if (g.traffic && g.traffic.enabled === false) return false;
      if (g.dialogue && g.dialogue.active && g.dialogue.mode !== 'ambient') return false;
      const cb = g.layout.config.cityBounds || g.layout.config.bounds;
      return p.pos.x > cb.minX + 60 && p.pos.x < cb.maxX - 60 && p.pos.z > cb.minZ + 60 && p.pos.z < cb.maxZ - 60;
    }

    _pick() {
      const p = this.game.player;
      const v = p.vehicle;
      const list = [];
      let total = 0;
      for (const id of Object.keys(EVENTS)) {
        const E = EVENTS[id];
        if (id === this.last) continue;
        if (E.needs === 'drive' && !(v && v.kind === 'car' && v.speed > 3)) continue;
        if (E.needs === 'stopped' && !(v && v.kind === 'car' && v.speed < 3)) continue;
        list.push([id, E.w]);
        total += E.w;
      }
      let r = Math.random() * total;
      for (const [id, w] of list) {
        r -= w;
        if (r <= 0) return id;
      }
      return list.length ? list[0][0] : null;
    }

    /** Start an event now (the director, or the debug command when `forced`). Returns the event or null. */
    start(id, forced) {
      const E = EVENTS[id];
      if (!E || this.ev) return null;
      const ev = new E.cls(this);
      let ok = false;
      try {
        ok = ev.start(!!forced);
      } catch (e) {
        console.error('[random-events]', id, e);
      }
      if (!ok) {
        ev.cleanup(true);
        return null;
      }
      this.ev = ev;
      ev.id = id;
      this.last = id;
      this.count++;
      this._farT = 0;
      this._ignoreT = 0;
      if (ev.hint) this.game.hud.notify({ title: ev.hint.title, text: ev.hint.text, icon: ev.hint.icon, duration: 6000 });
      return ev;
    }

    /** For the debug console: start an event by name (or say why not). */
    trigger(id) {
      if (!EVENTS[id]) return 'Unknown event. Try: ' + Object.keys(EVENTS).join(', ');
      if (this.ev) this.end(true);
      const ev = this.start(id, true);
      if (ev) return 'Started: ' + id;
      if (EVENTS[id].needs) return 'Could not start ' + id + ' here (it needs Jay in a car' + (EVENTS[id].needs === 'stopped' ? ', stopped on a road' : ', on a road') + ').';
      return 'Could not find a spot for ' + id + ' here (try on a road).';
    }

    end(hard) {
      const ev = this.ev;
      if (!ev) return;
      this.ev = null;
      try {
        ev.cleanup(!!hard);
      } catch (e) {
        console.error('[random-events] cleanup', e);
      }
      this._next = rnd(GAP[0], GAP[1]);
    }

    update(dt) {
      const g = this.game;
      if (g.state !== 'playing' && g.state !== 'dialog') return;
      this._tidy(dt);
      const ev = this.ev;
      if (ev) {
        this._step(ev, dt);
        return;
      }
      if (!this.enabled) return;
      this._next -= dt;
      if (this._next > 0) return;
      if (!this._quiet()) {
        this._next = 5;
        return;
      }
      const id = this._pick();
      if (!id || !this.start(id, false)) this._next = 6;
    }

    _step(ev, dt) {
      const g = this.game;
      ev.t += dt;
      try {
        ev.update(dt);
      } catch (e) {
        console.error('[random-events]', ev.id, e);
        this.end(true);
        return;
      }
      if (g.missions && g.missions.run) {
        this.end(false);
        return;
      }
      const p = g.player.pos;
      const d = Math.hypot(p.x - ev.ax, p.z - ev.az);
      this._farT = d > ev.farEnd ? this._farT + dt : 0;
      this._ignoreT = d > 70 && !ev.resolved ? this._ignoreT + dt : d <= 70 ? 0 : this._ignoreT;
      if (ev.ignoreT === 99) this._ignoreT = 99;
      if (ev.resolved) {
        ev.resT += dt;
        if (ev.resT >= ev.linger) return this.end(false);
      }
      if (this._farT > 3 || this._ignoreT > ev.ignoreAfter || ev.t > ev.timeout) this.end(false);
    }

    /** Leftovers of finished events go once they are out of sight and far away. */
    _tidy(dt) {
      this._litterT -= dt;
      if (this._litterT > 0 || !this.litter.length) return;
      this._litterT = 1;
      const g = this.game;
      const p = g.player.pos;
      for (let i = this.litter.length - 1; i >= 0; i--) {
        const o = this.litter[i];
        if (o.removed) {
          this.litter.splice(i, 1);
          continue;
        }
        const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
        const isCar = !!o.hx;
        if (isCar && o.driver === 'player') {
          this.litter.splice(i, 1);
          continue;
        }
        if (d > 160 && !g.isVisible(o.pos.x, o.pos.y + 1, o.pos.z, 4)) {
          if (isCar) g.vehicles.remove(o);
          else g.crowd.remove(o);
          this.litter.splice(i, 1);
        }
      }
    }

    // ---------------------------------------------------------- contract
    blips(out, missionRunning) {
      if (missionRunning || !this.ev) return;
      this.ev.blips(out);
    }

    stop() {
      this.end(true);
    }

    reset() {
      this.end(true);
      for (const o of this.litter) {
        if (o.removed) continue;
        if (o.hx) this.game.vehicles.remove(o);
        else this.game.crowd.remove(o);
      }
      this.litter.length = 0;
      this._next = rnd(40, 80);
    }
  }

  RandomEvents.EVENTS = EVENTS;
  VH.RandomEvents = RandomEvents;
})();
