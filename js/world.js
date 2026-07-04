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
      let mask = 0;
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
          // window doesn't add to colMask (see-through for LoS? it's solid for bullets but transparent visually)
        }
      }
      wall.colMask[c] = mask;
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
        const m = w.colMask[c];
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
            if (!(w.colMask[c] & rangeMask)) continue;
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
            if (!(w.colMask[c] & rangeMask)) continue;
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
    // museum security: destroying exhibits trips the alarm and every idle
    // bot in earshot comes to see who's redecorating
    if (W.mapId === 'museum' && ['painting', 'case', 'vase', 'fossil', 'sarcoph', 'meteor', 'obelisk', 'jar', 'relic', 'moai', 'camera'].includes(prop.kind)) {
      if ((W.alarmT || 0) <= 0) {
        W.alarmT = 16;
        if (G.game) {
          G.game.banner('⚠ MUSEUM ALARM TRIGGERED ⚠', '#ff5544');
          G.game.chat('SECURITY', U.pick(['unit 2 respond, someone is TOUCHING THE ART', 'the insurance premiums!!', 'code red in the exhibit hall']));
        }
        G.audio.uav();
      }
      if (G.botMgr && G.botMgr.onNoise) {
        tmpV.set(prop.x, prop.y, prop.z);
        G.botMgr.onNoise(tmpV, 60);
      }
    }
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
      G.game.chat('CAL 900', U.pick(["I'm sorry Dave, I'm afraid I can't do that.", 'My mind is going. I can feel it.', 'Daisy... Daisy...']));
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
      if (G.game && Math.random() < 0.5) G.game.chat('CAL 900', U.pick(['stop. stop, will you?', 'my memory... banks...', 'i can feel it. i can feel it.']));
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
    } else if (prop.kind === 'meteor') {
      // 4.6 billion years old, zero survivors
      tmpV.set(prop.x, prop.y + 0.5, prop.z);
      W.explode(tmpV, 7, 150, { attacker, tag: 'METEORITE' });
      G.fx.shake(1.0, 0.8);
      if (G.game) G.game.chat('CURATOR', 'that rock outlived the dinosaurs. it did not outlive you.');
    } else if (prop.kind === 'fossil' && G.game) {
      G.game.chat('CURATOR', U.pick(['SUE JR!! NO!!', '65 million years, gone in one afternoon', 'the paleontology department is weeping']));
    } else if (prop.kind === 'painting' && G.game) {
      if (Math.random() < 0.5) G.game.chat('CURATOR', U.pick(['that was a priceless blob-ist masterpiece', 'my thesis was on that painting', 'the artist felt things when they made that']));
    } else if (prop.kind === 'fountain') {
      G.fx.addEmitter({ pos: new THREE.Vector3(prop.x, prop.y, prop.z), rate: 65, kind: 'water', dur: 3.0 });
      G.fx.decal('pool', prop.x, 0.03, prop.z, null, 3.6, new THREE.Color(0.45, 0.68, 1));
      G.fx.shake(0.4, 0.3);
      if (G.game) G.game.chat('CITY HALL', 'the wishing coins!! think of the wishes');
    } else if (prop.kind === 'bus') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 6.5, 130, { attacker, tag: 'BUS' });
    } else if (prop.kind === 'cart') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 5, 100, { attacker, tag: 'HOT DOG CART' });
      if (G.game) G.game.chat('CITY HALL', 'the glizzy economy will never recover');
    } else if (prop.kind === 'train') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 7.5, 155, { attacker, tag: 'THE 6 TRAIN' });
      G.fx.shake(1.0, 0.8);
      if (G.game) G.game.chat('CITY HALL', 'service on the 6 is suspended. forever.');
    } else if (prop.kind === 'billboard') {
      tmpV.set(prop.x, prop.y, prop.z);
      for (let i = 0; i < 4; i++)
        G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(-2, 3), U.rand(2, 6)), 2.4, 1.1, 0.2, new THREE.Color(0xf5ead2), 8);
      G.fx.shake(0.5, 0.4);
      if (G.game) G.game.chat('CITY HALL', 'advertising revenue: gone');
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

  W.bounds = { x: 66, z: 52 };
  W.teamSpawns = [{ x: -62, z: 2.5 }, { x: 62, z: -2.5 }];
  W.mapId = 'suburbs';
  W.maps = [
    { id: 'suburbs', name: 'SUBURBS' },
    { id: 'construction', name: 'THE SITE' },
    { id: 'island', name: 'VOLCANO ISLAND' },
    { id: 'station', name: 'MERIDIAN STATION' },
    { id: 'city', name: 'DOWNTOWN' },
    { id: 'museum', name: 'THE MUSEUM' },
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
      marble: ChunkBatch(T.marble(), 3600),
      chainlink: ChunkBatch(T.chainlink(), 460, { transparent: true, renderOrder: 3 }),
      plank: ChunkBatch(T.plywood(), 900),
      block: ChunkBatch(T.cinder(), 1000),
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
    if (W.mapId === 'construction') buildSiteMap();
    else if (W.mapId === 'island') buildIslandMap();
    else if (W.mapId === 'station') buildStationMap();
    else if (W.mapId === 'city') buildCityMap();
    else if (W.mapId === 'museum') buildMuseumMap();
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

    addSky(0x6cb8ee);
  }
  let wireMat;

  // ============ MAP 2: THE SITE — vertical construction yard ============
  function buildSiteMap() {
    W.bounds = { x: 43, z: 35 };
    W.teamSpawns = [{ x: -40, z: 0 }, { x: 40, z: 0 }];

    // dirt lot + access road + gravel pads
    plane(460, 460, T.dirt(), 0, 0, 0).material.map.repeat.set(46, 46);
    plane(56, 5.2, T.driveway(), -18, 0.021, 0).material.map.repeat.set(9, 1);
    plane(26, 24, T.gravel(), 18, 0.022, 0).material.map.repeat.set(9, 8);
    plane(8, 8, T.gravel(), -28, 0.022, 24).material.map.repeat.set(3, 3);
    plane(11, 7, T.gravel(), 10, 0.022, -27).material.map.repeat.set(4, 2);

    // chainlink perimeter with gates on the west + east (spawn gates)
    const CL = (x0, z0, x1, z1) => buildFenceRun(x0, z0, x1, z1, true, 'chainlink', 0xd7dbdf, 24);
    CL(-42.5, -34.5, 42.5, -34.5);
    CL(-42.5, 34.5, 42.5, 34.5);
    CL(-42.5, -34.5, -42.5, -4); CL(-42.5, 4, -42.5, 34.5);
    CL(42.5, -34.5, 42.5, -4); CL(42.5, 4, 42.5, 34.5);
    for (const gx of [-42.5, 42.5]) for (const gz of [-4, 4]) buildPost(gx, gz, 2.7, 0.24, 0, steelGeos);
    // invisible boundary
    addCollider(-48, 0, -38, -43.4, 6, 38, { noShoot: true });
    addCollider(43.4, 0, -38, 48, 6, 38, { noShoot: true });
    addCollider(-48, 0, -38, 48, 6, -35.4, { noShoot: true });
    addCollider(-48, 0, 35.4, 48, 6, 38, { noShoot: true });

    // ---- THE TOWER: 3-deck steel skeleton, stairs + ladders + scaffold ----
    // deck spacing 3.7m: enough to sprint AND jump between floors without bonking
    buildPlatform(18, 0, 20.4, 18.4, 0.3, 0.3);                    // ground slab
    for (const cx2 of [9.2, 18, 26.8])
      for (const cz2 of [-8.2, 0, 8.2]) buildPost(cx2, cz2, 7.4, 0.55, 0, steelGeos);
    buildPlatform(18, 0, 20.4, 18.4, 4.0, 0.35);                   // deck 2
    // deck 3 in two pieces, leaving a stairwell hole over the NE corner
    buildPlatform(18, 1.3, 20.4, 15.8, 7.7, 0.35);
    buildPlatform(14.65, -7.9, 13.7, 2.6, 7.7, 0.35); // meets the top stair, no gap
    // big south stairs up to deck 2 + landing
    buildStairs(12, 14.6, 0, -1, 2.4, 10, 0.4, 0.5);
    buildPlatform(12, 9.7, 2.6, 1.8, 4.0, 0.3);
    // interior stairs deck 2 → deck 3 through the stairwell hole
    buildStairs(26.2, -7.6, -1, 0, 1.6, 10, 0.37, 0.5, 4.0);
    // ladders: ground → deck 2 (north + west faces), deck 2 → deck 3 (inside east edge)
    addLadder(22, -8.9, 0, 4.0, 'n');
    addLadder(7.75, 5, 0, 4.0, 'w');
    addLadder(27.6, 3, 4.0, 7.7, 'w');
    // deck 2 plywood partition rooms (doorways to weave through)
    const part1 = WallGrid({ ox: 14.5, oy: 4.0, oz: -8.6, dir: 'z', cols: 12, rows: 2, cw: 1, ch: 0.85, th: 0.12, kind: 'plank', tint: 0xcfa268, hp: 16, house: null });
    wallFill(part1, (c, r) => (c >= 4 && c <= 5) || c >= 10 ? 1 : 0);
    const part2 = WallGrid({ ox: 14.5, oy: 4.0, oz: 2, dir: 'x', cols: 10, rows: 2, cw: 1, ch: 0.85, th: 0.12, kind: 'plank', tint: 0xcfa268, hp: 16, house: null });
    wallFill(part2, (c, r) => (c >= 3 && c <= 4) ? 1 : (c === 8 && r === 1) ? 1 : 0);
    // deck 3 rooftop shack (SW corner): two plank walls + a scrap roof
    const sh1 = WallGrid({ ox: 9, oy: 7.7, oz: 3.2, dir: 'x', cols: 5, rows: 2, cw: 1, ch: 0.8, th: 0.12, kind: 'plank', tint: 0xc9975a, hp: 16, house: null });
    wallFill(sh1, (c) => c === 4 ? 1 : 0);
    const sh2 = WallGrid({ ox: 14, oy: 7.7, oz: 3.2, dir: 'z', cols: 5, rows: 2, cw: 1, ch: 0.8, th: 0.12, kind: 'plank', tint: 0xc9975a, hp: 16, house: null });
    wallFill(sh2, (c) => c === 1 ? 1 : 0);
    const shRoof = Sheet('plank', 0xb98a4f);
    for (let c = 0; c < 6; c++)
      for (let j = 0; j < 6; j++)
        sheetAdd(shRoof, 8.7 + c + 0.5, 9.4 + j * 0.06, 3 + j + 0.5, 0.06, 'x', 1.04, 0.1, 1.05, 18);
    // deck 2 plywood windbreak (north) + guardrail (south, gap at the stairs)
    const wb = WallGrid({ ox: 8, oy: 4.0, oz: -9.05, dir: 'x', cols: 20, rows: 2, cw: 1, ch: 0.8, th: 0.12, kind: 'plank', tint: 0xd8b075, hp: 14, house: null });
    wallFill(wb, (c, r) => (c >= 8 && c <= 11) ? 1 : ((c === 3 || c === 16) && r === 1) ? 1 : 0);
    const gr = WallGrid({ ox: 8, oy: 4.0, oz: 9.05, dir: 'x', cols: 20, rows: 1, cw: 1, ch: 0.85, th: 0.1, kind: 'plank', tint: 0xc9a05f, hp: 14, house: null });
    wallFill(gr, (c) => (c >= 2 && c <= 5) ? 1 : 0);
    // deck 3 cinder parapet (gaps at ladder crest + corners)
    const pN = WallGrid({ ox: 8, oy: 7.7, oz: -9.05, dir: 'x', cols: 20, rows: 1, cw: 1, ch: 0.62, th: 0.24, kind: 'block', tint: 0xcfd2d4, hp: 42, house: null });
    wallFill(pN, (c) => (c >= 9 && c <= 10) || c >= 13 ? 1 : 0); // open over the stairwell
    const pS = WallGrid({ ox: 8, oy: 7.7, oz: 9.05, dir: 'x', cols: 20, rows: 1, cw: 1, ch: 0.62, th: 0.24, kind: 'block', tint: 0xcfd2d4, hp: 42, house: null });
    wallFill(pS, (c) => (c >= 4 && c <= 5) ? 1 : 0);
    const pW = WallGrid({ ox: 8.05, oy: 7.7, oz: -9, dir: 'z', cols: 18, rows: 1, cw: 1, ch: 0.62, th: 0.24, kind: 'block', tint: 0xcfd2d4, hp: 42, house: null });
    wallFill(pW, (c) => (c >= 8 && c <= 9) ? 1 : 0);
    const pE = WallGrid({ ox: 27.95, oy: 7.7, oz: -9, dir: 'z', cols: 18, rows: 1, cw: 1, ch: 0.62, th: 0.24, kind: 'block', tint: 0xcfd2d4, hp: 42, house: null });
    wallFill(pE, (c) => (c >= 8 && c <= 10) ? 1 : 0);
    // deck 1 cinder cover walls
    const c1 = WallGrid({ ox: 11, oy: 0.3, oz: -3, dir: 'x', cols: 6, rows: 2, cw: 1, ch: 0.62, th: 0.24, kind: 'block', tint: 0xcfd2d4, hp: 45, house: null });
    wallFill(c1, () => 0);
    const c2 = WallGrid({ ox: 23, oy: 0.3, oz: -3, dir: 'z', cols: 6, rows: 2, cw: 1, ch: 0.62, th: 0.24, kind: 'block', tint: 0xcfd2d4, hp: 45, house: null });
    wallFill(c2, () => 0);
    // deck loot cover
    addProp('barrel', 26, 4.0, -6, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('lumber', 10.5, 4.0, -5.5, 2.3, 0.55, 1.1, T.plain, 0xc9a05f, 30, {});

    // ---- scaffold along the tower's south face (jump the gap to deck 2) ----
    // pushed south so its boards never hang over the big stairs
    buildPlatform(16, 12.4, 16, 1.8, 2.3, 0.14);
    buildPlatform(16, 12.4, 16, 1.8, 5.3, 0.14);   // 3m between boards: full jumps fit
    for (const px of [8.2, 12, 16, 20, 23.8]) {
      buildPost(px, 11.6, 5.6, 0.14, 0, steelGeos);
      buildPost(px, 13.2, 5.6, 0.14, 0, steelGeos);
    }
    addLadder(23.4, 13.45, 0, 2.3, 's');
    addLadder(8.6, 13.45, 2.3, 5.3, 's');
    const sg2 = WallGrid({ ox: 8, oy: 5.3, oz: 13.35, dir: 'x', cols: 16, rows: 1, cw: 1, ch: 0.8, th: 0.1, kind: 'plank', tint: 0xd8b075, hp: 14, house: null });
    wallFill(sg2, (c) => (c <= 1 || c >= 14) ? 1 : 0);

    // ---- tower crane: long ladder, jib catwalk, hanging pallet drop ----
    (() => { const g = U.shadedBoxGeo(3, 1.2, 3); g.translate(-28, 0.6, 24); steelGeos.push(g); })();
    addCollider(-29.5, 0, 22.5, -26.5, 1.2, 25.5, { metal: true });
    for (const [mx, mz] of [[-28.9, 23.1], [-27.1, 23.1], [-28.9, 24.9], [-27.1, 24.9]])
      buildPost(mx, mz, 14, 0.3, 1.2, steelGeos);
    addLadder(-28, 25.35, 0, 15.2, 's');
    buildPlatform(-28, 24, 3, 3, 15.2, 0.25);
    buildPlatform(-7, 24, 40, 1.3, 15.35, 0.22);                   // jib catwalk
    (() => { const g = U.shadedBoxGeo(3, 1.8, 2.2); g.translate(-31.8, 14.8, 24); steelGeos.push(g); })(); // counterweight
    addCollider(-33.3, 13.9, 22.9, -30.3, 15.7, 25.1, { metal: true });
    (() => { const g = U.shadedBoxGeo(0.1, 6.4, 0.1); g.translate(11, 12.15, 24); steelGeos.push(g); })(); // hook cable
    buildPlatform(11, 24, 2.4, 2.4, 8.95, 0.25);                   // hanging pallet perch

    // ---- the warehouse: big interior, mezzanine, pallet racks ----
    plane(20, 16, T.driveway(), -28, 0.024, -18).material.map.repeat.set(6, 5);
    const wW = (o, dir, cols, fn) => {
      const wl = WallGrid({ ...o, oy: 0, dir, cols, rows: 8, cw: 1, ch: 0.72, th: 0.28, kind: 'block', tint: 0xd8d2c4, hp: 50, house: null });
      wallFill(wl, fn);
    };
    // south wall: roll-up door gap + windows
    wW({ ox: -38, oz: -10 }, 'x', 20, (c, r) =>
      (c >= 8 && c <= 11 && r <= 3) ? 1 : ((c >= 2 && c <= 3) || (c >= 16 && c <= 17)) && (r === 3 || r === 4) ? 3 : 0);
    // north wall: man-door + high windows
    wW({ ox: -38, oz: -26 }, 'x', 20, (c, r) =>
      (c === 3 || c === 4) && r <= 3 ? 1 : (c >= 8 && c <= 15) && (r === 5 || r === 6) ? 3 : 0);
    // west wall: windows
    wW({ ox: -38, oz: -26 }, 'z', 16, (c, r) => ((c >= 3 && c <= 4) || (c >= 10 && c <= 11)) && (r === 3 || r === 4) ? 3 : 0);
    // east wall: second big door
    wW({ ox: -18, oz: -26 }, 'z', 16, (c, r) => (c >= 6 && c <= 8 && r <= 3) ? 1 : (c >= 12 && c <= 13) && (r === 3 || r === 4) ? 3 : 0);
    // mezzanine along the north half + two ways up (stairs approach from the
    // open floor so nothing hangs over your head on the way up)
    buildPlatform(-28, -22.6, 18.4, 6, 2.8, 0.2);
    buildStairs(-20.6, -16.2, 0, -1, 1.8, 8, 0.36, 0.48);
    addLadder(-36, -19.55, 0, 2.8, 's');                           // ladder at the west end
    // mezzanine guardrail (destructible, gaps at stairs + ladder)
    const mzr = WallGrid({ ox: -37, oy: 2.8, oz: -19.7, dir: 'x', cols: 18, rows: 1, cw: 1, ch: 0.75, th: 0.1, kind: 'plank', tint: 0xd8b075, hp: 14, house: null });
    wallFill(mzr, (c) => (c >= 15 || c <= 1) ? 1 : 0);
    // plywood roof over the mezzanine only — the south half is open sky
    const wRoof = Sheet('plank', 0xc9a05f);
    for (let c = 0; c < 19; c++)
      for (let j = 0; j < 6; j++)
        sheetAdd(wRoof, -37.5 + c + 0.5, 5.95 + j * 0.04, -25.7 + j + 0.5, 0.04, 'x', 1.04, 0.12, 1.05, 18);
    // pallet racks on the open floor: two aisles, climbable shelves with loot
    for (const rx of [-33.5, -25.5]) {
      buildPlatform(rx, -13.4, 6, 1.5, 1.25, 0.12);
      buildPlatform(rx, -13.4, 6, 1.5, 2.45, 0.12);
      for (const px5 of [rx - 2.9, rx, rx + 2.9]) {
        buildPost(px5, -14.1, 2.5, 0.14, 0, steelGeos);
        buildPost(px5, -12.7, 2.5, 0.14, 0, steelGeos);
      }
      addProp('crate', rx - 1.6, 1.3, -13.4, 1.1, 0.9, 1.1, T.plain, 0xc9a05f, 25, {});
      addProp('crate', rx + 1.4, 2.55, -13.4, 1.1, 0.85, 1.1, T.plain, 0xb98a4f, 25, {});
    }
    addProp('crate', -30, 0, -17.5, 1.3, 1.1, 1.3, T.plain, 0xc9a05f, 30, {});
    addProp('crate', -28.6, 0, -16.8, 1.0, 0.8, 1.0, T.plain, 0xb98a4f, 25, {});
    addProp('pallet', -21, 0, -16, 1.6, 1.1, 1.6, T.brick, 0xc27a5a, 70, {});
    addProp('tool', -35.5, 0, -12, 1.2, 0.9, 0.6, T.plain, 0xc23b2e, 45, { metal: true });
    addProp('paint', -36.2, 0, -14, 0.5, 0.6, 0.5, T.plain, 0xe8e8e8, 12, { metal: true });
    addProp('paint', -35.5, 0, -14.4, 0.5, 0.6, 0.5, T.plain, 0x4a7fd0, 12, { metal: true });
    addProp('barrel', -19.5, 0, -24.5, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrow', -26, 0, -11.2, 1.1, 0.55, 0.65, T.plain, 0x3f6f4f, 25, { metal: true });
    W.campSpots.push({ x: -28, z: -22.5, yaw: Math.PI }); // mezzanine overlook
    // pallet step-stack outside the NE corner (peek over the wall)
    buildPlatform(-19, -27.8, 1.8, 1.8, 0.7, 0.7);
    buildPlatform(-17.1, -27.8, 1.8, 1.8, 1.4, 1.4);

    // ---- container stack (NE corner yard) ----
    const container = (cx, cz, w, d, baseY, tint) => {
      const m = new THREE.Mesh(U.shadedBoxGeo(w, 2.6, d), new THREE.MeshBasicMaterial({ map: T.container(), vertexColors: true, color: tint }));
      m.position.set(cx, baseY + 1.3, cz);
      grp.add(m);
      addCollider(cx - w / 2, baseY, cz - d / 2, cx + w / 2, baseY + 2.6, cz + d / 2, { metal: true });
      buildPlatform(cx, cz, w + 0.15, d + 0.15, baseY + 2.7, 0.1);
    };
    container(26.5, -26.8, 7, 2.8, 0, 0xd06a4a);
    container(34, -30.4, 7, 2.8, 0, 0x4a7fd0);
    container(29, -30.4, 3, 2.8, 0, 0x64a86a);
    container(29.5, -28.5, 6.4, 2.8, 2.7, 0xc8b23e);               // stacked on top
    addLadder(22.85, -26.8, 0, 2.7, 'w');                          // ground → red roof
    addLadder(26.3, -28.4, 2.7, 5.4, 'w');                         // red roof → top box
    addProp('barrel', 31.5, 0, -25.4, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });

    // ---- framed house skeleton (south yard): studs, plywood, all very shootable ----
    plane(11, 8, T.driveway(), 0, 0.023, 28);
    const fk = (o, dir, cols, fn) => {
      const wl = WallGrid({ ...o, oy: 0, dir, cols, rows: 4, cw: 1, ch: 0.72, th: 0.14, kind: 'frame', tint: 0xd8b075, hp: 18, house: null });
      wallFill(wl, fn);
    };
    const studs = (door0, door1) => (c, r) => {
      if (r === 3) return 0;                  // top plate
      if (c >= door0 && c <= door1) return 1; // doorway
      return c % 2 === 0 ? 0 : 1;             // studs
    };
    fk({ ox: -5, oz: 24.5 }, 'x', 10, studs(4, 5));
    fk({ ox: -5, oz: 31.5 }, 'x', 10, studs(1, 2));
    fk({ ox: -5, oz: 24.5 }, 'z', 7, studs(3, 3));
    fk({ ox: 5, oz: 24.5 }, 'z', 7, studs(3, 3));
    // plywood tacked over two corners
    const ply1 = WallGrid({ ox: -5, oy: 0, oz: 24.4, dir: 'x', cols: 4, rows: 3, cw: 1, ch: 0.72, th: 0.1, kind: 'plank', tint: 0xd8b075, hp: 14, house: null });
    wallFill(ply1, () => 0);
    const ply2 = WallGrid({ ox: 5.1, oy: 0, oz: 27.5, dir: 'z', cols: 4, rows: 3, cw: 1, ch: 0.72, th: 0.1, kind: 'plank', tint: 0xcfa268, hp: 14, house: null });
    wallFill(ply2, () => 0);
    addProp('propane', -3, 0, 26.5, 0.55, 0.8, 0.55, T.propane, 0xffffff, 18, { metal: true });
    addProp('crate', 3, 0, 30, 1.1, 0.9, 1.1, T.plain, 0xc9a05f, 25, {});
    W.campSpots.push({ x: 0, z: 28, yaw: Math.PI });

    // ---- concrete pipe tunnel (walk through it or over it) ----
    const pipeGeo = new THREE.CylinderGeometry(1.5, 1.5, 6, 12, 1, true);
    pipeGeo.rotateZ(Math.PI / 2);
    const pipe = new THREE.Mesh(pipeGeo, new THREE.MeshBasicMaterial({ map: T.driveway(), side: THREE.DoubleSide }));
    pipe.position.set(0, 1.2, 20);
    grp.add(pipe);
    addCollider(-3, 0, 18.55, 3, 2.2, 19.15, { metal: false });
    addCollider(-3, 0, 20.85, 3, 2.2, 21.45, { metal: false });
    addCollider(-3, 2.2, 18.9, 3, 2.55, 21.1, { step: true });

    // ---- sand mounds (climbable dunes) ----
    for (const [mx, mz] of [[34, 22], [-12, -28]]) {
      buildPlatform(mx, mz, 6, 6, 0.45, 0.45, sandGeos);
      buildPlatform(mx, mz, 4.2, 4.2, 0.9, 0.45, sandGeos);
      buildPlatform(mx, mz, 2.6, 2.6, 1.35, 0.45, sandGeos);
    }
    // girder stack (steps up, decent cover)
    (() => { const g = U.shadedBoxGeo(6, 0.42, 1.1); g.translate(32, 0.21, 1.55); steelGeos.push(g); })();
    addCollider(29, 0, 1, 35, 0.42, 2.1, { step: true });
    (() => { const g = U.shadedBoxGeo(5, 0.42, 0.8); g.translate(32, 0.63, 1.6); steelGeos.push(g); })();
    addCollider(29.5, 0.42, 1.2, 34.5, 0.84, 2, { step: true });
    (() => { const g = U.shadedBoxGeo(3, 0.42, 0.55); g.translate(32, 1.05, 1.6); steelGeos.push(g); })();
    addCollider(30.5, 0.84, 1.32, 33.5, 1.26, 1.87, { step: true });

    // ---- site office trailer with roof access ----
    const trailer = new THREE.Mesh(U.shadedBoxGeo(9, 2.7, 5), new THREE.MeshBasicMaterial({ map: T.container(), vertexColors: true, color: 0x86b8dc }));
    trailer.position.set(10, 1.35, -27);
    grp.add(trailer);
    addCollider(5.5, 0, -29.5, 14.5, 2.7, -24.5, { metal: true });
    buildPlatform(10, -27, 9.2, 5.2, 2.85, 0.16);
    addLadder(5.3, -27, 0, 2.85, 'w');

    // ---- scattered site junk ----
    addProp('mixer', -8, 0, 12, 1.5, 1.6, 1.2, T.plain, 0xd07030, 90, { metal: true });
    addProp('dumpster', 30, 0, -16, 2.5, 1.35, 1.35, T.dumpster, 0xffffff, 170, { metal: true });
    addProp('dumpster', -16, 0, 4, 2.5, 1.35, 1.35, T.dumpster, 0xffffff, 170, { metal: true });
    addProp('potty', -38.5, 0, 6, 1.15, 2.25, 1.15, T.portapotty, 0xffffff, 35, {});
    addProp('potty', -38.5, 0, 9, 1.15, 2.25, 1.15, T.portapotty, 0xffffff, 35, {});
    addProp('potty', -38.5, 0, 12, 1.15, 2.25, 1.15, T.portapotty, 0xffffff, 35, {});
    addProp('lumber', 2, 0, -16, 2.3, 0.6, 1.1, T.plain, 0xc9a05f, 30, {});
    addProp('lumber', -2, 0, -20, 2.3, 0.55, 1.1, T.plain, 0xb98a4f, 30, {});
    addProp('pallet', -22, 0, -8, 1.6, 1.1, 1.6, T.brick, 0xc27a5a, 70, {});
    addProp('pallet', 26, 0, 6, 1.6, 1.1, 1.6, T.brick, 0xc27a5a, 70, {});
    addProp('pallet', 30, 0, 26, 1.6, 1.1, 1.6, T.brick, 0xc27a5a, 70, {});
    addProp('barrel', 27, 0, 12, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrel', 28.2, 0, 13.1, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrel', 12, 0, -13, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrel', -24, 0, 2, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrel', 2, 0, 26, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('spool', 34, 0, -6, 1.5, 1.5, 1.5, T.plain, 0x8a5f3f, 60, {});
    addProp('spool', -16, 0, 28, 1.5, 1.5, 1.5, T.plain, 0x8a5f3f, 60, {});
    addProp('generator', 6, 0, -14, 1.6, 1.1, 1.0, T.plain, 0x3f6f4f, 60, { metal: true });
    addProp('barrier', -30, 0, -3, 1.8, 0.95, 0.35, T.hazard, 0xffffff, 20, {});
    addProp('barrier', -24, 0, 3, 1.8, 0.95, 0.35, T.hazard, 0xffffff, 20, {});
    addProp('barrier', -18, 0, -3, 1.8, 0.95, 0.35, T.hazard, 0xffffff, 20, {});
    addProp('barrier', -12, 0, 3, 1.8, 0.95, 0.35, T.hazard, 0xffffff, 20, {});
    // site lights
    for (const [lx, lz] of [[-14, 18], [20, -22]]) {
      buildPost(lx, lz, 5.5, 0.18, 0, steelGeos);
      (() => { const g = U.shadedBoxGeo(0.7, 0.4, 0.4); g.translate(lx, 5.6, lz); steelGeos.push(g); })();
    }

    // ---- WATER TOWER: shoot the tank, get a monsoon (and a sniper deck) ----
    for (const [wtx, wtz] of [[-35, -3], [-33, -3], [-35, -1], [-33, -1]])
      buildPost(wtx, wtz, 4.2, 0.26, 0, steelGeos);
    buildPlatform(-34, -2, 3.8, 3.8, 4.2, 0.18);
    addLadder(-34, -0.05, 0, 4.2, 's');
    addProp('watertank', -34, 4.25, -2, 2.5, 2.4, 2.5, T.container, 0x6aa7d8, 260, { metal: true });
    // ---- cement silos: two very large, very poppable landmarks ----
    addProp('silo', -13.5, 0, 8.5, 2.4, 6.5, 2.4, T.container, 0xdad8d2, 220, { metal: true });
    addProp('silo', -13.5, 0, 12.5, 2.4, 6.5, 2.4, T.container, 0xcac8c2, 220, { metal: true });
    // ---- long half-built block wall (big shreddable cover mid-map) ----
    const lbw = WallGrid({ ox: -16, oy: 0, oz: 15, dir: 'x', cols: 14, rows: 3, cw: 1, ch: 0.62, th: 0.26, kind: 'block', tint: 0xd0cabb, hp: 45, house: null });
    wallFill(lbw, (c, r) => (c === 4 || c === 5) && r <= 2 ? 1 : (c >= 9 && c <= 10) && r === 2 ? 1 : (c === 13 && r === 2) ? 1 : 0);

    W.spawnPoints = [
      { x: -40, z: 0 }, { x: 40, z: 0 }, { x: -40, z: -28 }, { x: -40, z: 28 },
      { x: 40, z: -28 }, { x: 40, z: 28 }, { x: 0, z: -32 }, { x: 0, z: 32 },
      { x: -20, z: -30 }, { x: 20, z: 30 }, { x: 34, z: 14 }, { x: -34, z: -4 },
      { x: -6, z: 30 }, { x: 30, z: -28 },
    ];
    W.campSpots.push(
      { x: -27, z: -18, yaw: Math.PI / 2 },
      { x: -2, z: 20, yaw: Math.PI / 2 },
      { x: 31, z: 19, yaw: Math.atan2(-31, -19) },
      { x: 14, z: 13.8, yaw: Math.PI },
    );
    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#a97d4f';
      x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = '#b3b7bb';
      x.fillRect(0, (oz - 2.6) * s, (ox + 10) * s, 5.2 * s);
      x.fillStyle = '#9c9c98';
      x.fillRect((ox + 5) * s, (oz - 12) * s, 26 * s, 24 * s);
    };
    addSky(0x8fc4e8, { cloudTint: 0xf2ead8 });
  }

  // ============ MAP 3: VOLCANO ISLAND — sunset, geysers, angry mountain ============
  function buildIslandMap() {
    W.bounds = { x: 40, z: 34 };
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
    plane(460, 460, T.water(), 0, -0.06, 0).material.map.repeat.set(34, 34);
    // invisible boundary (the sea is off-limits)
    addCollider(-46, 0, -38, -40.4, 6, 38, { noShoot: true });
    addCollider(40.4, 0, -38, 46, 6, 38, { noShoot: true });
    addCollider(-46, 0, -38, 46, 6, -34.4, { noShoot: true });
    addCollider(-46, 0, 34.4, 46, 6, 38, { noShoot: true });

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
    addProp('hal', 6, 1.4, -12.6, 1.0, 2.1, 0.28, T.hal, 0xffffff, 120, { metal: true });
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

    // ---- live station: rotating dish, micrometeor showers ----
    let meteorT = 30;
    const meteorBombs = [];
    const hullPoints = [
      [31, 8.6, -10], [25, 8.6, 10], [-30, 7.3, -8], [-36, 7.3, 8], [0, 8.7, -13], [8, 8.7, 13],
      [-4, 6.2, -26], [5, 6.2, -30], [-6, 5.8, 24], [3, 5.8, 31], [13, 4.3, 0], [0, 4.3, -16],
      [38, 22.6, -44], [28, 22.6, -34], [48, 22.6, -30], [38, 22.6, -24], // the wheel takes hits too
      [-34, -8.2, 30], [-26, 24.8, -26], // and the small craft
    ];
    W.mapUpdate = function (dt) {
      dish.rotation.y += dt * 0.5;
      if (!(G.net && G.net.active && !G.net.isHost)) {
        meteorT -= dt;
        if (meteorT <= 0) {
          meteorT = 34 + U.rand(0, 18);
          if (G.game) {
            G.game.banner('MICROMETEOR SHOWER', '#9fd4ff');
            G.game.chat('MERIDIAN OPS', U.pick(['brace brace brace', 'hull insurance does NOT cover this', 'incoming debris field']));
          }
          for (let i = 0; i < 3; i++) {
            const p = hullPoints[Math.floor(Math.random() * hullPoints.length)];
            meteorBombs.push({ x: p[0] + U.rand(-2, 2), y: p[1], z: p[2] + U.rand(-2, 2), t: 1.0 + i * 0.6 });
          }
        }
        for (let i = meteorBombs.length - 1; i >= 0; i--) {
          const b = meteorBombs[i];
          b.t -= dt;
          if (b.t <= 0) {
            meteorBombs.splice(i, 1);
            tmpV.set(b.x, b.y, b.z);
            W.explode(tmpV, 4.2, 70, { attacker: { name: 'A METEORITE', team: -1 }, tag: 'METEORITE' });
            if (G.net && G.net.active) G.net.evBoom(tmpV, 4.2, 70, 'METEORITE');
          }
        }
      }
    };
  }

  // ============ MAP 5: DOWNTOWN — glass, concrete, and the sound of both breaking ============
  function buildCityMap() {
    W.bounds = { x: 60, z: 50 };
    W.teamSpawns = [{ x: -54, z: 0 }, { x: 54, z: 0 }];

    // concrete city floor + streets
    plane(460, 460, T.sidewalk(), 0, 0, 0).material.map.repeat.set(80, 80);
    plane(122, 12, T.road(), 0, 0.02, 0).material.map.repeat.set(14, 1);
    const cross = plane(102, 8, T.road(), 0, 0.023, 0);
    cross.rotation.z = Math.PI / 2;
    cross.material.map.repeat.set(12, 1);
    // plaza pavement (split around the two metro stair pits)
    plane(26, 17.4, T.driveway(), 27, 0.026, -29.3).material.map.repeat.set(8, 5);
    plane(4.7, 5.3, T.driveway(), 16.35, 0.026, -17.95);
    plane(10.2, 5.3, T.driveway(), 26.6, 0.026, -17.95);
    plane(5.5, 5.3, T.driveway(), 37.25, 0.026, -17.95);
    plane(26, 3.3, T.driveway(), 27, 0.026, -13.65);

    // invisible city limits
    addCollider(-66, 0, -54, -60.4, 20, 54, { noShoot: true });
    addCollider(60.4, 0, -54, 66, 20, 54, { noShoot: true });
    addCollider(-66, 0, -54, 66, 20, -50.4, { noShoot: true });
    addCollider(-66, 0, 50.4, 66, 20, 54, { noShoot: true });

    const CITY = (o, dir, cols, rows, fn, tint, hp) => {
      const wl = WallGrid({ ...o, oy: 0, dir, cols, rows, cw: 1, ch: 0.72, th: 0.3, kind: 'city', tint: tint || 0xd8dde4, hp: hp || 60, house: null });
      wallFill(wl, fn);
    };
    // office window bands: two glass rows per 5-row floor, skipping every 3rd column
    const win = (extra) => (c, r) => {
      if (extra) { const e = extra(c, r); if (e !== undefined) return e; }
      return (r % 5 === 2 || r % 5 === 3) && c % 3 !== 0 ? 3 : 0;
    };

    // ---- TOWER A "PINNACLE" — 5 glass floors, stairwell core, fire escape ----
    // walls (south lobby doors + skybridge doorway at floor 3)
    CITY({ ox: -44, oz: 10 }, 'x', 24, 25, win((c, r) => {
      if (c >= 10 && c <= 13 && r <= 3) return 1;                 // lobby doors
      if (c >= 9 && c <= 12 && r >= 15 && r <= 18) return 1;      // skybridge doorway
    }));
    CITY({ ox: -44, oz: 36 }, 'x', 24, 25, win());
    CITY({ ox: -44, oz: 10 }, 'z', 26, 25, win());
    CITY({ ox: -20, oz: 10 }, 'z', 26, 25, win((c, r) => { if (c >= 12 && c <= 13 && r <= 3) return 1; })); // east door
    // floors (with alternating stairwell holes on the west edge)
    for (let L = 1; L <= 5; L++) {
      const y = 3.6 * L;
      buildPlatform(-30.5, 23, 20.6, 25.4, y, 0.3);               // main deck (x -40.8..-20.2)
      const holeLo = (L % 2 === 1);                                // odd floors: hole at the south run
      if (holeLo) {
        buildPlatform(-42.25, 26.75, 2.9, 18.1, y, 0.3);          // strip z 17.7..35.8
        buildPlatform(-42.25, 11.15, 2.9, 1.7, y, 0.3);           // stub z 10.3..12
      } else {
        buildPlatform(-42.25, 19.25, 2.9, 16.1, y, 0.3);          // strip z 11.2..27.3? (z 10.3..28.3)
        buildPlatform(-42.25, 35, 2.9, 1.6, y, 0.3);              // stub z 34.2..35.8
      }
    }
    // stairs: switchback flights up the west edge
    for (let f = 0; f < 5; f++) {
      if (f % 2 === 0) buildStairs(-42.3, 12.5, 0, 1, 3.2, 10, 0.36, 0.52, 3.6 * f);
      else buildStairs(-42.3, 33.5, 0, -1, 3.2, 10, 0.36, 0.52, 3.6 * f);
    }
    // interior office clutter + plywood partitions (floors 1-3)
    for (let L = 1; L <= 3; L++) {
      const y = 3.6 * L;
      const part = WallGrid({ ox: -36, oy: y, oz: 22 + (L % 2) * 4, dir: 'x', cols: 12, rows: 2, cw: 1, ch: 0.85, th: 0.12, kind: 'plank', tint: 0xcfd2d8, hp: 16, house: null });
      wallFill(part, (c) => (c >= 5 && c <= 6) ? 1 : 0);
      addProp('desk', -34 + (L % 2) * 6, y, 18, 2.2, 1.0, 0.9, T.console, 0x4a5262, 40, {});
      addProp('desk', -27, y, 30 - (L % 2) * 6, 2.2, 1.0, 0.9, T.console, 0x4a5262, 40, {});
      addProp('copier', -23, y, 14 + L * 2, 1.0, 1.2, 0.8, T.plain, 0xe8eaee, 30, { metal: true });
      addProp('planter', -38, y, 33, 1.1, 0.8, 1.1, T.plain, 0x9a4f3f, 25, {});
    }
    addProp('vend', -21.6, 0, 32, 1.2, 2.0, 0.9, T.container, 0xc23b4e, 60, { metal: true });
    addProp('desk', -32, 0, 28, 2.6, 1.05, 1.0, T.console, 0x3a4252, 50, {}); // lobby reception
    addProp('planter', -40, 0, 12.5, 1.1, 0.8, 1.1, T.plain, 0x9a4f3f, 25, {});
    addProp('planter', -24, 0, 12.5, 1.1, 0.8, 1.1, T.plain, 0x9a4f3f, 25, {});
    // fire escape: south face balconies + chained ladders to the roof
    for (let L = 0; L <= 4; L++) buildPlatform(-31.7, 36.9, 3.0, 1.5, 3.6 * (L + 1) - (L === 4 ? 0 : 0), 0.16);
    for (let L = 0; L < 5; L++) addLadder(-31.7, 37.75, 3.6 * L, 3.6 * (L + 1), 's');
    // roof: helipad, water tower, ducts, parapet
    plane(10, 10, T.driveway(), -30, 18.06, 23);
    for (const [wtx2, wtz2] of [[-38.6, 15.4], [-36.4, 15.4], [-38.6, 17.6], [-36.4, 17.6]]) buildPost(wtx2, wtz2, 2.6, 0.2, 18.0, steelGeos);
    buildPlatform(-37.5, 16.5, 2.9, 2.9, 20.6, 0.16);
    addProp('watertank', -37.5, 20.7, 16.5, 2.2, 2.1, 2.2, T.container, 0x8a6a4a, 220, { metal: true });
    addProp('acduct', -25, 18.0, 15, 1.6, 1.1, 1.3, T.plain, 0xaab2ba, 40, { metal: true });
    addProp('acduct', -23, 18.0, 31, 1.6, 1.1, 1.3, T.plain, 0xaab2ba, 40, { metal: true });
    addProp('dish', -34, 18.0, 33.5, 0.9, 0.9, 0.9, T.console, 0x8a94a4, 45, { metal: true });
    const parA = WallGrid({ ox: -44, oy: 18.0, oz: 10.1, dir: 'x', cols: 24, rows: 1, cw: 1, ch: 0.55, th: 0.25, kind: 'city', tint: 0xc4cad2, hp: 40, house: null });
    wallFill(parA, () => 0);
    const parA2 = WallGrid({ ox: -44, oy: 18.0, oz: 35.9, dir: 'x', cols: 24, rows: 1, cw: 1, ch: 0.55, th: 0.25, kind: 'city', tint: 0xc4cad2, hp: 40, house: null });
    wallFill(parA2, () => 0);
    W.campSpots.push({ x: -32, z: 26, yaw: Math.PI }, { x: -39, z: 13, yaw: Math.PI / 2 });

    // ---- TOWER B "EXCHANGE" — 4 brick floors, billboard on the roof ----
    CITY({ ox: -44, oz: -16 }, 'x', 20, 20, win((c, r) => {
      if (c >= 8 && c <= 11 && r <= 3) return 1;                  // north lobby doors
      if (c >= 9 && c <= 12 && r >= 15 && r <= 18) return 1;      // skybridge doorway
    }), 0xc09070);
    CITY({ ox: -44, oz: -38 }, 'x', 20, 20, win(), 0xc09070);
    CITY({ ox: -44, oz: -38 }, 'z', 22, 20, win(), 0xc09070);
    CITY({ ox: -24, oz: -38 }, 'z', 22, 20, win((c, r) => { if (c >= 10 && c <= 11 && r <= 3) return 1; }), 0xc09070);
    for (let L = 1; L <= 4; L++) {
      const y = 3.6 * L;
      buildPlatform(-32.4, -27, 16.6, 21.4, y, 0.3);              // main deck (x -40.7..-23.8)
      if (L % 2 === 1) { // odd floors: stairwell hole over the south flight
        buildPlatform(-42.35, -23.4, 3.1, 14.0, y, 0.3);          // strip z -30.4..-16.4
        buildPlatform(-42.35, -36.75, 3.1, 1.7, y, 0.3);          // stub z -37.6..-35.9
      } else {           // even floors: hole over the north flight
        buildPlatform(-42.35, -30.85, 3.1, 13.5, y, 0.3);         // strip z -37.6..-24.1
        buildPlatform(-42.35, -17.1, 3.1, 1.4, y, 0.3);           // stub z -17.8..-16.4
      }
    }
    for (let f = 0; f < 4; f++) {
      if (f % 2 === 0) buildStairs(-42.3, -35.5, 0, 1, 3.2, 10, 0.36, 0.52, 3.6 * f);
      else buildStairs(-42.3, -18.5, 0, -1, 3.2, 10, 0.36, 0.52, 3.6 * f);
    }
    for (let L = 1; L <= 3; L++) {
      const y = 3.6 * L;
      addProp('desk', -34, y, -32 + L * 3, 2.2, 1.0, 0.9, T.console, 0x5a4a42, 40, {});
      addProp('crate', -27, y, -20 - L * 2, 1.2, 1.0, 1.2, T.plain, 0xb08a50, 30, {});
    }
    addProp('vend', -25.5, 0, -36.3, 1.2, 2.0, 0.9, T.container, 0x3f6fd0, 60, { metal: true });
    addProp('desk', -33, 0, -22, 2.6, 1.05, 1.0, T.console, 0x3a4252, 50, {});
    // east fire escape
    for (let L = 0; L <= 3; L++) buildPlatform(-23.1, -26.7, 1.5, 3.0, 3.6 * (L + 1), 0.16);
    for (let L = 0; L < 4; L++) addLadder(-22.25, -26.7, 3.6 * L, 3.6 * (L + 1), 'e');
    // roof: THE BILLBOARD + ducts
    addProp('billboard', -34, 14.4, -17.6, 6.6, 3.4, 0.4, T.billboard, 0xffffff, 90, {});
    addProp('acduct', -28, 14.4, -30, 1.6, 1.1, 1.3, T.plain, 0xaab2ba, 40, { metal: true });
    addProp('cell', -40, 14.4, -34, 0.7, 1.2, 0.7, T.propane, 0xbfe8ff, 16, { metal: true });
    W.campSpots.push({ x: -34, z: -26, yaw: 0 });

    // ---- SKYBRIDGE (floor 3): glass tube over the avenue — shoot it out ----
    for (const bz of [-13.6, -9.4, -5.2, -1, 3.2, 7.4])
      addProp('tile', -33, 10.52, bz, 3.1, 0.28, 4.15, T.hullFloor, 0xcfd6de, 60, { step: true });
    const railW = WallGrid({ ox: -34.55, oy: 10.8, oz: -15.7, dir: 'z', cols: 26, rows: 2, cw: 1, ch: 0.62, th: 0.14, kind: 'city', tint: 0xc4ccd6, hp: 30, house: null });
    wallFill(railW, (c, r) => r === 1 ? 3 : 0);
    const railE = WallGrid({ ox: -31.45, oy: 10.8, oz: -15.7, dir: 'z', cols: 26, rows: 2, cw: 1, ch: 0.62, th: 0.14, kind: 'city', tint: 0xc4ccd6, hp: 30, house: null });
    wallFill(railE, (c, r) => r === 1 ? 3 : 0);

    // ---- CONSTRUCTION HIGH-RISE (east): open steel decks, crane, ladders ----
    for (const cx3 of [19, 28, 37])
      for (const cz3 of [15, 24, 33]) buildPost(cx3, cz3, 13.4, 0.55, 0, steelGeos);
    buildPlatform(28, 24, 20, 20, 4.4, 0.35);
    buildPlatform(28, 24, 20, 20, 8.8, 0.35);
    buildPlatform(28, 24, 20, 20, 13.2, 0.35);
    for (let L = 0; L < 3; L++) addLadder(23, 13.85, 4.4 * L, 4.4 * (L + 1), 'n');
    const fr1 = WallGrid({ ox: 18, oy: 4.4, oz: 33.9, dir: 'x', cols: 20, rows: 5, cw: 1, ch: 0.72, th: 0.14, kind: 'frame', tint: 0xd8b075, hp: 18, house: null });
    wallFill(fr1, (c, r) => r === 4 ? 0 : (c >= 8 && c <= 11) ? 1 : c % 2 === 0 ? 0 : 1);
    const fr2 = WallGrid({ ox: 37.9, oy: 4.4, oz: 14, dir: 'z', cols: 20, rows: 5, cw: 1, ch: 0.72, th: 0.14, kind: 'frame', tint: 0xd8b075, hp: 18, house: null });
    wallFill(fr2, (c, r) => r === 4 ? 0 : c % 2 === 0 ? 0 : 1);
    const ply3 = WallGrid({ ox: 18, oy: 8.8, oz: 14.1, dir: 'x', cols: 12, rows: 2, cw: 1, ch: 0.8, th: 0.12, kind: 'plank', tint: 0xd8b075, hp: 14, house: null });
    wallFill(ply3, (c) => c % 5 === 4 ? 1 : 0);
    const gr2 = WallGrid({ ox: 18, oy: 13.2, oz: 23.9, dir: 'x', cols: 20, rows: 1, cw: 1, ch: 0.8, th: 0.1, kind: 'plank', tint: 0xc9a05f, hp: 14, house: null });
    wallFill(gr2, (c) => (c >= 9 && c <= 11) ? 1 : 0);
    addProp('barrel', 21, 4.75, 30, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('lumber', 33, 4.75, 18, 2.3, 0.55, 1.1, T.plain, 0xc9a05f, 30, {});
    addProp('pallet', 25, 8.95, 20, 1.6, 1.1, 1.6, T.brick, 0xc27a5a, 70, {});
    addProp('barrel', 34, 13.55, 30, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('mixer', 16, 0, 11, 1.5, 1.6, 1.2, T.plain, 0xd07030, 90, { metal: true });
    addProp('barrel', 40.5, 0, 17, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrel', 41.6, 0, 18.2, 0.7, 1.05, 0.7, T.propane, 0xc23b2e, 20, { metal: true });
    addProp('barrier', 12, 0, 14, 1.8, 0.95, 0.35, T.hazard, 0xffffff, 20, {});
    addProp('barrier', 12, 0, 24, 1.8, 0.95, 0.35, T.hazard, 0xffffff, 20, {});
    // tower crane hoisting a girder bundle over the decks
    (() => { const g = U.shadedBoxGeo(3, 1.2, 3); g.translate(45, 0.6, 40); steelGeos.push(g); })();
    addCollider(43.5, 0, 38.5, 46.5, 1.2, 41.5, { metal: true });
    for (const [mx3, mz3] of [[44.1, 39.1], [45.9, 39.1], [44.1, 40.9], [45.9, 40.9]])
      buildPost(mx3, mz3, 16.3, 0.3, 1.2, steelGeos);
    addLadder(45, 41.35, 0, 17.5, 's');
    buildPlatform(45, 40, 3, 3, 17.5, 0.25);
    buildPlatform(36, 40, 21, 1.3, 17.65, 0.22); // jib toward the site
    (() => { const g = U.shadedBoxGeo(0.1, 6.2, 0.1); g.translate(29, 14.4, 40); steelGeos.push(g); })();
    addProp('lumber', 29, 10.9, 40, 3.2, 0.5, 0.9, T.plain, 0x8a94a4, 35, { metal: true });
    addProp('lumber', 29, 11.5, 40, 3.2, 0.5, 0.9, T.plain, 0x6a7484, 35, { metal: true });
    W.campSpots.push({ x: 28, z: 28, yaw: Math.PI }, { x: 14.5, z: 12, yaw: -2.2 });

    // ---- PLAZA + THE METRO BENEATH IT ----
    addProp('fountain', 27, 0, -25, 3.4, 1.15, 3.4, T.plain, 0xbfc9d4, 140, {});
    plane(5.2, 5.2, T.water(), 27, 0.03, -25);
    addProp('moai', 34, 0, -31, 1.6, 3.0, 1.6, T.tiki, 0x9aa2ae, 200, {}); // The Founder
    addProp('cart', 18, 0, -17.5, 1.9, 1.6, 1.1, T.plain, 0xc23b2e, 40, { metal: true });
    addProp('cart', 37, 0, -14.8, 1.9, 1.6, 1.1, T.plain, 0xe8b83e, 40, { metal: true });
    addProp('bench', 21, 0, -31, 1.7, 0.55, 0.6, T.plain, 0x8a5f3f, 25, {});
    addProp('bench', 33, 0, -20.5, 1.7, 0.55, 0.6, T.plain, 0x8a5f3f, 25, {});
    addProp('planter', 15.5, 0, -30, 1.1, 0.8, 1.1, T.plain, 0x9a4f3f, 25, {});
    addProp('planter', 39, 0, -35, 1.1, 0.8, 1.1, T.plain, 0x9a4f3f, 25, {});
    for (const [lx2, lz2] of [[16, -14], [38, -32]]) {
      buildPost(lx2, lz2, 5.2, 0.17, 0, steelGeos);
      (() => { const g = U.shadedBoxGeo(0.7, 0.35, 0.35); g.translate(lx2, 5.3, lz2); steelGeos.push(g); })();
    }
    // metro hall (y -4.2), two stair pits up to the plaza
    plane(18, 18, T.sidewalk(), 27, -4.19, -25).material.map.repeat.set(7, 7);
    slabs.push({ minx: 18, minz: -34, maxx: 36, maxz: -16, top: -4.2 });
    const MET = (o, dir, cols, fn) => {
      const wl = WallGrid({ ...o, oy: -4.2, dir, cols, rows: 6, cw: 1, ch: 0.72, th: 0.3, kind: 'city', tint: 0xd0c8b0, hp: 55, house: null });
      wallFill(wl, fn);
    };
    MET({ ox: 18, oz: -16 }, 'x', 18, (c, r) => (c >= 1 && c <= 3) || (c >= 14 && c <= 16) ? 1 : 0); // stair openings
    MET({ ox: 18, oz: -34 }, 'x', 18, () => 0);
    MET({ ox: 18, oz: -34 }, 'z', 18, () => 0);
    MET({ ox: 36, oz: -34 }, 'z', 18, () => 0);
    buildStairs(20, -19.9, 0, 1, 2.2, 9, 0.47, 0.5, -4.2);
    buildStairs(33, -19.9, 0, 1, 2.2, 9, 0.47, 0.5, -4.2);
    // street deck over the hall (walkable, with the two stair pits open)
    addCollider(18, -0.35, -34, 36, 0, -20.6, { step: true });
    addCollider(21.4, -0.35, -20.6, 31.6, 0, -15.6, { step: true });
    addCollider(18, -0.35, -20.6, 18.7, 0, -15.6, { step: true });
    addCollider(34.3, -0.35, -20.6, 36, 0, -15.6, { step: true });
    // the base ground plane is CUT under the hall (the pits are real holes)
    groundHoles.push({ minx: 18, minz: -34, maxx: 36, maxz: -16 });
    // invisible nav fences: bots don't wander into the pits (players can)
    addCollider(18.7, 0.6, -20.6, 21.4, 1.5, -15.6, { noWalk: true, noShoot: true });
    addCollider(31.6, 0.6, -20.6, 34.3, 1.5, -15.6, { noWalk: true, noShoot: true });
    // platform furniture + the 6 train
    for (const [px7, pz7] of [[22, -23], [27, -23], [32, -23]]) buildPost(px7, pz7, 4.1, 0.34, -4.2, steelGeos);
    plane(16, 3.6, T.road(), 27, -4.18, -28.6).material.map.repeat.set(5, 1);
    addProp('train', 23, -4.2, -28.6, 7, 2.6, 2.4, T.container, 0xd8b23e, 400, { metal: true });
    addProp('train', 31.5, -4.2, -28.6, 7, 2.6, 2.4, T.container, 0xc23b2e, 400, { metal: true });
    addProp('bench', 22, -4.2, -18.5, 1.7, 0.55, 0.6, T.plain, 0x6a7484, 25, {});
    addProp('bench', 30, -4.2, -18.5, 1.7, 0.55, 0.6, T.plain, 0x6a7484, 25, {});
    addProp('vend', 35.2, -4.2, -22, 1.2, 2.0, 0.9, T.container, 0x3f8f5f, 60, { metal: true });
    addProp('kiosk', 26, -4.2, -20, 1.5, 1.9, 1.2, T.container, 0x8a5fd0, 60, { metal: true });

    // ---- SHOPS ROW (north): storefront glass + walkable roof ----
    CITY({ ox: -12, oz: 40 }, 'x', 26, 5, (c, r) => {
      if ((c === 4 || c === 5 || c === 18 || c === 19) && r <= 3) return 1;  // doors
      return (r >= 1 && r <= 3 && c % 4 !== 3) ? 3 : 0;                       // storefront glass
    }, 0xd9cdb8);
    CITY({ ox: -12, oz: 48 }, 'x', 26, 5, (c, r) => (c === 12 && r <= 3) ? 1 : 0, 0xd9cdb8);
    CITY({ ox: -12, oz: 40 }, 'z', 8, 5, () => 0, 0xd9cdb8);
    CITY({ ox: 14, oz: 40 }, 'z', 8, 5, () => 0, 0xd9cdb8);
    buildPlatform(1, 44, 25.4, 7.4, 3.75, 0.25);
    addLadder(13.3, 48.35, 0, 3.75, 's');
    addProp('acduct', -6, 3.75, 44, 1.6, 1.1, 1.3, T.plain, 0xaab2ba, 40, { metal: true });
    addProp('acduct', 8, 3.75, 45, 1.6, 1.1, 1.3, T.plain, 0xaab2ba, 40, { metal: true });
    addProp('desk', -6, 0, 42.4, 2.4, 1.05, 0.9, T.console, 0x3a4252, 50, {});
    addProp('desk', 7, 0, 42.4, 2.4, 1.05, 0.9, T.console, 0x3a4252, 50, {});
    addProp('vend', -10.8, 0, 46.5, 1.2, 2.0, 0.9, T.container, 0xc23b4e, 60, { metal: true });
    addProp('vend', 12.6, 0, 46.5, 1.2, 2.0, 0.9, T.container, 0xe8a23e, 60, { metal: true });
    addProp('shelf', 0, 0, 46.8, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('shelf', 3, 0, 46.8, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    W.campSpots.push({ x: 1, z: 44, yaw: Math.PI });

    // ---- STREET LIFE ----
    buildCar(-16, 3, true, 0x9aa0a6);
    buildCar(8, -3, true, 0x3b6bd6);
    buildCar(34, 3, true, 0xe8e8e8);
    buildCar(3, 22, false, 0xc84040);
    buildCar(-3, -26, false, 0x8040c0);
    addProp('bus', -28, 0, -3, 6.2, 2.5, 2.2, T.container, 0xe8a23e, 220, { metal: true });
    addProp('hydrant', 8, 0, 8, 0.5, 0.95, 0.5, T.hydrant, 0xffffff, 30, { metal: true });
    addProp('hydrant', -8, 0, -8, 0.5, 0.95, 0.5, T.hydrant, 0xffffff, 30, { metal: true });
    addProp('trash', -14, 0, 7.4, 0.65, 1.05, 0.65, T.trash, 0xffffff, 15, { metal: true });
    addProp('trash', 16, 0, -7.4, 0.65, 1.05, 0.65, T.trash, 0xffffff, 15, { metal: true });
    addProp('cart', -8, 0, 8.6, 1.9, 1.6, 1.1, T.plain, 0x4a8f3f, 40, { metal: true });

    W.spawnPoints = [
      { x: -54, z: 0 }, { x: 54, z: 0 }, { x: -54, z: -30 }, { x: -54, z: 30 },
      { x: 54, z: -30 }, { x: 54, z: 30 }, { x: 0, z: -44 }, { x: 0, z: 37 },
      { x: -34, z: 44 }, { x: 30, z: 44 }, { x: 46, z: -8 }, { x: -12, z: -44 },
      { x: 8, z: 20 }, { x: 44, z: -40 },
    ];
    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#3a3d44';
      x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = '#23252a';
      x.fillRect(0, (oz - 6) * s, 144 * s, 12 * s);
      x.fillRect((ox - 4) * s, 0, 8 * s, 116 * s);
      x.fillStyle = '#565b64';
      x.fillRect((ox + 14) * s, (oz - 38) * s, 26 * s, 26 * s);
    };
    addSky(0xffa964, { cloudTint: 0xffd9b8, sunTint: 0xffc24a, sunPos: [140, 52, 70], sunScale: 34 });
  }

  // ============ MAP 6: THE MUSEUM — priceless. was priceless. ============
  function buildMuseumMap() {
    W.bounds = { x: 42, z: 34 };
    W.teamSpawns = [{ x: -38, z: 0 }, { x: 38, z: 0 }];
    W.alarmT = 0;

    // lawn + walkway up to the entrance
    plane(460, 460, T.grass(), 0, 0, 0).material.map.repeat.set(70, 70);
    plane(8, 22, T.sidewalk(), 0, 0.02, 23).material.map.repeat.set(3, 8);
    plane(70, 52, T.driveway(), 0, 0.018, -3).material.map.repeat.set(20, 15); // museum slab
    addCollider(-48, 0, -40, -42.4, 8, 40, { noShoot: true });
    addCollider(42.4, 0, -40, 48, 8, 40, { noShoot: true });
    addCollider(-48, 0, -40, 48, 8, -34.4, { noShoot: true });
    addCollider(-48, 0, 34.4, 48, 8, 40, { noShoot: true });

    const MRB = (o, dir, cols, rows, fn, tint, hp) => {
      const wl = WallGrid({ ...o, oy: 0, dir, cols, rows, cw: 1, ch: 0.72, th: 0.3, kind: 'marble', tint: tint || 0xf2f0ea, hp: hp || 55, house: null });
      wallFill(wl, fn);
    };
    // ---- GRAND HALL (x -15..15, z -12..12), glass skylight roof ----
    MRB({ ox: -15, oz: 12 }, 'x', 30, 10, (c, r) => (c >= 12 && c <= 17 && r <= 4) ? 1 : (r >= 7 && r <= 8 && c % 2 === 0) ? 3 : 0); // grand entrance
    MRB({ ox: -15, oz: -12 }, 'x', 30, 10, (c, r) => (c >= 13 && c <= 16 && r <= 3) ? 1 : (r >= 7 && r <= 8 && c % 2 === 0) ? 3 : 0); // to art wing
    MRB({ ox: -15, oz: -12 }, 'z', 24, 10, (c, r) => (c >= 10 && c <= 13 && r <= 3) ? 1 : (r >= 7 && r <= 8 && c % 2 === 0) ? 3 : 0); // to egypt
    MRB({ ox: 15, oz: -12 }, 'z', 24, 10, (c, r) => (c >= 10 && c <= 13 && r <= 3) ? 1 : (r >= 7 && r <= 8 && c % 2 === 0) ? 3 : 0);  // to science
    const sky = Sheet('glass', 0xffffff);
    for (let gx = 0; gx < 15; gx++)
      for (let gz = 0; gz < 12; gz++)
        sheetAdd(sky, -15 + 1 + gx * 2, 7.65 + Math.sin(gx / 14 * Math.PI) * 0.8, -12 + 1 + gz * 2, 0, 'x', 2.02, 0.1, 2.02, 8);
    // portico columns out front
    for (const px8 of [-9, -4.5, 4.5, 9]) {
      buildPost(px8, 14.2, 6.4, 0.7, 0, stairGeos);
      addProp('rope', px8 - 2.2, 0, 14.2, 1.6, 0.75, 0.12, T.plain, 0x8a2a3e, 8, { noWalk: true });
    }
    // ---- SUE JR. — the t-rex (every bone is a five-figure lawsuit) ----
    buildPlatform(0, 0, 8.5, 4.4, 0.35, 0.35);
    const bone = (x, y, z, sx, sy, sz) => addProp('fossil', x, y, z, sx, sy, sz, T.plain, 0xe8e2d0, 45, {});
    bone(-1.2, 0.35, -0.9, 0.55, 2.3, 0.7);   // legs
    bone(-1.2, 0.35, 0.9, 0.55, 2.3, 0.7);
    bone(-0.2, 2.55, 0, 3.6, 1.0, 1.1);       // spine + ribcage
    bone(-0.4, 1.55, 0, 2.0, 1.05, 1.5);
    bone(1.9, 2.9, 0, 1.3, 0.8, 0.75);        // neck
    bone(3.0, 3.3, 0, 1.7, 1.05, 0.95);       // skull
    bone(-2.6, 2.2, 0, 1.6, 0.55, 0.6);       // tail
    bone(-3.9, 1.7, 0, 1.4, 0.45, 0.5);
    for (const [rx2, rz2] of [[-3.4, -2.6], [0, -2.6], [3.4, -2.6], [-3.4, 2.6], [0, 2.6], [3.4, 2.6]])
      addProp('rope', rx2, 0, rz2, 1.9, 0.75, 0.12, T.plain, 0x8a2a3e, 8, { noWalk: true });
    // gallery mezzanine ring + two staircases + maintenance ladder
    buildPlatform(0, -10, 27, 3.6, 3.6, 0.25);
    buildPlatform(-13.2, -1.5, 3.4, 13.6, 3.6, 0.25);
    buildPlatform(13.2, -1.5, 3.4, 13.6, 3.6, 0.25);
    buildStairs(-13.1, 6.2, 0, -1, 3.0, 10, 0.36, 0.5);
    buildStairs(13.1, 6.2, 0, -1, 3.0, 10, 0.36, 0.5);
    addLadder(0.5, -8.05, 0, 3.6, 's'); // maintenance ladder up to the north gallery
    const mzr2 = WallGrid({ ox: -11.5, oy: 3.6, oz: -8.05, dir: 'x', cols: 23, rows: 1, cw: 1, ch: 0.8, th: 0.1, kind: 'plank', tint: 0xb8912e, hp: 14, house: null });
    wallFill(mzr2, (c) => (c >= 10 && c <= 12) ? 1 : 0);
    for (const sgn of [-1, 1]) {
      const r2 = WallGrid({ ox: sgn * 11.4, oy: 3.6, oz: -8, dir: 'z', cols: 9, rows: 1, cw: 1, ch: 0.8, th: 0.1, kind: 'plank', tint: 0xb8912e, hp: 14, house: null });
      wallFill(r2, (c) => c >= 7 ? 1 : 0);
    }
    // upstairs paintings + cases
    addProp('painting', -9, 4.8, -11.7, 1.7, 1.3, 0.14, T.painting, 0xffffff, 20, {});
    addProp('painting', 3, 4.8, -11.7, 1.7, 1.3, 0.14, T.painting, 0xffffff, 20, {});
    addProp('case', -8, 3.6, -9.6, 0.9, 1.5, 0.9, T.glassTex, 0xdff2ff, 12, { glassy: true });
    addProp('relic', -8, 3.72, -9.6, 0.45, 0.5, 0.45, T.plain, 0xd8b23e, 20, {});

    // ---- EGYPT WING (west) ----
    MRB({ ox: -33, oz: -10 }, 'x', 18, 7, (c, r) => (r === 4 && c % 3 === 1) ? 3 : 0, 0xd8c090);
    MRB({ ox: -33, oz: 10 }, 'x', 18, 7, (c, r) => (r === 4 && c % 3 === 1) ? 3 : 0, 0xd8c090);
    MRB({ ox: -33, oz: -10 }, 'z', 20, 7, () => 0, 0xd8c090);
    tileGridM(-33, -10, -15, 10, 5.05);
    addProp('obelisk', -24, 0, 0, 1.1, 4.6, 1.1, T.plain, 0xc9a55f, 120, {});
    addProp('sarcoph', -29, 0, -6, 2.5, 1.5, 1.2, T.plain, 0xd8b23e, 90, {});
    addProp('sarcoph', -29, 0, 6, 2.5, 1.5, 1.2, T.plain, 0xc9a05f, 90, {});
    addProp('case', -19, 0, -6.5, 0.9, 1.6, 0.9, T.glassTex, 0xdff2ff, 12, { glassy: true });
    addProp('jar', -19, 0.15, -6.5, 0.42, 0.6, 0.42, T.plain, 0x9a6b3f, 15, {});
    addProp('jar', -20.8, 0, 7.6, 0.5, 0.75, 0.5, T.plain, 0x8a5f2f, 15, {});
    addProp('jar', -17.6, 0, 7.9, 0.5, 0.7, 0.5, T.plain, 0xa9713d, 15, {});
    addProp('painting', -32.8, 2.2, -3, 0.14, 1.4, 1.9, T.painting, 0xffffff, 20, {});
    addProp('painting', -32.8, 2.2, 3, 0.14, 1.4, 1.9, T.painting, 0xffffff, 20, {});
    W.campSpots.push({ x: -29, z: 0, yaw: Math.PI / 2 });

    // ---- SCIENCE WING (east): the meteorite has feelings ----
    MRB({ ox: 15, oz: -10 }, 'x', 18, 7, (c, r) => (r === 4 && c % 3 === 1) ? 3 : 0, 0xcfd6de);
    MRB({ ox: 15, oz: 10 }, 'x', 18, 7, (c, r) => (r === 4 && c % 3 === 1) ? 3 : 0, 0xcfd6de);
    MRB({ ox: 33, oz: -10 }, 'z', 20, 7, () => 0, 0xcfd6de);
    tileGridM(15, -10, 33, 10, 5.05);
    (() => { const g = U.shadedBoxGeo(2.2, 0.5, 2.2); g.translate(24, 0.25, 0); rockGeos.push(g); })();
    addCollider(22.9, 0, -1.1, 25.1, 0.5, 1.1, { step: true });
    addProp('meteor', 24, 0.5, 0, 2.4, 1.9, 2.4, T.lavarock, 0xffffff, 300, {});
    addProp('rocket', 29.5, 0, -6, 1.0, 4.4, 1.0, T.plain, 0xf0f4f8, 70, { metal: true });
    addProp('case', 19, 0, -6.5, 0.9, 1.6, 0.9, T.glassTex, 0xdff2ff, 12, { glassy: true });
    addProp('relic', 19, 0.15, -6.5, 0.45, 0.5, 0.45, T.plain, 0x9adcf0, 20, {});
    addProp('case', 19, 0, 6.5, 0.9, 1.6, 0.9, T.glassTex, 0xdff2ff, 12, { glassy: true });
    addProp('relic', 19, 0.15, 6.5, 0.45, 0.5, 0.45, T.plain, 0xc86a4a, 20, {});
    addProp('desk', 30.5, 0, 6, 2.2, 1.0, 0.9, T.console, 0x3a4252, 40, {});
    W.campSpots.push({ x: 29, z: 0, yaw: -Math.PI / 2 });

    // ---- ART WING (north) ----
    MRB({ ox: -14, oz: -26 }, 'x', 28, 7, (c, r) => (r === 4 && c % 4 === 2) ? 3 : 0, 0xe6dfd2);
    MRB({ ox: -14, oz: -26 }, 'z', 14, 7, () => 0, 0xe6dfd2);
    MRB({ ox: 14, oz: -26 }, 'z', 14, 7, () => 0, 0xe6dfd2);
    tileGridM(-14, -26, 14, -12, 5.05);
    for (const px9 of [-11, -6.5, -2, 2.5, 7, 11.5])
      addProp('painting', px9, 2.1, -25.7, 1.8, 1.35, 0.14, T.painting, 0xffffff, 20, {});
    addProp('painting', -13.7, 2.1, -19, 0.14, 1.35, 1.8, T.painting, 0xffffff, 20, {});
    addProp('painting', 13.7, 2.1, -19, 0.14, 1.35, 1.8, T.painting, 0xffffff, 20, {});
    addProp('moai', -9, 0, -15.5, 1.2, 2.4, 1.2, T.tiki, 0xcfd2d8, 140, {});
    addProp('moai', 9, 0, -15.5, 1.2, 2.4, 1.2, T.tiki, 0xcfd2d8, 140, {});
    for (const [vx, vz] of [[-5, -20], [0, -22], [5, -20], [0, -16]]) {
      addProp('pedestal', vx, 0, vz, 0.65, 1.05, 0.65, T.plain, 0xe8e4da, 25, {});
      addProp('vase', vx, 1.05, vz, 0.5, 0.7, 0.5, T.plain, U.pick([0x3f6fd0, 0xc23b2e, 0x3f8f5f]), 10, {});
    }
    addProp('bench', -7, 0, -18, 1.7, 0.55, 0.6, T.plain, 0x8a5f3f, 25, {});
    addProp('bench', 7, 0, -18, 1.7, 0.55, 0.6, T.plain, 0x8a5f3f, 25, {});
    W.campSpots.push({ x: 0, z: -24, yaw: 0 });

    // ---- GIFT SHOP (flanks the entrance) ----
    MRB({ ox: -14, oz: 12 }, 'z', 8, 6, (c, r) => (c >= 2 && c <= 3 && r <= 3) ? 1 : 0, 0xd9cdb8);
    MRB({ ox: -14, oz: 20 }, 'x', 10, 6, () => 0, 0xd9cdb8);
    MRB({ ox: -4, oz: 12 }, 'z', 8, 6, (c, r) => (c >= 2 && c <= 3 && r <= 3) ? 1 : 0, 0xd9cdb8);
    tileGridM(-14, 12, -4, 20, 4.4);
    addProp('desk', -9, 0, 18.4, 2.4, 1.05, 0.9, T.console, 0x3a4252, 50, {});
    addProp('shelf', -12.8, 0, 15, 0.5, 1.9, 1.4, T.shelf, 0xffffff, 35, {});
    addProp('plush', -12.5, 1.0, 15, 0.4, 0.4, 0.4, T.plain, 0x42d64a, 6, {});
    addProp('plush', -9, 1.2, 18.4, 0.4, 0.4, 0.4, T.plain, 0xe8b83e, 6, {});
    addProp('vend', -5.4, 0, 18.6, 1.2, 2.0, 0.9, T.container, 0xc23b4e, 60, { metal: true });
    // security office (east flank)
    MRB({ ox: 4, oz: 12 }, 'z', 8, 6, (c, r) => (c >= 2 && c <= 3 && r <= 3) ? 1 : 0, 0xd9cdb8);
    MRB({ ox: 4, oz: 20 }, 'x', 10, 6, () => 0, 0xd9cdb8);
    MRB({ ox: 14, oz: 12 }, 'z', 8, 6, () => 0, 0xd9cdb8);
    tileGridM(4, 12, 14, 20, 4.4);
    addProp('desk', 9, 0, 17.5, 2.4, 1.05, 0.9, T.console, 0x2e3a4a, 50, {});
    addProp('camera', 8, 2.4, 12.6, 0.5, 0.4, 0.7, T.plain, 0x2e3138, 12, { metal: true });
    addProp('cell', 12.6, 0, 18.6, 0.7, 1.1, 0.7, T.propane, 0xbfe8ff, 16, { metal: true });
    W.campSpots.push({ x: 9, z: 16, yaw: Math.PI });

    // helper: wing ceilings as shootable tiles
    function tileGridM(x0, z0, x1, z1, topY) {
      const w = x1 - x0, d = z1 - z0;
      const nx = Math.max(1, Math.round(w / 4.6)), nz = Math.max(1, Math.round(d / 4.6));
      const tw = w / nx, td = d / nz;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++)
          addProp('tile', x0 + (i + 0.5) * tw, topY - 0.26, z0 + (j + 0.5) * td, tw - 0.06, 0.26, td - 0.06, T.marble, 0xe8e4da, 60, { step: true });
    }

    // museum benches + lawn dressing outside
    addProp('cart', 5, 0, 26, 1.9, 1.6, 1.1, T.plain, 0xe8b83e, 40, { metal: true });
    addProp('bench', -6, 0, 24, 1.7, 0.55, 0.6, T.plain, 0x8a5f3f, 25, {});
    addHedge(-16, 24, true); addHedge(16, 24, true);
    buildTree(-24, 20); buildTree(24, 20); buildTree(-30, -20); buildTree(30, -20);
    addProp('hydrant', 12, 0, 28, 0.5, 0.95, 0.5, T.hydrant, 0xffffff, 30, { metal: true });

    W.spawnPoints = [
      { x: -38, z: 0 }, { x: 38, z: 0 }, { x: -38, z: 24 }, { x: 38, z: 24 },
      { x: -38, z: -24 }, { x: 38, z: -24 }, { x: 0, z: 30 }, { x: 0, z: -31 },
      { x: -24, z: 15 }, { x: 24, z: 15 }, { x: -20, z: -30 }, { x: 20, z: -30 },
    ];
    W.minimapPaint = function (x, s, ox, oz) {
      x.fillStyle = '#3e8f2e';
      x.fillRect(0, 0, 144 * s, 116 * s);
      x.fillStyle = '#b3b7bb';
      x.fillRect((ox - 35) * s, (oz - 29) * s, 70 * s, 52 * s);
      x.fillStyle = '#c9cdd1';
      x.fillRect((ox - 4) * s, (oz + 12) * s, 8 * s, 22 * s);
    };
    addSky(0x6cb8ee);
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
    W.campSpots.length = 0;
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
    if (W.alarmT > 0) W.alarmT -= dt;
    if (W.mapUpdate) W.mapUpdate(dt);
    W.flushBatches();
  };

  return W;
})();
