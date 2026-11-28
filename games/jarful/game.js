// JARFUL — objects pour into a jar (three.js render + cannon-es physics in a worker); guess how many.
// Physics lives in sim.js and runs in sim-worker.js (falls back to the main thread), on fixed 1/60 s steps that do not
// depend on frame rate or tab visibility. Each round ends with the pile frozen and the count taken from that frozen
// pile, so the answer is always exactly the number of items drawn in the jar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Runner } from './sim.js';
import { ITEMS, KINDS, JARS, JAR_TYPES, capacity, MAX_BODIES } from './catalog.js';

const BP = window.Ballpark;
const store = BP.store('jarful');
const $ = s => document.querySelector(s);
const ACCENTS = ['#a78bfa', '#ff2d6f', '#7ee2c4', '#3fd9f0', '#ffb547'];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = location.search.includes('debug');
const ICON = {
  on: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  up: '<svg class="ic" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.5L11 9.5H1z" fill="currentColor"/></svg>',
  down: '<svg class="ic" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 9.5L1 2.5h10z" fill="currentColor"/></svg>',
  next: '<svg class="ic" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 1.5L9.5 6l-6 4.5z" fill="currentColor"/></svg>',
};

// ---------- three ----------
const view = $('#view');
let renderer;
try {
  // Pixel ratio capped (phones report 3+, which is 9x the fragments for no visible gain); MSAA only where DPR is low.
  const dpr = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
  renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.75, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
} catch (e) {
  console.error('Jarful: WebGL unavailable', e);
  $('#overlay').innerHTML = '<div><div class="k">NO 3D</div><div class="sub">This browser could not start WebGL, so the jar cannot be shown.<br>Try another browser or turn on hardware acceleration.</div></div>';
  $('#overlay').hidden = false;
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
camera.position.set(0, 9, 17);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enablePan: false, enableDamping: true, minDistance: 9, maxDistance: 26, maxPolarAngle: Math.PI * 0.49, autoRotate: !reduce, autoRotateSpeed: 0.7 });
controls.target.set(0, 3, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x20202a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 12, 8); scene.add(sun);
const rim = new THREE.DirectionalLight(0x99aaff, 0.8); rim.position.set(-8, 4, -6); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: 0x0c0c12 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

// Camera distance that fits the whole jar for the current aspect ratio (a tall phone screen needs to be much further
// back than a wide one), so the pile is never cropped and the zoom range scales with it.
let fitDist = 17;
function fitCamera(reset) {
  if (!dims) return;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfW = dims.ext, halfH = dims.Hv / 2 + 1;
  fitDist = Math.max(halfH / t, halfW / (t * camera.aspect)) + dims.ext / 1.45;
  controls.minDistance = fitDist * 0.6; controls.maxDistance = fitDist * 1.6;
  controls.target.set(0, dims.Hv * 0.45, 0);
  const dir = camera.position.clone().sub(controls.target);
  if (reset || dir.lengthSq() < 1e-6) dir.set(0, 0.45, 1);
  const d = reset ? fitDist : THREE.MathUtils.clamp(dir.length(), controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(dir.normalize().multiplyScalar(d));
}
function resize() {
  const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fitCamera(false);
}
addEventListener('resize', resize);

// GPU reset (common on phones under memory pressure): keep the round alive, pause the clock, three rebuilds on restore.
let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; $('#glnote').hidden = false; });
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false; $('#glnote').hidden = true;
  if (mesh) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
});

