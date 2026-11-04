// DOWNHILL — an endless roller. The ball speeds up on a sloped, procedurally built track:
// holes, blocks, narrow paths, drops and ramps over gaps. Gems and tricks give points; gems buy skins;
// points are XP that level you up (which unlocks skins and trails); goals pay out bonus gems.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SKINS, TRAILS, trailCss, skinThumbs } from './skins.js';

const ID = 'downhill';
const store = window.Ballpark ? Ballpark.store(ID) : { get: (k, f) => f, set() {} };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

// ---------- world constants ----------
const L = 2, W = 1.7, LANES = 5, R = 0.42, G = 34, SLOPE = 0.5, TH = 0.4, AHEAD = 100;
const V0 = 14, ACC = 0.011, VMAX = 44;
const speedAt = p => Math.min(VMAX, V0 + ACC * Math.max(0, p));
const laneX = l => (l - (LANES - 1) / 2) * W;
const laneOf = x => Math.floor((x + LANES * W / 2) / W);
const PTS = { gem: 10, close: 25, airPerSec: 60 };

const ZONES = [
  { name: 'SUNSET STRIP', tile: '#ff3d9a', sky: ['#0d0221', '#3b0a54', '#ff5e7e'], fog: '#6e1a5a', ridge: '#2a0838', rim: '#ff6fb5' },
  { name: 'AMBER DUNES',  tile: '#ffa62e', sky: ['#120417', '#5a1630', '#ff9a3d'], fog: '#7a2e22', ridge: '#2e0c14', rim: '#ffc966' },
  { name: 'ICE CIRCUIT',  tile: '#3fd8ff', sky: ['#010514', '#0b2a55', '#3fb8d9'], fog: '#123f60', ridge: '#04142a', rim: '#8cf0ff' },
  { name: 'LIME STATIC',  tile: '#8dff3d', sky: ['#020a06', '#0d3324', '#59c28a'], fog: '#153f2d', ridge: '#03150c', rim: '#cbff85' },
  { name: 'ULTRAVIOLET',  tile: '#a45cff', sky: ['#05010f', '#26105a', '#c45cff'], fog: '#33166a', ridge: '#0e0424', rim: '#d0a3ff' },
];
const ZONE_ROWS = 300; // 600 m per zone
const zoneOf = i => Math.floor(Math.max(0, i) / ZONE_ROWS) % ZONES.length;

// ---------- save data ----------
const save = {
  bestScore: store.get('bestScore', 0), bestDist: store.get('bestDist', 0), wallet: store.get('wallet', 0), xp: store.get('xp', 0),
  owned: store.get('owned', ['classic']), skin: store.get('skin', 'classic'), trail: store.get('trail', 'mist'),
  goals: store.get('goals', {}), stats: Object.assign({ runs: 0, totalDist: 0, totalGems: 0, maxRunGems: 0, maxAir: 0, maxClose: 0, maxZone: 0 }, store.get('stats', {})),
  quality: store.get('quality', coarse ? 'med' : 'high'),
};
function persist() { for (const k of ['bestScore', 'bestDist', 'wallet', 'xp', 'owned', 'skin', 'trail', 'goals', 'stats', 'quality']) store.set(k, save[k]); }

const xpStep = lv => Math.round(250 * Math.pow(lv, 1.35));
function levelInfo(xp) {
  let lv = 1, left = xp;
  while (left >= xpStep(lv)) { left -= xpStep(lv); lv++; }
  return { lv, into: left, need: xpStep(lv) };
}

const GOALS = [
  { id: 'd500', ic: '🛣️', text: 'Roll 500 m in one run', target: 500, val: s => s.bestDist, reward: 40 },
  { id: 'd1500', ic: '🛣️', text: 'Roll 1,500 m in one run', target: 1500, val: s => s.bestDist, reward: 120 },
  { id: 'd3000', ic: '🛣️', text: 'Roll 3,000 m in one run', target: 3000, val: s => s.bestDist, reward: 300 },
  { id: 's2000', ic: '⭐', text: 'Score 2,000 in one run', target: 2000, val: s => s.bestScore, reward: 100 },
  { id: 's6000', ic: '⭐', text: 'Score 6,000 in one run', target: 6000, val: s => s.bestScore, reward: 350 },
  { id: 'g30', ic: '💎', text: 'Grab 30 gems in one run', target: 30, val: s => s.maxRunGems, reward: 80 },
  { id: 'g500', ic: '💎', text: 'Collect 500 gems in total', target: 500, val: s => s.totalGems, reward: 200 },
  { id: 'air', ic: '🪂', text: 'Stay airborne 1.2 s in one jump', target: 1.2, val: s => s.maxAir, reward: 100, fmt: v => `${Math.min(v, 1.2).toFixed(1)} / 1.2 s` },
  { id: 'close', ic: '😬', text: '8 close calls in one run', target: 8, val: s => s.maxClose, reward: 120 },
  { id: 'runs', ic: '🔁', text: 'Play 15 runs', target: 15, val: s => s.runs, reward: 60 },
  { id: 'total', ic: '🌍', text: 'Roll 20,000 m in total', target: 20000, val: s => s.totalDist, reward: 250 },
  { id: 'ice', ic: '🧊', text: 'Reach the Ice Circuit', target: 2, val: s => s.maxZone, reward: 150, fmt: v => `zone ${Math.min(v, 2) + 1} / 3` },
  { id: 'skins', ic: '🎨', text: 'Own 4 skins', target: 4, val: () => save.owned.length, reward: 150 },
];

// ---------- renderer / scene ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 700);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function gradientCanvas(stops, w = 4, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return c;
}
const texOf = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const skies = ZONES.map(z => texOf(gradientCanvas([[0, z.sky[0]], [0.5, z.sky[1]], [0.86, z.sky[2]], [1, z.sky[2]]])));
scene.background = skies[0];
scene.fog = new THREE.Fog(ZONES[0].fog, 45, 190);

// reflections: a little studio built from the zone's own sky, sun and neon strips
const pmrem = new THREE.PMREMGenerator(renderer);
function envScene(z) {
  const s = new THREE.Scene();
  const c = gradientCanvas([[0, z.sky[0]], [0.35, z.sky[1]], [0.5, z.sky[2]], [0.52, '#12051f'], [1, '#05010a']], 4, 256);
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: texOf(c), side: THREE.BackSide })));
  const sunM = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.1, 1.3) }));
  sunM.position.set(0, 7, -40); s.add(sunM);
  const tint = new THREE.Color(z.tile).multiplyScalar(3);
  for (const [x, y, zz, ry] of [[-30, -4, 0, Math.PI / 2], [30, -4, 0, -Math.PI / 2], [0, -4, 30, Math.PI]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(60, 1.6), new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide }));
    strip.position.set(x, y, zz); strip.rotation.y = ry; s.add(strip);
  }
  const key = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.5), side: THREE.DoubleSide }));
  key.position.set(-10, 30, 10); key.lookAt(0, 0, 0); s.add(key);
  return s;
}
const envCache = {};
function envFor(zi) { return envCache[zi] || (envCache[zi] = pmrem.fromScene(envScene(ZONES[zi]), 0.02).texture); }
scene.environment = envFor(0);

