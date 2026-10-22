/*
 * minimap.js — the radar in the bottom-left corner and the full-screen city
 * map, both drawn with Canvas 2D straight from the city layout.
 *
 *   const map = new VH.Minimap(layout, hudRoot);
 *   map.update(dt, state);     every frame: the radar (and the full map while it is open)
 *   map.setVisible(bool);
 *   map.openFull(); map.closeFull(); map.isFullOpen; map.updateFull(state);
 *   VH.Minimap.route(layout, fromX, fromZ, toX, toZ)  → [[x, z], ...] along the roads
 *
 * state = {
 *   x, z, heading, camYaw,      player position, player/vehicle yaw, camera yaw
 *   speed,                      m/s; the radar zooms out as it rises (90 m → 190 m radius at 40 m/s)
 *   blips: [{ x, z, type, label?, heading?, flash?, noRim? }],
 *          type: police | objective | mission | car | shop | safehouse | race | challenge | enemy
 *                | store | plane | heli | tank   (noRim: not pinned to the radar's rim when far)
 *   searchArea: { x, z, r } | null,   route: [[x, z], ...] | null,
 *   heat: 0..5,                 visible: bool
 * }
 *
 * How it stays cheap: the whole city is painted once into an offscreen
 * canvas (0.7 m per pixel, plus a half-size copy for zoomed-out views).
 * A radar frame only crops and rotates that image with one drawImage, then
 * stamps pre-rendered sprites (blips, the rim, the vignette) on top, so it
 * costs a small fraction of a millisecond. The full map caches its static
 * layer (city + labels) and only re-renders it when the view changes; when
 * zoomed in past the image's resolution it repaints the visible part of the
 * city as vectors so it stays sharp.
 *
 * World conventions (see core.js): +X east, -Z north, so the north-up map
 * has x to the right and z downwards. A yaw `a` faces (sin a, cos a).
 */
