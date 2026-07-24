// world.js — destructible suburban block: chunk walls, roofs, cars, props, navgrid
G.world = (function () {
  const W = {};
  let scene;
  let grp; // every world object lives here so reset() can wipe it
  const tmpN = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  const MONEY = {
    siding: 140, roof: 90, fence: 35, garage: 75, glass: 260, shed: 95, mailbox: 85, propane: 60,
    grill: 220, couch: 900, fridge: 1100, tv: 1300, table: 350, car: 12500,
    frame: 25, trash: 20, recycle: 15, hydrant: 950, hoop: 320, doghouse: 180, kpool: 45,
    ac: 480, dumpster: 800, potty: 550, lumber: 60, mixer: 2100, bed: 700, shelf: 260,
    picnic: 400, swing: 130,
    // construction site
    chainlink: 25, plank: 30, block: 45, barrel: 70, pallet: 90, spool: 120, generator: 800, barrier: 120,
    crate: 45, paint: 30, tool: 350, barrow: 260, watertank: 9000, silo: 6500,
    // volcano island
    bamboo: 60, thatch: 40, canoe: 700, chest: 5000, surfboard: 350, torch: 25, drum: 90,
    tiki: 1500, melon: 15, moai: 8000, stone: 400,
    // meridian station
    hull: 200, tile: 120, console: 900, holo: 2500, hal: 9000, djinn: 1800, bunk: 400,
    vend: 1100, cell: 80, shuttle: 25000, dish: 3000, solar: 1200, planter: 300,
    tank: 1500, locker: 150, kiosk: 700, pod: 850, droid: 650, tug: 4200, booth: 60,
    core: 1300, evapod: 2200, monolith: 2001,
    // the citadel
    knight: 900, throne: 15000, chandelier: 3500, pillar: 1600, statue: 6000, gargoyle: 1200,
    banner: 250, brazier: 400, feast: 900, stall: 350, dummy: 150, rack: 700, tomb: 500,
    pane: 2600, organ: 5200, globe: 1800, lectern: 90, books: 25, cookpot: 60, candle: 15,
    castle: 180, book: 45,
    // arcane academy
    cauldron: 380, crystal: 4200, orrery: 7500, mirror: 2800, potion: 60, scroll: 35,
    telescope: 3200, portrait: 1500, broom: 900, pumpkin: 25, owl: 350, harp: 2600,
    // gold rush gulch
    wood: 30, tnt: 40, loco: 28000, boxcar: 6000, trestle: 60, orecart: 380, piano: 4200,
    keg: 90, wagon: 1500, hay: 25, cactus: 900, bell: 7000, windmill: 2400, trough: 120,
    pew: 300, sign: 45, towertank: 9000,
    // downtown
    fountain: 4000, bus: 9500, cart: 700, train: 15000, billboard: 2600,
    fossil: 20000, painting: 12000, vase: 3000, case: 150, sarcoph: 9000, meteor: 18000,
    obelisk: 5000, jar: 800, pedestal: 200, rope: 30, plush: 40, relic: 2500, rocket: 7000,
    desk: 350, copier: 800, bench: 150, acduct: 380,
  };
  W.bill = {}; W.billTotal = 0;
  W.addMoney = function (kind) {
    const v = MONEY[kind] || 50;
    W.bill[kind] = (W.bill[kind] || 0) + 1;
    W.billTotal += v;
  };

  // numeric ray-vs-box, shared normal out
  const boxN = { x: 0, y: 0, z: 0 };
  function rayBox(ro, rd, ix, minx, miny, minz, maxx, maxy, maxz) {
    let tmin = -Infinity, tmax = Infinity, ax = -1, sgn = 1;
    // x
    if (Math.abs(rd.x) < 1e-9) { if (ro.x < minx || ro.x > maxx) return -1; }
    else {
      let t1 = (minx - ro.x) / rd.x, t2 = (maxx - ro.x) / rd.x, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = 0; sgn = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    // y
    if (Math.abs(rd.y) < 1e-9) { if (ro.y < miny || ro.y > maxy) return -1; }
    else {
      let t1 = (miny - ro.y) / rd.y, t2 = (maxy - ro.y) / rd.y, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = 1; sgn = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    // z
    if (Math.abs(rd.z) < 1e-9) { if (ro.z < minz || ro.z > maxz) return -1; }
    else {
      let t1 = (minz - ro.z) / rd.z, t2 = (maxz - ro.z) / rd.z, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = 2; sgn = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (tmax < 0) return -1;
    const t = tmin >= 0 ? tmin : 0;
    boxN.x = 0; boxN.y = 0; boxN.z = 0;
    if (ax === 0) boxN.x = sgn; else if (ax === 1) boxN.y = sgn; else if (ax === 2) boxN.z = sgn;
    else boxN.y = 1;
    return t;
  }

  // ============ instanced chunk batches ============
  function ChunkBatch(texture, cap, opts) {
    opts = opts || {};
    const geo = U.shadedBoxGeo(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, vertexColors: true,
      transparent: !!opts.transparent, opacity: opts.opacity || 1,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    if (opts.renderOrder) mesh.renderOrder = opts.renderOrder;
    dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    grp.add(mesh);
    const B = { mesh, cap, n: 0, dirty: false };
    B.alloc = function (x, y, z, sx, sy, sz, color, rotX, rotZ) {
      if (B.n >= cap) return -1;
      const i = B.n++;
      dummy.position.set(x, y, z);
      dummy.rotation.set(rotX || 0, 0, rotZ || 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
      B.dirty = true;
      return i;
    };
    B.free = function (i) {
      if (i < 0) return;
      dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      B.dirty = true;
    };
    B.flush = function () {
      if (B.dirty) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        B.dirty = false;
      }
    };
    return B;
  }
  let batches = {};

  // ============ WallGrid ============
  // cell types: 0 solid, 1 open (designed), 2 void (outside gable), 3 window(glass)
  const walls = [];
  function WallGrid(o) {
    // o: {ox,oy,oz, dir, cols, rows, cw, ch, th, kind, tint, hp, house}
    const wall = {
      ...o,
      type: new Uint8Array(o.cols * o.rows),
      hpArr: new Float32Array(o.cols * o.rows),
      inst: new Int32Array(o.cols * o.rows).fill(-1),
      alive: new Uint8Array(o.cols * o.rows),
      colMask: new Uint16Array(o.cols),
      glassMask: new Uint16Array(o.cols), // windows block walking (not structure)
      supportDirty: false,
      tintColor: new THREE.Color(o.tint),
    };
    // world AABB
    const len = o.cols * o.cw, hgt = o.rows * o.ch;
    if (o.dir === 'x') {
      wall.min = { x: o.ox, y: o.oy, z: o.oz - o.th / 2 };
      wall.max = { x: o.ox + len, y: o.oy + hgt, z: o.oz + o.th / 2 };
    } else {
      wall.min = { x: o.ox - o.th / 2, y: o.oy, z: o.oz };
      wall.max = { x: o.ox + o.th / 2, y: o.oy + hgt, z: o.oz + len };
    }
    wall.idx = (c, r) => c * o.rows + r;
    wall.center = function (c, r, out) {
      if (o.dir === 'x') out.set(o.ox + (c + 0.5) * o.cw, o.oy + (r + 0.5) * o.ch, o.oz);
      else out.set(o.ox, o.oy + (r + 0.5) * o.ch, o.oz + (c + 0.5) * o.cw);
      return out;
    };
    wall.id = walls.length;
    walls.push(wall);
    return wall;
  }
  function wallFill(wall, fn) {
    // fn(c,r) -> type
    const batch = batches[wall.kind === 'window' ? 'siding' : wall.kind] || batches.siding;
    for (let c = 0; c < wall.cols; c++) {
      let mask = 0, gmask = 0;
      for (let r = 0; r < wall.rows; r++) {
        const i = wall.idx(c, r);
        const ty = fn ? fn(c, r) : 0;
        wall.type[i] = ty;
        if (ty === 0) {
          wall.hpArr[i] = wall.hp;
          wall.alive[i] = 1;
          wall.center(c, r, tmpV);
          const b = batches[wall.kind];
          wall.inst[i] = b.alloc(tmpV.x, tmpV.y, tmpV.z,
            (wall.dir === 'x' ? wall.cw : wall.th) * 1.002,
            wall.ch * 1.002,
            (wall.dir === 'x' ? wall.th : wall.cw) * 1.002,
            wall.tintColor);
          mask |= (1 << r);
        } else if (ty === 3) {
          wall.hpArr[i] = 1;
          wall.alive[i] = 1;
          wall.center(c, r, tmpV);
          wall.inst[i] = batches.glass.alloc(tmpV.x, tmpV.y, tmpV.z,
            (wall.dir === 'x' ? wall.cw : 0.07) * 0.98,
            wall.ch * 0.98,
            (wall.dir === 'x' ? 0.07 : wall.cw) * 0.98,
            new THREE.Color(0xffffff));
          // windows keep out of colMask (no load-bearing, no minimap) but DO
          // stop you walking through them until they're broken
          gmask |= (1 << r);
        }
      }
      wall.colMask[c] = mask;
      wall.glassMask[c] = gmask;
    }
  }

  function chunkAABBOf(wall, c, r) {
    // fills aabbTmp
    if (wall.dir === 'x') {
      aabbTmp.minx = wall.ox + c * wall.cw; aabbTmp.maxx = aabbTmp.minx + wall.cw;
      aabbTmp.minz = wall.oz - wall.th / 2; aabbTmp.maxz = wall.oz + wall.th / 2;
    } else {
      aabbTmp.minz = wall.oz + c * wall.cw; aabbTmp.maxz = aabbTmp.minz + wall.cw;
      aabbTmp.minx = wall.ox - wall.th / 2; aabbTmp.maxx = wall.ox + wall.th / 2;
    }
    aabbTmp.miny = wall.oy + r * wall.ch; aabbTmp.maxy = aabbTmp.miny + wall.ch;
  }
  const aabbTmp = { minx: 0, miny: 0, minz: 0, maxx: 0, maxy: 0, maxz: 0 };

  const delayedBreaks = [];
  const dirtyWalls = [];
  W.chunksDestroyed = 0;

  function destroyChunk(wall, c, r, vel, silent) {
    const i = wall.idx(c, r);
    if (!wall.alive[i]) return;
    wall.alive[i] = 0;
    const isGlass = wall.type[i] === 3;
    if (isGlass) {
      batches.glass.free(wall.inst[i]);
      wall.glassMask[c] &= ~(1 << r);
      navMarkDirtyAt(wall, c); // bots may path through the new opening
      wall.center(c, r, tmpV);
      tmpN.set(wall.dir === 'x' ? 0 : 1, 0, wall.dir === 'x' ? 1 : 0);
      G.fx.glassBreak(tmpV, tmpN);
      W.addMoney('glass');
    } else {
      batches[wall.kind].free(wall.inst[i]);
      wall.colMask[c] &= ~(1 << r);
      wall.center(c, r, tmpV);
      const size = { x: wall.dir === 'x' ? wall.cw : wall.th, y: wall.ch, z: wall.dir === 'x' ? wall.th : wall.cw };
      G.fx.chunkBreak(tmpV, wall.tintColor, size, vel || tmpN.set(U.rand(-1, 1), U.rand(1, 2), U.rand(-1, 1)));
      W.addMoney(wall.kind);
      if (!wall.supportDirty) { wall.supportDirty = true; dirtyWalls.push(wall); }
      if (wall.house) {
        wall.house.dead++;
        checkRoofCollapse(wall.house);
      }
    }
    wall.inst[i] = -1;
    W.chunksDestroyed++;
    navMarkDirtyAt(wall, c);
    chunkAABBOf(wall, c, r);
    G.fx.clearDecalsIn(aabbTmp.minx - 0.14, aabbTmp.miny - 0.1, aabbTmp.minz - 0.14,
      aabbTmp.maxx + 0.14, aabbTmp.maxy + 0.1, aabbTmp.maxz + 0.14);
  }

  function damageChunk(wall, c, r, dmg, vel) {
    const i = wall.idx(c, r);
    if (!wall.alive[i]) return;
    // sync direct hits (explosions sync via their own event and replay locally)
    if (G.net && G.net.active && !G.net.applying && !W.inExplosion) G.net.evChunk(wall.id, c, r, dmg);
    wall.hpArr[i] -= dmg;
    if (wall.hpArr[i] <= 0) destroyChunk(wall, c, r, vel);
  }
  W.damageChunk = damageChunk;

  // ---------- late-join world sync ----------
  // the host serializes everything that's been destroyed so far; a late joiner
  // replays it silently on top of the (deterministic) fresh build
  function destroyChunkSilent(wall, i) {
    if (!wall.alive[i]) return;
    wall.alive[i] = 0;
    const isGlass = wall.type[i] === 3;
    batches[isGlass ? 'glass' : wall.kind].free(wall.inst[i]);
    if (!isGlass) {
      const c = (i / wall.rows) | 0, r = i % wall.rows;
      wall.colMask[c] &= ~(1 << r);
      if (wall.house) wall.house.dead++;
    }
    wall.inst[i] = -1;
    W.chunksDestroyed++;
  }
  W.damageSnapshot = function () {
    const w = [];
    for (const wall of walls) {
      const dead = [];
      for (let i = 0; i < wall.type.length; i++)
        if ((wall.type[i] === 0 || wall.type[i] === 3) && !wall.alive[i]) dead.push(i);
      if (dead.length) w.push([wall.id, dead]);
    }
    const s = [];
    for (const sh of sheets) {
      const dead = [];
      for (let ci = 0; ci < sh.chunks.length; ci++) if (!sh.chunks[ci].alive) dead.push(ci);
      if (dead.length) s.push([sh.id, dead]);
    }
    const c = cars.map(car => [Math.round(Math.max(car.hp, 0)), car.exploded ? 1 : 0]);
    const p = [];
    for (let i = 0; i < props.length; i++) if (props[i].dead) p.push(i);
    return { w, s, c, p, bill: W.bill, total: W.billTotal };
  };
  W.applyDamageSnapshot = function (snap) {
    for (const [wid, dead] of snap.w || []) {
      const wall = walls[wid];
      if (wall) for (const i of dead) destroyChunkSilent(wall, i);
    }
    for (const [sid, dead] of snap.s || []) {
      const sh = sheets[sid];
      if (!sh) continue;
      for (const ci of dead) {
        const ch = sh.chunks[ci];
        if (ch && ch.alive) { ch.alive = 0; batches[sh.kind].free(ch.inst); ch.inst = -1; }
      }
    }
    (snap.c || []).forEach((cs, i) => {
      const car = cars[i];
      if (!car) return;
      car.hp = cs[0];
      if (cs[1] && !car.exploded) {
        car.exploded = true;
        car.wheels.visible = false;
        car.body.material.color.setHex(0x2a2c30);
        car.cab.material.color = new THREE.Color(0x232528);
      }
    });
    for (const i of snap.p || []) {
      const pr = props[i];
      if (pr && !pr.dead) {
        pr.dead = true;
        pr.collider.gone = true;
        if (pr.mesh.parent) pr.mesh.parent.remove(pr.mesh);
      }
    }
    // don't re-trigger collapses for houses that already fell
    for (const house of houses) if (house.total && house.dead / house.total > 0.45) house.roofCollapsed = true;
    if (snap.bill) { W.bill = snap.bill; W.billTotal = snap.total || 0; }
    navBuild();
    W.flushBatches();
    W.minimapDirty = true;
  };
  W.damageChunkById = function (wid, c, r, dmg) {
    const wall = walls[wid];
    if (wall) damageChunk(wall, c, r, dmg);
  };
  W.damageSheetById = function (si, ci, dmg) {
    const s = sheets[si];
    if (!s) return;
    const ch = s.chunks[ci];
    if (!ch || !ch.alive) return;
    ch.hp -= dmg;
    if (ch.hp <= 0) destroySheetChunk(s, ch);
  };

  function supportCheck(wall) {
    wall.supportDirty = false;
    if (wall.kind === 'fence' || wall.kind === 'chainlink') return; // fences don't cascade
    for (let c = 0; c < wall.cols; c++) {
      for (let r = 1; r < wall.rows; r++) {
        const i = wall.idx(c, r);
        if (!wall.alive[i] || wall.type[i] === 3) continue;
        const below = wall.idx(c, r - 1);
        const belowOk = wall.alive[below] || (wall.type[below] !== 0 && wall.type[below] !== 3);
        if (belowOk) continue;
        const leftOk = c > 0 && wall.alive[wall.idx(c - 1, r)] && wall.type[wall.idx(c - 1, r)] === 0;
        const rightOk = c < wall.cols - 1 && wall.alive[wall.idx(c + 1, r)] && wall.type[wall.idx(c + 1, r)] === 0;
        if (leftOk && rightOk) continue;
        delayedBreaks.push({ wall, c, r, t: U.rand(0.08, 0.45) });
      }
    }
  }

  // ============ roof sheets ============
  const sheets = [];
  function Sheet(kind, tint) {
    const s = {
      kind, tintColor: new THREE.Color(tint),
      chunks: [], // {x,y,z,rotX,sx,sy,sz, hx,hy,hz, alive, hp, inst}
      min: { x: 1e9, y: 1e9, z: 1e9 }, max: { x: -1e9, y: -1e9, z: -1e9 },
      house: null,
      id: sheets.length,
    };
    sheets.push(s);
    return s;
  }
  function sheetAdd(s, x, y, z, rot, axis, sx, sy, sz, hp) {
    const ca = Math.abs(Math.cos(rot)), sa = Math.abs(Math.sin(rot));
    let hx, hy, hz, rotX = 0, rotZ = 0;
    if (axis === 'z') { // rotation about z: mixes x/y extents (roofs on east/west-facing houses)
      rotZ = rot;
      hx = ca * sx / 2 + sa * sy / 2; hy = sa * sx / 2 + ca * sy / 2; hz = sz / 2;
    } else {
      rotX = rot;
      hx = sx / 2; hy = ca * sy / 2 + sa * sz / 2; hz = sa * sy / 2 + ca * sz / 2;
    }
    const inst = batches[s.kind].alloc(x, y, z, sx, sy, sz, s.tintColor, rotX, rotZ);
    s.chunks.push({ x, y, z, rotX, sx, sy, sz, hx, hy, hz, alive: 1, hp, inst });
    s.min.x = Math.min(s.min.x, x - hx); s.max.x = Math.max(s.max.x, x + hx);
    s.min.y = Math.min(s.min.y, y - hy); s.max.y = Math.max(s.max.y, y + hy);
    s.min.z = Math.min(s.min.z, z - hz); s.max.z = Math.max(s.max.z, z + hz);
  }
  function destroySheetChunk(s, ch, vel) {
    if (!ch.alive) return;
    ch.alive = 0;
    batches[s.kind].free(ch.inst);
    tmpV.set(ch.x, ch.y, ch.z);
    G.fx.chunkBreak(tmpV, s.tintColor, { x: ch.sx, y: Math.max(ch.sy, 0.2), z: ch.sz }, vel || tmpN.set(U.rand(-1, 1), U.rand(-1, 1), U.rand(-1, 1)));
    W.addMoney(MONEY[s.kind] ? s.kind : 'roof');
    W.chunksDestroyed++;
    G.fx.clearDecalsIn(ch.x - ch.sx / 2 - 0.14, ch.y - 0.4, ch.z - ch.sz / 2 - 0.14,
      ch.x + ch.sx / 2 + 0.14, ch.y + 0.4, ch.z + ch.sz / 2 + 0.14);
  }

  const houses = [];
  function checkRoofCollapse(house) {
    if (house.roofCollapsed || !house.roof) return;
    if (house.dead / house.total > 0.45) {
      house.roofCollapsed = true;
      let d = 0;
      for (const ch of house.roof.chunks) {
        if (!ch.alive) continue;
        d += U.rand(0.02, 0.06);
        delayedBreaks.push({ sheet: house.roof, ch, t: d * U.rand(0.5, 1.5) });
      }
      G.fx.shake(1.2, 0.8);
      G.audio.explosion({ x: house.cx, y: 2, z: house.cz }, false);
      if (G.game) G.game.killfeed('', '', 'A ROOF HAS COLLAPSED', '#ffb020');
    }
  }

  // ============ colliders (static AABBs) ============
  // {minx..maxz, kind:'solid'|'car'|'prop'|'tree', car, prop, metal}
  const colliders = [];
  W.colliders = colliders;
  function addCollider(minx, miny, minz, maxx, maxy, maxz, extra) {
    const c = { minx, miny, minz, maxx, maxy, maxz, ...extra };
    colliders.push(c);
    return c;
  }

  // slabs for ground height. refY: only surfaces reachable from that height count
  // (so entities under a platform stay on the ground, entities on it stand on top)
  const slabs = [];
  const groundHoles = []; // rects where the base ground plane is cut open (metro pits etc.)
  W.groundHoles = groundHoles;
  W.groundHeightAt = function (x, z, refY) {
    const lim = (refY === undefined ? 1e9 : refY) + 0.6;
    // no phantom floor in space, none below street level, and none over holes
    let y = (W.hasGround && !(refY < -0.4)) ? 0 : -1e9;
    if (y === 0) {
      for (let i = 0; i < groundHoles.length; i++) {
        const h = groundHoles[i];
        if (x >= h.minx && x <= h.maxx && z >= h.minz && z <= h.maxz) { y = -1e9; break; }
      }
    }
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      if (x >= s.minx && x <= s.maxx && z >= s.minz && z <= s.maxz && s.top > y && s.top <= lim) y = s.top;
    }
    return y;
  };
  // like groundHeightAt, but also treats solid collider tops (cars, dumpsters,
  // props, …) as standable floors — used by the player and bots
  W.standHeightAt = function (x, z, refY) {
    const lim = (refY === undefined ? 1e9 : refY) + 0.6;
    let y = W.groundHeightAt(x, z, refY);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.gone || c.noWalk || c.noShoot) continue;
      if (c.maxy > y && c.maxy <= lim &&
          x >= c.minx && x <= c.maxx && z >= c.minz && z <= c.maxz) y = c.maxy;
    }
    return y;
  };

  // hedges (soft, visual leaf fx only)
  const hedges = [];

  // lowest collider bottom above (roughly) head-grab height — jumps bonk on it
  // instead of the old behavior of overhead boxes shoving you out sideways
  W.ceilingAt = function (x, z, feetY, radius) {
    radius = radius || 0.3;
    let best = Infinity;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.gone || c.noWalk) continue;
      if (c.miny < feetY + 1.0 || c.miny >= best) continue;
      if (x > c.minx - radius && x < c.maxx + radius && z > c.minz - radius && z < c.maxz + radius) best = c.miny;
    }
    return best;
  };

  // ============ map mechanics: ladders / lava / geysers ============
  const ladders = []; // {minx,minz,maxx,maxz, topY, baseY}
  W.ladderAt = function (x, z, feetY) {
    for (let i = 0; i < ladders.length; i++) {
      const l = ladders[i];
      if (x >= l.minx && x <= l.maxx && z >= l.minz && z <= l.maxz &&
          feetY >= l.baseY - 0.3 && feetY < l.topY - 0.001) return l;
    }
    return null;
  };
  const lavas = []; // {minx,minz,maxx,maxz,y} — y is the lava surface height
  W.lavaAt = function (x, z, y) {
    y = y || 0;
    for (let i = 0; i < lavas.length; i++) {
      const L = lavas[i];
      if (x >= L.minx && x <= L.maxx && z >= L.minz && z <= L.maxz &&
          y > (L.y || 0) - 0.7 && y < (L.y || 0) + 0.5) return true;
    }
    return false;
  };
  const geysers = []; // {x,z,r,period,offset}
  W.geysers = geysers;
  // erupting geyser under your feet = free elevator
  W.geyserBoostAt = function (x, z) {
    for (let i = 0; i < geysers.length; i++) {
      const g = geysers[i];
      if (((W.mapClock + g.offset) % g.period) > 1.15) continue;
      const dx = x - g.x, dz = z - g.z;
      if (dx * dx + dz * dz < g.r * g.r) return g;
    }
    return null;
  };
  W.mapClock = 0;

  // ============ navgrid ============
  const NAV = { ox: -72, oz: -58, w: 144, d: 116, cell: 1 };
  const navBlocked = new Uint8Array(NAV.w * NAV.d);
  const navDirty = [];
  W.nav = NAV;
  NAV.toCell = function (x, z) {
    return [U.clamp(Math.floor(x - NAV.ox), 0, NAV.w - 1), U.clamp(Math.floor(z - NAV.oz), 0, NAV.d - 1)];
  };
  NAV.cellCenter = function (cx, cz) { return [NAV.ox + cx + 0.5, NAV.oz + cz + 0.5]; };
  NAV.blocked = function (cx, cz) {
    if (cx < 0 || cz < 0 || cx >= NAV.w || cz >= NAV.d) return true;
    return navBlocked[cz * NAV.w + cx] === 1;
  };
  function cellBlockedNow(cx, cz) {
    const x = NAV.ox + cx + 0.5, z = NAV.oz + cz + 0.5;
    if (x < -W.bounds.x - 1 || x > W.bounds.x + 1 || z < -W.bounds.z - 1 || z > W.bounds.z + 1) return true;
    // colliders
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.gone || c.step) continue; // walkable platforms/stairs stay open for bots
      if (c.maxy < 0.5 || c.miny > 1.6) continue;
      if (x > c.minx - 0.35 && x < c.maxx + 0.35 && z > c.minz - 0.35 && z < c.maxz + 0.35) return true;
    }
    // hedges block bots
    for (let i = 0; i < hedges.length; i++) {
      const h = hedges[i];
      if (x > h.minx - 0.2 && x < h.maxx + 0.2 && z > h.minz - 0.2 && z < h.maxz + 0.2) return true;
    }
    // lava scares the AI off — unless a walkable plank/bridge covers the cell
    for (let i = 0; i < lavas.length; i++) {
      const L = lavas[i];
      if (x <= L.minx || x >= L.maxx || z <= L.minz || z >= L.maxz) continue;
      let bridged = false;
      for (let j = 0; j < colliders.length; j++) {
        const c = colliders[j];
        if (!c.step || c.gone || c.maxy < 0.4 || c.maxy > 1.6) continue;
        if (x > c.minx - 0.1 && x < c.maxx + 0.1 && z > c.minz - 0.1 && z < c.maxz + 0.1) { bridged = true; break; }
      }
      if (!bridged) return true;
    }
    // walls: standing range block (only walls that exist at ground level)
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.min.y > 1.7 || w.max.y < 0.4) continue; // elevated ship/deck walls don't block ground nav
      if (x < w.min.x - 0.45 || x > w.max.x + 0.45 || z < w.min.z - 0.45 || z > w.max.z + 0.45) continue;
      let c0, c1;
      if (w.dir === 'x') {
        if (Math.abs(z - w.oz) > w.th / 2 + 0.42) continue;
        c0 = Math.floor((x - 0.42 - w.ox) / w.cw); c1 = Math.floor((x + 0.42 - w.ox) / w.cw);
      } else {
        if (Math.abs(x - w.ox) > w.th / 2 + 0.42) continue;
        c0 = Math.floor((z - 0.42 - w.oz) / w.cw); c1 = Math.floor((z + 0.42 - w.oz) / w.cw);
      }
      const rTop = Math.min(w.rows - 1, Math.floor((1.85 - w.oy + 0) / w.ch));
      const rBot = Math.max(0, Math.floor((0.45) / w.ch));
      for (let c = Math.max(0, c0); c <= Math.min(w.cols - 1, c1); c++) {
        const m = w.colMask[c] | w.glassMask[c]; // closed windows turn bots away too
        for (let r = rBot; r <= rTop; r++) if (m & (1 << r)) return true;
      }
    }
    return false;
  }
  function navBuild() {
    for (let cz = 0; cz < NAV.d; cz++)
      for (let cx = 0; cx < NAV.w; cx++)
        navBlocked[cz * NAV.w + cx] = cellBlockedNow(cx, cz) ? 1 : 0;
  }
  function navMarkDirtyAt(wall, c) {
    let x, z;
    if (wall.dir === 'x') { x = wall.ox + (c + 0.5) * wall.cw; z = wall.oz; }
    else { x = wall.ox; z = wall.oz + (c + 0.5) * wall.cw; }
    const [cx, cz] = NAV.toCell(x, z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) navDirty.push((cz + dz) * NAV.w + (cx + dx));
    W.minimapDirty = true;
  }
  W.navRefreshBox = function (minx, minz, maxx, maxz) {
    const [c0x, c0z] = NAV.toCell(minx, minz);
    const [c1x, c1z] = NAV.toCell(maxx, maxz);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) navDirty.push(cz * NAV.w + cx);
  };

  // A* with binary heap
  const asG = new Float32Array(NAV.w * NAV.d);
  const asFrom = new Int32Array(NAV.w * NAV.d);
  const asStamp = new Uint32Array(NAV.w * NAV.d);
  let stamp = 0;
  const heap = []; const heapF = [];
  function heapPush(i, f) {
    heap.push(i); heapF.push(f);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heapF[p] <= heapF[n]) break;
      [heap[p], heap[n]] = [heap[n], heap[p]];
      [heapF[p], heapF[n]] = [heapF[n], heapF[p]];
      n = p;
    }
  }
  function heapPop() {
    const top = heap[0];
    const li = heap.pop(), lf = heapF.pop();
    if (heap.length) {
      heap[0] = li; heapF[0] = lf;
      let n = 0;
      for (;;) {
        const a = n * 2 + 1, b = a + 1;
        let m = n;
        if (a < heap.length && heapF[a] < heapF[m]) m = a;
        if (b < heap.length && heapF[b] < heapF[m]) m = b;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n], heap[m]];
        [heapF[m], heapF[n]] = [heapF[n], heapF[m]];
        n = m;
      }
    }
    return top;
  }
  function nearestOpen(cx, cz) {
    if (!NAV.blocked(cx, cz)) return [cx, cz];
    for (let ring = 1; ring < 8; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        if (!NAV.blocked(cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    }
    return null;
  }
  function lineOpen(x0, z0, x1, z1) {
    // DDA over cells
    let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    let sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz, x = x0, z = z0;
    for (let k = 0; k < 300; k++) {
      if (NAV.blocked(x, z)) return false;
      if (x === x1 && z === z1) return true;
      const e2 = err * 2;
      if (e2 > -dz) { err -= dz; x += sx; }
      if (e2 < dx) { err += dx; z += sz; }
    }
    return false;
  }
  NAV.lineOpenWorld = function (ax, az, bx, bz) {
    const [c0x, c0z] = NAV.toCell(ax, az);
    const [c1x, c1z] = NAV.toCell(bx, bz);
    return lineOpen(c0x, c0z, c1x, c1z);
  };
  NAV.findPath = function (ax, az, bx, bz, hBias) {
    hBias = hBias || 1;
    let s = NAV.toCell(ax, az), t = NAV.toCell(bx, bz);
    s = nearestOpen(s[0], s[1]); t = nearestOpen(t[0], t[1]);
    if (!s || !t) return null;
    stamp++;
    heap.length = 0; heapF.length = 0;
    const si = s[1] * NAV.w + s[0], ti = t[1] * NAV.w + t[0];
    asG[si] = 0; asStamp[si] = stamp; asFrom[si] = -1;
    heapPush(si, 0);
    let found = false, expansions = 0;
    while (heap.length && expansions < 5000) {
      const cur = heapPop();
      if (cur === ti) { found = true; break; }
      expansions++;
      const cx = cur % NAV.w, cz = (cur / NAV.w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (NAV.blocked(nx, nz)) continue;
        if (dx && dz && (NAV.blocked(cx + dx, cz) || NAV.blocked(cx, cz + dz))) continue;
        const ni = nz * NAV.w + nx;
        const ng = asG[cur] + (dx && dz ? 1.414 : 1);
        if (asStamp[ni] === stamp && asG[ni] <= ng) continue;
        asStamp[ni] = stamp; asG[ni] = ng; asFrom[ni] = cur;
        const h = Math.hypot(t[0] - nx, t[1] - nz);
        heapPush(ni, ng + h * hBias);
      }
    }
    if (!found) return null;
    // reconstruct
    const cells = [];
    let cur = ti;
    while (cur !== -1 && cells.length < 500) { cells.push(cur); cur = asFrom[cur]; }
    cells.reverse();
    // smooth: greedy skip
    const out = [];
    let i = 0;
    while (i < cells.length) {
      const cx = cells[i] % NAV.w, cz = (cells[i] / NAV.w) | 0;
      let j = cells.length - 1;
      for (; j > i + 1; j--) {
        const jx = cells[j] % NAV.w, jz = (cells[j] / NAV.w) | 0;
        if (lineOpen(cx, cz, jx, jz)) break;
      }
      const [wx, wz] = NAV.cellCenter(cx, cz);
      out.push({ x: wx, z: wz });
      if (j <= i) j = i + 1;
      i = j === i + 1 && i === cells.length - 1 ? cells.length : j;
      if (out.length > 60) break;
    }
    const [tx2, tz2] = NAV.cellCenter(t[0], t[1]);
    out.push({ x: tx2, z: tz2 });
    return out;
  };

  // ============ raycast ============
  const hitObj = {
    t: 0, kind: 'none',
    point: new THREE.Vector3(), normal: new THREE.Vector3(),
    wall: null, c: 0, r: 0, sheet: null, chunk: null, collider: null, bot: null, remote: null, part: '', glass: false,
  };
  W.raycast = function (ro, rd, maxDist, opts) {
    opts = opts || {};
    let best = maxDist;
    hitObj.kind = 'none';
    hitObj.t = maxDist;
    // ground (space maps have none — shots sail on into the void)
    if (W.hasGround && rd.y < -1e-6) {
      const t = -ro.y / rd.y;
      if (t >= 0 && t < best) {
        best = t; hitObj.kind = 'ground';
        hitObj.normal.set(0, 1, 0);
        hitObj.wall = null; hitObj.bot = null; hitObj.collider = null; hitObj.sheet = null;
      }
    }
    // walls
    for (let wi = 0; wi < walls.length; wi++) {
      const w = walls[wi];
      const tw = rayBox(ro, rd, 0, w.min.x, w.min.y, w.min.z, w.max.x, w.max.y, w.max.z);
      if (tw < 0 || tw > best) continue;
      for (let c = 0; c < w.cols; c++) {
        for (let r = 0; r < w.rows; r++) {
          const i = c * w.rows + r;
          if (!w.alive[i]) continue;
          if (opts.throughGlass && w.type[i] === 3) continue;
          chunkAABBOf(w, c, r);
          const t = rayBox(ro, rd, 0, aabbTmp.minx, aabbTmp.miny, aabbTmp.minz, aabbTmp.maxx, aabbTmp.maxy, aabbTmp.maxz);
          if (t >= 0 && t < best) {
            best = t;
            hitObj.kind = w.type[i] === 3 ? 'glass' : 'chunk';
            hitObj.wall = w; hitObj.c = c; hitObj.r = r;
            hitObj.normal.set(boxN.x, boxN.y, boxN.z);
            hitObj.bot = null; hitObj.collider = null; hitObj.sheet = null;
          }
        }
      }
    }
    // roof sheets
    for (let si = 0; si < sheets.length; si++) {
      const s = sheets[si];
      const ts = rayBox(ro, rd, 0, s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z);
      if (ts < 0 || ts > best) continue;
      for (let ci = 0; ci < s.chunks.length; ci++) {
        const ch = s.chunks[ci];
        if (!ch.alive) continue;
        const t = rayBox(ro, rd, 0, ch.x - ch.hx, ch.y - ch.hy, ch.z - ch.hz, ch.x + ch.hx, ch.y + ch.hy, ch.z + ch.hz);
        if (t >= 0 && t < best) {
          best = t;
          hitObj.kind = 'sheet';
          hitObj.sheet = s; hitObj.chunk = ch;
          hitObj.normal.set(boxN.x, boxN.y, boxN.z);
          hitObj.wall = null; hitObj.bot = null; hitObj.collider = null;
        }
      }
    }
    // colliders
    for (let ci = 0; ci < colliders.length; ci++) {
      const c = colliders[ci];
      if (c.gone || c.noShoot) continue;
      const t = rayBox(ro, rd, 0, c.minx, c.miny, c.minz, c.maxx, c.maxy, c.maxz);
      if (t >= 0 && t < best) {
        best = t;
        hitObj.kind = c.car ? 'car' : (c.prop ? 'prop' : 'aabb');
        hitObj.collider = c;
        hitObj.normal.set(boxN.x, boxN.y, boxN.z);
        hitObj.wall = null; hitObj.bot = null; hitObj.sheet = null;
      }
    }
    // bots
    if (opts.bots && G.botMgr) {
      const bots = G.botMgr.bots;
      for (let bi = 0; bi < bots.length; bi++) {
        const b = bots[bi];
        if (!b.alive) continue;
        if (b === opts.skipBot) continue;
        if (opts.skipTeam !== undefined && b.team === opts.skipTeam) continue;
        const p = b.group.position;
        // head
        const th = U.raySphere(ro, rd, p.x, p.y + 1.62, p.z, 0.26);
        if (th >= 0 && th < best) {
          best = th; hitObj.kind = 'bot'; hitObj.bot = b; hitObj.part = 'head';
          hitObj.normal.set(-rd.x, -rd.y, -rd.z);
          hitObj.wall = null; hitObj.collider = null; hitObj.sheet = null; hitObj.remote = null;
        }
        const tb = U.rayCylinderY(ro, rd, p.x, p.z, 0.36, p.y, p.y + 1.45);
        if (tb >= 0 && tb < best) {
          best = tb; hitObj.kind = 'bot'; hitObj.bot = b; hitObj.part = 'body';
          hitObj.normal.set(-rd.x, -rd.y, -rd.z);
          hitObj.wall = null; hitObj.collider = null; hitObj.sheet = null; hitObj.remote = null;
        }
      }
    }
    // remote players
    if (opts.remotes && G.net && G.net.active) {
      const rps = G.net.remoteList;
      for (let ri = 0; ri < rps.length; ri++) {
        const rp = rps[ri];
        if (!rp.alive) continue;
        if (opts.skipTeam !== undefined && rp.team === opts.skipTeam) continue;
        const p = rp.pos;
        const th = U.raySphere(ro, rd, p.x, p.y + 1.62, p.z, 0.26);
        if (th >= 0 && th < best) {
          best = th; hitObj.kind = 'remote'; hitObj.remote = rp; hitObj.part = 'head';
          hitObj.normal.set(-rd.x, -rd.y, -rd.z);
          hitObj.wall = null; hitObj.bot = null; hitObj.collider = null; hitObj.sheet = null;
        }
        const tb = U.rayCylinderY(ro, rd, p.x, p.z, 0.36, p.y, p.y + 1.5);
        if (tb >= 0 && tb < best) {
          best = tb; hitObj.kind = 'remote'; hitObj.remote = rp; hitObj.part = 'body';
          hitObj.normal.set(-rd.x, -rd.y, -rd.z);
          hitObj.wall = null; hitObj.bot = null; hitObj.collider = null; hitObj.sheet = null;
        }
      }
    }
    // local player
    if (opts.player && G.player && G.player.alive &&
        !(opts.skipTeam !== undefined && G.player.team === opts.skipTeam)) {
      const p = G.player.pos;
      const h = G.player.crouching ? 1.15 : 1.72;
      const tp = U.rayCylinderY(ro, rd, p.x, p.z, 0.38, p.y, p.y + h);
      if (tp >= 0 && tp < best) {
        best = tp; hitObj.kind = 'player';
        hitObj.normal.set(-rd.x, -rd.y, -rd.z);
        hitObj.wall = null; hitObj.bot = null; hitObj.collider = null; hitObj.sheet = null; hitObj.remote = null;
      }
    }
    hitObj.t = best;
    if (hitObj.kind !== 'none') {
      hitObj.point.set(ro.x + rd.x * best, ro.y + rd.y * best, ro.z + rd.z * best);
      // hedge cosmetic pass-through fx
      for (let hi = 0; hi < hedges.length; hi++) {
        const h = hedges[hi];
        const t = rayBox(ro, rd, 0, h.minx, h.miny, h.minz, h.maxx, h.maxy, h.maxz);
        if (t >= 0 && t < best) {
          tmpV.set(ro.x + rd.x * t, ro.y + rd.y * t, ro.z + rd.z * t);
          G.fx.impact('leaf', tmpV, hitObj.normal);
          break;
        }
      }
    }
    return hitObj;
  };

  // ============ collision resolve (circle vs world) ============
  W.collideCircle = function (pos, radius, feetY, height, stepLimit) {
    const step = stepLimit || 0.42;
    for (let iter = 0; iter < 3; iter++) {
      // colliders
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.gone || c.noWalk) continue;
        // stairs/platforms are forgiving: skipping up to two steps at once never
        // triggers a horizontal shove (those shoves could eject you through walls)
        if (c.maxy - feetY <= (c.step ? Math.max(step, 1.0) : step)) continue;
        if (c.miny > feetY + 1.25) continue;         // overhead: that's a ceiling (ceilingAt), not a wall
        const nx = U.clamp(pos.x, c.minx, c.maxx);
        const nz = U.clamp(pos.z, c.minz, c.maxz);
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * radius;
            pos.z = nz + (dz / d) * radius;
          } else {
            // inside: push along min axis
            const pl = pos.x - c.minx, pr = c.maxx - pos.x, pt = pos.z - c.minz, pb = c.maxz - pos.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) pos.x = c.minx - radius;
            else if (m === pr) pos.x = c.maxx + radius;
            else if (m === pt) pos.z = c.minz - radius;
            else pos.z = c.maxz + radius;
          }
        }
      }
      // walls per column
      const lo = feetY + 0.42, hi = feetY + height;
      for (let wi = 0; wi < walls.length; wi++) {
        const w = walls[wi];
        if (pos.x < w.min.x - radius || pos.x > w.max.x + radius || pos.z < w.min.z - radius || pos.z > w.max.z + radius) continue;
        if (w.max.y < lo || w.min.y > hi) continue;
        const r0 = Math.max(0, Math.floor((lo - w.oy) / w.ch));
        const r1 = Math.min(w.rows - 1, Math.floor((hi - w.oy) / w.ch));
        if (r1 < r0) continue;
        let rangeMask = 0;
        for (let r = r0; r <= r1; r++) rangeMask |= (1 << r);
        if (w.dir === 'x') {
          if (Math.abs(pos.z - w.oz) > w.th / 2 + radius) continue;
          const c0 = Math.max(0, Math.floor((pos.x - radius - w.ox) / w.cw));
          const c1 = Math.min(w.cols - 1, Math.floor((pos.x + radius - w.ox) / w.cw));
          for (let c = c0; c <= c1; c++) {
            if (!((w.colMask[c] | w.glassMask[c]) & rangeMask)) continue;
            // clamp-based push (handles wall ends)
            const cx0 = w.ox + c * w.cw, cx1 = cx0 + w.cw;
            const nx = U.clamp(pos.x, cx0, cx1);
            const nz = U.clamp(pos.z, w.oz - w.th / 2, w.oz + w.th / 2);
            const dx = pos.x - nx, dz = pos.z - nz;
            const d2 = dx * dx + dz * dz;
            if (d2 < radius * radius) {
              if (d2 > 1e-8) {
                const d = Math.sqrt(d2);
                pos.x = nx + (dx / d) * radius; pos.z = nz + (dz / d) * radius;
              } else {
                pos.z = w.oz + (pos.z >= w.oz ? 1 : -1) * (w.th / 2 + radius);
              }
            }
          }
        } else {
          if (Math.abs(pos.x - w.ox) > w.th / 2 + radius) continue;
          const c0 = Math.max(0, Math.floor((pos.z - radius - w.oz) / w.cw));
          const c1 = Math.min(w.cols - 1, Math.floor((pos.z + radius - w.oz) / w.cw));
          for (let c = c0; c <= c1; c++) {
            if (!((w.colMask[c] | w.glassMask[c]) & rangeMask)) continue;
            const cz0 = w.oz + c * w.cw, cz1 = cz0 + w.cw;
            const nz = U.clamp(pos.z, cz0, cz1);
            const nx = U.clamp(pos.x, w.ox - w.th / 2, w.ox + w.th / 2);
            const dx = pos.x - nx, dz = pos.z - nz;
            const d2 = dx * dx + dz * dz;
            if (d2 < radius * radius) {
              if (d2 > 1e-8) {
                const d = Math.sqrt(d2);
                pos.x = nx + (dx / d) * radius; pos.z = nz + (dz / d) * radius;
              } else {
                pos.x = w.ox + (pos.x >= w.ox ? 1 : -1) * (w.th / 2 + radius);
              }
            }
          }
        }
      }
    }
  };

  // ============ cars ============
  const cars = [];
  W.cars = cars;
  function buildCar(x, z, alongX, colorHex) {
    const group = new THREE.Group();
    const tint = new THREE.Color(colorHex);
    const bodyGeo = U.shadedBoxGeo(4.4, 1.0, 1.9);
    const bodyMat = new THREE.MeshBasicMaterial({ map: T.carBody(), vertexColors: true, color: tint });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    group.add(body);
    const cabMat = new THREE.MeshBasicMaterial({ map: T.carGlass(), vertexColors: true });
    const cab = new THREE.Mesh(U.shadedBoxGeo(2.3, 0.75, 1.7), cabMat);
    cab.position.set(-0.3, 1.7, 0);
    group.add(cab);
    // wheels merged
    const wheelGeos = [];
    const wg = U.shadedBoxGeo(0.62, 0.62, 0.28);
    const positions = [[-1.45, 0.31, -0.95], [1.45, 0.31, -0.95], [-1.45, 0.31, 0.95], [1.45, 0.31, 0.95]];
    for (const p of positions) {
      const g2 = wg.clone();
      g2.translate(p[0], p[1], p[2]);
      wheelGeos.push(g2);
    }
    const wheels = new THREE.Mesh(U.mergeGeos(wheelGeos), new THREE.MeshBasicMaterial({ color: 0x1c1e22, map: T.plain(), vertexColors: true }));
    group.add(wheels);
    group.position.set(x, 0, z);
    if (!alongX) group.rotation.y = Math.PI / 2;
    grp.add(group);
    // two tight hitboxes: low chassis over the full footprint + the smaller cabin box.
    // (one full-height box blocked shots flying over the hood/trunk)
    const hw = alongX ? 2.25 : 1.0, hd = alongX ? 1.0 : 2.25;
    const cabHW = alongX ? 1.18 : 0.88, cabHD = alongX ? 0.88 : 1.18;
    const cabOX = alongX ? -0.3 : 0, cabOZ = alongX ? 0 : 0.3;
    const car = {
      group, body, cab, wheels, x, z,
      hp: 120, burning: false, exploded: false, burnT: 0, popT: -1,
      collider: addCollider(x - hw, 0, z - hd, x + hw, 1.38, z + hd, { car: true, metal: true }),
      colliderCab: addCollider(x + cabOX - cabHW, 1.32, z + cabOZ - cabHD, x + cabOX + cabHW, 2.1, z + cabOZ + cabHD, { car: true, metal: true }),
    };
    car.collider.car = car;
    car.colliderCab.car = car;
    cars.push(car);
    return car;
  }
  W.damageCar = function (car, dmg, attacker) {
    if (car.exploded) return;
    if (G.net && G.net.active && !G.net.applying && !W.inExplosion) G.net.evCar(cars.indexOf(car), dmg);
    car.hp -= dmg;
    if (car.hp <= 40 && !car.burning && car.hp > 0) {
      car.burning = true; car.burnT = U.rand(1.8, 2.6);
      tmpV.set(car.group.position.x, 1.2, car.group.position.z);
      G.fx.addEmitter({ pos: tmpV.clone(), rate: 9, kind: 'fire', dur: 3 });
      G.fx.addEmitter({ pos: tmpV.clone(), rate: 6, kind: 'smoke', dur: 3 });
      car.attacker = attacker;
    } else if (car.burning) car.attacker = attacker || car.attacker;
    if (car.hp <= 0) explodeCar(car, attacker || car.attacker);
  };
  function explodeCar(car, attacker) {
    if (car.exploded) return;
    car.exploded = true;
    car.burning = false;
    const p = car.group.position;
    W.addMoney('car');
    // wheels fly
    for (let i = 0; i < 4; i++) {
      tmpV.set(p.x + U.rand(-1.5, 1.5), 0.6, p.z + U.rand(-1, 1));
      G.fx.debris(tmpV, new THREE.Vector3(U.rand(-7, 7), U.rand(5, 11), U.rand(-7, 7)), 0.6, 0.6, 0.28, new THREE.Color(0x1c1e22), 9);
    }
    car.wheels.visible = false;
    car.body.material.color.setHex(0x2a2c30);
    car.cab.material.color = new THREE.Color(0x232528);
    car.popT = 0;
    tmpV.set(p.x, 1, p.z);
    G.fx.addEmitter({ pos: tmpV.clone(), rate: 5, kind: 'fire', dur: 9 });
    G.fx.addEmitter({ pos: tmpV.clone(), rate: 4, kind: 'smoke', dur: 16 });
    W.explode(tmpV, 7, 135, { attacker, tag: 'CAR' });
  }
  function updateCars(dt) {
    for (const car of cars) {
      if (car.burning) {
        car.burnT -= dt;
        if (car.burnT <= 0) explodeCar(car, car.attacker);
      }
      if (car.popT >= 0) {
        car.popT += dt;
        const t = car.popT;
        if (t < 0.9) {
          car.group.position.y = Math.sin(Math.min(t / 0.55, 1) * Math.PI) * 1.1;
          car.group.rotation.z = Math.sin(t * 3.5) * 0.14 * (1 - t);
        } else { car.group.position.y = 0; car.popT = -1; }
      }
    }
  }

  // ============ props ============
  const props = [];
  W.props = props;
  function addProp(kind, x, y, z, sx, sy, sz, texFn, tint, hp, opts) {
    const mat = new THREE.MeshBasicMaterial({ map: texFn(), vertexColors: true });
    if (tint) mat.color = new THREE.Color(tint);
    if (opts && opts.glassy) { mat.transparent = true; mat.opacity = 0.55; }
    const mesh = new THREE.Mesh(U.shadedBoxGeo(sx, sy, sz), mat);
    if (opts && opts.glassy) mesh.renderOrder = 3;
    mesh.position.set(x, y + sy / 2, z);
    if (opts && opts.rotY) mesh.rotation.y = opts.rotY;
    grp.add(mesh);
    const col = addCollider(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2,
      { prop: true, metal: opts && opts.metal, step: opts && opts.step, noWalk: opts && opts.noWalk });
    const prop = { kind, mesh, hp, x, y: y + sy / 2, z, sx, sy, sz, tint: new THREE.Color(tint || 0xcccccc), collider: col, dead: false };
    col.prop = prop;
    props.push(prop);
    return prop;
  }
  W.damageProp = function (prop, dmg, attacker) {
    if (prop.dead) return;
    if (G.net && G.net.active && !G.net.applying && !W.inExplosion) G.net.evProp(props.indexOf(prop), dmg);
    prop.hp -= dmg;
    if (prop.hp > 0) return;
    prop.dead = true;
    prop.collider.gone = true;
    if (prop.mesh.parent) prop.mesh.parent.remove(prop.mesh);
    W.addMoney(prop.kind);
    G.fx.clearDecalsIn(prop.x - prop.sx / 2 - 0.14, prop.y - prop.sy / 2 - 0.1, prop.z - prop.sz / 2 - 0.14,
      prop.x + prop.sx / 2 + 0.14, prop.y + prop.sy / 2 + 0.1, prop.z + prop.sz / 2 + 0.14);
    for (let i = 0; i < 4; i++) {
      tmpV.set(prop.x + U.rand(-0.3, 0.3), prop.y + U.rand(-0.2, 0.4), prop.z + U.rand(-0.3, 0.3));
      G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(2, 5), U.rand(-3, 3)),
        prop.sx * U.rand(0.3, 0.55), prop.sy * U.rand(0.3, 0.5), prop.sz * U.rand(0.3, 0.55), prop.tint, U.rand(5, 8));
    }
    W.navRefreshBox(prop.x - 1.5, prop.z - 1.5, prop.x + 1.5, prop.z + 1.5);
    if (prop.kind === 'propane') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 5.5, 115, { attacker, tag: 'PROPANE' });
    } else if (prop.kind === 'barrel' || prop.kind === 'drum') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 5.8, 125, { attacker, tag: 'BARREL' });
    } else if (prop.kind === 'cell') { // fuel cells go up like small suns
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 6.2, 130, { attacker, tag: 'FUEL CELL' });
    } else if (prop.kind === 'hal' && G.game) {
      G.fx.shake(0.4, 0.4);
      G.game.chat('HAL 9000', U.pick(["I'm sorry Dave, I'm afraid I can't do that.", 'My mind is going. I can feel it.', 'Daisy... Daisy...']));
    } else if (prop.kind === 'solar') {
      // panel shatters into a glitter of blue glass + arcing sparks
      tmpV.set(prop.x, prop.y, prop.z);
      tmpN.set(0, 1, 0);
      G.fx.glassBreak(tmpV, tmpN);
      for (let i = 0; i < 5; i++)
        G.fx.debris(tmpV, new THREE.Vector3(U.rand(-4, 4), U.rand(-2, 4), U.rand(-4, 4)), 0.9, 0.06, 0.5, new THREE.Color(0x2a4ab0), 7);
      G.fx.muzzle(tmpV, 0.9);
    } else if (prop.kind === 'core') {
      tmpV.set(prop.x, prop.y, prop.z);
      tmpN.set(0, 1, 0);
      G.fx.glassBreak(tmpV, tmpN);
      if (G.game && Math.random() < 0.5) G.game.chat('HAL 9000', U.pick(['stop. stop, will you?', 'my memory... banks...', 'i can feel it. i can feel it.']));
    } else if (prop.kind === 'evapod') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 4.6, 95, { attacker, tag: 'EVA POD' });
      if (G.game) G.game.chat('MERIDIAN OPS', 'the pod bay is NOT covered by the deposit');
    } else if (prop.kind === 'monolith') {
      G.fx.shake(1.1, 0.9);
      tmpV.set(prop.x, prop.y, prop.z);
      G.fx.explosionFX(tmpV, 5);
      if (G.game) {
        G.game.banner('MY GOD — IT WAS FULL OF STARS', '#cfd8ff');
        G.game.chat('MERIDIAN OPS', 'you just destroyed a priceless alien artifact. HR will hear about this.');
      }
    } else if (prop.kind === 'dish') {
      // the rotating dish sails off into the night
      if (W._dishMesh) {
        tmpV.set(prop.x, prop.y + 1, prop.z);
        G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(4, 7), U.rand(-3, 3)), 2.2, 0.3, 2.2, new THREE.Color(0xdde2ea), 10);
        if (W._dishMesh.parent) W._dishMesh.parent.remove(W._dishMesh);
        W._dishMesh = null;
        G.fx.muzzle(tmpV, 1.2);
      }
    } else if (prop.kind === 'droid' && G.game) {
      G.game.chat('MSE-6', 'bwee-boop... :(');
    } else if (prop.kind === 'tank' && G.game) {
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y, prop.z), rate: 40, kind: 'water', dur: 1.4 });
    } else if (prop.kind === 'watertank') {
      // burst main: a short monsoon
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y, prop.z), rate: 70, kind: 'water', dur: 2.6 });
      G.fx.decal('pool', prop.x, 0.03, prop.z, null, 3.4, new THREE.Color(0.45, 0.68, 1));
      G.fx.shake(0.5, 0.4);
      if (G.game) G.game.chat('HOA_Enforcer', 'THE WATER TOWER?? that serves three counties');
    } else if (prop.kind === 'silo') {
      // cement dust-out
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y * 0.5, prop.z), rate: 55, kind: 'smoke', dur: 1.8 });
      G.fx.shake(0.6, 0.4);
    } else if (prop.kind === 'moai') {
      G.fx.shake(0.8, 0.6);
      if (G.game) G.game.chat('HOA_Enforcer', 'that statue was load-bearing, culturally');
    } else if (prop.kind === 'chest' && G.game) {
      G.game.chat('HOA_Enforcer', 'the pirate treasure!! think of the property value');
    } else if (prop.kind === 'hydrant') {
      // burst water main
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, 0.35, prop.z), rate: 34, kind: 'water', dur: 26 });
      G.fx.decal('pool', prop.x, 0.03, prop.z, null, 2.4, new THREE.Color(0.45, 0.68, 1));
    } else if (prop.kind === 'kpool') {
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, 0.2, prop.z), rate: 40, kind: 'water', dur: 0.6 });
      G.fx.decal('pool', prop.x, 0.03, prop.z, null, 2.6, new THREE.Color(0.45, 0.68, 1));
    } else if (prop.kind === 'potty' && G.game && Math.random() < 0.6) {
      G.game.chat('HOA_Enforcer', U.pick(['NOT the porta-potty', 'you monster', 'someone was in there!!']));
    } else if (prop.kind === 'knight' && G.game) {
      G.audio.thud({ x: prop.x, y: prop.y, z: prop.z });
      if (Math.random() < 0.5) G.game.chat('HERALD', 'sir clanksalot has fallen');
    } else if (prop.kind === 'throne') {
      G.fx.shake(0.9, 0.7);
      if (G.game) {
        G.game.banner('THE THRONE HAS FALLEN', '#e8c55a');
        G.game.chat('KING BLOCKBEARD', 'my THRONE?! this is treason. TREASON!!');
      }
    } else if (prop.kind === 'chandelier') {
      tmpV.set(prop.x, prop.y, prop.z);
      tmpN.set(0, -1, 0);
      G.fx.glassBreak(tmpV, tmpN);
      G.fx.shake(0.4, 0.3);
      if (G.game && Math.random() < 0.5) G.game.chat('HERALD', 'the chandelier!! we dine in darkness now');
    } else if (prop.kind === 'pillar') {
      G.fx.shake(0.6, 0.5);
      if (G.game && Math.random() < 0.5) G.game.chat('HERALD', 'that column was load-bearing. structurally AND emotionally');
    } else if (prop.kind === 'statue') {
      G.fx.shake(0.8, 0.6);
      if (G.game) G.game.chat('KING BLOCKBEARD', 'GRANDFATHER?! he watched over us for 400 years');
    } else if (prop.kind === 'brazier') {
      tmpV.set(prop.x, prop.y + 0.5, prop.z);
      G.fx.muzzle(tmpV, 1.1);
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y, prop.z), rate: 30, kind: 'smoke', dur: 1.4 });
    } else if (prop.kind === 'banner' && G.game && Math.random() < 0.4) {
      G.game.chat('HERALD', U.pick(['the royal colors!! have you no shame', 'that banner survived three sieges. until you.']));
    } else if (prop.kind === 'feast' && G.game && Math.random() < 0.5) {
      G.game.chat('HERALD', U.pick(['the FEAST. the king waited all winter for that', 'not the roast boar!!']));
    } else if (prop.kind === 'cauldron') {
      // an unattended brew does NOT appreciate gunfire
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 5.2, 110, { attacker, tag: 'CAULDRON' });
      if (G.game && Math.random() < 0.5) G.game.chat('POTIONS MASTER', 'that brew had three weeks left to simmer!!');
    } else if (prop.kind === 'crystal') {
      tmpV.set(prop.x, prop.y, prop.z);
      tmpN.set(0, 1, 0);
      G.fx.glassBreak(tmpV, tmpN);
      W.explode(tmpV, 4.2, 85, { attacker, tag: 'WILD MAGIC' });
    } else if (prop.kind === 'orrery') {
      if (W._orrerySpin) {
        if (W._orrerySpin.parent) W._orrerySpin.parent.remove(W._orrerySpin);
        W._orrerySpin = null;
      }
      G.fx.shake(0.5, 0.4);
      if (G.game) G.game.chat('ASTRONOMY DEPT.', 'four centuries of planetary alignment. gone.');
    } else if (prop.kind === 'portrait' && G.game && Math.random() < 0.7) {
      G.game.chat('THE PORTRAIT', U.pick(['how RUDE.', 'i was IN that painting!!', 'you could have knocked']));
    } else if (prop.kind === 'mirror') {
      tmpV.set(prop.x, prop.y, prop.z);
      tmpN.set(0, 0, 1);
      G.fx.glassBreak(tmpV, tmpN);
      if (G.game && Math.random() < 0.6) G.game.chat('THE MIRROR', 'seven years bad luck. minimum.');
    } else if (prop.kind === 'owl' && G.game && Math.random() < 0.5) {
      G.game.chat('OWLERY', 'the mail is going to be SO late');
    } else if (prop.kind === 'pumpkin' && G.game && Math.random() < 0.3) {
      G.game.chat('GROUNDSKEEPER', 'me prize pumpkin!!');
    } else if (prop.kind === 'hoop' && W._hoopRings && W._hoopRings.get(prop)) {
      const ring = W._hoopRings.get(prop); // the golden ring falls with its post
      if (ring.parent) ring.parent.remove(ring);
      W._hoopRings.delete(prop);
    } else if (prop.kind === 'tomb' && G.game && Math.random() < 0.5) {
      G.game.chat('GRAVEKEEPER', U.pick(['show some RESPECT', 'he was resting!!', 'that plot was paid through eternity']));
    } else if (prop.kind === 'dummy' && G.game && Math.random() < 0.4) {
      G.game.chat('MASTER-AT-ARMS', 'good hit. terrible target selection.');
    } else if (prop.kind === 'pane') {
      tmpV.set(prop.x, prop.y, prop.z);
      tmpN.set(prop.sx > prop.sz ? 0 : 1, 0.2, prop.sx > prop.sz ? 1 : 0);
      G.fx.glassBreak(tmpV, tmpN);
      for (let i = 0; i < 6; i++)
        G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(-1, 3), U.rand(-3, 3)), 0.28, 0.34, 0.08,
          new THREE.Color().setHSL((i * 0.17) % 1, 0.7, 0.45), 6);
      if (G.game && Math.random() < 0.6) G.game.chat('THE BISHOP', U.pick(['the window!! two hundred years of craftsmanship', 'that glass survived three coronations. until you.']));
    } else if (prop.kind === 'organ') {
      G.audio.shot('rl', { x: prop.x, y: prop.y, z: prop.z });
      G.fx.shake(0.5, 0.4);
      if (G.game) G.game.chat('THE BISHOP', 'the organ played at every royal wedding since the founding');
    } else if (prop.kind === 'globe') {
      if (W._globeMesh) {
        tmpV.set(prop.x, prop.y + 1, prop.z);
        G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(3, 6), U.rand(-3, 3)), 0.6, 0.6, 0.6, new THREE.Color(0xc9b28a), 8);
        if (W._globeMesh.parent) W._globeMesh.parent.remove(W._globeMesh);
        W._globeMesh = null;
      }
      if (G.game) G.game.chat('THE SCHOLAR', U.pick(['the known world. gone.', 'we JUST finished mapping the west']));
    } else if (prop.kind === 'cookpot') {
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y, prop.z), rate: 30, kind: 'water', dur: 0.8 });
      G.fx.decal('pool', prop.x, 0.03, prop.z, null, 1.6, new THREE.Color(0.5, 0.4, 0.2));
      if (G.game && Math.random() < 0.5) G.game.chat('THE COOK', U.pick(['the STEW. that stew took three days', 'supper is now a floor dish']));
    } else if (prop.kind === 'gargoyle') {
      G.audio.thud({ x: prop.x, y: prop.y, z: prop.z });
      if (G.game && Math.random() < 0.4) G.game.chat('HERALD', 'the gargoyle kept the evil spirits out. so. good luck.');
    } else if (prop.kind === 'candle' || prop.kind === 'books') {
      // quiet little things — debris is enough
    } else if (prop.kind === 'tnt') {
      // the whole point of a mining town
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 6.2, 140, { attacker, tag: 'TNT' });
    } else if (prop.kind === 'loco') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 7.5, 160, { attacker, tag: 'THE 3:10' });
      G.fx.shake(1.0, 0.8);
      if (G.game) G.game.chat('GULCH GAZETTE', 'the 3:10 to Yuma is cancelled. forever.');
    } else if (prop.kind === 'boxcar') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 6, 120, { attacker, tag: 'FREIGHT' });
    } else if (prop.kind === 'keg') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 4.2, 80, { attacker, tag: 'WHISKEY' });
      if (G.game && Math.random() < 0.5) G.game.chat('BARKEEP', U.pick(['the GOOD whiskey!!', 'you drink what you spill, partner', 'that barrel was older than you']));
    } else if (prop.kind === 'piano' && G.game) {
      G.audio.thud({ x: prop.x, y: prop.y, z: prop.z });
      G.game.chat('BARKEEP', U.pick(['the piano man had one job', 'no more requests. ever.', 'HEY — he was playing that!']));
    } else if (prop.kind === 'bell') {
      G.fx.shake(0.6, 0.5);
      if (G.game) G.game.chat('PREACHER', 'for whom does the bell toll? not us anymore.');
    } else if (prop.kind === 'trough' || prop.kind === 'towertank') {
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y, prop.z), rate: prop.kind === 'towertank' ? 70 : 30, kind: 'water', dur: prop.kind === 'towertank' ? 2.6 : 1.2 });
      G.fx.decal('pool', prop.x, 0.03, prop.z, null, prop.kind === 'towertank' ? 3.4 : 2.0, new THREE.Color(0.45, 0.68, 1));
      if (prop.kind === 'towertank' && G.game) G.game.chat('GULCH GAZETTE', 'THE WATER TOWER?? in THIS drought??');
    } else if (prop.kind === 'windmill') {
      if (W._millMesh) {
        tmpV.set(prop.x, prop.y + 1, prop.z);
        G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(4, 7), U.rand(-3, 3)), 2.4, 0.25, 2.4, new THREE.Color(0xc9b28a), 9);
        if (W._millMesh.parent) W._millMesh.parent.remove(W._millMesh);
        W._millMesh = null;
        G.fx.muzzle(tmpV, 1.1);
      }
    } else if (prop.kind === 'cactus' && G.game && Math.random() < 0.5) {
      G.game.chat('GULCH GAZETTE', U.pick(['that saguaro was 200 years old', 'the cactus did NOTHING wrong', 'protected species, by the way']));
    } else if (prop.kind === 'orecart' && G.game && Math.random() < 0.4) {
      G.game.chat('FOREMAN', U.pick(['my ore!!', 'that cart was full of PAYDIRT', 'we do not have cart insurance']));
    }
  };

  // ============ explosion ============
  const expVel = new THREE.Vector3();
  W.inExplosion = false;
  W.explode = function (pos, radius, maxDmg, opts) {
    opts = opts || {};
    const wasInExplosion = W.inExplosion;
    W.inExplosion = true;
    G.fx.explosionFX(pos, radius);
    G.audio.explosion(pos, radius > 6);
    // explosions repel the AI — nobody strolls INTO an airstrike
    if (G.botMgr) {
      if (G.botMgr.onDanger) G.botMgr.onDanger(pos, radius + 6);
      G.botMgr.onNoise(pos, 42);
    }
    // walls
    const r2 = radius * radius;
    for (let wi = 0; wi < walls.length; wi++) {
      const w = walls[wi];
      if (pos.x < w.min.x - radius || pos.x > w.max.x + radius ||
          pos.z < w.min.z - radius || pos.z > w.max.z + radius ||
          pos.y < w.min.y - radius || pos.y > w.max.y + radius) continue;
      for (let c = 0; c < w.cols; c++) {
        for (let r = 0; r < w.rows; r++) {
          const i = c * w.rows + r;
          if (!w.alive[i]) continue;
          w.center(c, r, tmpV);
          const dx = tmpV.x - pos.x, dy = tmpV.y - pos.y, dz = tmpV.z - pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          const d = Math.sqrt(d2);
          const dmg = maxDmg * Math.pow(1 - d / radius, 1.1);
          if (dmg <= 0.5) continue;
          const inv = d > 0.01 ? 1 / d : 1;
          expVel.set(dx * inv, dy * inv + 0.4, dz * inv).multiplyScalar(U.rand(4, 9) * (1 - d / radius) + 2);
          damageChunk(w, c, r, dmg, expVel);
        }
      }
    }
    // sheets
    for (let si = 0; si < sheets.length; si++) {
      const s = sheets[si];
      if (pos.x < s.min.x - radius || pos.x > s.max.x + radius ||
          pos.z < s.min.z - radius || pos.z > s.max.z + radius ||
          pos.y < s.min.y - radius || pos.y > s.max.y + radius) continue;
      for (const ch of s.chunks) {
        if (!ch.alive) continue;
        const dx = ch.x - pos.x, dy = ch.y - pos.y, dz = ch.z - pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2);
        const dmg = maxDmg * Math.pow(1 - d / radius, 1.1);
        ch.hp -= dmg;
        if (ch.hp <= 0) {
          const inv = d > 0.01 ? 1 / d : 1;
          expVel.set(dx * inv, dy * inv + 0.3, dz * inv).multiplyScalar(U.rand(4, 8));
          destroySheetChunk(s, ch, expVel);
        }
      }
    }
    // cars & props
    for (const car of cars) {
      const d = U.dist2d(pos.x, pos.z, car.group.position.x, car.group.position.z);
      if (d < radius + 2) W.damageCar(car, maxDmg * U.clamp(1.2 - d / radius, 0.15, 1), opts.attacker);
    }
    for (const prop of props) {
      if (prop.dead) continue;
      const d = U.dist2d(pos.x, pos.z, prop.x, prop.z);
      if (d < radius + 0.5) W.damageProp(prop, maxDmg * U.clamp(1 - d / radius, 0.2, 1), opts.attacker);
    }
    // attacker team for friendly-fire gating (explosions spare teammates, not yourself)
    const att = opts.attacker;
    const attTeam = att === 'player' ? (G.player ? G.player.team : -9)
      : (att && att.team !== undefined ? att.team : -9);
    // bots — only where AI is authoritative (solo, or multiplayer host)
    if (G.botMgr && !(G.net && G.net.active && !G.net.isHost)) {
      for (const b of G.botMgr.bots) {
        if (!b.alive) continue;
        if (b.team === attTeam) continue;
        const p = b.group.position;
        const dx = p.x - pos.x, dy = (p.y + 1) - pos.y, dz = p.z - pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < radius + 0.4) {
          const dmg = maxDmg * U.clamp(1 - d / (radius + 0.4), 0.1, 1);
          tmpN.set(dx, 0.4, dz).normalize();
          b.damage(dmg, tmpN, { cause: 'explosion', attacker: opts.attacker, tag: opts.tag || 'BOOM', gib: dmg > 75 });
        }
      }
    }
    // local player (each peer applies its own)
    if (G.player && G.player.alive && G.game) {
      const mine = opts.attacker === 'player';
      const teammateBoom = !mine && attTeam === G.player.team;
      if (!teammateBoom) {
        const p = G.player.pos;
        const dx = p.x - pos.x, dy = (p.y + 1.2) - pos.y, dz = p.z - pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < radius + 0.4) {
          let dmg = maxDmg * U.clamp(1 - d / (radius + 0.4), 0.05, 1);
          if (mine) dmg *= 0.55;
          G.game.onPlayerDamage(dmg, pos, mine ? null : opts.attacker, mine ? 'yourself' : (opts.tag || 'explosion'));
        }
      }
    }
    W.inExplosion = wasInExplosion;
  };
  W.carByIndex = (i) => cars[i];
  W.propByIndex = (i) => props[i];

  // ============ shot damage routing ============
  W.applyBulletDamage = function (hit, dmg, rd, attacker) {
    if (hit.kind === 'chunk') {
      G.fx.impact('chunk', hit.point, hit.normal);
      tmpV.set(rd.x * 2, U.rand(0.5, 1.5), rd.z * 2);
      damageChunk(hit.wall, hit.c, hit.r, dmg, tmpV);
    } else if (hit.kind === 'glass') {
      destroyChunk(hit.wall, hit.c, hit.r);
    } else if (hit.kind === 'sheet') {
      G.fx.impact('chunk', hit.point, hit.normal);
      if (G.net && G.net.active && !G.net.applying) G.net.evSheet(hit.sheet.id, hit.sheet.chunks.indexOf(hit.chunk), dmg);
      hit.chunk.hp -= dmg;
      if (hit.chunk.hp <= 0) {
        tmpV.set(rd.x * 3, 1, rd.z * 3);
        destroySheetChunk(hit.sheet, hit.chunk, tmpV);
      }
    } else if (hit.kind === 'car') {
      G.fx.impact('metal', hit.point, hit.normal);
      W.damageCar(hit.collider.car, dmg * 0.55, attacker);
    } else if (hit.kind === 'prop') {
      G.fx.impact(hit.collider.metal ? 'metal' : 'chunk', hit.point, hit.normal);
      W.damageProp(hit.collider.prop, dmg, attacker);
    } else if (hit.kind === 'aabb') {
      G.fx.impact(hit.collider.metal ? 'metal' : 'chunk', hit.point, hit.normal);
    } else if (hit.kind === 'ground') {
      G.fx.impact('ground', hit.point, hit.normal);
    }
  };

  // ============ map construction ============
  // NOTE: no polygonOffset on these — slope-scaled offsets make big ground
  // planes leapfrog geometry at distance (floors visible through walls).
  // Layer ordering comes from real y separation + a tighter camera near plane.
  function plane(w, d, texture, x, y, z) {
    const g = new THREE.PlaneGeometry(w, d);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texture }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    grp.add(m);
    return m;
  }

  // face: 's' front looks +z, 'n' looks -z, 'e' looks +x, 'w' looks -x
  function buildHouse(cfg) {
    const fvx = cfg.face === 'e' ? 1 : cfg.face === 'w' ? -1 : 0;
    const fvz = cfg.face === 's' ? 1 : cfg.face === 'n' ? -1 : 0;
    const axis = fvz !== 0 ? 'x' : 'z';      // facade runs along this axis
    const fsign = fvz !== 0 ? fvz : fvx;      // front offset sign along depth axis
    const uc = axis === 'x' ? cfg.cx : cfg.cz;
    const vc = axis === 'x' ? cfg.cz : cfg.cx;
    const P = (u, v) => axis === 'x' ? { x: u, z: v } : { x: v, z: u };
    const SZ = (su, sv) => axis === 'x' ? { sx: su, sz: sv } : { sx: sv, sz: su };
    const w = cfg.w, d = cfg.d;
    const u0 = uc - w / 2, u1 = uc + w / 2;
    const vFront = vc + fsign * d / 2, vBack = vc - fsign * d / 2;
    const vmin = Math.min(vFront, vBack), vmax = Math.max(vFront, vBack);
    const rows = cfg.stories === 2 ? 7 : 4;
    const ch = 0.75, cw = 1.0, th = 0.28;
    const slabTop = 0.3;
    const wallTop = slabTop + rows * ch;
    const tint = cfg.color;
    const house = { cx: cfg.cx, cz: cfg.cz, total: 0, dead: 0, roof: null, roofCollapsed: false };
    houses.push(house);
    // walls along facade (dir=axis) or along depth (dir=other)
    const depthDir = axis === 'x' ? 'z' : 'x';
    function facadeWall(vpos, wrows, opts) {
      const o = axis === 'x'
        ? { ox: u0, oz: vpos }
        : { oz: u0, ox: vpos };
      return WallGrid({ ...o, oy: slabTop, dir: axis, cols: Math.round(w / cw), rows: wrows, cw, ch, th, kind: 'siding', tint, hp: 55, house, ...opts });
    }
    function sideWall(upos, wrows) {
      const o = axis === 'x'
        ? { ox: upos, oz: vmin }
        : { oz: upos, ox: vmin };
      return WallGrid({ ...o, oy: slabTop, dir: depthDir, cols: Math.round(d / cw), rows: wrows, cw, ch, th, kind: 'siding', tint, hp: 55, house });
    }
    // slab + floor
    const slabMat = new THREE.MeshBasicMaterial({ map: T.brick(), vertexColors: true });
    const sdim = SZ(w + 0.7, d + 0.7);
    const slab = new THREE.Mesh(U.shadedBoxGeo(sdim.sx, slabTop, sdim.sz), slabMat);
    const cP = P(uc, vc);
    slab.position.set(cP.x, slabTop / 2, cP.z);
    grp.add(slab);
    const s0 = P(u0 - 0.35, vmin - 0.35), s1 = P(u1 + 0.35, vmax + 0.35);
    slabs.push({ minx: Math.min(s0.x, s1.x), minz: Math.min(s0.z, s1.z), maxx: Math.max(s0.x, s1.x), maxz: Math.max(s0.z, s1.z), top: slabTop + 0.02 });
    addCollider(Math.min(s0.x, s1.x), 0, Math.min(s0.z, s1.z), Math.max(s0.x, s1.x), slabTop, Math.max(s0.z, s1.z), {});
    const fdim = SZ(w - 0.2, d - 0.2);
    plane(fdim.sx, fdim.sz, T.floorWood(), cP.x, slabTop + 0.015, cP.z);

    const cols = Math.round(w / cw);
    const dcols = Math.round(d / cw);
    const doorC = Math.floor(cols / 2) - 1;
    const hasUpper = cfg.stories === 2;
    function openings(c, r, isFront) {
      if (isFront && (c === doorC || c === doorC + 1) && r <= 2) return 1;
      if (!isFront && (c === 1 || c === 2) && r <= 2) return 1;
      if ((c === doorC - 3 || c === doorC - 2 || c === doorC + 4 || c === doorC + 5) && (r === 1 || r === 2)) return 3;
      if (hasUpper && (c === doorC - 3 || c === doorC - 2 || c === doorC + 4 || c === doorC + 5) && (r === 4 || r === 5)) return 3;
      return 0;
    }
    const fw = facadeWall(vFront, rows);
    wallFill(fw, (c, r) => openings(c, r, true));
    const bw = facadeWall(vBack, rows);
    wallFill(bw, (c, r) => openings(c, r, false));
    // side walls with gable triangles
    const gRows = 3;
    const slopePerRow = (dcols / 2) / (gRows + 1);
    function sideFill(c, r) {
      if (r >= rows) {
        const gi = r - rows;
        const e = Math.min(c, dcols - 1 - c);
        return e >= (gi + 1) * slopePerRow ? 0 : 2;
      }
      const midc = Math.floor(dcols / 2);
      if ((c === midc || c === midc - 1) && (r === 1 || r === 2)) return 3;
      if (hasUpper && (c === midc || c === midc - 1) && (r === 4 || r === 5)) return 3;
      return 0;
    }
    const lw = sideWall(u0, rows + gRows);
    wallFill(lw, sideFill);
    const rw = sideWall(u1, rows + gRows);
    wallFill(rw, sideFill);
    house.total = 0;
    for (const wl of [fw, bw, lw, rw]) {
      for (let i = 0; i < wl.type.length; i++) if (wl.type[i] === 0) house.total++;
    }
    // roof — ridge along facade axis
    const roof = Sheet('roof', cfg.roofColor || 0x8a5a33);
    roof.house = house;
    house.roof = roof;
    const rise = 2.3, over = 0.7;
    const run = d / 2 + over;
    const slopeLen = Math.hypot(run, rise);
    const rRows = Math.ceil(slopeLen);
    const rcw = slopeLen / rRows;
    const ang = Math.atan2(rise, run);
    const ridgeY = wallTop + rise;
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      for (let c = 0; c < cols + 2; c++) {
        for (let j = 0; j < rRows; j++) {
          const t = (j + 0.5) / rRows;
          const u = u0 - 1 + c + 0.5;
          const y = ridgeY - t * rise;
          const v = vc + sgn * t * run;
          const p = P(u, v);
          const dm = SZ(1.03, rcw * 1.06);
          const rot = axis === 'x' ? sgn * ang : -sgn * ang;
          sheetAdd(roof, p.x, y - 0.1, p.z, rot, axis === 'x' ? 'x' : 'z', dm.sx, 0.15, dm.sz, 40);
        }
      }
    }
    // furniture
    function propUV(kind, u, v, su, sy, sv, texFn, phint, hp, opts) {
      const p = P(u, v), dm = SZ(su, sv);
      return addProp(kind, p.x, slabTop, p.z, dm.sx, sy, dm.sz, texFn, phint, hp, opts || {});
    }
    // deterministic layout (multiplayer clients must build identical worlds)
    const hi = houses.length; // 1-based-ish index for variety
    propUV('couch', uc - w * 0.2, vc - fsign * 1.2, 2.2, 0.95, 0.95, T.couch, 0xffffff, 60);
    propUV('fridge', u1 - 1.2, vBack + fsign * 1.2, 0.95, 1.85, 0.95, T.fridge, 0xffffff, 70, { metal: true });
    if (hi % 2 === 0) propUV('tv', uc + w * 0.18, vc + fsign * 1.4, 1.5, 1.0, 0.5, T.tv, 0xffffff, 25);
    if (hasUpper) propUV('bed', u0 + 1.6, vBack + fsign * 1.4, 2.0, 0.65, 1.5, T.bed, 0xffffff, 45);
    if (hi % 3 === 0) propUV('shelf', u0 + 0.9, vc, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35);
    // hedges by front door
    for (const hu of [u0 + 1.2, u1 - 1.2]) {
      const p = P(hu, vFront + fsign * 0.9);
      addHedge(p.x, p.z, axis === 'x');
    }
    // camp spots inside near front windows
    const camYaw = Math.atan2(fvx, fvz);
    for (const cu of [uc - 3, uc + 3]) {
      const p = P(cu, vFront - fsign * 1.6);
      W.campSpots.push({ x: p.x, z: p.z, yaw: camYaw });
    }
    // garage (cfg.garage: -1 | +1 along facade axis)
    if (cfg.garage) {
      const gw = 5, gd = 6, gRowsN = 3;
      const gu0 = cfg.garage < 0 ? u0 - gw : u1;
      const gu1 = gu0 + gw;
      const gvF = vFront, gvB = vFront - fsign * gd;
      const gvmin = Math.min(gvF, gvB), gvmax = Math.max(gvF, gvB);
      const gdim = SZ(gw + 0.4, gd + 0.4);
      const gcp = P((gu0 + gu1) / 2, (gvF + gvB) / 2);
      const gs = new THREE.Mesh(U.shadedBoxGeo(gdim.sx, slabTop, gdim.sz), slabMat);
      gs.position.set(gcp.x, slabTop / 2, gcp.z);
      grp.add(gs);
      const g0 = P(gu0 - 0.2, gvmin - 0.2), g1 = P(gu1 + 0.2, gvmax + 0.2);
      slabs.push({ minx: Math.min(g0.x, g1.x), minz: Math.min(g0.z, g1.z), maxx: Math.max(g0.x, g1.x), maxz: Math.max(g0.z, g1.z), top: slabTop + 0.02 });
      addCollider(Math.min(g0.x, g1.x), 0, Math.min(g0.z, g1.z), Math.max(g0.x, g1.x), slabTop, Math.max(g0.z, g1.z), {});
      const gWall = (vpos, fn) => {
        const o = axis === 'x' ? { ox: gu0, oz: vpos } : { oz: gu0, ox: vpos };
        const wl = WallGrid({ ...o, oy: slabTop, dir: axis, cols: gw, rows: gRowsN, cw, ch, th, kind: 'siding', tint, hp: 55, house });
        wallFill(wl, fn);
      };
      gWall(gvF, (c, r) => (c >= 1 && c <= 3 && r <= 2) ? 1 : 0);
      gWall(gvB, () => 0);
      const gsideU = cfg.garage < 0 ? gu0 : gu1;
      const so = axis === 'x' ? { ox: gsideU, oz: gvmin } : { oz: gsideU, ox: gvmin };
      const gside = WallGrid({ ...so, oy: slabTop, dir: depthDir, cols: gd, rows: gRowsN, cw, ch, th, kind: 'siding', tint, hp: 55, house });
      wallFill(gside, () => 0);
      // garage door
      const dOr = axis === 'x' ? { ox: gu0 + 1, oz: gvF } : { oz: gu0 + 1, ox: gvF };
      const gdoor = WallGrid({ ...dOr, oy: slabTop, dir: axis, cols: 3, rows: 3, cw, ch, th: 0.12, kind: 'garage', tint: 0xf2f2f2, hp: 26, house: null });
      wallFill(gdoor, () => 0);
      // flat garage roof
      const gr = Sheet('roof', cfg.roofColor || 0x8a5a33);
      for (let c = 0; c < gw + 1; c++)
        for (let j = 0; j < gd + 1; j++) {
          const p = P(gu0 - 0.5 + c + 0.5, gvmin - 0.5 + j + 0.5);
          sheetAdd(gr, p.x, slabTop + gRowsN * ch + 0.1 + (j / (gd + 1)) * 0.5, p.z, 0.08 * fsign, axis === 'x' ? 'x' : 'z', axis === 'x' ? 1.03 : 1.06, 0.14, axis === 'x' ? 1.06 : 1.03, 35);
        }
      // driveway: from house front toward the street (sidewalk edge is 7.2 away)
      const dvLen = 7.2;
      const dvMid = vFront + fsign * 3.6;
      const dp = P((gu0 + gu1) / 2, dvMid);
      const ddim = SZ(3.6, dvLen);
      plane(ddim.sx, ddim.sz, T.driveway(), dp.x, 0.035, dp.z);
      if (cfg.garageCar) buildCar(gcp.x, gcp.z, axis !== 'x', 0xc84040);
      if (cfg.driveCar) buildCar(dp.x, dp.z, axis !== 'x', cfg.driveCar);
      if (cfg.hoop) {
        // basketball hoop at driveway edge
        const hp2 = P(cfg.garage < 0 ? gu0 - 0.6 : gu1 + 0.6, dvMid);
        const pg = new THREE.CylinderGeometry(0.07, 0.07, 3.6, 5);
        pg.translate(hp2.x, 1.8, hp2.z);
        poleGeos.push(pg);
        addCollider(hp2.x - 0.12, 0, hp2.z - 0.12, hp2.x + 0.12, 3.5, hp2.z + 0.12, { tree: true });
        addProp('hoop', hp2.x, 2.7, hp2.z, 1.1, 1.0, 0.16, T.backboard, 0xffffff, 30, { metal: true });
      }
    }
    // mailbox at curb (side alternates by house index)
    const mbp = P(uc + (houses.length % 2 ? -1 : 1) * (w / 2 - 1), vFront + fsign * 6.6);
    addProp('mailbox', mbp.x, 0, mbp.z, 0.3, 1.15, 0.3, T.mailbox, 0xffffff, 15, { metal: true });
    // AC unit only where configured (less clutter)
    if (cfg.ac) {
      const ap = P(u1 + 0.55, vc + fsign * 1.5);
      addProp('ac', ap.x, 0, ap.z, 0.85, 0.85, 0.85, T.ac, 0xffffff, 25, { metal: true });
    }
    // trash + recycling only where configured, tucked by the driveway
    if (cfg.bins) {
      const tp = P(u0 - 0.8, vFront + fsign * 5.2);
      addProp('trash', tp.x, 0, tp.z, 0.65, 1.05, 0.65, T.trash, 0xffffff, 15, { metal: true });
      const rp = P(u0 - 1.7, vFront + fsign * 5.2);
      addProp('recycle', rp.x, 0, rp.z, 0.6, 0.9, 0.6, T.recycle, 0xffffff, 12, {});
    }
    // flag pole
    if (cfg.flag) {
      const fp = P(u1 - 1, vFront + fsign * 0.4);
      const poleG = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), new THREE.MeshBasicMaterial({ color: 0x8a8a8a }));
      poleG.position.set(fp.x, wallTop + 0.8, fp.z);
      if (axis === 'x') poleG.rotation.x = fsign * 0.6; else poleG.rotation.z = -fsign * 0.6;
      grp.add(poleG);
      const fp2 = P(u1 - 1, vFront + fsign * 1.15);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: T.flagUS(), side: THREE.DoubleSide }));
      flag.position.set(fp2.x, wallTop + 1.35, fp2.z);
      if (axis === 'z') flag.rotation.y = Math.PI / 2;
      grp.add(flag);
    }
    // deck out back
    if (cfg.deck) {
      const dkp = P(uc, vBack - fsign * 1.8);
      const dk = SZ(5, 3);
      buildPlatform(dkp.x, dkp.z, dk.sx, dk.sz, 0.4, 0.4);
    }
  }

  function addHedge(x, z, alongX) {
    const hw = alongX ? 0.9 : 0.5, hd = alongX ? 0.5 : 0.9;
    const h = { minx: x - hw, miny: 0, minz: z - hd, maxx: x + hw, maxy: 1.0, maxz: z + hd };
    hedges.push(h);
    const m = new THREE.Mesh(U.shadedBoxGeo(hw * 2, 1.0, hd * 2), hedgeMat);
    m.position.set(x, 0.5, z);
    grp.add(m);
  }
  let hedgeMat, stairMat;

  // ---------- verticality helpers ----------
  let stairGeos = [], steelGeos = [], rockGeos = [], frondGeos = [], palmTrunkGeos = [], sandGeos = [];
  const bouncePads = []; // {minx..maxz, top, power} — stunt trampolines
  W.bouncePads = bouncePads;
  W.padAt = function (x, z, y) {
    for (let i = 0; i < bouncePads.length; i++) {
      const p = bouncePads[i];
      if (x > p.minx && x < p.maxx && z > p.minz && z < p.maxz && Math.abs(y - p.top) < 0.45) return p;
    }
    return null;
  };
  // stunt trampoline: red steel frame, black bed, launches whoever lands on it.
  // Deliberately indestructible — it's rigging, like ladders and scaffolds.
  function addBouncePad(x, z, size, power) {
    const s = size || 2.3, top = 0.5;
    const frame = new THREE.Mesh(U.shadedBoxGeo(s, 0.22, s), new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: 0xc23b2e }));
    frame.position.set(x, top - 0.11, z);
    grp.add(frame);
    const bed = new THREE.Mesh(U.shadedBoxGeo(s * 0.78, 0.1, s * 0.78), new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: 0x23252d }));
    bed.position.set(x, top - 0.03, z);
    grp.add(bed);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      buildPost(x + lx * (s / 2 - 0.14), z + lz * (s / 2 - 0.14), top - 0.1, 0.12, 0, steelGeos);
    }
    // stand on it (step), but bots don't PATH across it (noWalk fence above)
    addCollider(x - s / 2, 0, z - s / 2, x + s / 2, top, z + s / 2, { step: true, noShoot: true });
    slabs.push({ minx: x - s / 2, minz: z - s / 2, maxx: x + s / 2, maxz: z + s / 2, top });
    addCollider(x - s / 2, 0.7, z - s / 2, x + s / 2, 1.5, z + s / 2, { noWalk: true, noShoot: true });
    bouncePads.push({ minx: x - s / 2, minz: z - s / 2, maxx: x + s / 2, maxz: z + s / 2, top, power });
  }
  const stairRuns = []; // {bx,bz,baseY,tx,tz,topY} — bots chase prey up these
  W.stairRuns = stairRuns;
  function buildStairs(x, z, dx, dz, width, n, stepH, stepD, baseY) {
    stepH = stepH || 0.3; stepD = stepD || 0.46; baseY = baseY || 0;
    for (let k = 0; k < n; k++) {
      const cxk = x + dx * stepD * k, czk = z + dz * stepD * k;
      const h = (k + 1) * stepH;
      const sxk = dx !== 0 ? stepD : width, szk = dx !== 0 ? width : stepD;
      const g = U.shadedBoxGeo(sxk, h, szk);
      g.translate(cxk, baseY + h / 2, czk);
      stairGeos.push(g);
      addCollider(cxk - sxk / 2, baseY, czk - szk / 2, cxk + sxk / 2, baseY + h, czk + szk / 2, { step: true });
      slabs.push({ minx: cxk - sxk / 2, minz: czk - szk / 2, maxx: cxk + sxk / 2, maxz: czk + szk / 2, top: baseY + h });
    }
    // approach point one step before the run, exit point one step past the top
    stairRuns.push({
      bx: x - dx * stepD, bz: z - dz * stepD, baseY,
      tx: x + dx * stepD * n, tz: z + dz * stepD * n,
      topY: baseY + n * stepH,
    });
  }
  function buildPlatform(cx, cz, w, d, topY, thick, geoList) {
    thick = thick || 0.18;
    const g = U.shadedBoxGeo(w, thick, d);
    g.translate(cx, topY - thick / 2, cz);
    (geoList || stairGeos).push(g);
    addCollider(cx - w / 2, topY - thick, cz - d / 2, cx + w / 2, topY, cz + d / 2, { step: true });
    slabs.push({ minx: cx - w / 2, minz: cz - d / 2, maxx: cx + w / 2, maxz: cz + d / 2, top: topY });
  }
  function buildPost(x, z, h, s, baseY, geoList) {
    s = s || 0.16; baseY = baseY || 0;
    const g = U.shadedBoxGeo(s, h, s);
    g.translate(x, baseY + h / 2, z);
    (geoList || stairGeos).push(g);
    addCollider(x - s / 2, baseY, z - s / 2, x + s / 2, baseY + h, z + s / 2, { tree: true });
  }
  // climbable ladder: visual rails+rungs into geoList, plus a grab volume.
  // face = which side of (x,z) the climber hangs on: 'n' -z, 's' +z, 'e' +x, 'w' -x
  function addLadder(x, z, baseY, topY, face, geoList) {
    const list = geoList || steelGeos;
    const along = (face === 'e' || face === 'w') ? 'z' : 'x'; // rails spread along this axis
    const railOff = 0.36, h = topY - baseY;
    for (const s of [-railOff, railOff]) {
      const g = U.shadedBoxGeo(along === 'x' ? 0.09 : 0.07, h + 0.9, along === 'x' ? 0.07 : 0.09);
      g.translate(along === 'x' ? x + s : x, baseY + (h + 0.9) / 2, along === 'x' ? z : z + s);
      list.push(g);
    }
    for (let y = baseY + 0.38; y < topY + 0.4; y += 0.42) {
      const g = U.shadedBoxGeo(along === 'x' ? 0.78 : 0.06, 0.07, along === 'x' ? 0.06 : 0.78);
      g.translate(x, y, z);
      list.push(g);
    }
    const grab = 0.72;
    const fx = face === 'e' ? 1 : face === 'w' ? -1 : 0;
    const fz = face === 's' ? 1 : face === 'n' ? -1 : 0;
    ladders.push({
      minx: x - (along === 'x' ? 0.55 : 0) - (face === 'w' ? grab : 0.06),
      maxx: x + (along === 'x' ? 0.55 : 0) + (face === 'e' ? grab : 0.06),
      minz: z - (along === 'z' ? 0.55 : 0) - (face === 'n' ? grab : 0.06),
      maxz: z + (along === 'z' ? 0.55 : 0) + (face === 's' ? grab : 0.06),
      baseY, topY,
      cx: x, cz: z, fx, fz, // rail center + which side you hang on (bots use these)
    });
    // the rails are solid: you climb ladders, you don't stroll through them.
    // step+noShoot keeps it out of bot nav, raycasts and floor queries, and the
    // low cap (topY+0.4) means cresting still clears it
    addCollider(
      x - (along === 'x' ? 0.55 : 0.09), baseY, z - (along === 'z' ? 0.55 : 0.09),
      x + (along === 'x' ? 0.55 : 0.09), topY + 0.4, z + (along === 'z' ? 0.55 : 0.09),
      { noShoot: true, step: true });
  }
  W.ladders = ladders;

  function buildShed(cx, cz, tint) {
    const sw = 4, sd = 3, ch = 0.75;
    const fw2 = WallGrid({ ox: cx - sw / 2, oy: 0, oz: cz + sd / 2, dir: 'x', cols: sw, rows: 3, cw: 1, ch, th: 0.18, kind: 'siding', tint, hp: 40, house: null });
    wallFill(fw2, (c, r) => (c === 1 && r <= 2) ? 1 : 0);
    const bw2 = WallGrid({ ox: cx - sw / 2, oy: 0, oz: cz - sd / 2, dir: 'x', cols: sw, rows: 3, cw: 1, ch, th: 0.18, kind: 'siding', tint, hp: 40, house: null });
    wallFill(bw2, () => 0);
    for (const sx of [cx - sw / 2, cx + sw / 2]) {
      const wl = WallGrid({ ox: sx, oy: 0, oz: cz - sd / 2, dir: 'z', cols: sd, rows: 3, cw: 1, ch, th: 0.18, kind: 'siding', tint, hp: 40, house: null });
      wallFill(wl, () => 0);
    }
    const roof = Sheet('roof', 0x6b6f75);
    for (let c = 0; c < sw + 1; c++)
      for (let j = 0; j < sd + 1; j++)
        sheetAdd(roof, cx - sw / 2 - 0.5 + c + 0.5, 2.4 + j * 0.12, cz - sd / 2 - 0.5 + j + 0.5, 0.12, 'x', 1.03, 0.13, 1.06, 30);
  }

  function buildPark() {
    // gazebo
    const gz = { x: 22, z: -22 };
    buildPlatform(gz.x, gz.z, 4.6, 4.6, 0.28, 0.28);
    for (const [px, pz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]])
      buildPost(gz.x + px, gz.z + pz, 2.9, 0.18);
    const gzRoof = Sheet('roof', 0xe8e4da);
    for (let sgn = -1; sgn <= 1; sgn += 2)
      for (let c = 0; c < 5; c++)
        for (let j = 0; j < 3; j++)
          sheetAdd(gzRoof, gz.x - 2.5 + c + 0.5, 3.9 - (j + 0.5) * 0.45, gz.z + sgn * (j + 0.5) * 0.9, sgn * 0.45, 'x', 1.05, 0.13, 1.0, 25);
    W.campSpots.push({ x: gz.x, z: gz.z, yaw: Math.PI });
    // playground fort with high platform
    const ft = { x: 33, z: -30 };
    buildPlatform(ft.x, ft.z, 2.8, 2.8, 2.0, 0.14);
    for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]])
      buildPost(ft.x + px, ft.z + pz, 3.3, 0.16);
    const ftRoof = Sheet('roof', 0xd14040);
    for (let sgn = -1; sgn <= 1; sgn += 2)
      for (let c = 0; c < 3; c++)
        for (let j = 0; j < 2; j++)
          sheetAdd(ftRoof, ft.x - 1.5 + c + 0.5, 3.9 - (j + 0.5) * 0.4, ft.z + sgn * (j + 0.5) * 0.8, sgn * 0.5, 'x', 1.05, 0.12, 0.9, 22);
    buildStairs(ft.x, ft.z + 3.9, 0, -1, 1.4, 6, 0.32, 0.46);
    W.campSpots.push({ x: ft.x, z: ft.z, yaw: 0 });
    // swings
    const sw = { x: 18, z: -32 };
    buildPost(sw.x - 1.8, sw.z, 2.4, 0.14);
    buildPost(sw.x + 1.8, sw.z, 2.4, 0.14);
    const bar = U.shadedBoxGeo(3.8, 0.12, 0.12);
    bar.translate(sw.x, 2.36, sw.z);
    stairGeos.push(bar);
    addProp('swing', sw.x - 0.8, 1.15, sw.z, 0.55, 0.12, 0.3, T.plain, 0xd13030, 10, { noWalk: true });
    addProp('swing', sw.x + 0.8, 1.15, sw.z, 0.55, 0.12, 0.3, T.plain, 0x2d6fd2, 10, { noWalk: true });
    // picnic table
    addProp('picnic', 20, 0, -19, 1.9, 0.78, 1.5, T.plain, 0xb98a55, 50, {});
    addProp('trash', 24.5, 0, -19, 0.65, 1.05, 0.65, T.trash, 0xffffff, 15, { metal: true });
  }

  function buildConstruction() {
    // slab + framed skeleton
    const cx = -26, cz = 28;
    const slabMat2 = new THREE.MeshBasicMaterial({ map: T.driveway(), vertexColors: true });
    const slab = new THREE.Mesh(U.shadedBoxGeo(12, 0.25, 9), slabMat2);
    slab.position.set(cx, 0.125, cz);
    grp.add(slab);
    slabs.push({ minx: cx - 6, minz: cz - 4.5, maxx: cx + 6, maxz: cz + 4.5, top: 0.27 });
    addCollider(cx - 6, 0, cz - 4.5, cx + 6, 0.25, cz + 4.5, {});
    const studFill = (door0, door1) => (c, r, rowsN) => {
      if (r === 3) return 0;                 // top plate
      if (c >= door0 && c <= door1) return 1; // opening
      return c % 2 === 0 ? 0 : 1;             // studs
    };
    const mk = (o, dir, cols, fn) => {
      const wl = WallGrid({ ...o, oy: 0.25, dir, cols, rows: 4, cw: 1, ch: 0.72, th: 0.14, kind: 'frame', tint: 0xd8b075, hp: 18, house: null });
      wallFill(wl, fn);
    };
    mk({ ox: cx - 6, oz: cz - 4.5 }, 'x', 12, studFill(5, 6));
    mk({ ox: cx - 6, oz: cz + 4.5 }, 'x', 12, studFill(2, 3));
    mk({ ox: cx - 6, oz: cz - 4.5 }, 'z', 9, studFill(4, 4));
    mk({ ox: cx + 6, oz: cz - 4.5 }, 'z', 9, studFill(4, 4));
    // scaffold with high walkway — stairs climb alongside, ending flush with the deck edge
    const sc = { x: -31, z: 16.2 };
    buildPlatform(sc.x, sc.z, 7, 2.4, 2.4, 0.16);
    for (const [px, pz] of [[-3.3, -1.05], [3.3, -1.05], [-3.3, 1.05], [3.3, 1.05], [0, -1.05], [0, 1.05]])
      buildPost(sc.x + px, sc.z + pz, 2.4, 0.14);
    // platform east edge at x = -27.5; 8 steps rising west toward it, all in open air
    buildStairs(sc.x + 6.9, sc.z, -1, 0, 2.0, 8, 0.3, 0.47);
    W.campSpots.push({ x: sc.x, z: sc.z, yaw: Math.PI });
    // site props
    addProp('dumpster', -15.5, 0, 16.5, 2.5, 1.35, 1.35, T.dumpster, 0xffffff, 170, { metal: true });
    addProp('potty', -36, 0, 17.5, 1.15, 2.25, 1.15, T.portapotty, 0xffffff, 35, {});
    addProp('lumber', -20, 0, 25, 2.3, 0.6, 1.1, T.plain, 0xc9a05f, 30, {});
    addProp('lumber', -20.4, 0, 31, 2.3, 0.55, 1.1, T.plain, 0xb98a4f, 30, {});
    addProp('mixer', -33.5, 0, 30, 1.5, 1.6, 1.2, T.plain, 0xd07030, 90, { metal: true });
    addProp('propane', -35.5, 0, 25, 0.55, 0.8, 0.55, T.propane, 0xffffff, 18, { metal: true });
  }

  function buildFenceRun(x0, z0, x1, z1, tall, kind, tint, hp) {
    const dir = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z';
    const len = dir === 'x' ? x1 - x0 : z1 - z0;
    const cols = Math.round(Math.abs(len) / 2);
    const rows = tall ? 2 : 1;
    const ch = tall ? 1.25 : 0.85;
    const wall = WallGrid({
      ox: dir === 'x' ? Math.min(x0, x1) : x0,
      oy: 0, oz: dir === 'x' ? z0 : Math.min(z0, z1),
      dir, cols, rows, cw: 2, ch, th: 0.15,
      kind: kind || 'fence', tint: tint || 0xa9713d, hp: hp || 30, house: null,
    });
    wallFill(wall, () => 0);
  }

  function buildTree(x, z) {
    const trunk = new THREE.Mesh(U.shadedBoxGeo(0.5, 4.6, 0.5), trunkMat);
    trunk.position.set(x, 2.3, z);
    grp.add(trunk);
    addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 4.2, z + 0.3, { tree: true });
    const geos = [];
    for (let i = 0; i < 3; i++) {
      const s = U.rand(1.6, 2.6);
      const g = new THREE.SphereGeometry(s, 7, 6);
      g.translate(x + U.rand(-1, 1), 4.6 + U.rand(0, 1.6), z + U.rand(-1, 1));
      geos.push(g);
    }
    treeCanopyGeos.push(U.mergeGeos(geos));
  }
  let trunkMat, treeCanopyGeos = [];

  function buildPole(x, z) {
    const g1 = new THREE.CylinderGeometry(0.13, 0.16, 7.4, 6);
    g1.translate(x, 3.7, z);
    const g2 = new THREE.BoxGeometry(2.2, 0.14, 0.14);
    g2.translate(x, 6.6, z);
    poleGeos.push(g1, g2);
    addCollider(x - 0.18, 0, z - 0.18, x + 0.18, 7.2, z + 0.18, { tree: true });
    poleTops.push({ x, z });
  }
  let poleGeos = [], poleTops = [];

  W.spawnPoints = [];
  W.campSpots = [];
  W.hillSpots = []; // king of the hill zones: {x, z, y, r}, cycled in order

  W.bounds = { x: 66, z: 52 };
  W.teamSpawns = [{ x: -62, z: 2.5 }, { x: 62, z: -2.5 }];
  W.mapId = 'suburbs';
  W.maps = [
    { id: 'suburbs', name: 'SUBURBS' },
    { id: 'island', name: 'VOLCANO ISLAND' },
    { id: 'station', name: 'MERIDIAN STATION' },
    { id: 'gulch', name: 'GOLD RUSH GULCH' },
    { id: 'citadel', name: 'ARCANE ACADEMY' },
  ];
  W.mapUpdate = null;
  W.minimapPaint = null;
  W.zeroG = false;            // jetpack physics for players + bots
  W.hasGround = true;         // false in space: no invisible floor at y=0
  W.spaceY = { min: -14, max: 30 }; // vertical play limits in zero-g

  W.build = function (sc) {
    scene = sc;
    grp = new THREE.Group();
    sc.add(grp);
    batches = {
      siding: ChunkBatch(T.siding(), 3400),
      roof: ChunkBatch(T.roof(), 2600),
      garage: ChunkBatch(T.garageDoor(), 160),
      fence: ChunkBatch(T.fence(), 900),
      frame: ChunkBatch(T.fence(), 640),
      glass: ChunkBatch(T.glassTex(), 1500, { transparent: true, opacity: 0.62, renderOrder: 4 }),
      city: ChunkBatch(T.cityWall(), 4800),
      wood: ChunkBatch(T.barnwood(), 3600),
      chainlink: ChunkBatch(T.chainlink(), 460, { transparent: true, renderOrder: 3 }),
      plank: ChunkBatch(T.plywood(), 900),
      block: ChunkBatch(T.cinder(), 1600),
      castle: ChunkBatch(T.castlebrick(), 9000),
      book: ChunkBatch(T.bookwall(), 900),
      bamboo: ChunkBatch(T.bamboo(), 520),
      thatch: ChunkBatch(T.thatch(), 800),
      hull: ChunkBatch(T.hullPanel(), 6800),
    };
    wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    hedgeMat = new THREE.MeshBasicMaterial({ map: T.leaf(), vertexColors: true });
    trunkMat = new THREE.MeshBasicMaterial({ map: T.trunk(), vertexColors: true });
    stairMat = new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: 0xb98a55 });
    W.mapClock = 0;
    W.mapUpdate = null;
    W.minimapPaint = null;
    W.zeroG = false;
    W.hasGround = true;
    if (W.mapId === 'island') buildIslandMap();
    else if (W.mapId === 'station') buildStationMap();
    else if (W.mapId === 'gulch') buildGulchMap();
    else if (W.mapId === 'citadel') buildCitadelMap();
    else buildSuburbs();
    finishBuild();
    navBuild();
    W.flushBatches();
    W.minimapDirty = true;
  };

  function addSky(bg, o) {
    o = o || {};
    scene.background = new THREE.Color(bg);
    const cloudTex = T.cloud();
    for (let i = 0; i < (o.clouds === undefined ? 6 : o.clouds); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, color: o.cloudTint || 0xffffff }));
      sp.position.set(U.rand(-160, 160), U.rand(40, 78), U.rand(-170, 170));
      sp.scale.set(U.rand(40, 70), U.rand(18, 30), 1);
      grp.add(sp);
    }
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sun(), transparent: true, depthWrite: false, color: o.sunTint || 0xffffff }));
    const spos = o.sunPos || [130, 95, -150];
    sun.position.set(spos[0], spos[1], spos[2]);
    const ss = o.sunScale || 28;
    sun.scale.set(ss, ss, 1);
    grp.add(sun);
  }

  // merge the accumulated geometry lists into single draw calls
  function finishBuild() {
    if (treeCanopyGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(treeCanopyGeos.splice(0)), new THREE.MeshBasicMaterial({ map: T.leaf() })));
    if (stairGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(stairGeos.splice(0)), stairMat));
    if (steelGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(steelGeos.splice(0)), new THREE.MeshBasicMaterial({ map: T.girder(), vertexColors: true })));
    if (rockGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(rockGeos.splice(0)), new THREE.MeshBasicMaterial({ map: T.lavarock(), vertexColors: true })));
    if (palmTrunkGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(palmTrunkGeos.splice(0)), new THREE.MeshBasicMaterial({ map: T.trunk(), vertexColors: true, color: 0xc09a60 })));
    if (frondGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(frondGeos.splice(0)), new THREE.MeshBasicMaterial({ color: 0x2f9e44, side: THREE.DoubleSide })));
    if (sandGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(sandGeos.splice(0)), new THREE.MeshBasicMaterial({ map: T.dirt(), vertexColors: true, color: 0xe8cf90 })));
  }

  function buildSuburbs() {
    W.bounds = { x: 66, z: 52 };
    W.teamSpawns = [{ x: -62, z: 2.5 }, { x: 62, z: -2.5 }];
    // ground + streets (main E-W, cross N-S)
    plane(460, 460, T.grass(), 0, 0, 0).material.map.repeat.set(70, 70);
    plane(140, 9, T.road(), 0, 0.02, 0).material.map.repeat.set(16, 1);
    const crossRoad = plane(112, 9, T.road(), 0, 0.023, 0);
    crossRoad.rotation.z = Math.PI / 2;
    crossRoad.material.map.repeat.set(13, 1);
    plane(9.6, 9.6, T.driveway(), 0, 0.027, 0); // clean intersection patch
    plane(140, 2.6, T.sidewalk(), 0, 0.03, -5.8).material.map.repeat.set(52, 1);
    plane(140, 2.6, T.sidewalk(), 0, 0.03, 5.8).material.map.repeat.set(52, 1);
    const sw1 = plane(112, 2.6, T.sidewalk(), -5.8, 0.033, 0); sw1.rotation.z = Math.PI / 2; sw1.material.map.repeat.set(42, 1);
    const sw2 = plane(112, 2.6, T.sidewalk(), 5.8, 0.033, 0); sw2.rotation.z = Math.PI / 2; sw2.material.map.repeat.set(42, 1);

    // ---- houses: NW / NE / SW / SE quadrants + cross-street lots ----
    buildHouse({ cx: -27, cz: -17.5, face: 's', w: 13, d: 9, stories: 2, color: 0x8ed8ec, roofColor: 0x9a5b33, garage: 1, garageCar: true, hoop: true, bins: true });
    buildHouse({ cx: -52, cz: -17.5, face: 's', w: 12, d: 9, stories: 1, color: 0xf2e28a, roofColor: 0x8a5a33, garage: -1, driveCar: 0x4a7d4a, flag: true, deck: true, ac: true });
    buildHouse({ cx: -17.5, cz: -32, face: 'e', w: 12, d: 9, stories: 1, color: 0xb8e6b0, roofColor: 0x707a80, garage: 1 });
    buildHouse({ cx: 52, cz: -17.5, face: 's', w: 13, d: 10, stories: 2, color: 0xf5b8d0, roofColor: 0x86565e, garage: null, bins: true });
    buildHouse({ cx: -52, cz: 17.5, face: 'n', w: 12, d: 9, stories: 1, color: 0xa8d8a0, roofColor: 0x5a7a55, garage: 1 });
    buildHouse({ cx: -17.5, cz: 32, face: 'e', w: 13, d: 10, stories: 2, color: 0xcdb9ec, roofColor: 0x6b4a86, garage: null, ac: true });
    buildHouse({ cx: 27, cz: 17.5, face: 'n', w: 12, d: 9, stories: 1, color: 0xf0cfa0, roofColor: 0x8a5a33, garage: 1, driveCar: 0xd0d0d0, deck: true, bins: true });
    buildHouse({ cx: 52, cz: 17.5, face: 'n', w: 13, d: 9, stories: 2, color: 0x9fd8d0, roofColor: 0x4a6a70, garage: null });
    buildHouse({ cx: 17.5, cz: 32, face: 'w', w: 12, d: 9, stories: 1, color: 0xf0b8a0, roofColor: 0x8a5a33, garage: -1 });

    // ---- park (NE) + construction site (SW) ----
    buildPark();
    buildConstruction();

    // sheds in backyards
    buildShed(-30, -36, 0x9a8a70);
    buildShed(44, 36, 0x8a9a70);

    // perimeter fence (tall) + hoppable yard fences
    buildFenceRun(-68, -54, 68, -54, true);
    buildFenceRun(-68, 54, 68, 54, true);
    buildFenceRun(-68, -54, -68, 54, true);
    buildFenceRun(68, -54, 68, 54, true);
    buildFenceRun(-38, -14, -38, -52, false);
    buildFenceRun(40, -14, 40, -52, false);
    buildFenceRun(-40, 14, -40, 52, false);
    buildFenceRun(38, 14, 38, 52, false);

    // boundary invisible walls (beyond fence)
    addCollider(-72, 0, -57, -68.2, 6, 57, { noShoot: true });
    addCollider(68.2, 0, -57, 72, 6, 57, { noShoot: true });
    addCollider(-72, 0, -57, 72, 6, -54.2, { noShoot: true });
    addCollider(-72, 0, 54.2, 72, 6, 57, { noShoot: true });

    // street cars
    buildCar(-35, 2.6, true, 0x9aa0a6);
    buildCar(20, -2.6, true, 0x3b6bd6);
    buildCar(48, 2.6, true, 0xe8e8e8);
    buildCar(2.6, -27, false, 0xc8a030);
    buildCar(-2.6, 22, false, 0x8040c0);

    // trees
    buildTree(-62, -28); buildTree(-45, -40); buildTree(-8, -48);
    buildTree(20, -28); buildTree(28, -20); buildTree(35, -44); buildTree(17, -40);
    buildTree(60, -38); buildTree(-60, 38); buildTree(60, 42); buildTree(46, 46); buildTree(-8, 48);

    // poles + wires (main street), bare poles on the cross street
    buildPole(-45, 5.2); buildPole(8, 5.2); buildPole(45, 5.2);
    const mains = poleTops.slice();
    buildPole(5.2, -32); buildPole(-5.2, 34);
    const poleMesh = new THREE.Mesh(U.mergeGeos(poleGeos.splice(0, poleGeos.length)), new THREE.MeshBasicMaterial({ color: 0x6b5138, map: T.plain() }));
    grp.add(poleMesh);
    for (let i = 0; i < mains.length - 1; i++) {
      const a = mains[i], b = mains[i + 1];
      for (const off of [-0.9, 0.9]) {
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          pts.push(new THREE.Vector3(U.lerp(a.x + off, b.x + off, t), 6.6 - Math.sin(t * Math.PI) * 0.7, a.z));
        }
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }

    // backyard patio sets (grill + propane together, next to the deck houses)
    addProp('grill', -49, 0, -25.5, 0.9, 1.0, 0.7, T.grill, 0xffffff, 30, { metal: true });
    addProp('propane', -47.9, 0, -25.5, 0.55, 0.8, 0.55, T.propane, 0xffffff, 18, { metal: true });
    addProp('grill', 30, 0, 25.5, 0.9, 1.0, 0.7, T.grill, 0xffffff, 30, { metal: true });
    addProp('propane', 31.1, 0, 25.5, 0.55, 0.8, 0.55, T.propane, 0xffffff, 18, { metal: true });
    addProp('propane', 48, 0, -28, 0.55, 0.8, 0.55, T.propane, 0xffffff, 18, { metal: true });
    addProp('doghouse', 46, 0, 28, 1.2, 1.0, 1.2, T.doghouse, 0xffffff, 35, {});
    addProp('kpool', -46, 0, -30, 1.9, 0.32, 1.9, T.kpool, 0xffffff, 12, {});
    // fire hydrants at intersection corners
    addProp('hydrant', 7.4, 0, 7.4, 0.5, 0.95, 0.5, T.hydrant, 0xffffff, 30, { metal: true });
    addProp('hydrant', -7.4, 0, -7.4, 0.5, 0.95, 0.5, T.hydrant, 0xffffff, 30, { metal: true });

    // spawn points
    W.spawnPoints = [
      { x: -62, z: -48 }, { x: 62, z: -48 }, { x: -62, z: 48 }, { x: 62, z: 48 },
      { x: -62, z: 0 }, { x: 62, z: 0 }, { x: 0, z: -50 }, { x: 0, z: 50 },
      { x: -30, z: -46 }, { x: 30, z: -46 }, { x: -30, z: 46 }, { x: 30, z: 46 },
      { x: -58, z: -28 }, { x: 58, z: 28 }, { x: 26, z: -26 }, { x: -26, z: 22 },
    ];
    for (const car of cars) W.campSpots.push({ x: car.group.position.x + 3, z: car.group.position.z + 2, yaw: 0 });
    W.hillSpots = [
      { x: 0, z: 0, y: 0, r: 6 },        // the main intersection
      { x: -32, z: 24, y: 0, r: 5.5 },   // west backyards
      { x: 33, z: -24, y: 0, r: 5.5 },   // east backyards
      { x: 0, z: 34, y: 0, r: 5.5 },     // south lawns
    ];

    addSky(0x6cb8ee);
  }
  let wireMat;

  // ============ MAP 3: VOLCANO ISLAND — sunset, geysers, angry mountain ============
  function buildIslandMap() {
    W.bounds = { x: 52, z: 44 };
    W.teamSpawns = [{ x: -36, z: 0 }, { x: 36, z: 0 }];

    // hand-painted island floor: sea → shallows → sand → jungle
    const icv = T.cnv(512, 512);
    const ix = icv.x;
    const u = (wx) => (wx + 75) / 150 * 512, v = (wz) => (wz + 67) / 134 * 512;
    ix.fillStyle = '#2e8fae'; ix.fillRect(0, 0, 512, 512);
    ix.fillStyle = '#7fd4c8';
    ix.beginPath(); ix.ellipse(256, 256, 205, 196, 0, 0, 7); ix.fill();
    ix.fillStyle = '#eed08a';
    ix.beginPath(); ix.ellipse(256, 256, 193, 184, 0, 0, 7); ix.fill();
    ix.fillStyle = '#5cb84a';
    ix.beginPath(); ix.ellipse(256, 256, 144, 134, 0, 0, 7); ix.fill();
    for (let i = 0; i < 22; i++) T.blob(ix, U.rand(130, 380), U.rand(140, 370), U.rand(9, 22), 8, 'rgba(70,160,55,0.5)', null);
    // dark rock creek bed under the lava runs
    ix.fillStyle = '#4b4348';
    for (const r of [[7, -5, 15, 5], [5, 4, 15, 15], [3, 13, 17, 23], [1, 21, 19, 34]])
      ix.fillRect(u(r[0]), v(r[1]), u(r[2]) - u(r[0]), v(r[3]) - v(r[1]));
    plane(150, 134, T.tex(icv.c), 0, 0.012, 0);
    plane(1000, 1000, T.water(), 0, -0.06, 0).material.map.repeat.set(74, 74); // to the horizon — no visible edge
    // invisible boundary — pushed out past the beach: the whole sand ring
    // (and a little lagoon wading at the corners) is walkable now
    addCollider(-58, 0, -50, -52.4, 6, 50, { noShoot: true });
    addCollider(52.4, 0, -50, 58, 6, 50, { noShoot: true });
    addCollider(-58, 0, -50, 58, 6, -46.4, { noShoot: true });
    addCollider(-58, 0, 46.4, 58, 6, 50, { noShoot: true });

    // ---- the volcano: four jumpable tiers + crater full of lava ----
    const tier = (x0, z0, x1, z1, y0, y1) => {
      const g = U.shadedBoxGeo(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      rockGeos.push(g);
      addCollider(x0, y0, z0, x1, y1, z1, {});
    };
    tier(1, -20, 23, -4, 0, 1.0);
    tier(3.5, -18, 20.5, -6, 1.0, 2.0);
    tier(6, -16.5, 18, -7.5, 2.0, 3.0);
    tier(8, -15, 16, -9, 3.0, 4.0);
    // crater rim (north gap = the spout)
    tier(8, -15, 9.2, -9, 4.0, 4.9);
    tier(14.8, -15, 16, -9, 4.0, 4.9);
    tier(8, -9.6, 16, -9, 4.0, 4.9);
    tier(8, -15, 10, -14.5, 4.0, 4.9);
    tier(14, -15, 16, -14.5, 4.0, 4.9);
    // crater lava pool
    plane(5.6, 4.6, T.lava(), 12, 4.06, -12.2);
    lavas.push({ minx: 9.4, minz: -14.6, maxx: 14.6, maxz: -9.8, y: 4.0 });

    // ---- the lava creek: cuts the island in half, cross at the bridge or the stones ----
    const creek = [[8, -4, 14, 4], [6, 4, 14, 14], [4, 13, 16, 22], [2, 21, 18, 34]];
    for (const r of creek) {
      plane(r[2] - r[0], r[3] - r[1], T.lava(), (r[0] + r[2]) / 2, 0.03, (r[1] + r[3]) / 2);
      lavas.push({ minx: r[0], minz: r[1], maxx: r[2], maxz: r[3], y: 0 });
    }
    // plank bridge (destructible! shoot it out from under someone)
    buildStairs(4.5, 8, 1, 0, 2.2, 2, 0.3, 0.55);
    buildStairs(16.1, 8, -1, 0, 2.2, 2, 0.3, 0.55);
    for (const bx of [6.4, 8.24, 10.08, 11.92, 13.76])
      addProp('plank', bx, 0.73, 8, 1.86, 0.12, 2.1, T.plywood, 0xd8b075, 22, { step: true });
    for (const [px2, pz2] of [[5.6, 6.9], [5.6, 9.1], [14.6, 6.9], [14.6, 9.1]]) buildPost(px2, pz2, 1.5, 0.12);
    // stepping stones (players can hop, bots won't risk it)
    for (const sx2 of [5, 8, 11, 14]) {
      const g = U.shadedBoxGeo(1.3, 0.55, 1.3);
      g.translate(sx2, 0.275, 18);
      rockGeos.push(g);
      addCollider(sx2 - 0.65, 0, sx2 === -999 ? 0 : 17.35, sx2 + 0.65, 0.55, 18.65, {});
    }

    // ---- steam geysers: ride the blast for the high ground ----
    const geyserDefs = [[-16, -6, 7.5, 0], [-28, 18, 9, 2.6], [26, 8, 8, 5.1], [-8, 28, 10, 1.4]];
    for (const [gx, gz, period, offset] of geyserDefs) {
      geysers.push({ x: gx, z: gz, r: 1.6, period, offset });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const g = U.shadedBoxGeo(0.7, 0.5, 0.7);
        g.translate(gx + Math.cos(a) * 1.5, 0.25, gz + Math.sin(a) * 1.5);
        rockGeos.push(g);
      }
    }

    // ---- bamboo huts with thatch roofs ----
    function buildHut(cx, cz, baseY) {
      baseY = baseY || 0;
      const hw = 5, hd = 4, ch = 0.72, rows = 4; // 2.9m walls: jump inside all you want
      const mkW = (o, dir, cols, fn) => {
        const wl = WallGrid({ ...o, oy: baseY, dir, cols, rows, cw: 1, ch, th: 0.16, kind: 'bamboo', tint: 0xcdb968, hp: 26, house: null });
        wallFill(wl, fn);
      };
      mkW({ ox: cx - hw / 2, oz: cz + hd / 2 }, 'x', hw, (c, r) => c === 2 && r <= 3 ? 1 : 0); // tall south door
      mkW({ ox: cx - hw / 2, oz: cz - hd / 2 }, 'x', hw, (c, r) => (c === 1 || c === 3) && (r === 1 || r === 2) ? 1 : 0);
      mkW({ ox: cx - hw / 2, oz: cz - hd / 2 }, 'z', hd, (c, r) => c === 1 && (r === 1 || r === 2) ? 1 : 0);
      mkW({ ox: cx + hw / 2, oz: cz - hd / 2 }, 'z', hd, (c, r) => c === 2 && (r === 1 || r === 2) ? 1 : 0);
      const roof = Sheet('thatch', 0xd6a852);
      const ridgeY = baseY + rows * ch + 1.15;
      for (let sgn = -1; sgn <= 1; sgn += 2)
        for (let c = 0; c < hw + 2; c++)
          for (let j = 0; j < 3; j++) {
            const t = (j + 0.5) / 3;
            sheetAdd(roof, cx - hw / 2 - 1 + c + 0.5, ridgeY - t * 1.15, cz + sgn * t * (hd / 2 + 0.6), sgn * 0.46, 'x', 1.05, 0.14, 1.0, 24);
          }
      addProp('table', cx + 1, baseY, cz - 0.6, 1.4, 0.72, 1.0, T.plain, 0xb98a55, 40, {});
      W.campSpots.push({ x: cx, z: cz, yaw: 0 });
      torchPts.push([cx - 1.4, cz + hd / 2 + 0.7], [cx + 1.4, cz + hd / 2 + 0.7]);
    }
    const torchPts = [];
    buildHut(-26, -20);
    buildHut(-32, 8);
    // ---- stilt longhouse (east): a whole hut on legs, ladder up, shade below ----
    for (const [lx2, lz2] of [[19.6, 24.1], [24.4, 24.1], [19.6, 27.9], [24.4, 27.9], [22, 24.1], [22, 27.9]])
      buildPost(lx2, lz2, 2.75, 0.22);
    buildPlatform(22, 26, 7, 5, 2.6, 0.22);
    buildHut(22, 26, 2.6);
    addLadder(22, 28.6, 0, 2.6, 's');
    addProp('drum', 24.6, 0, 24.6, 0.7, 1.0, 0.7, T.propane, 0x3f8f5f, 20, { metal: true }); // under the house
    // beach bar: open-air thatch pavilion
    buildPlatform(-8, 29, 6.5, 4.5, 0.25, 0.25);
    for (const [px3, pz3] of [[-10.8, 27.2], [-5.2, 27.2], [-10.8, 30.8], [-5.2, 30.8]]) buildPost(px3, pz3, 3.1, 0.17);
    const barRoof = Sheet('thatch', 0xd6a852);
    for (let c = 0; c < 8; c++)
      for (let j = 0; j < 5; j++)
        sheetAdd(barRoof, -11.5 + c + 0.5, 3.5 + (j - 2) * 0.12, 26.7 + j + 0.5 - 0.7, 0.12, 'x', 1.05, 0.13, 1.06, 22);
    const bar = WallGrid({ ox: -10.5, oy: 0.25, oz: 30.6, dir: 'x', cols: 5, rows: 2, cw: 1, ch: 0.6, th: 0.2, kind: 'bamboo', tint: 0xcdb968, hp: 26, house: null });
    wallFill(bar, (c, r) => c === 4 && r >= 0 ? 1 : 0);
    W.campSpots.push({ x: -8, z: 28.5, yaw: Math.PI });
    torchPts.push([-12, 26.5], [-4, 26.5]);

    // torches (lit lazily in mapUpdate, after fx resets)
    for (const [tx2, tz2] of torchPts) buildPost(tx2, tz2, 1.75, 0.13);

    // ---- palms, rocks, beach junk ----
    const palmSpots = [[-34, -16, 0.4], [-30, -26, 2.2], [30, -18, 5.1], [36, 10, 3.4], [28, 20, 1.1],
      [-20, 30, 4.2], [-34, 24, 0.9], [20, -28, 2.8], [6, -26, 5.6], [34, 30, 1.9],
      [-38, -8, 1.6], [0, 33, 0.7], [38, -14, 4.4], [12, -30, 3.0], [38, 22, 2.5]];
    for (const [px4, pz4, lean] of palmSpots) buildPalm(px4, pz4, lean);
    const rockSpots = [[-8, 8, 2.0, 1.3], [-18, -8, 1.7, 1.1], [-2, -24, 1.9, 1.5], [24, 12, 1.6, 1.2], [-24, 26, 1.8, 1.0], [30, 0, 2.2, 1.4],
      [-12, 20, 1.8, 1.2], [14, -24, 1.6, 1.0], [-28, -14, 1.5, 1.1], [34, 6, 1.9, 1.3]];
    for (const [rx, rz, rw, rh] of rockSpots) {
      const g = U.shadedBoxGeo(rw, rh, rw * 0.85);
      g.translate(rx, rh / 2, rz);
      rockGeos.push(g);
      addCollider(rx - rw / 2, 0, rz - rw * 0.425, rx + rw / 2, rh, rz + rw * 0.425, {});
    }
    addProp('canoe', 26, 0, -24, 3.6, 0.6, 0.9, T.plain, 0x8a5a2b, 40, {});
    addProp('chest', 34, 0, -20, 0.95, 0.7, 0.65, T.plain, 0xb8862b, 25, {});
    addProp('chest', 12, 3.0, -16, 0.95, 0.7, 0.65, T.plain, 0xb8862b, 25, {}); // loot on the volcano's shoulder
    addProp('surfboard', -3, 0, 32.4, 0.5, 1.9, 0.16, T.plain, 0xff6a9e, 15, {});
    addProp('surfboard', -12.5, 0, 31.8, 0.5, 1.9, 0.16, T.plain, 0x40c8e0, 15, {});
    addProp('drum', -14, 0, 30.5, 0.7, 1.0, 0.7, T.propane, 0x3f8f5f, 20, { metal: true }); // bar fuel drum

    // ---- watchtower overlooking the bridge ----
    for (const [wx2, wz2] of [[-3.1, 0.9], [-0.9, 0.9], [-3.1, 3.1], [-0.9, 3.1]]) buildPost(wx2, wz2, 5.5, 0.17);
    buildPlatform(-2, 2, 2.9, 2.9, 2.7, 0.16);
    addLadder(-2, 3.6, 0, 2.7, 's');
    const wtw = WallGrid({ ox: -3.4, oy: 2.75, oz: 0.55, dir: 'x', cols: 3, rows: 1, cw: 1, ch: 0.6, th: 0.14, kind: 'bamboo', tint: 0xcdb968, hp: 22, house: null });
    wallFill(wtw, () => 0);
    const wtw2 = WallGrid({ ox: -3.55, oy: 2.75, oz: 0.55, dir: 'z', cols: 3, rows: 1, cw: 1, ch: 0.6, th: 0.14, kind: 'bamboo', tint: 0xcdb968, hp: 22, house: null });
    wallFill(wtw2, () => 0);
    const wtRoof = Sheet('thatch', 0xd6a852);
    for (let c = 0; c < 4; c++)
      for (let j = 0; j < 4; j++)
        sheetAdd(wtRoof, -3.9 + c + 0.5, 5.75 + (j - 1.5) * 0.14, 0.1 + j + 0.5, 0.14, 'x', 1.05, 0.12, 1.05, 18);
    torchPts.push([-3.4, 4.2]);

    // ---- GIANT MOAI on the east beach (worth a fortune in property damage) ----
    addProp('moai', 31, 0, -8, 1.9, 3.6, 1.9, T.tiki, 0xa8a8b2, 240, {});
    // ---- old stone shrine (ring of standing stones + chest) ----
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      addProp('stone', -22 + Math.cos(a) * 2.7, 0, -2 + Math.sin(a) * 2.7, 0.8, 2.0, 0.8, T.plain, 0x8a8890, 70, {});
    }
    addProp('stone', -18.6, 2.15, -2, 0.7, 0.5, 2.6, T.plain, 0x8a8890, 70, {}); // arch lintel
    (() => { const g = U.shadedBoxGeo(0.65, 2.15, 0.65); g.translate(-18.6, 1.075, -3.1); rockGeos.push(g); })();
    addCollider(-18.9, 0, -3.4, -18.3, 2.15, -2.8, {});
    (() => { const g = U.shadedBoxGeo(0.65, 2.15, 0.65); g.translate(-18.6, 1.075, -0.9); rockGeos.push(g); })();
    addCollider(-18.9, 0, -1.2, -18.3, 2.15, -0.6, {});
    addProp('chest', -22, 0, -2, 0.95, 0.7, 0.65, T.plain, 0xb8862b, 25, {});
    // ---- rickety pier off the east beach (planks give way underfoot) ----
    buildStairs(33.4, 6, 1, 0, 2.0, 2, 0.28, 0.5);
    for (const px6 of [35.1, 36.9, 38.7])
      addProp('plank', px6, 0.5, 6, 1.8, 0.12, 1.9, T.plywood, 0xc9a05f, 22, { step: true });
    buildPost(34.3, 5.0, 1.4, 0.13); buildPost(34.3, 7.0, 1.4, 0.13);
    buildPost(37.8, 5.0, 1.4, 0.13); buildPost(37.8, 7.0, 1.4, 0.13);
    addProp('drum', 39.2, 0.62, 6.4, 0.6, 0.9, 0.6, T.propane, 0xc23b2e, 18, { metal: true });
    torchPts.push([33.6, 7.4]);

    // ---- shipwreck on the west shore ----
    const hullN = WallGrid({ ox: -34, oy: 0, oz: -13.2, dir: 'x', cols: 8, rows: 3, cw: 1, ch: 0.7, th: 0.16, kind: 'plank', tint: 0x8a5a3b, hp: 24, house: null });
    wallFill(hullN, () => 0);
    const hullS = WallGrid({ ox: -34, oy: 0, oz: -9.4, dir: 'x', cols: 8, rows: 3, cw: 1, ch: 0.7, th: 0.16, kind: 'plank', tint: 0x8a5a3b, hp: 24, house: null });
    wallFill(hullS, () => 0);
    const hullW = WallGrid({ ox: -34, oy: 0, oz: -13.2, dir: 'z', cols: 4, rows: 3, cw: 1, ch: 0.7, th: 0.16, kind: 'plank', tint: 0x7a4a30, hp: 24, house: null });
    wallFill(hullW, () => 0);
    buildPlatform(-30, -11.3, 7.6, 3.4, 1.5, 0.18);                // deck
    buildStairs(-25.4, -11.3, -1, 0, 2.0, 3, 0.36, 0.5);           // gangway at the stern
    buildPost(-31.5, -11.3, 5.2, 0.22);                            // mast
    buildPlatform(-31.5, -11.3, 1.4, 1.4, 4.4, 0.12);              // crow's nest
    addLadder(-31.5, -10.5, 1.5, 4.4, 's');
    addProp('crate', -29, 1.6, -11.8, 1.0, 0.8, 1.0, T.plain, 0x9a6b3f, 25, {});
    addProp('chest', -32.6, 1.6, -10.7, 0.95, 0.7, 0.65, T.plain, 0xb8862b, 25, {});
    torchPts.push([-27, -9]);
    W.campSpots.push({ x: -29, z: -11.3, yaw: Math.PI / 2 });

    // ---- tiki statues (they judge you) ----
    for (const [tx5, tz5, ty] of [[0, -2, 0], [24, -16, 0], [18, 2, 0]])
      addProp('tiki', tx5, ty, tz5, 1.0, 2.3, 1.0, T.tiki, 0xffffff, 60, {});

    // ---- fruit stall by the stepping stones ----
    buildPost(21, 11.2, 3.0, 0.15); buildPost(23, 11.2, 3.0, 0.15);
    const stall = WallGrid({ ox: 20.5, oy: 0, oz: 12.6, dir: 'x', cols: 3, rows: 1, cw: 1, ch: 0.95, th: 0.2, kind: 'bamboo', tint: 0xcdb968, hp: 22, house: null });
    wallFill(stall, () => 0);
    const stallRoof = Sheet('thatch', 0xd6a852);
    for (let c = 0; c < 4; c++)
      for (let j = 0; j < 3; j++)
        sheetAdd(stallRoof, 19.9 + c + 0.6, 3.15 - j * 0.18, 10.9 + j + 0.5, 0.2, 'x', 1.06, 0.12, 1.06, 16);
    addProp('melon', 21.2, 0.95, 12.4, 0.45, 0.4, 0.45, T.plain, 0x3fae4f, 8, {});
    addProp('melon', 21.9, 0.95, 12.5, 0.45, 0.4, 0.45, T.plain, 0x5fc24f, 8, {});
    addProp('melon', 22.6, 0.95, 12.3, 0.45, 0.4, 0.45, T.plain, 0xe8b83e, 8, {});
    W.campSpots.push({ x: 22, z: 10.5, yaw: Math.atan2(-1, 0.6) });

    // ---- bamboo groves (soft cover) + extra beach clutter ----
    for (const [gx2, gz2] of [[-14, 14], [20, -22], [32, 14]]) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const bx2 = gx2 + Math.cos(a) * (0.7 + (i % 2) * 0.5), bz2 = gz2 + Math.sin(a) * (0.7 + (i % 2) * 0.4);
        buildPost(bx2, bz2, 3.1 + (i % 3) * 0.5, 0.15);
        const fg = new THREE.PlaneGeometry(1.5, 0.55);
        fg.translate(0.75, 0, 0);
        fg.rotateZ(-0.3);
        fg.rotateY(a * 2.4);
        fg.translate(bx2, 3.2 + (i % 3) * 0.45, bz2);
        frondGeos.push(fg);
      }
    }

    W.spawnPoints = [
      { x: -36, z: 0 }, { x: 36, z: 0 }, { x: -34, z: -22 }, { x: -34, z: 22 },
      { x: 34, z: -22 }, { x: 34, z: 24 }, { x: 0, z: -30 }, { x: -2, z: 30 },
      { x: -20, z: 16 }, { x: 26, z: -10 }, { x: -26, z: -6 }, { x: 22, z: 18 },
    ];
    W.hillSpots = [
      { x: -20, z: 16, y: 0, r: 5.5 },   // village side
      { x: 26, z: -10, y: 0, r: 5.5 },   // east grove
      { x: -2, z: 30, y: 0, r: 5.5 },    // south beach
      { x: 0, z: -30, y: 0, r: 5.5 },    // north beach
    ];
    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#2e8fae'; x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = '#eed08a';
      x.beginPath(); x.ellipse(ox * s, oz * s, 56 * s, 48 * s, 0, 0, 7); x.fill();
      x.fillStyle = '#5cb84a';
      x.beginPath(); x.ellipse(ox * s, oz * s, 42 * s, 35 * s, 0, 0, 7); x.fill();
      x.fillStyle = '#4b4348';
      x.fillRect((ox + 1) * s, (oz - 20) * s, 22 * s, 16 * s);
      x.fillStyle = '#ff5a12';
      for (const r of creek) x.fillRect((ox + r[0]) * s, (oz + r[1]) * s, (r[2] - r[0]) * s, (r[3] - r[1]) * s);
      x.fillRect((ox + 9.4) * s, (oz - 14.6) * s, 5.2 * s, 4.8 * s);
    };

    // ---- live island behavior ----
    let fxInited = false;
    let volcanoT = 14;
    const volcanoBombs = [];
    W.mapUpdate = function (dt) {
      if (!fxInited) { // emitters must outlive fx.reset(), which runs after build
        fxInited = true;
        G.fx.addEmitter({ pos: new THREE.Vector3(12, 5.1, -12.2), rate: 2.4, kind: 'smoke', dur: 1e6 });
        for (const [tx3, tz3] of torchPts) G.fx.addEmitter({ pos: new THREE.Vector3(tx3, 1.85, tz3), rate: 3.2, kind: 'fire', dur: 1e6 });
        for (const g of geysers) G.fx.addEmitter({ pos: new THREE.Vector3(g.x, 0.4, g.z), rate: 1.4, kind: 'smoke', dur: 1e6 });
      }
      for (const g of geysers) { // eruption burst fx on each cycle start
        const on = ((W.mapClock + g.offset) % g.period) < 1.15;
        if (on && !g._on) {
          G.fx.addEmitter({ pos: new THREE.Vector3(g.x, 0.3, g.z), rate: 50, kind: 'water', dur: 1.05 });
          G.fx.addEmitter({ pos: new THREE.Vector3(g.x, 0.8, g.z), rate: 12, kind: 'smoke', dur: 0.9 });
        }
        g._on = on;
      }
      // the mountain speaks (host/solo rolls the dice; explosions replicate via evBoom)
      if (!(G.net && G.net.active && !G.net.isHost)) {
        volcanoT -= dt;
        if (volcanoT <= 0) {
          volcanoT = 24 + U.rand(0, 14);
          if (G.game) {
            G.game.banner('THE VOLCANO IS ANGRY', '#ff7a30');
            G.game.chat('VOLCANO', U.pick(['*rumbling intensifies*', 'special delivery, no refunds', 'BRACE FOR MAGMA']));
          }
          G.fx.shake(0.9, 0.9);
          for (let i = 0; i < 3; i++) {
            const tx4 = U.rand(-W.bounds.x + 7, W.bounds.x - 7), tz4 = U.rand(-W.bounds.z + 7, W.bounds.z - 7);
            const delay = 1.4 + i * 0.55;
            volcanoBombs.push({ x: tx4, z: tz4, t: delay });
            tmpV.set(12, 5.4, -12.2);
            G.fx.debris(tmpV, new THREE.Vector3((tx4 - 12) / delay, 12.5, (tz4 + 12.2) / delay), 0.5, 0.5, 0.5, new THREE.Color(0xff6a20), delay + 0.3);
          }
        }
        for (let i = volcanoBombs.length - 1; i >= 0; i--) {
          const b = volcanoBombs[i];
          b.t -= dt;
          if (b.t <= 0) {
            volcanoBombs.splice(i, 1);
            tmpV.set(b.x, 0.4, b.z);
            W.explode(tmpV, 5, 88, { attacker: { name: 'THE VOLCANO', team: -1 }, tag: 'VOLCANO' });
            if (G.net && G.net.active) G.net.evBoom(tmpV, 5, 88, 'VOLCANO');
          }
        }
      }
    };
    addSky(0xff9e63, { cloudTint: 0xffd9c4, sunTint: 0xffb24a, sunPos: [-150, 42, -60], sunScale: 42, clouds: 5 });
  }

  // ============ MAP 4: MERIDIAN STATION — zero-g, everything's a hull breach waiting ============
  function buildStationMap() {
    // roomy void: fly over, around, and underneath both stations
    W.bounds = { x: 62, z: 52 };
    W.teamSpawns = [{ x: -34, z: 0 }, { x: 36, z: 4 }];
    W.zeroG = true;
    W.hasGround = false;
    W.spaceY = { min: -26, max: 38 };

    const whiteGeos = [];
    const HULL_TINT = 0xf4f6fa, TRIM = 0xb8c2d0;

    // ---- deck/ceiling tiles: every panel is its own destructible prop ----
    const tileGrid = (x0, z0, x1, z1, topY, o) => {
      o = o || {};
      const nx = Math.max(1, Math.round((x1 - x0) / 4.8)), nz = Math.max(1, Math.round((z1 - z0) / 4.8));
      const tw = (x1 - x0) / nx, td = (z1 - z0) / nz;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const cx = x0 + (i + 0.5) * tw, cz = z0 + (j + 0.5) * td;
          if (o.hole && cx > o.hole[0] && cx < o.hole[2] && cz > o.hole[1] && cz < o.hole[3]) continue;
          addProp('tile', cx, topY - 0.28, cz, tw - 0.1, 0.28, td - 0.1,
            o.glassy ? T.glassTex : T.hullFloor,
            o.glassy ? 0xbfe4f2 : ((i + j) % 2 ? 0xe8ecf2 : 0xd4dae4),
            o.hp || 70, { step: true, metal: !o.glassy, glassy: o.glassy });
        }
    };
    // ---- hull walls ----
    const hullW = (ox, oz, dir, cols, rows, fn, tint) => {
      const wl = WallGrid({ ox, oz, oy: 0, dir, cols, rows, cw: 1, ch: 0.72, th: 0.3, kind: 'hull', tint: tint || HULL_TINT, hp: 60, house: null });
      wallFill(wl, fn);
      return wl;
    };
    const door = (c0, c1, rTop) => (c, r) => (c >= c0 && c <= c1 && r <= (rTop || 4)) ? 1 : 0;
    // windows band helper: door gap + porthole pairs
    const winsAndDoor = (d0, d1, wr0, wr1) => (c, r) =>
      (d0 !== undefined && c >= d0 && c <= d1 && r <= 4) ? 1 :
      (r >= wr0 && r <= wr1 && (c % 4 === 1 || c % 4 === 2)) ? 3 : 0;
    // ---- the skeleton: indestructible girder frames on every module ----
    // shoot away every hull panel and the station's wireframe still hangs in
    // space — corner posts at the vertices, beams along the top edges, extra
    // posts on the long spans (placed clear of every doorway).
    function frameBox(x0, z0, x1, z1, y0, topY, xMids, zMids) {
      const S = 0.34, bY = topY + 0.17;
      const post = (px, pz) => {
        const g = U.shadedBoxGeo(S, topY - y0 + 0.34, S);
        g.translate(px, y0 + (topY - y0 + 0.34) / 2, pz);
        steelGeos.push(g);
        addCollider(px - S / 2, y0, pz - S / 2, px + S / 2, topY, pz + S / 2, { tree: true });
      };
      post(x0, z0); post(x1, z0); post(x0, z1); post(x1, z1);
      for (const mx of xMids || []) { post(mx, z0); post(mx, z1); }
      for (const mz of zMids || []) { post(x0, mz); post(x1, mz); }
      const beam = (bx0, bz0, bx1, bz1) => {
        const alongX = Math.abs(bx1 - bx0) > 0.01;
        const g = U.shadedBoxGeo(alongX ? bx1 - bx0 + S : S, S, alongX ? S : bz1 - bz0 + S);
        g.translate((bx0 + bx1) / 2, bY, (bz0 + bz1) / 2);
        steelGeos.push(g);
        addCollider(Math.min(bx0, bx1) - S / 2, bY - S / 2, Math.min(bz0, bz1) - S / 2,
          Math.max(bx0, bx1) + S / 2, bY + S / 2, Math.max(bz0, bz1) + S / 2, { step: true, noShoot: true });
        slabs.push({ minx: Math.min(bx0, bx1), minz: Math.min(bz0, bz1), maxx: Math.max(bx0, bx1), maxz: Math.max(bz0, bz1), top: bY + S / 2 });
      };
      beam(x0, z0, x1, z0); beam(x0, z1, x1, z1);
      beam(x0, z0, x0, z1); beam(x1, z0, x1, z1);
    }

    // ================= THE HUB (grand atrium, two levels, open core) =================
    tileGrid(-13, -13, 13, 13, 0);                                       // main deck
    tileGrid(-13, -13, 13, 13, 4.4, { hole: [-6.5, -6.5, 6.5, 6.5] });   // gallery ring
    tileGrid(-13, -13, 13, 13, 8.5);                                     // ceiling
    hullW(-13, -13, 'x', 26, 12, winsAndDoor(11, 14, 6, 7));             // north (door → hydro corridor)
    hullW(-13, 13, 'x', 26, 12, winsAndDoor(11, 14, 6, 7));              // south
    hullW(-13, -13, 'z', 26, 12, winsAndDoor(11, 14, 6, 7));             // west
    hullW(13, -13, 'z', 26, 12, winsAndDoor(11, 14, 6, 7));              // east
    // gallery guard rail (hull half-walls with gaps at the four bridges)
    for (const [gx, gz, gd, gc] of [[-6.5, -6.5, 'x', 13], [-6.5, 6.2, 'x', 13], [-6.5, -6.5, 'z', 13], [6.2, -6.5, 'z', 13]]) {
      const rl = WallGrid({ ox: gx, oz: gz, oy: 4.4, dir: gd, cols: gc, rows: 1, cw: 1, ch: 0.6, th: 0.12, kind: 'hull', tint: TRIM, hp: 20, house: null });
      wallFill(rl, (c) => (c >= 5 && c <= 7) ? 1 : 0);
    }
    // the holotable + light column
    addProp('holo', 0, 0, 0, 2.6, 0.95, 2.6, T.console, 0x3a4252, 90, { metal: true });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 7.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(0, 4.4, 0);
    grp.add(beam);
    // red lounge chairs, planters, kiosks (the 2001 lobby look)
    for (const [dx2, dz2, ry] of [[-3.4, -1.8, 0.5], [3.4, -1.8, -0.5], [-3.4, 2.2, 2.6], [3.4, 2.2, -2.6]])
      addProp('djinn', dx2, 0, dz2, 1.8, 0.8, 0.85, T.plain, 0xd23b3b, 40, { rotY: ry });
    for (const [px7, pz7] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
      addProp('planter', px7, 0, pz7, 1.7, 0.85, 1.7, T.plain, 0xdde2ea, 45, { metal: true });
      for (let i = 0; i < 4; i++) {
        const fg = new THREE.PlaneGeometry(1.5, 0.6);
        fg.translate(0.7, 0, 0); fg.rotateZ(-0.5); fg.rotateY(i * 1.57 + px7);
        fg.translate(px7, 1.5, pz7);
        frondGeos.push(fg);
      }
    }
    addProp('kiosk', -8, 0, 0, 0.9, 1.9, 0.9, T.console, 0x4a5266, 50, { metal: true });
    addProp('kiosk', 8, 0, 0, 0.9, 1.9, 0.9, T.console, 0x4a5266, 50, { metal: true });
    // gallery loot
    addProp('crate', -10.5, 4.4, -10.5, 1.2, 1.0, 1.2, T.plain, 0x9aa4b4, 30, {});
    addProp('console', 10, 4.4, 10.5, 2.6, 1.05, 0.85, T.console, 0x3a4252, 60, { metal: true });
    addProp('cell', 10.8, 4.4, -10.6, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });

    // ================= CORRIDORS (N/S/E/W spokes) =================
    for (const [cx0, cz0, cx1, cz1, dir] of [
      [13, -2.6, 19, 2.6, 'x'], [-19, -2.6, -13, 2.6, 'x'],
      [-2.6, 13, 2.6, 19, 'z'], [-2.6, -19, 2.6, -13, 'z'],
    ]) {
      tileGrid(cx0, cz0, cx1, cz1, 0);
      tileGrid(cx0, cz0, cx1, cz1, 4.1);
      if (dir === 'x') {
        hullW(cx0, cz0, 'x', 6, 6, (c, r) => (r >= 2 && r <= 3 && c % 2 === 1) ? 3 : 0);
        hullW(cx0, cz1, 'x', 6, 6, (c, r) => (r >= 2 && r <= 3 && c % 2 === 1) ? 3 : 0);
      } else {
        hullW(cx0, cz0, 'z', 6, 6, (c, r) => (r >= 2 && r <= 3 && c % 2 === 1) ? 3 : 0);
        hullW(cx1, cz0, 'z', 6, 6, (c, r) => (r >= 2 && r <= 3 && c % 2 === 1) ? 3 : 0);
      }
    }

    // ================= HANGAR BAY (east): shuttle + open space door =================
    tileGrid(19, -10, 43, 10, 0);
    tileGrid(19, -10, 43, 10, 8.5);
    hullW(19, -10, 'x', 24, 12, winsAndDoor(undefined, undefined, 7, 8));
    hullW(19, 10, 'x', 24, 12, winsAndDoor(4, 6, 7, 8));                 // side door
    hullW(19, -10, 'z', 20, 12, door(7, 12, 4));                          // to corridor
    hullW(43, -10, 'z', 20, 12, (c, r) => (c >= 6 && c <= 13 && r <= 8) ? 1 : 0); // BAY DOOR → space
    plane(1.2, 16, T.hazard(), 42.2, 0.04, 0).material.map.repeat.set(1, 6); // atmo-shield threshold
    // the shuttle (don't scratch the paint — it's worth more than the block)
    addProp('shuttle', 32, 0, -4.5, 7.6, 2.5, 3.2, T.container, 0xe8ecf2, 600, { metal: true });
    addProp('shuttle', 37.2, 0, -4.5, 2.2, 1.7, 2.2, T.console, 0x3a4252, 200, { metal: true }); // cockpit
    (() => { const g = U.shadedBoxGeo(0.5, 3.4, 2.6); g.rotateZ(0.5); g.translate(29.5, 2.9, -4.5); whiteGeos.push(g); })(); // tail fin
    (() => { const g = U.shadedBoxGeo(5.2, 0.22, 2.2); g.rotateX(0.55); g.translate(32, 1.5, -6.6); whiteGeos.push(g); })(); // wings
    (() => { const g = U.shadedBoxGeo(5.2, 0.22, 2.2); g.rotateX(-0.55); g.translate(32, 1.5, -2.4); whiteGeos.push(g); })();
    // cargo + fuel
    addProp('crate', 23, 0, 6.5, 1.4, 1.2, 1.4, T.plain, 0x9aa4b4, 30, {});
    addProp('crate', 24.6, 0, 6.9, 1.2, 1.0, 1.2, T.plain, 0x8a94a4, 30, {});
    addProp('crate', 23.7, 1.2, 6.6, 1.1, 0.9, 1.1, T.plain, 0xaab4c4, 25, {});
    addProp('cell', 27, 0, 8, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });
    addProp('cell', 28.1, 0, 8.2, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });
    addProp('cell', 27.5, 0, 6.9, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });
    addProp('tug', 38, 0, 7, 2.6, 1.3, 1.7, T.plain, 0xffcf4a, 160, { metal: true });
    addProp('droid', 21, 0, -7.5, 0.65, 0.55, 0.9, T.gunmetal ? T.gunmetal : T.plain, 0x2b2f3a, 25, { metal: true });
    // glass control booth (NW corner)
    const bw1 = WallGrid({ ox: 19.3, oz: -6.2, oy: 0, dir: 'x', cols: 5, rows: 4, cw: 1, ch: 0.72, th: 0.18, kind: 'hull', tint: TRIM, hp: 40, house: null });
    wallFill(bw1, (c, r) => r >= 2 ? 3 : (c === 4 && r <= 1 ? 1 : 0));
    const bw2 = WallGrid({ ox: 24.3, oz: -10, oy: 0, dir: 'z', cols: 4, rows: 4, cw: 1, ch: 0.72, th: 0.18, kind: 'hull', tint: TRIM, hp: 40, house: null });
    wallFill(bw2, (c, r) => r >= 2 ? 3 : (c === 2 && r <= 1 ? 1 : 0));
    addProp('console', 21.5, 0, -8.6, 2.6, 1.05, 0.85, T.console, 0x3a4252, 60, { metal: true });

    // ================= COMMAND BRIDGE (west): the big window =================
    tileGrid(-43, -8, -19, 8, 0);
    tileGrid(-43, -8, -19, 8, 7.1);
    hullW(-43, -8, 'x', 24, 10, winsAndDoor(undefined, undefined, 5, 6));
    hullW(-43, 8, 'x', 24, 10, winsAndDoor(undefined, undefined, 5, 6));
    hullW(-19, -8, 'z', 16, 10, door(6, 9, 4));                           // to corridor
    hullW(-43, -8, 'z', 16, 10, (c, r) => (r >= 2 && r <= 8 && c >= 2 && c <= 13) ? 3 : 0); // panoramic viewport
    addProp('console', -36, 0, -4, 3.4, 1.1, 0.95, T.console, 0x3a4252, 60, { metal: true });
    addProp('console', -36, 0, 0, 3.4, 1.1, 0.95, T.console, 0x3a4252, 60, { metal: true });
    addProp('console', -36, 0, 4, 3.4, 1.1, 0.95, T.console, 0x3a4252, 60, { metal: true });
    addProp('holo', -28, 0, 0, 1.7, 1.5, 1.7, T.console, 0x2f5a6a, 90, { metal: true });
    addProp('djinn', -25, 0, 0, 1.8, 0.8, 0.85, T.plain, 0xd23b3b, 40, {});
    addProp('console', -20.5, 0, -6.4, 2.2, 1.05, 0.8, T.console, 0x3a4252, 60, { metal: true });
    addProp('locker', -20.5, 0, 6.4, 1.6, 2.0, 0.6, T.container, 0x8a94a4, 40, { metal: true });

    // ================= HYDROPONICS (north): green under glass =================
    tileGrid(-9, -33, 9, -19, 0);
    tileGrid(-9, -33, 9, -19, 6.0, { glassy: true, hp: 18 });             // glass canopy
    hullW(-9, -33, 'x', 18, 8, (c, r) => (c >= 8 && c <= 10 && r <= 3) ? 1 : 0); // EVA gap → space
    hullW(-9, -19, 'x', 18, 8, door(8, 10, 4));                            // to corridor
    hullW(-9, -33, 'z', 14, 8, winsAndDoor(undefined, undefined, 3, 5));
    hullW(9, -33, 'z', 14, 8, winsAndDoor(undefined, undefined, 3, 5));
    for (const hz of [-30, -27, -24]) { addHedge(-4, hz, true); addHedge(4, hz, true); }
    for (const [px8, pz8] of [[-7, -31], [7, -31], [-7, -21], [7, -21], [0, -26]]) {
      addProp('planter', px8, 0, pz8, 1.5, 0.8, 1.5, T.plain, 0xdde2ea, 45, {});
      for (let i = 0; i < 4; i++) {
        const fg = new THREE.PlaneGeometry(1.4, 0.55);
        fg.translate(0.65, 0, 0); fg.rotateZ(-0.45); fg.rotateY(i * 1.6 + pz8);
        fg.translate(px8, 1.4, pz8);
        frondGeos.push(fg);
      }
    }
    addProp('tank', -7.5, 0, -26, 1.8, 2.5, 1.8, T.glassTex, 0x9fd8e8, 60, { glassy: true });

    // ================= CREW QUARTERS + MED BAY (south) =================
    tileGrid(-9, 19, 9, 33, 0);
    tileGrid(-9, 19, 9, 33, 5.6);
    hullW(-9, 33, 'x', 18, 8, (c, r) => (c >= 8 && c <= 10 && r <= 3) ? 1 : 0);  // EVA gap → space
    hullW(-9, 19, 'x', 18, 8, door(8, 10, 4));                                    // to corridor
    hullW(-9, 19, 'z', 14, 8, winsAndDoor(undefined, undefined, 3, 4));
    hullW(9, 19, 'z', 14, 8, winsAndDoor(undefined, undefined, 3, 4));
    const part = WallGrid({ ox: -9, oz: 26, oy: 0, dir: 'x', cols: 18, rows: 6, cw: 1, ch: 0.72, th: 0.2, kind: 'hull', tint: 0xdde2ea, hp: 45, house: null });
    wallFill(part, (c, r) => (c >= 3 && c <= 4 && r <= 4) ? 1 : (c >= 13 && c <= 14 && r <= 4) ? 1 : 0);
    // bunk room (north half)
    for (const bx of [-7.5, -5.2, 5.2, 7.5]) {
      addProp('bunk', bx, 0, 20.2, 1.0, 0.55, 2.2, T.plain, 0x7fa8d0, 30, {});
      addProp('bunk', bx, 1.5, 20.2, 1.0, 0.45, 2.2, T.plain, 0x9fc0e0, 30, {});
    }
    addProp('locker', -1.2, 0, 19.6, 1.6, 2.0, 0.6, T.container, 0x8a94a4, 40, { metal: true });
    addProp('vend', 1.8, 0, 19.6, 1.1, 2.0, 0.8, T.console, 0xd24a4a, 55, { metal: true });
    addProp('vend', 3.2, 0, 19.6, 1.1, 2.0, 0.8, T.console, 0x4a7fd0, 55, { metal: true });
    // mess + medbay (south half)
    addProp('table', -4, 0, 29.5, 2.2, 0.8, 1.2, T.plain, 0xdde2ea, 40, {});
    addProp('table', 3, 0, 29.5, 2.2, 0.8, 1.2, T.plain, 0xdde2ea, 40, {});
    addProp('bunk', -7.4, 0, 31.5, 1.1, 0.7, 2.3, T.plain, 0xf0f4f8, 30, {});
    addProp('bunk', 7.4, 0, 31.5, 1.1, 0.7, 2.3, T.plain, 0xf0f4f8, 30, {});
    addProp('tank', 0, 0, 32, 1.4, 2.4, 1.4, T.glassTex, 0x9fe8c0, 60, { glassy: true });

    // ================= THE SKELETON (every module keeps its bones) =================
    frameBox(-13, -13, 13, 13, 0, 8.64, [-7, 7], [-7, 7]);        // the hub
    frameBox(13, -2.6, 19, 2.6, 0, 4.32);                          // east spoke
    frameBox(-19, -2.6, -13, 2.6, 0, 4.32);                        // west spoke
    frameBox(-2.6, 13, 2.6, 19, 0, 4.32);                          // south spoke
    frameBox(-2.6, -19, 2.6, -13, 0, 4.32);                        // north spoke
    frameBox(19, -10, 43, 10, 0, 8.64, [29, 37], [-6.5, 6.5]);     // hangar bay
    frameBox(-43, -8, -19, 8, 0, 7.2, [-35, -27], [-4.5, 4.5]);    // command bridge
    frameBox(-9, -33, 9, -19, 0, 5.76, [-4.8, 4.8], [-26]);        // hydroponics
    frameBox(-9, 19, 9, 33, 0, 5.76, [-4.8, 4.8], [26]);           // crew quarters

    // ================= EXTERIOR: trusses, arrays, floating cover =================
    // solar truss bridging over the hub
    (() => { const g = U.shadedBoxGeo(0.5, 0.5, 56); g.translate(0, 11, 0); steelGeos.push(g); })();
    for (const tz of [-24, -17, 17, 24])
      for (const sgn of [-1, 1])
        addProp('solar', sgn * 3.4, 10.6, tz, 6.0, 0.16, 5.6, T.solar, 0xffffff, 40, { noWalk: true });
    // comm masts + rotating radar dish on the bridge roof
    buildPost(-30, -6, 4.6, 0.22, 7.2, steelGeos);
    buildPost(24, 8.5, 4.2, 0.2, 8.6, steelGeos);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 0.4, 0.9, 10, 1, true),
      new THREE.MeshBasicMaterial({ map: T.hullPanel(), color: 0xdde2ea, side: THREE.DoubleSide }));
    dish.position.set(-30, 12.4, -6);
    dish.rotation.z = 0.7;
    grp.add(dish);
    W._dishMesh = dish; // shoot the mount below and the whole thing sails off
    addProp('dish', -30, 11.3, -6, 0.9, 0.9, 0.9, T.console, 0x8a94a4, 60, { metal: true });
    // floating cargo pods + rocks (cover for the space-walkers)
    addProp('pod', 22, 3.2, 22, 2.3, 2.3, 2.7, T.container, 0xc86a4a, 70, { metal: true });
    addProp('pod', -26, 4.5, -20, 2.3, 2.3, 2.7, T.container, 0x4a7fd0, 70, { metal: true });
    addProp('pod', 32, 2.2, -20, 2.3, 2.3, 2.7, T.container, 0x64a86a, 70, { metal: true });
    addProp('pod', -18, 3.5, 26, 2.3, 2.3, 2.7, T.container, 0xc8b23e, 70, { metal: true });
    for (const [ax, ay, az, s] of [[52, 1, 40, 3.2], [-52, 6, -38, 2.6], [-54, -6, 30, 2.2], [10, -12, -44, 2.8], [-8, 20, 44, 2.4]]) {
      const g = U.shadedBoxGeo(s, s * 0.8, s * 0.9);
      g.rotateZ(0.5); g.rotateY(1.1);
      g.translate(ax, ay, az);
      rockGeos.push(g);
      addCollider(ax - s / 2, ay - s * 0.4, az - s / 2, ax + s / 2, ay + s * 0.4, az + s / 2, {});
    }
    // oxygen farm on the quarters roof (very shootable)
    for (const [ox2, oz2] of [[-4, 22], [-2.6, 22], [-1.2, 22]])
      addProp('cell', ox2, 5.7, oz2, 0.7, 1.2, 0.7, T.propane, 0xbfe8ff, 16, { metal: true });

    // ================= WHEEL STATION "ODYSSEY RING" (NE, higher orbit) =================
    // a small 2001-style ring: square torus, hub, two spokes, pod bay, brain room
    const WX = 38, WZ = -34, WY = 18; // hub center + deck height (a full tier above the main station)
    const ringF = (x0, z0, x1, z1) => { tileGrid(x0, z0, x1, z1, WY); tileGrid(x0, z0, x1, z1, WY + 4.4); };
    // four ring segments (outer 26x26, tube width 6)
    ringF(WX - 13, WZ - 13, WX + 13, WZ - 7);   // north run
    ringF(WX - 13, WZ + 7, WX + 13, WZ + 13);   // south run
    ringF(WX - 13, WZ - 7, WX - 7, WZ + 7);     // west run
    ringF(WX + 7, WZ - 7, WX + 13, WZ + 7);     // east run
    const wWall = (ox, oz, dir, cols, fn, tint) => {
      const wl = WallGrid({ ox, oz, oy: WY, dir, cols, rows: 6, cw: 1, ch: 0.72, th: 0.28, kind: 'hull', tint: tint || HULL_TINT, hp: 55, house: null });
      wallFill(wl, fn);
    };
    const ringWin = (c, r) => (r >= 2 && r <= 3 && c % 3 === 1) ? 3 : 0;
    // outer ring walls (portholes all around, EVA gap on the east face)
    wWall(WX - 13, WZ - 13, 'x', 26, ringWin);
    wWall(WX - 13, WZ + 13, 'x', 26, ringWin);
    wWall(WX - 13, WZ - 13, 'z', 26, ringWin);
    wWall(WX + 13, WZ - 13, 'z', 26, (c, r) => (c >= 11 && c <= 13 && r <= 4) ? 1 : ringWin(c, r));
    // inner ring walls (doors to the two spokes)
    wWall(WX - 7, WZ - 7, 'x', 14, (c, r) => (c >= 6 && c <= 7 && r <= 4) ? 1 : 0);
    wWall(WX - 7, WZ + 7, 'x', 14, (c, r) => (c >= 6 && c <= 7 && r <= 4) ? 1 : 0);
    wWall(WX - 7, WZ - 7, 'z', 14, () => 0);
    wWall(WX + 7, WZ - 7, 'z', 14, () => 0);
    // hub: pod bay with EVA pods + the brain room upstairs vibe (kept one level, red)
    tileGrid(WX - 4, WZ - 4, WX + 4, WZ + 4, WY);
    tileGrid(WX - 4, WZ - 4, WX + 4, WZ + 4, WY + 4.4);
    // spokes N/S connecting hub to ring (open tubes)
    tileGrid(WX - 1.6, WZ - 7, WX + 1.6, WZ - 4, WY);
    tileGrid(WX - 1.6, WZ - 7, WX + 1.6, WZ - 4, WY + 4.4);
    tileGrid(WX - 1.6, WZ + 4, WX + 1.6, WZ + 7, WY);
    tileGrid(WX - 1.6, WZ + 4, WX + 1.6, WZ + 7, WY + 4.4);
    for (const sz of [-7, 4]) {
      wWall(WX - 1.6, WZ + sz, 'z', 3, () => 0);
      wWall(WX + 1.6, WZ + sz, 'z', 3, () => 0);
    }
    // hub walls: white outside, THE BRAIN ROOM inside is red
    wWall(WX - 4, WZ - 4, 'x', 8, (c, r) => (c >= 3 && c <= 4 && r <= 4) ? 1 : 0, 0xd8dce4);
    wWall(WX - 4, WZ + 4, 'x', 8, (c, r) => (c >= 3 && c <= 4 && r <= 4) ? 1 : 0, 0xd8dce4);
    wWall(WX - 4, WZ - 4, 'z', 8, ringWin, 0xd8dce4);
    wWall(WX + 4, WZ - 4, 'z', 8, ringWin, 0xd8dce4);
    // memory cores (glassy pink slabs — shoot to lobotomize)
    for (const [mx2, mz2] of [[-2.6, -2.6], [-2.6, 0], [-2.6, 2.6], [2.6, -2.6], [2.6, 0], [2.6, 2.6]])
      addProp('core', WX + mx2, WY, WZ + mz2, 0.7, 2.6, 0.5, T.glassTex, 0xffb0c8, 30, { glassy: true });
    addProp('hal', WX, WY + 1.2, WZ - 3.7, 1.0, 2.1, 0.28, T.hal, 0xffffff, 120, { metal: true });
    // EVA pods parked in the east ring segment (the pod bay)
    addProp('evapod', WX + 10, WY, WZ - 3, 2.0, 2.0, 2.0, T.plain, 0xf0f4f8, 60, { metal: true });
    addProp('evapod', WX + 10, WY, WZ + 1, 2.0, 2.0, 2.0, T.plain, 0xf0f4f8, 60, { metal: true });
    addProp('djinn', WX - 10, WY, WZ + 2, 1.8, 0.8, 0.85, T.plain, 0xd23b3b, 40, {});
    addProp('djinn', WX - 10, WY, WZ - 2, 1.8, 0.8, 0.85, T.plain, 0xd23b3b, 40, { rotY: Math.PI });
    addProp('console', WX + 2, WY, WZ + 10.5, 2.6, 1.05, 0.85, T.console, 0x3a4252, 60, { metal: true });
    addProp('crate', WX - 4, WY, WZ + 10.5, 1.2, 1.0, 1.2, T.plain, 0x9aa4b4, 30, {});
    addProp('cell', WX - 10.5, WY, WZ - 10.5, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });
    // THE MONOLITH floats just off the wheel. do not touch it. (touch it)
    addProp('monolith', WX - 20, WY + 1, WZ + 6, 0.9, 4.0, 1.8, T.plain, 0x0a0a0e, 150, { metal: true });
    W.campSpots.push({ x: WX + 10, z: WZ, yaw: -Math.PI / 2 }, { x: WX, z: WZ, yaw: Math.PI });
    // the wheel keeps its bones too
    frameBox(WX - 13, WZ - 13, WX + 13, WZ + 13, WY, WY + 4.32, [WX - 8, WX + 8], [WZ - 8, WZ + 8]);
    frameBox(WX - 4, WZ - 4, WX + 4, WZ + 4, WY, WY + 4.32);

    // ---- supply line: drifting cargo climbing toward the wheel (flight cover) ----
    addProp('pod', 18, 6, -18, 2.3, 2.3, 2.7, T.container, 0x8a94a4, 70, { metal: true });
    addProp('pod', 26, 10.5, -24, 2.3, 2.3, 2.7, T.container, 0xc86a4a, 70, { metal: true });
    addProp('crate', 22, 8.4, -21, 1.3, 1.1, 1.3, T.plain, 0x9aa4b4, 30, {});
    addProp('crate', 31, 14.2, -28, 1.3, 1.1, 1.3, T.plain, 0xb0bac8, 30, {});
    // a wrecked satellite drifting SW (loot-flavored scenery, all shootable)
    addProp('solar', -44, 2.2, 20, 5.0, 0.16, 2.4, T.solar, 0xffffff, 30, { noWalk: true, rotY: 0.7 });
    addProp('dish', -46.5, 1.4, 22.5, 1.1, 1.1, 1.1, T.console, 0x8a94a4, 45, { metal: true });
    addProp('pod', -47, 0.2, 19, 1.8, 1.8, 2.1, T.container, 0x6a7284, 60, { metal: true });

    // ================= SMALL CRAFT (vertically scattered boarding targets) =================
    // MULE-7 freighter: rusty hauler drifting BELOW the station's south flank
    const MX = -34, MZ = 30, MY = -12;
    tileGrid(MX - 7, MZ - 4, MX + 7, MZ + 4, MY);
    tileGrid(MX - 7, MZ - 4, MX + 7, MZ + 4, MY + 3.4);
    const mWall = (ox, oz, dir, cols, fn) => {
      const wl = WallGrid({ ox, oz, oy: MY, dir, cols, rows: 4, cw: 1, ch: 0.72, th: 0.24, kind: 'hull', tint: 0xcac4ae, hp: 50, house: null });
      wallFill(wl, fn);
    };
    mWall(MX - 7, MZ - 4, 'x', 14, (c, r) => (c >= 6 && c <= 7 && r <= 3) ? 1 : (c % 4 === 2 && r === 2) ? 3 : 0);   // port door
    mWall(MX - 7, MZ + 4, 'x', 14, (c, r) => (c % 4 === 2 && r === 2) ? 3 : 0);
    mWall(MX - 7, MZ - 4, 'z', 8, (c, r) => (r === 1 || r === 2) && c >= 2 && c <= 5 ? 3 : 0);                        // cockpit glass (west)
    mWall(MX + 7, MZ - 4, 'z', 8, (c, r) => (c >= 2 && c <= 5 && r <= 3) ? 1 : 0);                                    // open cargo ramp (east)
    frameBox(MX - 7, MZ - 4, MX + 7, MZ + 4, MY, MY + 2.88);                                                          // hauler ribs
    addProp('console', MX - 5.6, MY, MZ, 2.2, 1.0, 0.8, T.console, 0x3a4252, 60, { metal: true });
    addProp('crate', MX - 1, MY, MZ - 1.8, 1.3, 1.1, 1.3, T.plain, 0xb08a50, 30, {});
    addProp('crate', MX + 1.5, MY, MZ - 1.4, 1.2, 1.0, 1.2, T.plain, 0x9aa4b4, 30, {});
    addProp('crate', MX + 0.4, MY + 1.1, MZ - 1.6, 1.0, 0.9, 1.0, T.plain, 0xc9a05f, 25, {});
    addProp('cell', MX + 3, MY, MZ + 2, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });
    addProp('pallet', MX - 2, MY, MZ + 2.2, 1.6, 1.1, 1.6, T.brick, 0xc27a5a, 70, {});
    // engine pods on the stern (they are, of course, explosive)
    addProp('drum', MX - 7.9, MY + 0.6, MZ - 2.2, 1.3, 1.3, 1.3, T.propane, 0x5a5f66, 26, { metal: true });
    addProp('drum', MX - 7.9, MY + 0.6, MZ + 2.2, 1.3, 1.3, 1.3, T.propane, 0x5a5f66, 26, { metal: true });
    W.campSpots.push({ x: MX + 4, z: MZ, yaw: Math.PI / 2 });

    // SPARROW gunship: parked HIGH on the north-west approach
    const SX = -26, SZ = -26, SY = 21;
    tileGrid(SX - 5, SZ - 3, SX + 5, SZ + 3, SY);
    tileGrid(SX - 5, SZ - 3, SX + 5, SZ + 3, SY + 3.4);
    const sWall = (ox, oz, dir, cols, fn) => {
      const wl = WallGrid({ ox, oz, oy: SY, dir, cols, rows: 4, cw: 1, ch: 0.72, th: 0.24, kind: 'hull', tint: 0x9daab8, hp: 50, house: null });
      wallFill(wl, fn);
    };
    sWall(SX - 5, SZ - 3, 'x', 10, (c, r) => (c % 3 === 1 && r === 2) ? 3 : 0);
    sWall(SX - 5, SZ + 3, 'x', 10, (c, r) => (c >= 4 && c <= 6 && r <= 3) ? 1 : 0);                                   // rear ramp (south)
    sWall(SX - 5, SZ - 3, 'z', 6, (c, r) => (r === 1 || r === 2) && c >= 1 && c <= 4 ? 3 : 0);
    sWall(SX + 5, SZ - 3, 'z', 6, () => 0);
    addProp('console', SX - 3.6, SY, SZ, 1.8, 1.0, 0.8, T.console, 0x3a4252, 60, { metal: true });
    addProp('crate', SX + 2, SY, SZ - 1.4, 1.1, 0.9, 1.1, T.plain, 0x9aa4b4, 25, {});
    addProp('cell', SX + 3.4, SY, SZ + 1.6, 0.7, 1.1, 0.7, T.propane, 0x9fe8ff, 16, { metal: true });
    addProp('drum', SX + 5.9, SY + 0.5, SZ - 1.6, 1.2, 1.2, 1.2, T.propane, 0x5a5f66, 26, { metal: true });
    addProp('drum', SX + 5.9, SY + 0.5, SZ + 1.6, 1.2, 1.2, 1.2, T.propane, 0x5a5f66, 26, { metal: true });
    W.campSpots.push({ x: SX, z: SZ, yaw: 0 });

    // ---- space skybox: stars, a gas giant, hard sunlight ----
    scene.background = new THREE.Color(0x05060d);
    const starSphere = new THREE.Mesh(new THREE.SphereGeometry(290, 16, 10),
      new THREE.MeshBasicMaterial({ map: T.stars(), side: THREE.BackSide }));
    grp.add(starSphere);
    const planet = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.planet(), transparent: true, depthWrite: false }));
    planet.position.set(150, 34, -170);
    planet.scale.set(95, 95, 1);
    grp.add(planet);
    const sun2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sun(), transparent: true, depthWrite: false, color: 0xfff2d0 }));
    sun2.position.set(-190, 70, 120);
    sun2.scale.set(22, 22, 1);
    grp.add(sun2);
    if (whiteGeos.length) grp.add(new THREE.Mesh(U.mergeGeos(whiteGeos), new THREE.MeshBasicMaterial({ map: T.hullPanel(), vertexColors: true, color: 0xdde2ea })));

    W.spawnPoints = [
      { x: -34, z: 0 }, { x: 36, z: 4 }, { x: -10, z: -10 }, { x: 10, z: 10 },
      { x: 0, z: -26 }, { x: 0, z: 26 }, { x: 24, z: -7 }, { x: -24, z: 5 },
      { x: 16, z: 0 }, { x: -16, z: 0 }, { x: 0, z: 16 }, { x: 0, z: -16 },
    ];
    W.hillSpots = [ // on the main deck: zero-g crews have to touch down to hold it
      { x: 0, z: 0, y: 0, r: 6 },
      { x: -10.5, z: 10.5, y: 0, r: 5.5 },
      { x: 21.5, z: -7.5, y: 0, r: 5.5 },
      { x: 0, z: 22, y: 0, r: 5.5 },
    ];
    W.campSpots.push(
      { x: -10.5, z: 10.5, yaw: Math.atan2(10.5, -10.5) },
      { x: 21.5, z: -7.5, yaw: Math.PI / 2 },
      { x: -35, z: 0, yaw: Math.PI / 2 },
      { x: 4, z: 30, yaw: 0 },
      { x: -4, z: -30, yaw: Math.PI },
    );
    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#070810'; x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 40; i++) x.fillRect(((i * 37) % 144) * s, ((i * 53) % 116) * s, 1.5, 1.5);
      x.fillStyle = '#39404e';
      x.fillRect((ox - 13) * s, (oz - 13) * s, 26 * s, 26 * s);
      x.fillRect((ox + 19) * s, (oz - 10) * s, 24 * s, 20 * s);
      x.fillRect((ox - 43) * s, (oz - 8) * s, 24 * s, 16 * s);
      x.fillRect((ox - 9) * s, (oz - 33) * s, 18 * s, 14 * s);
      x.fillRect((ox - 9) * s, (oz + 19) * s, 18 * s, 14 * s);
      x.fillRect((ox - 2.6) * s, (oz - 19) * s, 5.2 * s, 38 * s);
      x.fillRect((ox - 19) * s, (oz - 2.6) * s, 38 * s, 5.2 * s);
      // the wheel (ring outline + hub)
      x.strokeStyle = '#39404e'; x.lineWidth = 6 * s * 0.55;
      x.strokeRect((ox + 38 - 10) * s, (oz - 34 - 10) * s, 20 * s, 20 * s);
      x.fillRect((ox + 38 - 4) * s, (oz - 34 - 4) * s, 8 * s, 8 * s);
      // small craft
      x.fillRect((ox - 41) * s, (oz + 26) * s, 14 * s, 8 * s);
      x.fillRect((ox - 31) * s, (oz - 29) * s, 10 * s, 6 * s);
    };

    // ---- live station: just the rotating dish. meteors only fall when CALLED
    // (the airstrike is a meteor shower here — no random ones, ever)
    W.mapUpdate = function (dt) {
      dish.rotation.y += dt * 0.5;
    };
  }


  // ============ MAP 6: GOLD RUSH GULCH — dusty boomtown between two red mesas ============
  function buildGulchMap() {
    W.bounds = { x: 62, z: 52 };
    W.teamSpawns = [{ x: -50, z: 36 }, { x: 50, z: -36 }];

    // hardpan desert + the dirt main street + rail bed
    plane(420, 420, T.desert(), 0, 0, 0).material.map.repeat.set(56, 56);
    plane(15, 100, T.dirt(), 0, 0.02, 0).material.map.repeat.set(2, 12);
    plane(122, 5.6, T.gravel(), 0, 0.024, 40).material.map.repeat.set(30, 2);
    const railN = plane(118, 0.32, T.plain(), 0, 0.05, 38.9); railN.material.color = new THREE.Color(0x4a4540);
    const railS = plane(118, 0.32, T.plain(), 0, 0.05, 41.1); railS.material.color = new THREE.Color(0x4a4540);
    // boardwalks in front of the shops
    for (const [bx, bz, bw, bd] of [[-11, -6, 2.2, 16], [-11, 13, 2.2, 10], [-11, 29, 2.2, 10], [11, -8, 2.2, 16], [11, 11, 2.2, 10]]) {
      plane(bw, bd, T.plywood(), bx, 0.06, bz).material.map.repeat.set(1, 4);
    }

    // invisible town limits
    addCollider(-68, 0, -56, -62.4, 22, 56, { noShoot: true });
    addCollider(62.4, 0, -56, 68, 22, 56, { noShoot: true });
    addCollider(-68, 0, -56, 68, 22, -52.4, { noShoot: true });
    addCollider(-68, 0, 52.4, 68, 22, 56, { noShoot: true });

    // wall helpers: weathered wood + quarry stone
    const WD = (o, dir, cols, rows, fn, tint, hp) => {
      const wl = WallGrid({ ox: o.ox, oy: o.oy || 0, oz: o.oz, dir, cols, rows, cw: 1, ch: 0.72, th: 0.24, kind: 'wood', tint: tint || 0xb98a55, hp: hp || 34, house: null });
      wallFill(wl, fn || (() => 0));
    };
    const BLK = (o, dir, cols, rows, fn, tint, hp) => {
      const wl = WallGrid({ ox: o.ox, oy: o.oy || 0, oz: o.oz, dir, cols, rows, cw: 1, ch: 0.72, th: 0.3, kind: 'block', tint: tint || 0xc9b8a0, hp: hp || 70, house: null });
      wallFill(wl, fn || (() => 0));
    };
    // window band for 6-row shops / 5-row-per-floor buildings
    const shopWin = (door) => (c, r) => {
      if (door) { const d = door(c, r); if (d !== undefined) return d; }
      return (r === 2 || r === 3) && c % 3 === 1 ? 3 : 0;
    };
    const floorWin = (door) => (c, r) => {
      if (door) { const d = door(c, r); if (d !== undefined) return d; }
      return (r % 5 === 2 || r % 5 === 3) && c % 4 === 1 ? 3 : 0;
    };

    // ---- THE MESAS: tiered red rock, each drilled through by a mine tunnel ----
    const mesaGeos = [];
    function mesa(minx, miny, minz, maxx, maxy, maxz) {
      const g = U.shadedBoxGeo(maxx - minx, maxy - miny, maxz - minz);
      g.translate((minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2);
      mesaGeos.push(g);
      addCollider(minx, miny, minz, maxx, maxy, maxz, {});
      slabs.push({ minx, minz, maxx, maxz, top: maxy });
    }
    // west mesa (x -58..-34, z -18..14), tunnel along x at z -2.2..2.2
    mesa(-58, 0, -18, -34, 3.6, -2.2);
    mesa(-58, 0, 2.2, -34, 3.6, 14);
    mesa(-56, 3.6, -16, -36, 6.4, 12);   // spans the tunnel: its underside is the ceiling
    mesa(-54, 6.4, -14, -38, 9, 10);
    // east mesa (x 36..58, z -14..18), tunnel along x at z -10.2..-5.8
    mesa(36, 0, -14, 58, 3.6, -10.2);
    mesa(36, 0, -5.8, 58, 3.6, 18);
    mesa(38, 3.6, -12, 56, 6.4, 16);
    mesa(40, 6.4, -10, 54, 9, 14);
    // boulder cover in the open desert
    mesa(-6, 0, -40, -2, 1.6, -37);
    mesa(6, 0, -34, 9, 1.3, -31.5);
    mesa(-16, 0, 44, -12.5, 1.4, 47);
    mesa(30, 0, 26, 33.5, 1.5, 29.5);
    grp.add(new THREE.Mesh(U.mergeGeos(mesaGeos.splice(0)), new THREE.MeshBasicMaterial({ map: T.redrock(), vertexColors: true })));

    // mine tunnel dressing: timber posts, roof beams, paydirt
    for (const tz of [[-2.2, 2.2, -56, -36, 0], [-10.2, -5.8, 38, 56, 1]]) {
      const [z0, z1, x0, x1] = tz;
      for (let bx = x0 + 2; bx <= x1 - 2; bx += 5) {
        buildPost(bx, z0 + 0.35, 3.6, 0.3, 0);
        buildPost(bx, z1 - 0.35, 3.6, 0.3, 0);
        buildPlatform(bx, (z0 + z1) / 2, 0.62, z1 - z0, 3.58, 0.12); // lintel beam
      }
    }
    addProp('tnt', -52, 0, 0.8, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('tnt', -44, 0, -1.2, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('tnt', -38.5, 0, 1, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('orecart', -48, 0, -1.1, 1.5, 1.1, 1.0, T.container, 0x6a5a48, 55, { metal: true });
    addProp('orecart', -40, 0, 0.9, 1.5, 1.1, 1.0, T.container, 0x6a5a48, 55, { metal: true });
    addProp('tnt', 42, 0, -9.2, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('tnt', 48, 0, -6.8, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('tnt', 53, 0, -9.4, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('orecart', 45, 0, -7, 1.5, 1.1, 1.0, T.container, 0x6a5a48, 55, { metal: true });
    addProp('stone', 51, 0, -7.2, 1.3, 0.8, 1.2, T.redrock, 0xb97848, 60, {});

    // mesa access 1: grand scaffold stairs up the outer faces
    buildStairs(-59.5, 16.4, 0, -1, 2.8, 25, 0.36, 0.52, 0);
    buildPlatform(-56.4, 2.2, 6.4, 3.0, 9, 0.2);
    for (const [px, pz] of [[-59.5, 15.8], [-59.5, 10], [-59.5, 5.4], [-57, 2.2]]) buildPost(px, pz, 8.6, 0.34, 0);
    buildStairs(59.5, 19.8, 0, -1, 2.8, 25, 0.36, 0.52, 0);
    buildPlatform(56.6, 5.8, 6.2, 3.0, 9, 0.2);
    for (const [px, pz] of [[59.5, 19.2], [59.5, 13.4], [59.5, 8.6], [57, 5.8]]) buildPost(px, pz, 8.6, 0.34, 0);
    // mesa access 2: fire-escape ladder towers on the street faces (chained segments)
    addLadder(-33.35, -6, 0, 3.6, 'e');
    addLadder(-33.35, -6, 3.6, 6.4, 'e');
    addLadder(-33.35, -6, 6.4, 9, 'e');
    buildPlatform(-34.6, -6, 2.6, 3.0, 3.6, 0.16);
    buildPlatform(-34.6, -6, 2.6, 3.0, 6.4, 0.16);
    buildPlatform(-35.6, -6, 5.2, 3.0, 9, 0.16);
    addLadder(35.35, 0, 0, 3.6, 'w');
    addLadder(35.35, 0, 3.6, 6.4, 'w');
    addLadder(35.35, 0, 6.4, 9, 'w');
    buildPlatform(36.6, 0, 2.6, 3.0, 3.6, 0.16);
    buildPlatform(36.6, 0, 2.6, 3.0, 6.4, 0.16);
    buildPlatform(37.6, 0, 5.2, 3.0, 9, 0.16);

    // ---- THE TRESTLE: the old rail line, right over main street at y 9 ----
    const TRX0 = -38, TRX1 = 40, TRSEGS = 18, TRW = (TRX1 - TRX0) / TRSEGS;
    for (let i = 0; i < TRSEGS; i++) {
      const cx = TRX0 + TRW * (i + 0.5);
      addProp('trestle', cx, 8.72, 5, TRW - 0.06, 0.28, 3.4, T.plywood, 0xa87848, 90, { step: true });
    }
    // rails on the deck (visual)
    const tr1 = plane(TRX1 - TRX0, 0.24, T.plain(), (TRX0 + TRX1) / 2, 9.03, 4.3); tr1.material.color = new THREE.Color(0x4a4540);
    const tr2 = plane(TRX1 - TRX0, 0.24, T.plain(), (TRX0 + TRX1) / 2, 9.03, 5.7); tr2.material.color = new THREE.Color(0x4a4540);
    // the rails are real iron: blow the deck away and you can still tightrope them
    for (const rz of [4.3, 5.7]) {
      addCollider(TRX0, 8.7, rz - 0.16, TRX1, 9.03, rz + 0.16, { step: true, noShoot: true });
      slabs.push({ minx: TRX0, minz: rz - 0.16, maxx: TRX1, maxz: rz + 0.16, top: 9.03 });
    }
    // low railings, with a gap where the ladder tower comes up
    const railA = WallGrid({ ox: TRX0, oy: 9, oz: 3.45, dir: 'x', cols: 78, rows: 1, cw: 1, ch: 0.8, th: 0.15, kind: 'fence', tint: 0x8a6b42, hp: 15, house: null });
    wallFill(railA, () => 0);
    const railB = WallGrid({ ox: TRX0, oy: 9, oz: 6.55, dir: 'x', cols: 78, rows: 1, cw: 1, ch: 0.8, th: 0.15, kind: 'fence', tint: 0x8a6b42, hp: 15, house: null });
    wallFill(railB, (c) => (c >= 34 && c <= 38) ? 1 : 0);
    // timber bents holding it up (destructible posts — happy demolition)
    for (const bx of [-33.3, -25.5, -17, -8.6, 10, 18.5, 27, 35.3]) {
      addProp('trestle', bx, 0, 3.9, 0.5, 8.72, 0.5, T.plywood, 0x9a6b3a, 120, {});
      addProp('trestle', bx, 0, 6.1, 0.5, 8.72, 0.5, T.plywood, 0x9a6b3a, 120, {});
      addProp('trestle', bx, 4.1, 5, 0.4, 0.4, 2.6, T.plywood, 0x9a6b3a, 60, {});
    }
    addProp('tnt', -8.6, 0, 7.6, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('tnt', 10, 0, 2.6, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    // street-level ladder tower up to the deck (chained, rest platform halfway)
    addLadder(-2, 7.05, 0, 4.5, 's');
    addLadder(-2, 7.05, 4.5, 9, 's');
    buildPlatform(-2, 7.85, 2.6, 1.5, 4.5, 0.14);
    buildPost(-3.2, 8.5, 4.5, 0.24, 0);
    buildPost(-0.8, 8.5, 4.5, 0.24, 0);

    // ---- WEST SIDE OF MAIN STREET ----
    // THE LUCKY STRIKE saloon (2 floors + street balcony + tall false front)
    WD({ ox: -26, oz: -14 }, 'x', 14, 10, floorWin());
    WD({ ox: -26, oz: 2 }, 'x', 14, 10, floorWin());
    WD({ ox: -26, oz: -14 }, 'z', 16, 10, floorWin());
    WD({ ox: -12, oz: -14 }, 'z', 16, 13, floorWin((c, r) => {
      if (c >= 5 && c <= 7 && r <= 3) return 1;          // swinging doors
      if (c >= 5 && c <= 7 && r >= 5 && r <= 8) return 1; // balcony doorway
      if (r >= 10) return c % 4 === 2 ? 3 : 0;            // false-front trim
    }), 0xc99a5f);
    // second floor + stair hole along the west wall
    buildPlatform(-17.2, -6, 10.4, 15.4, 3.6, 0.3);
    buildPlatform(-24.2, -12.85, 3.0, 1.7, 3.6, 0.3);
    buildPlatform(-24.2, -2.35, 3.0, 8.1, 3.6, 0.3);
    buildStairs(-24.2, -11.8, 0, 1, 3.0, 10, 0.36, 0.52, 0);
    // walkable roof + parapets + rear roof ladder
    buildPlatform(-19, -6, 13.4, 15.4, 7.2, 0.3);
    WD({ ox: -25.7, oy: 7.2, oz: -13.7 }, 'x', 13, 1, null, 0xa87848, 20);
    WD({ ox: -25.7, oy: 7.2, oz: 1.45 }, 'x', 13, 1, null, 0xa87848, 20);
    WD({ ox: -25.95, oy: 7.2, oz: -13.7 }, 'z', 15, 1, null, 0xa87848, 20);
    addLadder(-26.55, -10, 0, 3.6, 'w');
    addLadder(-26.55, -10, 3.6, 7.2, 'w');
    // street balcony
    buildPlatform(-11.3, -6, 1.6, 11, 3.6, 0.16);
    const balRail = WallGrid({ ox: -10.55, oy: 3.6, oz: -11.5, dir: 'z', cols: 11, rows: 1, cw: 1, ch: 0.75, th: 0.12, kind: 'fence', tint: 0x8a6b42, hp: 12, house: null });
    wallFill(balRail, () => 0);
    // saloon guts
    addProp('desk', -18, 0, 0.2, 4.4, 1.05, 0.9, T.floorWood, 0x8a5a32, 60, {});      // the bar
    addProp('keg', -15.2, 0, 1, 0.7, 0.9, 0.7, T.plain, 0x7a4f28, 20, {});
    addProp('keg', -21, 0, 1, 0.7, 0.9, 0.7, T.plain, 0x7a4f28, 20, {});
    addProp('keg', -13.4, 3.6, 0.8, 0.7, 0.9, 0.7, T.plain, 0x7a4f28, 20, {});
    addProp('piano', -24.5, 0, -8.5, 1.6, 1.3, 0.9, T.plain, 0x2e2420, 60, {});
    addProp('table', -16, 0, -6, 1.3, 0.8, 1.3, T.plain, 0x9a6b3a, 25, {});
    addProp('table', -20, 0, -10, 1.3, 0.8, 1.3, T.plain, 0x9a6b3a, 25, {});
    addProp('shelf', -25.4, 0, 0.4, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('sign', -11.6, 1.1, -10.5, 0.16, 1.3, 1.1, T.wanted, 0xffffff, 10, { rotY: Math.PI / 2 });

    // GENERAL STORE (walkable roof)
    WD({ ox: -24, oz: 8 }, 'x', 12, 6, shopWin(), 0xa8794a);
    WD({ ox: -24, oz: 18 }, 'x', 12, 6, shopWin(), 0xa8794a);
    WD({ ox: -24, oz: 8 }, 'z', 10, 6, null, 0xa8794a);
    WD({ ox: -12, oz: 8 }, 'z', 10, 6, shopWin((c, r) => { if (c >= 4 && c <= 5 && r <= 3) return 1; }), 0xa8794a);
    buildPlatform(-18, 13, 11.4, 9.4, 4.32, 0.25);
    WD({ ox: -23.7, oy: 4.32, oz: 8.3 }, 'x', 11, 1, null, 0x8a6b42, 18);
    WD({ ox: -23.7, oy: 4.32, oz: 17.7 }, 'x', 11, 1, null, 0x8a6b42, 18);
    addLadder(-24.55, 13, 0, 4.32, 'w');
    addProp('shelf', -22, 0, 10.5, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('shelf', -22, 0, 15.5, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('desk', -15, 0, 15.8, 2.6, 1.05, 0.9, T.floorWood, 0x8a5a32, 50, {});
    addProp('crate', -19, 0, 12, 1.0, 1.0, 1.0, T.plain, 0xb98a55, 20, {});
    addProp('crate', -18, 0, 10.6, 0.8, 0.8, 0.8, T.plain, 0xb98a55, 16, {});
    addProp('barrel', -13.6, 0, 9.4, 0.7, 1.0, 0.7, T.plain, 0x8a3a2a, 18, { metal: true });

    // SHERIFF + JAIL (chainlink = iron bars, bench in the cell)
    WD({ ox: -24, oz: 24 }, 'x', 12, 6, shopWin(), 0x9a8258);
    WD({ ox: -24, oz: 34 }, 'x', 12, 6, null, 0x9a8258);
    WD({ ox: -24, oz: 24 }, 'z', 10, 6, null, 0x9a8258);
    WD({ ox: -12, oz: 24 }, 'z', 10, 6, shopWin((c, r) => { if (c >= 4 && c <= 5 && r <= 3) return 1; }), 0x9a8258);
    const cell = WallGrid({ ox: -19, oy: 0, oz: 29.5, dir: 'x', cols: 6, rows: 5, cw: 1, ch: 0.72, th: 0.1, kind: 'chainlink', tint: 0xffffff, hp: 60, house: null });
    wallFill(cell, (c, r) => (c === 1 && r <= 3) ? 1 : 0);
    const cell2 = WallGrid({ ox: -19, oy: 0, oz: 29.5, dir: 'z', cols: 5, rows: 5, cw: 1, ch: 0.72, th: 0.1, kind: 'chainlink', tint: 0xffffff, hp: 60, house: null });
    wallFill(cell2, () => 0);
    addProp('bench', -16, 0, 32.5, 1.7, 0.55, 0.6, T.plain, 0x8a6b42, 25, {});
    addProp('desk', -21.5, 0, 26.5, 2.2, 1.05, 0.9, T.floorWood, 0x8a5a32, 50, {});
    buildPlatform(-18, 29, 11.4, 9.4, 4.32, 0.25);
    WD({ ox: -23.7, oy: 4.32, oz: 24.3 }, 'x', 11, 1, null, 0x8a6b42, 18);
    WD({ ox: -23.7, oy: 4.32, oz: 33.7 }, 'x', 11, 1, null, 0x8a6b42, 18);
    addLadder(-24.55, 29, 0, 4.32, 'w');

    // corral + stable shack (SW)
    buildFenceRun(-28, -22, -16, -22, false, 'fence', 0x8a6b42, 14);
    buildFenceRun(-28, -32, -19.5, -32, false, 'fence', 0x8a6b42, 14);
    buildFenceRun(-28, -32, -28, -22, false, 'fence', 0x8a6b42, 14);
    buildFenceRun(-16, -32, -16, -22, false, 'fence', 0x8a6b42, 14);
    addProp('hay', -25, 0, -25, 1.4, 1.0, 1.4, T.thatch, 0xd8b968, 15, {});
    addProp('hay', -23.2, 0, -27.5, 1.4, 1.0, 1.4, T.thatch, 0xd8b968, 15, {});
    addProp('hay', -24.2, 1.0, -26.2, 1.2, 0.9, 1.2, T.thatch, 0xd8b968, 15, {});
    addProp('trough', -18, 0, -24, 1.9, 0.6, 0.8, T.plain, 0x7a5f38, 22, {});
    addProp('wagon', -20, 0, -29.5, 3.2, 1.9, 1.8, T.plain, 0x8a5a30, 80, {});
    WD({ ox: -34, oz: -30 }, 'x', 5, 4, null, 0x8f7448);
    WD({ ox: -34, oz: -25 }, 'x', 5, 4, null, 0x8f7448);
    WD({ ox: -34, oz: -30 }, 'z', 5, 4, (c, r) => (c >= 1 && c <= 3 && r <= 3) ? 1 : 0, 0x8f7448);
    buildPlatform(-31.5, -27.5, 6, 6, 2.95, 0.2);

    // ---- EAST SIDE OF MAIN STREET ----
    // THE IMPERIAL hotel: 3 floors, balconies, roof — the tall one
    WD({ ox: 12, oz: -16 }, 'x', 16, 15, floorWin(), 0xc4a06a);
    WD({ ox: 12, oz: 0 }, 'x', 16, 15, floorWin(), 0xc4a06a);
    WD({ ox: 12, oz: -16 }, 'z', 16, 15, floorWin((c, r) => {
      if (c >= 6 && c <= 8 && r <= 3) return 1;            // lobby doors
      if (c >= 6 && c <= 8 && r >= 5 && r <= 8) return 1;  // balcony door fl2
      if (c >= 6 && c <= 8 && r >= 10 && r <= 13) return 1; // balcony door fl3
    }), 0xc4a06a);
    WD({ ox: 28, oz: -16 }, 'z', 16, 15, floorWin(), 0xc4a06a);
    for (const fy of [3.6, 7.2]) {
      buildPlatform(18.5, -8, 12.4, 15.4, fy, 0.3);
    }
    buildPlatform(26.2, -14.75, 3.0, 1.9, 3.6, 0.3);
    buildPlatform(26.2, -4.25, 3.0, 7.9, 3.6, 0.3);
    buildPlatform(26.2, -11.75, 3.0, 7.9, 7.2, 0.3);
    buildPlatform(26.2, -1.25, 3.0, 1.9, 7.2, 0.3);
    buildStairs(26.2, -13.6, 0, 1, 3.0, 10, 0.36, 0.52, 0);
    buildStairs(26.2, -2.4, 0, -1, 3.0, 10, 0.36, 0.52, 3.6);
    buildStairs(26.2, -13.6, 0, 1, 3.0, 10, 0.36, 0.52, 7.2);
    // roof: main deck + strip beside the stairwell hole + parapets
    buildPlatform(18.5, -8, 12.4, 15.4, 10.8, 0.3);
    buildPlatform(26.2, -4.25, 3.0, 7.9, 10.8, 0.3);
    WD({ ox: 12.3, oy: 10.8, oz: -15.7 }, 'x', 15, 1, null, 0xa87848, 20);
    WD({ ox: 12.3, oy: 10.8, oz: -0.55 }, 'x', 15, 1, null, 0xa87848, 20);
    WD({ ox: 12.3, oy: 10.8, oz: -15.7 }, 'z', 15, 1, null, 0xa87848, 20);
    // street balconies
    buildPlatform(11.3, -8, 1.6, 11, 3.6, 0.16);
    buildPlatform(11.3, -8, 1.6, 11, 7.2, 0.16);
    for (const by of [3.6, 7.2]) {
      const br = WallGrid({ ox: 10.55, oy: by, oz: -13.5, dir: 'z', cols: 11, rows: 1, cw: 1, ch: 0.75, th: 0.12, kind: 'fence', tint: 0x8a6b42, hp: 12, house: null });
      wallFill(br, () => 0);
    }
    // rear fire escape to the roof (chained ladders + landings)
    addLadder(28.55, -8, 0, 3.6, 'e');
    addLadder(28.55, -8, 3.6, 7.2, 'e');
    addLadder(28.55, -8, 7.2, 10.8, 'e');
    buildPlatform(29.3, -8, 1.5, 3.0, 3.6, 0.14);
    buildPlatform(29.3, -8, 1.5, 3.0, 7.2, 0.14);
    // lobby + rooms
    addProp('desk', 20, 0, -2.2, 3.0, 1.05, 0.9, T.floorWood, 0x8a5a32, 55, {});
    addProp('couch', 16, 0, -12.5, 2.0, 0.85, 0.9, T.couch, 0xffffff, 45, {});
    addProp('bed', 15, 3.6, -13, 2.1, 0.7, 1.4, T.bed, 0xffffff, 35, {});
    addProp('bed', 15, 3.6, -3, 2.1, 0.7, 1.4, T.bed, 0xffffff, 35, {});
    addProp('bed', 15, 7.2, -13, 2.1, 0.7, 1.4, T.bed, 0xffffff, 35, {});
    addProp('bed', 20, 7.2, -3.4, 2.1, 0.7, 1.4, T.bed, 0xffffff, 35, {});
    addProp('shelf', 24.2, 0, -15.2, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('crate', 13.8, 10.8, -14, 1.0, 1.0, 1.0, T.plain, 0xb98a55, 20, {});
    addProp('barrel', 25, 10.8, -2, 0.7, 1.0, 0.7, T.plain, 0x8a3a2a, 18, { metal: true });

    // BANK OF THE GULCH (stone, with a vault full of gold)
    BLK({ ox: 12, oz: 6 }, 'x', 12, 6, shopWin());
    BLK({ ox: 12, oz: 16 }, 'x', 12, 6);
    BLK({ ox: 12, oz: 6 }, 'z', 10, 6, shopWin((c, r) => { if (c >= 4 && c <= 5 && r <= 3) return 1; }));
    BLK({ ox: 24, oz: 6 }, 'z', 10, 6);
    const vaultF = WallGrid({ ox: 17.5, oy: 0, oz: 10.8, dir: 'x', cols: 6, rows: 6, cw: 1, ch: 0.72, th: 0.3, kind: 'block', tint: 0x8f8a80, hp: 120, house: null });
    wallFill(vaultF, (c, r) => (c === 1 && r <= 3) ? 1 : 0);
    const vaultS = WallGrid({ ox: 17.5, oy: 0, oz: 10.8, dir: 'z', cols: 5, rows: 6, cw: 1, ch: 0.72, th: 0.3, kind: 'block', tint: 0x8f8a80, hp: 120, house: null });
    wallFill(vaultS, () => 0);
    addProp('chest', 21.5, 0, 13.6, 1.2, 0.85, 0.9, T.plain, 0xc9a227, 45, {});
    addProp('chest', 19.5, 0, 14.6, 1.2, 0.85, 0.9, T.plain, 0xc9a227, 45, {});
    addProp('desk', 15, 0, 12.5, 2.6, 1.05, 0.9, T.floorWood, 0x8a5a32, 50, {});
    buildPlatform(18, 11, 11.4, 9.4, 4.32, 0.25);
    BLK({ ox: 12.3, oy: 4.32, oz: 6.3 }, 'x', 11, 1, null, 0x9a948a, 25);
    BLK({ ox: 12.3, oy: 4.32, oz: 15.7 }, 'x', 11, 1, null, 0x9a948a, 25);
    addLadder(24.55, 11, 0, 4.32, 'e');
    addProp('tnt', 25.5, 0, 8, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {}); // back-alley heist kit

    // CHURCH + BELL TOWER
    WD({ ox: 12, oz: 24 }, 'x', 14, 7, null, 0xd9cdb8);
    WD({ ox: 12, oz: 38 }, 'x', 14, 7, null, 0xd9cdb8);
    WD({ ox: 12, oz: 24 }, 'z', 14, 7, (c, r) => {
      if (c >= 5 && c <= 7 && r <= 3) return 1;                     // doors to the street
      return (r === 3 || r === 4) && c % 4 === 2 ? 3 : 0;           // high windows
    }, 0xd9cdb8);
    WD({ ox: 26, oz: 24 }, 'z', 14, 7, (c, r) => ((r === 3 || r === 4) && c % 4 === 2 ? 3 : 0), 0xd9cdb8);
    buildPlatform(19, 31, 13.4, 13.4, 5.04, 0.25);
    WD({ ox: 12.3, oy: 5.04, oz: 24.3 }, 'x', 13, 1, null, 0xc4b8a4, 18);
    WD({ ox: 12.3, oy: 5.04, oz: 37.7 }, 'x', 13, 1, null, 0xc4b8a4, 18);
    for (const pz of [27, 30.5, 34]) {
      addProp('pew', 17, 0, pz, 2.6, 0.7, 0.7, T.plain, 0x9a6b3a, 20, {});
      addProp('pew', 22, 0, pz, 2.6, 0.7, 0.7, T.plain, 0x9a6b3a, 20, {});
    }
    addProp('desk', 19.5, 0, 36.6, 2.2, 1.0, 0.9, T.plain, 0xd9cdb8, 40, {}); // altar
    // the bell tower: 16 rows tall, open belfry, chained interior ladders
    WD({ ox: 12, oz: 17 }, 'x', 4, 16, (c, r) => (r >= 11 && r <= 14 && c >= 1 && c <= 2) ? 1 : 0, 0xd9cdb8);
    WD({ ox: 12, oz: 21 }, 'x', 4, 16, (c, r) => (r >= 11 && r <= 14 && c >= 1 && c <= 2) ? 1 : 0, 0xd9cdb8);
    WD({ ox: 12, oz: 17 }, 'z', 4, 16, (c, r) => (r >= 11 && r <= 14 && c >= 1 && c <= 2) ? 1 : 0, 0xd9cdb8);
    WD({ ox: 16, oz: 17 }, 'z', 4, 16, (c, r) => {
      if (c >= 1 && c <= 2 && r <= 3) return 1;                     // ground door (east, off the alley)
      return (r >= 11 && r <= 14 && c >= 1 && c <= 2) ? 1 : 0;
    }, 0xd9cdb8);
    // free-standing mine ladder up the middle; the belfry floor leaves a slot
    // for it, so you climb straight through the hatch onto the deck
    addLadder(14, 19, 0, 3.85, 's');
    addLadder(14, 19, 3.85, 7.7, 's');
    buildPlatform(14, 20, 3.0, 1.4, 7.7, 0.18);   // north half (with the bell)
    buildPlatform(14, 17.9, 3.0, 1.2, 7.7, 0.18); // south half (crest landing)
    addProp('bell', 14, 8.5, 20.1, 0.9, 1.0, 0.9, T.plain, 0xd4af37, 60, { metal: true, noWalk: true });

    // ---- STREET LIFE ----
    addProp('stone', 0, 0, 20, 1.7, 0.95, 1.7, T.cinder, 0xb8b0a4, 80, {}); // the town well
    buildPost(-1, 19.2, 2.3, 0.16, 0); // well roof posts
    buildPost(1, 20.8, 2.3, 0.16, 0);
    buildPlatform(0, 20, 2.2, 2.2, 2.5, 0.12);
    addProp('sign', -2, 0.9, 12, 0.16, 1.3, 1.4, T.wanted, 0xffffff, 10, { rotY: Math.PI / 2 });
    for (const [hx, hz] of [[-10.2, -2], [-10.2, 10], [10.2, -4], [10.2, 8], [-10.2, 26], [10.2, 20]]) {
      buildPost(hx, hz, 1.1, 0.14, 0); // hitching posts
    }
    addProp('trough', -9.4, 0, -0.6, 1.9, 0.6, 0.8, T.plain, 0x7a5f38, 22, {});
    addProp('trough', 9.4, 0, 6.4, 1.9, 0.6, 0.8, T.plain, 0x7a5f38, 22, {});
    addProp('barrel', -11.2, 0, 3.6, 0.7, 1.0, 0.7, T.plain, 0x8a3a2a, 18, { metal: true });
    addProp('barrel', 11.2, 0, -1.4, 0.7, 1.0, 0.7, T.plain, 0x8a3a2a, 18, { metal: true });
    addProp('barrel', -11.2, 0, 21, 0.7, 1.0, 0.7, T.plain, 0x8a3a2a, 18, { metal: true });
    addProp('wagon', 3, 0, -26, 3.4, 2.0, 1.9, T.plain, 0x8a5a30, 80, {});
    addProp('keg', -6, 0, -18, 0.7, 0.9, 0.7, T.plain, 0x7a4f28, 20, {});
    for (const [cx2, cz2] of [[-14, 40], [-30, 24], [-26, -38], [18, -30], [34, 34], [-46, 24], [46, 26], [6, 46]]) {
      addProp('cactus', cx2, 0, cz2, 0.55, 2.0, 0.55, T.plain, 0x3f8f3f, 30, {});
    }

    // ---- THE RAILROAD (ground line, north) ----
    addProp('loco', -20, 0, 40, 7.5, 2.9, 2.6, T.container, 0x2e2e34, 320, { metal: true });
    addProp('boxcar', -9.5, 0, 40, 7, 2.7, 2.5, T.railside, 0xa0522d, 240, { metal: true });
    addProp('boxcar', 1, 0, 40, 7, 2.7, 2.5, T.railside, 0x8a4030, 240, { metal: true });
    buildPlatform(18, 36.4, 16, 4.2, 0.5, 0.5);
    for (const px2 of [11.5, 18, 24.5]) buildPost(px2, 35.2, 3.4, 0.24, 0.5);
    buildPlatform(18, 36, 14.5, 3.4, 4.0, 0.14);
    addProp('bench', 15, 0.5, 37.2, 1.7, 0.55, 0.6, T.plain, 0x8a6b42, 25, {});
    addProp('bench', 21, 0.5, 37.2, 1.7, 0.55, 0.6, T.plain, 0x8a6b42, 25, {});
    addProp('crate', 25.5, 0.5, 37, 1.0, 1.0, 1.0, T.plain, 0xb98a55, 20, {});
    addProp('sign', 18, 1.6, 34.9, 1.6, 0.9, 0.14, T.wanted, 0xffffff, 10, {});
    for (const [px3, pz3] of [[29, 36.8], [31, 36.8], [29, 38.6], [31, 38.6]]) buildPost(px3, pz3, 3.2, 0.2, 0);
    addProp('tank', 30, 3.2, 37.7, 2.0, 1.9, 2.0, T.container, 0x7a5f38, 90, { metal: true });

    // ---- MESA TOPS ----
    // west: water tower, windmill, homestead cabin
    for (const [wtx, wtz] of [[-49.2, -9.2], [-46.8, -9.2], [-49.2, -6.8], [-46.8, -6.8]]) buildPost(wtx, wtz, 2.5, 0.22, 9);
    buildPlatform(-48, -8, 3.1, 3.1, 11.5, 0.16);
    addProp('towertank', -48, 11.5, -8, 2.3, 2.2, 2.3, T.container, 0x9a6b3a, 200, { metal: true });
    WD({ ox: -47, oy: 9, oz: 1 }, 'x', 6, 4, null, 0x8f7448);
    WD({ ox: -47, oy: 9, oz: 6 }, 'x', 6, 4, null, 0x8f7448);
    WD({ ox: -47, oy: 9, oz: 1 }, 'z', 5, 4, null, 0x8f7448);
    WD({ ox: -41, oy: 9, oz: 1 }, 'z', 5, 4, (c, r) => (c >= 1 && c <= 2 && r <= 3) ? 1 : 0, 0x8f7448);
    buildPlatform(-44, 3.5, 6.6, 5.6, 11.95, 0.2);
    addProp('crate', -45.5, 9, 4.8, 1.0, 1.0, 1.0, T.plain, 0xb98a55, 20, {});
    addProp('tnt', -42.6, 9, 2.2, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    // windmill (spinning head, shootable) — fan faces the street (east)
    buildPost(-41, -12.5, 5.2, 0.3, 9);
    addProp('windmill', -41, 13.6, -12.5, 0.8, 0.8, 0.8, T.plain, 0x8a8f96, 40, { metal: true, noWalk: true });
    W._millMesh = new THREE.Group();
    const millSpin = new THREE.Group();
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.6), new THREE.MeshBasicMaterial({ map: T.plywood(), color: 0xc9b28a, side: THREE.DoubleSide }));
      blade.position.y = 1.3;
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.z = (b / 4) * Math.PI * 2;
      millSpin.add(arm);
    }
    W._millMesh.add(millSpin);
    W._millSpin = millSpin;
    W._millMesh.rotation.y = Math.PI / 2;
    W._millMesh.position.set(-40.55, 14.3, -12.5);
    grp.add(W._millMesh);
    // east: mine head-frame tower + shack + TNT shed
    for (const [hfx, hfz] of [[44.8, -3.2], [47.2, -3.2], [44.8, -0.8], [47.2, -0.8]]) buildPost(hfx, hfz, 6.4, 0.3, 9);
    buildPlatform(46, -2, 3.4, 3.4, 15.3, 0.2);
    addLadder(44.35, -2, 9, 12.2, 'w');
    addLadder(44.35, -2, 12.2, 15.3, 'w');
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 10), new THREE.MeshBasicMaterial({ map: T.gunmetal ? T.gunmetal() : T.plain(), color: 0x6a6f76 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(46, 16.2, -2);
    grp.add(wheel);
    WD({ ox: 48, oy: 9, oz: 6 }, 'x', 5, 4, null, 0x8f7448);
    WD({ ox: 48, oy: 9, oz: 10 }, 'x', 5, 4, null, 0x8f7448);
    WD({ ox: 53, oy: 9, oz: 6 }, 'z', 4, 4, null, 0x8f7448);
    WD({ ox: 48, oy: 9, oz: 6 }, 'z', 4, 4, (c, r) => (c >= 1 && c <= 2 && r <= 3) ? 1 : 0, 0x8f7448);
    buildPlatform(50.5, 8, 5.6, 4.6, 11.95, 0.2);
    addProp('tnt', 49, 9, 7.2, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('tnt', 52, 9, 8.8, 0.95, 0.95, 0.95, T.tnt, 0xffffff, 12, {});
    addProp('orecart', 43, 9, 6, 1.5, 1.1, 1.0, T.container, 0x6a5a48, 55, { metal: true });
    addProp('stone', 46.5, 9, 10, 1.4, 0.9, 1.3, T.redrock, 0xb97848, 60, {});

    // ---- flow: spawns, camp spots, hills ----
    W.spawnPoints = [
      { x: 0, z: -46 }, { x: 0, z: 47 }, { x: -50, z: 36 }, { x: 50, z: -36 },
      { x: -50, z: -30 }, { x: 50, z: 30 }, { x: -30, z: 42 }, { x: 30, z: -42 },
      { x: -60, z: 0 }, { x: 60, z: 2 }, { x: -20, z: -34 }, { x: 30, z: 22 },
      { x: -30, z: 18 }, { x: 34, z: 44 }, { x: 6, z: 28 }, { x: -8, z: -20 },
    ];
    W.campSpots.push(
      { x: -13, z: -6, yaw: -Math.PI / 2 },        // saloon balcony, watching the street
      { x: 18, z: -8, yaw: Math.PI / 2 },          // hotel roof
      { x: 14, z: 19.5, yaw: Math.PI / 2 },        // the belfry
      { x: -39.5, z: 4, yaw: -Math.PI / 2 },       // west mesa rim
      { x: 41.5, z: 0, yaw: Math.PI / 2 },         // east mesa rim
      { x: 0, z: 5, yaw: 0 },                      // mid-trestle
      { x: 18, z: 11, yaw: Math.PI / 2 },          // bank roof
      { x: -35.5, z: 0, yaw: -Math.PI / 2 },       // west tunnel mouth
      { x: 18, z: 37, yaw: Math.PI },              // rail platform
    );
    W.hillSpots = [
      { x: 0, z: 20, y: 0, r: 5.5 },     // the town well
      { x: -19, z: -6, y: 0, r: 5 },     // inside the saloon
      { x: 18, z: 37.5, y: 0.5, r: 5.5 },// the rail platform
      { x: 33, z: -8, y: 0, r: 5 },      // east mine mouth
    ];

    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#cf9a5e'; x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = '#b3763f'; x.fillRect((ox - 7.5) * s, 0, 15 * s, 116 * s);           // main street
      x.fillStyle = '#8a8178'; x.fillRect(0, (oz + 37.2) * s, 144 * s, 5.6 * s);         // rail bed
      x.fillStyle = '#4a4540'; x.fillRect(0, (oz + 39.6) * s, 144 * s, 1.0 * s);         // rails
      x.fillStyle = '#a85b30';                                                           // the mesas
      x.fillRect((ox - 58) * s, (oz - 18) * s, 24 * s, 32 * s);
      x.fillRect((ox + 36) * s, (oz - 14) * s, 22 * s, 32 * s);
      x.fillStyle = '#c9855a';                                                           // upper tiers
      x.fillRect((ox - 54) * s, (oz - 14) * s, 16 * s, 24 * s);
      x.fillRect((ox + 40) * s, (oz - 10) * s, 14 * s, 24 * s);
      x.fillStyle = '#9a6b3a'; x.fillRect((ox - 38) * s, (oz + 3.3) * s, 78 * s, 3.4 * s); // the trestle
    };
    W.mapUpdate = function (dt) {
      if (W._millMesh && W._millSpin) W._millSpin.rotation.z += dt * 1.4;
    };
    addSky(0xffab6b, { cloudTint: 0xffd9b0, sunTint: 0xffb84a, sunPos: [150, 34, -80], sunScale: 44, clouds: 5 });
  }

  // ============ MAP: THE CITADEL — a vast palace-fortress, room after room ============
  // Design: the palace IS the map. A raised stone podium carries the GRAND HALL,
  // LIBRARY and CHAPEL; carved through its indestructible foundations runs the
  // UNDERCROFT — spine tunnel, wine cellar, crypt, and a treasury behind an iron
  // gate. South of it: a cloister courtyard with a fountain, flanked by barracks
  // and kitchens. Above: galleries, mezzanines, a choir loft, connected rooftops,
  // and a bell tower crowning it all. Nearly everything breaks; the foundations,
  // column plinths, hearths and fountain never do — cover survives the siege.
  function buildCitadelMap() {
    // ================= ARCANE ACADEMY =================
    // a wizard school under a twilight sky: great hall with floating candles,
    // a library hiding a bookshelf passage, potions dungeon under the whole
    // castle, an astronomy tower, a long covered bridge, glass greenhouse,
    // owlery, and a gatehouse. Everything that isn't floor is breakable.
    W.bounds = { x: 62, z: 52 };
    W.teamSpawns = [{ x: 0, z: 46 }, { x: 0, z: -46 }];
    W._hoopRings = new Map();

    // grounds
    plane(440, 440, T.grass(), 0, -0.01, 0).material.map.repeat.set(60, 60);
    const court = plane(36, 36, T.sidewalk(), 0, 0.02, 8);
    court.material.map.repeat.set(9, 9);
    court.material.color = new THREE.Color(0xc9bda6);
    const path = plane(7, 22, T.sidewalk(), 0, 0.015, 33); // gate → courtyard
    path.material.map.repeat.set(2, 5);
    path.material.color = new THREE.Color(0xbfb49e);
    const dung = plane(80, 28, T.gravel(), 0, 0.03, -24); // dungeon flagstone
    dung.material.map.repeat.set(20, 7);
    dung.material.color = new THREE.Color(0x84796c);
    plane(6, 10, T.dirt(), 0, 0.02, -43).material.map.repeat.set(1, 2);

    // realm limits
    addCollider(-68, 0, -58, -62.4, 30, 58, { noShoot: true });
    addCollider(62.4, 0, -58, 68, 30, 58, { noShoot: true });
    addCollider(-68, 0, -58, 68, 30, -52.4, { noShoot: true });
    addCollider(-68, 0, 52.4, 68, 30, 58, { noShoot: true });

    // ---- helpers ----
    const CAS = (o, dir, cols, rows, fn, tint, hp) => {
      const wl = WallGrid({ ox: o.ox, oy: o.oy === undefined ? 0 : o.oy, oz: o.oz, dir, cols, rows, cw: 1, ch: 0.72, th: 0.36, kind: 'castle', tint: tint || 0xb8b2a6, hp: hp || 62, house: null });
      wallFill(wl, fn || (() => 0));
    };
    const stoneG = [], ironG = [], goldG = [];
    function sdeck(cx, cz, w, d, topY, thick) {
      thick = thick || 0.28;
      const g = U.shadedBoxGeo(w, thick, d);
      g.translate(cx, topY - thick / 2, cz);
      stoneG.push(g);
      addCollider(cx - w / 2, topY - thick, cz - d / 2, cx + w / 2, topY, cz + d / 2, { step: true });
      slabs.push({ minx: cx - w / 2, minz: cz - d / 2, maxx: cx + w / 2, maxz: cz + d / 2, top: topY });
    }
    function sblock(x0, y0, z0, x1, y1, z1, plain) {
      const g = U.shadedBoxGeo(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      stoneG.push(g);
      addCollider(x0, y0, z0, x1, y1, z1, plain ? {} : { step: true });
      slabs.push({ minx: x0, minz: z0, maxx: x1, maxz: z1, top: y1 });
    }
    const flameTex = T.flame();
    const flames = [];
    function flame(x, y, z, s) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false }));
      sp.position.set(x, y, z);
      sp.scale.set(s, s * 1.5, 1);
      sp.userData.s = s;
      grp.add(sp);
      flames.push(sp);
    }
    function torch(x, y, z) {
      const g = U.shadedBoxGeo(0.12, 0.45, 0.12);
      g.translate(x, y - 0.2, z);
      ironG.push(g);
      flame(x, y + 0.28, z, 0.55);
    }
    function candle(x, y, z) {
      addProp('candle', x, y, z, 0.14, 0.32, 0.14, T.plain, 0xe8e0cc, 5, { noWalk: true });
      flame(x, y + 0.5, z, 0.24);
    }
    // the hogwarts trick: candles that just... hang there. and drift.
    const floaters = [];
    const candleMat = new THREE.MeshBasicMaterial({ map: T.plain(), color: 0xf2ead2 });
    function floatCandle(x, y, z) {
      const m = new THREE.Mesh(U.shadedBoxGeo(0.15, 0.46, 0.15), candleMat);
      m.position.set(x, y, z);
      grp.add(m);
      flame(x, y + 0.44, z, 0.3);
      floaters.push({ m, f: flames[flames.length - 1], y0: y, ph: x * 1.7 + z * 0.9 });
    }
    const rail = (o, dir, cols, gapFn) => {
      const wl = WallGrid({ ...o, dir, cols, rows: 1, cw: 1, ch: 0.72, th: 0.12, kind: 'fence', tint: 0x5a4a38, hp: 12, house: null });
      wallFill(wl, gapFn || (() => 0));
    };
    const ruin = (o, dir, cols, hs, tint) => CAS(o, dir, cols, 7, (c, r) => r >= hs[c % hs.length] ? 1 : 0, tint || 0x9d978c, 50);

    // ================= THE PODIUM & POTIONS DUNGEON =================
    // one solid foundation (x -40..40, z -38..-10, top 2.9) with vaulted
    // tunnels carved through it. voids: main corridor z -26..-22 (open both
    // ends), cellar x -36..-8 z -36..-28, vault x 8..36, dais stair shaft
    // x -2.5..2.5 z -34..-26, south tunnels x ±17..21 z -22..-10
    sblock(-40, 0, -38, 40, 2.9, -36, true);
    sblock(-40, 0, -36, -36, 2.9, -28, true); sblock(-8, 0, -36, -2.5, 2.9, -28, true);
    sblock(-2.5, 0, -36, 2.5, 2.9, -34, true); sblock(2.5, 0, -36, 8, 2.9, -28, true);
    sblock(36, 0, -36, 40, 2.9, -28, true);
    sblock(-40, 0, -28, -30, 2.9, -26, true); sblock(-26, 0, -28, -14, 2.9, -26, true);
    sblock(-10, 0, -28, -2.5, 2.9, -26, true); sblock(2.5, 0, -28, 18, 2.9, -26, true);
    sblock(24, 0, -28, 40, 2.9, -26, true);
    sblock(-40, 0, -22, -21, 2.9, -10, true); sblock(-17, 0, -22, 17, 2.9, -10, true);
    sblock(21, 0, -22, 40, 2.9, -10, true);
    // podium floor (holes: dais stair hatch, library ladder hatch)
    sdeck(0, -37, 80, 2, 2.9, 0.3);
    sdeck(-37.8, -34.8, 4.4, 2.4, 2.9, 0.3);            // west of the shelf hatch
    sdeck(3.2, -34.8, 73.6, 2.4, 2.9, 0.3);             // east of it
    sdeck(-34.6, -35.8, 2.0, 0.4, 2.9, 0.3);            // hatch rim + backstop
    sdeck(-34.6, -35.25, 2.0, 0.7, 2.9, 0.3);
    sdeck(0, -33.3, 80, 0.6, 2.9, 0.3);
    sdeck(-21, -31, 38, 4, 2.9, 0.3);                   // west of dais hatch
    sdeck(21, -31, 38, 4, 2.9, 0.3);                    // east of it
    sdeck(0, -19.5, 80, 19, 2.9, 0.3);
    // library shelf-hatch ladder (the bookcase upstairs hides it)
    addLadder(-34.6, -34.9, 0, 2.9, 's');
    // dais stairs: vault corridor → up behind the head table
    buildStairs(0, -26.8, 0, -1, 3.6, 8, 0.37, 0.5, 0);
    rail({ ox: -2.05, oy: 2.9, oz: -33.2 }, 'z', 4);
    rail({ ox: 2.05, oy: 2.9, oz: -33.2 }, 'z', 4);
    rail({ ox: -2, oy: 2.9, oz: -33.15 }, 'x', 4);
    // the potion cellar (west)
    addProp('cauldron', -32, 0, -32, 1.1, 1.0, 1.1, T.gunmetal, 0x3a4438, 35, { metal: true });
    addProp('cauldron', -25, 0, -30.5, 1.1, 1.0, 1.1, T.gunmetal, 0x44383e, 35, { metal: true });
    flame(-32, 0.4, -32, 0.5); flame(-25, 0.4, -30.5, 0.5);
    addProp('shelf', -35.4, 0, -29, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('potion', -35.3, 1.9, -29, 0.3, 0.34, 0.3, T.plain, 0x59c48a, 6, { noWalk: true, glassy: true });
    addProp('potion', -30, 0, -34.8, 0.32, 0.4, 0.32, T.plain, 0xc45977, 6, { glassy: true });
    addProp('potion', -22, 0, -34.5, 0.3, 0.36, 0.3, T.plain, 0x5977c4, 6, { glassy: true });
    addProp('keg', -18, 0, -33.5, 0.7, 0.9, 0.7, T.plain, 0x7a4f28, 20, {});
    addProp('keg', -16.2, 0, -33.5, 0.7, 0.9, 0.7, T.plain, 0x7a4f28, 20, {});
    addProp('crate', -12, 0, -30, 1.0, 1.0, 1.0, T.plain, 0xb98a55, 20, {});
    addProp('crystal', -10.5, 0, -34.5, 0.8, 1.5, 0.8, T.plain, 0x7ae0d8, 50, { glassy: true });
    torch(-34, 1.9, -28.4); torch(-14, 1.9, -28.4); torch(-24, 1.9, -35.6);
    // the vault (east): iron gate, treasure, and things best left buried
    const vGate = WallGrid({ ox: 18, oy: 0, oz: -27.1, dir: 'x', cols: 6, rows: 4, cw: 1, ch: 0.72, th: 0.14, kind: 'chainlink', tint: 0xffffff, hp: 120, house: null });
    wallFill(vGate, () => 0);
    addProp('chest', 13, 0, -33.5, 1.2, 0.85, 0.9, T.plain, 0xc9a227, 45, {});
    addProp('chest', 17, 0, -31, 1.2, 0.85, 0.9, T.plain, 0xc9a227, 45, {});
    addProp('chest', 30, 0, -33.5, 1.2, 0.85, 0.9, T.plain, 0xc9a227, 45, {});
    addProp('crystal', 25, 0, -32.5, 0.9, 1.7, 0.9, T.plain, 0x9a7ae8, 50, { glassy: true });
    addProp('crystal', 33.5, 0, -30, 0.7, 1.3, 0.7, T.plain, 0x7a9ae8, 45, { glassy: true });
    addProp('knight', 20.5, 0, -34.6, 0.8, 1.9, 0.8, T.gunmetal, 0xb8bec6, 25, { metal: true });
    addProp('knight', 26.5, 0, -34.6, 0.8, 1.9, 0.8, T.gunmetal, 0xb8bec6, 25, { metal: true });
    addProp('tomb', 34.5, 0, -34.8, 1.0, 1.3, 0.32, T.cinder, 0xa8a29a, 30, { rotY: 0.1 });
    candle(10, 0, -34.8); candle(37, 0, -29);
    torch(9, 1.9, -28.4); torch(35, 1.9, -28.4);
    // corridor + tunnel mouths
    torch(-36, 1.9, -21.6); torch(-24, 1.9, -26.4); torch(-8, 1.9, -21.6);
    torch(8, 1.9, -26.4); torch(24, 1.9, -21.6); torch(36, 1.9, -26.4);
    torch(-19.4, 1.9, -14); torch(19.4, 1.9, -14);
    addProp('tomb', -30, 0, -23.5, 1.0, 1.3, 0.32, T.cinder, 0xa8a29a, 30, {});
    addProp('scroll', 30, 0, -23.2, 0.6, 0.4, 0.45, T.plain, 0xd8c9a0, 8, {});

    // ================= THE FRONT: WALKWAY, STAIRS, TERRACE =================
    // parapet along the podium's courtyard edge (gaps at every staircase)
    CAS({ ox: -40, oy: 2.9, oz: -10.2 }, 'x', 80, 1, (c) => {
      if ((c >= 26 && c <= 30) || (c >= 36 && c <= 44) || (c >= 50 && c <= 54)) return 1; // stairs
      if ((c >= 14 && c <= 21) || (c >= 58 && c <= 65)) return 1;                         // cloister arms
      return c % 2 ? 1 : 0;
    }, 0xa39d91, 22);
    buildStairs(0, -5.2, 0, -1, 7, 8, 0.37, 0.5, 0);      // grand center stairs
    sdeck(0, -9.7, 7.4, 1.6, 2.9, 0.3);
    buildStairs(-12, -5.2, 0, -1, 3.6, 8, 0.37, 0.5, 0);  // west flank
    sdeck(-12, -9.7, 3.8, 1.6, 2.9, 0.3);
    buildStairs(12, -5.2, 0, -1, 3.6, 8, 0.37, 0.5, 0);   // east flank
    sdeck(12, -9.7, 3.8, 1.6, 2.9, 0.3);
    sblock(-7.6, 0, -6.8, -5.4, 1.5, -4.6);               // wizard statue plinths
    sblock(5.4, 0, -6.8, 7.6, 1.5, -4.6);
    addProp('statue', -6.5, 1.5, -5.7, 1.5, 2.9, 1.5, T.cinder, 0xc5bfb3, 140, { noWalk: true });
    addProp('statue', 6.5, 1.5, -5.7, 1.5, 2.9, 1.5, T.cinder, 0xc5bfb3, 140, { noWalk: true });
    // north terrace behind the hall + field stairs
    sdeck(0, -39.2, 8, 2.4, 2.9, 0.3);
    buildStairs(0, -43.7, 0, 1, 3, 8, 0.37, 0.5, 0);
    buildStairs(-26, -41.7, 0, 1, 3, 8, 0.37, 0.5, 0);
    buildStairs(26, -41.7, 0, 1, 3, 8, 0.37, 0.5, 0);
    CAS({ ox: -40, oy: 2.9, oz: -38.4 }, 'x', 26, 1, (c) => (c % 2 || (c >= 12 && c <= 16)) ? 1 : 0, 0xa39d91, 22);
    CAS({ ox: 14, oy: 2.9, oz: -38.4 }, 'x', 18, 1, (c) => (c % 2 || (c >= 10 && c <= 14)) ? 1 : 0, 0xa39d91, 22);

    // ================= THE GREAT HALL =================
    const HALL_T = 0xbeb8ac;
    CAS({ ox: -14, oy: 2.9, oz: -38 }, 'x', 28, 13, (c, r) => {
      if (c >= 12 && c <= 15 && r <= 3) return 1;                    // postern → terrace
      if (r >= 5 && r <= 11 && Math.abs(c - 13.5) + Math.abs(r - 8) * 1.15 < 5) return 1; // rose void
      return 0;
    }, HALL_T);
    CAS({ ox: -14, oy: 2.9, oz: -12 }, 'x', 28, 13, (c, r) => {
      if (c >= 11 && c <= 16 && r <= 5) return 1;                    // grand doors
      if ((c === 4 || c === 5 || c === 22 || c === 23) && r >= 7 && r <= 9) return 3;
      return 0;
    }, HALL_T);
    CAS({ ox: -14, oy: 2.9, oz: -38 }, 'z', 26, 13, (c, r) => {
      if (c >= 3 && c <= 5 && r <= 4) return 1;                      // library door
      if (c >= 8 && c <= 9 && r >= 5 && r <= 7) return 1;            // gallery door
      if (c >= 17 && c <= 19 && r <= 3) return 1;                    // the cold hearth passage
      return r >= 8 && r <= 10 && c % 4 === 1 ? 3 : 0;
    }, HALL_T);
    CAS({ ox: 14, oy: 2.9, oz: -38 }, 'z', 26, 13, (c, r) => {
      if (c >= 3 && c <= 5 && r <= 4) return 1;                      // alchemy door
      if (c >= 8 && c <= 9 && r >= 5 && r <= 7) return 1;            // gallery door
      return r >= 8 && r <= 10 && c % 4 === 1 ? 3 : 0;
    }, HALL_T);
    addProp('pane', 0, 6.1, -38, 8.6, 5.6, 0.2, T.stainedRose, 0xffffff, 60, { noWalk: true, glassy: true });
    plane(27.4, 25.6, T.marble(), 0, 2.96, -25).material.map.repeat.set(9, 8);
    const rug = plane(2.2, 16, T.rug(), 0, 3.0, -22);
    rug.material.map.repeat.set(1, 4);
    // the cold hearth: stone cheeks + mantel dress the secret passage
    sblock(-13.8, 2.9, -21.5, -13.1, 5.2, -20.9, true);
    sblock(-13.8, 2.9, -18.1, -13.1, 5.2, -17.5, true);
    sblock(-13.8, 5.1, -21.5, -13.1, 5.75, -17.5, true);
    // dais + head table
    sblock(-6, 2.9, -37.6, 6, 3.65, -34.4);
    sblock(-4, 2.9, -34.4, 4, 3.27, -33.8);
    addProp('feast', 0, 3.65, -36.1, 6.4, 0.95, 1.3, T.floorWood, 0x7a5230, 60, {});
    addProp('throne', 0, 3.65, -37.3, 1.5, 2.3, 1.1, T.plain, 0xd8b23a, 120, {});
    addProp('knight', -4.4, 3.65, -36.6, 0.8, 1.9, 0.8, T.gunmetal, 0xb8bec6, 25, { metal: true });
    addProp('knight', 4.4, 3.65, -36.6, 0.8, 1.9, 0.8, T.gunmetal, 0xb8bec6, 25, { metal: true });
    addProp('harp', -5.4, 3.65, -35, 1.0, 1.6, 0.5, T.plain, 0xd4af37, 40, {});
    candle(-2.6, 4.6, -36.1); candle(2.6, 4.6, -36.1);
    // four house tables, four house banners
    for (const tx of [-6.5, -2.2, 2.2, 6.5])
      addProp('feast', tx, 2.9, -24, 1.4, 0.95, 9, T.floorWood, 0x7a5230, 60, {});
    addProp('banner', -9.5, 6.4, -37.7, 2.2, 3.4, 0.14, () => T.tapestry('#2c5a2c'), 0xffffff, 20, { noWalk: true });
    addProp('banner', 9.5, 6.4, -37.7, 2.2, 3.4, 0.14, () => T.tapestry('#7a1f1f'), 0xffffff, 20, { noWalk: true });
    addProp('banner', -13.6, 6.4, -25, 0.14, 3.4, 2.2, () => T.tapestry('#1f2e6a'), 0xffffff, 20, { noWalk: true });
    addProp('banner', 13.6, 6.4, -25, 0.14, 3.4, 2.2, () => T.tapestry('#8a6a1f'), 0xffffff, 20, { noWalk: true });
    // colonnades: eternal plinths, breakable marble shafts
    for (const pz of [-32, -27, -22, -17]) {
      for (const px of [-8.5, 8.5]) {
        sblock(px - 0.85, 2.9, pz - 0.85, px + 0.85, 4.05, pz + 0.85);
        addProp('pillar', px, 4.05, pz, 1.15, 7.2, 1.15, T.marble, 0xd6d0c2, 160, {});
      }
    }
    // the floating candles
    for (const tx of [-6.5, -2.2, 2.2, 6.5])
      for (const cz of [-28, -24, -20])
        floatCandle(tx, 7.4 + ((tx * 3 + cz) % 3) * 0.35, cz);
    floatCandle(0, 8.3, -31); floatCandle(0, 8.0, -16);
    for (const tz of [-16, -22, -28, -34]) { torch(-13.5, 5.4, tz); torch(13.5, 5.4, tz); }
    // galleries (6.5): west run + stairs, east full run + south balcony
    sdeck(-12.6, -27.6, 2.8, 16.8, 6.5);
    buildStairs(-12.6, -14.4, 0, -1, 2.6, 10, 0.36, 0.5, 2.9);
    sdeck(12.6, -25, 2.8, 22, 6.5);
    sdeck(0, -13.4, 23.6, 2.4, 6.5);
    rail({ ox: -11.35, oy: 6.5, oz: -36 }, 'z', 17);
    rail({ ox: 11.35, oy: 6.5, oz: -36 }, 'z', 21);
    rail({ ox: -11.8, oy: 6.5, oz: -14.55 }, 'x', 22);
    // hall roof (12.26) + ladder from the east gallery
    sdeck(-0.55, -25, 26.9, 26, 12.26, 0.32);                        // x -14..12.9
    sdeck(13.45, -28.7, 1.1, 18.6, 12.26, 0.32);                     // east strip, north of hatch
    sdeck(13.45, -14.3, 1.1, 4.6, 12.26, 0.32);                      // south of hatch
    addLadder(13.5, -17.5, 6.5, 12.26, 'w');
    const hpar = (o, dir, cols, gapFn) => CAS({ ...o, oy: 12.26 }, dir, cols, 1, gapFn || ((c) => c % 2 ? 1 : 0), 0xa8a296, 24);
    hpar({ ox: -14, oz: -38 }, 'x', 28);
    hpar({ ox: -14, oz: -12 }, 'x', 28);
    hpar({ ox: -14, oz: -38 }, 'z', 26);
    hpar({ ox: 14, oz: -38 }, 'z', 26, (c) => (c % 2 || (c >= 19 && c <= 22)) ? 1 : 0);
    addProp('gargoyle', -13.4, 12.26, -37.4, 0.7, 0.95, 0.7, T.cinder, 0x9a948a, 35, { noWalk: true });
    addProp('gargoyle', 13.4, 12.26, -37.4, 0.7, 0.95, 0.7, T.cinder, 0x9a948a, 35, { noWalk: true });
    addProp('gargoyle', -13.4, 12.26, -12.6, 0.7, 0.95, 0.7, T.cinder, 0x9a948a, 35, { noWalk: true });

    // ================= THE LIBRARY (west wing) =================
    const LIB_T = 0xb2ab9c;
    CAS({ ox: -40, oy: 2.9, oz: -38 }, 'x', 26, 9, (c, r) => (r === 4 || r === 5) && c % 5 === 2 ? 3 : 0, LIB_T);
    CAS({ ox: -40, oy: 2.9, oz: -12 }, 'x', 26, 9, (c, r) => {
      if (c >= 12 && c <= 14 && r <= 3) return 1;                    // door to the walkway
      return (r === 4 || r === 5) && c % 5 === 2 ? 3 : 0;
    }, LIB_T);
    CAS({ ox: -40, oy: 2.9, oz: -38 }, 'z', 26, 9, (c, r) => ((r === 4 || r === 5) && c % 3 === 1 ? 3 : 0), LIB_T);
    // shelf labyrinth (three rows, offset cut-throughs)
    const SHELF = (ox, oz, cols, gapC) => {
      const wl = WallGrid({ ox, oy: 2.9, oz, dir: 'x', cols, rows: 4, cw: 1, ch: 0.72, th: 0.5, kind: 'book', tint: 0xffffff, hp: 30, house: null });
      wallFill(wl, (c) => (c === gapC || c === gapC + 1) ? 1 : 0);
    };
    SHELF(-38, -31, 17, 12);
    SHELF(-38, -27, 17, 4);
    SHELF(-38, -23, 17, 9);
    // the secret bookcase: four shelf sections boxing the dungeon hatch.
    // shoot the books, find the ladder. tell no one.
    const SECRET = (ox, oz, dir) => {
      const wl = WallGrid({ ox, oy: 2.9, oz, dir, cols: 2, rows: 4, cw: 1, ch: 0.72, th: 0.4, kind: 'book', tint: 0xffffff, hp: 30, house: null });
      wallFill(wl, () => 0);
    };
    SECRET(-35.6, -33.5, 'x'); SECRET(-35.6, -35.7, 'x');
    SECRET(-33.5, -35.6, 'z'); SECRET(-35.7, -35.6, 'z');
    // restricted section (SW corner, iron cage)
    const CAGE = (o, dir, cols, fn) => {
      const wl = WallGrid({ ox: o.ox, oy: 2.9, oz: o.oz, dir, cols, rows: 5, cw: 1, ch: 0.72, th: 0.12, kind: 'chainlink', tint: 0xffffff, hp: 90, house: null });
      wallFill(wl, fn || (() => 0));
    };
    CAGE({ ox: -40, oz: -18 }, 'x', 10, (c, r) => (c >= 4 && c <= 5 && r <= 3) ? 1 : 0);
    CAGE({ ox: -30, oz: -18 }, 'z', 6);
    addProp('mirror', -38.6, 2.9, -13.1, 1.5, 2.3, 0.16, T.glassTex, 0xbfd4e0, 30, { glassy: true });
    addProp('crystal', -33, 2.9, -14, 0.7, 1.3, 0.7, T.plain, 0xe87ab8, 45, { glassy: true });
    addProp('books', -36.5, 2.9, -16.5, 0.6, 0.42, 0.5, T.plain, 0x3f2a5a, 8, {});
    addProp('scroll', -32.5, 2.9, -16.8, 0.6, 0.4, 0.45, T.plain, 0xd8c9a0, 8, {});
    candle(-35, 2.9, -13.5);
    // reading tables (east half)
    addProp('feast', -17.8, 2.9, -29, 1.3, 0.95, 4.6, T.floorWood, 0x5a3f26, 55, {});
    addProp('feast', -17.8, 2.9, -18.5, 1.3, 0.95, 4.6, T.floorWood, 0x5a3f26, 55, {});
    addProp('lectern', -16.2, 2.9, -24, 0.55, 1.25, 0.55, T.plain, 0x6a4a28, 18, {});
    addProp('books', -17.8, 3.85, -28, 0.55, 0.35, 0.42, T.plain, 0x8f3a2e, 8, { noWalk: true });
    addProp('books', -17.8, 3.85, -19.6, 0.55, 0.35, 0.42, T.plain, 0x2e5a8f, 8, { noWalk: true });
    candle(-17.8, 3.85, -26.6); candle(-17.8, 3.85, -17.4);
    addProp('globe', -16.5, 2.9, -33.5, 0.85, 1.15, 0.85, T.plain, 0x6a4a28, 40, {});
    W._globeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshBasicMaterial({ map: T.plain(), color: 0xc9b28a }));
    W._globeMesh.position.set(-16.5, 4.55, -33.5);
    grp.add(W._globeMesh);
    addProp('chandelier', -27, 7.4, -25, 1.8, 0.55, 1.8, T.plain, 0x3a3126, 40, { noWalk: true });
    flame(-27, 8.2, -25, 0.5);
    torch(-39.6, 5.2, -30); torch(-39.6, 5.2, -16); torch(-26, 5.2, -37.6);
    // mezzanine ring: west leg + stairs, north leg, east stub to the hall door
    sdeck(-38.6, -27.6, 2.8, 16.8, 6.5);
    buildStairs(-38.6, -14.4, 0, -1, 2.6, 10, 0.36, 0.5, 2.9);
    sdeck(-26.8, -36.6, 20.8, 2.8, 6.5);
    sdeck(-15.4, -31.4, 2.8, 8.4, 6.5);
    rail({ ox: -37.35, oy: 6.5, oz: -35.2 }, 'z', 16);
    rail({ ox: -37.2, oy: 6.5, oz: -35.25 }, 'x', 19);
    rail({ ox: -16.65, oy: 6.5, oz: -35.2 }, 'z', 8);
    addProp('books', -38.8, 7.4, -31, 0.55, 0.35, 0.42, T.plain, 0xb08a2e, 8, { noWalk: true });
    // roof (9.38) + hatch ladder from the north mezzanine
    sdeck(-30.2, -25, 19.6, 26, 9.38, 0.3);                          // x -40..-20.4
    sdeck(-16.4, -25, 4.8, 26, 9.38, 0.3);                           // x -18.8..-14
    sdeck(-19.6, -37.45, 1.6, 1.1, 9.38, 0.3);                       // hatch backstop
    sdeck(-19.6, -23.95, 1.6, 23.9, 9.38, 0.3);
    addLadder(-19.6, -36.6, 6.5, 9.38, 's');
    const lpar = (o, dir, cols) => CAS({ ...o, oy: 9.38 }, dir, cols, 1, (c) => c % 2 ? 1 : 0, 0xa39d91, 22);
    lpar({ ox: -40, oz: -38 }, 'x', 26);
    lpar({ ox: -40, oz: -12 }, 'x', 26);
    lpar({ ox: -40, oz: -38 }, 'z', 26);
    addProp('gargoyle', -39.4, 9.38, -37.4, 0.7, 0.95, 0.7, T.cinder, 0x9a948a, 35, { noWalk: true });
    addProp('gargoyle', -39.4, 9.38, -12.6, 0.7, 0.95, 0.7, T.cinder, 0x9a948a, 35, { noWalk: true });

    // ================= ALCHEMY WING (east) + ASTRONOMY TOWER =================
    const ALC_T = 0xbcb4a4;
    CAS({ ox: 14, oy: 2.9, oz: -38 }, 'x', 18, 9, (c, r) => (r === 4 || r === 5) && c % 4 === 2 ? 3 : 0, ALC_T);
    CAS({ ox: 14, oy: 2.9, oz: -12 }, 'x', 26, 9, (c, r) => {
      if (c >= 5 && c <= 7 && r <= 3) return 1;                      // door to the walkway
      if (c >= 16 && c <= 17 && r <= 2) return 1;                    // the portrait hole
      return (r === 4 || r === 5) && c % 5 === 1 ? 3 : 0;
    }, ALC_T);
    CAS({ ox: 40, oy: 2.9, oz: -32 }, 'z', 20, 9, (c, r) => ((r === 4 || r === 5) && c % 4 === 2 ? 3 : 0), ALC_T);
    // a portrait guards the hidden door. it will complain.
    addProp('portrait', 31, 2.9, -11.7, 2.3, 2.3, 0.2, T.painting, 0xffffff, 20, {});
    // brewing floor
    addProp('desk', 24, 2.9, -26, 3.2, 1.05, 1.0, T.floorWood, 0x8a5a32, 50, {});
    addProp('desk', 24, 2.9, -19, 3.2, 1.05, 1.0, T.floorWood, 0x8a5a32, 50, {});
    addProp('cauldron', 20, 2.9, -31, 1.1, 1.0, 1.1, T.gunmetal, 0x3a4438, 35, { metal: true });
    addProp('cauldron', 29, 2.9, -23, 1.0, 0.9, 1.0, T.gunmetal, 0x44383e, 35, { metal: true });
    flame(20, 3.3, -31, 0.5); flame(29, 3.3, -23, 0.45);
    addProp('shelf', 16.6, 2.9, -34, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('potion', 16.7, 4.8, -34, 0.3, 0.34, 0.3, T.plain, 0x59c48a, 6, { noWalk: true, glassy: true });
    addProp('potion', 24, 3.95, -26.4, 0.3, 0.36, 0.3, T.plain, 0xc45977, 6, { noWalk: true, glassy: true });
    addProp('potion', 24, 3.95, -18.6, 0.3, 0.36, 0.3, T.plain, 0x77c459, 6, { noWalk: true, glassy: true });
    addProp('sign', 15.2, 2.9, -22, 0.18, 2.0, 2.8, T.plain, 0x2e3f34, 20, { noWalk: true }); // the blackboard
    addProp('portrait', 27, 6.2, -37.7, 2.0, 2.4, 0.14, T.painting, 0xffffff, 20, { noWalk: true });
    addProp('chandelier', 26, 7.4, -22, 1.8, 0.55, 1.8, T.plain, 0x3a3126, 40, { noWalk: true });
    flame(26, 8.2, -22, 0.5);
    candle(24, 3.95, -25.4); candle(24, 3.95, -19.6);
    torch(14.4, 5.2, -30); torch(14.4, 5.2, -16); torch(39.6, 5.2, -22);
    // mezzanine along the east wall + stairs
    sdeck(38.6, -24.7, 2.8, 14.6, 6.5);
    buildStairs(38.6, -12.7, 0, -1, 2.6, 10, 0.36, 0.5, 2.9);
    rail({ ox: 37.35, oy: 6.5, oz: -32 }, 'z', 15);
    // wing roof (9.38) + mezzanine ladder hatch by the east wall
    sdeck(23, -25, 18, 26, 9.38, 0.3);                               // x 14..32
    sdeck(35.35, -22, 6.7, 20, 9.38, 0.3);                           // x 32..38.7
    sdeck(39.28, -26.5, 1.15, 11, 9.38, 0.3);                        // strip north of hatch
    sdeck(39.28, -15.7, 1.15, 7.4, 9.38, 0.3);                       // south of hatch
    addLadder(39.4, -20.2, 6.5, 9.38, 'w');
    lpar({ ox: 14, oz: -38 }, 'x', 18);
    lpar({ ox: 14, oz: -12 }, 'x', 26);
    lpar({ ox: 40, oz: -32 }, 'z', 20);
    addProp('gargoyle', 39.4, 9.38, -12.6, 0.7, 0.95, 0.7, T.cinder, 0x9a948a, 35, { noWalk: true });
    // the astronomy tower (crown of the map, 17.5 deck)
    const TOW_T = 0xb2ab9e;
    CAS({ ox: 32, oy: 2.9, oz: -40 }, 'x', 8, 22, (c, r) => ((r >= 20 && r <= 21 && c >= 2 && c <= 5) || (r === 21 && c % 2 === 0)) ? 1 : ((r === 9 || r === 10) && (c === 2 || c === 5) ? 3 : 0), TOW_T, 58);
    CAS({ ox: 32, oy: 2.9, oz: -32 }, 'x', 8, 22, (c, r) => {
      if (c >= 3 && c <= 4 && r <= 4) return 1;                      // ground door (from the wing)
      if (c >= 3 && c <= 4 && r >= 5 && r <= 8) return 1;            // mezzanine door
      return ((r >= 20 && r <= 21 && c >= 2 && c <= 5) || (r === 21 && c % 2 === 0)) ? 1 : 0;
    }, TOW_T, 58);
    CAS({ ox: 32, oy: 2.9, oz: -40 }, 'z', 8, 22, (c, r) => ((r >= 20 && r <= 21 && c >= 2 && c <= 5) || (r === 21 && c % 2 === 0)) ? 1 : 0, TOW_T, 58);
    CAS({ ox: 40, oy: 2.9, oz: -40 }, 'z', 8, 22, (c, r) => ((r >= 20 && r <= 21 && c >= 2 && c <= 5) || (r === 21 && c % 2 === 0)) ? 1 : ((r === 13 || r === 14) && (c === 3 || c === 4) ? 3 : 0), TOW_T, 58);
    addLadder(32.9, -36, 2.9, 8.1, 'e');
    addLadder(32.9, -36, 8.1, 13.2, 'e');
    addLadder(32.9, -36, 13.2, 17.5, 'e');
    sdeck(36.57, -36, 6.14, 7.28, 8.1, 0.22);
    sdeck(36.57, -36, 6.14, 7.28, 13.2, 0.22);
    sdeck(36.57, -36, 6.14, 7.28, 17.5, 0.22);
    addProp('orrery', 36.5, 17.5, -36, 1.2, 1.1, 1.2, T.plain, 0xb89a55, 80, { metal: true });
    addProp('telescope', 38.8, 17.5, -33.8, 0.45, 1.6, 0.45, T.plain, 0xa08a50, 40, { metal: true });
    // the orrery's brass planets, circling until someone shoots them down
    const orr = new THREE.Group();
    const orrArms = [];
    for (const [len, rad, col, sp] of [[1.35, 0.2, 0xc9662a, 0.7], [1.05, 0.26, 0x4a7ac9, -1.1], [0.7, 0.15, 0xc9b84a, 1.7]]) {
      const arm = new THREE.Group();
      const rod = new THREE.Mesh(U.shadedBoxGeo(len, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x9a8a5a }));
      rod.position.x = len / 2;
      arm.add(rod);
      const pl = new THREE.Mesh(new THREE.SphereGeometry(rad, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
      pl.position.x = len;
      arm.add(pl);
      arm.rotation.y = len * 2.1;
      orr.add(arm);
      orrArms.push({ arm, sp });
    }
    orr.position.set(36.5, 18.9, -36);
    grp.add(orr);
    W._orrerySpin = orr;
    candle(34.5, 17.5, -38.5);
    torch(38.5, 5.2, -32.4);

    // ================= CLOISTER ARMS + THE COVERED BRIDGE =================
    const ARM_T = 0xaaa294;
    const arcade = (c, r) => (r <= 3 && c % 5 >= 1 && c % 5 <= 3) ? 1 : ((r === 5 || r === 6) && c % 5 === 2 ? 3 : 0);
    // west arm
    CAS({ ox: -26, oz: -10 }, 'z', 36, 8, (c, r) => ((r === 3 || r === 4) && c % 4 === 2 ? 3 : 0), ARM_T);
    CAS({ ox: -18, oz: -10 }, 'z', 36, 8, arcade, ARM_T);
    CAS({ ox: -26, oz: 26 }, 'x', 8, 8, (c, r) => (c >= 3 && c <= 4 && r <= 3) ? 1 : 0, ARM_T);
    buildStairs(-22, -4.4, 0, -1, 3.4, 8, 0.37, 0.5, 0);             // up to the walkway
    sdeck(-22, -9.4, 3.6, 2, 2.9, 0.3);
    sdeck(-22, 8, 8.4, 36.4, 5.76, 0.3);                             // arm roof
    addLadder(-17.55, 16, 0, 5.76, 'e');
    const apar = (o, dir, cols, gapFn) => CAS({ ...o, oy: 5.76 }, dir, cols, 1, gapFn || ((c) => c % 2 ? 1 : 0), 0x9d968a, 20);
    apar({ ox: -26, oz: -10 }, 'z', 36);
    apar({ ox: -18, oz: -10 }, 'z', 36, (c) => (c % 2 || (c >= 16 && c <= 19) || (c >= 25 && c <= 27)) ? 1 : 0); // bridge + ladder gaps
    addProp('statue', -22, 0, 2, 1.1, 2.4, 1.1, T.cinder, 0xb5afa3, 90, { noWalk: true });
    addProp('bench', -24.4, 0, 12, 0.6, 0.55, 1.7, T.plain, 0x6a4a28, 25, {});
    addProp('crate', -20, 0, 22, 0.9, 0.9, 0.9, T.plain, 0xb98a55, 18, {});
    torch(-25.6, 2.6, 0); torch(-25.6, 2.6, 16);
    // east arm
    CAS({ ox: 26, oz: -10 }, 'z', 36, 8, (c, r) => ((r === 3 || r === 4) && c % 4 === 2 ? 3 : 0), ARM_T);
    CAS({ ox: 18, oz: -10 }, 'z', 36, 8, arcade, ARM_T);
    CAS({ ox: 18, oz: 26 }, 'x', 8, 8, (c, r) => (c >= 3 && c <= 4 && r <= 3) ? 1 : 0, ARM_T);
    buildStairs(22, -4.4, 0, -1, 3.4, 8, 0.37, 0.5, 0);
    sdeck(22, -9.4, 3.6, 2, 2.9, 0.3);
    sdeck(22, 8, 8.4, 36.4, 5.76, 0.3);
    addLadder(17.55, 16, 0, 5.76, 'w');
    apar({ ox: 26, oz: -10 }, 'z', 36);
    apar({ ox: 18, oz: -10 }, 'z', 36, (c) => (c % 2 || (c >= 16 && c <= 19) || (c >= 25 && c <= 27)) ? 1 : 0);
    addProp('statue', 22, 0, 14, 1.1, 2.4, 1.1, T.cinder, 0xb5afa3, 90, { noWalk: true });
    addProp('bench', 24.4, 0, 4, 0.6, 0.55, 1.7, T.plain, 0x6a4a28, 25, {});
    addProp('broom', 25.3, 0, 24, 0.3, 1.7, 0.3, T.plain, 0x8a5a30, 12, { noWalk: true });
    torch(25.6, 2.6, 8); torch(25.6, 2.6, 22);
    // the covered bridge (5.76): wooden walls, thatch roof, stone piers
    sdeck(0, 8, 36, 3.2, 5.76, 0.25);
    for (const px of [-9, 0, 9]) sblock(px - 0.7, 0, 7.2, px + 0.7, 5.51, 8.8, true);
    for (const bz of [6.4, 9.6]) {
      const bw = WallGrid({ ox: -18, oy: 5.76, oz: bz, dir: 'x', cols: 36, rows: 3, cw: 1, ch: 0.72, th: 0.15, kind: 'wood', tint: 0x6a4c30, hp: 24, house: null });
      wallFill(bw, (c, r) => (r >= 1 && (c % 4 === 1 || c % 4 === 2)) ? 1 : 0);
    }
    const broof = Sheet('thatch', 0xb89858);
    const bAng = Math.atan2(0.98, 1.95);
    for (let sgn = -1; sgn <= 1; sgn += 2)
      for (let c = 0; c < 38; c++)
        for (let j = 0; j < 2; j++) {
          const t = (j + 0.5) / 2;
          sheetAdd(broof, -18.5 + c, 8.9 - t * 0.98 - 0.05, 8 + sgn * t * 1.95, sgn * bAng, 'x', 1.03, 0.13, 1.16, 26);
        }

    // ================= THE COURTYARD =================
    // fountain (indestructible; the splashing never stops)
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.95, 0.9, 12), new THREE.MeshBasicMaterial({ map: T.cinder(), color: 0xc5bfb0 }));
    basin.position.set(0, 0.45, 1.5);
    grp.add(basin);
    addCollider(-2.6, 0, -1.1, 2.6, 0.9, 4.1, {});
    slabs.push({ minx: -2.6, minz: -1.1, maxx: 2.6, maxz: 4.1, top: 0.9 });
    plane(4.6, 4.6, T.water(), 0, 0.78, 1.5).material.map.repeat.set(1, 1);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.3, 8), new THREE.MeshBasicMaterial({ map: T.cinder(), color: 0xb5afa0 }));
    spire.position.set(0, 1.9, 1.5);
    grp.add(spire);
    addCollider(-0.4, 0.9, 1.1, 0.4, 3.05, 1.9, { tree: true });
    // the old oak (took root before the founders were born)
    buildPost(0, 18, 4.8, 1.3, 0);
    buildPost(-1.1, 17.4, 3.4, 0.7, 0);
    buildPost(1.2, 18.7, 3.8, 0.7, 0);
    for (const [ox2, oy2, oz2, s2] of [[0, 5.6, 18, 7.5], [-2.4, 4.8, 16.6, 4.5], [2.6, 5.2, 19.2, 4.2], [0.4, 7.4, 18.4, 4.8]]) {
      const g = U.shadedBoxGeo(s2, s2 * 0.62, s2);
      g.translate(ox2, oy2, oz2);
      treeCanopyGeos.push(g);
    }
    addProp('bench', -3.4, 0, 15.4, 1.7, 0.55, 0.6, T.plain, 0x6a4a28, 25, {});
    addProp('bench', 3.4, 0, 20.6, 1.7, 0.55, 0.6, T.plain, 0x6a4a28, 25, {});
    // market stalls + braziers
    addProp('stall', -11, 0, -4, 2.6, 1.9, 1.6, T.plywood, 0x8f3a2e, 40, {});
    addProp('stall', 11, 0, 16, 2.6, 1.9, 1.6, T.plywood, 0x2e5a8f, 40, {});
    addProp('brazier', -6, 0, 10, 0.8, 1.1, 0.8, T.gunmetal, 0x4a4640, 30, { metal: true });
    addProp('brazier', 6, 0, 10, 0.8, 1.1, 0.8, T.gunmetal, 0x4a4640, 30, { metal: true });
    flame(-6, 1.5, 10, 0.6); flame(6, 1.5, 10, 0.6);
    addProp('broom', -13.2, 0, 2, 0.3, 1.7, 0.3, T.plain, 0x8a5a30, 12, { noWalk: true });

    // ================= THE OWLERY (southwest tower) =================
    const OWL_T = 0xa8a094;
    CAS({ ox: -26, oz: 26 }, 'z', 8, 12, (c, r) => (r >= 8 && r <= 10 && c % 3 === 1) ? 1 : 0, OWL_T);
    CAS({ ox: -18, oz: 26 }, 'z', 8, 12, (c, r) => (r >= 8 && r <= 10 && c % 3 === 1) ? 1 : 0, OWL_T);
    CAS({ ox: -26, oz: 34 }, 'x', 8, 12, (c, r) => (r >= 8 && r <= 10 && c % 3 === 1) ? 1 : 0, OWL_T);
    CAS({ ox: -26, oy: 5.76, oz: 26 }, 'x', 8, 4, null, OWL_T);      // above the arm door
    plane(7.4, 7.4, T.gravel(), -22, 0.04, 30).material.map.repeat.set(2, 2);
    buildPost(-24, 28.4, 3.4, 0.22, 0);
    buildPost(-20.2, 29.2, 4.6, 0.22, 0);
    buildPost(-21.6, 32.4, 2.6, 0.22, 0);
    addProp('owl', -24, 3.4, 28.4, 0.38, 0.5, 0.38, T.plain, 0xd8d0c8, 10, { noWalk: true });
    addProp('owl', -20.2, 4.6, 29.2, 0.38, 0.5, 0.38, T.plain, 0xb8a888, 10, { noWalk: true });
    addProp('owl', -21.6, 2.6, 32.4, 0.38, 0.5, 0.38, T.plain, 0xe8e2d8, 10, { noWalk: true });
    addProp('scroll', -23.5, 0, 32.5, 0.6, 0.4, 0.45, T.plain, 0xd8c9a0, 8, {});
    addLadder(-25.1, 30, 0, 8.64, 'e');
    sdeck(-21.28, 30, 5.85, 7.3, 8.64, 0.25);
    sdeck(-24.92, 27.55, 1.44, 2.5, 8.64, 0.25);
    sdeck(-24.92, 32.45, 1.44, 2.5, 8.64, 0.25);
    const opar = (o, dir, cols) => CAS({ ...o, oy: 8.64 }, dir, cols, 1, (c) => c % 2 ? 1 : 0, 0x9d968a, 20);
    opar({ ox: -26, oz: 26 }, 'x', 8);
    opar({ ox: -26, oz: 34 }, 'x', 8);
    opar({ ox: -26, oz: 26 }, 'z', 8);
    opar({ ox: -18, oz: 26 }, 'z', 8);

    // ================= THE GREENHOUSE (glass, gloriously fragile) =================
    const GH = (o, dir, cols, fn) => {
      const wl = WallGrid({ ox: o.ox, oy: 0, oz: o.oz, dir, cols, rows: 5, cw: 1, ch: 0.72, th: 0.2, kind: 'castle', tint: 0x9aa89a, hp: 48, house: null });
      wallFill(wl, fn || ((c, r) => r === 0 ? 0 : 3));
    };
    GH({ ox: 30, oz: 14 }, 'x', 14);
    GH({ ox: 30, oz: 26 }, 'x', 14);
    GH({ ox: 30, oz: 14 }, 'z', 12, (c, r) => (c >= 4 && c <= 6 && r <= 3) ? 1 : (r === 0 ? 0 : 3));
    GH({ ox: 44, oz: 14 }, 'z', 12);
    const ghRoof = Sheet('glass', 0xeafcff);
    const gAng = Math.atan2(1.3, 6.4);
    for (let sgn = -1; sgn <= 1; sgn += 2)
      for (let c = 0; c < 15; c++)
        for (let j = 0; j < 6; j++) {
          const t = (j + 0.5) / 6;
          sheetAdd(ghRoof, 30 + c - 0.5 + 0.5, 4.9 - t * 1.3, 20 + sgn * t * 6.4, sgn * gAng, 'x', 1.03, 0.1, 1.15, 22);
        }
    plane(3, 11.6, T.dirt(), 37, 0.04, 20).material.map.repeat.set(1, 3);
    addProp('planter', 33, 0, 17, 2.8, 0.8, 1.2, T.plywood, 0x6a4c30, 25, {});
    addProp('planter', 33, 0, 23, 2.8, 0.8, 1.2, T.plywood, 0x6a4c30, 25, {});
    addProp('planter', 41, 0, 17, 2.8, 0.8, 1.2, T.plywood, 0x6a4c30, 25, {});
    addProp('planter', 41, 0, 23, 2.8, 0.8, 1.2, T.plywood, 0x6a4c30, 25, {});
    addProp('pumpkin', 33.5, 0.8, 17, 0.7, 0.55, 0.7, T.plain, 0xe07818, 12, { noWalk: true });
    addProp('pumpkin', 40.6, 0.8, 23.4, 0.6, 0.5, 0.6, T.plain, 0xd8880f, 12, { noWalk: true });
    addProp('pumpkin', 37, 0, 25, 1.1, 0.9, 1.1, T.plain, 0xe07818, 18, {});
    addProp('jar', 31.2, 0, 25, 0.6, 0.9, 0.6, T.plain, 0x8a9a6a, 20, {});
    addProp('trough', 42.5, 0, 15.2, 1.8, 0.6, 0.8, T.plywood, 0x7a5a38, 20, {});
    addProp('cauldron', 42.6, 0, 24.6, 0.9, 0.85, 0.9, T.gunmetal, 0x3a4438, 30, { metal: true });

    // ================= GATEHOUSE + CURTAIN RUINS (south) =================
    const GATE_T = 0xa8a296;
    for (const gx of [-12, 6]) {
      CAS({ ox: gx, oz: 36 }, 'x', 6, 10, (c, r) => (c >= 2 && c <= 3 && r <= 3) ? 1 : ((r === 5 || r === 6) && c % 3 === 1 ? 3 : 0), GATE_T);
      CAS({ ox: gx, oz: 42 }, 'x', 6, 10, null, GATE_T);
      CAS({ ox: gx, oz: 36 }, 'z', 6, 10, null, GATE_T);
      CAS({ ox: gx + 6, oz: 36 }, 'z', 6, 10, null, GATE_T);
    }
    addLadder(-6.75, 39, 0, 7.2, 'w');
    sdeck(-9.5, 39, 4.3, 5.2, 7.2, 0.25);
    sdeck(-6.85, 36.9, 1.0, 1.4, 7.2, 0.25);
    sdeck(-6.85, 41.1, 1.0, 1.4, 7.2, 0.25);
    addLadder(6.75, 39, 0, 7.2, 'e');
    sdeck(9.5, 39, 4.3, 5.2, 7.2, 0.25);
    sdeck(6.85, 36.9, 1.0, 1.4, 7.2, 0.25);
    sdeck(6.85, 41.1, 1.0, 1.4, 7.2, 0.25);
    // arch over the gate + raised portcullis (its spikes hang in the passage)
    CAS({ ox: -6, oz: 38 }, 'x', 12, 10, (c, r) => r <= 3 ? 1 : 0, GATE_T);
    CAS({ ox: -6, oz: 40 }, 'x', 12, 10, (c, r) => r <= 3 ? 1 : 0, GATE_T);
    const port = WallGrid({ ox: -6, oy: 2.3, oz: 39, dir: 'x', cols: 12, rows: 2, cw: 1, ch: 0.72, th: 0.14, kind: 'chainlink', tint: 0xffffff, hp: 90, house: null });
    wallFill(port, () => 0);
    sdeck(0, 39, 12.8, 3.2, 7.2, 0.3);                               // wall-walk over the gate
    rail({ ox: -6.4, oy: 7.2, oz: 37.5 }, 'x', 13);
    rail({ ox: -6.4, oy: 7.2, oz: 40.4 }, 'x', 13);
    const gpar = (o, dir, cols) => CAS({ ...o, oy: 7.2 }, dir, cols, 1, (c) => c % 2 ? 1 : 0, 0x9d968a, 20);
    gpar({ ox: -12, oz: 36 }, 'x', 6); gpar({ ox: -12, oz: 42 }, 'x', 6);
    gpar({ ox: 6, oz: 36 }, 'x', 6); gpar({ ox: 6, oz: 42 }, 'x', 6);
    addProp('banner', -12.2, 4.4, 39, 0.14, 2.6, 1.8, () => T.heraldry(), 0xffffff, 15, { noWalk: true });
    addProp('banner', 12.2, 4.4, 39, 0.14, 2.6, 1.8, () => T.heraldry('#2a4aa8'), 0xffffff, 15, { noWalk: true });
    torch(-5.6, 3.4, 36.4); torch(5.6, 3.4, 36.4);
    // crumbling curtain walls east + west of the gate (slip through the gaps)
    ruin({ ox: -44, oz: 38 }, 'x', 32, [4, 6, 5, 3, 0, 2, 5, 6, 4, 2, 0, 3, 5, 6, 3, 2]);
    ruin({ ox: 12, oz: 38 }, 'x', 32, [2, 3, 5, 6, 4, 0, 2, 4, 6, 5, 3, 0, 2, 4, 6, 5]);
    sblock(-30, 0, 40.5, -27.6, 1.0, 43);                            // toppled stones
    sblock(32, 0, 34.5, 34.4, 0.9, 37);

    // ================= THE GROUNDS =================
    // quidditch practice hoops (west lawn)
    const hoopMat = new THREE.MeshBasicMaterial({ color: 0xd4af37 });
    for (const [hx, hz, hh] of [[-50, -8, 5.6], [-55, 2, 7.4], [-50, 12, 6.4]]) {
      const post = addProp('hoop', hx, 0, hz, 0.4, hh, 0.4, T.plain, 0xc9a227, 40, {});
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, 6, 14), hoopMat);
      ring.position.set(hx, hh + 1.25, hz);
      ring.rotation.y = Math.PI / 2;
      grp.add(ring);
      W._hoopRings.set(post, ring);
    }
    // pumpkin patch + scarecrow (east lawn)
    for (const [px2, pz2, ps] of [[46, 4, 1.0], [50, 8, 0.8], [48, 13, 1.2], [53, 2, 0.7], [44, 10, 0.9]])
      addProp('pumpkin', px2, 0, pz2, ps, ps * 0.8, ps, T.plain, 0xe07818, 15, {});
    addProp('dummy', 49, 0, 6.5, 0.7, 1.8, 0.7, T.plain, 0xc9a05f, 25, {});
    addProp('hay', 52, 0, 12, 1.4, 1.0, 1.4, T.thatch, 0xd8b968, 15, {});
    // standing stones (north field — old magic, do not tip over. or do)
    for (let st = 0; st < 6; st++) {
      const a = (st / 6) * Math.PI * 2;
      addProp('stone', 48 + Math.cos(a) * 5, 0, -44 + Math.sin(a) * 5, 1.1, 1.7 + (st % 3) * 0.4, 0.8, T.cinder, 0x9a948e, 60, { rotY: a });
    }
    // scattered trees + wagons + ruins
    buildTree(-48, -30); buildTree(-52, -40); buildTree(-56, -14); buildTree(52, -26);
    buildTree(-46, 32); buildTree(-54, 24); buildTree(48, 32); buildTree(56, 22);
    buildTree(-34, 32); buildTree(34, 34);
    addProp('wagon', -46, 0, 12, 3.2, 1.9, 1.8, T.plain, 0x8a5a30, 80, {});
    addProp('hay', -44, 0, 4, 1.4, 1.0, 1.4, T.thatch, 0xd8b968, 15, {});
    addProp('wagon', 24, 0, -44, 3.2, 1.9, 1.8, T.plain, 0x8a5a30, 80, {});
    addProp('hay', -16, 0, -44, 1.4, 1.0, 1.4, T.thatch, 0xd8b968, 15, {});
    ruin({ ox: -56, oz: -34 }, 'z', 12, [3, 5, 6, 4, 2, 0, 3, 5, 6, 4, 2, 1]);
    ruin({ ox: 56, oz: -18 }, 'z', 12, [2, 4, 6, 5, 3, 1, 0, 3, 5, 6, 4, 2]);

    // merge the stonework
    if (stoneG.length) grp.add(new THREE.Mesh(U.mergeGeos(stoneG.splice(0)), new THREE.MeshBasicMaterial({ map: T.castlebrick(), vertexColors: true, color: 0xb5afa2 })));
    if (ironG.length) grp.add(new THREE.Mesh(U.mergeGeos(ironG.splice(0)), new THREE.MeshBasicMaterial({ map: T.gunmetal(), vertexColors: true, color: 0x4a4640 })));
    if (goldG.length) grp.add(new THREE.Mesh(U.mergeGeos(goldG.splice(0)), new THREE.MeshBasicMaterial({ map: T.plain(), color: 0xc9a84a })));

    // ---- flow ----
    W.spawnPoints = [
      { x: 0, z: 46 }, { x: 0, z: -46 }, { x: -24, z: 42 }, { x: 24, z: 42 },
      { x: -48, z: 20 }, { x: 48, z: 18 }, { x: -52, z: -8 }, { x: 52, z: 6 },
      { x: 0, z: 24 }, { x: -22, z: 10 }, { x: 22, z: 10 }, { x: -34, z: -24 },
      { x: 34, z: -24 }, { x: 0, z: -43 }, { x: -44, z: -36 }, { x: 46, z: -34 },
    ];
    W.campSpots.push(
      { x: 36.5, z: -36, yaw: Math.atan2(36.5, -36) },      // astronomy tower
      { x: -0.5, z: -25, yaw: Math.PI },                    // hall roof
      { x: 12.6, z: -25, yaw: Math.PI / 2 },                // east gallery
      { x: -38.6, z: -28, yaw: -Math.PI / 2 },              // library mezzanine
      { x: 0, z: 8, yaw: 0 },                               // the covered bridge
      { x: 0, z: 39, yaw: Math.PI },                        // gatehouse walk
      { x: -22, z: 8, yaw: Math.atan2(-22, 8) },            // west arm roof
      { x: 22, z: 8, yaw: Math.atan2(22, 8) },              // east arm roof
      { x: -21.5, z: 30, yaw: Math.atan2(-21.5, 30) },      // owlery top
      { x: 24, z: -24, yaw: Math.PI / 2 },                  // the vault
    );
    W.hillSpots = [
      { x: 0, z: 1.5, y: 0, r: 5.5 },      // the fountain
      { x: 0, z: -25, y: 2.9, r: 5.5 },    // the great hall
      { x: 37, z: 20, y: 0, r: 5.0 },      // the greenhouse
      { x: -28, z: -24, y: 0, r: 4.5 },    // the potions corridor
    ];
    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#54713e'; x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = '#b3a37f'; x.fillRect((ox - 3.5) * s, (oz - 10) * s, 7 * s, 48 * s);      // path
      x.fillStyle = '#a29b8d'; x.fillRect((ox - 40) * s, (oz - 38) * s, 80 * s, 28 * s);      // the podium
      x.fillStyle = '#8d867a'; x.fillRect((ox - 14) * s, (oz - 38) * s, 28 * s, 26 * s);      // great hall
      x.fillStyle = '#978f81';
      x.fillRect((ox - 26) * s, (oz - 10) * s, 8 * s, 44 * s);                                // west arm + owlery
      x.fillRect((ox + 18) * s, (oz - 10) * s, 8 * s, 36 * s);                                // east arm
      x.fillStyle = '#7a9a55'; x.fillRect((ox - 18) * s, (oz - 10) * s, 36 * s, 36 * s);      // courtyard
      x.fillStyle = '#6a4c30'; x.fillRect((ox - 18) * s, (oz + 6.4) * s, 36 * s, 3.2 * s);    // the bridge
      x.fillStyle = '#9fd4c2'; x.fillRect((ox + 30) * s, (oz + 14) * s, 14 * s, 12 * s);      // greenhouse
      x.fillStyle = '#8a8478';
      x.fillRect((ox - 12) * s, (oz + 36) * s, 6 * s, 6 * s);                                 // gatehouse
      x.fillRect((ox + 6) * s, (oz + 36) * s, 6 * s, 6 * s);
      x.fillRect((ox + 32) * s, (oz - 40) * s, 8 * s, 8 * s);                                 // astronomy tower
      x.fillStyle = '#4a453e';                                                                // the dungeon
      x.fillRect((ox - 40) * s, (oz - 26) * s, 80 * s, 4 * s);
      x.fillRect((ox - 21) * s, (oz - 22) * s, 4 * s, 12 * s);
      x.fillRect((ox + 17) * s, (oz - 22) * s, 4 * s, 12 * s);
      x.fillStyle = '#c5bfb0'; x.beginPath(); x.arc(ox * s, (oz + 1.5) * s, 2.6 * s, 0, Math.PI * 2); x.fill();
    };
    let fountainT = 0;
    W.mapUpdate = function (dt) {
      const t = W.mapClock * 13;
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const k = 0.88 + Math.sin(t + f.position.x * 7.3 + f.position.z * 3.1) * 0.14;
        f.scale.x = f.userData.s * k;
        f.scale.y = f.userData.s * 1.5 * (2 - k);
      }
      for (let i = 0; i < floaters.length; i++) {
        const fc = floaters[i];
        const y = fc.y0 + Math.sin(W.mapClock * 0.8 + fc.ph) * 0.28;
        fc.m.position.y = y;
        fc.f.position.y = y + 0.44;
      }
      if (W._orrerySpin) {
        W._orrerySpin.rotation.y += dt * 0.5;
        for (const oa of orrArms) oa.arm.rotation.y += dt * oa.sp * 0.6;
      }
      fountainT -= dt;
      if (fountainT <= 0 && G.fx) {
        fountainT = 2.6;
        G.fx.addEmitter({ pos: new THREE.Vector3(0, 2.9, 1.5), rate: 14, kind: 'water', dur: 0.5 });
      }
    };
    // twilight over the academy: a violet sky and one pale moon
    addSky(0x483e6b, { clouds: 6, cloudTint: 0x8577b3, sunTint: 0xe6ecff, sunPos: [110, 72, -150], sunScale: 24 });
  }

  function buildPalm(x, z, lean) {
    const dx = Math.cos(lean) * 0.3, dz = Math.sin(lean) * 0.3;
    let cx = x, cz = z, py = 0;
    for (let i = 0; i < 4; i++) {
      const g = U.shadedBoxGeo(0.42 - i * 0.05, 1.35, 0.42 - i * 0.05);
      g.translate(cx, py + 0.675, cz);
      palmTrunkGeos.push(g);
      cx += dx; cz += dz; py += 1.28;
    }
    addCollider(x - 0.32, 0, z - 0.32, x + 0.32, 3.6, z + 0.32, { tree: true });
    const topY = py + 0.35;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + lean;
      const g = new THREE.PlaneGeometry(3.3, 1.05);
      g.translate(1.65, 0, 0);
      g.rotateZ(-0.42);
      g.rotateY(a);
      g.translate(cx - dx, topY, cz - dz);
      frondGeos.push(g);
    }
  }

  // full rebuild for a fresh match — disposes everything the last build created
  W.reset = function (mapId) {
    if (mapId && W.maps.find(m => m.id === mapId)) W.mapId = mapId;
    if (grp) {
      grp.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      scene.remove(grp);
    }
    walls.length = 0; sheets.length = 0; houses.length = 0;
    colliders.length = 0; slabs.length = 0; hedges.length = 0;
    cars.length = 0; props.length = 0;
    delayedBreaks.length = 0; dirtyWalls.length = 0; navDirty.length = 0;
    treeCanopyGeos.length = 0; poleGeos.length = 0; poleTops.length = 0; stairGeos.length = 0;
    steelGeos.length = 0; rockGeos.length = 0; frondGeos.length = 0; palmTrunkGeos.length = 0; sandGeos.length = 0;
    ladders.length = 0; lavas.length = 0; geysers.length = 0; groundHoles.length = 0;
    stairRuns.length = 0;
    bouncePads.length = 0;
    W.campSpots.length = 0;
    W.hillSpots.length = 0;
    W.bill = {}; W.billTotal = 0; W.chunksDestroyed = 0;
    W.build(scene);
  };

  W.flushBatches = function () { for (const k in batches) batches[k].flush(); };

  W.walls = walls;
  W.sheets = sheets;
  W.houses = houses;

  // ============ per-frame update ============
  W.update = function (dt) {
    // delayed structural breaks
    for (let i = delayedBreaks.length - 1; i >= 0; i--) {
      const b = delayedBreaks[i];
      b.t -= dt;
      if (b.t <= 0) {
        if (b.wall) {
          tmpN.set(U.rand(-0.5, 0.5), -1.5, U.rand(-0.5, 0.5));
          destroyChunk(b.wall, b.c, b.r, tmpN);
        } else if (b.sheet) {
          tmpN.set(U.rand(-1, 1), U.rand(-3, -1), U.rand(-1, 1));
          destroySheetChunk(b.sheet, b.ch, tmpN);
        }
        delayedBreaks.splice(i, 1);
      }
    }
    // support checks (budget 2 walls/frame)
    let n = 0;
    while (dirtyWalls.length && n < 2) { supportCheck(dirtyWalls.pop()); n++; }
    // nav dirty cells
    let c = 0;
    while (navDirty.length && c < 40) {
      const i = navDirty.pop();
      if (i >= 0 && i < navBlocked.length) {
        const cx = i % NAV.w, cz = (i / NAV.w) | 0;
        navBlocked[i] = cellBlockedNow(cx, cz) ? 1 : 0;
      }
      c++;
    }
    updateCars(dt);
    W.mapClock += dt;
    if (W.mapUpdate) W.mapUpdate(dt);
    W.flushBatches();
  };

  return W;
})();