scene.add(new THREE.HemisphereLight(0xffd6f0, 0x2a0d40, 0.45));
const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.5);
keyLight.shadow.mapSize.set(1024, 1024);
Object.assign(keyLight.shadow.camera, { left: -9, right: 9, top: 14, bottom: -14, near: 1, far: 40 });
keyLight.shadow.bias = -0.0006; keyLight.shadow.normalBias = 0.03;
scene.add(keyLight, keyLight.target);
const ballGlow = new THREE.PointLight(0x9ff4ff, 1.6, 5, 2);
scene.add(ballGlow);

// sun
function sunTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const halo = g.createRadialGradient(256, 256, 150, 256, 256, 256);
  halo.addColorStop(0, 'rgba(255,120,170,.55)'); halo.addColorStop(1, 'rgba(255,60,140,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 512, 512);
  g.save(); g.beginPath(); g.arc(256, 256, 160, 0, Math.PI * 2); g.clip();
  const gr = g.createLinearGradient(0, 96, 0, 416);
  gr.addColorStop(0, '#fff8c0'); gr.addColorStop(0.45, '#ffb347'); gr.addColorStop(1, '#ff2d78');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 8; i++) g.fillRect(0, 272 + i * 19, 512, 3 + i * 1.7);
  g.restore();
  return texOf(c);
}
const sun = new THREE.Mesh(new THREE.PlaneGeometry(190, 190),
  new THREE.MeshBasicMaterial({ map: sunTexture(), transparent: true, fog: false, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
sun.renderOrder = -3;
scene.add(sun);

// stars
const stars = (() => {
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.06 + Math.random() * 0.9, r = 500;
    pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
  p.renderOrder = -4; scene.add(p); return p;
})();

// mountain ridges (two parallax layers)
function ridgeTexture(seed, rough) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256;
  const g = c.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = []; let y = 140;
  for (let x = 0; x <= 2048; x += 16) { y += (r() - 0.5) * rough; y = Math.max(40, Math.min(210, y + (150 - y) * 0.05)); pts.push([x, y]); }
  pts[pts.length - 1][1] = pts[0][1];
  g.beginPath(); g.moveTo(0, 256); for (const [x, yy] of pts) g.lineTo(x, yy); g.lineTo(2048, 256); g.closePath();
  const fill = g.createLinearGradient(0, 40, 0, 256); fill.addColorStop(0, '#9a9a9a'); fill.addColorStop(1, '#3a3a3a');
  g.fillStyle = fill; g.fill();
  g.beginPath(); for (const [x, yy] of pts) g.lineTo(x, yy);
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.shadowColor = '#fff'; g.shadowBlur = 10; g.stroke();
  const t = texOf(c); t.wrapS = THREE.RepeatWrapping; return t;
}
const ridges = [[11, 70, 330, 0.75], [29, 46, 270, 1]].map(([seed, rough, dist, shade]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 175), new THREE.MeshBasicMaterial({ map: ridgeTexture(seed, rough), transparent: true, fog: false, depthWrite: false }));
  m.userData = { dist, shade }; m.renderOrder = -2; scene.add(m); return m;
});

// glowing grid far below the track
const floorTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(50, 50); t.anisotropy = 8; return t;
})();
const floorFade = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#888'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500),
  new THREE.MeshBasicMaterial({ map: floorTex, alphaMap: floorFade, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
floor.rotation.x = -Math.PI / 2; floor.renderOrder = -1;
scene.add(floor);

// ---------- track meshes ----------
function tileTextures() {
  const d = document.createElement('canvas'); d.width = d.height = 256;
  const g = d.getContext('2d');
  g.fillStyle = '#1d1d26'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2;
  for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(k * 64, 20); g.lineTo(k * 64, 236); g.moveTo(20, k * 64); g.lineTo(236, k * 64); g.stroke(); }
  const e = document.createElement('canvas'); e.width = e.height = 256;
  const h = e.getContext('2d');
  h.fillStyle = '#000'; h.fillRect(0, 0, 256, 256);
  h.shadowColor = '#fff'; h.shadowBlur = 14; h.strokeStyle = '#fff'; h.lineWidth = 7; h.strokeRect(13, 13, 230, 230);
  h.shadowBlur = 0; h.strokeStyle = 'rgba(255,255,255,.18)'; h.lineWidth = 2; h.strokeRect(44, 44, 168, 168);
  h.fillStyle = '#fff'; for (const [x, y] of [[13, 13], [243, 13], [13, 243], [243, 243]]) { h.beginPath(); h.arc(x, y, 7, 0, 7); h.fill(); }
  const td = texOf(d), te = texOf(e); td.anisotropy = te.anisotropy = 8;
  return [td, te];
}
const [tileDiffuse, tileEmissive] = tileTextures();
const MAXI = 900;
const tileMat = new THREE.MeshStandardMaterial({ map: tileDiffuse, emissiveMap: tileEmissive, emissive: 0xffffff, emissiveIntensity: 2.0, roughness: 0.22, metalness: 0.7, envMapIntensity: 0.45 });
// per-instance colour also tints the glowing border
tileMat.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif');
};
tileMat.customProgramCacheKey = () => 'tile-tinted-emissive';
const tileMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(W * 0.95, TH, 1, 3, 0.08), tileMat, MAXI);
tileMesh.frustumCulled = false; tileMesh.receiveShadow = true;
scene.add(tileMesh);

function blockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c0102c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffd23d';
  for (let i = -256; i < 512; i += 72) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 34, 0); g.lineTo(i + 290, 256); g.lineTo(i + 256, 256); g.fill(); }
  g.strokeStyle = '#1a0008'; g.lineWidth = 16; g.strokeRect(8, 8, 240, 240);
  return texOf(c);
}
const OB = { w: W * 0.78, h: 1.1, d: L * 0.55 };
const blockTex = blockTexture();
const blockMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(OB.w, OB.h, OB.d, 3, 0.1),
  new THREE.MeshStandardMaterial({ map: blockTex, emissiveMap: blockTex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.2 }), MAXI);
blockMesh.frustumCulled = false; blockMesh.castShadow = true; blockMesh.receiveShadow = true;
scene.add(blockMesh);

const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0),
  new THREE.MeshStandardMaterial({ color: 0x3df5c0, emissive: 0x2ee6b4, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.3, flatShading: true }), 400);
gemMesh.frustumCulled = false; gemMesh.castShadow = true;
scene.add(gemMesh);

