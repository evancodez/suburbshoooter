// textures.js — procedural MS-Paint style canvas textures
window.T = (function () {
  const T = {};

  function cnv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c, x: c.getContext('2d') };
  }
  function tex(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  // wobbly hand-drawn line
  function wob(x, x1, y1, x2, y2, seg, j) {
    seg = seg || 6; j = j === undefined ? 2 : j;
    x.beginPath();
    x.moveTo(x1 + U.rand(-j, j), y1 + U.rand(-j, j));
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      x.lineTo(x1 + (x2 - x1) * t + U.rand(-j, j), y1 + (y2 - y1) * t + U.rand(-j, j));
    }
    x.stroke();
  }
  function border(x, w, h, lw, color, inset) {
    inset = inset || lw * 0.7;
    x.strokeStyle = color || 'rgba(0,0,0,0.85)';
    x.lineWidth = lw;
    x.lineCap = 'round';
    wob(x, inset, inset, w - inset, inset, 5, lw * 0.35);
    wob(x, w - inset, inset, w - inset, h - inset, 5, lw * 0.35);
    wob(x, w - inset, h - inset, inset, h - inset, 5, lw * 0.35);
    wob(x, inset, h - inset, inset, inset, 5, lw * 0.35);
  }
  function blob(x, cx, cy, r, lobes, fill, stroke, lw) {
    x.beginPath();
    const n = lobes || 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * U.rand(0.72, 1.15);
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.85;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath();
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 3; x.stroke(); }
  }
  T.cnv = cnv; T.tex = tex; T.wob = wob; T.border = border; T.blob = blob;

  // ---------- world surfaces ----------
  T.siding = function () { // white base, tinted per-instance
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 3;
    for (let y = 20; y < 128; y += 22) wob(x, 2, y, 126, y, 7, 2);
    border(x, 128, 128, 7);
    return tex(c);
  };
  T.roof = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 3;
    for (let y = 16; y < 128; y += 26) {
      wob(x, 2, y, 126, y, 7, 2);
      for (let vx = ((y / 26) % 2) * 16 + 10; vx < 128; vx += 32) wob(x, vx, y, vx + U.rand(-3, 3), y + 20, 2, 2);
    }
    border(x, 128, 128, 7);
    return tex(c);
  };
  T.plain = function () { // generic bordered white (debris, garage, props) — tinted
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.garageDoor = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 4;
    for (let y = 32; y < 128; y += 32) wob(x, 6, y, 122, y, 6, 2);
    border(x, 128, 128, 7);
    return tex(c);
  };
  T.brick = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#b5b0a6'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(40,35,30,0.6)'; x.lineWidth = 3;
    for (let i = 0; i < 12; i++) blob(x, U.rand(8, 120), U.rand(6, 58), U.rand(5, 11), 7, 'rgba(125,118,108,0.5)', 'rgba(40,35,30,0.55)', 2);
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.fence = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(60,30,10,0.4)'; x.lineWidth = 3;
    wob(x, 21, 4, 21, 124, 8, 2); wob(x, 42, 4, 42, 124, 8, 2);
    x.strokeStyle = 'rgba(60,30,10,0.5)';
    blob(x, 32, 40, 5, 7, 'rgba(80,45,15,0.45)', null);
    border(x, 64, 128, 6);
    return tex(c);
  };
  T.glassTex = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#cfeeff'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 6;
    wob(x, 32, 4, 32, 60, 4, 1.5); wob(x, 4, 32, 60, 32, 4, 1.5);
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 3;
    wob(x, 10, 50, 26, 34, 3, 1.5);
    border(x, 64, 64, 6, 'rgba(30,30,40,0.95)');
    return tex(c);
  };
  T.grass = function () {
    const { c, x } = cnv(256, 256);
    x.fillStyle = '#5fbf3f'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(20,90,15,0.55)'; x.lineWidth = 2.5; x.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const px = U.rand(4, 252), py = U.rand(4, 252), s = U.rand(3, 6);
      x.beginPath();
      x.moveTo(px - s, py + s); x.lineTo(px - s * 0.4, py - s); x.lineTo(px, py + s * 0.6); x.lineTo(px + s * 0.5, py - s); x.lineTo(px + s, py + s);
      x.stroke();
    }
    for (let i = 0; i < 14; i++) blob(x, U.rand(0, 256), U.rand(0, 256), U.rand(8, 20), 8, 'rgba(110,200,80,0.35)', null);
    return tex(c, [1, 1]);
  };
  T.road = function () {
    const { c, x } = cnv(256, 256);
    x.fillStyle = '#8a8f94'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(50,52,56,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const px = U.rand(0, 256), py = U.rand(0, 256);
      wob(x, px, py, px + U.rand(-45, 45), py + U.rand(-45, 45), 5, 6);
    }
    x.strokeStyle = 'rgba(245,220,60,0.95)'; x.lineWidth = 7;
    wob(x, 20, 128, 100, 128, 3, 2); wob(x, 156, 128, 236, 128, 3, 2);
    return tex(c, [1, 1]);
  };
  T.sidewalk = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#c9cdd1'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(70,72,78,0.55)'; x.lineWidth = 3;
    wob(x, 64, 2, 64, 126, 6, 2);
    wob(x, 2, 64, 126, 64, 6, 2);
    return tex(c, [1, 1]);
  };
  T.driveway = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#b3b7bb'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(70,72,78,0.4)'; x.lineWidth = 2.5;
    wob(x, 4, 64, 124, 64, 5, 3);
    return tex(c, [1, 1]);
  };
  T.floorWood = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#c99a5f'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(90,55,20,0.5)'; x.lineWidth = 3;
    for (let y = 16; y < 128; y += 24) wob(x, 2, y, 126, y, 6, 2);
    return tex(c, [1, 1]);
  };
  T.trunk = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#8b5a2b'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(60,30,5,0.6)'; x.lineWidth = 3;
    wob(x, 18, 4, 20, 124, 8, 3); wob(x, 40, 4, 44, 124, 8, 3);
    border(x, 64, 128, 6);
    return tex(c);
  };
  T.leaf = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#3f9c35'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(15,70,10,0.6)'; x.lineWidth = 3;
    for (let i = 0; i < 16; i++) blob(x, U.rand(10, 118), U.rand(10, 118), U.rand(7, 15), 8, 'rgba(60,150,45,0.6)', 'rgba(15,70,10,0.45)', 2);
    border(x, 128, 128, 7, 'rgba(10,55,8,0.9)');
    return tex(c);
  };

  // ---------- vehicles / props ----------
  T.carBody = function () {
    const { c, x } = cnv(256, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 4;
    wob(x, 96, 14, 96, 114, 5, 2); wob(x, 176, 14, 176, 114, 5, 2);
    x.lineWidth = 5;
    wob(x, 110, 60, 132, 60, 2, 1); wob(x, 190, 60, 212, 60, 2, 1);
    border(x, 256, 128, 8);
    return tex(c);
  };
  T.carGlass = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#bfe6f7'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 4;
    wob(x, 14, 48, 50, 12, 3, 2);
    x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 5;
    wob(x, 64, 6, 64, 58, 4, 2);
    border(x, 128, 64, 7);
    return tex(c);
  };
  T.propane = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#d43a2f';
    x.font = 'bold 26px "Comic Sans MS", cursive';
    x.fillText('LP', 16, 42);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.mailbox = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#9aa0a6'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 3;
    wob(x, 8, 44, 56, 44, 3, 1.5);
    x.fillStyle = '#e33'; x.fillRect(46, 8, 6, 16);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.couch = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#b8534f'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(60,15,12,0.6)'; x.lineWidth = 3;
    wob(x, 43, 6, 43, 58, 4, 2); wob(x, 86, 6, 86, 58, 4, 2);
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.fridge = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#e8ecee'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 3;
    wob(x, 4, 44, 60, 44, 3, 1.5);
    wob(x, 12, 20, 12, 36, 2, 1); wob(x, 12, 54, 12, 84, 2, 1);
    border(x, 64, 128, 5);
    return tex(c);
  };
  T.tv = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#222831'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#3a86c8'; x.fillRect(10, 8, 108, 48);
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 3;
    wob(x, 24, 44, 50, 20, 3, 2);
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.grill = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#2f3338'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(200,200,200,0.4)'; x.lineWidth = 2;
    wob(x, 8, 22, 56, 22, 3, 1.5);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.portapotty = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#2d7dd2'; x.fillRect(0, 0, 64, 128);
    x.fillStyle = '#e8f0f4'; x.fillRect(0, 0, 64, 18);
    x.strokeStyle = 'rgba(10,40,80,0.7)'; x.lineWidth = 3;
    wob(x, 14, 26, 14, 118, 5, 2); wob(x, 50, 26, 50, 118, 5, 2);
    blob(x, 32, 44, 5, 7, '#e8f0f4', null);
    border(x, 64, 128, 6);
    return tex(c);
  };
  T.hydrant = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#e03a28'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(120,20,10,0.8)'; x.lineWidth = 3;
    wob(x, 6, 18, 58, 18, 3, 1.5);
    blob(x, 32, 40, 8, 7, '#f0c020', 'rgba(120,20,10,0.7)', 2);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.trash = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#7d858c'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(40,45,50,0.6)'; x.lineWidth = 3;
    wob(x, 16, 6, 16, 58, 4, 2); wob(x, 32, 6, 32, 58, 4, 2); wob(x, 48, 6, 48, 58, 4, 2);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.recycle = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#2d6fd2'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(32, 18); x.lineTo(44, 38); x.lineTo(20, 38); x.closePath(); x.stroke();
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.dumpster = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#3f7d3a'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(20,45,18,0.7)'; x.lineWidth = 3;
    wob(x, 8, 20, 120, 20, 5, 2);
    wob(x, 64, 24, 64, 58, 3, 2);
    x.fillStyle = 'rgba(20,45,18,0.6)';
    x.font = 'bold 14px "Comic Sans MS", cursive';
    x.fillText('WASTE', 42, 46);
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.ac = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#c9ced2'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(60,65,70,0.55)'; x.lineWidth = 2.5;
    for (let y = 14; y < 56; y += 9) wob(x, 8, y, 56, y, 3, 1);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.doghouse = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#a9713d'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#221a10';
    x.beginPath(); x.arc(32, 46, 13, Math.PI, 0); x.lineTo(45, 62); x.lineTo(19, 62); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(60,30,10,0.6)'; x.lineWidth = 3;
    wob(x, 6, 14, 58, 14, 3, 1.5);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.bed = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#e8e2d8'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#b8534f'; x.fillRect(0, 0, 128, 26);
    x.fillStyle = '#ffffff';
    blob(x, 22, 14, 12, 8, '#fff', 'rgba(100,100,110,0.5)', 2);
    x.strokeStyle = 'rgba(100,90,80,0.5)'; x.lineWidth = 3;
    wob(x, 4, 28, 124, 28, 5, 1.5);
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.shelf = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#8a5a2b'; x.fillRect(0, 0, 64, 128);
    const cols = ['#c23', '#26c', '#2a2', '#dd2', '#93c', '#e70'];
    for (let sy = 8; sy < 120; sy += 30) {
      let bx = 8;
      while (bx < 52) {
        const bw = U.rand(5, 10);
        x.fillStyle = U.pick(cols);
        x.fillRect(bx, sy, bw, 22);
        bx += bw + 2;
      }
      x.strokeStyle = 'rgba(40,20,5,0.8)'; x.lineWidth = 3;
      wob(x, 4, sy + 24, 60, sy + 24, 3, 1);
    }
    border(x, 64, 128, 5);
    return tex(c);
  };
  T.backboard = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#f0f0ec'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = '#d13030'; x.lineWidth = 4;
    x.strokeRect(20, 26, 24, 20);
    border(x, 64, 64, 5);
    return tex(c);
  };
  T.kpool = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#49b6e8'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 3;
    wob(x, 8, 20, 56, 24, 4, 3); wob(x, 8, 40, 56, 44, 4, 3);
    border(x, 64, 64, 5, 'rgba(20,60,110,0.9)');
    return tex(c);
  };

  // ---------- characters ----------
  T.face = function (skin, hair) {
    const { c, x } = cnv(64, 64);
    x.fillStyle = skin; x.fillRect(0, 0, 64, 64);
    // hair
    x.fillStyle = hair;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 0); x.lineTo(64, 16 + U.rand(-3, 5));
    for (let i = 5; i >= 0; i--) x.lineTo(i * 12.8, 14 + U.rand(-6, 7));
    x.closePath(); x.fill();
    // angry brows + eyes
    x.strokeStyle = '#111'; x.lineWidth = 3; x.lineCap = 'round';
    const ey = 30;
    wob(x, 12, ey - 6, 26, ey - 2, 2, 1); wob(x, 52, ey - 6, 38, ey - 2, 2, 1);
    x.fillStyle = '#111';
    x.beginPath(); x.arc(19, ey + 4, 3.4, 0, 7); x.fill();
    x.beginPath(); x.arc(45, ey + 4, 3.4, 0, 7); x.fill();
    // mouth variants
    const m = U.randi(0, 2);
    x.strokeStyle = '#111'; x.lineWidth = 3;
    if (m === 0) wob(x, 24, 48, 40, 48, 2, 2);
    else if (m === 1) { x.beginPath(); x.arc(32, 44, 8, 0.3, Math.PI - 0.3); x.stroke(); }
    else { x.beginPath(); x.arc(32, 52, 7, Math.PI + 0.3, -0.3); x.stroke(); }
    border(x, 64, 64, 4);
    return tex(c);
  };
  T.cloth = function () { // white + seams, tinted
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2.5;
    wob(x, 6, 14, 58, 14, 3, 2);
    border(x, 64, 64, 4);
    return tex(c);
  };
  T.camo = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#7a8f5a'; x.fillRect(0, 0, 128, 128);
    const cols = ['#4b5e33', '#98a878', '#31402a', '#5c7040'];
    for (let i = 0; i < 22; i++) blob(x, U.rand(0, 128), U.rand(0, 128), U.rand(8, 20), 7, U.pick(cols), null);
    border(x, 128, 128, 5);
    return tex(c);
  };
  T.gunmetal = function () {
    const { c, x } = cnv(64, 64);
    x.fillStyle = '#4a4d52'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 2.5;
    wob(x, 6, 32, 58, 32, 3, 2);
    border(x, 64, 64, 5, 'rgba(0,0,0,0.9)');
    return tex(c);
  };

  // ---------- fx ----------
  T.splat = function () {
    const { c, x } = cnv(128, 128);
    x.clearRect(0, 0, 128, 128);
    blob(x, 64, 64, 34, 12, 'rgba(165,10,10,0.94)', 'rgba(90,0,0,0.9)', 4);
    for (let i = 0; i < 9; i++) {
      const a = U.rand(0, 6.28), d = U.rand(36, 56);
      blob(x, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, U.rand(3, 9), 6, 'rgba(150,8,8,0.9)', null);
    }
    return tex(c);
  };
  T.pool = function () { // neutral gray — tinted per instance (blood red / water blue)
    const { c, x } = cnv(128, 128);
    x.clearRect(0, 0, 128, 128);
    blob(x, 64, 64, 48, 14, 'rgba(235,235,235,0.96)', 'rgba(120,120,120,0.95)', 5);
    return tex(c);
  };
  T.hole = function () {
    const { c, x } = cnv(32, 32);
    x.clearRect(0, 0, 32, 32);
    blob(x, 16, 16, 8, 7, 'rgba(25,22,20,0.95)', 'rgba(0,0,0,0.8)', 2);
    return tex(c);
  };
  T.scorch = function () {
    const { c, x } = cnv(128, 128);
    x.clearRect(0, 0, 128, 128);
    blob(x, 64, 64, 46, 13, 'rgba(30,26,24,0.85)', 'rgba(10,8,8,0.9)', 5);
    for (let i = 0; i < 8; i++) {
      const a = U.rand(0, 6.28);
      blob(x, 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, U.rand(4, 10), 6, 'rgba(35,30,28,0.7)', null);
    }
    return tex(c);
  };
  T.smoke = function () {
    const { c, x } = cnv(64, 64);
    x.clearRect(0, 0, 64, 64);
    blob(x, 32, 32, 22, 10, 'rgba(150,150,155,0.92)', 'rgba(70,70,75,0.9)', 3.5);
    blob(x, 24, 26, 9, 8, 'rgba(180,180,185,0.85)', null);
    return tex(c);
  };
  T.fireball = function () {
    const { c, x } = cnv(64, 64);
    x.clearRect(0, 0, 64, 64);
    blob(x, 32, 32, 24, 10, '#ff7b1c', 'rgba(120,30,0,0.9)', 3.5);
    blob(x, 32, 34, 13, 9, '#ffd23e', null);
    return tex(c);
  };
  T.dustPuff = function () {
    const { c, x } = cnv(64, 64);
    x.clearRect(0, 0, 64, 64);
    blob(x, 32, 32, 20, 9, 'rgba(190,180,160,0.9)', 'rgba(110,100,85,0.8)', 3);
    return tex(c);
  };
  T.drop = function () {
    const { c, x } = cnv(32, 32);
    x.clearRect(0, 0, 32, 32);
    blob(x, 16, 16, 10, 7, 'rgba(190,10,10,0.95)', 'rgba(90,0,0,0.7)', 2);
    return tex(c);
  };
  T.shard = function () {
    const { c, x } = cnv(32, 32);
    x.clearRect(0, 0, 32, 32);
    x.fillStyle = 'rgba(210,240,255,0.95)'; x.strokeStyle = 'rgba(120,170,200,0.9)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(16, 2); x.lineTo(28, 26); x.lineTo(6, 22); x.closePath(); x.fill(); x.stroke();
    return tex(c);
  };
  T.muzzle = function () {
    const { c, x } = cnv(64, 64);
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#ffe14d'; x.strokeStyle = '#c96a00'; x.lineWidth = 3;
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 10 : 28 * U.rand(0.8, 1.15);
      const px = 32 + Math.cos(a) * r, py = 32 + Math.sin(a) * r;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill(); x.stroke();
    return tex(c);
  };
  T.cloud = function () {
    const { c, x } = cnv(256, 128);
    x.clearRect(0, 0, 256, 128);
    x.strokeStyle = 'rgba(255,255,255,0.98)'; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath();
    let px = 20, py = 80;
    x.moveTo(px, py);
    for (let i = 0; i < 9; i++) {
      const nx = 20 + (i + 1) * 24, ny = 80 - Math.sin((i / 9) * Math.PI) * U.rand(20, 45);
      x.quadraticCurveTo(px + 12, ny - 18, nx, ny);
      px = nx; py = ny;
    }
    x.quadraticCurveTo(240, 95, 220, 92);
    x.lineTo(30, 92);
    x.stroke();
    return tex(c);
  };
  T.sun = function () {
    const { c, x } = cnv(128, 128);
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = '#ffdf3e'; x.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      wob(x, 64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38, 64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58, 2, 2);
    }
    blob(x, 64, 64, 32, 11, '#ffd23e', '#e8a020', 4);
    return tex(c);
  };
  T.flagUS = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#c22';
    for (let y = 0; y < 64; y += 14) x.fillRect(0, y, 128, 7);
    x.fillStyle = '#224a9e'; x.fillRect(0, 0, 52, 32);
    x.fillStyle = '#fff';
    for (let i = 0; i < 12; i++) { const sx = 6 + (i % 4) * 13, sy = 5 + Math.floor(i / 4) * 10; x.fillRect(sx, sy, 4, 4); }
    border(x, 128, 64, 5);
    return tex(c);
  };
  T.ring = function () {
    const { c, x } = cnv(128, 128);
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,240,200,0.9)'; x.lineWidth = 8;
    x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke();
    return tex(c);
  };

  return T;
})();
