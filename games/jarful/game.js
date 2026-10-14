// JARFUL — objects pour into a jar (three.js + cannon-es physics); guess how many.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

const BP = window.Ballpark;
const store = BP.store('jarful');
const $ = s => document.querySelector(s);
const ACCENTS = ['#a78bfa', '#ff2d6f', '#7ee2c4', '#3fd9f0', '#ffb547'];
const KINDS = ['sphere', 'egg', 'capsule', 'cone', 'coin', 'cube'];
const JARS = ['cylinder', 'box', 'beaker'];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- three ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 9, 17);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enablePan: false, enableDamping: true, minDistance: 9, maxDistance: 26, maxPolarAngle: Math.PI * 0.49, autoRotate: !reduce, autoRotateSpeed: 0.7 });
controls.target.set(0, 3, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x20202a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 12, 8); scene.add(sun);
const rim = new THREE.DirectionalLight(0x99aaff, 0.8); rim.position.set(-8, 4, -6); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: 0x0c0c12 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- physics ----------
let world, bodies = [], mesh = null, jarGroup = null, spec = null;
function geometryFor(kind) {
  switch (kind) {
    case 'egg': { const g = new THREE.SphereGeometry(0.42, 20, 14); g.scale(0.85, 1.15, 0.85); return g; }
    case 'capsule': return new THREE.CapsuleGeometry(0.24, 0.5, 6, 12);
    case 'cone': return new THREE.ConeGeometry(0.4, 0.8, 18);
    case 'coin': return new THREE.CylinderGeometry(0.45, 0.45, 0.16, 24);
    case 'cube': return new RoundedBoxGeometry(0.7, 0.7, 0.7, 2, 0.12);
    default: return new THREE.SphereGeometry(0.42, 20, 14);
  }
}
function shapeFor(kind, body) {
  switch (kind) {
    case 'capsule': body.addShape(new CANNON.Sphere(0.24), new CANNON.Vec3(0, 0.25, 0)); body.addShape(new CANNON.Sphere(0.24), new CANNON.Vec3(0, -0.25, 0)); break;
    case 'cone': body.addShape(new CANNON.Cylinder(0.08, 0.4, 0.8, 10)); break;
    case 'coin': body.addShape(new CANNON.Cylinder(0.45, 0.45, 0.16, 12)); break;
    case 'cube': body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.35, 0.35))); break;
    case 'egg': body.addShape(new CANNON.Sphere(0.42)); break;
    default: body.addShape(new CANNON.Sphere(0.42));
  }
}
function buildJar(type, accent) {
  if (jarGroup) scene.remove(jarGroup);
  jarGroup = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.55) });
  const H = type === 'box' ? 5.2 : type === 'beaker' ? 6.6 : 6, R = type === 'box' ? 2.6 : type === 'beaker' ? 2.7 : 3;
  if (type === 'box') {
    const g = new THREE.BoxGeometry(R * 2, H, R * 2); g.translate(0, H / 2, 0);
    jarGroup.add(new THREE.Mesh(g, glass), new THREE.LineSegments(new THREE.EdgesGeometry(g), edge));
  } else {
    const top = type === 'beaker' ? R * 1.18 : R;
    const g = new THREE.CylinderGeometry(top, R, H, 48, 1, true); g.translate(0, H / 2, 0);
    jarGroup.add(new THREE.Mesh(g, glass));
    for (const [y, r] of [[0.02, R], [H, top]]) {
      const pts = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * r, y, Math.sin(i / 64 * Math.PI * 2) * r));
      jarGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edge));
    }
  }
  scene.add(jarGroup);
  // physics: floor + tall invisible walls so nothing can ever escape
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.35; world.defaultContactMaterial.restitution = 0.12;
  const ground = new CANNON.Body({ mass: 0 }); ground.addShape(new CANNON.Box(new CANNON.Vec3(10, 0.5, 10))); ground.position.set(0, -0.5, 0); world.addBody(ground);
  const wallH = H * 4, t = 0.5;
  if (type === 'box') {
    for (const [x, z, sx, sz] of [[R + t, 0, t, R + t], [-R - t, 0, t, R + t], [0, R + t, R + t, t], [0, -R - t, R + t, t]]) {
      const w = new CANNON.Body({ mass: 0 }); w.addShape(new CANNON.Box(new CANNON.Vec3(sx, wallH / 2, sz))); w.position.set(x, wallH / 2, z); world.addBody(w);
    }
  } else {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, w = new CANNON.Body({ mass: 0 });
      w.addShape(new CANNON.Box(new CANNON.Vec3(t, wallH / 2, R * Math.tan(Math.PI / n) + 0.1)));
      w.position.set(Math.cos(a) * (R + t), wallH / 2, Math.sin(a) * (R + t));
      w.quaternion.setFromEuler(0, -a, 0);
      world.addBody(w);
    }
  }
  return { H, R };
}

