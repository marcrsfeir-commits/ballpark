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
// Every object is a silhouette cut from a real side-profile photo (sil/<id>.png, white on transparent, made by
// tools/toscale-sil.py from photos/<id>.webp — Wikimedia Commons, licences in photos/credits.json). Only the
// silhouette is ever drawn; the photos stay on the side. Loaded before the first round.
const SIL = new Map();
await Promise.all(OBJECTS.map(o => new Promise(res => {
  const img = new Image();
  img.onload = () => { SIL.set(o.id, img); res(); };
  img.onerror = () => { console.warn('missing silhouette', o.id); res(); };
  img.src = `sil/${o.id}.png`;
})));
const cache = new Map();
function silhouette(o, color) {
  const key = o.id + color;
  if (cache.has(key)) return cache.get(key);
  const img = SIL.get(o.id);
  const c = document.createElement('canvas');
  c.width = img ? img.naturalWidth : 100; c.height = img ? img.naturalHeight : 100;
  const cg = c.getContext('2d');
  if (img) { cg.drawImage(img, 0, 0); cg.globalCompositeOperation = 'source-in'; }
  cg.fillStyle = color; cg.fillRect(0, 0, c.width, c.height);
  c.aspect = c.width / c.height;
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

let day = today, rounds = [], ri = 0, guess = 1, shown = 1, revealed = false, practice = false, endless = false, lives = 0, zoom = 1, ppm = 1, ppmTarget = 1, dragging = null;
let state = { results: [] };

function loadDay(n) {
  day = n; practice = n !== today; endless = false;
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
  $('#roundLabel').innerHTML = endless ? `ROUND ${ri + 1} · ${HEART.repeat(lives)}` : `ROUND ${ri + 1} / 5${practice ? ' · ARCHIVE' : ''}`;
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
    if (endless && pts < ENDLESS_PASS) lives--;
    $('#badge').innerHTML = `${pts} <small>/ 100</small>`; $('#badge').hidden = false;
    const off = state.results[ri].off;
    $('#fact').textContent = `${off === 0 ? 'Dead on!' : `You were ${Math.abs(off)}% ${off > 0 ? 'too big' : 'too small'}.`} ${tgt.fact || ''}`;
    $('#scoreLabel').textContent = state.results.reduce((s, x) => s + x.pts, 0);
    $('#lock').textContent = hasNext() ? 'Next Round →' : 'See Results →';
    if (endless) $('#roundLabel').innerHTML = `ROUND ${ri + 1} · ${lives ? HEART.repeat(lives) : 'OUT OF LIVES'}${pts < ENDLESS_PASS ? ' · −1 life (under ' + ENDLESS_PASS + ')' : ''}`;
    sfx(pts > 80 ? 880 : pts > 50 ? 660 : 330, 0.18, 'triangle');
  } else if (hasNext()) { ri++; if (ri >= rounds.length) rounds.push(endlessRound()); startRound(); }
  else showEnd();
};

