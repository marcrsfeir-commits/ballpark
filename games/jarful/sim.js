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
// cost ~55 ms per step with 200 bodies), so odd shapes are built from a few spheres (ducks, beans, eggs, candy corn,
// wrapped sweets), tokens are 6-sided prisms (drawn with the same 6-sided geometry) and only dice/bricks are boxes.
// The drawn models in game.js (ITEMS) are sized to these bodies.
function shapeFor(kind, body) {
  const S = (r, x = 0, y = 0, z = 0) => body.addShape(new CANNON.Sphere(r), new CANNON.Vec3(x, y, z));
  switch (kind) {
    case 'marble': S(0.3); break;
    case 'pingpong': S(0.52); break;
    case 'egg': S(0.34, 0, -0.13); S(0.29, 0, 0.16); break;
    case 'bean': S(0.2, -0.17); S(0.2, 0.17); break;
    case 'corn': S(0.3, 0, -0.12); S(0.17, 0, 0.14); S(0.07, 0, 0.32); break;
    case 'token': body.addShape(new CANNON.Cylinder(0.45, 0.45, 0.16, 6)); break;
    case 'die': body.addShape(new CANNON.Box(new CANNON.Vec3(0.3, 0.3, 0.3))); break;
    case 'brick': body.addShape(new CANNON.Box(new CANNON.Vec3(0.48, 0.23, 0.24)), new CANNON.Vec3(0, 0.04, 0)); break;
    case 'duck': S(0.3, -0.13, -0.02); S(0.3, 0.13, -0.02); S(0.23, 0.2, 0.36); break;
    case 'sweet': S(0.26); S(0.14, -0.36); S(0.14, 0.36); break;
    default: S(0.42);   // gumball
  }
}

// Container walls are infinite half-space planes, not boxes. Every container here is convex (the radius grows from the
// bottom R to the rim `top`, then the wall carries straight up), so a ring of inward-facing planes + floor + lid is
// exactly its inside. Planes are cheap special cases in cannon and can't be tunnelled: anything that ends up behind
// one is pushed back in. (Thick wall BOXES used to leak about 1 in 100 heavy pours: cannon's box-vs-box test could
// report a phantom contact with the floor box from far above it and fling an item out over the rim.)
// Round = 16-sided (20 for the wide bowl) ring following the frustum, then vertical above the rim; rect = 4 planes.
export function radiusAt(c, y) { return c.R + (c.top - c.R) * Math.min(1, Math.max(0, y / c.H)); }

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class JarSim {
  // cfg: { jar, kind, H, R, top (round) | rect, Rx, Rz, count, max, seed, spawnRate, pourRate, fill }
  constructor(cfg) {
    this.cfg = cfg;
    this.rand = mulberry(cfg.seed || 1);
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = 7;
    w.quatNormalizeFast = true; w.quatNormalizeSkip = 2;
    w.defaultContactMaterial.friction = 0.35; w.defaultContactMaterial.restitution = 0.12;
    const { H } = cfg, lidY = Math.max(H * 4, 22);   // a lid far above the rim: nothing can fly out
    const plane = (nx, ny, nz, x, y, z) => {   // plane through (x,y,z) whose normal (pointing INTO the container) is n
      const b = new CANNON.Body({ mass: 0 }); b.addShape(new CANNON.Plane()); b.position.set(x, y, z);
      b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(nx, ny, nz).unit()); w.addBody(b);
    };
    plane(0, 1, 0, 0, 0, 0);
    plane(0, -1, 0, 0, lidY, 0);
    if (cfg.rect) {
      const { Rx, Rz } = cfg;
      plane(-1, 0, 0, Rx, 0, 0); plane(1, 0, 0, -Rx, 0, 0); plane(0, 0, -1, 0, 0, Rz); plane(0, 0, 1, 0, 0, -Rz);
    } else {
      const { R, top } = cfg, n = top > R * 1.4 ? 20 : 16, phi = Math.atan2(top - R, H), flared = top - R > 1e-3;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        // side wall through the bottom edge, leaning outward by phi (0 for a straight jar)
        plane(-c * Math.cos(phi), Math.sin(phi), -s * Math.cos(phi), c * R, 0, s * R);
        if (flared) plane(-c, 0, -s, c * top, H, s * top);   // straight section above the rim
      }
    }
    this.bodies = [];
    this.steps = 0; this.acc = 0; this.calm = 0; this.sinceSpawn = 0;
    this.pouring = false; this.frozen = false; this.removed = 0;
  }
  get n() { return this.bodies.length; }
  spawnOne() {
    const c = this.cfg, { H, kind } = c, r = this.rand;
    const b = new CANNON.Body({ mass: 1, linearDamping: 0.05, angularDamping: 0.2, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.6 });
    shapeFor(kind, b);
    const y = H + 1.5 + r() * 2;
    if (c.rect) b.position.set((r() * 2 - 1) * c.Rx * 0.55, y, (r() * 2 - 1) * c.Rz * 0.55);
    else { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * c.R * 0.55; b.position.set(Math.cos(a) * d, y, Math.sin(a) * d); }
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
    const c = this.cfg;
    const keep = [];
    for (const b of this.bodies) {
      const p = b.position;
      const outside = c.rect ? Math.abs(p.x) > c.Rx + 0.35 || Math.abs(p.z) > c.Rz + 0.35 : Math.hypot(p.x, p.z) > radiusAt(c, p.y) + 0.45;
      const out = outside || p.y < -0.3 || !Number.isFinite(p.x + p.y + p.z);
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
