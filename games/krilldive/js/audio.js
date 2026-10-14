// Procedural sound: every effect and the ambient drone are synthesized with Web Audio.
let ctx = null, master = null, sfxBus = null, musicBus = null, drone = null;
const state = { sfx: true, music: true };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = state.sfx ? 0.9 : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
  if (c && !drone) startDrone();
}

export function setSfx(on) { state.sfx = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05); }
export function setMusic(on) { state.music = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.4); }

function noiseBuffer(sec = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  return b;
}

function startDrone() {
  // brown-noise "underwater" bed + two slow detuned sines
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(4); n.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const ng = ctx.createGain(); ng.gain.value = 0.5;
  n.connect(lp).connect(ng).connect(musicBus); n.start();
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), og = ctx.createGain();
  o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = 55; o2.frequency.value = 55.4; og.gain.value = 0.25;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 120;
  lfo.connect(lfoG).connect(lp.frequency); lfo.start();
  o1.connect(og); o2.connect(og); og.connect(musicBus); o1.start(); o2.start();
  drone = { lp, o1, o2 };
  setMusic(state.music);
}

// Deeper = darker, lower drone.
export function setDepth(m) {
  if (!drone) return;
  const k = Math.min(1, m / 7000);
  drone.lp.frequency.setTargetAtTime(380 - k * 260, ctx.currentTime, 1.5);
  drone.o1.frequency.setTargetAtTime(55 - k * 18, ctx.currentTime, 2);
  drone.o2.frequency.setTargetAtTime(55.4 - k * 18, ctx.currentTime, 2);
}

function tone(freq, { type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, slide = 0, delay = 0, bus = null } = {}) {
  if (!ensure() || !state.sfx) return;
  bus = bus || sfxBus;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(vol, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(bus); o.start(t); o.stop(t + dur + 0.05);
}

function echo(node, time = 0.28, fb = 0.35) {
  const d = ctx.createDelay(1); d.delayTime.value = time;
  const f = ctx.createGain(); f.gain.value = fb;
  node.connect(d); d.connect(f); f.connect(d); d.connect(sfxBus);
}

export const sfx = {
  click() { tone(660, { type: 'square', dur: 0.05, vol: 0.05 }); },
  blub() {
    for (let i = 0; i < 4; i++) tone(320 + Math.random() * 380, { dur: 0.09, vol: 0.12, slide: 2.2, delay: i * 0.06 });
  },
  type() { tone(1400 + Math.random() * 300, { type: 'square', dur: 0.015, vol: 0.015 }); },
  tick(urgent) { tone(urgent ? 1200 : 900, { type: 'square', dur: 0.04, vol: urgent ? 0.07 : 0.04 }); },
  nope() { tone(220, { type: 'triangle', dur: 0.18, vol: 0.18, slide: 0.6 }); tone(160, { type: 'triangle', dur: 0.22, vol: 0.14, slide: 0.6, delay: 0.09 }); },
  sink() {
    if (!ensure() || !state.sfx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    const gn = ctx.createGain(); const t = ctx.currentTime;
    bp.frequency.setValueAtTime(1600, t); bp.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.35, t + 0.1); gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    s.connect(bp).connect(gn).connect(sfxBus); s.start(t); s.stop(t + 2);
  },
  pass() { tone(520, { type: 'sine', dur: 0.08, vol: 0.06 }); },
  land(tier) {
    if (!ensure() || !state.sfx) return;
    const base = { plankton: 330, tooclever: 370, schooler: 440, rare: 523, deepcut: 587, krillion: 659 }[tier] || 440;
    const o = ctx.createOscillator(), gn = ctx.createGain(), t = ctx.currentTime;
    o.type = 'sine'; o.frequency.value = base * 2;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.3, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(gn); gn.connect(sfxBus); echo(gn, 0.32, 0.4); o.start(t); o.stop(t + 1.5);
    if (tier === 'krillion' || tier === 'deepcut') [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m * 2, { dur: 0.25, vol: 0.09, delay: 0.12 + i * 0.09, type: 'triangle' }));
  },
  miss() { tone(200, { type: 'sine', dur: 0.5, vol: 0.2, slide: 0.4 }); },
  surface() { [392, 494, 587, 784].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.3, vol: 0.1, delay: i * 0.08 })); },
  count() { tone(1046, { type: 'square', dur: 0.03, vol: 0.03 }); },
};
