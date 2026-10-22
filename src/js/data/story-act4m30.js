/*
 * data/story-act4m30.js — m30 SALT AND IRON (Finale III), Act 4 of "Ten and Two".
 *
 * Half past three in the morning, straight on from m29: the van is inside
 * Kostas Salvage, the doors are chained, and Halberd and Horne's loyalists
 * have the yard. Rourke reads everybody's file out over a loudhailer. The
 * crew holds the doors for two minutes (rifles, snipers on the fish market,
 * Southside shotguns). Rourke threatens a fuel truck, Calloway-Auto style,
 * and the barricade at the gate has to go: Dex rams it and Jay covers him
 * (dex_forgiven), Dex rams it and drives north without a word (dex_banished),
 * or Jay blows the Ironclads it is chained to (dex_to_calder). Horne puts
 * out a false officer-down; Jay goes out as the bait in Lulu at heat five
 * with the helicopter on him while Noor cracks the police band, and Mae
 * lets the whole city hear her brother say "I'm not armed". The front was
 * a feint: Rourke's back-door team takes the Tally out of Kostas, and on
 * the open channel Ansel stands up for Mae and Noor. Jay clears Crane Row
 * under the orange gantry (Stavros's crane, where the rifle that killed
 * Augie sat); on the walkway forty metres up, a handrail Rourke skimmed the
 * bolts for lets go of him. In bay 14 Horne is arrested by Calder
 * (trusted_calder), or runs, is caught, and is cuffed to the Tidewater gate
 * with his own cuffs while Jay waits with him (refused_calder). Mae tells
 * him about Tommy's laces. Then Noor: Voss came to Saltmarsh himself for
 * the book, and a launch is heading for the end of the pier.
 *
 * Flags read: trusted_calder / refused_calder, saved_teo / chased_rourke,
 * dex_forgiven / dex_banished / dex_to_calder, solace_done, nightshift_done.
 * Flags set: none (the walkway choice, reach for Rourke or let him hang,
 * only changes lines; he falls either way).
 *
 * Invented here that later acts may lean on: Voss collected the Tally in
 * person from a Halberd runner on Harbor Road behind the fish market (the
 * first time he has set foot in Saltmarsh in decades), so in m31 he has the
 * book and Rhea still has the thirty million in the van at Kostas. Halberd
 * held the port maintenance contract and billed $140,000 for crane bolts
 * nobody fitted (Rourke's skim, on his phone with chased_rourke). Rourke's
 * ring is his late wife's; Jay ends the night with it in his jacket pocket.
 * Ansel is shot through and through, high in the left shoulder, put two
 * men down without killing either, and is stitched by Mae on Rhea's desk
 * (not Mercy: it is full of Southside). The back-door team leader is Brandt.
 * Rourke's daughter Margaret ("Maggie") sends back the money he sends her. Kostya fetched Lulu from Harbor Point on
 * the flatbed and paid an $11 ticket on her. The dashcam tape went out on
 * every Southside channel at 03:58 (and on Radio Free Vicehaven with
 * solace_done). With dex_forgiven, Birdie's JUNIOR DEPUTY sticker ends up
 * on Horne's chest; with refused_calder, Horne's second phone (Noor gives
 * it back to Jay) is taped over his badge with 0211 written on the tape,
 * and the m30 ending hands m31 Calder mid-way through his rights. With
 * trusted_calder, Calder has his gold watch in an evidence bag: exhibit
 * fourteen. Mae walks back to Kostas to stitch Ansel before m31 starts.
 *
 * Engine notes: the crew at Kostas are spawned at the top level so a
 * checkpoint retry rebuilds them. The crane walkway cannot be stood on, so
 * the climb and the duel are a blackout (the house style for climbs, as in
 * m18 and m20) and the fight before it is on the quay under the gantry.
 * Every blackout comes after the area is clear and the heat is zero, so
 * nobody shoots a frozen Jay. Ansel's stand is heard, not seen (the engine
 * cannot stage a fist fight between NPCs), on the open channel during the
 * drive back. Horne rides back to the gate as crew with his fists (he is
 * cuffed), so he really is in Lulu's back seat; a leave plus the next
 * scene that casts him parks him at the gate. Spawns that a retry needs
 * (Horne's cruiser) sit after their checkpoint. The mission ends with the
 * heat at zero so m31 can chain.
 */
