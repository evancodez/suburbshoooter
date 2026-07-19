// net.js — P2P multiplayer: PeerJS signaling, host-relay star topology
// Host runs bot AI + scoring; every client simulates its own player and its own
// explosives, and broadcasts events. World damage replays identically everywhere
// because map generation is deterministic.
G.net = (function () {
  const N = {
    active: false,      // in a networked match
    isHost: false,
    applying: false,    // true while applying a remote event (suppresses re-broadcast)
    myId: '', myName: 'Player', myTeam: 0,
    remoteList: [],
    lobby: null,        // {players:[{id,name,team,host}], cfg:{botsA,botsB,diff}}
    code: '',
    onLobby: null, onStart: null, onClosed: null, onJoinFail: null,
  };
  const PREFIX = 'blockops-v1-';
  // PeerJS's default ICE list only has UDP TURN on :3478, which dies on
  // firewalls that block UDP and home routers with client isolation — add
  // relays reachable over TCP/443 so those networks can still connect
  const PEER_OPTS = {
    config: {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
        { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      sdpSemantics: 'unified-plan',
    },
  };
  let peer = null;
  let conns = [];       // host: all client connections
  let hostConn = null;  // client: connection to host
  let guestN = 0;       // host: counter for auto-assigned Guest names
  let stateAcc = 0, snapAcc = 0;
  const tmpV = new THREE.Vector3();

  function shortCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // ---------- remote player entities ----------
  function RemotePlayer(id, name, team) {
    const rp = {
      id, name, team, alive: true, weapon: 'ar',
      pos: new THREE.Vector3(0, 0, 0),
      netX: 0, netY: 0, netZ: 0, netYaw: 0, netPitch: 0, netSpd: 0,
      yaw: 0, animPhase: 0,
      lastShotT: 99, radarT: 0,
      kills: 0, deaths: 0,
    };
    G.botMgr.buildModel(rp); // group, limbs, tag (team-colored)
    rp.hurtFx = function (dir, head) {
      tmpV.set(rp.pos.x, rp.pos.y + (head ? 1.62 : 1.2), rp.pos.z);
      G.fx.bloodBurst(tmpV, dir || new THREE.Vector3(0, 0.4, 0), head ? 12 : 7, 5);
    };
    G.scene.add(rp.group);
    return rp;
  }
  function removeRemote(id) {
    const i = N.remoteList.findIndex(r => r.id === id);
    if (i >= 0) {
      G.scene.remove(N.remoteList[i].group);
      N.remoteList.splice(i, 1);
    }
  }

  // ---------- corpses: the fallen stay where they fell (for a while) ----------
  const corpses = [];
  function spawnCorpse(rp) {
    const c = rp.group.clone();
    for (let i = c.children.length - 1; i >= 0; i--) {
      if (c.children[i].isSprite) c.remove(c.children[i]); // no nametag, no marker
    }
    c.position.copy(rp.pos);
    c.rotation.y = rp.yaw + Math.PI;
    c.visible = true;
    G.scene.add(c);
    corpses.push({ g: c, t: 10, fallT: 0, axis: Math.random() < 0.5 ? 1 : -1 });
  }
  N.clearCorpses = function () {
    for (const c of corpses) G.scene.remove(c.g);
    corpses.length = 0;
  };
  function updateCorpses(dt) {
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      if (c.fallT < 0.62) { // keel over, bot-style
        c.fallT += dt;
        const t = Math.min(c.fallT / 0.5, 1);
        c.g.rotation.x = (1 - Math.pow(1 - t, 2.4)) * (Math.PI / 2) * 0.96 * c.axis;
        if (t >= 1 && c.fallT - dt < 0.5) G.fx.dustLand(c.g.position);
      }
      c.t -= dt;
      if (c.t < 1) c.g.position.y -= dt * 1.6; // sink away at the end
      if (c.t <= 0) { G.scene.remove(c.g); corpses.splice(i, 1); }
    }
  }
  function remoteById(id) { return N.remoteList.find(r => r.id === id); }
  N.remoteById = remoteById;

  function refreshTag(rp) {
    const friendly = rp.team === N.myTeam;
    rp.group.remove(rp.tag);
    rp.tag = G.botMgr.makeNametag(rp.name, friendly ? '#7dff7d' : '#ff5544');
    if (friendly) { rp.tag.material.depthTest = false; rp.tag.renderOrder = 9; }
    rp.group.add(rp.tag);
  }
  // free-for-all matches give every human a unique team; the lobby keeps its
  // green/red split, so while a match runs this override map wins
  N.teamOverrides = null;
  function effTeam(p) {
    if (N.teamOverrides && N.teamOverrides[p.id] !== undefined) return N.teamOverrides[p.id];
    return p.team;
  }
  function syncRemotesToLobby() {
    // create/update remote entities from lobby roster (all players except me)
    if (!N.lobby) return;
    // my own entry first — everyone else's colors depend on my team
    const me = N.lobby.players.find(p => p.id === N.myId);
    if (me) {
      N.myTeam = effTeam(me);
      N.myName = me.name; // host may have assigned Guest# or applied a rename
      if (G.player) G.player.team = N.myTeam;
      if (N.myTeam !== lastMyTeam) { lastMyTeam = N.myTeam; refreshAllTeamVisuals(); }
    }
    for (const p of N.lobby.players) {
      if (p.id === N.myId) continue;
      const pt = effTeam(p);
      let rp = remoteById(p.id);
      if (rp && rp.team !== pt) { removeRemote(p.id); rp = null; } // team swap: rebuild shirts
      if (!rp) {
        rp = RemotePlayer(p.id, p.name, pt);
        N.remoteList.push(rp);
        refreshTag(rp);
      } else if (rp.name !== p.name) { // renamed in lobby: redraw the floating tag
        rp.name = p.name;
        refreshTag(rp);
      }
    }
    // drop entities for players no longer present
    for (let i = N.remoteList.length - 1; i >= 0; i--) {
      if (!N.lobby.players.find(p => p.id === N.remoteList[i].id)) removeRemote(N.remoteList[i].id);
    }
  }
  // my own team changed in the lobby: every tag/marker color is relative to me
  let lastMyTeam = -1;
  function refreshAllTeamVisuals() {
    for (const rp of N.remoteList) refreshTag(rp);
  }

  // ---------- wire ----------
  function bc(msg, exceptConn) { // host broadcast
    for (const c of conns) if (c !== exceptConn && c.open) c.send(msg);
  }
  function toHost(msg) { if (hostConn && hostConn.open) hostConn.send(msg); }
  function out(msg) { // event from local game code → everyone else
    if (!N.active && !N.lobby) return;
    if (N.isHost) bc(msg);
    else toHost(msg);
  }

  // ---------- events (called from game code) ----------
  N.evShot = (k, hit) => out({ t: 'sh', k, x: +hit.x.toFixed(1), y: +hit.y.toFixed(1), z: +hit.z.toFixed(1), id: N.myId });
  N.evChunk = (w, c, r, d) => out({ t: 'ck', w, c, r, d: Math.round(d) });
  N.evSheet = (si, ci, d) => out({ t: 'sk', si, ci, d: Math.round(d) });
  N.evCar = (i, d) => out({ t: 'cd', i, d: Math.round(d) });
  N.evProp = (i, d) => out({ t: 'pd', i, d: Math.round(d) });
  N.evBoom = (pos, r, d, tag) => out({ t: 'bm', x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), r, d, tag, an: N.myName, at: N.myTeam });
  N.evNade = (pos, vel) => out({ t: 'ng', x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), vx: +vel.x.toFixed(1), vy: +vel.y.toFixed(1), vz: +vel.z.toFixed(1) });
  N.evRocket = (pos, vel) => out({ t: 'rk', x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), vx: +vel.x.toFixed(1), vy: +vel.y.toFixed(1), vz: +vel.z.toFixed(1) });
  N.evStrike = (x, z) => out({ t: 'as', x: Math.round(x), z: Math.round(z), tm: N.myTeam });
  N.evDmgP = (id, d, fx, fz, an, at, tag) => {
    const msg = { t: 'dp', id, d: Math.round(d), fx: Math.round(fx), fz: Math.round(fz), an: an || N.myName, at: at === undefined ? N.myTeam : at, tag: tag || '' };
    if (N.isHost) routeDmgP(msg);
    else toHost(msg);
  };
  N.evDmgBot = (i, d, head, dx, dz, cause, close, tag) =>
    out({ t: 'db', i, d: Math.round(d), h: head ? 1 : 0, dx: +dx.toFixed(2), dz: +dz.toFixed(2), c: cause, cl: close ? 1 : 0, tag });
  N.evBotDie = (i, info) => { if (N.isHost) bc({ t: 'bd', i, ...info }); };
  N.evBotSpawn = (i, x, z) => { if (N.isHost) bc({ t: 'bs', i, x: +x.toFixed(1), z: +z.toFixed(1) }); };
  N.evKillFeed = (kt, kn, vn, tag, head) => { if (N.isHost) bc({ t: 'kf', kt, kn, vn, tag, h: head ? 1 : 0 }); };
  N.evScore = (s) => { if (N.isHost) bc({ t: 'sc', s }); };
  N.evChat = (n, m) => out({ t: 'chat', n, m });
  N.evDied = (byName, byTeam, tag) => {
    const msg = { t: 'died', id: N.myId, vn: N.myName, vt: N.myTeam, by: byName, bt: byTeam, tag };
    if (N.isHost) hostHandleDied(msg);
    else toHost(msg);
  };
  // win: team index (team modes) — wn: winner's display name (ffa/gun modes)
  N.evEnd = (win, wn) => { if (N.isHost) bc({ t: 'end', win, wn }); };

  function routeDmgP(msg) {
    // host: deliver to target (or self), relay so nothing else needs it
    if (msg.id === N.myId) applyDmgP(msg);
    else {
      const c = conns.find(c => c._pid === msg.id);
      if (c && c.open) c.send(msg);
    }
  }
  function applyDmgP(msg) {
    if (!G.game || !G.player) return;
    tmpV.set(msg.fx, 0, msg.fz);
    G.game.onPlayerDamage(msg.d, tmpV, { name: msg.an, team: msg.at, remote: true }, msg.tag || 'shot');
  }
  function hostHandleDied(msg) {
    // score + feed, authoritative on host
    if (G.game) G.game.onHumanDied(msg.vn, msg.vt, msg.by, msg.bt, msg.tag);
  }

  // ---------- inbound ----------
  function handle(msg, fromConn) {
    switch (msg.t) {
      case 'hello': { // client introduced itself (host only)
        if (!N.isHost) { fromConn.send({ t: 'nope', why: 'not hosting' }); return; }
        fromConn._pid = msg.pid;
        let nm = String(msg.name || '').trim().slice(0, 14);
        if (!nm) nm = 'Guest' + (++guestN); // no name yet: number them in join order
        fromConn._name = nm;
        // auto-balance team
        const a = N.lobby.players.filter(p => p.team === 0).length;
        const b = N.lobby.players.filter(p => p.team === 1).length;
        N.lobby.players.push({ id: msg.pid, name: nm, team: a <= b ? 0 : 1, host: false });
        // free-for-all in progress: the newcomer needs a unique team too
        if (N.active && N.teamOverrides) {
          N.teamOverrides[msg.pid] = N.ffaSeq++;
          bc({ t: 'teams', teams: N.teamOverrides }); // everyone re-colors
        }
        pushLobby();
        if (N.active) {
          // match already running: drop them straight in with the current world state
          const roster = (N.matchRoster || []).map((r, i) => {
            const b2 = G.botMgr.bots[i];
            return { ...r, x: b2 ? +b2.group.position.x.toFixed(1) : 0, z: b2 ? +b2.group.position.z.toFixed(1) : 0 };
          });
          fromConn.send({
            t: 'start', cfg: N.matchCfg, roster, late: true,
            teams: N.teamOverrides || undefined,
            world: G.world.damageSnapshot(),
            scores: G.game ? G.game.teamScores : [0, 0],
            mk: G.game ? G.game.modeKills : undefined,
            mt: G.game ? Math.round(G.game.matchT) : 0,
            botsAlive: G.botMgr.bots.map(b2 => b2.alive ? 1 : 0),
          });
          if (G.game) G.game.chat('SYSTEM', nm + ' joined the match', true);
        }
        break;
      }
      case 'name': { // client picked a name in the lobby
        if (!N.isHost) break;
        const nm = String(msg.name || '').trim().slice(0, 14);
        if (!nm) break;
        fromConn._name = nm;
        const p = N.lobby && N.lobby.players.find(p => p.id === fromConn._pid);
        if (p && p.name !== nm) { p.name = nm; pushLobby(); }
        break;
      }
      case 'lobby':
        N.lobby = msg.lobby;
        syncRemotesToLobby();
        if (N.onLobby) N.onLobby();
        break;
      case 'nope':
        if (N.onJoinFail) N.onJoinFail(msg.why);
        break;
      case 'start':
        N.active = true;
        N.teamOverrides = msg.teams || null;
        syncRemotesToLobby();
        if (N.onStart) N.onStart(msg.cfg, msg.roster, msg);
        break;
      case 'teams': // ffa override map changed (late joiner arrived)
        N.teamOverrides = msg.teams || null;
        syncRemotesToLobby();
        break;
      case 'roster': // host changed the bot lineup mid-match
        if (!N.isHost && G.botMgr) {
          G.botMgr.init(G.scene, msg.roster, (N.lobby && N.lobby.cfg.diff) || 'normal', true);
        }
        if (G.game) G.game.chat('SYSTEM', 'the host rearranged the bots', true);
        break;
      case 'st': { // player state
        const id = N.isHost ? fromConn._pid : msg.id;
        const rp = remoteById(id);
        if (rp) {
          rp.netX = msg.x; rp.netY = msg.y; rp.netZ = msg.z;
          rp.netYaw = msg.yw; rp.netPitch = msg.pt; rp.netSpd = msg.sp;
          const wasAlive = rp.alive;
          rp.alive = msg.al === 1;
          if (wasAlive && !rp.alive) spawnCorpse(rp); // leave a body, not a vanishing act
          rp.weapon = msg.w;
        }
        if (N.isHost) { msg.id = id; bc(msg, fromConn); }
        break;
      }
      case 'snap': // host → clients: bot states
        if (!N.isHost && G.botMgr) G.botMgr.applySnapshot(msg.b);
        if (msg.mt !== undefined && G.game) G.game.matchT = msg.mt;
        break;
      case 'sh': { // remote shot: tracer + sound from shooter's position
        const id = N.isHost ? fromConn._pid : msg.id;
        const rp = remoteById(id);
        if (rp) {
          rp.lastShotT = 0; rp.radarT = 2.6;
          tmpV.set(rp.pos.x, rp.pos.y + 1.45, rp.pos.z);
          G.fx.muzzle(tmpV, 0.45);
          G.fx.tracer(tmpV, new THREE.Vector3(msg.x, msg.y, msg.z), 0.09);
          G.audio.shot(['sr', 'sg', 'rev', 'smg', 'dmr', 'lmg'].includes(msg.k) ? msg.k : 'bot', rp.pos);
          if (N.isHost && G.botMgr) G.botMgr.onNoise(rp.pos, 48);
        }
        if (N.isHost) { msg.id = id; bc(msg, fromConn); }
        break;
      }
      case 'ck': N.applying = true; G.world.damageChunkById(msg.w, msg.c, msg.r, msg.d); N.applying = false; relay(msg, fromConn); break;
      case 'sk': N.applying = true; G.world.damageSheetById(msg.si, msg.ci, msg.d); N.applying = false; relay(msg, fromConn); break;
      case 'cd': {
        N.applying = true;
        const car = G.world.carByIndex(msg.i);
        if (car) G.world.damageCar(car, msg.d, null);
        N.applying = false;
        relay(msg, fromConn);
        break;
      }
      case 'pd': {
        N.applying = true;
        const prop = G.world.propByIndex(msg.i);
        if (prop) G.world.damageProp(prop, msg.d, null);
        N.applying = false;
        relay(msg, fromConn);
        break;
      }
      case 'bm': {
        N.applying = true;
        tmpV.set(msg.x, msg.y, msg.z);
        // volcano bombs come from the mountain, not from whoever hosted the lobby
        const att = msg.tag === 'VOLCANO' ? { name: 'THE VOLCANO', team: -1 } : { name: msg.an, team: msg.at, remote: true };
        G.world.explode(tmpV, msg.r, msg.d, { attacker: att, tag: msg.tag });
        N.applying = false;
        relay(msg, fromConn);
        break;
      }
      case 'ng':
        G.arsenal.spawnNade(new THREE.Vector3(msg.x, msg.y, msg.z), new THREE.Vector3(msg.vx, msg.vy, msg.vz), 'remote', true);
        relay(msg, fromConn);
        break;
      case 'rk':
        G.arsenal.spawnRocket(new THREE.Vector3(msg.x, msg.y, msg.z), new THREE.Vector3(msg.vx, msg.vy, msg.vz), 'remote', true);
        G.audio.shot('rl', { x: msg.x, y: msg.y, z: msg.z });
        relay(msg, fromConn);
        break;
      case 'as':
        G.arsenal.spawnStrikeVisual(msg.x, msg.z, msg.tm === N.myTeam);
        relay(msg, fromConn);
        break;
      case 'dp':
        if (N.isHost) routeDmgP(msg);
        else if (msg.id === N.myId) applyDmgP(msg);
        break;
      case 'db': { // client hit a bot → host applies authoritative damage
        if (!N.isHost) break;
        const bot = G.botMgr.bots[msg.i];
        const rp = remoteById(fromConn._pid);
        if (bot && bot.alive) {
          tmpV.set(msg.dx, 0.15, msg.dz).normalize();
          bot.damage(msg.d, tmpV, {
            head: msg.h === 1, cause: msg.c, close: msg.cl === 1, tag: msg.tag,
            attacker: { name: fromConn._name, team: rp ? rp.team : 1, remote: true },
            attackerPos: rp ? rp.pos : null,
            gib: msg.c === 'shotgun' && msg.cl === 1 && msg.h === 1,
          });
        }
        break;
      }
      case 'bd': if (!N.isHost) G.botMgr.applyRemoteDeath(msg.i, msg); break;
      case 'bs': if (!N.isHost) G.botMgr.applyRemoteSpawn(msg.i, msg.x, msg.z); break;
      case 'kf': if (G.game) G.game.onNetKillFeed(msg.kn, msg.vn, msg.tag, msg.h === 1, msg.kt); break;
      case 'sc': if (G.game) G.game.setTeamScores(msg.s); break;
      case 'chat':
        if (G.game) G.game.chat(msg.n, msg.m, true);
        relay(msg, fromConn);
        break;
      case 'died': if (N.isHost) hostHandleDied(msg); break;
      case 'end': if (!N.isHost && G.game) G.game.onNetEnd(msg.win, msg.wn); break;
    }
  }
  function relay(msg, fromConn) { if (N.isHost) bc(msg, fromConn); }

  // ---------- lobby management ----------
  function pushLobby() {
    if (!N.isHost) return;
    bc({ t: 'lobby', lobby: N.lobby });
    syncRemotesToLobby();
    if (N.onLobby) N.onLobby();
  }
  N.setTeam = function (id, team) {
    if (!N.isHost || !N.lobby) return;
    const p = N.lobby.players.find(p => p.id === id);
    if (p) { p.team = team; pushLobby(); }
  };
  N.setCfg = function (k, v) {
    if (!N.isHost || !N.lobby) return;
    N.lobby.cfg[k] = v;
    pushLobby();
  };
  N.setName = function (name) {
    name = String(name || '').trim().slice(0, 14);
    if (!name || name === N.myName) return;
    N.myName = name;
    if (N.isHost) {
      const p = N.lobby && N.lobby.players.find(p => p.id === N.myId);
      if (p) { p.name = name; pushLobby(); }
    } else toHost({ t: 'name', name });
  };
  N.link = function () {
    if (N.lanMode && N.lanInfo) {
      // wifi friends open this and are routed through the relay automatically
      return 'http://' + N.lanInfo.ip + ':' + N.lanInfo.port + '/?join=' + (N.code || 'lan').toLowerCase();
    }
    return location.origin + location.pathname + '?join=' + N.code;
  };

  function wireConn(conn) {
    conn.on('data', (msg) => { try { handle(msg, conn); } catch (e) { console.error('net handle', e); } });
    conn.on('close', () => {
      if (N.isHost) {
        conns = conns.filter(c => c !== conn);
        if (N.lobby) {
          N.lobby.players = N.lobby.players.filter(p => p.id !== conn._pid);
          removeRemote(conn._pid);
          pushLobby();
          if (N.active && G.game) G.game.chat('SYSTEM', (conn._name || 'a player') + ' left', true);
        }
      } else {
        // host gone
        N.active = false;
        if (N.onClosed) N.onClosed();
      }
    });
  }

  // ---------- LAN mode (same-wifi play through serve.py's relay) ----------
  // The local python server is a mailbox: we poll our inbox and post batches
  // addressed to the host / a player. Fake conn objects speak the same
  // interface as PeerJS DataConnections, so lobby + match code is unchanged.
  let lanActive = false, lanTimer = null, lanBusy = false;
  const lanOut = new Map(); // to -> [msgs]
  function lanQueue(to, msg) {
    if (!lanOut.has(to)) lanOut.set(to, []);
    lanOut.get(to).push(msg);
  }
  function LanConn(pid, to) {
    const c = { _pid: pid, _name: '', open: true, _h: {} };
    c.on = (ev, cb) => { c._h[ev] = cb; };
    c.send = (msg) => lanQueue(to, msg);
    c._data = (msg) => { if (c._h.data) c._h.data(msg); };
    c._close = () => { if (!c.open) return; c.open = false; if (c._h.close) c._h.close(); };
    return c;
  }
  function lanStop() {
    lanActive = false;
    if (lanTimer) { clearInterval(lanTimer); lanTimer = null; }
    lanOut.clear();
  }
  async function lanTick() {
    if (!lanActive || lanBusy) return;
    lanBusy = true;
    try {
      const jobs = [];
      for (const [to, msgs] of lanOut) {
        jobs.push(fetch('/lan/send', { method: 'POST', body: JSON.stringify({ pid: N.myId, to, msgs }) }));
      }
      lanOut.clear();
      if (jobs.length) await Promise.all(jobs);
      const r = await (await fetch('/lan/poll?pid=' + encodeURIComponent(N.myId))).json();
      if (!lanActive) return;
      if (r.gone) { lanHostGone(); return; }
      for (const m of (r.msgs || [])) lanRoute(m);
    } catch (e) { /* transient LAN hiccup: next tick retries */ }
    finally { lanBusy = false; }
  }
  function lanHostGone() {
    lanStop();
    if (!N.isHost) {
      N.active = false;
      if (N.onClosed) N.onClosed();
    }
  }
  function lanRoute(m) {
    if (N.isHost) {
      if (m.t === '__join') {
        const conn = LanConn(m.pid, m.pid);
        conns.push(conn);
        wireConn(conn);
        return;
      }
      if (m.t === '__left') {
        const conn = conns.find(c => c._pid === m.pid);
        if (conn) conn._close();
        return;
      }
      const from = m.__from;
      delete m.__from;
      const conn = conns.find(c => c._pid === from);
      if (conn) conn._data(m);
    } else {
      if (m.t === '__hostgone') { lanHostGone(); return; }
      if (hostConn) hostConn._data(m);
    }
  }
  N.lanMode = false;
  N.lanInfo = null;
  N.hostLan = function (name, cb, errCb) {
    N.leave();
    N.myName = name;
    N.myId = 'lan-' + shortCode();
    fetch('/lan/host', { method: 'POST', body: JSON.stringify({ pid: N.myId }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { errCb && errCb(d.err || 'could not start a wifi game'); return; }
        N.lanMode = true;
        N.lanInfo = d;
        N.isHost = true;
        N.code = 'WIFI';
        guestN = 0;
        N.lobby = { players: [{ id: N.myId, name, team: 0, host: true }], cfg: { mode: 'tdm', botsA: 0, botsB: 3, diff: 'normal', target: 30, mins: 10, map: 'suburbs' } };
        N.myTeam = 0;
        lanActive = true;
        lanTimer = setInterval(lanTick, 60);
        cb && cb();
      })
      .catch(() => errCb && errCb('no local server — wifi games need the game run via  python3 serve.py'));
  };
  // already hosting online: also register on the local relay so wifi friends
  // who open this computer's address can join without touching the internet
  N.lanAttach = function () {
    if (lanActive || !N.isHost) return;
    fetch('/lan/host', { method: 'POST', body: JSON.stringify({ pid: N.myId }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) return; // someone else on this machine hosts — fine, ignore
        N.lanMode = true;
        N.lanInfo = d;
        lanActive = true;
        lanTimer = setInterval(lanTick, 60);
      })
      .catch(() => {});
  };
  N.joinLan = function (name, cb, errCb) {
    N.leave();
    N.myName = name;
    N.myId = 'lan-' + shortCode();
    fetch('/lan/join', { method: 'POST', body: JSON.stringify({ pid: N.myId }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { errCb && errCb(d.err || 'could not join'); return; }
        N.lanMode = true;
        N.code = 'WIFI';
        hostConn = LanConn('host', 'host');
        wireConn(hostConn);
        lanActive = true;
        lanTimer = setInterval(lanTick, 60);
        hostConn.send({ t: 'hello', name: N.myName, pid: N.myId });
        cb && cb();
      })
      .catch(() => errCb && errCb('no local server — open the address the host\'s computer printed'));
  };

  function friendlyErr(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'game not found — check the code, and make sure the host keeps the lobby open';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      return "can't reach the matchmaking server — check your internet (some school/work networks block it)";
    if (t === 'browser-incompatible') return "this browser doesn't support WebRTC — try Chrome/Firefox/Safari";
    return 'connection error: ' + (t || e);
  }
  function wirePeerBasics(p) {
    // dropped the signaling server (laptop slept, network blip): reconnect so
    // late joiners can still find us; live WebRTC connections are unaffected
    p.on('disconnected', () => {
      if (peer === p && !p.destroyed) { try { p.reconnect(); } catch (e) {} }
    });
  }

  N.host = function (name, cb, errCb, statusCb) {
    N.myName = name;
    let idTries = 0;
    const attempt = () => {
      N.code = shortCode();
      peer = new Peer(PREFIX + N.code, PEER_OPTS);
      wirePeerBasics(peer);
      peer.on('open', (id) => {
        N.isHost = true;
        N.myId = id;
        guestN = 0;
        N.lobby = { players: [{ id, name, team: 0, host: true }], cfg: { mode: 'tdm', botsA: 0, botsB: 3, diff: 'normal', target: 30, mins: 10, map: 'suburbs' } };
        N.myTeam = 0;
        cb && cb();
      });
      peer.on('connection', (conn) => {
        conns.push(conn);
        wireConn(conn);
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && idTries++ < 3) { // code collision: reroll
          try { peer.destroy(); } catch (err) {}
          attempt();
          return;
        }
        console.error('peer', e);
        errCb && errCb(friendlyErr(e));
      });
    };
    statusCb && statusCb('contacting server…');
    attempt();
  };

  N.join = function (code, name, cb, errCb, statusCb) {
    N.myName = name;
    N.code = code;
    let done = false, attempts = 0, timer = 0;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        try { if (peer) peer.destroy(); } catch (e) {}
        peer = null; hostConn = null;
        errCb && errCb(err);
      } else cb && cb();
    };
    // each attempt gets its own deadline — a failed WebRTC handshake would
    // otherwise spin on "connecting…" forever with no event at all
    const tryConnect = () => {
      if (done) return;
      attempts++;
      statusCb && statusCb(attempts > 1 ? 'connection stalled, retrying (' + attempts + '/3)…' : 'connecting to host…');
      const c = peer.connect(PREFIX + code, { reliable: true });
      hostConn = c;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { c.close(); } catch (e) {}
        if (attempts < 3) tryConnect();
        else finish('found the game but the connection keeps stalling — usually a firewall/router blocking WebRTC on one side; try joining from a phone hotspot to confirm which network it is');
      }, 8000);
      c.on('open', () => {
        if (done || hostConn !== c) return;
        clearTimeout(timer);
        wireConn(c);
        c.send({ t: 'hello', name: N.myName, pid: N.myId });
        finish();
      });
      c.on('error', (e) => { if (hostConn === c) finish(friendlyErr(e)); });
    };
    statusCb && statusCb('contacting server…');
    timer = setTimeout(() => finish("can't reach the matchmaking server — check your internet"), 12000);
    peer = new Peer(PEER_OPTS);
    wirePeerBasics(peer);
    peer.on('open', (id) => {
      N.myId = id;
      tryConnect();
    });
    peer.on('error', (e) => { console.error('peer', e); finish(friendlyErr(e)); });
  };

  N.leave = function () {
    lanStop();
    N.lanMode = false;
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = null; conns = []; hostConn = null;
    N.clearCorpses();
    for (const rp of [...N.remoteList]) removeRemote(rp.id);
    N.active = false; N.isHost = false; N.lobby = null; N.code = '';
    N.teamOverrides = null;
  };

  // ffa/gun bot roster: player-team slot 0 stays empty, every bot is its own team
  function ffaCounts(n) {
    const counts = [0];
    for (let i = 0; i < n; i++) counts.push(1);
    return counts;
  }
  N.startMatch = function () {
    if (!N.isHost || !N.lobby) return;
    const mode = N.lobby.cfg.mode || 'tdm';
    const ffa = mode === 'ffa' || mode === 'gun';
    const cfg = {
      mode,
      botsA: N.lobby.cfg.botsA, botsB: N.lobby.cfg.botsB,
      diff: N.lobby.cfg.diff,
      target: N.lobby.cfg.target || 30,
      time: (N.lobby.cfg.mins || 10) * 60,
      map: N.lobby.cfg.map || 'suburbs',
    };
    const roster = ffa
      ? G.botMgr.rosterFor(ffaCounts((cfg.botsA || 0) + (cfg.botsB || 0)))
      : G.botMgr.rosterFor([cfg.botsA, cfg.botsB]);
    // ffa: every human gets a unique team far above the bot range
    let teams;
    if (ffa) {
      teams = {};
      N.ffaSeq = 100;
      for (const p of N.lobby.players) teams[p.id] = N.ffaSeq++;
    }
    N.teamOverrides = teams || null;
    N.matchCfg = cfg;
    N.matchRoster = roster;
    N.active = true;
    bc({ t: 'start', cfg, roster, teams });
    syncRemotesToLobby(); // my own team + remote shirts pick up the overrides
    if (N.onStart) N.onStart(cfg, roster, {});
  };

  // host: change bot teams mid-match — everyone rebuilds the bot lineup in place
  N.applyBots = function (a, b) {
    if (!N.isHost || !N.active || !N.lobby) return;
    N.lobby.cfg.botsA = a;
    N.lobby.cfg.botsB = b;
    const ffa = N.matchCfg && (N.matchCfg.mode === 'ffa' || N.matchCfg.mode === 'gun');
    const roster = ffa ? G.botMgr.rosterFor(ffaCounts(a + b)) : G.botMgr.rosterFor([a, b]);
    N.matchRoster = roster;
    bc({ t: 'roster', roster });
    G.botMgr.init(G.scene, roster, N.lobby.cfg.diff, false);
    pushLobby();
    if (G.game) G.game.chat('SYSTEM', ffa ? 'bots updated: ' + (a + b) + ' in the pit' : 'bots updated: ' + a + ' green vs ' + b + ' red', true);
  };

  // ---------- per-frame ----------
  N.update = function (dt) {
    updateCorpses(dt);
    // interpolate remote players
    for (const rp of N.remoteList) {
      rp.lastShotT += dt;
      if (rp.radarT > 0) rp.radarT -= dt;
      const g = rp.group;
      const dx = rp.netX - rp.pos.x, dz = rp.netZ - rp.pos.z;
      if (dx * dx + dz * dz > 64) { rp.pos.set(rp.netX, rp.netY, rp.netZ); }
      else {
        rp.pos.x = U.damp(rp.pos.x, rp.netX, 14, dt);
        rp.pos.y = U.damp(rp.pos.y, rp.netY, 14, dt);
        rp.pos.z = U.damp(rp.pos.z, rp.netZ, 14, dt);
      }
      let dy = rp.netYaw - rp.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      rp.yaw += dy * Math.min(1, 14 * dt);
      g.position.copy(rp.pos);
      // player yaw is camera convention (forward = -z); the shared humanoid
      // model faces +z, so flip 180° or the gun points away from the aim
      g.rotation.y = rp.yaw + Math.PI;
      g.visible = rp.alive;
      if (rp.netSpd > 0.3) rp.animPhase += rp.netSpd * dt * 2.4;
      const swing = Math.sin(rp.animPhase) * 0.55 * Math.min(1, rp.netSpd / 3);
      rp.legL.rotation.x = swing;
      rp.legR.rotation.x = -swing;
      const armX = -Math.PI / 2 - rp.netPitch;
      rp.armL.rotation.x = U.damp(rp.armL.rotation.x, armX, 10, dt);
      rp.armR.rotation.x = U.damp(rp.armR.rotation.x, armX, 10, dt);
      rp.gun.rotation.x = U.damp(rp.gun.rotation.x, -rp.netPitch, 10, dt);
      const camDist = G.player ? U.dist2d(rp.pos.x, rp.pos.z, G.player.pos.x, G.player.pos.z) : 99;
      const friendly = rp.team === N.myTeam;
      rp.tag.visible = rp.alive && camDist < (friendly ? 90 : 55);
      rp.marker.visible = rp.alive && friendly;
    }
    if (!N.active) return;
    // my state → others
    stateAcc += dt;
    if (stateAcc >= 0.08 && G.player) {
      stateAcc = 0;
      const P = G.player;
      const spd = Math.hypot(P.vel.x, P.vel.z);
      out({
        t: 'st', id: N.myId,
        x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2),
        yw: +P.yaw.toFixed(2), pt: +P.pitch.toFixed(2), sp: +spd.toFixed(1),
        al: P.alive ? 1 : 0, w: G.arsenal.currentId,
      });
    }
    // host: bot snapshots
    if (N.isHost) {
      snapAcc += dt;
      if (snapAcc >= 0.09) {
        snapAcc = 0;
        bc({ t: 'snap', b: G.botMgr.snapshot(), mt: Math.round(G.game.matchT) });
      }
    }
  };

  return N;
})();