// ---------- jar + items ----------
let mesh = null, jarGroup = null, spec = null, dims = null;
// Every item is ONE geometry (merged parts, per-vertex colours for fixed details like a duck's beak or candy-corn
// stripes) drawn with one InstancedMesh, so a full jar is still a single draw call. Sizes match sim.js shapeFor().
function painted(g, rgb) {
  g = g.index ? g.toNonIndexed() : g;
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const v = typeof rgb === 'function' ? rgb(pos.getX(i), pos.getY(i), pos.getZ(i)) : rgb; c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function merge(parts) {
  const out = new THREE.BufferGeometry(), names = ['position', 'normal', 'uv', 'color'];
  for (const n of names) {
    const size = parts[0].attributes[n].itemSize, arr = new Float32Array(parts.reduce((s, g) => s + g.attributes[n].count * size, 0));
    let o = 0; for (const g of parts) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  parts.forEach(g => g.dispose());
  return out;
}
const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const W = [1, 1, 1];
// canvas textures (made once, kept for the page's life)
const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[key] = t);
}
// six die faces side by side; opposite faces add up to 7 (+x 1, -x 6, +y 2, -y 5, +z 3, -z 4)
const dieTex = () => canvasTex('die', 768, 128, (x, w, h) => {
  const P = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]] };
  [1, 6, 2, 5, 3, 4].forEach((n, f) => {
    const ox = f * 128;
    x.fillStyle = '#bdb8ad'; x.fillRect(ox, 0, 128, 128);
    x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(ox + 5, 5, 118, 118, 26); x.fill();
    x.fillStyle = '#1b1b22';
    for (const [u, v] of P[n]) { x.beginPath(); x.arc(ox + u * 128, v * 128, n === 1 ? 15 : 11, 0, Math.PI * 2); x.fill(); }
  });
});
const swirlTex = () => canvasTex('swirl', 256, 128, (x, w, h) => {
  x.fillStyle = '#c9c9c9'; x.fillRect(0, 0, w, h);
  for (const [a, ph, lw, col] of [[22, 0, 14, '#ffffff'], [16, 2.1, 7, '#8a8a8a'], [26, 4.2, 10, '#f2f2f2']]) {
    x.strokeStyle = col; x.lineWidth = lw; x.beginPath();
    for (let i = 0; i <= w; i += 4) { const y = h / 2 + Math.sin(i / w * Math.PI * 4 + ph) * a + Math.sin(i / w * Math.PI * 2) * 12; i ? x.lineTo(i, y) : x.moveTo(i, y); }
    x.stroke();
  }
});
const tokenTex = () => canvasTex('token', 128, 128, (x) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#9a9a9a'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#a8a8a8'; x.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 13 : 30, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  x.fill();
});
function itemModel(kind) {
  switch (kind) {
    case 'marble': return { geo: painted(sphere(0.3, 16, 12), W), map: swirlTex() };
    case 'pingpong': return { geo: painted(sphere(0.52, 18, 12), W) };
    case 'egg': {   // narrower at the top, like a real egg
      const g = sphere(1, 16, 12), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) * 0.47, k = 0.36 * (1 - 0.16 * Math.max(0, y / 0.47)); p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k); }
      g.computeVertexNormals(); return { geo: painted(g, W) };
    }
    case 'bean': { const g = new THREE.CapsuleGeometry(0.2, 0.34, 4, 10); g.rotateZ(Math.PI / 2); g.scale(1, 1, 0.85); return { geo: painted(g, W) }; }
    case 'corn': {   // yellow base, orange middle, white tip
      const g = new THREE.ConeGeometry(0.4, 0.8, 14, 16);
      return { geo: painted(g, (x, y) => (y < -0.13 ? [1, 0.6, 0.02] : y < 0.14 ? [0.98, 0.3, 0.02] : [1, 1, 0.95])) };
    }
    case 'token': return { geo: painted(new THREE.CylinderGeometry(0.45, 0.45, 0.16, 6), W), capMap: tokenTex() };
    case 'die': {
      const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (Math.floor(i / 4) + uv.getX(i)) / 6);   // 4 verts per face, faces in +x -x +y -y +z -z order
      return { geo: painted(g, W), map: dieTex() };
    }
    case 'brick': {
      const parts = [painted(new THREE.BoxGeometry(0.96, 0.38, 0.48), W)];
      for (const sx of [-0.36, -0.12, 0.12, 0.36]) for (const sz of [-0.12, 0.12]) { const s = new THREE.CylinderGeometry(0.09, 0.09, 0.09, 10); s.translate(sx, 0.23, sz); parts.push(painted(s, [0.94, 0.94, 0.94])); }
      return { geo: merge(parts) };
    }
    case 'duck': {
      const body = sphere(1, 16, 12); body.scale(0.45, 0.32, 0.33); body.translate(0, -0.02, 0);
      const tail = new THREE.ConeGeometry(0.15, 0.3, 8); tail.rotateZ(0.95); tail.translate(-0.4, 0.14, 0);
      const head = sphere(0.23, 14, 10); head.translate(0.2, 0.36, 0);
      const beak = sphere(0.12, 10, 6); beak.scale(1.3, 0.45, 1); beak.translate(0.43, 0.32, 0);
      const eyes = [-1, 1].map(s => { const e = sphere(0.04, 6, 4); e.translate(0.36, 0.43, s * 0.12); return painted(e, [0.05, 0.05, 0.06]); });
      return { geo: merge([painted(body, W), painted(tail, W), painted(head, W), painted(beak, [1, 0.42, 0.06]), ...eyes]) };
    }
    case 'sweet': {   // a round sweet with a twisted wrapper at each end
      const mid = sphere(1, 14, 10); mid.scale(0.3, 0.25, 0.25);
      const ends = [-1, 1].map(s => { const c = new THREE.ConeGeometry(0.17, 0.24, 8); c.rotateZ(s * Math.PI / 2); c.translate(s * 0.36, 0, 0); return painted(c, W); });
      return { geo: merge([painted(mid, [0.78, 0.78, 0.78]), ...ends]) };
    }
    default: return { geo: painted(sphere(0.42, 18, 12), W) };   // gumball
  }
}
function jarDims(type) {
  const j = JARS[type];
  return { type, ...j, Hv: j.H, ext: j.rect ? Math.hypot(j.Rx, j.Rz) * 1.08 : Math.max(j.R, j.top) * 1.45 };
}
// visual only; the physics walls are in sim.js (same R / top / Rx / Rz / H). Hv can grow past H when a big pile heaps
// above the rim (the physics walls carry on straight up), so every counted item is always inside the drawn glass.
function ring(y, r, mat) {
  const pts = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * r, y, Math.sin(i / 64 * Math.PI * 2) * r));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}
