// NAPKIN — three Fermi estimates a day. Ratio scoring, simulated crowd histogram, archive.
import { QUESTIONS } from './questions.js';

const BP = window.Ballpark;
const store = BP.store('napkin');
const EPOCH = '2026-09-01';
const COLORS = ['#f0533f', '#5263f2', '#22c96f'];
const app = document.getElementById('app');
const today = BP.dayNumber(EPOCH);
let day = today, qi = 0, state = null, calcOpen = false;

// ---------- data ----------
function questionsFor(n) {
  const per = Math.floor(QUESTIONS.length / 3), cycle = Math.floor((n - 1) / per), slot = (n - 1) % per;
  const idx = QUESTIONS.map((_, i) => i), r = BP.rng('napkin:' + cycle);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(slot * 3, slot * 3 + 3).map(i => ({ ...QUESTIONS[i], id: i }));
}
const load = n => store.get('day:' + n, { answers: [] });
const save = () => store.set('day:' + day, state);

// ---------- numbers ----------
const WORDS = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12, quadrillion: 1e15 };
function parseGuess(s) {
  s = String(s).toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return NaN;
  const x = s.match(/^([\d.]+)\s*(?:x|×|\*)\s*10\s*\^\s*(-?\d+)$/);
  if (x) return parseFloat(x[1]) * 10 ** parseInt(x[2]);
  let total = 1, num = NaN;
  const m = s.match(/^([\d.]+(?:e[+-]?\d+)?)\s*([a-z ]*)$/);
  if (!m) return NaN;
  num = parseFloat(m[1]);
  for (const w of m[2].split(' ').filter(Boolean)) { if (!WORDS[w]) return NaN; total *= WORDS[w]; }
  return num * total;
}
function fmt(n) {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1e15) return n.toExponential(2).replace('e+', ' × 10^');
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : Math.abs(n) < 1000 ? 1 : 0 });
}
const short = n => { const a = Math.abs(n); return a >= 1e12 ? +(n / 1e12).toFixed(1) + 'T' : a >= 1e9 ? +(n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : +n.toFixed(2) + ''; };
const pointsFor = r => Math.round(100 * Math.max(0, 1 - Math.abs(Math.log10(r)) / 1.5));
const emojiFor = r => { const e = Math.max(r, 1 / r); return e <= 1.1 ? '🎯' : e <= 1.5 ? '🟩' : e <= 3 ? '🟨' : e <= 10 ? '🟧' : '🟥'; };
function ratioText(r) {
  const label = Math.max(r, 1 / r) <= 1.1 ? 'Spot On' : r > 1 ? 'Too High' : 'Too Low';
  const v = r >= 100 ? Math.round(r).toLocaleString('en-US') : r < 0.01 ? r.toExponential(1) : r.toFixed(2);
  return { v: v + '×', label };
}
// simulated crowd (seeded, log-normal around the answer)
function crowd(q) {
  const r = BP.rng('crowd:' + q.id), bias = (r() - 0.5) * 0.5, sd = 0.35 + r() * 0.4, out = [];
  for (let i = 0; i < 800; i++) {
    const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    out.push(Math.log10(q.a) + bias + sd * z);
  }
  return out;
}

// ---------- views ----------
function header(q) {
  const qs = [0, 1, 2].map(i => `<span class="${i === qi ? 'on' : state.answers[i] ? 'done' : ''}">Q${i + 1} ${state.answers[i] ? emojiFor(state.answers[i].ratio) : '○'}</span>`).join('');
  return `<div class="head"><span>Napkin</span><div class="qs">${qs}</div><span>${day === today ? '' : 'Archive · '}No. ${String(day).padStart(3, '0')}</span></div>`;
}

function render() {
  const qsDay = questionsFor(day);
  document.documentElement.style.setProperty('--c', COLORS[Math.min(qi, 2)]);
  if (qi >= 3) return renderFinal(qsDay);
  const q = qsDay[qi], ans = state.answers[qi];
  return ans ? renderResult(q, ans) : renderQuestion(q);
}

function renderQuestion(q) {
  app.innerHTML = `<section class="card">${header(q)}
    <div class="qtext ${q.e ? 'has-pic' : ''}">${q.q}${q.e ? `<div class="polaroid" aria-hidden="true">${q.e}</div>` : ''}</div>
    <label class="field"><input id="guess" inputmode="decimal" autocomplete="off" placeholder="your guess" aria-label="Your guess"><span class="unit">${q.unit}</span></label>
    <div class="preview" id="preview"></div>
    <div class="row"><button class="calcbtn" id="calcBtn" title="Calculator" aria-label="Calculator">🧮</button><button class="lock" id="lock">LOCK IT IN ✓</button></div>
    <div id="calc"></div></section>`;
  const inp = document.getElementById('guess'), prev = document.getElementById('preview'), lock = document.getElementById('lock');
  const update = () => {
    const raw = inp.value, n = parseGuess(raw);
    if (/^[\d,]+$/.test(raw.replace(/\s/g, '')) && raw.length) {           // live thousands separators
      const digits = raw.replace(/[^\d]/g, ''), pos = raw.length - inp.selectionStart;
      inp.value = Number(digits).toLocaleString('en-US');
      inp.setSelectionRange(inp.value.length - pos, inp.value.length - pos);
    }
    prev.textContent = raw && !/^[\d,]+$/.test(raw.trim()) ? (isFinite(n) ? '= ' + fmt(n) : 'try “3.5 million”, “2k” or “4e6”') : '';
    lock.classList.toggle('ready', isFinite(n) && n > 0);
  };
  inp.addEventListener('input', update);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  lock.onclick = submit;
  document.getElementById('calcBtn').onclick = () => { calcOpen = !calcOpen; drawCalc(inp, update); };
  if (calcOpen) drawCalc(inp, update);
  inp.focus();
  function submit() {
    const n = parseGuess(inp.value);
    if (!isFinite(n) || n <= 0) { prev.textContent = 'type a number first'; return; }
    const ratio = n / q.a;
    state.answers[qi] = { guess: n, ratio, pts: pointsFor(ratio) };
    save(); calcOpen = false; render();
  }
}

function drawCalc(inp, update) {
  const box = document.getElementById('calc');
  if (!calcOpen) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="calc"><input id="expr" placeholder="e.g. 70*60*24" aria-label="Calculator"><div class="keys">${
    ['7', '8', '9', '÷', '(', '4', '5', '6', '×', ')', '1', '2', '3', '−', '^', '0', '.', '=', '+', 'C'].map(k => `<button data-k="${k}">${k}</button>`).join('')
  }<button class="use" data-k="use">use as guess</button></div></div>`;
  const ex = document.getElementById('expr');
  const evalExpr = () => {
    const s = ex.value.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\^/g, '**').replace(/,/g, '');
    if (!/^[\d+\-*/().eE\s]*$/.test(s) || !s.trim()) return NaN;
    try { return Function('"use strict";return (' + s + ')')(); } catch { return NaN; }
  };
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === 'C') ex.value = '';
    else if (k === '=') { const v = evalExpr(); ex.value = isFinite(v) ? String(+v.toPrecision(12)) : 'error'; }
    else if (k === 'use') { const v = evalExpr(); if (isFinite(v)) { inp.value = String(Math.round(v * 100) / 100); update(); calcOpen = false; drawCalc(inp, update); inp.focus(); } }
    else ex.value += k;
  });
  ex.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = evalExpr(); if (isFinite(v)) ex.value = String(+v.toPrecision(12)); } });
  ex.focus();
}

function renderResult(q, ans) {
  const { v, label } = ratioText(ans.ratio);
  const c = crowd(q), mine = Math.abs(Math.log10(ans.ratio));
  const closer = Math.round(100 * c.filter(x => Math.abs(x - Math.log10(q.a)) > mine).length / c.length);
  const la = Math.log10(q.a), lo = la - 2, hi = la + 2, bins = new Array(25).fill(0);
  for (const x of c) { const i = Math.floor((x - lo) / (hi - lo) * 25); if (i >= 0 && i < 25) bins[i]++; }
  const max = Math.max(...bins);
  const pos = x => Math.min(99, Math.max(1, (x - lo) / (hi - lo) * 100));
  app.innerHTML = `<section class="card">${header(q)}
    <div class="panels"><div class="panel"><small>YOU GUESSED</small><b>${fmt(ans.guess)}</b><em>${q.unit}</em></div>
      <div class="panel ans"><small>ANSWER</small><b>${fmt(q.a)}</b><em>${q.unit}</em></div></div>
    <div class="verdict"><div><small>YOU LANDED</small><div class="ratio">${v}</div><div class="rlabel">${label}</div>
      <div class="closer">closer than ${closer}% of players · +${ans.pts} pts</div></div>
      <div><small>HOW EVERYONE GUESSED</small><div class="hist">${bins.map((b, i) => `<i style="height:${Math.max(3, b / max * 100)}%;animation-delay:${i * 18}ms"></i>`).join('')}
        <div class="mark answer" style="left:${pos(la)}%"><span>Answer</span></div><div class="mark" style="left:${pos(Math.log10(ans.guess))}%"><span>You</span></div></div>
        <div class="axis"><span>${short(10 ** lo)}</span><span>${short(q.a)}</span><span>${short(10 ** hi)}</span></div><div class="sim">simulated crowd</div></div></div>
    <details><summary>NAPKIN MATH</summary><p>${q.n}</p></details>
    <div class="next"><button class="lock ready" id="next">${qi < 2 ? `QUESTION ${qi + 2} →` : 'SEE RESULTS →'}</button></div></section>`;
  document.getElementById('next').onclick = () => { qi++; render(); };
  document.getElementById('next').focus();
}

function renderFinal(qsDay) {
  document.documentElement.style.setProperty('--c', '#26282e');
  const total = state.answers.reduce((s, a) => s + a.pts, 0), line = state.answers.map(a => emojiFor(a.ratio)).join('');
  if (!state.done) {
    state.done = true; save();
    if (day === today) BP.report('napkin', { score: total, max: 300, label: `${total}/300 ${line}` });
    const st = store.get('stats', { days: 0, spot: 0, sumLog: 0, n: 0 });
    st.days++; for (const a of state.answers) { st.n++; st.sumLog += Math.abs(Math.log10(a.ratio)); if (Math.max(a.ratio, 1 / a.ratio) <= 1.1) st.spot++; }
    store.set('stats', st);
  }
  app.innerHTML = `<section class="card final"><div class="head"><span>Napkin</span><span>${line}</span><span>No. ${String(day).padStart(3, '0')}</span></div>
    <h2>${total} / 300</h2><div>${total >= 240 ? 'Human calculator.' : total >= 170 ? 'Solid napkin work.' : total >= 100 ? 'In the right ballpark.' : 'Wild guesses — that\'s half the fun.'}</div>
    <div class="rows">${qsDay.map((q, i) => { const a = state.answers[i], t = ratioText(a.ratio); return `<div><span>${emojiFor(a.ratio)}</span><span>${q.q}</span><b>${t.v}</b></div>`; }).join('')}</div>
    <div class="btns"><button class="solid" id="share">COPY RESULT</button><button id="arch">PLAY THE ARCHIVE</button><a href="../../index.html">BALLPARK</a></div></section>`;
  document.getElementById('share').onclick = () => {
    const text = `Napkin No. ${day} · ${total}/300\n${state.answers.map((a, i) => `${emojiFor(a.ratio)} Q${i + 1} ${ratioText(a.ratio).v}`).join('\n')}`;
    navigator.clipboard?.writeText(text).then(() => toast('Copied!'), () => toast('Copy failed'));
  };
  document.getElementById('arch').onclick = () => openMenu('archive');
}

// ---------- menu ----------
function openMenu(tab = 'archive') {
  const m = document.getElementById('menu');
  const st = store.get('stats', { days: 0, spot: 0, sumLog: 0, n: 0 });
  const body = tab === 'archive'
    ? `<div class="arch">${Array.from({ length: today }, (_, i) => today - i).map(n => {
        const s = load(n), d = BP.dateForDay(n, EPOCH);
        const tot = s.done ? s.answers.reduce((a, x) => a + x.pts, 0) : null;
        return `<button data-n="${n}" class="${n === today ? 'today' : ''}"><b>No. ${n}</b><small>${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${tot == null ? (s.answers.length ? 'in progress' : 'unplayed') : tot + ' pts'}</small></button>`;
      }).join('')}</div>`
    : tab === 'how'
      ? `<p>Each day brings three questions with enormous answers. Nobody knows them exactly — use napkin math: break the question into pieces you can guess, multiply them out, and lock it in.</p><p>You score on how close your <b>ratio</b> is: 1.00× is perfect, 2× (or 0.5×) is off by double. Type numbers like <b>3,500,000</b>, <b>3.5 million</b>, <b>2k</b> or <b>4e6</b>, and use the 🧮 calculator.</p><p>🎯 within 10% · 🟩 within 1.5× · 🟨 within 3× · 🟧 within 10× · 🟥 further.</p>`
      : `<p>Days played: <b>${st.days}</b><br>Spot-ons: <b>${st.spot}</b><br>Average miss: <b>${st.n ? (10 ** (st.sumLog / st.n)).toFixed(2) + '×' : '—'}</b></p>`;
  m.innerHTML = `<div class="box"><div class="tabs">${[['archive', 'Archive'], ['how', 'How to play'], ['stats', 'Stats']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}<button data-close style="margin-left:auto">✕</button></div>${body}</div>`;
  m.hidden = false;
  m.onclick = e => {
    if (e.target === m || e.target.closest('[data-close]')) { m.hidden = true; return; }
    const t = e.target.closest('[data-tab]'); if (t) return openMenu(t.dataset.tab);
    const d = e.target.closest('[data-n]'); if (d) { m.hidden = true; openDay(Number(d.dataset.n)); }
  };
}
document.getElementById('menuBtn').onclick = () => openMenu('archive');

function openDay(n) {
  day = n; state = load(n);
  qi = state.done ? 3 : state.answers.length;
  render();
  scrollTo(0, 0);
}
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 1600); }

const params = new URLSearchParams(location.search);
openDay(Number(params.get('day')) || today);
if (!store.get('seenHelp', false)) { store.set('seenHelp', true); openMenu('how'); }
