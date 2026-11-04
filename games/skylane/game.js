// SKYLANE: roll a pearl down one smooth, endless road that floats over a sea of clouds at night.
// The road is a continuous spline (no tiles). The ball lives in road coordinates: s = distance along the road,
// u = sideways offset, y = height above the road surface. That keeps the rolling perfectly smooth: it follows the
// floor exactly, and only leaves it where the floor really ends, drops away, or curves over faster than gravity.
// Every new piece of road you roll onto scores one point.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ID = 'skylane';
const store = window.Ballpark ? Ballpark.store(ID) : { get: (k, f) => f, set() {} };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

// ---------- tuning ----------
const DS = 0.5;                 // road sample spacing (m)
const HALF = 3.0;               // half width of the full road (m)
const R = 0.42;                 // ball radius
const G = 26;                   // gravity
const STEER = 140, GRIP_ON = 15, GRIP_OFF = 30, AIR_STEER = 0.45; // sideways: ~9 m/s max, stops quickly on release
const THICK = 0.45;             // road slab thickness
const AHEAD = 340, BEHIND = 30; // how much road exists around the ball (m)
const FACE = 0.35;              // arriving lower than this under a floor edge = hitting its face
const PACE_EVERY = 400;         // metres per pace step
const vTarget = s => Math.min(34, 17 + 1.5 * Math.floor(s / PACE_EVERY)); // 61 km/h, +5.4 km/h per pace, max 122
const paceOf = s => Math.min(12, 1 + Math.floor(s / PACE_EVERY));
const difficulty = s => Math.min(1, s / 4000);

// ---------- renderer / scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 1400);
const SKY_TOP = new THREE.Color('#03061a'), SKY_MID = new THREE.Color('#0d1d4a'), SKY_LOW = new THREE.Color('#3a5a9a');
scene.fog = new THREE.Fog('#2c4880', 140, 360);

// sky dome with a vertical gradient, stars and a moon; a cloud sea far below
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: SKY_TOP }, mid: { value: SKY_MID }, low: { value: SKY_LOW } },
  vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top, mid, low; varying vec3 vp; void main(){ float h = vp.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(low, mid, smoothstep(-0.25, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
}));
sky.renderOrder = -2;
scene.add(sky);
const stars = (() => {
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.random() * Math.PI * 2, y = 0.15 + Math.random() * 0.85, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(t) * r * 900, y * 900, Math.sin(t) * r * 900], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe0ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  scene.add(m); return m;
})();
const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 48), new THREE.MeshBasicMaterial({ color: '#f4f1e6', fog: false }));
const moonHalo = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshBasicMaterial({ color: '#9fb7ff', transparent: true, opacity: 0.12, fog: false, depthWrite: false }));
scene.add(moonHalo, moon);
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#20386e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(170,195,255,${0.05 + Math.random() * 0.1})`); gr.addColorStop(1, 'rgba(170,195,255,0)');
    g.fillStyle = gr;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ map: cloudTexture(), fog: true }));
clouds.rotation.x = -Math.PI / 2;
scene.add(clouds);

scene.add(new THREE.HemisphereLight('#bcd0ff', '#1b2550', 1.25));
const sun = new THREE.DirectionalLight('#fff2df', 1.6);
scene.add(sun, sun.target);

// ---------- quality ----------
const QUALITY = { high: { label: 'HIGH', pr: 2, bloom: true }, low: { label: 'LOW', pr: 1, bloom: false } };
let quality = store.get('quality', 'high');
if (!QUALITY[quality]) quality = 'high';
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function setQuality(q) {
  quality = q; store.set('quality', q);
  $('qualityLabel').textContent = QUALITY[q].label;
  resize();
}

