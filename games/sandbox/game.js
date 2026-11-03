// SANDLOT: falling-sand sandbox for BALLPARK.
// One typed-array cellular grid (type / data / shade), drawn through a single ImageData and scaled up with
// image-rendering: pixelated. Free-flying particles, rigid bodies, creatures, bullets and black holes live
// beside the grid and are drawn into the same pixel buffer.
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const cvs = $('#world');
  const ctx = cvs.getContext('2d', { alpha: false });
  const stage = $('#stage');
  const store = window.Ballpark ? Ballpark.store('sandbox') : { get: (k, f) => f, set() {} };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- fast RNG ----------
  let rs = (Math.random() * 0xffffffff) >>> 0 || 1;
  const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };
  const rndi = n => (rnd() * n) | 0;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------- materials ----------
  const EMPTY = 0, SAND = 1, WATER = 2, STONE = 3, WOOD = 4, OIL = 5, LAVA = 6, ICE = 7, STEAM = 8, SMOKE = 9, ACID = 10,
    POWDER = 11, SEED = 12, PLANT = 13, METAL = 14, GLASS = 15, SALT = 16, SNOW = 17, FIRE = 18, VIRUS = 19, DUST = 20,
    CLONE = 21, BOLT = 22, BURN = 23, SLIME = 24, NT = 25;
  const K_SOLID = 1, K_POWDER = 2, K_LIQ = 3, K_GAS = 4, K_FIRE = 5, K_FX = 6;
  const KIND = new Uint8Array(NT), DENS = new Uint8Array(NT), FLAM = new Float32Array(NT);
  const BASE = [], VARY = new Float32Array(NT), NAME = [];
  function def(t, name, kind, dens, flam, rgb, vary) { NAME[t] = name; KIND[t] = kind; DENS[t] = dens; FLAM[t] = flam; BASE[t] = rgb; VARY[t] = vary; }
  def(EMPTY, 'Empty', 0, 0, 0, [0, 0, 0], 0);
  def(SAND, 'Sand', K_POWDER, 60, 0, [222, 194, 122], .08);
  def(WATER, 'Water', K_LIQ, 30, 0, [44, 118, 226], .05);
  def(STONE, 'Stone', K_SOLID, 90, 0, [112, 114, 124], .1);
  def(WOOD, 'Wood', K_SOLID, 90, .05, [133, 86, 44], .1);
  def(OIL, 'Oil', K_LIQ, 20, .5, [96, 64, 28], .06);
  def(LAVA, 'Lava', K_LIQ, 50, 0, [255, 96, 20], .1);
  def(ICE, 'Ice', K_SOLID, 90, 0, [170, 222, 248], .05);
  def(STEAM, 'Steam', K_GAS, 1, 0, [206, 214, 226], .04);
  def(SMOKE, 'Smoke', K_GAS, 2, 0, [96, 96, 104], .08);
  def(ACID, 'Acid', K_LIQ, 31, 0, [140, 255, 60], .08);
  def(POWDER, 'Gunpowder', K_POWDER, 58, 1, [72, 70, 78], .2);
  def(SEED, 'Seed', K_POWDER, 45, .1, [176, 132, 62], .12);
  def(PLANT, 'Plant', K_SOLID, 90, .1, [56, 172, 70], .14);
  def(METAL, 'Metal', K_SOLID, 90, 0, [150, 160, 174], .06);
  def(GLASS, 'Glass', K_SOLID, 90, 0, [196, 234, 246], .05);
  def(SALT, 'Salt', K_POWDER, 57, 0, [240, 240, 236], .04);
  def(SNOW, 'Snow', K_POWDER, 34, 0, [246, 250, 255], .03);
  def(FIRE, 'Fire', K_FIRE, 1, 0, [255, 150, 30], 0);
  def(VIRUS, 'Virus', K_SOLID, 90, 0, [186, 52, 226], .1);
  def(DUST, 'Dust', K_POWDER, 36, .02, [128, 122, 114], .12);
  def(CLONE, 'Clone', K_SOLID, 90, 0, [214, 182, 40], .05);
  def(BOLT, 'Bolt', K_FX, 0, 0, [235, 244, 255], 0);
  def(BURN, 'Burning', K_SOLID, 90, 0, [200, 70, 20], 0);
  def(SLIME, 'Slime', K_LIQ, 33, 0, [112, 72, 136], .08);

  const pack = (r, g, b) => (0xff000000 | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0;
  function mix(a, b, f) {
    const ar = a & 255, ag = (a >>> 8) & 255, ab = (a >>> 16) & 255;
    const br = b & 255, bg_ = (b >>> 8) & 255, bb = (b >>> 16) & 255;
    return pack(ar + (br - ar) * f, ag + (bg_ - ag) * f, ab + (bb - ab) * f);
  }
  const pal = new Uint32Array(NT * 8);
  for (let t = 1; t < NT; t++) for (let s = 0; s < 8; s++) {
    const k = 1 + (s / 7 - .5) * 2 * VARY[t], [r, g, b] = BASE[t];
    pal[t * 8 + s] = pack(r * k, g * k, b * k);
  }
  const ramp = (stops, n) => { const out = new Uint32Array(n); for (let i = 0; i < n; i++) { const f = i / (n - 1) * (stops.length - 1), a = Math.floor(f), b = Math.min(stops.length - 1, a + 1), u = f - a; out[i] = pack(stops[a][0] + (stops[b][0] - stops[a][0]) * u, stops[a][1] + (stops[b][1] - stops[a][1]) * u, stops[a][2] + (stops[b][2] - stops[a][2]) * u); } return out; };
  const firePal = ramp([[150, 20, 10], [230, 60, 15], [255, 140, 25], [255, 210, 70], [255, 250, 200]], 64);
  const lavaPal = ramp([[200, 40, 10], [255, 90, 20], [255, 150, 30], [255, 90, 20], [220, 50, 10], [255, 120, 30]], 16);
  const burnPal = ramp([[90, 20, 10], [200, 60, 15], [255, 120, 30], [160, 40, 12]], 8);
  const virusPal = ramp([[90, 20, 120], [186, 52, 226], [240, 120, 255], [186, 52, 226], [110, 28, 150]], 16);
  const flowerPal = [pack(255, 120, 180), pack(255, 220, 80), pack(250, 250, 250), pack(255, 140, 200), pack(200, 140, 255), pack(255, 200, 70), pack(255, 110, 150), pack(255, 255, 255)];
  const HOT = pack(255, 110, 30), ELEC = pack(200, 240, 255), WHITE = pack(255, 255, 255);

  // ---------- grid ----------
  let W = 0, H = 0, N = 0;
  let g, dat, shd, stamp, mask, elec, bg, img, pix;
  const elecList = [];
  function alloc(nw, nh) {
    const og = g, od = dat, os = shd, ow = W, oh = H;
    W = nw; H = nh; N = W * H;
    g = new Uint8Array(N); dat = new Uint8Array(N); shd = new Uint8Array(N); stamp = new Uint8Array(N); mask = new Uint8Array(N); elec = new Uint8Array(N);
    elecList.length = 0;
    const dy = H - (oh || H);
    if (og) {
      for (let y = 0; y < oh; y++) {
        const ny = y + dy; if (ny < 0 || ny >= H) continue;
        for (let x = 0; x < Math.min(ow, W); x++) { const a = y * ow + x, b = ny * W + x; g[b] = og[a]; dat[b] = od[a]; shd[b] = os[a]; }
      }
      const fix = e => { e.y += dy; e.x = clamp(e.x, 1, W - 2); e.y = clamp(e.y, 1, H - 1); };
      creatures.forEach(fix); bodies.forEach(fix); turrets.forEach(fix); wells.forEach(fix);
      pn = 0; bullets.length = 0;
    }
    cvs.width = W; cvs.height = H;
    img = ctx.createImageData(W, H);
    pix = new Uint32Array(img.data.buffer);
    bg = new Uint32Array(N);
    for (let y = 0; y < H; y++) {
      const f = y / H;
      const row = pack(13 + 10 * f, 17 + 6 * f, 30 + 4 * f);
      const dot = mix(row, pack(60, 70, 96), .35);
      for (let x = 0; x < W; x++) bg[y * W + x] = ((x & 15) === 0 && (y & 15) === 0) ? dot : row;
    }
  }
  function lifeOf(t) {
    switch (t) {
      case FIRE: return 20 + rndi(30);
      case STEAM: return 140 + rndi(160);
      case SMOKE: return 50 + rndi(70);
      case VIRUS: return 100 + rndi(80);
      case BOLT: return 9 + rndi(7);
      case BURN: return 140 + rndi(140);
      default: return 0;
    }
  }
  function set(i, t, d) { g[i] = t; dat[i] = d === undefined ? lifeOf(t) : d; shd[i] = rndi(8); stamp[i] = fid; }
  const DX = [1, -1, 0, 0, 1, -1, 1, -1], DY = [0, 0, 1, -1, 1, 1, -1, -1];
  function nbr(x, y, k) { const nx = x + DX[k], ny = y + DY[k]; return (nx < 0 || ny < 0 || nx >= W || ny >= H) ? -1 : ny * W + nx; }
  const rn8 = (x, y) => nbr(x, y, rndi(8));
  const rn4 = (x, y) => nbr(x, y, rndi(4));
  const movable = t => { const k = KIND[t]; return k === K_POWDER || k === K_LIQ || k === K_GAS || k === K_FIRE; };

  // ---------- state ----------
  let fid = 1, frame = 0, gdir = 1, paused = false, slow = false, stepOnce = false;
  let flash = 0, shake = 0;
  const creatures = [], bodies = [], turrets = [], wells = [], bullets = [], fx = [];
  const stats = { explosions: 0, nukes: 0, bolts: 0, spawned: 0, lost: 0, infected: 0, shots: 0, deaths: [], used: new Set(store.get('used', [])) };

  // ---------- particles ----------
  const PMAX = 7000;
  const PX = new Float32Array(PMAX), PY = new Float32Array(PMAX), PVX = new Float32Array(PMAX), PVY = new Float32Array(PMAX);
  const PT = new Uint8Array(PMAX), PL = new Int16Array(PMAX), PC = new Uint32Array(PMAX);
  let pn = 0;
  // life < 0: debris that settles back into the grid as type t. life > 0: glowing effect particle that fades out.
  function addP(x, y, vx, vy, t, life, col) {
    if (pn >= PMAX) return false;
    PX[pn] = x; PY[pn] = y; PVX[pn] = vx; PVY[pn] = vy; PT[pn] = t; PL[pn] = life; PC[pn] = col || 0; pn++;
    return true;
  }
  function killP(p) { pn--; PX[p] = PX[pn]; PY[p] = PY[pn]; PVX[p] = PVX[pn]; PVY[p] = PVY[pn]; PT[p] = PT[pn]; PL[p] = PL[pn]; PC[p] = PC[pn]; }
  function launch(i, vx, vy) { // lift a grid cell into a flying particle
    const t = g[i];
    if (!t || t === BOLT || t === CLONE) return false;
    if (!addP(i % W + .5, ((i / W) | 0) + .5, vx, vy, t === BURN ? FIRE : t, -1, 0)) return false;
    g[i] = 0; dat[i] = 0;
    return true;
  }
  function updParticles() {
    const grav = 0.11 * gdir;
    for (let p = pn - 1; p >= 0; p--) {
      let vx = PVX[p], vy = PVY[p];
      const t = PT[p];
      if (PL[p] > 0) { // effect particle: drift + fade
        if (--PL[p] <= 0) { killP(p); continue; }
        vy += grav * .15; vx *= .97; vy *= .97;
        PX[p] += vx; PY[p] += vy; PVX[p] = vx; PVY[p] = vy;
        if (PX[p] < 0 || PY[p] < 0 || PX[p] >= W || PY[p] >= H) killP(p);
        continue;
      }
      const k = KIND[t];
      vy += k === K_GAS || k === K_FIRE ? -grav * .4 : grav;
      vx *= .995; vy *= .995;
      for (const w of wells) { const dx = w.x - PX[p], dy = w.y - PY[p], d = Math.sqrt(dx * dx + dy * dy) + .5; if (d < 60) { const f = 1.6 / (d + 3); vx += dx / d * f - dy / d * f * .6; vy += dy / d * f + dx / d * f * .6; } }
      const sp = Math.max(Math.abs(vx), Math.abs(vy));
      const steps = Math.min(8, Math.ceil(sp)) || 1;
      let x = PX[p], y = PY[p], dead = false, settled = false;
      for (let s = 0; s < steps; s++) {
        const nx = x + vx / steps, ny = y + vy / steps;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
          if (ny >= H || ny < 0) { settled = true; break; } // hit floor/ceiling: settle at last good cell
          dead = true; break;
        }
        const j = (ny | 0) * W + (nx | 0);
        if (g[j] !== 0 || mask[j]) { settled = true; break; }
        x = nx; y = ny;
      }
      if (!dead && !settled && sp < .25) { // slowed down: settle if resting on something
        const by = (y | 0) + (gdir || 1);
        if (by < 0 || by >= H || g[by * W + (x | 0)] !== 0) settled = true;
      }
      for (const w of wells) { const dx = w.x - x, dy = w.y - y; if (dx * dx + dy * dy < 7) { dead = true; w.ate++; break; } }
      if (dead) { killP(p); continue; }
      if (settled) {
        const i = (y | 0) * W + (x | 0);
        if (g[i] === 0 && !mask[i]) set(i, t);
        else { const up = i - (gdir || 1) * W; if (up >= 0 && up < N && g[up] === 0 && !mask[up]) set(up, t); }
        killP(p); continue;
      }
      PX[p] = x; PY[p] = y; PVX[p] = vx; PVY[p] = vy;
    }
  }

  // ---------- cell movement ----------
  function swap(i, j) {
    const t = g[i]; g[i] = g[j]; g[j] = t;
    const d = dat[i]; dat[i] = dat[j]; dat[j] = d;
    const s = shd[i]; shd[i] = shd[j]; shd[j] = s;
    stamp[i] = fid; stamp[j] = fid;
  }
  function canEnter(j, d) {
    if (mask[j]) return false;
    const t = g[j];
    if (t === 0) return true;
    const k = KIND[t];
    return (k === K_LIQ || k === K_GAS || k === K_FIRE) && DENS[t] < d;
  }
  function powder(x, y, i, t, slide) {
    if (gdir === 0) return;
    const ny = y + gdir;
    if (ny < 0 || ny >= H) return;
    const j = i + gdir * W, d = DENS[t];
    if (canEnter(j, d)) { if (g[j] === 0 || rnd() < .5) swap(i, j); return; }
    if (rnd() > slide) return;
    const dir = rnd() < .5 ? -1 : 1;
    if (x + dir >= 0 && x + dir < W && canEnter(j + dir, d) && canEnter(i + dir, d)) { swap(i, j + dir); return; }
    if (x - dir >= 0 && x - dir < W && canEnter(j - dir, d) && canEnter(i - dir, d)) swap(i, j - dir);
  }
  function liquid(x, y, i, t, disp) {
    const d = DENS[t];
    if (gdir === 0) { if (rnd() < .06) { const k = rn4(x, y); if (k >= 0 && g[k] === 0 && !mask[k]) swap(i, k); } return; }
    const ny = y + gdir;
    if (ny >= 0 && ny < H) {
      const j = i + gdir * W;
      if (canEnter(j, d)) { swap(i, j); return; }
      const dir = rnd() < .5 ? -1 : 1;
      if (x + dir >= 0 && x + dir < W && canEnter(j + dir, d)) { swap(i, j + dir); return; }
      if (x - dir >= 0 && x - dir < W && canEnter(j - dir, d)) { swap(i, j - dir); return; }
    }
    const dir = rnd() < .5 ? -1 : 1;
    let tgt = -1;
    for (let k = 1; k <= disp; k++) {
      const xx = x + dir * k; if (xx < 0 || xx >= W) break;
      const c = i + dir * k; if (mask[c]) break;
      const tc = g[c];
      if (tc === 0 || KIND[tc] === K_GAS) { tgt = c; if (ny >= 0 && ny < H && g[c + gdir * W] === 0) break; }
      else if (KIND[tc] === K_LIQ && DENS[tc] < d) { tgt = c; break; }
      else break;
    }
    if (tgt >= 0) swap(i, tgt);
  }
  function gas(x, y, i, p) {
    if (rnd() > p) return;
    const up = gdir === 0 ? (rnd() < .5 ? -1 : 1) : -gdir;
    const ny = y + up;
    if (ny >= 0 && ny < H) {
      const j = i + up * W, dir = rnd() < .5 ? -1 : 1;
      let c = j;
      if (rnd() > .6 && x + dir >= 0 && x + dir < W) c = j + dir;
      const tc = g[c];
      if (!mask[c] && (tc === 0 || (KIND[tc] === K_LIQ && rnd() < .3))) { swap(i, c); return; }
    }
    const dir = rnd() < .5 ? -1 : 1;
    if (x + dir >= 0 && x + dir < W && g[i + dir] === 0 && !mask[i + dir]) swap(i, i + dir);
  }

  // ---------- reactions ----------
  function ignite(k) {
    const t = g[k];
    if (t === POWDER) { explode(k % W, (k / W) | 0, 3, .5); return; }
    if (t === OIL) set(k, FIRE, 30 + rndi(30));
    else if (t === WOOD) set(k, BURN);
    else if (t === PLANT || t === SEED) set(k, BURN, 30 + rndi(40));
    else if (t === DUST) set(k, FIRE, 8 + rndi(10));
  }
  function upd(t, x, y, i) {
    switch (t) {
      case SAND:
        if (dat[i]) { if (dat[i] >= 200) { set(i, GLASS, 0); return; } if (rnd() < .03) dat[i]--; }
        powder(x, y, i, t, 1); break;
      case SALT: powder(x, y, i, t, .9); break;
      case POWDER: powder(x, y, i, t, .8); break;
      case DUST: powder(x, y, i, t, .6); break;
      case SNOW: {
        const k = rn8(x, y);
        if (k >= 0) { const tk = g[k]; if (tk === FIRE || tk === LAVA || tk === BURN || tk === STEAM || (tk === METAL && dat[k] > 100)) { set(i, WATER, 0); return; } if (tk === SALT && rnd() < .05) { set(i, WATER, 1); return; } if (tk === WATER && rnd() < .004) { set(i, WATER, 0); return; } }
        powder(x, y, i, t, .25); break;
      }
      case SEED: {
        const k = rn8(x, y);
        if (k >= 0 && g[k] === WATER) { set(k, 0, 0); set(i, PLANT, 25 + rndi(35)); return; }
        powder(x, y, i, t, .5); break;
      }
      case WATER: {
        const k = rn8(x, y);
        if (k >= 0) {
          const tk = g[k];
          if (tk === LAVA) { set(i, STEAM); set(k, STONE, 0); return; }
          if (tk === FIRE) { set(k, rnd() < .5 ? SMOKE : 0); if (rnd() < .1) { set(i, STEAM); return; } }
          else if (tk === BURN) { set(k, WOOD, 0); if (rnd() < .3) { set(i, STEAM); return; } }
          else if (tk === SALT && dat[i] === 0 && rnd() < .04) { set(k, 0, 0); dat[i] = 1; }
          else if (tk === METAL && dat[k] > 110) { dat[k] -= 25; set(i, STEAM); return; }
          else if ((tk === SAND || tk === STONE) && dat[k] > 60) { dat[k] -= 30; if (rnd() < .3) { set(i, STEAM); return; } }
        }
        liquid(x, y, i, t, 5); break;
      }
      case OIL: liquid(x, y, i, t, 4); break;
      case SLIME: if (rnd() < .5) liquid(x, y, i, t, 2); break;
      case ACID: {
        const k = rn8(x, y);
        if (k >= 0) {
          const tk = g[k];
          if (tk === WATER) { if (rnd() < .006) { set(i, WATER, 0); return; } }
          else if (tk && tk !== ACID && tk !== GLASS && tk !== CLONE && tk !== BOLT && tk !== FIRE && tk !== SMOKE && tk !== STEAM) {
            const c = tk === METAL ? .02 : tk === STONE ? .08 : .25;
            if (rnd() < c) { set(k, rnd() < .25 ? SMOKE : 0); fizz = true; if (rnd() < .3) { set(i, 0, 0); return; } }
          }
        }
        liquid(x, y, i, t, 4); break;
      }
      case LAVA: {
        const k = rn8(x, y);
        if (k >= 0) {
          const tk = g[k];
          if (tk === 0) { if (rnd() < .003 && k < i) set(k, rnd() < .6 ? FIRE : SMOKE); }
          else if (FLAM[tk] > 0) { if (rnd() < .5) ignite(k); }
          else if (tk === ICE || tk === SNOW) set(k, WATER, 0);
          else if (tk === SAND) { if (rnd() < .02) set(k, GLASS, 0); }
          else if (tk === METAL) { if (dat[k] < 250) dat[k] = Math.min(255, dat[k] + 6); else if (rnd() < .003) set(k, LAVA, 0); }
          else if (tk === STONE) { if (rnd() < .0006) set(k, LAVA, 0); }
          else if (tk === VIRUS || tk === SLIME) set(k, rnd() < .5 ? FIRE : SMOKE);
        }
        if (rnd() < .35) liquid(x, y, i, t, 2);
        break;
      }
      case STONE:
        if (dat[i]) { if (dat[i] >= 250) { set(i, LAVA, 0); return; } if (rnd() < .03) dat[i]--; }
        break;
      case METAL:
        if (dat[i]) {
          if (rnd() < .08) dat[i]--;
          if (dat[i] > 150) { const k = rn8(x, y); if (k >= 0) { const tk = g[k]; if (FLAM[tk] > 0 && rnd() < .05) ignite(k); else if (tk === ICE || tk === SNOW) set(k, WATER, 0); } }
        }
        break;
      case ICE: {
        const k = rn8(x, y);
        if (k >= 0) { const tk = g[k]; if (tk === FIRE || tk === LAVA || tk === BURN || (tk === METAL && dat[k] > 100)) { set(i, WATER, 0); return; } if (tk === SALT && rnd() < .05) { set(i, WATER, 1); if (rnd() < .3) set(k, 0, 0); return; } if (tk === STEAM) set(k, WATER, 0); else if (tk === WATER && rnd() < .0004) { set(i, WATER, 0); return; } }
        break;
      }
      case PLANT: {
        const e = dat[i] & 127;
        if (e > 0 && rnd() < .15) {
          const up = gdir === 0 ? -1 : -gdir;
          const r = rnd();
          const dx = r < .5 ? 0 : r < .75 ? -1 : 1, dy = r < .9 ? up : 0;
          const nx = x + (dy === 0 ? (rnd() < .5 ? -1 : 1) : dx), ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const k = ny * W + nx;
            if (g[k] === 0 && !mask[k]) { const ne = e - 1 - (rnd() < .2 ? 1 : 0); set(k, PLANT, Math.max(0, ne) | (ne <= 0 && rnd() < .35 ? 128 : 0)); dat[i] = rnd() < .12 ? (e >> 1) : 0; }
            else if (g[k] === PLANT && dy !== 0) { dat[k] = Math.min(127, (dat[k] & 127) + e) | (dat[k] & 128); dat[i] = dat[i] & 128; }
          }
        }
        const k = rn8(x, y);
        if (k >= 0 && g[k] === WATER && rnd() < .05) { set(k, 0, 0); dat[i] = Math.min(127, e + 6) | (dat[i] & 128); }
        break;
      }
      case FIRE: {
        let life = dat[i] - 1 - (rnd() < .3 ? 1 : 0);
        if (life <= 0) { if (rnd() < .25) set(i, SMOKE); else { g[i] = 0; dat[i] = 0; } return; }
        dat[i] = life;
        for (let n = 0; n < 2; n++) {
          const k = rn8(x, y);
          if (k < 0) continue;
          const tk = g[k];
          if (FLAM[tk] > 0 && rnd() < FLAM[tk] * 3) ignite(k);
          else if ((tk === ICE || tk === SNOW) && rnd() < .1) set(k, WATER, 0);
          else if (tk === VIRUS) set(k, FIRE);
          else if (tk === SAND || tk === STONE) { if (dat[k] < 120) dat[k] += 2; }
          else if (tk === METAL) { if (dat[k] < 200) dat[k] += 2; }
        }
        gas(x, y, i, .7); break;
      }
      case BURN: {
        let life = dat[i] - (rnd() < .7 ? 1 : 0);
        if (life <= 0) { const r = rnd(); if (r < .35) set(i, DUST, 0); else if (r < .7) set(i, SMOKE); else { g[i] = 0; dat[i] = 0; } return; }
        dat[i] = life;
        const k = rn8(x, y);
        if (k >= 0) {
          const tk = g[k];
          if (tk === 0) { if (rnd() < .3) set(k, FIRE, 10 + rndi(20)); }
          else if (FLAM[tk] > 0 && rnd() < FLAM[tk] * 2) ignite(k);
          else if ((tk === ICE || tk === SNOW) && rnd() < .1) set(k, WATER, 0);
        }
        break;
      }
      case STEAM: {
        let life = dat[i] - 1;
        if (life <= 0) { if (rnd() < .4) set(i, WATER, 0); else { g[i] = 0; dat[i] = 0; } return; }
        dat[i] = life;
        const k = rn4(x, y);
        if (k >= 0 && (g[k] === ICE || g[k] === SNOW) && rnd() < .1) { set(i, WATER, 0); return; }
        gas(x, y, i, .8); break;
      }
      case SMOKE: {
        let life = dat[i] - 1;
        if (life <= 0) { g[i] = 0; dat[i] = 0; return; }
        dat[i] = life;
        gas(x, y, i, .55); break;
      }
      case VIRUS: {
        let life = dat[i] - (rnd() < .6 ? 1 : 0);
        if (life <= 0) { set(i, rnd() < .55 ? SLIME : DUST, 0); return; }
        dat[i] = life;
        if (rnd() < .5) {
          const k = rn4(x, y);
          if (k >= 0) {
            const tk = g[k];
            if (tk === FIRE || tk === LAVA || tk === BURN) { set(i, FIRE); return; }
            if (tk && tk !== VIRUS && tk !== SLIME && tk !== DUST && tk !== BOLT && tk !== SMOKE && tk !== STEAM) {
              const imm = tk === METAL || tk === GLASS || tk === CLONE ? .03 : 1;
              if (rnd() < imm) set(k, VIRUS, 90 + rndi(60));
            }
          }
        }
        break;
      }
      case CLONE: {
        const k = rn8(x, y);
        if (k < 0) break;
        if (dat[i] === 0) { const tk = g[k]; if (tk && tk !== CLONE && tk !== BOLT && tk !== BURN) dat[i] = tk; }
        else if (g[k] === 0 && !mask[k] && rnd() < .3) set(k, dat[i]);
        break;
      }
      case BOLT:
        if (--dat[i] <= 0) { g[i] = 0; dat[i] = 0; }
        break;
      default: break; // WOOD, GLASS: inert
    }
  }
  let fizz = false;
  function stepGrid() {
    fid = fid >= 255 ? 1 : fid + 1;
    const ltr = (frame & 1) === 0;
    const y0 = gdir >= 0 ? H - 1 : 0, y1 = gdir >= 0 ? -1 : H, ys = gdir >= 0 ? -1 : 1;
    for (let y = y0; y !== y1; y += ys) {
      const base = y * W;
      if (ltr) { for (let x = 0; x < W; x++) { const i = base + x, t = g[i]; if (t !== 0 && stamp[i] !== fid) upd(t, x, y, i); } }
      else { for (let x = W - 1; x >= 0; x--) { const i = base + x, t = g[i]; if (t !== 0 && stamp[i] !== fid) upd(t, x, y, i); } }
    }
    // electrified cells
    for (let k = elecList.length - 1; k >= 0; k--) {
      const i = elecList[k];
      if (--elec[i] <= 0 || (g[i] !== METAL && g[i] !== WATER)) { elec[i] = 0; elecList[k] = elecList[elecList.length - 1]; elecList.pop(); }
    }
  }

  // ---------- explosions ----------
  function explode(cx, cy, r, power = 1, quiet = false) {
    cx |= 0; cy |= 0;
    const r2 = r * r, inner = (r * .75) * (r * .75);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy; if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx; if (x < 0 || x >= W) continue;
        const d2 = dx * dx + dy * dy; if (d2 > r2) continue;
        const i = y * W + x, t = g[i];
        if (t === 0) { if (rnd() < .45) set(i, FIRE, 6 + rndi(16)); continue; }
        if (t === POWDER) { set(i, FIRE, 2 + rndi(4)); continue; }
        if (t === WATER) { if (rnd() < .3) set(i, STEAM); else { const d = Math.sqrt(d2) + .5; launch(i, dx / d * 2, dy / d * 2 - 1); } continue; }
        const hard = KIND[t] === K_SOLID;
        if (hard && (t === CLONE || (d2 > inner && rnd() > power * .6) || rnd() > .55 + power * .4)) { if (FLAM[t] > 0) ignite(i); continue; }
        const d = Math.sqrt(d2) + .5, sp = (1.2 + rnd() * 2.6) * (1.25 - d / r) * Math.min(2, .7 + r / 14);
        if (rnd() < .45 && launch(i, dx / d * sp + (rnd() - .5), dy / d * sp - rnd() * 1.2)) continue;
        if (FLAM[t] > 0 && rnd() < .5) ignite(i);
        else if (t !== CLONE) set(i, rnd() < .35 ? FIRE : 0, rnd() < .35 ? 8 + rndi(10) : 0);
      }
    }
    const reach = r * 2.6;
    for (const b of bodies) {
      const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) + .5;
      if (d > reach) continue;
      const k = (1 - d / reach) * (1.2 + r * .18);
      b.vx += dx / d * k; b.vy += dy / d * k - k * .3;
      if (b.kind === 'bomb') b.fuse = Math.min(b.fuse, 4 + rndi(6));
      else hurtBody(b, k * 14);
    }
    for (const c of creatures) {
      const dx = c.x - cx, dy = c.y - 3 - cy, d = Math.hypot(dx, dy) + .5;
      if (d > reach) continue;
      const k = (1 - d / reach) * (1 + r * .15);
      c.vx += dx / d * k; c.vy += dy / d * k - k * .4;
      if (d < r * 1.3 && c.st === 'ok') kill(c, 'blown up', true);
    }
    for (let p = 0; p < pn; p++) { const dx = PX[p] - cx, dy = PY[p] - cy, d2 = dx * dx + dy * dy; if (d2 < reach * reach) { const d = Math.sqrt(d2) + .5, k = (1 - d / reach) * 2; PVX[p] += dx / d * k; PVY[p] += dy / d * k; } }
    for (let n = 0; n < r * 3; n++) { const a = rnd() * 6.283, s = rnd() * r * .25; addP(cx, cy, Math.cos(a) * s, Math.sin(a) * s, 0, 10 + rndi(16), firePal[40 + rndi(24)]); }
    if (!quiet) {
      stats.explosions++;
      shake = Math.max(shake, Math.min(10, r * .5));
      flash = Math.max(flash, Math.min(.5, r / 50));
      sfx(r > 14 ? 'bigboom' : 'boom');
    }
  }
  function nuke(cx, cy) {
    stats.nukes++;
    explode(cx, cy, 36, 2, true);
    const R = 60, R2 = R * R;
    for (let dy = -R; dy <= R; dy++) {
      const y = (cy | 0) + dy; if (y < 0 || y >= H) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = (cx | 0) + dx; if (x < 0 || x >= W) continue;
        const d2 = dx * dx + dy * dy; if (d2 > R2) continue;
        const i = y * W + x, t = g[i]; if (!t) continue;
        if (t === WATER || t === ICE || t === SNOW) { if (rnd() < .6) set(i, STEAM); }
        else if (t === SAND && rnd() < .5) set(i, GLASS, 0);
        else if (FLAM[t] > 0) ignite(i);
        else if (t === STONE && d2 < 900 && rnd() < .2) set(i, LAVA, 0);
      }
    }
    for (const c of creatures) if (c.st === 'ok' && Math.hypot(c.x - cx, c.y - cy) < 90) { kill(c, 'nuked', true); c.vx += Math.sign(c.x - cx) * 2; c.vy -= 2; }
    for (const b of bodies) { const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) + 1; if (d < 120) { b.vx += dx / d * 5; b.vy += dy / d * 5 - 2; hurtBody(b, 60); } }
    fx.push({ kind: 'ring', x: cx, y: cy, r: 2, max: 110 }, { kind: 'cloud', x: cx, y: cy, t: 0 });
    flash = 1; shake = 18;
    sfx('nuke');
  }

  // ---------- lightning ----------
  function lightning(tx, ty) {
    stats.bolts++;
    tx = clamp(tx, 0, W - 1); ty = clamp(ty, 0, H - 1);
    let x = clamp(tx + (rnd() - .5) * 30, 1, W - 2), y = 0, hit = -1, px = x | 0;
    const path = [];
    while (y < H) {
      const ix = x | 0, i = y * W + ix, t = g[i];
      if (t && KIND[t] !== K_GAS && KIND[t] !== K_FIRE && t !== BOLT) { hit = i; break; }
      for (let xx = Math.min(px, ix) + 1; xx < Math.max(px, ix); xx++) path.push(y * W + xx); // keep the bolt connected
      path.push(i); px = ix;
      const remain = Math.max(1, ty - y);
      x += y < ty ? (tx - x) / remain * 1.4 + (rnd() - .5) * 2.4 : (rnd() - .5) * 2;
      x = clamp(x, 0, W - 1);
      y++;
      if (y > ty + 60) break;
    }
    const mark = i => { if (g[i] === 0 || KIND[g[i]] === K_GAS) set(i, BOLT); };
    path.forEach(mark);
    for (const i of path) if (rnd() < .45 && i % W < W - 1) mark(i + 1); // a little thickness
    for (let b = 0; b < 3 && path.length > 8; b++) { // forks
      let i = path[rndi(path.length)], fx_ = i % W, fy = (i / W) | 0;
      const dir = rnd() < .5 ? -1 : 1, len = 8 + rndi(18);
      for (let s = 0; s < len; s++) { fx_ += dir * (rnd() < .7 ? 1 : 0); fy += 1; if (fx_ < 0 || fx_ >= W || fy >= H) break; const k = fy * W + fx_; if (g[k] && KIND[g[k]] !== K_GAS) break; mark(k); }
    }
    for (const c of creatures) {
      if (c.st !== 'ok') continue;
      for (let s = 0; s < path.length; s += 2) { const i = path[s]; const px = i % W, py = (i / W) | 0; if (Math.abs(px - c.x) < 2.5 && py <= c.y + 1 && py >= c.y - c.h - 1) { kill(c, 'zapped', true); break; } }
    }
    if (hit >= 0) {
      const hx = hit % W, hy = (hit / W) | 0, t = g[hit];
      if (t === METAL || t === WATER) electrify(hit, t);
      else {
        explode(hx, hy - 1, 3, .4, true);
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const x2 = hx + dx, y2 = hy + dy; if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H || dx * dx + dy * dy > 16) continue;
          const k = y2 * W + x2; if (g[k] === SAND && rnd() < .7) set(k, GLASS, 0); else if (FLAM[g[k]] > 0 && rnd() < .5) ignite(k);
        }
      }
    }
    flash = Math.max(flash, .55); shake = Math.max(shake, 3);
    sfx('zap');
  }
  function electrify(start, t) {
    const q = [start]; let n = 0;
    elec[start] = 1;
    while (q.length && n < 5000) {
      const i = q.pop(); n++;
      elec[i] = 28; elecList.push(i);
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const j = nbr(x, y, k); if (j < 0) continue;
        if (g[j] === t && !elec[j]) { elec[j] = 1; q.push(j); }
        else if (FLAM[g[j]] > 0 && rnd() < .35) ignite(j);
        else if (t === METAL && g[j] === WATER && rnd() < .2) set(j, STEAM);
      }
      if (t === METAL && dat[i] < 200) dat[i] += 40;
    }
  }

  // ---------- rigid bodies ----------
  function makeBody(kind, x, y) {
    const b = { kind, x, y, vx: 0, vy: 0, hp: 100, burn: 0, fuse: kind === 'bomb' ? 200 : 0, grabbed: false, col: rndi(4) };
    if (kind === 'box') { b.w = 9; b.h = 9; b.dens = .55; b.bounce = .15; }
    else if (kind === 'ball') { b.r = 3.6; b.w = b.h = 8; b.dens = .7; b.bounce = .72; }
    else { b.r = 3.2; b.w = b.h = 7; b.dens = 2.2; b.bounce = .3; }
    for (let k = 0; k < 40 && bodyHits(b, b.x, b.y); k++) b.y -= gdir >= 0 ? 1 : -1;
    if (bodyHits(b, b.x, b.y)) return null;
    bodies.push(b);
    return b;
  }
  function eachCell(b, x, y, fn) { // calls fn(cx, cy) for every cell the body covers at (x, y)
    const x0 = Math.floor(x - b.w / 2), y0 = Math.floor(y - b.h / 2);
    if (b.kind === 'box') { for (let yy = y0; yy < y0 + b.h; yy++) for (let xx = x0; xx < x0 + b.w; xx++) if (fn(xx, yy)) return true; return false; }
    const r2 = b.r * b.r;
    for (let yy = y0; yy < y0 + b.h; yy++) for (let xx = x0; xx < x0 + b.w; xx++) { const dx = xx + .5 - x, dy = yy + .5 - y; if (dx * dx + dy * dy <= r2 && fn(xx, yy)) return true; }
    return false;
  }
  function bodyHits(b, x, y) {
    return eachCell(b, x, y, (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
      const k = KIND[g[cy * W + cx]];
      return k === K_SOLID || k === K_POWDER;
    });
  }
  function hurtBody(b, amt) {
    if (b.kind === 'ball') return;
    if (b.kind === 'bomb') { b.fuse = Math.min(b.fuse, 3); return; }
    b.hp -= amt;
  }
  function removeBody(b) { const k = bodies.indexOf(b); if (k >= 0) bodies.splice(k, 1); if (grab && grab.o === b) grab = null; }
  function shatterBody(b, mat, asCells) {
    eachCell(b, b.x, b.y, (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
      const i = cy * W + cx;
      if (asCells) { if (g[i] === 0 || KIND[g[i]] === K_LIQ || KIND[g[i]] === K_GAS) set(i, mat); }
      else if (rnd() < .7) addP(cx + .5, cy + .5, (rnd() - .5) * 2.4 + b.vx * .3, (rnd() - .8) * 2.4, mat, -1, 0);
    });
    removeBody(b);
  }
  function stepBodies() {
    const G = .12 * gdir;
    for (let n = bodies.length - 1; n >= 0; n--) {
      const b = bodies[n];
      if (!b) continue;
      // what is touching / inside it
      let liq = 0, cells = 0;
      eachCell(b, b.x, b.y, (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H) { cells++; if (KIND[g[cy * W + cx]] === K_LIQ) liq++; } });
      const frac = cells ? liq / cells : 0;
      for (let s = 0; s < 3; s++) { // sample cells just outside the outline
        const a = rnd() * 6.283, rx = Math.round(b.x + Math.cos(a) * (b.w / 2 + .8)), ry = Math.round(b.y + Math.sin(a) * (b.h / 2 + .8));
        if (rx < 0 || ry < 0 || rx >= W || ry >= H) continue;
        const i = ry * W + rx, t = g[i];
        if (t === FIRE || t === BURN || t === LAVA) { if (b.kind === 'bomb') b.fuse = Math.min(b.fuse, 25); else if (b.kind === 'box') b.burn = Math.max(b.burn, 1); else if (t === LAVA) { shatterBody(b, SMOKE, false); break; } }
        else if (t === ACID) { b.hp -= 4; if (rnd() < .3) set(i, SMOKE); }
        else if (t === VIRUS) { stats.infected++; shatterBody(b, VIRUS, true); break; }
        else if (t === WATER && b.burn) b.burn = 0;
        if (elec[i] && b.kind === 'bomb') b.fuse = Math.min(b.fuse, 3);
      }
      if (bodies[n] !== b) continue;
      if (b.burn) {
        b.hp -= .35; b.burn++;
        if (rnd() < .5) { const a = rnd() * 6.283, rx = Math.round(b.x + Math.cos(a) * (b.w / 2 + 1)), ry = Math.round(b.y + Math.sin(a) * (b.h / 2 + 1)); if (rx >= 0 && ry >= 0 && rx < W && ry < H && g[ry * W + rx] === 0) set(ry * W + rx, FIRE, 10 + rndi(15)); }
      }
      if (b.hp <= 0) { if (b.burn) shatterBody(b, BURN, true); else shatterBody(b, WOOD, false); continue; }
      if (b.kind === 'bomb' && --b.fuse <= 0) { removeBody(b); explode(b.x, b.y, 13, 1.2); continue; }
      // forces
      if (!b.grabbed) {
        b.vy += G * (1 - frac / b.dens);
        if (frac > 0) { b.vx *= 1 - .08 * frac; b.vy *= 1 - .08 * frac; }
        for (const w of wells) { const dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy) + 1; if (d < 70) { b.vx += dx / d * 8 / (d + 6); b.vy += dy / d * 8 / (d + 6); } if (d < 4) { w.ate += 10; removeBody(b); break; } }
        if (bodies[n] !== b) continue;
      }
      b.vx = clamp(b.vx, -6, 6); b.vy = clamp(b.vy, -6, 6);
      const steps = Math.min(8, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / .7)) || 1;
      let grounded = false;
      for (let s = 0; s < steps; s++) {
        const nx = b.x + b.vx / steps;
        if (!bodyHits(b, nx, b.y)) b.x = nx;
        else if (!bodyHits(b, nx, b.y - (gdir || 1))) { b.x = nx; b.y -= (gdir || 1) * .5; } // ride up small bumps
        else { b.vx = -b.vx * b.bounce; if (Math.abs(b.vx) < .05) b.vx = 0; }
        const ny = b.y + b.vy / steps;
        if (!bodyHits(b, b.x, ny)) b.y = ny;
        else {
          if (Math.sign(b.vy) === Math.sign(gdir)) grounded = true;
          if (Math.abs(b.vy) > 2.5) hurtBody(b, (Math.abs(b.vy) - 2.5) * 10);
          b.vy = Math.abs(b.vy) > .35 ? -b.vy * b.bounce : 0;
        }
      }
      if (grounded) b.vx *= b.kind === 'ball' ? .995 : .85;
      if (bodyHits(b, b.x, b.y)) b.y -= gdir >= 0 ? .5 : -.5; // unstick
      // landing on creatures
      if (Math.abs(b.vy) > 1.6) for (const c of creatures) if (c.st === 'ok' && Math.abs(c.x - b.x) < b.w / 2 + 1 && c.y - c.h < b.y + b.h / 2 && c.y > b.y) kill(c, 'squashed', false);
    }
    // body vs body
    for (let a = 0; a < bodies.length; a++) for (let c = a + 1; c < bodies.length; c++) {
      const A = bodies[a], B = bodies[c];
      const ox = (A.w + B.w) / 2 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) { const s = Math.sign(A.x - B.x) || 1; A.x += s * ox / 2; B.x -= s * ox / 2; const v = (A.vx + B.vx) / 2; A.vx = v + s * .1; B.vx = v - s * .1; }
      else { const s = Math.sign(A.y - B.y) || 1; A.y += s * oy / 2; B.y -= s * oy / 2; const v = (A.vy + B.vy) / 2; A.vy = v; B.vy = v; }
    }
  }
  function stampMask() {
    mask.fill(0);
    for (const b of bodies) eachCell(b, b.x, b.y, (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H) mask[cy * W + cx] = 1; });
    for (const t of turrets) for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) { const x = (t.x | 0) + dx, y = (t.y | 0) + dy; if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; }
  }

  // ---------- creatures ----------
  const SHIRTS = [[230, 80, 80], [80, 150, 240], [250, 200, 60], [120, 210, 120], [240, 140, 40], [200, 110, 230], [240, 240, 240]];
  const SHELLS = [[60, 160, 90], [200, 70, 60], [70, 110, 200], [220, 170, 40]];
  function makeCreature(kind, x, y) {
    if (creatures.length >= 160) return null;
    const c = { kind, x: x + .5, y: y + .5, vx: 0, vy: 0, dir: rnd() < .5 ? -1 : 1, st: 'ok', h: kind === 'walker' ? 8 : 2,
      burn: 0, inf: 0, zombie: false, frozen: 0, breath: 240, hp: 100, deadT: 0, cause: '', grabbed: false, step: 0,
      col: kind === 'walker' ? SHIRTS[rndi(SHIRTS.length)] : SHELLS[rndi(SHELLS.length)] };
    creatures.push(c); stats.spawned++;
    return c;
  }
  function solidAt(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return true;
    const i = y * W + x;
    if (mask[i]) return true;
    const k = KIND[g[i]];
    return k === K_SOLID || k === K_POWDER;
  }
  function kill(c, cause, fling) {
    if (c.st !== 'ok') return;
    c.st = 'dead'; c.cause = cause; c.deadT = 0; stats.lost++; stats.deaths.push(cause);
    if (fling) { c.vy -= .8; }
    if (cause === 'zapped' || cause === 'nuked' || cause === 'burned') c.char = true;
  }
  function infect(c) { if (c.inf || c.st !== 'ok') return; c.inf = 1; stats.infected++; }
  function removeCreature(c) { const k = creatures.indexOf(c); if (k >= 0) creatures.splice(k, 1); if (grab && grab.o === c) grab = null; }
  function crumble(c, fade) {
    drawCreature(c, (x, y, col) => { if (fade) addP(x + .5, y + .5, (rnd() - .5) * .8, -.3 - rnd() * .9, 0, 20 + rndi(30), col); else addP(x + .5, y + .5, (rnd() - .5) * .6, (rnd() - .5) * .6, DUST, -1, 0); });
    removeCreature(c);
  }
  function moveCreature(c, s) {
    // vertical, in unit steps; the feet cell is (floor x, floor y), the body extends h cells against gravity
    const fx = Math.floor(c.x);
    let vy = c.vy;
    const ny = c.y + vy;
    const n = Math.ceil(Math.abs(vy)) || 0;
    let y = c.y, hitV = false;
    for (let k = 0; k < n; k++) {
      const ty = y + vy / n, fyOld = Math.floor(y), fyNew = Math.floor(ty);
      if (fyNew !== fyOld) {
        const movingWithG = Math.sign(fyNew - fyOld) === s;
        const checkY = movingWithG ? fyNew : fyNew - (c.h - 1) * s;
        if (solidAt(fx, checkY)) { hitV = true; break; }
      }
      y = ty;
    }
    if (hitV) { if (Math.abs(c.vy) > 3.1 && c.st === 'ok' && !c.frozen) kill(c, 'splat', false); c.vy = 0; c.y = Math.floor(y) + .5; }
    else c.y = n ? ny : c.y;
    // horizontal
    const nx = c.x + c.vx;
    const m = Math.ceil(Math.abs(c.vx)) || 0;
    let x = c.x;
    for (let k = 0; k < m; k++) {
      const tx = x + c.vx / m, fxo = Math.floor(x), fxn = Math.floor(tx);
      if (fxn !== fxo) {
        const fy = Math.floor(c.y);
        let blocked = false;
        for (let h = 0; h < c.h; h++) if (solidAt(fxn, fy - h * s)) { blocked = true; break; }
        if (blocked) {
          // try one step up (only the feet cell blocked)
          let canStep = c.st === 'ok' && !solidAt(fxn, fy - c.h * s) && !solidAt(fxo, fy - c.h * s) && c.grounded;
          if (canStep) for (let h = 1; h < c.h; h++) if (solidAt(fxn, fy - h * s)) { canStep = false; break; }
          if (canStep) { c.y -= s; x = tx; continue; }
          if (Math.abs(c.vx) > 2.6 && c.st === 'ok') kill(c, 'splat', false);
          c.dir = -c.dir; c.vx = c.grounded ? 0 : -c.vx * .3; return;
        }
      }
      x = tx;
    }
    c.x = m ? nx : c.x;
  }
  function stepCreatures() {
    const s = gdir < 0 ? -1 : 1;
    for (let n = creatures.length - 1; n >= 0; n--) {
      const c = creatures[n];
      const fx = Math.floor(c.x), fy = Math.floor(c.y);
      if (fx < 0 || fx >= W || fy < -2 || fy > H + 2) { removeCreature(c); continue; }
      const alive = c.st === 'ok';
      c.grounded = gdir !== 0 && solidAt(fx, fy + s);
      // senses: feet, middle, head
      const at = h => { const y = fy - h * s; return (y < 0 || y >= H) ? -1 : y * W + fx; };
      const iF = at(0), iM = at(c.h >> 1), iH = at(c.h - 1);
      const tF = iF >= 0 ? g[iF] : 0, tM = iM >= 0 ? g[iM] : 0, tH = iH >= 0 ? g[iH] : 0;
      const inLiq = KIND[tF] === K_LIQ || KIND[tM] === K_LIQ;
      if (alive) {
        for (const [t, i] of [[tF, iF], [tM, iM], [tH, iH]]) {
          if (i < 0) continue;
          if (t === FIRE || t === BURN || t === LAVA) { c.burn = c.burn || 1; c.frozen = 0; if (t === LAVA) c.hp -= 5; }
          else if (t === ACID) { c.hp -= 3; if (rnd() < .2) set(i, SMOKE); }
          else if (t === VIRUS || t === SLIME && rnd() < .02) infect(c);
          else if (t === BOLT) kill(c, 'zapped', true);
          if (elec[i]) kill(c, 'zapped', true);
          // standing on electrified metal
        }
        const below = fy + s; if (below >= 0 && below < H && elec[below * W + fx]) kill(c, 'zapped', true);
        if (c.kind === 'walker') {
          if (KIND[tH] === K_LIQ) { if (--c.breath <= 0) kill(c, 'drowned', false); }
          else c.breath = Math.min(240, c.breath + 3);
        } else if (KIND[tF] === K_LIQ && KIND[tM] === K_LIQ) { if ((c.breath -= 2) <= 0) kill(c, 'drowned', false); }
        else c.breath = Math.min(240, c.breath + 3);
        if (c.burn) {
          c.burn++; c.hp -= .55;
          if (inLiq) { c.burn = 0; if (iH >= 0 && g[iH] === 0) set(iH, STEAM); }
          else if (rnd() < .45) { const y = fy - (c.h + 1) * s; if (y >= 0 && y < H && g[y * W + fx] === 0) set(y * W + fx, FIRE, 8 + rndi(12)); }
          if (rnd() < .03) c.dir = -c.dir;
          if (iF >= 0 && FLAM[g[iF + s * W]] > 0 && rnd() < .05) ignite(iF + s * W);
        }
        if (c.inf) {
          c.inf++;
          if (c.inf > 160 && !c.zombie) c.zombie = true;
          if (c.zombie) {
            let near = null, nd = 50;
            for (const o of creatures) {
              if (o === c || o.st !== 'ok' || o.inf) continue;
              const dx = Math.abs(o.x - c.x), dy = Math.abs(o.y - c.y);
              if (dx < 3 && dy < 4) infect(o);
              else if (dy < 10 && dx < nd) { nd = dx; near = o; }
            }
            if (near && c.grounded && rnd() < .05) c.dir = near.x > c.x ? 1 : -1; // shamble toward the nearest healthy one
            if (rnd() < .004 && iF >= 0) { const k = iF + s * W; if (k >= 0 && k < N && g[k] && g[k] !== VIRUS) set(k, VIRUS); }
            if (c.inf > 2400) { c.hp = 0; c.cause = 'virus'; }
          }
        }
        if (c.hp <= 0) kill(c, c.cause || (c.burn ? 'burned' : 'dissolved'), false);
      }
      // physics
      if (c.grabbed) { moveCreature(c, s); continue; }
      if (c.frozen > 0) { c.frozen--; c.vx = 0; }
      if (alive && c.grounded && !c.frozen && c.kind === 'walker' && KIND[tH] === K_LIQ && (c.swim || 0) < 600) { c.vy = -.45 * s; c.grounded = false; }
      if (!c.grounded) {
        c.vy += .1 * gdir;
        if (inLiq) {
          c.vy *= .86; c.vx *= .9;
          if (c.st === 'ok' && !c.frozen) {
            c.swim = (c.swim || 0) + 1; // swimmers tire after ~10 s and sink
            if (c.kind === 'walker' && c.swim < 600 && KIND[tH] === K_LIQ) c.vy -= .16 * s;
            c.vx = c.dir * .1;
          }
        } else if (c.swim) c.swim = Math.max(0, c.swim - 2);
        if (gdir === 0) { c.vy *= .99; c.vx *= .99; }
        c.vy = clamp(c.vy, -5, 5);
      } else if (c.vy * s > 0) c.vy = 0;
      for (const w of wells) { const dx = w.x - c.x, dy = w.y - (c.y - c.h / 2 * s), d = Math.hypot(dx, dy) + 1; if (d < 60) { c.vx += dx / d * 5 / (d + 6); c.vy += dy / d * 5 / (d + 6); if (alive && d < 30) kill(c, 'spaghettified', false); } if (d < 4) { w.ate += 5; c.gone = true; } }
      if (c.gone) { removeCreature(c); continue; }
      if (alive && c.grounded && !c.frozen) {
        const spd = c.kind === 'walker' ? (c.burn ? .42 : c.zombie ? .12 : .16) : .2;
        // look ahead for hazards
        if (!c.burn && rnd() < .3) {
          const ax = fx + c.dir * 2;
          if (ax >= 0 && ax < W) { const t1 = g[fy * W + ax], y2 = fy - s; const t2 = y2 >= 0 && y2 < H ? g[y2 * W + ax] : 0; if (t1 === FIRE || t1 === LAVA || t1 === ACID || t1 === BURN || t2 === FIRE || t2 === BURN || t2 === LAVA) c.dir = -c.dir; }
        }
        if (rnd() < .002) c.dir = -c.dir;
        c.vx = c.dir * spd;
        if (c.kind === 'critter') {
          if (rnd() < .012) { c.vy = -1.05 * s; c.vx = c.dir * .45; }
          const k = rn8(fx, fy); if (k >= 0 && g[k] === PLANT && rnd() < .08) { set(k, 0, 0); c.hp = Math.min(100, c.hp + 5); }
        }
        c.step += Math.abs(c.vx);
      } else if (c.grounded && c.st !== 'ok') c.vx *= .7;
      moveCreature(c, s);
      if (!alive) {
        c.deadT++;
        if (c.deadT > (c.char ? 120 : 320)) crumble(c, false);
      }
    }
  }
  // draws a creature via plot(x, y, color); also used to turn it into particles
  function drawCreature(c, plot) {
    const s = gdir < 0 ? -1 : 1;
    const fx = Math.floor(c.x), fy = Math.floor(c.y);
    const P = (dx, dy, col) => plot(fx + dx, fy + dy * s, col);
    const flick = (frame >> 2) & 1;
    let skin = c.inf > 60 ? pack(110, 196, 90) : pack(238, 196, 158);
    let shirt = pack(c.col[0], c.col[1], c.col[2]), pants = pack(52, 62, 112), dark = pack(30, 30, 36);
    if (c.zombie) { shirt = pack(70, 90, 60); pants = pack(50, 60, 50); }
    if (c.st !== 'ok') {
      const tone = c.char ? pack(40, 36, 34) : c.cause === 'drowned' ? pack(110, 150, 190) : c.inf ? pack(120, 160, 100) : pack(150, 140, 135);
      skin = mix(skin, tone, .6); shirt = mix(shirt, tone, .7); pants = mix(pants, tone, .6);
    }
    if (c.frozen) { const ice = pack(178, 226, 255); skin = mix(skin, ice, .75); shirt = mix(shirt, ice, .75); pants = mix(pants, ice, .75); }
    if (c.burn && c.st === 'ok') { const hot = flick ? pack(255, 140, 40) : pack(255, 80, 20); shirt = mix(shirt, hot, .5); }
    const d = c.dir;
    if (c.kind === 'critter') {
      if (c.st !== 'ok') { P(-1, 0, shirt); P(0, 0, shirt); P(1, 0, shirt); return; }
      P(-1, -1, shirt); P(0, -1, shirt); P(d, -1, dark); P(-d, -1, mix(shirt, WHITE, .3));
      if (((c.step * 3) | 0) & 1) { P(-1, 0, dark); P(1, 0, dark); } else P(0, 0, dark);
      return;
    }
    if (c.st !== 'ok') { // lying down
      for (let k = -2; k <= 2; k++) P(k, 0, k < 0 ? pants : shirt);
      P(3, 0, skin); P(3, -1, skin);
      return;
    }
    P(0, -7, skin); P(-1, -6, skin); P(0, -6, skin); P(1, -6, skin); P(0, -5, skin);
    P(d, -6, dark); // eye
    P(0, -4, shirt); P(0, -3, shirt); P(0, -2, pants);
    const walk = ((c.step * 1.6) | 0) & 1;
    if (c.zombie) { P(d, -4, skin); P(2 * d, -4, skin); }
    else if (c.burn || c.grabbed) { P(-1, -5, skin); P(1, -5, skin); }
    else if (walk) { P(-1, -4, skin); P(1, -3, skin); } else { P(-1, -3, skin); P(1, -4, skin); }
    if (!c.grounded && !c.frozen) { P(-1, -1, pants); P(1, -1, pants); P(-1, 0, dark); P(1, 0, dark); }
    else if (walk) { P(-1, -1, pants); P(1, -1, pants); P(-1, 0, dark); P(1, 0, dark); }
    else { P(0, -1, pants); P(0, 0, dark); }
    if (c.burn) for (let k = 0; k < 3; k++) P(rndi(3) - 1, -8 - rndi(2), firePal[30 + rndi(34)]);
  }

  // ---------- turrets + bullets ----------
  function makeTurret(x, y) { if (turrets.length >= 8) turrets.shift(); const t = { x: x + .5, y: y + .5, a: -Math.PI / 2 }; turrets.push(t); return t; }
  function autoTurret() { // when Shoot is used with no turret, set one on the ground near the bottom middle
    const x = (W / 2) | 0;
    let y = gdir >= 0 ? H - 1 : 1;
    if (gdir >= 0) { for (let yy = 4; yy < H; yy++) if (g[yy * W + x] !== 0 && KIND[g[yy * W + x]] !== K_GAS && KIND[g[yy * W + x]] !== K_FIRE) { y = yy - 1; break; } }
    return makeTurret(x, Math.max(3, y));
  }
  function fire(t, tx, ty) {
    const dx = tx - t.x, dy = ty - (t.y - 1), d = Math.hypot(dx, dy) || 1;
    t.a = Math.atan2(dy, dx);
    const sp = 3.4;
    bullets.push({ x: t.x + dx / d * 4, y: t.y - 1 + dy / d * 4, vx: dx / d * sp + (rnd() - .5) * .12, vy: dy / d * sp + (rnd() - .5) * .12, e: 14, life: 220 });
    stats.shots++;
    sfx('pew');
  }
  const HARD = new Float32Array(NT).fill(1.5);
  HARD[STONE] = 3; HARD[METAL] = 6; HARD[GLASS] = 1; HARD[ICE] = 2; HARD[WOOD] = 2; HARD[CLONE] = 99;
  HARD[WATER] = .5; HARD[OIL] = .5; HARD[ACID] = .5; HARD[SLIME] = .5; HARD[LAVA] = .8; HARD[SAND] = 1.2;
  function stepBullets() {
    for (let n = bullets.length - 1; n >= 0; n--) {
      const b = bullets[n];
      let alive = --b.life > 0;
      for (let s = 0; s < 4 && alive; s++) {
        const px = b.x, py = b.y;
        b.x += b.vx / 4; b.y += b.vy / 4;
        const ix = b.x | 0, iy = b.y | 0;
        if (b.x < 0 || b.y < 0 || ix >= W || iy >= H) { alive = false; break; }
        for (const o of bodies) if (Math.abs(o.x - b.x) < o.w / 2 && Math.abs(o.y - b.y) < o.h / 2) {
          o.vx += b.vx * .22; o.vy += b.vy * .22; hurtBody(o, 18); b.e -= 7;
          for (let k = 0; k < 4; k++) addP(b.x, b.y, -b.vx * .2 + (rnd() - .5), -b.vy * .2 + (rnd() - .5), 0, 8 + rndi(8), pack(255, 230, 120));
          b.x = px; b.y = py; b.vx = -b.vx * .3; b.vy = -b.vy * .3;
          break;
        }
        for (const c of creatures) if (Math.abs(c.x - b.x) < 1.5 && (b.y - c.y) * (gdir < 0 ? -1 : 1) < 1 && (c.y - b.y) * (gdir < 0 ? -1 : 1) < c.h) {
          if (c.st === 'ok') { kill(c, 'shot', true); b.e -= 3; }
          c.vx += b.vx * .25; c.vy += b.vy * .25 - .3;
        }
        const i = iy * W + ix, t = g[i];
        if (!t || KIND[t] === K_GAS || KIND[t] === K_FIRE || t === BOLT) continue;
        if (t === POWDER) { explode(ix, iy, 4, .6); alive = false; break; }
        if (t === METAL || t === CLONE) { // ricochet
          const hx = g[(py | 0) * W + ix] !== 0, hy = g[iy * W + (px | 0)] !== 0;
          if (hx && !hy) b.vy = -b.vy; else if (hy && !hx) b.vx = -b.vx; else { b.vx = -b.vx; b.vy = -b.vy; }
          b.x = px; b.y = py; b.e -= 4;
          for (let k = 0; k < 5; k++) addP(px, py, (rnd() - .5) * 2, (rnd() - .5) * 2, 0, 6 + rndi(8), pack(255, 240, 160));
          sfx('tink');
          if (b.e <= 0) alive = false;
          break;
        }
        b.e -= HARD[t];
        if (KIND[t] === K_LIQ) { if (rnd() < .5) launch(i, b.vx * .3 + (rnd() - .5), -Math.abs(b.vy) * .2 - rnd()); b.vx *= .9; b.vy *= .9; }
        else {
          for (let k = 0; k < 5; k++) {
            const j = k === 0 ? i : nbr(ix, iy, k - 1); if (j < 0 || !g[j] || g[j] === CLONE) continue;
            if (k > 0 && rnd() < .5) continue;
            const tt = g[j];
            if (tt === GLASS || rnd() < .6) launch(j, b.vx * .35 + (rnd() - .5) * 1.4, b.vy * .35 + (rnd() - .5) * 1.4 - .4);
            else { g[j] = 0; dat[j] = 0; }
            if (FLAM[tt] > 0 && rnd() < .15) { set(j, FIRE); }
          }
        }
        if (b.e <= 0) { alive = false; break; }
      }
      if (!alive) bullets.splice(n, 1);
    }
  }

  // ---------- black holes ----------
  function stepWells() {
    for (let n = wells.length - 1; n >= 0; n--) {
      const w = wells[n]; w.t++;
      const R = 34;
      for (let k = 0; k < 320; k++) {
        const a = rnd() * 6.283, d = 2 + rnd() * R;
        const x = (w.x + Math.cos(a) * d) | 0, y = (w.y + Math.sin(a) * d) | 0;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x, t = g[i];
        if (!t) continue;
        if (!movable(t) && !(d < 12 && rnd() < .12)) continue;
        if (rnd() > .35) continue;
        const f = .5 + 5 / (d + 2), nx = -Math.cos(a), ny = -Math.sin(a);
        launch(i, nx * f - ny * f * .7, ny * f + nx * f * .7);
      }
      if (w.t > 660) {
        wells.splice(n, 1);
        fx.push({ kind: 'ring', x: w.x, y: w.y, r: 1, max: 26 });
        for (let k = 0; k < 60; k++) { const a = rnd() * 6.283; addP(w.x, w.y, Math.cos(a) * 2, Math.sin(a) * 2, 0, 20 + rndi(20), pack(190, 140, 255)); }
        sfx('pop');
      }
    }
  }
  function stepFx() {
    for (let n = fx.length - 1; n >= 0; n--) {
      const f = fx[n];
      if (f.kind === 'ring') { f.r += 2.2; if (f.r > f.max) fx.splice(n, 1); }
      else if (f.kind === 'cloud') {
        f.t++;
        const up = gdir < 0 ? 1 : -1;
        const cy = f.y + up * Math.min(f.t, 70) * .8, rad = 3 + Math.min(f.t, 70) * .3;
        for (let k = 0; k < 34; k++) {
          const a = rnd() * 6.283, d = Math.sqrt(rnd()) * rad;
          const x = (f.x + Math.cos(a) * d * 2) | 0, y = (cy + Math.sin(a) * d * .6) | 0;
          if (x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] === 0) set(y * W + x, rnd() < .35 ? FIRE : SMOKE, rnd() < .35 ? 20 + rndi(20) : 120 + rndi(100));
        }
        for (let k = 0; k < 6; k++) { const x = (f.x + (rnd() - .5) * 6) | 0, y = (f.y + up * rnd() * Math.min(f.t, 70) * .8) | 0; if (x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] === 0) set(y * W + x, SMOKE, 80 + rndi(80)); }
        if (f.t > 90) fx.splice(n, 1);
      }
    }
  }

  // ---------- tools ----------
  const svg = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;
  const sector = (a0, a1, r0, r1) => { const p = (a, r) => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`; return `M${p(a0, r0)} L${p(a0, r1)} A${r1} ${r1} 0 0 1 ${p(a1, r1)} L${p(a1, r0)} A${r0} ${r0} 0 0 0 ${p(a0, r0)}Z`; };
  const deg = Math.PI / 180;
  const ICONS = {
    erase: svg('<path d="M4 15l8-8 7 7-5 5H8z" fill="currentColor" fill-opacity=".25"/><path d="M8 19h12"/><path d="M8 11l6 6"/>'),
    infect: svg('<circle cx="12" cy="12" r="4.5" fill="currentColor" fill-opacity=".3"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M${12 + Math.cos(a * deg) * 4.5} ${12 + Math.sin(a * deg) * 4.5} L${12 + Math.cos(a * deg) * 8} ${12 + Math.sin(a * deg) * 8}"/><circle cx="${12 + Math.cos(a * deg) * 9}" cy="${12 + Math.sin(a * deg) * 9}" r="1.2" fill="currentColor" stroke="none"/>`).join(''), 'style="color:#c084fc"'),
    disintegrate: svg('<rect x="3" y="11" width="9" height="9" rx="1" fill="currentColor" fill-opacity=".3"/><rect x="14" y="9" width="2.5" height="2.5" fill="currentColor" stroke="none"/><rect x="17" y="4" width="2.5" height="2.5" fill="currentColor" stroke="none"/><rect x="13" y="3" width="2" height="2" fill="currentColor" stroke="none"/><rect x="19" y="11" width="2" height="2" fill="currentColor" stroke="none"/><rect x="9" y="6" width="2" height="2" fill="currentColor" stroke="none"/>', 'style="color:#7dd3fc"'),
    shoot: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>', 'style="color:#fca5a5"'),
    explode: svg('<path d="M12 2l2.4 6 6.6-2-4.4 5 5.4 4-6.5.5.5 6.5-4-5-4 5 .5-6.5L2 15l5.4-4L3 6l6.6 2z" fill="currentColor" fill-opacity=".35"/>', 'style="color:#fb923c"'),
    nuke: `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:#facc15"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.5"/>${[-90, 30, 150].map(a => `<path d="${sector((a - 30) * deg, (a + 30) * deg, 3, 9)}" fill="currentColor"/>`).join('')}<circle cx="12" cy="12" r="1.8" fill="currentColor"/></svg>`,
    lightning: svg('<path d="M13 2L5 13h6l-2 9 10-13h-6l2-7z" fill="currentColor" fill-opacity=".35"/>', 'style="color:#fde047"'),
    freeze: svg('<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 4L12 6.5 14.5 4M9.5 20l2.5-2.5 2.5 2.5"/>', 'style="color:#93c5fd"'),
    heat: svg('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 1 4 3 4 0-3-1-6 0-9z" fill="currentColor" fill-opacity=".3"/>', 'style="color:#f87171"'),
    wind: svg('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>', 'style="color:#a5f3fc"'),
    blackhole: svg('<circle cx="12" cy="12" r="4" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/><path d="M12 4a8 8 0 0 1 7 4" stroke-dasharray="2 2"/>', 'style="color:#a78bfa"'),
    clone: svg('<rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".25"/><rect x="9" y="9" width="12" height="12" rx="2"/>', 'style="color:#fcd34d"'),
    grab: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 13"/>'),
    walker: svg('<circle cx="12" cy="5" r="2.5" fill="currentColor"/><path d="M12 8v7M8 11l4-2 4 2M9 21l3-6 3 6"/>'),
    critter: svg('<ellipse cx="12" cy="13" rx="7" ry="4.5" fill="currentColor" fill-opacity=".35"/><circle cx="18.5" cy="11" r="1" fill="currentColor"/><path d="M7 17l-2 3M12 17.5V21M17 17l2 3M5 9l-2-2"/>', 'style="color:#86efac"'),
    box: svg('<rect x="4" y="4" width="16" height="16" rx="1.5" fill="#b07a3c" fill-opacity=".45"/><path d="M4 4l16 16M20 4L4 20"/>', 'style="color:#d4a373"'),
    ball: svg('<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".35"/><path d="M8.5 8.5a5 5 0 0 1 3.5-1.5"/>', 'style="color:#f472b6"'),
    bomb: svg('<circle cx="11" cy="14" r="6.5" fill="currentColor" fill-opacity=".35"/><path d="M15.5 9.5l2-2M17.5 7.5c1-1.5 2.5-1.5 3.5-.5"/><path d="M20 3v1.5M22 5h-1.5M21.5 2.5l-1 1" stroke="#fbbf24"/>'),
    turret: svg('<path d="M4 20h16v-4H4z" fill="currentColor" fill-opacity=".3"/><path d="M8 16a4 4 0 0 1 8 0"/><path d="M13 13l6-6" stroke-width="3"/>', 'style="color:#cbd5e1"'),
  };
  const swatch = t => { const [r, g_, b] = BASE[t]; return `<span class="sw" style="background-color:rgb(${r},${g_},${b})"></span>`; };
  const TOOLS = [
    // matter
    { id: 'sand', name: 'Sand', tab: 'matter', mat: SAND, tip: 'Falls and piles up. Heat it long enough and it turns to glass.' },
    { id: 'water', name: 'Water', tab: 'matter', mat: WATER, tip: 'Flows and fills. Puts out fire, turns lava to stone, grows seeds.' },
    { id: 'stone', name: 'Stone', tab: 'matter', mat: STONE, tip: 'Solid wall. Only melts in serious heat.' },
    { id: 'wood', name: 'Wood', tab: 'matter', mat: WOOD, tip: 'Solid and flammable. Burns slowly into ash.' },
    { id: 'oil', name: 'Oil', tab: 'matter', mat: OIL, tip: 'Floats on water and goes up in flames fast.' },
    { id: 'lava', name: 'Lava', tab: 'matter', mat: LAVA, tip: 'Slow, hot, ignites everything. Water cools it into stone.' },
    { id: 'ice', name: 'Ice', tab: 'matter', mat: ICE, tip: 'Melts near heat. Salt melts it too.' },
    { id: 'snow', name: 'Snow', tab: 'matter', mat: SNOW, tip: 'Light powder that piles steep and melts easily.' },
    { id: 'salt', name: 'Salt', tab: 'matter', mat: SALT, tip: 'Dissolves in water and melts ice and snow.' },
    { id: 'steam', name: 'Steam', tab: 'matter', mat: STEAM, tip: 'Rises and condenses back into water.' },
    { id: 'smoke', name: 'Smoke', tab: 'matter', mat: SMOKE, tip: 'Drifts up and fades away.' },
    { id: 'acid', name: 'Acid', tab: 'matter', mat: ACID, tip: 'Eats almost anything. Glass holds it.' },
    { id: 'powder', name: 'Gunpowder', tab: 'matter', mat: POWDER, tip: 'Explodes when fire, lava or a bullet touches it. Chains.' },
    { id: 'seed', name: 'Seed', tab: 'matter', mat: SEED, tip: 'Sprouts when it touches water. Plants drink and climb.' },
    { id: 'plant', name: 'Plant', tab: 'matter', mat: PLANT, tip: 'Grows when watered. Flowers at the tips. Burns.' },
    { id: 'metal', name: 'Metal', tab: 'matter', mat: METAL, tip: 'Solid, glows when hot, conducts lightning, bounces bullets.' },
    { id: 'glass', name: 'Glass', tab: 'matter', mat: GLASS, tip: 'Clear wall that acid cannot eat. Shatters when shot.' },
    { id: 'fire', name: 'Fire', tab: 'matter', mat: FIRE, tip: 'Spreads through wood, oil, plants and gunpowder.' },
    // life + things
    { id: 'walker', name: 'Walker', tab: 'life', spawn: 'walker', tip: 'Little people. They walk, climb steps, swim badly and avoid fire if they can.' },
    { id: 'critter', name: 'Critter', tab: 'life', spawn: 'critter', tip: 'Hopping beetles that nibble plants.' },
    { id: 'box', name: 'Crate', tab: 'life', body: 'box', tip: 'Wooden crate. Floats, stacks, burns.' },
    { id: 'ball', name: 'Ball', tab: 'life', body: 'ball', tip: 'Bouncy ball. Throw it with Grab.' },
    { id: 'bomb', name: 'Bomb', tab: 'life', body: 'bomb', tip: 'Ticks for a few seconds, then blows. Fire or bullets set it off early.' },
    { id: 'turret', name: 'Turret', tab: 'life', tip: 'Place gun turrets. With the Shoot tool, every turret fires at your pointer.' },
    // powers
    { id: 'erase', name: 'Erase', tab: 'power', tip: 'Removes anything under the brush.' },
    { id: 'infect', name: 'Infect', tab: 'power', tip: 'Releases a virus that converts matter, crates and creatures. Fire cures it.' },
    { id: 'disintegrate', name: 'Dissolve', tab: 'power', tip: 'Breaks anything under the brush into drifting dust.' },
    { id: 'shoot', name: 'Shoot', tab: 'power', tip: 'Hold to fire every turret at your pointer. Places a turret if you have none.' },
    { id: 'explode', name: 'Explode', tab: 'power', tip: 'Tap for an explosion. Brush size sets the blast.' },
    { id: 'nuke', name: 'Nuke', tab: 'power', tip: 'Tap for a very large explosion. Mind the walkers.' },
    { id: 'lightning', name: 'Lightning', tab: 'power', tip: 'Strikes where you tap. Sand turns to glass, metal and water carry the charge.' },
    { id: 'freeze', name: 'Freeze', tab: 'power', tip: 'Water to ice, lava to stone, creatures frozen solid.' },
    { id: 'heat', name: 'Heat', tab: 'power', tip: 'Melts, boils, ignites. Sand becomes glass, metal glows.' },
    { id: 'wind', name: 'Wind', tab: 'power', tip: 'Drag to blow loose matter, bodies and creatures in that direction.' },
    { id: 'blackhole', name: 'Black hole', tab: 'power', tip: 'Tap to open a black hole for about ten seconds. It eats everything nearby.' },
    { id: 'clone', name: 'Clone', tab: 'power', tip: 'Paint a spawner. It copies the first thing that touches it, forever.' },
    { id: 'grab', name: 'Grab', tab: 'power', tip: 'Pick up crates, balls, bombs, turrets and creatures. Let go to throw.' },
  ];
  const TABS = [['matter', 'Matter'], ['life', 'Life + things'], ['power', 'Powers']];
  const toolById = Object.fromEntries(TOOLS.map(t => [t.id, t]));
  for (const id of [...stats.used]) if (!toolById[id]) stats.used.delete(id);
  let tool = toolById[store.get('tool', 'sand')] || toolById.sand;
  let brush = clamp(store.get('brush', 4), 1, 20);
  let tab = tool.tab;

  // ---------- pointer ----------
  const ptr = { down: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, over: false, held: 0, id: null, hist: [] };
  function track(x, y) { const t = performance.now(); ptr.hist.push([t, x, y]); while (ptr.hist.length > 2 && t - ptr.hist[0][0] > 90) ptr.hist.shift(); }
  function releaseVel() { // cells per 60 Hz tick, from the last ~90 ms of movement
    const h = ptr.hist; if (h.length < 2) return [0, 0];
    const a = h[0], b = h[h.length - 1], dt = Math.max(8, b[0] - a[0]);
    if (performance.now() - b[0] > 120) return [0, 0];
    return [(b[1] - a[1]) / dt * 16.6, (b[2] - a[2]) / dt * 16.6];
  }
  let grab = null, lastSpawn = 0, lastShot = 0, lastBolt = 0, lastNuke = -999;
  function toCell(e) { const r = cvs.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
  cvs.addEventListener('pointerdown', e => {
    if (ptr.down && e.pointerId !== ptr.id) return;
    ensureAudio();
    cvs.setPointerCapture(e.pointerId);
    const [x, y] = toCell(e);
    Object.assign(ptr, { down: true, id: e.pointerId, x, y, px: x, py: y, vx: 0, vy: 0, held: 0, over: true, hist: [] });
    track(x, y);
    onPress();
    e.preventDefault();
  });
  cvs.addEventListener('pointermove', e => {
    const [x, y] = toCell(e);
    if (ptr.down && e.pointerId !== ptr.id) return;
    ptr.x = x; ptr.y = y; ptr.over = true;
    if (ptr.down) track(x, y);
  });
  const up = e => {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    ptr.down = false;
    if (grab) { const o = grab.o, [vx, vy] = releaseVel(); o.grabbed = false; if (!grab.turret) { o.vx = clamp(vx * .9, -5, 5); o.vy = clamp(vy * .9, -5, 5); } grab = null; }
  };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
  cvs.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptr.down) ptr.over = false; });
  cvs.addEventListener('contextmenu', e => e.preventDefault());

  function markUsed(id) {
    if (!toolById[id] || stats.used.has(id)) return;
    stats.used.add(id);
    store.set('used', [...stats.used]);
    if (window.Ballpark && (stats.used.size >= 3)) Ballpark.report('sandbox', { score: stats.used.size, max: TOOLS.length, label: `${stats.used.size}/${TOOLS.length} TOOLS` });
  }
  function onPress() {
    const x = ptr.x | 0, y = ptr.y | 0;
    markUsed(tool.id);
    if (tool.body) { const b = makeBody(tool.body, ptr.x, ptr.y); if (b) sfx('pop'); return; }
    if (tool.spawn) { spawnCreature(); return; }
    switch (tool.id) {
      case 'turret': makeTurret(x, y); sfx('pop'); break;
      case 'explode': explode(x, y, 4 + brush); break;
      case 'nuke': if (frame - lastNuke > 50) { lastNuke = frame; nuke(x, y); } break;
      case 'lightning': lightning(x, y); lastBolt = frame; break;
      case 'blackhole': if (wells.length >= 3) wells.shift(); wells.push({ x: ptr.x, y: ptr.y, t: 0, ate: 0 }); sfx('hole'); break;
      case 'grab': {
        let best = null, bd = 12;
        for (const b of bodies) { const d = Math.hypot(b.x - ptr.x, b.y - ptr.y) - b.w / 2; if (d < bd) { bd = d; best = b; } }
        for (const c of creatures) { const d = Math.hypot(c.x - ptr.x, c.y - c.h / 2 - ptr.y); if (d < bd) { bd = d; best = c; } }
        for (const t of turrets) { const d = Math.hypot(t.x - ptr.x, t.y - ptr.y); if (d < bd) { bd = d; best = t; } }
        if (best) { grab = { o: best, turret: turrets.includes(best) }; best.grabbed = true; }
        break;
      }
      case 'shoot': if (!turrets.length) autoTurret(); break;
    }
  }
  function spawnCreature() {
    const x = ptr.x | 0, y = ptr.y | 0;
    if (x < 1 || x >= W - 1 || y < 1 || y >= H) return;
    if (solidAt(x, y)) return;
    if (makeCreature(tool.spawn, x, y)) sfx('blip');
  }
  function disc(cx, cy, r, fn) {
    const rr = r * r + r * .8;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= rr) fn(y * W + x, x, y); }
  }
  function strokeDiscs(fn, r) { // interpolate along the drag so fast strokes leave no gaps
    const dx = ptr.x - ptr.px, dy = ptr.y - ptr.py, dist = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(dist / Math.max(1, r * .6)));
    for (let k = 1; k <= n; k++) disc(ptr.px + dx * k / n, ptr.py + dy * k / n, r, fn);
  }
  const PAINT_P = { [K_SOLID]: 1, [K_POWDER]: .4, [K_LIQ]: .5, [K_GAS]: .3, [K_FIRE]: .45 };
  function applyTool() {
    const r = brush;
    if (tool.mat) {
      const m = tool.mat, p = m === SEED ? .07 : PAINT_P[KIND[m]] || .5;
      strokeDiscs((i, x, y) => {
        if (mask[i]) return;
        if (g[i] === 0) { if (rnd() < p) set(i, m, m === PLANT ? rndi(3) : undefined); }
        else if (m === FIRE && FLAM[g[i]] > 0 && rnd() < .2) ignite(i);
      }, r);
      return;
    }
    if (tool.spawn) { if (ptr.held % 10 === 0 && ptr.held) spawnCreature(); return; }
    switch (tool.id) {
      case 'erase': {
        strokeDiscs(i => { if (g[i]) { g[i] = 0; dat[i] = 0; } }, r);
        const hit = (x, y) => Math.hypot(x - ptr.x, y - ptr.y) < r + 2;
        for (const b of [...bodies]) if (hit(b.x, b.y)) removeBody(b);
        for (const c of [...creatures]) if (hit(c.x, c.y - c.h / 2)) removeCreature(c);
        for (const t of [...turrets]) if (hit(t.x, t.y)) turrets.splice(turrets.indexOf(t), 1);
        for (const w of [...wells]) if (hit(w.x, w.y)) wells.splice(wells.indexOf(w), 1);
        for (let p = pn - 1; p >= 0; p--) if (hit(PX[p], PY[p])) killP(p);
        break;
      }
      case 'infect': {
        strokeDiscs(i => { const t = g[i]; if (t) { if (t !== VIRUS && t !== SLIME && t !== DUST && rnd() < .5) set(i, VIRUS); } else if (rnd() < .03 && !mask[i]) set(i, VIRUS); }, r);
        for (const c of creatures) if (Math.hypot(c.x - ptr.x, c.y - c.h / 2 - ptr.y) < r + 3) infect(c);
        for (const b of [...bodies]) if (Math.hypot(b.x - ptr.x, b.y - ptr.y) < r + b.w / 2) { stats.infected++; shatterBody(b, VIRUS, true); }
        break;
      }
      case 'disintegrate': {
        let any = false;
        strokeDiscs((i, x, y) => {
          const t = g[i]; if (!t || rnd() > .3) return;
          const col = cellColor(i);
          if (rnd() < .2) { if (launch(i, (rnd() - .5) * .8, -(gdir || 1) * (.3 + rnd() * .6))) PT[pn - 1] = DUST; }
          else { addP(x + .5, y + .5, (rnd() - .5) * .7, -(gdir || 1) * (.2 + rnd() * .9), 0, 18 + rndi(30), mix(col, pack(190, 240, 255), .35)); g[i] = 0; dat[i] = 0; }
          any = true;
        }, r);
        for (const c of [...creatures]) if (Math.hypot(c.x - ptr.x, c.y - c.h / 2 - ptr.y) < r + 2) { if (c.st === 'ok') stats.lost++; crumble(c, true); any = true; }
        for (const b of [...bodies]) if (Math.hypot(b.x - ptr.x, b.y - ptr.y) < r + b.w / 2) {
          drawBody(b, (x, y, col) => addP(x + .5, y + .5, (rnd() - .5) * .8, -(gdir || 1) * (.2 + rnd() * .9), 0, 20 + rndi(30), col));
          removeBody(b); any = true;
        }
        if (any) sfx('fizz');
        break;
      }
      case 'shoot':
        if (frame - lastShot >= 4) { lastShot = frame; if (!turrets.length) autoTurret(); for (const t of turrets) if (t !== (grab && grab.o)) fire(t, ptr.x, ptr.y); }
        break;
      case 'lightning': if (frame - lastBolt > 14 && ptr.held > 14) { lastBolt = frame; lightning(ptr.x | 0, ptr.y | 0); } break;
      case 'freeze': {
        disc(ptr.x, ptr.y, r, i => {
          const t = g[i];
          if (t === WATER && rnd() < .25) set(i, ICE, 0);
          else if (t === LAVA && rnd() < .2) set(i, STONE, 0);
          else if (t === STEAM && rnd() < .2) set(i, WATER, 0);
          else if (t === FIRE) { g[i] = 0; dat[i] = 0; }
          else if (t === BURN) set(i, WOOD, 0);
          else if ((t === VIRUS || t === SLIME || t === ACID) && rnd() < .2) set(i, ICE, 0);
          else if (t === METAL || t === SAND || t === STONE) dat[i] = 0;
          else if (t === 0 && !mask[i] && rnd() < .004) set(i, SNOW, 0);
        });
        for (const c of creatures) if (Math.hypot(c.x - ptr.x, c.y - c.h / 2 - ptr.y) < r + 2) { c.frozen = 420; c.burn = 0; }
        for (const b of bodies) if (Math.hypot(b.x - ptr.x, b.y - ptr.y) < r + b.w / 2) { b.burn = 0; if (b.kind === 'bomb') b.fuse = Math.max(b.fuse, 120); }
        break;
      }
      case 'heat': {
        disc(ptr.x, ptr.y, r, (i) => {
          const t = g[i];
          if ((t === ICE || t === SNOW) && rnd() < .2) set(i, WATER, 0);
          else if ((t === WATER || t === SLIME) && rnd() < .06) set(i, STEAM);
          else if (t === SAND) dat[i] = Math.min(255, dat[i] + 5);
          else if (t === STONE) dat[i] = Math.min(255, dat[i] + 3);
          else if (t === METAL) dat[i] = Math.min(255, dat[i] + 7);
          else if (t === VIRUS) set(i, FIRE);
          else if (FLAM[t] > 0 && rnd() < .05) ignite(i);
          else if (t === 0 && !mask[i] && rnd() < .015) set(i, FIRE, 4 + rndi(6));
        });
        for (const c of creatures) if (c.st === 'ok' && Math.hypot(c.x - ptr.x, c.y - c.h / 2 - ptr.y) < r + 2) { if (c.frozen) c.frozen = 0; else if (rnd() < .05) c.burn = c.burn || 1; }
        for (const b of bodies) if (Math.hypot(b.x - ptr.x, b.y - ptr.y) < r + b.w / 2) { if (b.kind === 'bomb') b.fuse = Math.min(b.fuse, 20); else if (b.kind === 'box' && rnd() < .05) b.burn = b.burn || 1; }
        break;
      }
      case 'wind': {
        let dx = ptr.vx, dy = ptr.vy;
        const sp = Math.hypot(dx, dy);
        const radial = sp < .25;
        if (!radial) { dx /= sp; dy /= sp; }
        const R = r * 1.6 + 2, str = radial ? 1.6 : Math.min(3.5, 1 + sp * .5);
        disc(ptr.x, ptr.y, R, (i, x, y) => {
          const t = g[i]; if (!t || !movable(t) || rnd() > .3) return;
          let ux = dx, uy = dy;
          if (radial) { const ex = x - ptr.x, ey = y - ptr.y, d = Math.hypot(ex, ey) || 1; ux = ex / d; uy = ey / d; }
          launch(i, ux * str + (rnd() - .5) * .6, uy * str + (rnd() - .5) * .6);
        });
        const push = (o, ox, oy) => { const ex = ox - ptr.x, ey = oy - ptr.y, d = Math.hypot(ex, ey); if (d > R * 1.6) return; if (radial) { o.vx += ex / (d || 1) * .35; o.vy += ey / (d || 1) * .35; } else { o.vx += dx * .3 * str; o.vy += dy * .3 * str; } };
        for (const b of bodies) push(b, b.x, b.y);
        for (const c of creatures) push(c, c.x, c.y - c.h / 2);
        for (let p = 0; p < pn; p++) { const ex = PX[p] - ptr.x, ey = PY[p] - ptr.y; if (ex * ex + ey * ey < R * R * 2.5) { if (radial) { const d = Math.hypot(ex, ey) || 1; PVX[p] += ex / d * .3; PVY[p] += ey / d * .3; } else { PVX[p] += dx * .25; PVY[p] += dy * .25; } } }
        if (ptr.held % 3 === 0) for (let k = 0; k < 3; k++) addP(ptr.x + (rnd() - .5) * R, ptr.y + (rnd() - .5) * R, (radial ? (rnd() - .5) * 2 : dx * str * 1.2), (radial ? (rnd() - .5) * 2 : dy * str * 1.2), 0, 14, pack(170, 230, 245));
        break;
      }
      case 'clone': strokeDiscs(i => { if (!mask[i]) set(i, CLONE, 0); }, Math.max(1, r * .6)); break;
      case 'grab':
        if (grab) {
          const o = grab.o;
          if (grab.turret) { o.x = clamp(ptr.x, 2, W - 3); o.y = clamp(ptr.y, 2, H - 1); }
          else { const ty = o.h && o.kind !== 'box' && o.kind !== 'ball' && o.kind !== 'bomb' ? ptr.y + o.h / 2 : ptr.y; o.vx = clamp((ptr.x - o.x) * .4, -5, 5); o.vy = clamp((ty - o.y) * .4, -5, 5); }
        }
        break;
    }
  }

  // ---------- rendering ----------
  function cellColor(i) {
    const t = g[i], s = shd[i];
    switch (t) {
      case WATER: if (elec[i]) return (frame >> 1) & 1 ? ELEC : pal[WATER * 8 + 7]; return dat[i] ? pal[WATER * 8 + ((s + (frame >> 4)) & 3) + 4] : pal[WATER * 8 + ((s + (frame >> 4)) & 7)];
      case LAVA: return lavaPal[(s + ((frame + i * 7) >> 3)) & 15];
      case FIRE: return firePal[Math.min(63, dat[i] + s * 2)];
      case BURN: return burnPal[(s + (frame >> 2)) & 7];
      case STEAM: return mix(bg[i], pal[t * 8 + s], Math.min(1, dat[i] / 60) * .7);
      case SMOKE: return mix(bg[i], pal[t * 8 + s], Math.min(1, dat[i] / 40) * .85);
      case GLASS: return mix(bg[i], pal[t * 8 + s], s === 0 ? .9 : .55);
      case METAL: if (elec[i]) return (frame >> 1) & 1 ? ELEC : WHITE; return dat[i] > 20 ? mix(pal[t * 8 + s], HOT, Math.min(1, (dat[i] - 20) / 200)) : pal[t * 8 + s];
      case SAND: case STONE: return dat[i] > 20 ? mix(pal[t * 8 + s], HOT, Math.min(.85, (dat[i] - 20) / 230)) : pal[t * 8 + s];
      case VIRUS: return virusPal[((dat[i] >> 4) + s + (frame >> 3)) & 15];
      case PLANT: return dat[i] & 128 ? flowerPal[s] : pal[t * 8 + s];
      case CLONE: { const x = i % W, y = (i / W) | 0; return ((x + y) & 3) === 0 ? (dat[i] ? pal[dat[i] * 8 + s] : pack(90, 76, 20)) : pal[t * 8 + s]; }
      case BOLT: return (frame + s) & 1 ? WHITE : ELEC;
      default: return pal[t * 8 + s];
    }
  }
  function put(x, y, col) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) pix[y * W + x] = col; }
  function blend(x, y, col, f) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) { const i = y * W + x; pix[i] = mix(pix[i], col, f); } }
  function drawBody(b, plot) {
    const x0 = Math.floor(b.x - b.w / 2), y0 = Math.floor(b.y - b.h / 2);
    if (b.kind === 'box') {
      const edge = b.burn ? burnPal[(frame >> 2) & 7] : pack(110, 70, 34), face = pack(190, 132, 70), plank = pack(160, 108, 54);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const e = x === 0 || y === 0 || x === b.w - 1 || y === b.h - 1, diag = x === y || x === b.w - 1 - y;
        let col = e || diag ? edge : (y % 3 === 1 ? plank : face);
        if (b.hp < 60 && !e && ((x * 7 + y * 3) % 11 === 0)) col = pack(60, 40, 20);
        plot(x0 + x, y0 + y, col);
      }
      return;
    }
    const r2 = b.r * b.r;
    const base = b.kind === 'ball' ? [pack(240, 80, 130), pack(80, 170, 250), pack(250, 200, 60), pack(120, 220, 140)][b.col] : pack(52, 54, 64);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const dx = x0 + x + .5 - b.x, dy = y0 + y + .5 - b.y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      let col = base;
      if (dx < -b.r * .2 && dy < -b.r * .2 && d2 < r2 * .45) col = mix(base, WHITE, .45);
      else if (d2 > r2 * .6) col = mix(base, pack(0, 0, 0), .25);
      plot(x0 + x, y0 + y, col);
    }
    if (b.kind === 'bomb') {
      const tx = Math.round(b.x + 1), ty = Math.round(b.y - b.r - .5);
      plot(tx, ty, pack(180, 160, 120)); plot(tx + 1, ty - 1, pack(180, 160, 120));
      const blink = b.fuse < 60 ? (frame >> 1) & 1 : (frame >> 3) & 1;
      plot(tx + 1, ty - 2, blink ? pack(255, 230, 90) : pack(255, 90, 40));
      if (blink) plot(Math.round(b.x), Math.round(b.y), pack(255, 60, 50));
    }
  }
  function drawTurret(t) {
    const x = Math.round(t.x), y = Math.round(t.y), base = pack(96, 106, 124), dark = pack(54, 60, 74);
    for (let dx = -2; dx <= 2; dx++) { put(x + dx, y, dark); put(x + dx, y - 1, base); }
    put(x - 1, y - 2, base); put(x, y - 2, base); put(x + 1, y - 2, base);
    const ca = Math.cos(t.a), sa = Math.sin(t.a);
    for (let k = 1; k <= 4; k++) put(x + ca * k, y - 2 + sa * k, k === 4 ? pack(255, 210, 120) : pack(200, 210, 225));
  }
  function render() {
    for (let i = 0; i < N; i++) { const t = g[i]; pix[i] = t === 0 ? bg[i] : (t === SAND || t === STONE || t === WOOD || t === OIL || t === ICE || t === SALT || t === SNOW || t === ACID || t === POWDER || t === SEED || t === DUST || t === SLIME) && !dat[i] ? pal[t * 8 + shd[i]] : cellColor(i); }
    // particles
    for (let p = 0; p < pn; p++) {
      const x = PX[p] | 0, y = PY[p] | 0; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (PL[p] > 0) pix[i] = mix(pix[i], PC[p], Math.min(1, PL[p] / 14));
      else { const t = PT[p]; pix[i] = t === FIRE ? firePal[40 + (p & 15)] : pal[t * 8 + (p & 7)]; }
    }
    for (const w of wells) {
      const R = 3.2 + Math.min(1, w.t / 30) * 1.2;
      for (let k = 0; k < 90; k++) {
        const a = k / 90 * 6.283 + w.t * .09, rr = R + 2 + (k % 3) * 1.4 + Math.sin(a * 3 + w.t * .2);
        blend(w.x + Math.cos(a) * rr, w.y + Math.sin(a) * rr * .55, k % 2 ? pack(255, 170, 80) : pack(190, 120, 255), .7);
      }
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const d2 = dx * dx + dy * dy; if (d2 <= R * R) put(w.x + dx, w.y + dy, 0xff000000); else if (d2 <= (R + 1.2) * (R + 1.2)) blend(w.x + dx, w.y + dy, pack(230, 210, 255), .6); }
    }
    for (const b of bodies) drawBody(b, put);
    for (const t of turrets) drawTurret(t);
    for (const c of creatures) drawCreature(c, put);
    for (const b of bullets) { put(b.x, b.y, pack(255, 250, 200)); blend(b.x - b.vx * .35, b.y - b.vy * .35, pack(255, 200, 80), .7); blend(b.x - b.vx * .7, b.y - b.vy * .7, pack(255, 120, 40), .4); }
    for (const f of fx) if (f.kind === 'ring') {
      const n = Math.ceil(f.r * 6.3), a = 1 - f.r / f.max;
      for (let k = 0; k < n; k++) { const ang = k / n * 6.283; blend(f.x + Math.cos(ang) * f.r, f.y + Math.sin(ang) * f.r, WHITE, a * .8); }
    }
    // brush outline
    if (ptr.over && !tool.body && !tool.spawn && tool.id !== 'grab' && tool.id !== 'turret' && tool.id !== 'shoot' && tool.id !== 'nuke' && tool.id !== 'blackhole') {
      const r = tool.id === 'explode' ? 4 + brush : tool.id === 'wind' ? brush * 1.6 + 2 : brush;
      const n = Math.max(12, Math.ceil(r * 6.3));
      for (let k = 0; k < n; k++) { const a = k / n * 6.283; blend(ptr.x + Math.cos(a) * (r + .5), ptr.y + Math.sin(a) * (r + .5), WHITE, .35); }
    } else if (ptr.over) blend(ptr.x, ptr.y, WHITE, .7);
    if (flash > .01) {
      const f = reduceMotion ? flash * .3 : flash;
      for (let i = 0; i < N; i++) pix[i] = mix(pix[i], WHITE, f);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- audio ----------
  let actx = null, master = null, noiseBuf = null, muted = store.get('muted', false);
  const lastS = {};
  function ensureAudio() {
    if (actx || muted) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = .32; master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { actx = null; }
  }
  function noise(dur, freq, type, vol) {
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const gn = actx.createGain(); const t = actx.currentTime;
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f); f.connect(gn); gn.connect(master); src.start(t); src.stop(t + dur);
  }
  function tone(f0, f1, dur, type, vol) {
    const o = actx.createOscillator(); o.type = type; const gn = actx.createGain(); const t = actx.currentTime;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur);
  }
  function sfx(name) {
    if (muted || !actx) return;
    const now = actx.currentTime, gap = { pew: .05, boom: .09, fizz: .18, tink: .08, blip: .06 }[name] || .04;
    if (lastS[name] && now - lastS[name] < gap) return;
    lastS[name] = now;
    try {
      switch (name) {
        case 'boom': noise(.45, 700, 'lowpass', .7); tone(110, 40, .35, 'sine', .5); break;
        case 'bigboom': noise(.9, 500, 'lowpass', .9); tone(90, 30, .7, 'sine', .7); break;
        case 'nuke': noise(2.4, 320, 'lowpass', 1); tone(70, 20, 2, 'sine', .9); break;
        case 'pew': tone(1300, 240, .09, 'square', .1); break;
        case 'tink': tone(2400, 1800, .06, 'triangle', .12); break;
        case 'zap': noise(.35, 2500, 'highpass', .5); tone(180, 60, .3, 'sawtooth', .18); break;
        case 'pop': tone(320, 640, .08, 'sine', .25); break;
        case 'blip': tone(660, 990, .06, 'triangle', .15); break;
        case 'fizz': noise(.2, 3000, 'bandpass', .18); break;
        case 'hole': tone(220, 50, .9, 'sine', .4); noise(.8, 200, 'lowpass', .3); break;
      }
    } catch { /* audio graph failure is not fatal */ }
  }

  // ---------- UI ----------
  const tabsEl = $('#tabs'), toolsEl = $('#tools'), tipEl = $('#tip'), hudEl = $('#hud');
  function buildToolbar() {
    tabsEl.innerHTML = TABS.map(([id, label]) => `<button class="tab${id === tab ? ' on' : ''}" role="tab" data-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('');
    toolsEl.innerHTML = TABS.map(([id, label]) => `<div class="group ${id}${id === tab ? ' on' : ''}" data-group="${id}"><h3>${label}</h3>${TOOLS.filter(t => t.tab === id).map(t =>
      `<button class="tool${t === tool ? ' on' : ''}" data-tool="${t.id}" title="${t.name}: ${t.tip}" aria-pressed="${t === tool}"><span class="ic">${t.mat ? swatch(t.mat) : ICONS[t.id] || ICONS[t.body] || ''}</span><span class="lbl">${t.name}</span></button>`).join('')}</div>`).join('');
  }
  tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; refreshToolbar(); });
  toolsEl.addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (!b) return; selectTool(b.dataset.tool); });
  function refreshToolbar() {
    tabsEl.querySelectorAll('.tab').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    toolsEl.querySelectorAll('.group').forEach(gp => gp.classList.toggle('on', gp.dataset.group === tab));
    toolsEl.querySelectorAll('.tool').forEach(b => { const on = b.dataset.tool === tool.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  let tipTimer = 0;
  function showTip(html) { tipEl.innerHTML = html; tipEl.classList.remove('fade'); clearTimeout(tipTimer); tipTimer = setTimeout(() => tipEl.classList.add('fade'), 4200); }
  function selectTool(id) {
    tool = toolById[id] || tool; tab = tool.tab; store.set('tool', tool.id);
    refreshToolbar();
    showTip(`<b>${tool.name}</b> ${tool.tip}`);
  }
  const brushEl = $('#brush'), brushVal = $('#brushVal'), brushDot = $('#brushDot');
  function setBrush(v) { brush = clamp(v | 0, 1, 20); brushEl.value = brush; brushVal.textContent = brush; brushDot.style.setProperty('--d', `${4 + brush * .7}px`); store.set('brush', brush); }
  brushEl.addEventListener('input', () => setBrush(+brushEl.value));

  const CI = {
    pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
    play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
    step: svg('<path d="M5 5l10 7-10 7z" fill="currentColor"/><path d="M19 5v14" stroke-width="2.5"/>'),
    slow: svg('<circle cx="12" cy="13" r="8"/><path d="M12 13V9M12 13l3 2M9 2h6"/>'),
    gdown: svg('<path d="M12 3v16M6 13l6 6 6-6"/>'),
    gup: svg('<path d="M12 21V5M6 11l6-6 6 6"/>'),
    goff: svg('<circle cx="12" cy="12" r="7"/><path d="M5 19L19 5"/>'),
    scene: svg('<path d="M3 20l6-9 4 6 3-4 5 7z" fill="currentColor" fill-opacity=".3"/><circle cx="17" cy="6" r="2"/>'),
    clear: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    sound: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" fill-opacity=".3"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
    mute: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" fill-opacity=".3"/><path d="M17 9l5 6M22 9l-5 6"/>'),
    snap: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  };
  const ctrlsEl = $('#ctrls');
  const CTRLS = [['pause', 'Pause', 'Pause or resume (Space)'], ['step', 'Step', 'Advance one frame (.)'], ['slow', 'Slow-mo', 'Slow motion (Z)'], ['gravity', 'Gravity', 'Gravity: down, off, up (G)'], ['scene', 'Scene', 'Load a fresh demo scene'], ['clear', 'Clear', 'Empty the world'], ['sound', 'Sound', 'Sound on or off (M)'], ['snap', 'Snap', 'Snapshot and share']];
  ctrlsEl.innerHTML = CTRLS.map(([id, label, title]) => `<button class="cbtn" type="button" data-c="${id}" title="${title}" aria-label="${title}"><span class="i"></span><span class="lbl">${label}</span></button>`).join('');
  const cbtn = id => ctrlsEl.querySelector(`[data-c="${id}"]`);
  function refreshCtrls() {
    cbtn('pause').querySelector('.i').innerHTML = paused ? CI.play : CI.pause;
    cbtn('pause').querySelector('.lbl').textContent = paused ? 'Play' : 'Pause';
    cbtn('pause').classList.toggle('on', paused);
    cbtn('step').querySelector('.i').innerHTML = CI.step;
    cbtn('slow').querySelector('.i').innerHTML = CI.slow; cbtn('slow').classList.toggle('on', slow);
    cbtn('gravity').querySelector('.i').innerHTML = gdir > 0 ? CI.gdown : gdir < 0 ? CI.gup : CI.goff;
    cbtn('gravity').querySelector('.lbl').textContent = gdir > 0 ? 'Gravity' : gdir < 0 ? 'Reversed' : 'Zero-G';
    cbtn('gravity').classList.toggle('on', gdir !== 1);
    cbtn('scene').querySelector('.i').innerHTML = CI.scene;
    cbtn('clear').querySelector('.i').innerHTML = CI.clear;
    cbtn('sound').querySelector('.i').innerHTML = muted ? CI.mute : CI.sound;
    cbtn('snap').querySelector('.i').innerHTML = CI.snap;
    $('#pausedBadge').hidden = !paused;
  }
  ctrlsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    ensureAudio();
    control(b.dataset.c);
  });
  function control(id) {
    switch (id) {
      case 'pause': paused = !paused; break;
      case 'step': paused = true; stepOnce = true; break;
      case 'slow': slow = !slow; break;
      case 'gravity': gdir = gdir === 1 ? 0 : gdir === 0 ? -1 : 1; showTip(gdir === 1 ? '<b>Gravity</b> normal.' : gdir === 0 ? '<b>Zero-G</b> things float where they are.' : '<b>Reversed</b> everything falls up.'); markUsed('gravity'); break;
      case 'scene': clearWorld(); buildScene(); break;
      case 'clear': clearWorld(); showTip('<b>Clear.</b> A blank lot. Paint something.'); break;
      case 'sound': muted = !muted; store.set('muted', muted); if (!muted) ensureAudio(); break;
      case 'snap': openSnap(); break;
    }
    refreshCtrls();
  }
  function clearWorld() { g.fill(0); dat.fill(0); creatures.length = 0; bodies.length = 0; turrets.length = 0; wells.length = 0; bullets.length = 0; fx.length = 0; pn = 0; grab = null; elecList.length = 0; elec.fill(0); }

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (!$('#snap').hidden) { if (e.key === 'Escape') $('#snap').hidden = true; return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { control('pause'); e.preventDefault(); }
    else if (k === '.') control('step');
    else if (k === 'z') control('slow');
    else if (k === 'g') control('gravity');
    else if (k === 'm') control('sound');
    else if (k === '[') setBrush(brush - 1);
    else if (k === ']') setBrush(brush + 1);
    else if (k === 'f') showFps = !showFps;
    else if (/^[1-9]$/.test(k)) { const list = TOOLS.filter(t => t.tab === tab); const t = list[+k - 1]; if (t) selectTool(t.id); }
  });

  // ---------- snapshot / share ----------
  function summary() {
    const alive = creatures.filter(c => c.st === 'ok').length;
    return `SANDLOT (BALLPARK sandbox)\nTools tried: ${stats.used.size}/${TOOLS.length}\nExplosions: ${stats.explosions}  Nukes: ${stats.nukes}  Lightning: ${stats.bolts}\nCreatures spawned: ${stats.spawned}  Still standing: ${alive}  Lost: ${stats.lost}  Infected: ${stats.infected}\nhttps://marcrsfeir-commits.github.io/ballpark/games/sandbox/`;
  }
  function bigCanvas() { const c = document.createElement('canvas'), k = Math.max(2, Math.round(1200 / W)); c.width = W * k; c.height = H * k; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(cvs, 0, 0, c.width, c.height); return c; }
  function openSnap() {
    markUsed('snap');
    $('#snapImg').src = bigCanvas().toDataURL('image/png');
    $('#snapText').textContent = summary();
    $('#snap').hidden = false;
    $('#snapCopy').focus();
  }
  const toastEl = $('#toast'); let toastT = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 1800); }
  $('#snapCopy').onclick = () => { const txt = summary(); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Summary copied'), () => toast('Copy blocked by the browser')); };
  $('#snapSave').onclick = () => { const a = document.createElement('a'); a.download = `sandlot-${Date.now()}.png`; a.href = bigCanvas().toDataURL('image/png'); a.click(); toast('Image saved'); };
  $('#snapClose').onclick = () => { $('#snap').hidden = true; };
  $('#snap').addEventListener('click', e => { if (e.target.id === 'snap') $('#snap').hidden = true; });

  // ---------- demo scene ----------
  function buildScene() {
    const base = Math.round(H * .86);
    const ground = x => base - Math.round(Math.sin(x / W * 6.283 * 1.3) * H * .025 + Math.sin(x / 9) * 1.2);
    for (let x = 0; x < W; x++) for (let y = ground(x); y < H; y++) set(y * W + x, STONE, 0);
    // pond in a stone basin, middle-left
    const bx0 = (W * .3) | 0, bx1 = (W * .5) | 0, depth = Math.max(8, Math.round(H * .16));
    const bfloor = Math.min(H - 3, ground(bx0) + depth - 4);
    for (let x = bx0; x <= bx1; x++) for (let y = Math.min(ground(bx0), ground(bx1)) - 3; y <= bfloor; y++) {
      const i = y * W + x;
      if (x <= bx0 + 1 || x >= bx1 - 1) set(i, STONE, 0); else if (y >= ground(bx0) - 1) set(i, WATER, 0); else { g[i] = 0; dat[i] = 0; }
    }
    // sand dune on the left
    const dw = bx0 - 3, dh = Math.round(H * .2);
    for (let x = 0; x < dw; x++) { const h = Math.round(dh * Math.pow(Math.sin(Math.PI * (x + 2) / (dw + 4)), 1.4)); for (let y = ground(x) - h; y < ground(x); y++) set(y * W + x, SAND, 0); }
    // wooden pier with a crate, garden on the right
    const px0 = (W * .58) | 0, px1 = (W * .78) | 0, py = Math.round(H * .6);
    for (let x = px0; x <= px1; x++) { set(py * W + x, WOOD, 0); set((py + 1) * W + x, WOOD, 0); }
    for (const lx of [px0 + 1, (px0 + px1) >> 1, px1 - 1]) for (let y = py + 2; y < ground(lx); y++) set(y * W + lx, WOOD, 0);
    for (let k = 0; k < 7; k++) { const x = px1 + 4 + k * 3; if (x < W - 2) set((ground(x) - 1) * W + x, PLANT, Math.round(H * .12) + rndi(14)); }
    // stone arch on the far left holding some oil, a lava pocket on the far right
    const ox = Math.max(4, (W * .1) | 0), oy = Math.round(H * .3);
    for (let x = ox; x < ox + 16 && x < W; x++) set((oy + 4) * W + x, STONE, 0);
    for (const x of [ox, ox + 15]) for (let y = oy; y < oy + 4; y++) set(y * W + x, STONE, 0);
    for (let x = ox + 1; x < ox + 15; x++) for (let y = oy + 1; y < oy + 4; y++) set(y * W + x, OIL, 0);
    const lx = (W * .9) | 0;
    for (let x = lx; x < Math.min(W - 1, lx + 10); x++) for (let y = ground(x) + 2; y < Math.min(H - 1, ground(x) + 5); y++) set(y * W + x, LAVA, 0);
    makeBody('box', (px0 + px1) / 2, py - 6);
    makeBody('ball', W * .2, H * .25);
    for (const f of [.06, .14, .54, .62, .7]) { const x = (W * f) | 0; makeCreature('walker', x, ground(x) - (f < .3 ? dh + 4 : f > .55 && f < .78 ? 0 : 2) - 3); }
    makeCreature('walker', (W * .66) | 0, py - 3);
    makeCreature('critter', (W * .7) | 0, py - 2);
    makeCreature('critter', (W * .86) | 0, ground((W * .86) | 0) - 2);
    stats.spawned = 0; stats.lost = 0; stats.deaths.length = 0; stats.infected = 0;
  }

  // ---------- sizing ----------
  function fit() {
    const r = stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const s = Math.max(2.5, Math.sqrt(r.width * r.height / 64000));
    const nw = Math.max(60, Math.round(r.width / s)), nh = Math.max(50, Math.round(r.height / s));
    if (nw === W && nh === H) return;
    alloc(nw, nh);
  }
  let fitT = 0;
  new ResizeObserver(() => { clearTimeout(fitT); fitT = setTimeout(fit, W ? 120 : 0); }).observe(stage);

  // ---------- main loop ----------
  let last = performance.now(), acc = 0, toolAcc = 0, showFps = /[?&]fps/.test(location.search), fps = 0, fpsN = 0, fpsT = last, hudT = 0;
  function simStep() {
    stampMask();
    stepGrid();
    updParticles();
    stepBodies();
    stepCreatures();
    stepBullets();
    stepWells();
    stepFx();
    if (fizz) { sfx('fizz'); fizz = false; }
    frame++;
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (!W) { fit(); if (!W) return; }
    const dt = Math.min(100, now - last); last = now;
    const w0 = performance.now();
    // tools run on a fixed 60 Hz tick (also while paused) so 120/144/240 Hz screens behave the same
    toolAcc += dt;
    let tn = 0;
    while (toolAcc >= 16.6 && tn < 2) {
      toolAcc -= 16.6; tn++;
      const ivx = ptr.x - ptr.px, ivy = ptr.y - ptr.py; // pointer velocity, cells per tick
      ptr.vx = ptr.vx * .5 + ivx * .5; ptr.vy = ptr.vy * .5 + ivy * .5;
      if (ptr.down) { applyTool(); ptr.held++; }
      ptr.px = ptr.x; ptr.py = ptr.y;
    }
    if (toolAcc > 50) toolAcc = 0;
    if (!paused || stepOnce) {
      acc += slow ? dt / 4 : dt;
      let n = 0;
      if (stepOnce) { simStep(); stepOnce = false; acc = 0; }
      else while (acc >= 16.6 && n < 2) { simStep(); acc -= 16.6; n++; }
      if (acc > 50) acc = 0;
    } else stampMask();
    flash *= .86; if (flash < .01) flash = 0;
    if (shake > .3 && !reduceMotion) { cvs.style.transform = `translate(${(rnd() - .5) * shake}px, ${(rnd() - .5) * shake}px)`; shake *= .85; }
    else if (shake) { shake = 0; cvs.style.transform = ''; }
    render();
    api.workMs = api.workMs * .95 + (performance.now() - w0) * .05;
    fpsN++;
    if (now - fpsT >= 1000) { fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; api.fps = fps; }
    if (now - hudT > 250) {
      hudT = now;
      let alive = 0, inf = 0, dead = 0;
      for (const c of creatures) { if (c.st === 'ok') { alive++; if (c.inf) inf++; } else dead++; }
      hudEl.innerHTML = `<b>${alive}</b> alive${inf ? ` · <span class="inf">${inf} infected</span>` : ''}${stats.lost ? ` · <span class="bad">${stats.lost} lost</span>` : ''}${showFps ? ` · ${fps} fps · ${W}x${H}` : ''}`;
    }
  }

  // ---------- test / debug hooks ----------
  const api = {
    M: { EMPTY, SAND, WATER, STONE, WOOD, OIL, LAVA, ICE, STEAM, SMOKE, ACID, POWDER, SEED, PLANT, METAL, GLASS, SALT, SNOW, FIRE, VIRUS, DUST, CLONE, BOLT, BURN, SLIME },
    get W() { return W; }, get H() { return H; }, get grid() { return g; }, get frame() { return frame; }, fps: 0, workMs: 0,
    get particles() { return pn; },
    count(t) { let n = 0; for (let i = 0; i < N; i++) if (g[i] === t) n++; return n; },
    countIn(t, x0, y0, x1, y1) { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (g[y * W + x] === t) n++; return n; },
    fill(t, x0, y0, x1, y1) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x >= 0 && y >= 0 && x < W && y < H) set(y * W + x, t); },
    setTool: selectTool, setBrush, control, clear: clearWorld, scene: buildScene,
    creatures, bodies, turrets, wells, bullets, stats,
    get gravity() { return gdir; }, get paused() { return paused; }, get slow() { return slow; },
    makeCreature, makeBody, explode, nuke, lightning,
    // simulate the pointer in cell coordinates
    press(x, y) { ptr.down = true; ptr.x = ptr.px = x; ptr.y = ptr.py = y; ptr.held = 0; ptr.over = true; ptr.hist = []; track(x, y); onPress(); },
    move(x, y) { ptr.x = x; ptr.y = y; if (ptr.down) track(x, y); },
    release() { up({ pointerId: ptr.id }); },
  };
  window.__sandlot = api;

  buildToolbar();
  setBrush(brush);
  refreshCtrls();
  fit();
  if (W) buildScene();
  else requestAnimationFrame(() => { fit(); buildScene(); });
  showTip(`<b>${tool.name}</b> ${tool.tip} Drag on the world to use it.`);
  requestAnimationFrame(loop);
})();