// ---------- ball, shadow, trail, particles ----------
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshStandardMaterial());
ball.castShadow = true;
scene.add(ball);
let ballMat = null;
function applySkin(id) {
  const s = SKINS.find(k => k.id === id) || SKINS[0];
  if (ballMat) ballMat.dispose();
  ballMat = s.make();
  ball.material = ballMat;
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const blob = new THREE.Mesh(new THREE.PlaneGeometry(R * 3, R * 3), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

const TN = 40;
const trail = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3), 3));
  const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false; scene.add(m);
  return { mesh: m, hist: [] };
})();
let trailCols = [];
function applyTrail(id) {
  const t = TRAILS.find(k => k.id === id) || TRAILS[0];
  trail.mesh.visible = !!t.colors;
  trailCols = t.colors === 'rainbow' ? 'rainbow' : (t.colors || []).map(c => new THREE.Color(c));
  trail.hist.length = 0;
}

const PN = 360;
const partMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), PN);
partMesh.frustumCulled = false; partMesh.count = 0;
partMesh.setColorAt(0, new THREE.Color());
scene.add(partMesh);
const parts = [];
function burst(pos, n, color, spd = 6, up = 3, life = 0.8, size = 1) {
  const c = new THREE.Color(color).multiplyScalar(2.2);
  for (let i = 0; i < n && parts.length < PN; i++) {
    parts.push({ p: pos.clone(), v: new THREE.Vector3((Math.random() - 0.5) * spd, Math.random() * up + up * 0.3, (Math.random() - 0.5) * spd),
      life, max: life, c, s: size * (0.6 + Math.random() * 0.9) });
  }
}

// speed lines
const SL = 140;
const speedLines = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SL * 6), 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.frustumCulled = false; scene.add(m);
  return { mesh: m, seg: Array.from({ length: SL }, () => new THREE.Vector3(0, 0, 1e9)) };
})();

// ---------- track generation ----------
let rows, gen;
const row = i => rows[i];
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const clampLane = l => Math.max(0, Math.min(LANES - 1, l));
const ALL = () => [1, 1, 1, 1, 1];

function pushRow(tiles, obs, dy = -SLOPE, gemLane = -1) {
  const r = { y0: gen.y, y1: gen.y + dy, tiles, obs: obs || [0, 0, 0, 0, 0], gems: [] };
  rows[gen.i++] = r;
  gen.y = r.y1;
  if (gen.gemLeft > 0 && gemLane >= 0 && tiles[gemLane] && !r.obs[gemLane]) {
    r.gems.push({ l: gemLane, y: (r.y0 + r.y1) / 2 + 0.75, taken: false });
    gen.gemLeft--;
  }
  return r;
}
function walkSafe(p) {
  const old = gen.safe;
  if (Math.random() < p) gen.safe = clampLane(gen.safe + (Math.random() < 0.5 ? -1 : 1));
  return [old, gen.safe];
}
function segFull(n) {
  for (let k = 0; k < n; k++) { if (Math.random() < 0.12) walkSafe(1); pushRow(ALL(), null, -SLOPE, gen.safe); }
}
function segHoles(n, d) {
  const pHole = 0.18 + 0.32 * d;
  for (let k = 0; k < n; k++) {
    const [a, b] = walkSafe(0.35);
    pushRow([0, 1, 2, 3, 4].map(l => (l === a || l === b || Math.random() > pHole) ? 1 : 0), null, -SLOPE, b);
  }
}
function segBlocks(n, d) {
  const pOb = 0.22 + 0.33 * d;
  for (let k = 0; k < n; k++) {
    if (k % 2) { pushRow(ALL(), null, -SLOPE, gen.safe); continue; }
    const [a, b] = walkSafe(0.5);
    pushRow(ALL(), [0, 1, 2, 3, 4].map(l => (l !== a && l !== b && Math.random() < pOb) ? 1 : 0), -SLOPE, b);
  }
}
function segNarrow(n, d) {
  const width = d < 0.45 ? 3 : 2;
  for (let k = 0; k < n; k++) {
    const [a, b] = walkSafe(0.28);
    const lo = Math.min(a, b), hi = Math.max(a, b), t = [0, 0, 0, 0, 0];
    for (let l = lo; l <= hi; l++) t[l] = 1;
    let extra = width - (hi - lo + 1), left = lo, right = hi;
    while (extra-- > 0) { if ((Math.random() < 0.5 && left > 0) || right >= LANES - 1) t[--left] = 1; else t[++right] = 1; }
    pushRow(t, null, -SLOPE, b);
  }
}
function segZigzag(n, d) {
  let start = clampLane(Math.min(gen.safe, LANES - 2));
  const every = d < 0.5 ? 4 : 3;
  for (let k = 0; k < n; k++) {
    const t = [0, 0, 0, 0, 0];
    t[start] = t[start + 1] = 1;
    if (k % every === every - 1) {
      start += start === 0 ? 1 : start === LANES - 2 ? -1 : (Math.random() < 0.5 ? -1 : 1);
      t[start] = t[start + 1] = 1;
    }
    pushRow(t, null, -SLOPE, start);
  }
  gen.safe = start + (Math.random() < 0.5 ? 0 : 1);
}
function segDrop() {
  segFull(2);
  gen.y -= rnd(1.6, 2.6);
  segFull(5);
}
function segRamp() {
  segFull(2);
  const RISE = 0.75;
  for (let k = 0; k < 3; k++) pushRow(ALL(), null, RISE, -1);
  const v = speedAt(gen.i * L), vy = v * RISE / L, D = 1.4;
  const t = (vy + Math.sqrt(vy * vy + 2 * G * D)) / G;
  const gaps = Math.max(1, Math.min(6, Math.floor((v * t) / L) - 2));
  const top = gen.y, launchP = gen.i * L, gl = gen.safe;
  for (let k = 0; k < gaps; k++) {
    const r = pushRow([0, 0, 0, 0, 0], null, 0, -1);
    const tt = ((gen.i - 0.5) * L - launchP) / v;   // when the ball passes this row's middle
    r.gems.push({ l: gl, y: top + R + vy * tt - G * tt * tt / 2, taken: false });
  }
  gen.y = top - D;
  rows[gen.i - 1].y1 = gen.y;
  segFull(4);
}
function nextSegment() {
  const p = gen.i * L, d = Math.min(1, p / 2600);
  gen.gemLeft = Math.random() < 0.6 ? irnd(4, 8) : 0;
  if (p < 60) return segFull(6);
  segFull(Math.max(1, Math.round(4 - 3 * d)));
  const pick = Math.random();
  const opts = p < 200
    ? [[segHoles, 0.45], [segBlocks, 0.43], [segRamp, 0.12]]
    : [[segHoles, 0.21], [segBlocks, 0.24], [segNarrow, 0.15], [segZigzag, 0.13], [segRamp, 0.17], [segDrop, 0.1]];
  let acc = 0;
  for (const [fn, w] of opts) { acc += w; if (pick <= acc) return fn(irnd(8, 14 + Math.round(8 * d)), d); }
  segHoles(10, d);
}
function ensureTrack(cur) {
  while (gen.i < cur + AHEAD + 8) nextSegment();
  for (const k in rows) if (+k < cur - 12) delete rows[k];
}
function groundAt(x, p) {
  const i = Math.floor(p / L), r = row(i);
  if (!r) return null;
  const lane = laneOf(x);
  if (lane < 0 || lane >= LANES || !r.tiles[lane]) return null;
  const f = (p - i * L) / L;
  return { y: r.y0 + (r.y1 - r.y0) * f, dy: (r.y1 - r.y0) / L };
}

