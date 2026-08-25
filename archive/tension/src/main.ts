import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildTestWeb } from './web';
import { VibrationField, glowTexture } from './vibration';
import { Player } from './player';
import { Spider } from './spider';
import { buildOrbWeb, buildForegroundBokeh } from './decor';
import { paintBackdrop, paintFlower } from './paint';

// ------------------------------------------------------------------
// TENSION — phase 1 mechanical prototype
// ------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0c0c26, 0.0085);

// custom night environment: soft gradient + one bright moon blob, so dew and
// silk pick up believable moonlit reflections (no square light artifacts)
{
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1a2350');
  grad.addColorStop(0.5, '#0c0f2c');
  grad.addColorStop(0.8, '#1c1440');
  grad.addColorStop(1, '#241a4e');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  const moonG = g.createRadialGradient(150, 70, 4, 150, 70, 60);
  moonG.addColorStop(0, 'rgba(255,255,255,1)');
  moonG.addColorStop(0.2, 'rgba(200,220,255,0.7)');
  moonG.addColorStop(1, 'rgba(160,190,255,0)');
  g.fillStyle = moonG; g.fillRect(0, 0, 512, 256);
  const warmG = g.createRadialGradient(380, 190, 4, 380, 190, 70);
  warmG.addColorStop(0, 'rgba(255,190,110,0.5)');
  warmG.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = warmG; g.fillRect(0, 0, 512, 256);
  const envTex = new THREE.CanvasTexture(c);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
}

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 800);

// gradient night-sky dome (immune to fog)
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false,
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y * 0.5 + 0.5;
        vec3 deep = vec3(0.006, 0.008, 0.026);
        vec3 mid  = vec3(0.012, 0.013, 0.040);
        vec3 low  = vec3(0.016, 0.012, 0.045);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.45, h));
        c = mix(c, deep, smoothstep(0.45, 1.0, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), skyMat);
  scene.add(dome);
}
// stars pinned to the dome
{
  const N = 400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.85);
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * 560;
    pos[i * 3 + 1] = Math.cos(ph) * 560;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 560;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xaebfe8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false,
  }));
  scene.add(stars);
}

// ---------------- atmosphere ----------------
scene.add(new THREE.AmbientLight(0x2a3860, 0.42));
const moonLight = new THREE.DirectionalLight(0x8fa8e0, 0.8);
moonLight.position.set(-30, 60, -40);
scene.add(moonLight);

// hand-painted night-garden backdrop (moon, foliage, bokeh all painted in)
const glowTex = glowTexture();
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(940, 500),
  new THREE.MeshBasicMaterial({ map: paintBackdrop(), fog: false, depthWrite: false }),
);
backdrop.position.set(0, 4, -270);
scene.add(backdrop);

// painted violet flowers — swaying billboards
const flowerTexA = paintFlower(1), flowerTexB = paintFlower(2);
const flowers: THREE.Sprite[] = [];
function flower(x: number, y: number, z: number, scale: number, variant = 0) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: variant ? flowerTexB : flowerTexA, transparent: true, depthWrite: false,
  }));
  s.position.set(x, y, z);
  s.scale.set(9 * scale, 9 * scale, 1);
  (s as any).ph = Math.random() * 7;
  scene.add(s);
  flowers.push(s);
  return s;
}
flower(-18, -20, -44, 1.1, 1);
flower(-70, -18, -20, 1.0, 1);
flower(-30, -26, -60, 1.2, 0);
flower(8, -30, -70, 1.0, 1);

