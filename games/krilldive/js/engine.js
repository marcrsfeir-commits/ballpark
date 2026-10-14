// Game rules, prompt selection, answer matching and saved progress.

export const TIERS = {
  plankton:  { name: 'PLANKTON',          score: 10,  color: '#cfe3f2', blurb: 'Everyone and their gran said this one.' },
  tooclever: { name: 'TOO CLEVER',        score: 15,  color: '#ff9f43', blurb: 'Felt clever, right? The whole school had the same idea.' },
  schooler:  { name: 'SCHOOLER',          score: 30,  color: '#4fd1ff', blurb: "Solid pick. You're swimming with the school." },
  rare:      { name: 'RARE',              score: 60,  color: '#ff4d5e', blurb: 'Properly uncommon. Nice pull.' },
  deepcut:   { name: 'DEEP CUT',          score: 85,  color: '#b38cff', blurb: 'A real deep cut. Barely anyone swims down here.' },
  krillion:  { name: 'ONE IN A KRILLION', score: 100, color: '#ffd23f', blurb: 'The rarest catch in the whole ocean.' },
};
export const TIER_ORDER = ['plankton', 'tooclever', 'schooler', 'rare', 'deepcut', 'krillion'];
export const ROUNDS = 7;
export const M_PER_POINT = 10;
export const MAX_SCORE = 700;
export const DAILY_EPOCH = Date.UTC(2026, 8, 15); // Dive #1 = 15 Sep 2026

export const BEARING = [
  { min: 0,   max: 150, tier: 'plankton', text: 'Plankton. Still plenty of ocean below you.' },
  { min: 151, max: 250, tier: 'schooler', text: 'Schooler. Cruising with the crowd.' },
  { min: 251, max: 350, tier: 'rare',     text: 'Rare. Under the thermocline — nice.' },
  { min: 351, max: 449, tier: 'deepcut',  text: 'Deep cut. A seriously deep dive.' },
  { min: 450, max: 700, tier: 'krillion', text: 'One in a krillion. Trench dweller. Absurd.' },
];
export const bearingFor = s => BEARING.find(b => s >= b.min && s <= b.max) || BEARING[0];

// ---------- seeded randomness ----------
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, seed) {
  const r = rng(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- dates ----------
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function diveNumberFor(d = new Date()) {
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((local - DAILY_EPOCH) / 86400000) + 1;
}
export function dateForDive(n) {
  const t = new Date(DAILY_EPOCH + (n - 1) * 86400000);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

// ---------- data ----------
export class Library {
  constructor(packs) {
    this.packs = packs;
    this.all = [];
    for (const p of packs) p.chapters.forEach((ch, ci) => ch.forEach(q => { q.pack = p.id; q.chapter = ci; this.all.push(q); }));
    this.byId = new Map(this.all.map(q => [q.id, q]));
  }
  pack(id) { return this.packs.find(p => p.id === id); }
  // Walk a seeded permutation of every prompt, 7 per game; reshuffle each full cycle.
  _cycled(tag, n) {
    const per = Math.max(1, Math.floor(this.all.length / ROUNDS));
    const cycle = Math.floor((n - 1) / per), slot = (n - 1) % per;
    const perm = shuffled(this.all.map(q => q.id), `${tag}:${cycle}`);
    return perm.slice(slot * ROUNDS, slot * ROUNDS + ROUNDS).map(id => this.byId.get(id));
  }
  daily(n) { return this._cycled('daily', n); }
  endless(n) { return this._cycled('endless', n); }
  // Endless games: never repeat a prompt until every prompt has been seen.
  // Unseen prompts first (one per pack where possible), then the least-recently seen ones.
  fresh(seen = {}) {
    const order = this.all.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0));
    const picked = [], packs = new Set();
    const take = q => { picked.push(q); packs.add(q.pack); };
    for (const q of order) if (picked.length < ROUNDS && !seen[q.id] && !packs.has(q.pack)) take(q);
    for (const q of order) if (picked.length < ROUNDS && !seen[q.id] && !picked.includes(q)) take(q);
    for (const q of order) if (picked.length < ROUNDS && !picked.includes(q) && !packs.has(q.pack)) take(q);
    for (const q of order) if (picked.length < ROUNDS && !picked.includes(q)) take(q);
    return picked;
  }
  unseenCount(seen = {}) { return this.all.filter(q => !seen[q.id]).length; }
  chapter(packId, ci) { return this.pack(packId)?.chapters[ci] || []; }
}

// ---------- matching ----------
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'de', 'la', 'le', 'el', 'von', 'van', 'mr', 'mrs', 'dr', 'st', 'saint', 'king', 'queen', 'lord', 'lady', 'sir', 'new', 'great', 'big', 'little', 'red', 'black', 'white', 'green', 'blue', 'old',
  'north', 'south', 'east', 'west', 'central', 'united', 'republic', 'san', 'santa', 'los', 'las', 'fort', 'port', 'mount', 'lake', 'river', 'isle', 'island', 'islands', 'cape', 'city', 'grand', 'upper', 'lower', 'jr', 'junior', 'senior', 'prince', 'princess', 'captain', 'general', 'professor', 'doctor', 'uncle', 'aunt', 'mister', 'miss', 'baby', 'super', 'mega', 'giant', 'dark', 'golden', 'royal', 'club', 'team', 'real', 'saints']);
