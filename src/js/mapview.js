/*
 * mapview.js — the full-screen map (M): a road atlas of all of Vicehaven
 * that fills the screen. VH.Minimap builds it and drives it:
 *
 *   minimap.openFull(); minimap.closeFull(); minimap.isFullOpen;
 *   minimap.updateFull(state, dt, pad);   every frame while it is open
 *
 * What it has:
 *   - the whole screen, opening on Jay at street-readable zoom; zoom and
 *     pan ease smoothly, and a flicked map glides to a stop
 *   - a side panel: where you are, a search box, what to show (with
 *     counts), overlays (district colours, street names, an atlas grid),
 *     every place nearest first with a one-click GPS button, and a map key
 *   - click anything (or anywhere) to set the GPS; an info card says what
 *     it is, how far it is by road, and how long the drive or the walk takes
 *   - right-click (or P) drops a coloured pin; pins are kept in this
 *     browser and show on the radar too
 *   - icons that crowd together merge into one with a count (click to zoom
 *     in), and labels only show where they fit and the zoom suits them
 *   - an overview of the whole map with the view marked; a GPS bar with
 *     the distance and drive time; arrows to an off-screen objective
 *   - keyboard (WASD, Q/E, C, G, Z, Tab, /, 1-7, O, P, Space) and gamepad
 *     (sticks, triggers, A/B/X/Y, LB/RB) control, with a centre reticle
 *
 * The game pauses while it is open (js/main.js). Everything is drawn on
 * one canvas from the city image VH.Minimap pre-renders: a cached static
 * layer (city, overlays, labels) re-rendered when the view moves, and the
 * icons, routes and the player on top every frame.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const K = VH.MapKit;
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---------------------------------------------------------------- tuning
  const PREFS_KEY = 'vicehaven.map.v2';
  const PINS_KEY = 'vicehaven.map.pins';
  const PIN_COLOURS = ['#3fd8ff', '#ffd447', '#6dff9a', '#ff9a5c', '#b98bff', '#ff6b6b']; // never the waypoint's magenta
  const MAX_PINS = 12;
  const GRID = 250; //        metres per atlas square (A1 is the north-west corner)
  const DRIVE_SPEED = 14; //  m/s: an average for a drive with junctions in it
  const FOOT_SPEED = 4.5; //  m/s: a jog
  const CLUSTER_PX = 24; //   icons closer than this merge into one with a count (more, zoomed out)
  const EASE = 13; //         how quickly the view catches up with where it is going (1/s)
  const FRICTION = 4.5; //    how quickly a flicked map slows down (1/s)
  const PAN_SPEED = 900; //   px/s for the arrow keys and the stick
  const MAX_S = 7; //         closest zoom, px per metre
  const VECTOR_PPM = 1.6; //  past this many device px per metre the city is repainted as vectors

  // The filters: each blip type below belongs to one of these.
  const CATS = [
    { id: 'story', label: 'Story', icon: 'mission' },
    { id: 'jobs', label: 'Side jobs', icon: 'race' },
    { id: 'shops', label: 'Shops', icon: 'store' },
    { id: 'vehicles', label: 'Vehicles', icon: 'plane' },
    { id: 'places', label: 'Places', icon: 'landmark' },
    { id: 'police', label: 'Police', icon: 'police_r' },
    { id: 'pins', label: 'Pins', icon: 'pin' },
  ];
  const OVERLAYS = [
    { id: 'districts', label: 'Districts', key: 'O' },
    { id: 'streets', label: 'Street names', key: 'N' },
    { id: 'grid', label: 'Grid', key: 'R' },
  ];

  // What each kind of thing is called, which filter shows it, and how it behaves.
  // cat 'always' can't be hidden; edge: pinned to the edge of the map when off screen;
  // labelAt: the zoom (px per metre) from which its name shows without hovering.
  const TYPES = {
    objective: { name: 'Objective', cat: 'always', edge: true, labelAt: 0 },
    waypoint: { name: 'GPS waypoint', cat: 'always', edge: true, labelAt: 0 },
    enemy: { name: 'Hostile', cat: 'always', labelAt: 99 },
    mission: { name: 'Story job', cat: 'story', cluster: true, labelAt: 0.4, tip: 'Walk into the marker to start the job.' },
    race: { name: 'Street race', cat: 'jobs', cluster: true, labelAt: 0.75, tip: 'Drive into the marker to start the race.' },
    challenge: { name: 'Side job', cat: 'jobs', cluster: true, labelAt: 0.75, tip: 'Walk into the marker to start.' },
    store: { name: 'Corner shop', cat: 'shops', cluster: true, labelAt: 1.15, tip: 'Snacks inside. Point a gun at the clerk to hold it up, but the police will come.' },
    shop: { name: 'Club', cat: 'shops', cluster: true, labelAt: 0.7, tip: 'Open every night.' },
    safehouse: { name: 'Safehouse', cat: 'places', labelAt: 0.5 },
    property: { name: 'Business for sale', cat: 'shops', labelAt: 0.9, tip: 'Buy it at the FOR SALE board out front. It pays into a safe every day.' },
    property_owned: { name: 'Your business', cat: 'shops', labelAt: 0.9, tip: 'Empty the safe at the office board out front.' },
    stash_health: { name: 'Health stash', cat: 'places', cluster: true, labelAt: 1.4, tip: 'Walk over it to pick it up. It comes back a few minutes later.' },
    stash_armor: { name: 'Armour stash', cat: 'places', cluster: true, labelAt: 1.4, tip: 'Walk over it to pick it up. It comes back a few minutes later.' },
    stash_weapon: { name: 'Weapon stash', cat: 'places', cluster: true, labelAt: 1.4, tip: 'Walk over it to pick it up. It comes back a few minutes later.' },
    stash_cash: { name: 'Cash stash', cat: 'places', cluster: true, labelAt: 1.4, tip: 'Walk over it to pick it up. It comes back a few minutes later.' },
    plane: { name: 'Aircraft', cat: 'vehicles', cluster: true, labelAt: 1.1, tip: 'Parked and unlocked. Walk up to it and get in.' },
    heli: { name: 'Helicopter', cat: 'vehicles', cluster: true, labelAt: 1.1, tip: 'Parked and unlocked. Walk up to it and get in.' },
    tank: { name: 'Military vehicle', cat: 'vehicles', cluster: true, labelAt: 1.1, tip: 'Inside the army base. The guards shoot on sight.' },
    car: { name: 'Vehicle', cat: 'vehicles', cluster: true, labelAt: 99 },
    police: { name: 'Police', cat: 'police', labelAt: 99 },
    pin: { name: 'Your pin', cat: 'pins', labelAt: 0.45 },
    landmark: { name: 'Landmark', cat: 'places' },
    airport: { name: 'Airport', cat: 'always' },
    fort: { name: 'Army base', cat: 'always' },
    skyline: { name: 'Skyscrapers', cat: 'always' },
    place: { name: 'Place', cat: 'always' },
    district: { name: 'District', cat: 'always' },
    street: { name: 'Street', cat: 'always' },
    spot: { name: 'Spot on the map', cat: 'always' },
    you: { name: 'You are here', cat: 'always' },
  };

  // List sections, in order.
  const SECTIONS = [
    ['now', 'Right now'],
    ['gps', 'GPS'],
    ['pins', 'Your pins'],
    ['jobs', 'Jobs'],
    ['places', 'Places'],
    ['shops', 'Shops'],
    ['vehicles', 'Vehicles to steal'],
    ['districts', 'Districts'],
    ['streets', 'Streets'],
  ];

  // --------------------------------------------------------------- helpers
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (err) {
      return fallback;
    }
  }

  function saveJSON(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (err) {
      // Private mode or storage blocked: it lasts until the page closes.
    }
  }

  function minutes(sec) {
    if (sec < 50) return 'under 1 min';
    const m = Math.round(sec / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  function routeLength(r) {
    let L = 0;
    for (let i = 1; i < (r ? r.length : 0); i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    return L;
  }

  // Icons for the panel, as images baked from the map's own sprites.
  const iconCache = new Map();
  function iconURL(name) {
    if (iconCache.has(name)) return iconCache.get(name);
    let url = '';
    try {
      const spr = K.buildSprites(2)[name];
      if (spr) url = spr.canvas.toDataURL();
    } catch (err) {
      url = '';
    }
    iconCache.set(name, url);
    return url;
  }

  function sanitizePins(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p && isFinite(p.x) && isFinite(p.z))
      .slice(-MAX_PINS)
      .map((p, i) => ({ x: +p.x, z: +p.z, c: (p.c | 0) % PIN_COLOURS.length, n: String(p.n || 'Pin ' + (i + 1)).slice(0, 48) }));
  }

  // ================================================================ MapView
  class MapView {
    constructor(mm, opts) {
      this.mm = mm;
      this.opts = opts || {};
      this.open = false;
      this.state = null;
      this.layout = null;
      // v: what is on screen (the world point at the centre of the map area, px per metre);
      // goal: where the view is easing to.
      this.v = { cx: 0, cz: 0, s: 0.5 };
      this.goal = { cx: 0, cz: 0, s: 0.5 };
      this._anchor = null; // a zoom about a point keeps that point still: { sx, sy, wx, wz }
      this._fling = { x: 0, y: 0 }; // px/s after a flick
      this._ox = 0; // the centre of the map area (px), eased while the panel slides
      this._oy = 0;
      this._area = { x0: 0, y0: 0, x1: 1, y1: 1 };
      this._fitS = 0.5;
      this._minS = 0.1;
      this._fw = this._fh = 0;
      this._fd = 1;
      const p = loadJSON(PREFS_KEY, {}) || {};
      this.show = Object.assign({ story: true, jobs: true, shops: true, vehicles: true, places: true, police: true, pins: true }, p.show);
      this.overlay = Object.assign({ districts: false, streets: true, grid: false }, p.overlay);
      this.sideOpen = p.side !== false;
      this._zoomRel = typeof p.zoom === 'number' && isFinite(p.zoom) ? p.zoom : 0;
      this.pins = sanitizePins(loadJSON(PINS_KEY, []));
      this._pinSerial = this.pins.length;
      this._keys = new Set();
      this._padPrev = new Set();
      this._hits = [];
      this._staticHits = [];
      this._boxes = [];
      this._staticBoxes = 0;
      this._panelBoxes = [];
      this._items = [];
      this._rows = [];
      this._textW = new Map();
      this.sel = null;
      this.hover = null;
      this._rowHover = null;
      this._preview = null;
      this._query = '';
      this._listIdx = -1;
      this._reticle = false;
      this._mouse = null;
      this._wpKey = null;
      this._lastMove = 0;
      this._build();

      this._onKeyDown = (e) => this._keyDown(e);
      this._onKeyUp = (e) => this._keys.delete(e.code);
      this._onBlur = () => this._keys.clear();
    }

    /** A new city (or the same one re-generated): plan the labels again. */
    setLayout(layout) {
      this.layout = layout;
      this._planLabels();
      this._districtRaster = null;
      this._staticDirty = true;
      if (this.open) this._rebuildList();
    }

    onResize() {
      this._resizePending = true;
    }

    setCloseKey() {
      this._hintsDevice = null; // rebuilt on the next frame
    }

    // ------------------------------------------------------------ the DOM
    _button(cls, text, title, fn) {
      const b = el('button', cls, text);
      b.type = 'button';
      b.tabIndex = -1;
      if (title) b.title = title;
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        fn(ev);
      });
      return b;
    }

    _build() {
      const root = el('div', 'vh-map');
      root.setAttribute('aria-hidden', 'true');
      root.classList.toggle('side-open', this.sideOpen);
      const canvas = el('canvas', 'vh-map-canvas');

      // ---- the side panel
      const side = el('aside', 'vh-map-side');
      const head = el('header', 'vh-map-side-head');
      this._whereEl = el('div', 'vh-map-where');
      head.append(el('div', 'vh-map-kicker', 'Vicehaven'), el('div', 'vh-map-title', 'City map'), this._whereEl);

      const search = el('label', 'vh-map-search');
      const input = el('input', 'vh-map-search-input');
      input.type = 'text';
      input.placeholder = 'Search places, shops, streets…';
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Search the map');
      search.append(el('span', 'vh-map-search-icon'), input, el('kbd', 'vh-map-search-kbd', '/'));
      input.addEventListener('input', () => this._onSearch());
      this._search = input;

      const filters = el('div', 'vh-map-filters');
      this._filterEls = {};
      CATS.forEach((c, i) => {
        const b = this._button('vh-map-filter', null, 'Show or hide ' + c.label.toLowerCase() + ' (' + (i + 1) + ')', () => this.toggleCat(c.id));
        const ic = el('span', 'vh-map-filter-icon');
        const url = iconURL(c.icon);
        if (url) ic.style.backgroundImage = 'url(' + url + ')';
        const count = el('span', 'vh-map-filter-count');
        b.append(ic, el('span', 'vh-map-filter-label', c.label), count);
        filters.append(b);
        this._filterEls[c.id] = { b, count };
      });
      const overlays = el('div', 'vh-map-overlays');
      this._overlayEls = {};
      for (const o of OVERLAYS) {
        const b = this._button('vh-map-toggle', o.label, 'Show or hide ' + o.label.toLowerCase() + ' (' + o.key + ')', () => this.toggleOverlay(o.id));
        overlays.append(b);
        this._overlayEls[o.id] = b;
      }

      const listHead = el('div', 'vh-map-section');
      this._listTitle = el('span', '', 'Places');
      this._listNote = el('span', 'vh-map-section-note', 'nearest first');
      listHead.append(this._listTitle, this._listNote);
      this._list = el('div', 'vh-map-list');
      this._list.addEventListener('mousedown', (ev) => {
        if (ev.target.closest('.vh-map-row')) ev.preventDefault();
      });
      this._list.addEventListener('click', (ev) => this._onListClick(ev));
      this._list.addEventListener('mouseover', (ev) => {
        const row = ev.target.closest('.vh-map-row');
        const r = row ? this._rows[+row.dataset.i] : null;
        this._rowHover = r ? r.t : null;
      });
      this._list.addEventListener('mouseleave', () => {
        this._rowHover = null;
      });
      // Scrolling the list must not zoom the map behind it.
      side.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true });

      const key = el('details', 'vh-map-key');
      key.append(el('summary', '', 'Map key'));
      const keyList = el('ul', 'vh-map-key-list');
      for (const [name, label] of K.LEGEND) {
        const li = el('li', 'vh-map-key-item');
        const ic = el('span', 'vh-map-key-icon is-' + name);
        const url = name === 'route' || name === 'search' ? '' : iconURL(name === 'police' ? 'police_r' : name);
        if (url) ic.style.backgroundImage = 'url(' + url + ')';
        li.append(ic, el('span', '', label));
        keyList.append(li);
      }
      key.append(keyList);
      key.addEventListener('mousedown', (ev) => {
        if (ev.target.tagName === 'SUMMARY') ev.preventDefault();
      });

      side.append(head, search, el('div', 'vh-map-section', 'Show on the map'), filters, overlays, listHead, this._list, key);

      // ---- the panels over the map area
      const stage = el('div', 'vh-map-stage');
      this._sideBtn = this._button('vh-map-sidebtn', '', 'Show or hide the panel (Tab)', () => this.toggleSide());
      this._sideBtn.append(el('span', 'vh-map-sidebtn-bars'));

      const gps = el('div', 'vh-map-gps');
      this._gpsIcon = el('span', 'vh-map-gps-icon');
      this._gpsKind = el('span', 'vh-map-gps-kind', 'GPS');
      this._gpsName = el('span', 'vh-map-gps-name');
      this._gpsMeta = el('span', 'vh-map-gps-meta');
      const gpsText = el('div', 'vh-map-gps-text');
      const gpsTop = el('div', 'vh-map-gps-top');
      gpsTop.append(this._gpsKind, this._gpsName);
      gpsText.append(gpsTop, this._gpsMeta);
      this._gpsClear = this._button('vh-map-gps-clear', '✕', 'Clear the GPS (Backspace)', () => this._setGps(null));
      gps.append(this._gpsIcon, gpsText, this._gpsClear);
      gps.addEventListener('mousedown', (ev) => ev.preventDefault());
      gps.addEventListener('click', () => this.showWaypoint());
      gps.title = 'Show it on the map (G)';

      const compass = el('div', 'vh-map-compass');
      compass.append(el('span', 'vh-map-compass-needle'), el('span', 'vh-map-compass-n', 'N'));

      this._card = el('div', 'vh-map-card');
      this._card.addEventListener('mousedown', (ev) => {
        if (!ev.target.closest('input')) ev.preventDefault();
      });
      this._card.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true });

      const ov = el('div', 'vh-map-overview');
      const ovc = el('canvas', 'vh-map-overview-canvas');
      ov.append(ovc, el('div', 'vh-map-overview-label', 'Whole map'));
      ov.title = 'Click to look there';

      const ctr = el('div', 'vh-map-controls');
      const b = (text, title, fn, cls) => this._button('vh-map-btn' + (cls ? ' ' + cls : ''), text, title, fn);
      this._gpsBtn = b('⌖', 'Show the GPS waypoint (G)', () => this.showWaypoint(), 'is-gps');
      ctr.append(
        b('⤢', 'Whole map (Z)', () => this.showAll()),
        this._gpsBtn,
        b('◎', 'Centre on Jay (C)', () => this.centreOnPlayer()),
        b('−', 'Zoom out (Q)', () => this.zoomBy(1 / 1.6)),
        b('+', 'Zoom in (E)', () => this.zoomBy(1.6))
      );

      const scale = el('div', 'vh-map-scale');
      this._scaleBar = el('div', 'vh-map-scale-bar');
      this._scaleLabel = el('div', 'vh-map-scale-label');
      scale.append(this._scaleBar, this._scaleLabel);

      this._hintsEl = el('div', 'vh-map-hints');
      this._toastEl = el('div', 'vh-map-toast');

      stage.append(this._sideBtn, gps, compass, this._card, ov, ctr, scale, this._hintsEl, this._toastEl);
      this._tip = el('div', 'vh-map-tip');
      root.append(canvas, side, stage, this._tip);

      this.mm.root.append(root);
      this.root = root;
      this._side = side;
      this._stage = stage;
      this._gpsEl = gps;
      this._compassEl = compass;
      this._ovEl = ov;
      this._ovc = ovc;
      this._ctrEl = ctr;
      this._scaleEl = scale;
      this._fc = canvas;
      this._fg = canvas.getContext('2d');
      this._fs = K.makeCanvas(1, 1);
      this._fsg = this._fs.getContext('2d');
      this._refreshToggles();
      this._wireCanvas(canvas);
      this._wireOverview(ov, ovc);
    }

    _wireCanvas(c) {
      const pos = (ev) => {
        const r = this._rootRect || { left: 0, top: 0 };
        return [ev.clientX - r.left, ev.clientY - r.top];
      };
      c.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        let dy = ev.deltaY;
        if (ev.deltaMode === 1) dy *= 33;
        else if (ev.deltaMode === 2) dy *= 400;
        const [x, y] = pos(ev);
        this._reticle = false;
        this._zoomAt(x, y, Math.exp(-clamp(dy, -300, 300) * 0.0022));
      }, { passive: false });
      c.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        if (document.activeElement === this._search) this._search.blur();
        const [x, y] = pos(ev);
        const now = performance.now();
        this._drag = { id: ev.pointerId, x, y, moved: 0, t: now, lt: now, vx: 0, vy: 0 };
        this._fling.x = this._fling.y = 0;
        try {
          c.setPointerCapture(ev.pointerId);
        } catch (err) {
          // Dragging still works while the pointer stays over the map.
        }
        this.root.classList.add('is-dragging');
      });
      c.addEventListener('pointermove', (ev) => {
        const [x, y] = pos(ev);
        this._mouse = { x, y };
        this._reticle = false;
        const dr = this._drag;
        if (!dr || ev.pointerId !== dr.id) return;
        const dx = x - dr.x;
        const dy = y - dr.y;
        const now = performance.now();
        const ms = Math.max(4, now - dr.lt);
        dr.vx += ((dx / ms) * 1000 - dr.vx) * 0.4;
        dr.vy += ((dy / ms) * 1000 - dr.vy) * 0.4;
        dr.lt = now;
        dr.x = x;
        dr.y = y;
        dr.moved += Math.abs(dx) + Math.abs(dy);
        this._panBy(dx, dy);
      });
      const end = (ev, click) => {
        const dr = this._drag;
        if (!dr || ev.pointerId !== dr.id) return;
        this._drag = null;
        this.root.classList.remove('is-dragging');
        const now = performance.now();
        if (click && dr.moved < 6 && now - dr.t < 600) {
          // The second half of a double-click is part of the first, not a new click.
          const [x, y] = pos(ev);
          const lc = this._lastClick;
          if (lc && now - lc.t < 400 && Math.hypot(x - lc.x, y - lc.y) < 10) this._lastClick = null;
          else {
            this._lastClick = { t: now, x, y };
            this._activate(this._hitAt(x, y), x, y);
          }
        } else if (now - dr.lt < 90 && dr.moved > 12) {
          // A flick: let the map glide on.
          const sp = Math.hypot(dr.vx, dr.vy);
          const k = sp > 4500 ? 4500 / sp : 1;
          this._fling.x = dr.vx * k;
          this._fling.y = dr.vy * k;
        }
      };
      c.addEventListener('pointerup', (ev) => end(ev, true));
      c.addEventListener('pointercancel', (ev) => end(ev, false));
      c.addEventListener('pointerleave', () => {
        if (!this._drag) this._mouse = null;
      });
      // Keep keyboard focus where the game left it (the map key must still reach the game).
      c.addEventListener('mousedown', (ev) => ev.preventDefault());
      c.addEventListener('dblclick', (ev) => ev.preventDefault());
      c.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if (!this.open) return;
        const [x, y] = pos(ev);
        this._pinAt(x, y);
      });
    }

    _wireOverview(ov, c) {
      let held = null;
      const look = (ev) => {
        const m = this._ovMap;
        if (!m) return;
        const r = c.getBoundingClientRect();
        const x = m.minX + (ev.clientX - r.left - m.x0) / m.k;
        const z = m.minZ + (ev.clientY - r.top - m.y0) / m.k;
        this.flyTo(x, z, this.goal.s);
      };
      ov.addEventListener('mousedown', (ev) => ev.preventDefault());
      ov.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        held = ev.pointerId;
        try {
          ov.setPointerCapture(ev.pointerId);
        } catch (err) {
          // Fine: a click still works.
        }
        look(ev);
      });
      ov.addEventListener('pointermove', (ev) => {
        if (held === ev.pointerId) look(ev);
      });
      const up = (ev) => {
        if (held === ev.pointerId) held = null;
      };
      ov.addEventListener('pointerup', up);
      ov.addEventListener('pointercancel', up);
      ov.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.zoomBy(ev.deltaY < 0 ? 1.4 : 1 / 1.4);
      }, { passive: false });
    }

    // ------------------------------------------------------- open / close
    openFull() {
      if (this.open) return;
      this.open = true;
      this.mm._fullOpen = true;
      clearTimeout(this._freeTimer);
      this.root.classList.add('is-open');
      this.root.setAttribute('aria-hidden', 'false');
      document.body.classList.add('map-open');
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', this._onBlur);
      this.state = this.mm._state || this.state || {};
      this._resize();
      if (this._fw <= 900 && this.sideOpen) {
        // Small screens open on the map; Tab (or the button) brings the panel in.
        this.sideOpen = false;
        this.root.classList.remove('side-open');
      }
      this._layoutPanels();
      const st = this.state;
      const s = this._zoomRel ? this._fitS * this._zoomRel : this._defaultS();
      this.goal.cx = this.v.cx = st.x || 0;
      this.goal.cz = this.v.cz = st.z || 0;
      this.goal.s = this.v.s = clamp(s, this._minS, MAX_S);
      this._clamp(this.goal);
      this._clamp(this.v);
      this._ox = (this._area.x0 + this._area.x1) / 2;
      this._oy = (this._area.y0 + this._area.y1) / 2;
      this._anchor = null;
      this._fling.x = this._fling.y = 0;
      this._select(null);
      this.hover = this._rowHover = null;
      this._reticle = false;
      this._mouse = null;
      this._search.value = '';
      this._query = '';
      this._listIdx = -1;
      this._wpKey = null;
      this._lastV = null;
      this._hintsDevice = null;
      this._whereText = null;
      this._sync(true);
      this._draw(performance.now());
    }

    closeFull() {
      if (!this.open) return;
      this.open = false;
      this.mm._fullOpen = false;
      this._drag = null;
      this._keys.clear();
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('blur', this._onBlur);
      if (document.activeElement === this._search) this._search.blur();
      this.root.classList.remove('is-open', 'is-dragging', 'is-pointing');
      this.root.setAttribute('aria-hidden', 'true');
      this._tip.classList.remove('is-on');
      this._tipKey = null;
      this._select(null); // the card fades out with the map
      document.body.classList.remove('map-open');
      this._zoomRel = this.goal.s / this._fitS;
      this._savePrefs();
      // Give the big canvases' memory back once the fade-out is over.
      clearTimeout(this._freeTimer);
      this._freeTimer = setTimeout(() => {
        if (this.open) return;
        this._fc.width = this._fc.height = 1;
        this._fs.width = this._fs.height = 1;
        this._fw = this._fh = 0;
      }, 600);
    }

    /** Per frame while open: the pad, then the keys, the easing and the drawing. */
    frame(state, dt, pad) {
      if (state) this.state = state;
      if (!this.open) return;
      dt = clamp(typeof dt === 'number' && dt > 0 ? dt : 1 / 60, 0, 0.1);
      if (this._resizePending) {
        this._resizePending = false;
        if (this._resize()) {
          this._layoutPanels();
          this._clamp(this.goal);
          this._clamp(this.v);
        }
      }
      if (pad && pad.connected) this._padNav(pad, dt);
      this._keyNav(dt);
      this._animate(dt);
      this._sync(false);
      this._draw(performance.now());
    }

    _savePrefs() {
      saveJSON(PREFS_KEY, { show: this.show, overlay: this.overlay, side: this.sideOpen, zoom: this._zoomRel || 0 });
    }

    // --------------------------------------------------------- the view
    /** Size the canvases to the window (backing store capped at about 4K worth of pixels). */
    _resize() {
      const W = this.root.clientWidth || window.innerWidth;
      const H = this.root.clientHeight || window.innerHeight;
      let d = clamp(window.devicePixelRatio || 1, 1, 2);
      if (W * H * d * d > 8.3e6) d = Math.sqrt(8.3e6 / (W * H));
      const changed = W !== this._fw || H !== this._fh || d !== this._fd || this._fc.width <= 1;
      this._fw = W;
      this._fh = H;
      this._fd = d;
      this._rootRect = this.root.getBoundingClientRect();
      if (!changed) return false;
      this._fc.width = this._fs.width = Math.round(W * d);
      this._fc.height = this._fs.height = Math.round(H * d);
      this._spr = K.buildSprites(d);
      this._fsNoise = null;
      this._staticDirty = true;
      this._ovDirty = true;
      return true;
    }

    /** Where the panels are (labels keep clear of them) and the map area beside the side panel. */
    _layoutPanels() {
      const W = this._fw;
      const H = this._fh;
      const sideW = this.sideOpen ? this._side.offsetWidth : 0;
      // On a narrow screen the panel slides over the map instead of pushing it aside (see map.css).
      const shift = W <= 900 ? 0 : sideW;
      this._area = { x0: shift, y0: 0, x1: W, y1: H };
      const boxes = [];
      if (sideW) boxes.push(0, 0, sideW + 4, H);
      const add = (e, pad) => {
        if (!e || !e.offsetParent || !e.offsetWidth) return;
        const x = shift + e.offsetLeft;
        const y = e.offsetTop;
        boxes.push(x - pad, y - pad, x + e.offsetWidth + pad, y + e.offsetHeight + pad);
      };
      for (const e of [this._sideBtn, this._gpsEl, this._compassEl, this._ovEl, this._ctrEl, this._scaleEl, this._hintsEl]) add(e, 6);
      this._panelBoxes = boxes;
      // The city fit is the yardstick for zoom limits; the whole map is the furthest out.
      const aw = Math.max(200, W - shift);
      const ah = Math.max(200, H);
      const F = this.mm._ext.fit;
      const Wd = this.mm._ext.world;
      this._fitS = Math.min(aw / (F.maxX - F.minX), ah / (F.maxZ - F.minZ));
      this._allS = Math.min((aw - 60) / (Wd.maxX - Wd.minX), (ah - 150) / (Wd.maxZ - Wd.minZ));
      this._minS = Math.min(this._allS * 0.9, this._fitS * 0.5);
      // The overview keeps the whole map's shape.
      const ow = this._ovEl.clientWidth;
      if (ow) {
        const oh = Math.round((ow * (Wd.maxZ - Wd.minZ)) / (Wd.maxX - Wd.minX));
        if (this._ovEl.style.height !== oh + 'px') this._ovEl.style.height = oh + 'px';
      }
      this._staticDirty = true;
      this._ovDirty = true;
    }

    /** About a kilometre from top to bottom: streets readable, a district or two in view. */
    _defaultS() {
      const a = this._area;
      return Math.min((a.y1 - a.y0) / 1000, (a.x1 - a.x0) / 1300);
    }

    _clamp(v) {
      const L = this.mm._ext.land;
      v.cx = clamp(v.cx, L.minX, L.maxX);
      v.cz = clamp(v.cz, L.minZ, L.maxZ);
    }

    /** Move the map by screen pixels (drag, keys, stick). */
    _panBy(dx, dy) {
      const v = this.v;
      const g = this.goal;
      if (this._anchor) {
        // Mid-zoom: the point being zoomed about moves with the drag.
        this._anchor.sx += dx;
        this._anchor.sy += dy;
      }
      v.cx -= dx / v.s;
      v.cz -= dy / v.s;
      g.cx -= dx / v.s;
      g.cz -= dy / v.s;
      this._clamp(v);
      this._clamp(g);
    }

    _zoomAt(sx, sy, factor) {
      const v = this.v;
      const g = this.goal;
      const ns = clamp(g.s * factor, this._minS, MAX_S);
      if (Math.abs(ns - g.s) < 1e-6) return;
      const near = this._anchor && Math.hypot(this._anchor.sx - sx, this._anchor.sy - sy) < 6;
      const an = near ? this._anchor : { sx, sy, wx: v.cx + (sx - this._ox) / v.s, wz: v.cz + (sy - this._oy) / v.s };
      this._anchor = an;
      g.s = ns;
      g.cx = an.wx - (an.sx - this._ox) / ns;
      g.cz = an.wz - (an.sy - this._oy) / ns;
      this._clamp(g);
    }

    zoomBy(factor) {
      this._anchor = null;
      this.goal.s = clamp(this.goal.s * factor, this._minS, MAX_S);
    }

    flyTo(x, z, s) {
      this._anchor = null;
      this._fling.x = this._fling.y = 0;
      this.goal.cx = x;
      this.goal.cz = z;
      if (s) this.goal.s = clamp(s, this._minS, MAX_S);
      this._clamp(this.goal);
    }

    centreOnPlayer() {
      const st = this.state || {};
      this.flyTo(st.x || 0, st.z || 0, Math.max(this.goal.s, this._defaultS()));
    }

    showWaypoint() {
      const st = this.state || {};
      const wp = st.waypoint;
      const obj = !wp && (st.blips || []).find((b) => b.type === 'objective');
      const t = wp || obj;
      if (!t) return this._toast('No GPS waypoint set. Click the map to set one.');
      this.flyTo(t.x, t.z, Math.max(this.goal.s, this._fitS * 1.5));
    }

    showAll() {
      const Wd = this.mm._ext.world;
      this.flyTo((Wd.minX + Wd.maxX) / 2, (Wd.minZ + Wd.maxZ) / 2, this._allS);
      this.goal.s = clamp(this._allS, this._minS, MAX_S);
    }

    /** Ease the view towards its goal; a flicked map glides on. */
    _animate(dt) {
      const v = this.v;
      const g = this.goal;
      const k = 1 - Math.exp(-EASE * dt);
      const a = this._area;
      const tox = (a.x0 + a.x1) / 2;
      const toy = (a.y0 + a.y1) / 2;
      this._ox = Math.abs(this._ox - tox) > 0.4 ? this._ox + (tox - this._ox) * k : tox;
      this._oy = Math.abs(this._oy - toy) > 0.4 ? this._oy + (toy - this._oy) * k : toy;
      const f = this._fling;
      if (f.x || f.y) {
        this._panBy(f.x * dt, f.y * dt);
        const dec = Math.exp(-FRICTION * dt);
        f.x *= dec;
        f.y *= dec;
        if (Math.hypot(f.x, f.y) < 10) f.x = f.y = 0;
      }
      // Zoom eases in log space, so every step feels the same size.
      const ls = Math.log(g.s / v.s);
      v.s = Math.abs(ls) > 0.002 ? v.s * Math.exp(ls * k) : g.s;
      if (this._anchor) {
        const an = this._anchor;
        v.cx = an.wx - (an.sx - this._ox) / v.s;
        v.cz = an.wz - (an.sy - this._oy) / v.s;
        this._clamp(v);
        if (v.s === g.s) {
          this._anchor = null;
          g.cx = v.cx;
          g.cz = v.cz;
        }
      } else {
        const dx = g.cx - v.cx;
        const dz = g.cz - v.cz;
        if (Math.abs(dx) * v.s > 0.3 || Math.abs(dz) * v.s > 0.3) {
          v.cx += dx * k;
          v.cz += dz * k;
        } else {
          v.cx = g.cx;
          v.cz = g.cz;
        }
      }
    }

    // ------------------------------------------------------------ input
    _keyDown(e) {
      if (!this.open) return;
      const t = e.target;
      if (t === this._search) {
        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (this._search.value) {
            this._search.value = '';
            this._onSearch();
          } else this._search.blur();
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          e.preventDefault();
          this._moveListIdx(e.code === 'ArrowDown' ? 1 : -1, false);
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          const r = this._rows[Math.max(0, this._listIdx)];
          if (r) {
            if (e.shiftKey) this._setGps(r.t);
            this._select(r.t, true);
          }
        } else if (e.code === 'Tab') {
          e.preventDefault();
          this._search.blur();
        }
        return;
      }
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; // the debug console
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this._keys.add(e.code);
      if (e.repeat) return;
      const code = e.code;
      if (/^Digit[1-7]$/.test(code)) {
        this.toggleCat(CATS[+code.slice(5) - 1].id);
        return;
      }
      switch (code) {
        case 'Slash':
          e.preventDefault();
          this.toggleSide(true);
          this._search.focus();
          this._search.select();
          break;
        case 'Tab':
          e.preventDefault();
          this.toggleSide();
          break;
        case 'KeyC':
        case 'Home':
          this.centreOnPlayer();
          break;
        case 'KeyG':
          this.showWaypoint();
          break;
        case 'KeyZ':
          this.showAll();
          break;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          this._setGps(null);
          break;
        case 'KeyP':
          this._pinAt(this._reticle || !this._mouse ? this._ox : this._mouse.x, this._reticle || !this._mouse ? this._oy : this._mouse.y);
          break;
        case 'KeyO':
          this.toggleOverlay('districts');
          break;
        case 'KeyN':
          this.toggleOverlay('streets');
          break;
        case 'KeyR':
          this.toggleOverlay('grid');
          break;
        case 'BracketLeft':
        case 'Comma':
          this._moveListIdx(-1, true);
          break;
        case 'BracketRight':
        case 'Period':
          this._moveListIdx(1, true);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          e.preventDefault();
          if (this._reticle || !this._mouse) {
            this._reticle = true;
            this._activate(this._hitAt(this._ox, this._oy, 30), this._ox, this._oy);
          } else if (this.hover) this._activate(this.hover, this._mouse.x, this._mouse.y);
          else this._reticle = true; // show the reticle first: a stray Space never drops a waypoint
          break;
        default:
          break;
      }
    }

    /** Held keys: WASD or the arrows pan (Shift for faster), Q/E or -/+ zoom. */
    _keyNav(dt) {
      const k = this._keys;
      if (!k.size) return;
      let x = 0;
      let y = 0;
      let z = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyQ') || k.has('Minus') || k.has('NumpadSubtract') || k.has('PageDown')) z -= 1;
      if (k.has('KeyE') || k.has('Equal') || k.has('NumpadAdd') || k.has('PageUp')) z += 1;
      if (x || y) {
        const l = Math.hypot(x, y);
        const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.4 : 1;
        this._panBy((-x / l) * PAN_SPEED * fast * dt, (-y / l) * PAN_SPEED * fast * dt);
        this._reticle = true;
      }
      if (z) {
        this._anchor = null;
        this.goal.s = clamp(this.goal.s * Math.exp(z * 2.2 * dt), this._minS, MAX_S);
        this.v.s = this.goal.s;
      }
    }

    /** A controller: the left stick pans under a centre reticle, the triggers or right stick zoom. */
    _padNav(pad, dt) {
      const mx = pad.move.x || 0;
      const my = pad.move.y || 0;
      if (mx || my) {
        this._panBy(-mx * PAN_SPEED * 1.15 * dt, my * PAN_SPEED * 1.15 * dt);
        this._reticle = true;
      }
      const zin = (pad.rt || 0) - (pad.lt || 0) - (pad.look.y || 0);
      if (Math.abs(zin) > 0.06) {
        this._anchor = null;
        this.goal.s = clamp(this.goal.s * Math.exp(zin * 2.2 * dt), this._minS, MAX_S);
        this.v.s = this.goal.s;
        this._reticle = true;
      }
      const now = pad.down;
      const prev = this._padPrev;
      const hit = (a) => now.has(a) && !prev.has(a);
      if (hit('jump')) this._activate(this._hitAt(this._ox, this._oy, 30), this._ox, this._oy);
      if (hit('crouch')) VH.events.emit('map:close');
      if (hit('reload')) this._setGps(null);
      if (hit('interact')) this.centreOnPlayer();
      if (hit('weaponWheel')) this._moveListIdx(-1, true);
      if (hit('camera')) this._moveListIdx(1, true);
      if (hit('lights')) this.toggleSide();
      if (hit('horn')) this.toggleOverlay('districts');
      if (hit('phone')) this._pinAt(this._ox, this._oy);
      if (now.size) this._reticle = true;
      this._padPrev = new Set(now);
    }

    // ------------------------------------------------- filters and panel
    toggleCat(id) {
      this.show[id] = !this.show[id];
      this._savePrefs();
      this._refreshToggles();
      this._staticDirty = true;
      this._rebuildList();
      const c = CATS.find((x) => x.id === id);
      this._toast(c.label + (this.show[id] ? ' shown' : ' hidden'));
    }

    toggleOverlay(id) {
      this.overlay[id] = !this.overlay[id];
      this._savePrefs();
      this._refreshToggles();
      this._staticDirty = true;
      const o = OVERLAYS.find((x) => x.id === id);
      this._toast(o.label + (this.overlay[id] ? ' on' : ' off'));
    }

    toggleSide(force) {
      const want = typeof force === 'boolean' ? force : !this.sideOpen;
      if (want === this.sideOpen) return;
      this.sideOpen = want;
      this.root.classList.toggle('side-open', want);
      this._savePrefs();
      this._layoutPanels();
    }

    _refreshToggles() {
      for (const c of CATS) this._filterEls[c.id].b.classList.toggle('is-off', !this.show[c.id]);
      for (const o of OVERLAYS) this._overlayEls[o.id].classList.toggle('is-on', !!this.overlay[o.id]);
    }

    _counts() {
      const n = { story: 0, jobs: 0, shops: 0, vehicles: 0, places: 0, police: 0, pins: this.pins.length };
      for (const bl of (this.state && this.state.blips) || []) {
        const T = TYPES[bl.type];
        if (T && n[T.cat] !== undefined && bl.type !== 'pin') n[T.cat]++;
      }
      n.places += (this._marks || []).filter((m) => !m.major).length;
      for (const c of CATS) this._filterEls[c.id].count.textContent = String(n[c.id]);
    }

    _toast(text) {
      const t = this._toastEl;
      t.textContent = text;
      t.classList.add('is-on');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.classList.remove('is-on'), 1700);
    }

    /** The footer: what the keys (or the pad's buttons) do. */
    _hints() {
      const dev = this.opts.device ? this.opts.device() : 'keyboard';
      const pad = dev === 'gamepad';
      const key = pad ? 'pad' : 'kb:' + (this.opts.closeKey || 'M');
      if (key === this._hintsDevice) return;
      this._hintsDevice = key;
      const h = this._hintsEl;
      h.textContent = '';
      const list = pad
        ? [['A', 'Set GPS'], ['X', 'Clear GPS'], ['Y', 'Find Jay'], ['LB RB', 'Places'], ['LT RT', 'Zoom'], ['B', 'Close']]
        : [['Click', 'Set GPS'], ['Right-click', 'Pin'], ['Drag', 'Move'], ['Wheel', 'Zoom'], ['C', 'Find Jay'], ['Tab', 'Panel'], [this.opts.closeKey || 'M', 'Close']];
      for (const [k, text] of list) {
        const s = el('span', 'vh-map-hint');
        s.append(el('kbd', '', k), document.createTextNode(' ' + text));
        h.append(s);
      }
      this.root.classList.toggle('is-pad', pad);
    }

    // ------------------------------------------- state: GPS, list, labels
    /** Once a frame: the GPS bar, the card and the list follow the waypoint. */
    _sync(force) {
      const st = this.state || {};
      const wp = st.waypoint;
      let obj = null;
      for (const bl of st.blips || []) if (bl.type === 'objective') obj = bl;
      const key = (wp ? wp.name + '@' + wp.x.toFixed(1) + ',' + wp.z.toFixed(1) : '') + '|' + (obj ? obj.label + '@' + Math.round(obj.x) + ',' + Math.round(obj.z) : '') + '|' + (st.route ? st.route.length : 0);
      this._hints();
      if (!force && key === this._wpKey) return;
      const hadBar = this._gpsEl.classList.contains('is-on');
      this._wpKey = key;
      const t = wp || obj;
      if (t) {
        const near = st.route && st.route.length > 1 && Math.hypot(st.route[st.route.length - 1][0] - t.x, st.route[st.route.length - 1][1] - t.z) < 40;
        const straight = Math.hypot(t.x - (st.x || 0), t.z - (st.z || 0));
        const L = near ? routeLength(st.route) : straight * 1.25;
        this._gpsKind.textContent = wp ? 'GPS' : 'Objective';
        this._gpsName.textContent = wp ? wp.name : obj.label || 'Objective';
        this._gpsMeta.textContent = K.formatDistance(L) + (near ? ' by road' : '') + ' · ' + minutes(L / DRIVE_SPEED) + ' drive';
        const url = iconURL(wp ? 'waypoint' : 'objective');
        this._gpsIcon.style.backgroundImage = url ? 'url(' + url + ')' : '';
        this._gpsClear.style.display = wp ? '' : 'none';
      }
      this._gpsEl.classList.toggle('is-on', !!t);
      this._gpsBtn.classList.toggle('is-off', !t);
      if (hadBar !== !!t || force) this._layoutPanels();
      if (!this._whereText || force) this._where();
      this._counts();
      this._rebuildList();
      if (this.sel) this._buildCard(this.sel);
    }

    _where() {
      const st = this.state || {};
      const lay = this.layout;
      const d = lay.districtAt ? lay.districtAt(st.x || 0, st.z || 0) : null;
      const road = VH.CityGen && VH.CityGen.roadNameAt ? VH.CityGen.roadNameAt(lay, st.x || 0, st.z || 0) : null;
      const text = [d && d.name, road, 'Grid ' + this._gridRef(st.x || 0, st.z || 0)].filter(Boolean).join('  ·  ');
      this._whereText = text;
      this._whereEl.textContent = text;
    }

    _gridRef(x, z) {
      const b = this.layout.config.bounds;
      const col = clamp(Math.floor((x - b.minX) / GRID), 0, 25);
      const row = Math.max(0, Math.floor((z - b.minZ) / GRID)) + 1;
      return String.fromCharCode(65 + col) + row;
    }

    _districtName(x, z) {
      const lay = this.layout;
      const d = lay && lay.districtAt ? lay.districtAt(x, z) : null;
      return d ? d.name : '';
    }

    /** The route the GPS would take (the game's, which knows the airport and base gates). */
    _routeTo(x, z) {
      const st = this.state || {};
      try {
        if (this.opts.routeTo) return this.opts.routeTo(st.x || 0, st.z || 0, x, z);
        return K.route(this.layout, st.x || 0, st.z || 0, x, z);
      } catch (err) {
        return null;
      }
    }

    /** Everything the list can show (and the search can find). */
    _entries(searching) {
      const st = this.state || {};
      const px = st.x || 0;
      const pz = st.z || 0;
      const out = [];
      const add = (t, sec, sub) => {
        t.sec = sec;
        t.sub = sub;
        t.d = Math.hypot(t.x - px, t.z - pz);
        out.push(t);
      };
      const lay = this.layout;
      const blips = st.blips || [];
      if (st.waypoint) add({ type: 'waypoint', name: st.waypoint.name, x: st.waypoint.x, z: st.waypoint.z }, 'gps', 'Your GPS waypoint');
      const open = new Set();
      for (const bl of blips) {
        if (bl.type === 'store') open.add(Math.round(bl.x) + ',' + Math.round(bl.z));
        if (!bl.label || bl.type === 'waypoint' || bl.type === 'pin' || bl.type === 'store' || bl.type === 'police' || bl.type === 'enemy' || bl.type === 'car') continue;
        const T = TYPES[bl.type] || TYPES.mission;
        const sec = bl.type === 'objective' ? 'now' : T.cat === 'story' || T.cat === 'jobs' ? 'jobs' : T.cat === 'vehicles' ? 'vehicles' : T.cat === 'shops' ? 'shops' : 'places';
        add({ type: bl.type, name: bl.label, x: bl.x, z: bl.z }, sec, T.name + ' · ' + this._districtName(bl.x, bl.z));
      }
      this.pins.forEach((p) => add({ type: 'pin', name: p.n, x: p.x, z: p.z, pin: p }, 'pins', 'Your pin · ' + this._districtName(p.x, p.z)));
      for (const m of this._marks || []) {
        const T = TYPES[m.kind] || TYPES.landmark;
        add({ type: m.major ? m.kind : 'landmark', name: m.name, x: m.x, z: m.z, gx: m.gx, gz: m.gz, tagline: m.tagline }, 'places', (m.major ? T.name : 'Landmark') + ' · ' + this._districtName(m.x, m.z));
      }
      for (const p of (this.opts.places && this.opts.places()) || []) {
        if (p && isFinite(p.x) && isFinite(p.z)) add({ type: 'place', name: p.name, x: p.x, z: p.z, kindName: p.kind }, 'places', (p.kind || 'Place') + ' · ' + this._districtName(p.x, p.z));
      }
      for (const s of lay.stores || []) {
        const isOpen = !open.size || open.has(Math.round(s.door.x) + ',' + Math.round(s.door.z));
        add({ type: 'store', name: s.name, x: s.door.x, z: s.door.z, closed: !isOpen }, 'shops', (isOpen ? 'Corner shop · ' : 'Shut for now · ') + this._districtName(s.door.x, s.door.z));
      }
      if (searching) {
        for (const d of this._districtSpots || []) add({ type: 'district', name: d.name, x: d.x, z: d.z, tagline: d.tagline }, 'districts', d.tagline || 'District');
        const seen = new Map();
        for (const r of lay.roads) {
          if (!r.name) continue;
          const x = r.axis === 'z' ? r.coord : clamp(px, r.from, r.to);
          const z = r.axis === 'z' ? clamp(pz, r.from, r.to) : r.coord;
          const dd = Math.hypot(x - px, z - pz);
          const prev = seen.get(r.name);
          if (!prev || dd < prev.dd) seen.set(r.name, { x, z, dd });
        }
        for (const [name, p] of seen) add({ type: 'street', name, x: p.x, z: p.z }, 'streets', 'Street · ' + this._districtName(p.x, p.z));
      }
      return out;
    }

    _onSearch() {
      this._query = this._search.value.trim().toLowerCase();
      this._listIdx = this._query ? 0 : -1;
      this._rebuildList();
    }

    _rebuildList() {
      if (!this.layout) return;
      const q = this._query;
      const words = q ? q.split(/\s+/) : null;
      const all = this._entries(!!q);
      const rows = [];
      for (const t of all) {
        const T = TYPES[t.type] || TYPES.place;
        if (words) {
          const hay = (t.name + ' ' + t.sub + ' ' + T.name).toLowerCase();
          if (!words.every((w) => hay.includes(w))) continue;
        } else if (T.cat !== 'always' && !this.show[T.cat]) continue;
        rows.push(t);
      }
      const order = new Map(SECTIONS.map((s, i) => [s[0], i]));
      rows.sort((a, b) => order.get(a.sec) - order.get(b.sec) || a.d - b.d);
      this._rows = rows.map((t) => ({ t }));
      const list = this._list;
      list.textContent = '';
      let sec = null;
      rows.forEach((t, i) => {
        if (t.sec !== sec) {
          sec = t.sec;
          list.append(el('div', 'vh-map-list-sec', SECTIONS[order.get(sec)][1]));
        }
        const row = el('div', 'vh-map-row' + (t.closed ? ' is-closed' : ''));
        row.dataset.i = String(i);
        const ic = el('span', 'vh-map-row-icon is-' + t.type);
        if (t.type === 'pin') ic.style.setProperty('--pin', PIN_COLOURS[t.pin.c]);
        else {
          const url = iconURL(t.type === 'place' ? 'landmark' : t.type === 'district' || t.type === 'street' ? '' : t.type);
          if (url) ic.style.backgroundImage = 'url(' + url + ')';
        }
        const text = el('span', 'vh-map-row-text');
        text.append(el('span', 'vh-map-row-name', t.name), el('span', 'vh-map-row-sub', t.sub));
        const go = el('button', 'vh-map-row-go', '➤');
        go.type = 'button';
        go.tabIndex = -1;
        go.title = 'Set the GPS here';
        row.append(ic, text, el('span', 'vh-map-row-dist', K.formatDistance(t.d)), go);
        this._rows[i].el = row;
        list.append(row);
      });
      if (!rows.length) list.append(el('div', 'vh-map-list-empty', q ? 'Nothing called “' + this._search.value.trim() + '”. Try a street or a district.' : 'Nothing to show. Turn some filters back on.'));
      this._listTitle.textContent = q ? 'Results' : 'Places';
      this._listNote.textContent = q ? rows.length + ' found' : 'nearest first';
      this._listIdx = Math.min(this._listIdx, rows.length - 1);
      this._markListIdx();
    }

    _onListClick(ev) {
      const row = ev.target.closest('.vh-map-row');
      if (!row) return;
      const r = this._rows[+row.dataset.i];
      if (!r) return;
      this._listIdx = +row.dataset.i;
      this._markListIdx();
      if (ev.target.closest('.vh-map-row-go')) this._setGps(r.t);
      this._select(r.t, true);
    }

    _moveListIdx(dir, go) {
      const n = this._rows.length;
      if (!n) return;
      this._listIdx = this._listIdx < 0 ? (dir > 0 ? 0 : n - 1) : (this._listIdx + dir + n) % n;
      this._markListIdx();
      if (go) this._select(this._rows[this._listIdx].t, true);
    }

    _markListIdx() {
      this._rows.forEach((r, i) => r.el && r.el.classList.toggle('is-active', i === this._listIdx));
      const r = this._rows[this._listIdx];
      if (r && r.el && r.el.scrollIntoView) r.el.scrollIntoView({ block: 'nearest' });
    }

    // -------------------------------------------- selecting and the GPS
    _isWaypoint(t) {
      const wp = this.state && this.state.waypoint;
      if (!wp || !t) return false;
      const x = typeof t.gx === 'number' ? t.gx : t.x;
      const z = typeof t.gz === 'number' ? t.gz : t.z;
      return Math.hypot(wp.x - x, wp.z - z) < 2;
    }

    _setGps(t) {
      if (!t) {
        if (this.state && this.state.waypoint) this._toast('GPS cleared');
        VH.events.emit('map:waypoint', null);
        return;
      }
      const x = typeof t.gx === 'number' ? t.gx : t.x;
      const z = typeof t.gz === 'number' ? t.gz : t.z;
      VH.events.emit('map:waypoint', { x, z, name: t.name });
      this._toast('GPS set: ' + t.name);
    }

    /** A click (or A on the pad): on the waypoint clears it, on a crowd zooms in, anything else sets the GPS there. */
    _activate(h, sx, sy) {
      if (h && h.kind === 'cluster') {
        const m = h.ref;
        let x0 = Infinity;
        let x1 = -Infinity;
        let z0 = Infinity;
        let z1 = -Infinity;
        for (const b of m) {
          x0 = Math.min(x0, b.x);
          x1 = Math.max(x1, b.x);
          z0 = Math.min(z0, b.z);
          z1 = Math.max(z1, b.z);
        }
        const span = Math.max(x1 - x0, z1 - z0, 10);
        this.flyTo((x0 + x1) / 2, (z0 + z1) / 2, Math.max(this.goal.s * 2.2, (CLUSTER_PX * 3) / span));
        return;
      }
      if (h && h.kind === 'blip' && h.ref.type === 'waypoint') {
        this._setGps(null);
        this._select(null);
        return;
      }
      if (h && h.kind === 'you') {
        this._select(this._targetOf(h), false);
        return;
      }
      const t = h ? this._targetOf(h) : this._spotAt(sx, sy);
      if (!t) return;
      this._setGps(t);
      this._select(t, false);
    }

    _targetOf(h) {
      const st = this.state || {};
      if (h.kind === 'blip') {
        const bl = h.ref;
        const T = TYPES[bl.type] || TYPES.mission;
        return { type: bl.type, name: bl.label || T.name, x: bl.x, z: bl.z };
      }
      if (h.kind === 'pin') return { type: 'pin', name: h.ref.n, x: h.ref.x, z: h.ref.z, pin: h.ref };
      if (h.kind === 'major') {
        const m = h.ref;
        return { type: m.kind, name: m.name, x: m.x, z: m.z, gx: m.gx, gz: m.gz, tagline: m.tagline };
      }
      if (h.kind === 'landmark') return { type: 'landmark', name: h.ref.name, x: h.ref.x, z: h.ref.z };
      if (h.kind === 'you') return { type: 'you', name: 'Jay Mercer', x: st.x || 0, z: st.z || 0 };
      return null;
    }

    /** An empty spot on the map, kept inside the world (the walls stand on its edges). */
    _spotAt(sx, sy) {
      const v = this.v;
      const lay = this.layout;
      const b = lay.config.bounds;
      const pier = lay.waterfront && lay.waterfront.pier;
      let x = v.cx + (sx - this._ox) / v.s;
      let z = v.cz + (sy - this._oy) / v.s;
      const onPier = pier && x >= b.maxX && x <= pier.x1 && z >= pier.z0 && z <= pier.z1;
      if (!onPier && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) {
        this._toast('That\'s outside Vicehaven');
        return null;
      }
      if (!onPier) {
        const seawall = lay.config.seawallX || b.maxX;
        x = clamp(x, b.minX + 4, Math.min(b.maxX, seawall) - 2);
        z = clamp(z, b.minZ + 4, b.maxZ - 4);
      }
      const road = VH.CityGen && VH.CityGen.roadNameAt ? VH.CityGen.roadNameAt(lay, x, z) : null;
      return { type: 'spot', name: road || this._districtName(x, z) || 'Waypoint', x, z };
    }

    _select(t, fly) {
      this.sel = t || null;
      this._preview = null;
      if (!t) {
        this._card.classList.remove('is-open');
        return;
      }
      if (fly) {
        // Big places fit in view; small ones come up close.
        const wide = { airport: 0.85, fort: 1.1, skyline: 1.6, district: 1.3, street: 1.6 }[t.type];
        this.flyTo(t.x, t.z, wide ? this._fitS * wide : Math.max(this.goal.s, this._fitS * 2.2));
      }
      t.route = t.type === 'you' ? null : this._routeTo(typeof t.gx === 'number' ? t.gx : t.x, typeof t.gz === 'number' ? t.gz : t.z);
      this._buildCard(t);
    }

    /** The info card: what it is, where, how far, how long, and what to do with it. */
    _buildCard(t) {
      const card = this._card;
      const st = this.state || {};
      card.textContent = '';
      const T = TYPES[t.type] || TYPES.place;
      const head = el('div', 'vh-map-card-head');
      const ic = el('span', 'vh-map-card-icon is-' + t.type);
      if (t.type === 'pin') ic.style.setProperty('--pin', PIN_COLOURS[t.pin.c]);
      else {
        const url = iconURL(t.type === 'place' ? 'landmark' : t.type === 'spot' ? 'waypoint' : t.type === 'you' ? 'player' : t.type);
        if (url) ic.style.backgroundImage = 'url(' + url + ')';
      }
      const kind = t.type === 'store' && t.closed ? 'Corner shop · shut for now' : t.kindName || T.name;
      const titles = el('div', 'vh-map-card-titles');
      titles.append(el('div', 'vh-map-card-kind', kind), el('div', 'vh-map-card-name', t.name));
      head.append(ic, titles, this._button('vh-map-card-x', '✕', 'Close', () => this._select(null)));
      card.append(head);
      if (t.tagline) card.append(el('div', 'vh-map-card-tag', t.tagline));

      const facts = el('div', 'vh-map-card-facts');
      const fact = (big, small) => {
        const f = el('div', 'vh-map-card-fact');
        f.append(el('b', '', big), el('span', '', small));
        facts.append(f);
      };
      const where = this._districtName(t.x, t.z);
      if (t.type === 'you') {
        const road = VH.CityGen && VH.CityGen.roadNameAt ? VH.CityGen.roadNameAt(this.layout, t.x, t.z) : null;
        fact(where || 'Vicehaven', 'district');
        fact(road || 'Off road', 'street');
        fact(this._gridRef(t.x, t.z), 'grid square');
        fact(st.heat ? st.heat + ' ★' : 'None', 'wanted level');
      } else {
        const straight = Math.hypot(t.x - (st.x || 0), t.z - (st.z || 0));
        const L = t.route && t.route.length > 1 ? routeLength(t.route) : straight * 1.3;
        fact(K.formatDistance(straight), 'away');
        fact(K.formatDistance(L), t.route ? 'by road' : 'roughly, by road');
        fact(minutes(L / DRIVE_SPEED), 'to drive');
        fact(minutes(L / FOOT_SPEED), 'on foot');
      }
      card.append(facts);
      let tip = T.tip || '';
      if (t.type === 'store' && t.closed) tip = 'Someone held it up. The clerk is back in a few minutes of game time.';
      if (t.type === 'airport') tip = 'Planes park by the terminal. Climb the fence or use the service gate on the south side.';
      if (t.type === 'fort') tip = 'Tanks, jets and helicopters. The guards shoot anyone who gets in.';
      if (t.type === 'skyline') tip = 'Eight towers. The tallest has the best view in the city.';
      if (t.type === 'spot' || t.type === 'waypoint') tip = '';
      if (tip) card.append(el('div', 'vh-map-card-tip', tip));
      card.append(el('div', 'vh-map-card-meta', [where, 'Grid ' + this._gridRef(t.x, t.z)].filter(Boolean).join('  ·  ')));

      if (t.type !== 'you') {
        const acts = el('div', 'vh-map-card-actions');
        const isWp = this._isWaypoint(t) || t.type === 'waypoint';
        acts.append(this._button('vh-map-card-btn is-primary' + (isWp ? ' is-clear' : ''), isWp ? 'Clear GPS' : 'Set GPS', isWp ? 'Remove the waypoint' : 'Put the GPS waypoint here', () => {
          this._setGps(isWp ? null : t);
          if (isWp && t.type === 'waypoint') this._select(null);
        }));
        const pinned = t.type === 'pin' ? t.pin : this.pins.find((p) => Math.hypot(p.x - t.x, p.z - t.z) < 2);
        acts.append(this._button('vh-map-card-btn', pinned ? 'Remove pin' : 'Pin it', pinned ? 'Take the pin off the map' : 'Mark it with a pin', () => {
          if (pinned) {
            this._removePin(pinned);
            if (t.type === 'pin') this._select(null);
            else this._buildCard(t);
          } else {
            this._addPin(t.x, t.z, t.type === 'spot' ? null : t.name);
            this._buildCard(t);
          }
        }));
        acts.append(this._button('vh-map-card-btn', 'Zoom in', 'Look closer', () => this.flyTo(t.x, t.z, Math.max(this.goal.s * 2, this._fitS * 2.5))));
        card.append(acts);
        // A faint preview of the way there, until the GPS line itself shows it.
        this._preview = !isWp && t.route && t.route.length > 1 ? t.route : null;
      }
      card.classList.add('is-open');
    }

    // ------------------------------------------------------------- pins
    _addPin(x, z, name) {
      if (this.pins.length >= MAX_PINS) {
        this.pins.shift();
        this._toast('Oldest pin removed (' + MAX_PINS + ' at most)');
      }
      this._pinSerial++;
      const p = { x, z, c: (this._pinSerial - 1) % PIN_COLOURS.length, n: name ? String(name).slice(0, 48) : 'Pin ' + this._pinSerial };
      this.pins.push(p);
      saveJSON(PINS_KEY, this.pins);
      this._toast('Pinned: ' + p.n);
      this._counts();
      this._rebuildList();
      return p;
    }

    _removePin(p) {
      const i = this.pins.indexOf(p);
      if (i < 0) return;
      this.pins.splice(i, 1);
      saveJSON(PINS_KEY, this.pins);
      this._toast('Pin removed');
      this._counts();
      this._rebuildList();
    }

    /** Right-click or P: on a pin removes it; on a place pins it by name; anywhere else drops a pin. */
    _pinAt(sx, sy) {
      const h = this._hitAt(sx, sy);
      if (h && h.kind === 'pin') {
        if (this.sel && this.sel.pin === h.ref) this._select(null);
        return this._removePin(h.ref);
      }
      const t = h && h.kind !== 'cluster' && h.kind !== 'you' ? this._targetOf(h) : this._spotAt(sx, sy);
      if (!t) return;
      if (!this.show.pins) {
        this.show.pins = true;
        this._refreshToggles();
      }
      this._addPin(t.x, t.z, t.type === 'spot' ? null : t.name);
    }

    /** Pins for the radar (and the game's blip list). */
    pinBlips(out) {
      if (!this.show.pins) return;
      for (const p of this.pins) out.push({ x: p.x, z: p.z, type: 'pin', label: p.n, noRim: true });
    }

    // ---------------------------------------------------------- drawing
    _draw(now) {
      if (!this._fw) return;
      const v = this.v;
      const L = this._lastV;
      const moved = !L || L.cx !== v.cx || L.cz !== v.cz || L.s !== v.s || L.ox !== this._ox || L.oy !== this._oy;
      if (moved) {
        this._lastV = { cx: v.cx, cz: v.cz, s: v.s, ox: this._ox, oy: this._oy };
        this._staticDirty = true;
        this._ovDirty = true;
        this._lastMove = now;
        this._updateScale();
      } else if (this._coarse && now - this._lastMove > 120) this._staticDirty = true; // settled: sharpen
      if (this._staticDirty) {
        this._staticDirty = false;
        this._renderStatic(now - this._lastMove < 120);
      }
      if (this._ovDirty) {
        this._ovDirty = false;
        this._drawOverview();
      }
      this._drawDynamic(now);
    }

    _updateScale() {
      const s = this.v.s;
      const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
      let L = nice[0];
      for (const n of nice) if (n * s <= 130) L = n;
      this._scaleBar.style.width = Math.round(L * s) + 'px';
      this._scaleLabel.textContent = L >= 1000 ? L / 1000 + ' km' : L + ' m';
    }

    /** The static layer: the city, the overlays and the labels. */
    _renderStatic(moving) {
      const g = this._fsg;
      const d = this._fd;
      const W = this._fw;
      const H = this._fh;
      const v = this.v;
      const s = v.s;
      const ox = this._ox;
      const oy = this._oy;
      const PAL = K.PAL;
      const lay = this.layout;
      g.setTransform(1, 0, 0, 1, 0, 0);
      // Beyond the painted area: open land, and the bay to the east, shaded like the picture's.
      const E = this.mm._ext.paint;
      const seaX0 = (ox + (lay.config.seawallX - v.cx) * s) * d;
      const seaX = clamp(Math.round(seaX0), 0, this._fs.width);
      g.fillStyle = PAL.outsideLand;
      g.fillRect(0, 0, seaX, this._fs.height);
      const water = g.createLinearGradient(seaX0, 0, Math.max(seaX0 + 1, (ox + (E.maxX - v.cx) * s) * d), 0);
      water.addColorStop(0, PAL.water0);
      water.addColorStop(0.35, PAL.water1);
      water.addColorStop(1, PAL.water2);
      g.fillStyle = water;
      g.fillRect(seaX, 0, this._fs.width - seaX, this._fs.height);
      const view = { minX: v.cx - ox / s, maxX: v.cx + (W - ox) / s, minZ: v.cz - oy / s, maxZ: v.cz + (H - oy) / s };
      const devPPM = s * d;
      g.setTransform(d * s, 0, 0, d * s, d * (ox - v.cx * s), d * (oy - v.cz * s));
      this._coarse = false;
      if (devPPM <= VECTOR_PPM || moving) {
        const base = this.mm._base;
        const lvl = devPPM < 0.85 ? base[1] : base[0];
        const x0 = Math.max(E.minX, view.minX);
        const x1 = Math.min(E.maxX, view.maxX);
        const z0 = Math.max(E.minZ, view.minZ);
        const z1 = Math.min(E.maxZ, view.maxZ);
        if (x1 > x0 && z1 > z0) {
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = moving ? 'low' : 'high';
          const ls = lvl.s;
          g.drawImage(lvl.canvas, (x0 - E.minX) * ls, (z0 - E.minZ) * ls, (x1 - x0) * ls, (z1 - z0) * ls, x0, z0, x1 - x0, z1 - z0);
        }
        this._coarse = devPPM > VECTOR_PPM;
      } else {
        // Zoomed past the image: repaint what is on screen as vectors, so it stays sharp.
        g.save();
        g.beginPath();
        g.rect(E.minX, E.minZ, E.maxX - E.minX, E.maxZ - E.minZ);
        g.clip();
        if (!this._fsNoise) this._fsNoise = K.noisePattern(g);
        K.paintCity(g, lay, { px: 1 / devPPM, view, noise: this._fsNoise });
        g.restore();
      }
      if (this.overlay.districts) this._drawDistricts(g);
      g.setTransform(d, 0, 0, d, 0, 0);
      this._hatchOutside(g);
      if (this.overlay.grid) this._drawGridLines(g);
      this._boxes.length = 0;
      this._staticHits.length = 0;
      this._drawLabels(g);
      if (this.overlay.grid) this._drawGridLabels(g);
      this._staticBoxes = this._boxes.length;
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** Beyond the hedge: darker and hatched, so the end of the world reads as the end. */
    _hatchOutside(g) {
      const v = this.v;
      const s = v.s;
      const cfg = this.layout.config;
      const b = cfg.bounds;
      const W = this._fw;
      const H = this._fh;
      const x0 = this._ox + (b.minX - v.cx) * s;
      const x1 = Math.min(W, this._ox + (cfg.seawallX - v.cx) * s);
      const y0 = this._oy + (b.minZ - v.cz) * s;
      const y1 = this._oy + (b.maxZ - v.cz) * s;
      if (x1 <= 0 || (x0 <= 0 && y0 <= 0 && y1 >= H)) return;
      if (!this._hatch) {
        const c = K.makeCanvas(14, 14);
        const hg = c.getContext('2d');
        hg.strokeStyle = 'rgba(190, 220, 210, 0.07)';
        hg.lineWidth = 1.5;
        hg.beginPath();
        hg.moveTo(0, 14);
        hg.lineTo(14, 0);
        hg.moveTo(-2, 2);
        hg.lineTo(2, -2);
        hg.moveTo(12, 16);
        hg.lineTo(16, 12);
        hg.stroke();
        this._hatch = g.createPattern(c, 'repeat');
      }
      g.beginPath();
      g.rect(0, 0, x1, H);
      g.rect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.fill('evenodd');
      if (this._hatch) {
        g.fillStyle = this._hatch;
        g.fill('evenodd');
      }
    }

    /** District colours: a coarse raster of districtAt, made once and drawn soft. */
    _drawDistricts(g) {
      let R = this._districtRaster;
      if (!R) {
        const lay = this.layout;
        const L = this.mm._ext.land;
        const step = 8;
        const nx = Math.ceil((L.maxX - L.minX) / step);
        const nz = Math.ceil((L.maxZ - L.minZ) / step);
        const c = K.makeCanvas(nx, nz);
        const cg = c.getContext('2d');
        const img = cg.createImageData(nx, nz);
        const ids = new Array(nx * nz);
        const cols = new Map();
        for (let iz = 0; iz < nz; iz++) {
          for (let ix = 0; ix < nx; ix++) {
            const d = lay.districtAt ? lay.districtAt(L.minX + (ix + 0.5) * step, L.minZ + (iz + 0.5) * step) : null;
            ids[iz * nx + ix] = d && d.id !== 'outskirts' && d.id !== 'bay' ? d : null;
          }
        }
        for (let iz = 0; iz < nz; iz++) {
          for (let ix = 0; ix < nx; ix++) {
            const d = ids[iz * nx + ix];
            if (!d) continue;
            let rgb = cols.get(d.id);
            if (!rgb) cols.set(d.id, (rgb = K.hexRgb(K.tintOf(d) || '#8fa3c8')));
            const edge = (ix > 0 && ids[iz * nx + ix - 1] !== d) || (ix < nx - 1 && ids[iz * nx + ix + 1] !== d) || (iz > 0 && ids[(iz - 1) * nx + ix] !== d) || (iz < nz - 1 && ids[(iz + 1) * nx + ix] !== d);
            const i = (iz * nx + ix) * 4;
            img.data[i] = rgb[0];
            img.data[i + 1] = rgb[1];
            img.data[i + 2] = rgb[2];
            img.data[i + 3] = edge ? 255 : 120;
          }
        }
        cg.putImageData(img, 0, 0);
        R = this._districtRaster = { canvas: c, x: L.minX, z: L.minZ, w: nx * step, h: nz * step };
      }
      g.save();
      g.globalAlpha = 0.42;
      g.globalCompositeOperation = 'screen';
      g.imageSmoothingEnabled = true;
      g.drawImage(R.canvas, R.x, R.z, R.w, R.h);
      g.restore();
    }

    _drawGridLines(g) {
      const v = this.v;
      const s = v.s;
      const b = this.layout.config.bounds;
      const W = this._fw;
      const H = this._fh;
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(200, 220, 255, 0.13)';
      g.beginPath();
      for (let x = b.minX; x <= b.maxX + GRID; x += GRID) {
        const X = Math.round(this._ox + (x - v.cx) * s) + 0.5;
        if (X < 0 || X > W) continue;
        g.moveTo(X, 0);
        g.lineTo(X, H);
      }
      for (let z = b.minZ; z <= b.maxZ + GRID; z += GRID) {
        const Y = Math.round(this._oy + (z - v.cz) * s) + 0.5;
        if (Y < 0 || Y > H) continue;
        g.moveTo(0, Y);
        g.lineTo(W, Y);
      }
      g.stroke();
    }

    /** Column letters along the top of the map area and row numbers down its left. */
    _drawGridLabels(g) {
      const v = this.v;
      const s = v.s;
      const b = this.layout.config.bounds;
      const a = this._area;
      g.font = '700 10px ' + K.font();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tag = (text, X, Y) => {
        K.roundRectPath(g, X - 10, Y - 8, 20, 16, 5);
        g.fillStyle = 'rgba(8, 11, 24, 0.78)';
        g.fill();
        g.fillStyle = 'rgba(220, 230, 255, 0.85)';
        g.fillText(text, X, Y + 0.5);
      };
      for (let i = 0; b.minX + i * GRID < b.maxX + GRID; i++) {
        const X = this._ox + (b.minX + (i + 0.5) * GRID - v.cx) * s;
        if (X > a.x0 + 60 && X < a.x1 - 110) tag(String.fromCharCode(65 + i), X, a.y0 + 86);
      }
      for (let j = 0; b.minZ + j * GRID < b.maxZ; j++) {
        const Y = this._oy + (b.minZ + (j + 0.5) * GRID - v.cz) * s;
        if (Y > a.y0 + 110 && Y < a.y1 - 90) tag(String(j + 1), a.x0 + 22, Y);
      }
    }

    _claim(x0, y0, x1, y1) {
      this._boxes.push(x0, y0, x1, y1);
    }

    _collides(x0, y0, x1, y1) {
      const B = this._boxes;
      for (let i = 0; i < B.length; i += 4) {
        if (x1 > B[i] && x0 < B[i + 2] && y1 > B[i + 1] && y0 < B[i + 3]) return true;
      }
      return false;
    }

    _measure(g, text) {
      const key = g.font + '|' + text;
      let w = this._textW.get(key);
      if (w === undefined) {
        w = g.measureText(text).width;
        if (this._textW.size > 600) this._textW.clear();
        this._textW.set(key, w);
      }
      return w;
    }

    _haloText(g, text, x, y, halo, fill, lw) {
      g.lineJoin = 'round';
      g.lineWidth = lw;
      g.strokeStyle = halo;
      g.strokeText(text, x, y);
      g.fillStyle = fill;
      g.fillText(text, x, y);
    }

    /** Where the place and street names go (planned once per city). */
    _planLabels() {
      const lay = this.layout;
      const districts = VH.Data.districts || [];
      const marks = [];
      for (const bl of lay.blocks) if (bl.landmark) marks.push({ name: bl.landmark.name, x: bl.cx, z: bl.cz });
      const wfPier = lay.waterfront && lay.waterfront.pier;
      for (const lm of VH.Data.landmarks || []) {
        if (lm.block || typeof lm.x !== 'number') continue;
        if (lm.kind === 'pier' && wfPier) marks.push({ name: lm.name, x: (wfPier.x0 + wfPier.x1) / 2, z: (wfPier.z0 + wfPier.z1) / 2 });
        else if (lm.major) {
          const did = lm.kind === 'skyline' ? 'northgate' : lm.kind;
          const dist = districts.find((d) => d.id === did);
          marks.push({ name: lm.name, x: lm.x, z: lm.z, kind: lm.kind, major: true, gx: lm.gx, gz: lm.gz, tagline: dist ? dist.tagline : '' });
        } else marks.push({ name: lm.name, x: lm.x, z: lm.z });
      }
      this._marks = marks;

      // Districts with blocks: candidate spots are their plain blocks, nearest the centroid first.
      const plans = [];
      const spots = [];
      for (const d of districts) {
        const blocks = lay.blocks.filter((b) => b.district && b.district.id === d.id);
        if (!blocks.length) continue;
        let cx = 0;
        let cz = 0;
        for (const b of blocks) {
          cx += b.cx;
          cz += b.cz;
        }
        cx /= blocks.length;
        cz /= blocks.length;
        const cands = blocks
          .filter((b) => !b.landmark)
          .map((b) => ({ x: b.cx, z: b.cz, d: Math.hypot(b.cx - cx, b.cz - cz) }))
          .sort((p, q) => p.d - q.d);
        if (!cands.length) cands.push({ x: cx, z: cz, d: 0 });
        plans.push({ district: d, cands });
        spots.push({ name: d.name, tagline: d.tagline, x: cands[0].x, z: cands[0].z });
      }
      this._districtPlans = plans;
      // Keep open-land and bay names off the roads out of town and away from the pier.
      const cfg = lay.config;
      const edgeX = cfg.lines[cfg.lines.length - 1] + 8;
      const avoid = lay.segments
        .filter((sg) => sg.minX < -edgeX || sg.maxX > edgeX || sg.minZ < -edgeX || sg.maxZ > edgeX)
        .map((sg) => ({ minX: sg.minX, maxX: sg.maxX, minZ: sg.minZ, maxZ: sg.maxZ, pad: 20 }));
      if (wfPier) avoid.push({ minX: wfPier.x0, maxX: Infinity, minZ: wfPier.z0, maxZ: wfPier.z1, pad: 70 });
      const bb = cfg.bounds;
      const area = { minX: bb.minX, maxX: this.mm._ext.land.maxX, minZ: bb.minZ, maxZ: bb.maxZ };
      const badged = new Set(['northgate', 'airport', 'fort']); // these have a badge and a big name instead
      const open = K.openDistrictSpots(lay, area, avoid);
      this._openSpots = open.filter((sp) => !badged.has(sp.district && sp.district.id));
      for (const sp of open) spots.push({ name: sp.district.name, tagline: sp.district.tagline, x: sp.cands[0].x, z: sp.cands[0].z });
      this._districtSpots = spots;

      this._roadSegs = lay.roads.map((r) => lay.segments.filter((sg) => sg.road === r).sort((p, q) => p.from - q.from));
      const lines = cfg.lines;
      const east = lines[lines.length - 1] + cfg.avenueWidth(lines[lines.length - 1]) / 2 + (cfg.sidewalk || 4);
      this._boardwalk = lay.waterfront && lay.waterfront.boardwalk ? { x: (east + cfg.seawallX) / 2, z: -200, width: cfg.seawallX - east } : null;
    }

    /** Names on the map, most important first, each only where it fits and the zoom suits it. */
    _drawLabels(g) {
      const v = this.v;
      const s = v.s;
      const W = this._fw;
      const H = this._fh;
      const ox = this._ox;
      const oy = this._oy;
      const sx = (x) => ox + (x - v.cx) * s;
      const sy = (z) => oy + (z - v.cz) * s;
      const onScreen = (X, Y, m) => X > -m && X < W + m && Y > -m && Y < H + m;
      const spr = this._spr;
      const FONT = K.font();
      const setSpacing = K.setSpacing;
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      const pb = this._panelBoxes;
      for (let i = 0; i < pb.length; i += 4) this._claim(pb[i], pb[i + 1], pb[i + 2], pb[i + 3]);
      const st = this.state || {};
      const PX = sx(st.x || 0);
      const PY = sy(st.z || 0);
      this._claim(PX - 16, PY - 16, PX + 16, PY + 30); // the arrow and its YOU tag
      // 0. The big places: a badge, a bold name and the tagline, at every zoom.
      for (const m of this._marks) {
        if (!m.major) continue;
        const X = sx(m.x);
        const Y = sy(m.z);
        if (!onScreen(X, Y, 160)) continue;
        const sp = spr[m.kind] || spr.landmark;
        const S = sp.size * 1.55;
        g.drawImage(sp.canvas, X - S / 2, Y - S / 2, S, S);
        this._claim(X - 14, Y - 14, X + 14, Y + 14);
        this._staticHits.push({ X, Y, r: 22, kind: 'major', ref: m });
        const txt = m.name.toUpperCase();
        const size = clamp(12 + s * 5, 13, 19);
        g.font = '800 ' + size.toFixed(1) + 'px ' + FONT;
        setSpacing(g, 2.2);
        const w = g.measureText(txt).width;
        g.font = 'italic 500 11px ' + FONT;
        setSpacing(g, 0.4);
        const showTag = m.tagline && s > 0.22;
        const tw = showTag ? g.measureText(m.tagline).width : 0;
        const bw = Math.max(w, tw) / 2 + 4;
        for (const dir of [1, -1]) {
          const ty = Y + dir * (size + 10);
          const y0 = dir > 0 ? ty - size / 2 - 2 : ty - size / 2 - (showTag ? 16 : 2);
          const y1 = dir > 0 ? ty + size / 2 + (showTag ? 16 : 2) : ty + size / 2 + 2;
          if (this._collides(X - bw, y0, X + bw, y1)) continue;
          g.font = '800 ' + size.toFixed(1) + 'px ' + FONT;
          setSpacing(g, 2.2);
          this._haloText(g, txt, X + 1, ty, 'rgba(6, 9, 20, 0.92)', '#ffffff', 5);
          if (showTag) {
            g.font = 'italic 500 11px ' + FONT;
            setSpacing(g, 0.4);
            this._haloText(g, m.tagline, X, dir > 0 ? ty + size / 2 + 8 : ty - size / 2 - 8, 'rgba(6, 9, 20, 0.85)', '#ffcf8a', 3.5);
          }
          this._claim(X - bw, y0, X + bw, y1);
          break;
        }
      }

      // 1. Landmarks: the marker from a distance, the name once close enough.
      if (this.show.places) {
        g.font = '700 ' + (s > 1.4 ? 11.5 : 10.5) + 'px ' + FONT;
        setSpacing(g, 1.6);
        const marks = [];
        for (const m of this._marks) {
          if (m.major) continue;
          const X = sx(m.x);
          const Y = sy(m.z);
          if (!onScreen(X, Y, 80)) continue;
          const S = spr.landmark.size * (s > 0.5 ? 1 : 0.85);
          g.drawImage(spr.landmark.canvas, X - S / 2, Y - S / 2, S, S);
          this._claim(X - 8, Y - 8, X + 8, Y + 8);
          this._staticHits.push({ X, Y, r: 12, kind: 'landmark', ref: m });
          if (s >= 0.32) marks.push(m, X, Y);
        }
        for (let i = 0; i < marks.length; i += 3) {
          const X = marks[i + 1];
          const Y = marks[i + 2];
          const txt = marks[i].name.toUpperCase();
          const w = g.measureText(txt).width;
          for (const ty of [Y + 15, Y - 15]) {
            if (this._collides(X - w / 2 - 3, ty - 7, X + w / 2 + 3, ty + 7)) continue;
            this._haloText(g, txt, X + 0.8, ty, 'rgba(6, 9, 20, 0.88)', '#ffcf8a', 3.5);
            this._claim(X - w / 2 - 3, ty - 7, X + w / 2 + 3, ty + 7);
            break;
          }
        }
      }

      // 2. District names, with a sunset rule and (when there is room) the tagline.
      const fs = clamp(11 + s * 15, 15, 30);
      const tagOK = s > 0.3;
      for (const plan of this._districtPlans) {
        const d = plan.district;
        const txt = d.name.toUpperCase();
        g.font = '700 ' + fs + 'px ' + FONT;
        setSpacing(g, fs * 0.34);
        const w = g.measureText(txt).width;
        const below = tagOK && d.tagline ? 20 : 8;
        let placed = null;
        for (const c of plan.cands) {
          const X = sx(c.x);
          const Y = sy(c.z);
          if (!onScreen(X, Y, -20)) continue;
          if (!this._collides(X - w / 2 - 6, Y - fs / 2 - 4, X + w / 2 + 6, Y + fs / 2 + below)) {
            placed = { X, Y };
            break;
          }
        }
        if (!placed) continue;
        const { X, Y } = placed;
        this._haloText(g, txt, X + fs * 0.17, Y, 'rgba(5, 8, 18, 0.55)', 'rgba(255, 255, 255, 0.9)', 6);
        g.fillStyle = K.sunsetGradient(g, X - 16, 0, X + 16, 0);
        g.fillRect(X - 16, Y + fs / 2 + 3, 32, 2);
        if (tagOK && d.tagline) {
          g.font = 'italic 500 11px ' + FONT;
          setSpacing(g, 0.8);
          this._haloText(g, d.tagline, X, Y + fs / 2 + 14, 'rgba(5, 8, 18, 0.7)', 'rgba(210, 216, 236, 0.8)', 3);
        }
        this._claim(X - w / 2 - 6, Y - fs / 2 - 4, X + w / 2 + 6, Y + fs / 2 + below);
      }

      // The icons drawn over this layer (the game holds still while the map is open):
      // district names may sit under them, the smaller names keep clear.
      for (const bl of st.blips || []) {
        const T = TYPES[bl.type] || TYPES.mission;
        if (bl.type === 'pin' || (T.cat !== 'always' && !this.show[T.cat])) continue;
        const X = sx(bl.x);
        const Y = sy(bl.z);
        if (onScreen(X, Y, 20)) this._claim(X - 10, Y - 10, X + 10, Y + 10);
      }
      if (this.show.pins) {
        for (const p of this.pins) {
          const X = sx(p.x);
          const Y = sy(p.z);
          if (onScreen(X, Y, 30)) this._claim(X - 3, Y - 24, X + 15, Y + 2);
        }
      }

      // 3. Open land and water (districts without blocks), and the boardwalk.
      for (const sp of this._openSpots) {
        const txt = sp.district.name.toUpperCase();
        const size = clamp(10 + s * 8, 12, 20);
        g.font = (sp.water ? 'italic ' : '') + '600 ' + size + 'px ' + FONT;
        setSpacing(g, size * (sp.water ? 0.55 : 0.4));
        const w = g.measureText(txt).width;
        for (const c of sp.cands) {
          if (w > c.run * s * 0.95) continue;
          const X = sx(c.x);
          const Y = sy(c.z);
          const bx = c.vertical ? size / 2 + 4 : w / 2 + 4;
          const by = c.vertical ? w / 2 + 4 : size / 2 + 4;
          if (X - bx < 8 || X + bx > W - 8 || Y - by < 8 || Y + by > H - 8) continue;
          if (this._collides(X - bx, Y - by, X + bx, Y + by)) continue;
          g.save();
          g.translate(X, Y);
          if (c.vertical) g.rotate(-Math.PI / 2);
          this._haloText(g, txt, size * (sp.water ? 0.275 : 0.2), 0, 'rgba(4, 8, 18, 0.5)', sp.water ? 'rgba(150, 205, 240, 0.62)' : 'rgba(190, 225, 200, 0.55)', 4);
          g.restore();
          this._claim(X - bx, Y - by, X + bx, Y + by);
          break;
        }
      }
      const bw = this._boardwalk;
      if (bw && bw.width * s >= 10) {
        const X = sx(bw.x);
        const Y = sy(bw.z);
        g.font = 'italic 600 ' + clamp(bw.width * s * 0.5, 8.5, 11) + 'px ' + FONT;
        setSpacing(g, 2);
        const txt = 'THE BOARDWALK';
        const w = g.measureText(txt).width;
        if (onScreen(X, Y, 100) && !this._collides(X - 6, Y - w / 2 - 4, X + 6, Y + w / 2 + 4)) {
          g.save();
          g.translate(X, Y);
          g.rotate(-Math.PI / 2);
          this._haloText(g, txt, 1, 0, 'rgba(20, 12, 6, 0.6)', 'rgba(255, 214, 170, 0.8)', 3);
          g.restore();
          this._claim(X - 6, Y - w / 2 - 4, X + 6, Y + w / 2 + 4);
        }
      }

      // 4. Street names: the big roads from a distance, every street close up.
      if (this.overlay.streets && s >= 0.36) {
        const fr = clamp(8 + s * 2.4, 9, 12.5);
        g.font = '600 ' + fr + 'px ' + FONT;
        K.setStretch(g, 'semi-condensed');
        setSpacing(g, fr * 0.14);
        const roads = this.layout.roads;
        for (let ri = 0; ri < roads.length; ri++) {
          const r = roads[ri];
          const segs = this._roadSegs[ri];
          if (!segs.length || !r.name) continue;
          const major = r.width >= 18;
          if (!major && s < 0.75) continue;
          const txt = r.name.toUpperCase();
          const w = g.measureText(txt).width;
          const wm = (w + 16) / s; // the label's length in metres
          // On a boulevard the name sits on one carriageway rather than on the planted median.
          const lane = r.median > 0 ? (r.width - r.median) / 2 : r.width;
          const inside = lane * s >= fr + 3;
          const across = inside && r.median > 0 ? r.median / 2 + lane / 2 : 0;
          const typical = Math.max(1, (segs[0].to - segs[0].from) * s);
          const every = Math.max(1, Math.round(Math.max(w * 2.4, 320) / typical));
          const start = (ri * 2) % every;
          for (let j0 = start; j0 < segs.length; j0 += every) {
            for (let j = Math.max(0, j0); j < Math.min(segs.length, j0 + every); j++) {
              const seg = segs[j];
              const mid = (seg.from + seg.to) / 2;
              if (mid - wm / 2 < r.from || mid + wm / 2 > r.to) continue;
              const X = sx(r.axis === 'z' ? r.coord + across : mid);
              const Y = sy(r.axis === 'z' ? mid : r.coord + across);
              const vert = r.axis === 'z';
              const bx = vert ? fr / 2 + 2 : w / 2 + 5;
              const by = vert ? w / 2 + 5 : fr / 2 + 2;
              if (X - bx < 2 || X + bx > W - 2 || Y - by < 2 || Y + by > H - 2) continue; // whole, or not at all
              if (this._collides(X - bx, Y - by, X + bx, Y + by)) continue;
              g.save();
              g.translate(X, Y);
              if (vert) g.rotate(-Math.PI / 2);
              const ox2 = fr * 0.07;
              if (inside) {
                g.fillStyle = major ? 'rgba(30, 20, 18, 0.95)' : 'rgba(24, 22, 28, 0.88)';
                g.fillText(txt, ox2, 0.5);
              } else {
                this._haloText(g, txt, ox2, 0, 'rgba(6, 9, 20, 0.85)', major ? '#ffe6cc' : 'rgba(236, 238, 248, 0.85)', 3);
              }
              g.restore();
              this._claim(X - bx, Y - by, X + bx, Y + by);
              break;
            }
          }
        }
        K.setStretch(g, 'normal');
      }
      setSpacing(g, 0);
    }

    /** Blips on screen, crowded ones merged: [{ X, Y, bl, i, pr, edge, members }]. */
    _layoutBlips(blips, s, e, f) {
      const out = this._items;
      out.length = 0;
      const a = this._area;
      const W = this._fw;
      const H = this._fh;
      const groups = [];
      const CL = s < 0.5 ? CLUSTER_PX * 2 : s < 0.9 ? CLUSTER_PX * 1.3 : CLUSTER_PX;
      const x0 = a.x0 + 26;
      const x1 = a.x1 - 26;
      const y0 = a.y0 + 84;
      const y1 = a.y1 - 84;
      for (let i = 0; i < blips.length; i++) {
        const bl = blips[i];
        if (bl.type === 'pin') continue; // drawn in their own colours
        const T = TYPES[bl.type] || TYPES.mission;
        if (T.cat !== 'always' && !this.show[T.cat]) continue;
        let X = s * bl.x + e;
        let Y = s * bl.z + f;
        let edge = false;
        if (T.edge && (X < x0 || X > x1 || Y < y0 || Y > y1)) {
          // Off the map area: pinned to its edge with an arrow and the distance.
          X = clamp(X, x0, x1);
          Y = clamp(Y, y0, y1);
          edge = true;
        } else if (X < -30 || X > W + 30 || Y < -30 || Y > H + 30) continue;
        const pr = K.PRIORITY[bl.type] || 0;
        if (T.cluster) {
          let hit = null;
          for (const c of groups) {
            if (c.cat === T.cat && Math.abs(c.X0 - X) < CL && Math.abs(c.Y0 - Y) < CL) {
              hit = c;
              break;
            }
          }
          if (hit) {
            hit.members.push(bl);
            hit.sx += X;
            hit.sy += Y;
            continue;
          }
          const c = { X, Y, X0: X, Y0: Y, sx: X, sy: Y, bl, i, pr, edge: false, members: [bl], cat: T.cat };
          groups.push(c);
          out.push(c);
        } else out.push({ X, Y, bl, i, pr, edge, members: null });
      }
      for (const c of groups) {
        if (c.members.length > 1) {
          c.X = c.sx / c.members.length;
          c.Y = c.sy / c.members.length;
        } else c.members = null;
      }
      out.sort((p, q) => p.pr - q.pr);
      return out;
    }

    /** The live layer, every frame: routes, icons, pins, the player, hover and selection. */
    _drawDynamic(now) {
      const g = this._fg;
      const d = this._fd;
      const st = this.state || {};
      const v = this.v;
      const s = v.s;
      const e = this._ox - v.cx * s;
      const f = this._oy - v.cz * s;
      const t = now / 1000;
      const mm = this.mm;
      const spr = this._spr;
      const FONT = K.font();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this._fs, 0, 0);
      g.setTransform(d, 0, 0, d, 0, 0);

      const sa = st.searchArea;
      if (sa && sa.r > 0) mm._drawSearch(g, s * sa.x + e, s * sa.z + f, sa.r * s, t);
      if (this._preview) this._drawPreview(g, this._preview, s, e, f, t);
      if (st.route && st.route.length > 1) mm._drawRoute(g, st.route, s, 0, 0, s, e, f, clamp(0.85 + s * 0.35, 1, 1.5), t);

      // Icons, least important first so the important ones sit on top.
      const hits = this._hits;
      hits.length = 0;
      const PX = s * (st.x || 0) + e;
      const PY = s * (st.z || 0) + f;
      hits.push({ X: PX, Y: PY, r: 12, kind: 'you' });
      const items = this._layoutBlips(st.blips || [], s, e, f);
      for (const it of items) {
        mm._drawBlip(g, d, spr, it.bl, it.X, it.Y, it.members ? 1.12 : 1.05, it.i, Math.PI, s, it.edge);
        if (it.members) this._countBadge(g, it.X + 9, it.Y - 9, it.members.length, FONT);
        if (it.edge) {
          const ang = Math.atan2(s * it.bl.z + f - it.Y, s * it.bl.x + e - it.X);
          this._chevron(g, it.X + Math.cos(ang) * 15, it.Y + Math.sin(ang) * 15, ang);
          mm._drawPill(g, K.formatDistance(Math.hypot(it.bl.x - (st.x || 0), it.bl.z - (st.z || 0))), it.X - Math.cos(ang) * 26, it.Y - Math.sin(ang) * 21);
        }
        hits.push({ X: it.X, Y: it.Y, r: it.members ? 17 : 13, kind: it.members ? 'cluster' : 'blip', ref: it.members || it.bl });
      }
      if (this.show.pins) {
        for (const p of this.pins) {
          const X = s * p.x + e;
          const Y = s * p.z + f;
          if (X < -30 || X > this._fw + 30 || Y < -40 || Y > this._fh + 30) continue;
          this._drawPin(g, X, Y, PIN_COLOURS[p.c]);
          hits.push({ X: X + 4, Y: Y - 14, r: 14, kind: 'pin', ref: p });
        }
      }

      // What the pointer (or the reticle) is over.
      const hp = this._reticle ? { x: this._ox, y: this._oy } : this._mouse;
      const h = hp && !this._drag ? this._hitAt(hp.x, hp.y, this._reticle ? 30 : 0) : null;
      this.hover = h;
      this.root.classList.toggle('is-pointing', !!h && !this._reticle);

      // Labels, most important first, only where they fit.
      this._boxes.length = this._staticBoxes;
      g.font = '600 11px ' + FONT;
      K.setSpacing(g, 0.5);
      const hoverRef = h ? h.ref : null;
      for (let k = items.length - 1; k >= 0; k--) {
        const it = items[k];
        if (it.edge || it.members) continue;
        const bl = it.bl;
        if (!bl.label) continue;
        const T = TYPES[bl.type] || TYPES.mission;
        if (s < T.labelAt && hoverRef !== bl) continue;
        this._label(g, bl.label, it.X, it.Y, bl.type === 'objective' || hoverRef === bl);
      }
      if (this.show.pins && s >= TYPES.pin.labelAt) {
        for (const p of this.pins) this._label(g, p.n, s * p.x + e + 6, s * p.z + f - 16, false);
      }
      K.setSpacing(g, 0);

      // The player: a sunset ping, the arrow and a YOU tag.
      const ping = (t * 0.7) % 1;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255, 110, 140, ' + (0.7 * (1 - ping)).toFixed(3) + ')';
      g.beginPath();
      g.arc(PX, PY, 7 + ping * 22, 0, TAU);
      g.stroke();
      const hd = typeof st.heading === 'number' ? st.heading : st.camYaw || 0;
      mm._drawRot(g, d, spr.player, PX, PY, Math.PI - hd, 1.3);
      this._youTag(g, PX, PY + 21, FONT);

      // Hover, the list's hover and the selection.
      if (h && h.kind !== 'you') this._ring(g, h.X, h.Y, h.r + 3, 'rgba(255, 255, 255, 0.9)', 1.6);
      const rh = this._rowHover;
      if (rh) this._ring(g, s * rh.x + e, s * rh.z + f, 16 + 2 * Math.sin(t * 6), 'rgba(255, 207, 138, 0.95)', 2);
      const sel = this.sel;
      if (sel && sel.type !== 'you') {
        const X = s * sel.x + e;
        const Y = s * sel.z + f;
        this._ring(g, X, Y, 15 + 3 * Math.sin(t * 4), 'rgba(255, 79, 216, 0.95)', 2.2);
      }
      if (this._reticle) this._drawReticle(g, this._ox, this._oy, !!h);
      this._updateTip(h, hp);
    }

    _label(g, text, X, Y, force) {
      const w = this._measure(g, text);
      const right = !this._collides(X + 10, Y - 8, X + 14 + w, Y + 8);
      const left = !right && !this._collides(X - 14 - w, Y - 8, X - 10, Y + 8);
      if (!right && !left && !force) return;
      const lx = right || !left ? X + 12 : X - 12 - w;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      this._haloText(g, text, lx, Y, 'rgba(6, 9, 20, 0.9)', '#ffffff', 3.5);
      this._claim(lx - 2, Y - 8, lx + w + 2, Y + 8);
    }

    _youTag(g, X, Y, FONT) {
      g.font = '800 9px ' + FONT;
      K.setSpacing(g, 1.6);
      const w = 30;
      K.roundRectPath(g, X - w / 2, Y - 7, w, 14, 7);
      g.fillStyle = K.sunsetGradient(g, X - w / 2, 0, X + w / 2, 0);
      g.fill();
      g.fillStyle = '#10121e';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('YOU', X + 0.8, Y + 0.5);
      K.setSpacing(g, 0);
    }

    _countBadge(g, X, Y, n, FONT) {
      const text = n > 99 ? '99+' : String(n);
      g.font = '800 10px ' + FONT;
      const w = Math.max(15, g.measureText(text).width + 8);
      K.roundRectPath(g, X - w / 2, Y - 7.5, w, 15, 7.5);
      g.fillStyle = '#ff4fd8';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(6, 9, 20, 0.95)';
      g.stroke();
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, X, Y + 0.5);
    }

    /** A map pin: a little flag in its colour, its pole on the spot. */
    _drawPin(g, X, Y, col) {
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.beginPath();
      g.ellipse(X, Y, 4.5, 1.8, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(X, Y);
      g.lineTo(X, Y - 21);
      g.lineCap = 'round';
      g.lineWidth = 3.6;
      g.strokeStyle = 'rgba(6, 9, 20, 0.92)';
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(X, Y - 21);
      g.lineTo(X + 13, Y - 16.5);
      g.lineTo(X, Y - 11.5);
      g.closePath();
      g.lineJoin = 'round';
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(6, 9, 20, 0.92)';
      g.stroke();
      g.fillStyle = col;
      g.fill();
    }

    _ring(g, X, Y, r, col, lw) {
      g.lineWidth = lw + 2;
      g.strokeStyle = 'rgba(6, 9, 20, 0.6)';
      g.beginPath();
      g.arc(X, Y, r, 0, TAU);
      g.stroke();
      g.lineWidth = lw;
      g.strokeStyle = col;
      g.stroke();
    }

    _drawReticle(g, X, Y, on) {
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(6, 9, 20, 0.7)';
      const draw = () => {
        g.beginPath();
        g.arc(X, Y, 11, 0, TAU);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.moveTo(X + dx * 15, Y + dy * 15);
          g.lineTo(X + dx * 22, Y + dy * 22);
        }
        g.stroke();
      };
      draw();
      g.lineWidth = 1.6;
      g.strokeStyle = on ? '#ffcf8a' : 'rgba(255, 255, 255, 0.92)';
      draw();
    }

    _chevron(g, X, Y, ang) {
      const d = this._fd;
      const cs = Math.cos(ang) * d;
      const sn = Math.sin(ang) * d;
      g.setTransform(cs, sn, -sn, cs, X * d, Y * d);
      g.beginPath();
      g.moveTo(5, 0);
      g.lineTo(-3, -4.6);
      g.lineTo(-1.2, 0);
      g.lineTo(-3, 4.6);
      g.closePath();
      g.lineJoin = 'round';
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(6, 9, 20, 0.92)';
      g.stroke();
      g.fillStyle = '#ff7a59';
      g.fill();
      g.setTransform(d, 0, 0, d, 0, 0);
    }

    /** The selected place's way there: a quiet dashed line. */
    _drawPreview(g, r, s, e, f, t) {
      g.beginPath();
      for (let i = 0; i < r.length; i++) {
        const X = s * r[i][0] + e;
        const Y = s * r[i][1] + f;
        if (i === 0) g.moveTo(X, Y);
        else g.lineTo(X, Y);
      }
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(6, 9, 20, 0.45)';
      g.stroke();
      g.setLineDash([7, 7]);
      g.lineDashOffset = -t * 18;
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(255, 207, 138, 0.85)';
      g.stroke();
      g.setLineDash([]);
      g.lineCap = 'butt';
    }

    /** The nearest thing under a screen point (within its radius, or `rad`). */
    _hitAt(x, y, rad) {
      let best = null;
      let bestD = Infinity;
      const scan = (list) => {
        for (let i = 0; i < list.length; i++) {
          const h = list[i];
          const dd = Math.hypot(h.X - x, h.Y - y);
          if (dd <= (rad || h.r) && dd <= bestD) {
            bestD = dd;
            best = h;
          }
        }
      };
      scan(this._staticHits);
      scan(this._hits);
      return best;
    }

    /** The tooltip by the pointer (or the reticle): the name, what it is and how far. */
    _updateTip(h, hp) {
      const tip = this._tip;
      if (!h || !hp) {
        if (this._tipKey) {
          this._tipKey = null;
          tip.classList.remove('is-on');
        }
        return;
      }
      const st = this.state || {};
      let name;
      let sub;
      if (h.kind === 'cluster') {
        const T = TYPES[h.ref[0].type] || TYPES.mission;
        name = h.ref.length + ' × ' + (CATS.find((c) => c.id === T.cat) || { label: T.name }).label.toLowerCase();
        sub = 'Click to zoom in';
      } else {
        const t = this._targetOf(h);
        if (!t) return;
        const T = TYPES[t.type] || TYPES.place;
        name = t.name;
        sub = t.type === 'you' ? 'You are here' : T.name + ' · ' + K.formatDistance(Math.hypot(t.x - (st.x || 0), t.z - (st.z || 0))) + (t.type === 'waypoint' ? ' · click to clear' : '');
      }
      const key = name + '|' + sub;
      if (key !== this._tipKey) {
        this._tipKey = key;
        tip.textContent = '';
        tip.append(el('div', 'vh-map-tip-name', name), el('div', 'vh-map-tip-sub', sub));
        tip.classList.add('is-on');
        this._tipW = tip.offsetWidth;
        this._tipH = tip.offsetHeight;
      }
      let x = (this._reticle ? h.X : hp.x) + 18;
      let y = (this._reticle ? h.Y : hp.y) + 16;
      if (x + this._tipW > this._fw - 8) x -= this._tipW + 34;
      if (y + this._tipH > this._fh - 8) y -= this._tipH + 30;
      tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }

    /** The whole map in miniature, with the view marked. */
    _drawOverview() {
      const c = this._ovc;
      const box = this._ovEl;
      if (!box.offsetParent) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d');
      const Wd = this.mm._ext.world;
      const k = Math.min(w / (Wd.maxX - Wd.minX), h / (Wd.maxZ - Wd.minZ));
      const x0 = (w - (Wd.maxX - Wd.minX) * k) / 2;
      const y0 = (h - (Wd.maxZ - Wd.minZ) * k) / 2;
      this._ovMap = { k, x0, y0, minX: Wd.minX, minZ: Wd.minZ };
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = K.PAL.outsideLand;
      g.fillRect(0, 0, w, h);
      const lvl = this.mm._base[1];
      const E = lvl.ext;
      const ls = lvl.s;
      g.imageSmoothingEnabled = true;
      g.drawImage(lvl.canvas, (Wd.minX - E.minX) * ls, (Wd.minZ - E.minZ) * ls, (Wd.maxX - Wd.minX) * ls, (Wd.maxZ - Wd.minZ) * ls, x0, y0, (Wd.maxX - Wd.minX) * k, (Wd.maxZ - Wd.minZ) * k);
      const X = (x) => x0 + (x - Wd.minX) * k;
      const Y = (z) => y0 + (z - Wd.minZ) * k;
      // The view.
      const v = this.v;
      const a = this._area;
      const vx0 = v.cx + (a.x0 - this._ox) / v.s;
      const vx1 = v.cx + (a.x1 - this._ox) / v.s;
      const vz0 = v.cz + (a.y0 - this._oy) / v.s;
      const vz1 = v.cz + (a.y1 - this._oy) / v.s;
      g.fillStyle = 'rgba(255, 255, 255, 0.08)';
      g.fillRect(X(vx0), Y(vz0), (vx1 - vx0) * k, (vz1 - vz0) * k);
      g.lineWidth = 1.5;
      g.strokeStyle = K.sunsetGradient(g, X(vx0), 0, X(vx1), 0);
      g.strokeRect(X(vx0), Y(vz0), (vx1 - vx0) * k, (vz1 - vz0) * k);
      const st = this.state || {};
      const dot = (x, z, col, r) => {
        g.beginPath();
        g.arc(X(x), Y(z), r, 0, TAU);
        g.fillStyle = col;
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(6, 9, 20, 0.9)';
        g.stroke();
      };
      if (st.waypoint) dot(st.waypoint.x, st.waypoint.z, '#ff4fd8', 3);
      dot(st.x || 0, st.z || 0, '#ffb347', 3.2);
    }

    destroy() {
      this.closeFull();
      clearTimeout(this._freeTimer);
      clearTimeout(this._toastTimer);
      this.root.remove();
    }
  }

  VH.MapView = MapView;
})();
