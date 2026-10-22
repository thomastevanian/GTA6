/*
 * combat-fx.js — the visual support pieces of combat.js.
 *
 *   VH.CombatFX.DebrisPool   tiny physical things (brass, shotgun hulls, spent magazines)
 *                            that bounce, settle and fade; one InstancedMesh each
 *   VH.CombatFX.DecalPool    bullet holes, a ring buffer of quads in one InstancedMesh
 *   VH.CombatFX.impact()     per-surface bullet impact: dust and chips on concrete, sparks
 *                            on metal, splinters on wood, a splash on water, glass
 *   VH.CombatFX.ArcPreview   the dotted throw arc and landing ring for grenades and molotovs
 *   VH.CombatFX.Scope        the sniper scope overlay (DOM) with sway/breath readout
 *
 * Nothing here allocates per frame: pools and temp objects are created once.
 * Pass `low` (graphics.effects === 'low') to get smaller pools and fewer particles.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const { clamp } = VH.math;

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _q2 = new THREE.Quaternion();
  const _z = new THREE.Vector3(0, 0, 1);
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  // ------------------------------------------------------------- debris
  class DebrisPool {
    /**
     * opts: { radius (resting height above the ground), restX, restZ (euler angles when lying),
     *         life (seconds), onLand(item) }
     */
    constructor(scene, physics, geo, mat, n, opts) {
      opts = opts || {};
      this.physics = physics;
      this.n = n;
      this.next = 0;
      this.radius = opts.radius || 0.006;
      this.restX = opts.restX === undefined ? Math.PI / 2 : opts.restX;
      this.restZ = opts.restZ || 0;
      this.life = opts.life || 8;
      this.onLand = opts.onLand || null;
      this.mesh = new THREE.InstancedMesh(geo, mat, n);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = false;
      this.mesh.name = 'combat-debris';
      for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.items = [];
      for (let i = 0; i < n; i++) {
        this.items.push({ on: false, rest: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, g: 0, t: 0, life: 0, bounces: 0, sc: 1 });
      }
      this.active = 0;
      scene.add(this.mesh);
    }

    spawn(x, y, z, vx, vy, vz, scale) {
      const it = this.items[this.next];
      this.next = (this.next + 1) % this.n;
      if (!it.on) this.active++;
      it.on = true;
      it.rest = false;
      it.x = x; it.y = y; it.z = z;
      it.vx = vx; it.vy = vy; it.vz = vz;
      it.rx = Math.random() * 6.28; it.ry = Math.random() * 6.28; it.rz = Math.random() * 6.28;
      it.wx = (Math.random() - 0.5) * 40; it.wy = (Math.random() - 0.5) * 30; it.wz = (Math.random() - 0.5) * 40;
      it.t = 0;
      it.life = this.life * (0.8 + Math.random() * 0.4);
      it.bounces = 0;
      it.sc = scale || 1;
      it.g = this.physics.groundHeight(x, z, y + 0.4);
      return it;
    }

    update(dt) {
      if (!this.active) return;
      let dirty = false;
      for (let i = 0; i < this.n; i++) {
        const it = this.items[i];
        if (!it.on) continue;
        it.t += dt;
        const left = it.life - it.t;
        if (left <= 0) {
          it.on = false;
          this.active--;
          this.mesh.setMatrixAt(i, HIDDEN);
          dirty = true;
          continue;
        }
        if (!it.rest) {
          it.vy -= 9.8 * dt;
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          it.rx += it.wx * dt; it.ry += it.wy * dt; it.rz += it.wz * dt;
          if (it.y - it.g < 0.6) it.g = this.physics.groundHeight(it.x, it.z, it.y + 0.4);
          if (it.y <= it.g + this.radius) {
            it.y = it.g + this.radius;
            if (it.vy < -0.9 && it.bounces < 3) {
              if (it.bounces === 0 && this.onLand) this.onLand(it);
              it.bounces++;
              it.vy *= -0.36;
              it.vx *= 0.55; it.vz *= 0.55;
              it.wx *= 0.5; it.wy *= 0.5; it.wz *= 0.5;
            } else {
              if (it.bounces === 0 && this.onLand) this.onLand(it);
              it.rest = true;
              it.vx = it.vy = it.vz = 0;
              it.rx = this.restX; it.rz = this.restZ;
            }
          }
        } else if (left > 1) continue; // settled and not fading: the matrix is already right
        const k = left < 1 ? left : 1;
        _e.set(it.rx, it.ry, it.rz);
        _q.setFromEuler(_e);
        _m.compose(_p.set(it.x, it.y, it.z), _q, _s.setScalar(it.sc * k));
        this.mesh.setMatrixAt(i, _m);
        dirty = true;
      }
      if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    }

    clear() {
      for (let i = 0; i < this.n; i++) {
        this.items[i].on = false;
        this.mesh.setMatrixAt(i, HIDDEN);
      }
      this.active = 0;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------- decals
  function holeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 30);
    grd.addColorStop(0, 'rgba(12,12,12,0.95)');
    grd.addColorStop(0.28, 'rgba(18,18,18,0.9)');
    grd.addColorStop(0.5, 'rgba(60,56,50,0.35)');
    grd.addColorStop(1, 'rgba(60,56,50,0)');
    g.fillStyle = grd;
    g.beginPath();
    // A slightly ragged star-ish blob.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = i % 2 ? 24 : 31;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  class DecalPool {
    constructor(scene, n) {
      this.n = n;
      this.next = 0;
      const mat = new THREE.MeshBasicMaterial({
        map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, n);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 2;
      this.mesh.name = 'bullet-holes';
      for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.instanceMatrix.needsUpdate = true;
      scene.add(this.mesh);
    }

    add(x, y, z, nx, ny, nz, size) {
      _n.set(nx, ny, nz);
      if (_n.lengthSq() < 0.5) return;
      _n.normalize();
      _q.setFromUnitVectors(_z, _n);
      // A random spin about the normal so holes don't all look alike.
      const spin = Math.random() * 6.28;
      _s.set(0, 0, 1).applyQuaternion(_q);
      _q.premultiply(_q2.setFromAxisAngle(_s, spin));
      _m.compose(_p.set(x + _n.x * 0.012, y + _n.y * 0.012, z + _n.z * 0.012), _q, _s.set(size, size, size));
      this.mesh.setMatrixAt(this.next, _m);
      this.next = (this.next + 1) % this.n;
      this.mesh.instanceMatrix.needsUpdate = true;
    }

    clear() {
      for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ impacts
  const rnd = () => Math.random() - 0.5;

  /** Bullet impact particles for a surface: 'concrete' 'metal' 'wood' 'glass' 'car' 'water'. */
  function impact(fx, x, y, z, nx, ny, nz, surface, low) {
    const k = low ? 0.5 : 1;
    switch (surface) {
      case 'metal':
      case 'car':
        fx.sparks(x, y, z, nx, nz, Math.round(8 * k), 5);
        fx.glow.emit({ x, y, z, life: 0.06, size: 0.22, size1: 0.05, r: 9, g: 6, b: 2.4, a: 1 });
        fx.soft.emit({ x, y, z, vx: nx * 0.8, vy: 0.4, vz: nz * 0.8, life: 0.5, size: 0.08, size1: 0.4, r: 0.55, g: 0.55, b: 0.55, a: 0.2, drag: 2.5 });
        break;
      case 'wood':
        for (let i = 0; i < Math.round(7 * k); i++) {
          const s = 2 + Math.random() * 4;
          fx.soft.emit({
            x, y, z, vx: nx * s + rnd() * 3, vy: ny * s + Math.random() * 2.5, vz: nz * s + rnd() * 3,
            life: 0.4 + Math.random() * 0.3, size: 0.045, size1: 0.04, r: 0.62, g: 0.46, b: 0.26, a: 1, drag: 0.6, grav: 13,
          });
        }
        fx.soft.emit({ x, y, z, vx: nx * 1.5, vy: 0.5, vz: nz * 1.5, life: 0.7, size: 0.1, size1: 0.55, r: 0.58, g: 0.46, b: 0.3, a: 0.4, drag: 2.5 });
        break;
      case 'glass':
        fx.glass(x, y, z, Math.round(10 * k));
        break;
      case 'water':
        fx.water(x, y, z, 0.7);
        break;
      default: // concrete, asphalt
        fx.soft.emit({ x, y, z, vx: nx * 1.4 + rnd() * 0.6, vy: ny * 1.4 + 0.4, vz: nz * 1.4 + rnd() * 0.6, life: 0.8, size: 0.14, size1: 0.9, r: 0.74, g: 0.71, b: 0.65, a: 0.5, drag: 2.4 });
        if (!low) fx.soft.emit({ x, y, z, vx: nx * 0.8 + rnd() * 0.4, vy: ny * 0.8 + 0.2, vz: nz * 0.8 + rnd() * 0.4, life: 1.1, size: 0.1, size1: 0.7, r: 0.7, g: 0.68, b: 0.63, a: 0.25, drag: 2 });
        for (let i = 0; i < Math.round(5 * k); i++) {
          const s = 2.5 + Math.random() * 4.5;
          fx.soft.emit({
            x, y, z, vx: nx * s + rnd() * 3, vy: ny * s + Math.random() * 3, vz: nz * s + rnd() * 3,
            life: 0.3 + Math.random() * 0.3, size: 0.035, size1: 0.03, r: 0.55, g: 0.53, b: 0.5, a: 1, drag: 0.5, grav: 14,
          });
        }
    }
  }

  // --------------------------------------------------------- throw arc
  const ARC_POINTS = 28;

  class ArcPreview {
    constructor(scene) {
      const pos = new Float32Array(ARC_POINTS * 3);
      this.attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', this.attr);
      this.mat = new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, depthTest: false, fog: false });
      this.points = new THREE.Points(geo, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 20;
      this.points.visible = false;
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      );
      this.ring.renderOrder = 20;
      this.ring.visible = false;
      this.ring.frustumCulled = false;
      scene.add(this.points, this.ring);
      this.pt = new THREE.Vector3();
      this.vl = new THREE.Vector3();
      this._d = new THREE.Vector3();
    }

    /**
     * Simulate the throw with the same rules as Thrown (gravity 14, hit = stop) and draw it.
     * radius: blast radius for the landing ring (0 hides it). Returns the landing point (reused vector).
     */
    update(physics, ox, oy, oz, vx, vy, vz, radius, danger) {
      const A = this.attr.array;
      this.pt.set(ox, oy, oz);
      this.vl.set(vx, vy, vz);
      const dt = 0.06;
      let n = 0;
      let landed = false;
      for (let i = 0; i < ARC_POINTS; i++) {
        A[i * 3] = this.pt.x; A[i * 3 + 1] = this.pt.y; A[i * 3 + 2] = this.pt.z;
        n = i + 1;
        if (landed) break;
        this.vl.y -= 14 * dt;
        const d = this._d.copy(this.vl).multiplyScalar(dt);
        const len = d.length();
        if (len > 1e-5) {
          const hit = physics.raycast(this.pt.x, this.pt.y, this.pt.z, d.x / len, d.y / len, d.z / len, len + 0.05, { flags: VH.COLLIDE.SOLID | VH.COLLIDE.SHOTS, ground: true });
          if (hit) {
            this.pt.set(hit.x + hit.nx * 0.05, hit.y + hit.ny * 0.05, hit.z + hit.nz * 0.05);
            landed = true;
            continue;
          }
        }
        this.pt.add(d);
      }
      // Repeat the last point so the unused slots stay out of the way.
      for (let i = n; i < ARC_POINTS; i++) {
        A[i * 3] = this.pt.x; A[i * 3 + 1] = this.pt.y; A[i * 3 + 2] = this.pt.z;
      }
      this.attr.needsUpdate = true;
      this.points.visible = true;
      this.mat.color.setHex(danger ? 0xff8a5c : 0xffffff);
      if (radius > 0) {
        this.ring.visible = true;
        this.ring.position.set(this.pt.x, this.pt.y + 0.06, this.pt.z);
        this.ring.scale.set(radius, 1, radius);
        this.ring.material.color.setHex(danger ? 0xff6a3c : 0xffffff);
      } else this.ring.visible = false;
      return this.pt;
    }

    hide() {
      this.points.visible = false;
      this.ring.visible = false;
    }
  }

  // ------------------------------------------------------------- scope
  class Scope {
    constructor(parent) {
      const el = document.createElement('div');
      el.className = 'vh-scope';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<div class="vh-scope-mask"></div>' +
        '<div class="vh-scope-ret"><i class="h"></i><i class="v"></i><i class="dot"></i>' +
        '<i class="mil m1"></i><i class="mil m2"></i><i class="mil m3"></i><i class="mil m4"></i></div>' +
        '<div class="vh-scope-info"><span class="vh-scope-range"></span><span class="vh-scope-breath"><b></b></span><span class="vh-scope-hint">Shift: hold breath</span></div>';
      parent.appendChild(el);
      this.root = el;
      this.ret = el.querySelector('.vh-scope-ret');
      this.range = el.querySelector('.vh-scope-range');
      this.breath = el.querySelector('.vh-scope-breath b');
      this.on = false;
      this._range = -1;
      this._breath = -1;
    }

    show(on) {
      if (on === this.on) return;
      this.on = on;
      this.root.classList.toggle('on', on);
    }

    /** sway: pixel offset of the reticle drift (cosmetic; the camera carries the real sway). */
    set(rangeM, breath01, held) {
      const r = rangeM > 0 ? Math.round(rangeM) : 0;
      if (r !== this._range) {
        this._range = r;
        this.range.textContent = r ? r + ' m' : '';
      }
      const b = Math.round(clamp(breath01, 0, 1) * 50);
      if (b !== this._breath || held !== this._held) {
        this._breath = b;
        this._held = held;
        this.breath.style.width = b * 2 + '%';
        this.root.classList.toggle('held', !!held);
        this.root.classList.toggle('winded', breath01 < 0.25 && !held);
      }
    }
  }

  VH.CombatFX = { DebrisPool, DecalPool, ArcPreview, Scope, impact };
})();
