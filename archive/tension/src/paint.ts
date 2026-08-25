import * as THREE from 'three';

// ------------------------------------------------------------------
// Hand-painted textures, authored in code. Layered soft gradients,
// blurred strokes, and rim light — the painterly language of the
// reference boards, produced on offscreen canvases.
// ------------------------------------------------------------------

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function softBlob(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, blur = 0) {
  const gr = g.createRadialGradient(x, y, r * 0.05, x, y, r);
  gr.addColorStop(0, col);
  gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  g.save();
  if (blur) g.filter = `blur(${blur}px)`;
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.restore();
}

// ---------------- the night-garden backdrop ----------------
export function paintBackdrop(): THREE.Texture {
  const { c, g } = canvas(2048, 1024);
  // deep night gradient
  const sky = g.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, '#03030c');
  sky.addColorStop(0.42, '#090a1e');
  sky.addColorStop(0.75, '#100c28');
  sky.addColorStop(1, '#130e2c');
  g.fillStyle = sky; g.fillRect(0, 0, 2048, 1024);

  // the moon — huge, soft, off-center left
  softBlob(g, 620, 240, 340, 'rgba(140,165,220,0.20)');
  softBlob(g, 620, 240, 200, 'rgba(175,195,240,0.30)');
  softBlob(g, 620, 240, 120, 'rgba(225,235,255,0.85)');
  softBlob(g, 620, 240, 96, 'rgba(245,250,255,0.95)');
  // faint craters
  g.save(); g.globalAlpha = 0.12; g.filter = 'blur(6px)';
  g.fillStyle = '#8fa5c8';
  g.beginPath(); g.arc(585, 210, 22, 0, 7); g.fill();
  g.beginPath(); g.arc(660, 265, 15, 0, 7); g.fill();
  g.beginPath(); g.arc(620, 300, 10, 0, 7); g.fill();
  g.restore();

  // stars
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 2048, y = Math.random() * 560;
    const a = 0.15 + Math.random() * 0.5;
    g.fillStyle = `rgba(200,214,245,${a})`;
    const s = Math.random() < 0.08 ? 2.2 : 1.2;
    g.fillRect(x, y, s, s);
  }

  // hazy distant foliage masses (bottom half), painterly layers
  const masses: [number, number, number, string, number][] = [
    [220, 940, 300, 'rgba(30,16,60,0.9)', 30],
    [700, 990, 340, 'rgba(38,20,74,0.85)', 34],
    [1250, 950, 320, 'rgba(26,14,56,0.9)', 30],
    [1800, 1000, 360, 'rgba(40,22,80,0.8)', 36],
    [450, 1030, 260, 'rgba(52,28,96,0.75)', 26],
    [1550, 1040, 280, 'rgba(48,26,92,0.75)', 28],
  ];
  for (const [x, y, r, col, bl] of masses) softBlob(g, x, y, r, col, bl);

  // solid dark foliage silhouette band along the bottom
  g.save(); g.filter = 'blur(14px)';
  g.fillStyle = 'rgba(10,6,24,0.95)';
  g.beginPath();
  g.moveTo(0, 1024);
  for (let x = 0; x <= 2048; x += 64) {
    g.lineTo(x, 900 - Math.sin(x * 0.004) * 46 - Math.sin(x * 0.013 + 2) * 30);
  }
  g.lineTo(2048, 1024);
  g.fill();
  g.restore();

  // blurred violet flower hints inside the masses
  g.save(); g.filter = 'blur(9px)';
  for (let i = 0; i < 14; i++) {
    const x = 100 + Math.random() * 1850;
    const y = 870 + Math.random() * 140;
    const r = 9 + Math.random() * 15;
    const hue = 265 + Math.random() * 25;
    g.fillStyle = `hsla(${hue}, 60%, ${38 + Math.random() * 18}%, 0.5)`;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + Math.random();
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.35, r * 0.5, r * 0.24, a, 0, 7);
      g.fill();
    }
    softBlob(g, x, y, r * 0.3, 'rgba(255,190,120,0.5)');
  }
  g.restore();

  // warm bokeh fireflies drifting in the depth
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 2048, y = 500 + Math.random() * 480;
    softBlob(g, x, y, 6 + Math.random() * 22, `rgba(255,${170 + Math.random() * 50 | 0},90,${0.10 + Math.random() * 0.16})`);
  }
  // cool bokeh
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 2048, y = 420 + Math.random() * 520;
    softBlob(g, x, y, 8 + Math.random() * 18, `rgba(140,170,240,${0.06 + Math.random() * 0.10})`);
  }
  // atmospheric mist band above the foliage
  g.save(); g.filter = 'blur(26px)';
  g.fillStyle = 'rgba(70,60,120,0.10)';
  g.fillRect(0, 660, 2048, 140);
  g.restore();

  return tex(c);
}

