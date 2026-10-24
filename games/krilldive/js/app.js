// KRILLDIVE — game flow + UI. Everything is free: daily, archive, endless, themed packs, wardrobe.
import { Ocean, PPM } from './ocean.js';
import * as S from './sprites.js';
import { pixelText, setPixelText } from './font.js';
import * as A from './audio.js';
import {
  TIERS, TIER_ORDER, ROUNDS, M_PER_POINT, MAX_SCORE, BEARING, bearingFor, Library, matchAnswer, revealList, norm, game, ASCENT, pts, dir, startDepth,
  store, todayKey, diveNumberFor, dateForDive, judgeStatus, warmJudge, askJudge,
} from './engine.js';

const $ = s => document.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtM = m => `${Math.round(m).toLocaleString('en-US')}m`;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MISS_COLOR = '#5f7894';
const SHARE_EMOJI = { plankton: '🫧', tooclever: '🐠', schooler: '🐟', rare: '🦑', deepcut: '🐡', krillion: '🦐', miss: '⬛' };

store.load();
const settings = store.settings;
const ocean = new Ocean($('#ocean'));
ocean.motion = settings.motion;
ocean.mascot.skin = S.MASCOTS[settings.skin] ? settings.skin : 'krill';
ocean.showRuler = true;
A.setSfx(settings.sound);
A.setMusic(settings.music);

let lib = null;
let homeMode = 'daily';
let phase = 'home';           // home | intro | answer | judging | sinking | result | final | page
let run = null;
const judge = { online: false, models: [], model: null, checked: false };
let wanderT = 0, blubT = 12;

// ---------------------------------------------------------------- boot
setPixelText($('#logo'), 'KRILLDIVE', { px: innerWidth < 520 ? 5 : 9, color: '#f6f3ff', chroma: ['#ff3f86', '#2fd6ff'] });
$('#drawerLogo').append(pixelText('KRILLDIVE', { px: 3, color: '#f6f3ff', chroma: ['#ff3f86', '#2fd6ff'] }));
updateSoundBtn();
ocean.setCamera(0, 0.57, true);

// The library is re-fetched whenever you come back to the surface, so new packs show up without a refresh.
let libLoadedAt = 0;
async function loadLibrary() {
  // Local server serves live packs at api/packs; the static build (GitHub Pages) ships data/packs.json.
  const fromFile = () => fetch('data/packs.json').then(r => r.json());
  const d = window.KD_STATIC ? await fromFile()
    : await fetch('api/packs').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(fromFile);
  const next = new Library(d.packs || []);
  if (next.all.length >= ROUNDS) lib = next;
  libLoadedAt = Date.now();
  return lib;
}
function refreshLibrary() {
  if (Date.now() - libLoadedAt < 4000) return;
  libLoadedAt = Date.now();
  loadLibrary().then(() => { if (phase === 'home') renderHomeText(); }).catch(() => {});
}

loadLibrary().then(l => {
  if (!l) throw new Error('not enough prompts yet');
  renderHome();
}).catch(err => {
  const m = $('#loadMsg');
  m.hidden = false;
  m.textContent = `Couldn't load the prompt packs (${err.message}). Start the game with start.cmd (node server.js) and refresh.`;
  renderHome();
});
checkJudge();

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  ocean.update(dt);
  ocean.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function tick(dt) {
  const W = innerWidth, H = innerHeight, ms = ocean.mascot;
  // mascot targets
  if (phase === 'home' || phase === 'page') {
    wanderT -= dt;
    if (wanderT <= 0) {
      wanderT = 3 + Math.random() * 4;
      const side = Math.random() < 0.5 ? 0.08 + Math.random() * 0.18 : 0.74 + Math.random() * 0.18;
      ms.tx = W * side; ms.ty = H * (phase === 'page' ? 0.12 + Math.random() * 0.1 : 0.62 + Math.random() * 0.22);
    }
  } else if (phase === 'intro' || phase === 'answer' || phase === 'judging') {
    const r = $('#promptCard').getBoundingClientRect();
    ms.tx = Math.min(W - 40, r.right + 34); ms.ty = r.top + 34;
  } else if (phase === 'result' || phase === 'final') {
    ms.tx = W * 0.5 + Math.min(220, W * 0.36); ms.ty = H * 0.2;
  }
  // blub
  if (phase === 'home' || phase === 'result') {
    blubT -= dt;
    if (blubT <= 0) { blubT = 14 + Math.random() * 10; blub(true); }
  }
  const b = $('#blub');
  if (!b.hidden) { b.style.left = `${ms.x + 18}px`; b.style.top = `${ms.y - 46}px`; }

  if (!run) return;
  // countdown
  if (phase === 'intro') {
    run.count -= dt;
    $('#countdown b').textContent = Math.max(1, Math.ceil(run.count));
    if (run.count <= 0) beginAnswer();
  }
  // timer
  if (phase === 'answer' && run.total > 0) {
    run.left -= dt;
    const left = Math.max(0, run.left), frac = left / run.total;
    $('#timerNum').textContent = Math.ceil(left);
    $('#timerArc').style.strokeDashoffset = String(119.4 * (1 - frac));
    $('#tbarFill').style.transform = `scaleX(${frac})`;
    const urgent = left <= 5;
    $('#answerBar').classList.toggle('urgent', urgent);
    const sec = Math.ceil(left);
    if (urgent && sec !== run.lastTick && sec > 0) { run.lastTick = sec; A.sfx.tick(sec <= 3); }
    if (left <= 0) submit(true);
  }
  // sinking stone
  if (phase === 'sinking' && run.sink) {
    const s = run.sink;
    s.t += dt;
    if (s.mode === 'down') {
      const p = Math.min(1, s.t / s.dur);
      s.depth = s.from + (s.to - s.from) * ease(p);
      for (const key of TIER_ORDER) {
        const m = run.depth + dir() * pts(key) * M_PER_POINT;
        if ((s.depth - m) * dir() >= -0.5 && !ocean.tiers.passed.has(key) && key !== s.tier) { ocean.tiers.passed.add(key); A.sfx.pass(); }
      }
      ocean.setCamera(game.ascent ? Math.min(s.camStart, s.depth) : Math.max(s.camStart, s.depth), 0.5);
      if (Math.random() < dt * 14) ocean.spawnBubbles(W / 2, s.depth - 8, 1, 60);
      if (p >= 1 && !s.done) { s.done = true; landed(); }
    }
    if (s.mode === 'down') {
      const st = $('#stone');
      st.style.top = `${ocean.y(s.depth)}px`;
      ms.tx = W / 2 + st.offsetWidth / 2 + 36; ms.ty = ocean.y(s.depth) - 6;
      $('#hudDepth').textContent = fmtM(game.ascent ? Math.min(run.depth, s.depth) : Math.max(run.depth, s.depth));
    }
  } else if (run && phase !== 'sinking') {
    $('#hudDepth').textContent = fmtM(run.depth);
  }
  // score count-up
  if (run.shownScore !== run.score) {
    run.shownScore += Math.sign(run.score - run.shownScore) * Math.max(1, Math.round(Math.abs(run.score - run.shownScore) * dt * 6));
    if (Math.abs(run.score - run.shownScore) < 1) run.shownScore = run.score;
    $('#hudScore').textContent = run.shownScore;
  }
  A.setDepth(ocean.cam.depth);
}