// ---------- round ----------
let phase = 'idle', toSpawn = 0, spawned = 0, spawnRate = 1, dims = null, settleT = 0, timeLeft = 15, pouring = false;
const palette = [];
function newJar(cfg) {
  spec = cfg;
  document.documentElement.style.setProperty('--accent', cfg.accent);
  dims = buildJar(cfg.jar, cfg.accent);
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0, emissive: new THREE.Color(cfg.accent), emissiveIntensity: 0.12 });
  mesh = new THREE.InstancedMesh(geometryFor(cfg.kind), mat, cfg.max);
  mesh.count = 0;
  palette.length = 0;
  const base = new THREE.Color(cfg.accent), white = new THREE.Color('#ffffff');
  for (let i = 0; i < cfg.max; i++) { const c = base.clone().lerp(white, 0.25 + cfg.rand() * 0.6); palette.push(c); mesh.setColorAt(i, c); }
  scene.add(mesh);
  bodies = []; spawned = 0; settleT = 0;
  toSpawn = cfg.fill ? 0 : cfg.count;
  spawnRate = Math.max(1, cfg.count / (reduce ? 50 : 140));
  controls.target.set(0, dims.H * 0.42, 0);
  phase = 'dropping';
  $('#overlay').hidden = true;
}
function spawnOne() {
  const b = new CANNON.Body({ mass: 1, linearDamping: 0.05, angularDamping: 0.2, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.6 });
  shapeFor(spec.kind, b);
  const a = spec.rand() * Math.PI * 2, r = Math.sqrt(spec.rand()) * dims.R * 0.55;
  b.position.set(Math.cos(a) * r, dims.H + 1.5 + spec.rand() * 2, Math.sin(a) * r);
  b.quaternion.setFromEuler(spec.rand() * 6, spec.rand() * 6, spec.rand() * 6);
  b.velocity.set(0, -4, 0);
  world.addBody(b); bodies.push(b);
  spawned++; mesh.count = spawned;
  if (spawned % 3 === 0) plink(500 + spec.rand() * 500);
}
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
function sync() {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    p.set(b.position.x, b.position.y, b.position.z); q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    m4.compose(p, q, one); mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (world && (phase === 'dropping' || phase === 'guess' || phase === 'pour')) {
    if (phase === 'dropping') {
      spec.dropAcc = (spec.dropAcc || 0) + dt * spawnRate * 60;          // time-based, ~2.3 s per jar
      while (spec.dropAcc >= 1 && spawned < toSpawn) { spec.dropAcc--; spawnOne(); }
      if (spawned >= toSpawn) {
        settleT += dt;
        const still = bodies.every(b => b.sleepState === CANNON.Body.SLEEPING || b.velocity.lengthSquared() < 0.5);
        if ((still && settleT > 0.6) || settleT > 3.5) beginGuess();
      }
    }
    if (phase === 'pour' && pouring && spawned < spec.max) { spec.acc = (spec.acc || 0) + dt * Math.max(8, spec.target / 4); while (spec.acc >= 1 && spawned < spec.max) { spec.acc--; spawnOne(); } }
    world.step(1 / 60, dt, 3);
    if (mesh) sync();
  }
  if (phase === 'guess' && spec.timed) {
    timeLeft -= dt;
    const s = Math.max(0, Math.ceil(timeLeft));
    $('#timer').textContent = ':' + String(s).padStart(2, '0');
    $('#timer').classList.toggle('low', timeLeft < 5);
    if (s !== loop.lastS && timeLeft < 5 && s > 0) tick();
    loop.lastS = s;
    if (timeLeft <= 0) submitGuess();
  }
  controls.update();
  renderer.render(scene, camera);
  if (DEBUG) document.title = `${phase} ${spawned}/${spec?.count} ${Math.ceil(timeLeft)}`;
}
const DEBUG = location.search.includes('debug');
requestAnimationFrame(loop);

