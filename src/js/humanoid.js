/*
 * humanoid.js — a jointed, procedurally modelled and animated person.
 *
 * Used for Jay Mercer now and for every pedestrian, cop and shopkeeper in
 * later phases, so appearance is data (a "look": colours, hair, build) and
 * animation is driven by a small state object rather than by keyframes.
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
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { damp, smoothstep, clamp } = VH.math;

  const materialCache = new Map();
  // At night people glow very faintly in their own colours, so Jay and the
  // cast stay readable away from street lamps (a common game-lighting cheat).
  const NIGHT_FILL = { value: 0 };
  function material(hex, roughness) {
    const key = hex + ':' + roughness;
    let m = materialCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0 });
      m.emissive.copy(m.color).multiplyScalar(NIGHT_FILL.value);
      materialCache.set(key, m);
    }
    return m;
  }
  /** 0 by day; the environment raises it after dark. */
  function setNightFill(k) {
    if (Math.abs(k - NIGHT_FILL.value) < 0.002) return;
    NIGHT_FILL.value = k;
    for (const m of materialCache.values()) m.emissive.copy(m.color).multiplyScalar(k);
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
  };

  class Humanoid {
    /**
     * opts.rigOnly: build the joints but no meshes. The crowd renderer draws
     * rig-only humanoids with instancing and reads their joint matrices; the
     * body parts are recorded in this.parts (joint name, geometry, colour slot).
     */
    constructor(look, opts) {
      this.rigOnly = !!(opts && opts.rigOnly);
      this.parts = this.rigOnly ? [] : null;
      this.look = Object.assign({}, JAY_LOOK, look || {});
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
        // Record the part; the returned stand-in lets callers set a rotation as usual.
        const stand = new THREE.Object3D();
        stand.position.set(x || 0, y || 0, z || 0);
        parent.add(stand);
        this.parts.push({ geo, slot: mat, stand, parent });
        return stand;
      }
      const ghost = this.look.ghost;
      const m = new THREE.Mesh(geo, ghost ? Humanoid.ghostMaterial() : mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = !ghost;
      m.receiveShadow = !ghost;
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
      const L = this.look;
      const R = this.rigOnly;
      // In rig-only mode "materials" are colour slots for the crowd shader.
      const skin = R ? 'skin' : material(L.skin, 0.62);
      const hair = R ? 'hair' : material(L.hair, 0.9);
      const jacket = R ? 'top' : material(L.jacket, 0.78);
      const trim = R ? 'trim' : material(L.jacketTrim, 0.85);
      const shirt = R ? 'shirt' : material(L.shirt, 0.85);
      const pants = R ? 'bottom' : material(L.pants, 0.88);
      const shoes = R ? 'shoes' : material(L.shoes, 0.6);
      const sole = R ? 'sole' : material(L.sole, 0.8);
      const belt = R ? 'belt' : material(L.belt, 0.6);
      const dark = R ? 'dark' : material(0x15110e, 0.5);
      const stubble = R ? 'stubble' : material(0x94704f, 0.85);
      const watch = R ? 'metal' : material(L.watch, 0.3);

      const pelvis = this._joint('pelvis', this.root, 0, 0.97, 0);
      // Hips and belt.
      const hipsGeo = new THREE.CylinderGeometry(0.16, 0.15, 0.2, 10);
      hipsGeo.scale(1, 1, 0.68);
      this._mesh(hipsGeo, pants, pelvis, 0, -0.02, 0);
      const beltGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.04, 10);
      beltGeo.scale(1, 1, 0.7);
      this._mesh(beltGeo, belt, pelvis, 0, 0.08, 0);

      // Torso: an elliptical, tapering jacket over a white tee.
      const spine = this._joint('spine', pelvis, 0, 0.08, 0);
      const torsoGeo = new THREE.CylinderGeometry(0.205, 0.17, 0.5, 12);
      torsoGeo.scale(1, 1, 0.62);
      this._mesh(torsoGeo, jacket, spine, 0, 0.25, 0);
      const shirtGeo = new THREE.BoxGeometry(0.13, 0.4, 0.02);
      this._mesh(shirtGeo, shirt, spine, 0, 0.27, 0.112);
      // Jacket hem and collar.
      const hemGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.05, 12);
      hemGeo.scale(1, 1, 0.66);
      this._mesh(hemGeo, trim, spine, 0, 0.02, 0);
      const collarGeo = new THREE.CylinderGeometry(0.085, 0.11, 0.06, 10);
      collarGeo.scale(1, 1, 0.85);
      this._mesh(collarGeo, trim, spine, 0, 0.51, -0.01);

      // Neck and head.
      const neck = this._joint('neck', spine, 0, 0.52, 0);
      this._mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin, neck, 0, 0.04, 0);
      const head = this._joint('head', neck, 0, 0.1, 0);
      this.headGroup = head;
      const skull = new THREE.SphereGeometry(0.113, 18, 14);
      skull.scale(0.9, 1.08, 1.0);
      this._mesh(skull, skin, head, 0, 0.08, 0);
      // Jaw with a hint of stubble.
      const jaw = new THREE.SphereGeometry(0.104, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
      jaw.scale(0.93, 0.85, 1.07);
      this._mesh(jaw, stubble, head, 0, 0.06, 0.012);
      // Short hair: a cap over the top and back of the head.
      const hairGeo = new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
      hairGeo.scale(0.93, 1.02, 1.04);
      const hairMesh = this._mesh(hairGeo, hair, head, 0, 0.095, -0.006);
      hairMesh.rotation.x = -0.18;
      // Face details: nose, brows, eyes, ears.
      this._mesh(new THREE.BoxGeometry(0.03, 0.05, 0.035), skin, head, 0, 0.065, 0.11);
      for (const s of [-1, 1]) {
        this._mesh(new THREE.BoxGeometry(0.035, 0.01, 0.01), hair, head, s * 0.038, 0.118, 0.103);
        this._mesh(new THREE.SphereGeometry(0.011, 6, 5), dark, head, s * 0.037, 0.097, 0.1);
        const ear = new THREE.SphereGeometry(0.024, 8, 6);
        ear.scale(0.5, 1, 0.8);
        this._mesh(ear, skin, head, s * 0.103, 0.08, -0.005);
      }

      // Arms. Left is +X (the character faces +Z).
      for (const side of ['L', 'R']) {
        const s = side === 'L' ? 1 : -1;
        const shoulder = this._joint('shoulder' + side, spine, s * 0.215, 0.45, -0.01);
        const upper = new THREE.CapsuleGeometry(0.056, 0.2, 4, 10);
        this._mesh(upper, jacket, shoulder, 0, -0.14, 0);
        const elbow = this._joint('elbow' + side, shoulder, 0, -0.29, 0);
        this._mesh(new THREE.CapsuleGeometry(0.048, 0.17, 4, 10), jacket, elbow, 0, -0.11, 0);
        this._mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.05, 10), trim, elbow, 0, -0.225, 0);
        const handGeo = new THREE.SphereGeometry(0.045, 10, 8);
        handGeo.scale(0.75, 1.3, 0.95);
        this._mesh(handGeo, skin, elbow, 0, -0.3, 0.005);
        if (side === 'L') this._mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 10), watch, elbow, 0, -0.245, 0);
      }

      // Legs.
      for (const side of ['L', 'R']) {
        const s = side === 'L' ? 1 : -1;
        const hip = this._joint('hip' + side, pelvis, s * 0.092, -0.03, 0);
        this._mesh(new THREE.CapsuleGeometry(0.078, 0.3, 4, 10), pants, hip, 0, -0.22, 0);
        const knee = this._joint('knee' + side, hip, 0, -0.45, 0);
        this._mesh(new THREE.CapsuleGeometry(0.062, 0.31, 4, 10), pants, knee, 0, -0.21, 0);
        const ankle = this._joint('ankle' + side, knee, 0, -0.44, 0);
        const shoe = new THREE.BoxGeometry(0.105, 0.075, 0.27);
        this._mesh(shoe, shoes, ankle, 0, -0.03, 0.045);
        this._mesh(new THREE.BoxGeometry(0.11, 0.025, 0.28), sole, ankle, 0, -0.075, 0.045);
      }
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
      T.splay = 0.07 + 0.04 * r;
      T.lean = 0.03 * w + 0.12 * r + 0.1 * sp;
      T.pelvisY = 0.97 + Math.cos(p * 2) * (0.012 + 0.028 * r) * w - 0.02 * r;
      T.twist = sinP * 0.07 * w;
      T.headYaw = 0;

      // Idle life: breathing, and the occasional glance around.
      const idle = 1 - w;
      T.lean += Math.sin(this.time * 1.7) * 0.015 * idle;
      T.shoulderL += Math.sin(this.time * 1.1) * 0.03 * idle;
      T.shoulderR -= Math.sin(this.time * 1.1 + 0.5) * 0.03 * idle;
      this._headTimer -= dt;
      if (this._headTimer <= 0) {
        this._headTimer = 2 + Math.random() * 4;
        this._headTarget = idle > 0.5 && Math.random() < 0.6 ? (Math.random() - 0.5) * 1.1 : 0;
      }
      T.headYaw = this._headTarget * idle;
      T.headPitch = 0;

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
      J.pelvis.position.y = ease('pelvisY', T.pelvisY, 14);
      J.neck.rotation.y = ease('headYaw', T.headYaw, 4);
      J.neck.rotation.x = ease('headPitch', T.headPitch, 10) - P.lean * 0.5;
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
  Humanoid.material = material;
  Humanoid.setNightFill = setNightFill;
  Humanoid.nightFill = NIGHT_FILL; // shared uniform for the instanced crowd
  VH.Humanoid = Humanoid;
})();
