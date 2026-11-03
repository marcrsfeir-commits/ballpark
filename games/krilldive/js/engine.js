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

// THE ASCENT: the mirror mode — start in the trench, the MOST common answers lift you to the surface.
export const game = { ascent: false };
export const ASCENT = {
  scores: { plankton: 100, tooclever: 85, schooler: 60, rare: 30, deepcut: 15, krillion: 10 },
  blurbs: {
    plankton: 'Exactly what everyone said. Up you go!',
    tooclever: 'Popular pick — the whole school had it too. Nice.',
    schooler: 'Common enough. A decent lift.',
    rare: 'Too rare! Hardly anyone said that.',
    deepcut: 'Way too obscure — you barely moved.',
    krillion: 'The rarest answer of all. Exactly what you didn\'t want.',
  },
  bearing: [
    { min: 0, max: 250, text: 'Still in the dark. Think like the crowd.' },
    { min: 251, max: 400, text: 'Climbing. You know what people say.' },
    { min: 401, max: 550, text: 'Sunlight! You think like the crowd.' },
    { min: 551, max: 649, text: 'Nearly surfaced. Mind of the masses.' },
    { min: 650, max: 700, text: 'Breached the surface. You ARE the crowd.' },
  ],
};
// Survey-board tiers used by Ascent prompts: only the #1 answer scores full points.
export const BOARD_TIERS = {
  r1: { name: '#1 ANSWER', score: 100, color: '#ffd23f', icon: 'krillion' },
  r2: { name: '#2 ANSWER', score: 70, color: '#4fd1ff', icon: 'schooler' },
  r3: { name: '#3 ANSWER', score: 50, color: '#7bd88f', icon: 'schooler' },
  r4: { name: '#4 ANSWER', score: 35, color: '#b38cff', icon: 'tooclever' },
  r5: { name: '#5 ANSWER', score: 25, color: '#ff9f43', icon: 'tooclever' },
  r6: { name: '#6 ANSWER', score: 18, color: '#ff9f43', icon: 'plankton' },
  r7: { name: '#7 ANSWER', score: 12, color: '#cfe3f2', icon: 'plankton' },
  r8: { name: '#8 ANSWER', score: 8, color: '#cfe3f2', icon: 'plankton' },
  also: { name: 'NOT ON THE BOARD', score: 3, color: '#7f9cbb', icon: 'plankton' },
};
export const BOARD_ORDER = ['also', 'r5', 'r3', 'r2', 'r1'];       // lines drawn while the answer rises
Object.assign(ASCENT.blurbs, {
  r1: 'Survey says… #1! You think exactly like the crowd.',
  r2: 'So close — that\'s the #2 answer.',
  r3: '#3 on the board. A decent climb.',
  r4: 'On the board at #4.', r5: 'On the board at #5.', r6: 'Low on the board (#6).', r7: 'Low on the board (#7).', r8: 'Scraped onto the board at #8.',
  also: 'Valid — but barely anyone said it.',
});
export const tierInfo = t => TIERS[t] || BOARD_TIERS[t];
export const iconKey = t => BOARD_TIERS[t]?.icon || t;
export const pts = tier => (BOARD_TIERS[tier] ? BOARD_TIERS[tier].score : game.ascent ? ASCENT.scores[tier] : TIERS[tier].score);
export const dir = () => (game.ascent ? -1 : 1);                 // depth change per point
export const startDepth = () => (game.ascent ? MAX_SCORE * M_PER_POINT : 0);
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
// Unseeded, crypto-quality randomness (falls back to Math.random where Web Crypto is missing).
export function cryptoRandom() {
  try { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] / 4294967296; } catch { return Math.random(); }
}
function pickWeighted(list, rand) {
  let r = rand() * list.reduce((s, x) => s + x.w, 0);
  for (const x of list) if ((r -= x.w) < 0) return x;
  return list[list.length - 1];
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
  // Endless dives: a genuinely random mix every time (crypto randomness, nothing seeded by the dive number).
  //  - prompts seen within roughly the last 65% of the pool are off-limits; older ones come back with a weight that
  //    grows with time since last seen (never-seen prompts weigh most), so there's no fixed cycle to learn
  //  - at most 2 prompts per pack per dive, never two in a row from one pack (across dives too), and every dive rolls
  //    a random "mood" per pack (packs from the last dive damped) so which categories turn up keeps changing
  //  - built from whatever packs are loaded, so packs added later join automatically (and, being unseen, get a nudge)
  // `seen` = { promptId: tick when last shown }, `tick` = the latest tick (store.data.seen / seenTick).
  endlessPick(seen = {}, tick = 0, rand = cryptoRandom) {
    const N = this.all.length;
    if (N <= ROUNDS) return this.all.slice();
    const hold = Math.max(0, Math.min(Math.floor(N * 0.65), N - ROUNDS * 4));
    const age = q => (seen[q.id] ? Math.max(0, tick - seen[q.id]) : Infinity);
    const fresh = q => {
      const a = age(q);
      if (a === Infinity) return 1;
      if (a < hold) return 0;
      return 0.05 + 0.7 * Math.min(1, (a - hold) / Math.max(1, N - hold));
    };
    let lastPack = null, lastT = 0;
    const recent = new Set();
    for (const q of this.all) {
      const t = seen[q.id];
      if (!t) continue;
      if (t > lastT) { lastT = t; lastPack = q.pack; }
      if (tick - t < ROUNDS) recent.add(q.pack);
    }
    const mood = new Map(this.packs.map(p => [p.id, (0.4 + 1.2 * rand()) * (recent.has(p.id) ? 0.35 : 1)]));
    const picked = [], count = new Map();
    // relax the rules only if the pool is too small: 0 strict, 1 allow same pack back-to-back, 2 more per pack, 3 allow recent
    for (let relax = 0; picked.length < ROUNDS && relax < 4; relax++) {
      while (picked.length < ROUNDS) {
        const prev = picked.length ? picked[picked.length - 1].pack : lastPack;
        const cap = relax >= 2 ? ROUNDS : 2;
        const pool = new Map();
        for (const q of this.all) {
          if (picked.includes(q) || (count.get(q.pack) || 0) >= cap || (relax < 1 && q.pack === prev)) continue;
          let w = fresh(q);
          if (!w && relax >= 3) w = 0.01 * (1 + age(q) / N);
          if (!w) continue;
          if (!pool.has(q.pack)) pool.set(q.pack, []);
          pool.get(q.pack).push({ q, w });
        }
        if (!pool.size) break;
        // a pack first (its mood x sqrt of how much fresh material it has), then a prompt inside it
        const packs = [...pool].map(([id, list]) => ({ list, w: (mood.get(id) ?? 1) * Math.sqrt(list.reduce((s, x) => s + x.w, 0)) }));
        const q = pickWeighted(pickWeighted(packs, rand).list, rand).q;
        picked.push(q);
        count.set(q.pack, (count.get(q.pack) || 0) + 1);
      }
    }
    return picked;
  }
  unseenCount(seen = {}) { return this.all.filter(q => !seen[q.id]).length; }
  chapter(packId, ci) { return this.pack(packId)?.chapters[ci] || []; }
}