// ---------- drawing the track ----------
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q0 = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const C = new THREE.Color();
let drawnFrom = -1, zoneShown = -1;
function drawTrack(cur) {
  if (cur === drawnFrom) return;
  drawnFrom = cur;
  let nt = 0, nb = 0;
  for (let i = cur - 8; i < cur + AHEAD; i++) {
    const r = row(i);
    if (!r) continue;
    const dy = r.y1 - r.y0, ang = Math.atan2(dy, L), len = Math.hypot(L, dy);
    Q.setFromAxisAngle(X, ang);
    const ym = (r.y0 + r.y1) / 2, zc = -(i + 0.5) * L, z = ZONES[zoneOf(i)];
    for (let l = 0; l < LANES; l++) {
      if (!r.tiles[l] || nt >= MAXI) continue;
      P.set(laneX(l), ym - Math.cos(ang) * TH / 2, zc - Math.sin(ang) * TH / 2);
      M.compose(P, Q, S.set(1, 1, len * 0.97));
      tileMesh.setMatrixAt(nt, M);
      tileMesh.setColorAt(nt, C.set(z.tile).multiplyScalar((l + i) % 2 ? 1 : 0.8));
      nt++;
      if (r.obs[l] && nb < MAXI) {
        M.compose(P.set(laneX(l), ym + OB.h / 2, zc), Q0, S.set(1, 1, 1));
        blockMesh.setMatrixAt(nb++, M);
      }
    }
  }
  tileMesh.count = nt; blockMesh.count = nb;
  tileMesh.instanceMatrix.needsUpdate = true;
  if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
  blockMesh.instanceMatrix.needsUpdate = true;
}
function drawGems(cur, t) {
  let n = 0;
  for (let i = cur - 2; i < cur + AHEAD && n < 400; i++) {
    const r = row(i);
    if (!r) continue;
    for (const g of r.gems) {
      if (g.taken) continue;
      Q.setFromAxisAngle(Y, t * 2.4 + i);
      M.compose(P.set(laneX(g.l), g.y + Math.sin(t * 3 + i) * 0.08, -(i + 0.5) * L), Q, S.set(1, 1.35, 1));
      gemMesh.setMatrixAt(n++, M);
    }
  }
  gemMesh.count = n;
  gemMesh.instanceMatrix.needsUpdate = true;
}

// ---------- audio ----------
let ac = null, muted = store.get('muted', false), rollGain = null, rollFilter = null;
function audioInit() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    rollFilter = ac.createBiquadFilter(); rollFilter.type = 'lowpass'; rollFilter.frequency.value = 300;
    rollGain = ac.createGain(); rollGain.gain.value = 0;
    src.connect(rollFilter).connect(rollGain).connect(ac.destination);
    src.start();
  } catch { ac = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.15, slideTo, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol = 0.3, freq = 1400) {
  if (!ac || muted) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  s.buffer = buf; g.gain.value = vol; s.connect(f).connect(g).connect(ac.destination); s.start();
}
const sfx = {
  land: v => tone(120, 0.14, 'sine', Math.min(0.25, 0.05 + v * 0.012), 60),
  jump: () => tone(300, 0.25, 'triangle', 0.08, 700),
  gem: k => { const f = 880 * Math.pow(2, Math.min(k, 12) / 12); tone(f, 0.09, 'square', 0.04); tone(f * 1.5, 0.14, 'sine', 0.05, null, 0.05); },
  close: () => noiseBurst(0.25, 0.18, 3000),
  crash: () => { noiseBurst(0.6, 0.45); tone(160, 0.5, 'sawtooth', 0.12, 40); },
  fall: () => tone(500, 0.9, 'triangle', 0.1, 80),
  ding: () => { tone(880, 0.12, 'square', 0.05); tone(1320, 0.18, 'square', 0.05, null, 0.09); },
  buy: () => { tone(660, 0.1, 'triangle', 0.08); tone(990, 0.16, 'triangle', 0.08, null, 0.08); },
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, null, i * 0.11)),
  nope: () => tone(180, 0.18, 'square', 0.06, 120),
};
const muteBtn = document.getElementById('mute');
function setMute(m) {
  muted = m; store.set('muted', m);
  muteBtn.textContent = m ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  if (rollGain) rollGain.gain.value = 0;
}
setMute(muted);
muteBtn.addEventListener('click', () => { audioInit(); setMute(!muted); muteBtn.blur(); });

// ---------- graphics quality ----------
const QUALITY = {
  high: { label: 'HIGH', pr: 2, bloom: true, shadows: true },
  med: { label: 'MEDIUM', pr: 1.5, bloom: true, shadows: false },
  low: { label: 'LOW', pr: 1, bloom: false, shadows: false },
};
let Qs = QUALITY[save.quality] || QUALITY.high;
function setQuality(q, announce) {
  save.quality = q; Qs = QUALITY[q]; persist();
  renderer.shadowMap.enabled = Qs.shadows; keyLight.castShadow = Qs.shadows;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  document.getElementById('qualityLabel').textContent = Qs.label;
  resize();
  if (announce) toast(`GRAPHICS ${Qs.label}`);
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('score'), dist: $('dist'), gems: $('runGems'), speed: $('speed'), mult: $('mult'), pops: $('pops'), toast: $('toast'),
  start: $('start'), over: $('over'), paused: $('paused'), shop: $('shop'), goals: $('goals'), pauseBtn: $('pauseBtn'),
};
const fmt = n => Math.round(n).toLocaleString();
let state = 'menu';
const b = { x: 0, y: 0, p: 0, vx: 0, vy: 0, v: V0, grounded: true, lastGround: 0, air: 0 };
let run, startP = 0, dieT = 0, shake = 0, nextMilestone = 500, lastResult = null, gameT = 0;

function setLevelBar(numEl, barEl, xpEl, xp) {
  const li = levelInfo(xp);
  numEl.dataset.n = li.lv; numEl.textContent = '';
  barEl.style.width = `${(li.into / li.need) * 100}%`;
  xpEl.textContent = `${fmt(li.into)} / ${fmt(li.need)} XP`;
}
function refreshMenu() {
  setLevelBar($('lvlNum'), $('lvlBar'), $('lvlXp'), save.xp);
  for (const id of ['wallet', 'wallet2', 'wallet3']) $(id).textContent = fmt(save.wallet);
  const done = GOALS.filter(g => save.goals[g.id]).length;
  $('goalCount').textContent = `${done}/${GOALS.length}`;
  $('bestStart').textContent = save.bestScore ? `BEST ${fmt(save.bestScore)} PTS · ${fmt(save.bestDist)} m` : '';
  $('qualityLabel').textContent = Qs.label;
}
function showPanel(which) {
  for (const k of ['start', 'over', 'paused', 'shop', 'goals']) ui[k].hidden = k !== which;
}

