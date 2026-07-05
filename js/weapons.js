// weapons.js — player arsenal, viewmodel, projectiles, grenades, airstrike
G.arsenal = (function () {
  const A = { nades: [], rockets: [], bombs: [] };

  const DEFS = {
    // falloff: damage fades linearly starting at falloffStart over falloff meters, never below falloffFloor
    ar: { name: 'M4 RATTLER', kind: 'ar', auto: true, interval: 0.088, dmg: 26, headMul: 2.3, mag: 45, reserve: 225,
          spread: 1.15, bloomPer: 0.62, bloomMax: 4.2, adsMul: 0.32, recoil: 1.35, chunkDmg: 15, reload: 1.9, pellets: 1,
          falloff: 95, falloffStart: 24, falloffFloor: 0.55 },
    sg:  { name: 'STREET SWEEPER', kind: 'sg', auto: true, interval: 0.7, dmg: 13, headMul: 1.6, mag: 10, reserve: 40,
          spread: 4.4, bloomPer: 0, bloomMax: 5, adsMul: 0.7, recoil: 2.6, chunkDmg: 9, reload: 2.5, pellets: 8,
          falloff: 30, falloffStart: 6, falloffFloor: 0.35 },
    sr:  { name: 'CURB APPEAL .50', kind: 'sr', auto: true, interval: 1.2, dmg: 96, headMul: 2.1, mag: 5, reserve: 25,
          spread: 5.5, bloomPer: 0, bloomMax: 6, adsMul: 0.012, recoil: 3.4, chunkDmg: 40, reload: 2.9, pellets: 1 },
    rl:  { name: 'HOA VIOLATION', kind: 'rl', auto: false, interval: 1.1, mag: 1, reserve: 5,
          spread: 0.4, bloomPer: 0, bloomMax: 1, adsMul: 0.5, recoil: 4, reload: 2.3, pellets: 0 },
    // the second rack: distinct roles, tuned around the classics
    rev: { name: 'SIX IRON', kind: 'rev', auto: false, interval: 0.34, dmg: 42, headMul: 2.4, mag: 6, reserve: 36,
          spread: 1.0, bloomPer: 0.55, bloomMax: 3.2, adsMul: 0.35, recoil: 2.0, chunkDmg: 14, reload: 2.2, pellets: 1,
          falloff: 70, falloffStart: 16, falloffFloor: 0.5 },
    smg: { name: 'LEAF BLOWER', kind: 'smg', auto: true, interval: 0.055, dmg: 15, headMul: 2.0, mag: 42, reserve: 210,
          spread: 1.7, bloomPer: 0.5, bloomMax: 5.5, adsMul: 0.45, recoil: 0.9, chunkDmg: 8, reload: 1.7, pellets: 1,
          falloff: 45, falloffStart: 9, falloffFloor: 0.35 },
    dmr: { name: 'PROPERTY LINE', kind: 'dmr', auto: false, interval: 0.3, dmg: 46, headMul: 2.0, mag: 12, reserve: 60,
          spread: 0.5, bloomPer: 0.9, bloomMax: 3.5, adsMul: 0.15, recoil: 1.9, chunkDmg: 22, reload: 2.2, pellets: 1,
          falloff: 140, falloffStart: 40, falloffFloor: 0.7 },
    lmg: { name: 'LAWN ENFORCER', kind: 'lmg', auto: true, interval: 0.1, dmg: 24, headMul: 2.0, mag: 80, reserve: 160,
          spread: 2.2, bloomPer: 0.35, bloomMax: 5, adsMul: 0.5, recoil: 1.7, chunkDmg: 26, reload: 3.4, pellets: 1,
          falloff: 90, falloffStart: 22, falloffFloor: 0.5 },
  };
  function rangeDmg(def, base, dist) {
    if (!def.falloff) return base;
    return base * U.clamp(1 - Math.max(0, dist - (def.falloffStart || 0)) / def.falloff, def.falloffFloor || 0.25, 1);
  }
  const ORDER = ['ar', 'sg', 'sr', 'rl', 'rev', 'smg', 'dmr', 'lmg']; // keys 1-4 = classics, wheel reaches the rest

  let camera, vmRoot;
  const state = {};
  A.state = state;
  A.grenades = 2;
  A.currentId = 'ar';
  let fireHeld = false, fireCd = 0, reloadT = 0, switchT = 0, pendingSwitch = null;
  let bloom = 0, adsT = 0, adsHeld = false;
  let bobPhase = 0, swayX = 0, swayY = 0, kickZ = 0, kickRot = 0;
  let meleeT = -1, meleeCd = 0;
  let muzzleFlashT = 0;

  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
  const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();
  const camFwd = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();

  // ---------- viewmodel construction ----------
  const models = {};
  let muzzleNode;
  function box(w, h, d, mat) { return new THREE.Mesh(U.shadedBoxGeo(w, h, d), mat); }
  function buildViewmodels() {
    const gunMat = new THREE.MeshBasicMaterial({ map: T.gunmetal(), vertexColors: true });
    const gunMat2 = new THREE.MeshBasicMaterial({ map: T.gunmetal(), vertexColors: true, color: 0x8a8f96 });
    const camoMat = new THREE.MeshBasicMaterial({ map: T.camo(), vertexColors: true });
    const woodMat = new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: 0x9a6b3f });
    const greenMat = new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: 0x5a6b4a });

    vmRoot = new THREE.Group();
    vmRoot.scale.setScalar(0.72);
    vmRoot.visible = false;
    camera.add(vmRoot);

    // --- AR ---
    const ar = new THREE.Group();
    const arBody = box(0.075, 0.12, 0.58, gunMat); ar.add(arBody);
    const arBarrel = box(0.045, 0.045, 0.3, gunMat2); arBarrel.position.set(0, 0.02, -0.42); ar.add(arBarrel);
    const arStock = box(0.06, 0.1, 0.22, gunMat2); arStock.position.set(0, -0.01, 0.36); ar.add(arStock);
    const arMag = box(0.05, 0.17, 0.09, gunMat2); arMag.position.set(0, -0.13, 0.02); arMag.rotation.x = 0.15; ar.add(arMag);
    const grip = box(0.05, 0.12, 0.06, gunMat2); grip.position.set(0, -0.11, 0.18); ar.add(grip);
    // red dot sight
    const sightBase = box(0.05, 0.03, 0.1, gunMat2); sightBase.position.set(0, 0.075, -0.05); ar.add(sightBase);
    const sightL = box(0.012, 0.075, 0.012, gunMat); sightL.position.set(-0.032, 0.12, -0.05); ar.add(sightL);
    const sightR = box(0.012, 0.075, 0.012, gunMat); sightR.position.set(0.032, 0.12, -0.05); ar.add(sightR);
    const sightT = box(0.075, 0.012, 0.012, gunMat); sightT.position.set(0, 0.155, -0.05); ar.add(sightT);
    const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, depthWrite: false }));
    dot.position.set(0, 0.118, -0.045); ar.add(dot);
    ar.userData.mag = arMag;
    models.ar = ar;

    // --- Shotgun ---
    const sg = new THREE.Group();
    const sgBody = box(0.08, 0.11, 0.62, gunMat); sg.add(sgBody);
    const sgBarrel = box(0.05, 0.05, 0.34, gunMat2); sgBarrel.position.set(0, 0.03, -0.45); sg.add(sgBarrel);
    const pump = box(0.07, 0.07, 0.2, woodMat); pump.position.set(0, -0.045, -0.3); sg.add(pump);
    const sgStock = box(0.06, 0.11, 0.26, woodMat); sgStock.position.set(0, -0.02, 0.4); sg.add(sgStock);
    sg.userData.pump = pump;
    models.sg = sg;

    // --- Sniper ---
    const sr = new THREE.Group();
    const srBody = box(0.07, 0.11, 0.7, gunMat); sr.add(srBody);
    const srBarrel = box(0.04, 0.04, 0.5, gunMat2); srBarrel.position.set(0, 0.02, -0.58); sr.add(srBarrel);
    const srMuzzle = box(0.06, 0.06, 0.12, gunMat); srMuzzle.position.set(0, 0.02, -0.82); sr.add(srMuzzle);
    const srStock = box(0.06, 0.12, 0.3, woodMat); srStock.position.set(0, -0.015, 0.42); sr.add(srStock);
    const srMag = box(0.05, 0.14, 0.1, gunMat2); srMag.position.set(0, -0.12, 0.05); sr.add(srMag);
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), gunMat2);
    scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, 0.115, -0.05); sr.add(scopeTube);
    const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8), new THREE.MeshBasicMaterial({ color: 0x7dcfff }));
    scopeLens.rotation.x = Math.PI / 2; scopeLens.position.set(0, 0.115, -0.21); sr.add(scopeLens);
    sr.userData.mag = srMag;
    models.sr = sr;

    // --- Rocket launcher ---
    const rl = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 8), greenMat);
    tube.rotation.x = Math.PI / 2; rl.add(tube);
    const tubeEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.12, 8), gunMat2);
    tubeEnd.rotation.x = Math.PI / 2; tubeEnd.position.z = -0.5; rl.add(tubeEnd);
    const rlGrip = box(0.05, 0.13, 0.06, gunMat2); rlGrip.position.set(0, -0.13, 0.1); rl.add(rlGrip);
    const rlSight = box(0.02, 0.09, 0.02, gunMat); rlSight.position.set(0, 0.12, -0.15); rl.add(rlSight);
    models.rl = rl;

    // --- Revolver ---
    const rev = new THREE.Group();
    const revBody = box(0.06, 0.095, 0.3, gunMat); revBody.position.z = -0.06; rev.add(revBody);
    const revBarrel = box(0.04, 0.05, 0.22, gunMat2); revBarrel.position.set(0, 0.015, -0.3); rev.add(revBarrel);
    const cylinderR = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.11, 8), gunMat2);
    cylinderR.rotation.x = Math.PI / 2; cylinderR.position.set(0, -0.01, -0.1); rev.add(cylinderR);
    const revGrip = box(0.05, 0.13, 0.07, woodMat); revGrip.position.set(0, -0.1, 0.08); revGrip.rotation.x = 0.35; rev.add(revGrip);
    const revHammer = box(0.02, 0.05, 0.03, gunMat2); revHammer.position.set(0, 0.06, 0.06); rev.add(revHammer);
    models.rev = rev;

    // --- SMG ---
    const smg = new THREE.Group();
    const smgBody = box(0.07, 0.11, 0.42, gunMat); smg.add(smgBody);
    const smgBarrel = box(0.04, 0.04, 0.16, gunMat2); smgBarrel.position.set(0, 0.02, -0.28); smg.add(smgBarrel);
    const smgMag = box(0.045, 0.2, 0.07, gunMat2); smgMag.position.set(0, -0.15, -0.04); smg.add(smgMag);
    const smgGrip = box(0.05, 0.11, 0.06, gunMat2); smgGrip.position.set(0, -0.1, 0.13); smg.add(smgGrip);
    const smgStock = box(0.025, 0.03, 0.2, gunMat2); smgStock.position.set(0, 0.02, 0.3); smg.add(smgStock);
    smg.userData.mag = smgMag;
    models.smg = smg;

    // --- DMR ---
    const dmr = new THREE.Group();
    const dmrBody = box(0.065, 0.1, 0.66, camoMat); dmr.add(dmrBody);
    const dmrBarrel = box(0.035, 0.035, 0.4, gunMat2); dmrBarrel.position.set(0, 0.02, -0.5); dmr.add(dmrBarrel);
    const dmrStock = box(0.055, 0.1, 0.24, camoMat); dmrStock.position.set(0, -0.01, 0.4); dmr.add(dmrStock);
    const dmrMag = box(0.045, 0.13, 0.08, gunMat2); dmrMag.position.set(0, -0.11, 0.02); dmr.add(dmrMag);
    const dmrScope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 8), gunMat2);
    dmrScope.rotation.x = Math.PI / 2; dmrScope.position.set(0, 0.095, -0.06); dmr.add(dmrScope);
    dmr.userData.mag = dmrMag;
    models.dmr = dmr;

    // --- LMG ---
    const lmg = new THREE.Group();
    const lmgBody = box(0.09, 0.14, 0.6, gunMat); lmg.add(lmgBody);
    const lmgBarrel = box(0.05, 0.05, 0.38, gunMat2); lmgBarrel.position.set(0, 0.03, -0.46); lmg.add(lmgBarrel);
    const lmgShroud = box(0.07, 0.07, 0.2, gunMat2); lmgShroud.position.set(0, 0.03, -0.3); lmg.add(lmgShroud);
    const lmgBox = box(0.09, 0.14, 0.16, greenMat); lmgBox.position.set(0, -0.14, 0.02); lmg.add(lmgBox);
    const lmgStock = box(0.06, 0.11, 0.2, gunMat2); lmgStock.position.set(0, -0.01, 0.38); lmg.add(lmgStock);
    const bipodL = box(0.015, 0.12, 0.015, gunMat2); bipodL.position.set(-0.04, -0.1, -0.5); bipodL.rotation.z = 0.25; lmg.add(bipodL);
    const bipodR = box(0.015, 0.12, 0.015, gunMat2); bipodR.position.set(0.04, -0.1, -0.5); bipodR.rotation.z = -0.25; lmg.add(bipodR);
    lmg.userData.mag = lmgBox;
    models.lmg = lmg;

    // arms (camo sleeves) shared: trigger arm from bottom-right, support arm under barrel
    for (const id of ORDER) {
      const m = models[id];
      const arm = box(0.095, 0.095, 0.42, camoMat);
      arm.position.set(0.07, -0.18, 0.3);
      arm.rotation.set(0.55, -0.28, 0.1);
      m.add(arm);
      const arm2 = box(0.09, 0.09, 0.36, camoMat);
      arm2.position.set(-0.05, -0.14, -0.16);
      arm2.rotation.set(0.35, 0.35, 0);
      m.add(arm2);
      m.visible = false;
      vmRoot.add(m);
    }
    muzzleNode = new THREE.Object3D();
    muzzleNode.position.set(0, 0.02, -0.6);
    models[A.currentId].add(muzzleNode);
    models[A.currentId].visible = true;
  }

  const HIP = { x: 0.33, y: -0.31, z: -0.62 };
  const ADS = {
    ar: { x: 0, y: -0.118, z: -0.46 }, sg: { x: 0, y: -0.08, z: -0.54 }, sr: { x: 0, y: -0.115, z: -0.5 }, rl: { x: 0.14, y: -0.14, z: -0.52 },
    rev: { x: 0, y: -0.1, z: -0.4 }, smg: { x: 0, y: -0.105, z: -0.42 }, dmr: { x: 0, y: -0.128, z: -0.48 }, lmg: { x: 0, y: -0.125, z: -0.5 },
  };

  // ---------- init ----------
  A.init = function (cam) {
    camera = cam;
    for (const id of ORDER) state[id] = { ammo: DEFS[id].mag, reserve: DEFS[id].reserve };
    buildViewmodels();
  };
  A.reset = function () {
    for (const id of ORDER) state[id] = { ammo: DEFS[id].mag, reserve: DEFS[id].reserve };
    A.grenades = 2;
    for (const n of A.nades) G.scene.remove(n.mesh);
    A.nades.length = 0;
    for (const r of A.rockets) if (r.mesh) G.scene.remove(r.mesh);
    A.rockets.length = 0;
    for (const b of A.bombs) G.scene.remove(b.mesh);
    A.bombs.length = 0;
    bloom = 0; adsT = 0; reloadT = 0; switchT = 0; fireCd = 0; meleeT = -1;
    A.switchTo('ar', true);
  };
  A.def = () => DEFS[A.currentId];
  A.ads = () => adsT;
  A.reloading = () => reloadT > 0;
  A.setVisible = (v) => { if (vmRoot) vmRoot.visible = v; };
  A.isScoped = () => A.currentId === 'sr' && adsT > 0.8;
  // full loadout restore on respawn — fresh mags, at least default reserves
  A.refill = function () {
    for (const id of ORDER) {
      const def = DEFS[id], st = state[id];
      st.ammo = def.mag;
      st.reserve = Math.max(st.reserve, def.reserve);
    }
    A.grenades = Math.max(A.grenades, 2);
    reloadT = 0;
    fireHeld = false; adsHeld = false;
  };
  A.spreadNow = function () {
    const def = DEFS[A.currentId];
    return (def.spread + bloom) * U.lerp(1, def.adsMul, adsT) * (G.player && G.player.crouching ? 0.75 : 1);
  };

  // ---------- input ----------
  A.fireDown = function () { fireHeld = true; };
  A.fireUp = function () { fireHeld = false; };
  A.adsDown = function () { adsHeld = true; };
  A.adsUp = function () { adsHeld = false; };
  A.lockSwitch = false; // gun game: the ladder decides your weapon, not you
  A.switchTo = function (id, instant) {
    if (!DEFS[id] || (id === A.currentId && !instant)) return;
    if (A.lockSwitch && !instant) return;
    if (instant) {
      models[A.currentId].visible = false;
      A.currentId = id;
      models[id].visible = true;
      models[id].add(muzzleNode);
      switchT = 0; pendingSwitch = null;
      reloadT = 0;
      return;
    }
    pendingSwitch = id;
    switchT = 0.36;
    reloadT = 0;
    G.audio.click();
  };
  A.cycle = function (d) {
    if (A.lockSwitch) return;
    const i = ORDER.indexOf(A.currentId);
    A.switchTo(ORDER[(i + d + ORDER.length) % ORDER.length]);
  };
  // gun game tier-up: hand over the next rung fully loaded
  A.gunTier = function (id) {
    if (!DEFS[id]) return;
    state[id] = { ammo: DEFS[id].mag, reserve: DEFS[id].reserve };
    A.switchTo(id, true);
  };
  A.reload = function () {
    const st = state[A.currentId], def = DEFS[A.currentId];
    if (reloadT > 0 || st.ammo >= def.mag || st.reserve <= 0 || switchT > 0) return;
    reloadT = def.reload;
    G.audio.reload();
  };

  // ---------- firing ----------
  function shoot() {
    const def = DEFS[A.currentId], st = state[A.currentId];
    if (st.ammo <= 0) {
      G.audio.click();
      A.reload();
      fireCd = 0.3;
      return;
    }
    st.ammo--;
    fireCd = def.interval;
    G.player.shotsFired += def.pellets || 1;

    camera.getWorldDirection(camFwd);
    camRight.set(camFwd.z, 0, -camFwd.x).normalize();
    camUp.crossVectors(camRight, camFwd).multiplyScalar(-1);
    rayO.copy(camera.position);

    if (A.currentId === 'rl') {
      fireRocket();
    } else {
      const spreadDeg = (def.spread + bloom) * U.lerp(1, def.adsMul, adsT) * (G.player.crouching ? 0.75 : 1);
      const spread = spreadDeg * Math.PI / 180;
      let hitSomething = false, killedSomething = false, headHit = false, firstHit = null;
      for (let p = 0; p < def.pellets; p++) {
        const ox = U.gauss() * spread, oy = U.gauss() * spread;
        rayD.copy(camFwd).addScaledVector(camRight, ox).addScaledVector(camUp, oy).normalize();
        const hit = G.world.raycast(rayO, rayD, 130, { bots: true, remotes: true, skipTeam: G.player.team });
        if (hit.kind === 'bot') {
          const head = hit.part === 'head';
          const dmg = rangeDmg(def, def.dmg * (head ? def.headMul : 1), hit.t);
          const isClientMP = G.net && G.net.active && !G.net.isHost;
          if (isClientMP) {
            // predicted feedback; host resolves the actual damage
            hit.bot.hurtFx(dmg, rayD, head);
            G.net.evDmgBot(hit.bot.idx, dmg, head, rayD.x, rayD.z, A.currentId === 'sg' ? 'shotgun' : 'shot', hit.t < 7, def.name);
          } else {
            const wasAlive = hit.bot.alive;
            hit.bot.damage(dmg, rayD, {
              head, attacker: 'player',
              cause: A.currentId === 'sg' ? 'shotgun' : 'shot',
              close: hit.t < 7,
              tag: def.name,
              gib: A.currentId === 'sg' && hit.t < 5 && head,
            });
            if (wasAlive && !hit.bot.alive) killedSomething = true;
          }
          G.player.shotsHit++;
          hitSomething = true;
          if (head) headHit = true;
        } else if (hit.kind === 'remote') {
          const head = hit.part === 'head';
          const dmg = rangeDmg(def, def.dmg * (head ? def.headMul : 1), hit.t);
          hit.remote.hurtFx && hit.remote.hurtFx(rayD, head);
          G.net.evDmgP(hit.remote.id, dmg, G.player.pos.x, G.player.pos.z, G.net.myName, G.net.myTeam, def.name);
          G.player.shotsHit++;
          hitSomething = true;
          if (head) headHit = true;
        } else if (hit.kind !== 'none') {
          G.world.applyBulletDamage(hit, def.chunkDmg, rayD, 'player');
        }
        if (hit.kind !== 'none' && !firstHit) firstHit = hit.point.clone();
        if (hit.kind !== 'none' && (p === 0 && Math.random() < 0.6 || Math.random() < 0.25)) {
          muzzleNode.getWorldPosition(tmpV);
          G.fx.tracer(tmpV, hit.point, 0.06);
        }
      }
      if (hitSomething) G.game.hitmarker(killedSomething, headHit);
      if (G.net && G.net.active && firstHit) G.net.evShot(A.currentId, firstHit);
      bloom = Math.min(def.bloomMax, bloom + def.bloomPer);
      // casing
      muzzleNode.getWorldPosition(tmpV);
      tmpV.addScaledVector(camFwd, -0.3);
      G.fx.casing(tmpV, camRight);
    }
    // fx + noise
    muzzleNode.getWorldPosition(tmpV);
    G.fx.muzzle(tmpV, A.currentId === 'sg' ? 0.55 : 0.4);
    muzzleFlashT = 0.05;
    G.audio.shot(def.kind, null);
    G.botMgr.onNoise(G.player.pos, 48);
    G.game.markPlayerRadar();
    // recoil
    kickZ = Math.min(kickZ + 0.045 * def.recoil, 0.14);
    kickRot = Math.min(kickRot + 0.06 * def.recoil, 0.2);
    G.game.addRecoil(0.0042 * def.recoil, U.rand(-0.0012, 0.0012) * def.recoil);
    G.fx.shake(0.14 * def.recoil, 0.12);
  }

  // ---------- rockets (players + rocket bots; visual ghosts for remote peers) ----------
  const rocketGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6);
  rocketGeo.rotateX(Math.PI / 2);
  const rocketMat = new THREE.MeshBasicMaterial({ color: 0x4a5a3a });
  A.spawnRocket = function (from, dir, owner, visual) {
    const mesh = new THREE.Mesh(rocketGeo, rocketMat);
    mesh.position.copy(from);
    G.scene.add(mesh);
    const vel = dir.clone().normalize().multiplyScalar(owner === 'player' ? 38 : 34);
    A.rockets.push({ pos: from.clone(), vel, mesh, t: 0, owner: owner || 'player', visual: !!visual });
    if (!visual && G.net && G.net.active) G.net.evRocket(from, vel);
    return vel;
  };
  function fireRocket() {
    muzzleNode.getWorldPosition(tmpV);
    A.spawnRocket(tmpV, camFwd, 'player');
    G.fx.shake(0.8, 0.3);
  }
  function updateRockets(dt) {
    for (let i = A.rockets.length - 1; i >= 0; i--) {
      const r = A.rockets[i];
      r.t += dt;
      tmpV2.copy(r.pos);
      if (!G.world.zeroG) r.vel.y -= 2.5 * dt;
      r.pos.addScaledVector(r.vel, dt);
      // trail
      tmpV3.lerpVectors(tmpV2, r.pos, Math.random());
      G.fx.rocketTrail(tmpV3);
      const stepLen = tmpV3.subVectors(r.pos, tmpV2).length();
      if (stepLen > 0.001) {
        rayD.copy(tmpV3).multiplyScalar(1 / stepLen);
        const skipT = r.owner && r.owner.group ? r.owner.team : undefined;
        const hit = G.world.raycast(tmpV2, rayD, stepLen, { bots: true, remotes: true, player: r.owner !== 'player', skipBot: r.owner && r.owner.group ? r.owner : undefined });
        if (hit.kind !== 'none' || r.t > 6) {
          const bp = hit.kind !== 'none' ? hit.point : r.pos;
          G.scene.remove(r.mesh);
          A.rockets.splice(i, 1);
          if (!r.visual) {
            // bot rockets hit softer than player rockets — no free one-shots from AI
            const dmg = r.owner === 'player' ? 165 : 118;
            G.world.explode(bp, 6.5, dmg, { attacker: r.owner, tag: r.owner === 'player' ? 'HOA VIOLATION' : 'ROCKET' });
            if (G.net && G.net.active) G.net.evBoom(bp, 6.5, dmg, 'ROCKET');
          }
          continue;
        }
      }
      r.mesh.position.copy(r.pos);
      r.mesh.lookAt(tmpV3.addVectors(r.pos, r.vel));
    }
  }

  // ---------- grenades ----------
  const nadeGeo = new THREE.SphereGeometry(0.11, 6, 5);
  const nadeMat = new THREE.MeshBasicMaterial({ color: 0x3a4a35 });
  A.spawnNade = function (from, vel, owner, visual) {
    const mesh = new THREE.Mesh(nadeGeo, nadeMat);
    mesh.position.copy(from);
    G.scene.add(mesh);
    A.nades.push({ pos: from.clone(), vel: vel.clone(), fuse: 2.7, owner, mesh, dead: false, bounces: 0, visual: !!visual });
    if (!visual && G.net && G.net.active) G.net.evNade(from, vel);
  };
  A.allNades = () => A.nades;
  A.throwNade = function () {
    if (A.grenades <= 0 || !G.player.alive) return;
    A.grenades--;
    camera.getWorldDirection(camFwd);
    tmpV.copy(camera.position).addScaledVector(camFwd, 0.4);
    tmpV2.copy(camFwd).multiplyScalar(14);
    tmpV2.y += 4.5;
    A.spawnNade(tmpV, tmpV2, 'player');
    G.audio.click();
    kickZ += 0.05;
  };
  function updateNades(dt) {
    for (let i = A.nades.length - 1; i >= 0; i--) {
      const n = A.nades[i];
      n.fuse -= dt;
      if (n.fuse <= 0) {
        G.scene.remove(n.mesh);
        A.nades.splice(i, 1);
        if (!n.visual) {
          G.world.explode(n.pos, 5.5, 132, { attacker: n.owner === 'player' ? 'player' : n.owner, tag: 'GRENADE' });
          if (G.net && G.net.active) G.net.evBoom(n.pos, 5.5, 132, 'GRENADE');
        }
        continue;
      }
      if (!G.world.zeroG) n.vel.y -= 14 * dt;
      tmpV2.copy(n.pos);
      tmpV3.copy(n.vel).multiplyScalar(dt);
      const stepLen = tmpV3.length();
      if (stepLen > 0.0001) {
        rayD.copy(tmpV3).multiplyScalar(1 / stepLen);
        const hit = G.world.raycast(tmpV2, rayD, stepLen + 0.12, {});
        if (hit.kind !== 'none' && hit.t <= stepLen + 0.12) {
          // reflect
          const d = n.vel.dot(hit.normal);
          n.vel.addScaledVector(hit.normal, -2 * d);
          n.vel.multiplyScalar(0.42);
          n.pos.copy(hit.point).addScaledVector(hit.normal, 0.13);
          if (n.bounces++ < 3 && stepLen > 0.02) G.audio.bounce(n.pos);
        } else {
          n.pos.add(tmpV3);
        }
      }
      if (!G.world.zeroG && n.pos.y < 0.11) { n.pos.y = 0.11; n.vel.y = Math.abs(n.vel.y) < 1 ? 0 : -n.vel.y * 0.42; n.vel.x *= 0.9; n.vel.z *= 0.9; }
      n.mesh.position.copy(n.pos);
    }
  }

  // ---------- airstrike ----------
  let strikePending = null;
  A.callAirstrike = function () {
    if (!G.player.airstrikeReady) return;
    G.player.airstrikeReady = false;
    camera.getWorldDirection(camFwd);
    rayO.copy(camera.position);
    const hit = G.world.raycast(rayO, camFwd, 200, {});
    const tx = hit.kind !== 'none' ? hit.point.x : G.player.pos.x + camFwd.x * 40;
    const tz = hit.kind !== 'none' ? hit.point.z : G.player.pos.z + camFwd.z * 40;
    const bnd = G.world.bounds;
    strikePending = { x: U.clamp(tx, -bnd.x + 2, bnd.x - 2), z: U.clamp(tz, -bnd.z + 2, bnd.z - 2), t: 2.2, dropped: 0, dropT: 0, mine: true };
    if (G.net && G.net.active) G.net.evStrike(strikePending.x, strikePending.z);
    G.audio.airstrikeCall();
    G.game.banner('AIRSTRIKE INBOUND', '#ffd23e');
    G.game.chat('HQ', 'fast air on the way, keep your head down');
  };
  // a remote player's airstrike — bombs are visual, their owner sends the booms
  A.spawnStrikeVisual = function (x, z, friendly) {
    strikeVisuals.push({ x, z, t: 2.2, dropped: 0, dropT: 0 });
    G.audio.airstrikeCall();
    if (friendly) G.game.banner('FRIENDLY AIRSTRIKE INBOUND', '#7dcfff');
    else G.game.banner('ENEMY AIRSTRIKE INBOUND', '#ff6a4a');
  };
  const strikeVisuals = [];
  const bombGeo = new THREE.CylinderGeometry(0.16, 0.05, 0.9, 6);
  const bombMat = new THREE.MeshBasicMaterial({ color: 0x2e3338 });
  function runStrike(s, dt, visual) {
    s.t -= dt;
    if (s.t < 0.9 && !s.jetPlayed) { s.jetPlayed = true; G.audio.jet(); }
    if (s.t <= 0) {
      s.dropT -= dt;
      if (s.dropT <= 0 && s.dropped < 6) {
        s.dropT = 0.13;
        const mesh = new THREE.Mesh(bombGeo, bombMat);
        const bx = s.x - 15 + s.dropped * 6 + U.rand(-1.5, 1.5);
        const bz = s.z + U.rand(-2.5, 2.5);
        mesh.position.set(bx, 42, bz);
        G.scene.add(mesh);
        A.bombs.push({ mesh, x: bx, z: bz, y: 42, visual });
        s.dropped++;
      }
      return s.dropped >= 6;
    }
    return false;
  }
  function updateAirstrike(dt) {
    if (strikePending && runStrike(strikePending, dt, false)) strikePending = null;
    for (let i = strikeVisuals.length - 1; i >= 0; i--) {
      if (runStrike(strikeVisuals[i], dt, true)) strikeVisuals.splice(i, 1);
    }
    for (let i = A.bombs.length - 1; i >= 0; i--) {
      const b = A.bombs[i];
      b.y -= 46 * dt;
      const gy = G.world.groundHeightAt(b.x, b.z);
      // simple down-ray vs roofs: use raycast when close
      if (b.y < 14 && !b.rayChecked) {
        b.rayChecked = true;
        rayO.set(b.x, b.y, b.z); rayD.set(0, -1, 0);
        const hit = G.world.raycast(rayO, rayD, 50, {});
        b.impactY = hit.kind !== 'none' ? hit.point.y : gy;
      }
      const iy = b.impactY !== undefined ? b.impactY : gy;
      if (b.y < -40) { // sailed past the station into the void
        G.scene.remove(b.mesh);
        A.bombs.splice(i, 1);
        continue;
      }
      if (b.y <= iy + 0.3) {
        G.scene.remove(b.mesh);
        A.bombs.splice(i, 1);
        if (!b.visual) {
          tmpV.set(b.x, iy + 0.3, b.z);
          G.world.explode(tmpV, 7, 160, { attacker: 'player', tag: 'AIRSTRIKE' });
          if (G.net && G.net.active) G.net.evBoom(tmpV, 7, 160, 'AIRSTRIKE');
        }
        continue;
      }
      b.mesh.position.set(b.x, b.y, b.z);
    }
  }

  // ---------- melee ----------
  A.melee = function () {
    if (meleeCd > 0 || !G.player.alive) return;
    meleeCd = 0.6;
    meleeT = 0;
    G.audio.melee();
    camera.getWorldDirection(camFwd);
    rayO.copy(camera.position);
    const hit = G.world.raycast(rayO, camFwd, 2.3, { bots: true, remotes: true, skipTeam: G.player.team });
    if (hit.kind === 'bot') {
      if (G.net && G.net.active && !G.net.isHost) {
        hit.bot.hurtFx(60, camFwd, false);
        G.net.evDmgBot(hit.bot.idx, 60, false, camFwd.x, camFwd.z, 'melee', true, 'KNIFE');
        G.game.hitmarker(false, false);
      } else {
        hit.bot.damage(60, camFwd, { attacker: 'player', cause: 'melee', tag: 'KNIFE', close: true });
        G.game.hitmarker(!hit.bot.alive, false);
      }
      G.fx.shake(0.4, 0.15);
    } else if (hit.kind === 'remote') {
      hit.remote.hurtFx && hit.remote.hurtFx(camFwd, false);
      G.net.evDmgP(hit.remote.id, 60, G.player.pos.x, G.player.pos.z, G.net.myName, G.net.myTeam, 'KNIFE');
      G.game.hitmarker(false, false);
      G.fx.shake(0.4, 0.15);
    } else if (hit.kind !== 'none') {
      G.world.applyBulletDamage(hit, 45, camFwd, 'player');
      G.fx.shake(0.3, 0.12);
    }
  };

  // ---------- kill rewards ----------
  A.onKillReward = function (kills) {
    state.ar.reserve = Math.min(300, state.ar.reserve + 12);
    state.sg.reserve = Math.min(60, state.sg.reserve + 3);
    state.sr.reserve = Math.min(40, state.sr.reserve + 2);
    state.rev.reserve = Math.min(48, state.rev.reserve + 3);
    state.smg.reserve = Math.min(260, state.smg.reserve + 12);
    state.dmr.reserve = Math.min(72, state.dmr.reserve + 4);
    state.lmg.reserve = Math.min(240, state.lmg.reserve + 20);
    if (kills % 2 === 0) {
      state.rl.reserve = Math.min(8, state.rl.reserve + 1);
      A.grenades = Math.min(3, A.grenades + 1);
    }
  };

  // ---------- per-frame ----------
  A.update = function (dt) {
    fireCd -= dt;
    meleeCd -= dt;
    const def = DEFS[A.currentId], st = state[A.currentId];
    // switching
    if (switchT > 0) {
      switchT -= dt;
      if (pendingSwitch && switchT <= 0.18 && A.currentId !== pendingSwitch) {
        models[A.currentId].visible = false;
        A.currentId = pendingSwitch;
        models[A.currentId].visible = true;
        models[A.currentId].add(muzzleNode);
      }
      if (switchT <= 0) pendingSwitch = null;
    }
    // reload
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0) {
        const need = def.mag - st.ammo;
        const take = Math.min(need, st.reserve);
        st.ammo += take; st.reserve -= take;
      }
    }
    // ADS
    const wantAds = adsHeld && reloadT <= 0 && switchT <= 0 && !G.player.sprinting && G.player.alive;
    adsT = U.damp(adsT, wantAds ? 1 : 0, 14, dt);
    // bloom decay
    bloom = Math.max(0, bloom - dt * 4.2);
    // auto fire (sprinting doesn't stop the trigger finger)
    if (fireHeld && G.player.alive && fireCd <= 0 && reloadT <= 0 && switchT <= 0) {
      if (def.auto || !state._clicked) {
        if (A.currentId === 'rl') {
          if (st.ammo > 0) { st.ammo--; shootRLWrap(); fireCd = def.interval; reloadT = st.reserve > 0 ? def.reload : 0; if (st.reserve > 0) { st.reserve--; st.ammo = 1; } }
          else G.audio.click(), fireCd = 0.4;
        } else shoot();
      }
    }
    function shootRLWrap() {
      camera.getWorldDirection(camFwd);
      camRight.set(camFwd.z, 0, -camFwd.x).normalize();
      rayO.copy(camera.position);
      fireRocket();
      muzzleNode.getWorldPosition(tmpV);
      G.fx.muzzle(tmpV, 0.7);
      G.audio.shot('rl', null);
      G.botMgr.onNoise(G.player.pos, 55);
      G.game.markPlayerRadar();
      G.game.addRecoil(0.02, 0.004);
      G.player.shotsFired++;
    }
    updateRockets(dt);
    updateNades(dt);
    updateAirstrike(dt);
    updateViewmodel(dt);
  };

  // ---------- viewmodel animation ----------
  function updateViewmodel(dt) {
    if (!vmRoot) return;
    const P = G.player;
    const m = models[A.currentId];
    // bob
    const speed = Math.hypot(P.vel.x, P.vel.z);
    bobPhase += dt * Math.min(speed, 8) * 1.6;
    const bobA = U.clamp(speed / 6, 0, 1) * (P.onGround ? 1 : 0.2) * (1 - adsT * 0.85);
    const bobX = Math.sin(bobPhase) * 0.014 * bobA;
    const bobY = -Math.abs(Math.cos(bobPhase)) * 0.012 * bobA;
    // sway from look input
    swayX = U.damp(swayX, U.clamp(-G.game.lookDX * 0.0016, -0.05, 0.05), 9, dt);
    swayY = U.damp(swayY, U.clamp(G.game.lookDY * 0.0016, -0.04, 0.04), 9, dt);
    // kick recovery
    kickZ = U.damp(kickZ, 0, 11, dt);
    kickRot = U.damp(kickRot, 0, 11, dt);
    const ads = ADS[A.currentId];
    const px = U.lerp(HIP.x, ads.x, adsT) + bobX + swayX;
    const py = U.lerp(HIP.y, ads.y, adsT) + bobY + swayY;
    const pz = U.lerp(HIP.z, ads.z, adsT) + kickZ;
    m.position.set(px, py, pz);
    let rx = kickRot * 0.5, ry = 0, rz = 0;
    // sprint pose (gun levels while firing so you can run and gun)
    const sprintPose = P.sprinting && P.onGround && speed > 4 && !fireHeld ? 1 : 0;
    m.userData.sprintT = U.damp(m.userData.sprintT || 0, sprintPose, 8, dt);
    const sp = m.userData.sprintT;
    rx += sp * 0.5; ry += sp * 0.45; rz += sp * 0.15;
    m.position.y -= sp * 0.08;
    m.position.x -= sp * 0.06;
    // reload dip
    if (reloadT > 0) {
      const def = DEFS[A.currentId];
      const rt = 1 - reloadT / def.reload;
      const dip = Math.sin(Math.min(rt * 1.25, 1) * Math.PI);
      rx += dip * 0.7; m.position.y -= dip * 0.12;
      if (m.userData.mag) m.userData.mag.position.y = -0.13 - dip * 0.25;
    } else if (m.userData.mag) m.userData.mag.position.y = -0.13;
    // shotgun pump
    if (m.userData.pump) {
      const sgInt = DEFS.sg.interval;
      const pumpK = A.currentId === 'sg' && fireCd > sgInt * 0.34 ? Math.sin(U.clamp((sgInt - fireCd) * (5.3 / sgInt * 0.88), 0, Math.PI)) : 0;
      m.userData.pump.position.z = -0.3 + pumpK * 0.12;
    }
    // switch raise/lower
    if (switchT > 0) {
      const k = Math.sin((switchT / 0.36) * Math.PI);
      m.position.y -= k * 0.3;
      rx += k * 0.8;
    }
    // melee swing
    if (meleeT >= 0) {
      meleeT += dt;
      const mt = meleeT / 0.28;
      if (mt >= 1) meleeT = -1;
      else {
        const sw = Math.sin(mt * Math.PI);
        rz -= sw * 0.9;
        rx += sw * 0.4;
        m.position.x -= sw * 0.15;
        m.position.z -= sw * 0.18;
      }
    }
    m.rotation.set(rx, ry, rz);
  }

  return A;
})();