// ---------- matching ----------
// Anything a player might reasonably type for a listed answer should land on it, and nothing may ever land on a
// DIFFERENT listed answer. All answer-side work is precomputed once per prompt (indexPrompt). Stages, in order:
//   1. exact spelling (answers + aliases), then folded keys: accents, punctuation, spacing, leading articles,
//      plurals/-ing, UK/US spelling, number words + roman numerals, abbreviations (st/mt/dr...), word order,
//      generic words ("Lake Victoria" = "Victoria") and the prompt's own category word ("carrot" -> "Carrot cake")
//   2. the answer inside a longer phrase ("i think it's a giraffe", "a golden retriever puppy")
//   3. part of an answer when only one answer fits ("hawking", "golden gun", "pyrenees")
//   4. typos (keyboard-aware weighted Damerau-Levenshtein) when one answer is clearly the closest
//   5. bigger typos / sound-alikes come back flagged `typo`, so the game asks "did you mean ...?" first
// A key two different answers share is marked ambiguous (-1) and never used to accept anything.
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'de', 'la', 'le', 'el', 'von', 'van', 'mr', 'mrs', 'dr', 'st', 'saint', 'king', 'queen', 'lord', 'lady', 'sir', 'new', 'great', 'big', 'little', 'red', 'black', 'white', 'green', 'blue', 'old',
  'north', 'south', 'east', 'west', 'central', 'united', 'republic', 'san', 'santa', 'los', 'las', 'fort', 'port', 'mount', 'lake', 'river', 'isle', 'island', 'islands', 'cape', 'city', 'grand', 'upper', 'lower', 'jr', 'junior', 'senior', 'prince', 'princess', 'captain', 'general', 'professor', 'doctor', 'uncle', 'aunt', 'mister', 'miss', 'baby', 'super', 'mega', 'giant', 'dark', 'golden', 'royal', 'club', 'team', 'real', 'saints']);
export function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/œ/g, 'oe')
    .replace(/ł/g, 'l').replace(/[đð]/g, 'd').replace(/þ/g, 'th').replace(/ı/g, 'i')
    .replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/#/g, ' sharp ').replace(/\([^)]*\)/g, ' ').replace(/['’‘`´ʻʼ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an) /, '');
}

