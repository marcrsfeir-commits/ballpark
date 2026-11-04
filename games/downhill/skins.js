// DOWNHILL ball skins + trails. Every texture is drawn procedurally on a canvas (no image files).
import * as THREE from 'three';

const cache = {};
function canvasTex(key, w, h, draw, srgb = true) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (cache[key] = t);
}

// tileable value noise, fractal
function makeNoise(seed = 1) {
  const N = 256, perm = new Uint8Array(N * 2), val = new Float32Array(N);
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = r(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const sm = t => t * t * (3 - 2 * t);
  const n2 = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X0 = ((xi % per) + per) % per, X1 = (X0 + 1) % per, Y0 = yi & 255, Y1 = (yi + 1) & 255;
    const v = (a, b) => val[perm[a + perm[b]]];
    const u = sm(xf), w = sm(yf);
    return (v(X0, Y0) * (1 - u) + v(X1, Y0) * u) * (1 - w) + (v(X0, Y1) * (1 - u) + v(X1, Y1) * u) * w;
  };
  return (x, y, oct = 4, per = 8) => { let a = 0.5, f = 1, sum = 0, norm = 0; for (let o = 0; o < oct; o++) { sum += a * n2(x * f, y * f, per * f); norm += a; a *= 0.5; f *= 2; } return sum / norm; };
}
function noiseImage(g, w, h, seed, scale, fn) {
  const noise = makeNoise(seed), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = noise(x / w * scale, y / h * scale * (h / w) * 2, 5, scale);
    const [r, gg, b] = fn(n, x / w, y / h);
    const i = (y * w + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
const mix = (a, b, t) => a + (b - a) * t;
const ramp = (stops, t) => {
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], k = (t - t0) / (t1 - t0);
    return [mix(c0[0], c1[0], k), mix(c0[1], c1[1], k), mix(c0[2], c1[2], k)];
  }
  return stops[stops.length - 1][1];
};