// ---------- road ----------
// samples[k - base] = { p, F, R, U, solid: [[u0,u1],...] (empty = gap), fh (floor height above the road line), piece }
let samples = [], base = 0, gen, pieces, blocks;
const Yv = new THREE.Vector3(0, 1, 0);
const deg = Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);
const sgn = () => (Math.random() < 0.5 ? -1 : 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sampleK = k => samples[k - base];
const genS = () => gen.k * DS;
const FULL = [[-HALF, HALF]];

function frameFrom(yaw, pitch, bank) {
  const F = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const R0 = new THREE.Vector3().crossVectors(F, Yv).normalize();
  const U0 = new THREE.Vector3().crossVectors(R0, F).normalize();
  return { F, R: R0.clone().multiplyScalar(Math.cos(bank)).addScaledVector(U0, Math.sin(bank)), U: U0.clone().multiplyScalar(Math.cos(bank)).addScaledVector(R0, -Math.sin(bank)) };
}
const approach = (v, t, step) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
function pushSample(solid = FULL, fh = 0) {
  // smooth heading: the turn rate itself eases toward its target, so curves flow in and out with no kinks
  gen.yr = approach(gen.yr, gen.tyr, 0.0006 * DS);
  gen.yaw += gen.yr * DS;
  gen.pitch = approach(gen.pitch, gen.tp, 0.004 * DS);
  gen.bank = approach(gen.bank, gen.tb, 0.006 * DS);
  const fr = frameFrom(gen.yaw, gen.pitch, gen.bank);
  samples.push({ p: gen.p.clone(), ...fr, solid, fh, piece: gen.piece });
  gen.p.addScaledVector(fr.F, DS);
  gen.k++;
}
function fill(len, fn) {          // fn(x) -> [solid, fh] for x metres into the piece
  const n = Math.max(1, Math.round(len / DS));
  for (let i = 0; i < n; i++) { const [sol, fh] = fn ? fn(i * DS) : [FULL, 0]; pushSample(sol, fh); }
}
function startPiece(kind, bend = true) {
  gen.piece++;
  pieces.push({ id: gen.piece, kind, s: genS() });
  const d = difficulty(genS());
  if (bend) {
    gen.tyr = Math.random() < 0.3 + 0.4 * d ? sgn() * rnd(0.004, 0.01 + 0.012 * d) : 0;
    gen.tb = gen.tyr ? -Math.sign(gen.tyr) * rnd(4, 10 + 6 * d) * deg : 0;
  } else { gen.tyr = 0; gen.tb = 0; }
  gen.tp = -rnd(7, 11) * deg;
}
function straighten() {
  gen.tyr = 0; gen.tb = 0;
  for (let i = 0; i < 160 && (Math.abs(gen.yr) > 0.0004 || Math.abs(gen.bank) > 0.5 * deg); i++) pushSample();
}

// a safe line that wanders across the road, but never faster than the ball can follow
function walk(u, t, room = HALF - 0.9) { const reach = 9 * t * 0.55; return clamp(u + rnd(-reach, reach), -room, room); }

const PIECES = {
  open(d, v) { startPiece('open'); fill(rnd(30, 50)); },
  blocks(d, v) {
    startPiece('blocks');
    const gap = v * (0.62 - 0.25 * d), n = Math.round(rnd(4, 7 + 4 * d));
    fill(gap);
    for (let i = 0; i < n; i++) {
      gen.safe = walk(gen.safe, gap / v);
      const s = genS(), count = Math.random() < 0.15 + 0.55 * d ? 2 : 1;
      for (let c = 0, tries = 0; c < count && tries < 20; tries++) {
        const u = rnd(-HALF + 0.7, HALF - 0.7);
        if (Math.abs(u - gen.safe) < 1.55) continue;
        if (blocks.some(b => b.s === s && Math.abs(b.u - u) < 1.4)) continue;
        blocks.push({ s, u, hw: 0.65, hd: 0.6, h: 1.2 }); c++;
      }
      fill(gap);
    }
  },
  gates(d, v) {
    startPiece('gates');
    const gap = v * (0.7 - 0.2 * d), n = Math.round(rnd(3, 5 + 3 * d)), open = 2.5 - 0.5 * d;
    fill(gap);
    for (let i = 0; i < n; i++) {
      gen.safe = walk(gen.safe, gap / v, HALF - open / 2 - 0.1);
      const s = genS(), a = gen.safe - open / 2, b = gen.safe + open / 2;
      if (a > -HALF + 0.2) blocks.push({ s, u: (-HALF + a) / 2, hw: (a + HALF) / 2, hd: 0.5, h: 1.0 });
      if (b < HALF - 0.2) blocks.push({ s, u: (b + HALF) / 2, hw: (HALF - b) / 2, hd: 0.5, h: 1.0 });
      fill(gap);
    }
  },
  sliders(d, v) {
    // blocks sweep across as a wave; each is set a little further along than the last *as seen when you arrive*,
    // so the open side slides smoothly and you follow it
    startPiece('sliders', false);
    const gap = v * (0.62 - 0.15 * d), n = Math.round(rnd(4, 6 + 3 * d)), w = 1.1 + 1.2 * d, A = 1.8;
    const ph0 = rnd(0, Math.PI * 2), drift = rnd(0.35, 0.55 + 0.2 * d) * sgn(), travel = w * gap / v;
    fill(gap);
    for (let i = 0; i < n; i++) { blocks.push({ s: genS(), u: 0, hw: 0.75, hd: 0.55, h: 1.1, move: { A, w, ph: ph0 + i * (drift - travel) } }); fill(gap); }
  },
  holes(d, v) {
    // the floor drops out on one side, then the other, with a full stretch between so there is time to cross
    startPiece('holes');
    const n = Math.round(rnd(3, 5 + 2 * d));
    let side = sgn();
    for (let i = 0; i < n; i++) {
      const keep = rnd(2.6, 3.4 - 0.6 * d);  // width of floor that stays
      const sol = side < 0 ? [[HALF - keep, HALF]] : [[-HALF, -HALF + keep]];
      fill(v * rnd(0.45, 0.7), () => [sol, 0]);
      const flip = Math.random() < 0.75;
      fill(v * (flip ? 0.75 - 0.15 * d : 0.35));   // time to cross over when the hole switches sides
      if (flip) side = -side;
    }
  },
  narrow(d, v) {
    startPiece('narrow');
    const hw = rnd(1.05, 1.5 - 0.3 * d), shift = sgn() * rnd(0, HALF - hw);
    fill(v * rnd(1.4, 2.4 + d), () => [[[shift - hw, shift + hw]], 0]);
  },
  gaps(d, v) {
    // short full-width gaps you roll straight over at speed (the ball barely dips)
    startPiece('gaps', false);
    const maxFlat = v * Math.sqrt(2 * 0.22 / G), g = Math.min(2.5, maxFlat * 0.75), n = Math.round(rnd(2, 4));
    fill(v * 0.4);
    for (let i = 0; i < n; i++) { fill(g, () => [[], 0]); fill(v * rnd(0.35, 0.6)); }
  },
  rollers(d, v) {
    startPiece('rollers', false);
    const A = rnd(0.5, 0.9 + 0.4 * d), lam = v * rnd(0.6, 0.8), n = Math.round(rnd(2, 4));
    fill(lam * n, x => [FULL, A * (1 - Math.cos(2 * Math.PI * x / lam)) / 2]);
    fill(v * 0.3);
  },
  kicker(d, v) {
    // a ramp and a real jump. The gap is sized from the flight time at a speed a bit under the pace speed,
    // so it is always clearable without steering
    startPiece('kicker', false);
    straighten();
    const H = rnd(0.9, 1.4), Lr = rnd(6, 8), slope = H / Lr;
    fill(v * 0.3);
    fill(Lr, x => [FULL, H * x / Lr]);
    const vEst = v * 0.85, vy = vEst * slope, t = (vy + Math.sqrt(vy * vy + 2 * G * H)) / G;
    const gapLen = clamp(vEst * t * 0.75, 3, 22);
    fill(gapLen, () => [[], 0]);
    fill(v * (t + 0.6));         // clear landing
  },
};

function nextPiece() {
  const s = genS(), d = difficulty(s), v = vTarget(s + 40);
  if (gen.piece === 0) { startPiece('start', false); gen.tp = -9 * deg; fill(60); return; }
  const table = s < 300
    ? [['open', 1], ['blocks', 3], ['gates', 2], ['gaps', 2], ['rollers', 2], ['kicker', 1.5], ['holes', 1.5]]
    : [['open', 0.6], ['blocks', 3], ['gates', 2.5], ['sliders', 2], ['holes', 2], ['narrow', 1.8], ['gaps', 1.5], ['rollers', 1.5], ['kicker', 1.6]];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let pick = Math.random() * total;
  for (const [name, w] of table) { pick -= w; if (pick <= 0) { PIECES[name](d, v); return; } }
  PIECES.open(d, v);
}

// fraction-interpolated road point at distance s, sideways u, height h
const tq = { k: 0, f: 0 };
function locate(s) { const x = s / DS; tq.k = Math.floor(x); tq.f = x - tq.k; return tq; }
function roadPoint(s, u, h, out) {
  const { k, f } = locate(s), a = sampleK(k), b = sampleK(k + 1) || a;
  if (!a) return out.set(0, 0, 0);
  out.copy(a.p).lerp(b.p, f);
  _r.copy(a.R).lerp(b.R, f); _u.copy(a.U).lerp(b.U, f);
  return out.addScaledVector(_r, u).addScaledVector(_u, h);
}
function roadFrame(s, F, Rv, U) {
  const { k, f } = locate(s), a = sampleK(k), b = sampleK(k + 1) || a;
  if (!a) return false;
  F.copy(a.F).lerp(b.F, f).normalize(); Rv.copy(a.R).lerp(b.R, f).normalize(); U.copy(a.U).lerp(b.U, f).normalize();
  return true;
}
const _r = new THREE.Vector3(), _u = new THREE.Vector3();
// floor height at (s, u), or null where there is no floor
function floorAt(s, u) {
  const { k, f } = locate(s), a = sampleK(k);
  if (!a || !a.solid.some(([u0, u1]) => u >= u0 && u <= u1)) return null;
  // blend toward the next sample only where it has floor too (at a ramp's lip the next sample is the gap)
  const b = sampleK(k + 1);
  return b && b.solid.some(([u0, u1]) => u >= u0 && u <= u1) ? a.fh + (b.fh - a.fh) * f : a.fh;
}
function pieceAt(s) { for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].s <= s + 1e-6) return pieces[i]; return pieces[0]; }