// --- word folding: every spelling of a word collapses to one key ---
const NUMW = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fourty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
};
const ORD = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10', eleventh: '11', twelfth: '12' };
const ABBR = {
  st: 'saint', ste: 'sainte', mt: 'mount', mtn: 'mountain', ft: 'fort', dr: 'doctor', prof: 'professor', capt: 'captain', cpt: 'captain',
  sgt: 'sergeant', lt: 'lieutenant', col: 'colonel', mr: 'mister', mrs: 'missus', jr: 'junior', jnr: 'junior', sr: 'senior', snr: 'senior',
  vs: 'versus', n: 'and', u: 'you', r: 'are', ur: 'your', okay: 'ok', xmas: 'christmas', bday: 'birthday', mum: 'mom',
  grey: 'gray', greys: 'grays', aluminium: 'aluminum', tyre: 'tire', tyres: 'tires', pyjamas: 'pajamas', pyjama: 'pajama', doughnut: 'donut', doughnuts: 'donuts',
  aeroplane: 'airplane', aeroplanes: 'airplanes', plough: 'plow', cheque: 'check', programme: 'program', jewellery: 'jewelry', jewelery: 'jewelry',
  moustache: 'mustache', sulphur: 'sulfur', defence: 'defense', offence: 'offense', licence: 'license', pretence: 'pretense', practise: 'practice',
  manoeuvre: 'maneuver', storey: 'story', cosy: 'cozy', sceptic: 'skeptic', yoghurt: 'yogurt', yoghourt: 'yogurt', oesophagus: 'esophagus',
  oestrogen: 'estrogen', foetus: 'fetus', diarrhoea: 'diarrhea', anaesthetic: 'anesthetic', kerb: 'curb', gaol: 'jail', axe: 'ax',
  mould: 'mold', moult: 'molt', smoulder: 'smolder', omelette: 'omelet', whisky: 'whiskey', judgement: 'judgment', ageing: 'aging',
  annexe: 'annex', draught: 'draft',
};
const OUR_KEEP = new Set(['flour', 'detour', 'contour', 'velour', 'amour', 'paramour', 'troubadour', 'devour', 'scour']);
const ROMAN_RE = /^(x{0,3})(ix|iv|v?i{0,3})$/;
const RV = { i: 1, v: 5, x: 10 };
function roman(w) { let n = 0; for (let i = 0; i < w.length; i++) { const v = RV[w[i]], nx = RV[w[i + 1]] || 0; n += v < nx ? -v : v; } return n; }
// plural / -ing / silent-e endings, so "horses", "horse", "ponies", "pony", "wolves", "wolf", "skiing", "ski" pair up
function stem(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) { w = w.slice(0, -3) + 'y'; return w.length > 3 ? w.replace(/y$/, 'i') : w; } // skies = sky, not ski
  while (w.length > 3 && /[se]$/.test(w) && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length >= 6 && w.endsWith('ing')) { const b = w.slice(0, -3); if (b.length >= 3 && /[aeiouy]/.test(b)) w = b.replace(/e$/, ''); }
  return w.length > 3 ? w.replace(/y$/, 'i') : w;
}
function foldWord(w, first) {
  if (Object.hasOwn(ABBR, w)) { if (!(first && w === 'n')) w = ABBR[w]; }
  else if (/[^s]s$/.test(w) && w.length >= 4 && Object.hasOwn(ABBR, w.slice(0, -1))) w = ABBR[w.slice(0, -1)] + 's';    // moustaches
  else if (/es$/.test(w) && w.length > 5 && Object.hasOwn(ABBR, w.slice(0, -2))) w = ABBR[w.slice(0, -2)] + 'es';
  if (Object.hasOwn(NUMW, w)) return NUMW[w];
  const m = /^(\d+)(st|nd|rd|th|s)$/.exec(w);
  if (m) return m[1];
  if (/\d/.test(w)) return w;
  if (w.length >= 2 && ROMAN_RE.test(w)) return String(roman(w));
  if (!OUR_KEEP.has(w.replace(/s$/, ''))) w = w.replace(/^(.{2,})our(s?)$/, '$1or$2');             // colour -> color (not hour/four)
  w = w.replace(/^(.{3,})is(e|es|ed|ing|ation|ations)$/, '$1iz$2').replace(/^(.{2,})ys(e|es|ed|ing)$/, '$1yz$2'); // -ise -> -ize (not raise)
  w = w.replace(/^(.{2,}[^aeiouy])re(s?)$/, '$1er$2');                                             // centre -> center (not acre)
  if (w.length >= 7) w = w.replace(/ogue(s?)$/, 'og$1');                                          // catalogue -> catalog
  if (w.replace(/s$/, '').length >= 8) w = w.replace(/(.)ae(?=..)/g, '$1e');                     // archaeology -> archeology
  w = w.replace(/ph/g, 'f').replace(/(.)x/g, '$1ks').replace(/ck/g, 'k');                          // rafael/raphael, rubix/rubiks
  w = stem(w).replace(/([a-z])\1+/g, '$1');                                                       // spaghetti = spagheti
  return w.length > 3 ? w.replace(/f$/, 'v') : w;                                                 // wolf = wolves
}
const COMPASS = { n: 'north', s: 'south', e: 'east', w: 'west' };
function deepToks(light) {
  const t = light ? light.split(' ').map((w, i, all) => (i > 0 && all[i - 1] === 'the' && Object.hasOwn(ORD, w) ? ORD[w]   // "Ramesses the Second"
    : foldWord(i === 0 && all.length > 1 && Object.hasOwn(COMPASS, w) ? COMPASS[w] : w, i === 0))) : [];
  for (let i = 0; i < t.length - 1; i++) if (/^[2-9]0$/.test(t[i]) && /^[1-9]$/.test(t[i + 1])) t.splice(i, 2, String(+t[i] + +t[i + 1])); // twenty one -> 21
  return t;
}
const fset = words => new Set(words.map(w => foldWord(w, false)));
const ART = fset(['the', 'a', 'an', 'le', 'la', 'les', 'l', 'el', 'los', 'las', 'il', 'lo', 'der', 'die', 'das']);
const SW = fset(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'with']);
// name particles: dropped only before another word ("da Vinci" -> "vinci", but "Lake Van" keeps "van")
const PART = fset(['de', 'du', 'des', 'da', 'di', 'del', 'von', 'van', 'der', 'y', 'la', 'le', 'el', 'les']);
const content = t => t.filter((w, k) => !SW.has(w) && !(PART.has(w) && k < t.length - 1));
const GEN = fset(['lake', 'lakes', 'loch', 'mount', 'mountain', 'mountains', 'river', 'desert', 'sea', 'strait', 'straits', 'national', 'park', 'island', 'islands',
  'isle', 'isles', 'gulf', 'bay', 'ocean', 'volcano', 'range', 'peninsula', 'canal', 'falls', 'glacier', 'province', 'state', 'county']);
