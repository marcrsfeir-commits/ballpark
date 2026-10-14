// Local static server for BALLPARK: node serve.js  ->  http://localhost:8813
// (On GitHub Pages the same files are served statically; no server code is needed there.)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8813;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

// FUSE live mode: invent unknown combinations with the local Ollama model (only when running locally).
const FUSE_SYSTEM = `You are the crafting engine of a word-combining game like Infinite Craft. The player drops two things together; you answer with what they make.
Rules: the result is ONE thing (noun or proper noun, 1-3 words, Title Case) — object, creature, place, person, concept, food, pop-culture icon or phenomenon.
It should feel logical but fun and a little surprising (Water + Fire = Steam, Plant + Time = Tree, Human + Fire = Firefighter). A thing combined with itself makes a bigger version.
Never just repeat one of the inputs. Family-friendly only. Also choose ONE emoji for the result. Reply with JSON only: {"result": "...", "emoji": "..."}`;
async function fuse(req, res) {
  let body = '';
  for await (const c of req) { body += c; if (body.length > 2000) break; }
  try {
    const { a, b } = JSON.parse(body);
    const r = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.FUSE_MODEL || 'qwen2.5:32b', stream: false, format: 'json', keep_alive: '30m', options: { temperature: 0.4, num_predict: 60 },
        messages: [{ role: 'system', content: FUSE_SYSTEM }, { role: 'user', content: `${String(a).slice(0, 40)} + ${String(b).slice(0, 40)}` }] }),
    });
    const out = JSON.parse((await r.json()).message.content);
    const n = String(out.result || '').replace(/["'.!]+/g, '').trim().split(/\s+/).slice(0, 3).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const e = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(String(out.emoji || '✨'))][0]?.segment || '✨';
    const bad = !n || n.length > 32 || [a, b].some(x => String(x).toLowerCase() === n.toLowerCase());
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(bad ? { n: null } : { n, e }));
  } catch (err) {
    res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'ollama unavailable' }));
  }
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'POST' && p === '/api/fuse') return fuse(req, res);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(file, (err, st) => {
    const target = !err && st.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(target, (e, buf) => {
      if (e) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`BALLPARK running at http://localhost:${PORT}`));
