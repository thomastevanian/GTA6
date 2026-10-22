/*
 * combat.js — weapons, shooting and fighting.
 *
 *   Jay        an inventory of weapons (data/weapons: the weapons-data file),
 *              the model in his hand, aim (right mouse) and fire (left
 *              mouse), reload (R), the weapon wheel (hold Tab: time slows),
 *              1–8 for slots, drive-bys from the car window with a pistol
 *              or SMG, melee with fists, bat or knife, thrown grenades and
 *              molotovs
 *   bullets    hitscan from the camera through the crosshair, with spread
 *              that blooms while moving and firing; people (headshots),
 *              cars and the city all react
 *   NPCs       npcFire() for police and gangs: accuracy falls off with range
 *              and target speed; misses fly past with a whizz
 *   brains     CombatBrain: enemies who notice you, keep their distance,
 *              find cover, peek, strafe and shoot. Missions set them up
 *   pickups    weapons, ammo, health and armour lying around (and dropped by
 *              enemies)
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep, dampAngle } = VH.math;

  function weaponList() {
    return (VH.Data && VH.Data.weapons) || [];
  }

  function def(id) {
    const list = weaponList();
    for (const w of list) if (w.id === id) return w;
    return null;
  }

  const SLOT_ORDER = ['unarmed', 'melee', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'thrown'];

  // --------------------------------------------------------- projectile
  class Thrown {
    constructor(combat, weapon, x, y, z, vx, vy, vz, owner, cook) {
      this.combat = combat;
      this.w = weapon;
      this.pos = new THREE.Vector3(x, y, z);
      this.vel = new THREE.Vector3(vx, vy, vz);
      this.t = cook || 0; // a cooked grenade has already burnt part of its fuse
      this._trail = 0;
      this.owner = owner;
      this.mesh = VH.WeaponModels ? VH.WeaponModels.build(weapon.id) : new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshStandardMaterial({ color: 0x334422 }));
      this.mesh.position.copy(this.pos);
      if (this.mesh.userData && this.mesh.userData.flame) this.mesh.userData.flame.visible = true; // the molotov's rag burns
      combat.game.scene.add(this.mesh);
      this.done = false;
    }

    update(dt) {
      const ph = this.combat.game.physics;
      this.t += dt;
      this.vel.y -= 14 * dt;
      const next = this.pos.clone().addScaledVector(this.vel, dt);
      // Bounce off walls and the ground.
      const d = next.clone().sub(this.pos);
      const len = d.length();
      if (len > 1e-5) {
        const hit = ph.raycast(this.pos.x, this.pos.y, this.pos.z, d.x / len, d.y / len, d.z / len, len + 0.05, { flags: VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS, ground: true });
        if (hit) {
          if (this.w.id === 'molotov') {
            this._burst(hit.x, hit.y, hit.z);
            return;
          }
          const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
          this.vel.reflect(n).multiplyScalar(0.42);
          next.set(hit.x + n.x * 0.05, hit.y + n.y * 0.05, hit.z + n.z * 0.05);
          const a = this.combat.game.audio;
          if (a.grenadeBounce && this.vel.length() > 1.5) a.grenadeBounce(this.combat.pan(hit.x, hit.z), this.combat.gain(hit.x, hit.z, 10));
        }
      }
      // Hitting a car also stops a molotov.
      if (this.w.id === 'molotov') {
        for (const v of this.combat.game.vehicles.list) {
          if (Math.hypot(v.pos.x - next.x, v.pos.z - next.z) < v.hx + 0.3 && next.y < v.pos.y + v.height) {
            this._burst(next.x, next.y, next.z);
            return;
          }
        }
      }
      this.pos.copy(next);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.x += dt * 9;
      this.mesh.rotation.z += dt * 5;
      if (this.w.id === 'molotov') {
        this._trail -= dt;
        if (this._trail <= 0) {
          this._trail = 0.05;
          this.combat.game.fx.flame(this.pos.x, this.pos.y + 0.1, this.pos.z, 0.3);
        }
      }
      if (this.w.id !== 'molotov' && this.t > (this.w.fuse || 2.6)) this._explode();
      if (this.t > 8) this._remove();
    }

    _explode() {
      const g = this.combat.game;
      g.vehicleFeedback.explosion(this.pos.x, this.pos.y, this.pos.z, (this.w.blastRadius || 7) / 8, this.owner === 'player' ? 'player' : this.owner);
      this.combat.blastDamage(this.pos.x, this.pos.y, this.pos.z, this.w.blastRadius || 7, this.w.damage || 180, this.owner);
      this._remove();
    }

    _burst(x, y, z) {
      const g = this.combat.game;
      g.fx.fireAt(x, y + 0.1, z, this.w.fireDuration || 8, 1.2);
      for (let i = 0; i < 5; i++) g.fx.fireAt(x + (Math.random() - 0.5) * 3, y + 0.1, z + (Math.random() - 0.5) * 3, (this.w.fireDuration || 8) * (0.6 + Math.random() * 0.4), 0.8);
      g.fx.glass(x, y + 0.2, z, 10);
      if (g.audio.molotovBurst) g.audio.molotovBurst(this.combat.pan(x, z), this.combat.gain(x, z, 12));
      this.combat.fires.push({ x, z, r: 3.2, t: this.w.fireDuration || 8, owner: this.owner });
      VH.events.emit('gunshot', { x, z, byPlayer: this.owner === 'player', loud: true });
      this._remove();
    }

    _remove() {
      this.done = true;
      this.combat.game.scene.remove(this.mesh);
    }
  }

  // ------------------------------------------------------------- pickups
  class Pickup {
    constructor(combat, kind, id, amount, x, y, z, respawn) {
      this.combat = combat;
      this.kind = kind; // 'weapon' | 'ammo' | 'health' | 'armor' | 'cash'
      this.id = id;
      this.amount = amount;
      this.pos = new THREE.Vector3(x, y, z);
      this.respawn = respawn || 0;
      this.hiddenT = 0;
      this.t = Math.random() * 6;
      const g = new THREE.Group();
      let model = null;
      if (kind === 'weapon' && VH.WeaponModels) model = (VH.WeaponModels.pickup || VH.WeaponModels.build)(id);
      if (!model) {
        const color = kind === 'health' ? new THREE.Color(0.3, 2.2, 0.7) : kind === 'armor' ? new THREE.Color(0.4, 1.0, 3) : kind === 'cash' ? new THREE.Color(0.4, 2.4, 0.8) : new THREE.Color(2.5, 1.7, 0.4);
        model = new THREE.Mesh(kind === 'armor' ? new THREE.BoxGeometry(0.34, 0.42, 0.12) : kind === 'health' ? new THREE.BoxGeometry(0.36, 0.26, 0.2) : new THREE.BoxGeometry(0.3, 0.2, 0.2),
          new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, roughness: 0.4 }));
      }
      g.add(model);
      const ringMat = Pickup._ring || (Pickup._ring = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.1, 0.3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      const ring = new THREE.Mesh(Pickup._ringGeo || (Pickup._ringGeo = new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2)), ringMat);
      ring.position.y = -0.55;
      g.add(ring);
      g.position.copy(this.pos);
      this.group = g;
      this.model = model;
      combat.game.scene.add(g);
    }

    update(dt, player) {
      if (this.hiddenT > 0) {
        this.hiddenT -= dt;
        if (this.hiddenT <= 0) this.group.visible = true;
        return;
      }
      this.t += dt;
      this.model.rotation.y += dt * 1.6;
      this.model.position.y = 0.1 + Math.sin(this.t * 2.2) * 0.08;
      if (player.inVehicle || player.state === 'dead') return;
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (d < 1.1 && Math.abs(player.pos.y + 0.7 - this.pos.y) < 1.6) {
        if (this.combat.collect(this)) {
          if (this.respawn) {
            this.hiddenT = this.respawn;
            this.group.visible = false;
          } else this.dispose();
        }
      }
    }

    dispose() {
      this.gone = true;
      this.combat.game.scene.remove(this.group);
    }
  }

  // ---------------------------------------------------------- AI brain
  /**
   * An armed enemy. opts: { faction, weapon, alert (bool), guard: {x, z, r},
   * accuracy (0..1), aggression (0..1), target: 'player' | agent }
   */
  class CombatBrain {
    constructor(combat, opts) {
      opts = opts || {};
      this.combat = combat;
      this.weapon = opts.weapon || 'pistol';
      this.alert = !!opts.alert;
      this.guard = opts.guard || null;
      this.accuracy = opts.accuracy === undefined ? 0.5 : opts.accuracy;
      this.aggression = opts.aggression === undefined ? 0.5 : opts.aggression;
      this.state = this.alert ? 'fight' : 'idle';
      this._fireT = 0.6 + Math.random();
      this._burst = 0;
      this._think = Math.random() * 0.3;
      this._cover = null;
      this._peek = 0;
      this._strafe = Math.random() < 0.5 ? 1 : -1;
      this._strafeT = 0;
      this._mag = 0;
      this._reloadT = 0;
      this.onAlert = opts.onAlert || null;
      this.hostile = opts.hostile !== false;
      this.persistentMission = true;
    }

    expired(a) {
      return a.dead && a.deadTime > 40;
    }

    _target() {
      const p = this.combat.game.player;
      return p.inVehicle ? p.vehicle : p;
    }

    update(a, dt) {
      if (a.dead) return;
      const c = this.combat;
      const game = c.game;
      const t = this._target();
      const dx = t.pos.x - a.pos.x;
      const dz = t.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const w = def(this.weapon) || def('pistol') || { range: 40, fireRate: 3, magSize: 12, reloadTime: 1.5, kind: 'hitscan' };
      if (this.state === 'idle') {
        a.moveSpeed = 0;
        a.anim.aim = 0;
        a.anim.talk = this.chatting ? 1 : 0;
        // Notice Jay: close, in view, or after gunfire / being hurt.
        if ((d < 16 || (d < 32 && c.game.police.canSee(a.pos.x, a.pos.y + 1.6, a.pos.z))) && this.hostile) this.setAlert(a);
        if (game.time - a.hitTime < 0.5) this.setAlert(a);
        return;
      }
      a.anim.talk = 0;
      a.anim.weaponPose = w.slot === 'pistol' ? 'pistol' : w.kind === 'melee' ? null : 'rifle';
      const face = Math.atan2(dx, dz);
      this._think -= dt;
      if (this._think <= 0) {
        this._think = 0.4 + Math.random() * 0.4;
        this._los = c.game.police.canSee(a.pos.x, a.pos.y + 1.5, a.pos.z);
        this._chooseMove(a, d, w);
      }
      // Melee fighters just close in.
      if (w.kind === 'melee') {
        a.heading = dampAngle(a.heading, face, 8, dt);
        a.moveSpeed = d > 1.4 ? 4.8 : 0;
        a.anim.sprint = d > 4;
        a.anim.aim = 0;
        this._fireT -= dt;
        if (d < 1.6 && this._fireT <= 0) {
          this._fireT = 0.9 + Math.random() * 0.5;
          c.npcMelee(a, t, w);
        }
        return;
      }
      // Move toward the chosen spot (cover, or a firing position).
      let moving = false;
      if (this._goal) {
        const gx = this._goal.x - a.pos.x;
        const gz = this._goal.z - a.pos.z;
        const gd = Math.hypot(gx, gz);
        if (gd > 0.5) {
          moving = true;
          a.heading = dampAngle(a.heading, Math.atan2(gx, gz), 9, dt);
          a.moveSpeed = gd > 4 ? 4.6 : 2.4;
          a.anim.sprint = gd > 4;
        } else {
          a.moveSpeed = 0;
          this._goal = null;
        }
      } else a.moveSpeed = 0;
      // In cover: crouch, pop up to shoot.
      const inCover = this._cover && !moving && Math.hypot(this._cover.x - a.pos.x, this._cover.z - a.pos.z) < 0.8;
      this._peek -= dt;
      if (inCover && this._peek < -2.2) this._peek = 1.4 + Math.random() * 1.2;
      const exposed = !inCover || this._peek > 0;
      a.anim.crouch = inCover && !exposed ? 0.9 : 0;
      if (!moving) a.heading = dampAngle(a.heading, face, 10, dt);
      a.anim.aim = moving && d > 10 ? 0.3 : 1;
      // Reloading.
      if (this._reloadT > 0) {
        this._reloadT -= dt;
        a.anim.aim = 0.2;
        if (this._reloadT <= 0) this._mag = w.magSize || 12;
        return;
      }
      if (this._mag <= 0 && !this._reloadInit) {
        this._reloadInit = true;
        this._mag = w.magSize || 12;
      }
      this._fireT -= dt;
      if (this._fireT <= 0 && exposed && this._los && d < (w.range || 40) * 1.1 && Math.abs(VH.math.angleDelta(a.heading, face)) < 0.5) {
        const auto = w.auto;
        if (auto) {
          if (this._burst <= 0) this._burst = 3 + Math.floor(Math.random() * 4);
          this._burst--;
          this._fireT = this._burst > 0 ? 1 / (w.fireRate || 8) : 0.7 + Math.random() * 0.9;
        } else this._fireT = Math.max(1 / (w.fireRate || 2), 0.45) + Math.random() * 0.7;
        c.npcFire(a, t, this.weapon, this.accuracy);
        this._mag--;
        if (this._mag <= 0) {
          this._reloadT = w.reloadTime || 1.8;
          this._goal = this._cover ? { x: this._cover.x, z: this._cover.z } : null;
        }
      }
    }

    setAlert(a) {
      if (this.state === 'fight') return;
      this.state = 'fight';
      this._mag = (def(this.weapon) || {}).magSize || 12;
      if (this.onAlert) this.onAlert(a);
      VH.events.emit('combat:alert', { agent: a });
    }

    /** Pick where to be: cover near a good range, or a flank. */
    _chooseMove(a, d, w) {
      const c = this.combat;
      const t = this._target();
      const want = w.slot === 'shotgun' ? 7 : w.slot === 'sniper' ? 40 : w.slot === 'smg' ? 12 : 16;
      if (this._goal && Math.random() < 0.7) return;
      if (this.guard && Math.hypot(a.pos.x - this.guard.x, a.pos.z - this.guard.z) > this.guard.r) {
        this._goal = { x: this.guard.x, z: this.guard.z };
        return;
      }
      // Look for cover: a spot near us where a wall blocks the line to Jay.
      const ph = c.game.physics;
      let best = null;
      let bestScore = Infinity;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
        const r = 2 + Math.random() * 6;
        const x = a.pos.x + Math.cos(ang) * r;
        const z = a.pos.z + Math.sin(ang) * r;
        if (ph.overlaps(x, z, 0.35, a.pos.y + 0.2, a.pos.y + 1.6)) continue;
        const g = ph.groundHeight(x, z, a.pos.y + 0.5);
        if (Math.abs(g - a.pos.y) > 0.6) continue;
        const dd = Math.hypot(t.pos.x - x, t.pos.z - z);
        const dx = t.pos.x - x;
        const dz = t.pos.z - z;
        const hit = ph.raycast(x, g + 0.8, z, dx / dd, 0, dz / dd, Math.min(dd, 4), { flags: VH.COLLIDE.SHOTS | VH.COLLIDE.SOLID, ground: false });
        const covered = hit && hit.t < 1.6;
        const score = Math.abs(dd - want) * 0.3 + (covered ? 0 : 6) + r * 0.2 + (dd < 4 ? 8 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { x, z, covered };
        }
      }
      if (best) {
        this._goal = best;
        this._cover = best.covered ? best : null;
      }
    }
  }

  // ------------------------------------------------------------ combat
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _v4 = new THREE.Vector3();

  // Per-weapon feel that the data file doesn't carry: kick of the gun model in the hand,
  // how long a draw takes, and which pose the arms take while reloading (1 pistol, 2 long
  // gun, 3 shell by shell, 4 bolt).
  const FEEL = {
    pistol: { kick: 1, draw: 0.32, reload: 1 },
    revolver: { kick: 1.8, draw: 0.38, reload: 1 },
    smg: { kick: 0.8, draw: 0.34, reload: 2 },
    shotgun: { kick: 2.2, draw: 0.5, reload: 3 },
    rifle: { kick: 1.1, draw: 0.46, reload: 2 },
    sniper: { kick: 2.4, draw: 0.55, reload: 4 },
  };
  const FEEL_DEFAULT = { kick: 1, draw: 0.3, reload: 1 };

  // Melee swings: seconds the arm animation takes and the share of it before contact.
  const SWING = {
    fists: { dur: 0.3, hit: 0.4 },
    bat: { dur: 0.56, hit: 0.46 },
    knife: { dur: 0.34, hit: 0.42 },
  };

  class Combat {
    constructor(game) {
      this.game = game;
      this.inventory = {}; // id → { ammo (reserve), mag }
      this.current = 'fists';
      this.lastBySlot = {};
      this.thrown = [];
      this.pickups = [];
      this.fires = []; // burning ground: { x, z, r, t }
      this._cool = 0;
      this._bloom = 0;
      this._kick = 0;
      this._recoil = 0;
      // Reloading.
      this._reloadT = 0;
      this._reloadDur = 1;
      this._reloadFor = null;
      this._reloadSnd = null;
      this._reloadProg = 0;
      this._shellsDone = 0;
      this._shellsLeft = 0;
      this._autoReload = 0;
      this._pumpEject = 0;
      // Melee combos.
      this._meleeT = 0;
      this._combo = 0;
      this._comboT = 0;
      this._bufT = 0;
      this._hitPending = null; // { t, w, idx } resolved in update() so slow-motion and hit-stop apply
      this._staggers = [];
      // Throwing.
      this._thr = { state: 0, cook: 0, rel: 0 };
      // Aim.
      this._probeT = 0;
      this.targetKind = 0; // 0 nothing, 1 civilian / neutral, 2 hostile
      this.targetDist = 0;
      this._asAgent = null;
      this._asYaw = 0;
      this._asPitch = 0;
      this._scopeK = 0;
      this._breath = 1;
      this._breathHeld = false;
      this._swayX = 0;
      this._swayY = 0;
      this._swayT = Math.random() * 20;
      this._xh = { gap: -1, enemy: false, hide: false, bloom: 0 };
      this.playerArmed = false;
      this.hitMarkerT = 0;
      this.hitKind = 'hit';
      this._tmp = new THREE.Vector3();
      this._dir = new THREE.Vector3();
      this._up = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._low = lowFx(game);
      this._fxReady = false;
      this.giveWeapon('fists', 0);
      this._attachModel();
      this.wheel = VH.WeaponWheel ? new VH.WeaponWheel(game.hud.root) : null;
      this._bindEvents();
    }

    // ------------------------------------------------------- fx objects
    /** Pools and overlays are created the first time they are needed (the scene and physics exist by then). */
    _ensureFx() {
      if (this._fxReady) return true;
      const g = this.game;
      const FX = VH.CombatFX;
      if (!FX || !g.physics || !g.scene) return false;
      this._fxReady = true;
      const low = this._low;
      const metal = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
      const land = (hull) => (it) => {
        const a = g.audio;
        if (!a || !a.casingDrop) return;
        const gain = this.gain(it.x, it.z, 7);
        if (gain > 0.02) a.casingDrop(this.pan(it.x, it.z), gain, hull);
      };
      this.brass = new FX.DebrisPool(g.scene, g.physics, new THREE.CylinderGeometry(0.0048, 0.0048, 0.03, 6), metal(0xd8a640, 0.35, 0.9), low ? 10 : 28, { radius: 0.005, life: low ? 4 : 9, onLand: land(false) });
      this.hulls = new FX.DebrisPool(g.scene, g.physics, new THREE.CylinderGeometry(0.0095, 0.0095, 0.062, 8), metal(0xc23a2a, 0.6, 0.05), low ? 4 : 10, { radius: 0.01, life: low ? 4 : 10, onLand: land(true) });
      this.mags = new FX.DebrisPool(g.scene, g.physics, new THREE.BoxGeometry(0.03, 0.1, 0.055), metal(0x2c3036, 0.5, 0.6), low ? 2 : 5, { radius: 0.018, restX: 0, restZ: Math.PI / 2, life: low ? 5 : 12, onLand: land(true) });
      this.holes = new FX.DecalPool(g.scene, low ? 16 : 56);
      this.arc = new FX.ArcPreview(g.scene);
      this.scope = new FX.Scope(g.hud.root);
      // The fresh magazine Jay's off hand brings to the gun.
      const mp = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.058), metal(0x2c3036, 0.5, 0.6));
      mp.visible = false;
      mp.position.set(0, -0.3, 0.05);
      mp.name = 'reload-magazine';
      const hand = g.player.model && g.player.model.joints && g.player.model.joints.elbowL;
      if (hand) hand.add(mp);
      this._magProp = mp;
      return true;
    }

    _bindEvents() {
      VH.events.on('agent:died', (e) => {
        const a = e.agent;
        // Enemies drop what they carried.
        if (a.faction !== 'civilian' && a.weapon && a.weapon !== 'fists' && Math.random() < 0.8 && !a.noDrop) {
          const w = def(a.weapon);
          if (w && w.kind !== 'melee') this.addPickup('ammo', a.weapon, w.pickupAmmo || Math.max(4, Math.round((w.magSize || 10) * 0.8)), a.pos.x, a.pos.y + 0.6, a.pos.z, 0, true);
        }
        if (a.faction !== 'civilian' && e.source === 'player' && Math.random() < 0.35) this.addPickup('cash', null, 20 + Math.floor(Math.random() * 60), a.pos.x + 0.5, a.pos.y + 0.6, a.pos.z, 0, true);
      });
      // A wheel left open when the window loses focus must not strand the game in slow motion.
      window.addEventListener('blur', () => this.closeWheel(true));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.closeWheel(true);
      });
      VH.events.on('settings:changed', () => {
        this._low = lowFx(this.game);
      });
    }

    // ------------------------------------------------------- inventory
    giveWeapon(id, ammo, silent) {
      const w = def(id);
      if (!w && id !== 'fists') return false;
      const inv = this.inventory[id];
      if (inv) {
        // Handed the same gun again (a mission reward): top the reserve up by its starting ammo.
        const extra = ammo === undefined ? (w && w.pickupAmmo) || 0 : ammo;
        inv.ammo = Math.min((w && w.maxAmmo) || 9999, inv.ammo + extra);
      } else {
        const start = ammo === undefined ? (w && w.startAmmo) || 0 : ammo;
        const mag = w && w.magSize ? Math.min(w.magSize, start) : 0;
        this.inventory[id] = { ammo: Math.max(0, start - mag), mag };
        if (!silent && w) this.game.hud.notify({ title: w.name, text: 'Added to your weapon wheel (hold ' + this.game.input.labelFor('weaponWheel') + ').', icon: '✦' });
      }
      if (!silent && this.game.audio.pickup) this.game.audio.pickup();
      return true;
    }

    has(id) {
      return !!this.inventory[id];
    }

    /** Equip a weapon: the old one is lowered, the new one drawn (with a sound), reloads and swings are cancelled. */
    select(id) {
      if (!this.inventory[id]) return;
      if (this.current === id) return;
      this._cancelActions();
      this.current = id;
      const w = def(id);
      if (w) this.lastBySlot[w.slot] = id;
      this._attachModel();
      const p = this.game.player;
      const feel = (w && FEEL[w.id]) || FEEL_DEFAULT;
      p._draw = w && w.slot !== 'unarmed' ? 1 : 0.5;
      p._drawRate = 1 / feel.draw;
      this._cool = Math.max(this._cool, feel.draw * 0.8);
      this._meleeT = Math.max(this._meleeT, 0.2);
      if (this.game.audio.weaponSwitch) this.game.audio.weaponSwitch(id);
      VH.events.emit('weapon:changed', { id });
    }

    /** Stop a reload, a swing, a cooked grenade (it is dropped live at Jay's feet). */
    _cancelActions() {
      const p = this.game.player;
      if (this._reloadT > 0) {
        this._reloadT = 0;
        if (this._reloadSnd && this._reloadSnd.stop) this._reloadSnd.stop();
        this._reloadSnd = null;
      }
      this._reloadProg = 0;
      p._reload = 0;
      if (this._magProp) this._magProp.visible = false;
      this._hitPending = null;
      this._combo = 0;
      this._bufT = 0;
      this._autoReload = 0;
      this._pumpEject = 0;
      const t = this._thr;
      if (t.state) {
        const w = this.weapon;
        if (w.kind === 'thrown' && w.id === 'grenade' && t.state === 1) this._launch(w, 0, t.cook);
        t.state = 0;
        t.cook = 0;
        p._throwWind = 0;
      }
      if (this.arc) this.arc.hide();
    }

    get weapon() {
      return def(this.current) || { id: 'fists', name: 'Fists', slot: 'unarmed', kind: 'melee', damage: 10, range: 1.4, fireRate: 2.2 };
    }

    _attachModel() {
      const p = this.game.player;
      const hand = p.model.joints.elbowR;
      if (this._model) {
        this._model.parent && this._model.parent.remove(this._model);
        this._model = null;
      }
      const w = this.weapon;
      this.playerArmed = w.kind !== 'melee' && w.slot !== 'unarmed';
      if (w.slot === 'unarmed' || !VH.WeaponModels) return;
      const m = VH.WeaponModels.build(w.id);
      if (!m) return;
      // The hand sits at the end of the forearm (y ≈ -0.3), fingers toward +Z.
      // Barrel (+Z) along the forearm (-Y of the hand), top of the gun facing forward.
      m.position.set(0, -0.31, 0.03);
      m.rotation.set(Math.PI / 2, 0, 0);
      m.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      hand.add(m);
      this._model = m;
      this._flash = VH.WeaponModels.muzzleFlash ? VH.WeaponModels.muzzleFlash() : null;
      if (this._flash) {
        this._flash.visible = false;
        this._flash.position.copy(m.userData.muzzle || new THREE.Vector3(0, 0.05, 0.25));
        m.add(this._flash);
      }
    }

    /** Wheel state for the UI. */
    wheelState() {
      const slots = [];
      for (const slot of SLOT_ORDER) {
        const weapons = weaponList().filter((w) => w.slot === slot).map((w) => {
          const inv = this.inventory[w.id];
          return { id: w.id, name: w.name, ammo: inv ? inv.ammo : 0, mag: inv ? inv.mag : 0, owned: !!inv };
        });
        if (slot === 'unarmed' && !weapons.length) weapons.push({ id: 'fists', name: 'Fists', ammo: 0, mag: 0, owned: true });
        const owned = weapons.filter((w) => w.owned);
        const shown = owned.length ? owned : weapons;
        const want = this.weapon.slot === slot ? this.current : this.lastBySlot[slot];
        const cur = Math.max(0, shown.findIndex((w) => w.id === want));
        slots.push({ slot, weapons: shown, current: cur });
      }
      return { slots, selected: this.weapon.slot };
    }

    addPickup(kind, id, amount, x, y, z, respawn, dropped) {
      const p = new Pickup(this, kind, id, amount, x, y, z, respawn);
      if (dropped) p.expires = 30;
      this.pickups.push(p);
      return p;
    }

    collect(p) {
      const g = this.game;
      const pl = g.player;
      if (p.kind === 'health') {
        if (pl.health >= pl.maxHealth) return false;
        pl.heal(p.amount || 50);
      } else if (p.kind === 'armor') {
        if (pl.armor >= pl.maxArmor) return false;
        pl.armor = Math.min(pl.maxArmor, pl.armor + (p.amount || 50));
      } else if (p.kind === 'cash') {
        g.giveMoney(p.amount || 50, 'pickup');
        if (g.audio.cash) g.audio.cash();
        return true;
      } else if (p.kind === 'weapon') {
        this.giveWeapon(p.id, p.amount);
      } else if (p.kind === 'ammo') {
        if (!this.inventory[p.id]) return false;
        this.giveWeapon(p.id, p.amount, true);
        g.hud.showToast('+' + p.amount + ' ' + ((def(p.id) || {}).name || 'ammo'));
      }
      if (g.audio.pickup) g.audio.pickup();
      return true;
    }

    // ------------------------------------------------------------ helpers
    pan(x, z) {
      return this.game.vehicleFeedback._pan(x, z);
    }

    gain(x, z, ref) {
      return this.game.vehicleFeedback._gain(x, z, ref);
    }

    _surface(col) {
      if (!col) return 'concrete';
      const t = col.tag;
      if (t === 'prop' || t === 'container' || t === 'metal' || t === 'beam' || t === 'sign') return 'metal';
      if (t === 'crate' || t === 'boardwalk' || t === 'pier' || t === 'plank' || t === 'scaffold') return 'wood';
      return 'concrete';
    }

    /**
     * A bullet hit the city (or a car): dust, sparks, splinters or a splash, a bullet hole on solid
     * surfaces, and the sound. `loud` = the shot was Jay's (always heard), else it's culled by distance.
     */
    impactAt(x, y, z, nx, ny, nz, surf, quiet) {
      const g = this.game;
      const fx = g.fx;
      if (surf === 'concrete' && y < -0.6 && ny > 0.5) surf = 'water';
      if (VH.CombatFX) VH.CombatFX.impact(fx, x, y, z, nx, ny, nz, surf, this._low);
      if (this._ensureFx() && (surf === 'concrete' || surf === 'wood' || surf === 'metal')) this.holes.add(x, y, z, nx, ny, nz, surf === 'metal' ? 0.07 : 0.1 + Math.random() * 0.04);
      if (g.audio.bulletImpact && !quiet) {
        g.audio.bulletImpact(surf, this.pan(x, z), this.gain(x, z, 10));
        if (surf === 'metal' && g.audio.ricochet && Math.random() < 0.3) g.audio.ricochet(this.pan(x, z), this.gain(x, z, 9) * 0.7);
      }
    }

    /** Spit a casing (brass, or a red shotgun hull) from (x, y, z) to the side given by (rx, ry, rz). */
    _eject(hull, x, y, z, rx, ry, rz, vx, vz) {
      if (!this._ensureFx()) return;
      const pool = hull ? this.hulls : this.brass;
      const s = 1.5 + Math.random() * 1.3;
      pool.spawn(x, y, z, rx * s + (vx || 0) * 0.5 + (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.4 + ry * s, rz * s + (vz || 0) * 0.5 + (Math.random() - 0.5) * 0.4);
    }

    /** Eject brass from the player's gun (the ejection port is on the model's -X side). */
    _ejectFromGun(w) {
      const m = this._model;
      if (!m || m.visible === false) return;
      m.updateMatrixWorld(true);
      const e = m.matrixWorld.elements;
      const p = this.game.player;
      const port = m.userData.muzzle ? _v1.set(-0.02, m.userData.muzzle.y, Math.max(0.02, m.userData.muzzle.z * 0.35)) : _v1.set(-0.02, 0.04, 0.05);
      m.localToWorld(port);
      this._eject(w.slot === 'shotgun', port.x, port.y, port.z, -e[0] * 0.9, -e[1] * 0.9 + 0.1, -e[2] * 0.9, p.vel.x, p.vel.z);
    }

    /** Area damage (grenades, explosions) to people and Jay. */
    blastDamage(x, y, z, radius, damage, owner) {
      const p = this.game.player;
      if (!p.inVehicle) {
        const d = Math.hypot(p.pos.x - x, p.pos.y + 0.9 - y, p.pos.z - z);
        if (d < radius) {
          const k = 1 - d / radius;
          p.vel.x += ((p.pos.x - x) / (d || 1)) * 8 * k;
          p.vel.z += ((p.pos.z - z) / (d || 1)) * 8 * k;
          p.vel.y = 4 * k;
          p.knock(damage * k * 0.7, 'blast');
        }
      }
      void owner;
    }

    // ------------------------------------------------------------ wheel
    get wheelOpen() {
      return !!(this.wheel && this.wheel.isOpen);
    }

    /** Close the weapon wheel; `cancel` leaves the current weapon alone, otherwise the highlighted one is equipped. */
    closeWheel(cancel) {
      if (!this.wheel || !this.wheel.isOpen) return;
      const g = this.game;
      const pick = this.wheel.close();
      g.input.wheelOpen = false;
      if (this._wheelSlow) {
        g._slowT = 0; // time speeds back up on its own
        this._wheelSlow = false;
      }
      if (!cancel && pick && pick.weaponId) this.select(pick.weaponId);
    }

    _updateWheel() {
      const g = this.game;
      const inp = g.input;
      const p = g.player;
      if (!this.wheel) return;
      const holding = inp.down('weaponWheel') && g.state === 'playing' && p.state !== 'dead';
      if (!holding) this._wheelLatch = false; // a click-equip keeps it shut until Tab is let go
      if (holding && !this.wheel.isOpen && !this._wheelLatch) {
        this._cancelActions(); // a cooked grenade can't wait while you browse
        this.wheel.open(this.wheelState());
        inp.wheelOpen = true; // input.js: follow the mouse even when it isn't captured
        for (const a of ['moveLeft', 'moveRight', 'moveForward', 'moveBack', 'fire', 'weapon1', 'weapon2', 'weapon3', 'weapon4', 'weapon5', 'weapon6', 'weapon7', 'weapon8']) inp.discard(a);
        inp.takeMouseDelta();
        inp.takeWheel();
        // Slow motion for the wheel, whatever the cinematic slow-mo setting says: it is a gameplay feature.
        g._slowT = 9999;
        g.timeScale = Math.min(g.timeScale, 0.25);
        this._wheelSlow = true;
      } else if (this.wheel.isOpen) {
        // A click on the wheel equips the highlighted weapon at once.
        const clicked = holding && inp.consume('fire');
        if (holding && !clicked) {
          // The camera ignores the mouse while the wheel is open; the wheel gets it.
          const md = inp.takeMouseDelta();
          if (md.x || md.y) this.wheel.move(md.x, md.y);
          const wheelNotches = inp.takeWheel();
          if (wheelNotches) this.wheel.cycle(Math.sign(wheelNotches));
          const pad = inp.pad;
          if (pad && pad.connected && (Math.abs(pad.look.x) > 0.3 || Math.abs(pad.look.y) > 0.3)) this.wheel.stick(pad.look.x, pad.look.y);
          // Keys: A/D (or the arrows) step round the wheel, W/S pick a weapon within the slot, 1-8 jump to a slot.
          if (inp.consume('moveLeft')) this.wheel.step(-1);
          if (inp.consume('moveRight')) this.wheel.step(1);
          if (inp.consume('moveForward')) this.wheel.cycle(1);
          if (inp.consume('moveBack')) this.wheel.cycle(-1);
          for (let i = 1; i <= 8; i++) if (inp.consume('weapon' + i)) this.wheel.pick(i - 1);
        } else {
          if (clicked) {
            inp.discard('fire'); // that click was for the wheel, not a shot
            this._wheelLatch = true;
          }
          this.closeWheel(false);
        }
      }
      if (!this.wheel.isOpen) inp.wheelOpen = false; // closed some other way (pause, death)
    }

    /**
     * Called every frame whatever the game state (through the `reloading` getter, which the HUD reads):
     * a wheel left open by a pause or a dialogue closes, and Jay's gun only shows while he can use it.
     */
    _syncState() {
      const g = this.game;
      if (this.wheel && this.wheel.isOpen && (g.state !== 'playing' || g.player.state === 'dead')) this.closeWheel(true);
      if (this._model) {
        const p = g.player;
        const live = g.state === 'playing';
        this._model.visible = live ? !p.inVehicle || p.aiming : false;
        if (!live) p.weaponPose = null;
      }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
      const g = this.game;
      const inp = g.input;
      const p = g.player;
      this._cool -= dt;
      this._bloom = Math.max(0, this._bloom - dt * 2.2);
      // The recoil kick comes back down, so the crosshair returns to what
      // you were aiming at (the shots go wherever it points).
      if (this._kick > 0) {
        const back = Math.min(this._kick, dt * (0.12 + this._kick * 9));
        g.cameraRig.pitch -= back;
        this._kick -= back;
      }
      if (this.hitMarkerT > 0) this.hitMarkerT -= dt;

      this._updateWheel();
      for (let i = 1; i <= 8; i++) {
        if (inp.consume('weapon' + i)) {
          const slot = SLOT_ORDER[i - 1];
          const owned = weaponList().filter((w) => w.slot === slot && this.inventory[w.id]);
          if (slot === 'unarmed') this.select('fists');
          else if (owned.length) {
            const curIdx = owned.findIndex((w) => w.id === this.current);
            this.select(owned[(curIdx + 1) % owned.length].id);
          }
        }
      }

      // Thrown things, fires, pickups.
      for (const t of this.thrown) t.update(dt);
      this.thrown = this.thrown.filter((t) => !t.done);
      this._updateFires(dt);
      for (const pk of this.pickups) {
        pk.update(dt, p);
        if (pk.expires !== undefined) {
          pk.expires -= dt;
          if (pk.expires <= 0) pk.dispose();
        }
      }
      this.pickups = this.pickups.filter((pk) => !pk.gone);
      if (this._fxReady) {
        this.brass.update(dt);
        this.hulls.update(dt);
        this.mags.update(dt);
      }
      this._updateStaggers(dt);

      if (this._flash && this._flash.userData.update) this._flash.userData.update(dt);
      if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 8);
      if (this._pumpEject > 0) {
        this._pumpEject -= dt;
        if (this._pumpEject <= 0) this._ejectFromGun(this.weapon);
      }

      const blocked = g.state !== 'playing' || p.state === 'dead' || p.state === 'knocked' || p.frozen || (this.wheel && this.wheel.isOpen);
      this._updateReload(dt, blocked);
      this._poseModel();
      if (blocked) {
        inp.discard('fire');
        this._showScope(false);
        this._setReticle(false, 0);
        if (this.arc) this.arc.hide();
        return;
      }
      const w = this.weapon;
      // Weapon in hand is hidden while driving; the pose follows the weapon.
      if (this._model) this._model.visible = !p.inVehicle || p.aiming;
      p.weaponPose = w.kind === 'thrown' || w.slot === 'unarmed' ? null : w.id === 'bat' ? 'bat' : w.kind === 'melee' ? 'knife' : w.slot === 'pistol' ? 'pistol' : 'rifle';
      if (inp.consume('reload') && !p.inVehicle) this.reload();
      if (this._autoReload > 0) {
        this._autoReload -= dt;
        if (this._autoReload <= 0 && !p.inVehicle) this.reload();
      }
      const firing = inp.down('fire');
      const pressed = inp.consume('fire');
      if (p.inVehicle) {
        const v = p.vehicle;
        this._showScope(false);
        this._setReticle(false, 0);
        // A tank's cannon, a jet's guns: the vehicle has its own weapons.
        if (v.fireWeapon) {
          p.aiming = false;
          v.fireWeapon(this, inp, firing, pressed, dt);
          return;
        }
        // Drive-by: aim with the right mouse button, pistols and SMGs only.
        p.aiming = inp.down('aim') && w.drivebyAllowed;
        if (p.aiming && (pressed || (firing && w.auto)) && this._cool <= 0) this._fireHitscan(w, true);
        return;
      }
      this._updateAim(dt, w);
      if (w.kind === 'thrown') {
        this._updateThrow(w, firing, pressed, dt);
        return;
      }
      if (w.kind === 'melee' || w.slot === 'unarmed') {
        this._updateMelee(w, pressed, dt);
        return;
      }
      // A shotgun can interrupt its own reload to fire; other guns ignore the trigger.
      if ((pressed || (firing && w.auto)) && this._cool <= 0) this._fireHitscan(w, false);
    }

    // ----------------------------------------------------------- reload
    reload() {
      const w = this.weapon;
      const inv = this.inventory[w.id];
      if (!inv || !w.magSize || inv.mag >= w.magSize || inv.ammo <= 0 || this._reloadT > 0) return;
      if (w.kind === 'thrown' || w.kind === 'melee') return;
      if (this._thr.state) return;
      const feel = FEEL[w.id] || FEEL_DEFAULT;
      this._reloadFor = w.id;
      this._reloadStyle = feel.reload;
      this._shellsDone = 0;
      if (w.shellReload) {
        this._shellsLeft = Math.min(w.magSize - inv.mag, inv.ammo);
        this._reloadDur = 0.4 + this._shellsLeft * (w.shellTime || 0.42) + 0.5;
        this._reloadSnd = null;
      } else {
        this._reloadDur = w.reloadTime || 1.5;
        this._reloadSnd = this.game.audio.reload ? this.game.audio.reload(w.id) : null;
      }
      this._reloadT = this._reloadDur;
      this._reloadProg = 0;
      this._autoReload = 0;
      this._magDropped = false;
    }

    _updateReload(dt, blocked) {
      const p = this.game.player;
      if (this._reloadT <= 0) {
        if (p._reload) p._reload = 0;
        return;
      }
      if (blocked && this.game.state !== 'playing') return;
      this._reloadT -= dt;
      const dur = this._reloadDur;
      const el = Math.max(0, dur - this._reloadT);
      const w = def(this._reloadFor);
      const inv = w && this.inventory[w.id];
      if (!inv) {
        this._reloadT = 0;
        return;
      }
      this._reloadProg = clamp(el / dur, 0, 1);
      p._reload = this._reloadProg;
      p._reloadStyle = this._reloadStyle;
      const mp = this._magProp;
      if (w.shellReload) {
        // One shell at a time, the way the sound is built; then the pump.
        const st = w.shellTime || 0.42;
        const n = this._shellsLeft;
        const cyc = (el - 0.3) / st;
        p._reloadLoop = cyc > 0 && cyc < n + 0.2 ? cyc - Math.floor(cyc) : 0;
        while (this._shellsDone < n && el >= 0.4 + (this._shellsDone + 1) * st - 0.12) {
          if (inv.ammo > 0 && inv.mag < w.magSize) {
            inv.mag++;
            inv.ammo--;
          }
          this._shellsDone++;
          if (this.game.audio.shellInsert) this.game.audio.shellInsert();
        }
        if (this._shellsDone >= n && !this._racked && el >= 0.4 + n * st) {
          this._racked = true;
          if (this.game.audio.pumpRack) this.game.audio.pumpRack();
        }
        if (this._reloadT <= 0) {
          this._racked = false;
          this._reloadT = 0;
          this._reloadProg = 0;
          p._reload = 0;
        }
        return;
      }
      // Magazine props: the old one comes out and drops, a fresh one goes in.
      if (mp && this._reloadStyle !== 4) {
        const r = this._reloadProg;
        mp.visible = (r > 0.14 && r < 0.3) || (r > 0.32 && r < 0.46);
        if (r >= 0.3 && !this._magDropped) {
          this._magDropped = true;
          if (this._ensureFx() && this._reloadFor !== 'revolver') {
            const hand = p.model.joints.elbowL;
            hand.updateWorldMatrix(true, false);
            const q = hand.localToWorld(_v1.set(0, -0.3, 0.05));
            this.mags.spawn(q.x, q.y, q.z, p.vel.x * 0.5 + (Math.random() - 0.5) * 0.6, 0.4, p.vel.z * 0.5 + (Math.random() - 0.5) * 0.6);
          }
        }
      }
      if (this._reloadT <= 0) {
        this._reloadT = 0;
        this._reloadProg = 0;
        p._reload = 0;
        if (mp) mp.visible = false;
        this._finishReload();
      }
    }

    _finishReload() {
      const w = def(this._reloadFor);
      const inv = w && this.inventory[w.id];
      this._reloadSnd = null;
      if (!inv) return;
      const need = w.magSize - inv.mag;
      const take = Math.min(need, inv.ammo);
      inv.mag += take;
      inv.ammo -= take;
    }

    get reloading() {
      this._syncState();
      return this._reloadT > 0;
    }

    /** Where the gun sits in the hand right now: draw, reload tilt and recoil kick. */
    _poseModel() {
      const m = this._model;
      if (!m) return;
      const p = this.game.player;
      const w = this.weapon;
      const feel = FEEL[w.id] || FEEL_DEFAULT;
      const draw = p._draw || 0;
      const rl = this._reloadT > 0 ? Math.sin(this._reloadProg * Math.PI) : 0;
      const k = this._recoil;
      // Kick: the gun slides back along the forearm and the muzzle climbs.
      m.position.set(0, -0.31 + k * 0.035 * feel.kick, 0.03 - draw * 0.02);
      m.rotation.set(Math.PI / 2 - k * 0.1 * feel.kick - draw * 0.5 - rl * 0.25, 0, rl * (this._reloadStyle === 3 ? 0.35 : 0.55));
    }

    // -------------------------------------------------------------- aim
    /** The aim ray: from the camera through the crosshair. */
    _aimRay(spread) {
      const cam = this.game.renderer.camera;
      const dir = this._dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
      this._aimAssist(dir, cam.position);
      if (spread > 0) {
        const r = Math.sqrt(Math.random()) * spread;
        const a = Math.random() * Math.PI * 2;
        const up = this._up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        const right = this._right.set(1, 0, 0).applyQuaternion(cam.quaternion);
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      }
      return { o: cam.position, d: dir };
    }

    /**
     * Aim assist (Settings → Gameplay): a shot that only just misses a hostile
     * is bent onto their chest. The cone is wider on a controller.
     */
    _aimAssist(dir, origin) {
      const g = this.game;
      if (!g.settings.get('gameplay.aimAssist')) return;
      // Already on someone: shoot exactly there (a head stays a headshot).
      if (g.crowd.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 90)) return;
      const pad = g.input.lastDevice === 'gamepad';
      let cone = pad ? 0.1 : 0.04;
      let best = null;
      for (const a of g.crowd.agents) {
        if (a.dead || a.hidden || !a.brain || !a.brain.hostile) continue;
        const tx = a.pos.x - origin.x;
        const ty = a.pos.y + 1.2 - origin.y;
        const tz = a.pos.z - origin.z;
        const d = Math.hypot(tx, ty, tz);
        if (d < 2 || d > 70) continue;
        const ang = Math.acos(clamp((tx * dir.x + ty * dir.y + tz * dir.z) / d, -1, 1));
        if (ang < cone) {
          cone = ang;
          best = [tx / d, ty / d, tz / d];
        }
      }
      if (best) {
        const k = pad ? 0.85 : 0.6;
        dir.set(dir.x + (best[0] - dir.x) * k, dir.y + (best[1] - dir.y) * k, dir.z + (best[2] - dir.z) * k).normalize();
      }
    }

    /**
     * Everything that follows the crosshair while Jay is on foot: what's under it (red over enemies),
     * sticky aim that rides a moving target, the sniper scope with sway and held breath, and the
     * crosshair's bloom.
     */
    _updateAim(dt, w) {
      const g = this.game;
      const p = g.player;
      const inp = g.input;
      const rig = g.cameraRig;
      const ranged = w.kind === 'hitscan' || w.kind === 'pellets';
      const aiming = p.aiming && ranged;
      // What's under the crosshair (10 Hz).
      this._probeT -= dt;
      if ((aiming || (this._scopeK > 0.05)) && this._probeT <= 0) {
        this._probeT = 0.1;
        const cam = g.renderer.camera;
        const d = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
        const o = cam.position;
        const ts = Math.max(0, _v3.subVectors(p.renderPos, o).dot(d) - 0.2);
        const hit = this.trace(o.x + d.x * ts, o.y + d.y * ts, o.z + d.z * ts, d.x, d.y, d.z, w.range || 60, null, p.vehicle);
        this.targetDist = hit.type === 'none' ? 0 : hit.t + ts;
        this.targetKind = hit.type === 'agent' && !hit.agent.dead ? (hit.agent.brain && hit.agent.brain.hostile ? 2 : 1) : 0;
      } else if (!aiming && this._scopeK < 0.05) {
        this.targetKind = 0;
        this.targetDist = 0;
      }
      // Sticky aim: once the crosshair is on a hostile it rides along when they move.
      const assistOn = aiming && g.settings.get('gameplay.aimAssist');
      if (assistOn) this._trackAssist(dt);
      else this._asAgent = null;
      rig.sensMul = this.targetKind === 2 && assistOn ? (g.input.lastDevice === 'gamepad' ? 0.6 : 0.7) : 1;

      // Sniper scope.
      const wantScope = aiming && w.slot === 'sniper' && p.aimAmount > 0.7 && !this.wheelOpen;
      this._scopeK += ((wantScope ? 1 : 0) - this._scopeK) * Math.min(1, dt * 9);
      if (this._scopeK < 0.01) this._scopeK = 0;
      rig.scopeK = this._scopeK;
      rig.aimZoom = 1 + ((w.zoom || 1) - 1) * this._scopeK;
      const scoped = this._scopeK > 0.85;
      if (scoped !== !!this._scoped) {
        this._scoped = scoped;
        if (g.audio.scopeIn) g.audio.scopeIn(scoped);
      }
      this._showScope(scoped);
      // Sway, and holding breath (Sprint) steadies it for a few seconds.
      let tx = 0;
      let ty = 0;
      if (wantScope) {
        const wantHold = inp.down('sprint') && this._breath > 0.02;
        if (wantHold !== this._breathHeld) {
          this._breathHeld = wantHold;
          if (g.audio.holdBreath) g.audio.holdBreath(wantHold);
        }
        if (this._breathHeld) this._breath = Math.max(0, this._breath - dt / 4.5);
        else this._breath = Math.min(1, this._breath + dt / (this._breath < 0.25 ? 7 : 4));
        const speed = Math.hypot(p.vel.x, p.vel.z);
        const amp = (this._breathHeld ? 0.00018 : 0.0017) * (1 + speed * 0.5) * (this._breath < 0.25 && !this._breathHeld ? 1.6 : 1);
        this._swayT += dt;
        const t = this._swayT;
        tx = (Math.sin(t * 0.9) + 0.5 * Math.sin(t * 2.3 + 1)) * amp;
        ty = (Math.cos(t * 0.7) + 0.5 * Math.sin(t * 1.9)) * amp * 0.8;
      } else {
        this._breathHeld = false;
        this._breath = Math.min(1, this._breath + dt / 3);
      }
      // The sway is a movement of the camera itself (the bullets go where it points), so apply the change.
      const sx = this._swayX + (tx - this._swayX) * Math.min(1, dt * 12);
      const sy = this._swayY + (ty - this._swayY) * Math.min(1, dt * 12);
      rig.yaw += sx - this._swayX;
      rig.pitch += sy - this._swayY;
      this._swayX = sx;
      this._swayY = sy;
      if (this.scope && scoped) this.scope.set(this.targetDist, this._breath, this._breathHeld);

      // Crosshair: bloom from movement, recent fire and the weapon's own spread.
      const speed = Math.hypot(p.vel.x, p.vel.z);
      let bloom = this._bloom * 0.8 + Math.min(1, speed / 6) * 0.35 + this._recoil * 0.3;
      if ((w.pellets || 1) > 1) bloom = Math.max(bloom, 0.55);
      if (w.slot === 'sniper') bloom += 0.15;
      this._setReticle(!ranged || scoped || w.slot === 'unarmed', bloom);

      // Throw arc: shown while aiming a grenade or molotov, or while cooking one.
      if (this.arc) {
        if (w.kind === 'thrown' && (p.aiming || this._thr.state === 1) && this.inventory[w.id]) this._previewThrow(w);
        else this.arc.hide();
      }
    }

    _trackAssist(dt) {
      const g = this.game;
      const cam = g.renderer.camera;
      const rig = g.cameraRig;
      const pad = g.input.lastDevice === 'gamepad';
      const cone = pad ? 0.1 : 0.05;
      let a = this._asAgent;
      const o = cam.position;
      if (a && (a.dead || a.hidden || !a.brain || !a.brain.hostile)) a = this._asAgent = null;
      if (!a) {
        if (this.targetKind !== 2) return;
        // Acquire the hostile the probe says we're on (or nearly on).
        const d = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
        let best = null;
        let bestAng = cone;
        for (const c of g.crowd.agents) {
          if (c.dead || c.hidden || !c.brain || !c.brain.hostile) continue;
          const tx = c.pos.x - o.x;
          const ty = c.pos.y + 1.25 - o.y;
          const tz = c.pos.z - o.z;
          const dist = Math.hypot(tx, ty, tz);
          if (dist < 2 || dist > 80) continue;
          const ang = Math.acos(clamp((tx * d.x + ty * d.y + tz * d.z) / dist, -1, 1));
          if (ang < bestAng) {
            bestAng = ang;
            best = c;
          }
        }
        if (!best) return;
        this._asAgent = a = best;
        const tx = a.pos.x - o.x;
        const ty = a.pos.y + 1.25 - o.y;
        const tz = a.pos.z - o.z;
        this._asYaw = Math.atan2(tx, tz);
        this._asPitch = Math.asin(ty / (Math.hypot(tx, ty, tz) || 1));
        return;
      }
      const tx = a.pos.x - o.x;
      const ty = a.pos.y + 1.25 - o.y;
      const tz = a.pos.z - o.z;
      const dist = Math.hypot(tx, ty, tz) || 1;
      const yaw = Math.atan2(tx, tz);
      const pitch = Math.asin(ty / dist);
      const dYaw = VH.math.angleDelta ? VH.math.angleDelta(this._asYaw, yaw) : yaw - this._asYaw;
      const dPitch = pitch - this._asPitch;
      this._asYaw = yaw;
      this._asPitch = pitch;
      // Release if Jay has looked well away from them.
      const fx = Math.sin(rig.yaw) * Math.cos(rig.pitch);
      const fy = Math.sin(rig.pitch);
      const fz = Math.cos(rig.yaw) * Math.cos(rig.pitch);
      const off = Math.acos(clamp((tx * fx + ty * fy + tz * fz) / dist, -1, 1));
      if (off > cone * 2.2 || dist > 90) {
        this._asAgent = null;
        return;
      }
      if (Math.abs(dYaw) < 0.08 && Math.abs(dPitch) < 0.08) {
        const k = pad ? 0.9 : 0.7;
        rig.yaw += dYaw * k;
        rig.pitch += dPitch * k;
      }
    }

    _showScope(on) {
      if (this.scope) this.scope.show(on);
    }

    /** Crosshair classes and size (cheap: only touches the DOM when something changed). */
    _setReticle(hide, bloom) {
      const h = this.game.hud && this.game.hud.crosshair;
      if (!h) return;
      const xh = this._xh;
      const gap = Math.round(clamp(bloom, 0, 1) * 7) * 2;
      const enemy = this.targetKind === 2 && !hide;
      if (hide !== xh.hide) {
        xh.hide = hide;
        h.classList.toggle('hide', hide);
      }
      if (enemy !== xh.enemy) {
        xh.enemy = enemy;
        h.classList.toggle('enemy', enemy);
      }
      if (gap !== xh.gap) {
        xh.gap = gap;
        h.style.setProperty('--xh-gap', gap + 'px');
      }
    }

    // ------------------------------------------------------------ shooting
    /** First thing a ray hits: a person, a car, or the city. */
    trace(ox, oy, oz, dx, dy, dz, range, ignoreAgent, ignoreVehicle) {
      const g = this.game;
      let best = { t: range, type: 'none' };
      const hw = g.physics.raycast(ox, oy, oz, dx, dy, dz, range, { flags: VH.COLLIDE.SHOTS | VH.COLLIDE.CAMERA, ground: true });
      if (hw) best = { t: hw.t, type: 'world', hit: hw };
      const ha = g.crowd.raycast(ox, oy, oz, dx, dy, dz, best.t, ignoreAgent);
      if (ha) best = { t: ha.t, type: 'agent', agent: ha.agent, head: ha.head };
      for (const v of g.vehicles.list) {
        if (v === ignoreVehicle) continue;
        const t = Combat.rayCar(v, ox, oy, oz, dx, dy, dz, best.t);
        if (t >= 0 && t < best.t) best = { t, type: 'car', v };
      }
      return best;
    }

    static rayCar(v, ox, oy, oz, dx, dy, dz, maxT) {
      // Ray vs the car's oriented box.
      const c = Math.cos(v.yaw);
      const s = Math.sin(v.yaw);
      const rx = ox - v.pos.x;
      const rz = oz - v.pos.z;
      const lox = rx * c - rz * s;
      const loz = rx * s + rz * c;
      const ldx = dx * c - dz * s;
      const ldz = dx * s + dz * c;
      let t0 = 0;
      let t1 = maxT;
      const slab = (o, d, lo, hi) => {
        if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
        let a = (lo - o) / d;
        let b = (hi - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (!slab(lox, ldx, -v.hx, v.hx)) return -1;
      if (!slab(oy, dy, v.pos.y + 0.2, v.pos.y + v.height)) return -1;
      if (!slab(loz, ldz, -v.hz, v.hz)) return -1;
      return t0;
    }

    /**
     * Tracers, by weapon: pistols and revolvers every shot, an SMG or rifle every other or third
     * round (a real tracer belt), the sniper a long bright streak, the shotgun a few pellet streaks.
     */
    _tracer(w, mx, my, mz, hx, hy, hz, i, shotN) {
      const g = this.game;
      if (w.tracer === false) return;
      if (w.slot === 'shotgun') {
        if (i !== 0 && Math.random() > 0.3) return;
      } else if ((w.slot === 'smg' && shotN % 2) || (w.slot === 'rifle' && shotN % 3)) return;
      g.fx.tracer(mx, my, mz, hx, hy, hz);
      if (w.slot === 'sniper' && !this._low) {
        // A glowing trail that lingers a moment.
        const dx = hx - mx;
        const dy = hy - my;
        const dz = hz - mz;
        const len = Math.hypot(dx, dy, dz) || 1;
        const n = Math.min(14, Math.ceil(len / 8));
        for (let k = 1; k <= n; k++) {
          const f = k / (n + 1);
          g.fx.glow.emit({ x: mx + dx * f, y: my + dy * f, z: mz + dz * f, life: 0.22, size: 0.1, size1: 0.02, r: 3, g: 2, b: 0.9, a: 0.45, drag: 1 });
        }
      }
    }

    _fireHitscan(w, driveby) {
      const g = this.game;
      const inv = this.inventory[w.id];
      if (!inv) return;
      const p = g.player;
      // A shotgun interrupts its shell-by-shell reload; every other gun waits for the reload to finish.
      if (this._reloadT > 0) {
        if (w.shellReload && inv.mag > 0) {
          this._cancelActions();
        } else return;
      }
      if (inv.mag <= 0) {
        if (inv.ammo > 0) this.reload();
        else if (g.audio.dryFire) g.audio.dryFire();
        this._cool = 0.3;
        return;
      }
      inv.mag--;
      this._cool = 1 / (w.fireRate || 3);
      this._shotN = (this._shotN || 0) + 1;
      const feel = FEEL[w.id] || FEEL_DEFAULT;
      // Where the bullets go: exactly through the middle of the crosshair,
      // walking or standing, aimed or from the hip. Only the automatics (the
      // Wasp, the Mantis) wander a little, more the longer you hold the
      // trigger; a shotgun's pellets spread in a pattern round the centre.
      let spread = 0;
      if ((w.pellets || 1) > 1) spread = p.aiming ? 0.045 : 0.065;
      else if (w.auto) {
        spread = (p.aiming ? 0.005 : 0.01) + this._bloom * (p.aiming ? 0.008 : 0.014) + (driveby ? 0.008 : 0);
        this._bloom = Math.min(1, this._bloom + 0.2);
      } else if (w.slot === 'sniper' && this._scopeK < 0.85) spread = 0.03; // from the hip it's a guess
      else {
        this._bloom = Math.min(1, this._bloom + 0.12);
      }
      const pellets = w.pellets || 1;
      // Muzzle position (world). Copied: later calls reuse the vector.
      const muzzle = _v4.copy(this._muzzleWorld());
      let hitSomething = false;
      let kind = '';
      for (let i = 0; i < pellets; i++) {
        const ray = this._aimRay(spread);
        // Skip past Jay himself: start the trace near him along the camera ray.
        const cam = ray.o;
        const tStart = Math.max(0, _v1.subVectors(p.renderPos, cam).dot(ray.d) - 0.2);
        const ox = cam.x + ray.d.x * tStart;
        const oy = cam.y + ray.d.y * tStart;
        const oz = cam.z + ray.d.z * tStart;
        const range = w.range || 60;
        const hit = this.trace(ox, oy, oz, ray.d.x, ray.d.y, ray.d.z, range, null, p.vehicle);
        const hx = ox + ray.d.x * hit.t;
        const hy = oy + ray.d.y * hit.t;
        const hz = oz + ray.d.z * hit.t;
        this._tracer(w, muzzle.x, muzzle.y, muzzle.z, hx, hy, hz, i, this._shotN);
        const dmgAt = (head) => (VH.Data.weaponDamage ? VH.Data.weaponDamage(w, hit.t, head) : (w.damage || 25) * (head ? w.headshotMult || 2.5 : 1));
        if (hit.type === 'agent') {
          const a = hit.agent;
          const dmg = dmgAt(hit.head);
          a.damage(dmg, 'player', 'bullet', { x: hx, y: hy, z: hz, dx: ray.d.x, dy: ray.d.y, dz: ray.d.z, head: hit.head });
          if (a.brain && a.brain.setAlert) a.brain.setAlert(a);
          g.fx.impact(hx, hy, hz, -ray.d.x, -ray.d.y, -ray.d.z, 'flesh');
          if (g.audio.bulletImpact) g.audio.bulletImpact('flesh', this.pan(hx, hz), this.gain(hx, hz, 8));
          if (a.dead && a.down && !a.down.flung) {
            a.down.flung = true;
            a.down.vx = ray.d.x * (pellets > 1 ? 4 : 2);
            a.down.vz = ray.d.z * (pellets > 1 ? 4 : 2);
            a.down.vy = 1;
          }
          hitSomething = true;
          // Confirmation: a kill beats a headshot beats a hit.
          if (a.dead) kind = 'kill';
          else if (hit.head && kind !== 'kill') kind = 'head';
          else if (!kind) kind = 'hit';
        } else if (hit.type === 'car') {
          hit.v.damage(dmgAt(false) * 0.45, 'player', 'bullet');
          hit.v.wake();
          this.impactAt(hx, hy, hz, -ray.d.x, 0, -ray.d.z, 'car', false);
          if (hit.v.driver === 'ai' && hit.v.controller && hit.v.controller.onBump) hit.v.controller.onBump(hit.v, { driver: 'player' }, 6);
          if (!kind) kind = 'hit';
          hitSomething = true;
        } else if (hit.type === 'world') {
          const surf = this._surface(hit.hit.collider);
          this.impactAt(hx, hy, hz, hit.hit.nx, hit.hit.ny, hit.hit.nz, surf, i > 0);
        } else if (hit.type === 'none' && ray.d.y < -0.02 && oy > 0) {
          // Over the sea: the round lands in the water.
          const tw = (oy + 0.7) / -ray.d.y;
          if (tw < range && ox + ray.d.x * tw > 250) this.impactAt(ox + ray.d.x * tw, -0.7, oz + ray.d.z * tw, 0, 1, 0, 'water', i > 0);
        }
      }
      if (hitSomething) {
        this.hitMarkerT = 0.18;
        this.hitKind = kind || 'hit';
        if (g.audio.hitConfirm) g.audio.hitConfirm(this.hitKind);
      }
      g.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, pellets > 1 || w.slot === 'rifle' || w.slot === 'sniper');
      if (this._flash && this._flash.userData.pop) this._flash.userData.pop((this._model && this._model.userData.flashScale) || w.flash || 1, 0.05);
      else if (this._flash) this._flash.visible = true;
      if (g.audio.gunshot) g.audio.gunshot(w.id, 0, 1, false);
      // Brass flies out (a shotgun's hull waits for the pump).
      if (w.slot === 'shotgun') this._pumpEject = 0.38;
      else if (w.id !== 'revolver') this._ejectFromGun(w);
      // Kick: the camera climbs and settles back; the gun jumps in the hand; the view shudders.
      const rec = (w.recoil || 0.02) * (p.aiming ? 0.5 : 0.7) * (w.auto ? 0.6 : 1) * (this._scopeK > 0.85 ? 0.6 : 1);
      g.cameraRig.pitch += rec;
      this._kick = (this._kick || 0) + rec;
      g.cameraRig.addShake((w.shake || 0.08) * (w.slot === 'sniper' ? 1.0 : 0.7));
      this._recoil = 1;
      p._recoil = 1;
      p._recoilKick = feel.kick;
      VH.events.emit('gunshot', { x: p.pos.x, z: p.pos.z, byPlayer: true, loud: w.slot !== 'pistol' });
      if (inv.mag === 0 && inv.ammo > 0) this._autoReload = Math.max(0.3, this._cool * 0.8);
    }

    _muzzleWorld() {
      const out = this._tmp;
      if (this._model && this._model.visible !== false) {
        const m = this._model.userData.muzzle || new THREE.Vector3(0, 0.05, 0.25);
        out.copy(m);
        this._model.updateWorldMatrix(true, false);
        this._model.localToWorld(out);
        return out;
      }
      const p = this.game.player;
      out.set(p.renderPos.x + Math.sin(p.heading) * 0.5, p.renderPos.y + 1.35, p.renderPos.z + Math.cos(p.heading) * 0.5);
      if (p.inVehicle) out.y = p.vehicle.renderPos.y + p.vehicle.height * 0.75;
      return out;
    }

    // -------------------------------------------------------------- melee
    _meleeTarget(w, range) {
      const g = this.game;
      const p = g.player;
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      let target = null;
      let best = Infinity;
      for (const a of g.crowd.agents) {
        if (a.dead || a.hidden) continue;
        const dx = a.pos.x - p.pos.x;
        const dz = a.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > range || Math.abs(a.pos.y - p.pos.y) > 1.6) continue;
        const facing = (dx * fx + dz * fz) / (d || 1);
        if (facing < (d < 1.2 ? -0.2 : 0.15)) continue; // right up close, almost anything around Jay counts
        // Prefer whoever is nearest to straight ahead; fighters before bystanders.
        const score = d * (1.6 - facing) * (a.brain && a.brain.hostile ? 0.6 : 1);
        if (score < best) {
          best = score;
          target = a;
        }
      }
      return target;
    }

    _updateMelee(w, pressed, dt) {
      const g = this.game;
      const p = g.player;
      this._meleeT -= dt;
      if (this._comboT > 0) {
        this._comboT -= dt;
        if (this._comboT <= 0) this._combo = 0;
      }
      if (pressed) this._bufT = 0.22; // a press just before the swing ends still counts
      else if (this._bufT > 0) this._bufT -= dt;
      // The blow lands part-way through the swing (so slow-motion and hit-stop stretch it too).
      const hp = this._hitPending;
      if (hp) {
        hp.t -= dt;
        if (hp.t <= 0) {
          this._hitPending = null;
          this._meleeLand(hp.w, hp.idx);
        }
      }
      if (this._bufT > 0 && this._meleeT <= 0 && !this._hitPending) {
        this._bufT = 0;
        this._melee(w);
      }
    }

    _melee(w) {
      const g = this.game;
      const p = g.player;
      const sw = SWING[w.id] || SWING.fists;
      const idx = this._combo % 3;
      const heavy = idx === 2;
      this._combo = idx + 1;
      // Fists: 1-2-heavy. A blade or bat: three swings, the last one a big finisher.
      const dur = sw.dur * (heavy ? 1.25 : 1);
      this._meleeT = dur * 0.9 + (heavy ? 0.22 : 0.02);
      this._comboT = this._meleeT + 0.55;
      p._meleeSwing = 1;
      p._meleeRate = 1 / dur;
      p._meleeCombo = idx + 1;
      p._meleeStyle = w.id === 'bat' ? 2 : w.id === 'knife' ? 3 : 1;
      if (g.audio.meleeSwing) g.audio.meleeSwing();
      // A generous reach and a wide arc: a punch that looks like it lands, lands.
      const range = (w.range || 1.5) + 1.3;
      const target = this._meleeTarget(w, range);
      if (target) {
        // Turn into the punch.
        p.heading = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
        // A short lunge so the blow reaches.
        const d = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
        if (d > 1.1) {
          p.vel.x += Math.sin(p.heading) * 2.2;
          p.vel.z += Math.cos(p.heading) * 2.2;
        }
      }
      this._hitPending = { t: dur * sw.hit, w, idx };
    }

    /** The blow connects (or doesn't). */
    _meleeLand(w, idx) {
      const g = this.game;
      const p = g.player;
      const range = (w.range || 1.5) + 1.3;
      const target = this._meleeTarget(w, range);
      if (!target) return;
      const heavy = idx === 2;
      const big = w.slot === 'melee';
      const dmg = (w.damage || 12) * (heavy ? 1.7 : 1);
      const l = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z) || 1;
      const hx = (target.pos.x - p.pos.x) / l;
      const hz = (target.pos.z - p.pos.z) / l;
      p.heading = Math.atan2(hx, hz);
      target.damage(dmg, 'player', 'melee', { x: target.pos.x - hx * 0.2, y: target.pos.y + 1.45, z: target.pos.z - hz * 0.2, dx: hx, dy: 0.1, dz: hz, head: big || heavy });
      if (target.brain && target.brain.setAlert) {
        target.brain.setAlert(target);
        target.brain._fireT = Math.max(target.brain._fireT || 0, heavy ? 1.2 : 0.55); // a hit throws off their aim
      }
      const kb = (w.knockback || 2.5) * (heavy ? 1.6 : 1);
      if (heavy || big || target.dead) {
        // Down they go (the finisher always floors them).
        if (heavy || target.dead || Math.random() < 0.45) target.knock(hx * kb, 1.5 + (heavy ? 1.2 : 0), hz * kb, 0, 'player');
        else this._stagger(target, hx, hz, 2.6);
      } else this._stagger(target, hx, hz, 2.2);
      if (g.audio.meleeHit) g.audio.meleeHit(big || heavy);
      // Hit-stop: Jay's arm freezes for a beat, the camera thumps; the finisher also dips the clock.
      p._hitStop = heavy ? 0.1 : 0.055;
      g.cameraRig.addShake(heavy ? 0.32 : big ? 0.2 : 0.12);
      if (heavy) {
        g._slowT = Math.max(g._slowT, 0.05);
        g.timeScale = Math.min(g.timeScale, 0.3);
      }
      this.hitMarkerT = 0.18;
      this.hitKind = target.dead ? 'kill' : heavy ? 'head' : 'hit';
      if (g.audio.hitConfirm) g.audio.hitConfirm(this.hitKind);
      VH.events.emit('combat:melee', { agent: target });
      if (!target.brain && target.faction === 'civilian') g.police.crime('hitPed', target.pos.x, target.pos.z);
    }

    /** A flinch: shove somebody back a step over a fraction of a second. */
    _stagger(a, dx, dz, speed) {
      if (this._staggers.length >= 8) this._staggers.shift();
      this._staggers.push({ a, dx, dz, v: speed, t: 0.18 });
    }

    _updateStaggers(dt) {
      if (!this._staggers.length) return;
      const ph = this.game.physics;
      for (const s of this._staggers) {
        const a = s.a;
        s.t -= dt;
        if (a.dead || a.state === 'down' || s.t <= 0) {
          s.t = 0;
          continue;
        }
        const nx = a.pos.x + s.dx * s.v * dt;
        const nz = a.pos.z + s.dz * s.v * dt;
        if (!ph.overlaps(nx, nz, 0.3, a.pos.y + 0.2, a.pos.y + 1.6)) {
          a.pos.x = nx;
          a.pos.z = nz;
        }
      }
      this._staggers = this._staggers.filter((s) => s.t > 0);
    }

    // ------------------------------------------------------------- thrown
    /** Launch velocity of a throw from the aim ray (shared by the arc preview). */
    _throwVel(w, charge, out) {
      const cam = this.game.renderer.camera;
      const d = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
      d.y += 0.28;
      d.normalize();
      const speed = (w.throwSpeed || 17) * (w.id === 'molotov' ? 0.75 + 0.25 * charge : 1);
      const p = this.game.player;
      return out.set(d.x * speed + p.vel.x * 0.5, d.y * speed, d.z * speed + p.vel.z * 0.5);
    }

    _previewThrow(w) {
      const t = this._thr;
      const charge = clamp(t.cook / 0.4, 0, 1);
      const v = this._throwVel(w, charge, _v3);
      const s = this._muzzleWorld();
      const danger = w.id === 'grenade' && t.state === 1 && t.cook > (w.fuse || 3.2) - 1;
      this.arc.update(this.game.physics, s.x, s.y + 0.2, s.z, v.x, v.y, v.z, w.id === 'grenade' ? w.blastRadius || 7 : w.blastRadius || 3.5, danger);
    }

    /**
     * Grenades and molotovs: press to pull the pin / light the rag and wind up, hold to cook (a
     * grenade's fuse runs), release to throw. Aim (right mouse) shows the arc.
     */
    _updateThrow(w, firing, pressed, dt) {
      const g = this.game;
      const p = g.player;
      const inv = this.inventory[w.id];
      const t = this._thr;
      if (!inv) return;
      if (t.state === 0) {
        p._throwWind = Math.max(0, (p._throwWind || 0) - dt * 6);
        if (pressed && this._cool <= 0 && inv.mag + inv.ammo > 0) {
          // The pin is out: the grenade is spent from now on.
          if (inv.mag > 0) inv.mag--;
          else inv.ammo--;
          t.state = 1;
          t.cook = 0;
          if (w.id === 'grenade' && g.audio.grenadePin) g.audio.grenadePin();
          else if (g.audio.weaponSwitch) g.audio.weaponSwitch('molotov');
        }
      } else if (t.state === 1) {
        t.cook += dt;
        p._throwWind = Math.min(1, t.cook / 0.2);
        if (w.id === 'grenade' && t.cook >= (w.fuse || 3.2)) {
          // Held it too long.
          t.state = 0;
          p._throwWind = 0;
          this._cool = 0.8;
          g.vehicleFeedback.explosion(p.pos.x, p.pos.y + 1, p.pos.z, (w.blastRadius || 7) / 8, 'player');
          this.blastDamage(p.pos.x, p.pos.y + 1, p.pos.z, w.blastRadius || 7, w.damage || 180, 'player');
          this._afterThrow(w);
          return;
        }
        if (!firing && t.cook >= 0.2) {
          t.state = 2;
          t.rel = 0.13;
          p._meleeSwing = 1;
          p._meleeRate = 1 / 0.3;
          p._meleeStyle = 4;
          p._meleeCombo = 1;
          if (g.audio.meleeSwing) g.audio.meleeSwing();
        }
      } else if (t.state === 2) {
        t.rel -= dt;
        if (t.rel <= 0) {
          t.state = 0;
          p._throwWind = 0;
          this._launch(w, clamp(t.cook / 0.4, 0, 1), t.cook);
          this._cool = 0.6;
          this._afterThrow(w);
        }
      }
    }

    _afterThrow(w) {
      const inv = this.inventory[w.id];
      if (!inv) return;
      if (inv.mag === 0 && inv.ammo > 0) {
        inv.mag = 1;
        inv.ammo--;
      }
      if (inv.mag + inv.ammo <= 0) {
        delete this.inventory[w.id];
        // Next thrown weapon if there is one, otherwise fists.
        const other = weaponList().find((o) => o.slot === 'thrown' && this.inventory[o.id]);
        this.select(other ? other.id : 'fists');
      }
    }

    /** Send a thrown weapon off (speed 0..1 of the launch charge; 0 drops it at Jay's feet). */
    _launch(w, charge, cook) {
      const g = this.game;
      const p = g.player;
      const start = this._muzzleWorld();
      const v = _v3;
      if (charge > 0) this._throwVel(w, charge, v);
      else v.set(p.vel.x * 0.5, 0.5, p.vel.z * 0.5);
      const th = new Thrown(this, w, start.x, start.y + 0.2, start.z, v.x, v.y, v.z, 'player', cook || 0);
      this.thrown.push(th);
    }

    _updateFires(dt) {
      const g = this.game;
      const p = g.player;
      for (const f of this.fires) {
        f.t -= dt;
        // Burn people and set cars alight.
        g.crowd.near(f.x, f.z, f.r, (a) => {
          if (!a.dead) {
            a.damage(22 * dt, f.owner === 'player' ? 'player' : f.owner, 'fire');
            if (!a.brain && a.state !== 'down') g.crowd._flee(a, f.x, f.z, 4);
          }
        });
        if (!p.inVehicle && Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < f.r * 0.8) p.damage(14 * dt, 'fire');
        for (const v of g.vehicles.list) {
          if (!v.wrecked && Math.hypot(v.pos.x - f.x, v.pos.z - f.z) < f.r + v.hx) {
            v.damage(45 * dt, f.owner === 'player' ? 'player' : null, 'fire');
            if (v.burning === 0 && Math.random() < dt * 0.4) v.burning = 0.001;
          }
        }
      }
      this.fires = this.fires.filter((f) => f.t > 0);
    }

    // ------------------------------------------------------------ NPCs
    /** An NPC shoots at a target (Jay or his car). */
    npcFire(a, target, weaponId, accuracy) {
      const g = this.game;
      const w = def(weaponId) || def('pistol') || { damage: 20, range: 40, id: 'pistol' };
      const p = g.player;
      const mx = a.pos.x + Math.sin(a.heading) * 0.45;
      const my = a.pos.y + 1.35 * (a.look.height || 1) - (a.anim.crouch > 0.5 ? 0.45 : 0);
      const mz = a.pos.z + Math.cos(a.heading) * 0.45;
      const tx = target.pos.x;
      const ty = target.pos.y + (target === p ? 1.1 : 0.9);
      const tz = target.pos.z;
      const d = Math.hypot(tx - mx, tz - mz);
      // Chance to hit: range, target speed, difficulty, cover.
      const diff = { easy: 0.6, normal: 1, hard: 1.35 }[g.settings.get('gameplay.difficulty')] || 1;
      const tSpeed = target.vel ? Math.hypot(target.vel.x, target.vel.z) : 0;
      let chance = (accuracy === undefined ? 0.45 : accuracy) * diff * clamp(1.25 - d / ((w.range || 40) * 1.1), 0.08, 1) * clamp(1.2 - tSpeed / 18, 0.25, 1);
      if (p.crouched && !p.inVehicle) chance *= 0.7;
      const hit = Math.random() < chance;
      let ex = tx;
      let ey = ty;
      let ez = tz;
      if (!hit) {
        ex += (Math.random() - 0.5) * 3;
        ey += (Math.random() - 0.3) * 1.5;
        ez += (Math.random() - 0.5) * 3;
      }
      const dx = ex - mx;
      const dy = ey - my;
      const dz = ez - mz;
      const len = Math.hypot(dx, dy, dz) || 1;
      const tr = this.trace(mx, my, mz, dx / len, dy / len, dz / len, Math.min(len + 12, (w.range || 40) * 1.4), a, null);
      let endT = tr.t;
      // Did the shot reach Jay (not a wall in between)?
      if (hit && (tr.type === 'none' || tr.t >= len - 0.6 || (tr.type === 'car' && target.driver === 'player' && tr.v === target))) {
        endT = len;
        const base = VH.Data.weaponDamage ? VH.Data.weaponDamage(w, len, false) : w.damage || 20;
        const dmg = base * 0.55 * (w.pellets ? Math.min(w.pellets, 4) * 0.55 : 1);
        if (target === p) {
          p.damage(dmg, 'bullet');
          VH.events.emit('player:shot', { from: a, x: mx, z: mz, damage: dmg });
        } else if (target.damage) {
          target.damage(dmg * 0.6, a, 'bullet', { x: mx + (dx / len) * endT, y: my + (dy / len) * endT, z: mz + (dz / len) * endT, dx: dx / len, dy: dy / len, dz: dz / len });
        }
      } else if (tr.type === 'agent') {
        tr.agent.damage((w.damage || 20) * 0.5, a, 'bullet', { x: mx + (dx / len) * tr.t, y: my + (dy / len) * tr.t, z: mz + (dz / len) * tr.t, dx: dx / len, dy: dy / len, dz: dz / len, head: tr.head });
      } else if (tr.type === 'car') {
        tr.v.damage((w.damage || 20) * 0.35, a, 'bullet');
      }
      const hx = mx + (dx / len) * endT;
      const hy = my + (dy / len) * endT;
      const hz = mz + (dz / len) * endT;
      this._tracer(w, mx, my, mz, hx, hy, hz, 0, (a.id || 0) + Math.floor(g.time * 10));
      g.fx.muzzle(mx, my, mz, w.slot === 'rifle' || w.slot === 'shotgun');
      const gx = this.gain(mx, mz, 14);
      if (tr.type === 'world') this.impactAt(hx, hy, hz, tr.hit.nx, tr.hit.ny, tr.hit.nz, this._surface(tr.hit.collider), gx < 0.12);
      else if (tr.type === 'car') this.impactAt(hx, hy, hz, -dx / len, 0, -dz / len, 'car', gx < 0.12);
      // Brass hits the ground near enemies too (only when close enough to be seen).
      if (gx > 0.2 && w.slot !== 'shotgun') this._eject(false, mx, my - 0.1, mz, Math.cos(a.heading), 0.1, -Math.sin(a.heading), 0, 0);
      const pan = this.pan(mx, mz);
      if (g.audio.gunshot) g.audio.gunshot(w.id, pan, gx, gx < 0.25);
      // A near miss whizzes past.
      if (!hit && target === p && g.audio.whizz && d < 50) g.audio.whizz(this.pan(ex, ez));
      a._recoilT = 1;
      VH.events.emit('gunshot', { x: mx, z: mz, byPlayer: false, loud: true });
    }

    npcMelee(a, target, w) {
      const g = this.game;
      const p = g.player;
      if (target !== p || p.inVehicle) return;
      const d = Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
      if (d > (w.range || 1.5) + 0.4) return;
      p.damage((w.damage || 10) * 0.6, 'melee');
      if (g.audio.meleeHit) g.audio.meleeHit(w.slot === 'melee');
      g.cameraRig.addShake(0.2);
      VH.events.emit('player:shot', { from: a, x: a.pos.x, z: a.pos.z, damage: w.damage });
    }

    /** Make an armed enemy at a place. */
    spawnEnemy(x, z, opts) {
      opts = opts || {};
      const a = this.game.crowd.spawn(x, z, {
        look: opts.look, faction: opts.faction || 'gang', role: 'enemy', persistent: true,
        health: opts.health || 100, armor: opts.armor || 0, heading: opts.heading || 0, name: opts.name,
      });
      a.weapon = opts.weapon || 'pistol';
      a.brain = new CombatBrain(this, opts);
      return a;
    }

    // ------------------------------------------------------- penalties
    onArrested() {
      // The police keep a few of your toys.
      for (const id of Object.keys(this.inventory)) {
        const inv = this.inventory[id];
        inv.ammo = Math.floor(inv.ammo * 0.6);
      }
    }

    onHospital() {
      for (const id of Object.keys(this.inventory)) {
        const inv = this.inventory[id];
        inv.ammo = Math.floor(inv.ammo * 0.8);
      }
    }

    /** For saving. */
    serialize() {
      return { inventory: JSON.parse(JSON.stringify(this.inventory)), current: this.current };
    }

    load(data) {
      this._cancelActions();
      this.closeWheel(true);
      this.inventory = {};
      this.giveWeapon('fists', 0, true);
      if (data && data.inventory) {
        for (const id of Object.keys(data.inventory)) this.inventory[id] = data.inventory[id];
      }
      this.current = data && data.current && this.inventory[data.current] ? data.current : 'fists';
      this.lastBySlot = {};
      if (this._fxReady) {
        this.brass.clear();
        this.hulls.clear();
        this.mags.clear();
        this.holes.clear();
      }
      // A brand new game (main.js newGame passes null), or a save from before the starter kit existed
      // (nothing but fists): hand over the kit.
      const firearms = Object.keys(this.inventory).filter((id) => {
        const w = def(id);
        return w && w.kind !== 'melee' && id !== 'fists';
      });
      if (data === null || firearms.length === 0) this.starterKit();
      if (data === null) this.current = 'pistol';
      const w = def(this.current);
      if (w) this.lastBySlot[w.slot] = w.id;
      this._attachModel();
    }

    /**
     * A new game starts with the guns and grenades already in the weapon wheel, and the pistol drawn
     * (it stays holstered out of sight in cutscenes: the model is hidden unless the game is playing).
     */
    starterKit() {
      for (const id of ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper', 'bat', 'knife']) this.giveWeapon(id, undefined, true);
      this.giveWeapon('grenade', 10, true);
      this.giveWeapon('molotov', 6, true);
      if (this.inventory.pistol) this.current = 'pistol';
    }
  }

  function lowFx(game) {
    try {
      return (game.settings.get('graphics.effects') || 'high') === 'low';
    } catch (err) {
      return false;
    }
  }

  Combat.SLOT_ORDER = SLOT_ORDER;
  Combat.def = def;
  VH.Combat = Combat;
  VH.CombatBrain = CombatBrain;
})();
