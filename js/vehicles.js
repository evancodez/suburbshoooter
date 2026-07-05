// vehicles.js — drivable jeeps + helicopters (arcade physics, destructible)
// Vehicles are map furniture until someone hops in (V). Drivers are local-
// authoritative and broadcast state; damage is host-authoritative like bots.
G.veh = (function () {
  const V = { list: [], mine: null };
  const tmpV = new THREE.Vector3();
  const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();

  const KINDS = {
    jeep: { name: 'JEEP', hp: 280, accel: 15, maxSpd: 17, revSpd: -6.5, turn: 2.3, radius: 1.35, seatH: 1.25, height: 2.0 },
    heli: { name: 'HELI', hp: 340, accel: 13, maxSpd: 21, lift: 8, turn: 2.0, radius: 1.8, seatH: 1.1, height: 2.6, ceil: 44 },
  };

  // ---------- meshes ----------
  function box(w, h, d, mat) { return new THREE.Mesh(U.shadedBoxGeo(w, h, d), mat); }
  function jeepMesh(tint) {
    const mBody = new THREE.MeshBasicMaterial({ map: T.camo(), vertexColors: true, color: tint });
    const mDark = new THREE.MeshBasicMaterial({ map: T.gunmetal(), vertexColors: true, color: 0x53565c });
    const mGlass = new THREE.MeshBasicMaterial({ map: T.carGlass(), vertexColors: true, transparent: true, opacity: 0.75 });
    const g = new THREE.Group();
    const hull = box(1.9, 0.75, 3.3, mBody); hull.position.y = 0.85; g.add(hull);
    const hood = box(1.7, 0.35, 1.0, mBody); hood.position.set(0, 1.05, -1.4); g.add(hood);
    const cabin = box(1.7, 0.7, 1.5, mBody); cabin.position.set(0, 1.55, 0.35); g.add(cabin);
    const shield = box(1.5, 0.55, 0.08, mGlass); shield.position.set(0, 1.6, -0.45); shield.rotation.x = -0.18; g.add(shield);
    const bar = box(1.9, 0.5, 0.16, mDark); bar.position.set(0, 0.75, -1.78); g.add(bar); // bull bar
    for (const [wx, wz] of [[-0.95, -1.15], [0.95, -1.15], [-0.95, 1.15], [0.95, 1.15]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), mDark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      g.add(wheel);
    }
    return g;
  }
  function heliMesh(tint) {
    const mBody = new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: tint });
    const mDark = new THREE.MeshBasicMaterial({ map: T.gunmetal(), vertexColors: true, color: 0x484c52 });
    const mGlass = new THREE.MeshBasicMaterial({ map: T.carGlass(), vertexColors: true, transparent: true, opacity: 0.7 });
    const g = new THREE.Group();
    const cab = box(1.9, 1.5, 2.6, mBody); cab.position.set(0, 1.4, -0.4); g.add(cab);
    const nose = box(1.4, 1.0, 0.8, mGlass); nose.position.set(0, 1.45, -1.9); g.add(nose);
    const tail = box(0.5, 0.5, 2.8, mBody); tail.position.set(0, 1.7, 2.2); g.add(tail);
    const fin = box(0.14, 1.0, 0.7, mBody); fin.position.set(0, 2.3, 3.4); g.add(fin);
    const tailRotor = box(0.06, 1.1, 0.16, mDark); tailRotor.position.set(0.14, 2.3, 3.55); g.add(tailRotor);
    for (const sx of [-0.9, 0.9]) {
      const skid = box(0.16, 0.14, 3.0, mDark); skid.position.set(sx, 0.2, -0.2); g.add(skid);
      const strut = box(0.1, 0.6, 0.1, mDark); strut.position.set(sx, 0.6, -0.5); g.add(strut);
    }
    const mast = box(0.16, 0.5, 0.16, mDark); mast.position.set(0, 2.35, -0.4); g.add(mast);
    const rotor = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const blade = box(0.3, 0.05, 4.6, mDark);
      blade.position.z = 0;
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.y = (b / 3) * Math.PI * 2;
      rotor.add(arm);
    }
    rotor.position.set(0, 2.65, -0.4);
    g.add(rotor);
    g.userData.rotor = rotor;
    g.userData.tailRotor = tailRotor;
    return g;
  }

  // ---------- lifecycle ----------
  V.reset = function () {
    for (const v of V.list) {
      if (v.mesh) {
        G.scene.remove(v.mesh);
        v.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
      }
      if (v.col) v.col.gone = true;
    }
    V.list.length = 0;
    V.mine = null;
    const spawns = G.world.vehicleSpawns || [];
    const tints = [0x5a7a4a, 0x7a6a3a, 0x4a6a8a, 0x8a5a3a, 0x6a6a6a, 0x5a4a7a];
    spawns.forEach((s, i) => {
      const def = KINDS[s.kind];
      if (!def) return;
      const mesh = s.kind === 'heli' ? heliMesh(0x3f6f8f) : jeepMesh(tints[i % tints.length]);
      const y = G.world.standHeightAt(s.x, s.z, 3);
      mesh.position.set(s.x, y, s.z);
      mesh.rotation.y = s.yaw || 0;
      G.scene.add(mesh);
      const v = {
        i, kind: s.kind, def,
        pos: new THREE.Vector3(s.x, y, s.z),
        yaw: s.yaw || 0, speed: 0, vy: 0,
        fwd: 0, // heli forward velocity
        hp: def.hp, dead: false,
        driver: null, // null | 'me' | remote pid
        mesh, smokeT: 0, rotorSpd: 0,
        netX: s.x, netY: y, netZ: s.z, netYaw: s.yaw || 0,
        col: G.world.registerMovingBox({
          minx: s.x - def.radius, miny: y, minz: s.z - def.radius,
          maxx: s.x + def.radius, maxy: y + def.height, maxz: s.z + def.radius,
          metal: true,
        }),
      };
      v.col.veh = v;
      V.list.push(v);
    });
  };

  function syncCol(v) {
    const r = v.def.radius;
    v.col.minx = v.pos.x - r; v.col.maxx = v.pos.x + r;
    v.col.minz = v.pos.z - r; v.col.maxz = v.pos.z + r;
    v.col.miny = v.pos.y; v.col.maxy = v.pos.y + v.def.height;
  }

  // ---------- enter / exit ----------
  V.tryToggle = function () {
    const P = G.player;
    if (!P || !P.alive) return;
    if (V.mine) { // hop out
      const v = V.mine;
      const side = tmpV.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(v.def.radius + 1.1);
      P.pos.set(v.pos.x + side.x, v.pos.y + 0.1, v.pos.z + side.z);
      P.pos.y = G.world.standHeightAt(P.pos.x, P.pos.z, P.pos.y + 1);
      P.vel.set(0, 0, 0);
      v.driver = null;
      V.mine = null;
      if (G.net && G.net.active) G.net.evVeh(v);
      return;
    }
    let best = null, bestD = 3.4;
    for (const v of V.list) {
      if (v.dead || v.driver) continue;
      const d = U.dist2d(P.pos.x, P.pos.z, v.pos.x, v.pos.z);
      if (d < bestD && Math.abs(P.pos.y - v.pos.y) < 3) { bestD = d; best = v; }
    }
    if (best) {
      best.driver = 'me';
      V.mine = best;
      best.speed = 0; best.vy = 0; best.fwd = 0;
      G.arsenal.fireUp(); G.arsenal.adsUp();
      if (G.net && G.net.active) G.net.evVeh(best);
      G.game.banner((best.kind === 'heli' ? 'HELICOPTER' : 'JEEP') + ' — [V] TO BAIL', '#7dcfff');
    }
  };

  // ---------- damage ----------
  V.damage = function (v, dmg, attacker) {
    if (v.dead) return;
    if (G.net && G.net.active && !G.net.isHost) { G.net.evVehDmg(v.i, dmg); return; } // host resolves
    v.hp -= dmg;
    if (G.net && G.net.active) G.net.evVehHp(v.i, v.hp);
    if (v.hp <= 0) V.explode(v, attacker);
  };
  V.explode = function (v, attacker) {
    if (v.dead) return;
    v.dead = true;
    v.col.gone = true;
    if (v.driver === 'me') { V.mine = null; }
    if (G.net && G.net.active && G.net.isHost) G.net.evVehBoom(v.i);
    tmpV.copy(v.pos); tmpV.y += 1;
    G.world.explode(tmpV, 6, 145, { attacker: attacker || { name: 'THE ' + v.def.name, team: -1 }, tag: v.def.name });
    if (v.mesh) { G.scene.remove(v.mesh); }
    for (let i = 0; i < 6; i++) {
      G.fx.debris(tmpV, new THREE.Vector3(U.rand(-5, 5), U.rand(3, 8), U.rand(-5, 5)), U.rand(0.4, 0.9), 0.3, U.rand(0.4, 0.9), new THREE.Color(0x2e2e30), 8);
    }
  };
  // client-side application (from host broadcasts)
  V.applyHp = function (i, hp) { const v = V.list[i]; if (v) v.hp = hp; };
  V.applyBoom = function (i) {
    const v = V.list[i];
    if (v && !v.dead) { v.hp = 0; v.dead = true; v.col.gone = true; if (v.driver === 'me') V.mine = null;
      tmpV.copy(v.pos); tmpV.y += 1;
      if (v.mesh) G.scene.remove(v.mesh);
      G.fx.explosionFX(tmpV, 6); G.audio.explosion(tmpV, true);
    }
  };
  V.applyState = function (i, msg) {
    const v = V.list[i];
    if (!v || v.dead) return;
    v.driver = msg.drv || null;
    if (v.driver && v.driver !== 'me') { v.netX = msg.x; v.netY = msg.y; v.netZ = msg.z; v.netYaw = msg.yw; }
  };

  // ---------- driving physics ----------
  function ramCheck(v, dt) {
    // the bull bar is the best gun on the map: smash chunks, props and cars
    if (Math.abs(v.speed) < 7) return;
    const dir = Math.sign(v.speed) || 1;
    const fx = -Math.sin(v.yaw) * dir, fz = -Math.cos(v.yaw) * dir;
    rayO.set(v.pos.x, v.pos.y + 0.9, v.pos.z);
    rayD.set(fx, 0, fz);
    const hit = G.world.raycast(rayO, rayD, v.def.radius + 1.4, {});
    if (hit.kind === 'chunk' || hit.kind === 'glass') {
      for (const dr of [-1, 0, 1]) {
        const r2 = hit.r + dr;
        if (r2 >= 0 && r2 < hit.wall.rows) {
          G.world.damageChunk(hit.wall, hit.c, r2, 95);
          if (hit.c + 1 < hit.wall.cols) G.world.damageChunk(hit.wall, hit.c + 1, r2, 95);
        }
      }
      v.speed *= 0.62;
      G.fx.shake(0.4, 0.25);
      G.audio.thud(v.pos);
    } else if (hit.kind === 'prop' && hit.collider) {
      G.world.damageProp(hit.collider.prop, 160, v.driver === 'me' ? 'player' : null);
      v.speed *= 0.8;
    } else if (hit.kind === 'car' && hit.collider) {
      G.world.damageCar(hit.collider.car, 80, v.driver === 'me' ? 'player' : null);
      v.speed *= 0.7;
    }
    // roadkill
    for (const b of G.botMgr.bots) {
      if (!b.alive) continue;
      const bp = b.group.position;
      if (U.dist2d(v.pos.x, v.pos.z, bp.x, bp.z) < v.def.radius + 0.9 && Math.abs(bp.y - v.pos.y) < 2) {
        tmpV.set(fx, 0.4, fz).normalize();
        b.damage(95, tmpV, { attacker: v.driver === 'me' ? 'player' : { name: 'A ' + v.def.name, team: -1 }, cause: 'explosion', tag: 'ROADKILL' });
      }
    }
  }
  function driveJeep(v, dt, keys) {
    const def = v.def;
    const thr = keys.KeyW ? 1 : keys.KeyS ? -1 : 0;
    if (thr > 0) v.speed = Math.min(def.maxSpd, v.speed + def.accel * dt);
    else if (thr < 0) v.speed = Math.max(def.revSpd, v.speed - def.accel * 0.8 * dt);
    else v.speed *= Math.pow(0.35, dt); // coast down
    const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
    v.yaw += steer * def.turn * dt * U.clamp(Math.abs(v.speed) / 6, 0, 1) * Math.sign(v.speed || 1);
    ramCheck(v, dt);
    v.pos.x += -Math.sin(v.yaw) * v.speed * dt;
    v.pos.z += -Math.cos(v.yaw) * v.speed * dt;
    v.col.gone = true; // don't collide with ourselves
    const before = tmpV.set(v.pos.x, 0, v.pos.z);
    G.world.collideCircle(v.pos, def.radius, v.pos.y, 2.0, 0.7);
    v.col.gone = v.dead;
    if (U.dist2d(before.x, before.z, v.pos.x, v.pos.z) > 0.05) v.speed *= 0.75; // scraped something
    const g = G.world.standHeightAt(v.pos.x, v.pos.z, v.pos.y + 1.2);
    v.pos.y = U.damp(v.pos.y, g, 12, dt);
  }
  function driveHeli(v, dt, keys) {
    const def = v.def;
    v.rotorSpd = U.damp(v.rotorSpd, 22, 2, dt);
    const up = (keys.Space ? 1 : 0) - ((keys.ShiftLeft || keys.ShiftRight || keys.KeyC) ? 1 : 0);
    v.vy = U.damp(v.vy, up * def.lift, 4, dt);
    const thr = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    v.fwd = U.damp(v.fwd, thr * def.maxSpd, 2.2, dt);
    const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
    v.yaw += steer * def.turn * dt;
    v.pos.x += -Math.sin(v.yaw) * v.fwd * dt;
    v.pos.z += -Math.cos(v.yaw) * v.fwd * dt;
    v.pos.y += v.vy * dt;
    v.col.gone = true;
    G.world.collideCircle(v.pos, def.radius, v.pos.y, 2.2, 0.4);
    v.col.gone = v.dead;
    const floor = G.world.standHeightAt(v.pos.x, v.pos.z, v.pos.y + 0.5);
    if (v.pos.y < floor) { v.pos.y = floor; v.vy = 0; }
    if (v.pos.y > def.ceil) { v.pos.y = def.ceil; v.vy = Math.min(0, v.vy); }
    const b = G.world.bounds;
    v.pos.x = U.clamp(v.pos.x, -b.x, b.x);
    v.pos.z = U.clamp(v.pos.z, -b.z, b.z);
    // rotor wash tilt
    v.mesh.rotation.x = U.damp(v.mesh.rotation.x, thr * -0.12, 6, dt);
  }

  // ---------- per-frame ----------
  V.update = function (dt, keys) {
    for (const v of V.list) {
      if (v.dead) continue;
      if (v.driver === 'me') {
        if (v.kind === 'heli') driveHeli(v, dt, keys || {});
        else driveJeep(v, dt, keys || {});
      } else if (v.driver) { // remote driver: interpolate
        v.pos.x = U.damp(v.pos.x, v.netX, 12, dt);
        v.pos.y = U.damp(v.pos.y, v.netY, 12, dt);
        v.pos.z = U.damp(v.pos.z, v.netZ, 12, dt);
        let dy = v.netYaw - v.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        v.yaw += dy * Math.min(1, 12 * dt);
        if (v.kind === 'heli') v.rotorSpd = U.damp(v.rotorSpd, 22, 2, dt);
      } else {
        // parked: settle to the ground, rotor winds down
        const g = G.world.standHeightAt(v.pos.x, v.pos.z, v.pos.y + 0.5);
        if (v.pos.y > g + 0.02) v.pos.y = Math.max(g, v.pos.y - 9 * dt);
        v.rotorSpd = U.damp(v.rotorSpd, 0, 1.2, dt);
        if (v.kind === 'heli') v.mesh.rotation.x = U.damp(v.mesh.rotation.x, 0, 4, dt);
      }
      syncCol(v);
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.y = v.yaw + Math.PI; // meshes face +z, forward is -z convention
      if (v.mesh.userData.rotor) {
        v.mesh.userData.rotor.rotation.y += v.rotorSpd * dt;
        v.mesh.userData.tailRotor.rotation.x += v.rotorSpd * 2.2 * dt;
      }
      // hurt vehicles smoke
      if (v.hp < v.def.hp * 0.38) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = 0.28;
          tmpV.copy(v.pos); tmpV.y += 1.6;
          G.fx.addEmitter({ pos: tmpV.clone(), rate: 20, kind: 'smoke', dur: 0.2 });
        }
      }
    }
    // chauffeur the player
    if (V.mine) {
      const v = V.mine;
      G.player.pos.set(v.pos.x, v.pos.y + v.def.seatH - 1.62 + 0.6, v.pos.z);
      G.player.vel.set(0, 0, 0);
      G.player.onGround = true;
    }
  };

  V.driving = () => !!V.mine;
  return V;
})();