// ---------- road meshes (built in chunks as the road is generated, dropped once behind) ----------
const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08 });
const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ff2ff').multiplyScalar(1.6), toneMapped: false });
const chunks = [];
let builtK = 0;
const CH = 64;
const COL_A = new THREE.Color('#b9c3dc'), COL_B = new THREE.Color('#a5b1cf'), COL_SIDE = new THREE.Color('#4b5a86');
function buildChunk(k0, k1) {
  const P = [], N = [], Cc = [], RP = [];
  const v = (arr, p) => arr.push(p.x, p.y, p.z);
  const quad = (a, b, c, d, n, col) => { for (const p of [a, b, c, a, c, d]) { v(P, p); v(N, n); Cc.push(col.r, col.g, col.b); } };
  const rquad = (a, b, c, d) => { for (const p of [a, b, c, a, c, d]) v(RP, p); };
  const pt = (smp, u, h) => new THREE.Vector3().copy(smp.p).addScaledVector(smp.R, u).addScaledVector(smp.U, h);
  for (let k = k0; k < k1; k++) {
    const a = sampleK(k), b = sampleK(k + 1);
    if (!a || !b) continue;
    const prev = sampleK(k - 1);
    const col = Math.floor(k * DS / 3) % 2 ? COL_A : COL_B;
    for (const [u0, u1] of a.solid) {
      const a0 = pt(a, u0, a.fh), b0 = pt(a, u1, a.fh), a1 = pt(b, u0, b.fh), b1 = pt(b, u1, b.fh);
      quad(a0, b0, b1, a1, a.U, col);
      const d0 = pt(a, u0, Math.min(0, a.fh) - THICK), d1 = pt(b, u0, Math.min(0, b.fh) - THICK);
      const e0 = pt(a, u1, Math.min(0, a.fh) - THICK), e1 = pt(b, u1, Math.min(0, b.fh) - THICK);
      quad(a0, a1, d1, d0, _r.copy(a.R).negate(), COL_SIDE);
      quad(b0, e0, e1, b1, a.R, COL_SIDE);
      const covered = (smp, x0, x1) => smp && smp.solid.some(([c0, c1]) => c0 <= x0 + 1e-3 && c1 >= x1 - 1e-3);
      if (!covered(prev, u0, u1)) quad(a0, d0, e0, b0, _r.copy(a.F).negate(), COL_SIDE);
      if (!covered(b, u0, u1)) quad(a1, b1, e1, d1, a.F, COL_SIDE);
      // glowing rails on every edge of the floor
      const lift = 0.02;
      for (const [x0, x1] of [[u0, u0 + 0.12], [u1 - 0.12, u1]]) rquad(pt(a, x0, a.fh + lift), pt(a, x1, a.fh + lift), pt(b, x1, b.fh + lift), pt(b, x0, b.fh + lift));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3));
  const m = new THREE.Mesh(g, roadMat), rm = new THREE.Mesh(rg, railMat);
  m.frustumCulled = rm.frustumCulled = false;
  scene.add(m, rm);
  chunks.push({ k0, k1, m, rm });
}
function ensureRoad(s) {
  while (genS() < s + AHEAD) nextPiece();
  while (builtK + CH + 1 < gen.k) { buildChunk(builtK, builtK + CH); builtK += CH; }
  // forget road far behind
  const dropK = Math.floor((s - BEHIND) / DS) - 4;
  while (chunks.length && chunks[0].k1 < dropK) { const c = chunks.shift(); scene.remove(c.m, c.rm); c.m.geometry.dispose(); c.rm.geometry.dispose(); }
  if (dropK - base > 200) { samples.splice(0, dropK - base); base = dropK; }
  while (blocks.length && blocks[0].s < s - BEHIND) blocks.shift();
  while (pieces.length > 2 && pieces[1].s < s - BEHIND) pieces.shift();
}

