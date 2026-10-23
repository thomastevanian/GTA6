/*
 * ragdoll.js — bodies that fall like bodies.
 *
 * When someone dies, the joints of their rig become fifteen points held
 * together by sticks (Verlet integration). The points keep the momentum of
 * whatever killed them, fall under gravity, flop, slide to a stop on the
 * ground and bump off walls. Each frame the rig's joints are turned to
 * follow the points, so the existing body meshes — and the instanced crowd,
 * which draws from the same joints — show the ragdoll without new geometry.
 * Once a body has been still for a moment it freezes and costs nothing.
 *
 *   const r = new VH.Ragdoll(rig, physics, { vx, vy, vz, hit: { x, y, z, power } });
 *   r.step(dt);  r.apply(rig);  r.settled  r.pelvis
 */
(function () {
  'use strict';

  const VH = window.VH;

  // Points.
  const PELVIS = 0, CHEST = 1, HEAD = 2, SH_L = 3, SH_R = 4, EL_L = 5, EL_R = 6, HA_L = 7, HA_R = 8;
  const HI_L = 9, HI_R = 10, KN_L = 11, KN_R = 12, AN_L = 13, AN_R = 14;
  const N = 15;
  const RADIUS = [0.13, 0.14, 0.11, 0.07, 0.07, 0.055, 0.055, 0.05, 0.05, 0.08, 0.08, 0.065, 0.065, 0.06, 0.06];
  // How much of a blow each point takes (a shot to the chest snaps the upper body back).
  const UPPER = [0.6, 1, 1, 1, 1, 0.8, 0.8, 0.7, 0.7, 0.5, 0.5, 0.3, 0.3, 0.2, 0.2];

  // Bones, then braces that keep the torso a solid box.
  const STICKS = [
    [PELVIS, CHEST], [CHEST, HEAD], [CHEST, SH_L], [CHEST, SH_R],
    [SH_L, EL_L], [EL_L, HA_L], [SH_R, EL_R], [EL_R, HA_R],
    [PELVIS, HI_L], [PELVIS, HI_R], [HI_L, KN_L], [KN_L, AN_L], [HI_R, KN_R], [KN_R, AN_R],
    [SH_L, SH_R], [HI_L, HI_R], [SH_L, HI_L], [SH_R, HI_R], [SH_L, HI_R], [SH_R, HI_L],
    [HEAD, SH_L], [HEAD, SH_R], [PELVIS, SH_L], [PELVIS, SH_R], [CHEST, HI_L], [CHEST, HI_R],
  ];
  // Joint limits as minimum distances: knees and elbows can't fold flat, the
  // head can't fold into the chest, legs and arms don't pass through each other.
  const MINS = [
    [HI_L, AN_L, 0.55], [HI_R, AN_R, 0.55], [SH_L, HA_L, 0.4], [SH_R, HA_R, 0.4],
    [HEAD, PELVIS, 0.85], [KN_L, KN_R, 0.16], [AN_L, AN_R, 0.14], [HA_L, HI_L, 0.12], [HA_R, HI_R, 0.12],
    [HA_L, HA_R, 0.1], [EL_L, PELVIS, 0.18], [EL_R, PELVIS, 0.18],
  ];

  const GRAVITY = 18; // a little more than real: bodies drop with weight
  const FRICTION = 9; // m/s² of sliding deceleration
  const MAX_SPEED = 30;
  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _pel = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _m = new THREE.Matrix4();
  const _circle = { x: 0, z: 0 };
  const _resolve = { x: 0, z: 0, hit: false };

  class Ragdoll {
    constructor(rig, physics, opts) {
      const o = opts || {};
      this.physics = physics;
      this.p = new Float32Array(N * 3);
      this.q = new Float32Array(N * 3); // previous positions
      this.t = 0;
      this.still = 0;
      this.settled = false;
      this.pelvis = { x: 0, y: 0, z: 0 };
      this._ground = new Float32Array(N);

      // Start exactly where the rig is drawn now.
      const j = rig.joints;
      rig.root.updateMatrixWorld(true);
      const at = (i, obj, lx, ly, lz) => {
        _a.set(lx || 0, ly || 0, lz || 0);
        obj.localToWorld(_a);
        this.p[i * 3] = _a.x;
        this.p[i * 3 + 1] = _a.y;
        this.p[i * 3 + 2] = _a.z;
      };
      at(PELVIS, j.pelvis);
      at(CHEST, j.neck);
      at(HEAD, rig.headGroup, 0, 0.08, 0);
      at(SH_L, j.shoulderL);
      at(SH_R, j.shoulderR);
      at(EL_L, j.elbowL);
      at(EL_R, j.elbowR);
      at(HA_L, j.elbowL, 0, -0.3, 0);
      at(HA_R, j.elbowR, 0, -0.3, 0);
      at(HI_L, j.hipL);
      at(HI_R, j.hipR);
      at(KN_L, j.kneeL);
      at(KN_R, j.kneeR);
      at(AN_L, j.ankleL);
      at(AN_R, j.ankleR);
      this._pelvisY = j.pelvis.position.y;

      // Rest lengths come from the starting pose (which is a standing pose).
      this.rest = STICKS.map(([a, b]) => this._dist(a, b));
      this.mins = MINS.map(([a, b, f]) => [a, b, this._dist(a, b) * f]);
      // Joint limits are fractions of a straight limb, not the current bend.
      const limb = (a, m, b) => this._dist(a, m) + this._dist(m, b);
      this.mins[0][2] = limb(HI_L, KN_L, AN_L) * 0.55;
      this.mins[1][2] = limb(HI_R, KN_R, AN_R) * 0.55;
      this.mins[2][2] = limb(SH_L, EL_L, HA_L) * 0.4;
      this.mins[3][2] = limb(SH_R, EL_R, HA_R) * 0.4;

      // Momentum: the whole body's velocity, plus the blow that killed it.
      const dt = 1 / 60;
      const vx = o.vx || 0, vy = o.vy || 0, vz = o.vz || 0;
      const hit = o.hit;
      for (let i = 0; i < N; i++) {
        let ix = vx, iy = vy, iz = vz;
        if (hit) {
          const w = UPPER[i] * (hit.head && i === HEAD ? 1.6 : 1);
          ix += hit.x * hit.power * w;
          iy += hit.y * hit.power * w;
          iz += hit.z * hit.power * w;
        }
        // A touch of randomness so no two falls are the same.
        ix += (Math.random() - 0.5) * 0.6;
        iz += (Math.random() - 0.5) * 0.6;
        this.q[i * 3] = this.p[i * 3] - ix * dt;
        this.q[i * 3 + 1] = this.p[i * 3 + 1] - iy * dt;
        this.q[i * 3 + 2] = this.p[i * 3 + 2] - iz * dt;
      }
      // Knees give way first.
      for (const k of [KN_L, KN_R]) this.q[k * 3 + 2] -= (Math.random() - 0.3) * 0.02;
      this._updatePelvis();
    }

    _dist(a, b) {
      const P = this.p;
      return Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]) || 0.001;
    }

    /** Advance (frame time; split into small steps). */
    step(dt) {
      if (this.settled) return;
      dt = Math.min(dt, 1 / 20);
      this.t += dt;
      const n = dt > 1 / 45 ? 3 : 2;
      const h = dt / n;
      let moved = 0;
      for (let s = 0; s < n; s++) moved = Math.max(moved, this._substep(h));
      this._updatePelvis();
      // Still for half a second (or a long time has passed): freeze.
      this.still = moved < 0.0025 ? this.still + dt : 0;
      if ((this.still > 0.5 && this.t > 0.8) || this.t > 7) this.settled = true;
    }

    _substep(h) {
      const P = this.p;
      const Q = this.q;
      const ph = this.physics;
      let moved = 0;
      // Integrate.
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        const x = P[k], y = P[k + 1], z = P[k + 2];
        // Velocity (as this step's displacement), capped: nothing in a fall moves faster than 30 m/s.
        let vx = (x - Q[k]) * 0.992, vy = (y - Q[k + 1]) * 0.992, vz = (z - Q[k + 2]) * 0.992;
        const v = Math.hypot(vx, vy, vz);
        const vmax = MAX_SPEED * h;
        if (v > vmax) {
          vx *= vmax / v;
          vy *= vmax / v;
          vz *= vmax / v;
        }
        P[k] = x + vx;
        P[k + 1] = y + vy - GRAVITY * h * h;
        P[k + 2] = z + vz;
        Q[k] = x;
        Q[k + 1] = y;
        Q[k + 2] = z;
        moved = Math.max(moved, Math.abs(P[k] - x) + Math.abs(P[k + 1] - y) + Math.abs(P[k + 2] - z));
        this._ground[i] = ph.groundHeight(P[k], P[k + 2], y + 0.6) + RADIUS[i];
      }
      // Constraints, with the ground in the loop so limbs rest on it.
      for (let it = 0; it < 8; it++) {
        for (let s = 0; s < STICKS.length; s++) this._stick(STICKS[s][0], STICKS[s][1], this.rest[s], it < 2 ? 0.9 : 1);
        for (const [a, b, min] of this.mins) {
          const d = this._dist(a, b);
          if (d < min) this._push(a, b, d, min, 0.5);
        }
        for (let i = 0; i < N; i++) {
          const k = i * 3;
          if (P[k + 1] < this._ground[i]) P[k + 1] = this._ground[i];
        }
      }
      // Sliding friction on whatever touches the ground: a body thrown by a
      // car skids a few metres, a body that just drops stays put.
      const slow = FRICTION * h * h;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        if (P[k + 1] > this._ground[i] + 0.01) continue;
        const dx = P[k] - Q[k];
        const dz = P[k + 2] - Q[k + 2];
        const d = Math.hypot(dx, dz);
        const keep = d > slow ? (d - slow) / d : 0;
        Q[k] = P[k] - dx * keep;
        Q[k + 2] = P[k + 2] - dz * keep;
        // Being lifted out of the ground must never become upward speed (that launches bodies).
        if (Q[k + 1] < P[k + 1]) Q[k + 1] = P[k + 1];
      }
      // Walls: keep the torso and head out of buildings, cars' cover and props.
      for (const i of [PELVIS, CHEST, HEAD]) {
        const k = i * 3;
        _circle.x = P[k];
        _circle.z = P[k + 2];
        // Only real walls: the band starts above kerbs, slabs and the road
        // itself, which a body lying on the ground is always touching.
        const y0 = P[k + 1] + 0.3;
        const r = ph.resolveCircle(_circle, RADIUS[i] + 0.05, y0, y0 + 0.5, 0.35, _resolve);
        if (r.hit) {
          // Move out of the wall (a little per step, so a deep overlap can't
          // fling the body) without turning the push into speed, then drop
          // whatever speed was still heading into it.
          let px = _circle.x - P[k];
          let pz = _circle.z - P[k + 2];
          const pm = Math.hypot(px, pz);
          if (pm > 0.12) {
            px *= 0.12 / pm;
            pz *= 0.12 / pm;
          }
          _circle.x = P[k] + px;
          _circle.z = P[k + 2] + pz;
          P[k] = _circle.x;
          P[k + 2] = _circle.z;
          Q[k] += px;
          Q[k + 2] += pz;
          const pl = Math.hypot(px, pz);
          if (pl > 1e-6) {
            const nx = px / pl, nz = pz / pl;
            const vn = (P[k] - Q[k]) * nx + (P[k + 2] - Q[k + 2]) * nz;
            if (vn < 0) {
              Q[k] += nx * vn * 1.2;
              Q[k + 2] += nz * vn * 1.2;
            }
          }
        }
      }
      return moved;
    }

    _stick(a, b, rest, k) {
      const d = this._dist(a, b);
      this._push(a, b, d, rest, 0.5 * k);
    }

    _push(a, b, d, target, k) {
      const P = this.p;
      const f = ((d - target) / d) * k;
      const ax = a * 3, bx = b * 3;
      const dx = (P[bx] - P[ax]) * f;
      const dy = (P[bx + 1] - P[ax + 1]) * f;
      const dz = (P[bx + 2] - P[ax + 2]) * f;
      P[ax] += dx;
      P[ax + 1] += dy;
      P[ax + 2] += dz;
      P[bx] -= dx;
      P[bx + 1] -= dy;
      P[bx + 2] -= dz;
    }

    _updatePelvis() {
      const P = this.p;
      // Centre of the hips and chest: where the body "is" (blips, blood).
      this.pelvis.x = (P[PELVIS * 3] + P[CHEST * 3]) * 0.5;
      this.pelvis.y = Math.min(P[PELVIS * 3 + 1], P[CHEST * 3 + 1]);
      this.pelvis.z = (P[PELVIS * 3 + 2] + P[CHEST * 3 + 2]) * 0.5;
    }

    _v(i, out) {
      return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
    }

    /** Turn the rig's joints to follow the points. */
    apply(rig) {
      const j = rig.joints;
      const root = rig.root;
      // Body frame from the torso: X = the body's left, Y = up the spine, Z = forward.
      const pel = this._v(PELVIS, _pel);
      const up = this._v(CHEST, _a).sub(pel).normalize();
      const left = this._v(HI_L, _b).sub(this._v(HI_R, _c));
      left.add(this._v(SH_L, _c)).sub(this._v(SH_R, _d));
      left.addScaledVector(up, -left.dot(up)).normalize();
      const fwd = _fwd.crossVectors(left, up);
      _m.makeBasis(left, up, fwd);
      root.quaternion.setFromRotationMatrix(_m);
      // The pelvis joint sits pelvisY above the root (scaled with the rig).
      const off = _d.set(0, this._pelvisY * root.scale.y, 0).applyQuaternion(root.quaternion);
      root.position.copy(pel).sub(off);
      root.updateMatrixWorld(false);
      j.pelvis.quaternion.identity();
      j.spine.quaternion.identity();
      j.pelvis.updateMatrixWorld(true);
      this._aim(j.neck, CHEST, HEAD, UP);
      j.head.quaternion.identity();
      this._aim(j.shoulderL, SH_L, EL_L, DOWN);
      this._aim(j.elbowL, EL_L, HA_L, DOWN);
      this._aim(j.shoulderR, SH_R, EL_R, DOWN);
      this._aim(j.elbowR, EL_R, HA_R, DOWN);
      this._aim(j.hipL, HI_L, KN_L, DOWN);
      this._aim(j.kneeL, KN_L, AN_L, DOWN);
      this._aim(j.hipR, HI_R, KN_R, DOWN);
      this._aim(j.kneeR, KN_R, AN_R, DOWN);
      j.ankleL.quaternion.identity();
      j.ankleR.quaternion.identity();
      root.updateMatrixWorld(true);
    }

    /** Rotate a joint (in its parent's frame) so its bone runs from point a to point b. */
    _aim(joint, a, b, rest) {
      const dir = this._v(b, _a).sub(this._v(a, _b));
      if (dir.lengthSq() < 1e-8) return;
      joint.parent.getWorldQuaternion(_q);
      dir.applyQuaternion(_q.invert()).normalize();
      joint.quaternion.setFromUnitVectors(rest, dir);
      joint.updateMatrixWorld(true);
    }
  }

  VH.Ragdoll = Ragdoll;
})();
