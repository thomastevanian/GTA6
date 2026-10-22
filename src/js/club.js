/*
 * club.js — The Velvet Tide, the open-air dance club on the boardwalk
 * (landmarks.js builds the walls, the stage, the bar and the balcony).
 *
 * This runs everything that moves, all on one beat clock (124 BPM):
 *   - the light-up dance floor and the sweeping beams over it
 *   - the club's music, full inside the walls and muffled outside
 *   - the people: dancers, the DJ, the bartender, Tuli on the door and a
 *     queue outside; they scatter if a gun goes off nearby
 *   - the juice bar (a Tide Fizz: $5, +40 health)
 *   - Tuli's door rule: nobody gets in with the police after them
 *   - the VIP balcony, roped off until Mars's side story is done
 *   - the dance mini-game: arrows fall on the beat, hit them with the arrow
 *     keys (or WASD) for cash; the best score goes in the stats
 */
(function () {
  'use strict';

  const VH = window.VH;
  const BPM = 124;
  const SPB = 60 / BPM; // seconds per beat
  const VIP_JOB = 'vt3_last_call';

  // A four-bar loop: A minor, F, G, E minor. Roots for the bass, tones for stabs.
  const CHORDS = [
    { root: 55.0, tones: [220.0, 261.63, 329.63] },
    { root: 43.65, tones: [174.61, 220.0, 261.63] },
    { root: 49.0, tones: [196.0, 246.94, 293.66] },
    { root: 41.2, tones: [164.81, 196.0, 246.94] },
  ];
  const FLOOR_COLORS = [[1.5, 0.12, 0.55], [0.1, 1.0, 1.6], [0.9, 0.18, 1.6], [1.6, 0.85, 0.1]];
  const LANES = [
    { label: '←', codes: ['ArrowLeft', 'KeyA'] },
    { label: '↓', codes: ['ArrowDown', 'KeyS'] },
    { label: '↑', codes: ['ArrowUp', 'KeyW'] },
    { label: '→', codes: ['ArrowRight', 'KeyD'] },
  ];
  const DANCE_BEATS = 48; // about 23 seconds

  /** A clubber on the floor: stays put, faces the DJ, dances on the beat. */
  class DanceBrain {
    constructor(club, style, faceX, faceZ) {
      this.club = club;
      this.style = style;
      this.faceX = faceX;
      this.faceZ = faceZ;
    }

    update(a, dt) {
      const c = this.club;
      a.moveSpeed = 0;
      a.heading = VH.math.dampAngle(a.heading, Math.atan2(this.faceX - a.pos.x, this.faceZ - a.pos.z) + this.style * 0.2 - 0.3, 2, dt);
      a.anim.dance = 1;
      a.anim.danceStyle = this.style;
      a.anim.beat = c.beatF;
      a.anim.beatN = c.beatN;
    }
  }

  /** Someone standing about (the bartender, Tuli, the queue): faces one way, chats now and then. */
  class StandBrain {
    constructor(heading, chatty) {
      this.heading = heading;
      this.chatty = chatty;
      this.t = Math.random() * 10;
    }

    update(a, dt) {
      this.t += dt;
      a.moveSpeed = 0;
      a.heading = VH.math.dampAngle(a.heading, this.heading, 3, dt);
      a.anim.talk = this.chatty && Math.sin(this.t * 0.45) > 0.3 ? 1 : 0;
    }
  }

  class Club {
    constructor(game) {
      this.game = game;
      this.c = game.layout && game.layout.waterfront && game.layout.waterfront.club;
      this.beat = 0;
      this.beatN = 0;
      this.beatF = 0;
      this.people = [];
      this.panicT = 0;
      this.dance = null;
      this._music = false;
      this._toastT = 0;
      if (!this.c) return;
      this._buildFloor();
      this._buildBeams();
      this._buildVipRope();
      this._register();
      this._onKey = this._onKey.bind(this);
      VH.events.on('gunshot', (e) => {
        if (this._distOutside(e.x, e.z) < 60) this._panic(e.x, e.z);
      });
    }

    // ------------------------------------------------------------- geometry
    /** How far (x, z) is outside the club's walls (0 inside). */
    _distOutside(x, z) {
      const c = this.c;
      const dx = Math.max(c.x0 - x, 0, x - c.x1);
      const dz = Math.max(c.z0 - z, 0, z - c.z1);
      return Math.hypot(dx, dz);
    }

    _buildFloor() {
      const f = this.c.floor;
      this.nx = Math.round(f.x1 - f.x0);
      this.nz = Math.round(f.z1 - f.z0);
      const geo = new THREE.BoxGeometry(0.94, 0.02, 0.94);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, this.nx * this.nz);
      const m = new THREE.Matrix4();
      const black = new THREE.Color(0, 0, 0);
      let i = 0;
      for (let ix = 0; ix < this.nx; ix++) {
        for (let iz = 0; iz < this.nz; iz++) {
          m.makeTranslation(f.x0 + ix + 0.5, 0.15 + 0.012, f.z0 + iz + 0.5);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, black);
          i++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = 'club dance floor';
      this.game.scene.add(mesh);
      this.floor = mesh;
      this._col = new THREE.Color();
    }

    _buildBeams() {
      const c = this.c;
      const f = c.floor;
      const geo = new THREE.ConeGeometry(0.9, 1, 18, 1, true).translate(0, -0.5, 0);
      this.beams = [];
      const spots = [[f.x0 - 0.5, f.z0 + 1], [f.x1 + 0.5, f.z0 + 1], [f.x0 - 0.5, f.z1 - 1], [f.x1 + 0.5, f.z1 - 1]];
      spots.forEach(([x, z], i) => {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const cone = new THREE.Mesh(geo, mat);
        cone.position.set(x, 5.5, z);
        cone.frustumCulled = false;
        cone.name = 'club beam ' + i;
        this.game.scene.add(cone);
        this.beams.push({ cone, mat, i });
      });
      // A mirror ball over the middle of the floor.
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 1, roughness: 0.12, flatShading: true, emissive: new THREE.Color(0.25, 0.22, 0.35) }));
      ball.position.set((f.x0 + f.x1) / 2, 4.9, (f.z0 + f.z1) / 2);
      ball.name = 'club mirror ball';
      this.game.scene.add(ball);
      this.ball = ball;
      // One coloured light over the floor, pulsing on the beat, so the walls,
      // the dancers and Jay aren't just silhouettes at night.
      this.light = new THREE.PointLight(0xff3d8b, 0, 30, 1.8);
      this.light.position.set((f.x0 + f.x1) / 2, 4.4, (f.z0 + f.z1) / 2);
      this.light.name = 'club light';
      this.game.scene.add(this.light);
      this._up = new THREE.Vector3(0, -1, 0);
      this._dir = new THREE.Vector3();
    }

    _buildVipRope() {
      const c = this.c;
      const v = c.vip;
      const x0 = c.x0 + 0.4;
      const x1 = x0 + v.stairW;
      const z = v.stairZ + 0.3;
      const g = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
      const red = new THREE.MeshStandardMaterial({ color: 0x8b0f2e, roughness: 0.6 });
      for (const x of [x0 + 0.15, x1 - 0.15]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 10), gold);
        post.position.set(x, 0.65, z);
        g.add(post);
      }
      const rope = new THREE.Mesh(new THREE.BoxGeometry(v.stairW - 0.3, 0.06, 0.06), red);
      rope.position.set((x0 + x1) / 2, 0.98, z);
      g.add(rope);
      g.name = 'club VIP rope';
      this.game.scene.add(g);
      this.rope = g;
      this.ropeCol = this.game.physics.addBox(x0, 0, z - 0.2, x1, 2.4, z + 0.2, 'club rope');
      this._ropeFlags = this.ropeCol.flags;
    }

    _register() {
      const g = this.game;
      const c = this.c;
      const it = g.interaction;
      it.register({ id: 'club_bar', kind: 'clubbar', x: (c.bar.x0 + c.bar.x1) / 2, y: 1.15, z: c.bar.z0 - 0.9, radius: 3.2, label: 'Buy a Tide Fizz (juice bar)', price: 5 });
      it.register({ id: 'club_dance', kind: 'clubdance', x: (c.floor.x0 + c.floor.x1) / 2, y: 1.15, z: (c.floor.z0 + c.floor.z1) / 2, radius: 5.5, label: 'Dance' });
      it.register({ id: 'club_vip', kind: 'clubvip', x: c.x0 + 0.4 + c.vip.stairW / 2, y: 1.15, z: c.vip.stairZ + 1.0, radius: 1.8, label: 'VIP balcony' });
      this.vipItem = it.items[it.items.length - 1]; // (register() keeps its own copy)
      it.on('clubbar', (item, player) => {
        if (player.money < item.price) {
          VH.events.emit('notify', { title: 'Not enough cash', text: 'A Tide Fizz is ' + VH.util.formatMoney(item.price) + '.', icon: '✕', tone: 'bad' });
          return 1;
        }
        player.money -= item.price;
        const before = player.health;
        player.heal(40);
        VH.events.emit('money:changed', { delta: -item.price, reason: 'Tide Fizz' });
        if (g.audio.purchase) g.audio.purchase();
        VH.events.emit('notify', { title: 'Tide Fizz', text: player.health > before ? 'Passion fruit and far too much ice. +' + Math.round(player.health - before) + ' health' : 'Passion fruit and far too much ice.', icon: '🍹' });
        return 1.2;
      });
      it.on('clubdance', () => {
        this.startDance();
        return 1;
      });
      it.on('clubvip', () => {
        if (!this.vipOpen) g.hud.showToast('Tuli: The balcony\'s for friends of the club. Mars decides who that is.');
        return 2;
      });
    }

    get vipOpen() {
      return !!(this.game.missions && this.game.missions.completed[VIP_JOB]);
    }

    // ---------------------------------------------------------------- people
    _spawnPeople() {
      const g = this.game;
      const c = this.c;
      const f = c.floor;
      const st = c.stage;
      const lookFor = (id) => (g.missions.lookFor ? g.missions.lookFor(id) : null) || VH.Crowd.randomLook();
      const add = (x, z, brain, look, name) => {
        const a = g.crowd.spawn(x, z, { look: look || VH.Crowd.randomLook(), faction: 'civilian', role: 'club', persistent: true, name });
        if (!a) return null;
        a.brain = brain;
        a.clubber = true;
        this.people.push(a);
        return a;
      };
      // Dancers, spread over the floor (the middle is left for Jay).
      const djX = st.x0 + 1.9;
      const djZ = (st.z0 + st.z1) / 2;
      const placed = [];
      let guard = 0;
      while (placed.length < 12 && guard++ < 200) {
        const x = f.x0 + 0.6 + Math.random() * (f.x1 - f.x0 - 1.2);
        const z = f.z0 + 0.6 + Math.random() * (f.z1 - f.z0 - 1.2);
        if (Math.hypot(x - (f.x0 + f.x1) / 2, z - (f.z0 + f.z1) / 2) < 1.6) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.3)) continue;
        placed.push({ x, z });
        add(x, z, new DanceBrain(this, placed.length % 4, djX, djZ));
      }
      // Lowtide on the decks, the bartender, Tuli on the door, and the queue.
      add(djX, djZ, new DanceBrain(this, 3, f.x0, djZ), lookFor('lowtide'), 'DJ Lowtide');
      add((c.bar.x0 + c.bar.x1) / 2, c.bar.z1 + 1.0, new StandBrain(Math.PI, true), null, 'Bartender');
      add(c.x0 - 0.9, c.doorZ0 - 0.7, new StandBrain(-Math.PI / 2, false), lookFor('tuli'), 'Tuli');
      for (let i = 0; i < 3; i++) add(c.x0 - 2.2, c.doorZ1 + 1.4 + i * 0.9, new StandBrain(Math.PI, true));
    }

    _clearPeople(scatter, fx, fz) {
      const g = this.game;
      for (const a of this.people) {
        if (a.removed) continue;
        if (scatter && !a.dead) {
          // Run for it, then they're just people in the street.
          a.brain = null;
          a.persistent = false;
          a.walk = null;
          a.anim.dance = 0;
          a.anim.talk = 0;
          if (g.crowd._flee) g.crowd._flee(a, fx, fz, 6 + Math.random() * 4);
        } else if (!a.dead) g.crowd.remove(a);
        else {
          a.persistent = false;
          a.brain = null; // a plain body: the crowd clears it away later
        }
      }
      this.people = [];
    }

    _panic(x, z) {
      this.panicT = 25;
      if (!this.people.length) return;
      this._clearPeople(true, x, z);
      if (this.dance) this.endDance(false, 'Somebody started shooting. The floor cleared in about a second.');
    }

    // ------------------------------------------------------------------ music
    _startMusic() {
      const a = this.game.audio;
      const ctx = a.ctx;
      this._lp = ctx.createBiquadFilter();
      this._lp.type = 'lowpass';
      this._lp.frequency.value = 900;
      this._gain = ctx.createGain();
      this._gain.gain.value = 0;
      this._gain.connect(this._lp);
      this._lp.connect(a.musicBus);
      // Carry on from the beat the floor is already on (the beat clock has
      // been running on game time): the next whole beat is the music's
      // first, so nothing freezes or jumps back when the music comes in.
      const first = Math.ceil(this.beat) + 1;
      this._next = ctx.currentTime + 0.1;
      this._musicT0 = this._next - first * SPB;
      this._step = first * 4;
      this._music = true;
      this._timer = setInterval(() => this._schedule(), 25);
    }

    _stopMusic() {
      if (!this._music) return;
      this._music = false;
      clearInterval(this._timer);
      const ctx = this.game.audio.ctx;
      const gn = this._gain;
      const lp = this._lp;
      if (ctx && gn) {
        gn.gain.cancelScheduledValues(ctx.currentTime);
        gn.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => {
          gn.disconnect();
          lp.disconnect();
        }, 1500);
      }
    }

    _schedule() {
      const a = this.game.audio;
      if (!a.ctx || a.ctx.state !== 'running') return;
      const six = SPB / 4;
      while (this._next < a.ctx.currentTime + 0.15) {
        this._play(this._step, this._next, six);
        this._next += six;
        this._step++;
      }
    }

    /** One sixteenth of the club track: four-on-the-floor house. */
    _play(step, t, six) {
      const a = this.game.audio;
      const bus = this._gain;
      const s = step % 16;
      const bar = Math.floor(step / 16);
      const ch = CHORDS[bar % 4];
      if (s % 4 === 0) a._tone({ t, freq: 140, freqEnd: 42, peak: 0.6, decay: 0.26, bus });
      if (s === 4 || s === 12) a._hit({ t, freq: 1500, q: 0.8, peak: 0.2, decay: 0.14, bus });
      if (s % 4 === 2) a._hit({ t, type: 'highpass', freq: 7600, q: 0.6, peak: 0.09, decay: 0.06, bus });
      else if (s % 2 === 1) a._hit({ t, type: 'highpass', freq: 9200, q: 0.5, peak: 0.035, decay: 0.025, bus });
      // Off-beat bass, with a pickup at the end of every other bar.
      if (s % 4 === 2) a._tone({ t, freq: ch.root * 2, wave: 'sawtooth', peak: 0.17, decay: six * 1.7, lowpass: 620, lpq: 6, bus });
      if (s === 15 && bar % 2 === 1) a._tone({ t, freq: ch.root * 3, wave: 'sawtooth', peak: 0.11, decay: six * 1.1, lowpass: 700, lpq: 5, bus });
      // Chord stabs on the and-of-two and the and-of-four.
      if (s === 6 || s === 14) for (const f of ch.tones) a._tone({ t, freq: f, wave: 'square', peak: 0.026, decay: 0.17, lowpass: 2400, bus });
      // A warm pad under each bar.
      if (s === 0) for (const f of ch.tones) a._tone({ t, freq: f / 2, wave: 'sawtooth', peak: 0.018, attack: 0.3, decay: SPB * 3.6, lowpass: 1100, bus });
      // A little hook on the second half of every eight bars.
      if (bar % 8 >= 4 && s % 2 === 0) a._tone({ t, freq: ch.tones[(s / 2) % 3] * 2, wave: 'triangle', peak: 0.04, decay: 0.12, bus });
    }

    _updateMusic(near, inside) {
      const g = this.game;
      const a = g.audio;
      if (!a.ready || !a.ctx) return;
      const want = near < 95 && (g.state === 'playing' || g.state === 'dialog');
      if (want && !this._music) this._startMusic();
      else if (!want && this._music) this._stopMusic();
      if (!this._music) return;
      let gain = inside ? 1 : Math.max(0, 1 - near / 95) * 0.5;
      if (g.player.inVehicle) gain *= 0.45;
      if (a._musicOn) gain *= 0.35; // a job's own score is playing
      if (this.panicT > 0) gain *= 0.25; // the DJ ducked behind the decks
      const t = a.ctx.currentTime;
      this._gain.gain.setTargetAtTime(gain * 0.85, t, 0.25);
      this._lp.frequency.setTargetAtTime(inside ? 16000 : 850, t, 0.3);
    }

    // -------------------------------------------------------------- the beat
    _clock(dt) {
      const a = this.game.audio;
      // On the music's own clock when it's playing (so the lights and the
      // arrows sit on the kick drum), otherwise on game time. (Tests drive
      // time by hand with the game frozen, so they always use game time.)
      if (this._music && a.ctx && !this.game.frozen) this.beat = Math.max(this.beat, (a.ctx.currentTime - this._musicT0) / SPB);
      else this.beat += dt / SPB;
      this.beatN = Math.floor(this.beat);
      this.beatF = this.beat - this.beatN;
    }

    _updateLights() {
      const f = this.c.floor;
      const n = this.beatN;
      const pulse = 0.3 + 0.9 * Math.pow(1 - this.beatF, 2);
      const pattern = Math.floor(n / 8) % 4;
      const base = FLOOR_COLORS[Math.floor(n / 4) % 4];
      const alt = FLOOR_COLORS[(Math.floor(n / 4) + 2) % 4];
      const cx = (this.nx - 1) / 2;
      const cz = (this.nz - 1) / 2;
      let i = 0;
      for (let ix = 0; ix < this.nx; ix++) {
        for (let iz = 0; iz < this.nz; iz++) {
          let on;
          let col = base;
          if (pattern === 0) on = (ix + iz + n) % 2 === 0;
          else if (pattern === 1) on = Math.floor(Math.hypot(ix - cx, iz - cz)) % 4 === n % 4;
          else if (pattern === 2) on = (ix + iz) % 6 === n % 6 || (ix - iz + 60) % 6 === n % 6;
          else on = ((ix * 7 + iz * 13 + n * 5) % 5) === 0;
          if (!on) col = alt;
          const k = on ? pulse : 0;
          this._col.setRGB(col[0] * k, col[1] * k, col[2] * k);
          this.floor.setColorAt(i, this._col);
          i++;
        }
      }
      this.floor.instanceColor.needsUpdate = true;
      // Beams sweep, change colour every four beats, flash on the beat.
      const night = this.game.fx ? this.game.fx.night || 0 : 0;
      const t = this.beat * SPB;
      for (const b of this.beams) {
        const col = FLOOR_COLORS[(Math.floor(n / 4) + b.i) % 4];
        b.mat.color.setRGB(col[0] * 0.35, col[1] * 0.35, col[2] * 0.35);
        b.mat.opacity = (0.05 + 0.1 * night) * (0.6 + 0.4 * pulse);
        const a = t * (0.7 + b.i * 0.13) + b.i * 1.7;
        this._dir.set(Math.sin(a) * 0.55 + ((f.x0 + f.x1) / 2 - b.cone.position.x) * 0.08, -1, Math.cos(a * 0.8) * 0.55 + ((f.z0 + f.z1) / 2 - b.cone.position.z) * 0.08).normalize();
        b.cone.quaternion.setFromUnitVectors(this._up, this._dir);
        b.cone.scale.set(1, 5.6 / Math.max(0.3, -this._dir.y), 1);
      }
      this.ball.rotation.y += 0.01;
      const lc = FLOOR_COLORS[Math.floor(n / 4) % 4];
      this.light.color.setRGB(lc[0], lc[1], lc[2]).multiplyScalar(0.6);
      this.light.intensity = (8 + 34 * night) * (0.65 + 0.35 * pulse);
    }

    _setVisible(on) {
      if (this._shown === on) return;
      this._shown = on;
      this.floor.visible = on;
      this.ball.visible = on;
      if (!on) this.light.intensity = 0;
      for (const b of this.beams) b.cone.visible = on;
    }

    // ------------------------------------------------------------------ frame
    update(dt) {
      if (!this.c) return;
      const g = this.game;
      const p = g.player.inVehicle ? g.player.vehicle.pos : g.player.pos;
      const near = this._distOutside(p.x, p.z);
      const inside = near === 0;
      this._clock(dt);
      this.panicT = Math.max(0, this.panicT - dt);
      this._toastT = Math.max(0, this._toastT - dt);
      this._setVisible(near < 160);
      if (near < 160) this._updateLights();
      this._updateMusic(near, inside);

      // The club fills up when Jay's around, and empties for its own story
      // jobs (they bring their own cast) or after trouble.
      const run = g.missions && g.missions.run;
      const busy = run && /^vt\d/.test(run.m.id);
      this.people = this.people.filter((a) => !a.removed);
      const want = near < 120 && this.panicT <= 0 && !busy;
      if (want && !this.people.length) {
        // Last time's scattered clubbers (or a finished job's cast) can get
        // stuck against the walls inside; and a job's Tuli or Lowtide left
        // standing about would be doubled by the club's own.
        for (const a of g.crowd.agents.slice()) {
          if (!a.persistent && !a.brain && !a.dead && this._distOutside(a.pos.x, a.pos.z) === 0) g.crowd.remove(a);
        }
        if (g.missions && g.missions._retireStrays) for (const id of ['tuli', 'lowtide']) g.missions._retireStrays(id);
        this._spawnPeople();
      }
      else if (!want && this.people.length && (near > 140 || busy)) this._clearPeople(false);

      // The VIP rope.
      const open = this.vipOpen;
      if (this._ropeOpen !== open) {
        this._ropeOpen = open;
        this.rope.visible = !open;
        this.ropeCol.flags = open ? 0 : this._ropeFlags;
        this.vipItem.enabled = !open; // once you're on the list there's nothing to ask
      }

      // Tuli doesn't let anybody in with the police after them.
      const pl = g.player;
      const c = this.c;
      if (!pl.inVehicle && !busy && g.police.level > 0 && pl.pos.x > c.x0 - 0.9 && pl.pos.x < c.x0 + 1.4 && pl.pos.z > c.doorZ0 - 0.2 && pl.pos.z < c.doorZ1 + 0.2) {
        pl.pos.x = c.x0 - 1.0;
        pl.vel.x = Math.min(0, pl.vel.x);
        if (this._toastT <= 0) {
          this._toastT = 4;
          g.hud.showToast('Tuli: Not with the cops on you, Jay. Lose them and come back.');
        }
      }

      if (this.dance) this._updateDance(dt);
    }

    // ------------------------------------------------------------- the dance
    startDance() {
      const g = this.game;
      const p = g.player;
      if (this.dance) return;
      if (p.inVehicle || p.isDead) return;
      if (g.missions.run) return g.hud.showToast('Not now: you\'re on a job.');
      if (g.police.level > 0) return g.hud.showToast('Not with the police after you.');
      if (this.panicT > 0) return g.hud.showToast('The music\'s stopped. Give it a minute.');
      const f = this.c.floor;
      p.teleport((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, Math.PI / 2);
      p.frozen = true;
      const start = Math.ceil(this.beat) + 4; // four beats to count in
      const notes = [];
      let last = -1;
      let same = 0;
      for (let k = 0; k < DANCE_BEATS; k++) {
        const lanes = [0, 1, 2, 3].filter((l) => !(l === last && same >= 1));
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        same = lane === last ? same + 1 : 0;
        last = lane;
        notes.push({ b: start + k, lane });
        // Off-beats join in as it goes on.
        if ((k > 15 && k % 4 === 1 && Math.random() < 0.7) || (k > 31 && k % 2 === 1 && Math.random() < 0.6)) notes.push({ b: start + k + 0.5, lane: (lane + 1 + Math.floor(Math.random() * 3)) % 4 });
      }
      const el = document.createElement('div');
      el.className = 'vh-dance';
      el.innerHTML = '<div class="vd-head"><span class="vd-title">VELVET TIDE · DANCE</span><span class="vd-score">0</span></div>' +
        '<div class="vd-lanes">' + LANES.map((l, i) => '<div class="vd-lane" data-lane="' + i + '"><div class="vd-target">' + l.label + '</div></div>').join('') + '</div>' +
        '<div class="vd-judge"></div><div class="vd-combo"></div><div class="vd-help">Arrow keys or W A S D, on the beat</div>';
      document.body.appendChild(el);
      const lanesEl = el.querySelectorAll('.vd-lane');
      for (const n of notes) {
        n.el = document.createElement('div');
        n.el.className = 'vd-note vd-l' + n.lane;
        n.el.textContent = LANES[n.lane].label;
        lanesEl[n.lane].appendChild(n.el);
      }
      this.dance = { start, end: start + DANCE_BEATS + 1, notes, score: 0, combo: 0, bestCombo: 0, hits: 0, el, lanesEl, scoreEl: el.querySelector('.vd-score'), judgeEl: el.querySelector('.vd-judge'), comboEl: el.querySelector('.vd-combo'), health: p.health };
      p.dancing = { style: 0, beat: 0, beatN: 0 };
      window.addEventListener('keydown', this._onKey, true);
      g.hud.showToast('Get ready…');
    }

    _onKey(e) {
      const d = this.dance;
      if (!d) return;
      const lane = LANES.findIndex((l) => l.codes.includes(e.code));
      if (lane < 0) return;
      // Paused (rebinding keys in the menu) or typing in the console: leave the key alone.
      const t = e.target;
      if (this.game.state !== 'playing' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      let best = null;
      let bestDt = Infinity;
      for (const n of d.notes) {
        if (n.done || n.lane !== lane) continue;
        const dt = Math.abs(n.b - this.beat) * SPB;
        if (dt < bestDt) {
          bestDt = dt;
          best = n;
        }
      }
      d.lanesEl[lane].classList.remove('hit');
      void d.lanesEl[lane].offsetWidth;
      d.lanesEl[lane].classList.add('hit');
      if (!best || bestDt > 0.19) {
        this._judge('MISS', 'miss');
        d.combo = 0;
        return;
      }
      best.done = true;
      best.el.classList.add('gone');
      const [word, pts, cls] = bestDt < 0.06 ? ['PERFECT', 100, 'perfect'] : bestDt < 0.12 ? ['GOOD', 60, 'good'] : ['OK', 25, 'ok'];
      d.combo++;
      d.hits++;
      d.bestCombo = Math.max(d.bestCombo, d.combo);
      d.score += Math.round(pts * (1 + Math.min(d.combo, 20) * 0.05));
      this._judge(word, cls);
    }

    _judge(word, cls) {
      const d = this.dance;
      d.judgeEl.textContent = word;
      d.judgeEl.className = 'vd-judge show ' + cls;
      void d.judgeEl.offsetWidth;
      d.scoreEl.textContent = String(d.score);
      d.comboEl.textContent = d.combo >= 4 ? d.combo + '× COMBO' : '';
    }

    _updateDance() {
      const d = this.dance;
      const g = this.game;
      const p = g.player;
      // Anything happening to Jay ends it.
      if (p.health < d.health - 0.5 || p.isDead || g.police.level > 0 || g.missions.run || p.inVehicle) return this.endDance(false, null);
      d.health = p.health;
      // Notes: 4 beats of lead-in visible above the targets, 72 px a beat.
      const PX = 72;
      for (const n of d.notes) {
        if (n.done) continue;
        const ahead = n.b - this.beat;
        if (ahead * SPB < -0.19) {
          n.done = true;
          n.el.classList.add('missed');
          d.combo = 0;
          this._judge('MISS', 'miss');
          continue;
        }
        n.el.style.transform = 'translateY(' + (-ahead * PX).toFixed(1) + 'px)';
        n.el.style.opacity = ahead > 4 ? '0' : '1';
      }
      // Jay's moves change as the combo builds.
      p.dancing.style = Math.floor(d.combo / 6) % 4;
      p.dancing.beat = this.beatF;
      p.dancing.beatN = this.beatN;
      if (this.beat >= d.end) this.endDance(true);
    }

    endDance(finished, reason) {
      const d = this.dance;
      if (!d) return;
      const g = this.game;
      const p = g.player;
      this.dance = null;
      window.removeEventListener('keydown', this._onKey, true);
      d.el.remove();
      p.frozen = false;
      p.dancing = null;
      if (!finished) {
        if (reason) g.hud.showToast(reason);
        return;
      }
      const total = d.notes.length;
      const pay = Math.round(d.score / 20);
      const stats = p.stats;
      stats.dances = (stats.dances || 0) + 1;
      const record = d.score > (stats.bestDance || 0);
      stats.bestDance = Math.max(stats.bestDance || 0, d.score);
      if (pay > 0) g.giveMoney(pay, 'dance');
      const great = d.hits >= total * 0.85;
      g.hud.centerBanner(great ? 'DANCE FLOOR LEGEND' : d.hits >= total * 0.5 ? 'NICE MOVES' : 'YOU TRIED', 'Score ' + d.score + ' · ' + d.hits + '/' + total + ' hits · best combo ' + d.bestCombo + (pay ? ' · +' + VH.util.formatMoney(pay) : '') + (record ? ' · new best' : ''));
    }

    // ------------------------------------------------------------ the rest
    /** The club on the radar and the map. */
    blips(out) {
      if (!this.c) return;
      out.push({ x: this.c.x0 - 2, z: (this.c.doorZ0 + this.c.doorZ1) / 2, type: 'shop', label: 'The Velvet Tide (club)' });
    }

    /** Quit to title: the music, and a dance in progress, end now (update() isn't running). */
    stop() {
      if (!this.c) return;
      if (this.dance) this.endDance(false, null);
      this._stopMusic();
    }

    reset() {
      if (!this.c) return;
      this.stop();
      for (const a of this.people) if (!a.removed) this.game.crowd.remove(a);
      this.people = [];
      this.panicT = 0;
      this._ropeOpen = undefined;
    }
  }

  Club.BPM = BPM;
  VH.Club = Club;
})();
