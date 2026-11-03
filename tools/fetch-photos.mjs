// Download real photos from Wikipedia for a list of things, with licence credits.
//   node tools/fetch-photos.mjs <list.json> <outDir> [width]
// list.json: [{ "key": "file-safe-id", "q": "Wikipedia search text" }, ...]
// Writes <outDir>/<key>.jpg and merges <outDir>/credits.json ({ key: { title, file, artist, license, url } }).
// Already-downloaded keys are skipped, so it can be re-run safely.
import fs from 'node:fs';
import path from 'node:path';

const [listFile, outDir, widthArg] = process.argv.slice(2);
if (!listFile || !outDir) { console.error('usage: node tools/fetch-photos.mjs <list.json> <outDir> [width]'); process.exit(1); }
const WIDTH = Number(widthArg) || 256;
const CONCURRENCY = 6;
const UA = { 'User-Agent': 'BALLPARK-games/1.0 (https://github.com/marcrsfeir-commits/ballpark)' };

const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const creditsFile = path.join(outDir, 'credits.json');
const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, 'utf8')) : {};
const missFile = path.join(outDir, 'missing.json');
const missing = new Set(fs.existsSync(missFile) ? JSON.parse(fs.readFileSync(missFile, 'utf8')) : []);

const getJSON = async url => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 429) { await new Promise(res => setTimeout(res, 2000 * (i + 1))); continue; }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
};
const strip = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// The article whose title matches exactly (following redirects) wins; nothing else (search hits are often unrelated).
async function findImage(q) {
  const t = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(q)}&prop=pageimages|pageprops&ppprop=disambiguation&piprop=thumbnail|name&pithumbsize=${WIDTH}&redirects=1`);
  const exact = Object.values(t?.query?.pages || {})[0];
  if (exact?.thumbnail && !exact.pageprops && /\.(jpe?g|png|webp)$/i.test(exact.pageimage || '')) return { title: exact.title, src: exact.thumbnail.source, file: exact.pageimage };
  return null;   // no exact article photo: callers keep their emoji rather than show a wrong picture
}

async function licence(file) {
  const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=File:${encodeURIComponent(file)}&prop=imageinfo&iiprop=extmetadata|url`);
  const info = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0];
  const m = info?.extmetadata || {};
  return { artist: strip(m.Artist?.value) || 'unknown', license: strip(m.LicenseShortName?.value) || 'see source', url: info?.descriptionurl || '' };
}

async function one({ key, q }) {
  const out = path.join(outDir, `${key}.jpg`);
  if (fs.existsSync(out) || missing.has(key)) return;
  try {
    const img = await findImage(q);
    if (!img) { missing.add(key); return; }
    const r = await fetch(img.src, { headers: UA });
    if (!r.ok) { missing.add(key); return; }
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    credits[key] = { title: img.title, file: img.file, ...(await licence(img.file)) };
  } catch (e) {
    console.error(key, e.message);
  }
}

let done = 0;
const queue = list.slice();
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    await one(queue.shift());
    if (++done % 100 === 0) {
      console.log(`${done}/${list.length}`);
      fs.writeFileSync(creditsFile, JSON.stringify(credits));
      fs.writeFileSync(missFile, JSON.stringify([...missing]));
    }
  }
}));
fs.writeFileSync(creditsFile, JSON.stringify(credits));
fs.writeFileSync(missFile, JSON.stringify([...missing]));
console.log(`done: ${Object.keys(credits).length} photos, ${missing.size} not found`);
