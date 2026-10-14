// BALLPARK hub: game cards with today's status pulled from what each game reported.
import { pixelText } from './games/krilldive/js/font.js';

const GAMES = [
  {
    id: 'krilldive', name: 'KRILLDIVE', path: 'games/krilldive/', insp: 'inspired by Krillion',
    blurb: 'Name the rarest answer you can. Obvious ones float — rare ones sink to the trench.',
    bg: 'linear-gradient(160deg,#1c4a75 0%,#0b1d31 55%,#050b14 100%)', accent: '#ff4f8b', glow: 'rgba(70,211,240,.35)',
    art: '<img src="games/krilldive/assets/icon-256.png" alt="">',
  },
  {
    id: 'jarful', name: 'JARFUL', path: 'games/jarful/', insp: 'inspired by Amountle',
    blurb: 'Things pour into a jar. You get fifteen seconds to say how many.',
    bg: 'linear-gradient(160deg,#1a1430 0%,#0b0a12 70%)', accent: '#a78bfa', glow: 'rgba(167,139,250,.4)',
    art: `<svg viewBox="0 0 90 90" aria-hidden="true"><defs><radialGradient id="b1" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9a5ff"/></radialGradient><radialGradient id="b2" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ff9ad5"/></radialGradient></defs>
      <path d="M22 18h46l-4 64H26z" fill="rgba(255,255,255,.06)" stroke="#d9ccff" stroke-width="2.5"/><ellipse cx="45" cy="18" rx="23" ry="5" fill="none" stroke="#d9ccff" stroke-width="2.5"/>
      ${[[34,72],[46,73],[57,71],[40,62],[52,62],[30,62],[60,61],[35,52],[47,52],[57,51],[42,42],[53,40],[45,22]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="6" fill="url(#${i%3?'b1':'b2'})"/>`).join('')}</svg>`,
  },
  {
    id: 'napkin', name: 'NAPKIN', path: 'games/napkin/', insp: 'inspired by Fermi.gg',
    blurb: 'Three huge estimates a day. How many, how far, how heavy? Napkin math only.',
    bg: 'linear-gradient(160deg,#f0533f 0%,#c8392a 100%)', accent: '#fff3c4', onAccent: '#7a1d12', glow: 'rgba(255,255,255,.25)',
    art: `<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M10 14 L84 8 L90 66 L16 72 Z" fill="#fbf7ee"/><path d="M10 14 L84 8 L90 66 L16 72 Z" fill="none" stroke="#e7dfcf" stroke-width="2"/>
      <g stroke="#2b2b2b" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M24 30 h14 M31 23 v14"/><path d="M46 30 l8 0"/><path d="M60 24 l8 12 M68 24 l-8 12"/><path d="M24 52 q6 -8 12 0 t12 0"/><path d="M56 50 h22"/><path d="M58 58 h18"/></g>
      <path d="M70 70 L92 20 L97 23 L75 73 Z" fill="#ffc94a"/><path d="M70 70 l-2 7 l7 -4 z" fill="#2b2b2b"/></svg>`,
  },
  {
    id: 'oddhue', name: 'ODD HUE', path: 'games/oddhue/', insp: 'inspired by the HSL Color Game',
    blurb: 'Six blocks, one is a shade off. Find it — they get closer every time.',
    bg: 'linear-gradient(160deg,#ffffff 0%,#eceaf8 100%)', fg: '#16161d', accent: '#5b5bd6', glow: 'rgba(91,91,214,.18)',
    art: `<svg viewBox="0 0 96 66" aria-hidden="true">${[0,1,2,3,4,5].map(i=>`<rect x="${4+(i%3)*31}" y="${4+Math.floor(i/3)*31}" width="27" height="27" rx="5" fill="${i===4?'#7474ea':'#5b5bd6'}"/>`).join('')}</svg>`,
  },
  {
    id: 'toscale', name: 'TO SCALE', path: 'games/toscale/', insp: 'inspired by Size It Up',
    blurb: 'Stretch the silhouette to its real size. Is a toucan bigger than a tennis racket?',
    bg: 'linear-gradient(160deg,#16213f 0%,#0b1020 70%)', accent: '#e5212e', glow: 'rgba(106,168,255,.3)',
    art: `<svg viewBox="0 0 110 80" aria-hidden="true"><line x1="2" y1="76" x2="108" y2="76" stroke="#3f5aa0" stroke-width="2"/>
      <path d="M8 76 l4-16 q2-8 9-9 l8-1 q5 0 6 5 l2 21z" fill="#6aa8ff"/><circle cx="31" cy="44" r="5" fill="#6aa8ff"/>
      <path d="M52 76 v-10 q0-14 10-22 q8-8 18-9 q12 0 18 10 q4 7 2 14 v17 h-6 v-12 h-28 v12z" fill="#e5212e"/><path d="M96 26 l8-8 M98 18 h6 v6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'circle', name: 'CIRCLE UP', path: 'games/circle/', insp: 'inspired by neal.fun',
    blurb: 'Draw a perfect circle around the dot. Freehand. How round can you go?',
    bg: 'linear-gradient(160deg,#151922 0%,#0b0d12 100%)', accent: '#34d399', glow: 'rgba(52,211,153,.3)',
    art: `<svg viewBox="0 0 90 90" aria-hidden="true"><path d="M45 12 C66 12 79 27 78 46 C77 66 62 79 44 78 C25 77 12 63 13 44 C14 26 27 13 47 13" fill="none" stroke="url(#cg1)" stroke-width="6" stroke-linecap="round"/><defs><linearGradient id="cg1" x1="0" x2="1"><stop offset="0" stop-color="#34d399"/><stop offset=".6" stop-color="#fde047"/><stop offset="1" stop-color="#f87171"/></linearGradient></defs><circle cx="45" cy="45" r="3.5" fill="#fff"/></svg>`,
  },
  {
    id: 'spender', name: 'BIG SPENDER', path: 'games/spender/', insp: 'inspired by neal.fun',
    blurb: 'You just inherited $100 billion. Spend every cent — yachts, tanks, football clubs.',
    bg: 'linear-gradient(160deg,#22c55e 0%,#15803d 100%)', accent: '#fff', onAccent: '#15803d', glow: 'rgba(255,255,255,.25)',
    art: `<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="10" y="22" width="70" height="40" rx="6" fill="#d9f99d" transform="rotate(-8 45 42)"/><rect x="18" y="18" width="70" height="40" rx="6" fill="#ecfccb" stroke="#166534" stroke-width="2"/><circle cx="53" cy="38" r="11" fill="none" stroke="#166534" stroke-width="2.5"/><text x="53" y="44" font-size="16" font-weight="800" text-anchor="middle" fill="#166534" font-family="Arial">$</text></svg>`,
  },
  {
    id: 'password', name: 'PASSWORD PANIC', path: 'games/password/', insp: 'inspired by neal.fun',
    blurb: 'Pick a password. Then a planet. Then a leap year. Then a fish. It never ends.',
    bg: 'linear-gradient(160deg,#fbfaf6 0%,#ece9df 100%)', fg: '#1b1b1f', accent: '#e5484d', glow: 'rgba(229,72,77,.15)',
    art: `<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="8" y="26" width="84" height="30" rx="8" fill="#fff" stroke="#1b1b1f" stroke-width="3"/><text x="16" y="47" font-size="15" font-weight="700" fill="#1b1b1f" font-family="Consolas,monospace">May#🐟144</text><rect x="20" y="62" width="60" height="10" rx="3" fill="#e5484d"/><rect x="20" y="10" width="60" height="10" rx="3" fill="#30a46c"/></svg>`,
  },
  {
    id: 'fuse', name: 'FUSE', path: 'games/fuse/', insp: 'inspired by Infinite Craft',
    blurb: 'Water + Fire = Steam. Start with four elements and fuse your way to thousands of things.',
    bg: 'linear-gradient(160deg,#ffffff 0%,#eef0ff 100%)', fg: '#1d1d22', accent: '#6366f1', glow: 'rgba(99,102,241,.18)',
    art: `<svg viewBox="0 0 110 80" aria-hidden="true"><rect x="4" y="12" width="44" height="22" rx="6" fill="#fff" stroke="#c9c9d3"/><text x="10" y="28" font-size="12" font-family="Segoe UI Emoji,sans-serif">💧</text><text x="24" y="28" font-size="10" font-weight="700" font-family="Segoe UI,sans-serif" fill="#1d1d22">Water</text>
      <rect x="60" y="12" width="40" height="22" rx="6" fill="#fff" stroke="#c9c9d3"/><text x="65" y="28" font-size="12" font-family="Segoe UI Emoji,sans-serif">🔥</text><text x="79" y="28" font-size="10" font-weight="700" font-family="Segoe UI,sans-serif" fill="#1d1d22">Fire</text>
      <rect x="28" y="48" width="52" height="24" rx="6" fill="#eef0ff" stroke="#6366f1" stroke-width="2"/><text x="34" y="65" font-size="12" font-family="Segoe UI Emoji,sans-serif">💨</text><text x="49" y="65" font-size="10" font-weight="700" font-family="Segoe UI,sans-serif" fill="#1d1d22">Steam</text></svg>`,
  },
  {
    id: 'auction', name: 'GOING ONCE', path: 'games/auction/', insp: 'inspired by neal.fun',
    blurb: 'Ruby slippers, a T. rex, Lennon\'s tooth. Guess what famous lots really sold for.',
    bg: 'linear-gradient(160deg,#f5efe3 0%,#e7dcc4 100%)', fg: '#2a2118', accent: '#2a2118', onAccent: '#f5d77e', glow: 'rgba(201,162,74,.3)',
    art: `<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="22" y="6" width="56" height="56" rx="3" fill="url(#gf)"/><rect x="29" y="13" width="42" height="42" fill="#fffdf7"/><text x="50" y="44" font-size="24" text-anchor="middle" font-family="Segoe UI Emoji,sans-serif">👠</text><defs><linearGradient id="gf" x1="0" x2="1"><stop offset="0" stop-color="#c9a24a"/><stop offset=".5" stop-color="#f5d77e"/><stop offset="1" stop-color="#b8892c"/></linearGradient></defs><text x="82" y="76" font-size="20" font-family="Segoe UI Emoji,sans-serif">🔨</text></svg>`,
  },
  {
    id: 'lifelist', name: 'BEEN THERE', path: 'games/lifelist/', insp: 'inspired by neal.fun',
    blurb: '200 things to do in a lifetime. Tick off the ones you\'ve done and see what you\'re missing.',
    bg: 'linear-gradient(160deg,#fff7ed 0%,#ffedd5 100%)', fg: '#3b2a1a', accent: '#f97316', glow: 'rgba(249,115,22,.2)',
    art: `<svg viewBox="0 0 90 80" aria-hidden="true">${[0, 1, 2].map(i => `<rect x="10" y="${10 + i * 22}" width="16" height="16" rx="4" fill="${i < 2 ? '#f97316' : '#fff'}" stroke="#f97316" stroke-width="2"/>${i < 2 ? `<path d="M13 ${18 + i * 22} l4 4 l7 -8" stroke="#fff" stroke-width="2.5" fill="none"/>` : ''}<rect x="34" y="${14 + i * 22}" width="${44 - i * 8}" height="8" rx="4" fill="#fdba74"/>`).join('')}</svg>`,
  },
  {
    id: 'trolley', name: 'TROLLEY TROUBLE', path: 'games/trolley/', insp: 'inspired by neal.fun',
    blurb: 'Pull the lever or don\'t. 28 ridiculous dilemmas, one questionable conscience.',
    bg: 'linear-gradient(160deg,#fefce8 0%,#fde68a 100%)', fg: '#292524', accent: '#292524', onAccent: '#fde68a', glow: 'rgba(250,204,21,.3)',
    art: `<svg viewBox="0 0 110 80" aria-hidden="true"><path d="M2 60 H50 L100 30 M50 60 H108" stroke="#292524" stroke-width="3" fill="none"/><rect x="10" y="44" width="26" height="14" rx="3" fill="#ef4444"/><circle cx="16" cy="60" r="3" fill="#292524"/><circle cx="30" cy="60" r="3" fill="#292524"/><line x1="50" y1="60" x2="58" y2="44" stroke="#292524" stroke-width="3"/><circle cx="58" cy="43" r="3.5" fill="#ef4444"/><text x="86" y="27" font-size="14" font-family="Segoe UI Emoji,sans-serif">🦆</text><text x="94" y="56" font-size="14" font-family="Segoe UI Emoji,sans-serif">🧦</text></svg>`,
  },
  {
    id: 'robot', name: 'NOT A ROBOT', path: 'games/robot/', insp: 'inspired by neal.fun',
    blurb: 'Prove you\'re human. Then prove it again. And again. The captcha is getting suspicious.',
    bg: 'linear-gradient(160deg,#f8fafc 0%,#e2e8f0 100%)', fg: '#0f172a', accent: '#2563eb', glow: 'rgba(37,99,235,.18)',
    art: `<svg viewBox="0 0 110 80" aria-hidden="true"><rect x="6" y="20" width="98" height="40" rx="4" fill="#fff" stroke="#cbd5e1" stroke-width="2"/><rect x="16" y="30" width="20" height="20" rx="3" fill="#fff" stroke="#94a3b8" stroke-width="2"/><path d="M19 40 l5 5 l9 -11" stroke="#22c55e" stroke-width="3" fill="none"/><text x="44" y="45" font-size="10" font-weight="700" font-family="Segoe UI,sans-serif" fill="#0f172a">I'm not a robot</text><text x="86" y="16" font-size="16" font-family="Segoe UI Emoji,sans-serif">🤖</text></svg>`,
  },
];

