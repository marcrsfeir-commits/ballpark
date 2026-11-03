// JARFUL physics (cannon-es). Runs inside sim-worker.js so the simulation never depends on requestAnimationFrame,
// frame rate or tab visibility; game.js falls back to running it on the main thread if module workers are unavailable.
// Fixed 1/60 s steps. A round ends in a FROZEN state: every body spawned, the pile calm (or a hard step cap hit),
// escapees removed, then stepping stops for good, so the positions shown and the count scored are the same numbers.
import * as CANNON from '../../vendor/cannon/cannon-es.js';

export const STEP = 1 / 60;
const CALM_V2 = 0.6;          // max body speed^2 that counts as "calm"
const CALM_STEPS = 30;        // calm for half a second of sim time -> settled
const MAX_SETTLE_STEPS = 150; // ...or 2.5 s of sim time after the last spawn, whatever happens

// Collision shapes are kept cheap: cannon's convex-vs-convex test is the expensive path (a 10-sided cone cylinder
// cost ~55 ms per step with 200 bodies), so cones are three spheres and coins are hexagonal tokens (6-sided prism,
// drawn with the same 6-sided geometry so the visuals match the physics exactly).
function shapeFor(kind, body) {
  switch (kind) {
    case 'capsule': body.addShape(new CANNON.Sphere(0.24), new CANNON.Vec3(0, 0.25, 0)); body.addShape(new CANNON.Sphere(0.24), new CANNON.Vec3(0, -0.25, 0)); break;
    case 'cone':
      body.addShape(new CANNON.Sphere(0.3), new CANNON.Vec3(0, -0.12, 0));
      body.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(0, 0.14, 0));
      body.addShape(new CANNON.Sphere(0.07), new CANNON.Vec3(0, 0.32, 0));
      break;
    case 'coin': body.addShape(new CANNON.Cylinder(0.45, 0.45, 0.16, 6)); break;
    case 'cube': body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.35, 0.35))); break;
    default: body.addShape(new CANNON.Sphere(0.42));
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class JarSim {
  // cfg: { jar, kind, R, H, top, count, max, seed, spawnRate, pourRate }
  constructor(cfg) {
    this.cfg = cfg;
    this.rand = mulberry(cfg.seed || 1);
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = 7;
    w.quatNormalizeFast = true; w.quatNormalizeSkip = 2;
    w.defaultContactMaterial.friction = 0.35; w.defaultContactMaterial.restitution = 0.12;
    const { R, H, jar } = cfg, t = 1.0, wallH = H * 4;   // thick, tall walls + a lid: nothing can tunnel or fly out
    const fixed = (shape, x, y, z, rotY = 0) => { const b = new CANNON.Body({ mass: 0 }); b.addShape(shape); b.position.set(x, y, z); if (rotY) b.quaternion.setFromEuler(0, rotY, 0); w.addBody(b); };
    fixed(new CANNON.Box(new CANNON.Vec3(12, 1, 12)), 0, -1, 0);
    fixed(new CANNON.Box(new CANNON.Vec3(12, 1, 12)), 0, wallH + 1, 0);
    if (jar === 'box') {
      for (const [x, z, sx, sz] of [[R + t, 0, t, R + 2 * t], [-R - t, 0, t, R + 2 * t], [0, R + t, R + 2 * t, t], [0, -R - t, R + 2 * t, t]]) fixed(new CANNON.Box(new CANNON.Vec3(sx, wallH / 2, sz)), x, wallH / 2, z);
    } else {
      const n = 16;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; fixed(new CANNON.Box(new CANNON.Vec3(t, wallH / 2, R * Math.tan(Math.PI / n) + 0.2)), Math.cos(a) * (R + t), wallH / 2, Math.sin(a) * (R + t), -a); }
    }
    this.bodies = [];
    this.steps = 0; this.acc = 0; this.calm = 0; this.sinceSpawn = 0;
    this.pouring = false; this.frozen = false; this.removed = 0;
  }
  get n() { return this.bodies.length; }
  spawnOne() {
    const { R, H, kind } = this.cfg, r = this.rand;
    const b = new CANNON.Body({ mass: 1, linearDamping: 0.05, angularDamping: 0.2, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.6 });
    shapeFor(kind, b);
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.55;
    b.position.set(Math.cos(a) * d, H + 1.5 + r() * 2, Math.sin(a) * d);
    b.quaternion.setFromEuler(r() * 6, r() * 6, r() * 6);
    b.velocity.set(0, -4, 0);
    this.world.addBody(b); this.bodies.push(b);
    this.sinceSpawn = 0; this.calm = 0;
  }
  wantsMore() { const c = this.cfg; return c.fill ? (this.pouring && this.n < c.max) : this.n < c.count; }
  // one fixed step; returns true when the round just settled (and froze)
  step() {
    if (this.frozen) return false;
    const c = this.cfg;
    if (this.wantsMore()) {
      this.acc += c.fill ? c.pourRate * STEP : c.spawnRate;
      while (this.acc >= 1 && this.wantsMore()) { this.acc--; this.spawnOne(); }
    }
    this.world.step(STEP);
    this.steps++; this.sinceSpawn++;
    if (this.wantsMore()) return false;
    let mx = 0;
    for (const b of this.bodies) { const v = b.velocity.lengthSquared(); if (v > mx) mx = v; }
    this.calm = mx < CALM_V2 ? this.calm + 1 : 0;
    if (this.calm >= CALM_STEPS || this.sinceSpawn >= MAX_SETTLE_STEPS) { this.settle(); return true; }
    return false;
  }
  // freeze the pile and drop anything that somehow ended up outside the jar, so count == what is drawn inside it
  settle() {
    const { R, top, jar } = this.cfg, lim = Math.max(R, top || R) + 0.35;
    const keep = [];
    for (const b of this.bodies) {
      const p = b.position, out = (jar === 'box' ? Math.max(Math.abs(p.x), Math.abs(p.z)) : Math.hypot(p.x, p.z)) > lim || p.y < -0.3 || !Number.isFinite(p.x + p.y + p.z);
      if (out) { this.world.removeBody(b); this.removed++; } else keep.push(b);
    }
    this.bodies = keep;
    this.frozen = true;
  }
  setPouring(on) { this.pouring = on; if (on && this.n < this.cfg.max) { this.frozen = false; this.calm = 0; } }
  // positions + quaternions, 7 floats per body
  snapshot() {
    const a = new Float32Array(this.n * 7);
    let topY = 0;
    this.bodies.forEach((b, i) => { const o = i * 7, p = b.position, q = b.quaternion; a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = q.x; a[o + 4] = q.y; a[o + 5] = q.z; a[o + 6] = q.w; if (p.y > topY) topY = p.y; });
    return { buf: a, n: this.n, frozen: this.frozen, removed: this.removed, topY, steps: this.steps };
  }
}

