/* NOT A ROBOT - a captcha gauntlet for BALLPARK.
   15 original, absurd verification tests. Everything is client-side; art is emoji, SVG and canvas. */
(() => {
'use strict';

const store = Ballpark.store('robot');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = 15;
const PUBLIC_URL = 'https://marcrsfeir-commits.github.io/ballpark/games/robot/';
const SHARE_URL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? PUBLIC_URL : location.href.split(/[?#]/)[0];

const $ = id => document.getElementById(id);
const card = $('card'), head = $('head'), kickerEl = $('kicker'), titleEl = $('title'), subEl = $('sub');
const stage = $('stage'), msgEl = $('msg'), verifyBtn = $('verify'), pipsEl = $('pips'), timeEl = $('time'), muteBtn = $('mute');

/* ---------- tiny helpers ---------- */
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = t => { const tt = Math.floor(t * 10); return `${Math.floor(tt / 600)}:${String(Math.floor(tt / 10) % 60).padStart(2, '0')}.${tt % 10}`; };
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const norm180 = a => ((a % 360) + 540) % 360 - 180;

/* ---------- sound (Web Audio, starts after the first gesture) ---------- */
const sfx = (() => {
  let ac = null, master = null;
  const muted = () => !!store.get('muted', false);
  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = .55; master.connect(ac.destination);
      } catch { return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function tone(f, d, type = 'sine', v = .1, at = 0, to = null) {
    if (muted()) return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .03);
  }
  return {
    unlock() { if (!muted()) ctx(); },
    tick() { tone(900, .05, 'square', .035); },
    select() { tone(540, .06, 'triangle', .08); },
    dodge() { tone(280, .13, 'sine', .08, 0, 720); },
    pass() { tone(660, .1, 'triangle', .12); tone(990, .17, 'triangle', .12, .09); },
    fail() { tone(230, .24, 'sawtooth', .075, 0, 105); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, 'triangle', .12, i * .11)); tone(1319, .6, 'triangle', .1, .5); },
  };
})();
addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
addEventListener('keydown', () => sfx.unlock(), { capture: true });

function paintMute() {
  const m = !!store.get('muted', false);
  muteBtn.textContent = m ? '\u{1F507}' : '\u{1F50A}';
  muteBtn.setAttribute('aria-pressed', String(m));
  muteBtn.setAttribute('aria-label', m ? 'Unmute sounds' : 'Mute sounds');
}
muteBtn.addEventListener('click', () => { store.set('muted', !store.get('muted', false)); paintMute(); sfx.select(); });
paintMute();

/* ---------- game state ---------- */
const S = {
  phase: 'intro',       // intro | play | done
  idx: -1, acc: 0, last: 0, running: false, pausedByVis: false,
  fails: 0, lvFails: 0, lvTimes: [], lvStart: 0,
  locked: false, timers: [], cleanups: [], verifyFn: null, advTimer: 0,
  root: null, api: null, answer: null, final: 0,
};
const elapsed = () => (S.acc + (S.running ? performance.now() - S.last : 0)) / 1000;   // seconds (S.acc is ms)
function startClock() { if (!S.running) { S.running = true; S.last = performance.now(); } }
function stopClock() { if (S.running) { S.acc += performance.now() - S.last; S.running = false; } }
document.addEventListener('visibilitychange', () => {
  if (S.phase !== 'play') return;
  if (document.hidden) { if (S.running) { stopClock(); S.pausedByVis = true; } }
  else if (S.pausedByVis) { S.pausedByVis = false; startClock(); }
});
setInterval(() => { timeEl.textContent = fmt(elapsed()); }, 100);

for (let i = 0; i < N; i++) pipsEl.append(h('span', { class: 'pip' }));
function renderPips() {
  [...pipsEl.children].forEach((p, i) => { p.className = 'pip' + (S.phase === 'play' || S.phase === 'done' ? (i < S.idx || S.phase === 'done' ? ' done' : i === S.idx ? ' cur' : '') : ''); });
}

/* ---------- card plumbing ---------- */
function setHead(kicker, title, sub = '', tint = '') {
  kickerEl.textContent = kicker; titleEl.textContent = title; subEl.textContent = sub; head.style.background = tint;
}
function setMsg(text, kind = '') { msgEl.textContent = text; msgEl.className = 'msg ' + kind; }
function shake() { if (RM) return; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 450); }
function lock(on) { S.locked = on; if (S.root) S.root.inert = on; verifyBtn.disabled = on; }

function clearLevel() {
  S.cleanups.splice(0).forEach(fn => { try { fn(); } catch {} });
  S.timers.splice(0).forEach(clearTimeout);
  clearTimeout(S.advTimer);
  S.verifyFn = null; S.answer = null;
}

const ICON_OK = '<svg viewBox="0 0 52 52" class="ico" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="#17a34a"/><path d="M14 27l8 8 16-17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_BAD = '<svg viewBox="0 0 52 52" class="ico" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="#dc3c45"/><path d="M17 17l18 18M35 17L17 35" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>';

function showOverlay(kind, quip, btnLabel, onBtn, sub) {
  stage.querySelector('.overlay')?.remove();
  const o = h('div', { class: 'overlay ' + kind },
    h('div', { html: kind === 'ok' ? ICON_OK : ICON_BAD }),
    h('p', { class: 'oq', text: quip }),
    sub ? h('div', { class: 'osub', text: sub }) : null);
  if (btnLabel) {
    const b = h('button', { class: 'btn' + (kind === 'ok' ? '' : ' alt'), type: 'button', text: btnLabel });
    b.addEventListener('click', onBtn);
    o.append(b);
    setTimeout(() => { if (b.isConnected) b.focus({ preventScroll: true }); }, 140);
  }
  stage.append(o);
  return o;
}

function pass(quip, ms = 1300) {
  if (S.locked || S.phase !== 'play') return;
  lock(true);
  S.lvTimes[S.idx] = elapsed() - S.lvStart;
  sfx.pass();
  setMsg(quip, 'ok');
  if (S.idx === N - 1) {                      // the last test: stop the clock, then fake a dramatic verification
    S.phase = 'done'; S.final = elapsed(); stopClock(); renderPips();
    showOverlay('ok', quip);
    S.advTimer = setTimeout(showVerifying, 1500);
    return;
  }
  showOverlay('ok', quip, 'Next ▸', advance);
  S.advTimer = setTimeout(advance, ms);
}
function advance() {
  clearTimeout(S.advTimer);
  if (S.phase !== 'play' || !S.locked) return;
  enterLevel(S.idx + 1);
}
function fail(quip, ms = 2300) {
  if (S.locked || S.phase !== 'play') return;
  lock(true);
  S.fails++; S.lvFails++;
  sfx.fail(); shake();
  setMsg(quip, 'bad');
  showOverlay('bad', quip, 'Try again ▸', retry, '↻ resetting this test · the clock keeps running');
  S.advTimer = setTimeout(retry, ms);
}
function retry() {
  clearTimeout(S.advTimer);
  if (S.phase !== 'play' || !S.locked) return;
  mountLevel();
}
function nudge(text) { sfx.fail(); shake(); setMsg(text, 'bad'); }

