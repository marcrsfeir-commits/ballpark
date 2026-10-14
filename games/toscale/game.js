// TO SCALE — resize the red silhouette to its real size next to the blue reference.
import { OBJECTS, PAIRS } from './objects.js';

const BP = window.Ballpark;
const store = BP.store('toscale');
const EPOCH = '2026-09-15';
const today = BP.dayNumber(EPOCH);
const byId = Object.fromEntries(OBJECTS.map(o => [o.id, o]));
const $ = s => document.querySelector(s);
const cv = $('#stage'), g = cv.getContext('2d');
const BLUE = '#6aa8ff', RED = '#e5212e';

// ---------- silhouettes ----------
// Unit-box polygons (x 0..1 across, y 0..1 top→ground) for things with no good emoji; [aspect w/h, ...polygons]
const SHAPES = {
  eiffel: [0.38, [[0,1],[.2,1],[.33,.8],[.67,.8],[.8,1],[1,1],[.72,.68],[.6,.42],[.54,.2],[.515,.05],[.505,0],[.495,0],[.485,.05],[.46,.2],[.4,.42],[.28,.68]]],
  bigben: [0.17, [[.15,1],[.85,1],[.85,.36],[.95,.36],[.95,.22],[.9,.22],[.5,.04],[.1,.22],[.05,.22],[.05,.36],[.15,.36]], [[.47,.05],[.53,.05],[.51,0],[.49,0]]],
  burj: [0.11, [[0,1],[1,1],[1,.85],[.85,.85],[.85,.68],[.72,.68],[.72,.5],[.62,.5],[.62,.32],[.56,.32],[.56,.16],[.52,.16],[.505,0],[.495,0],[.48,.16],[.44,.16],[.44,.32],[.38,.32],[.38,.5],[.28,.5],[.28,.68],[.15,.68],[.15,.85],[0,.85]]],
  christ: [0.74, [[.38,1],[.62,1],[.62,.8],[.6,.8],[.57,.33],[1,.32],[1,.25],[.57,.24],[.555,.2],[.445,.2],[.43,.24],[0,.25],[0,.32],[.43,.33],[.4,.8],[.38,.8]], [[.45,.2],[.55,.2],[.56,.1],[.5,.04],[.44,.1]]],
  stepped: [1.8, [[0,1],[1,1],[.95,.89],[.9,.89],[.86,.78],[.82,.78],[.78,.67],[.74,.67],[.7,.56],[.66,.56],[.62,.45],[.6,.45],[.6,.18],[.4,.18],[.4,.45],[.38,.45],[.34,.56],[.3,.56],[.26,.67],[.22,.67],[.18,.78],[.14,.78],[.1,.89],[.05,.89]]],
  pyramid: [1.57, [[0,1],[1,1],[.5,0]]],
  pisa: [0.42, [[0,1],[.55,1],[.98,.06],[.72,0],[.45,.06]]],
  mountain: [3.2, [[0,1],[.18,.62],[.26,.7],[.4,.25],[.47,.33],[.55,0],[.63,.22],[.7,.18],[.82,.55],[.9,.5],[1,1]]],
  mountain2: [3.6, [[0,1],[.2,.6],[.3,.5],[.42,.12],[.5,0],[.6,.14],[.72,.45],[.85,.6],[1,1]]],
  mountain3: [4.2, [[0,1],[.25,.4],[.36,.06],[.44,0],[.58,0],[.66,.08],[.78,.42],[1,1]]],
  empire: [0.22, [[0,1],[1,1],[1,.78],[.88,.78],[.88,.42],[.76,.42],[.76,.3],[.64,.3],[.6,.22],[.53,.2],[.51,0],[.49,0],[.47,.2],[.4,.22],[.36,.3],[.24,.3],[.24,.42],[.12,.42],[.12,.78],[0,.78]]],
  plane: [3.0, [[0,.62],[.05,.5],[.1,.48],[.13,.05],[.2,.05],[.3,.45],[.9,.45],[.97,.5],[1,.58],[.97,.66],[.9,.7],[.1,.7]], [[.42,.62],[.6,.62],[.5,.95],[.44,.95]]],
  rocket: [0.17, [[.5,0],[.62,.08],[.62,.86],[1,1],[0,1],[.38,.86],[.38,.08]]],
  bat: [0.12, [[.38,0],[.62,0],[.62,.32],[.95,.36],[.95,.98],[.5,1],[.05,.98],[.05,.36],[.38,.32]]],
  racket: [0.4, 'racket'],
  paper: [0.707, [[0,0],[.78,0],[1,.16],[1,1],[0,1]]],
  bottle: [0.25, [[.38,0],[.62,0],[.62,.36],[.95,.5],[1,.56],[1,1],[0,1],[0,.56],[.05,.5],[.38,.36]]],
  pitch: [43, [[0,1],[1,1],[1,.86],[0,.86]], [[0,.86],[.004,.86],[.004,0],[0,0]], [[.996,.86],[1,.86],[1,0],[.996,0]]],
  door: [0.45, [[0,0],[1,0],[1,1],[0,1]]],
  fridge: [0.42, [[.03,0],[.97,0],[1,.03],[1,1],[0,1],[0,.03]]],
};
const cache = new Map();
function silhouette(o, color) {
  const key = o.id + color;
  if (cache.has(key)) return cache.get(key);
  let c;
  if (o.e) {
    const t = document.createElement('canvas'); t.width = t.height = 320;
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.font = '240px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.fillText(o.e, 160, 170);
    const d = tg.getImageData(0, 0, 320, 320).data;
    let x0 = 320, y0 = 320, x1 = 0, y1 = 0;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) if (d[(y * 320 + x) * 4 + 3] > 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) { x0 = 40; y0 = 40; x1 = 280; y1 = 280; }
    c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    const cg = c.getContext('2d');
    cg.drawImage(t, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    cg.globalCompositeOperation = 'source-in'; cg.fillStyle = color; cg.fillRect(0, 0, c.width, c.height);
  } else {
    const [aspect, ...polys] = SHAPES[o.s];
    const H = 400, W = Math.max(8, Math.round(H * Math.min(aspect, 12)));
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const cg = c.getContext('2d'); cg.fillStyle = color;
    if (polys[0] === 'racket') {
      cg.beginPath(); cg.ellipse(W / 2, H * 0.24, W * 0.48, H * 0.235, 0, 0, Math.PI * 2); cg.ellipse(W / 2, H * 0.24, W * 0.38, H * 0.19, 0, 0, Math.PI * 2); cg.fill('evenodd');
      cg.beginPath(); cg.moveTo(W * .42, H * .46); cg.lineTo(W * .58, H * .46); cg.lineTo(W * .56, H); cg.lineTo(W * .44, H); cg.fill();
    } else for (const p of polys) { cg.beginPath(); p.forEach(([x, y], i) => (i ? cg.lineTo(x * W, y * H) : cg.moveTo(x * W, y * H))); cg.closePath(); cg.fill(); }
    c.aspect = aspect;
  }
  c.aspect = c.aspect || c.width / c.height;
  cache.set(key, c);
  return c;
}
// world size (metres) of an object drawn at `size` along its axis
function dims(o, size) {
  const a = silhouette(o, BLUE).aspect;
  return o.axis === 'height' ? { w: size * a, h: size } : { w: size, h: size / a };
}