export const SKINS = [
  {
    id: 'classic', name: 'Classic', cost: 0, level: 1,
    make: () => new THREE.MeshPhysicalMaterial({
      map: canvasTex('classic', 512, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5ef0ff'); gr.addColorStop(1, '#0fb8e8');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) g.fillRect(i * w / 4 + 52, 0, 24, h);
        g.fillRect(0, h / 2 - 12, w, 24);
      }),
      roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x053a4d, emissiveIntensity: 0.5,
    }),
  },
  {
    id: 'melon', name: 'Watermelon', cost: 150, level: 1,
    make: () => new THREE.MeshPhysicalMaterial({
      map: canvasTex('melon', 512, 256, (g, w, h) => {
        noiseImage(g, w, h, 3, 6, (n, u) => {
          const stripe = Math.sin((u * 16 + n * 1.6) * Math.PI * 2) > 0.15;
          return stripe ? [28 + n * 30, 92 + n * 50, 30] : [120 + n * 60, 190 + n * 40, 70];
        });
      }),
      roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3,
    }),
  },
  {
    id: 'eight', name: 'Eight Ball', cost: 250, level: 1,
    make: () => new THREE.MeshPhysicalMaterial({
      map: canvasTex('eight', 512, 256, (g, w, h) => {
        g.fillStyle = '#0b0b10'; g.fillRect(0, 0, w, h);
        for (const cx of [w * 0.25, w * 0.75]) {
          g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, h / 2, 46, 64, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#0b0b10'; g.font = '900 78px Segoe UI, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('8', cx, h / 2 + 4);
        }
      }),
      roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02,
    }),
  },
  {
    id: 'chrome', name: 'Chrome', cost: 400, level: 2,
    make: () => new THREE.MeshPhysicalMaterial({ color: 0xf2f4ff, metalness: 1, roughness: 0.06, envMapIntensity: 1.4 }),
  },
  {
    id: 'planet', name: 'Tiny Planet', cost: 550, level: 3,
    make: () => new THREE.MeshPhysicalMaterial({
      map: canvasTex('planet', 512, 256, (g, w, h) => {
        noiseImage(g, w, h, 7, 4, (n, u, v) => {
          const lat = Math.abs(v - 0.5) * 2;
          if (lat > 0.82 + n * 0.12) return [235, 245, 255];
          if (n < 0.5) return ramp([[0, [10, 40, 120]], [0.5, [30, 110, 200]]], n);
          return ramp([[0.5, [210, 200, 130]], [0.55, [60, 150, 60]], [0.7, [30, 100, 40]], [1, [120, 100, 80]]], n);
        });
      }),
      roughness: 0.6, clearcoat: 0.3, emissive: 0x0a1a40, emissiveIntensity: 0.4,
    }),
  },
  {
    id: 'lava', name: 'Lava Rock', cost: 700, level: 3,
    make: () => {
      const m = new THREE.MeshStandardMaterial({
        map: canvasTex('lava-c', 512, 256, (g, w, h) => noiseImage(g, w, h, 11, 6, n => { const k = n * 70; return [40 + k, 22 + k * 0.5, 20 + k * 0.4]; })),
        emissiveMap: canvasTex('lava-e', 512, 256, (g, w, h) => noiseImage(g, w, h, 11, 6, n => {
          const c = Math.max(0, 1 - Math.abs(n - 0.5) * 22); return [255 * c, 120 * c * c, 20 * c * c];
        })),
        emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.85,
      });
      m.userData.update = t => { m.emissiveIntensity = 2.0 + Math.sin(t * 3) * 0.8; };
      return m;
    },
  },
  {
    id: 'gold', name: 'Solid Gold', cost: 900, level: 4,
    make: () => new THREE.MeshPhysicalMaterial({
      color: 0xffc34a, metalness: 1, roughness: 0.18,
      roughnessMap: canvasTex('gold-r', 512, 256, (g, w, h) => {
        g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#9a9a9a'; g.lineWidth = 3;
        for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); }
        for (let j = 1; j < 4; j++) { g.beginPath(); g.moveTo(0, j * h / 4); g.lineTo(w, j * h / 4); g.stroke(); }
      }, false),
    }),
  },
  {
    id: 'glass', name: 'Glass Marble', cost: 1100, level: 5,
    make: () => new THREE.MeshPhysicalMaterial({
      color: 0x9fe8ff, metalness: 0, roughness: 0.03, transmission: 0.88, thickness: 0.7, emissive: 0x0a3446, emissiveIntensity: 0.8, ior: 1.5,
      iridescence: 0.8, iridescenceIOR: 1.3, clearcoat: 1, attenuationColor: new THREE.Color(0x3fd0ff), attenuationDistance: 1.2,
    }),
  },
  {
    id: 'disco', name: 'Disco', cost: 1300, level: 6,
    make: () => new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 1, roughness: 0.12,
      map: canvasTex('disco', 512, 256, (g, w, h) => {
        let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const v = 150 + r() * 105; g.fillStyle = `rgb(${v},${v},${v + r() * 20})`; g.fillRect(x, y, 15, 15); }
      }),
    }),
  },
  {
    id: 'neon', name: 'Neon Wire', cost: 1600, level: 7,
    make: () => new THREE.MeshStandardMaterial({
      color: 0x06030c, roughness: 0.3, metalness: 0.4, emissive: 0xffffff, emissiveIntensity: 2.6,
      emissiveMap: canvasTex('neon', 512, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#ff3df2'; g.lineWidth = 5; g.shadowColor = '#ff3df2'; g.shadowBlur = 8;
        for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); }
        g.strokeStyle = '#3dd8ff'; g.shadowColor = '#3dd8ff';
        for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(0, j * h / 6); g.lineTo(w, j * h / 6); g.stroke(); }
      }),
    }),
  },
  {
    id: 'galaxy', name: 'Galaxy', cost: 2000, level: 8,
    make: () => {
      const draw = (g, w, h) => {
        noiseImage(g, w, h, 21, 4, n => ramp([[0, [4, 2, 16]], [0.45, [30, 8, 70]], [0.62, [150, 40, 160]], [0.8, [255, 140, 200]], [1, [255, 255, 255]]], Math.pow(n, 1.3)));
        let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; const z = r() < 0.93 ? 1 : 2.4; g.fillRect(r() * w, r() * h, z, z); }
      };
      const m = new THREE.MeshPhysicalMaterial({
        map: canvasTex('galaxy', 512, 256, draw), emissiveMap: canvasTex('galaxy', 512, 256, draw),
        emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05,
      });
      return m;
    },
  },
  {
    id: 'prism', name: 'Prism Core', cost: 2800, level: 10,
    make: () => {
      const m = new THREE.MeshPhysicalMaterial({
        color: 0x111111, metalness: 0.2, roughness: 0.15, clearcoat: 1, iridescence: 1, iridescenceIOR: 2.0,
        emissive: 0xff00ff, emissiveIntensity: 1.6,
        emissiveMap: canvasTex('prism', 512, 256, (g, w, h) => {
          g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 18; i++) {
            const x = (i / 18) * w; g.fillStyle = '#fff';
            g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + w / 36, h * 0.1); g.lineTo(x + w / 18, h / 2); g.lineTo(x + w / 36, h * 0.9); g.fill();
          }
        }),
      });
      const c = new THREE.Color();
      m.userData.update = t => { m.emissive.copy(c.setHSL((t * 0.12) % 1, 1, 0.55)); };
      return m;
    },
  },
];

