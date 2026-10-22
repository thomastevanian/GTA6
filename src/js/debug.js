/*
 * debug.js — the developer overlay (F8).
 *
 * Shows frame timing, renderer counters, memory, the player's state and
 * where they are, and offers a small command console. Commands only work
 * while the overlay is open, so normal play is never affected by them.
 *
 * While playing, press Enter to type a command (Enter again runs it).
 */
(function () {
  'use strict';

  const VH = window.VH;
  const el = (tag, cls, text) => VH.util.el(tag, cls, text);

  class DebugOverlay {
    constructor(game) {
      this.game = game;
      this.visible = false;
      this.history = [];
      this.historyIndex = -1;
      this._timer = 0;
      this.frameTimes = new Float32Array(120);
      this.frameIndex = 0;
      this.colliderView = null;
      this._build();
    }

    _build() {
      this.root = el('div', 'debug');
      this.stats = el('pre', 'debug-stats');
      this.graph = el('canvas', 'debug-graph');
      this.graph.width = 240;
      this.graph.height = 44;
      this.log = el('div', 'debug-log');
      this.inputEl = el('input', 'debug-input');
      this.inputEl.placeholder = 'Type a command (help) — Enter to run';
      this.inputEl.spellcheck = false;
      this.inputEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const cmd = this.inputEl.value.trim();
          this.inputEl.value = '';
          if (cmd) this.run(cmd);
          this.inputEl.blur();
        } else if (e.key === 'Escape') {
          this.inputEl.blur();
        } else if (e.key === 'ArrowUp') {
          if (this.history.length) {
            this.historyIndex = Math.max(0, (this.historyIndex < 0 ? this.history.length : this.historyIndex) - 1);
            this.inputEl.value = this.history[this.historyIndex];
          }
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          if (this.historyIndex >= 0) {
            this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
            this.inputEl.value = this.history[this.historyIndex] || '';
          }
          e.preventDefault();
        } else if (e.key === 'F8') {
          this.toggle();
        }
      });
      this.inputEl.addEventListener('focus', () => {
        this.game.input.enabled = false;
        this.game.input.releaseAll();
      });
      this.inputEl.addEventListener('blur', () => {
        if (this.game.state === 'playing') this.game.input.enabled = true;
      });
      const title = el('div', 'debug-title', 'DEVELOPER OVERLAY · F8');
      this.root.append(title, this.stats, this.graph, this.log, this.inputEl);
      document.body.append(this.root);
      this.print('Commands: help · tp · noclip · god · money · time · clouds · colliders · quality');

      VH.events.on('input:key', (e) => {
        if (e.down && e.code === 'Enter' && this.visible && this.game.state === 'playing') {
          requestAnimationFrame(() => this.inputEl.focus());
        }
      });
    }

    toggle() {
      this.visible = !this.visible;
      this.root.classList.toggle('visible', this.visible);
      if (!this.visible) this.inputEl.blur();
      if (!this.visible && this.colliderView) this._toggleColliders();
    }

    print(text, tone) {
      const line = el('div', 'debug-line' + (tone ? ' ' + tone : ''), text);
      this.log.append(line);
      while (this.log.children.length > 9) this.log.firstChild.remove();
    }

    recordFrame(ms) {
      this.frameTimes[this.frameIndex] = ms;
      this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
    }

    update(dt) {
      if (!this.visible) return;
      this._timer -= dt;
      if (this.colliderView) this._colliderTimer = (this._colliderTimer || 0) - dt;
      if (this.colliderView && this._colliderTimer <= 0) this._rebuildColliders();
      if (this._timer > 0) return;
      this._timer = 0.25;
      const g = this.game;
      const p = g.player;
      const r = g.renderer.stats();
      const mem = performance.memory;
      const district = g.world.districtAt(p.pos.x, p.pos.z);
      const lines = [
        'FPS        ' + g.fps + '   frame ' + g.frameMs.toFixed(1) + ' ms  (cpu ' + g.cpuMs.toFixed(1) + ' ms)',
        'Draw calls ' + r.calls + '   triangles ' + (r.triangles / 1000).toFixed(0) + 'k',
        'GPU memory ' + r.geometries + ' geometries · ' + r.textures + ' textures · ' + r.programs + ' shaders',
        'Buffer     ' + r.bufferWidth + '×' + r.bufferHeight + ' @ ' + r.pixelRatio.toFixed(2) + 'x',
        mem ? 'JS heap    ' + (mem.usedJSHeapSize / 1048576).toFixed(0) + ' / ' + (mem.jsHeapSizeLimit / 1048576).toFixed(0) + ' MB' : 'JS heap    (not reported by this browser)',
        '',
        'Position   ' + p.pos.x.toFixed(1) + ', ' + p.pos.y.toFixed(2) + ', ' + p.pos.z.toFixed(1) + '   heading ' + ((p.heading * 180) / Math.PI).toFixed(0) + '°',
        'State      ' + p.state + (p.grounded ? ' · grounded' : '') + (p.crouched ? ' · crouched' : '') + (p.sprinting ? ' · sprinting' : '') + (p.noclip ? ' · NOCLIP' : '') + (p.godMode ? ' · GOD' : ''),
        'Speed      ' + p.speed.toFixed(2) + ' m/s   vy ' + p.vel.y.toFixed(2),
        'District   ' + district.name + (g.world.roadNameAt(p.pos.x, p.pos.z) ? ' · ' + g.world.roadNameAt(p.pos.x, p.pos.z) : ''),
        'Camera     ' + g.cameraRig.mode.label + '   dist ' + g.cameraRig.curDist.toFixed(2) + '   fov ' + g.renderer.camera.fov.toFixed(0),
        '',
        'World      ' + g.world.stats.buildings + ' buildings · ' + g.world.stats.props + ' props · ' + g.world.stats.colliders + ' colliders',
        'Chunks     ' + g.world.chunks.size + ' · prop batches visible ' + g.world.props.visibleBatches + '/' + g.world.props.meshes.length,
        'Time       ' + g.environment.clockText() + (g.environment.clockRunning ? '' : ' (clock stopped)'),
        'Active NPCs 0 · vehicles 0 · wanted 0   (Phases 4–8)',
      ];
      this.stats.textContent = lines.join('\n');
      this._drawGraph();
    }

    _drawGraph() {
      const c = this.graph.getContext('2d');
      const w = this.graph.width;
      const h = this.graph.height;
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(0, h - (16.7 / 50) * h, w, 1);
      c.fillRect(0, h - (33.3 / 50) * h, w, 1);
      const n = this.frameTimes.length;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const ms = this.frameTimes[(this.frameIndex + i) % n];
        const bh = Math.min(h, (ms / 50) * h);
        c.fillStyle = ms > 33.3 ? '#ff5a5a' : ms > 18 ? '#ffb347' : '#35e0d0';
        c.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh);
      }
    }

    // ---------------------------------------------------------- commands
    run(line) {
      this.history.push(line);
      this.historyIndex = -1;
      this.print('> ' + line, 'cmd');
      const [cmd, ...args] = line.split(/\s+/);
      const g = this.game;
      const p = g.player;
      const num = (i, d) => (args[i] !== undefined && !isNaN(parseFloat(args[i])) ? parseFloat(args[i]) : d);
      const places = {
        plaza: [g.layout.spawn.x, g.layout.spawn.z],
        park: this._blockCenter('park'),
        tower: this._blockCenter('tower'),
        pier: [520, 0],
        boardwalk: [410, -60],
        market: [-330, -150],
        downtown: [0, -250],
        palm: [-150, 250],
        harbor: [300, 150],
        yard: g.world.courses && g.world.courses.yard_run ? [g.world.courses.yard_run.marker.x + 3, g.world.courses.yard_run.marker.z] : [-102, 28],
      };
      switch ((cmd || '').toLowerCase()) {
        case 'help':
          this.print('tp <x> <z> | tp <plaza|park|tower|pier|boardwalk|market|downtown|palm|harbor|yard|roof>');
          this.print('noclip · god · heal · hurt <n> · money <n> · armor <n>');
          this.print('car <type> · heat <0-5> · give <weapon|all> · job <id> · pass <id> · flag <name>');
          this.print('time <0-24> · clouds <0-1> · fov <deg> · quality <low|medium|high|ultra>');
          this.print('colliders · pos · respawn · clear · complete (pass the current job) · spawn <faction> (an enemy)');
          break;
        case 'tp': {
          let x;
          let z;
          if (args[0] && args[0].toLowerCase() === 'roof') {
            const roof = this._nearestRoof();
            if (!roof) {
              this.print('No low roof nearby', 'bad');
              break;
            }
            [x, z] = roof;
          } else if (args[0] && places[args[0].toLowerCase()]) [x, z] = places[args[0].toLowerCase()];
          else {
            x = num(0, NaN);
            z = num(1, NaN);
          }
          if (isNaN(x) || isNaN(z)) {
            this.print('usage: tp <x> <z>  or  tp plaza', 'bad');
            break;
          }
          p.teleport(x, z, p.heading);
          g.cameraRig.snapBehind(p);
          this.print('Teleported to ' + x.toFixed(0) + ', ' + z.toFixed(0) + ' (y ' + p.pos.y.toFixed(1) + ')');
          break;
        }
        case 'pos':
          this.print(p.pos.x.toFixed(2) + ' ' + p.pos.y.toFixed(2) + ' ' + p.pos.z.toFixed(2));
          break;
        case 'car': {
          // car [type]: a car beside Jay.
          const type = args[0] && VH.Vehicle.typeSpec(args[0]) ? args[0] : 'vireo';
          const v = g.vehicles.spawn(type, p.pos.x + Math.cos(p.heading) * 3.5, p.pos.z - Math.sin(p.heading) * 3.5, p.heading, { persistent: true });
          this.print('Spawned a ' + v.name + ' (types: ' + VH.CarModels.list().join(', ') + ')');
          break;
        }
        case 'heat':
          g.police.setLevel(num(0, 3), 'debug');
          g.police._sawPlayer();
          this.print('Heat ' + g.police.level);
          break;
        case 'give': {
          const id = args[0] || 'all';
          const ids = id === 'all' ? VH.Data.weapons.map((w) => w.id) : [id];
          for (const w of ids) g.combat.giveWeapon(w, 999, true);
          this.print('Gave ' + ids.join(', '));
          break;
        }
        case 'job': {
          const m = g.missions.all.get(args[0]);
          if (!m) {
            this.print('Jobs: ' + Array.from(g.missions.all.keys()).join(', '), 'bad');
            break;
          }
          g.police.reset();
          g.missions.start(m);
          this.print('Started ' + m.title);
          break;
        }
        case 'pass': {
          // pass <jobId>: mark jobs up to and including this one as done.
          const ids = Array.from(g.missions.all.keys());
          const upto = ids.indexOf(args[0]);
          for (let i = 0; i <= upto; i++) g.missions.completed[ids[i]] = true;
          g.missions.refreshMarkers();
          this.print('Marked ' + (upto + 1) + ' jobs done');
          break;
        }
        case 'flag':
          g.missions.flags[args[0]] = true;
          this.print('Flag ' + args[0]);
          break;
        case 'noclip':
          p.noclip = !p.noclip;
          if (!p.noclip) p.teleport(p.pos.x, p.pos.z, p.heading, p.pos.y);
          this.print('Noclip ' + (p.noclip ? 'on — fly with WASD, Space up, Ctrl down, Shift fast' : 'off'));
          break;
        case 'god':
          p.godMode = !p.godMode;
          this.print('God mode ' + (p.godMode ? 'on' : 'off'));
          break;
        case 'heal':
          p.health = p.maxHealth;
          this.print('Healed');
          break;
        case 'hurt':
          p.damage(num(0, 25), 'debug');
          this.print('Ouch');
          break;
        case 'armor':
        case 'armour':
          p.armor = VH.math.clamp(num(0, 100), 0, p.maxArmor);
          this.print('Armour ' + p.armor);
          break;
        case 'money': {
          const n = num(0, 1000);
          p.money += n;
          VH.events.emit('money:changed', { delta: n, reason: 'debug' });
          this.print('Money now ' + VH.util.formatMoney(p.money));
          break;
        }
        case 'time': {
          const h = num(0, NaN);
          if (isNaN(h)) this.print('usage: time <hours 0-24>', 'bad');
          else {
            g.environment.setTime(h);
            this.print('Time set to ' + g.environment.clockText());
          }
          break;
        }
        case 'clouds':
          g.environment.setCloudCover(num(0, 0.4));
          this.print('Cloud cover ' + g.environment.cloudCover.toFixed(2));
          break;
        case 'fov':
          VH.settings.set('graphics.fov', VH.math.clamp(num(0, 65), 40, 100));
          this.print('FOV ' + VH.settings.get('graphics.fov'));
          break;
        case 'quality':
          if (VH.SETTINGS_PRESETS[args[0]]) {
            VH.settings.applyPreset(args[0]);
            this.print('Quality preset: ' + args[0]);
          } else this.print('usage: quality <low|medium|high|ultra>', 'bad');
          break;
        case 'colliders':
          this._toggleColliders();
          this.print('Collider view ' + (this.colliderView ? 'on (nearby boxes in cyan, props in orange)' : 'off'));
          break;
        case 'respawn':
          p.respawn();
          g.cameraRig.snapBehind(p);
          this.print('Respawned');
          break;
        case 'complete': {
          const run = g.missions.run;
          if (!run) {
            this.print('No job running', 'bad');
            break;
          }
          g.missions._abort = null; // stops the step runner
          g.missions.cinematic = null;
          g.dialogue.stop();
          document.body.classList.remove('cutscene');
          p.frozen = false;
          g.frozenControls = false;
          g.missions._clearWaiters(run);
          g.missions._pass(run);
          this.print('Passed ' + run.m.title);
          break;
        }
        case 'spawn': {
          const fac = args[0] || 'halberd';
          g.combat.spawnEnemy(p.pos.x + Math.sin(p.heading) * 8, p.pos.z + Math.cos(p.heading) * 8, { faction: fac, weapon: args[1] || 'pistol', alert: true, hostile: true, look: g.missions.factionLook(fac, 0) });
          this.print('Spawned a ' + fac + ' enemy');
          break;
        }
        case 'wanted':
          g.police.setLevel(num(0, 3), 'debug');
          g.police._sawPlayer();
          this.print('Heat ' + g.police.level);
          break;
        case 'clear':
          this.log.innerHTML = '';
          break;
        default:
          this.print('Unknown command "' + cmd + '" — try help', 'bad');
      }
    }

    /** Centre of the nearest building whose roof is between 6 and 30 m up. */
    _nearestRoof() {
      const p = this.game.player.pos;
      let best = null;
      let bestD = Infinity;
      for (const lot of this.game.layout.lots) {
        if (lot.kind !== 'building') continue;
        const d = Math.hypot(lot.cx - p.x, lot.cz - p.z);
        if (d >= bestD) continue;
        const h = this.game.physics.groundHeight(lot.cx, lot.cz, 1000);
        if (h > 6 && h < 30) {
          best = [lot.cx, lot.cz];
          bestD = d;
        }
      }
      return best;
    }

    _blockCenter(kind) {
      const b = this.game.layout.blocks.find((bl) => bl.kind === kind);
      return b ? [b.cx, b.maxZ + 2] : [0, 0];
    }

    _toggleColliders() {
      if (this.colliderView) {
        this.game.scene.remove(this.colliderView);
        this.colliderView.geometry.dispose();
        this.colliderView = null;
        return;
      }
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true, transparent: true, opacity: 0.85 });
      this.colliderView = new THREE.LineSegments(geo, mat);
      this.colliderView.frustumCulled = false;
      this.game.scene.add(this.colliderView);
      this._colliderTimer = 0;
    }

    _rebuildColliders() {
      this._colliderTimer = 0.5;
      const p = this.game.player.pos;
      const pos = [];
      const col = [];
      const push = (x, y, z, c) => {
        pos.push(x, y, z);
        col.push(c[0], c[1], c[2]);
      };
      this.game.physics.forEachNear(p.x, p.z, 45, (c) => {
        const colr = c.tag === 'prop' ? [1, 0.55, 0.1] : c.tag === 'boundary' ? [1, 0.2, 0.3] : c.type === 1 ? [0.6, 1, 0.3] : [0.2, 0.9, 1];
        const corners = [[-c.hx, -c.hz], [c.hx, -c.hz], [c.hx, c.hz], [-c.hx, c.hz]].map(([lx, lz]) => [
          c.cx + lx * c.cos + lz * c.sin, c.cz - lx * c.sin + lz * c.cos, lz,
        ]);
        const topAt = (lz) => VH.CollisionWorld.topAt(c, lz);
        const y0 = Math.max(c.minY, -0.5);
        for (let i = 0; i < 4; i++) {
          const a = corners[i];
          const b = corners[(i + 1) % 4];
          push(a[0], y0, a[1], colr); push(b[0], y0, b[1], colr);
          push(a[0], topAt(a[2]), a[1], colr); push(b[0], topAt(b[2]), b[1], colr);
          push(a[0], y0, a[1], colr); push(a[0], topAt(a[2]), a[1], colr);
        }
      });
      const g = this.colliderView.geometry;
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeBoundingSphere();
    }
  }

  VH.DebugOverlay = DebugOverlay;
})();
