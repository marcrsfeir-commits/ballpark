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

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
