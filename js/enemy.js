// enemy.js — team-aware bots: AI (solo/host) or network puppets (clients)
G.botMgr = (function () {
  const M = { bots: [], puppet: false };

  const NAMES = ['xXNoobSlayerXx', 'ShotgunKaren', 'TrickshotTimmy', 'MtnDew_Mike', 'DoritoDust420', 'CampinCarl',
    'QuickScopeQuinn', 'ToxicTyler', 'BackyardBandit', 'LawnmowerLarry', 'HOA_Enforcer', 'SoccerMomSniper',
    'GrillDadGary', 'Sweaty_Steve', 'NoScopeNancy', 'YardSaleYolanda', 'CulDeSacKing', 'MailboxMauler',
    'PropaneProdigy', 'SprinklerSammy', 'BBQ_Bobby', 'FencePostFred', 'DrywallDaryl', 'KiddiePoolKyle', 'RecycleBinRick'];
  const SKINS = [0xf2c49a, 0xe0ac69, 0xc68642, 0x8d5524, 0xf7d7b8];
  const TEAM_SHIRTS = [
    [0x3aa04a, 0x2d8a55, 0x56b86a, 0x1f7a40, 0x74c48a], // team 0: greens
    [0xd04030, 0xc06028, 0xe05545, 0xa83828, 0xd97a3a], // team 1: reds/oranges
  ];
  const HAIRS = ['#2a1c10', '#4d3319', '#c9a03a', '#111111', '#7a4515', '#909090'];
  const DIFF = {
    easy:   { reaction: 0.9,  errDeg: 6.0, dmg: 7,  burstMin: 2, burstMax: 4, speedMul: 0.92, hp: 85,  turn: 7 },
    normal: { reaction: 0.55, errDeg: 3.8, dmg: 10, burstMin: 3, burstMax: 6, speedMul: 1.0,  hp: 100, turn: 10 },
    hard:   { reaction: 0.34, errDeg: 2.3, dmg: 13, burstMin: 4, burstMax: 8, speedMul: 1.12, hp: 115, turn: 14 },
  };
  M.NAMES = NAMES;
  M.DIFF = DIFF;

  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpDir = new THREE.Vector3();
  const clothTexShared = {};

  function makeNametag(name, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const x = c.getContext('2d');
    x.font = 'bold 26px "Comic Sans MS", cursive';
    x.textAlign = 'center';
    x.lineWidth = 5; x.strokeStyle = '#000';
    x.strokeText(name, 128, 33);
    x.fillStyle = color || '#ff5544';
    x.fillText(name, 128, 33);
    const t = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.scale.set(2.6, 0.5, 1);
    sp.position.y = 2.25;
    return sp;
  }
  M.makeNametag = makeNametag;

  // floating green chevron over teammates — drawn through walls so you never
  // have to guess who's friendly
  function makeFriendMarker() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    x.beginPath();
    x.moveTo(32, 56); x.lineTo(12, 22); x.lineTo(24, 22); x.lineTo(32, 36); x.lineTo(40, 22); x.lineTo(52, 22);
    x.closePath();
    x.fillStyle = '#3fe04f'; x.fill();
    x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = '#083a10'; x.stroke();
    const t = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(0.44, 0.44, 1);
    sp.position.y = 2.75;
    sp.renderOrder = 9;
    sp.visible = false;
    return sp;
  }
  M.makeFriendMarker = makeFriendMarker;

  // shared humanoid model builder — used for bots and remote players
  function buildModel(ent, opts) {
    opts = opts || {};
    if (!clothTexShared.cloth) {
      clothTexShared.cloth = T.cloth();
      clothTexShared.gun = T.gunmetal();
    }
    const g = new THREE.Group();
    const skin = new THREE.Color(U.pick(SKINS));
    const shirtPool = TEAM_SHIRTS[ent.team === undefined ? 1 : ent.team] || TEAM_SHIRTS[1];
    const shirt = new THREE.Color(opts.shirt !== undefined ? opts.shirt : U.pick(shirtPool));
    const pants = new THREE.Color(U.pick([0x3a4a80, 0x2a2a30, 0x5a4632, 0x3a5a3a]));
    ent.skinColor = skin; ent.shirtColor = shirt; ent.pantsColor = pants;
    const clothMat = (tint) => new THREE.MeshBasicMaterial({ map: clothTexShared.cloth, vertexColors: true, color: tint });
    const mkLimb = (w, h, d, tint) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(U.shadedBoxGeo(w, h, d), clothMat(tint));
      m.position.y = -h / 2;
      pivot.add(m);
      return pivot;
    };
    ent.legL = mkLimb(0.19, 0.85, 0.19, pants); ent.legL.position.set(-0.13, 0.85, 0);
    ent.legR = mkLimb(0.19, 0.85, 0.19, pants); ent.legR.position.set(0.13, 0.85, 0);
    g.add(ent.legL, ent.legR);
    const torso = new THREE.Mesh(U.shadedBoxGeo(0.56, 0.72, 0.3), clothMat(shirt));
    torso.position.y = 1.21;
    g.add(torso);
    ent.torso = torso;
    ent.armL = mkLimb(0.16, 0.62, 0.16, shirt); ent.armL.position.set(-0.37, 1.5, 0);
    ent.armR = mkLimb(0.16, 0.62, 0.16, shirt); ent.armR.position.set(0.37, 1.5, 0);
    g.add(ent.armL, ent.armR);
    const head = new THREE.Mesh(U.shadedBoxGeo(0.37, 0.37, 0.37), new THREE.MeshBasicMaterial({ map: T.face('#' + skin.getHexString(), U.pick(HAIRS)) }));
    head.position.y = 1.66;
    g.add(head);
    ent.head = head;
    // weapon: rifle box, or a fat tube for rocket bots
    let gun;
    if (ent.weapon === 'rl') {
      gun = new THREE.Mesh(U.shadedBoxGeo(0.16, 0.18, 0.95), new THREE.MeshBasicMaterial({ map: clothTexShared.gun, vertexColors: true, color: 0x5a6b4a }));
    } else {
      gun = new THREE.Mesh(U.shadedBoxGeo(0.09, 0.16, 0.75), new THREE.MeshBasicMaterial({ map: clothTexShared.gun, vertexColors: true }));
    }
    gun.position.set(0.15, 1.35, 0.42);
    g.add(gun);
    ent.gun = gun;
    const friendly = G.player && ent.team === G.player.team;
    ent.tag = makeNametag(ent.name, friendly ? '#7dff7d' : '#ff5544');
    if (friendly) { ent.tag.material.depthTest = false; ent.tag.renderOrder = 9; }
    g.add(ent.tag);
    ent.marker = makeFriendMarker();
    g.add(ent.marker);
    ent.group = g;
  }
  M.buildModel = buildModel;

  function Bot(idx, name, arche, diff, team, weapon) {
    const bot = {
      idx, name, arche, team, cfg: DIFF[diff],
      weapon: weapon || (arche === 'rusher' ? 'sg' : 'ar'),
      alive: false, hp: 100,
      yaw: 0, targetYaw: 0,
      state: 'wander', stateT: 0,
      path: null, pathI: 0, repathT: 0, pathBias: 1,
      tgt: null, tgtCheckT: U.rand(0, 0.5),
      lastKnown: new THREE.Vector3(), lastSeenAgo: 99, seeT: 0, alertT: -1,
      visT: U.rand(0, 0.25), canSee: false,
      fireCd: U.rand(0.2, 1), burstLeft: 0, burstPause: 0, mag: 30, reloadT: 0,
      staggerT: 0, fleeT: 0, fleeDir: new THREE.Vector3(),
      nadeCd: U.rand(6, 14), meleeCd: 0, rocketCd: U.rand(2, 5),
      coverPos: null, coverWait: 0,
      campSpot: null,
      moveDir: new THREE.Vector3(), speedNow: 0, animPhase: 0,
      stuckT: 0, stuckN: 0, lastPos: new THREE.Vector3(),
      vault: null,
      respawnT: 0, corpseT: 0, fallT: -1, fallAxis: 1, gibbed: false,
      kills: 0, radarT: 0, lastShotT: 99,
      // puppet interpolation targets
      netX: 0, netZ: 0, netYaw: 0, netSpd: 0, netAim: false,
    };
    buildModel(bot);
    bot.damage = function (dmg, dir, opts) {
      if (!bot.alive) return;
      opts = opts || {};
      bot.hurtFx(dmg, dir, opts.head);
      bot.hp -= dmg;
      bot.staggerT = Math.max(bot.staggerT, 0.22);
      // alert toward the attacker
      if (!M.puppet && bot.state !== 'combat' && opts.attackerPos) {
        bot.lastKnown.copy(opts.attackerPos);
        if (bot.state !== 'cover') { bot.state = 'investigate'; bot.path = null; bot.stateT = 0; }
        bot.alertT = Math.min(bot.alertT < 0 ? 0.15 : bot.alertT, 0.15);
      } else if (!M.puppet && bot.state !== 'combat' && opts.attacker === 'player' && G.player) {
        bot.lastKnown.copy(G.player.pos);
        if (bot.state !== 'cover') { bot.state = 'investigate'; bot.path = null; bot.stateT = 0; }
        bot.alertT = Math.min(bot.alertT < 0 ? 0.15 : bot.alertT, 0.15);
      }
      if (bot.hp <= 0) die(bot, dir, opts);
    };
    bot.hurtFx = function (dmg, dir, head) {
      const hitPos = tmpV.set(bot.group.position.x, bot.group.position.y + (head ? 1.62 : U.rand(0.9, 1.4)), bot.group.position.z);
      G.fx.bloodBurst(hitPos, dir || tmpDir.set(0, 0.4, 0), head ? 14 : 8, head ? 7 : 5);
      if (Math.random() < 0.6 && dir) G.fx.bloodWallSplat(hitPos, dir);
    };
    return bot;
  }

  function die(bot, dir, opts) {
    opts = opts || {};
    bot.alive = false;
    bot.respawnT = 3.5;
    bot.corpseT = 11;
    bot.tag.visible = false;
    bot.marker.visible = false;
    const p = bot.group.position;
    const gib = opts.gib || opts.cause === 'explosion' || (opts.cause === 'shotgun' && opts.close);
    if (gib) {
      bot.gibbed = true;
      bot.group.visible = false;
      G.fx.gibBot(bot, dir || tmpDir.set(0, 0.5, 0), opts.cause === 'explosion' ? 9 : 6);
    } else {
      bot.gibbed = false;
      bot.fallT = 0;
      bot.fallAxis = Math.random() < 0.5 ? 1 : -1;
      if (opts.head) {
        bot.head.visible = false;
        tmpV.set(p.x, p.y + 1.66, p.z);
        G.fx.bloodBurst(tmpV, dir || tmpDir.set(0, 1, 0), 22, 8);
        for (let i = 0; i < 3; i++) {
          tmpV2.set(U.rand(-2.5, 2.5), U.rand(3, 6), U.rand(-2.5, 2.5));
          G.fx.debris(tmpV, tmpV2, 0.14, 0.14, 0.14, new THREE.Color(0.6, 0.05, 0.05), 7, true);
        }
      }
      G.fx.bloodPool(p.x + U.rand(-0.2, 0.2), p.z + U.rand(-0.2, 0.2), U.rand(1.1, 1.8));
      G.audio.squish(p);
    }
    if (M.puppet) return; // authoritative bookkeeping happens on the host
    if (G.game) G.game.onBotDied(bot, opts, { gib, head: !!opts.head, dirx: dir ? dir.x : 0, dirz: dir ? dir.z : 1 });
  }
  // client-side: host said this bot died
  M.applyRemoteDeath = function (i, info) {
    const bot = M.bots[i];
    if (!bot || !bot.alive) return;
    tmpDir.set(info.dirx || 0, 0.4, info.dirz || 1).normalize();
    die(bot, tmpDir, { gib: info.gib, head: info.head, cause: info.gib ? 'explosion' : 'shot' });
  };
  M.applyRemoteSpawn = function (i, x, z) {
    const bot = M.bots[i];
    if (!bot) return;
    respawnAt(bot, x, z);
  };
  // late joiner: this bot was already dead when we arrived — hide it without gore,
  // the host's next 'bs' event will respawn it normally
  M.forceDead = function (i) {
    const bot = M.bots[i];
    if (!bot) return;
    bot.alive = false;
    bot.gibbed = true;
    bot.respawnT = 999; bot.corpseT = 0;
    bot.group.visible = false;
    bot.tag.visible = false;
    bot.marker.visible = false;
  };

  function respawnAt(bot, x, z) {
    bot.group.position.set(x, 0, z);
    bot.group.rotation.set(0, 0, 0);
    bot.group.visible = true;
    bot.head.visible = true;
    bot.tag.visible = true;
    bot.hp = bot.cfg.hp;
    bot.alive = true;
    bot.state = bot.arche === 'camper' ? 'camp' : 'wander';
    bot.campSpot = null;
    bot.tgt = null;
    bot.path = null; bot.fallT = -1; bot.gibbed = false; bot.vault = null;
    bot.mag = 30; bot.reloadT = 0; bot.burstLeft = 0;
    bot.canSee = false; bot.seeT = 0; bot.alertT = -1;
    bot.pathBias = 0.85 + (bot.idx % 5) * 0.09;
    bot.netX = x; bot.netZ = z;
    bot.yaw = U.rand(-Math.PI, Math.PI); bot.targetYaw = bot.yaw;
  }

  function respawn(bot) {
    // spawn on own team's side, far from living enemies
    // (free-for-all: no sides — everyone's team is their own)
    const ffa = G.game && (G.game.mode === 'ffa' || G.game.mode === 'gun');
    let best = null, bestD = -1;
    const enemies = enemiesOf(bot.team);
    for (let i = 0; i < 6; i++) {
      const s = U.pick(G.world.spawnPoints);
      const sideOk = ffa ? true : (bot.team === 0 ? s.x <= 0 : s.x >= 0);
      let minD = 999;
      for (const e of enemies) minD = Math.min(minD, U.dist2d(s.x, s.z, e.pos.x, e.pos.z));
      const score = minD + (sideOk ? 25 : 0) + U.rand(0, 10);
      if (score > bestD) { bestD = score; best = s; }
    }
    respawnAt(bot, best.x + U.rand(-2, 2), best.z + U.rand(-2, 2));
    if (G.net && G.net.active && G.net.isHost) G.net.evBotSpawn(M.bots.indexOf(bot), bot.group.position.x, bot.group.position.z);
  }

  // ---------- targeting ----------
  function enemiesOf(team) {
    const list = [];
    const P = G.player;
    if (P && P.alive && P.team !== team && P.spawnProtectT <= 0) {
      list.push({ kind: 'me', pos: P.pos, crouch: P.crouching, vel: P.vel, name: 'me' });
    }
    if (G.net && G.net.active) {
      for (const rp of G.net.remoteList) {
        if (rp.alive && rp.team !== team) list.push({ kind: 'remote', pos: rp.pos, crouch: false, vel: null, rp, name: rp.name });
      }
    }
    for (const b of M.bots) {
      if (b.alive && b.team !== team) list.push({ kind: 'bot', pos: b.group.position, crouch: false, vel: null, bot: b, name: b.name });
    }
    return list;
  }
  function tgtValid(bot) {
    const t = bot.tgt;
    if (!t) return false;
    if (t.kind === 'me') return G.player && G.player.alive && G.player.spawnProtectT <= 0 && G.player.team !== bot.team;
    if (t.kind === 'remote') return t.rp.alive;
    if (t.kind === 'bot') return t.bot.alive;
    return false;
  }
  function pickTarget(bot) {
    const bp = bot.group.position;
    let best = null, bestD = 1e9;
    for (const e of enemiesOf(bot.team)) {
      const d = U.dist2d(bp.x, bp.z, e.pos.x, e.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    bot.tgt = best;
  }
  function tgtEyeY(t) {
    if (t.kind === 'me') return t.pos.y + (t.crouch ? 0.9 : 1.5);
    return t.pos.y + 1.5;
  }

  // ---------- perception ----------
  const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();
  function checkVision(bot) {
    const t = bot.tgt;
    if (!tgtValid(bot)) { bot.canSee = false; return; }
    const bp = bot.group.position;
    const dx = t.pos.x - bp.x, dz = t.pos.z - bp.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 62) { bot.canSee = false; return; }
    if (dist > 5) {
      const fwdX = Math.sin(bot.yaw), fwdZ = Math.cos(bot.yaw);
      const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
      if (dot < Math.cos(1.05)) { bot.canSee = false; return; }
    }
    rayO.set(bp.x, bp.y + 1.6, bp.z);
    rayD.set(t.pos.x - bp.x, tgtEyeY(t) - (bp.y + 1.6), t.pos.z - bp.z);
    const len = rayD.length();
    rayD.multiplyScalar(1 / len);
    const hit = G.world.raycast(rayO, rayD, len, { throughGlass: true });
    bot.canSee = hit.t >= len * 0.93;
    if (bot.canSee) {
      bot.lastKnown.copy(t.pos);
      bot.lastSeenAgo = 0;
    }
  }

  // ---------- shooting ----------
  function attackerInfo(bot) {
    return { attacker: bot, attackerPos: bot.group.position, tag: bot.weapon === 'sg' ? 'SG' : bot.weapon === 'rl' ? 'ROCKET' : bot.weapon === 'sr' ? 'SR' : 'AR' };
  }
  function botDmg(bot, hitT) {
    if (bot.weapon === 'sg') return Math.max(3, bot.cfg.dmg * 0.7 * (1 - hitT / 26));
    if (bot.weapon === 'sr') return bot.cfg.dmg * 3.2; // slow, heavy single taps
    return bot.cfg.dmg;
  }
  function botShoot(bot) {
    const t = bot.tgt;
    if (!tgtValid(bot)) return;
    const bp = bot.group.position;
    const muzY = bp.y + 1.42;
    rayO.set(bp.x + Math.sin(bot.yaw) * 0.5, muzY, bp.z + Math.cos(bot.yaw) * 0.5);
    const err = bot.cfg.errDeg * (1 - 0.45 * Math.min(bot.seeT, 2) / 2) * (bot.arche === 'camper' ? 0.8 : 1) * (Math.PI / 180);
    let tx = t.pos.x, ty = t.pos.y + (t.crouch ? 0.7 : 1.2), tz = t.pos.z;
    if (bot.cfg === DIFF.hard && t.vel) { tx += t.vel.x * 0.09; tz += t.vel.z * 0.09; }
    rayD.set(tx - rayO.x, ty - rayO.y, tz - rayO.z).normalize();
    rayD.x += U.gauss() * err * 2.2; rayD.y += U.gauss() * err * 1.6; rayD.z += U.gauss() * err * 2.2;
    rayD.normalize();
    const pellets = bot.weapon === 'sg' ? 5 : 1;
    for (let i = 0; i < pellets; i++) {
      if (i > 0) {
        rayD.x += U.gauss() * 0.05; rayD.y += U.gauss() * 0.035; rayD.z += U.gauss() * 0.05;
        rayD.normalize();
      }
      const hit = G.world.raycast(rayO, rayD, 85, { player: true, bots: true, remotes: true, skipTeam: bot.team, skipBot: bot });
      const ai = attackerInfo(bot);
      if (hit.kind === 'player') {
        G.game.onPlayerDamage(botDmg(bot, hit.t), bp, bot, 'shot');
      } else if (hit.kind === 'remote') {
        if (G.net) G.net.evDmgP(hit.remote.id, botDmg(bot, hit.t), bp.x, bp.z, bot.name, bot.team);
      } else if (hit.kind === 'bot') {
        hit.bot.damage(botDmg(bot, hit.t), rayD, { ...ai, head: hit.part === 'head', cause: 'shot' });
      } else if (hit.kind !== 'none') {
        G.world.applyBulletDamage(hit, 11, rayD, bot);
        // whizz near the local player
        if (G.player && G.player.alive && Math.random() < 0.5) {
          const px = G.player.pos.x - rayO.x, py = (G.player.pos.y + 1.5) - rayO.y, pz = G.player.pos.z - rayO.z;
          const tt = px * rayD.x + py * rayD.y + pz * rayD.z;
          if (tt > 0 && tt < hit.t) {
            const cx = rayO.x + rayD.x * tt - G.player.pos.x, cy = rayO.y + rayD.y * tt - (G.player.pos.y + 1.5), cz = rayO.z + rayD.z * tt - G.player.pos.z;
            if (cx * cx + cy * cy + cz * cz < 2.2) G.audio.whizz();
          }
        }
      }
      if (hit.kind !== 'none' && (i === 0 || Math.random() < 0.4)) {
        tmpV.set(rayO.x + rayD.x * 0.6, rayO.y + rayD.y * 0.6, rayO.z + rayD.z * 0.6);
        G.fx.tracer(tmpV, hit.point, 0.12);
      }
    }
    tmpV.set(rayO.x + rayD.x * 0.3, muzY, rayO.z + rayD.z * 0.3);
    G.fx.muzzle(tmpV, 0.5);
    G.audio.shot(bot.weapon === 'sg' ? 'sg' : bot.weapon === 'sr' ? 'sr' : 'bot', bp);
    bot.mag--;
    bot.lastShotT = 0;
    bot.radarT = 2.6;
    if (bot.mag <= 0) { bot.reloadT = bot.weapon === 'sg' ? 2.6 : bot.weapon === 'sr' ? 2.8 : 2.1; bot.mag = botMag(bot.weapon); startCover(bot); }
  }
  function botMag(w) { return w === 'sg' ? 6 : w === 'sr' ? 5 : 30; }

  function botRocket(bot, dist) {
    const t = bot.tgt;
    if (!tgtValid(bot)) return;
    const bp = bot.group.position;
    rayO.set(bp.x + Math.sin(bot.yaw) * 0.7, bp.y + 1.45, bp.z + Math.cos(bot.yaw) * 0.7);
    // aim at feet-ish for splash, lead a little, worse accuracy at range
    const err = (bot.cfg.errDeg + 2) * (Math.PI / 180);
    let tx = t.pos.x, ty = t.pos.y + 0.7, tz = t.pos.z;
    if (t.vel) { tx += t.vel.x * dist / 34; tz += t.vel.z * dist / 34; }
    rayD.set(tx - rayO.x, ty - rayO.y, tz - rayO.z).normalize();
    rayD.x += U.gauss() * err; rayD.y += U.gauss() * err * 0.5; rayD.z += U.gauss() * err;
    rayD.normalize();
    G.arsenal.spawnRocket(rayO, rayD, bot);
    G.audio.shot('rl', bp);
    tmpV.set(rayO.x + rayD.x * 0.5, rayO.y, rayO.z + rayD.z * 0.5);
    G.fx.muzzle(tmpV, 0.7);
    bot.lastShotT = 0;
    bot.radarT = 2.6;
    bot.rocketCd = U.rand(3.8, 5.5);
    if (G.botMgr) M.onNoise(bp, 50);
  }

  function fireControl(bot, dt, dist) {
    if (bot.reloadT > 0 || bot.staggerT > 0) return;
    if (bot.weapon === 'rl') {
      bot.rocketCd -= dt;
      if (bot.rocketCd <= 0 && dist > 9 && dist < 42) botRocket(bot, dist);
      return;
    }
    if (bot.weapon === 'sr') { // deliberate single taps, any range
      bot.fireCd -= dt;
      if (bot.fireCd <= 0) {
        botShoot(bot);
        bot.fireCd = U.rand(1.6, 2.4);
      }
      return;
    }
    if (bot.weapon === 'sg' && dist > 20) return;
    if (bot.burstLeft > 0) {
      bot.fireCd -= dt;
      if (bot.fireCd <= 0) {
        botShoot(bot);
        bot.burstLeft--;
        bot.fireCd = bot.weapon === 'sg' ? U.rand(0.8, 1.1) : 0.105;
        if (bot.burstLeft <= 0) bot.burstPause = U.rand(0.45, 1.0);
      }
    } else {
      bot.burstPause -= dt;
      if (bot.burstPause <= 0) {
        bot.burstLeft = bot.weapon === 'sg' ? U.randi(1, 2) : U.randi(bot.cfg.burstMin, bot.cfg.burstMax);
        bot.fireCd = 0.02;
      }
    }
  }

  // ---------- movement ----------
  function setPath(bot, tx, tz) {
    const p = bot.group.position;
    bot.path = G.world.nav.findPath(p.x, p.z, tx, tz, bot.pathBias);
    bot.pathI = 0;
    bot.repathT = U.rand(2.5, 4.5);
    // walled in (no route at all)? march straight at it and smash through
    if (!bot.path) {
      bot.noPathN = (bot.noPathN || 0) + 1;
      if (bot.noPathN >= 2) {
        bot.yaw = bot.targetYaw = Math.atan2(tx - p.x, tz - p.z);
        unstick(bot);
        bot.path = [{ x: tx, z: tz }]; // desperation beeline — stuck logic bashes as walls block
        bot.pathI = 0;
        bot.noPathN = 0;
      }
    } else bot.noPathN = 0;
  }
  function followPath(bot, speed) {
    if (!bot.path || bot.pathI >= bot.path.length) { bot.moveDir.set(0, 0, 0); return true; }
    const p = bot.group.position;
    const wp = bot.path[bot.pathI];
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) { bot.pathI++; return followPath(bot, speed); }
    bot.moveDir.set(dx / d, 0, dz / d);
    bot.speedNow = speed;
    return false;
  }
  function startCover(bot) {
    if (bot.state === 'cover' || !tgtValid(bot)) return;
    const p = bot.group.position;
    const t = bot.tgt;
    let found = null;
    for (let i = 0; i < 18; i++) {
      const a = U.rand(0, Math.PI * 2), r = U.rand(5, 14);
      const cx = p.x + Math.cos(a) * r, cz = p.z + Math.sin(a) * r;
      const [ccx, ccz] = G.world.nav.toCell(cx, cz);
      if (G.world.nav.blocked(ccx, ccz)) continue;
      if (!G.world.nav.lineOpenWorld(cx, cz, t.pos.x, t.pos.z)) { found = { x: cx, z: cz }; break; }
    }
    if (found) {
      bot.state = 'cover';
      bot.coverPos = found;
      bot.coverWait = U.rand(1.2, 2.2);
      setPath(bot, found.x, found.z);
    }
  }
  // per-bot spread offset so squads don't stack on one point
  function scatter(bot, x, z, r) {
    const a = bot.idx * 2.39996; // golden angle
    const rr = r === undefined ? 1.6 + (bot.idx % 4) : r;
    return { x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr };
  }

  // stuck rescue: hop low fences, smash a doorway through anything else.
  // Probes forward first, then sweeps all directions for the nearest wall.
  function unstick(bot) {
    const bp = bot.group.position;
    let best = null, bestT = 1e9, bestYaw = bot.yaw;
    for (let k = 0; k < 8; k++) {
      const yaw = k === 0 ? bot.yaw : bot.yaw + (k * Math.PI) / 4;
      rayO.set(bp.x, bp.y + 0.75, bp.z);
      rayD.set(Math.sin(yaw), 0, Math.cos(yaw));
      const hit = G.world.raycast(rayO, rayD, 2.6, {});
      if ((hit.kind === 'chunk' || hit.kind === 'glass') && hit.t < bestT) {
        best = { wall: hit.wall, c: hit.c, r: hit.r, t: hit.t };
        bestT = hit.t;
        bestYaw = yaw;
        if (k === 0 && hit.t < 1.5) break; // the thing right in front of us
      }
    }
    if (!best) return;
    const fx = Math.sin(bestYaw), fz = Math.cos(bestYaw);
    const wallH = best.wall.oy + best.wall.rows * best.wall.ch;
    if (best.wall.kind === 'fence' && wallH <= 1.2 && best.t < 1.6) {
      // vault the fence
      bot.vault = {
        t: 0,
        fromX: bp.x, fromZ: bp.z, fromY: bp.y,
        toX: bp.x + fx * (best.t + 1.1), toZ: bp.z + fz * (best.t + 1.1),
      };
      return;
    }
    // bash a full doorway: floor-to-head chunks in this column
    for (const r of [best.r - 1, best.r, best.r + 1]) {
      if (r >= 0 && r < best.wall.rows) G.world.damageChunk(best.wall, best.c, r, 90);
    }
    G.audio.thud(bp);
    bot.yaw = bot.targetYaw = bestYaw; // face the new hole
    bot.staggerT = 0.3;
  }

  // ---------- per-bot update (AI, host only) ----------
  function updateBot(bot, dt) {
    if (!bot.alive) {
      updateCorpse(bot, dt);
      if (!M.puppet) {
        bot.respawnT -= dt;
        if (bot.respawnT <= 0 && bot.corpseT <= 0) respawn(bot);
      }
      return;
    }
    bot.lastShotT += dt;

    if (M.puppet) { updatePuppet(bot, dt); return; }

    const bp = bot.group.position;
    bot.staggerT -= dt; bot.fleeT -= dt; bot.nadeCd -= dt; bot.meleeCd -= dt;
    bot.lastSeenAgo += dt;
    if (bot.reloadT > 0) bot.reloadT -= dt;

    // lava hurts bots too (host-authoritative; nav avoids it, blasts don't)
    if (G.world.lavaAt && G.world.lavaAt(bp.x, bp.z, bp.y)) {
      bot.lavaAcc = (bot.lavaAcc || 0) - dt;
      if (bot.lavaAcc <= 0) {
        bot.lavaAcc = 0.45;
        tmpDir.set(0, 1, 0);
        bot.damage(16, tmpDir, { attacker: { name: 'THE VOLCANO', team: -1 }, cause: 'explosion', tag: 'LAVA' });
      }
    }

    // vault in progress: airborne hop, skip everything else
    if (bot.vault) {
      bot.vault.t += dt / 0.5;
      const k = Math.min(bot.vault.t, 1);
      bp.x = U.lerp(bot.vault.fromX, bot.vault.toX, k);
      bp.z = U.lerp(bot.vault.fromZ, bot.vault.toZ, k);
      bp.y = bot.vault.fromY + Math.sin(k * Math.PI) * 1.05;
      bot.group.position.y = bp.y;
      if (k >= 1) {
        bot.vault = null;
        bp.y = G.world.standHeightAt(bp.x, bp.z, bp.y);
      }
      return;
    }
    // ladder climb in progress: hands on rails, rung by rung
    if (bot.climb) {
      const L = bot.climb;
      bp.x = U.damp(bp.x, L.cx + L.fx * 0.45, 10, dt);
      bp.z = U.damp(bp.z, L.cz + L.fz * 0.45, 10, dt);
      bp.y += 2.6 * dt;
      bot.speedNow = 1.2;
      bot.animPhase += dt * 6;
      bot.yaw = bot.targetYaw = Math.atan2(-L.fx, -L.fz); // face the rungs
      bot.group.rotation.y = bot.yaw;
      if (bp.y >= L.topY) {
        // stacked segment above (fire escapes)? keep the hands moving
        const nxt = (G.world.ladders || []).find((l2) => l2 !== L &&
          Math.abs(l2.cx - L.cx) < 0.8 && Math.abs(l2.cz - L.cz) < 0.8 &&
          L.topY >= l2.baseY - 0.3 && L.topY < l2.topY - 0.1);
        if (nxt) {
          bot.climb = nxt;
        } else { // true crest: step onto the deck
          bp.x = L.cx - L.fx * 1.0;
          bp.z = L.cz - L.fz * 1.0;
          bp.y = G.world.standHeightAt(bp.x, bp.z, L.topY + 0.4);
          bot.climb = null;
          bot.path = null;
          bot.ladderCd = 0.6;
        }
      }
      animate(bot, dt, false, null, 10);
      return;
    }
    bot.ladderCd = Math.max(0, (bot.ladderCd || 0) - dt);

    // re-target periodically
    bot.tgtCheckT -= dt;
    if (bot.tgtCheckT <= 0 || !tgtValid(bot)) {
      bot.tgtCheckT = 0.55;
      const old = bot.tgt;
      pickTarget(bot);
      if (bot.tgt !== old) bot.seeT = 0;
    }

    bot.visT -= dt;
    if (bot.visT <= 0) { bot.visT = 0.24; checkVision(bot); }
    if (bot.canSee) bot.seeT += dt; else bot.seeT = Math.max(0, bot.seeT - dt * 2);

    const t = bot.tgt;
    const dist = tgtValid(bot) ? U.dist2d(bp.x, bp.z, t.pos.x, t.pos.z) : 99;

    // prey is up on a deck somewhere: find a ladder and go get them
    // (any upward ladder works — chained climbs re-trigger on the next floor;
    //  zero-g crews just fly, no ladders needed)
    if (!G.world.zeroG && !bot.climb && bot.state !== 'ladder' && bot.ladderCd <= 0 && tgtValid(bot) &&
        (bot.state === 'hunt' || bot.state === 'investigate' || (bot.state === 'combat' && !bot.canSee)) &&
        t.pos.y - bp.y > 2.2 && dist < 26) {
      let bestL = null, bestScore = 26;
      for (const L of (G.world.ladders || [])) {
        if (L.topY < bp.y + 1.8) continue;              // must lead upward from here
        if (L.topY > t.pos.y + 3.5) continue;           // not way past them
        if (Math.abs(L.baseY - bp.y) > 1.6) continue;   // base reachable from my floor
        // height progress toward the prey matters more than a short walk
        const score = U.dist2d(bp.x, bp.z, L.cx + L.fx * 0.5, L.cz + L.fz * 0.5) * 0.6 +
                      Math.abs(L.topY - t.pos.y) * 2.5;
        if (score < bestScore) { bestScore = score; bestL = L; }
      }
      if (bestL) {
        bot.state = 'ladder';
        bot.ladderTgt = bestL;
        bot.stateT = 0;
        bot.path = null;
      }
    }

    // grenade dodge
    if (G.arsenal && bot.fleeT <= 0) {
      for (const n of G.arsenal.allNades()) {
        const d = U.dist2d(bp.x, bp.z, n.pos.x, n.pos.z);
        if (d < 5.5 && n.fuse < 1.6) {
          bot.fleeDir.set(bp.x - n.pos.x, 0, bp.z - n.pos.z).normalize();
          bot.fleeT = 1.2;
          break;
        }
      }
    }

    if (bot.canSee && tgtValid(bot) && bot.state !== 'combat' && bot.state !== 'cover') {
      if (bot.alertT < 0) bot.alertT = bot.cfg.reaction * U.rand(0.8, 1.3);
      bot.alertT -= dt;
      bot.targetYaw = Math.atan2(t.pos.x - bp.x, t.pos.z - bp.z);
      if (bot.alertT <= 0) { bot.state = 'combat'; bot.stateT = 0; }
    } else if (!bot.canSee) bot.alertT = -1;

    bot.moveDir.set(0, 0, 0);
    bot.speedNow = 0;
    const baseSpeed = 3.4 * bot.cfg.speedMul;

    switch (bot.state) {
      case 'wander': {
        bot.repathT -= dt;
        if (!bot.path || bot.repathT <= 0 || followPath(bot, baseSpeed)) {
          // king of the hill: most of the squad converges on the zone instead of roaming
          const hill = G.game && G.game.mode === 'koth' && G.game.hillPos;
          if (hill && (bot.idx % 3 !== 0)) { // every 3rd bot still flanks/roams
            const s = scatter(bot, hill.x, hill.z, U.rand(1, (hill.r || 6) + 2.5));
            if (!inDanger(s.x, s.z, 2)) {
              setPath(bot, s.x, s.z);
              if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
              break;
            }
          }
          const anchor = tgtValid(bot) ? t.pos : { x: 0, z: 0 };
          const bnd = G.world.bounds || { x: 55, z: 37 };
          // three candidate spots — take the one farthest from the squad, skip craters
          let best = null, bestScore = -1;
          for (let k = 0; k < 3; k++) {
            const a = U.rand(0, Math.PI * 2), r = U.rand(14, 36);
            const cx = U.clamp(anchor.x + Math.cos(a) * r, -bnd.x, bnd.x);
            const cz = U.clamp(anchor.z + Math.sin(a) * r, -bnd.z, bnd.z);
            if (inDanger(cx, cz, 2)) continue;
            let minMate = 99;
            for (const other of M.bots) {
              if (other === bot || !other.alive || other.team !== bot.team) continue;
              minMate = Math.min(minMate, U.dist2d(cx, cz, other.group.position.x, other.group.position.z));
            }
            if (minMate > bestScore) { bestScore = minMate; best = { x: cx, z: cz }; }
          }
          if (best) setPath(bot, best.x, best.z);
          else bot.repathT = 0.6;
        }
        if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
        break;
      }
      case 'camp': {
        if (!bot.campSpot) {
          let best = null, bestD = -1;
          const anchor = tgtValid(bot) ? t.pos : { x: 0, z: 0 };
          const hill = G.game && G.game.mode === 'koth' && G.game.hillPos;
          for (let i = 0; i < 4; i++) {
            const s = U.pick(G.world.campSpots);
            // koth campers overwatch the hill: nearest spot wins instead of farthest
            const d = hill ? -U.dist2d(s.x, s.z, hill.x, hill.z) : U.dist2d(s.x, s.z, anchor.x, anchor.z);
            if (d > bestD) { bestD = d; best = s; }
          }
          bot.campSpot = best;
          setPath(bot, best.x, best.z);
        }
        const arrived = followPath(bot, baseSpeed);
        if (arrived) {
          bot.targetYaw = bot.campSpot.yaw + Math.sin(G.time * 0.5 + bot.idx) * 0.5;
        } else if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
        if (dist < 7) { bot.state = 'wander'; bot.campSpot = null; }
        break;
      }
      case 'investigate': {
        bot.repathT -= dt;
        if (!bot.path || bot.repathT <= 0) {
          const s = scatter(bot, bot.lastKnown.x, bot.lastKnown.z);
          setPath(bot, s.x, s.z);
        }
        const arrived = followPath(bot, baseSpeed * 1.25);
        if (arrived) {
          bot.stateT += dt;
          bot.targetYaw += dt * 2.2 * (bot.idx % 2 ? 1 : -1);
          if (bot.stateT > 2.2) { bot.state = bot.arche === 'camper' ? 'camp' : 'wander'; bot.campSpot = null; bot.stateT = 0; bot.path = null; }
        } else if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
        break;
      }
      case 'combat': {
        if (!tgtValid(bot)) { bot.state = 'wander'; break; }
        bot.targetYaw = Math.atan2(t.pos.x - bp.x, t.pos.z - bp.z);
        if (bot.canSee) {
          bot.lastSeenAgo = 0;
          bot.stateT -= dt;
          if (bot.stateT <= 0) { bot.strafeDir = Math.random() < 0.5 ? -1 : 1; bot.stateT = U.rand(0.7, 1.7); }
          const fx = Math.sin(bot.targetYaw), fz = Math.cos(bot.targetYaw);
          let ax = fz * bot.strafeDir, az = -fx * bot.strafeDir;
          let fwd = 0;
          if (bot.weapon === 'sg') fwd = dist > 9 ? 1 : (dist < 4 ? -0.3 : 0.2);
          else if (bot.weapon === 'rl') fwd = dist > 30 ? 0.7 : (dist < 13 ? -0.9 : 0); // keep rocket distance
          else if (bot.weapon === 'sr') fwd = dist > 34 ? 0.5 : (dist < 14 ? -0.8 : 0); // snipers keep their distance
          else if (bot.arche === 'camper') fwd = 0;
          else fwd = dist > 26 ? 0.8 : (dist < 9 ? -0.7 : 0);
          ax += fx * fwd; az += fz * fwd;
          const l = Math.hypot(ax, az) || 1;
          bot.moveDir.set(ax / l, 0, az / l);
          bot.speedNow = baseSpeed * (bot.weapon === 'sg' ? 1.35 : 0.9);
          const nx = bp.x + bot.moveDir.x * 0.9, nz = bp.z + bot.moveDir.z * 0.9;
          const [ccx, ccz] = G.world.nav.toCell(nx, nz);
          if (G.world.nav.blocked(ccx, ccz)) { bot.strafeDir *= -1; bot.moveDir.multiplyScalar(-0.5); }
          fireControl(bot, dt, dist);
          // grenade toss (not rocket bots — they have enough explosives)
          if (bot.weapon !== 'rl' && bot.nadeCd <= 0 && bot.cfg !== DIFF.easy && dist > 9 && dist < 24 && Math.random() < 0.3) {
            bot.nadeCd = 15;
            if (G.arsenal) {
              tmpV.set(bp.x, bp.y + 1.6, bp.z);
              tmpDir.set(t.pos.x - bp.x, 0, t.pos.z - bp.z).normalize();
              tmpDir.y = 0.62;
              tmpDir.normalize().multiplyScalar(U.clamp(dist * 0.75, 8, 15));
              G.arsenal.spawnNade(tmpV, tmpDir, bot);
              if (t.kind === 'me') G.game.chat(bot.name, U.pick(['frag out', 'eat this', 'catch!']));
            }
          }
          if (bot.meleeCd <= 0 && dist < 2.0) {
            bot.meleeCd = 1.2;
            G.audio.melee();
            const ai = attackerInfo(bot);
            if (t.kind === 'me') G.game.onPlayerDamage(30, bp, bot, 'melee');
            else if (t.kind === 'remote' && G.net) G.net.evDmgP(t.rp.id, 30, bp.x, bp.z, bot.name, bot.team);
            else if (t.kind === 'bot') t.bot.damage(30, tmpDir.set(fx, 0.2, fz), { ...ai, cause: 'melee' });
          }
        } else {
          if (bot.lastSeenAgo > 1.1) { bot.state = 'hunt'; bot.path = null; }
        }
        if (bot.hp < 32 && bot.canSee && Math.random() < dt * 1.4) startCover(bot);
        break;
      }
      case 'hunt': {
        bot.repathT -= dt;
        if (!bot.path || bot.repathT <= 0) {
          const s = scatter(bot, bot.lastKnown.x, bot.lastKnown.z);
          setPath(bot, s.x, s.z);
        }
        const arrived = followPath(bot, baseSpeed * 1.3);
        if (bot.canSee) { bot.state = 'combat'; break; }
        if (arrived) { bot.state = 'investigate'; bot.stateT = 0; }
        else if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
        break;
      }
      case 'cover': {
        if (!bot.coverPos) { bot.state = 'combat'; break; }
        const arrived = followPath(bot, baseSpeed * 1.35);
        if (arrived) {
          bot.coverWait -= dt;
          bot.targetYaw = Math.atan2(bot.lastKnown.x - bp.x, bot.lastKnown.z - bp.z);
          if (bot.coverWait <= 0 && bot.reloadT <= 0) { bot.state = 'hunt'; bot.coverPos = null; bot.path = null; }
        } else if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
        break;
      }
      case 'ladder': {
        const L = bot.ladderTgt;
        bot.stateT += dt;
        if (!L || bot.stateT > 9) { bot.state = 'hunt'; bot.ladderTgt = null; bot.ladderCd = 5; bot.path = null; break; }
        const gx = L.cx + L.fx * 0.55, gz = L.cz + L.fz * 0.55; // stand at the grab side
        bot.repathT -= dt;
        if (!bot.path || bot.repathT <= 0) setPath(bot, gx, gz);
        followPath(bot, baseSpeed * 1.2);
        if (bot.moveDir.lengthSq() > 0) bot.targetYaw = Math.atan2(bot.moveDir.x, bot.moveDir.z);
        if (U.dist2d(bp.x, bp.z, gx, gz) < 0.85 && Math.abs(bp.y - L.baseY) < 1.2) {
          bot.climb = L;          // hands on
          bot.state = 'hunt';
          bot.ladderTgt = null;
          bot.path = null;
        }
        break;
      }
    }

    if (bot.fleeT > 0) {
      bot.moveDir.copy(bot.fleeDir);
      bot.speedNow = baseSpeed * 1.6;
      bot.targetYaw = Math.atan2(bot.fleeDir.x, bot.fleeDir.z);
    }
    if (bot.staggerT > 0) bot.speedNow *= 0.35;

    // separation — keep squads loose (wider bubble outside of firefights)
    const sepR = bot.state === 'combat' ? 2.1 : 3.4;
    for (const other of M.bots) {
      if (other === bot || !other.alive || other.team !== bot.team) continue;
      if (Math.abs(other.group.position.y - bp.y) > 1.5) continue; // different floor, not crowding
      const dx = bp.x - other.group.position.x, dz = bp.z - other.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < sepR * sepR && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        bot.moveDir.x += (dx / d) * (sepR - d) * 1.3;
        bot.moveDir.z += (dz / d) * (sepR - d) * 1.3;
      }
    }
    // don't casually stroll into a fresh crater zone
    if (bot.state !== 'combat' && bot.fleeT <= 0 && bot.moveDir.lengthSq() > 0.001) {
      const aheadX = bp.x + bot.moveDir.x * 3, aheadZ = bp.z + bot.moveDir.z * 3;
      if (inDanger(aheadX, aheadZ, 0) && !inDanger(bp.x, bp.z, 0)) {
        bot.moveDir.set(-bot.moveDir.z, 0, bot.moveDir.x); // slide around the edge
      }
    }

    if (bot.moveDir.lengthSq() > 0.001 && bot.speedNow > 0) {
      const l = bot.moveDir.length();
      bp.x += (bot.moveDir.x / l) * bot.speedNow * dt;
      bp.z += (bot.moveDir.z / l) * bot.speedNow * dt;
      G.world.collideCircle(bp, 0.34, bp.y, 1.75);
      bot.animPhase += bot.speedNow * dt * 2.4;
    } else {
      bot.animPhase = U.damp(bot.animPhase, Math.round(bot.animPhase / Math.PI) * Math.PI, 8, dt);
    }
    if (G.world.zeroG) {
      // jetpack altitude: fly at the fight's height, cruise at deck level otherwise
      let wantY;
      if (tgtValid(bot) && (bot.state === 'combat' || bot.state === 'hunt' || bot.state === 'cover'))
        wantY = t.pos.y + ((bot.idx % 3) - 1) * 0.9;
      else if (bot.state === 'investigate') wantY = bot.lastKnown.y || 0;
      else {
        wantY = G.world.standHeightAt(bp.x, bp.z, bp.y + 0.5);
        if (wantY < -100) wantY = 0; // open void below: cruise at main-deck altitude
      }
      wantY = U.clamp(wantY, G.world.spaceY.min + 2, G.world.spaceY.max - 2);
      if (Math.abs(wantY - bp.y) > 0.06) {
        bp.y += U.clamp(wantY - bp.y, -3.4 * dt, 3.4 * dt);
        if (bot.speedNow < 1) { bot.speedNow = 1; bot.animPhase += dt * 3; }
      }
      const zfl = G.world.standHeightAt(bp.x, bp.z, bp.y);
      if (bp.y < zfl) bp.y = zfl;
      const zce = G.world.ceilingAt(bp.x, bp.z, bp.y, 0.3);
      if (zce > zfl + 1.9 && bp.y + 1.9 > zce) bp.y = zce - 1.9;
    } else {
      bp.y = G.world.standHeightAt(bp.x, bp.z, bp.y);
    }

    // stuck: repath → try a different route → vault/bash as a last resort
    bot.stuckT += dt;
    if (bot.stuckT > 1.1) {
      if (bot.speedNow > 0 && U.dist2d(bp.x, bp.z, bot.lastPos.x, bot.lastPos.z) < 0.35) {
        bot.path = null;
        bot.stuckN++;
        if (bot.stuckN === 2) {
          // plan B: approach from a different angle instead of ramming the same wall
          if (bot.state === 'ladder') { bot.state = 'hunt'; bot.ladderTgt = null; bot.ladderCd = 5; }
          bot.lastKnown.x += U.rand(-7, 7);
          bot.lastKnown.z += U.rand(-7, 7);
          bot.pathBias = 0.7 + Math.random() * 0.8; // different heuristic = different corridor
        } else if (bot.stuckN >= 3) {
          unstick(bot);
          bot.stuckN = 0;
        }
      } else bot.stuckN = 0;
      bot.lastPos.copy(bp);
      bot.stuckT = 0;
    }

    // yaw damp
    let dy = bot.targetYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, bot.cfg.turn * dt);
    bot.group.rotation.y = bot.yaw;

    const aiming = bot.state === 'combat' || bot.state === 'cover' || bot.alertT >= 0;
    animate(bot, dt, aiming, tgtValid(bot) ? t : null, dist);
    const camDist = G.player ? U.dist2d(bp.x, bp.z, G.player.pos.x, G.player.pos.z) : 99;
    const friendly = G.player && bot.team === G.player.team;
    bot.tag.visible = camDist < (friendly ? 90 : 42);
    bot.marker.visible = !!friendly;
  }

  function animate(bot, dt, aiming, t, dist) {
    const bp = bot.group.position;
    const swing = Math.sin(bot.animPhase) * 0.55 * Math.min(1, bot.speedNow / 3);
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    if (aiming) {
      const pitch = t ? Math.atan2(tgtEyeY(t) - 0.3 - (bp.y + 1.4), Math.max(dist, 0.5)) : 0;
      bot.armL.rotation.x = U.damp(bot.armL.rotation.x, -Math.PI / 2 + -pitch, 10, dt);
      bot.armR.rotation.x = U.damp(bot.armR.rotation.x, -Math.PI / 2 + -pitch, 10, dt);
      bot.gun.rotation.x = U.damp(bot.gun.rotation.x, -pitch, 10, dt);
      bot.gun.position.y = 1.42;
    } else {
      bot.armL.rotation.x = U.damp(bot.armL.rotation.x, -swing * 0.7, 8, dt);
      bot.armR.rotation.x = U.damp(bot.armR.rotation.x, swing * 0.7, 8, dt);
      bot.gun.rotation.x = U.damp(bot.gun.rotation.x, 0.4, 8, dt);
      bot.gun.position.y = 1.3;
    }
    bot.group.position.y = bp.y + Math.abs(Math.sin(bot.animPhase)) * 0.05 * Math.min(1, bot.speedNow / 3);
  }

  function updateCorpse(bot, dt) {
    if (bot.fallT >= 0) {
      bot.fallT += dt;
      const t = Math.min(bot.fallT / 0.5, 1);
      const ease = 1 - Math.pow(1 - t, 2.4);
      bot.group.rotation.x = ease * (Math.PI / 2) * 0.96 * bot.fallAxis;
      if (t >= 1 && bot.fallT < 0.6) G.fx.dustLand(bot.group.position);
    }
    bot.corpseT -= dt;
    if (bot.corpseT < 1 && !bot.gibbed) bot.group.position.y -= dt * 1.6;
  }

  // ---------- puppet mode (multiplayer clients render host-simulated bots) ----------
  function updatePuppet(bot, dt) {
    const bp = bot.group.position;
    const dx = bot.netX - bp.x, dz = bot.netZ - bp.z;
    const d = Math.hypot(dx, dz);
    if (d > 6) { bp.x = bot.netX; bp.z = bot.netZ; } // teleport on big error
    else {
      bp.x = U.damp(bp.x, bot.netX, 12, dt);
      bp.z = U.damp(bp.z, bot.netZ, 12, dt);
    }
    bot.speedNow = bot.netSpd;
    if (bot.netSpd > 0.3) bot.animPhase += bot.netSpd * dt * 2.4;
    // follow the host's height (ladders/decks); fall back to local ground fit
    const wantY = bot.netY !== undefined ? bot.netY : G.world.standHeightAt(bp.x, bp.z, bp.y);
    bp.y = Math.abs(wantY - bp.y) > 3 ? wantY : U.damp(bp.y, wantY, 10, dt);
    let dy = bot.netYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, 12 * dt);
    bot.group.rotation.y = bot.yaw;
    animate(bot, dt, bot.netAim, null, 10);
    const camDist = G.player ? U.dist2d(bp.x, bp.z, G.player.pos.x, G.player.pos.z) : 99;
    const friendly = G.player && bot.team === G.player.team;
    bot.tag.visible = camDist < (friendly ? 90 : 42);
    bot.marker.visible = !!friendly;
  }
  M.applySnapshot = function (arr) {
    // arr: flat [x, z, yaw, spd, aim, hp, y] per bot
    for (let i = 0; i < M.bots.length; i++) {
      const o = i * 7;
      if (o + 6 >= arr.length) break;
      const b = M.bots[i];
      b.netX = arr[o]; b.netZ = arr[o + 1]; b.netYaw = arr[o + 2];
      b.netSpd = arr[o + 3]; b.netAim = arr[o + 4] > 0; b.hp = arr[o + 5];
      b.netY = arr[o + 6];
    }
  };
  M.snapshot = function () {
    const arr = [];
    for (const b of M.bots) {
      const p = b.group.position;
      const aiming = b.state === 'combat' || b.state === 'cover' || b.alertT >= 0;
      arr.push(+p.x.toFixed(2), +p.z.toFixed(2), +b.yaw.toFixed(2), +b.speedNow.toFixed(1), aiming ? 1 : 0, Math.round(b.hp), +p.y.toFixed(2));
    }
    return arr;
  };

  // ---------- manager ----------
  // roster: [{name, team, arche, weapon}], generated by rosterFor() on the host / solo
  M.init = function (scene, roster, diff, puppet) {
    for (const b of M.bots) scene.remove(b.group);
    M.bots.length = 0;
    M.puppet = !!puppet;
    roster.forEach((r, i) => {
      const bot = Bot(i, r.name, r.arche, diff, r.team, r.weapon);
      scene.add(bot.group);
      M.bots.push(bot);
      if (!puppet) respawn(bot);
      else { bot.alive = true; bot.hp = bot.cfg.hp; bot.group.position.set(r.x || 0, 0, r.z || 0); bot.netX = r.x || 0; bot.netZ = r.z || 0; }
    });
  };
  // build a team roster with weapon allocation: 9+ → 2 rockets, 6+ → 1, 3-5 → 40% chance of 1
  M.rosterFor = function (counts) {
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    const arches = ['soldier', 'soldier', 'rusher', 'soldier', 'camper', 'rusher', 'soldier', 'camper', 'soldier'];
    const roster = [];
    let ni = 0;
    counts.forEach((n, team) => {
      let rockets = n >= 9 ? 2 : n >= 6 ? 1 : (n >= 3 && Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const arche = arches[i % arches.length];
        let weapon = arche === 'rusher' ? 'sg' : 'ar';
        if (rockets > 0 && arche === 'soldier') { weapon = 'rl'; rockets--; }
        roster.push({ name: names[ni++ % names.length], team, arche, weapon });
      }
    });
    return roster;
  };
  // gun game weapon ladder — must match GUN_LADDER / GUN_PER in main.js
  const GUN_LADDER = ['ar', 'sg', 'sr', 'rl'], GUN_PER = 2;
  M.update = function (dt) {
    for (let i = dangers.length - 1; i >= 0; i--) {
      dangers[i].t -= dt;
      if (dangers[i].t <= 0) dangers.splice(i, 1);
    }
    // gun game: bots ride the same ladder the humans do (host/solo authoritative)
    if (!M.puppet && G.game && G.game.mode === 'gun') {
      for (const b of M.bots) {
        const w = GUN_LADDER[Math.min(GUN_LADDER.length - 1, Math.floor(b.kills / GUN_PER))];
        if (b.weapon !== w) {
          b.weapon = w;
          b.mag = w === 'sg' ? 6 : w === 'sr' ? 5 : w === 'rl' ? 1 : 30;
          b.burstLeft = 0; b.reloadT = 0;
          b.rocketCd = Math.max(b.rocketCd, 1.2);
        }
      }
    }
    for (const b of M.bots) updateBot(b, dt);
  };
  // ---------- danger memory ----------
  // recent explosions leave a "do not enter" zone; bots caught inside scatter
  const dangers = [];
  M.dangers = dangers;
  M.onDanger = function (pos, radius) {
    if (M.puppet) return;
    dangers.push({ x: pos.x, z: pos.z, r: radius, t: 8 });
    if (dangers.length > 12) dangers.shift();
    for (const b of M.bots) {
      if (!b.alive) continue;
      const bp = b.group.position;
      const d = U.dist2d(pos.x, pos.z, bp.x, bp.z);
      if (d < radius + 4 && b.fleeT <= 0) {
        b.fleeDir.set(bp.x - pos.x, 0, bp.z - pos.z);
        if (b.fleeDir.lengthSq() < 0.01) b.fleeDir.set(Math.sin(b.idx), 0, Math.cos(b.idx));
        b.fleeDir.normalize();
        b.fleeT = U.rand(1.0, 1.8);
        b.path = null;
      }
    }
  };
  function inDanger(x, z, pad) {
    for (let i = 0; i < dangers.length; i++) {
      const d = dangers[i];
      if (U.dist2d(x, z, d.x, d.z) < d.r + (pad || 0)) return true;
    }
    return false;
  }
  M.onNoise = function (pos, radius) {
    if (M.puppet) return;
    // gunfire draws attention — but only a couple of the closest bots commit,
    // the rest keep doing their own thing (no more zombie stampedes)
    let responders = 0;
    const sorted = M.bots.filter(b => b.alive && b.state !== 'combat' && b.state !== 'cover' &&
      U.dist2d(pos.x, pos.z, b.group.position.x, b.group.position.z) < radius)
      .sort((a, b2) => U.dist2d(pos.x, pos.z, a.group.position.x, a.group.position.z) -
                       U.dist2d(pos.x, pos.z, b2.group.position.x, b2.group.position.z));
    for (const b of sorted) {
      if (responders >= 2 && Math.random() < 0.75) continue;
      if (inDanger(pos.x, pos.z, 1)) { // heard it, not walking into the crater
        b.lastKnown.set(pos.x + U.rand(-9, 9), 0, pos.z + U.rand(-9, 9));
      } else {
        b.lastKnown.set(pos.x + U.rand(-3, 3), 0, pos.z + U.rand(-3, 3));
      }
      if (b.state !== 'investigate' || Math.random() < 0.3) { b.state = 'investigate'; b.stateT = 0; b.path = null; }
      responders++;
    }
  };
  M.aliveCount = function () {
    let n = 0;
    for (const b of M.bots) if (b.alive) n++;
    return n;
  };

  return M;
})();
