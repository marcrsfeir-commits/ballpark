// DOWNHILL scenery kit: the detailed things beside the track. Everything is instanced (one draw call per kind), and
// the building windows and pyramid bands are drawn in world space by the shader, so a tower of any size gets
// correctly sized windows and level neon bands that show which way is down.
import * as THREE from 'three';

// join several geometries into one (positions + normals only)
function merge(geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

// a palm: a curved, tapering trunk with rings, three coconuts, and nine drooping jagged fronds. Height 1 = ~7 m.
function palmGeometry() {
  const trunk = [], fronds = [];
  const H = 7, bend = 1.6, segs = 9;
  const at = t => new THREE.Vector3(bend * t * t, H * t, 0);
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  for (let i = 0; i < segs; i++) {
    const a = at(i / segs), b = at((i + 1) / segs), len = a.distanceTo(b);
    const r0 = 0.26 - 0.12 * (i / segs), r1 = 0.26 - 0.12 * ((i + 1) / segs);
    const g = new THREE.CylinderGeometry(r1, r0 * 1.12, len, 7, 1);   // the wider base of each piece makes ring ridges
    q.setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    trunk.push(g);
  }
  const top = at(1);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.SphereGeometry(0.2, 7, 5), ang = k * 2.1;
    g.translate(top.x + Math.cos(ang) * 0.22, top.y - 0.25, Math.sin(ang) * 0.22);
    trunk.push(g);
  }
  // fronds: a ribbon along a drooping arc, with saw-tooth edges for leaflets
  const N = 9;
  for (let f = 0; f < N; f++) {
    const yaw = (f / N) * Math.PI * 2 + (f % 2) * 0.2, len = 3.4 + (f % 3) * 0.4, lift = 0.9 - (f % 2) * 0.5;
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const P = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const c = top.clone().addScaledVector(dir, len * t);
      c.y += lift * Math.sin(t * Math.PI * 0.6) - 2.2 * t * t;
      const w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (i % 2 ? 1 : 0.55);   // saw-tooth leaflets
      P.push([c.clone().addScaledVector(side, -w).add(new THREE.Vector3(0, -0.12 * w, 0)), c, c.clone().addScaledVector(side, w).add(new THREE.Vector3(0, -0.12 * w, 0))]);
    }
    const v = [];
    for (let i = 0; i < steps; i++) {
      const [a0, m0, b0] = P[i], [a1, m1, b1] = P[i + 1];
      for (const p of [a0, m0, m1, a0, m1, a1, m0, b0, b1, m0, b1, m1]) v.push(p.x, p.y, p.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
    fronds.push(g);
  }
  return { trunk: merge(trunk), fronds: merge(fronds) };
}

// a floating rock island: flat top, jagged underside that tapers to a point
function islandGeometry() {
  const g = new THREE.CylinderGeometry(1, 0.12, 1.4, 9, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.69) {
      const k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.28;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y - Math.abs(Math.sin(i * 7.1)) * 0.12);
    }
  }
  g.translate(0, -0.7, 0);       // top surface at y = 0
  const out = g.toNonIndexed(); out.computeVertexNormals();
  return out;
}

// world-space neon shader on a standard material. mode 0: lit windows on the walls; mode 1: level bands (pyramids)
function neonMaterial(mode, base) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.45, envMapIntensity: 0.5, flatShading: mode === 1 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vON; varying float vT; varying float vIID; varying float vDist;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
          vec3 org = instanceMatrix[3].xyz;
          vec3 ax = normalize(instanceMatrix[0].xyz), az = normalize(instanceMatrix[2].xyz);
        #else
          vec3 org = vec3(0.0); vec3 ax = vec3(1.0, 0.0, 0.0), az = vec3(0.0, 0.0, 1.0);
        #endif
        wp4 = modelMatrix * wp4; vWP = wp4.xyz; vON = normal;
        vT = dot(vWP - org, abs(normal.x) > 0.5 ? az : ax);
        vIID = float(gl_InstanceID); vDist = -mvPosition.z;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vON; varying float vT; varying float vIID; varying float vDist;\nfloat h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace('#include <color_fragment>', '')   // the instance colour is the neon tint, not the body colour
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 tint = vec3(1.0);
        #ifdef USE_COLOR
          tint = vColor.rgb;
        #endif
        ${mode === 0 ? `
        float wall = 1.0 - step(0.5, abs(vON.y));
        vec2 cell = vec2(vT / 1.5, vWP.y / 2.3), fc = fract(cell), id = floor(cell);
        vec2 e = vec2(clamp(vDist * 0.0018, 0.01, 0.2));
        float win = smoothstep(0.2 - e.x, 0.2 + e.x, fc.x) * (1.0 - smoothstep(0.8 - e.x, 0.8 + e.x, fc.x)) * smoothstep(0.22 - e.y, 0.22 + e.y, fc.y) * (1.0 - smoothstep(0.72 - e.y, 0.72 + e.y, fc.y));
        float far = smoothstep(70.0, 170.0, vDist);     // far away, windows blend to their average glow instead of shimmering
        float r = h21(id + vIID * 7.31);
        float lit = step(0.62, r) * (0.5 + 0.5 * h21(id * 1.7 + 3.1));
        win = mix(win * lit, 0.13, far); lit = 1.0;
        vec3 wc = mix(tint, vec3(1.0, 0.85, 0.7), step(0.9, r) * (1.0 - far));     // a few warm white windows among the neon
        totalEmissiveRadiance += wc * win * lit * wall * 0.75;` : `
        float band = smoothstep(0.82, 0.9, fract(vWP.y / 3.2)) * (1.0 - smoothstep(0.9, 0.98, fract(vWP.y / 3.2)));
        totalEmissiveRadiance += tint * band * 2.2 + tint * 0.05;`}`);
  };
  m.customProgramCacheKey = () => 'dh-neon-' + mode;
  return m;
}

export function makeScenery(scene) {
  const make = (geo, mat, max) => { const m = new THREE.InstancedMesh(geo, mat, max); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
  const palm = palmGeometry();
  const glow = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const tinted = (base, emissive) => {
    const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.6, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: emissive, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif'); };
    m.customProgramCacheKey = () => 'dh-tinted-' + emissive;
    return m;
  };
  const kit = {
    tower: make(new THREE.BoxGeometry(1, 1, 1), neonMaterial(0, 0x140a1e), 220),
    pyramid: make(new THREE.ConeGeometry(0.71, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), neonMaterial(1, 0x12081c), 40),
    rim: make(new THREE.TorusGeometry(1, 0.03, 4, 28).rotateX(Math.PI / 2), glow(), 60),
    trim: make(new THREE.BoxGeometry(1, 1, 1), glow(), 700),            // roof rings, ledges, antennas, island rims
    beacon: make(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.3), toneMapped: false }), 200),
    island: make(islandGeometry(), new THREE.MeshStandardMaterial({ color: 0x24142e, roughness: 0.85, metalness: 0.05, flatShading: true }), 60),
    trunk: make(palm.trunk, new THREE.MeshStandardMaterial({ color: 0x2a1626, roughness: 0.8, metalness: 0.05 }), 160),
    fronds: make(palm.fronds, tinted(0x0c0a10, 0.55), 160),
  };
  return kit;
}