export const TRAILS = [
  { id: 'none', name: 'None', level: 1, colors: null },
  { id: 'mist', name: 'Mist', level: 1, colors: ['#ffffff', '#9fdcff'] },
  { id: 'cyan', name: 'Ion', level: 2, colors: ['#60f0ff', '#2066ff'] },
  { id: 'fire', name: 'Fire', level: 4, colors: ['#fff1a0', '#ff6a00', '#ff0040'] },
  { id: 'toxic', name: 'Toxic', level: 6, colors: ['#e8ff70', '#3dff6a'] },
  { id: 'rainbow', name: 'Rainbow', level: 9, colors: 'rainbow' },
  { id: 'gold', name: 'Gilded', level: 12, colors: ['#fff6c0', '#ffc34a', '#ff8a00'] },
];
export const trailCss = t => !t.colors ? 'repeating-linear-gradient(45deg,#555 0 4px,#333 4px 8px)'
  : t.colors === 'rainbow' ? 'linear-gradient(90deg,#ff3d3d,#ffae2e,#ffe14d,#3dff6a,#3dd8ff,#b06bff)'
  : `linear-gradient(90deg,${t.colors.join(',')})`;

// renders a little preview of every skin into data URLs (one throwaway WebGL context)
export async function skinThumbs(envFactory) {
  const out = {};
  let r;
  try {
    const c = document.createElement('canvas');
    r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(168, 168, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene();
    sc.environment = envFactory(r);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 0.25, 3.3); cam.lookAt(0, 0, 0);
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-2, 3, 3); sc.add(key);
    sc.add(new THREE.HemisphereLight(0xffd0f0, 0x301050, 1.2));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x2a1048 }));
    back.position.z = -2; sc.add(back);
    const geo = new THREE.SphereGeometry(0.9, 64, 40);
    for (const s of SKINS) {
      const m = s.make();
      m.userData.update?.(1.3);
      const mesh = new THREE.Mesh(geo, m); mesh.rotation.set(0.35, -0.6, 0.1);
      sc.add(mesh); r.render(sc, cam); out[s.id] = c.toDataURL('image/png'); sc.remove(mesh);
      await new Promise(requestAnimationFrame);
    }
  } catch { /* previews are optional */ }
  r?.dispose(); r?.forceContextLoss?.();
  return out;
}
