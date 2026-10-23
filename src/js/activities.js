/*
 * activities.js — things to do between story jobs.
 *
 *   Taxi fares     get in a cab and press P: pick up a fare, get them there
 *                  before the meter runs out, hear their story on the way
 *   Street races   six courses round the city against named rivals
 *   Stunt jumps    ramps around the docks, the fields and the building sites.
 *                  Clear one for a slow-motion jump and a bonus
 *   Lost lanterns  thirty red paper lanterns hidden around the city
 *   Dex's list     cars Dex has buyers for: find, steal, deliver undamaged
 *   Bounties       people someone wants found
 *   Turf wars      hold a corner against a rival crew
 *
 * Races, the list, bounties and turf wars are small jobs run by the mission
 * engine; their names, lines and rewards come from VH.Data.story.activities
 * (with sensible defaults built in).
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, smoothstep } = VH.math;

  // Race courses as road coordinates (checkpoints on junctions and straights).
  const COURSES = [
    { id: 'race_heron', name: 'Heron Corner Sprint', start: { x: -89, z: 292, yaw: Math.PI / 2 }, cps: [[0, 292], [96, 292], [99, 150], [99, 3], [240, 3], [384, 3], [381, 150], [381, 292], [192, 292]] },
    { id: 'race_grand', name: 'The Grand Loop', start: { x: -4, z: -40, yaw: Math.PI }, cps: [[-4, -192], [-4, -380], [96, -384], [192, -384], [195, -240], [195, -96], [96, -93], [-96, -93], [-93, -3], [0, 3]] },
    { id: 'race_market', name: 'Boardwalk Burn', start: { x: 387, z: 250, yaw: Math.PI }, cps: [[387, 150], [387, 3], [387, -150], [387, -285], [291, -291], [285, -150], [285, 3], [285, 150], [285, 288], [384, 291]] },
    { id: 'race_docks', name: 'Saltmarsh Run', start: { x: 291, z: 400, yaw: 0 }, cps: [[291, 470], [150, 473], [3, 470], [3, 580], [150, 583], [285, 580], [291, 470], [400, 473]] },
    { id: 'race_crest', name: 'Crestline Hill Climb', start: { x: -400, z: 3, yaw: -Math.PI / 2 }, cps: [[-510, 3], [-513, -150], [-513, -288], [-384, -291], [-381, -96], [-381, 96], [-381, 288], [-510, 291], [-507, 150], [-510, 3]] },
    { id: 'race_tour', name: 'The Vicehaven Grand Tour', start: { x: 3, z: 360, yaw: Math.PI }, cps: [[3, 192], [3, 0], [3, -192], [3, -380], [192, -384], [384, -384], [381, 0], [381, 384], [192, 381], [-192, 381], [-384, 381], [-381, 0], [-381, -384], [-192, -384], [-96, -381]] },
  ];

  const DEFAULT_RIVALS = [
    [{ name: 'Kit "Cinders" Álvarez', car: 'drifter' }, { name: 'Big Moss', car: 'ironclad' }, { name: 'Lena Quail', car: 'vireo' }],
    [{ name: 'Rook', car: 'vireo' }, { name: 'Tamsin Grey', car: 'zephyr' }, { name: 'Oyelaran', car: 'drifter' }],
  ];

  // Stunt ramps: position, heading of the run-up, and a name.
  const JUMPS = [
    { x: 160, z: 510, yaw: 0, name: 'Over the stacks' },
    { x: 110, z: 568, yaw: Math.PI / 2, name: 'Container hop' },
    { x: 350, z: 440, yaw: -Math.PI / 2, name: 'Pier 9 leap' },
    { x: 230, z: 590, yaw: Math.PI / 2, name: 'Boatyard launch' },
    { x: -470, z: 470, yaw: Math.PI / 2, name: 'The long field' },
    { x: -250, z: 520, yaw: 0, name: 'Hedge jumper' },
    { x: 150, z: -800, yaw: Math.PI, name: 'North pasture' },
    { x: -560, z: -470, yaw: Math.PI / 2, name: 'Outskirts rodeo' },
    { x: -140, z: 36, yaw: -Math.PI / 2, name: 'Meridian Yard flyer' },
    { x: 380, z: 500, yaw: 0, name: 'Quay jump' },
    { x: -560, z: 470, yaw: -Math.PI / 2, name: 'Estate lawn' },
    { x: 60, z: -800, yaw: -Math.PI / 2, name: 'Grand Avenue north' },
    // Westbrook, the north-west fields, the desert and the south fields (added by Account B; each has a clear run-up and landing).
    { x: -925, z: -200, yaw: 0, name: 'Westbrook backyards' },
    { x: -925, z: 170, yaw: Math.PI, name: 'Orchard over the fence' },
    { x: -1300, z: -650, yaw: Math.PI / 2, name: 'Desert dash' },
    { x: -500, z: -800, yaw: Math.PI / 2, name: 'Cornfield kicker' },
    { x: -300, z: -950, yaw: 0, name: 'Runway approach' },
    { x: -750, z: 500, yaw: Math.PI / 2, name: 'South meadow' },
    { x: -1000, z: 500, yaw: -Math.PI / 2, name: 'Fort fence-line' },
    { x: -200, z: -1050, yaw: Math.PI / 2, name: 'Airport road ditch' },
    { x: -850, z: -500, yaw: 0, name: 'Crestline back forty' },
    { x: -650, z: -1000, yaw: -Math.PI / 2, name: 'Hotel car park hop' },
    { x: -1250, z: -1000, yaw: 0, name: 'Area 51 approach' },
    { x: -1450, z: -500, yaw: Math.PI, name: 'Dry lake' },
    { x: -300, z: 580, yaw: Math.PI / 2, name: 'Southern fields' },
    { x: -900, z: -750, yaw: Math.PI / 2, name: 'Pylon run' },
  ];

  function rngFrom(seed) {
    const r = new VH.RNG(seed);
    return () => r.next();
  }

  // Taxi stands at the places outside the old grid, and the kinds of place worth a long fare.
  const STANDS = /^(airport_terminal|airport_gate|northgate_heights|northgate_plaza|fort_gate|store_\d+)$/;
  const FEATURED = new Set(['airport', 'fort', 'skyline', 'store']);

  class Activities {
    constructor(game) {
      this.game = game;
      this.data = (VH.Data.story && VH.Data.story.activities) || {};
      this.taxi = { on: false, fare: null, done: 0, earned: 0 };
      this.jumpsDone = {};
      this.lanternsFound = {};
      this.bestRace = {};
      this._jump = null;
      this._buildJumps();
      this._buildLanterns();
      this._registerJobs();
    }

    // ------------------------------------------------------------ jobs
    _registerJobs() {
      const eng = this.game.missions;
      const addJob = (m) => {
        m.activity = true;
        if (!m.requires) m.requires = [];
        eng.all.set(m.id, m);
        (this.jobs || (this.jobs = [])).push(m);
        return m;
      };
      const d = this.data;
      const carName = (type) => (VH.Vehicle.typeSpec(type) || {}).name || type;
      const lineList = (list) => (list || []).map((l) => (Array.isArray(l) ? l : ['caption', l]));

      // Street races.
      const races = d.races || [];
      COURSES.forEach((c, i) => {
        const info = races[i] || {};
        const rivals = (info.rivals || DEFAULT_RIVALS[i % 2]).slice(0, 3).map((r, k) => ({ name: r.name || r, car: r.car || ['vireo', 'drifter', 'ironclad'][k], skill: 0.85 + i * 0.03 + k * 0.03, color: r.color }));
        const placeId = c.id + '_start';
        const name = info.name || c.name;
        this.game.places.add(placeId, { name: name + ' (race)', x: c.start.x, z: c.start.z, yaw: c.start.yaw, kind: 'street' });
        const talk = lineList(info.lines || info.trashTalk).slice(0, 5);
        const req = info.requires ? [].concat(info.requires) : i === 0 ? ['m06_tick_tock'] : [COURSES[i - 1].id];
        addJob({
          id: c.id, title: name, giver: 'race', start: placeId, repeatable: true, estMinutes: 4,
          summary: 'Street race: ' + name + ' · ' + rivals.map((r) => r.name).join(', '), requires: req,
          reward: { money: info.prize || 1200 + i * 400 },
          steps: [
            { getIn: 'any', objective: 'Get a car for the race' },
            { goto: placeId, vehicle: true, radius: 9, objective: 'Line up at the start of ' + name },
            talk.length ? { say: talk } : { wait: 0.1 },
            { race: { checkpoints: c.cps.map(([x, z]) => ({ x, z })), rivals } },
          ],
        });
      });
      if (d.raceWinAll) {
        VH.events.on('mission:pass', (e) => {
          if (!/^race_/.test(e.m.id) || eng.flags[d.raceWinAll.flag]) return;
          if (!COURSES.every((c) => eng.completed[c.id])) return;
          eng.flags[d.raceWinAll.flag] = true;
          setTimeout(() => {
            this.game.dialogue.play([d.raceWinAll.text], { mode: 'phone', from: d.raceWinAll.text[0] });
            this.game.hud.centerBanner('KING OF THE ROAD', 'All six races won · a gold ' + carName(d.raceWinAll.car) + ' is waiting at Heron Corner');
            this._spawnKingCar();
            eng.save();
          }, 6000);
        });
      }

      // Dex's list: find the car, bring it in. After m22 the list changes hands;
      // after m23 the garage is gone and cars go to Kostas Salvage.
      const list = d.carList || [];
      const DEFAULT_LIST = ['zephyr', 'lowrider', 'sovereign', 'drifter', 'ironclad', 'tern', 'vireo', 'bulwark', 'mesa', 'medic'];
      const listCount = Math.max(10, list.length);
      for (let i = 0; i < listCount; i++) {
        const info = list[i] || {};
        const type = info.type || DEFAULT_LIST[i % DEFAULT_LIST.length];
        const id = 'list_' + (i + 1);
        const where = info.place || ['old_market', 'downtown', 'harbor_point', 'palm_crescent', 'crane_row', 'pruitt_house'][i % 6];
        const pitch = info.lines || [['dex', info.reason || 'Got a buyer for a ' + carName(type) + '. Not a scratch on it, Jay.']];
        const brief = { if: 'm22_lugnut', then: [
          { if: 'dex_to_calder',
            then: [{ phone: 'rhea', say: info.rhea || [['rhea', 'Calloway\'s list is mine now. A ' + carName(type) + '. Bring it to the salvage yard.']] }],
            else: [{ text: 'birdie', message: info.birdie || 'Daddy says the next car is a ' + carName(type) + '.' }] },
        ], else: [{ phone: 'dex', say: pitch }] };
        const deliver = (to) => ({ deliver: 'target', to, maxDamage: 0.4, objective: 'Bring the ' + carName(type) + ' in. Not a scratch.' });
        const job = addJob({
          id, title: 'Dex\'s list: ' + carName(type), giver: 'dex', estMinutes: 5,
          summary: info.reason || 'A buyer wants one. Undamaged.', requires: [].concat(info.requires || 'm05_the_toolbox'),
          reward: { money: info.pay !== undefined ? info.pay : 1500 + i * 250 },
          steps: info.steps || [
            brief,
            { spawnCar: 'target', type, at: where, color: info.color },
            { getIn: 'target', objective: 'Steal the ' + carName(type) + (info.place ? ' at ' + VH.Places.titleFromId(info.place) : '') },
            { if: 'm23_ashes', then: [deliver('kostas_salvage')], else: [deliver('dex_garage')] },
          ],
        });
        Object.defineProperty(job, 'start', { get: () => (eng.completed.m23_ashes ? 'kostas_salvage' : 'dex_garage'), enumerable: true });
        if (i > 0) job.requires.push('list_' + i);
      }

      // Bounties for Honor Blackwood.
      const bounties = d.bounties || [];
      for (let i = 0; i < Math.max(8, bounties.length); i++) {
        const b = bounties[i] || {};
        const id = 'bounty_' + (i + 1);
        const where = b.place || ['lantern_alley', 'market_scrapyard', 'grand_parkade', 'harbor_beach', 'crane_row', 'drydock_slip', 'tannery_row', 'crestline_overlook'][i % 8];
        addJob({
          id, title: b.name ? 'Bounty: ' + b.name : 'Bounty ' + (i + 1), giver: 'blackwood', start: d.bountyStart || 'heron_corner', estMinutes: 7,
          summary: b.dossier || 'Someone skipped bail. Bring them in.', requires: [b.requires || d.bountyRequires || 'm10_sons'].concat(i > 0 ? ['bounty_' + i] : []),
          reward: { money: b.reward !== undefined ? b.reward : 1000 + i * 350 },
          steps: b.steps || [
            { text: 'blackwood', message: b.dossier || 'Target spotted near ' + VH.Places.titleFromId(where) + '. Armed. Paid on proof.' },
            { goto: where, radius: 30, objective: 'Find ' + (b.name || 'the target') },
            { spawn: [{ id: 'mark', at: where, faction: 'halberd', weapon: b.weapon || 'pistol', behavior: 'attack', health: 180, group: 'mark' }, { at: where, faction: 'halberd', weapon: 'pistol', count: 1 + (i % 3), behavior: 'guard', group: 'mark' }] },
            { kill: 'group:mark', objective: 'Take down ' + (b.name || 'the target') },
          ],
        });
      }

      // Turf wars: hold the spot against waves.
      const turf = d.turf || [];
      for (let i = 0; i < Math.max(5, turf.length); i++) {
        const t = turf[i] || {};
        const id = 'turf_' + (i + 1);
        const where = t.place || ['lantern_alley', 'tannery_row', 'heron_corner', 'crane_row', 'the_boardwalk'][i % 5];
        const foe = t.faction || 'halberd';
        const hold = t.survive || 75 + i * 10;
        // The people who talk are there: the Kings hold the spot with Jay,
        // everyone else stands back.
        const said = lineList(t.lines || [['teo', 'They\'re coming for the corner. Hold it with us.']]).concat(lineList(t.win || []));
        const cast = [];
        for (const l of said) if (Array.isArray(l) && eng.story.characters[l[0]] && l[0] !== 'jay' && !cast.includes(l[0])) cast.push(l[0]);
        const FIGHTERS = ['teo', 'wick', 'kostya', 'deb'];
        const spawnCast = cast.map((c, k) => FIGHTERS.includes(c)
          ? { char: c, at: where, offset: [k % 2 ? -2.5 : 2.5, -2 - k], behavior: 'follow', weapon: 'pistol', health: 400 }
          : { char: c, at: where, offset: [k % 2 ? -4 : 4, -6 - k], behavior: 'idle', health: 400 });
        addJob({
          id, title: t.name || 'Turf war: ' + VH.Places.titleFromId(where), giver: 'teo', start: where, estMinutes: 5, repeatable: false,
          summary: t.desc || 'Hold the corner.', requires: [t.requires || 'm10_sons'],
          reward: { money: t.reward || 900 + i * 300, armor: 50 },
          steps: [
            spawnCast.length ? { spawn: spawnCast } : { wait: 0.1 },
            { say: lineList(t.lines || [['teo', 'They\'re coming for the corner. Hold it with us.']]) },
            { music: 'action' },
            { survive: hold, objective: 'Hold ' + VH.Places.titleFromId(where), waves: t.waves || [
              { at: where, count: 3, weapon: 'pistol', faction: foe, delay: 2 },
              { at: where, count: 3, weapon: 'smg', faction: foe, delay: Math.round(hold * 0.3) },
              { at: where, count: 4, weapon: i > 2 ? 'rifle' : 'smg', faction: foe, delay: Math.round(hold * 0.55) },
              { at: where, count: 3, weapon: i > 1 ? 'shotgun' : 'smg', faction: foe, delay: Math.round(hold * 0.75) },
            ] },
            { music: 'triumph' },
            t.win ? { say: lineList(t.win) } : { wait: 0.1 },
          ],
        });
      }
    }

    // ------------------------------------------------------------ ramps
    _buildJumps() {
      const g = this.game;
      const ph = g.physics;
      const mat = new THREE.MeshStandardMaterial({ map: Activities._chevrons(), roughness: 0.7, metalness: 0.1 });
      const side = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8 });
      this.ramps = [];
      for (const j of JUMPS) {
        const L = 9;
        const W = 5;
        const H = 2.1;
        const y0 = ph.groundHeight(j.x, j.z, 1); // the yard, not a roof or a stack over it
        // Wedge rising along the run-up direction (local +Z).
        const shape = new THREE.Shape();
        shape.moveTo(-L / 2, 0);
        shape.lineTo(L / 2, 0);
        shape.lineTo(L / 2, H);
        shape.lineTo(-L / 2, 0);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
        geo.translate(0, 0, -W / 2);
        geo.rotateY(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, [side, mat]);
        mesh.position.set(j.x, y0, j.z);
        mesh.rotation.y = j.yaw;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = 'stunt ramp ' + j.name;
        g.scene.add(mesh);
        ph.addRamp(j.x, j.z, W / 2, L / 2, j.yaw, y0 - 0.2, y0, y0 + H, 'ramp');
        this.ramps.push({ j, top: { x: j.x + Math.sin(j.yaw) * L / 2, z: j.z + Math.cos(j.yaw) * L / 2 }, y: y0 + H });
      }
      VH.events.on('vehicle:land', (e) => this._onLand(e));
    }

    static _chevrons() {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#1b1d22';
      x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#f2b62e';
      for (let i = -2; i < 6; i++) {
        x.beginPath();
        x.moveTo(i * 32, 128);
        x.lineTo(i * 32 + 16, 128);
        x.lineTo(i * 32 + 16 + 64, 0);
        x.lineTo(i * 32 + 64, 0);
        x.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(0.2, 0.2);
      return t;
    }

    _checkTakeoff() {
      const v = this.game.player.vehicle;
      if (!v || this._jump) return;
      if (v.grounded || v.speed < 16 || v.kind !== 'car') return;
      for (const r of this.ramps) {
        if (Math.hypot(v.pos.x - r.top.x, v.pos.z - r.top.z) < 6 && v.pos.y > r.y - 1.2) {
          this._jump = { r, start: { x: v.pos.x, z: v.pos.z }, t: this.game.time };
          this.game.slowmo(0.9, 0.35);
          return;
        }
      }
    }

    _onLand(e) {
      const v = e.v;
      if (v !== this.game.player.vehicle || !this._jump) return;
      const J = this._jump;
      this._jump = null;
      const dist = Math.hypot(v.pos.x - J.start.x, v.pos.z - J.start.z);
      const stats = this.game.player.stats;
      stats.longestJump = Math.max(stats.longestJump || 0, dist);
      if (e.airTime < 0.9 || dist < 18) {
        this.game.hud.popScore('JUMP ' + Math.round(dist) + ' M');
        return;
      }
      const first = !this.jumpsDone[J.r.j.name];
      this.jumpsDone[J.r.j.name] = true;
      const money = first ? 500 : 50;
      this.game.hud.centerBanner(first ? 'STUNT JUMP' : 'NICE JUMP', J.r.j.name + ' · ' + Math.round(dist) + ' m · ' + e.airTime.toFixed(1) + ' s');
      this.game.giveMoney(money, 'stunt');
      if (first) this.game.hud.notify({ title: 'Stunt jumps', text: Object.keys(this.jumpsDone).length + ' of ' + this.ramps.length + ' cleared.', icon: '★' });
    }

    // --------------------------------------------------------- lanterns
    _buildLanterns() {
      const g = this.game;
      const rnd = rngFrom('lanterns');
      const spots = [];
      // Alleys, park corners, the pier, the boardwalk, the docks, the estates.
      for (const b of g.layout.blocks) {
        if (b.alley && spots.length < 14) spots.push({ x: (b.alley.minX + b.alley.maxX) / 2 + (rnd() - 0.5) * 20, z: (b.alley.minZ + b.alley.maxZ) / 2 + (rnd() - 0.5) * 4 });
      }
      const more = [[480, 5.5], [560, -5.5], [412, -250], [412, 200], [150, 525], [360, 440], [60, 615], [-600, -150], [-450, 200], [-560, 350], [-51, 30], [-160, 60], [250, 610], [-300, 520], [100, -830], [-500, -500]];
      for (const [x, z] of more) spots.push({ x, z });
      this.lanterns = [];
      const geo = new THREE.SphereGeometry(0.28, 12, 10).scale(1, 1.25, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: new THREE.Color(2.4, 0.35, 0.12), roughness: 0.6 });
      // Street level only: a spot over a roof or inside a shed moves to the
      // nearest clear ground (spiralling out up to 16 m).
      const ph = g.physics;
      const clearAt = (x, z) => {
        const gh = ph.groundHeight(x, z, 1);
        if (gh > 1 || gh < -0.3 || ph.groundHeight(x, z, 50) > gh + 0.5) return null;
        return ph.overlaps(x, z, 0.5, gh + 0.3, gh + 2.2) ? null : gh;
      };
      for (const s of spots) {
        if (clearAt(s.x, s.z) !== null) continue;
        let found = false;
        for (let r = 2; r <= 16 && !found; r += 2) {
          for (let k = 0; k < 12 && !found; k++) {
            const a = (k / 12) * Math.PI * 2;
            if (clearAt(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r) === null) continue;
            s.x += Math.cos(a) * r;
            s.z += Math.sin(a) * r;
            found = true;
          }
        }
      }
      spots.slice(0, 30).forEach((s, i) => {
        const y = ph.groundHeight(s.x, s.z, 1) + 1.1;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(s.x, y, s.z);
        m.name = 'lantern ' + i;
        g.scene.add(m);
        this.lanterns.push({ id: 'lantern_' + i, m, x: s.x, y, z: s.z });
      });
    }

    /**
     * The King of the Road prize: a gold car kept at Heron Corner. It's part
     * of the save (a reload puts it back unless Jay is sitting in it).
     */
    _spawnKingCar() {
      const g = this.game;
      const w = this.data.raceWinAll;
      if (!w || !g.missions.flags[w.flag]) return null;
      const mine = (v) => v && !v.removed && v.type === w.car && v.keep;
      if (mine(this.kingCar) || g.vehicles.list.some(mine)) return this.kingCar;
      const pv = g.player.vehicle;
      if (pv && pv.type === w.car && (w.color === undefined || (pv.model && pv.model.color) === w.color)) {
        pv.keep = true;
        return (this.kingCar = pv);
      }
      const lp = g.roadnet.nearestLane(-89, 296, undefined, 40);
      const pk = lp ? g.missions._kerbPoint(lp) : { x: -89, z: 296, heading: Math.PI / 2 };
      const spot = g.missions._carSpot(pk.x, pk.z, pk.heading, pk.x, pk.z, !!lp);
      const v = g.vehicles.spawn(w.car, spot.x, spot.z, spot.heading, { color: w.color, role: 'parked', persistent: true });
      if (v) {
        v.keep = true;
        v.storyName = 'Gold ' + ((VH.Vehicle.typeSpec(w.car) || {}).name || w.car);
      }
      return (this.kingCar = v);
    }

    // ------------------------------------------------------------ taxi
    _taxiUpdate(dt) {
      const g = this.game;
      const p = g.player;
      const v = p.vehicle;
      const T = this.taxi;
      const inCab = v && (v.type === 'cab');
      const taxiOpen = !this.data.taxiRequires || g.missions.completed[this.data.taxiRequires];
      // Read the key every frame, so a press outside a cab isn't saved up for the next one.
      const pressed = g.input.consume('phone');
      // In a police car P is vigilante duty (vigilante.js), in an ambulance paramedic (paramedic.js); anywhere else but a cab, Jay's phone (phone.js).
      if (!inCab && pressed && !(g.vigilante && g.vigilante.handleKey()) && !(g.paramedic && g.paramedic.handleKey()) && g.phone) g.phone.toggle();
      if (inCab && pressed && !g.missions.run) {
        if (!taxiOpen) {
          g.hud.showToast('The dispatcher doesn\'t know you yet. (Taxi jobs open later in the story.)');
          return;
        }
        T.on = !T.on;
        g.hud.showToast(T.on ? 'Taxi: on duty' : 'Taxi: off duty');
        if (!T.on) this._endFare(false);
      }
      if (!inCab || !T.on) {
        if (T.fare && (!v || v.type !== 'cab')) this._endFare(false, 'You left the cab.');
        return;
      }
      if (!T.fare) {
        T.wait = (T.wait || 0) - dt;
        if (T.wait <= 0) this._newFare();
      }
      const f = T.fare;
      if (!f) return;
      f.t -= dt;
      // GPS route to the pickup / drop-off (the mission engine does this for jobs).
      f.routeT = (f.routeT || 0) - dt;
      if (f.routeT <= 0 && VH.Minimap) {
        f.routeT = 1;
        const goal = f.stage === 'pickup' ? f.from : f.to;
        g.route = Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z) > 30 ? VH.Minimap.route(g.layout, v.pos.x, v.pos.z, goal.x, goal.z) : null;
      }
      if (f.stage === 'pickup' && f.agent && (f.agent.dead || f.agent.removed || f.agent.down)) {
        this._endFare(false, f.agent.dead || f.agent.removed ? 'Your fare won\'t be needing a ride now.' : 'Your fare isn\'t getting in after that.');
        T.wait = 8;
        return;
      }
      if (f.stage === 'pickup') {
        g.hud.trackObjective({ x: f.from.x, y: 0.2, z: f.from.z }, g.renderer.camera);
        g.hud.setObjectiveText('Pick up the fare');
        if (Math.hypot(v.pos.x - f.from.x, v.pos.z - f.from.z) < 7 && v.speed < 2) {
          f.stage = 'ride';
          f.t = f.time;
          if (f.agent) f.agent.hidden = true;
          if (g.audio.carDoor) g.audio.carDoor(false, 0);
          g.dialogue.play(f.lines, { mode: 'ambient' });
        }
      } else {
        g.hud.trackObjective({ x: f.to.x, y: 0.2, z: f.to.z }, g.renderer.camera);
        g.hud.setObjectiveText('Drive the fare to ' + f.toName);
        g.hud.setMissionTimer(Math.max(0, f.t));
        if (Math.hypot(v.pos.x - f.to.x, v.pos.z - f.to.z) < 8 && v.speed < 2) {
          const base = 18 + Math.round(f.dist * 0.07);
          const tip = f.t > 0 ? Math.round(f.t * 1.2) : 0;
          g.giveMoney(base + tip, 'fare');
          T.done++;
          T.earned += base + tip;
          g.hud.popScore('FARE ' + T.done, base + tip);
          if (g.audio.cash) g.audio.cash();
          this._endFare(true);
        } else if (f.t <= 0 && !f.late) {
          f.late = true;
          g.dialogue.play([[f.who, 'Forget the tip, man.']], { mode: 'ambient' });
        } else if (f.t < -90) {
          // Ninety seconds past the meter: the fare gives up and walks.
          g.dialogue.play([[f.who, 'You know what? I\'ll walk from here.']], { mode: 'ambient' });
          this._endFare(true);
          g.hud.showToast('The fare got out. No pay.');
          T.wait = 5;
        }
      }
    }

    /** A spot on the pavement beside the road nearest a place (where a fare waits for the cab). */
    _pavementBy(pl) {
      const g = this.game;
      const lp = g.roadnet.nearestLane(pl.x, pl.z, undefined, 40);
      if (!lp) return null;
      const r = lp.road;
      const off = r.width / 2 + 1.2;
      const spot = r.axis === 'z'
        ? { x: r.coord + (Math.sign(pl.x - r.coord) || 1) * off, z: lp.along }
        : { x: lp.along, z: r.coord + (Math.sign(pl.z - r.coord) || 1) * off };
      const gh = g.physics.groundHeight(spot.x, spot.z, 50);
      return gh > 0.8 || gh < -0.1 ? null : spot;
    }

    /** Where fares wait: city corners, plus taxi stands at the new places and the roadside strips. */
    _farePickup(stand) {
      const g = this.game;
      const p = g.player.pos;
      const corners = () => {
        for (let i = 0; i < 20; i++) {
          const b = g.layout.blocks[Math.floor(Math.random() * g.layout.blocks.length)];
          const c = Math.floor(Math.random() * 4);
          const x = c === 0 || c === 3 ? b.minX + 2 : b.maxX - 2;
          const z = c === 0 || c === 1 ? b.minZ + 2 : b.maxZ - 2;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d > 80 && d < 260) return { x, z };
        }
        return null;
      };
      const stands = () => {
        const cand = [];
        for (const pl of g.places.map.values()) {
          if (!STANDS.test(pl.id || '')) continue;
          const d = Math.hypot(pl.x - p.x, pl.z - p.z);
          if (d > 80 && d < 400) cand.push(pl);
        }
        for (const S of g.layout.strips || []) {
          const [[x0, z0], [x1, z1]] = S.walk;
          for (let k = 0; k < 3; k++) {
            const t = Math.random();
            const x = x0 + (x1 - x0) * t;
            const z = z0 + (z1 - z0) * t;
            const d = Math.hypot(x - p.x, z - p.z);
            if (d > 80 && d < 400) cand.push({ x, z, onPavement: true });
          }
        }
        while (cand.length) {
          const c = cand.splice(Math.floor(Math.random() * cand.length), 1)[0];
          const spot = c.onPavement ? { x: c.x, z: c.z } : this._pavementBy(c);
          if (spot) return spot;
        }
        return null;
      };
      return stand ? stands() || corners() : corners() || stands();
    }

    _newFare() {
      const g = this.game;
      const vig = this.data.taxi || [];
      const best = this._farePickup(Math.random() < 0.35);
      if (!best) return;
      // Somewhere a cab can actually pull up: not a roof, the end of the pier
      // or a race start, and with a kerb within 40 m to stop at. Trips to or
      // from out of town (the airport, the fort gate, Northgate, the strips)
      // may run twice as far.
      const cb = g.layout.config.cityBounds || g.layout.config.bounds;
      const outOfTown = best.x < cb.minX || best.x > cb.maxX || best.z < cb.minZ || best.z > cb.maxZ;
      const cap = (pl) => (outOfTown || FEATURED.has(pl.kind) ? 1800 : 900);
      const dests = Array.from(g.places.map.values()).filter((pl) => {
        if (!pl.name || pl.roof || pl.y > 1 || /\((race|stunt)\)|roof/i.test(pl.name) || pl.kind === 'pier') return false;
        const d = Math.hypot(pl.x - best.x, pl.z - best.z);
        return d > 250 && d < cap(pl);
      });
      // About one fare in three heads somewhere new: mostly the big places, sometimes a shop.
      const big = dests.filter((pl) => FEATURED.has(pl.kind) && pl.kind !== 'store');
      const shops = dests.filter((pl) => pl.kind === 'store');
      const r = Math.random();
      const pools = [r < 0.22 && big.length ? big : r < 0.32 && shops.length ? shops : null, dests].filter(Boolean);
      let to = null;
      for (const pool of pools) {
        for (let i = 0; i < 12 && !to && pool.length; i++) {
          const pl = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          const lp = g.roadnet.nearestLane(pl.x, pl.z, undefined, 40);
          if (!lp) continue;
          const pk = g.missions._kerbPoint(lp);
          const gh = g.physics.groundHeight(pk.x, pk.z, 50);
          if (gh > 0.8 || gh < -0.1) continue;
          to = { x: pk.x, z: pk.z, name: pl.name, id: pl.id, kind: pl.kind };
        }
        if (to) break;
      }
      if (!to) return;
      const who = 'passenger';
      // Fares unlock with the story; the ones you haven't heard yet come first.
      // A fare written for this destination ('to') comes first when there is one.
      const done = g.missions.completed;
      const goes = (f) => f.to === to.kind || f.to === to.id;
      const open = vig.filter((f) => (!f.after || done[f.after]) && (!f.to || goes(f)));
      this.heardFares = this.heardFares || {};
      const fresh = open.filter((f) => !this.heardFares[f.name]);
      const matched = fresh.filter((f) => f.to);
      const pool = matched.length ? matched : fresh.length ? fresh : open;
      const v = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      if (v) this.heardFares[v.name] = true;
      const ids = { fare: who, fare2: 'passenger2' };
      const lines = v ? (v.lines || v).map((l) => (Array.isArray(l) ? [l[0] === 'jay' || l[0] === 'caption' ? l[0] : ids[l[0]] || l[0], l[1]] : [who, l])) : [[who, 'Just drive, yeah? I\'ve had a day.']];
      const gender = Math.random() < 0.5 ? 'female' : 'male';
      g.dialogue.cast[who] = { name: (v && v.name) || 'Fare', color: '#c9d3ff', voice: { gender, pitch: 0.9 + Math.random() * 0.3, rate: 0.95 + Math.random() * 0.15 } };
      g.dialogue.cast.passenger2 = { name: 'Fare', color: '#ffc9e0', voice: { gender: gender === 'male' ? 'female' : 'male', pitch: 1.0 + Math.random() * 0.2, rate: 1.05 } };
      g.dialogue._voiceMap.delete(who);
      g.dialogue._voiceMap.delete('passenger2');
      const agent = g.crowd.spawn(best.x, best.z, { persistent: true });
      agent.brain = { update: (a) => { a.moveSpeed = 0; a.anim.handsUp = Math.sin(g.time * 3) > 0.6 ? 0.4 : 0; } };
      // The meter and the pay go by the road, not as the crow flies.
      let dist = Math.hypot(to.x - best.x, to.z - best.z);
      const route = VH.Minimap && VH.Minimap.route ? VH.Minimap.route(g.layout, best.x, best.z, to.x, to.z) : null;
      if (route && route.length > 1) {
        let len = 0;
        for (let i = 1; i < route.length; i++) len += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
        dist = Math.max(dist, len);
      }
      this.taxi.fare = { stage: 'pickup', from: best, to, toName: to.name, dist, time: 25 + dist / 11, t: 999, who, lines, agent };
    }

    _endFare(ok, reason) {
      const g = this.game;
      const f = this.taxi.fare;
      if (!f) return;
      if (f.agent) {
        if (ok && g.player.vehicle) {
          const w = g.player.vehicle.localToWorld(-(g.player.vehicle.hx + 0.8), 0, {});
          f.agent.pos.set(w.x, f.agent.pos.y, w.z);
        }
        f.agent.hidden = false;
        f.agent.persistent = false;
        f.agent.brain = null;
      }
      this.taxi.fare = null;
      g.route = null;
      g.hud.trackObjective(null);
      g.hud.setObjectiveText(null);
      g.hud.setMissionTimer(null);
      if (!ok && reason) g.hud.showToast(reason);
    }

    // ------------------------------------------------------------ frame
    update(dt) {
      const g = this.game;
      if (!g.missions.run) this._taxiUpdate(dt);
      else g.input.discard('phone'); // a P pressed during a job doesn't start taxi duty afterwards
      this._checkTakeoff();
      // Lanterns: spin, and collect by walking (or driving slowly) through them.
      const p = g.player.pos;
      for (const L of this.lanterns) {
        if (this.lanternsFound[L.id]) continue;
        L.m.rotation.y += dt * 1.5;
        L.m.position.y = L.y + Math.sin(g.time * 2 + L.x) * 0.1;
        if (Math.abs(L.x - p.x) < 1.6 && Math.abs(L.z - p.z) < 1.6 && Math.abs(L.y - 1 - p.y) < 2.2) {
          this.lanternsFound[L.id] = true;
          L.m.visible = false;
          const n = Object.keys(this.lanternsFound).length;
          g.giveMoney(n === 30 ? 5000 : 100, 'lantern');
          g.hud.notify({ title: 'Lost lantern ' + n + ' / 30', text: n === 30 ? 'Every lantern in Vicehaven is lit again.' : 'Somebody hung this for somebody.', icon: '🏮' });
          if (g.audio.pickup) g.audio.pickup();
        }
      }
    }

    /** The current fare's pickup or drop-off, for the radar and the map. */
    blips(out) {
      const f = this.taxi && this.taxi.fare;
      if (!f) return;
      if (f.stage === 'pickup') out.push({ x: f.from.x, z: f.from.z, type: 'objective', label: 'Taxi fare' });
      else out.push({ x: f.to.x, z: f.to.z, type: 'objective', label: 'Drop-off: ' + f.toName });
    }

    reset() {
      this._endFare(false);
      this.taxi = { on: false, fare: null, done: 0, earned: 0 };
      this.jumpsDone = {};
      this.lanternsFound = {};
      this.heardFares = {};
      for (const L of this.lanterns) L.m.visible = true;
    }

    serialize() {
      return { taxi: { done: this.taxi.done, earned: this.taxi.earned }, jumps: this.jumpsDone, lanterns: this.lanternsFound, heardFares: this.heardFares || {} };
    }

    load(d) {
      this.reset();
      if (!d) return;
      this.taxi.done = (d.taxi && d.taxi.done) || 0;
      this.taxi.earned = (d.taxi && d.taxi.earned) || 0;
      this.jumpsDone = d.jumps || {};
      this.lanternsFound = d.lanterns || {};
      this.heardFares = d.heardFares || {};
      for (const L of this.lanterns) L.m.visible = !this.lanternsFound[L.id];
    }

    get completion() {
      return {
        jumps: Object.keys(this.jumpsDone).length, jumpsTotal: this.ramps.length,
        lanterns: Object.keys(this.lanternsFound).length, lanternsTotal: this.lanterns.length,
        fares: this.taxi.done,
      };
    }
  }

  Activities.COURSES = COURSES;
  Activities.JUMPS = JUMPS;
  VH.Activities = Activities;
  void clamp;
  void smoothstep;
})();
