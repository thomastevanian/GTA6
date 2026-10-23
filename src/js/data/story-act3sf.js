/*
 * data/story-act3sf.js — side chain 2, THE SILVER FOXES (sf1 to sf4), for
 * "Ten and Two". Giver: Lefty Marchetti. Unlocks after m06_tick_tock.
 *
 * Three robbers with a combined age of two hundred and twenty-four want one
 * last job: to rob Pelican's "Golden Years Equity" scheme, which has been
 * bleeding their retirement home dry in cash, one envelope at a time. It is
 * the comedy chain. It is also, quietly, about memory, because Walt's is
 * going, and in his head it is 1981 and Jay is Frankie, their old driver.
 *
 * Sets: foxes_done (sf4). Local flags: sf_frankie / sf_truth (sf3).
 * Reads: otis_free / otis_taken (bounty 8, story-extras.js).
 *
 * Invented here that later acts lean on (and that the act 4 files already
 * assume): Frankie drove for the Foxes for six years and in 1983, on the
 * Pembroke job, drove off with the money and left Walt on the kerb. Walt did
 * five years; Ruthie waited all five; Walt never said Frankie's name again
 * until his memory went. "Fox rules": nobody gets hurt and everybody gets
 * home. Lefty wants the mint car back on Sundays (Ending B). Marvin Teague
 * gets his 1979 hat back. The window booth at the Starlite was Walt and
 * Ruthie's before it was Jay and Mae's: there's a W+R under the J+M.
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;

  let chain = S.side.find((c) => c.id === 'side_foxes');
  if (!chain) {
    chain = { id: 'side_foxes', title: 'The Silver Foxes', giver: 'lefty', unlockAfter: 'm06_tick_tock', missions: [] };
    S.side.push(chain);
  }

  // ------------------------------------------------------------ colours
  const MINT = 0x9fc9b0;
  const PELICAN_GOLD = 0xd9b53a;
  const HALBERD = 0x3a3f45;

  // ---------------------------------------------- extra minor characters
  // story-act3.js already defines teague, ruthie and courier for this chain;
  // these are fallbacks only, so the chain still runs if that file changes.
  const fallback = {
    teague: {
      name: 'Marvin Teague', role: 'Tannery Row market security', age: 66,
      look: { skin: 0x6b3f28, hair: 0xc9c6c0, top: 0x4a5a3a, bottom: 0x2a2e36, shoes: 0x111111, build: 'heavy', hat: true },
      voice: { gender: 'male', pitch: 0.85, rate: 1.0 },
      bio: 'A rookie patrolman in 1979. The Silver Foxes took his hat. He has never got over it.',
    },
    ruthie: {
      name: 'Ruthie Pomeroy', role: "Walt's wife (memory)", age: 34,
      look: { skin: 0xe0b08a, hair: 0x8a4a2a, top: 0xf2c6a0, bottom: 0x4a5a7a, shoes: 0xefefef, build: 'slim', longHair: true },
      voice: { gender: 'female', pitch: 1.15, rate: 1.05 },
      bio: 'Lemon meringue, the window booth, and a laugh you could hear from the kitchen.',
    },
    courier: {
      name: 'Pelican courier', role: 'Golden Years Equity collections', age: 29,
      look: { skin: 0xf1d0b0, hair: 0x6e4a2c, top: 0xd9b53a, bottom: 0x2e3f5c, shoes: 0x111111, build: 'slim' },
      voice: { gender: 'male', pitch: 1.05, rate: 1.1 },
    },
  };
  for (const [id, c] of Object.entries(fallback)) if (!S.characters[id]) S.characters[id] = c;

  Object.assign(S.characters, {
    kiosk_kid: {
      name: 'Benny Ruiz', role: 'Boardwalk phone-case kiosk', age: 19,
      look: { skin: 0xc68c64, hair: 0x16110d, top: 0x2ab3a6, bottom: 0x1c1c1f, shoes: 0xefefef, build: 'slim', hat: true },
      voice: { gender: 'male', pitch: 1.15, rate: 1.12 },
      bio: 'Sells phone cases where the flower cart used to be. Has never once been asked for a carnation, until tonight.',
    },
  });

  // Two back doors off Tannery Row for the Walker job (sf2).
  Object.assign(S.places, {
    tannery_fish_alley: { name: 'The fish alley', district: 'oldmarket', kind: 'alley', desc: 'The alley behind the Tannery Row fish stalls: meltwater in the gutter, crates of crushed ice, and a back door marked STAFF ONLY in three languages.' },
    tannery_loading_bay: { name: 'The Tannery Row loading bay', sign: 'DELIVERIES', district: 'oldmarket', kind: 'garage', desc: 'The loading bay at the side of the Tannery Row market: roll-up doors that never close, pallets of knock-off sneakers, and a forklift with a flat tyre.' },
  });

  /** A charcoal Halberd patrol Ironclad. */
  const halberdSuv = (id, at) => ({ spawnCar: id, type: 'ironclad', at, color: HALBERD });

  /** The Foxes' forty-year-old getaway car. */
  const foxesCar = (at) => ({ spawnCar: 'foxes_car', type: 'beater', at, color: MINT });

  // ===================================================================
  // sf1 OLD HANDS
  // ===================================================================
  chain.missions.push({
    id: 'sf1_old_hands',
    title: 'Old Hands',
    giver: 'lefty',
    start: 'bayview_gardens',
    time: 10,
    estMinutes: 8,
    summary: "Three bank robbers with a combined age of two hundred and twenty-four need a wheelman who doesn't drive like a hearse.",
    reward: { money: 500 },
    failIf: ['wrecked:foxes_car'],
    steps: [
      foxesCar('bayview_gardens'),
      { scene: { at: 'bayview_gardens', cast: ['lefty', 'duke', 'walt'] }, say: [
        ['caption', '(Bayview Gardens, ten in the morning. A shuffleboard court, and a banner: PELICAN GOLDEN YEARS EQUITY. YOUR HOME, WORKING FOR YOU. Under it, three old people, waiting.)'],
        ['lefty', "(not getting up from the bench) You're Lucinda Mercer's grandson. Grace Oyelaran plays canasta with me. She says you drive like the devil's late for church."],
        ['jay', 'Grace cheats at canasta.'],
        ['lefty', "Everybody cheats at canasta. That's what canasta is for. Loretta Marchetti. (to the others) He's fine. Sit down, Duke."],
        ['duke', '(who has not stood up; cream cardigan, a cravat, a very old kind of handsome) Duke Fairweather. Charmed, presumably.'],
        ['walt', "(tall, in a good hat, beaming at Jay like a bus has finally come) There he is. Told you he'd come. (warmly) Frankie. You got thin."],
        ['caption', "(Lefty's eyes are on Jay. Whatever he says next, she will remember.)"],
        ['jay', '(beat) ...Hi, Walt.'],
        ['lefty', "(a tiny nod, filed away) Walt Pomeroy. Walt's having a seventy-nine sort of morning. Go with it or don't. He won't hold it against you. He doesn't hold much."],
        ['duke', "In 1979 the Evening Courier named us the Silver Foxes. After the Delacroix Furs job. Forty silver-fox coats, out the back door in eleven minutes."],
        ['lefty', "In August. In Vicehaven. We couldn't give them away. Duke wore one to his mother's funeral."],
        ['walt', '(fondly) He looked like a bear who had done well for himself.'],
        ['jay', 'What do you want?'],
        ['lefty', "(nodding at the banner) Pelican told everybody here their houses could work for them. Houses don't work. People work. Houses sit there and be your house."],
        ['lefty', 'Now Pelican owns forty-one of them, and charges the people who used to live in them a residency fee. Cash, monthly. For the privilege of having been robbed.'],
        ['caption', '(Across the courtyard a young man in a mustard Pelican polo is collecting envelopes door to door. A woman on a walking frame hands him one. He does not look at her.)'],
        ['lefty', "He does twelve homes up and down the coast and takes it all somewhere. We'd like to know where. And then we'd like to take it back."],
        ['lefty', "(before he can say it) Seventy-one. Duke's seventy-five. Walt's seventy-eight and, this morning, about thirty-one. We don't need muscle and we don't need a plan. I am the plan."],
        ['lefty', 'We need a driver. The last boy drove like a hearse. Respectful. Lovely at the corners. Got us to the bank and indicated.'],
        ['duke', '(gravely) He indicated at the bank, Mr. Mercer.'],
        ['jay', "(despite himself) That's bad."],
        ['lefty', "Today you just follow that boy. You don't touch him, you don't scare him, nobody gets so much as a paper cut. Fox rules."],
        ['jay', 'What are Fox rules?'],
        ['lefty', 'Nobody gets hurt, and everybody gets home. The rest is detail.'],
        ['caption', "(At the kerb: a compact so old it has an ashtray in every door. It was mint green once. Now it's the green of a mint somebody found in a coat.)"],
        ['lefty', "That's the car. She's older than you and she's been to prison less."],
      ] },
      { join: ['lefty', 'duke', 'walt'], weapon: 'fists' },
      { getIn: 'foxes_car', objective: 'Get in the Foxes\' car', say: [
        ['jay', 'Seatbelts.'],
        ['duke', 'Mr. Mercer, I am seventy-five years old.'],
        ['lefty', '(click) Do as he says, Duke. He has a face like a parole officer.'],
        ['walt', '(click, delighted) Frankie and his seatbelts.'],
      ] },
      { spawnCar: 'courier_car', type: 'beater', at: 'bayview_gardens', color: PELICAN_GOLD },
      { spawn: [{ char: 'courier', at: 'courier_car', behavior: 'drive', car: 'courier_car', to: 'tannery_row', hostile: false }] },
      { music: 'tension' },
      { follow: 'courier_car', to: 'tannery_row', min: 15, max: 100, checkpoint: true, objective: "Follow the Pelican courier's gold compact. Not too close. He's a boy, not an idiot.", say: [
        ['lefty', "Not too close. He's a boy, not an idiot. (beat) Well. He's a boy."],
        ['duke', 'In 1979 we tailed the Delacroix van for a week and never once got closer than a block.'],
        ['lefty', 'In 1979 you tailed the wrong van for a week. It was a bakery.'],
        ['duke', 'It was a very similar van.'],
        ['lefty', 'We got eleven hundred bread rolls, Duke.'],
        ['walt', '(from the back, happily) We ate like kings.'],
        ['jay', '(eyes on the gold car) Why Lefty?'],
        ['duke', 'Because she left two husbands.'],
        ['walt', 'Because she shoots left-handed. Like a southpaw. Pow.'],
        ['lefty', '(serenely) Because mind your business.'],
        ['walt', "(leaning forward between the seats) Frankie. Left at the Coral light. You always take the left at the Coral light."],
        ['jay', "(beat) He's going straight."],
        ['walt', "(sitting back, untroubled) Then he's wrong. They're always wrong. That's why we're the Foxes."],
        ['lefty', '(quietly, to Jay, eyes front) Thank you.'],
        ['jay', 'For what?'],
        ['lefty', "Not correcting him. Everybody corrects him. It's very tiring for him, being corrected all day. Imagine it."],
      ] },
      { music: 'off' },
      { spawn: [{ char: 'teague', at: 'tannery_row', offset: [6, 4], behavior: 'idle' }] },
      { scene: { at: 'tannery_row', cast: ['lefty', 'duke', 'walt', 'teague'] }, say: [
        ['caption', '(Tannery Row. Fish on ice, sneakers by the kilo, and a narrow door with a gold pelican on it: GOLDEN YEARS EQUITY. COLLECTIONS.)'],
        ['caption', '(The boy goes in with the bag. He comes out without it.)'],
        ['lefty', '(writing in a tiny notebook with a tiny pencil) No guard on the door. One camera, pointed at the sneakers. Back door onto the fish alley.'],
        ['duke', "Loading bay round the side. The doors don't shut. Somebody's propped them open with a mackerel."],
        ['walt', "(staring at the door, very sure) Safe's a Halloran. Sixties. Left-hand dial. I could open a Halloran with a fork."],
        ['lefty', '(beat) Could you, Walt?'],
        ['walt', '(a little less sure) ...I used to.'],
        ['caption', '(Down the row a big man in a green market-security jacket has stopped eating his sandwich. He is staring at them like someone who has heard the first bar of a song.)'],
        ['teague', '(walking over, slowly, wiping his hands) No. No, no, no. I know you. I know YOU.'],
        ['teague', 'Coral Avenue Savings. I was twenty. First week on the job. You took my HAT.'],
        ['duke', '(to the fish) It was a very good hat.'],
        ['teague', "My sergeant made me buy a new one out of my own wages! They put it in the paper! ROOKIE LOSES HAT TO SILVER FOXES!"],
        ['lefty', '(turning at last, sweetly) Marvin Teague. You got fat.'],
        ['lefty', '(as Marvin fumbles for the radio on his belt) Walk, boys. Walk with purpose.'],
        ['caption', '(What follows is the slowest pursuit in the history of Tannery Row. The Foxes flee at the pace of a shopping trolley.)'],
        ['caption', '(Marvin Teague pursues at the pace of a new hip. Neither side gains.)'],
      ] },
      { getIn: 'foxes_car', objective: "Get back in the car before Teague catches up. He's gaining. Slowly.", say: [
        ['teague', '(on his radio, out of breath, ten metres behind) Dispatch, this is Teague, Tannery Row security. I have eyes on the Silver Foxes. Repeat, the Silver Foxes.'],
        ['DISPATCH', '(on the police band) ...The what, Marvin?'],
        ['teague', 'THE SILVER FOXES. Look it up!'],
        ['DISPATCH', '(a long pause) All units, Old Market. Reports of an... elderly disturbance on Tannery Row. Mint-green compact. Proceed with, uh. Proceed.'],
      ] },
      { music: 'action' },
      { heat: 1 },
      { loseHeat: true, checkpoint: true, objective: 'Lose the patrol car. In a car with the top speed of a sneeze.', say: [
        ['lefty', "Oh, this is lovely. I haven't been chased since disco."],
        ['duke', '(gripping the door handle) Mr. Mercer, I have a pacemaker.'],
        ['jay', 'Hold on to it.'],
        ['walt', '(thrilled, slapping the seat) Go, Frankie! Go, go, go!'],
        ['jay', "(to the car, threading her through a gap that isn't there) Easy. Easy, old girl. I know. Me too."],
        ['lefty', '(watching him do it, very quietly) ...Oh. Oh, he is good, Duke.'],
        ['duke', "(eyes shut) I'll take your word for it."],
      ] },
      { music: 'off' },
      { goto: 'bayview_gardens', vehicle: 'foxes_car', objective: 'Take the Foxes home to Bayview Gardens', say: [
        ['lefty', 'You lost a squad car in a car that tops out at the speed of a sneeze.'],
        ['jay', "She's got more in her than you'd think."],
        ['lefty', "(pleased, patting the dash) Don't we all."],
        ['walt', "(peacefully, watching the palms go by) Ruthie'll laugh when I tell her. She always laughs at the Marvin part."],
      ] },
      { scene: { at: 'bayview_gardens', cast: ['lefty', 'duke', 'walt'] }, say: [
        ['lefty', '(counting notes out of a biscuit tin) Five hundred. For a morning drive and not touching anybody.'],
        ['jay', 'Teague knows your faces.'],
        ['lefty', "Marvin's known our faces since disco. Nobody's ever believed him. That's his tragedy and our business model."],
        ['lefty', "Thursday afternoons that office has every envelope on the coast in a sixties safe. Next Thursday. Two o'clock. We'll need a driver."],
        ['jay', "I don't do Thursdays."],
        ['lefty', "(not missing a beat) Everybody does Thursdays, sonny. They come whether you do them or not."],
        ['walt', "(taking Jay's hand in both of his, warm and dry and enormous) Good to have you back, Frankie."],
        ['walt', "Tell Ruthie I'll be late Friday. She hates it when I'm late. She pretends she doesn't."],
        ['jay', "(a glance at Lefty; she gives him nothing at all) I'll tell her."],
        ['walt', '(going in, humming) Good man. Good man.'],
        ['caption', '(When he has gone, Duke straightens a cravat that did not need straightening, and looks at the door for a while.)'],
        ['jay', "Who's Frankie?"],
        ['lefty', '(closing the biscuit tin) Our driver. A long time ago.'],
        ['jay', 'And Ruthie?'],
        ['lefty', "(standing; the conversation is over, and has been since before it started) Thursday. Two o'clock. Wear something forgettable."],
      ] },
    ],
  });

  // ===================================================================
  // sf2 THE WALKER JOB
  // ===================================================================
  chain.missions.push({
    id: 'sf2_the_walker_job',
    title: 'The Walker Job',
    giver: 'lefty',
    start: 'tannery_row',
    time: 14,
    estMinutes: 8,
    summary: 'The Silver Foxes rob Pelican\'s collections office on Tannery Row. They cannot run. They have never needed to.',
    reward: { money: 3000 },
    failIf: ['wrecked:foxes_car'],
    steps: [
      foxesCar('tannery_row'),
      { spawn: [{ char: 'teague', at: 'tannery_row', offset: [6, 4], behavior: 'idle' }] },
      { scene: { at: 'tannery_row', cast: ['lefty', 'duke', 'walt', 'teague'] }, say: [
        ['caption', '(Tannery Row, two o\'clock, Thursday. Three walking frames are lined up at the kerb like getaway bikes. Each one has tennis balls on its feet. One of them has a horn.)'],
        ['jay', 'What are those?'],
        ['lefty', 'Walkers.'],
        ['jay', '(beat) The Walker job.'],
        ['duke', 'After the Walker Street Savings and Loan, 1980. Our second-best job. (beat) And also after the walkers.'],
        ['walt', "Everything's both, at our age."],
        ['lefty', 'We go in the front. Slowly. Nobody looks at old people, sonny. They look past us like we\'re furniture somebody\'s about to throw out.'],
        ['lefty', 'Duke distracts the receptionist. It\'s the only thing he\'s ever been good at, including the furs.'],
        ['duke', '(adjusting his cravat) It is a gift and a burden.'],
        ['walt', 'I open the Halloran.'],
        ['lefty', '(the smallest pause; a look at Duke that Walt doesn\'t see) Walt opens the Halloran. I hold the bag. And the revolver.'],
        ['jay', 'Is it loaded?'],
        ['lefty', 'Fox rules.'],
        ['jay', "That's not a no."],
        ['lefty', 'Then out three doors, three directions. Fish alley, loading bay, front. Nobody has the patience to chase three old people at once.'],
        ['duke', 'And you collect us. One, two, three. Like seventy-nine.'],
        ['jay', 'In seventy-nine you could run.'],
        ['lefty', 'In seventy-nine Frankie reversed up an alley at forty to get Walt out from behind a laundry. You can manage a walking frame.'],
        ['caption', '(Down the row, Marvin Teague in his green security jacket has seen them. He puts his sandwich down very carefully, like a man drawing a gun.)'],
        ['teague', '(arriving, breathing hard, triumphant) I KNEW it. Twice in one week. You\'re casing the—'],
        ['caption', '(Lefty opens her handbag and takes out a police cap. Old. The peak cracked, the badge tarnished, a crest the city stopped using before Jay was born.)'],
        ['lefty', '(holding it out) We\'ve had it since disco, Marvin. It\'s yours.'],
        ['teague', '(not taking it, at first) ...My hat.'],
        ['duke', 'It lived on a bust of Napoleon in my sitting room. It has been very well looked after.'],
        ['teague', '(taking it in both hands, quietly) They put it in the paper. My mother cut it out. It was on her fridge till she died. She thought it was funny.'],
        ['lefty', 'It was funny, Marvin.'],
        ['teague', '(He puts it on. It still fits. It shouldn\'t, after all this time, and it does.) And you left-hooked my sergeant into the Coral Avenue fountain.'],
        ['lefty', '(modestly) He had a face for it.'],
        ['teague', "(a long moment, then turning away, not looking back) I'm going on my break. Twenty minutes. I take a long break on Thursdays. Everybody knows that."],
        ['jay', '(watching him go) You planned that.'],
        ['lefty', '(gripping her walker) I\'ve been planning that since disco. Fox rules, boys. Nobody gets hurt and everybody gets home.'],
      ] },
      { leave: ['lefty', 'duke', 'walt', 'teague'] },
      { getIn: 'foxes_car', objective: 'Get behind the wheel and wait. Engine running.' },
      { music: 'tension' },
      { phone: 'lefty', say: [
        ['lefty', '(low, from inside) We\'re in. Duke is at the desk.'],
        ['duke', '(distant, through her phone, pure honey) ...and has anyone ever told you, young lady, that you have the cheekbones of a—'],
        ['lefty', "It's working. It's horrible. She's giggling."],
        ['lefty', "Walt's at the safe. (beat) Walt is... looking at the safe."],
        ['lefty', '(very quietly, not to Jay at all) Come on, sweetheart. Left-hand dial. Left first. You know this one.'],
        ['caption', '(Three long seconds of nothing at all. Then a sound like a key turning in a very old lock.)'],
        ['walt', '(distant, overjoyed) Halloran! I TOLD you! With a FORK!'],
        ['lefty', "(a breath out that shakes) He's in. Oh, he's in. Envelopes. Hundreds. They've written the names on them, Jay. The names."],
        ['caption', '(Somewhere inside, a bell. Not an alarm: the little brass bell on a reception desk, being hit over and over by a receptionist who has just worked out what the cheekbones were for.)'],
        ['lefty', 'That\'s us. Three doors! Halberd\'s got a car round the corner, I heard the radio. One, two, three, Jay!'],
      ] },
      { music: 'action' },
      halberdSuv('office_suv', 'tannery_row'),
      { spawn: [
        { char: 'duke', at: 'tannery_fish_alley', behavior: 'cower', health: 500 },
        { char: 'walt', at: 'tannery_loading_bay', behavior: 'cower', health: 500 },
        { char: 'lefty', at: 'haddad_pharmacy', behavior: 'cower', health: 500 },
        { id: 'alley_guard', faction: 'halberd', at: 'tannery_fish_alley', offset: [6, 4], count: 2, weapon: 'pistol', behavior: 'guard', group: 'office_guards' },
        { id: 'bay_guard', faction: 'halberd', at: 'tannery_loading_bay', offset: [-6, 4], count: 2, weapon: 'pistol', behavior: 'guard', group: 'office_guards' },
        { id: 'suv_guard', faction: 'halberd', at: 'office_suv', count: 3, weapon: 'pistol', behavior: 'attack', group: 'office_guards' },
      ] },
      { goto: 'duke', vehicle: 'foxes_car', radius: 9, checkpoint: true, objective: "Fish alley first. Reverse up it if you have to. Duke can't run. Duke has never run.", say: [
        ['duke', '(from a doorway behind the fish stalls, clutching envelopes and a walker) I\'m in a doorway! I\'m in a doorway with a mackerel, Mr. Mercer!'],
      ] },
      { join: ['duke'], weapon: 'fists' },
      { goto: 'walt', vehicle: 'foxes_car', radius: 9, objective: "The loading bay. Walt's waiting at the side doors with the bag.", say: [
        ['duke', '(falling into the back seat with the walker across his knees) Go, go. My hip is somewhere on the pavement. Leave it. It was never loyal.'],
        ['walt', '(in the loading-bay doorway with the bag, hailing the car with his hat like it\'s a taxi) Frankie! Over here, Frankie!'],
      ] },
      { join: ['walt'], weapon: 'fists' },
      { goto: 'lefty', vehicle: 'foxes_car', radius: 9, objective: "The front. Lefty's in the old pharmacy doorway across the street. With the revolver.", say: [
        ['walt', '(climbing in, beaming) Fork. I said fork. Did everybody hear me say fork?'],
        ['lefty', '(under the green cross of the boarded-up pharmacy, firing at a Halberd car with tremendous calm) Whenever you\'re ready, sonny. No rush. I\'ve got six of these.'],
      ] },
      { join: ['lefty'], weapon: 'revolver' },
      { say: [
        ['lefty', '(in the passenger seat, cracking the revolver open, thumbing in shells with arthritic precision) I still got it.'],
        ['duke', 'You still got sciatica.'],
        ['lefty', '(snapping it shut) I can have both, Duke.'],
      ] },
      { heat: 2, say: [
        ['caption', '(Sirens. Real ones. Southside, coming up Tannery Row the wrong way.)'],
      ] },
      { loseHeat: true, checkpoint: true, objective: 'Lose the police. Three pensioners, one bag, no hips.', say: [
        ['lefty', "Lose them, Frankie— (beat) Jay. Lose them, Jay."],
        ['caption', '(She heard herself say it. She doesn\'t look at him. He doesn\'t look at her.)'],
        ['walt', '(counting envelopes in the back, licking his thumb) Forty-one... forty-two...'],
        ['duke', 'Walter, the police—'],
        ['walt', '(peacefully, starting again) One. Two.'],
        ['jay', '(to the car) Come on, old girl. You\'ve done this before. You remember.'],
        ['lefty', '(her hand flat on the dashboard, softly) She remembers.'],
      ] },
      { music: 'off' },
      { goto: 'bayview_gardens', vehicle: 'foxes_car', objective: 'Take the Foxes home to Bayview Gardens', say: [
        ['duke', 'Marvin will be in such trouble.'],
        ['lefty', 'Marvin was on his break. A man is entitled to his break.'],
        ['jay', 'Would he have taken it without the hat?'],
        ['lefty', "(beat, pleased) We'll never know. That's the beauty of a plan, sonny. Nobody ever finds out which part worked."],
      ] },
      { scene: { at: 'bayview_gardens', cast: ['lefty', 'duke', 'walt'] }, say: [
        ['caption', '(Bayview Gardens. The bag emptied out on the shuffleboard court. Envelopes, hundreds of them, every one with a name on it in a careful old hand.)'],
        ['duke', '(reading them) Ferrante. Oduya. Abate. Pike. Paredes. I know these people. I play cards with these people.'],
        ['jay', "How much?"],
        ['lefty', "A hundred and eighty-six thousand dollars, in late fees and good manners."],
        ['jay', "(beat) And your cut?"],
        ['lefty', "(looking at him like he's said something filthy) We're not keeping it. Every envelope's got a name on it, sonny. We're giving it back."],
        ['lefty', '(handing him a fat roll of old notes in a rubber band) Yours isn\'t theirs. Yours is ours. Walker Street money. 1980. We\'ve been saving it for the right driver.'],
        ['jay', '(looking at the notes; there are faces on them nobody uses any more) These are old.'],
        ['lefty', "So are we. Spend them before they go out of date. That's my advice about everything."],
        ['caption', '(Walt is counting one stack of envelopes. He reaches the end, frowns, and starts again from the top.)'],
        ['caption', '(Duke, very gently, takes the stack out of his hands and gives him a cup of tea instead.)'],
        ['walt', "(happily, to the tea) Ruthie'll be pleased. Ruthie never liked us stealing from nobodies. Only from somebodies."],
        ['walt', '(to Jay) Friday, Frankie. Don\'t forget. She\'s making that face already, I can feel it from here.'],
        ['jay', "(beat) I won't forget."],
        ['lefty', '(not looking up from the envelopes, very evenly) Go home, Jay. Good job. We\'ll call you.'],
      ] },
    ],
  });

  // ===================================================================
  // sf3 WALT
  // ===================================================================
  chain.missions.push({
    id: 'sf3_walt',
    title: 'Walt',
    giver: 'lefty',
    start: 'bayview_gardens',
    time: 22,
    estMinutes: 8,
    summary: "It's Friday night, 1981, and Walt Pomeroy has gone to meet his wife.",
    failIf: ['wrecked:foxes_car'],
    steps: [
      foxesCar('bayview_gardens'),
      { music: 'off' },
      { scene: { at: 'bayview_gardens', cast: ['lefty', 'duke'] }, say: [
        ['caption', '(Bayview Gardens at ten at night. The shuffleboard court is dark. Lefty is standing under the Pelican banner in a dressing gown and outdoor shoes.)'],
        ['lefty', "(before he's even out of the car) He's gone. Good jacket. Good shoes. The aftershave he isn't allowed, because he drinks it. (beat) It's Friday."],
        ['duke', '(in pyjamas and, apparently, the cravat) The night nurse saw him go out at nine. He said he was meeting his wife. She said that\'s nice, Mr. Pomeroy, and did her crossword.'],
        ['lefty', 'Every Friday in 1981 he took Ruthie out. A carnation from the cart on the boardwalk. Lemon meringue at the Starlite, the window booth. Then the end of the pier, for the lights.'],
        ['jay', 'And Ruthie?'],
        ['lefty', "(a beat too long) Ruthie isn't meeting him."],
        ['lefty', "(already walking to the car) I'm coming. Don't argue."],
      ] },
      { join: ['lefty'], weapon: 'fists' },
      { getIn: 'foxes_car', objective: 'Get in. Find Walt.' },
      { goto: 'the_boardwalk', vehicle: 'foxes_car', radius: 16, objective: 'The boardwalk. Where the flower cart used to be.', say: [
        ['lefty', '(watching the street for a tall man in a good hat) Best box man on the coast. He could hear a tumbler drop through a brick wall. Now some nights he can\'t find the bathroom.'],
        ['lefty', "Same ears. It isn't the ears that go. (beat) Six years ago he asked me where Ruthie was, and I told him, and I watched him hear it for the first time."],
        ['lefty', "(looking out of the window) I don't tell him any more."],
        ['lefty', 'You\'ve got a face that says things. Your grandmother had it. She drove my nephew to school on the 22 bus for six years and never lost a child.'],
        ['lefty', 'Lost a wing mirror once, to a mailbox on Palisade. Stopped the bus, got off, and apologised to the mailbox. In front of forty children.'],
        ['jay', '(beat; something moves in his face) I know that one.'],
        ['lefty', 'Course you do. She told everybody.'],
      ] },
      { spawn: [{ char: 'kiosk_kid', at: 'the_boardwalk', behavior: 'idle' }] },
      { scene: { at: 'the_boardwalk', cast: ['lefty', 'kiosk_kid'] }, say: [
        ['caption', '(The boardwalk. Where Mrs. Abate\'s flower cart stood in 1981 there is a kiosk selling phone cases, lit up like an aquarium.)'],
        ['kiosk_kid', "(not looking up from his own phone) We don't do flowers."],
        ['jay', 'Old man. Tall. Good hat. About an hour ago.'],
        ['kiosk_kid', '(looking up) Oh. Him. He wanted a carnation. Red, for his wife. He kept asking like I was going to remember where I put them.'],
        ['kiosk_kid', "So I sold him a phone case with a rose on it. He doesn't have a phone. He paid with a two-dollar bill."],
        ['kiosk_kid', "He seemed really happy. That's what was weird. He went toward the diner with the star. Said he was late for pie."],
        ['lefty', "(already turning) He's never late for pie."],
      ] },
      { goto: 'starlite_diner', vehicle: 'foxes_car', radius: 14, objective: 'The Starlite. Lemon meringue, the window booth.', say: [
        ['lefty', 'A phone case. (a laugh that comes out the wrong shape) Ruthie would have loved that. She\'d have put it on the mantelpiece and shown the whole church.'],
      ] },
      { scene: { at: 'starlite_diner', cast: ['dot', 'lefty'] }, say: [
        ['caption', '(The Starlite. The star on the roof sputters like it is trying to remember something. Dot Pike is on the step with a cigarette she is not smoking.)'],
        ['dot', 'Loretta Marchetti. I thought you were dead.'],
        ['lefty', 'Not for want of trying, Dorothy.'],
        ['dot', '(to Jay) He was here. Window booth, lemon meringue, two forks. I was twenty-five when I started here, honey. Ruthie Pomeroy was my first regular.'],
        ['dot', "(she remembers everybody's usual) That booth was theirs before it was yours and Mae's. There's a W and an R under your J and M. You two carved right over them."],
        ['caption', '(Through the glass, the window booth is empty. Two forks on a napkin. It looks like it is waiting for somebody.)'],
        ['dot', 'He sat forty minutes smiling at the door. Then he said she must have meant the pier, and I boxed him the slice. He called me Dottie. Nobody calls me Dottie any more.'],
      ] },
      { goto: 'oceanview_pier', vehicle: 'foxes_car', radius: 16, objective: 'The pier. He always ended up at the pier.', say: [
        ['lefty', "When we get there, you go. Not me. He'll look at me and see an old woman, and then he'll have to work out why. I've watched him work it out."],
        ['lefty', "You he doesn't have to work out. You're Frankie. Frankie never gets old. Frankie... (she stops)"],
        ['jay', 'What happened to Frankie?'],
        ['lefty', "(looking at the dark water) Get him home, Jay. That's the job. (beat) Duke's sending me a taxi. Take him the long way. He'll ask you to."],
      ] },
      { leave: ['lefty'] },
      { spawn: [{ char: 'walt', at: 'pier_end', behavior: 'idle' }] },
      { text: 'lefty', message: "Don't tell him. Whatever he asks you. Don't tell him." },
      { goto: 'walt', vehicle: false, radius: 2.6, objective: 'Walk to the end of the pier. Walt is at the rail.' },
      { music: 'sad' },
      { scene: { at: 'walt', cast: ['walt'] }, say: [
        ['caption', '(The end of Oceanview Pier. Black water, the city behind it like a jeweller\'s window, and Walt at the rail in his good jacket, holding a pie box.)'],
        ['walt', "(without turning round) Frankie. (delighted) What are you doing here? It's Friday. You don't work Fridays."],
        ['jay', '(beat) Lefty sent me.'],
        ['walt', "Course she did. Loretta thinks I can't cross a road. (the box) Lemon meringue. Two forks. Ruthie's running late. She says beautiful women are always late. It's a rule."],
        ['walt', "(showing Jay a phone case, a little anxious) The cart's gone. Couldn't get a carnation. It's got a rose on, though."],
        ['jay', "She'll like the rose."],
        ['walt', "(relieved, to the water) Every Friday since the night she spilled coffee in my lap at the Starlite. On purpose. She told me after. Forty years after."],
        ['walt', '(a small frown, a cloud going over) ...Forty years?'],
        ['walt', "(the cloud passing) Funny thing to say. (beat) Where is she, Frankie? It's getting cold. She hates the wind out here."],
      ] },
      { choice: { prompt: 'Walt is waiting for Ruthie.', options: [
        { label: 'Be Frankie.', flag: 'sf_frankie', then: [
          { scene: { at: 'walt', cast: ['walt'] }, say: [
            ['jay', "(a long beat) She called. She's running late. She said take you home, and she'll meet you there."],
            ['walt', "(relief, total and immediate, like a child's) Course she did. The wind. (handing Jay the pie box, solemnly) You carry the pie. I don't trust me with pie."],
            ['walt', 'Take me the long way, Frankie? Past the water. She likes it when I come home smelling of the sea.'],
          ] },
        ] },
        { label: 'Tell him the truth.', flag: 'sf_truth', then: [
          { scene: { at: 'walt', cast: ['walt'] }, say: [
            ['jay', "(a long time) Walt. She's gone. A long time ago."],
            ['caption', '(Walt Pomeroy hears it for the first time. Jay watches it arrive. It goes in slowly, the way water gets into a shoe.)'],
            ['walt', '(very quietly, looking down at the box) ...I bought her a slice. I asked for two forks.'],
            ['walt', 'Did I go? To the... did I go?'],
            ['jay', "(he has no idea) You went."],
            ['walt', 'Good. (beat) Good.'],
            ['caption', '(And then, the way the tide takes back a footprint, it goes. His face clears. He looks past Jay, down the pier, at the lights.)'],
            ['walt', "(brightening) She's late. She's always late. Frankie, is she running late?"],
            ['caption', '(Jay understands what Lefty meant. Every time you tell him, he loses her. For the first time. Every time.)'],
            ['jay', "(a long beat) Yeah, Walt. She's running late. She said to take you home."],
            ['walt', 'Then take me the long way, Frankie. Past the water. She likes it when I come home smelling of the sea.'],
          ] },
        ] },
      ] } },
      { join: ['walt'], weapon: 'fists' },
      { getIn: 'foxes_car', objective: "Walk Walt back to the car. He's in no hurry. Neither are you." },
      { music: 'hope' },
      { goto: 'seawall_overlook', vehicle: 'foxes_car', stop: false, radius: 22, objective: 'Take Walt home the long way. Past the water.', say: [
        ['walt', '(window down, breathing in) Smell that. You can\'t buy that. Somebody\'ll try to sell it to you one day, Frankie. In a jar.'],
        ['walt', 'First night, I asked her what she wanted out of life. She said, pie. And somebody to drive me home after.'],
        ['walt', 'That was all. I thought, I can do that. I can do that for the rest of my life.'],
        ['walt', "(suddenly, from nowhere, quiet) You wouldn't leave me on the kerb. Would you, Frankie?"],
        ['caption', "(Jay's hands move on the wheel. Ten and two.)"],
        ['jay', '(a long beat) No, Walt.'],
        ['walt', '(settling back, sure of it) No. Not you.'],
      ] },
      { goto: 'bayview_gardens', vehicle: 'foxes_car', objective: 'Bring Walt home to Bayview Gardens. Slowly.', say: [
        ['walt', 'Which way is home from here? I always forget. Ruthie does the directions.'],
        ['jay', "(and he hears an old woman in a motel car park, on a Sunday) We'll go slow. We'll look out the window till we get there."],
        ['walt', "(delighted) That's good. Is that yours?"],
        ['jay', "My grandmother's. She drove a school bus."],
        ['walt', "(with total seriousness) Bravest people in the world. Bus drivers and safecrackers. (yawning) Wake me when we're home, Frankie."],
      ] },
      { blackout: [
        ['caption', 'The Starlite Diner. A Friday in 1981.'],
        ['caption', '(The window booth. Pink neon on the wet road. Two forks. A young man in a good hat, and a woman with red hair.)'],
        ['ruthie', "You're staring."],
        ['walt', "I'm listening. Everybody has tumblers. Yours go click, click, click right before you laugh. I can hear them across the room."],
        ['ruthie', '(deadpan) Walter Pomeroy. Are you trying to crack me?'],
        ['walt', '(beat) Is it working?'],
        ['caption', '(She laughs, a laugh like a dropped tray, and in the kitchen the cook burns something. That is how the Starlite always knew Ruthie Pomeroy was in.)'],
        ['ruthie', '(wiping her eyes) Drive me home after.'],
        ['walt', 'Every time.'],
        ['caption', '(In the back of a mint-green car, a long time later, an old man is asleep with a pie box on his knees, smiling at something.)'],
      ] },
      { music: 'sad' },
      { scene: { at: 'bayview_gardens', cast: ['duke', 'walt', 'lefty'] }, say: [
        ['duke', "(at the gate in his pyjamas, taking Walt's arm like an usher at a wedding) Evening, Walter. Good night?"],
        ['walt', "(sleepy, happy) Ruthie's running late."],
        ['duke', "She always was. Come on. I've put the kettle on. It's the wrong kettle, but it's on."],
        ['walt', '(turning at the door) Night, Frankie. Same time next Friday.'],
        ['jay', '(beat) Same time.'],
      ] },
      { leave: ['walt', 'duke'] },
      { if: 'sf_truth', then: [
        { scene: { at: 'bayview_gardens', cast: ['lefty'] }, say: [
          ['caption', '(Later. Lefty and Jay on the bench under the Pelican banner, the pie box between them. Two forks.)'],
          ['lefty', '(not looking at him) You told him.'],
          ['jay', 'And then I didn\'t.'],
          ['lefty', "(nodding slowly) That's how it goes. I did it for a year before I stopped. You did it in a night."],
        ] },
      ], else: [
        { scene: { at: 'bayview_gardens', cast: ['lefty'] }, say: [
          ['caption', '(Later. Lefty and Jay on the bench under the Pelican banner, the pie box between them. Two forks.)'],
          ['lefty', "(not looking at him) You didn't tell him."],
          ['jay', 'You said not to.'],
          ['lefty', "I say a lot of things. (beat) Thank you."],
        ] },
      ] },
      { scene: { at: 'bayview_gardens', cast: ['lefty'] }, say: [
        ['jay', 'Who was Frankie?'],
        ['lefty', '(taking a long time over a forkful of meringue) Our driver. Six years. The best there was, till you.'],
        ['lefty', "The Pembroke job, 1983. Frankie had the bag, and a girl up north, and a plan he hadn't mentioned. He drove off and left Walt on the kerb with a policeman coming."],
        ['lefty', 'Walt did five years. Ruthie took the bus out to the county every Sunday with a pie on her knees.'],
        ['lefty', "When he came home he never said Frankie's name again. Not once in forty years. (beat) Now it's all he says."],
        ['lefty', "I'm not telling you that for any reason."],
        ['jay', 'Sure you are.'],
        ['lefty', '(beat) Sure I am.'],
        ['jay', '(after a while, quietly) My grandmother called me every Sunday when I was away. The last year, she\'d tell me the mailbox story twice in one call.'],
        ['jay', "I thought, when it gets bad, I'll come home. (beat) It didn't get bad. It just stopped."],
        ['caption', '(Lefty puts her old hand over his on the bench and leaves it there. Her ring is cold.)'],
        ['lefty', "(eventually) Eat your pie. (beat) It's a good story, the mailbox. Tell it to somebody. That's what they're for."],
      ] },
    ],
  });
  // ===================================================================
  // sf4 RETURNS
  // ===================================================================
  chain.missions.push({
    id: 'sf4_returns',
    title: 'Returns',
    giver: 'lefty',
    start: 'bayview_gardens',
    time: 12,
    estMinutes: 10,
    summary: 'The Silver Foxes give it all back, one envelope at a time, while Pelican tries to collect.',
    reward: { money: 2000, unlock: ['foxes_car'] },
    failIf: ['wrecked:foxes_car'],
    steps: [
      foxesCar('bayview_gardens'),
      { scene: { at: 'bayview_gardens', cast: ['lefty', 'duke', 'walt'] }, say: [
        ['caption', '(Bayview Gardens at noon. On the shuffleboard court, in rows, a hundred and some envelopes with names on them. Residents stare from every door, like pigeons at bread.)'],
        ['lefty', 'The ones who live here we did this morning, under the doors. Mrs. Ferrante cried. Mr. Oduya accused us of a trick, and then he cried.'],
        ['duke', '(fanning five envelopes like a poker hand) These are the ones Pelican moved out. The ones whose houses worked for them all the way to somewhere else.'],
        ['lefty', 'Five drops. Harbor Point and Palm Crescent. In and out, nobody sees us, nobody gets hurt.'],
        ['jay', 'Fox rules.'],
        ['lefty', '(pleased in spite of herself) Fox rules.'],
        ['duke', 'Marvin says there are men in Pelican polos all over Tannery, asking about an elderly crew. Halberd, in Pelican shirts.'],
        ['lefty', 'Same dogs, different collars.'],
        ['caption', '(On a bench in the sun, wrapped in a blanket, Walt is looking at Jay with polite and total incomprehension.)'],
        ['walt', "Who's this young man, Loretta?"],
        ['lefty', '(gently) That\'s our driver, Walt.'],
        ['walt', '(nodding courteously to Jay) How do you do. (to Lefty, puzzled) What happened to Frankie?'],
        ['caption', '(Nobody answers him. Duke, very carefully, adjusts the blanket.)'],
      ] },
      { if: 'otis_free', then: [
        { spawn: [{ char: 'otis', at: 'bayview_gardens', offset: [3, 2], behavior: 'idle' }] },
        { say: [
          ['otis', '(bringing out coffee nobody asked for) I matched every name to the account it came out of. From Pelican\'s own ledger. First good thing I\'ve ever done with a ledger.'],
          ['lefty', 'Otis. The coffee.'],
          ['otis', '(retreating with it) I know. I know.'],
        ] },
      ] },
      { if: 'otis_taken', then: [
        { say: [['lefty', "(not looking at Jay) Otis would have matched the names to the accounts. Otis was good with numbers. (beat) Never mind."]] },
      ] },
      { join: ['lefty'], weapon: 'shotgun' },
      { join: ['duke'], weapon: 'fists' },
      { getIn: 'foxes_car', objective: 'Get in the car. Five envelopes. Five drops.', say: [
        ['lefty', '(laying a sawn-off shotgun across her knees like knitting) For the dogs. Not the people.'],
        ['jay', 'Where did you get—'],
        ['duke', "Don't ask her where. She'll tell you, and it takes an hour."],
      ] },
      { collect: ['starlite_diner'], item: 'envelope', objective: 'First drop: Dot Pike, at the Starlite', say: [
        ['lefty', "Dorothy Pike. Seventy, and still pouring coffee at three in the morning. Pelican took the house her mother left her, a month at a time."],
      ] },
      { say: [
        ['dot', '(from the diner step, holding the envelope up to the light, yelling after them) Loretta! What is THIS?'],
        ['lefty', '(out of the window) Your house, Dottie! The bits they ate!'],
        ['dot', "(beat, then louder) I'll be insulted LATER!"],
      ] },
      { collect: ['the_boardwalk'], item: 'envelope', objective: 'Second drop: Rosa Abate, by the boardwalk', say: [
        ['lefty', 'Rosa Abate. The flower cart. Pelican had her house and the Renewal had her cart. She sells lavender out of a pram now, by the arch.'],
        ['duke', 'Red for wives. White for apologies. (beat) Walt always bought red.'],
      ] },
      { spawnCar: 'courier_car', type: 'beater', at: 'the_boardwalk', offset: [0, 24], color: PELICAN_GOLD },
      { music: 'action' },
      { chase: 'courier_car', mode: 'catch', route: ['grand_avenue', 'pelican_bank'], escape: 320, checkpoint: true, objective: 'Catch the collections boy before he gets back to Pelican. Box him in. Gently.', say: [
        ['duke', 'Loretta. The little gold car.'],
        ['lefty', "It's the collections boy. He's seen our plate. If he gets back to Pelican with it, they're at Bayview by teatime."],
        ['lefty', "Two rust buckets in a car chase. They'll put this on the news after the weather."],
        ['duke', "Mr. Mercer, I don't wish to alarm you, but we are being overtaken by a bus."],
        ['jay', '(to the car) Come on. Come on, old girl. One more.'],
        ['lefty', '(the shotgun halfway out of the window) I could take his tyre.'],
        ['jay', 'Fox rules.'],
        ['lefty', '(drawing it back in, disgusted) Fox rules. Damn it.'],
      ] },
      { music: 'off' },
      { spawn: [{ char: 'courier', at: 'courier_car', offset: [2.2, 0], behavior: 'cower' }] },
      { scene: { at: 'courier', cast: ['courier', 'lefty', 'duke'] }, say: [
        ['caption', '(The gold compact, boxed against a hydrant. The boy in the mustard polo has both hands up and his eyes shut, like a kid on a roller coaster.)'],
        ['courier', "Please. I'm Kyle. I just do the collections. I don't even get a car allowance. This is my mum's car."],
        ['lefty', '(climbing out, the shotgun pointed politely at the ground) Do you know what\'s in the envelopes you collect, sonny?'],
        ['courier', '(eyes shut) ...Fees?'],
        ['duke', "Mrs. Ferrante's husband's pension. Mr. Oduya's heart pills. Dorothy Pike's mother's house, one month at a time."],
        ['courier', '(opening his eyes, very small) They told me it was rent.'],
        ['lefty', 'They tell you a lot of things. What do they pay you?'],
        ['courier', 'Fourteen an hour and two per cent.'],
        ['lefty', '(to Jay) Two per cent. Of grannies.'],
        ['jay', 'Give me your phone.'],
        ['courier', "(handing it over at once) The photo of your plate's on there. I hadn't sent it. I was going to. I'm sorry. I was going to."],
        ['jay', '(deleting it, handing it back) Go home, Kyle.'],
        ['lefty', "(tucking one of her own envelopes into the boy's shirt pocket, unaddressed) And find a better job. That's your severance."],
        ['courier', '(staring at it) Is this... is this Pelican\'s money?'],
        ['lefty', "It's mine. From 1980. It's very old money. Spend it on something you'll remember."],
      ] },
      { getIn: 'foxes_car', objective: 'Back in the car. Three envelopes left.' },
      { collect: ['magnolia_motel'], item: 'envelope', objective: 'Third drop: Eunice Kowalczyk, room nine at the Magnolia Motor Lodge', say: [
        ['lefty', "Eunice Kowalczyk. Pelican had her bungalow on Magnolia Street. She's been in room nine at the motel since March."],
        ['jay', "(beat) I'm in twelve."],
        ['lefty', 'Then you\'ve heard her television. Gardening programmes with the sound up. She misses her dahlias.'],
        ['duke', '(as the envelope goes under the door of room nine) Forty-nine dollars a night, for a woman who grew dahlias the size of hubcaps.'],
      ] },
      { spawn: [
        { id: 'collector', faction: 'halberd', at: 'casa_palma', count: 3, weapon: 'pistol', behavior: 'guard', group: 'collectors' },
        { id: 'collector_bat', faction: 'halberd', at: 'casa_palma', offset: [3, -3], weapon: 'bat', behavior: 'guard', group: 'collectors' },
      ] },
      { goto: 'casa_palma', vehicle: true, radius: 24, objective: 'Fourth drop: Inez Paredes, Casa Palma', say: [
        ['lefty', 'Inez Paredes. Casa Palma, third floor. Lives with her daughter now. Her daughter is very patient, and very tired.'],
        ['caption', '(In the Casa Palma courtyard, under a three-storey mural of a boy in a yellow hoodie, men in Pelican polos are standing over an old woman in a doorway.)'],
        ['duke', '(seeing his face) Mr. Mercer?'],
        ['jay', '(looking up at the mural, then at the polos) Stay in the car.'],
        ['lefty', '(working the shotgun) Not a chance in hell.'],
      ] },
      { kill: 'group:collectors', checkpoint: true, objective: "Run Pelican's collectors out of the courtyard. Under Tommy's wall." },
      { collect: ['casa_palma'], item: 'envelope', objective: 'Give Mrs. Paredes her envelope', say: [
        ['caption', '(Mrs. Paredes takes the envelope in both hands, reads her own name on it, and looks up at the mural, as if the boy in the yellow hoodie had sent it.)'],
        ['lourdes', '(from a balcony, leaning out over the laundry) Jay Mercer! Is that you shooting in my courtyard?'],
        ['jay', '(beat) ...No.'],
        ['lourdes', 'Come for dinner Sunday. Bring the old lady with the gun.'],
      ] },
      { collect: ['nana_lu_house'], item: 'envelope', objective: 'Last drop: Heron Street', say: [
        ['lefty', 'Last one. Heron Street. Grace Oyelaran.'],
        ['jay', '(beat) Grace.'],
        ['lefty', 'Golden Years got her too. Same man in the same polo, the same week as your grandmother. She never told you because she\'s proud and you had enough.'],
        ['caption', "(Jay puts the envelope in Grace's mailbox himself. Next door, a porch swing moves in the wind, and squeaks on the left.)"],
      ] },
      { text: 'oyelaran', message: "There is money in my mailbox with my name on it in an old woman's handwriting. I know it was you. I'm making oxtail. Don't argue." },
      { phone: 'walt', say: [
        ['caption', "(Lefty's phone, on speaker. The caller ID says BAYVIEW COURTYARD PAYPHONE. Nobody has used that payphone in twenty years.)"],
        ['walt', "(frightened, too loud, the way people talk on phones they don't trust) Loretta? It's Walt. I'm on the telephone."],
        ['walt', "There are men in the courtyard, Loretta. In shirts with birds on. They're shouting at Mrs. Ferrante. Is it the police? Is it eighty-three?"],
        ['lefty', '(very steady) Go inside, sweetheart. Lock the door. Put the kettle on. We\'re coming.'],
        ['walt', 'Is Frankie driving?'],
        ['lefty', '(looking at Jay) He\'s driving.'],
      ] },
      { music: 'action' },
      { goto: 'bayview_gardens', vehicle: 'foxes_car', radius: 18, checkpoint: true, objective: "Get back to Bayview. Pelican's men are in the courtyard.", say: [
        ['lefty', '(loading the shotgun with shells from her handbag, between a lipstick and a rosary) Fox rules, sonny.'],
        ['jay', 'Nobody gets hurt.'],
        ['lefty', 'Nobody gets hurt who isn\'t Pelican.'],
        ['duke', "That isn't the rule!"],
        ['lefty', "It's the rule today, Duke."],
      ] },
      { spawn: [{ id: 'pelican_man', faction: 'halberd', at: 'bayview_gardens', count: 3, weapon: 'pistol', behavior: 'attack', group: 'pelican_men' }] },
      { survive: 75, objective: 'Hold the courtyard. Lefty has the shotgun. Duke has a shuffleboard disc.', waves: [
        { at: 'bayview_gardens', count: 3, weapon: 'pistol', faction: 'halberd', delay: 12 },
        { at: 'bayview_gardens', count: 3, weapon: 'smg', faction: 'halberd', delay: 30 },
        { at: 'bayview_gardens', count: 4, weapon: 'pistol', faction: 'halberd', delay: 48 },
      ], say: [
        ['caption', '(From every balcony, the residents of Bayview Gardens are throwing things at Pelican: geraniums, a bedpan, a commemorative plate of a mayor nobody remembers.)'],
        ['duke', '(from behind a planter, flinging a shuffleboard disc that catches a Halberd man square on the knee) OH! Oh, I still got it!'],
        ['lefty', '(reloading, not looking) You still got cataracts, Duke. You were aiming at the planter.'],
        ['caption', '(Mrs. Ferrante, eighty-eight, empties a watering can over a Halberd helmet from the second floor and shouts something in Italian that would curdle milk.)'],
        ['lefty', '(firing) That\'s for the dahlias! (firing) That\'s for Dottie\'s mother! (reloading) The rest is for the hat!'],
        ['duke', 'Loretta, they gave the hat back!'],
        ['lefty', 'I know they did, Duke! I\'m making a point!'],
      ] },
      { music: 'off' },
      { scene: { at: 'bayview_gardens', cast: ['lefty', 'duke', 'walt'] }, say: [
        ['caption', '(Quiet. Sirens a long way off, going somewhere else. The Pelican banner hangs by one corner over the shuffleboard court, shot to ribbons: GOLDEN YEARS EQ.)'],
        ['duke', '(lowering himself onto the edge of the court one vertebra at a time) I would like it noted that I hit a man with a shuffleboard disc.'],
        ['lefty', "It's noted, Duke."],
        ['caption', "(Walt comes out of his door in his cardigan and looks at the mess, and then at Jay. Something in his face is different. Clear, like a window somebody's wiped.)"],
        ['walt', "You're not Frankie."],
        ['jay', '(beat) No.'],
        ['walt', 'Frankie had a moustache. Like a caterpillar died on him. (beat) I know I\'ve been calling you Frankie. Loretta tells me. Every morning. It doesn\'t stay.'],
        ['walt', "Frankie was a beautiful driver. But he wasn't any good. (beat) You came back for the old men. Nobody comes back for the old men."],
        ['walt', '(holding out his hand) Thanks, Jay. (a small hesitation, a man feeling for a step in the dark) It is Jay, isn\'t it?'],
        ['jay', '(taking his hand) It\'s Jay.'],
        ['walt', '(holding on, repeating it like a combination he means to keep) Jay. Jay. Good.'],
        ['caption', '(And then, as quietly as it came, the window fogs over. He looks around the courtyard, pleased and puzzled, like he has just arrived.)'],
        ['walt', "Ruthie'll want to meet you. She's running late. (to Duke) Is there tea?"],
        ['duke', '(getting up, a hand on Walt\'s back) There\'s always tea, Walter. Come on.'],
        ['lefty', '(holding out a set of keys on a plastic fox that has lost an ear) Here.'],
        ['lefty', "She needs a real driver, not a hearse. I can't see over the wheel since my back went, and Duke has never once in his life checked a mirror."],
        ['lefty', "Keep her running. I'll want her Sundays."],
        ['jay', "(taking the keys) Why Lefty? Duke says husbands. Walt says your gun hand. Teague says his sergeant."],
        ['lefty', '(watching Duke walk Walt inside, very slowly, a hand on his back) They\'re all true.'],
        ['lefty', "But mostly because I'm what's left. Every time. Somebody has to be. Somebody has to remember for everybody."],
        ['lefty', '(brisk again, turning back to him) Fox rules, Jay. Nobody gets hurt, and everybody gets home.'],
        ['jay', '(looking down at the one-eared fox in his hand) Everybody gets home.'],
      ] },
      { setFlag: 'foxes_done' },
    ],
  });
})();
