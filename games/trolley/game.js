/* TROLLEY TROUBLE - BALLPARK game
 * 28 absurd (and harmless) trolley problems. Scene is a generated SVG, animation is a tiny rAF tween engine,
 * sound is synthesized with Web Audio. Crowd percentages are SIMULATED (fixed per level in levels.js).
 */
(() => {
'use strict';

const LEVELS = window.TROLLEY_LEVELS;
const N = LEVELS.length;
const store = Ballpark.store('trolley');
const SVGNS = 'http://www.w3.org/2000/svg';
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fx1 = v => (Math.round(v * 10) / 10);

/* ------------------------------------------------------------------ reduced motion */
const rmQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let rmFlag = !!(rmQuery && rmQuery.matches);
if (rmQuery) {
  const onRm = e => { rmFlag = e.matches; };
  if (rmQuery.addEventListener) rmQuery.addEventListener('change', onRm); else if (rmQuery.addListener) rmQuery.addListener(onRm);
}
const reduced = () => rmFlag;

/* ------------------------------------------------------------------ persisted state */
function loadChoices() {
  const raw = store.get('choices', []);
  const out = Array(N).fill(null);
  if (Array.isArray(raw)) for (let i = 0; i < N; i++) out[i] = (raw[i] === 0 || raw[i] === 1) ? raw[i] : null;
  // only keep a contiguous run from the start (levels are always played in order)
  const firstNull = out.indexOf(null);
  if (firstNull !== -1) for (let i = firstNull; i < N; i++) out[i] = null;
  return out;
}
function loadTimes() {
  const raw = store.get('times', []);
  const out = Array(N).fill(0);
  if (Array.isArray(raw)) for (let i = 0; i < N; i++) out[i] = Number.isFinite(raw[i]) ? raw[i] : 0;
  return out;
}
let choices = loadChoices();
let times = loadTimes();
let muted = store.get('muted', false) === true;
const answered = () => choices.filter(c => c !== null).length;
const firstOpen = () => { const i = choices.indexOf(null); return i === -1 ? N : i; };
const saveProgress = () => { store.set('choices', choices); store.set('times', times); };

/* ------------------------------------------------------------------ sound (Web Audio, synthesized) */
const Sound = (() => {
  let ctx = null, out = null;
  function ok() {
    if (muted) return false;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        out = ctx.createGain(); out.gain.value = 0.55;
        const comp = ctx.createDynamicsCompressor();
        out.connect(comp); comp.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch { return false; }
  }
  function tone(f0, f1, dur, o = {}) {
    if (!ok()) return;
    const { type = 'sine', vol = 0.2, delay = 0 } = o;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.03);
  }
  function noise(dur, o = {}) {
    if (!ok()) return;
    const { vol = 0.2, freq = 1200, q = 0.7, delay = 0, type = 'bandpass' } = o;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(out); s.start(t);
  }
  return {
    unlock: ok,
    click() { tone(520, 700, 0.07, { type: 'triangle', vol: 0.12 }); },
    clack() { noise(0.06, { vol: 0.4, freq: 2200, q: 1.5 }); tone(190, 90, 0.12, { type: 'square', vol: 0.1 }); },
    ding() { tone(1180, 1180, 0.26, { vol: 0.13 }); tone(1180, 1180, 0.26, { vol: 0.13, delay: 0.17 }); },
    rumble(dur) {
      if (!ok()) return;
      dur = Math.max(0.45, dur);
      const t = ctx.currentTime;
      const osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(44, t); osc.frequency.linearRampToValueAtTime(92, t + dur);
      f.type = 'lowpass'; f.frequency.value = 230;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
      g.gain.setValueAtTime(0.2, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      osc.connect(f); f.connect(g); g.connect(out); osc.start(t); osc.stop(t + dur + 0.15);
      noise(dur, { vol: 0.07, freq: 420, q: 0.5 });
    },
    bonk() { tone(330, 70, 0.22, { type: 'triangle', vol: 0.5 }); noise(0.09, { vol: 0.35, freq: 900 }); tone(760, 380, 0.16, { vol: 0.16, delay: 0.05 }); },
    pop() { tone(900, 1500, 0.07, { type: 'triangle', vol: 0.16 }); noise(0.1, { vol: 0.2, freq: 3000, q: 0.8 }); },
    sparkle() { [1320, 1760, 2093].forEach((f, i) => tone(f, f, 0.18, { vol: 0.08, delay: i * 0.07 })); },
    whoosh() { noise(0.45, { vol: 0.22, freq: 1600, q: 0.4 }); },
    reveal() { tone(392, 392, 0.12, { vol: 0.12 }); tone(523, 523, 0.18, { vol: 0.12, delay: 0.1 }); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.24, { type: 'triangle', vol: 0.16, delay: i * 0.12 })); }
  };
})();

/* ------------------------------------------------------------------ tiny animation engine */
const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inSine: t => 1 - Math.cos(t * Math.PI / 2)
};
let tickers = [], raf = 0;
function frameLoop(now) {
  // `raf` stays non-zero while this frame runs, so tickers added mid-frame don't schedule a second loop
  const list = tickers; tickers = [];
  const keep = [];
  for (const f of list) {
    let k = true;
    try { k = f(now) !== false; } catch (e) { console.error(e); k = false; }
    if (k) keep.push(f);
  }
  tickers = keep.concat(tickers);
  raf = tickers.length ? requestAnimationFrame(frameLoop) : 0;
}
function addTicker(f) {
  tickers.push(f);
  if (!raf) raf = requestAnimationFrame(frameLoop);
}
function tween(ms, fn, easing = ease.linear) {
  return new Promise(resolve => {
    if (reduced()) ms = Math.min(ms, 1);
    const t0 = performance.now();
    addTicker(now => {
      const t = ms <= 0 ? 1 : clamp((now - t0) / ms, 0, 1);
      fn(easing(t), t);
      if (t >= 1) { resolve(); return false; }
      return true;
    });
  });
}

