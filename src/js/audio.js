/*
 * audio.js — every sound in Vicehaven, synthesised live with Web Audio.
 * There are no audio files, so it works offline and from file:// too.
 *
 *   ambience   city hum, wind that rises with height and speed, surf and
 *              gulls near the bay, the odd distant car horn
 *   effects    footsteps that change with the surface underfoot, jumps,
 *              landings, climbs, purchases, challenge cues
 *   music      a procedural tension track for timed challenges whose
 *              layers build as the pressure rises
 *
 * Browsers only allow sound after the player clicks or presses a key, so
 * the audio context is created on the first such gesture.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, smoothstep } = VH.math;

  // A minor: Am – F – C – G, one bar each.
  const CHORDS = [
    { root: 110.0, tones: [440.0, 523.25, 659.25] },
    { root: 87.31, tones: [349.23, 440.0, 523.25] },
    { root: 130.81, tones: [392.0, 523.25, 659.25] },
    { root: 98.0, tones: [392.0, 493.88, 587.33] },
  ];

  class AudioEngine {
    constructor(settings) {
      this.settings = settings;
      this.ctx = null;
      this.available = !!(window.AudioContext || window.webkitAudioContext);
      this.paused = false;
      this.intensity = 0;
      this.bpm = 124;
      this._musicOn = false;
      this._gullTimer = 4;
      this._hornTimer = 14;
      this._gust = 0;

      VH.events.on('settings:changed', (e) => {
        if (e.path.startsWith('audio') || e.path === '*') this.applyVolumes();
      });
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend().catch(() => {});
        else if (!this.paused) this.ctx.resume().catch(() => {});
      });
    }

    get ready() {
      return !!this.ctx && this.ctx.state === 'running';
    }

    /** Create or resume the audio context. Must run inside a user gesture. */
    unlock() {
      if (!this.available) return;
      if (!this.ctx) {
        try {
          this._create();
        } catch (err) {
          this.available = false;
          console.warn('[audio] Web Audio unavailable, continuing without sound', err);
          return;
        }
      }
      if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
    }

    _create() {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 14;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      const bus = () => {
        const g = ctx.createGain();
        g.connect(this.master);
        return g;
      };
      this.sfx = bus();
      this.ui = bus();
      this.amb = bus();
      this.musicBus = bus();

      this.white = this._noise(2, false);
      this.brown = this._noise(4, true);
      this.city = this._loop(this.brown, 'lowpass', 360, 0.6);
      this.wind = this._loop(this.white, 'bandpass', 500, 0.7);
      this.sea = this._loop(this.brown, 'lowpass', 700, 0.4);
      this.applyVolumes();
    }

    _noise(seconds, brown) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
      return buf;
    }

    _loop(buffer, type, freq, q) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.amb);
      src.start();
      return { src, filter, gain };
    }

    applyVolumes() {
      if (!this.ctx) return;
      const a = this.settings.data.audio;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(a.master, t, 0.05);
      this.sfx.gain.setTargetAtTime(a.effects, t, 0.05);
      this.ui.gain.setTargetAtTime(a.effects * 0.8, t, 0.05);
      this.amb.gain.setTargetAtTime(a.ambience, t, 0.05);
      this.musicBus.gain.setTargetAtTime(a.music * 0.8, t, 0.05);
    }

    setPaused(p) {
      this.paused = p;
      if (!this.ctx) return;
      if (p) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }

    // ------------------------------------------------------------ ambience
    /** s = { playing, height, speed, sea (0..1) } */
    update(dt, s) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this._gust += dt;
      const gust = 0.75 + 0.25 * Math.sin(this._gust * 0.7) * Math.sin(this._gust * 0.23 + 1.3);
      const heightWind = smoothstep(2.5, 22, s.height);
      const city = s.playing ? 0.2 * (1 - 0.6 * heightWind) + 0.04 : 0.05;
      const wind = s.playing ? (0.015 + heightWind * 0.36 + clamp(s.speed / 8, 0, 1) * 0.05) * gust : 0.02;
      const sea = s.playing ? s.sea * 0.3 : 0.04;
      this.city.gain.gain.setTargetAtTime(city, t, 0.6);
      this.wind.gain.gain.setTargetAtTime(wind, t, 0.4);
      this.wind.filter.frequency.setTargetAtTime(320 + s.speed * 55 + s.height * 9 + gust * 120, t, 0.3);
      this.sea.gain.gain.setTargetAtTime(sea * (0.75 + 0.25 * Math.sin(this._gust * 0.9)), t, 0.8);

      if (!s.playing) return;
      this._gullTimer -= dt;
      if (this._gullTimer <= 0) {
        this._gullTimer = 5 + Math.random() * 9;
        if (s.sea > 0.2) this.gull(s.sea);
      }
      this._hornTimer -= dt;
      if (this._hornTimer <= 0) {
        this._hornTimer = 16 + Math.random() * 26;
        if (s.sea < 0.6 && s.height < 30) this.distantHorn();
      }
    }

    // ---------------------------------------------------------- building blocks
    _envelope(param, t, attack, peak, decay) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    _pan(dest, pan) {
      if (!pan || !this.ctx.createStereoPanner) return dest;
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(dest);
      return p;
    }

    /** Filtered noise burst. */
    _hit(o) {
      const ctx = this.ctx;
      const t = o.t || ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = o.brown ? this.brown : this.white;
      src.playbackRate.value = o.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 1000, t);
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.attack || 0.004) + (o.decay || 0.05));
      f.Q.value = o.q || 1;
      const g = ctx.createGain();
      src.connect(f);
      f.connect(g);
      g.connect(this._pan(o.bus || this.sfx, o.pan));
      this._envelope(g.gain, t, o.attack || 0.004, o.peak || 0.2, o.decay || 0.05);
      const offset = Math.random() * 1.5;
      src.start(t, offset, (o.attack || 0.004) + (o.decay || 0.05) + 0.05);
    }

    /** Oscillator note with an optional pitch glide. */
    _tone(o) {
      const ctx = this.ctx;
      const t = o.t || ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = o.wave || 'sine';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.attack || 0.005) + (o.decay || 0.1));
      if (o.detune) osc.detune.value = o.detune;
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
      node.connect(g);
      g.connect(this._pan(o.bus || this.sfx, o.pan));
      this._envelope(g.gain, t, o.attack || 0.005, o.peak || 0.2, o.decay || 0.1);
      osc.start(t);
      osc.stop(t + (o.attack || 0.005) + (o.decay || 0.1) + 0.05);
    }

    // --------------------------------------------------------------- effects
    footstep(surface, speed) {
      if (!this.ready) return;
      const k = clamp(0.4 + speed / 9, 0.4, 1.2);
      const r = 0.92 + Math.random() * 0.16;
      switch (surface) {
        case 'wood':
          this._hit({ freq: 620 * r, q: 2.6, peak: 0.34 * k, decay: 0.07 });
          this._tone({ freq: 170 * r, wave: 'triangle', peak: 0.1 * k, decay: 0.08 });
          break;
        case 'metal':
          this._hit({ freq: 3100 * r, q: 7, peak: 0.14 * k, decay: 0.12 });
          this._tone({ freq: 430 * r, freqEnd: 380 * r, wave: 'triangle', peak: 0.06 * k, decay: 0.22 });
          break;
        case 'grass':
          this._hit({ type: 'highpass', freq: 2600 * r, q: 0.5, peak: 0.1 * k, attack: 0.012, decay: 0.08 });
          break;
        case 'gravel':
          this._hit({ freq: 3000 * r, q: 0.7, peak: 0.2 * k, decay: 0.05 });
          this._hit({ t: this.ctx.currentTime + 0.025, freq: 2400 * r, q: 0.7, peak: 0.14 * k, decay: 0.05 });
          break;
        case 'asphalt':
          this._hit({ freq: 1500 * r, q: 0.9, peak: 0.2 * k, decay: 0.05 });
          this._tone({ freq: 85 * r, peak: 0.1 * k, decay: 0.05 });
          break;
        default:
          this._hit({ freq: 2300 * r, q: 1.1, peak: 0.22 * k, decay: 0.05 });
          this._tone({ freq: 95 * r, peak: 0.1 * k, decay: 0.05 });
      }
    }

    jump() {
      if (!this.ready) return;
      this._hit({ freq: 420, freqEnd: 1300, q: 0.8, peak: 0.08, attack: 0.02, decay: 0.14 });
    }

    land(impact, surface) {
      if (!this.ready || impact < 3) return;
      const k = clamp(impact / 16, 0.15, 1);
      this._tone({ freq: 130, freqEnd: 42, peak: 0.55 * k, decay: 0.18 });
      this._hit({ type: 'lowpass', freq: 900, q: 0.6, peak: 0.3 * k, decay: 0.09, brown: true });
      if (surface) this.footstep(surface, 6 * k);
    }

    climb() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this._hit({ t, freq: 1300, q: 1, peak: 0.12, decay: 0.06 });
      this._hit({ t: t + 0.2, freq: 1100, q: 1, peak: 0.1, decay: 0.07 });
      this._hit({ t: t + 0.05, freq: 380, freqEnd: 900, q: 0.8, peak: 0.05, attack: 0.03, decay: 0.2 });
    }

    purchase() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this._tone({ t, freq: 190, freqEnd: 80, peak: 0.28, decay: 0.12 });
      this._hit({ t: t + 0.25, type: 'highpass', freq: 5500, q: 0.4, peak: 0.07, attack: 0.03, decay: 0.45 });
    }

    click() {
      if (!this.ready) return;
      this._tone({ freq: 1250, peak: 0.05, decay: 0.03, bus: this.ui });
    }

    checkpoint() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this._tone({ t, freq: 987.77, wave: 'triangle', peak: 0.2, decay: 0.3, bus: this.ui });
      this._tone({ t: t + 0.07, freq: 1479.98, wave: 'triangle', peak: 0.18, decay: 0.45, bus: this.ui });
      this._tone({ t: t + 0.07, freq: 2959.96, peak: 0.05, decay: 0.5, bus: this.ui });
      this._hit({ t, type: 'highpass', freq: 6000, q: 0.5, peak: 0.05, decay: 0.3, bus: this.ui });
    }

    tick(urgent) {
      if (!this.ready) return;
      this._tone({ freq: urgent ? 2300 : 1700, wave: 'square', peak: urgent ? 0.07 : 0.045, decay: 0.03, lowpass: 5000, bus: this.ui });
    }

    countdown(n) {
      if (!this.ready) return;
      if (n > 0) this._tone({ freq: 660, wave: 'triangle', peak: 0.22, decay: 0.22, bus: this.ui });
      else {
        const t = this.ctx.currentTime;
        for (const [f, d] of [[1318.5, 0], [1661.2, 0], [1975.5, 0]]) this._tone({ t: t + d, freq: f, wave: 'triangle', peak: 0.14, decay: 0.6, bus: this.ui });
      }
    }

    success(medal) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      if (medal === 'gold') notes.push(1318.5, 1568);
      notes.forEach((f, i) => {
        this._tone({ t: t + i * 0.085, freq: f, wave: 'triangle', peak: 0.16, decay: 0.5, bus: this.ui });
        this._tone({ t: t + i * 0.085, freq: f * 2, peak: 0.03, decay: 0.4, bus: this.ui });
      });
      this._hit({ t, type: 'highpass', freq: 7000, q: 0.3, peak: 0.05, attack: 0.05, decay: 1.2, bus: this.ui });
    }

    fail() {
      if (!this.ready) return;
      this._tone({ freq: 330, freqEnd: 98, wave: 'sawtooth', peak: 0.18, decay: 0.7, lowpass: 1400, bus: this.ui });
      this._tone({ freq: 332, freqEnd: 99, wave: 'sawtooth', peak: 0.1, decay: 0.7, lowpass: 900, bus: this.ui, detune: 12 });
    }

    whoosh() {
      if (!this.ready) return;
      this._hit({ freq: 300, freqEnd: 2200, q: 0.6, peak: 0.12, attack: 0.08, decay: 0.3 });
    }

    gull(near) {
      const t = this.ctx.currentTime;
      const pan = Math.random() * 1.6 - 0.8;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.28;
        this._tone({ t: tt, freq: 1500, freqEnd: 950, wave: 'triangle', peak: 0.035 * near, attack: 0.03, decay: 0.2, pan, bus: this.amb });
      }
    }

    distantHorn() {
      const t = this.ctx.currentTime;
      const pan = Math.random() * 1.6 - 0.8;
      const long = Math.random() < 0.5;
      for (const f of [330, 415]) {
        this._tone({ t, freq: f, wave: 'square', peak: 0.018, attack: 0.02, decay: long ? 0.6 : 0.25, lowpass: 650, pan, bus: this.amb });
      }
    }

    // ----------------------------------------------------------------- music
    /** Start the challenge track. Layers are added as intensity (0..1) rises. */
    startMusic() {
      if (!this.ready || this._musicOn) return;
      this._musicOn = true;
      this.intensity = 0;
      this._step = 0;
      this._next = this.ctx.currentTime + 0.12;
      this.trackGain = this.ctx.createGain();
      this.trackGain.gain.value = 0.9;
      this.trackGain.connect(this.musicBus);
      this._timer = setInterval(() => this._schedule(), 25);
    }

    setIntensity(x) {
      this.intensity = clamp(x, 0, 1);
    }

    stopMusic(fade) {
      if (!this._musicOn) return;
      this._musicOn = false;
      clearInterval(this._timer);
      if (this.ctx && this.trackGain) {
        const g = this.trackGain;
        const t = this.ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.6));
        setTimeout(() => g.disconnect(), ((fade || 0.6) + 0.5) * 1000);
      }
    }

    _schedule() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const sixteenth = 60 / this.bpm / 4;
      while (this._next < this.ctx.currentTime + 0.14) {
        this._playStep(this._step, this._next);
        this._next += sixteenth;
        this._step = (this._step + 1) % 64;
      }
    }

    _playStep(step, t) {
      const beat = step % 16;
      const chord = CHORDS[Math.floor(step / 16) % 4];
      const I = this.intensity;
      const bus = this.trackGain;
      // Kick on every beat.
      if (beat % 4 === 0) this._tone({ t, freq: 150, freqEnd: 44, peak: 0.55, decay: 0.24, bus });
      // Clap on 2 and 4.
      if (beat === 4 || beat === 12) {
        this._hit({ t, freq: 1700, q: 0.9, peak: 0.22, decay: 0.12, bus });
        this._tone({ t, freq: 190, peak: 0.07, decay: 0.08, bus });
      }
      // Hi-hats: off-beats, filling in to sixteenths as the pressure rises.
      if (beat % 2 === 1 || (I > 0.45 && beat % 4 === 2) || (I > 0.8)) {
        this._hit({ t, type: 'highpass', freq: 8200, q: 0.5, peak: beat % 4 === 2 ? 0.07 : 0.045, decay: 0.03, bus });
      }
      // Bass: eighth-note pulse with an octave bounce; the filter opens with intensity.
      if (beat % 2 === 0) {
        const f = chord.root * (beat % 4 === 2 ? 2 : 1);
        this._tone({ t, freq: f, wave: 'sawtooth', peak: 0.16, decay: sixteenthLen(this.bpm) * 1.6, lowpass: 420 + I * 1600, lpq: 4, bus });
      }
      // A pad at the top of each bar once things get going.
      if (beat === 0 && I > 0.2) {
        for (const f of chord.tones) this._tone({ t, freq: f / 2, wave: 'sawtooth', peak: 0.025, attack: 0.25, decay: 1.6, lowpass: 900, bus });
      }
      // Arpeggio for the final push.
      if (I > 0.6) {
        const f = chord.tones[step % 3] * (step % 6 < 3 ? 1 : 2);
        this._tone({ t, freq: f, wave: 'square', peak: 0.03 + (I - 0.6) * 0.05, decay: 0.09, lowpass: 3000, bus });
      }
    }
  }

  function sixteenthLen(bpm) {
    return 60 / bpm / 4;
  }

  VH.AudioEngine = AudioEngine;
})();