// ---------------- the garden beneath: layered, oversized ----------------
// dark reflective water far below
{
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({
      color: 0x060814, metalness: 0.92, roughness: 0.22, envMapIntensity: 0.6,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -42;
  scene.add(water);
  // moon glint on the water
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x9fb8e8, transparent: true, opacity: 0.30,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glint.scale.set(70, 26, 1);
  glint.position.set(-40, -41, -60);
  scene.add(glint);
}

// giant 3D flowers whose heads dwarf the player, stems sinking into mist
function giantFlower(x: number, y: number, z: number, scale: number, hue: number) {
  const g = new THREE.Group();
  const petalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.55, 0.42),
    emissive: new THREE.Color().setHSL(hue, 0.7, 0.16),
    emissiveIntensity: 0.8, roughness: 0.6, side: THREE.DoubleSide,
  });
  const P = 8;
  for (let p = 0; p < P; p++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), petalMat);
    petal.scale.set(1.1, 0.16, 2.6);
    const a = (p / P) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4);
    petal.rotation.y = -a + Math.PI / 2;
    petal.rotation.x = -0.26;
    g.add(petal);
  }
  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa844, emissiveIntensity: 1.6 }),
  );
  heart.position.y = 0.35;
  g.add(heart);
  const hglow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc070, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  hglow.scale.set(7, 7, 1);
  hglow.position.y = 0.8;
  g.add(hglow);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 30, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a2e26, roughness: 0.8 }),
  );
  stem.position.y = -15.4;
  g.add(stem);
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  scene.add(g);
  return g;
}
giantFlower(-40, -12, 18, 1.7, 0.76);      // large, near the start, below the web
giantFlower(24, -16, -34, 2.2, 0.72);      // deeper, near the cocoon's side
giantFlower(58, -14, 6, 1.4, 0.80);
giantFlower(-14, -18, 34, 1.5, 0.74);

// broad leaves arcing through the middle depth
{
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x14322a, emissive: 0x0a2018, emissiveIntensity: 0.4,
    roughness: 0.65, side: THREE.DoubleSide,
  });
  const leafSpots: [number, number, number, number, number][] = [
    [-58, -16, -2, 0.9, 0.5], [46, -18, 28, 0.8, -0.7], [-26, -22, -58, 1.1, 0.2],
  ];
  for (const [x, y, z, sc, rot] of leafSpots) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), leafMat);
    leaf.scale.set(1.2 * sc, 0.10 * sc, 2.6 * sc);
    leaf.rotation.set(-0.9, rot, 0.3);
    leaf.position.set(x, y, z);
    scene.add(leaf);
  }
}

// drifting mist sheets
const mists: THREE.Sprite[] = [];
for (let i = 0; i < 14; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x6f85b0, transparent: true, opacity: 0.025 + Math.random() * 0.03,
    blending: THREE.NormalBlending, depthWrite: false,
  }));
  const sc = 30 + Math.random() * 50;
  s.scale.set(sc, sc * 0.35, 1);
  s.position.set((Math.random() - 0.5) * 160, -14 + Math.random() * 18, (Math.random() - 0.5) * 120);
  (s as any).v = 0.3 + Math.random() * 0.6;
  scene.add(s);
  mists.push(s);
}

// floating pollen / fireflies
{
  const N = 220;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 160;
    pos[i * 3 + 1] = -20 + Math.random() * 50;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pollen = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTex, color: 0xcfe0b0, size: 0.9, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(pollen);
}

// ---------------- the web ----------------
const web = buildTestWeb();
web.buildMeshes(scene);

// decorative orb web surrounding the playable graph — the density of the boards
buildOrbWeb(scene, glowTexture(), {
  center: new THREE.Vector3(0, -1.2, -8),
  radius: 46, spokes: 26, rings: 16, yJitter: 2.2, alpha: 0.22, dewChance: 0.11,
});
// a second, higher partial layer so silk overlaps at multiple depths
buildOrbWeb(scene, glowTexture(), {
  center: new THREE.Vector3(14, 8.5, -34),
  radius: 30, spokes: 20, rings: 10, yJitter: 3.0, alpha: 0.13, dewChance: 0.06,
});