function makeApi() {
  const api = {
    get locked() { return S.locked; },
    after(fn, ms) { const id = setTimeout(() => { if (S.api === api && !S.locked) fn(); }, ms); S.timers.push(id); return id; },
    on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); S.cleanups.push(() => target.removeEventListener(ev, fn, opts)); },
    cleanup(fn) { S.cleanups.push(fn); },
    loop(fn) { let id = 0; const step = t => { fn(t); id = requestAnimationFrame(step); }; id = requestAnimationFrame(step); S.cleanups.push(() => cancelAnimationFrame(id)); },
    say: setMsg,
    head(title, sub, tint) { titleEl.textContent = title; subEl.textContent = sub || ''; if (tint != null) head.style.background = tint; },
    verify(label, fn) { S.verifyFn = fn; verifyBtn.textContent = label || 'Verify'; verifyBtn.hidden = false; },
    pass, fail, nudge,
  };
  return api;
}

verifyBtn.addEventListener('click', () => { if (!S.locked && S.verifyFn) S.verifyFn(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && S.phase === 'play' && !S.locked && S.verifyFn && !verifyBtn.hidden && document.activeElement === document.body) {
    e.preventDefault(); S.verifyFn();
  }
});

/* ---------- shared UI pieces ---------- */
function tileGrid(cols, cells, onSingle) {
  const grid = h('div', { class: 'grid g' + cols, role: 'group', style: `--cols:${cols}` });
  const tiles = cells.map((c, i) => {
    const b = h('button', { class: 'tile ' + (c.cls || ''), type: 'button', 'aria-pressed': 'false', 'aria-label': c.label || `square ${i + 1}` });
    b.append(h('span', { class: 'face', html: c.html }));
    b.addEventListener('click', () => {
      if (S.locked) return;
      if (onSingle) { b.setAttribute('aria-pressed', 'true'); sfx.select(); onSingle(i); return; }
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); sfx.select();
    });
    return b;
  });
  grid.append(...tiles);
  return { el: grid, tiles, selected: () => tiles.map((b, i) => (b.getAttribute('aria-pressed') === 'true' ? i : -1)).filter(i => i >= 0) };
}
const onEnter = (input, fn) => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });

/* =========================================================================
   THE LEVELS
   ========================================================================= */

/* 1 - the checkbox that dodges your cursor */
function L_check(root, api) {
  const MAX = 6;
  const bubble = h('div', { class: 'bubble', text: 'Just tick the box. How hard can it be?' });
  const area = h('div', { class: 'cbarea' });
  const box = h('button', { class: 'cb', type: 'button', 'aria-label': "I'm not a robot" });
  const wrap = h('div', { class: 'cbwrap' }, box, h('span', { class: 'cblabel', text: "I'm not a robot" }));
  area.append(wrap);
  root.append(bubble, area, h('div', { class: 'tiny', text: 'On a keyboard? Tab to the box and press Space.' }));
  let dodges = 0, tired = false, busy = false, pos = { x: 0, y: 0 };
  const lines = ['Too slow.', 'Nope.', 'Whoa, you’re quick. It’s quicker.', 'Not today.', 'Careful, it bites.'];
  const dims = () => ({ aw: area.clientWidth, ah: area.clientHeight, w: wrap.offsetWidth, hh: wrap.offsetHeight });
  function put(x, y) { pos = { x, y }; wrap.style.left = x + 'px'; wrap.style.top = y + 'px'; }
  { const d = dims(); wrap.style.transition = 'none'; put((d.aw - d.w) / 2, (d.ah - d.hh) / 2); void wrap.offsetWidth; wrap.style.transition = ''; }
  const center = () => { const A = area.getBoundingClientRect(), d = dims(); return { x: A.left + pos.x + d.w / 2, y: A.top + pos.y + d.hh / 2 }; };
  function dodge(px, py) {
    dodges++; sfx.dodge();
    const A = area.getBoundingClientRect(), d = dims(), c = [];
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * (d.aw - d.w), y = Math.random() * (d.ah - d.hh);
      c.push({ x, y, d: Math.hypot(A.left + x + d.w / 2 - px, A.top + y + d.hh / 2 - py) });
    }
    c.sort((a, b) => b.d - a.d);
    const t = c[Math.floor(Math.random() * 5)];
    put(t.x, t.y);
    if (dodges >= MAX) { tired = true; wrap.classList.add('tired'); bubble.textContent = 'Okay… okay. It’s exhausted. Go on, tick it.'; }
    else bubble.textContent = lines[(dodges - 1) % lines.length];
  }
  let lastAt = 0;
  area.addEventListener('pointermove', e => {
    if (api.locked || tired || busy || e.pointerType === 'touch') return;
    const c = center(), now = performance.now();
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < 82 && now - lastAt > 170) { lastAt = now; dodge(e.clientX, e.clientY); }
  });
  let tiredAtDown = false;
  box.addEventListener('pointerdown', e => {                // catches touch taps and fast clicks too
    tiredAtDown = tired;
    if (api.locked || tired || busy) return;
    e.preventDefault(); dodge(e.clientX, e.clientY);
  });
  box.addEventListener('click', e => {
    if (api.locked || busy) return;
    if (e.detail !== 0 && !tiredAtDown) return;             // pointer clicks only count once it was already tired (Space/Enter always work)
    busy = true; box.classList.add('spin'); sfx.select();
    setTimeout(() => {
      box.classList.remove('spin'); box.classList.add('on'); sfx.pass();
      setTimeout(() => api.pass(pick(['The checkbox gave up. So did your dignity.', 'Ticked. It never stood a chance.', 'Caught it. It’s having a lie down now.'])), 280);
    }, 520);
  });
  S.answer = () => ({ dodges, tired });
}

/* 2 - select every fish (sharks count, dolphins do not) */
const SEA = { '\u{1F41F}': 'fish', '\u{1F420}': 'tropical fish', '\u{1F421}': 'blowfish', '\u{1F988}': 'shark', '\u{1F42C}': 'dolphin', '\u{1F433}': 'whale', '\u{1F419}': 'octopus', '\u{1F980}': 'crab', '\u{1F991}': 'squid', '\u{1F422}': 'turtle', '\u{1F990}': 'shrimp', '\u{1F40A}': 'crocodile', '\u{1F438}': 'frog' };
function L_fish(root, api) {
  const fish = shuffle(['\u{1F41F}', '\u{1F420}', '\u{1F421}']).slice(0, ri(2, 3)).concat('\u{1F988}');
  const rest = shuffle(['\u{1F433}', '\u{1F419}', '\u{1F980}', '\u{1F991}', '\u{1F422}', '\u{1F990}', '\u{1F40A}', '\u{1F438}']).slice(0, 9 - fish.length - 1);
  const cells = shuffle([...fish.map(e => ({ e, ok: true })), ...['\u{1F42C}', ...rest].map(e => ({ e, ok: false }))]);
  const g = tileGrid(3, cells.map(c => ({ html: c.e, label: SEA[c.e] })));
  root.append(g.el);
  S.answer = () => cells.map(c => c.ok);
  api.verify('Verify', () => {
    const sel = new Set(g.selected());
    if (!sel.size) return api.nudge('Pick something. There are definitely fish in there.');
    const wrong = cells.filter((c, i) => sel.has(i) && !c.ok).map(c => c.e);
    const missed = cells.filter((c, i) => !sel.has(i) && c.ok).map(c => c.e);
    if (!wrong.length && !missed.length) return api.pass(pick(['Every fish accounted for. Even the sneaky shark.', 'Flawless. You’d make a great aquarium inspector.']));
    if (wrong.some(e => e === '\u{1F42C}' || e === '\u{1F433}')) return api.fail('Dolphins and whales breathe air. They’re mammals, and very offended.');
    if (wrong.length) return api.fail(`${wrong[0]} is a ${SEA[wrong[0]]}, not a fish. Nice try.`);
    if (missed.includes('\u{1F988}')) return api.fail('Sharks are fish. Scary ones, but fish.');
    api.fail('You missed a fish. They’re sneaky like that.');
  });
}

