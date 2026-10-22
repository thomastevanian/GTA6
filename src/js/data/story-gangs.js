/*
 * data/story-gangs.js — "Street Money": a side chain of gang jobs for the
 * Saltmarsh Salts and the Lantern Kings. Steal the cash, run the packages
 * through rival territory, hit a Halberd depot and get out with the heat on.
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
      { spawnCar: 'getaway', type: 'ironclad', at: 'pelican_bank', color: 0x1c1c1f },
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
      { deliver: 'getaway', to: 'kostas_salvage', timeLimit: 150, maxDamage: 0.7, objective: 'Get the cash back to Kostas Salvage before midnight', say: [
        ['jay', '(checking the mirror, then the mirror again) They\'re on me. Of course they are.'],
      ] },
      { loseHeat: true, objective: 'Lose the cops before you reach the gate' },
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
        ['teo', 'Pick them up along Tannery Row, then take them to the Parkade by ten. The Salts know there\'s a run tonight. Somebody talked.'],
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
      { deliver: 'run_car', to: 'grand_parkade', maxDamage: 0.6, objective: 'Get the packages to the Grand Parkade by ten', say: [
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
      { deliver: 'depot_car', to: 'kostas_salvage', timeLimit: 200, maxDamage: 0.7, objective: 'Get the payroll back to Kostas Salvage', say: [
        ['deb', '(on the radio, thrilled) Is that a helicopter? That is a helicopter. I love this job.'],
        ['jay', 'Deb. Get off the radio.'],
      ] },
      { loseHeat: true, objective: 'Lose the heat before you reach the yard' },
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

  S.side.push({
    id: 'side_street_money',
    title: 'Street Money',
    giver: 'rhea',
    unlockAfter: 'm05_the_toolbox',
    missions: jobs,
  });
})();