const STOPF = fset([...STOP]);
// words that turn a place into a DIFFERENT place ("New Mexico" is not "Mexico", "Lake Michigan" is not "Michigan")
const MODS = fset(['new', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western', 'upper', 'lower', 'central', 'equatorial', 'papua',
  'greater', 'great', 'little', 'old', 'saint', 'san', 'santa', 'port', 'fort', 'mount', 'lake', 'american']);
const PART_MODS = fset(['new', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western', 'upper', 'lower', 'central', 'equatorial', 'papua', 'old', 'saint', 'san', 'santa']);
const AFTER = fset(['city', 'river', 'lake', 'sea', 'island', 'islands', 'bay', 'mountain', 'mountains', 'county', 'street', 'road', 'park', 'beach', 'airport', 'university', 'falls', 'dc']);
// words that can sit next to a surname-only alias without making it someone else ("messi is the goat" vs "louis armstrong")
const SOFT = fset(['is', 'are', 'was', 'were', 'has', 'have', 'had', 'i', 'think', 'from', 'who', 'which', 'that', 'he', 'she', 'it', 'its', 'my', 'his', 'her', 'their',
  'because', 'cause', 'cuz', 'guy', 'man', 'dude', 'lol', 'obviously', 'probably', 'maybe', 'by', 'goat', 'best', 'ever', 'mate', 'bro', 'or', 'not', 'so', 'very', 'really',
  'puppy', 'puppies', 'dog', 'dogs', 'cat', 'cats', 'kitten', 'breed', 'kind', 'type', 'one', 'ones', 'thing', 'cute', 'big', 'small', 'pet', 'player', 'girl']);
const CAT_SKIP = fset(['name', 'type', 'types', 'kind', 'sort', 'famous', 'something', 'someone', 'that', 'you', 'your', 'might', 'find', 'from', 'or', 'word', 'words',
  'any', 'one', 'thing', 'things', 'real', 'fictional', 'past', 'present', 'not', 'isnt', 'is', 'are', 'least', 'our', 'by', 'its', 'it', 'as', 'can', 'be', 'both',
  'used', 'english', 'ending', 'beginning', 'containing', 'made', 'up', 'entirely', 'has', 'have', 'which', 'who', 'whose', 'where', 'would', 'could', 'take',
  'see', 'say', 'during', 'including', 'we', 'us', 'other', 'anywhere', 'world', 'common', 'popular', 'well', 'known', 'only', 'just', 'some', 'all', 'own']);

// --- filler players wrap answers in ---
const FILL_LEAD = ['my answer is', 'my answer would be', 'my answer', 'the answer is', 'answer is', 'answer', 'final answer', 'i think its', 'i think it is', 'i think thats',
  'i think', 'i guess its', 'i guess', 'i believe its', 'i believe', 'i would say', 'id say', 'i say', 'i choose', 'i pick', 'ill go with', 'ill say', 'i will go with',
  'i will say', 'im going with', 'im going to say', 'im gonna say', 'gonna say', 'going with', 'go with', 'lets go with', 'lets say', 'how about', 'what about', 'is it',
  'its', 'it is', 'thats', 'that is', 'it must be', 'must be', 'has to be', 'gotta be', 'it could be', 'could be', 'maybe', 'perhaps', 'probably', 'possibly',
  'definitely', 'obviously', 'surely', 'um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'erm', 'hmm', 'hm', 'ah', 'oh', 'ooh', 'ok', 'okay', 'so', 'well', 'like',
  'yeah', 'yes', 'hey', 'easy', 'duh', 'the', 'a', 'an', 'some', 'a type of', 'type of', 'a kind of', 'kind of', 'sort of', 'my'].map(s => s.split(' '));
const FILL_TAIL = ['maybe', 'i think', 'i guess', 'i believe', 'probably', 'perhaps', 'possibly', 'lol', 'haha', 'please', 'pls', 'right', 'yeah', 'yes', 'obviously',
  'of course', 'ofc', 'i suppose', 'innit', 'surely', 'or something', 'i reckon', 'for sure', 'final answer'].map(s => s.split(' '));
const FILL_ANY = new Set(['um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'erm', 'hmm', 'hm', 'hmmm']);
// Peel filler off one phrase at a time; every step is a candidate, least stripped first, so
// "i think it's oh my gosh" tries "oh my gosh" before it ever gets down to "gosh".
function defillSteps(light) {
  const steps = [light];
  let t = light.split(' ').filter(w => !FILL_ANY.has(w)), again = true;
  if (!t.length) return steps;
  if (t.join(' ') !== light) steps.push(t.join(' '));
  while (again) {
    again = false;
    for (const p of FILL_LEAD) if (t.length > p.length && p.every((w, i) => t[i] === w)) { t = t.slice(p.length); again = true; break; }
    if (!again) for (const p of FILL_TAIL) if (t.length > p.length && p.every((w, i) => t[t.length - p.length + i] === w)) { t = t.slice(0, t.length - p.length); again = true; break; }
    if (again) steps.push(t.join(' '));
  }
  return steps;
}
const defill = tokens => defillSteps(tokens.join(' ')).pop().split(' ');

// Every key a piece of text can be looked up by, strongest first: [key, level]. Lower level wins a clash.
// `side` 'a' (answer) also drops generic words; 'i' (player input) only drops the prompt's own category word.
// Spaceless spellings live under '@' so they never collide with folded keys ("camaros" vs "Camaro SS").
const rawKey = s => { const r = String(s).toLowerCase().replace(/\s+/g, ' ').trim(); return r ? '\u0000' + r : ''; };
function variants(text, cats, side) {
  const light = norm(text);
  if (!light) return [];
  const out = [['@' + light.replace(/ /g, ''), 1]];
  const t = deepToks(light);
  out.push([t.join(' '), 2], [t.join(''), 2]);
  let a = t; while (a.length > 1 && ART.has(a[0])) a = a.slice(1);
  if (a !== t) out.push([a.join(''), 2]);
  const st = stem(t.join(''));
  if (st !== t.join('')) out.push([st, 2]);                                   // "yo-yos" = "yo-yo"
  const ns = content(t);
  const more = (arr, from, min = 3) => { const k = arr.join(''); if (arr.length && arr.length < from.length && k.length >= min) out.push([k, 3]); };
  more(ns, t);
  let base = ns;
  if (side === 'a') { const ng = ns.filter(w => !GEN.has(w)); more(ng, ns); if (ng.length) base = ng; }
  if (cats) {
    more(base.filter(w => !cats.text.has(w)), base);                          // the prompt's own word: "carrot" -> "Carrot cake"
    more(base.filter(w => !cats.has(w)), base, 5);                            // a word most answers share: "yorkshire" -> "Yorkshire Terrier"
  }
  if (ns.length >= 2) out.push(['~' + ns.slice().sort().join(' '), 4]);
  return out;
}

// --- typo distance: keyboard neighbours, sound-alikes, swapped and doubled letters are cheap ---
const NEAR = new Set();
{
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const pair = (x, y) => { if (x && y) { NEAR.add(x + y); NEAR.add(y + x); } };
  rows.forEach((r, ri) => { for (let c = 0; c < r.length; c++) { pair(r[c], r[c + 1]); if (rows[ri + 1]) { pair(r[c], rows[ri + 1][c]); pair(r[c], rows[ri + 1][c - 1]); } } });
  for (const p of ['ck', 'cs', 'sz', 'fv', 'iy', 'kq', 'gj', 'mn', 'bp', 'dt', 'vw', 'ae', 'ei', 'ou', 'io']) pair(p[0], p[1]);
}
const VOW = new Set('aeiouy');
function sub(x, y) { return x === y ? 0 : NEAR.has(x + y) ? 0.5 : VOW.has(x) && VOW.has(y) ? 0.6 : 1; }
function wdl(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) * 0.3 > max) return max + 1;
  let p2 = null, p1 = new Float64Array(lb + 1), cur;
  for (let j = 1; j <= lb; j++) p1[j] = p1[j - 1] + (j > 1 && b[j - 1] === b[j - 2] ? 0.3 : 1);
  for (let i = 1; i <= la; i++) {
    cur = new Float64Array(lb + 1);
    cur[0] = p1[0] + (i > 1 && a[i - 1] === a[i - 2] ? 0.3 : 1);
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const del = p1[j] + (i > 1 && a[i - 1] === a[i - 2] ? 0.3 : 1);
      const ins = cur[j - 1] + (j > 1 && b[j - 1] === b[j - 2] ? 0.3 : 1);
      let v = Math.min(del, ins, p1[j - 1] + sub(a[i - 1], b[j - 1]));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && a[i - 1] !== a[i - 2]) v = Math.min(v, p2[j - 2] + 0.5);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    p2 = p1; p1 = cur;
  }
  return p1[lb];
}
const tolFor = L => (L < 4 ? 0 : L === 4 ? 0.5 : L <= 6 ? 1 : L <= 9 ? 1.6 : Math.min(3, 0.24 * L));
// rough sound-alike key (Metaphone-ish) for the "did you mean" fallback
function phon(s) {
  s = s.replace(/[^a-z]/g, '');
  if (!s) return '';
  s = s.replace(/^(kn|gn|pn|wr|ps)/, m => m[1]).replace(/^x/, 's').replace(/^wh/, 'w')
    .replace(/ph/g, 'f').replace(/gh/g, '').replace(/ck/g, 'k').replace(/sch/g, 'sk').replace(/tch|ch|sh/g, 'X').replace(/th/g, '0')
    .replace(/c(?=[iey])/g, 's').replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/dg/g, 'j').replace(/z/g, 's').replace(/v/g, 'f').replace(/d/g, 't').replace(/b/g, 'p');
  const head = /[aeiouy]/.test(s[0]) ? 'A' : s[0];
  return (head + s.slice(1).replace(/[aeiouyhw]/g, '')).replace(/(.)\1+/g, '$1');
}