// ---------------------------------------------------------------- home
function renderHome() {
  phase = 'home';
  run = null;
  document.body.classList.remove('in-game');
  for (const id of ['#game', '#results', '#packs', '#archive']) $(id).hidden = true;
  $('#home').hidden = false;
  ocean.tiers = null; ocean.showYou = false;
  game.ascent = homeMode === 'ascent';
  ocean.setCamera(game.ascent ? startDepth() - 80 : 0, 0.57);   // the Ascent starts down in the trench
  renderHomeText();
  refreshLibrary();
}
function renderHomeText() {
  $('#beginBtn').disabled = !lib;
  const n = diveNumberFor();
  const done = homeMode === 'daily' && store.result(`daily-${n}`);
  $('#ascentBtn').classList.toggle('on', homeMode === 'ascent');
  if (homeMode === 'ascent') {
    $('#tagline').textContent = 'THE ASCENT';
    $('#homeSub').textContent = 'you start in the trench · the most COMMON answers lift you up';
    $('#diveNo').textContent = `ASCENT #${store.data.ascentNext || 1}`;
    $('#modeBtn').textContent = "TODAY'S DIVE"; $('#modeBtn').dataset.go = 'home'; $('#modeBtn').classList.add('on');
    $('#todayDone').hidden = true;
    $('#beginBtn').textContent = '▲ BEGIN ASCENT ▲';
    return;
  }
  if (homeMode === 'daily') {
    $('#tagline').textContent = 'THE DAILY DIVE';
    $('#homeSub').textContent = `${ROUNDS} prompts · ${settings.timer ? settings.timer + ' seconds each' : 'no clock'} · rarer answers sink deeper`;
    $('#diveNo').textContent = `DIVE #${n}`;
    $('#modeBtn').textContent = 'UNLIMITED ∞'; $('#modeBtn').dataset.go = 'endless'; $('#modeBtn').classList.remove('on');
  } else {
    $('#tagline').textContent = 'THE ENDLESS DIVE';
    $('#homeSub').textContent = lib
      ? `${lib.all.length} prompts in the ocean · ${lib.unseenCount(store.data.seen)} you haven't seen yet`
      : 'dive after dive · rarer answers sink deeper';
    $('#diveNo').textContent = `ENDLESS #${store.data.endlessNext}`;
    $('#modeBtn').textContent = "TODAY'S DIVE"; $('#modeBtn').dataset.go = 'home'; $('#modeBtn').classList.add('on');
  }
  const td = $('#todayDone');
  if (done) {
    td.hidden = false;
    td.innerHTML = `TODAY'S DIVE · <b>${done.score}</b> /${MAX_SCORE} · -${fmtM(done.score * M_PER_POINT)}<br><span id="nextDive"></span>` +
      `<br><button class="chip on" data-go="endless-start">KEEP DIVING · ENDLESS ∞</button>`;
    $('#beginBtn').textContent = "▲ SEE TODAY'S CATCH ▲";
    updateNextDive();
  } else {
    td.hidden = true;
    $('#beginBtn').textContent = '▼ BEGIN DESCENT ▼';
  }
  const st = store.data.streak, live = store.liveStreak();
  $('#streakLine').textContent = st.best ? `STREAK ${live} · BEST ${st.best}` : '';
}
function updateNextDive() {
  const el = $('#nextDive');
  if (!el || $('#home').hidden) return;
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  el.textContent = `next dive in ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  if (s === 0) renderHome();
}
setInterval(updateNextDive, 1000);

$('#howBtn').addEventListener('click', () => {
  const o = $('#howto'), open = o.hidden;
  o.hidden = !open;
  $('#howBtn').textContent = (open ? '▾' : '▸') + ' HOW TO PLAY';
  $('#howBtn').setAttribute('aria-expanded', String(open));
});
$('#beginBtn').addEventListener('click', () => {
  if (!lib) return;
  A.sfx.click();
  if (homeMode === 'daily') {
    const n = diveNumberFor(), done = store.result(`daily-${n}`);
    if (done) return showStoredResults(`daily-${n}`);
    startRun({ mode: 'daily', n, key: `daily-${n}`, prompts: dailyPrompts(n) });
  } else if (homeMode === 'ascent') {
    startAscent();
  } else {
    startEndless();
  }
});

// THE ASCENT: fresh prompts like Endless, but common answers score big and lift you out of the trench.
function startAscent() {
  const n = store.data.ascentNext || 1;
  store.data.ascentNext = n + 1;
  store.save();
  startRun({ mode: 'ascent', n, key: `ascent-${n}`, prompts: lib.fresh(store.data.seen) });
}

// Each endless dive gets 7 prompts you haven't seen yet (least-recently-seen once you've seen them all).
function startEndless() {
  const n = store.data.endlessNext;
  store.data.endlessNext = n + 1;
  store.save();
  startRun({ mode: 'endless', n, key: `endless-${n}`, prompts: lib.fresh(store.data.seen) });
}

// Daily dive n: 7 prompts this device hasn't seen yet, picked once and then kept for that day.
function dailyPrompts(n) {
  const sets = store.data.dailySets || (store.data.dailySets = {});
  const kept = (sets[n] || []).map(id => lib.byId.get(id));
  if (kept.length === ROUNDS && kept.every(Boolean)) return kept;
  const fresh = lib.fresh(store.data.seen);
  sets[n] = fresh.map(q => q.id);
  store.save();
  return fresh;
}

// ---------------------------------------------------------------- run
function startRun(cfg) {
  if (!cfg.prompts || cfg.prompts.length < ROUNDS || cfg.prompts.some(q => !q)) return toast('That dive has no prompts yet.');
  game.ascent = cfg.mode === 'ascent';
  run = { ...cfg, i: 0, depth: startDepth(), score: 0, shownScore: 0, answers: [], total: settings.timer, left: 0 };
  document.body.classList.add('in-game');
  for (const id of ['#home', '#results', '#packs', '#archive']) $(id).hidden = true;
  $('#game').hidden = false;
  $('#hudScore').textContent = '0'; $('#hudDepth').textContent = fmtM(run.depth);
  document.querySelector('.pc-hint').textContent = game.ascent ? '▲ common answers lift you up ▲' : '▼ rarer answers sink deeper ▼';
  ocean.showYou = true; ocean.playerDepth = run.depth;
  if (game.ascent) ocean.setCamera(run.depth, 0.3, true);
  // (re)check the local AI judge each run so starting Ollama mid-session just works
  if (judgeUsable()) warmJudge(judge.model);
  else if (settings.judge !== 'off') checkJudge().then(() => { if (judgeUsable()) warmJudge(judge.model); });
  startRound();
}

function startRound() {
  phase = 'intro';
  const q = run.prompts[run.i];
  store.markSeen(q.id);
  ocean.tiers = null;
  $('#resultCard').hidden = true; $('#nextBtn').hidden = true; $('#stone').hidden = true;
  $('#answerBar').hidden = true;
  $('#pcKicker').textContent = `PROMPT ${run.i + 1} OF ${ROUNDS}`;
  $('#pcText').textContent = q.text;
  const card = $('#promptCard');
  card.classList.remove('away'); card.classList.add('enter');
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('enter')));
  renderPips();
  $('#progLabel').textContent = `PROMPT ${run.i + 1} OF ${ROUNDS}`;
  ocean.follow = 2.4;
  ocean.setCamera(run.depth, 0.3);
  run.count = run.i === 0 ? 3 : 2.4;
  $('#countdown').hidden = false;
  $('#countdown b').textContent = Math.ceil(run.count);
}

function beginAnswer() {
  phase = 'answer';
  $('#countdown').hidden = true;
  const bar = $('#answerBar');
  bar.hidden = false; bar.classList.remove('urgent');
  $('#echo').textContent = ''; $('#echo').className = '';
  const inp = $('#answer');
  inp.value = ''; inp.disabled = false; $('#diveBtn').disabled = false;
  run.left = run.total; run.lastTick = null;
  $('#timerNum').textContent = run.total ? run.total : '∞';
  $('#timerArc').style.strokeDashoffset = '0';
  $('#tbarFill').style.transform = 'scaleX(1)';
  run.locked = false;
  inp.focus();
}

$('#answerBar').addEventListener('submit', e => { e.preventDefault(); submit(false); });
$('#answer').addEventListener('input', () => { A.sfx.type(); if ($('#echo').textContent && phase === 'answer') $('#echo').textContent = ''; });

function judgeUsable() { return settings.judge !== 'off' && judge.online && !!judge.model; }
function judgeKey(q, raw) { return `${q.id}|${norm(raw)}`; }

async function submit(final) {
  if (!run || run.locked || (phase !== 'answer' && !(final && phase === 'judging'))) return;
  const inp = $('#answer'), raw = inp.value.trim();
  const q = run.prompts[run.i];
  if (!raw) { if (final) land(null, ''); return; }
  run.locked = true;
  let hit = matchAnswer(q, raw);
  if (!hit) {
    const cached = store.data.judged[judgeKey(q, raw)];
    if (cached) hit = cached.valid ? cached : null;
    else if (judgeUsable()) {
      phase = 'judging';
      inp.disabled = true; $('#diveBtn').disabled = true;
      $('#echo').className = 'judging';
      $('#echo').textContent = 'listening for an echo…';
      try {
        const res = await Promise.race([askJudge(q, raw, judge.model), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))]);
        store.data.judged[judgeKey(q, raw)] = res;
        store.save();
        hit = res.valid ? res : null;
      } catch {
        judge.online = false;
        toast('Local AI judge went quiet — using the answer lists only.');
      }
      if (!run || run.prompts[run.i] !== q) return;
      inp.disabled = false; $('#diveBtn').disabled = false;
      $('#echo').className = '';
      phase = 'answer';
    }
  }
  if (!hit) {
    if (final || (run.total > 0 && run.left <= 0)) return land(null, raw);
    run.locked = false;
    $('#echo').textContent = `“${raw}”: no echo. try again`;
    inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
    A.sfx.nope();
    inp.select(); inp.focus();
    return;
  }
  land(hit, raw);
}

function land(hit, raw) {
  run.locked = true;
  phase = 'sinking';
  const q = run.prompts[run.i];
  run.answers[run.i] = hit
    ? { id: q.id, input: raw, answer: hit.answer, tier: hit.tier, score: pts(hit.tier), quip: hit.quip || null, judged: !!hit.judged, fuzzy: hit.exact === false }
    : { id: q.id, input: raw, answer: raw, tier: null, score: 0 };
  $('#answerBar').hidden = true;
  $('#promptCard').classList.add('away');
  const st = $('#stone');
  st.hidden = false;
  st.className = 'stone';
  st.style.color = '';
  st.textContent = raw ? `“${(hit ? hit.answer : raw).toUpperCase()}” ${game.ascent ? '▲' : '▼'}` : '…';
  A.sfx.blub();
  const startY = innerHeight * 0.78;
  if (!hit) {
    // nothing landed: the answer bobs up and dissolves
    run.sink = { mode: 'float', depth: ocean.depthAt(startY), t: 0 };
    st.style.top = `${startY}px`;
    ocean.spawnBubbles(innerWidth / 2, ocean.depthAt(startY), 12, 80);
    requestAnimationFrame(() => { st.classList.add('float'); st.style.top = `${startY - 160}px`; });
    A.sfx.miss();
    setTimeout(showRoundResult, 1300);
    return;
  }
  // convert the camera to a 50%-anchor without moving the view, then follow the stone down
  const camHalf = ocean.cam.depth + (0.5 - ocean.cam.frac) * ocean.H / PPM;
  ocean.cam.depth = camHalf; ocean.cam.frac = 0.5;
  ocean.camTarget.depth = camHalf; ocean.camTarget.frac = 0.5;
  ocean.follow = 7;
  ocean.tiers = { base: run.depth, passed: new Set(), lit: null };
  const score = pts(hit.tier);
  const from = ocean.depthAt(startY), to = run.depth + dir() * score * M_PER_POINT;
  run.sink = { mode: 'down', from, to, depth: from, t: 0, dur: 1.2 + 2.1 * Math.sqrt(score / 100), camStart: camHalf, tier: hit.tier };
  if (!settings.motion) run.sink.dur = 0.35;
  st.style.top = `${startY}px`;
  ocean.spawnBubbles(innerWidth / 2, from, 14, 70);
  A.sfx.sink();
}

function landed() {
  const s = run.sink, a = run.answers[run.i], tier = TIERS[a.tier];
  ocean.tiers.lit = a.tier;
  const st = $('#stone');
  st.classList.add('landed');
  st.style.color = tier.color;
  A.sfx.land(a.tier);
  ocean.spawnBubbles(innerWidth / 2, s.to, a.tier === 'krillion' ? 40 : 18, 140);
  run.depth = s.to;
  run.score += a.score;
  ocean.playerDepth = run.depth;
  setTimeout(showRoundResult, 750);
}

function showRoundResult() {
  if (!run) return;
  phase = 'result';
  const a = run.answers[run.i];
  $('#stone').hidden = true;
  ocean.tiers = null;
  ocean.follow = 2.4;
  ocean.setCamera(run.depth, 0.42);
  renderPips(true);
  const icon = $('#rcIcon'), tierEl = $('#rcTier');
  icon.replaceChildren();
  if (a.tier) {
    const t = TIERS[a.tier];
    icon.style.color = t.color;
    icon.append(S.spriteImg(S.tierIcon(a.tier), a.tier === 'plankton' ? 4 : 3));
    setPixelText(tierEl, t.name, { px: innerWidth < 520 ? 3 : 4, color: t.color, chroma: a.tier === 'krillion' ? ['#ff3f86', '#2fd6ff'] : null });
    $('#rcAnswer').textContent = `“${a.answer}”`;
    $('#rcPts').innerHTML = `<span class="pts" style="color:${t.color}">+${a.score} PTS</span> · ${game.ascent ? 'rise' : 'sink'} ${a.score * M_PER_POINT}m`;
    $('#rcQuip').textContent = game.ascent ? ASCENT.blurbs[a.tier] + (a.quip ? ` (${a.quip})` : '') : a.quip || t.blurb;
    const notes = [];
    if (a.tier === 'krillion') notes.push(game.ascent ? 'the rarest answer on the reef — the opposite of what you want here' : 'the single rarest answer on the reef');
    if (a.judged) notes.push('judged by your local AI');
    if (a.fuzzy && norm(a.input) !== norm(a.answer)) notes.push(`read “${a.input}” as “${a.answer}”`);
    $('#rcNote').textContent = notes.join(' · ');
  } else {
    setPixelText(tierEl, 'NOTHING LANDED', { px: innerWidth < 520 ? 3 : 4, color: '#3d5a78' });
    $('#rcAnswer').textContent = a.input ? `“${a.input}”` : 'no answer';
    $('#rcPts').innerHTML = `<span style="color:${MISS_COLOR}">+0 PTS</span>`;
    $('#rcQuip').textContent = a.input ? 'no echo — it never made it past the reef.' : 'the clock ran out before you dropped anything.';
    $('#rcNote').textContent = '';
  }
  const rc = $('#resultCard');
  rc.hidden = false; rc.style.animation = 'none'; void rc.offsetWidth; rc.style.animation = '';
  const nb = $('#nextBtn');
  nb.hidden = false;
  nb.textContent = run.i >= ROUNDS - 1 ? (game.ascent ? 'SEE YOUR CLIMB ▲' : 'SURFACE ▲') : (game.ascent ? 'CLIMB ▲' : 'DESCEND ▼');
  nb.focus({ preventScroll: true });
}

$('#nextBtn').addEventListener('click', () => {
  if (phase !== 'result') return;
  A.sfx.click();
  run.i++;
  if (run.i >= ROUNDS) finishRun(); else startRound();
});

function renderPips() {
  const p = $('#pips');
  p.replaceChildren();
  for (let i = 0; i < ROUNDS; i++) {
    const pip = h('i');
    const a = run.answers[i];
    if (a) { pip.className = 'done'; pip.style.background = a.tier ? TIERS[a.tier].color : '#2a3b4f'; }
    else if (i === run.i) pip.className = 'cur';
    p.append(pip);
  }
}

function finishRun() {
  phase = 'final';
  A.sfx.surface();
  const res = {
    key: run.key, mode: run.mode, n: run.n, packId: run.packId, ch: run.ch, score: run.score,
    promptIds: run.prompts.map(q => q.id), answers: run.answers, date: todayKey(),
  };
  const first = !store.result(run.key);
  store.saveResult(run.key, res);
  if (run.mode === 'daily' && run.n === diveNumberFor() && first) {
    store.bumpStreak(todayKey());
    window.Ballpark?.report('krilldive', { score: run.score, max: MAX_SCORE, label: `${run.score} / ${MAX_SCORE} · -${fmtM(run.score * M_PER_POINT)}` });
  }
  const shown = { ...res, practice: !first };
  run = null;
  showResults(shown);
}

// ---------------------------------------------------------------- results page
function showStoredResults(key) {
  const r = store.result(key);
  if (r) showResults(r);
}

function titleFor(r) {
  if (r.mode === 'daily') return r.n === diveNumberFor() ? `DIVE #${r.n} COMPLETE` : `DIVE #${r.n} · ARCHIVE`;
  if (r.mode === 'endless') return `∞ DIVE #${r.n} COMPLETE`;
  if (r.mode === 'ascent') return `▲ ASCENT #${r.n} COMPLETE`;
  const p = lib.pack(r.packId);
  return `${(p?.name || r.packId).toUpperCase()} · CH ${r.ch + 1}`;
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function showResults(r) {
  phase = 'final';
  document.body.classList.remove('in-game');
  for (const id of ['#home', '#game', '#packs', '#archive']) $(id).hidden = true;
  ocean.showYou = true; ocean.tiers = null;
  game.ascent = r.mode === 'ascent';
  const finalDepth = game.ascent ? startDepth() - r.score * M_PER_POINT : r.score * M_PER_POINT;
  const depthText = game.ascent ? (finalDepth <= 0 ? 'SURFACED!' : `·  ${fmtM(finalDepth)} TO GO`) : `-${fmtM(finalDepth)}`;
  ocean.playerDepth = finalDepth;
  ocean.follow = 1.6;
  ocean.setCamera(finalDepth, 0.4);
  const prompts = r.promptIds.map(id => lib.byId.get(id));
  const page = $('#results');
  page.hidden = false;
  page.scrollTop = 0;
  const inner = h('div', 'page-inner');
  page.replaceChildren(inner);

  const head = h('div', 'page-head');
  head.append(pixelText('KRILLDIVE', { px: 3, color: '#f6f3ff', chroma: ['#ff3f86', '#2fd6ff'] }));
  head.append(h('div', 'meta', esc(titleFor(r)) + (r.practice ? '<br>PRACTICE RUN · FIRST SCORE KEPT' : '')));
  inner.append(head);

  const big = h('div', 'big-score');
  big.append(pixelText(String(r.score), { px: innerWidth < 520 ? 7 : 9, color: '#eef5ff' }));
  big.append(h('small', '', `/${MAX_SCORE}<b>${depthText}</b>`));
  inner.append(big);

  // estimated diver curve
  const mean = game.ascent ? 400 : 235, sd = game.ascent ? 110 : 88, W = 360, Hc = 92;
  const pdf = x => Math.exp(-0.5 * ((x - mean) / sd) ** 2);
  let path = `M0 ${Hc}`;
  for (let x = 0; x <= MAX_SCORE; x += 10) path += ` L${(x / MAX_SCORE * W).toFixed(1)} ${(Hc - pdf(x) * 74).toFixed(1)}`;
  const ux = (r.score / MAX_SCORE) * W, uy = Hc - pdf(r.score) * 74;
  const ticks = [0, 100, 200, 300, 400, 500, 600, 700].map(v => `<text x="${v / MAX_SCORE * W}" y="${Hc + 14}" text-anchor="middle">${v}</text>`).join('');
  const curve = h('div', 'curve');
  curve.innerHTML = `<svg viewBox="0 -6 ${W} ${Hc + 22}" font-family="Consolas, monospace" font-size="7" fill="#5f7f9e">
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#46d3f0" stop-opacity=".55"/><stop offset="1" stop-color="#46d3f0" stop-opacity=".04"/></linearGradient></defs>
    <path d="${path} L${W} ${Hc} Z" fill="url(#cg)"/>
    <path d="${path.replace(`M0 ${Hc} L`, 'M')}" fill="none" stroke="#46d3f0" stroke-width="1.5"/>
    <line x1="0" x2="${W}" y1="${Hc}" y2="${Hc}" stroke="#2b4866"/>
    <line x1="${ux}" x2="${ux}" y1="${uy}" y2="${Hc}" stroke="#ff4f8b" stroke-width="1.2"/>
    <circle cx="${ux}" cy="${uy}" r="3" fill="#ff4f8b"/>
    ${ticks}
    <text x="${ux}" y="${Hc + 14}" text-anchor="middle" fill="#ff4f8b" font-weight="700">YOU</text>
  </svg>`;
  inner.append(curve);
  const pct = Math.round(normalCdf((r.score - mean) / sd) * 100);
  const allRuns = Object.values(store.data.results).filter(x => (x.mode === 'ascent') === game.ascent);
  const avg = allRuns.length ? Math.round(allRuns.reduce((s, x) => s + x.score, 0) / allRuns.length) : r.score;
  const best = allRuns.reduce((m, x) => Math.max(m, x.best || x.score), 0);
  inner.append(h('div', 'caption', `${game.ascent ? 'HIGHER THAN' : 'DEEPER THAN'} ~${pct}% OF ${game.ascent ? 'CLIMBERS' : 'DIVERS'} <span>(estimated curve)</span><br><span>YOUR AVERAGE ${avg} · BEST ${best} · ${allRuns.length} DIVE${allRuns.length === 1 ? '' : 'S'} LOGGED</span>`));

  // dive log
  inner.append(h('div', 'section-h', game.ascent ? 'CLIMB LOG <small>HIGHER = MORE COMMON</small>' : 'DIVE LOG <small>DEEPER = RARER</small>'));
  const LW = 360, LH = 190, top = 14, bottom = 160, colX = i => 50 + i * ((LW - 70) / (ROUNDS - 1));
  let svg = `<svg viewBox="0 0 ${LW} ${LH}" font-family="Consolas, monospace" font-size="8" fill="#5f7f9e">`;
  for (const v of [0, 25, 50, 75, 100]) {
    const y = top + (v / 100) * (bottom - top);
    svg += `<text x="4" y="${y + 3}">${game.ascent ? '+' + (100 - v) : v ? '-' + v : '0m'}</text><line x1="28" x2="${LW}" y1="${y}" y2="${y}" stroke="#1d3550" stroke-dasharray="2 4"/>`;
  }
  r.answers.forEach((a, i) => {
    const x = colX(i);
    svg += `<text x="${x}" y="${LH - 8}" text-anchor="middle">${i + 1}</text>`;
    if (!a || !a.tier) { svg += `<circle cx="${x}" cy="${top + 2}" r="6" fill="none" stroke="#3d5a78" stroke-dasharray="2 2"/>`; return; }
    const y = game.ascent ? bottom - (a.score / 100) * (bottom - top) : top + (a.score / 100) * (bottom - top), col = TIERS[a.tier].color;
    svg += `<line x1="${x}" x2="${x}" y1="${game.ascent ? bottom : top}" y2="${y}" stroke="${col}" stroke-opacity=".45" stroke-width="1.5"/>`;
    const ic = S.tierIcon(a.tier);
    const sc = 1.4;
    svg += `<image href="${ic.toDataURL()}" x="${x - ic.width * sc / 2}" y="${y - ic.height * sc / 2}" width="${ic.width * sc}" height="${ic.height * sc}" style="image-rendering:pixelated"/>`;
  });
  svg += '</svg>';
  const log = h('div', 'divelog'); log.innerHTML = svg; inner.append(log);

  // bearing
  inner.append(h('div', 'section-h', 'THE BEARING'));
  const bearing = h('div', 'bearing');
  const bands = game.ascent ? ASCENT.bearing : BEARING;
  const mine = bands.find(b => r.score >= b.min && r.score <= b.max) || bands[0];
  for (const b of bands) {
    const row = h('div', b === mine ? 'me' : '', `<b>${b.min}–${b.max === MAX_SCORE ? MAX_SCORE : b.max}</b><span>${esc(b.text)}</span>`);
    bearing.append(row);
  }
  inner.append(bearing);
  const share = h('div', 'row-btns');
  const copyBtn = h('button', 'btn primary', 'COPY RESULT');
  copyBtn.onclick = () => copyResult(r);
  share.append(copyBtn);
  inner.append(share);

  // the catch
  inner.append(h('div', 'section-h', 'THE CATCH <small>TAP A ROUND FOR EVERY ANSWER</small>'));
  r.answers.forEach((a, i) => inner.append(catchRow(prompts[i], a, i)));

  // actions
  const acts = h('div', 'row-btns');
  const add = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.onclick = () => { A.sfx.click(); fn(); }; acts.append(b); };
  if (r.mode === 'ascent') {
    add('NEXT ASCENT ▲', 'primary', startAscent);
    add('PLAY THIS ONE AGAIN ↻', '', () => startRun({ mode: 'ascent', n: r.n, key: r.key, prompts }));
  } else if (r.mode === 'endless') {
    add('NEXT DIVE ▼', 'primary', startEndless);
    add('PLAY THIS ONE AGAIN ↻', '', () => startRun({ mode: 'endless', n: r.n, key: r.key, prompts }));
  } else if (r.mode === 'pack') {
    const p = lib.pack(r.packId);
    if (p && r.ch + 1 < p.chapters.length) add('NEXT CHAPTER ▼', 'primary', () => startPack(p.id, r.ch + 1));
    add('PLAY AGAIN ↻', '', () => startPack(r.packId, r.ch));
    add('ALL PACKS', '', () => go('packs'));
  } else {
    add('ENDLESS DIVE ∞', 'primary', () => { homeMode = 'endless'; startEndless(); });
    add('PLAY THIS ONE AGAIN ↻', '', () => startRun({ mode: 'daily', n: r.n, key: r.key, prompts }));
    add('ARCHIVE ⟲', '', () => go('archive'));
  }
  add('BACK TO THE SURFACE ▲', 'pink', () => { homeMode = r.mode === 'endless' || r.mode === 'ascent' ? r.mode : 'daily'; renderHome(); });
  inner.append(acts);
  inner.append(h('p', 'foot-note', 'free forever · every mode unlocked · no ads<br>your dives stay on this computer'));
}

