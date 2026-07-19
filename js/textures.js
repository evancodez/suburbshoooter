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

  // ---------- construction site surfaces ----------
  T.dirt = function () {
    const { c, x } = cnv(256, 256);
    x.fillStyle = '#a97d4f'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) blob(x, U.rand(0, 256), U.rand(0, 256), U.rand(6, 18), 8, 'rgba(130,90,50,0.4)', null);
    for (let i = 0; i < 14; i++) blob(x, U.rand(0, 256), U.rand(0, 256), U.rand(3, 7), 6, 'rgba(80,55,30,0.45)', null);
    x.strokeStyle = 'rgba(90,60,30,0.5)'; x.lineWidth = 3; x.lineCap = 'round';
    for (let i = 0; i < 8; i++) { // tire tracks
      const py = U.rand(10, 246);
      wob(x, 0, py, 256, py + U.rand(-14, 14), 8, 4);
    }
    return tex(c, [1, 1]);
  };
  T.gravel = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#9c9c98'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 46; i++) blob(x, U.rand(0, 128), U.rand(0, 128), U.rand(2, 5), 6, U.pick(['rgba(120,120,116,0.8)', 'rgba(150,150,146,0.8)', 'rgba(100,100,98,0.8)']), 'rgba(60,60,58,0.4)', 1.5);
    return tex(c, [1, 1]);
  };
  T.chainlink = function () {
    const { c, x } = cnv(64, 64);
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(210,214,218,0.28)'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(120,126,132,0.95)'; x.lineWidth = 2.5;
    for (let i = -64; i < 64; i += 13) { wob(x, i, 0, i + 64, 64, 4, 1); wob(x, i + 64, 0, i, 64, 4, 1); }
    border(x, 64, 64, 4, 'rgba(90,96,102,0.9)');
    return tex(c);
  };
  T.plywood = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#d8b075'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(140,95,40,0.5)'; x.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) {
      const py = U.rand(8, 120);
      wob(x, 4, py, 124, py + U.rand(-6, 6), 6, 3);
    }
    blob(x, U.rand(30, 98), U.rand(30, 98), 7, 7, 'rgba(150,100,45,0.6)', 'rgba(110,70,25,0.6)', 2);
    border(x, 128, 128, 6);
    return tex(c);
  };
  T.cinder = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#c2c4c6'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(70,72,76,0.7)'; x.lineWidth = 3;
    wob(x, 64, 4, 64, 60, 5, 2);       // vertical joint
    x.strokeStyle = 'rgba(70,72,76,0.45)'; x.lineWidth = 2;
    x.strokeRect(14, 14, 34, 36); x.strokeRect(78, 14, 34, 36); // block holes
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.girder = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#e8a020'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(120,70,10,0.55)'; x.lineWidth = 3;
    for (let y = 18; y < 128; y += 26) { // rivets
      blob(x, 14, y, 3.5, 6, 'rgba(90,55,10,0.8)', null);
      blob(x, 50, y, 3.5, 6, 'rgba(90,55,10,0.8)', null);
    }
    wob(x, 32, 2, 32, 126, 7, 2);
    border(x, 64, 128, 6);
    return tex(c);
  };
  T.hazard = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#ffcf2e'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#20232a';
    for (let i = -64; i < 128; i += 32) {
      x.beginPath();
      x.moveTo(i, 64); x.lineTo(i + 32, 0); x.lineTo(i + 48, 0); x.lineTo(i + 16, 64);
      x.closePath(); x.fill();
    }
    border(x, 128, 64, 6);
    return tex(c);
  };
  T.container = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 4;
    for (let px = 16; px < 128; px += 18) wob(x, px, 6, px, 122, 6, 1.5);
    border(x, 128, 128, 7);
    return tex(c);
  };

  // ---------- volcano island surfaces ----------
  T.sand = function () {
    const { c, x } = cnv(256, 256);
    x.fillStyle = '#eed08a'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) blob(x, U.rand(0, 256), U.rand(0, 256), U.rand(5, 14), 8, 'rgba(230,190,120,0.5)', null);
    x.strokeStyle = 'rgba(180,140,70,0.4)'; x.lineWidth = 2; x.lineCap = 'round';
    for (let i = 0; i < 16; i++) { // ripples
      const py = U.rand(6, 250);
      wob(x, U.rand(0, 100), py, U.rand(150, 256), py + U.rand(-8, 8), 6, 3);
    }
    return tex(c, [1, 1]);
  };
  T.water = function () {
    const { c, x } = cnv(256, 256);
    x.fillStyle = '#2e8fae'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12; i++) blob(x, U.rand(0, 256), U.rand(0, 256), U.rand(14, 30), 9, 'rgba(60,165,190,0.5)', null);
    x.strokeStyle = 'rgba(235,250,255,0.75)'; x.lineWidth = 4; x.lineCap = 'round';
    for (let i = 0; i < 14; i++) { // cartoon wave curls
      const px = U.rand(10, 230), py = U.rand(10, 246);
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + 12, py - 9, px + 24, py);
      x.stroke();
    }
    return tex(c, [1, 1]);
  };
  T.lava = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ff5a12'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 9; i++) blob(x, U.rand(0, 128), U.rand(0, 128), U.rand(9, 20), 8, 'rgba(255,190,40,0.85)', null);
    for (let i = 0; i < 7; i++) blob(x, U.rand(0, 128), U.rand(0, 128), U.rand(4, 9), 7, 'rgba(140,20,10,0.7)', null);
    x.strokeStyle = 'rgba(60,10,5,0.8)'; x.lineWidth = 3;
    for (let i = 0; i < 5; i++) wob(x, U.rand(0, 128), U.rand(0, 128), U.rand(0, 128), U.rand(0, 128), 6, 8);
    return tex(c, [1, 1]);
  };
  T.lavarock = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#4b4348'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 18; i++) blob(x, U.rand(0, 128), U.rand(0, 128), U.rand(5, 13), 7, 'rgba(60,54,60,0.7)', 'rgba(25,22,26,0.6)', 2);
    x.strokeStyle = 'rgba(255,120,30,0.55)'; x.lineWidth = 2.5; // glowing cracks
    wob(x, 8, U.rand(20, 108), 120, U.rand(20, 108), 8, 10);
    wob(x, U.rand(20, 108), 8, U.rand(20, 108), 120, 8, 10);
    border(x, 128, 128, 6, 'rgba(20,16,20,0.9)');
    return tex(c, [1, 1]);
  };
  T.bamboo = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#cdb968'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(120,100,40,0.6)'; x.lineWidth = 3;
    wob(x, 16, 2, 16, 126, 7, 1.5); wob(x, 33, 2, 33, 126, 7, 1.5); wob(x, 50, 2, 50, 126, 7, 1.5);
    x.strokeStyle = 'rgba(100,82,30,0.7)'; x.lineWidth = 4;
    wob(x, 2, 34, 62, 34, 4, 2); wob(x, 2, 78, 62, 78, 4, 2); wob(x, 2, 112, 62, 112, 4, 2);
    border(x, 64, 128, 5);
    return tex(c);
  };
  // ---------- space station surfaces ----------
  T.hullPanel = function () { // clean white 2001-style panels, tinted per instance
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(40,44,52,0.35)'; x.lineWidth = 3;
    wob(x, 2, 64, 126, 64, 5, 1.5);
    wob(x, 64, 2, 64, 126, 5, 1.5);
    x.fillStyle = 'rgba(40,44,52,0.5)';
    x.fillRect(10, 10, 10, 4); x.fillRect(108, 114, 10, 4); // vents
    x.strokeStyle = 'rgba(120,160,200,0.3)'; x.lineWidth = 2;
    x.strokeRect(74, 12, 42, 20); // little service hatch
    border(x, 128, 128, 6, 'rgba(30,34,42,0.85)');
    return tex(c);
  };
  T.hullFloor = function () { // deck plating with tread grid
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(50,55,65,0.4)'; x.lineWidth = 2.5;
    for (let i = 16; i < 128; i += 24) { wob(x, i, 4, i, 124, 4, 1); wob(x, 4, i, 124, i, 4, 1); }
    x.fillStyle = 'rgba(50,55,65,0.5)';
    for (let px = 10; px < 128; px += 24) for (let py = 10; py < 128; py += 24) x.fillRect(px, py, 4, 4);
    border(x, 128, 128, 6, 'rgba(30,34,42,0.8)');
    return tex(c);
  };
  T.stars = function () {
    const { c, x } = cnv(256, 256);
    x.fillStyle = '#05060d'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 130; i++) {
      const s = U.rand(0.4, 1.6);
      x.fillStyle = U.pick(['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.5)', 'rgba(180,200,255,0.8)', 'rgba(255,220,180,0.8)']);
      x.fillRect(U.rand(0, 256), U.rand(0, 256), s, s);
    }
    for (let i = 0; i < 4; i++) { // a few bright ones with a cross flare
      const px = U.rand(10, 246), py = U.rand(10, 246);
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.fillRect(px - 1, py - 1, 3, 3);
      x.fillRect(px - 4, py, 9, 1); x.fillRect(px, py - 4, 1, 9);
    }
    return tex(c, [4, 2]);
  };
  T.planet = function () { // banded gas giant for the window view
    const { c, x } = cnv(256, 256);
    x.clearRect(0, 0, 256, 256);
    x.save();
    x.beginPath(); x.arc(128, 128, 118, 0, 7); x.clip();
    const bands = ['#c9885a', '#e8b47e', '#b56f4a', '#e8cf9e', '#c9885a', '#9e5f42', '#e8b47e'];
    for (let i = 0; i < 7; i++) {
      x.fillStyle = bands[i];
      x.fillRect(0, i * 38 - 6, 256, 44);
    }
    for (let i = 0; i < 5; i++) T.blob(x, U.rand(50, 200), U.rand(50, 200), U.rand(8, 18), 8, 'rgba(255,240,220,0.35)', null);
    T.blob(x, 170, 150, 24, 9, 'rgba(150,60,35,0.75)', 'rgba(90,35,20,0.5)', 2); // the big storm
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 3;
    x.beginPath(); x.arc(128, 128, 118, 0, 7); x.stroke();
    return tex(c);
  };
  T.console = function () { // busy little control surface
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#2b2f3a'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#7fd4ff'; x.fillRect(8, 8, 40, 22);
    x.fillStyle = '#3fe07f'; x.fillRect(54, 8, 22, 10);
    x.fillStyle = '#ffcf4a'; x.fillRect(54, 20, 22, 10);
    for (let i = 0; i < 12; i++) {
      x.fillStyle = U.pick(['#ff5a5a', '#3fe07f', '#7fd4ff', '#ffcf4a', '#e8e8f0']);
      x.fillRect(84 + (i % 4) * 10, 8 + Math.floor(i / 4) * 10, 6, 6);
    }
    x.strokeStyle = 'rgba(120,220,255,0.7)'; x.lineWidth = 2;
    wob(x, 10, 44, 118, 44, 6, 3); wob(x, 10, 52, 118, 52, 6, 3);
    border(x, 128, 64, 5, 'rgba(15,17,22,0.9)');
    return tex(c);
  };
  T.solar = function () {
    const { c, x } = cnv(128, 64);
    x.fillStyle = '#1d3a8f'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(140,190,255,0.75)'; x.lineWidth = 2;
    for (let i = 8; i < 128; i += 16) wob(x, i, 2, i, 62, 3, 0.5);
    for (let i = 8; i < 64; i += 14) wob(x, 2, i, 126, i, 3, 0.5);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.beginPath(); x.moveTo(10, 50); x.lineTo(40, 10); x.lineTo(58, 10); x.lineTo(28, 50); x.closePath(); x.fill();
    border(x, 128, 64, 5, 'rgba(20,24,40,0.9)');
    return tex(c);
  };
  T.hal = function () { // black faceplate, one calm red eye
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#14161c'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(180,190,210,0.5)'; x.lineWidth = 3;
    x.strokeRect(6, 6, 52, 116);
    const g = x.createRadialGradient(32, 52, 2, 32, 52, 16);
    g.addColorStop(0, '#fff2d0'); g.addColorStop(0.25, '#ff4a2a'); g.addColorStop(1, 'rgba(120,10,5,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(32, 52, 16, 0, 7); x.fill();
    x.fillStyle = 'rgba(220,230,240,0.8)';
    x.font = 'bold 11px monospace'; x.textAlign = 'center';
    x.fillText('CAL 900', 32, 100);
    border(x, 64, 128, 5, 'rgba(90,96,110,0.8)');
    return tex(c);
  };
  // ---------- museum surfaces ----------
  T.marble = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(150,148,140,0.4)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++) { // veins
      const px = U.rand(0, 128), py = U.rand(0, 128);
      wob(x, px, py, px + U.rand(-60, 60), py + U.rand(-60, 60), 8, 9);
    }
    x.strokeStyle = 'rgba(120,118,110,0.25)'; x.lineWidth = 3;
    wob(x, 2, 64, 126, 64, 6, 1.5);
    border(x, 128, 128, 6, 'rgba(90,88,80,0.7)');
    return tex(c);
  };
  T.painting = function () { // a fresh masterpiece every call
    const { c, x } = cnv(128, 96);
    x.fillStyle = U.pick(['#e8ddc8', '#cfd8e0', '#e0cfd4', '#d4e0cf']);
    x.fillRect(0, 0, 128, 96);
    const style = Math.floor(U.rand(0, 3));
    if (style === 0) { // blob-ism
      for (let i = 0; i < 6; i++)
        blob(x, U.rand(20, 108), U.rand(16, 80), U.rand(8, 22), 8,
          U.pick(['#c23b2e', '#2e6fc2', '#e8b83e', '#3f8f5f', '#8a4fd0']), 'rgba(30,30,30,0.6)', 2.5);
    } else if (style === 1) { // sunset-over-cubes period
      x.fillStyle = '#e8955e'; x.fillRect(8, 8, 112, 44);
      blob(x, U.rand(40, 90), 34, 12, 8, '#f5d23e', 'rgba(120,60,10,0.6)', 2);
      x.fillStyle = U.pick(['#4a5262', '#2e3a4a']);
      for (let i = 0; i < 4; i++) x.fillRect(12 + i * 28, 52, 20, 36);
    } else { // aggressive lines
      x.lineWidth = 5;
      for (let i = 0; i < 7; i++) {
        x.strokeStyle = U.pick(['#c23b2e', '#20232a', '#e8b83e', '#2e6fc2']);
        wob(x, U.rand(0, 128), U.rand(0, 96), U.rand(0, 128), U.rand(0, 96), 4, 6);
      }
    }
    // ornate frame
    x.strokeStyle = '#b8912e'; x.lineWidth = 9;
    x.strokeRect(4, 4, 120, 88);
    border(x, 128, 96, 4, 'rgba(90,70,10,0.9)');
    return tex(c);
  };

  // ---------- downtown surfaces ----------
  T.cityWall = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#cdd2d8'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(60,66,74,0.4)'; x.lineWidth = 3;
    wob(x, 2, 42, 126, 42, 6, 1.5);
    wob(x, 2, 86, 126, 86, 6, 1.5);
    wob(x, 64, 2, 64, 126, 6, 1.5);
    for (let i = 0; i < 5; i++) blob(x, U.rand(10, 118), U.rand(10, 118), U.rand(3, 7), 6, 'rgba(150,156,164,0.5)', null);
    border(x, 128, 128, 6, 'rgba(40,44,52,0.8)');
    return tex(c);
  };
  T.billboard = function () {
    const { c, x } = cnv(256, 128);
    x.fillStyle = '#f5ead2'; x.fillRect(0, 0, 256, 128);
    // burger
    blob(x, 66, 66, 34, 9, '#e8a23e', 'rgba(90,50,10,0.8)', 4);
    x.fillStyle = '#c23b2e'; x.fillRect(38, 58, 58, 10);
    x.fillStyle = '#4a8f3f'; x.fillRect(42, 50, 50, 7);
    // shouting text
    x.fillStyle = '#c2312e';
    x.font = 'bold 30px "Comic Sans MS", cursive';
    x.fillText('BIG BITE', 118, 56);
    x.fillStyle = '#20232a';
    x.font = 'bold 20px "Comic Sans MS", cursive';
    x.fillText('BURGERS!', 122, 84);
    x.font = 'bold 12px "Comic Sans MS", cursive';
    x.fillText('now 40% rubble-free', 118, 108);
    border(x, 256, 128, 8);
    return tex(c);
  };
  T.tiki = function () {
    const { c, x } = cnv(64, 128);
    x.fillStyle = '#8a6a45'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(45,30,15,0.9)'; x.lineWidth = 4; x.lineCap = 'round';
    // heavy brow + angry eyes
    wob(x, 8, 30, 56, 26, 4, 2);
    x.fillStyle = 'rgba(45,30,15,0.9)';
    x.fillRect(14, 36, 12, 9); x.fillRect(38, 36, 12, 9);
    // long nose
    wob(x, 32, 40, 32, 68, 3, 1.5);
    wob(x, 24, 68, 40, 68, 2, 1.5);
    // toothy grimace
    x.strokeRect(14, 80, 36, 16);
    for (let px = 20; px <= 44; px += 8) wob(x, px, 80, px, 96, 2, 1);
    // side carvings
    wob(x, 6, 108, 58, 112, 5, 2);
    border(x, 64, 128, 6, 'rgba(35,22,10,0.9)');
    return tex(c);
  };
  T.thatch = function () {
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#d6a852'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(140,95,30,0.55)'; x.lineWidth = 2.5; x.lineCap = 'round';
    for (let y = 10; y < 128; y += 16)
      for (let px = 4; px < 128; px += 11)
        wob(x, px, y, px + U.rand(-3, 3), y + 13, 2, 2);
    border(x, 128, 128, 6);
    return tex(c);
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

  // ---------- gold rush gulch ----------
  T.barnwood = function () { // sun-bleached vertical planks, tinted per instance
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(60,35,15,0.35)'; x.lineWidth = 3;
    for (let px = 16; px < 128; px += 21) wob(x, px, 2, px + U.rand(-3, 3), 126, 8, 2.5);
    x.strokeStyle = 'rgba(60,35,15,0.18)'; x.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const gx = U.rand(4, 122), gy = U.rand(8, 118);
      wob(x, gx, gy, gx + U.rand(-2, 2), gy + U.rand(10, 26), 3, 1.5);
    }
    // knots + nail heads
    x.fillStyle = 'rgba(60,35,15,0.4)';
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(U.rand(10, 118), U.rand(10, 118), U.rand(2, 4), 0, 7); x.fill(); }
    x.fillStyle = 'rgba(30,30,30,0.55)';
    for (let px = 16; px < 128; px += 21) { x.fillRect(px - 6, 10, 3, 3); x.fillRect(px - 6, 114, 3, 3); }
    border(x, 128, 128, 6);
    return tex(c);
  };
  T.redrock = function () { // layered canyon stone
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#c96f3e'; x.fillRect(0, 0, 128, 128);
    const bands = ['#b95f34', '#d67f48', '#a95530', '#e08d52'];
    let y = 0;
    for (let i = 0; y < 128; i++) {
      const h = U.rand(10, 24);
      x.fillStyle = bands[i % bands.length];
      x.fillRect(0, y, 128, h);
      x.strokeStyle = 'rgba(60,25,10,0.4)'; x.lineWidth = 3;
      wob(x, 0, y, 128, y + U.rand(-3, 3), 8, 2.5);
      y += h;
    }
    x.strokeStyle = 'rgba(60,25,10,0.3)'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const gx = U.rand(8, 120), gy = U.rand(8, 108);
      wob(x, gx, gy, gx + U.rand(-4, 4), gy + U.rand(8, 18), 3, 2);
    }
    return tex(c);
  };
  T.desert = function () { // dusty red-orange hardpan
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#d9a06a'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(190,120,70,0.5)';
    for (let i = 0; i < 26; i++) blob(x, U.rand(0, 128), U.rand(0, 128), U.rand(3, 9), 7, 'rgba(196,128,78,0.45)');
    x.fillStyle = 'rgba(120,70,40,0.5)';
    for (let i = 0; i < 30; i++) x.fillRect(U.rand(0, 126), U.rand(0, 126), 2, 2);
    // cracked earth lines
    x.strokeStyle = 'rgba(140,85,50,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const gx = U.rand(0, 128), gy = U.rand(0, 128);
      wob(x, gx, gy, gx + U.rand(-30, 30), gy + U.rand(-30, 30), 5, 4);
    }
    return tex(c, [1, 1]);
  };
  T.tnt = function () { // red crate, rope handle, big letters
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#c8402e'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(60,15,10,0.6)'; x.lineWidth = 4;
    wob(x, 0, 24, 128, 24, 6, 2); wob(x, 0, 104, 128, 104, 6, 2);
    x.fillStyle = '#f5e6c8';
    x.font = 'bold 46px "Comic Sans MS", cursive';
    x.textAlign = 'center';
    x.strokeStyle = '#3a1008'; x.lineWidth = 6;
    x.strokeText('TNT', 64, 80); x.fillText('TNT', 64, 80);
    border(x, 128, 128, 7, 'rgba(50,12,8,0.9)');
    return tex(c);
  };
  T.railside = function () { // weathered boxcar slats
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(40,25,15,0.4)'; x.lineWidth = 3;
    for (let y = 18; y < 128; y += 20) wob(x, 2, y, 126, y, 7, 2);
    x.strokeStyle = 'rgba(40,25,15,0.55)'; x.lineWidth = 5;
    wob(x, 64, 4, 64, 124, 6, 2);
    border(x, 128, 128, 6);
    return tex(c);
  };
  T.wanted = function () { // WANTED poster board
    const { c, x } = cnv(128, 128);
    x.fillStyle = '#e8d5a8'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#3a2a18';
    x.font = 'bold 24px "Comic Sans MS", cursive'; x.textAlign = 'center';
    x.fillText('WANTED', 64, 30);
    blob(x, 64, 66, 22, 9, '#c9a06a', '#3a2a18', 3);
    x.fillRect(52, 58, 6, 5); x.fillRect(70, 58, 6, 5); // eyes
    x.font = 'bold 15px "Comic Sans MS", cursive';
    x.fillText('$10,000', 64, 112);
    border(x, 128, 128, 5, 'rgba(58,42,24,0.9)');
    return tex(c);
  };

  T.bigSign = function (text, bg, fg) { // painted park/ride signboard
    const { c, x } = cnv(256, 64);
    x.fillStyle = bg || '#d94a4a'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = fg || '#fff8e8';
    x.font = 'bold 34px "Comic Sans MS", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 34);
    border(x, 256, 64, 5, 'rgba(0,0,0,0.8)');
    return tex(c);
  };
  T.heraldry = function (bg) { // banner cloth: chevron + roundel on a field
    const { c, x } = cnv(64, 96);
    x.fillStyle = bg || '#a82a2a'; x.fillRect(0, 0, 64, 96);
    x.fillStyle = '#e8c55a';
    x.beginPath(); x.moveTo(5, 34); x.lineTo(32, 52); x.lineTo(59, 34);
    x.lineTo(59, 46); x.lineTo(32, 64); x.lineTo(5, 46); x.closePath(); x.fill();
    x.beginPath(); x.arc(32, 20, 8, 0, Math.PI * 2); x.fill();
    border(x, 64, 96, 4, 'rgba(0,0,0,0.75)');
    return tex(c);
  };
  T.mascot = function () { // MR. WHIRLY, beloved and doomed
    const { c, x } = cnv(96, 128);
    x.fillStyle = '#f2a03a'; x.fillRect(0, 0, 96, 128);
    x.fillStyle = '#ffd9a0';
    x.beginPath(); x.ellipse(48, 92, 26, 28, 0, 0, Math.PI * 2); x.fill(); // belly
    x.fillStyle = '#2a2a2e';
    x.beginPath(); x.arc(30, 28, 6, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(66, 28, 6, 0, Math.PI * 2); x.fill();
    x.lineWidth = 4; x.strokeStyle = '#2a2a2e';
    x.beginPath(); x.arc(48, 36, 15, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); // smile
    x.fillStyle = '#e8823a'; x.beginPath(); x.arc(48, 36, 5, 0, Math.PI * 2); x.fill();
    border(x, 96, 128, 5, 'rgba(0,0,0,0.8)');
    return tex(c);
  };

  return T;
})();