const RANK = { plankton: 0, tooclever: 1, schooler: 2, rare: 3, deepcut: 4, krillion: 5, r1: 0, r2: 1, r3: 2, r4: 3, r5: 4, r6: 5, r7: 6, r8: 7, also: 8 };

// Build the answer index for one prompt (cached on the prompt object).
export function indexPrompt(q) {
  if (q._index) return q._index;
  const entries = [];
  const exact = new Map();     // normalised spelling -> entry (answers + aliases; first listing wins)
  const keys = new Map();      // folded key -> entry, or -1 when two answers share it
  const lvl = new Map();
  const whole = new Map();     // deep compact form -> { i, short } for finding an answer inside a longer phrase
  const forms = [];            // { i, toks } deep tokens (no little words) of every answer + alias, for partial matches
  const fuzzy = [];            // [key, i, isDeep] for typo matching
  const quips = q.quips || {};
  const raws = [];
  const add = (answer, tier, quip, pct) => {
    const k = norm(answer) || rawKey(answer);
    if (!k || exact.has(k)) return; // first (most common) tier wins
    const i = entries.length;
    entries.push({ answer, tier, score: (TIERS[tier] || BOARD_TIERS[tier]).score, quip: quip || quips[answer] || null, pct });
    exact.set(k, i);
    raws.push([answer, i, false]);
  };
  if (q.board) {                     // Ascent survey-board prompt
    q.board.forEach((b, r) => add(b.a, 'r' + (r + 1), null, b.pct));
    for (const a of q.also || []) add(a, 'also');
  }
  if (q.krillion?.a) add(q.krillion.a, 'krillion', q.krillion.quip);
  for (const t of ['plankton', 'tooclever', 'schooler', 'rare', 'deepcut']) for (const a of q[t] || []) add(a, t);
  for (const [canon, alts] of Object.entries(q.aliases || {})) {
    const i = exact.get(norm(canon) || rawKey(canon));
    if (i === undefined) continue;
    for (const a of alts) { const k = norm(a) || rawKey(a); if (!k) continue; if (!exact.has(k)) exact.set(k, i); raws.push([a, i, true]); }
  }
  // the prompt's category words ("cake" in "Name a type of cake", or a last word most answers share like "terrier")
  const cats = new Set(deepToks(norm(q.text || '')).filter(w => w.length >= 3 && !CAT_SKIP.has(w) && !SW.has(w) && !/^\d+$/.test(w)));
  cats.text = new Set(cats);
  const lastCount = new Map();
  for (const [text, , alias] of raws) if (!alias) { const t = deepToks(norm(text)); if (t.length > 1) lastCount.set(t[t.length - 1], (lastCount.get(t[t.length - 1]) || 0) + 1); }
  const need = Math.max(4, Math.ceil(entries.length * 0.04));
  for (const [w, n] of lastCount) if (n >= need && w.length >= 4 && !/^\d+$/.test(w)) cats.add(w);

  const put = (k, i, l) => {
    if (!k) return;
    const c = keys.get(k);
    if (c === undefined || l < lvl.get(k)) { keys.set(k, i); lvl.set(k, l); }
    else if (l === lvl.get(k) && c !== i) keys.set(k, -1);
  };
  const tokCount = entries.map(e => content(deepToks(norm(e.answer))).length);
  // proper names / titles ("Jim Hopper", "Rocket Raccoon"): a unique first or last word is a safe short form
  const nameLike = entries.map(e => {
    const raw = e.answer.replace(/\([^)]*\)/g, '').trim().split(/\s+/);
    return raw.length >= 2 && raw.every(w => /^[^a-z]/.test(w) || /[A-Z]/.test(w) || /^(of|the|and|de|da|di|du|la|le|von|van|der|den|y|al|bin)$/.test(w));
  });
  const seenFuzzy = new Set();
  for (const [text, i, alias] of raws) {
    const vs = variants(text, cats, 'a');
    for (const [k, l] of vs) {
      put(k, i, l);
      if ((l <= 2 || (l === 3 && k.length >= 7)) && !k.includes(' ') && !k.startsWith('~') && !seenFuzzy.has(k + '|' + i)) { seenFuzzy.add(k + '|' + i); fuzzy.push(k); }
    }
    const light = norm(text), t = deepToks(light), toks = content(t);
    const short = alias && toks.length < tokCount[i];
    for (const k of [t.join(''), toks.join('')]) {
      if (k.length < 3 || toks.every(w => GEN.has(w) || cats.has(w))) continue;
      const w = whole.get(k);
      if (!w) whole.set(k, { i, short });
      else if (w.i !== i) w.i = -1;
      else if (!short) w.short = false;
    }
    if (toks.length) forms.push({ i, toks, alias });
  }
  // a folded key that belongs to a different answer (or to two) is no use for typo matching
  const fz = [...new Set(fuzzy)].filter(k => keys.get(k) >= 0).map(k => (k[0] === '@' ? [k.slice(1), keys.get(k), false] : [k, keys.get(k), true]));
  const numbered = entries.map(e => /[\s-]([ivx]+|\d+)$/i.test(e.answer.replace(/\([^)]*\)/g, '').trim()));
  q._index = { entries, keys: exact, folded: keys, whole, forms, fuzzy: fz, cats, nameLike, numbered };
  return q._index;
}

