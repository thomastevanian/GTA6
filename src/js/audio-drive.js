/*
 * audio-drive.js — the sound of driving, the police and the car radio,
 * synthesised live with Web Audio on top of VH.AudioEngine (audio.js).
 * There are no audio files.
 *
 *   voices     long-running sounds the game steers every frame through a
 *              handle: engines, tyre skids, sirens, horns, helicopters and
 *              burning wrecks. The caller does the positional mix and
 *              passes gain (0..1) and pan (-1..1) with every update.
 *
 *                const eng = audio.createEngine({ kind: 'muscle', player: true });
 *                eng.update({ rpm, throttle, load, gain, pan });   // every frame
 *                eng.stop();                                       // when the car is gone
 *
 *   one-shots  crash, scrape, explosion, carDoor, gearShift, bodyHit,
 *              radioSquelch, bustedSting, wastedSting, heatUp,
 *              missionStart, missionPassed, nearMiss, cash.
 *
 *   VH.Radio   three stations of procedurally composed, original music
 *              (plus "Off"). Every song is generated from a seed: key, mode,
 *              chord progression, motif, arrangement, title and artist.
 *
 * Every method is a silent no-op until the audio context is running.
 * Handles made before then are safe to use: a voice builds its nodes the
 * first time it is updated with something to play, frees them after 1.5 s
 * of silence, and rebuilds itself when it is heard again.
 */