// ---------- blocks ----------
function blockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffb347'; g.fillRect(14, 14, 100, 100);
  g.fillStyle = '#ff8c22'; g.fillRect(26, 26, 76, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const blockTex = blockTexture();
const blockMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: blockTex, emissiveMap: blockTex, emissive: '#ffffff', emissiveIntensity: 0.85, roughness: 0.4 }), 400);
blockMesh.frustumCulled = false;
scene.add(blockMesh);
let simT = 0;
const blockU = bk => bk.move ? bk.u + bk.move.A * Math.sin(simT * bk.move.w + bk.move.ph) : bk.u;
const M4 = new THREE.Matrix4(), bF = new THREE.Vector3(), bR = new THREE.Vector3(), bU = new THREE.Vector3(), bP = new THREE.Vector3(), bZ = new THREE.Vector3();
function drawBlocks() {
  let n = 0;
  for (const bk of blocks) {
    if (bk.s > ball.s + AHEAD - 20 || n >= 400) break;
    if (bk.s < ball.s - 8 || !roadFrame(bk.s, bF, bR, bU)) continue;
    const fh = floorAt(bk.s, blockU(bk)) ?? 0;
    roadPoint(bk.s, blockU(bk), fh + bk.h / 2, bP);
    M4.makeBasis(bZ.copy(bR).multiplyScalar(bk.hw * 2), _u.copy(bU).multiplyScalar(bk.h), _r.copy(bF).multiplyScalar(-bk.hd * 2)).setPosition(bP);
    blockMesh.setMatrixAt(n++, M4);
  }
  blockMesh.count = n;
  blockMesh.instanceMatrix.needsUpdate = true;
}