function buildJarVisual(accent) {
  if (jarGroup) { scene.remove(jarGroup); jarGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
  jarGroup = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.55) });
  const d = dims, Hv = d.Hv;
  if (d.rect) {
    const g = new THREE.BoxGeometry(d.Rx * 2, Hv, d.Rz * 2); g.translate(0, Hv / 2, 0);
    jarGroup.add(new THREE.Mesh(g, glass), new THREE.LineSegments(new THREE.EdgesGeometry(g), edge));
    if (d.type === 'tank') {   // dark base and a lip around the top, so it reads as an aquarium
      const base = new THREE.Mesh(new THREE.BoxGeometry(d.Rx * 2 + 0.3, 0.3, d.Rz * 2 + 0.3), new THREE.MeshLambertMaterial({ color: 0x1b1b26 }));
      base.position.y = -0.15;
      const lip = new THREE.BoxGeometry(d.Rx * 2 + 0.16, 0.14, d.Rz * 2 + 0.16); lip.translate(0, Hv, 0);
      jarGroup.add(base, new THREE.LineSegments(new THREE.EdgesGeometry(lip), edge));
    }
  } else {
    // side profile: bottom radius R -> rim radius `top` at H, then straight up if the pile heaped above the rim
    const prof = [new THREE.Vector2(d.R, 0), new THREE.Vector2(d.top, d.H)];
    if (Hv > d.H + 0.01) prof.push(new THREE.Vector2(d.top, Hv));
    if (d.type === 'vase') prof.push(new THREE.Vector2(d.top + 0.35, Hv + 0.25));   // flared lip
    jarGroup.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), glass));
    const rimR = prof[prof.length - 1].x, rimY = prof[prof.length - 1].y;
    jarGroup.add(ring(0.02, d.R, edge), ring(rimY, rimR, edge));
    if (d.type === 'bowl') jarGroup.add(ring(0.02, d.R * 0.7, edge));
    if (d.handle) {   // glass mug handle on the +x side
      const h = new THREE.TorusGeometry(Math.min(1.25, d.H * 0.27), 0.2, 10, 28, Math.PI); h.rotateZ(-Math.PI / 2); h.translate(d.R, d.H * 0.5, 0);
      jarGroup.add(new THREE.Mesh(h, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a2a34, transparent: true, opacity: 0.2, depthWrite: false })));
    }
  }
  jarGroup.renderOrder = 1;
  scene.add(jarGroup);
}

