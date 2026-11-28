// ODD HUE — find the block with a different shade. Classic (one mistake ends it), Rush (60 s, growing grid), Daily (seeded),
// Shades (sort a strip of tiles into a smooth fade against the clock).
const $ = s => document.querySelector(s);
const BP = window.Ballpark;
const store = BP ? BP.store('oddhue') : { get: (k, f) => f, set: () => {} };

const grid = $('#grid');
const strip = $('#strip');
let mode = 'classic', score = 0, running = false, rand = Math.random, oddIndex = 0;
let clockLeft = 60, clockTimer = null, lastT = 0;
const best = store.get('best', { classic: 0, rush: 0, daily: 0 });

// ---------- sound ----------
let ac = null, muted = store.get('muted', false);
function beep(freq, dur = 0.09, type = 'sine', vol = 0.12, delay = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no audio */ }
}

// colour is painted as pixels, not written into the page, so inspect element can't reveal any answer
function paint(colour) {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const g = c.getContext('2d'); g.fillStyle = colour; g.fillRect(0, 0, 4, 4);
  return c;
}
function tint(h, s) {
  document.body.style.backgroundColor = `hsl(${h} 30% 97%)`;
  document.documentElement.style.setProperty('--accent', `hsl(${h} ${Math.max(45, s)}% 45%)`);
}

// ---------- difficulty ----------
const layout = () => (mode === 'rush' ? Math.min(7, 2 + Math.floor(score / 4)) : 0); // 0 = classic 3x2
function delta() {
  return mode === 'rush' ? Math.max(3, 20 * Math.pow(0.95, score)) : Math.max(1.4, 24 * Math.pow(0.92, score));
}

function newRound() {
  const n = layout();
  const cols = n || 3, rows = n || 2, count = cols * rows;
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.classList.toggle('square', !!n);
  const h = Math.floor(rand() * 360);
  const s = 35 + Math.floor(rand() * 50);
  const l = 32 + Math.floor(rand() * 36);
  const d = delta() * (rand() < 0.5 ? -1 : 1);
  const l2 = Math.min(92, Math.max(8, l + d));
  oddIndex = Math.floor(rand() * count);
  tint(h, s);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const b = document.createElement('button');
    b.append(paint(`hsl(${h} ${s}% ${i === oddIndex ? l2 : l}%)`));
    b.setAttribute('aria-label', `Block ${i + 1}`);
    b.dataset.i = i;
    frag.append(b);
  }
  grid.replaceChildren(frag);
  grid.classList.remove('pop'); void grid.offsetWidth; grid.classList.add('pop');
}

// ---------- SHADES: sort the strip into a smooth fade ----------
// `tiles` lives only in this module: each entry's rank (its correct slot) never touches the DOM.
let tiles = [], sel = -1, locked = false, drag = null, solveTimer = null;
const SHADES_START = 40;
const stripSize = () => Math.min(8, 5 + Math.floor(score / 3));
const stripBonus = n => n + 1; // seconds added for sorting a strip of n tiles

function shuffledMiddle(n) {
  const mids = Array.from({ length: n - 2 }, (_, i) => i + 1);
  do {
    for (let i = mids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mids[i], mids[j]] = [mids[j], mids[i]]; }
  } while (mids.every((r, i) => r === i + 1) || (n > 5 && mids.filter((r, i) => r === i + 1).length > 1));
  return [0, ...mids, n - 1];
}

function newStrip() {
  const n = stripSize();
  const lSpan = Math.max(15, 46 - score * 2.2);               // lightness range across the strip
  const hSpan = Math.max(8, 60 - score * 4) * (Math.random() < 0.5 ? -1 : 1); // hue drift across the strip
  const h = Math.floor(Math.random() * 360), s = 45 + Math.floor(Math.random() * 35);
  const l0 = 20 + Math.random() * (80 - lSpan - 20);
  const up = Math.random() < 0.5;
  const colour = r => { const t = r / (n - 1); return `hsl(${((h + hSpan * t) % 360 + 360) % 360} ${s}% ${l0 + lSpan * (up ? t : 1 - t)}%)`; };
  tint(h, s);
  sel = -1;
  tiles = shuffledMiddle(n).map(rank => {
    const b = document.createElement('button');
    b.append(paint(colour(rank)));
    if (rank === 0 || rank === n - 1) b.classList.add('pin');
    return { el: b, rank };
  });
  strip.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  strip.classList.remove('solved', 'reveal');
  renderStrip();
  strip.classList.remove('pop'); void strip.offsetWidth; strip.classList.add('pop');
}

function renderStrip() {
  strip.replaceChildren(...tiles.map(t => t.el));
  tiles.forEach((t, i) => {
    t.el.classList.toggle('sel', i === sel);
    t.el.setAttribute('aria-label', t.el.classList.contains('pin') ? `Tile ${i + 1}, fixed end` : `Tile ${i + 1}`);
  });
}