/* 3 - the wobbly text */
function paintCaptcha(cv, text) {
  const W = 300, H = 110, d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * d; cv.height = H * d;
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#eef3ff'); bg.addColorStop(1, '#fff3e6');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `hsla(${ri(180, 300)} 40% 50% / ${(.08 + Math.random() * .18).toFixed(2)})`;
    g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 0, 6.3); g.fill();
  }
  const off = document.createElement('canvas'); off.width = W * d; off.height = H * d;
  const o = off.getContext('2d'); o.setTransform(d, 0, 0, d, 0, 0);
  const fonts = ['Georgia, serif', '"Trebuchet MS", sans-serif', '"Courier New", monospace', 'Impact, "Arial Black", sans-serif', '"Palatino Linotype", serif'];
  o.textAlign = 'center'; o.textBaseline = 'middle';
  const step = (W - 40) / text.length;
  [...text].forEach((ch, i) => {
    o.save();
    o.translate(28 + step * (i + .5) + ri(-4, 4), H / 2 + ri(-9, 9));
    o.rotate((Math.random() - .5) * .8);
    o.font = `${pick(['bold ', ''])}${ri(44, 56)}px ${pick(fonts)}`;
    o.fillStyle = `hsl(${ri(205, 265)} 60% ${ri(16, 30)}%)`;
    o.fillText(ch, 0, 0);
    o.restore();
  });
  const amp = 3.5 + Math.random() * 3, per = 20 + Math.random() * 14, ph = Math.random() * 6.28;
  for (let x = 0; x < W; x++) g.drawImage(off, x * d, 0, d, H * d, x, Math.sin(x / per + ph) * amp, 1, H);
  g.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = `hsla(${ri(0, 360)} 60% 40% / .5)`;
    g.beginPath(); g.moveTo(-5, ri(10, 100));
    g.bezierCurveTo(ri(60, 120), ri(0, 110), ri(160, 220), ri(0, 110), W + 5, ri(10, 100)); g.stroke();
  }
}
function L_text(root, api) {
  const alphabet = 'ACDEFGHJKMNPRTUVWXY346789';
  let word = '';
  const cv = h('canvas', { class: 'capcv', role: 'img' });
  const inp = h('input', { class: 'txt mono', type: 'text', maxlength: '10', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'type the letters', 'aria-label': 'Type the characters you see' });
  const again = h('button', { class: 'ghost', type: 'button', text: '↻ new text' });
  function roll() {
    word = ''; for (let i = 0; i < 5; i++) word += alphabet[ri(0, alphabet.length - 1)];
    paintCaptcha(cv, word);
    cv.setAttribute('aria-label', `Distorted text. Screen-reader answer: ${[...word].join(' ')}`);
    inp.value = '';
  }
  again.addEventListener('click', () => { roll(); inp.focus(); sfx.select(); });
  root.append(cv, inp, h('div', { class: 'row' }, again, h('span', { class: 'tiny', text: 'Case doesn’t matter. Wobble does.' })));
  roll();
  S.answer = () => word;
  const go = () => {
    const v = inp.value.trim().toUpperCase();
    if (!v) return api.nudge('The box is empty. Robots love an empty box.');
    if (v === word) return api.pass(pick(['Squinting: a deeply human skill.', 'Read it like a pro. Bots hate this one weird trick: eyes.']));
    if (v.length !== word.length) return api.fail(`I count ${word.length} characters. You typed ${v.length}. Math is hard when letters wobble.`);
    api.fail(pick(['Not quite. That wobbly one is a liar.', 'Close! Some of those letters are clearly shy.', 'So close. Maybe blame the font.']));
  };
  api.verify('Verify', go);
  onEnter(inp, go);
  api.after(() => inp.focus({ preventScroll: true }), 60);
}

/* 4 - rotate the picture upright */
const SCENE = '<svg viewBox="0 0 200 200" aria-hidden="true">' +
  '<defs><linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d93ea"/><stop offset="1" stop-color="#d4ecff"/></linearGradient></defs>' +
  '<rect width="200" height="200" fill="url(#skyG)"/>' +
  '<circle cx="158" cy="36" r="15" fill="#ffd54a"/><g stroke="#ffd54a" stroke-width="3" stroke-linecap="round"><path d="M158 11v-6M158 61v6M133 36h-6M183 36h6M141 19l-4-4M175 19l4-4"/></g>' +
  '<ellipse cx="52" cy="40" rx="24" ry="8" fill="#fff"/><ellipse cx="66" cy="34" rx="15" ry="8" fill="#fff"/><ellipse cx="112" cy="62" rx="16" ry="5.500" fill="#fff" opacity=".9"/>' +
  '<path d="M0 150Q55 112 118 140T200 130V200H0Z" fill="#5cb85c"/><rect y="168" width="200" height="32" fill="#46a047"/>' +
  '<rect x="26" y="132" width="8" height="34" fill="#7a4a21"/><circle cx="30" cy="122" r="19" fill="#2e8b3d"/><circle cx="22" cy="130" r="11" fill="#379a47"/>' +
  '<rect x="70" y="108" width="62" height="58" fill="#f3d6a4"/><rect x="117" y="80" width="9" height="20" fill="#a2402f"/>' +
  '<polygon points="62,110 101,78 140,110" fill="#c0392b"/><rect x="93" y="134" width="15" height="32" fill="#7a4a21"/><circle cx="105" cy="151" r="1.500" fill="#ffd54a"/>' +
  '<rect x="76" y="120" width="14" height="14" fill="#a9d8ff" stroke="#fff" stroke-width="2"/><rect x="113" y="120" width="14" height="14" fill="#a9d8ff" stroke="#fff" stroke-width="2"/>' +
  '<g fill="#fff"><rect x="150" y="150" width="4" height="22"/><rect x="164" y="150" width="4" height="22"/><rect x="178" y="150" width="4" height="22"/><rect x="146" y="156" width="40" height="3"/></g>' +
  '<g><circle cx="48" cy="182" r="3" fill="#ff6b9d"/><circle cx="62" cy="186" r="3" fill="#ffd54a"/><circle cx="154" cy="188" r="3" fill="#ff6b9d"/></g></svg>';