export function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/œ/g, 'oe')
    .replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/#/g, ' sharp ').replace(/\([^)]*\)/g, ' ').replace(/['’`]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an) /, '');
}
const compact = k => k.replace(/ /g, '');
// Generic category words players add or leave off ("Lake Victoria" vs "Victoria").
const GENERIC = /\b(lake|lakes|mount|mt|mountains?|river|desert|sea|strait|straits|national park|national|park|island|islands|isle|isles|gulf|bay|ocean|volcano|range|peninsula|canal|falls|glacier|province|state|county|of|the)\b/g;
const strip = k => k.replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();
function singular(k) {
  if (k.length > 4 && k.endsWith('ies')) return k.slice(0, -3) + 'y';
  if (k.length > 4 && /(ses|xes|zes|ches|shes)$/.test(k)) return k.slice(0, -2);
  if (k.length > 3 && k.endsWith('s') && !k.endsWith('ss')) return k.slice(0, -1);
  return k;
}

function damerau(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  const d = Array.from({ length: la + 1 }, (_, i) => { const r = new Array(lb + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[la][lb];
}

// Build the answer index for one prompt (cached on the prompt object).
export function indexPrompt(q) {
  if (q._index) return q._index;
  const entries = [];
  const slots = new Map(); // key -> { i, exact }
  const quips = q.quips || {};
  // Exact spellings (answers + aliases) beat derived variants (compact/singular forms).
  const put = (k, i, exact) => {
    if (!k) return;
    const cur = slots.get(k);
    if (!cur || (exact && !cur.exact)) slots.set(k, { i, exact });
  };
  const putAll = (k, i) => {
    put(k, i, true); put(compact(k), i, false); put(singular(k), i, false);
    const s = strip(k);
    if (s.length >= 3 && s !== k) { put(s, i, false); put(compact(s), i, false); }
  };
  const add = (answer, tier, quip) => {
    const k = norm(answer);
    if (!k) return;
    if (slots.get(k)?.exact) return; // first (most common) tier wins
    const i = entries.length;
    entries.push({ answer, tier, score: TIERS[tier].score, quip: quip || quips[answer] || null });
    putAll(k, i);
  };
  if (q.krillion?.a) add(q.krillion.a, 'krillion', q.krillion.quip);
  for (const t of ['plankton', 'tooclever', 'schooler', 'rare', 'deepcut']) for (const a of q[t] || []) add(a, t);
  for (const [canon, alts] of Object.entries(q.aliases || {})) {
    const s = slots.get(norm(canon));
    if (!s) continue;
    for (const a of alts) putAll(norm(a), s.i);
  }
  // Single-word handles for proper names ("Hopper" -> "Jim Hopper"), only when unambiguous.
  const handle = new Map();
  entries.forEach((e, i) => {
    const raw = e.answer.replace(/\([^)]*\)/g, '').trim().split(/\s+/);
    if (raw.length < 2 || !raw.every(w => /^[^a-z]/.test(w) || /^(of|the|and|de|da|di|du|la|le|von|van|der|den|y|al|bin)$/.test(w))) return;
    const words = norm(e.answer).split(' ');
    for (const w of [words[0], words[words.length - 1]]) {
      if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
      const prev = handle.get(w);
      handle.set(w, prev === undefined || prev === i ? i : -1);
    }
  });
  for (const [w, i] of handle) if (i >= 0 && !slots.has(w)) slots.set(w, { i, exact: false });
  const keys = new Map([...slots].map(([k, s]) => [k, s.i]));
  q._index = { entries, keys };
  return q._index;
}

export function matchAnswer(q, input) {
  const { entries, keys } = indexPrompt(q);
  const k = norm(input);
  if (!k || k.length < 1) return null;
  const s = strip(k);
  for (const v of [k, compact(k), singular(k), singular(compact(k)), s, compact(s)]) {
    if (v && v.length >= (v === k ? 1 : 3) && keys.has(v)) return { ...entries[keys.get(v)], exact: true };
  }
  if (k.length < 5) return null;
  const max = k.length >= 9 ? 2 : 1;
  let best = null, bestD = max + 1, tie = false;
  for (const [key, i] of keys) {
    if (key.length < 4 || key[0] !== k[0]) continue;
    const d = damerau(k, key, max);
    if (d < bestD) { bestD = d; best = i; tie = false; }
    else if (d === bestD && best !== i) tie = true;
  }
  if (best === null || tie) return null;
  return { ...entries[best], exact: false };
}

export function revealList(q) {
  const { entries } = indexPrompt(q);
  const rank = t => TIER_ORDER.indexOf(t);
  return entries.slice().sort((a, b) => rank(b.tier) - rank(a.tier) || a.answer.localeCompare(b.answer));
}

// ---------- local AI judge ----------
export async function judgeStatus() {
  try { const r = await fetch('api/judge/status'); return await r.json(); }
  catch { return { online: false, models: [] }; }
}
export function warmJudge(model) {
  fetch('api/judge/warm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model }) }).catch(() => {});
}
export async function askJudge(q, answer, model) {
  const r = await fetch('api/judge', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: q.text, answer, model }),
  });
  if (!r.ok) throw new Error('judge offline');
  const j = await r.json();
  if (!j.valid) return { valid: false };
  const tier = j.commonness === 'common' ? 'schooler' : j.commonness === 'obscure' ? 'deepcut' : 'rare';
  return { valid: true, answer: j.canonical || answer, tier, score: TIERS[tier].score, quip: null, judged: true };
}