// animate any reorder: remember where every tile is on screen, apply the change, then slide them from there
function flip(change) {
  const before = new Map(tiles.map(t => [t.el, t.el.getBoundingClientRect().left]));
  change();
  strip.classList.add('instant');
  tiles.forEach(t => { t.el.style.transform = ''; });
  renderStrip();
  tiles.forEach(t => {
    const dx = before.get(t.el) - t.el.getBoundingClientRect().left;
    if (Math.abs(dx) > 0.5) t.el.style.transform = `translateX(${dx}px)`;
  });
  void strip.offsetWidth;
  strip.classList.remove('instant');
  tiles.forEach(t => { t.el.style.transform = ''; });
}

function tapTile(pos) {
  if (!running || locked || mode !== 'shades' || !tiles[pos]) return;
  if (pos === 0 || pos === tiles.length - 1) { toast('The two ends are fixed'); return; }
  if (sel === -1) { sel = pos; beep(520, 0.05, 'triangle', 0.06); renderStrip(); return; }
  if (sel === pos) { sel = -1; renderStrip(); return; }
  const a = sel; sel = -1;
  flip(() => { [tiles[a], tiles[pos]] = [tiles[pos], tiles[a]]; });
  afterMove();
}

function afterMove() {
  beep(330, 0.05, 'triangle', 0.06);
  if (!tiles.every((t, i) => t.rank === i)) return;
  locked = true;
  score++;
  $('#score').textContent = score;
  const bonus = stripBonus(tiles.length);
  clockLeft += bonus;
  $('#msg').textContent = `Smooth! +${bonus}s`;
  strip.classList.add('solved');
  [523, 659, 784].forEach((f, i) => beep(f, 0.14, 'triangle', 0.08, i * 0.07));
  clearTimeout(solveTimer);
  solveTimer = setTimeout(() => {
    locked = false;
    if (!running || mode !== 'shades') return;
    $('#msg').textContent = 'Drag tiles into a smooth fade. The dotted ends stay put.';
    newStrip();
  }, 750);
}

strip.addEventListener('pointerdown', e => {
  const b = e.target.closest('button');
  if (!b || !running || locked || drag) return;
  const from = tiles.findIndex(t => t.el === b);
  if (from < 0) return;
  e.preventDefault();
  if (from === 0 || from === tiles.length - 1) { toast('The two ends are fixed'); return; }
  const r0 = tiles[0].el.getBoundingClientRect(), r1 = tiles[1].el.getBoundingClientRect();
  drag = { from, to: from, x0: e.clientX, id: e.pointerId, moved: false, step: r1.left - r0.left, el: b };
  try { b.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
});
strip.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0;
  if (!drag.moved) {
    if (Math.abs(dx) < 7) return;
    drag.moved = true; drag.el.classList.add('dragging');
    if (sel !== -1) { sel = -1; renderStrip(); }
  }
  const n = tiles.length;
  const cdx = Math.max((1 - drag.from) * drag.step, Math.min((n - 2 - drag.from) * drag.step, dx));
  drag.el.style.transform = `translateX(${cdx}px) scale(1.05)`;
  const to = drag.from + Math.round(cdx / drag.step);
  if (to === drag.to) return;
  drag.to = to;
  beep(260 + to * 30, 0.03, 'sine', 0.04);
  tiles.forEach((t, i) => {
    if (i === drag.from) return;
    let s = 0;
    if (drag.from < to && i > drag.from && i <= to) s = -1;
    else if (drag.from > to && i < drag.from && i >= to) s = 1;
    t.el.style.transform = s ? `translateX(${s * drag.step}px)` : '';
  });
});
function endDrag(e, cancelled) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  d.el.classList.remove('dragging');
  if (!d.moved) { if (!cancelled) tapTile(d.from); return; }
  const to = cancelled ? d.from : d.to;
  flip(() => { const [t] = tiles.splice(d.from, 1); tiles.splice(to, 0, t); });
  if (to !== d.from) afterMove();
}
strip.addEventListener('pointerup', e => endDrag(e, false));
strip.addEventListener('pointercancel', e => endDrag(e, true));
// keyboard: Enter/Space on a focused tile acts like a tap (pointer taps are handled above, so skip real clicks)
strip.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || e.detail !== 0) return;
  tapTile(tiles.findIndex(t => t.el === b));
});

