/*
 * hud.js — the in-game heads-up display.
 *
 *   top right     money (with +/- change flashes); wanted stars (Phase 8)
 *   bottom left   location (place · street · district), health and armour
 *   centre        crosshair while aiming, interaction prompt
 *   top left      notifications, FPS counter
 *   right         the "Getting started" checklist (the Phase 1 tutorial)
 *   full screen   fades, and the knocked-out overlay
 *
 * DOM writes only happen when a value actually changes, so the HUD costs
 * almost nothing per frame.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const el = (tag, cls, text) => VH.util.el(tag, cls, text);

  const CHECKLIST = [
    { id: 'move', label: 'Walk around', keys: ['moveForward', 'moveLeft', 'moveBack', 'moveRight'] },
    { id: 'look', label: 'Look around', keysText: 'Mouse' },
    { id: 'sprint', label: 'Sprint', keys: ['sprint'] },
    { id: 'jump', label: 'Jump', keys: ['jump'] },
    { id: 'climb', label: 'Climb a crate or vault a wall', keys: ['jump'], note: 'NE corner of the plaza' },
    { id: 'crouch', label: 'Crouch', keys: ['crouch'] },
    { id: 'aim', label: 'Raise your guard (aim)', keys: ['aim'] },
    { id: 'camera', label: 'Change camera', keys: ['camera'], extra: 'Wheel to zoom' },
    { id: 'interact', label: 'Use a vending machine or the city guide', keys: ['interact'] },
  ];

  class HUD {
    constructor(root, input, settings) {
      this.input = input;
      this.settings = settings;
      this.root = root;
      this._cache = {};
      this._lastMoney = null;
      this._notifyQueue = [];
      this.checklist = {};
      this._build();
      this._bindEvents();
    }

    _build() {
      const r = this.root;
      r.className = 'hud';

      // Top right: money and (later) wanted level.
      const tr = el('div', 'hud-top-right');
      this.moneyEl = el('div', 'hud-money');
      this.moneyValue = el('span', 'money-value', '$0');
      this.moneyDelta = el('span', 'money-delta');
      this.moneyEl.append(this.moneyValue, this.moneyDelta);
      this.wantedEl = el('div', 'hud-wanted');
      this.heatPips = [];
      for (let i = 0; i < 5; i++) {
        const pip = el('span', 'heat-pip');
        this.wantedEl.append(pip);
        this.heatPips.push(pip);
      }
      this.bustBar = el('div', 'hud-bust');
      this.bustFill = el('div', 'fill');
      this.bustBar.append(el('span', '', 'BUSTED'), this.bustFill);
      tr.append(this.moneyEl, this.wantedEl, this.bustBar);

      // Bottom left: location and vitals.
      const bl = el('div', 'hud-bottom-left');
      this.locPlace = el('div', 'loc-place');
      this.locSub = el('div', 'loc-sub');
      const loc = el('div', 'hud-location');
      loc.append(this.locPlace, this.locSub);
      const bars = el('div', 'hud-bars');
      this.healthFill = el('div', 'fill');
      this.armorFill = el('div', 'fill');
      const health = el('div', 'bar bar-health');
      const hIcon = el('span', 'bar-icon', '✚');
      const hTrack = el('div', 'bar-track');
      hTrack.append(this.healthFill);
      health.append(hIcon, hTrack);
      const armor = el('div', 'bar bar-armor');
      const aIcon = el('span', 'bar-icon', '⛨');
      const aTrack = el('div', 'bar-track');
      aTrack.append(this.armorFill);
      armor.append(aIcon, aTrack);
      this.healthBar = health;
      this.armorBar = armor;
      bars.append(health, armor);
      bl.append(loc, bars);

      // Centre.
      this.crosshair = el('div', 'hud-crosshair');
      this.crosshair.append(el('i'), el('i'), el('i'), el('i'));
      this.prompt = el('div', 'hud-prompt');
      this.promptKey = el('kbd', '', 'E');
      this.promptLabel = el('span', 'prompt-label');
      this.promptPrice = el('span', 'prompt-price');
      this.prompt.append(this.promptKey, this.promptLabel, this.promptPrice);
      this.lockHint = el('div', 'hud-lock-hint', 'Click to capture the mouse');

      // Top left.
      this.fpsEl = el('div', 'hud-fps');
      this.notifyStack = el('div', 'hud-notify-stack');

      // District banner.
      this.banner = el('div', 'hud-banner');
      this.bannerTitle = el('div', 'banner-title');
      this.bannerSub = el('div', 'banner-sub');
      this.banner.append(this.bannerTitle, this.bannerSub);

      // Toast for camera mode etc.
      this.toast = el('div', 'hud-toast');

      // Getting-started checklist.
      this.hints = el('div', 'hud-hints');
      const hh = el('div', 'hints-title', 'Getting started');
      this.hintsList = el('ul', 'hints-list');
      this.hints.append(hh, this.hintsList);
      this._buildChecklist();

      // Knocked-out overlay and fades.
      this.knockout = el('div', 'hud-knockout');
      this.knockout.append(el('h2', '', 'Knocked out'), el('p', '', 'You come to a few moments later…'));
      this.fade = el('div', 'hud-fade');

      // Challenge HUD: timer, checkpoint count, splits, countdown, objective marker, results.
      this.chal = el('div', 'hud-challenge');
      this.chalName = el('div', 'chal-name');
      this.chalTimer = el('div', 'chal-timer', '0:00.00');
      this.chalInfo = el('div', 'chal-info');
      this.chalPop = el('div', 'chal-pop');
      this.chal.append(this.chalName, this.chalTimer, this.chalInfo, this.chalPop);
      this.big = el('div', 'hud-bigtext');
      this.cbanner = el('div', 'hud-center-banner');
      this.cbannerTitle = el('div', 'cb-title');
      this.cbannerSub = el('div', 'cb-sub');
      this.cbanner.append(this.cbannerTitle, this.cbannerSub);
      this.objective = el('div', 'hud-objective');
      this.objArrow = el('div', 'obj-arrow');
      this.objDiamond = el('div', 'obj-diamond');
      this.objDist = el('div', 'obj-dist');
      this.objective.append(this.objArrow, this.objDiamond, this.objDist);
      this.resultsEl = el('div', 'hud-results');

      // Driving: speedometer with gear, nitro and damage, the car's name, score pops.
      this.speedo = el('div', 'hud-speedo');
      this.speedValue = el('div', 'speedo-value', '0');
      this.speedUnit = el('div', 'speedo-unit', 'km/h');
      this.speedGear = el('div', 'speedo-gear', '1');
      const nitro = el('div', 'speedo-bar speedo-nitro');
      this.nitroFill = el('div', 'fill');
      this.nitroLabel = el('span', 'bar-label', 'NITRO');
      nitro.append(this.nitroLabel, this.nitroFill);
      const dmg = el('div', 'speedo-bar speedo-damage');
      this.damageFill = el('div', 'fill');
      dmg.append(el('span', 'bar-label', 'BODY'), this.damageFill);
      // The gauge: a 270 degree dial with tick marks, a sweeping arc and a needle.
      // (hud.css sizes it; --speed 0..1 is the only thing the frame loop sets.)
      this.speedArc = el('div', 'speedo-arc');
      const at = (deg, r) => [(100 + r * Math.cos((deg * Math.PI) / 180)).toFixed(2), (100 + r * Math.sin((deg * Math.PI) / 180)).toFixed(2)];
      let ticks = '';
      for (let i = 0; i <= 27; i++) {
        const deg = 135 + (i * 270) / 27;
        const major = i % 3 === 0;
        const a = at(deg, major ? 77 : 80);
        const b = at(deg, 86);
        ticks += '<line class="' + (major ? 'tk major' : 'tk') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
      }
      this.speedArc.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true">'
        + '<defs><linearGradient id="spd-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#35e0d0"/><stop offset="0.55" stop-color="#ffb347"/><stop offset="1" stop-color="#ff4f8b"/></linearGradient></defs>'
        + '<path class="track" pathLength="100" d="M 39.2 160.8 A 86 86 0 1 1 160.8 160.8"/>'
        + '<path class="prog" pathLength="100" d="M 39.2 160.8 A 86 86 0 1 1 160.8 160.8"/>'
        + '<g class="ticks">' + ticks + '</g>'
        + '<g class="needle"><polygon points="100,22 96.5,98 103.5,98"/><circle cx="100" cy="100" r="5.5"/></g>'
        + '</svg>';
      this.speedo.append(this.speedArc, this.speedValue, this.speedUnit, this.speedGear, nitro, dmg);
      this.vehicleName = el('div', 'hud-vehicle-name');
      this.vehicleMake = el('div', 'vn-make');
      this.vehicleModel = el('div', 'vn-model');
      this.vehicleName.append(this.vehicleMake, this.vehicleModel);
      this.scorePop = el('div', 'hud-score-pop');
      this.carPrompt = el('div', 'hud-prompt hud-car-prompt');
      this.carPromptKey = el('kbd', '', 'F');
      this.carPromptLabel = el('span', 'prompt-label');
      this.carPrompt.append(this.carPromptKey, this.carPromptLabel);

      // Missions: objective line, timer, suspicion meter, title card, result card.
      this.objText = el('div', 'hud-objtext');
      this.mTimer = el('div', 'hud-mtimer');
      this.suspicion = el('div', 'hud-suspicion');
      this.suspicionFill = el('div', 'fill');
      this.suspicion.append(el('span', '', 'SUSPICION'), this.suspicionFill);
      this.mTitle = el('div', 'hud-mtitle');
      this.mTitleSub = el('div', 'mt-sub');
      this.mTitleMain = el('div', 'mt-main');
      this.mTitle.append(this.mTitleSub, this.mTitleMain);
      this.mResult = el('div', 'hud-mresult');
      // Combat: current weapon and ammo, hit marker, damage direction.
      this.weaponBox = el('div', 'hud-weapon');
      this.weaponIcon = el('div', 'hw-icon');
      this.weaponName = el('div', 'hw-name');
      this.weaponAmmo = el('div', 'hw-ammo');
      this.weaponBox.append(this.weaponIcon, this.weaponName, this.weaponAmmo);
      this.hitMarker = el('div', 'hud-hitmarker');
      this.hitMarker.append(el('i'), el('i'), el('i'), el('i'));
      this.damageArc = el('div', 'hud-damage-arc');
      this.lowHealth = el('div', 'hud-lowhealth');

      r.append(tr, bl, this.crosshair, this.prompt, this.carPrompt, this.lockHint, this.fpsEl, this.notifyStack, this.banner, this.toast, this.hints,
        this.objective, this.chal, this.big, this.cbanner, this.resultsEl, this.speedo, this.vehicleName, this.scorePop,
        this.objText, this.mTimer, this.suspicion, this.mTitle, this.mResult, this.weaponBox, this.hitMarker, this.damageArc, this.lowHealth, this.knockout, this.fade);
    }

    // ------------------------------------------------------- challenge HUD
    showChallenge(on, def) {
      this.chal.classList.toggle('visible', !!on);
      document.body.classList.toggle('in-challenge', !!on);
      if (on) {
        this.chalName.textContent = def.name;
        this.chal.classList.toggle('countdown', def.kind === 'countdown');
        this._cache.chalTimer = null;
      }
    }

    setChallengeTimer(text, tone) {
      this._set('chalTimer', text, (v) => {
        this.chalTimer.textContent = v;
      });
      this._set('chalTone', tone, (v) => {
        this.chalTimer.className = 'chal-timer' + (v ? ' ' + v : '');
      });
    }

    setChallengeInfo(text) {
      this._set('chalInfo', text, (v) => {
        this.chalInfo.textContent = v;
      });
    }

    popText(text, tone) {
      this.chalPop.textContent = text;
      this.chalPop.className = 'chal-pop';
      void this.chalPop.offsetWidth;
      this.chalPop.className = 'chal-pop show ' + (tone || '');
    }

    bigText(text, go) {
      this.big.textContent = text;
      this.big.className = 'hud-bigtext';
      void this.big.offsetWidth;
      this.big.className = 'hud-bigtext show' + (go ? ' go' : '');
    }

    centerBanner(title, sub) {
      this.cbannerTitle.textContent = title;
      this.cbannerSub.textContent = sub || '';
      this.cbanner.classList.remove('show');
      void this.cbanner.offsetWidth;
      this.cbanner.classList.add('show');
    }

    /** o = { x%, y%, onScreen, angle, dist, finish } or null to hide. */
    setObjective(o) {
      if (!o) {
        this.objective.classList.remove('visible');
        return;
      }
      this.objective.classList.add('visible');
      this.objective.classList.toggle('edge', !o.onScreen);
      this.objective.classList.toggle('finish', !!o.finish);
      this.objective.style.left = o.x.toFixed(2) + '%';
      this.objective.style.top = o.y.toFixed(2) + '%';
      this.objArrow.style.transform = 'rotate(' + o.angle.toFixed(3) + 'rad)';
      this._set('objDist', Math.round(o.dist), (v) => {
        this.objDist.textContent = v + ' m';
      });
    }

    /** view = { title, name, medal, main, lines, reward, retry } or null. */
    showResults(view) {
      const r = this.resultsEl;
      if (!view) {
        r.classList.remove('visible');
        return;
      }
      r.innerHTML = '';
      const medal = el('div', 'res-medal ' + (view.medal || 'none'));
      medal.append(el('span', '', view.medal ? '★' : view.title === 'FINISHED' ? '✓' : '✕'));
      const body = el('div', 'res-body');
      body.append(el('div', 'res-name', view.name), el('div', 'res-title', view.title), el('div', 'res-main', view.main));
      for (const line of view.lines || []) body.append(el('div', 'res-line', line));
      if (view.reward) body.append(el('div', 'res-reward', '+' + VH.util.formatMoney(view.reward)));
      if (view.retry) {
        const hint = el('div', 'res-hint');
        const k = el('kbd', '', this.input.labelFor('interact'));
        hint.append(k, document.createTextNode(' try again   ·   walk away to leave'));
        body.append(hint);
      }
      r.append(medal, body);
      r.classList.remove('visible');
      void r.offsetWidth;
      r.classList.add('visible');
    }

    /** Police heat: 5 pips, flashing while they've lost sight of you; a bust meter. */
    setHeat(level, flashing, bust) {
      this._set('heat', level, (v) => {
        this.wantedEl.classList.toggle('visible', v > 0);
        this.heatPips.forEach((p, i) => p.classList.toggle('on', i < v));
        if (v > 0) {
          this.wantedEl.classList.remove('bump');
          void this.wantedEl.offsetWidth;
          this.wantedEl.classList.add('bump');
        }
      });
      this._set('heatFlash', !!flashing, (v) => this.wantedEl.classList.toggle('flashing', v));
      const b = Math.round((bust || 0) * 20);
      this._set('bust', b, (v) => {
        this.bustBar.classList.toggle('visible', v > 0);
        this.bustFill.style.width = v * 5 + '%';
      });
    }

    // ----------------------------------------------------------- missions
    setObjectiveText(text) {
      this._set('objText', text || '', (v) => {
        this.objText.textContent = v;
        this.objText.classList.toggle('visible', !!v);
        document.body.classList.toggle('has-objtext', !!v); // toasts move down out of its way
        if (v) {
          this.objText.classList.remove('flash');
          void this.objText.offsetWidth;
          this.objText.classList.add('flash');
        }
      });
    }

    setMissionTimer(seconds) {
      if (seconds === null || seconds === undefined) {
        this._set('mTimer', '', () => this.mTimer.classList.remove('visible'));
        return;
      }
      const s = Math.max(0, seconds);
      const txt = Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      this._set('mTimer', txt, (v) => {
        this.mTimer.textContent = v;
        this.mTimer.classList.add('visible');
        this.mTimer.classList.toggle('critical', s < 10);
      });
    }

    setSuspicion(k) {
      const v = k === null || k === undefined ? -1 : Math.round(Math.min(1, k) * 20);
      this._set('susp', v, (x) => {
        this.suspicion.classList.toggle('visible', x >= 0);
        if (x >= 0) this.suspicionFill.style.width = x * 5 + '%';
        this.suspicion.classList.toggle('high', x > 12);
      });
    }

    missionTitle(title, sub) {
      this.mTitleMain.textContent = title;
      this.mTitleSub.textContent = sub || '';
      this.mTitle.classList.remove('show');
      void this.mTitle.offsetWidth;
      this.mTitle.classList.add('show');
    }

    /** ok: true (job complete), false (failed), null (hide). */
    missionResult(ok, title, line1, line2) {
      const r = this.mResult;
      if (ok === null) {
        r.classList.remove('show');
        return;
      }
      r.innerHTML = '';
      r.className = 'hud-mresult ' + (ok ? 'pass' : 'fail');
      r.append(el('div', 'mr-head', ok ? 'JOB COMPLETE' : 'JOB FAILED'), el('div', 'mr-title', title || ''));
      if (line1) r.append(el('div', 'mr-line1', line1));
      if (line2) r.append(el('div', 'mr-line2', line2));
      void r.offsetWidth;
      r.classList.add('show');
      clearTimeout(this._mrTimer);
      this._mrTimer = setTimeout(() => r.classList.remove('show'), ok ? 6500 : 12000);
    }

    /** Project the objective marker onto the screen (arrow at the edge when off-screen). */
    trackObjective(pos, camera) {
      if (!pos) {
        this.setObjective(null);
        return;
      }
      const v = this._projV || (this._projV = new THREE.Vector3());
      v.set(pos.x, (pos.y || 0) + 1.6, pos.z);
      const camPos = camera.position;
      const dist = Math.hypot(pos.x - camPos.x, pos.z - camPos.z);
      v.project(camera);
      const behind = v.z > 1;
      let x = v.x;
      let y = v.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
      let angle = 0;
      if (!onScreen) {
        const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.85, 1e-3);
        x /= m;
        y /= m;
        angle = Math.atan2(x, y);
      }
      this.setObjective({ x: (x * 0.5 + 0.5) * 100, y: (-y * 0.5 + 0.5) * 100, onScreen, angle, dist });
    }

    // ------------------------------------------------------------- combat
    setWeapon(w, inv, reloading) {
      const key = w ? w.id + ':' + (inv ? inv.mag + '/' + inv.ammo : '') + (reloading ? 'r' : '') : '';
      this._set('weapon', key, () => {
        const armed = w && w.slot !== 'unarmed';
        this.weaponBox.classList.toggle('visible', !!armed);
        document.body.classList.toggle('armed', !!armed); // the checklist moves down out of its way
        if (!armed) return;
        if (this._weaponIconFor !== w.slot && VH.WeaponWheel && VH.WeaponWheel.icon) {
          this.weaponIcon.innerHTML = VH.WeaponWheel.icon(w.slot);
          this._weaponIconFor = w.slot;
        }
        this.weaponName.textContent = w.name;
        this.weaponAmmo.textContent = w.kind === 'melee' ? '' : reloading ? 'RELOADING' : inv ? (w.kind === 'thrown' ? String(inv.mag + inv.ammo) : inv.mag + ' / ' + inv.ammo) : '';
        this.weaponAmmo.classList.toggle('empty', !!inv && inv.mag === 0 && w.kind !== 'melee');
      });
    }

    flashHit() {
      this.hitMarker.classList.remove('show');
      void this.hitMarker.offsetWidth;
      this.hitMarker.classList.add('show');
    }

    /** Red arc toward whoever just hurt Jay (angle in screen space, 0 = ahead). */
    damageFrom(angle) {
      this.damageArc.style.transform = 'translate(-50%, -50%) rotate(' + angle.toFixed(3) + 'rad)';
      this.damageArc.classList.remove('show');
      void this.damageArc.offsetWidth;
      this.damageArc.classList.add('show');
    }

    // ------------------------------------------------------------ driving
    setVehiclePrompt(text, key) {
      this._set('carPrompt', text, (v) => {
        this.carPrompt.classList.toggle('visible', !!v);
        if (v) {
          this.carPromptKey.textContent = key;
          this.carPromptLabel.textContent = v;
        }
      });
    }

    /** Show the car's name as Jay gets in (null hides the driving HUD). */
    showVehicle(v) {
      this.speedo.classList.toggle('visible', !!v);
      document.body.classList.toggle('driving', !!v);
      if (!v) return;
      // A story car shows its own name ("Lulu") over the make and model.
      this.vehicleMake.textContent = v.storyName ? (v.spec.make || '') + ' ' + v.name : v.spec.make || '';
      this.vehicleModel.textContent = v.storyName ? v.storyName.replace(/^the /, '') : v.name;
      this.vehicleName.classList.remove('show');
      void this.vehicleName.offsetWidth;
      this.vehicleName.classList.add('show');
    }

    /** The radio's now-playing card. */
    nowPlaying(station, title, artist) {
      const name = station && station.name ? station.name : station;
      this.vehicleMake.textContent = name || '';
      this.vehicleModel.textContent = title ? title + (artist ? ' · ' + artist : '') : 'Radio off';
      this.vehicleName.classList.remove('show');
      void this.vehicleName.offsetWidth;
      this.vehicleName.classList.add('show');
    }

    /** A quick "+$25 NEAR MISS" style pop. */
    popScore(text, money) {
      this.scorePop.textContent = text + (money ? '  +' + VH.util.formatMoney(money) : '');
      this.scorePop.classList.remove('show');
      void this.scorePop.offsetWidth;
      this.scorePop.classList.add('show');
    }

    _updateDriving(v, nitro) {
      // Aircraft and tanks fill the dial their own way: { kmh, max, gear, bar, barLabel }.
      const info = v.hudInfo ? v.hudInfo() : null;
      const kmh = info ? Math.round(info.kmh) : Math.round(Math.abs(v.vF) * 3.6);
      const maxKmh = info && info.max ? info.max : 260;
      this._set('speed', kmh, (x) => {
        this.speedValue.textContent = String(x);
        this.speedArc.style.setProperty('--speed', Math.min(1, x / maxKmh).toFixed(3));
      });
      this._set('gear', info ? String(info.gear) : v.reversing && v.vF < -0.5 ? 'R' : String(v.gear), (x) => {
        this.speedGear.textContent = x;
      });
      this._set('nitroLabel', info ? info.barLabel || 'THROTTLE' : 'NITRO', (x) => {
        this.nitroLabel.textContent = x;
      });
      if (info) nitro = info.bar;
      this._set('nitro', Math.round(nitro * 100), (x) => {
        this.nitroFill.style.width = x + '%';
        this.speedo.classList.toggle('nitro-ready', x > 20);
      });
      this._set('carHealth', Math.round(v.health / 10), (x) => {
        this.damageFill.style.width = x + '%';
        this.speedo.classList.toggle('damaged', x < 35);
      });
      this._set('boosting', v.boostFx > 0.5, (x) => this.speedo.classList.toggle('boosting', x));
    }

    _buildChecklist() {
      this.hintsList.innerHTML = '';
      this.hintItems = {};
      for (const item of CHECKLIST) {
        const li = el('li', 'hint');
        const box = el('span', 'hint-box');
        const text = el('span', 'hint-text', item.label);
        const keys = el('span', 'hint-keys');
        const labels = item.keysText ? [item.keysText] : item.keys.map((k) => this.input.labelFor(k));
        const unique = [...new Set(labels)];
        keys.textContent = unique.join(' ') + (item.extra ? ' · ' + item.extra : '');
        li.append(box, text, keys);
        if (item.note) li.append(el('span', 'hint-note', item.note));
        if (this.checklist[item.id]) li.classList.add('done');
        this.hintsList.append(li);
        this.hintItems[item.id] = li;
      }
    }

    _bindEvents() {
      VH.events.on('notify', (n) => this.notify(n));
      VH.events.on('money:changed', (e) => this._flashMoney(e.delta));
      VH.events.on('interaction:focus', (e) => this._setPrompt(e.item));
      VH.events.on('camera:mode', (e) => {
        this.showToast('Camera: ' + e.mode.label);
        this.tick('camera');
      });
      VH.events.on('player:jump', () => this.tick('jump'));
      VH.events.on('player:climb', () => this.tick('climb'));
      VH.events.on('interaction:used', () => this.tick('interact'));
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'controls.bindings' || e.path === '*') this._buildChecklist();
        if (e.path === 'gameplay.showHints' || e.path === '*') this._applyHintVisibility();
      });
    }

    // --------------------------------------------------------- per frame
    /** state = { player, camera, district, place, road, fps, locked, playing } */
    update(dt, s) {
      const p = s.player;
      this._set('money', p.money, (v) => {
        this.moneyValue.textContent = VH.util.formatMoney(v);
      });
      this._set('health', Math.round(p.health), (v) => {
        this.healthFill.style.width = Math.max(0, (v / p.maxHealth) * 100) + '%';
        this.healthBar.classList.toggle('low', v < 25);
      });
      this._set('armor', Math.round(p.armor), (v) => {
        this.armorFill.style.width = Math.max(0, (v / p.maxArmor) * 100) + '%';
        this.armorBar.classList.toggle('empty', v <= 0);
      });
      this._set('crosshair', (p.aimAmount > 0.6 || !!(p.vehicle && p.vehicle.crosshair)) && !p.isDead, (v) => this.crosshair.classList.toggle('visible', v));
      this._set('lockHint', s.playing && !s.locked && VH.features.pointerLock, (v) => this.lockHint.classList.toggle('visible', v));
      this._set('knockout', p.isDead, (v) => this.knockout.classList.toggle('visible', v));
      this._set('lowHealth', p.health < 30 && !p.isDead, (v) => this.lowHealth.classList.toggle('visible', v));

      const placeLine = s.place || (s.road ? s.road : s.district.name);
      const subLine = s.place ? [s.road, s.district.name].filter(Boolean).join(' · ') : s.road ? s.district.name : s.district.tagline;
      this._set('place', placeLine, (v) => {
        this.locPlace.textContent = v;
      });
      this._set('sub', subLine, (v) => {
        this.locSub.textContent = v;
      });
      if (this._lastDistrict !== s.district.id) {
        if (this._lastDistrict !== undefined) this.showBanner(s.district.name, s.district.tagline);
        this._lastDistrict = s.district.id;
      }

      const showFps = this.settings.get('graphics.showFps');
      this._set('fpsVisible', showFps, (v) => this.fpsEl.classList.toggle('visible', v));
      if (showFps) this._set('fps', s.fps, (v) => {
        this.fpsEl.textContent = v + ' FPS';
        this.fpsEl.classList.toggle('warn', v < 45);
        this.fpsEl.classList.toggle('bad', v < 25);
      });

      if (p.vehicle) this._updateDriving(p.vehicle, s.nitro || 0);

      // Checklist items that are detected by polling.
      if (p.speed > 0.5 && p.grounded) this.tick('move');
      if (p.sprinting && p.speed > 5.5) this.tick('sprint');
      if (p.crouched) this.tick('crouch');
      if (p.aiming) this.tick('aim');
      if (s.lookedAround) this.tick('look');
    }

    _set(key, value, apply) {
      if (this._cache[key] === value) return;
      this._cache[key] = value;
      apply(value);
    }

    // ---------------------------------------------------------- elements
    _setPrompt(item) {
      if (!item) {
        this.prompt.classList.remove('visible');
        return;
      }
      this.promptKey.textContent = this.input.labelFor('interact');
      this.promptLabel.textContent = item.label;
      this.promptPrice.textContent = item.price ? VH.util.formatMoney(item.price) : '';
      this.prompt.classList.add('visible');
    }

    _flashMoney(delta) {
      if (!delta) return;
      this.moneyDelta.textContent = (delta > 0 ? '+' : '−') + VH.util.formatMoney(Math.abs(delta));
      this.moneyDelta.className = 'money-delta show ' + (delta > 0 ? 'gain' : 'loss');
      clearTimeout(this._moneyTimer);
      this._moneyTimer = setTimeout(() => {
        this.moneyDelta.className = 'money-delta';
      }, 1800);
    }

    notify(n) {
      const card = el('div', 'notify' + (n.tone ? ' ' + n.tone : ''));
      if (n.icon) card.append(el('div', 'notify-icon', n.icon));
      const body = el('div', 'notify-body');
      if (n.title) body.append(el('div', 'notify-title', n.title));
      if (n.text) body.append(el('div', 'notify-text', n.text));
      card.append(body);
      this.notifyStack.prepend(card);
      while (this.notifyStack.children.length > 4) this.notifyStack.lastChild.remove();
      // The stack stops above the radar (a max-height in the CSS): older cards
      // that would be cut off by it go now rather than show half a card.
      requestAnimationFrame(() => {
        const max = this.notifyStack.clientHeight;
        for (const c of Array.from(this.notifyStack.children)) if (c !== card && c.offsetTop + c.offsetHeight > max + 1) c.remove();
      });
      requestAnimationFrame(() => card.classList.add('in'));
      setTimeout(() => {
        card.classList.remove('in');
        card.classList.add('out');
        setTimeout(() => card.remove(), 400);
      }, n.duration || 4200);
    }

    showBanner(title, sub) {
      this.bannerTitle.textContent = title;
      this.bannerSub.textContent = sub || '';
      this.banner.classList.remove('visible');
      void this.banner.offsetWidth; // restart the animation
      this.banner.classList.add('visible');
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => this.banner.classList.remove('visible'), 3800);
    }

    showToast(text) {
      this.toast.textContent = text;
      this.toast.classList.add('visible');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => this.toast.classList.remove('visible'), 1500);
    }

    tick(id) {
      if (this.checklist[id]) return;
      this.checklist[id] = true;
      const li = this.hintItems[id];
      if (li) li.classList.add('done');
      const all = CHECKLIST.every((c) => this.checklist[c.id]);
      if (all && !this._allDone) {
        this._allDone = true;
        this.notify({ title: 'You\'ve got the basics', text: 'Vicehaven is yours to explore. Try the pier at the end of Meridian Boulevard.', icon: '★', duration: 6000 });
        setTimeout(() => this.hints.classList.add('complete'), 2500);
      }
    }

    _applyHintVisibility() {
      this.hints.classList.toggle('hidden-by-setting', !this.settings.get('gameplay.showHints'));
    }

    resetChecklist() {
      this.checklist = {};
      this._allDone = false;
      this.hints.classList.remove('complete');
      this._buildChecklist();
      this._applyHintVisibility();
    }

    setFade(opacity, ms) {
      this.fade.style.transitionDuration = (ms === undefined ? 600 : ms) + 'ms';
      this.fade.style.opacity = String(opacity);
    }

    show(v) {
      this.root.classList.toggle('visible', v);
    }
  }

  VH.HUD = HUD;
})();
