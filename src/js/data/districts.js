/*
 * data/districts.js — the districts of the Phase 1 test city, as data.
 *
 * Each district is a rectangle on the map (x: west→east, z: north→south,
 * -Z is north) plus the rules its buildings are generated from. Adding a
 * district, or tuning how one looks, is an edit here, not in the generator.
 *
 * Building archetypes (see buildings.js):
 *   tower     glass skyscraper on a podium, optional setbacks and crown
 *   office    mid-rise with punched or ribbon windows and a cornice
 *   shophouse low-rise with shopfronts, awnings and rooftop clutter
 *   apartment residential block with balconies
 *   hotel     tall pastel slab with vertical fins and a rooftop sign frame
 *   villa     two-storey house with a pitched roof and a garden wall
 */
(function () {
  'use strict';

  const VH = window.VH;
  VH.Data = VH.Data || {};

  VH.Data.districts = [
    {
      id: 'downtown',
      name: 'Downtown',
      tagline: 'Grand Avenue',
      rect: { minX: -200, maxX: 200, minZ: -392, maxZ: 105 },
      lot: { min: 22, max: 40 },
      alleyChance: 0.35,
      emptyLotChance: 0.04,
      archetypes: [
        { type: 'tower', weight: 6, floors: [16, 44] },
        { type: 'office', weight: 3, floors: [7, 15] },
        { type: 'hotel', weight: 1, floors: [12, 22] },
      ],
      // Taller towards the centre of downtown.
      heightFocus: { x: 20, z: -170, radius: 260, boost: 1.0 },
      palette: {
        walls: [0xb9bcc1, 0x98a1ab, 0x7e8896, 0xcdc4b3, 0x5f6b7a, 0xaab2bb, 0x8a9098, 0xc2b49c, 0x4d5866],
        roofs: [0x6b6e72, 0x5c5f63, 0x74777a],
        accents: [0x2d3440, 0xe8e2d6, 0x445566],
      },
      ambient: { crowd: 'business', traffic: 'heavy' },
    },
    {
      id: 'oldmarket',
      name: 'Old Market',
      tagline: 'Brick, bargains and back alleys',
      rect: { minX: -392, maxX: -200, minZ: -392, maxZ: 105 },
      lot: { min: 14, max: 24 },
      alleyChance: 0.8,
      emptyLotChance: 0.1,
      archetypes: [
        { type: 'shophouse', weight: 6, floors: [2, 5] },
        { type: 'office', weight: 1, floors: [4, 7] },
        { type: 'apartment', weight: 2, floors: [4, 7] },
      ],
      palette: {
        walls: [0x8a4b3a, 0x9c5a44, 0x7a3f33, 0xa8704f, 0xb88a62, 0x6e3b30, 0xc49a74, 0x8f6a52],
        roofs: [0x4f4a45, 0x5a524a, 0x3f3b38],
        accents: [0xe7dcc8, 0x2f5d50, 0x7a2f2a, 0x2b4a6b, 0xc9a227],
      },
      ambient: { crowd: 'market', traffic: 'medium' },
    },
    {
      id: 'palmcrescent',
      name: 'Palm Crescent',
      tagline: 'Quiet streets, loud money',
      rect: { minX: -392, maxX: 200, minZ: -9, maxZ: 392 },
      lot: { min: 18, max: 30 },
      alleyChance: 0.1,
      emptyLotChance: 0.06,
      archetypes: [
        { type: 'apartment', weight: 5, floors: [3, 9] },
        { type: 'villa', weight: 3, floors: [2, 2] },
        { type: 'office', weight: 1, floors: [3, 6] },
      ],
      palette: {
        walls: [0xf2e6d0, 0xf4d9c6, 0xe6efe9, 0xf1e3b3, 0xd9e8f0, 0xf6d4d2, 0xe8e0d0, 0xcfe3d4],
        roofs: [0xa4553c, 0x9a4e37, 0x7a6a5a, 0xb86446],
        accents: [0xffffff, 0x2f7f86, 0xd8795e, 0x3d6b8f],
      },
      ambient: { crowd: 'residential', traffic: 'light' },
    },
    {
      id: 'harborpoint',
      name: 'Harbor Point',
      tagline: 'Where the boardwalk meets the bay',
      rect: { minX: 200, maxX: 470, minZ: -392, maxZ: 392 },
      lot: { min: 20, max: 34 },
      alleyChance: 0.15,
      emptyLotChance: 0.12,
      archetypes: [
        { type: 'hotel', weight: 5, floors: [6, 18] },
        { type: 'apartment', weight: 2, floors: [5, 12] },
        { type: 'shophouse', weight: 2, floors: [2, 3] },
      ],
      palette: {
        walls: [0xf7c6c7, 0xa8e0d8, 0xf9e2a6, 0xc9d8f5, 0xf5f0e6, 0xffd3b0, 0xb9ead6, 0xe9c9f0],
        roofs: [0x8a8f94, 0x9a9da0],
        accents: [0xffffff, 0x1f8a8a, 0xff6f91, 0xf0a030],
      },
      ambient: { crowd: 'tourist', traffic: 'medium' },
    },
    {
      id: 'saltmarsh',
      name: 'Saltmarsh Docks',
      tagline: 'Cranes, containers and closed mouths',
      rect: { minX: -12, maxX: 470, minZ: 392, maxZ: 640 },
      lot: { min: 30, max: 60 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0x8a8f96], roofs: [0x5a5f66], accents: [0xe06a1a] },
      ambient: { crowd: 'none', traffic: 'industrial' },
    },
    {
      id: 'crestline',
      name: 'Crestline Estates',
      tagline: 'Gates, lawns and very old money',
      rect: { minX: -640, maxX: -392, minZ: -392, maxZ: 392 },
      lot: { min: 40, max: 70 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0xf4f1ea], roofs: [0x7a6a5a], accents: [0x2f7f86] },
      ambient: { crowd: 'none', traffic: 'light' },
    },
    // Beyond the old city limits: the new skyline north of downtown, the
    // airport out past it, and the army base west along Meridian Boulevard.
    {
      id: 'northgate',
      name: 'Northgate Heights',
      tagline: 'Glass, steel and somebody else\'s money',
      rect: { minX: -100, maxX: 300, minZ: -660, maxZ: -392.01 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0x9aa6b4], roofs: [0x6b6e72], accents: [0x2d3440] },
      ambient: { crowd: 'business', traffic: 'heavy' },
    },
    {
      id: 'airport',
      name: 'Vicehaven International',
      tagline: 'Departures, arrivals, and a fence you can climb',
      rect: { minX: -1110, maxX: 400, minZ: -1600, maxZ: -1100 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0xdfe3e6], roofs: [0x777777], accents: [0x1fa3a3] },
      ambient: { crowd: 'none', traffic: 'light' },
    },
    {
      id: 'fort',
      name: 'Fort Breakwater',
      tagline: 'Restricted area. They mean it',
      rect: { minX: -1540, maxX: -1090, minZ: -430, maxZ: 430 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0x6b6f4a], roofs: [0x4a4d3a], accents: [0xd8c070] },
      ambient: { crowd: 'none', traffic: 'none' },
    },
    // The roadside strips on the roads out of town (suburbs.js).
    {
      id: 'northroad',
      name: 'Grand Avenue North',
      tagline: 'Motels, diners and the last exit before departures',
      rect: { minX: -60, maxX: 60, minZ: -1095, maxZ: -655.01 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0xf7c6c7], roofs: [0x8a8f94], accents: [0x1f8a8a] },
      ambient: { crowd: 'light', traffic: 'heavy' },
    },
    {
      id: 'meridianwest',
      name: 'Meridian West',
      tagline: 'Yards, workshops and the long road to the fort',
      rect: { minX: -1078, maxX: -640.01, minZ: -55, maxZ: 55 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0x8a8f96], roofs: [0x5a5f66], accents: [0xe06a1a] },
      ambient: { crowd: 'light', traffic: 'medium' },
    },
    {
      id: 'westbrook',
      name: 'Westbrook',
      tagline: 'Bungalows, bodegas and a long way from the beach',
      rect: { minX: -1078, maxX: -640.01, minZ: -340, maxZ: 340 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0xf2e6d0], roofs: [0xa4553c], accents: [0x2f7f86] },
      ambient: { crowd: 'light', traffic: 'medium' },
    },
    {
      id: 'outskirts',
      name: 'Vicehaven Outskirts',
      tagline: 'Where the city runs out of ideas',
      rect: { minX: -2000, maxX: 470, minZ: -2000, maxZ: 2000 },
      lot: { min: 30, max: 60 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0xcccccc], roofs: [0x777777], accents: [0xffffff] },
      ambient: { crowd: 'none', traffic: 'light' },
    },
    {
      id: 'bay',
      name: 'Vicehaven Bay',
      tagline: 'Open water',
      rect: { minX: 470, maxX: 4000, minZ: -4000, maxZ: 4000 },
      lot: { min: 0, max: 0 },
      alleyChance: 0,
      emptyLotChance: 1,
      archetypes: [],
      palette: { walls: [0xcccccc], roofs: [0x777777], accents: [0xffffff] },
      ambient: { crowd: 'none', traffic: 'none' },
    },
  ];

  /**
   * Street names. Avenues run north–south (constant x), streets run
   * east–west (constant z). Keys are the grid line coordinate.
   */
  VH.Data.streetNames = {
    avenues: {
      '-384': 'Cypress Parkway',
      '-288': 'Tannery Avenue',
      '-192': 'Market Avenue',
      '-96': 'Coral Avenue',
      '0': 'Grand Avenue',
      '96': 'Bayshore Avenue',
      '192': 'Flamingo Avenue',
      '288': 'Pelican Avenue',
      '384': 'Seawall Drive',
    },
    streets: {
      '-384': 'Northgate Street',
      '-288': 'Anchor Street',
      '-192': 'Palisade Street',
      '-96': 'Lantern Street',
      '0': 'Meridian Boulevard',
      '96': 'Laurel Street',
      '192': 'Magnolia Street',
      '288': 'Heron Street',
      '384': 'Southshore Boulevard',
    },
  };

  /** Named places. The city generator builds these on the listed blocks. */
  VH.Data.landmarks = [
    { id: 'civic_plaza', name: 'Civic Plaza', block: [3, 4], kind: 'plaza' },
    { id: 'meridian_yard', name: 'Meridian Yard', block: [2, 4], kind: 'construction' },
    { id: 'founders_park', name: 'Founders Park', block: [1, 5], kind: 'park' },
    { id: 'vicehaven_tower', name: 'Vicehaven Tower', block: [4, 2], kind: 'tower' },
    { id: 'oceanview_pier', name: 'Oceanview Pier', kind: 'pier', x: 420, z: 0 },
    // The big places outside the old grid get a badge on the map and a "go"
    // point the GPS can reach by road (major: true; gx, gz).
    { id: 'northgate_heights', name: 'Northgate Heights', kind: 'skyline', x: 100, z: -520, major: true, short: 'Skyscrapers', gx: 22, gz: -498 },
    { id: 'vicehaven_international', name: 'Vicehaven International', kind: 'airport', x: -255, z: -1222, major: true, short: 'Airport', gx: -255, gz: -1190 },
    { id: 'fort_breakwater', name: 'Fort Breakwater', kind: 'fort', x: -1300, z: 0, major: true, short: 'Army base', gx: -1092, gz: 0 },
  ];
})();