// chaos silk: organic connector strands with no gameplay logic
{
  const silkMat = new THREE.MeshPhysicalMaterial({
    color: 0xaec2e8, emissive: 0x3a54a0, emissiveIntensity: 0.35,
    roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.55,
    iridescence: 0.6, envMapIntensity: 0.35,
  });
  const rng = (a: number) => {
    const x = Math.sin(a * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 44; i++) {
    const na = web.nodes[Math.floor(rng(i * 3.1) * web.nodes.length)];
    const nb = web.nodes[Math.floor(rng(i * 7.7) * web.nodes.length)];
    if (na.id === nb.id) continue;
    const a = na.pos.clone().add(new THREE.Vector3((rng(i) - 0.5) * 14, (rng(i * 1.3) - 0.5) * 7, (rng(i * 2.1) - 0.5) * 14));
    const b = nb.pos.clone().add(new THREE.Vector3((rng(i * 4.7) - 0.5) * 14, (rng(i * 5.9) - 0.5) * 7, (rng(i * 8.3) - 0.5) * 14));
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 1.2 + rng(i * 9.1) * 3.2;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 14, 0.018 + rng(i * 11.3) * 0.03, 4, false),
      silkMat,
    );
    scene.add(tube);
  }
}
// distant background webs, fainter
buildOrbWeb(scene, glowTexture(), {
  center: new THREE.Vector3(-62, 6, -70),
  radius: 22, spokes: 16, rings: 9, yJitter: 3.5, alpha: 0.12, dewChance: 0.05,
});
buildOrbWeb(scene, glowTexture(), {
  center: new THREE.Vector3(55, 10, -85),
  radius: 26, spokes: 18, rings: 10, yJitter: 3.0, alpha: 0.10, dewChance: 0.04,
});

// dew beads: iridescent drops clinging to the silk (repositioned live)
interface Dew { edgeId: number; t: number; mesh: THREE.Mesh; glint: THREE.Sprite; }
const dews: Dew[] = [];
{
  const dewMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfd8ff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.65,
    emissive: 0x6f9fdf, emissiveIntensity: 0.35, clearcoat: 1.0,
  });
  const spots: [number, number, number][] = [
    [0, 0.35, 0.35], [1, 0.6, 0.5], [3, 0.4, 0.42], [5, 0.5, 0.72],
    [6, 0.3, 0.38], [7, 0.65, 0.55], [8, 0.25, 0.32], [10, 0.5, 0.62],
  ];
  for (const [edgeId, t, size] of spots) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 12), dewMat);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xdfeaff, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glint.scale.set(size * 1.6, size * 1.6, 1);
    scene.add(mesh, glint);
    dews.push({ edgeId, t, mesh, glint });
  }
}
// giant refractive dew beads — bigger than the player, distort the world behind
const giantDews: { edgeId: number; t: number; mesh: THREE.Mesh; glint: THREE.Sprite }[] = [];
{
  // faked refraction: translucent shell + inner inverted-moon highlight + rim
  const giantMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe0ff, roughness: 0.05, metalness: 0,
    transparent: true, opacity: 0.30, envMapIntensity: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.35,
    depthWrite: false,
  });
  const spots: [number, number, number][] = [
    [0, 0.55, 2.6],    // right beside the start — visible immediately
    [2, 0.5, 3.1],
    [8, 0.35, 2.2],
  ];
  for (const [edgeId, t, size] of spots) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), giantMat);
    mesh.scale.y = 0.94;
    // internal refracted moon (upside-down, low in the drop)
    const innerMoon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xdfeaff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    innerMoon.scale.set(size * 0.7, size * 0.7, 1);
    innerMoon.position.set(size * 0.12, -size * 0.3, 0);
    mesh.add(innerMoon);
    // caught world-color shimmer at the base
    const innerWarm = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xb08cff, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    innerWarm.scale.set(size * 0.9, size * 0.5, 1);
    innerWarm.position.set(-size * 0.15, -size * 0.42, 0);
    mesh.add(innerWarm);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glint.scale.set(size * 0.45, size * 0.45, 1);
    scene.add(mesh, glint);
    giantDews.push({ edgeId, t, mesh, glint });
  }
}