// ---------- rounds ----------
function roundsFor(n) {
  const r = BP.rng('toscale:' + n + ':' + BP.deviceSeed());
  const curated = PAIRS.slice();
  const cyc = BP.rng('toscale-pairs:' + Math.floor((n - 1) / 15) + ':' + BP.deviceSeed());
  for (let i = curated.length - 1; i > 0; i--) { const j = Math.floor(cyc() * (i + 1)); [curated[i], curated[j]] = [curated[j], curated[i]]; }
  const out = curated.slice(((n - 1) % 15) * 2, ((n - 1) % 15) * 2 + 2);
  while (out.length < 5) {
    const a = OBJECTS[Math.floor(r() * OBJECTS.length)], b = OBJECTS[Math.floor(r() * OBJECTS.length)];
    const ra = dims(a, a.size), rb = dims(b, b.size), ratio = Math.max(ra.h, rb.h) / Math.min(ra.h, rb.h);
    if (a === b || ratio > 25 || ratio < 1.15 || out.some(p => p.includes(a.id) || p.includes(b.id))) continue;
    out.push([a.id, b.id]);
  }
  return out.map(([ref, tgt], i) => {
    const k = BP.rng(`start:${n}:${i}:${BP.deviceSeed()}`)();
    const f = k < 0.5 ? 0.25 + k * 0.7 : 1.6 + (k - 0.5) * 4;   // start clearly wrong
    return { ref, tgt, start: byId[tgt].size * f };
  });
}