// The answer inside a longer phrase: "i think it's a giraffe", "a golden retriever puppy", "messi is the goat".
function findInside(ix, D) {
  const cands = [];
  for (let a = 0; a < D.length; a++) {
    for (let b = a + 1; b <= Math.min(D.length, a + 7); b++) {
      if (a === 0 && b === D.length) continue;
      const k = D.slice(a, b).join('');
      if (k.length < 3 || D.slice(a, b).every(x => GEN.has(x) || ix.cats.has(x) || SW.has(x))) continue;
      const w = ix.whole.get(k);
      if (!w || w.i < 0) continue;
      const prev = D[a - 1], next = D[b];
      if (prev !== undefined && MODS.has(prev)) continue;                 // "new london" is not London
      if (next !== undefined && AFTER.has(next)) continue;                // "kansas city" is not Kansas
      const nameLike = x => x !== undefined && x.length >= 3 && !/^\d+$/.test(x) && !SW.has(x) && !SOFT.has(x) && !ix.cats.has(x);
      if (w.short && (nameLike(prev) || nameLike(next))) continue;        // "louis armstrong" is not Neil Armstrong
      cands.push({ i: w.i, len: k.length, a, b });
    }
  }
  if (!cands.length) return null;
  cands.sort((x, y) => y.len - x.len);
  const best = cands[0];
  // two different answers in one phrase ("cat or dog"): don't guess
  if (cands.some(c => c.i !== best.i && c.len >= 4 && (c.b <= best.a || c.a >= best.b))) return null;
  return best.i;
}

