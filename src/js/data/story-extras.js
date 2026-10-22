/*
 * data/story-extras.js — everything between the story jobs: taxi fares,
 * street races, Dex's list, bounties, turf wars, the texts that arrive in
 * free roam, and what the radio DJs say between songs.
 *
 * Loaded after story.js. The activity engine (js/activities.js) builds the
 * jobs; anything with `steps` here replaces the default job outright.
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  // ---------------------------------------------------------------- cast
  Object.assign(S.characters, {
    fare2: { name: 'Fare', role: 'Taxi passenger', look: { skin: 0xe0b08a, hair: 0x5a3a22, top: 0xd94f70, bottom: 0x2e2e36, shoes: 0xefefef, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.15, rate: 1.05 } },
    parrot: { name: 'Captain', role: 'A parrot', look: { skin: 0x2f9a4a, hair: 0xd42a2a, top: 0x2f9a4a, bottom: 0x2f9a4a, shoes: 0xf2b62e, build: 'slim', height: 0.3 }, voice: { gender: 'male', pitch: 1.4, rate: 1.15 } },
    // Racers.
    jolie: { name: 'Jolie Dubois', role: 'Street racer, one of the twins', look: { skin: 0xd8a47e, hair: 0xe8e4dc, top: 0x1c1c1f, bottom: 0x1c1c1f, shoes: 0xff4f8b, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.2, rate: 1.1 } },
    tollbooth: { name: 'Marlon "Tollbooth" Pike', role: 'Street racer', look: { skin: 0x6b3f28, hair: 0x101010, top: 0xf2b62e, bottom: 0x2e2e36, shoes: 0x111111, build: 'heavy' }, voice: { gender: 'male', pitch: 0.75, rate: 0.95 } },
    priscilla: { name: 'Priscilla Wen', role: 'Street racer, actuary', look: { skin: 0xf1d0b0, hair: 0x101010, top: 0xe9e7e1, bottom: 0x33415c, shoes: 0x202020, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.05, rate: 1.12 } },
    nico: { name: '"Neon" Nico Ferrante', role: 'Drift king of the boardwalk', look: { skin: 0xe0b08a, hair: 0x2a1d14, top: 0x2ad4c4, bottom: 0x1c1c1f, shoes: 0xff4f8b, build: 'slim' }, voice: { gender: 'male', pitch: 1.1, rate: 1.12 } },
    ruth: { name: 'Ruth Abernathy', role: 'Street racer, 68', look: { skin: 0xf1c8a8, hair: 0xe8e4dc, top: 0xb88ad9, bottom: 0x4a3b5a, shoes: 0xefefef, build: 'slim' }, voice: { gender: 'female', pitch: 0.95, rate: 0.9 } },
    kostya: { name: '"Big Kostya" Lemaire', role: 'Salts truck driver', look: { skin: 0xd8b090, hair: 0x5a4a3a, top: 0xc4561d, bottom: 0x1d2b4a, shoes: 0x3a2a1a, build: 'heavy', hat: true }, voice: { gender: 'male', pitch: 0.65, rate: 0.88 } },
    deb: { name: 'Deb "Forklift" Mahone', role: 'Salts forklift driver', look: { skin: 0xe0b08a, hair: 0x8a5a3a, top: 0x1d2b4a, bottom: 0x1d2b4a, shoes: 0x3a2a1a, build: 'heavy', longHair: true }, voice: { gender: 'female', pitch: 0.85, rate: 1.05 } },
    preston: { name: 'Preston Vale III', role: 'Trust-fund racer', look: { skin: 0xf1d0b0, hair: 0xd8b878, top: 0xf5f5f0, bottom: 0x7a8aa0, shoes: 0x6b4a2e, build: 'slim' }, voice: { gender: 'male', pitch: 1.1, rate: 1.05 } },
    barnaby: { name: 'Barnaby', role: "Preston's chauffeur", look: { skin: 0xd8a47e, hair: 0x9a9a9a, top: 0x141414, bottom: 0x141414, shoes: 0x111111, build: 'tall', hat: true }, voice: { gender: 'male', pitch: 0.8, rate: 0.85 } },
    // Bounties.
    dimples: { name: 'Darnell "Dimples" Price', role: 'Professional crash victim', look: { skin: 0x6b3f28, hair: 0x101010, top: 0xf2c14e, bottom: 0x2e3f5c, shoes: 0xefefef, build: 'average' }, voice: { gender: 'male', pitch: 1.05, rate: 1.12 } },
    veronika: { name: 'Veronika Stahl', role: 'The Crestline Cat', look: { skin: 0xf1d0b0, hair: 0x101010, top: 0x141414, bottom: 0x141414, shoes: 0x141414, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 0.9, rate: 0.95 } },
    lou_buckley: { name: 'Lou Buckley', role: 'Produce-truck hijacker', look: { skin: 0xe0b08a, hair: 0x8a5a3a, top: 0x6b8f3a, bottom: 0x3b4a66, shoes: 0x3a2a20, build: 'heavy', hat: true }, voice: { gender: 'male', pitch: 0.85, rate: 1.0 } },
    ray_buckley: { name: 'Ray Buckley', role: 'Produce-truck hijacker', look: { skin: 0xe0b08a, hair: 0x8a5a3a, top: 0xb8643a, bottom: 0x3b4a66, shoes: 0x3a2a20, build: 'average' }, voice: { gender: 'male', pitch: 1.0, rate: 1.05 } },
    moody: { name: '"Pastor" Declan Moody', role: 'Fake-charity preacher', look: { skin: 0xf1c8a8, hair: 0xc9c6c0, top: 0x141414, bottom: 0x141414, shoes: 0x6b4a2e, build: 'heavy' }, voice: { gender: 'male', pitch: 0.9, rate: 1.1 } },
    leon: { name: 'Leon "The Magician" Castillo', role: 'Escape artist', look: { skin: 0xc68c64, hair: 0x2a1d14, top: 0x7a1f2a, bottom: 0x141414, shoes: 0x111111, build: 'slim', hat: true }, voice: { gender: 'male', pitch: 0.95, rate: 0.95 } },
    tavish: { name: 'Tavish Groom', role: 'Former Halberd guard', look: { skin: 0xe8c4a8, hair: 0x6e4a2c, top: 0x3a3f45, bottom: 0x2a2e33, shoes: 0x111111, build: 'heavy' }, voice: { gender: 'male', pitch: 0.75, rate: 1.0 } },
    mona: { name: 'Mona "Bumper" Kessel', role: 'Street-race thief', look: { skin: 0xf1d0b0, hair: 0xd42a6a, top: 0x1c1c1f, bottom: 0x2e3f5c, shoes: 0xefefef, build: 'slim', longHair: true }, voice: { gender: 'female', pitch: 1.1, rate: 1.15 } },
    otis: { name: 'Otis Wembley', role: "Pelican's former loan officer", look: { skin: 0xf1c8a8, hair: 0xd8d4cc, top: 0xc9c0a0, bottom: 0x6b6f4a, shoes: 0x6b4a2e, build: 'slim' }, voice: { gender: 'male', pitch: 1.0, rate: 0.9 } },
    // Radio hosts.
    dj_del: { name: 'Del Starr', role: 'VHR 88.1 Sunset Drive', look: { skin: 0xf1c8a8, hair: 0xd8b878, top: 0xb88ad9, bottom: 0x1c1c1f, shoes: 0x202020, build: 'average', longHair: true }, voice: { gender: 'female', pitch: 0.85, rate: 0.88 } },
    dj_benji: { name: 'Benji Blue', role: 'Pulse 96.4', look: { skin: 0x8a5638, hair: 0x2a7ad4, top: 0xff4f8b, bottom: 0x1c1c1f, shoes: 0xefefef, build: 'slim' }, voice: { gender: 'male', pitch: 1.2, rate: 1.15 } },
    dj_sable: { name: 'Sable', role: 'Harbor Heat 103.7', look: { skin: 0x4e2c1c, hair: 0x101010, top: 0x1c1c1f, bottom: 0x1c1c1f, shoes: 0x111111, build: 'tall' }, voice: { gender: 'male', pitch: 0.7, rate: 0.88 } },
  });

  Object.assign(S.places, {
    blackwood_bonds: { name: 'Blackwood Bail Bonds', sign: 'BLACKWOOD BAIL BONDS', district: 'downtown', kind: 'storefront', desc: 'Blackwood Bail Bonds: a gold-leaf window promising WE BELIEVE IN YOU (CONDITIONALLY), and a bell on the door that has heard every excuse.' },
  });

  const A = S.activities;

  // ---------------------------------------------------------- taxi fares
  // Unlocked after m03. 'fare' and 'fare2' are the passengers; `after` hides a
  // fare until that job is done.
  A.taxiRequires = 'm03_ten_and_two';
  A.taxi = [
    { name: 'The cake', lines: [
      ['fare', '(holding a cake box on his knees like a bomb) It\'s a peace offering. For my ex-wife\'s wedding.'],
      ['jay', 'Is it poisoned?'],
      ['fare', '(a long pause) It\'s lemon.'],
      ['fare', 'She always hated lemon. I want her to know I remember.'],
    ] },
    { name: 'The tourist', lines: [
      ['fare', 'So where\'s all the vice? The brochure promised vice. I flew in from Minnesota for vice.'],
      ['jay', 'You\'re sitting in it. Meter\'s running.'],
      ['fare', '(delighted) Oh, that\'s dark. Can I put that on a postcard?'],
    ] },
    { name: 'Off shift', lines: [
      ['fare', '(a Halberd polo, untucked) Take the long way. I want ten minutes of not being a guy who shoves grandmas for a living.'],
      ['jay', 'Long way it is.'],
      ['fare', 'My mother thinks I\'m in "community liaison". She tells her friends. She\'s proud.'],
      ['fare', '(quietly) Don\'t look at me in the mirror, okay? Just drive.'],
    ] },
    { name: 'The booth', after: 'm13_pension', lines: [
      ['fare', 'I was on the Pier 9 booth, the night of Tidewater. Three years now. They said the kid had a gun.'],
      ['fare', 'He had a phone. I saw it light up when he fell. I never told anyone. Now I\'m telling a cab driver.'],
      ['fare', 'That\'s how brave I am.'],
      ['jay', '(quietly) It\'s a start.'],
    ] },
    { name: 'The psychic', lines: [
      ['fare', '(touching his headrest) You\'re going to lose someone you love.'],
      ['jay', 'Everyone does.'],
      ['fare', 'Yes, but I usually charge for it. Consider this a tip.'],
    ] },
    { name: 'The breakup', lines: [
      ['fare', 'Can you drive slower? I need two more minutes to dump him.'],
      ['fare2', '(beside her) I can hear you.'],
      ['fare', 'Great. Saves time.'],
      ['fare2', 'Driver, can you go faster?'],
      ['jay', 'I\'m staying out of this one. I\'m going exactly the speed limit. Like a coward.'],
    ] },
    { name: 'The runaway', lines: [
      ['fare', '(twelve, a hamster in a shoebox) Bus station. I\'m leaving forever.'],
      ['jay', 'Forever\'s a long time. What\'s the hamster called?'],
      ['fare', 'Gerald. He\'s coming with me. He understands.'],
      ['jay', 'Station\'s closed. Your mum\'s open, though. Where does she live?'],
    ] },
    { name: 'The divorce', lines: [
      ['fare', 'Faster. I want to be single before lunch.'],
      ['jay', 'Any faster and you\'ll be a widow.'],
      ['fare', '(thinking about it) Is that quicker, legally?'],
    ] },
    { name: 'The double shift', lines: [
      ['fare', '(in scrubs) Mercy General, please, I\'m on in twenty and I just did sixteen, so if I say anything weird, I\'m —'],
      ['fare', '(asleep mid-sentence, softly snoring)'],
      ['jay', '(under his breath) Twice round the block, then.'],
      ['fare', '(waking) Did I snore?'],
      ['jay', 'Like a diesel. It was nice.'],
    ] },
    { name: 'The fan', lines: [
      ['fare', 'You ever hear of Jay Mercer? Best wheelman this city ever had. They say he could thread a bus through a bank.'],
      ['fare', 'You kinda look like him, actually.'],
      ['jay', 'He\'d never drive a cab.'],
      ['fare', 'Ha. No. Never. Guy like that? He\'d die first.'],
    ] },
    { name: 'The architect', lines: [
      ['fare', 'See that? The Crown. I designed it. Every beam. Sixty-one floors.'],
      ['fare', 'I\'ve never been up it. I\'m scared of heights. Don\'t tell anyone.'],
      ['jay', 'Who would I tell?'],
      ['fare', 'You\'d be amazed how many people ask me that right before they tell someone.'],
    ] },
    { name: 'The preacher', lines: [
      ['fare', 'The Lord drives a sedan, son. Modest. Reliable.'],
      ['jay', 'Good mileage?'],
      ['fare', 'Eternal.'],
    ] },
    { name: 'The flamingo', lines: [
      ['fare', '(a grown man in a flamingo costume) I\'m getting married tomorrow. Is that too fast? Is this car too fast? Is everything too fast?'],
      ['jay', 'The car\'s fine. Drink some water.'],
      ['fare', 'You\'re a good man. You\'re like a wise turtle.'],
      ['jay', 'Water. Now.'],
    ] },
    { name: 'Coins', lines: [
      ['fare', '(a Lantern Kings kid, counting quarters into Jay\'s hand) My grandma\'s. She makes me come Sundays.'],
      ['fare', 'Don\'t tell Teo. It\'s bad for the image.'],
      ['jay', '(counting coins) Keep it. Tell her the driver says hi.'],
    ] },
    { name: 'The recital', after: 'm08_your_home_our_future', lines: [
      ['fare', 'I\'m going to be late for my daughter\'s recital! She\'s a tree. She has one line.'],
      ['jay', '(a beat) There are real recitals?'],
      ['fare', 'What?'],
      ['jay', 'Nothing. Hold on. Your kid\'s going to see you clap.'],
    ] },
    { name: 'The parrot', lines: [
      ['fare', 'Don\'t mind Captain. He\'s old. He was a sailor\'s parrot.'],
      ['parrot', 'Asshole! Asshole!'],
      ['fare', 'He\'s not talking about you. Usually.'],
      ['parrot', '(clearly) Ten and two!'],
      ['jay', '(very still) ...Where\'d he learn that?'],
      ['fare', 'No idea. Bought him off a lady on Heron Street years ago. She said he needed more excitement.'],
    ] },
    { name: 'The port', lines: [
      ['fare', 'Twenty-two years on the cranes. They replaced me with a joystick in Rotterdam.'],
      ['jay', 'That\'s a long reach.'],
      ['fare', 'Tell me about it. Guy in Rotterdam doesn\'t even know the gulls\' names.'],
    ] },
    { name: 'Crabs', lines: [
      ['fare', '(a chef, holding a crate that moves) They\'re for tonight. Please don\'t brake hard. They\'ve been through enough.'],
      ['jay', 'Haven\'t we all.'],
      ['fare', 'That\'s what I tell them.'],
    ] },
    { name: 'The old house', after: 'm23_ashes', lines: [
      ['fare', 'Could you just drive past Anchor and Tannery? Forty years we lived there, me and my Sol.'],
      ['fare', '(looking out) That\'s a fence now. Okay.'],
      ['fare', '(a breath) Okay. You can go.'],
    ] },
    { name: 'The film student', lines: [
      ['fare', 'Could you say something noir? Like, "This city eats its young"?'],
      ['jay', 'This city eats its young.'],
      ['fare', 'Wow. Chills. Again, but sadder?'],
      ['jay', '(flat) This city eats its young.'],
      ['fare', 'Oh, that hurt. I\'m keeping that.'],
    ] },
    { name: 'The retired cop', lines: [
      ['fare', 'Knew Wade Horne when he was a rookie. Good kid. Carried groceries for old ladies.'],
      ['fare', 'I don\'t know when he stopped. Maybe nobody does.'],
    ] },
    { name: 'The deal', lines: [
      ['fare', '(on his phone) Buy Old Market. All of it. It\'s just buildings, Gary. Buildings don\'t vote.'],
      ['caption', '(Jay brakes hard at a green light.)'],
      ['jay', 'Sorry. Thought I saw a cat.'],
      ['fare', '(rubbing his forehead) There wasn\'t a cat.'],
      ['jay', 'There\'s always a cat.'],
    ] },
    { name: 'The Beacon', lines: [
      ['fare', 'Is the obelisk real gold?'],
      ['jay', 'Paint.'],
      ['fare', 'Like everything here?'],
      ['jay', 'Not everything.'],
    ] },
    { name: 'Prom', lines: [
      ['fare', '(in a rented tux) Drive like you\'re not my dad.'],
      ['fare2', '(in sequins) Drive like you ARE his dad. Mine\'s watching the GPS.'],
      ['jay', 'I\'ll drive like a man who wants a five-star rating from both families.'],
    ] },
    { name: 'Last fare', after: 'm21_two_ten', lines: [
      ['fare', '(an old woman, from St. Brigid\'s) I light a candle for my husband every Thursday. Who\'s yours for?'],
      ['jay', '(a long beat) A guy who taught me to park.'],
      ['fare', 'Then you park nicely tonight, love. For him.'],
    ] },
    // Fares for the places out of town ('to': a place kind or id; picked first when that's where they're going).
    { name: 'First flight', to: 'airport', lines: [
      ['fare', '(gripping the seatbelt) I\'ve never flown. Not once. Forty-one years old.'],
      ['jay', 'First time for everything.'],
      ['fare', 'My daughter had a baby overseas. I\'m a grandad and I\'ve never even held a boarding pass.'],
      ['fare', '(a shaky laugh) If I faint at security, tell them I was brave in the cab.'],
    ] },
    { name: 'Lost luggage', to: 'airport', lines: [
      ['fare', 'Third time this month they\'ve lost my bag. I\'m going back to stare at the carousel until it confesses.'],
      ['jay', 'What\'s in it?'],
      ['fare', '(a beat) Forty jars of my nan\'s chutney. Don\'t ask. It\'s a whole thing.'],
    ] },
    { name: 'Back to base', to: 'fort', lines: [
      ['fare', '(army haircut, a duffel bag) Fort Breakwater, the gate on Meridian. Stop before the sign, they get twitchy.'],
      ['jay', 'Heard they keep tanks out there.'],
      ['fare', '(grinning) They do. And a sergeant who counts them twice a day.'],
      ['fare', 'If one ever goes missing, I was never in your cab.'],
    ] },
    { name: 'Corner office', to: 'skyline', lines: [
      ['fare', 'Northgate Heights. The Corkscrew, forty-third floor.'],
      ['jay', 'The twisty one?'],
      ['fare', 'Every morning the lift goes up and the view turns a little more. By lunch I can\'t tell which way the sea is.'],
      ['fare', '(sighs) Best job I ever hated.'],
    ] },
    { name: 'Midnight snack', to: 'store', lines: [
      ['fare', 'Any shop that\'s open. I need ice cream, and I need it to be somebody else\'s fault.'],
      ['jay', 'Long day?'],
      ['fare', 'Twelve-hour shift. I\'m eating the whole tub in the car park. Don\'t judge me.'],
      ['jay', 'Wouldn\'t dream of it. Get two spoons in case the night gets worse.'],
    ] },
  ];

  // ------------------------------------------------------------ races
  // Six courses, in the order js/activities.js builds them. Organised by
  // Saff's Pulse 96.4 crew. Win all six for `king_of_the_road`.
  A.races = [
    { name: 'Heron Sprint', prize: 1500, requires: 'm06_tick_tock',
      rivals: [{ name: 'Saff Achterberg', car: 'zephyr', color: 0xff4f8b }, { name: 'Jules Dubois', car: 'drifter', color: 0x1c1c1f }, { name: 'Jolie Dubois', car: 'drifter', color: 0xf2f2f2 }],
      lines: [
        ['saff', 'Oh my god, it\'s the lettuce man. My sponsor says I\'m not allowed to lose to lettuce trucks.'],
        ['jolie', 'We share a brain. It\'s fast.'],
        ['saff', 'Lights on the lotto sign. When it says WIN, you go. When it says LOSE, that\'s you.'],
        ['jay', '(to the car) Easy. Just a little one. For old times.'],
      ] },
    { name: 'Grand Slam', prize: 2500, requires: 'race_heron',
      rivals: [{ name: 'Marlon "Tollbooth" Pike', car: 'vireo', color: 0xf2b62e }, { name: 'Priscilla Wen', car: 'halcyon', color: 0xe9e7e1 }],
      lines: [
        ['tollbooth', 'Everybody pays the Tollbooth. Cash, card, dignity.'],
        ['priscilla', 'I race on my lunch break. You have forty-five minutes of my life. Actually forty-one.'],
        ['jay', 'I\'ll get you back to your desk early.'],
        ['priscilla', '(checking her watch) Bold. I\'ve calculated your odds. You won\'t like them.'],
      ] },
    { name: 'Boardwalk Burn', prize: 3500, requires: 'race_grand',
      rivals: [{ name: '"Neon" Nico Ferrante', car: 'drifter', color: 0x2ad4c4 }, { name: 'Ruth Abernathy', car: 'sovereign', color: 0xb88ad9 }],
      lines: [
        ['nico', 'Sideways is the only way, Mercer. Forwards is for accountants.'],
        ['ruth', 'I\'ve buried two husbands and a Pomeranian, dear. I\'m not scared of you.'],
        ['jay', 'Ma\'am, with respect, does your family know you\'re here?'],
        ['ruth', 'My family is in the cemetery, sweetheart. They know everything now.'],
      ] },
    { name: 'Container Maze', prize: 5000, requires: 'race_market',
      rivals: [{ name: '"Big Kostya" Lemaire', car: 'hauler', color: 0xc4561d }, { name: 'Deb "Forklift" Mahone', car: 'mesa', color: 0x1d2b4a }],
      lines: [
        ['kostya', 'I don\'t go around things.'],
        ['deb', 'Rhea says let you win. I don\'t work for Rhea on Tuesdays.'],
        ['jay', 'It\'s Thursday.'],
        ['deb', 'Then I\'m going to feel very bad about this.'],
      ] },
    { name: 'Crestline Hillclimb', prize: 6500, requires: 'race_docks',
      rivals: [{ name: 'Preston Vale III', car: 'vireo', color: 0xf5f5f0 }, { name: 'Barnaby', car: 'sovereign', color: 0x141414 }],
      lines: [
        ['preston', 'This is a private road, you know. Daddy bought this road.'],
        ['barnaby', '(dry) Sir, Daddy leases it.'],
        ['preston', 'Barnaby, whose side are you on?'],
        ['barnaby', 'The winner\'s, sir. As always.'],
      ] },
    { name: 'The Long Way Round', prize: 8000, requires: 'race_crest',
      rivals: [{ name: 'Saff Achterberg', car: 'zephyr', color: 0xff4f8b }, { name: 'Marlon "Tollbooth" Pike', car: 'vireo', color: 0xf2b62e }, { name: 'Ruth Abernathy', car: 'sovereign', color: 0xb88ad9 }],
      lines: [
        ['saff', 'This one\'s for the whole city, Mercer. Everyone\'s listening. Benji\'s doing commentary. Don\'t embarrass me.'],
        ['ruth', 'I\'ll send flowers.'],
        ['tollbooth', 'Everybody pays the Tollbooth. Tonight, so does the Tollbooth.'],
        ['jay', '(hands at ten and two) Long way round. My favourite kind.'],
      ] },
  ];
  A.raceWinAll = { flag: 'king_of_the_road', car: 'drifter', color: 0xd4a017, text: ['saff', 'Fine. FINE. You\'re the king of the road. Del Starr is going to say your name on air and I\'m going to have to listen to it.'] };

  // ------------------------------------------------------------ Dex's list
  // Unlocked after m05. After m22 Birdie texts the list (or Rhea takes it
  // over, if Dex went to Calder); after m23 cars go to Kostas Salvage.
  A.carList = [
    { type: 'ironclad', color: 0xc8102e, place: 'halberd_depot', pay: 1500,
      reason: 'Garza\'s candy-red Ironclad. He keyed Mrs. Oyelaran\'s car at the church. Karma has a tow hitch.',
      lines: [
        ['dex', 'First one on the list. Lucky Garza\'s candy-red Ironclad, parked at the Halberd depot like he owns the docks.'],
        ['dex', 'He keyed Mrs. Oyelaran\'s car in the church lot. During the service. Karma has a tow hitch, Jay.'],
        ['jay', 'And the buyer?'],
        ['dex', 'There\'s always a buyer. Not a scratch. I mean it. I can feel scratches. Spiritually.'],
      ],
      rhea: [['rhea', 'Calloway\'s list is mine now. Garza\'s red car. The depot. I pay less than he did and I complain more.']],
      birdie: 'Daddy says: Garza\'s red car at the depot. He said "karma has a tow hitch". I don\'t know what that means but he laughed for the first time this week.' },
    { type: 'sovereign', color: 0xefe6d0, place: 'pruitt_house', pay: 1800,
      reason: 'Pruitt\'s cream Sovereign. Parks in the disabled bay at St. Brigid\'s every Sunday. God sees. So do I.',
      lines: [
        ['dex', 'Councilman Pruitt\'s cream Sovereign. Crestline. The one with the bronze dog on the lawn.'],
        ['dex', 'Parks in the disabled bay at St. Brigid\'s every Sunday, walks in fine. God sees. So do I.'],
        ['jay', 'You go to church now?'],
        ['dex', 'Birdie goes. I sit in the truck and judge people\'s parking. It\'s my ministry.'],
      ],
      rhea: [['rhea', 'The councilman\'s cream saloon. He sweats on the leather. Don\'t let that put you off.']],
      birdie: 'Next one is the man with the dog statue\'s car. The cream one. Daddy says he parks in the wrong spot at church and God is cross.' },
    { type: 'zephyr', color: 0xc9ccd2, place: 'heron_corner', pay: 2400,
      reason: 'Saff\'s silver Zephyr, the sponsor car. A rolling billboard for energy drinks. We\'re doing her a favour.',
      lines: [
        ['dex', 'Saff\'s sponsor car. Silver Zephyr, Heron and Coral, covered in Glo-Gum decals.'],
        ['dex', 'It\'s a rolling billboard for energy drinks. We\'re doing her a favour. She\'ll get a new one. She\'ll get a better one. That\'s how sponsors work.'],
        ['jay', 'She\'s going to know it was me.'],
        ['dex', 'She already hates you. This is just admin.'],
      ],
      rhea: [['rhea', 'The silver hypercar at Heron Corner. Somebody\'s sponsor will cry. I\'ll survive.']],
      birdie: 'The shiny silver race car at the corner store. Saff\'s. Daddy says she has too many stickers anyway.' },
    { type: 'medic', color: 0xf2f2f2, place: 'mercy_general', pay: 1200,
      reason: 'A decommissioned Medic One. Not a real ambulance any more. I want the lights. Don\'t ask what for.',
      lines: [
        ['dex', 'There\'s a decommissioned ambulance behind Mercy General. Not a real one any more. Nobody\'s in it, nobody needs it. I checked twice.'],
        ['jay', 'What do you want an ambulance for?'],
        ['dex', 'I want the lights. Don\'t ask what for.'],
        ['dex', '(lowering his voice) It\'s Birdie\'s birthday. She wants a disco. I\'m not paying for a disco when there\'s a perfectly good ambulance.'],
        ['jay', 'If Mae sees me in it, she\'s going to kill me.'],
        ['dex', 'She\'s on nights. You\'ve got till six. Go.'],
      ],
      rhea: [['rhea', 'The old ambulance at Mercy. Calloway wanted it for his girl\'s party. I want it because he can\'t have it. Bring it.']],
      birdie: 'The old ambulance at the hospital. Daddy promised me a disco with the lights for my birthday. You don\'t have to. But you could.' },
    { type: 'vireo', color: 0x111111, place: 'vicehaven_tower', pay: 2200,
      reason: 'Voss\'s head of PR\'s black Vireo. Posts about "community" every hour. Let\'s see how she loves community on the bus.',
      lines: [
        ['dex', 'Black Vireo in the Vicehaven Tower forecourt. Belongs to Voss Meridian\'s head of PR.'],
        ['dex', 'Posts about "community" every hour. Hashtag Rise With Us. Let\'s see how much she loves community when she\'s on the 14 bus.'],
        ['jay', 'The 14 is a good bus.'],
        ['dex', 'The 14 is a great bus. That\'s the point. She\'ll learn something.'],
      ],
      rhea: [['rhea', 'The black coupe at the Voss tower. Take it slowly past the lobby windows. I want them to watch.']],
      birdie: 'A black car at the big tower. Daddy says the lady writes "community" on her phone but she has never been to ours.' },
    { type: 'beater', color: 0x9fd8b8, place: 'bayview_gardens', pay: 900,
      reason: 'A mint Rustbucket at Bayview Gardens. An old man called me. It\'s his, it\'s stolen, and he wants it back from his grandson.',
      lines: [
        ['dex', 'This one\'s different. Old fella called the garage. Mint-green Pipit Rustbucket, his. His grandson took it to Bayview and won\'t give it back.'],
        ['dex', 'He cried on the phone, Jay. Grown man. Eighty-two. Said it was the car he drove his wife home from the hospital in. Both kids.'],
        ['jay', 'So we\'re stealing it back.'],
        ['dex', 'We\'re returning it. With extreme prejudice. Pay\'s rubbish. I don\'t care. Go.'],
      ],
      rhea: [['rhea', 'An old man wants his car back from his grandson. Bayview. Mint green. This one\'s free. Don\'t tell anyone I do free.']],
      birdie: 'An old man wants his green car back. Daddy said this one is for being a good person. I said is that a real job and he said sometimes.' },
    { type: 'lowrider', color: 0xd4a017, place: 'lantern_alley', pay: 2000,
      reason: 'Teo\'s gold Duchess, Lantern Alley. Teo owes me for a gearbox. Teo knows. Tell Teo I said hi.',
      lines: [
        ['dex', 'Gold Duchess in Lantern Alley. Kings\' car. Teo owes me for a gearbox, a clutch and an apology.'],
        ['dex', 'Teo knows. Tell Teo I said hi.'],
        ['jay', 'You want me to steal a car from the Lantern Kings. On their street.'],
        ['dex', 'I want you to collect on a debt with style. If anyone can do it without getting stabbed, it\'s you. Probably.'],
      ],
      rhea: [['rhea', 'The Kings\' gold car. Teo will know it was you. Teo should learn to lock things.']],
      birdie: 'Daddy says take the gold car from Lantern Alley and tell Teo hi. He says Teo owes him a gear box. Is that a box of gears?' },
    { type: 'porter', color: 0x8a8f96, place: 'tannery_row', pay: 1600,
      reason: 'A grey Porter survey van on Tannery Row. It\'s full of Renewal notices. Bring it back empty. Use your imagination. Use a bin.',
      lines: [
        ['dex', 'Voss survey van. Grey Porter, parked on Tannery Row, full to the roof with Renewal notices.'],
        ['dex', 'Bring it back empty. Use your imagination. Use a bin. Use the sea. I\'m not your mother.'],
        ['jay', 'How many notices?'],
        ['dex', 'Enough to evict every family in Old Market twice. So, you know. Drive with feeling.'],
      ],
      rhea: [['rhea', 'The survey van on Tannery. Full of eviction paper. Paper burns. I\'m just saying.']],
      birdie: 'The grey van on Tannery Row has the scary letters in it. The ones that came to our garage. Daddy says throw them in a bin. A big one.' },
    { type: 'interceptor', color: 0xf0ece4, place: 'civic_plaza', pay: 0, decoy: true,
      reason: 'A pearl Interceptor in VPD charity livery at Civic Plaza. (nervous laugh) Don\'t. Actually, don\'t. Cross that one out.',
      lines: [
        ['dex', 'Next one is... (a pause) a pearl Interceptor. VPD charity livery. Civic Plaza.'],
        ['dex', '(a nervous laugh) Don\'t. Actually, don\'t. Cross that one out.'],
        ['jay', 'You put a police car on the list.'],
        ['dex', 'I didn\'t put it on. Someone asked. Doesn\'t matter. Cross it out, Jay. I mean it.'],
      ],
      rhea: [['rhea', 'There\'s a police car on Calloway\'s old list. Charity paint. I don\'t want it. Nobody sane wants it. I thought you should know who asked for it.']],
      birdie: 'There is a police car on Daddy\'s list. He crossed it out really hard so the pen went through. I don\'t think you should get that one.' },
    { type: 'mesa', color: 0x8a4a2a, place: 'crane_row', pay: 3000,
      reason: 'Kostya\'s rust Mesa at Crane Row. He bet me I couldn\'t steal it. I can\'t. You can.',
      lines: [
        ['dex', 'Last one. Big Kostya\'s rust Mesa on Crane Row. He bet me five hundred I couldn\'t steal it.'],
        ['dex', 'I can\'t. You can. That\'s legally the same thing.'],
        ['jay', 'Kostya is the size of a fridge.'],
        ['dex', 'Kostya is the size of two fridges. That\'s why you\'re going and I\'m staying here eating his money.'],
      ],
      rhea: [['rhea', 'Kostya\'s truck. He bet you can\'t. I bet you can. Don\'t make me lose to Kostya.']],
      birdie: 'The last car is Big Kostya\'s. Daddy bet him. If you win, Daddy says we\'re getting pizza. I want pizza. Please win.' },
  ];
  // Item 9 is a seed (someone asked Dex for a police car): it plays out as a
  // call that ends the job.
  A.carList[8].steps = [
    { if: 'm22_lugnut', then: [
      { if: 'dex_to_calder', then: [{ phone: 'rhea', say: A.carList[8].rhea }], else: [{ text: 'birdie', message: A.carList[8].birdie }] },
    ], else: [{ phone: 'dex', say: A.carList[8].lines }] },
    { spawnCar: 'decoy', type: 'interceptor', at: 'civic_plaza', color: 0xf0ece4 },
    { goto: 'civic_plaza', radius: 30, objective: 'Take a look at the charity cruiser' },
    { if: 'm22_lugnut', then: [
      { say: [['jay', '(looking at the pearl paint, the decals, the little VPD crest) Someone wanted this one off the street. Or wanted me in it.'], ['jay', '(quietly) Four years of this, Dex.']] },
    ], else: [
      { phone: 'dex', say: [
        ['dex', 'You\'re looking at it, aren\'t you. I can hear you looking at it.'],
        ['jay', 'Who asked for a police car, Dex?'],
        ['dex', 'Nobody. A guy. A joke. Leave it, Jay. Come back, I\'ll make coffee. The bad kind you like.'],
        ['jay', '(a long beat) Crossed out.'],
        ['dex', '(too relieved) Crossed out. Good. Great. Fudge. Good.'],
      ] },
    ] },
  ];

  // ------------------------------------------------------------ bounties
  // Unlocked after m10. Giver: Honor Blackwood. Drop-offs at VPD Central.
  const BOND = 'blackwood_bonds';
  A.bountyStart = BOND;
  A.bountyRequires = 'm10_sons';
  A.bounties = [
    { name: 'Darnell "Dimples" Price', reward: 3000, place: 'the_boardwalk',
      dossier: 'Darnell "Dimples" Price, 31. Insurance fraud by staged crashes. Bail $15,000. Drives a Pipit. Throws himself at bonnets.',
      steps: [
        { scene: { at: BOND, cast: [{ id: 'blackwood' }] }, say: [
          ['blackwood', 'Mercer. Sit. No, don\'t sit, that chair\'s evidence. Stand. Stand thoughtfully.'],
          ['blackwood', 'Darnell Price. "Dimples." Thirty-one counts of being hit by a car. Every single car was insured.'],
          ['jay', 'He gets hit by cars for money.'],
          ['blackwood', 'He gets hit by cars beautifully. Insurers have watched the footage. One of them cried.'],
          ['blackwood', 'He skipped on fifteen thousand of my dollars. He\'s on the boardwalk in a little yellow Pipit. Bring him to VPD Central.'],
          ['blackwood', 'Blackwood Bail Bonds believes in you, Mercer.'],
          ['jay', 'Conditionally.'],
          ['blackwood', '(touching the sign) It\'s on the window for a reason.'],
        ] },
        { spawnCar: 'dimples_car', type: 'pipit', at: 'the_boardwalk', color: 0xf2c14e },
        { goto: 'the_boardwalk', vehicle: true, radius: 40, objective: 'Find Dimples\' yellow Pipit on the boardwalk',
          say: [['jay', '(to the car) Gentle today. We\'re looking for a man who wants us to hit him. Don\'t give him the satisfaction.']] },
        { chase: 'dimples_car', mode: 'catch', objective: 'Box in the yellow Pipit — gently',
          say: [['caption', '(Dimples brakes hard, swerves in front of Jay on purpose, and waves.)'], ['jay', 'He\'s brake-checking me. He WANTS me to rear-end him.'], ['jay', 'Not today, Darnell.']] },
        { spawn: [{ char: 'dimples', at: 'dimples_car', behavior: 'idle' }] },
        { scene: { at: 'dimples_car', cast: [{ id: 'dimples' }] }, say: [
          ['dimples', '(rolling out of the car, clutching his neck) Ow. Ow! Whiplash. I\'m going to need a neck brace and a lawyer, in that order.'],
          ['jay', 'I didn\'t touch you.'],
          ['dimples', '(dropping the act instantly) Yeah, I noticed. That\'s actually insulting. Thirty-one people hit me, man. Thirty-one.'],
          ['jay', 'Get in. Seatbelt.'],
          ['dimples', 'Oh, now you care about safety.'],
        ] },
        { join: ['dimples'] },
        { goto: 'vpd_central', vehicle: true, objective: 'Take Dimples to VPD Central', say: [
          ['dimples', 'You know what the trick is? You go limp. Tension\'s what breaks bones. Babies and drunks bounce.'],
          ['jay', 'Is that where you learned it? Drunk?'],
          ['dimples', 'Ballet. Eleven years. My mama wanted a dancer. She got a professional pedestrian.'],
          ['dimples', 'Hey, if you see a bus, could you just open my door a little? For old times\' sake?'],
          ['jay', 'No.'],
        ] },
        { leave: ['dimples'], into: 'vpd_central' },
        { say: [['dimples', '(walking up the precinct steps, then a perfect stumble on the top one) Ow! These steps are a liability!']] },
      ] },
    { name: 'Veronika Stahl', reward: 6000, place: 'pruitt_house',
      dossier: 'Veronika Stahl, "the Crestline Cat", 36. Mansion burglaries. Bail $40,000. Last seen on the garden walls of Crestline.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'The Crestline Cat. Veronika Stahl. Eleven mansions in a year, never a window broken, never a dog woken.'],
          ['blackwood', 'She\'s been seen on the walls round Councilman Pruitt\'s villa tonight. She doesn\'t drive, she climbs. You\'ll want comfortable shoes.'],
          ['jay', 'I drive. That\'s the whole thing about me.'],
          ['blackwood', 'And I believe in you, conditionally. Today the condition is running.'],
        ] },
        { goto: 'pruitt_house', vehicle: true, radius: 25, objective: 'Get to Councilman Pruitt\'s villa' },
        { spawn: [{ char: 'veronika', at: 'pruitt_house', behavior: 'flee', flee: 30 }] },
        { goto: 'veronika', vehicle: false, radius: 2.2, objective: 'Catch the Crestline Cat',
          say: [['veronika', '(from the top of a garden wall) Oh, you\'re new. Blackwood sent a new one. How sweet.'], ['jay', '(breathing hard) I hate this. I hate legs.']] },
        { scene: { at: 'veronika', cast: [{ id: 'veronika' }] }, say: [
          ['veronika', '(sitting on the kerb, catching her breath, perfectly calm) Fine. You\'re faster than you look. You look like a man who sits down for a living.'],
          ['jay', 'I do. You took a councilman\'s silverware?'],
          ['veronika', 'I took a councilman\'s cufflinks, his wife\'s pearls and a little green notebook he keeps in the bread bin, which was far more interesting.'],
          ['veronika', 'I only rob people who take money they shouldn\'t. There\'s a list. Pruitt\'s on it. Half of Crestline is on it.'],
          ['jay', '(very still) A list.'],
          ['veronika', '(smiling) You know the one. I can see it on your face. Who have I missed, wheelman?'],
          ['jay', 'Get in the car.'],
          ['veronika', 'That\'s not a no.'],
        ] },
        { join: ['veronika'] },
        { goto: 'vpd_central', vehicle: true, objective: 'Take Veronika to VPD Central', say: [
          ['veronika', 'You know what\'s funny? Every house I hit has the same painting. Abstract. Blue. Bought from Voss Meridian\'s "art fund".'],
          ['veronika', 'It\'s how they launder. Ugly blue paintings. I can\'t prove it. I just hate them very much.'],
          ['jay', 'Why are you telling me this?'],
          ['veronika', 'Because you drove past three cops without blinking, and you looked at Pruitt\'s house like you wanted to set it on fire. We\'re colleagues.'],
        ] },
        { leave: ['veronika'], into: 'vpd_central' },
      ] },
    { name: 'The Buckley Brothers', reward: 4000, place: 'crane_row',
      dossier: 'Lou and Ray Buckley, 33 and 29. Produce-truck hijackings. Bail $20,000 each. Driving a stolen box truck round Crane Row.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'The Buckley brothers. They hijack produce trucks on the inland highway. Lettuce, tomatoes, avocados. Mostly avocados.'],
          ['jay', '(a pause) Which haulage firm?'],
          ['blackwood', 'Greenline. Why?'],
          ['jay', 'No reason. I drove for Greenline for three years.'],
          ['blackwood', 'Then you\'ll know how they drive. They\'re in a Hauler on Crane Row.'],
        ] },
        { spawnCar: 'buckley_truck', type: 'hauler', at: 'crane_row', color: 0x6b8f3a },
        { goto: 'crane_row', vehicle: true, radius: 45, objective: 'Find the Buckleys\' stolen truck on Crane Row' },
        { chase: 'buckley_truck', mode: 'catch', objective: 'Stop the box truck', say: [
          ['jay', 'Box truck. Top heavy, long brakes, wide on the turns. Same as every truck I ever hated.'],
          ['jay', 'Make him take a corner too fast. He\'ll do the rest.'],
        ] },
        { spawn: [{ char: 'lou_buckley', at: 'buckley_truck', behavior: 'idle' }, { char: 'ray_buckley', at: 'buckley_truck', behavior: 'idle' }] },
        { scene: { at: 'buckley_truck', cast: [{ id: 'lou_buckley' }, { id: 'ray_buckley' }] }, say: [
          ['ray_buckley', '(hands up) Okay! Okay. Don\'t shoot. We\'re avocado people. We\'re not shooting people.'],
          ['jay', 'Greenline trucks. Why Greenline?'],
          ['lou_buckley', '(spitting) Because we drove for them. Six years. They docked us for every bruised tomato, then they let us go a week before our pensions vested.'],
          ['ray_buckley', 'Robbed us first. We\'re just collecting. In avocados.'],
          ['jay', '(quietly) They docked me for the bruised ones too.'],
          ['lou_buckley', 'Then you know.'],
          ['jay', 'I know. I\'m still taking you in. I\'ll tell Blackwood you came quiet. That\'s all I\'ve got.'],
          ['ray_buckley', '(a long sigh) That\'s more than Greenline gave us.'],
        ] },
        { join: ['lou_buckley', 'ray_buckley'] },
        { goto: 'vpd_central', vehicle: true, objective: 'Take the Buckleys to VPD Central', say: [
          ['ray_buckley', 'Did you ever have Dale? Dispatch? Called everyone "champ"?'],
          ['jay', '"Champ, those lettuces won\'t chill themselves."'],
          ['lou_buckley', '(laughing despite himself) Every morning. Every damn morning.'],
          ['ray_buckley', 'What made you quit?'],
          ['jay', 'My grandmother died. I came home for a week.'],
          ['lou_buckley', 'How long ago?'],
          ['jay', '(a beat) A while.'],
        ] },
        { leave: ['lou_buckley', 'ray_buckley'], into: 'vpd_central' },
      ] },
    { name: '"Pastor" Declan Moody', reward: 2500, place: 'st_brigid_church',
      dossier: '"Pastor" Declan Moody, 50. A fake orphans\' charity run from the steps of St. Brigid\'s. Bail $12,000. Usually found preaching to tourists.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'Declan Moody. Not a pastor. Not a doctor. Not, it turns out, the father of forty orphans in Bolivia.'],
          ['blackwood', 'He collects for them on the steps of St. Brigid\'s every evening. Father Ilunga is not delighted.'],
        ] },
        { goto: 'st_brigid_church', vehicle: true, radius: 20, objective: 'Get to St. Brigid\'s' },
        { spawn: [{ char: 'ilunga', at: 'st_brigid_church', behavior: 'idle' }, { char: 'moody', at: 'st_brigid_church', behavior: 'flee', flee: 14 }] },
        { say: [
          ['moody', '(seeing Jay, dropping a collection bucket full of coins) Bless you, my son! Bless you! Goodbye!'],
          ['ilunga', '(calling after Jay) Mr Mercer! Please don\'t shoot in my garden. Chase him politely.'],
        ] },
        { goto: 'moody', vehicle: false, radius: 2.2, objective: 'Catch Moody before he gets out of the churchyard',
          say: [['moody', '(over his shoulder) The meek shall inherit the earth! I\'m not meek, so I\'m running!']] },
        { scene: { at: 'moody', cast: [{ id: 'moody' }, { id: 'ilunga' }] }, say: [
          ['moody', '(wheezing against a headstone) I\'m fifty. Fifty. Where is your mercy?'],
          ['ilunga', '(arriving, unhurried) Here, Declan. With the forty orphans. All of whom, I gather, are you.'],
          ['moody', 'Father, I meant to give some of it to the church.'],
          ['ilunga', 'You meant to. Yes. God and I keep a little list of everything people meant to do.'],
          ['ilunga', '(to Jay) Your grandmother put a twenty in his bucket every Friday. She knew. She said he looked hungry.'],
          ['jay', '(quiet) That sounds like her.'],
          ['ilunga', 'Go on. Take him. Drive gently. He\'s a liar, but he\'s our liar.'],
        ] },
        { join: ['moody'] },
        { goto: 'vpd_central', vehicle: true, objective: 'Take Moody to VPD Central', say: [
          ['moody', 'Lucinda Mercer. The pink house. She gave me plum cake once. Told me to get a real job.'],
          ['jay', 'Did you?'],
          ['moody', 'I got a better bucket.'],
          ['moody', '(after a while) I was sorry to hear. She was the only one who ever looked me in the eye when she put money in.'],
        ] },
        { leave: ['moody'], into: 'vpd_central' },
      ] },
    { name: 'Leon "The Magician" Castillo', reward: 4000, place: 'harbor_beach',
      dossier: 'Leon Castillo, 44, "the Magician". Escaped custody eleven times. Bail $25,000. Seen doing card tricks on Harbor Beach.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'Leon Castillo. The Magician. Eleven escapes. Handcuffs, a prison van, and once a moving ferry.'],
          ['blackwood', 'He\'s on Harbor Beach doing card tricks for tourists. Do not let him near your hands. Do not let him near your keys. Do not pick a card.'],
        ] },
        { goto: 'harbor_beach', vehicle: true, radius: 25, objective: 'Find Leon on Harbor Beach' },
        { spawn: [{ char: 'leon', at: 'harbor_beach', behavior: 'idle' }] },
        { goto: 'leon', vehicle: false, radius: 2.5, objective: 'Walk up to Leon' },
        { scene: { at: 'leon', cast: [{ id: 'leon' }] }, say: [
          ['leon', '(shuffling a deck without looking at it) Blackwood\'s new boy. Pick a card.'],
          ['jay', 'No.'],
          ['leon', 'Smart. Everyone picks a card. That\'s how I got off the ferry.'],
          ['leon', '(holding out his wrists) I\'ll come quietly. I always come quietly. It\'s the leaving I do loudly.'],
          ['jay', 'Back seat. Seatbelt.'],
          ['leon', '(admiring) Seatbelt. A man of principle.'],
        ] },
        { join: ['leon'] },
        { goto: 'civic_plaza', vehicle: true, radius: 30, objective: 'Take Leon to VPD Central', say: [
          ['leon', 'You know the secret of escaping? Everyone thinks it\'s locks. It\'s not. It\'s patience. People always look away eventually.'],
          ['jay', 'I\'m not going to look away.'],
          ['leon', 'Everyone looks away at a red light.'],
          ['jay', '(beat) We\'re not stopping at any red lights.'],
          ['leon', 'Then you\'ll get pulled over, and you\'ll look at the cop. Same thing. Patience.'],
        ] },
        { leave: ['leon'], vanish: true },
        { say: [
          ['caption', '(The back door clicks at the lights. When Jay turns, the seat is empty. The seatbelt is still buckled.)'],
          ['jay', '...Leon? LEON.'],
        ] },
        { phone: 'blackwood', say: [
          ['blackwood', 'Let me guess.'],
          ['jay', 'He buckled the seatbelt behind him.'],
          ['blackwood', 'Twelve. He\'s been spotted at the seawall overlook, watching the boats. He always goes somewhere with a view after. He\'s sentimental.'],
        ] },
        { spawn: [{ char: 'leon', at: 'seawall_overlook', behavior: 'idle' }] },
        { goto: 'seawall_overlook', vehicle: true, radius: 20, objective: 'Get to the seawall overlook' },
        { goto: 'leon', vehicle: false, radius: 2.5, objective: 'Get Leon back' },
        { scene: { at: 'leon', cast: [{ id: 'leon' }] }, say: [
          ['leon', '(not turning round) Pretty, isn\'t it. I never get to see it. I\'m always running past it.'],
          ['jay', 'How did you do the seatbelt?'],
          ['leon', 'A magician never tells.'],
          ['leon', '(finally turning) You came back for me. Most of them just call it in. You came yourself.'],
          ['jay', 'I don\'t like leaving people in places.'],
          ['leon', '(a long look) No. I can see that. Fine. Twelve escapes is a good number. I\'ll retire on it.'],
        ] },
        { join: ['leon'] },
        { goto: 'vpd_central', vehicle: true, objective: 'Take Leon to VPD Central. Watch the mirror.', say: [
          ['leon', 'For the record, I\'m staying because I want to, not because of your locks. Your locks are a disgrace.'],
          ['jay', 'Noted.'],
        ] },
        { leave: ['leon'], into: 'vpd_central' },
      ] },
    { name: 'Tavish Groom', reward: 5000, place: 'halberd_depot',
      dossier: 'Tavish Groom, 38. Former Halberd guard. Wanted for beating a Casa Palma tenant during an eviction. Bail $30,000. His old friends are hiding him at the depot.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'Tavish Groom. Ex-Halberd. Put a man from Casa Palma in hospital during an eviction. Seventy-three years old. Broke his hip on his own stairs.'],
          ['blackwood', 'Halberd fired him for the paperwork, then hid him at the docks depot for the loyalty. He\'ll have friends. With rifles.'],
          ['jay', 'Casa Palma. Which tenant?'],
          ['blackwood', 'A Mr Ruiz. Third floor.'],
        ] },
        { phone: 'lourdes', say: [
          ['lourdes', 'Jay? Mae says you\'re doing the bail man\'s jobs now. Is it the one who hurt Hector Ruiz?'],
          ['jay', 'Yeah.'],
          ['lourdes', 'Hector taught Tommy to play dominoes. He still can\'t do the stairs.'],
          ['lourdes', '(a breath) Don\'t get hurt. And don\'t you dare make it easy for that man.'],
        ] },
        { goto: 'halberd_depot', vehicle: true, radius: 45, objective: 'Get to the Halberd docks depot' },
        { checkpoint: true, music: 'action' },
        { spawn: [
          { faction: 'halberd', at: 'halberd_depot', count: 4, weapon: 'smg', behavior: 'guard', group: 'friends' },
          { faction: 'halberd', at: 'halberd_depot', count: 2, weapon: 'rifle', behavior: 'attack', group: 'friends' },
          { char: 'tavish', at: 'halberd_depot', behavior: 'cower' },
        ] },
        { kill: 'group:friends', objective: 'Take out Groom\'s Halberd friends', say: [['tavish', '(behind a van) You\'re making a mistake! The old man fell! He fell!']] },
        { goto: 'tavish', vehicle: false, radius: 2.2, objective: 'Grab Tavish Groom' },
        { scene: { at: 'tavish', cast: [{ id: 'tavish' }] }, say: [
          ['tavish', 'He came at me with a broom handle! What was I supposed to do?'],
          ['jay', 'He\'s seventy-three.'],
          ['tavish', 'I had orders. Clear the floor by noon. You don\'t know what Halberd\'s like when you miss noon.'],
          ['jay', 'I\'m learning. Get in.'],
          ['tavish', 'You think the cops will hold me? Halberd lawyers will have me out by dinner.'],
          ['jay', 'Then you\'ll have a nice dinner, Tavish. Mr Ruiz won\'t. He can\'t get down the stairs to the table.'],
        ] },
        { join: ['tavish'] },
        { music: 'tension' },
        { goto: 'vpd_central', vehicle: true, objective: 'Take Groom to VPD Central', say: [
          ['tavish', '(after a long silence) Is he okay? The old guy?'],
          ['jay', 'No.'],
          ['tavish', '(quietly) Yeah. Okay.'],
        ] },
        { leave: ['tavish'], into: 'vpd_central' },
        { text: 'lourdes', message: 'Hector says thank you. He made you a domino set. I am keeping it until you come for dinner.' },
      ] },
    { name: 'Mona "Bumper" Kessel', reward: 3500, place: 'heron_corner',
      dossier: 'Mona "Bumper" Kessel, 27. Steals cars off the street-race grid and runs people down to get away. Bail $18,000. She drives a Drifter out of Heron Corner.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'Mona Kessel. "Bumper." She steals cars off race grids. Last month she drove through a crowd at Heron and Coral to get away.'],
          ['blackwood', 'She\'s back at the corner tonight in a black Drifter, looking for her next one.'],
        ] },
        { if: 'nightshift_done', then: [
          { say: [['jay', '(quietly) Hit and run. At Heron and Coral.'], ['jay', 'Mr Baptiste swept that corner for thirty years.']] },
        ] },
        { spawnCar: 'mona_car', type: 'drifter', at: 'heron_corner', color: 0x1c1c1f },
        { goto: 'heron_corner', vehicle: true, radius: 40, objective: 'Find the black Drifter at Heron and Coral' },
        { checkpoint: true, music: 'action' },
        { chase: 'mona_car', mode: 'catch', objective: 'Run Bumper off the road', say: [
          ['jay', 'She drifts everything. Wide on the exits. Wait for it...'],
          ['jay', 'There. Now.'],
        ] },
        { spawn: [{ char: 'mona', at: 'mona_car', behavior: 'idle' }] },
        { scene: { at: 'mona_car', cast: [{ id: 'mona' }] }, say: [
          ['mona', '(climbing out, furious) You know who I am? I\'ve never lost on Heron. Never.'],
          ['jay', 'You put a kid in a wheelchair on Heron.'],
          ['mona', 'He was in the road!'],
          ['jay', 'He was on the kerb. I\'ve seen the footage. You looked at him and you didn\'t brake.'],
          ['mona', '(a flicker of something) ...I didn\'t think. I never think. That\'s why I\'m fast.'],
          ['jay', 'That\'s why you\'re caught. Get in.'],
        ] },
        { join: ['mona'] },
        { goto: 'vpd_central', vehicle: true, objective: 'Take Bumper to VPD Central', say: [
          ['mona', 'How do you drive like that and not hit anything?'],
          ['jay', 'Someone taught me. In a car park. Hands at ten and two.'],
          ['mona', 'That\'s it? That\'s the secret?'],
          ['jay', 'Heart at twelve. That\'s the part you skipped.'],
        ] },
        { leave: ['mona'], into: 'vpd_central' },
      ] },
    { name: 'Otis Wembley', reward: 0, place: 'bayview_gardens',
      dossier: 'Otis Wembley, 62. Pelican Home Equity\'s former loan officer. Wanted for embezzlement — he stole from Pelican. Bail $50,000. Hiding at Bayview Gardens.',
      steps: [
        { phone: 'blackwood', say: [
          ['blackwood', 'Otis Wembley. Signed more reverse mortgages for Pelican than anyone in the city. Then he stole two million from them.'],
          ['blackwood', 'Fifty thousand bail. The biggest bond I\'ve ever written. He\'s at Bayview Gardens, the retirement place. Someone there is hiding him.'],
          ['jay', 'Pelican. He signed reverse mortgages.'],
          ['blackwood', 'Lots of them. Why?'],
          ['jay', '(a beat) No reason.'],
        ] },
        { goto: 'bayview_gardens', vehicle: true, radius: 20, objective: 'Get to Bayview Gardens' },
        { spawn: [{ char: 'otis', at: 'bayview_gardens', behavior: 'cower' }, { char: 'lefty', at: 'bayview_gardens', behavior: 'idle' }] },
        { scene: { at: 'bayview_gardens', cast: [{ id: 'otis' }, { id: 'lefty' }] }, say: [
          ['lefty', '(standing in front of a trembling man in a cardigan) Not one step, sonny. He\'s one of ours now.'],
          ['otis', 'Loretta, please, he\'s just doing his —'],
          ['lefty', 'Shush, Otis.'],
          ['otis', '(to Jay) I signed your grandmother\'s papers. Lucinda Mercer. I recognised the name on the news.'],
          ['otis', 'I told her it was a good product. I told everyone. Then I saw what it did. Half the people in this courtyard lost their houses on my signature.'],
          ['otis', 'So I took the money back. Two million. It\'s in their accounts. Every cent. I kept nothing. I live in Lefty\'s spare room.'],
          ['lefty', 'He makes the coffee. Badly.'],
          ['jay', '(long silence) Her papers. Did she understand them?'],
          ['otis', '(barely) She asked me three times if her grandson would still have the house. I said yes. Three times.'],
        ] },
        { choice: { prompt: 'Otis Wembley', options: [
          { label: 'Take him in.', flag: 'otis_taken', then: [
            { say: [['jay', 'I\'m sorry, Lefty.'], ['lefty', '(stepping aside, hard-eyed) No, you\'re not. You\'re just doing it.'], ['otis', 'It\'s all right, Loretta. He should. I lied to his grandmother.']] },
            { join: ['otis'] },
            { goto: 'vpd_central', vehicle: true, objective: 'Take Otis to VPD Central', say: [
              ['otis', 'Can we go past Heron Street? Just once. I\'d like to see it.'],
              ['jay', '(after a while) It\'s still pink.'],
              ['otis', 'Good. Good. I\'m glad.'],
            ] },
            { leave: ['otis'], into: 'vpd_central' },
            { reward: { money: 10000 } },
          ] },
          { label: 'Let the Foxes keep him.', flag: 'otis_free', then: [
            { say: [
              ['jay', '(turning back to the car) Tell Blackwood I couldn\'t find him.'],
              ['otis', '(crying quietly) Thank you. Thank you, Mr Mercer.'],
              ['jay', 'Don\'t thank me. Make better coffee.'],
              ['lefty', 'That\'s a good boy. There\'ll be pie. Don\'t argue about the pie.'],
            ] },
            { text: 'lefty', message: 'Pie on your porch. Peach. Otis cried into the crust, don\'t tell him I told you. Fox rules: you\'re one of ours now too.' },
          ] },
        ] } },
      ] },
  ];

  // ------------------------------------------------------------ turf wars
  // Unlocked after m10. Hold the spot against waves.
  A.turf = [
    { name: 'Turf war: Lantern Alley', place: 'lantern_alley', faction: 'halberd', reward: 1500, survive: 120,
      desc: 'Halberd wants the lanterns down. The Kings want them lit.',
      lines: [
        ['teo', 'They\'re cutting the lanterns tonight. Renewal says they\'re a "fire hazard". My grandmother hung half of these.'],
        ['wick', 'We got bottles, bats and Mr Tran\'s noodle cart as cover. And you.'],
        ['teo', '(to Jay) Don\'t make it a thing. Just hold the end of the alley.'],
      ],
      win: [['teo', '(looking up at the lanterns) Still lit.'], ['teo', 'Kings got armour in the back of the noodle cart. Anytime you need it. Don\'t make it a thing.']] },
    { name: 'Turf war: Tannery Row', place: 'tannery_row', faction: 'halberd', reward: 1800, survive: 120,
      desc: 'Survey crews and their Halberd escort are stapling eviction notices to the stalls.',
      lines: [
        ['teo', 'Survey crew. Twenty notices a minute. They want the stalls gone by the vote.'],
        ['sami', '(from behind his tea urn) Young man. If you are going to fight, fight away from the tea.'],
        ['jay', 'Yes, Mr Haddad.'],
      ],
      win: [['sami', '(pouring Jay a tiny glass of mint tea) My daughter says you are a terrible influence. Drink. On the house. Forever.']] },
    { name: 'Turf war: Heron Corner', place: 'heron_corner', faction: 'salts', reward: 2100, survive: 120,
      desc: 'The Salts want a cut of the race purse. The Kings say the corner belongs to the neighbourhood.',
      lines: [
        ['teo', 'Salts want a cut of the races. Rhea says it\'s not her. Rhea says that a lot.'],
        ['saff', '(from her car, filming) Is this a gang war? Can I stream it? Benji would LOVE this.'],
        ['jay', 'Saff. Go home.'],
      ],
      win: [['saff', 'Okay, new rule: entry fees are halved and nobody gets stabbed. Pulse 96.4 says thank you, I guess. Ugh.']] },
    { name: 'Turf war: Crane Row', place: 'crane_row', faction: 'halberd', reward: 2600, survive: 120,
      desc: 'Halberd is tearing down the dockers\' union banners for the automated terminal.',
      lines: [
        ['rhea', 'They pulled down the union banner. My father\'s name is on that banner. Hold the row while my boys put it back up.'],
        ['kostya', 'I will hold the banner. You hold everything else.'],
      ],
      win: [['rhea', 'The banner\'s up. You get the family rate now. Four per cent instead of six. Don\'t tell anyone. It\'s bad for my reputation.']] },
    { name: 'Turf war: The Boardwalk', place: 'the_boardwalk', faction: 'halberd', reward: 3000, survive: 120,
      desc: 'The Halberd "Renewal Patrol" is clearing buskers and stalls off the boardwalk.',
      lines: [
        ['teo', 'Renewal Patrol\'s clearing the boardwalk. The steel-drum guy\'s been here since my mum was a kid.'],
        ['wick', 'He played at my cousin\'s funeral. And my cousin\'s other funeral. Different cousin.'],
        ['teo', 'Hold the boardwalk. Let the man play.'],
      ],
      win: [['teo', '(as a steel drum starts up behind them) Hear that? That\'s the city.'], ['teo', '(beat) I didn\'t say anything nice. Don\'t make it a thing.']] },
  ];

  // ------------------------------------------------------- ambient texts
  S.texts.push(
    { after: 'm01_homecoming', from: 'birdie', message: 'Daddy let me use his phone. Are you really staying a week? A week is 7 days. I checked.' },
    { after: 'm02_what_she_left', from: 'oyelaran', message: 'Her key is under MY mat now. Come for supper. Don\'t argue.' },
    { after: 'm03_ten_and_two', from: 'noor', message: 'Post-job analysis: you ran two reds I didn\'t give you. Unacceptable. Also incredible.' },
    { after: 'm04_casa_palma', from: 'teo', message: 'Mural\'s fine. Don\'t make a thing of it.' },
    { after: 'm05_the_toolbox', from: 'dex', message: 'Rhea likes you. Rhea doesn\'t like anyone. Should I be worried?' },
    { after: 'm06_tick_tock', from: 'calder', message: 'Card\'s got my cell on the back. I don\'t sleep. Call whenever.' },
    { after: 'm07_signal_fire', from: 'noor', message: 'I made the light outside my apartment green for 40 minutes to see if anyone would notice. Nobody noticed. Power is lonely.' },
    { after: 'm08_your_home_our_future', from: 'ansel', message: 'Planted a lemon tree in your grandmother\'s yard. She had a spot for one. I could tell.' },
    { after: 'm09_the_gate', from: 'augie', message: 'Learning to text. This is very small. Where are the vowels kept' },
    { after: 'm10_sons', from: 'augie', message: 'He threw you the shotgun. That means something. Don\'t tell him I said so.' },
    { after: 'm11_celias_garden', from: 'rhea', message: 'Your laundry is dry and secure. Storage fee is 4%. Sentiment fee is 0%.' },
    { after: 'm12_the_councilmans_pool', from: 'hollis', message: 'The poodle\'s owner wants to tip you. I said you\'d left the company. Please leave the company.' },
    { after: 'm13_pension', from: 'calder', message: 'Don\'t go to the depot road for a week. Don\'t ask why. (It\'s because I asked you to go there.)' },
    { after: 'm14_dry_run', from: 'birdie', message: 'Mr Augie owes me 340 poker chips. Tell him interest is a thing.' },
    { after: 'm15_armour', from: 'noor', message: 'I didn\'t. I want you to know that before you decide what you think.' },
    { after: 'm16_the_starlite', from: 'mae', message: 'Thank you for holding the light.' },
    { after: 'm17_canary', from: 'teo', message: 'I\'m sorry. I don\'t know who else to say it to.' },
    { after: 'm19_the_first_letter', from: 'augie', message: 'Good morning, kid. Best sunrise in three years.' },
    { after: 'm21_two_ten', from: 'lourdes', message: 'Mae told me. I\'m making food. You\'ll come and you\'ll eat. That\'s all.', delay: 45 },
    { after: 'm22_lugnut', from: 'birdie', requiresFlag: '!dex_to_calder', message: 'Daddy is sad and won\'t say why. Is it because of the policeman?' },
    { after: 'm23_ashes', from: 'ilunga', message: 'He asked me to tell you, if it ever came to this, that he was proud. I\'m telling you.' },
    { after: 'm24_the_notebook', from: 'noor', message: 'Found a page in Augie\'s notebook you missed. It says \'Jay: 11/10. Would steal my car again.\'' },
    { after: 'm26_gold_watch', from: 'calder', message: 'Horne\'s cruiser was on the morning news. Under the Beacon. Lights on. I have never been happier at work.' },
    { after: 'm27_the_night_before', from: 'mae', message: 'Get some sleep. Ten and two.' },
    { after: 'ns4_gus_last_shift', from: 'gus', message: 'Baby Gus is 8 pounds 2. Mae says you cried. Mae also cried. I cried the most. Retirement is going to be great.' },
    { after: 'wc4_the_last_wedding', from: 'tasha', message: 'Grandpa hasn\'t stopped talking about how you took the corner onto Grand. He says you drive like his Constance danced.' },
    { after: 'da4_signal_boost', from: 'solace', message: 'Ratings are up 4000%. That\'s a made-up number. The truth is somebody\'s listening. That\'s enough.' },
  );
  // Walt's death, once the Silver Foxes chain and m25 are both done, in
  // whichever order: m27, da3 and m31 take him as gone from then on.
  const waltText = 'Walt passed in his sleep. He thought it was 1981 and Ruthie was making coffee. Good way to go. Funeral Tuesday. Wear the good shoes.';
  S.texts.push(
    { after: 'm25_iron', from: 'lefty', requiresFlag: 'foxes_done', message: waltText },
    { after: 'sf4_returns', from: 'lefty', requiresFlag: 'm25_iron', message: waltText },
  );

  // ---------------------------------------------------------------- radio
  // Station index matches VH.Radio: 0 Sunset Drive, 1 Pulse, 2 Harbor Heat.
  // `after` hides a line until that job is done; `flag` until that flag is set.
  A.radio = [
    { dj: 'dj_del', lines: [
      { text: 'This is Del Starr on Sunset Drive, for the night drivers. Windows down, heart up, and whatever you\'re running from, it\'s slower than you.' },
      { text: 'The moon\'s out over Harbor Point tonight. Hi, moon. Don\'t call me.' },
      { text: 'Kleen Karma Car Wash. Wash the car, wash the soul. Soul wash is extra. Offer void in Crestline.' },
      { text: 'A request from someone in Old Market, for "the man who parked the poodle". I don\'t know what that means, but it\'s beautiful.', after: 'm12_the_councilmans_pool' },
      { text: 'Word is there was a race on Heron last night and the police came second. Congratulations to the police.', after: 'm06_tick_tock' },
      { text: 'The Starlite Diner, open since before you were born and open after you\'re gone. Pie is not a metaphor.' },
      { text: 'You know what they never put on postcards? The street at four a.m. when it\'s just you and the lights. That\'s the real city. Stay with me.' },
      { text: 'Voss Meridian presents The Crown. Rise with us. (sighs) Well. Some of us will rise. Here\'s a song about falling.' },
      { text: 'This next one\'s for Augustine Vance, who used to call in every Tuesday and request the same song. Rest easy, Augie.', after: 'm22_lugnut' },
      { text: 'Bayside Mattress Kingdom. Sleep like you\'ve got nothing to hide.' },
      { text: 'It\'s three a.m., night drivers. If you\'re thinking about calling someone, call them. Trust Del.' },
      { text: 'I played a wedding anniversary once, on Heron Street. Lucinda and Cal senior. Forty years. She danced like the floor owed her money. Goodnight, Lucinda.', after: 'm02_what_she_left' },
      { text: 'Shout-out to the king of the road. Saff Achterberg asked me not to say your name, honey, so I won\'t. But we all know.', flag: 'king_of_the_road' },
    ] },
    { dj: 'dj_benji', lines: [
      { text: 'PULSE NINE-SIX-FOUR, Benji Blue, and if your heart rate isn\'t at a hundred and forty you\'re basically asleep, babe!' },
      { text: 'Glo-Gum. Chew it and your mouth GLOWS. Glo-Gum is not responsible for anything your mouth does next.' },
      { text: 'Shout-out to Saff Achterberg, undefeated on Heron Corner. Well, defeated once. We don\'t talk about it. We manifest past it.', after: 'race_heron' },
      { text: 'Hydrate, Vicehaven! It\'s thirty-four degrees and your body is sixty per cent regret!' },
      { text: 'Halberd Home Protection. Because the police can\'t be everywhere. And we can. Legally, mostly.' },
      { text: 'I just got a text that says "turn it down". Babe, I AM the volume.' },
      { text: 'Pelican Home Equity got robbed by people in flamingo masks and honestly? Iconic. Don\'t do crime. But iconic.', after: 'm08_your_home_our_future' },
      { text: 'Pelican Payday Advance. Money today, feelings tomorrow!' },
      { text: 'Deep breath. In through the nose, out through the bass. That\'s a technique. I invented it just now.' },
      { text: 'Captain Crabby\'s Crab Shack on the boardwalk. Claws out, prices down, napkins mandatory.' },
      { text: 'Somebody parked a police cruiser under the Beacon with the lights on and left it there? That\'s art. That\'s an installation.', after: 'm26_gold_watch' },
      { text: 'Breaking, babes: the boardwalk buskers are BACK. Steel drums at sunset. That is a whole vibe and I am manifesting it nightly.', after: 'turf_5' },
    ] },
    { dj: 'dj_sable', lines: [
      { text: 'Harbor Heat. It\'s Sable. The city\'s quiet tonight. Quiet\'s usually the part before the noise.' },
      { text: 'Tidewater Security. Trusted for thirty years. (pause) Mostly trusted. Here\'s a record.' },
      { text: 'Man in the white suit wants to put a glass tower where my grandmother bought fish. Progress, they say. Progress for who?' },
      { text: 'The Vicehaven Lottery. The Big Tide. Somebody\'s got to win. It\'s statistically not you.' },
      { text: 'If you\'re a Salt working the night shift on Crane Row, this is for you. Somebody\'s got to move the world.' },
      { text: 'Cops say they lost an evidence box last night. Cops lose a lot of things. Evidence. Reputations. Kids.', after: 'm13_pension' },
      { text: 'VossMart. Everything you need, everywhere you used to shop.' },
      { text: 'Heads up, Old Market: Halberd trucks on Tannery tonight. Look after each other. Nobody else is going to.' },
      { text: 'Lot of sirens down at Pier 9 last night. Lot of silence this morning. I know which one I believe.', after: 'm21_two_ten' },
      { text: 'Solace is on after midnight. I don\'t know how she keeps getting into my transmitter. (deadpan) I\'m furious.', after: 'm12_the_councilmans_pool' },
      { text: 'Mercado Fresh, a family business since before families were a business.' },
      { text: 'Somebody put the dockers\' banner back up on Crane Row. My granddad\'s name is on it. Whoever you are: thank you.', after: 'turf_4' },
    ] },
  ];
})();
