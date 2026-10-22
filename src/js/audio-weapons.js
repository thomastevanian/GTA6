/*
 * audio-weapons.js — gunfire, reloads, impacts and weapon UI sounds.
 *
 * Adds methods to VH.AudioEngine.prototype, synthesised live like the rest
 * of audio.js (no audio files). Every method is a no-op until the audio
 * context is running. The caller works out distance attenuation and passes
 * it as `gain` (0..1) together with a stereo `pan` (-1..1).
 *
 *   gunshot(weaponId, pan, gain, distant)   one shot; distant = duller + more echo
 *   dryFire()                               empty-chamber click
 *   reload(weaponId)                        the whole reload, timed to the data;
 *                                           returns { stop() } to cut it short
 *   bulletImpact(surface, pan, gain)        'concrete' 'metal' 'wood' 'glass' 'flesh' 'car'
 *   ricochet(pan, gain)   whizz(pan)
 *   meleeSwing()          meleeHit(heavy)
 *   grenadeBounce(pan, gain)   molotovBurst(pan, gain)
 *   pickup()   weaponSwitch()   wheelTick()
 *
 * A shot is layered from a filtered-noise crack, a mid "snap", a low noise
 * body, a pitched-down sine thump and a short tonal click, with a little
 * random variation per shot, then sent into a shared city reverb and two
 * building echoes. Shots and impacts go to the sfx bus, UI sounds to the ui
 * bus. A burst limiter keeps massed gunfire from piling up into clipping.
 */