// ---------- modes ----------
let mode = 'daily', round = 0, results = [], streak = 0, dailyDone = null;
const today = BP.today(), dayNo = BP.dayNumber('2026-09-15');
function cfgFor(rand, i, fill = false) {
  const ranges = [[12, 40], [30, 80], [50, 140], [80, 220], [120, 300]][Math.min(i, 4)];
  const count = Math.round(ranges[0] + rand() * (ranges[1] - ranges[0]));
  return { rand, count, max: fill ? 320 : count, kind: KINDS[Math.floor(rand() * KINDS.length)], jar: JARS[Math.floor(rand() * JARS.length)], accent: ACCENTS[i % ACCENTS.length], timed: true, fill };
}
const score = (g, a) => (g > 0 ? Math.round(100 * Math.exp(-4 * Math.abs(Math.log(g / a)))) : 0);
const react = s => (s >= 95 ? 'Bang on!' : s >= 80 ? 'So close.' : s >= 55 ? 'Not bad.' : s >= 25 ? 'Ballpark-ish.' : 'Way off!');

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
  const rand = mode === 'daily' ? BP.rng(`jarful:${today}:${round}`) : Math.random;
  const cfg = cfgFor(rand, mode === 'practice' || mode === 'overunder' ? Math.floor(Math.random() * 5) : round, mode === 'fill');
  if (mode === 'fill') { cfg.target = cfg.count; cfg.count = 0; }
  newJar(cfg);
  if (mode === 'fill') { phase = 'pour'; renderControls(); }
  else { renderControls('dropping'); }
  $('#lineFill').style.width = n ? `${(round / n) * 100}%` : '0';
}
function drawDots(n) { $('#dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < round ? 'done' : i === round ? 'on' : ''}"></i>`).join(''); }

function beginGuess() {
  phase = 'guess'; timeLeft = 15;
  if (mode === 'overunder') {
    const r = Math.random(), f = r < 0.5 ? 0.62 + r * 0.6 : 1.08 + (r - 0.5) * 0.7;
    spec.line = Math.max(1, Math.round(spec.count * f));
  }
  renderControls();
}
function renderControls(state) {
  const c = $('#controls'), ask = $('#ask'), hint = $('#hint');
  $('#timer').textContent = mode === 'fill' ? '' : ':15';
  if (state === 'dropping') { ask.textContent = 'HOW MANY?'; c.innerHTML = `<div class="stepper"><button disabled>−</button><input id="g" disabled placeholder="…"><button disabled>+</button></div><button class="submit" disabled>DROPPING…</button>`; hint.textContent = 'watch them fall'; return; }
  if (mode === 'overunder') {
    ask.textContent = `MORE OR FEWER THAN ${spec.line}?`;
    c.innerHTML = `<div class="target">${spec.line}</div><div class="pair"><button id="under">FEWER ▼</button><button id="over" class="solid">MORE ▲</button></div>`;
    $('#under').onclick = () => overUnder(false); $('#over').onclick = () => overUnder(true);
    hint.textContent = `streak ${streak} · best ${store.get('bestStreak', 0)}`;
    return;
  }
  if (mode === 'fill') {
    ask.textContent = 'FILL TO:';
    c.innerHTML = `<div class="target">${spec.target}</div><div class="pair"><button id="hold">HOLD TO POUR</button><button id="done" class="solid">SUBMIT</button></div>`;
    const hold = $('#hold');
    const on = e => { e.preventDefault(); pouring = true; hold.textContent = 'POURING…'; };
    const off = () => { pouring = false; hold.textContent = 'HOLD TO POUR'; };
    hold.addEventListener('pointerdown', on); addEventListener('pointerup', off, { once: false }); hold.addEventListener('pointerleave', off);
    $('#done').onclick = () => { pouring = false; spec.count = spawned; submitGuess(spec.target); };
    hint.textContent = 'hold the button (or Space) — release, then submit';
    return;
  }
  ask.textContent = 'HOW MANY?';
  c.innerHTML = `<div class="stepper"><button id="minus">−</button><input id="g" inputmode="numeric" autocomplete="off" aria-label="Your guess"><button id="plus">+</button></div><button id="sub" class="submit">SUBMIT</button>`;
  const g = $('#g');
  const bump = d => { g.value = Math.max(0, (parseInt(g.value) || 0) + d); };
  $('#minus').onclick = () => bump(-1); $('#plus').onclick = () => bump(1);
  g.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); if (e.key === 'ArrowUp') { bump(1); e.preventDefault(); } if (e.key === 'ArrowDown') { bump(-1); e.preventDefault(); } });
  $('#sub').onclick = () => submitGuess();
  hint.textContent = 'enter to submit · ↑↓ to adjust';
  g.focus({ preventScroll: true });
}

