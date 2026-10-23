/*
 * data/story-gangs.js — "Street Money": a side chain of gang jobs for the
 * Saltmarsh Salts and the Lantern Kings. Steal the cash, run the packages
 * through rival territory, hit a Halberd depot and get out with the heat on,
 * run down an armoured van, burn out a freelance Salts lab, and fly a
 * Goldline gold job out in Dex's helicopter.
 *
 * Every job here passes `node tools/missiontest.mjs <id>` (the headless
 * autoplayer); run it after any change.
 *
 * Loaded after story-club.js. It only uses the job format in missions.js and
 * the cast, places and factions from story.js; nothing here changes the engine.
 * Unlocks after m05_the_toolbox (when Jay has met Rhea).
 */
(function () {
  'use strict';

  const S = window.VH.Data.story;
  const jobs = [];

  // ===================================================================
  // g01 CASH RUN: rob the Pelican Home Equity counting room
  // ===================================================================
  jobs.push({
    id: 'g01_cash_run',
    title: 'Cash Run',
    giver: 'rhea',
    start: 'kostas_salvage',
    time: 21,
    estMinutes: 8,
    summary: 'Rhea wants Pelican\'s Friday cash. Take it quietly, or take it loud, and get it back to the yard.',
    reward: { money: 3500, weapons: ['smg'] },
    steps: [
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'kostya'] }, say: [
        ['rhea', '(not looking up from her pencil) Pelican Home Equity. They foreclosed on four of my dockers\' houses this year and they count the money on Fridays.'],
        ['kostya', '(from behind a stack of tyres) Nine guards on the rota. Three on tonight.'],
        ['jay', 'Three guards and a vault.'],
        ['rhea', 'A counting room. Not a vault. Banks keep the vault for other people\'s money. This is their own.'],
        ['rhea', 'Walk in. Take the bags. Be back by midnight. If you leave a mess, leave it on them.'],
        ['kostya', '(to Jay, kindly) Don\'t be a hero. Heroes get tyres dropped on them.'],
      ] },
      { spawnCar: 'getaway', type: 'ironclad', at: 'kostas_salvage', color: 0x1c1c1f },
      { getIn: 'getaway', checkpoint: true, objective: 'Take the Salts\' getaway car' },
      { goto: 'pelican_bank', vehicle: true, objective: 'Drive to Pelican Home Equity', say: [
        ['jay', '(to himself, hands at ten and two) Park. Walk in. Walk out. Simple.'],
        ['caption', '(He has never once in his life done anything simple.)'],
      ] },
      { spawn: [{ id: 'bank_guards', at: 'pelican_bank', count: 3, faction: 'halberd', weapon: 'pistol', behavior: 'guard', group: 'guards' }] },
      { music: 'tension' },
      { kill: 'guards', objective: 'Deal with the guards', say: [
        ['jay', '(as the first shot cracks off the glass) Quiet. Right.'],
      ] },
      { heat: 2 },
      { collect: ['pelican_bank'], item: 'cash bags', objective: 'Grab the cash bags from the counting room', say: [
        ['jay', '(stuffing a bag) Heavy. Good. Heavy is good.'],
      ] },
      { music: 'action' },
      { getIn: 'getaway', objective: 'Back in the car. Go.' },
      { loseHeat: true, objective: 'Lose the cops. Don\'t lead them to the yard.', say: [
        ['jay', '(checking the mirror, then the mirror again) They\'re on me. Of course they are.'],
      ] },
      { deliver: 'getaway', to: 'kostas_salvage', timeLimit: 150, maxDamage: 0.7, objective: 'Get the cash back to Kostas Salvage before midnight' },
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'kostya'] }, say: [
        ['kostya', '(counting with a dock worker\'s speed) It\'s all here. It is... a lot of here.'],
        ['rhea', '(finally looking up) Four houses. Plus legal fees. Plus the interest I\'m charging Pelican for being rude to my dockers.'],
        ['rhea', '(sliding a bundle across) Your end. It\'s clean. Don\'t spend it all in one bar.'],
        ['jay', 'Which bar?'],
        ['rhea', 'There\'s only one. Don\'t be coy.'],
      ] },
      { setFlag: 'gangs_cash_run_done' },
    ],
  });

  // ===================================================================
  // g02 THE PACKAGE RUN: carry the Kings' packages through Salts ground
  // ===================================================================
  jobs.push({
    id: 'g02_package_run',
    title: 'The Package Run',
    giver: 'teo',
    start: 'lantern_alley',
    time: 22,
    estMinutes: 10,
    summary: 'The Kings have three sealed packages to move across town, and somebody is not going to like it.',
    reward: { money: 3000, weapons: ['shotgun'] },
    steps: [
      { scene: { at: 'lantern_alley', cast: ['teo', 'wick'] }, say: [
        ['teo', 'Three sealed boxes. I don\'t ask what\'s in them, you don\'t ask what\'s in them.'],
        ['wick', '(helpfully) Lanterns. It\'s lanterns. For the festival.'],
        ['teo', '(a long look) Wick.'],
        ['wick', 'Mostly lanterns.'],
        ['teo', 'Pick them up along Tannery Row, then take them to the Parkade by eleven. The Salts know there\'s a run tonight. Somebody talked.'],
        ['jay', 'Who?'],
        ['teo', 'Don\'t make it a thing. Just don\'t stop.'],
      ] },
      { spawnCar: 'run_car', type: 'lowrider', at: 'lantern_alley', color: 0xb3202a },
      { getIn: 'run_car', checkpoint: true, objective: 'Take the Kings\' lowrider' },
      { goto: 'tannery_row', vehicle: true, objective: 'Drive to Tannery Row for the packages' },
      { collect: ['tannery_row'], item: 'packages', objective: 'Pick up the sealed packages' },
      { getIn: 'run_car', objective: 'Back in the car' },
      { music: 'tension' },
      { timer: 200 },
      { deliver: 'run_car', to: 'grand_parkade', maxDamage: 0.6, objective: 'Get the packages to the Grand Parkade by eleven', say: [
        ['wick', '(on the phone, whispering) Two black cars behind you. Salts colours. I\'m scared and also kind of proud of you.'],
        ['jay', 'Wick. Hang up.'],
        ['wick', 'Hanging up. (beat) Good luck. Don\'t scratch it.'],
      ] },
      { music: 'action' },
      { survive: 45, objective: 'The Salts are here. Hold the Parkade ramp.', waves: [
        { delay: 2, at: 'grand_parkade', count: 3, faction: 'salts', weapon: 'pistol' },
        { delay: 18, at: 'grand_parkade', count: 4, faction: 'salts', weapon: 'smg' },
        { delay: 32, at: 'grand_parkade', count: 3, faction: 'salts', weapon: 'shotgun' },
      ] },
      { scene: { at: 'grand_parkade', cast: ['teo', 'wick'] }, say: [
        ['teo', '(counting the packages and finding them all there) Three. Good.'],
        ['wick', 'Were there really Salts?'],
        ['jay', 'There were really Salts.'],
        ['teo', '(quietly, at last) Rhea didn\'t order this. Somebody on her side is freelancing. I\'ll find them. I don\'t want a war I didn\'t pick.'],
        ['teo', '(handing over a roll) Your cut. Don\'t make it a thing.'],
      ] },
      { setFlag: 'gangs_package_run_done' },
    ],
  });

  // ===================================================================
  // g03 THE DEPOT HIT: break into a Halberd cash depot and get out clean
  // ===================================================================
  jobs.push({
    id: 'g03_depot_hit',
    title: 'The Depot Hit',
    giver: 'rhea',
    start: 'kostas_salvage',
    time: 23,
    estMinutes: 12,
    summary: 'Halberd keeps the wages for half the docks in one depot. Rhea wants it moved.',
    reward: { money: 5500, armor: 100 },
    steps: [
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'kostya', 'deb'] }, say: [
        ['rhea', 'Halberd Docks Depot. Payroll for the whole harbour sits there between Thursday and Friday.'],
        ['deb', '(sitting on a forklift) I drove past it. Four guards at the gate, more inside. They\'ve got dogs. I like the dogs. I don\'t like the guards.'],
        ['kostya', 'We create a distraction. The gate opens. You walk in.'],
        ['jay', 'What distraction?'],
        ['kostya', '(a heavy sigh) A forklift. Through the fence. Deb is very excited.'],
        ['deb', '(beaming) I\'m so excited.'],
        ['rhea', 'In and out. If the police come, you will not be here when they arrive.'],
      ] },
      { spawnCar: 'depot_car', type: 'mesa', at: 'kostas_salvage', color: 0x1d2b4a },
      { getIn: 'depot_car', checkpoint: true, objective: 'Take the Salts\' SUV' },
      { goto: 'halberd_depot', vehicle: true, objective: 'Drive to the Halberd Docks Depot' },
      { spawn: [{ id: 'depot_guards', at: 'halberd_depot', count: 4, faction: 'halberd', weapon: 'smg', behavior: 'guard', group: 'guards' }] },
      { music: 'tension' },
      { kill: 'guards', objective: 'Take out the gate guards' },
      { heat: 3 },
      { survive: 40, objective: 'Halberd reinforcements. Hold the depot gate.', waves: [
        { delay: 3, at: 'halberd_depot', count: 3, faction: 'halberd', weapon: 'smg' },
        { delay: 20, at: 'halberd_depot', count: 4, faction: 'halberd', weapon: 'shotgun' },
      ] },
      { collect: ['halberd_depot'], item: 'payroll bags', objective: 'Grab the payroll bags from the cage' },
      { music: 'action' },
      { getIn: 'depot_car', objective: 'Into the SUV. Go go go.' },
      { loseHeat: true, objective: 'Lose the heat before you go anywhere near the yard', say: [
        ['deb', '(on the radio, thrilled) Is that a helicopter? That is a helicopter. I love this job.'],
        ['jay', 'Deb. Get off the radio.'],
      ] },
      { deliver: 'depot_car', to: 'kostas_salvage', timeLimit: 200, maxDamage: 0.7, objective: 'Get the payroll back to Kostas Salvage' },
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'kostya', 'deb'] }, say: [
        ['rhea', '(slowly, with the first real smile Jay has seen) The harbour gets paid on time this week. The harbour will wonder why.'],
        ['kostya', 'The harbour will never know.'],
        ['rhea', 'The harbour will always know. That\'s the point.'],
        ['deb', '(waving a stack of bills) Can I keep the forklift?'],
        ['rhea', 'You never gave it back.'],
        ['deb', '(happily) No.'],
      ] },
      { setFlag: 'gangs_depot_hit_done' },
    ],
  });

  // ===================================================================
  // g04 THE ARMOURED VAN: run down a Halberd cash van and empty it
  // ===================================================================
  jobs.push({
    id: 'g04_armoured_van',
    title: 'The Armoured Van',
    giver: 'kostya',
    start: 'crane_row',
    time: 20,
    estMinutes: 9,
    summary: 'A Halberd Bulwark leaves the depot with the docks\' takings every Saturday. Kostya wants it stopped, hard.',
    reward: { money: 6000, weapons: ['rifle'], armor: 50, unlock: ['gangs_rifle'] },
    steps: [
      { scene: { at: 'crane_row', cast: ['kostya', 'deb'] }, say: [
        ['kostya', '(unrolling a grease-stained map on a container) Every Saturday a Bulwark leaves the depot. Six tonnes. Armour plate. The docks\' takings in the back.'],
        ['deb', 'I timed it. Eight minutes from the gate to the bank. Nine if the driver stops for a doughnut.'],
        ['jay', 'You want me to stop six tonnes of armour with a car.'],
        ['kostya', '(patting a long orange bonnet) With a fast car. Ram it. Ram it again. Bulwarks are brave for about four minutes.'],
        ['deb', '(cheerfully) Then they pull over and cry.'],
        ['kostya', 'Then you open the back. Rhea says the docks paid for that money. The docks get it back.'],
      ] },
      { spawnCar: 'ram_car', type: 'vireo', at: 'crane_row', color: 0xc4561d },
      { getIn: 'ram_car', checkpoint: true, objective: 'Take Kostya\'s Vireo' },
      { goto: 'halberd_depot', vehicle: true, radius: 30, objective: 'Wait near the Halberd depot gate' },
      { spawnCar: 'cash_van', type: 'bulwark', at: 'halberd_depot', color: 0x8c8f93, name: 'the armoured van' },
      { music: 'action' },
      { chase: 'cash_van', mode: 'wreck', checkpoint: true, route: ['tidewater_lot', 'kostas_salvage', 'drydock_slip', 'crane_row'], objective: 'Wreck the armoured van', say: [
        ['deb', '(on the radio) That\'s it! Grey one! Hit it, hit it, hit it!'],
        ['jay', '(teeth gritted) It hits back, Deb.'],
        ['kostya', '(on the radio, calm) Rear wheels. Always the rear wheels.'],
      ] },
      { wait: 2.5 }, // let the wreck stop rolling before the crew climbs out beside it
      { spawn: [{ id: 'van_crew', at: 'cash_van', count: 2, faction: 'halberd', weapon: 'smg', behavior: 'attack', group: 'van_crew' }] },
      { kill: 'van_crew', objective: 'The guards bailed out with the cash boxes. Put them down.' },
      { heat: 2 },
      // The cash is where the guards fell (a pickup at 'cash_van' would sit inside the wreck, out of reach).
      { collect: ['van_crew_0', 'van_crew_1'], item: 'cash boxes', objective: 'Grab the cash boxes the guards dropped', say: [
        ['jay', '(prising a box free) Docks money. Smells like diesel. Perfect.'],
      ] },
      { loseHeat: true, objective: 'Lose the cops before you head back' },
      { scene: { at: 'crane_row', cast: ['kostya', 'deb', 'rhea'] }, say: [
        ['rhea', '(weighing a cash box in one hand) Halberd will say it was a robbery.'],
        ['jay', 'It was a robbery.'],
        ['rhea', 'It was a refund.'],
        ['deb', '(admiring the dents in the Vireo) Can we do it again next Saturday?'],
        ['kostya', 'Next Saturday they bring two vans.'],
        ['deb', '(delighted) Two vans!'],
        ['rhea', '(handing Jay a rifle case) Halberd will come asking. When they do, be holding this.'],
      ] },
      { setFlag: 'gangs_armoured_van_done' },
    ],
  });

  // ===================================================================
  // g05 THE COOK SHACK: burn out the Salts freelancers' lab
  // ===================================================================
  jobs.push({
    id: 'g05_cook_shack',
    title: 'The Cook Shack',
    giver: 'teo',
    start: 'lantern_alley',
    time: 1,
    estMinutes: 9,
    summary: 'Teo found the freelancer: a Salts crew cooking at the old drydock. Rhea has disowned them. Nobody will miss the van.',
    reward: { money: 4500, weapons: ['sniper'], armor: 50, unlock: ['gangs_sniper'] },
    steps: [
      { scene: { at: 'lantern_alley', cast: ['teo', 'wick'] }, say: [
        ['teo', 'I found who was selling the Salts our route. A crew of theirs went freelance. They cook at the old drydock, out of a van.'],
        ['jay', 'Rhea\'s people.'],
        ['teo', 'Not anymore. I called her. She said, (beat) "Who?"'],
        ['wick', '(very seriously) That means do crimes to them.'],
        ['teo', '(not disagreeing) Clear the slip. Burn the van. Everything they cooked goes up with it.'],
        ['wick', 'Can I come?'],
        ['teo', 'No.'],
        ['wick', '(to Jay) He means yes.'],
        ['teo', 'I mean no.'],
      ] },
      { spawnCar: 'kings_car', type: 'drifter', at: 'lantern_alley', color: 0xb3202a },
      { getIn: 'kings_car', checkpoint: true, objective: 'Take the Kings\' Drifter' },
      { goto: 'drydock_slip', vehicle: true, radius: 30, objective: 'Drive to the old drydock slip', say: [
        ['wick', '(on the phone) Teo says don\'t call you. So I\'m calling. The van\'s blue. Don\'t breathe near it.'],
      ] },
      { spawnCar: 'lab_van', type: 'porter', at: 'drydock_slip', color: 0x1d2b4a, locked: true, name: 'the cook van' },
      { spawn: [
        { id: 'cook_guard', at: 'drydock_slip', count: 4, faction: 'salts', weapon: 'smg', behavior: 'guard', group: 'cooks' },
        { id: 'cook_heavy', at: 'drydock_slip', count: 2, faction: 'salts', weapon: 'shotgun', behavior: 'patrol', group: 'cooks' },
      ] },
      { music: 'tension' },
      { kill: 'cooks', objective: 'Clear the Salts off the slip', say: [
        ['jay', '(as a shotgun booms off the hull) Freelancers. Always so committed.'],
      ] },
      { destroy: 'lab_van', checkpoint: true, objective: 'Torch the cook van. A molotov or a grenade will do it.' },
      { heat: 3 },
      { music: 'action' },
      { getIn: 'kings_car', objective: 'Back in the Drifter' },
      { loseHeat: true, objective: 'Get out of the docks and lose the heat', say: [
        ['wick', '(on the phone, awed) I can see the smoke from the alley. Teo\'s pretending he can\'t.'],
      ] },
      { deliver: 'kings_car', to: 'lantern_alley', maxDamage: 0.75, objective: 'Bring the Drifter back to Lantern Alley' },
      { scene: { at: 'lantern_alley', cast: ['teo', 'wick'] }, say: [
        ['teo', '(watching the glow over the docks) No more leaks. No war.'],
        ['jay', 'Rhea will hear it was you.'],
        ['teo', 'Rhea will hear it was nobody. That\'s why she said "who".'],
        ['wick', '(sniffing Jay) You smell like a bonfire.'],
        ['teo', '(handing over a long case) For the next time someone talks. From far away.'],
      ] },
      { setFlag: 'gangs_cook_shack_done' },
    ],
  });

  // ===================================================================
  // g06 LAST FLIGHT: the Goldline job, out by helicopter
  // ===================================================================
  jobs.push({
    id: 'g06_last_flight',
    title: 'Last Flight',
    giver: 'rhea',
    start: 'kostas_salvage',
    time: 22,
    estMinutes: 12,
    summary: 'Halberd\'s bullion sits in the Goldline vault. Every road out of downtown closes in four minutes. Dex has a better idea.',
    reward: { money: 9000, weapons: ['rifle', 'grenade'], armor: 100, unlock: ['gangs_sparrow'] },
    steps: [
      { scene: { at: 'kostas_salvage', cast: ['rhea', 'kostya', 'deb'] }, say: [
        ['rhea', 'Goldline Bullion. Halberd\'s gold, in Voss\'s vault, under a pawn shop. I like it already.'],
        ['kostya', 'The problem is the roads. Four minutes after the alarm, every bridge out of downtown is a roadblock.'],
        ['jay', 'So we don\'t take the roads.'],
        ['deb', '(bouncing on her heels) Tell him! Tell him!'],
        ['rhea', '(sighing) Your mechanic friend. Calloway. He\'s fixed a helicopter.'],
        ['jay', 'Dex fixed a helicopter.'],
        ['deb', 'It\'s red! It has a little bird on it!'],
        ['rhea', 'Take the gold. Take the bird. Land it at Pier 9. Don\'t bring the police.'],
      ] },
      { spawnCar: 'job_car', type: 'sovereign', at: 'kostas_salvage', color: 0x0a0a0c },
      { getIn: 'job_car', checkpoint: true, objective: 'Take the Sovereign' },
      { goto: 'goldline_exchange', vehicle: true, objective: 'Drive to Goldline Bullion & Pawn' },
      { spawn: [{ id: 'vault_guard', at: 'goldline_exchange', count: 4, faction: 'halberd', weapon: 'smg', behavior: 'guard', group: 'vault' }] },
      { music: 'tension' },
      { kill: 'vault', objective: 'Deal with the Halberd guards' },
      { collect: ['goldline_exchange'], item: 'gold bars', objective: 'Load up the gold bars' },
      { heat: 4 },
      { music: 'action' },
      { phone: 'dex', say: [
        ['dex', '(over rotor noise) Jay. They\'re closing the bridges. Bird\'s warm, on the sand at Harbor Beach.'],
        ['jay', 'Since when do you fix helicopters?'],
        ['dex', 'Since Tuesday. (beat) It\'s basically a car that\'s angry at the ground.'],
      ] },
      { getIn: 'job_car', objective: 'Back in the Sovereign' },
      { goto: 'harbor_beach', vehicle: true, radius: 30, objective: 'Get to Harbor Beach' },
      { spawnCar: 'bird', type: 'sparrow', at: 'harbor_beach', exact: true, color: 0xd8262e, name: 'the Sparrow' },
      { getIn: 'bird', checkpoint: true, objective: 'Get in Dex\'s helicopter' },
      { loseHeat: true, objective: 'Fly. Lose the police helicopter.', say: [
        ['deb', '(on the radio, ecstatic) You\'re FLYING! Kostya, he\'s flying!'],
        ['kostya', '(on the radio) I can see. Everybody can see. That is the problem.'],
      ] },
      { deliver: 'bird', to: 'tidewater_lot', maxDamage: 0.8, objective: 'Land the Sparrow in the Tidewater lot at Pier 9' },
      { scene: { at: 'tidewater_lot', cast: ['rhea', 'kostya', 'deb', 'dex'] }, say: [
        ['dex', '(running a hand over a fresh dent) You brought her back. Mostly.'],
        ['rhea', '(lifting a bar to the floodlight) Voss will tell the papers it was insured.'],
        ['jay', 'Was it?'],
        ['rhea', 'Not against us.'],
        ['deb', '(hugging the skid) Can we keep the helicopter?'],
        ['dex', 'No.'],
        ['rhea', '(not looking at Dex) Yes. Jay keeps the helicopter. Calloway gets paid for it.'],
        ['dex', '(after a long moment) ...Yes.'],
      ] },
      { setFlag: 'gangs_last_flight_done' },
    ],
  });

  S.side.push({
    id: 'side_street_money',
    title: 'Street Money',
    giver: 'rhea',
    unlockAfter: 'm05_the_toolbox',
    missions: jobs,
  });
})();