// ---------- ball ----------
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dfe8ff');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1a2a6c'; g.fillRect(0, 112, 512, 32);
  g.fillStyle = '#5ff2ff'; g.fillRect(0, 121, 512, 14);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#1a2a6c'; g.beginPath(); g.arc(64 + i * 128, 60, 16, 0, 7); g.fill(); g.beginPath(); g.arc(64 + i * 128, 196, 16, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.18, metalness: 0.1 }));
scene.add(ballMesh);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 24), new THREE.MeshBasicMaterial({ color: '#0a1230', transparent: true, opacity: 0.4, depthWrite: false }));
scene.add(shadow);
const ball = { s: 0, u: 0, y: 0, vs: 17, vu: 0, vy: 0, grounded: true, overFloor: true, air: 0 };

// crash shards
const shards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 80);
shards.frustumCulled = false; shards.count = 0; scene.add(shards);
const parts = [];
function burst(at, n, cols) {
  for (let i = 0; i < n; i++) parts.push({ p: at.clone(), v: new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).multiplyScalar(rnd(3, 9)), life: rnd(0.6, 1.2), c: new THREE.Color(cols[i % cols.length]) });
}

// ---------- audio ----------
let ac = null, muted = store.get('muted', false), hum = null, humF = null;
function audioInit() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    humF = ac.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 260;
    hum = ac.createGain(); hum.gain.value = 0;
    src.connect(humF).connect(hum).connect(ac.destination); src.start();
  } catch { ac = null; }
}
function tone(f, dur, type = 'sine', vol = 0.1, slide, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  piece: () => tone(1046, 0.06, 'triangle', 0.05),
  pace: () => { tone(523, 0.12, 'triangle', 0.07); tone(784, 0.18, 'triangle', 0.07, null, 0.1); },
  land: v => tone(110, 0.12, 'sine', Math.min(0.2, 0.04 + v * 0.02), 55),
  crash: () => { tone(180, 0.45, 'sawtooth', 0.1, 40); tone(90, 0.6, 'square', 0.05, 30); },
  fall: () => tone(520, 0.9, 'sine', 0.08, 70),
};
function setMute(m) {
  muted = m; store.set('muted', m);
  $('mute').classList.toggle('off', m);
  $('mute').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  if (hum) hum.gain.value = 0;
}

