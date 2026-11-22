// FAIR SHARE: one straight cut per treat, split it into exactly the share asked (half, a third, a quarter).
// Daily = five treats seeded by the date (same for everyone). Practice = endless.
(() => {
  const $ = id => document.getElementById(id);
  const store = Ballpark.store('fairshare');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;

  // ---------- geometry (unit space, y down) ----------
  const area = P => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j].x * P[i].y - P[i].x * P[j].y; return a / 2; };
  function centroid(P) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const f = P[j].x * P[i].y - P[i].x * P[j].y; a += f; cx += (P[j].x + P[i].x) * f; cy += (P[j].y + P[i].y) * f;
    }
    return Math.abs(a) < 1e-9 ? { x: 0, y: 0 } : { x: cx / (3 * a), y: cy / (3 * a) };
  }
  function clip(P, p, n, side) { // keep the part where side * n·(q - p) >= 0 (works for concave shapes too: area stays exact)
    const out = [], f = q => side * (n.x * (q.x - p.x) + n.y * (q.y - p.y));
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    }
    return out;
  }
  const fracOn = (T, p, n) => { const Q = clip(T.poly, p, n, 1); return Q.length < 3 ? 0 : Math.abs(area(Q)) / T.area; };
  function inside(P, x, y) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  function normalize(P) {
    const c = centroid(P); let m = 0;
    const Q = P.map(q => ({ x: q.x - c.x, y: q.y - c.y }));
    for (const q of Q) m = Math.max(m, Math.hypot(q.x, q.y));
    return Q.map(q => ({ x: q.x / m, y: q.y / m }));
  }
  function chaikin(P, it = 2, q = 0.25) {
    for (let k = 0; k < it; k++) {
      const Q = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        Q.push({ x: (1 - q) * a.x + q * b.x, y: (1 - q) * a.y + q * b.y }, { x: q * a.x + (1 - q) * b.x, y: q * a.y + (1 - q) * b.y });
      }
      P = Q;
    }
    return P;
  }
  const radial = (N, rf) => Array.from({ length: N }, (_, i) => { const t = i / N * TAU, r = rf(t); return { x: Math.cos(t) * r, y: Math.sin(t) * r }; });
  const wobble = r => { const w = [2, 3, 4, 5].map(k => [k, (r() * 2 - 1) * (0.11 / k * 2), r() * TAU]); return t => 1 + w.reduce((s, [k, a, ph]) => s + a * Math.sin(k * t + ph), 0); };

  // ---------- treat shapes ----------
  const SHAPES = {
    blob: r => radial(128, wobble(r)),
    bitten(r) {
      const base = wobble(r), bites = [];
      const nb = r() < 0.45 ? 2 : 1, a0 = r() * TAU;
      for (let i = 0; i < nb; i++) { const a = a0 + i * (1.2 + r() * 1.4); bites.push({ x: Math.cos(a) * 1.02, y: Math.sin(a) * 1.02, r: 0.3 + r() * 0.12 }); }
      return radial(160, t => {
        let R = base(t); const u = { x: Math.cos(t), y: Math.sin(t) };
        for (const b of bites) { // nearest hit of the ray with the bite circle
          const uc = u.x * b.x + u.y * b.y, disc = uc * uc - (b.x * b.x + b.y * b.y - b.r * b.r);
          if (disc > 0) { const hit = uc - Math.sqrt(disc); if (hit > 0 && hit < R) R = hit; }
        }
        return R;
      });
    },
    star(r) {
      const n = 5 + Math.floor(r() * 3), inner = 0.5 + r() * 0.16, P = [];
      for (let i = 0; i < n * 2; i++) { const t = i / (n * 2) * TAU - Math.PI / 2, R = i % 2 ? inner : 1; P.push({ x: Math.cos(t) * R, y: Math.sin(t) * R }); }
      return chaikin(P, 3, 0.2);
    },
    heart() {
      return Array.from({ length: 140 }, (_, i) => {
        const t = i / 140 * TAU, s = Math.sin(t);
        return { x: 16 * s * s * s, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
      });
    },
    toast(r) {
      const w = 0.74 + r() * 0.1, top = -0.32, P = [{ x: -w, y: 0.8 }, { x: w, y: 0.8 }, { x: w, y: top + 0.06 }, { x: w + 0.15, y: top - 0.03 }];
      for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI; P.push({ x: Math.cos(a) * (w + 0.15), y: top - 0.03 - Math.sin(a) * (0.55 + r() * 0.01) }); }
      P.push({ x: -w, y: top + 0.06 });
      return chaikin(P, 2, 0.2);
    },
    wedge(r) {
      const tip = 0.3 + r() * 0.6;
      return chaikin([{ x: -1, y: 0.55 }, { x: 1, y: 0.55 }, { x: tip, y: -0.75 }], 2, 0.06);
    },
    tetro(r) {
      const L = [
        [[0, 0], [1, 0], [1, 2], [2, 2], [2, 3], [0, 3]],
        [[0, 0], [3, 0], [3, 1], [2, 1], [2, 2], [1, 2], [1, 1], [0, 1]],
        [[0, 0], [1, 0], [1, 1], [2, 1], [2, 0], [3, 0], [3, 2], [0, 2]],
        [[1, 0], [3, 0], [3, 1], [2, 1], [2, 2], [0, 2], [0, 1], [1, 1]],
        [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]],
      ][Math.floor(r() * 5)];
      return chaikin(L.map(([x, y]) => ({ x, y })), 2, 0.07);
    },
    crescent(r) { // outer circle R=1 minus an offset circle
      const d = 0.45 + r() * 0.1, rr = 0.7 + r() * 0.08;
      const ix = (d * d + 1 - rr * rr) / (2 * d), iy = Math.sqrt(1 - ix * ix);
      const a0 = Math.atan2(iy, ix), b0 = Math.atan2(iy, ix - d), P = [];
      for (let i = 0; i <= 60; i++) { const a = a0 + (TAU - 2 * a0) * i / 60; P.push({ x: Math.cos(a), y: Math.sin(a) }); }
      for (let i = 1; i < 50; i++) { const b = (TAU - b0) - (TAU - 2 * b0) * i / 50; P.push({ x: d + Math.cos(b) * rr, y: Math.sin(b) * rr }); }
      return P;
    },
    cloud(r) { // far edge of a ring of overlapping circles: a lumpy puff with real dents
      const k = 5 + Math.floor(r() * 3), C = [];
      for (let i = 0; i < k; i++) { const a = i / k * TAU + r() * 0.3; C.push({ x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5, r: 0.42 + r() * 0.12 }); }
      return radial(180, t => {
        const u = { x: Math.cos(t), y: Math.sin(t) }; let R = 0.45;
        for (const c of C) { const uc = u.x * c.x + u.y * c.y, disc = uc * uc - (c.x * c.x + c.y * c.y - c.r * c.r); if (disc > 0) R = Math.max(R, uc + Math.sqrt(disc)); }
        return R;
      });
    },
  };

  const FL = {
    cookie: { base: '#d9a15a', hi: '#f2cb8a', edge: '#a8692f', rim: 'rgba(130,70,20,.45)', top: 'chips' },
    choc: { base: '#6e3f22', hi: '#93603a', edge: '#43240f', rim: 'rgba(25,10,2,.55)', top: 'drizzle' },
    lime: { base: '#bfe07a', hi: '#e6f6b6', edge: '#7ea33c', rim: 'rgba(80,120,30,.5)', top: 'dots', dot: '#fffbe6' },
    berry: { base: '#a596ef', hi: '#d4ccff', edge: '#6b5bd0', rim: 'rgba(70,50,170,.5)', top: 'berries' },
    straw: { base: '#f7a9c4', hi: '#ffd9e6', edge: '#d46b92', rim: 'rgba(190,70,110,.45)', top: 'sprinkles' },
    cheese: { base: '#ffd45e', hi: '#fff0b0', edge: '#dba025', rim: 'rgba(200,140,20,.45)', top: 'holes' },
    toast: { base: '#f0c886', hi: '#fae3b8', edge: '#a8662a', rim: 'rgba(150,80,20,.95)', rimW: 0.2, top: 'crumbs' },
    croissant: { base: '#e8a64a', hi: '#f8d48e', edge: '#a2601e', rim: 'rgba(140,70,15,.5)', top: 'stripes' },
    puff: { base: '#f2dfbd', hi: '#fffaf0', edge: '#c9a676', rim: 'rgba(170,120,60,.4)', top: 'dust' },
  };
  const KINDS = {
    blob: [['cookie', 'Choc-chip cookie'], ['lime', 'Lime tart'], ['berry', 'Blueberry pancake'], ['choc', 'Double chocolate cookie']],
    bitten: [['cookie', 'Somebody bit the cookie'], ['berry', 'Nibbled blueberry pancake']],
    star: [['straw', 'Strawberry star cake'], ['lime', 'Lime star tart'], ['berry', 'Blueberry star']],
    heart: [['straw', 'Strawberry heart'], ['choc', 'Chocolate heart']],
    toast: [['toast', 'Slice of toast']],
    wedge: [['cheese', 'Wedge of cheese']],
    tetro: [['choc', 'Fudge brownie'], ['lime', 'Lime jelly slab'], ['berry', 'Blueberry traybake']],
    crescent: [['croissant', 'Croissant'], ['cheese', 'Cheese moon']],
    cloud: [['puff', 'Cream puff'], ['straw', 'Strawberry cloud cake'], ['berry', 'Blueberry cloud']],
  };

  function makeTreat(kind, seed) {
    const r = Ballpark.rng('fairshare|' + seed);
    const poly = normalize(SHAPES[kind](r));
    const [fk, name] = KINDS[kind][Math.floor(r() * KINDS[kind].length)];
    const fl = FL[fk], tops = [];
    const n = { chips: 16, dots: 22, berries: 11, sprinkles: 55, holes: 9, crumbs: 90, dust: 70, drizzle: 0, stripes: 0 }[fl.top];
    for (let tries = 0; tops.length < n && tries < 4000; tries++) {
      const x = r() * 2 - 1, y = r() * 2 - 1;
      if (inside(poly, x, y)) tops.push({ x, y, s: r(), a: r() * TAU, c: Math.floor(r() * 5) });
    }
    const lines = [];
    if (fl.top === 'drizzle') {
      const a = r() * TAU;
      for (let k = -3; k <= 3; k++) { const L = []; for (let i = -6; i <= 6; i++) L.push({ u: i * 0.2, v: k * 0.27 + (i % 2 ? 0.09 : -0.09) + (r() - 0.5) * 0.05 }); lines.push({ a, L }); }
    }
    if (fl.top === 'stripes') { const a = r() * 0.6 - 0.3; for (let k = -4; k <= 4; k++) lines.push({ a, L: [{ u: -1.4, v: k * 0.24 }, { u: 0, v: k * 0.24 + 0.12 }, { u: 1.4, v: k * 0.24 }] }); }
    return { kind, name, fl, poly, area: Math.abs(area(poly)), tops, lines, rot: r() * TAU, seed };
  }

  // ---------- rounds ----------
  const TARGETS = { 0.5: ['HALF', 'Half', 'Cut it in <em>HALF</em>'], [1 / 3]: ['ONE THIRD', 'Third', 'Cut off exactly <em>ONE THIRD</em>'], 0.25: ['ONE QUARTER', 'Quarter', 'Cut off exactly <em>ONE QUARTER</em>'] };
  const DAILY = [
    { t: 0.5, kinds: ['blob', 'toast', 'heart'] },
    { t: 0.5, kinds: ['star', 'cloud', 'wedge'] },
    { t: 0.5, kinds: ['tetro', 'bitten', 'crescent'] },
    { t: 1 / 3, kinds: ['blob', 'heart', 'toast', 'wedge', 'cloud'] },
    { t: 0.25, kinds: ['star', 'tetro', 'crescent', 'bitten', 'cloud'] },
  ];
  const ALL_KINDS = Object.keys(SHAPES);
  function dailyRound(day, i) {
    // no shape twice in one day: earlier rounds' picks are replayed and left out of the pool
    const used = new Set();
    for (let j = 0; j < i; j++) used.add(dailyRound(day, j).kind);
    const r = Ballpark.rng(`fairshare-day|${day}|${i}`), spec = DAILY[i];
    const pool = spec.kinds.filter(k => !used.has(k));
    return { t: spec.t, kind: pool[Math.floor(r() * pool.length)], seed: `${day}|${i}` };
  }

  // ---------- state ----------
  const cv = $('c'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, C = { x: 0, y: 0 }, S = 100;
  let mode = 'daily', round = null, T = null, phase = 'idle', drag = null, kb = null, res = null, animT0 = 0, raf = 0;
  let practice = { n: 0, sum: 0 };

  const toScreen = u => { const c = Math.cos(T.rot), s = Math.sin(T.rot); return { x: C.x + S * (u.x * c - u.y * s), y: C.y + S * (u.x * s + u.y * c) }; };
  const toUnit = q => { const c = Math.cos(T.rot), s = Math.sin(T.rot), x = (q.x - C.x) / S, y = (q.y - C.y) / S; return { x: x * c + y * s, y: -x * s + y * c }; };

  function layout() {
    const box = $('stage').getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); W = box.width; H = box.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    C = { x: W / 2, y: H / 2 }; S = Math.max(40, Math.min(W * 0.4, H * 0.4, 260));
    draw();
  }
  addEventListener('resize', layout);

  // ---------- audio ----------
  let ac = null, muted = store.get('muted', false);
  function audio() {
    if (muted) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function sfxCut() {
    const a = audio(); if (!a) return;
    const len = 0.2, b = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = b; f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(6000, a.currentTime); f.frequency.exponentialRampToValueAtTime(1400, a.currentTime + len);
    g.gain.value = 0.45; s.connect(f).connect(g).connect(a.destination); s.start();
  }
  function sfxScore(err) {
    const a = audio(); if (!a) return;
    const notes = err < 1 ? [660, 880, 1320] : err < 3 ? [660, 880] : err < 6 ? [587] : [311, 233];
    notes.forEach((hz, i) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + 0.12 + i * 0.09;
      o.type = err < 6 ? 'triangle' : 'sine'; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.4);
    });
  }
  const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function paintMute() { $('mute').innerHTML = muted ? ICON_OFF : ICON_ON; $('mute').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); }
  $('mute').onclick = () => { muted = !muted; store.set('muted', muted); paintMute(); };
  paintMute();

  // ---------- drawing ----------
  function path(P) { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.closePath(); }
  const SPR = ['#ffffff', '#ffe066', '#7dd3fc', '#86efac', '#c084fc'];
  function drawTreat(px, shadow) {
    const { fl, poly } = T;
    ctx.save();
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.42)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 9; }
    const g = ctx.createRadialGradient(-0.3, -0.38, 0.05, 0, 0, 1.2);
    g.addColorStop(0, fl.hi); g.addColorStop(0.55, fl.base); g.addColorStop(1, fl.edge);
    path(poly); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.save(); path(poly); ctx.clip();
    for (const d of T.tops) {
      const k = fl.top;
      if (k === 'chips') { ctx.fillStyle = '#4a2a14'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 0.05 + d.s * 0.035, 0.038 + d.s * 0.02, d.a, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,220,180,.25)'; ctx.beginPath(); ctx.arc(d.x - 0.015, d.y - 0.015, 0.012, 0, TAU); ctx.fill(); }
      else if (k === 'dots') { ctx.fillStyle = fl.dot; ctx.beginPath(); ctx.arc(d.x, d.y, 0.03 + d.s * 0.03, 0, TAU); ctx.fill(); }
      else if (k === 'berries') { ctx.fillStyle = '#3b3299'; ctx.beginPath(); ctx.arc(d.x, d.y, 0.055 + d.s * 0.03, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(d.x - 0.02, d.y - 0.02, 0.014, 0, TAU); ctx.fill(); }
      else if (k === 'sprinkles') { ctx.strokeStyle = SPR[d.c]; ctx.lineWidth = 0.028; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(d.x - Math.cos(d.a) * 0.04, d.y - Math.sin(d.a) * 0.04); ctx.lineTo(d.x + Math.cos(d.a) * 0.04, d.y + Math.sin(d.a) * 0.04); ctx.stroke(); }
      else if (k === 'holes') { const R = 0.05 + d.s * 0.07; ctx.fillStyle = 'rgba(214,150,25,.55)'; ctx.beginPath(); ctx.arc(d.x, d.y, R, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,240,180,.5)'; ctx.beginPath(); ctx.arc(d.x + R * 0.25, d.y + R * 0.25, R * 0.6, 0, TAU); ctx.fill(); }
      else if (k === 'crumbs') { ctx.fillStyle = 'rgba(160,95,35,.28)'; ctx.beginPath(); ctx.arc(d.x, d.y, 0.008 + d.s * 0.012, 0, TAU); ctx.fill(); }
      else if (k === 'dust') { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(d.x, d.y, 0.008 + d.s * 0.012, 0, TAU); ctx.fill(); }
    }
    for (const ln of T.lines) {
      const c = Math.cos(ln.a), s = Math.sin(ln.a);
      ctx.strokeStyle = fl.top === 'drizzle' ? 'rgba(255,244,228,.85)' : 'rgba(140,70,15,.45)';
      ctx.lineWidth = fl.top === 'drizzle' ? 0.03 : 0.035; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ln.L.forEach((q, i) => { const x = q.u * c - q.v * s, y = q.u * s + q.v * c; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    path(poly); ctx.lineWidth = fl.rimW || 0.1; ctx.strokeStyle = fl.rim; ctx.stroke();
    ctx.restore();
    path(poly); ctx.lineWidth = 1.6 * px; ctx.strokeStyle = fl.edge; ctx.stroke();
  }
  function halfPlane(p, d, n, side) {
    const B = 12;
    ctx.beginPath();
    ctx.moveTo(p.x + d.x * B, p.y + d.y * B); ctx.lineTo(p.x - d.x * B, p.y - d.y * B);
    ctx.lineTo(p.x - d.x * B + n.x * B * side, p.y - d.y * B + n.y * B * side); ctx.lineTo(p.x + d.x * B + n.x * B * side, p.y + d.y * B + n.y * B * side);
    ctx.closePath();
  }
  function drawBoard() {
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    for (let y = 18; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y + 6, W * 0.6, y - 6, W, y + 2); ctx.stroke(); }
    if (!T) return;
    const g = ctx.createRadialGradient(C.x, C.y - S * 0.2, S * 0.2, C.x, C.y, S * 1.3);
    g.addColorStop(0, '#f6efe3'); g.addColorStop(0.85, '#e4d6c0'); g.addColorStop(1, '#c9b79c');
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C.x, C.y, S * 1.27, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(160,140,110,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(C.x, C.y, S * 1.08, 0, TAU); ctx.stroke();
  }
  function screenLine(a, b, solid) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, F = 3000;
    ctx.save(); ctx.lineCap = 'round';
    ctx.setLineDash([10, 9]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x - ux * F, a.y - uy * F); ctx.lineTo(a.x + ux * F, a.y + uy * F); ctx.stroke();
    ctx.setLineDash([]);
    if (solid) { ctx.shadowColor = 'rgba(160,220,255,.9)'; ctx.shadowBlur = 10; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
  }
  const easeOutBack = x => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

  function draw(now = performance.now()) {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard();
    if (!T) return;
    const px = 1 / S;
    ctx.save(); ctx.translate(C.x, C.y); ctx.rotate(T.rot); ctx.scale(S, S);
    let e = 1;
    if (!res) drawTreat(px, true);
    else {
      e = RM ? 1 : Math.min(1, (now - animT0) / 520);
      const gap = 0.075 * easeOutBack(e);
      for (const side of [1, -1]) {
        ctx.save(); ctx.translate(res.n.x * gap * side, res.n.y * gap * side);
        halfPlane(res.p, res.d, res.n, side); ctx.clip();
        drawTreat(px, true);
        ctx.save(); path(T.poly); ctx.clip(); // cut face: a pale crumb line along the edge of the slice
        ctx.strokeStyle = 'rgba(255,248,235,.55)'; ctx.lineWidth = 0.035;
        ctx.beginPath(); ctx.moveTo(res.p.x - res.d.x * 3, res.p.y - res.d.y * 3); ctx.lineTo(res.p.x + res.d.x * 3, res.p.y + res.d.y * 3); ctx.stroke();
        ctx.restore(); ctx.restore();
      }
      if (e >= 1 && res.ghost) { // where the perfect cut (parallel to yours) would have been
        const g = res.ghost, q = { x: g.p.x + res.n.x * 0.075 * g.side, y: g.p.y + res.n.y * 0.075 * g.side };
        const o = q.x * res.d.x + q.y * res.d.y, m = { x: q.x - res.d.x * o, y: q.y - res.d.y * o };
        ctx.setLineDash([0.05, 0.05]); ctx.strokeStyle = 'rgba(40,25,10,.75)'; ctx.lineWidth = 2.2 * px;
        ctx.beginPath(); ctx.moveTo(m.x - res.d.x * 1.15, m.y - res.d.y * 1.15); ctx.lineTo(m.x + res.d.x * 1.15, m.y + res.d.y * 1.15); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
    if (res && e >= 0.6) { // percentage on each piece
      for (const side of [1, -1]) {
        const c = side === 1 ? res.c1 : res.c2, f = side === 1 ? res.f : 1 - res.f;
        const q = toScreen({ x: c.x + res.n.x * 0.075 * side, y: c.y + res.n.y * 0.075 * side });
        const mine = res.target === 0.5 || side === res.side;
        const x = Math.max(44, Math.min(W - 44, q.x)), y = Math.max(20, Math.min(H - 20, q.y));
        const txt = (f * 100).toFixed(1) + '%';
        ctx.font = `900 ${mine ? 20 : 15}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(txt).width + 16, h = mine ? 30 : 24;
        ctx.globalAlpha = Math.min(1, (e - 0.6) / 0.4);
        ctx.fillStyle = mine ? 'rgba(20,12,6,.82)' : 'rgba(20,12,6,.55)';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
        ctx.fillStyle = mine ? '#ffc94a' : '#e9dcc6'; ctx.fillText(txt, x, y + 1);
        ctx.globalAlpha = 1;
      }
    }
    if (phase === 'aim' && drag) screenLine(drag.a, drag.b, true);
    if (phase === 'aim' && kb && !drag) { const a = toScreen(kb.p), b = toScreen({ x: kb.p.x + kb.d.x, y: kb.p.y + kb.d.y }); screenLine(a, b, false); }
    if (res && e < 1) kick();
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // ---------- play ----------
  const pipsEl = $('pips');
  function paintPips() {
    if (mode !== 'daily') { pipsEl.innerHTML = practice.n ? `<span class="hint" style="margin:0">${practice.n} cut${practice.n === 1 ? "" : "s"} · avg off ${(practice.sum / practice.n).toFixed(1)}</span>` : ''; return; }
    const st = loadDaily();
    pipsEl.innerHTML = DAILY.map((_, i) => {
      const r = st.rounds[i];
      return `<span class="pip ${r ? grade(r.err) : i === st.rounds.length ? 'now' : ''}"></span>`;
    }).join('');
  }
  const grade = err => err < 1 ? 'g' : err < 3 ? 'y' : err < 6 ? 'o' : 'r';
  const fmtErr = e => (e < 1 ? e.toFixed(2) : e.toFixed(1));
  const points = err => Math.max(0, Math.round(100 - err * 9));
  function verdictLine(err) {
    return err < 0.5 ? 'Surgical. Nobody can complain.' : err < 1 ? 'Bakery-scale precision.' : err < 2 ? 'Fair. Barely a crumb in it.'
      : err < 3.5 ? 'Close. Someone will still notice.' : err < 6 ? 'Someone is getting the big bit.' : err < 10 ? 'That is how family arguments start.' : 'That is not sharing, that is taking.';
  }

  function loadDaily() {
    const day = Ballpark.today();
    let st = store.get('daily', null);
    if (!st || st.day !== day) st = { day, rounds: [] };
    return st;
  }
  function startRound(r) {
    round = r; T = makeTreat(r.kind, r.seed); res = null; drag = null; kb = null; phase = 'aim';
    $('ask').innerHTML = TARGETS[r.t][2];
    $('hint').textContent = (mode === 'daily' ? `Treat ${r.i + 1} of 5 · ` : '') + T.name;
    $('msg').textContent = r.i === 0 && mode === 'daily' ? 'Swipe one straight line across the treat.' : '';
    $('next').hidden = true; $('pop').hidden = true;
    paintPips(); layout();
  }
  function nextDaily() {
    const st = loadDaily();
    if (st.rounds.length >= DAILY.length) { showResults(); return; }
    const i = st.rounds.length;
    startRound({ ...dailyRound(st.day, i), i });
  }
  function nextPractice() {
    const r = Math.random(), t = r < 0.55 ? 0.5 : r < 0.8 ? 1 / 3 : 0.25;
    startRound({ t, kind: ALL_KINDS[Math.floor(Math.random() * ALL_KINDS.length)], seed: 'p' + Math.random().toString(36).slice(2), i: practice.n });
  }

  function solveGhost(p, n, side, want) { // offset along n so the piece on `side` is exactly `want`
    let lo = -2.5, hi = 2.5; // fracOn(+1) decreases as the line moves along +n
    const F = o => { const f = fracOn(T, { x: p.x + n.x * o, y: p.y + n.y * o }, n); return side === 1 ? f : 1 - f; };
    const dec = side === 1;
    for (let k = 0; k < 48; k++) { const mid = (lo + hi) / 2, v = F(mid); if ((v > want) === dec) lo = mid; else hi = mid; }
    const o = (lo + hi) / 2;
    return { p: { x: p.x + n.x * o, y: p.y + n.y * o }, side: o >= 0 ? 1 : -1 };
  }

  function cut(p, dRaw) {
    if (phase !== 'aim') return false;
    const L = Math.hypot(dRaw.x, dRaw.y); if (L < 1e-6) return false;
    const d = { x: dRaw.x / L, y: dRaw.y / L }, n = { x: -d.y, y: d.x };
    const f = fracOn(T, p, n);
    if (f < 0.004 || f > 0.996) { $('msg').textContent = 'Missed the treat. Cut right across it.'; drag = null; draw(); return false; }
    const t = round.t, e1 = Math.abs(f - t), e2 = Math.abs(1 - f - t);
    const side = e1 <= e2 ? 1 : -1, err = Math.min(e1, e2) * 100, pts = points(err);
    const P1 = clip(T.poly, p, n, 1), P2 = clip(T.poly, p, n, -1);
    res = { p, d, n, f, side, err, pts, target: t, c1: centroid(P1), c2: centroid(P2) };
    res.ghost = err > 0.15 ? solveGhost(p, n, side, t) : null;
    phase = 'done'; drag = null; kb = null; animT0 = performance.now();
    sfxCut(); sfxScore(err);
    const pop = $('pop'); pop.hidden = false; pop.textContent = '+' + pts; pop.style.color = { g: '#4ade80', y: '#facc15', o: '#fb923c', r: '#f87171' }[grade(err)];
    pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = '';
    $('msg').textContent = `${verdictLine(err)} Off by ${fmtErr(err)}.`;
    if (mode === 'daily') {
      const st = loadDaily();
      st.rounds.push({ kind: round.kind, seed: round.seed, t, err: Math.round(err * 100) / 100, pts, p: [+p.x.toFixed(4), +p.y.toFixed(4)], d: [+d.x.toFixed(4), +d.y.toFixed(4)] });
      store.set('daily', st);
      if (st.rounds.length >= DAILY.length) finishDaily(st);
      $('next').textContent = st.rounds.length >= DAILY.length ? 'See my result' : 'Next treat';
    } else {
      practice.n++; practice.sum += err; $('next').textContent = 'Next treat';
    }
    paintPips();
    $('next').hidden = false; setTimeout(() => $('next').focus({ preventScroll: true }), 50);
    kick();
    return true;
  }

  function finishDaily(st) {
    const total = st.rounds.reduce((s, r) => s + r.pts, 0);
    Ballpark.report('fairshare', { score: total, max: 500, label: `${total}/500` });
    const s = store.get('stats', { played: 0, best: 0, streak: 0, last: null });
    if (s.last !== st.day) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      s.streak = s.last === yd ? s.streak + 1 : 1; s.played++; s.best = Math.max(s.best, total); s.last = st.day;
      store.set('stats', s);
    }
  }

  // ---------- input ----------
  const pt = e => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'aim') return;
    audio();
    try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    const q = pt(e); drag = { a: q, b: q }; kb = null; draw();
  });
  cv.addEventListener('pointermove', e => { if (drag) { drag.b = pt(e); kick(); } });
  const release = e => {
    if (!drag) return;
    drag.b = pt(e);
    const { a, b } = drag;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 24) { drag = null; $('msg').textContent = 'Drag a longer line: press, swipe across, let go.'; draw(); return; }
    const ua = toUnit(a), ub = toUnit(b);
    cut(ua, { x: ub.x - ua.x, y: ub.y - ua.y });
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', () => { drag = null; draw(); });

  addEventListener('keydown', e => {
    if (!$('intro').hidden || !$('results').hidden) return;
    if (phase === 'done' && (e.key === 'Enter' || e.key === ' ')) { if (document.activeElement !== $('next')) { e.preventDefault(); $('next').click(); } return; }
    if (phase !== 'aim') return;
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(k)) return;
    e.preventDefault(); audio();
    const fresh = !kb;
    if (fresh) kb = { ang: Math.PI / 2 + 0.3, off: 0.35 };
    const step = e.shiftKey ? 0.002 : 0.012;
    if (k === 'ArrowLeft') kb.off -= step; if (k === 'ArrowRight') kb.off += step;
    if (k === 'ArrowUp') kb.ang -= e.shiftKey ? 0.004 : 0.03; if (k === 'ArrowDown') kb.ang += e.shiftKey ? 0.004 : 0.03;
    // aim in screen terms: offset moves the line sideways on screen regardless of the treat's rotation
    const sa = kb.ang - T.rot;
    kb.d = { x: Math.cos(sa), y: Math.sin(sa) };
    const n = { x: -kb.d.y, y: kb.d.x }; kb.p = { x: n.x * kb.off, y: n.y * kb.off };
    if ((k === 'Enter' || k === ' ') && !fresh) { if (e.repeat) return; cut(kb.p, kb.d); return; }
    $('msg').textContent = 'Arrows aim (Shift = fine), Enter cuts.';
    draw();
  });

  $('next').onclick = () => {
    if (mode === 'daily') { const st = loadDaily(); st.rounds.length >= DAILY.length ? showResults() : nextDaily(); }
    else nextPractice();
  };

  // ---------- screens ----------
  function miniSvg(r) {
    const Tm = makeTreat(r.kind, r.seed), c = Math.cos(Tm.rot), s = Math.sin(Tm.rot);
    const xy = u => [17 + 14.5 * (u.x * c - u.y * s), 17 + 14.5 * (u.x * s + u.y * c)].map(v => v.toFixed(1));
    const pts = Tm.poly.filter((_, i) => i % 3 === 0).map(u => xy(u).join(',')).join(' ');
    let line = '';
    if (r.p && r.d) {
      const p = { x: r.p[0], y: r.p[1] }, d = { x: r.d[0], y: r.d[1] };
      const [x1, y1] = xy({ x: p.x - d.x * 3, y: p.y - d.y * 3 }), [x2, y2] = xy({ x: p.x + d.x * 3, y: p.y + d.y * 3 });
      line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1.6"/>`;
    }
    return `<svg viewBox="0 0 34 34" aria-hidden="true"><defs><clipPath id="mc${r.seed.replace(/\W/g, '')}"><rect width="34" height="34" rx="6"/></clipPath></defs><g clip-path="url(#mc${r.seed.replace(/\W/g, '')})"><polygon points="${pts}" fill="${Tm.fl.base}" stroke="${Tm.fl.edge}" stroke-width="1"/>${line}</g></svg>`;
  }
  function overall(total) {
    return total >= 470 ? 'Master divider. Frame this knife.' : total >= 430 ? 'Head of the cake table.' : total >= 380 ? 'Trusted with birthday cakes.'
      : total >= 300 ? 'A decent sibling. Mostly.' : 'Maybe let someone else hold the knife.';
  }
  function showResults() {
    const st = loadDaily(); if (st.rounds.length < DAILY.length) { nextDaily(); return; }
    phase = 'idle';
    const total = st.rounds.reduce((s, r) => s + r.pts, 0);
    $('rDate').textContent = 'FAIR SHARE · ' + new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
    $('rTotal').textContent = total; $('rVerdict').textContent = overall(total);
    $('rRows').innerHTML = st.rounds.map(r => `<li>${miniSvg(r)}<span>${TARGETS[r.t][1]} <span class="off">off ${fmtErr(r.err)}</span></span><span class="pip ${grade(r.err)}"></span><span class="pts">${r.pts}</span></li>`).join('');
    $('share').textContent = 'Copy result';
    $('results').hidden = false; $('intro').hidden = true;
    tickNext();
  }
  function tickNext() {
    if ($('results').hidden) return;
    const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
    const mins = Math.ceil((m - n) / 60000);
    $('nextIn').textContent = `Five new treats in ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
    setTimeout(tickNext, 30000);
  }
  $('share').onclick = () => {
    const st = loadDaily(), total = st.rounds.reduce((s, r) => s + r.pts, 0);
    const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const text = `FAIR SHARE · ${day}\n${total}/500\n${st.rounds.map(r => `${TARGETS[r.t][1]} ±${fmtErr(r.err)}`).join(' | ')}\nBALLPARK`;
    const done = () => { $('share').textContent = 'Copied'; };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => { $('share').textContent = 'Copy failed'; });
    window.__fairShareText = text;
  };
  $('toPractice').onclick = () => beginPractice();

  function paintIntro() {
    const s = store.get('stats', { played: 0, best: 0, streak: 0, last: null }), st = loadDaily();
    $('stats').innerHTML = s.played ? `<span>PLAYED<b>${s.played}</b></span><span>BEST<b>${s.best}</b></span><span>STREAK<b>${s.streak}</b></span>` : '';
    $('playDaily').textContent = st.rounds.length >= DAILY.length ? "See today's result" : st.rounds.length ? `Continue (treat ${st.rounds.length + 1} of 5)` : "Today's five treats";
    $('logo').innerHTML = `<svg viewBox="0 0 132 110" aria-hidden="true"><ellipse cx="66" cy="62" rx="58" ry="42" fill="#e4d6c0"/><g transform="translate(-4 0)"><path d="M62 18 A40 40 0 0 0 62 98 Z" fill="#d9a15a" stroke="#a8692f" stroke-width="2"/></g><g transform="translate(4 0)"><path d="M62 18 A40 40 0 0 1 62 98 Z" fill="#d9a15a" stroke="#a8692f" stroke-width="2"/></g>
      ${[[40, 44], [50, 72], [36, 66], [80, 40], [90, 66], [76, 84], [48, 34]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="3.4" fill="#4a2a14"/>`).join('')}
      <path d="M66 6 V106" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/><text x="34" y="62" font-size="13" font-weight="900" fill="#241600" font-family="Segoe UI,Arial" text-anchor="middle">50</text><text x="98" y="62" font-size="13" font-weight="900" fill="#241600" font-family="Segoe UI,Arial" text-anchor="middle">50</text></svg>`;
  }
  function beginDaily() {
    mode = 'daily'; $('mode').textContent = 'DAILY'; $('intro').hidden = true; $('results').hidden = true;
    const st = loadDaily(); if (st.rounds.length >= DAILY.length) { showResults(); return; }
    nextDaily();
  }
  function beginPractice() {
    mode = 'practice'; $('mode').textContent = 'PRACTICE'; $('intro').hidden = true; $('results').hidden = true;
    nextPractice();
  }
  $('playDaily').onclick = () => { audio(); beginDaily(); };
  $('playPractice').onclick = () => { audio(); beginPractice(); };

  paintIntro(); layout();
  setTimeout(() => $('playDaily').focus({ preventScroll: true }), 30);

  // test hooks (used by the headless checks; harmless for players)
  window.__fair = {
    get phase() { return phase; }, get treat() { return T; }, get res() { return res; }, get mode() { return mode; },
    cut, toScreen, fracOn: (p, n) => fracOn(T, p, n),
    perfect() { const n = { x: 0, y: 1 }; return solveGhost({ x: 0, y: 0 }, n, 1, round.t); },
    makeTreat, kinds: ALL_KINDS,
    show(kind, seed, t = 0.5) { mode = "practice"; $("intro").hidden = true; $("results").hidden = true; startRound({ t, kind, seed, i: 0 }); },
  };
})();