// ---------- physics bridge (worker, or main-thread fallback) ----------
let gen = 0, worker = null, local = null, lastStart = null, latest = null, applied = null, workerOk = false;
function useLocal(why) {
  if (local) return;
  if (why) console.warn('Jarful: physics worker unavailable, running on the main thread:', why);
  try { worker?.terminate(); } catch { /* ignore */ }
  worker = null;
  local = new Runner(onSnap);
  if (lastStart) local.start({ ...lastStart, fast: document.hidden });
}
try {
  worker = new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => { if (e.data.t === 'ready') workerOk = true; else if (e.data.t === 'snap') onSnap(e.data); };
  worker.onerror = e => { e.preventDefault?.(); useLocal(e.message || 'worker error'); };
  setTimeout(() => { if (!workerOk) useLocal('worker did not start'); }, 4000);
} catch (e) { useLocal(e.message); }
function send(m) {
  if (worker) { worker.postMessage(m); return; }
  if (m.t === 'start') local.start(m.cfg); else if (m.t === 'pour') local.pour(m.on);
  else if (m.t === 'finish') local.finish(); else if (m.t === 'fast') { local.fast = m.on; local.wake(); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPouring(false);
  send({ t: 'fast', on: document.hidden });   // hidden tab: finish the drop at full speed instead of stalling
});

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
let spawned = 0;
function applySnap(s) {
  if (!mesh || applied === s) return;
  applied = s;
  const a = s.buf, n = Math.min(s.n, mesh.instanceMatrix.count);
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    p.set(a[o], a[o + 1], a[o + 2]); q.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
    m4.compose(p, q, one); mesh.setMatrixAt(i, m4);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (n > spawned && Math.floor(n / 3) > Math.floor(spawned / 3)) plink(500 + Math.random() * 500);
  spawned = n;
}
function onSnap(s) {
  if (s.gen !== gen) return;   // stale message from a previous jar
  latest = s;
  if (!s.frozen) return;
  applySnap(s);
  if (s.topY > dims.Hv - 0.45) { dims.Hv = s.topY + 0.5; buildJarVisual(spec.accent); fitCamera(false); }
  if (s.removed) console.warn(`Jarful: ${s.removed} item(s) left the jar and were not counted`);
  if (phase === 'dropping') { spec.count = s.n; if (spec.summary) phase = 'shown'; else beginGuess(); }
  else if (phase === 'finishing') { spec.count = s.n; scoreRound(spec.target); }
}