const hasNext = () => (endless ? lives > 0 : ri < 4);
const emo = p => (p >= 80 ? '■' : p >= 50 ? '▣' : '□');   // plain squares, never emoji
const HEART = '<svg class="life" viewBox="0 0 16 14" aria-hidden="true"><path d="M8 14 1.4 7.4A4 4 0 0 1 8 2.3a4 4 0 0 1 6.6 5.1Z"/></svg>';
function showEnd() {
  if (endless) return showEndlessEnd();
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
    <div class="btns"><button class="primary" id="share">Copy result</button><button id="again">Play Endless</button><button id="arch2">Archive</button><a href="../../index.html">BALLPARK</a></div>`;
  $('#share').onclick = () => navigator.clipboard?.writeText(`To Scale No. ${day}${practice ? ' (practice)' : ''} · ${total}/500\n${line}`).then(() => toast('Copied!'));
  $('#again').onclick = startEndless;
  $('#arch2').onclick = openArchive;
  end.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- endless: fresh random pairs until you run out of lives ----------
const ENDLESS_LIVES = 3, ENDLESS_PASS = 50, RECENT = 40;
let recent = [];
function endlessRound() {
  for (let tries = 0; tries < 500; tries++) {
    const a = OBJECTS[Math.floor(Math.random() * OBJECTS.length)], b = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
    const ra = dims(a, a.size), rb = dims(b, b.size), ratio = Math.max(ra.h, rb.h) / Math.min(ra.h, rb.h);
    if (a === b || ratio > 25 || ratio < 1.15 || (tries < 400 && (recent.includes(a.id) || recent.includes(b.id)))) continue;
    recent = [...recent, a.id, b.id].slice(-RECENT);
    const k = Math.random(), f = k < 0.5 ? 0.25 + k * 0.7 : 1.6 + (k - 0.5) * 4;
    return { ref: a.id, tgt: b.id, start: b.size * f };
  }
  return { ref: 'horse', tgt: 'car', start: 2 };
}
function startEndless() {
  practice = true; endless = true; lives = ENDLESS_LIVES; $('#end').hidden = true;
  rounds = [endlessRound()]; state = { results: [] }; ri = 0;
  $('#archHead').hidden = false; $('#archHead').textContent = `ENDLESS · score under ${ENDLESS_PASS} loses a life`;
  startRound();
}
function showEndlessEnd() {
  const total = state.results.reduce((s, x) => s + x.pts, 0), n = state.results.length;
  const best = store.get('bestEndless', 0); if (total > best) store.set('bestEndless', total);
  const end = $('#end');
  end.hidden = false;
  end.innerHTML = `<h2>${total} pts</h2><div>${n} rounds · best endless ${store.get('bestEndless', 0)}</div>
    <div class="rows">${state.results.slice(-10).map(r => `<div><span>${emo(r.pts)}</span><span>${byId[r.pair[1]].name} vs ${byId[r.pair[0]].name} · ${r.off > 0 ? '+' : ''}${r.off}%</span><b>${r.pts}</b></div>`).join('')}</div>
    <div class="btns"><button class="primary" id="again">Play again</button><button id="share">Copy result</button><a href="../../index.html">BALLPARK</a></div>`;
  $('#share').onclick = () => navigator.clipboard?.writeText(`To Scale Endless · ${total} pts in ${n} rounds\n${state.results.map(r => emo(r.pts)).join('')}`).then(() => toast('Copied!'));
  $('#again').onclick = startEndless;
  end.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
$('#endlessBtn').onclick = startEndless;
$('#dailyBtn').onclick = () => loadDay(today);
$('#helpBtn').onclick = () => modal(`<h3>How to play</h3><p>The <b style="color:#6aa8ff">blue</b> silhouette is drawn at its true size. Stretch the <b style="color:#ff5a63">red</b> one until it matches real life — drag it up or down, scroll, or use the arrow keys — then <b>Lock In</b>.</p><p>Five pairs a day, up to 100 points each. <b>Endless</b> keeps going with new pairs — score under 50 and you lose one of 3 lives. Use the zoom buttons when one of them is enormous.</p>`);
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
  rounds = [{ ref: 'horse', tgt: 'horse', start: 2 }];
  document.querySelector('.wrap').insertAdjacentHTML('beforeend', `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:20px">${OBJECTS.map(o => `<figure style="margin:0;background:#10172d;border-radius:10px;padding:8px"><img data-id="${o.id}" style="height:70px;max-width:100%;object-fit:contain"><figcaption style="font-size:11px">${o.name}</figcaption></figure>`).join('')}</div>`);
  document.querySelectorAll('img[data-id]').forEach(i => { i.src = silhouette(byId[i.dataset.id], RED).toDataURL(); });
}
loadDay(Number(qs.get('day')) || today);
if (!store.get('seenHelp', false)) { store.set('seenHelp', true); $('#helpBtn').click(); }
draw();