function L_rotate(root, api) {
  let rot = pick([60, 75, 90, 105, 120, 135, 150, 165, 195, 210, 225, 240, 255, 270, 285, 300]);
  const pic = h('div', { class: 'pic', html: SCENE });
  const frame = h('div', { class: 'frame', tabindex: '0', role: 'img', 'aria-label': 'A tilted picture of a house on a hill. Use the left and right arrow keys, or drag, to rotate it upright.' }, pic);
  const set = v => { rot = v; pic.style.transform = `rotate(${rot}deg)`; };
  set(rot);
  const left = h('button', { class: 'ghost', type: 'button', text: '⟲ 15°', 'aria-label': 'Rotate left 15 degrees' });
  const right = h('button', { class: 'ghost', type: 'button', text: '15° ⟳', 'aria-label': 'Rotate right 15 degrees' });
  left.addEventListener('click', () => { if (!api.locked) { set(rot - 15); sfx.tick(); } });
  right.addEventListener('click', () => { if (!api.locked) { set(rot + 15); sfx.tick(); } });
  let drag = null;
  frame.addEventListener('pointerdown', e => {
    if (api.locked) return;
    const r = frame.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    drag = { cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), r0: rot };
    frame.setPointerCapture(e.pointerId); frame.classList.add('drag'); e.preventDefault();
  });
  frame.addEventListener('pointermove', e => {
    if (!drag) return;
    set(drag.r0 + (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180 / Math.PI);
  });
  const stop = () => { drag = null; frame.classList.remove('drag'); };
  frame.addEventListener('pointerup', stop); frame.addEventListener('pointercancel', stop);
  frame.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); set(rot - 15); sfx.tick(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); set(rot + 15); sfx.tick(); }
  });
  root.append(frame, h('div', { class: 'row' }, left, right), h('div', { class: 'tiny', text: 'Drag the picture around, or use the buttons.' }));
  S.answer = () => norm180(rot);
  api.verify('Verify', () => {
    const a = Math.abs(norm180(rot));
    if (a <= 10) return api.pass(pick(['Upright. The little house thanks you.', 'Gravity restored. Nice work.']));
    api.fail(a > 120 ? 'That’s basically upside down. The chimney is on the floor.' : `Still about ${Math.round(a)}° off. The house is sliding down its hill.`);
  });
  frame.focus({ preventScroll: true });
}

/* 5 - traffic lights, including half of one */
const ROAD = { '\u{1F697}': 'car', '\u{1F695}': 'taxi', '\u{1F6D1}': 'stop sign', '\u{1F6A7}': 'construction barrier', '\u{1F68F}': 'bus stop sign', '\u{1F333}': 'tree', '\u{1F3E2}': 'office block', '\u{1F6B2}': 'bicycle', '\u{1F415}': 'dog', '\u{1F68C}': 'bus', '\u{1F534}': 'red circle', '\u{1F7E2}': 'green circle', '\u{1F693}': 'police car', '\u{1F6F5}': 'scooter' };
function L_lights(root, api) {
  const good = [
    { html: '\u{1F6A6}', label: 'traffic light', ok: true },
    { html: '\u{1F6A6}', label: 'tilted traffic light', ok: true, cls: 'rot' },
    { html: '\u{1F6A6}', label: 'mirrored traffic light', ok: true, cls: 'mir' },
    { html: '\u{1F6A5}', label: 'sideways traffic light', ok: true },
    { html: '\u{1F6A6}', label: 'half a traffic light, cut off by the edge of the square', ok: true, cls: 'half', half: true },
  ];
  const bad = shuffle(Object.keys(ROAD)).slice(0, 11).map(e => ({ html: e, label: ROAD[e], ok: false, name: ROAD[e] }));
  const cells = shuffle([...good, ...bad]);
  const g = tileGrid(4, cells);
  root.append(g.el);
  S.answer = () => cells.map(c => c.ok);
  api.verify('Verify', () => {
    const sel = new Set(g.selected());
    if (!sel.size) return api.nudge('Nothing selected. There are traffic lights in here, trust us.');
    const wrong = cells.filter((c, i) => sel.has(i) && !c.ok);
    const missed = cells.filter((c, i) => !sel.has(i) && c.ok);
    if (!wrong.length && !missed.length) return api.pass(pick(['Even the half one. You’re thorough.', 'Green means go. You went.']));
    if (wrong.length) return api.fail(`That ${wrong[0].name} isn’t a traffic light. Close in spirit, though.`);
    if (missed.some(c => c.half)) return api.fail('Half a traffic light is still a traffic light. Rude to leave it out.');
    api.fail('You missed one. Look again, they hide in plain sight.');
  });
}

/* 6 - slider to exactly 73 */
function L_slider(root, api) {
  const start = pick([8, 14, 91, 96, 38, 57, 22]);
  const out = h('output', { class: 'big-num', text: String(start), 'aria-live': 'off' });
  const rng = h('input', { class: 'rng', type: 'range', min: '0', max: '100', step: '1', value: String(start), 'aria-label': 'Dial, 0 to 100' });
  const minus = h('button', { class: 'ghost', type: 'button', text: '−1', 'aria-label': 'Minus one' });
  const plus = h('button', { class: 'ghost', type: 'button', text: '+1', 'aria-label': 'Plus one' });
  const upd = () => { out.textContent = rng.value; };
  rng.addEventListener('input', () => { upd(); sfx.tick(); });
  minus.addEventListener('click', () => { rng.value = Math.max(0, +rng.value - 1); upd(); sfx.tick(); });
  plus.addEventListener('click', () => { rng.value = Math.min(100, +rng.value + 1); upd(); sfx.tick(); });
  root.append(out, h('div', { class: 'rngrow' }, minus, rng, plus), h('div', { class: 'rnglab' }, h('span', { text: '0' }), h('span', { text: '100' })),
    h('div', { class: 'tiny', text: 'Arrow keys work too. Precision is a human weakness, apparently.' }));
  S.answer = () => 73;
  api.verify('Verify', () => {
    const v = +rng.value, d = Math.abs(v - 73);
    if (v === 73) return api.pass(pick(['73. Dead on. Almost suspiciously dead on.', 'Exactly 73. A bot could do that. But a bot wouldn’t have complained about it.']));
    if (d === 1) return api.fail(`${v}. SO close. Humans live in the gap between 72 and 74.`);
    api.fail(`${v}? We said 73. Off by ${d}. Precision: not your strong suit.`);
  });
  rng.focus({ preventScroll: true });
}

