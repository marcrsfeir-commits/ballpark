// Generates FUSE recipes with a LOCAL Ollama model (free, private): node tools/gen-fuse.mjs [model] [budget]
// Phase 1: every pair among the first 60 discovered elements. Phase 2: each later element × the 24 core elements.
// Resumable — progress is saved to games/fuse/recipes.json as it goes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'games', 'fuse', 'recipes.json');
const MODEL = process.argv[2] || 'qwen2.5:32b';
const BUDGET = Number(process.argv[3]) || 6600;
const N1 = 60, CORE = 24, CONCURRENCY = 4;
export const SYSTEM = `You are the crafting engine of a word-combining game like Infinite Craft. The player drops two things together; you answer with what they make.
Rules:
- The result is ONE thing: a noun or proper noun, 1-3 words, Title Case. It can be an object, creature, place, person, concept, food, pop-culture icon or phenomenon.
- It should feel logical but fun and a little surprising. Think: Water + Fire = Steam, Earth + Water = Plant, Fire + Fire = Volcano, Plant + Time = Tree, Human + Fire = Firefighter.
- Combining a thing with itself makes a bigger/more version (Water + Water = Lake, Lake + Lake = Ocean).
- Never just repeat one of the inputs. Family-friendly only.
- Also choose ONE emoji that best represents the result.
Reply with JSON only: {"result": "...", "emoji": "..."}`;

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const firstGrapheme = s => [...seg.segment(String(s || '').trim())][0]?.segment || '✨';
const title = s => String(s).replace(/["'.!]+/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).map(w => w[0] ? w[0].toUpperCase() + w.slice(1) : w).join(' ');

let data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
  : { model: MODEL, elements: [{ n: 'Water', e: '💧' }, { n: 'Fire', e: '🔥' }, { n: 'Wind', e: '🌬️' }, { n: 'Earth', e: '🌍' }], recipes: [] };
const index = new Map(data.elements.map((el, i) => [el.n.toLowerCase(), i]));
const done = new Set(data.recipes.map(([a, b]) => `${a},${b}`));
const save = () => fs.writeFileSync(OUT, JSON.stringify(data));

async function combine(a, b) {
  const A = data.elements[a].n, B = data.elements[b].n;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, stream: false, format: 'json', keep_alive: '30m', options: { temperature: 0.3, num_predict: 60 },
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${A} + ${B}` }] }),
      });
      const j = await r.json();
      const out = JSON.parse(j.message.content);
      const name = title(out.result);
      if (!name || name.toLowerCase() === A.toLowerCase() || name.toLowerCase() === B.toLowerCase() || name.length > 32) return null;
      let idx = index.get(name.toLowerCase());
      if (idx === undefined) { idx = data.elements.length; data.elements.push({ n: name, e: firstGrapheme(out.emoji) }); index.set(name.toLowerCase(), idx); }
      return idx;
    } catch { /* retry */ }
  }
  return null;
}

function* pairs() {
  for (let k = 0; k < N1; k++) { while (k >= data.elements.length) return; for (let j = 0; j <= k; j++) yield [j, k]; }
  for (let k = N1; ; k++) { if (k >= data.elements.length) return; for (let j = 0; j < CORE; j++) yield [j, k]; }
}

const t0 = Date.now();
let made = data.recipes.length, active = 0, tried = done.size, gen = pairs();
const nextPair = () => { let p = gen.next(); while (!p.done && done.has(p.value.join(','))) p = gen.next(); return p.done ? null : p.value; };
await new Promise(resolve => {
  const fill = () => {
    while (active < CONCURRENCY && made < BUDGET) {
      let pr = nextPair();
      if (!pr) {
        if (active) return;                 // in-flight results may still discover new elements
        gen = pairs(); pr = nextPair();     // restart the sweep, skipping finished pairs
        if (!pr) return resolve();
      }
      const [a, b] = pr;
      done.add(`${a},${b}`); active++; tried++;
      combine(a, b).then(r => {
        active--;
        if (r !== null) { data.recipes.push([a, b, r]); made++; }
        if (tried % 50 === 0) { save(); console.log(`${made} recipes, ${data.elements.length} elements, ${Math.round((Date.now() - t0) / 1000)}s`); }
        if (made >= BUDGET && !active) return resolve();
        fill();
      });
    }
    if (made >= BUDGET && !active) resolve();
  };
  fill();
});
save();
console.log(`DONE: ${data.recipes.length} recipes, ${data.elements.length} elements in ${Math.round((Date.now() - t0) / 1000)}s`);