let toastTimer = 0;
function toast(text, sub) {
  ui.toast.textContent = text;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; ui.toast.append(s); }
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1500);
}
const proj = new THREE.Vector3();
function popAt(text, cls, wx, wy, wz) {
  proj.set(wx, wy, wz).project(camera);
  const el = document.createElement('div');
  el.className = `pop ${cls}`; el.textContent = text;
  el.style.left = `${(proj.x + 1) / 2 * innerWidth}px`;
  el.style.top = `${(1 - proj.y) / 2 * innerHeight}px`;
  ui.pops.append(el);
  setTimeout(() => el.remove(), 950);
}

// ---------- run lifecycle ----------
function resetWorld() {
  rows = {}; gen = { i: 0, y: 0, safe: 2, gemLeft: 0 };
  drawnFrom = -1;
  b.p = L * 2.5; startP = b.p;
  ensureTrack(Math.floor(b.p / L));
  const g = groundAt(0, b.p);
  Object.assign(b, { x: 0, y: g.y + R, vx: 0, vy: 0, v: V0, grounded: true, lastGround: g.y, air: 0 });
  ball.visible = true; parts.length = 0; trail.hist.length = 0;
  run = { bonus: 0, gems: 0, close: 0, maxAir: 0, combo: 0, comboT: 0, passed: new Set(), maxZone: 0 };
  nextMilestone = 500;
  applyZone(0, true);
  placeCamera(true);
  drawTrack(Math.floor(b.p / L));
}
function applyZone(z, silent) {
  zoneShown = z;
  const Z = ZONES[z];
  scene.background = skies[z];
  scene.fog.color.set(Z.fog);
  scene.environment = envFor(z);
  ridges[0].material.color.set(Z.ridge).lerp(C.set(Z.rim), 0.35);
  ridges[1].material.color.set(Z.ridge);
  floor.material.color.set(Z.tile).multiplyScalar(0.6);
  if (!silent) { toast(Z.name, `ZONE ${Math.floor(b.p / L / ZONE_ROWS) + 1}`); sfx.ding(); }
}
function startRun() {
  audioInit();
  if (ac && ac.state === 'suspended') ac.resume();
  resetWorld();
  state = 'play';
  showPanel(null);
  ui.hud.hidden = false; ui.pauseBtn.hidden = false;
  clock = performance.now();
  perf.t = 0; perf.n = 0;
}
const mult = () => 1 + Math.min(4, Math.floor(run.combo / 4));
function addCombo() { run.combo++; run.comboT = 2.6; }

function endRun(kind) {
  if (state !== 'play') return;
  state = 'dying'; dieT = 0;
  if (rollGain) rollGain.gain.value = 0;
  ui.mult.hidden = true;
  if (kind === 'crash') {
    sfx.crash();
    ball.visible = false;
    const at = new THREE.Vector3(b.x, b.y, -b.p);
    burst(at, 60, '#9ff4ff', 12, 7, 1.3, 2.2); burst(at, 40, '#ff3d9a', 10, 6, 1.1, 1.6);
    if (!reduceMotion) shake = 0.6;
  } else if (kind === 'fall') sfx.fall();
  else dieT = 1;

  const prevXp = save.xp, prevLv = levelInfo(prevXp).lv;
  const dist = Math.floor(b.p - startP), score = dist + Math.round(run.bonus);
  const s = save.stats;
  s.runs++; s.totalDist += dist; s.totalGems += run.gems;
  s.maxRunGems = Math.max(s.maxRunGems, run.gems); s.maxAir = Math.max(s.maxAir, run.maxAir); s.maxClose = Math.max(s.maxClose, run.close);
  s.maxZone = Math.max(s.maxZone, run.maxZone);
  const newBest = score > save.bestScore;
  save.bestScore = Math.max(save.bestScore, score); save.bestDist = Math.max(save.bestDist, dist);
  s.bestScore = save.bestScore; s.bestDist = save.bestDist;
  save.wallet += run.gems;
  save.xp += score;
  const lv = levelInfo(save.xp).lv;
  const notes = [];
  let lvGems = 0;
  for (let k = prevLv + 1; k <= lv; k++) lvGems += 25 * k;
  if (lv > prevLv) {
    save.wallet += lvGems;
    const unlocked = [...SKINS.filter(x => x.level > prevLv && x.level <= lv).map(x => `${x.name} skin`), ...TRAILS.filter(x => x.level > prevLv && x.level <= lv).map(x => `${x.name} trail`)];
    notes.push(`⬆️ LEVEL ${lv}! +${lvGems} gems${unlocked.length ? ` · unlocked: ${unlocked.join(', ')}` : ''}`);
  }
  for (const g of GOALS) {
    if (!save.goals[g.id] && g.val(s) >= g.target) { save.goals[g.id] = Date.now(); save.wallet += g.reward; notes.push(`🏆 ${g.text} · +${g.reward} gems`); }
  }
  persist();

  const t = window.Ballpark ? Ballpark.today() : '';
  const tb = store.get('today', { date: '', score: 0 });
  const todayBest = tb.date === t ? Math.max(tb.score || 0, score) : score;
  store.set('today', { date: t, score: todayBest });
  if (window.Ballpark) Ballpark.report(ID, { score: todayBest, label: `${fmt(todayBest)} pts` });

  lastResult = { score, dist, gems: run.gems, bonus: Math.round(run.bonus), prevXp, lvUp: lv > prevLv, notes, newBest, kind };
}
function showOver() {
  state = 'over';
  ui.hud.hidden = true; ui.pauseBtn.hidden = true;
  const r = lastResult;
  $('overTitle').textContent = r.kind === 'crash' ? 'WIPEOUT' : r.kind === 'fall' ? 'FELL OFF' : 'RUN ENDED';
  $('finalScore').textContent = fmt(r.score);
  $('breakdown').innerHTML = `<span><b>${fmt(r.dist)}</b> m</span><span><b>${r.gems}</b> gems</span><span><b>+${fmt(r.bonus)}</b> trick pts</span>`;
  const bo = $('bestOver');
  bo.classList.toggle('new', r.newBest && r.score > 0);
  bo.textContent = r.newBest && r.score > 0 ? 'NEW BEST!' : `BEST ${fmt(save.bestScore)} PTS`;
  $('unlock').hidden = !r.notes.length;
  $('unlock').innerHTML = r.notes.map(n => `<div>${n}</div>`).join('');
  showPanel('over');
  // the XP bar animates from where it was
  const bar = $('lvlBar2');
  bar.style.transition = 'none';
  setLevelBar($('lvlNum2'), bar, $('lvlXp2'), r.prevXp);
  void bar.offsetWidth; bar.style.transition = '';
  if (r.lvUp) {
    bar.style.width = '100%'; sfx.level();
    setTimeout(() => { bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = ''; setLevelBar($('lvlNum2'), bar, $('lvlXp2'), save.xp); }, 950);
  } else requestAnimationFrame(() => setLevelBar($('lvlNum2'), bar, $('lvlXp2'), save.xp));
  refreshMenu();
  $('again').focus({ preventScroll: true });
}
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  if (rollGain) rollGain.gain.value = 0;
  showPanel('paused');
  $('resume').focus({ preventScroll: true });
}
function resume() {
  if (state !== 'paused') return;
  state = 'play'; showPanel(null); clock = performance.now();
}
function toMenu() {
  state = 'menu'; ui.hud.hidden = true; ui.pauseBtn.hidden = true;
  resetWorld(); refreshMenu(); showPanel('start');
}