function catchRow(q, a, i) {
  const row = h('div', 'catch-row');
  const btn = h('button');
  const tier = a?.tier ? TIERS[a.tier] : null;
  const ic = h('span', 'ic');
  if (a?.tier) ic.append(S.spriteImg(S.tierIcon(a.tier), 2));
  btn.append(h('span', 'n', String(i + 1)), ic);
  const mid = h('span');
  mid.append(h('div', 'q', esc(q?.text || 'missing prompt')));
  mid.append(h('div', 'a' + (a?.tier ? '' : ' miss'), a?.tier ? esc(a.answer) : a?.input ? `“${esc(a.input)}”` : 'no answer'));
  btn.append(mid, h('span', 's', `<span style="color:${tier ? tier.color : MISS_COLOR}">${a?.score || 0}</span>`), h('span', 'pm', '+'));
  row.append(btn);
  let open = null;
  btn.onclick = () => {
    if (!q) return;
    if (open) { open.remove(); open = null; btn.lastChild.textContent = '+'; return; }
    btn.lastChild.textContent = '−';
    open = h('div', 'reveal');
    const search = h('input'); search.placeholder = 'search the catch…'; search.setAttribute('aria-label', 'Search answers');
    const list = h('div', 'reveal-list');
    const all = revealList(q).sort((x, y) => pts(y.tier) - pts(x.tier));   // best answers for this mode first
    const mineKey = a?.tier ? norm(a.answer) : null;
    const draw = () => {
      const f = norm(search.value);
      list.replaceChildren();
      let shown = 0;
      for (const e of all) {
        if (f && !norm(e.answer).includes(f)) continue;
        if (++shown > 400) break;
        const t = TIERS[e.tier];
        const d = h('div', norm(e.answer) === mineKey ? 'you' : '');
        d.append(h('span', '', esc(e.answer)), h('i', '', `<span style="color:${t.color}">+${pts(e.tier)}</span>`));
        if (e.quip && (e.tier === 'krillion' || !f)) d.append(h('em', '', esc(e.quip)));
        list.append(d);
      }
      count.textContent = `${all.length} answers on the reef${f ? ` · ${shown} match` : ''}${a?.judged ? ' · yours was judged by your local AI' : ''}`;
    };
    const count = h('div', 'reveal-count');
    search.oninput = draw;
    open.append(search, list, count);
    row.append(open);
    draw();
  };
  return row;
}

