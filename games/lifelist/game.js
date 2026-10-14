// BEEN THERE — game logic. Data lives in items.js (window.BT_SECTIONS / window.BT_RANKS).
(function () {
  'use strict';

  const GAME = 'lifelist';
  const SECTIONS = window.BT_SECTIONS;
  const RANKS = window.BT_RANKS;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = window.Ballpark ? Ballpark.store(GAME) : { get: (k, f) => f, set() {} };
  const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------------------------------------------------------------- model */
  const BY_ID = new Map();
  SECTIONS.forEach(sec => {
    sec.items.forEach((it, i) => {
      BY_ID.set(sec.key + String(i + 1).padStart(2, '0'), { sec, emoji: it[0], text: it[1], big: !!(it[2] || sec.allBig) });
    });
  });
  const MAX = BY_ID.size;

  const savedIds = store.get('done', []);
  const done = new Set(Array.isArray(savedIds) ? savedIds.filter(id => BY_ID.has(id)) : []);
  let muted = !!store.get('muted', false);
  let filter = store.get('filter', 'all');
  if (!['all', 'todo', 'done'].includes(filter)) filter = 'all';

  const persist = () => store.set('done', [...done]);
  function report() {
    try { if (window.Ballpark) Ballpark.report(GAME, { score: done.size, max: MAX, label: `${done.size}/${MAX} done` }); } catch (e) { /* hub optional */ }
  }
  function rankIndex(n) { let r = 0; for (let i = 0; i < RANKS.length; i++) if (n >= RANKS[i].at) r = i; return r; }
  function secCount(sec) { let c = 0; sec.items.forEach((_, i) => { if (done.has(sec.key + String(i + 1).padStart(2, '0'))) c++; }); return c; }
  function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  /* --------------------------------------------------------------- render */
  const listEl = $('list');
  const refs = {};   // sectionKey -> { el, count, fill, rows:[{id, el}] }

  SECTIONS.forEach(sec => {
    const el = document.createElement('section');
    el.className = 'sec';
    el.id = 'sec-' + sec.key;
    el.style.setProperty('--c', sec.color);
    let rows = '';
    sec.items.forEach((it, i) => {
      const id = sec.key + String(i + 1).padStart(2, '0');
      rows += `<label class="row" data-id="${id}"><span class="emo" aria-hidden="true">${it[0]}</span>` +
        `<span class="txt">${esc(it[1])}</span><input type="checkbox" id="c-${id}">` +
        `<span class="box" aria-hidden="true"><svg viewBox="0 0 24 24"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></label>`;
    });
    el.innerHTML =
      `<div class="sec-head"><span class="sec-emoji" aria-hidden="true">${sec.emoji}</span>` +
      `<div class="sec-title"><h2>${esc(sec.name)}</h2><p>${esc(sec.sub)}</p></div><span class="sec-count"></span></div>` +
      `<div class="sec-bar"><i></i></div><div class="rows">${rows}</div>`;
    listEl.append(el);
    refs[sec.key] = {
      el, count: el.querySelector('.sec-count'), fill: el.querySelector('.sec-bar i'),
      rows: [...el.querySelectorAll('.row')].map(r => ({ id: r.dataset.id, el: r }))
    };
  });
  // apply saved ticks
  Object.values(refs).forEach(r => r.rows.forEach(({ id, el }) => {
    if (done.has(id)) { el.classList.add('done'); el.querySelector('input').checked = true; }
  }));

  const numEl = $('num'), barEl = $('bar'), barFill = $('barFill');
  const rankLine = $('rankLine'), rankEmoji = $('rankEmoji'), rankName = $('rankName'), rankNext = $('rankNext');
  $('max').textContent = MAX;
  barEl.setAttribute('aria-valuemax', MAX);

  function render(bump) {
    const n = done.size;
    numEl.textContent = n;
    if (bump) retrigger(numEl, 'bump');
    barFill.style.width = (n / MAX * 100) + '%';
    barEl.setAttribute('aria-valuenow', n);
    barEl.setAttribute('aria-valuetext', `${n} of ${MAX} things done`);
    const ri = rankIndex(n), r = RANKS[ri], nx = RANKS[ri + 1];
    rankEmoji.textContent = r.emoji;
    rankName.textContent = r.name;
    rankNext.textContent = nx ? `· ${nx.at - n} more for ${nx.name} ${nx.emoji}` : '· every last one!';
    SECTIONS.forEach(sec => {
      const c = secCount(sec), t = sec.items.length, ref = refs[sec.key];
      ref.count.textContent = `${c}/${t}`;
      ref.fill.style.width = (c / t * 100) + '%';
      ref.el.classList.toggle('complete', c === t);
    });
    $('fAll').textContent = MAX;
    $('fTodo').textContent = MAX - n;
    $('fDone').textContent = n;
  }

  /* --------------------------------------------------------------- filter */
  const emptyEl = $('empty');
  let filterTimer = 0;
  function applyFilter() {
    let any = false;
    SECTIONS.forEach(sec => {
      let vis = 0;
      refs[sec.key].rows.forEach(({ id, el }) => {
        const d = done.has(id);
        const show = filter === 'all' || (filter === 'done' ? d : !d);
        el.hidden = !show;
        if (show) vis++;
      });
      refs[sec.key].el.hidden = vis === 0;
      if (vis) any = true;
    });
    emptyEl.hidden = any;
    emptyEl.textContent = filter === 'todo' ? 'You have done every single thing. Absolute legend.' : 'Nothing ticked yet. Go and do something wonderful!';
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.f === filter)));
  }
  function scheduleFilter() {
    if (filter === 'all') return;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilter, 800);   // let the pop finish before the row disappears
  }
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    filter = c.dataset.f;
    store.set('filter', filter);
    clearTimeout(filterTimer);
    applyFilter();
    const top = listEl.getBoundingClientRect().top + window.scrollY - 120;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: RM.matches ? 'auto' : 'smooth' });
  }));

  /* ---------------------------------------------------------------- audio */
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null;
  function ac() {
    if (muted || !AC) return null;
    try {
      if (!actx) actx = new AC();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tone(freq, at, dur, type, vol, slideTo) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const PENT = [0, 2, 4, 7, 9];
  const sfx = {
    tick(n) {   // climbs a pentatonic scale as you tick, so spam-ticking sounds like a little tune
      const semis = PENT[n % 5] + 12 * (Math.floor(n / 5) % 2);
      const f = 392 * Math.pow(2, semis / 12);
      tone(f, 0, 0.17, 'triangle', 0.16);
      tone(f * 2, 0, 0.09, 'sine', 0.05);
    },
    untick() { tone(280, 0, 0.13, 'sine', 0.11, 170); },
    big() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.24, 'triangle', 0.14)); },
    rank() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.13)); },
    finale() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.4, 'triangle', 0.14)); }
  };
  const muteBtn = $('muteBtn');
  function paintMute() {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  }
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    store.set('muted', muted);
    paintMute();
    if (!muted) sfx.tick(0);
  });
  paintMute();

  /* ------------------------------------------------------------- confetti */
  const cv = $('fx'), cx = cv.getContext('2d');
  const COLORS = ['#ff6b4a', '#ffc83d', '#2fb67a', '#3b9cf5', '#8b5cf6', '#ee5c8a', '#14b8c4'];
  let parts = [], raf = 0, lastT = 0;
  function sizeCanvas() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cx.setTransform(d, 0, 0, d, 0, 0);
  }
  window.addEventListener('resize', () => { if (parts.length) sizeCanvas(); });
  function startLoop() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
  function burst(x, y, n, o) {
    if (RM.matches) return;
    o = o || {};
    sizeCanvas();
    const spread = o.spread == null ? Math.PI * 2 : o.spread, dir = o.dir == null ? -Math.PI / 2 : o.dir;
    const pow = o.power || 560, life = o.life || 1.3, colors = o.colors || COLORS;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, sp = pow * (0.35 + Math.random() * 0.65);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 16,
        life: life * (0.6 + Math.random() * 0.8), c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.3
      });
    }
    startLoop();
  }
  function rain(ms) {
    if (RM.matches) return;
    sizeCanvas();
    const end = performance.now() + ms;
    const iv = setInterval(() => {
      for (let i = 0; i < 7; i++) {
        parts.push({
          x: Math.random() * innerWidth, y: -12, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 240,
          w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12,
          life: 2.6 + Math.random(), c: COLORS[(Math.random() * COLORS.length) | 0], round: Math.random() < 0.3
        });
      }
      startLoop();
      if (performance.now() > end) clearInterval(iv);
    }, 90);
  }
  function tick(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000); lastT = t;
    cx.clearRect(0, 0, innerWidth, innerHeight);
    const drag = Math.max(0, 1 - 2.2 * dt);
    parts = parts.filter(p => {
      p.life -= dt;
      if (p.life <= 0 || p.y > innerHeight + 40) return false;
      p.vy += 900 * dt; p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      cx.save();
      cx.globalAlpha = Math.min(1, p.life / 0.35);
      cx.translate(p.x, p.y); cx.rotate(p.rot);
      cx.fillStyle = p.c;
      if (p.round) { cx.beginPath(); cx.arc(0, 0, p.h * 0.8, 0, 6.283); cx.fill(); }
      else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
      return true;
    });
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = 0; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* ---------------------------------------------------------------- toast */
  const toastEl = $('toast');
  const toastQ = [];
  let toastBusy = false, toastKind = '', tA = 0, tB = 0;
  function showToast(msg, ms, kind) {
    toastBusy = true; toastKind = kind;
    clearTimeout(tA); clearTimeout(tB);
    toastEl.hidden = true; void toastEl.offsetWidth;
    toastEl.classList.remove('out');
    toastEl.textContent = msg;
    toastEl.hidden = false;
    tA = setTimeout(() => {
      toastEl.classList.add('out');
      tB = setTimeout(() => {
        toastEl.hidden = true; toastEl.classList.remove('out');
        const nx = toastQ.shift();
        if (nx) showToast(nx.msg, nx.ms, nx.kind); else { toastBusy = false; toastKind = ''; }
      }, 260);
    }, ms);
  }
  // kinds: 'info' (default) replaces whatever is showing; 'cele' (section / title celebrations) replaces
  // an info toast but queues politely behind another celebration; 'finale' replaces everything.
  function toast(msg, ms, kind) {
    ms = ms || 2300; kind = kind || 'info';
    if (kind === 'cele' && toastBusy && toastKind === 'cele') { toastQ.push({ msg, ms, kind }); return; }
    toastQ.length = 0;
    showToast(msg, ms, kind);
  }

  /* ----------------------------------------------------------- toggle row */
  function onToggle(row, on) {
    const id = row.dataset.id, item = BY_ID.get(id);
    const rankBefore = rankIndex(done.size);
    if (on) done.add(id); else done.delete(id);
    row.classList.toggle('done', on);
    persist();
    render(true);
    report();
    scheduleFilter();
    if (!on) { sfx.untick(); return; }

    const box = row.querySelector('.box'), emo = row.querySelector('.emo');
    retrigger(box, 'pop');
    retrigger(emo, 'wiggle');
    const r = box.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const n = done.size, sec = item.sec;
    const secDone = secCount(sec) === sec.items.length;
    const rankNow = rankIndex(n);

    burst(x, y, 9, { power: 250, life: 0.55, colors: [sec.color, '#ffc83d', '#ffffff'] });   // little sparkle for every tick
    if (item.big) burst(x, y, 56, { spread: 2.7, power: 780, life: 1.5 });                   // confetti fountain for big moments

    if (n === MAX) {
      sfx.finale();
      burst(innerWidth / 2, innerHeight * 0.4, 120, { power: 900, life: 1.8 });
      rain(2800);
      toast(`🌈 ${MAX} of ${MAX}! You are officially ${RANKS[rankNow].name}.`, 4200, 'finale');
      return;
    }
    if (secDone) {
      burst(innerWidth / 2, Math.min(y, innerHeight * 0.55), 90, { spread: 3.4, power: 820, life: 1.6 });
      sfx.big();
      toast(`${sec.emoji} ${sec.name} complete!`, 2200, 'cele');
    } else if (item.big) {
      sfx.big();
    } else {
      sfx.tick(n);
    }
    if (rankNow > rankBefore) {
      const rk = RANKS[rankNow];
      burst(innerWidth / 2, 80, 70, { spread: Math.PI, dir: Math.PI / 2, power: 560, life: 1.5 });
      retrigger(rankLine, 'rankup');
      if (!secDone) sfx.rank();
      toast(`New title: ${rk.emoji} ${rk.name}`, 2600, 'cele');
    }
  }

  listEl.addEventListener('change', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    const row = input.closest('.row');
    if (row) onToggle(row, input.checked);
  });

  // keyboard: arrows / Home / End hop between rows, Enter ticks (Space already does natively)
  listEl.addEventListener('keydown', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (e.key === 'Enter') { e.preventDefault(); input.click(); return; }
    const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    const all = [...listEl.querySelectorAll('.row:not([hidden]) input')];
    const i = all.indexOf(input);
    let next = keys[e.key] === 'first' ? all[0] : keys[e.key] === 'last' ? all[all.length - 1] : all[i + keys[e.key]];
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'center', behavior: 'auto' }); }
  });

  /* ---------------------------------------------------------------- share */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall through to the old way */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-100px;left:0;opacity:0';
      document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  const shareBtn = $('shareBtn');
  let shareTimer = 0;
  shareBtn.addEventListener('click', async () => {
    const text = `I've done ${done.size}/${MAX} things on Been There ✅`;
    const ok = await copyText(text);
    clearTimeout(shareTimer);
    shareBtn.textContent = ok ? '✅ Copied!' : '📋 Share my list';
    shareTimer = setTimeout(() => { shareBtn.textContent = '📋 Share my list'; }, 1800);
    toast(ok ? 'Copied! Paste it anywhere to show off.' : `Could not copy. Here it is: ${text}`, ok ? 2000 : 4500);
    if (ok) { sfx.big(); }
    const r = shareBtn.getBoundingClientRect();
    if (ok) burst(r.left + r.width / 2, r.top, 22, { spread: 2.2, power: 520, life: 1.1 });
  });

  /* ---------------------------------------------------------------- reset */
  const modal = $('modal'), mCancel = $('mCancel'), mOk = $('mOk'), resetBtn = $('resetBtn');
  let lastFocus = null;
  function openModal() {
    if (!done.size) { toast('Nothing to reset yet. Your list is already fresh!', 2200); return; }
    $('mText').textContent = `This wipes all ${done.size} thing${done.size === 1 ? '' : 's'} you've ticked. It cannot be undone.`;
    lastFocus = document.activeElement;
    modal.hidden = false;
    mCancel.focus();
  }
  function closeModal() {
    modal.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function doReset() {
    done.clear();
    Object.values(refs).forEach(r => r.rows.forEach(({ el }) => { el.classList.remove('done'); el.querySelector('input').checked = false; }));
    persist(); render(true); report();
    clearTimeout(filterTimer); applyFilter();
    closeModal();
    toast('Fresh start! Go and collect some stories. 🌱', 2600);
    window.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' });
  }
  resetBtn.addEventListener('click', openModal);
  mCancel.addEventListener('click', closeModal);
  mOk.addEventListener('click', doReset);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    else if (e.key === 'Tab') {   // keep focus inside the dialog
      e.preventDefault();
      (document.activeElement === mCancel ? mOk : mCancel).focus();
    }
  });

  /* ----------------------------------------------------------------- boot */
  render(false);
  applyFilter();
})();