// ---------------- luminous violet flower (billboard) ----------------
export function paintFlower(seed = 0): THREE.Texture {
  const { c, g } = canvas(256, 256);
  const cx = 128, cy = 138;
  const P = 7 + (seed % 2);
  g.save();
  g.filter = 'blur(1.5px)';
  for (let p = 0; p < P; p++) {
    const a = (p / P) * Math.PI * 2 + seed * 0.7;
    const len = 84 + Math.sin(seed * 3 + p) * 10;
    const grd = g.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    grd.addColorStop(0, 'rgba(120,60,190,0.95)');
    grd.addColorStop(0.65, 'rgba(84,38,150,0.9)');
    grd.addColorStop(1, 'rgba(40,16,84,0.85)');
    g.fillStyle = grd;
    g.save();
    g.translate(cx, cy); g.rotate(a);
    g.beginPath();
    g.moveTo(6, 0);
    g.quadraticCurveTo(len * 0.45, -26 - (seed % 3) * 3, len, 0);
    g.quadraticCurveTo(len * 0.45, 26 + (seed % 3) * 3, 6, 0);
    g.fill();
    // petal vein highlight
    g.strokeStyle = 'rgba(190,140,255,0.35)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(len * 0.5, 0, len * 0.9, 0); g.stroke();
    g.restore();
  }
  g.restore();
  // luminous heart
  softBlob(g, cx, cy, 44, 'rgba(255,190,110,0.55)');
  softBlob(g, cx, cy, 24, 'rgba(255,220,160,0.95)');
  softBlob(g, cx, cy, 12, 'rgba(255,245,220,1)');
  // stamen dots
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    softBlob(g, cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 5, 'rgba(255,205,130,0.9)');
  }
  return tex(c);
}