function copyResult(r) {
  const label = r.mode === 'daily' ? `#${r.n}` : r.mode === 'endless' ? `∞${r.n}` : r.mode === 'ascent' ? `ASCENT #${r.n}` : `${(lib.pack(r.packId)?.name || r.packId)} ch${r.ch + 1}`;
  const line = r.answers.map(a => SHARE_EMOJI[a?.tier || 'miss']).join('');
  const depth = r.mode === 'ascent' ? (r.score >= MAX_SCORE ? 'SURFACED' : `-${fmtM(MAX_SCORE * M_PER_POINT - r.score * M_PER_POINT)} to go`) : `-${fmtM(r.score * M_PER_POINT)}`;
  const text = `KRILLDIVE ${label} 🦐\n${r.score}/${MAX_SCORE} · ${depth}\n${line}`;
  const done = () => toast('COPIED — paste it anywhere');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = h('textarea'); ta.value = text; document.body.append(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('Copy failed'); }
  ta.remove();
}

// ---------------------------------------------------------------- packs + archive
function startPack(id, ch) {
  const p = lib.pack(id);
  if (!p) return;
  startRun({ mode: 'pack', packId: id, ch, key: `pack-${id}-${ch}`, prompts: lib.chapter(id, ch) });
}

function showPacks() {
  phase = 'page';
  document.body.classList.remove('in-game');
  for (const id of ['#home', '#game', '#results', '#archive']) $(id).hidden = true;
  ocean.showYou = false;
  ocean.setCamera(1400, 0.5);
  const page = $('#packs');
  page.hidden = false; page.scrollTop = 0;
  const inner = h('div', 'page-inner');
  page.replaceChildren(inner);
  const head = h('div', 'page-head');
  head.append(pixelText('KRILLDIVE', { px: 4, color: '#f6f3ff', chroma: ['#ff3f86', '#2fd6ff'] }));
  inner.append(head);
  inner.append(h('div', 'page-title', 'THEMED PACKS · BEYOND THE DAILY DIVE · ALL FREE'));
  if (!lib || !lib.packs.length) inner.append(h('p', 'loadmsg', 'No packs loaded yet.'));
  for (const p of lib?.packs || []) {
    const card = h('div', 'pack-card');
    card.style.setProperty('--accent', p.accent || '#46d3f0');
    card.append(h('div', 'pack-badge', esc(p.badge || 'PACK')));
    const art = S.spriteImg(S.packArt(p.id), 3, 'pack-art');
    card.append(art);
    card.append(h('h3', '', esc(p.name)));
    const nPrompts = p.chapters.reduce((s, c) => s + c.length, 0);
    card.append(h('p', '', esc(p.tagline || `${nPrompts} prompts`)));
    const chs = h('div', 'pack-chs');
    let firstOpen = -1;
    p.chapters.forEach((_, ci) => {
      const res = store.result(`pack-${p.id}-${ci}`);
      if (!res && firstOpen < 0) firstOpen = ci;
      const b = h('button', '', `CH ${ci + 1}${res ? `<b>${res.best ?? res.score}</b>` : ''}`);
      b.onclick = () => { A.sfx.click(); startPack(p.id, ci); };
      chs.append(b);
    });
    const cta = h('button', 'cta', esc(p.cta || 'DIVE IN →'));
    cta.onclick = () => { A.sfx.click(); startPack(p.id, firstOpen < 0 ? 0 : firstOpen); };
    chs.append(cta);
    card.append(chs);
    inner.append(card);
  }
  const back = h('div', 'row-btns');
  const b = h('button', 'btn pink', "← TODAY'S DIVE");
  b.onclick = () => { homeMode = 'daily'; renderHome(); };
  back.append(b);
  inner.append(back);
}

