/*
 * crowd.js — everyone in Vicehaven who isn't Jay.
 *
 * Rendering: every person is a rig-only Humanoid (joints, no meshes). The
 * body parts of one template rig are merged per joint, and each joint is a
 * single InstancedMesh. Per-instance colour attributes (skin, hair, top,
 * shirt, bottom, shoes) and style flags (cap, long hair) give everyone a
 * different look, so the whole crowd draws in about 14 calls.
 *
 * Agents have a brain. Built in:
 *   walker   strolls the pavements around the blocks, waits for the lights
 *            and crosses at the zebra crossings, stops to look at a phone
 *   flee     runs away from danger (gunfire, crashes, a car on the pavement)
 *   down     knocked over (by a car, a blast): flies, lands, lies still,
 *            gets up again if still alive
 * Other systems (combat, police, missions) plug in their own brains with
 * an update(agent, dt) method.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp, lerp, smoothstep, dampAngle } = VH.math;

  const MAX_RAGDOLLS = 14; // bodies simulated at once; any more just fall flat
  const SLOTS = { skin: 0, hair: 1, top: 2, trim: 3, shirt: 4, bottom: 5, belt: 6, shoes: 7, sole: 8, dark: 9, stubble: 10, metal: 11, cap: 12, hairLong: 13, bag: 14 };
  const JOINTS = ['pelvis', 'spine', 'neck', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

  // Looks. sRGB hex.
  const SKINS = [0xf1c8a8, 0xe0b08a, 0xc68c64, 0xa86e4c, 0x8a5638, 0x6b3f28, 0x4e2c1c, 0xd8a47e, 0xb77b52];
  const HAIRS = [0x16110d, 0x2a1d14, 0x4a3222, 0x6e4a2c, 0xa77b48, 0xd8b878, 0x8a8a8a, 0xc9c6c0, 0x5a1f14, 0x101010];
  const TOPS = [0xf4f1ea, 0x1d2430, 0xd9534f, 0x2c7bb6, 0x5fb59c, 0xf0c05a, 0xe57fa9, 0x7b6cd9, 0x3d3d3d, 0xff8a3d, 0x8fd1e8, 0x9bc46a, 0xc7a17a, 0x33415c, 0xffffff, 0xb24a7a];
  const BOTTOMS = [0x2e3f5c, 0x3b4a66, 0x1c1c1f, 0xd7cdb8, 0x6b6f4a, 0x9aa3ad, 0x4a3b2e, 0xe9e6de, 0x243044];
  const SHOES = [0xefefef, 0x202020, 0x6b4a2e, 0xd8d0c0, 0x2f6fc2, 0xc0392b];

  /** A random ordinary look (optionally seeded). */
  function randomLook(rng) {
    const r = rng || Math.random;
    const pick = (a) => a[Math.floor(r() * a.length)];
    const skin = pick(SKINS);
    const top = pick(TOPS);
    return {
      skin, hair: pick(HAIRS), top, trim: top, shirt: r() < 0.5 ? pick(TOPS) : top, bottom: pick(BOTTOMS), shoes: pick(SHOES),
      cap: r() < 0.16, longHair: r() < 0.38, height: 0.93 + r() * 0.12, build: 0.92 + r() * 0.2,
    };
  }

  // ----------------------------------------------------- the crowd shader
  function patchCrowdShader(shader, depthOnly) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSlot;
        attribute float aShade;
        attribute vec3 iSkin;
        attribute vec3 iHair;
        attribute vec3 iTop;
        attribute vec3 iShirt;
        attribute vec3 iBottom;
        attribute vec3 iShoes;
        attribute vec4 iStyle;
        ${depthOnly ? '' : 'varying vec3 vCrowd;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float slot = floor(aSlot + 0.5);
        // Style parts only exist on instances that have them.
        if ((slot == 12.0 && iStyle.x < 0.5) || (slot == 13.0 && iStyle.y < 0.5) || (slot == 14.0 && iStyle.z < 0.5)) transformed = vec3(0.0);
        if (slot == 1.0 && iStyle.x > 0.5) transformed = vec3(0.0); // the cap replaces the hair cap
        ${depthOnly ? '' : `
        vec3 c = vec3(1.0);
        if (slot == 0.0) c = iSkin;
        else if (slot == 1.0 || slot == 13.0) c = iHair;
        else if (slot == 2.0) c = iTop;
        else if (slot == 3.0) c = iTop * 0.55;
        else if (slot == 4.0) c = iShirt;
        else if (slot == 5.0) c = iBottom;
        else if (slot == 6.0) c = vec3(0.03, 0.025, 0.02);
        else if (slot == 7.0) c = iShoes;
        else if (slot == 8.0) c = vec3(0.35, 0.25, 0.14);
        else if (slot == 9.0) c = vec3(0.01);
        else if (slot == 10.0) c = iSkin * 0.8;
        else if (slot == 11.0) c = vec3(0.3);
        else if (slot == 12.0) c = iTop * 0.7 + vec3(0.02);
        else if (slot == 14.0) c = iShoes * 0.5 + vec3(0.03);
        vCrowd = c * aShade;`}`);
    if (!depthOnly) {
      if (VH.Humanoid && VH.Humanoid.nightFill) shader.uniforms.uNightFill = VH.Humanoid.nightFill;
      else shader.uniforms.uNightFill = { value: 0 };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCrowd;\nuniform float uNightFill;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vCrowd;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uNightFill;');
    }
  }

  class CrowdRenderer {
    constructor(scene, max) {
      this.max = max;
      this.scene = scene;
      this.meshes = [];
      const template = new VH.Humanoid({}, { rigOnly: true });
      this._addStyleParts(template);
      template.root.updateMatrixWorld(true);
      // Palette attributes shared by every joint mesh.
      const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
      this.pal = { iSkin: attr(3), iHair: attr(3), iTop: attr(3), iShirt: attr(3), iBottom: attr(3), iShoes: attr(3), iStyle: attr(4) };
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
      mat.onBeforeCompile = (sh) => patchCrowdShader(sh, false);
      mat.customProgramCacheKey = () => 'vh-crowd';
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (sh) => patchCrowdShader(sh, true);
      depth.customProgramCacheKey = () => 'vh-crowd-depth';
      this.material = mat;
      for (const name of JOINTS) {
        const joint = template.joints[name] || (name === 'head' ? template.headGroup : null);
        const parts = template.parts.filter((p) => this._jointOf(p, template) === name);
        if (!parts.length) continue;
        const geos = [];
        for (const p of parts) {
          p.stand.updateMatrix();
          // Transform from the part to its joint (parts may sit under sub-groups).
          const m = new THREE.Matrix4();
          let o = p.stand;
          while (o && o !== joint) {
            o.updateMatrix();
            m.premultiply(o.matrix);
            o = o.parent;
          }
          const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
          g.applyMatrix4(m);
          for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
          const n = g.attributes.position.count;
          const slot = SLOTS[p.slot] !== undefined ? SLOTS[p.slot] : 0;
          g.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(n).fill(slot), 1));
          g.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
          geos.push(g);
        }
        const merged = CrowdRenderer.merge(geos);
        for (const k of Object.keys(this.pal)) merged.setAttribute(k, this.pal[k]);
        const mesh = new THREE.InstancedMesh(merged, mat, max);
        mesh.customDepthMaterial = depth;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.name = 'crowd:' + name;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        this.meshes.push({ name, mesh });
      }
      this.count = 0;
    }

    _jointOf(part, template) {
      let o = part.parent;
      while (o) {
        if (JOINTS.includes(o.name)) return o.name;
        if (o === template.headGroup) return 'head';
        o = o.parent;
      }
      return 'pelvis';
    }

    /** Extra parts that only some people have: a cap, long hair, a shoulder bag. */
    _addStyleParts(h) {
      const head = h.headGroup;
      const cap = new THREE.SphereGeometry(0.124, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      cap.scale(0.95, 0.8, 1.02);
      h._mesh(cap, 'cap', head, 0, 0.1, -0.005);
      const brim = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12, 1, false, -Math.PI / 2, Math.PI);
      brim.scale(1, 1, 1.5);
      h._mesh(brim, 'cap', head, 0, 0.105, 0.1);
      const longHair = new THREE.CylinderGeometry(0.11, 0.1, 0.22, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9);
      h._mesh(longHair, 'hairLong', head, 0, 0.0, -0.02);
      const bag = new THREE.BoxGeometry(0.06, 0.28, 0.22);
      h._mesh(bag, 'bag', h.joints.pelvis, 0.2, 0.02, 0.0);
    }

    static merge(geos) {
      let total = 0;
      for (const g of geos) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      const slot = new Float32Array(total);
      const shade = new Float32Array(total);
      let o = 0;
      for (const g of geos) {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
        slot.set(g.attributes.aSlot.array, o);
        shade.set(g.attributes.aShade.array, o);
        o += n;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
      out.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
      return out;
    }

    /** Write the visible agents into the instance buffers. */
    draw(agents) {
      let i = 0;
      const pal = this.pal;
      for (const a of agents) {
        if (!a.visible || i >= this.max) continue;
        const rig = a.rig;
        for (const m of this.meshes) {
          const j = m.name === 'head' ? rig.headGroup : rig.joints[m.name];
          m.mesh.setMatrixAt(i, j.matrixWorld);
        }
        if (a._slot !== i || a._paletteDirty) {
          const L = a.look;
          const set = (attr, hex) => {
            const c = CrowdRenderer._col(hex);
            attr.setXYZ(i, c.r, c.g, c.b);
          };
          set(pal.iSkin, L.skin);
          set(pal.iHair, L.hair);
          set(pal.iTop, L.top);
          set(pal.iShirt, L.shirt);
          set(pal.iBottom, L.bottom);
          set(pal.iShoes, L.shoes);
          pal.iStyle.setXYZW(i, L.cap ? 1 : 0, L.longHair ? 1 : 0, L.bag ? 1 : 0, 0);
          a._slot = i;
          a._paletteDirty = false;
          this._palDirty = true;
        }
        i++;
      }
      this.count = i;
      for (const m of this.meshes) {
        m.mesh.count = i;
        m.mesh.instanceMatrix.needsUpdate = true;
      }
      if (this._palDirty) {
        for (const k of Object.keys(pal)) pal[k].needsUpdate = true;
        this._palDirty = false;
      }
    }

    static _col(hex) {
      const cache = CrowdRenderer._cache || (CrowdRenderer._cache = new Map());
      let c = cache.get(hex);
      if (!c) {
        c = new THREE.Color(hex);
        cache.set(hex, c);
      }
      return c;
    }
  }

  // ------------------------------------------------------------- agents
  let nextId = 1;

  class Agent {
    constructor(look, opts) {
      this.id = nextId++;
      this.look = look;
      this.rig = new VH.Humanoid({}, { rigOnly: true });
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.moveSpeed = 0;
      this.brain = null;
      this.state = 'walk';
      this.health = opts && opts.health ? opts.health : 100;
      this.maxHealth = this.health;
      this.armor = (opts && opts.armor) || 0;
      this.dead = false;
      this.visible = true;
      this.radius = 0.3;
      this.faction = (opts && opts.faction) || 'civilian';
      this.role = (opts && opts.role) || 'ped';
      this.persistent = !!(opts && opts.persistent);
      this.anim = { crouch: 0, aim: 0, talk: 0, handsUp: 0, cower: 0, phone: 0, sprint: false };
      this.down = null; // { t, vx, vy, vz, spin }
      this._paletteDirty = true;
      this._slot = -1;
      this.grounded = true;
      this.hitTime = -99;
      this.weapon = null;
      this.name = (opts && opts.name) || null;
      const sc = look.height || 1;
      const b = look.build || 1;
      this.rig.root.scale.set(sc * b, sc, sc * b);
    }

    get alive() {
      return !this.dead;
    }

    /** Knock over with a velocity. */
    knock(vx, vy, vz, damage, source) {
      if (this.dead && this.down) return;
      if (this.inCar) return; // riding in a car: the car takes the hit, not the passenger
      this.down = { t: 0, vx, vy, vz, spin: (Math.random() - 0.5) * 6, rest: false, flip: 0 };
      this.state = 'down';
      this.grounded = false;
      this.damage(damage, source, 'impact');
    }

    /** hit (optional) = { x, y, z, dx, dy, dz, head }: where it struck and which way it was going. */
    damage(amount, source, kind, hit) {
      if (this.dead) return;
      if (this.damageScale) amount *= this.damageScale; // named crew are hard to kill
      this.lastHit = hit || null;
      this.lastKind = kind;
      let rest = amount;
      if (this.armor > 0) {
        const a = Math.min(this.armor, rest * 0.6);
        this.armor -= a;
        rest -= a;
      }
      this.health -= rest;
      this.hitTime = VH.game ? VH.game.time : 0;
      this.lastAttacker = source;
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
        this.deadTime = 0;
        if (!this.down) this.down = { t: 0, vx: 0, vy: 0.5, vz: 0, spin: 0, rest: false, flip: 0 };
        this.state = 'down';
        VH.events.emit('agent:died', { agent: this, source, kind, hit, amount });
      } else VH.events.emit('agent:hurt', { agent: this, source, amount, kind, hit });
    }
  }

  // --------------------------------------------------------- the crowd
  class Crowd {
    constructor(game) {
      this.game = game;
      this.scene = game.scene;
      this.physics = game.physics;
      this.layout = game.layout;
      this.agents = [];
      this.renderer = new CrowdRenderer(game.scene, 110);
      this.brains = {};
      this._spawnTimer = 0;
      this._threats = [];
      this.enabled = true;
      this._grid = new Map();
      this._tmp = { x: 0, z: 0 };
      this._resolveOut = { x: 0, z: 0, hit: false };
      this.blocks = this.layout.blocks;
      this.blockAt = (bx, bz) => (bx < 0 || bz < 0 || bx > 7 || bz > 7 ? null : this.blocks[bx * 8 + bz]);
      this._bindEvents();
    }

    get targetCount() {
      const q = this.game.settings.get('graphics.quality');
      const base = q === 'low' ? 18 : q === 'medium' ? 28 : q === 'max' ? 80 : q === 'ultra' ? 60 : 42;
      const night = this.game.environment.nightFactor || 0;
      return Math.round(base * (1 - night * 0.4));
    }

    _bindEvents() {
      VH.events.on('gunshot', (e) => this.threat(e.x, e.z, e.loud ? 45 : 30, 'gun'));
      VH.events.on('explosion', (e) => {
        this.threat(e.x, e.z, 60, 'blast');
        for (const a of this.agents) {
          if (a.inCar) continue; // inside a car; it gets out if the car is wrecked
          const d = Math.hypot(a.pos.x - e.x, a.pos.z - e.z);
          if (d > e.radius) continue;
          const k = 1 - d / e.radius;
          const nx = (a.pos.x - e.x) / (d || 1);
          const nz = (a.pos.z - e.z) / (d || 1);
          a.knock(nx * 9 * k, 4 + 5 * k, nz * 9 * k, 160 * k, e.source && e.source.driver === 'player' ? 'player' : e.source);
        }
      });
      VH.events.on('vehicle:impact', (e) => {
        if (e.speed > 9) this.threat(e.x, e.z, 22, 'crash');
      });
      VH.events.on('vehicle:jack', (e) => {
        // The driver Jay pulls out lands by the door: a job's driver is the
        // job's to place (missions.ejectDriver); a cop gets out to fight; an
        // ordinary driver runs for it.
        const g = this.game;
        const v = e.v;
        if (!(g.missions && g.missions.ejectDriver && g.missions.ejectDriver(v, e.side))) {
          if (v.isPolice && g.police) g.police.deployOfficers(v, 1);
          else {
            const w = v.localToWorld((e.side || 1) * (v.hx + 1.1), v.hz * 0.1, {});
            const a = this.spawn(w.x, w.z, { y: v.pos.y, heading: v.yaw + (e.side || 1) * Math.PI / 2 });
            this._flee(a, v.pos.x, v.pos.z, 6 + Math.random() * 3);
          }
        }
        this.threat(e.x, e.z, 14, 'jack');
      });
    }

    /** Something scary happened here: people nearby run. */
    threat(x, z, radius, kind) {
      for (const a of this.agents) {
        if (a.dead || a.state === 'down' || a.brain) continue;
        const d = Math.hypot(a.pos.x - x, a.pos.z - z);
        if (d > radius) continue;
        this._flee(a, x, z, 5 + Math.random() * 4);
      }
      VH.events.emit('crowd:threat', { x, z, radius, kind });
    }

    _flee(a, x, z, seconds) {
      a.state = 'flee';
      a.flee = { x, z, t: seconds };
      a.anim.sprint = true;
    }

    // ---------------------------------------------------------- spawning
    /** Create an agent. opts: { look, brain, faction, role, persistent, health, armor, name } */
    spawn(x, z, opts) {
      opts = opts || {};
      const a = new Agent(opts.look || randomLook(), opts);
      a.pos.set(x, this.physics.groundHeight(x, z, (opts.y || 0) + 2), z);
      a.heading = opts.heading || 0;
      if (opts.brain) a.brain = opts.brain;
      this.agents.push(a);
      return a;
    }

    remove(a) {
      const i = this.agents.indexOf(a);
      if (i >= 0) this.agents.splice(i, 1);
      a.removed = true;
    }

    _corner(block, c) {
      const i = 2.2;
      const x = c === 0 || c === 3 ? block.minX + i : block.maxX - i;
      const z = c === 0 || c === 1 ? block.minZ + i : block.maxZ - i;
      return { x, z };
    }

    _spawnWalker(focus) {
      for (let tries = 0; tries < 8; tries++) {
        const bx = Math.floor(Math.random() * 8);
        const bz = Math.floor(Math.random() * 8);
        const block = this.blockAt(bx, bz);
        if (!block) continue;
        const c = Math.floor(Math.random() * 4);
        const dirs = Crowd.edgeDirs(c);
        const D = dirs[Math.floor(Math.random() * 2)];
        const a0 = this._corner(block, c);
        const target = Crowd.cornerToward(c, D);
        const a1 = this._corner(block, target);
        const t = Math.random();
        const x = lerp(a0.x, a1.x, t);
        const z = lerp(a0.z, a1.z, t);
        const d = Math.hypot(x - focus.x, z - focus.z);
        if (d < 45 || d > 120) continue;
        if (d < 80 && this.game.isVisible(x, 1, z, 1.2)) continue;
        const a = this.spawn(x, z, { heading: Math.atan2(a1.x - a0.x, a1.z - a0.z) });
        a.walk = { block, corner: target, D, phase: 'edge', wait: 0 };
        a.walkSpeed = 1.1 + Math.random() * 0.55;
        a.idleT = 4 + Math.random() * 20;
        return a;
      }
      return null;
    }

    /** The two edge directions leaving corner c (0 NW, 1 NE, 2 SE, 3 SW). */
    static edgeDirs(c) {
      return [['E', 'S'], ['W', 'S'], ['W', 'N'], ['E', 'N']][c];
    }

    /** The corner reached from c by walking along an edge in direction D. */
    static cornerToward(c, D) {
      const sx = c === 1 || c === 2 ? 1 : -1;
      const sz = c === 2 || c === 3 ? 1 : -1;
      let nx = sx;
      let nz = sz;
      if (D === 'E' || D === 'W') nx = -sx;
      else nz = -sz;
      return Crowd.cornerIndex(nx, nz);
    }

    static cornerIndex(sx, sz) {
      if (sx < 0 && sz < 0) return 0;
      if (sx > 0 && sz < 0) return 1;
      if (sx > 0 && sz > 0) return 2;
      return 3;
    }

    // ------------------------------------------------------------- brains
    _walkerStep(a, dt) {
      const w = a.walk;
      const target = this._corner(w.block, w.corner);
      if (w.phase === 'cross') {
        target.x = w.crossX;
        target.z = w.crossZ;
      }
      if (w.phase === 'wait') {
        a.moveSpeed = 0;
        w.wait -= dt;
        const group = w.crossAxis === 'x' ? 'ns' : 'ew'; // crossing an avenue means waiting for north-south traffic to stop
        const state = this.game.world.signalState[group];
        const j = w.junction;
        const clear = j && j.signal ? state === 'red' && this.game.world._signalTimer > 1 : this._roadClear(a.pos.x, a.pos.z, 26);
        if (w.wait <= 0 && clear) {
          w.phase = 'cross';
          a.onRoad = true;
        }
        a.heading = dampAngle(a.heading, Math.atan2(w.crossX - a.pos.x, w.crossZ - a.pos.z), 4, dt);
        return;
      }
      // Occasional pause: phone, window shopping.
      a.idleT -= dt;
      if (a.idleT <= 0 && w.phase === 'edge') {
        if (!a.pause) a.pause = 2 + Math.random() * 5;
        a.pause -= dt;
        a.moveSpeed = 0;
        a.anim.phone = a.phoneUser ? 1 : 0;
        if (a.pause <= 0) {
          a.pause = 0;
          a.anim.phone = 0;
          a.idleT = 8 + Math.random() * 25;
        }
        return;
      }
      a.phoneUser = a.phoneUser === undefined ? Math.random() < 0.5 : a.phoneUser;
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) {
        if (w.phase === 'cross') {
          // Arrived on the far side.
          w.phase = 'edge';
          a.onRoad = false;
          w.block = w.crossBlock;
          w.corner = w.afterCorner;
          return;
        }
        this._chooseAtCorner(a);
        return;
      }
      a.moveSpeed = w.phase === 'cross' ? a.walkSpeed * 1.25 : a.walkSpeed;
      a.heading = dampAngle(a.heading, Math.atan2(dx, dz), 6, dt);
    }

    _chooseAtCorner(a) {
      const w = a.walk;
      const c = w.corner;
      const dirs = Crowd.edgeDirs(c);
      const rev = { E: 'W', W: 'E', N: 'S', S: 'N' };
      const turnD = dirs[0] === rev[w.D] ? dirs[1] : dirs[0];
      const bx = w.block.bx;
      const bz = w.block.bz;
      const step = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
      // Outward directions at this corner (away from the block).
      const sx = c === 1 || c === 2 ? 'E' : 'W';
      const sz = c === 2 || c === 3 ? 'S' : 'N';
      const options = [['turn', turnD, 0.5]];
      for (const D of [sx, sz]) {
        if (D === rev[w.D]) continue; // never straight back the way we came
        const nb = this.blockAt(bx + step[D][0], bz + step[D][1]);
        if (nb) options.push(['cross', D, D === w.D ? 0.3 : 0.2, nb]);
      }
      let total = 0;
      for (const o of options) total += o[2];
      let r = Math.random() * total;
      let pick = options[0];
      for (const o of options) {
        r -= o[2];
        if (r <= 0) {
          pick = o;
          break;
        }
      }
      if (pick[0] === 'turn') {
        w.D = turnD;
        w.corner = Crowd.cornerToward(c, turnD);
        return;
      }
      const D = pick[1];
      const nb = pick[3];
      // Mirror the corner across the road we cross.
      let mx = c === 1 || c === 2 ? 1 : -1;
      let mz = c === 2 || c === 3 ? 1 : -1;
      if (D === 'E' || D === 'W') mx = -mx;
      else mz = -mz;
      const nc = Crowd.cornerIndex(mx, mz);
      const far = this._corner(nb, nc);
      w.phase = 'wait';
      w.wait = 0.3 + Math.random() * 1.2;
      w.crossX = far.x;
      w.crossZ = far.z;
      w.crossBlock = nb;
      w.crossAxis = D === 'E' || D === 'W' ? 'x' : 'z';
      w.junction = this.game.roadnet.junctionAt((a.pos.x + far.x) / 2, (a.pos.z + far.z) / 2, 12);
      w.D = D;
      // After crossing, keep walking in the same direction along the new block.
      w.afterCorner = Crowd.cornerToward(nc, D);
    }

    _roadClear(x, z, r) {
      for (const v of this.game.vehicles.list) {
        if (v.speed < 1) continue;
        if (Math.hypot(v.pos.x - x, v.pos.z - z) < r) return false;
      }
      return true;
    }

    _fleeStep(a, dt) {
      const f = a.flee;
      f.t -= dt;
      const dx = a.pos.x - f.x;
      const dz = a.pos.z - f.z;
      a.heading = dampAngle(a.heading, Math.atan2(dx, dz) + Math.sin(a.id * 1.7) * 0.5, 5, dt);
      a.moveSpeed = 5 + (a.id % 3) * 0.4;
      a.onRoad = this.game.roadnet.onRoad(a.pos.x, a.pos.z);
      if (f.t <= 0) {
        a.state = 'walk';
        a.anim.sprint = false;
        a.flee = null;
        this._rejoinWalk(a);
      }
    }

    /** Back to strolling: find the nearest pavement corner and carry on. */
    _rejoinWalk(a) {
      let best = null;
      let bestD = Infinity;
      for (const b of this.blocks) {
        for (let c = 0; c < 4; c++) {
          const p = this._corner(b, c);
          const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
          if (d < bestD) {
            bestD = d;
            best = { b, c };
          }
        }
      }
      if (!best) return;
      const dirs = Crowd.edgeDirs(best.c);
      a.walk = { block: best.b, corner: best.c, D: dirs[0], phase: 'edge', wait: 0 };
      a.walkSpeed = a.walkSpeed || 1.3;
      a.idleT = 6 + Math.random() * 15;
    }

    _downStep(a, dt) {
      const d = a.down;
      d.t += dt;
      // The dead fall as ragdolls (a few at a time; extras keep the simple fall).
      if (a.dead && !a.ragdoll && !d.rest && VH.Ragdoll && this._ragdolls() < MAX_RAGDOLLS) this._startRagdoll(a);
      if (a.ragdoll) {
        const r = a.ragdoll;
        r.step(dt);
        a.pos.x = r.pelvis.x;
        a.pos.z = r.pelvis.z;
        a.pos.y = this.physics.groundHeight(a.pos.x, a.pos.z, r.pelvis.y + 0.5);
        a.deadTime += dt;
        if ((r.settled || r.t > 1.2) && !a.pooled) {
          a.pooled = true;
          if (this.game.fx && this.game.fx.bloodPool) this.game.fx.bloodPool(a.pos.x, a.pos.y, a.pos.z, 1.3 + Math.random() * 0.8);
        }
        if (r.settled) d.rest = true;
        return;
      }
      if (!d.rest) {
        d.vy -= 18 * dt;
        a.pos.x += d.vx * dt;
        a.pos.y += d.vy * dt;
        a.pos.z += d.vz * dt;
        a.heading += d.spin * dt;
        d.flip = Math.min(1, d.flip + dt * 3.5);
        const next = this._tmp;
        next.x = a.pos.x;
        next.z = a.pos.z;
        const res = this.physics.resolveCircle(next, 0.3, a.pos.y + 0.2, a.pos.y + 1.0, 0.3, this._resolveOut);
        if (res.hit) {
          const vn = d.vx * res.x + d.vz * res.z;
          if (vn < 0) {
            d.vx -= 1.5 * vn * res.x;
            d.vz -= 1.5 * vn * res.z;
          }
        }
        a.pos.x = next.x;
        a.pos.z = next.z;
        const g = this.physics.groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.4);
        if (a.pos.y <= g) {
          a.pos.y = g;
          if (d.vy < -4) {
            d.vy *= -0.25;
            d.vx *= 0.5;
            d.vz *= 0.5;
            d.spin *= 0.4;
          } else {
            d.vy = 0;
            const f = Math.exp(-6 * dt);
            d.vx *= f;
            d.vz *= f;
            d.spin *= f;
            if (Math.abs(d.vx) + Math.abs(d.vz) < 0.2) d.rest = true;
          }
        }
      }
      if (a.dead) {
        a.deadTime += dt;
        return;
      }
      // Get up after a while.
      if (d.rest && d.t > 2.8) {
        a.down = null;
        a.state = 'flee';
        a.flee = { x: a.pos.x + (Math.random() - 0.5), z: a.pos.z + (Math.random() - 0.5), t: 6 };
        a.anim.sprint = true;
      }
    }

    // -------------------------------------------------------- per frame
    update(dt, focus) {
      const game = this.game;
      // Stream walkers in and out.
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = 0.35;
        let walkers = 0;
        for (let i = this.agents.length - 1; i >= 0; i--) {
          const a = this.agents[i];
          const d = Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z);
          if (!a.persistent && !a.brain) {
            const gone = d > 140 || (a.dead && a.deadTime > 25 && !game.isVisible(a.pos.x, a.pos.y + 0.5, a.pos.z, 1));
            if (gone) {
              this.remove(a);
              continue;
            }
            walkers++;
          }
          if (a.brain && a.brain.expired && a.brain.expired(a, d)) this.remove(a);
        }
        if (this.enabled) {
          let n = 0;
          while (walkers < this.targetCount && n++ < 3) {
            if (this._spawnWalker(focus)) walkers++;
          }
        }
      }

      const cam = game.renderer.camera.position;
      const player = game.player;
      for (const a of this.agents) {
        const dist = Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z);
        a.camDist = dist;
        // Think.
        if (a.state === 'down') this._downStep(a, dt);
        else if (a.brain && a.brain.update) a.brain.update(a, dt);
        else if (a.state === 'flee') this._fleeStep(a, dt);
        else if (a.walk) this._walkerStep(a, dt);
        else this._rejoinWalk(a);
        if (a.state !== 'down') {
          this._move(a, dt);
          this._carCheck(a);
        }
        // Draw and animate only what can be seen.
        a.visible = dist < 115 && (dist < 12 || game.isVisible(a.pos.x, a.pos.y + 1, a.pos.z, 1.2)) && !a.hidden;
        if (a.visible) this._animate(a, dt, dist);
      }
      this._separate(dt);
      if (player && !player.inVehicle) this._scareNearCars();
      this.renderer.draw(this.agents);
    }

    _move(a, dt) {
      const sp = a.moveSpeed || 0;
      const tx = Math.sin(a.heading) * sp;
      const tz = Math.cos(a.heading) * sp;
      const k = 1 - Math.exp(-8 * dt);
      a.vel.x += (tx - a.vel.x) * k;
      a.vel.z += (tz - a.vel.z) * k;
      const next = this._tmp;
      next.x = a.pos.x + a.vel.x * dt;
      next.z = a.pos.z + a.vel.z * dt;
      if (a.vel.x * a.vel.x + a.vel.z * a.vel.z > 0.0001) {
        const res = this.physics.resolveCircle(next, a.radius, a.pos.y, a.pos.y + 1.7, 0.45, this._resolveOut);
        if (res.hit) {
          const vn = a.vel.x * res.x + a.vel.z * res.z;
          if (vn < 0) {
            a.vel.x -= vn * res.x;
            a.vel.z -= vn * res.z;
          }
          a.blocked = (a.blocked || 0) + dt;
        } else a.blocked = 0;
        a.pos.x = next.x;
        a.pos.z = next.z;
        const g = this.physics.groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.5);
        if (g > a.pos.y - 0.6) a.pos.y = g;
        else a.pos.y = Math.max(g, a.pos.y - 9 * dt);
      }
      a.speed = Math.hypot(a.vel.x, a.vel.z);
      // Stuck against something while strolling: turn around.
      if (a.blocked > 1.2 && a.walk && a.state === 'walk') {
        a.blocked = 0;
        this._rejoinWalk(a);
      }
    }

    /** Is someone standing in the road at this point? (traffic brakes for them) */
    blockingPoint(x, z, r) {
      for (const a of this.agents) {
        if (!a.onRoad && a.state !== 'flee' && !a.brain) continue;
        if (a.dead && a.down && a.down.rest) {
          // Bodies in the road are obstacles too.
        }
        const dx = a.pos.x - x;
        const dz = a.pos.z - z;
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    }

    /** Cars hitting people. */
    _carCheck(a) {
      // Passengers sit at their car's position: never "run over" by it (or any car).
      if (a.hidden || a.inCar) return;
      const vs = this.game.vehicles;
      for (const v of vs.list) {
        const sp = v.speed;
        if (sp < 2.5) continue;
        const dx = a.pos.x - v.pos.x;
        const dz = a.pos.z - v.pos.z;
        if (dx * dx + dz * dz > (v.hz + 1) * (v.hz + 1)) continue;
        if (Math.abs(a.pos.y - v.pos.y) > 1.6) continue;
        const l = v.worldToLocal(a.pos.x, a.pos.z, this._tmp);
        if (Math.abs(l.x) > v.hx + 0.28 || Math.abs(l.z) > v.hz + 0.28) continue;
        const toward = -(v.vel.x * dx + v.vel.z * dz) / (Math.hypot(dx, dz) || 1);
        if (toward < 1.5 && Math.abs(l.z) < v.hz) continue;
        const k = sp;
        a.knock(v.vel.x * 0.85 + (dx / (Math.hypot(dx, dz) || 1)) * 2, 2.5 + k * 0.28, v.vel.z * 0.85 + (dz / (Math.hypot(dx, dz) || 1)) * 2, 12 + k * k * 0.9, v.driver === 'player' ? 'player' : v);
        if (this.game.audio.bodyHit) this.game.audio.bodyHit(clamp(k / 20, 0.2, 1), 0);
        v.vel.x *= 0.93;
        v.vel.z *= 0.93;
        VH.events.emit('ped:hitByCar', { agent: a, v, speed: sp });
        this.threat(a.pos.x, a.pos.z, 18, 'hit');
        return;
      }
    }

    /** People jump out of the way of a car on the pavement. */
    _scareNearCars() {
      for (const v of this.game.vehicles.list) {
        if (v.speed < 4 || v.driver !== 'player' || v.flying) continue;
        if (this.game.roadnet.onRoad(v.pos.x, v.pos.z)) continue;
        this.threat(v.pos.x + v.vel.x * 0.6, v.pos.z + v.vel.z * 0.6, 9, 'pavement');
      }
    }

    _separate(dt) {
      // Cheap pairwise push between people close to each other (and to Jay).
      const grid = this._grid;
      grid.clear();
      for (const a of this.agents) {
        if (a.state === 'down' || a.hidden) continue;
        const k = Math.floor(a.pos.x / 2) * 4096 + Math.floor(a.pos.z / 2);
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(a);
      }
      for (const a of this.agents) {
        if (a.state === 'down' || a.hidden) continue;
        const cx = Math.floor(a.pos.x / 2);
        const cz = Math.floor(a.pos.z / 2);
        for (let ix = -1; ix <= 1; ix++) {
          for (let iz = -1; iz <= 1; iz++) {
            const l = grid.get((cx + ix) * 4096 + cz + iz);
            if (!l) continue;
            for (const b of l) {
              if (b === a || b.id < a.id) continue;
              const dx = b.pos.x - a.pos.x;
              const dz = b.pos.z - a.pos.z;
              const d2 = dx * dx + dz * dz;
              if (d2 < 4.84 && d2 > 1e-6 && dt && a.moveSpeed > 0.3 && b.moveSpeed > 0.3) {
                // Walking at each other: both keep to their right and pass,
                // instead of locking face to face and shuffling along as one.
                const fax = Math.sin(a.heading);
                const faz = Math.cos(a.heading);
                const facing = fax * Math.sin(b.heading) + faz * Math.cos(b.heading);
                if (facing < -0.5 && fax * dx + faz * dz > 0) {
                  const step = 1.1 * dt;
                  a.pos.x -= Math.cos(a.heading) * step;
                  a.pos.z += Math.sin(a.heading) * step;
                  b.pos.x -= Math.cos(b.heading) * step;
                  b.pos.z += Math.sin(b.heading) * step;
                }
              }
              if (d2 > 0.36 || d2 < 1e-6) continue;
              const d = Math.sqrt(d2);
              const push = (0.6 - d) * 0.5;
              a.pos.x -= (dx / d) * push;
              a.pos.z -= (dz / d) * push;
              b.pos.x += (dx / d) * push;
              b.pos.z += (dz / d) * push;
            }
          }
        }
      }
    }

    _ragdolls() {
      let n = 0;
      for (const a of this.agents) if (a.ragdoll && !a.ragdoll.settled) n++;
      return n;
    }

    /** Turn a fresh corpse into a ragdoll, carrying the momentum of what killed it. */
    _startRagdoll(a) {
      const rig = a.rig;
      // Make sure the rig stands where the body is before copying its joints.
      rig.root.position.copy(a.pos);
      rig.root.rotation.set(0, a.heading, 0);
      const d = a.down;
      const h = a.lastHit;
      const power = !h ? 0 : (h.head ? 5.5 : 4) * (a.lastKind === 'melee' ? 0.8 : 1);
      a.ragdoll = new VH.Ragdoll(rig, this.physics, {
        // A shot already carries its own push (hit); a car or blast throws the whole body.
        vx: (d.vx || 0) * (h ? 0.5 : 1), vy: Math.min(d.vy || 0, 6), vz: (d.vz || 0) * (h ? 0.5 : 1),
        hit: h ? { x: h.dx, y: Math.max(-0.2, h.dy) + 0.15, z: h.dz, power, head: h.head } : null,
      });
      a._ragdollFinal = false;
    }

    /** Push Jay out of people (called from the player controller). */
    resolvePlayer(pos, r, y0) {
      for (const a of this.agents) {
        if (a.state === 'down' || a.hidden) continue;
        if (Math.abs(a.pos.y - y0) > 1.2) continue;
        const dx = pos.x - a.pos.x;
        const dz = pos.z - a.pos.z;
        const min = r + a.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (min - d) * 0.8;
        pos.z += (dz / d) * (min - d) * 0.8;
        a.pos.x -= (dx / d) * (min - d) * 0.2;
        a.pos.z -= (dz / d) * (min - d) * 0.2;
      }
    }

    _animate(a, dt, dist) {
      // Far away: update the animation less often.
      a._animAcc = (a._animAcc || 0) + dt;
      const every = dist > 60 ? 3 : dist > 30 ? 2 : 1;
      a._animFrame = ((a._animFrame || 0) + 1) % every;
      const root = a.rig.root;
      root.position.copy(a.pos);
      if (a.ragdoll) {
        // Posed by the ragdoll; once it has settled the pose just stays.
        if (!a.ragdoll.settled || !a._ragdollFinal) {
          a.ragdoll.apply(a.rig);
          if (a.ragdoll.settled) a._ragdollFinal = true;
        }
        return;
      }
      if (a.state === 'down' && a.down) {
        const t = a.down.flip;
        root.rotation.set(-1.45 * smoothstep(0, 1, t), a.heading, (a.id % 2 ? 0.3 : -0.3) * t, 'YXZ');
        root.position.y += 0.14 * t;
      } else root.rotation.set(0, a.heading, 0);
      if (a._animFrame === 0) {
        const an = a.anim;
        a.rig.animate(a._animAcc, {
          speed: a.state === 'down' ? 0 : a.speed,
          grounded: a.state !== 'down' || (a.down && a.down.rest),
          vy: a.state === 'down' ? -6 : 0,
          crouch: an.crouch + an.cower * 0.8,
          aim: an.aim,
          climb: -1,
          sprint: an.sprint,
          backwards: false,
          land: 0,
          lookPitch: an.lookPitch || 0,
          talk: an.talk,
          talkEnergy: an.talkEnergy,
          handsUp: an.handsUp,
          phone: an.phone,
          cower: an.cower,
          dance: an.dance,
          danceStyle: an.danceStyle,
          beat: an.beat,
          beatN: an.beatN,
          dead: a.dead,
        });
        a._animAcc = 0;
      }
      root.updateMatrixWorld(true);
    }

    /** Ray against every person's body (bullets). Returns { agent, t, head } or null. */
    raycast(ox, oy, oz, dx, dy, dz, maxT, ignore) {
      let best = null;
      let bestT = maxT;
      for (const a of this.agents) {
        if (a === ignore || a.hidden) continue;
        if (a.dead && a.down && a.down.rest) continue;
        const h = a.state === 'down' ? 0.5 : 1.75 * (a.look.height || 1);
        // Closest approach of the ray to the body's vertical axis.
        const px = a.pos.x - ox;
        const pz = a.pos.z - oz;
        const hd = dx * dx + dz * dz;
        if (hd < 1e-8) continue;
        const t = (px * dx + pz * dz) / hd;
        if (t < 0 || t > bestT) continue;
        const cx = ox + dx * t - a.pos.x;
        const cz = oz + dz * t - a.pos.z;
        const r = 0.32;
        if (cx * cx + cz * cz > r * r) continue;
        const y = oy + dy * t;
        if (y < a.pos.y || y > a.pos.y + h) continue;
        bestT = t;
        best = { agent: a, t, head: y > a.pos.y + h - 0.28 && a.state !== 'down' };
      }
      return best;
    }

    /** People within radius (for AI: who can see what). */
    near(x, z, r, fn) {
      for (const a of this.agents) {
        const dx = a.pos.x - x;
        const dz = a.pos.z - z;
        if (dx * dx + dz * dz < r * r) fn(a);
      }
    }

    clear() {
      for (let i = this.agents.length - 1; i >= 0; i--) {
        if (!this.agents[i].persistent) this.remove(this.agents[i]);
      }
    }
  }

  Crowd.randomLook = randomLook;
  Crowd.SLOTS = SLOTS;
  VH.Crowd = Crowd;
  VH.CrowdAgent = Agent;
})();