// ---------------- the spirit: painted character parts ----------------
export interface SpiritParts { body: THREE.Texture; ear: THREE.Texture; }
export function paintSpirit(): SpiritParts {
  // body with face (front-3/4), 256x256
  const { c, g } = canvas(256, 256);
  // soft outer glow
  softBlob(g, 128, 148, 110, 'rgba(255,180,90,0.28)');
  // body: pear silhouette, cream→gold
  g.save();
  g.filter = 'blur(0.6px)';
  const body = g.createRadialGradient(118, 120, 20, 128, 150, 95);
  body.addColorStop(0, '#fff8ea');
  body.addColorStop(0.55, '#ffe9c4');
  body.addColorStop(0.85, '#f8c98c');
  body.addColorStop(1, '#e8a860');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(128, 52);
  g.bezierCurveTo(180, 52, 198, 108, 192, 152);
  g.bezierCurveTo(188, 204, 162, 228, 128, 228);
  g.bezierCurveTo(94, 228, 68, 204, 64, 152);
  g.bezierCurveTo(58, 108, 76, 52, 128, 52);
  g.fill();
  g.restore();
  // belly light
  softBlob(g, 128, 178, 44, 'rgba(255,250,235,0.85)');
  // warm rim light left, cool rim right
  g.save(); g.globalCompositeOperation = 'source-atop';
  const rimL = g.createLinearGradient(50, 0, 130, 0);
  rimL.addColorStop(0, 'rgba(255,200,120,0.55)'); rimL.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = rimL; g.fillRect(40, 40, 100, 200);
  const rimR = g.createLinearGradient(210, 0, 150, 0);
  rimR.addColorStop(0, 'rgba(150,170,255,0.35)'); rimR.addColorStop(1, 'rgba(150,170,255,0)');
  g.fillStyle = rimR; g.fillRect(150, 40, 70, 200);
  g.restore();
  // face: big dark eyes with glints, tiny mouth
  for (const ex of [98, 158]) {
    g.fillStyle = '#3a2416';
    g.beginPath(); g.ellipse(ex, 128, 11, 15, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(ex - 3.5, 121, 3.6, 0, 7); g.fill();
    g.beginPath(); g.arc(ex + 3, 133, 1.8, 0, 7); g.fill();
  }
  g.strokeStyle = '#7a4a28'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.arc(128, 148, 7, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  // blush
  softBlob(g, 88, 150, 12, 'rgba(255,150,110,0.30)');
  softBlob(g, 168, 150, 12, 'rgba(255,150,110,0.30)');
  // little feet nubs
  for (const fx of [104, 152]) {
    g.fillStyle = '#f0bc80';
    g.beginPath(); g.ellipse(fx, 226, 14, 8, 0, 0, 7); g.fill();
  }
  // tiny arms
  for (const [ax, rot] of [[70, 0.5], [186, -0.5]] as [number, number][]) {
    g.save(); g.translate(ax, 168); g.rotate(rot);
    g.fillStyle = '#f8d4a0';
    g.beginPath(); g.ellipse(0, 0, 9, 16, 0, 0, 7); g.fill();
    g.restore();
  }

  // ear (painted separately so it can sway), 96x224, anchor at bottom center
  const e = canvas(96, 224);
  const eg = e.g;
  eg.save();
  eg.filter = 'blur(0.6px)';
  const earG = eg.createLinearGradient(0, 224, 0, 0);
  earG.addColorStop(0, '#f2c288');
  earG.addColorStop(0.6, '#ffe6bc');
  earG.addColorStop(1, '#fff4dd');
  eg.fillStyle = earG;
  eg.beginPath();
  eg.moveTo(48, 218);
  eg.bezierCurveTo(10, 170, 14, 60, 40, 14);
  eg.bezierCurveTo(48, 2, 58, 4, 64, 18);
  eg.bezierCurveTo(84, 70, 82, 170, 48, 218);
  eg.fill();
  eg.restore();
  // inner ear
  const inner = eg.createLinearGradient(0, 200, 0, 30);
  inner.addColorStop(0, 'rgba(255,170,130,0.0)');
  inner.addColorStop(0.5, 'rgba(255,170,130,0.55)');
  inner.addColorStop(1, 'rgba(255,150,120,0.75)');
  eg.fillStyle = inner;
  eg.beginPath();
  eg.moveTo(48, 200);
  eg.bezierCurveTo(28, 160, 30, 70, 47, 32);
  eg.bezierCurveTo(52, 24, 58, 26, 61, 36);
  eg.bezierCurveTo(72, 80, 68, 160, 48, 200);
  eg.fill();

  return { body: tex(c), ear: tex(e.c) };
}

// ---------------- the spider: painted body, top view ----------------
export function paintSpiderBody(): THREE.Texture {
  const { c, g } = canvas(256, 320);
  // faint aura
  softBlob(g, 128, 190, 110, 'rgba(60,30,90,0.30)');
  // abdomen: large teardrop, iridescent
  g.save();
  g.filter = 'blur(0.5px)';
  const ab = g.createRadialGradient(112, 170, 12, 128, 200, 105);
  ab.addColorStop(0, '#3d2c58');
  ab.addColorStop(0.45, '#221838');
  ab.addColorStop(1, '#0e0a1a');
  g.fillStyle = ab;
  g.beginPath();
  g.moveTo(128, 96);
  g.bezierCurveTo(196, 110, 206, 210, 178, 268);
  g.bezierCurveTo(158, 302, 98, 302, 78, 268);
  g.bezierCurveTo(50, 210, 60, 110, 128, 96);
  g.fill();
  g.restore();
  // iridescent sheen strokes
  g.save(); g.globalCompositeOperation = 'source-atop'; g.filter = 'blur(4px)';
  g.fillStyle = 'rgba(120,220,200,0.16)';
  g.beginPath(); g.ellipse(100, 160, 34, 60, 0.4, 0, 7); g.fill();
  g.fillStyle = 'rgba(180,110,255,0.16)';
  g.beginPath(); g.ellipse(160, 210, 30, 54, -0.3, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,150,150,0.10)';
  g.beginPath(); g.ellipse(130, 260, 40, 26, 0, 0, 7); g.fill();
  g.restore();
  // pale skull-ish marking, subtle
  g.save(); g.globalAlpha = 0.14; g.filter = 'blur(2px)';
  g.fillStyle = '#cfd8ea';
  g.beginPath(); g.ellipse(128, 180, 22, 30, 0, 0, 7); g.fill();
  g.restore();
  // cephalothorax
  const ce = g.createRadialGradient(120, 60, 6, 128, 70, 42);
  ce.addColorStop(0, '#2e2244');
  ce.addColorStop(1, '#0c0916');
  g.fillStyle = ce;
  g.beginPath(); g.ellipse(128, 66, 38, 34, 0, 0, 7); g.fill();
  // eyes: reflective points
  for (const [x, y, r] of [[112, 46, 4.5], [144, 46, 4.5], [120, 36, 3], [136, 36, 3]] as [number, number, number][]) {
    softBlob(g, x, y, r * 2.4, 'rgba(255,80,60,0.5)');
    g.fillStyle = '#ffd9c0';
    g.beginPath(); g.arc(x, y, r * 0.55, 0, 7); g.fill();
  }
  // spinneret glint
  softBlob(g, 128, 296, 7, 'rgba(190,210,255,0.6)');
  return tex(c);
}
