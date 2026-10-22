/*
 * net.js — drop-in multiplayer free roam over WebRTC (OWNER: Account B).
 *
 * One player hosts and gets a six-letter room code; up to four friends join
 * with it. The public PeerJS broker (peerjs.com) only introduces the
 * browsers; after that they talk to each other directly. The host relays
 * (star topology), so every message goes host <-> client.
 *
 * Shared: where each player is (on foot or in which vehicle, its pose and
 * colour), gunfire that hits another player, text chat. Each game keeps its
 * own traffic, pedestrians, police and story jobs.
 *
 * Self-contained: its own panel (F9), its own frame loop (requestAnimation
 * Frame), no hooks in main.js. Remote players are crowd agents with a
 * "puppet" brain (on foot) or bare vehicle models (driving / flying).
 *
 *   VH.net                   the session (made on first F9)
 *     .host(name)  .join(code, name)  .leave()  .say(text)
 *     .status      'offline' | 'connecting' | 'hosting' | 'connected' | 'error'
 *     ._receive(msg, fromId) the message handler (tests feed it directly)
 *
 * Needs window.Peer (lib/peerjs.min.js, MIT). Some strict networks (school,
 * office) block direct peer connections; then joining fails with a message.
 */
(function () {
  'use strict';

  const VH = window.VH;
  const PREFIX = 'vicehaven-mp-';
  const SEND_HZ = 15;
  const MAX_PLAYERS = 5;
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  const lerp = (a, b, t) => a + (b - a) * t;
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // ------------------------------------------------------- a remote player
  class Remote {
    constructor(net, id, name) {
      this.net = net;
      this.id = id;
      this.name = name || 'Player';
      this.target = null; // latest state
      this.agent = null;
      this.car = null; // { type, color, root }
      this.seen = performance.now();
    }

    apply(s) {
      this.target = s;
      this.name = s.n || this.name;
      this.seen = performance.now();
    }

    _ensureAgent() {
      if (this.agent && !this.agent.removed) return this.agent;
      const g = this.net.game;
      const s = this.target;
      const look = Object.assign(VH.Crowd.randomLook(), s.look || {});
      const a = g.crowd.spawn(s.x, s.z, { look, faction: 'friendly', role: 'remote', persistent: true, health: 1e6, name: this.name });
      a.remoteId = this.id;
      a.noDrop = true;
      const r = this;
      a.brain = {
        update(ag, dt) {
          const t = r.target;
          if (!t) return;
          const k = Math.min(1, dt * 12);
          ag.pos.x = lerp(ag.pos.x, t.x, k);
          ag.pos.y = lerp(ag.pos.y, t.y, k);
          ag.pos.z = lerp(ag.pos.z, t.z, k);
          ag.heading = lerpAngle(ag.heading, t.h, k);
          ag.moveSpeed = 0;
          ag.anim.sprint = t.sp > 4.5;
          ag.anim.aim = t.aim ? 1 : 0;
          ag.anim.weaponPose = t.aim ? t.wp || 'pistol' : null;
          ag.health = 1e6; // damage is applied on their own machine (see 'hit')
        },
        expired() {
          return false;
        },
      };
      this.agent = a;
      return a;
    }

    _ensureCar(v) {
      const g = this.net.game;
      if (this.car && this.car.type === v.type && this.car.color === v.c) return this.car;
      this._dropCar();
      let model = null;
      try {
        const spec = VH.Vehicle.typeSpec(v.type);
        if (spec && (spec.kind === 'plane' || spec.kind === 'heli') && VH.AircraftModels) model = VH.AircraftModels.build(v.type, v.c);
        else if (VH.CarModels.TYPES[v.type] && spec && !spec.kind) model = VH.CarModels.build(v.type, { color: v.c });
      } catch (e) {
        model = null;
      }
      if (!model) model = VH.CarModels.build('halcyon', { color: v.c }); // a tank or something unknown: stand-in
      g.scene.add(model.root);
      this.car = { type: v.type, color: v.c, model, root: model.root };
      return this.car;
    }

    _dropCar() {
      if (!this.car) return;
      this.net.game.scene.remove(this.car.root);
      this.car = null;
    }

    update(dt) {
      const t = this.target;
      if (!t) return;
      if (t.v) {
        const c = this._ensureCar(t.v);
        const k = Math.min(1, dt * 10);
        const r = c.root;
        r.position.set(lerp(r.position.x, t.x, k), lerp(r.position.y, t.y, k), lerp(r.position.z, t.z, k));
        r.rotation.set(t.v.p || 0, lerpAngle(r.rotation.y, t.v.yaw, k), t.v.r || 0, 'YXZ');
        if (c.model.prop) c.model.prop.rotation.z += dt * 40;
        if (c.model.rotor) c.model.rotor.rotation.y += dt * 28;
        if (this.agent && !this.agent.removed) {
          this.agent.hidden = true;
          this.agent.pos.set(t.x, t.y, t.z);
        }
      } else {
        this._dropCar();
        const a = this._ensureAgent();
        a.hidden = false;
      }
    }

    dispose() {
      this._dropCar();
      if (this.agent && !this.agent.removed) this.net.game.crowd.remove(this.agent);
      this.agent = null;
    }
  }

  // ------------------------------------------------------------- the net
  class Net {
    constructor(game) {
      this.game = game;
      this.peer = null;
      this.conns = new Map(); // peer id -> DataConnection
      this.remotes = new Map(); // player id -> Remote
      this.status = 'offline';
      this.code = null;
      this.isHost = false;
      this.myId = null;
      this.name = Net._savedName();
      this._sendT = 0;
      this._last = performance.now();
      this._buildPanel();
      this._bind();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    static available() {
      return typeof window.Peer === 'function';
    }

    static _savedName() {
      try {
        return localStorage.getItem('vicehaven.mp.name') || 'Player';
      } catch (e) {
        return 'Player';
      }
    }

    // ------------------------------------------------------ connecting
    host(name) {
      if (!Net.available()) return this._fail('Multiplayer library missing.');
      this.leave();
      this._setName(name);
      this.isHost = true;
      this.code = Array.from({ length: 6 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
      this._status('connecting', 'Opening room ' + this.code + '…');
      this.peer = new window.Peer(PREFIX + this.code);
      this.peer.on('open', (id) => {
        this.myId = id;
        this._status('hosting', 'Room code: ' + this.code + '. Friends join with it (F9).');
      });
      this.peer.on('connection', (c) => {
        if (this.conns.size >= MAX_PLAYERS - 1) {
          c.on('open', () => c.close());
          return;
        }
        this._wire(c);
      });
      this.peer.on('error', (e) => this._fail(Net._errText(e)));
      return this.code;
    }

    join(code, name) {
      if (!Net.available()) return this._fail('Multiplayer library missing.');
      code = String(code || '').trim().toUpperCase();
      if (!/^[A-Z]{6}$/.test(code)) return this._fail('A room code is six letters.');
      this.leave();
      this._setName(name);
      this.isHost = false;
      this.code = code;
      this._status('connecting', 'Joining ' + code + '…');
      this.peer = new window.Peer();
      this.peer.on('open', (id) => {
        this.myId = id;
        const c = this.peer.connect(PREFIX + code, { reliable: false, serialization: 'json' });
        this._wire(c);
        setTimeout(() => {
          if (this.status === 'connecting') this._fail('No answer from room ' + code + '. Check the code; some networks block this.');
        }, 12000);
      });
      this.peer.on('error', (e) => this._fail(Net._errText(e)));
    }

    leave() {
      for (const c of this.conns.values()) {
        try {
          c.close();
        } catch (e) {
          /* already closed */
        }
      }
      this.conns.clear();
      for (const r of this.remotes.values()) r.dispose();
      this.remotes.clear();
      if (this.peer) {
        try {
          this.peer.destroy();
        } catch (e) {
          /* already gone */
        }
      }
      this.peer = null;
      this.code = null;
      this._status('offline', 'Not connected.');
    }

    static _errText(e) {
      const t = e && e.type;
      if (t === 'unavailable-id') return 'That room code is taken; host again for a new one.';
      if (t === 'peer-unavailable') return 'No room with that code is open.';
      if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Can\'t reach the matchmaking server (offline, or blocked on this network).';
      if (t === 'browser-incompatible') return 'This browser doesn\'t support WebRTC.';
      return 'Connection error' + (t ? ' (' + t + ')' : '') + '.';
    }

    _wire(c) {
      c.on('open', () => {
        this.conns.set(c.peer, c);
        if (!this.isHost) this._status('connected', 'Connected to room ' + this.code + '.');
        this._sendTo(c, { t: 'hello', id: this.myId, n: this.name });
        this.game.hud.notify({ title: 'Multiplayer', text: this.isHost ? 'A player joined.' : 'Joined room ' + this.code + '.', icon: '🌐', tone: 'good' });
      });
      c.on('data', (msg) => this._receive(msg, c.peer));
      c.on('close', () => this._dropConn(c.peer));
      c.on('error', () => this._dropConn(c.peer));
    }

    _dropConn(pid) {
      this.conns.delete(pid);
      // Players who came through this connection are gone (for a client: everyone).
      for (const [id, r] of this.remotes) {
        if (r.via === pid || !this.isHost) {
          r.dispose();
          this.remotes.delete(id);
          if (this.isHost) this._broadcast({ t: 'bye', id });
        }
      }
      if (!this.isHost && this.status !== 'offline') {
        this._status('offline', 'The host left.');
        this.game.hud.notify({ title: 'Multiplayer', text: 'Disconnected from the room.', icon: '🌐', tone: 'bad' });
      }
    }

    // --------------------------------------------------------- messages
    _sendTo(c, msg) {
      try {
        if (c.open) c.send(msg);
      } catch (e) {
        /* dropped */
      }
    }

    /** To everyone (the host fans out; a client only talks to the host). */
    _broadcast(msg, exceptPeer) {
      for (const [pid, c] of this.conns) if (pid !== exceptPeer) this._sendTo(c, msg);
    }

    _receive(msg, fromPeer) {
      if (!msg || typeof msg !== 'object') return;
      // The host passes everything on to the other clients.
      if (this.isHost && fromPeer && msg.t !== 'hit') this._broadcast(msg, fromPeer);
      switch (msg.t) {
        case 'hello':
        case 's': {
          if (!msg.id || msg.id === this.myId) return;
          let r = this.remotes.get(msg.id);
          if (!r) {
            r = new Remote(this, msg.id, msg.n);
            r.via = fromPeer;
            this.remotes.set(msg.id, r);
          }
          if (msg.t === 's') r.apply(msg);
          return;
        }
        case 'bye': {
          const r = this.remotes.get(msg.id);
          if (r) {
            r.dispose();
            this.remotes.delete(msg.id);
          }
          return;
        }
        case 'chat':
          this.game.hud.notify({ title: msg.n || 'Player', text: String(msg.text || '').slice(0, 140), icon: '💬' });
          this._chatLog(msg.n, msg.text);
          return;
        case 'hit':
          if (msg.target === this.myId) {
            this.game.player.damage(Math.min(200, msg.dmg || 0), 'bullet');
          } else if (this.isHost) {
            const r = this.remotes.get(msg.target);
            if (r && r.via) this._sendTo(this.conns.get(r.via), msg);
          }
          return;
        default:
      }
    }

    say(text) {
      text = String(text || '').trim().slice(0, 140);
      if (!text || !this.conns.size) return;
      const msg = { t: 'chat', id: this.myId, n: this.name, text };
      this._broadcast(msg);
      this._chatLog(this.name, text);
    }

    _myState() {
      const p = this.game.player;
      const v = p.inVehicle ? p.vehicle : null;
      const pos = v ? v.pos : p.pos;
      const c = this.game.combat;
      const look = p.look || (p.agent && p.agent.look) || null;
      return {
        t: 's', id: this.myId, n: this.name,
        x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2),
        h: +(p.heading || 0).toFixed(3), sp: +(p.speed || 0).toFixed(1),
        aim: !!p.aiming, wp: c && c.current ? (VH.Combat.def(c.current) || {}).hold || 'pistol' : null,
        look: look ? { skin: look.skin, hair: look.hair, top: look.top, bottom: look.bottom, shoes: look.shoes } : undefined,
        v: v ? { type: v.type, c: v.model && v.model.color, yaw: +v.yaw.toFixed(3), p: +(v.pitch || 0).toFixed(3), r: +(v.roll || 0).toFixed(3) } : null,
      };
    }

    // ------------------------------------------------------------ frame
    _loop(now) {
      requestAnimationFrame(this._loop);
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      if (!this.conns.size && !this.remotes.size) return;
      const g = this.game;
      if (g.state === 'playing' && this.myId) {
        this._sendT -= dt;
        if (this._sendT <= 0) {
          this._sendT = 1 / SEND_HZ;
          this._broadcast(this._myState());
        }
      }
      for (const [id, r] of this.remotes) {
        if (now - r.seen > 8000) {
          r.dispose();
          this.remotes.delete(id);
          continue;
        }
        r.update(dt);
      }
      this._renderPlayers();
    }

    _bind() {
      // Shooting a remote player's puppet: tell their machine.
      VH.events.on('agent:hurt', (e) => {
        const a = e.agent;
        if (!a || !a.remoteId || e.source !== 'player') return;
        const msg = { t: 'hit', target: a.remoteId, dmg: e.amount || 20 };
        if (this.isHost) {
          const r = this.remotes.get(a.remoteId);
          if (r && r.via) this._sendTo(this.conns.get(r.via), msg);
        } else this._broadcast(msg);
      });
      window.addEventListener('keydown', (e) => {
        if (e.code === 'F9') {
          e.preventDefault();
          this.toggle();
        }
      });
    }

    _setName(name) {
      this.name = String(name || this.name || 'Player').trim().slice(0, 16) || 'Player';
      try {
        localStorage.setItem('vicehaven.mp.name', this.name);
      } catch (e) {
        /* not kept */
      }
    }

    _status(s, text) {
      this.status = s;
      if (this.statusEl) this.statusEl.textContent = text || s;
      if (this.panel) this.panel.dataset.status = s;
    }

    _fail(text) {
      this._status('error', text);
      return null;
    }

    // ------------------------------------------------------------ panel
    _buildPanel() {
      const el = (tag, cls, txt) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt) e.textContent = txt;
        return e;
      };
      const p = el('div', 'vh-mp');
      p.innerHTML = '<div class="vh-mp-title">MULTIPLAYER <span>F9</span></div>';
      const name = el('input', 'vh-mp-in');
      name.placeholder = 'Your name';
      name.maxLength = 16;
      name.value = this.name;
      const hostBtn = el('button', 'vh-mp-btn', 'Host a room');
      const code = el('input', 'vh-mp-in');
      code.placeholder = 'Room code';
      code.maxLength = 6;
      const joinBtn = el('button', 'vh-mp-btn', 'Join');
      const leaveBtn = el('button', 'vh-mp-btn ghost', 'Leave');
      this.statusEl = el('div', 'vh-mp-status', 'Not connected.');
      this.playersEl = el('div', 'vh-mp-players');
      this.logEl = el('div', 'vh-mp-log');
      const chat = el('input', 'vh-mp-in');
      chat.placeholder = 'Say something (Enter)';
      const row1 = el('div', 'vh-mp-row');
      row1.append(name, hostBtn);
      const row2 = el('div', 'vh-mp-row');
      row2.append(code, joinBtn, leaveBtn);
      p.append(row1, row2, this.statusEl, this.playersEl, this.logEl, chat);
      hostBtn.onclick = () => this.host(name.value);
      joinBtn.onclick = () => this.join(code.value, name.value);
      leaveBtn.onclick = () => this.leave();
      chat.onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.say(chat.value);
          chat.value = '';
        }
      };
      // Typing in the panel must not drive Jay around.
      for (const i of [name, code, chat]) {
        i.addEventListener('keydown', (e) => {
          if (e.code !== 'F9') e.stopPropagation();
        });
        i.addEventListener('keyup', (e) => e.stopPropagation());
      }
      if (!Net.available()) this._status('error', 'Multiplayer is not available in this build.');
      document.body.appendChild(p);
      this.panel = p;
      const css = document.createElement('style');
      css.textContent = Net.CSS;
      document.head.appendChild(css);
    }

    toggle(open) {
      const on = open === undefined ? !this.panel.classList.contains('open') : !!open;
      this.panel.classList.toggle('open', on);
      if (on && document.exitPointerLock) document.exitPointerLock();
    }

    _renderPlayers() {
      if (!this.playersEl || !this.panel.classList.contains('open')) return;
      const names = [this.name + ' (you)'].concat(Array.from(this.remotes.values()).map((r) => r.name));
      const txt = names.join(' · ');
      if (this.playersEl.textContent !== txt) this.playersEl.textContent = txt;
    }

    _chatLog(n, text) {
      if (!this.logEl) return;
      const line = document.createElement('div');
      line.textContent = (n || 'Player') + ': ' + String(text || '').slice(0, 140);
      this.logEl.appendChild(line);
      while (this.logEl.childNodes.length > 8) this.logEl.removeChild(this.logEl.firstChild);
    }
  }

  Net.CSS = `
.vh-mp { position: fixed; right: 1.5rem; top: 4.2rem; width: min(24rem, 92vw); padding: 0.9rem 1rem;
  border-radius: 14px; background: rgba(9, 13, 26, 0.92); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 14px 40px rgba(0,0,0,0.5);
  font-family: var(--vh-font, system-ui); color: #f1f4ff; z-index: 50; display: none; }
.vh-mp.open { display: block; }
.vh-mp-title { font-family: var(--vh-font-display, system-ui); letter-spacing: 0.22em; font-size: 0.8rem; color: #ffb347; margin-bottom: 0.6rem; }
.vh-mp-title span { float: right; color: #9ea9c7; letter-spacing: 0.1em; }
.vh-mp-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.vh-mp-in { flex: 1; min-width: 0; padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: inherit; font: inherit; }
.vh-mp-btn { padding: 0.45rem 0.8rem; border-radius: 8px; border: 0; background: linear-gradient(90deg, #ff7a59, #ff4f8b); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.vh-mp-btn.ghost { background: rgba(255,255,255,0.1); }
.vh-mp-status { font-size: 0.85rem; color: #9ea9c7; margin: 0.3rem 0; }
.vh-mp[data-status="hosting"] .vh-mp-status, .vh-mp[data-status="connected"] .vh-mp-status { color: #7dffa8; }
.vh-mp[data-status="error"] .vh-mp-status { color: #ff5a5a; }
.vh-mp-players { font-size: 0.8rem; margin: 0.3rem 0; color: #f1f4ff; }
.vh-mp-log { font-size: 0.8rem; color: #c9d1ea; max-height: 8.5rem; overflow: hidden; margin-bottom: 0.4rem; }
`;

  Net.Remote = Remote;
  VH.Net = Net;
  // Made once the game exists (the panel needs the HUD for notices).
  const boot = () => {
    if (VH.game && VH.game.crowd && VH.game.hud) {
      if (!VH.net) VH.net = new Net(VH.game);
    } else setTimeout(boot, 500);
  };
  boot();
})();