(function () {
  'use strict';

  const VH = window.VH;
  if (!VH.AudioEngine) {
    console.warn('[audio-weapons] load audio.js first');
    return;
  }
  const P = VH.AudioEngine.prototype;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------ profiles
  // crack/snap/body/tail: [filterHz, peak, decay(, q)]; thump: [f0, f1, peak, decay];
  // tone: [f0, f1, peak, decay, wave]; verb/echo/echo2: send levels.
  const SHOTS = {
    pistol: {
      crack: [2900, 0.3, 0.05], snap: [1900, 0.3, 0.09, 1.1], body: [1500, 0.2, 0.2], bodyBrown: false,
      thump: [150, 50, 0.34, 0.2], tone: [1150, 460, 0.07, 0.04, 'triangle'], tail: [720, 0.05, 0.6],
      verb: 0.26, echo: 0.12, echo2: 0.05, mech: 'slide',
    },
    revolver: {
      crack: [2300, 0.34, 0.07], snap: [1400, 0.34, 0.13, 1.0], body: [1050, 0.3, 0.32], bodyBrown: false,
      thump: [118, 38, 0.46, 0.32], tone: [820, 300, 0.07, 0.05, 'triangle'], tail: [620, 0.09, 1.0],
      verb: 0.34, echo: 0.18, echo2: 0.1, mech: 'none',
    },
    smg: {
      crack: [3700, 0.22, 0.035], snap: [2600, 0.2, 0.06, 1.3], body: [1900, 0.12, 0.12], bodyBrown: false,
      thump: [170, 72, 0.22, 0.12], tone: [1500, 720, 0.045, 0.028, 'square'], tail: [900, 0.03, 0.35],
      verb: 0.18, echo: 0.08, echo2: 0.03, mech: 'tick',
    },
    shotgun: {
      crack: [1900, 0.3, 0.08], snap: [1100, 0.34, 0.16, 0.8], body: [900, 0.36, 0.45], bodyBrown: true,
      thump: [96, 34, 0.52, 0.4], tone: [520, 200, 0.06, 0.07, 'triangle'], tail: [520, 0.12, 1.3],
      verb: 0.36, echo: 0.22, echo2: 0.12, mech: 'pump', level: 0.85,
    },
    rifle: {
      crack: [3300, 0.32, 0.045], snap: [2200, 0.28, 0.08, 1.2], body: [1650, 0.2, 0.2], bodyBrown: false,
      thump: [140, 48, 0.34, 0.2], tone: [1400, 600, 0.06, 0.035, 'triangle'], tail: [820, 0.06, 0.7],
      verb: 0.26, echo: 0.14, echo2: 0.07, mech: 'tick',
    },
    sniper: {
      crack: [2700, 0.4, 0.06], snap: [1500, 0.4, 0.14, 0.9], body: [1150, 0.36, 0.42], bodyBrown: true,
      thump: [100, 32, 0.55, 0.45], tone: [900, 300, 0.07, 0.06, 'triangle'], tail: [650, 0.16, 1.8],
      verb: 0.45, echo: 0.3, echo2: 0.34, mech: 'bolt', echoes: true, level: 0.85,
    },
  };

  const SURFACES = ['concrete', 'metal', 'wood', 'glass', 'flesh', 'car'];

  function profileFor(weaponId) {
    const def = VH.Data && VH.Data.weaponsById ? VH.Data.weaponsById[weaponId] : null;
    const key = def && SHOTS[def.sound] ? def.sound : SHOTS[weaponId] ? weaponId : 'pistol';
    return { key, p: SHOTS[key], def };
  }

  /** An urban reverb impulse: early reflections, then a decaying tail that darkens over time. */
  function makeImpulse(ctx, seconds) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.009);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        const k = 0.85 - 0.72 * Math.min(1, t / 0.9);
        lp += (Math.random() * 2 - 1 - lp) * k;
        d[i] = lp * Math.exp(-t / 0.24) * Math.min(1, t / 0.004);
      }
      // Early reflections off nearby walls, different per ear.
      for (let r = 0; r < 7; r++) {
        const at = pre + Math.floor(rate * (0.012 + Math.random() * 0.09));
        if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
      }
    }
    return buf;
  }

  // ----------------------------------------------------------- plumbing
  /** Shared effects: city reverb and two building echoes, created once per context. */
  P._wFx = function () {
    if (this._wfx && this._wfx.ctx === this.ctx) return this._wfx;
    const ctx = this.ctx;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx, 1.7);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.85;
    verb.connect(verbOut);
    verbOut.connect(this.sfx);
    const echoLine = (time, feedback, cutoff, pan) => {
      const input = ctx.createGain();
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = time;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = cutoff;
      damp.Q.value = 0.4;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      input.connect(delay);
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      const out = ctx.createGain();
      out.gain.value = 0.75;
      damp.connect(out);
      out.connect(this._pan(this.sfx, pan));
      return input;
    };
    this._wfx = {
      ctx,
      verb,
      echo: echoLine(0.19, 0.3, 2100, -0.35),
      echo2: echoLine(0.43, 0.4, 1300, 0.4),
    };
    return this._wfx;
  };

  /** Disconnect nodes once a one-shot has finished (real-time contexts only). */
  P._wRelease = function (nodes, seconds) {
    if (typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext) return;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch (err) {
          // Already gone.
        }
      }
    }, (seconds + 0.5) * 1000);
  };

  /**
   * A per-sound input: gain → optional lowpass → pan → sfx (or `bus`), with
   * optional sends to the reverb and echoes. Returns the input node.
   */
  P._wBus = function (o) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = o.gain === undefined ? 1 : o.gain;
    let node = input;
    const nodes = [input];
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      f.Q.value = 0.5;
      node.connect(f);
      node = f;
      nodes.push(f);
    }
    const out = this._pan(o.bus || this.sfx, o.pan || 0);
    node.connect(out);
    if (out !== (o.bus || this.sfx)) nodes.push(out);
    if (o.verb || o.echo || o.echo2) {
      const fx = this._wFx();
      for (const key of ['verb', 'echo', 'echo2']) {
        if (!o[key]) continue;
        const s = ctx.createGain();
        s.gain.value = o[key];
        node.connect(s);
        s.connect(fx[key]);
        nodes.push(s);
      }
    }
    this._wRelease(nodes, o.life || 3);
    return input;
  };

  /**
   * Keeps massed gunfire (a street full of SMGs) from stacking into clipping.
   * Returns a gain multiplier, or 0 to drop the shot. Quiet (distant) shots
   * are dropped first; shots fired on the same game tick are turned down so
   * their transients do not add up sample for sample.
   */
  P._wShotGain = function (gain) {
    const now = this.ctx.currentTime;
    const log = this._wShotLog || (this._wShotLog = []);
    while (log.length && now - log[0] > 0.1) log.shift();
    if (log.length >= 8 && gain < 0.9) return 0;
    if (log.length >= 4 && gain < 0.35) return 0;
    let sameTick = 0;
    for (const t of log) if (now - t < 0.004) sameTick++;
    log.push(now);
    return 1 / Math.sqrt(1 + sameTick * 0.9 + Math.max(0, log.length - 3) * 0.15);
  };

  /**
   * Filtered-noise burst and oscillator note, like audio.js's _hit/_tone but
   * with the gain starting at 0: a GainNode defaults to 1 until its first
   * scheduled event, so a sound scheduled ahead could leak a one-sample
   * click at full level.
   */
  P._wHit = function (o) {
    const ctx = this.ctx;
    const t = o.t || ctx.currentTime;
    const attack = o.attack || 0.004;
    const decay = o.decay || 0.05;
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.value = o.freq || 1000;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + attack + decay);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this._pan(o.bus || this.sfx, o.pan));
    this._envelope(g.gain, t, attack, o.peak || 0.2, decay);
    src.start(t, Math.random() * 1.5, attack + decay + 0.05);
  };

  P._wTone = function (o) {
    const ctx = this.ctx;
    const t = o.t || ctx.currentTime;
    const attack = o.attack || 0.005;
    const decay = o.decay || 0.1;
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + attack + decay);
    let node = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      f.Q.value = o.lpq || 0.7;
      osc.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    node.connect(g);
    g.connect(this._pan(o.bus || this.sfx, o.pan));
    this._envelope(g.gain, t, attack, o.peak || 0.2, decay);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  };

  // Small mechanical building blocks (t = start time, bus = destination).
  P._wClick = function (t, bus, f, peak) {
    this._wHit({ t, type: 'highpass', freq: 4200, q: 0.8, peak: peak * 0.8, attack: 0.0008, decay: 0.018, bus });
    this._wTone({ t, freq: f, wave: 'triangle', peak: peak * 0.5, attack: 0.0008, decay: 0.035, bus });
    this._wTone({ t, freq: f * 1.51, peak: peak * 0.25, attack: 0.0008, decay: 0.025, bus });
  };

  P._wClack = function (t, bus, f, peak) {
    this._wHit({ t, freq: 1900, q: 1.3, peak: peak, attack: 0.001, decay: 0.045, bus });
    this._wHit({ t, type: 'lowpass', freq: 900, q: 0.6, peak: peak * 0.6, attack: 0.001, decay: 0.06, bus });
    this._wTone({ t, freq: f, wave: 'triangle', peak: peak * 0.35, attack: 0.001, decay: 0.07, bus });
    this._wTone({ t, freq: 190, freqEnd: 120, peak: peak * 0.4, attack: 0.001, decay: 0.05, bus });
  };

  P._wScrape = function (t, bus, dur, f0, f1, peak) {
    this._wHit({ t, freq: f0, freqEnd: f1, q: 2.2, peak, attack: dur * 0.35, decay: dur * 0.65, bus });
  };

  P._wTinkle = function (t, bus, f, peak, pan) {
    const b = pan ? this._pan(bus, pan) : bus;
    this._wTone({ t, freq: f, peak, attack: 0.001, decay: rnd(0.05, 0.14), bus: b });
    this._wTone({ t, freq: f * rnd(1.35, 1.6), peak: peak * 0.5, attack: 0.001, decay: rnd(0.03, 0.08), bus: b });
  };

  // ------------------------------------------------------------ gunshots
  /** One shot. `distant` shots lose their crack, gain echo and are low-passed. */
  P.gunshot = function (weaponId, pan = 0, gain = 1, distant = false) {
    if (!this.ready || gain <= 0.001) return;
    const k = this._wShotGain(gain);
    if (!k) return;
    gain *= k;
    const { key, p } = profileFor(weaponId);
    // Other people's shots get a few ms of jitter so a volley never lines up exactly.
    const t = this.ctx.currentTime + 0.002 + (gain < 0.9 ? Math.random() * 0.012 : 0);
    const r = rnd(0.94, 1.06);
    const v = rnd(0.9, 1.04);
    const D = distant
      ? { crack: 0.12, snap: 0.45, body: 0.95, thump: 0.7, tone: 0.15, tail: 1.5, verb: 2.2, echo: 2.6 }
      : { crack: 1, snap: 1, body: 1, thump: 1, tone: 1, tail: 1, verb: 1, echo: 1 };
    const bus = this._wBus({
      pan, gain: gain * v * (p.level || 1) * (distant ? 0.85 : 1),
      lowpass: distant ? 1150 * r : 0,
      verb: p.verb * D.verb, echo: p.echo * D.echo, echo2: p.echo2 * D.echo,
      life: 2.5,
    });
    // Crack: the supersonic snap, bright filtered noise with a near-instant attack.
    this._wHit({ t, type: 'highpass', freq: p.crack[0] * r, q: 0.7, peak: p.crack[1] * D.crack, attack: 0.0006, decay: p.crack[2], bus });
    // Snap: the mid-range report.
    this._wHit({ t, freq: p.snap[0] * r, q: p.snap[3], peak: p.snap[1] * D.snap, attack: 0.0008, decay: p.snap[2], bus });
    // Body: the boom, noise through a lowpass that closes as it decays.
    this._wHit({
      t, type: 'lowpass', brown: p.bodyBrown, freq: p.body[0] * r, freqEnd: p.body[0] * 0.35, q: 0.7,
      peak: p.body[1] * D.body, attack: 0.0015, decay: p.body[2], bus,
    });
    // Thump: a pitched-down sine for chest punch.
    this._wTone({ t, freq: p.thump[0] * r, freqEnd: p.thump[1], peak: p.thump[2] * D.thump, attack: 0.0015, decay: p.thump[3], bus });
    // Tonal crack: a very short pitched click that gives each gun its voice.
    this._wTone({
      t, freq: p.tone[0] * r, freqEnd: p.tone[1], wave: p.tone[4], peak: p.tone[2] * D.tone,
      attack: 0.0006, decay: p.tone[3], lowpass: 5200, bus,
    });
    // Tail: low rumble rolling off the buildings.
    this._wHit({ t: t + 0.01, type: 'lowpass', brown: true, freq: p.tail[0], q: 0.5, peak: p.tail[1] * D.tail, attack: 0.03, decay: p.tail[2], bus });
    // The big rifle also rolls back from far buildings.
    if (p.echoes) {
      for (const [dt, k] of [[0.34, 0.35], [0.78, 0.2], [1.3, 0.1]]) {
        this._wHit({ t: t + dt * rnd(0.95, 1.08), type: 'lowpass', freq: 700, q: 0.6, peak: p.body[1] * k * (distant ? 1.3 : 1), attack: 0.02, decay: 0.5, bus });
      }
    }
    if (distant) return;
    // Mechanical follow-through near the player.
    const mech = this._wBus({ pan, gain: gain * 0.9, life: 1.5 });
    if (p.mech === 'slide') this._wClick(t + 0.03, mech, 2600 * r, 0.08);
    else if (p.mech === 'tick') this._wClick(t + 0.018, mech, 3100 * r, 0.045);
    else if (p.mech === 'pump') {
      this._wScrape(t + 0.33, mech, 0.07, 900, 1800, 0.07);
      this._wClack(t + 0.4, mech, 640, 0.16);
      this._wScrape(t + 0.46, mech, 0.06, 1700, 900, 0.06);
      this._wClack(t + 0.52, mech, 720, 0.18);
    } else if (p.mech === 'bolt') {
      this._wClick(t + 0.55, mech, 2200, 0.08);
      this._wScrape(t + 0.6, mech, 0.1, 1100, 2400, 0.06);
      this._wClack(t + 0.72, mech, 900, 0.1);
      this._wScrape(t + 0.8, mech, 0.09, 2200, 1100, 0.05);
      this._wClack(t + 0.9, mech, 760, 0.14);
    }
    if (key === 'shotgun' || key === 'sniper' || key === 'rifle' || key === 'pistol' || key === 'smg') {
      // A brass casing tinkling on the ground a moment later.
      if (Math.random() < (key === 'smg' ? 0.35 : 0.8)) {
        const tt = t + rnd(0.35, 0.55);
        this._wTinkle(tt, mech, rnd(3800, 5200), 0.022);
        this._wTinkle(tt + rnd(0.07, 0.12), mech, rnd(4200, 5600), 0.012);
      }
    }
  };

  /** The click of an empty chamber. */
  P.dryFire = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const bus = this._wBus({ gain: 1, life: 0.5 });
    this._wClick(t, bus, 2700, 0.16);
    this._wTone({ t, freq: 520, freqEnd: 380, wave: 'triangle', peak: 0.05, attack: 0.001, decay: 0.05, bus });
  };

  /**
   * A full reload for the weapon, spread over its reload time: mag out and
   * in, shells, a cylinder, or a bolt. Returns { stop() } (or null).
   */
  P.reload = function (weaponId) {
    if (!this.ready) return null;
    const { key, def } = profileFor(weaponId);
    if (def && (def.kind === 'melee' || def.kind === 'thrown')) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.sfx);
    const nominal = { pistol: 1.35, revolver: 2.4, smg: 1.9, shotgun: 2.9, rifle: 2.1, sniper: 2.9 }[key];
    const k = def && def.reloadTime ? def.reloadTime / nominal : 1;
    const T = (s) => t0 + s * k;
    switch (key) {
      case 'revolver':
        this._wClick(T(0.04), out, 2100, 0.1);
        this._wScrape(T(0.1), out, 0.08, 700, 1400, 0.05);
        for (let i = 0; i < 6; i++) this._wTinkle(T(0.42 + i * 0.045 + rnd(0, 0.03)), out, rnd(3000, 4600), 0.03, rnd(-0.3, 0.3));
        this._wScrape(T(1.25), out, 0.14, 1400, 700, 0.05);
        this._wClick(T(1.42), out, 1900, 0.09);
        this._wClack(T(1.95), out, 700, 0.15);
        break;
      case 'shotgun': {
        const shells = def && def.magSize ? Math.min(def.magSize, 4) : 4;
        for (let i = 0; i < shells; i++) {
          const s = 0.32 + i * 0.44;
          this._wScrape(T(s), out, 0.08, 1300, 700, 0.05);
          this._wClack(T(s + 0.08), out, 480, 0.1);
        }
        const rack = 0.32 + shells * 0.44 + 0.08;
        this._wScrape(T(rack), out, 0.07, 900, 1800, 0.07);
        this._wClack(T(rack + 0.07), out, 640, 0.16);
        this._wScrape(T(rack + 0.13), out, 0.06, 1700, 900, 0.06);
        this._wClack(T(rack + 0.19), out, 720, 0.18);
        break;
      }
      case 'sniper':
        this._wClick(T(0.05), out, 2200, 0.08);
        this._wScrape(T(0.12), out, 0.16, 1100, 2400, 0.06);
        this._wClick(T(0.5), out, 2600, 0.08);
        this._wScrape(T(0.56), out, 0.16, 1500, 800, 0.05);
        this._wScrape(T(1.45), out, 0.12, 800, 1500, 0.05);
        this._wClack(T(1.58), out, 820, 0.13);
        this._wScrape(T(2.2), out, 0.14, 2400, 1100, 0.06);
        this._wClack(T(2.42), out, 760, 0.15);
        break;
      default: {
        // Magazine weapons: pistol, SMG, rifle.
        const times = {
          pistol: { out: 0.05, in: 0.62, rack: 1.05 },
          smg: { out: 0.08, in: 0.88, rack: 1.38 },
          rifle: { out: 0.05, in: 0.9, rack: 1.62 },
        }[key];
        this._wClick(T(times.out), out, 2400, 0.1);
        this._wScrape(T(times.out + 0.05), out, 0.13, 1500, 700, 0.05);
        this._wScrape(T(times.in - 0.1), out, 0.1, 700, 1400, 0.045);
        this._wClack(T(times.in), out, key === 'pistol' ? 900 : 700, 0.15);
        if (key === 'rifle') this._wHit({ t: T(times.in + 0.12), type: 'lowpass', freq: 1200, peak: 0.12, attack: 0.002, decay: 0.05, bus: out });
        if (key === 'smg') this._wScrape(T(times.rack - 0.16), out, 0.1, 1000, 2200, 0.05);
        this._wClack(T(times.rack), out, key === 'pistol' ? 1050 : 820, 0.19);
        this._wClick(T(times.rack + 0.004), out, 3000, 0.07);
      }
    }
    const total = (def && def.reloadTime ? def.reloadTime : nominal) + 0.5;
    this._wRelease([out], total);
    return {
      stop: () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 0.04);
      },
    };
  };

  // ------------------------------------------------------------- impacts
  P.bulletImpact = function (surface, pan = 0, gain = 1) {
    if (!this.ready || gain <= 0.001) return;
    const t = this.ctx.currentTime;
    const r = rnd(0.92, 1.08);
    const bus = this._wBus({ pan, gain: gain * rnd(0.85, 1), verb: 0.08, life: 1.2 });
    switch (SURFACES.indexOf(surface) >= 0 ? surface : 'concrete') {
      case 'metal': {
        this._wHit({ t, type: 'highpass', freq: 3000 * r, peak: 0.2, attack: 0.0006, decay: 0.035, bus });
        const f = rnd(1600, 2300);
        [[1, 0.07, 0.4], [1.47, 0.05, 0.3], [2.09, 0.035, 0.22], [2.73, 0.02, 0.15]].forEach(([m, pk, dc]) => {
          this._wTone({ t, freq: f * m, wave: m === 1 ? 'triangle' : 'sine', peak: pk, attack: 0.0008, decay: dc, bus });
        });
        break;
      }
      case 'wood':
        this._wHit({ t, freq: 900 * r, q: 1.5, peak: 0.3, attack: 0.0008, decay: 0.08, bus });
        this._wTone({ t, freq: 240 * r, freqEnd: 170, wave: 'triangle', peak: 0.12, attack: 0.001, decay: 0.1, bus });
        this._wHit({ t: t + 0.008, type: 'highpass', freq: 3600, peak: 0.05, attack: 0.001, decay: 0.05, bus });
        break;
      case 'glass':
        this._wHit({ t, type: 'highpass', freq: 4500 * r, peak: 0.2, attack: 0.0006, decay: 0.12, bus });
        this._wHit({ t: t + 0.005, freq: 5200, q: 0.8, peak: 0.1, attack: 0.004, decay: 0.35, bus });
        for (let i = 0; i < 8; i++) this._wTinkle(t + rnd(0.01, 0.38), bus, rnd(2800, 7200), rnd(0.02, 0.045), rnd(-0.25, 0.25));
        break;
      case 'flesh':
        this._wHit({ t, type: 'lowpass', brown: true, freq: 700 * r, peak: 0.36, attack: 0.001, decay: 0.12, bus });
        this._wTone({ t, freq: 115 * r, freqEnd: 55, peak: 0.24, attack: 0.001, decay: 0.12, bus });
        this._wHit({ t: t + 0.004, freq: 1400, freqEnd: 480, q: 2, peak: 0.09, attack: 0.002, decay: 0.09, bus });
        break;
      case 'car':
        this._wHit({ t, freq: 1800 * r, q: 1.2, peak: 0.24, attack: 0.0006, decay: 0.05, bus });
        this._wTone({ t, freq: 820 * r, freqEnd: 760 * r, wave: 'triangle', peak: 0.07, attack: 0.001, decay: 0.22, bus });
        this._wTone({ t, freq: 1245 * r, peak: 0.035, attack: 0.001, decay: 0.16, bus });
        this._wTone({ t, freq: 140, freqEnd: 80, peak: 0.14, attack: 0.001, decay: 0.09, bus });
        break;
      default: // concrete
        this._wHit({ t, freq: 2600 * r, q: 0.9, peak: 0.26, attack: 0.0006, decay: 0.06, bus });
        this._wHit({ t, type: 'lowpass', brown: true, freq: 900, peak: 0.18, attack: 0.001, decay: 0.09, bus });
        this._wTone({ t, freq: 180 * r, freqEnd: 90, peak: 0.08, attack: 0.001, decay: 0.06, bus });
        for (let i = 0; i < 3; i++) {
          this._wHit({ t: t + 0.02 + i * rnd(0.018, 0.035), type: 'highpass', freq: rnd(2500, 4500), peak: 0.035, attack: 0.001, decay: 0.02, bus });
        }
    }
  };

  /** The whine of a round glancing off something hard. */
  P.ricochet = function (pan = 0, gain = 1) {
    if (!this.ready || gain <= 0.001) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const bus = this._wBus({ pan, gain, verb: 0.2, echo: 0.08, life: 1 });
    this._wHit({ t, type: 'highpass', freq: 3200, peak: 0.12, attack: 0.0006, decay: 0.03, bus });
    const f0 = rnd(2500, 3700);
    const len = rnd(0.3, 0.48);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * rnd(0.36, 0.5), t + len);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rnd(24, 38);
    const depth = ctx.createGain();
    depth.gain.value = f0 * 0.012;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + len + 0.05);
    lfo.stop(t + len + 0.05);
  };

  /** A bullet flying past Jay's head, from the side given by `pan`. */
  P.whizz = function (pan = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3.2;
    const f0 = rnd(3000, 3800);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f0 * 0.32, t + 0.16);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(f);
    f.connect(g);
    let dest = this.sfx;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan * 1.1)), t);
      p.pan.linearRampToValueAtTime(-pan * 0.35, t + 0.2);
      p.connect(this.sfx);
      dest = p;
      this._wRelease([p], 0.5);
    }
    g.connect(dest);
    src.start(t, Math.random() * 1.5, 0.25);
    // The sonic crack of a close round.
    this._wHit({ t, type: 'highpass', freq: 5200, peak: 0.07, attack: 0.0005, decay: 0.012, pan: pan * 0.8 });
  };

  // --------------------------------------------------------------- melee
  P.meleeSwing = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const r = rnd(0.9, 1.1);
    this._wHit({ t, freq: 380 * r, freqEnd: 1500 * r, q: 0.9, peak: 0.19, attack: 0.05, decay: 0.16 });
    this._wHit({ t: t + 0.01, type: 'lowpass', freq: 500, freqEnd: 260, q: 0.7, peak: 0.08, attack: 0.04, decay: 0.14 });
  };

  /** A landed blow. `heavy` for the bat (wooden crack and more weight). */
  P.meleeHit = function (heavy) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const r = rnd(0.92, 1.08);
    const bus = this._wBus({ gain: 1, verb: 0.06, life: 0.8 });
    if (heavy) {
      this._wTone({ t, freq: 96 * r, freqEnd: 42, peak: 0.36, attack: 0.001, decay: 0.22, bus });
      this._wHit({ t, freq: 1100 * r, q: 1.8, peak: 0.28, attack: 0.0008, decay: 0.09, bus });
      this._wTone({ t, freq: 330 * r, freqEnd: 260, wave: 'triangle', peak: 0.12, attack: 0.001, decay: 0.12, bus });
      this._wHit({ t, type: 'lowpass', brown: true, freq: 700, peak: 0.22, attack: 0.001, decay: 0.16, bus });
    } else {
      this._wTone({ t, freq: 125 * r, freqEnd: 55, peak: 0.32, attack: 0.001, decay: 0.13, bus });
      this._wHit({ t, type: 'lowpass', freq: 1300 * r, peak: 0.26, attack: 0.0008, decay: 0.07, bus });
      this._wHit({ t, freq: 2300, q: 1, peak: 0.09, attack: 0.0006, decay: 0.035, bus });
    }
  };

  // -------------------------------------------------------------- thrown
  P.grenadeBounce = function (pan = 0, gain = 1) {
    if (!this.ready || gain <= 0.001) return;
    const t = this.ctx.currentTime;
    const f = rnd(1250, 1750);
    const bus = this._wBus({ pan, gain, verb: 0.08, life: 0.6 });
    this._wHit({ t, freq: 2600, q: 1.1, peak: 0.12, attack: 0.0006, decay: 0.025, bus });
    this._wTone({ t, freq: f, wave: 'triangle', peak: 0.075, attack: 0.0008, decay: 0.14, bus });
    this._wTone({ t, freq: f * 2.31, peak: 0.03, attack: 0.0008, decay: 0.08, bus });
    this._wTone({ t, freq: 300, freqEnd: 220, peak: 0.06, attack: 0.001, decay: 0.05, bus });
  };

  /** Glass shattering, then the whoomph of fuel catching and a crackle. */
  P.molotovBurst = function (pan = 0, gain = 1) {
    if (!this.ready || gain <= 0.001) return;
    const t = this.ctx.currentTime;
    const bus = this._wBus({ pan, gain, verb: 0.2, echo: 0.06, life: 2.5 });
    this._wHit({ t, type: 'highpass', freq: 3000, peak: 0.24, attack: 0.0006, decay: 0.25, bus });
    this._wHit({ t, freq: 1400, q: 0.9, peak: 0.12, attack: 0.001, decay: 0.08, bus });
    for (let i = 0; i < 12; i++) this._wTinkle(t + rnd(0.01, 0.45), bus, rnd(2600, 7000), rnd(0.018, 0.04), rnd(-0.3, 0.3));
    this._wHit({ t: t + 0.04, type: 'lowpass', brown: true, freq: 180, freqEnd: 1100, q: 0.9, peak: 0.42, attack: 0.08, decay: 0.9, bus });
    this._wTone({ t: t + 0.04, freq: 72, freqEnd: 48, peak: 0.2, attack: 0.06, decay: 0.7, bus });
    for (let i = 0; i < 12; i++) {
      this._wHit({ t: t + rnd(0.2, 1.4), type: 'highpass', freq: rnd(2200, 4200), peak: rnd(0.02, 0.055), attack: 0.001, decay: rnd(0.01, 0.03), bus });
    }
  };

  // ------------------------------------------------------------------ UI
  /** A weapon or ammo pickup: a bright two-note chime plus a little handling clack. */
  P.pickup = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._wTone({ t, freq: 1318.5, wave: 'triangle', peak: 0.12, decay: 0.22, bus: this.ui });
    this._wTone({ t: t + 0.075, freq: 1975.5, wave: 'triangle', peak: 0.11, decay: 0.35, bus: this.ui });
    this._wTone({ t: t + 0.075, freq: 3951, peak: 0.025, decay: 0.3, bus: this.ui });
    this._wHit({ t: t + 0.05, type: 'highpass', freq: 6500, q: 0.4, peak: 0.03, attack: 0.02, decay: 0.3, bus: this.ui });
    const bus = this._wBus({ gain: 1, life: 0.5 });
    this._wClack(t, bus, 760, 0.09);
  };

  /** Drawing or holstering a weapon: a cloth rustle and a click-clack. */
  P.weaponSwitch = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const bus = this._wBus({ gain: 1, life: 0.6 });
    this._wHit({ t, freq: 1800, q: 0.7, peak: 0.07, attack: 0.025, decay: 0.1, bus });
    this._wClick(t + 0.06, bus, 2300, 0.07);
    this._wClack(t + 0.11, bus, 820, 0.1);
  };

  /** The soft tick as the weapon wheel's highlight moves. */
  P.wheelTick = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (this._wTickAt !== undefined && t - this._wTickAt < 0.035) return;
    this._wTickAt = t;
    this._wTone({ t, freq: 2150, wave: 'triangle', peak: 0.04, attack: 0.001, decay: 0.03, bus: this.ui });
    this._wHit({ t, type: 'highpass', freq: 5000, peak: 0.02, attack: 0.0006, decay: 0.012, bus: this.ui });
  };

  VH.AudioEngine.weaponSoundProfiles = Object.keys(SHOTS);
  VH.AudioEngine.impactSurfaces = SURFACES.slice();
})();
