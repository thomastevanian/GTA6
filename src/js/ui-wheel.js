/*
 * ui-wheel.js — the radial weapon wheel (hold Tab, or LB on a gamepad).
 *
 *   const wheel = new VH.WeaponWheel(parentElement)
 *   wheel.open(state)      state = { slots: [{ slot, weapons: [{ id, name, ammo, mag, owned }], current }],
 *                                    selected: slotId, gamepad?: bool, key?: 'Tab' }
 *                          Calling open() again while open refreshes the contents
 *                          without moving the highlight.
 *   wheel.move(dx, dy)     mouse deltas in pixels (pointer lock friendly)
 *   wheel.stick(x, y)      a gamepad stick, -1..1
 *   wheel.cycle(dir)       next / previous weapon inside the highlighted slot
 *   wheel.close()          → { slot, weaponId } for an owned weapon, or null
 *   wheel.isOpen
 *   wheel.onChange         optional callback({ slot, weaponId, reason: 'slot' | 'cycle' })
 *   VH.WeaponWheel.icon(id)  SVG markup for a slot id or a weapon id
 *
 * The wheel never takes focus and never listens to the DOM: the game feeds
 * it input, so it works under pointer lock. Highlight changes play the
 * audio engine's wheelTick() (through VH.game.audio when present) and emit
 * 'wheel:change' on VH.events.
 */