/* 7 - click when the bar is exactly green */
const hueName = hu => hu < 15 ? 'RED' : hu < 40 ? 'ORANGE' : hu < 70 ? 'YELLOW' : hu < 106 ? 'LIME' : hu < 134 ? 'GREEN' : hu < 170 ? 'MINT' : hu < 200 ? 'CYAN' : hu < 255 ? 'BLUE' : hu < 285 ? 'PURPLE' : 'PINK';
function L_green(root, api) {
  const T = 3600;
  const fill = h('i');
  const bar = h('div', { class: 'bar', role: 'img', 'aria-label': 'A progress bar that cycles through every colour' }, fill);
  const cname = h('div', { class: 'cname', 'aria-hidden': 'true', text: '…' });
  const btn = h('button', { class: 'bigbtn', type: 'button', text: 'NOW', 'aria-label': 'Now! (press when the bar is exactly green)' });
  root.append(bar, cname, btn, h('div', { class: 'tiny', text: 'Press when the colour says GREEN. Space, Enter or a tap.' }));
  const t0 = performance.now();
  const state = () => { const p = ((performance.now() - t0) % T) / T; return { p, hue: p * 300 }; };
  api.loop(() => {
    const { p, hue } = state(), n = hueName(hue);
    fill.style.width = (p * 100).toFixed(1) + '%';
    fill.style.background = `hsl(${hue.toFixed(0)} 88% 46%)`;
    cname.textContent = n; cname.style.color = `hsl(${hue.toFixed(0)} 80% 36%)`;
  });
  const hit = () => {
    if (api.locked) return;
    const { hue } = state();
    if (Math.abs(hue - 120) <= 14) return api.pass(pick(['Green. Properly green. Eagle eyes.', 'Perfect timing. Reflexes of a hungry cat.']));
    api.fail(`That was ${hueName(hue).toLowerCase()}. We asked for green. They’re different colours, we checked.`);
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); hit(); });
  btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) hit(); } });
  btn.addEventListener('click', e => e.preventDefault());
  S.answer = () => state();
  btn.focus({ preventScroll: true });
}

/* 8 - how are you feeling? (anything goes, with sass) */
function feelingQuip(raw) {
  const t = raw.trim(), s = t.toLowerCase();
  if (/^\d+$/.test(s)) return 'A number. Bold. Wrong category, but bold.';
  if (/\p{Extended_Pictographic}/u.test(s)) return 'An emoji. The finest feelings language we have.';
  if (/\b(bot|robot|beep|boop|binary|error|compute|processing|optimal|nominal)\b/.test(s)) return 'Beep boop is not a feeling. But the joke was gloriously human. Proceed.';
  if (/^(fine|ok|okay|alright|good|meh|nothing|idk)\W*$/.test(s)) return `“${t.replace(/[.!\s]+$/, '')}.” The most human way to say absolutely nothing. Approved.`;
  if (/\b(sad|bad|tired|awful|terrible|stressed|anxious|bored|angry|hungry|sleepy|exhausted|lonely|worried)\b/.test(s)) return 'Honest, and a little sad. A robot would have said “optimal”. You’re in.';
  if (/\b(happy|great|amazing|excellent|fantastic|joy|wonderful|best|love|awesome|nice)\b/.test(s)) return 'Suspiciously upbeat. Our scanners are squinting, but fine.';
  if (s.includes('?')) return 'Answering a question with a question. Peak human behaviour.';
  if (s.length > 70) return 'That’s a lot of feelings. We only asked once.';
  return pick(['Interesting. Filed under “plausibly human”.', 'Noted. Our feelings database has one more entry nobody will ever read.', 'A robot would have said “optimal”. You did not. Welcome aboard.']);
}
function L_feel(root, api) {
  const inp = h('input', { class: 'txt', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'honestly…', 'aria-label': 'How are you feeling?' });
  root.append(h('div', { style: 'font-size:64px;line-height:1', 'aria-hidden': 'true', text: '\u{1F914}' }), inp,
    h('div', { class: 'tiny', text: 'There are no wrong answers. There are only suspicious ones.' }));
  const go = () => {
    if (!inp.value.trim()) return api.nudge('Silence. Very robot. Say literally anything.');
    api.pass(feelingQuip(inp.value), 3600);
  };
  api.verify('Verify', go);
  onEnter(inp, go);
  S.answer = () => 'anything';
  api.after(() => inp.focus({ preventScroll: true }), 60);
}

/* 9 - the odd emoji out */
function L_odd(root, api) {
  const [a, b] = pick([['\u{1F600}', '\u{1F603}'], ['\u{1F642}', '\u{1F643}'], ['\u{1F610}', '\u{1F611}'], ['\u{1F620}', '\u{1F621}'], ['\u{1F62E}', '\u{1F62F}'], ['\u{1F345}', '\u{1F34E}'], ['\u{1F315}', '\u{1F31D}'], ['\u{1F535}', '\u{1F7E3}'], ['\u{1F60A}', '\u{1F60C}'], ['\u{1F970}', '\u{1F60D}']]);
  const flip = Math.random() < .5, base = flip ? b : a, odd = flip ? a : b;
  const idx = ri(0, 24);
  const cells = Array.from({ length: 25 }, (_, i) => ({ html: i === idx ? odd : base, label: 'emoji' }));
  const g = tileGrid(5, cells, i => {
    if (i === idx) api.pass(pick(['That one! Eyes like a hawk.', 'Spotted. Nothing escapes you.']), 1100);
    else api.fail('Nope. That one is identical to its neighbours. Try spotting the liar.');
  });
  root.append(g.el, h('div', { class: 'tiny', text: 'Tap the one that doesn’t belong.' }));
  S.answer = () => idx;
}

/* 10 - hold for exactly 3 seconds */
function L_hold(root, api) {
  let down = null, iv = 0;
  const btn = h('button', { class: 'hold', type: 'button', text: 'HOLD', 'aria-label': 'Hold for exactly three seconds' });
  const read = h('div', { class: 'holdread', 'aria-hidden': 'true' });
  root.append(btn, read, h('div', { class: 'tiny', text: 'Press and hold. Let go at exactly 3.0 seconds.\nThe clock gets shy after one second.', style: 'white-space:pre-line' }));
  const secs = () => (performance.now() - down) / 1000;
  const upd = () => { const d = secs(); read.textContent = d < 1 ? d.toFixed(1) + 's' : '· · ·'; };
  const begin = () => { if (api.locked || down != null) return; down = performance.now(); btn.classList.add('down'); sfx.tick(); iv = setInterval(upd, 40); upd(); };
  const end = cancelled => {
    if (down == null) return;
    const d = secs(); down = null; clearInterval(iv); btn.classList.remove('down');
    if (cancelled) { read.textContent = ''; return; }
    read.textContent = d.toFixed(2) + 's';
    if (d < .35) return api.nudge('That was a tap. Press and keep pressing.');
    if (Math.abs(d - 3) <= .35) return api.pass(`${d.toFixed(2)} seconds. Eerily punctual.`);
    api.fail(`${d.toFixed(2)}s. ${d < 3 ? 'Too eager' : 'Too patient'}. The target was 3.00.`);
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch {} begin(); });
  btn.addEventListener('pointerup', () => end(false));
  btn.addEventListener('pointercancel', () => end(true));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); } });
  btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); end(false); } });
  api.cleanup(() => clearInterval(iv));
  S.answer = () => 3;
}