// Part of an answer when only one answer fits: "hawking", "golden gun", "pyrenees", "salt lake".
// Returns { i, sure } (sure = accept, otherwise ask "did you mean"), { ambiguous: [...] } or null.
function findPart(ix, clean) {
  const T0 = content(deepToks(clean));
  if (!T0.length) return null;
  const r = partWith(ix, T0, clean);
  if (r || T0.length < 2) return r;
  const nc = T0.filter(w => !ix.cats.has(w));                                            // "carrot soup" -> carrot
  return nc.length && nc.length < T0.length ? partWith(ix, nc, clean) : null;
}
function partWith(ix, T, clean) {
  const single = T.length === 1;
  if (single) {
    const w = T[0], rawLen = clean.replace(/ /g, '').length;
    if (rawLen < 4 || w.length < 3 || STOPF.has(w) || GEN.has(w) || ix.cats.has(w) || /^d+$/.test(w)) return null;
  }
  const hits = new Map(); // entry -> sure?
  for (const f of ix.forms) {
    if (f.toks.length <= T.length || !T.every(t => f.toks.includes(t))) continue;
    let sure = true;
    if (single) {
      const pos = f.toks.indexOf(T[0]), last = f.toks.length - 1;
      if (pos !== 0 && pos !== last && T[0].length < 6) continue;                        // middle words only when long
      if (f.toks.every((t, k) => k === pos || PART_MODS.has(t))) continue;             // "mexico" is not "New Mexico"
      // sure when the rest is only category/generic/modifier words ("pyrenees", "superior"), or it is the surname of a
      // name ("hawking") or the first word of a listed name ("rocket"); otherwise ("banana" -> "Banana flower") ask first
      const rest = f.toks.filter((t, k) => k !== pos);
      sure = rest.every(t => ix.cats.has(t) || GEN.has(t) || MODS.has(t))
        || (ix.nameLike[f.i] && (pos === last || (pos === 0 && !f.alias)));
    }
    hits.set(f.i, hits.get(f.i) || sure);
  }
  if (!hits.size) return null;
  if (hits.size === 1) { const [[i, sure]] = hits; return { i, sure }; }
  return { ambiguous: [...hits.keys()] };
}

