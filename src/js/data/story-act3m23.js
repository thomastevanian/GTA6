/*
 * data/story-act3m23.js — m23 ASHES, Act 3 of "Ten and Two".
 *
 * Friday, three days after the parkade. They bury Augie beside Celia at
 * St. Brigid's, in the vault that kept his money for three years. He planned
 * his own funeral like a job (numbered, short, no begats). Teo hands Jay the
 * notebook; Jay hands Teo the library book full of parking tickets. Voss
 * sends lilies at five. At six his arsonists burn Calloway Auto to the
 * ground, and Ansel stands in the doorway and keeps standing up.
 *
 * Flags read: dex_forgiven / dex_banished / dex_to_calder, saved_teo /
 * chased_rourke, kept_cut / gave_cut, trusted_calder / refused_calder.
 *
 * Invented here that later acts may lean on: Augie left numbered funeral
 * instructions dated the 28th; item six is held back by Ilunga (it is the
 * “he was proud” text that arrives after this mission). Teo knocked the
 * angel's nose off with half a brick at Celia's funeral, aged twelve, and
 * Ilunga never had it mended. Celia's stone reads BELOVED. SHE SANG; Augie's
 * plate reads HE PLANNED. Voss's lilies went on Mr. Feeney's grave. Augie's
 * notebook is a marbled school exercise book held shut with Celia's hair
 * elastic; the library book is GREAT BRIDGES OF THE WORLD, eleven years
 * overdue, a parking ticket with one of Teo's drawings between every page.
 * Friday is bike day at Calloway Auto (Dex never charged the Anchor Street
 * kids). The Southside cruisers watched the fire with their lights off.
 * Ansel's palms are burned and bandaged from here on. The CALLOWAY AUTO sign
 * came down in the fire; with dex_forgiven Birdie keeps the dead neon L.
 *
 * Engine notes: Ansel, Birdie and Rafi walk out of the churchyard (leave) and
 * the arrival scene at the garage brings them back, so nobody is ever in two
 * places and no stray copies are left behind.
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  const LULU_TEAL = 0x1f6f6a;
  const HALBERD = 0x3a3f45;
  const CALDER_GREEN = 0x2f4a3a;
  const SALTS_RUST = 0xc4561d;

  const lulu = (at) => ({ spawnCar: 'lulu', type: 'lowrider', at, color: LULU_TEAL });

  // Two Anchor Street kids who come to Calloway Auto on Fridays with their bikes.
  Object.assign(S.characters, {
    kid_ola: {
      name: 'Ola Bankole', role: 'Anchor Street kid, bike-day regular', age: 9,
      look: { skin: 0x4e2c1c, hair: 0x101010, top: 0x6fbf73, bottom: 0x2e3f5c, shoes: 0xefefef, build: 'slim', height: 0.62, longHair: true },
      voice: { gender: 'female', pitch: 1.4, rate: 1.12 },
      bio: 'Has brought the same bike with no front wheel to Calloway Auto every Friday since June. It is a long-term project.',
    },
    kid_jojo: {
      name: 'Jojo Marsh', role: 'Anchor Street kid', age: 7,
      look: { skin: 0xd8a47e, hair: 0x6e4a2c, top: 0x2c7bb6, bottom: 0x3a3a3a, shoes: 0xd9d9d9, build: 'slim', height: 0.56 },
      voice: { gender: 'male', pitch: 1.4, rate: 1.15 },
      bio: 'Ola\'s shadow. Rings his bell at everything.',
    },
  });

  const steps = [];

  // ================================================================ THE CHURCHYARD
  steps.push(
    lulu('st_brigid_church'),
    { spawn: [{ char: 'ilunga', at: 'st_brigid_church', behavior: 'idle' }] },
    { music: 'off' },
    { text: 'teo', message: "5pm. Don't be early, he'd think you were up to something. Don't be late. Just be normal for once." },
    { blackout: [
      ['caption', 'St. Brigid of the Market. Friday. 4:31 p.m.'],
      ['caption', '(Twenty-nine minutes early. He has never been early for anything in his life. Augie used to tell him half five so he would come at six.)'],
      ['caption', "(On Lulu's passenger seat, belted in, a brown paper bag folded over at the top. Everything Augie Vance owned, collected off the arm of Dex's couch.)"],
    ] },
    { scene: { at: 'st_brigid_church', cast: ['ilunga'] }, say: [
      ['caption', '(The churchyard in the white heat of the afternoon. The angel with no nose. The Vance vault stands open, and a new brass plate leans against its step, waiting.)'],
      ['ilunga', "(not turning from his watering can) You're early, Mr. Mercer."],
      ['jay', "He used to tell me half five so I'd come at six."],
      ['ilunga', '(taking a folded sheet from inside his cassock) He left instructions. Of course he did. Dated the twenty-eighth.'],
      ['jay', '(very still) Two days before.'],
      ['ilunga', "“In the event.” Numbered. He planned his own funeral like a bank. (glasses on the end of his nose) “One. Short. No begats.”"],
      ['ilunga', "“Two. Teo talks if he wants to. Nobody makes him. Three. Nobody sings. Nobody here can sing, and Celia will laugh.”"],
      ['ilunga', "“Five. The wake is at the Last Resort. Rhea brings a bottle. Do not let Rhea bring the bottle.”"],
      ['jay', "(looking at the neat pencil numbers) There's always an after."],
      ['ilunga', 'Nobody ever plans for the after. Yes. He said it to me too, in that exact voice, over my stew, which he hated.'],
      ['ilunga', "There's a sixth item. (He folds the page away before Jay can see it.) It isn't for now. He was very particular about the order."],
      ['ilunga', "Twelve years he paid me two hundred dollars a year for the upkeep of that vault. I've chosen to believe it was love letters. Very heavy ones. Two bags."],
      ['jay', "(a breath out that is nearly a laugh) That's close enough."],
      ['ilunga', "(touching the angel's chipped face) Teo did that. Twelve years old, at his mother's funeral, with half a brick. His father wasn't here. Somebody had to hit something."],
      ['ilunga', 'I never had it mended. Some things you leave the way grief left them.'],
    ] },
  );

  // ================================================================ THE MOURNERS
  // Everyone is placed before the camera finds them, so no scene below
  // conjures anybody out of thin air.
  steps.push(
    { spawnCar: 'south_1', type: 'interceptor', at: 'st_brigid_church', offset: [18, 9], watch: false, police: true },
    { spawnCar: 'south_2', type: 'interceptor', at: 'st_brigid_church', offset: [18, 15], watch: false, police: true },
    { spawnCar: 'calder_car', type: 'unmarked', at: 'st_brigid_church', offset: [18, 21], color: CALDER_GREEN, watch: false },
    { spawn: [
      { char: 'teo', at: 'st_brigid_church', offset: [2.2, 1.4], behavior: 'idle' },
      { char: 'lourdes', at: 'st_brigid_church', offset: [-2.0, 1.6], behavior: 'idle' },
      { char: 'mae', at: 'st_brigid_church', offset: [-1.2, 2.8], behavior: 'idle' },
      { char: 'noor', at: 'st_brigid_church', offset: [-3.2, -0.6], behavior: 'idle' },
      { char: 'ansel', at: 'st_brigid_church', offset: [3.4, -0.8], behavior: 'idle', health: 3000 },
      { char: 'rhea', at: 'st_brigid_church', offset: [1.0, -2.6], behavior: 'idle' },
      { id: 'king', faction: 'kings', at: 'st_brigid_church', offset: [9, 6], count: 5, behavior: 'idle', hostile: false },
      { id: 'south_cop', char: 'cop', at: 'south_1', offset: [2.2, 0], behavior: 'idle' },
      { char: 'calder', at: 'calder_car', offset: [2.2, 0], behavior: 'idle' },
    ] },
    { if: 'dex_forgiven', then: [
      { spawn: [
        { char: 'dex', at: 'st_brigid_church', offset: [11, -6], behavior: 'idle' },
        { char: 'birdie', at: 'st_brigid_church', offset: [10, -4.5], behavior: 'idle', health: 3000 },
      ] },
    ], else: [
      { if: 'dex_banished', then: [
        { spawn: [{ char: 'rafi', at: 'st_brigid_church', offset: [6, -4], behavior: 'idle', health: 3000 }] },
      ], else: [
        { spawn: [{ char: 'birdie', at: 'st_brigid_church', offset: [-0.4, 3.4], behavior: 'idle' }] },
      ] },
    ] },
    { camera: 'st_brigid_church', seconds: 12, say: [
      ['caption', '(They come in ones and twos. Lourdes with a covered dish nobody asked for. Noor in a black windbreaker. Ansel in a suit that fit him once, with zinnias in a coffee tin.)'],
      ['caption', '(Rhea in clean overalls, which is how you know. Five Lantern Kings at the gate in borrowed ties. And Teo, last, alone, walking up the middle of the road like he dares it.)'],
      ['caption', '(Across the road, under the jacaranda, two Southside cruisers park nose to tail. Nobody gets out. A sign in the windscreen says, in marker: TRAFFIC MANAGEMENT.)'],
      ['caption', '(Then a florist\'s van, and a wreath of white lilies the size of a tractor tyre. The card says WITH DEEPEST SYMPATHY. H.V. The handwriting is lovely.)'],
    ] },
    { if: 'dex_forgiven', then: [
      { camera: 'dex', seconds: 6, say: [
        ['caption', "(By the gate, under the bougainvillea where nobody else is standing: Dex, in the funeral suit. The tight one, bought for his father's.)"],
        ['caption', "(He comes no closer than Mr. Feeney's stone. Birdie holds his hand a while, then lets go of it and walks up the path on her own.)"],
      ] },
    ], else: [
      { if: 'dex_banished', then: [
        { camera: 'rafi', seconds: 5, say: [
          ['caption', "(By the gate, in a black suit so big that the shoulders have their own weather: Rafi Duarte. It's Dex's funeral suit. The trousers are taken up with staples.)"],
        ] },
      ], else: [
        { camera: 'birdie', seconds: 5, say: [
          ['caption', "(Mae came up the path holding Birdie Calloway's hand. On the strap of Birdie's overalls, still, a gold sticker: VPD JUNIOR DEPUTY. Nobody knows how to take it off her.)"],
        ] },
      ] },
    ] },
    { goto: 'st_brigid_church', vehicle: false, radius: 4, objective: 'Take your place by the vault' },
    { scene: { at: 'st_brigid_church', cast: ['teo', 'rhea', 'ilunga', 'lourdes'] }, say: [
      ['teo', '(looking at the lilies propped against the vault) He sent flowers.'],
      ['rhea', 'He sends flowers to everything. He sent me flowers when his crane killed my husband. Same card. Same handwriting.'],
      ['teo', "(hauling the wreath up in both arms) I'm throwing it in the road."],
      ['ilunga', '(mildly, not looking up from his book) Mr. Feeney never gets flowers.'],
      ['teo', '...What?'],
      ['ilunga', 'Second row. The one with the hearse carved on it. Forty years he drove the dead about and never once got a lily. Mr. Mercer parked on him.'],
      ['jay', 'I apologised.'],
      ['ilunga', 'He accepted. (beat) Put it on Mr. Feeney, Teo. Let Harlan Voss do one kind thing by accident.'],
      ['caption', "(Teo carries the lilies to the second row, lays them on the hearse driver's grave quite gently, and comes back wiping his hands on his jeans.)"],
      ['lourdes', "(looking across the road at the cruisers) They came to Tommy's too. Two cars. Same tree."],
      ['caption', "(Jay wasn't at Tommy's. He was two days gone. Lourdes says it like weather, which is worse.)"],
      ['lourdes', "I took them coffee then. (unscrewing a thermos) I'm taking them coffee now. A man can drink my coffee and know what he is. That's between him and the coffee."],
      ['caption', "(The first cruiser's window comes down an inch. A young officer takes a cup and can't look at her.)"],
      ['cop', "(through the inch of window) We're just here to keep the peace, ma'am."],
      ['lourdes', "Then keep it, sweetheart. It's very quiet. (She stands there until he looks at her.) Drink your coffee."],
      ['rhea', '(arms folded) That woman should run the port.'],
    ] },
    { camera: 'calder', seconds: 5, say: [
      ['caption', "(Behind the cruisers, a green sedan parked so close the second one can't open his door. Calder leans on its roof with an empty cup, watching them. Not the funeral. Them.)"],
    ] },
    { if: 'trusted_calder', then: [
      { text: 'calder', message: "I'm not here. Nobody's here. I'm watching the people watching you. Take your time." },
    ], else: [
      { text: 'calder', message: "Officially I'm not speaking to you. Unofficially I'm parked behind them, very close. Take your time." },
    ] },
  );

  // ================================================================ THE SERVICE
  const SERVICE = [
    ['ilunga', 'Augustine Vance asked me to keep this short. In thirty years he never asked anybody for anything short. Not a story, not a speech, and, I gather, not a sentence.'],
    ['ilunga', "So, one thing, and then I'll stop, because he's listening and he's timing me. When Celia died he was in county on thirty days. They wouldn't let him out for the funeral."],
    ['ilunga', "He rang the church from the payphone. I passed the receiver out of the vestry window and held it over the grave. Forty minutes. He didn't say a word. He listened to us bury her."],
    ['teo', "(very quietly, to the dirt) ...I didn't know that."],
    ['ilunga', 'You were twelve, Teo. You were busy with a brick.'],
    ['ilunga', "(closing the book) Today, for the first time in his life, he's early. I think he'd like that noted."],
    ['ilunga', '(holding out the little silver trowel) First earth is family.'],
    ['caption', '(He holds it out between the two of them, Teo and Jay, and does not choose. He has buried a lot of men. He knows better.)'],
    ['teo', '(taking it) ...Yeah.'],
    ['caption', '(Red Old Market dirt on a plain pine lid, beside a stone that reads CELIA VANCE. BELOVED. SHE SANG.)'],
    ['teo', "(holding the trowel out to Jay without looking at him) Him too. (beat) Don't make it weird."],
    ['caption', '(Jay takes it. He holds the handful a second too long, the way he did for Nana Lu. Then he lets it go.)'],
  ];
  const SERVICE_HAND = [
    ['caption', "(Somewhere in the middle of it, Mae's hand finds his. She doesn't look at him. She doesn't let go until the dirt is done.)"],
  ];

  const EULOGY = [
    ['caption', '(Teo stands at the head of the grave, hands in his bomber pockets. At the gate the Kings take their caps off at the same moment, like they rehearsed it. They rehearsed it.)'],
    ['teo', "I'm not doing a speech. He did speeches. You'd ask him the time and get twenty minutes on the history of watches."],
    ['teo', "When Mum died I stood about there. Twelve. And I kept looking at that gate. I thought, he'll come in hot, park on Mr. Feeney, say something stupid, and everyone'll forgive him."],
    ['teo', "He didn't come. So I looked at that gate for twelve years. (a laugh with no floor in it) Turns out he was on the phone. Course he was on the phone."],
    ['teo', 'He came in the end. He just came the long way round. He always took the long way. He said it was so he could think. It was so he could talk.'],
  ];
  const EULOGY_SAVED = [
    ['teo', "I was in the back seat. Of her. (a nod at Lulu, at the kerb) I had his hand. He said he was a bad father."],
    ['teo', "I said he was fine. (beat) He was a terrible father, and he was fine. He used to say both things can be true. He said he contained multitudes. Mostly he contained sandwiches."],
    ['caption', "(It goes round the grave, the helpless laugh that only happens at funerals. Lourdes laughs into a tissue. Rhea looks hard at the sky.)"],
    ['teo', "(taking a school exercise book from his jacket: marbled cover, held shut with a woman's hair elastic) County gave me his things. Thirty years of plans. Every job, every rule."],
    ['teo', "There's a page on making a Halberd van think it's got a flat. There's a page on Birdie's card tells. She hasn't got any."],
    ['teo', '(holding it out to Jay) He left you the plans. He left me the watch.'],
    ['caption', "(Celia's watch, on Teo's wrist. Steel, the cracked strap on its last hole, too big for him. It has never lost a second.)"],
    ['teo', "I think that's the right way round. (beat) Last page is you. Don't read it here. You'll do the face."],
  ];
  const EULOGY_CHASED = [
    ['teo', "I wasn't in the car. I was in Wick's nan's kitchen getting my eyebrow glued back on, because somebody picked a phone."],
    ['teo', "(pulling a school exercise book from his jacket: marbled cover, held shut with a woman's hair elastic) County gave me his things. Thirty years of plans. Every job. Every rule."],
    ['teo', "I read it twice. There's not one page in it about me."],
    ['caption', '(He throws it. Not hard. Hard enough. It hits Jay in the chest and he catches it against himself, the way you catch a thing you were always going to be handed.)'],
    ['teo', 'Take it. You were always his favourite plan.'],
    ['jay', '(holding it; quietly, because he promised) He told me to tell you something. At the end. In the car.'],
    ['teo', "(very still) Don't."],
    ['jay', "“Tell Teo I kept every one of his drawings.” (holding out a steel watch on a cracked strap) And he gave me this. For you. It's Celia's."],
    ['caption', "(Teo takes the watch. He doesn't put it on. He closes his fist round it until the knuckles go pale under the paint.)"],
    ['teo', '(hoarse) Kept them where? He never kept anything of mine. He kept you.'],
  ];
  const LIBRARY_BOOK = [
    ['jay', "(holding out the brown paper bag) This was on Dex's couch. It's all of it."],
    ['caption', '(A toothbrush. Three years of parole paperwork. And a prison library book, GREAT BRIDGES OF THE WORLD, eleven years overdue and so swollen it won\'t shut.)'],
    ['caption', '(Between every page, a parking ticket. On the back of each, in a boy\'s felt-tip: a car. A lantern. A man with a long sad face. A woman singing, every note coming out wrong.)'],
  ];
  const LIBRARY_SAVED = [
    ['teo', "(barely) He kept these. He used to say he parked on yellow lines on purpose so I'd have paper. I thought it was a joke. (another page) It wasn't. He just parked like an idiot."],
    ['teo', "(holding one up: the woman singing) That's Mum. That's exactly what she sounded like."],
    ['jay', 'Item three. Nobody sings.'],
    ['teo', '(wiping his face with the heel of his hand, laughing) “Celia will laugh.” Yeah. She\'d laugh at all of us.'],
  ];
  const LIBRARY_CHASED = [
    ['caption', "(One ticket slides out and lands in the dirt by Celia's stone. Teo kneels to get it. And then he stays down there, on one knee beside his mother, going through every page.)"],
    ['caption', "(He doesn't say a word to anybody. He doesn't say thank you. He picks up every one.)"],
  ];

  // Birdie's horse: the crayon drawing, MR AUGIE AT WORK, that was in his shirt pocket.
  const HORSE = [
    ['birdie', '(lower, peering at the vault) Is Mr. Augie in the box with Mrs. Augie?'],
    ['jay', 'Next to her.'],
    ['birdie', "That's good. She waited ages. (beat) Did he have my horse? The one I did for luck?"],
    ['teo', "(crouching down to her height) He had it in his shirt pocket. Right here. Over his heart. He's keeping it."],
    ['birdie', "(satisfied) It's his best one. (beat) The luck didn't work, though."],
    ['teo', "(after a long moment) No. It didn't."],
    ['birdie', "(gravely, deciding) I'll do a better one next time."],
    ['caption', '(And that is the one that gets Teo. He stands up and turns away and puts his fist flat against the stone angel, on the place where its nose used to be.)'],
  ];

  steps.push(
    { music: 'sad' },
    { if: 'gave_cut', then: [
      { scene: { at: 'st_brigid_church', cast: ['ilunga', 'teo', 'mae', 'lourdes'] }, say: SERVICE.concat(SERVICE_HAND) },
    ], else: [
      { scene: { at: 'st_brigid_church', cast: ['ilunga', 'teo', 'mae', 'lourdes'] }, say: SERVICE },
    ] },
    { if: 'saved_teo', then: [
      { scene: { at: 'teo', cast: ['teo', 'lourdes', 'rhea'] }, say: EULOGY.concat(EULOGY_SAVED, LIBRARY_BOOK, LIBRARY_SAVED) },
    ], else: [
      { scene: { at: 'teo', cast: ['teo', 'lourdes', 'rhea'] }, say: EULOGY.concat(EULOGY_CHASED, LIBRARY_BOOK, LIBRARY_CHASED) },
    ] },
    { music: 'off' },
    // Whoever Dex left behind comes up to the grave.
    { if: 'dex_forgiven', then: [
      { scene: { at: 'st_brigid_church', cast: ['birdie', 'teo'] }, say: [
        ['birdie', "(arriving at a run from the gate, out of breath) Daddy says he's not allowed over here. Is that true?"],
        ['jay', "(a long beat) He's allowed. He doesn't think he is."],
        ['birdie', "He's been standing by the hearse man for an hour. He keeps doing his tie up and undoing it. Nine times. I counted."],
      ].concat(HORSE, [
        ['birdie', "(already running back down the path) I'm telling Daddy. He keeps asking what everybody's saying."],
        ['caption', '(At the gate Dex bends right down to listen to her. Then he puts one big hand over his face and stands like that. Nobody goes over. Ansel watches him longest.)'],
      ]) },
    ], else: [
      { if: 'dex_banished', then: [
        { scene: { at: 'st_brigid_church', cast: ['rafi', 'teo'] }, say: [
          ['caption', "(Rafi comes up the path at last in Dex's enormous suit, stands at the edge of the grave, and opens his fist over the pine. A spark plug drops onto the lid.)"],
          ['rafi', "He rang Thursday. From a payphone, with snow on the line. He said put this on the grave and don't say who it's from. (beat) It's Birdie's. She said every car needs a spare."],
          ['jay', "(very quietly) It means he's going a long way."],
          ['rafi', "He said Lulu's due oil Tuesday. Synthetic, not the cheap stuff. He said you'd know it was him saying it."],
          ['rafi', '(checking the back of his hand, where it\'s written in biro) And he said, “Don\'t answer.” That\'s all. I wrote it down so I wouldn\'t get it wrong.'],
          ['teo', "(looking at the spark plug on his father's coffin) The old man would've liked that. A spare."],
        ] },
      ], else: [
        { scene: { at: 'st_brigid_church', cast: ['birdie', 'mae', 'teo'] }, say: [
          ['birdie', "(holding Mae's hand, to Jay) Daddy's telling the truth to a lady with a stripe in her hair. Mae says it takes a long time."],
          ['mae', 'It takes a long time.'],
        ].concat(HORSE, [
          ['birdie', "Daddy rings at seven. He's only allowed five minutes, so I have to say everything fast. (beat) I'm going to say the horse first."],
        ]) },
      ] },
    ] },
    // Mae, and the toolbox.
    { if: 'kept_cut', then: [
      { scene: { at: 'mae', cast: ['noor', 'lourdes', 'mae'] }, say: [
        ['lourdes', "(holding Noor's hand in both of hers, the way she holds everybody's) And how do you know our Jay, sweetheart?"],
        ['noor', "(too fast; funerals make her worse) Work. Consulting. Traffic. I did the lights for his grandmother's house. The bank part. Well. The twenty-two thousand part."],
        ['noor', "The other forty was already in Dex's toolbox from before, so technically I only consulted on— (She hears it. All of it.) ...I'm going to go and stand next to Ansel."],
        ['caption', "(Mae hasn't moved. She has the look she gets on a road at three in the morning, adding up a wreck from the skid marks.)"],
        ['mae', '(very quietly) Forty thousand. In a toolbox. From before what, Jay?'],
        ['jay', 'Tidewater. My cut. Dex kept it for me. (beat) The house was sixty-two.'],
        ['mae', "(every word placed, like a line going into a vein) You bought your grandmother's house with my brother's blood money."],
        ['caption', "(There is no answer to that. He has had a month to find one and there isn't one.)"],
        ['jay', 'Yes.'],
        ['mae', "(looking at the vault, the pine, the red dirt; anywhere but him) Not today. Today I'm a person at a funeral. (beat) You remember how? You stay till the end."],
      ] },
    ], else: [
      { scene: { at: 'mae', cast: ['mae', 'lourdes'] }, say: [
        ['mae', "(still holding his hand, looking down at it as if it belongs to two other people) Don't say anything."],
        ['jay', "I wasn't going to."],
        ['mae', "You were. You had the face. (beat) It's a hand, Jay. It's a funeral. People hold hands at funerals."],
        ['lourdes', '(from the other side of the grave, blowing her nose) People do.'],
        ['mae', 'Mama.'],
        ['lourdes', "I'm agreeing. I'm allowed to agree at a funeral. (to Jay) He fed my cats sardines last week. I said, Augie, was it you? The money in my mailbox, in the rag?"],
        ['lourdes', "He said, “Lourdes, I've never owned a rag in my life.” (She looks at Jay, and at her daughter's hand in his.) So. Somebody did."],
      ] },
    ] },
    // Rhea pays her debts. Ansel goes to stand in a doorway.
    { scene: { at: 'st_brigid_church', cast: ['rhea', 'ansel', 'noor'] }, say: [
      ['rhea', '(dropping two folded banknotes onto the pine lid) The deposit. On the thermos. He never brought it back. (to the grave) Keep it, Augustine. We\'re square.'],
      ['noor', 'You charged him a deposit on a thermos?'],
      ['rhea', 'I charge everybody a deposit on a thermos. He was the only one who ever paid it.'],
      ['ansel', "(setting the coffee tin of zinnias at the foot of Celia's stone) Zinnias. He said they look like they're shouting. He liked things that shouted."],
      ['noor', 'Father Ilunga showed me item five. It says, in writing, numbered, do not let Rhea bring—'],
      ['rhea', '(producing a bottle with no label from her overalls) I know what it says. He wrote item five because of me. That makes it a tribute.'],
    ] },
    { if: 'dex_forgiven', then: [
      { say: [
        ['ansel', "(looking down at the gate, where Birdie has fallen asleep standing up against her father's leg) I'll take the little one home. She's done."],
        ['ansel', "Her father wants to stand here when everybody's gone. He won't ask. He's been waiting an hour for nobody to be watching."],
        ['ansel', "(beat) And I've slept four nights in his doorway on a kitchen chair. I've grown fond of the chair."],
      ] },
      { leave: ['ansel', 'birdie'] },
    ], else: [
      { if: 'dex_banished', then: [
        { say: [
          ['ansel', "Rafi's opening the garage at six. Fridays are bicycles. Dex never charged the children, and Rafi says he isn't going to start."],
          ['ansel', "He doesn't know how gears work. Neither do I. We'll be two men in a doorway, being wrong about gears."],
        ] },
        { leave: ['ansel', 'rafi'] },
      ], else: [
        { say: [
          ['ansel', "It's Friday. The children on Anchor Street bring their bicycles to Dex's on Fridays. Nobody has told them there isn't a Dex."],
          ['ansel', "Rafi's opening up. I said I'd stand in the doorway, so nobody minds that it's only Rafi."],
        ] },
        { leave: ['ansel'] },
      ] },
    ] },
    { leave: ['lourdes', 'rhea', 'mae', 'birdie', 'king_0', 'king_1', 'king_2', 'king_3', 'king_4'] },
    { goto: 'st_brigid_church', vehicle: false, radius: 2.5, objective: 'Say goodbye' },
    { say: [
      ['caption', '(The shadows of the stones are long. The new brass plate is up on the vault: AUGUSTINE VANCE. HE PLANNED.)'],
      ['jay', '(to the plate, very low) Seatbelt.'],
      ['caption', "(Nobody says I know, I know. That's the worst part. That's going to be the worst part for a long time.)"],
    ] },
    { if: 'dex_forgiven', then: [
      { scene: { at: 'dex', cast: ['dex'] }, say: [
        ['caption', '(Dex comes up from the gate at last, slowly, like the path is uphill, and stops at the foot of the grave with his tie in his fist.)'],
        ['dex', '(not to Jay; to the dirt) I cut your key perfect, Aug.'],
        ['dex', "I wrote down a lot of things to say. On an invoice. (He looks at it and puts it away.) It's all excuses. Every line. Even the spelling."],
        ['dex', "(beat) I gave you the good blanket. That's the only thing I've got that isn't an excuse. I gave you the good blanket."],
        ['jay', '(from the path, after a long while) He knew it was the good one.'],
        ['dex', "(not turning round) Don't. Don't be nice to me, Jay, I'll fall over. I'm in a very tight suit."],
      ] },
    ] },
  );

  // ================================================================ THE FIRE
  const GETIN_DEX = [
    ['dex', "(wrenching Lulu's passenger door open before Jay has his keys out) Birdie. Ansel took her up for her nap. Jay—"],
    ['jay', 'Get in.'],
  ];
  const GETIN_NOOR = [
    ['noor', "(scrambling into the back, clutching the laptop) I'm coming. I'm useful. I'm the lights."],
    ['jay', 'Seatbelt.'],
    ['noor', '(click) Done. Drive. DRIVE.'],
  ];
  const GETIN_TEO = [
    ['teo', "(diving in, the watch sliding on his wrist) Go. I rang the Kings. They're coming from the alley."],
    ['jay', 'Seatbelt.'],
    ['teo', "(already doing it, furious about it) It's on! It's ON! You're worse than he was!"],
  ];
  // St. Brigid's to Anchor Street is a short, bad drive: keep it tight.
  const DRIVE_DEX = [
    ['dex', "(belt on, both hands flat on the dash) Go. Don't stop for lights, Jay, don't stop for anything—"],
    ['noor', "(in the back, thumbs going) I've got the lights. Green, green, green. This is a crime in four jurisdictions and I'm committing it in funeral shoes."],
    ['dex', '(not turning round) Noor. Thank you.'],
    ['noor', "Don't. You looked at me in Rhea's shed. When they all looked at me, you looked first."],
    ['dex', 'I know.'],
    ['noor', "Later I'm going to say a lot of things to you, in order. There'll be a document. (beat) It'll have tabs. LEFT. Left at Tannery!"],
    ['dex', "(the smoke coming up over the roofs ahead; very small) Oh. That's mine. That's my smoke."],
  ];
  const DRIVE_NOOR = [
    ['noor', "(thumbs going) I've got the lights. Green, green, green. This is a crime in four jurisdictions and I'm committing it in funeral shoes."],
    ['jay', 'How many kids?'],
    ['noor', "Ansel said seven bicycles. So seven children. Unless one of them's very ambitious. (beat) Sorry. When it's bad I talk."],
    ['caption', '(Smoke over Old Market. A thick black thumb of it, pressed down on the roofs of Anchor Street.)'],
    ['noor', "His dad's garage. He bought it back off the bank. Eleven years. The deed's in a frame. In the toilet."],
    ['noor', 'Shit, shit, shitting— LEFT. Left at Tannery. Go, Jay.'],
  ];

  const getIn = (lines) => ({ getIn: 'lulu', objective: 'Get to Lulu. Now.', say: lines });
  const drive = (lines) => ({ goto: 'dex_garage', vehicle: 'lulu', radius: 30, objective: 'Calloway Auto is burning. Get there before it does.', say: lines });

  steps.push(
    { music: 'tension' },
    { if: 'dex_forgiven', then: [
      { phone: 'ansel', say: [
        ['ansel', '(very calm, which is how you know) Jay. The garage is burning.'],
        ['ansel', 'Halberd. Two vans. They came while I was taking her up the stairs. They have bottles. I have Birdie.'],
        ['caption', "(Dex hears his daughter's name from ten metres away. He is already running.)"],
        ['ansel', "She's behind me. I'm standing in the door. I'm very good at standing in doors. Come now."],
      ] },
    ], else: [
      { phone: 'ansel', say: [
        ['ansel', '(very calm, which is how you know) Jay. The garage is burning.'],
        ['ansel', 'Halberd. Two vans. They have bottles. There are children here. Seven bicycles, seven children.'],
        ['ansel', "Rafi got four of them out the back. Three are behind me. I'm standing in the door. They keep asking me to move. Come now."],
      ] },
    ] },
    { music: 'action' },
    { join: ['noor'], weapon: 'fists' },
    { if: 'saved_teo', then: [
      { join: ['teo'], weapon: 'shotgun' },
    ], else: [
      { say: [
        ['teo', "(not getting up off his knees, the parking tickets in his lap) Go. I'll send the Kings. (beat) Not for you."],
      ] },
      { leave: ['teo'] },
    ] },
    { if: 'dex_forgiven', then: [
      { join: ['dex'], weapon: 'pistol' },
      { if: 'saved_teo', then: [getIn(GETIN_DEX.concat(GETIN_TEO))], else: [getIn(GETIN_DEX.concat(GETIN_NOOR))] },
    ], else: [
      { if: 'saved_teo', then: [getIn(GETIN_NOOR.concat(GETIN_TEO))], else: [getIn(GETIN_NOOR)] },
    ] },
    // The lot, already burning, waiting for him.
    { spawnCar: 'arson_van', type: 'porter', at: 'dex_garage', offset: [9, 6], color: 0x8c8f93 },
    { spawnCar: 'arson_suv', type: 'ironclad', at: 'dex_garage', offset: [-9, 7], color: HALBERD },
    { spawn: [
      { id: 'torch', faction: 'halberd', at: 'arson_suv', offset: [2, 1], count: 3, weapon: 'pistol', behavior: 'guard', group: 'arsonists' },
      { id: 'torch_lead', faction: 'halberd', at: 'arson_van', offset: [-2, 2], weapon: 'shotgun', behavior: 'guard', group: 'arsonists' },
      { id: 'torch_smg', faction: 'halberd', at: 'dex_garage', offset: [5, 11], count: 2, weapon: 'smg', behavior: 'guard', group: 'arsonists' },
    ] },
    { if: 'dex_forgiven', then: [], else: [
      { spawn: [
        { char: 'kid_ola', at: 'dex_garage', offset: [1.0, -3.0], behavior: 'cower', health: 3000 },
        { char: 'kid_jojo', at: 'dex_garage', offset: [-0.8, -3.2], behavior: 'cower', health: 3000 },
      ] },
      { if: 'dex_to_calder', then: [
        { spawn: [{ char: 'rafi', at: 'dex_garage', offset: [-3.5, -3.0], behavior: 'cower', health: 3000 }] },
      ] },
    ] },
    { timer: 120 },
    { if: 'dex_forgiven', then: [drive(DRIVE_DEX)], else: [drive(DRIVE_NOOR)] },
    { camera: 'dex_garage', seconds: 9, say: [
      ['caption', '(Calloway Auto is on fire. Not all of it yet. The office, and the roof over the office, and smoke coming out under the roll-up door in a flat black sheet, like something poured.)'],
      ['caption', '(Six men in charcoal polos on the lot, with canvas bags that clink. One lights the rag in a bottle with a gold lighter, unhurried, like a man at a barbecue.)'],
      ['caption', "(At the end of Anchor Street, lights off, the two Southside cruisers from the church. They were there when the vans came. They're there now.)"],
    ] },
    { if: 'dex_forgiven', then: [
      { scene: { at: 'dex_garage', cast: ['ansel', 'birdie', 'dex'] }, say: [
        ['caption', '(In the doorway to the flat stairs, bleeding from the head and standing very straight: Ansel Boateng. Birdie is behind his legs with her hands over her ears.)'],
        ['ansel', "(not taking his eyes off the men on the lot) Hello, Jay. I'm all right. I've been standing up. (beat) She's all right."],
        ['birdie', '(peeking out round his knee) Daddy? Is Daddy here?'],
        ['dex', "(his voice cracking right down the middle) I'm here, baby. I'm here. You stay right behind Ansel."],
        ['ansel', 'Get them away from the door, please. I can stand here a long time. I would prefer not to.'],
      ] },
      { protect: 'birdie' },
    ], else: [
      { scene: { at: 'dex_garage', cast: ['ansel', 'kid_ola', 'rafi'] }, say: [
        ['caption', '(In the doorway of the tow bay, bleeding from the head and standing very straight: Ansel Boateng. Behind him, three small faces and a bicycle with no front wheel.)'],
        ['ansel', "(not taking his eyes off the men on the lot) Hello, Jay. I'm all right. I've been standing up."],
        ['kid_ola', '(from behind his legs) Are you the police?'],
        ['jay', 'No.'],
        ['kid_ola', 'Good. The police are just sitting in their car.'],
        ['rafi', "(behind a stack of tyres, hugging a fire extinguisher) I got four out the back! Four! The other three wouldn't leave him!"],
        ['ansel', 'Get them away from the door, please. I can stand here a long time. I would prefer not to.'],
      ] },
      { protect: ['kid_ola', 'kid_jojo'] },
    ] },
    { say: [
      ['noor', "(out of the car before it has stopped, laptop and all) I'll go round the back. Kids, hoses, fire brigade, the real one. Go. GO."],
    ] },
    { leave: ['noor'] },
    { spawn: [{ id: 'king_help', faction: 'kings', at: 'dex_garage', offset: [16, -4], count: 3, weapon: 'pistol', behavior: 'follow', hostile: false }] },
    { if: 'dex_forgiven', then: [
      { kill: 'group:arsonists', checkpoint: true, objective: "Get them away from the door. Ansel can't stand there forever.", say: [
        ['dex', "(running at the lot, not ducking, pistol up like he's never held one) Stay behind Ansel, baby! Right behind him!"],
        ['birdie', '(high, from the doorway) Daddy, the big man got hit and he stood back up! He keeps standing up!'],
        ['ansel', "(to the man in front of him, calmly, blood in one eye) You can hit me again. I'll stand up again. We can do this all night. I have nowhere to be."],
        ['caption', '(Three Lantern Kings come round the corner from Tannery at a run, red jackets, pistols out. Teo sent them. Teo always sends them.)'],
      ] },
    ], else: [
      { kill: 'group:arsonists', checkpoint: true, objective: "Get them away from the door. Ansel can't stand there forever.", say: [
        ['kid_ola', '(from behind Ansel) Mister! He got hit with a gun and he stood back UP!'],
        ['ansel', "(to the man in front of him, calmly, blood in one eye) You can hit me again. I'll stand up again. We can do this all night. I have nowhere to be."],
        ['rafi', "(from the tow bay, aiming the fire extinguisher like a rifle) I've got the extinguisher! It's empty! I'm just holding it!"],
        ['caption', '(Three Lantern Kings come round the corner from Tannery at a run, red jackets, pistols out. Teo sent them. Teo always sends them.)'],
      ] },
    ] },
    { say: [
      ['caption', '(The man with the gold lighter is down. His canvas bag lies on the lot: six bottles with rags in their necks, and the smell of petrol.)'],
      ['jay', '(picking it up, weighing a bottle in his hand) Thirty years he never carried anything. (He takes the bag anyway.)'],
    ] },
    { reward: { weapons: ['molotov'] } },
    { spawn: [{ id: 'arson_drv', faction: 'halberd', hostile: false, at: 'arson_van', behavior: 'drive', car: 'arson_van', to: 'haddad_pharmacy' }] },
    { phone: 'noor', say: [
      ['noor', "(round the back, breathless, a hose going) Jay. The grey van. There's a clipboard on the dash, I saw it through the window. It's a list."],
      ['noor', "Haddad Pharmacy's next. (beat) That's my dad's shop. Jay, that's my DAD'S SHOP."],
    ] },
    { destroy: ['arson_van'], objective: 'The van has the rest of the cans and a list. Haddad Pharmacy is next. Stop it. Burn it if you have to.', say: [
      ['jay', '(already moving, a bottle in his hand) Not that one. Not his.'],
    ] },
    { goto: 'dex_garage', radius: 22, objective: "Back to the garage. They're sending more." },
    // The second wave comes up from the scrapyard end and in off Tannery Row.
    { survive: 45, objective: 'Hold the lot. Keep them off the door.', waves: [
      { at: 'market_scrapyard', count: 3, weapon: 'smg', faction: 'halberd', delay: 0 },
      { at: 'tannery_row', count: 3, weapon: 'pistol', faction: 'halberd', delay: 10 },
      { at: 'market_scrapyard', count: 2, weapon: 'rifle', faction: 'halberd', delay: 22 },
    ], say: [
      ['ansel', "(still in the doorway, still standing, to nobody in particular) More of them. That's all right. I'm still up."],
      ['caption', '(Behind him the office roof goes in with a long, tired groan, and a column of sparks goes up into the dusk like something being let out.)'],
    ] },
  );

  // ================================================================ WHAT'S LEFT
  const KIDS = [
    ['kid_ola', "(dragging her bike with no front wheel up to Ansel) You didn't move. They said move and you didn't move. Why not?"],
    ['ansel', '(considering it seriously, the way he considers everything) You were behind me.'],
    ['kid_jojo', '(ringing his bell, once, because it is the only thing he can think of to do)'],
  ];
  const RESOLVE = [
    ['caption', "(Jay has been quiet a long time. He takes the marbled notebook out of his jacket and holds it shut against his leg, Celia's elastic still round it.)"],
    ['jay', 'He sent flowers at five. He sent this at six.'],
    ['jay', 'I came home for a week. Then it was the house. Then it was Augie. Then Pier 9. There was always a day I was leaving on.'],
    ['jay', "I'm done running."],
  ];
  const RESOLVE_END = [
    ['jay', "(looking up the hill toward Crestline, where the big houses are starting to light up) I'm going to take everything he has."],
    ['rhea', '(a long look at him; then the short laugh, like a winch catching) Everything.'],
    ['jay', 'Everything.'],
    ['rhea', "(turning back to her pickup) Good. Get in the truck. Somebody help the big one with the burned hands. He'll say he's fine. Ignore him."],
  ];
  const RHEA_ARRIVES = [
    ['caption', "(Rhea's rust-orange pickup across the lot. She gets out in her clean overalls, which are not clean any more, and looks at the fire the way she looks at a hull for rust.)"],
    ['rhea', 'Halberd?'],
    ['jay', 'Halberd.'],
    ['rhea', "Then you're all living with me. I have a back room, a great many propellers and no fire insurance, which is why nobody ever burns me. Bring what you can carry."],
    ['noor', '(clutching the laptop, soot on her face, a garden hose still in her other hand) This is all I can carry. This is everything I own that matters. This and Ansel.'],
  ];
  const ROSES = [
    ['ansel', "(looking at what's left, the bandaged hands loose in his lap) Roses are just thorns that got lucky."],
    ['noor', "We're not lucky. Look at us."],
    ['ansel', '(holding up both white hands, and looking along the row of them: soot, blood, a funeral tie, all of them alive) Look at us.'],
  ];

  steps.push(
    { music: 'off' },
    { spawnCar: 'rhea_mesa', type: 'mesa', at: 'dex_garage', offset: [-14, -10], color: SALTS_RUST, watch: false },
    { camera: 'dex_garage', seconds: 11, say: [
      ['caption', '(Calloway Auto burns the way old buildings burn: all at once, and then for a long time. Inside, a tyre goes off like a shot and everybody on the lot flinches.)'],
      ['caption', '(The neon sign hangs on by one bracket over the door. CAL OWAY AUTO.)'],
      ['caption', '(Then the bracket goes. It comes down into the lot in a long slow fall and a burst of pink glass, and the last L goes out with it.)'],
    ] },
    { music: 'sad' },
    { scene: { at: 'ansel', cast: ['mae', 'ansel'] }, say: [
      ['caption', "(Mae came in her mother's car with the hazards on and a first-aid kit the size of a suitcase. She kneels on the lot with Ansel's hands in hers. Both palms are burned raw.)"],
      ['mae', 'Hold still.'],
      ['ansel', "I'm very good at holding still."],
      ['mae', "You're good at standing up. It's different. (cleaning, quick and gentle) What did you do to your hands?"],
      ['ansel', 'The roll-up door was hot. The children were on the other side of it. (beat) It was a very hot door.'],
      ['mae', 'And who hit you?'],
      ['ansel', 'A man with a rifle. Several times. He kept hitting me and I kept standing up. In the end he looked so tired I felt sorry for him.'],
      ['mae', "(tying off the bandage a little too tight, on purpose) And you didn't hit him back. Of course you didn't. You beautiful idiot."],
    ] },
    { if: 'dex_forgiven', then: [
      { scene: { at: 'dex', cast: ['dex', 'birdie', 'ansel'] }, say: [
        ['caption', '(Dex in the middle of the lot with Birdie on his hip, too big to be carried, being carried. Through the door the lift glows red, the only thing in there not burning.)'],
        ['birdie', "(into his neck) Daddy. The investment's on fire."],
        ['dex', "(a terrible sound, most of a laugh) Yeah, baby. (beat) It's paid off now. All paid off."],
        ['dex', '(across the lot to Ansel, his voice gone to almost nothing) You stood in my door.'],
        ['ansel', "It was a good door. (beat) I'm sorry about the chair."],
        ['birdie', '(lifting her head, very serious, to Jay) Is this because Daddy did a bad thing?'],
        ['caption', '(Dex goes completely still. Nobody on the lot breathes.)'],
        ['jay', "(crouching to her height, taking his time) No. This is because a bad man did a bad thing. Your dad's here. Your dad came running."],
        ['birdie', "(putting her head back down on her father's shoulder) He runs funny."],
        ['dex', '(into her hair, barely) I know. I know I do.'],
      ] },
    ], else: [
      { if: 'dex_banished', then: [
        { scene: { at: 'rafi', cast: ['rafi', 'kid_ola', 'kid_jojo', 'ansel'] }, say: KIDS.concat([
          ['caption', "(Rafi stands on the lot in Dex's funeral suit with the garage keys in his fist. Seven keys to a building that isn't there.)"],
          ['rafi', 'He gave me these on Tuesday. I had it four days. (beat) If he rings again, from the snow. Do I tell him?'],
          ['jay', '(watching the roof go) No.'],
          ['rafi', "He'd want to know."],
          ['jay', "That's why."],
        ]) },
      ], else: [
        { scene: { at: 'rafi', cast: ['rafi', 'kid_ola', 'kid_jojo', 'ansel'] }, say: KIDS.concat([
          ['rafi', "(holding a child's bicycle with a buckled front wheel) I got all the bikes out. Seven bikes. I didn't get one single tool. I got the bikes."],
          ['jay', 'You got the bikes.'],
          ['rafi', "(looking at the fire, then the bike, then the fire) Dex would've got the tools."],
          ['jay', "Dex would've got the bikes."],
        ]) },
        { text: 'calder', message: "He heard it on the scanner at the hotel. First he asked if the kids got out. Then he asked about the lift. In that order. Thought you'd want to know the order." },
      ] },
    ] },
    { if: 'saved_teo', then: [
      { scene: { at: 'rhea_mesa', cast: ['rhea', 'noor', 'teo', 'ansel'] }, say: RHEA_ARRIVES.concat([
        ['teo', "(watching the smoke go up into the dusk, Celia's watch on his wrist) Two in one day. Him and the garage. (beat) You know what he'd say."],
        ['jay', 'Twenty minutes on the history of fire.'],
        ['teo', '(a laugh that hurts all the way down) Twenty minutes on the history of fire.'],
      ], ROSES) },
    ], else: [
      { scene: { at: 'rhea_mesa', cast: ['rhea', 'noor', 'ansel'] }, say: RHEA_ARRIVES.concat([
        ['caption', '(A text, from Teo: KINGS SAY THE KIDS ARE OUT. GOOD. Nothing else. Jay reads it twice.)'],
      ], ROSES) },
    ] },
    { if: 'gave_cut', then: [
      { scene: { at: 'rhea_mesa', cast: ['rhea', 'mae', 'ansel'] }, say: RESOLVE.concat([
        ['mae', "(not looking up from Ansel's bandages) Say it again. So I know you said it."],
        ['jay', "I'm done running."],
      ], RESOLVE_END) },
    ], else: [
      { scene: { at: 'rhea_mesa', cast: ['rhea', 'mae', 'ansel'] }, say: RESOLVE.concat([
        ['caption', '(Mae, kneeling by Ansel, looks up at him for exactly one second. Whatever she thinks about it, she keeps.)'],
      ], RESOLVE_END) },
    ] },
    { fade: 'out' },
    { if: 'dex_forgiven', then: [
      { blackout: [
        ['caption', '(The fire brigade came at nine, from across town. The station on Anchor Street closed in the spring, for the Renewal.)'],
        ['caption', "(In the morning, before anybody can stop her, Birdie goes into the ashes in wellies and comes out with the neon L, the dead one, black and cracked. She won't say what it's for.)"],
      ] },
    ], else: [
      { blackout: [
        ['caption', '(The fire brigade came at nine, from across town. The station on Anchor Street closed in the spring, for the Renewal.)'],
        ['caption', "(In the morning Rafi goes into the ashes with a broom, because he doesn't know what else you do. Seven children turn up to help him sweep. Nobody tells them to.)"],
      ] },
    ] },
    { fade: 'in' },
  );

  S.missions.push({
    id: 'm23_ashes',
    act: 3,
    title: 'Ashes',
    giver: 'teo',
    start: 'st_brigid_church',
    time: 17,
    estMinutes: 10,
    summary: "They bury Augie beside Celia. Then Voss burns what's left.",
    reward: { weapons: ['molotov'] },
    failIf: ['wrecked:lulu'],
    steps,
  });
})();
