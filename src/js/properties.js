/*
 * properties.js — businesses Jay can buy, GTA-style (OWNER: Account B): a
 * laundrette, a car wash, a bowling alley, a tow yard, two motels and a
 * used-car lot on the roadside strips (suburbs.js). Each pays into its own
 * safe every in-game day (24 real minutes); walk up to the office board and
 * press E to buy it, then come back to empty the safe. A safe holds three
 * days' takings at most, so it pays to drop by.
 *
 *   VH.Properties.build(world, layout)  picks each business's lot, puts up its
 *                                       sign and the office interactable
 *   new VH.Properties(game)             runtime: buying, the safes, the "FOR
 *                                       SALE" boards, blips, stats and saves
 *
 * Now and then (every 10-18 minutes of quiet play) a crew raids one of
 * Jay's businesses with a decent safe: three gunmen on the forecourt, and
 * RAID_TIME seconds to drop them before they clear the safe out. Stopping
 * them pays a thank-you on top.
 *
 * A site: { id, name, sign, strip, near, price, daily } (see SITES).
 */
(function () {
  'use strict';

  const VH = window.VH;
  const KERB = 0.15;
  const DAY = 24 * 60; // real seconds in an in-game day (environment.js: an hour a minute)
  const CAP_DAYS = 3;
  const RAID_GAP = [600, 1080]; // seconds of quiet play between raids on Jay's businesses
  const RAID_TIME = 150; // to get there and stop them
  const RAID_MIN_SAFE = 800;

  const SITES = [
    { id: 'prop_laundrette', name: 'Suds & Sons Laundrette', sign: ['SUDS & SONS', 'LAUNDRETTE'], strip: 'an_n2', near: -700, price: 18000, daily: 1500, bg: ['#3fa9f5', '#1d5fa8'] },
    { id: 'prop_carwash', name: 'Orchard Car Wash', sign: ['ORCHARD', 'CAR WASH'], strip: 'or_es', near: 150, price: 32000, daily: 2600, bg: ['#22c3d6', '#0d6b80'] },
    { id: 'prop_bowling', name: 'Lucky Lanes Bowling', sign: ['LUCKY LANES', 'BOWLING · BAR'], strip: 'hr_s2', near: -780, price: 45000, daily: 3700, bg: ['#ff5aa0', '#8c1d5a'] },
    { id: 'prop_towyard', name: 'Meridian Tow & Impound', sign: ['MERIDIAN TOW', 'IMPOUND · 24H'], strip: 'mw_n3', near: -720, price: 26000, daily: 2100, bg: ['#f5b400', '#8c5a00'] },
    { id: 'prop_motel', name: 'Skyway Motel', sign: ['SKYWAY MOTEL', 'VACANCY'], strip: 'gn_w', near: -960, price: 60000, daily: 5000, bg: ['#ff7a59', '#b0303a'] },
    { id: 'prop_carlot', name: 'Grand Auto Sales', sign: ['GRAND AUTO', 'USED CARS'], strip: 'gn_e1', near: -980, price: 38000, daily: 3100, bg: ['#2ad46a', '#13723a'] },
    { id: 'prop_inn', name: 'Runway Inn', sign: ['RUNWAY INN', 'AIRPORT HOTEL'], strip: 'ar_e', near: 200, price: 90000, daily: 7500, bg: ['#7d8cff', '#2d3a9c'] },
  ];

  /** A point `along` the strip's road and `d` metres in from its road edge. */
  function at(S, along, d) {
    const c = S.edge + S.out * d;
    return S.axis === 'z' ? [c, along] : [along, c];
  }

  /** Yaw that faces the road from the strip. */
  function faceRoad(S) {
    if (S.axis === 'z') return S.out > 0 ? -Math.PI / 2 : Math.PI / 2;
    return S.out > 0 ? Math.PI : 0;
  }

  class Properties {
    /** World build: each business's lot, sign and office board. */
    static build(world, layout) {
      const sites = [];
      for (const def of SITES) {
        const S = (layout.strips || []).find((s) => s.id === def.strip);
        if (!S) continue;
        let best = null;
        let bestD = Infinity;
        for (const lot of S.lots) {
          if (lot.store || lot.kind !== 'building') continue;
          const d = Math.abs((lot.a0 + lot.a1) / 2 - def.near);
          if (d < bestD) {
            bestD = d;
            best = lot;
          }
        }
        if (!best) continue;
        const mid = (best.a0 + best.a1) / 2;
        const yaw = faceRoad(S);
        // The sign on posts at the back of the pavement, the office board beside it.
        const [sx, sz] = at(S, mid, 3.4);
        world.signs.push({ x: sx, y: 3.1, z: sz, yaw, w: 4.6, h: 1.5, lines: def.sign, style: 'brand', colors: { bg: def.bg, fg: '#ffffff' }, posts: true });
        const [ox, oz] = at(S, mid + 3.6, 2.6);
        const ctx = world.ctxAt(ox, oz);
        ctx.addInteractable({ id: def.id, kind: 'property', property: def.id, x: ox, y: KERB + 1.0, z: oz, radius: 1.8, label: 'Buy ' + def.name, price: def.price });
        best.property = def.id;
        sites.push(Object.assign({}, def, { x: ox, z: oz, yaw, signX: sx, signZ: sz, lot: best }));
      }
      return { sites };
    }

    // ------------------------------------------------------------ runtime
    constructor(game) {
      this.game = game;
      this.saveKey = 'properties';
      const built = game.world && game.world.properties;
      this.sites = (built && built.sites) || [];
      this.ok = this.sites.length > 0;
      this.owned = {}; // id -> { safe }
      this.earned = 0;
      this.boards = new Map();
      this.raid = null;
      this.raidT = RAID_GAP[0] + Math.random() * (RAID_GAP[1] - RAID_GAP[0]);
      this.raidsStopped = 0;
      if (!this.ok) return;
      this._makeBoards();
      game.interaction.on('property', (item) => this._use(item));
      this._sync();
    }

    _site(id) {
      return this.sites.find((s) => s.id === id);
    }

    _item(id) {
      return this.game.interaction.items.find((it) => it.id === id);
    }

    /** A red FOR SALE board on a stake by each office (hidden once it's Jay's). */
    _makeBoards() {
      const tex = (() => {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 160;
        const g = c.getContext('2d');
        g.fillStyle = '#c8202a';
        g.fillRect(0, 0, 256, 160);
        g.fillStyle = '#ffffff';
        g.fillRect(8, 8, 240, 144);
        g.fillStyle = '#c8202a';
        g.fillRect(14, 14, 228, 70);
        g.fillStyle = '#ffffff';
        g.font = '700 46px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('FOR SALE', 128, 50);
        g.fillStyle = '#1a1a1a';
        g.font = '600 24px Arial, sans-serif';
        g.fillText('ENQUIRE WITHIN', 128, 118);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
      const boardGeo = new THREE.BoxGeometry(1.2, 0.75, 0.04);
      const stakeGeo = new THREE.BoxGeometry(0.07, 1.5, 0.07);
      for (const s of this.sites) {
        const grp = new THREE.Group();
        const board = new THREE.Mesh(boardGeo, [wood, wood, wood, wood, face, face]);
        board.position.y = 1.55;
        board.castShadow = true;
        const stake = new THREE.Mesh(stakeGeo, wood);
        stake.position.y = 0.75;
        grp.add(board, stake);
        grp.position.set(s.x, KERB, s.z);
        grp.rotation.y = s.yaw;
        this.game.scene.add(grp);
        this.boards.set(s.id, grp);
      }
    }

    /** Boards, prompts and labels to match who owns what. */
    _sync() {
      const fm = VH.util.formatMoney;
      for (const s of this.sites) {
        const own = this.owned[s.id];
        const b = this.boards.get(s.id);
        if (b) b.visible = !own;
        const it = this._item(s.id);
        if (!it) continue;
        if (own) {
          it.label = Math.floor(own.safe) >= 1 ? 'Empty the safe at ' + s.name : s.name + ' · safe empty';
          it.price = undefined;
        } else {
          it.label = 'Buy ' + s.name + ' (' + fm(s.daily) + ' a day)';
          it.price = s.price;
        }
      }
      const cur = this.game.interaction.current;
      if (cur && cur.kind === 'property') VH.events.emit('interaction:focus', { item: cur });
    }

    _use(item) {
      const g = this.game;
      const s = this._site(item.property);
      if (!s) return 1;
      const fm = VH.util.formatMoney;
      const own = this.owned[s.id];
      if (!own) {
        if (g.player.money < s.price) {
          g.hud.notify({ title: 'Not enough cash', text: s.name + ' costs ' + fm(s.price) + '. Shops, ATMs, stashes and jobs pay.', icon: '✕', tone: 'bad' });
          return 1;
        }
        g.player.money -= s.price;
        VH.events.emit('money:changed', { delta: -s.price, reason: s.name });
        this.owned[s.id] = { safe: 0 };
        if (g.audio.cash) g.audio.cash();
        g.hud.centerBanner('PROPERTY PURCHASED', s.name + ' · ' + fm(s.daily) + ' a day into the safe');
        this._sync();
        return 1.5;
      }
      const cash = Math.floor(own.safe);
      if (cash < 1) {
        g.hud.showToast('The safe is empty. It fills by ' + fm(s.daily) + ' a day.');
        return 1;
      }
      own.safe -= cash;
      this.earned += cash;
      g.giveMoney(cash, s.name);
      if (g.audio.cash) g.audio.cash();
      g.hud.showToast('+' + fm(cash) + ' from ' + s.name);
      this._sync();
      return 1;
    }

    update(dt) {
      if (!this.ok) return;
      let changed = false;
      for (const id of Object.keys(this.owned)) {
        const s = this._site(id);
        const o = this.owned[id];
        if (!s) continue;
        const cap = s.daily * CAP_DAYS;
        const before = Math.floor(o.safe);
        o.safe = Math.min(cap, o.safe + (s.daily / DAY) * dt);
        if ((before < 1) !== (Math.floor(o.safe) < 1)) changed = true;
      }
      if (changed) this._sync();
      this._raidUpdate(dt);
    }

    // ------------------------------------------------------------ raids
    _raidUpdate(dt) {
      const g = this.game;
      const busy = (g.missions && g.missions.run) || g.state !== 'playing';
      if (this.raid) {
        if (g.missions && g.missions.run) return this._endRaid(null); // a job takes over: call it off
        const R = this.raid;
        R.t -= dt;
        const left = R.agents.filter((a) => !a.dead && !a.removed);
        if (!left.length) return this._endRaid(true);
        if (R.t <= 0) return this._endRaid(false);
        return;
      }
      if (busy || g.police.level > 0) return;
      const ready = this.sites.filter((s) => this.owned[s.id] && this.owned[s.id].safe >= RAID_MIN_SAFE);
      if (!ready.length) return;
      this.raidT -= dt;
      if (this.raidT > 0) return;
      this._startRaid(ready[Math.floor(Math.random() * ready.length)]);
    }

    _startRaid(s) {
      const g = this.game;
      const agents = [];
      const out = [Math.sin(s.yaw + Math.PI), Math.cos(s.yaw + Math.PI)]; // from the board towards the building
      for (let i = 0; i < 3; i++) {
        const side = (i - 1) * 3.2;
        const x = s.x + out[0] * 2 + Math.cos(s.yaw) * side;
        const z = s.z + out[1] * 2 - Math.sin(s.yaw) * side;
        const a = g.combat.spawnEnemy(x, z, { faction: 'gang', weapon: i === 1 ? 'smg' : 'pistol', guard: { x: s.x, z: s.z, r: 14 }, accuracy: 0.4, aggression: 0.6, heading: s.yaw });
        agents.push(a);
      }
      this.raid = { site: s, agents, t: RAID_TIME };
      g.hud.notify({ title: s.name, text: 'Robbers are cleaning out your safe! Get there and stop them (' + Math.round(RAID_TIME / 60 * 10) / 10 + ' min).', icon: '⚠', tone: 'bad', duration: 9000 });
      if (g.audio.alarm) g.audio.alarm();
    }

    /** ok: true stopped, false too late, null called off. */
    _endRaid(ok) {
      const g = this.game;
      const R = this.raid;
      this.raid = null;
      this.raidT = RAID_GAP[0] + Math.random() * (RAID_GAP[1] - RAID_GAP[0]);
      if (!R) return;
      const p = g.player.pos;
      for (const a of R.agents) {
        if (a.dead || a.removed) continue;
        if (ok === false && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 70) a.persistent = false; // in a fight: let them be
        else g.crowd.remove(a);
      }
      const o = this.owned[R.site.id];
      if (ok === true) {
        this.raidsStopped++;
        g.giveMoney(500, 'raid stopped');
        g.hud.notify({ title: R.site.name, text: 'Raid stopped. The staff chip in $500 to say thanks.', icon: '✓' });
      } else if (ok === false && o) {
        const lost = Math.floor(o.safe);
        o.safe = 0;
        this._sync();
        g.hud.notify({ title: R.site.name, text: 'Too late: the robbers got away with ' + VH.util.formatMoney(lost) + '.', icon: '✕', tone: 'bad' });
      }
    }

    /** A new game: nothing owned. */
    reset() {
      if (this.raid) this._endRaid(null);
      this.owned = {};
      this.earned = 0;
      if (this.ok) this._sync();
    }

    stop() {
      if (this.raid) this._endRaid(null);
    }

    blips(out) {
      if (!this.ok) return;
      const fm = VH.util.formatMoney;
      if (this.raid) {
        const R = this.raid;
        out.push({ x: R.site.x, z: R.site.z, type: 'objective', label: 'Raid at ' + R.site.name + ' · ' + Math.ceil(R.t) + ' s' });
        for (const a of R.agents) if (!a.dead && !a.removed) out.push({ x: a.pos.x, z: a.pos.z, type: 'enemy' });
      }
      for (const s of this.sites) {
        const o = this.owned[s.id];
        out.push(o
          ? { x: s.x, z: s.z, type: 'property_owned', label: s.name + (o.safe >= 1 ? ' · ' + fm(Math.floor(o.safe)) + ' in the safe' : ''), noRim: true }
          : { x: s.x, z: s.z, type: 'property', label: s.name + ' · for sale, ' + fm(s.price), noRim: true });
      }
    }

    stats() {
      if (!this.ok) return [];
      return [['Properties owned', Object.keys(this.owned).length + ' of ' + this.sites.length], ['Property income collected', VH.util.formatMoney(this.earned)], ['Raids stopped', String(this.raidsStopped)]];
    }

    serialize() {
      const owned = {};
      for (const id of Object.keys(this.owned)) owned[id] = { safe: Math.floor(this.owned[id].safe) };
      return { owned, earned: this.earned, raidsStopped: this.raidsStopped };
    }

    load(data) {
      data = data || {};
      this.owned = {};
      for (const id of Object.keys(data.owned || {})) if (this._site(id)) this.owned[id] = { safe: +data.owned[id].safe || 0 };
      this.earned = data.earned || 0;
      this.raidsStopped = data.raidsStopped || 0;
      if (this.ok) this._sync();
    }
  }

  VH.Properties = Properties;
})();
