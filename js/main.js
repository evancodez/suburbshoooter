// main.js — game loop, player, HUD, match flow
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- settings ----------
  const settings = { sens: 1.0, vol: 0.8, fov: 78, bots: 6, diff: 'normal', name: '', target: 30, mins: 10, map: 'suburbs', layout: 1 };
  try {
    const s = JSON.parse(localStorage.getItem('blockops_settings') || '{}');
    Object.assign(settings, s);
  } catch (e) {}
  function saveSettings() { try { localStorage.setItem('blockops_settings', JSON.stringify(settings)); } catch (e) {} }
  G.settings = settings;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  $('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.06, 500);
  scene.add(camera);
  G.scene = scene; G.camera = camera; G.renderer = renderer;
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- build ----------
  G.fx.init(scene);
  G.world.build(scene);
  G.arsenal.init(camera);

  // ---------- player ----------
  const player = {
    pos: new THREE.Vector3(-50, 0, 0),
    vel: new THREE.Vector3(),
    yaw: -Math.PI / 2, pitch: 0,
    hp: 100, alive: true,
    onGround: true, crouching: false, sprinting: false,
    slideT: -1, slideDir: new THREE.Vector3(),
    eyeH: 1.62,
    regenT: 0, spawnProtectT: 0,
    kills: 0, deaths: 0, streak: 0, bestStreak: 0,
    multiN: 0, multiT: 0,
    uavT: 0, airstrikeReady: false, airstrikeEarned: 0,
    shotsFired: 0, shotsHit: 0,
    deathT: 0, killedBy: '',
    team: 0,
  };
  G.player = player;

  // ---------- game object ----------
  const game = {
    state: 'menu', // menu | playing | dead | over
    paused: false,
    time: 0, matchT: 600, target: 30,
    teamScores: [0, 0],
    lookDX: 0, lookDY: 0,
    recoilP: 0, recoilY: 0,
    flashA: 0, dmgA: 0,
  };
  G.game = game;
  Object.defineProperty(G, 'time', { get: () => game.time });

  // ---------- input ----------
  const keys = {};
  let pointerLocked = false;
  const cv = renderer.domElement;
  let lastWTap = -9, sprintLatch = false;
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyW') { // double-tap W = sprint (held for as long as W is)
      const now = performance.now() / 1000;
      if (now - lastWTap < 0.3) sprintLatch = true;
      lastWTap = now;
    }
    keys[e.code] = true;
    if (game.state !== 'playing' || !player.alive) return;
    const L2 = (settings.layout || 1) === 2; // touchpad preset
    if (e.code === 'KeyR') G.arsenal.reload();
    if (e.code === 'KeyG' && !L2) G.arsenal.throwNade();
    if (e.code === 'KeyE' && L2) G.arsenal.throwNade();
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && L2) G.arsenal.adsDown();
    if (e.code === 'KeyF') G.arsenal.melee();
    if (e.code === 'Digit1') G.arsenal.switchTo('ar');
    if (e.code === 'Digit2') G.arsenal.switchTo('sg');
    if (e.code === 'Digit3') G.arsenal.switchTo('sr');
    if (e.code === 'Digit4') G.arsenal.switchTo('rl');
    if (e.code === 'Digit5') G.arsenal.callAirstrike();
  });
  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyW') sprintLatch = false;
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && (settings.layout || 1) === 2) G.arsenal.adsUp();
  });
  document.addEventListener('mousedown', (e) => {
    if (game.state !== 'playing' || game.paused) return; // paused: let the menu buttons take the click
    if (!pointerLocked) { lockPointer(); return; }
    if (e.button === 0) G.arsenal.fireDown();
    if (e.button === 2) G.arsenal.adsDown();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) G.arsenal.fireUp();
    if (e.button === 2) G.arsenal.adsUp();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    if (game.state === 'playing' && player.alive) G.arsenal.cycle(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked || game.state !== 'playing') return;
    const scopeK = G.arsenal.isScoped() ? 0.3 : 1;
    const s = settings.sens * 0.0021 * scopeK;
    player.yaw -= e.movementX * s;
    player.pitch -= e.movementY * s;
    player.pitch = U.clamp(player.pitch, -1.51, 1.51);
    game.lookDX = e.movementX; game.lookDY = e.movementY;
  });
  function lockPointer() {
    const p = cv.requestPointerLock && cv.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === cv;
    if (!pointerLocked && game.state === 'playing') {
      game.paused = true;
      $('pause').style.display = 'flex';
      renderPauseHost();
    }
  });
  // host-only mid-match controls on the pause screen
  function renderPauseHost() {
    const N = G.net;
    const on = N && N.active && N.isHost && N.lobby;
    $('pauseHost').style.display = on ? '' : 'none';
    if (!on) return;
    if (document.activeElement !== $('pBotsA')) $('pBotsA').value = N.lobby.cfg.botsA;
    if (document.activeElement !== $('pBotsB')) $('pBotsB').value = N.lobby.cfg.botsB;
    let html = '';
    for (const p of N.lobby.players) {
      html += `<span class="lplayer" style="display:inline-block; margin:2px 6px 2px 0; padding:2px 8px; border-radius:6px; background:${p.team === 0 ? '#dcf5dc' : '#f8ded8'}" data-id="${esc(p.id)}">${esc(p.name)}${p.host ? ' ★' : ''} ⇄</span>`;
    }
    $('pausePlayers').innerHTML = html;
    $('pausePlayers').querySelectorAll('.lplayer').forEach(el => {
      el.addEventListener('click', () => {
        const p = N.lobby.players.find(q => q.id === el.dataset.id);
        if (p) N.setTeam(p.id, 1 - p.team);
      });
    });
  }

  // ---------- player update ----------
  const wishDir = new THREE.Vector3();
  const tmpJet = new THREE.Vector3();
  function updatePlayer(dt) {
    player.spawnProtectT -= dt;
    if (!player.alive) return;

    const sprintKey = sprintLatch && keys.KeyW; // double-tap W, keep holding
    const crouchKey = keys.KeyC || keys.ControlLeft ||
      ((settings.layout || 1) === 1 && (keys.ShiftLeft || keys.ShiftRight)); // L2: Shift is ADS instead
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

    if (G.world.zeroG) { updateZeroG(dt, sprintKey, crouchKey); return; }

    // start slide
    const speedNow = Math.hypot(player.vel.x, player.vel.z);
    if (sprintKey && crouchKey && player.onGround && speedNow > 5.2 && player.slideT < 0 && fwd > 0) {
      player.slideT = 0.72;
      player.slideDir.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      G.fx.shake(0.2, 0.2);
    }
    if (player.slideT >= 0) {
      player.slideT -= dt;
      if (player.slideT < 0 || !crouchKey) player.slideT = -1;
    }
    player.crouching = (crouchKey || player.slideT >= 0);
    player.sprinting = sprintKey && fwd > 0 && !player.crouching && player.onGround !== false;

    // wish velocity
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    wishDir.set(-sy * fwd + cy * str, 0, -cy * fwd - sy * str);
    if (wishDir.lengthSq() > 1) wishDir.normalize();
    let speed = 5.1;
    if (player.sprinting) speed = 7.5;
    if (player.crouching) speed = 2.7;
    if (player.slideT >= 0) {
      const k = player.slideT / 0.72;
      wishDir.copy(player.slideDir);
      speed = 8.8 * (0.35 + 0.65 * k);
    }
    const accel = player.onGround ? 26 : 5;
    player.vel.x = U.damp(player.vel.x, wishDir.x * speed, accel * 0.4, dt);
    player.vel.z = U.damp(player.vel.z, wishDir.z * speed, accel * 0.4, dt);

    runGroundedPhysics(dt);
  }

  // ---------- zero-g jetpack (space maps) ----------
  function updateZeroG(dt, sprintKey, crouchKey) {
    {
      player.crouching = false;
      player.slideT = -1;
      player.sprinting = false; // boost never blocks the trigger
      const boost = sprintKey ? 1.65 : 1;
      const acc = 13 * boost;
      // thrust along the camera: W flies where you look, strafe stays level,
      // Space/Shift give straight up/down
      const cp = Math.cos(player.pitch), sp2 = Math.sin(player.pitch);
      const fwdX = -Math.sin(player.yaw) * cp, fwdY = sp2, fwdZ = -Math.cos(player.yaw) * cp;
      const rgtX = -Math.sin(player.yaw - Math.PI / 2), rgtZ = -Math.cos(player.yaw - Math.PI / 2);
      const fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const st2 = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      let tx = fwdX * fw + rgtX * st2;
      let ty = fwdY * fw;
      let tz = fwdZ * fw + rgtZ * st2;
      if (keys.Space) ty += 1;
      if (crouchKey) ty -= 1;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 0.01) {
        player.vel.x += (tx / tl) * acc * dt;
        player.vel.y += (ty / tl) * acc * dt;
        player.vel.z += (tz / tl) * acc * dt;
        if (G.fx && Math.random() < dt * 8) { // little jet puffs
          tmpJet.set(player.pos.x - player.vel.x * 0.08, player.pos.y + 0.5, player.pos.z - player.vel.z * 0.08);
          G.fx.rocketTrail(tmpJet);
        }
      }
      // drag keeps it flyable, not slippery-ice
      const drag = Math.pow(0.22, dt);
      player.vel.multiplyScalar(drag);
      const vmax = 9.5 * boost;
      const vl = player.vel.length();
      if (vl > vmax) player.vel.multiplyScalar(vmax / vl);
      // integrate + collide
      player.pos.x += player.vel.x * dt;
      player.pos.z += player.vel.z * dt;
      player.pos.y += player.vel.y * dt;
      const zgFloor = G.world.standHeightAt(player.pos.x, player.pos.z, player.pos.y);
      if (player.pos.y < zgFloor && player.vel.y < 0) { player.pos.y = zgFloor; player.vel.y = 0; }
      const zgCeil = G.world.ceilingAt(player.pos.x, player.pos.z, player.pos.y, 0.3);
      if (zgCeil > zgFloor + 1.88 && player.pos.y + 1.88 > zgCeil) { player.pos.y = zgCeil - 1.88; if (player.vel.y > 0) player.vel.y = 0; }
      player.onGround = player.pos.y <= zgFloor + 0.05;
      G.world.collideCircle(player.pos, 0.38, player.pos.y, 1.75, 0.28);
      player.pos.x = U.clamp(player.pos.x, -G.world.bounds.x - 4, G.world.bounds.x + 4);
      player.pos.z = U.clamp(player.pos.z, -G.world.bounds.z - 4, G.world.bounds.z + 4);
      player.pos.y = U.clamp(player.pos.y, G.world.spaceY.min, G.world.spaceY.max);
      player.eyeH = U.damp(player.eyeH, 1.62, 12, dt);
      player.regenT += dt;
      if (player.regenT > 4.2 && player.hp < 100) player.hp = Math.min(100, player.hp + 40 * dt);
      if (player.multiT > 0) { player.multiT -= dt; if (player.multiT <= 0) player.multiN = 0; }
      player.uavT -= dt;
    }
  }

  // ---------- grounded physics (every map that still has a floor) ----------
  function runGroundedPhysics(dt) {
    const crouchKey = keys.KeyC || keys.ControlLeft || keys.ShiftLeft || keys.ShiftRight;
    // gravity / jump / ladders / map hazards
    const floorY = G.world.standHeightAt(player.pos.x, player.pos.z, player.pos.y);
    player.ladderCd = Math.max(0, (player.ladderCd || 0) - dt);
    const lad = player.ladderCd > 0 ? null : G.world.ladderAt(player.pos.x, player.pos.z, player.pos.y);
    const wantsUp = keys.Space || keys.KeyW; // hold Space (or W) at a ladder to climb
    const grabbing = !!lad && (wantsUp || keys.KeyS || (!player.onGround && player.vel.y < -1));
    if (grabbing) {
      player.slideT = -1;
      const climb = wantsUp ? 3.1 : keys.KeyS ? -3.8 : 0;
      player.vel.y = 0;
      // stacked ladder segments (fire escapes): climb straight through the
      // joins — only the very top of the chain is a real crest
      const nextLad = G.world.ladderAt(player.pos.x, player.pos.z, lad.topY + 0.05);
      player.pos.y = Math.min(player.pos.y + climb * dt, nextLad ? nextLad.topY : lad.topY);
      if (player.pos.y < floorY) player.pos.y = floorY;
      player.onGround = player.pos.y <= floorY + 0.01;
      if (!player.onGround) {
        const k = Math.pow(0.002, dt);
        player.vel.x *= k; player.vel.z *= k;
      }
      if (!nextLad && player.pos.y >= lad.topY - 0.001 && wantsUp) { // crest: hop onto the deck
        player.vel.y = 2.6;
        player.ladderCd = 0.45;
        player.onGround = false;
      }
    } else if (keys.Space && player.onGround) {
      player.vel.y = 5.6;
      player.onGround = false;
      player.slideT = -1;
    }
    // erupting geyser under your feet = free elevator
    const gey = G.world.geyserBoostAt(player.pos.x, player.pos.z);
    if (gey && player.pos.y < floorY + 1.4 && player.vel.y < 12) {
      player.vel.y = 13.5;
      player.onGround = false;
      player.slideT = -1;
      G.fx.shake(0.35, 0.25);
    }
    if (!player.onGround && !grabbing) {
      player.vel.y -= 14.5 * dt;
      player.pos.y += player.vel.y * dt;
      if (player.pos.y <= floorY && player.vel.y <= 0) {
        player.pos.y = floorY;
        if (player.vel.y < -7) { G.fx.shake(0.35, 0.18); G.fx.dustLand(player.pos); }
        player.vel.y = 0;
        player.onGround = true;
      }
    } else if (!grabbing) {
      if (player.pos.y > floorY + 0.05) {
        player.onGround = false; // walked off ledge
      } else player.pos.y = floorY;
    }
    // bonk: jumping under a floor/ceiling stops the jump instead of clipping.
    // NOT while on a ladder — climbing past an overhanging ledge would pin you
    // headroom-below it forever (the ladder's own top cap limits the climb)
    if (!grabbing && player.ladderCd <= 0.1) {
      const ceilY = G.world.ceilingAt(player.pos.x, player.pos.z, player.pos.y, 0.3);
      const headroom = player.crouching ? 1.35 : 1.88;
      if (ceilY > floorY + headroom && player.pos.y + headroom > ceilY) {
        player.pos.y = ceilY - headroom;
        if (player.vel.y > 0) player.vel.y = 0;
      }
    }
    // standing in lava is exactly as bad as it sounds
    player.lavaAcc = (player.lavaAcc || 0) - dt;
    if (player.alive && G.world.lavaAt(player.pos.x, player.pos.z, player.pos.y) && player.lavaAcc <= 0) {
      player.lavaAcc = 0.4;
      game.onPlayerDamage(15, player.pos, { name: 'THE VOLCANO', team: -1, remote: true }, 'LAVA');
      G.fx.addEmitter({ pos: new THREE.Vector3(player.pos.x, 0.4, player.pos.z), rate: 22, kind: 'fire', dur: 0.25 });
    }

    // horizontal move + collide
    if (grabbing) {
      // hands on the ladder: hug the rail line and ignore wall shoves —
      // a slab you're climbing past would otherwise "inside-push" you off
      player.pos.x = U.damp(player.pos.x, lad.cx + lad.fx * 0.55, 12, dt);
      player.pos.z = U.damp(player.pos.z, lad.cz + lad.fz * 0.55, 12, dt);
    } else {
      player.pos.x += player.vel.x * dt;
      player.pos.z += player.vel.z * dt;
    }
    const h = player.crouching ? 1.2 : 1.75;
    // airborne: raise the step limit so mid-jump you can drift over car
    // hoods/props and land on top instead of being shoved off sideways
    if (!grabbing) G.world.collideCircle(player.pos, 0.38, player.pos.y, h, player.onGround ? 0.42 : 0.95);
    player.pos.x = U.clamp(player.pos.x, -G.world.bounds.x - 4, G.world.bounds.x + 4);
    player.pos.z = U.clamp(player.pos.z, -G.world.bounds.z - 4, G.world.bounds.z + 4);

    // eye height
    const targetEye = player.crouching ? 1.02 : 1.62;
    player.eyeH = U.damp(player.eyeH, targetEye, 12, dt);

    // health regen
    player.regenT += dt;
    if (player.regenT > 4.2 && player.hp < 100) {
      player.hp = Math.min(100, player.hp + 40 * dt);
    }

    // timers
    if (player.multiT > 0) { player.multiT -= dt; if (player.multiT <= 0) player.multiN = 0; }
    player.uavT -= dt;
  }

  // ---------- camera ----------
  const shakeOut = { x: 0, y: 0 };
  function updateCamera(dt) {
    // recoil recovery
    game.recoilP = U.damp(game.recoilP, 0, 7, dt);
    game.recoilY = U.damp(game.recoilY, 0, 7, dt);
    G.fx.getShake(shakeOut, dt);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw + game.recoilY + shakeOut.x;
    camera.rotation.x = player.pitch + game.recoilP + shakeOut.y;
    // strafe tilt
    const tilt = U.clamp(-(player.vel.x * -Math.cos(player.yaw) + player.vel.z * Math.sin(player.yaw)) * 0.004, -0.025, 0.025);
    camera.rotation.z = U.damp(camera.rotation.z, tilt + (player.slideT >= 0 ? -0.06 : 0), 8, dt);
    camera.position.set(player.pos.x, player.pos.y + player.eyeH, player.pos.z);
    // FOV
    const adsZoom = { ar: 0.74, sg: 0.86, sr: 0.18, rl: 0.8 }[G.arsenal.currentId] || 0.8;
    let f = settings.fov;
    if (player.sprinting) f += 5;
    if (player.slideT >= 0) f += 7;
    f = U.lerp(f, settings.fov * adsZoom, G.arsenal.ads());
    if (Math.abs(camera.fov - f) > 0.1) {
      camera.fov = U.damp(camera.fov, f, 12, dt);
      camera.updateProjectionMatrix();
    }
  }
  game.addRecoil = function (p, y) { game.recoilP += p; game.recoilY += (y || 0); };

  // ---------- damage / death ----------
  game.onPlayerDamage = function (dmg, fromPos, attacker, cause) {
    if (!player.alive || player.spawnProtectT > 0 || game.state !== 'playing') return;
    player.hp -= dmg;
    player.regenT = 0;
    game.dmgA = Math.min(1, game.dmgA + dmg / 55);
    G.audio.hurt();
    // direction indicator
    if (fromPos) {
      const bearing = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z);
      let rel = bearing - player.yaw + Math.PI;
      $('dirind').style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`;
      $('dirind').style.opacity = 0.9;
    }
    if (player.hp <= 0) {
      player.hp = 0;
      const name = attacker && attacker.name ? attacker.name : (cause === 'yourself' ? 'YOURSELF' : 'THE SUBURBS');
      playerDie(name, attacker);
    }
  };
  function attackerTeamOf(attacker) {
    if (attacker === 'player') return player.team;
    if (attacker && attacker.team !== undefined) return attacker.team;
    return -1;
  }
  function playerDie(killerName, attacker) {
    player.alive = false;
    player.deaths++;
    player.streak = 0;
    player.airstrikeEarned = 0;
    game.state = 'dead';
    player.deathT = 2.8;
    player.killedBy = killerName;
    if (attacker && attacker.kills !== undefined) attacker.kills++;
    const tag = attacker && attacker.weapon === 'sg' ? 'SG' : attacker && attacker.weapon === 'rl' ? 'ROCKET' : 'AR';
    if (G.net && G.net.active) {
      // host scores + broadcasts the feed; clients report to the host
      G.net.evDied(killerName, attackerTeamOf(attacker), tag);
    } else {
      game.teamScores[1 - player.team]++;
      game.killfeed(killerName, tag, 'YOU', '#ff6655');
      checkEnd();
    }
    G.fx.bloodBurst(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), new THREE.Vector3(0, 1, 0), 14, 5);
    $('deathKiller').textContent = killerName;
    $('deathTip').textContent = U.pick(TIPS);
    $('death').style.display = 'flex';
    G.arsenal.fireUp(); G.arsenal.adsUp();
    if (Math.random() < 0.45 && attacker && attacker.name && attacker.group) {
      setTimeout(() => game.chat(attacker.name, U.pick(TAUNTS_KILL)), U.rand(400, 1500));
    }
  }
  function enemyPositions() {
    const list = [];
    for (const b of G.botMgr.bots) if (b.alive && b.team !== player.team) list.push(b.group.position);
    if (G.net && G.net.active) for (const rp of G.net.remoteList) if (rp.alive && rp.team !== player.team) list.push(rp.pos);
    return list;
  }
  function pickSpawn(preferSide) {
    const enemies = enemyPositions();
    let best = null, bestScore = -1;
    for (const s of G.world.spawnPoints) {
      let minD = 999;
      for (const p of enemies) minD = Math.min(minD, U.dist2d(s.x, s.z, p.x, p.z));
      const sideOk = preferSide === undefined ? true : (preferSide === 0 ? s.x <= 0 : s.x >= 0);
      const score = minD + (sideOk ? 22 : 0) + U.rand(0, 8);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }
  function respawnPlayer() {
    const best = pickSpawn(G.net && G.net.active ? player.team : undefined);
    player.pos.set(best.x, 0, best.z);
    player.vel.set(0, 0, 0);
    player.yaw = Math.atan2(best.x, best.z); // face the middle of the map
    player.pitch = 0;
    player.hp = 100;
    player.alive = true;
    player.onGround = true;
    player.spawnProtectT = 1.4;
    G.arsenal.refill(); // fresh mags + at least default reserves
    game.state = 'playing';
    $('death').style.display = 'none';
  }

  // ---------- kills / score ----------
  const TAUNTS_KILL = ['ez', 'get rekt', 'u mad bro?', 'nice aim lol', '1v1 me irl', 'stay mad', 'skill issue', 'L', 'gg go next', 'my grandma shoots better'];
  const TAUNTS_SALT = ['hacks fr', 'reported', 'lag i swear', 'who gave him a rocket??', 'bro is SWEATING', 'this is my yard!!', 'im telling the HOA', 'mom said i have to go soon anyway'];
  const TIPS = [
    'Walls are temporary. Bullets are forever.',
    'The propane tank is not your friend.',
    'Aim for the head. It\'s the round part.',
    'Sprint + crouch = slide. Dodge like a pro.',
    'Grenades bounce. Plan accordingly.',
    '5 killstreak = airstrike. Redecorate the block.',
    'The mailbox did nothing wrong.',
    'Windows are cheaper than walls. Financially.',
    'Campers hide inside houses. Rockets fix that.',
    'Shoot the bottom of a wall. Physics does the rest.',
    'The scaffold and the fort are high ground. Use it.',
    'The sniper [3] one-taps heads. Hold RMB to scope.',
    'Fire hydrants make excellent sprinklers.',
  ];
  function myDisplayName() { return G.net && G.net.active ? G.net.myName : 'YOU'; }
  // personal reward flow — runs when *I* got the kill (solo direct, MP via feed match)
  function personalKill(head) {
    player.kills++;
    player.streak++;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    G.arsenal.onKillReward(player.kills);
    player.multiN++;
    player.multiT = 4;
    const MK = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'BLOCKBUSTER!' };
    pointPop('+' + (head ? 150 : 100) + (head ? ' HEADSHOT' : ''));
    if (MK[Math.min(player.multiN, 5)] && player.multiN >= 2) {
      game.banner(MK[Math.min(player.multiN, 5)], '#ffd23e');
      if (player.multiN >= 3 && Math.random() < 0.5 && !(G.net && G.net.active && !G.net.isHost)) {
        const alive = G.botMgr.bots.filter(b => b.alive && b.team !== player.team);
        if (alive.length) setTimeout(() => game.chat(U.pick(alive).name, U.pick(TAUNTS_SALT)), 900);
      }
    }
    if (head) G.audio.head(); else G.audio.kill();
    if (player.streak === 3) {
      player.uavT = 22;
      game.banner('UAV ONLINE', '#7dcfff');
      G.audio.uav();
    }
    if (player.streak === 5 && player.airstrikeEarned < 1) {
      player.airstrikeReady = true;
      player.airstrikeEarned = 1;
      game.banner('AIRSTRIKE READY — PRESS [5]', '#ff9d3e');
      G.audio.airstrikeCall();
    }
  }
  // feed line + personal-kill detection; used locally and for network kill events
  game.onNetKillFeed = function (kn, vn, tag, head) {
    const meKiller = kn === myDisplayName() || kn === 'YOU';
    const meVictim = vn === myDisplayName();
    if (meVictim) return; // own death feed is drawn in playerDie / applyDmgP path
    game.killfeed(meKiller ? 'YOU' : kn, tag + (head ? ' ⌖' : ''), vn, '#ccc');
    if (meKiller) personalKill(head);
  };
  // bot died where AI is authoritative (solo or MP host)
  game.onBotDied = function (bot, opts, deathInfo) {
    const att = opts.attacker;
    let killerName = null, killerTeam = -1;
    if (att === 'player') { killerName = myDisplayName(); killerTeam = player.team; }
    else if (att && att.group) { killerName = att.name; killerTeam = att.team; att.kills++; }
    else if (att && att.name !== undefined) { killerName = att.name; killerTeam = att.team; }
    const tag = opts.tag || 'BOOM';
    if (killerTeam >= 0 && killerTeam !== bot.team) game.teamScores[killerTeam]++;
    if (killerName) game.onNetKillFeed(killerName, bot.name, tag, !!opts.head);
    else game.killfeed(opts.tag || 'KABOOM', 'env', bot.name, '#ccc');
    if (G.net && G.net.active && G.net.isHost) {
      G.net.evBotDie(G.botMgr.bots.indexOf(bot), deathInfo || {});
      if (killerName) G.net.evKillFeed(killerTeam, killerName, bot.name, tag, !!opts.head);
      G.net.evScore(game.teamScores);
    }
    checkEnd();
  };
  // a human died (host authoritative in MP; also handles the host's own death)
  game.onHumanDied = function (vn, vt, by, bt, tag) {
    if (bt >= 0 && bt !== vt) game.teamScores[bt]++;
    const meVictim = vn === myDisplayName();
    if (!meVictim) game.onNetKillFeed(by || 'THE SUBURBS', vn, tag || 'AR', false);
    if (G.net && G.net.active && G.net.isHost) {
      G.net.evKillFeed(bt, by || 'THE SUBURBS', vn, tag || 'AR', false);
      G.net.evScore(game.teamScores);
    }
    checkEnd();
  };
  game.setTeamScores = function (s) { game.teamScores = s; checkEndClientside(); };
  function checkEndClientside() { /* clients wait for the host's end event */ }
  game.onNetEnd = function (winTeam) { endMatch(winTeam === player.team, winTeam === -1); };
  game.killfeed = function (left, tag, right, color) {
    const feed = $('feed');
    const div = document.createElement('div');
    div.className = 'feedline';
    if (tag === 'env') div.innerHTML = `<span style="color:#ffb020">${esc(left)}</span> ☠ <span style="color:#ff8877">${esc(right)}</span>`;
    else if (!left) div.innerHTML = `<span style="color:${color}">${esc(right)}</span>`;
    else div.innerHTML = `<span style="color:${left === 'YOU' ? '#7dff7d' : '#ff8877'}">${esc(left)}</span> <span class="ftag">[${esc(tag)}]</span> <span style="color:${left === 'YOU' ? '#ff8877' : '#7dff7d'}">${esc(right)}</span>`;
    feed.appendChild(div);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
    setTimeout(() => { div.style.opacity = 0; }, 4200);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
  };
  function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  game.chat = function (name, msg, fromNet) {
    const chat = $('chat');
    const div = document.createElement('div');
    div.className = 'chatline';
    div.innerHTML = `<span class="cname">[ALL] ${esc(name)}:</span> ${esc(msg)}`;
    chat.appendChild(div);
    while (chat.children.length > 4) chat.removeChild(chat.firstChild);
    setTimeout(() => { div.style.opacity = 0; }, 5000);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
    if (!fromNet && G.net && G.net.active) G.net.evChat(name, msg);
  };
  let bannerT = null;
  game.banner = function (text, color) {
    const b = $('banner');
    b.textContent = text;
    b.style.color = color || '#ffd23e';
    b.style.opacity = 1;
    b.style.transform = 'translateX(-50%) scale(1.15)';
    clearTimeout(bannerT);
    setTimeout(() => { b.style.transform = 'translateX(-50%) scale(1)'; }, 90);
    bannerT = setTimeout(() => { b.style.opacity = 0; }, 1800);
  };
  function pointPop(text) {
    const p = $('pointpop');
    p.textContent = text;
    p.style.opacity = 1;
    p.style.transform = 'translate(-50%,-8px)';
    setTimeout(() => { p.style.opacity = 0; p.style.transform = 'translate(-50%,-26px)'; }, 500);
  }
  let hitmT = null;
  game.hitmarker = function (kill, head) {
    const h = $('hitm');
    h.style.opacity = 1;
    h.style.color = kill ? '#ff3333' : (head ? '#ffd23e' : '#ffffff');
    h.style.transform = `translate(-50%,-50%) scale(${kill ? 1.5 : 1})`;
    clearTimeout(hitmT);
    hitmT = setTimeout(() => { h.style.opacity = 0; }, 110);
    G.audio.hit();
  };
  game.markRadar = function (bot) { bot.radarT = 2.6; };
  game.markPlayerRadar = function () {};
  game.flash = function (a) { game.flashA = Math.max(game.flashA, a); };

  // ---------- match flow ----------
  function baseStartMatch(cfg) {
    G.world.reset(cfg.map);  // build the chosen map fresh
    G.fx.reset();            // no leftover blood/debris/smoke
    player.team = cfg.myTeam || 0;
    player.hp = 100; player.alive = true;
    player.kills = 0; player.deaths = 0; player.streak = 0; player.bestStreak = 0;
    player.uavT = 0; player.airstrikeReady = false; player.airstrikeEarned = 0;
    player.shotsFired = 0; player.shotsHit = 0;
    player.spawnProtectT = 1.4;
    game.teamScores = [0, 0];
    game.matchT = cfg.time || 600;
    game.target = cfg.target || 30;
    game.time = 0;
    game.state = 'playing';
    game.paused = false;
    G.arsenal.reset();
    G.world.bill = {}; G.world.billTotal = 0; G.world.chunksDestroyed = 0;
    // spawn on my side, facing the middle of the map
    const sp = cfg.spawn || G.world.teamSpawns[player.team] || { x: 0, z: 0 };
    player.pos.set(sp.x, 0, sp.z);
    player.vel.set(0, 0, 0);
    // face the map center (camera forward is (-sin yaw, -cos yaw))
    player.yaw = Math.atan2(sp.x, sp.z);
    player.pitch = 0;
    $('menu').style.display = 'none';
    $('lobby').style.display = 'none';
    $('end').style.display = 'none';
    $('death').style.display = 'none';
    $('pause').style.display = 'none';
    $('hud').style.display = 'block';
    G.audio.init();
    G.audio.setVolume(settings.vol);
    lockPointer();
    staticMapDirty = true;
    if (G.world.zeroG) setTimeout(() => {
      if (game.state === 'playing') game.banner('ZERO-G — JETPACK ONLINE · SPACE up · SHIFT down', '#7fd4ff');
    }, 800);
  }
  function numVal(id, def, min, max) {
    const v = Math.round(parseFloat($(id).value));
    return isNaN(v) ? def : U.clamp(v, min, max);
  }
  function startSolo() {
    settings.bots = numVal('botCountInput', 6, 0, 40);
    settings.target = numVal('targetInput', 30, 1, 500);
    settings.mins = numVal('timeInput', 10, 1, 90);
    settings.diff = document.querySelector('#diffSel .sel').dataset.v;
    settings.map = document.querySelector('#mapSel .sel').dataset.v;
    saveSettings();
    if (G.net) G.net.leave();
    baseStartMatch({ myTeam: 0, target: settings.target, time: settings.mins * 60, map: settings.map });
    const roster = G.botMgr.rosterFor([0, settings.bots]);
    G.botMgr.init(scene, roster, settings.diff, false);
  }
  function startNetMatch(cfg, roster, extra) {
    settings.diff = cfg.diff;
    baseStartMatch({ myTeam: G.net.myTeam, time: cfg.time, target: cfg.target, map: cfg.map });
    G.botMgr.init(scene, roster, cfg.diff, !G.net.isHost);
    if (extra && extra.late) {
      // joined mid-match: fast-forward to the host's world
      if (extra.world) G.world.applyDamageSnapshot(extra.world);
      if (extra.scores) game.teamScores = extra.scores;
      if (extra.mt !== undefined) game.matchT = extra.mt;
      if (extra.botsAlive) extra.botsAlive.forEach((a, i) => { if (!a) G.botMgr.forceDead(i); });
      game.banner && game.banner('JOINED MATCH IN PROGRESS', '#7dcfff');
    }
  }
  function checkEnd() {
    if (game.state === 'over') return;
    if (G.net && G.net.active && !G.net.isHost) return; // host decides
    const a = game.teamScores[0], b = game.teamScores[1];
    if (a >= game.target || b >= game.target || game.matchT <= 0) {
      const winTeam = a === b ? -1 : (a > b ? 0 : 1);
      if (G.net && G.net.active) G.net.evEnd(winTeam);
      endMatch(winTeam === player.team, winTeam === -1);
    }
  }
  function endMatch(win, draw) {
    game.state = 'over';
    game.paused = false;
    document.exitPointerLock && document.exitPointerLock();
    $('hud').style.display = 'none';
    $('death').style.display = 'none';
    const t = $('endTitle');
    t.textContent = draw ? 'DRAW' : (win ? 'VICTORY' : 'DEFEATED');
    t.style.color = draw ? '#ffd23e' : (win ? '#7dff7d' : '#ff5544');
    // back-to-lobby button when connected
    $('againBtn').textContent = (G.net && G.net.lobby) ? 'BACK TO LOBBY' : 'PLAY AGAIN';
    const acc = player.shotsFired ? Math.round(100 * player.shotsHit / player.shotsFired) : 0;
    $('endStats').innerHTML =
      `<tr><td>Kills</td><td>${player.kills}</td></tr>` +
      `<tr><td>Deaths</td><td>${player.deaths}</td></tr>` +
      `<tr><td>Best streak</td><td>${player.bestStreak}</td></tr>` +
      `<tr><td>Accuracy</td><td>${acc}%</td></tr>` +
      `<tr><td>Debris created</td><td>${G.world.chunksDestroyed}</td></tr>`;
    // damage bill
    const NAMES = {
      siding: 'Vinyl siding (panel)', roof: 'Roofing (section)', glass: 'Windows', fence: 'Fence sections',
      garage: 'Garage door panels', car: 'Family sedans', mailbox: 'Federal mailboxes', propane: 'Propane tanks',
      grill: 'BBQ grills', couch: 'Sofas', fridge: 'Refrigerators', tv: 'Flatscreen TVs', shed: 'Shed panels',
      table: 'Coffee tables', frame: 'Wall framing (stud)', trash: 'Trash cans', recycle: 'Recycling bins',
      hydrant: 'Fire hydrants', hoop: 'Basketball hoops', doghouse: 'Dog houses', kpool: 'Kiddie pools',
      ac: 'AC units', dumpster: 'Dumpsters', potty: 'Porta-potties', lumber: 'Lumber stacks',
      mixer: 'Cement mixers', bed: 'Beds', shelf: 'Bookshelves', picnic: 'Picnic tables', swing: 'Swing seats',
    };
    const PRICES = {
      siding: 140, roof: 90, fence: 35, garage: 75, glass: 260, shed: 95, mailbox: 85, propane: 60,
      grill: 220, couch: 900, fridge: 1100, tv: 1300, table: 350, car: 12500,
      frame: 25, trash: 20, recycle: 15, hydrant: 950, hoop: 320, doghouse: 180, kpool: 45,
      ac: 480, dumpster: 800, potty: 550, lumber: 60, mixer: 2100, bed: 700, shelf: 260,
      picnic: 400, swing: 130,
    };
    const items = Object.entries(G.world.bill).sort((a, b) => (b[1] * (PRICES[b[0]] || 50)) - (a[1] * (PRICES[a[0]] || 50)));
    let rows = '';
    for (const [k, n] of items.slice(0, 6)) {
      rows += `<tr><td>${NAMES[k] || k} × ${n}</td><td>$${((PRICES[k] || 50) * n).toLocaleString()}</td></tr>`;
    }
    const total = G.world.billTotal;
    let snark = 'Your HOA has issued a warning.';
    if (total > 120000) snark = 'The block will never recover. Congratulations.';
    else if (total > 60000) snark = 'FEMA has been notified.';
    else if (total > 25000) snark = 'The neighborhood watch has declared war on you.';
    else if (total > 5000) snark = 'Your HOA has filed a formal complaint.';
    $('endBill').innerHTML = rows + `<tr class="billtotal"><td>TOTAL PROPERTY DAMAGE</td><td>$${total.toLocaleString()}</td></tr>`;
    $('endSnark').textContent = snark;
    $('end').style.display = 'flex';
  }

  // ---------- HUD ----------
  function fmtTime(t) {
    t = Math.max(0, Math.ceil(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  let hudT = 0, scopeShown = false;
  function updateHUD(dt) {
    hudT -= dt;
    // vignettes every frame
    game.dmgA = Math.max(0, game.dmgA - dt * 1.6);
    const lowHp = 1 - player.hp / 100;
    $('dmg').style.opacity = Math.min(1, game.dmgA + lowHp * 0.55);
    game.flashA = Math.max(0, game.flashA - dt * 2.2);
    $('flash').style.opacity = game.flashA;
    $('dirind').style.opacity = Math.max(0, parseFloat($('dirind').style.opacity || 0) - dt * 1.2);
    // sniper scope overlay
    const scoped = G.arsenal.isScoped() && player.alive;
    if (scoped !== scopeShown) {
      scopeShown = scoped;
      $('scope').style.display = scoped ? 'block' : 'none';
    }
    if (hudT > 0) return;
    hudT = 0.08;
    // health
    $('hpfill').style.width = Math.max(0, player.hp) + '%';
    $('hpfill').style.background = player.hp > 55 ? '#42d64a' : (player.hp > 25 ? '#e8c23e' : '#e83333');
    // ammo (yellow when low, red when empty)
    const st = G.arsenal.state[G.arsenal.currentId];
    const def = G.arsenal.def();
    $('ammo').textContent = st.ammo + ' / ' + st.reserve;
    $('ammo').style.color = st.ammo === 0 ? '#e83333' : (st.ammo <= Math.max(1, def.mag * 0.25) ? '#e8a020' : '#111');
    $('wname').textContent = def.name + (G.arsenal.reloading && G.arsenal.reloading() ? ' — RELOADING' : '');
    $('nades').textContent = '✸ ' + G.arsenal.grenades;
    // team score (mine first)
    const my = game.teamScores[player.team], their = game.teamScores[1 - player.team];
    $('scoreyou').textContent = my;
    $('scorethem').textContent = their;
    const diff = my - their;
    const wl = $('winlabel');
    wl.textContent = diff > 0 ? 'WINNING' : (diff < 0 ? 'LOSING' : 'TIED');
    wl.style.color = diff > 0 ? '#7dff7d' : (diff < 0 ? '#ff5544' : '#ffd23e');
    $('timer').textContent = fmtTime(game.matchT);
    $('fpsc').textContent = GAME.fps ? GAME.fps + ' FPS' : '';
    // streak
    const sEl = $('streak');
    if (player.airstrikeReady) { sEl.textContent = 'AIRSTRIKE READY [5]'; sEl.style.color = '#ff9d3e'; }
    else if (player.uavT > 0) { sEl.textContent = 'UAV ' + Math.ceil(player.uavT) + 's'; sEl.style.color = '#7dcfff'; }
    else if (player.streak >= 2) { sEl.textContent = 'STREAK ' + player.streak; sEl.style.color = '#ffd23e'; }
    else sEl.textContent = '';
    // crosshair
    const spreadDeg = G.arsenal.spreadNow ? G.arsenal.spreadNow() : 1;
    const px = spreadDeg * (window.innerHeight / camera.fov) * 1.1;
    const ch = $('ch');
    ch.style.opacity = G.arsenal.ads() > 0.6 || !player.alive ? 0 : 0.9;
    ch.style.setProperty('--gap', U.clamp(6 + px, 6, 60) + 'px');
    drawMinimap();
  }

  // ---------- minimap ----------
  const mmStatic = document.createElement('canvas');
  const MMS = 2.2;
  const MMOX = 72, MMOZ = 58;
  mmStatic.width = Math.ceil(144 * MMS); mmStatic.height = Math.ceil(116 * MMS);
  let staticMapDirty = true, staticMapT = 0;
  const MM_WALL_COLORS = { fence: '#7a4f28', chainlink: '#aab2ba', plank: '#c9a05f', bamboo: '#b6a14e', block: '#94979b', hull: '#e8ecf2' };
  function redrawStaticMap() {
    const x = mmStatic.getContext('2d');
    const w2m = (wx, wz) => [(wx + MMOX) * MMS, (wz + MMOZ) * MMS];
    if (G.world.minimapPaint) {
      G.world.minimapPaint(x, MMS, MMOX, MMOZ);
    } else {
      x.fillStyle = '#3e8f2e';
      x.fillRect(0, 0, mmStatic.width, mmStatic.height);
      // roads + sidewalks (main E-W, cross N-S)
      x.fillStyle = '#b9bcc0';
      x.fillRect(0, (MMOZ - 7.1) * MMS, mmStatic.width, 2.6 * MMS);
      x.fillRect(0, (MMOZ + 4.5) * MMS, mmStatic.width, 2.6 * MMS);
      x.fillRect((MMOX - 7.1) * MMS, 0, 2.6 * MMS, mmStatic.height);
      x.fillRect((MMOX + 4.5) * MMS, 0, 2.6 * MMS, mmStatic.height);
      x.fillStyle = '#77797d';
      x.fillRect(0, (MMOZ - 4.5) * MMS, mmStatic.width, 9 * MMS);
      x.fillRect((MMOX - 4.5) * MMS, 0, 9 * MMS, mmStatic.height);
    }
    // walls
    x.fillStyle = '#1a1a1a';
    for (const w of G.world.walls) {
      x.fillStyle = MM_WALL_COLORS[w.kind] || '#1a1a1a';
      for (let c = 0; c < w.cols; c++) {
        if (!(w.colMask[c] & 0b111)) continue;
        let wx, wz;
        if (w.dir === 'x') { wx = w.ox + (c + 0.5) * w.cw; wz = w.oz; }
        else { wx = w.ox; wz = w.oz + (c + 0.5) * w.cw; }
        const [mx, mz] = w2m(wx, wz);
        x.fillRect(mx - w.cw * MMS / 2, mz - w.cw * MMS / 2, w.cw * MMS, Math.max(2, w.th * MMS));
      }
    }
    // cars
    for (const car of G.world.cars) {
      x.fillStyle = car.exploded ? '#333' : '#555a60';
      const p = car.group.position;
      const [mx, mz] = w2m(p.x, p.z);
      x.fillRect(mx - 4, mz - 3, 8, 6);
    }
    staticMapDirty = false;
  }
  function drawMinimap() {
    const c = $('minimap');
    const x = c.getContext('2d');
    const S = c.width, R = S / 2;
    staticMapT -= 0.08;
    if ((staticMapDirty || G.world.minimapDirty) && staticMapT <= 0) {
      redrawStaticMap();
      G.world.minimapDirty = false;
      staticMapT = 1.4;
    }
    x.clearRect(0, 0, S, S);
    x.save();
    x.beginPath(); x.arc(R, R, R - 2, 0, 7); x.clip();
    x.fillStyle = G.world.mapId === 'island' ? '#25748d' : G.world.mapId === 'construction' ? '#8a6640' : '#2c661f';
    x.fillRect(0, 0, S, S);
    x.translate(R, R);
    x.rotate(player.yaw);
    const s = MMS;
    x.drawImage(mmStatic, (-MMOX - player.pos.x) * s, (-MMOZ - player.pos.z) * s);
    // bots: teammates always green, enemies red when firing or under UAV
    for (const b of G.botMgr.bots) {
      if (!b.alive) continue;
      const friendly = b.team === player.team;
      if (!friendly && !(player.uavT > 0 || (b.radarT && b.radarT > 0))) continue;
      const dx = (b.group.position.x - player.pos.x) * s, dz = (b.group.position.z - player.pos.z) * s;
      x.fillStyle = friendly ? '#4ad64a' : '#ff3b30';
      x.beginPath(); x.arc(dx, dz, 3.4, 0, 7); x.fill();
    }
    // remote humans
    if (G.net && G.net.active) {
      for (const rp of G.net.remoteList) {
        if (!rp.alive) continue;
        const friendly = rp.team === player.team;
        if (!friendly && !(player.uavT > 0 || rp.radarT > 0)) continue;
        const dx = (rp.pos.x - player.pos.x) * s, dz = (rp.pos.z - player.pos.z) * s;
        x.fillStyle = friendly ? '#4ad64a' : '#ff3b30';
        x.beginPath(); x.arc(dx, dz, 3.8, 0, 7); x.fill();
        if (friendly) { x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); }
      }
    }
    x.restore();
    // player arrow
    x.save();
    x.translate(R, R);
    x.fillStyle = '#ffd23e';
    x.strokeStyle = '#000'; x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(0, 3); x.lineTo(-5, 6);
    x.closePath(); x.fill(); x.stroke();
    x.restore();
    // N
    x.save();
    x.translate(R, R);
    x.rotate(player.yaw);
    x.translate(0, -R + 11);
    x.rotate(-player.yaw);
    x.fillStyle = '#fff'; x.font = 'bold 13px "Comic Sans MS", cursive';
    x.textAlign = 'center';
    x.strokeStyle = '#000'; x.lineWidth = 3;
    x.strokeText('N', 0, 5); x.fillText('N', 0, 5);
    x.restore();
    // border
    x.strokeStyle = '#111'; x.lineWidth = 3;
    x.beginPath(); x.arc(R, R, R - 2, 0, 7); x.stroke();
  }

  // ---------- bot radar decay ----------
  function decayRadar(dt) {
    for (const b of G.botMgr.bots) if (b.radarT > 0) b.radarT -= dt;
  }

  // ---------- menu wiring ----------
  function selGroup(id) {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    });
  }
  selGroup('diffSel'); selGroup('mapSel'); selGroup('layoutSel');
  // the controls card follows whichever layout is selected
  function renderControls() {
    const L2 = (settings.layout || 1) === 2;
    const rows = [
      ['WASD', 'move'], ['W W', 'double-tap: sprint'],
      ['MOUSE', 'aim · LMB fire'], [L2 ? 'SHIFT' : 'RMB', 'aim down sights'],
      ['SPACE', 'jump / climb ladders'], [L2 ? 'C' : 'SHIFT / C', 'crouch (+sprint = slide)'],
      [L2 ? 'E' : 'G', 'grenade'], ['F', 'knife'],
      ['R', 'reload'], ['1-4', 'weapons (or wheel)'],
      ['5', 'airstrike (5 streak)'], ['ESC', 'pause'],
    ];
    $('controlsList').innerHTML = rows.map(([k, txt]) => `<div><span class="key">${k}</span>${txt}</div>`).join('');
  }
  $('layoutSel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { settings.layout = parseInt(b.dataset.v); saveSettings(); renderControls(); }
  });
  document.querySelectorAll('#layoutSel button').forEach(b => b.classList.toggle('sel', parseInt(b.dataset.v) === (settings.layout || 1)));
  if (!document.querySelector('#layoutSel .sel')) document.querySelector('#layoutSel button[data-v="1"]').classList.add('sel');
  renderControls();
  // preselect from settings
  document.querySelectorAll('#diffSel button').forEach(b => b.classList.toggle('sel', b.dataset.v === settings.diff));
  if (!document.querySelector('#diffSel .sel')) document.querySelector('#diffSel button[data-v="normal"]').classList.add('sel');
  document.querySelectorAll('#mapSel button').forEach(b => b.classList.toggle('sel', b.dataset.v === settings.map));
  if (!document.querySelector('#mapSel .sel')) document.querySelector('#mapSel button[data-v="suburbs"]').classList.add('sel');
  $('botCountInput').value = settings.bots;
  $('targetInput').value = settings.target;
  $('timeInput').value = settings.mins;

  function bindSlider(id, key, fmt) {
    const el = $(id);
    el.value = settings[key];
    $(id + 'Val').textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      $(id + 'Val').textContent = fmt(settings[key]);
      if (key === 'vol') G.audio.setVolume(settings.vol);
      if (key === 'fov') { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
      saveSettings();
    });
  }
  bindSlider('sensSlider', 'sens', v => v.toFixed(2));
  bindSlider('volSlider', 'vol', v => Math.round(v * 100) + '%');
  bindSlider('fovSlider', 'fov', v => Math.round(v) + '°');
  bindSlider('sensSlider2', 'sens', v => v.toFixed(2));
  bindSlider('volSlider2', 'vol', v => Math.round(v * 100) + '%');
  bindSlider('fovSlider2', 'fov', v => Math.round(v) + '°');

  $('deployBtn').addEventListener('click', startSolo);
  $('resumeBtn').addEventListener('click', () => {
    game.paused = false;
    $('pause').style.display = 'none';
    lockPointer();
  });
  $('restartBtn').addEventListener('click', () => {
    if (G.net && G.net.lobby) { $('pause').style.display = 'none'; showLobby(); }
    else startSolo();
  });
  $('menuBtn').addEventListener('click', () => {
    if (G.net) G.net.leave();
    game.state = 'menu'; game.paused = false;
    $('pause').style.display = 'none';
    $('hud').style.display = 'none';
    $('menu').style.display = 'flex';
  });
  $('againBtn').addEventListener('click', () => {
    if (G.net && G.net.lobby) showLobby();
    else startSolo();
  });
  $('endMenuBtn').addEventListener('click', () => {
    if (G.net) G.net.leave();
    game.state = 'menu';
    $('end').style.display = 'none';
    $('menu').style.display = 'flex';
  });

  // ---------- multiplayer lobby ----------
  function playerName() {
    let n = ($('nameInput').value || '').trim().slice(0, 14);
    if (!n) n = 'Player' + U.randi(10, 99);
    settings.name = n;
    saveSettings();
    return n;
  }
  $('nameInput').value = settings.name || '';
  function showLobby() {
    game.state = 'menu';
    game.paused = false;
    $('menu').style.display = 'none';
    $('end').style.display = 'none';
    $('hud').style.display = 'none';
    $('lobby').style.display = 'flex';
    renderLobby();
  }
  function renderLobby() {
    const N = G.net;
    if (!N || !N.lobby) return;
    const isHost = N.isHost;
    $('lobbyCode').textContent = N.code;
    $('lobbyLink').value = N.link();
    if (document.activeElement !== $('lobbyName')) $('lobbyName').value = N.myName;
    // players grouped by team
    let html = '';
    for (const team of [0, 1]) {
      html += `<div class="teamcol team${team}"><h3>${team === 0 ? 'GREEN TEAM' : 'RED TEAM'}</h3>`;
      for (const p of N.lobby.players.filter(p => p.team === team)) {
        html += `<div class="lplayer" data-id="${esc(p.id)}">${esc(p.name)}${p.host ? ' ★' : ''}${isHost ? ' <span class="swapbtn">⇄</span>' : ''}</div>`;
      }
      const bots = team === 0 ? N.lobby.cfg.botsA : N.lobby.cfg.botsB;
      html += `<div class="lbots">+ ${bots} bot${bots === 1 ? '' : 's'}</div></div>`;
    }
    $('lobbyPlayers').innerHTML = html;
    if (isHost) {
      $('lobbyPlayers').querySelectorAll('.lplayer').forEach(el => {
        el.addEventListener('click', () => {
          const p = N.lobby.players.find(q => q.id === el.dataset.id);
          if (p) N.setTeam(p.id, 1 - p.team);
        });
      });
    }
    // bots + match rules + difficulty controls (host only editable)
    for (const [id, key, def] of [['botsAInput', 'botsA', 0], ['botsBInput', 'botsB', 3], ['lobbyTarget', 'target', 30], ['lobbyTime', 'mins', 10]]) {
      if (document.activeElement !== $(id)) $(id).value = N.lobby.cfg[key] === undefined ? def : N.lobby.cfg[key];
    }
    document.querySelectorAll('#lobbyDiff button').forEach(b => b.classList.toggle('sel', b.dataset.v === N.lobby.cfg.diff));
    const mapId = N.lobby.cfg.map || 'suburbs';
    document.querySelectorAll('#lobbyMap button').forEach(b => b.classList.toggle('sel', b.dataset.v === mapId));
    const mapDef = G.world.maps.find(m => m.id === mapId);
    $('lobbyMapLabel').textContent = 'MAP: ' + (mapDef ? mapDef.name : mapId).toUpperCase();
    document.querySelectorAll('.hostonly').forEach(el => { el.style.display = isHost ? '' : 'none'; });
    $('lobbyWait').style.display = isHost ? 'none' : 'block';
  }
  for (const [id, key, def, min, max] of [
    ['botsAInput', 'botsA', 0, 0, 20], ['botsBInput', 'botsB', 3, 0, 20],
    ['lobbyTarget', 'target', 30, 1, 500], ['lobbyTime', 'mins', 10, 1, 90],
  ]) {
    $(id).addEventListener('change', () => {
      if (!G.net || !G.net.isHost) return;
      const v = numVal(id, def, min, max);
      $(id).value = v;
      G.net.setCfg(key, v);
    });
  }
  $('lobbyDiff').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && G.net && G.net.isHost) G.net.setCfg('diff', b.dataset.v);
  });
  $('lobbyMap').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && G.net && G.net.isHost) G.net.setCfg('map', b.dataset.v);
  });
  $('copyLinkBtn').addEventListener('click', () => {
    const link = $('lobbyLink').value;
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
    $('lobbyLink').select();
    try { document.execCommand('copy'); } catch (e) {}
    $('copyLinkBtn').textContent = 'COPIED!';
    setTimeout(() => { $('copyLinkBtn').textContent = 'COPY'; }, 1200);
  });
  let lobbyNameT = 0;
  $('lobbyName').addEventListener('input', () => {
    clearTimeout(lobbyNameT);
    lobbyNameT = setTimeout(() => {
      const n = ($('lobbyName').value || '').trim().slice(0, 14);
      if (!n || !G.net) return;
      G.net.setName(n);
      settings.name = n;
      saveSettings();
      $('nameInput').value = n;
    }, 500);
  });
  $('lobbyStartBtn').addEventListener('click', () => { if (G.net) G.net.startMatch(); });
  $('lobbyLeaveBtn').addEventListener('click', () => {
    if (G.net) G.net.leave();
    $('lobby').style.display = 'none';
    $('menu').style.display = 'flex';
  });
  function netError(msg) {
    $('mpStatus').textContent = msg;
    $('mpStatus').style.color = '#e83333';
  }
  function netStatus(s) {
    $('mpStatus').textContent = s;
    $('mpStatus').style.color = '#555';
  }
  $('hostBtn').addEventListener('click', () => {
    if (typeof Peer === 'undefined') { netError('peerjs.min.js missing'); return; }
    netStatus('creating game…');
    G.net.host(playerName(), () => { $('mpStatus').textContent = ''; showLobby(); }, netError, netStatus);
  });
  function doJoin(code) {
    // joiners may have no name yet — send '' and the host numbers them Guest1,
    // Guest2, …; they can rename themselves from inside the lobby
    let n = ($('nameInput').value || '').trim().slice(0, 14);
    if (n) { settings.name = n; saveSettings(); }
    netStatus('connecting…');
    G.net.join(code.toLowerCase(), n, () => { $('mpStatus').textContent = ''; showLobby(); }, netError, netStatus);
  }
  $('joinBtn').addEventListener('click', () => {
    if (typeof Peer === 'undefined') { netError('peerjs.min.js missing'); return; }
    let code = ($('joinInput').value || '').trim();
    const m = code.match(/join=([a-z0-9]+)/i);
    if (m) code = m[1];
    if (!code) { netError('paste a game link or code'); return; }
    doJoin(code);
  });
  $('pBotsApply').addEventListener('click', () => {
    if (!G.net || !G.net.isHost) return;
    G.net.applyBots(numVal('pBotsA', 0, 0, 20), numVal('pBotsB', 3, 0, 20));
  });
  if (G.net) {
    G.net.onLobby = () => {
      renderLobby();
      if ($('pause').style.display === 'flex') renderPauseHost();
    };
    G.net.onStart = startNetMatch;
    G.net.onJoinFail = netError;
    G.net.onClosed = () => {
      game.banner && game.banner('HOST LEFT THE GAME', '#ff5544');
      G.net.leave();
      game.state = 'menu';
      $('hud').style.display = 'none';
      $('lobby').style.display = 'none';
      $('death').style.display = 'none';
      $('end').style.display = 'none';
      $('menu').style.display = 'flex';
    };
  }
  // shared link: join automatically — no button press needed
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) {
    $('joinInput').value = joinParam;
    if (typeof Peer !== 'undefined') doJoin(joinParam);
    else netError('peerjs.min.js missing');
  }

  // ---------- auto quality ----------
  let fpsAcc = 0, fpsN = 0, quality = 1;
  function autoQuality(dt) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 2) {
      const fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0;
      if (fps < 42 && quality > 0.55) {
        quality = 0.55;
        G.fx.quality = quality;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.1));
      } else if (fps < 28 && quality > 0.35) {
        quality = 0.35;
        G.fx.quality = quality;
        renderer.setPixelRatio(1);
      }
      GAME.fps = Math.round(fps);
    }
  }

  // ---------- main loop ----------
  let last = performance.now() / 1000;
  let menuAngle = 0;
  function loop() {
    requestAnimationFrame(loop);
    tick(true);
  }
  // fallback ticker when rAF is starved (hidden tab) — keeps sim + screenshots alive
  setInterval(() => {
    if (performance.now() / 1000 - last > 0.25) tick(false);
  }, 120);
  function tick(fromRaf) {
    const now = performance.now() / 1000;
    let dt = Math.min(now - last, 0.05);
    last = now;
    // in multiplayer the world keeps running while the pause overlay is up
    if (game.paused && !(G.net && G.net.active)) { renderer.render(scene, camera); return; }
    game.time += dt;

    G.arsenal.setVisible(game.state === 'playing' && player.alive && !G.arsenal.isScoped());
    if (game.state === 'menu') {
      menuAngle += dt * 0.07;
      camera.position.set(Math.cos(menuAngle) * 68, 34, Math.sin(menuAngle) * 68);
      camera.lookAt(0, 1, 0);
      camera.rotation.order = 'YXZ';
      G.fx.update(dt, camera);
      G.world.update(dt);
    } else if (game.state === 'playing' || game.state === 'dead') {
      if (game.state === 'playing') updatePlayer(dt);
      if (game.state === 'dead') {
        player.deathT -= dt;
        $('deathTimer').textContent = Math.max(0, player.deathT).toFixed(1);
        if (player.deathT <= 0) respawnPlayer();
      }
      G.arsenal.update(dt);
      G.botMgr.update(dt);
      G.world.update(dt);
      G.fx.update(dt, camera);
      if (G.net) G.net.update(dt);
      decayRadar(dt);
      updateCamera(dt);
      updateHUD(dt);
      game.lookDX = 0; game.lookDY = 0;
      // match timer (host / solo authoritative)
      if (!(G.net && G.net.active && !G.net.isHost)) {
        game.matchT -= dt;
        if (game.matchT <= 0) checkEnd();
      }
      if (fromRaf) autoQuality(dt);
    } else if (game.state === 'over') {
      G.fx.update(dt, camera);
      G.world.update(dt);
      if (G.net) G.net.update(dt);
    }
    renderer.render(scene, camera);
  }

  // ---------- debug API ----------
  const GAME = {
    fps: 0,
    start: startSolo,
    state: () => game.state,
    explodeAt: (x, y, z, r, d) => G.world.explode(new THREE.Vector3(x, y, z), r || 6, d || 150, { attacker: 'player', tag: 'DEBUG' }),
    teleport: (x, z) => { player.pos.set(x, 0, z); },
    player, game,
    drawCalls: () => renderer.info.render.calls,
    tris: () => renderer.info.render.triangles,
    killNearest: () => {
      let best = null, bd = 1e9;
      for (const b of G.botMgr.bots) {
        if (!b.alive) continue;
        const d = U.dist2d(b.group.position.x, b.group.position.z, player.pos.x, player.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) best.damage(999, new THREE.Vector3(0, 0.4, 1), { attacker: 'player', tag: 'DEBUG' });
      return best && best.name;
    },
    lookAt: (x, y, z) => {
      const dx = x - player.pos.x, dy = y - (player.pos.y + 1.62), dz = z - player.pos.z;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    fire: (n) => {
      G.arsenal.fireDown();
      setTimeout(() => G.arsenal.fireUp(), n || 120);
    },
    step: (secs) => { // drive the sim synchronously (testing in throttled tabs)
      const n = Math.ceil((secs || 1) / 0.033);
      for (let i = 0; i < n; i++) {
        last = performance.now() / 1000 - 0.033;
        tick(false);
      }
      return G.game.time;
    },
  };
  window.GAME = GAME;

  // start
  $('menu').style.display = 'flex';
  if (location.search.includes('auto')) { startSolo(); }
  loop();
})();