function showArchive() {
  phase = 'page';
  document.body.classList.remove('in-game');
  for (const id of ['#home', '#game', '#results', '#packs']) $(id).hidden = true;
  ocean.showYou = false;
  ocean.setCamera(3000, 0.5);
  const page = $('#archive');
  page.hidden = false; page.scrollTop = 0;
  const inner = h('div', 'page-inner');
  page.replaceChildren(inner);
  const head = h('div', 'page-head');
  head.append(pixelText('KRILLDIVE', { px: 4, color: '#f6f3ff', chroma: ['#ff3f86', '#2fd6ff'] }));
  inner.append(head);
  inner.append(h('div', 'page-title', 'THE LOGBOOK · EVERY DAILY DIVE, RESURFACEABLE'));
  const grid = h('div', 'arch-grid');
  const today = diveNumberFor();
  for (let n = today; n >= 1; n--) {
    const d = dateForDive(n), res = store.result(`daily-${n}`);
    const b = h('button', n === today ? 'today' : '');
    b.innerHTML = `<b>#${n}</b><small>${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}</small>` +
      (res ? `<i>${res.score}</i>` : `<i class="none">${n === today ? 'TODAY' : 'UNPLAYED'}</i>`);
    b.onclick = () => {
      A.sfx.click();
      if (res) showStoredResults(`daily-${n}`);
      else startRun({ mode: 'daily', n, key: `daily-${n}`, prompts: dailyPrompts(n) });
    };
    grid.append(b);
  }
  inner.append(grid);
  const back = h('div', 'row-btns');
  const b = h('button', 'btn pink', "← TODAY'S DIVE");
  b.onclick = () => { homeMode = 'daily'; renderHome(); };
  back.append(b);
  inner.append(back);
}