// the cocoon — warm heart of the web, visible deeper in
const cocoon = new THREE.Group();
let cocoonLight: THREE.PointLight;
{
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffe8c0, emissive: 0xffb050, emissiveIntensity: 0.85,
      roughness: 0.55,
    }),
  );
  shell.scale.set(1, 1.45, 1);
  cocoon.add(shell);
  // silk wrap lines
  const wrapMat = new THREE.MeshBasicMaterial({ color: 0xfff4dd, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 5; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.045, 6, 24), wrapMat);
    wrap.rotation.x = Math.PI / 2;
    wrap.rotation.y = (i - 2) * 0.35;
    wrap.position.y = (i - 2) * 0.52;
    wrap.scale.setScalar(1 - Math.abs(i - 2) * 0.16);
    cocoon.add(wrap);
  }
  cocoonLight = new THREE.PointLight(0xffb050, 60, 44, 2);
  cocoon.add(cocoonLight);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc070, transparent: true, opacity: 0.8, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(15, 15, 1);
  cocoon.add(glow);
  // hangs from the far lower anchor (node 8), below the strand
  const n8 = web.nodes[8].pos;
  cocoon.position.set(n8.x, n8.y - 3.4, n8.z);
  // hanging thread
  const thread = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5),
    new THREE.MeshBasicMaterial({ color: 0xcfdcf4, transparent: true, opacity: 0.7 }),
  );
  thread.position.y = 2.4;
  cocoon.add(thread);
  scene.add(cocoon);
}

function updateDews(now = 0) {
  for (const d of dews) {
    const e = web.edges[d.edgeId];
    const p = e.curve.getPoint(d.t);
    d.mesh.position.copy(p);
    d.mesh.position.y -= 0.25;
    // jiggle when the strand is excited by a passing vibration
    if (e.mesh) {
      const mat = e.mesh.material as THREE.MeshStandardMaterial;
      const excite = Math.max(0, mat.emissiveIntensity - (0.5 + e.tension * 1.1));
      if (excite > 0.01) {
        d.mesh.position.y += Math.sin(now * 34 + d.t * 20) * excite * 0.35;
        d.mesh.position.x += Math.sin(now * 41 + d.t * 9) * excite * 0.2;
      }
    }
    d.glint.position.copy(d.mesh.position);
    d.glint.position.x -= 0.2; d.glint.position.y += 0.25;
  }
  for (const d of giantDews) {
    const e = web.edges[d.edgeId];
    const p = e.curve.getPoint(d.t);
    d.mesh.position.copy(p);
    d.mesh.position.y -= (d.mesh.geometry as THREE.SphereGeometry).parameters.radius * 0.55;
    d.mesh.position.y += Math.sin(now * 1.1 + d.t * 9) * 0.05;
    d.glint.position.copy(d.mesh.position);
    const r = (d.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    d.glint.position.x -= r * 0.35;
    d.glint.position.y += r * 0.45;
  }
  // cocoon heartbeat
  cocoonLight.intensity = 34 + Math.sin(now * 1.6) * 10;
  cocoon.rotation.y = Math.sin(now * 0.4) * 0.15;
}
updateDews();

// player glow trail
const trail: { s: THREE.Sprite; life: number }[] = [];
let trailTimer = 0;

const vib = new VibrationField(web, glowTex);
scene.add(vib.group);

const player = new Player(web, vib, 0);
scene.add(player.mesh);

const spider = new Spider(web, 4);   // perch at node 4
scene.add(spider.mesh);

scene.add(camera);
buildForegroundBokeh(camera, glowTex);

vib.onArrival = (sig) => spider.hear(sig);

// ---------------- input ----------------
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

let pulling: number | null = null;
const mouse = new THREE.Vector2();
addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
});
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function inputVector(): THREE.Vector3 {
  // camera-relative WASD on the ground plane
  const v = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) v.z -= 1;
  if (keys.has('s') || keys.has('arrowdown')) v.z += 1;
  if (keys.has('a') || keys.has('arrowleft')) v.x -= 1;
  if (keys.has('d') || keys.has('arrowright')) v.x += 1;
  if (v.lengthSq() === 0) return v;
  v.normalize();
  const yaw = Math.atan2(camera.position.x - player.mesh.position.x, camera.position.z - player.mesh.position.z);
  v.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  v.y = 0;
  return v.normalize();
}

let pluckCooldown = 0;

// ---------------- minimal contextual teaching ----------------
const titleEl = document.getElementById('title')!;
const promptEl = document.getElementById('prompt')!;
setTimeout(() => { titleEl.style.opacity = '0'; }, 3800);
setTimeout(() => { titleEl.remove(); }, 7000);
const learned = { move: false, pull: false, pluck: false };
let promptShown = '';
function setPrompt(html: string) {
  if (promptShown === html) return;
  promptShown = html;
  promptEl.innerHTML = html;
  promptEl.style.opacity = html ? '0.85' : '0';
}