// Drives a JarSim in real time without requestAnimationFrame. Normally paced to the wall clock (so the pour looks
// natural); when `fast` is set (tab hidden) or the device can't keep up, it simply runs flat out in short slices, so a
// round always finishes. emit(snapshot) is called at most every ~16 ms and once more on settle.
export class Runner {
  constructor(emit) { this.emit = emit; this.sim = null; this.timer = 0; this.fast = false; this.gen = 0; }
  start(cfg) {
    this.stop();
    this.sim = new JarSim(cfg);
    this.t0 = performance.now(); this.simT = 0; this.lastEmit = 0;
    this.gen = cfg.gen; this.fast = !!cfg.fast;
    this.schedule();
  }
  stop() { clearTimeout(this.timer); this.timer = 0; this.sim = null; }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.tick(), 4); }
  wake() { if (this.sim && !this.sim.frozen) { this.t0 = performance.now() - this.simT * 1000; this.schedule(); } }
  tick() {
    const s = this.sim; if (!s || s.frozen) return;
    const now = performance.now(), sliceEnd = now + 24;
    const target = this.fast ? Infinity : (now - this.t0) / 1000;
    let settled = false;
    while (!s.frozen && this.simT < target && performance.now() < sliceEnd) { settled = s.step(); this.simT += STEP; }
    // fell far behind the clock (slow device): don't try to "catch up" later in one burst, keep a steady pace
    if (!this.fast && target - this.simT > 0.25) this.t0 = now - this.simT * 1000;
    if (settled || now - this.lastEmit > 15) { this.lastEmit = now; this.emit({ ...s.snapshot(), gen: this.gen }); }
    if (!s.frozen) this.timer = setTimeout(() => this.tick(), this.fast ? 0 : 4);
  }
  pour(on) { if (!this.sim) return; this.sim.setPouring(on); if (on) this.wake(); }
  // end of a Fill To pour: stop spawning and let the pile settle at full speed; the settled snapshot is the answer
  finish() { const s = this.sim; if (!s) return; s.pouring = false; this.fast = true; if (s.frozen) this.emit({ ...s.snapshot(), gen: this.gen }); else this.schedule(); }
}