// ---------------------------------------------------------------- navigation
function inRun() { return run && ['intro', 'answer', 'judging', 'sinking', 'result'].includes(phase); }
function go(where) {
  closeDrawer();
  if (['home', 'endless', 'endless-start', 'ascent', 'packs', 'archive'].includes(where) && inRun()) {
    if (!confirm('Abandon this dive? It won\'t be saved.')) return;
    run = null;
  }
  switch (where) {
    case 'home': homeMode = 'daily'; return renderHome();
    case 'endless': homeMode = 'endless'; return renderHome();
    case 'ascent': homeMode = 'ascent'; return renderHome();
    case 'endless-start': homeMode = 'endless'; return lib ? startEndless() : null;
    case 'packs': return lib ? showPacks() : null;
    case 'archive': return lib ? showArchive() : null;
    case 'settings': return openSettings();
    case 'wardrobe': return openWardrobe();
    case 'stats': return openStats();
    case 'howto': return openHowTo();
  }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t) { A.sfx.click(); go(t.dataset.go); }
});
$('#menuBtn').addEventListener('click', () => { A.sfx.click(); $('#drawer').hidden = false; });
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });
function closeDrawer() { $('#drawer').hidden = true; }
$('#settingsBtn').addEventListener('click', () => { A.sfx.click(); openSettings(); });
$('#wardrobeBtn').addEventListener('click', () => { A.sfx.click(); openWardrobe(); });
$('#soundBtn').addEventListener('click', () => {
  const on = !(settings.sound || settings.music);
  settings.sound = on; settings.music = on;
  A.setSfx(on); A.setMusic(on); store.save(); updateSoundBtn();
  if (on) A.sfx.click();
});
function updateSoundBtn() {
  const off = !(settings.sound || settings.music);
  $('#soundBtn').classList.toggle('off', off);
  $('#soundBtn').setAttribute('aria-label', off ? 'Turn sound on' : 'Turn sound off');
}