(function () {
  'use strict';

  const VH = window.VH;
  if (!VH || !VH.AudioEngine) {
    console.warn('[audio-drive] audio.js must be loaded first');
    return;
  }
  const { clamp, smoothstep } = VH.math;
  const AE = VH.AudioEngine.prototype;

  const QUIET = 0.0015; // a voice below this level counts as silent
  const SLEEP_AFTER = 1.5; // seconds of silence before a voice frees its nodes

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const mod = (a, n) => ((a % n) + n) % n;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  // ================================================================ assets
  /** Shared buffers and curves, made once per audio context. */
  function assets(e) {
    let a = e._drvAssets;
    if (a && a.ctx === e.ctx) return a;
    const ctx = e.ctx;
    a = e._drvAssets = { ctx, curves: {} };
    a.wobble = randomSignal(ctx, 2, 9, true); // smooth random -1..1
    a.rough = randomSignal(ctx, 2, 38, false); // stepped random -1..1
    a.crackle = crackleBuffer(ctx, 3.7);
    a.rotor = rotorBuffer(ctx, 18, 8);
    return a;
  }

  /** Soft-clip curve tanh(kx), normalised so ±1 maps to ±1. */
  function curve(e, k) {
    const a = assets(e);
    const key = k.toFixed(2);
    if (!a.curves[key]) {
      const n = 1024;
      const c = new Float32Array(n);
      const norm = Math.tanh(k);
      for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
      a.curves[key] = c;
    }
    return a.curves[key];
  }

  /** A loopable random control signal, either smooth or stepped. */
  function randomSignal(ctx, secs, rate, smooth) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * secs);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const seg = Math.max(2, Math.floor(sr / rate));
    const count = Math.ceil(len / seg) + 1;
    const pts = new Float32Array(count + 1);
    for (let i = 0; i < pts.length; i++) pts[i] = Math.random() * 2 - 1;
    const segs = Math.floor(len / seg);
    pts[segs] = pts[0]; // seamless loop for the smooth signal
    for (let i = 0; i < len; i++) {
      const j = Math.floor(i / seg);
      const f = (i - j * seg) / seg;
      d[i] = smooth ? pts[j] + (pts[j + 1] - pts[j]) * (0.5 - 0.5 * Math.cos(Math.PI * f)) : pts[j];
    }
    return buf;
  }

  /** Sparse fire crackles: tiny noise bursts at random, with the odd louder pop. */
  function crackleBuffer(ctx, secs) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * secs);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let t = 0.01;
    for (;;) {
      t += -Math.log(1 - Math.random()) / 17;
      if (t >= secs - 0.03) break;
      const i0 = Math.floor(t * sr);
      const big = Math.random() < 0.1;
      const amp = big ? 0.55 + Math.random() * 0.45 : 0.08 + Math.pow(Math.random(), 2) * 0.5;
      const n = Math.floor(sr * (big ? 0.004 + Math.random() * 0.012 : 0.0006 + Math.random() * 0.0025));
      const k = big ? 0.3 : 0.75;
      let lp = 0;
      for (let j = 0; j < n && i0 + j < len; j++) {
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i0 + j] += lp * amp * Math.exp(-j / (n * 0.3));
      }
    }
    return buf;
  }

  /** One loop of helicopter rotor: `blades` low slaps at `rate` per second. */
  function rotorBuffer(ctx, rate, blades) {
    const sr = ctx.sampleRate;
    const period = Math.floor(sr / rate);
    const len = period * blades;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let lp = 0;
    let peak = 0;
    for (let b = 0; b < blades; b++) {
      const amp = (b % 2 ? 0.82 : 1) * (0.9 + Math.random() * 0.1);
      for (let j = 0; j < period; j++) {
        const x = j / sr;
        lp += 0.07 * (Math.random() * 2 - 1 - lp);
        const fade = 1 - Math.pow(j / period, 6);
        const v = amp * fade * (lp * 3.4 * Math.exp(-x / 0.012) + 0.5 * Math.sin(2 * Math.PI * 64 * x) * Math.exp(-x / 0.019));
        d[b * period + j] = v;
        peak = Math.max(peak, Math.abs(v));
      }
    }
    for (let i = 0; i < len; i++) d[i] *= 0.9 / (peak || 1);
    return buf;
  }

  function impulse(ctx, secs, gated) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * secs);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / sr;
        let env;
        let k;
        if (gated) {
          // Dense and flat, then cut off hard: the 80s gated-snare sound.
          env = x < 0.003 ? x / 0.003 : x < 0.25 ? 1 - 0.3 * (x / 0.25) : Math.max(0, 0.7 * (1 - (x - 0.25) / (secs - 0.25)));
          k = 0.5;
        } else {
          env = x < 0.011 ? 0 : Math.exp(-(x - 0.011) / 0.3) * (1 - Math.pow(x / secs, 6));
          k = 0.8 - 0.62 * (x / secs); // high frequencies die away first
        }
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * env;
      }
    }
    return buf;
  }

  function vibrato(len, depth, offset, rate) {
    const n = Math.max(2, Math.ceil(len * rate * 10));
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * len;
      c[i] = offset + depth * Math.min(1, x / 0.35) * Math.sin(2 * Math.PI * rate * x);
    }
    return c;
  }

  // ================================================================ voices
  /**
   * Base for every continuous voice. The handle is safe to use before the
   * audio context exists; it builds its node graph lazily and tears it down
   * again after a stretch of silence.
   */
  class Voice {
    constructor(engine) {
      this.engine = engine;
      this.n = null;
      this.stopped = false;
      this._quiet = -1;
      this._last = null;
      this._nodes = null;
      this._srcs = null;
    }

    /** True while the voice has live audio nodes. */
    get awake() {
      return !!this.n;
    }

    update(p) {
      if (this.stopped || !p) return;
      const e = this.engine;
      if (!e || !e.ready) return;
      const t = e.ctx.currentTime;
      const level = this._level(p);
      if (!this.n) {
        if (!(level > QUIET)) return;
        if (!this._wake(t)) return;
      }
      if (level > QUIET) this._quiet = -1;
      else if (this._quiet < 0) this._quiet = t;
      else if (t - this._quiet > SLEEP_AFTER) {
        this._sleep(0);
        return;
      }
      try {
        this._apply(p, t, level);
      } catch (err) {
        console.warn('[audio-drive] voice update failed', err);
        this.stop();
      }
    }

    stop() {
      if (this.stopped) return;
      this.stopped = true;
      this._sleep(0.05);
    }

    _level(p) {
      return clamp(num(p.gain, 0), 0, 1.5);
    }

    _wake(t) {
      const e = this.engine;
      const ctx = e.ctx;
      this._nodes = [];
      this._srcs = [];
      this._last = {};
      this._quiet = -1;
      const n = (this.n = {});
      try {
        n.out = this._node(ctx.createGain());
        n.out.gain.value = 0;
        n.pan = ctx.createStereoPanner ? this._node(ctx.createStereoPanner()) : null;
        if (n.pan) {
          n.out.connect(n.pan);
          n.pan.connect(e.sfx);
        } else n.out.connect(e.sfx);
        this._build(ctx, n, e);
        for (const s of this._srcs) {
          if (s.offset) s.node.start(t, s.offset);
          else s.node.start(t);
        }
      } catch (err) {
        console.warn('[audio-drive] voice failed to start', err);
        this._sleep(0);
        this.stopped = true;
        return false;
      }
      return true;
    }

    _node(x) {
      this._nodes.push(x);
      return x;
    }

    /** Register a source node; it is started when the graph is complete. */
    _src(x, offset) {
      this._nodes.push(x);
      this._srcs.push({ node: x, offset: offset || 0 });
      return x;
    }

    _gain(ctx, v) {
      const g = this._node(ctx.createGain());
      g.gain.value = v;
      return g;
    }

    _filter(ctx, type, f, q) {
      const x = this._node(ctx.createBiquadFilter());
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q == null ? 0.7 : q;
      return x;
    }

    _osc(ctx, type, f) {
      const o = this._src(ctx.createOscillator());
      o.type = type;
      o.frequency.value = f;
      return o;
    }

    _loop(ctx, buffer, rate) {
      const s = this._src(ctx.createBufferSource(), Math.random() * buffer.duration * 0.9);
      s.buffer = buffer;
      s.loop = true;
      if (rate) s.playbackRate.value = rate;
      return s;
    }

    /** Glide a parameter to v; skips the call when the target barely moved. */
    _to(param, key, v, t, tc, snap) {
      const last = this._last[key];
      if (last !== undefined && Math.abs(v - last) <= Math.abs(last) * 0.002 + 1e-5) return;
      this._last[key] = v;
      if (snap && last === undefined) param.setValueAtTime(v, t);
      else param.setTargetAtTime(v, t, tc);
    }

    _mix(p, t, g) {
      this._to(this.n.out.gain, 'out', g, t, 0.05);
      if (this.n.pan) this._to(this.n.pan.pan, 'pan', clamp(num(p.pan, 0), -1, 1), t, 0.05, true);
    }

    _sleep(fade) {
      const n = this.n;
      const nodes = this._nodes;
      const srcs = this._srcs;
      this.n = null;
      this._nodes = null;
      this._srcs = null;
      if (!n || !nodes) return;
      const kill = () => {
        for (const s of srcs) {
          try {
            s.node.stop();
          } catch (_) {
            /* never started */
          }
        }
        for (const x of nodes) {
          try {
            x.disconnect();
          } catch (_) {
            /* already gone */
          }
        }
      };
      const ctx = this.engine.ctx;
      if (fade > 0 && ctx && n.out) {
        const t = ctx.currentTime;
        n.out.gain.cancelScheduledValues(t);
        n.out.gain.setTargetAtTime(0, t, fade / 3);
        setTimeout(kill, fade * 1000 + 150);
      } else kill();
    }
  }

  // ---------------------------------------------------------------- engine
  // [harmonic of the firing frequency, waveform, level]; traffic uses the first two.
  const KINDS = {
    sports: { idle: 38, red: 255, osc: [[1, 'sawtooth', 0.5], [2, 'square', 0.3], [3, 'sawtooth', 0.14]], drive: 4.2, lp: 1.5, q: 2.2, flutter: 0.5, fdepth: 0.16, noise: 1.1, nf: 3.4, gain: 0.95 },
    sedan: { idle: 32, red: 200, osc: [[1, 'sawtooth', 0.5], [2, 'triangle', 0.3], [0.5, 'sine', 0.35]], drive: 1.8, lp: 0.9, q: 0.9, flutter: 0.5, fdepth: 0.12, noise: 0.7, nf: 2.2, gain: 0.85 },
    compact: { idle: 36, red: 235, osc: [[1, 'square', 0.4], [2, 'sawtooth', 0.28], [3, 'square', 0.1]], drive: 2.4, lp: 1.1, q: 1.4, flutter: 0.5, fdepth: 0.14, noise: 0.8, nf: 2.8, gain: 0.72 },
    muscle: { idle: 28, red: 180, osc: [[1, 'sawtooth', 0.5], [0.5, 'sawtooth', 0.48], [2, 'square', 0.2]], drive: 3.2, lp: 0.8, q: 2.6, flutter: 0.25, fdepth: 0.34, noise: 1.3, nf: 1.8, gain: 1.0 },
    van: { idle: 30, red: 165, osc: [[1, 'sawtooth', 0.5], [0.5, 'square', 0.3], [2, 'sawtooth', 0.18]], drive: 2.0, lp: 0.7, q: 1.2, flutter: 0.5, fdepth: 0.16, noise: 1.2, nf: 4.5, gain: 0.85 },
    pickup: { idle: 29, red: 185, osc: [[1, 'sawtooth', 0.5], [0.5, 'sawtooth', 0.38], [2, 'square', 0.15]], drive: 2.6, lp: 0.75, q: 2.0, flutter: 0.25, fdepth: 0.26, noise: 1.1, nf: 2.0, gain: 0.92 },
    taxi: { idle: 32, red: 195, osc: [[1, 'sawtooth', 0.5], [2, 'square', 0.2], [0.5, 'sine', 0.3]], drive: 2.0, lp: 0.85, q: 1.0, flutter: 0.5, fdepth: 0.13, noise: 0.8, nf: 2.4, gain: 0.85 },
    police: { idle: 30, red: 215, osc: [[1, 'sawtooth', 0.5], [0.5, 'sawtooth', 0.36], [2, 'square', 0.24]], drive: 3.0, lp: 1.0, q: 2.0, flutter: 0.25, fdepth: 0.24, noise: 1.2, nf: 2.2, gain: 0.95 },
    // Electric cars: a smooth rising whine, almost no rumble.
    ev: { idle: 70, red: 560, osc: [[1, 'sine', 0.38], [2, 'triangle', 0.1], [4, 'sine', 0.05]], drive: 5.0, lp: 1.7, q: 0.7, flutter: 0.1, fdepth: 0.03, noise: 0.3, nf: 3.2, gain: 0.5 },
    // A light aircraft's flat-four and propeller, and a tank's big diesel.
    prop: { idle: 26, red: 120, osc: [[1, 'sawtooth', 0.5], [2, 'square', 0.25], [0.5, 'sawtooth', 0.3]], drive: 2.2, lp: 0.7, q: 1.4, flutter: 0.6, fdepth: 0.2, noise: 1.0, nf: 3.0, gain: 0.95 },
    tank: { idle: 18, red: 95, osc: [[1, 'sawtooth', 0.5], [0.5, 'square', 0.45], [2, 'sawtooth', 0.2]], drive: 3.4, lp: 0.55, q: 2.4, flutter: 0.3, fdepth: 0.3, noise: 1.6, nf: 1.6, gain: 1.0 },
  };
  const POPPY = { sports: 1, muscle: 1, police: 1 };

  class EngineVoice extends Voice {
    constructor(engine, o) {
      super(engine);
      this.kind = KINDS[o.kind] ? o.kind : 'sedan';
      this.cfg = KINDS[this.kind];
      this.player = !!o.player;
      this._thr = 0;
      this._popAt = 0;
    }

    _build(ctx, n, e) {
      const c = this.cfg;
      const rich = this.player;
      n.pre = this._gain(ctx, 1);
      n.osc = [];
      for (const [ratio, type, lvl] of c.osc.slice(0, rich ? 3 : 2)) {
        const o = this._osc(ctx, type, c.idle * ratio);
        const g = this._gain(ctx, lvl);
        o.connect(g);
        g.connect(n.pre);
        n.osc.push({ o, ratio });
      }
      n.shaper = this._node(ctx.createWaveShaper());
      n.shaper.curve = curve(e, 2.2);
      n.shaper.oversample = rich ? '2x' : 'none';
      n.lp = this._filter(ctx, 'lowpass', 400, c.q);
      n.am = this._gain(ctx, 1 - c.fdepth);
      n.pre.connect(n.shaper);
      n.shaper.connect(n.lp);
      if (rich) {
        // Engine-bay body resonance makes the player's car fuller.
        n.body = this._filter(ctx, 'peaking', 150, 0.9);
        n.body.gain.value = 4;
        n.lp.connect(n.body);
        n.body.connect(n.am);
      } else n.lp.connect(n.am);
      // Nothing useful lives below ~38 Hz; keep that headroom for the rest of the mix.
      n.hp = this._filter(ctx, 'highpass', 38, 0.7);
      n.am.connect(n.hp);
      n.hp.connect(n.out);

      // Cylinder pulses: a slow amplitude flutter locked to the firing rate.
      n.lfo = this._osc(ctx, 'sine', c.idle * c.flutter);
      n.lfoG = this._gain(ctx, c.fdepth);
      n.lfo.connect(n.lfoG);
      n.lfoG.connect(n.am.gain);

      // Exhaust roar: noise chopped into one burst per firing by the first oscillator.
      const ns = this._loop(ctx, e.white);
      n.nbp = this._filter(ctx, 'bandpass', 300, 0.9);
      n.pulse = this._gain(ctx, 0.5);
      const pm = this._gain(ctx, -0.5);
      n.osc[0].o.connect(pm);
      pm.connect(n.pulse.gain);
      n.nlev = this._gain(ctx, 0);
      ns.connect(n.nbp);
      n.nbp.connect(n.pulse);
      n.pulse.connect(n.nlev);
      n.nlev.connect(n.pre);

      if (rich) {
        // Intake hiss and a little rpm wander so it never sounds like a pure tone.
        const is = this._loop(ctx, e.white);
        n.ibp = this._filter(ctx, 'bandpass', 900, 0.8);
        n.ilev = this._gain(ctx, 0);
        is.connect(n.ibp);
        n.ibp.connect(n.ilev);
        n.ilev.connect(n.am);
        const wob = this._loop(ctx, assets(e).wobble, 0.35);
        const wg = this._gain(ctx, 7);
        wob.connect(wg);
        for (const k of n.osc) wg.connect(k.o.detune);
      }
    }

    _apply(p, t, gain) {
      const n = this.n;
      const c = this.cfg;
      const rpm = clamp(num(p.rpm, 0), 0, 1.1);
      const thr = clamp(num(p.throttle, 0), 0, 1);
      const load = clamp(num(p.load, 0), 0, 1);
      const f0 = c.idle + (c.red - c.idle) * Math.pow(rpm, 0.92);
      for (const k of n.osc) this._to(k.o.frequency, 'f' + k.ratio, f0 * k.ratio, t, 0.035, true);
      this._to(n.lfo.frequency, 'lfo', f0 * c.flutter, t, 0.05, true);
      const fd = c.fdepth * (1 - 0.7 * Math.min(1, rpm));
      this._to(n.lfoG.gain, 'fd', fd, t, 0.08);
      this._to(n.am.gain, 'am', 1 - fd, t, 0.08);
      // Grit and brightness open with throttle; off-throttle the engine goes dull (engine braking).
      this._to(n.pre.gain, 'drv', c.drive * 0.3 * (0.9 + 0.25 * thr + 0.2 * load) * (0.85 + 0.25 * rpm), t, 0.05);
      const cut = clamp(480 + f0 * c.lp * (2 + 9 * thr * (0.6 + 0.4 * load) + 2 * rpm), 200, 9000);
      this._to(n.lp.frequency, 'cut', cut, t, 0.05, true);
      const roar = thr * (0.25 + 0.75 * Math.min(1, rpm));
      this._to(n.nbp.frequency, 'nf', 200 + f0 * c.nf, t, 0.05, true);
      this._to(n.nlev.gain, 'nl', c.noise * (0.06 + 0.5 * roar), t, 0.06);
      if (n.ilev) {
        this._to(n.ibp.frequency, 'if', 600 + 2600 * Math.min(1, rpm), t, 0.06, true);
        this._to(n.ilev.gain, 'il', 0.1 * roar * (0.6 + 0.4 * load), t, 0.06);
      }
      const lvl = (0.62 + 0.38 * Math.pow(thr, 0.8)) * (0.8 + 0.2 * Math.min(1, rpm)) * (0.9 + 0.2 * load);
      this._mix(p, t, gain * lvl * c.gain * (this.player ? 0.42 : 0.24));

      // Exhaust pops when the player lifts off sharply at high rpm.
      if (this.player && this._thr > 0.6 && thr < 0.2 && rpm > 0.45 && t > this._popAt) {
        this._popAt = t + 0.9;
        const count = POPPY[this.kind] ? 2 + Math.floor(Math.random() * 3) : Math.random() < 0.3 ? 1 : 0;
        const pan = clamp(num(p.pan, 0), -1, 1);
        const out = this.engine._pan(this.engine.sfx, pan);
        for (let i = 0; i < count; i++) {
          const tt = t + 0.06 + i * rand(0.07, 0.16);
          this.engine._hit({ t: tt, type: 'bandpass', freq: rand(450, 1100), q: 0.9, peak: 0.3 * gain, attack: 0.002, decay: 0.04, bus: out });
          this.engine._tone({ t: tt, freq: 120, freqEnd: 55, peak: 0.16 * gain, decay: 0.06, bus: out });
        }
      }
      this._thr = thr;
    }
  }

  // ------------------------------------------------------------------ skid
  class SkidVoice extends Voice {
    _level(p) {
      return clamp(num(p.gain, 0), 0, 1.5) * smoothstep(0.03, 0.25, clamp(num(p.slip, 0), 0, 1));
    }

    _build(ctx, n, e) {
      const a = assets(e);
      n.mix = this._gain(ctx, 1);
      n.mix.connect(n.out);
      // Squeal: a wavering tone plus narrow-band noise that follows it.
      n.sq = this._gain(ctx, 0);
      n.sqAm = this._gain(ctx, 0.75);
      n.sq.connect(n.sqAm);
      n.sqAm.connect(n.mix);
      n.t1 = this._osc(ctx, 'triangle', 900);
      n.t2 = this._osc(ctx, 'square', 1800);
      const g1 = this._gain(ctx, 0.5);
      const g2 = this._gain(ctx, 0.05);
      const t2lp = this._filter(ctx, 'lowpass', 3500, 0.7);
      n.t1.connect(g1);
      g1.connect(n.sq);
      n.t2.connect(t2lp);
      t2lp.connect(g2);
      g2.connect(n.sq);
      const ns = this._loop(ctx, e.white);
      n.bp1 = this._filter(ctx, 'bandpass', 900, 14);
      n.bp2 = this._filter(ctx, 'bandpass', 900, 14);
      const ng = this._gain(ctx, 6);
      ns.connect(n.bp1);
      n.bp1.connect(n.bp2);
      n.bp2.connect(ng);
      ng.connect(n.sq);
      const wob = this._loop(ctx, a.wobble, 0.8);
      const wg = this._gain(ctx, 38);
      wob.connect(wg);
      wg.connect(n.t1.detune);
      wg.connect(n.t2.detune);
      wg.connect(n.bp1.detune);
      wg.connect(n.bp2.detune);
      const flut = this._loop(ctx, a.wobble, 2.1);
      const fg = this._gain(ctx, 0.25);
      flut.connect(fg);
      fg.connect(n.sqAm.gain);
      // Broadband tyre hiss.
      const hs = this._loop(ctx, e.white);
      const hbp = this._filter(ctx, 'bandpass', 2600, 0.8);
      n.hiss = this._gain(ctx, 0);
      hs.connect(hbp);
      hbp.connect(n.hiss);
      n.hiss.connect(n.mix);
      // Crunch for grass and gravel: low rumble plus stones, chopped at random.
      n.crAm = this._gain(ctx, 0.55);
      const rough = this._loop(ctx, a.rough, 1.3);
      const rg = this._gain(ctx, 0.45);
      rough.connect(rg);
      rg.connect(n.crAm.gain);
      const bs = this._loop(ctx, e.brown);
      n.crLp = this._filter(ctx, 'lowpass', 500, 0.8);
      n.cr = this._gain(ctx, 0);
      bs.connect(n.crLp);
      n.crLp.connect(n.cr);
      n.cr.connect(n.crAm);
      const gs = this._loop(ctx, e.white);
      n.cgBp = this._filter(ctx, 'bandpass', 1700, 0.9);
      n.cg = this._gain(ctx, 0);
      gs.connect(n.cgBp);
      n.cgBp.connect(n.cg);
      n.cg.connect(n.crAm);
      n.crAm.connect(n.mix);
    }

    _apply(p, t, level) {
      const n = this.n;
      const slip = clamp(num(p.slip, 0), 0, 1);
      const surf = p.surface === 'grass' || p.surface === 'gravel' ? p.surface : 'asphalt';
      const f = 700 + 400 * slip;
      this._to(n.t1.frequency, 'f1', f, t, 0.06, true);
      this._to(n.t2.frequency, 'f2', f * 2.01, t, 0.06, true);
      this._to(n.bp1.frequency, 'b1', f * 1.02, t, 0.06, true);
      this._to(n.bp2.frequency, 'b2', f * 1.02, t, 0.06, true);
      if (surf === 'asphalt') {
        this._to(n.sq.gain, 'sq', 0.75 * smoothstep(0.08, 0.6, slip), t, 0.05);
        this._to(n.hiss.gain, 'hs', 0.08 * slip, t, 0.05);
        this._to(n.cr.gain, 'cr', 0, t, 0.05);
        this._to(n.cg.gain, 'cg', 0, t, 0.05);
      } else {
        const grass = surf === 'grass';
        this._to(n.sq.gain, 'sq', 0, t, 0.04);
        this._to(n.hiss.gain, 'hs', 0.03 * slip, t, 0.05);
        this._to(n.crLp.frequency, 'cl', grass ? 380 : 750, t, 0.05, true);
        this._to(n.cr.gain, 'cr', (grass ? 1.6 : 1.4) * (0.3 + 0.7 * slip), t, 0.05);
        this._to(n.cgBp.frequency, 'cf', grass ? 1100 : 2000, t, 0.05, true);
        this._to(n.cg.gain, 'cg', (grass ? 0.05 : 0.38) * (0.3 + 0.7 * slip), t, 0.05);
      }
      const tail = smoothstep(0.03, 0.25, slip);
      this._mix(p, t, clamp(num(p.gain, 0), 0, 1.5) * tail * 0.55);
    }
  }

  // ----------------------------------------------------------------- siren
  const SIREN_RATE = { wail: 0.25, yelp: 1 / 0.28 };

  class SirenVoice extends Voice {
    constructor(engine, o) {
      super(engine);
      this.style = o.style === 'yelp' ? 'yelp' : 'wail';
    }

    _build(ctx, n, e) {
      // Sweep 650..1500 Hz: a centre frequency plus a triangle LFO of ±425 Hz.
      n.lfo = this._osc(ctx, 'triangle', SIREN_RATE[this.style]);
      n.depth = this._gain(ctx, 0);
      n.lfo.connect(n.depth);
      n.sq = this._osc(ctx, 'square', 500);
      n.tri = this._osc(ctx, 'triangle', 500);
      n.depth.connect(n.sq.frequency);
      n.depth.connect(n.tri.frequency);
      const gs = this._gain(ctx, 0.3);
      const gt = this._gain(ctx, 0.6);
      const pre = this._gain(ctx, 1.3);
      n.sq.connect(gs);
      n.tri.connect(gt);
      gs.connect(pre);
      gt.connect(pre);
      // A horn loudspeaker: driven a little hard, band-limited, with a resonant peak.
      const sh = this._node(ctx.createWaveShaper());
      sh.curve = curve(e, 1.6);
      const hp = this._filter(ctx, 'highpass', 480, 0.7);
      const pk = this._filter(ctx, 'peaking', 1500, 1.4);
      pk.gain.value = 6;
      const lp = this._filter(ctx, 'lowpass', 4000, 0.7);
      pre.connect(sh);
      sh.connect(hp);
      hp.connect(pk);
      pk.connect(lp);
      lp.connect(n.out);
    }

    _apply(p, t, gain) {
      const n = this.n;
      if (p.style === 'wail' || p.style === 'yelp') this.style = p.style;
      // The first update after waking winds the siren up from low.
      if (this._last.c === undefined) {
        n.sq.frequency.setValueAtTime(420, t);
        n.tri.frequency.setValueAtTime(420, t);
      }
      this._to(n.sq.frequency, 'c', 1075, t, 0.22);
      this._to(n.tri.frequency, 'c2', 1075, t, 0.22);
      this._to(n.depth.gain, 'd', 425, t, 0.3);
      this._to(n.lfo.frequency, 'r', SIREN_RATE[this.style], t, 0.03);
      const rate = clamp(num(p.dopplerRate, 1), 0.5, 2);
      const cents = 1200 * Math.log2(rate);
      this._to(n.sq.detune, 'dp', cents, t, 0.05);
      this._to(n.tri.detune, 'dp2', cents, t, 0.05);
      this._mix(p, t, gain * 0.22);
    }
  }

  // ------------------------------------------------------------------ horn
  class HornVoice extends Voice {
    _level(p) {
      return p.on ? clamp(num(p.gain, 0), 0, 1.5) : 0;
    }

    _build(ctx, n, e) {
      const pre = this._gain(ctx, 1);
      for (const [f, det] of [[420, -4], [520, 3]]) {
        const o = this._osc(ctx, 'square', f);
        o.detune.value = det;
        const g = this._gain(ctx, 0.45);
        o.connect(g);
        g.connect(pre);
      }
      const sh = this._node(ctx.createWaveShaper());
      sh.curve = curve(e, 1.4);
      const lp = this._filter(ctx, 'lowpass', 2100, 1);
      const pk = this._filter(ctx, 'peaking', 950, 1.2);
      pk.gain.value = 5;
      const hp = this._filter(ctx, 'highpass', 250, 0.7);
      pre.connect(sh);
      sh.connect(lp);
      lp.connect(pk);
      pk.connect(hp);
      hp.connect(n.out);
    }

    _apply(p, t, level) {
      const n = this.n;
      const g = level * 0.27;
      // A horn needs a faster edge than the other voices.
      const last = this._last.out;
      if (last === undefined || Math.abs(g - last) > 1e-5) {
        this._last.out = g;
        n.out.gain.setTargetAtTime(g, t, g > (last || 0) ? 0.008 : 0.03);
      }
      if (n.pan) this._to(n.pan.pan, 'pan', clamp(num(p.pan, 0), -1, 1), t, 0.05, true);
    }
  }

  // ------------------------------------------------------------ helicopter
  class HeliVoice extends Voice {
    _build(ctx, n, e) {
      const a = assets(e);
      n.rotor = this._loop(ctx, a.rotor, 1);
      const rlp = this._filter(ctx, 'lowpass', 1100, 0.7);
      const rg = this._gain(ctx, 0.9);
      n.rotor.connect(rlp);
      rlp.connect(rg);
      rg.connect(n.out);
      const wash = this._loop(ctx, e.brown);
      const wlp = this._filter(ctx, 'lowpass', 200, 0.7);
      const wg = this._gain(ctx, 0.6);
      wash.connect(wlp);
      wlp.connect(wg);
      wg.connect(n.out);
      // Turbine whine and jet hiss.
      n.whine = this._gain(ctx, 0);
      n.w1 = this._osc(ctx, 'sine', 2050);
      n.w2 = this._osc(ctx, 'triangle', 3075);
      const w2g = this._gain(ctx, 0.35);
      n.w1.connect(n.whine);
      n.w2.connect(w2g);
      w2g.connect(n.whine);
      const wob = this._loop(ctx, a.wobble, 0.5);
      const wobg = this._gain(ctx, 9);
      wob.connect(wobg);
      wobg.connect(n.w1.detune);
      wobg.connect(n.w2.detune);
      n.whine.connect(n.out);
      const hs = this._loop(ctx, e.white);
      const hhp = this._filter(ctx, 'highpass', 4200, 0.7);
      n.hiss = this._gain(ctx, 0);
      hs.connect(hhp);
      hhp.connect(n.hiss);
      n.hiss.connect(n.out);
      // Tail rotor buzz.
      n.tail = this._osc(ctx, 'sawtooth', 92);
      const tbp = this._filter(ctx, 'bandpass', 380, 3);
      const tg = this._gain(ctx, 0.06);
      n.tail.connect(tbp);
      tbp.connect(tg);
      tg.connect(n.out);
    }

    _apply(p, t, gain) {
      const n = this.n;
      const rate = clamp(num(p.rate, 1), 0.3, 1.6);
      this._to(n.rotor.playbackRate, 'r', rate, t, 0.08, true);
      this._to(n.w1.frequency, 'w1', 2050 * (0.7 + 0.3 * rate), t, 0.08, true);
      this._to(n.w2.frequency, 'w2', 3075 * (0.7 + 0.3 * rate), t, 0.08, true);
      this._to(n.tail.frequency, 'tl', 92 * rate, t, 0.08, true);
      // Far away you mostly hear the thump; the whine carries less.
      const near = Math.pow(Math.min(1, gain), 0.6);
      this._to(n.whine.gain, 'wh', 0.05 * near, t, 0.08);
      this._to(n.hiss.gain, 'hs', 0.035 * near, t, 0.08);
      this._mix(p, t, gain * 1.0);
    }
  }

  // ------------------------------------------------------------------- jet
  /**
   * Jet engines: a low roar (brown noise), a turbine whine that rises with
   * thrust, and the afterburner's crackle. p = { gain, pan, thrust 0..1, burner 0..1 }.
   */
  class JetVoice extends Voice {
    _build(ctx, n, e) {
      const roar = this._loop(ctx, e.brown);
      n.rlp = this._filter(ctx, 'lowpass', 420, 0.8);
      n.roar = this._gain(ctx, 0.8);
      roar.connect(n.rlp);
      n.rlp.connect(n.roar);
      n.roar.connect(n.out);
      const hiss = this._loop(ctx, e.white);
      n.hbp = this._filter(ctx, 'bandpass', 1800, 0.6);
      n.hiss = this._gain(ctx, 0.12);
      hiss.connect(n.hbp);
      n.hbp.connect(n.hiss);
      n.hiss.connect(n.out);
      n.whine = this._gain(ctx, 0);
      n.w1 = this._osc(ctx, 'sine', 1400);
      n.w2 = this._osc(ctx, 'triangle', 2950);
      const w2g = this._gain(ctx, 0.3);
      n.w1.connect(n.whine);
      n.w2.connect(w2g);
      w2g.connect(n.whine);
      n.whine.connect(n.out);
      const burn = this._loop(ctx, e.brown);
      n.blp = this._filter(ctx, 'lowpass', 160, 1.2);
      n.burn = this._gain(ctx, 0);
      burn.connect(n.blp);
      n.blp.connect(n.burn);
      n.burn.connect(n.out);
    }

    _apply(p, t, gain) {
      const n = this.n;
      const th = clamp(num(p.thrust, 0.3), 0, 1);
      const burner = clamp(num(p.burner, 0), 0, 1);
      this._to(n.rlp.frequency, 'rf', 260 + th * 900, t, 0.15, true);
      this._to(n.roar.gain, 'rg', 0.45 + th * 0.7, t, 0.15);
      this._to(n.hbp.frequency, 'hf', 1100 + th * 2400, t, 0.15, true);
      this._to(n.w1.frequency, 'w1', 900 + th * 1400, t, 0.2, true);
      this._to(n.w2.frequency, 'w2', 2100 + th * 2600, t, 0.2, true);
      const near = Math.pow(Math.min(1, gain), 0.5);
      this._to(n.whine.gain, 'wh', (0.025 + th * 0.05) * near, t, 0.15);
      this._to(n.burn.gain, 'bg', burner * 1.4, t, 0.1);
      this._mix(p, t, gain);
    }
  }

  // ------------------------------------------------------------------ fire
  class FireVoice extends Voice {
    _build(ctx, n, e) {
      const a = assets(e);
      const roar = this._loop(ctx, e.brown);
      const rlp = this._filter(ctx, 'lowpass', 520, 0.4);
      const rg = this._gain(ctx, 0.7);
      roar.connect(rlp);
      rlp.connect(rg);
      rg.connect(n.out);
      // Flicker: two slow LFOs and a random wobble on the roar level.
      for (const [f, d] of [[0.83, 0.16], [2.1, 0.12]]) {
        const l = this._osc(ctx, 'sine', f * rand(0.85, 1.15));
        const lg = this._gain(ctx, d);
        l.connect(lg);
        lg.connect(rg.gain);
      }
      const wob = this._loop(ctx, a.wobble, 1.4);
      const wg = this._gain(ctx, 0.18);
      wob.connect(wg);
      wg.connect(rg.gain);
      const hs = this._loop(ctx, e.white);
      const hbp = this._filter(ctx, 'bandpass', 1100, 0.5);
      const hg = this._gain(ctx, 0.05);
      hs.connect(hbp);
      hbp.connect(hg);
      hg.connect(n.out);
      const cr = this._loop(ctx, a.crackle, rand(0.9, 1.1));
      const chp = this._filter(ctx, 'highpass', 900, 0.7);
      const cg = this._gain(ctx, 0.9);
      cr.connect(chp);
      chp.connect(cg);
      cg.connect(n.out);
    }

    _apply(p, t, gain) {
      this._mix(p, t, gain * 0.6);
    }
  }

  AE.createEngine = function (o) {
    return new EngineVoice(this, o || {});
  };
  AE.createSkid = function () {
    return new SkidVoice(this);
  };
  AE.createSiren = function (o) {
    return new SirenVoice(this, o || {});
  };
  AE.createHorn = function () {
    return new HornVoice(this);
  };
  AE.createHelicopter = function () {
    return new HeliVoice(this);
  };
  AE.createJet = function () {
    return new JetVoice(this);
  };
  AE.createFire = function () {
    return new FireVoice(this);
  };

  // ============================================================= one-shots
  function shotOut(e, pan, bus) {
    return e._pan(bus || e.sfx, clamp(num(pan, 0), -1, 1));
  }

  /** Noise burst on a looping buffer, so it can last as long as needed. */
  function nz(e, o) {
    const ctx = e.ctx;
    const t = o.t;
    const a = o.attack || 0.004;
    const h = o.hold || 0;
    const d = o.decay || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = o.buffer || (o.brown ? e.brown : e.white);
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.sweep || a + h + d));
    f.Q.value = o.q == null ? 1 : o.q;
    const g = ctx.createGain();
    const peak = Math.max(0.0002, o.peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (h) g.gain.setValueAtTime(peak, t + a + h);
    let end = t + a + h + d;
    if (o.tail) {
      g.gain.setTargetAtTime(0, t + a + h, d / 4.5);
      end += d * 0.3;
    } else g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest);
    src.start(t, Math.random() * src.buffer.duration * 0.7);
    src.stop(end + 0.05);
    return { src, f, g };
  }

  /** Detuned saw chord through a lowpass: brass stabs and synth pads for stings. */
  function chordStab(e, t, notes, dur, o) {
    const ctx = e.ctx;
    const att = o.attack || 0.012;
    const rel = o.release || 0.08;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q || 1.2;
    lp.frequency.setValueAtTime(o.cut0 || 500, t);
    lp.frequency.linearRampToValueAtTime(o.cut || 2500, t + (o.bloom || 0.05));
    lp.frequency.setTargetAtTime(o.cutEnd || 700, t + (o.bloom || 0.05), o.close || dur * 0.5);
    const g = ctx.createGain();
    const lvl = o.level || 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + att);
    g.gain.setTargetAtTime(lvl * (o.sustain == null ? 0.6 : o.sustain), t + att, 0.18);
    g.gain.setTargetAtTime(0, t + dur, rel);
    lp.connect(g);
    g.connect(o.dest);
    const stop = t + dur + rel * 7 + 0.05;
    for (const m of notes) {
      for (const det of o.detunes || [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = o.wave || 'sawtooth';
        osc.frequency.value = mtof(m);
        osc.detune.setValueAtTime(det, t);
        if (o.bend) osc.detune.linearRampToValueAtTime(det + o.bend, t + dur + rel * 3);
        osc.connect(lp);
        osc.start(t);
        osc.stop(stop);
      }
    }
    return g;
  }

  function glass(e, t, dest, k) {
    const count = 5 + Math.round(9 * k);
    for (let i = 0; i < count; i++) {
      const tt = t + Math.pow(Math.random(), 1.6) * (0.25 + 0.3 * k);
      e._tone({ t: tt, freq: rand(2800, 7400), peak: rand(0.015, 0.05) * (0.6 + 0.4 * k), attack: 0.001, decay: rand(0.04, 0.16), bus: dest });
    }
    nz(e, { t, dest, type: 'highpass', freq: 5500, q: 0.7, peak: 0.14 * (0.5 + k), attack: 0.002, decay: 0.12 });
    nz(e, { t: t + 0.05, dest, type: 'highpass', freq: 7000, q: 0.5, peak: 0.06, decay: 0.3 });
  }

  /** Stops one-shot spam (a car grinding along a wall calls these every frame). */
  AE._drvLimit = function (key, gap) {
    const t = this.ctx.currentTime;
    const map = this._drvTimes || (this._drvTimes = {});
    if (map[key] !== undefined && t - map[key] < gap) return false;
    map[key] = t;
    return true;
  };

  /** Metal crunch and a low thud; glass joins in at higher intensity. */
  AE.crash = function (intensity, pan) {
    if (!this.ready || !this._drvLimit('crash', 0.05)) return;
    const k = clamp(num(intensity, 0.5), 0, 1);
    const t = this.ctx.currentTime;
    const out = shotOut(this, pan);
    const lv = 0.3 + 0.7 * k;
    this._tone({ t, freq: 110, freqEnd: 42, peak: 0.8 * lv, attack: 0.004, decay: 0.25 + 0.25 * k, bus: out });
    nz(this, { t, dest: out, brown: true, type: 'lowpass', freq: 1000, freqEnd: 180, q: 0.7, peak: 1.6 * lv, attack: 0.004, decay: 0.25 + 0.35 * k });
    nz(this, { t, dest: out, type: 'bandpass', freq: 1900, freqEnd: 600, q: 0.6, peak: 0.75 * lv, attack: 0.005, decay: 0.15 + 0.25 * k });
    const grains = 5 + Math.round(8 * k);
    for (let i = 0; i < grains; i++) {
      nz(this, {
        t: t + Math.pow(Math.random(), 1.4) * (0.06 + 0.22 * k),
        dest: out, type: 'bandpass', freq: rand(700, 4000), q: rand(2, 8),
        peak: rand(0.35, 0.8) * lv, attack: 0.004, decay: rand(0.04, 0.12),
      });
    }
    const base = rand(260, 440);
    for (const r of [1, 1.47, 2.09, 2.76, 3.62]) {
      this._tone({ t, freq: base * r, freqEnd: base * r * 0.97, wave: 'triangle', peak: 0.06 * lv, decay: 0.2 + 0.4 * k * Math.random(), bus: out });
    }
    if (k > 0.45) glass(this, t + 0.015, out, (k - 0.45) / 0.55);
  };

  /** A short metal grind. */
  AE.scrape = function (intensity, pan) {
    if (!this.ready || !this._drvLimit('scrape', 0.07)) return;
    const k = clamp(num(intensity, 0.5), 0, 1);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = shotOut(this, pan);
    const a = assets(this);
    const dur = 0.16 + 0.28 * k;
    const lv = 0.35 + 0.65 * k;
    // Grinding noise whose centre jitters about at random.
    const g1 = nz(this, { t, dest: out, type: 'bandpass', freq: rand(2000, 2900), q: 3.5, peak: 0.65 * lv, attack: 0.02, hold: dur, decay: 0.1 });
    const jit = ctx.createBufferSource();
    jit.buffer = a.rough;
    jit.loop = true;
    jit.playbackRate.value = 1.6;
    const jg = ctx.createGain();
    jg.gain.value = 500;
    jit.connect(jg);
    jg.connect(g1.f.detune);
    jit.start(t, Math.random());
    jit.stop(t + dur + 0.2);
    // A rasping tone underneath.
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = rand(120, 180);
    const jg2 = ctx.createGain();
    jg2.gain.value = 300;
    jit.connect(jg2);
    jg2.connect(saw.detune);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 2;
    const sg = ctx.createGain();
    this._envelope(sg.gain, t, 0.02, 0.16 * lv, dur + 0.08);
    saw.connect(bp);
    bp.connect(sg);
    sg.connect(out);
    saw.start(t);
    saw.stop(t + dur + 0.2);
    this._tone({ t, freq: rand(2900, 3500), wave: 'triangle', peak: 0.02 * lv, attack: 0.03, decay: dur, bus: out });
  };

  /** A big boom, a long rumbling tail and falling debris. */
  AE.explosion = function (intensity, pan) {
    if (!this.ready || !this._drvLimit('boom', 0.08)) return;
    const k = clamp(num(intensity, 1), 0, 1);
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const out = shotOut(this, pan);
    const lv = 0.45 + 0.55 * k;
    const len = 0.6 + 0.4 * k;
    // The body goes through a soft clipper so the boom has harmonics small speakers can play.
    const body = ctx.createGain();
    body.gain.value = 1;
    const sh = ctx.createWaveShaper();
    sh.curve = curve(this, 1.6);
    const blp = ctx.createBiquadFilter();
    blp.type = 'lowpass';
    blp.frequency.value = 3500;
    body.connect(sh);
    sh.connect(blp);
    blp.connect(out);
    setTimeout(() => {
      try {
        body.disconnect();
        sh.disconnect();
        blp.disconnect();
      } catch (_) {
        /* gone */
      }
    }, 7000);
    this._tone({ t: t + 0.004, freq: 95, freqEnd: 30, peak: 0.9 * lv, attack: 0.014, decay: 1.2 * len, bus: body });
    this._tone({ t: t + 0.004, freq: 52, freqEnd: 24, peak: 0.7 * lv, attack: 0.02, decay: 1.8 * len, bus: body });
    nz(this, { t, dest: body, brown: true, type: 'lowpass', freq: 1600, freqEnd: 140, sweep: 1.4, q: 0.6, peak: 1.4 * lv, attack: 0.015, decay: 3.4 * len, tail: true });
    // The initial crack.
    nz(this, { t, dest: out, type: 'lowpass', freq: 7500, freqEnd: 900, q: 0.5, peak: 0.42 * lv, attack: 0.004, decay: 0.16 });
    nz(this, { t, dest: out, type: 'bandpass', freq: 650, freqEnd: 140, q: 0.6, peak: 0.5 * lv, attack: 0.008, decay: 1.6 * len, tail: true });
    // Rolling echoes off the buildings.
    for (const [d, p] of [[0.28, 0.55], [0.7, 0.35], [1.25, 0.22]]) {
      nz(this, { t: t + d * len, dest: out, brown: true, type: 'lowpass', freq: 420, q: 0.5, peak: p * 1.3 * lv, attack: 0.12, decay: 1.6 * len, tail: true });
    }
    // Debris: crackle and clinks falling for a couple of seconds.
    const bits = 14 + Math.round(22 * k);
    for (let i = 0; i < bits; i++) {
      const tt = t + 0.12 + Math.pow(Math.random(), 1.7) * 2.4 * len;
      if (Math.random() < 0.25) {
        this._tone({ t: tt, freq: rand(1800, 4800), wave: 'triangle', peak: rand(0.01, 0.03) * lv, attack: 0.001, decay: rand(0.04, 0.12), bus: out });
      } else {
        nz(this, { t: tt, dest: out, type: 'bandpass', freq: rand(1200, 5500), q: rand(1.5, 5), peak: rand(0.04, 0.16) * lv, attack: 0.001, decay: rand(0.01, 0.05) });
      }
    }
  };

  /** Door open (latch click) or close (solid thunk). */
  AE.carDoor = function (open, pan) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = shotOut(this, pan);
    if (open) {
      this._hit({ t, type: 'highpass', freq: 2600, q: 0.7, peak: 0.35, decay: 0.015, bus: out });
      this._hit({ t: t + 0.035, freq: 1500, q: 2, peak: 0.28, decay: 0.025, bus: out });
      this._tone({ t: t + 0.035, freq: 240, wave: 'triangle', peak: 0.1, decay: 0.07, bus: out });
      nz(this, { t: t + 0.07, dest: out, type: 'bandpass', freq: 800, q: 1.2, peak: 0.07, attack: 0.05, decay: 0.15 });
    } else {
      this._tone({ t, freq: 98, freqEnd: 52, peak: 0.55, decay: 0.16, bus: out });
      nz(this, { t, dest: out, brown: true, type: 'lowpass', freq: 750, freqEnd: 240, q: 0.7, peak: 0.9, attack: 0.003, decay: 0.13 });
      this._hit({ t: t + 0.012, freq: 2200, q: 1.5, peak: 0.2, decay: 0.02, bus: out });
      this._hit({ t: t + 0.03, freq: 820, q: 3, peak: 0.07, decay: 0.07, bus: out });
    }
  };

  /** A tiny mechanical blip for a gear change. */
  AE.gearShift = function (pan) {
    if (!this.ready || !this._drvLimit('gear', 0.08)) return;
    const t = this.ctx.currentTime;
    const out = shotOut(this, pan);
    this._hit({ t, type: 'lowpass', freq: 900, q: 0.8, peak: 0.35, decay: 0.035, bus: out });
    this._hit({ t: t + 0.005, freq: 2300, q: 3, peak: 0.16, decay: 0.018, bus: out });
    this._tone({ t, freq: 330, freqEnd: 200, wave: 'triangle', peak: 0.1, decay: 0.07, bus: out });
  };

  /** A pedestrian struck by a car. */
  AE.bodyHit = function (intensity, pan) {
    if (!this.ready || !this._drvLimit('body', 0.04)) return;
    const k = clamp(num(intensity, 0.5), 0, 1);
    const t = this.ctx.currentTime;
    const out = shotOut(this, pan);
    const lv = 0.4 + 0.6 * k;
    this._tone({ t, freq: 135, freqEnd: 55, peak: 0.8 * lv, attack: 0.004, decay: 0.18, bus: out });
    nz(this, { t, dest: out, brown: true, type: 'lowpass', freq: 650, q: 0.7, peak: 1.5 * lv, attack: 0.005, decay: 0.14 });
    this._hit({ t, freq: 950, q: 1, peak: 0.32 * lv, decay: 0.05, bus: out });
    if (k > 0.5) {
      nz(this, { t: t + 0.13, dest: out, brown: true, type: 'lowpass', freq: 500, q: 0.7, peak: 0.6 * lv, attack: 0.004, decay: 0.09 });
      this._hit({ t: t + 0.13, freq: 1400, q: 1.5, peak: 0.08 * lv, decay: 0.05, bus: out });
    }
  };

  /** A police-radio chirp and squelch burst (played before dispatch lines). */
  AE.radioSquelch = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this.ui;
    this._tone({ t, freq: 1180, wave: 'square', peak: 0.09, attack: 0.002, decay: 0.045, lowpass: 2600, bus: out });
    this._tone({ t: t + 0.055, freq: 1580, wave: 'square', peak: 0.08, attack: 0.002, decay: 0.05, lowpass: 2600, bus: out });
    nz(this, { t: t + 0.1, dest: out, type: 'bandpass', freq: 1900, q: 0.9, peak: 0.28, attack: 0.004, hold: 0.12, decay: 0.12 });
    nz(this, { t: t + 0.1, dest: out, buffer: assets(this).crackle, rate: 2.5, type: 'bandpass', freq: 2400, q: 0.8, peak: 0.45, attack: 0.004, hold: 0.14, decay: 0.08 });
  };

  /** Busted: i – VI – V in C minor with timpani, about 2 s. */
  AE.bustedSting = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.02;
    const dest = this.musicBus;
    const brass = { dest, level: 0.05, cut: 2600, cutEnd: 900, detunes: [-9, 0, 9] };
    const boom = (tt, p) => {
      this._tone({ t: tt, freq: 96, freqEnd: 52, peak: p, decay: 0.55, bus: dest });
      nz(this, { t: tt, dest, brown: true, type: 'lowpass', freq: 600, q: 0.7, peak: p * 1.2, attack: 0.003, decay: 0.35 });
    };
    chordStab(this, t, [48, 55, 60, 63], 0.14, brass);
    boom(t, 0.45);
    chordStab(this, t + 0.2, [48, 55, 60, 63], 0.14, brass);
    boom(t + 0.2, 0.35);
    chordStab(this, t + 0.46, [44, 56, 60, 63], 0.3, brass);
    chordStab(this, t + 0.86, [43, 55, 59, 62], 1.1, Object.assign({}, brass, { level: 0.055, cutEnd: 450, close: 0.7, release: 0.25 }));
    boom(t + 0.86, 0.6);
    nz(this, { t: t + 0.86, dest, type: 'highpass', freq: 5000, q: 0.5, peak: 0.08, attack: 0.004, decay: 1.4, tail: true });
  };

  /** Wasted: a heavy hit and an A-minor pad that sags in pitch as it fades. */
  AE.wastedSting = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.02;
    const dest = this.musicBus;
    this._tone({ t, freq: 70, freqEnd: 28, peak: 0.7, decay: 1.5, bus: dest });
    nz(this, { t, dest, brown: true, type: 'lowpass', freq: 900, freqEnd: 150, q: 0.6, peak: 1.0, attack: 0.004, decay: 1.2, tail: true });
    nz(this, { t, dest, type: 'highpass', freq: 4500, q: 0.5, peak: 0.07, attack: 0.003, decay: 1.6, tail: true });
    chordStab(this, t, [45, 52, 57, 60, 64, 71], 1.7, { dest, level: 0.032, cut0: 2800, cut: 3000, cutEnd: 280, close: 0.8, attack: 0.02, sustain: 0.85, release: 0.3, bend: -220, detunes: [-10, 10] });
    this._tone({ t, freq: 880, peak: 0.06, attack: 0.003, decay: 1.8, bus: dest });
    this._tone({ t, freq: 880 * 2.76, peak: 0.015, attack: 0.003, decay: 0.9, bus: dest });
  };

  /** Rising stinger when the wanted level goes up; higher levels sit higher. */
  AE.heatUp = function (level) {
    if (!this.ready || !this._drvLimit('heat', 0.4)) return;
    const lv = clamp(Math.round(num(level, 1)), 1, 6);
    const t = this.ctx.currentTime + 0.01;
    const dest = this.ui;
    const up = (lv - 1) * 2;
    nz(this, { t, dest, type: 'bandpass', freq: 380, freqEnd: 3000 + lv * 300, sweep: 0.55, q: 1.6, peak: 0.12, attack: 0.5, decay: 0.12 });
    const brass = { dest, level: 0.04, cut: 2200, cutEnd: 900, detunes: [-7, 7] };
    [0, 1, 2].forEach((i) => chordStab(this, t + i * 0.14, [52 + up + i, 59 + up + i], 0.1, brass));
    chordStab(this, t + 0.5, [40 + up, 52 + up, 58 + up, 65 + up], 0.45, Object.assign({}, brass, { level: 0.045, release: 0.15 }));
    this._tone({ t: t + 0.5, freq: 110, freqEnd: 50, peak: 0.4, decay: 0.35, bus: dest });
    nz(this, { t: t + 0.5, dest, type: 'highpass', freq: 5000, q: 0.5, peak: 0.05, decay: 0.5, tail: true });
  };

  /** Mission start: a bright F major 9 arpeggio over a soft pad. */
  AE.missionStart = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    const dest = this.ui;
    [65, 69, 72, 76, 79].forEach((m, i) => {
      chordStab(this, t + i * 0.075, [m], 0.12, { dest, level: 0.085, cut0: 1500, cut: 4000, cutEnd: 1500, detunes: [-7, 7], release: 0.12 });
    });
    chordStab(this, t, [53, 60, 64, 69], 0.8, { dest, level: 0.032, cut0: 600, cut: 2200, bloom: 0.3, cutEnd: 900, attack: 0.08, sustain: 0.9, release: 0.25, detunes: [-10, 10] });
    this._tone({ t, freq: 120, freqEnd: 50, peak: 0.4, decay: 0.25, bus: dest });
    nz(this, { t, dest, type: 'highpass', freq: 6000, q: 0.5, peak: 0.08, attack: 0.3, decay: 0.4 });
  };

  /** Mission passed: bVI – bVII – I in C with a rising top line and a gated snare. */
  AE.missionPassed = function () {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    const dest = this.ui;
    const pad = { dest, level: 0.03, cut0: 900, cut: 3200, cutEnd: 1600, detunes: [-9, 9], release: 0.1 };
    chordStab(this, t, [56, 60, 63, 72], 0.26, pad);
    chordStab(this, t + 0.28, [58, 62, 65, 74], 0.26, pad);
    chordStab(this, t + 0.56, [60, 64, 67, 76], 1.3, Object.assign({}, pad, { level: 0.035, cutEnd: 1200, close: 0.9, sustain: 0.8, release: 0.3 }));
    chordStab(this, t, [44], 0.26, { dest, level: 0.08, cut: 900, cutEnd: 300, detunes: [0] });
    chordStab(this, t + 0.28, [46], 0.26, { dest, level: 0.08, cut: 900, cutEnd: 300, detunes: [0] });
    chordStab(this, t + 0.56, [36], 1.2, { dest, level: 0.09, cut: 900, cutEnd: 300, detunes: [0], release: 0.25 });
    [[0, 150], [0.28, 150], [0.56, 170]].forEach(([d, f]) => this._tone({ t: t + d, freq: f, freqEnd: 45, peak: 0.35, decay: 0.22, bus: dest }));
    nz(this, { t: t + 0.56, dest, type: 'highpass', freq: 1400, q: 0.6, peak: 0.16, attack: 0.002, hold: 0.22, decay: 0.05 });
    [84, 88, 91, 96].forEach((m, i) => this._tone({ t: t + 0.62 + i * 0.07, freq: mtof(m), peak: 0.03, decay: 0.5, bus: dest }));
    chordStab(this, t + 1.0, [79], 0.3, { dest, level: 0.04, cut: 3500, cutEnd: 1800, detunes: [-6, 6] });
    chordStab(this, t + 1.3, [84], 0.8, { dest, level: 0.04, cut: 3500, cutEnd: 1400, detunes: [-6, 6], release: 0.25 });
  };

  /** A quick pass-by whoosh that swings across the stereo field. */
  AE.nearMiss = function (pan) {
    if (!this.ready || !this._drvLimit('miss', 0.15)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const p0 = clamp(num(pan, 0), -1, 1);
    let out = this.sfx;
    if (ctx.createStereoPanner) {
      const sp = ctx.createStereoPanner();
      sp.pan.setValueAtTime(p0, t);
      sp.pan.linearRampToValueAtTime(clamp(-p0 * 0.6, -1, 1), t + 0.35);
      sp.connect(this.sfx);
      out = sp;
    }
    nz(this, { t, dest: out, type: 'bandpass', freq: 2600, freqEnd: 480, q: 1.3, peak: 0.5, attack: 0.07, decay: 0.28 });
    nz(this, { t, dest: out, brown: true, type: 'lowpass', freq: 450, q: 0.7, peak: 0.7, attack: 0.05, decay: 0.25 });
  };

  /** Cash register: drawer clunk and a bell. */
  AE.cash = function () {
    if (!this.ready || !this._drvLimit('cash', 0.05)) return;
    const t = this.ctx.currentTime;
    const dest = this.ui;
    nz(this, { t, dest, brown: true, type: 'lowpass', freq: 900, q: 0.7, peak: 0.55, attack: 0.002, decay: 0.06 });
    this._hit({ t, type: 'highpass', freq: 3000, q: 0.7, peak: 0.16, decay: 0.015, bus: dest });
    this._tone({ t: t + 0.07, freq: 1318.5, wave: 'triangle', peak: 0.19, decay: 0.5, bus: dest });
    this._tone({ t: t + 0.07, freq: 3951, peak: 0.03, decay: 0.3, bus: dest });
    this._tone({ t: t + 0.15, freq: 1975.5, wave: 'triangle', peak: 0.14, decay: 0.6, bus: dest });
    this._tone({ t: t + 0.15, freq: 2637, peak: 0.05, decay: 0.45, bus: dest });
  };

  /** Mission failed: a falling minor line over a C minor chord that closes down. */
  AE.missionFailedSting = function () {
    if (!this.ready || !this._drvLimit('mfail', 0.5)) return;
    const t = this.ctx.currentTime + 0.01;
    const dest = this.ui;
    chordStab(this, t, [48, 55, 60, 63], 1.3, { dest, level: 0.03, cut0: 2400, cut: 2600, cutEnd: 380, close: 0.6, attack: 0.01, sustain: 0.8, release: 0.3, detunes: [-9, 9] });
    [[67, 0, 0.2], [63, 0.24, 0.2], [60, 0.48, 0.9]].forEach(([m, d, len], i) => {
      chordStab(this, t + d, [m + 12], len, { dest, level: 0.05, cut0: 1800, cut: 3200, cutEnd: 900, detunes: [-6, 6], release: 0.2, bend: i === 2 ? -120 : 0 });
    });
    this._tone({ t, freq: 90, freqEnd: 45, peak: 0.3, decay: 0.5, bus: dest });
    this._tone({ t: t + 0.48, freq: 80, freqEnd: 40, peak: 0.35, decay: 0.7, bus: dest });
  };

  const MOODS = {
    // A minor (sad) and D major (hope), with a slow top line wandering over chord tones.
    sad: { notes: [45, 52, 57, 60, 64], top: [71, 72, 76, 69, 72, 67], cut: 850 },
    hope: { notes: [50, 57, 62, 66, 69], top: [76, 78, 81, 74, 78, 73], cut: 1400 },
  };

  /**
   * A quiet ambient pad for story scenes: moodPad('sad'), moodPad('hope'),
   * moodPad(null) to fade it out. Changing mood crossfades.
   */
  AE.moodPad = function (mood) {
    if (!this.ready) return;
    const want = MOODS[mood] ? mood : null;
    const cur = this._moodPad;
    if (cur && cur.mood === want) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (cur) {
      this._moodPad = null;
      clearInterval(cur.timer);
      cur.out.gain.cancelScheduledValues(t);
      cur.out.gain.setValueAtTime(cur.out.gain.value, t);
      cur.out.gain.linearRampToValueAtTime(0, t + 2.5);
      for (const s of cur.srcs) s.stop(t + 2.7);
      setTimeout(() => {
        for (const n of cur.nodes) {
          try {
            n.disconnect();
          } catch (_) {
            /* gone */
          }
        }
      }, 3200);
    }
    if (!want) return;
    const M = MOODS[want];
    const nodes = [];
    const srcs = [];
    const node = (x) => {
      nodes.push(x);
      return x;
    };
    const osc = (type, f, det) => {
      const o = node(ctx.createOscillator());
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det || 0;
      srcs.push(o);
      return o;
    };
    const gain = (v) => {
      const g = node(ctx.createGain());
      g.gain.value = v;
      return g;
    };
    const out = gain(0);
    out.connect(this.musicBus);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 3.5);
    const lp = node(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = M.cut;
    lp.Q.value = 0.5;
    lp.connect(out);
    // The filter drifts open and closed over about twenty seconds.
    const fl = osc('sine', 0.047);
    const flg = gain(M.cut * 0.35);
    fl.connect(flg);
    flg.connect(lp.frequency);
    // Each chord tone breathes at its own slow rate.
    M.notes.forEach((m, i) => {
      const vg = gain(0.022);
      vg.connect(lp);
      for (const [type, det, lvl] of [['triangle', -6, 1], ['sawtooth', 7, 0.35]]) {
        const o = osc(type, mtof(m), det);
        const g = gain(lvl);
        o.connect(g);
        g.connect(vg);
      }
      const l = osc('sine', 0.06 + i * 0.017);
      const lg = gain(0.012);
      l.connect(lg);
      lg.connect(vg.gain);
    });
    // A soft top line that glides to a new chord tone every few seconds.
    const top = osc('triangle', mtof(M.top[0]));
    const tg = gain(0.014);
    top.connect(tg);
    tg.connect(out);
    const air = node(ctx.createBufferSource());
    air.buffer = this.white;
    air.loop = true;
    srcs.push(air);
    const abp = node(ctx.createBiquadFilter());
    abp.type = 'bandpass';
    abp.frequency.value = 3200;
    abp.Q.value = 0.4;
    const ag = gain(0.006);
    air.connect(abp);
    abp.connect(ag);
    ag.connect(out);
    for (const s of srcs) s.start(t);
    const state = { mood: want, out, nodes, srcs, step: 0, timer: null };
    state.timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      state.step = (state.step + 1) % M.top.length;
      top.frequency.setTargetAtTime(mtof(M.top[state.step]), this.ctx.currentTime, 0.6);
    }, 5200);
    this._moodPad = state;
  };

  // ================================================================= radio
  // ------------------------------------------------------------ theory
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  };
  // Chord progressions as scale degrees (0 = tonic), one chord per bar.
  // Diminished and augmented triads are left out on purpose.
  const PROGS = {
    minor: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 5, 3, 4], [5, 6, 0, 0], [0, 3, 5, 6], [0, 2, 6, 5], [0, 3, 6, 2]],
    dorian: [[0, 3, 0, 3], [0, 6, 3, 3], [0, 2, 3, 6], [0, 3, 6, 0], [0, 1, 2, 1]],
    major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 5], [0, 3, 5, 4], [5, 3, 0, 4]],
    lydian: [[0, 1, 0, 1], [0, 1, 5, 4], [0, 1, 4, 5]],
    phrygian: [[0, 1, 0, 1], [0, 1, 5, 1], [0, 5, 1, 0], [0, 6, 1, 0]],
    harmonicMinor: [[0, 5, 3, 4], [0, 0, 5, 4], [0, 3, 0, 4], [0, 5, 0, 4], [0, 3, 5, 4]],
  };

  function degMidi(tonic, scale, deg) {
    const o = Math.floor(deg / 7);
    return tonic + 12 * o + scale[deg - o * 7];
  }

  function chordPcs(tonic, scale, root, size) {
    const out = [];
    for (let k = 0; k < size; k++) out.push(mod(degMidi(tonic, scale, root + 2 * k), 12));
    return out;
  }

  /** Close voicing of the chord that moves least from the previous one. */
  function voiceLead(prev, pcs, lo, hi) {
    const n = pcs.length;
    const center = (lo + hi) / 2;
    let best = null;
    let bestCost = Infinity;
    for (let inv = 0; inv < n; inv++) {
      for (let base = lo; base <= hi; base++) {
        if (mod(base, 12) !== pcs[inv]) continue;
        const v = [base];
        for (let k = 1; k < n; k++) {
          const pc = pcs[(inv + k) % n];
          let m = v[k - 1] + 1;
          while (mod(m, 12) !== pc) m++;
          v.push(m);
        }
        if (v[n - 1] > hi) continue;
        const mid = (v[0] + v[n - 1]) / 2;
        let cost = 0.25 * Math.abs(mid - center);
        // Semitone clusters (a major 7th tucked under its root) sound muddy in a pad.
        for (let k = 1; k < n; k++) if (v[k] - v[k - 1] === 1) cost += 4;
        if (prev && prev.length === n) for (let k = 0; k < n; k++) cost += Math.abs(v[k] - prev[k]);
        if (cost < bestCost) {
          bestCost = cost;
          best = v;
        }
      }
    }
    return best && unCluster(best, lo, hi);
  }

  /** Move one note of a semitone pair by an octave (maj7 chords end up in root position). */
  function unCluster(v, lo, hi) {
    for (let k = 1; k < v.length; k++) {
      if (v[k] - v[k - 1] !== 1) continue;
      if (v[k - 1] + 12 <= hi + 2) v[k - 1] += 12;
      else if (v[k] - 12 >= lo - 2) v[k] -= 12;
      v.sort((a, b) => a - b);
      break;
    }
    return v;
  }

  const isChordTone = (deg, root) => {
    const r = mod(deg - root, 7);
    return r === 0 || r === 2 || r === 4;
  };

  function snapToChord(deg, root, prefer) {
    if (isChordTone(deg, root)) return deg;
    const first = prefer >= 0 ? 1 : -1;
    if (isChordTone(deg + first, root)) return deg + first;
    return deg - first;
  }

  /** The chord tone (0 root, 1 third, 2 fifth) of `root` nearest to `near`. */
  function chordToneNear(near, root, which) {
    let d = root + 2 * which;
    while (d - near > 3) d -= 7;
    while (near - d > 3) d += 7;
    return d;
  }

  // ------------------------------------------------------------ styles
  const CELLS = {
    synthV: [[[0, 3], [4, 2], [6, 2], [8, 6]], [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 4], [12, 4]], [[2, 2], [4, 2], [6, 4], [12, 4]], [[0, 4], [6, 2], [8, 2], [10, 6]]],
    synthC: [[[0, 4], [4, 4], [8, 8]], [[0, 6], [6, 2], [8, 8]], [[0, 3], [3, 3], [6, 2], [8, 8]], [[0, 8], [8, 4], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]]],
    houseC: [[[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]], [[2, 2], [6, 2], [8, 1], [10, 2], [14, 2]], [[0, 1], [3, 1], [6, 2], [9, 1], [12, 3]], [[0, 2], [3, 2], [6, 4], [12, 2], [14, 2]]],
    darkV: [[[0, 4], [6, 2], [8, 6]], [[0, 2], [2, 2], [4, 4], [12, 4]], [[0, 3], [3, 3], [6, 6], [14, 2]], [[0, 6], [8, 3], [11, 5]]],
    darkC: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]], [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 4], [12, 2], [14, 2]]],
  };

  const STYLES = {
    synthwave: {
      bpm: [96, 104], keyLo: 33, modes: [['minor', 4], ['dorian', 2], ['major', 2], ['lydian', 1]],
      sevenths: 0.6, padLo: 55, padHi: 74, melTonic: 60, trim: 1.2,
      motifs: { v: ['synthV', 2], c: ['synthC', 4] }, mel: { verse: 'v', chorus: 'c', breakdown: 'v' },
      pads: { intro: 1, verse: 1, chorus: 1, breakdown: 1, outro: 1 },
    },
    house: {
      bpm: [122, 126], keyLo: 33, modes: [['minor', 3], ['dorian', 3], ['major', 1]],
      sevenths: 0.9, padLo: 57, padHi: 76, melTonic: 64, trim: 0.95,
      motifs: { c: ['houseC', 4] }, mel: { chorus: 'c', breakdown: 'c' },
      pads: { intro: 1, chorus: 1, breakdown: 1 },
    },
    dark: {
      bpm: [138, 142], keyLo: 28, modes: [['minor', 3], ['harmonicMinor', 3], ['phrygian', 2]],
      sevenths: 0, padLo: 50, padHi: 67, melTonic: 64, trim: 0.74,
      motifs: { v: ['darkV', 2], c: ['darkC', 4] }, mel: { intro: 'v', verse: 'v', chorus: 'c', breakdown: 'v' },
      pads: { intro: 1, chorus: 1, breakdown: 1, outro: 1 },
    },
  };

  const WORDS = {
    synthwave: {
      adj: ['Neon', 'Midnight', 'Chrome', 'Electric', 'Velvet', 'Crimson', 'Golden', 'Endless', 'Silent', 'Violet', 'Satin', 'Burning', 'Distant', 'Cobalt', 'Pastel', 'Starlit', 'Coral', 'Magnetic', 'Faded', 'Lunar', 'Glass', 'Hologram', 'Tangerine', 'Slow'],
      noun: ['Tide', 'Highway', 'Horizon', 'Skyline', 'Boulevard', 'Heartbeat', 'Signal', 'Mirage', 'Motel', 'Palms', 'Coastline', 'Overdrive', 'Arcade', 'Memory', 'Runner', 'Lights', 'Echo', 'Cruise', 'Satellite', 'Riviera', 'Getaway', 'Pier', 'Postcard', 'Freeway', 'Lagoon'],
      tag: ["'86", "'89", '(Night Drive)', '(Extended)', 'Forever', 'Again', 'Tonight'],
      plural: ['Kerbsiders', 'Overpasses', 'Tailfins', 'Moonlighters', 'Rearviews', 'Headlamps', 'Nightcallers', 'Weekenders', 'Slipstreams', 'Boardwalkers'],
      a: ['Laser', 'Vapor', 'Palm', 'Coast', 'Retro', 'Delta', 'Chroma', 'Turbo', 'Cassette', 'Velour', 'Marina', 'Aurora', 'Pixel'],
      b: ['Youth', 'Machine', 'Club', 'Division', 'Collective', 'Kids', 'Riders', 'Society', 'Parade', 'Hearts', 'Ghosts', 'Motors'],
      first: ['Dana', 'Marisol', 'Vince', 'Lana', 'Rico', 'Jade', 'Nico', 'Sasha', 'Remy', 'Cleo', 'Dex', 'Luca'],
      last: ['Voltage', 'Starling', 'Vance', 'Solaris', 'Montaine', 'Hart', 'Delgado', 'Neville', 'Quinn', 'Bright'],
    },
    house: {
      adj: ['Basement', 'Warehouse', 'Velvet', 'Strobe', 'Deep', 'Liquid', 'Afterhours', 'Rooftop', 'Sunday', 'Late', 'Tidal', 'Mirror', 'Open', 'Harbour', 'Second', 'Neon'],
      noun: ['Pressure', 'Frequency', 'Motion', 'Sunrise', 'Heat', 'Theory', 'Floor', 'Signal', 'Groove', 'Pulse', 'Voltage', 'Circuit', 'Rush', 'Glow', 'Tempo', 'Current'],
      tag: ['(Club Mix)', '(Dub)', '(Vocal Mix)', '(Edit)', 'Part II', '(Night Version)'],
      plural: ['Low Ends', 'Night Owls', 'Late Shifts', 'Key Changes', 'Loop Theory'],
      a: ['Kaleido', 'Prism', 'Mono', 'Kestrel', 'Aqua', 'Soma', 'Orbit', 'Lumen', 'Tessera', 'Halcyon'],
      b: ['Unit', 'Sound System', 'Theory', 'Collective', 'Project', 'Society', 'Audio', 'Connection'],
      first: ['DJ Marlo', 'DJ Kestrel', 'Nadia', 'Theo', 'Imani', 'Jules', 'Ravi', 'Selah', 'Omar', 'Keiko'],
      last: ['Sol', 'Rivers', 'Okafor', 'Blue', 'Lindqvist', 'Mercer', 'Sato', 'Ferreira', 'Vale'],
    },
    dark: {
      adj: ['Cold', 'Heavy', 'Low', 'Concrete', 'Iron', 'Rusted', 'Late', 'Grey', 'Salt', 'Midnight', 'Dirty', 'Quiet', 'Ghost', 'Black', 'Long', 'Slow'],
      noun: ['Harbor', 'Water', 'Tide', 'Shift', 'Bricks', 'Anchor', 'Container', 'Crane', 'Smoke', 'Pier', 'Current', 'Fog', 'Ledger', 'Signal', 'Engines', 'Dockside', 'Streets'],
      tag: ['(Interlude)', 'Pt. 2', 'Freestyle', '(Remix)', 'Again'],
      plural: ['Dockhands', 'Night Crew', 'Cinderblocks', 'Deckhands', 'Tugboats'],
      a: ['Kid', 'Young', 'Big', 'Lil', 'MC'],
      b: ['Harbor', 'Anchor', 'Rook', 'Ledger', 'Cinder', 'Tollbooth', 'Mooring', 'Ballast', 'Foghorn'],
      first: ['Rook', 'Dante', 'Mara', 'Kai', 'Tess', 'Omari', 'Vero', 'Silas', 'Juno'],
      last: ['Delgado', 'Stone', 'Okoro', 'Vex', 'Marlowe', 'Reyes', 'Crane', 'Ashby'],
    },
  };

  function makeName(rng, style) {
    const W = WORDS[style];
    const r = rng.next();
    let title;
    if (r < 0.62) title = rng.pick(W.adj) + ' ' + rng.pick(W.noun);
    else if (r < 0.82) title = rng.pick(W.noun) + ' ' + rng.pick(W.tag);
    else title = rng.pick(W.adj) + ' ' + rng.pick(W.noun) + ' ' + rng.pick(W.tag);
    const q = rng.next();
    let artist;
    if (q < 0.3) artist = 'The ' + rng.pick(W.plural);
    else if (q < 0.65) artist = rng.pick(W.a) + ' ' + rng.pick(W.b);
    else artist = rng.pick(W.first) + ' ' + rng.pick(W.last);
    return { title, artist };
  }

  /** Next contour offset: stepwise, pulled back towards the motif's first note. */
  function walk(rng, off, home) {
    const up = off - home;
    const w = up >= 2 ? [1, 3, 4, 1, 1, 0.4, 0] : up <= -1 ? [0, 0.4, 1, 1, 4, 3, 1] : [0.4, 1.5, 3, 1, 3, 1.5, 0.6];
    const step = rng.weighted([-3, -2, -1, 0, 1, 2, 3], w);
    return clamp(off + step, home - 2, home + 3);
  }

  /** A two-bar motif: rhythm cells plus scale-degree offsets from a centre. */
  function makeMotif(rng, cells, center, above) {
    const c0 = rng.pick(cells);
    const same = rng.chance(0.55);
    const c1 = same ? c0 : rng.pick(cells);
    // A chorus sits a few scale steps above the verse's home note.
    const home = above != null ? above + rng.pick([2, 3, 4]) - center : rng.pick([0, 2, 4]) - (center > 3 ? 2 : 0);
    let off = home;
    const bar0 = [];
    for (const [s, d] of c0) {
      bar0.push({ s, d, off });
      off = walk(rng, off, home);
    }
    const bar1 = [];
    if (same) {
      // Repeat the rhythm as a sequence a step or two away.
      const shift = rng.pick([-1, -2, 1, 2, -1]);
      c1.forEach(([s, d], i) => bar1.push({ s, d, off: bar0[i].off + shift }));
    } else {
      for (const [s, d] of c1) {
        bar1.push({ s, d, off });
        off = walk(rng, off, home);
      }
    }
    return { bars: [bar0, bar1], center, home, lift: rng.pick([1, 2]), half: rng.pick([1, 2]) };
  }

  /** Lay a motif over one bar of the song, as phrase bar `i` of 8. */
  function realize(motif, b, i, tonic, scale, state) {
    const pb = i % 8;
    const half = pb % 2;
    const variant = (pb >> 1) & 3;
    const lift = variant === 2 ? motif.lift : 0;
    let notes = motif.bars[half].map((n) => ({ s: n.s, d: n.d, off: n.off + lift }));
    if (half === 1 && (variant === 1 || variant === 3)) {
      // Cadence: keep the first half, then land on a long chord tone.
      notes = notes.filter((n) => n.s < 8);
      for (const n of notes) n.d = Math.min(n.d, 8 - n.s);
      notes.push({ s: 8, d: variant === 3 ? 8 : 6, target: variant === 3 ? 0 : motif.half });
    }
    const out = [];
    for (const n of notes) {
      let deg;
      if (n.target !== undefined) deg = chordToneNear(state.prev == null ? motif.center : state.prev, b.deg, n.target);
      else {
        deg = motif.center + n.off;
        if (n.s % 4 === 0 || n.d >= 3) deg = snapToChord(deg, b.deg, state.prev == null ? 0 : deg - state.prev);
      }
      state.prev = deg;
      out.push({ s: n.s, d: n.d, m: degMidi(tonic, scale, deg), v: n.s % 4 === 0 ? 1 : 0.82 });
    }
    return out;
  }

  function buildSections(rng, barDur, gap) {
    const minBars = Math.ceil((80 - gap) / barDur);
    const maxBars = Math.floor((120 - gap) / barDur);
    const target = clamp(Math.round(rng.range(86, 112) / barDur), minBars, maxBars);
    const s = [['intro', rng.chance(0.5) ? 8 : 4], ['verse', 8], ['chorus', 8], ['breakdown', rng.chance(0.5) ? 8 : 4], ['chorus', 8], ['outro', 4]];
    const total = () => s.reduce((a, x) => a + x[1], 0);
    const find = (name) => s.find((x) => x[0] === name);
    for (let guard = 0; guard < 12 && total() + 4 <= target; guard++) {
      if (s.filter((x) => x[0] === 'verse').length < 2) s.splice(3, 0, ['verse', 8]);
      else if (s[0][1] < 8) s[0][1] = 8;
      else if (find('breakdown')[1] < 8) find('breakdown')[1] = 8;
      else if (s.filter((x) => x[0] === 'chorus').length < 3) s.splice(s.length - 1, 0, ['chorus', 8]);
      else if (s[s.length - 1][1] < 8) s[s.length - 1][1] = 8;
      else break;
    }
    for (let guard = 0; guard < 12 && total() > maxBars; guard++) {
      if (s[s.length - 1][1] > 4) s[s.length - 1][1] = 4;
      else if (find('breakdown')[1] > 4) find('breakdown')[1] = 4;
      else if (s[0][1] > 4) s[0][1] = 4;
      else if (s.filter((x) => x[0] === 'chorus').length > 2) s.splice(s.map((x) => x[0]).lastIndexOf('chorus'), 1);
      else break;
    }
    return s;
  }

  const SYNTH_BASS = ['oct8', 'drive16', 'arp8', 'gallop'];
  const HOUSE_BASS = {
    offbeat: [[2, 0, 1.6], [6, 0, 1.6], [10, 0, 1.6], [14, 0, 1.6], [15, 3, 0.8]],
    rolling: [[2, 0, 0.9], [3, 0, 0.9], [6, 0, 0.9], [7, 3, 0.9], [10, 0, 0.9], [11, 0, 0.9], [14, 2, 0.9], [15, 3, 0.9]],
    octjump: [[2, 0, 0.9], [3, 3, 0.9], [6, 0, 0.9], [7, 3, 0.9], [10, 0, 0.9], [11, 3, 0.9], [14, 0, 0.9], [15, 3, 0.9]],
    push: [[2, 0, 1.5], [5, 0, 0.9], [6, 3, 1.5], [10, 0, 1.5], [13, 2, 0.9], [14, 3, 1.5]],
  };
  const HOUSE_STABS = [[2, 5, 10, 13], [3, 6, 11, 14], [2, 6, 10, 14], [3, 7, 10, 14], [0, 3, 6, 10], [3, 6, 10, 12]];
  const DARK_KICKS = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 10, 13], [0, 6, 10, 14], [0, 3, 7, 10]];
  const GAP = 1.2; // seconds of silence between songs

  /** Compose a whole song from a seed. Everything is in key and precomputed. */
  function makeSong(style, seed) {
    const S = STYLES[style];
    const rng = new VH.RNG(seed >>> 0);
    const bpm = rng.int(S.bpm[0], S.bpm[1]);
    const six = 60 / bpm / 4;
    const barDur = six * 16;
    const mode = rng.weighted(S.modes.map((m) => m[0]), S.modes.map((m) => m[1]));
    const scale = SCALES[mode];
    const key = S.keyLo + rng.int(0, 11);
    const progs = PROGS[mode];
    const verse = rng.pick(progs);
    const others = progs.filter((p) => p !== verse);
    const chorus = rng.chance(0.35) || !others.length ? verse : rng.pick(others);
    const size = rng.chance(S.sevenths) ? 4 : 3;
    const sections = buildSections(rng, barDur, GAP);

    const bars = [];
    sections.forEach(([name, len], si) => {
      for (let i = 0; i < len; i++) {
        let deg;
        if (name === 'chorus') deg = chorus[i % chorus.length];
        else if (name === 'breakdown') deg = verse[Math.floor(i / 2) % verse.length];
        else deg = verse[i % verse.length];
        bars.push({ sec: name, si, i, n: len, deg, fill: i === len - 1 && si < sections.length - 1, padBars: 1 });
      }
    });
    bars[bars.length - 1].deg = 0; // always end on the tonic

    let prevPad = null;
    const melTonic = S.melTonic + mod(key - S.melTonic + 5, 12) - 5;
    for (let j = 0; j < bars.length; j++) {
      const b = bars[j];
      const p = bars[j - 1];
      if (p && p.padBars === 1 && p.deg === b.deg && p.si === b.si) {
        p.padBars = 2;
        b.padBars = 0;
      }
      b.pad = voiceLead(prevPad, chordPcs(key, scale, b.deg, size), S.padLo, S.padHi);
      prevPad = b.pad;
      let root = key + scale[b.deg];
      if (root > S.keyLo + 11) root -= 12;
      const iv = (k) => degMidi(key, scale, b.deg + k) - degMidi(key, scale, b.deg);
      b.bass = [root, root + iv(2), root + iv(4), root + 12];
    }

    const motifs = {};
    for (const k of Object.keys(S.motifs)) {
      const v = motifs.v;
      motifs[k] = makeMotif(rng, CELLS[S.motifs[k][0]], S.motifs[k][1], k === 'c' && v ? v.center + v.home : null);
    }
    const state = { prev: null };
    for (const b of bars) {
      const which = S.mel[b.sec];
      if (!which) {
        state.prev = null;
        continue;
      }
      b.mel = realize(motifs[which], b, b.i, melTonic, scale, state);
    }
    // Keep the tune in a comfortable register: move all of it by an octave
    // if it strays, and only fold single notes as a last resort.
    let lo = 999;
    let hi = -999;
    for (const b of bars) for (const ev of b.mel || []) {
      lo = Math.min(lo, ev.m);
      hi = Math.max(hi, ev.m);
    }
    const shift = hi > 86 && lo - 12 >= 48 ? -12 : lo < 50 && hi + 12 <= 88 ? 12 : 0;
    for (const b of bars) {
      if (!b.mel) continue;
      b.melAt = [];
      for (const ev of b.mel) {
        ev.m += shift;
        if (ev.m > 88) ev.m -= 12;
        else if (ev.m < 48) ev.m += 12;
        b.melAt[ev.s] = ev;
      }
    }

    const pat = { swing: 0 };
    if (style === 'synthwave') {
      pat.kickX = rng.pick([[], [10], [6], [14], []]);
      pat.hat16 = rng.chance(0.6);
      pat.bass = rng.pick(SYNTH_BASS);
      pat.arp = rng.pick(['up', 'updown', 'broken']);
      pat.fill = rng.pick(['toms', 'snare']);
    } else if (style === 'house') {
      pat.bass = HOUSE_BASS[rng.pick(Object.keys(HOUSE_BASS))];
      pat.stab = rng.pick(HOUSE_STABS);
      pat.stabLen = rng.pick([1.5, 2, 2.5]);
      pat.swing = rng.range(0.03, 0.12);
      pat.shaker = rng.chance(0.5);
    } else {
      pat.kick = rng.pick(DARK_KICKS);
      pat.slide = rng.chance(0.7);
      pat.octUp = rng.chance(0.5);
      pat.roll = rng.pick(['32', 'trip']);
      pat.voice = rng.pick(['bell', 'bell', 'pluck']);
      pat.ratio = rng.pick([3.5, 2, 1.41, 3.5]);
    }
    const name = makeName(rng, style);
    return {
      style, seed, bpm, six, barDur, key, mode, scale, verse, chorus, size, sections, bars, pat,
      title: name.title, artist: name.artist, duration: bars.length * barDur + GAP,
    };
  }

  // ------------------------------------------------------------ stations
  const STATIONS = [
    { name: 'VHR 88.1 Sunset Drive', style: 'synthwave' },
    { name: 'Pulse 96.4', style: 'house' },
    { name: 'Harbor Heat 103.7', style: 'dark' },
    { name: 'Off', style: null },
  ];
  const OFF = 3;
  const LOOKAHEAD = 0.15;
  const TOMS = [196, 165, 139, 110];

  /**
   * The in-car radio. Stations keep "playing" while you are not listening:
   * tune back in and you land wherever the current song has got to.
   */
  class Radio {
    constructor(engine, opts) {
      this.engine = engine;
      this.onSongChange = null;
      this.stats = { notes: 0, voices: 0, songs: 0 };
      this._index = 0;
      this._active = false;
      this._duck = 0;
      this._g = null;
      this._sess = null;
      this._timer = null;
      this._park = null;
      this._connected = false;
      const seed = opts && opts.seed != null ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
      this._st = STATIONS.map((s, i) => {
        if (!s.style) return null;
        const h = (VH.RNG.hashString(s.name) ^ seed) >>> 0;
        return { index: i, name: s.name, style: s.style, seed: h, no: h % 997, song: null, start: null };
      });
    }

    get ctx() {
      return this.engine.ctx;
    }

    get station() {
      return { index: this._index, name: STATIONS[this._index].name };
    }

    get nowPlaying() {
      const st = this._st[this._index];
      if (!st) return null;
      const song = this._peek(st);
      return { title: song.title, artist: song.artist };
    }

    get active() {
      return this._active;
    }

    setStation(index) {
      const i = clamp(Math.round(num(index, 0)), 0, STATIONS.length - 1);
      if (i === this._index) return;
      this._index = i;
      if (!this._active) return;
      if (this.engine.ready && this._g) {
        const t = this.ctx.currentTime;
        this._endSession(0.06);
        this._static(t);
        if (this._st[i]) this._startSession(0.22);
      }
      this._notify(this._st[i]);
    }

    next() {
      this.setStation((this._index + 1) % STATIONS.length);
    }

    prev() {
      this.setStation((this._index + STATIONS.length - 1) % STATIONS.length);
    }

    setActive(on) {
      on = !!on;
      if (on === this._active) return;
      this._active = on;
      clearTimeout(this._park);
      this._park = null;
      if (on) {
        if (!this._timer) this._timer = setInterval(() => this._tick(), 25);
        this._tick();
        this._notify(this._st[this._index]);
        return;
      }
      clearInterval(this._timer);
      this._timer = null;
      this._fadingIn = false;
      if (this._g && this.ctx) {
        const p = this._g.active.gain;
        const t = this.ctx.currentTime;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(0, t + 0.4);
        this._park = setTimeout(() => {
          this._park = null;
          this._endSession(0.01);
          this._unplug();
        }, 480);
      } else this._sess = null;
    }

    setDucked(amount) {
      this._duck = clamp(num(amount, 0), 0, 1);
      if (this._g && this.ctx) this._g.duck.gain.setTargetAtTime(1 - 0.8 * this._duck, this.ctx.currentTime, 0.12);
    }

    // -------------------------------------------------------- plumbing
    _build() {
      if (this._g) return true;
      if (this._broken || !this.engine.ready) return false;
      try {
        const ctx = this.ctx;
        const g = {};
        const gain = (v) => {
          const n = ctx.createGain();
          n.gain.value = v;
          return n;
        };
        const biq = (type, f, q, db) => {
          const n = ctx.createBiquadFilter();
          n.type = type;
          n.frequency.value = f;
          n.Q.value = q;
          if (db) n.gain.value = db;
          return n;
        };
        // Car-speaker EQ, then the on/off fade and the duck.
        g.input = gain(0.9);
        const hp = biq('highpass', 60, 0.7);
        const ls = biq('lowshelf', 140, 0.7, 2);
        const hs = biq('highshelf', 6500, 0.7, -2.5);
        g.active = gain(0);
        g.duck = gain(1 - 0.8 * this._duck);
        g.input.connect(hp);
        hp.connect(ls);
        ls.connect(hs);
        hs.connect(g.active);
        g.active.connect(g.duck);
        // Gated reverb for snares, a short hall for everything else, and a stereo echo.
        g.gated = ctx.createConvolver();
        g.gated.buffer = impulse(ctx, 0.34, true);
        const gr = gain(1.6);
        g.gated.connect(gr);
        gr.connect(g.input);
        g.hall = ctx.createConvolver();
        g.hall.buffer = impulse(ctx, 1.3, false);
        const hr = gain(0.9);
        g.hall.connect(hr);
        hr.connect(g.input);
        g.delayIn = gain(1);
        const dr = gain(0.5);
        dr.connect(g.input);
        g.delays = [];
        for (const [pan, fb] of [[-0.5, 0.36], [0.5, 0.3]]) {
          const d = ctx.createDelay(2);
          d.delayTime.value = 0.3;
          const lp = biq('lowpass', 3200, 0.7);
          const hp2 = biq('highpass', 280, 0.7);
          const f = gain(fb);
          g.delayIn.connect(d);
          d.connect(lp);
          lp.connect(hp2);
          hp2.connect(f);
          f.connect(d);
          const p = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
          if (p.pan) p.pan.value = pan;
          hp2.connect(p);
          p.connect(dr);
          g.delays.push(d);
        }
        this._g = g;
        return true;
      } catch (err) {
        console.warn('[radio] could not build the radio', err);
        this._broken = true;
        return false;
      }
    }

    _plug() {
      if (this._connected || !this._g) return;
      this._g.duck.connect(this.engine.musicBus);
      this._connected = true;
    }

    _unplug() {
      if (!this._connected || !this._g) return;
      try {
        this._g.duck.disconnect();
      } catch (_) {
        /* already */
      }
      this._connected = false;
    }

    _tick() {
      const e = this.engine;
      if (!this._active || !e || !e.ready) return;
      if (!this._g && !this._build()) return;
      const ctx = this.ctx;
      if (!this._connected) this._plug();
      const a = this._g.active.gain;
      if (!this._fadingIn) {
        this._fadingIn = true;
        const t = ctx.currentTime;
        a.cancelScheduledValues(t);
        a.setValueAtTime(a.value, t);
        a.linearRampToValueAtTime(1, t + 0.3);
      }
      const st = this._st[this._index];
      if (!st) return;
      if (!this._sess) this._startSession(0.05);
      const S = this._sess;
      if (!S) return;
      const now = ctx.currentTime;
      // The timer fell behind (a long frame, a throttled tab): skip, don't burst.
      if (S.next < now - 0.06) for (let guard = 0; S.next < now && guard < 20000; guard++) this._advance(S);
      for (let guard = 0; S.next < now + LOOKAHEAD && guard < 256; guard++) {
        this._play(S);
        this._advance(S);
      }
    }

    /** The song a station is on right now (without starting its clock). */
    _peek(st) {
      if (!st.song) st.song = makeSong(st.style, this._songSeed(st));
      if (st.start != null && this.ctx) this._sync(st, this.ctx.currentTime);
      return st.song;
    }

    _songSeed(st) {
      return (st.seed ^ Math.imul(st.no + 1, 0x9e3779b1)) >>> 0;
    }

    _sync(st, t) {
      if (!st.song) st.song = makeSong(st.style, this._songSeed(st));
      if (st.start == null) st.start = t;
      let guard = 0;
      while (t >= st.start + st.song.duration && guard++ < 60) {
        st.start += st.song.duration;
        st.no++;
        st.song = makeSong(st.style, this._songSeed(st));
      }
      if (guard >= 60) st.start = t;
    }

    _startSession(delay) {
      const st = this._st[this._index];
      if (!st || !this._g) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + delay;
      this._sync(st, t0);
      const S = this._newSession(st, t0);
      let song = st.song;
      let idx = Math.max(0, Math.ceil((t0 - st.start) / song.six - 1e-6));
      if (idx >= song.bars.length * 16) {
        // Between songs: wait for the next one.
        st.start += song.duration;
        st.no++;
        st.song = song = makeSong(st.style, this._songSeed(st));
        idx = 0;
      }
      S.song = song;
      S.bar = Math.floor(idx / 16);
      S.step = idx % 16;
      S.next = st.start + idx * song.six;
      S.entry = true;
      this._tempo(song, S.next);
      this._sess = S;
    }

    _newSession(st, t) {
      const ctx = this.ctx;
      const g = this._g;
      const S = { st, nodes: [] };
      const trim = STYLES[st.style].trim; // evens out loudness between stations
      const mk = (v, to) => {
        const n = ctx.createGain();
        n.gain.value = v;
        if (to) n.connect(to);
        S.nodes.push(n);
        return n;
      };
      S.mix = mk(0, g.input);
      S.mix.gain.setValueAtTime(0, t);
      S.mix.gain.linearRampToValueAtTime(trim, t + 0.3);
      S.pump = mk(1, S.mix);
      S.gSend = mk(trim, g.gated);
      S.hSend = mk(trim, g.hall);
      S.dSend = mk(trim, g.delayIn);
      if (st.style === 'dark') {
        // The 808 is driven into a soft clipper so it is heard on small speakers.
        const drive = mk(1.4);
        const sh = ctx.createWaveShaper();
        sh.curve = curve(this.engine, 1.8);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        const post = mk(0.42, S.mix);
        drive.connect(sh);
        sh.connect(lp);
        lp.connect(post);
        S.nodes.push(sh, lp);
        S.sub = drive;
      }
      return S;
    }

    _endSession(fade) {
      const S = this._sess;
      if (!S) return;
      this._sess = null;
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const n of [S.mix, S.gSend, S.hSend, S.dSend]) {
        n.gain.cancelScheduledValues(t);
        n.gain.setValueAtTime(n.gain.value, t);
        n.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fade));
      }
      setTimeout(() => {
        for (const n of S.nodes) {
          try {
            n.disconnect();
          } catch (_) {
            /* gone */
          }
        }
      }, (fade + LOOKAHEAD + 0.4) * 1000);
    }

    _tempo(song, t) {
      if (!this._g) return;
      const at = Math.max(t, this.ctx.currentTime);
      this._g.delays[0].delayTime.setTargetAtTime(song.six * 3, at, 0.04);
      this._g.delays[1].delayTime.setTargetAtTime(song.six * 4, at, 0.04);
    }

    _advance(S) {
      S.next += S.song.six;
      if (++S.step < 16) return;
      S.step = 0;
      if (++S.bar < S.song.bars.length) return;
      const st = S.st;
      const start = st.start + st.song.duration;
      st.no++;
      st.song = makeSong(st.style, this._songSeed(st));
      st.start = start;
      S.song = st.song;
      S.bar = 0;
      S.next = start;
      this.stats.songs++;
      this._tempo(S.song, start);
      const delay = Math.max(0, start - this.ctx.currentTime);
      setTimeout(() => {
        if (this._sess === S && this._active) this._notify(st);
      }, delay * 1000);
    }

    _notify(st) {
      const fn = this.onSongChange;
      if (typeof fn !== 'function') return;
      let info;
      if (st) {
        const song = this._peek(st);
        info = { station: st.name, index: st.index, title: song.title, artist: song.artist };
      } else info = { station: STATIONS[OFF].name, index: OFF, title: null, artist: null };
      try {
        fn(info);
      } catch (err) {
        console.error('[radio] onSongChange handler failed', err);
      }
    }

    _play(S) {
      const song = S.song;
      const b = song.bars[S.bar];
      const s = S.step;
      let t = S.next;
      if (song.pat.swing && s & 1) t += song.pat.swing * song.six;
      try {
        if (S.entry) {
          S.entry = false;
          this._entryPad(S, song, s, t);
        }
        if (song.style === 'synthwave') this._synthwave(S, song, b, s, t);
        else if (song.style === 'house') this._house(S, song, b, s, t);
        else this._dark(S, song, b, s, t);
      } catch (err) {
        console.warn('[radio] step failed', err);
      }
    }

    /** Tuning in mid-bar: bring the held chord in straight away. */
    _entryPad(S, song, s, t) {
      let j = S.bar;
      while (j > 0 && song.bars[j].padBars === 0) j--;
      const pb = song.bars[j];
      if (!STYLES[song.style].pads[pb.sec]) return;
      const rem = (j + pb.padBars) * 16 - (S.bar * 16 + s);
      if ((s === 0 && j === S.bar) || rem < 3) return;
      this._padFor(S, song, pb, t, rem * song.six, 0.15);
    }

    _padFor(S, song, b, t, dur, attack) {
      if (song.style === 'synthwave') {
        this._pad(t, dur, b.pad, S, { v: b.sec === 'breakdown' ? 1.6 : b.sec === 'verse' ? 0.8 : 1, cut: b.sec === 'chorus' ? 2400 : 1500, attack: attack || 0.35, dest: S.pump });
      } else if (song.style === 'house') {
        this._pad(t, dur, b.pad, S, { v: b.sec === 'breakdown' ? 2.2 : 0.8, cut: b.sec === 'breakdown' ? 1100 + 1600 * (b.i / b.n) : 1800, attack: attack || 0.25, dest: S.pump });
      } else {
        this._pad(t, dur, b.pad, S, { v: b.sec === 'chorus' ? 0.8 : b.sec === 'breakdown' ? 2.2 : 1.3, cut: 800, attack: attack || 0.6, release: 1.0, wave: 'triangle', dest: S.mix });
      }
    }

    // ---------------------------------------------------- arrangements
    _synthwave(S, song, b, s, t) {
      const P = song.pat;
      const six = song.six;
      const sec = b.sec;
      const last = b.i === b.n - 1;
      const fade = sec === 'outro' ? 1 - (0.55 * (b.i * 16 + s)) / (b.n * 16) : 1;
      const groove = sec === 'verse' || sec === 'chorus';
      const drums = groove || (sec === 'outro' && !last);

      if (drums && (s === 0 || s === 8 || P.kickX.indexOf(s) >= 0)) {
        this._kick(t, S.mix, 0.8 * fade, 'synth');
        if (sec === 'chorus') this._pump(S, t, 0.7);
      }
      let filled = false;
      if (b.fill) {
        const from = sec === 'breakdown' ? 8 : 12;
        if (s >= from) {
          filled = true;
          const k = (s - from + 1) / (16 - from);
          if (P.fill === 'toms' && groove) this._tom(t, S, TOMS[s - 12], 0.8);
          else this._snare(t, S, 0.3 + 0.5 * k, true);
        }
      }
      if (drums && !filled && (s === 4 || s === 12)) this._snare(t, S, 0.85 * fade, false);
      if (s === 0 && b.i === 0 && (sec === 'chorus' || (sec === 'verse' && b.si > 1))) this._cymbal(t, S, 0.8);
      if (drums || (sec === 'intro' && b.i >= b.n / 2)) {
        if (s % 2 === 0) this._hat(t, S.mix, (s % 4 === 2 ? 0.1 : 0.06) * fade * rand(0.85, 1.1), false);
        else if (sec === 'chorus' && P.hat16) this._hat(t, S.mix, 0.03 * rand(0.8, 1.2), false);
      }

      // Bass: an analogue arpeggio under everything but the breakdown.
      if (sec !== 'breakdown') {
        const cut = sec === 'intro' ? 0.3 + (0.7 * (b.i * 16 + s)) / (b.n * 16) : sec === 'chorus' ? 1.15 : 1;
        const B = b.bass;
        let m = null;
        let d = 1.7;
        let v = 1;
        switch (P.bass) {
          case 'oct8':
            if (s % 2 === 0) m = s % 4 === 2 ? B[3] : B[0];
            break;
          case 'drive16':
            m = s === 6 || s === 14 ? B[3] : B[0];
            d = 0.9;
            v = s % 4 === 0 ? 1 : 0.75;
            break;
          case 'arp8':
            if (s % 2 === 0) m = [B[0], B[2], B[3], B[2]][(s / 2) % 4];
            break;
          default:
            if (s % 4 !== 1) {
              m = s === 8 ? B[3] : B[0];
              d = s % 4 === 0 ? 1.7 : 0.9;
            }
        }
        if (m !== null) this._bass(t, d * six, m, S, { v: v * fade, cut });
      } else if (s === 0) this._bass(t, 15.5 * six, b.bass[0], S, { v: 0.6, cut: 0.35, soft: true });

      if (s === 0 && b.padBars > 0) this._padFor(S, song, b, t, b.padBars * 16 * six);

      const ev = b.melAt && b.melAt[s];
      if (ev) this._lead(t, ev.d * six, ev.m, S, ev.v * (sec === 'breakdown' ? 0.75 : 1));

      // A sixteenth-note arpeggio of the chord lifts the chorus.
      if (sec === 'chorus' || (sec === 'breakdown' && b.i >= b.n / 2)) {
        const n = b.pad.length;
        let idx;
        if (P.arp === 'up') idx = s % n;
        else if (P.arp === 'updown') idx = [0, 1, 2, 3, 2, 1][s % 6] % n;
        else idx = [0, 2, 1, 3][s % 4] % n;
        this._pluck(t, 0.9 * six, b.pad[idx] + 12, S, sec === 'chorus' ? 0.8 : 0.5, 'arp');
      }
    }

    _house(S, song, b, s, t) {
      const P = song.pat;
      const six = song.six;
      const sec = b.sec;
      const last = b.i === b.n - 1;
      const fade = sec === 'outro' ? 1 - (0.5 * (b.i * 16 + s)) / (b.n * 16) : 1;
      const groove = sec === 'verse' || sec === 'chorus';
      const intro2 = sec === 'intro' && b.i >= b.n / 2;
      const kickOn = sec !== 'breakdown' && !(sec === 'outro' && last && s >= 8);

      if (kickOn && s % 4 === 0) {
        this._kick(t, S.mix, 0.9 * fade, 'house');
        this._pump(S, t, 0.35);
      }
      if (groove && (s === 4 || s === 12)) this._clap(t, S, 0.6);
      const bd2 = sec === 'breakdown' && b.i >= b.n / 2;
      if ((groove || intro2 || bd2 || sec === 'outro') && s % 4 === 2) this._hat(t, S.mix, (bd2 ? 0.05 : 0.09) * fade, true);
      if ((sec === 'chorus' || (sec === 'verse' && P.shaker)) && s % 4 !== 2) this._hat(t, S.mix, s % 2 ? 0.035 : 0.022, false);
      if (b.fill && s >= 12 && sec !== 'breakdown') this._clap(t, S, 0.25 + 0.1 * (s - 12));
      if (s === 0 && b.i === 0 && sec === 'chorus') this._cymbal(t, S, 0.7);
      if (sec === 'breakdown' && last) {
        if (s === 0) this._riser(t, 16 * six, S);
        if (s >= 8) this._snare(t, S, 0.15 + 0.06 * (s - 8), true);
      }

      if (groove || intro2 || sec === 'outro') {
        for (const [step, tone, d] of P.bass) {
          if (step === s) this._bass(t, d * six, b.bass[tone], S, { v: 0.95 * fade, house: true, cut: sec === 'chorus' ? 1.2 : 1 });
        }
      }
      if (P.stab.indexOf(s) >= 0) {
        if (groove) this._stab(t, P.stabLen * six, b.pad, S, 0.9, sec === 'chorus' ? 1 : 0.75);
        else if (sec === 'breakdown' && b.i % 2 === 0) this._stab(t, P.stabLen * six, b.pad, S, 0.6, 0.35);
      }
      if (s === 0 && b.padBars > 0 && STYLES.house.pads[sec]) this._padFor(S, song, b, t, b.padBars * 16 * six);
      const ev = b.melAt && b.melAt[s];
      if (ev) this._pluck(t, ev.d * six, ev.m, S, ev.v * (sec === 'breakdown' ? 0.8 : 1), 'hook');
    }

    _dark(S, song, b, s, t) {
      const P = song.pat;
      const six = song.six;
      const sec = b.sec;
      const beat = sec === 'verse' || sec === 'chorus' || (sec === 'outro' && b.i < b.n - 1);
      const k = P.kick.indexOf(s);

      if (beat && k >= 0) {
        this._kick(t, S.mix, 0.7, 'dark');
        const nextS = k + 1 < P.kick.length ? P.kick[k + 1] : 16;
        let m = b.bass[0];
        let glide = null;
        if (k === P.kick.length - 1) {
          const nb = S.song.bars[S.bar + 1];
          if (P.slide && nb && nb.bass[0] !== m && nb.sec !== 'breakdown') {
            glide = nb.bass[0];
            if (glide - m > 7) glide -= 12;
            else if (m - glide > 7) glide += 12;
          } else if (P.octUp && b.i % 2 === 1) {
            m += 12;
            glide = m - 12;
          }
        }
        this._sub808(t, (nextS - s) * six, m, S, glide);
      }
      let filled = false;
      if (b.fill && s >= 12 && sec !== 'breakdown') {
        filled = true;
        this._snare(t, S, 0.25 + 0.12 * (s - 12), true);
        this._snare(t + six / 2, S, 0.2 + 0.12 * (s - 12), true);
      }
      if (beat && s === 8 && !filled) this._clap(t, S, 0.75, true);

      const hats = beat || ((sec === 'intro' || sec === 'breakdown') && b.i >= b.n / 2);
      if (hats) {
        const rolling = beat && b.i % 4 === 3 && (P.roll === '32' ? s >= 12 : s >= 8 && s < 12);
        if (rolling) {
          if (P.roll === '32') for (let r = 0; r < 2; r++) this._hat(t + (r * six) / 2, S.mix, 0.03 + 0.012 * (s - 12) + 0.006 * r, false);
          else if (s === 8) for (let r = 0; r < 6; r++) this._hat(t + (r * 4 * six) / 6, S.mix, 0.03 + 0.008 * r, false);
        } else if (s % 2 === 0) this._hat(t, S.mix, s % 4 === 0 ? 0.07 : 0.045, false);
        if (sec === 'chorus' && s === 14 && b.i % 2 === 0) this._hat(t, S.mix, 0.05, true);
      }
      // The second half of the intro brings in a long 808 on each bar.
      if (sec === 'intro' && b.i >= b.n / 2 && s === 0) this._sub808(t, 15 * six, b.bass[0], S, null, 0.7);
      if (sec === 'breakdown' && b.i === b.n - 1 && s === 0) this._riser(t, 16 * six, S);
      if (s === 0 && b.i === 0 && sec === 'chorus') this._cymbal(t, S, 0.6);

      if (s === 0 && b.padBars > 0 && STYLES.dark.pads[sec]) this._padFor(S, song, b, t, b.padBars * 16 * six);
      const ev = b.melAt && b.melAt[s];
      if (ev) {
        if (P.voice === 'bell') this._bell(t, ev.d * six, ev.m, S, ev.v, P.ratio);
        else this._pluck(t, ev.d * six, ev.m, S, ev.v, 'dark');
      }
    }

    // ---------------------------------------------------- instruments
    _src(t, dur, brown) {
      const s = this.ctx.createBufferSource();
      s.buffer = brown ? this.engine.brown : this.engine.white;
      s.loop = true;
      s.start(t, Math.random() * 1.5);
      s.stop(t + dur);
      this.stats.voices++;
      return s;
    }

    _osc(type, f, t, stop) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.start(t);
      o.stop(stop);
      this.stats.voices++;
      return o;
    }

    _gn(v) {
      const g = this.ctx.createGain();
      g.gain.value = v;
      return g;
    }

    _flt(type, f, q) {
      const x = this.ctx.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q == null ? 0.7 : q;
      return x;
    }

    _send(node, dest, amt) {
      const g = this._gn(amt);
      node.connect(g);
      g.connect(dest);
    }

    _pump(S, t, depth) {
      const p = S.pump.gain;
      p.setTargetAtTime(depth, t, 0.004);
      p.setTargetAtTime(1, t + 0.03, 0.085);
    }

    _kick(t, dest, v, kind) {
      const K = kind === 'house' ? [165, 50, 0.05, 0.065, 0.4] : kind === 'dark' ? [190, 52, 0.04, 0.05, 0.5] : [140, 48, 0.07, 0.075, 0.25];
      const end = t + 0.02 + K[3] * 6;
      const o = this._osc('sine', K[0], t, end);
      o.frequency.exponentialRampToValueAtTime(K[1], t + K[2]);
      const g = this._gn(0);
      g.gain.setValueAtTime(v, t);
      g.gain.setTargetAtTime(0, t + 0.02, K[3]);
      o.connect(g);
      g.connect(dest);
      const n = this._src(t, 0.03);
      const f = this._flt('highpass', 2800);
      const g2 = this._gn(0);
      g2.gain.setValueAtTime(v * K[4], t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      n.connect(f);
      f.connect(g2);
      g2.connect(dest);
      this.stats.notes++;
    }

    _snare(t, S, v, dry) {
      const body = this._osc('triangle', 205, t, t + 0.2);
      body.frequency.exponentialRampToValueAtTime(165, t + 0.05);
      const bg = this._gn(0);
      bg.gain.setValueAtTime(v * 0.3, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      body.connect(bg);
      bg.connect(S.mix);
      const n = this._src(t, 0.3);
      const hp = this._flt('highpass', 950);
      const lp = this._flt('lowpass', 8000);
      const g = this._gn(0);
      g.gain.setValueAtTime(v * 0.34, t);
      g.gain.setTargetAtTime(0, t + 0.004, 0.045);
      n.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(S.mix);
      this._send(g, S.gSend, dry ? 0.25 : 0.9);
      this._send(bg, S.gSend, dry ? 0.1 : 0.5);
      this.stats.notes++;
    }

    _clap(t, S, v, big) {
      const n = this._src(t, 0.4);
      const bp = this._flt('bandpass', 1250, 1.1);
      const g = this._gn(0);
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 0.011;
        g.gain.setValueAtTime(v * 0.45, tt);
        g.gain.setTargetAtTime(0, tt + 0.001, 0.004);
      }
      g.gain.setValueAtTime(v * 0.5, t + 0.033);
      g.gain.setTargetAtTime(0, t + 0.034, big ? 0.07 : 0.045);
      n.connect(bp);
      bp.connect(g);
      g.connect(S.mix);
      this._send(g, S.hSend, big ? 0.6 : 0.35);
      if (big) this._send(g, S.gSend, 0.4);
      this.stats.notes++;
    }

    _hat(t, dest, v, open) {
      const dur = open ? 0.22 : 0.045;
      const n = this._src(t, dur + 0.02);
      const hp = this._flt('highpass', open ? 6500 : 7500);
      const g = this._gn(0);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      n.connect(hp);
      hp.connect(g);
      g.connect(dest);
      this.stats.notes++;
    }

    _cymbal(t, S, v) {
      const n = this._src(t, 2.2);
      const hp = this._flt('highpass', 4200);
      const g = this._gn(0);
      g.gain.setValueAtTime(v * 0.14, t);
      g.gain.setTargetAtTime(0, t + 0.01, 0.42);
      n.connect(hp);
      hp.connect(g);
      g.connect(S.mix);
      this._send(g, S.hSend, 0.5);
      this.stats.notes++;
    }

    _tom(t, S, f, v) {
      const o = this._osc('sine', f, t, t + 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.25);
      const g = this._gn(0);
      g.gain.setValueAtTime(v * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g);
      g.connect(S.mix);
      this._send(g, S.gSend, 0.35);
      this.stats.notes++;
    }

    _riser(t, dur, S) {
      const n = this._src(t, dur + 0.05);
      const bp = this._flt('bandpass', 300, 2);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
      const g = this._gn(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.1, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      n.connect(bp);
      bp.connect(g);
      g.connect(S.mix);
      this._send(g, S.hSend, 0.5);
      this.stats.notes++;
    }

    _bass(t, dur, m, S, o) {
      const f = mtof(m);
      const end = t + Math.max(0.03, dur - 0.01);
      const stop = end + 0.15;
      const lp = this._flt('lowpass', 200, o.house ? 7 : 5);
      const cutK = o.cut || 1;
      const cut = (o.house ? 260 : 190) * cutK;
      const env = (o.soft ? 300 : o.house ? 1500 : 1250) * cutK;
      lp.frequency.setValueAtTime(cut + env, t);
      lp.frequency.setTargetAtTime(cut, t + 0.005, o.house ? 0.06 : 0.09);
      const g = this._gn(0);
      const lvl = (o.house ? 0.2 : 0.22) * o.v;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + (o.soft ? 0.08 : 0.004));
      g.gain.setTargetAtTime(lvl * 0.7, t + 0.01, 0.15);
      g.gain.setTargetAtTime(0, end, 0.02);
      const a = this._osc('sawtooth', f, t, stop);
      a.connect(lp);
      if (o.house) {
        const b = this._osc('square', f, t, stop);
        b.detune.value = -8;
        const bg = this._gn(0.5);
        b.connect(bg);
        bg.connect(lp);
      }
      lp.connect(g);
      g.connect(S.mix);
      this.stats.notes++;
    }

    _pad(t, dur, notes, S, o) {
      const ctx = this.ctx;
      const att = o.attack || 0.35;
      const rel = o.release || 0.7;
      const stop = t + dur + rel * 2 + 0.1;
      const cut = o.cut || 1500;
      const lp = this._flt('lowpass', cut, 0.6);
      lp.frequency.setValueAtTime(cut * 0.6, t);
      lp.frequency.linearRampToValueAtTime(cut, t + Math.min(dur, 1.2));
      const g = this._gn(0);
      const lvl = 0.042 * (o.v || 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + att);
      g.gain.setValueAtTime(lvl, t + Math.max(att, dur));
      g.gain.setTargetAtTime(0, t + Math.max(att, dur), rel / 3);
      const sides = [];
      for (const pan of [-0.55, 0.55]) {
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : this._gn(1);
        if (p.pan) p.pan.value = pan;
        p.connect(lp);
        sides.push(p);
      }
      const wave = o.wave || 'sawtooth';
      for (const m of notes) {
        for (let k = 0; k < 2; k++) {
          const osc = this._osc(wave, mtof(m), t, stop);
          osc.detune.value = (k ? 9 : -9) + rand(-2, 2);
          osc.connect(sides[k]);
        }
      }
      lp.connect(g);
      g.connect(o.dest || S.mix);
      this._send(g, S.hSend, 0.45);
      this.stats.notes++;
    }

    _lead(t, dur, m, S, v) {
      const f = mtof(m);
      const end = t + dur;
      const stop = end + 0.6;
      const a = this._osc('sawtooth', f, t, stop);
      const b = this._osc('square', f, t, stop);
      b.detune.value = 7;
      if (dur > 0.3) {
        const len = dur + 0.3;
        a.detune.setValueCurveAtTime(vibrato(len, 14, 0, 5.6), t + 0.12, len);
        b.detune.setValueCurveAtTime(vibrato(len, 14, 7, 5.6), t + 0.12, len);
      }
      const bg = this._gn(0.45);
      b.connect(bg);
      const lp = this._flt('lowpass', 4200, 1.2);
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.setTargetAtTime(2300, t + 0.01, 0.15);
      a.connect(lp);
      bg.connect(lp);
      const g = this._gn(0);
      const lvl = 0.065 * v;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.012);
      g.gain.setTargetAtTime(lvl * 0.8, t + 0.012, 0.2);
      g.gain.setTargetAtTime(0, end, 0.07);
      lp.connect(g);
      g.connect(S.mix);
      this._send(g, S.dSend, 0.3);
      this._send(g, S.hSend, 0.3);
      this.stats.notes++;
    }

    _pluck(t, dur, m, S, v, kind) {
      const f = mtof(m);
      const hook = kind === 'hook';
      const dark = kind === 'dark';
      const o = this._osc(hook ? 'sawtooth' : dark ? 'triangle' : 'square', f, t, t + 0.9);
      const lp = this._flt('lowpass', 3000, hook ? 4 : 2);
      lp.frequency.setValueAtTime(hook ? 3800 : dark ? 2600 : 3000, t);
      lp.frequency.setTargetAtTime(hook ? 650 : dark ? 500 : 900, t, hook ? 0.07 : 0.06);
      const g = this._gn(0);
      const lvl = (hook ? 0.075 : dark ? 0.16 : 0.04) * v;
      const tau = hook ? Math.min(0.12, dur * 0.6) : dark ? Math.max(0.12, Math.min(0.35, dur * 0.4)) : 0.06;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, tau);
      o.connect(lp);
      lp.connect(g);
      g.connect(hook || !dark ? S.pump : S.mix);
      this._send(g, S.dSend, dark ? 0.4 : 0.35);
      if (dark || hook) this._send(g, S.hSend, 0.3);
      this.stats.notes++;
    }

    _stab(t, dur, notes, S, v, bright) {
      const stop = t + dur + 0.25;
      const lp = this._flt('lowpass', 900, 2.5);
      lp.frequency.setValueAtTime(900 + 2600 * bright, t);
      lp.frequency.setTargetAtTime(500 + 300 * bright, t + 0.005, 0.07);
      const g = this._gn(0);
      const lvl = 0.05 * v;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.003);
      g.gain.setTargetAtTime(lvl * 0.5, t + 0.003, 0.08);
      g.gain.setTargetAtTime(0, t + dur, 0.03);
      for (const m of notes) {
        const o = this._osc('sawtooth', mtof(m), t, stop);
        o.detune.value = rand(-6, 6);
        o.connect(lp);
      }
      lp.connect(g);
      g.connect(S.pump);
      this._send(g, S.hSend, 0.25);
      this._send(g, S.dSend, 0.15);
      this.stats.notes++;
    }

    _bell(t, dur, m, S, v, ratio) {
      const f = mtof(m);
      const tau = Math.max(0.25, Math.min(0.9, dur * 0.6));
      const stop = t + tau * 5 + 0.1;
      const car = this._osc('sine', f, t, stop);
      const mo = this._osc('sine', f * ratio, t, stop);
      const mg = this._gn(0);
      mg.gain.setValueAtTime(f * 2.2, t);
      mg.gain.setTargetAtTime(f * 0.25, t, 0.25);
      mo.connect(mg);
      mg.connect(car.frequency);
      const g = this._gn(0);
      const lvl = 0.12 * v;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, tau);
      car.connect(g);
      g.connect(S.mix);
      this._send(g, S.dSend, 0.35);
      this._send(g, S.hSend, 0.35);
      this.stats.notes++;
    }

    _sub808(t, dur, m, S, glide, v) {
      const f = mtof(m);
      const end = t + Math.max(0.05, dur - 0.015);
      const o = this._osc('sine', f * 1.9, t, end + 0.1);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
      if (glide != null && dur > 0.2) {
        const tg = t + Math.max(0.05, dur * 0.6);
        o.frequency.setValueAtTime(f, tg);
        o.frequency.exponentialRampToValueAtTime(mtof(glide), tg + Math.min(0.12, dur * 0.3));
      }
      const g = this._gn(0);
      const lvl = 0.5 * (v || 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.004);
      g.gain.setTargetAtTime(lvl * 0.3, t + 0.06, Math.max(0.2, dur * 0.6));
      g.gain.setTargetAtTime(0, end, 0.012);
      o.connect(g);
      g.connect(S.sub || S.mix);
      this.stats.notes++;
    }

    _static(t) {
      if (!this._g) return;
      const n = this._src(t, 0.3);
      const bp = this._flt('bandpass', 2400, 0.5);
      const g = this._gn(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.02);
      g.gain.setValueAtTime(0.1, t + 0.17);
      g.gain.linearRampToValueAtTime(0, t + 0.24);
      n.connect(bp);
      bp.connect(g);
      g.connect(this._g.input);
      const c = this.ctx.createBufferSource();
      c.buffer = assets(this.engine).crackle;
      c.playbackRate.value = 3;
      const cg = this._gn(0.25);
      c.connect(cg);
      cg.connect(g);
      c.start(t, Math.random() * 3);
      c.stop(t + 0.26);
    }
  }

  Radio.STATIONS = STATIONS.map((s) => s.name);
  Radio._makeSong = makeSong; // exposed for tools and tests
  VH.Radio = Radio;
})();
