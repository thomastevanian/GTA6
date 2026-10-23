/*
 * area51-mission.js — "Close Encounter": Noor talks Jay into stealing the
 * flying saucer Area 51 is test-flying off its runway (OWNER: Account B).
 *
 * Mission data in the format of docs/MISSIONS.md, pushed onto the story's
 * side chains. It loads with area51.js, before data/story.js, so it only
 * appends (story.js keeps `side` with `||`); it uses the existing cast and
 * the places area51.js registers (area51_gate, area51_runway).
 */
(function () {
  'use strict';

  const VH = window.VH;
  VH.Data = VH.Data || {};
  const S = (VH.Data.story = VH.Data.story || {});
  S.side = S.side || [];

  const jobs = [{
    id: 'a51_close_encounter',
    title: 'Close Encounter',
    giver: 'noor',
    start: 'signal_office',
    time: 22,
    estMinutes: 8,
    summary: 'Noor has been listening to Area 51\'s radio. Tonight they fly the saucer. Tonight Jay does.',
    reward: { money: 12000, armor: 100 },
    steps: [
      { scene: { at: 'signal_office', cast: ['noor'] }, say: [
        ['noor', '(headphones round her neck, three laptops open) You know the fenced-off desert past the airport? The one that isn\'t on any map?'],
        ['jay', 'The "weather station".'],
        ['noor', 'Weather stations don\'t have a runway, eight guard towers and a radio channel in a cipher from 1962. I broke it on my lunch break.'],
        ['noor', '(turning a screen) "Test article to runway, twenty-three hundred. Do not look directly at test article." Jay. It\'s round.'],
        ['jay', 'Round.'],
        ['noor', 'Round, silver, and it hovers. They roll it out tonight. Nobody on Earth has driven one. I want you to be the first.'],
        ['jay', '(after a long beat) Do they have guns?'],
        ['noor', 'They have so many guns. But they\'ll be looking up, not at the gate.'],
      ] },
      { goto: 'area51_gate', objective: 'Get to Area 51, in the desert west of the airport', say: [
        ['noor', '(on the phone) Road from the end of the airport taxiway. You\'ll know it when the signs start threatening you.'],
      ] },
      { spawnCar: 'visitor', type: 'ufo', at: 'area51_runway', exact: true, color: 0xb6bdc6 },
      { phone: 'noor', checkpoint: true, say: [
        ['noor', 'It\'s out. Runway, west side of the base. The guards will start shooting the second you\'re through the fence, so don\'t stop.'],
        ['noor', 'Controls are basically a helicopter. Space to go up. Probably. I\'m guessing. Good luck!'],
      ] },
      { music: 'action' },
      { goto: 'area51_runway', radius: 14, objective: 'Get through the base to the saucer on the runway' },
      { getIn: 'visitor', objective: 'Get in the saucer' },
      { heat: 4 },
      { deliver: 'visitor', to: 'crestline_overlook', maxDamage: 0.8, objective: 'Fly the saucer to the Crestline overlook and set it down', say: [
        ['jay', '(as the hull hums and the ground drops away) Oh. Oh, that\'s... Noor, it doesn\'t make any noise.'],
        ['noor', '(screaming with joy) YOU\'RE FLYING A UFO. I\'m recording. I\'m recording everything.'],
        ['caption', '(Below, every searchlight in Area 51 swings up at once.)'],
      ] },
      { loseHeat: true, objective: 'Lose the heat' },
      { phone: 'noor', say: [
        ['noor', '(breathless) Okay. Okay. Everyone saw it. Half the city filmed a flying saucer over Crestline tonight.'],
        ['noor', 'The government will say it was a weather balloon. A silver weather balloon. With a man waving out of the window.'],
        ['jay', 'I didn\'t wave.'],
        ['noor', 'You definitely waved. It\'s on video. Keep it. It\'s yours. Nobody is going to report it stolen.'],
      ] },
      { setFlag: 'a51_close_encounter_done' },
    ],
  }];

  S.side.push({
    id: 'side_area51',
    title: 'Close Encounter',
    giver: 'noor',
    unlockAfter: 'm03_ten_and_two',
    missions: jobs,
  });
})();