// ---------- persistence ----------
const KEY = 'krilldive.v1';
const DEFAULTS = {
  settings: { sound: true, music: true, motion: true, timer: 25, judge: 'auto', model: 'qwen2.5:32b', skin: 'krill' },
  results: {},
  streak: { last: null, count: 0, best: 0 },
  judged: {},
  endlessNext: 1,
  seen: {},        // promptId -> tick when last shown (drives no-repeat endless games)
  seenTick: 0,
};
export const store = {
  data: structuredClone(DEFAULTS),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...structuredClone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}) } };
      }
    } catch { /* storage blocked: play without saving */ }
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
  reset() { this.data = structuredClone(DEFAULTS); this.save(); },
  get settings() { return this.data.settings; },
  result(key) { return this.data.results[key]; },
  markSeen(id) { this.data.seen[id] = ++this.data.seenTick; this.save(); },
  saveResult(key, res) {
    const prev = this.data.results[key];
    if (!prev) this.data.results[key] = { ...res, plays: 1, best: res.score };
    else { prev.plays = (prev.plays || 1) + 1; prev.best = Math.max(prev.best || prev.score, res.score); prev.last = res; }
    this.save();
    return this.data.results[key];
  },
  bumpStreak(dateKey) {
    const s = this.data.streak;
    if (s.last === dateKey) return s;
    const y = new Date(); y.setDate(y.getDate() - 1);
    s.count = s.last === todayKey(y) ? s.count + 1 : 1;
    s.best = Math.max(s.best, s.count);
    s.last = dateKey;
    this.save();
    return s;
  },
  liveStreak() {
    const s = this.data.streak, y = new Date(); y.setDate(y.getDate() - 1);
    return s.last === todayKey() || s.last === todayKey(y) ? s.count : 0;
  },
};
