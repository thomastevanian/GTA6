/*
 * data/story-act3m22.js — m22 LUGNUT, Act 3 of "Ten and Two".
 *
 * Two nights after Pier 9. The payments lead to Calloway Auto. Jay tails
 * Dex to the top deck of the Grand Parkade (Noor's canary spot, the one
 * nobody visited), hears Horne pay him off, and lays the seeds back down in
 * front of him one at a time, the way Augie laid out napkins. Halberd comes
 * up the ramp to tidy Horne's informant away. In the lull Jay finally says
 * what he means, and then decides what Dex is: forgiven, banished, or a
 * witness. Every branch ends the same way: one in the morning, a Tuesday,
 * and a reminder Augie set on Jay's phone in m19.
 *
 * Flags set: dex_forgiven / dex_banished / dex_to_calder.
 * Flags read: trusted_calder / refused_calder.
 *
 * Invented here that later acts may lean on: Birdie's school is St. Brigid's
 * Primary (yellow gate on Anchor Street, lollipop lady called Pat), and
 * Horne gave a talk there in the spring and got a card with a horse on it;
 * Horne's first envelope was $4,000 and went down on the lift; Dex's
 * catalytic converter was wrapped in Birdie's octopus beach towel; with
 * dex_forgiven Ansel spends the night in the garage doorway with a chair
 * (so he is there for Birdie when it burns in m23), and Birdie has a
 * spelling test on Thursday (necessary, rhythm, separate); with
 * dex_banished Rafi has the garage keys and Dex has told Birdie they are
 * going "somewhere with snow" on holiday; with dex_to_calder Mae and Gus
 * collect Birdie in Medic 12 (a new partner instead of Gus with nightshift_done:
 * he retired at the end of Night Shift), and Calder rings Ray Okonkwo (trusted only).
 * Horne left the beige Halcyon on the top deck with the keys on its roof
 * (he knew who was coming up the ramp). With chased_rourke Celia's watch is
 * still on Jay's bedside table (Teo: "bring the watch"); with saved_teo Teo
 * texts that Augie bought the plot next to Celia twelve years ago, in cash.
 * Flags also read: saved_teo / chased_rourke, nightshift_done.
 *
 * Engine notes: every branch gets Jay back into Lulu before the coda, so the
 * radio call is always made from behind the wheel. A short `say` step comes
 * before every scene or phone call that follows car banter, so no line is
 * cut. The cleaners are cocky (low accuracy, one group holding by its car)
 * because they came for one unarmed mechanic; Jay takes a vest in the lull.
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const MUSTARD = 0xc9a227;

  const lulu = (at) => ({ spawnCar: 'lulu', type: 'lowrider', at, color: LULU_TEAL });
  const halberdSuv = (id, at) => ({ spawnCar: id, type: 'ironclad', at, color: HALBERD });

  // The meet. The Grand Parkade's top deck, where the tow truck stops (a
  // street spot so the tail always arrives; the parkade itself is a lot).
  Object.assign(S.places, {
    parkade_ramp: { name: 'The Grand Parkade, top deck', sign: 'GRAND PARKADE', district: 'downtown', kind: 'street', desc: 'The top of the Grand Parkade spiral: concrete pillars, sodium lights with moths in them, a pay machine that has said OUT OF ORDER since spring.' },
  });

  // The second wave up the ramp, after the choice.
  const WAVE_TWO = [
    halberdSuv('cleaner_c', 'parkade_ramp'),
    halberdSuv('cleaner_d', 'parkade_ramp'),
    { spawn: [
      { id: 'tidier', faction: 'halberd', at: 'cleaner_c', count: 3, weapon: 'smg', behavior: 'attack', accuracy: 0.32, group: 'cleaners2' },
      { id: 'closer', faction: 'halberd', at: 'cleaner_d', count: 2, weapon: 'rifle', behavior: 'guard', accuracy: 0.3, group: 'cleaners2' },
    ] },
    { music: 'action' },
  ];

  // Room 12, two nights after Pier 9.
  const MOTEL = [
    ['caption', 'The Magnolia Motor Lodge. Room 12. Two nights after.'],
    ['caption', '(Augie\'s letters on the bedspread, in order. He has read eleven since the pier: bowels, mostly, and a recipe for prison chilli. He has stopped at twelve.)'],
    ['caption', '(After twelve there are only twenty-five more things Augie is ever going to say to him.)'],
    ['caption', '(Through the curtain: Lulu, under the VACAN sign. Her back seat shampooed twice by somebody who knew exactly what he was doing. A pine-tree air freshener that was never there.)'],
    ['caption', '(The keys came back on the motel mat the next morning, with a note in block capitals on a Calloway Auto invoice: SHE\'LL BE DRY BY TONIGHT. D.)'],
  ];

  // dex_to_calder: Jay rings Mae to collect Birdie. Gus retired at the end of
  // Night Shift, so with nightshift_done Mae has a new partner on Medic 12.
  const MAE_CALL_OPEN = [
    ['caption', '(He dials again. Dex, beside him, looks at his own hands.)'],
    ['mae', "(on the phone, an ambulance radio crackling behind her) Medic 12. Jay? It's one in the morning. Who's hurt?"],
    ['jay', "Nobody. I need you to pick up Birdie Calloway. Tonight. The flat over the garage. Rafi's with her."],
    ['mae', "(on the phone) I'm on shift. I can't just— (beat) What's happened? Is Dex hurt?"],
    ['jay', 'No.'],
    ['mae', '(a pause; she has spent ten years hearing what is under what people say) Jay. What did he do?'],
    ['jay', "(a long time, with Dex beside him) Ask me when it's over."],
    ['mae', "(silence on the line) ...That's mine. You don't get to use mine."],
    ['jay', 'I know.'],
  ];
  const MAE_CALL_GUS = [
    ['mae', '(away from the phone) Gus. Anchor Street.'],
    ['gus', "(distant, aggrieved) I'm sixty-one, Reyes. I don't do Anchor Street."],
  ];
  const MAE_CALL_NEW_PARTNER = [
    ['mae', "(away from the phone) Anchor Street. (beat) No, by Tannery. Gus always went by Tannery."],
  ];
  const maeCall = (partner) => ({ goto: 'vpd_central', vehicle: 'lulu', objective: 'VPD Central. Calder is on the bench out front.', say: MAE_CALL_OPEN.concat(partner, [
    ['mae', "(back to Jay, quieter) I've got her. Whatever it is. I've got her."],
  ]) });

  // ---------------------------------------------------------------- coda
  // One in the morning. Tuesday. Augie's reminder, set on Jay's phone at
  // the seawall in m19 ("Put you on it too. In case I forget.").
  const CODA = [
    { getIn: 'lulu', objective: 'Back to Lulu' },
    { setTime: 1 },
    { music: 'off' },
    { text: 'augie', message: 'Tuesday reminder. Request the song. Del knows which one. Don\'t let her play the remix.' },
    { phone: 'dj_del', say: [
      ['caption', '(He looks at it for a long time. Then he dials, and holds the phone a foot from his face, the way Augie did, without noticing he is doing it.)'],
      ['dj_del', "(on the air, low, one in the morning) VHR eighty-eight point one, you're on with Del. Go ahead, night driver."],
      ['jay', 'Is this the radio?'],
      ['dj_del', "(a pause. She knows that sentence. She's heard it every Tuesday for twenty years.) ...It's the radio, honey. Who's this?"],
      ['jay', "A friend of Augie's. He put it on my phone. Tuesdays. In case he forgot."],
      ['dj_del', '(Three seconds of dead air on a radio station. Then four.) He\'s not going to call, is he.'],
      ['jay', 'No.'],
      ['dj_del', "(on the air, to the whole city, and her voice only goes once) Night drivers. A man called me every Tuesday for twenty years for the same song. Tonight his friend called instead."],
      ['dj_del', "So this is for Augustine Vance. Corinne Day. “Porchlight.” (beat) Not the remix, sweetheart. I know. I know."],
      ['caption', '(A voice like a lighthouse, singing about a porch light left on for somebody coming home late. Jay sits at ten and two on a wheel that isn\'t going anywhere, and lets it play out.)'],
    ] },
    { say: [
      ['jay', "(to the empty passenger seat, when it's over, very low, Augie's flat note and all) ♪ Leave it burning, leave it on... ♪"],
    ] },
    { wait: 3 },
  ];

  S.missions.push({
    id: 'm22_lugnut',
    act: 3,
    title: 'Lugnut',
    giver: 'noor',
    start: 'magnolia_motel',
    time: 23,
    estMinutes: 11,
    summary: 'Jay finds out who LUGNUT is.',
    failIf: ['dead:dex', 'wrecked:lulu'],
    steps: [
      lulu('magnolia_motel'),
      { spawnCar: 'dex_tow', type: 'mesa', at: 'dex_garage', color: MUSTARD },
      { music: 'off' },
      // With chased_rourke Augie gave Jay Celia's watch to pass on (m21); Teo takes it at the grave (m23).
      { if: 'chased_rourke', then: [
        { blackout: MOTEL.concat([
          ['caption', '(On the bedside table, face up, a steel watch on a cracked strap. Teo\'s. Jay has rung him four times to give it to him. It is still here, and it has not lost a second.)'],
        ]) },
      ], else: [
        { blackout: MOTEL },
      ] },
      { if: 'trusted_calder', then: [
        { phone: 'calder', objective: 'Take the call', say: [
          ['calder', "(no hello; an engine somewhere near her trying to start and thinking better of it) Mercer. Are you sitting down?"],
          ['jay', "I'm always sitting down. I'm a driver."],
          ['calder', "I pulled Horne's informant file. Officially I'm auditing parking-fine revenue. I've been in a records cage since six with a flask of coffee that tastes like a penny."],
          ['calder', "CI LUGNUT's payments go through a parts account. Same day every month, four years. The account's called Calloway Auto Supply."],
          ['jay', '(a long time) There\'s no Calloway Auto Supply.'],
          ['calder', "No. There's a PO box on Tannery Avenue and a garage on Anchor Street with one L out on the sign."],
          ['calder', 'Two bonuses. One on the first of October, three years ago. The morning after Tidewater. The other one on Saturday. The twenty-ninth.'],
          ['jay', '(very quietly) The day before Pier 9.'],
          ['calder', "(beat) He fixed my car once, you know. Side of Laurel Street, midnight, the alternator. Wouldn't take a dime. Said it was too sad a car to charge for."],
          ['calder', "(beat) I'm sorry, Mercer. (beat) Don't do anything stupid tonight."],
          ['jay', 'Define stupid.'],
          ['calder', 'Anything I have to write down. (to the engine, away from the phone) Start, you piece of shit. Please. I\'m asking nicely.'],
        ] },
      ], else: [
        { phone: 'noor', objective: 'Take the call', say: [
          ['noor', "(fast, too fast, the way she talks when she's been awake too long) Don't hang up. I'm going to say it in order. If I say it in order it's just data."],
          ['noor', "The informant file. The one I fell into through the traffic lights. LUGNUT gets paid on the fourth of every month. Four years. I've had the dates since the relay roof."],
          ['noor', "Tonight I put them next to everybody's bank dates. Everybody. Mine first. I did mine first."],
          ['noor', "Calloway Auto pays off its lift on the fifth of every month. In cash. The first LUGNUT payment was four thousand dollars. So was the deposit on the lift."],
          ['jay', '(nothing)'],
          ['noor', "There's an extra one. The first of October, three years ago. The morning after Tidewater. And one on the twenty-ninth. The day before Pier 9."],
          ['noor', "(her voice going) He fixed my laptop hinge with a bit of coat hanger. It's still the best part of the laptop. I made a spreadsheet about him, Jay. It has tabs."],
          ['noor', "In Rhea's shed, when you all looked at me... I wanted it to be anybody. I'd have taken it being me. That's insane. I know that's insane."],
          ['noor', 'I matched the dates three times. Four. I wanted to be wrong. I am never wrong, and I wanted to be.'],
          ['noor', '(barely) Jay, I\'m so sorry.'],
        ] },
      ] },
      { if: 'saved_teo', then: [
        { text: 'teo', message: "friday. st brigids. ilunga says pop bought the plot 12 yrs ago next to mom. paid cash. course he did. (wound it 3 turns. still going)" },
      ], else: [
        { text: 'teo', message: 'friday. st brigids. bring the watch.' },
      ] },
      { text: 'dex', message: 'out on a tow, back by 1. birdie upstairs, rafi on the couch. lulu should be dry. dont put anything in the back till tmrw' },
      { text: 'dex', message: 'you eating? you should eat' },
      { getIn: 'lulu', objective: 'Get in Lulu' },
      { say: [
        ['caption', '(He sits in the front and doesn\'t start her. In the mirror, the back seat, clean as a showroom. The pine tree turns slowly on its string.)'],
        ['jay', '(to the car, very low) He did a good job on you.'],
        ['jay', '(beat) Of course he did.'],
      ] },
      { music: 'tension' },
      { goto: 'dex_garage', vehicle: 'lulu', radius: 40, objective: 'Drive to Calloway Auto. Lights off for the last block.', say: [
        ['jay', "(to Lulu, Magnolia Street going by) He changed your oil every month for three years. Sat in you once a week with the engine off. Said it was weird."],
        ['jay', "It wasn't weird. It was the nicest thing anybody did while I was gone."],
        ['caption', '(A red light on Coral. He stops for it a long way back, the way he stops for everything now. Then he doesn\'t wait for it to change.)'],
        ['jay', "(to the car, through the junction) I know. Don't. I know."],
        ['caption', '(Old Market. Anchor Street. He kills the headlights a block out and rolls the last of it in the dark, like he used to roll up on a job.)'],
      ] },
      { spawnCar: 'meet_car', type: 'halcyon', at: 'parkade_ramp', color: 0xb8b09a, watch: false },
      { camera: 'dex_garage', seconds: 6, say: [
        ['caption', '(Calloway Auto. The neon says CAL OWAY AUTO. Upstairs, a pink smudge in the window: Birdie\'s night light. Downstairs, the roll-up door is coming down.)'],
        ['caption', '(The mustard tow truck noses out of the lot with its headlights off. It turns right, toward Downtown, where nobody ever needs a tow at eleven at night.)'],
        ['jay', '(barely) Where are you going, Dex.'],
      ] },
      { follow: 'dex_tow', to: 'parkade_ramp', min: 15, max: 100, speed: 0.9, checkpoint: true, objective: "Tail Dex's tow truck. Not close. He knows Lulu better than you do.", say: [
        ['caption', '(Two orange cab lights and the CALLOWAY AUTO lettering, a hundred metres ahead. He keeps them exactly there.)'],
        ['caption', '(His phone lights up on the dash. DEX.)'],
        ['dex', '(on the phone, the tow truck\'s engine under his voice) Hey. You up? I figured you\'d be up.'],
        ['jay', "(watching the tow truck's taillights, one hand on the wheel) I'm up."],
        ['jay', "Where are you?"],
        ['dex', "Tow. Some genius in a Sovereign put it in the fountain at Founders Park. Wanted to see if it floated. It doesn't, for the record. Nothing floats."],
        ['caption', '(Ahead, the tow truck goes straight past the turn for Founders Park without slowing.)'],
        ['jay', '(a long beat) Founders Park.'],
        ['dex', "Yeah. Listen, I'll swing by the Magnolia after, bring you a burrito from the cart. The good cart. Not the one that made Rafi see God."],
        ['jay', "Don't."],
        ['dex', '(a pause, a small one) Okay. Okay, man. Tomorrow. (beat) Jay? Lulu dry?'],
        ['jay', "(his eyes on the tow truck as it signals, carefully, into the Grand Parkade) She's dry."],
        ['dex', "Good. That's good. Night, Jay. Drive nice."],
      ] },
      { spawn: [
        { char: 'dex', at: 'dex_tow', offset: [2.2, 0], behavior: 'idle', health: 900 },
        { char: 'horne', at: 'meet_car', offset: [1.6, 1.4], behavior: 'idle', health: 900 },
      ] },
      { music: 'off' },
      { setTime: 23.6 },
      { goto: 'dex', vehicle: false, radius: 11, objective: 'Leave Lulu. Up the ramp on foot. Stay behind the pillars.', say: [
        ['caption', '(The Grand Parkade. He leaves Lulu with her nose to the wall and goes up the rest on foot, pillar to pillar.)'],
        ['caption', '(Voices carry on concrete. Before he sees them he hears them: somebody cracking seeds in his teeth, and Dex, too fast, the way he talks to a customer when the bill is bad.)'],
        ['caption', '(Then the other voice. Pleasant. He last heard it at Heron Corner, peeling notes off a roll for a street race, with a gold watch going tap, tap.)'],
      ] },
      { scene: { at: 'dex', cast: ['dex', 'horne'] }, say: [
        ['caption', '(The top deck. Noor\'s spot, the night of the canary. The spot nobody came to. Somebody came tonight.)'],
        ['caption', '(Captain Wade Horne, in uniform, leaning on a beige Halcyon nobody would look at twice, eating sunflower seeds from a paper twist. Jay behind a pillar, twelve metres away.)'],
        ['horne', '(checking his gold watch as Dex walks up) Four minutes late, Calloway. I had you down as punctual. It was the one thing I liked about you.'],
        ['dex', "Birdie wouldn't go down. She wanted the story about the horse."],
        ['horne', "The horse. That's sweet. (He holds out a thick envelope between two fingers.) Count it."],
        ['dex', "(not taking it) I don't want it."],
        ['horne', "Nobody wants it, Dexter. That's why it works. You don't pay people for things they'd do anyway."],
        ['dex', 'You said nobody would get hurt! You said that three years ago!'],
        ['horne', '(spitting a shell over the parapet) And nobody got hurt who mattered.'],
        ['dex', "Augie mattered. Augie sat at my kitchen table. He taught my kid to cheat at cards. He's in a drawer at the county morgue with a tag on his toe and you said—"],
        ['horne', "I say a lot of things. Augie Vance walked into a car park at two in the morning with my employer's property. That's not a tragedy, Dexter. That's a Tuesday."],
        ['caption', '(Behind the pillar, Jay\'s hand finds the pistol in his jacket, and stays there, and does not come out.)'],
        ['horne', "(tapping the watch) Here's what matters. The book's home. The old man's in the ground by Friday. Mercer's in a motel reading his mail. And you keep doing what you're good at."],
        ['dex', 'Which is what?'],
        ['horne', "Fixing things for people who never know you touched them. (beat) How's the junior deputy? Still wearing her sticker?"],
        ['dex', '(very quietly) Don\'t.'],
        ['horne', "Lovely school, St. Brigid's Primary. Yellow gate. Lollipop lady called Pat. I did a talk there in the spring. The kids made me a card. Somebody drew me as a horse."],
        ['caption', '(Behind the pillar, Jay thinks of another horse. Long and brown, with grey hair, folded in four in a shirt pocket that Mae had to cut through.)'],
        ['caption', '(Dex takes the envelope. His hand is shaking so hard the paper sounds like rain.)'],
        ['horne', "(pushing off the car, brushing off seed husks) Buy her something nice. Buy yourself another lift."],
        ['caption', '(He puts the Halcyon\'s keys on its roof, neatly, the way you leave a tip, and walks to the stairwell. He doesn\'t take the car. He doesn\'t want to be on the ramp in ten minutes.)'],
        ['horne', '(not looking back) Tick tock, Calloway.'],
      ] },
      { leave: ['horne'] },
      { music: 'sad' },
      { goto: 'dex', vehicle: false, radius: 2.8, objective: 'Step out from behind the pillar' },
      { scene: { at: 'dex', cast: ['dex'] }, say: [
        ['caption', '(Dex at the parapet with the envelope in both hands, looking down at the city like it is a long way to fall. He knows the footsteps. He has known them since Jay was twelve.)'],
        ['dex', '(not turning) How long have you been there?'],
        ['jay', '“Four minutes late, Calloway.”'],
        ['dex', '(a sound like a laugh with the bottom kicked out of it) The whole thing, then.'],
        ['caption', '(Jay doesn\'t shout. He lays it out the way Augie laid out napkins on a bar table: one at a time, in order, load-bearing.)'],
        ['jay', 'Hi, Hector.'],
        ['dex', "(He shuts his eyes.) There's no Hector. There's never been a Hector. My landlord's the bank. The same bank that took the garage off my dad."],
        ['jay', 'Parking appeal.'],
        ['dex', "First of every month. He parked right out front so the whole of Anchor Street could see a cruiser in my lot. He liked that. He liked people seeing."],
        ['jay', 'Room twelve.'],
        ['dex', "He knew the day you got off the coach. He wanted to know if you'd come back for the money. (beat) Birdie doesn't have a cousin. I don't know why I said cousin."],
        ['jay', "It's an investment."],
        ['dex', "(That one lands.) Four years ago. I'm running parts for the docks. Horne pulls me over on Southshore with a converter on the seat, wrapped in Birdie's octopus towel."],
        ['dex', "He doesn't cuff me. He gets in, sits on the towel. “How old's your little girl, Dexter?” Four. “Six years for this. Foster care's a lottery. I've seen the lottery.”"],
        ['dex', "Then he says, “Or.” He gives me a name like a joke. LUGNUT. He laughed when he said it. Like we were in a club."],
        ['dex', "First envelope was four thousand. I sat in the truck outside a diner for an hour looking at it. Then I drove to the supplier and put it down on the lift."],
        ['dex', "I've been paying for that lift every day for four years. I can't even look at it. I park the truck so I don't have to see it from the office."],
        ['dex', "Two piles of dirty money in that garage, Jay. Yours sat in a toolbox three years and I never touched a dollar. His I bolted to the floor."],
        ['jay', 'Tidewater.'],
        ['dex', "Augie comes in for a gearbox and says, “Two cars that don't exist, Dexter, September the thirtieth.” And I knew Horne would ask. He always asks who's driving."],
        ['dex', "I held out a week. I want you to know that. A week. Birdie thought I had the flu."],
        ['dex', "He said arrests at the gate. Nobody armed. Augie does his three years, I keep my kid. He said it like he was reading a menu."],
        ['dex', '(quietly) He said nobody would get hurt, Jay. He promised me. I believed a cop, like an idiot.'],
        ['jay', '(the first thing he has said that isn\'t a quotation) Tommy was nineteen.'],
        ['dex', "I know how old Tommy was. I bought him his first beer. I taught him a tyre change in the rain and he cried because he got grease on the hoodie."],
        ['jay', 'How was the recital?'],
        ['dex', "(a long time) Birdie doesn't dance. She'd bite a tap teacher. I was in Horne's car on level four of this building while you robbed Pelican. He wanted to know who drove."],
        ['dex', "I told him you'd gone to the beach. That one I didn't give him. Two hours lying to his face for you. Put that on whatever list you're keeping."],
        ['jay', 'Birdie\'s sticker.'],
        ['dex', "She wears it every day. Junior deputy. On her strap. How do I take it off her, Jay? What do I tell her it's for?"],
        ['jay', 'Augie asked you to cut a key.'],
        ['dex', "(the words coming out of him like teeth) “Anything, Aug. Name it.” I cut it perfect. I cut it perfect so at least one part of it would be right. Then I rang him."],
        ['jay', '“How well do we know her, really?”'],
        ['dex', '(nothing; then, to the concrete) Yeah. I did that too.'],
        ['jay', 'Crane Row.'],
        ['dex', "I told him. He laughed. “That's a canary, Calloway. The old man's testing his birds. Stay home.” So I stayed home. Two beers in the fridge. And Augie gets out of your car and says—"],
        ['jay', '“See? Waited up. That\'s a crew.”'],
        ['dex', "(and there it goes; the whole size of him gives at once) He was so happy. He wanted my couch. I gave him the good blanket and sat in the office till it got light."],
        ['dex', "Pier 9 I said no. I said I'm out. And he put a photo on my dashboard. The yellow gate. Three-fifteen. Birdie in her coat with the ears on, holding Pat's hand at the crossing."],
        ['dex', "He didn't say anything. He tapped his watch. So I gave him two-ten, and bay fourteen, and who'd be in the car, and where Rhea's rifles were going to be."],
        ['dex', "Then I said I'd wait at the garage with the second car. And I did. Engine running till four in the morning. Like that made me still on the crew."],
        ['jay', '“Bring him back.”'],
        ['dex', "(and that is the one that breaks him in half) I meant it. I'd already sold him, and I meant it. How is that both? How is a man both?"],
        ['caption', '(Jay looks at him for a long time. He opens his mouth.)'],
        ['caption', '(Headlights swing up across the pillars from the ramp below. Engines. Two of them, coming up the spiral fast, with no siren.)'],
      ] },
      halberdSuv('cleaner_a', 'parkade_ramp'),
      halberdSuv('cleaner_b', 'parkade_ramp'),
      { spawn: [
        // They arrive cocky: they came for one unarmed mechanic, not for Jay.
        { id: 'cleaner', faction: 'halberd', at: 'cleaner_a', count: 3, weapon: 'smg', behavior: 'attack', accuracy: 0.3, group: 'cleaners' },
        { id: 'sweeper', faction: 'halberd', at: 'cleaner_b', count: 2, weapon: 'pistol', behavior: 'guard', accuracy: 0.35, group: 'cleaners' },
      ] },
      { music: 'action' },
      { kill: 'group:cleaners', checkpoint: true, objective: "Halberd's come to tidy Horne's informant away. Don't let them.", say: [
        ['dex', "(looking at the keys on the Halcyon's roof, then at the envelope, understanding all at once) He left his car. And it's all here. He never gives me all of it."],
        ['dex', 'He says it keeps you coming back.'],
        ['jay', "(pulling the pistol at last) Not if you're not coming back. Get down."],
        ['dex', '(flat behind the beige Halcyon, hands over his head) I don\'t have a gun! I have a tyre gauge! Jay, I have a tyre gauge!'],
        ['caption', '(A Halberd man calls across the deck, bored, like a bailiff: “Mr. Calloway. Captain Horne sends his thanks for your service.”)'],
        ['dex', '(yelling back, from the floor) Tell him to fudge himself! (beat, horrified) Shit. Fudge. I said fudge. Birdie\'s not even HERE.'],
      ] },
      { music: 'tension' },
      { say: [
        ['caption', '(Quiet, but for a car alarm and a dead man\'s radio asking for a status. Dex takes a pistol off the nearest body, the way you\'d pick up a fish you weren\'t sure was dead.)'],
        ['caption', '(Jay unbuckles a vest off another one and puts it on without looking at the face. Dex watches him do it.)'],
        ['dex', '(very quietly) You used to throw up after jobs.'],
        ['jay', 'I still do. Later.'],
      ] },
      { reward: { armor: 60 } },
      { join: ['dex'], weapon: 'pistol' },
      { scene: { at: 'dex', cast: ['dex'] }, say: [
        ['dex', "(breathing hard) They'll send more. He always sends more. He told me once, “Never send what you need, Dexter. Send twice what you need.” He was talking about flowers for his wife."],
        ['dex', "Jay. You've been reading me my own words all night like a charge sheet. Say something that's yours. Please."],
        ['jay', '(and it comes, finally, low and level, the way he drives) Three years I hauled lettuce at the speed limit.'],
        ['jay', "Every night a different motel, light on, and I'd do the same thing. I'd count who was left. Mae hates me. Lourdes forgives me, which is worse. Augie's inside because of me."],
        ['jay', "And then I'd get to you. Dex stayed. Dex is home, changing Lulu's oil, picking Birdie up at the gate. Somebody in that city is all right."],
        ['jay', 'I always counted you last. So I could get to sleep.'],
        ['dex', '(very quietly) Jay—'],
        ['jay', "You let me think it was me. Three years. You sat in my car once a week with the engine off and you let me think I left him there."],
        ['jay', "Scared, I get. For Birdie I'd have— (He stops. He doesn't know the end of that sentence, and it frightens him.) I don't know what I'd have done."],
        ['jay', "But you let me carry it. You had the receipt bolted to your floor, and you let me carry it. And you let Augie walk into that lot thinking you were the one who waited up."],
        ['dex', '(nodding, and nodding, like a man pleading guilty to every count at once) Yeah. Yeah.'],
        ['dex', '(More headlights swing up through the pillars. He doesn\'t look at them. He looks at Jay.) Whatever it is. Say it now. I\'ll do it.'],
      ] },
      { choice: { prompt: 'Your oldest friend. Tommy. Augie. Birdie, asleep under a pink night light. Decide.', options: [
        { label: 'Get in the car, Dex.', flag: 'dex_forgiven', then: [
          { say: [
            ['jay', 'Get in the car, Dex.'],
            ['dex', '(not understanding it) What?'],
            ['jay', 'Lulu. Two levels down. Get in the car.'],
            ['dex', "After what I— Jay, you can't just—"],
            ['jay', "It's not okay. It's never going to be okay. Get in the car anyway."],
            ['dex', '(something goes out of him, or into him) ...Okay.'],
          ] },
          ...WAVE_TWO,
          { kill: 'group:cleaners2', objective: 'Hold the deck with Dex. Then get to Lulu.', say: [
            ['dex', '(firing with his eyes screwed shut) Shit. Shit! I hit a pillar. Sorry, pillar.'],
            ['dex', '(firing again, worse) How do you do this? How do you do this and then go home and eat cereal?'],
            ['jay', "(dropping one by the pay machine) I don't eat cereal."],
            ['dex', "You should! It's fortified!"],
          ] },
          { getIn: 'lulu', objective: 'Down two levels to Lulu. Dex rides with you.', say: [
            ['caption', '(Dex drops into the passenger seat. Before Jay can say it, there is a click.)'],
            ['dex', '(his belt already done, not looking at him) I know. I know.'],
            ['caption', "(Augie's words, in Augie's rhythm. Neither of them says so.)"],
          ] },
          { heat: 3 },
          { loseHeat: true, objective: 'Down the spiral. Lose Southside.', say: [
            ['caption', '(Southside cruisers at the foot of the ramp already, lights going, because of course they are.)'],
            ['dex', "(leaning out with the dead man's pistol) Am I shooting at cops? Is that who I am now? Is this a thing I do?"],
            ['jay', 'Tyres.'],
            ['dex', "(as Lulu takes the last of the spiral sideways) JESUS— (beat) She's never done that for me."],
            ['jay', "She never liked you that much."],
          ] },
          { setTime: 0.7 },
          { music: 'sad' },
          { goto: 'kostas_salvage', vehicle: 'lulu', objective: 'Take Dex to Kostas Salvage. Rhea has a back room.', say: [
            ['caption', '(Neither of them says anything all the way down Southshore.)'],
            ['caption', "(Dex's hand goes to the radio out of habit, eighty-eight point one, Augie's station, and stops an inch from the dial, and goes back to his knee.)"],
            ['caption', "(At a red light by the fish market Dex winds his window down, holds Horne's envelope out into the dark, and lets go. The money goes down Southshore like a flock of something.)"],
            ['caption', '(Jay watches it go in the mirror. He doesn\'t say anything about it. He doesn\'t wait for the green.)'],
            ['caption', '(Saltmarsh. The cranes. Neither of them looks at the Pier 9 gate as it goes by. Both of them see it.)'],
            ['dex', '(eventually, to the window) Birdie\'s got a spelling test Thursday.'],
            ['jay', '(a long beat) What words?'],
            ['dex', 'Necessary. Rhythm. Separate. The ones nobody can spell.'],
            ['jay', 'Nobody can spell separate.'],
            ['dex', '(something that starts as a laugh and doesn\'t finish) She can.'],
          ] },
          { say: [
            ['caption', '(Kostas Marine Salvage. A light on behind the half-shut door.)'],
          ] },
          { scene: { at: 'kostas_salvage', cast: ['dex', 'rhea'] }, say: [
            ['caption', '(Kostas Marine Salvage, past midnight. The doors rolled half down. Rhea at her pallet desk, writing in pencil, exactly as if it were noon.)'],
            ['rhea', '(not looking up) Calloway. You sweat more than you used to.'],
            ['dex', "(a long beat) It's humid."],
            ['rhea', "It's humid for everybody. (She puts the pencil down. To Jay.) So. It was him."],
            ['jay', 'It was him.'],
            ['rhea', '(She looks at Dex for a long time, the way she looks at a hull for rust.) Everyone in this port has sold something.'],
            ['dex', 'I sold Augie.'],
            ['rhea', "Yes. (back to her ledger) You sleep in the back, behind the propellers. Don't sit on the rudder."],
            ['dex', '(to Jay, at the half-shut door, the question he has carried down seven levels) Why?'],
            ['jay', '(a long time) You waited up for him. Two beers. In your socks.'],
            ['caption', '(Dex makes a sound and puts his hand over his mouth.)'],
            ['jay', "That was real too. I'm keeping the real one."],
          ] },
          { leave: ['dex', 'rhea'] },
          { phone: 'ansel', say: [
            ['ansel', "(asleep, and then not) Jay. It's past one. The tomatoes are asleep."],
            ['jay', 'I need you to stand in a doorway.'],
            ['ansel', '(instantly, completely awake) Which one?'],
            ['jay', "Calloway Auto. Birdie's upstairs with Rafi. Nobody goes in. Nobody."],
            ['ansel', '(a pause) Is it Dex?'],
            ['jay', 'Yeah.'],
            ['ansel', "(a long breath, like a man setting something heavy down very gently) I'll bring a chair. And a blanket for the boy. (beat) Are you all right?"],
            ['jay', 'Ask me tomorrow.'],
          ] },
        ] },
        { label: 'Take Birdie and get out of Vicehaven. Tonight.', flag: 'dex_banished', then: [
          { say: [
            ['jay', 'Take Birdie and get out of Vicehaven. Tonight.'],
            ['dex', '(as if he hasn\'t heard it properly) Tonight.'],
            ['jay', "Tonight. Don't go home for clothes. Go home for Birdie."],
            ['dex', 'The garage. Jay, the garage is— my dad—'],
            ['jay', "Your dad lost a garage. Don't make her lose a dad."],
            ['dex', '(a long, terrible beat) Where do I go?'],
            ['jay', "North. I'll tell you how. Get to your truck. I'll keep them busy."],
          ] },
          { leave: ['dex'] },
          { spawn: [{ id: 'dex_wheel', at: 'dex_tow', behavior: 'drive', car: 'dex_tow', to: 'dex_garage', hostile: false }] },
          ...WAVE_TWO,
          { survive: 40, objective: "Hold the deck. Give Dex's tow truck a head start.", waves: [
            { at: 'parkade_ramp', count: 3, weapon: 'smg', faction: 'halberd', delay: 14 },
            { at: 'parkade_ramp', count: 2, weapon: 'rifle', faction: 'halberd', delay: 28 },
          ], say: [
            ['dex', "(on the phone, the tow truck's engine roaring under him) I'm out. I'm on the ramp. I'm— Jay, I'm out."],
            ['jay', "(behind a pillar, reloading) Don't stop for lights."],
            ['dex', '(on the phone) I always stop for lights!'],
            ['jay', 'Not tonight.'],
          ] },
          { getIn: 'lulu', objective: 'Down two levels to Lulu' },
          { heat: 3 },
          { loseHeat: true, objective: 'Down the spiral. Lose Southside.', say: [
            ['jay', '(to the car, as the cruisers come up the ramp to meet him) Hold on. Hold on, Lulu. I know you liked him.'],
            ['jay', '(through the barrier arm, clean) He changed your oil. I know. I know he did.'],
          ] },
          { setTime: 0.9 },
          { music: 'sad' },
          { goto: 'dex_garage', vehicle: 'lulu', objective: 'Calloway Auto. Make sure he goes.', say: [
            ['dex', '(on the phone, low, a zip being done up somewhere) She woke up. She asked if we\'re going on holiday. I said yes.'],
            ['dex', '(beat) Where are we going on holiday, Jay?'],
            ['jay', 'Somewhere with snow.'],
            ['dex', "She's never seen snow. She thinks it's a thing they make up for films."],
            ['jay', "Then it's a holiday."],
            ['dex', '(away from the phone, gentle, a voice Jay has never heard him use on a car) Arms up, Bird. Other arm. That\'s it.'],
          ] },
          { say: [
            ['caption', '(Anchor Street at one in the morning. Every light in Calloway Auto is on, for the first time in years, as if the building wants a good look at him.)'],
          ] },
          { scene: { at: 'dex_garage', cast: ['dex', 'rafi'] }, say: [
            ['caption', '(The roll-up is open. The lift stands in the middle of the shop, steel and spotless, the only thing in the place anybody ever kept perfect.)'],
            ['caption', '(The tow truck idles in the lot. Birdie is asleep across the front seat in pyjamas and her coat with the ears on, a spark plug in her fist.)'],
            ['rafi', '(seventeen, holding a bin bag of clothes, terrified) He said pack for cold. I don\'t know what cold is. I packed every jumper in the building.'],
            ['dex', '(standing in front of the lift with his reading glasses on their cord) I should take a picture. Who takes a picture of a lift.'],
            ['jay', "Cypress Parkway, north. Slow lane. Speed limit the whole way, even when it's empty. Especially when it's empty. Nobody looks twice at a man doing the speed limit."],
            ['jay', "Motels that take cash, with letters missing off the sign. Never the same one twice in a month. Don't call anybody on a Sunday. You'll want to. Don't."],
            ['dex', "(very quietly) That's how you did it."],
            ['jay', "Three years. I'm the best in the world at it."],
            ['dex', '(holding out a ring of keys) Garage. Office. The lift. Rafi, they\'re yours.'],
            ['rafi', "I can't afford a lift."],
            ['dex', "Nobody can. That's how they get you."],
            ['jay', '(watching Birdie through the windscreen) My dad drove off when I was six. Long-haul. I don\'t remember his face. I remember his taillights.'],
            ['jay', "Wherever you end up. Whatever happens up there. You don't drive off without her. You don't ever leave her in a lot."],
            ['dex', '(looking at the small shape asleep in the cab) Never.'],
            ['dex', 'Is there a version of this where I come back?'],
            ['jay', '(a long time) Ten and two, Dex.'],
            ['dex', '(Everybody on Anchor Street knew the rest. Nana Lu used to shout it after Jay down the whole length of the street.) ...Heart at twelve.'],
            ['jay', 'Point it at her.'],
            ['dex', '(climbing into the cab and cracking his head on the frame) Fudge. (Birdie stirs. He freezes. She doesn\'t wake.) ...Fudging fudge.'],
          ] },
          { leave: ['dex', 'rafi'] },
          { spawn: [{ id: 'dex_north', at: 'dex_tow', behavior: 'drive', car: 'dex_tow', to: 'downtown', hostile: false }] },
          { camera: 'dex_garage', seconds: 8, say: [
            ['caption', '(The mustard tow truck pulls out of the lot, indicates for an empty street, and turns north at exactly the speed limit.)'],
          ] },
          { say: [
            ['caption', '(Jay stands in the lot and watches the taillights all the way to the end of Anchor Street.)'],
            ['caption', '(The last time he stood and watched a pair of taillights to the end of a street, he was six, and he waited on the kerb till Nana Lu came out and carried him in.)'],
            ['caption', '(Nobody comes out. He waits anyway.)'],
          ] },
        ] },
        { label: "You're going to tell Calder everything. On the record.", flag: 'dex_to_calder', then: [
          { say: [
            ['jay', "You're going to tell Calder everything. On the record."],
            ['jay', 'Every envelope. Every date. Every word he ever said to you in that car. Your name at the bottom.'],
            ['dex', "They'll take Birdie."],
            ['jay', "They'll take you. Birdie goes to Mae."],
            ['dex', '(beat) Mae.'],
            ['jay', 'You gave Horne Tidewater. Now you give Calder Horne.'],
            ['dex', '(a long breath, then one nod, like a man signing something) Okay.'],
          ] },
          ...WAVE_TWO,
          { kill: 'group:cleaners2', objective: 'Hold the deck with Dex. Keep your witness breathing.', say: [
            ['dex', "(firing wide, with feeling) That's for the towel! That was a good towel!"],
            ['jay', 'Head down.'],
            ['dex', "(head down) I'm a witness now! Witnesses don't get shot! That's the whole deal!"],
          ] },
          { getIn: 'lulu', objective: 'Down two levels to Lulu. Your witness rides with you.' },
          { heat: 3 },
          { loseHeat: true, objective: 'Down the spiral. Lose Southside.', say: [
            ['dex', "(clutching the dashboard as the cruisers come up the ramp) They're Southside. They're his. Jay, they're all his."],
            ['jay', 'Not all of them. Hold on.'],
          ] },
          { setTime: 0.9 },
          { music: 'sad' },
          { phone: 'calder', objective: 'Call Calder', say: [
            ['calder', '(on the first ring, wary) Mercer.'],
            ['jay', "I'm bringing you LUGNUT. He wants to talk. On the record."],
            ['calder', "(a very long pause) ...I'll be on the bench out front. Don't come round the back. Southside parks round the back."],
          ] },
          { if: 'nightshift_done', then: [maeCall(MAE_CALL_NEW_PARTNER)], else: [maeCall(MAE_CALL_GUS)] },
          { say: [
            ['caption', '(Outside the precinct. The engine ticking as it cools. Neither of them reaches for the door.)'],
            ['dex', '(after a long time, to the window) What do I tell her? When I call.'],
            ['jay', 'The truth.'],
            ['dex', "She's eight."],
            ['jay', "Then the eight-year-old version. Her dad did a bad thing, and now he's telling the truth about it."],
            ['dex', "(beat) That's the grown-up version too."],
            ['jay', "Turns out there's only one."],
          ] },
          { if: 'trusted_calder', then: [
            { scene: { at: 'vpd_central', cast: ['calder', 'dex'] }, say: [
              ['caption', '(VPD Central, past one. The crooked flagpole. The bench for the families who wait. Calder is on it with an empty cup. Her car is across two spaces.)'],
              ['calder', "(standing, the empty cup in her hand) Eleven o'clock I give you a parts account. One in the morning you bring me the parts."],
              ['calder', "Ray Okonkwo waited six years for somebody to walk up these steps with one of Horne's. I'm going to ring him after. He'll pretend he was asleep."],
            ] },
          ], else: [
            { scene: { at: 'vpd_central', cast: ['calder', 'dex'] }, say: [
              ['caption', '(VPD Central, past one. The crooked flagpole. The bench for the families who wait. Calder is on it with an empty cup. Her car is across two spaces.)'],
              ['calder', "(not getting up) You didn't trust me last week."],
              ['jay', "I don't trust me this week."],
              ['calder', "(She looks at him over the empty cup, and decides that's an answer.) Fair."],
            ] },
          ] },
          { scene: { at: 'vpd_central', cast: ['calder', 'dex'] }, say: [
            ['calder', '(to Dex) Mr. Calloway.'],
            ['dex', "Detective. (beat, helplessly, because it's who he is) Your alternator's going again. I heard you pull in from two streets away."],
            ['calder', '(over her shoulder, to the car) Traitor.'],
            ['calder', "Here's how it goes. You talk, I write. Every envelope, every date, every word. You sign it. Then you live in a hotel with very small soap until a judge is ready for you."],
            ['dex', 'Do I go to prison?'],
            ['calder', 'Probably. Less, if you\'re useful. Be very useful, Mr. Calloway. Be the most useful man I ever met.'],
            ['dex', "(to Jay) He's got a phone. Not his department one. A cheap black one. He rang me on it. He keeps it in the cruiser."],
            ['calder', '(very still) Where in the cruiser?'],
            ['dex', "Inside. I'll draw you a picture. I'm good at cars."],
            ['dex', "(at the door, turning back) Jay. Tell Birdie— (He can't find the end of it.)"],
            ['jay', "I'll tell her you're telling the truth to a lady with a grey stripe in her hair."],
            ['calder', '(touching the stripe without meaning to) It\'s distinguished.'],
          ] },
          { leave: ['calder', 'dex'] },
          { say: [
            ['caption', '(The precinct door swings shut behind them. Jay sits down on the bench for the families who wait. He has never been one of them before.)'],
          ] },
        ] },
      ] } },
      ...CODA,
    ],
  });
})();