// ---------- round ----------
let phase = 'idle', timeLeft = 15, pouring = false;
const palette = [];
function newJar(cfg) {
  spec = cfg;
  document.documentElement.style.setProperty('--accent', cfg.accent);
  dims = jarDims(cfg.jar);
  buildJarVisual(cfg.accent);
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); [].concat(mesh.material).forEach(m => m.dispose()); mesh.dispose(); }
  const item = ITEMS[cfg.kind], model = itemModel(cfg.kind);
  const matOf = map => new THREE.MeshStandardMaterial({ roughness: item.rough, metalness: item.metal, vertexColors: true, map: map || null, emissive: new THREE.Color(cfg.accent), emissiveIntensity: 0.04 });
  // tokens: plain metal rim, embossed star on both faces (cylinder groups: 0 side, 1 top, 2 bottom)
  const mat = model.capMap ? [matOf(null), matOf(model.capMap), matOf(model.capMap)] : matOf(model.map);
  mesh = new THREE.InstancedMesh(model.geo, mat, Math.max(1, cfg.max));
  if (model.capMap) { const g = mesh.geometry; g.clearGroups(); const per = g.attributes.position.count; const side = 6 * 6; g.addGroup(0, side, 0); g.addGroup(side, (per - side) / 2, 1); g.addGroup(side + (per - side) / 2, (per - side) / 2, 2); }
  // The default bounding sphere is computed once, from whatever instances existed on the first frame (often none),
  // and never updated; three then culls the whole pile whenever that stale sphere leaves the view. That was the
  // "jar empties when I rotate it / my friend never saw anything" bug. The pile is always on screen, so no culling.
  mesh.frustumCulled = false;
  mesh.count = 0;
  palette.length = 0;
  // real colours per item (a few shades of each), picked from the jar's own seeded rng
  const cols = item.colors.map(h => new THREE.Color(h));
  for (let i = 0; i < mesh.instanceMatrix.count; i++) {
    const c = cols[Math.floor(cfg.rand() * cols.length)].clone().offsetHSL(0, 0, (cfg.rand() - 0.5) * 0.06);
    palette.push(c); mesh.setColorAt(i, c);
  }
  scene.add(mesh);
  spawned = 0; latest = null; applied = null; pouring = false;
  fitCamera(true);
  phase = 'dropping';
  gen++;
  lastStart = {
    gen, jar: cfg.jar, kind: cfg.kind, H: dims.H, R: dims.R, top: dims.top, rect: !!dims.rect, Rx: dims.Rx, Rz: dims.Rz, fill: !!cfg.fill,
    count: cfg.fill ? 0 : cfg.count, max: cfg.max, seed: Math.floor(cfg.rand() * 4294967296),
    spawnRate: Math.max(1, cfg.count / (reduce ? 50 : 140)), pourRate: Math.max(8, (cfg.target || 0) / 4), fast: document.hidden,
  };
  send({ t: 'start', cfg: lastStart });
  $('#overlay').hidden = true;
}
function setPouring(on) {
  if (pouring === on) return;
  pouring = on;
  if (phase === 'pour') send({ t: 'pour', on });
  const hold = $('#hold'); if (hold) hold.textContent = on ? 'POURING…' : 'HOLD TO POUR';
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  if (latest && latest !== applied) applySnap(latest);
  if (phase === 'guess' && spec.timed && !contextLost) {
    timeLeft -= dt;
    const s = Math.max(0, Math.ceil(timeLeft));
    $('#timer').textContent = ':' + String(s).padStart(2, '0');
    $('#timer').classList.toggle('low', timeLeft < 5);
    if (s !== loop.lastS && timeLeft < 5 && s > 0) tick();
    loop.lastS = s;
    if (timeLeft <= 0) submitGuess();
  }
  controls.update();
  if (!contextLost) renderer.render(scene, camera);
  if (DEBUG) document.title = `${phase} ${spawned}/${spec?.count} ${Math.ceil(timeLeft)}`;
}
if (DEBUG) window.__jarful = () => ({ phase, kind: spec?.kind, jar: spec?.jar, Hv: dims?.Hv, shown: mesh?.count ?? 0, count: spec?.count, inJar: latest?.frozen ? latest.n : null, removed: latest?.removed ?? 0, topY: latest?.topY, jarH: dims?.Hv, worker: !!worker, frustumCulled: mesh?.frustumCulled, dpr: renderer.getPixelRatio(), steps: latest?.steps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
resize();
requestAnimationFrame(loop);

// ---------- modes ----------
let mode = 'daily', round = 0, results = [], streak = 0, dailyDone = null;
const today = BP.today(), dayNo = BP.dayNumber('2026-09-15');
function cfgFor(rand, i, fill = false) {
  const ranges = [[12, 40], [30, 80], [50, 140], [80, 220], [120, 300]][Math.min(i, 4)];
  let count = Math.round(ranges[0] + rand() * (ranges[1] - ranges[0]));
  let kind = KINDS[Math.floor(rand() * KINDS.length)], jar = JAR_TYPES[Math.floor(rand() * JAR_TYPES.length)];
  if (DEBUG) { const q = new URLSearchParams(location.search); if (ITEMS[q.get('kind')]) kind = q.get('kind'); if (JARS[q.get('jar')]) jar = q.get('jar'); }
  // big things in a small container: keep the pile around the rim instead of a mountain (or a capped stream)
  const cap = capacity(jar, kind), r2 = rand();
  if (count > cap * 0.9) count = Math.round(cap * (0.55 + 0.35 * r2));
  count = Math.max(5, Math.min(MAX_BODIES, count));
  const max = fill ? Math.min(320, Math.max(count + 30, Math.ceil(cap * 1.15))) : count;
  return { rand, count, max, kind, jar, accent: ACCENTS[i % ACCENTS.length], timed: true, fill };
}
const score = (g, a) => (g > 0 && a > 0 ? Math.round(100 * Math.exp(-4 * Math.abs(Math.log(g / a)))) : 0);
const react = s => (s >= 95 ? 'Bang on!' : s >= 80 ? 'So close.' : s >= 55 ? 'Not bad.' : s >= 25 ? 'Ballpark-ish.' : 'Way off!');
const grade = pts => (pts >= 90 ? 'g4' : pts >= 70 ? 'g3' : pts >= 40 ? 'g2' : 'g1');
const squares = rs => `<span class="grades">${rs.map(r => `<i class="${grade(r.pts)}" title="${r.pts}"></i>`).join('')}</span>`;

function setMode(m) {
  mode = m; round = 0; results = []; streak = 0;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  dailyDone = store.get('daily', null);
  if (m === 'daily' && dailyDone && dailyDone.date === today) return showDailySummary();
  nextRound();
}
function nextRound() {
  const n = mode === 'daily' ? 5 : mode === 'fill' ? 5 : 0;
  drawDots(n);
  const rand = mode === 'daily' ? BP.rng(`jarful:${today}:${round}:${BP.deviceSeed()}`) : Math.random;
  const cfg = cfgFor(rand, mode === 'practice' || mode === 'overunder' ? Math.floor(Math.random() * 5) : round, mode === 'fill');
  if (mode === 'fill') { cfg.target = cfg.count; cfg.count = 0; }
  newJar(cfg);
  if (mode === 'fill') { phase = 'pour'; renderControls(); }
  else { renderControls('dropping'); }
  $('#lineFill').style.width = n ? `${(round / n) * 100}%` : '0';
}
function drawDots(n) { $('#dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < round ? 'done' : i === round ? 'on' : ''}"></i>`).join(''); }

function beginGuess() {
  phase = 'guess'; timeLeft = 15; loop.lastS = 15;
  if (mode === 'overunder') {
    const r = Math.random(), f = r < 0.5 ? 0.62 + r * 0.6 : 1.08 + (r - 0.5) * 0.7;
    spec.line = Math.max(1, Math.round(spec.count * f));
    if (spec.line === spec.count) spec.line += Math.random() < 0.5 ? -1 : 1;   // never a line equal to the answer
    spec.line = Math.max(1, spec.line);
  }
  renderControls();
}
function renderControls(state) {
  const c = $('#controls'), ask = $('#ask'), hint = $('#hint');
  $('#timer').textContent = mode === 'fill' ? '' : ':15';
  $('#timer').classList.remove('low');
  if (state === 'dropping') { ask.textContent = `HOW MANY ${ITEMS[spec.kind].name.toUpperCase()}?`; c.innerHTML = `<div class="stepper"><button disabled>−</button><input id="g" disabled placeholder="…"><button disabled>+</button></div><button class="submit" disabled>DROPPING…</button>`; hint.textContent = `watch the ${ITEMS[spec.kind].name} fall into the ${JARS[spec.jar].name}`; return; }
  if (mode === 'overunder') {
    ask.textContent = `MORE OR FEWER THAN ${spec.line}?`;
    c.innerHTML = `<div class="target">${spec.line}</div><div class="pair"><button id="under">FEWER ${ICON.down}</button><button id="over" class="solid">MORE ${ICON.up}</button></div>`;
    $('#under').onclick = () => overUnder(false); $('#over').onclick = () => overUnder(true);
    hint.textContent = `streak ${streak} · best ${store.get('bestStreak', 0)}`;
    return;
  }
  if (mode === 'fill') {
    ask.textContent = `FILL WITH ${ITEMS[spec.kind].name.toUpperCase()} TO:`;
    c.innerHTML = `<div class="target">${spec.target}</div><div class="pair"><button id="hold">HOLD TO POUR</button><button id="done" class="solid">SUBMIT</button></div>`;
    $('#hold').addEventListener('pointerdown', e => { e.preventDefault(); setPouring(true); });
    $('#hold').addEventListener('pointerleave', () => setPouring(false));
    $('#done').onclick = () => submitGuess(spec.target);
    hint.textContent = 'hold the button (or Space), release, then submit';
    return;
  }
  ask.textContent = `HOW MANY ${ITEMS[spec.kind].name.toUpperCase()}?`;
  c.innerHTML = `<div class="stepper"><button id="minus">−</button><input id="g" inputmode="numeric" autocomplete="off" aria-label="Your guess"><button id="plus">+</button></div><button id="sub" class="submit">SUBMIT</button>`;
  const g = $('#g');
  const bump = d => { g.value = Math.max(0, (parseInt(g.value) || 0) + d); };
  $('#minus').onclick = () => bump(-1); $('#plus').onclick = () => bump(1);
  g.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); if (e.key === 'ArrowUp') { bump(1); e.preventDefault(); } if (e.key === 'ArrowDown') { bump(-1); e.preventDefault(); } });
  $('#sub').onclick = () => submitGuess();
  hint.textContent = 'enter to submit · arrow keys adjust';
  g.focus({ preventScroll: true });
}
addEventListener('pointerup', () => setPouring(false));
addEventListener('pointercancel', () => setPouring(false));
addEventListener('blur', () => setPouring(false));

function submitGuess(fillTarget) {
  if (phase === 'pour') {
    // Fill To: stop pouring, let the pile settle, then score the settled count (onSnap -> scoreRound)
    setPouring(false); phase = 'finishing';
    document.querySelectorAll('#controls button').forEach(b => { b.disabled = true; });
    send({ t: 'finish' });
    return;
  }
  if (phase !== 'guess') return;
  scoreRound(fillTarget ?? (parseInt($('#g')?.value) || 0));
}
function scoreRound(guess) {
  phase = 'counting';
  countUp(() => {
    const actual = spec.count, isFill = mode === 'fill';
    const pts = isFill ? score(actual, spec.target) : score(guess, actual);
    results.push({ guess, actual, pts });
    chime(pts);
    const n = mode === 'daily' || isFill ? 5 : 0;
    const last = n && results.length >= n;
    showOverlay(`<div><div class="k">${isFill ? 'YOU POURED' : 'THERE WERE'}</div><div class="big">${actual}</div>
      <div class="sub">${ITEMS[spec.kind].name} · ${isFill ? `target ${spec.target}` : `you said ${guess || '—'}`} · ${react(pts)}</div><div class="pts">+${pts} pts</div>
      <button class="go" id="next">${last ? 'SEE TOTAL' : `NEXT JAR ${ICON.next}`}</button></div>`);
    $('#next').onclick = () => { round++; if (last) finish(); else nextRound(); };
    $('#next').focus();
  });
}
function overUnder(more) {
  if (phase !== 'guess') return;
  phase = 'counting';
  countUp(() => {
    const ok = more ? spec.count > spec.line : spec.count < spec.line;
    if (ok) { streak++; if (streak > store.get('bestStreak', 0)) store.set('bestStreak', streak); }
    chime(ok ? 100 : 0);
    showOverlay(`<div><div class="k">THERE WERE</div><div class="big">${spec.count}</div><div class="sub">${ITEMS[spec.kind].name} · ${ok ? `Correct — streak ${streak}` : `Nope. Streak ended at ${streak}.`}</div>
      <button class="go" id="next">${ok ? `NEXT JAR ${ICON.next}` : 'TRY AGAIN'}</button></div>`);
    if (!ok) streak = 0;
    $('#next').onclick = () => nextRound();
    $('#next').focus();
  });
}
// Counts the items actually drawn (mesh.count === spec.count, both taken from the frozen pile), lighting each one up.
function countUp(done) {
  const total = Math.min(spec.count, mesh.count), start = performance.now(), dur = reduce ? 300 : 2200;
  showOverlay(`<div><div class="k">COUNTING</div><div class="big" id="cnt">0</div></div>`);
  const hi = new THREE.Color(ITEMS[spec.kind].light ? spec.accent : '#ffffff');   // white things light up in the accent
  let shownN = 0, ended = false;
  const step = () => {
    if (ended) return;
    const k = Math.min(1, (performance.now() - start) / dur), n = Math.round(total * k);
    for (let i = shownN; i < n; i++) mesh.setColorAt(i, hi);
    if (n > shownN) { mesh.instanceColor.needsUpdate = true; if (n % Math.max(1, Math.round(total / 25)) === 0) tick(1400); }
    shownN = n; const el = $('#cnt'); if (el) el.textContent = n;
    if (k < 1) { const tok = ++step.tok, go = () => { if (tok === step.tok) step(); }; requestAnimationFrame(go); setTimeout(go, 250); }   // timeout keeps it moving if rAF is paused
    else { ended = true; for (let i = 0; i < total; i++) mesh.setColorAt(i, palette[i]); mesh.instanceColor.needsUpdate = true; setTimeout(done, 350); }
  };
  step.tok = 0; step();
}
function showOverlay(html) { const o = $('#overlay'); o.innerHTML = html; o.hidden = false; }

function finish() {
  const total = results.reduce((s, r) => s + r.pts, 0);
  const pts = results.map(r => r.pts).join(' · ');
  if (mode === 'daily') {
    const first = !(dailyDone && dailyDone.date === today);
    if (first) { store.set('daily', { date: today, total, results }); BP.report('jarful', { score: total, max: 500, label: `${total}/500` }); }
    if (total > store.get('best', 0)) store.set('best', total);
  }
  $('#lineFill').style.width = '100%';
  showOverlay(`<div><div class="k">${mode === 'daily' ? `DAILY No. ${dayNo}` : 'FILL TO'} · TOTAL</div><div class="big">${total}</div><div class="sub">/ 500 ${squares(results)}</div>
    <table>${results.map((r, i) => `<tr><td>Jar ${i + 1}</td><td>${mode === 'fill' ? `${r.actual} / ${r.guess}` : `${r.guess} vs ${r.actual}`}</td><td>${r.pts}</td></tr>`).join('')}</table>
    <button class="go" id="share">COPY RESULT</button> <button class="go" id="again" style="background:#2a2a38;color:#fff">PRACTICE</button></div>`);
  $('#share').onclick = () => navigator.clipboard?.writeText(`Jarful ${mode === 'daily' ? 'No. ' + dayNo : 'Fill To'}: ${total}/500\nJars: ${pts}`).then(() => { $('#share').textContent = 'COPIED'; });
  $('#again').onclick = () => setMode('practice');
}
function showDailySummary() {
  drawDots(0);
  newJar({ ...cfgFor(BP.rng(`jarful:${today}:4:${BP.deviceSeed()}`), 4), timed: false, summary: true });
  const d = dailyDone;
  showOverlay(`<div><div class="k">TODAY'S JARS · No. ${dayNo}</div><div class="big">${d.total}</div><div class="sub">/ 500 ${squares(d.results || [])}</div><div class="sub">New jars tomorrow. Keep counting in Practice, Over/Under or Fill To.</div>
    <button class="go" id="again">PRACTICE</button></div>`);
  $('#again').onclick = () => setMode('practice');
  renderControls('dropping'); $('#hint').textContent = 'daily done';
}

// ---------- sound ----------
let ac = null, muted = store.get('muted', false);
const muteBtn = $('#mute');
const drawMute = () => { muteBtn.innerHTML = muted ? ICON.off : ICON.on; muteBtn.setAttribute('aria-pressed', String(muted)); };
drawMute();
muteBtn.onclick = () => { muted = !muted; store.set('muted', muted); drawMute(); };
function tone(f, d, type = 'sine', v = 0.06) {
  if (muted) return;
  try {
    ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  } catch { /* audio unavailable */ }
}
let lastPlink = 0;
function plink(f) { const n = performance.now(); if (n - lastPlink < 45) return; lastPlink = n; tone(f, 0.06, 'triangle', 0.03); }
const tick = (f = 900) => tone(f, 0.04, 'square', 0.03);
const chime = pts => { tone(pts >= 70 ? 880 : pts >= 40 ? 660 : 300, 0.25, 'triangle', 0.08); if (pts >= 90) setTimeout(() => tone(1320, 0.3, 'triangle', 0.06), 110); };

addEventListener('keydown', e => {
  if (e.code === 'Space' && mode === 'fill' && phase === 'pour' && !e.repeat) { setPouring(true); e.preventDefault(); }
  if (e.key === 'Enter' && !$('#overlay').hidden && $('#next')) { $('#next').click(); e.preventDefault(); }
});
addEventListener('keyup', e => { if (e.code === 'Space') setPouring(false); });
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#helpOk').onclick = () => { $('#help').hidden = true; store.set('seenHelp', true); };
if (!store.get('seenHelp', false)) $('#help').hidden = false;
setMode(new URLSearchParams(location.search).get('mode') || 'daily');
