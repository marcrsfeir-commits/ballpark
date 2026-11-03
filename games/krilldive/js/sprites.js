// Procedural pixel-art sprites: shapes are drawn at tiny resolution, alpha is snapped to
// 0/255 (no anti-aliasing) and a per-column shading pass adds highlights + shadows.
const cache = new Map();

function make(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, w, h);
  cache.set(key, c);
  return c;
}
function snap(g, w, h, cut = 110) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > cut ? 255 : 0;
  g.putImageData(id, 0, 0);
}
function shade(g, w, h, hi, lo) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  const set = (x, y, hex) => {
    const i = (y * w + x) * 4;
    d[i] = parseInt(hex.slice(1, 3), 16); d[i + 1] = parseInt(hex.slice(3, 5), 16); d[i + 2] = parseInt(hex.slice(5, 7), 16);
  };
  for (let x = 0; x < w; x++) {
    let top = -1, bot = -1;
    for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
    if (top < 0 || bot - top < 2) continue;
    if (hi) set(x, top, hi);
    if (lo) set(x, bot, lo);
  }
  g.putImageData(id, 0, 0);
}
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
function pline(g, x0, y0, x1, y1, c) {
  g.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// ---------- palettes ----------
export const KRILL_SKINS = {
  krill:  { name: 'THE KRILL',   body: '#ff3b5c', body2: '#ff5a74', hi: '#ffa3b3', lo: '#a3163a', leg: '#ff7d92', eye: '#16070d', glow: 'rgba(255,60,90,0.55)' },
  golden: { name: 'GOLDEN KRILL', body: '#ffc42e', body2: '#ffd75e', hi: '#fff1b8', lo: '#b9790d', leg: '#ffdf7a', eye: '#2a1700', glow: 'rgba(255,205,60,0.6)' },
  evil:   { name: 'EVIL KRILL',  body: '#d7dce4', body2: '#eef1f5', hi: '#ffffff', lo: '#7f8796', leg: '#b8c0cc', eye: '#ff1f3d', glow: 'rgba(255,40,70,0.35)' },
  ghost:  { name: 'GHOST KRILL', body: '#7fe7ff', body2: '#a9f0ff', hi: '#e6fbff', lo: '#2f8fb3', leg: '#a9f0ff', eye: '#04202b', glow: 'rgba(110,230,255,0.6)' },
};

export function krill(skin = 'krill', frame = 0) {
  const p = KRILL_SKINS[skin] || KRILL_SKINS.krill;
  return make(`krill:${skin}:${frame}`, 30, 22, (g, w, h) => {
    g.fillStyle = p.lo;
    poly(g, [6, 15, 0.5, 19.5, 3.5, 18.5, 5.5, 21.5, 8.5, 16]); // tail fan
    const seg = [[6.8, 14.4, 2.5], [8.8, 12.1, 2.9], [11.3, 10.5, 3.3], [14.3, 9.5, 3.6], [17.4, 9.1, 3.8]];
    seg.forEach(([x, y, r], i) => { g.fillStyle = i % 2 ? p.body : p.body2; ell(g, x, y, r * 1.08, r); });
    g.fillStyle = p.body; ell(g, 21.2, 9.0, 4.9, 3.9);       // carapace
    poly(g, [24.5, 7.4, 28, 8.4, 24.5, 10.2]);               // rostrum
    snap(g, w, h);
    shade(g, w, h, p.hi, p.lo);
    // segment seams
    for (const sx of [9, 12, 15]) for (let y = 0; y < h; y++) {
      const a = g.getImageData(sx, y, 1, 1).data[3];
      if (a && y > 6 && y < 15) px(g, sx, y, p.lo);
    }
    // legs (two poses for paddling)
    const sw = frame ? 1 : -1;
    for (let k = 0; k < 5; k++) { const x = 20 - k * 2.4, y = 12.5 + k * 0.3; pline(g, x, y, x + sw, y + 3, p.leg); }
    for (let k = 0; k < 3; k++) { const x = 11 - k * 2, y = 13.5 + k; pline(g, x, y, x - sw, y + 2, p.leg); }
    // antennae
    pline(g, 23, 6, 29, 0, p.leg); pline(g, 24, 7, 29, 4, p.hi);
    // eye
    px(g, 22, 7, p.eye); px(g, 23, 7, p.eye); px(g, 22, 8, p.eye); px(g, 23, 8, p.eye); px(g, 22, 7, skin === 'evil' ? '#ff8a9a' : '#ffffff');
  });
}

export function fish(color = '#0c2236', eye = null, key = 'f') {
  return make(`fish:${key}:${color}`, 16, 8, (g, w, h) => {
    g.fillStyle = color;
    ell(g, 9.2, 4, 5.6, 2.9);
    poly(g, [4.2, 4, 0, 0.6, 1.2, 4, 0, 7.4]);
    poly(g, [8, 1.6, 11, 0, 11.5, 2]);
    snap(g, w, h);
    if (eye) px(g, 12, 3, eye);
  });
}

export function schoolerIcon() {
  return make('icon:schooler', 16, 8, (g, w, h) => {
    g.fillStyle = '#4fd1ff';
    ell(g, 9.2, 4, 5.6, 2.9); poly(g, [4.2, 4, 0, 0.6, 1.2, 4, 0, 7.4]); poly(g, [8, 1.6, 11, 0, 11.5, 2]);
    snap(g, w, h); shade(g, w, h, '#b9f0ff', '#1d7fa6'); px(g, 12, 3, '#06141f');
  });
}

export function clownIcon() {
  return make('icon:clown', 18, 10, (g, w, h) => {
    g.fillStyle = '#ff8a2a';
    ell(g, 10, 5, 6.5, 3.6); poly(g, [4.5, 5, 0, 1, 1.5, 5, 0, 9]); poly(g, [8, 1.8, 11, 0, 12.5, 2]);
    snap(g, w, h);
    for (const sx of [7, 12]) for (let y = 0; y < h; y++) if (g.getImageData(sx, y, 1, 1).data[3]) { px(g, sx, y, '#ffffff'); px(g, sx + 1, y, '#ffffff'); }
    shade(g, w, h, null, '#9c3d00'); px(g, 14, 4, '#1a0d00');
  });
}

export function squid(color = '#ff3b5c', key = 'sq') {
  return make(`squid:${key}:${color}`, 14, 28, (g, w, h) => {
    g.fillStyle = color;
    poly(g, [7, 0, 0.5, 6, 13.5, 6]);       // fin
    ell(g, 7, 9, 4, 7.5);                    // mantle
    ell(g, 7, 17.5, 3.4, 2.4);               // head
    snap(g, w, h);
    shade(g, w, h, '#ffb0bd', '#8d1230');
    px(g, 5, 17, '#fff'); px(g, 9, 17, '#fff');
    for (let k = 0; k < 6; k++) {
      const x = 4 + k * 1.2;
      for (let y = 19; y < 27 - (k % 2) * 2; y++) px(g, Math.round(x + Math.sin(y * 0.8 + k) * 0.8), y, color);
    }
    pline(g, 5, 19, 3, 27, color); pline(g, 9, 19, 11, 27, color);
  });
}

export function angler(body = '#2a2140', key = 'an') {
  return make(`angler:${key}:${body}`, 28, 20, (g, w, h) => {
    g.fillStyle = body;
    ell(g, 13, 12, 9, 6.8);
    poly(g, [5, 12, 0, 7, 1.5, 12, 0, 17]);
    poly(g, [12, 5.5, 15, 3, 16, 6]);
    snap(g, w, h);
    shade(g, w, h, '#5a4a7a', '#120c1f');
    g.fillStyle = '#05030a';                 // mouth
    poly(g, [17, 12, 23, 9, 23, 16]);
    for (const [x, y] of [[19, 10], [21, 9], [19, 14], [21, 15], [22, 12]]) px(g, x, y, '#eef0ff');
    px(g, 17, 9, '#d8fff5');                 // eye
    pline(g, 14, 5, 17, 1, '#6d5b93'); pline(g, 17, 1, 22, 1, '#6d5b93'); pline(g, 22, 1, 24, 3, '#6d5b93');
    px(g, 24, 4, '#c6fff1'); px(g, 25, 4, '#c6fff1'); px(g, 24, 5, '#7fffe0'); px(g, 25, 5, '#7fffe0');
  });
}

export function jelly(color = '#ff9ad5', key = 'j') {
  return make(`jelly:${key}:${color}`, 14, 20, (g, w, h) => {
    g.fillStyle = color;
    g.beginPath(); g.ellipse(7, 7, 6.5, 6, 0, Math.PI, 0); g.closePath(); g.fill();
    g.fillRect(0.5, 6.5, 13, 1.5);
    snap(g, w, h);
    shade(g, w, h, '#ffffff', null);
    for (let k = 0; k < 4; k++) for (let y = 8; y < 19 - (k % 2) * 3; y++) px(g, Math.round(2 + k * 3.2 + Math.sin(y * 0.7 + k) * 0.9), y, color);
  });
}

export function whale(color = '#0a1a2a') {
  return make(`whale:${color}`, 66, 22, (g, w, h) => {
    g.fillStyle = color;
    poly(g, [36, 3, 60, 3, 64.5, 7, 65, 14, 60, 19, 32, 19.5, 14, 15, 6, 12, 14, 9.5, 28, 5]);
    poly(g, [7, 12, 0, 5, 3, 12, 0, 19]);
    poly(g, [40, 18, 44, 22, 47, 18]);
    snap(g, w, h);
  });
}

export function eel(color = '#1c2b2a') {
  return make(`eel:${color}`, 44, 10, (g, w, h) => {
    g.fillStyle = color;
    for (let x = 2; x < 42; x += 0.5) {
      const r = 2.6 * Math.min(1, (42 - x) / 30 + 0.25) * Math.min(1, x / 4 + 0.4);
      ell(g, x, 5 + Math.sin(x * 0.28) * 2, r * 0.6, r);
    }
    snap(g, w, h);
    shade(g, w, h, '#3c5552', null);
    px(g, 40, 4, '#c8f7ff');
  });
}

export function snailfish(color = '#e6c4cf') {
  return make(`snail:${color}`, 18, 9, (g, w, h) => {
    g.fillStyle = color;
    ell(g, 12, 4.5, 5, 3.6);
    poly(g, [8, 2, 0, 4.5, 8, 7.5]);
    snap(g, w, h);
    shade(g, w, h, '#fff4f7', '#a57d8b');
    px(g, 14, 3, '#2b1a20');
  });
}

export function boat() {
  return make('boat', 36, 22, (g, w, h) => {
    g.fillStyle = '#16212d';
    poly(g, [1, 13, 35, 13, 31, 19.5, 5, 19.5]);
    g.fillRect(11, 8, 12, 5.5);
    g.fillRect(20, 10, 9, 3.5);
    snap(g, w, h);
    for (const x of [13, 16, 19]) { px(g, x, 10, '#4b6680'); px(g, x + 1, 10, '#4b6680'); }
    pline(g, 17, 0, 17, 8, '#16212d');
    g.fillStyle = '#ff5c7a'; g.fillRect(11, 1, 6, 3); px(g, 10, 2, '#ff5c7a');
    pline(g, 26, 5, 26, 10, '#16212d'); pline(g, 26, 5, 31, 8, '#16212d');
  });
}

export function cloud(seed = 0) {
  return make(`cloud:${seed}`, 56, 22, (g, w, h) => {
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = '#ffffff';
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = 8 + (i / (n - 1)) * 40 + (r() - 0.5) * 4;
      const rad = 4 + r() * 5 + (i > 0 && i < n - 1 ? 3 : 0);
      ell(g, x, 16 - rad * 0.55, rad, rad * 0.85);
    }
    g.fillRect(6, 14, 44, 5);
    snap(g, w, h);
    shade(g, w, h, null, '#cfe0f0');
    const id = g.getImageData(0, 0, w, h), d = id.data;   // second shadow row
    for (let x = 0; x < w; x++) {
      let bot = -1;
      for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3]) bot = y;
      if (bot > 2) { const i = ((bot - 1) * w + x) * 4; d[i] = 0xe3; d[i + 1] = 0xee; d[i + 2] = 0xf8; }
    }
    g.putImageData(id, 0, 0);
  });
}

