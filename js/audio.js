// audio.js — procedural Web Audio sound engine
G.audio = (function () {
  let ctx = null, master = null, comp = null;
  let noiseBuf = null, crackleBuf = null;
  let volume = 0.8;
  let voices = 0;
  const MAX_VOICES = 26;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 8;
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(comp); comp.connect(ctx.destination);
    // white noise
    const len = ctx.sampleRate * 1.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown-ish crackle
    crackleBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const c = crackleBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.18); last *= 0.985; c[i] = last * 3.2; }
  }
  function setVolume(v) { volume = v; if (master) master.gain.value = v; }

  // spatialization relative to player: returns {gain, pan, lp} or null if inaudible
  function spatial(pos, base, maxDist) {
    if (!pos || !G.player) return { g: base, pan: 0, lp: 18000 };
    const p = G.player.pos;
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const d = Math.hypot(dx, dz, (pos.y || 1.5) - 1.6);
    if (d > maxDist) return null;
    const g = base * Math.min(1, 9 / (d + 2));
    const yaw = G.player.yaw || 0;
    // right vector = (cos(yaw)... ) — compute side component
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = fz, rz = -fx;
    const nl = Math.hypot(dx, dz) || 1;
    const pan = U.clamp((dx * rx + dz * rz) / nl, -1, 1) * 0.8;
    const lp = U.clamp(18000 - d * 260, 700, 18000);
    return { g, pan, lp };
  }

  function playBuf(buf, opts) {
    if (!ctx || voices >= MAX_VOICES) return null;
    const o = opts || {};
    const sp = spatial(o.pos, o.gain === undefined ? 0.5 : o.gain, o.maxDist || 80);
    if (!sp) return null;
    voices++;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate || 1;
    const filt = ctx.createBiquadFilter();
    filt.type = o.hp ? 'highpass' : 'lowpass';
    filt.frequency.value = o.hp ? o.hp : Math.min(o.lp || 18000, sp.lp);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const dur = o.dur || 0.2;
    g.gain.setValueAtTime(sp.g, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(filt); filt.connect(g);
    if (pan) { pan.pan.value = sp.pan; g.connect(pan); pan.connect(master); }
    else g.connect(master);
    src.start(t, o.offset || U.rand(0, 0.4));
    src.stop(t + dur + 0.05);
    src.onended = () => { voices--; };
    return { src, g };
  }
  function tone(type, f0, f1, dur, gain, pos, maxDist) {
    if (!ctx || voices >= MAX_VOICES) return;
    const sp = spatial(pos, gain, maxDist || 80);
    if (!sp) return;
    voices++;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(sp.g, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan; g.connect(pan); pan.connect(master); }
    else g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
    osc.onended = () => { voices--; };
  }

  const A = { init, setVolume };

  // capture hook: a MediaStream of the full mix (used by the trailer recorder)
  A.tapStream = function () {
    init();
    if (!ctx) return null;
    const dst = ctx.createMediaStreamDestination();
    comp.connect(dst);
    return dst.stream;
  };

  A.shot = function (kind, pos) {
    if (!ctx) return;
    if (kind === 'ar') {
      playBuf(noiseBuf, { pos, gain: 0.55, dur: 0.09, lp: 9000, rate: U.rand(0.9, 1.1) });
      tone('sine', 150, 45, 0.1, 0.5, pos);
    } else if (kind === 'sg') {
      playBuf(noiseBuf, { pos, gain: 0.85, dur: 0.22, lp: 5200, rate: U.rand(0.75, 0.85) });
      tone('sine', 110, 32, 0.2, 0.7, pos);
    } else if (kind === 'sr') {
      playBuf(noiseBuf, { pos, gain: 0.9, dur: 0.28, lp: 7500, rate: 0.72 });
      tone('sine', 130, 28, 0.26, 0.75, pos);
      tone('square', 2400, 900, 0.06, 0.06, pos);
    } else if (kind === 'rl') {
      playBuf(noiseBuf, { pos, gain: 0.6, dur: 0.5, lp: 3000, rate: 0.6 });
      tone('sawtooth', 90, 30, 0.45, 0.3, pos);
    } else if (kind === 'rev') { // big single western crack
      playBuf(noiseBuf, { pos, gain: 0.75, dur: 0.16, lp: 6000, rate: 0.8 });
      tone('sine', 165, 60, 0.13, 0.55, pos);
    } else if (kind === 'smg') { // light rapid snap
      playBuf(noiseBuf, { pos, gain: 0.4, dur: 0.06, lp: 10000, rate: U.rand(1.05, 1.2) });
      tone('sine', 190, 70, 0.06, 0.35, pos);
    } else if (kind === 'dmr') { // sharp mid-weight report
      playBuf(noiseBuf, { pos, gain: 0.7, dur: 0.15, lp: 8200, rate: 0.85 });
      tone('sine', 145, 40, 0.14, 0.55, pos);
    } else if (kind === 'lmg') { // heavy thudding chug
      playBuf(noiseBuf, { pos, gain: 0.6, dur: 0.11, lp: 5600, rate: U.rand(0.78, 0.9) });
      tone('sine', 120, 35, 0.11, 0.5, pos);
    } else { // bot rifle
      playBuf(noiseBuf, { pos, gain: 0.42, dur: 0.08, lp: 6500, rate: U.rand(0.85, 1.05), maxDist: 90 });
      tone('sine', 130, 42, 0.09, 0.32, pos, 90);
    }
  };
  A.explosion = function (pos, big) {
    if (!ctx) return;
    const s = big ? 1.25 : 1;
    playBuf(crackleBuf, { pos, gain: 1.0 * s, dur: 0.9 * s, lp: 2400, rate: 0.7, maxDist: 160 });
    playBuf(noiseBuf, { pos, gain: 0.7 * s, dur: 0.45, lp: 1200, rate: 0.5, maxDist: 160 });
    tone('sine', 70, 22, 0.8 * s, 0.9 * s, pos, 160);
    if (G.player) {
      const d = U.dist2d(pos.x, pos.z, G.player.pos.x, G.player.pos.z);
      if (d < 14) tone('sine', 900, 880, 0.5, 0.05 * (1 - d / 14)); // ear ring
    }
  };
  A.reload = function () {
    if (!ctx) return;
    playBuf(noiseBuf, { gain: 0.12, dur: 0.04, hp: 2000 });
    setTimeout(() => playBuf(noiseBuf, { gain: 0.14, dur: 0.05, hp: 1500 }), 160);
    setTimeout(() => playBuf(noiseBuf, { gain: 0.18, dur: 0.05, hp: 1200 }), 420);
  };
  A.click = function () { tone('square', 2200, 1800, 0.03, 0.08); };
  A.hit = function () { tone('square', 1200, 900, 0.05, 0.12); };
  A.kill = function () { tone('square', 700, 1400, 0.09, 0.16); };
  A.head = function () { tone('triangle', 1800, 2400, 0.08, 0.16); };
  A.glass = function (pos) {
    playBuf(noiseBuf, { pos, gain: 0.4, dur: 0.25, hp: 3200, rate: 1.3 });
    tone('triangle', 2600, 700, 0.22, 0.1, pos);
  };
  A.whizz = function () { playBuf(noiseBuf, { gain: 0.16, dur: 0.14, hp: 1800, rate: U.rand(1.4, 1.9) }); };
  A.thud = function (pos) { tone('sine', 90, 40, 0.08, 0.18, pos, 40); };
  A.boing = function (pos) { tone('sine', 140, 420, 0.22, 0.4, pos, 60); tone('square', 70, 210, 0.16, 0.1, pos, 60); };
  A.bounce = function (pos) { tone('square', 500, 220, 0.05, 0.1, pos, 40); };
  A.uav = function () { tone('sawtooth', 300, 600, 0.35, 0.14); setTimeout(() => tone('sawtooth', 600, 900, 0.3, 0.12), 300); };
  A.airstrikeCall = function () { tone('square', 880, 880, 0.1, 0.12); setTimeout(() => tone('square', 880, 880, 0.1, 0.12), 200); };
  A.jet = function () { playBuf(noiseBuf, { gain: 0.5, dur: 1.6, lp: 2600, rate: U.rand(0.55, 0.65) }); };
  A.melee = function () { playBuf(noiseBuf, { gain: 0.25, dur: 0.09, hp: 800, rate: 1.6 }); };
  A.hurt = function () { tone('sawtooth', 220, 90, 0.12, 0.14); };
  A.squish = function (pos) { playBuf(noiseBuf, { pos, gain: 0.3, dur: 0.12, lp: 900, rate: 0.5 }); };

  return A;
})();
