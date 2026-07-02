// util.js — shared helpers + namespace
window.G = {};
window.U = {
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  clamp: (v, a, b) => v < a ? a : (v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, lambda, dt) => U.lerp(a, b, 1 - Math.exp(-lambda * dt)),
  gauss: () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1, // ~[-1,1] centered
  dist2d: (x1, z1, x2, z2) => Math.hypot(x2 - x1, z2 - z1),
  now: () => performance.now() / 1000,
};

// Ray vs AABB slab test. Returns t>=0 or -1. Fills outN with normal if provided.
U.rayAABB = function (ro, rd, min, max, outN) {
  let tmin = -Infinity, tmax = Infinity, ax = 0, sgn = 1;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ro.x : i === 1 ? ro.y : ro.z;
    const d = i === 0 ? rd.x : i === 1 ? rd.y : rd.z;
    const mn = i === 0 ? min.x : i === 1 ? min.y : min.z;
    const mx = i === 0 ? max.x : i === 1 ? max.y : max.z;
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; continue; }
    let t1 = (mn - o) / d, t2 = (mx - o) / d;
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = i; sgn = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  const t = tmin >= 0 ? tmin : 0;
  if (outN) {
    outN.set(0, 0, 0);
    if (ax === 0) outN.x = sgn; else if (ax === 1) outN.y = sgn; else outN.z = sgn;
  }
  return t;
};

// Ray vs sphere: returns t or -1
U.raySphere = function (ro, rd, cx, cy, cz, r) {
  const ox = ro.x - cx, oy = ro.y - cy, oz = ro.z - cz;
  const b = ox * rd.x + oy * rd.y + oz * rd.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (c < 0 ? 0 : -1);
};

// Ray vs vertical cylinder (y0..y1): returns t or -1
U.rayCylinderY = function (ro, rd, cx, cz, r, y0, y1) {
  const ox = ro.x - cx, oz = ro.z - cz;
  const a = rd.x * rd.x + rd.z * rd.z;
  if (a < 1e-9) { // vertical ray
    if (ox * ox + oz * oz > r * r) return -1;
    const t = rd.y > 0 ? (y0 - ro.y) / rd.y : (y1 - ro.y) / rd.y;
    return t >= 0 ? t : (ro.y >= y0 && ro.y <= y1 ? 0 : -1);
  }
  const b = ox * rd.x + oz * rd.z;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / a;
  if (t < 0) t = (-b + sq) / a;
  if (t < 0) return -1;
  const y = ro.y + rd.y * t;
  if (y < y0 || y > y1) return -1;
  return t;
};

// Merge simple BufferGeometries (position/normal/uv[/color]/index) into one
U.mergeGeos = function (geos) {
  let vCount = 0, iCount = 0, hasColor = true;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : 0;
    if (!g.attributes.color) hasColor = false;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const col = hasColor ? new Float32Array(vCount * 3) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (col) col.set(g.attributes.color.array, vo * 3);
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo; io += ia.length; }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
};

// Box geometry with baked per-face shading via vertex colors (fake lighting, unlit render)
U.shadedBoxGeo = function (w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.normal.array;
  const count = g.attributes.position.count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
    let s = 0.86;
    if (ny > 0.5) s = 1.0; else if (ny < -0.5) s = 0.62;
    else if (nz > 0.5) s = 0.95; else if (nz < -0.5) s = 0.78;
    else if (nx > 0.5) s = 0.88; else s = 0.82;
    col[i * 3] = s; col[i * 3 + 1] = s; col[i * 3 + 2] = s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
