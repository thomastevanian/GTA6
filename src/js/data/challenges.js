/*
 * data/challenges.js — timed challenges, as data.
 *
 * kind 'freerun'    finish as fast as you can; medals are target times.
 * kind 'countdown'  the clock counts down and each checkpoint adds time;
 *                   medals are seconds left on the clock at the finish.
 *
 * Checkpoint positions come from the world (construction.js builds the
 * Yard Run course; challenges.js lays the Courier Rush route along the
 * streets), so they follow the city if the layout changes.
 */
(function () {
  'use strict';

  const VH = window.VH;
  VH.Data = VH.Data || {};

  VH.Data.challenges = [
    {
      id: 'yard_run',
      name: 'Yard Run',
      kind: 'freerun',
      place: 'Meridian Yard',
      blurb: 'Containers, scaffolding and a steel beam nine metres up. Fall and you start the section again, but the clock keeps running.',
      medals: { gold: 36, silver: 46, bronze: 62 },
      rewards: { gold: 500, silver: 250, bronze: 100 },
      fallPenalty: 3,
      color: [0.25, 1.8, 2.6],
    },
    {
      id: 'courier_rush',
      name: 'Courier Rush',
      kind: 'countdown',
      place: 'Civic Plaza → Oceanview Pier',
      blurb: 'A package has to reach the end of the pier. Every checkpoint buys you seconds, and there are none to waste.',
      startTime: 32,
      medals: { gold: 18, silver: 10, bronze: 0 },
      rewards: { gold: 750, silver: 400, bronze: 150 },
      fallPenalty: 0,
      color: [2.6, 1.3, 0.25],
    },
  ];
})();
