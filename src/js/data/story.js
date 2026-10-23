/*
 * data/story.js — the cast, places and factions of "Ten and Two", the
 * Vicehaven story. The missions themselves live in story-act1.js to
 * story-act4.js (main story and side chains) and story-extras.js
 * (activities, texts between jobs, radio). See docs/STORY_BIBLE.md for the
 * whole story and docs/mission-format.md for the data shape.
 */
(function () {
  'use strict';

  const VH = window.VH;
  VH.Data = VH.Data || {};

  const story = (VH.Data.story = VH.Data.story || {});
  story.title = 'Ten and Two';
  story.missions = story.missions || [];
  story.side = story.side || [];
  story.texts = story.texts || [];
  story.activities = story.activities || {};

  story.characters = {
    jay: { name: 'Jay Mercer', role: 'The wheelman', age: 27, look: { skin: 0xa86b4c, hair: 0x1b1512, top: 0x6b4a32, bottom: 0x2c3440, shoes: 0xe6e1d6, build: 'average' }, voice: { gender: 'male', pitch: 0.95, rate: 1.0 } },
    dex: { name: 'Dex Calloway', role: "Mechanic, Jay's oldest friend", age: 34, look: { skin: 0x8d5a3b, hair: 0x1a1410, top: 0x2f4f6f, bottom: 0x3a3a3a, shoes: 0x222222, build: 'heavy' }, voice: { gender: 'male', pitch: 0.85, rate: 0.95 } },
    mae: { name: 'Mae Reyes', role: "Paramedic, Tommy's sister, Jay's ex", age: 28, look: { skin: 0xc48a62, hair: 0x2a1a14, top: 0x2a3f6b, bottom: 0x1f2733, shoes: 0x111111, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.1, rate: 1.05 } },
    augie: { name: 'Augie Vance', role: "The planner, Jay's mentor", age: 58, look: { skin: 0xb07a55, hair: 0xb8b4ac, top: 0xe8dcc0, bottom: 0x5a4a3a, shoes: 0x3b2a1e, build: 'tall', longHair: false }, voice: { gender: 'male', pitch: 0.75, rate: 0.9 } },
    noor: { name: 'Noor Haddad', role: 'The eyes', age: 26, look: { skin: 0xc9a07a, hair: 0x14100e, top: 0x7a2f5a, bottom: 0x2a2a2a, shoes: 0xf0a030, build: 'slim', longHair: true, bag: true }, voice: { gender: 'female', pitch: 1.2, rate: 1.12 } },
    ansel: { name: 'Ansel Boateng', role: "The muscle who doesn't hit", age: 41, look: { skin: 0x4a2e22, hair: 0x111111, top: 0x3d6b3d, bottom: 0x4a4036, shoes: 0x2b2b2b, build: 'heavy' }, voice: { gender: 'male', pitch: 0.7, rate: 0.88 } },
    calder: { name: 'Ines Calder', role: 'Detective, VPD Robbery-Homicide', age: 46, look: { skin: 0xe0b899, hair: 0x7a5a3a, top: 0x8a8a7a, bottom: 0x2e2e36, shoes: 0x3a2a20, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 0.9, rate: 0.95 } },
    horne: { name: 'Wade Horne', role: 'Captain, VPD Southside', age: 52, look: { skin: 0xd9a88a, hair: 0xc8c0b0, top: 0x1c2a44, bottom: 0x1c2a44, shoes: 0x0e0e0e, build: 'heavy' }, voice: { gender: 'male', pitch: 0.8, rate: 0.92 } },
    voss: { name: 'Harlan Voss', role: 'Founder of Voss Meridian', age: 61, look: { skin: 0xf0cdb0, hair: 0xe8e4dc, top: 0xf5f5f0, bottom: 0xf5f5f0, shoes: 0x7a5230, build: 'tall' }, voice: { gender: 'male', pitch: 0.9, rate: 0.88 } },
    rourke: { name: 'Kessler Rourke', role: 'Director, Halberd Security', age: 45, look: { skin: 0xe8c4a8, hair: 0x3a2a1a, top: 0x3a3f45, bottom: 0x2a2e33, shoes: 0x111111, build: 'tall' }, voice: { gender: 'male', pitch: 0.85, rate: 1.0 } },
    teo: { name: 'Teo Vance', role: 'Leader of the Lantern Kings', age: 24, look: { skin: 0xb07a55, hair: 0x1a1410, top: 0xb3202a, bottom: 0x1a1a1a, shoes: 0xd4a017, build: 'slim' }, voice: { gender: 'male', pitch: 1.05, rate: 1.08 } },
    rhea: { name: 'Rhea Kostas', role: 'Boss of the Salts', age: 55, look: { skin: 0xd8b090, hair: 0x8a8a8a, top: 0xc4561d, bottom: 0x1d2b4a, shoes: 0x3a2a1a, build: 'heavy', longHair: true }, voice: { gender: 'female', pitch: 0.8, rate: 0.92 } },
    birdie: { name: 'Birdie Calloway', role: "Dex's daughter", age: 8, look: { skin: 0x8d5a3b, hair: 0x1a1410, top: 0xf7c6c7, bottom: 0x3a6b8f, shoes: 0xffffff, build: 'slim', height: 0.62 }, voice: { gender: 'female', pitch: 1.4, rate: 1.1 } },
    lourdes: { name: 'Lourdes Reyes', role: "Tommy and Mae's mother", age: 57, look: { skin: 0xc48a62, hair: 0x5a4a44, top: 0xe8a0a8, bottom: 0x4a4a5a, shoes: 0x6b4a3a, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 1.0, rate: 0.9 } },
    tommy: { name: 'Tommy Reyes', role: "Mae's little brother (memory)", age: 19, look: { skin: 0xc48a62, hair: 0x1a1410, top: 0xf2c14e, bottom: 0x3a4a5a, shoes: 0xd9d9d9, build: 'slim' }, voice: { gender: 'male', pitch: 1.15, rate: 1.1 } },
    nana_lu: { name: 'Nana Lu', role: "Jay's grandmother (memory)", age: 81, look: { skin: 0x8a5638, hair: 0xd8d4cc, top: 0xd98fb0, bottom: 0x4a3b5a, shoes: 0x6b4a3a, build: 'average' }, voice: { gender: 'female', pitch: 0.95, rate: 0.88 } },
    // Minor characters.
    ilunga: { name: 'Father Ilunga', role: "Priest at St. Brigid's", age: 66, look: { skin: 0x3e2418, hair: 0x9a9a9a, top: 0x141414, bottom: 0x141414, shoes: 0x111111, build: 'average' }, voice: { gender: 'male', pitch: 0.8, rate: 0.88 } },
    oyelaran: { name: 'Grace Oyelaran', role: "Nana Lu's neighbour", age: 74, look: { skin: 0x4e2c1c, hair: 0xc9c6c0, top: 0x2f7f86, bottom: 0x6b4a3a, shoes: 0x3a2a20, build: 'average', longHair: false, hat: true }, voice: { gender: 'female', pitch: 0.95, rate: 0.9 } },
    pruitt: { name: 'Delmar Pruitt', role: 'City councilman', age: 58, look: { skin: 0xf1c8a8, hair: 0x8a7a6a, top: 0xe9e1c8, bottom: 0xd7cdb8, shoes: 0x6b4a2e, build: 'heavy' }, voice: { gender: 'male', pitch: 1.0, rate: 1.05 } },
    garza: { name: 'Lucky Garza', role: 'Halberd field lieutenant', age: 33, look: { skin: 0xc68c64, hair: 0x16110d, top: 0x3a3f45, bottom: 0x2a2e33, shoes: 0x111111, build: 'average' }, voice: { gender: 'male', pitch: 1.05, rate: 1.1 } },
    dot: { name: 'Dot Pike', role: 'Night waitress at the Starlite', age: 70, look: { skin: 0xf1c8a8, hair: 0xd8b878, top: 0xf28aa8, bottom: 0xffffff, shoes: 0xefefef, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 1.05, rate: 0.95 } },
    wick: { name: 'Wick Adeyemi', role: 'Lantern Kings runner', age: 15, look: { skin: 0x4e2c1c, hair: 0x101010, top: 0xb3202a, bottom: 0x1c1c1f, shoes: 0xefefef, build: 'slim', height: 0.9 }, voice: { gender: 'male', pitch: 1.25, rate: 1.15 } },
    sami: { name: 'Sami Haddad', role: "Noor's father", age: 67, look: { skin: 0xc9a07a, hair: 0xc9c6c0, top: 0xe9e7e1, bottom: 0x3b4a66, shoes: 0x3a2a20, build: 'average' }, voice: { gender: 'male', pitch: 0.85, rate: 0.9 } },
    gus: { name: 'Gus Ferreira', role: "Mae's partner on Medic 12", age: 61, look: { skin: 0xd8a47e, hair: 0x8a8a8a, top: 0x2a3f6b, bottom: 0x1f2733, shoes: 0x111111, build: 'heavy' }, voice: { gender: 'male', pitch: 0.85, rate: 0.95 } },
    lefty: { name: 'Lefty Marchetti', role: 'Silver Fox', age: 71, look: { skin: 0xf1c8a8, hair: 0xe8e4dc, top: 0x7b6cd9, bottom: 0x2e3f5c, shoes: 0xefefef, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 0.95, rate: 1.0 } },
    walt: { name: 'Walt Pomeroy', role: 'Silver Fox', age: 78, look: { skin: 0xe0b08a, hair: 0xe8e4dc, top: 0xc7a17a, bottom: 0x6b6f4a, shoes: 0x6b4a2e, build: 'tall', hat: true }, voice: { gender: 'male', pitch: 0.8, rate: 0.85 } },
    duke: { name: 'Duke Fairweather', role: 'Silver Fox', age: 75, look: { skin: 0x6b3f28, hair: 0xc9c6c0, top: 0x2c7bb6, bottom: 0xe9e6de, shoes: 0xe9e6de, build: 'average' }, voice: { gender: 'male', pitch: 0.9, rate: 0.95 } },
    iggy: { name: 'Iggy Pell', role: 'Retired wedding chauffeur', age: 76, look: { skin: 0xd8a47e, hair: 0xe8e4dc, top: 0x141414, bottom: 0x141414, shoes: 0x111111, build: 'slim', hat: true }, voice: { gender: 'male', pitch: 0.9, rate: 0.9 } },
    tasha: { name: 'Tasha Pell', role: "Iggy's granddaughter", age: 27, look: { skin: 0xd8a47e, hair: 0x2a1d14, top: 0xffffff, bottom: 0xffffff, shoes: 0xe9e6de, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.15, rate: 1.05 } },
    marcus: { name: 'Marcus Idowu', role: "Tasha's groom", age: 29, look: { skin: 0x4e2c1c, hair: 0x101010, top: 0x1d2430, bottom: 0x1d2430, shoes: 0x111111, build: 'tall' }, voice: { gender: 'male', pitch: 0.95, rate: 1.0 } },
    solace: { name: 'Solace', role: 'Pirate DJ, Radio Free Vicehaven', age: 39, look: { skin: 0x6b3f28, hair: 0x5a1f14, top: 0x5a2f7a, bottom: 0x1c1c1f, shoes: 0xf0c05a, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 0.9, rate: 0.95 } },
    priya: { name: 'Priya Venkataraman', role: 'Council aide turned leaker', age: 31, look: { skin: 0x8a5638, hair: 0x101010, top: 0x33415c, bottom: 0x1c1c1f, shoes: 0x202020, build: 'slim', longHair: true, bag: true }, voice: { gender: 'female', pitch: 1.1, rate: 1.1 } },
    saff: { name: 'Saff Achterberg', role: "Pulse 96.4's sponsored racer", age: 23, look: { skin: 0xf1c8a8, hair: 0xd8b878, top: 0xff4f8b, bottom: 0x1c1c1f, shoes: 0xffffff, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.2, rate: 1.15 } },
    blackwood: { name: 'Honor Blackwood', role: 'Blackwood Bail Bonds', age: 50, look: { skin: 0xe0b08a, hair: 0x6e4a2c, top: 0x6b1f2a, bottom: 0x1c1c1f, shoes: 0x202020, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 0.95, rate: 1.0 } },
    hollis: { name: 'Hollis Crane', role: 'Crestline valet captain', age: 44, look: { skin: 0xc68c64, hair: 0x2a1d14, top: 0x7a1f2a, bottom: 0x141414, shoes: 0x111111, build: 'slim' }, voice: { gender: 'male', pitch: 1.0, rate: 1.05 } },
    otto: { name: 'Big Otto', role: 'Scrapyard owner', age: 60, look: { skin: 0xd8a47e, hair: 0x8a8a8a, top: 0x6b6f4a, bottom: 0x3b4a66, shoes: 0x3a2a20, build: 'heavy', hat: true }, voice: { gender: 'male', pitch: 0.7, rate: 0.9 } },
    fare: { name: 'Fare', role: 'Taxi passenger', look: { skin: 0xc68c64, hair: 0x2a1d14, top: 0x2c7bb6, bottom: 0x2e3f5c, shoes: 0xefefef, build: 'average' }, voice: { gender: 'male', pitch: 1.0, rate: 1.0 } },
    halberd_guard: { name: 'Halberd guard', role: 'Voss private security', look: { skin: 0xd8a47e, hair: 0x16110d, top: 0x3a3f45, bottom: 0x2a2e33, shoes: 0x111111, build: 'heavy', hat: true }, voice: { gender: 'male', pitch: 0.85, rate: 1.0 } },
    cop: { name: 'Officer', role: 'VPD patrol officer', look: { skin: 0xc68c64, hair: 0x16110d, top: 0x1c2a44, bottom: 0x1c2a44, shoes: 0x0e0e0e, build: 'average', hat: true }, voice: { gender: 'male', pitch: 0.95, rate: 1.05 } },
    radio_dj: { name: 'Radio', role: 'Radio host', look: { skin: 0xc68c64, hair: 0x16110d, top: 0x33415c, bottom: 0x1c1c1f, shoes: 0x202020, build: 'average' }, voice: { gender: 'male', pitch: 1.0, rate: 1.05 } },
  };

  story.factions = {
    halberd: { name: 'Halberd Security', colors: [0x3a3f45, 0x3a3f45, 0xe8e8e8, 0x1fa3a3], bottom: 0x2a2e33, caps: true },
    kings: { name: 'The Lantern Kings', colors: [0xb3202a, 0xd4a017, 0xb3202a], bottom: 0x1a1a1a, caps: false },
    salts: { name: 'The Saltmarsh Salts', colors: [0x1d2b4a, 0xc4561d], bottom: 0x1d2b4a, caps: true },
    vpd: { name: 'Vicehaven Police Department', colors: [0x1c2a44, 0xf2f2f2], bottom: 0x1c2a44, caps: true },
  };

  story.places = {
    dex_garage: { name: 'Calloway Auto', sign: 'CALLOWAY AUTO', district: 'oldmarket', kind: 'garage', desc: 'Calloway Auto: roll-up doors, a brand-new hydraulic lift that doesn\'t match the peeling paint, and a tired neon sign reading CALLOWAY AUTO with the second L dead.' },
    st_brigid_church: { name: 'St. Brigid of the Market', sign: 'ST. BRIGID', district: 'oldmarket', kind: 'church', desc: 'St. Brigid of the Market: a cracked bell tower, leaning headstones under bougainvillea, and the Vance family vault guarded by a stone angel with no nose.' },
    lantern_alley: { name: 'Lantern Alley', district: 'oldmarket', kind: 'alley', desc: 'The Lantern Kings\' alley: strings of red paper lanterns over dumpsters, a mural of a crowned lantern, and a noodle cart that never closes.' },
    tannery_row: { name: 'Tannery Row Market', sign: 'TANNERY ROW', district: 'oldmarket', kind: 'storefront', desc: 'Tannery Row market: striped awnings, fish on ice, knock-off sneakers, and a Voss Renewal notice stapled to every post.' },
    haddad_pharmacy: { name: 'Haddad Pharmacy', sign: 'HADDAD PHARMACY', district: 'oldmarket', kind: 'storefront', desc: 'The boarded-up Haddad Pharmacy, its green cross still hanging, with RENEWAL: COMING SOON pasted over the door.' },
    anchor_rooftops: { name: 'The Anchor Street rooftops', district: 'oldmarket', kind: 'rooftop', desc: 'Flat tar roofs over Anchor Street: water tanks, pigeon coops, satellite dishes, and gaps just narrow enough to jump.' },
    market_scrapyard: { name: 'Big Otto\'s Scrapyard', sign: 'BIG OTTO\'S SCRAP', district: 'oldmarket', kind: 'warehouse', desc: 'Big Otto\'s scrapyard: cars crushed and stacked four high, a magnet crane, and a guard dog called Duchess who is mostly retired.' },
    nana_lu_house: { name: 'Nana Lu\'s house', district: 'palmcrescent', kind: 'apartment_front', desc: 'Nana Lu\'s pink bungalow on Heron Street: feral bougainvillea, a porch swing that squeaks on the left, and a Pelican notice taped to the door.' },
    casa_palma: { name: 'Casa Palma', sign: 'CASA PALMA', district: 'palmcrescent', kind: 'apartment_front', desc: 'The Casa Palma apartments: a courtyard with a dry fountain, laundry on every balcony, and a three-storey mural of Tommy Reyes in his yellow hoodie.' },
    magnolia_motel: { name: 'Magnolia Motor Lodge', sign: 'MAGNOLIA MOTOR LODGE', district: 'palmcrescent', kind: 'motel', desc: 'The Magnolia Motor Lodge: $49 a night, a pool full of leaves, a sign that only says VACAN. Jay\'s in room 12. Nana Lu taught him to drive in this car park.' },
    laurel_park: { name: 'Laurel Park', district: 'palmcrescent', kind: 'park', desc: 'Laurel Park: a cracked basketball court, Ansel\'s community garden in raised beds, and a bench with a plaque for someone nobody remembers.' },
    mercy_general: { name: 'St. Agnes Mercy General', sign: 'MERCY GENERAL', district: 'palmcrescent', kind: 'hospital_front', desc: 'St. Agnes Mercy General: the ambulance bay where Medic 12 parks, a smokers\' bench, and a vending machine that eats coins.' },
    pelican_repo_yard: { name: 'Pelican repo yard', district: 'palmcrescent', kind: 'parking', desc: 'Pelican Home Equity\'s repo lot: chain-link, razor wire, floodlights, a guard hut, and whole lives stacked under tarps.' },
    heron_corner: { name: 'Heron & Coral', sign: 'LUCKY CORNER STORE', district: 'palmcrescent', kind: 'corner', desc: 'Heron and Coral: a corner store with a flickering lotto sign where every street race in the city has started since forever.' },
    pelican_bank: { name: 'Pelican Home Equity', sign: 'PELICAN HOME EQUITY', district: 'downtown', kind: 'bank', desc: 'Pelican Home Equity\'s flagship on Grand Avenue: a gold pelican logo, marble steps, and a banner reading YOUR HOME, OUR FUTURE.' },
    vpd_central: { name: 'VPD Central Precinct', sign: 'VICEHAVEN POLICE', district: 'downtown', kind: 'police_station_front', desc: 'VPD Central Precinct on Lantern Street: brutalist concrete, a crooked flagpole, a row of cruisers, and one bench for the families who wait.' },
    grand_parkade: { name: 'The Grand Parkade', sign: 'GRAND PARKADE', district: 'downtown', kind: 'parking', desc: 'The Grand Parkade: seven levels of spiral ramps and bad lighting. The roof is where people meet when they don\'t want to be seen.' },
    signal_office: { name: 'The signal relay rooftop', district: 'downtown', kind: 'rooftop', desc: 'The city\'s traffic-signal relay on an office rooftop: humming cabinets, antennas, and a Halberd guard who hates the night shift.' },
    goldline_exchange: { name: 'Goldline Bullion & Pawn', sign: 'GOLDLINE BULLION', district: 'downtown', kind: 'storefront', desc: 'Goldline Bullion and Pawn: gold lettering, a doorman in a waistcoat, and an evening cash drop at 21:15 sharp.' },
    last_resort_bar: { name: 'The Last Resort', sign: 'THE LAST RESORT', district: 'harborpoint', kind: 'bar', desc: 'The Last Resort: the pink-neon patio bar of the faded Hotel Paloma, where the crew plans jobs under a neon flamingo that buzzes like a wasp.' },
    starlite_diner: { name: 'The Starlite Diner', sign: 'STARLITE DINER', district: 'harborpoint', kind: 'diner', desc: 'The Starlite Diner: chrome, a sputtering star on the roof, open 24 hours, and a window booth where Jay and Mae carved J+M.' },
    seawall_overlook: { name: 'The seawall overlook', district: 'harborpoint', kind: 'overlook', desc: 'The seawall bend at the end of Pelican Avenue, where the skyline reflects in the bay like a circuit board. Calder\'s favourite place not to be seen.' },
    harbor_beach: { name: 'Harbor Beach', district: 'harborpoint', kind: 'beach', desc: 'The strip of sand under the seawall: driftwood, bonfire rings, kids with speakers, and the pier lights out on the water.' },
    bayview_gardens: { name: 'Bayview Gardens', sign: 'BAYVIEW GARDENS', district: 'harborpoint', kind: 'apartment_front', desc: 'Bayview Gardens retirement residences: a pastel courtyard, shuffleboard, and a Pelican "Golden Years Equity" banner. Home of the Silver Foxes.' },
    tidewater_lot: { name: 'The Tidewater lot, Pier 9', district: 'saltmarsh_docks', kind: 'parking', desc: 'The Tidewater Security transfer yard at Pier 9: floodlights, a chain-link gate, a guard booth, and bay 14, where the paint is newer than the rest.' },
    kostas_salvage: { name: 'Kostas Marine Salvage', sign: 'KOSTAS SALVAGE', district: 'saltmarsh_docks', kind: 'warehouse', desc: 'Kostas Marine Salvage: a rust-orange warehouse full of ship parts with its doors rolled open. Rhea runs the Salts from a pallet desk. The crew\'s base in Act 4.' },
    crane_row: { name: 'Crane Row', district: 'saltmarsh_docks', kind: 'dock', desc: 'Crane Row: container stacks in five colours, gantry cranes on rails, and walkways forty metres up.' },
    halberd_depot: { name: 'Halberd docks depot', sign: 'HALBERD SECURITY', district: 'saltmarsh_docks', kind: 'warehouse', desc: 'Halberd\'s docks depot: grey hangars, a motor pool of armoured vans, a teal halberd logo, and cameras everywhere.' },
    drydock_slip: { name: 'The old drydock slip', district: 'saltmarsh_docks', kind: 'construction', desc: 'The old shipyard slip: a half-built hull on blocks, scaffolding, and welders\' sparks falling like slow rain.' },
    voss_estate: { name: 'Belvedere, the Voss estate', district: 'crestline_estates', kind: 'mansion', desc: 'Belvedere, Voss\'s estate: white columns, an infinity pool over the whole city, topiary lions, and a motor court.' },
    pruitt_house: { name: 'Councilman Pruitt\'s villa', district: 'crestline_estates', kind: 'mansion', desc: 'Councilman Pruitt\'s Spanish-revival villa: Sunday pool parties, a valet stand, and a bronze statue of his own dog.' },
    crestline_overlook: { name: 'The Crestline overlook', district: 'crestline_estates', kind: 'overlook', desc: 'The lookout on Crestline Drive where the estates end and the city lies below, bright as spilled change.' },
    horne_house: { name: 'Captain Horne\'s house', district: 'crestline_estates', kind: 'mansion', desc: 'Captain Horne\'s too-nice house at the edge of Crestline: a flagpole, a boat on a trailer he never takes out, and a cruiser in the drive.' },
  };
})();
