/*
 * challenges.js — timed challenges: start markers, the run itself,
 * checkpoints, splits, medals, rewards, records and the ghost.
 *
 * A run goes: fade → placed at the start → 3-2-1-GO (Jay is held still)
 * → checkpoints in order → finish → results card (E to retry).
 *
 *  - freerun (Yard Run): the clock counts up; falling below a section's
 *    floor sends you back to the last checkpoint with a time penalty.
 *  - countdown (Courier Rush): the clock counts down, every checkpoint
 *    adds seconds, and the tension music and ticking build as it runs out.
 *
 * Your best run is recorded ten times a second and replayed as a
 * translucent ghost next time, so every attempt is a race.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, smoothstep, lerp, lerpAngle } = VH.math;
  const RECORDS_KEY = 'vicehaven.records.v1';
  const MEDALS = ['gold', 'silver', 'bronze'];

  function formatTime(t) {
    const neg = t < 0;
    t = Math.abs(t);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return (neg ? '-' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  // ---------------------------------------------------------------- visuals
  const BEAM_VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const BEAM_FRAGMENT = /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      float fade = pow(1.0 - vUv.y, 1.7);
      float stripes = 0.7 + 0.3 * sin(vUv.y * 90.0 - uTime * 5.0);
      gl_FragColor = vec4(uColor * fade * stripes * uOpacity, 1.0);
    }
  `;

  function beamMaterial(color, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color[0], color[1], color[2]) }, uTime: { value: 0 }, uOpacity: { value: opacity } },
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }

  function glowMaterial(color, k) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color[0] * k, color[1] * k, color[2] * k) });
  }

  function labelTexture(title, sub, color) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 160);
    g.fillStyle = 'rgba(8, 11, 24, 0.72)';
    const r = 24;
    g.beginPath();
    g.moveTo(r, 10);
    g.arcTo(502, 10, 502, 150, r);
    g.arcTo(502, 150, 10, 150, r);
    g.arcTo(10, 150, 10, 10, r);
    g.arcTo(10, 10, 502, 10, r);
    g.fill();
    const css = 'rgb(' + color.map((v) => Math.round(Math.min(1, v / 2.6) * 255)).join(',') + ')';
    g.fillStyle = css;
    g.fillRect(34, 32, 8, 96);
    g.fillStyle = '#ffffff';
    g.font = "800 58px 'Bahnschrift', 'Segoe UI', Arial, sans-serif";
    g.textBaseline = 'middle';
    g.fillText(title.toUpperCase(), 62, 62);
    g.fillStyle = 'rgba(230, 236, 255, 0.85)';
    g.font = "500 30px 'Segoe UI', Arial, sans-serif";
    g.fillText(sub, 64, 118);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  class ChallengeSystem {
    constructor(game) {
      this.game = game;
      this.run = null;
      this.results = null;
      this.records = this._loadRecords();
      this.time = 0;
      this._v = new THREE.Vector3();
    }

    get active() {
      return !!this.run;
    }

    init() {
      const g = this.game;
      this.defs = VH.Data.challenges.map((meta) => Object.assign({}, meta, this._course(meta.id)));
      this.defs = this.defs.filter((d) => d.checkpoints && d.checkpoints.length);
      this.root = new THREE.Group();
      this.root.name = 'challenges';
      g.scene.add(this.root);

      // Start markers and their interactables.
      this.markers = [];
      for (const def of this.defs) {
        const m = this._startMarker(def);
        this.markers.push(m);
        g.interaction.register({
          id: 'challenge_' + def.id, kind: 'challenge', challengeId: def.id,
          x: def.marker.x, y: def.marker.y + 1, z: def.marker.z, radius: 2.6,
          label: 'Start ' + def.name,
        });
      }
      g.interaction.on('challenge', (item) => {
        this.start(item.challengeId);
        return 1;
      });

      // Checkpoint visuals, reused for every run: the active ring and beam, and a dim preview of the next.
      const ringGeo = new THREE.TorusGeometry(1, 0.075, 10, 64);
      this.cpRing = new THREE.Mesh(ringGeo, glowMaterial([0.3, 2.2, 2.6], 1));
      this.cpRingNext = new THREE.Mesh(ringGeo, glowMaterial([0.3, 2.2, 2.6], 0.25));
      this.cpBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 70, 20, 1, true), beamMaterial([0.3, 2.0, 2.6], 0.55));
      this.cpBeam.geometry.translate(0, 35, 0);
      for (const m of [this.cpRing, this.cpRingNext, this.cpBeam]) {
        m.visible = false;
        m.frustumCulled = false;
        this.root.add(m);
      }

      // The ghost: a translucent Jay replaying your best run.
      this.ghost = new VH.Humanoid({ ghost: true });
      this.ghost.root.visible = false;
      this.root.add(this.ghost.root);

      VH.events.on('player:died', () => {
        if (this.run && this.run.phase === 'running') this.run.dieTimer = 0.9;
      });
    }

    // ------------------------------------------------------------- courses
    _course(id) {
      const world = this.game.world;
      if (id === 'yard_run') return world.courses && world.courses.yard_run ? world.courses.yard_run : {};
      if (id === 'courier_rush') return this._courierCourse();
      return {};
    }

    /** Civic Plaza → terrace → climbing wall → Grand Avenue → the Tower → Meridian → the pier. */
    _courierCourse() {
      const L = this.game.layout;
      const plaza = L.plazaBlock;
      const tower = L.blocks.find((b) => b.kind === 'tower');
      const pier = L.waterfront.pier;
      if (!plaza || !tower) return {};
      const K = 0.15;
      const ix0 = plaza.minX + 4, ix1 = plaza.maxX - 4, iz0 = plaza.minZ + 4, iz1 = plaza.maxZ - 4;
      const cx = (ix0 + ix1) / 2;
      const px0 = cx + 8;
      const wallX = px0 + 4 * 1.9 + 1.1;
      const wallZ = iz0 + 3 + 0.9;
      const pts = [
        { x: ix0 + 9, s: K + 2.4, z: iz0 + 8, r: 2.6, bonus: 11 }, //      the terrace
        { x: wallX, s: K + 3.4, z: wallZ, r: 2.4, bonus: 10 }, //          the big plaza wall
        { x: 0, s: K, z: -36.4, r: 3.2, bonus: 17 }, //                    Grand Avenue median, between the palms
        { x: tower.cx + 8, s: K, z: tower.maxZ - 7.5, r: 3.2, bonus: 8 }, // Vicehaven Tower forecourt
        { x: 96, s: 0, z: -96, r: 3.4, bonus: 14 }, //                     Lantern St × Bayshore Ave
        { x: 96, s: 0, z: 0, r: 3.4, bonus: 27 }, //                       Meridian Blvd × Bayshore Ave
        { x: 288, s: 0, z: 0, r: 3.4, bonus: 20 }, //                      Meridian Blvd × Pelican Ave
        { x: pier.x0 + 4, s: K, z: 0, r: 3.2, bonus: 19 }, //              the pier arch
        { x: pier.x1 - 28, s: K, z: 0, r: 3.2, finish: true }, //          the end of the pier
      ];
      return {
        start: { x: cx + 18, y: K, z: iz1 - 5, yaw: Math.PI },
        marker: { x: cx + 18, y: K, z: iz1 - 5 },
        checkpoints: pts.map((p) => ({ x: p.x, y: p.s + 1.2, z: p.z, surfaceY: p.s, r: p.r, floor: null, bonus: p.bonus || 0, finish: !!p.finish })),
      };
    }

    _startMarker(def) {
      const group = new THREE.Group();
      group.position.set(def.marker.x, def.marker.y + 0.03, def.marker.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 8, 48), glowMaterial(def.color, 1));
      ring.rotation.x = -Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshBasicMaterial({
        color: new THREE.Color(def.color[0] * 0.12, def.color[1] * 0.12, def.color[2] * 0.12),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.01;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 36, 12, 1, true), beamMaterial(def.color, 0.45));
      beam.geometry.translate(0, 18, 0);
      const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 4), glowMaterial(def.color, 1.2));
      chevron.rotation.x = Math.PI;
      chevron.position.y = 2.4;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(def.name, this._bestLine(def), def.color), depthWrite: false, transparent: true }));
      label.scale.set(4.8, 1.5, 1);
      label.position.y = 3.9;
      group.add(ring, disc, beam, chevron, label);
      this.root.add(group);
      return { def, group, ring, beam, chevron, label };
    }

    _bestLine(def) {
      const rec = this.records[def.id];
      if (!rec || rec.best === undefined) return def.place;
      const best = def.kind === 'countdown' ? rec.best.toFixed(1) + ' s to spare' : formatTime(rec.best);
      return 'Best ' + best + (rec.medal ? '  ·  ' + rec.medal.toUpperCase() : '');
    }

    _refreshLabel(def) {
      const m = this.markers.find((mk) => mk.def === def);
      if (!m) return;
      m.label.material.map.dispose();
      m.label.material.map = labelTexture(def.name, this._bestLine(def), def.color);
      m.label.material.needsUpdate = true;
    }

    // ------------------------------------------------------------- records
    _loadRecords() {
      try {
        return JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}') || {};
      } catch (err) {
        return {};
      }
    }

    _saveRecords() {
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records));
      } catch (err) {
        // Storage full or blocked: records last for this session only.
      }
    }

    // ------------------------------------------------------------ the run
    start(id) {
      const def = this.defs.find((d) => d.id === id);
      if (!def || this.run) return;
      const g = this.game;
      this._closeResults();
      const rec = this.records[def.id] || null;
      this.run = {
        def,
        phase: 'intro',
        phaseTime: 0,
        index: 0,
        time: 0,
        remaining: def.startTime || 0,
        falls: 0,
        penalty: 0,
        splits: [],
        bestSplits: rec && rec.splits ? rec.splits : null,
        ghost: rec && rec.ghost ? rec.ghost : null,
        ghostCursor: 0,
        rec: [],
        recTimer: 0,
        lastTick: 99,
        dieTimer: 0,
      };
      g.interaction.enabled = false;
      g.hud.setFade(1, 250);
      g.hud.showChallenge(true, def);
      for (const m of this.markers) m.group.visible = false;
      VH.events.emit('challenge:start', { id: def.id });
    }

    _place(pos, yaw) {
      const g = this.game;
      const p = g.player;
      p.teleport(pos.x, pos.z, yaw, (pos.surfaceY !== undefined ? pos.surfaceY : pos.y) + 0.05);
      p.health = p.maxHealth;
      p.wantCrouch = false;
      p.crouched = false;
      g.cameraRig.snapBehind(p);
      g.cameraRig.pitch = -0.08;
    }

    _yawTo(from, to) {
      return Math.atan2(to.x - from.x, to.z - from.z);
    }

    abandon(silent) {
      if (!this.run) {
        this._closeResults();
        return;
      }
      const g = this.game;
      g.player.frozen = false;
      g.audio.stopMusic(0.4);
      this._endRunVisuals();
      this.run = null;
      if (!silent) g.hud.notify({ title: 'Challenge abandoned', text: 'The start markers are where you left them.', icon: '↩' });
    }

    _endRunVisuals() {
      const g = this.game;
      this.cpRing.visible = this.cpRingNext.visible = this.cpBeam.visible = false;
      this.ghost.root.visible = false;
      g.hud.showChallenge(false);
      g.hud.setObjective(null);
      g.interaction.enabled = true;
      for (const m of this.markers) m.group.visible = true;
    }

    /** Called every frame while playing. */
    update(dt) {
      this.time += dt;
      const g = this.game;
      // Idle marker animation.
      for (const m of this.markers) {
        if (!m.group.visible) continue;
        m.chevron.position.y = 2.4 + Math.sin(this.time * 2.4) * 0.18;
        m.chevron.rotation.y += dt * 1.5;
        m.beam.material.uniforms.uTime.value = this.time;
        const s = 1 + Math.sin(this.time * 3) * 0.04;
        m.ring.scale.set(s, s, s);
      }
      this.cpBeam.material.uniforms.uTime.value = this.time;

      if (this.results) this._updateResults(dt);
      const run = this.run;
      if (!run) return;
      run.phaseTime += dt;

      if (run.phase === 'intro') {
        if (run.phaseTime > 0.3) {
          const def = run.def;
          const first = def.checkpoints[0];
          this._place(def.start, def.start.yaw !== undefined ? def.start.yaw : this._yawTo(def.start, first));
          g.player.frozen = true;
          g.hud.setFade(0, 350);
          this._showCheckpoint();
          run.phase = 'countdown';
          run.phaseTime = 0;
          run.lastCount = 4;
        }
        return;
      }

      if (run.phase === 'countdown') {
        const n = 3 - Math.floor(run.phaseTime);
        if (n !== run.lastCount && n >= 1) {
          run.lastCount = n;
          g.hud.bigText(String(n));
          g.audio.countdown(n);
        }
        if (run.phaseTime >= 3) {
          run.phase = 'running';
          run.phaseTime = 0;
          g.player.frozen = false;
          g.hud.bigText('GO!', true);
          g.audio.countdown(0);
          g.audio.startMusic();
          if (g.renderer.post) g.renderer.post.pulse(0.18);
        }
        this._updateHud();
        return;
      }

      if (run.phase !== 'running') return;
      const def = run.def;
      run.time += dt;
      if (def.kind === 'countdown') {
        run.remaining -= dt;
        const whole = Math.ceil(run.remaining);
        if (run.remaining < 10 && whole !== run.lastTick && run.remaining > 0) {
          run.lastTick = whole;
          g.audio.tick(run.remaining < 5);
        }
        if (run.remaining <= 0) {
          run.remaining = 0;
          this._fail('Out of time');
          return;
        }
      }

      this._recordGhost(dt);
      this._playGhost();

      const p = g.player;
      const cp = def.checkpoints[run.index];

      // Knocked out, or fell below this section's floor: back to the last checkpoint.
      if (run.dieTimer > 0) {
        run.dieTimer -= dt;
        if (run.dieTimer <= 0) this._slip('Knocked out');
        this._updateHud();
        return;
      }
      if (cp.floor !== null && ((p.grounded && p.pos.y < cp.floor) || p.pos.y < cp.floor - 3.2)) {
        this._slip('You slipped');
        this._updateHud();
        return;
      }

      // Reached the checkpoint?
      const d = Math.hypot(p.pos.x - cp.x, p.pos.y + 1.0 - cp.y, p.pos.z - cp.z);
      if (d < cp.r) this._reach(cp);
      if (!this.run) return; // that was the finish

      // Music builds with progress (freerun) or with the clock running down (countdown).
      const progress = run.index / def.checkpoints.length;
      const pressure = def.kind === 'countdown' ? 1 - smoothstep(4, 22, run.remaining) : 0.25 + progress * 0.6;
      g.audio.setIntensity(pressure);
      this._updateHud();
    }

    _reach(cp) {
      const g = this.game;
      const run = this.run;
      const def = run.def;
      run.splits.push(run.time);
      g.audio.checkpoint();
      if (g.renderer.post) g.renderer.post.pulse(0.1, new THREE.Color(0.6, 1, 1));
      if (def.kind === 'countdown' && cp.bonus) {
        run.remaining += cp.bonus;
        g.hud.popText('+' + cp.bonus + 's', 'good');
      } else if (run.bestSplits && run.bestSplits[run.index] !== undefined) {
        const delta = run.time - run.bestSplits[run.index];
        g.hud.popText((delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(2), delta <= 0 ? 'good' : 'bad');
      }
      run.index++;
      if (cp.finish || run.index >= def.checkpoints.length) {
        this._finish();
        return;
      }
      this._showCheckpoint();
    }

    _showCheckpoint() {
      const run = this.run;
      const cps = run.def.checkpoints;
      const cp = cps[run.index];
      const prev = run.index > 0 ? cps[run.index - 1] : run.def.start;
      const next = cps[run.index + 1];
      const place = (mesh, c, from) => {
        mesh.position.set(c.x, c.y, c.z);
        mesh.rotation.set(0, this._yawTo(from, c), 0);
        mesh.scale.setScalar(c.r * 0.85);
        mesh.visible = true;
      };
      place(this.cpRing, cp, prev);
      const finishColor = cp.finish ? [2.6, 2.0, 0.4] : run.def.color;
      this.cpRing.material.color.setRGB(finishColor[0], finishColor[1], finishColor[2]);
      this.cpBeam.material.uniforms.uColor.value.setRGB(finishColor[0], finishColor[1], finishColor[2]);
      this.cpBeam.position.set(cp.x, cp.surfaceY, cp.z);
      this.cpBeam.visible = true;
      if (next) {
        place(this.cpRingNext, next, cp);
        this.cpRingNext.material.color.setRGB(run.def.color[0] * 0.25, run.def.color[1] * 0.25, run.def.color[2] * 0.25);
      } else this.cpRingNext.visible = false;
    }

    _slip(reason) {
      const g = this.game;
      const run = this.run;
      const def = run.def;
      run.falls++;
      run.dieTimer = 0;
      if (def.fallPenalty) {
        run.time += def.fallPenalty;
        g.hud.popText('+' + def.fallPenalty + 's', 'bad');
      }
      g.hud.centerBanner(reason, 'Back to the last checkpoint');
      g.audio.whoosh();
      g.hud.setFade(1, 120);
      const back = run.index > 0 ? def.checkpoints[run.index - 1] : def.start;
      const target = def.checkpoints[run.index];
      // Respawn right away (the fade hides the jump), then fade back in.
      this._place(back, this._yawTo(back, target));
      if (g.player.isDead) g.player.state = 'ground';
      g.player.model.root.rotation.set(0, g.player.heading, 0);
      setTimeout(() => g.hud.setFade(0, 400), 140);
    }

    _fail(reason) {
      const g = this.game;
      const run = this.run;
      g.audio.stopMusic(0.3);
      g.audio.fail();
      g.player.frozen = false;
      this._endRunVisuals();
      this.run = null;
      this._openResults({ def: run.def, failed: true, reason, run });
    }

    _finish() {
      const g = this.game;
      const run = this.run;
      const def = run.def;
      g.audio.stopMusic(1.2);
      const score = def.kind === 'countdown' ? run.remaining : run.time;
      let medal = null;
      for (const m of MEDALS) {
        const target = def.medals[m];
        if (def.kind === 'countdown' ? score >= target : score <= target) {
          medal = m;
          break;
        }
      }
      const rec = this.records[def.id] || { claimed: null, attempts: 0 };
      rec.attempts = (rec.attempts || 0) + 1;
      const better = rec.best === undefined || (def.kind === 'countdown' ? score > rec.best : score < rec.best);
      if (better) {
        rec.best = score;
        rec.splits = run.splits.slice();
        rec.ghost = run.rec;
      }
      // Rewards: pay the step up from the best medal you'd already been paid for.
      const rank = (m) => (m ? 3 - MEDALS.indexOf(m) : 0);
      let reward = 0;
      if (rank(medal) > rank(rec.claimed)) {
        reward = def.rewards[medal] - (rec.claimed ? def.rewards[rec.claimed] : 0);
        rec.claimed = medal;
      }
      if (rank(medal) > rank(rec.medal)) rec.medal = medal;
      this.records[def.id] = rec;
      this._saveRecords();
      if (reward > 0) {
        g.player.money += reward;
        VH.events.emit('money:changed', { delta: reward, reason: def.name });
      }
      g.player.stats.challengesCompleted = (g.player.stats.challengesCompleted || 0) + 1;
      g.audio.success(medal);
      if (g.renderer.post) g.renderer.post.pulse(0.3, new THREE.Color(1, 0.9, 0.6));
      this._endRunVisuals();
      this.run = null;
      this._refreshLabel(def);
      this._openResults({ def, failed: false, score, medal, better, reward, run, best: rec.best });
      VH.events.emit('challenge:finish', { id: def.id, score, medal, better });
    }

    // ------------------------------------------------------------ results
    _openResults(r) {
      this.results = { data: r, time: 0 };
      this.game.hud.showResults(this._resultView(r));
      document.body.classList.add('in-challenge');
      this.game.interaction.enabled = false;
      this.game.input.discard('interact');
    }

    _resultView(r) {
      const def = r.def;
      if (r.failed) {
        return { title: r.reason, name: def.name, medal: null, main: def.kind === 'countdown' ? 'Checkpoints: ' + r.run.index + ' / ' + def.checkpoints.length : formatTime(r.run.time), lines: ['So close. The clock is the enemy.'], retry: true };
      }
      const main = def.kind === 'countdown' ? r.score.toFixed(2) + ' s to spare' : formatTime(r.score);
      const lines = [];
      if (r.better) lines.push('New personal best!');
      else lines.push('Best: ' + (def.kind === 'countdown' ? r.best.toFixed(2) + ' s' : formatTime(r.best)));
      if (r.run.falls) lines.push(r.run.falls + (r.run.falls === 1 ? ' slip' : ' slips'));
      const next = r.medal === 'gold' ? null : MEDALS[Math.max(0, MEDALS.indexOf(r.medal || 'bronze') - (r.medal ? 1 : 0))];
      if (next) lines.push('Next: ' + next + ' at ' + (def.kind === 'countdown' ? def.medals[next] + ' s to spare' : formatTime(def.medals[next])));
      return { title: r.medal ? r.medal.toUpperCase() + ' MEDAL' : 'FINISHED', name: def.name, medal: r.medal, main, lines, reward: r.reward, retry: true };
    }

    _updateResults(dt) {
      const res = this.results;
      res.time += dt;
      const g = this.game;
      if (res.time > 0.4 && g.input.consume('interact')) {
        const id = res.data.def.id;
        this._closeResults();
        this.start(id);
        return;
      }
      if (res.time > 12 || (res.time > 1.5 && g.player.speed > 0.5)) this._closeResults();
    }

    _closeResults() {
      if (!this.results) return;
      this.results = null;
      this.game.hud.showResults(null);
      if (!this.run) document.body.classList.remove('in-challenge');
      if (!this.run) this.game.interaction.enabled = true;
    }

    // --------------------------------------------------------------- ghost
    _recordGhost(dt) {
      const run = this.run;
      run.recTimer -= dt;
      if (run.recTimer > 0) return;
      run.recTimer = 0.1;
      const p = this.game.player;
      const flags = (p.grounded ? 1 : 0) | (p.crouched ? 2 : 0) | (p.state === 'climb' ? 4 : 0);
      run.rec.push([
        Math.round(run.time * 100) / 100,
        Math.round(p.pos.x * 100) / 100, Math.round(p.pos.y * 100) / 100, Math.round(p.pos.z * 100) / 100,
        Math.round(p.heading * 1000) / 1000, Math.round(p.speed * 10) / 10, flags,
      ]);
    }

    _playGhost() {
      const run = this.run;
      const rec = run.ghost;
      const ghost = this.ghost;
      if (!rec || rec.length < 2) {
        ghost.root.visible = false;
        return;
      }
      const t = run.time;
      while (run.ghostCursor < rec.length - 2 && rec[run.ghostCursor + 1][0] <= t) run.ghostCursor++;
      const a = rec[run.ghostCursor];
      const b = rec[run.ghostCursor + 1];
      if (t > rec[rec.length - 1][0] + 1.5) {
        ghost.root.visible = false;
        return;
      }
      const k = clamp((t - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
      ghost.root.visible = true;
      ghost.root.position.set(lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k));
      ghost.root.rotation.set(0, lerpAngle(a[4], b[4], k), 0);
      const flags = a[6];
      ghost.animate(1 / 60, {
        speed: lerp(a[5], b[5], k), grounded: !!(flags & 1) || !!(flags & 4), vy: 0,
        crouch: flags & 2 ? 1 : 0, aim: 0, climb: flags & 4 ? 0.5 : -1, sprint: a[5] > 5.5, land: 0,
      });
    }

    // ----------------------------------------------------------------- HUD
    _updateHud() {
      const g = this.game;
      const run = this.run;
      const def = run.def;
      const countdown = def.kind === 'countdown';
      const shown = countdown ? (run.phase === 'running' ? run.remaining : def.startTime) : run.time;
      g.hud.setChallengeTimer(formatTime(Math.max(0, shown)), countdown && shown < 10 ? (shown < 5 ? 'critical' : 'warning') : '');
      g.hud.setChallengeInfo('Checkpoint ' + Math.min(run.index + 1, def.checkpoints.length) + ' / ' + def.checkpoints.length +
        (run.ghost && run.phase === 'running' ? '   ·   racing your best' : ''));

      // Where is the checkpoint on screen?
      const cp = def.checkpoints[run.index];
      if (!cp) return;
      const cam = g.renderer.camera;
      const v = this._v.set(cp.x, cp.y, cp.z).project(cam);
      const behind = v.z > 1;
      let x = v.x;
      let y = v.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const margin = 0.88;
      const onScreen = !behind && Math.abs(x) < margin && Math.abs(y) < margin;
      const dist = Math.hypot(g.player.pos.x - cp.x, g.player.pos.z - cp.z);
      if (!onScreen) {
        const s = margin / Math.max(Math.abs(x), Math.abs(y), 1e-3);
        x *= s;
        y *= s;
      }
      g.hud.setObjective({ x: (x * 0.5 + 0.5) * 100, y: (0.5 - y * 0.5) * 100, onScreen, angle: Math.atan2(-y, x), dist, finish: !!cp.finish });
    }
  }

  ChallengeSystem.formatTime = formatTime;
  VH.ChallengeSystem = ChallengeSystem;
})();
