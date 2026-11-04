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

// clear refractive glass (the scene behind is bent through it); a long attenuation distance keeps it water-clear
const glassMaterial = (color, tint, dist) => new THREE.MeshPhysicalMaterial({
  color, metalness: 0, roughness: 0, transmission: 1, thickness: 0.5, ior: 1.52,
  attenuationColor: new THREE.Color(tint), attenuationDistance: dist,
  specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.3,
});
// the coloured vanes inside a marble: three twisted ribbons radiating from the core, plus a few tiny air bubbles.
// Built for a unit sphere; the caller scales the group to the ball.
export function marbleSwirl(group, cols, vanes = 3, width = 0.5) {
  for (let v = 0; v < vanes; v++) {
    const P = [], ny = 18, nx = 4;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const y = -0.72 + 1.44 * j / ny, rr = Math.sqrt(Math.max(0, 0.62 - y * y));
      const x = 0.02 + rr * width * 0.85 * i / nx;          // vanes stay in the core (the glass magnifies them)
      const a = v / vanes * Math.PI * 2 + y * 2.4;          // the twist
      P.push(Math.cos(a) * x, y, Math.sin(a) * x);
    }
    const idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
    const c = new THREE.Color(cols[v % cols.length]);
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.35, side: THREE.DoubleSide })));
  }
  const bub = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.1 });
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02 + r() * 0.03, 8, 6), bub);
    const d = 0.3 + r() * 0.5, th = r() * 6.28, ph = Math.acos(2 * r() - 1);
    m.position.set(Math.sin(ph) * Math.cos(th) * d, Math.cos(ph) * d, Math.sin(ph) * Math.sin(th) * d);
    group.add(m);
  }
}

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
    id: 'melon', name: 'Watermelon', cost: 400, level: 2,
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
    id: 'eight', name: 'Eight Ball', cost: 700, level: 3,
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
    id: 'chrome', name: 'Chrome', cost: 1600, level: 5,
    live: true,   // mirrors the real world around it, updated as it rolls
    make: () => new THREE.MeshPhysicalMaterial({ color: 0xf4f6ff, metalness: 1, roughness: 0.02, envMapIntensity: 1.25 }),
  },
  {
    id: 'planet', name: 'Tiny Planet', cost: 1200, level: 4,
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
    id: 'lava', name: 'Lava Rock', cost: 2000, level: 6,
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
    id: 'gold', name: 'Solid Gold', cost: 2600, level: 7, live: true,
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
    id: 'glass', name: 'Glass Marble', cost: 3200, level: 8,
    // real glass: the world behind is refracted through it (and flipped, as through a lens), the world around is
    // reflected on it, and a twisted ribbon swirl sits inside like a real marble
    live: true,
    make: () => glassMaterial(0xf4fdff, 0xbff4ff, 3.5),
    extras: g => marbleSwirl(g, ['#3dd8ff', '#ffffff', '#ff5fa8']),
  },
  {
    id: 'disco', name: 'Disco', cost: 3800, level: 9, live: true,
    make: () => new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 1, roughness: 0.12,
      map: canvasTex('disco', 512, 256, (g, w, h) => {
        let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const v = 150 + r() * 105; g.fillStyle = `rgb(${v},${v},${v + r() * 20})`; g.fillRect(x, y, 15, 15); }
      }),
    }),
  },
  {
    id: 'neon', name: 'Neon Wire', cost: 4500, level: 10,
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
    id: 'galaxy', name: 'Galaxy', cost: 5500, level: 11,
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
    id: 'prism', name: 'Prism Core', cost: 7000, level: 13,
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
  {
    id: 'carbon', name: 'Carbon Fiber', cost: 900, level: 3,
    make: () => new THREE.MeshPhysicalMaterial({
      map: canvasTex('carbon', 512, 256, (g, w, h) => {
        g.fillStyle = '#0c0d10'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
          const a = ((x + y) / 8) % 2;
          const gr = a ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8);
          gr.addColorStop(0, '#15171c'); gr.addColorStop(0.5, '#3a3e48'); gr.addColorStop(1, '#15171c');
          g.fillStyle = gr; g.fillRect(x, y, 8, 8);
        }
      }),
      roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03,
    }),
  },
  {
    id: 'obsidian', name: 'Obsidian', cost: 2300, level: 6, live: true,
    make: () => new THREE.MeshPhysicalMaterial({
      color: 0x050408, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6,
      emissive: 0xffffff, emissiveIntensity: 0.9,
      emissiveMap: canvasTex('obsidian-e', 512, 256, (g, w, h) => noiseImage(g, w, h, 31, 5, n => {
        const c = Math.max(0, 1 - Math.abs(n - 0.52) * 30); return [120 * c, 40 * c, 255 * c];
      })),
    }),
  },
  {
    id: 'opal', name: 'Opal', cost: 4000, level: 10,
    make: () => new THREE.MeshPhysicalMaterial({
      map: canvasTex('opal', 512, 256, (g, w, h) => noiseImage(g, w, h, 41, 5, n => ramp([[0, [220, 240, 255]], [0.4, [255, 220, 245]], [0.6, [200, 255, 230]], [1, [255, 250, 210]]], n))),
      roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900],
      sheen: 1, sheenColor: new THREE.Color(0xc0a0ff),
    }),
  },
  {
    id: 'cats', name: "Cat's Eye", cost: 4800, level: 11, live: true,
    make: () => glassMaterial(0xfffaf2, 0xfff0d0, 5),
    extras: g => marbleSwirl(g, ['#ff3d3d', '#ffae2e', '#ffe14d', '#ff6a00'], 4, 0.22),
  },
  {
    id: 'ruby', name: 'Ruby Marble', cost: 5200, level: 12, live: true,
    make: () => glassMaterial(0xffe0e6, 0xff1a3c, 0.9),
    extras: g => marbleSwirl(g, ['#ffd36a', '#fff1c2'], 2, 0.3),
  },
  {
    id: 'holo', name: 'Hologram', cost: 6000, level: 12,
    make: () => {
      const tex = canvasTex('holo', 64, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) { g.fillStyle = `rgba(80,255,240,${y % 32 ? 0.45 : 1})`; g.fillRect(0, y, w, y % 32 ? 2 : 3); }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 2);
      const m = new THREE.MeshPhysicalMaterial({ color: 0x0a2a30, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.8, transparent: true, opacity: 0.78, roughness: 0.2, iridescence: 1, depthWrite: false });
      m.userData.update = t => { tex.offset.y = -t * 0.35; m.emissiveIntensity = 1.6 + Math.sin(t * 23) * 0.15 + (Math.sin(t * 1.7) > 0.97 ? 0.8 : 0); };
      return m;
    },
  },
  {
    id: 'bubble', name: 'Soap Bubble', cost: 6800, level: 13, live: true,
    make: () => new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transmission: 1, thickness: 0.02, ior: 1.05, roughness: 0, iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [250, 800],
      specularIntensity: 1, envMapIntensity: 1.6,
    }),
  },
  {
    id: 'mercury', name: 'Liquid Mercury', cost: 8000, level: 14, live: true,
    make: () => {
      const bump = canvasTex('mercury-b', 256, 128, (g, w, h) => noiseImage(g, w, h, 51, 3, n => [n * 255, n * 255, n * 255]), false);
      bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshPhysicalMaterial({ color: 0xdfe6f2, metalness: 1, roughness: 0.03, bumpMap: bump, bumpScale: 1.2, envMapIntensity: 1.3 });
      m.userData.update = t => { bump.offset.set(t * 0.05, Math.sin(t * 0.7) * 0.08); };   // the surface ripples as it rolls
      return m;
    },
  },
  {
    id: 'plasma', name: 'Plasma', cost: 9500, level: 15,
    make: () => {
      const tex = canvasTex('plasma', 512, 256, (g, w, h) => noiseImage(g, w, h, 61, 4, n => {
        const c = Math.pow(Math.max(0, 1 - Math.abs(n - 0.5) * 6), 2); return [255 * c, 255 * c, 255 * c];
      }));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshStandardMaterial({ color: 0x08020f, emissive: 0xff40ff, emissiveMap: tex, emissiveIntensity: 2.6, roughness: 0.3 });
      const c = new THREE.Color();
      m.userData.update = t => { tex.offset.set(t * 0.08, t * 0.03); m.emissive.copy(c.setHSL((0.75 + Math.sin(t * 0.4) * 0.12) % 1, 1, 0.55)); };
      return m;
    },
  },
  {
    id: 'sun', name: 'Mini Sun', cost: 12000, level: 18,
    make: () => {
      const tex = canvasTex('sun', 512, 256, (g, w, h) => noiseImage(g, w, h, 71, 6, n => ramp([[0, [120, 10, 0]], [0.45, [255, 90, 0]], [0.7, [255, 200, 40]], [1, [255, 255, 220]]], n)));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 1.6, 1.1) });
      m.userData.update = t => { tex.offset.set(t * 0.03, Math.sin(t * 0.5) * 0.02); };
      return m;
    },
  },
];

SKINS.sort((a, b) => a.cost - b.cost);   // shop order: cheapest first

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
      if (s.extras) { const g = new THREE.Group(); s.extras(g); g.scale.setScalar(0.9); mesh.add(g); }
      sc.add(mesh); r.render(sc, cam); out[s.id] = c.toDataURL('image/png'); sc.remove(mesh);
      await new Promise(requestAnimationFrame);
    }
  } catch { /* previews are optional */ }
  r?.dispose(); r?.forceContextLoss?.();
  return out;
}
