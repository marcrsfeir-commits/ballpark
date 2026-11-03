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
    CLONE = 21, BOLT = 22, BURN = 23, SLIME = 24, DIRT = 25, MUD = 26, CLAY = 27, BRICK = 28, CONCRETE = 29, CONCSET = 30,
    HONEY = 31, MERCURY = 32, NITRO = 33, THERMITE = 34, C4 = 35, NAPALM = 36, PLASMA = 37, LN2 = 38, COAL = 39, RUBBER = 40,
    GOLD = 41, COPPER = 42, WAX = 43, WAXM = 44, CLOUD = 45, ANTI = 46, VOID = 47, CRYSTAL = 48, FWORK = 49, SAPLING = 50,
    SPRING = 51, NT = 52;
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
  def(DIRT, 'Dirt', K_POWDER, 55, 0, [112, 78, 50], .12);
  def(MUD, 'Mud', K_LIQ, 48, 0, [82, 56, 38], .1);
  def(CLAY, 'Clay', K_POWDER, 59, 0, [178, 114, 92], .08);
  def(BRICK, 'Brick', K_SOLID, 90, 0, [172, 72, 58], .12);
  def(CONCRETE, 'Wet concrete', K_LIQ, 52, 0, [150, 152, 156], .05);
  def(CONCSET, 'Concrete', K_SOLID, 90, 0, [128, 130, 136], .08);
  def(HONEY, 'Honey', K_LIQ, 36, .03, [238, 172, 28], .07);
  def(MERCURY, 'Mercury', K_LIQ, 85, 0, [196, 206, 218], .1);
  def(NITRO, 'Nitro', K_LIQ, 38, .4, [120, 232, 150], .08);
  def(THERMITE, 'Thermite', K_POWDER, 62, .3, [150, 84, 62], .15);
  def(C4, 'C4', K_SOLID, 90, 0, [224, 216, 190], .05);
  def(NAPALM, 'Napalm', K_LIQ, 24, .6, [214, 112, 40], .1);
  def(PLASMA, 'Plasma', K_GAS, 1, 0, [226, 96, 255], .1);
  def(LN2, 'Liquid nitrogen', K_LIQ, 26, 0, [150, 236, 255], .08);
  def(COAL, 'Coal', K_POWDER, 56, .02, [40, 40, 46], .2);
  def(RUBBER, 'Rubber', K_SOLID, 90, .02, [226, 70, 112], .06);
  def(GOLD, 'Gold', K_SOLID, 90, 0, [246, 198, 50], .1);
  def(COPPER, 'Copper', K_SOLID, 90, 0, [204, 114, 62], .1);
  def(WAX, 'Wax', K_SOLID, 90, .05, [242, 232, 198], .04);
  def(WAXM, 'Molten wax', K_LIQ, 27, .05, [246, 228, 170], .05);
  def(CLOUD, 'Cloud', K_GAS, 1, 0, [234, 240, 250], .05);
  def(ANTI, 'Antimatter', K_POWDER, 70, 0, [255, 70, 210], .15);
  def(VOID, 'Void', K_SOLID, 90, 0, [24, 12, 40], .2);
  def(CRYSTAL, 'Crystal', K_SOLID, 90, 0, [124, 212, 244], .18);
  def(FWORK, 'Firework', K_FX, 0, 0, [255, 232, 120], 0);
  def(SAPLING, 'Sapling', K_SOLID, 90, .1, [100, 152, 62], .1);
  def(SPRING, 'Spring', K_SOLID, 90, 0, [92, 204, 164], .08);
  // lookup tables: CLS = conductor class (1 metallic, 2 water), PLAIN = colour is just the palette when dat is 0,
  // SOFT = ants can dig it, ACIDPROOF = acid ignores it
  const CLS = new Uint8Array(NT), PLAIN = new Uint8Array(NT), SOFT = new Uint8Array(NT), ACIDPROOF = new Uint8Array(NT);
  for (const t of [METAL, MERCURY, GOLD, COPPER]) CLS[t] = 1;
  CLS[WATER] = 2;
  for (const t of [SAND, STONE, WOOD, OIL, ICE, SALT, SNOW, ACID, POWDER, SEED, DUST, SLIME, DIRT, MUD, CLAY, BRICK, HONEY, NITRO, NAPALM, C4, RUBBER, WAX, WAXM, SPRING, CONCSET, COAL]) PLAIN[t] = 1;
  for (const t of [SAND, DIRT, MUD, SNOW, DUST, CLAY, COAL, SALT, SEED]) SOFT[t] = 1;
  for (const t of [ACID, GLASS, CLONE, BOLT, FIRE, SMOKE, STEAM, GOLD, MERCURY, PLASMA, CLOUD, VOID, ANTI, FWORK, LN2]) ACIDPROOF[t] = 1;

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
  let g, dat, shd, stamp, mask, elec, bg, img, pix, tint, frz;
  const elecList = [];
  function alloc(nw, nh) {
    const og = g, od = dat, os = shd, ot = tint, ow = W, oh = H;
    W = nw; H = nh; N = W * H;
    g = new Uint8Array(N); dat = new Uint8Array(N); shd = new Uint8Array(N); stamp = new Uint8Array(N); mask = new Uint8Array(N); elec = new Uint8Array(N);
    tint = new Uint8Array(N); frz = new Uint8Array(N);
    elecList.length = 0; frzList.length = 0; undoStack.length = 0;
    const dy = H - (oh || H);
    if (og) {
      for (let y = 0; y < oh; y++) {
        const ny = y + dy; if (ny < 0 || ny >= H) continue;
        for (let x = 0; x < Math.min(ow, W); x++) { const a = y * ow + x, b = ny * W + x; g[b] = og[a]; dat[b] = od[a]; shd[b] = os[a]; tint[b] = ot[a]; }
      }
      const fix = e => { e.y += dy; e.x = clamp(e.x, 1, W - 2); e.y = clamp(e.y, 1, H - 1); };
      creatures.forEach(fix); bodies.forEach(fix); turrets.forEach(fix); wells.forEach(fix); fans.forEach(fix); portals.forEach(fix); twisters.forEach(fix);
      pn = 0; bullets.length = 0; ragdolls.length = 0; meteors.length = 0; boomQ.length = 0;
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
      case PLASMA: return 30 + rndi(40);
      case CLOUD: return 60 + rndi(90);
      case FWORK: return 24 + rndi(26);
      default: return 0;
    }
  }
  function set(i, t, d) { g[i] = t; dat[i] = d === undefined ? lifeOf(t) : d; shd[i] = rndi(8); stamp[i] = fid; tint[i] = 0; }
  const DX = [1, -1, 0, 0, 1, -1, 1, -1], DY = [0, 0, 1, -1, 1, 1, -1, -1];
  function nbr(x, y, k) {
    let nx = x + DX[k]; const ny = y + DY[k];
    if (ny < 0 || ny >= H) return -1;
    if (nx < 0 || nx >= W) { if (!wrap) return -1; nx = nx < 0 ? W - 1 : 0; }
    return ny * W + nx;
  }
  const lx = (x, dir) => { const n = x + dir; return n < 0 ? (wrap ? W - 1 : -1) : n >= W ? (wrap ? 0 : -1) : n; }; // lateral step, wrapping if enabled
  const rn8 = (x, y) => nbr(x, y, rndi(8));
  const rn4 = (x, y) => nbr(x, y, rndi(4));
  const movable = t => { const k = KIND[t]; return k === K_POWDER || k === K_LIQ || k === K_GAS || k === K_FIRE; };

  // ---------- state ----------
  let fid = 1, frame = 0, gdir = 1, paused = false, slow = false, stepOnce = false;
  let flash = 0, shake = 0;
  const creatures = [], bodies = [], turrets = [], wells = [], bullets = [], fx = [];
  const ragdolls = [], fans = [], portals = [], twisters = [], meteors = [], boomQ = [], frzList = [], undoStack = [];
  let wrap = store.get('wrap', false), speed = clamp(+store.get('speed', 1) || 1, .25, 3), heatView = false, hoverInfo = store.get('info', false);
  let sizeMode = store.get('size', 'M'), rainT = 0, rainMat = 0, quakeT = 0, showerT = 0, showerX = 0, anyTint = false, portalNext = 0, lineMat = STONE, paintIdx = 1, beam = null;
  const stats = { fireworks: 0, annihilated: 0, explosions: 0, nukes: 0, bolts: 0, spawned: 0, lost: 0, infected: 0, shots: 0, deaths: [], used: new Set(store.get('used', [])) };

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
      if (frzList.length && PX[p] >= 0 && PY[p] >= 0 && PX[p] < W && PY[p] < H && frz[(PY[p] | 0) * W + (PX[p] | 0)]) continue;
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
        let nx = x + vx / steps; const ny = y + vy / steps;
        if (wrap) { if (nx < 0) nx += W; else if (nx >= W) nx -= W; }
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
    const tn = tint[i]; tint[i] = tint[j]; tint[j] = tn;
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
    const xa = lx(x, dir);
    if (xa >= 0 && canEnter(ny * W + xa, d) && canEnter(y * W + xa, d)) { swap(i, ny * W + xa); return; }
    const xb = lx(x, -dir);
    if (xb >= 0 && canEnter(ny * W + xb, d) && canEnter(y * W + xb, d)) swap(i, ny * W + xb);
  }
  function liquid(x, y, i, t, disp) {
    const d = DENS[t];
    if (gdir === 0) { if (rnd() < .06) { const k = rn4(x, y); if (k >= 0 && g[k] === 0 && !mask[k]) swap(i, k); } return; }
    const ny = y + gdir;
    if (ny >= 0 && ny < H) {
      const j = i + gdir * W;
      if (canEnter(j, d)) { swap(i, j); return; }
      const dir = rnd() < .5 ? -1 : 1;
      const xa = lx(x, dir);
      if (xa >= 0 && canEnter(ny * W + xa, d)) { swap(i, ny * W + xa); return; }
      const xb = lx(x, -dir);
      if (xb >= 0 && canEnter(ny * W + xb, d)) { swap(i, ny * W + xb); return; }
    }
    const dir = rnd() < .5 ? -1 : 1;
    let tgt = -1, cx = x;
    for (let k = 1; k <= disp; k++) {
      cx = lx(cx, dir); if (cx < 0) break;
      const c = y * W + cx; if (mask[c]) break;
      const tc = g[c];
      if (tc === 0 || KIND[tc] === K_GAS) { tgt = c; if (ny >= 0 && ny < H && g[ny * W + cx] === 0) break; }
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
      const dir = rnd() < .5 ? -1 : 1;
      let cx = x;
      if (rnd() > .6) { const l = lx(x, dir); if (l >= 0) cx = l; }
      const c = ny * W + cx, tc = g[c];
      if (!mask[c] && (tc === 0 || (KIND[tc] === K_LIQ && rnd() < .3))) { swap(i, c); return; }
    }
    const dir = rnd() < .5 ? -1 : 1, l = lx(x, dir);
    if (l >= 0 && g[y * W + l] === 0 && !mask[y * W + l]) swap(i, y * W + l);
  }

  // ---------- reactions ----------
  function ignite(k) {
    const t = g[k];
    if (t === POWDER) { explode(k % W, (k / W) | 0, 3, .5); return; }
    if (t === OIL) set(k, FIRE, 30 + rndi(30));
    else if (t === WOOD) set(k, BURN);
    else if (t === PLANT || t === SEED || t === SAPLING) set(k, BURN, 30 + rndi(40));
    else if (t === DUST) set(k, FIRE, 8 + rndi(10));
    else if (t === NITRO) boom(k, 6, .9);
    else if (t === NAPALM) set(k, BURN, 200 + rndi(55));
    else if (t === COAL) { if (!dat[k]) dat[k] = 255; }
    else if (t === THERMITE) { if (!dat[k]) dat[k] = 120; }
    else if (t === WAX || t === WAXM) set(k, WAXM, 0);
    else if (t === HONEY || t === RUBBER) set(k, BURN, 60 + rndi(60));
  }
  // chain-reaction explosions are queued so they never recurse inside the grid pass
  function boom(i, r, power) { if (boomQ.length < 240) boomQ.push(i % W, (i / W) | 0, r, power); set(i, FIRE, 4 + rndi(6)); }
  function runBooms() {
    const cnt = Math.min(boomQ.length >> 2, 24);
    for (let k = 0; k < cnt; k++) explode(boomQ[k * 4], boomQ[k * 4 + 1], boomQ[k * 4 + 2], boomQ[k * 4 + 3]);
    boomQ.splice(0, cnt * 4);
  }
  function leaves(x, y) {
    const r = 2 + rndi(2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const k = yy * W + xx; if (g[k] === 0 && !mask[k] && rnd() < .8) set(k, PLANT, rnd() < .15 ? 128 : 0);
    }
  }
  const FW_COLS = [[255, 70, 70], [255, 200, 60], [90, 255, 140], [90, 200, 255], [220, 110, 255], [255, 255, 255], [255, 140, 40]];
  function burstFirework(x, y) {
    const a = FW_COLS[rndi(7)], b = FW_COLS[rndi(7)], n = 46 + rndi(24), big = 1.4 + rnd() * 1.3;
    for (let k = 0; k < n; k++) {
      const ang = k / n * 6.283 + rnd() * .1, sp = big * (.55 + rnd() * .5), c = rnd() < .5 ? a : b;
      addP(x + .5, y + .5, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, 36 + rndi(30), pack(c[0], c[1], c[2]));
    }
    stats.fireworks++; flash = Math.max(flash, .08);
    sfx('pop');
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
        if (k >= 0 && g[k] === MUD && rnd() < .04) { set(i, PLANT, 25 + rndi(35)); return; }
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
          else if (tk === DIRT && rnd() < .03) { set(k, MUD, 0); set(i, 0, 0); return; }
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
          else if (tk && !ACIDPROOF[tk]) {
            const c = tk === METAL ? .02 : tk === COPPER ? .06 : tk === STONE ? .06 : (tk === BRICK || tk === CONCSET) ? .012 : .25;
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
          else if (tk === MUD) { if (rnd() < .1) set(k, DIRT, 0); }
          else if (tk === CLAY) dat[k] = Math.min(255, dat[k] + 12);
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
          else if (tk === MUD) { if (rnd() < .05) set(k, DIRT, 0); }
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
      case DIRT: powder(x, y, i, t, .5); break;
      case COAL:
        if (dat[i]) { // glowing ember: burns about twice as long as wood
          if (rnd() < .5 && --dat[i] <= 0) { set(i, DUST, 0); return; }
          const k = rn8(x, y);
          if (k >= 0) {
            const tk = g[k];
            if (tk === 0) { if (rnd() < .05) set(k, FIRE, 8 + rndi(14)); }
            else if (tk === WATER) { if (rnd() < .2) { dat[i] = 0; set(k, STEAM); } }
            else if (FLAM[tk] > 0) { if (rnd() < .3) ignite(k); }
            else if (tk === ICE || tk === SNOW) { if (rnd() < .2) set(k, WATER, 0); }
            else if (tk === METAL) dat[k] = Math.min(255, dat[k] + 3);
          }
        }
        powder(x, y, i, t, .6); break;
      case MUD: {
        const k = rn8(x, y);
        if (k >= 0) { const tk = g[k]; if ((tk === FIRE || tk === LAVA || tk === PLASMA || tk === BURN) && rnd() < .3) { set(i, DIRT, 0); return; } }
        if (rnd() < .2) liquid(x, y, i, t, 1);
        break;
      }
      case CLAY: {
        for (let n = 0; n < 2; n++) {
          const k = rn8(x, y); if (k < 0) continue; const tk = g[k];
          if (tk === FIRE || tk === BURN || tk === PLASMA) dat[i] = Math.min(255, dat[i] + 3);
          else if (tk === LAVA) dat[i] = Math.min(255, dat[i] + 10);
          else if (tk === METAL && dat[k] > 100) dat[i] = Math.min(255, dat[i] + 3);
          else if (tk === CLAY && dat[k] > dat[i] + 25 && rnd() < .5) dat[i] = Math.min(255, dat[i] + 4); // heat creeps through the lump
        }
        if (dat[i] >= 100) { set(i, BRICK, 0); return; }
        powder(x, y, i, t, .3); break;
      }
      case CONCRETE: {
        const j = i + gdir * W, by = y + gdir;
        const resting = gdir === 0 || by < 0 || by >= H || !canEnter(j, DENS[t]);
        if (resting && rnd() < .55 && ++dat[i] >= 100) { set(i, CONCSET, 0); return; }
        const k = rn8(x, y); if (k >= 0 && g[k] === WATER && rnd() < .02) { set(i, CONCSET, 0); return; }
        if (rnd() < .45) liquid(x, y, i, t, 2);
        break;
      }
      case HONEY: if (rnd() < .12) liquid(x, y, i, t, 1); break;
      case MERCURY: liquid(x, y, i, t, 5); break;
      case NAPALM: if (rnd() < .5) liquid(x, y, i, t, 3); break;
      case NITRO: {
        const k = rn8(x, y);
        if (k >= 0) { const tk = g[k]; if (tk === FIRE || tk === BURN || tk === LAVA || tk === PLASMA || tk === BOLT || elec[k] || (tk === THERMITE && dat[k])) { boom(i, 6, .9); return; } }
        const by = y + gdir;
        const free = gdir !== 0 && by >= 0 && by < H && canEnter(i + gdir * W, DENS[t]);
        if (free) dat[i] = Math.min(250, dat[i] + 1);
        else { if (dat[i] >= 6 && gdir !== 0) { boom(i, 6, .9); return; } dat[i] = 0; }
        liquid(x, y, i, t, 4); break;
      }
      case THERMITE: {
        if (dat[i]) {
          if (--dat[i] <= 0) { set(i, LAVA, 0); return; }
          for (let n = 0; n < 2; n++) {
            const k = rn8(x, y); if (k < 0) continue; const tk = g[k];
            if (tk === 0) { if (rnd() < .08) set(k, FIRE, 8 + rndi(10)); }
            else if (tk === THERMITE) { if (!dat[k] && rnd() < .3) dat[k] = 120; }
            else if (tk === WATER) set(k, STEAM);
            else if (tk === CLONE || tk === BOLT || tk === LAVA || tk === VOID || mask[k]) continue;
            else if (CLS[tk] === 1) { if (rnd() < .35) set(k, LAVA, 0); }
            else if (KIND[tk] === K_SOLID || KIND[tk] === K_POWDER) { if (rnd() < .15) set(k, LAVA, 0); }
            else if (FLAM[tk] > 0) ignite(k);
          }
        } else {
          const k = rn8(x, y);
          if (k >= 0) { const tk = g[k]; if (tk === FIRE || tk === LAVA || tk === BURN || tk === PLASMA || (tk === METAL && dat[k] > 150)) dat[i] = 120; }
        }
        powder(x, y, i, t, .7); break;
      }
      case C4: {
        const k = rn4(x, y);
        if (k >= 0 && (g[k] === BOLT || elec[k] || (g[k] === THERMITE && dat[k]))) { boom(i, 12, 1.5); return; }
        break;
      }
      case PLASMA: {
        const life = dat[i] - 1;
        if (life <= 0) { g[i] = 0; dat[i] = 0; return; }
        dat[i] = life;
        for (let n = 0; n < 2; n++) {
          const k = rn8(x, y); if (k < 0) continue; const tk = g[k];
          if (FLAM[tk] > 0 && rnd() < .5) ignite(k);
          else if ((tk === ICE || tk === SNOW) && rnd() < .5) set(k, WATER, 0);
          else if (tk === WATER && rnd() < .3) set(k, STEAM);
          else if (tk === SAND) dat[k] = Math.min(255, dat[k] + 8);
          else if (tk === STONE || tk === CLAY) dat[k] = Math.min(255, dat[k] + 5);
          else if (tk === METAL) dat[k] = Math.min(255, dat[k] + 15);
          else if (tk === VIRUS) set(k, FIRE);
        }
        gas(x, y, i, .9);
        if (rnd() < .5) { const k = rn8(x, y); if (k >= 0 && g[k] === 0 && !mask[k]) swap(i, k); }
        break;
      }
      case LN2: {
        const k = rn8(x, y); let spent = false;
        if (k >= 0) {
          const tk = g[k];
          if (tk === WATER) { set(k, ICE, 0); spent = rnd() < .35; }
          else if (tk === LAVA) { set(k, STONE, 0); spent = rnd() < .4; }
          else if (tk === FIRE || tk === PLASMA) { g[k] = 0; dat[k] = 0; spent = rnd() < .2; }
          else if (tk === BURN) { set(k, WOOD, 0); spent = rnd() < .2; }
          else if (tk === STEAM) set(k, WATER, 0);
          else if (tk === OIL || tk === ACID || tk === SLIME || tk === HONEY || tk === MUD || tk === MERCURY || tk === NAPALM || tk === VIRUS || tk === WAXM || tk === CONCRETE) { set(k, ICE, 0); spent = rnd() < .3; }
          else if (tk === METAL || tk === SAND || tk === STONE || tk === CLAY) dat[k] = 0;
        }
        if (spent || rnd() < .0015) { set(i, STEAM); return; }
        liquid(x, y, i, t, 5); break;
      }
      case COPPER: if (dat[i] < 120) { const k = rn4(x, y); if (k >= 0 && g[k] === WATER && rnd() < .05) dat[i]++; } break;
      case WAX: {
        const k = rn8(x, y);
        if (k >= 0) { const tk = g[k]; if ((tk === FIRE || tk === LAVA || tk === BURN || tk === PLASMA || (tk === METAL && dat[k] > 110)) && rnd() < .2) set(i, WAXM, 0); }
        break;
      }
      case WAXM: {
        const k = rn8(x, y); let hot = false;
        if (k >= 0) {
          const tk = g[k];
          if (tk === FIRE || tk === LAVA || tk === BURN || tk === PLASMA || (tk === METAL && dat[k] > 110)) hot = true;
          else if ((tk === WATER || tk === ICE || tk === SNOW || tk === LN2) && rnd() < .3) { set(i, WAX, 0); return; }
        }
        if (!hot && rnd() < .003) { set(i, WAX, 0); return; }
        if (rnd() < .4) liquid(x, y, i, t, 2);
        break;
      }
      case CLOUD: {
        let n = dat[i];
        const k = rn8(x, y);
        if (k >= 0 && g[k] === STEAM) { set(k, 0, 0); n = Math.min(250, n + 25); }
        if (n > 0 && rnd() < .035) { const by = y + (gdir || 1), bj = by * W + x; if (by >= 0 && by < H && g[bj] === 0 && !mask[bj]) { set(bj, WATER, 0); n--; } }
        if (n <= 0 && rnd() < .05) { g[i] = 0; dat[i] = 0; return; }
        dat[i] = n;
        gas(x, y, i, .12); break;
      }
      case ANTI: {
        for (let n = 0; n < 3; n++) {
          const k = rn8(x, y); if (k < 0) continue; const tk = g[k];
          if (tk && tk !== ANTI && tk !== BOLT && !mask[k]) {
            g[k] = 0; dat[k] = 0; g[i] = 0; dat[i] = 0; stats.annihilated++;
            explode(x, y, 3, .7, true); shake = Math.max(shake, 2);
            return;
          }
        }
        powder(x, y, i, t, .8); break;
      }
      case VOID:
        for (let n = 0; n < 2; n++) { const k = rn8(x, y); if (k < 0) continue; const tk = g[k]; if (tk && tk !== VOID && tk !== CLONE && !mask[k] && rnd() < .7) { g[k] = 0; dat[k] = 0; } }
        break;
      case CRYSTAL: {
        const e = dat[i];
        if (e > 0 && rnd() < .08) {
          const k = rn8(x, y);
          if (k >= 0 && g[k] === 0 && !mask[k]) { set(k, CRYSTAL, e - 1); dat[i] = rnd() < .25 ? (e >> 1) : 0; }
          else if (k >= 0 && g[k] === SALT && rnd() < .5) { set(k, CRYSTAL, 0); dat[i] = Math.min(60, e + 6); }
        }
        break;
      }
      case FWORK: {
        if (--dat[i] <= 0 || y <= 1) { burstFirework(x, y); g[i] = 0; dat[i] = 0; return; }
        const j = i - W, tj = g[j];
        if ((tj === 0 || KIND[tj] === K_GAS || tj === FIRE) && !mask[j]) {
          swap(i, j);
          if (rnd() < .6) addP(x + .5, y + 1, (rnd() - .5) * .3, .4 + rnd() * .4, 0, 8 + rndi(8), pack(255, 200 + rndi(55), 80));
        } else { burstFirework(x, y); g[i] = 0; dat[i] = 0; }
        break;
      }
      case SAPLING: {
        if (rnd() > .18) break;
        const st = dat[i] & 63, br = dat[i] & 192, uy = gdir < 0 ? 1 : -1;
        const open = k => k >= 0 && !mask[k] && (g[k] === 0 || KIND[g[k]] === K_GAS);
        if (st <= 0) { set(i, WOOD, 0); leaves(x, y); break; }
        if (!br) {
          const ny = y + uy;
          if (ny < 0 || ny >= H) { set(i, WOOD, 0); leaves(x, y); break; }
          const u = ny * W + x;
          if (open(u)) {
            set(i, WOOD, 0); set(u, SAPLING, st - 1);
            if (st < 20 && (st & 3) === 0) { const sx = (st & 4) ? -1 : 1, sk = x + sx >= 0 && x + sx < W ? y * W + x + sx : -1; if (open(sk)) set(sk, SAPLING, (3 + rndi(5)) | (sx < 0 ? 64 : 128)); }
          } else { set(i, WOOD, 0); leaves(x, y); }
        } else {
          const sx = br === 64 ? -1 : 1, ny = y + (rnd() < .4 ? uy : 0), nx = x + sx;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) { set(i, WOOD, 0); leaves(x, y); break; }
          const k = ny * W + nx;
          if (open(k)) { set(i, WOOD, 0); set(k, SAPLING, ((st - 1) & 63) | br); } else { set(i, WOOD, 0); leaves(x, y); }
        }
        break;
      }
      default: break; // WOOD, GLASS, BRICK, GOLD, RUBBER, SPRING...: inert
    }
  }
  let fizz = false;
  function stepGrid() {
    fid = fid >= 255 ? 1 : fid + 1;
    for (let k = 0; k < frzList.length; k++) stamp[frzList[k]] = fid;
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
      if (--elec[i] <= 0 || !CLS[g[i]]) { elec[i] = 0; elecList[k] = elecList[elecList.length - 1]; elecList.pop(); }
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
        if (t === C4) { set(i, FIRE, 3 + rndi(5)); if (rnd() < .12 && boomQ.length < 240) boomQ.push(x, y, 6, 1); continue; }
        if (t === NITRO) { set(i, FIRE, 4 + rndi(6)); if (rnd() < .3 && boomQ.length < 240) boomQ.push(x, y, 5, .8); continue; }
        if (t === VOID) continue;
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
      if (isBomb(b)) b.fuse = Math.min(b.fuse, 4 + rndi(6));
      else hurtBody(b, k * 14);
    }
    for (const c of creatures) {
      const dx = c.x - cx, dy = c.y - 3 - cy, d = Math.hypot(dx, dy) + .5;
      if (d > reach) continue;
      const k = (1 - d / reach) * (1 + r * .15);
      c.vx += dx / d * k; c.vy += dy / d * k - k * .4;
      if (d < r * 1.3 && c.st === 'ok') kill(c, 'blown up', true);
    }
    for (const rg of ragdolls) for (const p of rg.p) {
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) + .5; if (d > reach) continue;
      const k = (1 - d / reach) * (1.6 + r * .12); p.ox -= dx / d * k; p.oy -= dy / d * k + k * .3; rg.hp -= k * 2;
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
      if (CLS[t]) electrify(hit, t);
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
    const q = [start]; let n = 0; const cls = CLS[t];
    elec[start] = 1;
    while (q.length && n < 5000) {
      const i = q.pop(); n++;
      elec[i] = g[i] === COPPER ? 60 : 28; elecList.push(i);
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const j = nbr(x, y, k); if (j < 0) continue;
        if (CLS[g[j]] === cls && !elec[j]) { elec[j] = 1; q.push(j); }
        else if (FLAM[g[j]] > 0 && rnd() < .35) ignite(j);
        else if (cls === 1 && g[j] === WATER && rnd() < .2) set(j, STEAM);
      }
      if (g[i] === METAL && dat[i] < 200) dat[i] += 40;
    }
  }

  // ---------- rigid bodies ----------
  function makeBody(kind, x, y) {
    const b = { kind, x, y, vx: 0, vy: 0, hp: 100, burn: 0, fuse: kind === 'bomb' ? 200 : kind === 'barrel' ? 1e9 : 0, grabbed: false, col: rndi(4), dir: rnd() < .5 ? -1 : 1, rect: false };
    if (kind === 'box') { b.rect = true; b.w = 9; b.h = 9; b.dens = .55; b.bounce = .15; }
    else if (kind === 'ball') { b.r = 3.6; b.w = b.h = 8; b.dens = .7; b.bounce = .72; }
    else if (kind === 'car') { b.rect = true; b.w = 13; b.h = 7; b.dens = .9; b.bounce = .1; }
    else if (kind === 'barrel') { b.rect = true; b.w = 7; b.h = 9; b.dens = .6; b.bounce = .2; }
    else if (kind === 'balloon') { b.r = 3.6; b.w = b.h = 8; b.dens = .5; b.bounce = .5; b.hp = 12; }
    else if (kind === 'rocket') { b.rect = true; b.w = 3; b.h = 8; b.dens = 1; b.bounce = 0; b.fuel = 110; b.coast = 0; b.hit = false; }
    else { b.r = 3.2; b.w = b.h = 7; b.dens = 2.2; b.bounce = .3; }
    for (let k = 0; k < 40 && bodyHits(b, b.x, b.y); k++) b.y -= gdir >= 0 ? 1 : -1;
    if (bodyHits(b, b.x, b.y)) return null;
    bodies.push(b);
    return b;
  }
  function eachCell(b, x, y, fn) { // calls fn(cx, cy) for every cell the body covers at (x, y)
    const x0 = Math.floor(x - b.w / 2), y0 = Math.floor(y - b.h / 2);
    if (b.rect) { for (let yy = y0; yy < y0 + b.h; yy++) for (let xx = x0; xx < x0 + b.w; xx++) if (fn(xx, yy)) return true; return false; }
    const r2 = b.r * b.r;
    for (let yy = y0; yy < y0 + b.h; yy++) for (let xx = x0; xx < x0 + b.w; xx++) { const dx = xx + .5 - x, dy = yy + .5 - y; if (dx * dx + dy * dy <= r2 && fn(xx, yy)) return true; }
    return false;
  }
  function bodyHits(b, x, y) {
    return eachCell(b, x, y, (cx, cy) => {
      if (cy < 0 || cy >= H) return true;
      if (cx < 0 || cx >= W) { if (!wrap) return true; cx = (cx + W) % W; }
      const k = KIND[g[cy * W + cx]];
      return k === K_SOLID || k === K_POWDER;
    });
  }
  const isBomb = b => b.kind === 'bomb' || b.kind === 'barrel';
  function hurtBody(b, amt) {
    if (b.kind === 'ball') return;
    if (isBomb(b)) { b.fuse = Math.min(b.fuse, 3); return; }
    b.hp -= amt;
  }
  function popBalloon(b) {
    const cols = [[240, 80, 130], [80, 170, 250], [250, 200, 60], [120, 220, 140]];
    for (let k = 0; k < 26; k++) { const c = cols[rndi(4)], a = rnd() * 6.283, s = .4 + rnd() * 1.4; addP(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s, 0, 20 + rndi(24), pack(c[0], c[1], c[2])); }
    removeBody(b); sfx('pop');
  }
  function surfAt(b, sgn) { // spring or rubber directly under (sgn > 0) or over the body
    const y = Math.floor(b.y + sgn * (b.h / 2 + .6)); if (y < 0 || y >= H) return 0;
    for (let dx = -1; dx <= 1; dx++) { const x = Math.floor(b.x) + dx; if (x < 0 || x >= W) continue; const t = g[y * W + x]; if (t === SPRING || t === RUBBER) return t; }
    return 0;
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
        if (t === FIRE || t === BURN || t === LAVA || t === PLASMA) { if (isBomb(b)) b.fuse = Math.min(b.fuse, 25); else if (b.kind === 'balloon') b.hp = 0; else if (b.kind === 'box') b.burn = Math.max(b.burn, 1); else if (t === LAVA) { shatterBody(b, SMOKE, false); break; } }
        else if (t === ACID) { b.hp -= 4; if (rnd() < .3) set(i, SMOKE); }
        else if (t === VIRUS) { stats.infected++; shatterBody(b, VIRUS, true); break; }
        else if (t === WATER && b.burn) b.burn = 0;
        if (elec[i] && isBomb(b)) b.fuse = Math.min(b.fuse, 3);
      }
      if (bodies[n] !== b) continue;
      if (frzList.length) { const fi = (b.y | 0) * W + (b.x | 0); if (b.y >= 0 && b.y < H && b.x >= 0 && b.x < W && frz[fi]) continue; }
      if (b.burn) {
        b.hp -= .35; b.burn++;
        if (rnd() < .5) { const a = rnd() * 6.283, rx = Math.round(b.x + Math.cos(a) * (b.w / 2 + 1)), ry = Math.round(b.y + Math.sin(a) * (b.h / 2 + 1)); if (rx >= 0 && ry >= 0 && rx < W && ry < H && g[ry * W + rx] === 0) set(ry * W + rx, FIRE, 10 + rndi(15)); }
      }
      if (b.hp <= 0) {
        if (b.kind === 'balloon') popBalloon(b);
        else if (b.kind === 'rocket') { removeBody(b); explode(b.x, b.y, 9, 1); }
        else if (b.burn) shatterBody(b, BURN, true); else shatterBody(b, b.kind === 'car' ? METAL : WOOD, false);
        continue;
      }
      if (isBomb(b) && --b.fuse <= 0) { removeBody(b); explode(b.x, b.y, b.kind === 'barrel' ? 17 : 13, b.kind === 'barrel' ? 1.4 : 1.2); continue; }
      // forces
      if (!b.grabbed) {
        if (b.kind === 'balloon') { b.vy -= G * .85; b.vx *= .985; b.vy *= .985; }
        else b.vy += G * (1 - frac / b.dens);
        if (frac > 0) { b.vx *= 1 - .08 * frac; b.vy *= 1 - .08 * frac; }
        if (b.kind === 'car') {
          if (b.gr) b.vx = clamp(b.vx + b.dir * .04, -1.15, 1.15);
          b.stuck = Math.abs(b.vx) < .1 ? (b.stuck || 0) + 1 : 0;
          if (b.stuck > 30) { b.dir = -b.dir; b.stuck = 0; b.vx = b.dir * .4; }
        } else if (b.kind === 'rocket') {
          if (b.fuel > 0) {
            b.fuel--; b.vy -= .2; b.vy *= .97; b.vx += (rnd() - .5) * .02;
            addP(b.x, b.y + b.h / 2 + .5, (rnd() - .5) * .5, 1 + rnd(), 0, 10 + rndi(8), firePal[30 + rndi(30)]);
            if (rnd() < .25) { const ty = Math.round(b.y + b.h / 2 + 2), tx = Math.round(b.x); if (ty < H && tx >= 0 && tx < W && g[ty * W + tx] === 0) set(ty * W + tx, SMOKE, 30 + rndi(30)); }
          } else if (++b.coast > 70) { removeBody(b); explode(b.x, b.y, 9, 1); continue; }
        }
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
        else { if (b.kind === 'rocket' && Math.abs(b.vx) > .05) b.hit = true; b.vx = -b.vx * b.bounce; if (Math.abs(b.vx) < .05) b.vx = 0; }
        const ny = b.y + b.vy / steps;
        if (!bodyHits(b, b.x, ny)) b.y = ny;
        else {
          if (b.kind === 'rocket') b.hit = true;
          if (Math.sign(b.vy) === Math.sign(gdir)) grounded = true;
          const st = surfAt(b, Math.sign(b.vy) || 1);
          if (st === SPRING && Math.abs(b.vy) > .05) b.vy = -Math.sign(b.vy) * Math.max(3.6, Math.abs(b.vy) * 1.5);
          else if (st === RUBBER) b.vy = Math.abs(b.vy) > .35 ? -b.vy * Math.max(.96, b.bounce) : 0;
          else {
            if (Math.abs(b.vy) > 2.5) hurtBody(b, (Math.abs(b.vy) - 2.5) * 10);
            b.vy = Math.abs(b.vy) > .35 ? -b.vy * b.bounce : 0;
          }
        }
      }
      b.gr = grounded;
      if (b.kind === 'rocket' && b.hit && b.fuel < 105) { removeBody(b); explode(b.x, b.y, 9, 1); continue; }
      if (wrap) { if (b.x < 0) b.x += W; else if (b.x >= W) b.x -= W; }
      if (grounded) b.vx *= b.kind === 'ball' ? .995 : b.kind === 'car' ? .97 : .85;
      if (bodyHits(b, b.x, b.y)) b.y -= gdir >= 0 ? .5 : -.5; // unstick
      // landing on creatures
      if (b.kind === 'car' && Math.abs(b.vx) > .45) for (const c of creatures) if (c.st === 'ok' && Math.abs(c.x - b.x) < b.w / 2 + 1 && Math.abs(c.y - c.h / 2 - b.y) < b.h / 2 + 3) { kill(c, 'run over', true); c.vy -= 1; c.vx += b.vx; }
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
  function stampMask(dec) {
    mask.fill(0);
    for (const f of fans) for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) { const x = f.x + dx, y = f.y + dy; if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; }
    for (let k = frzList.length - 1; k >= 0; k--) {
      const i = frzList[k];
      if (dec && --frz[i] <= 0) { frz[i] = 0; frzList[k] = frzList[frzList.length - 1]; frzList.pop(); continue; }
      mask[i] = 1;
    }
    for (const b of bodies) eachCell(b, b.x, b.y, (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H) mask[cy * W + cx] = 1; });
    for (const t of turrets) for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) { const x = (t.x | 0) + dx, y = (t.y | 0) + dy; if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; }
  }

  // ---------- creatures ----------
  const SHIRTS = [[230, 80, 80], [80, 150, 240], [250, 200, 60], [120, 210, 120], [240, 140, 40], [200, 110, 230], [240, 240, 240]];
  const SHELLS = [[60, 160, 90], [200, 70, 60], [70, 110, 200], [220, 170, 40]];
  const BIRDC = [[240, 240, 250], [90, 150, 230], [240, 90, 80], [250, 200, 60]], FISHC = [[250, 140, 50], [80, 170, 250], [250, 90, 120], [240, 220, 90]];
  function makeCreature(kind, x, y) {
    if (creatures.length >= 160) return null;
    const h0 = kind === 'walker' || kind === 'robot' ? 8 : kind === 'bird' || kind === 'fish' ? 1 : 2;
    const c = { kind, x: x + .5, y: y + .5, vx: 0, vy: 0, dir: rnd() < .5 ? -1 : 1, st: 'ok', h: h0, h0,
      burn: 0, inf: 0, zombie: false, frozen: 0, breath: 240, hp: 100, deadT: 0, cause: '', grabbed: false, step: 0, t: 0, cool: 40, tiny: false,
      col: kind === 'walker' ? SHIRTS[rndi(SHIRTS.length)] : kind === 'bird' ? BIRDC[rndi(4)] : kind === 'fish' ? FISHC[rndi(4)] : kind === 'ant' ? [58, 38, 30] : kind === 'robot' ? [150, 160, 176] : SHELLS[rndi(SHELLS.length)] };
    if (kind === 'bird') c.alt = y;
    creatures.push(c); stats.spawned++;
    return c;
  }
  function solidAt(x, y) {
    if (y < 0 || y >= H) return true;
    if (x < 0 || x >= W) { if (!wrap) return true; x = (x + W) % W; }
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
  function infect(c) { if (c.inf || c.st !== 'ok' || c.kind === 'robot') return; c.inf = 1; stats.infected++; }
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
    let y = c.y, hitV = false, hitRow = -1;
    for (let k = 0; k < n; k++) {
      const ty = y + vy / n, fyOld = Math.floor(y), fyNew = Math.floor(ty);
      if (fyNew !== fyOld) {
        const movingWithG = Math.sign(fyNew - fyOld) === s;
        const checkY = movingWithG ? fyNew : fyNew - (c.h - 1) * s;
        if (solidAt(fx, checkY)) { hitV = true; if (movingWithG) hitRow = checkY; break; }
      }
      y = ty;
    }
    if (hitV) {
      const st = hitRow >= 0 && hitRow < H && fx >= 0 && fx < W ? g[hitRow * W + fx] : 0;
      if (st === SPRING) { c.vy = -3.4 * s; c.y = Math.floor(y) + .5; }
      else if (st === RUBBER && Math.abs(c.vy) > .8) { c.vy = -c.vy * .7; c.y = Math.floor(y) + .5; }
      else { if (Math.abs(c.vy) > 3.1 && c.st === 'ok' && !c.frozen) kill(c, 'splat', false); c.vy = 0; c.y = Math.floor(y) + .5; }
    }
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
    if (wrap) { if (c.x < 0) c.x += W; else if (c.x >= W) c.x -= W; }
  }
  // birds cruise at a set altitude, flapping, and turn away from walls and the ground
  function stepBird(c, fx, fy) {
    c.t++;
    if (rnd() < .006) c.dir = -c.dir;
    if (solidAt(fx + c.dir * 3, fy) || solidAt(fx + c.dir * 3, fy - 1)) { c.dir = -c.dir; c.vy = -.5; }
    let vy = Math.sin(c.t * .22) * .16 + (c.alt - c.y) * .012;
    if (solidAt(fx, fy + 3)) vy -= .35;
    if (solidAt(fx, fy - 3)) vy += .3;
    if (KIND[g[fy * W + fx]] === K_LIQ) vy -= .3;
    c.vy = clamp(vy, -.7, .7); c.vx = c.dir * .42;
    if (rnd() < .01) c.alt = clamp(c.alt + (rnd() - .5) * 18, 6, H - 12);
  }
  // fish swim in water, turn at walls and the surface
  function stepFish(c, fx, fy) {
    c.t++;
    if (rnd() < .012) c.dir = -c.dir;
    const ax = fx + c.dir * 2;
    if (ax < 1 || ax >= W - 1 || g[fy * W + ax] !== WATER || solidAt(ax, fy)) c.dir = -c.dir;
    let vy = Math.sin(c.t * .13) * .07;
    if (fy > 0 && g[(fy - 1) * W + fx] !== WATER) vy += .12;
    if (fy + 1 < H && g[(fy + 1) * W + fx] !== WATER) vy -= .06;
    c.vy = vy; c.vx = c.dir * .24;
  }
  function stepCreatures() {
    const s = gdir < 0 ? -1 : 1;
    for (let n = creatures.length - 1; n >= 0; n--) {
      const c = creatures[n];
      if (wrap) c.x = ((c.x % W) + W) % W;
      const fx = Math.floor(c.x), fy = Math.floor(c.y);
      if (fx < 0 || fx >= W || fy < -2 || fy > H + 2) { removeCreature(c); continue; }
      if (frzList.length && fy >= 0 && fy < H && frz[fy * W + fx]) continue;
      const alive = c.st === 'ok';
      c.grounded = gdir !== 0 && solidAt(fx, fy + s);
      if (c.grounded && fy + s >= 0 && fy + s < H && g[(fy + s) * W + fx] === SPRING) { c.vy = -3.4 * s; c.grounded = false; }
      // senses: feet, middle, head
      const at = h => { const y = fy - h * s; return (y < 0 || y >= H) ? -1 : y * W + fx; };
      const iF = at(0), iM = at(c.h >> 1), iH = at(c.h - 1);
      const tF = iF >= 0 ? g[iF] : 0, tM = iM >= 0 ? g[iM] : 0, tH = iH >= 0 ? g[iH] : 0;
      const inLiq = KIND[tF] === K_LIQ || KIND[tM] === K_LIQ;
      if (alive) {
        for (const [t, i] of [[tF, iF], [tM, iM], [tH, iH]]) {
          if (i < 0) continue;
          if (t === FIRE || t === BURN || t === LAVA || t === PLASMA || (t === THERMITE && dat[i])) {
            if (c.kind === 'robot') c.hp -= t === LAVA ? 5 : .5; else { c.burn = c.burn || 1; c.frozen = 0; if (t === LAVA) c.hp -= 5; }
          }
          else if (t === LN2) { c.frozen = Math.max(c.frozen, 420); c.burn = 0; }
          else if (t === MERCURY) c.hp -= .3;
          else if (t === VOID) { c.gone = true; stats.lost++; stats.deaths.push('voided'); }
          else if (t === ACID) { c.hp -= 3; if (rnd() < .2) set(i, SMOKE); }
          else if (t === VIRUS || t === SLIME && rnd() < .02) infect(c);
          else if (t === BOLT) kill(c, 'zapped', true);
          if (elec[i]) kill(c, 'zapped', true);
          // standing on electrified metal
        }
        const below = fy + s; if (below >= 0 && below < H && elec[below * W + fx]) kill(c, 'zapped', true);
        if (c.kind === 'robot') { /* sealed: no breathing */ }
        else if (c.kind === 'fish') {
          if (tF !== WATER) { if ((c.breath -= 3) <= 0) kill(c, 'suffocated', false); }
          else c.breath = Math.min(240, c.breath + 3);
        } else if (c.kind === 'walker') {
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
        if (c.kind === 'robot' && c.st === 'ok') {
          if (c.cool > 0) c.cool--;
          else {
            let tgt = null, bd = 70;
            for (const o of creatures) if (o.st === 'ok' && o.kind !== 'robot') { const dx = o.x - c.x, dy = (o.y - o.h / 2) - (c.y - 5 * s); if (Math.abs(dy) < 14 && Math.abs(dx) < bd) { bd = Math.abs(dx); tgt = o; } }
            if (tgt) {
              const sx = c.x + (tgt.x > c.x ? 2 : -2), sy = c.y - 5 * s, dx = tgt.x - sx, dy = (tgt.y - tgt.h / 2) - sy, d = Math.hypot(dx, dy) || 1;
              bullets.push({ x: sx, y: sy, vx: dx / d * 3.2, vy: dy / d * 3.2, e: 9, life: 100, team: 'r', own: c });
              c.dir = tgt.x > c.x ? 1 : -1; c.cool = 55 + rndi(30); stats.shots++; sfx('pew');
            } else c.cool = 12;
          }
        }
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
      if (alive && !c.frozen && c.kind === 'bird') { stepBird(c, fx, fy); moveCreature(c, 1); continue; }
      if (alive && !c.frozen && c.kind === 'fish' && tF === WATER) { stepFish(c, fx, fy); moveCreature(c, s); continue; }
      if (alive && c.grounded && !c.frozen) {
        const spd = c.kind === 'walker' ? (c.burn ? .42 : c.zombie ? .12 : .16) : c.kind === 'robot' ? .13 : c.kind === 'ant' ? .11 : .2;
        // look ahead for hazards
        if (!c.burn && rnd() < .3) {
          const ax = fx + c.dir * 2;
          if (ax >= 0 && ax < W) { const t1 = g[fy * W + ax], y2 = fy - s; const t2 = y2 >= 0 && y2 < H ? g[y2 * W + ax] : 0; if (t1 === FIRE || t1 === LAVA || t1 === ACID || t1 === BURN || t2 === FIRE || t2 === BURN || t2 === LAVA) c.dir = -c.dir; }
        }
        if (rnd() < .002) c.dir = -c.dir;
        c.vx = c.dir * spd;
        if (c.kind === 'fish') { c.vx *= .3; if (rnd() < .06) { c.vy = -.9 * s; c.vx = (rnd() - .5) * .8; } }
        if (c.kind === 'ant') {
          const ax = fx + c.dir;
          if (ax >= 0 && ax < W) {
            for (let h = 0; h < 2; h++) { const yy = fy - h * s; if (yy < 0 || yy >= H) continue; const k = yy * W + ax; if (SOFT[g[k]] && !mask[k] && rnd() < .2) { g[k] = 0; dat[k] = 0; } }
            const dyy = fy + s; if (dyy >= 0 && dyy < H && rnd() < .04) { const k = dyy * W + ax; if (SOFT[g[k]] && !mask[k]) { g[k] = 0; dat[k] = 0; } }
          }
          if (rnd() < .03) { const dyy = fy + s; if (dyy >= 0 && dyy < H) { const k = dyy * W + fx; if (SOFT[g[k]] && !mask[k]) { g[k] = 0; dat[k] = 0; } } }
        }
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
    if (c.kind === 'bird') {
      const bc = pack(c.col[0], c.col[1], c.col[2]), up = (frame >> 2) & 1;
      if (c.st !== 'ok') { P(-1, 0, mix(bc, dark, .5)); P(0, 0, mix(bc, dark, .5)); P(1, 0, mix(bc, dark, .5)); return; }
      P(0, 0, bc); P(d, 0, pack(250, 170, 40)); P(-d, 0, mix(bc, dark, .3));
      P(-1, up ? -1 : 1, mix(bc, WHITE, .2)); P(1, up ? -1 : 1, mix(bc, WHITE, .2));
      if (up) { P(-2, -2, bc); P(2, -2, bc); }
      return;
    }
    if (c.kind === 'fish') {
      const fc = pack(c.col[0], c.col[1], c.col[2]);
      if (c.st !== 'ok') { P(-1, 0, mix(fc, dark, .6)); P(0, 0, mix(fc, dark, .6)); P(1, 0, mix(fc, WHITE, .3)); return; }
      const wag = ((c.t >> 3) & 1) ? -1 : 1;
      P(0, 0, fc); P(d, 0, mix(fc, WHITE, .25)); P(2 * d, 0, mix(fc, dark, .25)); P(-d, 0, fc); P(-2 * d, wag, mix(fc, dark, .2)); P(-2 * d, 0, mix(fc, dark, .2));
      P(d, -1, dark);
      return;
    }
    if (c.kind === 'ant') {
      const ac = pack(c.col[0], c.col[1], c.col[2]);
      if (c.st !== 'ok') { P(-1, 0, ac); P(0, 0, ac); P(1, 0, ac); return; }
      P(-d, -1, ac); P(0, -1, ac); P(d, -1, ac); P(2 * d, -1, mix(ac, WHITE, .2));
      if (((c.step * 3) | 0) & 1) { P(-d, 0, dark); P(d, 0, dark); } else { P(0, 0, dark); P(2 * d, 0, dark); }
      return;
    }
    if (c.kind === 'robot') {
      const mt = c.st === 'ok' ? pack(150, 160, 176) : pack(86, 90, 100), dk = pack(70, 76, 90), eye = c.st === 'ok' ? (((frame >> 3) & 1) ? pack(255, 70, 60) : pack(255, 150, 90)) : pack(60, 50, 50);
      if (c.st !== 'ok') { for (let k = -2; k <= 2; k++) P(k, 0, mt); P(3, 0, dk); P(3, -1, mt); return; }
      if (c.tiny) { P(0, -2, mt); P(0, -1, dk); P(0, 0, mt); return; }
      P(-1, -7, mt); P(0, -7, mt); P(1, -7, mt); P(-1, -6, mt); P(0, -6, mt); P(1, -6, mt); P(d, -6, eye); P(0, -8, dk);
      P(-1, -5, dk); P(0, -5, mt); P(1, -5, dk); P(-1, -4, mt); P(0, -4, mt); P(1, -4, mt); P(-1, -3, mt); P(0, -3, dk); P(1, -3, mt);
      P(d * 2, -4, mt); P(d * 2 + d, -4, dk);
      const wk = ((c.step * 1.6) | 0) & 1;
      if (wk) { P(-1, -2, dk); P(-1, -1, dk); P(-1, 0, mt); P(1, -2, dk); P(1, -1, dk); P(1, 0, mt); } else { P(0, -2, dk); P(0, -1, dk); P(0, 0, mt); }
      return;
    }
    if (c.tiny && c.kind === 'walker') {
      if (c.st !== 'ok') { P(-1, 0, shirt); P(0, 0, shirt); P(1, 0, skin); return; }
      P(0, -2, skin); P(0, -1, shirt); P(0, 0, pants);
      if (c.burn) P(rndi(3) - 1, -3, firePal[30 + rndi(34)]);
      return;
    }
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
  HARD[BRICK] = 3; HARD[CONCSET] = 4; HARD[GOLD] = 4; HARD[COPPER] = 4; HARD[RUBBER] = 2; HARD[VOID] = 99; HARD[MUD] = 1; HARD[CRYSTAL] = 2;
  for (const t of [MERCURY, NITRO, NAPALM, HONEY, LN2, WAXM, CONCRETE]) HARD[t] = .5;
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
        for (const c of creatures) if (b.own !== c && !(b.team === 'r' && c.kind === 'robot') && Math.abs(c.x - b.x) < 1.5 && (b.y - c.y) * (gdir < 0 ? -1 : 1) < 1 && (c.y - b.y) * (gdir < 0 ? -1 : 1) < c.h) {
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

  // ---------- ragdolls ----------
  const RAG_P = [[0, -7], [0, -5], [0, -2], [-3, -4], [3, -4], [-1, 1], [1, 1]];
  const RAG_L = [[0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [2, 6], [0, 2], [5, 6], [1, 5], [1, 6]];
  function makeRag(x, y) {
    let by = y | 0;
    for (let k = 0; k < 24; k++, by--) {
      let clear = true;
      for (const [dx, dy] of RAG_P) if (solidAt((x | 0) + dx, by + dy)) { clear = false; break; }
      if (clear) break;
      if (k === 23) return null;
    }
    if (ragdolls.length >= 10) ragdolls.shift();
    const rg = { p: RAG_P.map(([dx, dy]) => ({ x: (x | 0) + dx + .5, y: by + dy + .5, ox: (x | 0) + dx + .5, oy: by + dy + .5, held: false })), L: [], hp: 100, burn: 0, col: SHIRTS[rndi(SHIRTS.length)] };
    for (const [a, b] of RAG_L) rg.L.push(Math.hypot(RAG_P[a][0] - RAG_P[b][0], RAG_P[a][1] - RAG_P[b][1]));
    ragdolls.push(rg);
    return rg;
  }
  function ragMove(p, dx, dy) { if (p.held) return; const nx = p.x + dx, ny = p.y + dy; if (!solidAt(nx | 0, ny | 0)) { p.x = nx; p.y = ny; } }
  function stepRagdolls() {
    const G = .1 * gdir;
    for (let n = ragdolls.length - 1; n >= 0; n--) {
      const rg = ragdolls[n];
      if (frzList.length) { const c = rg.p[1], fi = (c.y | 0) * W + (c.x | 0); if (c.y >= 0 && c.y < H && c.x >= 0 && c.x < W && frz[fi]) continue; }
      for (const p of rg.p) {
        if (p.held) { p.ox = p.x; p.oy = p.y; continue; }
        let vx = (p.x - p.ox) * .992, vy = (p.y - p.oy) * .992;
        const ix = p.x | 0, iy = p.y | 0, cell = ix >= 0 && iy >= 0 && ix < W && iy < H ? g[iy * W + ix] : 0;
        if (KIND[cell] === K_LIQ) { vy += G * .25; vx *= .9; vy *= .9; } else vy += G;
        for (const w of wells) { const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy) + 1; if (d < 60) { vx += dx / d * 4 / (d + 6); vy += dy / d * 4 / (d + 6); } if (d < 4) rg.hp = 0; }
        let nx = p.x + vx, ny = p.y + vy;
        if (solidAt(nx | 0, ny | 0)) {
          if (!solidAt(nx | 0, p.y | 0)) { ny = p.y; vy = -vy * .1; vx *= .85; }
          else if (!solidAt(p.x | 0, ny | 0)) { nx = p.x; vx = -vx * .2; }
          else { nx = p.x; ny = p.y; vx *= .5; vy *= .5; }
        }
        p.ox = nx - vx; p.oy = ny - vy; p.x = nx; p.y = ny;
      }
      for (let it = 0; it < 4; it++) for (let k = 0; k < RAG_L.length; k++) {
        const A = rg.p[RAG_L[k][0]], B = rg.p[RAG_L[k][1]];
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || .001, corr = (d - rg.L[k]) / d;
        const wa = A.held ? 0 : B.held ? 1 : .5, wb = B.held ? 0 : A.held ? 1 : .5;
        ragMove(A, dx * corr * wa, dy * corr * wa); ragMove(B, -dx * corr * wb, -dy * corr * wb);
      }
      const ch = rg.p[1], ci = (ch.y | 0) * W + (ch.x | 0), ct = ch.y >= 0 && ch.y < H && ch.x >= 0 && ch.x < W ? g[ci] : 0;
      if (ct === FIRE || ct === BURN || ct === LAVA || ct === PLASMA) rg.burn = Math.max(rg.burn, 1);
      else if (ct === WATER) rg.burn = 0;
      else if (ct === ACID) rg.hp -= 1;
      else if (ct === VOID) rg.hp = 0;
      if (rg.burn) { rg.burn++; rg.hp -= .3; if (rnd() < .25) { const fy = (rg.p[0].y | 0) - 2, fx = rg.p[0].x | 0; if (fy >= 0 && fy < H && fx >= 0 && fx < W && g[fy * W + fx] === 0) set(fy * W + fx, FIRE, 8 + rndi(10)); } }
      if (rg.hp <= 0) {
        drawRag(rg, (x, y, col) => addP(x + .5, y + .5, (rnd() - .5) * .8, -.2 - rnd() * .7, rg.burn ? DUST : 0, rg.burn ? -1 : 24 + rndi(24), col));
        if (grab && grab.o === rg) grab = null;
        ragdolls.splice(n, 1);
      }
    }
  }
  function drawRag(rg, plot) {
    const q = rg.p, skin = pack(238, 196, 158), sh = pack(rg.col[0], rg.col[1], rg.col[2]), pt = pack(52, 62, 112), dk = pack(30, 30, 36);
    const ln = (a, b, col) => { const dx = b.x - a.x, dy = b.y - a.y, m = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))); for (let k = 0; k <= m; k++) plot(a.x + dx * k / m, a.y + dy * k / m, col); };
    ln(q[0], q[1], skin); ln(q[1], q[2], sh); ln(q[1], q[3], skin); ln(q[1], q[4], skin); ln(q[2], q[5], pt); ln(q[2], q[6], pt);
    const h = q[0]; plot(h.x, h.y, skin); plot(h.x - 1, h.y, skin); plot(h.x + 1, h.y, skin); plot(h.x, h.y - 1, skin); plot(h.x, h.y + 1, skin);
    plot(q[5].x, q[5].y, dk); plot(q[6].x, q[6].y, dk);
    if (rg.burn) for (let k = 0; k < 3; k++) plot(h.x + rndi(3) - 1, h.y - 2 - rndi(2), firePal[30 + rndi(34)]);
  }

  // ---------- fans ----------
  const FDX = [1, 0, -1, 0], FDY = [0, -1, 0, 1];
  function placeFan() {
    const x = clamp(ptr.x | 0, 2, W - 3), y = clamp(ptr.y | 0, 3, H - 1);
    for (const f of fans) if (Math.abs(f.x - x) < 3 && Math.abs(f.y - 1 - y) < 4) { f.dir = (f.dir + 1) & 3; return f; }
    if (fans.length >= 10) fans.shift();
    const f = { x, y, dir: x < W / 2 ? 0 : 2 }; fans.push(f); return f;
  }
  function stepFans() {
    for (const f of fans) {
      const dx = FDX[f.dir], dy = FDY[f.dir], ox = f.x, oy = f.y - 1;
      let L = 0;
      for (; L < 36; L++) { const x = Math.floor(ox + dx * (3 + L)), y = Math.floor(oy + dy * (3 + L)); if (x < 0 || y < 0 || x >= W || y >= H) break; const t = g[y * W + x]; if (t && KIND[t] === K_SOLID) break; }
      if (L < 3) continue;
      f.reach = L;
      for (let k = 0; k < 34; k++) {
        const d = 2 + rnd() * (L - 1), lat = (rnd() - .5) * (2 + d * .35);
        const x = Math.floor(ox + dx * (3 + d) - dy * lat), y = Math.floor(oy + dy * (3 + d) + dx * lat);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x, t = g[i]; if (!t || !movable(t) || mask[i]) continue;
        const sp = 1.7 * (1 - d / (L + 6)) + .3;
        launch(i, dx * sp + (rnd() - .5) * .3, dy * sp + (rnd() - .5) * .3);
      }
      const cone = (px, py) => { const rx = px - ox, ry = py - oy, along = rx * dx + ry * dy; if (along < 2 || along > L + 3) return 0; return Math.abs(-rx * dy + ry * dx) < 2 + along * .35 ? 1 - along / (L + 6) : 0; };
      for (const b of bodies) { const w = cone(b.x, b.y); if (w) { b.vx += dx * .2 * w; b.vy += dy * .2 * w; } }
      for (const c of creatures) { const w = cone(c.x, c.y - c.h / 2); if (w) { c.vx += dx * .12 * w; c.vy += dy * .18 * w; if (dy < 0) c.grounded = false; } }
      for (const rg of ragdolls) for (const p of rg.p) { const w = cone(p.x, p.y); if (w) { p.ox -= dx * .2 * w; p.oy -= dy * .2 * w; } }
      for (let p = 0; p < pn; p++) { const w = cone(PX[p], PY[p]); if (w) { PVX[p] += dx * .25 * w; PVY[p] += dy * .25 * w; } }
      if (rnd() < .5) addP(ox + dx * 3 + (rnd() - .5) * 3, oy + dy * 3 + (rnd() - .5) * 3, dx * 2.2, dy * 2.2, 0, 10, pack(180, 230, 240));
    }
  }
  function drawFan(f) {
    const x = f.x, y = f.y, base = pack(96, 106, 124), dark = pack(54, 60, 74), blade = pack(210, 220, 235);
    for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) put(x + dx, y + dy, (dx === 0 && dy === -1) ? dark : base);
    const ph = (frame >> 1) & 3, ux = FDX[f.dir], uy = FDY[f.dir];
    put(x, y - 1, blade);
    if (ph & 1) { put(x - uy, y - 1 + ux, blade); put(x + uy, y - 1 - ux, blade); } else { put(x - 1, y - 1, blade); put(x + 1, y - 1, blade); put(x, y - 2, blade); put(x, y, blade); }
    put(x + ux * 2, y - 1 + uy * 2, pack(150, 210, 230));
  }

  // ---------- portals ----------
  const PD = []; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) PD.push([dx, dy]);
  function placePortal() {
    const k = portalNext; portalNext ^= 1;
    const idx = portals.findIndex(q => q.k === k); if (idx >= 0) portals.splice(idx, 1);
    portals.push({ x: clamp(ptr.x, 4, W - 5), y: clamp(ptr.y, 4, H - 5), k, t: 0 });
    sfx('hole');
  }
  function stepPortals() {
    const A = portals.find(q => q.k === 0), B = portals.find(q => q.k === 1);
    for (const q of portals) q.t++;
    if (!A || !B) return;
    for (let pi = 0; pi < 2; pi++) {
      const S = pi ? B : A, D = pi ? A : B; let moved = 0;
      for (const [dx, dy] of PD) {
        const x = (S.x | 0) + dx, y = (S.y | 0) + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x, t = g[i]; if (!t || !movable(t) || mask[i] || rnd() > .5) continue;
        const a = rnd() * 6.283, rr = 4.5 + rnd() * 1.5, ex = (D.x + Math.cos(a) * rr) | 0, ey = (D.y + Math.sin(a) * rr) | 0;
        if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
        const j = ey * W + ex; if (g[j] !== 0 || mask[j]) continue;
        g[j] = t; dat[j] = dat[i]; shd[j] = shd[i]; tint[j] = tint[i]; stamp[j] = fid; g[i] = 0; dat[i] = 0;
        if (++moved >= 10) break;
      }
      const tele = (o, ox, oy, lift) => {
        if (o.pcd > 0) { o.pcd--; return; }
        if (Math.hypot(ox - S.x, oy - S.y) < 3.3) { o.x = D.x; o.y = D.y + lift; o.pcd = 45; }
      };
      for (const c of creatures) tele(c, c.x, c.y - c.h / 2, c.h / 2);
      for (const b of bodies) tele(b, b.x, b.y, 0);
      for (let p = 0; p < pn; p++) {
        if (Math.hypot(PX[p] - S.x, PY[p] - S.y) < 3.3) {
          let vx = PVX[p], vy = PVY[p]; const sp = Math.hypot(vx, vy);
          if (sp < .05) { const a = rnd() * 6.283; vx = Math.cos(a); vy = Math.sin(a); } else { vx /= sp; vy /= sp; }
          const nx = D.x + vx * 4.8, ny = D.y + vy * 4.8;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) { PX[p] = nx; PY[p] = ny; PVX[p] = vx * Math.max(sp, 1); PVY[p] = vy * Math.max(sp, 1); }
        }
      }
    }
  }
  function drawPortals() {
    for (const q of portals) {
      const c1 = q.k ? pack(255, 150, 40) : pack(60, 160, 255), c2 = q.k ? pack(255, 220, 120) : pack(170, 230, 255);
      for (let k = 0; k < 36; k++) {
        const a = k / 36 * 6.283 + q.t * (q.k ? -.12 : .12), rr = 3 + (k % 3) * .7;
        blend(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr, k % 2 ? c1 : c2, .85);
      }
      put(q.x, q.y, c2);
    }
  }

  // ---------- tornado, meteors, rain, earthquake ----------
  function stepTwisters() {
    for (let n = twisters.length - 1; n >= 0; n--) {
      const tw = twisters[n]; tw.t++;
      tw.x += tw.dir * .18; if (tw.x < 6 || tw.x > W - 6 || rnd() < .004) tw.dir = -tw.dir;
      const cx = clamp(tw.x | 0, 0, W - 1);
      let gy = Math.max(0, (tw.base | 0) - 8);
      while (gy < H - 1 && KIND[g[(gy + 1) * W + cx]] !== K_SOLID) gy++;
      tw.base = gy;
      const h = tw.h * (tw.t > 640 ? Math.max(0, 1 - (tw.t - 640) / 80) : Math.min(1, tw.t / 30));
      if (tw.t > 720) { twisters.splice(n, 1); continue; }
      const rad = f => 2 + f * 13;
      for (let k = 0; k < 300; k++) {
        const f = rnd(), yy = Math.floor(tw.base - f * h), xx = Math.floor(tw.x + (rnd() * 2 - 1) * rad(f));
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx, t = g[i]; if (!t || !movable(t) || mask[i]) continue;
        launch(i, (tw.x - xx >= 0 ? 1 : -1) * (.6 + rnd() * 1.2), -(1.3 + rnd() * 1.4));
      }
      const inside = (px, py) => { const f = (tw.base - py) / (h || 1); return f > -.1 && f < 1.05 && Math.abs(px - tw.x) < rad(clamp(f, 0, 1)) + 3; };
      for (const b of bodies) if (inside(b.x, b.y)) { b.vy -= .22; b.vx += (tw.x - b.x) * .02 + (rnd() - .5) * .3; }
      for (const c of creatures) if (inside(c.x, c.y - c.h / 2)) { c.vy -= .2; c.vx += (tw.x - c.x) * .02 + (rnd() - .5) * .2; c.grounded = false; }
      for (const rg of ragdolls) for (const p of rg.p) if (inside(p.x, p.y)) { p.oy += .12; p.ox -= (tw.x - p.x) * .01 + (rnd() - .5) * .2; }
      for (let p = 0; p < pn; p++) if (inside(PX[p], PY[p])) { PVY[p] -= .15; PVX[p] += (tw.x - PX[p]) * .012 + (rnd() - .5) * .3; }
    }
  }
  function drawTwisters() {
    for (const tw of twisters) {
      const h = tw.h * (tw.t > 640 ? Math.max(0, 1 - (tw.t - 640) / 80) : Math.min(1, tw.t / 30));
      for (let s = 0; s < 40; s++) {
        const f = s / 40, r = 2 + f * 13, a = tw.t * .35 + s * 1.9;
        blend(tw.x + Math.cos(a) * r, tw.base - f * h, s & 1 ? pack(230, 236, 245) : pack(150, 160, 175), .5);
        blend(tw.x + Math.cos(a + 3.14) * r, tw.base - f * h, pack(190, 200, 215), .4);
      }
    }
  }
  function stepMeteors() {
    if (showerT > 0) {
      showerT--;
      if (rnd() < .22) meteors.push({ x: clamp(showerX + (rnd() - .5) * W * .5, 2, W - 3), y: -2, vx: (rnd() - .5) * 1.4, vy: 2.6 + rnd() * 1.2, r: 4 + rndi(4) });
    }
    for (let n = meteors.length - 1; n >= 0; n--) {
      const m = meteors[n]; let hit = false;
      for (let s = 0; s < 3 && !hit; s++) {
        m.x += m.vx / 3; m.y += m.vy / 3;
        const ix = m.x | 0, iy = m.y | 0;
        if (ix < 0 || ix >= W) { hit = 'out'; break; }
        if (iy >= H) { hit = true; break; }
        if (iy >= 0) { const t = g[iy * W + ix]; if (t && KIND[t] !== K_GAS && KIND[t] !== K_FIRE && t !== BOLT) hit = true; }
      }
      if (rnd() < .8) addP(m.x - m.vx, m.y - m.vy, 0, 0, 0, 8 + rndi(10), firePal[24 + rndi(36)]);
      if (hit === 'out') { meteors.splice(n, 1); continue; }
      if (hit) {
        const ix = clamp(m.x | 0, 0, W - 1), iy = clamp(m.y | 0, 0, H - 1);
        explode(ix, iy, m.r, 1.1);
        for (let k = 0; k < 10; k++) addP(ix + .5, iy - 1, (rnd() - .5) * 3, -rnd() * 3, rnd() < .5 ? LAVA : STONE, -1, 0);
        stats.meteors = (stats.meteors || 0) + 1;
        meteors.splice(n, 1);
      }
    }
  }
  function stepRain() {
    if (rainT <= 0) return;
    rainT--;
    const row = gdir >= 0 ? 0 : H - 1, cnt = rainMat === WATER ? Math.max(3, (W / 12) | 0) : Math.max(2, (W / 40) | 0);
    for (let k = 0; k < cnt; k++) { const i = row * W + rndi(W); if (g[i] === 0 && !mask[i]) set(i, rainMat, 0); }
  }
  function stepQuake() {
    if (quakeT <= 0) return;
    quakeT--; shake = Math.max(shake, 7);
    const S = (N / 140) | 0;
    for (let k = 0; k < S; k++) {
      const i = rndi(N), t = g[i]; if (!t || t === CLONE || t === BOLT || t === VOID || mask[i]) continue;
      const kd = KIND[t];
      if (kd === K_SOLID) { if (rnd() < .035) launch(i, (rnd() - .5) * 1.6, -rnd() * 1.4); }
      else if (kd === K_POWDER || kd === K_LIQ) { if (rnd() < .5) launch(i, (rnd() - .5) * 1.2, -rnd() * 1.1); }
    }
    for (const b of bodies) { b.vx += (rnd() - .5) * .5; if (rnd() < .2) b.vy -= rnd() * .6; }
    for (const c of creatures) if (c.grounded && rnd() < .04) { c.vy -= .9; c.grounded = false; }
    for (const rg of ragdolls) for (const p of rg.p) { p.ox += (rnd() - .5) * .8; p.oy += rnd() * .3; }
  }

  // ---------- beams, spark, magnet, mutate, heal ----------
  function aimVec() { const dx = ptr.x - ptr.ax, dy = ptr.y - ptr.ay, d = Math.hypot(dx, dy); return d < 3 ? [0, -1] : [dx / d, dy / d]; }
  function march(x0, y0, dx, dy, maxLen, fn) {
    let last = -1, s = 0;
    for (; s < maxLen; s += .8) {
      const ix = Math.floor(x0 + dx * s), iy = Math.floor(y0 + dy * s);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) break;
      const i = iy * W + ix; if (i === last) continue; last = i;
      if (fn(i, ix, iy) === false) { s += .8; break; }
    }
    return s;
  }
  const segDist = (x0, y0, x1, y1, px, py) => { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1); return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t)); };
  function setBeam(dx, dy, len, col) { beam = { x0: ptr.ax, y0: ptr.ay, x1: ptr.ax + dx * len, y1: ptr.ay + dy * len, col, until: performance.now() + 90 }; }
  function beamHits(rad, fnC, fnB) {
    for (const c of creatures) if (segDist(beam.x0, beam.y0, beam.x1, beam.y1, c.x, c.y - c.h / 2) < rad) fnC(c);
    for (const b of bodies) if (segDist(beam.x0, beam.y0, beam.x1, beam.y1, b.x, b.y) < rad + b.w / 2) fnB(b);
  }
  function laserBeam() {
    const [dx, dy] = aimVec(); let E = 46;
    const len = march(ptr.ax, ptr.ay, dx, dy, 260, (i, ix, iy) => {
      const t = g[i];
      if (!t || KIND[t] === K_GAS || KIND[t] === K_FIRE || t === BOLT || t === GLASS) return true;
      if (t === WATER) { if (rnd() < .5) set(i, STEAM); E -= 1.2; }
      else if (t === ICE || t === SNOW) { set(i, WATER, 0); E -= 2; }
      else if (t === SAND) { set(i, GLASS, 0); E -= 3; }
      else if (t === METAL) { dat[i] = Math.min(255, dat[i] + 30); E -= 7; }
      else if (t === GOLD || t === COPPER) E -= 7;
      else if (t === STONE) { dat[i] = Math.min(255, dat[i] + 18); E -= 5; }
      else if (FLAM[t] > 0) { ignite(i); E -= 2; }
      else if (t === CLONE || t === VOID) E = 0;
      else { if (rnd() < .4) set(i, rnd() < .3 ? SMOKE : 0); E -= HARD[t] * 1.2; }
      if (rnd() < .3) addP(ix + .5, iy + .5, (rnd() - .5) * .8, (rnd() - .5) * .8, 0, 6 + rndi(8), pack(255, 200, 120));
      return E > 0;
    });
    setBeam(dx, dy, len, pack(255, 60, 60));
    beamHits(1.6, c => { if (c.st === 'ok') kill(c, 'lasered', true); }, b => hurtBody(b, 8));
  }
  function iceBeam() {
    const [dx, dy] = aimVec(); let E = 34;
    const len = march(ptr.ax, ptr.ay, dx, dy, 150, (i) => {
      const t = g[i];
      if (t === 0) { if (rnd() < .05 && !mask[i]) set(i, SNOW, 0); return true; }
      if (t === STEAM) { set(i, WATER, 0); return true; }
      if (KIND[t] === K_GAS || t === BOLT) return true;
      if (t === WATER) { set(i, ICE, 0); E -= 1; }
      else if (t === LAVA) { set(i, STONE, 0); E -= 3; }
      else if (t === FIRE || t === PLASMA) { g[i] = 0; dat[i] = 0; }
      else if (t === BURN) set(i, WOOD, 0);
      else if (t === VIRUS || t === SLIME || t === ACID || t === OIL || t === HONEY || t === MUD || t === NAPALM) { set(i, ICE, 0); E -= 1.5; }
      else { if (t === METAL || t === SAND || t === STONE || t === CLAY) dat[i] = 0; E -= HARD[t] * .8; }
      return E > 0;
    });
    setBeam(dx, dy, len, pack(120, 220, 255));
    beamHits(2, c => { c.frozen = 420; c.burn = 0; }, b => { b.burn = 0; if (isBomb(b)) b.fuse = Math.max(b.fuse, 120); });
  }
  function flame() {
    const [dx, dy] = aimVec();
    for (let k = 0; k < 5; k++) { const sp = 2.2 + rnd() * 1.2; addP(ptr.ax + dx * 3, ptr.ay + dy * 3, dx * sp + (rnd() - .5) * .7, dy * sp + (rnd() - .5) * .7, FIRE, -1, 0); }
    march(ptr.ax, ptr.ay, dx, dy, 14, (i) => {
      const t = g[i]; if (!t || KIND[t] === K_GAS || KIND[t] === K_FIRE) return true;
      if (FLAM[t] > 0 && rnd() < .4) ignite(i);
      else if (t === ICE || t === SNOW) set(i, WATER, 0);
      else if (t === WATER && rnd() < .1) set(i, STEAM);
      else if (t === METAL) dat[i] = Math.min(255, dat[i] + 8);
      return false;
    });
  }
  function shrinkCreature(c) { if (c.tiny) return; c.tiny = true; if (c.kind === 'walker' || c.kind === 'robot') c.h = 3; }
  function shrinkBody(b) {
    if ((b.sh || 0) >= 3) return; b.sh = (b.sh || 0) + 1;
    if (b.rect) { b.w = Math.max(3, Math.round(b.w * .7)); b.h = Math.max(3, Math.round(b.h * .7)); }
    else { b.r = Math.max(1.6, b.r * .7); b.w = b.h = Math.max(4, Math.ceil(b.r * 2 + .6)); }
  }
  function shrinkRay() {
    const [dx, dy] = aimVec(); let hits = 0;
    const len = march(ptr.ax, ptr.ay, dx, dy, 200, (i, ix, iy) => {
      const t = g[i]; if (!t || KIND[t] === K_GAS || KIND[t] === K_FIRE || t === BOLT) return true;
      if (t === CLONE || t === VOID) return false;
      if (rnd() < .35) { g[i] = 0; dat[i] = 0; addP(ix + .5, iy + .5, (rnd() - .5) * .5, -.2 - rnd() * .4, 0, 10 + rndi(10), pack(255, 120, 255)); }
      return ++hits < 7;
    });
    setBeam(dx, dy, len, pack(255, 90, 255));
    beamHits(1.8, shrinkCreature, shrinkBody);
  }
  function spark(x, y) {
    disc(x, y, 1.5, i => { if (mask[i]) return; if (g[i] === 0 || KIND[g[i]] === K_GAS) set(i, BOLT); else if (CLS[g[i]]) electrify(i, g[i]); });
    disc(x, y, 2.6, i => { const t = g[i]; if (t === NITRO) boom(i, 6, .9); else if (t === C4) boom(i, 12, 1.5); else if (t === POWDER) ignite(i); });
    stats.sparks = (stats.sparks || 0) + 1; sfx('zap');
  }
  function magnet() {
    const R = 24 + brush;
    // scan the whole radius for exposed metal and pull the nearest few cells each frame
    const px = ptr.x | 0, py = ptr.y | 0, cand = [];
    for (let y = Math.max(0, py - R); y < Math.min(H, py + R + 1); y++) for (let x = Math.max(0, px - R); x < Math.min(W, px + R + 1); x++) {
      const i = y * W + x; if (g[i] !== METAL || mask[i]) continue;
      const dd = Math.hypot(ptr.x - x, ptr.y - y); if (dd > R || dd < 2.5) continue;
      for (let k = 0; k < 4; k++) { const j = nbr(x, y, k); if (j >= 0 && g[j] === 0 && !mask[j]) { cand.push(dd, i); break; } }
    }
    for (let n = 0; n < 14 && cand.length; n++) {
      let best = 0; for (let c = 2; c < cand.length; c += 2) if (cand[c] < cand[best]) best = c;
      const dd = cand[best], i = cand[best + 1]; cand.splice(best, 2);
      const x = i % W, y = (i / W) | 0, ex = ptr.x - x, ey = ptr.y - y, s = .9 + 3 / dd;
      launch(i, ex / dd * s, ey / dd * s - .3);
    }
    const pull = (o, ox, oy, k) => { const ex = ptr.x - ox, ey = ptr.y - oy, d = Math.hypot(ex, ey) || 1; if (d < R * 1.5) { o.vx += ex / d * k; o.vy += ey / d * k; } };
    for (const b of bodies) if (b.kind === 'bomb' || b.kind === 'barrel' || b.kind === 'car') pull(b, b.x, b.y, .22);
    for (const c of creatures) if (c.kind === 'robot') pull(c, c.x, c.y - 4, .18);
    for (let p = 0; p < pn; p++) if (PT[p] === METAL && PL[p] < 0) { const ex = ptr.x - PX[p], ey = ptr.y - PY[p], d = Math.hypot(ex, ey) || 1; if (d < R * 1.5) { PVX[p] += ex / d * .22; PVY[p] += ey / d * .22; } }
  }
  function pushUndo() {
    undoStack.push({ w: W, h: H, g: g.slice(), d: dat.slice(), t: anyTint ? tint.slice() : null });
    if (undoStack.length > 10) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s || s.w !== W || s.h !== H) { undoStack.length = 0; return false; }
    g.set(s.g); dat.set(s.d); if (s.t) tint.set(s.t); else tint.fill(0);
    elec.fill(0); elecList.length = 0; pn = 0;
    return true;
  }
  const MUT = [SAND, WATER, STONE, WOOD, OIL, LAVA, ICE, SNOW, SALT, ACID, DIRT, MUD, CLAY, HONEY, MERCURY, GOLD, COPPER, WAX, COAL, RUBBER, CRYSTAL, CONCRETE, SLIME, METAL, GLASS, PLANT, BRICK];
  function mutate() { disc(ptr.x, ptr.y, brush, i => { if (g[i] && !mask[i] && rnd() < .18) set(i, MUT[rndi(MUT.length)], 0); }); }
  function healAt() {
    const r = brush + 3, hit = (x, y) => Math.hypot(x - ptr.x, y - ptr.y) < r;
    for (const c of creatures) if (hit(c.x, c.y - c.h / 2)) {
      if (c.st !== 'ok') { c.st = 'ok'; c.cause = ''; c.char = false; c.deadT = 0; c.breath = 240; stats.lost = Math.max(0, stats.lost - 1); stats.revived = (stats.revived || 0) + 1; }
      c.hp = 100; c.burn = 0; c.inf = 0; c.zombie = false; c.frozen = 0; c.tiny = false; c.h = c.h0;
    }
    for (const b of bodies) if (hit(b.x, b.y)) { b.hp = Math.max(b.hp, 100); b.burn = 0; }
    for (const rg of ragdolls) if (hit(rg.p[1].x, rg.p[1].y)) { rg.hp = 100; rg.burn = 0; }
    disc(ptr.x, ptr.y, r, i => { const t = g[i]; if (t === VIRUS) set(i, 0, 0); else if (t === BURN && rnd() < .3) set(i, WOOD, 0); });
  }
  const TINTS = [0, pack(255, 70, 70), pack(255, 150, 40), pack(250, 220, 60), pack(90, 210, 90), pack(60, 200, 200), pack(70, 130, 255), pack(170, 100, 255), pack(250, 110, 200), pack(250, 250, 250), pack(40, 40, 50), pack(150, 100, 60)];
  const TINT_NAMES = ['Clear', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Violet', 'Pink', 'White', 'Black', 'Brown'];

  // ---------- tree, fill, line, eyedropper ----------
  function plantTree(x, y) {
    x |= 0; y |= 0; if (x < 2 || x >= W - 2 || y < 1 || y >= H) return false;
    const dir = gdir < 0 ? -1 : 1; let yy = y, found = false;
    for (let k = 0; k < 30; k++) { const ny = yy + dir; if (ny < 0 || ny >= H) break; const t = g[ny * W + x]; if (t && (KIND[t] === K_SOLID || KIND[t] === K_POWDER)) { found = true; break; } yy = ny; }
    if (!found) return false;
    const idx = yy * W + x; if (g[idx] !== 0 && KIND[g[idx]] !== K_GAS) return false;
    set(idx, SAPLING, 24 + rndi(16)); return true;
  }
  function paintDat(m) { return m === PLANT ? rndi(3) : m === CRYSTAL ? (rnd() < .12 ? 14 + rndi(16) : 0) : m === FWORK ? 24 + rndi(26) : m === SAPLING ? 24 + rndi(14) : (m === CONCRETE || m === COPPER) ? 0 : undefined; }
  function bucket(x, y) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const s = y * W + x, from = g[s], to = lineMat; if (from === to) return 0;
    const seen = new Uint8Array(N), stack = [s]; seen[s] = 1; let n = 0;
    while (stack.length) {
      const i = stack.pop(); set(i, to, paintDat(to)); n++;
      const cx = i % W, cy = (i / W) | 0;
      for (let k = 0; k < 4; k++) { const j = nbr(cx, cy, k); if (j >= 0 && !seen[j] && g[j] === from && !mask[j]) { seen[j] = 1; stack.push(j); } }
    }
    return n;
  }
  function commitLine() {
    const x0 = ptr.ax, y0 = ptr.ay, x1 = ptr.x, y1 = ptr.y, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1, r = Math.max(.7, (brush - 1) * .5);
    for (let k = 0; k <= n; k++) disc(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, r, i => { if (!mask[i]) set(i, lineMat, paintDat(lineMat)); });
  }
  const PICK = { [BURN]: FIRE, [WAXM]: WAX, [CONCSET]: CONCRETE };
  function eyedrop(x, y) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    let m = g[y * W + x];
    if (!m) { showTip('<b>Eyedropper</b> That spot is empty.'); return; }
    m = PICK[m] || m;
    const t = TOOLS.find(q => q.mat === m);
    if (t) selectTool(t.id); else showTip(`<b>${NAME[m]}</b> is a reaction product with no tool of its own.`);
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
  Object.assign(ICONS, {
    zombie: svg('<circle cx="9" cy="6" r="2.5" fill="currentColor" fill-opacity=".4"/><path d="M9 9v6M9 11h9M7 21l2-6 3 6"/>', 'style="color:#86efac"'),
    robot: svg('<rect x="6" y="7" width="12" height="10" rx="2" fill="currentColor" fill-opacity=".25"/><circle cx="10" cy="12" r="1.3" fill="currentColor"/><circle cx="14" cy="12" r="1.3" fill="currentColor"/><path d="M12 7V4M9 20v-3M15 20v-3"/>', 'style="color:#cbd5e1"'),
    ant: svg('<circle cx="6.5" cy="13" r="2.2" fill="currentColor"/><circle cx="12" cy="13" r="1.8" fill="currentColor"/><circle cx="17.5" cy="12.5" r="2.4" fill="currentColor"/><path d="M6 15l-2 4M12 15v4M9 15l-1 4M16 15l1 4M19 11l2-3M19 10l-1-4"/>', 'style="color:#d6a77a"'),
    bird: svg('<path d="M3 11c3-5 6-5 9 0 3-5 6-5 9 0"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>', 'style="color:#93c5fd"'),
    fish: svg('<path d="M3 12c4-6 11-6 14 0-3 6-10 6-14 0z" fill="currentColor" fill-opacity=".3"/><path d="M17 12l4-4v8z"/><circle cx="8" cy="11" r=".9" fill="currentColor"/>', 'style="color:#fdba74"'),
    barrel: svg('<rect x="6" y="3" width="12" height="18" rx="3" fill="currentColor" fill-opacity=".3"/><path d="M6 8h12M6 16h12"/><path d="M10 12h4" stroke-width="3"/>', 'style="color:#f87171"'),
    balloon: svg('<ellipse cx="12" cy="9" rx="6" ry="7" fill="currentColor" fill-opacity=".35"/><path d="M12 16l-1 3 2 2"/>', 'style="color:#f472b6"'),
    car: svg('<path d="M3 15v-3l3-4h8l4 4h3v3z" fill="currentColor" fill-opacity=".3"/><circle cx="8" cy="17" r="2" fill="currentColor"/><circle cx="17" cy="17" r="2" fill="currentColor"/>', 'style="color:#fcd34d"'),
    rocket: svg('<path d="M12 3c4 3 4 9 3 13H9c-1-4-1-10 3-13z" fill="currentColor" fill-opacity=".3"/><path d="M9 16l-3 4M15 16l3 4M12 18v4"/>', 'style="color:#e2e8f0"'),
    ragdoll: svg('<circle cx="14" cy="5" r="2" fill="currentColor"/><path d="M13 8l-3 6M13 9l5 3M12 9l-5 1M10 14l-4 5M10 14l5 4"/>', 'style="color:#fda4af"'),
    fan: svg('<circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 12c0-5 2-8 5-8 0 3-2 6-5 8zM12 12c5 0 8 2 8 5-3 0-6-2-8-5zM12 12c0 5-2 8-5 8 0-3 2-6 5-8zM12 12c-5 0-8-2-8-5 3 0 6 2 8 5z" fill="currentColor" fill-opacity=".3"/>', 'style="color:#a5f3fc"'),
    spring: svg('<path d="M5 20h14M12 3v3M7 8l10 2.5L7 13l10 2.5L7 18"/>', 'style="color:#5eead4"'),
    tree: svg('<path d="M12 21v-7"/><circle cx="12" cy="9" r="6" fill="currentColor" fill-opacity=".3"/><path d="M12 14l-3-3M12 15l3-3"/>', 'style="color:#86efac"'),
    spark: svg('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>', 'style="color:#fde047"'),
    tornado: svg('<path d="M4 5h16M6 9h12M8 13h8M10 17h4M12 21h.1"/>', 'style="color:#cbd5e1"'),
    quake: svg('<path d="M3 11l4-3 3 5 3-6 3 7 3-4 2 1"/><path d="M3 20h18"/>', 'style="color:#d6a77a"'),
    meteors: svg('<circle cx="16" cy="16" r="4" fill="currentColor"/><path d="M13 13L4 4M10 15L3 10M15 10l-5-7"/>', 'style="color:#fb923c"'),
    flood: svg('<path d="M2 8c3-3 5 3 8 0s5 3 8 0 4-1 4-1M2 14c3-3 5 3 8 0s5 3 8 0 4-1 4-1M2 20c3-3 5 3 8 0s5 3 8 0"/>', 'style="color:#60a5fa"'),
    acidrain: svg('<path d="M7 14a4 4 0 0 1 0-8 5 5 0 0 1 10 1 3.5 3.5 0 0 1 0 7z" fill="currentColor" fill-opacity=".25"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>', 'style="color:#a3e635"'),
    laser: svg('<path d="M3 21L19 5" stroke-width="3"/><circle cx="20" cy="4" r="2" fill="currentColor"/>', 'style="color:#f87171"'),
    flame: svg('<path d="M3 18h6M9 16h4v4H9z"/><path d="M14 18c0-4 3-3 3-7 2 2 4 4 4 7z" fill="currentColor" fill-opacity=".3"/>', 'style="color:#fb923c"'),
    icebeam: svg('<path d="M3 21L14 10" stroke-width="3"/><path d="M18 3v10M13.5 5.5l9 5M13.5 10.5l9-5"/>', 'style="color:#7dd3fc"'),
    shrink: svg('<path d="M4 4l6 6M4 10V4h6M20 20l-6-6M20 14v6h-6"/>', 'style="color:#e879f9"'),
    magnet: svg('<path d="M6 3v9a6 6 0 0 0 12 0V3M6 7h4M14 7h4"/>', 'style="color:#f87171"'),
    portal: svg('<ellipse cx="8.5" cy="12" rx="3.5" ry="7" stroke="#60a5fa"/><ellipse cx="15.5" cy="12" rx="3.5" ry="7" stroke="#fb923c"/>'),
    timefreeze: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 'style="color:#93c5fd"'),
    mutate: svg('<rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" fill-opacity=".2"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/>', 'style="color:#c084fc"'),
    heal: svg('<path d="M12 5v14M5 12h14" stroke-width="3"/>', 'style="color:#4ade80"'),
    paint: svg('<path d="M5 19c2 0 3-1 3-3l9-9-3-3-9 9c0 2-1 3-3 3 0 2 1 3 3 3z" fill="currentColor" fill-opacity=".25"/>', 'style="color:#f472b6"'),
    line: svg('<path d="M4 19L20 5"/><circle cx="4" cy="19" r="2" fill="currentColor"/><circle cx="20" cy="5" r="2" fill="currentColor"/>'),
    fill: svg('<path d="M5 11l6-6 7 7-6 6z" fill="currentColor" fill-opacity=".3"/><path d="M19 15c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z" fill="currentColor"/>', 'style="color:#38bdf8"'),
    eyedrop: svg('<path d="M14 4l6 6M16 8L6 18l-1 3 3-1 10-10M13 5l6 6"/>'),
  });
  const swatch = t => { const [r, g_, b] = BASE[t]; return `<span class="sw" style="background-color:rgb(${r},${g_},${b})"></span>`; };
  const TOOLS = [
    // matter
    { id: 'sand', name: 'Sand', tab: 'matter', sub: 'Basics', mat: SAND, tip: 'Falls and piles up. Heat it long enough and it turns to glass.' },
    { id: 'water', name: 'Water', tab: 'matter', sub: 'Basics', mat: WATER, tip: 'Flows and fills. Puts out fire, turns lava to stone, grows seeds, turns dirt to mud.' },
    { id: 'stone', name: 'Stone', tab: 'matter', sub: 'Basics', mat: STONE, tip: 'Solid wall. Only melts in serious heat.' },
    { id: 'wood', name: 'Wood', tab: 'matter', sub: 'Basics', mat: WOOD, tip: 'Solid and flammable. Burns slowly into ash.' },
    { id: 'glass', name: 'Glass', tab: 'matter', sub: 'Basics', mat: GLASS, tip: 'Clear wall that acid cannot eat. Shatters when shot.' },
    { id: 'metal', name: 'Metal', tab: 'matter', sub: 'Basics', mat: METAL, tip: 'Solid, glows when hot, conducts lightning, bounces bullets, pulled by magnets.' },
    { id: 'ice', name: 'Ice', tab: 'matter', sub: 'Basics', mat: ICE, tip: 'Melts near heat. Salt melts it too.' },
    { id: 'snow', name: 'Snow', tab: 'matter', sub: 'Basics', mat: SNOW, tip: 'Light powder that piles steep and melts easily.' },
    { id: 'salt', name: 'Salt', tab: 'matter', sub: 'Basics', mat: SALT, tip: 'Dissolves in water, melts ice and snow, feeds crystals.' },
    { id: 'seed', name: 'Seed', tab: 'matter', sub: 'Basics', mat: SEED, tip: 'Sprouts when it touches water or mud. Plants drink and climb.' },
    { id: 'plant', name: 'Plant', tab: 'matter', sub: 'Basics', mat: PLANT, tip: 'Grows when watered. Flowers at the tips. Burns.' },
    { id: 'steam', name: 'Steam', tab: 'matter', sub: 'Gas + liquid', mat: STEAM, tip: 'Rises and condenses back into water. Clouds soak it up.' },
    { id: 'smoke', name: 'Smoke', tab: 'matter', sub: 'Gas + liquid', mat: SMOKE, tip: 'Drifts up and fades away.' },
    { id: 'cloud', name: 'Cloud', tab: 'matter', sub: 'Gas + liquid', mat: CLOUD, tip: 'Drifts high and rains. Soaks up steam to refill.' },
    { id: 'oil', name: 'Oil', tab: 'matter', sub: 'Gas + liquid', mat: OIL, tip: 'Floats on water and goes up in flames fast.' },
    { id: 'lava', name: 'Lava', tab: 'matter', sub: 'Gas + liquid', mat: LAVA, tip: 'Slow, hot, ignites everything. Water cools it into stone.' },
    { id: 'acid', name: 'Acid', tab: 'matter', sub: 'Gas + liquid', mat: ACID, tip: 'Eats almost anything. Glass and gold hold it.' },
    { id: 'honey', name: 'Honey', tab: 'matter', sub: 'Gas + liquid', mat: HONEY, tip: 'Very slow, thick liquid. Walkers wade through it like glue.' },
    { id: 'slime', name: 'Slime', tab: 'matter', sub: 'Gas + liquid', mat: SLIME, tip: 'Sluggish goo. Can infect creatures that sit in it.' },
    { id: 'mercury', name: 'Mercury', tab: 'matter', sub: 'Gas + liquid', mat: MERCURY, tip: 'Heavy liquid metal. Everything floats on it. Conducts electricity. Poisonous.' },
    { id: 'ln2', name: 'Liquid N2', tab: 'matter', sub: 'Gas + liquid', mat: LN2, tip: 'Freezes water, lava, goo and creatures on contact, then boils away.' },
    { id: 'dirt', name: 'Dirt', tab: 'matter', sub: 'Earth + build', mat: DIRT, tip: 'Soil. Turns to mud in water. Ants dig through it.' },
    { id: 'mud', name: 'Mud', tab: 'matter', sub: 'Earth + build', mat: MUD, tip: 'Thick wet soil. Dries back to dirt near heat. Seeds sprout in it.' },
    { id: 'clay', name: 'Clay', tab: 'matter', sub: 'Earth + build', mat: CLAY, tip: 'Heat it with fire or lava and it bakes into brick.' },
    { id: 'brick', name: 'Brick', tab: 'matter', sub: 'Earth + build', mat: BRICK, tip: 'Hard baked wall. Acid barely touches it.' },
    { id: 'concrete', name: 'Concrete', tab: 'matter', sub: 'Earth + build', mat: CONCRETE, tip: 'Pours like a liquid, then sets rock hard after a few seconds.' },
    { id: 'coal', name: 'Coal', tab: 'matter', sub: 'Earth + build', mat: COAL, tip: 'Black powder that catches slowly and burns for a long time.' },
    { id: 'rubber', name: 'Rubber', tab: 'matter', sub: 'Earth + build', mat: RUBBER, tip: 'Bouncy solid. Balls, crates and walkers rebound off it.' },
    { id: 'gold', name: 'Gold', tab: 'matter', sub: 'Earth + build', mat: GOLD, tip: 'Shiny conductor that acid cannot dissolve.' },
    { id: 'copper', name: 'Copper', tab: 'matter', sub: 'Earth + build', mat: COPPER, tip: 'Best wire. Conducts longer, turns green when wet.' },
    { id: 'wax', name: 'Wax', tab: 'matter', sub: 'Earth + build', mat: WAX, tip: 'Melts near heat and sets again when it cools.' },
    { id: 'crystal', name: 'Crystal', tab: 'matter', sub: 'Earth + build', mat: CRYSTAL, tip: 'Seeds grow into branching crystal. Salt makes it grow faster.' },
    { id: 'fire', name: 'Fire', tab: 'matter', sub: 'Energetic', mat: FIRE, tip: 'Spreads through wood, oil, plants and gunpowder.' },
    { id: 'powder', name: 'Gunpowder', tab: 'matter', sub: 'Energetic', mat: POWDER, tip: 'Explodes when fire, lava or a bullet touches it. Chains.' },
    { id: 'nitro', name: 'Nitro', tab: 'matter', sub: 'Energetic', mat: NITRO, tip: 'Unstable liquid. Explodes when it lands hard or touches a flame.' },
    { id: 'thermite', name: 'Thermite', tab: 'matter', sub: 'Energetic', mat: THERMITE, tip: 'Light it and it burns white hot, melting through metal and stone.' },
    { id: 'c4', name: 'C4', tab: 'matter', sub: 'Energetic', mat: C4, tip: 'Stable putty. Only a spark, bolt or nearby blast sets it off.' },
    { id: 'napalm', name: 'Napalm', tab: 'matter', sub: 'Energetic', mat: NAPALM, tip: 'Sticky fuel that burns for ages once lit.' },
    { id: 'plasma', name: 'Plasma', tab: 'matter', sub: 'Energetic', mat: PLASMA, tip: 'Searing gas. Ignites, boils and melts whatever it drifts into.' },
    { id: 'firework', name: 'Firework', tab: 'matter', sub: 'Energetic', mat: FWORK, tip: 'Each dab launches a rocket that bursts into coloured sparks.' },
    { id: 'antimatter', name: 'Antimatter', tab: 'matter', sub: 'Energetic', mat: ANTI, tip: 'Annihilates with anything it touches, taking both with a small blast.' },
    { id: 'void', name: 'Void', tab: 'matter', sub: 'Energetic', mat: VOID, tip: 'Solid black block that deletes whatever touches it.' },
    // life + things
    { id: 'walker', name: 'Walker', tab: 'life', sub: 'Creatures', spawn: 'walker', tip: 'Little people. They walk, climb steps, swim badly and avoid fire if they can.' },
    { id: 'zombie', name: 'Zombie', tab: 'life', sub: 'Creatures', spawn: 'zombie', icon: true, tip: 'Already infected. Shambles toward walkers and spreads the virus.' },
    { id: 'robot', name: 'Robot', tab: 'life', sub: 'Creatures', spawn: 'robot', icon: true, tip: 'Patrols and shoots any walker in range. Does not drown.' },
    { id: 'critter', name: 'Critter', tab: 'life', sub: 'Creatures', spawn: 'critter', tip: 'Hopping beetles that nibble plants.' },
    { id: 'ant', name: 'Ant', tab: 'life', sub: 'Creatures', spawn: 'ant', icon: true, tip: 'Digs tunnels through sand, dirt and mud.' },
    { id: 'bird', name: 'Bird', tab: 'life', sub: 'Creatures', spawn: 'bird', icon: true, tip: 'Flies at its own altitude and turns away from walls.' },
    { id: 'fish', name: 'Fish', tab: 'life', sub: 'Creatures', spawn: 'fish', icon: true, tip: 'Swims in water. Flops around and suffocates on land.' },
    { id: 'box', name: 'Crate', tab: 'life', sub: 'Things', body: 'box', tip: 'Wooden crate. Floats, stacks, burns.' },
    { id: 'ball', name: 'Ball', tab: 'life', sub: 'Things', body: 'ball', tip: 'Bouncy ball. Throw it with Grab.' },
    { id: 'bomb', name: 'Bomb', tab: 'life', sub: 'Things', body: 'bomb', tip: 'Ticks for a few seconds, then blows. Fire or bullets set it off early.' },
    { id: 'barrel', name: 'TNT barrel', tab: 'life', sub: 'Things', body: 'barrel', icon: true, tip: 'Sits quietly until shot, burned, shocked or dropped hard. Then it is huge.' },
    { id: 'balloon', name: 'Balloon', tab: 'life', sub: 'Things', body: 'balloon', icon: true, tip: 'Floats up. Pops on fire or a bullet.' },
    { id: 'car', name: 'Car', tab: 'life', sub: 'Things', body: 'car', icon: true, tip: 'Drives along the ground, turns around when stuck, runs over walkers.' },
    { id: 'rocket', name: 'Rocket', tab: 'life', sub: 'Things', body: 'rocket', icon: true, tip: 'Blasts off, then explodes where it lands or hits something.' },
    { id: 'ragdoll', name: 'Ragdoll', tab: 'life', sub: 'Things', icon: true, dot: true, tip: 'Floppy dummy. Grab a limb and throw it.' },
    { id: 'turret', name: 'Turret', tab: 'life', sub: 'Build', tip: 'Place gun turrets. With the Shoot tool, every turret fires at your pointer.' },
    { id: 'fan', name: 'Fan', tab: 'life', sub: 'Build', icon: true, dot: true, tip: 'Blows loose matter, bodies and walkers. Tap a fan again to turn it.' },
    { id: 'spring', name: 'Spring', tab: 'life', sub: 'Build', mat: SPRING, icon: true, tip: 'Trampoline block. Throws crates, balls and walkers high.' },
    { id: 'tree', name: 'Tree', tab: 'life', sub: 'Build', icon: true, dot: true, tip: 'Plant a sapling on the ground. It grows a trunk, branches and leaves.' },
    // powers
    { id: 'erase', name: 'Erase', tab: 'power', sub: 'Destroy', tip: 'Removes anything under the brush.' },
    { id: 'infect', name: 'Infect', tab: 'power', sub: 'Destroy', tip: 'Releases a virus that converts matter, crates and creatures. Fire cures it.' },
    { id: 'disintegrate', name: 'Dissolve', tab: 'power', sub: 'Destroy', tip: 'Breaks anything under the brush into drifting dust.' },
    { id: 'explode', name: 'Explode', tab: 'power', sub: 'Destroy', tip: 'Tap for an explosion. Brush size sets the blast.' },
    { id: 'nuke', name: 'Nuke', tab: 'power', sub: 'Destroy', tip: 'Tap for a very large explosion. Mind the walkers.' },
    { id: 'lightning', name: 'Lightning', tab: 'power', sub: 'Destroy', tip: 'Strikes where you tap. Sand turns to glass, metal and water carry the charge.' },
    { id: 'spark', name: 'Spark', tab: 'power', sub: 'Destroy', icon: true, dot: true, tip: 'A small electric pop. Sets off C4 and nitro and shocks wires.' },
    { id: 'tornado', name: 'Tornado', tab: 'power', sub: 'Weather', icon: true, dot: true, tip: 'Tap to spawn a twister that wanders and lifts loose matter, crates and walkers.' },
    { id: 'quake', name: 'Earthquake', tab: 'power', sub: 'Weather', icon: true, dot: true, tip: 'Shakes everything loose. Walls crumble and sand slumps.' },
    { id: 'meteors', name: 'Meteors', tab: 'power', sub: 'Weather', icon: true, dot: true, tip: 'A shower of rocks falls around where you tap. Each leaves a crater.' },
    { id: 'flood', name: 'Flood', tab: 'power', sub: 'Weather', icon: true, dot: true, tip: 'Water pours from the sky for a few seconds.' },
    { id: 'acidrain', name: 'Acid rain', tab: 'power', sub: 'Weather', icon: true, dot: true, tip: 'A long drizzle of acid.' },
    { id: 'wind', name: 'Wind', tab: 'power', sub: 'Weather', tip: 'Drag to blow loose matter, bodies and creatures in that direction.' },
    { id: 'shoot', name: 'Shoot', tab: 'power', sub: 'Beams', tip: 'Hold to fire every turret at your pointer. Places a turret if you have none.' },
    { id: 'laser', name: 'Laser', tab: 'power', sub: 'Beams', icon: true, dot: true, beam: true, tip: 'Press where the beam starts and drag to aim. Cuts, melts and ignites.' },
    { id: 'flame', name: 'Flamethrower', tab: 'power', sub: 'Beams', icon: true, dot: true, beam: true, tip: 'Press to set the nozzle, drag to aim. Sprays burning fuel.' },
    { id: 'icebeam', name: 'Ice beam', tab: 'power', sub: 'Beams', icon: true, dot: true, beam: true, tip: 'Press to set the muzzle, drag to aim. Freezes water, lava and creatures.' },
    { id: 'shrink', name: 'Shrink ray', tab: 'power', sub: 'Beams', icon: true, dot: true, beam: true, tip: 'Press to set the muzzle, drag to aim. Shrinks creatures and crates, thins matter.' },
    { id: 'blackhole', name: 'Black hole', tab: 'power', sub: 'Fields', tip: 'Tap to open a black hole for about ten seconds. It eats everything nearby.' },
    { id: 'magnet', name: 'Magnet', tab: 'power', sub: 'Fields', icon: true, tip: 'Hold to pull metal, bombs, cars and robots toward the pointer.' },
    { id: 'portal', name: 'Portal', tab: 'power', sub: 'Fields', icon: true, dot: true, tip: 'Tap twice: blue then orange. Anything entering one leaves through the other.' },
    { id: 'timefreeze', name: 'Time freeze', tab: 'power', sub: 'Fields', icon: true, tip: 'Paint a zone where time stops for a few seconds.' },
    { id: 'freeze', name: 'Freeze', tab: 'power', sub: 'Fields', tip: 'Water to ice, lava to stone, creatures frozen solid.' },
    { id: 'heat', name: 'Heat', tab: 'power', sub: 'Fields', tip: 'Melts, boils, ignites. Sand becomes glass, metal glows.' },
    { id: 'clone', name: 'Clone', tab: 'power', sub: 'Edit', tip: 'Paint a spawner. It copies the first thing that touches it, forever.' },
    { id: 'mutate', name: 'Mutate', tab: 'power', sub: 'Edit', icon: true, tip: 'Randomly changes what it touches into other materials.' },
    { id: 'heal', name: 'Heal', tab: 'power', sub: 'Edit', icon: true, tip: 'Revives and cures creatures, restores crates, clears virus and flames.' },
    { id: 'paint', name: 'Paint', tab: 'power', sub: 'Edit', icon: true, tip: 'Recolour matter without changing how it behaves. Pick a colour above.' },
    { id: 'line', name: 'Line', tab: 'power', sub: 'Edit', icon: true, dot: true, tip: 'Drag a straight line of the last material you picked. Brush size sets thickness.' },
    { id: 'fill', name: 'Fill', tab: 'power', sub: 'Edit', icon: true, dot: true, tip: 'Floods a connected region with the last material you picked.' },
    { id: 'eyedrop', name: 'Eyedropper', tab: 'power', sub: 'Edit', icon: true, dot: true, tip: 'Tap any matter to pick its tool.' },
    { id: 'grab', name: 'Grab', tab: 'power', sub: 'Edit', tip: 'Pick up crates, balls, bombs, turrets, ragdolls and creatures. Let go to throw.' },
  ];
  const TABS = [['matter', 'Matter'], ['life', 'Life + things'], ['power', 'Powers']];
  const toolById = Object.fromEntries(TOOLS.map(t => [t.id, t]));
  for (const id of [...stats.used]) if (!toolById[id]) stats.used.delete(id);
  let tool = toolById[store.get('tool', 'sand')] || toolById.sand;
  let brush = clamp(store.get('brush', 4), 1, 20);
  let tab = tool.tab;

  // ---------- pointer ----------
  const ptr = { down: false, ax: 0, ay: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, over: false, held: 0, id: null, hist: [] };
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
    try { cvs.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
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
    if (tool.id === 'line') commitLine();
    if (grab) {
      const o = grab.o, [vx, vy] = releaseVel();
      if (grab.rag) { grab.pt.held = false; for (const p of o.p) { p.ox = p.x - clamp(vx, -6, 6) * .9; p.oy = p.y - clamp(vy, -6, 6) * .9; } }
      else { o.grabbed = false; if (!grab.turret) { o.vx = clamp(vx * .9, -5, 5); o.vy = clamp(vy * .9, -5, 5); } }
      grab = null;
    }
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
  const NOUNDO = { grab: 1, shoot: 1, eyedrop: 1, portal: 1 };
  function onPress() {
    const x = ptr.x | 0, y = ptr.y | 0;
    ptr.ax = ptr.x; ptr.ay = ptr.y;
    markUsed(tool.id);
    if (!NOUNDO[tool.id]) pushUndo();
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
        let rbest = null, rpt = null, rd2 = bd;
        for (const rg of ragdolls) for (const p of rg.p) { const d = Math.hypot(p.x - ptr.x, p.y - ptr.y); if (d < rd2) { rd2 = d; rbest = rg; rpt = p; } }
        if (rbest) { grab = { o: rbest, rag: true, pt: rpt }; rpt.held = true; }
        else if (best) { grab = { o: best, turret: turrets.includes(best) }; best.grabbed = true; }
        break;
      }
      case 'shoot': if (!turrets.length) autoTurret(); break;
      case 'spark': spark(ptr.x, ptr.y); break;
      case 'tornado': if (twisters.length >= 3) twisters.shift(); twisters.push({ x: ptr.x, base: ptr.y, h: Math.min(H * .75, 90), t: 0, dir: rnd() < .5 ? -1 : 1 }); sfx('hole'); break;
      case 'quake': quakeT = 120; sfx('bigboom'); break;
      case 'meteors': showerT = 360; showerX = ptr.x; break;
      case 'flood': rainT = 170; rainMat = WATER; break;
      case 'acidrain': rainT = 420; rainMat = ACID; break;
      case 'portal': placePortal(); break;
      case 'fan': placeFan(); sfx('pop'); break;
      case 'tree': if (plantTree(x, y)) sfx('blip'); else showTip('<b>Tree</b> Tap just above the ground to plant one.'); break;
      case 'ragdoll': if (makeRag(ptr.x, ptr.y)) sfx('pop'); break;
      case 'fill': { const n = bucket(x, y); if (n) sfx('pop'); showTip(`<b>Fill</b> ${NAME[lineMat]} (${n} cells)`); break; }
      case 'eyedrop': eyedrop(x, y); break;
      case 'line': showTip(`<b>Line</b> drawing ${NAME[lineMat]}. Drag, then let go.`); break;
    }
  }
  function spawnCreature() {
    const x = ptr.x | 0, y = ptr.y | 0;
    if (x < 1 || x >= W - 1 || y < 1 || y >= H) return;
    if (solidAt(x, y)) return;
    const c = makeCreature(tool.spawn === 'zombie' ? 'walker' : tool.spawn, x, y);
    if (c) { if (tool.spawn === 'zombie') { c.inf = 200; c.zombie = true; stats.infected++; } sfx('blip'); }
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
      const m = tool.mat, p = m === SEED ? .07 : m === FWORK ? .015 : PAINT_P[KIND[m]] || .5;
      strokeDiscs((i, x, y) => {
        if (mask[i]) return;
        if (g[i] === 0) { if (rnd() < p) set(i, m, paintDat(m)); }
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
        for (const f of [...fans]) if (hit(f.x, f.y - 1)) fans.splice(fans.indexOf(f), 1);
        for (const q of [...portals]) if (hit(q.x, q.y)) portals.splice(portals.indexOf(q), 1);
        for (const tw of [...twisters]) if (hit(tw.x, tw.base - 10)) twisters.splice(twisters.indexOf(tw), 1);
        for (const rg of [...ragdolls]) if (rg.p.some(p => hit(p.x, p.y))) { ragdolls.splice(ragdolls.indexOf(rg), 1); if (grab && grab.o === rg) grab = null; }
        strokeDiscs(i => { tint[i] = 0; if (frz[i]) frz[i] = 1; }, r);
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
        for (const b of bodies) if (Math.hypot(b.x - ptr.x, b.y - ptr.y) < r + b.w / 2) { b.burn = 0; if (isBomb(b)) b.fuse = Math.max(b.fuse, 120); }
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
        for (const b of bodies) if (Math.hypot(b.x - ptr.x, b.y - ptr.y) < r + b.w / 2) { if (isBomb(b)) b.fuse = Math.min(b.fuse, 20); else if (b.kind === 'box' && rnd() < .05) b.burn = b.burn || 1; }
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
      case 'spark': if (ptr.held && ptr.held % 8 === 0) spark(ptr.x, ptr.y); break;
      case 'magnet': magnet(); break;
      case 'mutate': if (ptr.held % 3 === 0) mutate(); break;
      case 'heal': healAt(); break;
      case 'paint': strokeDiscs(i => { if (g[i] && !mask[i]) tint[i] = paintIdx; }, r); anyTint = true; break;
      case 'timefreeze': strokeDiscs(i => { if (!frz[i]) frzList.push(i); frz[i] = 240; }, r); break;
      case 'laser': laserBeam(); break;
      case 'flame': flame(); break;
      case 'icebeam': iceBeam(); break;
      case 'shrink': shrinkRay(); break;
      case 'quake': quakeT = Math.max(quakeT, 25); break;
      case 'grab':
        if (grab && grab.rag) { const p = grab.pt; p.x = clamp(ptr.x, 1, W - 2); p.y = clamp(ptr.y, 1, H - 2); p.ox = p.x; p.oy = p.y; }
        else if (grab) {
          const o = grab.o;
          if (grab.turret) { o.x = clamp(ptr.x, 2, W - 3); o.y = clamp(ptr.y, 2, H - 1); }
          else { const ty = o.h && !o.w ? ptr.y + o.h / 2 : ptr.y; o.vx = clamp((ptr.x - o.x) * .4, -5, 5); o.vy = clamp((ty - o.y) * .4, -5, 5); }
        }
        break;
    }
  }

  // ---------- heat map + hover info ----------
  const HBG = pack(26, 30, 42);
  const heatRamp = (() => {
    const stops = [[0, 120, 245, 255], [50, 40, 110, 230], [124, 46, 52, 70], [170, 170, 60, 40], [210, 255, 140, 30], [240, 255, 230, 120], [255, 255, 255, 235]];
    const out = new Uint32Array(256);
    for (let v = 0; v < 256; v++) {
      let s = 0; while (s < stops.length - 2 && v > stops[s + 1][0]) s++;
      const a = stops[s], b = stops[s + 1], u = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      out[v] = pack(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
    }
    return out;
  })();
  function tempAt(i) {
    const t = g[i];
    switch (t) {
      case FIRE: return Math.min(255, 215 + dat[i]);
      case LAVA: return 242;
      case PLASMA: return 255;
      case BURN: return 218;
      case BOLT: return 235;
      case FWORK: return 200;
      case THERMITE: return dat[i] ? 255 : 124;
      case METAL: case SAND: case STONE: case CLAY: return 124 + (dat[i] >> 1);
      case ICE: return 36;
      case SNOW: return 52;
      case LN2: return 0;
      case WATER: return elec[i] ? 190 : 108;
      case STEAM: return 150;
      case SMOKE: return 136;
      case ANTI: return 200;
      default: return elec[i] ? 190 : 124;
    }
  }
  const tempC = v => Math.round(v < 124 ? -196 + v / 124 * 216 : 20 + (v - 124) / 131 * 1480);
  function describeAt(x, y) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return '';
    const i = y * W + x, t = g[i];
    let s = t ? NAME[t] : 'Empty';
    if (t) {
      const tv = tempAt(i);
      s += ` | ${tempC(tv)} C`;
      if (t === CONCRETE) s += ` | setting ${Math.min(100, dat[i])}%`;
      else if (t === CLOUD) s += ` | rain ${dat[i]}`;
      else if (t === COPPER && dat[i] > 0) s += ` | oxidised ${Math.round(dat[i] / 1.2)}%`;
      else if (t === THERMITE && dat[i]) s += ' | burning';
      else if (t === CRYSTAL && dat[i]) s += ' | growing';
      else if (t === SAPLING) s += ' | growing';
      if (elec[i]) s += ' | live current';
      if (frz[i]) s += ' | time frozen';
    }
    for (const c of creatures) if (Math.abs(c.x - x) < 3 && Math.abs(c.y - c.h / 2 - y) < c.h / 2 + 2) { s += ` | ${c.kind} (${c.st === 'ok' ? 'alive' : c.cause || 'dead'})`; break; }
    for (const b of bodies) if (Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.y - y) < b.h / 2 + 1) { s += ` | ${b.kind}`; break; }
    return s;
  }

  // ---------- rendering ----------
  const plasmaPal = ramp([[110, 30, 190], [230, 90, 255], [255, 225, 255], [200, 60, 255]], 16);
  const VERD = pack(80, 184, 150), PURP = pack(120, 40, 200), ANTIC = pack(255, 200, 250);
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
      case COAL: return dat[i] ? mix(pal[t * 8 + s], dat[i] & 4 ? pack(255, 120, 30) : pack(230, 70, 20), Math.min(.9, .35 + dat[i] / 300)) : pal[t * 8 + s];
      case SAND: case STONE: return dat[i] > 20 ? mix(pal[t * 8 + s], HOT, Math.min(.85, (dat[i] - 20) / 230)) : pal[t * 8 + s];
      case CLAY: return dat[i] > 20 ? mix(pal[t * 8 + s], HOT, Math.min(.85, (dat[i] - 20) / 120)) : pal[t * 8 + s];
      case VIRUS: return virusPal[((dat[i] >> 4) + s + (frame >> 3)) & 15];
      case PLANT: return dat[i] & 128 ? flowerPal[s] : pal[t * 8 + s];
      case CLONE: { const x = i % W, y = (i / W) | 0; return ((x + y) & 3) === 0 ? (dat[i] ? pal[dat[i] * 8 + s] : pack(90, 76, 20)) : pal[t * 8 + s]; }
      case BOLT: return (frame + s) & 1 ? WHITE : ELEC;
      case PLASMA: return plasmaPal[(s * 2 + (frame >> 1) + i) & 15];
      case CLOUD: return mix(bg[i], pal[t * 8 + s], .5 + Math.min(.45, dat[i] / 200)) ;
      case COPPER: if (elec[i]) return (frame >> 1) & 1 ? ELEC : WHITE; return mix(pal[t * 8 + s], VERD, Math.min(1, dat[i] / 110));
      case GOLD: if (elec[i]) return (frame >> 1) & 1 ? ELEC : WHITE; return ((frame * 3 + i * 7) & 63) === 0 ? WHITE : pal[t * 8 + s];
      case MERCURY: if (elec[i]) return (frame >> 1) & 1 ? ELEC : WHITE; return (((frame >> 1) + i * 3) & 31) === 0 ? WHITE : pal[t * 8 + s];
      case THERMITE: return dat[i] ? firePal[44 + ((frame + s * 3) & 19)] : pal[t * 8 + s];
      case CRYSTAL: return (((frame >> 1) + i * 5) & 31) < 2 ? WHITE : pal[t * 8 + s];
      case VOID: return (((frame >> 2) + s) & 3) === 0 ? PURP : pal[t * 8 + s];
      case ANTI: return ((frame + s) & 2) ? ANTIC : pal[t * 8 + s];
      case FWORK: return (frame + s) & 1 ? WHITE : pal[t * 8 + s];
      case LN2: return (((frame >> 2) + s) & 1) ? mix(pal[t * 8 + s], WHITE, .35) : pal[t * 8 + s];
      case CONCRETE: return mix(pal[t * 8 + s], pal[CONCSET * 8 + s], Math.min(1, dat[i] / 100));
      default: return pal[t * 8 + s];
    }
  }
  function put(x, y, col) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) pix[y * W + x] = col; }
  function blend(x, y, col, f) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) { const i = y * W + x; pix[i] = mix(pix[i], col, f); } }
  function line(x0, y0, x1, y1, col, f) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let k = 0; k <= n; k++) blend(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, col, f); }
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
    if (b.kind === 'car') {
      const body = [pack(230, 70, 70), pack(70, 140, 240), pack(250, 200, 60), pack(110, 210, 130)][b.col], dk = pack(30, 32, 40), glass = pack(170, 220, 245), hi = mix(body, WHITE, .35);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        let col = null;
        if (y >= 3 && y <= 5) col = y === 3 ? hi : body;
        else if (y >= 1 && y <= 2 && x >= 3 && x <= b.w - 4) col = (x === (b.dir > 0 ? b.w - 4 : 3)) ? body : glass;
        else if (y === 6 && ((x >= 1 && x <= 3) || (x >= b.w - 4 && x <= b.w - 2))) col = dk;
        if (y === 4 && x === (b.dir > 0 ? b.w - 1 : 0)) col = pack(255, 240, 150);
        if (col !== null) plot(x0 + x, y0 + y, col);
      }
      return;
    }
    if (b.kind === 'barrel') {
      const red = pack(190, 52, 42), dk = pack(110, 28, 24), band = pack(60, 60, 68);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        if ((y === 0 || y === b.h - 1) && (x === 0 || x === b.w - 1)) continue;
        let col = (y === 2 || y === b.h - 3) ? band : (x === 1 ? mix(red, WHITE, .3) : x === b.w - 1 || x === 0 ? dk : red);
        if (y >= 3 && y <= 5 && x >= 2 && x <= b.w - 3) col = pack(250, 220, 90);
        plot(x0 + x, y0 + y, col);
      }
      if (b.fuse < 1e8) { const bl = (frame >> 2) & 1; plot(Math.round(b.x), y0 - 1, bl ? pack(255, 230, 90) : pack(255, 90, 40)); }
      return;
    }
    if (b.kind === 'rocket') {
      const wh = pack(236, 240, 246), rd = pack(230, 60, 56), dk = pack(120, 128, 140);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        let col = y <= 1 ? rd : (x === 0 ? mix(wh, dk, .4) : wh);
        if (y >= b.h - 2 && (x === 0 || x === b.w - 1)) col = rd;
        if (y === 3 && x === 1) col = pack(120, 200, 245);
        plot(x0 + x, y0 + y, col);
      }
      if (b.fuel > 0) { plot(Math.round(b.x), y0 + b.h, firePal[48 + rndi(14)]); plot(Math.round(b.x), y0 + b.h + 1, firePal[30 + rndi(20)]); }
      return;
    }
    const r2 = b.r * b.r;
    const base = (b.kind === 'ball' || b.kind === 'balloon') ? [pack(240, 80, 130), pack(80, 170, 250), pack(250, 200, 60), pack(120, 220, 140)][b.col] : pack(52, 54, 64);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const dx = x0 + x + .5 - b.x, dy = y0 + y + .5 - b.y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      let col = base;
      if (dx < -b.r * .2 && dy < -b.r * .2 && d2 < r2 * .45) col = mix(base, WHITE, .45);
      else if (d2 > r2 * .6) col = mix(base, pack(0, 0, 0), .25);
      plot(x0 + x, y0 + y, col);
    }
    if (b.kind === 'balloon') { const sx = Math.round(b.x), sy = Math.round(b.y + b.r); for (let k = 0; k < 5; k++) plot(sx + ((k & 1) ? 0 : 1) - 0, sy + k, pack(200, 200, 210)); }
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
  const BEAMS = { laser: 1, flame: 1, icebeam: 1, shrink: 1 };
  function render() {
    if (heatView) {
      for (let i = 0; i < N; i++) { const t = g[i]; pix[i] = t === 0 ? HBG : heatRamp[tempAt(i)]; }
    } else {
      for (let i = 0; i < N; i++) { const t = g[i]; pix[i] = t === 0 ? bg[i] : PLAIN[t] && !dat[i] ? pal[t * 8 + shd[i]] : cellColor(i); }
      if (anyTint) for (let i = 0; i < N; i++) { const k = tint[i]; if (k && g[i]) pix[i] = mix(pix[i], TINTS[k], .62); }
    }
    for (let k = 0; k < frzList.length; k++) { const i = frzList[k]; pix[i] = mix(pix[i], pack(150, 205, 255), ((i + (frame >> 3)) & 7) === 0 ? .6 : .3); }
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
    drawPortals();
    drawTwisters();
    for (const f of fans) drawFan(f);
    for (const b of bodies) drawBody(b, put);
    for (const t of turrets) drawTurret(t);
    for (const rg of ragdolls) drawRag(rg, put);
    for (const c of creatures) drawCreature(c, put);
    for (const m of meteors) { put(m.x, m.y, WHITE); blend(m.x - m.vx, m.y - m.vy, pack(255, 220, 120), .8); blend(m.x - m.vx * 2, m.y - m.vy * 2, pack(255, 140, 40), .6); blend(m.x - m.vx * 3, m.y - m.vy * 3, pack(200, 70, 30), .4); }
    for (const b of bullets) { put(b.x, b.y, pack(255, 250, 200)); blend(b.x - b.vx * .35, b.y - b.vy * .35, pack(255, 200, 80), .7); blend(b.x - b.vx * .7, b.y - b.vy * .7, pack(255, 120, 40), .4); }
    for (const f of fx) if (f.kind === 'ring') {
      const n = Math.ceil(f.r * 6.3), a = 1 - f.r / f.max;
      for (let k = 0; k < n; k++) { const ang = k / n * 6.283; blend(f.x + Math.cos(ang) * f.r, f.y + Math.sin(ang) * f.r, WHITE, a * .8); }
    }
    if (beam && performance.now() < beam.until) { line(beam.x0, beam.y0, beam.x1, beam.y1, beam.col, .75); line(beam.x0, beam.y0, beam.x1, beam.y1, WHITE, .25); }
    if (ptr.down && tool.id === 'line') { line(ptr.ax, ptr.ay, ptr.x, ptr.y, pal[lineMat * 8 + 3], .9); }
    else if (ptr.down && BEAMS[tool.id]) { const [dx, dy] = aimVec(); for (let s = 0; s < 40; s += 3) blend(ptr.ax + dx * s, ptr.ay + dy * s, WHITE, .35); blend(ptr.ax, ptr.ay, WHITE, .8); }
    // brush outline
    if (ptr.over && !tool.body && !tool.spawn && !tool.dot && tool.id !== 'grab' && tool.id !== 'turret' && tool.id !== 'shoot' && tool.id !== 'nuke' && tool.id !== 'blackhole') {
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
  const tabsEl = $('#tabs'), toolsEl = $('#tools'), listEl = $('#toolList'), tipEl = $('#tip'), hudEl = $('#hud'), searchEl = $('#search'), subEl = $('#subopts'), infoEl = $('#cellinfo');
  const css = c => `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
  function toolBtn(t) {
    const ic = t.mat && !t.icon ? swatch(t.mat) : ICONS[t.id] || ICONS[t.body] || '';
    return `<button class="tool${t === tool ? ' on' : ''}" data-tool="${t.id}" data-s="${(t.name + ' ' + t.tip).toLowerCase()}" title="${t.name}: ${t.tip}" aria-pressed="${t === tool}"><span class="ic">${ic}</span><span class="lbl">${t.name}</span></button>`;
  }
  function buildToolbar() {
    tabsEl.innerHTML = TABS.map(([id, label]) => `<button class="tab${id === tab ? ' on' : ''}" role="tab" data-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('');
    listEl.innerHTML = TABS.map(([id, label]) => {
      let html = '', sub = '';
      for (const t of TOOLS) { if (t.tab !== id) continue; if (t.sub !== sub) { sub = t.sub; html += `<div class="sub">${sub}</div>`; } html += toolBtn(t); }
      return `<div class="group ${id}${id === tab ? ' on' : ''}" data-group="${id}"><h3>${label}</h3>${html}</div>`;
    }).join('');
  }
  tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; refreshToolbar(); });
  listEl.addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (!b) return; selectTool(b.dataset.tool); });
  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    toolsEl.classList.toggle('searching', !!q);
    listEl.querySelectorAll('.tool').forEach(b => b.classList.toggle('nomatch', !!q && !b.dataset.s.includes(q)));
  });
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchEl.value = ''; searchEl.dispatchEvent(new Event('input')); searchEl.blur(); }
    else if (e.key === 'Enter') { const f = listEl.querySelector('.tool:not(.nomatch)'); if (f) { selectTool(f.dataset.tool); searchEl.blur(); } }
  });
  subEl.addEventListener('click', e => { const b = e.target.closest('[data-tint]'); if (!b) return; paintIdx = +b.dataset.tint; updateSubopts(); });
  function updateSubopts() {
    if (tool.id === 'paint') {
      subEl.hidden = false;
      subEl.innerHTML = TINTS.map((c, k) => k === 0
        ? `<button class="chip clr${paintIdx === 0 ? ' on' : ''}" data-tint="0" title="Remove colour" aria-label="Remove colour">x</button>`
        : `<button class="chip${k === paintIdx ? ' on' : ''}" data-tint="${k}" title="${TINT_NAMES[k]}" aria-label="${TINT_NAMES[k]}" style="background:${css(c)}"></button>`).join('');
    } else if (tool.id === 'line' || tool.id === 'fill') { subEl.hidden = false; subEl.innerHTML = `<span class="note">Material: <b>${NAME[lineMat]}</b>. Pick another in Matter.</span>`; }
    else subEl.hidden = true;
  }
  function refreshToolbar() {
    tabsEl.querySelectorAll('.tab').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    listEl.querySelectorAll('.group').forEach(gp => gp.classList.toggle('on', gp.dataset.group === tab));
    listEl.querySelectorAll('.tool').forEach(b => { const on = b.dataset.tool === tool.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    updateSubopts();
  }
  let tipTimer = 0;
  function showTip(html) { tipEl.innerHTML = html; tipEl.classList.remove('fade'); clearTimeout(tipTimer); tipTimer = setTimeout(() => tipEl.classList.add('fade'), 4200); }
  function selectTool(id) {
    tool = toolById[id] || tool; tab = tool.tab; store.set('tool', tool.id);
    if (tool.mat) lineMat = tool.mat;
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
    undo: svg('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -5)"/>'),
    heat: svg('<path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0z" fill="currentColor" fill-opacity=".25"/><path d="M12 9v7"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  };
  const ctrlsEl = $('#ctrls');
  const CTRLS = [['pause', 'Pause', 'Pause or resume (Space)'], ['step', 'Step', 'Advance one frame (.)'], ['slow', 'Slow-mo', 'Slow motion (Z)'], ['gravity', 'Gravity', 'Gravity: down, off, up (G)'], ['undo', 'Undo', 'Undo the last stroke (U or Ctrl+Z)'], ['heat', 'Heat', 'Temperature view (H)'], ['clear', 'Clear', 'Empty the world'], ['settings', 'Settings', 'Settings, world size, random world and save slots']];
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
    cbtn('undo').querySelector('.i').innerHTML = CI.undo;
    cbtn('heat').querySelector('.i').innerHTML = CI.heat; cbtn('heat').classList.toggle('on', heatView);
    cbtn('clear').querySelector('.i').innerHTML = CI.clear;
    cbtn('settings').querySelector('.i').innerHTML = CI.settings;
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
      case 'scene': pushUndo(); clearWorld(); buildScene(); break;
      case 'random': pushUndo(); clearWorld(); genWorld(); showTip('<b>Random world.</b> Saplings will grow into trees.'); break;
      case 'clear': pushUndo(); clearWorld(); showTip('<b>Clear.</b> A blank lot. Paint something.'); break;
      case 'sound': muted = !muted; store.set('muted', muted); if (!muted) ensureAudio(); break;
      case 'snap': openSnap(); break;
      case 'undo': showTip(undo() ? '<b>Undo.</b> Last stroke reverted.' : '<b>Undo.</b> Nothing to undo.'); break;
      case 'heat': heatView = !heatView; showTip(heatView ? '<b>Heat view.</b> Blue is cold, red and white are hot.' : '<b>Normal view.</b>'); break;
      case 'settings': openSettings(); break;
    }
    refreshCtrls();
  }
  function clearWorld() {
    g.fill(0); dat.fill(0); tint.fill(0); frz.fill(0); frzList.length = 0; anyTint = false;
    creatures.length = 0; bodies.length = 0; turrets.length = 0; wells.length = 0; bullets.length = 0; fx.length = 0; pn = 0; grab = null; elecList.length = 0; elec.fill(0);
    ragdolls.length = 0; fans.length = 0; portals.length = 0; twisters.length = 0; meteors.length = 0; boomQ.length = 0; rainT = 0; quakeT = 0; showerT = 0; beam = null;
  }

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (!$('#snap').hidden) { if (e.key === 'Escape') $('#snap').hidden = true; return; }
    if (!$('#settings').hidden) { if (e.key === 'Escape') $('#settings').hidden = true; return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { control('undo'); e.preventDefault(); return; }
    if (k === ' ') { control('pause'); e.preventDefault(); }
    else if (k === '.') control('step');
    else if (k === 'z') control('slow');
    else if (k === 'g') control('gravity');
    else if (k === 'm') control('sound');
    else if (k === 'u') control('undo');
    else if (k === 'h') control('heat');
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
  const SIZE_K = { S: 1.45, M: 1, L: .72 };
  function fit() {
    const r = stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const s = Math.max(2.5, Math.sqrt(r.width * r.height / 64000)) * (SIZE_K[sizeMode] || 1);
    const nw = Math.max(60, Math.round(r.width / s)), nh = Math.max(50, Math.round(r.height / s));
    if (nw === W && nh === H) return;
    alloc(nw, nh);
  }
  let fitT = 0;
  new ResizeObserver(() => { clearTimeout(fitT); fitT = setTimeout(fit, W ? 120 : 0); }).observe(stage);

  // ---------- settings, world slots, random world ----------
  const setEl = $('#settings'), setBody = $('#settingsBody');
  const slotKey = n => `sandlot.slot.${n}`;
  function readSlot(n) { try { const s = localStorage.getItem(slotKey(n)); return s ? JSON.parse(s) : null; } catch { return null; } }
  function encodeWorld() {
    const out = []; let i = 0;
    while (i < N) { const t = g[i], d = dat[i]; let n = 1; while (i + n < N && n < 255 && g[i + n] === t && dat[i + n] === d) n++; out.push(t, d, n); i += n; }
    let s = ''; for (let k = 0; k < out.length; k += 8192) s += String.fromCharCode.apply(null, out.slice(k, k + 8192));
    return btoa(s);
  }
  function saveSlot(n) {
    try {
      const o = { v: 1, w: W, h: H, t: Date.now(), c: encodeWorld(),
        cr: creatures.map(c => [c.kind, +c.x.toFixed(1), +c.y.toFixed(1), c.zombie ? 1 : 0]), bd: bodies.map(b => [b.kind, +b.x.toFixed(1), +b.y.toFixed(1)]), fn: fans.map(f => [f.x, f.y, f.dir]) };
      localStorage.setItem(slotKey(n), JSON.stringify(o));
      return true;
    } catch { return false; }
  }
  function loadSlot(n) {
    const o = readSlot(n);
    if (!o || !o.c) return false;
    try {
      const bin = atob(o.c), dy = H - o.h;
      pushUndo(); clearWorld();
      let idx = 0;
      for (let p = 0; p + 2 < bin.length; p += 3) {
        const t = bin.charCodeAt(p), d = bin.charCodeAt(p + 1), n2 = bin.charCodeAt(p + 2);
        if (t && t < NT) for (let k = 0; k < n2; k++) { const pos = idx + k, nx = pos % o.w, ny = ((pos / o.w) | 0) + dy; if (nx < W && ny >= 0 && ny < H) { const j = ny * W + nx; g[j] = t; dat[j] = d; shd[j] = rndi(8); } }
        idx += n2;
      }
      for (const [k, x, y, z] of o.cr || []) { const c = makeCreature(k, Math.floor(x), Math.floor(y) + dy); if (c && z) { c.zombie = true; c.inf = 200; } }
      for (const [k, x, y] of o.bd || []) makeBody(k, x, y + dy);
      for (const [x, y, d] of o.fn || []) fans.push({ x, y: y + dy, dir: d });
      return true;
    } catch { return false; }
  }
  function slotLabel(n) { const o = readSlot(n); return o ? `${o.w} x ${o.h}, ${new Date(o.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'empty'; }
  function setSize(m) { sizeMode = SIZE_K[m] ? m : 'M'; store.set('size', sizeMode); fit(); }
  function settingsHtml() {
    const tg = (id, label, on) => `<button class="btn tg${on ? ' on' : ''}" type="button" data-set="${id}" aria-pressed="${on}">${label}</button>`;
    return `<h2>Settings</h2>
      <div class="srow"><label for="spd">Sim speed</label><input type="range" id="spd" min="25" max="300" step="5" value="${Math.round(speed * 100)}"><b id="spdVal">${speed.toFixed(2)}x</b></div>
      <div class="srow"><span>World size</span><div class="seg">${[['S', 'Small'], ['M', 'Medium'], ['L', 'Large']].map(([k, l]) => `<button class="btn tg${sizeMode === k ? ' on' : ''}" type="button" data-size="${k}">${l}</button>`).join('')}</div></div>
      <div class="srow wrap">${tg('wrap', 'Wrap edges', wrap)}${tg('info', 'Cell info on hover', hoverInfo)}${tg('heat', 'Heat map', heatView)}${tg('sound', 'Sound', !muted)}</div>
      <div class="srow wrap"><button class="btn" type="button" data-act="random">Random world</button><button class="btn" type="button" data-act="scene">Demo scene</button><button class="btn" type="button" data-act="snap">Snapshot</button></div>
      <h3>World slots</h3>
      ${[1, 2, 3].map(n => `<div class="slot"><span>Slot ${n}: <em id="slotl${n}">${slotLabel(n)}</em></span><button class="btn" type="button" data-save="${n}">Save</button><button class="btn" type="button" data-load="${n}">Load</button></div>`).join('')}
      <div class="btns"><button class="btn primary" type="button" data-act="close">Done</button></div>`;
  }
  function openSettings() { setBody.innerHTML = settingsHtml(); setEl.hidden = false; const f = setBody.querySelector('[data-act="close"]'); if (f) f.focus(); }
  setEl.addEventListener('click', e => {
    if (e.target === setEl) { setEl.hidden = true; return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act) {
      const a = b.dataset.act;
      if (a === 'close') setEl.hidden = true;
      else { setEl.hidden = true; control(a); }
    } else if (b.dataset.size) { setSize(b.dataset.size); setBody.innerHTML = settingsHtml(); }
    else if (b.dataset.set) {
      const s = b.dataset.set;
      if (s === 'wrap') { wrap = !wrap; store.set('wrap', wrap); }
      else if (s === 'info') { hoverInfo = !hoverInfo; store.set('info', hoverInfo); }
      else if (s === 'heat') heatView = !heatView;
      else if (s === 'sound') control('sound');
      refreshCtrls(); setBody.innerHTML = settingsHtml();
    } else if (b.dataset.save) { const n = +b.dataset.save; toast(saveSlot(n) ? `Saved to slot ${n}` : 'Could not save (storage full or blocked)'); setBody.innerHTML = settingsHtml(); }
    else if (b.dataset.load) { const n = +b.dataset.load; if (loadSlot(n)) { setEl.hidden = true; toast(`Loaded slot ${n}`); } else toast(`Slot ${n} is empty`); }
  });
  setEl.addEventListener('input', e => { if (e.target.id === 'spd') { speed = clamp(e.target.value / 100, .25, 3); store.set('speed', speed); $('#spdVal').textContent = speed.toFixed(2) + 'x'; } });
  function genWorld() {
    const base = Math.round(H * .55), amp = H * .12, p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28;
    const ht = new Int16Array(W);
    for (let x = 0; x < W; x++) ht[x] = clamp(Math.round(base + Math.sin(x / W * 6.283 * 1.5 + p1) * amp + Math.sin(x / W * 6.283 * 3.7 + p2) * amp * .45 + Math.sin(x / 9 + p3) * 1.5), (H * .28) | 0, (H * .86) | 0);
    for (let x = 0; x < W; x++) for (let y = ht[x]; y < H; y++) set(y * W + x, y - ht[x] < 3 + (x % 3) ? DIRT : STONE, 0);
    const blob = (cx, cy, r, m) => disc(cx, cy, r, (i) => { if (g[i] === STONE) set(i, m, 0); });
    for (let n = 0; n < Math.max(6, N / 1800); n++) {
      const x = rndi(W), y = ht[x] + 8 + rndi(Math.max(4, H - ht[x] - 10)), r = rnd();
      blob(x, y, 1 + rndi(3), r < .5 ? COAL : r < .8 ? COPPER : r < .9 ? GOLD : CLAY);
    }
    for (let n = 0; n < 6; n++) { // wandering caves
      let x = rndi(W), y = ht[x] + 12 + rndi(Math.max(4, H - ht[x] - 16)); const r = 2 + rndi(3);
      for (let s = 0; s < 40; s++) { x = clamp(x + (rnd() - .5) * 6, 2, W - 3); y = clamp(y + (rnd() - .5) * 4, ht[x | 0] + 8, H - 3); disc(x, y, r, i => { if (g[i] !== 0) { g[i] = 0; dat[i] = 0; } }); }
    }
    for (let y = (H * .9) | 0; y < H - 1; y++) for (let x = 0; x < W; x++) if (g[y * W + x] === 0) set(y * W + x, LAVA, 0);
    let low = 0; for (let x = 0; x < W; x++) low = Math.max(low, ht[x]);
    const lvl = low - Math.round(H * .08);
    for (let x = 0; x < W; x++) for (let y = lvl; y < ht[x]; y++) set(y * W + x, WATER, 0);
    for (let x = 0; x < W; x++) if (ht[x] > lvl - 2 && ht[x] < lvl + 4) for (let y = ht[x]; y < ht[x] + 3 && y < H; y++) if (g[y * W + x] === DIRT) set(y * W + x, SAND, 0);
    for (let n = 0; n < Math.max(4, W / 22); n++) { const x = 3 + rndi(W - 6); if (ht[x] < lvl - 1) { const k = (ht[x] - 1) * W + x; if (g[k] === 0) set(k, SAPLING, 20 + rndi(14)); } }
    for (let n = 0; n < 3; n++) { const cx = 10 + rndi(W - 20), cy = 4 + rndi(Math.max(2, (H * .15) | 0)); for (let k = 0; k < 40; k++) { const x = cx + ((rnd() - .5) * 18) | 0, y = cy + ((rnd() - .5) * 3) | 0; if (x > 0 && x < W && y > 0 && y < H && g[y * W + x] === 0) set(y * W + x, CLOUD, 60 + rndi(80)); } }
    const topAt = x => { let y = 0; while (y < H - 1 && !(g[y * W + x] && KIND[g[y * W + x]] !== K_GAS)) y++; return y; };
    const place = (kind, want, ok, dy) => { for (let tries = 0, n = 0; n < want && tries < 40; tries++) { const x = 4 + rndi(W - 8), y = topAt(x); if (ok(g[y * W + x]) && makeCreature(kind, x, y + dy)) n++; } };
    place('walker', 4, t => t !== WATER && t !== LAVA, -3);
    place('ant', 3, t => t === DIRT, -2);
    for (let n = 0; n < 3; n++) makeCreature('bird', 6 + rndi(W - 12), (H * .2) | 0);
    for (let tries = 0, n = 0; n < 5 && tries < 60; tries++) { const x = rndi(W), y = lvl + 2 + rndi(4); if (y < H && g[y * W + x] === WATER && makeCreature('fish', x, y)) n++; }
    stats.spawned = 0; stats.lost = 0; stats.deaths.length = 0; stats.infected = 0;
  }

  // ---------- main loop ----------
  let last = performance.now(), acc = 0, toolAcc = 0, showFps = /[?&]fps/.test(location.search), fps = 0, fpsN = 0, fpsT = last, hudT = 0, infoT = 0;
  function toolTick() {
    const ivx = ptr.x - ptr.px, ivy = ptr.y - ptr.py; // pointer velocity, cells per tick
    ptr.vx = ptr.vx * .5 + ivx * .5; ptr.vy = ptr.vy * .5 + ivy * .5;
    if (ptr.down) { applyTool(); ptr.held++; }
    ptr.px = ptr.x; ptr.py = ptr.y;
  }
  function simStep() {
    stampMask(true);
    stepGrid();
    updParticles();
    stepBodies();
    stepCreatures();
    stepRagdolls();
    stepBullets();
    stepWells();
    stepFans();
    stepPortals();
    stepTwisters();
    stepMeteors();
    stepRain();
    stepQuake();
    stepFx();
    runBooms();
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
      toolTick();
    }
    if (toolAcc > 50) toolAcc = 0;
    if (!paused || stepOnce) {
      acc += (slow ? dt / 4 : dt) * speed;
      let n = 0;
      const maxN = speed > 1 ? Math.ceil(speed * 2) : 2;
      if (stepOnce) { simStep(); stepOnce = false; acc = 0; }
      else while (acc >= 16.6 && n < maxN) { simStep(); acc -= 16.6; n++; }
      if (acc > 25 * maxN) acc = 0;
    } else stampMask();
    if (hoverInfo && ptr.over) { if (now - infoT > 90) { infoT = now; infoEl.textContent = describeAt(ptr.x, ptr.y); infoEl.hidden = false; } } else if (!infoEl.hidden) infoEl.hidden = true;
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
    M: { EMPTY, SAND, WATER, STONE, WOOD, OIL, LAVA, ICE, STEAM, SMOKE, ACID, POWDER, SEED, PLANT, METAL, GLASS, SALT, SNOW, FIRE, VIRUS, DUST, CLONE, BOLT, BURN, SLIME,
      DIRT, MUD, CLAY, BRICK, CONCRETE, CONCSET, HONEY, MERCURY, NITRO, THERMITE, C4, NAPALM, PLASMA, LN2, COAL, RUBBER, GOLD, COPPER, WAX, WAXM, CLOUD, ANTI, VOID, CRYSTAL, FWORK, SAPLING, SPRING },
    TOOLS, ragdolls, fans, portals, twisters, meteors, frzList,
    advance(n) { for (let k = 0; k < n; k++) { toolTick(); simStep(); } },
    cell(x, y) { return g[y * W + x]; }, datAt(x, y) { return dat[y * W + x]; }, tintAt(x, y) { return tint[y * W + x]; },
    put(x, y, t, d) { if (x >= 0 && y >= 0 && x < W && y < H) set(y * W + x, t, d); },
    elecAt(x, y) { return elec[y * W + x]; },
    undo, pushUndo, get undoDepth() { return undoStack.length; }, saveSlot, loadSlot, genWorld, setSize, openSettings, describeAt, tempAt, tempC,
    setWrap(v) { wrap = !!v; }, setSpeed(v) { speed = clamp(v, .25, 3); }, setHeat(v) { heatView = !!v; }, setInfo(v) { hoverInfo = !!v; },
    get wrap() { return wrap; }, get speed() { return speed; }, get heat() { return heatView; }, get sizeMode() { return sizeMode; }, get beam() { return beam; },
    get rainT() { return rainT; }, get quakeT() { return quakeT; }, get showerT() { return showerT; }, get paintIdx() { return paintIdx; }, set paintIdx(v) { paintIdx = v; },
    render, simStep, toolTick, ignite,
    bench(n) { const t0 = performance.now(); for (let k = 0; k < n; k++) { toolTick(); simStep(); render(); } return (performance.now() - t0) / n; },
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
