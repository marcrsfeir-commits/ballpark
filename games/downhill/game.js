// DOWNHILL — an endless physics roller. A ball rolls down a three-wide track that curves, tilts and dives:
// holes, red killer tiles, blocks, moving blocks, tunnels laced with red panels, drops and ramps over gaps. Gems and tricks give points; gems buy skins;
// points are XP that level you up (which unlocks skins and trails); goals pay out bonus gems.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SKINS, TRAILS, trailCss, skinThumbs } from './skins.js';
import { makeScenery } from './scenery.js';

const ID = 'downhill';
const store = window.Ballpark ? Ballpark.store(ID) : { get: (k, f) => f, set() {} };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

// ---------- world constants ----------
// The track is a chain of rows. Each row has its own frame (origin O, forward F, right R, up U), so the track can
// curve (yaw), tilt (bank) and climb or dive (pitch). Everything that collides is a 2D segment in the row's
// cross-section (u = sideways, h = up) stretched along the row's length — floor tiles, tunnel walls, ceilings.
const L = 2.2, W = 2.2, LANES = 3, HALF = W * LANES / 2, R = 0.46, G = 30, TH = 0.4, AHEAD = 130, BEHIND = 10;
const DRAG = 0.012;           // air drag: a = -k·|v|·v  → terminal speed sqrt(g·sin(slope)/k)
const ROLL_RES = 0.35;        // rolling resistance (m/s² against motion while touching the ground)
// steering: a hard push against strong sideways grip, so the ball snaps to ~12 m/s sideways and stops dead on release
// SKYLANE-style movement: on the floor the ball holds a set pace down the track and steers with a firm push that
// settles at ~9 m/s sideways and stops quickly on release. Gravity presses it onto the floor and drives jumps and drops.
const STEER = 140, GRIP_ON = 15, GRIP_OFF = 30, AIR_STEER = 0.45, PACE_EASE = 2;
const deg = Math.PI / 180;
const laneU = j => -HALF + W * (j + 0.5);
const PTS = { gem: 10, close: 25, airPerSec: 60, floor: 25 };
const DIFF_DIST = 4500;       // distance (m) at which difficulty is maxed
const SPEED_DIST = 4500;      // distance (m) over which the slope steepens and the speed builds (a few minutes of play)

const ZONES = [
  { name: 'SUNSET STRIP', tile: '#ff3d9a', sky: ['#0d0221', '#3b0a54', '#ff5e7e'], fog: '#6e1a5a', ridge: '#2a0838', rim: '#ff6fb5' },
  { name: 'AMBER DUNES',  tile: '#ffa62e', sky: ['#120417', '#5a1630', '#ff9a3d'], fog: '#7a2e22', ridge: '#2e0c14', rim: '#ffc966' },
  { name: 'ICE CIRCUIT',  tile: '#3fd8ff', sky: ['#010514', '#0b2a55', '#3fb8d9'], fog: '#123f60', ridge: '#04142a', rim: '#8cf0ff' },
  { name: 'LIME STATIC',  tile: '#8dff3d', sky: ['#020a06', '#0d3324', '#59c28a'], fog: '#153f2d', ridge: '#03150c', rim: '#cbff85' },
  { name: 'ULTRAVIOLET',  tile: '#a45cff', sky: ['#05010f', '#26105a', '#c45cff'], fog: '#33166a', ridge: '#0e0424', rim: '#d0a3ff' },
];
const ZONE_ROWS = 280; // ~600 m per zone
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
scene.fog = new THREE.Fog(ZONES[0].fog, 60, 260);
// sky: a dome that rides with the camera, in world space, so it tilts with the view (a flat screen gradient used to
// show a hard edge when the camera pitched down the steep hill). It runs from the zone's night sky, through a glowing
// horizon, into a dark ground haze, with no seams anywhere. Zone colours blend over a couple of seconds.
const skyU = {
  top: { value: new THREE.Color(ZONES[0].sky[0]) }, mid: { value: new THREE.Color(ZONES[0].sky[1]) }, low: { value: new THREE.Color(ZONES[0].sky[2]) },
  ground: { value: new THREE.Color(ZONES[0].ridge) }, glow: { value: new THREE.Color(ZONES[0].tile) },
};
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top, mid, low, ground, glow; varying vec3 vp;
    void main(){
      float h = normalize(vp).y;
      vec3 c = mix(low, mid, smoothstep(0.0, 0.13, h));
      c = mix(c, top, smoothstep(0.13, 0.55, h));
      vec3 g = mix(low * 0.3 + ground * 0.7, ground * 0.35, smoothstep(0.0, -0.2, h));
      c = h < 0.0 ? g : c;
      c += glow * (exp(-abs(h) * 40.0) * 0.22 + exp(-abs(h) * 9.0) * 0.04);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
}));
skyDome.renderOrder = -6; skyDome.frustumCulled = false;
scene.add(skyDome);
// colours the scene is blending toward (set per zone)
const zoneTarget = { top: new THREE.Color(), mid: new THREE.Color(), low: new THREE.Color(), ground: new THREE.Color(), glow: new THREE.Color(),
  fog: new THREE.Color(), ridge0: new THREE.Color(), ridge1: new THREE.Color(), ridge2: new THREE.Color(), grid: new THREE.Color() };

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
sun.renderOrder = -4;
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
  p.renderOrder = -5; scene.add(p); return p;
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
  // the mountains fade out at their feet into the horizon haze, so the bottom of the layer never shows as an edge
  const fill = g.createLinearGradient(0, 40, 0, 256);
  fill.addColorStop(0, 'rgba(154,154,154,1)'); fill.addColorStop(0.55, 'rgba(84,84,84,1)'); fill.addColorStop(1, 'rgba(50,50,50,0)');
  g.fillStyle = fill; g.fill();
  g.beginPath(); for (const [x, yy] of pts) g.lineTo(x, yy);
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.shadowColor = '#fff'; g.shadowBlur = 10; g.stroke();
  const t = texOf(c); t.wrapS = THREE.RepeatWrapping; return t;
}
// three parallax layers, far to near: a pale misty range, a rim-lit range, and a dark near range
const ridges = [[7, 90, 420, 0.5, 210], [11, 70, 330, 0.75, 175], [29, 46, 270, 1, 150]].map(([seed, rough, dist, shade, h], i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1600, h), new THREE.MeshBasicMaterial({ map: ridgeTexture(seed, rough), transparent: true, fog: false, depthWrite: false }));
  m.userData = { dist, shade, h }; m.renderOrder = -3 + i * 0.4; scene.add(m); return m;
});

// glowing grid far below the track
const floorTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(140, 140); t.anisotropy = 8; return t;
})();
const floorFade = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#888'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400),
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
const MAXI = 1800;
const tileMat = new THREE.MeshStandardMaterial({ map: tileDiffuse, emissiveMap: tileEmissive, emissive: 0xffffff, emissiveIntensity: 2.0, roughness: 0.22, metalness: 0.7, envMapIntensity: 0.45 });
// per-instance colour also tints the glowing border
tileMat.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif');
};
tileMat.customProgramCacheKey = () => 'tile-tinted-emissive';
const tileGeo = new RoundedBoxGeometry(1, TH, 1, 3, 0.08);
const tileMesh = new THREE.InstancedMesh(tileGeo, tileMat, MAXI);
tileMesh.frustumCulled = false; tileMesh.receiveShadow = true;
scene.add(tileMesh);

function dangerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c0102c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ff5a3d';
  for (let i = -256; i < 512; i += 72) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 34, 0); g.lineTo(i + 290, 256); g.lineTo(i + 256, 256); g.fill(); }
  g.strokeStyle = '#ff9a8a'; g.lineWidth = 10; g.strokeRect(8, 8, 240, 240);
  return texOf(c);
}
const dangerTex = dangerTexture();
const dangerMat = new THREE.MeshStandardMaterial({ map: dangerTex, emissiveMap: dangerTex, emissive: 0xffffff, emissiveIntensity: 1.15, roughness: 0.3, metalness: 0.3 });
// red killer surfaces: floor tiles and tunnel panels
const redMesh = new THREE.InstancedMesh(tileGeo, dangerMat, MAXI);
redMesh.frustumCulled = false; redMesh.receiveShadow = true;
scene.add(redMesh);
// the floor is drawn as one continuous ribbon: each row's piece ends exactly where the next row's starts, so
// there are no tile gaps or rounded seams, just one smooth surface with glowing side rails
function ribbon(maxQuads, mat) {
  const g = new THREE.BufferGeometry();
  const n = maxQuads * 6;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m);
  return { m, g, n: 0, max: maxQuads };
}
const floorSolid = ribbon(4000, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.18, side: THREE.DoubleSide }));
floorSolid.m.receiveShadow = true;
const floorGlow = ribbon(3000, new THREE.MeshBasicMaterial({ vertexColors: true }));
function quad(rb, p0, p1, p2, p3, nrm, col) {   // p0-p1 near edge, p3-p2 far edge
  if (rb.n >= rb.max) return;
  const P = rb.g.attributes.position.array, N = rb.g.attributes.normal.array, Cc = rb.g.attributes.color.array;
  let k = rb.n * 18;
  for (const p of [p0, p1, p2, p0, p2, p3]) { P[k] = p.x; P[k + 1] = p.y; P[k + 2] = p.z; N[k] = nrm.x; N[k + 1] = nrm.y; N[k + 2] = nrm.z; Cc[k] = col.r; Cc[k + 1] = col.g; Cc[k + 2] = col.b; k += 3; }
  rb.n++;
}
// killer blocks (static and moving)
const OB = { w: W * 0.78, h: 1.15, d: L * 0.5 };
const blockMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(OB.w, OB.h, OB.d, 3, 0.1), dangerMat, 400);
blockMesh.frustumCulled = false; blockMesh.castShadow = true; blockMesh.receiveShadow = true;
scene.add(blockMesh);

// scenery beside the track, all world-vertical and level so the road visibly tilts down past it: neon towers with lit
// windows, setbacks, antennas and beacons; floating rock islands with palms; huge banded pyramids far out; slim
// pylons; and now and then an arch over the road. Each piece is a list of instances made when its row is generated.
const pylonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1a0d24, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.6 }), 200);
pylonMesh.frustumCulled = false; scene.add(pylonMesh);
const kit = makeScenery(scene);
kit.pylon = pylonMesh;
const DEPTH = 34;                // how far below the track things reach (they fade into the haze well before their feet)
function decoFor(r) {
  if (r.tunnel || gen.i < 6) return null;
  const items = [], foot = [];
  const yaw = Math.atan2(r.F.x, -r.F.z), y0 = r.O.y;
  const put = (k, x, y, z, sx, sy, sz, col, ry = yaw) => items.push([k, x, y, z, ry, sx, sy, sz, col]);
  const at = (u, f = L / 2) => worldAt(r, f, u, 0);
  if (gen.i % 46 === 0 && gen.kind !== 'segRamp' && gen.kind !== 'segDrop') {
    // an arch: two pylons with rings and a level glowing beam high over the road
    const top = rnd(7, 9), span = 2 * (HALF + 1.6) + 0.9;
    for (const sd of [-1, 1]) {
      const p = at(sd * (HALF + 1.6)), h = top + DEPTH;
      put('pylon', p.x, p.y + top - h / 2, p.z, 0.9, h, 0.9);
      for (let k = 0; k < 3; k++) put('trim', p.x, p.y + top - 0.15 - k * 3.2, p.z, 1.25, 0.16, 1.25, 'tile');
    }
    const c = at(0);
    put('trim', c.x, c.y + top + 0.25, c.z, span, 0.5, 0.6, 'tile');
    return { items, foot };
  }
  if (gen.i % 4) return null;
  const roll = Math.random(), sd = Math.random() < 0.5 ? -1 : 1;
  if (roll < 0.34) {
    // a tower or two: stacked setbacks, a glowing ledge at each step, an antenna with a red beacon
    for (const side of Math.random() < 0.35 ? [-1, 1] : [sd]) {
      const off = HALF + rnd(12, 40), p = at(side * off);
      let w = rnd(3, 7), dd = w * rnd(0.7, 1.25), yb = p.y - DEPTH;
      const top = p.y + rnd(6, 26) + off * 0.35, n = 1 + Math.floor(Math.random() * 3);
      const ry = yaw + (Math.random() < 0.3 ? Math.PI / 4 : 0);
      for (let k = 0; k < n; k++) {
        const yt = k === n - 1 ? top : yb + (top - yb) * rnd(0.72, 0.85);
        put('tower', p.x, (yb + yt) / 2, p.z, w, yt - yb, dd, 'tile', ry);
        put('trim', p.x, yt + 0.1, p.z, w + 0.3, 0.2, dd + 0.3, 'tile', ry);
        yb = yt; w *= rnd(0.6, 0.8); dd *= rnd(0.6, 0.8);
      }
      const ah = rnd(2, 6);
      put('trim', p.x, top + ah / 2, p.z, 0.14, ah, 0.14, 'rim', ry);
      put('beacon', p.x, top + ah + 0.15, p.z, 0.28, 0.28, 0.28, null);
      foot.push({ x: p.x, z: p.z, r: Math.max(w, dd) * 1.1, y0: p.y - DEPTH, y1: top + ah });
    }
  } else if (roll < 0.6) {
    // a floating rock island with palms, close to the track
    const rI = rnd(1.8, 3), off = HALF + rI + rnd(1.2, 3.5), p = at(sd * off);
    const yt = p.y + rnd(-2.2, 0.8);
    put('island', p.x, yt, p.z, rI, rI * 1.9, rI, null, rnd(0, 6.3));
    put('rim', p.x, yt + 0.02, p.z, rI * 0.98, rI, rI * 0.98, 'tile');
    const np = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < np; k++) {
      const a = rnd(0, 6.3), rr = k ? rnd(0.3, 0.6) * rI : rnd(0, 0.3) * rI, sc = rnd(0.7, 1.1);
      const ry = rnd(0, 6.3);
      put('trunk', p.x + Math.cos(a) * rr, yt, p.z + Math.sin(a) * rr, sc, sc, sc, null, ry);
      put('fronds', p.x + Math.cos(a) * rr, yt, p.z + Math.sin(a) * rr, sc, sc, sc, 'tile', ry);
    }
    foot.push({ x: p.x, z: p.z, r: rI, y0: yt - rI * 2.7, y1: yt + 8 });
  } else if (roll < 0.69) {
    // a huge pyramid far out, with level neon bands
    const S = rnd(18, 40), off = HALF + rnd(45, 90), p = at(sd * off), yb = p.y - rnd(8, 22);
    put('pyramid', p.x, yb, p.z, S, S * 0.75, S, 'tile', yaw + rnd(0, 1.5));
    foot.push({ x: p.x, z: p.z, r: S * 0.72, y0: yb, y1: yb + S * 0.75 });
  } else if (roll < 0.86) {
    // a slim pylon with level rings
    const off = HALF + rnd(2.2, 10), w = rnd(0.6, 1.4), p = at(sd * off), top = rnd(-2, 10) + off * 0.25, h = top + DEPTH;
    put('pylon', p.x, p.y + top - h / 2, p.z, w, h, w);
    const nr = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < nr; k++) put('trim', p.x, p.y + top - 0.15 - k * 3.2, p.z, w + 0.35, 0.16, w + 0.35, 'tile');
    foot.push({ x: p.x, z: p.z, r: w * 0.8, y0: p.y - DEPTH, y1: p.y + top });
  }
  return items.length ? { items, foot } : null;
}
const decoCol = { tile: new THREE.Color(), rim: new THREE.Color() }, white = new THREE.Color(1, 1, 1);
const dQ = new THREE.Quaternion(), dS = new THREE.Vector3(), dP = new THREE.Vector3();
// a piece that a later stretch of track would pass through (curves can swing back) is hidden for good
function blocksTrack(d, j0, j1) {
  for (const f of d.foot) for (let j = j0; j < j1; j++) {
    const rr = row(j); if (!rr) continue;
    const cx = rr.O.x + rr.F.x * L / 2, cz = rr.O.z + rr.F.z * L / 2, cy = rr.O.y;
    if (cy > f.y0 - 2 && cy < f.y1 + 4 && (cx - f.x) ** 2 + (cz - f.z) ** 2 < (f.r + HALF + 0.6) ** 2) return true;
  }
  return false;
}
function drawDeco(ci) {
  const n = {};
  for (const k in kit) n[k] = 0;
  for (let i = ci - BEHIND; i < ci + AHEAD; i++) {
    const r = row(i);
    if (!r || !r.deco || r.deco.hidden) continue;
    // check it against every row of track that exists now (once each)
    const from = r.deco.upTo ?? i - 40, to = gen.i;
    if (to > from) { r.deco.upTo = to; if (blocksTrack(r.deco, Math.max(from, i - 40), to)) { r.deco.hidden = true; continue; } }
    const Z = ZONES[zoneOf(i)];
    decoCol.tile.set(Z.tile).multiplyScalar(1.6); decoCol.rim.set(Z.rim).multiplyScalar(1.4);
    for (const [k, x, y, z, ry, sx, sy, sz, col] of r.deco.items) {
      const m = kit[k];
      if (n[k] >= m.instanceMatrix.count) continue;
      m.setMatrixAt(n[k], M.compose(dP.set(x, y, z), dQ.setFromAxisAngle(Yv, -ry), dS.set(sx, sy, sz)));
      if (m.instanceColor || col) m.setColorAt(n[k], col ? decoCol[col] : white);
      n[k]++;
    }
  }
  for (const k in kit) {
    const m = kit[k]; m.count = n[k]; m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0),
  new THREE.MeshStandardMaterial({ color: 0x3df5c0, emissive: 0x2ee6b4, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.3, flatShading: true }), 400);