// ---------------------------------------------------------------- modals
function openModal(title, body) {
  const m = $('#modal');
  const mb = $('#modalBody');
  mb.replaceChildren();
  if (title) mb.append(h('h3', '', title));
  mb.append(body);
  m.hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('.modal-x')) closeModal(); });

function seg(options, value, onPick) {
  const wrap = h('div', 'seg');
  for (const [v, label] of options) {
    const b = h('button', v === value ? 'on' : '', label);
    b.onclick = () => { A.sfx.click(); wrap.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(v); };
    wrap.append(b);
  }
  return wrap;
}
function setRow(label, ctl) { const r = h('div', 'set-row'); r.append(h('span', '', label), ctl); return r; }

function openSettings() {
  const body = h('div');
  body.append(setRow('SOUND EFFECTS', seg([[true, 'ON'], [false, 'OFF']], settings.sound, v => { settings.sound = v; A.setSfx(v); store.save(); updateSoundBtn(); })));
  body.append(setRow('AMBIENT DRONE', seg([[true, 'ON'], [false, 'OFF']], settings.music, v => { settings.music = v; A.setMusic(v); store.save(); updateSoundBtn(); })));
  body.append(setRow('MOTION', seg([[true, 'FULL'], [false, 'REDUCED']], settings.motion, v => { settings.motion = v; ocean.motion = v; store.save(); })));
  body.append(setRow('CLOCK', seg([[25, '25s'], [40, '40s'], [0, 'OFF']], settings.timer, v => { settings.timer = v; store.save(); if (phase === 'home') renderHome(); })));
  body.append(setRow('LOCAL AI JUDGE', seg([['auto', 'ON'], ['off', 'OFF']], settings.judge, v => { settings.judge = v; store.save(); checkJudge().then(drawJudge); })));
  const note = h('div', 'set-note');
  const modelRow = h('div', 'set-row');
  const drawJudge = () => {
    note.innerHTML = window.KD_STATIC
      ? 'The local AI judge runs in the desktop version (start.cmd + Ollama). Here, only answers on the built-in lists count.'
      : settings.judge === 'off'
      ? 'Only answers on the built-in lists count.'
      : judge.online
        ? `<b class="ok">● online</b> — answers missing from the lists get checked by your own Ollama model, on this PC. Nothing goes to the cloud.`
        : `<b class="no">● offline</b> — start Ollama to let your local model judge answers that aren't on the lists.`;
    modelRow.replaceChildren();
    if (settings.judge !== 'off' && judge.models.length) {
      const sel = h('select');
      for (const m of judge.models) { const o = h('option', '', esc(m)); o.value = m; if (m === judge.model) o.selected = true; sel.append(o); }
      sel.onchange = () => { judge.model = settings.model = sel.value; store.save(); };
      modelRow.append(h('span', '', 'JUDGE MODEL'), sel);
    }
  };
  drawJudge();
  body.append(note, modelRow);
  const reset = h('button', 'danger', 'RESET ALL PROGRESS');
  reset.onclick = () => {
    if (!confirm('Wipe every saved dive, streak and setting?')) return;
    store.reset(); location.reload();
  };
  body.append(reset);
  openModal('SETTINGS', body);
}

