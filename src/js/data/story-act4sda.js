/*
 * data/story-act4sda.js — SIDE CHAIN 3: DEAD AIR (da1 to da4), for "Ten and
 * Two". Giver: Solace (Lorna Achebe), the pirate DJ who steals Harbor Heat
 * 103.7 after midnight. Unlocks after m12. Sets `solace_done` (Ending B
 * without Calder: the Tally read live on air; Ending C: Solace denounces Jay).
 *
 * Plants for later acts: Solace knows "ten and two" (m27 dedication), says
 * Jay drives "beautifully" (Ending C), Sable leaves the transmitter door open
 * and is furious about it (m31), and she already said Tommy's name on air
 * three years ago (m30, the dashcam audio on a loop).
 *
 * New minor character: Marguerite Bello (`marguerite`), the caller Solace was
 * cut off from on her last legal show. Recurring props: the van is Dolly, her
 * father's old ice-cream van, whose chime plays a semitone flat; Priya's cat
 * is called Quorum.
 */
(function () {
  'use strict';
  const S = window.VH.Data.story;
  let chain = S.side.find((c) => c.id === 'side_deadair');
  if (!chain) { chain = { id: 'side_deadair', title: 'Dead Air', giver: 'solace', unlockAfter: 'm12_the_councilmans_pool', missions: [] }; S.side.push(chain); }

  Object.assign(S.characters, {
    marguerite: { name: 'Marguerite Bello', role: 'A caller from Tannery Row', age: 66, look: { skin: 0x5a3422, hair: 0xb8b4ac, top: 0x8a5a7a, bottom: 0x3a3a4a, shoes: 0x3a2a20, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 0.95, rate: 0.88 } },
  });

  // ------------------------------------------------------------ helpers
  const PURPLE = 0x5a2f7a;
  const HALBERD = 0x3a3f45;
  /** Dolly: Solace's purple transmitter van, an old ice-cream van. */
  const dolly = (at, extra) => Object.assign({ spawnCar: 'solace_van', type: 'porter', at, color: PURPLE, name: 'Dolly' }, extra || {});
  /** A charcoal Halberd Ironclad. */
  const halberdSuv = (id, at, extra) => Object.assign({ spawnCar: id, type: 'ironclad', at, color: HALBERD }, extra || {});
  /** A charcoal Halberd Porter with a dish on the roof. */
  const dishVan = (id, at, extra) => Object.assign({ spawnCar: id, type: 'porter', at, color: HALBERD }, extra || {});
  /** Somebody behind the wheel of a spawned car, driving to a place. */
  const driver = (id, car, at, to) => ({ id, faction: 'halberd', hostile: false, at, behavior: 'drive', car, to });

  // =====================================================================
  // da1 — Frequency
  // =====================================================================
  chain.missions.push({
    id: 'da1_frequency',
    title: 'Frequency',
    giver: 'solace',
    start: 'harbor_beach',
    time: 0.5,
    estMinutes: 8,
    summary: 'A pirate DJ needs a driver who goes round potholes, and she is not going off the air for anybody.',
    reward: { money: 1000 },
    failIf: ['wrecked:solace_van'],
    steps: [
      { music: 'off' },
      dolly('harbor_beach'),
      halberdSuv('dish_a', 'seawall_overlook'),
      halberdSuv('dish_b', 'the_boardwalk'),
      { say: [
        ['caption', "(Harbor Beach at half past midnight. Kids round a driftwood fire, one speaker between them, turned all the way up.)"],
        ['dj_sable', "(on the kids' speaker) Harbor Heat. It's Sable. It's midnight, which means in about four seconds I lose control of my own transmitter. Again."],
        ['dj_sable', '(on the radio) (deadpan) I am furious.'],
        ['caption', '(A chime, like an ice-cream van, a semitone flat. The kids cheer.)'],
        ['solace', "(on the radio) This is Solace, and this frequency is stolen, like everything else in this town. Good morning, Vicehaven. Or good night. Depends how it's going."],
      ] },
      { scene: { at: 'harbor_beach', cast: ['solace'] }, say: [
        ['caption', "(Up on the road above the sand, a purple van with the ghosts of ice-cream decals on its flanks. A cable runs out of its back door to a woman on the kerb with a microphone.)"],
        ['solace', "(into the mic, warm, slow, a lighthouse of a voice) ...and that's a record for anybody working tonight. Go and make a sandwich. (She clicks off.)"],
        ['solace', '(in a completely different voice, fast and flat) You came. Good. Say nothing on the mic. Ever. The mic is not your friend.'],
        ['jay', 'You said it on the air. “Getaway hands. Harbor Beach. Half past twelve.”'],
        ['solace', 'And here you are, with your getaway hands. Who heard it? You don\'t strike me as a listener.'],
        ['jay', "A friend. She's got every show you've ever done on a hard drive. Labelled."],
        ['solace', '(pleased despite herself) I have one of those. Every pirate has one of those.'],
        ['solace', 'A valet called Hollis rang my tip line. Said a man with getaway hands stole a councilman\'s car from a pool party and gave it back with the seat where he found it.'],
        ['solace', "I've been looking for a man who gives things back. It's a short list. You're the list."],
        ['jay', 'What do you need?'],
        ['solace', '(nodding up the road) See those? Charcoal Ironclads with a dish on the roof. Halberd Signals. They do a slow dance round Harbor Point every night, pointing at things.'],
        ['solace', "My van talks to Sable's mast on the Harbor Heat building. His mast talks to the city. They can't touch his mast; it's licensed. They can find my van."],
        ['solace', 'When both dishes point at the same spot, I\'m a dot on a map, and a dot on a map gets a visit. Tonight they\'re close. Tonight I\'m a dot.'],
        ['jay', 'So go off the air.'],
        ['solace', "(as if he'd suggested she take off her skin) No."],
        ['solace', "Dead air is the only sin in radio. If I go quiet, they know they frightened me, and every person who ever called me finds out I was just a voice."],
        ['solace', "So we move. A moving dot smears. You drive me to the old drydock in Saltmarsh. There's half a ship on blocks down there, two thousand tons of steel. Inside that, I'm a rumour."],
        ['jay', 'Easy.'],
        ['solace', "It isn't. (patting the van) The transmitter is valves. Nineteen sixty-two. Older than you, warmer than you, more fragile than you. One pothole and the whole city hears a goose die."],
        ['solace', 'Smooth. Fast and smooth. And I narrate. I always narrate. When this record ends I\'m live, and so are you.'],
        ['jay', "(looking at the van) What's her name?"],
        ['solace', "(a beat; she didn't expect that) Dolly. She was my father's. He sold ice cream out of her in Saltmarsh for twenty-two years. The chime still works."],
        ['solace', "It's flat. He never fixed it. He said nobody buys ice cream from a van that's in tune. They think it's a trick."],
      ] },
      { join: ['solace'], weapon: 'fists' },
      { getIn: 'solace_van', objective: 'Get in Dolly. Solace rides shotgun with the microphone' },
      { spawn: [driver('dish_driver_a', 'dish_a', 'seawall_overlook', 'harbor_beach'), driver('dish_driver_b', 'dish_b', 'the_boardwalk', 'harbor_beach')] },
      { music: 'tension' },
      {
        deliver: 'solace_van', to: 'drydock_slip', maxDamage: 0.15, timeLimit: 180, checkpoint: true,
        say: [
          ['solace', "(on air, the lighthouse voice back as if a switch had been thrown) We're mobile tonight, Vicehaven. Tonight we have a driver."],
          ['solace', "(on air) I won't tell you his name, because I don't know it, and because he has the kind of face that's had enough said about it already."],
          ['solace', '(on air) He\'s pulling out. Mirror. Signal. Mirror again. Vicehaven, he checked his mirror twice. When did a man last check his mirror twice for you?'],
          ['solace', '(on air) Hands at... (off mic) Baby, where are your hands?'],
          ['jay', '(not looking away from the road) Ten and two.'],
          ['solace', '(on air) Ten and two. You hear that? Like they taught us. (off mic) Who taught you that?'],
          ['jay', '(after a while) A school-bus driver.'],
          ['solace', '(on air) A school-bus driver. Somewhere tonight a school-bus driver is very proud, and doesn\'t know why.'],
          ['jay', '(to the van, under his breath) Easy, Dolly. Easy. I\'ve got you.'],
          ['solace', "(on air) He talks to the van. Vicehaven, he talks to my father's van. I'm not crying. It's the valves. They run hot."],
          ['solace', "(on air) Tonight's first tip. A loan officer at Pelican Home Equity has been backdating notices. Somebody's grandmother lost a house on a Tuesday that didn't exist."],
          ['caption', '(Jay does not say anything. His knuckles go pale on the wheel, at ten and at two.)'],
          ['solace', "(off mic, watching his hands) ...You okay?"],
          ['jay', 'Pothole.'],
          ['solace', '(off mic, quietly) There was no pothole. (on air) He\'s taking the corner... he\'s taking it beautifully, Vicehaven.'],
          ['solace', "(on air) To the gentlemen in the charcoal polos with the dishes on your roofs: hi. You're listening. Everyone's listening. That's the whole point of me."],
          ['solace', "(on air) He brakes early, this one. Not scared-early. Sorry-early. That's a man who's been somewhere he didn't stop when he should have. Or did, and wishes—"],
          ['jay', '(flat) Read the tips.'],
          ['solace', '(on air, gently) Reading the tips.'],
        ],
      },
      { music: 'action' },
      { spawn: [{ id: 'tech', faction: 'halberd', at: 'drydock_slip', count: 2, weapon: 'fists', behavior: 'attack', group: 'techs' }] },
      {
        kill: 'group:techs',
        objective: "Two Halberd techs with a handheld dish. Put them down before they call it in",
        say: [
          ['caption', "(Under the half-built hull, two men in charcoal polos are already waiting with a handheld dish and a clipboard. One of them is eating a sandwich.)"],
          ['halberd_guard', "(into his radio, sandwich in his other hand) Signals, it's Wren. We have a hit at the drydock, it's— it's purple. It's an ice-cream van?"],
          ['solace', '(on air, delighted) Ladies and gentlemen, a disagreement has broken out at the stern. The driver is expressing a view.'],
          ['solace', '(on air) It\'s a strong view. It\'s a very well-argued view. Somebody\'s sandwich has gone in the water.'],
        ],
      },
      { music: 'off' },
      { scene: { at: 'drydock_slip', cast: ['solace'] }, say: [
        ['caption', "(Inside the hull's shadow, welders' sparks falling somewhere above like slow rain. Dolly ticks as she cools. Solace switches the mic off and, for a second, just breathes.)"],
        ['solace', "We're off. Twelve minutes of records. It's the only twelve minutes a night I'm not talking. (beat) You can say something now. It won't go anywhere."],
        ['jay', "(after a while) Why? All this. A van and a stolen mast and men with dishes."],
        ['solace', '(sitting on the bumper) I used to be legal. Bay 91, the community station under the Hotel Paloma. Overnights. Phone-in. Eleven years.'],
        ['solace', 'A fund bought it. A Voss Meridian fund, three companies deep. They turned it into Smooth 91. All hits. No talk.'],
        ['solace', "My last show, I had a woman on the line. Marguerite, from Tannery Row. Her son had been evicted that afternoon and she was trying to tell me where he'd gone."],
        ['solace', "She was crying. She was in the middle of a sentence. And they pulled the plug from the building. Eleven seconds of dead air. Then a jingle for VossMart."],
        ['solace', "I never found out where he went. I never found out what she was going to say. (beat) So now I don't stop talking. That's all. It's not brave. It's a stammer."],
        ['jay', '(beat) Two years?'],
        ['solace', 'Two years. Sable leaves the transmitter door unlocked every night at twelve. He says he\'s furious about it.'],
        ['jay', 'Is he?'],
        ['solace', '(a smile she puts away fast) He brings me coffee at four and leaves it by the door. Two sugars. He has never once said hello.'],
        ['solace', "(looking at him properly) I know who you are, baby. I don't say names. Names are what they subpoena. But I know."],
        ['solace', "Three years ago I said Tomás Reyes on the air. Nineteen. “Police say he was armed.” I said “they say” four times in one sentence. It was all I had."],
        ['jay', '(very still, and then) Tommy.'],
        ['solace', 'Sorry?'],
        ['jay', 'Nobody called him Tomás. Only his mother, when he was in trouble. (beat) He was in trouble a lot. She called him Tomás a lot.'],
        ['solace', '(quietly) Then next time I\'ll say Tommy.'],
        ['caption', '(For a while neither of them says anything. It is, for both of them, a very unusual amount of quiet.)'],
        ['solace', "(standing, the other voice coming back) Same time next week? I'm going to need a driver who goes round potholes that aren't there."],
        ['jay', "I don't do regular."],
        ['solace', "Nobody does regular, baby. That's why I'm on every night. (She clicks the mic on.) ...Good morning, Vicehaven. Still here."],
      ] },
      { text: 'noor', message: 'WAS THAT YOU ON 103.7. She said “beautifully”. I have it recorded. Labelled. I am going to play it at your funeral, and at mine.' },
    ],
  });

  // =====================================================================
  // da2 — Call-In
  // =====================================================================
  chain.missions.push({
    id: 'da2_call_in',
    title: 'Call-In',
    giver: 'solace',
    start: 'civic_plaza',
    time: 23,
    estMinutes: 9,
    summary: 'A council aide has the Phase Two whip list, a cat, and two men at a bus stop where there is no bus.',
    reward: { money: 2000 },
    failIf: ['wrecked:solace_van'],
    steps: [
      { music: 'off' },
      { spawn: [{ char: 'priya', at: 'civic_plaza', offset: [3, 2], behavior: 'idle' }] },
      { phone: 'solace', say: [
        ['solace', "It's the off-air me. I'm told she's less fun."],
        ['jay', 'I like her fine.'],
        ['solace', "Liar. Listen. Somebody's been mailing my P.O. box. Paper. Three letters, no name, City Hall envelopes with the crest cut off with nail scissors."],
        ['solace', "Who sends paper in this century? Somebody who's read the rules. Somebody who works where the rules are."],
        ['solace', "Tonight she wants to hand me the rest in person. I don't do in person. I'm a voice. Voices don't have kneecaps."],
        ['jay', 'So I do in person.'],
        ['solace', "You do in person. The Beacon. She'll be the one reading the plaque. Nobody reads the plaque."],
        ['solace', "Bring her to Dolly at the seawall overlook. And driver? She's frightened. Frightened people either run or talk too much. Pray for talk."],
      ] },
      { scene: { at: 'civic_plaza', cast: ['priya'] }, say: [
        ['caption', "(Civic Plaza at eleven at night, under the golden Beacon. A woman in a navy cardigan is reading the plaque at its foot with tremendous concentration. At her feet: a cat carrier.)"],
        ['priya', "(not looking up) Did you know the Beacon was paid for by public subscription in 1931? Eleven thousand people gave a dime each."],
        ['priya', "I've read this plaque nine times. I could sit an exam on this plaque."],
        ['jay', "You're the aide."],
        ['priya', "I'm AN aide. Not THE aide. There are lots of aides. We're like pigeons. Nobody looks at us, and we see everything, and we— (She looks at him properly.) Oh, no."],
        ['priya', "Oh no. You're the valet."],
        ['jay', "I don't know what you're talking about."],
        ['priya', "Councilman Pruitt made me pull the pool-party footage that same night. He watched it forty times. “Look at his hands, Priya. Look at those hands.”"],
        ['priya', 'You parked Bijou.'],
        ['jay', '(a long pause) She was very good about it.'],
        ['priya', "(sitting down hard on the plinth) He's been eating antacids like popcorn ever since. He keeps saying “the valet knows”. I thought it was a metaphor."],
        ['jay', "(nodding at the carrier) Who's that?"],
        ['priya', "Quorum. He's always present and he never does anything. He's the most qualified person in City Hall."],
        ['priya', "(holding up a manila envelope; her hand is shaking so the paper rattles) The Phase Two whip count. Thirteen seats. Seven to win. He bought nine."],
        ['priya', "Every name, and next to every name, what it cost. In the chief of staff's handwriting. On City Hall paper. They used OUR paper. I order that paper."],
        ['jay', 'Why you?'],
        ['priya', "I write Pruitt's speeches. “Renewal is a promise we make to our grandchildren.” I wrote that. (beat) My grandmother lives on Tannery Row."],
        ['priya', "She sent me the Renewal notice they stapled to her door. She'd circled the line I wrote. In red. She didn't write anything else. She didn't have to."],
        ['jay', 'You could just leave. Take the cat.'],
        ['priya', 'My sister lives in Marrow Springs. I could be there by Tuesday.'],
        ['jay', 'I hauled lettuce through Marrow Springs. There\'s one light. It\'s always red.'],
        ['priya', "That's what she says! She says it like it's a selling point!"],
        ['priya', "(quieter) There were two men at my bus stop tonight. Reading the timetable. There's no bus. I've lived there six years. There has never been a bus."],
        ['priya', 'I have a cat. Who feeds the cat if I die? Write that down.'],
        ['jay', "Nobody's dying. Where's your car?"],
        ['priya', "I don't drive. I take the bus that doesn't exist. (Her eyes go past his shoulder, and stop.) Those two. By the fountain. They're not reading anything."],
      ] },
      halberdSuv('plaza_suv', 'civic_plaza', { offset: [16, 10] }),
      { spawn: [{ id: 'timetable', faction: 'halberd', at: 'civic_plaza', offset: [14, 10], count: 3, weapon: 'pistol', behavior: 'attack', group: 'plaza' }] },
      { music: 'action' },
      { join: ['priya'], weapon: 'fists' },
      { protect: 'priya' },
      { getIn: 'any', checkpoint: true, objective: 'Get Priya and Quorum into a car. Any car', say: [
        ['halberd_guard', "(across the plaza, hand going under his polo) Ms. Venkataraman! The company would like its paper back!"],
        ['priya', "(running, holding the carrier like a rugby ball) That's MY paper! I ordered it! There's a form!"],
        ['jay', 'Keep your head down. Stay behind me.'],
      ] },
      { heat: 2 },
      { loseHeat: true, objective: "Halberd called it in as a carjacking. Lose Southside", say: [
        ['priya', "They called the police! They're not the police and they CALLED the police! Can they do that?"],
        ['jay', 'Seatbelt.'],
        ['priya', 'What?'],
        ['jay', "Seatbelt. No, I'm not joking. Seatbelt."],
        ['priya', "(clicking it) Quorum doesn't have a seatbelt!"],
        ['jay', "Quorum's in a box. He's the safest one in the car."],
        ['priya', "(as they take a corner on two complaining tyres) Shit. Shit. Sorry. I don't swear. I swear at work, under my breath. In the minutes I write “robust discussion”."],
        ['jay', '(to the car) Come on. Come on, sweetheart.'],
        ['priya', 'Are you talking to the car?'],
        ['jay', "She's nervous."],
        ['priya', "SHE'S nervous?"],
        ['priya', "(as the sirens fall behind) I wrote a speech once. “Meridian Boulevard, the spine of our city.” Pruitt cut “spine”. He said it made people think of injuries."],
      ] },
      { music: 'tension' },
      { goto: 'seawall_overlook', vehicle: true, radius: 40, objective: "Get Priya to Solace's van at the seawall overlook", say: [
        ['priya', '(after a long silence, holding the carrier on her knees) Why are you doing this? Does she pay you?'],
        ['jay', 'A thousand dollars and a pothole.'],
        ['priya', "I don't know what that means, and I'm not going to ask, because I think it's beautiful and I don't want it ruined."],
        ['priya', '(beat) Did you ever leave somewhere? Properly. Pack the car, don\'t look back.'],
        ['jay', '(a long time) Once.'],
        ['priya', 'Was it better?'],
        ['jay', 'It was quieter.'],
        ['priya', '(looking at the cat) Quorum hates quiet. He yells at the fridge.'],
      ] },
      halberdSuv('seawall_suv_a', 'seawall_overlook', { offset: [8, 0] }),
      halberdSuv('seawall_suv_b', 'seawall_overlook', { offset: [-8, 0] }),
      { spawn: [{ id: 'seawall_gun', faction: 'halberd', at: 'seawall_overlook', count: 3, weapon: 'smg', behavior: 'attack', group: 'seawall' }] },
      { music: 'action' },
      { say: [
        ['caption', "(No purple van at the seawall. Just two charcoal Ironclads with dishes on their roofs, doors open, and three men turning round at the sound of the engine.)"],
        ['halberd_guard', "That's the car! The aide's in the car!"],
        ['priya', "They're shooting! At a car! With a CAT in it!"],
        ['dj_sable', "(on the radio, low) Harbor Heat. It's Sable. It's not midnight. (beat) She's early."],
        ['dj_sable', '(on the radio) I am... very furious.'],
        ['caption', '(The flat chime. Then the lighthouse voice, faster than usual.)'],
        ['solace', "(on the radio) Sorry, Sable. Emergency. Vicehaven, I'm on early, because some gentlemen in polos have been reading my mail."],
        ['solace', '(on the radio) A message for the man who goes round potholes that aren\'t there. Plans have changed. Don\'t come to the water.'],
        ['solace', '(on the radio) Come where the old folks play shuffleboard, under a banner that lies about gold. Bring your friend. Bring her friend.'],
      ] },
      { goto: 'bayview_gardens', vehicle: true, radius: 30, objective: "Get clear of the seawall. Find Solace by the banner that lies about gold", say: [
        ['priya', "(head down, decoding) Shuffleboard. Banner. Gold... Bayview Gardens! The Golden Years Equity banner! Pelican's reverse mortgages for pensioners!"],
        ['priya', "I wrote a speech against that banner! Pruitt didn't give it. He said pensioners don't vote. They vote more than anybody! They vote like it's bingo!"],
        ['jay', 'Head down.'],
        ['priya', "(head down, still talking) She's very good. She just told the whole city where she is and only the people who hate that banner know."],
        ['priya', "Halberd think that banner is TRUE. They'll never get it."],
      ] },
      { music: 'off' },
      dolly('bayview_gardens'),
      { scene: { at: 'solace_van', cast: ['solace', 'priya'] }, say: [
        ['caption', "(Bayview Gardens. Pastel courtyard, shuffleboard court, and Pelican's GOLDEN YEARS EQUITY banner flapping overhead. Dolly is parked under it like an insult.)"],
        ['solace', "(off air, climbing out of the back of the van) There she is. The council aide with a cat."],
        ['priya', "(holding out the envelope with both hands, like a diploma) It's all there. Every seat. Every price."],
        ['solace', "(reading the first page under the courtyard light; her face doesn't move, which is how you know) Oh, baby."],
        ['solace', '(reading on) “Seat six. Marina berth, plus sponsorship for niece\'s racing.” They wrote down the niece. They wrote down the NIECE.'],
        ['priya', "Will you read it tonight? Can you read it now? Before they— I don't know what they do. Pruitt says nobody knows what they do. That's the point of them."],
        ['solace', "(folding the envelope away inside her jacket) Not tonight."],
        ['priya', 'What? Why not? I nearly died! Quorum nearly died!'],
        ['solace', "A list read once at midnight is gossip, baby. People hear it in the bath and forget it by breakfast."],
        ['solace', "A list read right is a vote. I need the whole city listening. I need a big night, and I need a roof. When I have both, I'll read it."],
        ['priya', '(quietly) Will you say where it came from?'],
        ['solace', "I'll say a council aide with a cat."],
        ['priya', "Don't say cat! Everybody knows I have a cat! I have a cat calendar on my desk! Everybody signs it on my birthday!"],
        ['solace', "(gravely) Then I'll say a council aide with a dog."],
        ['priya', '(beat) I would never have a dog.'],
        ['solace', "(to Jay, not quite smiling) See? They always tell you exactly who they are. You just have to say the wrong thing first."],
        ['priya', "(picking up the carrier) I'm going to Marrow Springs. Tonight. My sister has a couch."],
        ['jay', 'One light.'],
        ['priya', "(at him, almost laughing, almost crying) Always red. I know. (beat) Thank you for the seatbelt."],
        ['solace', '(watching her go) Frightened people run, or they talk too much. (to Jay) She did both. Those are the ones who come back.'],
      ] },
      { text: 'priya', message: "Sister's couch. Quorum is yelling at her fridge. I walked down to the light to see it. Red. I stood there till it changed. Four minutes. I don't know why I'm telling you this." },
    ],
  });

  // =====================================================================
  // da3 — Jammer
  // =====================================================================
  // Garza's scene is built from shared lines so each branch plays as one
  // scene. Rourke goes off the crane in m30; after that the email comes
  // from whoever has his desk.
  const GARZA_VAN = [
    ['caption', '(The fourth Porter is on its side against a bollard, its dish bent into a cupped hand. A man crawls out of the back with a pair of enormous headphones still round his neck.)'],
    ['garza', '(seeing Jay) No. No no no. EVERY TIME. Every time, it is YOU.'],
    ['garza', "They moved me to Signals. They said Signals was a DESK. (pointing at the van) The desk is IN the van. The desk MOVES. The desk is now on its SIDE."],
    ['jay', 'Laptop.'],
    ['garza', "(handing it over at once) Six weeks of her. Every place she parked. Her plate. A map with the drydock circled. I circled it. I'm sorry. It's a nice circle."],
  ];
  const GARZA_EMAIL_ROURKE = [
    ['garza', "(beat) You should know Mr. Rourke sent an email today. It didn't say thank you. They always say thank you."],
  ];
  const GARZA_EMAIL_AFTER = [
    ['garza', "(beat) You should know the new boss sent an email today. First one since Mr. Rourke. Since the crane. (beat) His always said thank you. This one didn't."],
  ];
  const GARZA_GO = [
    ['garza', "It said: “Done listening.” That's it. Two words. That's not a Signals email, man. That's not a Signals email at all."],
    ['jay', 'Then go home, Lucky.'],
    ['garza', '(already backing away, then stopping) Hey. Tell her... (He touches the headphones.) For work, I listened. Every night. And then, after work. Also.'],
    ['garza', "She did a whole hour on loneliness once. People called in. A man called in from a lighthouse. A real one. Tell her I liked the hour on loneliness."],
    ['garza', "(to the sky, as he goes) I asked for a DESK!"],
  ];
  chain.missions.push({
    id: 'da3_jammer',
    title: 'Jammer',
    giver: 'solace',
    start: 'last_resort_bar',
    time: 1,
    estMinutes: 8,
    summary: 'Two nights of dead air. Three Halberd vans are drowning Solace in static, and a fourth is listening for where she sleeps.',
    reward: { money: 2500 },
    steps: [
      { music: 'off' },
      { scene: { at: 'last_resort_bar', cast: ['noor', 'solace'] }, say: [
        ['caption', "(The Last Resort, one in the morning, under the neon flamingo that buzzes like a wasp. Noor has her laptop open. Opposite her sits Solace, headphones round her neck, very quiet.)"],
        ['noor', "(to Jay, in an urgent whisper, as he sits) She's HERE. She's at our table. She drank out of our water jug. I'm never washing that jug."],
        ['solace', "(without looking up) I can hear you, baby. Hearing is my whole thing."],
        ['noor', '(dying) Okay. Good. Great. Hello.'],
        ['solace', "Two nights. Every time I open my mouth, the city hears a hairdryer. Two nights of dead air."],
        ['solace', "(turning her glass round and round) Anybody could have called in those two nights. Anybody at all."],
        ['noor', "(spinning the laptop round; a map of Harbor Point with three red dots) Jammers. Three Halberd Porters with dishes. Parked, engines running, all night, every night."],
        ['noor', "Nobody idles for six hours in Harbor Point except cops and people in love. I checked the traffic cameras. They're not in love."],
        ['noor', "The boardwalk. The Starlite car park. Bayview Gardens. They've made a triangle. Inside it, 103.7 is a hairdryer. Outside it, Sable's playing records to the fish."],
        ['noor', "And there's a fourth signal. Moving. It isn't jamming, it's listening. Every night it gets a bit closer to wherever she's parked."],
        ['jay', 'Can you kill them from here?'],
        ['noor', "They're not on the grid. They're vans. I can turn every light in Harbor Point green for you, which is the most romantic thing I know how to do."],
        ['solace', "(lifting a canvas bag onto the table; bottles clink inside, each with a rag in its neck) My sister's rum. She makes it in a bathtub in Saltmarsh. Nobody has ever finished a glass."],
        ['solace', 'It burns like a grudge.'],
        ['jay', "You want me to set fire to Halberd's vans."],
        ['solace', "I want you to give them back to the night, baby. (beat) Yes. Set fire to them."],
        ['noor', "Can I ask you something? Personally? Not as a fan. I'm a little bit as a fan. Why “Solace”?"],
        ['solace', "It was the name of my old overnight show. Solace Hours. When they killed the station I kept the name. Nobody tells their secrets to a Lorna."],
        ['noor', '(quietly) I would tell a Lorna.'],
        ['solace', '(looking at her for the first time, and softening all at once) ...I know you would, baby. That\'s why you\'re here at one in the morning with a map.'],
      ] },
      { if: 'm21_two_ten', then: [
        { scene: { at: 'last_resort_bar', cast: ['solace'] }, say: [
          ['solace', '(as Jay stands to go, quietly) I read Augustine Vance\'s name on Tuesday. I didn\'t know what else to do with it.'],
          ['jay', '(beat) He\'d have hated Augustine.'],
          ['solace', 'Then next Tuesday I\'ll say Augie.'],
        ] },
      ] },
      { reward: { weapons: ['molotov'] } },
      dishVan('jam1', 'the_boardwalk'),
      dishVan('jam2', 'starlite_diner'),
      dishVan('jam3', 'bayview_gardens'),
      { spawn: [
        { id: 'jam1_guard', faction: 'halberd', at: 'jam1', count: 2, weapon: 'pistol', behavior: 'guard', group: 'jam1_crew' },
        { id: 'jam2_guard', faction: 'halberd', at: 'jam2', count: 2, weapon: 'pistol', behavior: 'guard', group: 'jam2_crew' },
        { id: 'jam3_guard', faction: 'halberd', at: 'jam3', count: 3, weapon: 'smg', behavior: 'guard', group: 'jam3_crew' },
      ] },
      { getIn: 'any', objective: 'Get a car. Three jammers, one bag of rum' },
      { music: 'tension' },
      { goto: 'the_boardwalk', vehicle: true, radius: 45, objective: 'First jammer: the boardwalk', say: [
        ['noor', "(in his ear) Every light on your route is green. All of them. You're welcome. You're driving through a city that loves you."],
        ['jay', "It doesn't."],
        ['noor', "For the next eight minutes it does. I made it."],
        ['noor', "(beat) Can I say something? She's exactly like she sounds. I was so scared she wouldn't be. Most things aren't."],
        ['jay', 'Most things are.'],
        ['noor', "You always say that. It's never true when you say it."],
      ] },
      { music: 'action' },
      { destroy: ['jam1'], checkpoint: true, objective: 'Torch the jammer on the boardwalk', say: [
        ['caption', "(A charcoal Porter at the boardwalk kerb, engine idling, a grey dish on its roof turning very slowly, like a head that doesn't want to be noticed.)"],
        ['halberd_guard', "(leaning on the bonnet with a vape) It's been a quiet one. They're always quiet ones. I love Signals."],
        ['noor', "(in his ear) That's him. That's the one. That's the hairdryer."],
      ] },
      { say: [
        ['caption', "(The rum goes up blue, then orange, then everything. The dish sags like a flower.)"],
        ['noor', "(in his ear) One down. 103.7 just went from hairdryer to... a smaller hairdryer. Progress!"],
      ] },
      { music: 'tension' },
      { goto: 'starlite_diner', vehicle: true, radius: 45, objective: 'Second jammer: the Starlite car park', say: [
        ['noor', "(in his ear) Second one's at the Starlite. In the car park. Do NOT set fire to the diner."],
        ['jay', "I'm not going to set fire to the diner."],
        ['noor', "I'm just saying it out loud so the universe hears me say it."],
      ] },
      { music: 'action' },
      { destroy: ['jam2'], objective: 'Torch the jammer in the Starlite car park. Not the diner', say: [
        ['dot', "(in the diner doorway, coffee pot in hand, watching the Porter, then Jay) If that thing goes up, you're paying for my window."],
        ['dot', '(beat) Do it anyway. They been parked there two nights and not one of them bought pie.'],
      ] },
      { say: [
        ['dot', "(as the Porter burns, raising the coffee pot an inch, like a toast) Pie's on the house, hon. Not tonight. Some night."],
        ['noor', "(in his ear) Two down! I can hear her! Very faint! She's saying something about... the weather? She's doing the WEATHER through a hairdryer. She's a professional."],
      ] },
      { music: 'tension' },
      { goto: 'bayview_gardens', vehicle: true, radius: 45, objective: 'Third jammer: Bayview Gardens', say: [
        ['noor', "(in his ear) Last one's under the Golden Years banner. Three guards. SMGs. They put the biggest guns on the pensioners. That tells you everything about everything."],
        ['jay', "Who's listening to her right now?"],
        ['noor', "Me. Probably Sable. A man in a truck on Cypress Parkway who just called the hairdryer to say he's still there. (beat) That's why she does it, isn't it."],
      ] },
      { if: ['foxes_done', '!m25_iron'], then: [
        { say: [['lefty', "(leaning off a second-floor balcony at Bayview in a dressing gown) Is that Jay? WALT! It's Frankie! (beat) Burn it, sweetheart. They repossessed Duke's recliner."]] },
      ] },
      { if: ['foxes_done', 'm25_iron'], then: [
        { say: [['lefty', "(on a second-floor balcony at Bayview in a dressing gown, alone) Burn it, sweetheart. Walt would've loved this. He'd have called you Frankie."]] },
      ] },
      { music: 'action' },
      { destroy: ['jam3'], objective: 'Torch the last jammer under the banner', say: [
        ['halberd_guard', "(spotting the car) Contact! Contact at the shuffleboard!"],
        ['noor', "(in his ear) They have SMGs and you have rum! This is not a fair fight and I don't know who it's unfair to!"],
      ] },
      { music: 'off' },
      { say: [
        ['caption', "(The third van burns under the banner. Somewhere above, the GOLDEN YEARS EQUITY sign catches at one corner, and nobody at Bayview Gardens gets out of bed to put it out.)"],
        ['caption', "(On every radio in Harbor Point, through the static, something like a chime. A semitone flat.)"],
        ['solace', "(on the radio, a little hoarse) ...is this— Vicehaven? Hi. Hi."],
        ['solace', '(on the radio) It\'s been two nights. I\'m sorry. I didn\'t go anywhere. I was just... very, very quiet against my will.'],
      ] },
      dishVan('jam4', 'bayview_gardens'),
      { music: 'action' },
      { chase: 'jam4', mode: 'wreck', route: ['meridian_boulevard', 'downtown', 'halberd_depot'], checkpoint: true, objective: 'The fourth van. The listener. It has her location. Wreck it before it reaches Saltmarsh', say: [
        ['noor', "(in his ear) Jay! The fourth one, the listener, it just came round the corner, saw the fire, and RAN. It's running for Saltmarsh."],
        ['noor', "If it gets to the depot, Halberd has six weeks of where she parks, her plate, her sister's bathtub. Everything."],
        ['solace', "(on the radio, recovering her lighthouse) In other news, Vicehaven, a charcoal van is heading south at speed. If you see it, wave. If you're behind it, I'm so sorry."],
        ['noor', "Greens all the way for you, reds all the way for him. Shit. Shit, a bus. Not my bus. Go round the bus."],
        ['solace', "(on the radio) ...he's going round the bus, Vicehaven. Beautifully. I don't even need to see it. I just know."],
      ] },
      { music: 'off' },
      { spawn: [{ char: 'garza', at: 'jam4', behavior: 'idle' }] },
      { if: 'm30_salt_and_iron', then: [
        { scene: { at: 'jam4', cast: ['garza'] }, say: GARZA_VAN.concat(GARZA_EMAIL_AFTER, GARZA_GO) },
      ], else: [
        { scene: { at: 'jam4', cast: ['garza'] }, say: GARZA_VAN.concat(GARZA_EMAIL_ROURKE, GARZA_GO) },
      ] },
      { phone: 'solace', say: [
        ['solace', "(off air, a little breathless) I narrated the explosions as fireworks for the Crown opening. Three people called in to complain about the noise. I've never been happier."],
        ['jay', "I've got their laptop. Six weeks of where you park."],
        ['solace', '(beat) Six weeks. (lighter, too light) Well. I was getting bored of the drydock.'],
        ['jay', "The man who had it says Halberd's done listening."],
        ['solace', "(a long breath) Then it's time to say something worth shutting up. Priya's list. Live. All of it. One big night, and a roof."],
        ['jay', 'He said one more thing. He liked your hour on loneliness.'],
        ['solace', "(very quiet, off air) ...The lighthouse keeper. That was a good hour. (beat) Go home, baby. You've got soot on your ten and two."],
      ] },
    ],
  });

  // =====================================================================
  // da4 — Signal Boost
  // =====================================================================
  chain.missions.push({
    id: 'da4_signal_boost',
    title: 'Signal Boost',
    giver: 'solace',
    start: 'lantern_alley',
    time: 0,
    estMinutes: 9,
    summary: 'One big night and a roof. Priya reads the whip list to the whole city, under her own name, while Halberd climbs the fire escapes.',
    reward: { money: 3000 },
    failIf: ['wrecked:solace_van'],
    steps: [
      { music: 'off' },
      dolly('lantern_alley'),
      { spawnCar: 'kings_ride', type: 'lowrider', at: 'anchor_rooftops', color: 0xb3202a, name: "the Kings' lowrider" },
      { scene: { at: 'lantern_alley', cast: ['solace', 'priya', 'wick'] }, say: [
        ['caption', "(Lantern Alley at midnight. The noodle cart is open, because the noodle cart is always open. Wick sits on a dumpster lid. Solace has a radio mast in pieces in a golf bag.)"],
        ['caption', '(And standing under the red lanterns, holding a cat carrier, in the same navy cardigan: Priya.)'],
        ['jay', 'Marrow Springs.'],
        ['priya', "One light. Always red. I sat at it for four days. Not in a car. On a bench. I just watched it be red."],
        ['priya', "My sister asked what I do. I said, “I write things other people say.” She said, “Oh. Like a ghost.” (beat) I didn't like that. I didn't like it at all."],
        ['priya', "So I came back. I'm going to read it. The list. Me. On the air. With my name."],
        ['solace', "(gently) You don't have to, baby. A council aide with a dog is a perfectly good source."],
        ['priya', "I know I don't have to. That's why. (beat) Also my grandmother listens. She'd know my voice. She'd know if I made you do it."],
        ['wick', "(hopping down) Teo says the roof's for the radio lady. He says you can come too. He said it like this. (a one-shouldered shrug that is so exactly Teo it hurts)"],
        ['solace', "(unzipping the golf bag) Dolly can't reach the whole city from a kerb. Tonight I want the whole city. Crestline to the cranes. Every kitchen radio, every cab."],
        ['solace', "So the mast goes up on the Anchor Street roofs. Forty feet of height, and the Kings' blessing, and a man with getaway hands sitting next to it."],
        ['solace', "Halberd's done listening, so they'll come and talk. Up the fire escapes, with rifles. They don't have a lot of conversation."],
        ['solace', "I need you on that roof. If they cut the mast, we're a hairdryer again. Give me the list and as long as the phones take after."],
        ['wick', 'Can I do the phones?'],
        ['solace', 'Can you be polite to strangers?'],
        ['wick', 'No.'],
        ['solace', "You're hired."],
        ['priya', '(to Jay, low, as the others load the van) Did you ever say your name out loud? Somewhere it counted?'],
        ['jay', '(after a while) Not yet.'],
      ] },
      { join: ['solace', 'priya'], weapon: 'fists' },
      { getIn: 'solace_van', objective: "Get in Dolly. Everybody's coming" },
      { music: 'tension' },
      { goto: 'kings_ride', vehicle: 'solace_van', radius: 12, objective: "Drive Dolly round to Anchor Street. Park her under the Kings' roofs, by the red lowrider", say: [
        ['jay', 'Seatbelt.'],
        ['priya', "We're going two hundred metres."],
        ['jay', 'Seatbelt.'],
        ['priya', "(clicking it, then, to herself, practising) My name is Priya Venkataraman. (beat) MY name is— no. My name is Priya. Venkataraman. (beat) I sound like a hostage."],
        ['solace', "Say it like you're ordering. Like you know exactly what you want and you're not paying extra for it."],
        ['priya', 'My name is Priya Venkataraman.'],
        ['solace', "(pleased) There she is. (to Jay) And you, baby. Don't go round the potholes tonight. Hit every one. Let them hear us coming."],
        ['jay', '(to the van, softly) Sorry, Dolly.'],
      ] },
      { leave: ['solace', 'priya'] },
      { music: 'off' },
      { goto: 'anchor_rooftops', vehicle: false, objective: "Up the Kings' stairs to the roof. Get the mast up" },
      { say: [
        ['caption', "(Flat tar roofs, a water tank with a gold crown painted on it, pigeons muttering in a coop. Jay bolts the mast to a vent stack. The city lies all round him, lit.)"],
        ['solace', "(through the Kings' handheld radio, clipped to his jacket) Mast?"],
        ['jay', 'Up.'],
        ['solace', 'Then we\'re live in three. Two.'],
        ['caption', '(Out of a hundred open windows on Anchor Street at once: a chime, like an ice-cream van, a semitone flat.)'],
        ['solace', "(on the radio) Good morning, Vicehaven. This is Solace. Tonight this frequency isn't stolen. Tonight it's borrowed, from all of you, and I'm giving it back with interest."],
        ['solace', '(on the radio) Somebody is going to read you something. I\'m not going to say much. For once in my life. Go on, baby.'],
        ['priya', '(on the radio, too fast) My name is Priya Venkataraman.'],
        ['priya', "(on the radio, slower) My name is Priya Venkataraman. I'm an aide to Councilman Delmar Pruitt. I have a cat. His name is Quorum. I'd like to read you something."],
      ] },
      halberdSuv('roof_suv_a', 'anchor_rooftops'),
      halberdSuv('roof_suv_b', 'anchor_rooftops'),
      halberdSuv('roof_suv_c', 'anchor_rooftops'),
      { spawn: [{ id: 'roof_a', faction: 'halberd', at: 'roof_suv_a', count: 3, weapon: 'rifle', behavior: 'attack', group: 'roof_a' }] },
      { music: 'action' },
      { if: 'm17_canary', then: [
        { say: [['jay', "(settling Bram's rifle on the parapet, very quiet) Sit still, Bram. Long song."]] },
      ], else: [
        { say: [['jay', '(crouching behind the parapet as the first charcoal Ironclad slews to a stop below) Here we go.']] },
      ] },
      { survive: 30, checkpoint: true, objective: 'Hold the roof. Keep the mast standing', say: [
        ['priya', '(on the radio) The Phase Two whip count. Thirteen seats on the council. Seven to win. This says nine were bought. Next to each name is what it cost.'],
        ['priya', '(on the radio) Seat one. Councilman Delmar Pruitt. My boss. Forty thousand in March, “for the zoning”, and a fountain. For the statue of his dog.'],
        ['halberd_guard', '(from the street, through a loudhailer) Fire escape, east side! Cut the mast! Cut the cable!'],
        ['priya', '(on the radio, her voice shaking and not stopping) Seat four. Councilwoman Ada Fenn. A berth at the new marina, and her husband\'s name on a bridge.'],
      ] },
      { spawn: [{ id: 'roof_b', faction: 'halberd', at: 'roof_suv_b', count: 3, weapon: 'rifle', behavior: 'attack', group: 'roof_b' }] },
      { survive: 30, objective: 'More of them. Hold the roof', say: [
        ['priya', "(on the radio) Seat six. Councilman R. Achterberg. The marina again, plus sponsorship for his niece's racing. (beat) I don't know why the niece makes me angriest. It just does."],
        ['priya', '(on the radio) Seat nine. Councilman Bartholomew Oakes. His parking tickets. Four hundred and twelve of them. He sold the harbour for his parking tickets.'],
        ['wick', "(on the radio, somewhere in the van) Solace, line two wants to know if you're single."],
        ['solace', '(on the radio) Tell line two I\'m married to the night, baby. Tell line three to hold.'],
        ['priya', "(on the radio) And at the bottom, in the chief of staff's own hand: “P. wobbling since the valet thing. Monitor.”"],
        ['priya', '(on the radio, off script) That\'s you. That\'s the roof. He\'s the valet thing.'],
        ['jay', '(into the handheld, reloading) Little busy.'],
      ] },
      { spawn: [{ id: 'roof_c', faction: 'halberd', at: 'roof_suv_c', count: 4, weapon: 'rifle', behavior: 'attack', group: 'roof_c' }] },
      { survive: 30, objective: "Last push. They're going for the cable", say: [
        ['solace', '(on the radio) To the gentlemen on the fire escapes: this next ninety seconds is a song just for you. It\'s called “Go Home”. It\'s mostly bass.'],
        ['priya', "(on the radio) That's nine. Nine votes. And the speech that goes with them, I wrote. “Renewal is a promise we make to our grandchildren.”"],
        ['priya', "(on the radio) Paati, if you're listening: I'm sorry about the line. You were right to circle it."],
        ['halberd_guard', "(into his radio, below) He's dug in up there! We can't get onto the roof! Somebody find the stairs!"],
        ['wick', "(on the radio, faint) The stairs are behind the noodle cart, man. Everybody knows that. (beat) Oh. I shouldn't have said that on the radio."],
      ] },
      { kill: ['roof_a', 'roof_b', 'roof_c'], objective: 'Clear the last of them off Anchor Street. The phones are lighting up', say: [
        ['solace', "(on the radio) The list is read, Vicehaven. It's yours now. Do what you like with it. (beat) Lines are open. Wick?"],
      ] },
      { music: 'hope' },
      { say: [
        ['caption', '(Quiet on Anchor Street. Smoke, sirens far off and going elsewhere. Jay sits down with his back against the water tank, the handheld radio in his lap, and listens.)'],
        ['wick', '(on the radio) Line one, you\'re on Radio Free... (off mic) what is it? (on mic) Radio Free Vicehaven. Go.'],
        ['hollis', "(on the radio) This is Hollis. From the stand. I'd like to report that a red vest was never returned."],
        ['solace', '(on the radio) Noted, Hollis.'],
        ['hollis', "(on the radio) And that Mrs. Whitcombe still asks after him. On Bijou's behalf. (beat) And that I was right. Getaway hands. Nineteen years. Goodnight."],
        ['wick', '(on the radio) Line two. You\'re on.'],
        ['pruitt', "(on the radio, muffled, as if through a bath towel) Hello. I'm a listener. From... the hills. I'd like to request a song. For my dog."],
        ['priya', '(on the radio, off mic, horrified) That\'s my boss.'],
        ['pruitt', "(on the radio) He's a statue. I know. I still like to ask. (beat) Somebody once wrote me a very good line about loyalty. I'd like to... deserve it. One day. Goodnight."],
        ['wick', "(on the radio) Line three is my nan. Sorry. Nan, you can't— okay. She says hello Vicehaven. She says Teo's nan's curry is not better. She says it's not even close."],
        ['wick', '(on the radio) Line four. Ma\'am? You\'re on.'],
        ['marguerite', '(on the radio, an older woman, careful, as if the phone might break) Is this Solace? The real one? From the Paloma?'],
        ['solace', '(on the radio, after a beat) It\'s me.'],
        ['marguerite', "(on the radio) It's Marguerite. From Tannery Row. (beat) You got cut off. Two years ago. I was talking about my son."],
        ['caption', "(Nothing. Four seconds of nothing. On the roof, Jay looks down at the radio in his lap as if it has broken. It hasn't.)"],
        ['solace', "(on the radio, very quietly) I'm here, Marguerite."],
        ['marguerite', '(on the radio) I wanted to tell you where he went. My Daniel. That night he went to his cousin\'s in Saltmarsh. Then he got work on the cranes.'],
        ['marguerite', "(on the radio) He's a foreman now. He has a girl. He calls me Sundays. He's fine. (beat) That's all. I just thought you'd want the end of the sentence."],
        ['solace', '(on the radio) Thank you, Marguerite. (beat) Sorry, Vicehaven. That was dead air.'],
        ['solace', '(on the radio) First one I ever chose.'],
        ['solace', "(in his ear, off air, her voice wet and trying not to be) Driver. There's a red button on the side of the mast. It's a talkback. The city's still listening. If you want."],
      ] },
      { choice: {
        prompt: 'A red button on the side of the mast. The whole city on the other end.',
        options: [
          {
            label: '(Press the button.)',
            flag: 'da_spoke',
            then: [
              { say: [
                ['jay', '(on the radio, after a long time) This is for Lucinda Mercer.'],
                ['jay', '(on the radio) She drove the school bus on the Palm Crescent run for thirty-one years. Never once ran a red.'],
                ['jay', "(on the radio, beat) I've run all of them. Sorry, Nana."],
              ] },
              { if: 'm21_two_ten', then: [
                { say: [
                  ['jay', "(on the radio) And Augie Vance. It's Tuesday somewhere. Del knows the song."],
                  ['solace', "(on the radio, softly) I'll ring Del."],
                ] },
              ] },
              { say: [
                ['solace', '(on the radio) That was the getaway driver, Vicehaven. He doesn\'t do regular. Ten and two, baby.'],
              ] },
            ],
          },
          {
            label: '(Leave it.)',
            flag: 'da_silent',
            then: [
              { say: [
                ['caption', '(Jay looks at the button for a long time. Then he takes his hand away, and shakes his head at nobody, at the whole lit city.)'],
                ['solace', "(on the radio) The getaway driver declines to comment, Vicehaven. I can't see him. I can hear him shaking his head. It's a good head."],
                ['solace', "(on the radio) That's alright, baby. Some people talk with their hands. (beat) Ten and two."],
              ] },
            ],
          },
        ],
      } },
      { fade: 'out' },
      { spawn: [{ char: 'dj_sable', at: 'solace_van', offset: [2, 2], behavior: 'idle' }] },
      { teleport: 'dj_sable' },
      { fade: 'in' },
      { scene: { at: 'solace_van', cast: ['solace', 'priya', 'wick', 'dj_sable'] }, say: [
        ['caption', "(Down on Anchor Street, the ON AIR bulb in Dolly's back window goes dark. A tall man in black is standing by the van holding two paper cups, like he's been there a while.)"],
        ['dj_sable', "(to Solace, deadpan) You're on my frequency."],
        ['solace', 'You left the door open.'],
        ['dj_sable', "I'm furious about it. (He holds out a cup.) Two sugars."],
        ['solace', "(taking it, not looking at him) It's not four."],
        ['dj_sable', 'I was in the area.'],
        ['solace', '(beat) Marcus.'],
        ['dj_sable', 'Lorna.'],
        ['caption', '(That is all either of them says. It seems to be a great deal.)'],
        ['dj_sable', "(to Priya) Good reading. You said “Venkataraman” like you'd paid for every letter."],
        ['priya', '(hollow, giddy) I did. I think I just paid for all of them. (to Jay) What happens to me now?'],
        ['solace', "Now you're a name, baby. Names are harder to disappear than voices. Everybody heard you. Halberd can't un-hear a whole city."],
        ['jay', 'Get a good lock. Feed the cat.'],
        ['caption', '(Sable walks Priya and Wick up the street toward the noodle cart, still holding his coffee, still furious. Solace and Jay are left by the van.)'],
        ['solace', "(looking up at the mast on the roof, its little red light blinking) Every city has a voice. Ours just needed a getaway driver."],
        ['jay', "Your voice needed a van with a flat chime."],
        ['solace', "(laughing, finally, properly) My father would have liked you. He liked anybody who'd tell him the chime was flat. Nobody ever did."],
        ['solace', "(quieter) If you ever have something this city needs to hear, baby... you know where the door is."],
        ['jay', 'Sable leaves it open.'],
        ['dj_sable', "(from up the street, without turning round) I'm furious about it."],
        ['solace', '(beat; then, off air, plainly, for the only time) Thank you, Jay.'],
        ['caption', '(He looks at her. She shrugs.)'],
        ['solace', "Off air. Doesn't count. (She opens Dolly's back door.) Go home, baby. Drive slow. Hit the potholes."],
      ] },
      { setFlag: 'solace_done' },
    ],
  });
})();
