// Copies the KRILLDIVE game from its own project into the hub as a static build:
//   node tools/sync-krilldive.mjs  [source dir, default D:\Claude Work\krilldive]
// - copies index.html, css/, js/, assets/
// - bundles every data/packs/<id>/{pack.json,chN.json} into data/packs.json (the game falls back to it when there is no server)
// - injects the BALLPARK back-pill script into index.html
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const hub = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = process.argv[2] || 'D:\\Claude Work\\krilldive';
const out = path.join(hub, 'games', 'krilldive');
const ORDER = ['words', 'movies', 'tv', 'games', 'anime', 'sports', 'geography', 'landmarks', 'music', 'food', 'brands',
  'animals', 'science', 'body', 'history', 'people', 'books', 'transport', 'hobbies', 'odds'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
for (const d of ['css', 'js', 'assets']) fs.cpSync(path.join(src, d), path.join(out, d), { recursive: true });

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html.replace('<script type="module" src="js/app.js"></script>',
  '<script>window.KD_STATIC = true;</script>\n<script src="../../shared/bp.js"></script>\n<script type="module" src="js/app.js"></script>');
html = html.replace('<body>', '<body data-bp-pos="br">');
fs.writeFileSync(path.join(out, 'index.html'), html);

const packs = [];
let prompts = 0, answers = 0;
const packsDir = path.join(src, 'data', 'packs');
for (const id of fs.readdirSync(packsDir)) {
  const dir = path.join(packsDir, id);
  if (!fs.statSync(dir).isDirectory() || !fs.existsSync(path.join(dir, 'pack.json'))) continue;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
  const chapters = [];
  for (const f of fs.readdirSync(dir).filter(f => /^ch\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)))) {
    try {
      const ch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (Array.isArray(ch.prompts) && ch.prompts.length === 7) chapters.push(ch.prompts);
      else console.warn(`skip ${id}/${f}: ${ch.prompts?.length} prompts`);
    } catch (e) { console.warn(`skip ${id}/${f}: ${e.message}`); }
  }
  if (!chapters.length) continue;
  for (const ch of chapters) for (const q of ch) {
    prompts++;
    answers += 1 + ['plankton', 'tooclever', 'schooler', 'rare', 'deepcut'].reduce((s, t) => s + (q[t]?.length || 0), 0);
  }
  packs.push({ ...meta, id: meta.id || id, chapters });
}
packs.sort((a, b) => ((ORDER.indexOf(a.id) + 1) || 99) - ((ORDER.indexOf(b.id) + 1) || 99));
fs.writeFileSync(path.join(out, 'data', 'packs.json'), JSON.stringify({ packs }));
if (fs.existsSync(path.join(src, 'data', 'ascent.json'))) fs.copyFileSync(path.join(src, 'data', 'ascent.json'), path.join(out, 'data', 'ascent.json'));
const kb = Math.round(fs.statSync(path.join(out, 'data', 'packs.json')).size / 1024);
console.log(`KRILLDIVE synced: ${packs.length} packs, ${prompts} prompts, ${answers} answers, packs.json ${kb} KB`);