/* 11 - the alphabet backwards, from M */
function L_alpha(root, api) {
  const want = 'MLKJIHGFEDCBA';
  const inp = h('input', { class: 'txt mono', type: 'text', maxlength: '40', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'M, L, K…', 'aria-label': 'The alphabet backwards, starting from M' });
  root.append(h('div', { style: 'font:800 64px/1 var(--mono);color:var(--blue)', 'aria-hidden': 'true', text: 'M → A' }), inp,
    h('div', { class: 'tiny', text: 'Spaces and commas are fine. Panic is optional.' }));
  S.answer = () => want;
  const go = () => {
    const t = inp.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (!t) return api.nudge('Start typing. It begins with M. That’s the only free hint.');
    const exp = t[0] === 'L' ? want.slice(1) : want;
    if (t === exp) return api.pass(pick(['Backwards, flawlessly. Suspiciously flawlessly.', 'M to A without a hitch. Did you sing it?']));
    let i = 0; while (i < t.length && i < exp.length && t[i] === exp[i]) i++;
    api.fail(i >= t.length ? `You stopped at ${exp[i - 1] || 'the start'}. There’s more alphabet down there.` : `You went wrong at “${t[i]}”. The next letter was “${exp[i]}”.`);
  };
  api.verify('Verify', go);
  onEnter(inp, go);
  api.after(() => inp.focus({ preventScroll: true }), 60);
}

/* 12 - "select the robot": there is a robot in EVERY square */
const ROBOTS = [
  '<i style="font-size:1.1em">\u{1F916}</i>',
  '<i class="bg" style="font-size:1.1em">\u{1F332}</i><i style="font-size:.5em;margin:.7em 0 0 .8em">\u{1F916}</i>',
  '<i style="transform:rotate(180deg) translate(0,0)">\u{1F916}</i>',
  '<i style="margin-top:.14em">\u{1F916}</i><i style="font-size:.5em;margin-top:-.62em">\u{1F3A9}</i>',
  '<i style="font-size:.95em">\u{1F916}</i><i style="font-size:1.25em;opacity:.78">\u{1F333}</i>',
  '<i style="rotate:90deg">\u{1F916}</i>',
  '<i class="bg" style="font-size:1.35em;opacity:.45">\u{1F3D9}️</i><i style="font-size:.4em;margin:.3em 0 0 -.4em">\u{1F916}</i>',
  '<i style="transform:scaleX(-1);filter:hue-rotate(150deg) saturate(1.6)">\u{1F916}</i>',
  '<i style="font-size:1.05em">\u{1F697}</i><i style="font-size:.38em;margin-top:-.28em">\u{1F916}</i>',
];
function L_robots(root, api) {
  const cells = shuffle(ROBOTS).map(html => ({ html, cls: 'rob', label: 'square with a robot in it' }));
  const g = tileGrid(3, cells);
  root.append(g.el);
  S.answer = () => cells.map(() => true);
  api.verify('Verify', () => {
    const n = g.selected().length;
    if (!n) return api.nudge('Select something. Anything. They’re all suspicious.');
    if (n === 9) return api.pass(pick(['All nine. Nothing gets past you, not even the one in the car.', 'Robots everywhere, and you saw every one. Eerie.']), 1500);
    api.fail(`You found ${n} of 9. The other ${9 - n} have robots in them too. They’re just good at hiding.`);
  });
}

/* 13 - the reverse test: only a robot gets it right */
function L_reverse(root, api) {
  const a = ri(1200, 9800), b = ri(13, 87), ans = a * b;
  const inp = h('input', { class: 'txt', type: 'text', inputmode: 'numeric', maxlength: '12', autocomplete: 'off', placeholder: 'your best guess', 'aria-label': `Answer to ${a} times ${b}` });
  const giveUp = h('button', { class: 'ghost', type: 'button', text: 'I give up' });
  root.append(h('div', { class: 'sum' }, h('small', { text: 'Robots find this one easy:' }), `${a.toLocaleString('en-US')} × ${b} = ?`), inp,
    h('div', { class: 'row' }, giveUp), h('div', { class: 'tiny', text: 'Take your time. Or don’t. Time is a human construct.' }));
  S.answer = () => ans;
  const go = () => {
    const raw = inp.value.replace(/[,\s]/g, '');
    if (!raw) return api.nudge('Even a wrong answer is an answer. Try one.');
    if (Number(raw) === ans) return api.fail('Correct. Flawlessly, instantly correct. Calculator detected. Humans are allowed to be wrong.');
    api.pass(pick(['Wrong! Gloriously wrong. That’s the human touch.', 'Not even close. Not even trying. Beautiful.', 'Incorrect, and you should feel proud.']), 2200);
  };
  giveUp.addEventListener('click', () => { if (!api.locked) api.pass(pick(['Giving up: the most human thing there is. Welcome.', 'A robot would never quit. You just did. Verified.']), 2200); });
  api.verify('Verify', go);
  onEnter(inp, go);
  api.after(() => inp.focus({ preventScroll: true }), 60);
}

/* 14 - do absolutely nothing for five seconds */
function L_still(root, api) {
  const GOAL = 5000, C = 2 * Math.PI * 52;
  const ring = h('div', { class: 'ringbox', html: `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rg-bg" cx="60" cy="60" r="52"/><circle class="rg-fg" cx="60" cy="60" r="52" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/></svg><div class="rnum">5.0</div>` });
  const fg = ring.querySelector('.rg-fg'), num = ring.querySelector('.rnum');
  root.append(ring, h('div', { class: 'tiny', text: 'Don’t click. Don’t type. Don’t wiggle the mouse.\nRobots can’t resist, so you can.', style: 'white-space:pre-line' }));
  let start = performance.now(), armed = start + 700, resets = 0, said = 0;
  const lines = ['Whoa. You moved. Starting over.', 'Twitching counts, sadly.', 'Your mouse is not a stress ball.', 'This is the whole test. Doing nothing.', 'A robot would have stopped by now. Hmm.'];
  const act = e => {
    if (api.locked || performance.now() < armed) return;
    if (e.type === 'pointermove' && Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) < 1) return;
    start = performance.now(); said = 0;
    api.say(lines[Math.min(resets++, lines.length - 1)], 'bad');
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) api.on(window, ev, act, { capture: true, passive: true });
  api.say('Hands off. Starting… now.');
  api.loop(() => {
    if (api.locked) return;
    const left = GOAL - (performance.now() - start);
    fg.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, left) / GOAL)).toFixed(1));
    num.textContent = Math.max(0, left / 1000).toFixed(1);
    const t = GOAL - left;
    if (said < 1 && t > 1500) { said = 1; api.say('Good. Keep not doing things.'); }
    else if (said < 2 && t > 3000) { said = 2; api.say('Almost there. Resist the urge.'); }
    else if (said < 3 && t > 4200) { said = 3; api.say('Don’t. You. Dare.'); }
    if (left <= 0) api.pass(pick(['Stillness achieved. A bot would have clicked something by now.', 'Five seconds of nothing. Truly the human experience.']), 1500);
  });
  S.answer = () => 'wait';
}

