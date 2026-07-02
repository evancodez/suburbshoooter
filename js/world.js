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
    if (wall.kind === 'fence') return; // fences don't cascade
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
    W.addMoney(s.kind === 'roof' ? 'roof' : 'shed');
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
  W.groundHeightAt = function (x, z, refY) {
    const lim = (refY === undefined ? 1e9 : refY) + 0.6;
    let y = 0;
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
    if (x < -67 || x > 67 || z < -53 || z > 53) return true;
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
    // walls: standing range block
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
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
    // ground
    if (rd.y < -1e-6) {
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
  W.collideCircle = function (pos, radius, feetY, height) {
    for (let iter = 0; iter < 2; iter++) {
      // colliders
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.gone || c.noWalk) continue;
        if (c.maxy - feetY <= 0.42) continue;      // step-up
        if (c.miny > feetY + height) continue;      // overhead
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
    const mesh = new THREE.Mesh(U.shadedBoxGeo(sx, sy, sz), mat);
    mesh.position.set(x, y + sy / 2, z);
    if (opts && opts.rotY) mesh.rotation.y = opts.rotY;
    grp.add(mesh);
    const col = addCollider(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2, { prop: true, metal: opts && opts.metal });
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
    for (let i = 0; i < 4; i++) {
      tmpV.set(prop.x + U.rand(-0.3, 0.3), prop.y + U.rand(-0.2, 0.4), prop.z + U.rand(-0.3, 0.3));
      G.fx.debris(tmpV, new THREE.Vector3(U.rand(-3, 3), U.rand(2, 5), U.rand(-3, 3)),
        prop.sx * U.rand(0.3, 0.55), prop.sy * U.rand(0.3, 0.5), prop.sz * U.rand(0.3, 0.55), prop.tint, U.rand(5, 8));
    }
    W.navRefreshBox(prop.x - 1.5, prop.z - 1.5, prop.x + 1.5, prop.z + 1.5);
    if (prop.kind === 'propane') {
      tmpV.set(prop.x, prop.y, prop.z);
      W.explode(tmpV, 5.5, 115, { attacker, tag: 'PROPANE' });
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
    if (G.botMgr) G.botMgr.onNoise(pos, 75);
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
  let stairGeos = [];
  function buildStairs(x, z, dx, dz, width, n, stepH, stepD) {
    stepH = stepH || 0.3; stepD = stepD || 0.46;
    for (let k = 0; k < n; k++) {
      const cxk = x + dx * stepD * k, czk = z + dz * stepD * k;
      const h = (k + 1) * stepH;
      const sxk = dx !== 0 ? stepD : width, szk = dx !== 0 ? width : stepD;
      const g = U.shadedBoxGeo(sxk, h, szk);
      g.translate(cxk, h / 2, czk);
      stairGeos.push(g);
      addCollider(cxk - sxk / 2, 0, czk - szk / 2, cxk + sxk / 2, h, czk + szk / 2, { step: true });
      slabs.push({ minx: cxk - sxk / 2, minz: czk - szk / 2, maxx: cxk + sxk / 2, maxz: czk + szk / 2, top: h });
    }
  }
  function buildPlatform(cx, cz, w, d, topY, thick) {
    thick = thick || 0.18;
    const g = U.shadedBoxGeo(w, thick, d);
    g.translate(cx, topY - thick / 2, cz);
    stairGeos.push(g);
    addCollider(cx - w / 2, topY - thick, cz - d / 2, cx + w / 2, topY, cz + d / 2, { step: true });
    slabs.push({ minx: cx - w / 2, minz: cz - d / 2, maxx: cx + w / 2, maxz: cz + d / 2, top: topY });
  }
  function buildPost(x, z, h, s) {
    s = s || 0.16;
    const g = U.shadedBoxGeo(s, h, s);
    g.translate(x, h / 2, z);
    stairGeos.push(g);
    addCollider(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2, { tree: true });
  }

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

  function buildFenceRun(x0, z0, x1, z1, tall) {
    const dir = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z';
    const len = dir === 'x' ? x1 - x0 : z1 - z0;
    const cols = Math.round(Math.abs(len) / 2);
    const rows = tall ? 2 : 1;
    const ch = tall ? 1.25 : 0.85;
    const wall = WallGrid({
      ox: dir === 'x' ? Math.min(x0, x1) : x0,
      oy: 0, oz: dir === 'x' ? z0 : Math.min(z0, z1),
      dir, cols, rows, cw: 2, ch, th: 0.15,
      kind: 'fence', tint: 0xa9713d, hp: 30, house: null,
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

  W.build = function (sc) {
    scene = sc;
    grp = new THREE.Group();
    sc.add(grp);
    batches = {
      siding: ChunkBatch(T.siding(), 3400),
      roof: ChunkBatch(T.roof(), 2600),
      garage: ChunkBatch(T.garageDoor(), 160),
      fence: ChunkBatch(T.fence(), 900),
      frame: ChunkBatch(T.fence(), 260),
      glass: ChunkBatch(T.glassTex(), 360, { transparent: true, opacity: 0.62, renderOrder: 4 }),
    };
    wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    hedgeMat = new THREE.MeshBasicMaterial({ map: T.leaf(), vertexColors: true });
    trunkMat = new THREE.MeshBasicMaterial({ map: T.trunk(), vertexColors: true });

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
    const canopy = new THREE.Mesh(U.mergeGeos(treeCanopyGeos), new THREE.MeshBasicMaterial({ map: T.leaf() }));
    grp.add(canopy);

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

    // stairs / platforms / posts merged into one mesh
    stairMat = new THREE.MeshBasicMaterial({ map: T.plain(), vertexColors: true, color: 0xb98a55 });
    if (stairGeos.length) {
      const stairMesh = new THREE.Mesh(U.mergeGeos(stairGeos.splice(0, stairGeos.length)), stairMat);
      grp.add(stairMesh);
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

    // sky
    scene.background = new THREE.Color(0x6cb8ee);
    const cloudTex = T.cloud();
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
      sp.position.set(U.rand(-160, 160), U.rand(40, 78), U.rand(-170, 170));
      sp.scale.set(U.rand(40, 70), U.rand(18, 30), 1);
      grp.add(sp);
    }
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sun(), transparent: true, depthWrite: false }));
    sun.position.set(130, 95, -150);
    sun.scale.set(28, 28, 1);
    grp.add(sun);

    navBuild();
    W.flushBatches();
    W.minimapDirty = true;
  };
  let wireMat;

  // full rebuild for a fresh match — disposes everything the last build created
  W.reset = function () {
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
    W.flushBatches();
  };

  return W;
})();