export function titanic() {
  return make('titanic', 150, 46, (g, w, h) => {
    const c = '#122233';
    g.fillStyle = c;
    poly(g, [4, 30, 92, 24, 96, 32, 92, 42, 14, 44]);            // bow section, tilted into the mud
    g.fillRect(20, 22, 60, 6);
    for (const x of [30, 46, 62]) poly(g, [x, 22, x + 2, 9, x + 8, 9, x + 8, 22]);
    poly(g, [112, 34, 146, 30, 148, 44, 110, 45]);               // stern section, broken away
    poly(g, [98, 40, 104, 37, 107, 44, 97, 45]);                 // debris
    snap(g, w, h);
    shade(g, w, h, '#2a4560', null);
    pline(g, 6, 29, 22, 12, '#1d3349'); pline(g, 22, 12, 22, 22, '#1d3349');
    for (let x = 18; x < 88; x += 5) px(g, x, 33, '#24405a');
  });
}

export function bubbles(color = '#cfe3f2') {
  return make(`bubbles:${color}`, 16, 16, (g) => {
    // midpoint circles: crisp 1-px rings
    const ring = (cx, cy, r) => {
      let x = r, y = 0, err = 1 - r;
      while (x >= y) {
        for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) px(g, cx + a, cy + b, color);
        y++;
        if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
      }
    };
    ring(6, 10, 5); ring(12, 4, 3); ring(13, 12, 2);
    px(g, 4, 8, '#ffffff'); px(g, 3, 9, '#ffffff'); px(g, 11, 3, '#ffffff');
  });
}