const NUM_TAIL = /(x{0,3}(ix|iv|v?i{0,3})|\d+)$/;
// Closest answer by weighted typo distance. Returns { i, d, L, gap, first } or null.
function nearest(ix, light, deep, loose) {
  const per = new Map();
  for (const [k, i, isDeep] of ix.fuzzy) {
    const s = isDeep ? deep : light;
    if (!s || s.length < 3) continue;
    const L = Math.min(s.length, k.length);
    const tol = loose ? (L < 3 ? 0 : L < 8 ? 2 : 3) : tolFor(L);
    if (!tol) continue;
    const d = wdl(s, k, tol);
    if (d > tol) continue;
    // "elizabethii" is Elizabeth II, never a typo of Elizabeth I: numbers at the end aren't typos
    if (ix.numbered[i] && s !== k && s.replace(NUM_TAIL, '') === k.replace(NUM_TAIL, '')) continue;
    const cur = per.get(i);
    if (!cur || d < cur.d) per.set(i, { i, d, L, first: sub(s[0], k[0]) <= 0.5 });
  }
  if (!per.size) return null;
  const list = [...per.values()].sort((a, b) => a.d - b.d || RANK[ix.entries[a.i].tier] - RANK[ix.entries[b.i].tier]);
  const best = list[0];
  best.gap = list[1] ? list[1].d - best.d : 99;
  return best;
}

function analyze(q, input) {
  const ix = indexPrompt(q);
  const hit = (i, exact, typo) => ({ ix, hit: { ...ix.entries[i], exact, ...(typo ? { typo: true } : {}) } });
  const light = norm(input);
  if (!light) { const i = ix.keys.get(rawKey(input)); return i === undefined ? { ix, hit: null } : hit(i, true); } // "π", "Спасибо"
  const steps = defillSteps(light), clean = steps[steps.length - 1];
  // 1. exact spelling, then folded keys (strongest first; a key two answers share stops the search)
  for (const s of steps) if (ix.keys.has(s)) return hit(ix.keys.get(s), true);
  let ambiguous = false;
  for (const s of steps) {
    // word-by-word folding first ("porsche cayennes" is the Cayenne, not the "Cayenne S"), then spaceless, then looser keys
    const vs = variants(s, ix.cats, 'i');
    if (vs.length > 1 && s.includes(' ')) [vs[0], vs[1]] = [vs[1], vs[0]];
    for (const [k] of vs) {
      const v = ix.folded.get(k);
      if (v === undefined) continue;
      if (v >= 0) return hit(v, true);
      ambiguous = true;
      break;
    }
  }
  if (ambiguous) return { ix, hit: null };
  // 2. the answer inside a longer phrase
  const D = deepToks(clean);
  if (D.length > 1) { const i = findInside(ix, D); if (i !== null) return hit(i, false); }
  // 3. part of an answer, when only one fits
  const part = findPart(ix, clean);
  if (part && !part.ambiguous) return hit(part.i, false, !part.sure);
  if (part) return { ix, hit: null, ambiguous: part.ambiguous };
  // 4. typos: auto-accept small, clearly-closest ones; flag the rest for "did you mean"
  const lc = clean.replace(/ /g, ''), dc = D.join('');
  const n = lc.length >= 4 ? nearest(ix, lc, dc, false) : null;
  if (n && n.gap >= 0.5) {
    const sure = n.first && n.gap >= 0.5 && n.d <= (n.L >= 11 ? 1.6 : n.L >= 8 ? 1.3 : n.L >= 6 ? 1 : n.L === 5 ? 0.5 : 0);
    return hit(n.i, false, !sure);
  }
  // 5. a typo'd answer inside a phrase, or a sound-alike: ask first
  if (D.length > 1) {
    let best = null;
    for (let a = 0; a < D.length; a++) for (let b = a + 1; b <= Math.min(D.length, a + 4); b++) {
      if (a === 0 && b === D.length) continue;
      const k = D.slice(a, b).join('');
      if (k.length < 6) continue;
      const m = nearest(ix, null, k, false);
      if (m && m.gap >= 0.5 && (!best || m.d < best.d)) best = m;
    }
    if (best) return hit(best.i, false, true);
  }
  if (lc.length >= 6) {
    const p = phon(lc);
    if (p.length >= 3) {
      const found = new Set();
      for (const [k, i, isDeep] of ix.fuzzy) if (!isDeep && phon(k) === p) found.add(i);
      if (found.size === 1) return hit([...found][0], false, true);
    }
  }
  return { ix, hit: null };
}

export function matchAnswer(q, input) {
  return analyze(q, input).hit;
}

// Closest listed answer to a miss, for "did you mean …?" (looser than matchAnswer, never auto-accepted).
export function suggestAnswer(q, input) {
  const r = analyze(q, input);
  const ix = r.ix;
  if (r.hit) return r.hit;
  if (r.ambiguous) return ix.entries[r.ambiguous.slice().sort((a, b) => RANK[ix.entries[a].tier] - RANK[ix.entries[b].tier])[0]];
  const light = norm(input);
  if (light.length < 3) return null;
  const clean = defill(light.split(' ')).join(' ');
  const n = nearest(ix, clean.replace(/ /g, ''), deepToks(clean).join(''), true);
  return n ? ix.entries[n.i] : null;
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
