/*
 * stashes.js — hidden pickups all over Vicehaven, like GTA's: health packs,
 * body armour, guns with a few magazines, and rolls of cash, tucked into
 * alleys, back car parks, the waterfront and the edges of the big places
 * (OWNER: Account B). Each one comes back a few minutes after it's taken.
 *
 *   new VH.Stashes(game)   finds the spots (deterministic: the same city
 *                          gets the same stashes) and lays the pickups out
 *                          through combat.addPickup (with a respawn time)
 *   .update(dt) .reset() .stop() .blips(out) .stats() .serialize() .load()
 *
 * Spots: the middle of every service alley, the car parks on the roadside
 * strips (suburbs.js), and a list of named places. Each is moved to clear
 * street-level ground (not a roof, not inside a kiosk) and kept 60 m from
 * the others. The radar shows the ones within RADAR metres.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const MAX = 52;
  const SPACING = 60;
  const RADAR = 180;

  // What a stash holds: [kind, weapon id, amount, respawn seconds, weight, label].
  const LOOT = [
    ['health', null, 60, 120, 5, 'Health pack'],
    ['armor', null, 50, 180, 3, 'Body armour'],
    ['cash', null, 0, 300, 5, 'Cash stash'],
    ['weapon', 'pistol', 48, 240, 2, 'Kestrel 9 + ammo'],
    ['weapon', 'revolver', 24, 240, 1, 'Hammerhead .44 + ammo'],
    ['weapon', 'smg', 120, 240, 2, 'Wasp SMG + ammo'],
    ['weapon', 'shotgun', 24, 240, 2, 'Gator 12 + shells'],
    ['weapon', 'rifle', 90, 300, 1.5, 'Mantis rifle + ammo'],
    ['weapon', 'sniper', 15, 360, 0.6, 'Heron sniper + rounds'],
    ['weapon', 'grenade', 4, 300, 1.2, 'Frag grenades'],
    ['weapon', 'molotov', 4, 300, 1, 'Molotovs'],
    ['weapon', 'bat', 1, 240, 0.5, 'Baseball bat'],
  ];

  // Named places worth a stash (the ones that exist in this build).
  const PLACES = [
    'pier_end', 'the_boardwalk', 'oceanview_pier', 'founders_park', 'civic_plaza',
    'crestline_overlook', 'saltmarsh_docks', 'crane_row', 'drydock_slip', 'northgate_plaza',
    'airport_terminal', 'fort_gate', 'area51_gate', 'westbrook', 'orchard_lots', 'westbrook_corner',
    'market_scrapyard', 'grand_parkade', 'lantern_alley', 'tannery_row',
  ];

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  class Stashes {
    constructor(game) {
      this.game = game;
      this.saveKey = 'stashes';
      this.list = [];
      this.taken = 0;
      this.ok = !!(game.combat && game.physics && game.layout);
      if (!this.ok) return;
      try {
        this._layOut();
      } catch (err) {
        console.warn('stashes: ' + err.message);
      }
    }

    /** Street-level ground at (x, z) with headroom, or null. */
    _clearAt(x, z) {
      const ph = this.game.physics;
      const gh = ph.groundHeight(x, z, 1);
      if (gh > 1 || gh < -0.3 || ph.groundHeight(x, z, 50) > gh + 0.5) return null;
      return ph.overlaps(x, z, 0.6, gh + 0.3, gh + 2.2) ? null : gh;
    }

    /** The nearest clear ground, spiralling out up to 14 m. */
    _settle(x, z) {
      for (let r = 0; r <= 14; r += 2) {
        const n = r ? Math.max(6, Math.round(r * 2.4)) : 1;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const px = x + Math.cos(a) * r;
          const pz = z + Math.sin(a) * r;
          if (this.game.world && this.game.world.onRoad && this.game.world.onRoad(px, pz, 1.5)) continue;
          const y = this._clearAt(px, pz);
          if (y !== null) return { x: px, y, z: pz };
        }
      }
      return null;
    }

    _candidates() {
      const L = this.game.layout;
      const out = [];
      for (const b of L.blocks || []) {
        if (!b.alley) continue;
        const a = b.alley;
        // A third of the way along, so it's tucked in rather than at the mouth.
        const t = (hashString(b.id) % 1000) / 1000;
        const along = 0.3 + t * 0.4;
        const x = a.axis === 'x' ? a.minX + (a.maxX - a.minX) * along : (a.minX + a.maxX) / 2;
        const z = a.axis === 'x' ? (a.minZ + a.maxZ) / 2 : a.minZ + (a.maxZ - a.minZ) * along;
        out.push({ x, z, key: b.id });
      }
      for (const S of L.strips || []) {
        for (const lot of S.lots) {
          if (lot.kind !== 'parking' || lot.store) continue;
          // The back corner of the car park, away from the road.
          const bx = S.axis === 'z' ? lot.cx + S.out * 9 : lot.cx;
          const bz = S.axis === 'z' ? lot.cz : lot.cz + S.out * 9;
          out.push({ x: bx, z: bz, key: lot.id });
        }
      }
      const places = this.game.places;
      for (const id of PLACES) {
        const p = places && places.get(id);
        if (p && !p.roof) out.push({ x: p.x + 6, z: p.z + 6, key: id, named: true });
      }
      // A fixed but shuffled order, named places first so the landmarks always get one.
      out.sort((p, q) => (q.named ? 1 : 0) - (p.named ? 1 : 0) || hashString(p.key + 'stash') - hashString(q.key + 'stash'));
      return out;
    }

    _layOut() {
      const g = this.game;
      const total = LOOT.reduce((n, e) => n + e[4], 0);
      const chosen = [];
      // Keep off job markers, race starts and things to press E on.
      const busy = [];
      try {
        if (g.activities && g.activities.blips) g.activities.blips(busy);
        if (g.missions && g.missions.blips) g.missions.blips(busy);
      } catch (err) {
        // Not ready yet: the interactables below still count.
      }
      for (const it of (g.interaction && g.interaction.items) || []) busy.push(it);
      const clearOfBusy = (x, z) => busy.every((b) => Math.hypot(b.x - x, b.z - z) > 10);
      for (const c of this._candidates()) {
        if (chosen.length >= MAX) break;
        const s = this._settle(c.x, c.z);
        if (!s || !clearOfBusy(s.x, s.z)) continue;
        if (chosen.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < SPACING)) continue;
        // The loot: weighted by a hash of the spot, so it never changes between loads.
        let r = ((hashString(c.key + 'loot') % 10000) / 10000) * total;
        let e = LOOT[0];
        for (const l of LOOT) {
          r -= l[4];
          if (r <= 0) {
            e = l;
            break;
          }
        }
        if (e[1] && !VH.Combat.def(e[1])) e = LOOT[0];
        const amount = e[0] === 'cash' ? 150 + (hashString(c.key + 'cash') % 10) * 50 : e[2];
        const pk = g.combat.addPickup(e[0], e[1], amount, s.x, s.y + 0.7, s.z, e[3]);
        chosen.push({ x: s.x, z: s.z, pk, label: e[5], kind: e[0] });
      }
      this.list = chosen;
    }

    update() {
      if (!this.ok) return;
      // Count the stashes Jay picks up (a pickup hides itself while it respawns).
      for (const s of this.list) {
        const hidden = s.pk.hiddenT > 0;
        if (hidden && !s.wasHidden) this.taken++;
        s.wasHidden = hidden;
      }
    }

    /** A new game: every stash is back. */
    reset() {
      this.taken = 0;
      for (const s of this.list) {
        s.pk.hiddenT = 0;
        s.pk.group.visible = true;
        s.wasHidden = false;
      }
    }

    stop() {}

    blips(out) {
      if (!this.ok) return;
      const p = this.game.player.pos;
      for (const s of this.list) {
        if (s.pk.gone || s.pk.hiddenT > 0) continue;
        if (Math.abs(s.x - p.x) > RADAR || Math.abs(s.z - p.z) > RADAR) continue;
        out.push({ x: s.x, z: s.z, type: 'stash_' + s.kind, label: s.label, noRim: true });
      }
    }

    stats() {
      return this.ok ? [['Stashes found', String(this.taken)]] : [];
    }

    serialize() {
      return { taken: this.taken };
    }

    load(data) {
      this.taken = (data && data.taken) || 0;
    }
  }

  VH.Stashes = Stashes;
})();