/* ------------------------------------------------------------------ SVG helpers */
function el(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(str, attrs, parent) {
  const t = el('text', Object.assign({ 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': EMOJI_FONT }, attrs), parent);
  t.textContent = str;
  return t;
}
function starPoints(r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45, a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push(`${fx1(Math.cos(a) * rad)},${fx1(Math.sin(a) * rad)}`);
  }
  return pts.join(' ');
}
function starNode(r, parent) {
  return el('polygon', { points: starPoints(r), fill: '#ffd23f', stroke: '#d97f00', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, parent);
}

/* The trolley: a front-facing cartoon tram with worried eyes. Origin (0,0) = bottom centre. */
function makeTrolley(parent) {
  const root = el('g', {}, parent);
  el('ellipse', { cx: 0, cy: 1, rx: 33, ry: 6, fill: 'rgba(0,0,0,.25)' }, root);
  const body = el('g', {}, root);
  el('path', { d: 'M-4 -44 L8 -66', stroke: '#2c2c3a', 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, body);
  el('circle', { cx: 9, cy: -68, r: 3.2, fill: '#ffd23f', stroke: '#2c2c3a', 'stroke-width': 1.5 }, body);
  el('rect', { x: -27, y: -7, width: 11, height: 10, rx: 3, fill: '#2c2c3a' }, body);
  el('rect', { x: 16, y: -7, width: 11, height: 10, rx: 3, fill: '#2c2c3a' }, body);
  el('rect', { x: -29, y: -44, width: 58, height: 40, rx: 13, fill: '#f2542d', stroke: '#8f2a12', 'stroke-width': 2.5 }, body);
  el('rect', { x: -29, y: -19, width: 58, height: 4, fill: '#ffd23f' }, body);
  el('rect', { x: -23, y: -40, width: 46, height: 19, rx: 8, fill: '#eaf8ff', stroke: '#8f2a12', 'stroke-width': 2 }, body);
  const eyesOpen = el('g', {}, body);
  el('circle', { cx: -9.5, cy: -30, r: 6.6, fill: '#fff', stroke: '#333', 'stroke-width': 1.5 }, eyesOpen);
  el('circle', { cx: 9.5, cy: -30, r: 6.6, fill: '#fff', stroke: '#333', 'stroke-width': 1.5 }, eyesOpen);
  const pupils = [
    el('circle', { cx: -9.5, cy: -29, r: 3, fill: '#222' }, eyesOpen),
    el('circle', { cx: 9.5, cy: -29, r: 3, fill: '#222' }, eyesOpen)
  ];
  el('path', { d: 'M-16 -38 L-4 -35.5 M16 -38 L4 -35.5', stroke: '#8f2a12', 'stroke-width': 2, 'stroke-linecap': 'round' }, eyesOpen);
  const eyesHit = el('g', { display: 'none' }, body);
  el('path', { d: 'M-14 -35 L-6 -26 M-6 -35 L-14 -26 M6 -35 L14 -26 M14 -35 L6 -26', stroke: '#333', 'stroke-width': 2.6, 'stroke-linecap': 'round', fill: 'none' }, eyesHit);
  const smile = el('path', { d: 'M-8 -11 Q0 -6.5 8 -11', stroke: '#5a1608', 'stroke-width': 2.6, 'stroke-linecap': 'round', fill: 'none' }, body);
  const ooh = el('ellipse', { cx: 0, cy: -10, rx: 4, ry: 3.4, fill: '#5a1608', display: 'none' }, body);
  el('circle', { cx: -21, cy: -10, r: 3, fill: '#ffe680', stroke: '#8f2a12', 'stroke-width': 1 }, body);
  el('circle', { cx: 21, cy: -10, r: 3, fill: '#ffe680', stroke: '#8f2a12', 'stroke-width': 1 }, body);
  return {
    root, body, pupils,
    look(dx, dy = 0) { pupils[0].setAttribute('cx', fx1(-9.5 + dx)); pupils[1].setAttribute('cx', fx1(9.5 + dx)); pupils[0].setAttribute('cy', fx1(-29 + dy)); pupils[1].setAttribute('cy', fx1(-29 + dy)); },
    hit(on) {
      eyesOpen.setAttribute('display', on ? 'none' : 'inline');
      eyesHit.setAttribute('display', on ? 'inline' : 'none');
      smile.setAttribute('display', on ? 'none' : 'inline');
      ooh.setAttribute('display', on ? 'inline' : 'none');
    }
  };
}

/* ------------------------------------------------------------------ scene themes */
const THEMES = {
  day:    { sky: ['#6fc3ff', '#e2f5ff'], hill: ['#76cf72', '#5fbf63'], ground: ['#a4e68f', '#58ae5c'], bed: '#dccaa0', sun: '☀️', deco: [['☁️', 'sky'], ['☁️', 'sky'], ['🌳', 'side'], ['🌳', 'side'], ['🌷', 'side']] },
  sunset: { sky: ['#ff8a5c', '#ffd8a0'], hill: ['#c58a4a', '#a8723a'], ground: ['#e9b86e', '#c18a45'], bed: '#ecd6ac', sun: '☀️', deco: [['☁️', 'sky'], ['🌴', 'side'], ['🌴', 'side'], ['🎈', 'sky']] },
  night:  { sky: ['#0d1535', '#2c3b78'], hill: ['#1f3a52', '#18304a'], ground: ['#2f6a55', '#1d4638'], bed: '#7d7a8c', sun: '🌙', stars: true, deco: [['⭐', 'sky'], ['✨', 'sky'], ['🌲', 'side'], ['🌲', 'side'], ['🦉', 'side']] },
  desert: { sky: ['#74c9ff', '#ffeab4'], hill: ['#e3b36a', '#d39e55'], ground: ['#f6d792', '#dcae5e'], bed: '#cfae7c', sun: '☀️', deco: [['🌵', 'side'], ['🌵', 'side'], ['☁️', 'sky'], ['🦎', 'side']] },
  beach:  { sky: ['#6fdcff', '#eafcff'], hill: ['#58d2c0', '#3fbfb0'], ground: ['#f7e7a6', '#e9cf79'], bed: '#d8c28a', sun: '☀️', deco: [['🌴', 'side'], ['🌴', 'side'], ['☁️', 'sky'], ['🐚', 'side'], ['⛵', 'sky']] },
  space:  { sky: ['#05061c', '#2a1458'], hill: ['#46497a', '#383b66'], ground: ['#7a7ea0', '#4d5073'], bed: '#a7abcb', sun: '🪐', stars: true, deco: [['✨', 'sky'], ['🛸', 'sky'], ['☄️', 'sky'], ['🌑', 'side']] },
  snow:   { sky: ['#a9dcff', '#f1faff'], hill: ['#eaf6ff', '#d7ebfa'], ground: ['#fafdff', '#cfe3f3'], bed: '#b9c9d8', sun: '☀️', deco: [['❄️', 'sky'], ['🌲', 'side'], ['⛄', 'side'], ['❄️', 'sky'], ['🌲', 'side']] },
  candy:  { sky: ['#ffb8e1', '#fff3b8'], hill: ['#ff9ad0', '#f080c0'], ground: ['#a5f0d2', '#62d6ae'], bed: '#ffe3f1', sun: '🍭', deco: [['🍬', 'side'], ['🧁', 'side'], ['☁️', 'sky'], ['🍩', 'side'], ['🍦', 'side']] },
  spooky: { sky: ['#241043', '#6c3a96'], hill: ['#3a2a55', '#2c2044'], ground: ['#47365f', '#2a2038'], bed: '#7e7498', sun: '🌕', stars: true, deco: [['🦇', 'sky'], ['🎃', 'side'], ['🕸️', 'side'], ['🦇', 'sky'], ['🌲', 'side']] }
};
const DEFAULT_WORDS = ['BONK!', 'BOINK!', 'DONK!', 'BOP!', 'THWACK!'];

/* ------------------------------------------------------------------ the scene */
let scene = null;

function ariaFor(L) {
  return `${L.title}. A trolley rolls toward a fork in the track. Left track, if you do nothing: ${L.stay.label}. Right track, if you pull the lever: ${L.pull.label}.`;
}

function layoutGroup(n, gcx, gcy, maxW, maxH, capMul) {
  if (!n) return { pos: [], size: 0, w: 0, h: 0, top: gcy };
  const cols = n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const size = Math.min((n === 1 ? 62 : 52) * capMul, maxW / (cols * 1.04), maxH / (rows * 0.98));
  const stepX = size * 1.04, stepY = size * 0.96;
  const h = (rows - 1) * stepY + size;
  const top = gcy - h / 2;
  const pos = [];
  for (let r = 0, k = 0; r < rows; r++) {
    const cnt = r < rows - 1 ? cols : n - cols * (rows - 1);
    for (let c = 0; c < cnt; c++, k++) pos.push({ x: gcx + (c - (cnt - 1) / 2) * stepX, y: top + size / 2 + r * stepY });
  }
  return { pos, size, w: (cols - 1) * stepX + size, h, top };
}

function buildScene(L, opts = {}) {
  const wrap = $('#sceneWrap');
  if (scene) scene.dead = true;
  wrap.textContent = '';
  const W = Math.max(280, Math.round(wrap.clientWidth || 340));
  const H = Math.round(clamp(W * (W < 420 ? 0.86 : 0.9), 250, 400));
  const th = THEMES[L.theme] || THEMES.day;
  const rnd = Ballpark.rng('trolley-scene-' + L.id);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': ariaFor(L) }, wrap);
  const S = scene = {
    W, H, svg, L, dead: false, idle: false, route: 0, len: 0, sx: 1, sy: 1, look: 0, jitter: 0,
    routes: [], groups: [], leverAngle: -32, introP: Promise.resolve()
  };

  // geometry
  const cx = W / 2, yH = H * 0.22, Jy = H * 0.44, Ye = H * 0.66;
  const Lx = W * 0.26, Rx = W * 0.74;
  const persp = y => 0.4 + 0.82 * clamp((y - yH) / (H - yH), 0, 1.3);
  S.persp = persp;

  // defs + sky + ground
  const defs = el('defs', {}, svg);
  const sky = el('linearGradient', { id: 'gSky', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': th.sky[0] }, sky); el('stop', { offset: 1, 'stop-color': th.sky[1] }, sky);
  const gr = el('linearGradient', { id: 'gGround', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': th.ground[0] }, gr); el('stop', { offset: 1, 'stop-color': th.ground[1] }, gr);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#gSky)' }, svg);

  // stars (dark themes) + celestial body + clouds / decor
  S.twinkles = [];
  if (th.stars) {
    for (let i = 0; i < 26; i++) {
      const c = el('circle', { cx: fx1(rnd() * W), cy: fx1(rnd() * (yH + 10)), r: fx1(0.7 + rnd() * 1.2), fill: '#fff', opacity: 0.8 }, svg);
      S.twinkles.push({ c, ph: rnd() * 6.28 });
    }
  }
  const sunSize = Math.min(40, yH * 0.85);
  txt(th.sun, { x: rnd() < 0.5 ? W * 0.14 : W * 0.86, y: yH * 0.52, 'font-size': sunSize }, svg);
  S.clouds = [];
  th.deco.forEach(([emoji, kind]) => {
    if (kind === 'sky') {
      const size = 18 + rnd() * 12;
      const node = txt(emoji, { x: 0, y: 0, 'font-size': size, opacity: 0.95 }, svg);
      const c = { node, x: W * (0.06 + rnd() * 0.88), y: yH * (0.22 + rnd() * 0.5), v: 3 + rnd() * 5, drift: emoji === '☁️' || emoji === '🛸' || emoji === '🦇' || emoji === '🎈' || emoji === '☄️' };
      node.setAttribute('transform', `translate(${fx1(c.x)} ${fx1(c.y)})`);
      S.clouds.push(c);
    }
  });
  el('ellipse', { cx: W * 0.18, cy: yH + 6, rx: W * 0.34, ry: H * 0.08, fill: th.hill[0] }, svg);
  el('ellipse', { cx: W * 0.86, cy: yH + 8, rx: W * 0.38, ry: H * 0.07, fill: th.hill[1] }, svg);
  el('rect', { x: 0, y: yH, width: W, height: H - yH, fill: 'url(#gGround)' }, svg);
  th.deco.forEach(([emoji, kind]) => {
    if (kind !== 'side') return;
    const left = rnd() < 0.5;
    const x = left ? W * (0.05 + rnd() * 0.08) : W * (0.87 + rnd() * 0.08);
    const y = yH + 22 + rnd() * (H * 0.36);
    txt(emoji, { x: fx1(x), y: fx1(y), 'font-size': fx1(22 + rnd() * 12) }, svg);
  });

  // layers (z-order): track < tunnel < trolley < lever < items < fx
  const trackLayer = el('g', {}, svg);
  const tunnelLayer = el('g', {}, svg);
  const trolleyLayer = el('g', {}, svg);
  const leverLayer = el('g', {}, svg);
  const itemLayer = el('g', {}, svg);
  S.fx = el('g', {}, svg);

  // route paths (invisible, used for geometry + trolley motion)
  const branch = x => `C ${cx} ${Jy + (Ye - Jy) * 0.45} ${x} ${Ye - (Ye - Jy) * 0.45} ${x} ${Ye} L ${x} ${H + 60}`;
  const geo = el('g', { fill: 'none', stroke: 'none' }, svg);
  const pMain = el('path', { d: `M ${cx} ${yH} L ${cx} ${Jy}` }, geo);
  const pL = el('path', { d: `M ${cx} ${Jy} ${branch(Lx)}` }, geo);
  const pR = el('path', { d: `M ${cx} ${Jy} ${branch(Rx)}` }, geo);
  const pA = el('path', { d: `M ${cx} ${yH} L ${cx} ${Jy} ${branch(Lx)}` }, geo);
  const pB = el('path', { d: `M ${cx} ${yH} L ${cx} ${Jy} ${branch(Rx)}` }, geo);
  const mainLen = pMain.getTotalLength();

  const sample = (p, l) => {
    const total = p.getTotalLength();
    const a = p.getPointAtLength(clamp(l, 0, total)), b = p.getPointAtLength(clamp(l + 1.5, 0, total)), c = p.getPointAtLength(clamp(l - 1.5, 0, total));
    let tx = b.x - c.x, ty = b.y - c.y; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    return { x: a.x, y: a.y, nx: -ty, ny: tx };
  };
  const bedL = el('g', {}, trackLayer), tieL = el('g', {}, trackLayer), railL = el('g', {}, trackLayer);
  function trackParts(p) {
    const total = p.getTotalLength();
    const pts = [];
    for (let l = 0; l < total; l += 5) pts.push(sample(p, l));
    pts.push(sample(p, total));
    const left = [], right = [], r1 = [], r2 = [];
    for (const q of pts) {
      const s = persp(q.y);
      left.push(`${fx1(q.x + q.nx * 25 * s)},${fx1(q.y + q.ny * 25 * s)}`);
      right.push(`${fx1(q.x - q.nx * 25 * s)},${fx1(q.y - q.ny * 25 * s)}`);
      r1.push(`${fx1(q.x + q.nx * 14 * s)} ${fx1(q.y + q.ny * 14 * s)}`);
      r2.push(`${fx1(q.x - q.nx * 14 * s)} ${fx1(q.y - q.ny * 14 * s)}`);
    }
    el('polygon', { points: left.concat(right.reverse()).join(' '), fill: th.bed }, bedL);
    const ties = [[], [], []];
    for (let l = 2; l < total;) {
      const q = sample(p, l), s = persp(q.y), hl = 21 * s, k = s < 0.55 ? 0 : s < 0.85 ? 1 : 2;
      ties[k].push(`M${fx1(q.x - q.nx * hl)} ${fx1(q.y - q.ny * hl)}L${fx1(q.x + q.nx * hl)} ${fx1(q.y + q.ny * hl)}`);
      l += 9 * s + 1.5;
    }
    const tw = [2, 3.2, 4.4];
    ties.forEach((d, k) => { if (d.length) el('path', { d: d.join(''), stroke: '#7a5230', 'stroke-width': tw[k], 'stroke-linecap': 'round', fill: 'none' }, tieL); });
    [r1, r2].forEach(rail => {
      const d = 'M' + rail.join('L');
      el('path', { d, stroke: '#3b4252', 'stroke-width': 4.6, fill: 'none', 'stroke-linejoin': 'round' }, railL);
      el('path', { d, stroke: '#dfe5ef', 'stroke-width': 2.2, fill: 'none', 'stroke-linejoin': 'round' }, railL);
    });
  }
  trackParts(pMain); trackParts(pL); trackParts(pR);

  // tunnel mouth at the horizon
  const tw0 = 17;
  el('rect', { x: cx - tw0 - 4, y: yH - 17, width: (tw0 + 4) * 2, height: 21, rx: 14, fill: '#6b6480', stroke: '#2c2838', 'stroke-width': 2 }, tunnelLayer);
  el('rect', { x: cx - tw0 + 1, y: yH - 12, width: (tw0 - 1) * 2, height: 16, rx: 11, fill: '#1c1a26' }, tunnelLayer);

  // trolley
  S.trolley = makeTrolley(trolleyLayer);
  if (L.ghost) S.trolley.root.setAttribute('opacity', 0.6);
  const waitLen = mainLen * 0.66;
  S.applyTrolley = () => {
    const r = S.routes[S.route], p = r.el;
    const len = clamp(S.len, 0, r.total);
    const a = p.getPointAtLength(len);
    const f = p.getPointAtLength(Math.min(r.total, len + 3)), b = p.getPointAtLength(Math.max(0, len - 3));
    const heading = Math.atan2(f.x - b.x, f.y - b.y) * 180 / Math.PI;       // 0 = straight toward the viewer
    const rot = clamp(heading * 0.35, -16, 16);
    const s = persp(a.y);
    S.trolley.root.setAttribute('transform', `translate(${fx1(a.x)} ${fx1(a.y + S.jitter)}) rotate(${fx1(rot)}) scale(${s.toFixed(3)})`);
    S.trolley.body.setAttribute('transform', `scale(${S.sx.toFixed(3)} ${S.sy.toFixed(3)})`);
  };
  S.place = (r, len) => { S.route = r; S.len = len; S.applyTrolley(); };

  // lever (right of the switch)
  const lx = cx + clamp(W * 0.12, 38, 52), ly = Jy + 12;
  const lg = el('g', { transform: `translate(${fx1(lx)} ${fx1(ly)})` }, leverLayer);
  el('ellipse', { cx: 0, cy: 8, rx: 17, ry: 4.5, fill: 'rgba(0,0,0,.22)' }, lg);
  el('rect', { x: -13, y: -3, width: 26, height: 11, rx: 3, fill: '#4b5563', stroke: '#1f2937', 'stroke-width': 1.5 }, lg);
  el('rect', { x: -9, y: -8, width: 18, height: 6, rx: 2, fill: '#6b7280', stroke: '#1f2937', 'stroke-width': 1.5 }, lg);
  const lh = el('g', {}, lg);
  el('line', { x1: 0, y1: -6, x2: 0, y2: -32, stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }, lh);
  el('line', { x1: 0, y1: -6, x2: 0, y2: -32, stroke: '#64748b', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, lh);
  if (L.fake) txt('🍌', { x: 0, y: -40, 'font-size': 30 }, lh);
  else el('circle', { cx: 0, cy: -37, r: 7, fill: '#e53935', stroke: '#7f1d1d', 'stroke-width': 2 }, lh);
  S.leverPos = { x: lx, y: ly };
  S.setLever = a => { S.leverAngle = a; lh.setAttribute('transform', `rotate(${fx1(a)} 0 -6)`); };
  S.leverTo = (a, ms = 220) => { const from = S.leverAngle; return tween(ms, e => S.setLever(from + (a - from) * e), ease.outBack); };
  S.setLever(-32);

  // item groups + ropes
  const capMul = clamp(W / 420, 0.9, 1.3);
  [0, 1].forEach(i => {
    const side = i === 0 ? L.stay : L.pull;
    const gcx = i === 0 ? Lx : Rx;
    const lay = layoutGroup(side.items.length, gcx, H * 0.83, W * 0.43, H * 0.3, capMul);
    const g = { i, cx: gcx, top: lay.top, w: lay.w, h: lay.h, size: lay.size, items: [], side };
    // rope across the track
    if (lay.size) {
      const ry = lay.top + lay.h - lay.size * 0.32, rw = Math.max(lay.w * 0.95, 60), n = Math.ceil(rw / 22);
      el('path', { d: `M${fx1(gcx - rw / 2)} ${fx1(ry)} q 11 -7 22 0` + ' t 22 0'.repeat(n - 1), stroke: '#a9763d', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }, itemLayer);
    }
    side.items.forEach((spec, k) => {
      const e = typeof spec === 'string' ? spec : spec.e, hat = typeof spec === 'string' ? null : spec.hat;
      const p = lay.pos[k];
      const ig = el('g', {}, itemLayer);
      el('ellipse', { cx: p.x, cy: p.y + lay.size * 0.42, rx: lay.size * 0.36, ry: lay.size * 0.09, fill: 'rgba(0,0,0,.18)' }, itemLayer);
      const inner = el('g', {}, ig);
      txt(e, { x: 0, y: 0, 'font-size': fx1(lay.size) }, inner);
      if (hat) txt(hat, { x: fx1(lay.size * 0.1), y: fx1(-lay.size * 0.5), 'font-size': fx1(lay.size * 0.5) }, inner);
      const it = { g: ig, x: p.x, y: p.y, dx: 0, dy: 0, rot: 0, sc: 1, seed: (rnd() - 0.5) * 2 };
      it.apply = () => ig.setAttribute('transform', `translate(${fx1(it.x + it.dx)} ${fx1(it.y + it.dy)}) rotate(${fx1(it.rot)}) scale(${it.sc.toFixed(3)})`);
      it.apply();
      g.items.push(it);
    });
    if (side.badge && lay.size) {
      const bw = side.badge.length * 7.4 + 14, bx = gcx + lay.w / 2 - bw / 2 - 2, by = lay.top - 9;
      const bg = el('g', { transform: `translate(${fx1(clamp(bx, bw / 2 + 2, W - bw / 2 - 2))} ${fx1(by)})` }, itemLayer);
      el('rect', { x: -bw / 2, y: -10, width: bw, height: 20, rx: 10, fill: '#231f3a', stroke: '#fff', 'stroke-width': 1.5 }, bg);
      txt(side.badge.replace('x', '×'), { x: 0, y: 0.5, 'font-size': 12, 'font-weight': 800, fill: '#fff', 'font-family': 'system-ui, "Segoe UI", sans-serif' }, bg);
    }
    g.hitY = lay.top + Math.min(10, lay.size * 0.2);
    g.impact = { x: gcx, y: lay.top + Math.min(14, lay.size * 0.3) };
    S.groups.push(g);
  });

  // routes: hit length per route
  const findLen = (p, y) => {
    let lo = 0, hi = p.getTotalLength();
    for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (p.getPointAtLength(mid).y < y) lo = mid; else hi = mid; }
    return hi;
  };
  S.routes = [pA, pB].map((p, i) => ({ el: p, total: p.getTotalLength(), hitLen: findLen(p, S.groups[i].hitY), outLen: findLen(p, H + 36) }));
  S.mainLen = mainLen;
  S.waitLen = waitLen;

  // idle animation (twinkles, drifting clouds, nervous trolley)
  let last = performance.now();
  addTicker(now => {
    if (S.dead) return false;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (reduced()) return true;
    for (const t of S.twinkles) t.c.setAttribute('opacity', (0.55 + 0.45 * Math.sin(now / 450 + t.ph)).toFixed(2));
    for (const c of S.clouds) {
      if (!c.drift) continue;
      c.x += c.v * dt; if (c.x > W + 30) c.x = -30;
      c.node.setAttribute('transform', `translate(${fx1(c.x)} ${fx1(c.y)})`);
    }
    if (S.idle) {
      S.jitter = Math.sin(now / 55) * 0.7;
      S.trolley.look(Math.sin(now / 420) * 2.4, 0.4);
      S.applyTrolley();
    }
    return true;
  });

  // trolley eyes + position helpers used by the animation code
  S.setHit = on => S.trolley.hit(on);
  S.lookDir = d => { S.trolley.look(d * 2.8, 0.8); };
  S.intro = () => {
    S.place(0, 0);
    S.introP = tween(950, e => S.place(0, waitLen * e), ease.outCubic).then(() => { S.idle = true; });
    return S.introP;
  };

  if (opts.done) finalizeScene(S, L, opts.side);
  else if (opts.noIntro) { S.place(0, waitLen); S.idle = true; }
  else S.intro();
  return S;
}

/* draw the "after the bonk" state (used when the page is resized after answering) */
function solidOf(L, i) { const sd = i === 0 ? L.stay : L.pull; return !(sd.soft || L.soft); }
function finalPose(it, g) { return { dx: (it.x - g.cx) * 0.18 + it.seed * 10, rot: it.seed * 28 }; }
function setFinal(it, g) { const f = finalPose(it, g); it.dx = f.dx; it.rot = f.rot; it.dy = 0; it.apply(); }
function finalizeScene(S, L, side) {
  const first = L.fake ? 0 : side;
  const order = L.loop ? [first, 1 - first] : [first];
  S.idle = false;
  order.forEach(i => { if (solidOf(L, i)) { S.groups[i].items.forEach(it => setFinal(it, S.groups[i])); startOrbit(S, S.groups[i], true); } });
  const last = order[order.length - 1];
  if (solidOf(L, last)) { S.place(last, S.routes[last].hitLen); S.setHit(true); }
  else S.trolley.root.setAttribute('display', 'none');
  S.setLever(side === 1 ? 32 : -32);
  S.lookDir(last === 0 ? -1 : 1);
}

/* ------------------------------------------------------------------ effects */
function startOrbit(S, g, still) {
  const stars = [0, 1, 2].map(() => starNode(7, S.fx));
  const rx = Math.max(26, g.w * 0.5), ry = 8, cy = g.top + 2;
  const put = ang => stars.forEach((st, k) => {
    const a = ang + k * 2.094;
    st.setAttribute('transform', `translate(${fx1(g.cx + Math.cos(a) * rx)} ${fx1(cy + Math.sin(a) * ry)}) rotate(${Math.round(a * 57)})`);
  });
  put(0.5);
  if (still || reduced()) return;
  addTicker(now => { if (S.dead) return false; if (reduced()) return true; put(now / 320); return true; });
}

function burst(S, x, y, kind) {
  const n = kind === 'confetti' ? 24 : kind === 'sparkle' ? 10 : 12;
  const colors = ['#ff6a3d', '#ffd23f', '#3b6cf5', '#2fc27a', '#ff7ac8', '#ffffff'];
  const make = i => {
    if (kind === 'confetti') return el('rect', { x: -3.5, y: -2.5, width: 7, height: 5, rx: 1, fill: colors[i % colors.length] }, S.fx);
    if (kind === 'sparkle') return txt('✨', { 'font-size': fx1(14 + Math.random() * 8) }, S.fx);
    return starNode(6 + Math.random() * 5, S.fx);
  };
  if (reduced()) {
    const nodes = [];
    for (let i = 0; i < 6; i++) {
      const nd = make(i), a = (i / 6) * Math.PI * 2;
      nd.setAttribute('transform', `translate(${fx1(x + Math.cos(a) * 30)} ${fx1(y + Math.sin(a) * 30)})`);
      nodes.push(nd);
    }
    return sleep(900).then(() => nodes.forEach(nd => nd.remove()));
  }
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const node = make(i);
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const sp = (kind === 'confetti' ? 40 : 34) + Math.random() * (kind === 'confetti' ? 70 : 38);
    const spin = (Math.random() - 0.5) * 720, grav = kind === 'confetti' ? 90 : 14;
    jobs.push(tween(650 + Math.random() * 350, (e, t) => {
      node.setAttribute('transform', `translate(${fx1(x + Math.cos(a) * sp * e)} ${fx1(y + Math.sin(a) * sp * e + grav * t * t)}) rotate(${Math.round(spin * t)}) scale(${(1 - t * 0.4).toFixed(2)})`);
      node.setAttribute('opacity', t < 0.65 ? 1 : (1 - (t - 0.65) / 0.35).toFixed(2));
    }, ease.outCubic).then(() => node.remove()));
  }
  return Promise.all(jobs);
}

function popWord(S, x, y, word, o = {}) {
  const size = o.size || 30;
  const t = txt(word, { 'font-size': size, 'font-weight': 900, fill: o.fill || '#ff5a36', stroke: '#fff', 'stroke-width': 6, 'stroke-linejoin': 'round', 'font-family': 'Impact, "Arial Black", "Trebuchet MS", sans-serif' }, S.fx);
  t.style.paintOrder = 'stroke';
  const half = word.length * size * 0.33;
  x = clamp(x, half + 4, S.W - half - 4);
  if (reduced()) { t.setAttribute('transform', `translate(${fx1(x)} ${fx1(y)})`); return sleep(1000).then(() => t.remove()); }
  return tween(1100, (e, k) => {
    const pop = k < 0.22 ? ease.outBack(k / 0.22) : 1;
    t.setAttribute('transform', `translate(${fx1(x)} ${fx1(y - 26 * ease.outCubic(k))}) rotate(${fx1(-7 + 5 * Math.sin(k * 6))}) scale(${Math.max(0.01, pop).toFixed(3)})`);
    t.setAttribute('opacity', k > 0.72 ? (1 - (k - 0.72) / 0.28).toFixed(2) : 1);
  }).then(() => t.remove());
}

function launchItem(it, g) {
  if (reduced()) { setFinal(it, g); return Promise.resolve(); }
  const f = finalPose(it, g), arch = 36 + Math.random() * 34;
  return tween(820, (e, t) => {
    it.dx = f.dx * e; it.dy = -arch * 4 * t * (1 - t);
    it.rot = f.rot * e + Math.sin(t * Math.PI * 4) * 12 * (1 - t);
    it.sc = 1 + 0.12 * Math.sin(t * Math.PI);
    it.apply();
  });
}
function wiggleItem(it) {
  if (reduced()) return Promise.resolve();
  return tween(950, (e, t) => {
    it.rot = Math.sin(t * Math.PI * 8) * 10 * (1 - t);
    it.sc = 1 + 0.18 * Math.sin(t * Math.PI);
    it.dy = -8 * Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t);
    it.apply();
  });
}
function squashTrolley(S) {
  return tween(430, (e, t) => {
    const k = Math.exp(-5 * t) * Math.cos(t * 16);
    S.sx = 1 + 0.22 * k; S.sy = 1 - 0.2 * k; S.applyTrolley();
    if (t >= 1) { S.sx = 1; S.sy = 1; S.applyTrolley(); }
  });
}
function shakeScene() {
  if (reduced()) return;
  const w = $('#sceneWrap');
  w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
  setTimeout(() => w.classList.remove('shake'), 420);
}

/* ------------------------------------------------------------------ playing a choice */
function travel(S, r, from, to, ms, easing, onLen) {
  return tween(ms, e => { const len = from + (to - from) * e; S.place(r, len); if (onLen) onLen(len); }, easing);
}

async function reactSolid(S, L, i) {
  const g = S.groups[i], sd = g.side;
  const kind = sd.fx || 'stars';
  const word = sd.bonk || DEFAULT_WORDS[(L.id.length + i) % DEFAULT_WORDS.length];
  Sound.bonk();
  if (kind === 'confetti') Sound.pop(); else if (kind === 'sparkle') Sound.sparkle();
  shakeScene();
  S.setHit(true);
  const jobs = [squashTrolley(S), burst(S, g.impact.x, g.impact.y, kind), popWord(S, g.impact.x, g.impact.y - 22, word)];
  g.items.forEach(it => jobs.push(launchItem(it, g)));
  startOrbit(S, g);
  await Promise.all(jobs);
}
function reactSoft(S, L, i) {
  const g = S.groups[i], sd = g.side;
  const word = sd.bonk || 'WHOOSH!';
  Sound.whoosh(); if ((sd.fx || 'sparkle') === 'sparkle') Sound.sparkle();
  const jobs = [burst(S, g.impact.x, g.impact.y, sd.fx || 'sparkle'), popWord(S, g.impact.x, g.impact.y - 22, word)];
  g.items.forEach(it => jobs.push(wiggleItem(it)));
  return Promise.all(jobs);
}

async function playChoice(L, side) {
  const S = scene;
  await S.introP;
  if (S.dead) return;
  const first = L.fake ? 0 : side;
  S.idle = false; S.jitter = 0;
  S.lookDir(first === 0 ? -1 : 1);

  if (side === 1) {
    Sound.clack();
    await S.leverTo(32, 220);
    if (L.fake) popWord(S, S.leverPos.x, S.leverPos.y - 62, 'it\'s a banana...', { size: 15, fill: '#3a3a3a' });
  } else {
    await sleep(reduced() ? 0 : 160);
  }

  const order = L.loop ? [first, 1 - first] : [first];
  for (let n = 0; n < order.length; n++) {
    if (S.dead) return;                     // the player left this level (or the scene was rebuilt)
    const i = order[n], r = S.routes[i];
    const solid = solidOf(L, i);
    const from = S.len;
    const to = solid ? r.hitLen : r.outLen;
    const dist = Math.abs(to - from);
    const ms = clamp(dist * 6.2, 750, 1500);
    if (n === 0) { Sound.ding(); Sound.rumble(ms / 1000 + 0.1); }
    else { Sound.rumble(ms / 1000 + 0.1); }
    if (solid) {
      await travel(S, i, from, to, ms, ease.inQuad);
      if (S.dead) return;
      await reactSolid(S, L, i);
    } else {
      let fired = null;
      await travel(S, i, from, to, ms, ease.inQuad, len => { if (!fired && len >= r.hitLen) fired = reactSoft(S, L, i); });
      if (S.dead) return;
      if (!fired) fired = reactSoft(S, L, i);
      await fired;
      S.trolley.root.setAttribute('display', 'none');
    }
    if (L.loop && n === 0) {
      // the loop: trolley zooms back round, the lever flips itself, trolley goes down the other track
      await sleep(reduced() ? 0 : 250);
      if (S.dead) return;
      S.setHit(false);
      Sound.whoosh();
      await travel(S, i, S.len, S.mainLen, 650, ease.inOutQuad);
      const other = order[1];
      S.lookDir(other === 0 ? -1 : 1);
      if (S.dead) return;
      Sound.clack();
      await S.leverTo(other === 1 ? 32 : -32, 240);
    }
  }
  await sleep(reduced() ? 100 : 250);
}

/* ------------------------------------------------------------------ profile */
const PROFILES = {
  chaos:       { name: 'Chaotic Lever-Puller',       emoji: '🤪', blurb: 'You have never met a lever you did not want to yank. Somewhere, a trolley company has installed a tiny bell that rings whenever you walk in.' },
  bystander:   { name: 'Professional Bystander',     emoji: '🧍', blurb: 'Hands in pockets, eyes calm. You watched trolley after trolley roll by and judged them all silently. Very zen. Slightly alarming.' },
  utilitarian: { name: 'Strict Utilitarian',         emoji: '🧮', blurb: 'Numbers first, feelings second. You counted the ducks, the socks and the Saturdays, and picked the bigger good almost every time.' },
  crowd:       { name: 'Crowd Whisperer',            emoji: '📣', blurb: 'You and the crowd are basically the same person. Suspicious? Maybe. Great at parties? Definitely.' },
  contrarian:  { name: 'Lovable Contrarian',         emoji: '🦄', blurb: 'You pick what almost nobody else picks. Crowds are for following; you are for surprising everyone, including the trolley.' },
  reluctant:   { name: 'Reluctant Lever-Toucher',    emoji: '🤏', blurb: 'A lever has to earn your fingerprints. You pull only when it really, truly matters (or when a banana is involved).' },
  handson:     { name: 'Hands-On Problem Solver',    emoji: '🛠️', blurb: 'If there is a lever, there is a solution. You believe in action, in snacks, and in fixing things before they roll away.' },
  gut:         { name: 'Lightning Lever-Hand',       emoji: '⚡', blurb: 'You decided before the trolley finished loading. Reading is optional, instincts are free, and the lever never knew what hit it.' },
  overthinker: { name: 'Professional Overthinker',   emoji: '🧠', blurb: 'You weighed every duck, interrogated every sock, and still had follow-up questions. The trolley waited politely. The trolley is tired.' },
  balanced:    { name: 'Perfectly Balanced Thinker', emoji: '⚖️', blurb: 'Half lever, half shrug. You weigh every duck, hear every philosopher out, and still find time for snacks. Wise.' }
};

function computeStats() {
  let done = 0, pulls = 0, maj = 0, utilN = 0, utilHit = 0;
  let lonely = null, slow = null;
  LEVELS.forEach((L, i) => {
    const c = choices[i];
    if (c === null) return;
    done++;
    if (c === 1) pulls++;
    const majority = L.pullPct >= 50 ? 1 : 0;
    if (c === majority) maj++;
    const agree = c === 1 ? L.pullPct : 100 - L.pullPct;
    if (!lonely || agree < lonely.agree) lonely = { i, agree };
    if (L.util) { utilN++; if ((L.util === 'pull' ? 1 : 0) === c) utilHit++; }
    if (times[i] > 0 && (!slow || times[i] > slow.ms)) slow = { i, ms: times[i] };
  });
  const ts = times.filter((t, i) => choices[i] !== null && t > 0).sort((a, b) => a - b);
  const med = ts.length ? ts[Math.floor(ts.length / 2)] : 0;          // median decision time, ms (robust to a tab left open)
  return { done, pulls, p: done ? pulls / done : 0, m: done ? maj / done : 0, u: utilN ? utilHit / utilN : 0, lonely, slow, med };
}
// First match wins. Extremes first, then the crowd axis, then the "bigger good" axis, then speed, then pull rate.
function pickProfile(s) {
  if (s.p >= 0.8) return PROFILES.chaos;
  if (s.p <= 0.2) return PROFILES.bystander;
  if (s.m >= 0.78) return PROFILES.crowd;
  if (s.m <= 0.4) return PROFILES.contrarian;
  if (s.u >= 0.88) return PROFILES.utilitarian;
  if (s.med && s.med <= 6000) return PROFILES.gut;
  if (s.med >= 24000) return PROFILES.overthinker;
  if (s.p <= 0.36) return PROFILES.reluctant;
  if (s.p >= 0.62) return PROFILES.handson;
  return PROFILES.balanced;
}
function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  if (s >= 300) return '5+ minutes';
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.max(1, s)}s`;
}

/* ------------------------------------------------------------------ UI flow */
let phase = 'title';           // title | idle | anim | result | end
let idx = 0;
let levelStart = 0;
let lastProfile = null;

function show(name) {
  ['title', 'play', 'end'].forEach(n => { $('#' + n).hidden = n !== name; });
  $('#progress').hidden = name !== 'play';
  window.scrollTo(0, 0);
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.hidden = true; }, 2200);
}

function updateTitle() {
  const n = answered();
  const start = $('#btnStart'), restart = $('#btnRestart');
  restart.classList.remove('armed');
  if (n === 0) { start.textContent = 'Start'; restart.hidden = true; }
  else if (n < N) { start.textContent = `Continue (level ${firstOpen() + 1})`; restart.hidden = false; restart.textContent = 'Start over'; }
  else { start.textContent = 'See my ethics profile'; restart.hidden = false; restart.textContent = 'Play again'; }
}

function buildLogo() {
  const svg = $('#logoArt');
  svg.textContent = '';
  el('ellipse', { cx: 110, cy: 118, rx: 100, ry: 10, fill: 'rgba(35,31,58,.15)' }, svg);
  const track = (x2, c) => {
    el('path', { d: `M110 30 L110 62 C110 78 ${x2} 76 ${x2} 94 L${x2} 126`, stroke: c, 'stroke-width': 17, fill: 'none', 'stroke-dasharray': '3 7' }, svg);
    el('path', { d: `M110 30 L110 62 C110 78 ${x2} 76 ${x2} 94 L${x2} 126`, stroke: '#3b4252', 'stroke-width': 11, fill: 'none' }, svg);
    el('path', { d: `M110 30 L110 62 C110 78 ${x2} 76 ${x2} 94 L${x2} 126`, stroke: '#e9d9b0', 'stroke-width': 7, fill: 'none' }, svg);
  };
  track(52, '#7a5230'); track(168, '#7a5230');
  txt('🐥', { x: 52, y: 108, 'font-size': 30 }, svg);
  txt('🐥', { x: 168, y: 108, 'font-size': 30 }, svg);
  const rumble = el('g', { class: 'logo-rumble' }, svg);
  const tr = makeTrolley(rumble);
  tr.root.setAttribute('transform', 'translate(110 62) scale(1.25)');
  tr.pupils.forEach(p => p.setAttribute('class', 'logo-pupil'));
}

function startGame() {
  Sound.unlock();
  Sound.click();
  if (answered() >= N) { showEnd(false); return; }
  loadLevel(firstOpen());
}

function loadLevel(i) {
  idx = i;
  const L = LEVELS[i];
  show('play');
  phase = 'idle';
  $('#lvlNo').textContent = `LEVEL ${i + 1} / ${N}`;
  $('#barFill').style.width = `${(i / N) * 100}%`;
  $('#lvlEyebrow').textContent = `Dilemma ${String(i + 1).padStart(2, '0')}`;
  $('#lvlTitle').textContent = L.title;
  $('#lvlText').textContent = L.text;
  $('#lblStay').textContent = L.stay.label;
  $('#lblPull').textContent = L.pull.label;
  $('#smallPull').textContent = L.fake ? 'IF YOU PULL (?)' : 'IF YOU PULL';
  ['Stay', 'Pull'].forEach(k => {
    $('#btn' + k).hidden = false; $('#btn' + k).disabled = false;
    $('#res' + k).hidden = true; $('#res' + k).classList.remove('chosen');
    $('#you' + k).hidden = true; $('#side' + k).classList.remove('chosen');
    $('#meter' + k).style.width = '0%'; $('#pct' + k).textContent = '0';
  });
  $('#result').hidden = true;
  const card = $('#levelCard');
  card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
  buildScene(L);
  levelStart = performance.now();
}

async function choose(side) {
  if (phase !== 'idle') return;
  phase = 'anim';
  Sound.unlock();
  const L = LEVELS[idx], i = idx;
  choices[i] = side;
  times[i] = Math.round(performance.now() - levelStart);
  saveProgress();
  $('#btnStay').disabled = true; $('#btnPull').disabled = true;
  $('#barFill').style.width = `${((i + 1) / N) * 100}%`;
  try { await Promise.race([playChoice(L, side), sleep(9000)]); } catch (e) { console.error(e); }
  if (idx !== i || phase !== 'anim') return;
  phase = 'result';
  if (answered() >= N) reportRun();            // run complete: the hub shows the profile even if the tab closes here
  showResult(L, side);
}

function flavorFor(agree) {
  if (agree >= 88) return 'Practically unanimous. The crowd and you are in perfect sync.';
  if (agree >= 65) return 'The crowd is with you.';
  if (agree >= 45) return 'Dead split. Philosophers everywhere are sweating.';
  if (agree >= 25) return 'You are in the spicy minority.';
  return 'Wow. Truly walking your own track.';
}

function showResult(L, side) {
  const pullPct = L.pullPct, stayPct = 100 - pullPct;
  const agree = side === 1 ? pullPct : stayPct;
  $('#btnStay').hidden = true; $('#btnPull').hidden = true;
  $('#resStay').hidden = false; $('#resPull').hidden = false;
  const mine = side === 1 ? 'Pull' : 'Stay';
  $('#res' + mine).classList.add('chosen'); $('#you' + mine).hidden = false; $('#side' + mine).classList.add('chosen');
  const run = (k, target) => {
    $('#meter' + k).style.width = target + '%';
    tween(700, e => { $('#pct' + k).textContent = String(Math.round(target * e)); }, ease.outCubic);
  };
  requestAnimationFrame(() => { run('Stay', stayPct); run('Pull', pullPct); });
  $('#outcome').textContent = (side === 1 ? L.pull : L.stay).out;
  $('#agreeTxt').textContent = `${agree}% of players agreed with you`;
  $('#flavor').textContent = flavorFor(agree);
  $('#btnNext').textContent = idx === N - 1 ? 'See my ethics profile ▸' : 'Next level ▸';
  $('#result').hidden = false;
  Sound.reveal();
  // the window may have been resized while the trolley was rolling: redraw the finished scene at the new width
  const cw = Math.round($('#sceneWrap').clientWidth);
  if (scene && cw && Math.abs(cw - scene.W) >= 3) buildScene(L, { done: true, side });
  const nb = $('#btnNext');
  try { nb.focus({ preventScroll: true }); } catch { /* ignore */ }
  try { $('#result').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); } catch { /* ignore */ }
}

function next() {
  if (phase !== 'result') return;
  Sound.click();
  if (idx >= N - 1) { finish(); return; }
  loadLevel(idx + 1);
}

function reportRun() {
  const s = computeStats();
  Ballpark.report('trolley', { score: s.done, max: N, label: pickProfile(s).name });
}

function finish() {
  reportRun();
  showEnd(true);
  Sound.fanfare();
}

function showEnd() {
  phase = 'end';
  if (scene) { scene.dead = true; }
  const s = computeStats();
  const prof = pickProfile(s);
  lastProfile = { s, prof };
  show('end');
  $('#pEmoji').textContent = prof.emoji;
  $('#pName').textContent = prof.name;
  $('#pBlurb').textContent = prof.blurb;
  $('#stPull').textContent = `${s.pulls}/${N}`;
  $('#stCrowd').textContent = `${Math.round(s.m * 100)}%`;
  $('#stLogic').textContent = `${Math.round(s.u * 100)}%`;
  const grid = $('#grid');
  grid.textContent = '';
  LEVELS.forEach((L, i) => {
    const c = choices[i];
    const d = document.createElement('div');
    const withCrowd = c !== null && c === (L.pullPct >= 50 ? 1 : 0);
    d.className = 'cell ' + (c === 1 ? 'p' : 's') + (withCrowd ? ' crowd' : '');
    d.textContent = String(i + 1);
    d.setAttribute('role', 'listitem');
    const agree = c === 1 ? L.pullPct : 100 - L.pullPct;
    d.title = `Level ${i + 1}: ${L.title} - you ${c === 1 ? 'pulled the lever' : 'did nothing'} (${agree}% agreed, simulated)`;
    d.setAttribute('aria-label', d.title);
    grid.appendChild(d);
  });
  if (s.lonely) {
    const L = LEVELS[s.lonely.i];
    $('#nLonely').textContent = s.lonely.agree < 50
      ? `Your lonesomest pick: Level ${s.lonely.i + 1}, "${L.title}". Only ${s.lonely.agree}% of players sided with you.`
      : `Even your most unusual pick (Level ${s.lonely.i + 1}, "${L.title}") had ${s.lonely.agree}% of players on your side. Very agreeable.`;
  }
  $('#nSlow').textContent = !s.slow ? ''
    : s.slow.ms < 6000
      ? `Longest think: Level ${s.slow.i + 1}, "${LEVELS[s.slow.i].title}", a mere ${fmtTime(s.slow.ms)}. Decisive. (Or you skimmed.)`
      : `Longest think: Level ${s.slow.i + 1}, "${LEVELS[s.slow.i].title}", ${fmtTime(s.slow.ms)} of pure philosophical suffering.`;
  $('#nSlow').hidden = !s.slow;
  const btn = $('#btnShare');
  try { btn.focus({ preventScroll: true }); } catch { /* ignore */ }
}

function shareText() {
  const { s, prof } = lastProfile || (() => { const s = computeStats(); return { s, prof: pickProfile(s) }; })();
  const rows = [];
  for (let r = 0; r < 4; r++) {
    let row = '';
    for (let c = 0; c < 7; c++) row += choices[r * 7 + c] === 1 ? '🟧' : '🟦';
    rows.push(row);
  }
  let url = '';
  try { url = location.origin + location.pathname; } catch { /* ignore */ }
  return `🚋 TROLLEY TROUBLE: I'm a ${prof.name} ${prof.emoji}\n` +
    `Pulled the lever ${s.pulls}/${N} times · sided with the (simulated) crowd ${Math.round(s.m * 100)}%\n` +
    rows.join('\n') + '\n🟧 pulled  🟦 did nothing\n' + url;
}
async function copyText(t) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

function restart() {
  choices = Array(N).fill(null);
  times = Array(N).fill(0);
  saveProgress();
  lastProfile = null;
  loadLevel(0);
}

function setMuted(m) {
  muted = m;
  store.set('muted', muted);
  const b = $('#muteBtn');
  b.textContent = muted ? '🔇' : '🔊';
  b.setAttribute('aria-pressed', String(muted));
  b.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

/* ------------------------------------------------------------------ events */
$('#btnStart').addEventListener('click', startGame);
$('#btnRestart').addEventListener('click', e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = 'Really? Click again to reset';
    clearTimeout(b.__t); b.__t = setTimeout(updateTitle, 3500);
    return;
  }
  Sound.unlock();
  restart();
});
$('#btnStay').addEventListener('click', () => choose(0));
$('#btnPull').addEventListener('click', () => choose(1));
$('#btnNext').addEventListener('click', next);
$('#btnShare').addEventListener('click', async () => {
  Sound.click();
  const ok = await copyText(shareText());
  toast(ok ? 'Copied! Paste it anywhere.' : 'Could not copy. Select the text manually.');
});
$('#btnAgain').addEventListener('click', () => { Sound.unlock(); Sound.click(); restart(); });
$('#muteBtn').addEventListener('click', () => { setMuted(!muted); if (!muted) { Sound.unlock(); Sound.click(); } });

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === 'm' || k === 'M') { setMuted(!muted); return; }
  const onButton = e.target && e.target.tagName === 'BUTTON';
  if (phase === 'idle') {
    if (k === 'ArrowLeft' || k === 'n' || k === 'N') { e.preventDefault(); choose(0); }
    else if (k === 'ArrowRight' || k === 'p' || k === 'P' || k === 'l' || k === 'L') { e.preventDefault(); choose(1); }
  } else if (phase === 'result') {
    if (k === 'ArrowRight') { e.preventDefault(); next(); }
    else if ((k === 'Enter' || k === ' ') && !onButton) { e.preventDefault(); next(); }
  } else if (phase === 'title') {
    if ((k === 'Enter' || k === ' ') && !onButton) { e.preventDefault(); startGame(); }
  }
});

let resizeT = 0, lastW = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (phase !== 'idle' && phase !== 'result') return;
    const w = Math.round($('#sceneWrap').clientWidth);
    if (!w || Math.abs(w - (scene ? scene.W : 0)) < 3) return;
    const L = LEVELS[idx];
    if (phase === 'idle') buildScene(L, { noIntro: true });
    else buildScene(L, { done: true, side: choices[idx] });
  }, 160);
});

/* ------------------------------------------------------------------ boot */
setMuted(muted);
buildLogo();
updateTitle();
show('title');

// tiny hook for automated testing / debugging
window.__trolley = {
  get phase() { return phase; }, get idx() { return idx; }, choices: () => choices.slice(), stats: computeStats, profile: () => pickProfile(computeStats()),
  classify(c, t) { const sc = choices, st = times; choices = c; times = t; try { return pickProfile(computeStats()).name; } finally { choices = sc; times = st; } }
};
})();
