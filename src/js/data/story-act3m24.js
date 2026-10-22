/*
 * data/story-act3m24.js — m24 THE NOTEBOOK, the end of Act 3 of "Ten and Two".
 *
 * The night after the fire, at Kostas Salvage. Jay has read ninety-five
 * pages of Augie's notebook and not the last one ("Don't read it here.
 * You'll do the face."). He reads it. Augie's last page is a plan: when
 * Harlan gets scared he moves the book, and when he moves it, it's a
 * Tidewater. Hit it on the move. Jay calls the crew together and plans a
 * job for the first time in his life (a nine-second speech). Noor knows
 * when, Rhea knows where, and they need three cars by midnight: Big Otto's
 * tow truck, a grey van off Halberd's own lot, and Councilman Pruitt's black
 * Vireo, which comes with a Halberd alarm. The plan goes down on Lulu's
 * bonnet in nuts, dominoes and a seed packet, and Jay names the job.
 *
 * Flags read: saved_teo / chased_rourke, dex_forgiven / dex_banished /
 * dex_to_calder.
 *
 * Continuity: the notebook is the marbled exercise book with Celia's hair
 * elastic (m23); page forty-one is Rhea (m25); there is a page on making a
 * Halberd van think it has a flat (m23). Rhea's containers are left for
 * tomorrow, in daylight (m25). The convoy stays unconfirmed until Horne's
 * phone (m26): here it is only a green corridor on Southshore from 22:45 to
 * 23:30 on the eleventh, and an empty freighter that paid its berth early.
 *
 * Invented here that later acts may lean on: the stolen cars are Big Otto's
 * yellow tow hauler (Ansel's in m29), a grey Porter off the Halberd depot
 * lot ("the after": Augie's "nobody ever plans for the after") and Pruitt's
 * black Vireo ("the second car"; Dex's, with dex_forgiven). Rule three in
 * the notebook, NOBODY FIRES A SHOT, has a new pencil line through it. Jay's
 * plan is written inside the back cover, because Augie used every page:
 * TIDEWATER, and a rule three of his own. Noor's recordings live in a pencil
 * case with cartoon cats on it. Sami Haddad stacks soup at a Voss Value Mart
 * on Cypress, in a tabard. Voss rang Pruitt at 2 a.m. to ask whether he had
 * ever photocopied anything. The Halberd gate guard at the depot is Curtis;
 * his mother grows tomatoes in buckets.
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const SALTS_RUST = 0xc4561d;
  const TOW_YELLOW = 0xe0a81a;
  const DEPOT_GREY = 0x8c8f93;
  const PRUITT_BLACK = 0x121216;

  const steps = [];

  // ================================================================ the last page
  steps.push(
    // Rhea takes the keys tonight: nobody steals three cars in a car with a face.
    { spawnCar: 'lulu', type: 'lowrider', at: 'kostas_salvage', color: LULU_TEAL, locked: true, watch: false },
    { spawnCar: 'rhea_mesa', type: 'mesa', at: 'kostas_salvage', offset: [10, 4], color: SALTS_RUST },
    { spawn: [
      { char: 'noor', at: 'kostas_salvage', offset: [-2.4, 1.2], behavior: 'idle', health: 3000 },
      { char: 'ansel', at: 'kostas_salvage', offset: [2.6, 1.0], behavior: 'idle', health: 3000 },
      { char: 'rhea', at: 'kostas_salvage', offset: [0.6, -2.4], behavior: 'idle', health: 3000 },
      { char: 'deb', at: 'kostas_salvage', offset: [4.2, -1.6], behavior: 'idle', health: 3000 },
    ] },
    { music: 'off' },
    { camera: 'kostas_salvage', seconds: 11, say: [
      ['caption', '(Kostas Salvage, the night after the fire. A string of bulbs between two propellers, and under it, everything the crew still owns.)'],
      ['caption', "(Noor's laptop on a pallet. Ansel in a deckchair, both hands bandaged white, being fed noodles by Deb, who did not ask him if he wanted noodles.)"],
    ] },
    { if: 'dex_forgiven', then: [
      { say: [
        ['caption', '(In the lifeboat full of pigeons, Birdie asleep with a black neon L in her arms. Her father on an oil drum ten metres off, where nobody has to look at him.)'],
      ] },
    ], else: [
      { if: 'dex_banished', then: [
        { say: [
          ['caption', "(Lulu by the dock, nose out. This morning he changed her oil. Synthetic, not the cheap stuff. He didn't think about who told him to. He thought about nothing else.)"],
        ] },
      ], else: [
        { say: [
          ['caption', '(Birdie is at Casa Palma tonight with Mae and eleven cats. She rang at seven to say she is drawing Mr. Augie a better horse. The legs are hard.)'],
        ] },
      ] },
    ] },
    { say: [
      ['caption', "(On Rhea's pallet desk: a marbled exercise book with a woman's hair elastic round it. It has sat there shut for a day. He has read every page but one.)"],
    ] },
  );

  // Somebody hands it to him, open at the back.
  steps.push(
    { if: 'saved_teo', then: [
      { scene: { at: 'kostas_salvage', cast: ['teo'] }, say: [
        ['caption', "(Teo comes in off the quay with two cartons from the noodle cart and Celia's watch loose on his wrist. He puts one in front of Jay. He looks at the book.)"],
        ['teo', "You haven't read it."],
        ['jay', "I've read it."],
        ['teo', "You've read ninety-five pages. Rhea says you sit there with your thumb in the back cover like it's a hot pan."],
        ['teo', "(sliding the elastic off, the way you'd take a ring off somebody's finger) Mum's. She tied her hair up with these to sing at the sink. He kept a drawer of them."],
        ['teo', "(opening it at the back, holding it out) Here. I'll mind the noodles. You do the face. The one he did the morning you brought his car back."],
        ['teo', "I was fourteen. I was in the window. (beat) Go on. I've done mine."],
      ] },
    ], else: [
      { scene: { at: 'kostas_salvage', cast: ['rhea'] }, say: [
        ['caption', "(Rhea crosses the warehouse with her ledger. At her own desk she slides Celia's elastic off with one thumb, opens the book at the back, and turns it to face him.)"],
        ['rhea', "That's my desk. I charge rent on desks. (beat) Read the page or pay the rent."],
        ['caption', '(She keeps walking. Advice, at Kostas Salvage, is extra.)'],
      ] },
    ] },
    { music: 'sad' },
    { blackout: [
      ['caption', '(Inside the front cover, in pencil: IF FOUND, RETURN TO A. VANCE. REWARD: ADVICE.)'],
      ['augie', 'Rule one. Plans fail.'],
      ['augie', "Rule two. People don't have to."],
      ['augie', 'Rule three. Nobody fires a shot. See rules one and two.'],
      ['caption', '(Rule three has a line through it. One line, neat, done with a ruler. The pencil is new.)'],
      ['caption', '(Page thirty. Ten years ago. A sketch of a long, low teal car, and under it:)'],
      ['augie', 'Kid stole my car. Brought it back. Full tank, seat pulled right, mirrors set for a man six inches shorter. Hire him before somebody worse does.'],
      ['caption', '(Page fifty-eight. TIDEWATER, timed to the second. In the margin, in another pencil, three years later, from a cell:)'],
      ['augie', "J asked me to take the Reyes boy. I said no once. I should have said it louder. That's mine. Not his. Mine."],
      ['caption', '(Page ninety-six. The last. Dated the twenty-eighth, the night he wrote out his funeral. He made lists when he was frightened.)'],
      ['augie', "Kid. If you're reading this, Teo gave it to you. So I'm gone, and he's talking to you. One out of two. I'll take it."],
      ['augie', "If I'm gone, Harlan has his book back, and he won't sleep. He'll lie awake wondering who read it. Who copied it."],
      ['augie', 'And when Harlan gets scared, he moves the book. He wants it on water. Somewhere the city can\'t reach.'],
      ['augie', "That's what Tidewater was, kid. We thought we were robbing a cash van. We were robbing a frightened man on his way to the sea."],
      ['augie', "He'll do it again. Armoured. Halberd. Three vehicles, Crestline to the port. It'll be a Tidewater. With him it always is."],
      ['augie', "Don't go in the house. Never go in the house. Hit it on the move. On the road it belongs to nobody, and then it belongs to you."],
      ['augie', "You drive. You plan. You're better than me at both now. Nobody's told you. So I'm telling you."],
      ['augie', "P.S. When you've learned it, give it back to Teo. There's no room left in it. He'll want it anyway."],
    ] },
    { music: 'off' },
    { if: 'saved_teo', then: [
      { scene: { at: 'kostas_salvage', cast: ['teo'] }, say: [
        ['teo', '(watching him close it and sit with both hands flat on the cover, the way you hold something down in a wind) There it is. That exact face.'],
        ['jay', "(holding the book out to him) It's yours. He says so. Last line."],
        ['teo', "After. It says after. (He pushes it back with one painted knuckle.) He never once let me see a plan before a job. Don't you start."],
        ['teo', "(picking up his chopsticks) So. What's the job?"],
        ['jay', '(looking out through the doors, at the hill, at a line of big white houses lit up like a liner) Get everybody up.'],
      ] },
    ], else: [
      { say: [
        ['caption', "(He reads the P.S. three times. Then he photographs it and sends it to a number that hasn't answered him since the funeral. Delivered. Not read.)"],
        ['jay', '(not loud) Rhea. Get everybody up.'],
        ['rhea', "(from across the warehouse) Everybody is up. It's eight o'clock at night. You're the one who's been asleep."],
      ] },
    ] },
  );

  // ================================================================ the napkins
  const PLAN_OPEN = [
    ['caption', '(On the dock outside the doors, beside Lulu. Four paper napkins from the noodle cart, in a row on an upturned fish crate. Everybody is looking at the napkins.)'],
    ['rhea', 'What are the napkins?'],
    ['jay', 'Augie did napkins.'],
    ['ansel', "(kindly) He didn't know what they were either, half the time. He talked at them until they were something."],
    ['caption', '(He takes a breath. He has never done this. Everybody on the dock knows it, and they are all very carefully not helping.)'],
    ['jay', 'Voss is going to move the book. Like Tidewater. On the road. We take it off him on the road.'],
    ['caption', '(That is the whole speech. Out on the water, a bell buoy, twice.)'],
    ['noor', "That was nine seconds. I timed it. Augie's had an interval."],
    ['rhea', 'When?'],
    ['jay', "I don't know."],
    ['rhea', 'Where?'],
    ['jay', "I don't know that either."],
    ['rhea', "(to the others) He's going to be very good at this."],
    ['noor', '(small, hugging the laptop) I know when. Yesterday Voss Meridian uploaded a new signal plan. GALA TRAFFIC MANAGEMENT. The eleventh.'],
    ['noor', 'Every light on Southshore on manual priority, quarter to eleven till half past. Nobody drives to a party down Southshore. It only comes here.'],
    ['rhea', "(the pencil coming out from behind her ear) And I know where. Somebody's booked my best berth on Crane Row for the eleventh. Sails at first light."],
    ['rhea', 'The manifest says ballast. Nobody pays my fees to carry nothing across an ocean. (beat) And they paid early. In thirty years, nobody has paid me early.'],
    ['jay', "He's scared."],
    ['rhea', "He's in a hurry. On a man like that it looks the same."],
    ['noor', '(out of her deepest pocket: a pencil case with cartoon cats on it; out of that, a cheap grey recorder) Two years of Signal Office meetings. Four hundred and twelve hours.'],
    ['noor', "Voss's people teaching my boss to make forty million dollars look like a traffic system. On its own, it's a grudge. With the Tally, it's a noose."],
    ['rhea', 'Why tell us now?'],
    ['noor', "(turning the little recorder over) I've carried it on my own for two years. It's very heavy for a pencil case."],
    ['jay', "(to the crate; it's easier than to them) You don't have to be in. Any of you. It's not Augie asking."],
    ['noor', "My dad was a pharmacist for thirty-one years. Now he stacks soup at the Voss Value Mart, in a tabard. He says it's very breathable. (beat) I'm in for the tabard."],
    ['ansel', '(looking at his white hands) I stood in a door yesterday. It was the right door. I would like to stand up once more somewhere it counts.'],
    ['rhea', "I'm not family. I do invoices. If that ship sails with his book, the vote passes, and in the spring a fund in Rotterdam buys my port. I'm in for the port."],
    ['rhea', '(beat) My cranes are another conversation. Come and see me tomorrow, in daylight. I\'ll tell you what they cost.'],
  ];
  const PLAN_WHY_TEO = [
    ['teo', "(turning Celia's watch round on his wrist) Lantern Alley is page eleven of the Renewal. And somebody should mark your homework. I'm in."],
    ['teo', "Give me a time and I'll give you a riot. Forty Kings on Tannery Row. Small. Tasteful. Half of Halberd goes across town to look at it."],
  ];
  const PLAN_WHY_PHONE = [
    ['noor', '(showing him her phone) I told Teo there was a job. He sent a thumbs-down. Then he deleted it. Then he sent it again.'],
    ['caption', "(She puts a black phone in a cracked case on the crate. Rourke's. The one Jay picked at the top of the Crown, instead of a man.)"],
    ['noor', "(carefully) So let's make it worth it. Every Halberd van has a kill switch, and the codes are on here. He was going to stop one with a nail. I've got an app."],
  ];
  const PLAN_CLOSE = [
    ['rhea', 'And you, Mercer? What are you in for?'],
    ['jay', '(a long look up at the hill) I drove away once.'],
    ['jay', "Three cars, tonight. Big Otto's tow truck. A grey van off Halberd's own lot. And Councilman Pruitt's black Vireo, which belongs on the hill."],
    ['noor', "(opening the laptop right on top of the napkins) I'll do the lights. Oh, I'll do the lights. I've wanted to do the lights all week."],
    ['rhea', "(palm up) Keys. Hers. Every Southside cop in the city stared at that car outside a funeral. You don't steal cars in a car with a face. Take my pickup."],
    ['caption', "(He looks at the hand. He looks at Lulu. Then he puts Nana Lu's keys in Rhea Kostas's palm, which he did not know he was able to do.)"],
    ['jay', '(over his shoulder, to the car) Be good.'],
    ['rhea', "(pocketing them) She'll be very good. She's with a responsible adult."],
  ];

  steps.push(
    { if: 'saved_teo', then: [
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'noor', 'ansel', 'teo'] }, say: PLAN_OPEN.concat(PLAN_WHY_TEO, PLAN_CLOSE) },
    ], else: [
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'noor', 'ansel'] }, say: PLAN_OPEN.concat(PLAN_WHY_PHONE, PLAN_CLOSE) },
    ] },
  );

  // ================================================================ car one: Big Otto's
  steps.push(
    { leave: ['ansel'] },
    { spawnCar: 'otto_tow', type: 'hauler', at: 'market_scrapyard', color: TOW_YELLOW },
    { spawn: [{ char: 'otto', at: 'market_scrapyard', offset: [3, -3], behavior: 'idle', health: 3000 }] },
    { music: 'tension' },
    { getIn: 'rhea_mesa', checkpoint: true, objective: "Take Rhea's pickup. Second gear sticks.", say: [
      ['ansel', "(walking off up the quay, hands held out in front of him like a man carrying something hot) I'll go ahead to the depot. Everything sounds like a whale at night."],
    ] },
    { phone: 'noor', say: [
      ['noor', "Okay. I'm on the lights. I'm at Rhea's desk with four screens and Deb, and Deb is reading over my shoulder and breathing."],
      ['deb', "(in the background) I'm not breathing."],
      ['noor', "Big Otto's. The tow truck's the yellow one under the magnet crane. He leaves the keys in it. It says so on his website."],
      ['jay', 'Otto has a website?'],
      ['noor', "One page. It's a photo of his dog. Duchess. She's mostly retired. (beat) Jay? Augie told everybody one seventh of every plan. I know the whole of this one."],
      ['jay', "It's three cars."],
      ['noor', "It's three cars and I know what they're FOR. Shut up. Let me have it. (beat) That grinding is second gear. Be firm with it."],
    ] },
    { goto: 'market_scrapyard', vehicle: true, radius: 24, objective: "Big Otto's scrapyard. Park outside the gate.", say: [
      ['jay', '(wrestling the gearstick) Come on. Second. You know second. Everybody knows second.'],
      ['caption', '(The pickup finds second the way a dog finds a ball: eventually, and very pleased with itself.)'],
      ['jay', "(to the pickup) Stavros. I never met you. But your truck's a liar."],
    ] },
    { goto: 'market_scrapyard', vehicle: false, radius: 6, objective: 'On foot into the yard. Mind the dog.' },
    { scene: { at: 'market_scrapyard', cast: ['otto'] }, say: [
      ['caption', "(Wrecks stacked four high, the magnet crane asleep over them like a heron. A yellow tow truck. A deckchair. Big Otto in a dressing gown, and a dog shaped like a cushion.)"],
      ['otto', "(not turning his head) If you're here for the truck, the keys are in it. It's on my website."],
      ['jay', "I'm here for the truck."],
      ['otto', "(now he turns) ...Mercer. Lucinda's boy. (beat) Augie's boy."],
      ['otto', 'The day you nicked his car, ten years back, he came in here at nine in the morning to buy another one. Picked it out. Shook my hand on it.'],
      ['otto', 'Then you brought his back with a full tank and he rang me and cancelled. (beat) Cost me a sale.'],
      ['jay', 'Sorry.'],
      ['otto', 'He told that story at every wake in Old Market for ten years. Same jokes every time. Full tank. Seat pulled right.'],
      ['jay', 'Mirrors set for a man six inches shorter.'],
      ['otto', "(a slow nod) That's the one. (back to the radio) I'm reporting it stolen at nine tomorrow. Insurance pays me, you bring it back, I sell it twice."],
      ['otto', '(beat) Bring it back with a full tank.'],
      ['caption', '(Duchess, without opening her eyes, thumps her tail once on the concrete. It is the most exercise she has taken this year.)'],
    ] },
    { getIn: 'otto_tow', objective: 'Get in the tow truck' },
    { deliver: 'otto_tow', to: 'kostas_salvage', timeLimit: 210, maxDamage: 0.45, objective: "Get Otto's tow truck to Kostas Salvage. Noor has the lights.", say: [
      ['noor', "(on the radio) I see you. You're the yellow blob. Market Avenue, all green. Don't stop, don't think. Just take what I give you."],
      ['jay', "(to the truck, feeling the weight of it through the wheel) Easy. You're on loan. Mostly."],
      ['noor', '(on the radio) Did you just talk to the tow truck?'],
      ['jay', "It's a big truck. It needs to know where it stands."],
      ['noor', "(on the radio) Augie said you talk to cars because you don't talk to people. I said you talk to me. He said, “Noor, you're a car with a laptop.”"],
      ['noor', "(on the radio, quieter) Southshore, Jay. Four lanes and nothing on them, all the way to the water. That's the road. On the eleventh it's green end to end."],
      ['jay', '(very quietly, looking down the length of it) I see it.'],
    ] },
    { if: 'dex_forgiven', then: [
      { scene: { at: 'otto_tow', cast: ['dex', 'noor'] }, say: [
        ['caption', '(Dex is off his oil drum before the truck has stopped. He walks round it once, the way he walks round every car, and lays a palm on the bonnet to feel it tick.)'],
        ['dex', "Otto's old Hauler. Clutch is cooked. Ten minutes and a cable tie and she'd— (He sees the faces on the dock and takes his hand away.) If anybody wanted. I'm not asking."],
        ['noor', "(crossing the dock with a thick sheaf of paper) On the way to the fire I said I'd say a lot of things to you, in order. There'd be a document. It's later."],
        ['caption', '(Forty pages. Coloured tabs down the side.)'],
        ['noor', "Tab one is everything I'm angry about. Tab two is everything I'm angry about but understand. Tab three is the clutch."],
        ['caption', "(Dex sits on the step of Otto's truck with forty pages on his knees and starts at tab one. He doesn't skip to the clutch. Noor sees that he doesn't.)"],
      ] },
    ], else: [
      { say: [
        ['rhea', "(from the doors, not looking up from her ledger) That's Otto's truck. He'll report it stolen at nine tomorrow and claim it twice."],
        ['jay', 'He told you?'],
        ['rhea', "He tells everybody. It's on his website."],
      ] },
    ] },
  );

  // ================================================================ car two: Halberd's own lot
  steps.push(
    { spawnCar: 'grey_porter', type: 'porter', at: 'halberd_depot', offset: [10, 8], color: DEPOT_GREY, checkpoint: true },
    { spawn: [
      { char: 'ansel', at: 'halberd_depot', offset: [-5, -4], behavior: 'idle', health: 3000 },
      { id: 'curtis', char: 'halberd_guard', at: 'halberd_depot', offset: [-4, -2.5], behavior: 'idle', hostile: false, health: 3000 },
      { id: 'depot_watch', faction: 'halberd', at: 'halberd_depot', offset: [14, 12], count: 2, weapon: 'smg', behavior: 'patrol', group: 'depot' },
    ] },
    { phone: 'noor', say: [
      ['noor', "Car two. The depot. Cameras on everything that holds still. There's a grey Porter at the back of the lot, the only thing there without an axe painted on it."],
      ['noor', "The floodlights are on the same circuit as the street lights on Harbor Road. Which is my circuit. I can give you twenty seconds of dark."],
      ['jay', 'And the gate?'],
      ['noor', "(a pause, as if she is looking at something she doesn't understand) Ansel's at the gate. He's... I think he's gardening?"],
    ] },
    { goto: 'halberd_depot', radius: 34, objective: "The Halberd depot. Ansel's at the gate. Don't walk up to it." },
    { camera: 'halberd_depot', seconds: 9, say: [
      ['caption', '(The depot gate. A boom barrier, a booth, and a dead municipal planter with a crisp packet in it. In front of it, on one knee, a trowel in a bandaged hand: Ansel.)'],
      ['halberd_guard', "Sir. Sir. You can't do that there. It's Halberd property."],
      ['ansel', "(not stopping) It was dead. Somebody had to. (beat) The dirt isn't anybody's, son. Dirt's only visiting."],
    ] },
    { goto: 'grey_porter', vehicle: false, radius: 4, objective: 'Round the back, through the dark, to the grey van. Stay low.', say: [
      ['halberd_guard', '(off, at the gate) What happened to your hands?'],
      ['ansel', "(off) A door. A very good door. (holding up a seedling) Marigold. Keeps the aphids off. What's your name, son?"],
      ['halberd_guard', '(despite himself) ...Curtis.'],
      ['ansel', 'Curtis. Does your mother garden, Curtis?'],
      ['halberd_guard', 'Tomatoes. On the balcony. In buckets.'],
      ['ansel', 'Buckets are good. Tell me about the buckets.'],
      ['noor', '(on the radio) Floodlights. Three. Two. Go.'],
      ['caption', "(Every floodlight in the depot goes out at once. Curtis doesn't notice. Curtis is telling a stranger about his mother's buckets.)"],
    ] },
    { getIn: 'grey_porter', objective: 'Get in the grey van' },
    { goto: 'ansel', vehicle: 'grey_porter', radius: 9, objective: 'Out through the gate. Pick Ansel up on the way.', say: [
      ['halberd_guard', "(the van rolling past the booth, lights off) Hey. HEY. That's one of ours—"],
      ['ansel', "(standing up, slowly, all of him, between Curtis and the van) Let it go, Curtis. It's only a van. You don't want to learn what I already know."],
      ['halberd_guard', '(very still) ...What do you know?'],
      ['ansel', '(opening the passenger door) Water them in the morning, not at night. And ring your mother.'],
    ] },
    { join: ['ansel'], weapon: 'fists' },
    { deliver: 'grey_porter', to: 'kostas_salvage', timeLimit: 120, maxDamage: 0.4, objective: 'Get the grey van back to Kostas Salvage before the depot wakes up.', say: [
      ['ansel', '(the belt clicking home before Jay can open his mouth; holding the buckle up to show him) I know. I know.'],
      ['jay', '(a beat too long) ...That was his.'],
      ['ansel', "I know. Somebody should keep saying it, so it doesn't go to waste. (beat) What's the van for? You said grey. You didn't say for."],
      ['jay', "After. When it works, you can't drive round the docks all night in a Halberd van full of money. You need something boring to put it in."],
      ['jay', 'He always said nobody plans for the after.'],
      ['ansel', '(looking at him a long time, the white hands loose in his lap) You\'re planning for the after.'],
      ['jay', "Don't make it a thing."],
      ['ansel', "(to the window, enormously pleased) I won't make it a thing."],
    ] },
    { leave: ['ansel'] },
  );

  // ================================================================ car three: Pruitt's drive
  steps.push(
    { spawnCar: 'pruitt_vireo', type: 'vireo', at: 'pruitt_house', color: PRUITT_BLACK, checkpoint: true },
    { spawn: [{ char: 'pruitt', at: 'pruitt_house', offset: [3, 2.5], behavior: 'idle', health: 3000 }] },
    { if: 'saved_teo', then: [
      { phone: 'teo', say: [
        ['teo', "It's Vance. Rhea gave me your keys to mind. She said if I start it she'll sell me to a Greek. (beat) I'm just sitting in it. It still smells like him."],
        ['teo', '(quieter) Rule three. With the line through. Did you see it?'],
        ['jay', 'I saw it.'],
        ['teo', 'He knew. Pier 9. He knew what it was, and he went anyway.'],
        ['jay', '(a long time) He planned for Voss.'],
        ['teo', "Yeah. (beat) So plan for Voss better than he did. That's all I'm asking. Go and rob a councilman."],
      ] },
    ], else: [
      { text: 'teo', message: 'i read it twice. i thought the ps was him being tidy' },
      { wait: 2.5 },
      { text: 'teo', message: "he wasn't being tidy was he" },
    ] },
    { goto: 'pruitt_house', vehicle: true, radius: 30, objective: "Up to Crestline. Steal something forgettable to get there. Not Lulu: Rhea has the keys.", say: [
      ['noor', "(on the radio) Pruitt's Vireo is black and new, and it cost more than my father's shop. He bought it the week after the Phase One vote. I checked."],
      ['noor', "(on the radio) It's on a Halberd alarm. If it goes off it doesn't ring the police. It rings Halberd. Then Halberd rings the police."],
      ['jay', "So don't set it off."],
      ['noor', "(on the radio) So don't set it off. I can't do alarms. I do lights. Lights and petty revenge."],
    ] },
    { goto: 'pruitt_house', vehicle: false, radius: 7, objective: 'On foot up the drive to the black Vireo.' },
    { scene: { at: 'pruitt_house', cast: ['pruitt'] }, say: [
      ['caption', "(A black Vireo in the drive with the stars in it. On the plinth of a bronze statue of his own dog, in a bathrobe, with a tub of ice cream: Councilman Pruitt.)"],
      ['pruitt', "(the spoon stopping) I know you. You're the valet. You parked Mrs. Whitcombe's poodle."],
      ['pruitt', '(putting the ice cream down very carefully, as if it might go off) Are you here to park something?'],
      ['jay', 'Other way round.'],
      ['pruitt', "(looking at the Vireo, then at Jay, and doing a sum) It's the book. Isn't it. Everybody's saying. Somebody had the book, and somebody read it."],
      ['pruitt', "(sweating straight through the towelling) I'm in it. Of course I'm in it. How many pages?"],
      ['jay', 'Six.'],
      ['pruitt', 'SIX? (beat) Well. It was a long career.'],
      ['pruitt', "Harlan rang me at two o'clock this morning. Harlan Voss has never rung anybody at two in the morning in his life. He asked if I'd ever photocopied anything."],
      ['pruitt', "I don't know HOW. I have an aide for that! (holding out a key fob in a hand that won't keep still) Take it. Tell them, after, that Delmar Pruitt cooperated."],
      ['jay', "(taking it) I'll tell them."],
      ['pruitt', "(sinking back beside the bronze dog) It's on a Halberd alarm. Nobody ever tells me the code to anything. (beat) Mind the fountain. Everybody hits the fountain."],
    ] },
    { getIn: 'pruitt_vireo', objective: "Get in Pruitt's Vireo" },
    { music: 'action' },
    { heat: 2, say: [
      ['caption', "(The door shuts. Every light on the Vireo flashes, and a calm woman's voice in the dashboard says: THIS VEHICLE IS PROTECTED BY HALBERD. PLEASE REMAIN WHERE YOU ARE.)"],
      ['jay', '(to the dashboard) No.'],
    ] },
    { spawnCar: 'alarm_suv_a', type: 'ironclad', at: 'pruitt_house', offset: [26, 4], color: HALBERD, watch: false },
    { spawnCar: 'alarm_suv_b', type: 'ironclad', at: 'pruitt_house', offset: [-26, -4], color: HALBERD, watch: false },
    { spawn: [
      { id: 'alarm_a', faction: 'halberd', at: 'alarm_suv_a', offset: [2, 1.5], count: 2, weapon: 'smg', behavior: 'attack', group: 'alarm' },
      { id: 'alarm_b', faction: 'halberd', at: 'alarm_suv_b', offset: [-2, 1.5], count: 2, weapon: 'pistol', behavior: 'attack', group: 'alarm' },
    ] },
    { loseHeat: true, objective: 'Halberd at both ends of the drive, Southside on the way. Get off the hill and lose them. Keep the Vireo pretty.', say: [
      ['noor', "(on the radio) That's the alarm, isn't it. I can hear it from here. I can hear it on the POLICE BAND."],
      ['DISPATCH', '(on the police band) All Southside units, stolen vehicle, Crestline, black Vireo, private alarm. Owner states the suspect was... polite?'],
      ['noor', '(on the radio) Every light down Crestline is green for you and red for them. Go down that hill like you mean it.'],
      ['jay', 'I always mean it.'],
      ['noor', '(on the radio) Then mean it MORE. Shit, shit, shitting— left. LEFT. Not that left. ANY left!'],
    ] },
    { music: 'tension' },
    { if: 'chased_rourke', then: [
      { text: 'teo', message: "do the job. then give it back. that's his deal not mine" },
    ] },
    { deliver: 'pruitt_vireo', to: 'kostas_salvage', timeLimit: 300, maxDamage: 0.6, objective: "Pruitt's Vireo. Down to Kostas Salvage in one piece.", say: [
      ['caption', "(The Vireo smells of new leather and a great deal of Councilman Pruitt's cologne. On the passenger seat, a dog bed embroidered with a name: BISCUIT.)"],
      ['jay', "(to the car, the dock lights coming up ahead) You're not going back. Sorry. You're the second car now."],
      ['jay', "(beat) Second car's the important one. It's the one that's there when the first one isn't."],
      ['noor', '(on the radio, softer) Jay? On the eleventh. Who\'s in the second car?'],
      ['caption', '(He drives a long block without answering.)'],
      ['jay', "I'll know when I put the key down."],
    ] },
  );

  // ================================================================ the bonnet
  const BONNET_OPEN = [
    ['caption', '(Near midnight. Three stolen cars in a row on the dock: a yellow tow truck, a grey van, a black Vireo with a dog bed in it. And Lulu, nose out.)'],
    ['rhea', "(dropping Nana Lu's keys on Lulu's bonnet with a clink) Your car. She behaved. Unlike some people."],
    ['caption', "(No napkins this time. He empties his pockets onto the teal bonnet, and Rhea's floor, and Rhea's desk, and moves things about until they are something.)"],
    ['jay', "(three rusty hex nuts in a line, a brass shell case out in front) Three vans down off the hill at eleven. Up front, a cop who taps his watch."],
    ['jay', "(Noor's orange highlighter, laid across the line) Meridian. You split them. The front one goes on alone."],
    ['jay', "(three dominoes off Rhea's desk, end to end across the bonnet) Southshore. A wall. However you do it."],
    ['jay', "(Ansel's seed packet, propped behind the last nut) The tow truck shuts the back door. Nobody leaves the way they came in."],
    ['ansel', "(reading the packet: SUNFLOWER, GIANT RUSSIAN) That's me?"],
    ['jay', "That's you standing up. In a truck."],
    ['ansel', "(very quietly) I'd like that."],
  ];
  const BONNET_TEO = [
    ['teo', '(dropping one gold shoelace on the far side of the bonnet, nowhere near the others) Tannery Row. Forty Kings and a riot. Half of Halberd looking the wrong way.'],
  ];
  const BONNET_PHONE = [
    ['noor', "(setting Rourke's phone face down on the middle nut) And the middle van stops dead when I say. With his own codes. (beat) The phone you picked."],
    ['caption', '(Nobody puts anything on the far side of the bonnet, where Lantern Alley would be. He leaves the space there anyway.)'],
  ];
  const SECOND_CAR = [
    ['jay', "(the Vireo's key fob, on its own, in the middle of everything) Second car."],
  ];
  const SECOND_DEX = [
    ['caption', "(Nobody speaks. Last time there was a second car, Dex Calloway sat in it outside his own garage with the engine running until four in the morning.)"],
    ['jay', '(sliding the fob across the bonnet, past the nuts, past the dominoes, all the way to the edge) Dex.'],
    ['dex', "(not touching it) Last time I had the second car, I sat in it till four."],
    ['jay', 'I know.'],
    ['dex', "(a long time; then he picks it up in both hands, the way Birdie holds things) ...Clutch on that one's fine. I checked. (beat) I'll be early."],
  ];
  const SECOND_SPARE_BANISHED = [
    ['caption', "(He leaves the fob in the middle of the bonnet, with nobody's name on it.)"],
    ['jay', 'Spare. (beat) Birdie says every car needs a spare.'],
    ['caption', '(Somewhere a long way north, in the snow, a mustard tow truck. Nobody says it. Everybody thinks it.)'],
  ];
  const SECOND_SPARE_CALDER = [
    ['caption', "(He leaves the fob in the middle of the bonnet, with nobody's name on it. For a second he thinks about who used to cut his keys.)"],
    ['jay', 'Spare. In case.'],
  ];
  const BONNET_CLOSE = [
    ['ansel', '(pointing one bandaged finger at an empty patch of teal between the tow truck and the vans) There\'s a space.'],
    ['jay', "It's for somebody who hasn't said yes."],
    ['caption', '(Nobody asks who. Everybody knows who. Ansel smiles at the space as if something might come up in it.)'],
    ['jay', "(Lulu's keys, last of all, at the very back) And me. Behind them all the way down the hill. Nobody looks twice at an old car."],
    ['noor', "(staring at the bonnet, slowly) Jay. Armoured vans. Halberd. The hill to the port. Night. A cop. (beat) That's Tidewater. It's the same job."],
    ['jay', 'Same job. Same driver.'],
    ['caption', '(He looks along the bonnet at all of it. At the space.)'],
    ['jay', 'Different ending.'],
    ['noor', '(a very small voice) Do you want the number? My model. I ran it.'],
    ['jay', 'No.'],
    ['noor', "Good. (beat) I deleted it. I'm not doing numbers on people any more."],
    ['rhea', "Augie named every job. The Long Lunch. Celia's Birthday. The Bishop's Umbrella, which nobody discusses. (beat) What's this one called?"],
    ['jay', 'Tidewater.'],
    ['caption', '(Nobody says anything for a while. Out on the water, the bell buoy, twice.)'],
    ['rhea', '(a single nod, the way she signs for a cargo) Good. Take the name back as well.'],
  ];
  const BONNET_TEO_END = [
    ['teo', "(winding Celia's watch, three turns, the way his father showed him in the back of this car) Five days."],
  ];

  const bonnetScene = (cast, middle, second, end) => ({
    scene: { at: 'lulu', cast },
    say: BONNET_OPEN.concat(middle, SECOND_CAR, second, BONNET_CLOSE, end || []),
  });

  steps.push(
    { music: 'off' },
    { say: [
      ['caption', "(Rhea's dock. He kills the engine. Three cars in. Nobody followed him home.)"],
    ] },
    { music: 'hope' },
    { if: 'dex_forgiven', then: [
      { if: 'saved_teo', then: [
        bonnetScene(['rhea', 'noor', 'ansel', 'teo', 'dex'], BONNET_TEO, SECOND_DEX, BONNET_TEO_END),
      ], else: [
        bonnetScene(['rhea', 'noor', 'ansel', 'dex'], BONNET_PHONE, SECOND_DEX),
      ] },
    ], else: [
      { if: 'dex_banished', then: [
        { if: 'saved_teo', then: [
          bonnetScene(['rhea', 'noor', 'ansel', 'teo'], BONNET_TEO, SECOND_SPARE_BANISHED, BONNET_TEO_END),
        ], else: [
          bonnetScene(['rhea', 'noor', 'ansel'], BONNET_PHONE, SECOND_SPARE_BANISHED),
        ] },
      ], else: [
        { if: 'saved_teo', then: [
          bonnetScene(['rhea', 'noor', 'ansel', 'teo'], BONNET_TEO, SECOND_SPARE_CALDER, BONNET_TEO_END),
        ], else: [
          bonnetScene(['rhea', 'noor', 'ansel'], BONNET_PHONE, SECOND_SPARE_CALDER),
        ] },
      ] },
    ] },
    { if: 'chased_rourke', then: [
      { text: 'teo', message: 'noor says you named it' },
      { wait: 3 },
      { text: 'teo', message: 'good name. still not for you' },
    ] },
    { fade: 'out' },
    { blackout: [
      ['caption', '(Later. The bulbs off. Everybody asleep among the propellers, except the one who never sleeps before a job.)'],
      ['caption', "(Augie used every page. So he writes inside the back cover, small, in pencil, in the capitals a school-bus driver taught him at her kitchen table.)"],
      ['caption', 'TIDEWATER.'],
      ['caption', 'RULE 1. PLANS FAIL.'],
      ['caption', "RULE 2. PEOPLE DON'T HAVE TO."],
      ['caption', "(He stops. He looks for a long time at the line through Augie's rule three. Then he writes his own.)"],
      ['caption', 'RULE 3. NOBODY GETS LEFT IN THE LOT.'],
      ['caption', '(And underneath, smaller, where Augie would have put it:)'],
      ['caption', 'P.S. SEATBELTS.'],
      ['caption', 'Five days.'],
    ] },
    { fade: 'in' },
  );

  S.missions.push({
    id: 'm24_the_notebook',
    act: 3,
    title: 'The Notebook',
    giver: 'jay',
    start: 'kostas_salvage',
    time: 20,
    estMinutes: 10,
    summary: "Augie's last page is a plan. Jay plans a job for the first time, and steals three cars to start it.",
    reward: { money: 10000 },
    failIf: ['wrecked:lulu'],
    steps,
  });
})();
