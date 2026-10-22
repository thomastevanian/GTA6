/*
 * signs.js — paints sign faces (text and artwork) onto canvases.
 *
 * A sign spec is { w, h (metres), lines: [...], style }. The first line is
 * the headline; later lines are smaller. Styles give each kind of sign its
 * own look: bronze plaques, wayfinding boards, neon, the city welcome sign,
 * and green road direction signs ('road': one destination per row, arrows
 * from leading or trailing arrow characters, a distance after '|').
 */
(function () {
  'use strict';

  const VH = window.VH;
  const FONT = "'Bahnschrift', 'Segoe UI', 'Arial Narrow', Arial, sans-serif";
  const SERIF = "Georgia, 'Times New Roman', serif";

  const STYLES = {
    plaque: { bg: ['#5e4526', '#8d6c3c'], fg: '#f3e7c9', font: SERIF, border: '#c9a45c', weight: '700' },
    info: { bg: ['#132338', '#1c3350'], fg: '#ffffff', font: FONT, bar: '#35e0d0', weight: '700' },
    welcome: { bg: ['#ffb347', '#ff4f8b', '#5b2a86'], fg: '#ffffff', font: FONT, weight: '800', shadow: 'rgba(40,0,40,0.55)' },
    brand: { bg: ['#d93a33', '#a8231f'], fg: '#ffffff', font: FONT, weight: '800', italic: true },
    park: { bg: ['#2c4a31', '#36583b'], fg: '#f1e8cf', font: SERIF, border: '#e9dcb8', weight: '700' },
    monolith: { bg: ['#1d2126', '#2b3037'], fg: '#dfe5ea', font: FONT, weight: '600', spacing: 0.22 },
    neon: { bg: ['#0b0d18', '#141729'], fg: '#ff5c95', font: FONT, weight: '700', glow: '#ff2d78', outline: '#48f0e0' },
    // Brown tourist signs are this with colors: { bg: [...] }.
    road: { bg: ['#0f7c45', '#0b6a3a'], fg: '#ffffff', font: FONT, border: '#ffffff', weight: '700' },
  };

  function fitFont(ctx, text, family, weight, italic, maxWidth, maxSize) {
    let size = maxSize;
    for (let i = 0; i < 20; i++) {
      ctx.font = (italic ? 'italic ' : '') + weight + ' ' + size + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) break;
      size *= 0.92;
    }
    return size;
  }

  // ------------------------------------------------------------- road signs
  // Arrow characters and the way each one points (degrees clockwise from up).
  const ARROWS = { '↑': 0, '↗': 45, '→': 90, '↘': 135, '↓': 180, '↙': 225, '←': 270, '↖': 315 };
  // An arrow pointing up in a unit box: head, then shaft.
  const ARROW_PTS = [[0, -0.5], [0.42, -0.04], [0.14, -0.04], [0.14, 0.5], [-0.14, 0.5], [-0.14, -0.04], [-0.42, -0.04]];
  // An aircraft seen from above, nose up (right half; mirrored for the left).
  const PLANE_HALF = [[0, -0.5], [0.06, -0.43], [0.065, -0.13], [0.48, 0.1], [0.48, 0.19], [0.065, 0.07], [0.05, 0.3], [0.2, 0.41], [0.2, 0.48], [0, 0.44]];
  const PLANE_PTS = PLANE_HALF.concat(PLANE_HALF.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
  const PLANE = '✈';

  /** Fill a unit-box shape centred at (cx, cy), `size` across, turned `deg` clockwise. */
  function shape(g, pts, cx, cy, size, deg) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const px = cx + (x * c - y * s) * size;
      const py = cy + (x * s + y * c) * size;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
  }

  /** Split one sign row into its parts: '← Old Market', '↑ AIRPORT ✈ | 1.1 km', 'Cargo →'. */
  function parseRow(line) {
    let text = String(line).trim();
    let dist = '';
    const bar = text.indexOf('|');
    if (bar >= 0) {
      dist = text.slice(bar + 1).trim();
      text = text.slice(0, bar).trim();
    }
    let lead = null;
    let trail = null;
    if (text[0] in ARROWS) {
      lead = ARROWS[text[0]];
      text = text.slice(1).trim();
    }
    if (text.length && text[text.length - 1] in ARROWS) {
      trail = ARROWS[text[text.length - 1]];
      text = text.slice(0, -1).trim();
    }
    return { text, dist, lead, trail };
  }

  /** Width of text in the current font, with each ✈ drawn as a pictogram `size` wide. */
  function richWidth(g, text, size) {
    let w = 0;
    text.split(PLANE).forEach((part, i) => {
      if (i) w += size * 1.05;
      w += g.measureText(part).width;
    });
    return w;
  }

  function richText(g, text, x, y, size) {
    text.split(PLANE).forEach((part, i) => {
      if (i) {
        shape(g, PLANE_PTS, x + size * 0.5, y, size * 0.95, 45);
        x += size * 1.05;
      }
      g.fillText(part, x, y);
      x += g.measureText(part).width;
    });
  }

  /**
   * A green (or brown) direction sign: a thin white border, one destination
   * per row, arrows drawn as shapes, distances right-aligned. A rule
   * separates rows that point different ways.
   */
  function roadFace(g, W, H, lines, style) {
    const border = Math.max(2, Math.round(H * 0.012));
    const inset = Math.max(3, Math.round(H * 0.035));
    g.strokeStyle = style.border || style.fg;
    g.lineWidth = border;
    g.beginPath();
    if (g.roundRect) g.roundRect(inset, inset, W - inset * 2, H - inset * 2, H * 0.05);
    else g.rect(inset, inset, W - inset * 2, H - inset * 2);
    g.stroke();

    const rows = lines.map(parseRow);
    const m = inset + border + H * 0.035; // inner margin
    const rowH = (H - m * 2) / rows.length;
    const cell = Math.min(rowH * 0.78, H * 0.3); // arrow box
    const gap = cell * 0.28;
    const anyLead = rows.some((r) => r.lead !== null);
    const left = m + (anyLead ? cell + gap : gap * 0.5);
    const base = Math.min(rowH * 0.6, H * 0.24); // letter size
    g.fillStyle = style.fg;
    g.textBaseline = 'middle';
    const fontOf = (size, weight) => weight + ' ' + Math.round(size) + 'px ' + style.font;

    rows.forEach((r, i) => {
      const cy = m + rowH * (i + 0.5);
      if (i > 0 && dirKey(rows[i - 1]) !== dirKey(r)) {
        g.fillRect(m, m + rowH * i - border * 0.35, W - m * 2, Math.max(1, border * 0.7));
      }
      if (r.lead !== null) shape(g, ARROW_PTS, m + cell / 2, cy, cell * (r.lead % 90 ? 0.88 : 1), r.lead);
      let right = W - m;
      if (r.trail !== null) {
        shape(g, ARROW_PTS, right - cell / 2, cy, cell * (r.trail % 90 ? 0.88 : 1), r.trail);
        right -= cell + gap;
      } else {
        right -= gap * 0.5;
      }
      if (r.dist) {
        const ds = base * 0.78;
        g.font = fontOf(ds, '600');
        g.textAlign = 'right';
        g.fillText(r.dist, right, cy + ds * 0.04);
        right -= g.measureText(r.dist).width + gap * 1.2;
      }
      if (!r.text) return;
      // Shrink to fit, then left-align (right-align beside a lone right arrow).
      let size = base;
      g.font = fontOf(size, style.weight);
      const room = right - left;
      const w0 = richWidth(g, r.text, size);
      if (w0 > room) {
        size = Math.max(base * 0.45, (size * room) / w0);
        g.font = fontOf(size, style.weight);
      }
      g.textAlign = 'left';
      const w = richWidth(g, r.text, size);
      const x = r.trail !== null && r.lead === null && !r.dist ? right - w : left;
      richText(g, r.text, x, cy + size * 0.04, size);
    });
  }

  /** Rows pointing the same way share a group (no rule between them). */
  function dirKey(r) {
    return r.lead !== null ? 'l' + r.lead : r.trail !== null ? 't' + r.trail : 'none';
  }

  function texture(canvas, anisotropy) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy || 4;
    tex.needsUpdate = true;
    return tex;
  }

  function paint(spec, anisotropy) {
    // A spec may recolour its style (a shop chain's own colours): { colors: { bg: [...], fg } }.
    const style = spec.colors ? Object.assign({}, STYLES[spec.style] || STYLES.info, spec.colors) : STYLES[spec.style] || STYLES.info;
    const ppm = 120;
    let W = Math.round(spec.w * ppm);
    let H = Math.round(spec.h * ppm);
    const scale = Math.min(1, 1024 / W, 512 / H);
    W = Math.max(64, Math.round(W * scale));
    H = Math.max(32, Math.round(H * scale));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');

    // Background.
    const grad = g.createLinearGradient(0, 0, spec.style === 'welcome' ? W : 0, spec.style === 'welcome' ? 0 : H);
    style.bg.forEach((c, i) => grad.addColorStop(style.bg.length === 1 ? 0 : i / (style.bg.length - 1), c));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    if (spec.style === 'road') {
      roadFace(g, W, H, spec.lines, style);
      return texture(canvas, anisotropy);
    }

    const pad = Math.round(Math.min(W, H) * 0.08);
    if (style.border) {
      g.strokeStyle = style.border;
      g.lineWidth = Math.max(2, H * 0.03);
      g.strokeRect(pad * 0.5, pad * 0.5, W - pad, H - pad);
    }
    if (style.bar) {
      g.fillStyle = style.bar;
      g.fillRect(0, 0, W, Math.max(4, H * 0.06));
    }
    if (spec.style === 'welcome') {
      // A sun setting into the sea behind the lettering.
      g.fillStyle = 'rgba(255, 236, 170, 0.55)';
      g.beginPath();
      g.arc(W * 0.5, H * 0.95, H * 0.62, Math.PI, 0);
      g.fill();
      g.fillStyle = 'rgba(40, 10, 60, 0.35)';
      for (let i = 0; i < 5; i++) g.fillRect(0, H * (0.78 + i * 0.045), W, H * 0.018);
    }

    // Text.
    const lines = spec.lines;
    const head = lines[0];
    const rest = lines.slice(1);
    const textW = W - pad * 2.4;
    const headShare = rest.length ? 0.5 : 0.72;
    const headSize = fitFont(g, head, style.font, style.weight, style.italic, textW, H * headShare);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const drawText = (text, size, y, weight) => {
      g.font = (style.italic ? 'italic ' : '') + weight + ' ' + size + 'px ' + style.font;
      if (style.spacing && 'letterSpacing' in g) g.letterSpacing = Math.round(size * style.spacing) + 'px';
      if (style.glow) {
        g.shadowColor = style.glow;
        g.shadowBlur = size * 0.35;
      } else if (style.shadow) {
        g.shadowColor = style.shadow;
        g.shadowBlur = size * 0.12;
        g.shadowOffsetY = size * 0.06;
      }
      if (style.outline) {
        g.strokeStyle = style.outline;
        g.lineWidth = Math.max(1.5, size * 0.05);
        g.strokeText(text, W / 2, y);
      }
      g.fillStyle = style.fg;
      g.fillText(text, W / 2, y);
      g.shadowBlur = 0;
      g.shadowOffsetY = 0;
    };

    if (spec.style === 'welcome' && rest.length === 0 && lines.length === 1) {
      drawText(head, headSize, H / 2, style.weight);
    } else if (spec.style === 'welcome') {
      // "WELCOME TO" small above a huge "VICEHAVEN".
      const small = fitFont(g, head, style.font, '600', false, textW * 0.6, H * 0.2);
      drawText(head, small, H * 0.24, '600');
      const big = fitFont(g, rest[0], style.font, style.weight, false, textW, H * 0.55);
      drawText(rest[0], big, H * 0.6, style.weight);
    } else {
      const restSize = rest.length ? Math.min(headSize * 0.52, (H * (1 - headShare) - pad) / rest.length) : 0;
      const block = headSize + rest.length * restSize * 1.25;
      let y = (H - block) / 2 + headSize / 2 + (style.bar ? H * 0.03 : 0);
      drawText(head, headSize, y, style.weight);
      y += headSize / 2 + restSize * 0.8;
      for (const line of rest) {
        const s = fitFont(g, line, style.font, '500', style.italic, textW, restSize);
        drawText(line, s, y, '500');
        y += restSize * 1.25;
      }
    }

    return texture(canvas, anisotropy);
  }

  VH.Signs = { paint, STYLES };
})();