// ---------- flow ----------
function start(m) {
  if (!['classic', 'rush', 'daily', 'shades'].includes(m)) m = 'classic';
  mode = m;
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  score = 0; running = true; locked = false; drag = null; sel = -1;
  clearTimeout(solveTimer);
  $('#score').textContent = '0';
  $('#best').textContent = best[m] || 0;
  $('#over').hidden = true;
  $('.sub').textContent = m === 'shades' ? 'Sort the shades into a smooth fade.' : 'Find the block with a different shade or brightness.';
  grid.hidden = m === 'shades';
  strip.hidden = m !== 'shades';
  const daily = store.get('daily', null);
  if (m === 'daily') {
    rand = BP ? BP.rng('oddhue:' + BP.today() + ':' + BP.deviceSeed()) : Math.random;
    $('#msg').textContent = daily && daily.date === today() ? `Today's official score: ${daily.score}. This run is practice.` : "Today's daily colours. Only your first run counts.";
  } else {
    rand = Math.random;
    $('#msg').textContent = m === 'rush' ? '60 seconds. Go!' : m === 'shades' ? 'Drag tiles into a smooth fade. The dotted ends stay put.' : "Tap the block that's different.";
  }
  clearInterval(clockTimer);
  $('#hudMid').hidden = m !== 'rush' && m !== 'shades';
  if (m === 'rush' || m === 'shades') {
    clockLeft = m === 'rush' ? 60 : SHADES_START; lastT = performance.now();
    clockTimer = setInterval(tickClock, 100);
    tickClock();
  }
  if (m === 'shades') newStrip(); else newRound();
}

function tickClock() {
  const now = performance.now();
  clockLeft -= (now - lastT) / 1000; lastT = now;
  const t = $('#hudMid');
  t.textContent = Math.max(0, clockLeft).toFixed(1);
  t.classList.toggle('low', clockLeft < 10);
  if (clockLeft <= 0) end(null);
}

grid.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !running || mode === 'shades') return;
  const i = Number(b.dataset.i);
  if (i === oddIndex) {
    score++;
    $('#score').textContent = score;
    beep(420 + Math.min(score, 40) * 18, 0.08, 'triangle');
    newRound();
  } else if (mode === 'rush') {
    clockLeft -= 3;
    beep(140, 0.15, 'square', 0.08);
    grid.classList.remove('shake'); void grid.offsetWidth; grid.classList.add('shake');
  } else {
    b.classList.add('wrong');
    end(i);
  }
});

const today = () => (BP ? BP.today() : new Date().toISOString().slice(0, 10));

function end(wrongIndex) {
  running = false;
  clearInterval(clockTimer);
  clearTimeout(solveTimer);
  if (mode === 'shades') {
    if (drag) { drag.el.classList.remove('dragging'); drag = null; }
    sel = -1;
    // show the correct order of the strip that was left unfinished
    if (!locked) flip(() => { tiles.sort((a, b) => a.rank - b.rank); });
    locked = false;
    strip.classList.add('reveal');
    beep(196, 0.25, 'triangle', 0.08);
  } else {
    grid.querySelectorAll('button')[oddIndex]?.classList.add('right');
    if (wrongIndex != null) beep(110, 0.3, 'sawtooth', 0.07);
  }
  const isBest = score > (best[mode] || 0);
  if (isBest) { best[mode] = score; store.set('best', best); $('#best').textContent = score; }
  let note = isBest && score > 0 ? 'New high score!' : `Best: ${best[mode] || 0}`;
  if (mode === 'daily') {
    const daily = store.get('daily', null);
    if (!daily || daily.date !== today()) {
      store.set('daily', { date: today(), score });
      BP?.report('oddhue', { score, label: `${score} in a row` });
      note = `Daily score locked in: ${score}. Come back tomorrow for new colours.`;
    } else note = `Practice run. Today's official score: ${daily.score}.`;
  }
  $('#overTitle').textContent =
    mode === 'shades' ? `Time! ${score} ${score === 1 ? 'strip' : 'strips'} sorted.`
    : mode === 'rush' ? (clockLeft <= 0 ? `Time! You found ${score}.` : `${score} found`)
    : `Game over — ${score} in a row`;
  $('#overText').textContent = note;
  $('#over').hidden = false;
  $('#msg').textContent = mode === 'shades' ? 'This is how the last strip fades.' : wrongIndex == null ? '' : 'The odd one is outlined in green.';
}

$('#again').addEventListener('click', () => start(mode));
$('#share').addEventListener('click', () => {
  const label = mode === 'daily' ? `Daily ${today()}` : mode === 'rush' ? 'Rush 60s' : mode === 'shades' ? 'Shades (strips sorted)' : 'Classic';
  const text = `Odd Hue · ${label}: ${score}\nBALLPARK`;
  navigator.clipboard?.writeText(text).then(() => toast('Copied!'), () => toast(text));
});
document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => start(b.dataset.mode)));

addEventListener('keydown', e => {
  if (e.key === 'Enter' && !running) return start(mode);
  const n = Number(e.key);
  if (running && n >= 1 && n <= 9) {
    if (mode === 'shades') tapTile(n - 1);
    else grid.querySelectorAll('button')[n - 1]?.click();
  }
  if (e.key === 'm') { muted = !muted; store.set('muted', muted); toast(muted ? 'Sound off' : 'Sound on'); }
});

function toast(t) {
  const el = $('#toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 1800);
}

start(new URLSearchParams(location.search).get('mode') || 'classic');