let day = today, rounds = [], ri = 0, guess = 1, shown = 1, revealed = false, practice = false, zoom = 1, ppm = 1, ppmTarget = 1, dragging = null;
let state = { results: [] };

function loadDay(n) {
  day = n; practice = n !== today;
  rounds = roundsFor(n);
  state = store.get('day:' + n, { results: [] });
  if (practice) state = { results: [] };
  ri = Math.min(state.results.length, 4);
  $('#archHead').hidden = !practice;
  $('#archHead').textContent = `${BP.dateForDay(n, EPOCH).toISOString().slice(0, 10)} · No. ${n} · PRACTICE ONLY`;
  $('#end').hidden = true;
  if (state.results.length >= 5) return showEnd();
  startRound();
}
function startRound() {
  const R = rounds[ri];
  revealed = false; zoom = 1;
  guess = shown = R.start;
  const ref = byId[R.ref], tgt = byId[R.tgt];
  const word = o => (o.axis === 'height' ? 'height' : 'length');
  $('#refLine').innerHTML = `Reference: <b>${ref.name}</b> <span>(${word(ref)} to scale · ${ref.detail})</span>`;
  $('#tgtLine').innerHTML = `<b>${tgt.name}</b> <span>(adjust the ${word(tgt)} · ${tgt.detail})</span>`;
  $('#fact').textContent = '';
  $('#badge').hidden = true;
  $('#lock').textContent = 'Lock In';
  $('#roundLabel').textContent = `ROUND ${ri + 1} / 5${practice ? ' · PRACTICE' : ''}`;
  $('#scoreLabel').textContent = state.results.reduce((s, x) => s + x.pts, 0);
  $('#hint').hidden = false;
  fit(true);
}

// ---------- layout + drawing ----------
const PAD = 36;
function layout(tSize) {
  const R = rounds[ri], ref = byId[R.ref], tgt = byId[R.tgt];
  return { ref, tgt, rd: dims(ref, ref.size), td: dims(tgt, tSize) };
}
function fitPPM(sizeForFit) {
  const W = cv.clientWidth, H = cv.clientHeight, { rd, td } = layout(sizeForFit);
  return Math.min((W - PAD * 3) / (rd.w + td.w), (H - 90) / Math.max(rd.h, td.h));
}
function fit(instant) {
  const s = revealed ? Math.max(guess, byId[rounds[ri].tgt].size) : shown;
  ppmTarget = fitPPM(s) * zoom;
  if (instant) ppm = ppmTarget;
}
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (rounds.length) fit(true);
}
addEventListener('resize', resize);

let tgtBox = { x: 0, y: 0, w: 0, h: 0 };
function draw() {
  requestAnimationFrame(draw);
  if (!rounds.length) return;
  if (!dragging) ppm += (ppmTarget - ppm) * 0.18;
  if (revealed) shown += (byId[rounds[ri].tgt].size - shown) * 0.12;
  else shown = guess;
  const W = cv.clientWidth, H = cv.clientHeight, ground = H - 46;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#3f5aa0'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, ground + 1); g.lineTo(W, ground + 1); g.stroke();
  g.fillStyle = 'rgba(63,90,160,.12)'; g.fillRect(0, ground + 2, W, H);
  const { ref, tgt, rd, td } = layout(shown);
  const total = (rd.w + td.w) * ppm + PAD;
  let x = Math.max(PAD, (W - total) / 2);
  const put = (o, d, color, alpha = 1) => {
    const img = silhouette(o, color), w = Math.max(1, d.w * ppm), h = Math.max(1, d.h * ppm);
    g.globalAlpha = alpha; g.drawImage(img, x, ground - h, w, h); g.globalAlpha = 1;
    return { x, y: ground - h, w, h };
  };
  const rb = put(ref, rd, BLUE);
  label(ref.name, rb, ground, BLUE);
  x += rd.w * ppm + PAD;
  if (revealed) {                                        // ghost of your guess
    const gd = dims(tgt, guess), gw = gd.w * ppm, gh = gd.h * ppm;
    g.globalAlpha = 0.28; g.drawImage(silhouette(tgt, '#ffffff'), x, ground - gh, gw, gh); g.globalAlpha = 1;
    g.setLineDash([6, 5]); g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5; g.strokeRect(x, ground - gh, gw, gh); g.setLineDash([]);
    g.fillStyle = '#c9cfe0'; g.font = '700 10px Consolas, monospace'; g.fillText('your guess', x, ground - gh - 6);
  }
  tgtBox = put(tgt, td, RED, revealed ? 0.85 : 1);
  label(tgt.name, tgtBox, ground, '#ff5a63');
  if (!revealed) {                                       // resize handle
    const hx = tgtBox.x + tgtBox.w + 10, hy = Math.max(14, tgtBox.y - 10);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx - 7, hy + 7); g.lineTo(hx + 5, hy - 5); g.moveTo(hx - 1, hy - 5); g.lineTo(hx + 5, hy - 5); g.lineTo(hx + 5, hy + 1); g.stroke();
  }
}
function label(text, b, ground, color) {
  g.fillStyle = color; g.font = '600 11px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(text.length > 26 ? text.slice(0, 25) + '…' : text, b.x + b.w / 2, ground + 18); g.textAlign = 'left';
}

