/*
 * weapons-data.js — every weapon in Vicehaven, as data.
 *
 *   VH.Data.weaponSlots   the eight weapon-wheel slots, clockwise from the top
 *   VH.Data.weapons       ordered weapon definitions (the order is the order a
 *                         slot cycles through its weapons)
 *   VH.Data.weaponsById   the same definitions keyed by id
 *   VH.Data.weaponDamage  damage of one hit (one pellet for a shotgun) after
 *                         range falloff and the headshot multiplier
 *
 * Balance targets (NPCs have 100 health, 150 with armour):
 *   pistol    3 body shots (4 past 25 m), 1 headshot, even against armour
 *   revolver  2 body shots, 1 headshot
 *   smg       shreds inside 10 m, sprays and weakens past that
 *   shotgun   one blast kills inside 8 m; weak past 20 m
 *   rifle     3 body shots, accurate out to 150 m
 *   sniper    one body shot kills an unarmoured target, a headshot kills anyone
 *
 * Fields (units are metres, seconds and radians):
 *   id, name, slot, kind      kind: 'melee' | 'hitscan' | 'pellets' | 'thrown'
 *   damage                    per hit; per pellet for 'pellets'; blast damage at
 *                             the centre for a grenade; splash for a molotov
 *   headshotMult              multiplier for a hit to the head
 *   fireRate, auto            shots (or swings) per second; hold to keep firing
 *   range                     max hitscan range, or melee reach
 *   spread, aimSpread         (no longer used for Jay's shots: combat.js puts
 *   bloom, bloomMax            single shots dead on the crosshair, gives the
 *                              automatics a small spread and the shotgun a
 *                              pellet pattern round the centre)
 *   pellets                   pellets per shell (shotgun)
 *   magSize, reloadTime       0 for melee; a grenade's "mag" is one grenade
 *   shellReload, shellTime    loads one shell at a time (shotgun)
 *   maxAmmo, startAmmo        reserve cap and the ammo that comes with a pickup
 *   price, ammoPrice          at the gun shop; ammoPrice buys one magazine
 *   recoil                    camera pitch kick per shot
 *   shake                     camera shake per shot, 0..1
 *   tracer                    draw a tracer streak
 *   zoom                      aim FOV multiplier (the sniper has a scope)
 *   falloff                   { start, end, min }: full damage to `start`,
 *                             easing linearly to damage * min at `end`
 *   drivebyAllowed            can be fired from a car window
 *   throwSpeed, fuse          thrown weapons; fuse 0 = bursts on impact
 *   blastRadius               grenade blast or molotov fire-pool radius
 *   fireDuration, burnDps     molotov fire pool
 *   knockback                 impulse (m/s) given to what it hits
 *   hold                      animation hint: 'none' 'pistol' 'rifle' 'melee'
 *                             'melee2h' 'thrown'
 *   flash                     muzzle-flash scale
 *   sound                     sound profile for VH.AudioEngine#gunshot
 */