/* 15 - are you SURE? */
function L_sure(root, api) {
  const stages = [
    { face: '\u{1F642}', q: 'Are you sure you’re not a robot?', sub: 'Take your time. (Not too much time.)', yes: 'Yes', no: 'No', tint: '#2d5bd8', title: 'Are you sure?', hsub: 'A routine follow-up question.', bad: 'Honest! Refreshing. But a robot would admit it to seem trustworthy. Restarting the interview.' },
    { face: '\u{1F610}', q: 'Hm. That was a very confident “yes”. Are you SURE?', sub: 'Our logs say you click like someone who has never blinked.', yes: 'Yes, I’m sure', no: 'Maybe?', tint: '#6a4fd8', title: 'Are you SURE?', hsub: 'Just double-checking.', bad: '“Maybe” is exactly what a robot says when its confidence interval is wide. Restarting.' },
    { face: '\u{1F928}', q: 'Look at me. LOOK AT ME. Are you REALLY, TRULY sure?', sub: 'Robots always say yes. Humans also say yes. This is not helping.', yes: 'YES. REALLY.', no: 'No', tint: '#c2570c', title: 'Are you REALLY sure?', hsub: 'This is not a drill.', shuffle: true, bad: 'You were SO close to being believable. Restarting the interrogation.' },
    { face: '\u{1F9D0}', q: '…I want to believe you.', sub: 'Type it. “I am not a robot.” Nice and slowly.', input: true, tint: '#b42323', title: 'Final answer?', hsub: 'Last one. Promise.' },
  ];
  let k = 0;
  const judge = h('div', { class: 'judge', 'aria-hidden': 'true' });
  const q = h('p', { class: 'sq' }), sub = h('p', { class: 'ssub' });
  const answers = h('div', { class: 'ans' });
  const meter = h('div', { class: 'sus', 'aria-hidden': 'true' }, h('em', { text: 'SUSPICION' }), ...stages.map(() => h('span')));
  root.append(judge, q, sub, answers, meter);
  const reactions = ['', 'Hmm.', 'Hmmmmm.', 'Okay. Okay. One last thing.'];
  function render() {
    const s = stages[k];
    judge.textContent = s.face; q.textContent = s.q; sub.textContent = s.sub;
    api.head(s.title, s.hsub, s.tint);
    [...meter.querySelectorAll('span')].forEach((sp, i) => sp.classList.toggle('on', i <= k));
    answers.textContent = '';
    if (s.input) {
      const inp = h('input', { class: 'txt', type: 'text', maxlength: '60', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'I am not a…', 'aria-label': 'Type: I am not a robot' });
      const go = () => {
        const v = inp.value.toLowerCase().replace(/[^a-z]/g, '');
        if (!v) return api.nudge('Type it. Slowly. With feeling.');
        if (v === 'iamnotarobot') return api.pass('…Fine. I believe you. (I half believe you.)', 1200);
        if (v === 'iamarobot') return api.fail('Wow. Brave. Honest. Restarting the interview.');
        if (v.includes('definitely')) return api.fail('Nobody types “definitely” unless they are, definitely. Restarting.');
        api.fail('Even your typos are suspicious. Restarting the interview.');
      };
      answers.append(inp, h('button', { class: 'btn', type: 'button', text: 'I swear', onclick: go }));
      onEnter(inp, go);
      S.answer = () => 'I am not a robot';
      setTimeout(() => inp.isConnected && inp.focus({ preventScroll: true }), 60);
    } else {
      const yes = h('button', { class: 'btn', type: 'button', text: s.yes, 'data-yes': '1' });
      const no = h('button', { class: 'btn alt', type: 'button', text: s.no, 'data-no': '1' });
      yes.addEventListener('click', () => {
        if (api.locked) return;
        sfx.select(); k++; render(); api.say(reactions[k] || '');
      });
      no.addEventListener('click', () => { if (!api.locked) api.fail(s.bad); });
      answers.append(...(s.shuffle && Math.random() < .5 ? [no, yes] : [yes, no]));
      S.answer = () => 'yes';
      setTimeout(() => yes.isConnected && yes.focus({ preventScroll: true }), 60);
    }
  }
  render();
}

const LEVELS = [
  { id: 'check',   name: 'Slippery checkbox', kicker: 'Quick check',        title: 'Tick the box',                        sub: 'It’s one checkbox.',                           mount: L_check },
  { id: 'fish',    name: 'Fish',              kicker: 'Image check',        title: 'Select every fish',                   sub: 'Click each one, then Verify.',                      mount: L_fish },
  { id: 'text',    name: 'Wobbly text',       kicker: 'Text check',         title: 'Type the wobbly letters',             sub: 'Don’t squint. Okay, squint.',                  mount: L_text },
  { id: 'rotate',  name: 'Upright picture',   kicker: 'Orientation check',  title: 'Rotate the picture upright',          sub: 'Drag it around, or use the arrows.',                mount: L_rotate },
  { id: 'lights',  name: 'Traffic lights',    kicker: 'Image check',        title: 'Select every traffic light',          sub: 'Click each one, then Verify.',                      mount: L_lights },
  { id: 'slider',  name: 'Exact dial',        kicker: 'Precision check',    title: 'Set the dial to exactly 73',          sub: 'Not 72. Not 74.',                                   mount: L_slider },
  { id: 'green',   name: 'Green bar',         kicker: 'Reflex check',       title: 'Click when it’s exactly green',  sub: 'Not almost green. Green.',                          mount: L_green },
  { id: 'feel',    name: 'Feelings',          kicker: 'Wellness check',     title: 'How are you feeling?',                sub: 'Be honest. Or don’t. We’re a captcha.',    mount: L_feel },
  { id: 'odd',     name: 'Odd emoji',         kicker: 'Pattern check',      title: 'Find the odd emoji out',              sub: 'One of them is lying.',                             mount: L_odd },
  { id: 'hold',    name: 'Hold 3 seconds',    kicker: 'Patience check',     title: 'Hold for exactly 3 seconds',          sub: 'Release at 3.0. We’ll hide the clock.',         mount: L_hold },
  { id: 'alpha',   name: 'Backwards alphabet', kicker: 'Brain check',       title: 'Type the alphabet backwards from M',  sub: 'M, then L, then… you know.',                   mount: L_alpha },
  { id: 'robots',  name: 'Robot hunt',        kicker: 'Image check',        title: 'Select every square with a robot',    sub: 'We only ask because we care.',                      mount: L_robots },
  { id: 'reverse', name: 'Reverse maths',     kicker: 'Reverse check',      title: 'Solve this instantly',                sub: 'Only a robot could. Allegedly.',                    mount: L_reverse },
  { id: 'still',   name: 'Doing nothing',     kicker: 'Discipline check',   title: 'Do absolutely nothing for 5 seconds', sub: 'Robots can’t resist clicking things.',         mount: L_still },
  { id: 'sure',    name: 'Final interview',   kicker: 'Final check',        title: 'Are you sure?',                       sub: '',                                                  mount: L_sure },
];