const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const read = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };

const title = document.getElementById('title');
const drawTitle = () => title.replaceChildren(pixelText('BALLPARK', { px: innerWidth < 520 ? 5 : 8, color: '#ffc94a', shadow: '#7a4b00' }));
drawTitle();
addEventListener('resize', drawTitle);

function render() {
  const status = read('ballpark.status', {});
  const t = today();
  let done = 0;
  const wrap = document.getElementById('games');
  wrap.replaceChildren();
  for (const g of GAMES) {
    const s = status[g.id];
    const playedToday = s && s.date === t;
    if (playedToday) done++;
    const a = document.createElement('a');
    a.className = 'card';
    a.href = g.path;
    a.style.cssText = `--bg:${g.bg};--fg:${g.fg || '#fff'};--accent:${g.accent};--on-accent:${g.onAccent || (g.fg ? '#fff' : '#0b0b10')};--glow:${g.glow}`;
    a.innerHTML = `${playedToday ? '<span class="tick" title="Played today">✓</span>' : ''}
      <div class="art">${g.art}</div>
      <h2>${g.name}</h2>
      <p>${g.blurb}</p>
      <div class="insp">${g.insp}</div>
      <div class="meta"><span class="status ${playedToday ? 'done' : ''}">${playedToday ? `TODAY · ${s.label || s.score}` : 'NOT PLAYED TODAY'}</span><span class="play">${playedToday ? 'AGAIN' : 'PLAY'} ▸</span></div>`;
    wrap.append(a);
  }
  // scorecard tile: copy every result from today in one go
  const card = document.createElement('div');
  card.className = 'card scorecard';
  card.style.cssText = '--bg:linear-gradient(160deg,#10161d,#07090c);--fg:#f3f1e7;--accent:#ffc94a;--on-accent:#1a1200;--glow:rgba(255,201,74,.18)';
  const lines = GAMES.map(g => { const s = status[g.id]; return `${g.name.padEnd(10, ' ')} ${s && s.date === t ? s.label || s.score : '—'}`; });
  card.innerHTML = `<div class="art"><svg viewBox="0 0 90 80" aria-hidden="true"><rect x="6" y="6" width="78" height="68" rx="6" fill="#05080b" stroke="#2a3440" stroke-width="3"/>
      ${[0, 1, 2, 3, 4].map(i => `<rect x="14" y="${14 + i * 11}" width="34" height="6" rx="2" fill="#2a3440"/><rect x="56" y="${14 + i * 11}" width="20" height="6" rx="2" fill="${i < done ? '#ffc94a' : '#3a2f12'}"/>`).join('')}</svg></div>
    <h2>SCORECARD</h2><pre class="lines">${lines.join('\n')}</pre>
    <div class="meta"><span class="status">${done ? `${done} PLAYED TODAY` : 'PLAY A GAME FIRST'}</span><button class="play" type="button">COPY ▸</button></div>`;
  card.querySelector('button').onclick = () => {
    const text = `BALLPARK · ${t}\n${lines.join('\n')}`;
    navigator.clipboard?.writeText(text).then(() => { card.querySelector('button').textContent = 'COPIED ✓'; });
  };
  wrap.append(card);
  document.getElementById('todayCount').textContent = `${done} / ${GAMES.length}`;
  const days = new Set(read('ballpark.days', []));
  let streak = 0;
  const d = new Date();
  if (!days.has(today(d))) d.setDate(d.getDate() - 1);
  while (days.has(today(d))) { streak++; d.setDate(d.getDate() - 1); }
  document.getElementById('streak').textContent = streak;
  document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}
render();
addEventListener('pageshow', render);
addEventListener('storage', render);