function submitGuess(fillTarget) {
  if (phase !== 'guess' && phase !== 'pour') return;
  const guess = fillTarget ?? (parseInt($('#g')?.value) || 0);
  phase = 'counting';
  countUp(() => {
    const actual = spec.count, isFill = mode === 'fill';
    const pts = isFill ? score(actual, spec.target) : score(guess, actual);
    results.push({ guess, actual, pts });
    chime(pts);
    const n = mode === 'daily' || isFill ? 5 : 0;
    const last = n && results.length >= n;
    showOverlay(`<div><div class="k">${isFill ? 'YOU POURED' : 'THERE WERE'}</div><div class="big">${actual}</div>
      <div class="sub">${isFill ? `target ${spec.target}` : `you said ${guess || '—'}`} · ${react(pts)}</div><div class="pts">+${pts} pts</div>
      <button class="go" id="next">${last ? 'SEE TOTAL' : 'NEXT JAR ▸'}</button></div>`);
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
    showOverlay(`<div><div class="k">THERE WERE</div><div class="big">${spec.count}</div><div class="sub">${ok ? `Correct — streak ${streak}` : `Nope. Streak ended at ${streak}.`}</div>
      <button class="go" id="next">${ok ? 'NEXT JAR ▸' : 'TRY AGAIN'}</button></div>`);
    if (!ok) streak = 0;
    $('#next').onclick = () => nextRound();
    $('#next').focus();
  });
}
function countUp(done) {
  const total = spec.count, start = performance.now(), dur = reduce ? 300 : 2200;
  showOverlay(`<div><div class="k">COUNTING</div><div class="big" id="cnt">0</div></div>`);
  const hi = new THREE.Color('#ffffff');
  let shownN = 0;
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / dur), n = Math.round(total * k);
    for (let i = shownN; i < n; i++) mesh.setColorAt(i, hi);
    if (n > shownN) { mesh.instanceColor.needsUpdate = true; if (n % Math.max(1, Math.round(total / 25)) === 0) tick(1400); }
    shownN = n; $('#cnt').textContent = n;
    if (k < 1) requestAnimationFrame(step);
    else { for (let i = 0; i < total; i++) mesh.setColorAt(i, palette[i]); mesh.instanceColor.needsUpdate = true; setTimeout(done, 350); }
  };
  step();
}
function showOverlay(html) { const o = $('#overlay'); o.innerHTML = html; o.hidden = false; }

function finish() {
  const total = results.reduce((s, r) => s + r.pts, 0);
  const line = results.map(r => (r.pts >= 90 ? '🎯' : r.pts >= 70 ? '🟩' : r.pts >= 40 ? '🟨' : '🟥')).join('');
  if (mode === 'daily') {
    const first = !(dailyDone && dailyDone.date === today);
    if (first) { store.set('daily', { date: today, total, results, line }); BP.report('jarful', { score: total, max: 500, label: `${total}/500 ${line}` }); }
    if (total > store.get('best', 0)) store.set('best', total);
  }
  $('#lineFill').style.width = '100%';
  showOverlay(`<div><div class="k">${mode === 'daily' ? `DAILY No. ${dayNo}` : 'FILL TO'} · TOTAL</div><div class="big">${total}</div><div class="sub">/ 500 · ${line}</div>
    <table>${results.map((r, i) => `<tr><td>Jar ${i + 1}</td><td>${mode === 'fill' ? `${r.actual} / ${r.guess}` : `${r.guess} vs ${r.actual}`}</td><td>${r.pts}</td></tr>`).join('')}</table>
    <button class="go" id="share">COPY RESULT</button> <button class="go" id="again" style="background:#2a2a38;color:#fff">PRACTICE</button></div>`);
  $('#share').onclick = () => navigator.clipboard?.writeText(`Jarful ${mode === 'daily' ? 'No. ' + dayNo : 'Fill To'} · ${total}/500\n${line}`).then(() => { $('#share').textContent = 'COPIED ✓'; });
  $('#again').onclick = () => setMode('practice');
}
function showDailySummary() {
  drawDots(0);
  newJar({ ...cfgFor(BP.rng(`jarful:${today}:4`), 4), timed: false });
  phase = 'done-drop';
  toSpawn = spec.count;
  phase = 'dropping';
  setTimeout(() => { phase = 'shown'; }, 4500);
  const d = dailyDone;
  showOverlay(`<div><div class="k">TODAY'S JARS · No. ${dayNo}</div><div class="big">${d.total}</div><div class="sub">/ 500 · ${d.line}</div><div class="sub">New jars tomorrow. Keep counting in Practice, Over/Under or Fill To.</div>
    <button class="go" id="again">PRACTICE</button></div>`);
  $('#again').onclick = () => setMode('practice');
  renderControls('dropping'); $('#hint').textContent = 'daily done ✓';
}

// ---------- sound ----------
let ac = null, muted = store.get('muted', false);
$('#mute').textContent = muted ? '🔇' : '🔊';
$('#mute').onclick = () => { muted = !muted; store.set('muted', muted); $('#mute').textContent = muted ? '🔇' : '🔊'; };
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
  if (e.code === 'Space' && mode === 'fill' && phase === 'pour' && !e.repeat) { pouring = true; e.preventDefault(); }
  if (e.key === 'Enter' && !$('#overlay').hidden && $('#next')) { $('#next').click(); e.preventDefault(); }
});
addEventListener('keyup', e => { if (e.code === 'Space') pouring = false; });
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#helpOk').onclick = () => { $('#help').hidden = true; store.set('seenHelp', true); };
if (!store.get('seenHelp', false)) $('#help').hidden = false;
setMode(new URLSearchParams(location.search).get('mode') || 'daily');