(function () {
  'use strict';

  const VH = window.VH;

  const DEFAULT_SLOTS = ['unarmed', 'melee', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'thrown'];
  const SLOT_NAMES = {
    unarmed: 'Unarmed', melee: 'Melee', pistol: 'Pistol', smg: 'SMG',
    shotgun: 'Shotgun', rifle: 'Rifle', sniper: 'Sniper', thrown: 'Thrown',
  };
  const DEADZONE = 22; // px of mouse travel before the highlight follows
  const MAX_TRAVEL = 96; // the virtual cursor is clamped to this radius
  const STICK_DEADZONE = 0.4;

  // Geometry in SVG units (viewBox -250..250).
  const R_OUT = 234;
  const R_IN = 112;
  const R_ICON = 173;
  const GAP = 5;

  // ------------------------------------------------------------------ icons
  // All icons share a 96 x 48 box, barrel to the right, filled with currentColor.
  const f = (n) => +n.toFixed(2);
  const rect = (x, y, w, h, r) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 0) + '"/>';
  const poly = (pts) => '<polygon points="' + pts + '"/>';
  const path = (d, evenodd) => '<path d="' + d + '"' + (evenodd ? ' fill-rule="evenodd"' : '') + '/>';
  const line = (d, w) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w || 2.2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const ring = (cx, cy, r, w) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="currentColor" stroke-width="' + (w || 1.8) + '"/>';
  const dot = (cx, cy, r) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';

  /** Pineapple segments: grid cells pulled onto an ellipse, with grooves between them. */
  function pineapple(cx, cy, rx, ry) {
    const cols = [cx - rx, cx - rx * 0.34, cx + rx * 0.34, cx + rx];
    const rows = [cy - ry, cy - ry * 0.5, cy, cy + ry * 0.5, cy + ry];
    const g = 0.75;
    let out = '';
    const clampToEllipse = (x, y) => {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = Math.hypot(dx, dy);
      return d > 1 ? [cx + (dx / d) * rx, cy + (dy / d) * ry] : [x, y];
    };
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const x0 = cols[i] + g, x1 = cols[i + 1] - g, y0 = rows[j] + g, y1 = rows[j + 1] - g;
        const pts = [];
        const edge = (ax, ay, bx, by) => {
          for (let s = 0; s < 8; s++) {
            const t = s / 8;
            pts.push(clampToEllipse(ax + (bx - ax) * t, ay + (by - ay) * t));
          }
        };
        edge(x0, y0, x1, y0);
        edge(x1, y0, x1, y1);
        edge(x1, y1, x0, y1);
        edge(x0, y1, x0, y0);
        out += poly(pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' '));
      }
    }
    return out;
  }

  const ICONS = {
    fist: [
      // Four knuckles, the back of the hand with the thumb line, and a cuff.
      rect(29, 13, 8.4, 15, 3.8), rect(38.3, 10.5, 8.4, 17, 3.8), rect(47.6, 10.5, 8.4, 17, 3.8), rect(56.9, 12.5, 8.4, 15, 3.8),
      path('M29 26 H65.3 V35 Q65.3 41.5 58.5 41.5 H36 Q29 41.5 29 35 Z M33 31.2 H55 Q57 31.2 57 32.2 Q57 33.2 55 33.2 H33 Z', true),
      rect(35.5, 43, 24, 4.5, 1.2),
    ],
    bat: [
      '<g transform="rotate(-14 48 24)">',
      dot(8.5, 24, 3.3),
      path('M10.5 22.7 L40 22.3 C57 21.1 66 19 83.5 18.4 Q90.5 18.4 91 24 Q90.5 29.6 83.5 29.6 C66 29 57 26.9 40 25.7 L10.5 25.3 Z M17 22.4 H18.2 V25.6 H17 Z M23 22.4 H24.2 V25.6 H23 Z M29 22.3 H30.2 V25.7 H29 Z', true),
      '</g>',
    ],
    knife: [
      path('M9 20.5 H32 V28.6 Q29.6 30.4 27 28.8 Q24.4 30.4 21.8 28.8 Q19.2 30.4 16.6 28.8 Q14 30.4 11.5 28.8 H9 Q5.5 28.6 5.5 24.5 Q5.5 20.5 9 20.5 Z'),
      rect(32, 16.5, 3.4, 16, 1.3),
      path('M35.4 20.6 H69 L78.5 22.6 L91 24.8 Q82.5 29.8 69 29.3 L35.4 28.6 Z M40 23.6 H63.5 V24.8 H40 Z', true),
    ],
    pistol: [
      rect(23, 10, 54, 9.5, 1.6), rect(72, 7.6, 2.8, 3, 0.6), rect(24.5, 8, 4.6, 2.6, 0.6),
      rect(35, 19, 37, 4.8, 1),
      poly('26,19 39,19 37.4,26 34.8,40.6 33.4,42.6 21.8,42.6 20.6,41 24,27.5 23.6,21.5'),
      line('M38.6 23.8 L39 29.4 Q39.4 31.6 41.6 31.6 L50 31.6 Q52.2 31.6 52.2 29.4 L52.2 23.8'),
      line('M43.6 24.2 Q45.6 26.6 44.2 29.2', 1.7),
    ],
    revolver: [
      rect(40, 11.6, 45, 6.6, 1.2), rect(40, 17.6, 42, 5, 1.6), poly('78,11.8 83.6,11.8 83.6,8.6 80.6,8.6'),
      poly('21.5,11 41,11 41,24.5 35,26.5 27.5,26.5 21.5,21'),
      rect(26, 9.2, 14.5, 16.4, 3.4),
      poly('22.6,12.4 17.6,6.6 13.8,7.2 19.6,15.6'),
      path('M22.4 19.5 C19.4 26.5 15.4 33.5 14.2 41.2 Q13.8 45 17.6 45 L25 45 Q28.6 45 28.6 41.5 C28.6 35 29.5 29 32.5 24.2 Z'),
      line('M31.2 25 Q30.4 33.4 37 33.4 Q42.4 33.4 42.4 25'),
      line('M35.4 25.4 Q37.4 27.8 36 30.4', 1.7),
    ],
    smg: [
      rect(26, 12, 46, 10.5, 1.6), rect(31.5, 9.4, 35, 3, 0.6), rect(32.5, 6.8, 3.2, 3, 0.6), rect(62.5, 6.8, 2.8, 3, 0.6),
      rect(68, 13, 10.5, 9.5, 1.6), rect(78, 15.4, 6.5, 4.4, 0.6), rect(84, 14, 6, 7, 1.2),
      poly('33.8,22 44.2,22 43.2,31.5 35,31.5'), poly('35.2,32.6 42.8,32.6 41.8,45.4 34.4,45.4'),
      line('M44.4 22.4 L44.8 27.4 Q45.2 29.4 47.2 29.4 L54 29.4 Q56 29.4 56 27.4 L56 22.4'),
      poly('61.5,22 68,22 66.2,27.6 63.2,27.6'),
      line('M25 14.2 H12.5 M25 20.4 H12.5', 2),
      rect(8.6, 11, 4.6, 13, 1.8),
    ],
    shotgun: [
      rect(40, 14, 52, 3.8, 0.9), rect(40, 18.6, 44, 3.2, 1.2), dot(90, 13, 1.1),
      path('M52 16.6 H72 Q74.6 16.6 74.6 19.2 V21 Q74.6 23.6 72 23.6 H52 Q49.4 23.6 49.4 21 V19.2 Q49.4 16.6 52 16.6 Z M55 17.8 H56.2 V22.4 H55 Z M59.2 17.8 H60.4 V22.4 H59.2 Z M63.4 17.8 H64.6 V22.4 H63.4 Z M67.6 17.8 H68.8 V22.4 H67.6 Z', true),
      rect(29.6, 12, 12.4, 11.4, 1.8),
      poly('31,12.6 6.2,15 4.4,16.2 4.4,29.2 6,30.4 16.5,26.4 25.2,22.6 24,27.6 27.6,28.2 31,23.2'),
      line('M33 23.4 Q33 28 36 28 L38.6 28 Q41 28 41 23.4', 2),
    ],
    rifle: [
      rect(30, 10.6, 46, 2.8, 0.6), rect(30, 12.6, 24.5, 7.8, 1.2),
      path('M56.6 12 H75.4 Q78 12 78 14.6 V18.6 Q78 21.2 75.4 21.2 H56.6 Q54 21.2 54 18.6 V14.6 Q54 12 56.6 12 Z M58 15.8 H63 V17.4 H58 Z M65.4 15.8 H70.4 V17.4 H65.4 Z', true),
      rect(78, 15.2, 8, 2.8, 0.6), rect(85.4, 13.8, 7, 5.6, 1.2),
      rect(31, 19.8, 20.5, 5, 1),
      path('M38 4.6 H46.6 Q48 4.6 48 6 V10.6 H36.6 V6 Q36.6 4.6 38 4.6 Z M39.2 6.2 V9.2 H45.4 V6.2 Z', true),
      path('M44.2 24.6 L50.6 24.6 Q51.2 33.2 55.2 40 L48.6 42.2 Q45 34.4 44.2 24.6 Z'),
      poly('33,24.6 39.4,24.6 37.4,35.4 31.4,35.4'),
      line('M39.6 24.8 L40 27.8 L44 27.8', 1.8),
      rect(18, 14, 13, 4.4, 1),
      poly('22.4,12 8.4,12.6 6.8,13.6 6.8,26 8.4,27 11.4,27 22.4,20.4'),
      rect(4.6, 12.2, 2.8, 15.4, 1),
    ],
    sniper: [
      poly('44,16.8 90,17.8 90,19.8 44,21.2'), rect(88.4, 16.3, 6, 5.2, 1.2),
      rect(34, 15.6, 14.6, 6.4, 2.6),
      rect(30, 8, 27, 4.2, 2), poly('56,8.4 62,5.4 66.4,5.4 66.4,14.8 62,14.8 56,11.8'),
      poly('30.6,8.3 25,6.6 21.6,6.6 21.6,13.6 25,13.6 30.6,11.9'), rect(40.4, 4.4, 5, 4.2, 0.8),
      rect(34.2, 12, 3, 4, 0.4), rect(50, 12, 3, 4.6, 0.4),
      path('M50 19 L70.5 19.6 L70.5 23.4 L48.4 24.6 L44.4 25 L40.4 33.6 L33.6 33.6 L34.6 26.2 L22 28.2 L8.4 33.2 L5 33.2 L3.8 32 L3.8 17.6 L8 16 L30 16 L34 19 Z M34.2 20.4 L22.4 20.8 Q20.2 24 22.4 25.8 L33.2 24.2 Z', true),
      line('M40.4 21.2 L37.4 25.4', 1.8), dot(36.8, 26.2, 1.9),
      line('M60 25 L76 25', 1.4),
    ],
    grenade: [
      pineapple(47, 29, 12.2, 14.8),
      rect(43, 7.6, 8.4, 6.4, 1.2),
      path('M51.2 8.2 L57.6 9.4 Q62.4 12.6 62.2 23 L59.8 23 Q59.8 14.2 56.4 11.8 L51.2 11 Z'),
      ring(38.8, 10.4, 3.9, 1.7), line('M42.6 10.6 L44 10.8', 1.4),
    ],
    molotov: [
      path('M40.4 44 L40.4 27 Q40.4 21.6 45.6 17.8 L45.6 10 L50.8 10 L50.8 17.8 Q56 21.6 56 27 L56 44 Q56 46.2 53.8 46.2 L42.6 46.2 Q40.4 46.2 40.4 44 Z M42 30.6 H54.4 V32 H42 Z M42 34 H54.4 V40.4 H42 Z', true),
      path('M46 10 Q43.6 6 46.8 3.8 Q50.2 1.8 52 5 Q53.6 7.6 51 10 Z'),
      path('M50.4 9 Q55.4 10.6 56 17 L54.2 17.4 Q53.4 12.2 49.6 10.8 Z'),
    ],
  };

  const SLOT_ICON = { unarmed: 'fist', melee: 'bat', pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper', thrown: 'grenade' };
  const WEAPON_ICON = { fists: 'fist', bat: 'bat', knife: 'knife', pistol: 'pistol', revolver: 'revolver', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper', grenade: 'grenade', molotov: 'molotov' };
  const svgCache = {};

  /** SVG markup for a slot id ('pistol', 'thrown' ...) or a weapon id ('knife', 'molotov' ...). */
  function icon(id) {
    const key = WEAPON_ICON[id] || SLOT_ICON[id] || (ICONS[id] ? id : 'fist');
    if (!svgCache[key]) {
      svgCache[key] = '<svg class="vh-wicon vh-wicon-' + key + '" viewBox="0 0 96 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
        '<g fill="currentColor">' + ICONS[key].join('') + '</g></svg>';
    }
    return svgCache[key];
  }

  // -------------------------------------------------------------- geometry
  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return f(Math.sin(a) * r) + ' ' + f(-Math.cos(a) * r);
  };

  /** An annular sector centred on `deg` (clockwise from the top), with constant-width gaps. */
  function sector(deg, rIn, rOut, half, gap) {
    const dOut = (Math.asin(gap / 2 / rOut) * 180) / Math.PI;
    const dIn = (Math.asin(gap / 2 / rIn) * 180) / Math.PI;
    const a0 = deg - half, a1 = deg + half;
    return 'M' + pt(rOut, a0 + dOut) + ' A' + rOut + ' ' + rOut + ' 0 0 1 ' + pt(rOut, a1 - dOut) +
      ' L' + pt(rIn, a1 - dIn) + ' A' + rIn + ' ' + rIn + ' 0 0 0 ' + pt(rIn, a0 + dIn) + ' Z';
  }

  function arc(deg, r, half) {
    return 'M' + pt(r, deg - half) + ' A' + r + ' ' + r + ' 0 0 1 ' + pt(r, deg + half);
  }

  let uid = 0;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ----------------------------------------------------------------- wheel
  class WeaponWheel {
    constructor(parent) {
      this.parent = parent || document.body;
      this.isOpen = false;
      this.onChange = null;
      this.slotIds = VH.Data && VH.Data.weaponSlots ? VH.Data.weaponSlots.map((s) => s.id || s) : DEFAULT_SLOTS.slice();
      this.slots = this.slotIds.map((id) => ({ id, weapons: [], current: 0 }));
      this.sel = 0;
      this._vx = 0;
      this._vy = 0;
      this._hlDeg = 0;
      this._build();
    }

    _build() {
      const id = 'vhw' + ++uid;
      this.root = el('div', 'vhw');
      this.root.setAttribute('aria-hidden', 'true');
      this.root.append(el('div', 'vhw-backdrop'));
      const stack = el('div', 'vhw-stack');
      const ringEl = (this.ringEl = el('div', 'vhw-ring'));
      ringEl.append(el('div', 'vhw-glass'));

      const n = this.slotIds.length;
      const step = 360 / n;
      let svg = '<svg class="vhw-svg" viewBox="-250 -250 500 500" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
        '<defs>' +
        '<linearGradient id="' + id + '-hl" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="#ffb347"/><stop offset="0.45" stop-color="#ff7a59"/><stop offset="1" stop-color="#ff4f8b"/></linearGradient>' +
        '<linearGradient id="' + id + '-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff5f9a"/></linearGradient>' +
        '<radialGradient id="' + id + '-sheen" cx="0" cy="0" r="' + R_OUT + '" gradientUnits="userSpaceOnUse"><stop offset="' + f(R_IN / R_OUT) + '" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.07"/></radialGradient>' +
        '</defs>' +
        '<circle class="vhw-track" r="' + (R_OUT + 7) + '"/>';
      for (let i = 0; i < n; i++) {
        svg += '<path class="vhw-seg" data-i="' + i + '" d="' + sector(i * step, R_IN, R_OUT, step / 2, GAP) + '" fill="url(#' + id + '-sheen)"/>';
      }
      svg += '<g class="vhw-hl">' +
        '<path class="vhw-hl-fill" d="' + sector(0, R_IN, R_OUT, step / 2, GAP) + '" fill="url(#' + id + '-hl)"/>' +
        '<path class="vhw-hl-rim" d="' + arc(0, R_OUT + 8, step / 2 - 2.5) + '" stroke="url(#' + id + '-rim)"/>' +
        '</g>' +
        '<circle class="vhw-inner" r="' + (R_IN - 5) + '"/>' +
        '<g class="vhw-pointer"><path d="M-7 ' + -(R_IN - 9) + ' L0 ' + -(R_IN + 1) + ' L7 ' + -(R_IN - 9) + ' Z"/></g>' +
        '</svg>';
      ringEl.insertAdjacentHTML('beforeend', svg);
      this.svg = ringEl.querySelector('svg');
      this.segEls = Array.from(this.svg.querySelectorAll('.vhw-seg'));
      this.hlEl = this.svg.querySelector('.vhw-hl');
      this.pointerEl = this.svg.querySelector('.vhw-pointer');

      // Icons, ammo and pips around the ring.
      this.itemEls = [];
      for (let i = 0; i < n; i++) {
        const a = ((i * step) * Math.PI) / 180;
        const item = el('div', 'vhw-item');
        item.style.left = f(50 + (Math.sin(a) * R_ICON) / 5) + '%';
        item.style.top = f(50 - (Math.cos(a) * R_ICON) / 5) + '%';
        const ic = el('div', 'vhw-icon');
        const count = el('div', 'vhw-count');
        const pips = el('div', 'vhw-dots');
        item.append(ic, count, pips);
        ringEl.append(item);
        this.itemEls.push({ item, ic, count, pips, iconKey: null });
      }

      // Centre readout.
      const c = (this.centre = el('div', 'vhw-center'));
      this.cSlot = el('div', 'vhw-slot');
      this.cName = el('div', 'vhw-name');
      this.cAmmo = el('div', 'vhw-ammo');
      this.cCycle = el('div', 'vhw-cycle');
      c.append(this.cSlot, this.cName, this.cAmmo, this.cCycle);
      ringEl.append(c);

      this.hint = el('div', 'vhw-hint');
      stack.append(ringEl, this.hint);
      this.root.append(stack);
      this.parent.appendChild(this.root);
    }

    // ------------------------------------------------------------- state
    _ingest(state) {
      const bySlot = {};
      for (const s of (state && state.slots) || []) bySlot[s.slot] = s;
      this.slots = this.slotIds.map((id) => {
        const s = bySlot[id];
        const weapons = s && Array.isArray(s.weapons) ? s.weapons.map((w) => Object.assign({ owned: true }, w)) : [];
        if (id === 'unarmed' && !weapons.some((w) => w.owned)) weapons.unshift({ id: 'fists', name: 'Fists', ammo: 0, mag: 0, owned: true });
        let current = s && Number.isInteger(s.current) ? s.current : 0;
        if (current < 0 || current >= weapons.length) current = 0;
        if (weapons.length && !weapons[current].owned) {
          const k = weapons.findIndex((w) => w.owned);
          if (k >= 0) current = k;
        }
        return { id, weapons, current };
      });
      this.gamepad = !!(state && state.gamepad);
      this.keyLabel = (state && state.key) || this._bindingLabel();
    }

    _bindingLabel() {
      try {
        const inp = VH.game && VH.game.input;
        if (inp && inp.labelFor) return inp.labelFor('weaponWheel');
      } catch (err) {
        // Fall through to the default.
      }
      return 'Tab';
    }

    _owned(slot) {
      return slot.weapons.filter((w) => w.owned);
    }

    _kind(id) {
      const d = VH.Data && VH.Data.weaponsById ? VH.Data.weaponsById[id] : null;
      return d ? d.kind : id === 'fists' ? 'melee' : 'hitscan';
    }

    // ---------------------------------------------------------- open / close
    open(state) {
      this._ingest(state);
      if (!this.isOpen) {
        this.isOpen = true;
        this._vx = 0;
        this._vy = 0;
        const i = this.slotIds.indexOf(state && state.selected);
        this._setHighlight(i >= 0 ? i : 0, true);
        this._pointer(0, 0);
        this.root.classList.add('visible');
      }
      this._render();
    }

    close() {
      if (!this.isOpen) return null;
      this.isOpen = false;
      this.root.classList.remove('visible');
      const slot = this.slots[this.sel];
      const w = slot && slot.weapons[slot.current];
      return w && w.owned ? { slot: slot.id, weaponId: w.id } : null;
    }

    // ----------------------------------------------------------------- input
    move(dx, dy) {
      if (!this.isOpen) return;
      this._vx += dx || 0;
      this._vy += dy || 0;
      const len = Math.hypot(this._vx, this._vy);
      if (len > MAX_TRAVEL) {
        this._vx *= MAX_TRAVEL / len;
        this._vy *= MAX_TRAVEL / len;
      }
      this._aim(this._vx, this._vy, Math.min(len, MAX_TRAVEL) >= DEADZONE);
    }

    stick(x, y) {
      if (!this.isOpen) return;
      const len = Math.hypot(x, y);
      if (len < STICK_DEADZONE) return;
      this._vx = (x / len) * MAX_TRAVEL;
      this._vy = (y / len) * MAX_TRAVEL;
      this._aim(x, y, true);
    }

    cycle(dir) {
      if (!this.isOpen || !dir) return;
      const slot = this.slots[this.sel];
      const owned = slot.weapons.map((w, i) => (w.owned ? i : -1)).filter((i) => i >= 0);
      if (owned.length < 2) return;
      const at = Math.max(0, owned.indexOf(slot.current));
      slot.current = owned[(at + (dir > 0 ? 1 : -1) + owned.length) % owned.length];
      this._render();
      this.centre.classList.remove('bump');
      void this.centre.offsetWidth; // restart the animation
      this.centre.classList.add('bump');
      this._changed('cycle');
    }

    _aim(x, y, active) {
      this._pointer(x, y);
      if (!active) return;
      const n = this.slotIds.length;
      const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      const i = Math.round(deg / (360 / n)) % n;
      if (i !== this.sel) {
        this._setHighlight(i);
        this._render();
        this._changed('slot');
      }
    }

    _pointer(x, y) {
      const len = Math.hypot(x, y);
      const deg = (Math.atan2(x, -y) * 180) / Math.PI;
      this.pointerEl.style.transform = 'rotate(' + f(deg) + 'deg)';
      this.pointerEl.style.opacity = String(f(Math.min(1, len / DEADZONE) * 0.9));
    }

    _setHighlight(i, snap) {
      const step = 360 / this.slotIds.length;
      const target = i * step;
      const cur = ((this._hlDeg % 360) + 360) % 360;
      const delta = ((target - cur + 540) % 360) - 180;
      this._hlDeg = snap ? target : this._hlDeg + delta;
      this.sel = i;
      if (snap) {
        this.hlEl.style.transition = 'none';
        this.hlEl.style.transform = 'rotate(' + f(this._hlDeg) + 'deg)';
        void this.hlEl.getBoundingClientRect();
        this.hlEl.style.transition = '';
      } else {
        this.hlEl.style.transform = 'rotate(' + f(this._hlDeg) + 'deg)';
      }
    }

    _changed(reason) {
      const slot = this.slots[this.sel];
      const w = slot.weapons[slot.current];
      const info = { slot: slot.id, weaponId: w && w.owned ? w.id : null, reason };
      try {
        const audio = VH.game && VH.game.audio;
        if (audio && audio.wheelTick) audio.wheelTick();
      } catch (err) {
        // Sound is optional.
      }
      if (this.onChange) this.onChange(info);
      if (VH.events) VH.events.emit('wheel:change', info);
    }

    // ---------------------------------------------------------------- render
    _ammoText(w) {
      const kind = this._kind(w.id);
      if (kind === 'melee') return '';
      if (kind === 'thrown') return '×' + ((w.mag || 0) + (w.ammo || 0));
      return String((w.mag || 0) + (w.ammo || 0));
    }

    _render() {
      const n = this.slotIds.length;
      for (let i = 0; i < n; i++) {
        const slot = this.slots[i];
        const owned = this._owned(slot);
        const e = this.itemEls[i];
        const w = slot.weapons[slot.current];
        const empty = owned.length === 0;
        const key = w && w.owned ? w.id : slot.id;
        if (e.iconKey !== key) {
          e.ic.innerHTML = icon(key);
          e.iconKey = key;
        }
        e.count.textContent = w && w.owned ? this._ammoText(w) : '';
        e.item.classList.toggle('empty', empty);
        e.item.classList.toggle('on', i === this.sel);
        e.item.classList.toggle('low', !!(w && w.owned && this._kind(w.id) !== 'melee' && (w.mag || 0) + (w.ammo || 0) === 0));
        this.segEls[i].classList.toggle('empty', empty);
        this.segEls[i].classList.toggle('on', i === this.sel);
        let dots = '';
        if (owned.length > 1) for (const o of owned) dots += '<i' + (o === w ? ' class="on"' : '') + '></i>';
        if (e.pips.innerHTML !== dots) e.pips.innerHTML = dots;
      }

      const slot = this.slots[this.sel];
      const owned = this._owned(slot);
      const w = slot.weapons[slot.current];
      this.root.classList.toggle('sel-empty', owned.length === 0);
      this.cSlot.textContent = SLOT_NAMES[slot.id] || slot.id;
      if (!w || !w.owned) {
        this.cName.textContent = 'Empty';
        this.cAmmo.innerHTML = '<span class="vhw-none">No weapon</span>';
      } else {
        this.cName.textContent = w.name || w.id;
        const kind = this._kind(w.id);
        if (kind === 'melee') this.cAmmo.innerHTML = '';
        else if (kind === 'thrown') this.cAmmo.innerHTML = '<b>' + ((w.mag || 0) + (w.ammo || 0)) + '</b><span>left</span>';
        else this.cAmmo.innerHTML = '<b' + (w.mag ? '' : ' class="out"') + '>' + (w.mag || 0) + '</b><span>/ ' + (w.ammo || 0) + '</span>';
      }
      if (owned.length > 1) {
        const at = owned.indexOf(w) + 1;
        this.cCycle.innerHTML = '<em>‹</em>' + at + ' of ' + owned.length + '<em>›</em>';
        this.cCycle.hidden = false;
      } else {
        this.cCycle.textContent = '';
        this.cCycle.hidden = true;
      }
      const k = this.gamepad ? 'LB' : this.keyLabel || 'Tab';
      this.hint.innerHTML = '<span><kbd>' + k + '</kbd> Hold</span>' +
        '<span>' + (this.gamepad ? '<kbd>R</kbd> Stick' : 'Mouse') + ' Choose</span>' +
        '<span>' + (this.gamepad ? '<kbd>◂ ▸</kbd>' : '<kbd>Wheel</kbd>') + ' Cycle</span>' +
        '<span>Release to equip</span>';
    }
  }

  WeaponWheel.icon = icon;
  WeaponWheel.ICON_IDS = Object.keys(ICONS);
  VH.WeaponWheel = WeaponWheel;
})();
