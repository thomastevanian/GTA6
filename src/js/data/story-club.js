/*
 * story-club.js — The Velvet Tide: a side story at the boardwalk dance club.
 *
 * Mars Okonjo has run the Velvet Tide for eleven years on borrowed money and
 * stubbornness. Halberd wants a cut "for security". Three jobs: throw out the
 * collectors, get the DJ's records back, and hold the club on closing night.
 * Finishing it opens the VIP balcony (club.js checks vt3_last_call).
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  Object.assign(S.characters, {
    mars: { name: 'Marisol "Mars" Okonjo', role: 'Owner of the Velvet Tide', age: 44, look: { skin: 0x5a3422, hair: 0x1a1210, top: 0x7a1f4a, bottom: 0x1c1c22, shoes: 0x111111, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 0.95, rate: 1.0 } },
    lowtide: { name: 'Kip "Lowtide" Abernathy', role: 'The Velvet Tide\'s resident DJ', age: 26, look: { skin: 0xe0b08a, hair: 0x2a6a8a, top: 0x1f6b6b, bottom: 0x22222a, shoes: 0xf0f0f0, build: 'slim', hat: true }, voice: { gender: 'male', pitch: 1.05, rate: 1.1 } },
    tuli: { name: 'Tuli Fa\'alogo', role: 'On the door at the Velvet Tide', age: 38, look: { skin: 0x8a5a3c, hair: 0x111111, top: 0x111114, bottom: 0x111114, shoes: 0x0a0a0a, build: 'heavy' }, voice: { gender: 'male', pitch: 0.8, rate: 0.9 } },
  });

  const vinylVan = { spawnCar: 'vinyl_van', type: 'porter', at: 'the_boardwalk', color: 0x3a3f45, name: 'the Halberd van' };

  const missions = [
    // =================================================================
    // vt1 — Doors at Ten
    // =================================================================
    {
      id: 'vt1_doors_at_ten',
      title: 'Doors at Ten',
      giver: 'mars',
      start: 'velvet_tide',
      time: 22,
      estMinutes: 5,
      summary: 'Halberd\'s "community liaisons" have started collecting at the door of the Velvet Tide. Mars would like them to stop.',
      reward: { money: 1500 },
      steps: [
        { music: 'off' },
        { scene: { at: 'velvet_tide', cast: ['tuli', 'mars'] }, say: [
          ['caption', '(The boardwalk at ten. A queue behind a velvet rope, a bass line coming through the wall like a heartbeat, and a very large man on the door.)'],
          ['tuli', '(not moving) Name.'],
          ['jay', 'Jay.'],
          ['tuli', '(a long look, then a nod) Mars said you\'d be the one who looks like he hasn\'t slept.'],
          ['mars', '(arriving from inside, clipboard, earpiece, no patience left) That\'s him. Jay. Thank you for coming. I\'ll be quick, because in about four minutes I\'m going to lose my temper.'],
          ['mars', 'Three of Halberd\'s boys walked in an hour ago. "Community liaisons". They want twenty percent of the door, to keep the Velvet Tide safe. Safe from them, I assume.'],
          ['jay', 'Did you say no?'],
          ['mars', 'I said a word Tuli asked me not to use in front of the queue. Now they\'re on my dance floor, scaring off the kids and holding baseball bats like they\'re accessories.'],
          ['tuli', 'I can\'t touch them. I touch them, Halberd closes us for "a licensing review".'],
          ['mars', 'You, on the other hand, don\'t work here. Throw them out. Gently or otherwise. Mind the speakers.'],
        ] },
        { spawn: [{ id: 'collector', faction: 'halberd', at: 'velvet_tide_floor', count: 3, weapon: 'bat', behavior: 'attack', group: 'collectors' }] },
        { kill: 'group:collectors', objective: 'Throw Halberd\'s collectors out of the Velvet Tide', say: [
          ['caption', '(The DJ, very sensibly, ducks behind the decks. The music keeps going.)'],
          ['jay', '(cracking his knuckles) Twenty percent. Of a juice bar.'],
        ] },
        // Mars and Tuli come in off the door; everyone on the floor together.
        { fade: 'out' },
        { spawn: [{ char: 'mars', at: 'velvet_tide_floor', offset: [-1.5, 1] }, { char: 'tuli', at: 'velvet_tide_floor', offset: [-1.5, -1] }] },
        { teleport: 'velvet_tide_floor' },
        { fade: 'in' },
        { scene: { at: 'velvet_tide_floor', cast: ['mars', 'tuli'] }, say: [
          ['caption', '(The floor is empty. One of the light-up tiles is cracked and flickering in a way Mars clearly takes personally.)'],
          ['mars', 'Well. That\'s my "safe" taken care of.'],
          ['tuli', '(looking at the tile) I\'ll get the tape.'],
          ['mars', 'They\'ll be back, you know. Not those three. Smaller ones with bigger friends.'],
          ['jay', 'Then call me when the friends come.'],
          ['mars', '(the first smile of the night) Eleven years I\'ve kept this place open. You\'re the first person who\'s offered to help without asking for a cut. It\'s unsettling. Have a Tide Fizz. On the house.'],
        ] },
      ],
    },

    // =================================================================
    // vt2 — Bad Vinyl
    // =================================================================
    {
      id: 'vt2_bad_vinyl',
      title: 'Bad Vinyl',
      giver: 'mars',
      start: 'velvet_tide',
      time: 23.5,
      estMinutes: 6,
      summary: 'Someone loaded the Velvet Tide\'s record collection into a Halberd van. Lowtide would like it back before he cries in public.',
      reward: { money: 2000 },
      failIf: ['wrecked:vinyl_van'],
      steps: [
        { music: 'off' },
        { scene: { at: 'velvet_tide', cast: ['lowtide', 'mars'] }, say: [
          ['lowtide', '(sitting on the kerb with his head in his hands) They took the crates. All of them. The originals. The test pressings. The one with the coffee ring that I tell people is a coffee ring but is actually soup.'],
          ['mars', 'Kip, breathe.'],
          ['lowtide', 'I can\'t breathe, Mars, my entire personality is in the back of a van.'],
          ['mars', '(to Jay) Halberd. A grey van, ten minutes ago, heading up Seawall Drive. They know a club without music is just an expensive room.'],
          ['jay', 'What does a record collection weigh?'],
          ['lowtide', '(offended) About as much as a small car and a lifetime of bad decisions.'],
          ['mars', 'Get them back in one piece. The van and the records. If you scratch a single one, Kip will tell you about it for the rest of your life.'],
          ['lowtide', 'I will. I\'ll find you.'],
        ] },
        vinylVan,
        { chase: 'vinyl_van', mode: 'catch', objective: 'Catch the van with Lowtide\'s records. Box it in, don\'t wreck it.', say: [
          ['lowtide', '(on the phone) Is it you? Are you behind them? Can you hear the records? They\'re not stacked properly, I can feel it.'],
          ['jay', 'Kip, I\'m driving.'],
          ['lowtide', 'Drive SMOOTHER.'],
        ] },
        { getIn: 'vinyl_van', objective: 'Get in the van', say: [
          ['caption', '(The back of the van: crate after crate of records, strapped in more carefully than the driver was.)'],
        ] },
        { deliver: 'vinyl_van', to: 'velvet_tide', maxDamage: 0.9, objective: 'Bring the records back to the Velvet Tide. Gently.', say: [
          ['jay', '(to the crates, over a speed bump) Sorry. Sorry. Sorry.'],
        ] },
        { scene: { at: 'velvet_tide', cast: ['lowtide', 'mars'] }, say: [
          ['caption', '(Lowtide opens the van doors like a man meeting a new-born baby.)'],
          ['lowtide', '(whispering) Hello. Hello, my darlings. Who\'s been in a van? You have. Yes you have.'],
          ['mars', 'He does this. You get used to it.'],
          ['lowtide', '(pulling out one sleeve, holding it up to the neon) Jay. This one\'s going on first tonight. And when it drops, everybody in that room is going to feel like they were born for it, and they\'ll never know it was because of you.'],
          ['jay', 'That\'s fine.'],
          ['lowtide', 'That\'s the job, man. That\'s the whole job.'],
        ] },
      ],
    },

    // =================================================================
    // vt3 — Last Call
    // =================================================================
    {
      id: 'vt3_last_call',
      title: 'Last Call',
      giver: 'mars',
      start: 'velvet_tide',
      time: 2,
      estMinutes: 6,
      summary: 'Closing night of the season. Halberd has sent a crew to make sure it\'s the last one. Mars isn\'t leaving, so neither are you.',
      reward: { money: 3000 },
      steps: [
        { music: 'off' },
        { fade: 'out' },
        { teleport: 'velvet_tide_floor' },
        { fade: 'in' },
        { scene: { at: 'velvet_tide_floor', cast: ['mars', 'lowtide', 'tuli'] }, say: [
          ['caption', '(Two in the morning. The last of the crowd heading home along the boardwalk, shoes in their hands. Tuli is stacking stools. He stops.)'],
          ['tuli', 'Cars. Three of them. Charcoal.'],
          ['mars', '(very calm, which is worse) Halberd. Of course. Closing night. They want the season to end with a story about how the Velvet Tide burned down.'],
          ['lowtide', 'We could leave? Leaving is an option. I\'m just putting it out there.'],
          ['mars', 'I have been on this boardwalk for eleven years, Kip. My mother sold ice cream on this boardwalk. I\'m not leaving because some men in matching jackets are bored.'],
          ['jay', 'Get behind the bar. Both of you. Tuli, the door.'],
          ['tuli', '(rolling his shoulders) Finally.'],
          ['mars', 'Jay. (beat) Thank you. Now go and be unpleasant to them.'],
        ] },
        { spawn: [{ char: 'mars', at: 'velvet_tide_bar', behavior: 'cower', health: 300 }, { char: 'lowtide', at: 'velvet_tide_bar', offset: [2, 0], behavior: 'cower', health: 300 }] },
        { protect: 'mars' },
        { music: 'action' },
        { survive: 75, objective: 'Hold the Velvet Tide until Halberd gives up. Keep Mars safe.', waves: [
          { at: 'velvet_tide', count: 3, weapon: 'bat', faction: 'halberd', delay: 2 },
          { at: 'velvet_tide', count: 3, weapon: 'pistol', faction: 'halberd', delay: 22 },
          { at: 'velvet_tide', count: 3, weapon: 'pistol', faction: 'halberd', delay: 42 },
          { at: 'velvet_tide', count: 2, weapon: 'smg', faction: 'halberd', delay: 58 },
        ], say: [
          ['lowtide', '(from behind the bar) Is now a bad time to put a record on? I feel like this needs a soundtrack.'],
          ['mars', 'Kip, if you stand up I will kill you myself.'],
        ] },
        { music: 'triumph' },
        // Out from behind the bar (fresh copies, no longer cowering).
        { spawn: [{ char: 'mars', at: 'velvet_tide_bar', health: 300 }, { char: 'lowtide', at: 'velvet_tide_bar', offset: [2, 0], health: 300 }] },
        { scene: { at: 'velvet_tide_floor', cast: ['mars', 'lowtide', 'tuli'] }, say: [
          ['caption', '(Quiet. Somewhere out on the bay, a boat horn. The dance floor tiles keep cycling through their colours for nobody.)'],
          ['tuli', '(at the door, slightly out of breath) They\'re gone. One of them left a shoe.'],
          ['mars', '(standing up from behind the bar, straightening her jacket) Good. He can come back for it when he\'s learned some manners.'],
          ['lowtide', '(already at the decks) One more. For the road. Everybody\'s allowed one more.'],
          ['caption', '(The opening bars of the record Jay brought back fill the empty club.)'],
          ['mars', '(pressing a black card with a gold wave on it into Jay\'s hand) You\'re on the list now. The balcony, the good sofas, the drinks that come with little umbrellas. Whenever you want.'],
          ['jay', 'I don\'t really go to clubs.'],
          ['mars', 'Nobody really goes to clubs, Jay. They come for the music and stay because somebody kept the doors open. (beat) Go on. Dance. I won\'t tell anyone.'],
        ] },
      ],
    },
  ];

  S.side.push({
    id: 'side_velvet',
    title: 'The Velvet Tide',
    giver: 'mars',
    unlockAfter: 'm05_the_toolbox',
    missions,
  });
})();
