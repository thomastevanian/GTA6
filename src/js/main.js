/*
 * main.js — boots the game and runs the main loop.
 *
 * Boot: check the browser → create the renderer → paint textures → lay out
 * and build the city (time-sliced, with a progress bar) → create Jay, the
 * camera, HUD and menus → compile shaders → title screen.
 *
 * States:  loading → title → intro → playing ⇄ paused
 *                                   playing → dialog → playing
 *
 * The loop separates update rates (see the Scheduler below):
 *   every frame   camera, animation, rendering
 *   60 Hz fixed   player physics (interpolated when drawn)
 *   15 Hz         interaction checks
 *   4 Hz          location/district lookups, prop distance culling
 * Later phases slot traffic, pedestrian AI and world events into the same
 * scheduler at their own rates.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const FIXED_DT = 1 / 60;
  // World systems constructed after the club, in this order (each optional):
  // stores.js, airfield.js, fort.js, area51.js, horizon.js, photo.js, ambient.js, weather.js.
  const WORLD_SYSTEMS = ['Stores', 'Airfield', 'Fort', 'Area51', 'Horizon', 'PhotoMode', 'Ambient', 'Weather'];
  const SEEN_KEY = 'vicehaven.seen.map-v1.1'; // set once the player has opened the new map
  const CDN_THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';

  const TIPS = [
    'Tip: Hold Shift to sprint. Press Space beside a low wall to climb it.',
    'Tip: Run at a waist-high wall and jump to vault it without stopping.',
    'Tip: Crouch is a toggle — tap Ctrl or C.',
    'Tip: Scroll the mouse wheel to move the camera closer or further away.',
    'Tip: F8 opens the developer overlay with FPS and a command console.',
    'Tip: F9 opens photo mode: a free camera with depth of field, time of day and colour looks, and Enter saves the picture.',
    'Vicehaven: 312 days of sunshine a year. The other 53 are complicated.',
    'Tip: Settings → Graphics → Quality "Low" helps on older laptops.',
    'Harbor Point hotels offer a sea view, a pool and absolutely no questions.',
  ];

  // --------------------------------------------------------- scheduler
  /** Runs tasks at fixed rates independent of the frame rate. */
  class Scheduler {
    constructor() {
      this.tasks = [];
    }
    every(hz, fn) {
      this.tasks.push({ interval: 1 / hz, acc: Math.random() / hz, fn });
    }
    update(dt) {
      for (const t of this.tasks) {
        t.acc += dt;
        if (t.acc >= t.interval) {
          const elapsed = t.acc;
          t.acc = t.acc % t.interval;
          t.fn(elapsed);
        }
      }
    }
  }

  // ------------------------------------------------------ loading UI
  const Loading = {
    bar: null,
    status: null,
    step: null,
    tip: null,
    init() {
      this.bar = document.getElementById('loading-bar');
      this.status = document.getElementById('loading-status');
      this.step = document.getElementById('loading-step');
      this.tip = document.getElementById('loading-tip');
      let i = Math.floor(Math.random() * TIPS.length);
      this.tip.textContent = TIPS[i];
      this._tipTimer = setInterval(() => {
        i = (i + 1) % TIPS.length;
        this.tip.textContent = TIPS[i];
      }, 3800);
    },
    set(p, label) {
      this.bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
      if (label) this.step.textContent = label;
    },
    done() {
      clearInterval(this._tipTimer);
      document.getElementById('screen-loading').classList.remove('visible');
    },
  };

  // ------------------------------------------------------------ errors
  function webglHelp() {
    return (
      '<p>Vicehaven needs <b>WebGL 2</b> (hardware-accelerated 3D graphics). To turn it on in Microsoft Edge:</p>' +
      '<ol><li>Open <code>edge://settings/system</code></li>' +
      '<li>Switch on <b>Use graphics acceleration when available</b> and restart Edge</li>' +
      '<li>Check <code>edge://gpu</code> — "WebGL2" should say <i>Hardware accelerated</i></li></ol>' +
      '<p>Updating your graphics driver (Windows Update → Advanced options → Optional updates) also often fixes this.</p>'
    );
  }

  async function ensureThree() {
    if (window.THREE && window.THREE.WebGLRenderer) return;
    // The bundled copy is missing: try the CDN (needs an internet connection).
    Loading.set(0.01, 'Fetching three.js from the CDN');
    try {
      const mod = await import(CDN_THREE);
      window.THREE = mod;
    } catch (err) {
      const e = new Error('three.js could not be loaded (js/lib/three.min.js is missing and the CDN is unreachable).');
      e.code = 'NO_THREE';
      e.cause = err;
      throw e;
    }
  }

  // --------------------------------------------------------------- game
  const Game = {
    state: 'boot',
    fps: 0,
    frameMs: 16.7,
    cpuMs: 0,
    playTime: 0,
    _acc: 0,
    _last: 0,
    _frames: 0,
    _fpsTimer: 0,
    _lookedAround: 0,
    _statePausedAt: 0,

    async boot() {
      Loading.init();
      if (VHBoot.fatalShown) return; // a file failed to load; its message is already on screen
      Loading.set(0.005, 'Checking your browser');
      await VH.util.nextFrameOrTimeout(30);
      await ensureThree();
      if (!VH.features.webgl2) {
        VHBoot.fatal('Your browser can\'t run 3D graphics right now', 'WebGL 2 is not available.', webglHelp(), VH.features.webgl2Error || navigator.userAgent);
        return;
      }
      VH.util.loadKeyboardLayout();

      const settings = (this.settings = VH.settings);
      const canvas = document.getElementById('game-canvas');
      this.input = new VH.Input(canvas, settings);
      this.renderer = new VH.Renderer(canvas, settings);
      try {
        this.renderer.init();
      } catch (err) {
        VHBoot.fatal('Your browser can\'t run 3D graphics right now', err.message, webglHelp(), String(err.stack || err));
        return;
      }
      VH.PropSystem.init();
      const scene = (this.scene = new THREE.Scene());
      scene.name = 'Vicehaven';

      // Textures and materials.
      Loading.status.textContent = 'Loading city...';
      await VH.Textures.generate(this.renderer.maxAnisotropy, (p, label) => Loading.set(0.02 + p * 0.1, label));
      const materials = VH.Materials.create(VH.Textures.list);
      materials._anisotropy = this.renderer.maxAnisotropy;
      this.materials = materials;

      // Sky and light.
      Loading.set(0.13, 'Hanging the sun');
      this.environment = new VH.Environment(scene, this.renderer, settings, VH.Materials.shared);
      this.environment.init();
      await VH.util.nextFrameOrTimeout(30);

      // The city.
      Loading.set(0.15, 'Drawing the street plan');
      this.layout = VH.CityGen.generate('vicehaven');
      // Corner shops claim their lots before the city is built (stores.js).
      if (VH.Stores && VH.Stores.plan) VH.Stores.plan(this.layout);
      // Then the roadside strips along the roads out of town (suburbs.js).
      if (VH.Suburbs && VH.Suburbs.plan) VH.Suburbs.plan(this.layout);
      this.physics = new VH.CollisionWorld(16);
      this.world = new VH.World(scene, materials, this.physics, settings);
      await this.world.build(this.layout, (p, label) => Loading.set(0.16 + p * 0.72, label));
      this.roadnet = new VH.RoadNet(this.layout);

      // Jay, the camera and the systems around him.
      Loading.set(0.89, 'Jay Mercer is on his way');
      this.player = new VH.Player(scene, this.physics, this.input, settings);
      this.player.spawn(this.layout.spawn);
      this.player.surfaceResolver = (x, z, col) => this.world.surfaceAt(x, z, col);
      this.audio = new VH.AudioEngine(settings);
      this.time = 0;
      this.timeScale = 1;
      this._slowT = 0;
      this._frustum = new THREE.Frustum();
      this._projScreen = new THREE.Matrix4();
      this._sphere = new THREE.Sphere();

      // Cars, traffic, people and the effects that go with them.
      Loading.set(0.9, 'Filling up the tanks');
      this.fx = new VH.FX(this);
      this.fx.buildLampPools(this.world.lamps);
      this.fx.buildFloodPools(this.world.floodlights);
      this.vehicles = new VH.VehicleSystem(this);
      this.traffic = new VH.TrafficSystem(this);
      this.crowd = new VH.Crowd(this);
      this.player.dynamicResolver = (pos, r, y0, y1, out) => {
        this.crowd.resolvePlayer(pos, r, y0);
        return this.vehicles.resolvePlayer(pos, r, y0, y1, out);
      };
      this.player.extraGround = (x, z, maxY) => this.vehicles.roofHeight(x, z, maxY);
      this.cameraRig = new VH.CameraRig(this.renderer.camera, this.physics, settings, this.input);
      this.cameraRig.vehicles = this.vehicles;
      this.cameraRig.snapBehind(this.player);
      this.interaction = new VH.InteractionSystem(this.player, this.input);
      this.interaction.registerAll(this.world.interactables);

      this.hud = new VH.HUD(document.createElement('div'), this.input, settings);
      document.body.append(this.hud.root);
      this.ui = new VH.UI({
        settings,
        input: this.input,
        actions: {
          newGame: () => this.newGame(),
          resume: () => this.resume(),
          quitToTitle: () => this.quitToTitle(),
          getStats: () => this.statsList(),
          abandonChallenge: () => {
            if (this.missions && this.missions.run) this.missions.fail('You abandoned the job.');
            else this.challenges.abandon();
            this.resume();
          },
          challengeActive: () => this.challenges && this.challenges.active,
          continueGame: () => this.continueGame(),
          hasSave: () => !!VH.MissionEngine.loadSave(),
          save: () => {
            if (!this._autoSave()) {
              const why = this.missions.lastSaveRefusal;
              const text = why === 'storage' ? 'This browser is blocking storage for this page.' : why === 'other-tab' ? 'A newer save was made in another tab. Reload the page to carry on from it.' : 'Wait until Jay is back on his feet.';
              return this.hud.notify({ title: 'Couldn\'t save', text, icon: '✕', tone: 'bad' });
            }
            this.ui.setPauseMeta('Saved · ' + new Date().toLocaleTimeString() + (this.missions.run ? ' · this job will start again from its marker' : ''));
          },
          openMap: () => {
            this.resume();
            setTimeout(() => this.openMap(), 50);
          },
          toggleDaytime: () => this.toggleDaytime(),
          isDaytime: () => !!this.settings.get('gameplay.alwaysDay'),
          jobLog: () => this.jobLog(),
          toggleFullscreen: () => this.toggleFullscreen(),
          notify: (text) => this.hud.notify({ title: 'Vicehaven', text }),
        },
      });
      this.debug = new VH.DebugOverlay(this);
      this.challenges = new VH.ChallengeSystem(this);
      this.challenges.init();
      this.vehicleFeedback = new VH.VehicleFeedback(this);
      this.dialogue = new VH.Dialogue(this);
      this.police = new VH.Police(this);
      this.combat = new VH.Combat(this);
      this.places = new VH.Places(this);
      if (VH.Docks && this.world.docks) VH.Docks.registerPlaces(this.world.docks, this.places);
      if (VH.Estates && this.world.estates) VH.Estates.registerPlaces(this.world.estates, this.places);
      // The places beyond the old city limits, and the corner shops.
      for (const k of ['Skyline'].concat(WORLD_SYSTEMS)) if (VH[k] && VH[k].registerPlaces) VH[k].registerPlaces(this.world, this.places);
      this.places.finish();
      this.missions = new VH.MissionEngine(this);
      this.interaction.on('mission', (item) => {
        this.missions.start(item.mission);
        return 1.5;
      });
      if (VH.Activities) this.activities = new VH.Activities(this);
      if (VH.Club) this.club = new VH.Club(this);
      // Self-contained world systems: hold-ups, the airport, the fort, the
      // city's background life. Each has update/reset/stop/blips (and
      // optionally stats/serialize/load).
      this.systems = [];
      for (const k of WORLD_SYSTEMS) {
        if (!VH[k]) continue;
        const sys = new VH[k](this);
        this[k.charAt(0).toLowerCase() + k.slice(1)] = sys;
        this.systems.push(sys);
      }
      if (VH.Minimap) {
        this.minimap = new VH.Minimap(this.layout, this.hud.root, {
          closeKey: this.input.labelFor('map'),
          device: () => this.input.lastDevice,
          routeTo: (fx, fz, tx, tz) => this._gpsRoute(fx, fz, tx, tz),
          // Places worth finding that aren't on the map otherwise.
          places: () => {
            const out = [];
            for (const [id, kind] of [['mercy_general', 'Hospital'], ['vpd_central', 'Police station']]) {
              const p = this.places && this.places.get(id);
              if (p) out.push({ name: p.name, x: p.x, z: p.z, kind });
            }
            return out;
          },
        });
      }
      if (VH.Radio) this.radio = new VH.Radio(this.audio);
      if (this.radio) this.radio.onSongChange = (e) => {
        if (!this.player.inVehicle) return;
        this.hud.nowPlaying(e.station, e.title, e.artist);
        this._djLink(e.index);
      };

      // Warm up: reflections, then compile every shader before the first frame.
      Loading.set(0.93, 'Mixing the sunset');
      this.environment.update(0, new THREE.Vector3(this.layout.spawn.x, 0, this.layout.spawn.z));
      this.world.setNightFactor(this.environment.shared.uWindowGlow.value);
      this.cameraRig.titleShot(0, this._titleCenter());
      Loading.set(0.96, 'Compiling shaders');
      await this.renderer.precompile(scene);
      Loading.set(1, 'Welcome to Vicehaven');

      this._bindEvents();
      this._setupScheduler();
      this._installRuntimeErrorHandler();

      await VH.util.nextFrameOrTimeout(60);
      Loading.done();
      this.toTitle();
      this._last = performance.now();
      this.ui.setContinue(this._saveInfo());
      requestAnimationFrame((t) => this._frame(t));
      console.info('[Vicehaven] ready in ' + ((performance.now() - VHBoot.started) / 1000).toFixed(1) + ' s —',
        this.world.stats.buildings, 'buildings,', this.world.stats.props, 'props,', this.world.stats.colliders, 'colliders');
    },

    _titleCenter() {
      return { x: 40, z: -150 };
    },

    _setupScheduler() {
      const s = (this.scheduler = new Scheduler());
      s.every(15, () => {
        if (this.state === 'playing') {
          this.interaction.update();
          this._vehiclePrompt();
        }
      });
      s.every(4, () => {
        const p = this.player.pos;
        this._district = this.world.districtAt(p.x, p.z);
        this._road = this.world.roadNameAt(p.x, p.z);
        this._place = this.world.placeAt(p.x, p.z);
      });
    },

    _bindEvents() {
      // Sound effects follow gameplay events.
      const audio = this.audio;
      VH.events.on('player:step', (e) => audio.footstep(e.surface, e.speed));
      VH.events.on('player:jump', () => audio.jump());
      VH.events.on('player:land', (e) => audio.land(e.impact, e.surface));
      VH.events.on('player:climb', () => audio.climb());
      VH.events.on('interaction:used', (e) => {
        if (e.item.kind === 'vending') audio.purchase();
        else audio.click();
      });
      VH.events.on('ui:click', () => audio.click());
      VH.events.on('map:waypoint', (wp) => this.setWaypoint(wp));
      VH.events.on('map:close', () => this.closeMap());
      VH.events.on('input:lockchange', (e) => {
        // The map keeps the mouse free, even if a lock asked for earlier arrives after it opened.
        if (e.locked && this.minimap && this.minimap.isFullOpen) {
          this.input.exitLock();
          return;
        }
        if (!e.locked && this.state === 'playing' && !this.debug.inputEl.matches(':focus') && !(this.dialogue && this.dialogue._choice) && !(this.minimap && this.minimap.isFullOpen)) this.pause(); // a choice and the map free the mouse on purpose
      });
      VH.events.on('input:lockerror', () => {
        if (this.state === 'playing') this.hud.showToast('Click the game to capture the mouse');
      });
      document.getElementById('game-canvas').addEventListener('click', () => {
        if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
      });
      VH.events.on('player:died', () => {
        this.hud.notify({ title: 'Knocked out', text: 'Take it easy on those drops.', icon: '✕', tone: 'bad' });
      });
      VH.events.on('vehicle:enter', (e) => {
        this._autoSaveSoon();
        this.cameraRig.snapToCar(e.v);
        this.vehicles.lastPlayerCar = e.v;
        if (e.jacked) this.player.stats.carsStolen++;
        else if (e.v.role !== 'mission') this.player.stats.carsStolen++;
        this.hud.showVehicle(e.v);
        if (this.radio) this.radio.setActive(true);
      });
      VH.events.on('player:shot', (e) => {
        // Which way did it come from, relative to the camera?
        const cam = this.renderer.camera;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const a = Math.atan2(e.x - this.player.pos.x, e.z - this.player.pos.z) - Math.atan2(fwd.x, fwd.z);
        this.hud.damageFrom(-a);
        this.player.lastHitFrom = { x: e.x, z: e.z, t: this.time };
        if (this.renderer.post) this.renderer.post.pulse(0.16, [1, 0.05, 0.05]);
        this.cameraRig.addShake(0.12);
      });
      VH.events.on('money:changed', () => this._autoSaveSoon());
      VH.events.on('vehicle:exit', () => {
        this._autoSaveSoon();
        this.hud.showVehicle(null);
        if (this.radio) this.radio.setActive(false);
      });
      VH.events.on('ui:dialogopen', () => {
        document.body.classList.add('dialog-open');
        if (this.state === 'playing') {
          this.state = 'dialog';
          this.input.enabled = false;
        }
      });
      VH.events.on('ui:dialogclose', () => {
        document.body.classList.remove('dialog-open');
        if (this.state === 'dialog') {
          this.state = 'playing';
          this.input.enabled = true;
          this.input.clearPresses();
        }
      });
      VH.events.on('settings:changed', () => {
        this._needsRender = true;
        // The clock follows the Time of day setting straight away, not on the next load.
        if (this.environment && this.state !== 'title' && this.state !== 'loading') this.environment.clockRunning = this.settings.get('gameplay.timeOfDay') === 'cycle';
        // Lit windows and street lights follow the sky straight away (Always daytime).
        if (this.environment && this.world && this.world.setNightFactor) this.world.setNightFactor(this.environment.shared.uWindowGlow.value);
      });
      VH.events.on('renderer:resize', () => {
        this._needsRender = true;
      });
      VH.events.on('renderer:contextlost', () => {
        this.hud.notify({ title: 'Graphics reset', text: 'The graphics driver restarted. If the picture doesn\'t come back, reload the page.', icon: '⚠', tone: 'bad', duration: 8000 });
      });
      // Closing the tab, reloading, or switching away saves first. pagehide is
      // the one Edge always fires (beforeunload is skipped for some closes);
      // visibilitychange also covers sleeping tabs that are discarded later.
      window.addEventListener('beforeunload', (e) => {
        this._autoSave();
        if ((this.state === 'playing' || this.state === 'paused' || this.state === 'dialog') && this.settings.get('gameplay.confirmClose')) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      window.addEventListener('pagehide', () => this._autoSave());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        this._autoSave();
        if (this.state === 'playing') this.pause();
      });
    },

    _installRuntimeErrorHandler() {
      let shown = false;
      VHBoot.runtimeErrorHandler = (err, message) => {
        console.error('[Vicehaven] runtime error:', err);
        if (shown || !this.hud) return;
        shown = true;
        this.hud.notify({ title: 'Something went wrong', text: message + ' — the game will try to keep running. Details are in the console (F12).', icon: '⚠', tone: 'bad', duration: 10000 });
        setTimeout(() => {
          shown = false;
        }, 10000);
      };
    },

    // ------------------------------------------------------------ states
    toTitle() {
      if (this.club) this.club.stop();
      for (const s of this.systems || []) if (s.stop) s.stop();
      if (this.minimap) this.minimap.closeFull();
      this.waypoint = null;
      this._wpRoute = null;
      this.state = 'title';
      this.environment.setShadowExtent(260);
      this.input.enabled = false;
      this.hud.show(false);
      this.ui.hideAll();
      this.ui.show('title');
      document.body.classList.add('in-menu');
    },

    /** A fresh world: no leftovers from a previous session. */
    _resetWorld() {
      if (this.missions) this.missions.reset();
      this.dialogue.stop();
      this.police.reset();
      this.vehicles.clear(true);
      this.crowd.clear();
      this.fx.clearDebris();
      this.combat.load(null);
      if (this.activities) this.activities.reset();
      if (this.club) this.club.reset();
      for (const s of this.systems || []) if (s.reset) s.reset();
      this.player.state = 'ground';
      this.player.vehicle = null;
      this.player.model.setVisible(true);
      this.hud.showVehicle(null);
      this.hud.missionResult(null);
      if (this.radio) this.radio.setActive(false);
      document.body.classList.remove('cutscene');
    },

    /**
     * The play clock, and an autosave every 20 s of play (sooner after money
     * or a car changes hands). Saving often matters: on a busy machine the
     * save made as the tab closes doesn't always reach the disk in time.
     */
    _tickPlayTime(dt) {
      this.playTime += dt;
      this._autoSaveT = (this._autoSaveT || 0) + dt;
      // A refused save (knocked out, being arrested) tries again every second
      // until it goes through, instead of waiting another 20 s.
      if (this._autoSaveT > 20 && !this._autoSave()) this._autoSaveT = 19;
    },

    /** Something worth keeping just happened: save within a few seconds. */
    _autoSaveSoon() {
      this._autoSaveT = Math.max(this._autoSaveT || 0, 17);
    },

    /** Quiet save (see MissionEngine.autoSave). */
    _autoSave() {
      if (!this.missions || this.noAutoSave) return false; // noAutoSave: automated tests
      const ok = this.missions.autoSave();
      if (ok) {
        this._autoSaveT = 0;
        this._lastSaveAt = new Date();
      }
      return ok;
    },

    _saveInfo() {
      const d = VH.MissionEngine.loadSave();
      if (!d) return null;
      const done = Object.keys(d.completed || {}).filter((id) => !this.missions || this.missions.all.has(id)).length;
      const total = this.missions ? this.missions.all.size : 0;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const t = Math.floor(d.playTime || 0);
      return pct + '% · ' + Math.floor(t / 3600) + 'h ' + String(Math.floor((t % 3600) / 60)).padStart(2, '0') + 'm · ' + VH.util.formatMoney(d.money || 0);
    },

    continueGame() {
      const data = VH.MissionEngine.loadSave();
      if (!data) return this.newGame();
      this.waypoint = null;
      this._wpRoute = null;
      this.input.requestLock();
      this.audio.unlock();
      this.audio.setPaused(false);
      this.environment.setShadowExtent(null);
      this.ui.hideAll();
      document.body.classList.remove('in-menu');
      this._resetWorld();
      this.player.respawn();
      this.missions.load(data);
      // Lamps and neon match the loaded hour (the clock may be stopped, so the frame loop won't do it).
      this.world.setNightFactor(this.environment.shared.uWindowGlow.value);
      this._interrupted = data.interrupted && this.missions.all.get(data.interrupted) && !this.missions.completed[data.interrupted] ? this.missions.all.get(data.interrupted) : null;
      this._restoreHeat = data.heat > 0 && !data.interrupted ? data.heat : 0; // the police pick up the chase once playing
      this.cameraRig.snapBehind(this.player);
      this.hud.resetChecklist();
      this.hud.show(true);
      this.hud.setFade(1, 0);
      this.state = 'intro';
      this._introTime = 0;
      this._continuing = true;
      const d = this.world.districtAt(this.player.pos.x, this.player.pos.z);
      this.ui.showIntro((this.world.placeAt(this.player.pos.x, this.player.pos.z) || d.name) + ' · ' + this.environment.clockText(), 'Welcome back.');
      requestAnimationFrame(() => this.hud.setFade(0, 1400));
    },

    newGame() {
      this.waypoint = null;
      this._wpRoute = null;
      this.input.requestLock();
      this.audio.unlock();
      this.audio.setPaused(false);
      this.environment.setShadowExtent(null);
      this.ui.hideAll();
      document.body.classList.remove('in-menu');
      this._resetWorld();
      this._continuing = false;
      this.environment.setTime(17.2);
      this.world.setNightFactor(this.environment.shared.uWindowGlow.value);
      this.player.money = 340;
      this.player.armor = 0;
      for (const k of Object.keys(this.player.stats)) this.player.stats[k] = 0;
      this.player.respawn();
      this.cameraRig.snapBehind(this.player);
      this.cameraRig.modeIndex = 0;
      this.cameraRig.zoom = 0;
      this.playTime = 0;
      this.hud.resetChecklist();
      this.hud.show(true);
      this.hud.setFade(1, 0);
      this.state = 'intro';
      this._introTime = 0;
      this.ui.showIntro('Civic Plaza, Downtown · ' + this.environment.clockText(), 'Jay Mercer is back in Vicehaven.');
      requestAnimationFrame(() => this.hud.setFade(0, 1400));
    },

    _startPlaying() {
      this.state = 'playing';
      this.input.enabled = true;
      this.input.clearPresses();
      this.input.takeMouseDelta();
      this._acc = 0;
      if (!this.input.locked) this.input.requestLock();
      this.environment.clockRunning = this.settings.get('gameplay.timeOfDay') === 'cycle';
      this.missions.refreshMarkers();
      if (this._continuing) {
        const job = this._interrupted;
        this._interrupted = null;
        if (this._restoreHeat) {
          this.police.setLevel(this._restoreHeat, 'save');
          this.police._sawPlayer();
          this._restoreHeat = 0;
        }
        if (job) this.hud.notify({ title: 'Picking up where you left off', text: 'You quit in the middle of “' + job.title + '”. Walk into its marker to start it again.', icon: '↻', duration: 8000 });
        return;
      }
      // A new story: the first job starts by itself.
      const first = this.missions.nextMain;
      if (first && (first.start === 'auto' || first.start === 'intro') && !this.noAutoStory) { // noAutoStory: automated tests
        this.missions._chainPending = first.id; // no marker flash before it starts
        this.missions.refreshMarkers();
        setTimeout(() => {
          if (this.missions._chainPending !== first.id) return;
          this.missions._chainPending = null;
          if (this.state === 'title' || this.missions.run) return;
          this.missions.start(first);
          if (!this.missions.run) this.missions.refreshMarkers();
        }, 600);
      }
      else this.hud.notify({ title: 'Welcome back, Jay', text: 'Look for the glowing markers on the map (' + this.input.labelFor('map') + ') to find work.', icon: '☀', duration: 6500 });
    },

    /** Rows for the pause menu's job log. */
    jobLog() {
      const m = this.missions;
      const rows = [];
      const pr = m.progress;
      for (const job of m.main) {
        const done = !!m.completed[job.id];
        const avail = m.isAvailable(job);
        if (!done && !avail) {
          rows.push({ title: 'Act ' + (job.act || 1) + ' · ???', text: '', state: 'locked' });
          break;
        }
        const where = (VH.MissionEngine.selfStarting(job) ? m._place(job.resumeAt) : this.places.get(job.start)) || {};
        rows.push({ title: job.title, text: done ? job.summary || '' : 'Next: ' + (job.summary || '') + ' (' + (where.name || 'see the map') + ')', state: done ? 'done' : 'next' });
      }
      for (const chain of m.side) {
        const next = chain.missions.find((j) => !m.completed[j.id]);
        const doneN = chain.missions.filter((j) => m.completed[j.id]).length;
        if (!next && doneN) rows.push({ title: chain.title, text: 'Complete', state: 'done' });
        else if (next && m.isAvailable(next)) rows.push({ title: chain.title + ' (' + doneN + '/' + chain.missions.length + ')', text: next.title + ' at ' + ((this.places.get(next.start) || {}).name || '?'), state: 'next' });
      }
      // Jobs between jobs: street races, Dex's list, bounties, turf wars.
      const jobs = (this.activities && this.activities.jobs) || [];
      for (const [prefix, title] of [['race_', 'Street races'], ['list_', 'Dex\'s list'], ['bounty_', 'Bounties'], ['turf_', 'Turf wars']]) {
        const group = jobs.filter((j) => j.id.indexOf(prefix) === 0);
        if (!group.length) continue;
        const doneN = group.filter((j) => m.completed[j.id]).length;
        const next = group.find((j) => !m.completed[j.id] && m.isAvailable(j));
        const label = title + ' (' + doneN + '/' + group.length + ')';
        if (next) rows.push({ title: label, text: next.title + ' at ' + ((this.places.get(next.start) || {}).name || 'see the map'), state: 'next' });
        else if (doneN === group.length) rows.push({ title: label, text: 'Complete', state: 'done' });
        else if (doneN) rows.push({ title: label, text: 'More later in the story', state: 'done' });
      }
      return { kicker: pr.done + ' of ' + pr.total + ' jobs · ' + Math.round(pr.pct * 100) + '% complete', rows };
    },

    pause() {
      if (this.state !== 'playing' && this.state !== 'dialog') return;
      if (this.ui.dialogOpen) this.ui.closeDialog();
      if (this.minimap) this.minimap.closeFull();
      this.state = 'paused';
      this.audio.setPaused(true);
      this._statePausedAt = performance.now();
      this.input.enabled = false;
      this.input.releaseAll();
      this.input.exitLock();
      const d = this._district || this.world.districtAt(this.player.pos.x, this.player.pos.z);
      const saved = this._autoSave() ? ' · Saved ' + this._lastSaveAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      this.ui.setPauseMeta(this.player.name + ' · ' + VH.util.formatMoney(this.player.money) + ' · ' + (this._place || d.name) + saved);
      this.ui.hideAll();
      this.ui.setChallengeActive(this.challenges.active);
      this.ui.show('pause');
      document.body.classList.add('in-menu');
      this._needsRender = true;
    },

    resume() {
      if (this.state !== 'paused') return;
      this.input.requestLock();
      this.audio.setPaused(false);
      this.ui.hideAll();
      document.body.classList.remove('in-menu');
      this.state = 'playing';
      this.input.enabled = true;
      this.input.clearPresses();
      this.input.takeMouseDelta();
      this._acc = 0;
    },

    quitToTitle() {
      this._autoSave();
      this.challenges.abandon(true);
      if (this.missions.run) this.missions.fail('You quit the job.');
      this.dialogue.stop();
      this.police.reset();
      this.hud.missionResult(null);
      this.ui.setContinue(this._saveInfo());
      this.input.exitLock();
      this.audio.setPaused(false);
      this.audio.stopMusic(0.2);
      this.toTitle();
    },

    toggleFullscreen() {
      const doc = document;
      if (!doc.fullscreenElement) {
        doc.documentElement.requestFullscreen().then(() => {
          // In fullscreen, Edge lets the page keep keys like Ctrl+W instead of closing the tab.
          if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape']).catch(() => {});
        }).catch(() => {});
      } else {
        if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
        doc.exitFullscreen().catch(() => {});
      }
    },

    statsList() {
      const s = this.player.stats;
      const km = (m) => (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m');
      const t = Math.floor(this.playTime);
      const time = Math.floor(t / 3600) + 'h ' + String(Math.floor((t % 3600) / 60)).padStart(2, '0') + 'm ' + String(t % 60).padStart(2, '0') + 's';
      return [
        ['Time played', time],
        ['Distance on foot', km(s.distanceOnFoot)],
        ['Distance sprinted', km(s.sprintDistance)],
        ['Jumps', String(s.jumps)],
        ['Ledges climbed', String(s.climbs)],
        ['Walls vaulted', String(s.vaults)],
        ['Longest fall', s.longestFall.toFixed(1) + ' m'],
        ['Times knocked out', String(s.deaths)],
        ['Challenges finished', String(s.challengesCompleted || 0)],
      ].concat(this.activities ? (() => {
        const c = this.activities.completion;
        return [
          ['Stunt jumps', c.jumps + ' / ' + c.jumpsTotal],
          ['Lost lanterns', c.lanterns + ' / ' + c.lanternsTotal],
          ['Taxi fares', String(c.fares)],
          ['Best dance score', String(this.player.stats.bestDance || 0)],
        ];
      })() : []).concat(...(this.systems || []).map((sys) => (sys.stats ? sys.stats() : []))).concat([
        ['Money', VH.util.formatMoney(this.player.money)],
      ]);
    },

    // ------------------------------------------------- test/debug hooks
    /**
     * Automated tests freeze the real loop and drive time themselves, so
     * results don't depend on how fast the machine renders.
     */
    freeze(on) {
      this.frozen = !!on;
    },

    /** Advance the game by `seconds` of simulated time without rendering. */
    advance(seconds) {
      const steps = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < steps; i++) {
        this.input.pollGamepad();
        if (this.input.consume('debug')) this.debug.toggle();
        if (this.state === 'playing') {
          if (!(this.combat && this.combat.wheelOpen)) this.cameraRig.handleInput(FIXED_DT, this.player.aiming);
          this._vehicleInput();
          if (this.combat) this.combat.update(FIXED_DT);
        }
        if (this.state === 'intro') {
          this._introTime += FIXED_DT;
          if (this._introTime > 2.2) this._startPlaying();
        }
        if (this.state === 'playing') this.challenges.update(FIXED_DT);
        if (this.state === 'playing' || this.state === 'dialog') {
          this._tickPlayTime(FIXED_DT);
          this._tickExtras(FIXED_DT);
        }
        this._acc = 0;
        this._simulate(FIXED_DT, this.state === 'playing');
        this.vehicles.update(FIXED_DT, 1, this.player.pos);
        this.player.updateVisual(FIXED_DT, 1, this.cameraRig.pitch);
        this.cameraRig.update(FIXED_DT, this.player);
        this._updateFrustum();
        this.world.update(FIXED_DT, this.renderer.camera.position);
        this.environment.update(FIXED_DT, this.player.renderPos);
        this.traffic.update(FIXED_DT, this.player.pos);
        this.crowd.update(FIXED_DT, this.player.pos);
        if (this.state === 'playing') {
          this.police.update(FIXED_DT);
          this.missions.update(FIXED_DT);
          if (this.activities) this.activities.update(FIXED_DT);
          if (this.club) this.club.update(FIXED_DT);
          for (const s of this.systems) s.update(FIXED_DT);
        }
        this.dialogue.update();
        this.vehicleFeedback.update(FIXED_DT);
        this.fx.setNight(this.environment.shared.uWindowGlow.value);
        this.fx.update(FIXED_DT, this.renderer.camera, 720);
      }
    },

    /** Draw one frame of the current state right now (used for screenshots). */
    renderOnce() {
      if (this.state === 'title') this.cameraRig.titleShot(this._titleTime || 0, this._titleCenter());
      else {
        this.player.updateVisual(0, 1, this.cameraRig.pitch);
        this.cameraRig.update(1 / 60, this.player);
        if (this.missions) this.missions.updateCamera(0, this.renderer.camera); // cutscene shots
        this.hud.update(0, {
          player: this.player, district: this.world.districtAt(this.player.pos.x, this.player.pos.z),
          road: this.world.roadNameAt(this.player.pos.x, this.player.pos.z), place: this.world.placeAt(this.player.pos.x, this.player.pos.z),
          fps: this.fps, locked: true, playing: true, lookedAround: false,
        });
        // The radar too, so stills show it (and the full map, if it's open).
        if (this.minimap) {
          const state = this._mapState();
          this.minimap.update(1 / 60, state);
          if (this.minimap.isFullOpen) this.minimap.updateFull(state);
        }
      }
      this.world.update(1, this.renderer.camera.position);
      this.environment.update(0, this.state === 'title' ? new THREE.Vector3(40, 0, -150) : this.player.renderPos);
      if (this.renderer.post) this.renderer.post.flash = 0; // stills shouldn't catch a flash mid-fade
      this.renderer.render(this.scene, 1 / 60);
    },

    // -------------------------------------------------------------- loop
    _frame(now) {
      requestAnimationFrame((t) => this._frame(t));
      const rawDt = (now - this._last) / 1000;
      this._last = now;
      if (this.frozen) return;
      const dt = Math.min(Math.max(rawDt, 0), 0.1);
      const cpuStart = performance.now();
      try {
        this._update(dt);
      } catch (err) {
        if (VHBoot.runtimeErrorHandler) VHBoot.runtimeErrorHandler(err, err && err.message ? err.message : String(err));
        else throw err;
      }
      this.cpuMs = this.cpuMs * 0.9 + (performance.now() - cpuStart) * 0.1;
      this.frameMs = this.frameMs * 0.9 + rawDt * 1000 * 0.1;
      this.debug.recordFrame(rawDt * 1000);
      this._frames++;
      this._fpsTimer += rawDt;
      if (this._fpsTimer >= 0.5) {
        this.fps = Math.round(this._frames / this._fpsTimer);
        this._frames = 0;
        this._fpsTimer = 0;
      }
    },

    _update(dt) {
      const input = this.input;
      input.pollGamepad();

      // Global keys: pause and the developer overlay.
      if (input.consume('debug')) this.debug.toggle();
      // (In menus, Esc is handled by ui.js; resuming needs a click or Enter,
      // because browsers only grant pointer lock from a real user gesture.)
      if (input.consume('pause')) {
        const recent = performance.now() - this._statePausedAt < 400;
        if (this.minimap && this.minimap.isFullOpen && (this.state === 'playing' || this.state === 'dialog')) this.closeMap();
        else if ((this.state === 'playing' || this.state === 'dialog') && !recent) this.pause();
      }

      const env = this.environment;
      switch (this.state) {
        case 'title': {
          this._titleTime = (this._titleTime || 0) + dt;
          this.cameraRig.titleShot(this._titleTime, this._titleCenter());
          const c = this._titleCenter();
          const focus = this._tmpFocus || (this._tmpFocus = new THREE.Vector3());
          focus.set(c.x, 0, c.z);
          env.update(dt, focus);
          this.world.update(dt, this.renderer.camera.position);
          this.player.updateVisual(dt, 1, 0);
          this.audio.update(dt, { playing: false, height: 0, speed: 0, sea: 0 });
          this.renderer.render(this.scene, dt);
          break;
        }
        case 'intro': {
          this._introTime += dt;
          this._simulate(dt, false);
          this._drawGameplay(dt, true);
          if (this._introTime > 2.2) this._startPlaying();
          break;
        }
        case 'playing':
        case 'dialog': {
          if (this.minimap && this.minimap.isFullOpen) {
            this._mapFrame(dt);
            break;
          }
          this._tickPlayTime(dt);
          this._tickExtras(dt);
          if (this.state === 'playing') {
            if (!(this.combat && this.combat.wheelOpen)) this.cameraRig.handleInput(dt, this.player.aiming);
            this._vehicleInput();
            if (this.combat) this.combat.update(dt);
            this._laterFeatureHints();
            this.challenges.update(dt);
          } else input.takeMouseDelta();
          this._simulate(dt, true);
          this._drawGameplay(dt, false);
          break;
        }
        case 'paused': {
          // Nothing moves; redraw only when something (settings, window size) changed.
          if (this._needsRender) {
            this.renderer.render(this.scene, dt);
            this._needsRender = false;
          }
          break;
        }
        default:
          break;
      }
      this.debug.update(dt);
    },

    /** F: get in (or pull the driver out of) the nearest car; F again: get out. */
    _vehicleInput() {
      const inp = this.input;
      const p = this.player;
      if (inp.consume('vehicle')) {
        // On a controller Y also talks and uses things; a prompt wins over the nearest car.
        const padUse = inp.lastDevice === 'gamepad' && !p.inVehicle && this.interaction.current;
        if (padUse) {
          // handled by the interaction system
        } else if (p.inVehicle) this.vehicles.exitVehicle();
        else if (!this.vehicles.entering && (p.state === 'ground' || p.state === 'air') && !p.frozen) {
          const t = this.vehicles.findEnterable(p.pos.x, p.pos.z, 3.2);
          if (t) this.vehicles.beginEnter(t);
        }
      }
      if (p.inVehicle) {
        if (inp.consume('reload') && this.radio) {
          this.radio.next();
          this.hud.showToast(this.radio.station.name);
        }
      }
      if (inp.consume('map') && this.minimap) this.toggleMap();
      if (inp.consume('daytime')) this.toggleDaytime();
    },

    /** T, D-pad right or the pause menu: the sun stays up (Always daytime), or the day and night cycle comes back. */
    toggleDaytime() {
      const on = !this.settings.get('gameplay.alwaysDay');
      this.settings.set('gameplay.alwaysDay', on);
      this._nightTipShown = true; // they know about it now
      const key = this.input.labelFor('daytime');
      this.hud.notify(on
        ? { title: 'Daytime on', text: 'The sun stays up. Press ' + key + ' again for the day and night cycle.', icon: '☀', duration: 4000 }
        : { title: 'Day and night', text: 'Night falls again in the evening. Press ' + key + ' any time to bring the sun back.', icon: '☾', duration: 4000 });
    },

    /** "F  Get in" prompt next to an enterable car. */
    _vehiclePrompt() {
      const p = this.player;
      let text = null;
      if (!p.inVehicle && p.state === 'ground' && !this.vehicles.entering && !this.interaction.current) {
        const t = this.vehicles.findEnterable(p.pos.x, p.pos.z, 3.2);
        if (t) text = (t.v.driver === 'ai' ? 'Steal ' : 'Get in ') + (t.v.storyName || 'the ' + t.v.name);
      }
      this.hud.setVehiclePrompt(text, this.input.labelFor('vehicle'));
    },

    /** After the last job: the credits, then free roam. */
    endCredits() {
      const m = this.missions;
      const f = m.flags;
      const ending = f.ending_a ? 'Ending: Taillights' : f.ending_b ? 'Ending: The Long Way Home' : f.ending_c ? 'Ending: Wheelman' : '';
      const chars = (VH.Data.story && VH.Data.story.characters) || {};
      const ids = ['jay', 'dex', 'mae', 'augie', 'noor', 'ansel', 'calder', 'teo', 'rhea', 'birdie', 'lourdes', 'horne', 'rourke', 'voss', 'nana_lu', 'tommy'];
      const cast = ids.filter((id) => chars[id]).map((id) => ({ name: chars[id].name, role: chars[id].role || '' }));
      const done = Object.keys(m.completed).filter((id) => m.all.has(id));
      const side = done.filter((id) => (m.all.get(id) || {})._chain).length;
      const jobs = done.filter((id) => (m.all.get(id) || {}).activity).length;
      const mins = Math.round((this.playTime || 0) / 60);
      const stats = [
        ['Time on the road', Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min'],
        ['Story jobs', String(done.filter((id) => (m.all.get(id) || {})._main).length) + ' / ' + m.main.length],
        ['Side stories', side + ' / ' + Array.from(m.all.values()).filter((x) => x._chain).length + ' jobs'],
        ['Jobs between jobs', String(jobs)],
        ['Taxi fares', String(this.activities ? this.activities.taxi.done : 0)],
        ['Money in your pocket', VH.util.formatMoney(this.player.money)],
      ];
      if (this.audio.moodPad) this.audio.moodPad('hope');
      this.frozenControls = true;
      this.player.frozen = true;
      this.ui.showCredits({ ending, cast, stats }, () => {
        this.frozenControls = false;
        this.player.frozen = false;
        if (this.audio.moodPad) this.audio.moodPad(null);
        this.hud.notify({ title: 'Vicehaven', text: 'The races, fares, bounties and side stories are still out there.', icon: '☀', duration: 7000 });
      });
    },

    /** Between songs the station's host sometimes says something. */
    _djLink(index) {
      const stations = (VH.Data.story && VH.Data.story.activities && VH.Data.story.activities.radio) || [];
      const st = stations[index];
      if (!st || !this.dialogue || this.dialogue.active || Math.random() > 0.55) return;
      const m = this.missions;
      const unlocked = (l) => (!l.after || (m && m.completed[l.after])) && (!l.flag || (m && m.flags[l.flag]));
      const open = st.lines.filter(unlocked);
      // Topical lines (ones that follow a story beat) get first go.
      this._djHeard = this._djHeard || {};
      const fresh = open.filter((l) => !this._djHeard[l.text]);
      const topical = fresh.filter((l) => l.after || l.flag);
      const pool = topical.length ? topical : fresh.length ? fresh : open;
      const line = pool[Math.floor(Math.random() * pool.length)];
      if (!line) return;
      this._djHeard[line.text] = true;
      const c = (VH.Data.story.characters || {})[st.dj] || { name: 'Radio' };
      setTimeout(() => {
        if (!this.player.inVehicle || this.dialogue.active || (this.radio && this.radio.station.index !== index)) return;
        this.dialogue.radio(c.name, line.text, false);
        if (this.settings.get('gameplay.voicedDialogue')) this.dialogue._speak(st.dj, line.text);
      }, 1800);
    },

    /** Is a point (roughly) on screen? Used to avoid popping things in under the player's nose. */
    isVisible(x, y, z, r) {
      this._sphere.center.set(x, y, z);
      this._sphere.radius = r || 1;
      return this._frustum.intersectsSphere(this._sphere);
    },

    _updateFrustum() {
      const cam = this.renderer.camera;
      this._projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      this._frustum.setFromProjectionMatrix(this._projScreen);
    },

    /** A slow-motion beat: `seconds` of real time at `scale` speed. */
    slowmo(seconds, scale) {
      if (!this.settings.get('gameplay.slowMotion')) return;
      this._slowT = Math.max(this._slowT, seconds);
      this.timeScale = Math.min(this.timeScale, scale);
    },

    /** World systems' saved state (store cooldowns and the like), keyed by each system's saveKey. */
    saveSystems() {
      const out = {};
      for (const s of this.systems || []) if (s.saveKey && s.serialize) out[s.saveKey] = s.serialize();
      return out;
    },

    loadSystems(d) {
      for (const s of this.systems || []) if (s.load) s.load(d && s.saveKey ? d[s.saveKey] : undefined);
    },

    /** Everything the minimap shows. */
    blips() {
      const out = this._blipList || (this._blipList = []);
      out.length = 0;
      for (const v of this.police.units) {
        if (v.removed || v.wrecked) continue;
        out.push({ x: v.pos.x, z: v.pos.z, type: 'police', heading: v.yaw, flash: true });
      }
      if (this.police.heli) out.push({ x: this.police.heli.pos.x, z: this.police.heli.pos.z, type: 'police', flash: true, label: 'Air unit' });
      if (this.missions && this.missions.blips) this.missions.blips(out);
      if (this.activities && this.activities.blips && !(this.missions && this.missions.run)) this.activities.blips(out);
      if (this.club && !(this.missions && this.missions.run)) this.club.blips(out);
      for (const s of this.systems || []) if (s.blips) s.blips(out, !!(this.missions && this.missions.run));
      if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, type: 'waypoint', label: this.waypoint.name });
      if (this.minimap) this.minimap.pinBlips(out);
      return out;
    },

    // ------------------------------------------------------- map and GPS
    /** A job or a fare is showing the way (its route goes quiet near the marker; the waypoint must not jump in). */
    _guided() {
      const m = this.missions;
      const a = this.activities;
      return !!((m && m.run && m._routeTo) || (a && a.taxi && a.taxi.fare));
    },

    /** Everything the radar and the full map need this frame. */
    _mapState() {
      const player = this.player;
      const pv = player.vehicle;
      return {
        x: player.pos.x, z: player.pos.z, heading: pv ? pv.yaw : player.heading, camYaw: this.cameraRig.yaw,
        speed: pv ? pv.speed : player.speed, blips: this.blips ? this.blips() : [], searchArea: this.police ? this.police.searchArea : null,
        route: this.route || (this._guided() ? null : this._wpRoute) || null, waypoint: this.waypoint || null, heat: this.police ? this.police.level : 0, visible: this.state === 'playing' || this.state === 'dialog',
      };
    },

    /** The full map pauses the game and frees the mouse so the map can be dragged, zoomed and clicked. */
    openMap() {
      if (!this.minimap || this.minimap.isFullOpen) return;
      if (document.body.classList.contains('cutscene') || this.player.frozen) return; // not during a scene
      this.minimap.updateFull(this._mapState(), 0);
      this.minimap.openFull();
      this.input.exitLock();
      this.input.releaseAll();
      this.audio.setPaused(true);
      this._sawMap = true;
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch (e) {
        // Private mode: the tip just shows again next time.
      }
    },

    closeMap() {
      if (!this.minimap || !this.minimap.isFullOpen) return;
      this.minimap.closeFull();
      // Keys pressed on the map (Space, E, Q...) mean nothing to the game.
      this.input.clearPresses();
      this.input.releaseAll();
      this.input.takeMouseDelta();
      this._acc = 0;
      if (this.state === 'playing' || this.state === 'dialog') this.audio.setPaused(false);
      if ((this.state === 'playing' || this.state === 'dialog') && !this.input.locked && !(this.dialogue && this.dialogue._choice)) this.input.requestLock();
    },

    toggleMap() {
      if (this.minimap && this.minimap.isFullOpen) this.closeMap();
      else this.openMap();
    },

    /** A frame with the full map open: the game holds still; the map gets the keys, the mouse and the pad. */
    _mapFrame(dt) {
      const input = this.input;
      input.takeMouseDelta();
      input.takeWheel();
      if (input.consume('map') || document.body.classList.contains('cutscene') || this.player.frozen) {
        this.closeMap();
        return;
      }
      this.minimap.updateFull(this._mapState(), dt, input.pad);
    },

    /** Per-frame odds and ends while playing: the GPS, and the update tip. */
    _tickExtras(dt) {
      if (this.minimap && this.minimap.isFullOpen && (document.body.classList.contains('cutscene') || this.player.frozen)) this.closeMap();
      this._updateWaypoint(dt);
      // The first time it gets properly dark, say how to bring the sun back.
      if (!this._nightTipShown && this.environment.nightFactor > 0.6 && !this.settings.get('gameplay.alwaysDay') && this.state === 'playing' && !document.body.classList.contains('cutscene')) {
        this._nightTipShown = true;
        this.hud.notify({ title: 'Too dark?', text: 'Press ' + this.input.labelFor('daytime') + ' to switch to daytime. Settings → Graphics → Night brightness lights up the night instead.', icon: '☀', duration: 9000 });
      }
      if (this._sawMap || this._tipShown) return;
      if (document.body.classList.contains('cutscene') || this.state !== 'playing') {
        this._tipT = 0;
        return;
      }
      this._tipT = (this._tipT || 0) + dt;
      if (this._tipT < 4) return;
      this._tipShown = true;
      let seen = false;
      try {
        seen = localStorage.getItem(SEEN_KEY) === '1';
      } catch (e) {
        seen = false;
      }
      if (seen) return;
      this.hud.notify({
        title: 'New in Vicehaven ' + VH.VERSION.replace(/\.0$/, ''),
        text: 'Press ' + this.input.labelFor('map') + ' for the map: the airport, the army base, the Northgate skyscrapers and 14 corner shops are on it. Click a place to set your GPS.',
        icon: '★',
        duration: 14000,
      });
    },

    /** A waypoint from the map ({ x, z, name }), or null to clear it. */
    setWaypoint(wp) {
      if (!wp) {
        if (this.waypoint) this.hud.showToast('GPS cleared');
        this.waypoint = null;
        this._wpRoute = null;
        return;
      }
      this.waypoint = { x: wp.x, z: wp.z, name: wp.name || 'Waypoint' };
      // Route it now: the game (and so the per-second refresh) is paused while the map is open.
      this._wpRoute = this._gpsRoute(this.player.pos.x, this.player.pos.z, wp.x, wp.z);
      this._wpT = 1;
      this.hud.showToast('GPS set: ' + this.waypoint.name);
      if (this.audio && this.audio.click) this.audio.click();
    },

    /** Keep the waypoint's route fresh; clear it on arrival. */
    _updateWaypoint(dt) {
      const w = this.waypoint;
      if (!w) return;
      const p = this.player.pos;
      const b = this.layout.config.bounds;
      const ax = Math.max(b.minX + 4, w.x); // the hedge wall stands on the west edge
      const az = Math.max(b.minZ + 4, Math.min(w.z, b.maxZ - 4));
      if (Math.hypot(p.x - ax, p.z - az) < 20) {
        this.hud.notify({ title: 'You have arrived', text: w.name, icon: '📍', duration: 3500 });
        this.waypoint = null;
        this._wpRoute = null;
        return;
      }
      this._wpT = (this._wpT || 0) - dt;
      if (this._wpT > 0) return;
      this._wpT = 1;
      this._wpRoute = this._gpsRoute(p.x, p.z, w.x, w.z);
    },

    /**
     * Road route to a point. Inside the airport's fence or the army base's
     * walls the roads don't reach, so the route goes in by the gate.
     */
    _gpsRoute(fx, fz, tx, tz) {
      if (!VH.Minimap || !VH.Minimap.route) return null;
      const lay = this.layout;
      const inside = (r, x, z) => r && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
      const road = (x0, z0, x1, z1) => (Math.hypot(x0 - x1, z0 - z1) > 30 ? VH.Minimap.route(lay, x0, z0, x1, z1) : null) || [[x0, z0], [x1, z1]];
      // Airside at the airport: in by the service gate.
      const af = lay.airport && lay.airport.fence;
      if (af && inside(af, tx, tz)) {
        if (inside(af, fx, fz)) return [[fx, fz], [tx, tz]];
        const g = lay.airport.gate;
        const r = road(fx, fz, g.x, g.z);
        r.push([g.x, af.maxZ - 10], [tx, tz]);
        return r;
      }
      // Inside the army base's walls: in through the gate, then up the apron.
      const fw = lay.fort && lay.fort.wall;
      if (fw && tx > fw.x0 && tx < fw.x1 && tz > fw.z0 && tz < fw.z1) {
        const wall = { minX: fw.x0, maxX: fw.x1, minZ: fw.z0, maxZ: fw.z1 };
        if (inside(wall, fx, fz)) return [[fx, fz], [tx, tz]];
        const gz = (lay.fort.gate.z0 + lay.fort.gate.z1) / 2;
        const r = road(fx, fz, fw.x1 + 20, gz);
        r.push([fw.x1 - 15, gz], [tx, tz]);
        return r;
      }
      if (Math.hypot(fx - tx, fz - tz) < 30) return null;
      return VH.Minimap.route(lay, fx, fz, tx, tz);
    },

    /** Caught: the arrest sequence, a fine, and release outside the precinct. */
    arrested() {
      if (this._arresting) return;
      this._arresting = true;
      const p = this.player;
      VH.events.emit('player:arrested', {});
      this.slowmo(1.6, 0.3);
      this.hud.bigText('ARRESTED');
      if (this.audio.bustedSting) this.audio.bustedSting();
      this.police._dispatch('arrest');
      p.stats.timesArrested = (p.stats.timesArrested || 0) + 1;
      setTimeout(() => this.hud.setFade(1, 700), 1400);
      setTimeout(() => {
        if (p.inVehicle) this.vehicles.exitVehicle();
        const fine = Math.min(2500, Math.max(100, Math.round(p.money * 0.08)));
        p.money = Math.max(0, p.money - fine);
        this.police.reset();
        const sp = (this.places && this.places.get('police_station')) || this.layout.spawn;
        p.teleport(sp.x, sp.z, sp.yaw || 0);
        p.state = 'ground';
        p.health = Math.max(p.health, 60);
        this.resetCars();
        this.cameraRig.snapBehind(p);
        if (this.combat) this.combat.onArrested();
        this.hud.setFade(0, 900);
        this.hud.notify({ title: 'Released on bail', text: 'Vicehaven Central Precinct took ' + VH.util.formatMoney(fine) + ' off you.', icon: '⚖', tone: 'bad', duration: 6000 });
        VH.events.emit('money:changed', { delta: -fine, reason: 'bail' });
        this._arresting = false;
      }, 2300);
    },

    /**
     * Every respawn (the hospital, release on bail, retrying a job) puts the
     * cars back as if the city had just loaded: wrecks, abandoned and stolen
     * cars, police, traffic and parked cars all go, and fresh ones fill the
     * streets around Jay. Kept: the car Jay is sitting in, the cars of a job
     * that is running, and the King of the Road prize (back at its spot).
     */
    resetCars() {
      const keep = this.player.vehicle || null;
      const run = this.missions && this.missions.run;
      const jobCars = run ? Array.from(run.cars.values()) : [];
      if (this.police) this.police.reset();
      for (const v of this.vehicles.list.slice()) {
        if (v === keep || jobCars.includes(v)) continue;
        this.vehicles.remove(v);
      }
      if (keep && keep.repair) keep.repair(); // Jay's car comes back fixed
      this.vehicles.lastPlayerCar = keep;
      if (this.activities && this.activities._spawnKingCar) {
        this.activities.kingCar = null;
        this.activities._spawnKingCar();
      }
      // Kerbside spaces are free again, except where a car still stands.
      for (const s of this.vehicles.spots || []) {
        if (s.vehicle && !s.vehicle.removed) continue;
        s.vehicle = null;
        s.used = this.vehicles.list.some((v) => Math.hypot(v.pos.x - s.x, v.pos.z - s.z) < 6);
      }
      this.vehicles._streamTimer = 0;
      const at = this.player.pos;
      if (this.traffic && this.traffic.repopulate) this.traffic.repopulate(at.x, at.z);
      VH.events.emit('cars:reset', {});
    },

    giveMoney(amount, reason, quiet) {
      this.player.money += amount;
      VH.events.emit('money:changed', { delta: amount, reason, quiet });
    },

    /** Keys for systems that arrive in later phases say so, instead of doing nothing. */
    _laterFeatureHints() {
      const v = this.player.vehicle;
      if (v && v.type === 'cab') return; // P is taxi duty there (activities.js)
      const LATER = {
        phone: 'P puts you on taxi duty — get in a cab first',
      };
      for (const action of Object.keys(LATER)) {
        if (this.input.consume(action)) this.hud.showToast(LATER[action]);
      }

    },

    /** Fixed-step simulation plus the scheduled tasks. */
    _simulate(dt, live) {
      // Slow motion: scaled simulation time, easing back to normal.
      if (this._slowT > 0) {
        this._slowT -= dt;
        if (this._slowT <= 0) this._slowT = 0;
      }
      this.timeScale = this._slowT > 0 ? this.timeScale : Math.min(1, this.timeScale + dt * 2.5);
      dt *= this.timeScale;
      this._acc += dt;
      this.time += dt;
      let steps = 0;
      while (this._acc >= FIXED_DT && steps < 5) {
        this.player._camPitch = this.cameraRig.pitch;
        this.vehicles.fixedUpdate(FIXED_DT);
        this.player.fixedUpdate(FIXED_DT, this.cameraRig.yaw);
        this._acc -= FIXED_DT;
        steps++;
      }
      if (steps === 5) this._acc = 0; // far behind (e.g. after a hitch): drop the backlog
      this.scheduler.update(dt);

      if (live) {
        // Knocked out: respawn after a pause.
        if (this.player.isDead && !this.challenges.active && this.player.deadTime > 4.5) {
          this.hud.setFade(1, 400);
          if (this.player.deadTime > 5.1) {
            const p = this.player;
            this.police.reset();
            const hosp = this.places && this.places.get('hospital');
            p.respawn();
            if (hosp) p.teleport(hosp.x, hosp.z, hosp.yaw || 0);
            this.resetCars();
            const fee = Math.min(p.money, 300);
            p.money -= fee;
            if (this.combat) this.combat.onHospital();
            this.cameraRig.snapBehind(p);
            this.hud.setFade(0, 900);
            this.hud.notify({ title: 'Patched up', text: (hosp ? 'Harbor General' : 'The paramedics') + ' sent you home ' + VH.util.formatMoney(fee) + ' lighter.', icon: '✚', duration: 6000 });
          }
        }
        // "Look around" counts as done after a little mouse movement.
        this._lookedAround += Math.abs(this.cameraRig.yaw - (this._lastYaw || this.cameraRig.yaw));
        this._lastYaw = this.cameraRig.yaw;
      }
    },

    _drawGameplay(dt, intro) {
      const alpha = this._acc / FIXED_DT;
      const player = this.player;
      const sdt = dt * this.timeScale;
      this.vehicles.update(sdt, alpha, player.pos);
      player.updateVisual(sdt, alpha, this.cameraRig.pitch);
      if (intro) {
        // Settle from a high establishing shot down behind Jay.
        const t = VH.math.smoothstep(0, 2.2, this._introTime);
        this.cameraRig.update(dt, player);
        const cam = this.renderer.camera;
        const from = this._introFrom || (this._introFrom = new THREE.Vector3());
        from.set(player.pos.x - 30, player.pos.y + 38, player.pos.z + 50);
        const to = cam.position.clone();
        cam.position.lerpVectors(from, to, t);
        const look = new THREE.Vector3(player.renderPos.x, player.renderPos.y + 1.4, player.renderPos.z);
        if (t < 0.999) {
          const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0)));
          const q1 = cam.quaternion.clone();
          cam.quaternion.slerpQuaternions(q0, q1, t * t);
        }
        cam.updateMatrixWorld();
      } else if (!(this.missions && this.missions.updateCamera(dt, this.renderer.camera))) {
        this.cameraRig.update(dt, player);
      }
      this._updateFrustum();
      this.world.update(sdt, this.renderer.camera.position);
      this.environment.update(sdt, player.renderPos);
      const glow = this.environment.shared.uWindowGlow.value;
      if (this.environment.clockRunning) this.world.setNightFactor(glow);
      this.traffic.update(sdt, player.pos);
      this.crowd.update(sdt, player.pos);
      if (this.state === 'playing' || this.state === 'dialog') {
        this.police.update(sdt);
        this.missions.update(sdt);
        if (this.activities) this.activities.update(sdt);
        if (this.club) this.club.update(sdt);
        for (const s of this.systems) s.update(sdt);
      }
      this.dialogue.update();
      const cw = this.combat.weapon;
      this.hud.setWeapon(cw, this.combat.inventory[cw.id], this.combat.reloading);
      if (this.combat.hitMarkerT > 0.17) this.hud.flashHit();
      this.hud.setHeat(this.police.level, !this.police.seen && this.police.level > 0, this.police.bust);
      this.vehicleFeedback.update(sdt);
      this.fx.setNight(glow);
      this.fx.update(sdt, this.renderer.camera, this.renderer.height || window.innerHeight);
      if (this.minimap) {
        const state = this._mapState();
        this.minimap.update(dt, state);
        if (this.minimap.isFullOpen) this.minimap.updateFull(state);
      }
      const d = this._district || this.world.districtAt(player.pos.x, player.pos.z);
      this.hud.update(dt, {
        player,
        district: d,
        road: this._road,
        place: this._place,
        fps: this.fps,
        locked: this.input.locked,
        playing: this.state === 'playing',
        lookedAround: this._lookedAround > 1.2,
        nitro: this.vehicles.nitro,
      });
      const px = player.pos.x;
      const pier = this.layout.waterfront.pier;
      const onPier = px > pier.x0 && Math.abs(player.pos.z) < 30 ? 1 : 0;
      this.audio.update(dt, {
        playing: this.state === 'playing',
        height: player.pos.y,
        speed: player.speed,
        sea: Math.max(onPier, VH.math.smoothstep(250, 420, px)),
      });
      this.renderer.render(this.scene, dt);
    },
  };

  VH.Game = Game;
  VH.game = Game; // handy from the browser console: VH.game.player.pos

  function start() {
    Game.boot().catch((err) => {
      console.error(err);
      if (err && err.code === 'NO_THREE') {
        VHBoot.fatal('A game file is missing', err.message,
          '<p>The file <code>js/lib/three.min.js</code> should be inside the vicehaven folder. Re-download or re-extract the game, or connect to the internet so it can be fetched from the CDN.</p>',
          String(err.cause || ''));
      } else {
        VHBoot.fatal('Vicehaven couldn\'t start', err && err.message ? err.message : String(err),
          '<p>Try reloading the page. If it keeps happening, the details below will help track it down.</p>',
          err && err.stack ? err.stack : String(err));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