// ---------------- loop ----------------
const clock = new THREE.Clock();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.74));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// debug/capture hook: lets tooling force a render and grab a frame
(window as any).__T = {
  renderer, scene, camera, composer,
  capture(w = 1280, h = 720) {
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.render();
    return renderer.domElement.toDataURL('image/jpeg', 0.7);
  },
  step(dt = 0.016) { stepWorld(dt, clock.elapsedTime); },
};

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  const now = clock.elapsedTime;
  stepWorld(dt, now);
  composer.render();
}

function stepWorld(dt: number, now: number) {
  // --- interactions ---
  pluckCooldown = Math.max(0, pluckCooldown - dt);
  const nearNode = player.nearestNode(4.5);

  if (keys.has('e') && nearNode !== null && web.nodes[nearNode].pullable) {
    pulling = nearNode;
  }
  if (!keys.has('e')) pulling = null;

  if (pulling !== null) {
    // drag the knot toward where the mouse ray hits the web plane
    raycaster.setFromCamera(mouse, camera);
    const hit = new THREE.Vector3();
    dragPlane.constant = -web.nodes[pulling].home.y;
    if (raycaster.ray.intersectPlane(dragPlane, hit)) {
      web.dragNode(pulling, hit);
      // pulling itself makes a small vibration
      if (Math.random() < dt * 4) vib.emitFromNode(pulling, 0.05);
    }
  }

  if (keys.has('q') && pluckCooldown <= 0) {
    pluckCooldown = 0.6;
    vib.emitFromEdgePoint(player.edgeId, player.t, 0.85);
    learned.pluck = true;
  }

  // contextual prompts, each disappears once used
  if (player.speedNow > 0.2) learned.move = true;
  if (pulling !== null) learned.pull = true;
  if (!learned.move && clock.elapsedTime > 6) setPrompt('<b>W A S D</b> &nbsp;—&nbsp; step softly');
  else if (!learned.pull && nearNode !== null && web.nodes[nearNode].pullable) setPrompt('hold <b>E</b> &nbsp;—&nbsp; pull the silk');
  else if (learned.pull && !learned.pluck && clock.elapsedTime > 20) setPrompt('<b>Q</b> &nbsp;—&nbsp; pluck a strand… something will listen');
  else setPrompt('');

  // --- systems ---
  player.update(dt, inputVector(), now);
  vib.update(dt, now);
  spider.update(dt, now);
  web.decayExcitement(dt);
  web.updateMeshes();
  updateDews(now);

  // mist drift
  for (const s of mists) {
    s.position.x += (s as any).v * dt;
    if (s.position.x > 100) s.position.x = -100;
  }
  // flowers sway
  for (const f of flowers) {
    const ph = (f as any).ph;
    (f.material as THREE.SpriteMaterial).rotation = Math.sin(now * 0.7 + ph) * 0.07;
    f.position.y += Math.sin(now * 0.9 + ph) * 0.004;
  }
  // backdrop parallax breathes against the camera
  backdrop.position.x = -camera.position.x * 0.18;

  // player glow trail
  trailTimer -= dt;
  if (trailTimer <= 0 && player.speedNow > 0.05) {
    trailTimer = 0.07;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffb060, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.position.copy(player.mesh.position);
    s.scale.set(1.6, 1.6, 1);
    scene.add(s);
    trail.push({ s, life: 1 });
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    const tr = trail[i];
    tr.life -= dt * 1.6;
    if (tr.life <= 0) { scene.remove(tr.s); trail.splice(i, 1); continue; }
    (tr.s.material as THREE.SpriteMaterial).opacity = 0.45 * tr.life;
    tr.s.scale.setScalar(1.6 * (0.5 + tr.life * 0.5));
  }

  // --- camera: low oblique, close — the creature is tiny inside a huge world ---
  const target = player.mesh.position;
  const camGoal = new THREE.Vector3(target.x + 5.5, target.y + 5.2, target.z + 13.5);
  camera.position.lerp(camGoal, 1 - Math.pow(0.001, dt));
  camera.lookAt(target.x - 2, target.y + 1.2, target.z - 14);
}
tick();
