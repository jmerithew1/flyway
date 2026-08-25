import * as THREE from 'three';

// ------------------------------------------------------------------
// Decorative web: the visual density the gameplay graph can't give.
// A full orb web (radial spokes + sagging spiral rings) rendered as
// one LineSegments draw call, plus instanced dew beads with glints.
// Purely cosmetic — sits slightly below the playable silk.
// ------------------------------------------------------------------

export interface OrbWebOptions {
  center: THREE.Vector3;
  radius: number;
  spokes: number;
  rings: number;
  yJitter: number;
  alpha: number;
  dewChance: number;
}

export function buildOrbWeb(scene: THREE.Scene, glowTex: THREE.Texture, opts: OrbWebOptions) {
  const { center, radius, spokes, rings, yJitter, alpha, dewChance } = opts;
  const verts: number[] = [];
  const dewPts: THREE.Vector3[] = [];

  const spokeDirs: THREE.Vector3[] = [];
  const spokeY: number[] = [];
  for (let s = 0; s < spokes; s++) {
    const a = (s / spokes) * Math.PI * 2 + Math.sin(s * 7.3) * 0.06;
    spokeDirs.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    spokeY.push((Math.sin(s * 3.7) * 0.5 + Math.sin(s * 1.3)) * yJitter);
  }

  const pointAt = (s: number, r: number): THREE.Vector3 => {
    const d = spokeDirs[s % spokes];
    const f = r / radius;
    return new THREE.Vector3(
      center.x + d.x * r,
      center.y + spokeY[s % spokes] * f - Math.sin(f * Math.PI) * 0.4,
      center.z + d.z * r,
    );
  };

  // spokes
  for (let s = 0; s < spokes; s++) {
    const SEG = 7;
    for (let i = 0; i < SEG; i++) {
      const r0 = (i / SEG) * radius, r1 = ((i + 1) / SEG) * radius;
      const p0 = pointAt(s, Math.max(1.2, r0));
      const p1 = pointAt(s, r1);
      verts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  }

  // spiral rings with sag between spokes
  for (let ring = 0; ring < rings; ring++) {
    const r = 3 + (ring / (rings - 1)) * (radius - 4) * (0.92 + Math.sin(ring * 2.1) * 0.04);
    const sag = 0.28 + (r / radius) * 0.55;
    for (let s = 0; s < spokes; s++) {
      const a = pointAt(s, r);
      const b = pointAt(s + 1, r + Math.sin(ring + s) * 0.3);
      const SUB = 4;
      let prev = a;
      for (let i = 1; i <= SUB; i++) {
        const f = i / SUB;
        const p = a.clone().lerp(b, f);
        p.y -= Math.sin(f * Math.PI) * sag;
        verts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        if (Math.random() < dewChance) dewPts.push(p.clone());
        prev = p;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xaec6ee, transparent: true, opacity: alpha,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  scene.add(lines);

  // dew beads — instanced tiny spheres + additive glint points
  if (dewPts.length > 0) {
    const bead = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xcfe2ff, emissive: 0x7fa8e8, emissiveIntensity: 0.9,
        roughness: 0.1, metalness: 0.1,
      }),
      dewPts.length,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < dewPts.length; i++) {
      const s = 0.05 + Math.random() * 0.13;
      m.makeScale(s, s, s);
      m.setPosition(dewPts[i].x, dewPts[i].y - 0.03, dewPts[i].z);
      bead.setMatrixAt(i, m);
    }
    scene.add(bead);

    const ggeo = new THREE.BufferGeometry();
    const gpos = new Float32Array(dewPts.length * 3);
    for (let i = 0; i < dewPts.length; i++) {
      gpos[i * 3] = dewPts[i].x;
      gpos[i * 3 + 1] = dewPts[i].y;
      gpos[i * 3 + 2] = dewPts[i].z;
    }
    ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    const glints = new THREE.Points(ggeo, new THREE.PointsMaterial({
      map: glowTex, color: 0xeaf2ff, size: 1.1, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(glints);
  }

  return lines;
}

/** Soft out-of-focus foreground foliage, parented to the camera (fake macro DOF). */
export function buildForegroundBokeh(camera: THREE.Camera, glowTex: THREE.Texture) {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 128;
  const g = cvs.getContext('2d')!;
  g.filter = 'blur(10px)';
  g.fillStyle = 'rgba(30,16,52,0.9)';
  g.beginPath(); g.ellipse(50, 70, 34, 52, -0.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(52,26,86,0.8)';
  g.beginPath(); g.ellipse(84, 60, 26, 44, 0.5, 0, 7); g.fill();
  const leafTex = new THREE.CanvasTexture(cvs);

  const group = new THREE.Group();
  const spots: [number, number, number, number, number][] = [
    [-13, -7, -16, 15, 0.5], [14, -8, -18, 18, 0.45],
    [-15, 8, -20, 14, 0.3], [12, 9, -22, 12, 0.25],
    [0, -11, -15, 16, 0.35],
  ];
  for (const [x, y, z, sc, op] of spots) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: leafTex, transparent: true, opacity: op, depthWrite: false, fog: false,
    }));
    s.position.set(x, y, z);
    s.scale.set(sc, sc, 1);
    group.add(s);
  }
  // a couple of warm bokeh discs (out-of-focus fireflies)
  for (const [x, y, z, sc, op] of [[-9, 4, -14, 3.2, 0.20], [11, -3, -13, 2.4, 0.16]] as [number, number, number, number, number][]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffc070, transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    s.position.set(x, y, z);
    s.scale.set(sc, sc, 1);
    group.add(s);
  }
  camera.add(group);
  return group;
}