// Emblem for each themed pack card.
export function packArt(id) {
  return make(`pack:${id}`, 30, 26, (g, w, h) => {
    switch (id) {
      case 'geography': {
        g.fillStyle = '#2f7fd0'; ell(g, 15, 13, 11, 11);
        g.save(); g.beginPath(); g.ellipse(15, 13, 11, 11, 0, 0, Math.PI * 2); g.clip();
        g.fillStyle = '#5cc46a'; ell(g, 10, 9, 5, 4); ell(g, 19, 17, 4, 5); ell(g, 22, 6, 3, 2); ell(g, 8, 19, 2, 2);
        g.restore();
        snap(g, w, h); shade(g, w, h, '#a9dcff', '#174a80');
        break;
      }
      case 'movies': {
        g.fillStyle = '#2b2b3d'; g.fillRect(4, 10, 22, 14);
        g.fillStyle = '#e8e8f0'; poly(g, [3, 4, 26, 1, 27, 6, 4, 9]);
        snap(g, w, h);
        for (let x = 6; x < 26; x += 5) { pline(g, x, 3, x + 2, 7, '#2b2b3d'); pline(g, x + 1, 3, x + 3, 7, '#2b2b3d'); }
        pline(g, 6, 14, 23, 14, '#555570'); pline(g, 6, 18, 18, 18, '#555570');
        break;
      }
      case 'music': {
        g.fillStyle = '#c77dff'; ell(g, 8, 20, 4, 3, -0.4); ell(g, 21, 17, 4, 3, -0.4);
        g.fillRect(10.5, 4, 2, 16); g.fillRect(23.5, 1, 2, 16); poly(g, [10.5, 4, 25.5, 1, 25.5, 5, 10.5, 8]);
        snap(g, w, h); shade(g, w, h, '#ecd3ff', '#7a3fb0');
        break;
      }
      case 'sports': {
        g.fillStyle = '#f2f4f8'; ell(g, 15, 13, 11, 11);
        snap(g, w, h); shade(g, w, h, null, '#9aa3b5');
        g.fillStyle = '#1b1f2a';
        poly(g, [15, 9, 19, 12, 17.5, 16.5, 12.5, 16.5, 11, 12]);
        for (const [x, y] of [[15, 2.5], [25, 10], [21, 22], [9, 22], [5, 10]]) ell(g, x, y, 2.4, 2);
        snap(g, w, h);
        break;
      }
      case 'food': {
        g.fillStyle = '#ff7a4d'; g.beginPath(); g.ellipse(15, 13, 12, 10, 0, 0, Math.PI); g.closePath(); g.fill();
        g.fillRect(11, 22, 8, 2.5);
        snap(g, w, h); shade(g, w, h, null, '#a8401f');
        for (let x = 5; x < 26; x++) px(g, x, 12 + Math.round(Math.sin(x * 1.3)), '#ffd86b');
        for (let x = 6; x < 25; x++) px(g, x, 10 + Math.round(Math.sin(x * 1.1 + 1)), '#ffe9a6');
        pline(g, 17, 11, 27, 0, '#c99a62'); pline(g, 19, 11, 29, 2, '#a87b48');
        break;
      }
      case 'animals': {
        const wh = whale('#5aa0d8');
        g.drawImage(wh, 0, 0, 66, 22, 0, 6, 30, 10);
        snap(g, w, h); shade(g, w, h, '#b3dcff', '#2b5f8f');
        px(g, 25, 9, '#0b1628');
        break;
      }
      case 'science': {
        g.fillStyle = '#d9f6ff'; g.fillRect(12, 1, 6, 9); poly(g, [12, 9, 18, 9, 27, 24, 3, 24]);
        snap(g, w, h);
        g.fillStyle = '#66e0ff'; poly(g, [8.5, 16, 21.5, 16, 26, 24, 4, 24]);
        snap(g, w, h); shade(g, w, h, null, '#1b8fb3');
        px(g, 12, 19, '#ffffff'); px(g, 16, 21, '#ffffff'); px(g, 14, 12, '#ffffff'); px(g, 16, 7, '#9fe9ff');
        break;
      }
      case 'words': {
        g.fillStyle = '#f2f4f8'; poly(g, [2, 5, 15, 7, 15, 24, 2, 22]); poly(g, [28, 5, 15, 7, 15, 24, 28, 22]);
        snap(g, w, h); shade(g, w, h, null, '#8fa8ff');
        for (let r = 0; r < 5; r++) { pline(g, 4, 9 + r * 3, 12, 10 + r * 3, '#8fa8ff'); pline(g, 18, 10 + r * 3, 26, 9 + r * 3, '#8fa8ff'); }
        pline(g, 15, 7, 15, 24, '#5b6fb0');
        break;
      }
      case 'games': {
        g.fillStyle = '#4a4f66'; ell(g, 8, 14, 6.5, 6.5); ell(g, 22, 14, 6.5, 6.5); g.fillRect(8, 8, 14, 10);
        snap(g, w, h); shade(g, w, h, '#7a809c', '#2a2e40');
        g.fillStyle = '#d7dbe8'; g.fillRect(5, 13, 6, 2); g.fillRect(7, 11, 2, 6);
        px(g, 22, 11, '#ff5ca8'); px(g, 24, 13, '#46d3f0'); px(g, 20, 13, '#ffd23f'); px(g, 22, 15, '#7bd88f');
        break;
      }
      case 'history': {
        g.fillStyle = '#e8c27a'; g.fillRect(6, 2, 18, 3); g.fillRect(8, 5, 14, 2); g.fillRect(9, 7, 12, 14); g.fillRect(7, 21, 16, 2); g.fillRect(5, 23, 20, 3);
        snap(g, w, h); shade(g, w, h, '#fff0c9', '#9c7a3a');
        for (const x of [11, 14, 17]) pline(g, x, 8, x, 20, '#b8954f');
        break;
      }
      case 'tv': {
        g.fillStyle = '#3a3550'; g.fillRect(2, 6, 26, 18);
        snap(g, w, h); shade(g, w, h, '#6a6290', '#1d1a2c');
        g.fillStyle = '#7fd3ff'; g.fillRect(5, 9, 17, 12);
        g.fillStyle = '#c8f0ff'; g.fillRect(6, 10, 6, 2);
        px(g, 25, 11, '#ff6b6b'); px(g, 25, 15, '#ffd23f');
        pline(g, 10, 5, 6, 0, '#9a94b8'); pline(g, 18, 5, 23, 0, '#9a94b8');
        break;
      }
      case 'anime': {
        g.fillStyle = '#fff4fb'; ell(g, 15, 11, 13, 9); poly(g, [7, 17, 4, 25, 13, 19]);
        snap(g, w, h); shade(g, w, h, null, '#ff8fd8');
        g.fillStyle = '#ff3fa4'; g.fillRect(14, 4, 3, 9); g.fillRect(14, 15, 3, 3);
        break;
      }
      case 'brands': {
        g.fillStyle = '#ffb347'; poly(g, [5, 9, 25, 9, 27, 25, 3, 25]);
        snap(g, w, h); shade(g, w, h, '#ffd9a3', '#b8741f');
        pline(g, 10, 9, 10, 4, '#7a4a12'); pline(g, 10, 4, 12, 2, '#7a4a12'); pline(g, 12, 2, 18, 2, '#7a4a12'); pline(g, 18, 2, 20, 4, '#7a4a12'); pline(g, 20, 4, 20, 9, '#7a4a12');
        g.fillStyle = '#fff'; g.fillRect(12, 14, 6, 5);
        break;
      }
      case 'body': {
        g.fillStyle = '#ff5a7a'; ell(g, 10, 9, 6, 6); ell(g, 20, 9, 6, 6); poly(g, [4.5, 11, 25.5, 11, 15, 24]);
        snap(g, w, h); shade(g, w, h, '#ffb3c2', '#a3163a');
        px(g, 8, 6, '#ffffff'); px(g, 9, 6, '#ffffff'); px(g, 8, 7, '#ffffff');
        break;
      }
      case 'transport': {
        g.fillStyle = '#4fc3f7'; g.fillRect(2, 12, 26, 7); poly(g, [7, 12, 10, 6, 21, 6, 24, 12]);
        snap(g, w, h); shade(g, w, h, '#b3e8ff', '#1b7fb3');
        g.fillStyle = '#d8f4ff'; g.fillRect(11, 7, 4, 4); g.fillRect(17, 7, 4, 4);
        g.fillStyle = '#1b1f2a'; ell(g, 8, 20, 3.4, 3.4); ell(g, 22, 20, 3.4, 3.4);
        g.fillStyle = '#9aa3b5'; g.fillRect(7, 19, 2, 2); g.fillRect(21, 19, 2, 2);
        break;
      }
      case 'hobbies': {
        g.fillStyle = '#e8c98f'; ell(g, 15, 14, 13, 10);
        g.globalCompositeOperation = 'destination-out'; ell(g, 21, 19, 3, 2.5); g.globalCompositeOperation = 'source-over';
        snap(g, w, h); shade(g, w, h, '#fff0cf', '#a5824a');
        for (const [x, y, c] of [[7, 10, '#ff5c7a'], [12, 7, '#ffd23f'], [18, 7, '#46d3f0'], [23, 11, '#7bd88f'], [9, 16, '#b38cff']]) { g.fillStyle = c; g.fillRect(x, y, 3, 3); }
        break;
      }
      case 'landmarks': {
        g.fillStyle = '#f4a261';
        poly(g, [15, 0, 17, 8, 13, 8]); poly(g, [13, 8, 17, 8, 20, 16, 10, 16]); poly(g, [10, 16, 20, 16, 26, 26, 4, 26]);
        snap(g, w, h); shade(g, w, h, '#ffd5b0', '#9c5a24');
        g.globalCompositeOperation = 'destination-out'; ell(g, 15, 26, 4, 5); g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#9c5a24'; g.fillRect(10, 15, 10, 1); g.fillRect(12, 8, 6, 1);
        break;
      }
      case 'people': {
        g.fillStyle = '#ffd166';
        const pts = [];
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(15 + Math.cos(a) * r, 14 + Math.sin(a) * r); }
        poly(g, pts);
        snap(g, w, h); shade(g, w, h, '#fff1c2', '#b8861d');
        break;
      }
      case 'books': {
        g.fillStyle = '#6a4fc4'; poly(g, [15, 0, 23, 19, 7, 19]); g.fillRect(2, 18, 26, 5);
        snap(g, w, h); shade(g, w, h, '#a18be8', '#3a2a7a');
        for (const [x, y] of [[13, 9], [17, 13], [14, 15], [11, 12]]) px(g, x, y, '#ffd23f');
        px(g, 15, 0, '#ffd23f');
        break;
      }
      case 'odds': {
        g.fillStyle = '#9c6b3c'; g.fillRect(3, 10, 24, 14); g.beginPath(); g.ellipse(15, 10, 12, 6, 0, Math.PI, 0); g.fill();
        snap(g, w, h); shade(g, w, h, '#d29b62', '#5a3a1c');
        g.fillStyle = '#ffd23f'; g.fillRect(3, 11, 24, 2); g.fillRect(13, 10, 4, 6);
        px(g, 14, 13, '#5a3a1c'); px(g, 15, 13, '#5a3a1c');
        break;
      }
      case 'art': { // framed landscape
        g.fillStyle = '#e0a93a'; g.fillRect(2, 2, 26, 22);
        snap(g, w, h); shade(g, w, h, '#ffe08a', '#8a5f17');
        g.fillStyle = '#8fd3ff'; g.fillRect(5, 5, 20, 16);
        g.fillStyle = '#4caf6a'; poly(g, [5, 21, 5, 15, 11, 10, 17, 16, 21, 13, 25, 17, 25, 21]);
        g.fillStyle = '#ffd23f'; ell(g, 20, 8.5, 2, 2);
        snap(g, w, h);
        pline(g, 11, 10, 17, 16, '#2f7d48');
        break;
      }
      case 'cars': { // low sports car, side on
        g.fillStyle = '#ff3d2e'; poly(g, [1, 18, 2, 13, 9, 12, 13, 7, 21, 7, 25, 12, 29, 13, 29, 18]);
        snap(g, w, h); shade(g, w, h, '#ff9a8f', '#9c1a10');
        g.fillStyle = '#bfe8ff'; poly(g, [14, 8, 19, 8, 22, 12, 12, 12]);
        g.fillStyle = '#1b1f2a'; ell(g, 8, 19, 3.6, 3.6); ell(g, 23, 19, 3.6, 3.6);
        snap(g, w, h);
        g.fillStyle = '#9aa3b5'; g.fillRect(7, 18, 2, 2); g.fillRect(22, 18, 2, 2);
        px(g, 28, 14, '#ffe9a6'); px(g, 1, 14, '#ff9a8f');
        break;
      }
      case 'cartoons': { // comic "POW" burst
        g.fillStyle = '#ffd23f';
        const pts = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? 7 : 13, a = i * Math.PI / 8; pts.push(15 + Math.cos(a) * r, 13 + Math.sin(a) * r * .9); }
        poly(g, pts);
        snap(g, w, h); shade(g, w, h, '#fff1a8', '#c4831a');
        g.fillStyle = '#ff3f6c'; g.fillRect(14, 6, 3, 9); g.fillRect(14, 17, 3, 3);
        break;
      }
      case 'earth': { // volcano under a smoky sky
        g.fillStyle = '#7a5a3a'; poly(g, [0, 26, 11, 9, 19, 9, 30, 26]);
        snap(g, w, h); shade(g, w, h, '#a8835a', null);
        g.fillStyle = '#ff6a1f'; poly(g, [11, 9, 19, 9, 17, 14, 14, 12, 12, 16]);
        g.fillStyle = '#9ccc4a'; poly(g, [0, 26, 5, 19, 9, 22, 13, 20, 18, 23, 24, 19, 30, 24, 30, 26]);
        g.fillStyle = '#9aa3b5'; ell(g, 13, 4, 3, 2.5); ell(g, 18, 3, 3.5, 3); ell(g, 22, 5, 2.5, 2);
        snap(g, w, h);
        px(g, 15, 7, '#ffd23f'); px(g, 12, 6, '#ffd23f'); px(g, 18, 7, '#ff6a1f');
        break;
      }
      case 'fashion': { // dress on a hanger
        g.fillStyle = '#D6336C'; poly(g, [11, 8, 19, 8, 18, 13, 25, 25, 5, 25, 12, 13]);
        snap(g, w, h); shade(g, w, h, '#ff8fb5', '#8a1640');
        pline(g, 12, 13, 18, 13, '#ffd23f');
        pline(g, 5, 7, 15, 3, '#cfd6e6'); pline(g, 15, 3, 25, 7, '#cfd6e6'); pline(g, 15, 3, 15, 1, '#cfd6e6'); px(g, 16, 0, '#cfd6e6');
        break;
      }
      case 'football': { // goal, net and ball
        g.fillStyle = '#f2f4f8'; g.fillRect(2, 3, 26, 2); g.fillRect(2, 3, 2, 21); g.fillRect(26, 3, 2, 21);
        for (let x = 7; x < 26; x += 4) pline(g, x, 5, x, 23, '#8a93a8');
        for (let y = 9; y < 24; y += 4) pline(g, 4, y, 25, y, '#8a93a8');
        g.fillStyle = '#00c853'; g.fillRect(0, 24, 30, 2);
        g.fillStyle = '#ffffff'; ell(g, 15, 19, 4, 4);
        snap(g, w, h);
        g.fillStyle = '#1b1f2a'; g.fillRect(14, 18, 2, 2); px(g, 12, 17, '#1b1f2a'); px(g, 18, 21, '#1b1f2a');
        break;
      }
      case 'heroes': { // shield with a lightning bolt
        g.fillStyle = '#ff2d55'; poly(g, [4, 2, 26, 2, 26, 12, 15, 25, 4, 12]);
        snap(g, w, h); shade(g, w, h, '#ff8fa5', '#8a0f2a');
        g.fillStyle = '#ffd23f'; poly(g, [17, 4, 10, 14, 15, 14, 12, 22, 21, 10, 16, 10]);
        snap(g, w, h);
        break;
      }
      case 'holidays': { // gift box with a bow
        g.fillStyle = '#E4572E'; g.fillRect(4, 11, 22, 14); g.fillRect(2, 7, 26, 5);
        snap(g, w, h); shade(g, w, h, '#ff9a7a', '#8a2a10');
        g.fillStyle = '#ffd23f'; g.fillRect(13, 7, 4, 18); g.fillRect(2, 12, 26, 1);
        ell(g, 11, 4, 4, 2.5); ell(g, 19, 4, 4, 2.5);
        snap(g, w, h);
        g.fillStyle = '#c4831a'; g.fillRect(14, 4, 2, 3);
        break;
      }
      case 'home': { // house
        g.fillStyle = '#e8b04a'; g.fillRect(6, 12, 18, 13);
        g.fillStyle = '#c0392b'; poly(g, [2, 13, 15, 2, 28, 13]);
        g.fillRect(20, 3, 3, 6);
        snap(g, w, h); shade(g, w, h, null, '#7a1f15');
        g.fillStyle = '#6b3f1d'; g.fillRect(13, 17, 5, 8);
        g.fillStyle = '#bfe8ff'; g.fillRect(8, 15, 4, 4); g.fillRect(19, 15, 3, 4);
        px(g, 17, 21, '#ffd23f');
        break;
      }
      case 'jobs': { // briefcase
        g.fillStyle = '#8a5a2b'; g.fillRect(2, 8, 26, 16);
        snap(g, w, h); shade(g, w, h, '#c08a52', '#4a2e12');
        pline(g, 10, 8, 10, 4, '#4a2e12'); pline(g, 10, 4, 20, 4, '#4a2e12'); pline(g, 20, 4, 20, 8, '#4a2e12');
        pline(g, 2, 14, 27, 14, '#4a2e12');
        g.fillStyle = '#ffd23f'; g.fillRect(13, 12, 4, 4);
        break;
      }
      case 'mideast': { // palm tree over a dune at sunset
        g.fillStyle = '#ffb347'; ell(g, 22, 9, 5, 5);
        g.fillStyle = '#e8b04a'; g.beginPath(); g.ellipse(15, 28, 18, 8, 0, Math.PI, 0); g.fill();
        snap(g, w, h); shade(g, w, h, '#ffd9a3', null);
        for (let y = 9; y < 23; y++) px(g, 10 + Math.round((23 - y) * .15), y, '#7a4a12'), px(g, 11 + Math.round((23 - y) * .15), y, '#5a3410');
        g.fillStyle = '#2e8b57';
        poly(g, [12, 8, 3, 7, 1, 11]); poly(g, [12, 8, 21, 6, 24, 10]); poly(g, [12, 8, 6, 2, 3, 3]); poly(g, [12, 8, 17, 1, 20, 3]); poly(g, [12, 8, 8, 14, 6, 13]); poly(g, [12, 8, 17, 13, 19, 12]);
        snap(g, w, h);
        break;
      }
      case 'myths': { // thunder hammer
        g.fillStyle = '#9aa7c7'; g.fillRect(5, 2, 20, 12); g.fillRect(4, 3, 22, 10);
        snap(g, w, h); shade(g, w, h, '#dfe6ff', '#4a5578');
        g.fillStyle = '#7a4a12'; g.fillRect(13, 14, 4, 9);
        for (const y of [15, 18, 21]) pline(g, 13, y, 16, y + 1, '#4a2e12');
        g.fillStyle = '#5f6bff'; g.fillRect(12, 23, 6, 3);
        g.fillStyle = '#c4cde8'; g.fillRect(9, 5, 12, 6); pline(g, 9, 8, 20, 8, '#6a77a0');
        pline(g, 28, 0, 26, 5, '#ffd23f'); pline(g, 26, 5, 29, 6, '#ffd23f'); pline(g, 29, 6, 27, 11, '#ffd23f');
        pline(g, 2, 0, 1, 4, '#ffd23f'); pline(g, 1, 4, 3, 5, '#ffd23f'); pline(g, 3, 5, 1, 9, '#ffd23f');
        break;
      }
      case 'ocean': { // curling wave
        g.fillStyle = '#2ea8d8'; g.beginPath(); g.moveTo(0, 26); g.lineTo(0, 16); g.quadraticCurveTo(6, 2, 18, 4); g.quadraticCurveTo(27, 6, 25, 14);
        g.quadraticCurveTo(21, 8, 15, 11); g.quadraticCurveTo(12, 16, 18, 19); g.lineTo(30, 19); g.lineTo(30, 26); g.closePath(); g.fill();
        snap(g, w, h); shade(g, w, h, '#e6f7ff', '#155a7a');
        for (let x = 0; x < 30; x++) px(g, x, 22 + Math.round(Math.sin(x * .8)), '#7fd3ff');
        px(g, 24, 13, '#ffffff'); px(g, 25, 12, '#ffffff'); px(g, 22, 9, '#ffffff');
        break;
      }
      case 'outdoors': { // sun, cloud, rain
        g.fillStyle = '#ffd23f'; ell(g, 20, 7, 6, 6);
        snap(g, w, h); shade(g, w, h, '#fff1a8', '#c4831a');
        g.fillStyle = '#eef3fb'; ell(g, 9, 13, 6, 5); ell(g, 16, 11, 6, 6); ell(g, 21, 14, 5, 4); g.fillRect(4, 13, 21, 5);
        snap(g, w, h); shade(g, w, h, null, '#9aa7c0');
        for (const x of [7, 12, 17, 22]) pline(g, x, 20, x - 1, 23, '#4fc3f7');
        break;
      }
      case 'plants': { // potted plant
        g.fillStyle = '#c9683a'; poly(g, [8, 17, 22, 17, 20, 26, 10, 26]); g.fillRect(7, 16, 16, 3);
        snap(g, w, h); shade(g, w, h, '#f0a07a', '#7a3a1a');
        g.fillStyle = '#4ade80'; ell(g, 9, 9, 5, 2.6, -0.6); ell(g, 21, 8, 5, 2.6, 0.6); ell(g, 15, 5, 2.6, 5); ell(g, 11, 13, 4, 2, -0.3); ell(g, 19, 13, 4, 2, 0.3);
        snap(g, w, h); shade(g, w, h, '#b7f7cf', '#1f7a43');
        pline(g, 15, 16, 15, 6, '#1f7a43');
        break;
      }
      case 'school': { // pencil
        g.fillStyle = '#E8A317'; poly(g, [3, 21, 21, 3, 26, 8, 8, 26]);
        snap(g, w, h); shade(g, w, h, '#ffd76a', '#8a5a0a');
        g.fillStyle = '#ffb3c2'; poly(g, [21, 3, 24, 0, 30, 6, 26, 8]);
        g.fillStyle = '#9aa3b5'; poly(g, [20, 4, 22, 2, 27, 7, 25, 9]);
        g.fillStyle = '#f2d2a0'; poly(g, [3, 21, 8, 26, 1, 28]);
        snap(g, w, h);
        px(g, 1, 25, '#2b2b3d'); px(g, 2, 25, '#2b2b3d'); px(g, 1, 24, '#2b2b3d');
        break;
      }
      case 'space': { // ringed planet
        g.strokeStyle = '#c49a1a'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(15, 13, 14, 4, -0.3, Math.PI + 0.15, -0.15); g.stroke();
        snap(g, w, h);
        g.fillStyle = '#7c6cf0'; ell(g, 15, 13, 8, 8);
        snap(g, w, h); shade(g, w, h, '#c4bcff', '#3a2a9a');
        pline(g, 8, 10, 22, 10, '#a99cff'); pline(g, 8, 15, 22, 15, '#5a4ad0');
        g.strokeStyle = '#ffd23f'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(15, 13, 14, 4, -0.3, 0.15, Math.PI - 0.15); g.stroke();
        snap(g, w, h);
        px(g, 3, 3, '#ffffff'); px(g, 26, 2, '#ffffff'); px(g, 27, 22, '#ffffff'); px(g, 4, 21, '#cfd6ff');
        break;
      }
      case 'tech': { // smartphone
        g.fillStyle = '#2a2e40'; g.fillRect(8, 1, 14, 24);
        snap(g, w, h); shade(g, w, h, '#5a6080', '#12141e');
        g.fillStyle = '#22C3A6'; g.fillRect(10, 4, 10, 16);
        g.fillStyle = '#b8fff0'; g.fillRect(11, 5, 3, 3); g.fillRect(15, 5, 3, 3); g.fillRect(11, 9, 3, 3); g.fillRect(15, 9, 3, 3);
        g.fillStyle = '#9aa3b5'; g.fillRect(13, 22, 4, 1);
        break;
      }
      case 'toys': { // teddy bear face
        g.fillStyle = '#b8794a'; ell(g, 7, 6, 4, 4); ell(g, 23, 6, 4, 4); ell(g, 15, 14, 11, 10);
        snap(g, w, h); shade(g, w, h, '#e0a878', '#6a3e1e');
        g.fillStyle = '#f0c9a0'; ell(g, 15, 17, 5, 4); ell(g, 7, 6, 2, 2); ell(g, 23, 6, 2, 2);
        snap(g, w, h);
        g.fillStyle = '#1b1f2a'; g.fillRect(10, 11, 2, 2); g.fillRect(18, 11, 2, 2); g.fillRect(14, 15, 3, 2);
        px(g, 15, 18, '#6a3e1e');
        break;
      }
      case 'world': { // two speech bubbles: languages
        g.fillStyle = '#2BB3A3'; g.fillRect(1, 2, 17, 11); poly(g, [4, 12, 4, 17, 9, 12]);
        snap(g, w, h); shade(g, w, h, '#8ff0e3', '#126b60');
        g.fillStyle = '#ffd23f'; g.fillRect(12, 10, 17, 11); poly(g, [25, 20, 26, 25, 20, 20]);
        snap(g, w, h); shade(g, w, h, '#fff1a8', '#c4831a');
        pline(g, 6, 10, 9, 4, '#ffffff'); pline(g, 9, 4, 12, 10, '#ffffff'); pline(g, 7, 8, 11, 8, '#ffffff');
        for (const x of [16, 20, 24]) { px(g, x, 15, '#7a4a12'); px(g, x + 1, 15, '#7a4a12'); }
        break;
      }
      case 'dinos': { // long-neck sauropod
        g.fillStyle = '#9ccc65'; ell(g, 13, 16, 8, 5);
        poly(g, [17, 13, 21, 4, 24, 4, 21, 15]); ell(g, 24, 4, 3.5, 2);
        poly(g, [6, 15, 0, 21, 7, 18]);
        g.fillRect(7, 18, 3, 7); g.fillRect(16, 18, 3, 7);
        snap(g, w, h); shade(g, w, h, '#d6f5a8', '#4a7a22');
        px(g, 25, 3, '#1b1f2a');
        for (const [x, y] of [[10, 13], [13, 12], [16, 14]]) px(g, x, y, '#6aa83a');
        break;
      }
      default: {
        const k = krill('krill', 0);
        g.drawImage(k, 0, 2);
      }
    }
  });
}