// ---------- input ----------
const keys = new Set(), pointers = new Map();
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'a', 'q'].includes(k)) { keys.add('l'); if (state === 'play') e.preventDefault(); }
  if (['arrowright', 'd'].includes(k)) { keys.add('r'); if (state === 'play') e.preventDefault(); }
  if (k === 'm') { audioInit(); setMute(!muted); }
  if (k === 'p' || k === 'escape') { if (state === 'play') pause(); else if (state === 'paused') resume(); }
  if ((k === ' ' || k === 'enter') && (state === 'menu' || state === 'over')) {
    const a = document.activeElement;
    if (a && a.tagName === 'BUTTON' && !['go', 'again'].includes(a.id)) return;
    e.preventDefault(); startRun();
  } else if ((k === ' ' || k === 'enter') && state === 'paused') { e.preventDefault(); resume(); }
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'a', 'q'].includes(k)) keys.delete('l');
  if (['arrowright', 'd'].includes(k)) keys.delete('r');
});
canvas.addEventListener('pointerdown', e => { pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); });
const lift = e => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
addEventListener('blur', () => { keys.clear(); pointers.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function steerDir() {
  if (window.__slPilot) return window.__slPilot();   // automated tests only
  let d = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
  for (const v of pointers.values()) d += v;
  return clamp(d, -1, 1);
}

// ---------- run ----------
let state = 'menu', score = 0, best = store.get('best', 0), lastPiece = 0, pace = 1, dieT = 0, lastDeath = null, shake = 0;
function resetWorld() {
  for (const c of chunks) { scene.remove(c.m, c.rm); c.m.geometry.dispose(); c.rm.geometry.dispose(); }
  chunks.length = 0; samples = []; base = 0; builtK = 0; pieces = []; blocks = []; simT = 0;
  gen = { k: 0, p: new THREE.Vector3(), yaw: 0, yr: 0, tyr: 0, pitch: -9 * deg, tp: -9 * deg, bank: 0, tb: 0, piece: 0, safe: 0 };
  Object.assign(ball, { s: 6, u: 0, y: 0, vs: vTarget(0), vu: 0, vy: 0, grounded: true, overFloor: true, air: 0 });
  ensureRoad(ball.s);
  score = 0; lastPiece = pieceAt(ball.s).id; pace = 1;
  ballMesh.visible = true; parts.length = 0; shake = 0;
  ballMesh.quaternion.identity();
  placeCamera(1, true);
}
function startRun() {
  audioInit(); if (ac && ac.state === 'suspended') ac.resume();
  resetWorld();
  state = 'play';
  showPanel(null);
  $('hud').hidden = false; $('pauseBtn').hidden = false;
  updateHud();
  clock = performance.now();
}
function endRun(kind) {
  if (state !== 'play') return;
  state = 'dying'; dieT = 0;
  lastDeath = { kind, piece: pieceAt(ball.s).kind, at: Math.round(ball.s), speed: +ball.vs.toFixed(1) };
  if (hum) hum.gain.value = 0;
  if (kind === 'crash') {
    sfx.crash(); ballMesh.visible = false;
    burst(ballMesh.position, reduceMotion ? 20 : 60, ['#ffffff', '#5ff2ff', '#ffb347']);
    if (!reduceMotion) shake = 0.5;
  } else if (kind === 'fall') sfx.fall();
  const isBest = score > best;
  best = Math.max(best, score); store.set('best', best);
  const runs = store.get('runs', 0) + 1; store.set('runs', runs);
  const t = window.Ballpark ? Ballpark.today() : '';
  const tb = store.get('today', { date: '', score: 0 });
  const todayBest = tb.date === t ? Math.max(tb.score || 0, score) : score;
  store.set('today', { date: t, score: todayBest });
  if (window.Ballpark) Ballpark.report(ID, { score: todayBest, label: `${todayBest} pieces` });
  lastResult = { score, isBest, kind, dist: Math.round(ball.s - 6), pace };
}
let lastResult = null;
function showOver() {
  state = 'over';
  $('hud').hidden = true; $('pauseBtn').hidden = true;
  const r = lastResult;
  $('overTitle').textContent = r.kind === 'crash' ? 'CRASHED' : r.kind === 'fall' ? 'OFF THE EDGE' : 'RUN ENDED';
  $('finalScore').textContent = r.score;
  $('overDetail').textContent = `${r.dist} m · pace ${r.pace}`;
  $('bestOver').textContent = r.isBest && r.score > 0 ? 'NEW BEST' : `BEST ${best}`;
  $('bestOver').classList.toggle('new', r.isBest && r.score > 0);
  showPanel('over');
  $('again').focus({ preventScroll: true });
}
function pause() { if (state !== 'play') return; state = 'paused'; if (hum) hum.gain.value = 0; showPanel('paused'); $('resume').focus({ preventScroll: true }); }
function resume() { if (state !== 'paused') return; state = 'play'; showPanel(null); clock = performance.now(); }
function toMenu() { state = 'menu'; $('hud').hidden = true; $('pauseBtn').hidden = true; resetWorld(); refreshMenu(); showPanel('start'); }
function showPanel(id) { for (const p of ['start', 'over', 'paused']) $(p).hidden = p !== id; }
function refreshMenu() { $('bestMenu').textContent = best ? `BEST ${best} PIECES` : 'NO RUNS YET'; }
function updateHud() { $('score').textContent = score; $('speed').textContent = `${Math.round(ball.vs * 3.6)} km/h`; $('pace').textContent = `PACE ${pace}`; }
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}

// ---------- physics (240 Hz) ----------
const SUB = 1 / 240;
function step(dt) {
  simT += dt;
  const b = ball, dir = steerDir();
  // pace: the ball eases up to the current pace speed
  b.vs += (vTarget(b.s) - b.vs) * Math.min(1, 1.2 * dt);
  // sideways: a firm push that settles at ~9 m/s, and strong grip that stops it soon after you let go
  if (b.grounded) {
    const sm = sampleK(Math.floor(b.s / DS));
    const bankPush = sm ? -G * sm.R.y * 0.35 : 0;   // a banked road nudges the ball gently downhill
    b.vu += (dir * STEER - b.vu * (dir ? GRIP_ON : GRIP_OFF) + bankPush) * dt;
  } else b.vu += dir * STEER * AIR_STEER * dt;
  b.s += b.vs * dt;
  b.u += b.vu * dt;
  const fh = floorAt(b.s, b.u);
  if (b.grounded) {
    // follow the floor; leave it only if the floor ends or falls away faster than gravity can pull the ball down
    const yb = b.y + b.vy * dt - 0.5 * G * dt * dt;
    if (fh !== null && yb <= fh + 1e-4) {
      // floor slope here (looking back at the lip of a ramp, where there is no floor ahead)
      const ahead = floorAt(b.s + 0.25, b.u), behind = floorAt(b.s - 0.75, b.u);
      b.vy = ahead !== null ? (ahead - fh) / 0.25 * b.vs : behind !== null ? (fh - behind) / 0.75 * b.vs : 0;
      b.y = fh;
    } else { b.grounded = false; b.y = yb; b.vy -= G * dt; b.air = 0; b.overFloor = fh !== null; }
  } else {
    b.vy -= G * dt; b.y += b.vy * dt; b.air += dt;
    const wasOver = b.overFloor; b.overFloor = fh !== null;
    if (fh !== null && b.y <= fh) {
      if (!wasOver && fh - b.y > FACE) return endRun('crash');   // came in under the edge: hit the face
      if (b.air > 0.12) { sfx.land(-b.vy); if (!reduceMotion) shake = Math.max(shake, Math.min(0.12, -b.vy * 0.012)); }
      b.y = fh; b.vy = 0; b.grounded = true;
    }
  }
  if (b.y < -5) return endRun('fall');
  // blocks: sphere against box in road coordinates
  for (const bk of blocks) {
    if (bk.s > b.s + 2) break;
    if (bk.s < b.s - 2) continue;
    const u = blockU(bk), base0 = floorAt(bk.s, u) ?? 0;
    const cy = b.y + R;
    const dx = Math.max(Math.abs(b.u - u) - bk.hw, 0), dz = Math.max(Math.abs(b.s - bk.s) - bk.hd, 0);
    const dy = Math.max(Math.abs(cy - (base0 + bk.h / 2)) - bk.h / 2, 0);
    if (dx * dx + dy * dy + dz * dz < R * R * 0.85) return endRun('crash');
  }
}

// ---------- camera ----------
const cF = new THREE.Vector3(), cR = new THREE.Vector3(), cU = new THREE.Vector3(), look = new THREE.Vector3(), camPos = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), lF = new THREE.Vector3(), lR = new THREE.Vector3(), lU = new THREE.Vector3();
let camY = 0;
function placeCamera(dt, snap) {
  const b = ball;
  // the camera rides the road just behind the ball, locked to its side-to-side position, and looks down the road
  camY = snap ? b.y : camY + (Math.max(b.y, -1.5) - camY) * Math.min(1, dt * 10);
  const cs = b.s - 3.3;
  if (!roadFrame(cs, cF, cR, cU)) return;
  roadPoint(cs, b.u, camY + 1.3, tmp);
  camPos.copy(tmp);
  roadPoint(b.s + 10, b.u * 0.7, camY + 0.05, look);
  camUp.lerp(lU.copy(Yv).lerp(cU, 0.55).normalize(), snap ? 1 : Math.min(1, dt * 6)).normalize();
  if (state === 'dying' && lastDeath?.kind === 'fall') { camera.lookAt(ballMesh.position); return; }
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmp.set(rnd(-1, 1) * shake, rnd(-1, 1) * shake, 0));
  camera.up.copy(camUp);
  camera.lookAt(look);
  const portrait = Math.max(0, 1 - camera.aspect) * 30;
  const fov = portrait + (reduceMotion ? 66 : 62 + clamp((b.vs - 17) / 17, 0, 1) * 10);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // scenery that rides along with the camera
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  roadFrame(b.s + 40, lF, lR, lU);
  const fh = tmp.set(lF.x, 0, lF.z).normalize();
  // moon hangs off to one side, low over the clouds (not behind the score)
  moon.position.copy(camera.position).addScaledVector(fh, 700).addScaledVector(lR.set(-fh.z, 0, fh.x), 330); moon.position.y += 95; moon.lookAt(camera.position);
  moonHalo.position.copy(moon.position).addScaledVector(fh, 2); moonHalo.lookAt(camera.position);
  clouds.position.set(camera.position.x, camera.position.y - 70, camera.position.z);
  clouds.material.map.offset.set(camera.position.x / 2400 * 10 % 1, -camera.position.z / 2400 * 10 % 1);
  sun.position.copy(ballMesh.position).add(tmp.set(-20, 40, 10)); sun.target.position.copy(ballMesh.position);
}

