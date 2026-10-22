/*
 * data/story-act4.js — ACT 4: TIDEWATER (m25 to m31, the finale and all
 * three endings) and side chain 3, Dead Air (da1 to da4), for "Ten and Two".
 * See docs/STORY_BIBLE.md, sections 7 to 10, and docs/mission-format.md.
 *
 * The finale runs over one night: m28 (the gala) chains into m29 (the hit),
 * m30 (the siege, the crane, bay 14) and m31 (the pier at dawn, the choice,
 * the epilogues). Every chained mission ends with the heat at zero, or the
 * next one could not start.
 */
(function () {
  'use strict';
  const S = window.VH.Data.story; // created by story.js (loaded first)

  // ------------------------------------------------------------ colours
  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const RUST = 0xc4561d;
  const MUSTARD = 0xc9a227;
  const PEARL = 0xf5f5f0;
  const CALDER_GREEN = 0x2f4a3a;

  // ------------------------------------------------------------ helpers
  /** Nana Lu's car, Jay's car for the whole game. */
  const lulu = (at, extra) => Object.assign({ spawnCar: 'lulu', type: 'lowrider', at, color: LULU_TEAL }, extra || {});
  /** A charcoal Halberd patrol Ironclad. */
  const halberdSuv = (id, at, extra) => Object.assign({ spawnCar: id, type: 'ironclad', at, color: HALBERD }, extra || {});
  /** A Halberd armoured van (a Bulwark), charcoal with the teal stripe. */
  const halberdVan = (id, at, extra) => Object.assign({ spawnCar: id, type: 'bulwark', at, color: HALBERD }, extra || {});
  /** Somebody behind the wheel of a spawned car, driving to a place. */
  const driver = (id, car, at, to, faction) => ({ id, faction: faction || 'halberd', hostile: false, at, behavior: 'drive', car, to });

  // Two spots the finale needs that no place id covers: the stretch of
  // Southshore Boulevard (z = 384) between Flamingo and Pelican where the
  // convoy is hit, and the north end of Cypress Parkway (x = -384), where
  // the city runs out.
  const SOUTHSHORE = { name: 'Southshore Boulevard', x: 240, z: 384, yaw: Math.PI / 2 };
  const CITY_LIMITS = { name: 'Cypress Parkway, northbound', x: -384, z: -360, yaw: Math.PI };
  // Crestline Drive (x = -510), ninety metres north of Belvedere's gate
  // (z = -145): where Jay waits for the convoy, so it pulls away from him.
  const CRESTLINE_WAIT = { name: 'Crestline Drive, north of Belvedere', x: -507, z: -235, yaw: 0.01 };

  // ---------------------------------------------- extra minor characters
  Object.assign(S.characters, {
    horne_robe: {
      name: 'Wade Horne', role: 'Captain, VPD Southside (at two in the morning)', age: 52,
      look: { skin: 0xd9a88a, hair: 0xc8c0b0, top: 0xeae6dc, bottom: 0xeae6dc, shoes: 0x7a5a44, build: 'heavy' },
      voice: { gender: 'male', pitch: 0.8, rate: 0.92 },
      bio: 'Horne at home: a white bathrobe monogrammed W.H., corduroy slippers, the gold watch, and a pump shotgun.',
    },
    lina: {
      name: 'Lina Solano', role: "Reggie Solano's daughter", age: 21,
      look: { skin: 0x6b3f28, hair: 0x14100e, top: 0x78b8e8, bottom: 0x2e3f5c, shoes: 0xefefef, build: 'slim', longHair: true, bag: true },
      voice: { gender: 'female', pitch: 1.15, rate: 1.05 },
      bio: 'Marine biology, third year. Believes a scholarship fund has been paying her rent since she was fifteen.',
    },
    lister: {
      name: 'Corinne Lister', role: 'Chief executive, Halberd Security', age: 49,
      look: { skin: 0xf1d0b0, hair: 0x2a1d14, top: 0x2a2e33, bottom: 0x2a2e33, shoes: 0x111111, build: 'slim', longHair: true },
      voice: { gender: 'female', pitch: 0.95, rate: 1.0 },
      bio: "Rourke's replacement. Shakes hands like she is signing something.",
    },
    mulgrew: {
      name: 'Captain Dale Mulgrew', role: 'VPD Southside (new)', age: 41,
      look: { skin: 0xe8c4a8, hair: 0x8a6a4a, top: 0x1c2a44, bottom: 0x1c2a44, shoes: 0x0e0e0e, build: 'average', hat: true },
      voice: { gender: 'male', pitch: 0.9, rate: 1.0 },
      bio: "Southside's new captain. Bought himself a gold watch the week he got the job.",
    },
    fisk: {
      name: 'Ogden Fisk', role: 'Halberd signals contractor', age: 44,
      look: { skin: 0xe0b08a, hair: 0x6e4a2c, top: 0x3a3f45, bottom: 0x2a2e33, shoes: 0x111111, build: 'heavy', hat: true },
      voice: { gender: 'male', pitch: 1.05, rate: 1.0 },
      bio: 'Hunts pirate transmitters for Halberd. Listens to Radio Free Vicehaven every night, strictly for work.',
    },
    hattie: {
      name: 'Hattie Brand', role: 'Night editor, the Vicehaven Ledger', age: 63,
      look: { skin: 0xf1c8a8, hair: 0xd8d4cc, top: 0x6b1f2a, bottom: 0x1c1c1f, shoes: 0x3a2a20, build: 'slim', longHair: true },
      voice: { gender: 'female', pitch: 0.9, rate: 1.05 },
      bio: 'Forty years on the night desk. Has never once been surprised, and would like it noted.',
    },
  });

  const act4 = [];

  // ===================================================================
  // m25 IRON
  // ===================================================================
  act4.push({
    id: 'm25_iron',
    act: 4,
    title: 'Iron',
    giver: 'rhea',
    start: 'kostas_salvage',
    time: 15,
    estMinutes: 10,
    summary: "Rhea's containers have a price: Halberd's checkpoint on Crane Row.",
    reward: { money: 8000, weapons: ['grenade'], armor: 100 },
    steps: [
      { music: 'off' },
      lulu('kostas_salvage'),
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'kostya', 'deb'] }, say: [
        ['caption', '(Kostas Marine Salvage at three in the afternoon. The doors are rolled up on a cathedral of rust: anchors, propellers taller than a man, a lifeboat full of pigeons.)'],
        ['caption', "(Since Calloway Auto burned, this is the crew's kitchen, office and church. On Rhea's pallet desk, open at the last page, a battered notebook in Augie Vance's handwriting.)"],
        ['rhea', '(not looking up from her ledger, a pencil behind her ear) Augie used to come in here with a bottle and a speech. Twenty minutes of speech. The bottle was the apology for the speech.'],
        ['jay', "I didn't bring a bottle."],
        ['rhea', 'I can see that. (She turns his list round with one finger.) “Three containers. Southshore Boulevard. Twenty-three hundred, the eleventh. Four minutes.”'],
        ['rhea', "Four minutes of my cranes. On a public road. With the Port Authority's cameras on every gantry."],
        ['jay', 'Four minutes. Then you can have the road back.'],
        ['rhea', "You've been reading his notebook."],
        ['jay', 'Page forty-one. “Rhea. Never ask her for a favour. Offer a trade. Favours make her feel like family, and she hates it.”'],
        ['rhea', '(a long pause) He wrote that.'],
        ['jay', 'He also wrote that you cheat at cards.'],
        ['rhea', 'Only with him. He deserved it. (She closes the notebook, gently, and pushes it back across the pallet.) Fine. A trade.'],
        ['rhea', 'Halberd put a post on Crane Row in September. A boom gate, a portakabin, three of those charcoal tanks. Every docker in and out, they stop.'],
        ['rhea', 'They photograph faces. They open lunchboxes. They have a list of my people with little red dots on it, for the day the port is sold and nobody needs us.'],
        ['kostya', '(from the forks of a forklift, deeply wounded) They took my sandwich.'],
        ['rhea', "They took Kostya's sandwich."],
        ['kostya', 'Pastrami. My mother made it. They said it was a security risk.'],
        ['deb', 'It was a big sandwich.'],
        ['kostya', 'It was a NORMAL sandwich, Deb.'],
        ['rhea', "The post sees everything that comes off my quay. If it's standing on the eleventh, your three boxes are on Voss's desk before they touch the road."],
        ['rhea', 'Then they come here. Then I have a war in my warehouse instead of a warehouse.'],
        ['jay', 'So the post goes.'],
        ['rhea', "Today, while the light's good. That's the price."],
        ['jay', 'Done.'],
        ['rhea', "You didn't haggle. Augie haggled. It was the only fun I had all year."],
        ['jay', '(beat) Twenty per cent, Rhea, you old pirate.'],
        ['rhea', '(the corner of her mouth, barely) Too late. (She takes a claw hammer to a crate stencilled SS ANDROMEDA, PIRAEUS.)'],
        ['caption', '(Inside, packed in straw that smells of the sea floor: grenades. Old green ones, in rows, like a box of very bad eggs.)'],
        ['rhea', 'Stavros pulled these off a Greek freighter that went down off the breakwater in eighty-nine. Grenades. From a shipwreck. Mostly dry.'],
        ['jay', 'Mostly.'],
        ['rhea', "Throw them far. If one doesn't go off, don't go and look at it. Stavros went and looked at one once."],
        ['rhea', '(beat) He had very small eyebrows for the rest of that year.'],
        ['deb', 'Rhea says take Kostya.'],
        ['kostya', "Kostya says it's his day off."],
        ['deb', "It's Sunday. Nobody on this quay has had a Sunday off since 1990."],
        ['kostya', "I'm taking it as a day off."],
        ['rhea', "Nobody goes with him. If a Salt is seen on Crane Row today, it's my war. If a Mercer is seen, it's his. (to Jay) I'll be in the cab of the blue crane. My cranes, my eyes."],
      ] },
      { reward: { weapons: ['grenade'] }, say: [
        ['caption', '(Jay fills his jacket pockets with shipwreck. He walks to the car very, very carefully.)'],
      ] },
      halberdSuv('post_suv_a', 'crane_row'),
      halberdSuv('post_suv_b', 'crane_row', { offset: [0, 9] }),
      halberdSuv('post_suv_c', 'crane_row', { offset: [0, -9] }),
      { spawn: [
        { id: 'post_rifle', faction: 'halberd', at: 'crane_row', count: 4, weapon: 'rifle', behavior: 'guard', group: 'post' },
        { id: 'post_smg', faction: 'halberd', at: 'crane_row', count: 2, weapon: 'smg', behavior: 'patrol', group: 'post', offset: [-10, 6] },
      ] },
      { phone: 'noor', objective: 'Drive to the fish market. Walk the rest of the way in.', say: [
        ['noor', 'Rhea says you have grenades. In your pockets. In the car. Loose.'],
        ['jay', "They're in my jacket."],
        ['noor', 'Your jacket is IN the car. You are in the car. I made a spreadsheet of grenade safety. It has one tab. The tab is called DON\'T.'],
        ['noor', "Okay. The post. Three Ironclads, one portakabin, six men with real guns. Two of them were soldiers somewhere. You can tell. They stand like furniture."],
        ['noor', 'Park at the fish market. Walk in through the stalls. Nobody ever looks at a man near fish.'],
        ['jay', "Who's on the clipboard?"],
        ['noor', '(a little too happy) Funny you should ask. They transferred Luis Garza to the docks in August. His file says “for his own safety”.'],
        ['jay', 'Lucky Garza.'],
        ['noor', 'I think they meant safety from you. I think his file is about you, honestly. There are a lot of exclamation marks.'],
      ] },
      { goto: 'fish_market', vehicle: true, objective: 'Park at the Saltmarsh fish market', say: [
        ['jay', '(to the car, taking a speed bump at a crawl) Easy. Easy. We have eggs in the back.'],
        ['rhea', "(over a Salts radio, crackling) I can see you from the cab, Mercer. You're driving like a hearse."],
        ['jay', "I'm driving like a man with forty-year-old grenades in his pocket."],
        ['rhea', "(over the radio) Stavros drove with them in the glovebox for a month. He said they kept the car honest."],
      ] },
      { goto: 'fish_market', vehicle: false, radius: 10, objective: 'Out of the car. On foot through the fish stalls.' },
      { music: 'tension' },
      { camera: 'crane_row', seconds: 5, say: [
        ['caption', '(Crane Row. A red-and-white boom gate across the quay road, a portakabin with a teal halberd on the door, three charcoal Ironclads parked nose to tail.)'],
        ['caption', '(A man with a clipboard and a sunburn is photographing a docker\'s lunchbox. He looks like he is having the worst year of his life. He is.)'],
      ] },
      { destroy: ['post_suv_a', 'post_suv_b', 'post_suv_c'], checkpoint: true, objective: 'Blow up the three Halberd SUVs at the post. Throw far.', say: [
        ['rhea', '(over the radio) Wind off the water. Throw a little left of where you think.'],
        ['rhea', "(over the radio) That's one. Kostya just cheered in the canteen. Kostya never cheers."],
        ['rhea', '(over the radio) Two. They are running in circles. Halberd trains them very hard to run in circles.'],
        ['rhea', '(over the radio) Three. Good. Now the men. They will be angry. Angry men shoot high.'],
      ] },
      { music: 'action' },
      { spawn: [{ char: 'garza', at: 'crane_row', offset: [6, -4], behavior: 'flee', flee: 14 }] },
      { kill: 'group:post', objective: 'Take out the Halberd post', say: [
        ['garza', '(sprinting past the fish stalls, clipboard over his head) Every time! EVERY TIME it is YOU!'],
        ['jay', 'Hi, Lucky.'],
        ['garza', "(fading into the distance) I asked for a DESK! I said I'd do NIGHTS!"],
        ['rhea', "(over the radio) Let him run. A man like that is more use to us telling the story than lying in it."],
      ] },
      { music: 'tension' },
      { phone: 'rhea', objective: 'Get back to Kostas Salvage. Halberd is going for the doors.', say: [
        ['rhea', 'Good. The post is gone. Now be quiet and listen.'],
        ['caption', '(Engines. Over the container stacks, from the direction of the Halberd depot: a lot of engines, going the wrong way. Not to the quay.)'],
        ['rhea', "Two vans out of the depot and they're not coming to Crane Row. They're coming to my door. They know who sold them the wind."],
        ['jay', "I'm coming."],
        ['rhea', "Of course you're coming. It's your fault."],
      ] },
      { timer: 90 },
      { goto: 'kostas_salvage', vehicle: true, objective: 'Get back to Kostas Salvage before Halberd does' },
      { join: ['rhea'], weapon: 'shotgun', say: [
        ['rhea', '(racking a long-barrelled pump shotgun) Stavros\'s. He shot gulls with it.'],
        ['jay', 'Everything Stavros owned, he shot gulls with.'],
        ['rhea', 'He hated gulls. He said they had the eyes of landlords. Hold the doors, Mercer.'],
      ] },
      { spawn: [
        { char: 'kostya', at: 'kostas_salvage', offset: [-4, 5], behavior: 'cower' },
        { char: 'deb', at: 'kostas_salvage', offset: [4, 6], behavior: 'cower' },
      ] },
      { survive: 90, checkpoint: true, objective: 'Hold the doors of Kostas Salvage with Rhea', waves: [
        { at: 'kostas_salvage', count: 3, weapon: 'smg', faction: 'halberd', delay: 2 },
        { at: 'container_maze', count: 3, weapon: 'rifle', faction: 'halberd', delay: 18 },
        { at: 'kostas_salvage', count: 4, weapon: 'smg', faction: 'halberd', delay: 38 },
        { at: 'fish_market', count: 3, weapon: 'rifle', faction: 'halberd', delay: 55 },
        { at: 'kostas_salvage', count: 3, weapon: 'shotgun', faction: 'halberd', delay: 70 },
      ], say: [
        ['deb', '(from behind a forklift) Kostya! Kostya, get DOWN!'],
        ['kostya', '(already down) I am the most down I have ever been, Deb!'],
        ['rhea', '(firing) Not my propellers! Those are bronze, you animals!'],
        ['rhea', "They brought a van with a ram on the front. To a salvage yard. Everything here is already broken. You can't threaten it."],
        ['rhea', '(reloading, calm as a kitchen) Augie never fired a shot in thirty years. I used to think he was a coward. I was wrong. He was just very, very organised.'],
        ['rhea', "That's the last of them. Listen. Hear that? That's the sound of the port being ours for an evening."],
      ] },
      { leave: ['rhea'] },
      { music: 'off' },
      { setTime: 19 },
      { scene: { at: 'quay_end', cast: ['rhea'] }, say: [
        ['caption', '(Sunset at the end of the quay. The freighter ESPERANZA rides high at her berth with her rail lights coming on. Behind them, the Halberd portakabin is still on fire, and nobody is in any hurry about it.)'],
        ['rhea', '(on a bollard, the shotgun across her knees like knitting) You held my door.'],
        ['jay', 'You held mine.'],
        ['rhea', "Don't make it a thing."],
        ['jay', '(sitting on the next bollard along) The boxes.'],
        ['rhea', 'Three. Southshore. Twenty-three hundred. Four minutes. (beat) Five, if you need five.'],
        ['jay', 'That sounds like a favour.'],
        ['rhea', "It's a discount. I give discounts to people who blow things up on my behalf. It's in the ledger."],
        ['jay', 'Why do you do it? Really. You could sell him the port tomorrow. Retire somewhere with a dry bed.'],
        ['rhea', 'Sentiment is for people with dry feet, Mercer.'],
        ['jay', 'Your feet look pretty dry.'],
        ['rhea', "They're wet on the inside. (She takes a folded envelope out of the old watch cap in her pocket. Stavros's cap.)"],
        ['caption', '(A cheque, soft as cloth from nine years of folding. VOSS MERIDIAN PORT SERVICES. One hundred and eighty thousand dollars. In full and final settlement.)'],
        ['rhea', 'Number four crane. Bad sling, bad inspection, bad Tuesday. They paid inside a week. Very fast. Very sorry.'],
        ['jay', 'You never cashed it.'],
        ['rhea', "If I cash it, it's a price. If I keep it, it's a debt. I prefer him owing me."],
        ['rhea', '(folding it back along its old lines) Everyone in this port has sold something, Mercer. Me too.'],
        ['jay', 'What did you sell?'],
        ['rhea', '(a long time looking at the water) A name. An inspector who was going to fail number four. Voss\'s people asked me who he was. I wanted a quiet year. I told them.'],
        ['rhea', 'They moved him to the airport. Number four passed. (beat) Three months later it came down on my husband.'],
        ['caption', "(She doesn't say anything else about it. She doesn't have to.)"],
        ['jay', '(after a while) Augie knew?'],
        ['rhea', 'Augie knew everything about everybody. He never once used it. That was what was wrong with him. (beat) That was what was right with him.'],
        ['rhea', "(standing, knees cracking like a deck in the cold) When this is over I'm cashing it. I'm buying a crane. I'm calling it Stavros, and I'm painting it pink so he hates it."],
        ['jay', 'He shot gulls with everything else.'],
        ['rhea', "(the closest she has ever come to a laugh in front of him) He'd have shot the crane."],
      ] },
    ],
  });

  // ===================================================================
  // m26 GOLD WATCH
  // ===================================================================
  act4.push({
    id: 'm26_gold_watch',
    act: 4,
    title: 'Gold Watch',
    giver: 'noor',
    start: 'horne_house',
    time: 2,
    estMinutes: 10,
    summary: "Jay steals the police captain's phone, and then the police captain's car.",
    reward: { money: 5000 },
    failIf: ['dead:horne_robe', 'wrecked:horne_cruiser'],
    steps: [
      { music: 'tension' },
      { spawnCar: 'horne_cruiser', type: 'interceptor', at: 'horne_house', exact: true, offset: [3, 3], police: true },
      { spawn: [
        { id: 'door_cop', faction: 'vpd', at: 'horne_house', weapon: 'pistol', behavior: 'guard', group: 'garden', offset: [-5, -6] },
      ] },
      { camera: 'horne_house', seconds: 5, say: [
        ['caption', '(Crestline. Four minutes past two in the morning.)'],
        ['caption', "(Captain Wade Horne's too-nice house: a flagpole with the flag still up in the dark, a boat on a trailer that has never touched water, and in the drive, his own VPD cruiser.)"],
      ] },
      { if: 'trusted_calder', then: [
        { phone: 'calder', say: [
          ['calder', "You're outside his house."],
          ['jay', 'You said two.'],
          ['calder', 'I said “hypothetically, around two.” I was very clear about the hypothetically. (beat) Okay. Listen.'],
          ['calder', 'Horne has a second phone. Not department. Cheap, black, prepaid. He calls Voss on it. He called his informant on it.'],
          ['calder', "I need it for a warrant. I can't get a warrant without it, and I can't touch it without a warrant."],
          ['calder', "That's the law. The law is a snake eating its own tail and calling it lunch."],
          ['jay', 'So you need a raccoon.'],
          ['calder', "Legally, you're a raccoon who found a phone. Raccoons don't need warrants. Raccoons have hands."],
          ['calder', 'One Southside uniform on overtime by the side door. Motion lights on the lawn. Stay out of the light and keep the boat between you and the house.'],
        ] },
        { if: 'dex_to_calder', then: [
          { phone: 'calder', say: [
            ['calder', "And Mercer. Your friend's statement says glovebox. Not the console. Glovebox."],
            ['calder', 'He was very specific. He was specific about everything. He cried for an hour, and then he drew me a map of the inside of that car from memory.'],
            ['jay', '(a long beat) He would.'],
          ] },
        ] },
      ], else: [
        { phone: 'noor', say: [
          ['noor', "Okay. I'm in the Southside duty roster, which is protected by a password that is literally the word password. With a capital P. For security."],
          ['noor', 'One uniform on the side door, on overtime. Motion lights on the lawn. And the captain, who goes to bed at eleven in a sleep mask that says DO NOT DISTURB.'],
          ['noor', 'I know about the mask because he bought it with a department card. It was nineteen ninety-nine. The mask, not the year.'],
          ['noor', "The phone. Prepaid, black, cheap. If the convoy plan exists anywhere it's in that phone, because men like Horne don't trust email. They think email is for wives."],
          ['jay', 'Where does he keep it?'],
          ['noor', "In the car, somewhere. That's all I've got. Nobody writes down where they hide things. That's the whole point of hiding things."],
        ] },
        { if: 'dex_to_calder', then: [
          { text: 'calder', message: "Your friend's statement says glovebox. Not the console. I'm not asking what you're doing tonight. I'm asleep. I'm extremely asleep." },
        ] },
      ] },
      { if: 'dex_banished', then: [
        { text: 'dex', message: "Glovebox, not the console. I owe you more than that. Don't answer." },
        { say: [['caption', "(He reads it twice. Somewhere north of here, on a road with snow on the verges, Dex is awake at two in the morning too. Jay doesn't answer.)"]] },
      ] },
      { if: 'dex_forgiven', then: [
        { spawn: [{ char: 'dex', at: 'horne_cruiser', offset: [1.6, -1.2], behavior: 'idle' }] },
      ] },
      { goto: 'horne_cruiser', vehicle: false, radius: 2.6, checkpoint: true, objective: "Stay out of the light. Get to the cruiser in Horne's drive.", say: [
        ['caption', "(The lawn is cut to the length of a regulation. The motion lights sit in the hedges like dogs that haven't decided yet.)"],
        ['jay', '(barely a breath, to himself) Behind the boat. Behind the boat.'],
        ['caption', '(The boat on the trailer is called WADE IN. Its hull is spotless. There are still stickers on the outboard.)'],
        ['caption', '(By the side door, a Southside officer on overtime eats crisps out of the bag and watches a game on his phone with the sound off.)'],
      ] },
      { if: 'dex_forgiven', then: [
        { scene: { at: 'horne_cruiser', cast: ['dex'] }, say: [
          ['caption', "(Crouched against the cruiser's back wheel in navy coveralls, reading glasses on their cord, a slim jim in his fist like a sword: Dex Calloway.)"],
          ['dex', '(whispering) Hey.'],
          ['jay', '(whispering) I told you to stay with Birdie.'],
          ['dex', "Birdie's asleep at Lourdes's. Lourdes is asleep on Birdie. Nobody in that apartment is waking up before Christmas."],
          ['dex', "(looking up at the cruiser, at the lightbar, at all of it) Of all the cars in this city. Of all the cars, Jay."],
          ['jay', "It's a car."],
          ['dex', "It's HIS car. I sat in the passenger seat of this car once a month for four years. He used to give me butterscotch. Like I was a kid at the bank."],
          ['dex', '(He pops the lock with the slim jim in one movement, the way he has a thousand times. Then his hands start to shake.) Glovebox. Not the console. He keeps the console for show.'],
          ['jay', '(quietly) Breathe.'],
          ['dex', "I'm breathing. I'm a world-class breather. (beat) Get the phone, Jay. I can't put my hand in there. I'll be sick on his upholstery."],
        ] },
        { join: ['dex'], weapon: 'pistol' },
      ] },
      { wait: 4, objective: "Glovebox. Find the second phone. Quietly.", say: [
        ['caption', '(Under the registration, a tyre gauge and a bag of butterscotch: a cheap black phone with a cracked corner.)'],
        ['caption', '(It lights up in his hand. The lock screen is a photograph of a gold watch.)'],
      ] },
      { music: 'action' },
      { spawn: [{ char: 'horne_robe', at: 'horne_house', offset: [-7, 3], weapon: 'shotgun', behavior: 'attack', health: 3000, accuracy: 0.18 }] },
      { getIn: 'horne_cruiser', checkpoint: true, objective: "Horne's awake. Take his cruiser. GO.", say: [
        ['caption', '(Every motion light on the lawn comes on at once. The front door bangs open on a big man in a white bathrobe, monogrammed W.H., with a pump shotgun.)'],
        ['horne_robe', 'MERCER!'],
        ['horne_robe', "(firing into the night, mostly at his own hedge) That's MY CAR! That's a POLICE VEHICLE, you piece of—"],
        ['horne_robe', '(the slippers losing their grip on the wet lawn) Get out of my CAR!'],
      ] },
      { if: 'dex_forgiven', then: [{ join: ['dex'], weapon: 'pistol' }] },
      { heat: 3, say: [
        ['DISPATCH', 'All Southside units. Captain Horne reports his vehicle stolen from his residence. Suspect is... (a pause) Suspect is described as, quote, an asshole. End quote.'],
        ['DISPATCH', '(off the mic, not quite) Who wrote that down? Did you write that down? Okay. All units respond.'],
      ] },
      { loseHeat: true, objective: 'Lose Southside. In their own captain\'s car.', say: [
        ['jay', '(to the cruiser, flicking switches until the siren screams) Sorry. Sorry. Which one is the... okay. That one.'],
        ['DISPATCH', 'Unit four, the stolen vehicle is running lights and siren. Repeat, the suspect has turned the siren ON.'],
        ['jay', '(to the cruiser, taking a red at seventy with traffic pulling politely out of his way) Oh. Oh, they move. They just move for you.'],
      ] },
      { if: 'dex_forgiven', then: [
        { say: [
          ['dex', "(in the passenger seat, gripping the dash) You're enjoying this. I've known you since you were twelve. You're enjoying this."],
          ['jay', "I'm not enjoying it."],
          ['dex', "(after a while, staring at the radio with Horne's call sign taped above it) Four years I sat here. You know what he talked about? His boat. Every month. The boat he never takes out."],
          ['dex', "And I'd say, sounds great, Captain. And I'd take the envelope. (beat) I'd eat the butterscotch, Jay. Every time. I'm a grown man."],
          ['jay', '(eyes on the road) Throw them out the window.'],
          ['caption', "(Dex winds down the window and throws the bag of butterscotch into the night at sixty miles an hour. For a second, they're both kids.)"],
        ] },
      ], else: [
        { say: [
          ['jay', "(to the empty passenger seat, out of habit) Seatbelt."],
          ['caption', "(Nobody there. Taped above the radio, in Horne's handwriting: 1-ADAM-9. The unit on the dashcam tape. The car that was in bay fourteen.)"],
          ['jay', '(very quietly, to the car) Were you there? (beat) You were there.'],
        ] },
      ] },
      { music: 'triumph' },
      { goto: 'civic_plaza', vehicle: 'horne_cruiser', objective: 'Park the captain\'s cruiser under the Beacon. Leave the lights on.', say: [
        ['jay', '(slowing, then all the way down to walking pace across the plaza, the lightbar turning) Easy. Easy. You did nothing wrong. He did.'],
      ] },
      { goto: 'civic_plaza', vehicle: false, radius: 9, objective: 'Get out. Leave it running.', say: [
        ['caption', "(From his jacket, Jay takes a yellow slip he has carried since the day he came home: Nana Lu's parking ticket. Cemetery car park. Unpaid, on principle.)"],
        ['caption', '(He tucks it under the cruiser\'s wiper. “The dead don\'t charge,” she said. “So why should the city?”)'],
      ] },
      { camera: 'civic_plaza', seconds: 7, say: [
        ['caption', "(Civic Plaza at three in the morning. Under the golden Beacon, Captain Wade Horne's cruiser sits with its engine running and its lights going round: blue, red, blue, on the gold.)"],
        ['caption', '(The pigeons are not impressed. Somebody on a balcony on Lantern Street starts filming.)'],
      ] },
      { if: 'dex_forgiven', then: [
        { leave: ['dex'], say: [
          ['dex', "I'll get a cab. (beat) I've never been in a cab. I'm a mechanic. We don't pay people to drive us. It's a principle."],
          ['jay', 'Get a cab, Dex.'],
          ['dex', '(walking backwards across the plaza, grinning for the first time in weeks) Lights on! You left the lights ON!'],
        ] },
      ] },
      { music: 'off' },
      { if: 'trusted_calder', then: [
        { goto: 'vpd_central', objective: "Take the phone to Calder at Central's back gate", say: [
          ['calder', "(on the phone) I'm at the back gate. Under the camera that doesn't work. They've been meaning to fix it since the Olympics."],
        ] },
        { scene: { at: 'vpd_central', cast: ['calder'] }, say: [
          ['caption', "(The back gate of VPD Central. A strip of car park, a bin store, and a camera that has been pointing at a wall since before the Olympics.)"],
          ['calder', '(holding out an evidence bag for the phone, not touching it) Drop it in. Raccoon.'],
          ['caption', "(He drops it in. She seals it, signs the strip, and looks at the photograph of the gold watch on the screen through the plastic.)"],
          ['calder', "His PIN's going to be something stupid. They always are. (She tries. Twice.) His birthday. No. His badge number. No."],
          ['jay', '(quietly) Zero two one one.'],
          ['caption', '(She looks at him. Then she types it. The phone opens.)'],
          ['calder', '(after a long time) Two-eleven. Bay fourteen. He made it his PIN.'],
          ['calder', "(scrolling, her jaw working) Here. Three days ago. From a contact saved as “H.V.”: “Gala the eleventh. Book and freight leave Belvedere 23:00. Three cars. You lead. Esperanza sails at first light.”"],
          ['calder', "Three Halberd armoured vans. Horne in front, escorting. Down Crestline, through Palm Crescent, along Southshore to the docks. The freighter at Crane Row. The Esperanza."],
          ['jay', 'Esperanza.'],
          ['calder', "It means hope. He's put his book and his exit money on a boat called Hope. Registered in Panama, owned by a fund in Luxembourg, owned by a fund owned by a man in a white suit."],
          ['calder', '(scrolling) Voss rides separately. White Sovereign. He never travels with his money. Too many photographers.'],
          ['jay', 'How much money?'],
          ['calder', "Every bribe he's still got to pay, and every bribe he'll need wherever he goes next. Thirty million, give or take a councilman."],
          ['calder', '(She finds one more message, and goes still.) And this. From H.V., after the vote: a photograph of a commissioner\'s badge. No words. He didn\'t need words.'],
          ['calder', "I can't use any of this. A judge would laugh me out of the building. Stolen phone, no warrant, a raccoon. But now I know where to be."],
          ['jay', 'Where?'],
          ['calder', "Wherever he is when it falls apart. (She puts the bag in her blazer.) Don't tell me the plan, Mercer. If I know the plan, I'm in it."],
          ['calder', '(walking away, then turning back) The cruiser under the Beacon. With the lights on.'],
          ['jay', 'I thought it needed some light.'],
          ['calder', "(not quite managing not to smile) I'm going to watch the morning news tomorrow like it's the Super Bowl."],
        ] },
      ], else: [
        { goto: 'last_resort_bar', objective: 'Take the phone to Noor at the Last Resort', say: [
          ['noor', "(on the phone) I'm at the Last Resort. Under the flamingo. Ansel's here. Ansel brought soup. It's three in the morning. Why does Ansel have soup at three in the morning?"],
          ['ansel', "(faintly, in the background) Because it's three in the morning, Noor."],
        ] },
        { scene: { at: 'last_resort_bar', cast: ['noor', 'ansel'] }, say: [
          ['caption', '(The Last Resort, closed. The neon flamingo buzzes like a wasp over an empty patio, three chairs, a laptop and a thermos.)'],
          ['noor', '(taking the phone with two pens, like tongs) Is it warm? Why is it warm? Has it been in your armpit?'],
          ['jay', 'Jacket.'],
          ['noor', "(plugging it into the laptop) Okay. It's locked. Of course it's locked. Four digits. His badge, his birthday, his boat's registration—"],
          ['jay', '(quietly) Try zero two one one.'],
          ['caption', '(She looks at him. She types it. The phone opens. Nobody says anything for a while.)'],
          ['ansel', "(very softly) He made it his PIN."],
          ['noor', "(scrolling, her voice gone small and careful) “H.V.” Three days ago. “Gala the eleventh. Book and freight leave Belvedere 23:00. Three cars. You lead. Esperanza sails at first light.”"],
          ['noor', "Three Halberd vans. Horne in front. Down Crestline, through Palm Crescent, along Southshore to the docks. And a freighter at Crane Row called the Esperanza."],
          ['noor', "(typing) Registered in Panama. Owned by a fund in Luxembourg. Owned by a fund that is owned by a fund that is owned by a man in a white suit."],
          ['ansel', 'Esperanza. It means hope.'],
          ['noor', "He named his getaway boat Hope. I hate him so much I'm going to need a bigger spreadsheet."],
          ['noor', "Voss rides separately. White Sovereign. He never travels with the money. He's a very careful man."],
          ['jay', 'How much money?'],
          ['noor', "(a pause while she does it properly) Thirty million. Give or take. Fourteen years of paying people to look away, and here's the bill for leaving."],
          ['noor', "(scrolling) And this. From H.V. A photo of a commissioner's badge. No words. (beat) Horne's not doing this for money. He's doing it for a hat."],
          ['ansel', '(setting down a cup of soup in front of Jay, who has not asked for it) Eat.'],
          ['jay', "I'm not hungry."],
          ['ansel', "It's not for hunger. It's for the next forty-eight hours. Soup is a plan."],
          ['noor', '(not looking up) The cruiser. Under the Beacon. With the lights on. It\'s on six live streams already. Somebody has set it to music.'],
          ['jay', 'Is it good music?'],
          ['noor', "(finally laughing, helplessly, the laptop shaking on her knees) It's SO good, Jay."],
        ] },
      ] },
    ],
  });

  // ===================================================================
  // m27 THE NIGHT BEFORE
  // ===================================================================
  act4.push({
    id: 'm27_the_night_before',
    act: 4,
    title: 'The Night Before',
    giver: 'ansel',
    start: 'harbor_beach',
    time: 20,
    estMinutes: 9,
    summary: 'The night before the job: a bonfire, a driving lesson, a race for the ouzo, and three doors to knock on.',
    failIf: ['wrecked:lulu'],
    steps: [
      { music: 'hope' },
      lulu('harbor_beach'),
      { scene: { at: 'harbor_beach', cast: ['ansel', 'noor', 'rhea'] }, say: [
        ['caption', '(Harbor Beach, eight at night. A bonfire in a ring of stones under the seawall, driftwood popping, the pier lights out on the water. Two fires down, kids with a speaker are playing Sunset Drive too loud.)'],
        ['caption', '(Ansel has brought folding chairs that nobody sits in. Noor has brought a laptop she has sworn not to open. Rhea has brought a bottle with no label.)'],
        ['rhea', '(pouring into paper cups) Ouzo. My grandmother made it in a bathtub on Kos.'],
        ['noor', '(sniffing) It smells like a bathtub.'],
        ['rhea', "It tastes like the bathtub. It's a family recipe. The family is the bathtub."],
        ['ansel', '(sipping, then going very still for a moment) That is... a great deal of aniseed.'],
        ['rhea', 'It strips paint. Stavros did the boat with it.'],
        ['jay', '(drinking, eyes watering) Wow.'],
        ['rhea', 'Wow is correct.'],
        ['noor', 'Can I say the plan one more time? Out loud? Just once? I find it calming.'],
        ['ansel', 'No.'],
        ['rhea', 'No.'],
        ['jay', 'No.'],
        ['noor', "(to the fire, wounded) Fine. I'll say it in my head. (Her lips move.)"],
        ['ansel', '(standing, unfolding a square of paper from his breast pocket, next to the seed packet) I wrote something. For the garden. And the people in it.'],
        ['noor', 'You read poems to plants.'],
        ['ansel', "The plants have been very supportive. It's time I tried a harder room."],
        ['ansel', "(reading it plainly, the way you'd read a shopping list you loved) “The tomatoes don't know whose fence they're on. The lemon doesn't ask who planted it.”"],
        ['ansel', '“Things grow where somebody knelt down. The ground keeps a list of everyone who knelt there.”'],
        ['ansel', "“It isn't a long list. I checked. You're all on it.”"],
        ['caption', '(Nobody says anything. Rhea looks at the fire very hard. Noor makes a small noise she will deny until she dies.)'],
        ['rhea', '(finally) Terrible. Read it again.'],
        ['jay', "Who's it really for?"],
        ['ansel', '(sitting, folding the paper back along its creases) There is a girl at the university. Lina Solano. Marine biology. Twenty-one.'],
        ['ansel', "Her father was Reggie Solano. Light heavyweight. A good chin. I hit him in the eleventh round, a long time ago. A legal punch. He didn't get up."],
        ['ansel', 'Every month since she was fifteen she gets a cheque from the Harbor Point Scholarship Fund. She sends thank-you letters to a post-office box.'],
        ['ansel', "(beat) There is no fund. There's a box. And me."],
        ['noor', '(very quietly) Ansel.'],
        ['ansel', 'She studies coral. Coral is the slowest thing alive. A hundred years to build a wall a metre high. (beat) I like that she likes it.'],
        ['rhea', 'Does she know?'],
        ['ansel', 'No. If she knew, it would be a different kind of money.'],
      ] },
      { if: 'saved_teo', then: [
        { scene: { at: 'harbor_beach', cast: ['teo', 'ansel', 'noor', 'rhea'] }, say: [
          ['caption', "(Teo comes down the seawall steps late: red bomber, gold sneakers, paint on his knuckles, and Augie's watch on his wrist, too big for him, the strap on its last hole.)"],
          ['teo', 'You started without me.'],
          ['rhea', "We started without everybody. It's a bonfire. Not a wedding."],
          ['teo', '(taking a cup, sniffing it, recoiling) What is this?'],
          ['rhea', 'Heritage.'],
          ['teo', "(holding his wrist up to the fire so the watch catches the light) To the old man. Who'd have made a twenty-minute speech about how this is a terrible plan."],
          ['teo', 'And then helped anyway. And complained the whole time. And cheated Birdie at cards.'],
          ['jay', 'She cheated him.'],
          ['teo', "She cheated him. (He looks at the watch.) It still keeps time. Doesn't lose a second. He used to say it was the only thing in the family that ever did."],
          ['teo', "(to Jay, lower) Tomorrow I've got forty Kings and a truck full of fireworks on the other side of town. You want half of Halberd looking the wrong way? They'll look the wrong way."],
          ['jay', 'Teo.'],
          ['teo', "Don't make it weird. It's a diversion, not a hug."],
        ] },
      ], else: [
        { text: 'teo', message: "Heard there's a fire. Not coming. Noor says Rourke's phone kills a van engine tomorrow. The phone you picked. Good. Make it worth it." },
        { say: [['caption', "(Jay reads it twice and puts the phone face down in the sand. Ansel sees, and says nothing, and refills his cup.)"]] },
      ] },
      { if: 'dex_forgiven', then: [
        { scene: { at: 'harbor_beach', cast: ['dex', 'birdie'] }, say: [
          ['caption', "(Birdie is asleep on Ansel's coat on the sand with a spark plug in her fist. Dex sits a little way off from the fire, not in the circle and not out of it, cleaning the same spanner he has been cleaning for twenty minutes.)"],
          ['dex', "(low, as Jay sits down next to him) I'm not at the fire. I'm near the fire. There's a difference."],
          ['jay', 'Come and sit at the fire, Dex.'],
          ['dex', "Ansel looks at me like I'm a plant that might not make it."],
          ['jay', "That's how he looks at everybody."],
          ['dex', "(beat) Tomorrow. The second car. I'll be there. I'll be where you need me. I'll be early. (beat) I'm never early. I'll be early."],
          ['jay', 'I know.'],
          ['birdie', '(asleep, mumbling into the coat) A week is seven days...'],
          ['dex', "(a laugh that turns into something else halfway) She still says that. In her sleep. She's still counting."],
        ] },
      ] },
      { if: 'dex_banished', then: [
        { phone: 'birdie', say: [
          ['birdie', "Daddy let me use his phone. He's inside the gas station buying the bad coffee."],
          ['birdie', "We're somewhere with snow. I'm not allowed to say where. It's very cold and everybody's polite."],
          ['jay', 'Are you okay, Birdie?'],
          ['birdie', 'Daddy cries in the car when he thinks I\'m asleep. So I pretend I\'m asleep. So he can.'],
          ['birdie', "Is it tomorrow? The thing? Daddy said there's a thing tomorrow and he's not allowed to help."],
          ['jay', "It's tomorrow."],
          ['birdie', "Be careful. (beat) A week is seven days. You've been there like forty-five. I checked."],
        ] },
      ] },
      { scene: { at: 'harbor_beach', cast: ['noor', 'ansel', 'rhea'] }, say: [
        ['rhea', "(to Noor, refilling her cup without asking) You. You'll get your pharmacy whether you come tomorrow or not. The money doesn't care. Why come?"],
        ['noor', "Because I was right. About SmartFlow, about Voss, about all of it. And nobody believed me. And being right on your own is just being lonely with evidence."],
        ['noor', "And because Augie looked at my spreadsheets like they were paintings. And Ansel brings soup to things. And Jay says seatbelt like it's a whole sentence."],
        ['noor', "(louder, to the fire, the ouzo talking) Because you're my family, okay?"],
        ['caption', '(Silence. The fire pops. Two fires down, the kids change the song.)'],
        ['noor', '(mortified) Nobody heard that. That was the bathtub. Ansel, you did not hear that.'],
        ['ansel', "I didn't hear anything. I'm a plant."],
        ['rhea', "I heard it. I'm going to put it on a sign over the door."],
        ['jay', '(looking at the fire, smiling, not hiding it fast enough) Seatbelt.'],
        ['noor', "(throwing a paper cup at him) THAT'S NOT A WHOLE SENTENCE."],
      ] },
      { if: 'foxes_done', then: [
        { say: [
          ['noor', '(squinting at his feet) Why are you wearing church shoes on a beach?'],
          ['jay', "Walt's funeral. Tuesday. Lefty said wear the good shoes."],
          ['noor', "That was yesterday."],
          ['jay', "(looking at them) I haven't taken them off."],
        ] },
      ] },
      { blackout: [
        ['caption', '(The beach car park, later. Empty, except for Lulu under one sodium light, and a lot of white lines nobody has to stay inside.)'],
        ['caption', "(Noor Haddad is in the driver's seat of a thirty-year-old land-yacht, holding the wheel at a quarter to three like it owes her rent.)"],
        ['noor', 'I want it on record that this was not my idea.'],
        ['jay', 'It was your idea.'],
        ['noor', "It was my idea in a moment of ouzo. Ouzo ideas aren't legally binding."],
        ['jay', 'Hands at ten and two.'],
        ['noor', '(moving them) Ten. Two. Like a clock. Why is it like a clock?'],
        ['jay', 'Because somebody very old said so. (beat) Heart at twelve.'],
        ['noor', '(looking down at herself) What\'s at twelve?'],
        ['jay', '(a long beat; he can hear exactly how she said it) Wherever you\'re going.'],
        ['caption', '(Noor looks at him. Then at the windscreen, and the dark, and the long white lines.)'],
        ['noor', 'Okay. Okay. Wherever I\'m going. (beat) Which pedal is wherever I\'m going?'],
        ['jay', 'The right one. Gently.'],
        ['caption', "(Lulu moves. Eleven kilometres an hour. Then fourteen. A whole lap of the car park, and Noor doesn't breathe once.)"],
        ['noor', "I'm driving. I'm DRIVING. ANSEL! I'M DRIVING!"],
        ['ansel', '(from the beach, a long way off) You\'re in first gear, Noor!'],
        ['noor', "(laughing and crying at the same time) I'm in first gear and I'm DRIVING!"],
        ['jay', '(quietly, to the car) Easy, Lulu. Easy. She\'s new.'],
        ['caption', "(She stalls it at the exit. She doesn't care. Neither does he.)"],
      ] },
      { getIn: 'lulu', objective: 'Get back in Lulu. Somebody has challenged you for the ouzo.' },
      { if: 'saved_teo', then: [
        { say: [
          ['teo', "(leaning out of a candy-red lowrider, revving it so the whole car shrugs) Old man's car against mine. Seawall to the Last Resort to Meridian. Loser buys Rhea's bathtub."],
          ['jay', "That's not a prize, that's a punishment."],
          ['teo', "That's why it's for the loser. Just lose."],
        ] },
        { race: { checkpoints: ['harbor_point', 'last_resort_bar', 'meridian_boulevard'], mustWin: false, rivals: [{ char: 'teo', car: 'lowrider', color: 0xb3202a, skill: 0.95 }] }, objective: 'Race Teo for the ouzo', say: [
          ['teo', '(over the open windows, side by side) Two land-yachts! This is the slowest race in the history of Vicehaven!'],
          ['jay', '(to Lulu) Come on. Come on, old girl. Show him where he got it from.'],
        ] },
        { say: [
          ['teo', "(at the finish, both cars ticking, both drivers laughing like idiots) Okay. Okay. Somebody owes Rhea a bottle. I'm not saying who."],
          ['jay', "It's you."],
          ['teo', "(tapping his father's watch) Check the time, brother. It's always me."],
        ] },
      ], else: [
        { say: [
          ['ansel', '(leaning out of a Salts box truck that Rhea has lent him, very solemn) Seawall to the Last Resort to Meridian. Loser buys the ouzo.'],
          ['jay', "You're in a truck."],
          ['ansel', "I'm in a truck that has never lost a race. Because it has never been in one. It's undefeated."],
        ] },
        { race: { checkpoints: ['harbor_point', 'last_resort_bar', 'meridian_boulevard'], mustWin: false, rivals: [{ char: 'ansel', car: 'hauler', color: RUST, skill: 1.0 }] }, objective: 'Race Ansel for the ouzo', say: [
          ['ansel', '(over the open window, at a stately pace, entirely serene) Most races end when you stand up.'],
          ['jay', "That's fights!"],
          ['ansel', "I'm finding out it's both."],
        ] },
        { say: [
          ['ansel', "(at the finish, the truck's brakes hissing like a disappointed cat) Somebody owes Rhea a bottle. I won't say who. I'm a gentleman."],
          ['jay', "It's you."],
          ['ansel', "(smiling) I'll buy it. I like to buy things for people who'll hate them."],
        ] },
      ] },
      { setTime: 21.5 },
      { if: 'trusted_calder', then: [
        { text: 'calder', message: "Tomorrow night I'll be where I need to be. Don't tell me where that is until it is. Get some sleep. That's not police advice. It's from someone who never did." },
      ], else: [
        { say: [
          ['caption', '(At the seawall overlook, under the one dead street lamp, a dark green unmarked car is parked facing the bay. A woman with an empty coffee cup lifts two fingers off the steering wheel as Lulu passes.)'],
        ] },
        { text: 'calder', message: "I'm not following you. I'm parked. There's a difference. Whatever it is tomorrow, I'm not in it. Make it something I'd sign." },
      ] },
      { if: 'iggy_done', then: [
        { text: 'iggy', message: "Tasha says you've got something big tomorrow. Constance is polished. If you need a car nobody would ever suspect, she has done three thousand weddings and never once been pulled over." },
      ] },
      { goto: 'casa_palma', vehicle: 'lulu', objective: 'Go to Casa Palma. Lourdes is up. Lourdes is always up.', say: [
        ['jay', '(to the car, on the long straight down Laurel, alone again) Three doors. Then sleep. Three doors.'],
        ['caption', "(He goes the long way. He doesn't notice he's doing it until he's done it.)"],
      ] },
      { if: 'dex_to_calder', then: [
        { spawn: [{ char: 'birdie', at: 'casa_palma', offset: [2, 1], behavior: 'idle' }] },
      ] },
      { if: 'gave_cut', then: [
        { scene: { at: 'casa_palma', cast: ['lourdes'] }, say: [
          ['caption', "(The Casa Palma courtyard. The dry fountain, the cats, and three storeys up, Tommy Reyes in his yellow hoodie, painted, laughing at something just past the edge of the wall.)"],
          ['lourdes', '(on the bench with a saucer of milk and four cats who are pretending they are not together) I knew it was you. You park like your grandmother. Like the kerb is a suggestion.'],
          ['jay', "I can't stay."],
          ['lourdes', "Nobody ever can. Sit for one minute. One. I'll time you. I'm very good at minutes."],
          ['caption', '(She goes up the stairs, slowly, on the bad knee. She comes down slower. She is carrying something yellow folded over her arm.)'],
          ['lourdes', "(holding it out) I've washed it four times. It still smells like him. I don't know how. Boys are a mystery."],
          ['caption', "(Tommy's yellow hoodie. A hole in one cuff where his thumb went through.)"],
          ['jay', '(not taking it) Lourdes. I can\'t.'],
          ['lourdes', "You left forty thousand dollars in my mailbox in a dirty rag. You can take a hoodie."],
          ['lourdes', "He'd want it driven somewhere nice. (She puts it in his hands and folds his fingers round it.) Not tomorrow. After. Somewhere with a view."],
          ['jay', '(holding it, his voice almost gone) Somewhere nice.'],
          ['lourdes', "(patting his face, the way she did at the funeral) There. That's a minute. Go to bed, mijo. Go and do your stupid thing."],
        ] },
      ], else: [
        { scene: { at: 'casa_palma', cast: ['lourdes'] }, say: [
          ['caption', "(The Casa Palma courtyard. The dry fountain, the cats, and three storeys up, Tommy Reyes in his yellow hoodie, painted, laughing at something just past the edge of the wall.)"],
          ['lourdes', '(on the bench with a saucer of milk and four cats) I knew it was you. You park like your grandmother.'],
          ['jay', '(taking a folded envelope out of his jacket and holding it out) This is for you.'],
          ['lourdes', '(not taking it) What is it?'],
          ['jay', "The deed. Nana's house. It's paid off. It's... I paid it off with the toolbox money. Tommy's money. It should be yours."],
          ['caption', "(Lourdes looks at the envelope for a long time. Then at him. Then up at the wall, at her son, laughing.)"],
          ['lourdes', 'Keep it.'],
          ['jay', 'Lourdes—'],
          ['lourdes', "I don't want a house, Jay. I have a house. I have cats and a bad knee and a daughter who works nights. I don't want your grandmother's house."],
          ['lourdes', "(pushing the envelope back against his chest, gently) Keep it. Pay it back to somebody else. That's how you pay back a thing like that. Sideways."],
          ['jay', '(after a long time) Sideways.'],
          ['lourdes', "(patting his face) Go to bed, mijo. Go and do your stupid thing."],
        ] },
      ] },
      { if: 'dex_to_calder', then: [
        { scene: { at: 'casa_palma', cast: ['birdie', 'lourdes'] }, say: [
          ['birdie', '(in pyjamas, at the foot of the stairs, holding a cat that does not want to be held) Mrs. Lourdes lets me feed the cats. This one is Señor Bigotes. He bites.'],
          ['jay', 'Hey, Birdie.'],
          ['birdie', 'Daddy is in a hotel with a policeman outside the door. He called me. He says the soap is tiny. He says he is telling the truth to a lady with a grey stripe in her hair.'],
          ['birdie', "(beat) Is telling the truth why he's in a hotel?"],
          ['jay', '(crouching to her height) Telling the truth is why he gets to come home.'],
          ['birdie', '(considering this with total seriousness) Okay. (beat) Tell him the cat bit me. He likes to know things.'],
        ] },
      ] },
      { setTime: 23 },
      { goto: 'nana_lu_house', vehicle: 'lulu', objective: 'Go home to Heron Street', say: [
        ['caption', "(Heron Street at eleven. Every house on it has a Voss Meridian SOLD board in the yard except one. The pink one. The lemon tree Ansel planted has three small green lemons on it.)"],
      ] },
      { scene: { at: 'nana_lu_house', cast: [] }, say: [
        ['caption', '(The porch. The swing. He sits on it, and it squeaks on the left, the way it always has.)'],
        ['caption', "(From inside, through the screen door, the kitchen smells of nothing. A house smells of nothing when nobody's been baking in it.)"],
        ['jay', '(to the street, quietly) Big day tomorrow, Nana.'],
      ] },
      { blackout: [
        ['caption', '(Heron Street. Fifteen years ago. A Sunday afternoon in August, and the whole street smells of plums and cloves.)'],
        ['nana_lu', "(cutting a plum cake on the porch rail with a butter knife) End piece is yours. End piece has the most crust. A boy should know what he wants."],
        ['jay', '(twelve, mouth full) Why do you always make two?'],
        ['nana_lu', "One for us. One for whoever turns up. Somebody always turns up."],
        ['nana_lu', "(wrapping the second cake in wax paper, slow, the way she did everything she meant) I caught a boy in my tomatoes once. Long before you. Skinny thing. All elbows. Shirt full of my best Brandywines."],
        ['jay', 'Did you call the police?'],
        ['nana_lu', "On a hungry child? (She snorts.) I sat him on that step and I fed him cake till he couldn't stand up. Gave him the end piece."],
        ['nana_lu', '(looking down Heron Street, at nothing, smiling) Never saw him again. Hope he grew up nice.'],
      ] },
      { setTime: 0.5 },
      { if: 'solace_done', then: [
        { say: [
          ['caption', '(On the radio, as Lulu pulls away from Heron Street, Harbor Heat clicks over at midnight into something stolen.)'],
          ['solace', "(on the radio) This is Solace, and this frequency is stolen, like everything else in this town. Tonight's dedication is for a getaway driver with a busy day tomorrow."],
          ['solace', "(on the radio) You know who you are. The whole city knows who you are, baby. Ten and two."],
        ] },
      ] },
      { goto: 'starlite_diner', vehicle: 'lulu', objective: "The Starlite. She said she'd be there after her shift.", say: [
        ['jay', '(to the car) Last one. Last door.'],
      ] },
      { scene: { at: 'starlite_diner', cast: ['dot', 'mae'] }, say: [
        ['caption', '(The Starlite at half past midnight. The star on the roof sputters. Through the window: chrome, red vinyl, and in the window booth, Mae Reyes with two coffees in front of her, one untouched.)'],
        ['dot', '(at the door with the coffee pot, as if he comes in every night) She ordered yours. Twenty minutes ago. It\'s cold. I told her it would go cold. She said you\'d drink it anyway.'],
        ['jay', 'I would.'],
        ['dot', "(holding the door) I know. That's what I told her."],
      ] },
      { if: 'mae_stay', then: [
        { blackout: [
          ['caption', '(The booth. J+M under her thumb, where it has been for nine years. She traces the plus sign without looking at it.)'],
          ['mae', 'You asked me something. On the kerb. That morning.'],
          ['jay', 'I remember.'],
          ['mae', "I'm still thinking. (beat) Don't look like that. Still thinking isn't no. Still thinking is the most I've given anybody in three years."],
        ] },
      ], else: [
        { blackout: [
          ['caption', '(The booth. J+M under her thumb, where it has been for nine years. She traces the plus sign without looking at it.)'],
          ['mae', 'You actually gave me space.'],
          ['jay', 'I said I would.'],
          ['mae', "You actually did it, though. Three weeks. Not one text. (She looks at him like he's a stranger she might like.) Who are you?"],
        ] },
      ] },
      { blackout: [
        ['mae', "I'm coming tomorrow."],
        ['jay', 'Mae.'],
        ['mae', "In the truck with Ansel. With my bag. I've cleared it. I've lied to three supervisors and a union rep."],
        ['mae', "Somebody has to be there when you do something stupid. That was always my job. (beat) I'm not letting someone else do my job."],
        ['caption', "(He doesn't argue. He has known her since she was nineteen. He knows when a door is shut.)"],
        ['jay', "(after a long time, turning his cup round on the table) There's something I need to tell you. About the letter. Augie's first letter."],
        ['mae', '(very still) Okay.'],
        ['jay', "He saw Tommy go down. Before I touched the gear stick. He saw his eyes. He said..."],
        ['jay', '(It takes him two tries.) He said Tommy was gone. Right there. Before I drove. There was nobody there to leave.'],
        ['caption', '(Mae puts her coffee down very carefully, as if it might go off.)'],
        ['mae', "I never read the autopsy. I've read a thousand. I read them on my breaks. Never his."],
        ['mae', "For three years I've been seeing it. Him on the ground in that bay. Alone. Waiting for somebody. Waiting for me to call back."],
        ['jay', 'Nobody left him, Mae.'],
        ['mae', '(her voice going) Nobody left him.'],
        ['caption', '(She cries the way people cry in diners at one in the morning: with her hand over her mouth, so Dot won\'t come. Dot comes anyway, and refills both cups, and goes.)'],
        ['caption', '(He cries too. A little. Mostly at the window. She lets him have the window.)'],
      ] },
      { if: 'nightshift_done', then: [
        { blackout: [
          ['mae', "(wiping her face with a napkin, taking a small battered notebook out of her shirt pocket) First page. First name. Tomás Reyes. And next to it, I wrote “alone.”"],
          ['mae', "Because I thought... (She clicks a pen. She draws one line through the word, slowly, very straight, the way they teach you.)"],
          ['mae', "There. (beat) Don't you dare make me start a new page tomorrow, Jay. I mean it. I'll come and find you and I'll be so angry."],
        ] },
      ] },
      { blackout: [
        ['mae', '(standing, leaving money on the table that is far too much) Go to sleep somewhere. Not the motel. The motel has bedbugs that have unionised.'],
        ['jay', "I'll sleep in the car."],
        ['mae', "(at the end of the booth, her hand on his shoulder for one second) Of course you will. (beat) Ten and two."],
      ] },
      { music: 'off' },
      { setTime: 1 },
      { camera: 'voss_estate', seconds: 7, say: [
        ['caption', "(One in the morning. On the Crestline lookout, a long teal two-door is parked facing the city, and the man in the driver's seat is asleep with his hands at ten and two.)"],
        ['caption', "(Below him, across the dark lawns, Belvedere is lit up like a ship. In twenty hours, three armoured vans are going to leave through those gates.)"],
      ] },
    ],
  });

  // ===================================================================
  // m28 THE GARDEN PARTY (Finale I)
  // ===================================================================
  act4.push({
    id: 'm28_the_garden_party',
    act: 4,
    title: 'The Garden Party',
    giver: 'jay',
    start: 'crestline_overlook',
    time: 20,
    estMinutes: 11,
    summary: 'Jay walks into the Crown gala to tag the convoy, and Harlan Voss comes to say hello.',
    failIf: ['wrecked:lulu'],
    steps: [
      { music: 'off' },
      lulu('crestline_overlook'),
      { camera: 'voss_estate', seconds: 6, say: [
        ['caption', 'October 11. The Crown Opening Gala.'],
        ['caption', '(Belvedere at eight in the evening. Floodlit columns, topiary lions with their mouths open, and every important car in Vicehaven nosing up the drive in a line.)'],
      ] },
      { phone: 'noor', objective: "Drive down to Belvedere's gate. You're parking cars tonight.", say: [
        ['noor', "Morning. It's evening. You slept in the car for nineteen hours. Mae says that's medically interesting."],
        ['noor', "Okay. The trackers are in the glovebox. Three. Magnetic. The size of a biscuit. One under the back bumper of each van."],
        ['noor', "Horne's phone says three vans. It doesn't say which one has the book. Voss isn't stupid. He'll have two decoys."],
        ['noor', "But a van with thirty million dollars and a ledger in it sits lower on its springs. The trackers have accelerometers. I'll know which one brakes like it's carrying sin."],
        ['jay', 'And if they find them?'],
        ['noor', "Then they find three biscuits and we go home and I cry into a spreadsheet. Please don't let them find them. I've named them."],
        ['jay', "You've named them."],
        ['noor', 'Huey, Dewey and Councilman Pruitt.'],
      ] },
      { getIn: 'lulu', objective: 'Get in Lulu' },
      { text: 'mae', message: "Bag's packed. Ansel has packed snacks. Ansel has packed snacks for the snacks. I'm in his truck eating a peach. Don't die at a party." },
      { goto: 'voss_estate', vehicle: 'lulu', objective: "Park on Crestline Drive below Belvedere's gate", say: [
        ['jay', '(to the car, parking her nose-out, the way Augie taught him) Stay here. Keep the engine warm. I might be leaving in a hurry.'],
        ['jay', '(beat, his hand still on the wheel) I might be leaving in a hurry, Nana. Don\'t tell anybody.'],
      ] },
      { scene: { at: 'voss_estate', cast: ['hollis'] }, say: [
        ['caption', '(The valet stand under a white canopy at the gate. Somewhere inside, a string quartet is playing a pop song slowly enough to be expensive.)'],
        ['caption', '(Behind the stand, clipboard flat against his chest, nineteen years in his posture: Hollis Crane.)'],
        ['hollis', '(not looking up) Name.'],
        ['jay', '(holding out a folded red vest) I brought back the vest.'],
        ['hollis', '(looking up. A long time.) You again. You parked a poodle.'],
        ['jay', 'You said bring back the vest.'],
        ['hollis', 'Nineteen years. Four thousand vests. (He takes it, unfolds it, and, God help him, sniffs it.) Nobody has ever brought back the vest.'],
        ['hollis', "It's been washed."],
        ['jay', 'Twice.'],
        ['hollis', "(beat) The agency didn't send you."],
        ['jay', 'No.'],
        ['hollis', "Nobody sent you. You're just here."],
        ['jay', "I'm just here."],
        ['hollis', '(handing the vest back across the stand) Put it on. You take the cars up the drive to the motor court. Halberd tells you where. You come back down on foot.'],
        ['hollis', 'You do not go into the gardens. Nobody goes into the gardens. (lower) The gardens are where Mr. Voss walks when he wants to be alone. He wants to be alone a great deal tonight.'],
        ['caption', "(A cab pulls up. Councilman Delmar Pruitt climbs out in a cream dinner jacket that surrendered at the armpits somewhere on Crestline Drive. He sees the red vest. He sees the face above it.)"],
      ] },
      { scene: { at: 'voss_estate', cast: ['pruitt', 'hollis'] }, say: [
        ['pruitt', '(strangled) Oh, no.'],
        ['jay', 'Evening, Councilman.'],
        ['pruitt', '(not moving his lips, like a ventriloquist with a gun to his head) What are you doing here?'],
        ['jay', "Parking. The vote's tomorrow."],
        ['pruitt', 'I know when the vote is.'],
        ['jay', "I said you'd know when. (beat) This is when."],
        ['pruitt', "(dabbing his forehead with a cocktail napkin he has clearly already used) Nine o'clock. Council chamber. Harlan has the votes, Mr. Mercer. Everybody's in the book. Everybody votes yes. That's what the book is for."],
        ['jay', 'Everybody?'],
        ['pruitt', '(a long, damp look at him) Ask me in the morning.'],
        ['hollis', '(watching Pruitt go up the drive) Friend of yours?'],
        ['jay', 'He has a statue of his dog.'],
        ['hollis', 'Everybody up here has a statue of something.'],
      ] },
      { spawnCar: 'guest_car', type: 'vireo', at: 'voss_estate', color: 0xf2f2ee },
      { scene: { at: 'voss_estate', cast: ['whitcombe', 'hollis'] }, say: [
        ['whitcombe', '(handing over her keys and a small velvet cushion) Bijou rides with the car. Window down two inches. Something with a beat.'],
        ['caption', '(In the passenger seat of a white Vireo, in a pearl collar, a white poodle looks at Jay. Recognition. Then total contempt.)'],
        ['jay', "Hello, Bijou."],
        ['whitcombe', '(narrowing her eyes) Have we met?'],
        ['jay', "I've got one of those faces."],
        ['whitcombe', "You have a face like a young man who once took Bijou down to a lower lot and played her music she still won't talk about."],
        ['hollis', '(without moving his lips) Sixty seconds. Motor court. If that dog comes back with one hair out of place, I will find your agency. You do not have an agency. I will find it anyway.'],
      ] },
      { getIn: 'guest_car', objective: "Drive Mrs. Whitcombe's Vireo, and Bijou, up to the motor court" },
      { deliver: 'guest_car', to: 'voss_forecourt', maxDamage: 0.1, timeLimit: 60, objective: 'Up the drive to the motor court. Not a scratch. Not one hair.', say: [
        ['jay', "(to the poodle, gently, through his teeth) Easy. I'm giving you back. Mostly."],
        ['caption', '(Bijou sneezes.)'],
        ['jay', 'Yeah. Me too.'],
      ] },
      { goto: 'voss_forecourt', vehicle: false, radius: 9, objective: "Out of the car. You're inside Belvedere." },
      halberdVan('m28_van_a', 'voss_helipad', { exact: true, offset: [-6, 0] }),
      halberdVan('m28_van_b', 'voss_helipad', { exact: true, offset: [0, 0] }),
      halberdVan('m28_van_c', 'voss_helipad', { exact: true, offset: [6, 0] }),
      { spawn: [
        { id: 'lawn_guard', faction: 'halberd', at: 'voss_fountain', count: 2, weapon: 'rifle', behavior: 'guard', group: 'garden', offset: [0, 6] },
        { id: 'pad_guard', faction: 'halberd', at: 'voss_helipad', count: 2, weapon: 'smg', behavior: 'guard', group: 'garden', offset: [10, 10] },
      ] },
      { music: 'tension' },
      { phone: 'noor', objective: 'Into the gardens. Find the three vans.', say: [
        ['noor', "You're in. You're IN. Okay. I'm looking at the estate on a real-estate brochure from when he bought it. It has a helipad and a word I had to look up. “Orangery.”"],
        ['noor', "The vans won't be in the motor court with the guests' cars. Too many people with phones. They'll be round the back by the helipad, where the money comes in."],
        ['noor', "Stay in the hedges. Crouch. Halberd's on the lawns with rifles, and they're bored, and bored men look at everything."],
        ['jay', 'Topiary lions.'],
        ['noor', "What? Oh. Yes. Hide behind the lions. That's a sentence I have now said. Professionally."],
      ] },
      { goto: 'm28_van_a', vehicle: false, radius: 3, checkpoint: true, objective: 'Stay low. Get to the first van by the helipad.', say: [
        ['caption', '(The gardens: gravel paths raked into stripes, a fountain lit from underneath, and topiary lions with their mouths open as if they too have been told the price of everything.)'],
        ['caption', '(Through the hedges, the party: three hundred people in white, a scale model of the Crown on a plinth, and a cake in the shape of the Crown that nobody will eat because it is the Crown.)'],
      ] },
      { wait: 4, objective: 'Tracker one. Under the bumper.', say: [
        ['noor', '(in his ear) Huey is live. Hi, Huey.'],
      ] },
      { goto: 'm28_van_b', vehicle: false, radius: 3, objective: 'The second van', say: [
        ['caption', '(On the helipad, three charcoal Bulwarks parked side by side like hearses at a wedding. Their back doors are open. Men in polos are loading flat grey cases from a golf cart.)'],
      ] },
      { wait: 4, objective: 'Tracker two', say: [
        ['noor', "(in his ear) Dewey's live. Two to go. One to go. Sorry, I'm counting wrong. I'm excited."],
      ] },
      { goto: 'm28_van_c', vehicle: false, radius: 3, objective: 'The third van', say: [
        ['caption', '(A Halberd man walks past the end of the van close enough to touch, talking on his phone about his kid\'s swimming lessons. He doesn\'t look down. Nobody ever looks at the ground at a party.)'],
      ] },
      { wait: 4, objective: 'Tracker three', say: [
        ['noor', '(in his ear) Councilman Pruitt is live. All three. Jay. All three. Now get out of there. Out through the pool garden, the long way. Nobody\'s at the pool.'],
      ] },
      { music: 'off' },
      { goto: 'voss_pool', vehicle: false, radius: 6, objective: 'Out through the pool garden. Nobody is at the pool.' },
      { scene: { at: 'voss_pool', cast: ['voss'] }, say: [
        ['caption', '(The infinity pool. It runs to the edge of the lawn and simply stops, and past the edge the whole city lies below, lit, as if it has been poured out for him.)'],
        ['caption', '(Somebody is at the pool. A tall man in a white suit, alone at the lip of the water with a glass of something clear. He doesn\'t turn round.)'],
        ['voss', "Mr. Mercer. You've changed vests."],
        ['jay', '(very still) You know who I am.'],
        ['voss', "I know who everybody is. It's the only expensive habit I have. (He turns.) The poodle was a nice touch. Delmar has never recovered."],
        ['voss', "(lifting the glass an inch) Sparkling water. I don't drink at my own parties. Somebody has to remember them."],
        ['voss', "You came here to put something on my vans. I don't need to know what. I know you came. That's all a man like me ever needs to know."],
        ['jay', "Then why aren't they dragging me out?"],
        ['voss', "Because I wanted to tell somebody a story tonight, and there's nobody at this party I could tell it to."],
        ['voss', 'I was sixteen. My father had been dead nine days. A badly slung load on Crane Row. They swept him up and sent my mother an invoice for the cleaning.'],
        ['voss', "I walked up from Saltmarsh to Palm Crescent because I'd heard people there grew food in their gardens. I hadn't eaten in two days."],
        ['voss', 'There was a pink house on Heron Street with tomatoes on the fence. Brandywines, as big as a fist. I filled my shirt.'],
        ['voss', 'And a woman came out of the screen door. Not running. Not shouting. Drying her hands on a dishcloth with cherries on it.'],
        ['voss', '(smiling, very slightly, at the city) Lucinda Mercer. She looked at me for a long time. And then she said, “Sit on that step.”'],
        ['voss', 'She cut a plum cake on the porch rail with a butter knife. Too much clove. She gave me the end piece. “End piece has the most crust. A boy should know what he wants.”'],
        ['caption', '(Jay does not move. He knows the words. He heard them every Sunday of his life.)'],
        ['voss', "I've bought every house on Heron Street, Mr. Mercer. Every single one. Except hers."],
        ['jay', 'Why not hers?'],
        ['voss', 'Sentiment. It\'s expensive. I allow myself one.'],
        ['jay', '(quietly) Your bank took it.'],
        ['voss', "...I'm sorry?"],
        ['jay', 'Pelican Home Equity. Your bank. They padlocked her door the week she died. Sixty-two thousand. They put her chair in a yard with razor wire round it.'],
        ['caption', '(For the first time all night, Harlan Voss has nothing ready to say.)'],
        ['jay', 'She borrowed it to bury Tommy Reyes. The boy your captain shot in bay fourteen. The night your book was in the van.'],
        ['caption', '(A long way off, the string quartet finishes its song. Polite applause, like rain on a roof.)'],
        ['voss', '(after a very long time) Pelican is not a person. I built it so it would never have to know anyone. That is what makes it fair.'],
        ['jay', "That's what makes it yours."],
        ['voss', '(He sets his glass down on the lip of the pool, very carefully, as though it might go off.) Then the machine works.'],
        ['jay', "She'd have fed you again."],
        ['voss', '(quietly) What?'],
        ['jay', 'Tonight. Right now. If you walked up her steps in that suit. She\'d have sat you down and cut you the end piece.'],
        ['voss', '(a long pause, looking out at the city) I know. (beat) That\'s why I never went back.'],
        ['voss', "(And then, like a door closing on a lit room, he is himself again: smooth, kind, finished.) You're weather, Mr. Mercer. I don't hate weather. I build for it."],
        ['voss', "Enjoy the canapés. The crab ones are good. The chef is from Saltmarsh. I'm loyal to Saltmarsh."],
        ['caption', '(Without looking round, he raises two fingers. Behind the topiary lions, something charcoal moves.)'],
      ] },
      { leave: ['voss'] },
      { scene: { at: 'voss_pool', cast: ['rourke'] }, say: [
        ['caption', '(Kessler Rourke steps out of the hedge. Charcoal polo, a small teal halberd on the chest. He takes off his wedding ring, looks at it, and slips it into his breast pocket, the way other men button a jacket.)'],
        ['rourke', 'Mr. Mercer. Let me walk you out.'],
        ['jay', 'I know the way.'],
        ['rourke', "I know you do. That's why I'm sending people. (beat) You drive. I plan for drivers."],
        ['caption', "(He doesn't follow. Rourke never follows. Three men in charcoal come round the fountain instead, and they aren't walking.)"],
      ] },
      { leave: ['rourke'] },
      { music: 'action' },
      { spawn: [
        { id: 'hunter', faction: 'halberd', at: 'voss_fountain', count: 3, weapon: 'smg', behavior: 'attack', group: 'hunters' },
        { id: 'gate_hunter', faction: 'halberd', at: 'voss_forecourt', count: 2, weapon: 'pistol', behavior: 'attack', group: 'hunters' },
      ] },
      { getIn: 'lulu', objective: "Out. Over the wall if you have to. Lulu's on Crestline Drive.", say: [
        ['noor', "(in his ear) They're coming round the fountain! Don't go through the party! Go over the wall! Ansel says the wall's only two metres! Ansel's never seen you climb!"],
        ['caption', '(Behind him, three hundred people in white hear the first shot and do what rich people always do when something goes wrong: they look for the help.)'],
        ['jay', '(over the wall, down onto Crestline Drive, running) Come on, come on, come on.'],
      ] },
      { heat: 2, say: [
        ['DISPATCH', 'Southside units, prowler reported at the Belvedere residence, Crestline Drive. Suspect in a red valet vest. Repeat, a valet.'],
        ['jay', '(pulling the vest off one-handed, throwing it on the back seat) Sorry, Hollis.'],
      ] },
      { loseHeat: true, objective: 'Lose Southside', say: [
        ['jay', '(to the car, low, as the city opens up below the hill) Okay. Okay. Show them. Thirty years old and you can still lose a cop on a hill.'],
      ] },
      { music: 'tension' },
      { phone: 'noor', say: [
        ['noor', "(fast, breathless) Jay. Jay, they're moving. Huey moved. Dewey moved. Councilman Pruitt moved."],
        ['noor', "They're rolling. Early. It's not eleven. Jay, they're rolling NOW."],
        ['jay', 'Which one has the book?'],
        ['noor', "The lead van. Huey. Huey's sitting four centimetres lower than the others and braking like a hearse. That's the book. That's the money."],
        ['noor', "They're lining up on Crestline Drive outside the gate. Horne's cruiser at the front. Get back up there. Don't get close. Get behind them. Everybody, everybody, this is it. Go."],
      ] },
      { goto: CRESTLINE_WAIT, vehicle: true, radius: 14, objective: "Back up to Crestline Drive. Wait north of Belvedere's gate. Lights off." },
    ],
  });

  // ===================================================================
  // m29 TIDEWATER, AGAIN (Finale II)
  // ===================================================================
  act4.push({
    id: 'm29_tidewater_again',
    act: 4,
    title: 'Tidewater, Again',
    giver: 'jay',
    start: 'chain',
    resumeAt: CRESTLINE_WAIT, // where it waits if the chain was interrupted
    time: 22.5,
    estMinutes: 13,
    summary: 'Same job. Same driver. Different ending.',
    failIf: ['wrecked:van_lead'],
    steps: [
      { teleport: CRESTLINE_WAIT },
      { music: 'tension' },
      { getIn: 'any', objective: 'Get in a car. Lights off. They are about to leave.' },
      { phone: 'noor', say: [
        ['noor', 'Okay. Everybody on? Say your name. Short. Like a roll call. Like school, but felonies.'],
        ['rhea', '(over the radio) Kostas. In the crane on the Pelican corner. Three boxes on the hook. My arms are bored.'],
        ['ansel', '(over the radio) Boateng. In the tow truck on Southshore. Mae is eating my snacks.'],
        ['mae', "(over the radio) Reyes. I'm eating his snacks. They're terrible. They're all seeds."],
        ['ansel', "(over the radio) They're good for you."],
        ['mae', "(over the radio) I'm a paramedic, Ansel. Nothing is good for you."],
      ] },
      { if: 'saved_teo', then: [
        { phone: 'teo', say: [
          ['teo', 'Vance. Forty Kings on Tannery Row, a truck full of fireworks and a very bad attitude. Say when.'],
          ['jay', 'When Noor says.'],
          ['teo', "(beat) He'd have hated this plan. (beat) He'd have loved it. Go on, brother."],
        ] },
      ] },
      { if: 'dex_forgiven', then: [
        { phone: 'dex', say: [
          ['dex', "Calloway. Second car. Southshore, by the weighbridge. I'm early. I've been here since six. A man sold me a hot dog. I've had four."],
          ['jay', 'Dex.'],
          ['dex', "(quieter) I'm here, Jay. I'm here this time."],
        ] },
      ] },
      { phone: 'noor', say: [
        ['noor', "Haddad. At Rhea's desk. Four screens and a sandwich. (beat) Jay?"],
        ['jay', 'Mercer.'],
        ['noor', "(a breath that shakes on the way out) Okay. Okay, everybody be quiet now. I'm going to cry, and I have a job."],
      ] },
      { spawnCar: 'horne_cruiser', type: 'interceptor', at: 'voss_estate', police: true },
      halberdVan('van_lead', 'voss_estate'),
      halberdVan('van_two', 'voss_estate'),
      halberdVan('van_three', 'voss_estate'),
      { spawn: [
        { char: 'horne', at: 'horne_cruiser', behavior: 'drive', car: 'horne_cruiser', to: 'meridian_boulevard' },
        driver('two_driver', 'van_two', 'van_two', 'meridian_boulevard'),
        driver('three_driver', 'van_three', 'van_three', 'meridian_boulevard'),
      ] },
      { camera: 'voss_estate', seconds: 5, say: [
        ["caption", "(Belvedere's gates swing open. Horne's cruiser noses out first: no lights, no siren. Behind it, three charcoal Bulwarks, nose to tail, heavy as hearses.)"],
        ['noor', "(over the radio) There they are. Huey, Dewey, Councilman Pruitt. Huey's the one in front. Huey's sitting low. Huey's got the book."],
      ] },
      { follow: 'van_lead', to: 'meridian_boulevard', min: 15, max: 150, objective: 'Tail the lead van down to Meridian. Not too close.', say: [
        ['noor', "(over the radio) Crestline south, then Meridian east. Exactly what the phone said. Men like Horne never change a plan. It's their whole personality."],
        ['jay', "(to the car, lights off, hanging back) Easy. Easy. We're nobody. We're a man driving home from a late shift."],
        ['mae', "(over the radio) Jay. You're humming."],
        ['jay', "I'm not humming."],
        ['mae', '(over the radio) The song off the Starlite jukebox. You hummed it on every job. Tommy used to hum it back at you, wrong.'],
        ['caption', '(He stops humming. A block later, very quietly, he starts again.)'],
        ['rhea', '(over the radio) Port Authority cameras on Southshore just went dark. Noor?'],
        ['noor', "(over the radio) They're all showing the same pelican. It's my signature. I'm an artist."],
        ['ansel', "(over the radio) I've parked the truck round the corner from the boxes with my hazards on. I look like a man waiting for a tow."],
        ['mae', '(over the radio) You ARE the tow.'],
        ['ansel', "(over the radio) That's why it's so convincing."],
        ['jay', "(barely aloud, watching the van's tail lights) A plan is a list of things that won't happen, in the order they won't happen."],
        ['noor', '(over the radio) What?'],
        ['jay', 'Something Augie said.'],
        ['noor', "(over the radio, softer) Well. Let's make a liar out of him."],
      ] },
      { camera: 'meridian_boulevard', seconds: 5, say: [
        ['noor', '(over the radio) Meridian. Splitting it. Three, two... Jay, say something nice to the lights.'],
        ['jay', 'Something nice to the lights.'],
        ['caption', '(Down Meridian Boulevard the signals change all at once, like a held breath let go: green for three charcoal vans. Red, red, red for the cruiser behind them.)'],
        ['caption', "(Horne's cruiser stands on its brakes at a light that has never been red at this hour in eleven years. The vans roll on without their captain.)"],
      ] },
      { spawn: [
        driver('two_driver_b', 'van_two', 'van_two', SOUTHSHORE),
        driver('three_driver_b', 'van_three', 'van_three', SOUTHSHORE),
      ] },
      { follow: 'van_lead', to: SOUTHSHORE, min: 20, max: 140, objective: 'Stay on the lead van. Down to Southshore Boulevard.', say: [
        ['horne', '(on the police band, a voice like a door being kicked in) Dispatch, this is Captain Horne. Why is every light on Meridian red?'],
        ['DISPATCH', "(on the police band) Captain, Signal Office says it's a fault in the SmartFlow system."],
        ['horne', '(on the police band) SmartFlow is a forty-million-dollar system.'],
        ['noor', "(over the radio, with enormous satisfaction) It's a timer. It's a forty-million-dollar TIMER. I wrote thirty-one pages."],
        ['rhea', '(over the radio) I see them from the cab. Three vans. No cruiser. Coming down to Southshore. Four minutes, Mercer. Starting now.'],
        ['ansel', '(over the radio) Hazards off. Seatbelt on. (beat) Mae. Seatbelt.'],
        ['mae', "(over the radio) Don't you start."],
      ] },
      { music: 'action' },
      { camera: SOUTHSHORE, seconds: 4, say: [
        ['rhea', '(over the radio) Boxes. Now.'],
        ['caption', "(On the corner of Pelican and Southshore, Rhea's crane swings. Forty-foot containers come down across the boulevard onto the Salts' flatbeds, one, two, three, a wall of steel going up like a door slamming.)"],
      ] },
      { slowmo: 2, say: [
        ['caption', '(The lead van slews. The two behind it stand on their brakes. And out of a side street, hazards flashing, a tow truck with a peach-eating paramedic in the passenger seat closes the road behind them.)'],
      ] },
      { spawnCar: 'box_a', type: 'hauler', at: SOUTHSHORE, offset: [18, 0], color: RUST, locked: true },
      { spawnCar: 'box_b', type: 'hauler', at: SOUTHSHORE, offset: [26, 0], color: RUST, locked: true },
      { spawnCar: 'ansel_tow', type: 'hauler', at: SOUTHSHORE, offset: [-30, 0], color: 0xe0a81a, locked: true },
      { spawn: [
        { char: 'ansel', at: 'ansel_tow', offset: [0, 4], behavior: 'cower', health: 600 },
        { char: 'mae', at: 'ansel_tow', offset: [2.5, 4], behavior: 'cower', health: 600 },
        { id: 'v3_crew', faction: 'halberd', at: SOUTHSHORE, offset: [-14, 2], count: 3, weapon: 'rifle', behavior: 'attack', group: 'convoy' },
      ] },
      { if: 'chased_rourke', then: [
        { say: [
          ['noor', "(over the radio) Van two. Rourke's codes. Halberd fleet access. Engine... off. And... doors... locked."],
          ['caption', '(In the middle van, three men in charcoal pull at door handles that will not move, and pound on bulletproof glass, and are, very visibly, having a terrible night.)'],
          ['noor', "(over the radio) They're locked in. Rourke's own codes. Jay, you picked the phone. The phone just took three guns out of this. I hope Teo hears about it someday."],
        ] },
      ], else: [
        { spawn: [{ id: 'v2_crew', faction: 'halberd', at: SOUTHSHORE, offset: [-6, -2], count: 3, weapon: 'smg', behavior: 'attack', group: 'convoy' }] },
      ] },
      { if: 'saved_teo', then: [
        { phone: 'teo', say: [
          ['teo', "(over fireworks, sirens, laughter) We just set a Halberd truck on fire. Metaphorically."],
          ['teo', '(a loud bang) Also literally. Half their escort is on Tannery Row looking at the sky. You get the other half. You\'re welcome.'],
        ] },
      ], else: [
        { spawn: [{ id: 'escort', faction: 'halberd', at: SOUTHSHORE, offset: [12, 5], count: 3, weapon: 'smg', behavior: 'attack', group: 'convoy' }] },
        { say: [['noor', "(over the radio) Two escort SUVs coming up Pelican! Nobody's pulling them off tonight. They're yours!"]] },
      ] },
      { if: 'dex_forgiven', then: [
        { spawnCar: 'dex_tow', type: 'mesa', at: SOUTHSHORE, offset: [-40, 0], color: MUSTARD },
        { spawn: [{ char: 'dex', at: 'dex_tow', offset: [2, 1], behavior: 'follow', weapon: 'pistol', health: 320 }] },
        { protect: 'dex' },
        { say: [
          ['dex', '(out of the mustard tow truck, a pistol held like a socket wrench, ducking every time anything happens) Second car! Second car is HERE!'],
          ['jay', 'Stay behind me.'],
          ['dex', "I've been behind you since you were twelve! I'm VERY good at it!"],
        ] },
      ] },
      { kill: 'group:convoy', objective: 'Take out the convoy crews on Southshore', say: [
        ['mae', '(from behind the tow truck, her bag clutched to her chest) Jay! Left! On the container!'],
        ['ansel', '(flat on the tarmac behind a wheel, perfectly calm) I want everyone to know I am standing up on the inside.'],
        ['rhea', '(over the radio) Halberd on the flatbed! Kostya, swing the hook! The HOOK, Kostya!'],
        ['noor', "(over the radio) Three down! Four! I'm counting, I can't help it, I count when I'm frightened!"],
      ] },
      { music: 'tension' },
      { scene: { at: 'ansel_tow', cast: ['mae', 'ansel'] }, say: [
        ['caption', '(Southshore Boulevard, smoking. Two charcoal vans that are going nowhere ever again. And the lead van, Huey, grinding its nose along the end of a container, looking for a gap.)'],
        ['mae', "(coming out from behind the tow truck with her bag, a cut on her forehead she hasn't noticed) Is anybody hit? Jay. Are you hit?"],
        ['jay', 'No.'],
        ['mae', '(checking him anyway, two fingers on his neck, her eyes on the watch with the second hand) You\'re fine. You\'re fine. Your pulse is ridiculous.'],
        ['ansel', '(looking past them) The lead van.'],
        ['caption', '(With a shriek of steel the lead van finds the gap between two containers and goes through it like a fist through a screen door.)'],
        ['mae', "(already moving) I'm coming with you."],
        ['jay', 'Mae—'],
        ['mae', "I said I'd be there when you did something stupid. This is the stupidest thing I've ever seen. Drive."],
        ['ansel', '(to both of them, calm as a Sunday) Seatbelts.'],
      ] },
      { if: 'dex_forgiven', then: [
        { leave: ['dex'], say: [
          ['dex', "(already running for the tow truck) Go! I'll bring up the rear! I'm good at the rear! I'm the BEST at the rear!"],
        ] },
      ] },
      { join: ['mae'] },
      { getIn: 'any', objective: "Back in the car. The lead van's getting away." },
      { chase: 'van_lead', mode: 'catch', route: ['harbor_point', 'the_boardwalk', 'fish_market'], objective: "Catch the lead van and box it in. Don't wreck it. The book's inside.", say: [
        ['mae', '(clicking her belt, bracing on the dash) Is this what it was like? That night?'],
        ['jay', '(eyes on the van) No.'],
        ['mae', 'What was it like?'],
        ['jay', '(a long beat, putting the car through a corner like threading a needle) Quieter.'],
        ['noor', "(over the radio) He's going for Harbor Point! He thinks he can lose you on the boardwalk road! (beat) Nobody's ever lost you on the boardwalk road."],
        ['mae', '(holding on) Tommy used to tell people you could park a bus in a phone booth.'],
        ['jay', 'I never parked a bus in a phone booth.'],
        ['mae', 'He knew that. He was being romantic.'],
        ['noor', "(over the radio) He's turning back for the docks! He's trying to get to the ship! Don't let him get to the ship!"],
      ] },
      { scene: { at: 'van_lead', cast: ['garza', 'mae'] }, say: [
        ['caption', '(The lead van sits boxed against the kerb, engine ticking, one mirror hanging by its wire. The driver\'s door opens very slowly. Two hands come out first.)'],
        ['garza', '(climbing down with his hands up, sunburnt, in a Halberd polo two sizes too big) I want it on record. I want it on the RECORD. I asked for a desk.'],
        ['jay', 'Hi, Lucky.'],
        ['garza', "(to the sky) Every time. They move me to the docks, it's you. They move me to driving, it's you. They're going to move me to the moon, and you'll be there in a little car."],
        ['mae', "(looking at his arm) You're bleeding."],
        ['garza', "I'm always bleeding. It's my resting state."],
        ['jay', 'Keys.'],
        ['garza', "(holding them out on one finger) The back's on a timer lock. Opens at the ship. You can't get in it on the street. Nobody can. That was the whole idea."],
        ['jay', "Then I'll drive it to somebody with a cutting torch."],
        ['garza', "(beat, almost admiring) Horne's coming. All of Southside. He put it on the radio as a stolen armoured car with an armed robber in it. That's you. You're the armed robber."],
        ['jay', 'I know.'],
        ['garza', "(backing away with his hands still up, then turning and running in his enormous polo) Good luck! I mean it! I don't know why I mean it!"],
      ] },
      { leave: ['garza'] },
      { getIn: 'van_lead', objective: 'Get in the lead van. Drive the book home.' },
      { music: 'action' },
      { heat: 5, checkpoint: true, say: [
        ['horne', '(on the police band, very calm, which is worse) All Southside units. Armoured vehicle, stolen, Harbor Point. Driver is armed. Driver is Jay Mercer.'],
        ['horne', '(on the police band) Use whatever you need. Air unit, light him up.'],
        ['caption', '(Above Harbor Point, a helicopter switches on its searchlight, and the light finds a charcoal armoured van the way a finger finds a name in a book.)'],
      ] },
      // 'book_van' is never spawned on purpose: a deliver with no car of its
      // own uses whatever Jay is driving when it starts (the lead van), which
      // also keeps the checkpoint above working on a retry.
      { deliver: 'book_van', to: 'kostas_salvage', maxDamage: 0.85, objective: 'Get the armoured van to Kostas Salvage. All of Southside is coming.', say: [
        ['mae', "(in the passenger seat, both hands flat on the dash) It's slow. Why is it so slow?"],
        ['jay', "It's carrying thirty million dollars and a book."],
        ['mae', '(looking back through the little grille at the dark, at grey cases strapped to the floor) This is it? This is what he died for?'],
        ['mae', '(beat) It smells like a gym bag.'],
        ['jay', '(very quietly) Yeah.'],
        ['noor', '(over the radio) Roadblock on Pelican! Two Bulwarks across the road! Go left! LEFT! The other left!'],
        ['jay', "(to the van, putting his shoulder into the wheel) Come on, big girl. You're heavier than them. Be heavier than them."],
        ['mae', '(as they go through a police barricade like it is made of cardboard) Oh my God. Oh my GOD.'],
        ['noor', "(over the radio) I can't do anything about the helicopter. I can do lights. Green to the docks. Every light from here to the sea. All of them. Yours."],
        ['mae', "(laughing, terrified, holding the grab handle with both hands) You're enjoying this. I can see it in your neck."],
        ['jay', "I'm not enjoying it."],
        ['mae', "You're SINGING."],
        ['rhea', "(over the radio) Gates are open, Mercer. My dockers are in the yard. Bring it in and we'll shut the doors behind you."],
      ] },
      { heat: 0, say: [
        ['caption', '(The van grinds in through the rust-orange doors of Kostas Salvage, and the Salts haul them shut behind it and chain them. Outside, a dozen Southside cruisers pull up in a crescent, lights going.)'],
        ['horne', '(on the police band) All Southside units, disregard. Return to patrol. Southside command has the scene. Air unit, go home.'],
        ['DISPATCH', '(on the police band) Captain, confirm? Units are on scene at the Kostas yard—'],
        ['horne', '(on the police band) I said go home.'],
        ['caption', '(One by one, outside, the cruisers turn off their lights and pull away. The helicopter tilts and slides off toward the city. The quiet afterwards is worse than the sirens.)'],
      ] },
      { music: 'off' },
      { scene: { at: 'kostas_salvage', cast: ['noor', 'rhea', 'ansel', 'mae'] }, say: [
        ['caption', '(Inside, under the work lights. Ansel takes a cutting torch to the back doors of the van, because there is nothing in Kostas Salvage that cannot be opened by Ansel with a cutting torch.)'],
        ['caption', '(Grey cases. Dozens, stacked and strapped. And on top of them, alone, in a clear plastic bag like evidence: a green leather book.)'],
        ['noor', '(counting with her lips moving, a tablet in one hand, then giving up and just staring) That is... that is thirty million dollars.'],
        ['noor', "That's thirty million dollars and one very ugly book."],
        ['rhea', "(lifting the Tally out of its bag, weighing it in her hand) It's lighter than I thought."],
        ['ansel', 'Most things are, in the end.'],
        ['mae', '(not touching it, looking at it for a long time) Tommy died for that.'],
        ['jay', "Tommy died because a man with a badge was scared of a kid with a phone. (beat) That's just a book."],
        ['noor', '(at the scanner, frowning) He called them off. Horne called off his whole division. Why? He had you.'],
        ['rhea', 'Because honest cops open vans. Honest cops write down what\'s inside.'],
        ['rhea', "(looking at the chained doors) He's not finished, Mercer. He's just stopped writing it down."],
      ] },
      { if: 'dex_forgiven', then: [
        { scene: { at: 'kostas_salvage', cast: ['dex', 'noor'] }, say: [
          ['caption', '(The side door bangs. Dex comes in sweating through his coveralls, a pistol he has not fired once still in his hand, held out from his body like it might bite.)'],
          ['dex', "I lost the rear. There was no rear. I followed a bus for a while. (He sees the van. The cases. The book.) Is it— is that—"],
          ['jay', "It's in."],
          ['caption', '(Dex sits down on the concrete floor, all at once, the way a big man sits when his legs have decided for him.)'],
          ['dex', '(to the floor) Okay. Okay. (beat) Can somebody take this gun off me? I don\'t know how to put it down.'],
          ['noor', '(taking it from him with two fingers, like a dead mouse) Got it. I\'ve got it, Dex.'],
        ] },
      ] },
      { if: 'saved_teo', then: [
        { phone: 'teo', say: [
          ['teo', 'Tell me it\'s in.'],
          ['jay', "It's in."],
          ['teo', "(a long breath down the line, and fireworks still going behind him) Halberd's regrouping on Tannery. The Kings are keeping them busy. You'll get half of them tonight instead of all of them."],
          ['teo', "(beat) Pop would've had a heart attack. (beat) Bad joke. He'd have laughed at it, though."],
        ] },
      ], else: [
        { text: 'teo', message: 'Heard it on the scanner. Good.' },
      ] },
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'ansel'] }, say: [
        ['ansel', '(sitting down on an upturned crate, slowly, like a big tree deciding) We should sleep.'],
        ['rhea', 'Nobody sleeps. Load the rifles. Put the kettle on. In that order.'],
      ] },
    ],
  });

  // --- end of main missions ---

  S.missions.push(...act4);

  // ===================================================================
  // SIDE CHAIN 3: DEAD AIR (giver solace, after m12)
  // ===================================================================
  const deadair = [];

  S.side.push({
    id: 'side_deadair',
    title: 'Dead Air',
    giver: 'solace',
    unlockAfter: 'm12_the_councilmans_pool',
    missions: deadair,
  });
})();