(function () {
  'use strict';

  const VH = window.VH;
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---------------------------------------------------------------- tuning
  const BASE_MPP = 0.7; //            metres per pixel of the pre-rendered city
  const RADAR_R_FOOT = 90; //         metres from the centre to the rim when still
  const RADAR_R_FAST = 190; //        ... at RADAR_FAST_SPEED and above
  const RADAR_FAST_SPEED = 40; //     m/s
  const RADAR_MIN_INTERVAL = 1 / 75; // redraw cap, for high refresh-rate screens
  const POLICE_CONE = { range: 24, half: 0.5 }; // vision cone: metres, half-angle (rad)
  const TURN_COST = 14; //            GPS: metres a turn is "worth", so routes avoid zig-zags

  const PAL = {
    outside: '#070b16',
    outsideLand: '#0b1513',
    grass: '#13261f',
    hedge: '#1f4a2c',
    pave: '#283042',
    building: '#1a2031',
    parking: '#20273a',
    courtyard: '#1b2a2a',
    alley: '#343845',
    road: '#6b6660',
    roadMajor: '#7b746c',
    centreLine: 'rgba(255, 206, 120, 0.24)',
    median: '#2c5943',
    palm: '#3f7d5a',
    lawn: '#275540',
    path: '#6e6a60',
    stone: '#a59d8f',
    fountain: '#46a6cc',
    plaza: '#2d4b55',
    towerGround: '#333a4e',
    dirt: '#4a3e2c',
    boardwalk: '#56463a',
    seawall: 'rgba(170, 184, 204, 0.8)',
    pier: '#8e7154',
    pierRail: 'rgba(235, 226, 212, 0.75)',
    water0: '#0f3a5e',
    water1: '#0a2849',
    water2: '#071a33',
  };

  // A very light per-district tint on pavements and roofs.
  const TINTS = { downtown: '#7d8cff', oldmarket: '#ff8a5c', palmcrescent: '#6fe0b0', harborpoint: '#ff6fa8' };

  const SUNSET = [[0, '#ffb347'], [0.4, '#ff7a59'], [0.72, '#ff4f8b'], [1, '#b04ae0']];
  const INK = 'rgba(6, 9, 20, 0.92)';
  const POLICE_RED = [255, 45, 85];
  const POLICE_BLUE = [47, 123, 255];

  // Drawing order: later types sit on top.
  const PRIORITY = { car: 0, shop: 0, store: 0, plane: 0, heli: 0, tank: 0, safehouse: 1, race: 1, challenge: 1, enemy: 2, police: 3, waypoint: 4, mission: 4, objective: 5 };
  const MAX_PRIORITY = 5;

  const LEGEND = [
    ['player', 'You'],
    ['objective', 'Objective'],
    ['mission', 'Mission'],
    ['route', 'GPS route'],
    ['police', 'Police'],
    ['search', 'Search area'],
    ['enemy', 'Hostile'],
    ['car', 'Vehicle'],
    ['safehouse', 'Safehouse'],
    ['shop', 'Shop'],
    ['race', 'Race'],
    ['challenge', 'Challenge'],
    ['landmark', 'Landmark'],
    ['store', 'Corner shop'],
    ['plane', 'Aircraft'],
    ['tank', 'Military vehicle'],
    ['waypoint', 'Your waypoint'],
    ['airport', 'Airport'],
    ['fort', 'Army base'],
    ['skyline', 'Skyscrapers'],
    ['pin', 'Your pin'],
  ];

  const NO_DASH = [];
  const DASH_SEARCH = [6, 5];
  const DASH_ROUTE = [1.5, 9];

  let FONT = "'Bahnschrift', 'DIN Alternate', 'Barlow Condensed', 'Arial Narrow', 'Segoe UI', sans-serif";

  function readDisplayFont() {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--vh-font-display').trim();
      if (v) FONT = v;
    } catch (err) {
      // Keep the default stack.
    }
  }

  // --------------------------------------------------------------- helpers
  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function tintOf(district) {
    if (!district) return null;
    if (TINTS[district.id]) return TINTS[district.id];
    const acc = district.palette && district.palette.accents;
    if (acc && acc.length > 1) return '#' + (acc[1] >>> 0).toString(16).padStart(6, '0');
    return null;
  }

  function mixRgb(a, b, t, lift) {
    const r = (a[0] + (b[0] - a[0]) * t) * lift;
    const g = (a[1] + (b[1] - a[1]) * t) * lift;
    const bl = (a[2] + (b[2] - a[2]) * t) * lift;
    return 'rgb(' + clamp(r | 0, 0, 255) + ',' + clamp(g | 0, 0, 255) + ',' + clamp(bl | 0, 0, 255) + ')';
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function sunsetGradient(g, x0, y0, x1, y1) {
    const s = g.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of SUNSET) s.addColorStop(o, c);
    return s;
  }

  function setSpacing(g, px) {
    if ('letterSpacing' in g) g.letterSpacing = px + 'px';
  }

  function setStretch(g, v) {
    if ('fontStretch' in g) g.fontStretch = v;
  }

  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function formatDistance(m) {
    if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
    return (m / 1000).toFixed(1) + ' km';
  }

  /**
   * paint: the area pre-rendered (a margin of open land and plenty of bay);
   * land: the playable area (the full map's zoom-out limit and pan bounds);
   * fit: the city view (the grid, Northgate Heights and the pier);
   * world: the whole-map view, out to the airport and the army base.
   */
  function extentsOf(layout) {
    const cfg = layout.config;
    const b = cfg.bounds;
    const pier = (layout.waterfront && layout.waterfront.pier) || cfg.pier;
    const east = Math.max(b.maxX, pier ? pier.x1 : b.maxX);
    const lines = cfg.lines;
    const lo = lines[0];
    const hi = lines[lines.length - 1];
    const zones = cfg.zones || {};
    return {
      paint: { minX: b.minX - 70, maxX: east + 210, minZ: b.minZ - 70, maxZ: b.maxZ + 70 },
      land: { minX: b.minX - 24, maxX: east + 40, minZ: b.minZ - 24, maxZ: b.maxZ + 24 },
      // The city, Northgate Heights and the edge of the countryside.
      fit: { minX: Math.max(b.minX, lo - 70), maxX: east + 36, minZ: Math.max(b.minZ, lo - 300), maxZ: Math.min(b.maxZ, hi + 60) },
      world: {
        minX: Math.min(Math.max(b.minX, lo - 70), zones.fort ? zones.fort.minX - 40 : Infinity),
        maxX: east + 36,
        minZ: Math.min(Math.max(b.minZ, lo - 300), zones.airport ? zones.airport.minZ - 40 : Infinity),
        maxZ: b.maxZ,
      },
    };
  }

  /** Metres per pixel of the pre-rendered map: as sharp as 0.7, but never more than ~8 megapixels. */
  function baseMppFor(layout) {
    const E = extentsOf(layout).paint;
    return Math.max(BASE_MPP, Math.sqrt(((E.maxX - E.minX) * (E.maxZ - E.minZ)) / 8e6));
  }

  /**
   * Places built outside the grid (the airport, the fort, Northgate Heights)
   * paint themselves onto the map: VH.MapPainters is a list of
   * fn(g, layout, { R, on, circle, px, hair, PAL }), drawn under the roads.
   */
  VH.MapPainters = VH.MapPainters || [];

  // ------------------------------------------------------------- glyphs
  // Each glyph is drawn around (0, 0) in CSS pixels and baked into a sprite.
  function glow(g, r, rgb, a) {
    const q = g.createRadialGradient(0, 0, 0, 0, 0, r);
    q.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    q.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = q;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  }

  function diamond(g, r) {
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r, 0);
    g.lineTo(0, r);
    g.lineTo(-r, 0);
    g.closePath();
  }

  function inkThenFill(g, fill, inkWidth) {
    g.lineJoin = 'round';
    g.lineWidth = inkWidth;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = fill;
    g.fill();
  }

  function policeDot(g, rgb) {
    glow(g, 11, rgb.join(','), 0.6);
    g.beginPath();
    g.arc(0, 0, 4.3, 0, TAU);
    inkThenFill(g, 'rgb(' + rgb.join(',') + ')', 3);
    g.lineWidth = 1.3;
    g.strokeStyle = '#ffffff';
    g.stroke();
  }

  /** The plane silhouette, nose up (the Aircraft blip and the airport badge). */
  function planeShape(g) {
    g.beginPath();
    g.moveTo(0, -7.6);
    g.lineTo(1.4, -4.4);
    g.lineTo(1.4, -1.6);
    g.lineTo(7.4, 1.6);
    g.lineTo(7.4, 3);
    g.lineTo(1.4, 1.6);
    g.lineTo(1, 5);
    g.lineTo(3.4, 6.6);
    g.lineTo(3.4, 7.6);
    g.lineTo(0, 6.8);
    g.lineTo(-3.4, 7.6);
    g.lineTo(-3.4, 6.6);
    g.lineTo(-1, 5);
    g.lineTo(-1.4, 1.6);
    g.lineTo(-7.4, 3);
    g.lineTo(-7.4, 1.6);
    g.lineTo(-1.4, -1.6);
    g.lineTo(-1.4, -4.4);
    g.closePath();
  }

  const GLYPHS = {
    player(g) {
      glow(g, 16, '255,79,139', 0.4);
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(7.4, 8);
      g.lineTo(0, 4.2);
      g.lineTo(-7.4, 8);
      g.closePath();
      inkThenFill(g, '#ffffff', 3.4);
      // Shade the left half so the arrow reads as a folded, raised shape.
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(0, 4.2);
      g.lineTo(-7.4, 8);
      g.closePath();
      g.fillStyle = 'rgba(255, 150, 185, 0.38)';
      g.fill();
    },
    objective(g) {
      glow(g, 16, '255,96,120', 0.55);
      diamond(g, 7.8);
      inkThenFill(g, sunsetGradient(g, -7.8, -7.8, 7.8, 7.8), 3.6);
      g.lineWidth = 1.5;
      g.strokeStyle = '#ffffff';
      g.stroke();
      diamond(g, 2.1);
      g.fillStyle = '#ffffff';
      g.fill();
    },
    mission(g) {
      glow(g, 13, '255,122,89', 0.42);
      diamond(g, 7);
      inkThenFill(g, sunsetGradient(g, -7, -7, 7, 7), 3.2);
      g.lineWidth = 1.3;
      g.strokeStyle = '#ffffff';
      g.stroke();
      diamond(g, 3.3);
      g.fillStyle = INK;
      g.fill();
    },
    police_r(g) {
      policeDot(g, POLICE_RED);
    },
    police_b(g) {
      policeDot(g, POLICE_BLUE);
    },
    enemy(g) {
      glow(g, 11, '255,70,70', 0.38);
      g.beginPath();
      g.moveTo(0, -6.2);
      g.lineTo(5.8, 4.4);
      g.lineTo(-5.8, 4.4);
      g.closePath();
      inkThenFill(g, '#ff4d4d', 3);
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 225, 225, 0.9)';
      g.stroke();
    },
    car(g) {
      roundRectPath(g, -4.2, -6.8, 8.4, 13.6, 2.6);
      inkThenFill(g, '#35e0d0', 3);
      roundRectPath(g, -2.9, -3.9, 5.8, 3.1, 1.1);
      g.fillStyle = 'rgba(3, 32, 36, 0.85)';
      g.fill();
    },
    // A shopping bag: a corner shop (hold it up with a gun, or buy a snack).
    store(g) {
      g.beginPath();
      g.arc(0, -3.4, 3, Math.PI, 0);
      g.lineWidth = 3.6;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 1.6;
      g.strokeStyle = '#ffd447';
      g.stroke();
      roundRectPath(g, -6.2, -3.6, 12.4, 10.4, 2);
      inkThenFill(g, '#ffd447', 3);
      g.fillStyle = INK;
      g.font = '700 8.5px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 1.8);
    },
    // Aircraft, drawn nose-up and turned to face their heading.
    plane(g) {
      planeShape(g);
      inkThenFill(g, '#e9f6ff', 2.6);
    },
    heli(g) {
      roundRectPath(g, -2.4, -4.6, 4.8, 8, 2.2);
      inkThenFill(g, '#e9f6ff', 2.6);
      g.fillStyle = '#e9f6ff';
      g.fillRect(-0.7, 3, 1.4, 4.6);
      g.beginPath();
      g.arc(0, -0.6, 6.8, 0, TAU);
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(233, 246, 255, 0.75)';
      g.stroke();
    },
    tank(g) {
      roundRectPath(g, -4.6, -6, 9.2, 12.4, 1.6);
      inkThenFill(g, '#b5c46a', 3);
      g.beginPath();
      g.arc(0, 1, 3, 0, TAU);
      g.fillStyle = '#5d6b2c';
      g.fill();
      g.fillRect(-0.8, -8.2, 1.6, 8.6);
    },
    shop(g) {
      roundRectPath(g, -6.6, -6.6, 13.2, 13.2, 3.6);
      inkThenFill(g, '#0f2a22', 3);
      g.lineWidth = 1.5;
      g.strokeStyle = '#7dffa8';
      g.stroke();
      g.fillStyle = '#7dffa8';
      g.font = '700 10px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 0.6);
    },
    safehouse(g) {
      g.beginPath();
      g.moveTo(0, -7.2);
      g.lineTo(7.2, -0.6);
      g.lineTo(5.1, -0.6);
      g.lineTo(5.1, 6.2);
      g.lineTo(-5.1, 6.2);
      g.lineTo(-5.1, -0.6);
      g.lineTo(-7.2, -0.6);
      g.closePath();
      inkThenFill(g, '#ffb347', 3);
      g.fillStyle = INK;
      g.fillRect(-1.6, 1.6, 3.2, 4.6);
    },
    race(g) {
      g.beginPath();
      g.arc(0, 0, 7, 0, TAU);
      inkThenFill(g, '#f4f6ff', 3);
      g.save();
      g.clip();
      g.fillStyle = '#10131f';
      const q = 3.5;
      for (let i = -2; i < 2; i++) {
        for (let j = -2; j < 2; j++) if ((i + j) & 1) g.fillRect(i * q, j * q, q, q);
      }
      g.restore();
      g.beginPath();
      g.arc(0, 0, 7, 0, TAU);
      g.lineWidth = 1.6;
      g.strokeStyle = '#c77dff';
      g.stroke();
    },
    challenge(g) {
      glow(g, 12, '255,211,74', 0.36);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i & 1 ? 3.4 : 7.8;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      inkThenFill(g, '#ffd34a', 3);
      g.lineWidth = 0.8;
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      g.stroke();
    },
    // A GPS waypoint you set on the map: a magenta pin.
    waypoint(g) {
      glow(g, 12, '255,79,216', 0.4);
      g.beginPath();
      g.moveTo(0, 8.4);
      g.bezierCurveTo(-1.6, 4.6, -6.2, 1.2, -6.2, -3);
      g.arc(0, -3, 6.2, Math.PI, 0);
      g.bezierCurveTo(6.2, 1.2, 1.6, 4.6, 0, 8.4);
      g.closePath();
      inkThenFill(g, '#ff4fd8', 3);
      g.beginPath();
      g.arc(0, -3, 2.3, 0, TAU);
      g.fillStyle = '#ffffff';
      g.fill();
    },
    // A pin the player drops on the full map: a little flag.
    pin(g) {
      glow(g, 11, '63,216,255', 0.35);
      g.beginPath();
      g.moveTo(-3, 8.5);
      g.lineTo(-3, -8);
      g.lineCap = 'round';
      g.lineWidth = 3.6;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(-3, -8);
      g.lineTo(7.5, -4.4);
      g.lineTo(-3, -0.6);
      g.closePath();
      inkThenFill(g, '#3fd8ff', 2.6);
    },
    // Badges for the big places outside the grid.
    airport(g) {
      glow(g, 14, '120,200,255', 0.38);
      roundRectPath(g, -8.6, -8.6, 17.2, 17.2, 4.6);
      inkThenFill(g, '#0d2236', 3);
      g.lineWidth = 1.6;
      g.strokeStyle = '#7fd0ff';
      g.stroke();
      g.save();
      g.scale(0.92, 0.92);
      planeShape(g);
      g.fillStyle = '#e9f6ff';
      g.fill();
      g.restore();
    },
    fort(g) {
      glow(g, 14, '181,196,106', 0.38);
      roundRectPath(g, -8.6, -8.6, 17.2, 17.2, 4.6);
      inkThenFill(g, '#1f2610', 3);
      g.lineWidth = 1.6;
      g.strokeStyle = '#c9d77a';
      g.stroke();
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i & 1 ? 2.6 : 6.2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 0.4);
      }
      g.closePath();
      g.fillStyle = '#e8f0b8';
      g.fill();
    },
    skyline(g) {
      glow(g, 14, '255,207,138', 0.38);
      roundRectPath(g, -8.6, -8.6, 17.2, 17.2, 4.6);
      inkThenFill(g, '#2a1d0c', 3);
      g.lineWidth = 1.6;
      g.strokeStyle = '#ffcf8a';
      g.stroke();
      g.fillStyle = '#ffe2b3';
      g.fillRect(-5.6, -1.6, 3, 7);
      g.fillRect(-1.6, -6.4, 3.2, 11.8);
      g.fillRect(2.6, -3.6, 3, 9);
      g.fillRect(-0.3, -8, 0.6, 1.8);
    },
    landmark(g) {
      glow(g, 10, '255,140,110', 0.3);
      g.beginPath();
      g.arc(0, 0, 5.2, 0, TAU);
      g.fillStyle = '#0b1020';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = sunsetGradient(g, -5, -5, 5, 5);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 1.7, 0, TAU);
      g.fillStyle = '#ffffff';
      g.fill();
    },
    north(g) {
      g.beginPath();
      g.arc(0, 0, 7.6, 0, TAU);
      g.fillStyle = '#0b1020';
      g.fill();
      g.lineWidth = 1.6;
      g.strokeStyle = sunsetGradient(g, -7, -7, 7, 7);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = '700 9.5px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', 0, 0.7);
    },
  };

  const SPRITE_SIZE = 34;
  const spriteCache = new Map();

  function buildSprites(dpr) {
    const key = dpr.toFixed(3) + '|' + FONT;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const set = {};
    const px = Math.ceil(SPRITE_SIZE * dpr);
    for (const name of Object.keys(GLYPHS)) {
      const c = makeCanvas(px, px);
      const g = c.getContext('2d');
      const k = px / SPRITE_SIZE;
      g.setTransform(k, 0, 0, k, px / 2, px / 2);
      GLYPHS[name](g);
      set[name] = { canvas: c, size: SPRITE_SIZE };
    }
    // Police vision cones: apex at the bottom centre, pointing up.
    const cone = (rgb) => {
      const L = 64;
      const w = Math.ceil(2 * L * Math.sin(POLICE_CONE.half)) + 2;
      const c = makeCanvas(w * dpr, L * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, (w / 2) * dpr, L * dpr);
      const q = g.createRadialGradient(0, 0, 0, 0, 0, L);
      q.addColorStop(0, 'rgba(' + rgb.join(',') + ',0.7)');
      q.addColorStop(0.55, 'rgba(' + rgb.join(',') + ',0.34)');
      q.addColorStop(1, 'rgba(' + rgb.join(',') + ',0)');
      g.fillStyle = q;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, L, -Math.PI / 2 - POLICE_CONE.half, -Math.PI / 2 + POLICE_CONE.half);
      g.closePath();
      g.fill();
      return { canvas: c, aspect: w / L };
    };
    set.coneR = cone(POLICE_RED);
    set.coneB = cone(POLICE_BLUE);
    spriteCache.set(key, set);
    return set;
  }

  // ------------------------------------------------------ the city painter
  /**
   * Paint the city into `g`, whose transform maps world metres to pixels.
   * o.px is the size of one device pixel in metres (for hairlines), o.view
   * limits the work to a world rectangle, o.noise is a texture pattern.
   */
  function paintCity(g, layout, o) {
    const cfg = layout.config;
    const b = cfg.bounds;
    const E = extentsOf(layout).paint;
    const v = o.view || E;
    const px = o.px;
    const sea = cfg.seawallX;
    const lines = cfg.lines;
    const SW = cfg.sidewalk || 4;
    const west = lines[0] - cfg.avenueWidth(lines[0]) / 2;
    const east = lines[lines.length - 1] + cfg.avenueWidth(lines[lines.length - 1]) / 2;
    const north = lines[0] - cfg.streetWidth(lines[0]) / 2;
    const south = lines[lines.length - 1] + cfg.streetWidth(lines[lines.length - 1]) / 2;
    const wf = layout.waterfront || { pier: cfg.pier };

    const on = (x0, z0, x1, z1) => x1 > v.minX && x0 < v.maxX && z1 > v.minZ && z0 < v.maxZ;
    const R = (x0, z0, x1, z1) => {
      if (x1 > x0 && z1 > z0 && on(x0, z0, x1, z1)) g.fillRect(x0, z0, x1 - x0, z1 - z0);
    };
    const circle = (x, z, r) => {
      if (!on(x - r, z - r, x + r, z + r)) return;
      g.beginPath();
      g.arc(x, z, r, 0, TAU);
      g.fill();
    };
    const hair = Math.max(px, 0.12);

    // ---------------------------------------------------- land and sea
    g.fillStyle = PAL.outside;
    R(E.minX, E.minZ, E.maxX, E.maxZ);
    g.fillStyle = PAL.outsideLand;
    R(E.minX, E.minZ, sea, E.maxZ);
    g.fillStyle = PAL.grass;
    R(b.minX, b.minZ, sea, b.maxZ);
    if (o.noise) {
      g.fillStyle = o.noise;
      R(b.minX, b.minZ, sea, b.maxZ);
    }
    // The hedge around the playable area (open to the bay on the east).
    g.fillStyle = PAL.hedge;
    R(b.minX - 1.6, b.minZ - 1.6, b.minX, b.maxZ + 1.6);
    R(b.minX - 1.6, b.minZ - 1.6, sea, b.minZ);
    R(b.minX - 1.6, b.maxZ, sea, b.maxZ + 1.6);

    const water = g.createLinearGradient(sea, 0, E.maxX, 0);
    water.addColorStop(0, PAL.water0);
    water.addColorStop(0.35, PAL.water1);
    water.addColorStop(1, PAL.water2);
    g.fillStyle = water;
    R(sea, E.minZ, E.maxX, E.maxZ);
    const shallows = g.createLinearGradient(sea, 0, sea + 34, 0);
    shallows.addColorStop(0, 'rgba(90, 190, 225, 0.3)');
    shallows.addColorStop(1, 'rgba(90, 190, 225, 0)');
    g.fillStyle = shallows;
    R(sea, E.minZ, sea + 34, E.maxZ);
    // Depth contours, like a chart.
    if (on(sea, E.minZ, E.maxX, E.maxZ)) {
      g.strokeStyle = 'rgba(150, 210, 240, 0.08)';
      g.lineWidth = Math.max(px, 0.7);
      for (const d of [58, 132, 236]) {
        g.beginPath();
        for (let z = E.minZ; z <= E.maxZ; z += 10) {
          const x = sea + d + Math.sin(z * 0.011 + d) * 7 + Math.sin(z * 0.031 + d * 0.3) * 2.5;
          if (z === E.minZ) g.moveTo(x, z);
          else g.lineTo(x, z);
        }
        g.stroke();
      }
    }
    // Wave glints (deterministic, so every repaint matches).
    const rng = new VH.RNG('minimap-waves');
    g.fillStyle = 'rgba(170, 220, 255, 0.075)';
    for (let i = 0; i < 520; i++) {
      const x = rng.range(sea + 14, E.maxX);
      const z = rng.range(E.minZ, E.maxZ);
      const len = rng.range(3, 11);
      R(x, z, x + len, z + Math.max(px, 0.55));
    }
    g.fillStyle = 'rgba(160, 225, 245, 0.45)';
    R(sea, b.minZ, sea + Math.max(px, 0.9), b.maxZ);

    // ------------------------------------------------- the paved city
    g.fillStyle = PAL.pave;
    R(west, north, east + SW, south);
    g.fillStyle = PAL.boardwalk;
    R(east + SW, north, sea, south);
    g.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let x = east + SW + 1.8; x < sea - 0.5; x += 2.4) R(x, north, x + hair, south);
    g.fillStyle = PAL.seawall;
    R(sea - Math.max(px, 0.7), north, sea, south);

    // ---------------------------------------------------------- blocks
    for (const bl of layout.blocks) {
      if (!on(bl.minX - 4, bl.minZ - 4, bl.maxX + 4, bl.maxZ + 4)) continue;
      const tint = tintOf(bl.district);
      g.fillStyle = PAL.pave;
      R(bl.minX, bl.minZ, bl.maxX, bl.maxZ);
      if (tint) {
        g.globalAlpha = 0.035;
        g.fillStyle = tint;
        R(bl.minX, bl.minZ, bl.maxX, bl.maxZ);
        g.globalAlpha = 1;
      }
      g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      g.lineWidth = hair;
      g.strokeRect(bl.minX + hair / 2, bl.minZ + hair / 2, bl.maxX - bl.minX - hair, bl.maxZ - bl.minZ - hair);
      const ix0 = bl.minX + SW;
      const ix1 = bl.maxX - SW;
      const iz0 = bl.minZ + SW;
      const iz1 = bl.maxZ - SW;
      const cx = (ix0 + ix1) / 2;
      const cz = (iz0 + iz1) / 2;

      if (bl.kind === 'park') {
        g.fillStyle = PAL.lawn;
        R(ix0, iz0, ix1, iz1);
        g.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let x = ix0; x < ix1; x += 8) R(x, iz0, Math.min(ix1, x + 4), iz1);
        g.fillStyle = PAL.path;
        R(cx - 2, iz0, cx + 2, iz1);
        R(ix0, cz - 2, ix1, cz + 2);
        R(cx - 11, cz - 11, cx + 11, cz + 11);
        g.fillStyle = PAL.stone;
        circle(cx, cz, 6.2);
        g.fillStyle = PAL.fountain;
        circle(cx, cz, 5.2);
        g.fillStyle = 'rgba(255, 255, 255, 0.45)';
        circle(cx, cz, 1.1);
      } else if (bl.kind === 'plaza') {
        g.fillStyle = PAL.plaza;
        R(ix0, iz0, ix1, iz1);
        if (on(ix0, iz0, ix1, iz1)) {
          g.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          g.lineWidth = hair;
          g.beginPath();
          for (let x = ix0 + 6; x < ix1; x += 6) {
            g.moveTo(x, iz0);
            g.lineTo(x, iz1);
          }
          for (let z = iz0 + 6; z < iz1; z += 6) {
            g.moveTo(ix0, z);
            g.lineTo(ix1, z);
          }
          g.stroke();
        }
        // The observation terrace in the north-west corner.
        g.fillStyle = 'rgba(0, 0, 0, 0.3)';
        R(ix0 + 1.2, iz0 + 1.2, ix0 + 19.2, iz0 + 17.2);
        g.fillStyle = '#4c6a72';
        R(ix0, iz0, ix0 + 18, iz0 + 16);
        g.fillStyle = 'rgba(255, 255, 255, 0.08)';
        R(ix0, iz0, ix0 + 18, iz0 + hair);
      } else if (bl.kind === 'tower') {
        g.fillStyle = PAL.towerGround;
        R(ix0, iz0, ix1, iz1);
        const tx = bl.cx;
        const tz = bl.cz;
        g.fillStyle = 'rgba(2, 4, 10, 0.45)';
        R(tx - 30 + 3, tz - 30 + 3, tx + 30 + 3, tz + 30 + 3);
        const tiers = [[30, '#1f2638'], [21, '#293147'], [17, '#323b55'], [13, '#3d4764']];
        for (const [h, col] of tiers) {
          g.fillStyle = col;
          R(tx - h, tz - h, tx + h, tz + h);
          g.fillStyle = 'rgba(255, 255, 255, 0.07)';
          R(tx - h, tz - h, tx + h, tz - h + hair);
        }
        g.strokeStyle = 'rgba(255, 140, 110, 0.55)';
        g.lineWidth = Math.max(px, 0.6);
        g.strokeRect(tx - 13, tz - 13, 26, 26);
      } else if (bl.kind === 'construction') {
        g.fillStyle = PAL.dirt;
        R(ix0, iz0, ix1, iz1);
        if (on(ix0, iz0, ix1, iz1)) {
          g.save();
          g.beginPath();
          g.rect(ix0, iz0, ix1 - ix0, iz1 - iz0);
          g.clip();
          g.strokeStyle = 'rgba(255, 179, 71, 0.08)';
          g.lineWidth = 1.4;
          g.beginPath();
          for (let d = -(iz1 - iz0); d < ix1 - ix0; d += 7) {
            g.moveTo(ix0 + d, iz0);
            g.lineTo(ix0 + d + (iz1 - iz0), iz1);
          }
          g.stroke();
          g.restore();
          g.strokeStyle = 'rgba(255, 179, 71, 0.5)';
          g.lineWidth = Math.max(px, 0.5);
          g.setLineDash([2.4, 1.6]);
          g.strokeRect(ix0, iz0, ix1 - ix0, iz1 - iz0);
          g.setLineDash(NO_DASH);
        }
      } else {
        paintLots(g, bl, tint, R, hair);
      }
    }

    for (const fn of VH.MapPainters) fn(g, layout, { R, on, circle, px, hair, PAL });

    // ----------------------------------------------------------- roads
    for (const s of layout.segments) {
      g.fillStyle = s.road.width >= 18 ? PAL.roadMajor : PAL.road;
      R(s.minX, s.minZ, s.maxX, s.maxZ);
    }
    for (const it of layout.intersections) {
      const major = (it.avenue && it.avenue.width >= 18) || (it.street && it.street.width >= 18);
      g.fillStyle = major ? PAL.roadMajor : PAL.road;
      R(it.x - it.halfX, it.z - it.halfZ, it.x + it.halfX, it.z + it.halfZ);
    }
    const along = (r, a0, a1, c0, c1) => {
      if (r.axis === 'z') R(r.coord + c0, a0, r.coord + c1, a1);
      else R(a0, r.coord + c0, a1, r.coord + c1);
    };
    for (const s of layout.segments) {
      const r = s.road;
      const a = s.from + (s.startsAtJunction ? 4.6 : 0);
      const e = s.to - (s.endsAtJunction ? 4.6 : 0);
      if (e - a < 2) continue;
      if (r.median > 0) {
        g.fillStyle = PAL.median;
        along(r, a, e, -r.median / 2, r.median / 2);
        g.fillStyle = PAL.palm;
        const spacing = r.coord === 0 ? 16 : 20;
        for (let p = a + spacing / 2; p < e - 2; p += spacing) {
          if (r.axis === 'z') circle(r.coord, p, Math.min(1.5, r.median * 0.4));
          else circle(p, r.coord, Math.min(1.5, r.median * 0.4));
        }
      } else {
        g.fillStyle = PAL.centreLine;
        const w = Math.max(px * 0.9, 0.3);
        along(r, a + 1.4, e - 1.4, -w / 2, w / 2);
      }
    }

    // ------------------------------------------------------------ pier
    const p = wf.pier;
    if (p) {
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      R(p.x0, p.z0 + 1.6, p.x1 + 1.6, p.z1 + 1.6);
      g.fillStyle = PAL.pier;
      R(p.x0, p.z0, p.x1, p.z1);
      g.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let x = p.x0 + 1.6; x < p.x1; x += 2) R(x, p.z0, x + hair, p.z1);
      g.fillStyle = PAL.pierRail;
      const rail = Math.max(px, 0.35);
      R(p.x0, p.z0, p.x1, p.z0 + rail);
      R(p.x0, p.z1 - rail, p.x1, p.z1);
      R(p.x1 - rail, p.z0, p.x1, p.z1);
      // The café at the far end, with its pink awning.
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      R(p.x1 - 20 + 0.8, -3.5 + 0.8, p.x1 - 8 + 0.8, 3.5 + 0.8);
      g.fillStyle = '#e9e1d2';
      R(p.x1 - 20, -3.5, p.x1 - 8, 3.5);
      g.fillStyle = '#ff6f91';
      R(p.x1 - 21.6, -3.5, p.x1 - 20, 3.5);
    }
  }

  function paintLots(g, bl, tint, R, hair) {
    if (bl.alley) {
      g.fillStyle = PAL.alley;
      R(bl.alley.minX, bl.alley.minZ, bl.alley.maxX, bl.alley.maxZ);
    }
    const base = hexRgb(PAL.building);
    const tintRgb = tint ? hexRgb(tint) : base;
    for (const lot of bl.lots) {
      const x0 = lot.minX + 0.8;
      const z0 = lot.minZ + 0.8;
      const x1 = lot.maxX - 0.8;
      const z1 = lot.maxZ - 0.8;
      if (x1 <= x0 || z1 <= z0) continue;
      if (lot.kind === 'parking') {
        g.fillStyle = PAL.parking;
        R(x0, z0, x1, z1);
        g.fillStyle = 'rgba(255, 255, 255, 0.07)';
        if (x1 - x0 >= z1 - z0) {
          for (let x = x0 + 1.4; x < x1 - 1; x += 2.6) {
            R(x, z0 + 0.8, x + hair, z0 + 5.4);
            R(x, z1 - 5.4, x + hair, z1 - 0.8);
          }
        } else {
          for (let z = z0 + 1.4; z < z1 - 1; z += 2.6) {
            R(x0 + 0.8, z, x0 + 5.4, z + hair);
            R(x1 - 5.4, z, x1 - 0.8, z + hair);
          }
        }
      } else if (lot.kind === 'courtyard') {
        g.fillStyle = PAL.courtyard;
        R(x0, z0, x1, z1);
      } else {
        const h = VH.math.hash2(lot.seed | 0, 17);
        const fr = lot.floorRange || [2, 3];
        const tall = (fr[0] + fr[1]) / 2;
        // Taller buildings throw longer shadows (to the south-east).
        const sh = clamp(0.7 + tall * 0.07, 0.9, 3.2);
        g.fillStyle = 'rgba(2, 4, 10, 0.42)';
        R(x0 + sh * 0.7, z0 + sh, x1 + sh * 0.7, z1 + sh);
        g.fillStyle = mixRgb(base, tintRgb, 0.055, 1 + (h - 0.5) * 0.24 + Math.min(tall, 40) * 0.005);
        R(x0, z0, x1, z1);
        g.fillStyle = 'rgba(255, 255, 255, 0.075)';
        R(x0, z0, x1, z0 + hair);
        R(x0, z0, x0 + hair, z1);
      }
    }
  }

  let noiseTile = null;
  function getNoiseTile() {
    if (noiseTile) return noiseTile;
    const size = 128;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const n = VH.noise;
    const cell = 8;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = n.fbm2(x / cell, y / cell, 2, size / cell) - 0.5;
        const i = (y * size + x) * 4;
        img.data[i] = v > 0 ? 170 : 0;
        img.data[i + 1] = v > 0 ? 220 : 0;
        img.data[i + 2] = v > 0 ? 180 : 0;
        img.data[i + 3] = Math.min(255, Math.abs(v) * 90);
      }
    }
    g.putImageData(img, 0, 0);
    noiseTile = c;
    return c;
  }

  let noiseScale = BASE_MPP * 1.25;
  function noisePattern(g) {
    try {
      const pat = g.createPattern(getNoiseTile(), 'repeat');
      if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(noiseScale));
      return pat;
    } catch (err) {
      return null;
    }
  }

  /** Paint the whole city once, at `mpp` metres per pixel. */
  function renderBase(layout, mpp) {
    const E = extentsOf(layout).paint;
    const s = 1 / mpp;
    const c = makeCanvas((E.maxX - E.minX) * s, (E.maxZ - E.minZ) * s);
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, -E.minX * s, -E.minZ * s);
    paintCity(g, layout, { px: mpp, view: null, noise: noisePattern(g) });
    return { canvas: c, s, ext: E };
  }

  function downsample(level) {
    const c = makeCanvas(level.canvas.width / 2, level.canvas.height / 2);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(level.canvas, 0, 0, c.width, c.height);
    return { canvas: c, s: (level.s * c.width) / level.canvas.width, ext: level.ext };
  }

  // ------------------------------------------------------------- routing
  const graphCache = new WeakMap();

  /** The road network as a graph: junction centres (and road ends) joined by centre lines. */
  function roadGraph(layout) {
    let G = graphCache.get(layout);
    if (G) return G;
    const nodes = [];
    const index = new Map();
    const nodeAt = (x, z) => {
      const key = Math.round(x * 4) + ':' + Math.round(z * 4);
      let i = index.get(key);
      if (i === undefined) {
        i = nodes.length;
        index.set(key, i);
        nodes.push({ x, z, out: [] });
      }
      return i;
    };
    const junctionsOn = new Map();
    const note = (road, alongV, half) => {
      if (!road) return;
      let list = junctionsOn.get(road);
      if (!list) junctionsOn.set(road, (list = []));
      list.push({ along: alongV, half });
    };
    for (const it of layout.intersections || []) {
      nodeAt(it.x, it.z);
      note(it.avenue, it.z, it.halfZ);
      note(it.street, it.x, it.halfX);
    }
    const edges = [];
    for (const seg of layout.segments || []) {
      const r = seg.road;
      const js = junctionsOn.get(r) || [];
      let a = seg.from;
      let b = seg.to;
      if (seg.startsAtJunction) {
        const j = js.find((q) => Math.abs(q.along + q.half - seg.from) < 0.05);
        if (j) a = j.along;
      }
      if (seg.endsAtJunction) {
        const j = js.find((q) => Math.abs(q.along - q.half - seg.to) < 0.05);
        if (j) b = j.along;
      }
      const x0 = r.axis === 'z' ? r.coord : a;
      const z0 = r.axis === 'z' ? a : r.coord;
      const x1 = r.axis === 'z' ? r.coord : b;
      const z1 = r.axis === 'z' ? b : r.coord;
      const ia = nodeAt(x0, z0);
      const ib = nodeAt(x1, z1);
      if (ia === ib) continue;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const w = r.width >= 18 ? 0.9 : 1; // GPS leans towards the boulevards
      const k = edges.length;
      edges.push({ a: ia, b: ib, x0, z0, x1, z1, len, cost: len * w, ux: (x1 - x0) / len, uz: (z1 - z0) / len });
      nodes[ia].out.push(2 * k); //     half-edge 2k runs a → b
      nodes[ib].out.push(2 * k + 1); // half-edge 2k+1 runs b → a
    }
    G = { nodes, edges };
    graphCache.set(layout, G);
    return G;
  }

  function nearestOnGraph(G, x, z) {
    let best = null;
    let bd = Infinity;
    for (let k = 0; k < G.edges.length; k++) {
      const e = G.edges[k];
      const dx = e.x1 - e.x0;
      const dz = e.z1 - e.z0;
      const u = clamp(((x - e.x0) * dx + (z - e.z0) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = e.x0 + dx * u;
      const pz = e.z0 + dz * u;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < bd) {
        bd = d2;
        best = { k, e, u, x: px, z: pz };
      }
    }
    return best;
  }

  /** A tiny binary min-heap of [f, id] pairs. */
  class Heap {
    constructor() {
      this.f = [];
      this.id = [];
    }
    get size() {
      return this.f.length;
    }
    push(f, id) {
      const F = this.f;
      const I = this.id;
      let i = F.length;
      F.push(f);
      I.push(id);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (F[p] <= f) break;
        F[i] = F[p];
        I[i] = I[p];
        i = p;
      }
      F[i] = f;
      I[i] = id;
    }
    pop() {
      const F = this.f;
      const I = this.id;
      const top = I[0];
      const lf = F.pop();
      const li = I.pop();
      if (F.length) {
        let i = 0;
        const n = F.length;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && F[c + 1] < F[c]) c++;
          if (F[c] >= lf) break;
          F[i] = F[c];
          I[i] = I[c];
          i = c;
        }
        F[i] = lf;
        I[i] = li;
      }
      return top;
    }
  }

  /**
   * A road-following route: from the road point nearest (fromX, fromZ),
   * along the road centre lines (A* over junctions, with a small cost per
   * turn), to the road point nearest the target, then the target itself.
   */
  function route(layout, fromX, fromZ, toX, toZ) {
    const G = roadGraph(layout);
    if (!G.edges.length) return [[fromX, fromZ], [toX, toZ]];
    const S = nearestOnGraph(G, fromX, fromZ);
    const T = nearestOnGraph(G, toX, toZ);
    const pts = [[S.x, S.z]];
    if (S.k !== T.k) {
      const edges = G.edges;
      const nodes = G.nodes;
      const H = edges.length * 2;
      const gs = new Float64Array(H).fill(Infinity);
      const prev = new Int32Array(H).fill(-1);
      const done = new Uint8Array(H);
      const GOAL = H; // a pseudo-state: "arrived at the target"
      let goalCost = Infinity;
      let goalVia = -1;
      const heap = new Heap();
      const arrive = (h) => (h & 1 ? edges[h >> 1].a : edges[h >> 1].b);
      const dirX = (h) => (h & 1 ? -edges[h >> 1].ux : edges[h >> 1].ux);
      const dirZ = (h) => (h & 1 ? -edges[h >> 1].uz : edges[h >> 1].uz);
      const heur = (n) => (Math.abs(nodes[n].x - T.x) + Math.abs(nodes[n].z - T.z)) * 0.9;
      // Leave the start point both ways along its edge.
      const se = S.e;
      gs[2 * S.k] = (1 - S.u) * se.cost;
      gs[2 * S.k + 1] = S.u * se.cost;
      heap.push(gs[2 * S.k] + heur(se.b), 2 * S.k);
      heap.push(gs[2 * S.k + 1] + heur(se.a), 2 * S.k + 1);
      const te = T.e;
      while (heap.size) {
        const h = heap.pop();
        if (h === GOAL) break;
        if (done[h]) continue;
        done[h] = 1;
        const n = arrive(h);
        const hx = dirX(h);
        const hz = dirZ(h);
        // Can we finish from here, onto the target's edge?
        if (h >> 1 !== T.k && (n === te.a || n === te.b)) {
          const fwd = n === te.a;
          const dx = fwd ? te.ux : -te.ux;
          const dz = fwd ? te.uz : -te.uz;
          const c = gs[h] + (fwd ? T.u : 1 - T.u) * te.cost + TURN_COST * (1 - (hx * dx + hz * dz));
          if (c < goalCost) {
            goalCost = c;
            goalVia = h;
            heap.push(c, GOAL);
          }
        }
        for (const nh of nodes[n].out) {
          if (nh === (h ^ 1) || done[nh]) continue; // no U-turns
          const c = gs[h] + edges[nh >> 1].cost + TURN_COST * (1 - (hx * dirX(nh) + hz * dirZ(nh)));
          if (c < gs[nh]) {
            gs[nh] = c;
            prev[nh] = h;
            heap.push(c + heur(arrive(nh)), nh);
          }
        }
      }
      if (goalVia >= 0) {
        const chain = [];
        for (let h = goalVia; h >= 0; h = prev[h]) chain.push(h);
        for (let i = chain.length - 1; i >= 0; i--) {
          const nd = nodes[arrive(chain[i])];
          pts.push([nd.x, nd.z]);
        }
      }
    }
    pts.push([T.x, T.z]);
    pts.push([toX, toZ]);
    const out = simplify(pts);
    // The target is always the last point (de-duplication may have kept the road point beside it).
    const last = out[out.length - 1];
    last[0] = toX;
    last[1] = toZ;
    return out;
  }

  /** Drop repeated points and points in the middle of straight runs. */
  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q && Math.abs(q[0] - p[0]) < 0.3 && Math.abs(q[1] - p[1]) < 0.3) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i > 0; i--) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      if (Math.abs(cross) < 0.5 && dot > 0 && i < out.length - 2) out.splice(i, 1);
    }
    return out;
  }

  // ------------------------------------------------------- label planning
  /** For districts without blocks (open land, the bay): the longest clear run of their cells. */
  function openDistrictSpots(layout, land, avoid) {
    const districts = VH.Data.districts || [];
    const withBlocks = new Set(layout.blocks.map((b) => b.district && b.district.id));
    const wanted = districts.filter((d) => !withBlocks.has(d.id));
    if (!wanted.length || !layout.districtAt) return [];
    const step = 32;
    const nx = Math.floor((land.maxX - land.minX) / step);
    const nz = Math.floor((land.maxZ - land.minZ) / step);
    const cell = new Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = land.minX + (ix + 0.5) * step;
        const z = land.minZ + (iz + 0.5) * step;
        let blocked = false;
        for (const r of avoid) {
          const m = r.pad === undefined ? 24 : r.pad;
          if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) blocked = true;
        }
        const d = blocked ? null : layout.districtAt(x, z);
        cell[iz * nx + ix] = d ? d.id : null;
      }
    }
    const runs = [];
    const scan = (horizontal) => {
      const outer = horizontal ? nz : nx;
      const inner = horizontal ? nx : nz;
      for (let o = 0; o < outer; o++) {
        let start = 0;
        for (let i = 1; i <= inner; i++) {
          const at = (k) => (horizontal ? cell[o * nx + k] : cell[k * nx + o]);
          if (i === inner || at(i) !== at(start)) {
            if (at(start)) runs.push({ id: at(start), horizontal, o, start, len: i - start });
            start = i;
          }
        }
      }
    };
    scan(true);
    scan(false);
    // How far a cell sits from the edge of its district across the run (to centre labels in bands).
    const thickness = (id, ix, iz, horizontal) => {
      let a = 0;
      let b = 0;
      if (horizontal) {
        while (iz - a - 1 >= 0 && cell[(iz - a - 1) * nx + ix] === id) a++;
        while (iz + b + 1 < nz && cell[(iz + b + 1) * nx + ix] === id) b++;
      } else {
        while (ix - a - 1 >= 0 && cell[iz * nx + ix - a - 1] === id) a++;
        while (ix + b + 1 < nx && cell[iz * nx + ix + b + 1] === id) b++;
      }
      return Math.min(a, b) - Math.abs(a - b) * 0.25;
    };
    // Each district gets its best few runs, best first; the map uses the first that fits the view.
    const spots = [];
    for (const d of wanted) {
      const cands = [];
      for (const r of runs) {
        if (r.id !== d.id || r.len < 5) continue;
        const mid = r.start + r.len / 2 - 0.5;
        const ix = r.horizontal ? Math.round(mid) : r.o;
        const iz = r.horizontal ? r.o : Math.round(mid);
        cands.push({
          score: r.len + thickness(d.id, ix, iz, r.horizontal) * 0.35,
          x: land.minX + (ix + 0.5) * step,
          z: land.minZ + (iz + 0.5) * step,
          vertical: !r.horizontal,
          run: r.len * step,
        });
      }
      if (!cands.length) continue;
      cands.sort((p, q) => q.score - p.score);
      spots.push({ district: d, cands: cands.slice(0, 48), water: !!(d.rect && d.rect.minX >= layout.config.seawallX - 60) });
    }
    return spots;
  }

  // ================================================================ Minimap
  class Minimap {
    constructor(layout, hudRoot, opts) {
      readDisplayFont();
      this.opts = Object.assign({ closeKey: 'M' }, opts || {});
      this.root = hudRoot || document.body;
      this._t = 0;
      this._acc = 1;
      this._radius = RADAR_R_FOOT;
      this._visible = true;
      this._fullOpen = false;
      this._state = null;
      this._dpr = 0;
      this._radarDirty = true;
      this._reduced = false;
      this._reducedCheck = 0;
      this._cap = 0;
      this._bx = null;
      this._by = null;
      this._bc = null;
      this._textW = new Map();

      this._buildRadarDom();
      this.view = VH.MapView ? new VH.MapView(this, this.opts) : null; // the full-screen map (js/mapview.js)
      this.setLayout(layout);

      this._onResize = () => {
        this._radarDirty = true;
        if (this.view) this.view.onResize();
      };
      window.addEventListener('resize', this._onResize);
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(this._onResize);
        this._ro.observe(this.radarEl);
        // Sit above the location and health panel even when its text wraps onto more lines.
        const panel = this.root.querySelector && this.root.querySelector('.hud-bottom-left');
        if (panel) {
          this._panel = panel;
          this._panelRo = new ResizeObserver(() => this._clearPanel());
          this._panelRo.observe(panel);
        }
      }
    }

    /** Lift the radar if the bottom-left panel has grown into the space it normally leaves. */
    _clearPanel() {
      const p = this._panel.getBoundingClientRect();
      const r = this.root.getBoundingClientRect();
      if (!p.height || !r.height) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
      const need = r.bottom - p.top + rem * 0.5;
      this.radarEl.style.bottom = need > rem * 8.6 ? need.toFixed(1) + 'px' : '';
    }

    /** Replace the city (e.g. after the map grows); re-paints the base image. */
    setLayout(layout) {
      this.layout = layout;
      const ext = extentsOf(layout);
      this._ext = ext;
      const mpp = baseMppFor(layout);
      noiseScale = mpp * 1.25;
      const l0 = renderBase(layout, mpp);
      this._base = [l0, downsample(l0)];
      if (this.view) this.view.setLayout(layout);
    }

    setVisible(v) {
      v = !!v;
      if (v === this._visible) return;
      this._visible = v;
      this.radarEl.classList.toggle('is-hidden', !v);
      if (v) this._acc = 1;
    }

    // ------------------------------------------------------------ radar
    _buildRadarDom() {
      const wrap = document.createElement('div');
      wrap.className = 'vh-radar';
      wrap.setAttribute('aria-hidden', 'true');
      const canvas = document.createElement('canvas');
      canvas.className = 'vh-radar-canvas';
      wrap.append(canvas);
      this.root.append(wrap);
      this.radarEl = wrap;
      this._rc = canvas;
      this._rg = canvas.getContext('2d');
    }

    _resizeRadar(dpr) {
      const S = this.radarEl.clientWidth || 210;
      const M = Math.round(S * 0.085);
      const full = S + 2 * M;
      this._dpr = dpr;
      this._radarDirty = false;
      const G = { S, M, full, c: full / 2, Rb: S / 2, Rm: S / 2 - Math.max(7, Math.round(S * 0.045)) };
      this._geo = G;
      const c = this._rc;
      c.style.left = c.style.top = -M + 'px';
      c.style.width = c.style.height = full + 'px';
      c.width = c.height = Math.round(full * dpr);
      this._spr = buildSprites(dpr);
      this._chrome = this._makeChrome(G, dpr);
      this._overlay = this._makeOverlay(G, dpr);
      this._heatR = this._makeHeatRing(G, dpr, POLICE_RED);
      this._heatB = this._makeHeatRing(G, dpr, POLICE_BLUE);
    }

    /** The bezel: glass ring, hairlines, a sunset arc along the bottom, the soft drop shadow. */
    _makeChrome(G, dpr) {
      const c = makeCanvas(G.full * dpr, G.full * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const C = G.c;
      const sh = g.createRadialGradient(C, C + 4, G.Rb - 6, C, C + 4, G.Rb + G.M);
      sh.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = sh;
      g.beginPath();
      g.arc(C, C + 4, G.Rb + G.M, 0, TAU);
      g.arc(C, C, G.Rb - 0.5, 0, TAU);
      g.fill('evenodd');

      const bz = g.createLinearGradient(0, C - G.Rb, 0, C + G.Rb);
      bz.addColorStop(0, 'rgba(36, 44, 74, 0.97)');
      bz.addColorStop(0.5, 'rgba(13, 17, 34, 0.97)');
      bz.addColorStop(1, 'rgba(8, 11, 24, 0.98)');
      g.fillStyle = bz;
      g.beginPath();
      g.arc(C, C, G.Rb, 0, TAU);
      g.arc(C, C, G.Rm, 0, TAU);
      g.fill('evenodd');

      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      g.beginPath();
      g.arc(C, C, G.Rb - 0.5, 0, TAU);
      g.stroke();
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      g.beginPath();
      g.arc(C, C, G.Rm + 0.3, 0, TAU);
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      g.beginPath();
      g.arc(C, C, G.Rm + 1.4, 0, TAU);
      g.stroke();
      // Glass sheen across the top of the bezel.
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      g.beginPath();
      g.arc(C, C, (G.Rb + G.Rm) / 2 - 1, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
      // The Vicehaven sunset, as a thin arc along the bottom of the rim.
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.strokeStyle = sunsetGradient(g, C - G.Rb, 0, C + G.Rb, 0);
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(C, C, G.Rb - 1.2, Math.PI * 0.14, Math.PI * 0.86);
      g.stroke();
      g.globalAlpha = 1;
      return c;
    }

    /** Over the map, under the blips: the edge vignette and the camera's view wedge. */
    _makeOverlay(G, dpr) {
      const c = makeCanvas(G.full * dpr, G.full * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const C = G.c;
      const R = G.Rm;
      const vg = g.createRadialGradient(C, C, R * 0.5, C, C, R);
      vg.addColorStop(0, 'rgba(5, 8, 18, 0)');
      vg.addColorStop(1, 'rgba(5, 8, 18, 0.6)');
      g.fillStyle = vg;
      g.beginPath();
      g.arc(C, C, R, 0, TAU);
      g.fill();
      const L = R * 0.66;
      const half = 0.6;
      const wg = g.createRadialGradient(C, C, 0, C, C, L);
      wg.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
      wg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(C, C);
      g.arc(C, C, L, -Math.PI / 2 - half, -Math.PI / 2 + half);
      g.closePath();
      g.fill();
      return c;
    }

    _makeHeatRing(G, dpr, rgb) {
      const c = makeCanvas(G.full * dpr, G.full * dpr);
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const C = G.c;
      const col = rgb.join(',');
      const r0 = G.Rb - 5;
      const r1 = G.Rb + G.M - 1;
      const q = g.createRadialGradient(C, C, r0, C, C, r1);
      const edge = (G.Rb - r0) / (r1 - r0);
      q.addColorStop(0, 'rgba(' + col + ',0)');
      q.addColorStop(edge, 'rgba(' + col + ',0.75)');
      q.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = q;
      g.beginPath();
      g.arc(C, C, r1, 0, TAU);
      g.arc(C, C, r0, 0, TAU);
      g.fill('evenodd');
      g.lineWidth = 2;
      g.strokeStyle = 'rgb(' + col + ')';
      g.beginPath();
      g.arc(C, C, G.Rb - 1.2, 0, TAU);
      g.stroke();
      return c;
    }

    /** Per frame. Draws the radar (and the full map when it is open). */
    update(dt, state) {
      if (state) this._state = state;
      const st = this._state;
      if (!st) return;
      dt = clamp(dt || 0, 0, 0.25);
      this._t += dt;
      if (typeof st.visible === 'boolean' && st.visible !== this._visible) this.setVisible(st.visible);
      const target = RADAR_R_FOOT + (RADAR_R_FAST - RADAR_R_FOOT) * clamp((st.speed || 0) / RADAR_FAST_SPEED, 0, 1);
      this._radius = VH.math.damp(this._radius, target, 1.6, dt);
      if ((this._reducedCheck -= dt) <= 0) {
        this._reducedCheck = 0.5;
        this._reduced = document.body.classList.contains('reduced-flashing');
      }
      if (this._fullOpen) {
        this._drawFull();
        return;
      }
      if (!this._visible) return;
      this._acc += dt;
      const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
      if (this._acc < RADAR_MIN_INTERVAL && !this._radarDirty && dpr === this._dpr) return;
      this._acc = 0;
      if (this._radarDirty || dpr !== this._dpr) this._resizeRadar(dpr);
      this._drawRadar(st);
    }

    _ensureBlipCapacity(n) {
      if (n <= this._cap) return;
      this._cap = Math.max(16, n * 2);
      this._bx = new Float32Array(this._cap);
      this._by = new Float32Array(this._cap);
      this._bc = new Uint8Array(this._cap);
    }

    _drawRadar(st) {
      const g = this._rg;
      const d = this._dpr;
      const G = this._geo;
      const C = G.c;
      const Rm = G.Rm;
      const t = this._t;
      const px = st.x || 0;
      const pz = st.z || 0;
      const cam = st.camYaw || 0;
      const heading = typeof st.heading === 'number' ? st.heading : cam;
      const k = Rm / this._radius;
      // World → radar (CSS px): rotate by camYaw - PI so the camera looks up.
      const th = cam - Math.PI;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const a = k * cs;
      const b = k * sn;
      const c = -k * sn;
      const dd = k * cs;
      const e = C - (a * px + c * pz);
      const f = C - (b * px + dd * pz);

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this._rc.width, this._rc.height);
      g.setTransform(d, 0, 0, d, 0, 0);
      g.save();
      g.beginPath();
      g.arc(C, C, Rm, 0, TAU);
      g.clip();
      g.fillStyle = PAL.outside;
      g.fillRect(C - Rm, C - Rm, Rm * 2, Rm * 2);

      // The city: one cropped, rotated drawImage.
      const lvl = 1 / (k * d) > 1.05 ? this._base[1] : this._base[0];
      const E = lvl.ext;
      const r = this._radius + 4;
      const x0 = Math.max(E.minX, px - r);
      const x1 = Math.min(E.maxX, px + r);
      const z0 = Math.max(E.minZ, pz - r);
      const z1 = Math.min(E.maxZ, pz + r);
      if (x1 > x0 && z1 > z0) {
        g.setTransform(d * a, d * b, d * c, d * dd, d * e, d * f);
        const s = lvl.s;
        g.drawImage(lvl.canvas, (x0 - E.minX) * s, (z0 - E.minZ) * s, (x1 - x0) * s, (z1 - z0) * s, x0, z0, x1 - x0, z1 - z0);
        g.setTransform(d, 0, 0, d, 0, 0);
      }

      const sa = st.searchArea;
      if (sa && sa.r > 0) this._drawSearch(g, a * sa.x + c * sa.z + e, b * sa.x + dd * sa.z + f, sa.r * k, t);
      if (st.route && st.route.length > 1) this._drawRoute(g, st.route, a, b, c, dd, e, f, 1, t);

      g.drawImage(this._overlay, 0, 0, G.full, G.full);

      // Blips: positions first (clamping the far ones to the rim), then draw by priority.
      const blips = st.blips || [];
      const n = blips.length;
      this._ensureBlipCapacity(n);
      const BX = this._bx;
      const BY = this._by;
      const BC = this._bc;
      const lim = Rm - 7;
      let objective = -1;
      for (let i = 0; i < n; i++) {
        const bl = blips[i];
        let X = a * bl.x + c * bl.z + e;
        let Y = b * bl.x + dd * bl.z + f;
        const dx = X - C;
        const dy = Y - C;
        const d2 = dx * dx + dy * dy;
        BC[i] = 0;
        if (d2 > lim * lim) {
          const q = lim / Math.sqrt(d2);
          X = C + dx * q;
          Y = C + dy * q;
          BC[i] = 1;
        }
        BX[i] = X;
        BY[i] = Y;
        if (bl.type === 'objective' && objective < 0) objective = i;
      }
      for (let p = 0; p <= MAX_PRIORITY; p++) {
        for (let i = 0; i < n; i++) {
          if (BC[i] || (PRIORITY[blips[i].type] || 0) !== p) continue;
          this._drawBlip(g, d, this._spr, blips[i], BX[i], BY[i], 1, i, cam, k, false);
        }
      }
      this._drawRot(g, d, this._spr.player, C, C, cam - heading, 1);
      g.restore();

      // The rim, with the heat glow, compass ticks and the north marker.
      g.drawImage(this._chrome, 0, 0, G.full, G.full);
      const heat = st.heat || 0;
      if (heat > 0) {
        const I = clamp(0.32 + heat * 0.11, 0, 0.9);
        let w = 0.5 + 0.5 * Math.sin(t * TAU * (this._reduced ? 0.3 : 2.1));
        if (!this._reduced) w = w * w * (3 - 2 * w);
        g.globalAlpha = I * w;
        g.drawImage(this._heatR, 0, 0, G.full, G.full);
        g.globalAlpha = I * (1 - w);
        g.drawImage(this._heatB, 0, 0, G.full, G.full);
        g.globalAlpha = 1;
      }
      const nx = -Math.sin(cam);
      const ny = Math.cos(cam);
      g.beginPath();
      for (let i = 1; i < 12; i++) {
        if (i % 3 === 0) continue;
        const ang = (i * Math.PI) / 6;
        const ux = nx * Math.cos(ang) - ny * Math.sin(ang);
        const uy = nx * Math.sin(ang) + ny * Math.cos(ang);
        g.moveTo(C + ux * (Rm + 2.5), C + uy * (Rm + 2.5));
        g.lineTo(C + ux * (Rm + 5), C + uy * (Rm + 5));
      }
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      g.stroke();
      const mid = (Rm + G.Rb) / 2;
      g.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for (let i = 1; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const ux = nx * Math.cos(ang) - ny * Math.sin(ang);
        const uy = nx * Math.sin(ang) + ny * Math.cos(ang);
        g.beginPath();
        g.arc(C + ux * mid, C + uy * mid, 1.5, 0, TAU);
        g.fill();
      }
      const N = this._spr.north;
      g.drawImage(N.canvas, C + nx * mid - N.size / 2, C + ny * mid - N.size / 2, N.size, N.size);

      // Off-radar blips ride the rim.
      for (let p = 0; p <= MAX_PRIORITY; p++) {
        for (let i = 0; i < n; i++) {
          // noRim: lots of the same thing (shops, parked aircraft) shows on the
          // radar only when near, though the full map shows them all.
          if (!BC[i] || blips[i].noRim || (PRIORITY[blips[i].type] || 0) !== p) continue;
          this._drawBlip(g, d, this._spr, blips[i], BX[i], BY[i], blips[i].type === 'objective' || blips[i].type === 'mission' ? 0.95 : 0.78, i, cam, k, true);
        }
      }
      if (objective >= 0 && BC[objective]) {
        const ob = blips[objective];
        const dist = Math.hypot(ob.x - px, ob.z - pz);
        const X = BX[objective];
        const Y = BY[objective];
        const dx = C - X;
        const dy = C - Y;
        const l = Math.hypot(dx, dy) || 1;
        this._drawPill(g, formatDistance(dist), X + (dx / l) * 21, Y + (dy / l) * 17);
      }
    }

    _drawSearch(g, X, Y, R, t) {
      // Red, then blue, then red...; each colour swells and fades so the switch never looks muddy.
      const phase = (t * (this._reduced ? 0.25 : 0.8)) % 1;
      const rgb = (phase < 0.5 ? POLICE_RED : POLICE_BLUE).join(',');
      const swell = Math.sin(((phase % 0.5) / 0.5) * Math.PI);
      g.fillStyle = 'rgba(' + rgb + ',' + (0.09 + 0.13 * swell).toFixed(3) + ')';
      g.beginPath();
      g.arc(X, Y, R, 0, TAU);
      g.fill();
      g.setLineDash(DASH_SEARCH);
      g.lineDashOffset = -t * 14;
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(' + rgb + ',' + (0.5 + 0.45 * swell).toFixed(3) + ')';
      g.stroke();
      g.setLineDash(NO_DASH);
      if (!this._reduced) {
        const ping = (phase % 0.5) / 0.5; // one ping per colour
        g.lineWidth = 1.2;
        g.strokeStyle = 'rgba(' + rgb + ',' + (0.55 * (1 - ping)).toFixed(3) + ')';
        g.beginPath();
        g.arc(X, Y, R * (0.15 + 0.85 * ping), 0, TAU);
        g.stroke();
      }
    }

    _drawRoute(g, route, a, b, c, dd, e, f, scale, t) {
      g.beginPath();
      let sx = 0;
      let sy = 0;
      let ex = 0;
      let ey = 0;
      for (let i = 0; i < route.length; i++) {
        const p = route[i];
        const X = a * p[0] + c * p[1] + e;
        const Y = b * p[0] + dd * p[1] + f;
        if (i === 0) {
          g.moveTo(X, Y);
          sx = X;
          sy = Y;
        } else g.lineTo(X, Y);
        ex = X;
        ey = Y;
      }
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255, 79, 139, 0.22)';
      g.lineWidth = 12 * scale;
      g.stroke();
      g.strokeStyle = 'rgba(255, 110, 140, 0.4)';
      g.lineWidth = 7 * scale;
      g.stroke();
      g.strokeStyle = 'rgba(40, 8, 20, 0.55)';
      g.lineWidth = 5.4 * scale;
      g.stroke();
      const grad = g.createLinearGradient(sx, sy, ex === sx && ey === sy ? ex + 1 : ex, ey);
      grad.addColorStop(0, '#ffb347');
      grad.addColorStop(0.5, '#ff7a6a');
      grad.addColorStop(1, '#ff4f8b');
      g.strokeStyle = grad;
      g.lineWidth = 3.8 * scale;
      g.stroke();
      g.setLineDash(DASH_ROUTE);
      g.lineDashOffset = -t * 24;
      g.strokeStyle = 'rgba(255, 244, 236, 0.95)';
      g.lineWidth = 1.5 * scale;
      g.stroke();
      g.setLineDash(NO_DASH);
      g.lineCap = 'butt';
    }

    /**
     * One blip. `rot0` turns a world heading into a screen rotation (the
     * camera yaw on the radar, PI on the north-up map); `k` is px per metre.
     */
    _drawBlip(g, d, spr, bl, X, Y, scale, i, rot0, k, clamped) {
      const t = this._fullOpen ? performance.now() / 1000 : this._t;
      const type = bl.type;
      let sprite = spr[type];
      let rotate = false;
      if (type === 'police') {
        const rate = this._reduced ? 1 : 4;
        const red = (((t * rate + i * 0.5) | 0) & 1) === 0;
        sprite = red ? spr.police_r : spr.police_b;
        if (typeof bl.heading === 'number' && !clamped) {
          const cone = red ? spr.coneR : spr.coneB;
          const L = POLICE_CONE.range * k;
          const W = L * cone.aspect;
          const rho = rot0 - bl.heading;
          const cs = Math.cos(rho) * d;
          const sn = Math.sin(rho) * d;
          g.setTransform(cs, sn, -sn, cs, X * d, Y * d);
          g.drawImage(cone.canvas, -W / 2, -L, W, L);
          g.setTransform(d, 0, 0, d, 0, 0);
        }
      } else if ((type === 'car' || type === 'plane' || type === 'heli' || type === 'tank') && typeof bl.heading === 'number') {
        rotate = true;
      }
      if (!sprite) sprite = spr.mission;
      let alpha = clamped && type !== 'objective' && type !== 'mission' ? 0.85 : 1;
      if (bl.flash && type !== 'police') alpha *= 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * TAU * (this._reduced ? 0.8 : 2.6)));
      if (type === 'objective' && !this._reduced) scale *= 1 + 0.08 * Math.sin(t * TAU * 1.2);
      g.globalAlpha = alpha;
      if (rotate) this._drawRot(g, d, sprite, X, Y, rot0 - bl.heading, scale);
      else {
        const s = sprite.size * scale;
        g.drawImage(sprite.canvas, X - s / 2, Y - s / 2, s, s);
      }
      g.globalAlpha = 1;
    }

    _drawRot(g, d, sprite, X, Y, rho, scale) {
      const cs = Math.cos(rho) * d;
      const sn = Math.sin(rho) * d;
      g.setTransform(cs, sn, -sn, cs, X * d, Y * d);
      const s = sprite.size * scale;
      g.drawImage(sprite.canvas, -s / 2, -s / 2, s, s);
      g.setTransform(d, 0, 0, d, 0, 0);
    }

    /** measureText, cached (per font) for the strings drawn every frame. */
    _measure(g, text) {
      const key = g.font + '|' + text;
      let w = this._textW.get(key);
      if (w === undefined) {
        w = g.measureText(text).width;
        if (this._textW.size > 400) this._textW.clear();
        this._textW.set(key, w);
      }
      return w;
    }

    _drawPill(g, text, X, Y) {
      g.font = '700 10px ' + FONT;
      setSpacing(g, 0.5);
      const w = this._measure(g, text) + 11;
      const h = 15;
      roundRectPath(g, X - w / 2, Y - h / 2, w, h, h / 2);
      g.fillStyle = 'rgba(9, 13, 26, 0.92)';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 122, 89, 0.9)';
      g.stroke();
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, X, Y + 0.5);
      setSpacing(g, 0);
    }

    // --------------------------------------------------------- full map
    // The full-screen map lives in js/mapview.js; these keep the old API.
    get isFullOpen() {
      return !!(this.view && this.view.open);
    }

    openFull() {
      if (this.view) this.view.openFull();
    }

    closeFull() {
      if (this.view) this.view.closeFull();
      this._acc = 1;
    }

    toggleFull() {
      if (this.isFullOpen) this.closeFull();
      else this.openFull();
    }

    /** Per frame while the full map is open (pad: the game's gamepad state, for map controls). */
    updateFull(state, dt, pad) {
      if (state) this._state = state;
      if (this.view) this.view.frame(state, dt, pad);
    }

    /** Relabel the close hint if the player rebinds the map key. */
    setCloseKey(label) {
      this.opts.closeKey = label;
      if (this.view) this.view.setCloseKey(label);
    }

    /** The player's map pins, as blips (the radar shows them too). */
    pinBlips(out) {
      if (this.view) this.view.pinBlips(out);
    }

    destroy() {
      window.removeEventListener('resize', this._onResize);
      if (this._ro) this._ro.disconnect();
      if (this._panelRo) this._panelRo.disconnect();
      if (this.view) this.view.destroy();
      document.body.classList.remove('map-open');
      this.radarEl.remove();
    }
  }

  Minimap.route = route;
  Minimap.formatDistance = formatDistance;
  VH.Minimap = Minimap;

  // What the full-screen map (js/mapview.js) shares with the radar.
  VH.MapKit = {
    PAL, LEGEND, PRIORITY,
    font: () => FONT,
    buildSprites, paintCity, noisePattern, extentsOf, openDistrictSpots, route,
    formatDistance, sunsetGradient, setSpacing, setStretch, roundRectPath, makeCanvas, tintOf, hexRgb,
  };
})();
