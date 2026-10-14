// ODD HUE — find the block with a different shade. Classic (one mistake ends it), Rush (60 s, growing grid), Daily (seeded).
const $ = s => document.querySelector(s);
const BP = window.Ballpark;
const store = BP ? BP.store('oddhue') : { get: (k, f) => f, set: () => {} };

const grid = $('#grid');
let mode = 'classic', score = 0, running = false, rand = Math.random, oddIndex = 0;
let rushLeft = 60, rushTimer = null, lastT = 0;
const best = store.get('best', { classic: 0, rush: 0, daily: 0 });

// ---------- sound ----------
let ac = null, muted = store.get('muted', false);
function beep(freq, dur = 0.09, type = 'sine', vol = 0.12) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no audio */ }
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
  document.body.style.backgroundColor = `hsl(${h} 30% 97%)`;
  document.documentElement.style.setProperty('--accent', `hsl(${h} ${Math.max(45, s)}% 45%)`);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const b = document.createElement('button');
    b.style.background = `hsl(${h} ${s}% ${i === oddIndex ? l2 : l}%)`;
    b.setAttribute('aria-label', `Block ${i + 1}`);
    b.dataset.i = i;
    frag.append(b);
  }
  grid.replaceChildren(frag);
  grid.classList.remove('pop'); void grid.offsetWidth; grid.classList.add('pop');
}

function start(m) {
  mode = m;
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  score = 0; running = true;
  $('#score').textContent = '0';
  $('#best').textContent = best[m] || 0;
  $('#over').hidden = true;
  const daily = store.get('daily', null);
  if (m === 'daily') {
    rand = BP ? BP.rng('oddhue:' + BP.today()) : Math.random;
    $('#msg').textContent = daily && daily.date === today() ? `Today's official score: ${daily.score}. This run is practice.` : "Today's colours are the same for everyone. Good luck.";
  } else {
    rand = Math.random;
    $('#msg').textContent = m === 'rush' ? '60 seconds. Go!' : "Tap the block that's different.";
  }
  clearInterval(rushTimer);
  $('#hudMid').hidden = m !== 'rush';
  if (m === 'rush') {
    rushLeft = 60; lastT = performance.now();
    rushTimer = setInterval(tickRush, 100);
    tickRush();
  }
  newRound();
}

function tickRush() {
  const now = performance.now();
  rushLeft -= (now - lastT) / 1000; lastT = now;
  const t = $('#hudMid');
  t.textContent = Math.max(0, rushLeft).toFixed(1);
  t.classList.toggle('low', rushLeft < 10);
  if (rushLeft <= 0) end(null);
}

grid.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !running) return;
  const i = Number(b.dataset.i);
  if (i === oddIndex) {
    score++;
    $('#score').textContent = score;
    beep(420 + Math.min(score, 40) * 18, 0.08, 'triangle');
    newRound();
  } else if (mode === 'rush') {
    rushLeft -= 3;
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
  clearInterval(rushTimer);
  const blocks = grid.querySelectorAll('button');
  blocks[oddIndex]?.classList.add('right');
  if (wrongIndex != null) beep(110, 0.3, 'sawtooth', 0.07);
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
  $('#overTitle').textContent = mode === 'rush' ? (rushLeft <= 0 ? `Time! You found ${score}.` : `${score} found`) : `Game over — ${score} in a row`;
  $('#overText').textContent = note;
  $('#over').hidden = false;
  $('#msg').textContent = wrongIndex == null ? '' : 'The odd one is outlined in green.';
}

$('#again').addEventListener('click', () => start(mode));
$('#share').addEventListener('click', () => {
  const label = mode === 'daily' ? `Daily ${today()}` : mode === 'rush' ? 'Rush 60s' : 'Classic';
  const text = `Odd Hue · ${label}: ${score} 🎨\nBALLPARK`;
  navigator.clipboard?.writeText(text).then(() => toast('Copied!'), () => toast(text));
});
document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => start(b.dataset.mode)));

addEventListener('keydown', e => {
  if (e.key === 'Enter' && !running) return start(mode);
  const n = Number(e.key);
  if (running && n >= 1 && n <= 9) grid.querySelectorAll('button')[n - 1]?.click();
  if (e.key === 'm') { muted = !muted; store.set('muted', muted); toast(muted ? 'Sound off' : 'Sound on'); }
});

function toast(t) {
  const el = $('#toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 1800);
}

start(new URLSearchParams(location.search).get('mode') || 'classic');