(function () {
  'use strict';

  const VH = window.VH;
  VH.Data = VH.Data || {};

  VH.Data.weaponSlots = [
    { id: 'unarmed', name: 'Unarmed' },
    { id: 'melee', name: 'Melee' },
    { id: 'pistol', name: 'Pistol' },
    { id: 'smg', name: 'SMG' },
    { id: 'shotgun', name: 'Shotgun' },
    { id: 'rifle', name: 'Rifle' },
    { id: 'sniper', name: 'Sniper' },
    { id: 'thrown', name: 'Thrown' },
  ];

  // Defaults shared by every definition; each weapon overrides what it needs.
  const BASE = {
    kind: 'hitscan',
    damage: 10,
    headshotMult: 1,
    fireRate: 1,
    auto: false,
    range: 50,
    spread: 0,
    aimSpread: 0,
    bloom: 0,
    bloomMax: 0,
    bloomRecover: 0.5,
    pellets: 1,
    magSize: 0,
    reloadTime: 0,
    shellReload: false,
    shellTime: 0,
    maxAmmo: 0,
    startAmmo: 0,
    price: 0,
    ammoPrice: 0,
    recoil: 0,
    shake: 0,
    tracer: false,
    zoom: 1,
    falloff: null,
    drivebyAllowed: false,
    throwSpeed: 0,
    fuse: 0,
    blastRadius: 0,
    fireDuration: 0,
    burnDps: 0,
    knockback: 0,
    hold: 'pistol',
    flash: 1,
    sound: 'none',
    desc: '',
  };

  const LIST = [
    // ------------------------------------------------------------- melee
    {
      id: 'fists', name: 'Fists', slot: 'unarmed', kind: 'melee',
      damage: 12, headshotMult: 1.5, fireRate: 2.4, range: 1.3, knockback: 2.5,
      hold: 'none', sound: 'melee',
      desc: 'Always with you. Good for settling arguments, bad for winning gunfights.',
    },
    {
      id: 'bat', name: 'Baseball Bat', slot: 'melee', kind: 'melee',
      damage: 38, headshotMult: 1.6, fireRate: 1.3, range: 1.9, knockback: 6,
      price: 100, hold: 'melee2h', sound: 'melee',
      desc: 'Ash wood with a taped grip. Three solid swings put most people down.',
    },
    {
      id: 'knife', name: 'Combat Knife', slot: 'melee', kind: 'melee',
      damage: 45, headshotMult: 1.5, fireRate: 2.0, range: 1.5, knockback: 1.5,
      price: 250, hold: 'melee', sound: 'melee',
      desc: 'Quick, quiet and close. A clip-point blade with a rubber grip.',
    },

    // ----------------------------------------------------------- pistols
    {
      id: 'pistol', name: 'Kestrel 9', slot: 'pistol', kind: 'hitscan',
      damage: 34, headshotMult: 4.5, fireRate: 4.5, range: 60,
      spread: 0.035, aimSpread: 0.007,
      magSize: 15, reloadTime: 1.35, maxAmmo: 225, startAmmo: 60,
      price: 400, ammoPrice: 45,
      recoil: 0.032, shake: 0.12, tracer: true, zoom: 0.8,
      falloff: { start: 25, end: 60, min: 0.55 },
      drivebyAllowed: true, hold: 'pistol', flash: 0.8, sound: 'pistol',
      desc: 'A polymer-frame 9 mm. Light, reliable and fast on target. Three to the body or one to the head.',
    },
    {
      id: 'revolver', name: 'Hammerhead .44', slot: 'pistol', kind: 'hitscan',
      damage: 60, headshotMult: 2.6, fireRate: 1.5, range: 70,
      spread: 0.04, aimSpread: 0.005,
      magSize: 6, reloadTime: 2.4, maxAmmo: 72, startAmmo: 24,
      price: 1200, ammoPrice: 80,
      recoil: 0.1, shake: 0.32, tracer: true, zoom: 0.78,
      falloff: { start: 30, end: 70, min: 0.6 },
      drivebyAllowed: true, hold: 'pistol', flash: 1.25, sound: 'revolver',
      desc: 'A stainless six-shooter with a heavy barrel. Slow to reload, but two hits end any fight.',
    },

    // --------------------------------------------------------------- smg
    {
      id: 'smg', name: 'Wasp', slot: 'smg', kind: 'hitscan',
      damage: 18, headshotMult: 2, fireRate: 13, auto: true, range: 45,
      spread: 0.07, aimSpread: 0.03, bloom: 0.006, bloomMax: 0.06, bloomRecover: 0.35,
      magSize: 32, reloadTime: 1.9, maxAmmo: 480, startAmmo: 128,
      price: 1500, ammoPrice: 70,
      recoil: 0.016, shake: 0.07, tracer: true, zoom: 0.82,
      falloff: { start: 10, end: 40, min: 0.4 },
      drivebyAllowed: true, hold: 'pistol', flash: 0.75, sound: 'smg',
      desc: 'A compact machine pistol with a wire stock. It empties a magazine in under three seconds; aim close.',
    },

    // ----------------------------------------------------------- shotgun
    {
      id: 'shotgun', name: 'Gator 12', slot: 'shotgun', kind: 'pellets',
      damage: 16, headshotMult: 1.4, fireRate: 1.1, range: 32, pellets: 8,
      spread: 0.12, aimSpread: 0.085,
      magSize: 6, reloadTime: 2.9, shellReload: true, shellTime: 0.42,
      maxAmmo: 64, startAmmo: 18,
      price: 2200, ammoPrice: 90,
      recoil: 0.11, shake: 0.45, tracer: false, zoom: 0.85,
      falloff: { start: 8, end: 26, min: 0.15 },
      knockback: 4, hold: 'rifle', flash: 1.5, sound: 'shotgun',
      desc: 'A pump-action 12 gauge. Inside eight metres nothing walks away from it.',
    },

    // ------------------------------------------------------------- rifle
    {
      id: 'rifle', name: 'Mantis AC-7', slot: 'rifle', kind: 'hitscan',
      damage: 36, headshotMult: 3, fireRate: 9, auto: true, range: 150,
      spread: 0.04, aimSpread: 0.006, bloom: 0.003, bloomMax: 0.025, bloomRecover: 0.3,
      magSize: 30, reloadTime: 2.1, maxAmmo: 360, startAmmo: 90,
      price: 4000, ammoPrice: 110,
      recoil: 0.024, shake: 0.1, tracer: true, zoom: 0.7,
      falloff: { start: 60, end: 150, min: 0.6 },
      hold: 'rifle', flash: 1.1, sound: 'rifle',
      desc: 'A short-barrelled assault carbine with a reflex sight. Accurate, hard hitting and easy to control.',
    },

    // ------------------------------------------------------------ sniper
    {
      id: 'sniper', name: 'Heron LR', slot: 'sniper', kind: 'hitscan',
      damage: 110, headshotMult: 4, fireRate: 0.8, range: 450,
      spread: 0.09, aimSpread: 0,
      magSize: 5, reloadTime: 2.9, maxAmmo: 50, startAmmo: 15,
      price: 7000, ammoPrice: 150,
      recoil: 0.14, shake: 0.3, tracer: true, zoom: 0.28,
      falloff: { start: 300, end: 450, min: 0.85 },
      knockback: 3, hold: 'rifle', flash: 1.3, sound: 'sniper',
      desc: 'A bolt-action long rifle with a 6x scope. Useless from the hip, merciless through the glass.',
    },

    // ------------------------------------------------------------ thrown
    {
      id: 'grenade', name: 'Frag Grenade', slot: 'thrown', kind: 'thrown',
      damage: 180, fireRate: 1, range: 40,
      magSize: 1, maxAmmo: 10, startAmmo: 3, price: 300, ammoPrice: 250,
      throwSpeed: 17, fuse: 3.2, blastRadius: 7, knockback: 12,
      hold: 'thrown', sound: 'thrown',
      desc: 'Pull the pin, count to three. Deadly within seven metres; cook it and it bounces less.',
    },
    {
      id: 'molotov', name: 'Molotov', slot: 'thrown', kind: 'thrown',
      damage: 20, fireRate: 1, range: 35,
      magSize: 1, maxAmmo: 10, startAmmo: 3, price: 250, ammoPrice: 200,
      throwSpeed: 15, fuse: 0, blastRadius: 3.5, fireDuration: 9, burnDps: 22,
      hold: 'thrown', sound: 'thrown',
      desc: 'A bottle of fuel and a burning rag. It bursts on impact and leaves a pool of fire.',
    },
  ];

  VH.Data.weapons = LIST.map((w) => Object.freeze(Object.assign({}, BASE, w)));

  const byId = {};
  for (const w of VH.Data.weapons) byId[w.id] = w;
  VH.Data.weaponsById = byId;

  /** Definition by id (undefined if unknown). */
  VH.Data.weapon = function weapon(id) {
    return byId[id];
  };

  /** The weapons that live in a slot, in cycle order. */
  VH.Data.weaponsInSlot = function weaponsInSlot(slotId) {
    return VH.Data.weapons.filter((w) => w.slot === slotId);
  };

  /**
   * Damage of one hit (one pellet) at `distance` metres, with range falloff
   * and the headshot multiplier applied.
   */
  VH.Data.weaponDamage = function weaponDamage(def, distance, headshot) {
    let d = def.damage;
    const f = def.falloff;
    if (f && distance > f.start) {
      const t = Math.min(1, (distance - f.start) / Math.max(0.001, f.end - f.start));
      d *= 1 + (f.min - 1) * t;
    }
    if (headshot) d *= def.headshotMult;
    return d;
  };
})();