/* ---------- level lifecycle ---------- */
function enterLevel(i) {
  S.idx = i; S.lvStart = elapsed(); S.lvFails = 0;
  mountLevel();
}
function mountLevel() {
  clearLevel();
  const def = LEVELS[S.idx];
  S.locked = false; verifyBtn.disabled = false; verifyBtn.hidden = true;
  setHead(`Level ${S.idx + 1} of ${N} · ${def.kicker}`, def.title, def.sub, '');
  setMsg(S.lvFails ? 'Fresh start. Same test, new randomness.' : '');
  stage.textContent = '';
  stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
  const root = h('div', { class: 'lv lv-' + def.id });
  stage.append(root);
  S.root = root;
  const api = makeApi();
  S.api = api;
  def.mount(root, api);
  renderPips();
}

/* ---------- intro / verifying / finish ---------- */
function showIntro() {
  S.phase = 'intro'; clearLevel(); S.root = null; S.locked = false;
  document.body.classList.remove('playing');
  verifyBtn.hidden = true;
  setHead('Humanity check', 'Prove you’re human', 'Before you can continue.', '');
  setMsg('');
  renderPips();
  const best = store.get('best', null);
  const begin = h('button', { class: 'btn big', type: 'button', text: 'Begin verification', id: 'begin' });
  begin.addEventListener('click', startRun);
  stage.textContent = '';
  stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
  stage.append(h('div', { class: 'intro' },
    h('div', { html: '<svg class="biglogo" viewBox="0 0 48 48" aria-hidden="true"><use href="#logo"/></svg>' }),
    h('ul', {}, h('li', { text: '15 tests, getting sillier' }), h('li', { text: 'The clock runs the whole time' }), h('li', { text: 'A fail only resets that test' })),
    begin,
    h('div', { class: 'best', text: best != null ? `YOUR BEST · ${fmt(best)}` : 'NO TIME SET YET' })));
  begin.focus({ preventScroll: true });
}
function startRun() {
  Object.assign(S, { phase: 'play', acc: 0, fails: 0, lvTimes: [], pausedByVis: false, running: false, final: 0 });
  startClock();
  document.body.classList.add('playing');
  sfx.select();
  enterLevel(0);
}
function showVerifying() {
  stage.querySelector('.overlay')?.remove();
  const steps = ['Checking your cookies…', 'Consulting three hamsters…', 'Reading your aura…', 'Counting your fingers…'];
  const label = h('p', { class: 'oq', text: steps[0] });
  stage.append(h('div', { class: 'overlay' }, h('div', { class: 'spinner' }), label, h('div', { class: 'osub', text: 'one moment' })));
  let n = 0;
  const iv = setInterval(() => { n++; if (n < steps.length) label.textContent = steps[n]; }, 520);
  setTimeout(() => { clearInterval(iv); showFinish(); }, RM ? 900 : 2200);
}
function confetti() {
  if (RM) return;
  const r = card.getBoundingClientRect(), cv = h('canvas', { class: 'confetti' });
  cv.width = r.width; cv.height = r.height; card.append(cv);
  const g = cv.getContext('2d'), cols = ['#2d5bd8', '#17a34a', '#f59e0b', '#dc3c45', '#8b5cf6', '#06b6d4'];
  const ps = Array.from({ length: 130 }, () => ({ x: r.width / 2, y: r.height * .38, vx: (Math.random() - .5) * 13, vy: -Math.random() * 12 - 3, s: 4 + Math.random() * 5, c: pick(cols), a: Math.random() * 6, va: (Math.random() - .5) * .4 }));
  const t0 = performance.now();
  (function frame(now) {
    const t = now - t0;
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) { p.vy += .32; p.x += p.vx; p.y += p.vy; p.vx *= .992; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - t / 2600); g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    if (t < 2600) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;left:-999px', 'aria-hidden': 'true' }); ta.value = text;
    document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
function showFinish() {
  const t = S.final;
  const prev = store.get('best', null), isBest = prev == null || t < prev;
  if (isBest) store.set('best', t);
  store.set('runs', (store.get('runs', 0) || 0) + 1);
  Ballpark.report('robot', { score: Math.round(t * 10) / 10, label: `verified in ${mmss(t)}` });
  sfx.win(); confetti();

  let slow = 0; S.lvTimes.forEach((v, i) => { if (v > S.lvTimes[slow]) slow = i; });
  const slowName = LEVELS[slow].name, slowT = S.lvTimes[slow] || 0;
  const certNo = 'HUM-' + String(Math.floor(t * 137 + S.fails * 7919) % 100000).padStart(5, '0');
  const oops = S.fails === 0 ? 'no' : String(S.fails);

  setHead('Result', 'Verified human', 'Welcome to humanity. Population: you.', 'var(--green)');
  setMsg(S.fails === 0 ? 'Not a single fail. Are you SURE you’re not a robot?' : `${S.fails} ${S.fails === 1 ? 'oopsie' : 'oopsies'}, all of them very human.`, 'ok');
  stage.textContent = '';
  const copyBtn = h('button', { class: 'btn', type: 'button', text: 'Copy result' });
  const againBtn = h('button', { class: 'btn alt', type: 'button', text: 'Play again' });
  stage.append(h('div', { class: 'done' },
    h('div', { class: 'seal', html: '<svg viewBox="0 0 52 52" aria-hidden="true"><path d="M13 27l9 9 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
    h('div', { class: 'bigtime', text: fmt(t) }),
    h('div', { class: 'bt-sub', html: isBest ? '<b>New personal best!</b>' : `Your best: ${fmt(prev)}` }),
    h('div', { class: 'stats' },
      h('div', {}, h('b', { text: oops }), h('span', { text: 'oopsies' })),
      h('div', {}, h('b', { text: slowName }), h('span', { text: `slowest · ${Math.round(slowT)}s` })),
      h('div', {}, h('b', { text: `${N}/${N}` }), h('span', { text: 'tests passed' }))),
    h('div', { class: 'cert', text: `CERTIFICATE OF HUMANITY · ${certNo}` }),
    h('div', { class: 'row' }, copyBtn, againBtn)));
  const share = `NOT A ROBOT \u{1F916}\u{1F6AB}\nVerified human in ${mmss(t)} · ${oops} ${S.fails === 1 ? 'oopsie' : 'oopsies'}\nSlowest test: ${slowName} (${Math.round(slowT)}s)\n${SHARE_URL}`;
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(share);
    copyBtn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    if (!ok) setMsg(share.replace(/\n/g, '  '), '');
    setTimeout(() => { copyBtn.textContent = 'Copy result'; }, 1800);
  });
  againBtn.addEventListener('click', startRun);
  copyBtn.focus({ preventScroll: true });
  S.shareText = share;
}

// Small debug/test hook (used by the headless QA script): inspect state or jump to a level.
window.__robot = { S, N, LEVELS, go: i => { if (S.phase !== 'play') startRun(); enterLevel(i); } };
showIntro();
})();