// ---------- frame ----------
let clock = performance.now();
const spinQ = new THREE.Quaternion(), axis = new THREE.Vector3(), ballPos = new THREE.Vector3();
const perf = { t: 0, n: 0, dropped: false };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - clock) / 1000); clock = now;
  if (state === 'play') {
    const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
    for (let i = 0; i < n && state === 'play'; i++) step(h);
    ensureRoad(ball.s);
    // a point for every new piece of road
    const pc = pieceAt(ball.s);
    if (pc && pc.id > lastPiece) {
      score += pc.id - lastPiece; lastPiece = pc.id; sfx.piece();
      const el = $('score'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
    const p = paceOf(ball.s);
    if (p > pace) { pace = p; toast(`PACE ${pace}`); sfx.pace(); }
    updateHud();
    if (hum && !muted) { hum.gain.value = ball.grounded ? 0.03 + 0.06 * Math.min(1, ball.vs / 34) : 0; humF.frequency.value = 140 + ball.vs * 12; }
    if (!perf.dropped && quality === 'high') {
      perf.t += dt; perf.n++;
      if (perf.t > 3) { if (perf.n / perf.t < 38) { perf.dropped = true; setQuality('low'); } perf.t = 0; perf.n = 0; }
    }
  } else if (state === 'dying') {
    dieT += dt;
    if (lastDeath.kind === 'fall') { ball.vy -= G * dt; ball.y += ball.vy * dt; ball.s += ball.vs * dt * 0.6; ball.u += ball.vu * dt; }
    if (dieT > 1.1) showOver();
  } else if (state === 'menu') simT += dt;
  // ball and shadow
  roadPoint(ball.s, ball.u, ball.y + R, ballPos);
  ballMesh.position.copy(ballPos);
  if (state === 'play' && roadFrame(ball.s, lF, lR, lU)) {
    // shown spin is slower than the real roll (a third), so the stripes read instead of strobing
    axis.crossVectors(lU, tmp.copy(lF).multiplyScalar(ball.vs).addScaledVector(lR, ball.vu));
    const w = axis.length() / R * 0.33;
    if (w > 1e-4) ballMesh.quaternion.premultiply(spinQ.setFromAxisAngle(axis.normalize(), w * dt));
  } else if (state === 'menu') ballMesh.rotateX(-dt * 1.5);
  const fhs = floorAt(ball.s, ball.u);
  shadow.visible = ballMesh.visible && fhs !== null && ball.y - fhs < 4;
  if (shadow.visible) {
    roadFrame(ball.s, lF, lR, lU);
    roadPoint(ball.s, ball.u, fhs + 0.025, shadow.position);
    shadow.quaternion.setFromUnitVectors(tmp.set(0, 0, 1), lU);
    const k = Math.max(0.35, 1 - (ball.y - fhs) * 0.2);
    shadow.scale.setScalar(k); shadow.material.opacity = 0.4 * k;
  }
  drawBlocks();
  // shards
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.v.y -= G * 0.5 * dt; p.p.addScaledVector(p.v, dt);
    M4.compose(p.p, spinQ.identity(), tmp.setScalar(p.life)); shards.setMatrixAt(n, M4); shards.setColorAt(n, p.c); n++;
  }
  shards.count = n; shards.instanceMatrix.needsUpdate = true; if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
  if (shake > 0) shake = Math.max(0, shake - dt * 1.5);
  placeCamera(dt, false);
  if (QUALITY[quality].bloom) composer.render(); else renderer.render(scene, camera);
}