gemMesh.frustumCulled = false; gemMesh.castShadow = true;
scene.add(gemMesh);

// ---------- ball, shadow, trail, particles ----------
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshStandardMaterial());
ball.castShadow = true;
scene.add(ball);
let ballMat = null;
// mirror skins see the real world: a small cube camera at the ball renders the scene around it (every frame on HIGH,
// less often on lower settings) and that becomes the ball's reflection
const liveRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
const liveCam = new THREE.CubeCamera(0.35, 700, liveRT);
let liveSkin = false, liveTick = 0, ballExtras = null;
function applySkin(id) {
  const s = SKINS.find(k => k.id === id) || SKINS[0];
  if (ballMat) ballMat.dispose();
  ballMat = s.make();
  ball.material = ballMat;
  if (ballExtras) { ball.remove(ballExtras); ballExtras.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); ballExtras = null; }
  if (s.extras) { ballExtras = new THREE.Group(); s.extras(ballExtras); ballExtras.scale.setScalar(R); ball.add(ballExtras); }
  liveSkin = !!s.live; liveTick = 0;
  if (liveSkin) ballMat.envMap = liveRT.texture;
}
function updateLiveReflection() {
  if (!liveSkin || !ball.visible) return;
  const every = Qs === QUALITY.high ? 1 : Qs === QUALITY.med ? 2 : 4;
  if (liveTick++ % every) return;
  const trailWas = trail.mesh.visible;
  ball.visible = false; trail.mesh.visible = false;
  const blobWas = blob.visible; blob.visible = false;
  liveCam.position.copy(ball.position);
  liveCam.update(renderer, scene);
  liveRT.texture.needsPMREMUpdate = true;
  ball.visible = true; trail.mesh.visible = trailWas; blob.visible = blobWas;
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
const sgn = () => (Math.random() < 0.5 ? -1 : 1);
const Yv = new THREE.Vector3(0, 1, 0);
const difficulty = i => Math.min(1, (i * L) / DIFF_DIST);
// slope steepness at row i sets the cruising speed: ~68 km/h at the top, building gently to ~120 km/h at 4.5 km
// the track falls away steeply: 16 degrees at the top, 30 by 4.5 km. Speed no longer comes from the slope: it is a
// set pace that builds smoothly from ~65 km/h to ~120 km/h, so the steeper hill does not make it faster
const basePitch = i => -(16 + 14 * Math.min(1, i * L / SPEED_DIST)) * deg;
const vTermAt = i => 18 + 15 * Math.min(1, Math.max(0, i) * L / SPEED_DIST);
// obstacle spacing is set in seconds, then turned into rows for the speed the ball will have there
const rowsFor = (sec, min = 2) => Math.max(min, Math.round(sec * vTermAt(gen.i) / L));
const shiftP = sec => Math.min(0.4, L / (vTermAt(gen.i) * sec)); // chance per row the safe lane moves: about once every sec seconds

// tunnel cross-section, counter-clockwise so each panel's inward normal is on its left
const TW = 1.3, TT = 3.4, TC = 4.7;
const TUNNEL = [
  [[HALF, 0], [HALF + TW, TW]],            // 0 right lower slant
  [[HALF + TW, TW], [HALF + TW, TT]],      // 1 right wall
  [[HALF + TW, TT], [HALF, TC]],           // 2 right upper slant
  [[HALF, TC], [-HALF, TC]],               // 3 ceiling
  [[-HALF, TC], [-HALF - TW, TT]],         // 4 left upper slant
  [[-HALF - TW, TT], [-HALF - TW, TW]],    // 5 left wall
  [[-HALF - TW, TW], [-HALF, 0]],          // 6 left lower slant
];

function frameFrom(yaw, pitch, bank) {
  const F = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const R0 = new THREE.Vector3().crossVectors(F, Yv).normalize();
  const U0 = new THREE.Vector3().crossVectors(R0, F).normalize();
  const R = R0.clone().multiplyScalar(Math.cos(bank)).addScaledVector(U0, Math.sin(bank));
  const U = U0.clone().multiplyScalar(Math.cos(bank)).addScaledVector(R0, -Math.sin(bank));
  return { F, R, U };
}
const approach = (v, t, step) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
function stepAngles() {
  gen.yawRate = approach(gen.yawRate, gen.tYaw, 0.22 * deg);
  gen.yaw += gen.yawRate;
  gen.bank = approach(gen.bank, gen.tBank, 1.1 * deg);
  gen.pitch = approach(gen.pitch, gen.tPitch, gen.pitchStep);
}
function worldAt(r, s, u, h, out = new THREE.Vector3()) {
  return out.copy(r.O).addScaledVector(r.F, s).addScaledVector(r.R, u).addScaledVector(r.U, h);
}

// floor: one entry per lane, 0 = hole, 1 = tile, 2 = red killer tile
function pushRow(floor, extra = {}) {
  const fr = frameFrom(gen.yaw, gen.pitch, gen.bank);
  const r = { i: gen.i, kind: gen.kind, O: gen.O.clone(), ...fr, segs: [], blocks: extra.blocks || [], gems: [], tunnel: !!extra.tunnel };
  // neighbouring tiles of the same kind merge into one piece of floor (one surface, no lane seams)
  for (let j = 0; j < LANES;) {
    if (!floor[j]) { j++; continue; }
    let e = j; while (e + 1 < LANES && floor[e + 1] === floor[j]) e++;
    r.segs.push({ a: [-HALF + W * j, 0], b: [-HALF + W * (e + 1), 0], kill: floor[j] === 2, floor: true });
    j = e + 1;
  }
  r.seg = gen.seg;
  if (extra.tunnel) TUNNEL.forEach((sg, k) => r.segs.push({ a: sg[0], b: sg[1], kill: !!extra.tunnel[k], wall: true }));
  const gl = extra.gemLane ?? -1;
  if (gen.gemLeft > 0 && gl >= 0 && floor[gl] === 1 && !r.blocks.some(bk => !bk.move && bk.lane === gl)) {
    r.gems.push({ pos: worldAt(r, L / 2, laneU(gl), 0.85), taken: false });
    gen.gemLeft--;
  }
  r.deco = decoFor(r);
  rows[gen.i++] = r;
  gen.O.addScaledVector(fr.F, L);
  stepAngles();
  return r;
}
function walkSafe(p) {
  const old = gen.safe;
  if (Math.random() < p) gen.safe = clampLane(gen.safe + sgn());
  return [old, gen.safe];
}
const FULL = () => [1, 1, 1];

function pickBend(d) {
  // curves get gentler per metre as speed rises, so they turn about as fast per second as they did at ~110 km/h
  gen.tYaw = Math.random() < 0.22 + 0.45 * d ? sgn() * rnd(0.5, 1.1 + 1.7 * d) * Math.min(1, 31 / vTermAt(gen.i)) * deg : 0;
  gen.tBank = Math.random() < 0.22 + 0.45 * d ? sgn() * rnd(4, 7 + 13 * d) * deg : 0;
  // usually the track leans into a curve (kinder); later on it sometimes leans the wrong way
  if (gen.tYaw && gen.tBank && Math.random() > d * 0.6) gen.tBank = -Math.abs(gen.tBank) * Math.sign(gen.tYaw);
  gen.tPitch = basePitch(gen.i); gen.pitchStep = 2.5 * deg;
}
function segPlain(n) {
  for (let k = 0; k < n; k++) { if (Math.random() < 0.1) walkSafe(1); pushRow(FULL(), { gemLane: gen.safe }); }
}
function segHoles(n, d) {
  const pHole = 0.22 + 0.3 * d, pShift = shiftP(0.42 - 0.12 * d);
  for (let k = 0; k < n; k++) {
    const [a, b2] = walkSafe(pShift);
    const fl = [0, 1, 2].map(l => (l === a || l === b2 || Math.random() > pHole) ? 1 : (d > 0.15 && Math.random() < 0.4 ? 2 : 0));
    pushRow(fl, { gemLane: b2 });
  }
}
function segBlocks(n, d) {
  const pOb = 0.45 + 0.3 * d, every = rowsFor(0.36 - 0.1 * d, 3);
  for (let k = 0; k < n; k++) {
    if (k % every) { pushRow(FULL(), { gemLane: gen.safe }); continue; }
    const [a, b2] = walkSafe(0.35 + 0.15 * d);
    const blocks = [];
    for (let l = 0; l < LANES; l++) if (l !== a && l !== b2 && Math.random() < pOb) blocks.push({ s: L / 2, u: laneU(l), lane: l });
    pushRow(FULL(), { blocks, gemLane: b2 });
  }
}
function segMovers(n, d) {
  // the blocks sweep side to side as a readable wave. Each block's phase is set so that, at the speed the ball
  // arrives, it is only a little further along than the one before: the open side slides smoothly across and you
  // follow it. (A random phase per block made the open side flip every few tenths of a second.)
  const every = rowsFor(0.42 - 0.1 * d, 4), w = 1.2 + 1.4 * d, ph = rnd(0, Math.PI * 2);
  const travel = w * every * L / vTermAt(gen.i), drift = rnd(0.3, 0.45 + 0.25 * d) * sgn();
  n = Math.max(n, every * 4);
  for (let k = 0; k < n; k++) {
    const blocks = [];
    if (k % every === 0) blocks.push({ s: L / 2, u: 0, lane: -1, move: { A: W, w, ph: ph + (k / every) * (drift - travel) } });
    pushRow(FULL(), { blocks, gemLane: k % every ? gen.safe : -1 });
  }
}
function segNarrow(n, d) {
  const width = d < 0.5 ? 2 : (Math.random() < 0.5 ? 1 : 2);
  for (let k = 0; k < n; k++) {
    const [a, b2] = walkSafe(shiftP(width === 1 ? 0.5 : 0.36));
    const fl = [0, 0, 0];
    fl[a] = fl[b2] = 1;
    if (width === 2 && a === b2) fl[clampLane(a + (a === 2 ? -1 : a === 0 ? 1 : sgn()))] = 1;
    pushRow(fl, { gemLane: b2 });
  }
}
function segTunnel(n, d) {
  const ph = irnd(0, 4), lace = 2 + Math.round(d * 2), pSlant = 0.12 + 0.38 * d;
  let slantL = false, slantR = false;
  const blockEvery = rowsFor(0.3, 4);
  for (let k = 0; k < n; k++) {
    const edge = k === 0 || k === n - 1;
    if (Math.random() < 0.25) slantL = Math.random() < pSlant;
    if (Math.random() < 0.25) slantR = Math.random() < pSlant;
    const wallKill = !edge && (k + ph) % 5 < lace;        // walls laced with red panels
    const kill = [slantR && !edge, wallKill, wallKill && d > 0.4, false, wallKill && d > 0.4, wallKill, slantL && !edge];
    const blocks = [];
    if (d > 0.25 && k > 2 && k < n - 2 && k % blockEvery === 0) { const l = clampLane(gen.safe + sgn()); if (l !== gen.safe) blocks.push({ s: L / 2, u: laneU(l), lane: l }); }
    if (k % blockEvery === 1) walkSafe(0.4);
    pushRow(FULL(), { tunnel: kill, blocks, gemLane: gen.safe });
  }
}
function straighten() {
  gen.tYaw = 0; gen.tBank = 0;
  for (let k = 0; k < 24 && (Math.abs(gen.bank) > 1 * deg || Math.abs(gen.yawRate) > 0.05 * deg); k++) pushRow(FULL(), { gemLane: gen.safe });
  gen.bank = 0; gen.yawRate = 0;
}
function segDrop(n, d) {
  // at speed the ball flies a long way off the step, so the track below runs straight under it
  straighten();
  segPlain(2);
  gen.O.y -= rnd(1.8, 3.2);
  segPlain(rowsFor(1.6, 6));   // room to land and line up before the next obstacles (the flight is long at speed)
}
function segRamp(n, d) {
  // straighten out first so the jump is fair
  straighten();
  // how fast will the ball be going here?  terminal speed for this slope
  const vTerm = vTermAt(gen.i);
  gen.tPitch = 17 * deg; gen.pitchStep = 5 * deg;
  let climb = 0;
  for (let k = 0; k < 9 && gen.pitch < 16 * deg; k++) { const r = pushRow(FULL()); climb += Math.max(0, r.F.y * L); }
  const last = rows[gen.i - 1], alpha = Math.asin(last.F.y);
  const vLip = vTerm * 0.97;   // the pace holds up the ramp
  const vSlow = vLip * 0.65, vMid = vLip * 0.85;
  const range = vSlow * vSlow * Math.sin(2 * alpha) / G;
  const gaps = Math.max(1, Math.min(8, Math.floor(0.55 * range / L)));
  const traj = (x, v) => x * Math.tan(alpha) - G * x * x / (2 * v * v * Math.cos(alpha) ** 2);
  const lipY = gen.O.y;
  gen.pitch = 0; gen.tPitch = 0;
  for (let k = 0; k < gaps; k++) {
    const r = pushRow([0, 0, 0]);
    const p = worldAt(r, L / 2, laneU(gen.safe), 0);
    p.y = lipY + R + traj((k + 0.5) * L, vMid);
    r.gems.push({ pos: p, taken: false });
  }
  gen.O.y = lipY + traj(gaps * L, vSlow) - 1.0;
  gen.pitch = gen.tPitch = basePitch(gen.i); gen.pitchStep = 2.5 * deg;
  // a fast ball flies well past the landing (the slope drops away under it), so keep the track clear until it is
  // down and has had a moment to line up: flight time off the kicker measured against the slope, plus 0.6 s
  const th = -basePitch(gen.i), tFly = 2 * vLip * Math.sin(alpha + th) / (G * Math.cos(th));
  segPlain(rowsFor(tFly + 0.6, 9));
}
function nextSegment() {
  const p = gen.i * L, d = difficulty(gen.i);
  gen.gemLeft = Math.random() < 0.6 ? irnd(4, 8) : 0;
  gen.seg++;                      // each section of track is one "floor" (points when you roll onto the next one)
  if (gen.i < 24) { gen.tPitch = basePitch(0); gen.kind = 'start'; return segPlain(24 - gen.i); }
  pickBend(d);
  gen.kind = 'breather';
  segPlain(Math.max(1, Math.round(4 - 3 * d)));
  const opts = p < 260
    ? [[segHoles, 0.32], [segBlocks, 0.32], [segMovers, 0.18], [segRamp, 0.18]]
    : [[segHoles, 0.16], [segBlocks, 0.16], [segMovers, 0.15], [segTunnel, 0.17], [segNarrow, 0.12], [segRamp, 0.15], [segDrop, 0.09]];
  const pick = Math.random();
  let acc = 0;
  const n = irnd(8, 14 + Math.round(10 * d));
  for (const [fn, w] of opts) { acc += w; if (pick <= acc) gen.kind = fn.name; if (pick <= acc) return fn === segTunnel ? fn(n + 6, d) : fn(n, d); }
  segHoles(n, d);
}
function ensureTrack(ci) {
  while (gen.i < ci + AHEAD + 10) nextSegment();
  for (const k in rows) if (+k < ci - BEHIND - 4) delete rows[k];
}

// ---------- drawing the track ----------
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q0 = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z3 = new THREE.Vector3(0, 0, 1);
const C = new THREE.Color(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
let drawnFrom = -1, zoneShown = -1, simT = 0;
function panelMatrix(r, a, b2) {
  const du = b2[0] - a[0], dh = b2[1] - a[1], len = Math.hypot(du, dh);
  vx.copy(r.R).multiplyScalar(du / len).addScaledVector(r.U, dh / len);
  vz.copy(r.F).negate();
  vy.crossVectors(vz, vx);                       // the panel's inward-facing normal
  worldAt(r, L / 2, (a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, P).addScaledVector(vy, -TH / 2);
  M.makeBasis(vx, vy, vz).scale(S.set(len * 0.96, 1, L * 0.97)).setPosition(P);
  return M;
}
const fq = Array.from({ length: 8 }, () => new THREE.Vector3()), tmpE = new THREE.Vector3(), C2 = new THREE.Color();
function drawTrack(ci) {
  if (ci === drawnFrom) return;
  drawnFrom = ci;
  let nt = 0, nr = 0;
  floorSolid.n = 0; floorGlow.n = 0;
  const covers = (rr, a, b2) => rr && rr.segs.some(x => x.floor && !x.kill && x.a[0] <= a + 1e-3 && x.b[0] >= b2 - 1e-3);
  for (let i = ci - BEHIND; i < ci + AHEAD; i++) {
    const r = row(i);
    if (!r) continue;
    const z = ZONES[zoneOf(i)];
    const nx = row(i + 1);
    r.segs.forEach(sg => {
      if (sg.kill) { if (nr < MAXI) redMesh.setMatrixAt(nr++, panelMatrix(r, sg.a, sg.b)); return; }
      if (sg.wall) {
        if (nt >= MAXI) return;
        tileMesh.setMatrixAt(nt, panelMatrix(r, sg.a, sg.b));
        tileMesh.setColorAt(nt, C.set(z.tile).multiplyScalar(0.55));
        nt++; return;
      }
      // continuous floor piece: the far edge is the next row's near edge whenever the two actually meet
      const ua = sg.a[0], ub = sg.b[0];
      const end = (u, out) => { worldAt(r, L, u, 0, out); if (nx) { worldAt(nx, 0, u, 0, tmpE); if (tmpE.distanceToSquared(out) < 0.06) out.copy(tmpE); } return out; };
      const a0 = worldAt(r, 0, ua, 0, fq[0]), b0 = worldAt(r, 0, ub, 0, fq[1]), b1 = end(ub, fq[2]), a1 = end(ua, fq[3]);
      const top = C.set(z.tile).multiplyScalar(0.13);
      quad(floorSolid, a0, b0, b1, a1, r.U, top);
      // body underneath (sides, and front/back faces where the floor starts or stops)
      const dn = vz.copy(r.U).multiplyScalar(-TH);
      const side = C2.set(z.tile).multiplyScalar(0.3);
      quad(floorSolid, a0, a1, fq[4].copy(a1).add(dn), fq[5].copy(a0).add(dn), r.R, side);
      quad(floorSolid, b0, b1, fq[4].copy(b1).add(dn), fq[5].copy(b0).add(dn), r.R, side);
      if (!covers(row(i - 1), ua, ub)) quad(floorSolid, a0, b0, fq[4].copy(b0).add(dn), fq[5].copy(a0).add(dn), r.F, side);
      if (!covers(nx, ua, ub)) quad(floorSolid, a1, b1, fq[4].copy(b1).add(dn), fq[5].copy(a1).add(dn), r.F, side);
      // glowing rails along both edges, and a faint stripe across every few metres so the speed reads
      const lift = vy.copy(r.U).multiplyScalar(0.012), rail = C2.set(z.tile).multiplyScalar(1.4);
      for (const [u0, u1] of [[ua, ua + 0.14], [ub - 0.14, ub]]) {
        quad(floorGlow, worldAt(r, 0, u0, 0, fq[4]).add(lift), worldAt(r, 0, u1, 0, fq[5]).add(lift), end(u1, fq[6]).add(lift), end(u0, fq[7]).add(lift), r.U, rail);
      }
      if (i % 3 === 0) {
        const st = C2.set(z.tile).multiplyScalar(0.45);
        quad(floorGlow, worldAt(r, 0, ua, 0, fq[4]).add(lift), worldAt(r, 0, ub, 0, fq[5]).add(lift), worldAt(r, 0.1, ub, 0, fq[6]).add(lift), worldAt(r, 0.1, ua, 0, fq[7]).add(lift), r.U, st);
      }
    });
  }
  for (const rb of [floorSolid, floorGlow]) {
    rb.g.setDrawRange(0, rb.n * 6);
    for (const k of ['position', 'normal', 'color']) { const at = rb.g.attributes[k]; at.clearUpdateRanges(); at.addUpdateRange(0, rb.n * 18); at.needsUpdate = true; }
  }
  tileMesh.count = nt; redMesh.count = nr;
  tileMesh.instanceMatrix.needsUpdate = true; redMesh.instanceMatrix.needsUpdate = true;
  drawDeco(ci);
  if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
}
const blockU = bk => bk.move ? bk.u + bk.move.A * Math.sin(simT * bk.move.w + bk.move.ph) : bk.u;
function drawDynamic(ci, t) {
  let nb = 0, ng = 0;
  for (let i = ci - 3; i < ci + AHEAD; i++) {
    const r = row(i);
    if (!r) continue;
    for (const bk of r.blocks) {
      if (nb >= 400) break;
      worldAt(r, bk.s, blockU(bk), OB.h / 2, P);
      M.makeBasis(r.R, r.U, vz.copy(r.F).negate()).setPosition(P);
      blockMesh.setMatrixAt(nb++, M);
    }
    for (const g of r.gems) {
      if (g.taken || ng >= 400) continue;
      Q.setFromAxisAngle(Y, t * 2.4 + i);
      P.copy(g.pos); P.y += Math.sin(t * 3 + i) * 0.08;
      M.compose(P, Q, S.set(1, 1.35, 1));
      gemMesh.setMatrixAt(ng++, M);
    }
  }
  blockMesh.count = nb; gemMesh.count = ng;
  blockMesh.instanceMatrix.needsUpdate = true; gemMesh.instanceMatrix.needsUpdate = true;
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
  floor: () => tone(1180, 0.05, 'square', 0.025),
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
const b = { p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), gN: new THREE.Vector3(0, 1, 0), ci: 0, s: 0, grounded: true, lastGround: 0, air: 0, focusY: 0 };
let lastDeath = null, run, startS = 0, dieT = 0, shake = 0, nextMilestone = 500, lastResult = null, gameT = 0;

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
  rows = {}; simT = 0;
  gen = { i: 0, O: new THREE.Vector3(), yaw: 0, yawRate: 0, tYaw: 0, pitch: basePitch(0), tPitch: basePitch(0), pitchStep: 2.5 * deg, bank: 0, tBank: 0, safe: 1, gemLeft: 0, seg: 0 };
  drawnFrom = -1;
  ensureTrack(3);
  const r = row(3);
  b.ci = 3; b.s = L / 2;
  worldAt(r, L / 2, 0, R, b.p);
  b.v.copy(r.F).multiplyScalar(vTermAt(b.ci)); b.w.set(0, 0, 0);
  b.grounded = true; b.lastGround = b.p.y - R; b.air = 0; b.gN.copy(r.U); b.focusY = b.p.y;
  startS = progress();
  camF.copy(r.F); camU.copy(Yv);
  ball.visible = true; parts.length = 0; trail.hist.length = 0;
  run = { bonus: 0, gems: 0, close: 0, maxAir: 0, combo: 0, comboT: 0, passed: new Set(), maxZone: 0, seg: null, floors: 0 };
  nextMilestone = 500;
  applyZone(0, true);
  placeCamera(true);
  drawTrack(b.ci);
}
// ease every scenery colour toward the current zone (k = 1 snaps)
function blendZone(k) {
  const T = zoneTarget;
  skyU.top.value.lerp(T.top, k); skyU.mid.value.lerp(T.mid, k); skyU.low.value.lerp(T.low, k);
  skyU.ground.value.lerp(T.ground, k); skyU.glow.value.lerp(T.glow, k);
  scene.fog.color.lerp(T.fog, k);
  ridges[0].material.color.lerp(T.ridge0, k); ridges[1].material.color.lerp(T.ridge1, k); ridges[2].material.color.lerp(T.ridge2, k);
  floor.material.color.lerp(T.grid, k);
}
function applyZone(z, silent) {
  zoneShown = z;
  const Z = ZONES[z];
  scene.environment = envFor(z);
  const T = zoneTarget;
  T.top.set(Z.sky[0]); T.mid.set(Z.sky[1]); T.low.set(Z.sky[2]); T.ground.set(Z.ridge); T.glow.set(Z.rim);
  T.fog.set(Z.fog);
  T.ridge0.set(Z.ridge).lerp(C.set(Z.sky[2]), 0.45);
  T.ridge1.set(Z.ridge).lerp(C.set(Z.rim), 0.35);
  T.ridge2.set(Z.ridge);
  T.grid.set(Z.tile).multiplyScalar(0.6);
  if (silent) blendZone(1);
  if (!silent) { toast(Z.name, `ZONE ${Math.floor(b.ci / ZONE_ROWS) + 1}`); sfx.ding(); }
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
  lastDeath = { kind, seg: row(b.ci)?.kind, at: Math.round(progress()), speed: +b.v.length().toFixed(1) };
  state = 'dying'; dieT = 0;
  if (rollGain) rollGain.gain.value = 0;
  ui.mult.hidden = true;
  if (kind === 'crash') {
    sfx.crash();
    ball.visible = false;
    const at = b.p.clone();
    burst(at, 60, '#9ff4ff', 12, 7, 1.3, 2.2); burst(at, 40, '#ff3d9a', 10, 6, 1.1, 1.6);
    if (!reduceMotion) shake = 0.6;
  } else if (kind === 'fall') sfx.fall();
  else dieT = 1;

  const prevXp = save.xp, prevLv = levelInfo(prevXp).lv;
  const dist = Math.floor(progress() - startS), score = dist + Math.round(run.bonus);
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
      : lockedLv ? `<span class="price lock">LEVEL ${s.level}</span>`
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
    btn.innerHTML = `<i style="background:${trailCss(t)}"></i>${t.name}<small>${on ? 'ON' : locked ? `LV ${t.level}` : 'USE'}</small>`;
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
  if (window.__dhPilot) return window.__dhPilot();   // automated tests only
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

// ---------- physics ----------
// A rigid ball: gravity, air drag, rolling resistance, sideways grip, momentum, bounces off hard hits,
// and rolling rotation (spin follows the contact). Track surfaces push back only along their normals,
// so slopes, banks, curves, ramps and tunnel walls all fall out of the same contact code.
const SUB = 1 / 240;
const tmpV = new THREE.Vector3(), nW = new THREE.Vector3(), dv = new THREE.Vector3();
const lc = { s: 0, u: 0, h: 0 }, lc2 = { s: 0, u: 0, h: 0 };
function local(r, p, out) { dv.subVectors(p, r.O); out.s = dv.dot(r.F); out.u = dv.dot(r.R); out.h = dv.dot(r.U); return out; }
const progress = () => b.ci * L + Math.max(0, Math.min(L, b.s));
function trackRow() {
  for (let k = 0; k < 6; k++) {
    const r = row(b.ci);
    if (!r) return;
    local(r, b.p, lc);
    if (lc.s > L && row(b.ci + 1)) b.ci++;
    else if (lc.s < 0 && row(b.ci - 1)) b.ci--;
    else break;
  }
  b.s = lc.s;
}

function step(dt) {
  simT += dt;
  const r0 = row(b.ci);
  const dir = steer();
  if (b.grounded && r0 && b.gN.y > 0.3 && b.gN.dot(r0.U) > 0.9) {
    // on the floor: work in the track's own frame (the SKYLANE model). Forward speed eases to the pace, sideways is a
    // firm push against strong grip (a banked track nudges the ball gently downhill), and gravity only presses down.
    let vf = b.v.dot(r0.F), vr = b.v.dot(r0.R), vu = b.v.dot(r0.U);
    vf += (vTermAt(b.ci) - vf) * Math.min(1, PACE_EASE * dt);
    // on a banked track the ball rolls down toward the low side like a real ball (5/7 g sin bank for a rolling
    // sphere), and the grip that stops it on release fades out as the bank steepens, so it keeps rolling that way
    // until you steer against it
    const sb = r0.R.y, gripOff = GRIP_OFF * Math.max(0, 1 - Math.abs(sb) * 8);
    vr += (dir * STEER - vr * (dir ? GRIP_ON : gripOff) - G * sb * (5 / 7)) * dt;
    vu = Math.min(vu, 0) - G * r0.U.y * dt;
    b.v.copy(r0.F).multiplyScalar(vf).addScaledVector(r0.R, vr).addScaledVector(r0.U, vu);
  } else {
    // in the air (or riding a tunnel wall): real gravity and drag, and a little steering
    b.v.y -= G * dt;
    if (r0) {
      const vr = b.v.dot(r0.R);
      if (dir && dir * vr < 9) b.v.addScaledVector(r0.R, dir * STEER * AIR_STEER * dt);   // air steering up to ~9 m/s sideways
    }
    const sp = b.v.length();
    b.v.addScaledVector(b.v, -DRAG * sp * dt);
  }
  b.p.addScaledVector(b.v, dt);
  trackRow();
  // ground height under the ball while it is still above the track (so long, legal flights over steep drops are not
  // mistaken for falling off, and the camera keeps following them)
  const rg = row(b.ci);
  if (rg && Math.abs(lc.u) < HALF + 0.3 && lc.h > -0.3) b.lastGround = b.p.y - rg.U.y * lc.h;

  const wasGrounded = b.grounded;
  b.grounded = false;
  let impact = 0;
  for (let i = b.ci - 1; i <= b.ci + 1; i++) {
    const r = row(i);
    if (!r || !r.segs.length) continue;
    local(r, b.p, lc2);
    if (lc2.s < -R - 0.2 || lc2.s > L + R + 0.2) continue;
    for (const sg of r.segs) {
      const ax = sg.a[0], ah = sg.a[1], du = sg.b[0] - ax, dh = sg.b[1] - ah, l2 = du * du + dh * dh, len = Math.sqrt(l2);
      const t = Math.max(0, Math.min(1, ((lc2.u - ax) * du + (lc2.h - ah) * dh) / l2));
      const eu = lc2.u - (ax + du * t), eh = lc2.h - (ah + dh * t);
      const nu = -dh / len, nh = du / len;
      if (eu * nu + eh * nh < -0.02) continue;                       // surfaces are one-sided
      let es = lc2.s < 0 ? lc2.s : lc2.s > L ? lc2.s - L : 0;
      // a tile's front/back edge only matters next to a hole. Where the next row carries on (tile after tile, tunnel
      // after tunnel) its own surface takes over, so skip the edge: banked rows meet with a few-cm step at the outer
      // lanes, and clipping that corner at 150 km/h used to launch the ball metres into the air.
      if (es !== 0) {
        const nb = row(i + (es > 0 ? 1 : -1));
        if (nb && (sg.wall ? nb.tunnel : nb.segs.some(x => x.floor && x.a[0] <= lc2.u && x.b[0] >= lc2.u))) continue;
      }
      // the far lip of a hole is rounded off: a fast ball that has only dipped a few cm rides up onto the tile
      // instead of clipping its corner and being thrown metres up. One that has really dropped in still hits the face.
      if (es < 0 && sg.floor && eh > R * 0.5) es = 0;
      const d2 = es * es + eu * eu + eh * eh;
      if (d2 >= R * R) continue;
      const dist = Math.sqrt(d2);
      if (dist > 1e-4) nW.copy(r.F).multiplyScalar(es / dist).addScaledVector(r.R, eu / dist).addScaledVector(r.U, eh / dist);
      else nW.copy(r.R).multiplyScalar(nu).addScaledVector(r.U, nh);
      if (sg.kill) { endRun('crash'); return; }
      b.p.addScaledVector(nW, R - dist);                             // push out of the surface
      const vn = b.v.dot(nW);
      if (vn < 0) {                                                   // cancel velocity into it (+ a small bounce on hard hits)
        b.v.addScaledVector(nW, -vn * (1 + (vn < -7 ? 0.25 : 0)));
        impact = Math.max(impact, -vn);
      }
      if (nW.y > 0.3) { b.grounded = true; b.gN.copy(nW); if (sg.floor) b.lastGround = b.p.y - R; }
      local(r, b.p, lc2);
    }
  }
  // stay glued over tiny bumps: a ball that was rolling a moment ago, is still within a few cm of floor that carries
  // on, and is not really moving away from it, keeps rolling instead of skipping. Ramps, drops and holes still launch
  // it, because there the floor ends (or is far below), so the glue never applies.
  if (!b.grounded && wasGrounded) {
    const rr = row(b.ci);
    if (rr) {
      local(rr, b.p, lc2);
      const vn = b.v.dot(rr.U), on = q => q && q.segs.some(x => x.floor && !x.kill && x.a[0] <= lc2.u && x.b[0] >= lc2.u);
      if (lc2.h > R - 0.06 && lc2.h < R + 0.2 && vn < 3.5 && on(rr) && (lc2.s < L - 0.8 || on(row(b.ci + 1)))) {
        b.p.addScaledVector(rr.U, R - lc2.h);
        if (vn > 0) b.v.addScaledVector(rr.U, -vn);
        b.grounded = true; b.gN.copy(rr.U);
      }
    }
  }
  if (b.grounded) b.w.crossVectors(b.gN, b.v).multiplyScalar(1 / R);   // rolling: spin follows the ground

  if (!wasGrounded && b.grounded) {
    if (b.air > 0.18) {
      sfx.land(impact);
      if (!reduceMotion) shake = Math.max(shake, Math.min(0.28, impact * 0.02));
      burst(tmpV.copy(b.p).addScaledVector(b.gN, -R), 10, ZONES[zoneShown].tile, 5, 1.5, 0.5);
      if (b.air > 0.45) {
        const pts = Math.round(b.air * PTS.airPerSec) * mult();
        run.bonus += pts; addCombo();
        popAt(`AIR +${pts}`, 'air', b.p.x, b.p.y + 1, b.p.z);
      }
      run.maxAir = Math.max(run.maxAir, b.air);
    }
  }
  if (wasGrounded && !b.grounded && r0 && b.v.dot(r0.U) > 2.5) sfx.jump();
  b.air = b.grounded ? 0 : b.air + dt;

  // blocks, close calls, gems
  for (let i = b.ci - 1; i <= b.ci + 1; i++) {
    const r = row(i);
    if (!r) continue;
    local(r, b.p, lc2);
    const prevS = lc2.s - b.v.dot(r.F) * dt;
    for (const bk of r.blocks) {
      const u = blockU(bk);
      const dx = Math.max(Math.abs(lc2.u - u) - OB.w / 2, 0);
      const dy = Math.max(Math.abs(lc2.h - OB.h / 2) - OB.h / 2, 0);
      const dz = Math.max(Math.abs(lc2.s - bk.s) - OB.d / 2, 0);
      if (dx * dx + dy * dy + dz * dz < R * R * 0.85) return endRun('crash');
      if (!bk.passed && prevS < bk.s && lc2.s >= bk.s && Math.abs(lc2.u - u) < OB.w / 2 + R + 0.55 && lc2.h < OB.h + 0.6) {
        bk.passed = true; run.close++; addCombo();
        const pts = PTS.close * mult(); run.bonus += pts;
        sfx.close(); popAt(`CLOSE +${pts}`, 'close', b.p.x, b.p.y + 1.1, b.p.z);
      }
    }
    for (const g of r.gems) {
      if (g.taken || g.pos.distanceToSquared(b.p) > (R + 0.45) ** 2) continue;
      g.taken = true; run.gems++; addCombo();
      const pts = PTS.gem * mult(); run.bonus += pts;
      sfx.gem(run.combo);
      burst(g.pos, 14, '#3df5c0', 4, 2.5, 0.55);
      popAt(`+${pts}`, 'gem', g.pos.x, g.pos.y + 0.6, g.pos.z);
    }
  }
  if (b.p.y < b.lastGround - 14) endRun('fall');
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camF = new THREE.Vector3(0, 0, -1), camU = new THREE.Vector3(0, 1, 0);
const tF = new THREE.Vector3(), tU = new THREE.Vector3(), fh = new THREE.Vector3(), focus = new THREE.Vector3();
function placeCamera(snap, dt = 0.016) {
  const r = row(b.ci);
  if (r) {
    // SKYLANE-style: the camera rides the track itself (blended between rows so it never kinks), not the ball's
    // velocity, so steering never swings the view and the hill reads as a steady drop ahead
    const nx = row(b.ci + 1) || r, f = Math.max(0, Math.min(1, b.s / L));
    tF.copy(r.F).lerp(nx.F, f).normalize();
    tU.copy(Yv).lerp(dv.copy(r.U).lerp(nx.U, f), 0.55).normalize();
    const k = snap ? 1 : 1 - Math.exp(-dt * 14);
    camF.lerp(tF, k).normalize();
    camU.lerp(tU, k).normalize();
  }
  // follow height smoothly, and stop following a ball that is falling into the void
  const fy = Math.max(b.p.y, b.lastGround - 3);
  b.focusY = snap ? fy : b.focusY + (fy - b.focusY) * (1 - Math.exp(-dt * 12));
  focus.set(b.p.x, b.focusY, b.p.z);
  // low and tight behind the ball (it fills about a fifth of the screen height), the way the fast slope rollers frame it
  camPos.copy(focus).addScaledVector(camF, -3.3).addScaledVector(camU, 1.3);
  // look at the track 10 m ahead (a touch lower on tall phone screens) so the floor fills the view, not the sky
  camLook.copy(focus).addScaledVector(camF, 10).addScaledVector(camU, -0.4 - 1.1 * Math.max(0, 1 - camera.aspect));
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmpV.set((Math.random() - 0.5) * 2 * shake, (Math.random() - 0.5) * 2 * shake, 0));
  camera.up.copy(camU);
  camera.lookAt(camLook);
  const sp = b.v.length();
  const portrait = Math.max(0, 1 - camera.aspect) * 34; // narrow screens need a taller view to see the whole track
  const fov = portrait + (reduceMotion ? 66 : 64 + Math.max(0, Math.min(1, (sp - 18) / 16)) * 12);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // far scenery rides along, always out in front
  fh.set(camF.x, 0, camF.z).normalize();
  const c = camera.position, yaw = Math.atan2(fh.x, -fh.z);
  skyDome.position.copy(c);
  blendZone(1 - Math.exp(-dt * 1.4));
  sun.position.copy(c).addScaledVector(fh, 380); sun.position.y += 34; sun.lookAt(c);
  stars.position.copy(c);
  for (const m of ridges) {
    m.position.copy(c).addScaledVector(fh, m.userData.dist); m.position.y = c.y + 2 + m.userData.h * 0.06;
    m.lookAt(c.x, m.position.y, c.z);
    m.material.map.offset.x = yaw * 0.08 * m.userData.shade;
  }
  floor.position.set(Math.round(c.x / 10) * 10, b.lastGround - 46, Math.round(c.z / 10) * 10);
  keyLight.position.copy(b.p).addScaledVector(camF, -4); keyLight.position.y += 12; keyLight.position.x -= 3;
  keyLight.target.position.copy(b.p).addScaledVector(camF, 5);
}

// ---------- per-frame effects ----------
function updateTrail(t) {
  if (!trail.mesh.visible) return;
  const h = trail.hist, r = row(b.ci);
  if (state === 'play') { h.unshift(b.p.clone()); if (h.length > TN) h.pop(); }
  const side = r ? r.R : X;
  const pos = trail.mesh.geometry.attributes.position, col = trail.mesh.geometry.attributes.color;
  const show = ball.visible && h.length > 1;
  for (let i = 0; i < TN; i++) {
    const p = h[Math.min(i, h.length - 1)] || b.p;
    const k = Math.max(i / (TN - 1), Math.min(1, p.distanceTo(b.p) / 2.4)), w = R * 0.55 * (1 - k);
    pos.setXYZ(i * 2, p.x - side.x * w, p.y - R * 0.45 - side.y * w, p.z - side.z * w);
    pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y - R * 0.45 + side.y * w, p.z + side.z * w);
    if (trailCols === 'rainbow') C.setHSL((k * 0.9 + t * 0.4) % 1, 1, 0.55);
    else if (trailCols.length) { const f = k * (trailCols.length - 1), j = Math.min(trailCols.length - 2, Math.floor(f)); C.copy(trailCols[j]).lerp(trailCols[j + 1] || trailCols[j], f - j); }
    // the camera now sits close behind the ball, so the trail runs toward the lens: keep it faint near the ball
    const a = show ? Math.pow(1 - k, 2) * 0.45 * (0.15 + 0.85 * Math.min(1, k * 5)) : 0;
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
const camR = new THREE.Vector3();
function updateSpeedLines() {
  const sp = b.v.length(), k = Math.max(0, Math.min(1, (sp - 22) / 12));
  speedLines.mesh.material.opacity = state === 'play' && !reduceMotion ? k * 0.55 : 0;
  if (!speedLines.mesh.material.opacity) return;
  const pos = speedLines.mesh.geometry.attributes.position, c = camera.position;
  camR.crossVectors(camF, camU).normalize();
  const len = 1.5 + sp * 0.12;
  speedLines.seg.forEach((s, i) => {
    const ahead = dv.subVectors(s, c).dot(camF);
    if (ahead < -1 || ahead > 125) s.copy(c).addScaledVector(camF, rnd(30, 110)).addScaledVector(camR, sgn() * rnd(5, 18)).addScaledVector(camU, rnd(-7, 9));
    pos.setXYZ(i * 2, s.x, s.y, s.z);
    pos.setXYZ(i * 2 + 1, s.x - camF.x * len, s.y - camF.y * len, s.z - camF.z * len);
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
const spinQ = new THREE.Quaternion(), axis = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - clock) / 1000);
  clock = now; gameT += dt;
  watchPerf(dt);

  if (state === 'play') {
    const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
    for (let i = 0; i < n && state === 'play'; i++) step(h);
    const wl = b.w.length();
    // shown spin is a third of the true roll rate: at 150 km/h the real rate is a blur that strobes
    if (wl > 1e-4) ball.quaternion.premultiply(spinQ.setFromAxisAngle(axis.copy(b.w).divideScalar(wl), wl * dt * 0.33));
    ensureTrack(b.ci);
    drawTrack(b.ci);
    const z = zoneOf(b.ci);
    run.maxZone = Math.max(run.maxZone, Math.floor(b.ci / ZONE_ROWS));
    if (z !== zoneShown) applyZone(z);
    // points every time you roll onto the next section of floor
    const rs = row(b.ci);
    if (rs && rs.seg !== run.seg) {
      if (run.seg !== null && rs.seg > run.seg) {
        const pts = PTS.floor * mult(); run.bonus += pts; run.floors++;
        popAt(`+${pts}`, 'floor', b.p.x, b.p.y + 1.3, b.p.z); sfx.floor();
        ui.score.classList.remove('bump'); void ui.score.offsetWidth; ui.score.classList.add('bump');
      }
      run.seg = rs.seg;
    }
    const dist = Math.max(0, Math.floor(progress() - startS));
    ui.score.textContent = fmt(dist + run.bonus);
    ui.dist.textContent = `${fmt(dist)} m`;
    ui.gems.textContent = run.gems;
    const sp = b.v.length();
    ui.speed.textContent = `${Math.round(sp * 3.6)} km/h`;
    if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }
    const m = mult();
    ui.mult.hidden = m < 2;
    if (m >= 2) ui.mult.textContent = `x${m} COMBO`;
    if (dist >= nextMilestone) { if (zoneOf(b.ci) === zoneOf(b.ci - 3)) toast(`${fmt(nextMilestone)} m`); sfx.ding(); nextMilestone += 500; }
    if (rollGain && !muted) {
      rollGain.gain.value = b.grounded ? 0.04 + 0.09 * Math.min(1, sp / 36) : 0;
      rollFilter.frequency.value = 160 + sp * 16;
    }
  } else if (state === 'dying') {
    dieT += dt;
    if (ball.visible) { b.v.y -= G * dt; b.p.addScaledVector(b.v, dt); }
    if (dieT > 1.15) showOver();
  } else if (state === 'menu') {
    ball.rotateOnWorldAxis(X, -dt * 1.2);
  }

  ballMat?.userData.update?.(gameT);
  ball.position.copy(b.p);
  ballGlow.position.copy(b.p).addScaledVector(camU, 1.2).addScaledVector(camF, -0.6);
  // contact shadow when real shadows are off
  const r = row(b.ci);
  blob.visible = false;
  if (r && ball.visible && !Qs.shadows) {
    local(r, b.p, lc);
    const lane = Math.floor((lc.u + HALF) / W), sg = r.segs.find(x => x.floor && x.a[0] <= lc.u && x.b[0] > lc.u);
    if (sg && lane >= 0 && lane < LANES && lc.h > 0) {
      const hgt = Math.max(0, lc.h - R), s = Math.max(0.3, 1 - hgt * 0.15);
      worldAt(r, lc.s, lc.u, 0.03, blob.position);
      blob.quaternion.setFromUnitVectors(Z3, r.U);
      blob.scale.set(s, s, s); blob.material.opacity = Math.max(0.15, 1 - hgt * 0.2);
      blob.visible = true;
    }
  }
  drawDynamic(b.ci, gameT);
  updateTrail(gameT);
  updateParticles(dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
  placeCamera(false, dt);
  updateSpeedLines();
  updateLiveReflection();
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
window.__downhill = { kit, applySkin, get state() { return state; }, ball: b, start: startRun, rows: () => rows, save, setQuality, get run() { return run; }, openShop, openGoals, progress, difficulty, row,
  get lastDeath() { return lastDeath; }, get simT() { return simT; },
  fast(sec) { for (let k = 0; k < sec / SUB && state === 'play'; k++) { step(SUB); if (k % 20 === 0) ensureTrack(b.ci); } placeCamera(true); drawTrack(b.ci); return state; } };