// Icon (canvas) for each tier, used in result cards, the dive log and the reveal list.
export function tierIcon(tier) {
  switch (tier) {
    case 'plankton': return bubbles();
    case 'tooclever': return clownIcon();
    case 'schooler': return schoolerIcon();
    case 'rare': return squid('#ff3b5c', 'icon');
    case 'deepcut': return angler('#3b2d5c', 'icon');
    case 'krillion': return krill('golden', 0);
    default: return null;
  }
}

// <img> element of a sprite at an integer scale (crisp).
export function spriteImg(canvas, scale = 3, cls = '') {
  const img = new Image();
  img.src = canvas.toDataURL();
  img.width = canvas.width * scale; img.height = canvas.height * scale;
  img.className = 'pix ' + cls;
  img.alt = '';
  return img;
}

export const MASCOTS = {
  krill:  { name: 'THE KRILL', draw: f => krill('krill', f) },
  golden: { name: 'GOLDEN KRILL', draw: f => krill('golden', f) },
  evil:   { name: 'EVIL KRILL', draw: f => krill('evil', f) },
  ghost:  { name: 'GHOST KRILL', draw: f => krill('ghost', f) },
  fish:   { name: 'SCHOOLER', draw: () => schoolerIcon() },
  squid:  { name: 'RARE SQUID', draw: () => squid('#ff3b5c', 'mascot') },
  angler: { name: 'DEEP CUT ANGLER', draw: () => angler('#3b2d5c', 'mascot') },
  jelly:  { name: 'MOON JELLY', draw: () => jelly('#ff9ad5', 'mascot') },
};
export const MASCOT_GLOW = { krill: 'rgba(255,60,90,0.55)', golden: 'rgba(255,205,60,0.6)', evil: 'rgba(255,40,70,0.35)', ghost: 'rgba(110,230,255,0.6)', fish: 'rgba(79,209,255,0.45)', squid: 'rgba(255,60,90,0.5)', angler: 'rgba(127,255,224,0.5)', jelly: 'rgba(255,154,213,0.55)' };
