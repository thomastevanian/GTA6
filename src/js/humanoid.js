/*
 * humanoid.js — a jointed, procedurally modelled and animated person.
 *
 * Used for Jay Mercer and for every pedestrian, cop, soldier and gangster, so
 * appearance is data (a "look": colours, hair, build, outfit) and animation is
 * driven by a small state object rather than by keyframes.
 *
 * Rig (character faces +Z, feet at the origin):
 *
 *   root ─ pelvis ─┬─ spine ─┬─ neck ─ head
 *                  │         ├─ shoulderL ─ elbowL ─ hand
 *                  │         └─ shoulderR ─ elbowR ─ hand
 *                  ├─ hipL ─ kneeL ─ ankleL
 *                  └─ hipR ─ kneeR ─ ankleR
 *
 * Joint angles: positive rotation.x swings a hanging limb backwards, so
 * the gait code works in "forward = positive" terms and negates.
 *
 * Bodies: every part is a smooth lathe/loft ("tube" of elliptical rings),
 * an ellipsoid, a path tube or a small box, written into one blueprint with
 * per-vertex slot ids (which colour: skin, hair, top, ...) and a baked
 * ambient-occlusion shade. The blueprint holds *all* optional features
 * (hair styles, hats, glasses, jackets, skirts, boots ...), each tagged with
 * a feature id. A Humanoid keeps only the features its look asks for and
 * merges them into a few vertex-coloured meshes; the instanced crowd uploads
 * the whole blueprint once and hides the features an instance lacks in the
 * vertex shader (see crowdShader()).
 *
 * Look fields (all optional; old looks keep working):
 *   skin hair top trim shirt bottom shoes (sRGB hex), cap, longHair, bag,
 *   height, build, and the new
 *   hairStyle  bald short long buzz pony afro mohawk bob
 *   hat        none cap helmet beanie police bandana
 *   outfit     tee shirt jacket hoodie tank cop soldier polo
 *   bottomStyle jeans shorts skirt     shoeStyle sneaker boot dress
 *   beard (true | 'full' | 'stubble'), mustache, glasses (true | 'sun'), tattoo
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { damp, smoothstep, clamp } = VH.math;

  // At night people glow very faintly in their own colours, so Jay and the
  // cast stay readable away from street lamps (a common game-lighting cheat).
  const NIGHT_FILL = { value: 0 };
  /** 0 by day; the environment raises it after dark. */
  function setNightFill(k) {
    if (Math.abs(k - NIGHT_FILL.value) < 0.002) return;
    NIGHT_FILL.value = k;
  }

  /** Jay Mercer's default outfit. Colours are sRGB hex. */
  // Jay: a worn brown leather driving jacket over a grey tee, dark jeans,
  // off-white sneakers scuffed on the right toe from the pedal.
  const JAY_LOOK = {
    skin: 0xa86b4c,
    hair: 0x1b1512,
    jacket: 0x6b4a32,
    jacketTrim: 0x3a2718,
    shirt: 0x8d9094,
    pants: 0x2c3440,
    shoes: 0xe6e1d6,
    sole: 0xb08a5c,
    belt: 0x2a2320,
    watch: 0x9aa3ab,
    outfit: 'jacket',
    hairStyle: 'short',
    beard: 'stubble',
    bottomStyle: 'jeans',
    shoeStyle: 'sneaker',
    leather: true,
  };

  // ------------------------------------------------------------------ styles
  const HAIR = { bald: 0, short: 1, long: 2, buzz: 3, pony: 4, afro: 5, mohawk: 6, bob: 7 };
  const HAT = { none: 0, cap: 1, helmet: 2, beanie: 3, police: 4, bandana: 5 };
  const TOP = { tee: 0, shirt: 1, jacket: 2, hoodie: 3, tank: 4, cop: 5, soldier: 6, polo: 7 };
  const BOT = { jeans: 0, shorts: 1, skirt: 2 };
  const SHOE = { sneaker: 0, boot: 1, dress: 2 };
  const FLAG = { bag: 1, glasses: 2, sunglasses: 4, beard: 8, mustache: 16, tattoo: 32, stubble: 64 };

  function hashLook(L) {
    let h = 2166136261;
    const mix = (v) => {
      h ^= (v || 0) & 0xffffff;
      h = Math.imul(h, 16777619);
      h ^= h >>> 13;
    };
    mix(L.skin); mix(L.hair); mix(L.top !== undefined ? L.top : L.jacket); mix(L.bottom !== undefined ? L.bottom : L.pants); mix(L.shoes); mix(L.shirt);
    return h >>> 0;
  }
  function code(table, v, dflt) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && table[v] !== undefined) return table[v];
    return dflt;
  }

  /**
   * Resolve a look (and the faction of whoever wears it) into the compact
   * style the geometry and the crowd shader use. Looks without the new
   * fields get a stable, hash-derived variety, so a given person never changes.
   */
  function styleOf(L, faction) {
    const h = hashLook(L);
    const rnd = (k) => (((h >>> ((k * 5) % 24)) ^ Math.imul(h, 2654435761 + k * 977)) >>> 0) % 1000 / 1000;
    const fac = faction || L.faction || 'civilian';
    const cop = fac === 'police' || fac === 'vpd';
    const army = fac === 'army';
    const civ = fac === 'civilian' || fac === 'ambient' || fac === 'story' || fac === 'crew';
    const thug = !cop && !army && !civ;
    const female = !!L.longHair && L.hairStyle === undefined ? rnd(1) < 0.8 : L.hairStyle === 'long' || L.hairStyle === 'bob';

    // Outfit.
    let O = code(TOP, L.outfit, undefined);
    if (O === undefined) {
      if (cop) O = TOP.cop;
      else if (army) O = TOP.soldier;
      else if (thug) O = rnd(2) < 0.55 ? TOP.tank : TOP.hoodie;
      else {
        const r = rnd(2);
        O = r < 0.34 ? TOP.tee : r < 0.52 ? TOP.shirt : r < 0.66 ? TOP.jacket : r < 0.78 ? TOP.hoodie : r < 0.88 ? TOP.polo : r < 0.94 ? TOP.tank : TOP.tee;
      }
    }
    let B = code(BOT, L.bottomStyle, undefined);
    if (B === undefined) {
      if (cop || army) B = BOT.jeans;
      else {
        const r = rnd(3);
        B = female && r < 0.4 ? BOT.skirt : r < 0.2 ? BOT.shorts : BOT.jeans;
      }
    }
    let SH = code(SHOE, L.shoeStyle, undefined);
    if (SH === undefined) SH = cop ? SHOE.dress : army ? SHOE.boot : (() => { const r = rnd(4); return r < 0.6 ? SHOE.sneaker : r < 0.8 ? SHOE.dress : SHOE.boot; })();

    // Hat.
    let hat = code(HAT, L.hat, undefined);
    if (hat === undefined) {
      if (L.cap) hat = cop ? HAT.police : army ? HAT.helmet : thug && rnd(5) < 0.4 ? HAT.bandana : rnd(6) < 0.2 ? HAT.beanie : HAT.cap;
      else hat = HAT.none;
    }
    // Hair.
    let hair = code(HAIR, L.hairStyle, undefined);
    if (hair === undefined) {
      if (L.longHair) hair = rnd(7) < 0.2 ? HAIR.pony : rnd(8) < 0.25 ? HAIR.bob : HAIR.long;
      else if (cop || army) hair = HAIR.buzz;
      else {
        const r = rnd(7);
        hair = r < 0.55 ? HAIR.short : r < 0.7 ? HAIR.buzz : r < 0.8 ? HAIR.bald : r < 0.88 ? HAIR.pony : r < 0.95 ? HAIR.afro : HAIR.mohawk;
      }
    }
    // A hat leaves no room for a tall hairdo.
    if (hat !== HAT.none && hat !== HAT.bandana) {
      if (hair === HAIR.afro) hair = HAIR.short;
      if (hair === HAIR.mohawk) hair = HAIR.buzz;
    }
    if (hat === HAT.bandana && (hair === HAIR.afro || hair === HAIR.mohawk)) hair = HAIR.short;

    // Flags.
    let fl = 0;
    if (L.bag) fl |= FLAG.bag;
    const male = !female;
    if (L.beard === 'stubble') fl |= FLAG.stubble;
    else if (L.beard) fl |= FLAG.beard;
    else if (L.beard === undefined && male && !cop && rnd(9) < 0.2) fl |= rnd(10) < 0.45 ? FLAG.stubble : FLAG.beard;
    if (L.mustache || (L.mustache === undefined && male && !(fl & FLAG.beard) && rnd(11) < 0.07)) fl |= FLAG.mustache;
    if (L.glasses === 'sun') fl |= FLAG.sunglasses;
    else if (L.glasses) fl |= FLAG.glasses;
    else if (L.glasses === undefined) {
      const r = rnd(12);
      if (r < 0.1) fl |= FLAG.glasses;
      else if (!army && (r < 0.17 || (cop && r < 0.3))) fl |= FLAG.sunglasses;
    }
    if (L.tattoo || (L.tattoo === undefined && thug && rnd(13) < 0.75) || (L.tattoo === undefined && O === TOP.tank && rnd(14) < 0.3)) fl |= FLAG.tattoo;
    if (hair === HAIR.bald && !(fl & (FLAG.beard | FLAG.stubble)) && rnd(15) < 0.5) fl |= FLAG.beard;
    return { hat, hair, fl, O, B, SH, fac };
  }

  // -------------------------------------------------------- feature table
  // Each feature is a boolean expression over the style (hat, hair, O, B, SH,
  // F(flag), NEAR) written in the common subset of JS and GLSL.
  const FEATS = [
    ['near', 'NEAR'],
    ['hatCap', 'hat==1'], ['hatHelmet', 'hat==2'], ['hatBeanie', 'hat==3'], ['hatPolice', 'hat==4'], ['hatBand', 'hat==5'],
    ['hairShort', 'hair==1'], ['hairLong', 'hair==2'], ['hairBuzz', 'hair==3'], ['hairPony', 'hair==4'], ['hairAfro', 'hair==5'], ['hairMohawk', 'hair==6'], ['hairBob', 'hair==7'],
    ['bag', 'F(1)'], ['glasses', 'F(2)'], ['sunglasses', 'F(4)'], ['beard', 'F(8)'], ['mustache', 'F(16)'], ['tattoo', 'F(32)'], ['stubble', 'F(64)'],
    ['mouth', 'NEAR&&!F(8)'], ['mouthBeard', 'NEAR&&F(8)'],
    ['oTee', 'O==0'], ['oShirt', 'O==1'], ['oJacket', 'O==2'], ['oHoodie', 'O==3'], ['oTank', 'O==4'], ['oCop', 'O==5'], ['oSoldier', 'O==6'], ['oPolo', 'O==7'],
    ['collar', 'O==1||O==7||O==5'], ['cuffs', 'O==1||O==2||O==3||O==5||O==6'], ['neckBand', 'O==0||O==3||O==4'], ['belt', 'O!=5&&O!=6'],
    ['bJeans', 'B==0'], ['bShorts', 'B==1'], ['bSkirt', 'B==2'], ['pockets', 'B==0&&O!=5&&O!=6'],
    ['shSneaker', 'SH==0'], ['shBoot', 'SH==1'], ['shDress', 'SH==2'], ['watch', 'false'],
  ];
  const FEAT_ID = {};
  FEATS.forEach((f, i) => { FEAT_ID[f[0]] = i + 1; });
  const featFns = FEATS.map((f) => new Function('hat', 'hair', 'O', 'B', 'SH', 'F', 'NEAR', 'return !!(' + f[1] + ');'));
  /** Is feature id `id` present for style `st`? (id 0 = always) */
  function featOn(id, st) {
    if (!id) return true;
    return featFns[id - 1](st.hat, st.hair, st.O, st.B, st.SH, (b) => (st.fl & b) !== 0, true);
  }

  // ---------------------------------------------------------------- slots
  // What each vertex is made of. The crowd shader mirrors slotColor() below.
  const SLOT = {
    skin: 0, hair: 1, top: 2, trim: 3, shirt: 4, bottom: 5, belt: 6, shoes: 7, sole: 8, dark: 9, stubble: 10, metal: 11,
    cap: 12, bag: 14, eyeW: 15, iris: 16, lip: 17, tattoo: 18, lens: 19, brow: 20, badge: 21, bandana: 22, vest: 23,
    sleeveS: 24, sleeveL: 25, thighU: 26, legL: 27,
  };
  // Material class of a slot (non-instanced bodies).
  const SLOT_CLASS = [];
  SLOT_CLASS[SLOT.skin] = 'skin'; SLOT_CLASS[SLOT.lip] = 'skin'; SLOT_CLASS[SLOT.tattoo] = 'skin'; SLOT_CLASS[SLOT.stubble] = 'skin';
  SLOT_CLASS[SLOT.hair] = 'hair'; SLOT_CLASS[SLOT.brow] = 'hair';
  SLOT_CLASS[SLOT.shoes] = 'shoe'; SLOT_CLASS[SLOT.metal] = 'metal'; SLOT_CLASS[SLOT.badge] = 'metal';
  SLOT_CLASS[SLOT.lens] = 'glass'; SLOT_CLASS[SLOT.eyeW] = 'eye'; SLOT_CLASS[SLOT.iris] = 'eye';
  SLOT_CLASS[SLOT.belt] = 'shoe';
  const CLASS_PROPS = {
    skin: [0.56, 0], cloth: [0.86, 0], leather: [0.5, 0], shoe: [0.38, 0], hair: [0.72, 0],
    metal: [0.3, 0.85], glass: [0.06, 0.2], eye: [0.12, 0],
  };

  function pal(L) {
    const C = (hex) => new THREE.Color(hex);
    const top = C(L.top !== undefined ? L.top : L.jacket);
    const o = {
      skin: C(L.skin), hair: C(L.hair), top, shirt: C(L.shirt), bottom: C(L.bottom !== undefined ? L.bottom : L.pants),
      shoes: C(L.shoes), sole: C(L.sole !== undefined ? L.sole : 0xd8d2c4),
    };
    const trimHex = L.trim !== undefined ? L.trim : L.jacketTrim;
    o.trim = trimHex !== undefined && trimHex !== (L.top !== undefined ? L.top : L.jacket) ? C(trimHex) : top.clone().multiplyScalar(0.55);
    o.belt = L.belt !== undefined ? C(L.belt) : new THREE.Color(0.03, 0.025, 0.02);
    return o;
  }
  /** Linear colour of a slot for a palette + style. */
  function slotColor(slot, P, st, out) {
    const S = st.O === TOP.tank ? 0 : st.O === TOP.tee || st.O === TOP.polo ? 1 : 2;
    const k = (r, g, b) => out.setRGB(r, g, b);
    const mulc = (c, r, g, b) => out.setRGB(c.r * r, c.g * g, c.b * b);
    switch (slot) {
      case 0: return out.copy(P.skin);
      case 1: return out.copy(P.hair);
      case 2: return out.copy(P.top);
      case 3: return out.copy(P.trim);
      case 4: return out.copy(P.shirt);
      case 5: return out.copy(P.bottom);
      case 6: return out.copy(P.belt);
      case 7: return out.copy(P.shoes);
      case 8: return out.copy(P.sole);
      case 9: return k(0.012, 0.012, 0.012);
      case 10: return mulc(P.skin, 0.86, 0.86, 0.86);
      case 11: return k(0.3, 0.3, 0.3);
      case 12: return mulc(P.top, 0.8, 0.8, 0.8);
      case 14: return mulc(P.shoes, 0.5, 0.5, 0.5).addScalar(0.03);
      case 15: return k(0.78, 0.76, 0.72);
      case 16: return k(0.05, 0.03, 0.02);
      case 17: return mulc(P.skin, 0.85, 0.62, 0.6);
      case 18: return mulc(P.skin, 0.35, 0.4, 0.55);
      case 19: return k(0.01, 0.014, 0.02);
      case 20: return mulc(P.hair, 0.9, 0.9, 0.9);
      case 21: return k(0.75, 0.55, 0.12);
      case 22: return out.copy(P.shirt);
      case 23: return mulc(P.top, 0.78, 0.78, 0.78).addScalar(0.01);
      case 24: return S >= 1 ? out.copy(P.top) : out.copy(P.skin);
      case 25: return S >= 2 ? out.copy(P.top) : out.copy(P.skin);
      case 26: return st.B === BOT.skirt ? out.copy(P.skin) : out.copy(P.bottom);
      case 27: return st.B === BOT.jeans ? out.copy(P.bottom) : out.copy(P.skin);
      default: return out.setRGB(1, 0, 1);
    }
  }

  // ----------------------------------------------------- mesh construction
  const _e = new THREE.Euler();
  const _q = new THREE.Quaternion();
  const _s1 = new THREE.Vector3(1, 1, 1);
  const _p = new THREE.Vector3();
  /** Placement matrix: translation + YXZ rotation. */
  function M(x, y, z, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s1);
  }
  const _mv = new THREE.Vector3();

  function newG() {
    return { pos: [], nor: [], slot: [], shade: [], idx: [] };
  }
  const TAU = Math.PI * 2;
  const rg = (y, rx, rz, cz, ex) => Object.assign({ y, rx, rz, cz: cz || 0 }, ex);

  /** Write finished vertices (local arrays) into g, transforming by m; fix winding. */
  function commit(g, P, N, slots, shades, tris, m, dbl) {
    const base = g.pos.length / 3;
    const cnt = P.length / 3;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    for (let i = 0; i < cnt; i++) {
      _mv.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (m) _mv.applyMatrix4(m);
      g.pos.push(_mv.x, _mv.y, _mv.z);
      _mv.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      if (nm) _mv.applyMatrix3(nm);
      _mv.normalize();
      g.nor.push(_mv.x, _mv.y, _mv.z);
      g.slot.push(slots[i]);
      g.shade.push(shades[i]);
    }
    // Winding: faces must agree with their vertex normals.
    let vote = 0;
    for (let t = 0; t < tris.length && t < 60 * 3; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      vote += fx * (N[a * 3] + N[b * 3] + N[c * 3]) + fy * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + fz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
    }
    const flip = vote < 0;
    for (let t = 0; t < tris.length; t += 3) {
      if (flip) g.idx.push(base + tris[t], base + tris[t + 2], base + tris[t + 1]);
      else g.idx.push(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
    }
    if (dbl) {
      const b2 = g.pos.length / 3;
      for (let i = 0; i < cnt; i++) {
        const k = (base + i) * 3;
        g.pos.push(g.pos[k], g.pos[k + 1], g.pos[k + 2]);
        g.nor.push(-g.nor[k], -g.nor[k + 1], -g.nor[k + 2]);
        g.slot.push(slots[i]);
        g.shade.push(shades[i] * 0.8);
      }
      for (let t = 0; t < tris.length; t += 3) {
        if (flip) g.idx.push(b2 + tris[t], b2 + tris[t + 1], b2 + tris[t + 2]);
        else g.idx.push(b2 + tris[t], b2 + tris[t + 2], b2 + tris[t + 1]);
      }
    }
  }

  /**
   * A lathe/loft: rings of ellipses stacked along y (or z with axis:'z'),
   * ascending. ring = { y, rx, rz, cx, cz, slot, shade, sh(theta), sl(theta), a0, a1 }.
   * Theta 0 is the +z (or +y for axis z) side; positive theta turns toward +x.
   */
  function tube(g, rings, o) {
    o = o || {};
    const n = o.seg || 10;
    const axisZ = o.axis === 'z';
    const open = !!o.open || rings.some((r) => r.a0 !== undefined);
    const W = open ? n + 1 : n;
    const R = rings.length;
    const P = new Float32Array(R * W * 3);
    const Cn = new Float32Array(R * 3);
    const slots = new Array(R * W);
    const shades = new Array(R * W);
    for (let i = 0; i < R; i++) {
      const r = rings[i];
      const a0 = r.a0 !== undefined ? r.a0 : 0;
      const a1 = r.a1 !== undefined ? r.a1 : TAU;
      const cx = r.cx || 0, cz = r.cz || 0;
      for (let j = 0; j < W; j++) {
        const th = a0 + (a1 - a0) * j / n;
        const s = Math.sin(th), c = Math.cos(th);
        const k = (i * W + j) * 3;
        P[k] = cx + r.rx * s;
        if (axisZ) { P[k + 1] = cz + r.rz * c; P[k + 2] = r.y; } else { P[k + 1] = r.y; P[k + 2] = cz + r.rz * c; }
        slots[i * W + j] = r.sl ? r.sl(th) : r.slot !== undefined ? r.slot : o.slot || 0;
        shades[i * W + j] = (r.shade !== undefined ? r.shade : 1) * (r.sh ? r.sh(th) : 1) * (o.shade !== undefined ? o.shade : 1);
      }
      Cn[i * 3] = cx;
      Cn[i * 3 + 1] = axisZ ? cz : r.y;
      Cn[i * 3 + 2] = axisZ ? r.y : cz;
    }
    const N = new Float32Array(R * W * 3);
    const near = (i, d) => {
      let k = i + d;
      while (k >= 0 && k < R && Math.abs(rings[k].y - rings[i].y) < 1e-6) k += d;
      return k;
    };
    for (let i = 0; i < R; i++) {
      const ip = near(i, -1), inn = near(i, 1);
      const lo = ip >= 0 ? ip : i, hi = inn < R ? inn : i;
      for (let j = 0; j < W; j++) {
        const jm = open ? Math.max(0, j - 1) : (j + W - 1) % W;
        const jp = open ? Math.min(W - 1, j + 1) : (j + 1) % W;
        const tx = P[(i * W + jp) * 3] - P[(i * W + jm) * 3], ty = P[(i * W + jp) * 3 + 1] - P[(i * W + jm) * 3 + 1], tz = P[(i * W + jp) * 3 + 2] - P[(i * W + jm) * 3 + 2];
        const ux = P[(hi * W + j) * 3] - P[(lo * W + j) * 3], uy = P[(hi * W + j) * 3 + 1] - P[(lo * W + j) * 3 + 1], uz = P[(hi * W + j) * 3 + 2] - P[(lo * W + j) * 3 + 2];
        let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
        const k = (i * W + j) * 3;
        const l = Math.hypot(nx, ny, nz);
        const ox = P[k] - Cn[i * 3], oy = P[k + 1] - Cn[i * 3 + 1], oz = P[k + 2] - Cn[i * 3 + 2];
        if (l < 1e-9) {
          // A pole: point along the axis, away from the neighbouring ring.
          const sgn = ip < 0 ? -1 : 1;
          nx = 0; ny = axisZ ? 0 : sgn; nz = axisZ ? sgn : 0;
        } else {
          nx /= l; ny /= l; nz /= l;
          let d = nx * ox + ny * oy + nz * oz;
          if (Math.abs(d) < 1e-6 && o.hint) d = nx * o.hint[0] + ny * o.hint[1] + nz * o.hint[2];
          if (d < 0) { nx = -nx; ny = -ny; nz = -nz; }
        }
        N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
      }
    }
    const tris = [];
    const same = (a, b) => Math.abs(P[a * 3] - P[b * 3]) + Math.abs(P[a * 3 + 1] - P[b * 3 + 1]) + Math.abs(P[a * 3 + 2] - P[b * 3 + 2]) < 1e-7;
    for (let i = 0; i < R - 1; i++) {
      if (Math.abs(rings[i].y - rings[i + 1].y) < 1e-6 && o.noGap !== false && rings[i].rx === rings[i + 1].rx && rings[i].rz === rings[i + 1].rz) continue; // a colour cut: no surface between
      for (let j = 0; j < n; j++) {
        const j2 = open ? j + 1 : (j + 1) % n;
        const a = i * W + j, b = i * W + j2, c = (i + 1) * W + j, d = (i + 1) * W + j2;
        if (!same(a, b) && !same(a, c) && !same(b, c)) tris.push(a, b, c);
        if (!same(b, d) && !same(b, c) && !same(d, c)) tris.push(b, d, c);
      }
    }
    commit(g, P, N, slots, shades, tris, o.m, o.dbl);
  }

  /** An ellipsoid centred on the origin (place it with o.m). */
  function ell(g, rx, ry, rz, o) {
    o = o || {};
    const seg = o.seg || 6, st = o.stacks || 4;
    const rings = [];
    for (let k = 0; k <= st; k++) {
      const ph = -Math.PI / 2 + Math.PI * k / st;
      const c = k === 0 || k === st ? 0 : Math.cos(ph);
      rings.push({ y: ry * Math.sin(ph), rx: rx * c, rz: rz * c, slot: o.slot, shade: o.shade });
    }
    tube(g, rings, { seg, m: o.m, slot: o.slot });
  }

  /** A flat-shaded box centred on the origin. */
  function box(g, w, h, d, o) {
    o = o || {};
    const P = [], N = [], tris = [];
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const faces = [
      [[0, 0, 1], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      [[0, 0, -1], [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
      [[1, 0, 0], [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      [[-1, 0, 0], [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
      [[0, 1, 0], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      [[0, -1, 0], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
    ];
    const slots = [], shades = [];
    for (const f of faces) {
      const b = P.length / 3;
      for (let i = 1; i < 5; i++) { P.push(f[i][0], f[i][1], f[i][2]); N.push(f[0][0], f[0][1], f[0][2]); slots.push(o.slot || 0); shades.push(o.shade !== undefined ? o.shade : 1); }
      tris.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    commit(g, new Float32Array(P), new Float32Array(N), slots, shades, tris, o.m, false);
  }

  /** A tube along a polyline: pts [[x,y,z]...], radii per point (0 closes the end). */
  function pathTube(g, pts, radii, o) {
    o = o || {};
    const n = o.seg || 5;
    const R = pts.length;
    const P = new Float32Array(R * n * 3), N = new Float32Array(R * n * 3);
    const slots = [], shades = [];
    const T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), prev = new THREE.Vector3();
    let first = true;
    for (let i = 0; i < R; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(R - 1, i + 1)];
      T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (first) {
        U.set(Math.abs(T.y) < 0.9 ? 0 : 1, Math.abs(T.y) < 0.9 ? 1 : 0, 0);
        U.addScaledVector(T, -U.dot(T)).normalize();
        first = false;
      } else {
        U.copy(prev).addScaledVector(T, -prev.dot(T)).normalize();
      }
      prev.copy(U);
      V.crossVectors(T, U);
      const rad = radii[i] * (o.flat ? 1 : 1);
      for (let j = 0; j < n; j++) {
        const th = TAU * j / n;
        const cx = Math.cos(th), sx = Math.sin(th);
        const k = (i * n + j) * 3;
        const dx = U.x * cx + V.x * sx * (o.flat || 1), dy = U.y * cx + V.y * sx * (o.flat || 1), dz = U.z * cx + V.z * sx * (o.flat || 1);
        P[k] = pts[i][0] + rad * dx; P[k + 1] = pts[i][1] + rad * dy; P[k + 2] = pts[i][2] + rad * dz;
        const l = Math.hypot(U.x * cx + V.x * sx, U.y * cx + V.y * sx, U.z * cx + V.z * sx) || 1;
        N[k] = (U.x * cx + V.x * sx) / l; N[k + 1] = (U.y * cx + V.y * sx) / l; N[k + 2] = (U.z * cx + V.z * sx) / l;
        slots.push(o.slot || 0);
        shades.push((o.shade !== undefined ? o.shade : 1) * (o.sh ? o.sh(i, j) : 1));
      }
    }
    const tris = [];
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < n; j++) {
        const j2 = (j + 1) % n;
        const a = i * n + j, b = i * n + j2, c = (i + 1) * n + j, d = (i + 1) * n + j2;
        if (radii[i] > 1e-6 || radii[i + 1] > 1e-6) {
          if (radii[i] > 1e-6) tris.push(a, b, c);
          if (radii[i + 1] > 1e-6) tris.push(b, d, c);
        }
      }
    }
    commit(g, P, N, slots, shades, tris, o.m, false);
  }

  /** Flat ring/disc facing +z at the origin (glasses). */
  function annulus(g, rIn, rOut, sx, sy, o) {
    const n = o.seg || 10;
    const P = [], N = [], slots = [], shades = [], tris = [];
    for (let j = 0; j < n; j++) {
      const th = TAU * j / n;
      const c = Math.cos(th) * sx, s = Math.sin(th) * sy;
      if (rIn > 0) { P.push(c * rIn, s * rIn, 0); N.push(0, 0, 1); slots.push(o.slot); shades.push(1); }
      P.push(c * rOut, s * rOut, 0); N.push(0, 0, 1); slots.push(o.slot); shades.push(1);
    }
    if (rIn <= 0) {
      P.push(0, 0, 0); N.push(0, 0, 1); slots.push(o.slot); shades.push(1);
      for (let j = 0; j < n; j++) tris.push(n, j, (j + 1) % n);
    } else {
      for (let j = 0; j < n; j++) {
        const j2 = (j + 1) % n;
        const a = j * 2, b = j * 2 + 1, c = j2 * 2, d = j2 * 2 + 1;
        tris.push(a, b, c, b, d, c);
      }
    }
    commit(g, new Float32Array(P), new Float32Array(N), slots, shades, tris, o.m, false);
  }

  /** Bake ambient occlusion: darken vertices near the given spheres {x,y,z,r,k}. */
  function occlude(g, from, spheres) {
    const n = g.pos.length / 3;
    for (let i = from; i < n; i++) {
      let f = 1;
      for (const s of spheres) {
        const d = Math.hypot(g.pos[i * 3] - s.x, g.pos[i * 3 + 1] - s.y, g.pos[i * 3 + 2] - s.z) / s.r;
        if (d < 1) {
          const t = 1 - d;
          f *= 1 - s.k * t * t * (3 - 2 * t);
        }
      }
      g.shade[i] *= f;
    }
  }
  /** Mirror a left-side part across x = 0 (right side). */
  function mirror(g) {
    for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] = -g.pos[i]; g.nor[i] = -g.nor[i]; }
    for (let i = 0; i < g.idx.length; i += 3) { const t = g.idx[i + 1]; g.idx[i + 1] = g.idx[i + 2]; g.idx[i + 2] = t; }
  }
  function shift(g, dx, dy, dz) {
    for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] += dx; g.pos[i + 1] += dy; g.pos[i + 2] += dz; }
  }
  const seam = (th, at, w, k) => {
    let d = Math.abs(th - at) % TAU;
    if (d > Math.PI) d = TAU - d;
    return 1 - k * Math.exp(-(d / w) * (d / w));
  };

  // ------------------------------------------------------------ the body
  const HEAD = [ // y, rx, rz, cz — the skull, chin to crown
    [-0.03, 0, 0, 0.026], [-0.026, 0.02, 0.03, 0.024], [-0.012, 0.04, 0.05, 0.018], [0.01, 0.058, 0.07, 0.01],
    [0.035, 0.07, 0.085, 0.004], [0.06, 0.078, 0.093, 0], [0.09, 0.082, 0.098, -0.002], [0.12, 0.083, 0.098, -0.004],
    [0.15, 0.076, 0.09, -0.006], [0.172, 0.058, 0.07, -0.004], [0.185, 0.03, 0.036, -0.002], [0.19, 0, 0, 0],
  ];
  function lerpTab(tab, y) {
    if (y <= tab[0][0]) return { rx: tab[0][1], rz: tab[0][2], cz: tab[0][3] };
    for (let i = 1; i < tab.length; i++) {
      if (y <= tab[i][0]) {
        const a = tab[i - 1], b = tab[i];
        const t = (y - a[0]) / (b[0] - a[0] || 1);
        return { rx: a[1] + (b[1] - a[1]) * t, rz: a[2] + (b[2] - a[2]) * t, cz: a[3] + (b[3] - a[3]) * t };
      }
    }
    const l = tab[tab.length - 1];
    return { rx: l[1], rz: l[2], cz: l[3] };
  }
  for (const h of HEAD) { h[1] *= 1.12; h[2] *= 1.09; }
  const headAt = (y) => lerpTab(HEAD, y);
  const faceZ = (y) => { const h = headAt(y); return h.cz + h.rz; };
  const TORSO = [
    [-0.035, 0.15, 0.098, 0], [0.04, 0.15, 0.099, 0], [0.12, 0.16, 0.106, 0], [0.2, 0.178, 0.118, 0.004], [0.285, 0.195, 0.128, 0.008],
    [0.36, 0.204, 0.122, 0.006], [0.42, 0.198, 0.108, 0], [0.46, 0.186, 0.094, 0], [0.49, 0.14, 0.082, 0], [0.516, 0.075, 0.066, 0], [0.54, 0.0, 0.0, 0],
  ];
  const torsoAt = (y) => lerpTab(TORSO, y);
  /** z of the torso surface at lateral offset x and height y. */
  function chestZ(x, y) {
    const t = torsoAt(y);
    const u = clamp(x / (t.rx || 1), -0.97, 0.97);
    return t.cz + t.rz * Math.sqrt(1 - u * u);
  }
  const chestYaw = (x, y) => Math.asin(clamp(x / (torsoAt(y).rx || 1), -0.95, 0.95)) * 0.85;

  /** Shell rings hugging the skull: spec = [[y, excludedHalfAngle], ...] bottom → top. */
  function shellRings(spec, grow, o) {
    o = o || {};
    const rings = [];
    spec = spec.slice().sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < spec.length; i++) {
      const [y, ex, gy] = spec[i];
      const h = headAt(Math.min(y, 0.1899));
      const gr = grow + (gy || 0);
      const top = y >= 0.1899;
      rings.push({
        y: top ? 0.19 + gr : y, rx: top ? 0 : h.rx + gr, rz: top ? 0 : h.rz + gr, cz: h.cz + (o.shiftZ || 0),
        a0: ex, a1: TAU - ex, slot: o.slot, shade: o.shade, sh: o.sh,
      });
    }
    return rings;
  }
  // Tufts and strands: a gentle light/dark ripple around the head.
  const strands = (th) => 0.86 + 0.14 * Math.sin(th * 11) * Math.sin(th * 5 + 1);

  // The shoe: sections along z (heel to toe): [z, halfWidth, top, bottom].
  const SHOE_SNEAKER = [[-0.092, 0, 0.0, -0.03], [-0.084, 0.026, 0.045, -0.05], [-0.062, 0.039, 0.064, -0.05], [-0.02, 0.043, 0.07, -0.05],
    [0.03, 0.045, 0.052, -0.05], [0.09, 0.048, 0.03, -0.05], [0.15, 0.049, 0.012, -0.049], [0.195, 0.043, -0.004, -0.046], [0.222, 0.029, -0.015, -0.04], [0.235, 0, -0.026, -0.033]];
  const SHOE_BOOT = [[-0.096, 0, 0.0, -0.03], [-0.088, 0.03, 0.05, -0.052], [-0.066, 0.043, 0.075, -0.052], [-0.02, 0.046, 0.075, -0.052],
    [0.03, 0.048, 0.055, -0.052], [0.09, 0.05, 0.032, -0.052], [0.15, 0.051, 0.012, -0.051], [0.2, 0.045, -0.004, -0.048], [0.228, 0.031, -0.014, -0.043], [0.241, 0, -0.026, -0.036]];
  const SHOE_DRESS = [[-0.088, 0, 0.0, -0.03], [-0.08, 0.024, 0.038, -0.05], [-0.06, 0.036, 0.05, -0.05], [-0.02, 0.04, 0.054, -0.05],
    [0.03, 0.042, 0.04, -0.05], [0.1, 0.043, 0.02, -0.05], [0.16, 0.04, 0.0, -0.049], [0.21, 0.032, -0.012, -0.045], [0.24, 0.018, -0.02, -0.04], [0.252, 0, -0.026, -0.034]];

  function shoeRings(tab, soleSlot, upperSlot, o) {
    return tab.map((s, i) => {
      const cy = (s[2] + s[3]) / 2, ry = (s[2] - s[3]) / 2;
      const last = i === 0 || i === tab.length - 1;
      return {
        y: s[0], rx: last ? 0 : s[1], rz: last ? 0 : ry, cz: cy,
        sl: (th) => (Math.cos(th) < o.soleCut ? soleSlot : upperSlot),
        sh: (th) => (Math.cos(th) < -0.2 ? 0.7 : 1),
      };
    });
  }

  let _bp = {};
  /** The full set of body parts for a detail level ('hi' | 'lo'), built once. */
  function blueprint(detail) {
    if (_bp[detail]) return _bp[detail];
    const hi = detail !== 'lo';
    const SEG = hi ? { torso: 14, limb: 8, head: 14, hand: 7, shoe: 10, fine: 6, hair: 14 } : { torso: 8, limb: 5, head: 9, hand: 5, shoe: 7, fine: 4, hair: 9 };
    const parts = [];
    const part = (joint, feat, fn) => {
      const g = newG();
      fn(g);
      parts.push({ joint, feat: feat ? FEAT_ID[feat] : 0, g });
    };
    const sided = (base, feat, fn) => {
      for (const side of ['L', 'R']) {
        part(base + side, feat, (g) => {
          fn(g, side === 'L' ? 1 : -1);
          if (base === 'shoulder' || base === 'elbow') shift(g, -0.012, 0, 0); // arms sit a little inside the shoulder pivot (the gun grip still lands in the palm)
          if (side === 'R') mirror(g);
        });
      }
    };
    const S = SLOT;

    // ---- pelvis ---------------------------------------------------------
    part('pelvis', 0, (g) => {
      const f = g.pos.length / 3;
      tube(g, [
        rg(-0.16, 0.07, 0.08, 0, { shade: 0.55 }), rg(-0.13, 0.13, 0.09, 0, { shade: 0.8 }), rg(-0.07, 0.16, 0.1), rg(0, 0.162, 0.103), rg(0.05, 0.156, 0.1), rg(0.06, 0.15, 0.098),
      ], { seg: SEG.torso, slot: S.bottom });
      occlude(g, f, [{ x: 0, y: -0.16, z: 0.02, r: 0.07, k: 0.5 }]);
    });
    part('pelvis', 'belt', (g) => {
      tube(g, [rg(0.052, 0.165, 0.108), rg(0.095, 0.165, 0.108)], { seg: SEG.torso, slot: S.belt, open: false });
      tube(g, [rg(0.052, 0.165, 0.108, 0, { shade: 0.7 }), rg(0.0521, 0.153, 0.1, 0, { shade: 0.7 })], { seg: SEG.torso, slot: S.belt });
      box(g, 0.036, 0.032, 0.01, { slot: S.metal, m: M(0, 0.074, 0.111) });
    });
    part('pelvis', 'pockets', (g) => {
      for (const s of [1, -1]) {
        box(g, 0.06, 0.066, 0.005, { slot: S.bottom, shade: 0.78, m: M(s * 0.062, -0.03, -0.0945, -0.05, s * 0.28, 0) });
        box(g, 0.05, 0.012, 0.004, { slot: S.bottom, shade: 0.85, m: M(s * 0.094, 0.025, 0.083, 0, s * -0.65, 0) });
      }
    });
    part('pelvis', 'oCop', (g) => {
      // Duty belt with holster, cuffs, magazine pouch and baton ring.
      tube(g, [rg(0.0, 0.172, 0.113), rg(0.07, 0.172, 0.113)], { seg: SEG.torso, slot: S.belt });
      box(g, 0.04, 0.034, 0.01, { slot: S.metal, m: M(0, 0.036, 0.117) });
      box(g, 0.052, 0.17, 0.1, { slot: S.dark, shade: 0.9, m: M(-0.158, -0.06, 0.018, 0, -0.1, 0) });
      box(g, 0.036, 0.04, 0.07, { slot: S.dark, shade: 0.8, m: M(-0.158, 0.065, -0.005, 0.2, -0.1, 0) });
      box(g, 0.05, 0.075, 0.032, { slot: S.dark, shade: 0.9, m: M(0.075, 0.03, 0.12) });
      box(g, 0.05, 0.075, 0.032, { slot: S.dark, shade: 0.9, m: M(0.13, 0.025, 0.1, 0, 0.5, 0) });
      box(g, 0.04, 0.06, 0.03, { slot: S.metal, shade: 0.8, m: M(0.045, 0.03, -0.112) });
    });
    part('pelvis', 'oSoldier', (g) => {
      tube(g, [rg(0.0, 0.17, 0.112), rg(0.065, 0.17, 0.112)], { seg: SEG.torso, slot: S.belt });
      box(g, 0.06, 0.08, 0.04, { slot: S.vest, shade: 0.9, m: M(-0.13, 0.02, 0.1, 0, 0.6, 0) });
      box(g, 0.06, 0.08, 0.04, { slot: S.vest, shade: 0.9, m: M(0.13, 0.02, 0.1, 0, -0.6, 0) });
      box(g, 0.1, 0.07, 0.04, { slot: S.vest, shade: 0.85, m: M(0, 0.02, -0.12) });
    });
    part('pelvis', 'bSkirt', (g) => {
      tube(g, [rg(-0.2, 0.235, 0.205, 0, { shade: 0.8 }), rg(-0.14, 0.205, 0.178), rg(-0.04, 0.17, 0.13), rg(0.05, 0.158, 0.104)], { seg: SEG.torso, slot: S.bottom, dbl: true });
    });
    part('pelvis', 'bag', (g) => {
      box(g, 0.075, 0.2, 0.17, { slot: S.bag, m: M(0.205, -0.04, 0.0, 0, 0, -0.05) });
      box(g, 0.082, 0.05, 0.178, { slot: S.bag, shade: 0.75, m: M(0.205, 0.04, 0.0, 0, 0, -0.05) });
    });

    // ---- torso ----------------------------------------------------------
    part('spine', 0, (g) => {
      const f = g.pos.length / 3;
      tube(g, TORSO.map((t) => rg(t[0], t[1], t[2], t[3], { slot: S.top })), { seg: SEG.torso });
      occlude(g, f, [{ x: 0.21, y: 0.37, z: 0, r: 0.08, k: 0.5 }, { x: -0.21, y: 0.37, z: 0, r: 0.08, k: 0.5 }, { x: 0, y: -0.03, z: 0, r: 0.1, k: 0.15 }, { x: 0, y: 0.5, z: 0.05, r: 0.06, k: 0.3 }]);
    });
    part('spine', 'neckBand', (g) => {
      tube(g, [rg(0.5, 0.075, 0.078, 0.004), rg(0.512, 0.068, 0.07, 0.006), rg(0.532, 0.062, 0.064, 0.004)], { seg: SEG.fine * 2, slot: S.trim });
      tube(g, [rg(0.499, 0.074, 0.076, 0.002, { a0: 0.55, a1: TAU - 0.55, shade: 0.8 }), rg(0.52, 0.066, 0.068, 0.004, { a0: 0.45, a1: TAU - 0.45 })], { seg: SEG.fine * 2, slot: S.skin });
    });
    part('spine', 'oShirt', (g) => {
      // Button placket and a breast pocket.
      const rings = [];
      for (let i = 0; i < 9; i++) {
        const y = 0.0 + i * 0.05;
        const t = torsoAt(y);
        rings.push(rg(y, t.rx + 0.002, t.rz + 0.002, t.cz, { a0: -0.07, a1: 0.07, shade: i % 2 ? 0.45 : 0.85 }));
      }
      rings.push(rg(0.44, torsoAt(0.44).rx + 0.002, torsoAt(0.44).rz + 0.002, 0, { a0: -0.07, a1: 0.07, shade: 0.85 }));
      tube(g, rings, { seg: 2, slot: S.top, open: true });
      box(g, 0.05, 0.055, 0.005, { slot: S.top, shade: 0.8, m: M(0.088, 0.3, chestZ(0.088, 0.3) + 0.002, 0, chestYaw(0.088, 0.3)) });
    });
    part('spine', 'oPolo', (g) => {
      for (const s of [1, -1]) box(g, 0.05, 0.034, 0.008, { slot: S.top, shade: 0.9, m: M(s * 0.04, 0.5, 0.06, -0.5, s * 0.5, s * -0.5) });
      box(g, 0.022, 0.075, 0.005, { slot: S.top, shade: 0.7, m: M(0, 0.46, chestZ(0, 0.46) + 0.001) });
    });
    part('spine', 'collar', (g) => {
      // A turned-down shirt collar: two flaps either side of the open neck.
      tube(g, [rg(0.5, 0.082, 0.084, 0.0, { a0: 0.5, a1: TAU - 0.5 }), rg(0.528, 0.074, 0.076, 0.0, { a0: 0.5, a1: TAU - 0.5 }), rg(0.549, 0.07, 0.072, 0.0, { a0: 0.55, a1: TAU - 0.55 })], { seg: SEG.fine * 2, slot: S.top, dbl: true });
      for (const s of [1, -1]) box(g, 0.042, 0.03, 0.007, { slot: S.top, shade: 0.9, m: M(s * 0.03, 0.512, 0.072, -0.55, s * 0.6, s * -0.4) });
    });
    part('spine', 'oJacket', (g) => {
      const f = g.pos.length / 3;
      // The open front shows the shirt underneath in a V.
      const rings = [];
      for (const y of [0.1, 0.18, 0.26, 0.34, 0.42, 0.485, 0.508]) {
        const t = torsoAt(y);
        const w = 0.1 + 0.46 * smoothstep(0.1, 0.5, y);
        rings.push(rg(y, t.rx + 0.0035, t.rz + 0.0035, t.cz, { a0: -w, a1: w }));
      }
      tube(g, rings, { seg: SEG.fine * 2, slot: S.shirt, open: true });
      // Lapel edges and the stand-up collar.
      for (const s of [1, -1]) {
        const pts = [];
        for (const y of [0.5, 0.42, 0.33, 0.22, 0.11]) {
          const w = 0.1 + 0.46 * smoothstep(0.1, 0.5, y);
          const t = torsoAt(y);
          const x = (t.rx + 0.003) * Math.sin(w);
          pts.push([s * x, y, chestZ(x, y) + 0.005]);
        }
        pathTube(g, pts, [0.009, 0.012, 0.011, 0.01, 0.008], { seg: 4, slot: S.trim, flat: 0.4 });
        box(g, 0.058, 0.04, 0.008, { slot: S.trim, shade: 0.9, m: M(s * 0.1, 0.06, chestZ(s * 0.1, 0.06) + 0.004, 0.1, s * chestYaw(0.1, 0.06)) });
      }
      tube(g, [rg(0.497, 0.09, 0.088, -0.004, { a0: 0.6, a1: TAU - 0.6 }), rg(0.52, 0.086, 0.086, -0.005, { a0: 0.6, a1: TAU - 0.6 }), rg(0.55, 0.098, 0.098, -0.008, { a0: 0.75, a1: TAU - 0.75 })], { seg: SEG.fine * 2, slot: S.trim, dbl: true });
      // Hem band.
      const t0 = torsoAt(-0.03), t1 = torsoAt(0.03);
      tube(g, [rg(-0.04, t0.rx + 0.007, t0.rz + 0.007), rg(0.03, t1.rx + 0.007, t1.rz + 0.007)], { seg: SEG.torso, slot: S.trim });
      occlude(g, f, [{ x: 0, y: 0.5, z: 0.05, r: 0.05, k: 0.3 }]);
    });
    part('spine', 'oHoodie', (g) => {
      pathTube(g, [[0.09, 0.525, 0.03], [0.082, 0.52, -0.05], [0, 0.505, -0.105], [-0.082, 0.52, -0.05], [-0.09, 0.525, 0.03]], [0.026, 0.034, 0.036, 0.034, 0.026], { seg: SEG.fine, slot: S.top, shade: 0.88 });
      box(g, 0.19, 0.08, 0.016, { slot: S.top, shade: 0.78, m: M(0, 0.1, chestZ(0, 0.1) + 0.003, -0.08) });
      for (const s of [1, -1]) pathTube(g, [[s * 0.035, 0.505, 0.075], [s * 0.04, 0.4, 0.122], [s * 0.04, 0.3, 0.13]], [0.005, 0.005, 0.005], { seg: 4, slot: S.trim });
    });
    part('spine', 'oCop', (g) => {
      const f = g.pos.length / 3;
      // Shirt collar and tie, badge, pockets, epaulettes, shoulder radio.
      tube(g, [rg(0.5, 0.085, 0.086, 0, { a0: 0.45, a1: TAU - 0.45 }), rg(0.53, 0.076, 0.078, 0, { a0: 0.45, a1: TAU - 0.45 }), rg(0.55, 0.072, 0.074, 0, { a0: 0.5, a1: TAU - 0.5 })], { seg: SEG.fine * 2, slot: S.shirt, dbl: true });
      pathTube(g, [[0, 0.5, 0.082], [0, 0.4, chestZ(0, 0.4) + 0.006], [0, 0.26, chestZ(0, 0.26) + 0.006]], [0.011, 0.014, 0.008], { seg: 4, slot: S.dark, flat: 0.5 });
      box(g, 0.032, 0.04, 0.007, { slot: S.badge, m: M(0.092, 0.32, chestZ(0.092, 0.32) + 0.004, 0, chestYaw(0.092, 0.32)) });
      box(g, 0.05, 0.016, 0.005, { slot: S.metal, m: M(-0.092, 0.3, chestZ(0.092, 0.3) + 0.003, 0, -chestYaw(0.092, 0.3)) });
      for (const s of [1, -1]) {
        box(g, 0.052, 0.055, 0.006, { slot: S.top, shade: 0.8, m: M(s * 0.092, 0.24, chestZ(0.092, 0.24) + 0.003, 0, s * chestYaw(0.092, 0.24)) });
        box(g, 0.05, 0.016, 0.07, { slot: S.trim, shade: 0.9, m: M(s * 0.145, 0.482, 0.0, 0, 0, s * -0.3) });
      }
      box(g, 0.04, 0.07, 0.024, { slot: S.dark, shade: 0.9, m: M(0.1, 0.42, 0.095, 0.1, -0.5, 0) });
      pathTube(g, [[0.1, 0.45, 0.1], [0.12, 0.5, 0.06], [0.07, 0.52, 0.02]], [0.0035, 0.0035, 0.0035], { seg: 4, slot: S.dark });
      occlude(g, f, [{ x: 0, y: 0.5, z: 0.05, r: 0.05, k: 0.3 }]);
    });
    part('spine', 'oSoldier', (g) => {
      const f = g.pos.length / 3;
      const rings = [];
      for (const y of [0.0, 0.09, 0.2, 0.3, 0.4, 0.46]) {
        const t = torsoAt(y);
        const k = y > 0.44 ? -0.03 : 0.013;
        rings.push(rg(y, t.rx + k, t.rz + k, t.cz, { shade: y < 0.03 ? 0.8 : 1 }));
      }
      tube(g, rings, { seg: SEG.torso, slot: S.vest });
      for (const [x, y] of [[-0.065, 0.2], [0.065, 0.2], [-0.07, 0.12], [0.07, 0.12]]) box(g, 0.058, 0.07, 0.036, { slot: S.vest, shade: 0.8, m: M(x, y, chestZ(x, y) + 0.016, 0, chestYaw(x, y)) });
      for (const s of [1, -1]) box(g, 0.05, 0.03, 0.15, { slot: S.vest, shade: 0.9, m: M(s * 0.115, 0.47, 0.0, 0, 0, s * -0.25) });
      tube(g, [rg(0.5, 0.082, 0.084), rg(0.53, 0.074, 0.076), rg(0.55, 0.07, 0.072)], { seg: SEG.fine * 2, slot: S.top });
      box(g, 0.1, 0.1, 0.03, { slot: S.vest, shade: 0.85, m: M(0, 0.28, -0.14) });
      occlude(g, f, [{ x: 0, y: 0.5, z: 0.05, r: 0.05, k: 0.3 }]);
    });
    part('spine', 'oTank', (g) => {
      // A gold chain.
      pathTube(g, [[0.062, 0.51, 0.045], [0.062, 0.46, 0.105], [0.03, 0.38, chestZ(0.03, 0.38) + 0.009], [0, 0.35, chestZ(0, 0.35) + 0.011], [-0.03, 0.38, chestZ(0.03, 0.38) + 0.009], [-0.062, 0.46, 0.105], [-0.062, 0.51, 0.045]], [0.0035, 0.0045, 0.0045, 0.0055, 0.0045, 0.0045, 0.0035], { seg: 4, slot: S.badge });
    });
    part('spine', 'tattoo', (g) => {
      // A tribal band across the upper back and a neck mark.
      const rings = [];
      for (let i = 0; i < 7; i++) {
        const y = 0.36 + i * 0.015;
        const t = torsoAt(y);
        rings.push(rg(y, t.rx + 0.0012, t.rz + 0.0012, t.cz, { a0: Math.PI - 0.7, a1: Math.PI + 0.7, shade: i % 2 ? 0.6 : 1, sh: (th) => 0.7 + 0.3 * Math.abs(Math.sin(th * 9)) }));
      }
      tube(g, rings, { seg: 10, slot: S.tattoo, open: true });
    });
    part('spine', 'bag', (g) => {
      pathTube(g, [[-0.1, 0.47, -0.02], [-0.02, 0.36, 0.1], [0.09, 0.18, 0.12], [0.17, 0.04, 0.06], [0.2, -0.02, 0.0]], [0.012, 0.013, 0.013, 0.012, 0.011], { seg: 4, slot: S.bag, flat: 0.5 });
    });

    // ---- neck and head ----------------------------------------------------
    part('neck', 0, (g) => {
      const f = g.pos.length / 3;
      tube(g, [rg(-0.012, 0.058, 0.057, 0, { shade: 0.7 }), rg(0.03, 0.052, 0.052, 0.002, { shade: 0.85 }), rg(0.08, 0.05, 0.052, 0.005), rg(0.105, 0.052, 0.056, 0.006, { shade: 0.6 })], { seg: SEG.fine * 2, slot: S.skin });
      occlude(g, f, [{ x: 0, y: 0.1, z: 0.04, r: 0.05, k: 0.25 }]);
    });
    part('head', 0, (g) => {
      const f = g.pos.length / 3;
      tube(g, HEAD.map((h, i) => rg(h[0], h[1], h[2], h[3], { shade: h[0] < 0 ? 0.62 : h[0] < 0.01 ? 0.8 : 1 })), { seg: SEG.head, slot: S.skin });
      // Eye sockets, under the nose and mouth corners, the temples.
      occlude(g, f, [
        { x: 0.032, y: 0.094, z: faceZ(0.094), r: 0.026, k: 0.22 }, { x: -0.032, y: 0.094, z: faceZ(0.094), r: 0.026, k: 0.22 },
        { x: 0, y: 0.04, z: faceZ(0.04), r: 0.02, k: 0.2 }, { x: 0, y: -0.02, z: 0.03, r: 0.06, k: 0.3 },
      ]);
    });
    part('head', 'near', (g) => {
      const fz = faceZ;
      // Nose: bridge and tip, with wings.
      ell(g, 0.0105, 0.024, 0.016, { seg: SEG.fine, stacks: 4, slot: S.skin, m: M(0, 0.066, fz(0.066) + 0.001, -0.3), shade: 1.04 });
      ell(g, 0.0105, 0.009, 0.011, { seg: SEG.fine, stacks: 3, slot: S.skin, m: M(0, 0.049, fz(0.049) + 0.012), shade: 1.04 });
      if (hi) for (const s of [1, -1]) ell(g, 0.005, 0.0045, 0.006, { seg: 5, stacks: 3, slot: S.skin, m: M(s * 0.0095, 0.05, fz(0.05) + 0.0075), shade: 0.97 });
      // Eyes and brows.
      for (const s of [1, -1]) {
        const ey = 0.094, ex = s * 0.032;
        ell(g, 0.0125, 0.0092, 0.008, { seg: SEG.fine, stacks: 4, slot: S.eyeW, m: M(ex, ey, fz(ey) - 0.0045, 0, s * 0.18) });
        annulus(g, 0, 0.0072, 1, 1, { seg: 8, slot: S.iris, m: M(ex + s * 0.0005, ey, fz(ey) + 0.0043, 0, s * 0.18) });
        ell(g, 0.0205, 0.0048, 0.0075, { seg: 5, stacks: 3, slot: S.brow, m: M(ex + s * 0.002, 0.113, fz(0.113) - 0.0015, 0, s * 0.2, s * 0.05) });
        ell(g, 0.0075, 0.021, 0.014, { seg: 5, stacks: 4, slot: S.skin, shade: 0.94, m: M(s * (headAt(0.07).rx - 0.001), 0.07, headAt(0.07).cz - 0.004, 0, 0, 0) });
      }
    });
    part('head', 'mouth', (g) => {
      ell(g, 0.0185, 0.0052, 0.0065, { seg: SEG.fine, stacks: 3, slot: S.lip, m: M(0, 0.018, faceZ(0.018) + 0.0015), shade: 0.95 });
    });
    part('head', 'mouthBeard', (g) => {
      ell(g, 0.017, 0.0048, 0.006, { seg: SEG.fine, stacks: 3, slot: S.lip, m: M(0, 0.018, faceZ(0.018) + 0.0095), shade: 0.95 });
    });

    // ---- hair -----------------------------------------------------------
    const hairSh = strands;
    const crown = [[0.19, 0], [0.185, 0], [0.172, 0], [0.15, 0.3], [0.125, 0.75], [0.1, 1.25], [0.075, 1.75], [0.05, 2.15], [0.03, 2.5]];
    part('head', 'hairShort', (g) => {
      tube(g, shellRings(crown.map((c, i) => [c[0], c[1], i < 5 ? 0.006 : 0]), 0.0095, { slot: S.hair, sh: hairSh }), { seg: SEG.hair });
    });
    part('head', 'hairBuzz', (g) => {
      tube(g, shellRings([[0.19, 0], [0.172, 0], [0.15, 0.4], [0.125, 1.0], [0.1, 1.7], [0.075, 2.1], [0.05, 2.35]], 0.0035, { slot: S.hair, shade: 0.8 }), { seg: SEG.hair });
    });
    part('head', 'hairBob', (g) => {
      tube(g, shellRings(crown, 0.0095, { slot: S.hair, sh: hairSh }), { seg: SEG.hair });
      tube(g, [rg(-0.05, 0.1, 0.098, -0.014, { a0: Math.PI - 2.15, a1: Math.PI + 2.15, shade: 0.7 }), rg(0.02, 0.107, 0.103, -0.012, { a0: Math.PI - 2.1, a1: Math.PI + 2.1 }), rg(0.08, 0.1, 0.1, -0.006, { a0: Math.PI - 1.9, a1: Math.PI + 1.9 })], { seg: SEG.hair, slot: S.hair, sh: hairSh, dbl: true });
    });
    part('head', 'hairLong', (g) => {
      tube(g, shellRings(crown, 0.0095, { slot: S.hair, sh: hairSh }), { seg: SEG.hair });
      tube(g, [
        rg(-0.2, 0.052, 0.04, -0.056, { a0: Math.PI - 1.7, a1: Math.PI + 1.7, shade: 0.65 }), rg(-0.15, 0.076, 0.062, -0.046, { a0: Math.PI - 1.95, a1: Math.PI + 1.95, shade: 0.8 }),
        rg(-0.08, 0.093, 0.088, -0.026, { a0: Math.PI - 2.1, a1: Math.PI + 2.1 }), rg(0.0, 0.1, 0.1, -0.012, { a0: Math.PI - 2.15, a1: Math.PI + 2.15 }), rg(0.07, 0.1, 0.1, -0.006, { a0: Math.PI - 1.9, a1: Math.PI + 1.9 }),
      ], { seg: SEG.hair, slot: S.hair, dbl: true, sh: (th) => 0.8 + 0.2 * Math.sin(th * 17) });
    });
    part('head', 'hairPony', (g) => {
      tube(g, shellRings(crown, 0.0075, { slot: S.hair, sh: hairSh }), { seg: SEG.hair });
      pathTube(g, [[0, 0.135, -0.1], [0, 0.12, -0.13], [0, 0.07, -0.16], [0, -0.01, -0.165], [0, -0.1, -0.15], [0, -0.17, -0.13]], [0.02, 0.026, 0.028, 0.024, 0.016, 0.004], { seg: SEG.fine, slot: S.hair, sh: (i, j) => 0.85 + 0.15 * Math.sin(j * 2.1 + i) });
      pathTube(g, [[0, 0.139, -0.095], [0, 0.125, -0.115]], [0.026, 0.026], { seg: SEG.fine, slot: S.dark });
    });
    part('head', 'hairAfro', (g) => {
      tube(g, shellRings([[0.19, 0], [0.17, 0], [0.145, 0.3], [0.12, 0.9], [0.095, 1.45], [0.07, 1.9], [0.04, 2.3]], 0.034, { slot: S.hair, sh: (th) => 0.78 + 0.22 * Math.abs(Math.sin(th * 7 + 0.5)) * Math.abs(Math.cos(th * 3)) }), { seg: SEG.hair + 2 });
    });
    part('head', 'hairMohawk', (g) => {
      tube(g, shellRings([[0.19, 0], [0.172, 0], [0.15, 0.55], [0.125, 1.3], [0.1, 1.9], [0.075, 2.3]], 0.003, { slot: S.hair, shade: 0.75 }), { seg: SEG.hair });
      tube(g, [
        { y: 0.085, rx: 0, rz: 0, cz: 0.165 }, { y: 0.07, rx: 0.01, rz: 0.02, cz: 0.18 }, { y: 0.03, rx: 0.014, rz: 0.035, cz: 0.195 }, { y: -0.02, rx: 0.015, rz: 0.04, cz: 0.205 },
        { y: -0.07, rx: 0.014, rz: 0.035, cz: 0.19 }, { y: -0.105, rx: 0.01, rz: 0.02, cz: 0.165 }, { y: -0.115, rx: 0, rz: 0, cz: 0.15 },
      ], { seg: 6, axis: 'z', slot: S.hair, sh: (th) => 0.8 + 0.2 * Math.sin(th * 7) });
    });

    // ---- hats ---------------------------------------------------------------
    const domeRings = (cuts, grow, slot, o) => {
      // cuts: [[y, a0, a1], ...] bottom → top, then the pole.
      const rings = [];
      for (const [y, a0, a1] of cuts) {
        const h = headAt(y);
        rings.push({ y, rx: h.rx + grow, rz: h.rz + grow, cz: h.cz, a0, a1, slot, shade: o && o.shade, sh: o && o.sh });
      }
      rings.push({ y: 0.19 + grow, rx: 0, rz: 0, cz: 0, a0: 0, a1: TAU, slot });
      return rings;
    };
    const P_ = Math.PI;
    part('head', 'hatCap', (g) => {
      tube(g, domeRings([[0.072, P_ - 1.0, P_ + 1.0], [0.098, P_ - 1.5, P_ + 1.5], [0.118, 0, TAU], [0.15, 0, TAU], [0.172, 0, TAU]].map((c, i) => c), 0.016, S.cap, { sh: (th) => seam(th, 0, 0.1, 0.35) * seam(th, 1.05, 0.08, 0.35) * seam(th, -1.05, 0.08, 0.35) * seam(th, 2.1, 0.08, 0.35) * seam(th, -2.1, 0.08, 0.35) * seam(th, P_, 0.08, 0.35) }), { seg: SEG.hair + 4, open: true });
      tube(g, [rg(0.121, 0.088, 0.108, 0.0, { a0: -1.3, a1: 1.3, shade: 0.8 }), rg(0.098, 0.098, 0.168, 0.044, { a0: -1.2, a1: 1.2, shade: 0.95 })], { seg: 10, slot: S.cap, dbl: true, hint: [0, 1, 0] });
      ell(g, 0.007, 0.005, 0.007, { seg: 5, stacks: 2, slot: S.cap, m: M(0, 0.208, -0.002) });
    });
    part('head', 'hatBeanie', (g) => {
      tube(g, domeRings([[0.1, 0, TAU], [0.13, 0, TAU], [0.16, 0, TAU], [0.18, 0, TAU]], 0.014, S.top, { sh: (th) => 0.82 + 0.18 * Math.abs(Math.sin(th * 14)) }), { seg: SEG.hair + 4 });
      tube(g, [rg(0.112, headAt(0.12).rx + 0.02, headAt(0.12).rz + 0.02, headAt(0.12).cz, { shade: 0.9 }), rg(0.15, headAt(0.15).rx + 0.02, headAt(0.15).rz + 0.02, headAt(0.15).cz)], { seg: SEG.hair + 4, slot: S.trim });
    });
    part('head', 'hatHelmet', (g) => {
      tube(g, domeRings([[0.055, P_ - 1.5, P_ + 1.5], [0.085, P_ - 2.2, P_ + 2.2], [0.105, 0, TAU], [0.14, 0, TAU], [0.17, 0, TAU]], 0.024, S.cap, { sh: (th) => 0.86 + 0.14 * Math.abs(Math.sin(th * 13)) }), { seg: SEG.hair + 4, open: true });
      tube(g, [rg(0.106, headAt(0.1).rx + 0.027, headAt(0.1).rz + 0.027, headAt(0.1).cz, { shade: 0.7 }), rg(0.118, headAt(0.12).rx + 0.027, headAt(0.12).rz + 0.027, headAt(0.12).cz, { shade: 0.9 })], { seg: SEG.hair + 4, slot: S.dark });
      for (const s of [1, -1]) pathTube(g, [[s * 0.088, 0.1, 0.012], [s * 0.084, 0.045, 0.045], [s * 0.04, -0.03, 0.082], [0, -0.034, 0.095]], [0.004, 0.004, 0.004, 0.004], { seg: 4, slot: S.dark });
    });
    part('head', 'hatPolice', (g) => {
      const hb = headAt(0.125);
      tube(g, [rg(0.118, hb.rx + 0.016, hb.rz + 0.016, hb.cz, { shade: 0.8 }), rg(0.14, hb.rx + 0.016, hb.rz + 0.016, hb.cz, {})], { seg: SEG.hair + 4, slot: S.dark });
      tube(g, [rg(0.14, 0.1, 0.114, -0.004), rg(0.168, 0.118, 0.134, -0.006), rg(0.186, 0.118, 0.134, -0.006), rg(0.19, 0.098, 0.112, -0.006), rg(0.1905, 0, 0, -0.006)], { seg: SEG.hair + 4, slot: S.cap });
      tube(g, [rg(0.126, 0.084, 0.1, 0.002, { a0: -1.25, a1: 1.25, shade: 0.8 }), rg(0.122, 0.092, 0.15, 0.04, { a0: -1.15, a1: 1.15 })], { seg: 8, slot: S.dark, dbl: true, hint: [0, 1, 0] });
      ell(g, 0.011, 0.012, 0.004, { seg: 5, stacks: 3, slot: S.badge, m: M(0, 0.157, 0.138, 0.15) });
    });
    part('head', 'hatBand', (g) => {
      const a = headAt(0.1), b = headAt(0.135);
      tube(g, [rg(0.098, a.rx + 0.01, a.rz + 0.01, a.cz, { shade: 0.9 }), rg(0.14, b.rx + 0.01, b.rz + 0.01, b.cz, { sh: (th) => 0.88 + 0.12 * Math.sin(th * 20) })], { seg: SEG.hair + 4, slot: S.bandana });
      ell(g, 0.022, 0.02, 0.016, { seg: 5, stacks: 3, slot: S.bandana, m: M(0.015, 0.115, -0.105) });
      pathTube(g, [[0.015, 0.11, -0.112], [0.03, 0.07, -0.12], [0.034, 0.04, -0.118]], [0.012, 0.01, 0.003], { seg: 4, slot: S.bandana, flat: 0.5 });
    });

    // ---- face furniture ---------------------------------------------------
    part('head', 'beard', (g) => {
      const G = 0.0085;
      const ring = (y, a0, a1, ex) => { const h = headAt(y); return Object.assign({ y, rx: h.rx + G, rz: h.rz + G, cz: h.cz + 0.002, a0, a1, slot: S.hair, sh: (th) => 0.8 + 0.2 * Math.sin(th * 15 + 1) }, ex); };
      // Chin and jaw.
      const chin = [ring(-0.03, -2.8, 2.8, { rx: 0, rz: 0 }), ring(-0.018, -2.7, 2.7), ring(-0.004, -2.45, 2.45), ring(0.01, -2.2, 2.2), ring(0.022, -1.9, 1.9)];
      chin[0].cz = headAt(-0.03).cz + 0.002;
      tube(g, chin, { seg: SEG.hair });
      // Sideburns and cheeks, from the ear down to the jaw.
      for (const s of [1, -1]) {
        const rings = [ring(0.012, 1.05, 2.1), ring(0.028, 0.95, 2.0), ring(0.044, 0.95, 1.85), ring(0.06, 1.1, 1.7), ring(0.076, 1.3, 1.6)];
        if (s < 0) for (const r of rings) { const a = r.a0; r.a0 = -r.a1; r.a1 = -a; }
        tube(g, rings, { seg: 5 });
      }
    });
    part('head', 'stubble', (g) => {
      const sp = [[-0.03, 0, 0.78], [-0.014, 2.8, 0.78], [0.004, 2.5, 0.8], [0.02, 2.25, 0.84], [0.034, 2.0, 0.9], [0.048, 1.75, 0.96], [0.06, 1.5, 1.0]];
      const rings = sp.map(([y, a, k], i) => {
        const h = headAt(y);
        return i === 0 ? { y, rx: 0, rz: 0, cz: h.cz, a0: -2.8, a1: 2.8, slot: S.skin, shade: k } : { y, rx: h.rx + 0.0016, rz: h.rz + 0.0016, cz: h.cz, a0: -a, a1: a, slot: S.skin, shade: k };
      });
      tube(g, rings, { seg: SEG.hair + 2 });
    });
    part('head', 'mustache', (g) => {
      ell(g, 0.026, 0.0075, 0.0095, { seg: 6, stacks: 3, slot: S.hair, m: M(0, 0.033, faceZ(0.033) + 0.0035, 0.12) });
    });
    part('head', 'glasses', (g) => {
      for (const s of [1, -1]) {
        annulus(g, 0.0165, 0.0215, 1.12, 0.92, { seg: 10, slot: S.dark, m: M(s * 0.032, 0.096, faceZ(0.096) + 0.012) });
        pathTube(g, [[s * 0.0535, 0.099, faceZ(0.099) + 0.01], [s * 0.0845, 0.098, faceZ(0.099) - 0.02], [s * 0.088, 0.092, 0.0]], [0.0013, 0.0013, 0.0013], { seg: 3, slot: S.dark });
      }
      box(g, 0.016, 0.003, 0.003, { slot: S.dark, m: M(0, 0.1, faceZ(0.1) + 0.012) });
    });
    part('head', 'sunglasses', (g) => {
      for (const s of [1, -1]) {
        annulus(g, 0, 0.0245, 1.12, 0.9, { seg: 10, slot: S.lens, m: M(s * 0.032, 0.095, faceZ(0.095) + 0.013) });
        annulus(g, 0.0235, 0.0265, 1.12, 0.9, { seg: 10, slot: S.dark, m: M(s * 0.032, 0.095, faceZ(0.095) + 0.0132) });
        pathTube(g, [[s * 0.0575, 0.099, faceZ(0.099) + 0.01], [s * 0.0855, 0.098, faceZ(0.099) - 0.02], [s * 0.088, 0.09, 0.0]], [0.0016, 0.0016, 0.0016], { seg: 3, slot: S.dark });
      }
      box(g, 0.018, 0.004, 0.003, { slot: S.dark, m: M(0, 0.101, faceZ(0.1) + 0.013) });
    });

    // ---- arms -----------------------------------------------------------
    sided('shoulder', 0, (g) => {
      const f = g.pos.length / 3;
      tube(g, [
        rg(-0.335, 0, 0), rg(-0.322, 0.03, 0.032, 0, { slot: S.sleeveL }), rg(-0.29, 0.043, 0.045, 0, { slot: S.sleeveL, shade: 0.85 }), rg(-0.22, 0.047, 0.05, 0, { slot: S.sleeveL }), rg(-0.15, 0.052, 0.055, 0, { slot: S.sleeveL }),
        rg(-0.1495, 0.0522, 0.0552, 0, { slot: S.sleeveS, shade: 0.82 }), rg(-0.09, 0.053, 0.056, 0, { slot: S.sleeveS }), rg(-0.03, 0.056, 0.058, 0, { slot: S.sleeveS }), rg(0.005, 0.056, 0.057, 0, { slot: S.sleeveS }),
        rg(0.022, 0.05, 0.051, 0, { slot: S.sleeveS }), rg(0.04, 0.034, 0.037, 0, { slot: S.sleeveS }), rg(0.05, 0, 0, 0, { slot: S.sleeveS }),
      ], { seg: SEG.limb });
      occlude(g, f, [{ x: -0.045, y: 0.0, z: 0, r: 0.07, k: 0.45 }]);
    });
    sided('shoulder', 'tattoo', (g) => {
      const rings = [];
      for (let i = 0; i < 8; i++) {
        const y = -0.2 + i * 0.017;
        const r = 0.0525 + (i / 8) * 0.004 + 0.0012;
        rings.push(rg(y, r, r + 0.003, 0, { a0: 0.4, a1: 2.6, shade: i % 2 ? 0.55 : 1, sh: (th) => 0.65 + 0.35 * Math.abs(Math.sin(th * 7)) }));
      }
      tube(g, rings, { seg: 8, slot: S.tattoo, open: true });
    });
    sided('elbow', 0, (g) => {
      const f = g.pos.length / 3;
      tube(g, [
        rg(-0.268, 0.025, 0.022, 0, { slot: S.skin, shade: 0.9 }), rg(-0.232, 0.03, 0.027, 0, { slot: S.skin }), rg(-0.2315, 0.0302, 0.0272, 0, { slot: S.sleeveL }), rg(-0.2, 0.033, 0.03, 0, { slot: S.sleeveL }),
        rg(-0.12, 0.04, 0.037, 0, { slot: S.sleeveL }), rg(-0.05, 0.046, 0.044, 0, { slot: S.sleeveL }), rg(0.0, 0.047, 0.046, 0, { slot: S.sleeveL }), rg(0.025, 0.04, 0.04, 0, { slot: S.sleeveL, shade: 0.9 }), rg(0.037, 0, 0, 0, { slot: S.sleeveL }),
      ], { seg: SEG.limb });
      occlude(g, f, [{ x: -0.03, y: 0.02, z: 0.0, r: 0.045, k: 0.35 }]);
      // Hand: a cupped mitten with fingertips curling forward, and a thumb.
      const palm = [
        rg(-0.256, 0.02, 0.022, 0, { shade: 0.85 }), rg(-0.278, 0.021, 0.034), rg(-0.304, 0.022, 0.039), rg(-0.336, 0.0215, 0.04, 0.003), rg(-0.366, 0.0195, 0.036, 0.008),
        rg(-0.392, 0.0175, 0.029, 0.015, { shade: 0.92 }), rg(-0.408, 0.014, 0.018, 0.02, { shade: 0.85 }), rg(-0.415, 0, 0, 0.022),
      ];
      tube(g, palm, { seg: SEG.hand, slot: S.skin });
      ell(g, 0.0105, 0.03, 0.0115, { seg: SEG.fine, stacks: 4, slot: S.skin, m: M(-0.021, -0.306, 0.026, -0.55) });
      // Finger grooves: thin darker lines over the back of the hand.
      if (hi) for (const z of [-0.012, 0.0, 0.012]) box(g, 0.002, 0.034, 0.002, { slot: S.skin, shade: 0.62, m: M(0.0235, -0.388, z + 0.005, 0.12) });
    });
    sided('elbow', 'cuffs', (g) => {
      tube(g, [rg(-0.245, 0.0345, 0.0315, 0, { shade: 0.8 }), rg(-0.24, 0.0355, 0.0325), rg(-0.215, 0.0365, 0.0335), rg(-0.209, 0.0345, 0.0315, 0, { shade: 0.8 })], { seg: SEG.limb, slot: S.trim });
    });

    // ---- legs -------------------------------------------------------------
    sided('hip', 0, (g) => {
      const f = g.pos.length / 3;
      const sm = (th) => seam(th, Math.PI / 2, 0.16, 0.22) * seam(th, -Math.PI / 2, 0.16, 0.18);
      const L = (y, rx, rz, cz, slot, shade) => rg(y, rx, rz, cz, { slot, shade, sh: sm });
      tube(g, [
        L(-0.48, 0, 0, 0, S.legL), L(-0.468, 0.036, 0.04, 0, S.legL, 0.9), L(-0.45, 0.053, 0.058, 0, S.legL), L(-0.4, 0.058, 0.062, 0, S.legL), L(-0.33, 0.066, 0.07, 0, S.legL),
        L(-0.271, 0.0715, 0.0755, 0.002, S.legL), L(-0.2705, 0.0716, 0.0757, 0.002, S.thighU, 1), L(-0.18, 0.082, 0.086, 0.003, S.thighU), L(-0.1, 0.087, 0.09, 0.004, S.thighU), L(-0.04, 0.088, 0.09, 0.004, S.thighU),
        L(0.0, 0.08, 0.082, 0.002, S.thighU), L(0.03, 0.05, 0.055, 0, S.thighU), L(0.045, 0, 0, 0, S.thighU),
      ], { seg: SEG.limb });
      occlude(g, f, [{ x: -0.09, y: 0.0, z: 0, r: 0.06, k: 0.4 }]);
    });
    sided('hip', 'oSoldier', (g) => {
      box(g, 0.03, 0.11, 0.1, { slot: S.bottom, shade: 0.82, m: M(0.082, -0.2, 0.0) });
      box(g, 0.034, 0.02, 0.104, { slot: S.bottom, shade: 0.95, m: M(0.085, -0.15, 0.0) });
    });
    sided('knee', 0, (g) => {
      const f = g.pos.length / 3;
      const sm = (th) => seam(th, Math.PI / 2, 0.16, 0.22) * seam(th, -Math.PI / 2, 0.16, 0.18);
      const L = (y, rx, rz, cz, shade) => rg(y, rx, rz, cz, { slot: S.legL, shade, sh: sm });
      tube(g, [
        L(-0.445, 0.032, 0.034, 0, 0.85), L(-0.4, 0.035, 0.037, 0, 0.95), L(-0.33, 0.042, 0.045, -0.001), L(-0.24, 0.05, 0.056, -0.01), L(-0.16, 0.052, 0.058, -0.012),
        L(-0.08, 0.048, 0.052, -0.004), L(-0.02, 0.046, 0.05, 0.0), L(0.02, 0.048, 0.05, 0.0), L(0.035, 0.035, 0.04, 0), L(0.045, 0, 0, 0),
      ], { seg: SEG.limb });
      occlude(g, f, [{ x: 0, y: 0.0, z: -0.04, r: 0.05, k: 0.4 }]);
    });
    sided('knee', 'bJeans', (g) => {
      // Turn-up at the ankle.
      tube(g, [rg(-0.442, 0.0385, 0.04, 0, { shade: 0.8 }), rg(-0.42, 0.039, 0.041), rg(-0.398, 0.0385, 0.04, 0, { shade: 0.85 })], { seg: SEG.limb, slot: S.bottom });
    });
    // shoes
    part('ankleL', 'shSneaker', (g) => shoe(g, SHOE_SNEAKER, S.sole, S.shoes, -0.38, 'sneaker'));
    part('ankleR', 'shSneaker', (g) => { shoe(g, SHOE_SNEAKER, S.sole, S.shoes, -0.38, 'sneaker'); mirror(g); });
    part('ankleL', 'shBoot', (g) => shoe(g, SHOE_BOOT, S.dark, S.shoes, -0.45, 'boot'));
    part('ankleR', 'shBoot', (g) => { shoe(g, SHOE_BOOT, S.dark, S.shoes, -0.45, 'boot'); mirror(g); });
    part('ankleL', 'shDress', (g) => shoe(g, SHOE_DRESS, S.dark, S.shoes, -0.42, 'dress'));
    part('ankleR', 'shDress', (g) => { shoe(g, SHOE_DRESS, S.dark, S.shoes, -0.42, 'dress'); mirror(g); });
    function shoe(g, tab, soleSlot, upSlot, cut, kind) {
      tube(g, shoeRings(tab, soleSlot, upSlot, { soleCut: cut }), { seg: SEG.shoe, axis: 'z' });
      if (kind === 'sneaker') {
        box(g, 0.05, 0.004, 0.1, { slot: S.sole, m: M(0, 0.048, 0.05, -0.2) }); // laces
        if (hi) {
          box(g, 0.1, 0.012, 0.022, { slot: S.sole, shade: 0.9, m: M(0, -0.04, 0.0) });
          box(g, 0.003, 0.03, 0.11, { slot: S.sole, shade: 0.9, m: M(0.0465, 0.0, 0.03) });
        }
      } else if (kind === 'boot') {
        tube(g, [rg(0.0, 0.045, 0.05, -0.004, { shade: 0.9 }), rg(0.06, 0.046, 0.051, -0.003), rg(0.12, 0.05, 0.054, 0.0), rg(0.15, 0.052, 0.056, 0.0, { shade: 0.85 })], { seg: SEG.limb, slot: S.shoes });
        box(g, 0.1, 0.026, 0.07, { slot: S.dark, m: M(0, -0.038, -0.052) });
      } else {
        box(g, 0.088, 0.026, 0.05, { slot: S.dark, m: M(0, -0.04, -0.054) });
      }
    }
    // A watch and the dial, for looks that wear one (the Humanoid decides).
    part('elbowL', 'watch', (g) => {
      tube(g, [rg(-0.258, 0.0315, 0.0285), rg(-0.236, 0.0315, 0.0285)], { seg: SEG.limb, slot: S.metal });
      box(g, 0.026, 0.004, 0.022, { slot: S.dark, m: M(0, -0.247, 0.0) });
      box(g, 0.034, 0.02, 0.003, { slot: S.metal, m: M(0.0, -0.247, 0.0295) });
    });

    // ---- finish: pack into joint buffers --------------------------------------
    return (_bp[detail] = { parts, hi });
  }
  // The 'watch' and 'tattoo' parts are only used when a look asks for them.

  const JOINT_NAMES = ['pelvis', 'spine', 'neck', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

  /**
   * The whole blueprint merged per joint for instancing: { joint: { position,
   * normal, aSlot, aShade, index } }. aSlot = slot + 32 * featureId.
   */
  let _crowd = null;
  function crowdBlueprint() {
    if (_crowd) return _crowd;
    const bp = blueprint('lo');
    const out = {};
    let tris = 0;
    for (const j of JOINT_NAMES) {
      const ps = bp.parts.filter((p) => p.joint === j && p.feat !== FEAT_ID.watch);
      if (!ps.length) continue;
      let nv = 0, ni = 0;
      for (const p of ps) { nv += p.g.pos.length / 3; ni += p.g.idx.length; }
      const o = { position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), aSlot: new Float32Array(nv), aShade: new Float32Array(nv), index: new Uint16Array(ni) };
      let vo = 0, io = 0;
      for (const p of ps) {
        const n = p.g.pos.length / 3;
        o.position.set(p.g.pos, vo * 3);
        o.normal.set(p.g.nor, vo * 3);
        for (let i = 0; i < n; i++) { o.aSlot[vo + i] = p.g.slot[i] + 32 * p.feat; o.aShade[vo + i] = p.g.shade[i]; }
        for (let i = 0; i < p.g.idx.length; i++) o.index[io + i] = p.g.idx[i] + vo;
        vo += n;
        io += p.g.idx.length;
      }
      out[j] = o;
      tris += ni / 3;
    }
    out._tris = tris;
    return (_crowd = out);
  }

  /**
   * GLSL for the instanced crowd. `common` goes after the instance attribute
   * declarations (iSkin ... iStyle, aSlot, aShade); `main` goes into
   * begin_vertex and leaves vCrowd (colour) and vRough/vMetal set, and hides
   * (zeroes `transformed`) the vertices of features this instance lacks.
   */
  function crowdShader() {
    let vis = '';
    FEATS.forEach((f, i) => { vis += `  if (f == ${i + 1}) return ${f[1].replace(/F\(/g, 'vhF(')};\n`; });
    const common = `
      int vhHat, vhHair, vhFl, vhO, vhB, vhSH; bool vhNear;
      bool vhF(int b) { return (vhFl & b) != 0; }
      bool vhVisible(int f) {
        int hat = vhHat; int hair = vhHair; int O = vhO; int B = vhB; int SH = vhSH; bool NEAR = vhNear;
        if (f == 0) return true;
${vis}        return true;
      }
      vec3 vhSlotColor(int s) {
        int S = vhO == 4 ? 0 : ((vhO == 0 || vhO == 7) ? 1 : 2);
        if (s == 0) return iSkin;
        if (s == 1) return iHair;
        if (s == 2) return iTop;
        if (s == 3) return iTop * 0.55;
        if (s == 4) return iShirt;
        if (s == 5) return iBottom;
        if (s == 6) return vec3(0.03, 0.025, 0.02);
        if (s == 7) return iShoes;
        if (s == 8) return vec3(0.55, 0.53, 0.48);
        if (s == 9) return vec3(0.012);
        if (s == 10) return iSkin * 0.86;
        if (s == 11) return vec3(0.3);
        if (s == 12) return iTop * 0.8;
        if (s == 14) return iShoes * 0.5 + vec3(0.03);
        if (s == 15) return vec3(0.78, 0.76, 0.72);
        if (s == 16) return vec3(0.05, 0.03, 0.02);
        if (s == 17) return iSkin * vec3(0.85, 0.62, 0.6);
        if (s == 18) return iSkin * vec3(0.35, 0.4, 0.55);
        if (s == 19) return vec3(0.01, 0.014, 0.02);
        if (s == 20) return iHair * 0.9;
        if (s == 21) return vec3(0.75, 0.55, 0.12);
        if (s == 22) return iShirt;
        if (s == 23) return iTop * 0.78 + vec3(0.01);
        if (s == 24) return S >= 1 ? iTop : iSkin;
        if (s == 25) return S >= 2 ? iTop : iSkin;
        if (s == 26) return vhB == 2 ? iSkin : iBottom;
        if (s == 27) return vhB == 0 ? iBottom : iSkin;
        return vec3(1.0, 0.0, 1.0);
      }
      float vhRough(int s) {
        if (s == 7) return 0.38;
        if (s == 6) return 0.4;
        if (s == 0 || s == 17 || s == 18 || s == 10) return 0.56;
        if (s == 15 || s == 16) return 0.12;
        if (s == 19) return 0.06;
        if (s == 11 || s == 21) return 0.3;
        if (s == 1 || s == 20) return 0.72;
        return 0.86;
      }
      float vhMetal(int s) { return (s == 11 || s == 21) ? 0.85 : 0.0; }
    `;
    const main = `
      float vhAS = aSlot;
      int vhSlot = int(mod(vhAS, 32.0) + 0.5);
      int vhFeat = int(floor(vhAS / 32.0 + 0.001));
      int vhW = int(iStyle.w + 0.5);
      vhHat = int(iStyle.x + 0.5); vhHair = int(iStyle.y + 0.5); vhFl = int(iStyle.z + 0.5);
      vhO = vhW % 10; vhB = (vhW / 10) % 10; vhSH = vhW / 100;
      vhNear = distance(cameraPosition, (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz) < 24.0;
      if (!vhVisible(vhFeat)) transformed = vec3(0.0);
    `;
    return { common, main };
  }

  /** Pack a style into the iStyle vec4 the shader reads. */
  function packStyle(st, out) {
    out[0] = st.hat; out[1] = st.hair; out[2] = st.fl; out[3] = st.O + 10 * st.B + 100 * st.SH;
    return out;
  }

  // ------------------------------------------------------ non-instanced meshes
  const classMats = {};
  function classMaterial(cls) {
    let m = classMats[cls];
    if (!m) {
      const pr = CLASS_PROPS[cls];
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: pr[0], metalness: pr[1] });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNightFill = NIGHT_FILL;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uNightFill;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uNightFill;');
      };
      m.customProgramCacheKey = () => 'vh-human-' + cls;
      classMats[cls] = m;
    }
    return m;
  }

  class Humanoid {
    /**
     * opts.rigOnly: build the joints but no meshes. The crowd renderer draws
     * rig-only humanoids with instancing and reads their joint matrices; the
     * geometry comes from Humanoid.crowdBlueprint().
     */
    constructor(look, opts) {
      this.rigOnly = !!(opts && opts.rigOnly);
      this.parts = this.rigOnly ? [] : null; // kept for old callers; the crowd now reads crowdBlueprint()
      this.look = Object.assign({}, JAY_LOOK, look || {});
      if (look && !look.outfit && !look.hairStyle && look.top !== undefined) {
        // A crowd-style look: don't inherit Jay's own jacket and haircut.
        this.look.outfit = undefined; this.look.hairStyle = undefined; this.look.beard = undefined; this.look.leather = false; this.look.watch = undefined;
        this.look.bottomStyle = undefined; this.look.shoeStyle = undefined;
      }
      this.style = styleOf(this.look, (opts && opts.faction) || this.look.faction);
      this.root = new THREE.Group();
      this.root.name = 'humanoid';
      this.joints = {};
      this.meshes = [];
      this.phase = 0;
      this.time = Math.random() * 10;
      this.pose = {};
      this._headLook = 0;
      this._headTarget = 0;
      this._headTimer = 2;
      this._build();
    }

    _mesh(geo, mat, parent, x, y, z) {
      if (this.rigOnly) {
        const stand = new THREE.Object3D();
        stand.position.set(x || 0, y || 0, z || 0);
        parent.add(stand);
        this.parts.push({ geo, slot: mat, stand, parent });
        return stand;
      }
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      this.meshes.push(m);
      return m;
    }

    _joint(name, parent, x, y, z) {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    }

    _build() {
      const pelvis = this._joint('pelvis', this.root, 0, 0.97, 0);
      const spine = this._joint('spine', pelvis, 0, 0.08, 0);
      const neck = this._joint('neck', spine, 0, 0.52, 0);
      const head = this._joint('head', neck, 0, 0.1, 0);
      this.headGroup = head;
      for (const side of ['L', 'R']) {
        const s = side === 'L' ? 1 : -1;
        const shoulder = this._joint('shoulder' + side, spine, s * 0.215, 0.45, -0.01);
        this._joint('elbow' + side, shoulder, 0, -0.29, 0);
        const hip = this._joint('hip' + side, pelvis, s * 0.092, -0.03, 0);
        const knee = this._joint('knee' + side, hip, 0, -0.45, 0);
        this._joint('ankle' + side, knee, 0, -0.44, 0);
      }
      if (!this.rigOnly) this._buildMeshes();
    }

    /** Merge the features this look wears into a few vertex-coloured meshes. */
    _buildMeshes() {
      const L = this.look;
      const st = this.style;
      const ghost = !!L.ghost;
      const P = pal(L);
      const bp = blueprint('hi');
      const wantWatch = !!L.watch;
      const tmp = new THREE.Color();
      const colours = [];
      for (let s = 0; s < 28; s++) colours.push(slotColor(s, P, st, new THREE.Color()).clone());
      const classOf = (slot) => {
        if (slot === SLOT.top || slot === SLOT.trim || slot === SLOT.sleeveS || slot === SLOT.sleeveL || slot === SLOT.vest) return L.leather ? 'leather' : 'cloth';
        return SLOT_CLASS[slot] || 'cloth';
      };
      const groups = new Map(); // joint|class → buffers
      for (const p of bp.parts) {
        const name = p.feat ? FEATS[p.feat - 1][0] : '';
        if (p.feat && !(name === 'watch' ? wantWatch : featOn(p.feat, st))) continue;
        const g = p.g;
        const nv = g.pos.length / 3;
        const colour = (i) => {
          let c = colours[g.slot[i]];
          if (name === 'watch' && g.slot[i] === SLOT.metal) c = tmp.set(L.watch);
          return c;
        };
        for (let t = 0; t < g.idx.length; t += 3) {
          const cls = ghost ? 'cloth' : classOf(g.slot[g.idx[t]]);
          const key = p.joint + '|' + cls;
          let G = groups.get(key);
          if (!G) groups.set(key, (G = { joint: p.joint, cls, pos: [], nor: [], col: [], idx: [], map: new Map() }));
          for (let k = 0; k < 3; k++) {
            const vi = g.idx[t + k];
            let ni = G.map.get(g) && G.map.get(g).get(vi);
            if (ni === undefined) {
              ni = G.pos.length / 3;
              G.pos.push(g.pos[vi * 3], g.pos[vi * 3 + 1], g.pos[vi * 3 + 2]);
              G.nor.push(g.nor[vi * 3], g.nor[vi * 3 + 1], g.nor[vi * 3 + 2]);
              const c = colour(vi), sh = Math.min(1.1, g.shade[vi]);
              G.col.push(c.r * sh, c.g * sh, c.b * sh);
              if (!G.map.has(g)) G.map.set(g, new Map());
              G.map.get(g).set(vi, ni);
            }
            G.idx.push(ni);
          }
        }
      }
      let tris = 0;
      for (const G of groups.values()) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
        geo.setIndex(G.idx);
        tris += G.idx.length / 3;
        const mat = ghost ? Humanoid.ghostMaterial() : classMaterial(G.cls);
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = !ghost;
        m.receiveShadow = !ghost;
        this.joints[G.joint].add(m);
        this.meshes.push(m);
      }
      this.triangles = tris;
    }

    setVisible(v) {
      this.root.visible = v;
    }

    /** Hide the head (first-person camera) without hiding the body. */
    setHeadVisible(v) {
      this.headGroup.visible = v;
    }

    /**
     * Advance the procedural animation.
     * s = { speed, grounded, vy, crouch (0..1), aim (0..1), climb (-1 or 0..1),
     *       sprint, backwards, land (0..1 impact), lookPitch }
     */
    animate(dt, s) {
      this.time += dt;
      const J = this.joints;
      const speed = s.speed;
      const w = smoothstep(0.05, 1.2, speed); // walking at all
      const r = smoothstep(2.4, 5.2, speed); // running
      const sp = s.sprint ? smoothstep(5.2, 7.2, speed) : 0;
      const crouch = s.crouch || 0;

      // Gait phase advances with distance covered, so feet roughly match the ground.
      const stride = clamp(1.0 + speed * 0.24, 1.05, 2.9) * (1 - crouch * 0.35);
      const dir = s.backwards ? -1 : 1;
      this.phase += dir * (speed / stride) * Math.PI * 2 * dt;
      const p = this.phase;
      // A footfall every half cycle (used for footstep sounds).
      const stepIndex = Math.floor(p / Math.PI);
      if (stepIndex !== this._lastStep) {
        this._lastStep = stepIndex;
        if (this.onStep && s.grounded && s.climb < 0 && speed > 0.6) this.onStep(speed);
      }
      const sinP = Math.sin(p);
      const cosP = Math.cos(p);

      const T = {}; // target angles
      const thighAmp = (0.32 + 0.34 * r + 0.14 * sp) * w * (1 - crouch * 0.4);
      const kneeAmp = (0.35 + 0.95 * r + 0.3 * sp) * w;
      T.hipL = sinP * thighAmp;
      T.hipR = -sinP * thighAmp;
      T.kneeL = 0.06 + kneeAmp * Math.max(0, cosP) + 0.18 * r * Math.max(0, -cosP) * 0.5;
      T.kneeR = 0.06 + kneeAmp * Math.max(0, -cosP) + 0.18 * r * Math.max(0, cosP) * 0.5;
      T.ankleL = -T.hipL * 0.35 + T.kneeL * 0.25;
      T.ankleR = -T.hipR * 0.35 + T.kneeR * 0.25;
      const armAmp = (0.22 + 0.55 * r + 0.25 * sp) * w;
      T.shoulderL = -sinP * armAmp;
      T.shoulderR = sinP * armAmp;
      T.elbowL = 0.2 + 0.25 * w + 0.85 * r;
      T.elbowR = 0.2 + 0.25 * w + 0.85 * r;
      // The trailing arm opens its elbow and the leading one closes it, as in a real gait.
      T.elbowL += -sinP * 0.22 * w * (0.5 + r);
      T.elbowR += sinP * 0.22 * w * (0.5 + r);
      T.splay = 0.07 + 0.04 * r;
      T.lean = 0.03 * w + 0.12 * r + 0.1 * sp;
      T.pelvisY = 0.97 + Math.cos(p * 2) * (0.012 + 0.028 * r) * w - 0.02 * r;
      T.twist = sinP * 0.07 * w;
      T.headYaw = 0;
      // Hips roll and sway over the standing foot; the shoulders answer.
      T.roll = sinP * (0.035 + 0.02 * r) * w;
      T.sway = -sinP * (0.014 + 0.008 * r) * w;

      // Idle life: breathing, weight shifting, and the occasional glance around.
      const idle = 1 - w;
      const breath = Math.sin(this.time * 1.9);
      T.lean += Math.sin(this.time * 1.7) * 0.015 * idle;
      T.shoulderL += Math.sin(this.time * 1.1) * 0.03 * idle;
      T.shoulderR -= Math.sin(this.time * 1.1 + 0.5) * 0.03 * idle;
      const shift = Math.sin(this.time * 0.37) * idle;
      T.roll += shift * 0.03;
      T.sway += shift * 0.016;
      T.hipL += Math.max(0, -shift) * 0.05;
      T.hipR += Math.max(0, shift) * 0.05;
      T.kneeL += Math.max(0, -shift) * 0.08;
      T.kneeR += Math.max(0, shift) * 0.08;
      this._headTimer -= dt;
      if (this._headTimer <= 0) {
        this._headTimer = 2 + Math.random() * 4;
        this._headTarget = idle > 0.5 && Math.random() < 0.6 ? (Math.random() - 0.5) * 1.1 : 0;
      }
      T.headYaw = this._headTarget * idle;
      T.headPitch = 0;
      // The head holds steady against each footfall.
      T.headBob = -Math.cos(p * 2) * (0.012 + 0.02 * r) * w;

      // Crouch: sink the hips with knees bent, torso forward.
      if (crouch > 0) {
        const a = 0.86 * crouch;
        T.hipL += a;
        T.hipR += a;
        T.kneeL += 2 * a * 0.95;
        T.kneeR += 2 * a * 0.95;
        T.ankleL -= a * 0.9;
        T.ankleR -= a * 0.9;
        T.pelvisY -= 0.33 * crouch;
        T.lean += 0.32 * crouch;
        T.elbowL += 0.5 * crouch;
        T.elbowR += 0.5 * crouch;
      }

      // Airborne.
      if (!s.grounded && s.climb < 0) {
        const rising = s.vy > 0.5 ? 1 : 0;
        const falling = smoothstep(-2, -9, s.vy);
        T.hipL = 0.55 * rising + 0.2 * falling + T.hipL * 0.2;
        T.kneeL = 0.95 * rising + 0.35 * falling;
        T.hipR = 0.05 * rising - 0.1 * falling + T.hipR * 0.2;
        T.kneeR = 0.35 * rising + 0.5 * falling;
        T.shoulderL = 0.35 * rising - 0.2 * falling;
        T.shoulderR = -0.15 * rising - 0.2 * falling;
        T.splay = 0.25 + 0.75 * falling;
        T.elbowL = 0.5;
        T.elbowR = 0.5;
        T.lean = 0.1 * rising - 0.05 * falling;
        T.pelvisY = 0.97;
        T.roll = 0; T.sway = 0; T.headBob = 0;
      }

      // Landing: a knee dip proportional to the impact.
      const land = s.land || 0;
      if (land > 0) {
        T.hipL += 0.5 * land;
        T.hipR += 0.5 * land;
        T.kneeL += 1.0 * land;
        T.kneeR += 1.0 * land;
        T.ankleL -= 0.5 * land;
        T.ankleR -= 0.5 * land;
        T.pelvisY -= 0.2 * land;
        T.lean += 0.25 * land;
      }

      // Climbing: reach up, then push down while a knee comes up.
      if (s.climb >= 0) {
        const t = s.climb;
        const reach = 1 - smoothstep(0.35, 0.8, t);
        const push = smoothstep(0.35, 0.75, t) * (1 - smoothstep(0.85, 1, t));
        T.shoulderL = 2.7 * reach + 0.5 * push;
        T.shoulderR = 2.7 * reach + 0.5 * push;
        T.elbowL = 0.3 * reach + 1.0 * push;
        T.elbowR = 0.3 * reach + 1.0 * push;
        T.splay = 0.15;
        T.hipL = 0.3 + 1.2 * push;
        T.kneeL = 0.6 + 1.6 * push;
        T.hipR = 0.1 + 0.4 * push;
        T.kneeR = 0.4 + 0.5 * push;
        T.lean = 0.25 + 0.35 * push;
        T.pelvisY = 0.97;
        T.roll = 0; T.sway = 0; T.headBob = 0;
      }

      // Aiming (Phase 1: fists up in a guard; weapons arrive in Phase 7).
      const aim = s.aim || 0;
      if (aim > 0) {
        T.shoulderL = VH.math.lerp(T.shoulderL, 1.05, aim);
        T.shoulderR = VH.math.lerp(T.shoulderR, 1.2, aim);
        T.elbowL = VH.math.lerp(T.elbowL, 1.9, aim);
        T.elbowR = VH.math.lerp(T.elbowR, 1.7, aim);
        T.splay = VH.math.lerp(T.splay, 0.28, aim);
        T.headPitch = -(s.lookPitch || 0) * 0.5 * aim;
        T.lean += 0.08 * aim;
        T.roll *= 1 - aim * 0.7;
      }

      // Gestures while talking.
      const talk = s.talk || 0;
      if (talk > 0) {
        const t = this.time;
        // A shouted line throws both arms about, quicker; a whisper barely moves.
        const e = s.talkEnergy === undefined ? 0.5 : s.talkEnergy;
        const amp = 0.55 + 0.95 * e;
        const sp = 0.8 + 0.6 * e;
        T.shoulderR = VH.math.lerp(T.shoulderR, 0.45 + 0.3 * amp * Math.sin(t * 2.3 * sp), talk);
        T.elbowR = VH.math.lerp(T.elbowR, 1.05 + 0.35 * amp * Math.sin(t * 3.7 * sp + 1), talk);
        T.shoulderL = VH.math.lerp(T.shoulderL, 0.15 + 0.2 * amp * Math.sin(t * 1.9 * sp + 2), talk * (0.35 + 0.6 * e));
        T.elbowL = VH.math.lerp(T.elbowL, 0.5 + 0.3 * amp * Math.sin(t * 2.9 * sp), talk * (0.35 + 0.6 * e));
        T.headYaw += 0.12 * amp * Math.sin(t * 0.9) * talk;
        T.headPitch += (0.06 * amp * Math.sin(t * 2.2 * sp) - 0.04 * e) * talk;
        T.lean += 0.05 * e * talk;
      }
      // On the phone: right hand at the ear, head tilted.
      const phone = s.phone || 0;
      if (phone > 0) {
        T.shoulderR = VH.math.lerp(T.shoulderR, 0.35, phone);
        T.elbowR = VH.math.lerp(T.elbowR, 2.55, phone);
        T.headPitch += 0.15 * phone;
      }
      // Hands up (surrender, a hold-up).
      const hands = s.handsUp || 0;
      if (hands > 0) {
        T.shoulderL = VH.math.lerp(T.shoulderL, 2.85, hands);
        T.shoulderR = VH.math.lerp(T.shoulderR, 2.85, hands);
        T.elbowL = VH.math.lerp(T.elbowL, 0.55, hands);
        T.elbowR = VH.math.lerp(T.elbowR, 0.55, hands);
        T.splay = VH.math.lerp(T.splay, 0.4, hands);
      }
      // Cowering: arms over the head.
      const cower = s.cower || 0;
      if (cower > 0) {
        T.shoulderL = VH.math.lerp(T.shoulderL, 2.3, cower);
        T.shoulderR = VH.math.lerp(T.shoulderR, 2.3, cower);
        T.elbowL = VH.math.lerp(T.elbowL, 2.2, cower);
        T.elbowR = VH.math.lerp(T.elbowR, 2.2, cower);
        T.lean += 0.35 * cower;
        T.headPitch += 0.3 * cower;
      }
      // Dancing, on the beat. s.beat runs 0..1 through each beat, s.beatN counts
      // them, and s.danceStyle picks the moves (fist pump, hands up, a side
      // step with swinging arms, pointing at the DJ).
      const dance = s.dance || 0;
      if (dance > 0) {
        const L = VH.math.lerp;
        const b = s.beat !== undefined ? s.beat : (this.time * 2.07) % 1;
        const n = s.beatN !== undefined ? s.beatN : Math.floor(this.time * 2.07);
        const ph = b * Math.PI * 2;
        const bounce = 0.5 + 0.5 * Math.cos(ph); // 1 right on the beat
        const side = n % 2 ? -1 : 1;
        const swing = Math.sin((n % 2 + b) * Math.PI); // across two beats
        T.kneeL = L(T.kneeL, 0.12 + 0.38 * bounce, dance);
        T.kneeR = L(T.kneeR, 0.12 + 0.38 * bounce, dance);
        T.hipL = L(T.hipL, -0.14 * bounce, dance);
        T.hipR = L(T.hipR, -0.14 * bounce, dance);
        T.ankleL = L(T.ankleL, 0.1 * bounce, dance);
        T.ankleR = L(T.ankleR, 0.1 * bounce, dance);
        T.pelvisY = L(T.pelvisY, 0.955 - 0.06 * bounce, dance);
        T.headPitch += 0.12 * bounce * dance;
        T.roll = L(T.roll, 0.06 * swing, dance);
        switch ((s.danceStyle || 0) % 4) {
          case 0: // fist pump
            T.shoulderR = L(T.shoulderR, 2.45 + 0.4 * bounce, dance);
            T.elbowR = L(T.elbowR, 0.35 + 0.5 * (1 - bounce), dance);
            T.shoulderL = L(T.shoulderL, 0.45 + 0.2 * swing, dance);
            T.elbowL = L(T.elbowL, 1.5, dance);
            T.twist = L(T.twist, 0.12 * side, dance);
            break;
          case 1: // hands up, swaying
            T.shoulderL = L(T.shoulderL, 2.5 + 0.25 * swing, dance);
            T.shoulderR = L(T.shoulderR, 2.5 - 0.25 * swing, dance);
            T.elbowL = L(T.elbowL, 0.7, dance);
            T.elbowR = L(T.elbowR, 0.7, dance);
            T.splay = L(T.splay, 0.35, dance);
            T.lean = L(T.lean, 0.04, dance);
            T.twist = L(T.twist, 0.3 * swing, dance);
            break;
          case 2: // side step, arms swinging
            T.shoulderL = L(T.shoulderL, 0.55 + 0.6 * swing, dance);
            T.shoulderR = L(T.shoulderR, 0.55 - 0.6 * swing, dance);
            T.elbowL = L(T.elbowL, 1.6, dance);
            T.elbowR = L(T.elbowR, 1.6, dance);
            T.hipL = L(T.hipL, 0.25 * swing, dance);
            T.hipR = L(T.hipR, -0.25 * swing, dance);
            T.twist = L(T.twist, 0.35 * swing, dance);
            T.headYaw += 0.15 * swing * dance;
            break;
          default: // pointing at the DJ on the beat
            T.shoulderR = L(T.shoulderR, 1.6 + 0.7 * bounce, dance);
            T.elbowR = L(T.elbowR, 0.15, dance);
            T.shoulderL = L(T.shoulderL, 0.35 + 0.25 * swing, dance);
            T.elbowL = L(T.elbowL, 1.2, dance);
            T.headYaw += 0.2 * side * dance;
            break;
        }
      }
      // Limp.
      if (s.dead) {
        T.hipL = 0.1;
        T.hipR = -0.05;
        T.kneeL = 0.2;
        T.kneeR = 0.35;
        T.shoulderL = 0.35;
        T.shoulderR = -0.2;
        T.elbowL = 0.3;
        T.elbowR = 0.6;
        T.splay = 0.6;
        T.lean = 0;
        T.headYaw = 0.6;
        T.roll = 0; T.sway = 0; T.headBob = 0;
      }
      // Weapon stances (combat): a pistol held out, or a long gun at the shoulder.
      if (s.weaponPose && aim > 0) {
        if (s.weaponPose === 'rifle') {
          T.shoulderR = VH.math.lerp(T.shoulderR, 1.25, aim);
          T.elbowR = VH.math.lerp(T.elbowR, 1.35, aim);
          T.shoulderL = VH.math.lerp(T.shoulderL, 1.45, aim);
          T.elbowL = VH.math.lerp(T.elbowL, 0.55, aim);
          T.splay = VH.math.lerp(T.splay, 0.12, aim);
        } else if (s.weaponPose === 'pistol') {
          T.shoulderR = VH.math.lerp(T.shoulderR, 1.55 + (s.lookPitch || 0) * 0.8, aim);
          T.elbowR = VH.math.lerp(T.elbowR, 0.08, aim);
          T.shoulderL = VH.math.lerp(T.shoulderL, 1.35 + (s.lookPitch || 0) * 0.8, aim);
          T.elbowL = VH.math.lerp(T.elbowL, 0.5, aim);
          T.splay = VH.math.lerp(T.splay, 0.05, aim);
        }
      }
      if (s.swing > 0) {
        // A swing: wind up, then strike across the body.
        const k = Math.sin((1 - s.swing) * Math.PI);
        T.shoulderR = VH.math.lerp(T.shoulderR, 2.1 - 1.6 * (1 - s.swing), k);
        T.elbowR = VH.math.lerp(T.elbowR, 0.35, k);
        T.twist += 0.5 * k * (s.swing > 0.5 ? -1 : 1);
        T.lean += 0.12 * k;
      }
      if (s.recoil) {
        T.shoulderR -= s.recoil * 0.25;
        T.elbowR += s.recoil * 0.2;
      }

      // Smoothly move every joint toward its target.
      const P = this.pose;
      const k = 16;
      const ease = (name, target, rate) => {
        const cur = P[name] === undefined ? target : P[name];
        P[name] = damp(cur, target, rate || k, dt);
        return P[name];
      };
      J.hipL.rotation.x = -ease('hipL', T.hipL);
      J.hipR.rotation.x = -ease('hipR', T.hipR);
      J.kneeL.rotation.x = ease('kneeL', T.kneeL);
      J.kneeR.rotation.x = ease('kneeR', T.kneeR);
      J.ankleL.rotation.x = -ease('ankleL', T.ankleL);
      J.ankleR.rotation.x = -ease('ankleR', T.ankleR);
      J.shoulderL.rotation.x = -ease('shoulderL', T.shoulderL);
      J.shoulderR.rotation.x = -ease('shoulderR', T.shoulderR);
      const splay = ease('splay', T.splay);
      J.shoulderL.rotation.z = splay;
      J.shoulderR.rotation.z = -splay;
      J.elbowL.rotation.x = -ease('elbowL', T.elbowL);
      J.elbowR.rotation.x = -ease('elbowR', T.elbowR);
      J.spine.rotation.x = ease('lean', T.lean, 8);
      J.spine.rotation.y = -ease('twist', T.twist) * 1.4;
      J.pelvis.rotation.y = P.twist;
      const roll = ease('roll', T.roll, 9);
      J.pelvis.rotation.z = roll;
      J.spine.rotation.z = -roll * 0.9;
      J.pelvis.position.x = ease('sway', T.sway, 9);
      J.pelvis.position.y = ease('pelvisY', T.pelvisY, 14);
      J.neck.rotation.y = ease('headYaw', T.headYaw, 4);
      J.neck.rotation.x = ease('headPitch', T.headPitch, 10) - P.lean * 0.5 + ease('headBob', T.headBob, 12);
      J.neck.rotation.z = roll * 0.7;
      // Breathing: the chest swells a little.
      const b = breath * idle * 0.5 + 0.5 * w * Math.sin(p * 2) * 0.3;
      J.spine.scale.set(1 + b * 0.006, 1 + b * 0.004, 1 + b * 0.012);
    }
  }

  /** Shared see-through material for the challenge ghost. */
  Humanoid.ghostMaterial = function ghostMaterial() {
    if (!Humanoid._ghostMat) {
      Humanoid._ghostMat = new THREE.MeshStandardMaterial({
        color: 0x7fe8ff, emissive: new THREE.Color(0.15, 0.7, 0.9), roughness: 0.4, metalness: 0,
        transparent: true, opacity: 0.36, depthWrite: false,
      });
    }
    return Humanoid._ghostMat;
  };

  Humanoid.JAY_LOOK = JAY_LOOK;
  Humanoid.material = (hex, roughness) => new THREE.MeshStandardMaterial({ color: hex, roughness });
  Humanoid.setNightFill = setNightFill;
  Humanoid.nightFill = NIGHT_FILL; // shared uniform for the instanced crowd
  Humanoid.styleOf = styleOf;
  Humanoid.packStyle = packStyle;
  Humanoid.crowdBlueprint = crowdBlueprint;
  Humanoid.crowdShader = crowdShader;
  Humanoid.JOINT_NAMES = JOINT_NAMES;
  /** Triangles a person wearing `look` puts on screen (detail 'lo' = crowd, 'hi' = Jay); near = face detail on. */
  Humanoid.countTris = function countTris(look, faction, detail, near) {
    const st = styleOf(Object.assign({}, look), faction);
    let n = 0, all = 0;
    for (const p of blueprint(detail || 'lo').parts) {
      const name = p.feat ? FEATS[p.feat - 1][0] : '';
      all += p.g.idx.length / 3;
      if (name === 'watch' || (name === 'near' || name === 'mouth' || name === 'mouthBeard') && near === false) continue;
      if (featOn(p.feat, st)) n += p.g.idx.length / 3;
    }
    return { visible: n, blueprint: all };
  };
  Humanoid.STYLE = { HAIR, HAT, TOP, BOT, SHOE, FLAG };
  Humanoid._blueprint = blueprint;
  VH.Humanoid = Humanoid;
})();
