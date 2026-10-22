/*
 * data/story-act4m31.js — m31 LAST LIGHT (Finale IV and the three endings),
 * the last mission of "Ten and Two".
 *
 * Twenty-four minutes to six, straight on from m30. Horne is in cuffs at
 * Pier 9. Voss has the Tally and is waiting on Harbor Road for a launch
 * called Hope. Jay wrecks his two Halberd escorts, then chases the white
 * Sovereign round Harbor Point with Southside on his own tail, and catches
 * it at the foot of Oceanview Pier. Voss walks to the end of the pier,
 * where Augie read Jay the first letter, and makes him an offer: the thirty
 * million, every house on Heron Street, the book itself for the glovebox.
 * Just do what you always do. Drive.
 *
 * The choice sets ending_a ("Drive." TAILLIGHTS), ending_b ("Give it to the
 * city." THE LONG WAY HOME) or ending_c ("Finish it." WHEELMAN). In C the
 * player has to pull the trigger himself.
 *
 * Flags read: trusted_calder / refused_calder, saved_teo / chased_rourke,
 * dex_forgiven / dex_banished / dex_to_calder, kept_cut / gave_cut,
 * mae_stay / mae_space, nightshift_done, foxes_done, solace_done, iggy_done.
 * Flags set: ending_a / ending_b / ending_c (and a_mae_rides, used inside
 * Ending A only, for Mae in the passenger seat).
 *
 * Continuity leaned on: Augie's letter thirty-seven, "the good one, read it
 * last" (m21), is still sealed in Lulu's glovebox with the other thirty-six.
 * Jay reads it at the city limits (A) or in prison on visiting day (B), and
 * never opens it (C). Its line "there he is. Late." comes back at the
 * prison gate from Teo, who has never read it. Rourke's ring is in Jay's
 * pocket (m30). Voss's launch is HOPE (m26). Porchlight (m19) plays in A.
 *
 * Invented here: letter thirty-seven's text; the place southside_lot; Voss
 * paid for the bench at the end of the pier in 1994; Pruitt votes no in A;
 * Grace Oyelaran takes plum cake to the prison on the first Sunday of the
 * month (Nana Lu did it for Augie); in B the Casa Palma tenants' fund rents
 * Nana Lu's house back to Jay for $49 a night (kept_cut); Captain Dale
 * Mulgrew taps his new watch at Lulu in C.
 *
 * Engine notes: after the catch Jay is cut on foot to the pier arch and a
 * fresh Lulu waits on Seawall Drive (the one he caught Voss in is left where
 * it stopped), so a checkpoint retry at the pier rebuilds the same state.
 * The money is paid by mid-mission rewards inside each ending, so the
 * mission reward itself is empty.
 */
