/*
 * phone.js — Jay's phone (OWNER: Account B). P on foot or in any car but a
 * cab (where P is still taxi duty) brings it up, GTA-style, with a few
 * contacts who'll do something for money:
 *
 *   Dex Calloway       brings a car round: the last one Jay drove, or a Vireo
 *   Big Kostya         fixes the car Jay's in (or the last one, if it's near)
 *   Noor               makes the police forget Jay (up to four stars)
 *   Breakwater Arms    an ammo drop: +100 rounds a gun, +4 grenades
 *   Mercy General      a paramedic on a scooter: full health
 *
 * Pick with 1-5 or the arrow keys and Enter; P, Esc or Backspace hangs up.
 * While it's up those keys only drive the phone (a capture listener stops
 * them reaching input.js), so Jay doesn't walk off or swap guns. Not during
 * a job (activities.js only hands P over when no job is running).
 *
 *   new VH.Phone(game)   .toggle() .open() .close() .isOpen
 */
(function () {
  'use strict';

  const VH = window.VH;
  const NOOR_PER_STAR = 500;
  const NOOR_COOLDOWN = 180; // seconds of play between favours

  const CSS = `
.vh-phone { position: absolute; right: 28px; bottom: 28px; width: 270px; border-radius: 26px; padding: 14px 12px 16px;
  background: linear-gradient(160deg, rgba(22, 26, 40, 0.97), rgba(10, 12, 22, 0.97)); border: 2px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 79, 139, 0.18); color: #f4f1ea; font-family: var(--vh-font-ui, 'Segoe UI', sans-serif);
  transform: translateY(30px); opacity: 0; transition: transform 0.18s ease-out, opacity 0.18s ease-out; pointer-events: none; z-index: 40; }
.vh-phone.is-open { transform: none; opacity: 1; pointer-events: auto; }
.vh-phone-top { display: flex; justify-content: space-between; font-size: 12px; opacity: 0.75; padding: 0 8px 8px; }
.vh-phone-title { font: 700 13px var(--vh-font-display, sans-serif); letter-spacing: 0.22em; color: #ff7a9e; padding: 2px 8px 10px; }
.vh-phone-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.vh-phone-item { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 14px; cursor: pointer; }
.vh-phone-item.is-sel { background: linear-gradient(90deg, rgba(255, 79, 139, 0.32), rgba(255, 122, 89, 0.16)); }
.vh-phone-item b { display: block; font-size: 14px; }
.vh-phone-item small { display: block; font-size: 11.5px; opacity: 0.7; }
.vh-phone-key { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; font-size: 12px; font-weight: 700; background: rgba(255, 255, 255, 0.1); }
.vh-phone-price { font-size: 12.5px; font-weight: 700; color: #7dffa8; }
.vh-phone-foot { font-size: 11px; opacity: 0.55; text-align: center; padding-top: 10px; }
`;

  class Phone {
    constructor(game) {
      this.game = game;
      this.isOpen = false;
      this.sel = 0;
      this.lastCar = null; // { type, color } of the last car Jay drove
      this.noorUntil = 0;
      this.delivered = null; // { v, t } the car Dex brought (blip while it's new)
      this.calls = 0;
      this.saveKey = 'phone';
      this.contacts = [
        { id: 'dex', name: 'Dex Calloway', what: () => 'Bring my car round', price: () => 250, run: () => this._deliver() },
        { id: 'kostya', name: 'Big Kostya', what: () => 'Fix my car', price: () => 150, run: () => this._fix() },
        { id: 'noor', name: 'Noor', what: () => 'Make the police forget me', price: () => Math.max(1, this.game.police.level) * NOOR_PER_STAR, run: () => this._wipe() },
        { id: 'arms', name: 'Breakwater Arms', what: () => 'Ammo drop', price: () => 300, run: () => this._ammo() },
        { id: 'medic', name: 'Mercy General', what: () => 'Send a paramedic', price: () => 400, run: () => this._medic() },
      ];
      this._buildDom();
      this._onKey = (e) => this._key(e);
      window.addEventListener('keydown', this._onKey, true);
    }

    _buildDom() {
      if (!document.getElementById('vh-phone-css')) {
        const st = document.createElement('style');
        st.id = 'vh-phone-css';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const el = document.createElement('div');
      el.className = 'vh-phone';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="vh-phone-top"><span class="vh-phone-clock"></span><span>VH-Mobile ▮▮▮</span></div>' +
        '<div class="vh-phone-title">CONTACTS</div><ul class="vh-phone-list"></ul>' +
        '<div class="vh-phone-foot">1-5 or ↑↓ + Enter to call · P to hang up</div>';
      (this.game.hud && this.game.hud.root ? this.game.hud.root : document.body).appendChild(el);
      this.el = el;
      this.listEl = el.querySelector('.vh-phone-list');
      this.clockEl = el.querySelector('.vh-phone-clock');
      this.listEl.addEventListener('click', (e) => {
        const li = e.target.closest('.vh-phone-item');
        if (li) this._call(+li.dataset.i);
      });
    }

    _render() {
      const fm = VH.util.formatMoney;
      this.listEl.innerHTML = '';
      this.contacts.forEach((c, i) => {
        const li = document.createElement('li');
        li.className = 'vh-phone-item' + (i === this.sel ? ' is-sel' : '');
        li.dataset.i = i;
        li.innerHTML = '<span class="vh-phone-key">' + (i + 1) + '</span><span><b></b><small></small></span><span class="vh-phone-price"></span>';
        li.querySelector('b').textContent = c.name;
        li.querySelector('small').textContent = c.what();
        li.querySelector('.vh-phone-price').textContent = fm(c.price());
        this.listEl.appendChild(li);
      });
      const env = this.game.environment;
      if (env && this.clockEl) {
        const h = Math.floor(env.hours);
        const m = Math.floor((env.hours - h) * 60);
        this.clockEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.sel = 0;
      this._render();
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      if (this.game.input.releaseAll) this.game.input.releaseAll();
      if (typeof this.game.audio.click === 'function') this.game.audio.click();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
    }

    _key(e) {
      if (!this.isOpen) return;
      if (this.game.state !== 'playing') {
        this.close();
        return;
      }
      const k = e.code;
      let used = true;
      if (/^Digit[1-9]$/.test(k)) {
        const i = +k.slice(5) - 1;
        if (i < this.contacts.length) this._call(i);
      } else if (k === 'ArrowUp') {
        this.sel = (this.sel + this.contacts.length - 1) % this.contacts.length;
        this._render();
      } else if (k === 'ArrowDown') {
        this.sel = (this.sel + 1) % this.contacts.length;
        this._render();
      } else if (k === 'Enter' || k === 'NumpadEnter') this._call(this.sel);
      else if (k === 'Escape' || k === 'Backspace') this.close();
      else used = false;
      if (used) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    // ------------------------------------------------------------ calls
    _call(i) {
      const c = this.contacts[i];
      if (!c) return;
      const g = this.game;
      const price = c.price();
      if (g.player.money < price) {
        g.hud.notify({ title: c.name, text: 'That\'s ' + VH.util.formatMoney(price) + '. Call back when you have it.', icon: '✆', tone: 'bad' });
        return;
      }
      const res = c.run();
      if (!res || !res.ok) {
        g.hud.notify({ title: c.name, text: (res && res.msg) || 'Can\'t help right now.', icon: '✆', tone: 'bad' });
        return;
      }
      g.player.money -= price;
      VH.events.emit('money:changed', { delta: -price, reason: c.name });
      g.hud.notify({ title: c.name, text: res.msg, icon: '✆' });
      this.calls++;
      this.close();
    }

    /** Dex drops a car at the kerb up the road. */
    _deliver() {
      const g = this.game;
      const p = g.player;
      if (p.inVehicle) return { ok: false, msg: '"You\'re literally in a car, Jay."' };
      const lp = g.roadnet && g.roadnet.nearestLane(p.pos.x, p.pos.z, undefined, 90);
      if (!lp) return { ok: false, msg: '"I can\'t get a car out there. Find a road."' };
      const r = lp.road;
      let spot = null;
      for (const off of [22, 30, -22, 38, -30, 14]) {
        const along = Math.max(r.from + 6, Math.min(r.to - 6, lp.along + lp.dir * off));
        const pk = r.parking ? g.roadnet.parkingPoint(r, lp.dir, along) : g.roadnet.lanePoint(r, lp.dir, r.lanesPerDirection - 1, along, {});
        const busy = g.vehicles.list.some((v) => !v.wrecked && Math.hypot(v.pos.x - pk.x, v.pos.z - pk.z) < 6);
        if (!busy) {
          spot = pk;
          break;
        }
      }
      if (!spot) return { ok: false, msg: '"Street\'s jammed. Try somewhere quieter."' };
      const type = this.lastCar && VH.Vehicle.typeSpec(this.lastCar.type) ? this.lastCar.type : 'vireo';
      const v = g.vehicles.spawn(type, spot.x, spot.z, spot.heading, { color: this.lastCar ? this.lastCar.color : undefined, persistent: true });
      this.delivered = { v, t: 90 };
      const road = VH.CityGen && VH.CityGen.roadNameAt ? VH.CityGen.roadNameAt(g.layout, spot.x, spot.z) : null;
      return { ok: true, msg: '"Parked it' + (road ? ' on ' + road : '') + ', keys in. Don\'t say I never do anything for you."' };
    }

    /** Kostya fixes the car Jay's in, or the one he just got out of. */
    _fix() {
      const g = this.game;
      const p = g.player;
      let v = p.vehicle;
      if (!v) {
        let best = Infinity;
        for (const c of g.vehicles.list) {
          if (c.wrecked || c.driver === 'ai' || c.kind) continue;
          const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
          if (d < 12 && d < best) {
            best = d;
            v = c;
          }
        }
      }
      if (!v || v.wrecked || !v.repair) return { ok: false, msg: '"Which car? Stand by it, or get in it."' };
      if (v.health >= 1000) return { ok: false, msg: '"There\'s nothing wrong with it. Stop calling me."' };
      v.repair();
      return { ok: true, msg: '"(a van pulls up, two minutes of hammering, and it leaves) Good as new. Mostly."' };
    }

    /** Noor makes the wanted level go away (not five stars). */
    _wipe() {
      const g = this.game;
      const lvl = g.police.level;
      if (!lvl) return { ok: false, msg: '"Nobody\'s looking for you. Enjoy it."' };
      if (lvl >= 5) return { ok: false, msg: '"Five stars? They\'ve got the army out. Not even I can fix that."' };
      if (g.playTime < this.noorUntil) return { ok: false, msg: '"I just did that. Give it a few minutes or they\'ll notice."' };
      g.police.setLevel(0, 'phone');
      this.noorUntil = g.playTime + NOOR_COOLDOWN;
      return { ok: true, msg: '"Done. You\'re a parking ticket in Westbrook now. Don\'t make me do it again."' };
    }

    _ammo() {
      const g = this.game;
      let n = 0;
      for (const id of Object.keys(g.combat.inventory)) {
        const w = VH.Combat.def(id);
        if (!w || (w.kind !== 'hitscan' && w.kind !== 'pellets')) continue;
        g.combat.giveWeapon(id, 100, true);
        n++;
      }
      g.combat.giveWeapon('grenade', 4, true);
      if (g.audio.pickup) g.audio.pickup();
      return { ok: true, msg: 'A courier on a moped hands over a heavy bag: +100 rounds for ' + n + ' gun' + (n === 1 ? '' : 's') + ', +4 grenades.' };
    }

    _medic() {
      const p = this.game.player;
      if (p.health >= p.maxHealth) return { ok: false, msg: '"You sound fine to me, sir."' };
      p.heal(p.maxHealth);
      return { ok: true, msg: 'A paramedic on a scooter patches you up and takes a card payment.' };
    }

    // ------------------------------------------------------------ frame
    update(dt) {
      const p = this.game.player;
      const v = p.vehicle;
      if (v && !v.kind && v.type !== 'cab' && !v.isPolice) this.lastCar = { type: v.type, color: v.model && v.model.color };
      if (this.delivered) {
        this.delivered.t -= dt;
        if (this.delivered.t <= 0 || this.delivered.v.wrecked || p.vehicle === this.delivered.v) this.delivered = null;
      }
      if (this.isOpen && (this.game.state !== 'playing' || (this.game.missions && this.game.missions.run))) this.close();
    }

    reset() {
      this.close();
      this.lastCar = null;
      this.noorUntil = 0;
      this.delivered = null;
    }

    stop() {
      this.close();
    }

    blips(out) {
      const d = this.delivered;
      if (d && !d.v.wrecked) out.push({ x: d.v.pos.x, z: d.v.pos.z, type: 'car', heading: d.v.yaw, label: 'Your car (from Dex)' });
    }

    stats() {
      return [['Phone favours', String(this.calls)]];
    }

    serialize() {
      return { calls: this.calls, lastCar: this.lastCar };
    }

    load(data) {
      data = data || {};
      this.calls = data.calls || 0;
      this.lastCar = data.lastCar || null;
    }
  }

  VH.Phone = Phone;
})();
