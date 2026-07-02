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
  let peer = null;
  let conns = [];       // host: all client connections
  let hostConn = null;  // client: connection to host
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
  function remoteById(id) { return N.remoteList.find(r => r.id === id); }
  N.remoteById = remoteById;

  function syncRemotesToLobby() {
    // create/update remote entities from lobby roster (all players except me)
    if (!N.lobby) return;
    for (const p of N.lobby.players) {
      if (p.id === N.myId) { N.myTeam = p.team; if (G.player) G.player.team = p.team; continue; }
      let rp = remoteById(p.id);
      if (!rp) {
        rp = RemotePlayer(p.id, p.name, p.team);
        N.remoteList.push(rp);
      }
      rp.team = p.team;
    }
    // drop entities for players no longer present
    for (let i = N.remoteList.length - 1; i >= 0; i--) {
      if (!N.lobby.players.find(p => p.id === N.remoteList[i].id)) removeRemote(N.remoteList[i].id);
    }
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
  N.evStrike = (x, z) => out({ t: 'as', x: Math.round(x), z: Math.round(z) });
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
  N.evEnd = (win) => { if (N.isHost) bc({ t: 'end', win }); };

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
        if (!N.isHost || N.active) { fromConn.send({ t: 'nope', why: N.active ? 'match in progress' : 'not hosting' }); return; }
        fromConn._pid = msg.pid;
        fromConn._name = msg.name;
        // auto-balance team
        const a = N.lobby.players.filter(p => p.team === 0).length;
        const b = N.lobby.players.filter(p => p.team === 1).length;
        N.lobby.players.push({ id: msg.pid, name: msg.name, team: a <= b ? 0 : 1, host: false });
        pushLobby();
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
        syncRemotesToLobby();
        if (N.onStart) N.onStart(msg.cfg, msg.roster);
        break;
      case 'st': { // player state
        const id = N.isHost ? fromConn._pid : msg.id;
        const rp = remoteById(id);
        if (rp) {
          rp.netX = msg.x; rp.netY = msg.y; rp.netZ = msg.z;
          rp.netYaw = msg.yw; rp.netPitch = msg.pt; rp.netSpd = msg.sp;
          rp.alive = msg.al === 1;
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
          G.audio.shot(msg.k === 'sr' ? 'sr' : msg.k === 'sg' ? 'sg' : 'bot', rp.pos);
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
        G.world.explode(tmpV, msg.r, msg.d, { attacker: { name: msg.an, team: msg.at, remote: true }, tag: msg.tag });
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
        G.arsenal.spawnStrikeVisual(msg.x, msg.z);
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
      case 'kf': if (G.game) G.game.onNetKillFeed(msg.kn, msg.vn, msg.tag, msg.h === 1); break;
      case 'sc': if (G.game) G.game.setTeamScores(msg.s); break;
      case 'chat':
        if (G.game) G.game.chat(msg.n, msg.m, true);
        relay(msg, fromConn);
        break;
      case 'died': if (N.isHost) hostHandleDied(msg); break;
      case 'end': if (!N.isHost && G.game) G.game.onNetEnd(msg.win); break;
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
  N.link = function () {
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
      peer = new Peer(PREFIX + N.code);
      wirePeerBasics(peer);
      peer.on('open', (id) => {
        N.isHost = true;
        N.myId = id;
        N.lobby = { players: [{ id, name, team: 0, host: true }], cfg: { botsA: 0, botsB: 3, diff: 'normal' } };
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
    let done = false;
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
    // without this a failed WebRTC handshake spins on "connecting…" forever
    const timer = setTimeout(() => {
      finish(hostConn
        ? 'found the game but the connection stalled — both of you refresh and retry; if it keeps happening a firewall is blocking WebRTC'
        : "can't reach the matchmaking server — check your internet");
    }, 15000);
    statusCb && statusCb('contacting server…');
    peer = new Peer();
    wirePeerBasics(peer);
    peer.on('open', (id) => {
      N.myId = id;
      statusCb && statusCb('connecting to host…');
      hostConn = peer.connect(PREFIX + code, { reliable: true });
      hostConn.on('open', () => {
        wireConn(hostConn);
        hostConn.send({ t: 'hello', name, pid: id });
        finish();
      });
      hostConn.on('error', (e) => finish(friendlyErr(e)));
    });
    peer.on('error', (e) => { console.error('peer', e); finish(friendlyErr(e)); });
  };

  N.leave = function () {
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = null; conns = []; hostConn = null;
    for (const rp of [...N.remoteList]) removeRemote(rp.id);
    N.active = false; N.isHost = false; N.lobby = null; N.code = '';
  };

  N.startMatch = function () {
    if (!N.isHost || !N.lobby) return;
    const cfg = {
      botsA: N.lobby.cfg.botsA, botsB: N.lobby.cfg.botsB,
      diff: N.lobby.cfg.diff, target: 30, time: 600,
    };
    const roster = G.botMgr.rosterFor([cfg.botsA, cfg.botsB]);
    N.active = true;
    bc({ t: 'start', cfg, roster });
    if (N.onStart) N.onStart(cfg, roster);
  };

  // ---------- per-frame ----------
  N.update = function (dt) {
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
      g.rotation.y = rp.yaw;
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
      rp.tag.visible = rp.alive && camDist < 55;
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