// ---------- shop & goals ----------
let thumbs = null, shopReturn = 'start';
async function openShop(from) {
  shopReturn = from || 'start';
  showPanel('shop');
  renderShop();
  if (!thumbs) {
    thumbs = {};
    thumbs = await skinThumbs(r => new THREE.PMREMGenerator(r).fromScene(envScene(ZONES[0]), 0.02).texture);
    if (!ui.shop.hidden) renderShop();
  }
}
function renderShop() {
  const lv = levelInfo(save.xp).lv;
  for (const id of ['wallet2']) $(id).textContent = fmt(save.wallet);
  const grid = $('skinGrid'); grid.replaceChildren();
  for (const s of SKINS) {
    const owned = save.owned.includes(s.id), on = save.skin === s.id, lockedLv = lv < s.level;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skin${owned ? ' owned' : ''}${on ? ' on' : ''}${lockedLv && !owned ? ' locked' : ''}`;
    const img = thumbs && thumbs[s.id] ? `<img src="${thumbs[s.id]}" alt="">` : '<div class="ph"></div>';
    const price = on ? '<span class="price">EQUIPPED</span>' : owned ? '<span class="price">OWNED · USE</span>'
      : lockedLv ? `<span class="price lock">🔒 LEVEL ${s.level}</span>`
      : `<span class="price${save.wallet < s.cost ? ' no' : ''}"><i class="gemico"></i>${fmt(s.cost)}</span>`;
    btn.innerHTML = `${img}<b>${s.name}</b>${price}`;
    btn.setAttribute('aria-label', `${s.name} skin, ${on ? 'equipped' : owned ? 'owned' : lockedLv ? `unlocks at level ${s.level}` : `${s.cost} gems`}`);
    btn.addEventListener('click', () => {
      if (owned) { save.skin = s.id; applySkin(s.id); sfx.ding(); }
      else if (lockedLv) { sfx.nope(); toast(`REACH LEVEL ${s.level}`); return; }
      else if (save.wallet < s.cost) { sfx.nope(); toast(`NEED ${fmt(s.cost - save.wallet)} MORE GEMS`); return; }
      else { save.wallet -= s.cost; save.owned.push(s.id); save.skin = s.id; applySkin(s.id); sfx.buy(); toast(s.name.toUpperCase(), 'UNLOCKED'); checkSkinGoal(); }
      persist(); refreshMenu(); renderShop();
      $('skinGrid').children[SKINS.indexOf(s)]?.focus();
    });
    grid.append(btn);
  }
  const tg = $('trailGrid'); tg.replaceChildren();
  for (const t of TRAILS) {
    const locked = lv < t.level, on = save.trail === t.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `trail${on ? ' on' : ''}${locked ? ' locked' : ''}`;
    btn.innerHTML = `<i style="background:${trailCss(t)}"></i>${t.name}<small>${on ? 'ON' : locked ? `🔒 LV ${t.level}` : 'USE'}</small>`;
    btn.addEventListener('click', () => {
      if (locked) { sfx.nope(); toast(`REACH LEVEL ${t.level}`); return; }
      save.trail = t.id; applyTrail(t.id); persist(); sfx.ding(); renderShop();
      $('trailGrid').children[TRAILS.indexOf(t)]?.focus();
    });
    tg.append(btn);
  }
}
function checkSkinGoal() {
  const g = GOALS.find(x => x.id === 'skins');
  if (!save.goals[g.id] && save.owned.length >= g.target) { save.goals[g.id] = Date.now(); save.wallet += g.reward; setTimeout(() => toast('🏆 GOAL DONE', `+${g.reward} GEMS`), 1600); }
}
function openGoals() {
  showPanel('goals');
  const list = $('goalList'); list.replaceChildren();
  const s = Object.assign({}, save.stats, { bestScore: save.bestScore, bestDist: save.bestDist });
  for (const g of GOALS) {
    const v = g.val(s), done = !!save.goals[g.id], pct = Math.min(1, v / g.target);
    const li = document.createElement('li');
    li.className = done ? 'done' : '';
    li.innerHTML = `<span class="ic">${done ? '✅' : g.ic}</span><div><div class="t">${g.text}</div><div class="pb"><i style="width:${pct * 100}%"></i></div>
      <div class="pt">${done ? 'DONE' : g.fmt ? g.fmt(v) : `${fmt(Math.min(v, g.target))} / ${fmt(g.target)}`}</div></div><span class="rw"><i class="gemico"></i>${g.reward}</span>`;
    list.append(li);
  }
  $('goalsBack').focus({ preventScroll: true });
}

// ---------- input ----------
const keys = new Set(), pointers = new Map();
const keyName = k => k === 'arrowleft' ? 'a' : k === 'arrowright' ? 'd' : k;
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) { keys.add(keyName(k)); if (state === 'play') e.preventDefault(); }
  if (k === 'm') { audioInit(); setMute(!muted); }
  if (k === 'p' || k === 'escape') {
    if (state === 'play') pause(); else if (state === 'paused') resume();
    else if (!ui.shop.hidden) $('shopBack').click(); else if (!ui.goals.hidden) $('goalsBack').click();
  }
  if ((k === ' ' || k === 'enter') && (state === 'menu' || state === 'over') && ui.shop.hidden && ui.goals.hidden) {
    const a = document.activeElement;
    if (a && a.tagName === 'BUTTON' && a.id !== 'again' && a.id !== 'go') return;
    e.preventDefault(); startRun();
  }
  if ((k === ' ' || k === 'enter') && state === 'paused' && document.activeElement?.id !== 'quit') { e.preventDefault(); resume(); }
});
addEventListener('keyup', e => keys.delete(keyName(e.key.toLowerCase())));
canvas.addEventListener('pointerdown', e => { pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); });
const lift = e => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
addEventListener('blur', () => { keys.clear(); pointers.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function steer() {
  let d = 0;
  if (keys.has('a')) d -= 1;
  if (keys.has('d')) d += 1;
  for (const v of pointers.values()) d += v;
  return Math.max(-1, Math.min(1, d));
}

$('go').addEventListener('click', startRun);
$('again').addEventListener('click', startRun);
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', () => { state = 'play'; endRun('quit'); });
$('openShop').addEventListener('click', () => openShop('start'));
$('overShop').addEventListener('click', () => openShop('over'));
$('openGoals').addEventListener('click', openGoals);
$('shopBack').addEventListener('click', () => { if (shopReturn === 'over' && state === 'over') showPanel('over'); else { showPanel('start'); refreshMenu(); } });
$('goalsBack').addEventListener('click', () => { showPanel('start'); refreshMenu(); });
$('overMenu').addEventListener('click', toMenu);
$('quality').addEventListener('click', () => setQuality(save.quality === 'high' ? 'med' : save.quality === 'med' ? 'low' : 'high', true));
ui.pauseBtn.addEventListener('click', () => { pause(); ui.pauseBtn.blur(); });
$('share').addEventListener('click', async () => {
  const r = lastResult; if (!r) return;
  const text = `DOWNHILL ⛰️ ${fmt(r.score)} pts · ${fmt(r.dist)} m · ${r.gems} 💎 (level ${levelInfo(save.xp).lv})\n${location.href.split('#')[0]}`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch {} ta.remove();
  }
  $('share').textContent = ok ? 'Copied!' : 'Copy failed';
  setTimeout(() => { $('share').textContent = 'Copy result'; }, 1500);
});

// ---------- simulation ----------
const SUB = 1 / 240;
const tmpV = new THREE.Vector3();
function step(dt) {
  b.v = speedAt(b.p);
  const dir = steer();
  const maxVX = 7 + b.v * 0.14;
  b.vx += (dir * maxVX - b.vx) * Math.min(1, (b.grounded ? 14 : 5) * dt);
  b.x += b.vx * dt;
  const prevP = b.p;
  b.p += b.v * dt;
  b.vy -= G * dt;
  b.y += b.vy * dt;

  const g = groundAt(b.x, b.p);
  const wasGrounded = b.grounded;
  b.grounded = false;
  if (g && b.y - R <= g.y + 0.03 && b.y - R > g.y - 0.7) {
    const impact = -b.vy + g.dy * b.v;
    b.y = g.y + R; b.vy = g.dy * b.v; b.grounded = true; b.lastGround = g.y;
    if (!wasGrounded && b.air > 0.18) {
      sfx.land(impact);
      if (!reduceMotion) shake = Math.max(shake, Math.min(0.25, impact * 0.012));
      burst(tmpV.set(b.x, g.y + 0.05, -b.p), 10, ZONES[zoneShown].tile, 5, 1.5, 0.5);
      if (b.air > 0.45) {
        const pts = Math.round(b.air * PTS.airPerSec) * mult();
        run.bonus += pts; addCombo();
        popAt(`AIR +${pts}`, 'air', b.x, b.y + 1, -b.p);
      }
      run.maxAir = Math.max(run.maxAir, b.air);
    }
  }
  if (wasGrounded && !b.grounded && b.vy > 2) sfx.jump();
  b.air = b.grounded ? 0 : b.air + dt;

  const ci = Math.floor(b.p / L);
  for (let i = ci - 1; i <= ci + 1; i++) {
    const r = row(i);
    if (!r) continue;
    const ym = (r.y0 + r.y1) / 2, cz = (i + 0.5) * L;
    for (const gm of r.gems) {
      if (gm.taken) continue;
      const dx = b.x - laneX(gm.l), dy = b.y - gm.y, dz = b.p - cz;
      if (dx * dx + dy * dy + dz * dz < (R + 0.42) ** 2) {
        gm.taken = true; run.gems++; addCombo();
        const pts = PTS.gem * mult(); run.bonus += pts;
        sfx.gem(run.combo);
        burst(tmpV.set(laneX(gm.l), gm.y, -cz), 14, '#3df5c0', 4, 2.5, 0.55);
        popAt(`+${pts}`, 'gem', laneX(gm.l), gm.y + 0.6, -cz);
      }
    }
    for (let l = 0; l < LANES; l++) {
      if (!r.obs[l]) continue;
      const cx = laneX(l), cy = ym + OB.h / 2;
      const dx = Math.max(Math.abs(b.x - cx) - OB.w / 2, 0);
      const dyy = Math.max(Math.abs(b.y - cy) - OB.h / 2, 0);
      const dz = Math.max(Math.abs(b.p - cz) - OB.d / 2, 0);
      if (dx * dx + dyy * dyy + dz * dz < R * R * 0.8) return endRun('crash');
      // close call: slipped right past it
      const key = i * 8 + l;
      if (prevP < cz && b.p >= cz && !run.passed.has(key) && Math.abs(b.x - cx) < OB.w / 2 + R + 0.45 && b.y < cy + OB.h) {
        run.passed.add(key); run.close++; addCombo();
        const pts = PTS.close * mult(); run.bonus += pts;
        sfx.close(); popAt(`CLOSE +${pts}`, 'close', b.x, b.y + 1.1, -b.p);
      }
    }
  }
  if (b.y < b.lastGround - 9) endRun('fall');
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tp = new THREE.Vector3(), tl = new THREE.Vector3();
function placeCamera(snap, dt = 0.016) {
  tp.set(b.x * 0.55, Math.max(b.y, b.lastGround - 2) + 2.9, -b.p + 6.2);
  tl.set(b.x * 0.75, Math.max(b.y, b.lastGround - 3) + 0.2, -b.p - 10);
  if (snap) { camPos.copy(tp); camLook.copy(tl); }
  else {
    const a = 1 - Math.exp(-dt * 10), ay = 1 - Math.exp(-dt * 6);
    camPos.x += (tp.x - camPos.x) * a; camPos.z = tp.z; camPos.y += (tp.y - camPos.y) * ay;
    camLook.x += (tl.x - camLook.x) * a; camLook.z = tl.z; camLook.y += (tl.y - camLook.y) * ay;
  }
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmpV.set((Math.random() - 0.5) * 2 * shake, (Math.random() - 0.5) * 2 * shake, 0));
  camera.lookAt(camLook);
  const portrait = Math.max(0, 1 - camera.aspect) * 34; // narrow screens need a taller view to see the whole track
  const fov = portrait + (reduceMotion ? 70 : 66 + (b.v - V0) / (VMAX - V0) * 14);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // the far scenery rides along with the camera
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  sun.position.set(cx * 0.9, cy + 34, cz - 380);
  stars.position.set(cx, cy, cz);
  for (const m of ridges) { m.position.set(cx * 0.85, cy - 8 + m.userData.dist * 0.04, cz - m.userData.dist); m.material.map.offset.x = cx * 0.0004 * m.userData.shade; }
  floor.position.set(Math.round(cx / 10) * 10, b.lastGround - 46, Math.round(cz / 10) * 10);
  keyLight.position.set(b.x - 3, b.y + 12, -b.p + 6);
  keyLight.target.position.set(b.x, b.y, -b.p - 5);
}

// ---------- per-frame effects ----------
function updateTrail(t) {
  if (!trail.mesh.visible) return;
  const h = trail.hist;
  if (state === 'play') { h.unshift(new THREE.Vector3(b.x, b.y, -b.p)); if (h.length > TN) h.pop(); }
  const pos = trail.mesh.geometry.attributes.position, col = trail.mesh.geometry.attributes.color;
  const show = ball.visible && h.length > 1;
  for (let i = 0; i < TN; i++) {
    const p = h[Math.min(i, h.length - 1)] || tmpV.set(b.x, b.y, -b.p);
    const back = Math.min(1, (p.z + b.p) / 3.2), k = Math.max(i / (TN - 1), back), w = R * 0.7 * (1 - k);
    pos.setXYZ(i * 2, p.x - w, p.y - R * 0.45, p.z);
    pos.setXYZ(i * 2 + 1, p.x + w, p.y - R * 0.45, p.z);
    if (trailCols === 'rainbow') C.setHSL((k * 0.9 + t * 0.4) % 1, 1, 0.55);
    else if (trailCols.length) { const f = k * (trailCols.length - 1), j = Math.min(trailCols.length - 2, Math.floor(f)); C.copy(trailCols[j]).lerp(trailCols[j + 1] || trailCols[j], f - j); }
    const a = show ? Math.pow(1 - k, 1.8) * 0.75 : 0;
    col.setXYZ(i * 2, C.r * a, C.g * a, C.b * a); col.setXYZ(i * 2 + 1, C.r * a, C.g * a, C.b * a);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
}
function updateParticles(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.v.y -= G * 0.45 * dt; p.p.addScaledVector(p.v, dt);
    const s = p.s * (p.life / p.max);
    M.compose(p.p, Q0, S.set(s, s, s));
    partMesh.setMatrixAt(n, M); partMesh.setColorAt(n, p.c); n++;
  }
  partMesh.count = n;
  partMesh.instanceMatrix.needsUpdate = true;
  if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
}
function updateSpeedLines() {
  const k = Math.max(0, Math.min(1, (b.v - 22) / 18));
  speedLines.mesh.material.opacity = state === 'play' && !reduceMotion ? k * 0.55 : 0;
  if (!speedLines.mesh.material.opacity) return;
  const pos = speedLines.mesh.geometry.attributes.position, cz = camera.position.z, cy = camera.position.y, cx = camera.position.x;
  const len = 1.5 + b.v * 0.12;
  speedLines.seg.forEach((s, i) => {
    if (s.z > cz + 1 || s.z < cz - 120) {
      const side = Math.random() < 0.5 ? -1 : 1;
      s.set(cx + side * rnd(5, 18), cy + rnd(-7, 9), cz - rnd(30, 110));
    }
    pos.setXYZ(i * 2, s.x, s.y, s.z); pos.setXYZ(i * 2 + 1, s.x, s.y, s.z + len);
  });
  pos.needsUpdate = true;
}

// adaptive quality: if the frame rate tanks for a few seconds, step down (at most twice)
const perf = { t: 0, n: 0, drops: 0 };
function watchPerf(dt) {
  if (state !== 'play' || perf.drops >= 2) return;
  perf.t += dt; perf.n++;
  if (perf.t >= 3) {
    const fps = perf.n / perf.t;
    perf.t = 0; perf.n = 0;
    if (fps < 32 && save.quality !== 'low') { perf.drops++; setQuality(save.quality === 'high' ? 'med' : 'low', true); }
  }
}

// ---------- loop ----------
let clock = performance.now();
const rollQ = new THREE.Quaternion(), Z3 = new THREE.Vector3(0, 0, 1);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - clock) / 1000);
  clock = now; gameT += dt;
  watchPerf(dt);

  if (state === 'play') {
    const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
    const bx = b.x, bp = b.p;
    for (let i = 0; i < n && state === 'play'; i++) step(h);
    ball.rotateOnWorldAxis(X, -(b.p - bp) / R);
    ball.quaternion.premultiply(rollQ.setFromAxisAngle(Z3, -(b.x - bx) / R));
    const cur = Math.floor(b.p / L);
    ensureTrack(cur);
    drawTrack(cur);
    const z = zoneOf(cur);
    run.maxZone = Math.max(run.maxZone, Math.floor(cur / ZONE_ROWS));
    if (z !== zoneShown) applyZone(z);
    const dist = Math.floor(b.p - startP);
    ui.score.textContent = fmt(dist + run.bonus);
    ui.dist.textContent = `${fmt(dist)} m`;
    ui.gems.textContent = run.gems;
    ui.speed.textContent = `${Math.round(b.v * 3.6)} km/h`;
    if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }
    const m = mult();
    ui.mult.hidden = m < 2;
    if (m >= 2) ui.mult.textContent = `x${m} COMBO`;
    if (dist >= nextMilestone) { if (zoneOf(cur) === zoneOf(cur - 2)) toast(`${fmt(nextMilestone)} m`); sfx.ding(); nextMilestone += 500; }
    if (rollGain && !muted) {
      rollGain.gain.value = b.grounded ? 0.05 + 0.08 * (b.v - V0) / (VMAX - V0) : 0;
      rollFilter.frequency.value = 180 + b.v * 14;
    }
  } else if (state === 'dying') {
    dieT += dt;
    if (ball.visible) { b.vy -= G * dt; b.y += b.vy * dt; b.p += b.v * dt * 0.5; b.x += b.vx * dt; }
    if (dieT > 1.15) showOver();
  } else if (state === 'menu') {
    ball.rotateOnWorldAxis(X, -dt * 1.2);
  }

  ballMat?.userData.update?.(gameT);
  ball.position.set(b.x, b.y, -b.p);
  ballGlow.position.set(b.x, b.y + 1.2, -b.p + 0.6);
  const g = groundAt(b.x, b.p);
  blob.visible = !!g && ball.visible && !Qs.shadows;
  if (g) {
    const hgt = Math.max(0, b.y - R - g.y), s = Math.max(0.3, 1 - hgt * 0.15);
    blob.position.set(b.x, g.y + 0.02, -b.p); blob.scale.set(s, s, s);
    blob.material.opacity = Math.max(0.15, 1 - hgt * 0.2);
  }
  drawGems(Math.floor(b.p / L), gameT);
  updateTrail(gameT);
  updateParticles(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
  placeCamera(false, dt);
  updateSpeedLines();
  if (Qs.bloom) composer.render(); else renderer.render(scene, camera);
}

function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio, Qs.pr);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(Qs === QUALITY.high ? pr : Math.min(pr, 1));
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
applySkin(save.skin);
applyTrail(save.trail);
setQuality(save.quality);
resetWorld();
refreshMenu();
requestAnimationFrame(frame);
// test hook (used by automated checks only)
window.__downhill = { get state() { return state; }, ball: b, start: startRun, rows: () => rows, save, setQuality, get run() { return run; }, openShop, openGoals };
