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
    constructor(combat, weapon, x, y, z, vx, vy, vz, owner) {
      this.combat = combat;
      this.w = weapon;
      this.pos = new THREE.Vector3(x, y, z);
      this.vel = new THREE.Vector3(vx, vy, vz);
      this.t = 0;
      this.owner = owner;
      this.mesh = VH.WeaponModels ? VH.WeaponModels.build(weapon.id) : new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshStandardMaterial({ color: 0x334422 }));
      this.mesh.position.copy(this.pos);
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
      this._reloadT = 0;
      this._reloadFor = null;
      this._meleeT = 0;
      this._throwCharge = 0;
      this.playerArmed = false;
      this.hitMarkerT = 0;
      this._tmp = new THREE.Vector3();
      this._dir = new THREE.Vector3();
      this.giveWeapon('fists', 0);
      this._attachModel();
      this.wheel = VH.WeaponWheel ? new VH.WeaponWheel(game.hud.root) : null;
      this._bindEvents();
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

    select(id) {
      if (!this.inventory[id]) return;
      if (this.current === id) return;
      this.current = id;
      const w = def(id);
      if (w) this.lastBySlot[w.slot] = id;
      this._reloadT = 0;
      this._attachModel();
      if (this.game.audio.weaponSwitch) this.game.audio.weaponSwitch();
      VH.events.emit('weapon:changed', { id });
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
        const cur = Math.max(0, owned.findIndex((w) => w.id === (this.current === w ? w.id : this.lastBySlot[slot])));
        slots.push({ slot, weapons: owned.length ? owned : weapons, current: cur });
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

      // Weapon wheel.
      if (this.wheel) {
        const holding = inp.down('weaponWheel') && g.state === 'playing' && p.state !== 'dead';
        if (holding && !this.wheel.isOpen) {
          this.wheel.open(this.wheelState());
          inp.wheelOpen = true; // input.js: follow the mouse even when it isn't captured
          g.slowmo(9999, 0.25);
          this._wheelSlow = true;
        } else if (this.wheel.isOpen) {
          if (holding) {
            // The camera ignores the mouse while the wheel is open; the wheel gets it.
            const md = inp.takeMouseDelta();
            if (md.x || md.y) this.wheel.move(md.x, md.y);
            const wheelNotches = inp.takeWheel();
            if (wheelNotches) this.wheel.cycle(Math.sign(wheelNotches));
            const pad = inp.pad;
            if (pad && pad.connected && (Math.abs(pad.look.x) > 0.3 || Math.abs(pad.look.y) > 0.3)) this.wheel.stick(pad.look.x, pad.look.y);
          } else {
            const pick = this.wheel.close();
            inp.wheelOpen = false;
            if (this._wheelSlow) {
              g._slowT = 0;
              this._wheelSlow = false;
            }
            if (pick && pick.weaponId) this.select(pick.weaponId);
          }
        }
      }
      if (this.wheel && !this.wheel.isOpen) inp.wheelOpen = false; // closed some other way (pause, death)
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

      if (this._flash && this._flashT > 0) {
        this._flashT -= dt;
        this._flash.visible = this._flashT > 0;
        this._flash.rotation.z = Math.random() * 6.28;
      }
      if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 8);

      // Reloading.
      if (this._reloadT > 0) {
        this._reloadT -= dt;
        if (this._reloadT <= 0) this._finishReload();
      }
      if (g.state !== 'playing' || p.state === 'dead' || p.state === 'knocked' || p.frozen || (this.wheel && this.wheel.isOpen)) {
        inp.discard('fire');
        return;
      }
      const w = this.weapon;
      // Weapon in hand is hidden while driving; the pose follows the weapon.
      if (this._model) this._model.visible = !p.inVehicle || p.aiming;
      p.weaponPose = w.kind === 'melee' || w.slot === 'unarmed' || w.kind === 'thrown' ? null : w.slot === 'pistol' ? 'pistol' : 'rifle';
      if (inp.consume('reload') && !p.inVehicle) this.reload();
      const firing = inp.down('fire');
      const pressed = inp.consume('fire');
      if (p.inVehicle) {
        const v = p.vehicle;
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
      if (w.kind === 'thrown') {
        if (pressed && this._cool <= 0) this._throw(w);
        return;
      }
      if (w.kind === 'melee' || w.slot === 'unarmed') {
        if (pressed && this._meleeT <= 0) this._melee(w);
        this._meleeT -= dt;
        return;
      }
      if ((pressed || (firing && w.auto)) && this._cool <= 0) this._fireHitscan(w, false);
    }

    reload() {
      const w = this.weapon;
      const inv = this.inventory[w.id];
      if (!inv || !w.magSize || inv.mag >= w.magSize || inv.ammo <= 0 || this._reloadT > 0) return;
      this._reloadT = w.reloadTime || 1.5;
      this._reloadFor = w.id;
      if (this.game.audio.reload) this.game.audio.reload(w.id);
    }

    _finishReload() {
      const w = def(this._reloadFor);
      const inv = w && this.inventory[w.id];
      if (!inv) return;
      const need = w.magSize - inv.mag;
      const take = Math.min(need, inv.ammo);
      inv.mag += take;
      inv.ammo -= take;
    }

    get wheelOpen() {
      return !!(this.wheel && this.wheel.isOpen);
    }

    get reloading() {
      return this._reloadT > 0;
    }

    /** The aim ray: from the camera through the crosshair. */
    _aimRay(spread) {
      const cam = this.game.renderer.camera;
      const dir = this._dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
      this._aimAssist(dir, cam.position);
      if (spread > 0) {
        const r = Math.sqrt(Math.random()) * spread;
        const a = Math.random() * Math.PI * 2;
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
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

    _fireHitscan(w, driveby) {
      const g = this.game;
      const inv = this.inventory[w.id];
      if (!inv) return;
      if (inv.mag <= 0) {
        if (inv.ammo > 0) this.reload();
        else if (g.audio.dryFire) g.audio.dryFire();
        this._cool = 0.3;
        return;
      }
      if (this._reloadT > 0) return;
      inv.mag--;
      this._cool = 1 / (w.fireRate || 3);
      const p = g.player;
      // Where the bullets go: exactly through the middle of the crosshair,
      // walking or standing, aimed or from the hip. Only the automatics (the
      // Wasp, the Mantis) wander a little, more the longer you hold the
      // trigger; a shotgun's pellets spread in a pattern round the centre.
      let spread = 0;
      if ((w.pellets || 1) > 1) spread = p.aiming ? 0.045 : 0.065;
      else if (w.auto) {
        spread = (p.aiming ? 0.005 : 0.01) + this._bloom * (p.aiming ? 0.008 : 0.014) + (driveby ? 0.008 : 0);
        this._bloom = Math.min(1, this._bloom + 0.2);
      }
      const pellets = w.pellets || 1;
      // Muzzle position (world).
      const muzzle = this._muzzleWorld();
      let hitSomething = false;
      for (let i = 0; i < pellets; i++) {
        const ray = this._aimRay(spread);
        // Skip past Jay himself: start the trace near him along the camera ray.
        const cam = ray.o;
        const tStart = Math.max(0, (new THREE.Vector3().subVectors(p.renderPos, cam)).dot(ray.d) - 0.2);
        const ox = cam.x + ray.d.x * tStart;
        const oy = cam.y + ray.d.y * tStart;
        const oz = cam.z + ray.d.z * tStart;
        const range = w.range || 60;
        const hit = this.trace(ox, oy, oz, ray.d.x, ray.d.y, ray.d.z, range, null, p.vehicle);
        const hx = ox + ray.d.x * hit.t;
        const hy = oy + ray.d.y * hit.t;
        const hz = oz + ray.d.z * hit.t;
        if (w.tracer !== false && (i === 0 || Math.random() < 0.3)) g.fx.tracer(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
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
        } else if (hit.type === 'car') {
          hit.v.damage(dmgAt(false) * 0.45, 'player', 'bullet');
          hit.v.wake();
          g.fx.impact(hx, hy, hz, -ray.d.x, 0, -ray.d.z, 'car');
          if (g.audio.bulletImpact) g.audio.bulletImpact('car', this.pan(hx, hz), this.gain(hx, hz, 8));
          if (hit.v.driver === 'ai' && hit.v.controller && hit.v.controller.onBump) hit.v.controller.onBump(hit.v, { driver: 'player' }, 6);
          hitSomething = true;
        } else if (hit.type === 'world') {
          const surf = this._surface(hit.hit.collider);
          g.fx.impact(hx, hy, hz, hit.hit.nx, hit.hit.ny, hit.hit.nz, surf);
          if (g.audio.bulletImpact && i === 0) g.audio.bulletImpact(surf, this.pan(hx, hz), this.gain(hx, hz, 10));
        }
      }
      if (hitSomething) this.hitMarkerT = 0.18;
      g.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, pellets > 1 || w.slot === 'rifle' || w.slot === 'sniper');
      if (this._flash) {
        this._flash.visible = true;
        this._flashT = 0.045;
      }
      if (g.audio.gunshot) g.audio.gunshot(w.id, 0, 1, false);
      // Kick.
      // A kick straight up that settles back (no random sideways jerk).
      const rec = (w.recoil || 0.02) * (p.aiming ? 0.5 : 0.7) * (w.auto ? 0.6 : 1);
      g.cameraRig.pitch += rec;
      this._kick = (this._kick || 0) + rec;
      g.cameraRig.addShake((w.shake || 0.08) * 0.7);
      this._recoil = 1;
      p._recoil = 1;
      VH.events.emit('gunshot', { x: p.pos.x, z: p.pos.z, byPlayer: true, loud: w.slot !== 'pistol' });
      if (inv.mag === 0 && inv.ammo > 0) setTimeout(() => this.reload(), 180);
    }

    _muzzleWorld() {
      const out = this._tmp;
      if (this._model && this._model.visible !== false) {
        const m = this._model.userData.muzzle || new THREE.Vector3(0, 0.05, 0.25);
        out.copy(m);
        this._model.localToWorld(out);
        return out;
      }
      const p = this.game.player;
      out.set(p.renderPos.x + Math.sin(p.heading) * 0.5, p.renderPos.y + 1.35, p.renderPos.z + Math.cos(p.heading) * 0.5);
      if (p.inVehicle) out.y = p.vehicle.renderPos.y + p.vehicle.height * 0.75;
      return out;
    }

    _melee(w) {
      const g = this.game;
      const p = g.player;
      this._meleeT = 1 / (w.fireRate || 2);
      p._meleeSwing = 1;
      if (g.audio.meleeSwing) g.audio.meleeSwing();
      // A generous reach and a wide arc: a punch that looks like it lands, lands.
      const range = (w.range || 1.5) + 1.3;
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
      if (!target) return;
      // Turn into the punch.
      p.heading = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
      setTimeout(() => {
        if (target.dead) return;
        const dmg = w.damage || 12;
        const heavy = w.slot === 'melee';
        const l = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z) || 1;
        const hx = (target.pos.x - p.pos.x) / l;
        const hz = (target.pos.z - p.pos.z) / l;
        target.damage(dmg, 'player', 'melee', { x: target.pos.x - hx * 0.2, y: target.pos.y + 1.45, z: target.pos.z - hz * 0.2, dx: hx, dy: 0.1, dz: hz, head: heavy });
        if (target.brain && target.brain.setAlert) target.brain.setAlert(target);
        if (heavy || target.dead || Math.random() < 0.25) target.knock(fx * (heavy ? 4 : 2.5), 1.5, fz * (heavy ? 4 : 2.5), 0, 'player');
        if (g.audio.meleeHit) g.audio.meleeHit(heavy);
        g.cameraRig.addShake(0.15);
        this.hitMarkerT = 0.18;
        VH.events.emit('combat:melee', { agent: target });
        if (!target.brain && target.faction === 'civilian') g.police.crime('hitPed', target.pos.x, target.pos.z);
      }, 140);
    }

    _throw(w) {
      const g = this.game;
      const inv = this.inventory[w.id];
      if (!inv || inv.mag + inv.ammo <= 0) return;
      if (inv.mag > 0) inv.mag--;
      else inv.ammo--;
      if (inv.mag === 0 && inv.ammo > 0) {
        inv.mag = 1;
        inv.ammo--;
      }
      this._cool = 0.9;
      const p = g.player;
      const ray = this._aimRay(0);
      const speed = w.throwSpeed || 17;
      const start = this._muzzleWorld();
      const up = 0.28;
      const d = ray.d.clone();
      d.y += up;
      d.normalize();
      this.thrown.push(new Thrown(this, w, start.x, start.y + 0.2, start.z, d.x * speed + p.vel.x * 0.5, d.y * speed, d.z * speed + p.vel.z * 0.5, 'player'));
      p._meleeSwing = 1;
      if (g.audio.meleeSwing) g.audio.meleeSwing();
      if (inv.mag + inv.ammo <= 0) {
        delete this.inventory[w.id];
        this.select('fists');
      }
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
      g.fx.tracer(mx, my, mz, hx, hy, hz);
      g.fx.muzzle(mx, my, mz, false);
      if (tr.type === 'world') g.fx.impact(hx, hy, hz, tr.hit.nx, tr.hit.ny, tr.hit.nz, this._surface(tr.hit.collider));
      const pan = this.pan(mx, mz);
      const gain = this.gain(mx, mz, 14);
      if (g.audio.gunshot) g.audio.gunshot(w.id, pan, gain, gain < 0.25);
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
      this.inventory = {};
      this.giveWeapon('fists', 0, true);
      if (data && data.inventory) {
        for (const id of Object.keys(data.inventory)) this.inventory[id] = data.inventory[id];
      }
      this.current = data && data.current && this.inventory[data.current] ? data.current : 'fists';
      // A brand new game (main.js newGame passes null), or a save from before
      // the starter kit existed (nothing but fists): hand over the kit.
      const firearms = Object.keys(this.inventory).filter((id) => {
        const w = def(id);
        return w && w.kind !== 'melee' && id !== 'fists';
      });
      if (data === null || firearms.length === 0) this.starterKit();
      this._attachModel();
    }

    /** A new game starts with the guns and grenades already in the weapon wheel (fists stay selected). */
    starterKit() {
      for (const id of ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper', 'bat', 'knife']) this.giveWeapon(id, undefined, true);
      this.giveWeapon('grenade', 10, true);
      this.giveWeapon('molotov', 6, true);
    }
  }

  Combat.SLOT_ORDER = SLOT_ORDER;
  Combat.def = def;
  VH.Combat = Combat;
  VH.CombatBrain = CombatBrain;
})();
