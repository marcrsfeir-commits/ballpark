// BALLPARK shared helpers (classic script, no build step).
// Every game page includes:  <script src="../../shared/bp.js"></script>
// It adds a small "◂ BALLPARK" pill linking back to the hub, and exposes window.Ballpark:
//   Ballpark.report(gameId, { score, max, label })  -> shows today's result on the hub card
//   Ballpark.today()                                  -> 'YYYY-MM-DD' (local date)
//   Ballpark.dayNumber(epoch)                         -> daily puzzle number (1 on epoch day)
//   Ballpark.dateForDay(n, epoch)                     -> Date of puzzle n
//   Ballpark.rng(seed)                                -> seeded random() for deterministic dailies
//   Ballpark.store(gameId)                            -> { get(key, fallback), set(key, value) } namespaced localStorage
// Put data-bp-pos="br" | "tl" | "tr" on <body> to move the pill (default bottom-left).
(function () {
  const STATUS = 'ballpark.status';
  const pad = n => String(n).padStart(2, '0');
  const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function safeGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  }
  function safeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }

  function report(game, data) {
    const all = safeGet(STATUS, {});
    all[game] = { ...data, date: today(), at: Date.now() };
    safeSet(STATUS, all);
    const days = safeGet('ballpark.days', []);           // drives the hub's overall streak
    if (!days.includes(today())) { days.push(today()); safeSet('ballpark.days', days.slice(-400)); }
  }
  function dayNumber(epoch = '2026-09-15', d = new Date()) {
    const [y, m, dd] = epoch.split('-').map(Number);
    const e = Date.UTC(y, m - 1, dd), t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor((t - e) / 86400000) + 1;
  }
  function dateForDay(n, epoch = '2026-09-15') {
    const [y, m, dd] = epoch.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, dd) + (n - 1) * 86400000);
    return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }
  function rng(seed) {
    let h = 2166136261;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function store(game) {
    const k = key => `ballpark.${game}.${key}`;
    return { get: (key, fallback) => safeGet(k(key), fallback), set: (key, value) => safeSet(k(key), value) };
  }

  function injectPill() {
    if (document.querySelector('.bp-back')) return;
    const pos = document.body.dataset.bpPos || 'bl';
    const a = document.createElement('a');
    a.className = 'bp-back';
    a.href = '../../index.html';
    a.textContent = '◂ BALLPARK';
    a.title = 'Back to all games';
    const v = pos[0] === 't' ? 'top:10px' : 'bottom:10px';
    const hz = pos[1] === 'r' ? 'right:10px' : 'left:10px';
    a.style.cssText = `position:fixed;${v};${hz};z-index:2147483000;font:700 10px/1 "Cascadia Mono",Consolas,monospace;letter-spacing:.18em;` +
      'padding:7px 11px;border-radius:999px;background:rgba(8,12,22,.78);color:#fff;border:1px solid rgba(255,255,255,.28);' +
      'text-decoration:none;opacity:.72;backdrop-filter:blur(4px);transition:opacity .15s';
    a.onmouseenter = () => { a.style.opacity = '1'; };
    a.onmouseleave = () => { a.style.opacity = '.72'; };
    document.body.append(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectPill);
  else injectPill();

  window.Ballpark = { report, today, dayNumber, dateForDay, rng, store, status: () => safeGet(STATUS, {}) };
})();