(function () {
  'use strict';
  const S = window.VH.Data.story;

  // ------------------------------------------------------------ colours
  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const PEARL = 0xf5f5f0;
  const CALDER_GREEN = 0x2f4a3a;
  const MINT = 0x9fc9b0;
  const CREAM = 0xefe6d0;

  // ------------------------------------------------------------ helpers
  const lulu = (at, extra) => Object.assign({ spawnCar: 'lulu', type: 'lowrider', at, color: LULU_TEAL }, extra || {});
  const halberdSuv = (id, at, extra) => Object.assign({ spawnCar: id, type: 'ironclad', at, color: HALBERD }, extra || {});
  const driver = (id, car, at, to) => ({ id, faction: 'halberd', hostile: false, at, behavior: 'drive', car, to });

  // Seawall Drive (x = 384) where Meridian Boulevard runs out at the
  // boardwalk: the kerb nearest the pier arch (the pier is x 424-588, z 0).
  const PIER_KERB = { name: 'Seawall Drive, at the foot of the pier', x: 381, z: 14, yaw: Math.PI };
  // On the promenade, nose into the bollards under the arch.
  const VOSS_WRECK = { name: 'The pier arch', x: 413, z: -4, yaw: Math.PI / 2 + 0.55 };
  // The north end of Cypress Parkway (x = -384), where the city runs out.
  const CITY_LIMITS = { name: 'Cypress Parkway, at the city limits', x: -384, z: -360, yaw: Math.PI };

  Object.assign(S.places, {
    southside_lot: { name: 'VPD Southside Division', sign: 'VPD SOUTHSIDE', district: 'palmcrescent', kind: 'parking', desc: "Southside Division's car park on Magnolia Street: a row of cruisers, a flagpole, and a bay still stencilled CAPT. W. HORNE that somebody has started to paint over." },
  });

  // ------------------------------------------------- letter thirty-seven
  const LETTER_37 = [
    ['augie', "Thirty-seven. The last one from in here. They say four weeks. So this is the good one. I saved it."],
    ['augie', "If you've read the other thirty-six you know about my bowels, the chilli, and Big Weasel's foot. I apologise for the foot. None of the foot was my fault."],
    ['augie', "Here's the good one. Four weeks from now I walk out of that gate with a paper bag. I've pictured it every night for three years. You're never in the picture."],
    ['augie', "I made the picture without you in it on purpose, so it wouldn't hurt when it was true. That's a planner's trick. It doesn't work. Don't use it."],
    ['augie', "But in case you're there. In case. I want you to know what I'll be thinking, so you don't have to guess, because you always guess wrong."],
    ['augie', "I'll be thinking: there he is. Late."],
    ['augie', "Your grandmother came Sunday. Plum cake, too much clove. She comes every month. Two buses. Last year, at this table, she told me the thing about twelve."],
    ['augie', "Hands at ten and two, heart at twelve. I asked her what's at twelve. She said, “Wherever you're going, Augustine. Even you.”"],
    ['augie', "I've thought about it every night since. I think she meant it isn't a place, kid. It never was. It's people."],
    ['augie', "That's the whole plan. It's the only one I ever made that didn't fail."],
    ['augie', 'A.'],
    ['augie', "P.S. Leave a light on for somebody. Celia did. It's the only reason I ever found my way home."],
  ];

  // =====================================================================
  // ENDING A: TAILLIGHTS ("Drive.")
  // =====================================================================

  // Mae is in the passenger seat with mae_stay and (gave_cut or nightshift_done).
  const MAE_RIDES = [
    { spawnCar: 'medic12', type: 'medic', at: PIER_KERB, locked: true, watch: false },
    { scene: { at: PIER_KERB, cast: ['mae'] }, say: [
      ['caption', "(Mae Reyes is sitting on Lulu's bonnet with her bag between her boots and a cut on her forehead she still hasn't noticed. She has been there a while.)"],
      ['mae', "Ansel's stitched. Noor's asleep on a pile of money. Rhea's charging everybody for the kettle."],
      ['mae', '(looking at the green book under his arm) That isn\'t in an evidence bag.'],
      ['jay', 'No.'],
      ['mae', "And he isn't in the water."],
      ['jay', "He's on a boat called Hope."],
      ['mae', '(a laugh with nothing in it) Of course he is.'],
      ['mae', '(beat) You\'re going.'],
      ['jay', '(beat) Yeah.'],
      ['caption', "(She looks at him for a long time. Then she gets down off the bonnet and drops the Medic 12 keys through the ambulance's open window onto the seat.)"],
      ['mae', "Somebody'll come for her."],
      ['caption', '(She walks round to Lulu\'s passenger side, opens the door and gets in. Her feet go up on the dash.)'],
      ['mae', "Mama has the cats. The cats have Mama. I've got a bag. (beat) Ask me."],
      ['jay', '(at the driver\'s door, not moving) It\'s over?'],
      ['mae', "It's over. Ask me."],
      ['jay', 'Come with me.'],
      ['mae', '(looking straight ahead through the windscreen, at the whole road) Then drive.'],
    ] },
    { if: 'nightshift_done', then: [
      { say: [
        ['caption', "(Stuck to Lulu's dash with electrical tape, where it has been since Gus's last shift: a MEDIC 12 patch. Mae presses it flat with her thumb.)"],
        ['mae', "(not looking at him) Get us there. Everything else is paperwork."],
      ] },
    ] },
    { join: ['mae'] },
    { setFlag: 'a_mae_rides' },
  ];
  const MAE_STAYS = [
    { if: 'nightshift_done', then: [
      { text: 'mae', message: "Drive safe. I mean it this time. No new pages. Not you. Not ever." },
    ], else: [
      { text: 'mae', message: 'Drive safe. I mean it this time.' },
    ] },
  ];

  const ENDING_A = [
    { scene: { at: 'pier_end', cast: ['voss'] }, say: [
      ['jay', '(after a long time, to the water, to nobody) Drive.'],
      ['voss', "(and for one second he looks almost sorry for him) There he is."],
      ['caption', '(He holds out the green book. Jay takes it. It is lighter than it should be. Rhea said that too.)'],
      ['voss', "Glovebox. A long way from here. Never open it. You're good at that."],
      ['voss', "I'll have Heron Street put in your name by the end of the week. The deeds will go to your grandmother's address. I'm told the post still finds it."],
      ['caption', '(The launch bumps the ladder. Harlan Voss goes down rusty rungs in a white suit without hurrying. The man with the rope does not offer him a hand. Nobody ever has.)'],
      ['voss', '(from the deck, already turning to the sea) Seatbelt, Mr. Mercer.'],
      ['caption', '(Hope goes out past the breakwater with one white light on her stern, getting smaller. Jay watches it all the way out.)'],
      ['caption', '(He has always been very good at watching taillights.)'],
    ] },
    { music: 'sad' },
    { fade: 'out' },
    { leave: ['voss'] },
    { teleport: 'oceanview_pier' },
    { fade: 'in' },
    { goto: PIER_KERB, vehicle: false, radius: 6, objective: 'Back to Lulu' },
    { if: 'mae_stay', then: [
      { if: 'gave_cut', then: MAE_RIDES, else: [
        { if: 'nightshift_done', then: MAE_RIDES },
      ] },
    ] },
    { blackout: [
      ['caption', '(Behind him, at the end of the pier, an old man is still casting off the rail and catching nothing, with tremendous dignity. He never looked round.)'],
      ['caption', "(Lulu's glovebox. Under the registration and a tyre gauge, held with a new rubber band: thirty-seven envelopes in green ink. Thirty-six slit open. One not.)"],
      ['caption', '(He puts the green book in on top of them. The glovebox won\'t shut. He presses it until it clicks.)'],
    ] },
    { if: 'gave_cut', then: [
      { say: [['caption', "(On the back seat, folded, a yellow hoodie with a hole in one cuff. He'd want it driven somewhere nice.)"]] },
    ] },
    { reward: { money: 4000000 } },
    { getIn: 'lulu', objective: 'Get in Lulu' },
    { if: 'a_mae_rides', then: [
      { say: [
        ['jay', '(his hand on the key, not turning it) Seatbelt.'],
        ['caption', '(Mae looks at him for a long second. She was in the back of this car with her hands on Augie\'s chest. She heard what he said.)'],
        ['mae', '(clicking it home, feet still on the dash) I know. (beat) I know.'],
      ] },
    ], else: MAE_STAYS },
    { music: 'hope' },
    { goto: 'meridian_boulevard', vehicle: 'lulu', stop: false, radius: 16, objective: 'West on Meridian. Out of Harbor Point.', say: [
      ['noor', "(on the phone, half asleep, then not at all) Jay? Where are you? Mae said you went after him. Is he— did you—"],
      ['jay', "He's gone. On the boat."],
      ['noor', '(silence) And you?'],
      ['jay', "(beat) Buy the pharmacy, Noor. Buy the one next door too."],
      ['noor', "(very quiet) You're leaving."],
      ['noor', "I said family. At the fire. Out loud, with my mouth. (beat) You heard it."],
      ['jay', 'I heard it.'],
      ['noor', "(something going in her voice) I'm not crying. Vicehaven's air quality index is a disgrace."],
      ['noor', "I'll put a car over the door. A little one. In neon. Teal. (beat) Nobody will know what it means. I'll know."],
    ] },
    { goto: 'old_market', vehicle: 'lulu', stop: false, radius: 18, objective: 'North-west through Old Market', say: [
      ['ansel', "(on the phone, slow, a man holding a phone with his chin because one arm is in a sling) Noor told me. She told me crying. She told me in a spreadsheet."],
      ['jay', 'Boateng Blooms. Tannery Row. Whatever it costs.'],
      ['ansel', "Sunflowers out front, I think. They turn to follow the light. (beat) I'll keep a bucket by the door for you. Of whatever's in season. In case."],
      ['jay', 'Ansel.'],
      ['ansel', "Most fights end when you stand up. I never found out what ends when you drive away. (beat) Write and tell me. I'll read it to the sunflowers."],
      ['rhea', "(on the phone, the kettle going behind her) Thirty million dollars in my warehouse and you want me to split it like a bar bill."],
      ['jay', 'Take your cut off the top. What we agreed.'],
      ['rhea', "(the pencil stops) Augie haggled. You never do. (beat) I'm cashing the cheque. Stavros's. I'm buying a crane. Pink. He'll hate it."],
      ['rhea', "Everything in this port floats or sinks, Mercer. (beat) You floated. Don't come back and sink."],
    ] },
    { if: 'dex_to_calder', then: [
      { say: [
        ['jay', "(to the phone, before Rhea hangs up) One more. St. Brigid's Primary. Birdie Calloway. Every term, till she's done. Her father's going to be a while."],
        ['rhea', "(a long pause, the pencil scratching) Yellow gate on Anchor Street. Lollipop lady called Pat. I know it. (beat) Done. No fee."],
      ] },
    ] },
    { if: 'saved_teo', then: [
      { say: [
        ['teo', "(on the phone, Lantern Alley noise behind him, a noodle cart, somebody laughing) You're doing it again."],
        ['jay', "The Kings get a share. A big one. A roof. Lawyers. Whatever you want."],
        ['teo', "(a long breath) I nearly sold the Alley once. Four hundred grand. I'll buy every lease back with the old man's money. (beat) He'd think that was funny."],
        ['teo', "(quieter) Go on, then. Somebody in this family should get out. Seatbelt, brother."],
      ] },
    ], else: [
      { say: [
        ['teo', "(on the phone, flat) Noor told me. Course you are."],
        ['jay', "The Kings get a share. A big one."],
        ['teo', "(beat) I'll take it. For the Alley. Every lease. Not for you."],
        ['caption', '(He doesn\'t hang up. Neither does Jay. Eleven seconds of a phone line between two men who were both Augie Vance\'s son.)'],
        ['teo', '(finally, rough) Go on, then. Brother.'],
      ] },
    ] },
    { if: 'dex_forgiven', then: [
      { goto: 'dex_garage', vehicle: 'lulu', radius: 10, objective: 'One stop. Calloway Auto.', say: [
        ['jay', '(to the car, turning onto Anchor Street) One stop. One.'],
      ] },
      { say: [['caption', '(Anchor Street. The smell of old fire, still, a week on.)']] },
      { scene: { at: 'dex_garage', cast: ['dex', 'birdie'] }, say: [
        ['caption', "(What's left of Calloway Auto: a black slab, a twisted lift, the smell of old fire. On the kerb in front of it, at half past six in the morning, Dex and Birdie, waiting.)"],
        ['caption', "(Birdie holds a sign on a broom handle, painted on the back of a Renewal notice: CALLOWAY AUTO (UNDER NEW INVESTMENT). The dead neon L hangs round her neck on a string.)"],
        ['birdie', "Daddy said you'd come past. I made a sign. Ansel helped with the brackets. (beat) Brackets are the round bits."],
        ['dex', "(not coming any closer than the kerb) Rhea rang. She said there's money. She said it's yours and you're giving it away. She said it like a swear."],
        ['jay', "It's an investment. Say hi to the investment."],
        ['dex', '(laughing, and his eyes going) Don\'t. Don\'t you dare do my line at me.'],
        ['birdie', "Are you going away for a week?"],
        ['jay', '(crouching to her height) Longer than a week, Bird.'],
        ['birdie', "(considering this) Okay. I'll count. (beat) You have to come back when I get to a number I don't know."],
        ['dex', "(very quietly, over her head) Go on, Jay. (beat) You gave me the second car last night. Keys and everything. Nobody's handed me keys in four years."],
        ['caption', '(When Lulu pulls away they are both waving. Birdie waves the whole sign. Dex waves until the corner, and then a bit after it, at nothing.)'],
      ] },
      { getIn: 'lulu', objective: 'Get in Lulu' },
    ] },
    { text: 'oyelaran', message: "Lucinda's porch light is on. I put it on. I'm leaving it on. Key's under MY mat, whenever. I'll water the lemon. Don't argue." },
    { if: 'kept_cut', then: [
      { wait: 4 },
      { text: 'lourdes', message: "There is a HOUSE in my mailbox, Jay. A whole house, in an envelope. I told you, pay it back to somebody else. Fine. The tenants will have it. Drive safe, mijo." },
    ] },
    { if: 'foxes_done', then: [
      { text: 'lefty', message: 'Ansel says you went north. Frankie always went north too. Never sent a card. Send a card. — L.M.' },
    ] },
    { if: 'iggy_done', then: [
      { text: 'iggy', message: 'Drove a bride up Cypress once. She changed her mind at the city limits and we drove back. Best day of my career. Not advice. Just a story. — I.P.' },
    ] },
    { if: 'trusted_calder', then: [
      { text: 'calder', message: "Somebody reported a teal lowrider heading north on Cypress. I've lost three tapes and a phone this year. I can lose a car for a day. Don't make me find it." },
    ] },
    { goto: CITY_LIMITS, vehicle: 'lulu', radius: 14, objective: 'North on Cypress Parkway. To the city limits.', say: [
      ['dj_del', "(on the radio) This is Del Starr on Sunset Drive, for the night drivers who never went to bed. The council votes at nine. Nobody's betting against it."],
      ['dj_del', "(on the radio) The man in the white suit isn't at his own party this morning. Funny. Here's something to drive to."],
      ['caption', "(Cypress Parkway, northbound. Palms, then fewer palms, then a sign: YOU ARE LEAVING VICEHAVEN. COME BACK SOON. Somebody has sprayed a small gold lantern on the post.)"],
    ] },
    { say: [['jay', '(to the car, easing her onto the verge under the sign) Okay. Okay, Lulu. Pull in.']] },
    { if: 'refused_calder', then: [
      { say: [
        ['caption', '(On the verge before the sign, a dark green unmarked car faces south, toward the city. A woman with an empty coffee cup lifts two fingers off the steering wheel.)'],
        ['caption', '(She doesn\'t pull out. She watches him go the way she watched him come home: from somewhere she can\'t be seen.)'],
      ] },
    ] },
    { music: 'off' },
    { if: 'a_mae_rides', then: [
      { blackout: [
        ['caption', '(He pulls in under the sign. He takes the last envelope out of the glovebox, from under a green leather book, and holds it.)'],
        ['caption', "(Mae doesn't look. She looks at the city in the wing mirror, and lets him have it.)"],
      ] },
    ], else: [
      { blackout: [
        ['caption', '(He pulls in under the sign. He takes the last envelope out of the glovebox, from under a green leather book, and holds it.)'],
        ['caption', '(There is nobody to let him have it. He has it anyway.)'],
      ] },
    ] },
    { blackout: LETTER_37 },
    { if: 'a_mae_rides', then: [
      { blackout: [
        ['caption', '(He folds it on its new creases.)'],
        ['mae', '(still looking at the mirror) Jay.'],
        ['jay', 'Yeah.'],
        ['mae', "You're crying."],
        ['jay', 'Air quality.'],
        ['mae', '(her hand on the back of his neck, the way you hold someone on a fairground ride) Okay. (beat) Okay. Drive.'],
      ] },
    ], else: [
      { blackout: [
        ['caption', '(He folds it on its new creases and puts it in his jacket, over his heart, at twelve.)'],
        ['jay', '(to the car, after a long time) Okay.'],
        ['caption', '(He looks in the mirror for a long time. The city is very small in it, and pink, and all lit up.)'],
        ['caption', "(Then he puts it in gear. He's always been good at that part.)"],
      ] },
    ] },
    { blackout: [
      ['caption', 'At 9:04 that morning, the Phase Two vote passed, eleven to two.'],
      ['caption', 'Councilman Delmar Pruitt voted no. Nobody, including Councilman Pruitt, has ever been able to say why.'],
      ['caption', 'The Crown opened at noon. Harlan Voss sent a recorded message. He was, the message said, travelling.'],
      ['caption', "Haddad Pharmacy reopened on Tannery Row in March, with a small teal car in neon over the door. Sami Haddad stands under it every morning and doesn't ask."],
      ['caption', 'Boateng Blooms keeps a bucket by the door. Nobody is allowed to buy from it.'],
      ['caption', 'The Lantern Kings bought every lease in Lantern Alley. The noodle cart still never closes.'],
      ['caption', 'Rhea Kostas bought a crane and had it painted pink. Crane Row calls it Stavros. It is the ugliest crane on the coast.'],
    ] },
    { if: 'dex_banished', then: [
      { blackout: [
        ['caption', "(Six weeks later. A motel two states north, with letters missing off the sign. A postcard, forwarded in Grace Oyelaran's careful hand, the way somebody else used to.)"],
        ['caption', '(On the front, snow. On the back, in a mechanic\'s capitals and a child\'s crayon:)'],
        ['dex', "Somewhere cold. Everybody's polite. I fixed a snowplough. They think I'm a genius. — D."],
        ['birdie', "A week is 7 days. It has been 42. I am counting for you now. — B."],
      ] },
    ] },
    { if: 'dex_to_calder', then: [
      { blackout: [
        ['caption', "Dex Calloway served eighteen months. Every term, St. Brigid's Primary received a cheque from Kostas Marine Salvage marked SCHOOL FEES. NO FEE."],
      ] },
    ] },
    { blackout: [
      ['dj_del', '(on the radio) To whoever\'s heading north this morning: the road\'s clear, the sky\'s pink, and the city will miss you. Drive safe, baby.'],
      ['dj_del', '(on the radio) This one\'s for a friend. Corinne Day. “Porchlight.” (beat) Not the remix. I know. I know.'],
      ['caption', '(A voice like a lighthouse, singing about a porch light left on for somebody coming home late. On Cypress Parkway a long teal two-door goes north, hands at ten and two.)'],
      ['caption', 'TAILLIGHTS'],
      ['caption', 'The best wheelman Vicehaven ever had. Last seen northbound.'],
    ] },
  ];

  // =====================================================================
  // ENDING B: THE LONG WAY HOME ("Give it to the city.")
  // =====================================================================
  // Mae on the step of Medic 12 behind Lulu: she keeps the jacket (mae_stay).
  const B_MAE_JACKET = [
    { spawnCar: 'medic12', type: 'medic', at: PIER_KERB, locked: true, watch: false },
    { scene: { at: PIER_KERB, cast: ['mae'] }, say: [
      ['caption', "(Medic 12 is parked across two bays behind Lulu with its back doors open. Mae Reyes is sitting on the step with her bag, and a cut on her forehead she still hasn't noticed.)"],
      ['mae', "Noor said the pier. She said you sounded calm. That's how I knew to come."],
      ['jay', "I'm going to Central. To hand myself in. For Tidewater."],
      ['caption', '(Mae goes very still, the way she does at a scene before she touches anybody.)'],
      ['mae', 'How long?'],
      ['jay', "Long enough. Not as long as three years."],
      ['caption', '(He takes off the brown leather jacket, the one he has worn in every weather since he was twenty, and holds it out to her.)'],
      ['jay', 'Hold this for me?'],
      ['mae', '(taking it, holding it against her chest with both arms) You never let anybody hold this jacket. Tommy asked every week for five years.'],
      ['jay', 'I know.'],
      ['mae', '(putting it on over her uniform; far too big, the sleeves over her hands) I told you to ask me when it was over.'],
      ['jay', "It's not over."],
      ['mae', "(beat) No. (She pushes the sleeves up. They fall down again.) So you'd better come back and ask."],
    ] },
  ];

  // Trusted: Calder walks down the pier.
  const B_CALDER_PIER = [
    { spawn: [{ id: 'uniform', faction: 'vpd', hostile: false, behavior: 'idle', at: 'pier_end', count: 2, offset: [-7, 2] }] },
    { scene: { at: 'pier_end', cast: ['voss', 'calder'] }, say: [
      ['caption', '(Footsteps on the boards. Not running. Ines Calder walks the whole pier with two uniforms behind her and an empty coffee cup, as if she has all morning. For once, she has.)'],
      ['calder', 'Harlan Voss.'],
      ['voss', "Detective. (beat) You're not in my book."],
      ['calder', "No. I looked. Page two hundred and six is everybody in Southside. I'm not on it. Nobody ever thought I was worth the money."],
      ['calder', '(to Jay) Best review I ever had.'],
      ['calder', "Harlan Voss, you're under arrest for bribery, conspiracy, and as an accessory after the fact to the murder of Tomás Reyes. There's more. It's written down. It's long."],
      ['caption', '(Out in the bay, the launch called Hope slows, wallows, and turns round. On her bridge somebody has seen two blue uniforms at the end of the pier and done some arithmetic.)'],
      ['voss', '(watching his boat leave without him, mild as milk) Kessler would have found that funny.'],
      ['calder', "(to the uniforms) Take him up. Don't touch the suit. He'll want it for court."],
      ['voss', '(as the cuffs go on, to Jay, in the old velvet) You\'ll regret this in some other city, Mr. Mercer.'],
      ['jay', "I'm not going to some other city."],
      ['caption', "(For the second time in his life, Harlan Voss has nothing ready to say. They walk him up the pier. He looks at the city the whole way, as if he's still pricing it.)"],
    ] },
    { fade: 'out' },
    { leave: ['voss', 'uniform_0', 'uniform_1'] },
    { teleport: 'oceanview_pier' },
    { fade: 'in' },
    { scene: { at: 'oceanview_pier', cast: ['calder'] }, say: [
      ['caption', '(At the foot of the pier the uniforms put Voss in a cruiser, a hand on his white head. Calder waits for the door to shut. Then it is the two of them, the gulls and the sun.)'],
      ['jay', "(holding out the green book) Page one's the councilman with the dog."],
      ['caption', '(Calder takes it in both hands, carefully, like evidence. Which it is.)'],
      ['calder', '(turning a page, then another) Fourteen years. In his own handwriting. (beat) He has lovely handwriting. That\'s going to hang him.'],
      ['jay', "There's something else."],
      ['caption', '(He takes out four sheets of Kostas Salvage invoice paper, both sides, in school-bus capitals. He wrote it last night. He never sleeps before a job.)'],
      ['calder', '(reading the first line, then reading it again) You wrote a confession on a salvage invoice.'],
      ['jay', 'Rhea charged me for the paper.'],
      ['caption', '(He holds out his wrists.)'],
      ['jay', 'Tidewater. I drove. Write that down.'],
      ['caption', '(Calder takes out a pen and a notebook with a coffee ring on the cover, and writes it down. Two words. She underlines them.)'],
      ['calder', "(not taking his wrists) Put your hands down, Mercer. You're going to drive yourself to Central. I'll be behind you."],
      ['jay', "You're letting a getaway driver drive himself to the station."],
      ['calder', "I'm letting a man hand himself in. It reads better at sentencing. (beat) And I want to see you do the speed limit. I've heard stories."],
      ['calder', "With this book, a decent lawyer and me in the box saying what you did tonight? Fourteen months. Maybe less. Not nothing."],
      ['jay', 'Not nothing. (beat) Is it something you can sign?'],
      ['calder', '(looking at the book, the invoice, the sun on the water) I\'ll sign it twice.'],
    ] },
    { leave: ['calder'] },
    { goto: PIER_KERB, vehicle: false, radius: 6, objective: 'Back to Lulu. Calder will follow you in.' },
    { if: 'mae_stay', then: B_MAE_JACKET },
    { getIn: 'lulu', objective: 'Get in Lulu' },
    { goto: 'vpd_central', vehicle: 'lulu', radius: 12, objective: 'Drive yourself to VPD Central. At the speed limit.', say: [
      ['caption', '(In the mirror, a dark green unmarked car, a sensible distance back, indicating at every turn.)'],
      ['jay', "(to the car, at exactly the limit, both hands where they belong) Easy. Easy, Lulu. We're not in a hurry. First time in our lives."],
      ['dj_sable', "(on the radio) Harbor Heat. It's Sable. Getting word that the man in the white suit was arrested at the end of Oceanview Pier this morning. By a detective. On foot."],
      ['dj_sable', "(on the radio) I've been saying his name on this station for eleven years. I don't know what to say now. (beat) Here's a record. It's a long one. I need a minute."],
      ['jay', '(to the car, at a red light he could have run, and doesn\'t) Seatbelt.'],
    ] },
    { say: [['caption', '(VPD Central at a quarter to seven. Jay parks Lulu in a bay marked VISITORS, nose out, the way Augie taught him.)']] },
    { spawnCar: 'calder_car', type: 'unmarked', at: 'vpd_central', color: CALDER_GREEN, locked: true, watch: false },
    { scene: { at: 'vpd_central', cast: ['calder'] }, say: [
      ['caption', '(Brutalist concrete, the crooked flagpole, and the one bench for the families who wait.)'],
      ['caption', '(Behind him the green unmarked car pulls in, and shudders, and stalls.)'],
      ['calder', '(getting out, to her car) Thank you. Perfect timing. You absolute piece of shit.'],
      ['caption', '(Jay takes the keys out of the ignition, looks at them for a while, and puts them down on the bench for the families who wait.)'],
      ['jay', "Somebody'll come for her."],
      ['calder', '(holding the door for him, like a valet) Somebody always does. After you, Mercer.'],
    ] },
  ];

  // Refused: nobody comes down the pier. Jay reads page one out loud.
  const B_READ_IT = [
    { scene: { at: 'pier_end', cast: ['voss'] }, say: [
      ['caption', '(Nobody comes down the pier. Nobody knows to.)'],
      ['voss', '(recovering; buttoning his jacket over the smear on his cuff) Well. Now you have a book, and I have a boat, and the vote is still at nine.'],
      ['voss', "Who will you give it to? The police? You wouldn't trust the one honest detective in Vicehaven. I know. I had a man on her too. He was very bored."],
      ['jay', '(taking out his phone) Not the police.'],
    ] },
    { if: 'solace_done', then: [
      { phone: 'solace', say: [
        ['solace', "(sleepy, then not) This frequency is stolen. Who's this?"],
        ['jay', 'The getaway driver.'],
        ['solace', "(beat) Oh, baby. (beat) What have you got?"],
        ['jay', 'A book. Green. Fourteen years. His handwriting.'],
        ['caption', "(A click, somewhere in a purple van that used to sell ice cream. A red light coming on.)"],
        ['solace', "Then read it to me. We're live in ten seconds. Sable leaves the transmitter door open for me. He says he's furious about it."],
        ['solace', "(on the air, low and warm, the voice in every taxi after midnight) Good morning, Vicehaven. It's six o'clock. This is Solace. I have a book here. (beat) Page one."],
      ] },
    ], else: [
      { phone: 'hattie', say: [
        ['hattie', "Ledger night desk. Hattie Brand. If this is about a parking ticket, I have been here forty years and I have never once cared."],
        ['jay', "I've got Harlan Voss's book. Fourteen years of it. In his handwriting."],
        ['hattie', "(a pause of exactly one second) We go to press at six. Read me page one. Slowly. I type with two fingers and I've never needed a third."],
      ] },
    ] },
    { scene: { at: 'pier_end', cast: ['voss'] }, say: [
      ['caption', '(He opens it. The man who never opens anything opens a green leather book at page one, at the end of a pier, and reads it out loud into a telephone.)'],
      ['jay', '(reading) “March. D. Pruitt. Twenty thousand. Re: Tannery Row zoning. Pleasant man. Sweats.”'],
      ['jay', '(reading) “April. Capt. W. Horne. Fifteen thousand. Re: Southside staffing. Wants a hat.”'],
      ['caption', "(Harlan Voss stands at the rail and listens to his own handwriting go out across the water, into every taxi and kitchen and night shift in the city.)"],
      ['voss', '(going down the ladder to the launch at last, a white suit on rusty rungs) You have made a great many people very unhappy this morning, Mr. Mercer.'],
      ['jay', '(not looking up from the book) Page two.'],
      ['caption', "(Hope goes out past the breakwater. Voss doesn't look back. He has a city to get away from, and the whole city has just heard him write.)"],
    ] },
    { fade: 'out' },
    { leave: ['voss'] },
    { teleport: 'oceanview_pier' },
    { fade: 'in' },
    { goto: PIER_KERB, vehicle: false, radius: 6, objective: 'Back to Lulu' },
    { if: 'mae_stay', then: B_MAE_JACKET },
    { getIn: 'lulu', objective: 'Get in Lulu' },
    { if: 'solace_done', then: [
      { goto: 'vpd_central', vehicle: 'lulu', radius: 12, objective: 'Drive to VPD Central. Hand yourself in.', say: [
        ['solace', "(on the radio) ...page nine. “Councilman R. Achterberg. Re: the marina. Will not stop talking about his niece's racing.” (beat) Sorry, Saff."],
        ['solace', '(on the radio) Every city has a voice, Vicehaven. This morning yours is reading a book out loud. Keep your radios on. We\'re going to be here a while.'],
        ['jay', "(to the car, at exactly the speed limit, both hands where they belong) Easy, Lulu. We're not in a hurry. First time in our lives."],
        ['solace', "(on the radio, softer) And to the getaway driver, wherever you're going this morning: thank you for the book. Drive slow."],
      ] },
    ], else: [
      { goto: 'vpd_central', vehicle: 'lulu', radius: 12, objective: 'Drive to VPD Central. Hand yourself in.', say: [
        ['dj_sable', "(on the radio) Harbor Heat. It's Sable. The Ledger just put a green book on its front page. (beat) I'm going to read it to you. All of it. I've waited eleven years."],
        ['dj_sable', '(on the radio) Page one. “March. D. Pruitt. Twenty thousand.” (beat) Some people are going to have a hard day. Good.'],
        ['jay', "(to the car, at exactly the speed limit, both hands where they belong) Easy, Lulu. We're not in a hurry. First time in our lives."],
      ] },
    ] },
    { say: [['caption', '(Jay parks Lulu in a bay marked VISITORS, nose out, the way Augie taught him, and turns off the engine, and sits for a moment with his hands at ten and two.)']] },
    { scene: { at: 'vpd_central', cast: ['calder'] }, say: [
      ['caption', "(VPD Central. On the one bench for the families who wait, Detective Calder sits with an empty coffee cup, as if she's been waiting for him for three years.)"],
      ['calder', "I heard. Everybody heard. Page forty is my deputy chief. He's in the building. I can hear him from here."],
      ['jay', '(holding out the book) You\'ll want the original.'],
      ['calder', '(taking it, not opening it) You didn\'t trust me.'],
      ['jay', 'I trust me this week.'],
      ['caption', '(He hands her four sheets of Kostas Salvage invoice paper, written on both sides in school-bus capitals. Then he holds out his wrists.)'],
      ['jay', 'Tidewater. I drove. Write that down.'],
      ['caption', '(She writes it down. Two words. She underlines them.)'],
      ['calder', "He's on a boat, Mercer. The book's out and the man's out to sea, and you're the one on the steps."],
      ['jay', 'I know.'],
      ['calder', "It'll be longer than it should be. No deal with me in the room from the start. Twenty-two months, if the judge had breakfast."],
      ['jay', 'Is it something you\'d sign?'],
      ['calder', '(beat) Yeah. (She stands. She doesn\'t cuff him.)'],
      ['caption', '(Jay takes Lulu\'s keys out of his pocket, looks at them for a while, and puts them down on the bench for the families who wait.)'],
      ['calder', '(holding the door for him, like a valet) After you.'],
    ] },
  ];

  // The gate. Who's there, and who comes late.
  const B_GATE = [
    { scene: { at: 'vpd_central', cast: ['teo', 'noor', 'ansel'] }, say: [
      ['caption', '(VPD Central. Nine in the morning. The processing gate, the crooked flagpole, the bench for the families who wait. A man walks out of the gate with a paper bag.)'],
      ['caption', "(In the bay marked VISITORS, nose out: a long teal two-door, polished to a shine it hasn't had since a school-bus driver owned it. Three people are leaning on it.)"],
      ['teo', "(pushing off the bonnet; Augie's steel watch on his wrist, and looking at it, and tapping it, twice) There he is. (beat) Late."],
      ['caption', '(Jay stops walking. Just for a second. Teo has never read that letter. Nobody has but him.)'],
      ['jay', '...What did you say?'],
      ['teo', "I said you're late. Release was nine. It's nine-oh-four. (holding up the watch) Never loses a second."],
    ] },
    { if: 'chased_rourke', then: [
      { scene: { at: 'vpd_central', cast: ['teo', 'noor'] }, say: [
        ['teo', "(quieter, not quite looking at him) I wasn't going to come. Noor said I'd regret it. (beat) I hate it when she's right. She's always right. It's exhausting."],
        ['jay', 'Teo.'],
        ['teo', "Don't make it weird. (He makes it weird. He hugs him, hard and short, like a man shoving a door shut.) Brother."],
      ] },
    ] },
    { scene: { at: 'vpd_central', cast: ['noor', 'ansel', 'teo'] }, say: [
      ['noor', "(already crying, already furious about it) I'm not crying. The air quality index in a police car park is a public scandal."],
      ['noor', "(throwing her arms round him, paper bag and all) I have a PHARMACY, Jay. Dad does the counter. He tells everybody what's wrong with them. For free. It's terrible for business."],
      ['ansel', '(waiting his turn, then simply lifting Jay off the ground, paper bag and all) Welcome home.'],
      ['jay', '(off the ground) Ansel. Put me down.'],
      ['ansel', "Most hugs end when you stand up. (He doesn't put him down.)"],
      ['ansel', "(setting him down at last, and straightening the paper bag for him) I have to go. It's Saturday. Somebody comes to the stall at half past nine, and I have never once been late."],
      ['ansel', '(already walking) Drive past. Slowly. Don\'t stop. Don\'t wave.'],
    ] },
    { leave: ['ansel'] },
    { if: 'mae_stay', then: [
      { scene: { at: 'vpd_central', cast: ['mae', 'noor', 'teo'] }, say: [
        ['caption', '(And at the back, in her uniform, Mae Reyes, holding a brown leather jacket folded over her arm. It has been worn. It has been worn a lot.)'],
        ['mae', "(holding it out) I wore it. Every shift. It smells like ambulance now. That's your problem."],
        ['jay', '(taking it, not putting it on yet) Is it over?'],
        ['mae', '(beat) Ask me.'],
        ['jay', 'Come home with me.'],
        ['mae', '(stepping in, her forehead against his chest) Where do you think we\'re all going?'],
      ] },
      { if: 'nightshift_done', then: [
        { scene: { at: 'vpd_central', cast: ['mae'] }, say: [
          ['caption', '(On the shoulder of the jacket, sewn on crooked: a MEDIC 12 patch.)'],
          ['mae', "Gus sewed it. He's terrible at it. He says get them there. Everything else is paperwork."],
        ] },
      ] },
    ] },
    { if: 'trusted_calder', then: [
      { scene: { at: 'vpd_central', cast: ['calder'] }, say: [
        ['caption', "(On the steps, Detective Ines Calder, off duty, with a coffee cup. Noor notices first, and points: it's full.)"],
        ['calder', "I'm off duty. I'm allowed a full one. (beat) Okonkwo says hello. Ray. He's my partner again. He says you drive like a weather event."],
        ['jay', 'Is that a compliment?'],
        ['calder', "It's evidence. (She lifts two fingers off the cup, the way she does off a steering wheel.) Go home, Mercer."],
      ] },
    ], else: [
      { say: [
        ['caption', "(On the bench for the families who wait, somebody has left a VPD business card. On the back, in a cop's handwriting, one word: SIGNED. — I.C.)"],
      ] },
    ] },
    { say: [
      ['caption', "(Out on Lantern Street, Kostas Salvage's flatbed slows at the kerb and Kostya leans on the horn for eleven seconds. Rhea doesn't do gates. She sent the horn.)"],
      ['noor', "(wiping her face) That's eleven seconds. She timed it. She'll charge you per second."],
    ] },
    { if: 'mae_space', then: [
      { say: [['caption', "(In the paper bag, with his belt and his keys, his phone. Dead since the day he went in. Noor plugs it into Lulu, and it wakes up, and buzzes once.)"]] },
      { text: 'mae', message: 'Home?' },
      { wait: 3 },
      { scene: { at: 'vpd_central', cast: ['mae'] }, say: [
        ['caption', "(One whoop of a siren, and Medic 12 swings into the car park at a speed Mae Reyes would scold anybody else for.)"],
        ['mae', '(out of the window) Sorry. Sorry! Cardiac on Laurel. Four minutes out.'],
      ] },
      { if: 'nightshift_done', then: [
        { say: [['mae', '(getting down, breathless) He made it. No new name tonight.']] },
      ], else: [
        { say: [['mae', '(getting down, breathless) He made it.']] },
      ] },
      { scene: { at: 'vpd_central', cast: ['mae'] }, say: [
        ['mae', '(looking at him a long time) You gave me space. All of it. The whole sentence. Who are you?'],
        ['jay', 'Is it over?'],
        ['mae', '(beat; the smallest smile) Get in the car, Jay. Ask me on the way.'],
      ] },
    ] },
    { if: 'dex_forgiven', then: [
      { scene: { at: 'vpd_central', cast: ['dex', 'birdie'] }, say: [
        ['birdie', '(running, hair puffs bouncing, a sign under her arm) You went to jail for a week! A week is seven days! I counted! I got to numbers I didn\'t know! Ansel taught me them!'],
        ['caption', "(Behind her, hands in his coverall pockets, not sure of his welcome even now: Dex Calloway. Birdie's sign says CALLOWAY AUTO. Both Ls are coloured in.)"],
        ['dex', "We rebuilt the garage. Mostly Ansel. I did the sign. Both Ls work. First time since Dad had it."],
        ['dex', "(beat) There's a new lift. Paid for. Every cent. I can look at it."],
        ['jay', '(hugging him, and Dex holds on like a man who has been holding on to a kerb) Say hi to the investment.'],
        ['dex', '(into his shoulder, a wreck) Hi, investment.'],
      ] },
    ] },
    { if: 'dex_to_calder', then: [
      { scene: { at: 'vpd_central', cast: ['dex', 'birdie'] }, say: [
        ['caption', '(Dex Calloway, in a brand-new shirt still creased from the packet, with Birdie on his shoulders holding a sign that says WELCOME HOME (AGAIN).)'],
        ['birdie', "It says again because Daddy came out of that gate a month ago. Same bag. Same bench. I'm reusing it. It's environmental."],
        ['dex', "Thirty-one days. They let me out for good behaviour. I've never been so well behaved in my life. I said please to a man who stole my soap."],
        ['dex', '(beat, putting his hand out, then not trusting it, then trusting it) I told the truth to a lady with a grey stripe. It was the worst week of my life. Best thing I ever did.'],
        ['jay', '(taking the hand) Welcome home, Dex.'],
        ['dex', "(laughing, wet) That's my line. That was my line. I had it ready."],
      ] },
    ] },
    { if: 'dex_banished', then: [
      { scene: { at: 'vpd_central', cast: ['birdie', 'mae'] }, say: [
        ['birdie', '(with a label on her coat in a mechanic\'s capitals: BIRDIE CALLOWAY. COACH TO VICEHAVEN. PLEASE BE NICE TO HER) Daddy put me on the coach. By myself. Mae met me.'],
        ['birdie', "He's not allowed to come. He said I'm allowed. (She holds out an envelope.) He said give you this and don't read it first. I read it first."],
        ['caption', "(On a sheet of motel notepaper, in a mechanic's capitals: WE'RE NEVER SQUARE. WELCOME HOME ANYWAY. — D.)"],
        ['birdie', "It means he loves you. Grown-ups write it backwards."],
      ] },
    ] },
    { if: 'foxes_done', then: [
      { scene: { at: 'vpd_central', cast: ['lefty', 'duke'] }, say: [
        ['caption', '(A horn like a goose with a grievance. At the kerb, a faded mint getaway car, forty years old: Lefty Marchetti at the wheel, Duke Fairweather riding shotgun in a cardigan.)'],
        ['lefty', "Nobody ever picked Frankie up. Not once. Thought somebody should."],
        ['duke', 'She means you.'],
        ['lefty', "I know who I mean, Duke. I'm seventy-two, I'm not Walt. (beat) Walt would have liked this. He'd have called you the wrong name the whole way home."],
      ] },
    ] },
    { if: 'iggy_done', then: [
      { scene: { at: 'vpd_central', cast: ['iggy'] }, say: [
        ['caption', '(And pulling in behind them, cream paint, white ribbons on the bonnet for no wedding at all: Constance, with Iggy Pell at the wheel in his cap.)'],
        ['iggy', '(touching the peak) Your carriage.'],
        ['jay', "I've got a car."],
        ['iggy', "You've got a car for you. Constance is for everybody else. Drive the ones who can't, I said. (beat) Today, that's all of us."],
      ] },
    ] },
  ];

  // The long way home: Tannery Row, the pharmacy, the mural, Heron Street.
  const B_HOME = [
    { join: ['noor', 'teo', 'mae'] },
    { getIn: 'lulu', objective: 'Take everybody home. The long way.' },
    { say: [
      ['jay', '(his hand on the key, not turning it) Seatbelts.'],
      ['noor', "(holding hers up as proof) I put it on in the car park. Before you came out. I'm a passenger now. I've grown."],
      ['teo', '(clicking his) Pop said you once held up a getaway for a seatbelt.'],
      ['jay', 'Twice.'],
      ['mae', '(from the front, clicking hers, very quietly) Good.'],
    ] },
    { music: 'hope' },
    { goto: 'tannery_row', vehicle: 'lulu', stop: false, radius: 16, objective: 'Take everybody home. The long way. Tannery Row first.', say: [
      ['noor', "(from the back, pointing between the seats) Left. LEFT. Tannery Row. You have to see it. Ansel made us promise. In writing."],
      ['caption', "(Tannery Row. Awnings, fish on ice, and not one Renewal notice on any post. Between the fishmonger and the sneakers: BOATENG BLOOMS. Sunflowers, all turned the same way.)"],
      ['caption', '(A girl in a university sweatshirt is buying lilies at the stall. Ansel wraps them as if they might break. He doesn\'t charge her. She doesn\'t know why.)'],
      ['teo', "That's Lina. She comes every Saturday and asks him the names of things. He tells her. Takes forty minutes. (beat) He's never told her."],
      ['noor', 'He says if he told her it would be a different kind of flowers.'],
    ] },
    { goto: 'haddad_pharmacy', vehicle: 'lulu', stop: false, radius: 16, objective: 'Past the pharmacy', say: [
      ['caption', "(Haddad Pharmacy. The green cross lit, RENEWAL scraped off the door with a razor blade and patience. In a white coat, Sami Haddad is telling a man what's wrong with him.)"],
      ['noor', '(very quietly, watching her father through the glass) He kept the tabard. From the superstore. In a drawer. So he remembers stacking soup for the man who took his shop.'],
      ['noor', "I said that's a terrible reason to keep something. He said it's the only reason."],
    ] },
    { goto: 'casa_palma', vehicle: 'lulu', stop: false, radius: 18, objective: 'Past Casa Palma', say: [
      ['caption', '(Casa Palma. Laundry on every balcony. And three storeys up, Tommy Reyes in his yellow hoodie, laughing at something just past the edge of the wall. The paint is new.)'],
      ['caption', "(Beside him now: a tall man in a cream linen shirt a size too big, with two fishing rods over his shoulder, the wrong way round.)"],
      ['teo', "(not looking at it; looking at it) Nine weeks. The rods were the hardest. I kept painting them the right way and it looked wrong."],
      ['teo', "I run the tenants' union now. Old Market and Palm Crescent. Four hundred households. I'm in meetings. (beat) Planning, all day. I hate it. I'm good at it."],
    ] },
    { camera: 'meridian_yard', seconds: 6, say: [
      ['caption', "(Meridian Yard. The Crown is still a skeleton, forty storeys of steel with nothing in them. The tower crane hasn't moved in a year. It's rusting, like everything on this coast.)"],
      ['caption', '(A mile south, on Crane Row, a pink crane is unloading a ship. Its name is Stavros. It is the ugliest crane on the coast.)'],
    ] },
    { say: [['teo', '(from the back seat, looking at the crane) He used to say every city is a list of things somebody stopped building.']] },
    { blackout: [
      ['caption', "(They take the long way. The seawall, up to Crestline and back, twice round the Starlite for no reason, every green light Noor can find. It takes all day.)"],
      ['noor', '(somewhere in the fourth hour) This is the least efficient route in the history of Vicehaven. I made a map. It looks like a flower.'],
      ['jay', 'Good.'],
    ] },
    { setTime: 19.4 },
    { goto: 'nana_lu_house', vehicle: 'lulu', radius: 10, objective: 'Home. Heron Street.', say: [
      ['caption', "(Heron Street at dusk. The SOLD boards are gone. There are children's bikes in two of the yards. The lemon tree in front of the pink house has eleven lemons on it.)"],
    ] },
    { say: [['jay', '(to the car, very softly, pulling in at the kerb like the kerb is a suggestion) Home, Lulu.']] },
    { if: 'kept_cut', then: [
      { scene: { at: 'nana_lu_house', cast: ['lourdes', 'oyelaran'] }, say: [
        ['caption', '(On the porch of the pink house: Lourdes Reyes with a cat, and Grace Oyelaran with a key.)'],
        ['lourdes', "You signed it over. To the tenants' fund. From inside. Mae brought me the papers. At the bottom, in capitals, you wrote PAY IT BACK TO SOMEBODY ELSE."],
        ['jay', 'Sideways.'],
        ['lourdes', "Sideways. (beat) The fund has met. The fund has voted. The fund would like to rent the house on Heron Street to a single man of no fixed occupation."],
        ['oyelaran', '(holding out the key) Forty-nine dollars a night. Same as the motel. No bedbugs. Lucinda would have charged you more.'],
        ['caption', '(He can\'t say anything. Lourdes doesn\'t make him.)'],
        ['lourdes', '(patting his face, the way she did at the funeral) Go in, mijo. Go in your house.'],
      ] },
    ], else: [
      { scene: { at: 'nana_lu_house', cast: ['oyelaran'] }, say: [
        ['caption', '(Grace Oyelaran is on the pink house\'s porch with a key in her hand, as if she has been standing there since he left.)'],
        ['oyelaran', "Key was under MY mat. Fourteen months. Twenty-two. I lost count. (She hands it over.) I watered the lemon. Don't argue."],
        ['caption', "(He takes a yellow hoodie off Lulu's back seat, where it has ridden under a tarp in Kostya's yard all this time, and lays it over the porch rail, facing the street.)"],
      ] },
      { scene: { at: 'nana_lu_house', cast: ['oyelaran', 'lourdes'] }, say: [
        ['caption', '(Lourdes Reyes comes up the path from the bus stop with a cake tin under her arm. She sees the rail, and stops.)'],
        ['lourdes', '(touching the cuff, the hole in it, where he used to chew it) Is this somewhere nice?'],
        ['jay', "It's the best I've got."],
        ['lourdes', '(beat; patting his face, the way she did at the funeral) He liked a porch. He liked a view of the street, so he could see who was coming. (beat) Go in, mijo. Go in your house.'],
      ] },
    ] },
    { music: 'off' },
    { blackout: [
      ['caption', '(Later. Everybody inside, far too loud. The kitchen smells of plums and cloves for the first time in more than a year. Grace brought the cake. It is nearly right.)'],
      ['caption', "(Jay sits out on the porch swing on his own for a minute. The porch light is on. Grace has had it on every night since he went in. Nobody asked her to. Nobody had to.)"],
    ] },
    { if: 'solace_done', then: [
      { blackout: [
        ['solace', '(on the kitchen radio) This is Solace, and this frequency is still stolen. Somebody on Heron Street has their porch light on tonight. (beat) Leave it burning, baby.'],
      ] },
    ], else: [
      { blackout: [
        ['dj_sable', "(on the kitchen radio) Harbor Heat. It's Sable. Quiet's usually the part before the noise. (beat) Not tonight. Tonight it's just quiet. Here's a record."],
      ] },
    ] },
    { blackout: [
      ['caption', '(He pushes off with one foot. The swing squeaks on the left, the way it always has.)'],
      ['tommy', '(somewhere in the dark, laughing, the way he always did) Took you long enough.'],
      ['caption', 'THE LONG WAY HOME'],
      ['caption', 'The best wheelman Vicehaven ever had. Home. Parked.'],
    ] },
  ];

  const ENDING_B = [
    { scene: { at: 'pier_end', cast: ['voss'] }, say: [
      ['jay', 'Give it to the city.'],
      ['voss', "(genuinely puzzled) The city? Mr. Mercer. The city is a committee that can't find its own car keys."],
      ['jay', "Then it'll have to learn."],
    ] },
    { goto: 'voss', vehicle: false, radius: 2.2, objective: 'Take the book out of his hands' },
    { scene: { at: 'pier_end', cast: ['voss'] }, say: [
      ['caption', "(Jay takes hold of the book. For a moment Harlan Voss doesn't let go. It isn't a struggle. It is a man finding out what his hand does when nobody has ever said no to it.)"],
      ['caption', '(Then his fingers open, one at a time, like a mechanism.)'],
      ['voss', '(looking down at his own empty hand) Huh.'],
      ['voss', '(quietly) Nobody has ever... (He stops. He has never had to finish that sentence, and he finds he doesn\'t know how.)'],
      ['caption', "(Jay picks Rourke's ring up off the rail, too, and puts it back in his pocket.)"],
    ] },
    { if: 'trusted_calder', then: B_CALDER_PIER, else: B_READ_IT },
    { music: 'sad' },
    { if: 'trusted_calder', then: [
      { blackout: [
        ['caption', 'Harlan Voss was arraigned in November in a grey suit. Somebody had told him white was a mistake.'],
        ['caption', 'Councilman Delmar Pruitt testified first. He brought his own lawyer, his own water, and a photograph of his dog.'],
        ['caption', 'The Phase Two vote was never held. Eleven councilmen resigned. Two were re-elected out of spite.'],
        ['caption', 'Jay Mercer pleaded guilty to the Tidewater robbery. He was sentenced to fourteen months.'],
      ] },
    ], else: [
      { blackout: [
        ['caption', 'By seven that morning everybody in Vicehaven had heard page one. By noon, page two hundred and six.'],
        ['caption', 'Harlan Voss was indicted in his absence. His launch turned up a week later in a marina three countries south. The name had been painted out.'],
        ['caption', 'The Phase Two vote was never held. Eleven councilmen resigned. Councilman Pruitt resigned twice, to be sure.'],
        ['caption', 'Jay Mercer pleaded guilty to the Tidewater robbery. With nobody to speak for him, he was sentenced to twenty-two months.'],
      ] },
    ] },
    { if: 'chased_rourke', then: [
      { blackout: [
        ['caption', "A wedding ring arrived at a university in the north in a padded envelope with no note. Maggie Rourke wears it on a chain. It was her mother's."],
      ] },
    ] },
    { blackout: [
      ['caption', 'County. The first Sunday of the month.'],
      ['caption', '(The visiting room: bolted tables, a vending machine that eats coins, and Grace Oyelaran, seventy-five, who has come on two buses with a plum cake in wax paper.)'],
      ['oyelaran', 'Lucinda did this for that Vance man every month for three years. Two buses. I asked her why once. She said somebody has to turn up.'],
      ['oyelaran', "(unwrapping it) Too much clove. I've been practising. It isn't right yet. (beat) I've got time."],
      ['oyelaran', "And Mae sent this. Out of your glovebox. She said you'd know which."],
      ['caption', '(She slides an envelope across the bolted table. In the corner, in pencil, in a planner\'s hand: 37.)'],
      ['caption', '(He opens it.)'],
    ] },
    { blackout: LETTER_37 },
    { blackout: [
      ['caption', '(He reads it twice. Then he eats the end piece, because it has the most crust, and a man should know what he wants.)'],
      ['oyelaran', 'Well?'],
      ['jay', '(mouth full, eyes wet) Too much clove.'],
      ['oyelaran', '(satisfied) Good. Then it\'s nearly right.'],
    ] },
    { setTime: 9 },
    { music: 'hope' },
    { if: 'trusted_calder', then: [
      { blackout: [['caption', 'Fourteen months later.']] },
    ], else: [
      { blackout: [['caption', 'Twenty-two months later.']] },
    ] },
    ...B_GATE,
    ...B_HOME,
  ];

  // =====================================================================
  // ENDING C: WHEELMAN ("Finish it.")
  // =====================================================================
  const ENDING_C = [
    { scene: { at: 'pier_end', cast: ['voss'] }, say: [
      ['jay', '(very quietly) Finish it.'],
      ['caption', '(He takes the pistol out of his jacket. It is heavier than the book.)'],
      ['caption', '(Harlan Voss doesn\'t step back. He looks at the gun the way he looked at the city from his pool: as something he understood completely, a long time ago.)'],
      ['voss', 'Ah.'],
      ['voss', "(not frightened; disappointed, the way a teacher is) That isn't leaving, Mr. Mercer. And it isn't staying. (beat) That's building."],
      ['voss', "(He sets the book down on the bench, squares it with one finger, straightens his cuff, and waits.) Go on, then. Somebody has to finish the city."],
    ] },
    { reward: { weapons: ['pistol'] } },
    { music: 'off' },
    { slowmo: 3 },
    { kill: ['voss'], objective: 'Finish it.' },
    { heat: 0 },
    { wait: 2 },
    { blackout: [
      ['caption', '(One shot, across the boards. Flat. Close. Every gull on Oceanview Pier goes up at once.)'],
      ['caption', '(Harlan Voss sits down against the rail as if he has decided to, and looks at the sunrise he paid for, and then doesn\'t.)'],
      ['caption', '(Out in the bay, the launch called Hope turns round and goes back the way it came, empty. Nobody on her looks back.)'],
      ['caption', "(He picks the green book up off the bench. Under it there is a small brass plaque, and because nobody reads plaques, he reads it.)"],
      ['caption', 'GIFTED TO THE CITY OF VICEHAVEN BY H. VOSS, 1994. FOR THE VIEW.'],
      ['caption', "(Rourke's ring is still on the rail. He leaves it there. A man who is always at work doesn't need one.)"],
    ] },
    { reward: { money: 30000000 } },
    { goto: PIER_KERB, vehicle: false, radius: 6, objective: 'Walk back up the pier.', say: [
      ['caption', "(The old man at the rail has stopped fishing. He is looking very hard at the water. He has decided not to have seen anything, which is the thing this city does best.)"],
    ] },
    { getIn: 'lulu', objective: 'Get in Lulu' },
    { say: [
      ['caption', "(A siren, coming the other way along Seawall Drive toward the pier. He knows the sound of that engine. Medic 12. He doesn't look.)"],
    ] },
    { fade: 'out' },
    { teleport: 'meridian_yard' },
    { blackout: [['caption', 'Eleven days later.']] },
    { setTime: 12 },
    { fade: 'in' },
    { scene: { at: 'meridian_yard', cast: ['lister', 'pruitt', 'rhea'] }, say: [
      ['caption', "(The Crown. Meridian Yard at noon. The tower is finished at last, all glass, and the ribbon is still across the doors because nobody can agree who's allowed to cut it now.)"],
      ['lister', "(a hand out; a grip like signing something) Mr. Mercer. Corinne Lister, Halberd Security. Chief executive, since Monday. My condolences on Mr. Voss. I'm told you were there."],
      ['jay', 'I was there.'],
      ['lister', "Then you'll know there's a vacancy. (beat) Halberd provides certainty. We'd like to keep providing it. To whoever is holding the book."],
      ['jay', 'Send me an invoice.'],
      ['lister', "(the thinnest smile) Everybody's loyal until the invoice, Mr. Mercer. That was Kessler's. I've kept it."],
      ['pruitt', '(sweating through linen, an order paper folded very small in both hands) Mr. Mercer. Sir. The vote. It was postponed. After the... after. It\'s been eleven days.'],
      ['pruitt', "Everybody would like to know. All of us. How you'd like it to go."],
      ['caption', '(Jay looks up at the glass for a long time. It shows him a man in a brown leather jacket looking up at glass.)'],
      ['jay', "I'll let you know."],
      ['pruitt', '(nodding far too many times) Of course. Of course, sir. Sir.'],
      ['caption', "(Rhea Kostas arrives last in Stavros's watch cap, and doesn't shake anybody's hand.)"],
      ['rhea', "The thirty's in my warehouse. My cut's out of it, as agreed. (beat) No charge for sentiment. There wasn't any."],
      ['rhea', "(lower, to him only) I cashed Stavros's cheque yesterday. (She looks at the glass too.) It felt like a price."],
      ['caption', '(She gives him one nod. Exactly one. Business.)'],
    ] },
    { if: 'saved_teo', then: [
      { scene: { at: 'meridian_yard', cast: ['teo', 'lister'] }, say: [
        ['caption', "(A step behind Jay's shoulder, in a black suit that doesn't fit: Teo Vance, with his father's steel watch on his wrist. He hasn't slept in a while. It shows.)"],
        ['lister', '(to Teo) And you are?'],
        ['teo', "(a beat too long) I'm with Mr. Mercer."],
        ['caption', '(He has never once called him that. Neither of them says anything about it.)'],
        ['teo', '(low, when Lister has gone) The Kings want to know if we\'re Halberd now.'],
        ['jay', "We're whatever I say."],
        ['teo', "(looking down at the watch) Yeah. (beat) It's still right. Never loses a second. (beat) He'd hate that it's still right."],
      ] },
    ], else: [
      { scene: { at: 'meridian_yard', cast: ['teo'] }, say: [
        ['caption', '(Across the forecourt, in his red bomber with the gold lantern on the back, Teo Vance is watching. He doesn\'t come any closer.)'],
        ['teo', "I came to see what it looks like. Pop always said you'd be better than him at everything."],
        ['teo', "(looking at the glass, the Halberd woman, the councilman calling him sir) You're him now. (beat) Congratulations."],
        ['caption', "(He walks away across Meridian Yard. He doesn't look back. He's his father's son: he's always known exactly when to leave a room.)"],
      ] },
      { leave: ['teo'] },
    ] },
    { text: 'noor', message: 'I did this for a pharmacy, not a new Voss.' },
    { wait: 3 },
    { text: 'noor', message: "Don't call. I'll pick up. That's why." },
    { if: 'dex_forgiven', then: [
      { phone: 'dex', say: [
        ['dex', "(quiet, no jokes in him anywhere) I heard about the pier. Everybody's heard. Birdie heard it at school."],
        ['dex', "I've been what you are now, Jay. Four years. It doesn't get lighter. You think one more envelope and you'll be square."],
        ['dex', "(beat) It doesn't get lighter."],
        ['dex', "(away from the phone) Nobody, Bird. It's nobody. (He hangs up.)"],
      ] },
    ] },
    { if: 'dex_to_calder', then: [
      { phone: 'calder', say: [
        ['calder', "Dex Calloway asked to add a page to his statement this morning. He cried the whole way through. He signed it anyway."],
        ['calder', "Your name's on it, Mercer. Tidewater. And a pier. (beat) He said to tell you he's sorry. He said you'd know it isn't the same kind of sorry."],
      ] },
    ] },
    { if: 'trusted_calder', then: [
      { text: 'calder', message: "I can't prove the pier. Yet. I've got a pension and nothing to spend it on. I've decided to spend it on you." },
    ] },
    { getIn: 'lulu', objective: 'Get in Lulu', say: [
      ['caption', "(On Lulu's windscreen, under the wiper, there is a single red rose with every one of its thorns left on. No note. Ansel has never needed one.)"],
      ['caption', '(Roses are just thorns that got lucky. He doesn\'t move it. He drives with it there.)'],
    ] },
    { say: [
      ['jay', '(to the passenger seat, out of habit, before he turns the key) Seatbelt.'],
      ['caption', '(Nobody answers. He waits a second too long anyway. Then he pulls out.)'],
    ] },
    { if: 'kept_cut', then: [
      { say: [['caption', "(He owns every house on Heron Street now. Pelican sent the deeds in a box with a ribbon on it. He hasn't been to the pink one. Sentiment. It's expensive.)"]] },
    ], else: [
      { say: [['caption', "(On the back seat, under a coat, a yellow hoodie with a hole in one cuff. He hasn't driven it anywhere nice. He hasn't driven it anywhere at all.)"]] },
    ] },
    { if: 'foxes_done', then: [
      { text: 'lefty', message: "Frankie went bad in '83. Got everything he ever wanted. Walt never said his name again. Don't be Frankie. — L.M." },
    ] },
    { if: 'iggy_done', then: [
      { text: 'iggy', message: 'Tasha says you have drivers now. Constance would like to come home. I will collect her on Sunday. No need for you to be there. — I.P.' },
    ] },
    { setTime: 2.9 },
    { if: 'solace_done', then: [
      { goto: 'starlite_diner', vehicle: 'lulu', radius: 12, objective: 'The Starlite', say: [
        ['solace', "(on the radio, low) This is Solace. Two years I've been on the air saying the name of the man in the white suit. He's gone. Tonight I'm going to say a new one."],
        ['solace', '(on the radio) I used to say you drove beautifully, getaway driver. You do. (beat) That\'s the worst part.'],
        ['solace', "(on the radio) Every city has a voice. Ours just found out it can be bought twice. This frequency's still stolen. Come and take it off me."],
      ] },
    ], else: [
      { goto: 'starlite_diner', vehicle: 'lulu', radius: 12, objective: 'The Starlite', say: [
        ['caption', "(The radio's on. Something about the Crown, something about a new deal at the port. He doesn't hear any of it.)"],
      ] },
    ] },
    { say: [['caption', '(The star on the roof sputters. Through the window, the booth is empty. It is always empty now, at this hour, until he sits in it.)']] },
    { blackout: [
      ['caption', 'The Starlite. Three in the morning.'],
      ['caption', "(The window booth. J+M under his thumb. He doesn't remember sitting down.)"],
      ['caption', '(Dot Pike comes with the pot. She fills his cup. Then she sets a second cup on the other side of the table, the way she used to, and fills that too.)'],
      ['caption', '(Nobody ordered it. She doesn\'t say anything. She goes.)'],
      ['caption', '(On the table by the sugar, a white envelope, soft at the corners from a jacket pocket. In the corner, in pencil: 37. Still sealed.)'],
    ] },
    { if: 'refused_calder', then: [
      { blackout: [
        ['caption', '(Across the road under the dead street lamp, a dark green unmarked car faces the window. It has been there eleven nights. Nobody lifts two fingers off the wheel.)'],
      ] },
    ] },
    { blackout: [
      ['caption', '(His phone buzzes against the table. MAE.)'],
      ['caption', '(He looks at it.)'],
      ['caption', '(It buzzes.)'],
      ['caption', '(He looks at it.)'],
      ['caption', "(He doesn't answer.)"],
    ] },
    { if: 'nightshift_done', then: [
      { blackout: [
        ['caption', '(It stops. A minute later, one text.)'],
        ['mae', 'You made me start a new page.'],
      ] },
    ] },
    { fade: 'out' },
    { wait: 2 },
    { spawn: [{ char: 'mulgrew', at: 'southside_lot', behavior: 'idle' }] },
    { setTime: 8 },
    { fade: 'in' },
    { camera: 'southside_lot', seconds: 8, say: [
      ['caption', "(Southside Division. The car park, in the morning. On the steps, a new captain, forty-one, in a uniform still creased from the packet.)"],
      ['caption', '(A long teal two-door rolls past the gate at exactly the speed limit, its hands at ten and two.)'],
      ['caption', '(The captain watches it go. He lifts his wrist, and taps a brand-new gold watch at it. Twice.)'],
      ['mulgrew', '(smiling, to nobody) Tick tock.'],
    ] },
    { say: [['caption', '(Lulu turns onto Magnolia Street at exactly the speed limit, and is gone.)']] },
    { blackout: [
      ['caption', 'WHEELMAN'],
      ['caption', 'The best wheelman Vicehaven ever had. He stayed. The city kept him.'],
      ['caption', '(Silence. A long one.)'],
      ['dj_benji', "(on the radio, much too loud) Good morning Vicehaven, new day, new you, new boss in town, apparently! Anyway, here's a banger."],
    ] },
  ];

  // =====================================================================
  // m31 LAST LIGHT
  // =====================================================================
  S.missions.push({
    id: 'm31_last_light',
    act: 4,
    title: 'Last Light',
    giver: 'jay',
    start: 'chain',
    resumeAt: 'pier9_gate', // where it waits if the chain was interrupted
    time: 5.6,
    estMinutes: 12,
    summary: 'Sunrise at the end of the pier, where the letter was read, and the last choice.',
    reward: {},
    failIf: ['wrecked:lulu'],
    steps: [
      { music: 'tension' },
      { if: 'trusted_calder', then: [
        { scene: { at: 'pier9_gate', cast: ['calder', 'horne'] }, say: [
          ['caption', '(Pier 9. Twenty-four minutes to six. The floodlights are still on, and they have stopped meaning anything. Over the cranes the dark is coming off the sky like old paint.)'],
          ['caption', '(Captain Wade Horne sits on the kerb outside the guard booth with his hands cuffed behind him. Detective Ines Calder stands over him with an empty coffee cup.)'],
          ['horne', '(to Jay, the old smile trying to find its way back onto his face) Mercer. You left before the good part. She read me the rest of my rights. Both pages. Slowly.'],
          ['calder', "I wanted him to hear the whole thing. He's never heard the whole thing. He's always been the one reading it."],
          ['caption', "(Horne's shoulder twitches: thirty years of habit, reaching to tap a gold watch. The watch is in a plastic evidence bag in Calder's blazer pocket.)"],
          ['calder', '(patting the pocket) Exhibit fourteen. I numbered it myself. It felt right.'],
          ['jay', "Where's Voss?"],
          ['calder', "Noor told me. He came down here himself. First time in forty years Harlan Voss has set foot in Saltmarsh, and he came for a book."],
          ['horne', "(a low laugh) You think you're going to catch Harlan? Harlan doesn't get caught, son. Harlan gets inconvenienced."],
          ['calder', "(not looking at him) I can't go. I sit on this one till the van comes, or a lawyer in a nicer suit than mine has him home by lunch."],
          ['calder', '(as Jay turns) Mercer. Whatever\'s at the end of this. Make it something I can sign.'],
        ] },
      ], else: [
        { scene: { at: 'pier9_gate', cast: ['calder', 'horne'] }, say: [
          ['caption', '(Pier 9. Twenty-four minutes to six. The floodlights are still on, and they have stopped meaning anything. Over the cranes the dark is coming off the sky like old paint.)'],
          ['caption', '(Captain Wade Horne is chained to the Tidewater gate with his own handcuffs, his second phone taped over his badge, 0211 written on the tape in marker.)'],
          ['calder', "(from a card she hasn't needed in years) ...can and will be used against you. (She lowers it.) You've had the right to remain silent for three years, Wade. You used it beautifully."],
          ['horne', '(to Jay, rattling the chain) Mercer. Tell her about the gun. The boy had a—'],
          ['jay', 'He had a phone.'],
          ['caption', "(Horne's shoulder twitches: thirty years of habit, reaching to tap a gold watch. His wrists are round a gate post. The watch ticks on, out of reach.)"],
          ['calder', "(to Jay, low) You didn't trust me. Fine. I'm here anyway. Where's Voss?"],
          ['jay', "Harbor Road. Noor's got him."],
          ['calder', "Then go. I can't chase anybody till Central sends a car, and Central is having a very confusing morning."],
          ['calder', '(as Jay turns) Mercer. Whatever\'s at the end of this. Make it something I\'d sign.'],
        ] },
      ] },
      lulu('pier9_gate', { offset: [0, -8] }),
      halberdSuv('escort_a', 'fish_market', { offset: [-12, 0] }),
      { spawnCar: 'voss_car', type: 'sovereign', at: 'fish_market', color: PEARL },
      halberdSuv('escort_b', 'fish_market', { offset: [12, 0] }),
      { phone: 'noor', say: [
        ['noor', "Jay. Harbor Road, behind the fish market. The white Sovereign. The long one, like a wedding cake that learned to drive."],
        ['noor', "Two Halberd trucks on it, front and back. They're not moving. They're waiting for something."],
        ['jay', 'For what?'],
        ['noor', "I don't know! I'm a traffic engineer! I'm watching a pelican camera! (beat) Mae says Ansel's going to be fine. She said tell you that first. I'm telling you third. Sorry."],
        ['mae', '(behind Noor, shouting across the warehouse) Through and through! He\'s fine! He\'s complaining about the stitches! GO!'],
      ] },
      { getIn: 'lulu', objective: 'Get in Lulu' },
      { goto: 'fish_market', vehicle: 'lulu', stop: false, radius: 50, objective: 'Harbor Road, behind the fish market', say: [
        ['jay', '(to the car, the Pier 9 gate swinging behind them) Last one, Lulu. Last one. Then you can sleep for a year.'],
        ['rhea', "(over the radio, from a crane cab) I see him from up here. White car, two charcoal trucks, engines running. Like men waiting outside a church."],
        ['rhea', "(over the radio) He's waiting for his boat. Boats are late. Boats are always late. Stavros was late to his own wedding in one."],
      ] },
      { spawn: [
        driver('voss_driver', 'voss_car', 'voss_car', 'the_boardwalk'),
        driver('escort_a_driver', 'escort_a', 'escort_a', 'the_boardwalk'),
        driver('escort_b_driver', 'escort_b', 'escort_b', 'the_boardwalk'),
      ] },
      { music: 'action' },
      { destroy: ['escort_a', 'escort_b'], checkpoint: true, objective: "Wreck Voss's two Halberd escorts", say: [
        ['noor', "(over the radio) They're moving! They saw Lulu! Everybody sees Lulu! She's teal, Jay! She's the least subtle car in Vicehaven!"],
        ['noor', "(over the radio) Two Ironclads, front and back. He won't stop while he's got them. Take the trucks off him first!"],
        ['jay', '(to the car, closing on the first one) Easy. You\'re heavier than they are. You\'re older than they are. Be older than them.'],
        ['mae', '(over the radio, out of breath) Ansel says be careful. He says it twice. He\'s got a hole in his shoulder and he\'s saying it twice.'],
        ['ansel', '(over the radio, faint, very calm) Be careful.'],
        ['mae', "(over the radio) That's three."],
        ['rhea', "(over the radio) Harbor Road's my road, Mercer. Every pothole on it is a personal friend. Use the potholes."],
        ['noor', '(over the radio, as metal screams somewhere) Was that you? Tell me that was you. (beat) That was you. Okay. Okay. Shit. Okay.'],
      ] },
      { spawn: [
        { id: 'escort_a_crew', faction: 'halberd', at: 'escort_a', count: 2, weapon: 'smg', behavior: 'attack' },
        { id: 'escort_b_crew', faction: 'halberd', at: 'escort_b', count: 2, weapon: 'smg', behavior: 'attack' },
      ] },
      { say: [
        ['noor', "(over the radio) Both trucks are down! He's on his own! Jay, he's on his own for the first time in thirty years!"],
        ['rhea', '(over the radio) And the trucks had passengers. Four, crawling out with guns. Don\'t stop to chat, Mercer.'],
        ['caption', '(Somewhere ahead, the white Sovereign stops being careful.)'],
      ] },
      { heat: 3, checkpoint: true, say: [
        ['DISPATCH', '(on the police band) All units, Harbor Point. Caller reports an armed man in a teal lowrider pursuing him on Seawall Drive. Caller is... (a pause) Mr. Harlan Voss.'],
        ['noor', '(over the radio) He called the POLICE on you. He called the police. On you. The NERVE. I\'m going to need a new tab.'],
      ] },
      { timer: 300 },
      { chase: 'voss_car', mode: 'catch', escape: 450, route: ['seawall_overlook', 'starlite_diner', 'harbor_point', 'last_resort_bar', 'the_boardwalk'], objective: 'Stop Voss before his launch reaches the pier. Box him in.', say: [
        ['noor', "(over the radio) The launch is out past the breakwater! Five minutes, maybe four! He's going round Harbor Point in circles till it comes!"],
        ['jay', '(to the car, a cruiser filling the mirror) Come on. Come on, old girl. One more lap. You know these streets better than he does.'],
        ['voss', '(on the police band, unhurried, as if from a deckchair) Mr. Mercer. You\'re braking early into the corners. Augustine would have mentioned it.'],
        ['noor', '(over the radio) Is that HIM? On the police band? Don\'t listen to him! I\'ve got your telemetry, you\'re braking perfectly! Probably! I think!'],
        ['jay', '(flooring it) I\'m not listening.'],
        ['rhea', '(over the radio) Southside, two blocks behind you. They\'re not Horne\'s now. They don\'t know whose they are. That makes them stupid.'],
        ['noor', "(over the radio) Starlite corner! He's going past the Starlite! Somebody's eating pancakes in the window and watching you, Jay, you're on a pancake man's morning!"],
        ['jay', '(threading Lulu between a delivery van and a hydrant, almost to himself) Ten and two. Heart at twelve.'],
        ['mae', "(over the radio) Jay. Whatever you're about to do. (beat) Just... come back after."],
        ['noor', '(over the radio) Launch is three minutes out! Three! He\'s heading for the boardwalk! Don\'t let him get to the pier!'],
      ] },
      { heat: 0 },
      { say: [
        ['DISPATCH', "(on the police band) All units. Disregard the Seawall pursuit. Sergeant Delgado's orders. (pause) He says he heard the Pier 9 tape at two minutes to four and he's going home."],
        ['DISPATCH', '(on the police band, quieter) Southside has no captain this morning. Everybody... just go and get a coffee.'],
      ] },
      { if: 'trusted_calder', then: [
        { say: [['calder', '(on the police band, flat, tired, wonderful) Detective Calder, Robbery-Homicide. Oceanview Pier is my scene. Nobody touches the teal car. That\'s my witness.']] },
      ] },
      { fade: 'out' },
      { teleport: 'oceanview_pier', vehicle: false },
      lulu(PIER_KERB),
      { spawnCar: 'voss_wreck', type: 'sovereign', at: VOSS_WRECK, exact: true, heading: VOSS_WRECK.yaw, color: PEARL, locked: true },
      { spawn: [{ char: 'voss', at: 'pier_end', behavior: 'idle', health: 40 }] },
      { music: 'off' },
      { fade: 'in' },
      { camera: 'oceanview_pier', seconds: 9, checkpoint: true, say: [
        ['caption', '(The foot of Oceanview Pier. The white Sovereign has gone over the kerb and nose-first into the bollards under the arch. Its driver is halfway up Seawall Drive, running.)'],
      ] },
      { goto: 'pier_end', vehicle: false, radius: 6, objective: 'Down the pier. All the way to the end.', say: [
        ['caption', '(The back door hangs open. Far down the pier, a man in a white suit is walking toward the sea with a green book under his arm. He is not hurrying. He never has.)'],
        ['caption', '(The same boards. The gulls on every lamp post. Not three weeks ago an old man walked this with two fishing rods the wrong way round and a thermos of terrible coffee.)'],
        ['caption', "(An old man is casting off the rail, catching nothing with tremendous dignity. It might be the same one. He doesn't look round.)"],
        ['noor', '(in his ear, very small now) Launch is two minutes out. Jay. (beat) I don\'t know what to tell you to do.'],
        ['jay', "(walking) That's okay. Nobody does."],
      ] },
      { say: [['caption', '(He stops a few boards short of the end.)']] },
      { setTime: 6.05 },
      { camera: 'pier_end', seconds: 9, say: [
        ['caption', '(The end of the pier. A bench, a rail, a lifebuoy nobody has ever thrown. The sun is just under the water, and the whole bay is waiting for it.)'],
      ] },
      { scene: { at: 'pier_end', cast: ['voss'] }, say: [
        ['caption', '(Harlan Voss stands at the rail with the green book in both hands. There is a grey smear of rail-dust on one white cuff: the first mark anyone has ever seen on him.)'],
        ['voss', '(not turning round) No vest this time.'],
        ['jay', 'No.'],
        ['voss', "Good. It never suited you. You looked like a man pretending to park."],
        ['voss', "(brushing at the cuff; it doesn't come off) There's a bench. Sit, if you like. I paid for it. Nineteen ninety-four. There's a plaque. Nobody reads plaques."],
        ['jay', '(not sitting) Augie sat there.'],
        ['voss', "I know. Kessler had a man on the boardwalk with a long lens. Two men with fishing rods the wrong way round. One of them cried. The photographs weren't clear."],
        ['jay', '(quietly) Me.'],
        ['voss', "(nodding, as if that settles a small bet) I thought so. Augustine planned for thirty years and never fired a shot. I always took that for vanity."],
        ['voss', '(beat) It was. It was also the only thing in this city I never managed to buy.'],
        ['caption', '(Jay takes something small out of his jacket pocket and sets it on the rail between them. A wedding ring. Rourke\'s. It rolls a quarter of an inch and stops.)'],
        ['voss', '(looking at it, not touching it) He took that off before work.'],
        ['jay', 'He was always at work.'],
        ['caption', '(Out in the bay, low and white, a launch comes round the end of the breakwater. On her bow, in navy letters: HOPE.)'],
        ['voss', "Kessler named her. I didn't ask him to. He had a sense of humour about the wrong things. (beat) Two minutes. Let's not waste them."],
        ['voss', "Rhea Kostas has thirty million dollars of mine in her warehouse. Keep it. All of it. Share it however you like. I won't send anybody. There's nobody left to send."],
        ['voss', 'The vote is at nine. It will pass. The Crown opens at noon. In four years Old Market will be glass, and very beautiful, and nobody who photographs it will know what it cost.'],
        ['voss', "And Heron Street. Every house. I'll sign them to you this morning, hers in the middle. Fill them with people you like. Let the tomatoes go over the fences."],
        ['caption', '(A gull lands on the rail beside the ring, decides against it, and goes.)'],
        ['jay', 'And the book?'],
        ['voss', "(lifting it an inch) This? Take it. Put it in your glovebox. Insurance. As long as it's in a glovebox a long way from here, you're safe, and I'm safe."],
        ['jay', 'Why would you give it to me?'],
        ['voss', "Because you won't open it. (beat) I'm told you don't open your mail."],
        ['caption', '(It lands exactly where it was aimed.)'],
        ['jay', 'I do now.'],
        ['voss', 'All of it?'],
        ['jay', '(beat) Thirty-six.'],
        ['voss', '(the smallest smile) And the last one?'],
        ['jay', "...I'm saving it."],
        ['voss', "Of course you are. Men like us always keep one envelope shut. It's how we know we could still leave."],
        ['voss', "Take the money and drive, Mr. Mercer. It's what you do. You were magnificent tonight."],
        ['voss', "I told you on the band you were braking early. You weren't. You never once touched the brake when you didn't mean it. I wanted to see if you'd listen."],
        ['voss', "You'll be magnificent in some other city. I mean that. I build for weather. I have never once wished it would stay."],
        ['jay', '(and when it comes, it comes slowly, to the water) My father drove a truck. Long haul. When I was six he said he\'d be back Sunday.'],
        ['jay', "I sat on Nana's step and watched his taillights all the way down Heron Street. Left onto Coral. Gone."],
        ['jay', 'Nana taught me where to put my hands. He taught me the rest. You watch the lights get small. You find out they always do.'],
        ['jay', 'Tidewater. Augie said drive, and I drove. Three years at the speed limit. (beat) Leaving. It\'s the only thing I was ever better at than driving.'],
        ['voss', '(gently, and he means it) Then be good at it. There\'s no shame in a gift.'],
        ['jay', '(looking back down the whole length of the pier, all the way to the city) Last time I was out here, a man with his rods the wrong way round told me there was nobody there to leave.'],
        ['voss', '(gently) And he was right. Augustine was usually right. It\'s why he died poor.'],
        ['jay', "(beat) There's a lot of people there this time."],
        ['voss', '(spreading his hands, the book in one of them) There always are, Mr. Mercer. That\'s all a city is. It has never once stopped anybody driving.'],
        ['caption', '(The launch is close enough to hear now: a low engine, idling, patient. A man in a white shirt stands on the bow with a rope.)'],
        ['voss', "One minute, Mr. Mercer. I'm not frightened of you. I'd like you to know that. I'm only curious which way you'll go."],
        ['caption', '(And the sun comes up out of the bay, all at once, the way it does at the end of the pier and nowhere else, as if somebody has told it to.)'],
      ] },
      { music: 'sad' },
      { choice: { prompt: 'One minute. Harlan Voss is holding out the book.', options: [
        { label: 'Drive.', flag: 'ending_a', then: ENDING_A },
        { label: 'Give it to the city.', flag: 'ending_b', then: ENDING_B },
        { label: 'Finish it.', flag: 'ending_c', then: ENDING_C },
      ] } },
    ],
  });
})();