// ---------- input ----------
const clampGuess = v => Math.min(byId[rounds[ri].tgt].size * 60, Math.max(byId[rounds[ri].tgt].size / 60, v));
cv.addEventListener('pointerdown', e => {
  if (revealed) return;
  cv.setPointerCapture(e.pointerId);
  dragging = { x: e.clientX, y: e.clientY, start: guess };
  $('#hint').hidden = true;
  sfx(520, 0.04);
});
cv.addEventListener('pointermove', e => {
  if (!dragging) return;
  const d = (dragging.y - e.clientY) + (e.clientX - dragging.x) * 0.5;
  guess = clampGuess(dragging.start * Math.exp(d / 140));
});
const endDrag = () => { if (dragging) { dragging = null; fit(); } };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('wheel', e => {
  if (revealed) return;
  e.preventDefault();
  guess = clampGuess(guess * Math.exp(-e.deltaY * 0.0015));
  clearTimeout(cv.wt); cv.wt = setTimeout(fit, 250);
}, { passive: false });
addEventListener('keydown', e => {
  if (!$('#modal').hidden) return;
  if (e.key === 'Enter') return $('#lock').click();
  if (revealed) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { guess = clampGuess(guess * 1.04); e.preventDefault(); fit(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { guess = clampGuess(guess / 1.04); e.preventDefault(); fit(); }
});
$('#zin').onclick = () => { zoom *= 1.5; fit(); };
$('#zout').onclick = () => { zoom /= 1.5; fit(); };
$('#fit').onclick = () => { zoom = 1; fit(); };

// ---------- lock / reveal ----------
$('#lock').onclick = () => {
  if (!rounds.length) return;
  if (!revealed) {
    const tgt = byId[rounds[ri].tgt], err = Math.abs(Math.log(guess / tgt.size));
    const pts = Math.round(100 * Math.exp(-2.5 * err));
    revealed = true; zoom = 1; fit();
    state.results[ri] = { pts, off: Math.round((guess / tgt.size - 1) * 100), pair: [rounds[ri].ref, rounds[ri].tgt] };
    if (!practice) store.set('day:' + day, state);
    $('#badge').innerHTML = `${pts} <small>/ 100</small>`; $('#badge').hidden = false;
    const off = state.results[ri].off;
    $('#fact').textContent = `${off === 0 ? 'Dead on!' : `You were ${Math.abs(off)}% ${off > 0 ? 'too big' : 'too small'}.`} ${tgt.fact || ''}`;
    $('#scoreLabel').textContent = state.results.reduce((s, x) => s + x.pts, 0);
    $('#lock').textContent = ri < 4 ? 'Next Round →' : 'See Results →';
    sfx(pts > 80 ? 880 : pts > 50 ? 660 : 330, 0.18, 'triangle');
  } else if (ri < 4) { ri++; startRound(); }
  else showEnd();
};

const emo = p => (p >= 80 ? '🟩' : p >= 50 ? '🟨' : '🟥');
function showEnd() {
  const total = state.results.reduce((s, x) => s + x.pts, 0), line = state.results.map(r => emo(r.pts)).join('');
  if (!practice && !state.reported) {
    state.reported = true; store.set('day:' + day, state);
    BP.report('toscale', { score: total, max: 500, label: `${total}/500 ${line}` });
    const best = store.get('best', 0); if (total > best) store.set('best', total);
  }
  const end = $('#end');
  end.hidden = false;
  end.innerHTML = `<h2>${total} / 500</h2><div>${line} · best ${store.get('best', 0)}</div>
    <div class="rows">${state.results.map(r => `<div><span>${emo(r.pts)}</span><span>${byId[r.pair[1]].name} vs ${byId[r.pair[0]].name} · ${r.off > 0 ? '+' : ''}${r.off}%</span><b>${r.pts}</b></div>`).join('')}</div>
    <div class="btns"><button class="primary" id="share">Copy result</button><button id="again">Practice round</button><button id="arch2">Archive</button><a href="../../index.html">BALLPARK</a></div>`;
  $('#share').onclick = () => navigator.clipboard?.writeText(`To Scale No. ${day}${practice ? ' (practice)' : ''} · ${total}/500\n${line}`).then(() => toast('Copied!'));
  $('#again').onclick = practiceRound;
  $('#arch2').onclick = openArchive;
  end.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function practiceRound() {
  practice = true; $('#end').hidden = true;
  rounds = roundsFor(1000 + Math.floor(Math.random() * 100000)); state = { results: [] }; ri = 0;
  $('#archHead').hidden = false; $('#archHead').textContent = 'PRACTICE · random pairs';
  startRound();
}

// ---------- archive / help / sound ----------
function openArchive() {
  const days = Array.from({ length: today }, (_, i) => today - i).map(n => {
    const s = store.get('day:' + n, { results: [] }), tot = s.results.reduce((a, x) => a + x.pts, 0);
    return `<button data-n="${n}">No. ${n}<small>${BP.dateForDay(n, EPOCH).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${s.results.length >= 5 ? tot + '/500' : n === today ? 'today' : 'unplayed'}</small></button>`;
  }).join('');
  modal(`<h3>Archive</h3><p>Past days are practice only.</p><div class="days">${days}</div>`);
  $('#modalBody').onclick = e => { const b = e.target.closest('[data-n]'); if (b) { $('#modal').hidden = true; loadDay(Number(b.dataset.n)); } };
}
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
$('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').hidden = true; };
$('#archBtn').onclick = openArchive;
$('#practiceBtn').onclick = practiceRound;
$('#helpBtn').onclick = () => modal(`<h3>How to play</h3><p>The <b style="color:#6aa8ff">blue</b> silhouette is drawn at its true size. Stretch the <b style="color:#ff5a63">red</b> one until it matches real life — drag it up or down, scroll, or use the arrow keys — then <b>Lock In</b>.</p><p>Five pairs a day, up to 100 points each. Use the zoom buttons when one of them is enormous.</p>`);
let muted = store.get('muted', false), ac = null;
$('#muteBtn').textContent = 'Sound: ' + (muted ? 'off' : 'on');
$('#muteBtn').onclick = () => { muted = !muted; store.set('muted', muted); $('#muteBtn').textContent = 'Sound: ' + (muted ? 'off' : 'on'); };
function sfx(f, d, type = 'sine') {
  if (muted) return;
  try {
    ac = ac || new AudioContext();
    const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(0.1, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch { /* no audio */ }
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 1600); }

resize();
const qs = new URLSearchParams(location.search);
if (qs.get('gallery')) {
  rounds = [{ ref: 'human', tgt: 'human', start: 1.7 }];
  document.querySelector('.wrap').insertAdjacentHTML('beforeend', `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:20px">${OBJECTS.map(o => `<figure style="margin:0;background:#10172d;border-radius:10px;padding:8px"><img data-id="${o.id}" style="height:70px;max-width:100%;object-fit:contain"><figcaption style="font-size:11px">${o.name}</figcaption></figure>`).join('')}</div>`);
  document.querySelectorAll('img[data-id]').forEach(i => { i.src = silhouette(byId[i.dataset.id], RED).toDataURL(); });
}
loadDay(Number(qs.get('day')) || today);
if (!store.get('seenHelp', false)) { store.set('seenHelp', true); $('#helpBtn').click(); }
draw();