function resize() {
  const pr = Math.min(devicePixelRatio, QUALITY[quality].pr);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(Math.min(pr, 1.5)); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- UI wiring ----------
$('go').addEventListener('click', startRun);
$('again').addEventListener('click', startRun);
$('overMenu').addEventListener('click', toMenu);
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', () => { state = 'play'; endRun('quit'); dieT = 1; });
$('pauseBtn').addEventListener('click', () => { pause(); $('pauseBtn').blur(); });
$('mute').addEventListener('click', () => { audioInit(); setMute(!muted); $('mute').blur(); });
$('quality').addEventListener('click', () => setQuality(quality === 'high' ? 'low' : 'high'));
$('share').addEventListener('click', async () => {
  const r = lastResult; if (!r) return;
  const text = `SKYLANE: ${r.score} pieces, ${r.dist} m, pace ${r.pace}\n${location.href.split('#')[0]}`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch {} ta.remove();
  }
  $('share').textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { $('share').textContent = 'Copy result'; }, 1500);
});

setMute(muted);
setQuality(quality);
resetWorld();
refreshMenu();
requestAnimationFrame(frame);

// test hook (automated checks only)
window.__skylane = {
  get state() { return state; }, get score() { return score; }, get simT() { return simT; }, get lastDeath() { return lastDeath; },
  ball, start: startRun, floorAt, pieceAt, blockU, setQuality,
  blocksNear: (s0, s1) => blocks.filter(bk => bk.s >= s0 && bk.s <= s1),
  fast(sec) { for (let k = 0; k < sec / SUB && state === 'play'; k++) { step(SUB); if (k % 24 === 0) ensureRoad(ball.s); } ensureRoad(ball.s); const pc = pieceAt(ball.s); if (pc.id > lastPiece) { score += pc.id - lastPiece; lastPiece = pc.id; } return state; },
};
