// The ocean: one tall world (sky -> surface -> 7,000 m trench) drawn on a full-screen canvas.
import * as S from './sprites.js';
import { TIERS, TIER_ORDER, rng, M_PER_POINT, pts, dir, tierInfo, iconKey } from './engine.js';

export const PPM = 1.6;               // screen pixels per metre
const SPRITE = 3;                      // pixel-art scale

const WATER = [
  [0, [61, 124, 174]], [30, [47, 108, 156]], [120, [33, 86, 131]], [300, [22, 62, 99]], [600, [15, 42, 69]],
  [1000, [11, 29, 49]], [2000, [8, 22, 39]], [4000, [6, 15, 28]], [6000, [4, 10, 19]], [7000, [3, 7, 13]], [9000, [2, 4, 8]],
];
function waterRGB(m) {
  if (m <= WATER[0][0]) return WATER[0][1];
  for (let i = 1; i < WATER.length; i++) {
    if (m <= WATER[i][0]) {
      const [d0, c0] = WATER[i - 1], [d1, c1] = WATER[i], t = (m - d0) / (d1 - d0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return WATER[WATER.length - 1][1];
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const MARKERS = [
  [45, 'L', '── the recreational dive limit'],
  [110, 'R', 'red light is gone. everything looks blue ──'],
  [200, 'L', '── THE TWILIGHT ZONE'],
  [332, 'R', 'deepest scuba dive ever — 332m ──'],
  [450, 'L', '── sperm whales start hunting below here'],
  [560, 'R', 'emperor penguins have dived this deep ──'],
  [700, 'L', '── pressure: 70x the surface'],
  [850, 'R', 'siphonophores drift by, 40 metres long ──'],
  [1000, 'L', '── THE MIDNIGHT ZONE · no sunlight at all'],
  [1300, 'R', 'anglerfish dangle their lures ──'],
  [1700, 'L', '── vampire squid territory'],
  [2100, 'R', 'sperm whales wrestle giant squid down here ──'],
  [2500, 'L', '── the water hovers around 2°C'],
  [2992, 'R', "cuvier's beaked whale — deepest mammal dive ──"],
  [3500, 'L', '── utterly black. forever.'],
  [3800, 'R', 'the Titanic rests here — 3,800m ──'],
  [4000, 'L', '── THE ABYSSAL ZONE'],
  [4600, 'R', 'the abyssal plain: mud, sea cucumbers, silence ──'],
  [5200, 'L', '── pressure: over 500x the surface'],
  [6000, 'R', 'THE HADAL ZONE · named for Hades ──'],
  [6500, 'L', '── hadal snailfish glide past'],
  [7000, 'R', 'the trench floor — a perfect dive ends here ──'],
];

export class Ocean {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.t = 0;
    this.cam = { depth: -40, frac: 0.57 };      // depth shown at `frac` of screen height
    this.camTarget = { depth: -40, frac: 0.57 };
    this.follow = 3.2;
    this.playerDepth = 0;
    this.showRuler = false;
    this.showYou = false;
    this.tiers = null;                           // { base, passed: Set, lit, hover }
    this.mascot = { x: 0, y: 0, tx: 0, ty: 0, skin: 'krill', face: 1, frame: 0, hide: false };
    this.bubbles = [];
    this.motion = true;
    this.resize();
    this.mascot.x = this.W * 0.82; this.mascot.y = this.H * 0.5;
    this._populate();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.W = innerWidth; this.H = innerHeight;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.g.imageSmoothingEnabled = false;
    this.skyM = (0.57 * this.H) / PPM;   // metres of sky visible on the home screen
    this.snow = Array.from({ length: Math.round(this.W * this.H / 9000) }, (_, i) => ({
      x: Math.random() * this.W, y: Math.random() * this.H, z: 0.5 + Math.random() * 0.9, s: Math.random() < 0.25 ? 2 : 1, v: 2 + Math.random() * 6,
    }));
  }

  // depth (m) -> screen y
  y(m) { return (m - this.cam.depth) * PPM + this.cam.frac * this.H; }
  depthAt(y) { return (y - this.cam.frac * this.H) / PPM + this.cam.depth; }
  setCamera(depth, frac = this.camTarget.frac, instant = false) {
    this.camTarget.depth = depth; this.camTarget.frac = frac;
    if (instant || !this.motion) { this.cam.depth = depth; this.cam.frac = frac; }
  }

  _populate() {
    const r = rng('ocean-life');
    const life = [];
    for (let i = 0; i < 9; i++) {                        // schools of small fish
      const n = 3 + Math.floor(r() * 6), d = 25 + r() * 420, x = r(), dir = r() < 0.5 ? -1 : 1, sp = 10 + r() * 18;
      for (let k = 0; k < n; k++) life.push({ type: 'fish', d: d + (r() - 0.5) * 18, x: x + (r() - 0.5) * 0.08, dir, sp, ph: r() * 6 });
    }
    for (let i = 0; i < 7; i++) life.push({ type: 'fish', d: 300 + r() * 900, x: r(), dir: r() < 0.5 ? -1 : 1, sp: 6 + r() * 10, ph: r() * 6, big: true });
    for (let i = 0; i < 14; i++) life.push({ type: 'jelly', d: 250 + r() * 1700, x: r(), dir: r() < 0.5 ? -1 : 1, sp: 2 + r() * 3, ph: r() * 6, hue: r() });
    life.push({ type: 'whale', d: 480, x: 0.2, dir: 1, sp: 9, ph: 0 });
    life.push({ type: 'whale', d: 2080, x: 0.7, dir: -1, sp: 7, ph: 1 });
    for (let i = 0; i < 5; i++) life.push({ type: 'squid', d: 1500 + r() * 1100, x: r(), dir: r() < 0.5 ? -1 : 1, sp: 4 + r() * 4, ph: r() * 6 });
    for (let i = 0; i < 12; i++) life.push({ type: 'angler', d: 1050 + r() * 2900, x: r(), dir: r() < 0.5 ? -1 : 1, sp: 3 + r() * 4, ph: r() * 6 });
    for (let i = 0; i < 8; i++) life.push({ type: 'eel', d: 4200 + r() * 1900, x: r(), dir: r() < 0.5 ? -1 : 1, sp: 5 + r() * 6, ph: r() * 6 });
    for (let i = 0; i < 7; i++) life.push({ type: 'snail', d: 6150 + r() * 780, x: r(), dir: r() < 0.5 ? -1 : 1, sp: 3 + r() * 3, ph: r() * 6 });
    for (let i = 0; i < 70; i++) life.push({ type: 'spark', d: 900 + r() * 6000, x: r(), dir: 1, sp: 0, ph: r() * 20 });
    this.life = life;
    // cloud depth is a fraction of the visible sky (skyM), so they sit nicely on any screen size
    this.clouds = Array.from({ length: 6 }, (_, i) => ({ seed: i + 1, x: (i / 6) + r() * 0.08, d: 0.3 + r() * 0.6, sp: 3 + r() * 6, sc: r() < 0.35 ? 3 : 2 }));
    // trench walls: jagged profile every 25 m
    this.walls = [];
    for (let m = 5400; m <= 7200; m += 25) {
      const k = Math.min(1, Math.max(0, (m - 5400) / 1600));
      this.walls.push({ m, l: 0.04 + k * 0.30 + r() * 0.05, rr: 0.04 + k * 0.30 + r() * 0.05 });
    }
  }

  spawnBubbles(x, m, n = 10, spread = 16) {
    for (let i = 0; i < n; i++) this.bubbles.push({ x: x + (Math.random() - 0.5) * spread, m: m + (Math.random() - 0.5) * 6, r: 1 + Math.random() * 3, life: 1.5 + Math.random() * 2, age: 0, ph: Math.random() * 6 });
  }

  update(dt) {
    this.t += dt;
    const k = this.motion ? 1 - Math.exp(-dt * this.follow) : 1;
    this.cam.depth += (this.camTarget.depth - this.cam.depth) * k;
    this.cam.frac += (this.camTarget.frac - this.cam.frac) * k;
    for (const c of this.life) { c.x += (c.dir * c.sp * dt) / this.W; if (c.x > 1.15) c.x = -0.15; if (c.x < -0.15) c.x = 1.15; }
    for (const c of this.clouds) { c.x += (c.sp * dt) / this.W; if (c.x > 1.2) c.x = -0.25; }
    for (const p of this.snow) { p.y += p.v * dt; }
    this.bubbles = this.bubbles.filter(b => (b.age += dt) < b.life);
    for (const b of this.bubbles) { b.m -= dt * (14 + b.r * 6); b.x += Math.sin(this.t * 4 + b.ph) * 0.3; }
    // mascot easing
    const ms = this.mascot, mk = this.motion ? 1 - Math.exp(-dt * 2.2) : 1;
    const ox = ms.x;
    ms.x += (ms.tx - ms.x) * mk; ms.y += (ms.ty - ms.y) * mk;
    if (Math.abs(ms.x - ox) > 0.15) ms.face = ms.x > ox ? 1 : -1;
    ms.frame = Math.floor(this.t * 5) % 2;
  }

  render() {
    const g = this.g, W = this.W, H = this.H, t = this.t;
    const top = this.depthAt(0), bot = this.depthAt(H);
    const surfY = this.y(0);

    // sky
    if (surfY > 0) {
      const sky = g.createLinearGradient(0, surfY - 520, 0, surfY);
      sky.addColorStop(0, '#6fb0dc'); sky.addColorStop(0.6, '#a9d3ee'); sky.addColorStop(1, '#e4f3fc');
      g.fillStyle = sky; g.fillRect(0, 0, W, Math.min(H, surfY + 2));
      // sun (pixel disc, 4-px blocks)
      const sx = Math.round(W * 0.84 / 4) * 4, sy = Math.round(this.y(-this.skyM * 0.78) / 4) * 4;
      const glow = g.createRadialGradient(sx, sy, 10, sx, sy, 150);
      glow.addColorStop(0, 'rgba(255,240,170,0.7)'); glow.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = glow; g.fillRect(sx - 150, sy - 150, 300, 300);
      const disc = (cx, cy, r, col) => {
        g.fillStyle = col;
        for (let yy = -r; yy <= r; yy++) { const w = Math.round(Math.sqrt(r * r - yy * yy)); g.fillRect(cx - w * 4, cy + yy * 4, w * 8, 4); }
      };
      disc(sx, sy, 9, '#ffc94d');
      disc(sx - 4, sy - 4, 7, '#ffd86b');
      disc(sx - 8, sy - 8, 3, '#ffeaa6');
      for (const c of this.clouds) {
        const img = S.cloud(c.seed), cy = this.y(-c.d * this.skyM);
        if (cy > surfY - 40) continue;
        g.drawImage(img, Math.round(c.x * W), Math.round(cy), img.width * c.sc, img.height * c.sc);
      }
    }

    // water gradient
    const wTop = Math.max(0, surfY);
    if (wTop < H) {
      const grad = g.createLinearGradient(0, wTop, 0, H);
      const d0 = Math.max(0, this.depthAt(wTop)), d1 = Math.max(d0 + 1, bot);
      for (let i = 0; i <= 8; i++) { const m = d0 + (d1 - d0) * (i / 8); grad.addColorStop(i / 8, rgb(waterRGB(m))); }
      g.fillStyle = grad; g.fillRect(0, wTop, W, H - wTop);
    }

    // light rays near the surface
    if (top < 420 && surfY < H) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const x = ((i * 0.17 + 0.05) * W + Math.sin(t * 0.25 + i) * 30);
        const a = 0.035 + 0.02 * Math.sin(t * 0.6 + i * 1.7);
        const y0 = Math.max(surfY, 0), y1 = this.y(380);
        const lg = g.createLinearGradient(0, y0, 0, y1);
        lg.addColorStop(0, `rgba(190,225,255,${a})`); lg.addColorStop(1, 'rgba(190,225,255,0)');
        g.fillStyle = lg;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 40, y0); g.lineTo(x + 40 + 260, y1); g.lineTo(x + 140, y1); g.closePath(); g.fill();
      }
      g.restore();
    }

    // marine snow (parallax)
    const deepness = Math.min(1, Math.max(0, (top - 40) / 700));
    if (surfY < H) {
      const camPx = this.cam.depth * PPM;
      for (const p of this.snow) {
        const yy = (((p.y - camPx * p.z) % (H + 20)) + H + 20) % (H + 20) - 10;
        if (yy < surfY + 4) continue;
        g.fillStyle = `rgba(170,205,230,${(0.12 + deepness * 0.35) * (p.z > 1 ? 1 : 0.7)})`;
        g.fillRect(Math.round(p.x), Math.round(yy), p.s, p.s);
      }
    }

    this._markers(g, top, bot);
    this._life(g, top, bot);
    this._trench(g, top, bot);

    // surface waves + boat
    if (surfY > -30 && surfY < H + 30) {
      const water = rgb(waterRGB(2));
      g.fillStyle = water;
      g.beginPath(); g.moveTo(0, surfY + 30);
      for (let x = 0; x <= W + 4; x += 4) {
        const yy = Math.round((surfY + Math.sin(x * 0.018 + t * 1.1) * 3 + Math.sin(x * 0.05 - t * 1.6) * 1.4) / 2) * 2;
        g.lineTo(x, yy);
      }
      g.lineTo(W, surfY + 30); g.closePath(); g.fill();
      g.fillStyle = 'rgba(210,235,250,0.55)';
      for (let x = 0; x <= W; x += 4) {
        const yy = Math.round((surfY + Math.sin(x * 0.018 + t * 1.1) * 3 + Math.sin(x * 0.05 - t * 1.6) * 1.4) / 2) * 2;
        g.fillRect(x, yy, 4, 2);
      }
      const b = S.boat(), bx = Math.round(W * 0.3 - 50), by = Math.round(surfY - b.height * SPRITE + 14 + Math.sin(t * 1.4) * 2);
      g.drawImage(b, bx, by, b.width * SPRITE, b.height * SPRITE);
    }

    this._kelp(g, top);
    this._tierLines(g);
    this._bubbles(g);
    this._ruler(g, top, bot);
    this._mascot(g);
  }

  _markers(g, top, bot) {
    g.font = '11px "Cascadia Mono", Consolas, "Courier New", monospace';
    g.textBaseline = 'middle';
    for (const [m, side, text] of MARKERS) {
      if (m < top - 20 || m > bot + 20) continue;
      const yy = Math.round(this.y(m));
      const zone = text === text.toUpperCase() && /[A-Z]/.test(text);
      const k = this.tiers ? 0.45 : 1;
      g.fillStyle = zone ? `rgba(170,205,235,${0.62 * k})` : `rgba(140,175,205,${0.42 * k})`;
      if (side === 'L') { g.textAlign = 'left'; g.fillText(text, 40, yy); }
      else { g.textAlign = 'right'; g.fillText(text, this.W - 72, yy); }
    }
    g.textAlign = 'left';
  }

  _life(g, top, bot) {
    const W = this.W, t = this.t;
    for (const c of this.life) {
      if (c.d < top - 60 || c.d > bot + 60) continue;
      const x = Math.round(c.x * W), yy = Math.round(this.y(c.d) + Math.sin(t * 0.8 + c.ph) * 4);
      g.save();
      if (c.dir < 0) { g.translate(x, yy); g.scale(-1, 1); g.translate(-x, -yy); }
      switch (c.type) {
        case 'fish': {
          const shade = c.d < 300 ? '#0c2236' : '#0a1828';
          const img = S.fish(shade, null, c.big ? 'b' : 's'), sc = c.big ? 3 : 2;
          g.globalAlpha = c.d > 600 ? 0.6 : 1;
          g.drawImage(img, x, yy, img.width * sc, img.height * sc);
          break;
        }
        case 'jelly': {
          const col = c.hue < 0.5 ? '#ff9ad5' : '#8fe9ff';
          const img = S.jelly(col, col);
          const pulse = 1 + Math.sin(t * 2 + c.ph) * 0.06;
          this._glow(g, x + 21, yy + 15, 34, c.hue < 0.5 ? 'rgba(255,140,210,0.18)' : 'rgba(120,230,255,0.18)');
          g.globalAlpha = 0.55;
          g.drawImage(img, x, yy, img.width * 3, img.height * 3 * pulse);
          break;
        }
        case 'whale': {
          const img = S.whale(c.d < 1000 ? '#0c2236' : '#07111d');
          g.drawImage(img, x, yy, img.width * 4, img.height * 4);
          break;
        }
        case 'squid': {
          const img = S.squid('#7a1830', 'deep');
          g.globalAlpha = 0.75;
          g.save(); g.translate(x, yy); g.rotate(Math.PI / 2 * (c.dir > 0 ? 1 : 1)); g.drawImage(img, -20, -20, img.width * 3, img.height * 3); g.restore();
          break;
        }
        case 'angler': {
          const img = S.angler('#1a1530', 'deep');
          const flick = 0.7 + 0.3 * Math.sin(t * 3 + c.ph);
          this._glow(g, x + 74, yy + 14, 26 * flick, `rgba(127,255,224,${0.35 * flick})`);
          g.drawImage(img, x, yy, img.width * 3, img.height * 3);
          break;
        }
        case 'eel': {
          const img = S.eel('#12201f');
          g.globalAlpha = 0.85;
          g.drawImage(img, x, yy, img.width * 3, img.height * 3);
          break;
        }
        case 'snail': {
          const img = S.snailfish();
          this._glow(g, x + 27, yy + 13, 26, 'rgba(255,200,215,0.12)');
          g.globalAlpha = 0.65;
          g.drawImage(img, x, yy, img.width * 3, img.height * 3);
          break;
        }
        case 'spark': {
          const a = Math.max(0, Math.sin(t * 0.9 + c.ph));
          if (a > 0.2) { this._glow(g, x, yy, 7, `rgba(120,255,230,${a * 0.5})`); g.fillStyle = `rgba(190,255,240,${a})`; g.fillRect(x, yy, 2, 2); }
          break;
        }
      }
      g.restore();
    }
    // the Titanic wreck, resting at 3,800 m
    if (top < 3850 && bot > 3700) {
      const img = S.titanic();
      g.globalAlpha = 0.9;
      g.drawImage(img, Math.round(this.W * 0.08), Math.round(this.y(3800) - 120), img.width * 3, img.height * 3);
      g.globalAlpha = 1;
    }
  }

  _trench(g, top, bot) {
    if (bot < 5400) return;
    const W = this.W;
    for (const side of ['l', 'rr']) {
      g.beginPath();
      const x0 = side === 'l' ? 0 : W;
      g.moveTo(x0, this.y(5400));
      for (const w of this.walls) {
        const xx = side === 'l' ? w.l * W : W - w.rr * W;
        g.lineTo(Math.round(xx / 4) * 4, Math.round(this.y(w.m)));
      }
      g.lineTo(x0, this.y(7300)); g.closePath();
      g.fillStyle = '#02050a'; g.fill();
      g.strokeStyle = 'rgba(40,70,100,0.35)'; g.lineWidth = 2; g.stroke();
    }
    // floor
    const fy = this.y(7000);
    if (fy < this.H + 40) {
      g.fillStyle = '#060b12';
      g.fillRect(0, Math.round(fy + 14), W, this.H);
      g.fillStyle = 'rgba(70,100,130,0.35)';
      for (let x = 0; x < W; x += 6) g.fillRect(x, Math.round(fy + 14 + Math.sin(x * 0.07) * 3), 6, 2);
    }
  }

  _kelp(g, top) {
    if (top > 2600) return;
    const H = this.H, t = this.t;
    const a = 0.5 * Math.max(0, 1 - top / 2600);
    g.fillStyle = `rgba(3,14,26,${a})`;
    const stalks = [[0.035, 1, 30], [0.07, 0.75, 24], [0.93, 0.9, 28], [0.965, 0.6, 22]];
    for (const [fx, hgt, n] of stalks) {
      const bx = fx * this.W;
      for (let i = 0; i < n * hgt; i++) {
        const yy = H - i * 6;
        const sway = Math.sin(t * 0.9 + i * 0.25 + fx * 10) * (i * 0.45);
        const x = Math.round((bx + sway) / 3) * 3;
        g.fillRect(x, yy, 6, 6);
        if (i % 3 === 0 && i > 2) { g.fillRect(x + 6, yy - 3, 9, 3); g.fillRect(x - 9, yy + 2, 9, 3); }
      }
    }
  }

  _tierLines(g) {
    const T = this.tiers;
    if (!T) return;
    const W = this.W, x0 = Math.round(W * 0.08), x1 = Math.round(W * 0.88);
    g.font = '11px "Cascadia Mono", Consolas, monospace';
    g.textBaseline = 'middle'; g.textAlign = 'right';
    for (const key of T.order || TIER_ORDER) {
      const tier = tierInfo(key), m = T.base + dir() * pts(key) * M_PER_POINT, yy = Math.round(this.y(m));
      if (yy < -20 || yy > this.H + 20) continue;
      const lit = T.lit === key, passed = T.passed.has(key);
      g.fillStyle = lit ? tier.color : passed ? 'rgba(200,225,245,0.55)' : 'rgba(150,185,215,0.35)';
      for (let x = x0; x < x1 - 150; x += 8) g.fillRect(x, yy, 4, lit ? 2 : 1);
      if (lit) this._glow(g, x1 - 160, yy, 60, tier.color + '33');
      const label = `${tier.name} · ${pts(key)}`;
      g.fillStyle = lit ? tier.color : passed ? 'rgba(220,235,250,0.85)' : 'rgba(170,200,225,0.6)';
      g.fillText(label, x1, yy);
      const icon = S.tierIcon(iconKey(key));
      if (icon) { g.globalAlpha = lit || passed ? 1 : 0.55; g.drawImage(icon, x1 - g.measureText(label).width - icon.width * 1 - 8, yy - icon.height / 2, icon.width, icon.height); g.globalAlpha = 1; }
    }
    g.textAlign = 'left';
  }

  _bubbles(g) {
    g.strokeStyle = 'rgba(210,235,255,0.7)'; g.lineWidth = 1;
    for (const b of this.bubbles) {
      const yy = this.y(b.m), a = 1 - b.age / b.life;
      if (yy < this.y(0)) continue;
      g.globalAlpha = a;
      g.beginPath(); g.arc(Math.round(b.x), Math.round(yy), b.r, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  }

  _ruler(g, top, bot) {
    if (!this.showRuler) return;
    const x = this.W - 14, surfY = Math.max(0, this.y(0));
    g.fillStyle = 'rgba(150,185,215,0.35)';
    g.fillRect(x, surfY, 1, this.H - surfY);
    g.font = '9px "Cascadia Mono", Consolas, monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
    const start = Math.max(0, Math.floor(top / 20) * 20);
    for (let m = start; m <= bot; m += 20) {
      const yy = Math.round(this.y(m));
      const major = m % 100 === 0;
      g.fillStyle = major ? 'rgba(170,205,235,0.6)' : 'rgba(150,185,215,0.3)';
      g.fillRect(x - (major ? 8 : 4), yy, major ? 8 : 4, 1);
      if (major && m % (bot - top > 1400 ? 500 : 100) === 0) g.fillText(m === 0 ? '0m' : `-${m.toLocaleString()}m`, x - 11, yy);
    }
    if (this.showYou) {
      const yy = Math.round(this.y(this.playerDepth));
      if (yy > 0 && yy < this.H) {
        g.fillStyle = '#ff5c8a';
        g.fillRect(x - 16, yy, 16, 1);
        g.beginPath(); g.moveTo(x - 1, yy); g.lineTo(x + 6, yy - 4); g.lineTo(x + 6, yy + 4); g.closePath(); g.fill();
        g.font = '9px "Cascadia Mono", Consolas, monospace';
        g.fillText('YOU', x - 20, yy);
      }
    }
    g.textAlign = 'left';
  }

  _mascot(g) {
    const ms = this.mascot;
    if (ms.hide) return;
    const img = S.MASCOTS[ms.skin]?.draw(ms.frame) || S.krill('krill', ms.frame);
    const sc = 2, w = img.width * sc, h = img.height * sc;
    const bob = Math.sin(this.t * 2.2) * 3;
    this._glow(g, ms.x, ms.y + bob, 42, S.MASCOT_GLOW[ms.skin] || S.MASCOT_GLOW.krill);
    g.save();
    g.translate(Math.round(ms.x), Math.round(ms.y + bob));
    g.scale(ms.face, 1);
    g.drawImage(img, -Math.round(w / 2), -Math.round(h / 2), w, h);
    g.restore();
  }

  _glow(g, x, y, r, color) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  hitMascot(x, y) { return Math.hypot(x - this.mascot.x, y - this.mascot.y) < 34; }
}
