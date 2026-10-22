/*
 * data/story-act3m21.js — m21 TWO-TEN, Act 3 of "Ten and Two".
 *
 * The Tally exchange at the Pier 9 transfer yard, 02:10 on the thirtieth,
 * three years to the minute. Horne and Rourke come instead of Voss. Horne
 * taps his watch at 02:11:04, the second Tommy died, and a Halberd rifle on
 * Stavros's orange crane puts Augie down in bay 14. At 02:11:20, the second
 * he put it in gear three years ago, Jay opens the car door instead and goes
 * back across the lot. Augie dies in the back of Nana Lu's car in the
 * ambulance bay at Mercy General with Mae's hands on his chest. Rourke takes
 * the Tally.
 *
 * Flags set: augie_dead. Flags read: saved_teo / chased_rourke,
 * trusted_calder / refused_calder, mae_stay / mae_space, kept_cut / gave_cut,
 * nightshift_done.
 *
 * Continuity: Dex gave Horne the time, the bay, the car and Rhea's rifle
 * positions (m22), then sat in the second car at the garage with the engine
 * running until four. It is a Sunday morning, so Del won't play "Porchlight"
 * (that's Tuesdays: m22's coda). Jay has read up to letter eight. With
 * chased_rourke, Teo's eyebrow from the Crown came open again and he was in
 * Wick's nan's kitchen having it glued when Jay rang (m23 says so).
 *
 * Invented here that later acts may lean on: Augie's watch is Celia's, a
 * steel thing on a cracked strap that has never lost a second; three turns
 * every morning, "not four, it sulks at four" (with saved_teo he puts it in
 * Teo's hand in the back of Lulu and Teo winds it there, which m24 leans on;
 * with chased_rourke he gives it to Jay to pass on); Birdie's crayon horse,
 * MR AUGIE AT WORK, was in his shirt pocket; Horne's cruiser 1-ADAM-9 was
 * parked in bay 13; Kostya was found zip-tied in the orange crane's cab,
 * alive and furious; Voss's card read "OLD MARKET STANDS. YOU HAVE MY WORD.
 * H.V."; Augie knew Voss's father, Big Harlan (diesel and oranges), and
 * little Harlan used to steal his bike; letter thirty-seven is "the good
 * one", to be read last; Augie names his jobs only afterwards ("You name a
 * job before, it hears you"), so this one never had a name (m24: Jay names
 * the new one Tidewater). Jay rang Gus on the Thursday before to ask how long
 * Medic 12 takes from Harbor Road to Pier 9, so Mae was parked on Harbor Road
 * (his first plan, and it was for the after). Rhea sent two navy vests;
 * Augie buckled Jay into one, patted it twice, and gave his own back ("It
 * doesn't go with the shoes"): Mae's pat on the vest in m30 calls back here.
 * With nightshift_done, Gus's MEDIC 12 patch is taped to Lulu's dash (m31).
 *
 * Engine notes: the crew are pre-spawned at the bar so a checkpoint retry
 * rebuilds them far from the docks. The wounded Augie in bay 14 replaces the
 * standing one under a blackout, and is hidden by moving Jay well away under
 * another: the cut lands him up Pelican Avenue past Southshore, out of range
 * of whatever is still shooting in the yard, so nothing can hit a frozen
 * Jay during the blackout. On the drive Augie rides as dialogue, not as an
 * actor, so nobody climbs out of the back seat at the hospital. The drive
 * carries the seatbelt and the ten-and-two; the last words come in the
 * ambulance bay, on black, where nobody is dodging a roadblock to read them.
 * A short `say` step comes before every scene or blackout that follows car
 * banter, so no line is cut. Plain (unbracketed) captions are used outside
 * blackouts because the line timer only counts spoken text: a bracketed
 * caption would flash past in 1.7 seconds. The clock runs a game minute a
 * second, so setTime pulls it back to night after every long stretch of
 * talk (and is placed on a cut). Rourke's car and Horne's cruiser are
 * locked, so "get a car" in the yard can only mean Lulu.
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const CALDER_GREEN = 0x2f4a3a;

  const lulu = (at) => ({ spawnCar: 'lulu', type: 'lowrider', at, color: LULU_TEAL });

  // Fixed spots round the Pier 9 yard (outskirts.js: the yard runs z 486-566
  // with the numbered bays along x 325; bay 14 is at z 551; Harbor Road is
  // z 470; Pelican Avenue runs north out of the docks at x 288, crossing
  // Southshore at z 384).
  const GATE_KERB = { x: 344, z: 467, yaw: -Math.PI / 2 }; // Harbor Road, outside the Pier 9 gate
  const UP_PELICAN = { x: 291.5, z: 352, yaw: Math.PI };   // Pelican Avenue, northbound, just past Southshore
  const MEDIC_BEHIND = { x: 291.5, z: 374 };               // behind him on Pelican
  const CALDER_START = { x: 250, z: 384 };                 // Southshore, where Horne's roadblock was

  // ------------------------------------------------ bay 14, on the paint
  // The minute on the ground with him while Rhea's people take the orange
  // crane back. The timer is the minute. It is also his.
  const BESIDE_HIM_WAVES = [
    { at: { x: 372, z: 560 }, count: 3, weapon: 'rifle', faction: 'halberd', delay: 2 },
    { at: 'pier9_gate', count: 2, weapon: 'pistol', faction: 'vpd', delay: 12 },
    { at: 'the_quay', count: 3, weapon: 'smg', faction: 'halberd', delay: 24 },
    { at: { x: 380, z: 500 }, count: 2, weapon: 'rifle', faction: 'halberd', delay: 38 },
    { at: 'pier9_gate', count: 3, weapon: 'smg', faction: 'vpd', delay: 48 },
  ];
  const besideHim = (cutLine) => ({
    survive: 60, objective: "Stay with him. Keep them off him. Rhea's people are taking the orange crane back.", waves: BESIDE_HIM_WAVES,
    say: [
      ['caption', 'Augie on his back on the new yellow paint, one hand pressed to his side. The other is still holding the cream card.'],
      ['augie', '(looking up past him at the floodlights) I said drive.'],
      ['jay', "(down on one knee over him, pistol up, his free hand flat on Augie's chest) I heard you."],
      ['augie', '(a breath with a whistle in it) ...You got out of the car.'],
      ['augie', "(his cheek on the concrete) This is the spot. Newer paint. You can feel it. It's smoother."],
      ['augie', "Kid. Lourdes's million. Her knee. That was Tommy's idea, not mine. I'm only finishing his job."],
      cutLine,
      ['jay', 'Stop talking. Save it.'],
      ['augie', "Save it for what? Celia always said I talked too much at funerals. Don't let me talk at mine."],
      ['noor', "(on the radio) Mae's on Harbor Road. Medic 12. She was already there, Jay, she was already parked there. She says keep pressure. She says two minutes."],
      ['augie', "(his hand finding Jay's wrist and holding on, hard, the way you hold a railing) You're shaking."],
      ['jay', "I'm not shaking."],
      ['augie', "(eyes closing, opening) No. Steady hands. You always had steady hands. (beat) It's me. It's the concrete. It's cold."],
      ['rhea', "(on the radio, then one flat shot from high up) ...Orange crane is mine. Kostya's in the cab, tied to the seat. He's alive. He bit one of them."],
    ],
  });
  const BESIDE_HIM_GAVE = ['augie', "You already gave her forty. In a rag from Dexter's garage. Lourdes told me. (something like a laugh, with blood in it) Best job you ever pulled."];
  const BESIDE_HIM_KEPT = ['augie', "And you keep that house. You hear me? Somebody's going to tell you it was bought with the wrong money. Keep the swing anyway. Somebody should sit on it."];

  // ------------------------------------------- getting him into the car
  const intoTheCar = (teoLines) => ({ blackout: [
    ['caption', "(He gets his arms under Augie's arms and pulls, and Augie is so heavy. Then Ansel is there, the way Ansel is always there, and Augie weighs nothing at all.)"],
    ['ansel', '(lifting him into the back seat as if he is putting a sleeping child to bed) I have you. I have you, Augustine. Mind your head.'],
    ...teoLines,
    ['ansel', "(his hand flat on Lulu's roof) Go. I'll get Noor down. Go."],
    ['caption', '(Out through the gate in reverse. On Harbor Road, Medic 12 slewed across both lanes, and Mae already running. She climbs into the back of Lulu and puts her hands on him.)'],
    ['caption', '(Then Pelican Avenue, north, past Southshore. Behind them, Medic 12 with every light it has.)'],
  ] });
  const INTO_THE_CAR_TEO = [
    ['teo', "(scrambling in after his father, tearing off the red bomber and pressing it into his side) Pop. Pop, I'm here. I'm holding the door. I'm holding it."],
  ];

  // ------------------------------------------------------ the last drive
  // Up Pelican (Horne's roadblock is on Southshore, behind him), across
  // Magnolia past the motel car park where Nana Lu taught him, down to Mercy
  // General. Sized to the drive: the last words wait for the ambulance bay.
  const UP_PELICAN_OPEN = [
    ['caption', 'The back seat. Augie across it, and Mae in the footwell with her bag open and her shears already through his good linen shirt.'],
    ['mae', '(out of the window, to the ambulance) Lights on and stay on us! We are not moving him twice! (to Jay) You\'re faster. Drive.'],
    ['mae', '(both hands on his side, her whole weight in them) Augie. It\'s Mae. Look at me. There you are. Stay there.'],
    ['augie', '(surprised, pleased) Mae Reyes. ...You came out.'],
    ['mae', "I'm on nights. You're on my route."],
    ['caption', 'In the pocket she has cut through: a crayon horse, folded in four, and a cream card. She puts them on the seat without looking. Later, she will.'],
    ['augie', "(his eyes on the back of Jay's head) You didn't say it."],
    ['jay', 'Say what?'],
    ['augie', '...Seatbelt.'],
    ['jay', '(and his voice goes somewhere, and comes back) Seatbelt, Augie.'],
    ['augie', "(fading, smiling) Seatbelt... I know. I know. Don't be a pain in the ass."],
    ['jay', '(and it very nearly comes out as a laugh) That\'s two.'],
    ['augie', '(his eyes closed, the smile still there) Special occasion.'],
    ['mae', "(close to his face, fierce) Hey. Eyes open. Tell me your son's name."],
  ];
  const UP_PELICAN_SAVED = [
    ['augie', "Teo. (His hand finds Teo's on the seat.) He's here. He thinks I don't know he's holding my hand."],
    ['teo', "(holding it in both of his) You know. You always know. Shut up, Pop. Let her work."],
    ['augie', '(to Mae, confidentially) He gets the bossiness from his mother.'],
  ];
  const UP_PELICAN_CHASED = [
    ['augie', "Teo. (a breath) He's not here. That's all right. He's angry with me. He's allowed."],
    ['augie', "(beat) It's the one thing I taught him properly."],
  ];
  const TO_MERCY_OPEN = [
    ['caption', 'Magnolia Street. Every light ahead goes green at once: Noor. The Magnolia Motor Lodge goes by on the right. VACAN.'],
    ['augie', "(listening to the engine with his eyes half shut, the way he's listened to engines all his life) You're braking early again."],
    ['jay', "(through a red light, and the next one, and the next) I'm not braking."],
    ['augie', "(a long breath) No. ...You're not. (nearly a laugh) That's my wheelman."],
  ];
  const TO_MERCY_PATCH = [
    ['caption', "On the dash, under its strip of electrical tape, Gus's MEDIC 12 patch. Get them there. Everything else is paperwork."],
  ];
  const TO_MERCY_CLOSE = [
    ['augie', '(barely) Kid. Hands.'],
    ['jay', 'Ten and two.'],
    ['augie', "Heart at twelve. Your grandmother told me. Every first Sunday, with the plum cake. (a breath) What's at twelve, kid?"],
    ['jay', '(the road, the lights, the hospital somewhere past them) ...Wherever I\'m going.'],
    ['augie', "Then go there. Don't look in the mirror. I'm fine back here. Look at twelve."],
    ['caption', 'He looks in the mirror.'],
  ];
  const lastDrive = (upLines, patch) => [
    { timer: 60 },
    { goto: 'magnolia_motel', vehicle: true, radius: 26, stop: false, objective: "Mercy General. Up Pelican, across Magnolia. Don't stop for anything.", say: [...UP_PELICAN_OPEN, ...upLines] },
    { music: 'off' },
    { timer: 45 },
    { goto: 'mercy_general', vehicle: true, radius: 9, objective: 'The ambulance bay at Mercy General. Mae is counting.', say: [...TO_MERCY_OPEN, ...patch, ...TO_MERCY_CLOSE] },
  ];

  // ------------------------------------------- the ambulance bay, on black
  const BAY_OPEN = [
    ['caption', '(The ambulance bay. The engine ticking. For a second, before the doors, nobody in the car moves.)'],
    ['augie', "(barely, to the roof of the car) The letters. Don't skip the chilli one. I'm funny in the chilli one."],
    ['augie', "Read thirty-seven last. (beat) It's the good one."],
  ];
  const BAY_SAVED = [
    ['augie', "(working the steel watch off his wrist and closing Teo's fingers round it) Your mother's. Wind it every morning. Three turns. Not four. It sulks at four."],
    ['teo', '(doing it, because his hands need something to do) One. Two. Three.'],
    ['augie', "There. Only thing in this family that never lost a second. (beat) Don't let it start now."],
    ['augie', '(looking up at his son, and for a moment the whole of him is in his face) Teo. ...I was a bad father.'],
    ['teo', "(his forehead nearly on his father's, steady) You were fine, Pop. You were fine."],
    ['caption', "(Augie looks at his son as if he has been handed something he ordered a long time ago and stopped expecting. He doesn't say anything else.)"],
  ];
  const BAY_CHASED = [
    ['augie', "(holding the steel watch up over the seat in a hand that won't keep still) Celia's. Give him this. Three turns every morning. Not four."],
    ['jay', '(taking it without looking, pressing it to the wheel under his thumb) Give it to him yourself.'],
    ['augie', 'Tell Teo I kept every one of his drawings. On my parking tickets. In the bridges book from the prison library. I never gave it back. (beat) Tell him I kept them.'],
    ['caption', "(Jay waits for the next thing. There isn't one.)"],
  ];
  const BAY_CLOSE = [
    ['caption', "(Mae's fingers on his neck. Then her hands, locked, on his chest, and her whole weight going down into them. Thirty. Two breaths. Thirty more.)"],
    ['caption', "(Doors banging open. Somebody shouting for a board. Strip light pouring into the back of Nana Lu's car. A doctor in a paper gown says Mae's name. Then says it again.)"],
    ['mae', '(flat and fast) ...twenty-eight, twenty-nine, thirty.'],
    ['caption', '(She stops. She looks at her watch, the one with the second hand, and says the time out loud to nobody, because somebody has to.)'],
    ['mae', 'Two thirty-one.'],
    ['caption', "(Only then does she look up, at the back of Jay's head, at his hands on the wheel.)"],
    ['mae', "Jay. ...He's gone."],
    ['caption', '(His hands stay where they are. Ten and two.)'],
  ];

  // ------------------------------------------------------ the kerb, after
  const KERB_OPEN = [
    ['caption', "The ambulance bay. The smokers' bench. The vending machine that eats coins, humming. Lulu with every door open and the strip light on her back seat."],
    ['caption', "Jay on the kerb by her back wheel, a blanket round his shoulders he hasn't noticed. Mae comes out with her sleeves dark to the elbow and sits down beside him."],
  ];
  const KERB_TEO = ['caption', "Teo stands at Lulu's open back door with one hand on the roof, where he can see his father. Nobody has asked him to move. Nobody is going to."];
  const KERB_MID = [
    ['jay', '(eventually, to the road) I went back.'],
    ['mae', 'I know. Noor was screaming it down the radio all the way up Pelican. “He went back. He went back.” Like it was the score of a game.'],
    ['jay', "(beat) It wasn't enough."],
    ['caption', "She doesn't tell him that it was. She isn't a liar. She's a paramedic."],
    ['mae', 'No.'],
    ['mae', '(after a while) Gus said you rang him. Thursday. How long from Harbor Road to Pier 9 with the lights on.'],
    ['mae', "So I parked on Harbor Road. Two minutes. (looking at him) That was your plan? That was the whole plan?"],
    ['jay', '(beat) It was for after.'],
    ['mae', '(looking at her hands, turning them over) He made a joke in the car. About your seatbelt. With a hole in him the size of my fist. Who does that.'],
    ['jay', 'He does.'],
    ['mae', '(very quietly) He did.'],
  ];

  S.missions.push({
    id: 'm21_two_ten',
    act: 3,
    title: 'Two-Ten',
    giver: 'augie',
    start: 'last_resort_bar',
    time: 1,
    estMinutes: 13,
    summary: "Three years to the minute. This time Jay goes back. It isn't enough.",
    failIf: ['wrecked:lulu'],
    steps: [
      lulu('last_resort_bar'),
      // Everyone is already at the bar. (Spawned here rather than by the
      // scene, so a retry rebuilds them at the bar, nowhere near the docks.)
      { spawn: [
        { char: 'augie', at: 'last_resort_bar', behavior: 'idle' },
        { char: 'ansel', at: 'last_resort_bar', offset: [1.8, 1.2], behavior: 'idle' },
        { char: 'noor', at: 'last_resort_bar', offset: [-1.6, 1.4], behavior: 'idle' },
        { char: 'dex', at: 'last_resort_bar', offset: [0.4, 2.6], behavior: 'idle' },
      ] },
      { music: 'off' },
      { scene: { at: 'last_resort_bar', cast: ['augie', 'noor', 'ansel', 'dex'] }, say: [
        ['caption', 'The Last Resort. 30 September. 01:00.'],
        ['caption', "Chairs up on every table but one. Noor has her laptop, Ansel soup nobody asked for. Dex is standing, because Dex can't sit. Augie is in his good shoes."],
        ['noor', "(turning the laptop round) My model. Eighty-four per cent chance nobody gets hurt tonight."],
        ['jay', 'Up from seventy-one.'],
        ['ansel', '(unscrewing the thermos) What is the other sixteen?'],
        ['noor', "Mostly you tripping on a mooring line in the dark. You trip, Ansel. I've watched you come down the bar steps."],
        ['ansel', "I don't trip. I descend."],
        ['augie', 'Dexter.'],
        ['dex', "(too fast, sweating) Garage. Second car. The tow, engine running, all night. You call, I come. Twelve minutes to Pier 9. Eight if I ignore the lights, which I will."],
        ['augie', "(warmly) That's a crew."],
        ['augie', "(to the table) The plan. Jay and I walk into bay fourteen, because they asked for him. I give Rourke a green book. He gives me five million and a piece of paper. We walk out."],
        ['augie', "That's it. The best plans are short. Celia's wedding vows were nine words: “If you're arrested, don't call me. Call my mother.”"],
        ['augie', "The money. A million for Lourdes. One for Teo's kids, because he'll have kids, because he's handsome and he gets it from me. One for Sami Haddad's pharmacy—"],
        ['caption', 'Noor becomes extremely busy with her laptop.'],
        ['augie', "—one for Ansel's flowers. And one for after. For whoever needs it. There's always an after. Nobody ever plans for the after."],
        ['ansel', '(quietly, turning a seed packet over in his fingers) You have planned the after.'],
        ['augie', '(raising one finger: the rule) And if this goes sideways, you drive. That\'s the job. You get in the car, you put it in gear, you drive.'],
        ['jay', 'Not this time.'],
        ['augie', "(gently) Kid. That's the job."],
        ['jay', '(not looking away) Not this time.'],
        ['augie', "(letting it go, the way you let go of a rope when the other man won't) He reads eight letters and suddenly he's got opinions."],
        ['augie', "(checking his watch, an old steel thing on a cracked strap) One-fourteen. Celia's. Thirty-one years, never lost a second. Only thing in the family that never did."],
        ['dex', '(abruptly, pulling a folded paper out of his coveralls) Birdie made you this. For luck. I forgot. Here.'],
        ['caption', 'A crayon drawing. A long brown horse with grey hair beside a teal car. Underneath, in careful capitals: MR AUGIE AT WORK.'],
        ['augie', "(looking at it for a long time) It's a horse."],
        ['dex', "She says you've got a long face and you always look tired. I don't know where she gets it."],
        ['augie', "(folding it along its creases into his shirt pocket, over his heart) Tell her it's the best one yet. Tell her the car is very accurate."],
        ['caption', 'Dex nods. Keeps nodding. Then he hugs Augie, hard and too long, with his face turned away.'],
        ['augie', "(muffled, patting his back) Dexter. You're squeezing the plan out of me."],
        ['dex', '(letting go; looking at nobody, then only at Jay) Bring him back. Okay? You bring him back.'],
        ['jay', "(beat) I'll bring him back."],
      ] },
      { if: 'saved_teo', then: [
        { scene: { at: 'last_resort_bar', cast: ['teo', 'augie'] }, say: [
          ['caption', 'Teo comes up the patio steps two at a time, the split lip from the Crown gone yellow at the edges.'],
          ['teo', "You said one. It's one-sixteen."],
          ['augie', 'Your watch is fast.'],
          ['teo', "I don't have a watch."],
          ['augie', "(touching his own wrist, the cracked strap, without seeming to notice) No. You don't."],
          ['teo', "I'm not here to help. You texted me “come and watch your father do something right for once.” I want to see what that looks like."],
          ['augie', '(delighted, and hiding it very badly) It looks like a man in good shoes handing over a book. You can stand at the gate with Ansel and hold the door.'],
          ['teo', "That's the least important job there is."],
          ['augie', "I held doors for six years before anybody let me near a plan. It's the most important job there is."],
          ['teo', "(looking at him a moment too long) Don't make it weird."],
        ] },
      ], else: [
        { say: [
          ['caption', 'Augie checks his phone under the table. Sent at midnight, to TEO: “Tonight. The old lot. Come and watch your father do something right for once.” Delivered. Nothing back.'],
          ['augie', "(putting it away) He'll come or he won't. He's twenty-four. He's allowed."],
          ['ansel', '(quietly) How are the ribs?'],
          ['augie', "They've withdrawn the complaint. Pending review. (standing, carefully, on the left side) Come on. Let's be early for once."],
        ] },
      ] },
      { leave: ['dex', 'noor'] },
      { say: [
        ['noor', "(going down the steps to Rhea's rust-orange pickup, hugging the laptop) Your collar's up, Augie. You look like a getaway driver."],
        ['dex', '(already at the tow truck, not turning round, one hand raised) Twelve minutes. Eight with the lights.'],
      ] },
      { join: ['augie', 'ansel'], weapon: 'fists' },
      { if: 'saved_teo', then: [{ join: ['teo'], weapon: 'pistol' }] },
      { getIn: 'lulu', objective: 'Get in Lulu. Augie wants to go the long way, past the mural.', say: [
        ['jay', 'Seatbelts.'],
        ['augie', "(the click, already) Done before you asked. I'm a sponge."],
        ['ansel', '(folding himself into the back; the click) Done.'],
      ] },
      { if: 'saved_teo', then: [
        { say: [
          ['teo', '(in the back, staring at the belt) Are we really doing this every time?'],
          ['augie', 'Every time.'],
          ['teo', "(clicking it, to the window) I know. It's how he says the other thing."],
        ] },
      ] },
      { if: 'mae_stay', then: [
        { text: 'mae', message: "Gus says you rang him to ask how long Medic 12 takes to get to Pier 9. You're terrible at subtle. I'm on nights. Whatever it is, come back and ask me." },
      ], else: [
        { text: 'mae', message: "Gus says you rang him about Pier 9. I'm not asking. You're giving me space, I noticed. I'm on nights till six. If you need me you won't call, so I'm just saying it." },
      ] },
      { music: 'hope' },
      { goto: 'casa_palma', vehicle: 'lulu', radius: 30, stop: false, objective: 'The long way. Past Casa Palma and the mural.', say: [
        ['augie', '(reaching for the radio) Eighty-eight point one.'],
        ['caption', 'VHR 88.1. Del Starr, playing something with a saxophone that sounds like a man apologising in a car park.'],
        ['augie', "(sighing) It's Sunday. She won't play it on a Sunday. Tuesdays only. She's very strict. It's what I love about her."],
        ['caption', 'He hums it anyway. “Porchlight.” Flat, the way Celia sang it at the sink. At the second line a low, warm, perfectly in-tune bass joins in from the back seat.'],
        ['augie', '(stopping, outraged) Ansel.'],
        ['ansel', '(stopping) What?'],
        ['augie', "You're in tune. Stop being in tune. It's Celia's song. It goes flat. If you sing it right it's somebody else's song."],
        ['ansel', '(after a moment, very solemnly, a quarter-tone under) ♪ Leave it burning, leave it on ♪'],
        ['augie', '(closing his eyes, satisfied) Better. Much better. You have a gift.'],
        ['ansel', '(a block later) What is this one called?'],
        ['augie', 'This what?'],
        ['ansel', "The job. You name every job. The Long Lunch. Celia's Birthday."],
        ['jay', "(eyes on the road) The Bishop's Umbrella."],
        ['augie', "(sharply) We don't discuss the Bishop's Umbrella."],
        ['ansel', "(serenely, to the window) We don't discuss the Bishop's Umbrella."],
        ['augie', "(watching the palms go by) I name them after. When everybody's home. You name a job before, it hears you."],
      ] },
      { say: [
        ['caption', 'Casa Palma at half past one. Three storeys high in one street light, Tommy Reyes in his yellow hoodie, laughing at something off the edge of the wall.'],
        ['augie', '(quietly) Slow down.'],
        ['augie', "(to the wall, as Lulu rolls past at walking pace) Morning, Tommy. We're going to the lot. (beat) We're going to do it right this time."],
        ['caption', "Jay doesn't look at the mural. He watches the road at ten and two until the wall is in the mirror. Then he watches it in the mirror until it's gone."],
      ] },
      { music: 'tension' },
      { goto: GATE_KERB, vehicle: 'lulu', radius: 9, objective: 'Saltmarsh. Park on Harbor Road, outside the Pier 9 gate.', say: [
        ['augie', '(after a long quiet, to the back seat) Ansel. Read us one.'],
        ['ansel', 'I only read them to plants.'],
        ['augie', "Jay's been sitting in the same spot for three years. He's practically a fern. Go on."],
        ['ansel', '(a long moment; then low, to the window, the way you read to something growing) “A seed is a letter to somebody you will never meet.”'],
        ['ansel', '“Most of them are about the weather.”'],
        ['caption', 'Nobody says anything for a block. Augie nods slowly, the way he nods at an engine that sounds right.'],
        ['augie', "(eventually, a little hoarse) That's not about plants."],
        ['ansel', "(serenely) They're all about plants."],
        ['noor', "(on the radio, out of breath) Testing. Is this on? Jay, say something so I know it's on."],
        ['jay', 'Something.'],
        ['noor', "Hilarious. I'm forty metres up a crane. I can see my apartment. I left the light on."],
        ['rhea', '(on the radio, flat) Six of mine up top. Blue crane, green crane, the cold store roof. Kostya on the orange. Nobody fires unless I say.'],
        ['noor', 'Kostya, check in.'],
        ['caption', 'The hiss of an open channel. Nothing.'],
        ['rhea', "Kostya's slow on the radio. He's slow on everything. He was slow being born. (beat) Mercer. Two vests under your back seat. Mine. I want them back without holes in."],
      ] },
      { say: [
        ['caption', 'The dock road. Floodlights over the container stacks, and the cranes over Pier 9 like a row of patient giraffes.'],
        ['augie', '(watching them come) Kid. Whatever happens in there—'],
        ['jay', "Nothing's going to happen."],
        ['augie', "(smiling at the windscreen) That's my line. That's what I always say."],
      ] },
      { setTime: 2.15 },
      { scene: { at: 'pier9_gate', cast: ['augie', 'ansel'] }, say: [
        ['caption', 'Pier 9. 02:09.'],
        ['caption', 'The gate open, the guard booth dark, the yard beyond under five floodlights, white as an operating table.'],
        ['ansel', '(unfolding himself from the back seat with two navy vests over his arm) From Rhea. She says she is not sentimental. She says it is about the paperwork.'],
        ['augie', "(taking one and buckling it onto Jay himself, strap by strap, the way you do up a child's coat) Arms up."],
        ['jay', '(arms up) And yours.'],
        ['augie', "(handing the second one back to Ansel without looking at it) It doesn't go with the shoes."],
        ['jay', 'Augie.'],
        ['augie', "Thirty years, kid. Never once. If I wear one tonight, it means I planned for somebody's gun. (beat) I planned for Harlan. Harlan doesn't carry."],
        ['caption', "He pats the vest on Jay's chest, twice, the way he pats things that have behaved. Then his phone rings, and he holds it out flat on his palm."],
        ['rourke', "(on speaker, pleasant) Mr. Vance. Punctual. Bay fourteen, please. Bring Mr. Mercer; Captain Horne would like to see him. The car stays outside, and everyone else with it."],
        ['caption', 'The line goes dead. Augie puts the phone in his shirt pocket and pats that too.'],
        ['ansel', "(planting himself by the guard booth, arms folded, the spare vest still over one of them) I'll be right here. I'm very good at standing in one place."],
        ['augie', '(to Jay, straightening the drawing in his pocket) Ten and two, kid.'],
        ['jay', "We're walking."],
        ['augie', "Then walk at ten and two. (beat) Come on. Let's go and be sentimental."],
      ] },
      { reward: { armor: 100 } },
      { if: 'saved_teo', then: [
        { say: [
          ['teo', "(at the booth, to his father's back) Pop."],
          ['augie', '(turning, walking backwards a few steps in his good shoes, arms out) Hold the door.'],
          ['teo', '(almost smiling, almost not) ...Holding it.'],
        ] },
      ] },
      { leave: ['ansel', 'teo'] },
      // Bay 14: the people who came instead of Voss.
      { spawnCar: 'horne_cruiser', type: 'interceptor', at: 'bay_14', offset: [3, -6], exact: true, police: true, locked: true },
      { spawnCar: 'rourke_car', type: 'ironclad', at: 'bay_14', offset: [9, 6], exact: true, color: HALBERD, locked: true },
      { spawn: [
        { char: 'horne', at: 'bay_14', offset: [3, -2.5], behavior: 'idle' },
        { char: 'rourke', at: 'bay_14', offset: [3.5, 2], behavior: 'idle' },
        { id: 'escort', faction: 'halberd', hostile: false, at: 'bay_14', offset: [9, 1], count: 2, weapon: 'rifle', behavior: 'idle' },
      ] },
      { goto: 'bay_14', vehicle: false, radius: 5, objective: 'Walk Augie to bay fourteen', say: [
        ['augie', '(walking slowly, hands in his pockets) Sixty-eight metres. I paced it out the week after. Came back in daylight with a tape measure.'],
        ['augie', "(a nod back at the booth) I was standing there. I saw him go down from there. You were at the gate with the engine running. I could hear it over the sirens."],
        ['jay', 'I know.'],
        ['augie', "I know you know. I'm telling you because nobody else is ever going to stand here and tell you."],
        ['noor', '(on the radio, very quietly) Two men by a police cruiser in bay thirteen. Two Halberd with rifles. No white suit. No Voss.'],
        ['rhea', '(on the radio) Kostya. Check in. (nothing) ...Kostya.'],
      ] },
      { say: [
        ['caption', 'Bay fourteen. A loading bay like the other thirty, except for a square of yellow paint on the concrete, newer than the rest. A cleaner yellow. About the size of a man.'],
      ] },
      { leave: ['augie'] },
      { scene: { at: 'bay_14', cast: ['augie', 'horne', 'rourke'] }, say: [
        ['caption', 'Horne leans on the bonnet of his own cruiser, ankles crossed. On its flank, small and white: 1-ADAM-9. Rourke stands on the new paint with a holdall at his feet.'],
        ['augie', "(stopping at the edge of the yellow square, not on it) Where's Harlan?"],
        ['rourke', "Mr. Voss doesn't come to Saltmarsh. He says it smells of his father."],
        ['augie', 'It does. I knew his father. Big Harlan, diesel and oranges. Little Harlan used to steal my bike and bring it back cleaner than he took it.'],
        ['horne', "(pushing off the cruiser, pleasant as a neighbour, looking down at the paint) Right about here, wasn't it, Mercer? Bay fourteen. They repainted it. I asked them to."],
        ['jay', '(nothing)'],
        ['horne', "Looks good, doesn't it? Takes a lot of coats, yellow. Yellow's a bastard to cover."],
        ['horne', "You were in the car that night. Engine running. I remember thinking, nice engine. (beat) Shame about the driver."],
        ['rourke', "(mildly, nudging the holdall forward with his shoe) Five million dollars. Count it if you like. It takes forty minutes, and I bill by the hour, so I'd rather you didn't."],
        ['augie', 'And the paper.'],
        ['caption', 'A cream card from an envelope, the ink a little raised, in a big looping hand: OLD MARKET STANDS. YOU HAVE MY WORD. H.V.'],
        ['augie', '(reading it twice) Lovely handwriting. He always had lovely handwriting.'],
        ['rourke', "Mr. Voss keeps his word, Mr. Vance. He's very proud of it."],
        ['augie', "(sliding the card into his shirt pocket, next to the horse) Men like Harlan always are. It's the only thing they think makes them different from us."],
        ['horne', "(to Jay, softly, almost kindly) Everyone's an informant, you know. Most people just haven't been asked nicely yet."],
        ['jay', '(very still) Who did you ask?'],
        ['horne', '(smiling; tapping the gold watch, twice) Tick tock, Mercer.'],
      ] },
      { if: 'chased_rourke', then: [
        { scene: { at: 'bay_14', cast: ['rourke', 'augie'] }, say: [
          ['rourke', "(to Jay, courteous) I believe you have a phone of mine. Keep it. It's been wiped from the other end. I'm very thorough."],
          ['jay', "Maggie hasn't called you back."],
          ['caption', "For half a second something moves behind Kessler Rourke's face. Then it is gone. Filed. Billed."],
          ['rourke', 'Back to your car now, please, Mr. Mercer. Outside the gate.'],
        ] },
      ], else: [
        { scene: { at: 'bay_14', cast: ['rourke', 'augie'] }, say: [
          ['rourke', "(to Jay, courteous) And the boy? The one with the tote bag. I hear he tore something up very slowly."],
          ['jay', "He's at the gate."],
          ['rourke', '(nodding, as if this is useful) Good. Somebody should be. Back to your car now, please, Mr. Mercer. Outside the gate.'],
        ] },
      ] },
      { scene: { at: 'bay_14', cast: ['rourke', 'augie'] }, say: [
        ['rourke', "Drivers wait in cars. It's the one thing everybody agrees about."],
        ['jay', '(not moving) No.'],
        ['augie', "(turning his back on all of them, low, just for Jay) Go on. I hand him a book, I pick up a bag, I walk sixty-eight metres in good shoes. I can manage sixty-eight metres."],
        ['jay', 'If this goes sideways—'],
        ['augie', "(smiling, and it's the smile from seventeen, the full tank, the seat pulled right) Then you'll know what to do. You always know. Go on."],
        ['caption', "He fixes Jay's collar over the top of Rhea's vest, which doesn't need fixing, and turns him round by the shoulders toward the gate."],
      ] },
      { getIn: 'lulu', objective: 'Walk back to Lulu. Outside the gate. Sixty-eight metres.', say: [
        ['caption', "Noor patched Augie's phone into the crew channel at the bar. An open line, in his shirt pocket. Everything said in bay fourteen comes out of Jay's radio as he walks away from it."],
        ['horne', "(on the open line, amused) Look at him go. Walks like a man who's done this before."],
        ['augie', "(on the open line) Leave him alone, Wade. He's had a long three years."],
        ['rourke', '(on the open line) The book first, please, Mr. Vance. On the ground. Then step back to the line, and the bag is yours.'],
        ['noor', "(on the radio, fast, low) Rhea. The orange crane. The cab light just went off. Kostya never turns his light off, he reads in there, he reads westerns—"],
        ['rhea', "(on the radio, after a silence that goes on too long) ...That isn't Kostya."],
      ] },
      { say: [
        ['caption', 'Lulu. Hands on the wheel at ten and two. The dash clock says 02:10. Through the windscreen and the chain-link: three small figures in bay fourteen, and a cream linen shirt.'],
        ['rhea', "(on the radio, flat and fast) Blue crane, green crane, eyes on the orange. Don't fire. Don't fire till I say."],
        ['augie', '(on the open line, the rustle of his shirt) Here. One green book.'],
        ['caption', 'Augie bends, slowly, an old man in good shoes, and lays the Tally on the yellow line. He steps back from it. He looks at his watch.'],
        ['augie', '(on the open line) Two-ten. On the nose. Now the bag, Mr. Rourke.'],
        ['horne', '(on the open line) Hold on.'],
        ['augie', '(on the open line) Hold on for what?'],
        ['horne', '(on the open line, watching the second hand go round the gold watch) I like an anniversary. Hold on. ...Hold on.'],
      ] },
      { music: 'off' },
      // Time slows on the tableau itself, then the cut to black.
      { slowmo: 2.5 },
      { camera: 'bay_14', seconds: 5, say: [
        ['horne', '(tap. tap.) Tick tock.'],
      ] },
      { setTime: 2.18 },
      { leave: ['augie', 'horne', 'rourke', 'escort_0', 'escort_1'] },
      // The wounded Augie replaces the standing one under the blackout (Jay is
      // in the car outside the gate, too far away to see the other one go).
      { spawn: [{ char: 'augie', at: 'bay_14', offset: [2, 0.5], behavior: 'cower', health: 100000 }] },
      { blackout: [
        ['caption', '(A sound from the orange crane like a door slamming three streets away.)'],
        ['caption', '02:11:04.'],
        ['caption', '(Augie sits down on the new yellow paint as if somebody has called his name from very far away.)'],
        ['rourke', "(on the open line, close to the pocket, almost gentle) Mr. Voss keeps his word, Mr. Vance. That's why he isn't here."],
        ['caption', '(Rourke picks up the green book and wipes the cover with his sleeve. Then the holdall. He walks off between the bays without hurrying, past his own car, like a man who has others.)'],
        ['rhea', "(on the radio, and for the first time in her life her voice goes up) That's my crane. That's Stavros's crane. All of you. The orange crane. NOW."],
        ['augie', '(on the open line, wet, so calm, so reasonable) Kid. ...Kid. Drive.'],
      ] },
      { music: 'action' },
      // The ambush: Halberd rifles in the yard, Southside coming up Harbor Road behind him.
      { checkpoint: true, spawn: [
        { id: 'yard_rifle', faction: 'halberd', at: 'bay_14', offset: [16, -26], weapon: 'rifle', behavior: 'guard', group: 'ambush' },
        { id: 'yard_rifle2', faction: 'halberd', at: 'bay_14', offset: [30, -38], weapon: 'rifle', behavior: 'guard', group: 'ambush' },
        { id: 'yard_smg', faction: 'halberd', at: 'bay_14', offset: [8, -44], weapon: 'smg', behavior: 'guard', group: 'ambush' },
        { id: 'yard_smg2', faction: 'halberd', at: 'bay_14', offset: [40, -20], weapon: 'smg', behavior: 'guard', group: 'ambush' },
        { id: 'harbor_cop', faction: 'vpd', at: { x: 392, z: 470 }, weapon: 'pistol', behavior: 'attack', group: 'ambush' },
        { id: 'harbor_cop2', faction: 'vpd', at: { x: 396, z: 466 }, weapon: 'smg', behavior: 'attack', group: 'ambush' },
      ] },
      // Rhea's vest (again here so a retry from the checkpoint has it on too).
      { reward: { armor: 100 } },
      { say: [
        ['caption', '02:11:20.'],
        ['caption', 'Three years ago, to the second, his right hand went to the gear stick and put it in drive.'],
        ['caption', 'His right hand goes to the gear stick. It stays there. Then it goes to the door handle.'],
      ] },
      { kill: 'group:ambush', objective: 'Out of the car. Use Lulu for cover. Halberd in the yard, Southside on the road.', say: [
        ['noor', '(on the radio, all at once) Shit. Shit, shit, shitting shit. Two by the stacks, two by bay six, Southside coming up Harbor Road behind you—'],
        ['ansel', "(from behind the guard booth, very calm, very loud) I'm at the booth. I'm here. I'm not going anywhere."],
        ['augie', "(on the open line, each word with a space round it) Drive. Kid. Like we said. That's the job."],
        ['rhea', '(on the radio) Blue crane has a shot on the orange cab. Taking it. ...Missed. Take it again.'],
        ['augie', "(on the open line, fainter) Don't you dare come in here. Get in the car."],
      ] },
      { music: 'tension' },
      { say: [
        ['noor', "(on the radio, crying and not stopping talking) He's moving. He's alive. Jay, he's on the paint and he's moving his hand—"],
        ['augie', '(on the open line, barely) ...Drive.'],
        ['jay', '(to the radio, quiet, very clear) Not this time.'],
      ] },
      { music: 'action' },
      { slowmo: 1.5 },
      { spawn: [
        { id: 'lot_rifle', faction: 'halberd', at: 'bay_14', offset: [22, 6], weapon: 'rifle', behavior: 'attack', group: 'lot' },
        { id: 'lot_smg', faction: 'halberd', at: 'bay_14', offset: [30, -6], weapon: 'smg', behavior: 'attack', group: 'lot' },
        { id: 'lot_smg2', faction: 'halberd', at: 'bay_14', offset: [14, 14], weapon: 'smg', behavior: 'attack', group: 'lot' },
      ] },
      { goto: 'augie', vehicle: false, radius: 2.4, objective: 'Go back across the lot. Get to Augie.', say: [
        ['noor', "(on the radio, a sound that isn't a word, and then) He's going. He's going back. Rhea, he's going back across the lot—"],
        ['rhea', '(on the radio) Then cover him. Everybody. Everything you have. Cover the boy.'],
      ] },
      { if: 'gave_cut', then: [besideHim(BESIDE_HIM_GAVE)], else: [besideHim(BESIDE_HIM_KEPT)] },
      { say: [
        ['rhea', "(on the radio) Mercer. Now, while they're reloading. Whatever you're going to do, do it now."],
        ['augie', "(letting go of Jay's wrist and pushing it away from him) Go and get her. Bring her to me."],
        ['jay', "I'm not leaving you."],
        ['augie', "You're not leaving. You're fetching. There's a difference. (beat) You're the wheelman. Go and wheel."],
      ] },
      { spawn: [
        { id: 'gate_rifle', faction: 'halberd', at: 'pier9_gate', offset: [14, 18], weapon: 'rifle', behavior: 'attack', group: 'gate' },
        { id: 'gate_cop', faction: 'vpd', at: GATE_KERB, offset: [30, 2], weapon: 'pistol', behavior: 'attack', group: 'gate' },
      ] },
      // After the checkpoint above, Lulu is "the car he's in": a retry hands
      // him a copy of her where he stood, so these steps don't name her.
      { getIn: 'any', objective: 'Run back to Lulu. Fetch her. Bring her to him.' },
      { goto: 'augie', vehicle: true, radius: 8, objective: 'Drive her into the lot. Right up to him.', say: [
        ['noor', "(on the radio) He's in the car. He's turning. He's turning IN. Rhea, he's driving into the lot—"],
        ['jay', '(to the car, low, flooring it through the gate) Come on, Lulu. Straight through them.'],
      ] },
      { fade: 'out' },
      { leave: ['augie'] },
      { teleport: UP_PELICAN },
      { if: 'saved_teo', then: [intoTheCar(INTO_THE_CAR_TEO)], else: [intoTheCar([])] },
      { wait: 1.4 },
      { setTime: 2.35 },
      { fade: 'in' },
      { music: 'action', checkpoint: true },
      // Everyone riding with him is spawned on the car, so they're already in it.
      { spawn: [{ char: 'mae', at: UP_PELICAN, behavior: 'follow', weapon: 'fists', health: 900 }] },
      { if: 'saved_teo', then: [{ spawn: [{ char: 'teo', at: UP_PELICAN, behavior: 'follow', weapon: 'fists', health: 900 }] }] },
      { spawnCar: 'medic12', type: 'medic', at: MEDIC_BEHIND },
      // Gus retired at the end of Night Shift; with nightshift_done somebody else drives Medic 12.
      { if: 'nightshift_done', then: [
        { spawn: [{ id: 'medic_driver', faction: 'civilian', hostile: false, at: 'medic12', behavior: 'drive', car: 'medic12', to: 'mercy_general' }] },
      ], else: [
        { spawn: [{ char: 'gus', at: 'medic12', behavior: 'drive', car: 'medic12', to: 'mercy_general' }] },
      ] },
      { if: 'trusted_calder', then: [
        { heat: 2 },
        { spawnCar: 'calder_car', type: 'unmarked', at: CALDER_START, color: CALDER_GREEN },
        { spawn: [{ char: 'calder', at: 'calder_car', behavior: 'drive', car: 'calder_car', to: 'mercy_general' }] },
        { phone: 'calder', objective: 'Get him to Mercy General', say: [
          ['calder', "(no hello; sirens, her engine screaming) Mercer. Horne put a roadblock across Southshore. Two Southside units and a van. It's down. I took it down."],
          ['calder', "Two cars from Central who still think the job is the job. Nobody follows you up Pelican. Don't wait for us."],
          ['calder', "(away from the phone, to her car) Don't you dare stall on me, you bastard. Not tonight. (to Jay) GO."],
        ] },
      ], else: [
        { heat: 5 },
        { phone: 'noor', objective: 'Get him to Mercy General', say: [
          ['noor', "(crying and typing at once) Southside's on every channel. Roadblock on Southshore. A helicopter. They're fighting me for the lights. I turn them green, they turn them red."],
          ['noor', "Pelican to Magnolia. Don't stop at the reds. Don't stop for anything. I'll get you Magnolia. I'll get you Magnolia if it kills me."],
        ] },
      ] },
      { if: 'saved_teo', then: [
        { if: 'nightshift_done', then: lastDrive(UP_PELICAN_SAVED, TO_MERCY_PATCH), else: lastDrive(UP_PELICAN_SAVED, []) },
      ], else: [
        { if: 'nightshift_done', then: lastDrive(UP_PELICAN_CHASED, TO_MERCY_PATCH), else: lastDrive(UP_PELICAN_CHASED, []) },
      ] },
      { heat: 0 },
      // A bare objective step, then the lines: a say step waits for anything
      // still being said in the car, so the blackout never cuts it.
      { objective: 'Stay with him.' },
      { say: [
        ['caption', 'Heron Street. The hospital sign. The ambulance bay. He brakes: late, hard, perfect.'],
      ] },
      { music: 'sad' },
      { if: 'saved_teo', then: [
        { blackout: [...BAY_OPEN, ...BAY_SAVED, ...BAY_CLOSE] },
      ], else: [
        { blackout: [...BAY_OPEN, ...BAY_CHASED, ...BAY_CLOSE] },
      ] },
      { if: 'saved_teo', then: [
        { scene: { at: 'mercy_general', cast: ['mae', 'teo'] }, say: [...KERB_OPEN, KERB_TEO, ...KERB_MID] },
      ], else: [
        { scene: { at: 'mercy_general', cast: ['mae'] }, say: [...KERB_OPEN, ...KERB_MID] },
      ] },
      { if: 'mae_stay', then: [
        { scene: { at: 'mercy_general', cast: ['mae'] }, say: [
          ['caption', "Mae takes his hand, the one that was at two o'clock, and holds it on her knee as if it's something she's keeping warm for somebody."],
          ['mae', "Don't go anywhere tonight. Don't drive anywhere. Okay?"],
          ['jay', "(after a long time) I'm here."],
        ] },
      ], else: [
        { scene: { at: 'mercy_general', cast: ['mae'] }, say: [
          ['caption', 'She has left a careful foot of kerb between them. The space he gave her. Then she closes it, and puts her head on his shoulder, and doesn\'t explain.'],
          ['mae', "You gave me space. I'm taking some of it back. Just tonight."],
          ['jay', "(after a long time) I'm here."],
        ] },
      ] },
      { if: 'saved_teo', then: [
        { scene: { at: 'mercy_general', cast: ['teo', 'mae'] }, say: [
          ['caption', "Teo comes away from the car at last and sits on Jay's other side with the steel watch. He turns the crown with his thumb, as if it might break. One. Two. Three."],
          ['teo', '(not looking up) He showed me. In the car. Three turns, not four. It sulks at four.'],
          ['teo', '(beat) Twenty-four years. He waited till the back of a car to show me anything.'],
          ['jay', "(after a while) That's where he showed me everything."],
          ['teo', "(holding the watch to his ear) ...It's still going."],
          ['caption', "The three of them on the kerb in a row under the strip light. The watch ticks. It doesn't lose a second."],
        ] },
      ], else: [
        { phone: 'teo', say: [
          ['caption', 'He dials. It rings for a long time.'],
          ['teo', "(a kitchen behind him, a radio, an old woman telling him to hold still) What. It's three in the morning, Mercer. Wick's nan's gluing my eyebrow back on. It came open."],
          ['jay', '(nothing)'],
          ['teo', '(the radio behind him goes off; somebody has turned it off) ...Mercer.'],
          ['teo', '(very carefully, as if the words are full) Where is he.'],
          ['jay', 'Mercy General.'],
          ['teo', "(a sound like something tearing slowly) ...Don't let them move him. Don't let them take him anywhere. I'm coming. I'm coming."],
          ['caption', 'The line goes dead. Jay looks down at the steel watch in his hand. It says two fifty-eight. It is exactly right.'],
        ] },
      ] },
      { text: 'dex', message: "still at the garage. engine running. call me when you're clear" },
      { say: [
        ['caption', 'DEX. He looks at it until the screen goes dark. Then he turns the phone face down on the kerb.'],
      ] },
      { if: 'trusted_calder', then: [
        { say: [
          ['caption', 'At the far end of the bay a dark green unmarked car sits with its lights off. Calder leans on it with an empty coffee cup. She doesn\'t come over. She stays until it gets light.'],
        ] },
      ] },
      { wait: 4 },
      { setFlag: 'augie_dead' },
      { fade: 'out' },
    ],
  });
})();