function openWardrobe() {
  const grid = h('div', 'skins');
  for (const [id, m] of Object.entries(S.MASCOTS)) {
    const b = h('button', id === ocean.mascot.skin ? 'on' : '');
    const img = S.spriteImg(m.draw(0), id === 'squid' ? 2 : 3);
    b.append(img, h('span', '', m.name), h('small', '', 'UNLOCKED'));
    b.onclick = () => {
      A.sfx.blub();
      settings.skin = id; ocean.mascot.skin = id; store.save();
      grid.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
    };
    grid.append(b);
  }
  openModal('', grid);
}

function openStats() {
  const runs = Object.values(store.data.results);
  const body = h('div');
  const grid = h('div', 'stats-grid');
  const avg = runs.length ? Math.round(runs.reduce((s, r) => s + r.score, 0) / runs.length) : 0;
  const best = runs.reduce((m, r) => Math.max(m, r.best || r.score), 0);
  const daily = runs.filter(r => r.mode === 'daily').length;
  for (const [v, l] of [[runs.length, 'DIVES LOGGED'], [avg, 'AVERAGE SCORE'], [best, 'DEEPEST SCORE'], [daily, 'DAILY DIVES'], [store.liveStreak(), 'CURRENT STREAK'], [store.data.streak.best, 'BEST STREAK']]) {
    grid.append(h('div', '', `<b>${v}</b><small>${l}</small>`));
  }
  body.append(grid);
  const counts = Object.fromEntries([...TIER_ORDER, 'miss'].map(t => [t, 0]));
  for (const r of runs) for (const a of r.answers || []) counts[a?.tier || 'miss']++;
  const max = Math.max(1, ...Object.values(counts));
  const bars = h('div', 'tier-bars');
  for (const t of [...TIER_ORDER, 'miss']) {
    const col = t === 'miss' ? MISS_COLOR : TIERS[t].color;
    const d = h('div', '', `<span>${t === 'miss' ? 'NOTHING' : TIERS[t].name}</span><i style="width:${(counts[t] / max) * 100}%;background:${col}"></i><span>${counts[t]}</span>`);
    bars.append(d);
  }
  body.append(bars);
  openModal('STATS', body);
}

function openHowTo() {
  const ol = $('#howto').cloneNode(true);
  ol.hidden = false; ol.removeAttribute('id');
  ol.style.cssText = 'list-style:none;padding:0;margin:0;font-size:10.5px;letter-spacing:.12em;line-height:2.2;color:#a9c3dc;text-transform:uppercase';
  const tiers = h('div', 'tier-bars');
  for (const t of TIER_ORDER) tiers.append(h('div', '', `<span style="color:${TIERS[t].color}">${TIERS[t].name}</span><span style="grid-column:span 2;color:#7f9cbb">+${TIERS[t].score} · sink ${TIERS[t].score * M_PER_POINT}m</span>`));
  const body = h('div'); body.append(ol, h('div', 'section-h', 'TIERS'), tiers);
  openModal('HOW TO PLAY', body);
}

// ---------------------------------------------------------------- misc
async function checkJudge() {
  if (settings.judge === 'off' || window.KD_STATIC) { judge.online = false; return; }
  const st = await judgeStatus();
  judge.online = st.online && st.models.length > 0;
  judge.models = st.models;
  judge.model = st.models.includes(settings.model) ? settings.model
    : st.models.find(m => m === 'qwen2.5:32b') || st.models.find(m => /qwen2\.5/.test(m)) || st.models[0] || null;
  judge.checked = true;
}

function blub(quiet) {
  const b = $('#blub');
  b.hidden = false;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  ocean.spawnBubbles(ocean.mascot.x + 20, ocean.depthAt(ocean.mascot.y - 10), 5, 10);
  if (!quiet) A.sfx.blub();
  clearTimeout(blub.t);
  blub.t = setTimeout(() => { b.hidden = true; }, 1500);
}

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

addEventListener('pointerdown', e => {
  A.unlock();
  if (e.target === document.body || e.target.id === 'ocean' || e.target.closest('.screen') === e.target) {
    if (ocean.hitMascot(e.clientX, e.clientY)) blub(false);
  }
}, { passive: true });
addEventListener('keydown', e => {
  A.unlock();
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) return closeModal();
    if (!$('#drawer').hidden) return closeDrawer();
    if (phase === 'page' || phase === 'final') { homeMode = 'daily'; return renderHome(); }
  }
  if ((e.key === 'Enter' || e.key === ' ') && phase === 'result' && document.activeElement?.id !== 'answer') {
    e.preventDefault();
    $('#nextBtn').click();
  }
});
addEventListener('resize', () => setPixelText($('#logo'), 'KRILLDIVE', { px: innerWidth < 520 ? 5 : 9, color: '#f6f3ff', chroma: ['#ff3f86', '#2fd6ff'] }));
