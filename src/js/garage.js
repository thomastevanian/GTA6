/*
 * garage.js — Dex's garage at Calloway Auto keeps Jay's cars (OWNER:
 * Account B). Drive a car into the glowing bay at the kerb outside and stop:
 * Dex rolls it inside (up to four, kept in the save). On foot, E at the
 * garage door brings the next one out to the bay, keys in.
 *
 *   new VH.Garage(game)   world system: update/reset/stop/blips/stats/
 *                         serialize/load; the door is an interactable
 *                         ('garageOut') registered at start-up
 */
(function () {
  'use strict';

  const VH = window.VH;
  const SLOTS = 4;
  const PLACE = 'dex_garage';

  class Garage {
    constructor(game) {
      this.game = game;
      this.saveKey = 'garage';
      this.cars = []; // [{ type, color, name }]
      this.ok = false;
      this.hold = 0;
      const p = game.places && game.places.get(PLACE);
      if (!p || !game.roadnet) return;
      // The bay: on the pavement beside the door, parallel to the road and clear of lamps and trees
      // (cars mount the kerb fine), or the kerb lane if there's no room.
      const lp = game.roadnet.nearestLane(p.x, p.z, undefined, 40);
      if (!lp) return;
      const r = lp.road;
      const ax = r.axis === 'x' ? 1 : 0;
      const az = r.axis === 'z' ? 1 : 0;
      const ph = game.physics;
      const heading = r.axis === 'x' ? Math.PI / 2 : 0;
      for (const off of [7, -7, 10, -10, 13, -13]) {
        const x = p.x + ax * off;
        const z = p.z + az * off;
        let clear = true;
        for (const k of [-2.4, 0, 2.4]) if (ph.overlaps(x + ax * k, z + az * k, 1.1, 0.4, 1.6)) clear = false;
        if (clear && Math.abs(ph.groundHeight(x, z, 2) - 0.15) < 0.3) {
          this.bay = { x, z, heading };
          break;
        }
      }
      if (!this.bay) {
        const pk = game.roadnet.lanePoint(r, lp.dir, r.lanesPerDirection - 1, lp.along, {});
        this.bay = { x: pk.x, z: pk.z, heading: pk.heading };
      }
      this.door = { x: p.x, z: p.z, y: p.y || 0.15 };
      this.ok = true;
      // A ring on the road where cars go in.
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.set(this.bay.x, game.physics.groundHeight(this.bay.x, this.bay.z, 2) + 0.05, this.bay.z);
      game.scene.add(ring);
      this.ring = ring;
      game.interaction.register({ id: 'garage_out', kind: 'garageOut', x: this.door.x, y: this.door.y + 1.0, z: this.door.z, radius: 2.2, label: 'Garage: empty' });
      game.interaction.on('garageOut', () => this._takeOut());
      this._sync();
    }

    _item() {
      return this.game.interaction.items.find((it) => it.id === 'garage_out');
    }

    _sync() {
      const it = this._item();
      if (!it) return;
      it.label = this.cars.length ? 'Take out the ' + this.cars[0].name + ' (' + this.cars.length + ' in the garage)' : 'Garage: empty. Park a car in the green bay outside.';
      it.enabled = true;
      const cur = this.game.interaction.current;
      if (cur && cur.id === 'garage_out') VH.events.emit('interaction:focus', { item: cur });
    }

    _bayBusy() {
      return this.game.vehicles.list.some((v) => !v.removed && !v.wrecked && Math.hypot(v.pos.x - this.bay.x, v.pos.z - this.bay.z) < 4);
    }

    _takeOut() {
      const g = this.game;
      if (!this.cars.length) {
        g.hud.showToast('Nothing in the garage. Park a car in the green bay outside to keep it.');
        return 1;
      }
      if (this._bayBusy()) {
        g.hud.showToast('Something\'s parked in the bay. Move it first.');
        return 1;
      }
      const c = this.cars.shift();
      if (!VH.Vehicle.typeSpec(c.type)) return this._sync() || 1;
      const v = g.vehicles.spawn(c.type, this.bay.x, this.bay.z, this.bay.heading, { color: c.color, persistent: true });
      v.keep = true;
      g.hud.showToast('Dex rolls the ' + v.name + ' out to the kerb. Keys are in it.');
      this._sync();
      return 1.5;
    }

    update(dt) {
      if (!this.ok) return;
      const g = this.game;
      if (this._remove && !g.vehicles.exiting && !g.player.vehicle) {
        if (!this._remove.removed) g.vehicles.remove(this._remove);
        this._remove = null;
      }
      this.ring.material.opacity = 0.35 + 0.25 * Math.sin(performance.now() / 300);
      const v = g.player.vehicle;
      const ok = v && v.kind === 'car' && !v.wrecked && !v.missionOwned && !(g.missions && g.missions.run) &&
        Math.hypot(v.pos.x - this.bay.x, v.pos.z - this.bay.z) < 3.2 && v.speed < 1;
      this.hold = ok ? this.hold + dt : 0;
      if (this.hold < 1.2) return;
      this.hold = 0;
      if (this.cars.length >= SLOTS) {
        g.hud.showToast('Dex: "Four cars, Jay. I run a garage, not a car park." Take one out first.');
        this.hold = -6;
        return;
      }
      if (g.police && g.police.level > 0) {
        g.hud.showToast('Dex: "Not with the cops on you. Lose them first."');
        this.hold = -6;
        return;
      }
      this.cars.push({ type: v.type, color: v.model && v.model.color, name: v.name });
      g.vehicles.exitVehicle();
      v.noEnter = true;
      this._remove = v; // rolled inside once Jay is out (the exit animation still uses it)
      g.hud.centerBanner('CAR STORED', v.name + ' · ' + this.cars.length + ' of ' + SLOTS + ' in Dex\'s garage');
      this._sync();
    }

    reset() {
      this.cars = [];
      this.hold = 0;
      if (this.ok) this._sync();
    }

    stop() {}

    blips(out) {
      if (!this.ok) return;
      out.push({ x: this.door.x, z: this.door.z, type: 'safehouse', label: 'Dex\'s garage · ' + this.cars.length + ' of ' + SLOTS + ' cars', noRim: true });
    }

    stats() {
      return this.ok ? [['Cars in Dex\'s garage', this.cars.length + ' of ' + SLOTS]] : [];
    }

    serialize() {
      return { cars: this.cars.slice() };
    }

    load(data) {
      this.cars = ((data && data.cars) || []).filter((c) => c && VH.Vehicle.typeSpec(c.type)).slice(0, SLOTS);
      if (this.ok) this._sync();
    }
  }

  VH.Garage = Garage;
})();
