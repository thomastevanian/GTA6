/*
 * interaction.js — the universal "[E] Interact" system.
 *
 * Anything the player can use registers an interactable: a position, a
 * radius, a label and a kind. Each update picks the best one in range
 * (nearest, and roughly in front of Jay), the HUD shows its prompt, and a
 * press of Interact runs the handler for its kind.
 *
 * Later phases add kinds here — shop counters, doors, vehicles, mission
 * givers, safehouse beds — without touching the player or the HUD.
 */
(function () {
  'use strict';

  const VH = window.VH;

  class InteractionSystem {
    constructor(player, input) {
      this.player = player;
      this.input = input;
      this.items = [];
      this.current = null;
      this.handlers = {};
      this.cooldowns = new Map();
      this.enabled = true; // challenges switch interaction off while a run is on
      this.registerDefaultHandlers();
    }

    register(def) {
      this.items.push(Object.assign({ radius: 1.5, enabled: true }, def));
    }

    registerAll(list) {
      for (const d of list) this.register(d);
    }

    on(kind, handler) {
      this.handlers[kind] = handler;
    }

    update() {
      const p = this.player;
      let best = null;
      let bestScore = Infinity;
      if (!this.enabled) {
        if (this.current) {
          this.current = null;
          VH.events.emit('interaction:focus', { item: null });
        }
        return;
      }
      if (p.state === 'ground' && !p.noclip) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (const it of this.items) {
          if (!it.enabled) continue;
          const dx = it.x - p.pos.x;
          const dz = it.z - p.pos.z;
          const dy = it.y - (p.pos.y + 1);
          if (Math.abs(dy) > 1.8) continue;
          const d = Math.hypot(dx, dz);
          if (d > it.radius) continue;
          const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
          if (facing < -0.35) continue;
          const score = d - facing * 0.4;
          if (score < bestScore) {
            bestScore = score;
            best = it;
          }
        }
      }
      if (best !== this.current) {
        this.current = best;
        VH.events.emit('interaction:focus', { item: best });
      }
      if (this.input.consume('interact')) {
        if (best) this.use(best);
      }
    }

    use(item) {
      const now = performance.now();
      const until = this.cooldowns.get(item.id) || 0;
      if (now < until) return;
      const handler = this.handlers[item.kind];
      if (!handler) return;
      const cooldown = handler(item, this.player);
      if (cooldown) this.cooldowns.set(item.id, now + cooldown * 1000);
      VH.events.emit('interaction:used', { item });
    }

    /** The prompt text for the HUD, e.g. "Buy a Sunfizz soda  $2". */
    promptFor(item) {
      if (!item) return null;
      return { key: this.input.labelFor('interact'), label: item.label, price: item.price };
    }

    registerDefaultHandlers() {
      // Vending machine: costs a little money, restores a little health.
      this.on('vending', (item, player) => {
        if (player.money < item.price) {
          VH.events.emit('notify', { title: 'Not enough cash', text: 'A Sunfizz costs ' + VH.util.formatMoney(item.price) + '.', icon: '✕', tone: 'bad' });
          return 1;
        }
        player.money -= item.price;
        const before = player.health;
        player.heal(item.heal);
        VH.events.emit('money:changed', { delta: -item.price, reason: 'Sunfizz soda' });
        VH.events.emit('notify', {
          title: 'Sunfizz',
          text: player.health > before ? 'Ice cold. +' + Math.round(player.health - before) + ' health' : 'Ice cold. You were already feeling fine.',
          icon: '🥤',
        });
        return 1.2;
      });

      // City guide kiosk: opens the guide dialog.
      this.on('kiosk', () => {
        VH.events.emit('ui:dialog', { id: 'cityGuide' });
        return 0.5;
      });
    }
  }

  VH.InteractionSystem = InteractionSystem;
})();
