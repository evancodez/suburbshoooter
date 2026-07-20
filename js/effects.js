// effects.js — particles, decals, debris physics, gore, explosion FX
G.fx = (function () {
  const FX = {};
  let scene, camQ;
  const dummy = new THREE.Object3D();
  const tmpQ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  FX.quality = 1; // auto-scaled

  // ============ Billboard particle pool (one InstancedMesh per texture) ============
  function BillboardPool(texture, cap, opts) {
    opts = opts || {};
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide, alphaTest: 0.02,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.renderOrder = opts.renderOrder || 10;
    dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    scene.add(mesh);
    const P = {
      mesh, cap, n: 0,
      px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap),
      vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap),
      grav: new Float32Array(cap), s0: new Float32Array(cap), s1: new Float32Array(cap),
      rot: new Float32Array(cap), rv: new Float32Array(cap),
      life: new Float32Array(cap), age: new Float32Array(cap),
      cr: new Float32Array(cap), cg: new Float32Array(cap), cb: new Float32Array(cap),
      flags: new Uint8Array(cap), // 1 = splat on ground death, 2 = blood trail
      head: 0,
    };
    P.spawn = function (x, y, z, vx, vy, vz, grav, s0, s1, life, r, g, b, flag) {
      const i = P.head; P.head = (P.head + 1) % cap;
      P.px[i] = x; P.py[i] = y; P.pz[i] = z;
      P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
      P.grav[i] = grav; P.s0[i] = s0; P.s1[i] = s1;
      P.life[i] = life; P.age[i] = 0.0001;
      P.rot[i] = U.rand(0, 6.28); P.rv[i] = U.rand(-4, 4);
      P.cr[i] = r; P.cg[i] = g; P.cb[i] = b;
      P.flags[i] = flag || 0;
      return i;
    };
    P.update = function (dt) {
      let any = false;
      const col = new THREE.Color();
      const zg = G.world && G.world.zeroG; // space: things scatter, they don't fall
      for (let i = 0; i < cap; i++) {
        if (P.age[i] <= 0) continue;
        any = true;
        P.age[i] += dt;
        if (P.age[i] >= P.life[i]) {
          if (!zg && P.flags[i] === 1 && P.py[i] < 2.2) FX.decal('splat', P.px[i], 0.02, P.pz[i], null, U.rand(0.25, 0.6));
          P.age[i] = 0;
          dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
          P.mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        P.vy[i] -= P.grav[i] * dt * (zg ? 0.03 : 1);
        P.px[i] += P.vx[i] * dt; P.py[i] += P.vy[i] * dt; P.pz[i] += P.vz[i] * dt;
        if (!zg && P.py[i] < 0.03 && P.vy[i] < 0) {
          if (P.flags[i] === 1) { // blood drop lands -> splat decal
            FX.decal('splat', P.px[i], 0.02, P.pz[i], null, U.rand(0.2, 0.55));
            P.age[i] = 0;
            dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
            P.mesh.setMatrixAt(i, dummy.matrix);
            continue;
          }
          P.py[i] = 0.03; P.vy[i] *= -0.3; P.vx[i] *= 0.6; P.vz[i] *= 0.6;
        }
        P.rot[i] += P.rv[i] * dt;
        const t = P.age[i] / P.life[i];
        let s = U.lerp(P.s0[i], P.s1[i], t);
        if (!opts.additive && t > 0.75) s *= 1 - (t - 0.75) / 0.25; // shrink-out
        dummy.position.set(P.px[i], P.py[i], P.pz[i]);
        dummy.quaternion.copy(camQ);
        tmpQ.setFromAxisAngle(zAxis, P.rot[i]);
        dummy.quaternion.multiply(tmpQ);
        dummy.scale.setScalar(Math.max(s, 0.001));
        dummy.updateMatrix();
        P.mesh.setMatrixAt(i, dummy.matrix);
        let fade = opts.additive ? (1 - t) : 1;
        col.setRGB(P.cr[i] * fade, P.cg[i] * fade, P.cb[i] * fade);
        P.mesh.setColorAt(i, col);
      }
      if (any) { P.mesh.instanceMatrix.needsUpdate = true; if (P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true; }
    };
    return P;
  }

  // ============ Decal pool (flat quads on surfaces) ============
  function DecalPool(texture, cap, colorize) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, dummy.matrix); if (colorize) mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    const D = {
      mesh, cap, head: 0, grow: [],
      px: new Float32Array(cap).fill(-9999), py: new Float32Array(cap), pz: new Float32Array(cap),
    };
    const up = new THREE.Vector3(0, 1, 0);
    D.spawn = function (x, y, z, normal, size, tint) {
      const i = D.head; D.head = (D.head + 1) % cap;
      dummy.position.set(x, y, z);
      if (!normal || (Math.abs(normal.y) > 0.7)) {
        dummy.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        dummy.position.y = Math.max(y, 0.02) + (i % 8) * 0.0012;
      } else {
        tmpQ.setFromUnitVectors(zAxis, normal);
        dummy.quaternion.copy(tmpQ);
        dummy.position.addScaledVector(normal, 0.03 + (i % 8) * 0.004);
      }
      tmpQ.setFromAxisAngle(zAxis, U.rand(0, 6.28));
      dummy.quaternion.multiply(tmpQ);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      D.mesh.setMatrixAt(i, dummy.matrix);
      D.px[i] = dummy.position.x; D.py[i] = dummy.position.y; D.pz[i] = dummy.position.z;
      if (D.mesh.instanceColor && tint) { D.mesh.setColorAt(i, tint); D.mesh.instanceColor.needsUpdate = true; }
      D.mesh.instanceMatrix.needsUpdate = true;
      return i;
    };
    // surface got destroyed → its decals must not haunt the air where it stood
    D.clearBox = function (x0, y0, z0, x1, y1, z1) {
      let touched = false;
      for (let i = 0; i < cap; i++) {
        if (D.px[i] < x0 || D.px[i] > x1 || D.py[i] < y0 || D.py[i] > y1 || D.pz[i] < z0 || D.pz[i] > z1) continue;
        D.px[i] = -9999;
        dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        D.mesh.setMatrixAt(i, dummy.matrix);
        touched = true;
      }
      if (touched) D.mesh.instanceMatrix.needsUpdate = true;
    };
    return D;
  }

  // ============ Debris (physical chunks) ============
  const DEBRIS_CAP = 1400; // big enough that chain explosions don't eat their own rubble
  let debris;
  function initDebris() {
    const geo = U.shadedBoxGeo(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true });
    const mesh = new THREE.InstancedMesh(geo, mat, DEBRIS_CAP);
    mesh.frustumCulled = false;
    dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
    for (let i = 0; i < DEBRIS_CAP; i++) { mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    scene.add(mesh);
    debris = {
      mesh, head: 0,
      pos: [], vel: [], ang: [], quat: [], size: [], life: [], age: [], asleep: [], bloody: [],
    };
    for (let i = 0; i < DEBRIS_CAP; i++) {
      debris.pos.push(new THREE.Vector3()); debris.vel.push(new THREE.Vector3());
      debris.ang.push(new THREE.Vector3()); debris.quat.push(new THREE.Quaternion());
      debris.size.push(new THREE.Vector3(1, 1, 1));
      debris.life.push(0); debris.age.push(0); debris.asleep.push(false); debris.bloody.push(false);
    }
  }
  FX.debris = function (pos, vel, sx, sy, sz, color, life, bloody) {
    const d = debris;
    // find a genuinely free slot first — never overwrite a chunk that's still
    // tumbling through the air (that's the "my rubble just vanished" bug).
    // If truly full, steal the oldest chunk already asleep on the ground.
    let i = -1;
    for (let k = 0; k < DEBRIS_CAP; k++) {
      const j = (d.head + k) % DEBRIS_CAP;
      if (d.age[j] <= 0) { i = j; break; }
    }
    if (i < 0) {
      let bestAge = -1;
      for (let j = 0; j < DEBRIS_CAP; j++) {
        if (d.asleep[j] && d.age[j] > bestAge) { bestAge = d.age[j]; i = j; }
      }
      if (i < 0) i = d.head;
    }
    d.head = (i + 1) % DEBRIS_CAP;
    d.pos[i].copy(pos);
    d.vel[i].copy(vel);
    d.ang[i].set(U.rand(-6, 6), U.rand(-6, 6), U.rand(-6, 6));
    d.quat[i].set(0, 0, 0, 1);
    d.size[i].set(sx, sy, sz);
    d.life[i] = life || U.rand(7, 12);
    d.age[i] = 0.0001;
    d.asleep[i] = false;
    d.bloody[i] = !!bloody;
    d.mesh.setColorAt(i, color);
    if (d.mesh.instanceColor) d.mesh.instanceColor.needsUpdate = true;
    return i;
  };
  const eul = new THREE.Euler();
  function updateDebris(dt) {
    const d = debris;
    let any = false;
    for (let i = 0; i < DEBRIS_CAP; i++) {
      if (d.age[i] <= 0) continue;
      any = true;
      d.age[i] += dt;
      if (d.age[i] >= d.life[i]) {
        d.age[i] = 0;
        dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
        d.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      if (!d.asleep[i]) {
        const zg = G.world && G.world.zeroG;
        if (zg) {
          // zero-g: chunks tumble off into space, slowly bleeding speed
          d.pos[i].addScaledVector(d.vel[i], dt);
          d.vel[i].multiplyScalar(Math.pow(0.86, dt));
        } else {
          d.vel[i].y -= 16 * dt;
          d.pos[i].addScaledVector(d.vel[i], dt);
          const floorY = G.world ? G.world.groundHeightAt(d.pos[i].x, d.pos[i].z, d.pos[i].y) : 0;
          const half = d.size[i].y * 0.5;
          if (d.pos[i].y - half < floorY && d.vel[i].y < 0) {
            d.pos[i].y = floorY + half;
            d.vel[i].y *= -U.rand(0.25, 0.42);
            d.vel[i].x *= 0.62; d.vel[i].z *= 0.62;
            d.ang[i].multiplyScalar(0.5);
            if (d.bloody[i]) FX.decal('splat', d.pos[i].x, floorY + 0.02, d.pos[i].z, null, U.rand(0.3, 0.7));
            if (Math.abs(d.vel[i].y) < 0.9) {
              d.vel[i].set(0, 0, 0); d.ang[i].set(0, 0, 0); d.asleep[i] = true;
              d.pos[i].y = floorY + half * U.rand(0.75, 1);
            }
          }
        }
        eul.set(d.ang[i].x * dt, d.ang[i].y * dt, d.ang[i].z * dt);
        tmpQ.setFromEuler(eul);
        d.quat[i].multiply(tmpQ);
        if (d.bloody[i] && Math.random() < 0.35) {
          FX.blood.spawn(d.pos[i].x, d.pos[i].y, d.pos[i].z, U.rand(-1, 1), U.rand(-1, 0), U.rand(-1, 1), zg ? 0.3 : 9, 0.14, 0.05, 0.7, 0.7, 0.03, 0.03, 1);
        }
      }
      const t = d.age[i] / d.life[i];
      const sc = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
      dummy.position.copy(d.pos[i]);
      dummy.quaternion.copy(d.quat[i]);
      dummy.scale.set(d.size[i].x * sc, d.size[i].y * sc, d.size[i].z * sc);
      dummy.updateMatrix();
      d.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (any) d.mesh.instanceMatrix.needsUpdate = true;
  }

  // ============ Tracers ============
  const TRACER_CAP = 24;
  let tracers;
  function initTracers() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, TRACER_CAP);
    mesh.frustumCulled = false; mesh.renderOrder = 11;
    dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
    for (let i = 0; i < TRACER_CAP; i++) mesh.setMatrixAt(i, dummy.matrix);
    scene.add(mesh);
    tracers = { mesh, head: 0, age: new Float32Array(TRACER_CAP), life: new Float32Array(TRACER_CAP), mats: [] };
    for (let i = 0; i < TRACER_CAP; i++) tracers.mats.push(new THREE.Matrix4());
  }
  const tmpV1 = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  FX.tracer = function (from, to, life) {
    const tr = tracers;
    const i = tr.head; tr.head = (tr.head + 1) % TRACER_CAP;
    tmpV1.addVectors(from, to).multiplyScalar(0.5);
    tmpV2.subVectors(to, from);
    const len = tmpV2.length();
    if (len < 0.1) return;
    tmpV2.normalize();
    dummy.position.copy(tmpV1);
    dummy.quaternion.setFromUnitVectors(zAxis, tmpV2);
    dummy.scale.set(0.035, 0.035, len);
    dummy.updateMatrix();
    tr.mats[i].copy(dummy.matrix);
    tr.mesh.setMatrixAt(i, dummy.matrix);
    tr.age[i] = 0.0001; tr.life[i] = life || 0.07;
    tr.mesh.instanceMatrix.needsUpdate = true;
  };
  function updateTracers(dt) {
    const tr = tracers;
    let any = false;
    for (let i = 0; i < TRACER_CAP; i++) {
      if (tr.age[i] <= 0) continue;
      any = true;
      tr.age[i] += dt;
      if (tr.age[i] >= tr.life[i]) {
        tr.age[i] = 0;
        dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
        tr.mesh.setMatrixAt(i, dummy.matrix);
      }
    }
    if (any) tr.mesh.instanceMatrix.needsUpdate = true;
  }

  // ============ Casings ============
  const CASING_CAP = 50;
  let casings;
  function initCasings() {
    const geo = U.shadedBoxGeo(0.03, 0.03, 0.08);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8b544, vertexColors: true });
    const mesh = new THREE.InstancedMesh(geo, mat, CASING_CAP);
    mesh.frustumCulled = false;
    dummy.position.set(0, -999, 0); dummy.updateMatrix();
    for (let i = 0; i < CASING_CAP; i++) mesh.setMatrixAt(i, dummy.matrix);
    scene.add(mesh);
    casings = {
      mesh, head: 0,
      pos: [], vel: [], rot: [], age: new Float32Array(CASING_CAP),
    };
    for (let i = 0; i < CASING_CAP; i++) { casings.pos.push(new THREE.Vector3()); casings.vel.push(new THREE.Vector3()); casings.rot.push(new THREE.Vector3()); }
  }
  FX.casing = function (pos, right) {
    const cs = casings;
    const i = cs.head; cs.head = (cs.head + 1) % CASING_CAP;
    cs.pos[i].copy(pos);
    cs.vel[i].set(right.x * U.rand(1.5, 2.6) + U.rand(-0.4, 0.4), U.rand(1.8, 2.6), right.z * U.rand(1.5, 2.6) + U.rand(-0.4, 0.4));
    cs.rot[i].set(U.rand(0, 6), U.rand(0, 6), U.rand(0, 6));
    cs.age[i] = 0.0001;
  };
  function updateCasings(dt) {
    const cs = casings;
    let any = false;
    for (let i = 0; i < CASING_CAP; i++) {
      if (cs.age[i] <= 0) continue;
      any = true;
      cs.age[i] += dt;
      if (cs.age[i] > 2.2) {
        cs.age[i] = 0;
        dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix();
        cs.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      cs.vel[i].y -= 14 * dt;
      cs.pos[i].addScaledVector(cs.vel[i], dt);
      if (cs.pos[i].y < 0.03) { cs.pos[i].y = 0.03; cs.vel[i].y *= -0.4; cs.vel[i].x *= 0.6; cs.vel[i].z *= 0.6; }
      cs.rot[i].addScaledVector(cs.rot[i], 0);
      dummy.position.copy(cs.pos[i]);
      dummy.rotation.set(cs.rot[i].x + cs.age[i] * 8, cs.rot[i].y, cs.rot[i].z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cs.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (any) cs.mesh.instanceMatrix.needsUpdate = true;
  }

  // ============ pools & public API ============
  let smokeP, fireP, dustP, sparkP, shardP, leafP, muzzleP;
  const decals = {};
  const emitters = [];
  let shakeAmp = 0, shakeDur = 0, shakeT = 0;
  const bloodPoolGrow = [];

  FX.init = function (sc) {
    scene = sc;
    camQ = new THREE.Quaternion();
    FX.blood = BillboardPool(T.drop(), 260, { renderOrder: 9 });
    smokeP = BillboardPool(T.smoke(), 150, { renderOrder: 10 });
    fireP = BillboardPool(T.fireball(), 70, { renderOrder: 10 });
    dustP = BillboardPool(T.dustPuff(), 120, { renderOrder: 9 });
    sparkP = BillboardPool(T.muzzle(), 60, { additive: true, renderOrder: 11 });
    shardP = BillboardPool(T.shard(), 90, { renderOrder: 9 });
    leafP = BillboardPool(T.drop(), 60, { renderOrder: 9 });
    muzzleP = BillboardPool(T.muzzle(), 12, { additive: true, renderOrder: 12 });
    decals.splat = DecalPool(T.splat(), 300, true);
    decals.hole = DecalPool(T.hole(), 200, false);
    decals.scorch = DecalPool(T.scorch(), 50, false);
    decals.pool = DecalPool(T.pool(), 46, true);
    initDebris(); initTracers(); initCasings();
  };

  FX.decal = function (kind, x, y, z, normal, size, tint) {
    // ground-plane decals make no sense floating in space (wall decals with a normal are fine)
    if (G.world && G.world.zeroG && !normal && y < 0.15) return -1;
    const d = decals[kind];
    if (!d) return -1;
    return d.spawn(x, y, z, normal, size, tint);
  };
  // the surface under these decals just got destroyed — take the decals with it
  FX.clearDecalsIn = function (x0, y0, z0, x1, y1, z1) {
    for (const k in decals) decals[k].clearBox(x0, y0, z0, x1, y1, z1);
    for (let i = bloodPoolGrow.length - 1; i >= 0; i--) {
      const g = bloodPoolGrow[i];
      if (g.x >= x0 && g.x <= x1 && g.z >= z0 && g.z <= z1) bloodPoolGrow.splice(i, 1);
    }
  };

  FX.bloodPool = function (x, z, maxSize) {
    if (G.world && G.world.zeroG) return;
    const idx = decals.pool.spawn(x, 0.02, z, null, 0.1, new THREE.Color(U.rand(0.5, 0.75), 0.02, 0.02));
    bloodPoolGrow.push({ idx, x, z, size: 0.1, maxSize: maxSize || U.rand(1.1, 1.7), t: 0 });
  };
  function updateBloodPools(dt) {
    for (let i = bloodPoolGrow.length - 1; i >= 0; i--) {
      const p = bloodPoolGrow[i];
      p.t += dt;
      p.size = U.lerp(0.1, p.maxSize, Math.min(1, p.t / 4));
      dummy.position.set(p.x, 0.025 + (p.idx % 8) * 0.0012, p.z);
      dummy.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      decals.pool.mesh.setMatrixAt(p.idx, dummy.matrix);
      decals.pool.mesh.instanceMatrix.needsUpdate = true;
      if (p.t > 4.2) bloodPoolGrow.splice(i, 1);
    }
  }

  // blood burst at hit point, sprays along dir; drops leave ground splats where they land
  FX.bloodBurst = function (pos, dir, n, speed) {
    n = Math.round(n * FX.quality);
    for (let i = 0; i < n; i++) {
      const sp = speed * U.rand(0.35, 1.25);
      const vx = dir.x * sp + U.rand(-2.2, 2.2);
      const vy = dir.y * sp + U.rand(-0.6, 3.2);
      const vz = dir.z * sp + U.rand(-2.2, 2.2);
      const shade = U.rand(0.55, 0.95);
      FX.blood.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 11, U.rand(0.08, 0.2), U.rand(0.03, 0.08), U.rand(0.5, 1.1), shade, 0.02, 0.02, 1);
    }
  };

  // splatter projected on surface behind the victim (physics-y wall paint)
  FX.bloodWallSplat = function (pos, dir) {
    if (!G.world) return;
    const hit = G.world.raycast(pos, dir, 5, {});
    if (hit && hit.t < 5 && hit.kind !== 'none') {
      const s = U.rand(0.6, 1.4) * (1 - hit.t / 6);
      FX.decal('splat', hit.point.x, hit.point.y, hit.point.z, hit.normal, Math.max(0.4, s),
        new THREE.Color(U.rand(0.55, 0.8), 0.02, 0.02));
    }
  };

  FX.impact = function (kind, point, normal) {
    if (kind === 'chunk' || kind === 'aabb') {
      for (let i = 0; i < 4 * FX.quality; i++)
        dustP.spawn(point.x, point.y, point.z, normal.x * U.rand(0.5, 2) + U.rand(-1, 1), U.rand(0.5, 2), normal.z * U.rand(0.5, 2) + U.rand(-1, 1), 5, 0.12, 0.3, 0.45, 0.85, 0.8, 0.7, 0);
      sparkP.spawn(point.x, point.y, point.z, normal.x * 2, U.rand(0, 2), normal.z * 2, 8, 0.12, 0.02, 0.18, 1, 0.9, 0.4, 0);
      FX.decal('hole', point.x, point.y, point.z, normal, U.rand(0.1, 0.16));
    } else if (kind === 'ground') {
      for (let i = 0; i < 3; i++)
        dustP.spawn(point.x, point.y + 0.05, point.z, U.rand(-1, 1), U.rand(1, 2.5), U.rand(-1, 1), 5, 0.1, 0.28, 0.4, 0.7, 0.75, 0.55, 0);
      FX.decal('hole', point.x, 0.02, point.z, null, U.rand(0.09, 0.14));
    } else if (kind === 'glass') {
      for (let i = 0; i < 8 * FX.quality; i++)
        shardP.spawn(point.x, point.y, point.z, U.rand(-2, 2) + normal.x * 2, U.rand(0, 2), U.rand(-2, 2) + normal.z * 2, 10, U.rand(0.08, 0.18), 0.05, U.rand(0.5, 1), 1, 1, 1, 0);
    } else if (kind === 'leaf') {
      for (let i = 0; i < 5; i++)
        leafP.spawn(point.x, point.y, point.z, U.rand(-1.5, 1.5), U.rand(-0.5, 1), U.rand(-1.5, 1.5), 3, 0.12, 0.06, 0.8, 0.2, U.rand(0.5, 0.75), 0.15, 0);
    } else if (kind === 'metal') {
      sparkP.spawn(point.x, point.y, point.z, normal.x * 3 + U.rand(-1, 1), U.rand(0.5, 2.5), normal.z * 3 + U.rand(-1, 1), 8, 0.15, 0.02, 0.2, 1, 0.85, 0.4, 0);
      sparkP.spawn(point.x, point.y, point.z, normal.x * 2, U.rand(0, 1.5), normal.z * 2, 8, 0.1, 0.02, 0.15, 1, 0.7, 0.3, 0);
    }
  };

  FX.muzzle = function (pos, scale) {
    muzzleP.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0, scale, scale * 0.4, 0.055, 1, 0.85, 0.35, 0);
  };

  FX.rocketTrail = function (pos) {
    smokeP.spawn(pos.x, pos.y, pos.z, U.rand(-0.3, 0.3), U.rand(0.2, 0.8), U.rand(-0.3, 0.3), -0.2, 0.22, 0.75, U.rand(0.5, 0.9), 0.75, 0.73, 0.7, 0);
    if (Math.random() < 0.5)
      sparkP.spawn(pos.x, pos.y, pos.z, U.rand(-0.5, 0.5), U.rand(-0.5, 0.5), U.rand(-0.5, 0.5), 2, 0.14, 0.03, 0.12, 1, 0.75, 0.3, 0);
  };

  FX.dustLand = function (pos) {
    for (let i = 0; i < 4; i++)
      dustP.spawn(pos.x, pos.y + 0.05, pos.z, U.rand(-1.6, 1.6), U.rand(0.4, 1), U.rand(-1.6, 1.6), 3, 0.14, 0.4, 0.45, 0.8, 0.76, 0.62, 0);
  };

  FX.chunkBreak = function (pos, color, size, vel) {
    // main chunk + fragments
    FX.debris(pos, vel, size.x * U.rand(0.7, 1), size.y * U.rand(0.7, 1), size.z * U.rand(0.7, 1), color, U.rand(6, 10));
    if (Math.random() < 0.8 * FX.quality) {
      tmpV1.set(vel.x + U.rand(-2, 2), vel.y + U.rand(0, 2), vel.z + U.rand(-2, 2));
      FX.debris(pos, tmpV1, size.x * 0.4, size.y * 0.4, size.z * 0.4, color, U.rand(4, 7));
    }
    for (let i = 0; i < 3 * FX.quality; i++)
      dustP.spawn(pos.x, pos.y, pos.z, U.rand(-1.5, 1.5), U.rand(0, 2), U.rand(-1.5, 1.5), 4, 0.2, 0.5, 0.6, 0.82, 0.78, 0.68, 0);
  };

  FX.glassBreak = function (pos, normal) {
    for (let i = 0; i < 14 * FX.quality; i++)
      shardP.spawn(pos.x + U.rand(-0.4, 0.4), pos.y + U.rand(-0.5, 0.5), pos.z + U.rand(-0.4, 0.4),
        normal.x * U.rand(0.5, 3) + U.rand(-1.5, 1.5), U.rand(-0.5, 1.5), normal.z * U.rand(0.5, 3) + U.rand(-1.5, 1.5),
        10, U.rand(0.1, 0.22), 0.06, U.rand(0.5, 1.1), 1, 1, 1, 0);
    G.audio.glass(pos);
  };

  FX.explosionFX = function (pos, r) {
    const q = FX.quality;
    for (let i = 0; i < 8 * q; i++) {
      const a = U.rand(0, 6.28), rr = U.rand(0, r * 0.4);
      fireP.spawn(pos.x + Math.cos(a) * rr, pos.y + U.rand(0, r * 0.35), pos.z + Math.sin(a) * rr,
        U.rand(-2, 2), U.rand(2, 6), U.rand(-2, 2), 2, r * U.rand(0.35, 0.6), r * U.rand(0.7, 1.1), U.rand(0.3, 0.55),
        1, U.rand(0.55, 0.9), 0.25, 0);
    }
    for (let i = 0; i < 10 * q; i++) {
      const a = U.rand(0, 6.28), rr = U.rand(0, r * 0.5);
      smokeP.spawn(pos.x + Math.cos(a) * rr, pos.y + U.rand(0.2, r * 0.5), pos.z + Math.sin(a) * rr,
        U.rand(-1.5, 1.5), U.rand(1.5, 4.5), U.rand(-1.5, 1.5), -0.6, r * 0.3, r * U.rand(0.8, 1.3), U.rand(1.2, 2.4),
        U.rand(0.25, 0.5), U.rand(0.24, 0.46), U.rand(0.24, 0.44), 0);
    }
    for (let i = 0; i < 14 * q; i++) {
      const a = U.rand(0, 6.28);
      sparkP.spawn(pos.x, pos.y + 0.3, pos.z, Math.cos(a) * U.rand(4, 14), U.rand(3, 12), Math.sin(a) * U.rand(4, 14),
        14, 0.2, 0.04, U.rand(0.3, 0.7), 1, 0.8, 0.35, 0);
    }
    FX.decal('scorch', pos.x, 0.025, pos.z, null, r * U.rand(0.8, 1.1));
    const d = G.player ? U.dist2d(pos.x, pos.z, G.player.pos.x, G.player.pos.z) : 99;
    FX.shake(U.clamp(1.6 - d / 22, 0, 1.6), 0.55);
    if (d < 16 && G.game) G.game.flash(U.clamp(0.55 - d / 40, 0.1, 0.55));
  };

  FX.addEmitter = function (opts) { emitters.push({ t: 0, acc: 0, ...opts }); };
  function updateEmitters(dt) {
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.t += dt;
      if (e.t > e.dur) { emitters.splice(i, 1); continue; }
      e.acc += dt * e.rate * FX.quality;
      while (e.acc >= 1) {
        e.acc -= 1;
        if (e.kind === 'smoke')
          smokeP.spawn(e.pos.x + U.rand(-0.6, 0.6), e.pos.y + U.rand(0, 0.5), e.pos.z + U.rand(-0.6, 0.6),
            U.rand(-0.3, 0.3), U.rand(1.2, 2.4), U.rand(-0.3, 0.3), -0.5, U.rand(0.5, 0.9), U.rand(1.6, 2.6), U.rand(1.6, 2.8),
            0.18, 0.17, 0.16, 0);
        else if (e.kind === 'fire')
          fireP.spawn(e.pos.x + U.rand(-0.5, 0.5), e.pos.y + U.rand(0, 0.4), e.pos.z + U.rand(-0.5, 0.5),
            U.rand(-0.2, 0.2), U.rand(0.8, 1.8), U.rand(-0.2, 0.2), 0.4, U.rand(0.4, 0.8), 0.15, U.rand(0.35, 0.6),
            1, U.rand(0.5, 0.8), 0.2, 0);
        else if (e.kind === 'water')
          shardP.spawn(e.pos.x + U.rand(-0.15, 0.15), e.pos.y, e.pos.z + U.rand(-0.15, 0.15),
            U.rand(-1.8, 1.8), U.rand(5.5, 9.5), U.rand(-1.8, 1.8), 13, U.rand(0.16, 0.3), 0.08, U.rand(0.8, 1.2),
            0.5, 0.72, 1, 0);
      }
    }
  }

  // gib a bot into flying bloody parts
  FX.gibBot = function (bot, impulseDir, power) {
    const parts = [
      { s: [0.34, 0.34, 0.34], c: bot.skinColor },  // head
      { s: [0.5, 0.6, 0.28], c: bot.shirtColor },   // torso
      { s: [0.16, 0.55, 0.16], c: bot.skinColor },
      { s: [0.16, 0.55, 0.16], c: bot.shirtColor },
      { s: [0.18, 0.7, 0.18], c: bot.pantsColor },
      { s: [0.18, 0.7, 0.18], c: bot.pantsColor },
      { s: [0.3, 0.2, 0.3], c: new THREE.Color(0.55, 0.03, 0.03) },
      { s: [0.24, 0.16, 0.24], c: new THREE.Color(0.45, 0.02, 0.02) },
      { s: [0.2, 0.14, 0.2], c: new THREE.Color(0.6, 0.05, 0.05) },
    ];
    const base = bot.group.position;
    for (const p of parts) {
      tmpV1.set(base.x + U.rand(-0.3, 0.3), base.y + U.rand(0.5, 1.5), base.z + U.rand(-0.3, 0.3));
      tmpV2.set(impulseDir.x * power * U.rand(0.4, 1) + U.rand(-3.5, 3.5), U.rand(3, 8.5) * (power / 8), impulseDir.z * power * U.rand(0.4, 1) + U.rand(-3.5, 3.5));
      FX.debris(tmpV1, tmpV2, p.s[0], p.s[1], p.s[2], p.c, U.rand(8, 13), true);
    }
    tmpV1.set(base.x, base.y + 1, base.z);
    FX.bloodBurst(tmpV1, impulseDir, 26, 7);
    for (let i = 0; i < 5; i++) FX.decal('splat', base.x + U.rand(-1.6, 1.6), 0.02, base.z + U.rand(-1.6, 1.6), null, U.rand(0.5, 1.1), new THREE.Color(U.rand(0.5, 0.75), 0.02, 0.02));
    FX.bloodPool(base.x, base.z, U.rand(1.4, 2));
    G.audio.squish(base);
  };

  FX.shake = function (amp, dur) {
    if (amp > shakeAmp) { shakeAmp = amp; shakeDur = dur; shakeT = 0; }
  };
  FX.getShake = function (out, dt) {
    if (shakeAmp <= 0.001) { out.x = 0; out.y = 0; return; }
    shakeT += dt;
    const k = Math.max(0, 1 - shakeT / shakeDur);
    out.x = U.rand(-1, 1) * 0.02 * shakeAmp * k;
    out.y = U.rand(-1, 1) * 0.02 * shakeAmp * k;
    if (k <= 0) shakeAmp = 0;
  };

  FX.update = function (dt, camera) {
    camQ.copy(camera.quaternion);
    FX.blood.update(dt); smokeP.update(dt); fireP.update(dt); dustP.update(dt);
    sparkP.update(dt); shardP.update(dt); leafP.update(dt); muzzleP.update(dt);
    updateDebris(dt); updateTracers(dt); updateCasings(dt);
    updateEmitters(dt); updateBloodPools(dt);
  };

  function hideAll(mesh, cap) {
    dummy.position.set(0, -999, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
  // wipe every effect for a fresh match
  FX.reset = function () {
    for (const P of [FX.blood, smokeP, fireP, dustP, sparkP, shardP, leafP, muzzleP]) {
      P.age.fill(0);
      P.head = 0;
      hideAll(P.mesh, P.cap);
    }
    debris.age.fill(0); debris.head = 0; hideAll(debris.mesh, DEBRIS_CAP);
    tracers.age.fill(0); tracers.head = 0; hideAll(tracers.mesh, TRACER_CAP);
    casings.age.fill(0); casings.head = 0; hideAll(casings.mesh, CASING_CAP);
    for (const k in decals) { decals[k].head = 0; hideAll(decals[k].mesh, decals[k].cap); }
    emitters.length = 0;
    bloodPoolGrow.length = 0;
    shakeAmp = 0;
  };

  return FX;
})();
