/*
 * area51.js — Area 51, the secret desert research base (OWNER: Account B).
 *
 * Placeholder wired into the game so the slot exists. It does nothing yet;
 * replace it with the real base. The contract (same as fort.js / airfield.js):
 *
 *   VH.Area51.build(world, layout)       static, world build time: geometry,
 *                                        colliders, signs, parked aircraft.
 *                                        Return the data the system needs
 *                                        (it is stored as world.area51 and
 *                                        passed to the constructor through
 *                                        game.world.area51).
 *   VH.Area51.registerPlaces(world, p)   static, optional: named places for
 *                                        the GPS / map / location banner.
 *   new VH.Area51(game)                  runtime system, built after the
 *                                        club (see WORLD_SYSTEMS in main.js).
 *        .update(dt)                     every fixed step while playing
 *        .reset() .stop()                new game / leaving the world
 *        .blips(out, onJob)              optional radar / map markers
 *        .stats() .serialize() .load()   optional (+ a saveKey string)
 *
 * Reserved ground: layout.zones.area51 (citygen.js), x -1600..-1100,
 * z -1750..-480 — no outskirts trees are planted inside it.
 */
(function () {
  'use strict';

  const VH = window.VH;

  class Area51 {
    static build() {
      return null; // nothing built yet
    }

    constructor(game) {
      this.game = game;
      this.ok = !!game.world.area51;
    }

    update() {}

    reset() {}

    stop() {}
  }

  VH.Area51 = Area51;
})();