(function () {
  'use strict';
  const S = window.VH.Data.story;

  // ------------------------------------------------------------ colours
  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const MUSTARD = 0xc9a227;
  const CALDER_GREEN = 0x2f4a3a;

  // ------------------------------------------------------------ helpers
  const lulu = (at, extra) => Object.assign({ spawnCar: 'lulu', type: 'lowrider', at, color: LULU_TEAL }, extra || {});
  const halberdSuv = (id, at, extra) => Object.assign({ spawnCar: id, type: 'ironclad', at, color: HALBERD }, extra || {});
  const halberdVan = (id, at, extra) => Object.assign({ spawnCar: id, type: 'bulwark', at, color: HALBERD }, extra || {});

  // Between the legs of the orange gantry on the quay (outskirts.js: the
  // orange gantry straddles x 404-420, z 539-553; the Pier 9 yard and bay 14
  // are just west of it, which is why the rifle on this crane could see
  // Augie).
  const ORANGE_FOOT = { name: 'The foot of the orange gantry', x: 410, z: 546, yaw: -Math.PI / 2 };

  // ---------------------------------------------- one new minor character
  Object.assign(S.characters, {
    brandt: {
      name: 'Brandt', role: 'Halberd team leader', age: 38,
      look: { skin: 0xe8c4a8, hair: 0x6e4a2c, top: 0x3a3f45, bottom: 0x2a2e33, shoes: 0x111111, build: 'average', hat: true },
      voice: { gender: 'male', pitch: 0.95, rate: 0.98 },
      bio: "Leads Rourke's quiet jobs. Says please and thank you. Has done this in nicer buildings.",
    },
  });

  // ------------------------------------------- Dex and the junior deputy
  // With dex_forgiven, wherever Horne ends up in handcuffs.
  const STICKER = { if: 'dex_forgiven', then: [
    { scene: { at: 'horne', cast: ['horne', 'dex'] }, say: [
      ['caption', '(Dex Calloway steps up in front of Captain Wade Horne. His hands are shaking. He lets them.)'],
      ['horne', '(the old smile, tired round the edges) Dexter. How\'s the junior deputy?'],
      ['dex', '(peeling something small and gold off the inside of his coverall pocket) She gave it back.'],
      ['caption', '(A VPD JUNIOR DEPUTY sticker, the gold gone soft at the corners. Dex presses it onto Horne\'s chest under the badge and smooths it flat with his thumb, the way you do it for a kid.)'],
      ['dex', "She says when somebody stops being your friend, you give them their sticker back. She's eight. She knows the rules."],
      ['horne', '(looking down at it) ...Calloway.'],
      ['dex', "(stepping back, to Jay, barely a voice) Can we go? I'd like to go now. I'd like to go and be sick somewhere that isn't here."],
    ] },
  ] };

  S.missions.push({
    id: 'm30_salt_and_iron',
    act: 4,
    title: 'Salt and Iron',
    giver: 'jay',
    start: 'chain',
    resumeAt: 'kostas_salvage', // where it waits if the chain was interrupted
    time: 3.5,
    estMinutes: 12,
    summary: 'Halberd and Southside come for the money, and Jay finishes it with Horne where it began.',
    failIf: ['wrecked:lulu', 'dead:mae', 'dead:noor', 'dead:ansel'],
    steps: [
      { music: 'off' },
      lulu('kostas_salvage'),
      { spawn: [
        { char: 'noor', at: 'kostas_salvage', offset: [3, 4], behavior: 'idle', health: 3000 },
        { char: 'mae', at: 'kostas_salvage', offset: [6, 5], behavior: 'idle', health: 3000 },
        { char: 'ansel', at: 'kostas_salvage', offset: [4, 7], behavior: 'idle', health: 3000 },
        { char: 'rhea', at: 'kostas_salvage', offset: [1, 3], behavior: 'idle', health: 1500 },
        { char: 'kostya', at: 'kostas_salvage', offset: [8, 7], behavior: 'cower', health: 900 },
        { char: 'deb', at: 'kostas_salvage', offset: [7, 9], behavior: 'cower', health: 900 },
      ] },
      halberdVan('barricade_a', 'kostas_salvage', { offset: [10, 8] }),
      halberdVan('barricade_b', 'kostas_salvage', { offset: [14, 12] }),
      halberdSuv('siege_suv', 'kostas_salvage', { offset: [18, 16], locked: true }),
      { spawnCar: 'siege_cruiser', type: 'interceptor', at: 'kostas_salvage', offset: [22, 18], police: true, locked: true },
      { camera: 'kostas_salvage', seconds: 6, say: [
        ['caption', 'Kostas Marine Salvage. 03:31.'],
        ['caption', '(Outside the rolled-down doors, every floodlight in the yard comes on at once.)'],
        ['caption', '(Charcoal vans nose to nose across the gate. Men in polos with rifles. And behind them, a row of Southside cruisers with their lights off.)'],
      ] },
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'noor', 'ansel', 'mae', 'kostya', 'deb'] }, say: [
        ['caption', '(Inside, under the work lights, an armoured van with its back doors cut open, and thirty million dollars in grey cases.)'],
        ['caption', "(On Rhea's pallet desk, in a clear plastic bag, a green leather book.)"],
        ['caption', "(On a camping stove by the propellers, Rhea's kettle starts to whistle.)"],
        ['rourke', '(on a loudhailer, outside, unhurried) Good morning, Kostas Salvage. This is Kessler Rourke, Halberd Security. I\'ll keep this short. I bill by the hour.'],
        ['rhea', '(taking the kettle off the flame) Of course he does.'],
        ['rourke', 'There is a vehicle in your building that belongs to my client. Open the doors, walk out with your hands empty, and everyone goes home.'],
        ['noor', "(at four screens on a pallet, not looking up) “Everyone goes home” is what they say right before nobody goes home. It's in every film. I have a list. It has sub-headings."],
        ['rourke', "Ms. Haddad. Your father's shift at the Voss superstore starts at six. Aisle nine, tinned goods. He builds a very good pyramid."],
        ['caption', "(Noor's hands stop on the keyboard.)"],
        ['rourke', 'Mr. Boateng. The Harbor Point Scholarship Fund. Post-office box four-one-one. That\'s a lovely thing you do.'],
        ['caption', '(Ansel, on an upturned crate with his bandaged palms open on his knees, goes very still. It is not his usual stillness.)'],
        ['mae', '(to Jay, low) How does he know that?'],
        ['jay', 'He plans for people. It\'s his whole thing.'],
        ['rourke', "Ms. Reyes. I don't have anything on you. I looked. You may be the only honest person in that building. I'd stand away from the others."],
        ['mae', "(to the doors, loud) Thanks. I'm good."],
        ['rourke', 'Mr. Mercer. Nothing personal. You have ten minutes.'],
        ['rhea', '(pouring tea into five chipped mugs without spilling a drop) Ten minutes. Augie would have spent nine of them on a speech.'],
        ['noor', "Is there a plan? Please say there's a plan. I'd take a bad plan. I'd take a list with one thing on it."],
        ['jay', '(looking at the doors, the van, the book) We hold the doors. When he runs out of men, he tries something else. When he tries something else, we go out the front.'],
        ['noor', "That's not a plan. That's a weather forecast."],
        ['jay', "Augie's notebook. Rule one: plans fail."],
        ['mae', 'And rule two?'],
        ['jay', "People don't have to."],
        ['caption', '(Nobody says anything. Rhea puts a mug in his hand. Ansel looks at his.)'],
        ['kostya', '(from behind a forklift) I fetched your car from the boardwalk. On the flatbed. She had a parking ticket.'],
        ['jay', 'Thanks, Kostya.'],
        ['kostya', 'I paid it. Eleven dollars. I want it back.'],
        ['deb', 'He wants it back tonight. In case you die.'],
        ['kostya', "I didn't say that part out loud, Deb."],
        ['rhea', "(her eyes on the gap under the doors) He's put men up the orange crane again. Stavros's crane. Same as the thirtieth."],
        ['rhea', 'The handrails up there have been rotten since spring. Halberd took the port maintenance contract. Billed a hundred and forty thousand for new bolts.'],
        ['kostya', 'Nobody came.'],
        ['rhea', "Nobody ever comes. (She racks Stavros's shotgun.) Drink your tea, Mercer. Then hold my door."],
        ['mae', "(dropping her bag behind a block of rust-red iron the size of a car) This is my corner. Stavros's counterweight, off number four."],
        ['mae', "Nobody gets hit. If you get hit, you crawl to me. If you can't crawl, you shout. If you can't shout, I come and get you, and then I'm angry."],
        ['ansel', '(quietly, to his hands) He knows the box number.'],
        ['noor', 'Ansel.'],
        ['ansel', "It's all right, Noor. (He folds the bandaged hands together, slowly, like a letter.) It's only a box."],
      ] },

      // ---------------------------------------------- before the doors go
      { if: 'dex_forgiven', then: [
        { scene: { at: 'kostas_salvage', cast: ['dex', 'rhea'] }, say: [
          ['caption', "(Behind the propellers, Dex Calloway is lying under his own tow truck with a welding torch. It is the calmest anybody has seen him in a month.)"],
          ['dex', "(sliding out on a creeper, goggles up) Push bar. A railway sleeper and two exhaust brackets. It's not road legal. Nothing I own is road legal any more. I've made my peace."],
          ['rhea', "That's my railway sleeper."],
          ['dex', "It was holding up a lifeboat full of pigeons, Rhea. The pigeons have been rehomed."],
          ['jay', "What's it for?"],
          ['dex', "(wiping his hands on a rag that makes them dirtier) They've got two vans across your gate. Somebody's going to have to move them. (beat) I move cars. It's the one thing."],
          ['jay', 'Dex.'],
          ['dex', "Don't. If you say something nice I'll cry in front of Rhea, and she'll put it in the ledger."],
          ['rhea', '(writing) Already have.'],
        ] },
      ] },
      { say: [
        ['caption', '(Rhea kicks a crate across the concrete: rifle magazines, and the last of the shipwreck grenades in their straw. Deb buckles a vest on Jay that says PORT AUTHORITY on the back.)'],
        ['deb', "It's Kostya's. It's a bit big. Everything of Kostya's is a bit big."],
        ['kostya', '(from behind the forklift) It is a normal size, Deb.'],
      ] },
      { reward: { weapons: ['rifle', 'grenade'], armor: 100 } },
      { if: 'saved_teo', then: [
        { phone: 'teo', say: [
          ['teo', '(sirens and a crowd behind him) Tannery Row is still on fire. The fun kind. Half of Halberd is up here trying to arrest a firework.'],
          ['teo', "Which means you've got the other half. (beat) Sorry. They're the good half."],
          ['jay', 'Keep them busy.'],
          ['teo', "They're busy. (beat) Jay. The orange crane. The one they shot the old man from. Is that where they are?"],
          ['jay', 'Yeah.'],
          ['teo', '(a long breath down the line) Then get them off it.'],
        ] },
      ], else: [
        { text: 'teo', message: "Scanner says Halberd's moving everything they've got to Saltmarsh. Everything. Whatever you're doing, do it faster." },
      ] },
      { spawn: [{ id: 'salt', faction: 'salts', hostile: false, at: 'kostas_salvage', offset: [2, 8], count: 2, weapon: 'rifle', behavior: 'follow' }] },
      { join: ['rhea'], weapon: 'shotgun' },

      // ------------------------------------------------------- the siege
      { music: 'action' },
      { survive: 120, checkpoint: true, objective: 'Hold the doors of Kostas Salvage. Rifles in the yard, snipers on the stacks.', waves: [
        { at: 'kostas_salvage', count: 4, weapon: 'smg', faction: 'halberd', delay: 2 },
        { at: 'container_maze', count: 3, weapon: 'rifle', faction: 'halberd', delay: 14 },
        { at: 'kostas_salvage', count: 3, weapon: 'shotgun', faction: 'vpd', delay: 28 },
        { at: 'fish_market', count: 2, weapon: 'sniper', faction: 'halberd', delay: 40, accuracy: 0.35 },
        { at: 'kostas_salvage', count: 4, weapon: 'rifle', faction: 'halberd', delay: 54 },
        { at: 'container_maze', count: 3, weapon: 'smg', faction: 'vpd', delay: 68 },
        { at: 'kostas_salvage', count: 4, weapon: 'shotgun', faction: 'halberd', delay: 82 },
        { at: 'fish_market', count: 2, weapon: 'sniper', faction: 'halberd', delay: 92, accuracy: 0.35 },
      ], say: [
        ['rourke', '(on the loudhailer) Ten minutes. Thank you for your patience.'],
        ['caption', '(The floodlights on the first van go dark. Then the yard lights up a different way.)'],
        ['rhea', "(firing) Doors! Kostya, the chain! Salts, low and left! NOT my propellers!"],
        ['noor', "Six at the front. Two on the stacks. Three— four— I'm counting, I can't stop counting, it's a medical condition—"],
        ['mae', '(dragging a docker behind the counterweight by his collar) You! Crawl! Good! Now hold this and think about your mother!'],
        ['rourke', '(on the loudhailer, between bursts) Mr. Mercer. Heron Street. The pink one. The lemon tree is coming along nicely.'],
        ['jay', '(reloading, to nobody) Leave the tree out of it.'],
        ['noor', 'Snipers! On the fish market roof! Two! Who brings SNIPERS to a warehouse?'],
        ['rhea', 'People who have met him.'],
        ['horne', '(on a Southside loudhailer now, from behind the cruisers, jovial) Kostas Salvage, this is the Vicehaven Police Department. Ha. Always wanted to say that through one of these.'],
        ['mae', "(not looking up, red to the wrists) Jay. Are you hit? Don't lie. Your left eye does a thing."],
        ['jay', 'Not hit.'],
        ['mae', "Your left eye's doing the thing."],
        ['jay', "It's a graze."],
        ['mae', "Then it's mine after. Go."],
        ['ansel', '(on his crate, palms open on his knees, very still) I am counting too, Noor. I am counting the ones who are still getting up.'],
        ['rhea', '(firing, reloading, firing) That one is for number four. That one is for the bolts. That one is because I felt like it, you bastards.'],
      ] },

      // ----------------------------------------------------- the gate
      { music: 'tension', checkpoint: true },
      { say: [
        ['rourke', "(on the loudhailer, unbothered) Thank you. That was the expensive part. Here's the cheap part."],
        ['rourke', "There's a fuel truck on Harbor Road. Calloway Auto took eleven minutes. Your building is older and drier, Ms. Kostas. I'd rather not. Fuel is expensive."],
        ['rhea', '(very quietly, to the doors) He burned Calloway\'s.'],
        ['jay', "Then we don't stay in here."],
        ['rhea', 'The gate. Two vans nose to nose, and rifles behind them. Nobody drives out of this yard until that gate is open.'],
        ['noor', "(at her screens, fast) And Jay— Horne just put out an officer-down call. Kostas Salvage. Every cop in the city is coming, and the honest ones will shoot whoever drives out first."],
        ['jay', 'Then I drive out first.'],
        ['noor', "That's— no, that's the opposite of— (beat) Oh. Oh, you're the bait. You're going to be the bait. I hate that I understand."],
      ] },
      { leave: ['salt_0', 'salt_1'] },
      { if: 'dex_forgiven', then: [
        { spawnCar: 'dex_tow', type: 'mesa', at: 'kostas_salvage', offset: [-8, 2], color: MUSTARD },
        { spawn: [
          { id: 'gate_rifle', faction: 'halberd', at: 'barricade_a', offset: [5, 7], count: 3, weapon: 'rifle', behavior: 'guard', group: 'gate' },
          { id: 'gate_smg', faction: 'halberd', at: 'barricade_b', offset: [4, -6], count: 2, weapon: 'smg', behavior: 'guard', group: 'gate' },
          { id: 'dex_ram', at: 'dex_tow', behavior: 'drive', car: 'dex_tow', to: 'barricade_a', hostile: false },
        ], say: [
          ['dex', '(on the radio, the tow truck roaring out from behind the propellers) Okay. Okay okay okay. Everybody hold onto something that isn\'t me.'],
          ['rhea', 'Calloway, that is a pickup truck with a plank on it.'],
          ['dex', "(on the radio) It's an INVESTMENT!"],
        ] },
        { wait: 3 },
        { slowmo: 2, say: [
          ['caption', '(A mustard tow truck with CALLOWAY AUTO on its doors and a railway sleeper on its nose goes across the yard at the gap between two armoured vans, and does not slow down.)'],
        ] },
        { say: [
          ['caption', "(The sound is enormous. The vans swing apart like a pair of gates. The tow truck stops dead between them with its bonnet folded up like a paper hat and steam pouring out of it.)"],
        ] },
        { spawn: [{ char: 'dex', at: 'dex_tow', offset: [2, 0], behavior: 'cower', health: 500 }] },
        { protect: 'dex' },
        { kill: 'group:gate', objective: "Cover Dex. He's pinned in the wreck, and they're coming for him.", say: [
          ['dex', "(under the truck now, flat on the concrete) I'm good! I'm fine! I'm alive! I can't feel my eyebrows! Is that a Stavros thing?"],
          ['rhea', '(on the radio) That is very much a Stavros thing.'],
          ['dex', "They're coming round the side! Jay! JAY! I am VERY visible right now!"],
          ['jay', 'Stay down.'],
          ['dex', "I'm the most down I've ever been! Ask Kostya! Kostya knows down!"],
        ] },
        { join: ['dex'], weapon: 'pistol', say: [
          ['dex', "(crawling out, dusting off, staring at what's left of his truck) She's totalled. She's completely— (beat) Worth it. That's a sentence I never thought I'd say about a vehicle."],
          ['jay', "You're with me."],
          ['dex', "(already walking to Lulu, already reaching for the belt) I know. I know. Seatbelt."],
        ] },
      ] },
      { if: 'dex_banished', then: [
        { spawn: [
          { id: 'gate_rifle', faction: 'halberd', at: 'barricade_a', offset: [5, 7], count: 3, weapon: 'rifle', behavior: 'guard', group: 'gate' },
          { id: 'gate_smg', faction: 'halberd', at: 'barricade_b', offset: [4, -6], count: 3, weapon: 'smg', behavior: 'guard', group: 'gate' },
        ] },
        { kill: 'group:gate', count: 2, objective: 'Open the gate. Take out the rifles behind the vans.', say: [
          ['noor', "Two behind the left van. Three behind the right. And one on the van roof, he's lying down, he thinks he's clever—"],
          ['rhea', "(on the radio) Mercer, you're pinned. Stay pinned. Pinned is alive."],
        ] },
        { spawnCar: 'dex_tow', type: 'mesa', at: 'kostas_salvage', offset: [-44, 0], color: MUSTARD },
        { spawn: [{ id: 'dex_wheel', at: 'dex_tow', behavior: 'drive', car: 'dex_tow', to: 'barricade_a', hostile: false }] },
        { say: [
          ['noor', "(fast) Headlights on Harbor Road. One vehicle. Coming in hot. It's— it's not a cruiser. It's yellow. Why is it yellow?"],
          ['caption', "(A mustard tow truck with CALLOWAY AUTO on its doors, lights off, comes up Harbor Road at a speed it was never built for. There is a child's car seat in the cab, empty.)"],
        ] },
        { slowmo: 2, say: [
          ['caption', '(It hits the gap between the two armoured vans dead centre. The vans swing apart like a pair of gates. Halberd men dive both ways.)'],
        ] },
        { spawn: [{ id: 'dex_gone', at: 'dex_tow', behavior: 'drive', car: 'dex_tow', to: 'downtown', hostile: false }] },
        { say: [
          ['caption', "(The tow truck stops. Its door doesn't open. For one second, through a cracked windscreen, a big man in navy coveralls looks across the yard at Jay. He doesn't wave.)"],
          ['caption', '(Then it reverses out, indicates for an empty road, and drives away north at exactly the speed limit.)'],
          ['jay', '(barely aloud) ...Dex.'],
        ] },
        { kill: 'group:gate', objective: 'The gate is open. Finish it.' },
        { text: 'dex', message: "We're square. We're never square." },
      ] },
      { if: 'dex_to_calder', then: [
        halberdSuv('gate_suv', 'kostas_salvage', { offset: [12, 10], locked: true }),
        { spawn: [
          { id: 'gate_rifle', faction: 'halberd', at: 'barricade_a', offset: [5, 7], count: 3, weapon: 'rifle', behavior: 'guard', group: 'gate' },
          { id: 'gate_smg', faction: 'halberd', at: 'barricade_b', offset: [4, -6], count: 2, weapon: 'smg', behavior: 'guard', group: 'gate' },
        ] },
        { say: [
          ['rhea', "(looking out at the gate through a bullet hole) The vans are chained to the Ironclads behind them. Blow the Ironclads, and the whole thing drags open."],
          ['rhea', 'No Calloway tonight?'],
          ['jay', "He's telling the truth to a lady with a grey stripe in her hair."],
          ['rhea', '(racking the shotgun) Good for him. Bad for us. Throw far.'],
        ] },
        { destroy: ['gate_suv', 'siege_suv'], objective: 'Blow the barricade. Grenades on the two Ironclads chained to the vans.', say: [
          ['noor', 'Wind off the water. Rhea says throw left of where you think. I say I have no idea, I failed PE.'],
          ['rhea', '(on the radio) Throw it and get your head down! Stavros never got his head down!'],
          ['noor', "The vans are bulletproof! The Ironclads aren't! I read the brochure! There's a brochure!"],
        ] },
        { kill: 'group:gate', objective: 'The gate is open. Clear the rifles behind it.' },
      ] },
      { spawn: [{ char: 'garza', at: 'barricade_b', offset: [3, 3], behavior: 'flee', flee: 12 }] },
      { say: [
        ['garza', "(crawling out from under the second van with his hands already up) I was SITTING in that! I was sitting in it having a coffee!"],
        ['jay', 'Hi, Lucky.'],
        ['garza', '(running backwards, then forwards, then away) Every time! I asked for the airport! They have a DESK at the airport!'],
      ] },
      { leave: ['rhea'] },

      // ------------------------------------------------- press play
      { if: 'refused_calder', then: [
        { scene: { at: 'kostas_salvage', cast: ['mae', 'noor'] }, say: [
          ['caption', '(Jay takes something out of the inside pocket of his jacket, where it has lived since a night on the seawall.)'],
          ['caption', "(A black dashcam drive in a police evidence bag. He puts it in Mae's hand.)"],
          ['mae', 'What is this?'],
          ['jay', 'Tommy.'],
          ['caption', "(Mae looks down at it. She knows what is on it. Jay told her, once, in a booth at the Starlite. She has never heard it.)"],
          ['noor', "(very gently, already plugging in a cable) If I can get it on the police band, every car Horne sends here hears it. Every one. In the car. With the windows up."],
          ['mae', '(not looking up) Who reads it out?'],
          ['noor', 'Nobody reads it out. You just... press play.'],
          ['mae', '(closing her fingers round it) Then I press play.'],
          ['noor', "(pressing something else into Jay's hand: a cheap black phone with a cracked corner) And take Horne's phone back."],
          ['noor', "I've copied it eleven times, to four continents. It's sentimental now."],
        ] },
      ], else: [
        { scene: { at: 'kostas_salvage', cast: ['mae', 'noor'] }, say: [
          ['noor', "(staring at her screen) Calder just sent me a file. No message. Just a file. It's called 1-ADAM-9."],
          ['caption', "(Mae goes very still. She knows what is on it. Jay told her, once, in a booth at the Starlite. She has never heard it.)"],
          ['noor', '(very gently) If I can get it on the police band, every car Horne sends here hears it. Every one. In the car. With the windows up.'],
          ['mae', 'Who reads it out?'],
          ['noor', 'Nobody reads it out. You just... press play.'],
          ['mae', '(pulling up a crate next to her at the screens) Then I press play.'],
        ] },
      ] },
      { scene: { at: 'kostas_salvage', cast: ['mae'] }, say: [
        ['mae', "(standing) You're going out there so they all follow you."],
        ['jay', 'They always follow the driver.'],
        ['caption', "(She pulls the strap of Kostya's vest tight, which doesn't need doing, and pats it twice. She doesn't know where she got that from. He does.)"],
        ['mae', "Come back in one piece. That's not a request. It's a clinical instruction."],
        ['jay', "Yes, ma'am."],
        ['mae', "(already turning back to the screens) Don't ma'am me. I'm twenty-eight. I'll ma'am you."],
      ] },
      { getIn: 'lulu', objective: 'Get in Lulu. Out through the gate. Be the bait.' },
      { music: 'action' },
      { heat: 5, checkpoint: true, say: [
        ['horne', '(on the police band) All units, all units. Officer down at Kostas Marine Salvage. Suspect vehicle is a teal two-door, a classic. Driver is Jay Mercer. Driver is armed.'],
        ['horne', '(on the police band) Use whatever you need.'],
        ['caption', "(Every siren in Vicehaven turns toward Saltmarsh at once. Over the cranes a helicopter's searchlight finds Lulu, and stays on her like a hand on a shoulder.)"],
      ] },
      { survive: 75, objective: "Keep every cop in the city on your tail. Noor needs seventy-five seconds. Don't get caught.", say: [
        ['noor', "(on the radio) The police band is encrypted. Which is a big word for what it is. Seventy-five seconds. Don't die. Don't get arrested. In that order."],
        ['jay', "(to the car, a cruiser's bonnet going past his window close enough to read the number) Come on, old girl. Everybody's looking at you. You love that."],
        ['noor', '(on the radio) Roadblock! Two Bulwarks! Go round— go through the fish market, nobody ever goes through the—'],
        ['caption', '(Lulu goes through the fish market. The fish market will talk about it for years.)'],
        ['rhea', '(on the radio) They are all following you. Every single one. Like ducks.'],
        ['horne', "(on the police band) Box him in! He's one car! He's one OLD car!"],
        ['jay', "(quietly, to the dash) He's never driven you, has he."],
        ['noor', "(on the radio) Forty seconds. The helicopter's on you. I can't do anything about the helicopter. I tried. It doesn't have traffic lights."],
        ['noor', "(on the radio, lower) Twenty. Mae's got her hand on the key. She's— she's just looking at it."],
        ['mae', "(on the radio, very quiet) I'm ready."],
        ['noor', "(on the radio) Ten. Nine. Jay, whatever you do, don't get arrested in the next nine seconds. It would really spoil the moment."],
      ] },
      { music: 'off' },
      { say: [
        ['mae', '(on every police radio in Vicehaven at once, steady as a hand on a chest) This is Mae Reyes. Medic 12, out of Mercy General. Some of you know me.'],
        ['mae', "Some of you have put your partners in the back of my ambulance. I've held their hands. Most of them lived."],
        ['mae', "This is my brother. He was nineteen. This is Pier 9, three years ago, from the dashcam of unit 1-Adam-9. That's Captain Horne's car."],
        ['caption', '(A click. Sirens, far off and closing. Tyres on wet concrete. Running feet on gravel.)'],
        ['tommy', "(close to the microphone, out of breath) I'm not— I'm not armed, I'm not—"],
        ['caption', '(One shot.)'],
        ['horne', '(on the tape, three years younger) Drop it! Drop it!'],
        ['caption', '(Then nothing. On every police channel in the city, for eleven seconds, nothing at all.)'],
        ['caption', '(03:58. In a hundred patrol cars with the windows up, a hundred people who once joined to help somebody sit and listen to the nothing.)'],
      ] },
      { if: 'trusted_calder', then: [
        { say: [
          ['calder', '(on the police band) All units, this is Detective Ines Calder, Robbery-Homicide. The officer-down call at Kostas Salvage is false. There is no officer down.'],
          ['calder', '(on the police band) The only person ever shot in that yard is the boy you just heard. Stand down. Go home. (beat) Please.'],
          ['DISPATCH', '(on the police band, a long pause) ...All units, Central. Confirming. Disregard the officer-down.'],
        ] },
      ], else: [
        { say: [
          ['DISPATCH', "(on the police band, after a silence, a woman's voice that isn't reading from anything) ...All units, Central. Disregard the officer-down. There is no officer down."],
          ['DISPATCH', '(on the police band, quieter) There never was.'],
        ] },
      ] },
      { if: 'solace_done', then: [
        { say: [
          ['solace', "(on the radio, Harbor Heat, 103.7, stolen) That was Tomás Reyes, Vicehaven. Nineteen. I've had it on a loop since three fifty-eight, and I'll be playing it until somebody stops me."],
          ['solace', '(on the radio) Nobody is stopping me.'],
        ] },
      ] },
      { heat: 0, say: [
        ['caption', '(Behind Lulu, one by one, the cruisers turn their lights off. They pull over. One of them just stops in the middle of Harbor Road with its door open, and nobody gets out.)'],
        ['horne', "(on the police band) That's a fake. That's doctored. Units, respond. (beat) Units. RESPOND."],
        ['caption', "(Nobody does. The helicopter tilts, and slides away over the bay toward the city, and its searchlight goes out like an eye closing.)"],
        ['noor', '(on the radio, very quietly) Mae? ...She\'s okay. She\'s sitting down. She asked me to play it once more. Just for her. I\'m playing it once more.'],
      ] },

      // ------------------------------------------------- the back door
      { music: 'tension' },
      { spawn: [
        { id: 'backdoor', faction: 'halberd', at: 'kostas_salvage', offset: [-7, 7], count: 3, weapon: 'rifle', behavior: 'guard', group: 'backdoor' },
        { id: 'backdoor_smg', faction: 'halberd', at: 'kostas_salvage', offset: [7, -5], count: 2, weapon: 'smg', behavior: 'guard', group: 'backdoor' },
      ] },
      { say: [
        ['noor', '(on the radio, a whisper that is mostly breath) Jay. Jay. The back. The river side. They came in through the propellers.'],
      ] },
      { goto: 'kostas_salvage', vehicle: 'lulu', radius: 12, checkpoint: true, objective: "They're inside Kostas. Get back there. NOW.", say: [
        ['caption', '(On the open channel: boots on concrete. A polite voice. An indoor voice. A man who has done this in nicer buildings.)'],
        ['brandt', "Ms. Haddad. Hands off the keyboard, please. Thank you. You're very good. Mr. Rourke says you're very good."],
        ['brandt', "The book, please. No, don't point. Fetch it. I'm on a clock."],
        ['noor', "(on the open channel, small) It's on the desk. In the bag. It's just... on the desk."],
        ['brandt', '(away from the microphone) Runner. The quay. Mr. Rourke. Go.'],
        ['caption', '(Running feet, going away. The back door bangs. Somewhere out there a green book is going down the quay in the hands of a boy in a charcoal polo.)'],
        ['brandt', 'The paramedic. Hands where I can see them.'],
        ['mae', "(on the open channel, not moving) My hands are in a man's leg. If I take them out, he bleeds out on your boots. Your choice. They're nice boots."],
        ['brandt', 'Keep them there.'],
        ['brandt', "Mr. Boateng. Sit down, please. You don't need to get up. Box four-one-one. Ms. Solano, third year. Coral. That's lovely."],
        ['caption', '(A long silence. Then the creak of an upturned crate as a very big man gets up off it.)'],
        ['ansel', "(gently) Put it down, son. You don't want to learn what I already know."],
        ['brandt', 'Sit DOWN.'],
        ['ansel', "I'm very good at standing up."],
        ['caption', '(A shot.)'],
        ['noor', '(a scream, cut off) ANSEL—'],
        ['caption', '(Then a sound Noor will hear for the rest of her life: something very heavy moving very fast. Two more after it, like sacks of cement coming off the back of a lorry.)'],
        ['caption', '(Then nothing.)'],
        ['noor', "(barely) ...Jay. They're on the floor. Two of them. And he's— Ansel's sitting down. There's so much—"],
        ['mae', '(on the open channel, suddenly very calm, the calm she uses on strangers) Noor. Here. Both hands. Lean on it. Lean. Good girl.'],
        ['mae', 'Jay. Three more in the yard with rifles and two at the back door. Get here. Get here now.'],
      ] },
      { music: 'action' },
      { kill: 'group:backdoor', objective: 'Clear the Halberd team out of Kostas Salvage' },
      { music: 'off' },
      { say: [
        ['caption', '(Quiet. Smoke hanging under the work lights. Somewhere at the back, a door to the river banging in the wind.)'],
      ] },
      { scene: { at: 'kostas_salvage', cast: ['ansel', 'mae', 'noor'] }, say: [
        ['caption', "(Mae's corner, behind Stavros's counterweight. Two Halberd men lie by the propellers, breathing, very still, their rifles kicked a long way off.)"],
        ['caption', '(Ansel sits against the iron with his shirt cut open.)'],
        ['caption', '(High in the left shoulder, in at the front and out at the back. Noor is still leaning on it with both hands. She has not let go since Mae told her to. She is not going to.)'],
        ['mae', "(working fast, not looking at Jay) Through and through. Missed everything that matters by the width of my patience. I'll stitch it here. Mercy's full of Southside tonight."],
        ['ansel', '(looking at the two men on the floor) They\'re asleep. They\'ll be fine. (beat) They\'ll be embarrassed.'],
        ['jay', 'Ansel.'],
        ['ansel', '(holding up his hands: the burn bandages from the fire, and over them, new blood on the knuckles) I hit them, Jay. I hit them both.'],
        ['ansel', "Twelve years I've not known if I still could. (He looks at his hands for a long time.) I still can."],
        ['mae', '(tying off, quiet) You stood up.'],
        ['ansel', "Most fights end when you stand up. (beat) That one didn't. So I did the rest."],
        ['noor', "(still leaning on him, crying, furious) You IDIOT. You enormous gardening IDIOT. He had a RIFLE."],
        ['ansel', 'He was pointing it at you.'],
        ['noor', "(beat) ...Okay. That's a good reason. I hate it. I hate that it's a good reason."],
      ] },
      { if: 'nightshift_done', then: [
        { scene: { at: 'kostas_salvage', cast: ['mae', 'ansel'] }, say: [
          ['caption', "(Mae's battered notebook has fallen out of her shirt pocket onto the concrete, open at the first page. Ansel sees it. She sees him see it.)"],
          ['mae', "(snatching it up, shoving it back in her pocket) Not tonight. I'm not writing anybody down tonight. Don't you dare."],
          ['ansel', '(very gently) Yes, Mae.'],
        ] },
      ] },
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'ansel', 'noor'] }, say: [
        ['rhea', '(coming in from the front with the shotgun hanging from one hand, looking at the open door to the river) My back door. Twenty years Stavros said, fix the back door, Rhea.'],
        ['rhea', '(beat) I was going to do it in the spring.'],
        ['noor', 'The book. They took the book. A boy took it, he ran down the quay, toward the cranes—'],
        ['rhea', "The orange crane. Rourke's up on the walkway. He's been up there all night, watching us like a landlord."],
        ['jay', '(picking up his rifle) Then I go up.'],
        ['ansel', "(catching his wrist with a bloody hand, gently) Jay. (beat) Don't learn it. What I know. Bring him down if you have to. Just don't learn it."],
      ] },

      // ------------------------------------------------- Crane Row
      { spawn: [
        { id: 'lt_rifle', faction: 'halberd', at: ORANGE_FOOT, offset: [-6, -8], count: 3, weapon: 'rifle', behavior: 'guard', group: 'lieutenants', armor: 50 },
        { id: 'lt_smg', faction: 'halberd', at: ORANGE_FOOT, offset: [-10, 8], count: 2, weapon: 'smg', behavior: 'patrol', group: 'lieutenants' },
        { id: 'lt_sniper', faction: 'halberd', at: 'the_quay', offset: [-6, -22], count: 2, weapon: 'sniper', behavior: 'guard', group: 'lieutenants', accuracy: 0.4 },
        { id: 'lt_cop', faction: 'vpd', at: ORANGE_FOOT, offset: [-16, 2], count: 2, weapon: 'shotgun', behavior: 'guard', group: 'lieutenants' },
      ] },
      halberdVan('quay_van', ORANGE_FOOT, { offset: [-14, -4], locked: true }),
      { getIn: 'lulu', objective: 'Lulu. Down the quay to the orange crane.' },
      { music: 'tension' },
      { goto: 'crane_row', vehicle: 'lulu', radius: 30, stop: false, checkpoint: true, objective: 'Crane Row. The orange gantry. Rourke is on the walkway.', say: [
        ['rhea', '(on the radio) Number four is the orange. Stavros drove her twenty-two years. Rourke is on the walkway over the boom. Seven under her, and two on the stacks with long rifles.'],
        ['jay', 'The handrails.'],
        ['rhea', "(on the radio) Rotten since spring. A hundred and forty thousand dollars of bolts. (beat) Don't lean on anything up there, Mercer."],
        ['rourke', "(on the loudhailer, from forty metres up, the voice coming down out of the dark like weather) Mr. Mercer. I wondered when you'd come. Drivers always come back to the car."],
      ] },
      { music: 'action' },
      { kill: 'group:lieutenants', objective: "Take Crane Row. Rourke's men under the orange gantry, snipers on the stacks.", say: [
        ['rourke', '(on the loudhailer, from high above) Left flank, two men. He reloads after six. He always reloads after six. I have watched a great deal of footage.'],
        ['rhea', '(on the radio) Sniper on the blue stack! Under the B of BALTIC!'],
        ['rourke', '(on the loudhailer) Mr. Mercer, I want you to know that none of this is personal.'],
        ['jay', '(firing) You keep saying that.'],
        ['rourke', '(on the loudhailer) Because people keep not believing it.'],
        ['noor', "(on the radio, wet-voiced, typing) Mae's stitching Ansel on Rhea's desk. He's reading her a poem about it. She's told him to stop twice. He's on the second verse."],
        ['horne', '(somewhere among the containers, hoarse, into a radio that has stopped answering) Units. Any unit. ...Anybody.'],
        ['rhea', "(on the radio) Horne's down there with you. Behind the van. He came down to the quay without his cops. He looks smaller without them."],
      ] },
      { music: 'tension' },
      { say: [
        ['caption', '(The quay goes quiet. High above it, on the walkway along the boom of the orange crane, a man in a charcoal polo is standing very still, looking down.)'],
      ] },
      { blackout: [
        ['caption', '(The ladder up the leg of the orange gantry. A hundred and sixty rungs. He counts them. He has been counting things all his life without noticing.)'],
        ['caption', '(At the top, the walkway: a steel grating a metre wide, forty metres over the quay, running out along the boom above black water.)'],
        ['caption', '(The handrail is orange. The bolts holding it are brown.)'],
        ['caption', '(Kessler Rourke is halfway along it, a pistol held loosely at his side, the way other men hold their car keys.)'],
        ['rourke', '(pleasantly) You were slower than I modelled. I had you up here four minutes ago.'],
        ['jay', "Where's the book?"],
        ['rourke', 'Gone. A boy took it down the quay twenty minutes ago and put it in a white car on Harbor Road, behind the fish market.'],
        ['rourke', 'Mr. Voss came for it himself. The first time he has set foot in Saltmarsh in forty years. (beat) He held a handkerchief over his nose.'],
        ['jay', 'And left you up here.'],
        ['rourke', "I'm the invoice, Mr. Mercer. Somebody always has to stay behind and be paid."],
        ['caption', '(Wind along the boom. Below them the whole port lies small and orange and lit, like something under glass.)'],
      ] },
      { if: 'chased_rourke', then: [
        { blackout: [
          ['jay', 'A hundred and forty thousand. The port maintenance contract. Crane bolts. It was on your phone. The one I took off you at the Crown.'],
          ['rourke', '(a small laugh, the first real thing he has let out all night) You read the ledger.'],
          ['jay', "All of it. Your skim. The bolts you billed and never bought. The money you send Maggie every month, that she sends back."],
          ['rourke', "(glancing at the rail beside his hand) I was going to fit them. I'm a man who fits things. I just never had a quarter where it made sense."],
        ] },
      ], else: [
        { blackout: [
          ['jay', 'Rhea says you billed the port a hundred and forty thousand dollars for new bolts on this crane.'],
          ['rourke', '(glancing at the rail beside his hand, mildly) Ms. Kostas keeps a very good ledger.'],
          ['jay', 'Nobody came to fit them.'],
          ['rourke', "Nobody ever comes, Mr. Mercer. That's the whole business model."],
        ] },
      ] },
      { blackout: [
        ['rourke', "(raising the pistol, in no hurry at all) I'm sorry about Mr. Vance. I'd like that on the record. It was a job. He was very good at his."],
        ['jay', 'He never fired a shot. Thirty years.'],
        ['rourke', "I know. I read his file too. (beat) That's why it had to be a rifle, from a long way off. Up close, he'd have talked me out of it."],
        ['caption', '(He takes one step back to give himself room, and puts his free hand on the orange rail, the way anybody would.)'],
        ['caption', '(The rail goes. Not with a crack. With a sigh: four brown bolts letting go of something they were never really holding.)'],
        ['caption', '(Kessler Rourke goes over the edge, catches the grating with one hand, and hangs there, forty metres over the quay.)'],
        ['caption', '(The pistol goes down into the dark ahead of him, turning over and over.)'],
      ] },
      { choice: { prompt: 'Rourke is hanging from the walkway by one hand.', options: [
        { label: 'Reach for him.', then: [
          { blackout: [
            ['caption', "(Jay gets down flat on the grating and reaches, and gets a wrist. Rourke's hand is warm and very steady: the hand of a man who has never once been surprised.)"],
            ['rourke', '(looking up at him, almost curious) Why?'],
            ['jay', '(through his teeth) Nobody gets left in the lot.'],
            ['rourke', "(beat) That isn't in your file."],
            ['caption', "(With his free hand Rourke unbuttons his breast pocket, takes out a plain gold ring, and pushes it into Jay's fist, the one that is holding him.)"],
            ['rourke', "My wife's. I take it off for work. (beat) My daughter is Margaret. She won't speak to me. She's very sensible. Give her that, and don't tell her where it's been."],
            ['caption', "(Then he begins, carefully, one finger at a time, the way a man takes off a glove, to open Jay's hand from the inside.)"],
            ['rourke', "(checking his watch, out of habit) Twenty past four. I bill to the quarter hour. (beat) Round it up."],
            ['caption', "(And then there is nothing in Jay's hand but the ring.)"],
          ] },
        ] },
        { label: 'Let him hang.', then: [
          { blackout: [
            ['caption', '(Jay does not move. He stands on the grating with his hands at his sides and looks down at the man who killed Augie Vance.)'],
            ['rourke', "(looking up, not offended in the least) Good. That's correct. That's what I'd do."],
            ['jay', "I know. That's why I'm not doing anything."],
            ['caption', '(Rourke nods, as if a report has come back exactly as he wrote it. With his free hand he unbuttons his breast pocket and sets a plain gold ring on the grating by Jay\'s boot.)'],
            ['rourke', "My wife's. I take it off for work. (beat) My daughter is Margaret. She won't speak to me. She's very sensible. Give her that, and don't tell her where it's been."],
            ['rourke', "(checking his watch, out of habit) Twenty past four. I bill to the quarter hour. (beat) Round it up."],
            ['caption', '(He lets go.)'],
          ] },
        ] },
      ] } },
      { slowmo: 1.5 },
      { camera: ORANGE_FOOT, seconds: 5, say: [
        ['caption', "(Forty metres. A man in a charcoal polo falls past twenty-two years of Stavros Kostas's orange paint without a sound, the way he did everything.)"],
      ] },
      { say: [
        ['rhea', '(on the radio, after a long silence) ...Bad bolts. Bad inspection. Bad morning.'],
        ['caption', '(At the foot of the ladder, Jay puts the ring in the inside pocket of his jacket, and does up the button.)'],
        ['noor', "(on the radio, suddenly) Horne! Horne's running! On foot, through the Pier 9 fence, into the transfer yard. He's heading for the bays."],
        ['rhea', '(on the radio) Of course he is. Where else would he go.'],
      ] },

      // ------------------------------------------------- bay fourteen
      { spawn: [
        { id: 'loyal', faction: 'vpd', at: 'pier9_gate', offset: [10, 22], count: 2, weapon: 'smg', behavior: 'attack', group: 'loyal' },
        { id: 'loyal_rifle', faction: 'vpd', at: 'bay_14', offset: [22, -16], weapon: 'rifle', behavior: 'guard', group: 'loyal' },
      ], checkpoint: true },
      // After the checkpoint, so a retry still has the car to chase.
      { if: 'refused_calder', then: [
        { spawnCar: 'horne_cruiser', type: 'interceptor', at: 'bay_14', police: true },
      ] },
      { music: 'action' },
      { kill: 'group:loyal', objective: 'Into the Pier 9 yard after Horne. His last loyal men are in the way.', say: [
        ['noor', "(on the radio) Three Southside in the yard. The only three who didn't turn their lights off. I've got their badge numbers. I've written them on my hand."],
        ['horne', '(somewhere ahead among the bays, hoarse) Hold the yard! That is an ORDER!'],
      ] },
      { music: 'off' },
      { goto: 'bay_14', vehicle: false, radius: 5, objective: 'On foot. Bay fourteen.' },
      { say: [
        ['caption', '(Sixty-eight metres. Augie paced it once, in daylight, with a tape measure.)'],
      ] },
      { scene: { at: 'bay_14', cast: ['horne'] }, say: [
        ['caption', '(A loading bay like the other thirty, except for a square of yellow paint on the concrete, newer than the rest.)'],
        ['caption', "(Captain Wade Horne is standing on it. He doesn't seem to know he is.)"],
        ['caption', '(No hat. One sleeve torn at the shoulder. The gold watch. His radio in his hand, still turned up, still saying nothing.)'],
        ['horne', '(not turning round) Thirty-one years. Thirty-one years, and not one of them answered.'],
        ['jay', 'They heard it.'],
        ['horne', "(turning, the old smile, only half of it arriving) A kid on a tape. You know what that is in court, son? It's a kid on a tape. I've got a badge. The badge is the reason."],
        ['jay', '(the rifle up, steady) You put a gun down next to him. Like keys.'],
        ['horne', '(looking down; noticing the paint under his shoes for the first time) ...Right about here. (beat) Four coats. Yellow is a bastard to cover.'],
        ['horne', '(spreading his hands, so the gold watch catches the floodlight) So. You gonna shoot a police captain, Mercer? On camera? In front of God and the Port Authority?'],
        ['caption', "(Jay doesn't answer. The rifle doesn't move. For a long moment the only sound in the yard is the floodlights humming.)"],
      ] },
      { if: 'trusted_calder', then: [
        { scene: { at: 'bay_14', cast: ['horne', 'calder'] }, say: [
          ['calder', '(from the dark behind him, quiet and very clear) Wade Horne. You are under arrest for the murder of Tomás Reyes.'],
          ['caption', '(Ines Calder steps out of the shadow of the loading dock in a grey blazer she has slept in, service pistol out, an empty coffee cup in her other hand.)'],
          ['caption', '(She sets the cup down on the concrete without looking.)'],
          ['horne', '(not turning) Ines. (beat) You bought me a cake once.'],
          ['calder', "Lemon. You didn't eat it. (beat) You have the right to remain silent. I'd really like you to use it."],
          ['caption', "(Horne's right hand drifts toward his hip. Toward the holster. Slowly, the way a man reaches for his keys.)"],
          ['calder', '(very softly) Please.'],
          ['caption', '(The hand stops. It hangs there in the floodlight for a long time. Then it opens, and both hands go behind his back, and he looks down at the yellow paint.)'],
          ['calder', '(cuffing him, her own hands not quite steady) Anything you say can and will be used against you. (She unbuckles the gold watch and drops it into an evidence bag.) Exhibit fourteen.'],
          ['horne', "That's my watch."],
          ['calder', "It's evidence, Wade. Everything you own is evidence now. Your boat is evidence."],
          ['calder', "(to Jay, her eyes never leaving Horne) Lower the rifle, Mercer. I've got him. (beat) I've got him."],
          ['jay', '(lowering it) ...How long were you back there?'],
          ['calder', "Since two. In the back of his cruiser, outside the fence. I said I'd be wherever he was when it fell apart. (beat) He keeps butterscotch in it. I ate all of it."],
        ] },
      ], else: [
        { scene: { at: 'bay_14', cast: ['horne'] }, say: [
          ['horne', "(softly, almost kindly) No. You won't. You're a driver. Drivers drive. (He taps the gold watch, twice.) Tick tock."],
          ['caption', '(Then he turns and runs, faster than a man of fifty-two has any right to, for the cruiser parked outside the south fence. On its flank, small and white: 1-ADAM-9.)'],
        ] },
        { leave: ['horne'] },
        { getIn: 'lulu', objective: "Back to Lulu. He's getting away in 1-Adam-9." },
        { music: 'action' },
        { chase: 'horne_cruiser', mode: 'catch', route: ['fish_market', 'harbor_point'], objective: "Stop Horne's cruiser. Box him in. He's not getting away twice.", say: [
          ['horne', '(on the police band, from his own car) This is Captain Horne, 1-Adam-9. I am in pursuit— I am BEING pursued. Any unit. Any unit.'],
          ['DISPATCH', '(on the police band, flat) 1-Adam-9, Central. Say again your call sign?'],
          ['noor', "(on the radio) He's asking for help on the one channel where everybody just heard him shoot a kid. Jay, I almost feel— no. No, I don't."],
          ['jay', "(to Lulu, closing on the cruiser's lights) Come on. Let's take him home."],
          ['rhea', '(on the radio) He is going for Harbor Point. Men like that always run toward the nice part of town.'],
        ] },
        { music: 'off' },
        { scene: { at: 'horne_cruiser', cast: ['horne'] }, say: [
          ['caption', '(1-ADAM-9 sits crumpled against the kerb with its lights still going, red, blue, red, for nobody.)'],
          ['caption', "(Horne climbs out of the driver's door on his hands and knees. His nose is bleeding. He finds his radio on the tarmac and holds onto it, and it says nothing.)"],
          ['horne', '(sitting on the kerb, breathing hard) Thirty-one years.'],
          ['jay', "(taking the handcuffs off Horne's own belt) Hands."],
          ['horne', 'Those are my cuffs.'],
          ['jay', 'I know.'],
          ['caption', '(He cuffs Captain Wade Horne with his own handcuffs and puts him in the back of Lulu. Then he leans in across a cuffed police captain, pulls the belt over him, and clicks it home.)'],
          ['horne', '(staring at him) ...What is that?'],
          ['jay', 'Seatbelt.'],
        ] },
        { join: ['horne'], weapon: 'fists' },
        { if: 'dex_forgiven', then: [
          { say: [
            ['dex', "(in the passenger seat, arms folded, staring straight ahead through the windscreen) I'm not talking to him. I want that noted. I am not talking to him."],
          ] },
        ] },
        { goto: 'pier9_gate', vehicle: 'lulu', objective: 'Take him back to Pier 9. To the Tidewater gate.', say: [
          ['horne', '(from the back seat, to the window) You know what Harlan promised me? Commissioner. An office on the fourteenth floor with a view of the whole bay.'],
          ['horne', "I'd have been good at it. That's the joke. I'd have been very good at it."],
          ['caption', '(Jay says nothing. He drives at exactly the speed limit.)'],
          ['horne', 'Where are we going, Mercer?'],
          ['jay', 'Where you left him.'],
          ['horne', "(a long beat; in the mirror, for the first time all night, he looks his age) I've got a boat. WADE IN. Thirty grand. I never once took it out."],
          ['jay', 'Dex told me.'],
          ['horne', '(almost a laugh) Calloway. Every month he talked about that garage. Like it was a person.'],
          ['horne', '(quieter, to the window) And nobody got hurt who mattered.'],
          ['caption', '(Jay brakes. Not hard. Exactly hard enough. Horne goes forward into the seatbelt Jay buckled him into, and stays there.)'],
          ['jay', '(pulling away again) Say it again and I take the belt off.'],
        ] },
        { say: [
          ['caption', '(The Tidewater gate.)'],
        ] },
        { scene: { at: 'pier9_gate', cast: ['horne'] }, say: [
          ['caption', '(Chain-link and floodlights, and the guard booth Augie stood in three years ago, watching.)'],
          ['caption', "(Jay cuffs Horne to the gate by one wrist, with the captain's own cuffs, facing into the yard. Facing the bay.)"],
          ['caption', "(Then he tapes Horne's cheap black phone over his badge with a strip of electrical tape from Lulu's glovebox. On the tape, in marker: 0211.)"],
          ['horne', "(looking down at it) What's that supposed to be?"],
          ['jay', 'Your PIN. In case anybody needs it.'],
          ['horne', '(beat; very quietly) ...Two-eleven.'],
          ['jay', 'And four seconds. You looked at your watch.'],
          ['caption', '(Jay sits down on the kerb by the guard booth with his back to the fence. Horne stares at him.)'],
          ['horne', 'What are you doing?'],
          ['jay', 'Waiting.'],
          ['horne', 'For what?'],
          ['jay', 'For somebody to come and get you. (beat) Nobody gets left in the lot.'],
          ['caption', '(Horne looks at him for a long time. Then at the yard. Then he stops looking at anything at all.)'],
        ] },
        { leave: ['horne'] },
      ] },

      // ---------------------------------------------- the junior deputy
      STICKER,

      // ------------------------------------------------------ his laces
      { music: 'sad' },
      { scene: { at: 'horne', cast: ['mae', 'horne'] }, say: [
        ['caption', "(Footsteps on the concrete. Mae Reyes comes up out of the dark with her bag on her shoulder and somebody else's blood to the elbows.)"],
        ['caption', '(She walked from Kostas. Nobody stopped her. Nobody would have dared.)'],
        ['caption', '(She stops a few feet from Wade Horne and looks at him the way she looks at a patient: all of him, quickly, missing nothing.)'],
        ['horne', '(and something in his face, for the first time all night, is not arranged) Ms. Reyes. Your brother—'],
        ['mae', "Don't."],
        ['caption', "(He doesn't.)"],
        ['mae', '(level, a paramedic giving a handover) I identified him. You know what I noticed? He\'d double-knotted his laces. He only ever did that when he was scared.'],
        ['mae', 'You saw a gun. I saw his laces.'],
        ['caption', '(She turns her back on Captain Wade Horne, walks over to Jay, and stands next to him. That is all.)'],
      ] },
      { scene: { at: 'horne', cast: ['mae'] }, say: [
        ['mae', '(looking at the yard, not at him) I heard it. On the band. Twice.'],
        ['jay', 'I know.'],
        ['mae', "He sounded so young. I forgot he sounded young. In my head he kept getting older with me."],
        ['caption', "(Jay holds his hand out between them, palm up, and doesn't look at it. After a while she puts hers in it. Hers is shaking. His isn't. Then it is.)"],
        ['mae', "(taking it back, picking up her bag) I've got a man on a desk with my stitches in him and a poem he won't stop reading. (beat) Go and get the book."],
        ['jay', 'Mae.'],
        ['mae', '(already walking, over her shoulder) Seatbelt.'],
      ] },
      { leave: ['mae'] },
      { if: 'refused_calder', then: [
        { spawnCar: 'calder_car', type: 'unmarked', at: 'pier9_gate', offset: [-16, 0], color: CALDER_GREEN },
        { scene: { at: 'horne', cast: ['calder', 'horne'] }, say: [
          ['caption', '(Headlights on Harbor Road. A dark green unmarked car comes up to the gate, stops crooked across it, and its engine coughs twice and dies.)'],
          ['calder', "(getting out, to the car) Not NOW, you piece of— (She sees what's on the gate. She stops.)"],
          ['calder', '...Oh, Wade.'],
          ['horne', 'Ines. Get me off this fence.'],
          ['calder', "(looking at the tape on his chest for a long time, then at Jay on the kerb) You could've driven off."],
          ['jay', "I've done that."],
          ['caption', "(Calder takes a card out of her blazer pocket that she plainly hasn't needed in years, and reads from it anyway, slowly, every word.)"],
          ['calder', "Wade Horne, I'm arresting you for the murder of Tomás Reyes. You have the right to remain silent. Anything you say—"],
        ] },
      ], else: [
        { say: [
          ['caption', '(Calder walks Horne out through the Tidewater gate to wait for a van from Central, one hand on his cuffs, an evidence bag with a gold watch in it in her pocket.)'],
          ['caption', '(He does not look back at bay fourteen. She does.)'],
        ] },
      ] },

      // ------------------------------------------------------- first light
      { setTime: 5.3 },
      { music: 'tension' },
      { phone: 'noor', say: [
        ['noor', "Jay. The book. I've got the fish market camera back up. (beat) It's him. He came himself."],
        ['noor', "Harlan Voss got out of a white car on Harbor Road and took the book out of a boy's hands. In Saltmarsh. He held a handkerchief over his face the whole time."],
        ['jay', 'Where is he now?'],
        ['noor', 'Running. Or about to. White car, two Halberd trucks, engines going, pointed east.'],
        ['noor', '(beat) And the port radio has a launch out of the marina with no name on the manifest. It\'s heading for the end of Oceanview Pier.'],
        ['noor', '(quieter) Jay. Look east. The sun\'s coming up.'],
      ] },
      { if: 'dex_forgiven', then: [
        { leave: ['dex'], say: [
          ['dex', "(coming back from behind the guard booth, wiping his mouth) Okay. I was sick. I feel incredible. (beat) Go. I'll catch Mae up and carry her bag. She'll hate it."],
        ] },
      ] },
      { text: 'deb', message: "Ansel's stitched. He asked Mae if the plant on Rhea's desk was real. It's a cactus made of bottle caps. He's taken it very badly." },
      { getIn: 'lulu', objective: 'Lulu. Voss has the book, and the sun is coming up.' },
    ],
  });
})();
