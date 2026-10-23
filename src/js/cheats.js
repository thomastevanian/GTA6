/*
 * cheats.js — GTA-style cheat codes (OWNER: Account B). Type a word while
 * playing (no console needed) and it happens:
 *
 *   TOOLUP     every weapon, full ammo        PATCHUP    full health and armour
 *   PAYDAY     +$250,000                      LIEDOWN    lose the wanted level
 *   RAISEHELL  two more wanted stars          ROLLOUT    a tank beside Jay
 *   FASTLANE   a sports car beside Jay        SAUCER     the Visitor (the UFO)
 *   JETSET     a Kestrel fighter              SUNNYDAY / STORMY   the weather
 *   NIGHTOWL   six hours later
 *
 *   new VH.Cheats(game)   listens to keydown; .used counts codes (stats)
 *
 * Letters still drive Jay as usual. A code works once per typing; the buffer
 * clears after 3 s without a letter. Nothing is blocked for using them.
 */
(function () {
  'use strict';

  const VH = window.VH;

  /** Somewhere clear beside Jay for a vehicle `side` metres out. */
  function beside(g, side) {
    const p = g.player;
    return { x: p.pos.x + Math.cos(p.heading) * side, z: p.pos.z - Math.sin(p.heading) * side, heading: p.heading };
  }

  function spawnBeside(g, type, side, name) {
    if (!VH.Vehicle.typeSpec(type)) return 'No ' + name + ' in this build';
    if (g.player.inVehicle) return 'Get out first';
    const s = beside(g, side);
    g.vehicles.spawn(type, s.x, s.z, s.heading, { persistent: true });
    return name + ' delivered';
  }

  const CODES = {
    TOOLUP: (g) => {
      for (const w of VH.Data.weapons || []) if (w.id !== 'fists') g.combat.giveWeapon(w.id, (w.maxAmmo || 999), true);
      return 'Every weapon, full ammo';
    },
    PATCHUP: (g) => {
      const p = g.player;
      p.heal(p.maxHealth);
      p.armor = p.maxArmor;
      return 'Health and armour full';
    },
    PAYDAY: (g) => {
      g.giveMoney(250000, 'cheat');
      return '+$250,000';
    },
    LIEDOWN: (g) => {
      g.police.setLevel(0, 'cheat');
      return 'Wanted level cleared';
    },
    RAISEHELL: (g) => {
      g.police.setLevel(Math.min(5, g.police.level + 2), 'cheat');
      if (g.police._sawPlayer) g.police._sawPlayer();
      return 'Wanted level up';
    },
    ROLLOUT: (g) => spawnBeside(g, 'bastion', 7, 'Tank'),
    FASTLANE: (g) => spawnBeside(g, 'stinger', 4, 'Sports car'),
    SAUCER: (g) => spawnBeside(g, 'ufo', 14, 'Flying saucer'),
    JETSET: (g) => spawnBeside(g, 'kestrel', 16, 'Fighter jet'),
    SUNNYDAY: (g) => (g.weather && g.weather.set('clear', true) ? 'Clear skies' : 'No weather here'),
    STORMY: (g) => (g.weather && g.weather.set('storm', true) ? 'Here comes the storm' : 'No weather here'),
    NIGHTOWL: (g) => {
      g.environment.setTime(g.environment.hours + 6);
      return 'Six hours later';
    },
  };
  const LONGEST = Math.max(...Object.keys(CODES).map((k) => k.length));

  class Cheats {
    constructor(game) {
      this.game = game;
      this.saveKey = 'cheats';
      this.buf = '';
      this.lastKey = 0;
      this.used = 0;
      this._onKey = (e) => this._key(e);
      window.addEventListener('keydown', this._onKey);
    }

    _key(e) {
      const g = this.game;
      if (g.state !== 'playing' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!/^Key[A-Z]$/.test(e.code)) return;
      const now = performance.now();
      if (now - this.lastKey > 3000) this.buf = '';
      this.lastKey = now;
      this.buf = (this.buf + e.code.slice(3)).slice(-LONGEST);
      for (const code of Object.keys(CODES)) {
        if (!this.buf.endsWith(code)) continue;
        this.buf = '';
        let msg;
        try {
          msg = CODES[code](g);
        } catch (err) {
          msg = 'Didn\'t work (' + err.message + ')';
        }
        this.used++;
        g.hud.notify({ title: 'Cheat activated', text: code + ': ' + msg, icon: '✦' });
        if (g.audio.pickup) g.audio.pickup();
        return;
      }
    }

    update() {}

    reset() {
      this.buf = '';
    }

    stop() {
      this.buf = '';
    }

    stats() {
      return this.used ? [['Cheats used', String(this.used)]] : [];
    }

    serialize() {
      return { used: this.used };
    }

    load(data) {
      this.used = (data && data.used) || 0;
    }
  }

  VH.Cheats = Cheats;
})();
