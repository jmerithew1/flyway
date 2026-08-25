import Phaser from 'phaser'

/**
 * Ruin silhouette kit — a small vocabulary of authored shapes so obstacles read
 * as designed architecture, not generated rectangles. Everything is flat-value
 * silhouette with a single sun-side rim light. Colliders stay simple; these
 * functions only draw.
 */

export const STONE = 0x453a5e
export const STONE_DARK = 0x362d4c
export const RIM = 0x93809f
export const FOLIAGE = 0x241a30
export const VINE = 0x2f3a2a

/** Deterministic pseudo-random from a seed — keeps broken edges stable. */
function jag(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Jagged broken top edge: a run of uneven stone stumps across [x0, x1]. */
export function brokenEdge(g: Phaser.GameObjects.Graphics, x0: number, x1: number, y: number, up: boolean): void {
  g.fillStyle(STONE, 1)
  const w = x1 - x0
  const teeth = Math.max(3, Math.round(w / 22))
  const tw = w / teeth
  for (let i = 0; i < teeth; i++) {
    const h = 6 + jag(x0 + y, i) * 18
    const tx = x0 + i * tw
    if (up) g.fillRect(tx, y - h, tw + 1, h)
    else g.fillRect(tx, y, tw + 1, h)
  }
}

/**
 * Broken column: shaft with entasis, base plinth, capital, jagged crown.
 * If yTop <= 0 the column runs off-screen and gets no crown.
 */
export function brokenColumn(
  g: Phaser.GameObjects.Graphics,
  x: number,
  yTop: number,
  yBottom: number,
  hw: number,
): void {
  g.fillStyle(STONE, 1)
  g.fillRect(x - hw, yTop, hw * 2, yBottom - yTop)
  // sun-side rim
  g.fillStyle(RIM, 0.45)
  g.fillRect(x - hw, yTop, 8, yBottom - yTop)
  // capital / plinth ledges at exposed ends
  g.fillStyle(STONE, 1)
  if (yTop > 4) {
    g.fillRect(x - hw - 12, yTop + 14, hw * 2 + 24, 14)
    brokenEdge(g, x - hw, x + hw, yTop + 15, true)
  }
  if (yBottom < 950) {
    g.fillRect(x - hw - 12, yBottom - 26, hw * 2 + 24, 16)
    g.fillRect(x - hw - 20, yBottom - 12, hw * 2 + 40, 12)
  }
  // one shadow seam line for stone coursing
  g.fillStyle(STONE_DARK, 0.55)
  const seams = Math.max(1, Math.floor((yBottom - yTop) / 90))
  for (let i = 1; i <= seams; i++) {
    const sy = yTop + ((yBottom - yTop) / (seams + 1)) * i
    g.fillRect(x - hw, sy, hw * 2, 4)
  }
}

/** Semicircular arch crown with keystone + springer ledges over a gap top. */
export function archCrown(g: Phaser.GameObjects.Graphics, x: number, gapTopY: number, span: number): void {
  const r = span / 2
  g.lineStyle(20, STONE, 1)
  g.beginPath()
  g.arc(x, gapTopY + r * 0.4, r, Math.PI * 1.12, Math.PI * 1.88)
  g.strokePath()
  // keystone
  g.fillStyle(STONE, 1)
  g.fillRect(x - 12, gapTopY - r * 0.62 - 4, 24, 26)
  // springers
  g.fillRect(x - r - 14, gapTopY + 2, 26, 14)
  g.fillRect(x + r - 12, gapTopY + 2, 26, 14)
}

/** Round stone window: ring with four radial voussoir ticks. */
export function roundWindow(g: Phaser.GameObjects.Graphics, x: number, cy: number, innerR: number): void {
  g.lineStyle(18, STONE, 1)
  g.strokeCircle(x, cy, innerR + 12)
  g.fillStyle(STONE, 1)
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + Math.PI / 4
    const rr = innerR + 12
    const kx = x + Math.cos(a) * rr
    const ky = cy + Math.sin(a) * rr
    g.fillRect(kx - 7, ky - 7, 14, 14)
  }
  // rim light on the sun side of the ring
  g.lineStyle(5, RIM, 0.4)
  g.beginPath()
  g.arc(x, cy, innerR + 18, Math.PI * 0.75, Math.PI * 1.25)
  g.strokePath()
}

/** Hanging vines: curved strands with leaf dots, from the underside of stone. */
export function vines(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const vx = x - width / 2 + (width / (count - 1 || 1)) * i
    const len = 28 + jag(x + y, i) * 46
    const sway = (jag(x, i) - 0.5) * 14
    g.lineStyle(3.5, VINE, 0.9)
    g.beginPath()
    g.moveTo(vx, y)
    g.lineTo(vx + sway * 0.4, y + len * 0.5)
    g.lineTo(vx + sway, y + len)
    g.strokePath()
    // leaf dots
    g.fillStyle(VINE, 0.9)
    g.fillCircle(vx + sway * 0.4, y + len * 0.5, 3)
    g.fillCircle(vx + sway, y + len, 3.5)
  }
}

/** Ground-level rubble mound blending stone into the foliage line. */
export function rubble(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): void {
  g.fillStyle(STONE, 1)
  g.fillRect(x - w * 0.3, y - 34, w * 0.6, 34)
  g.fillStyle(FOLIAGE, 1)
  g.fillEllipse(x, y + 18, w, 56)
  g.fillEllipse(x - w * 0.32, y + 8, w * 0.4, 36)
  g.fillEllipse(x + w * 0.3, y + 12, w * 0.45, 40)
}

/** Gothic pointed arch crown — two arcs meeting at a peak, taller and narrower-reading than archCrown. */
export function pointedArch(g: Phaser.GameObjects.Graphics, x: number, gapTopY: number, span: number): void {
  const r = span * 0.95
  g.lineStyle(17, STONE, 1)
  g.beginPath()
  g.arc(x - span * 0.24, gapTopY + span * 0.5, r, Math.PI * 1.28, Math.PI * 1.62)
  g.strokePath()
  g.beginPath()
  g.arc(x + span * 0.24, gapTopY + span * 0.5, r, Math.PI * 1.38, Math.PI * 1.72)
  g.strokePath()
  // apex finial
  g.fillStyle(STONE, 1)
  g.fillTriangle(x - 9, gapTopY - 6, x + 9, gapTopY - 6, x, gapTopY - 26)
  g.fillRect(x - 8, gapTopY - 8, 16, 14)
  // springers
  g.fillRect(x - span / 2 - 12, gapTopY + span * 0.36, 24, 14)
  g.fillRect(x + span / 2 - 12, gapTopY + span * 0.36, 24, 14)
}

/** Two small arches side by side spanning one wide opening, with a shared central pier. */
export function doubleArch(g: Phaser.GameObjects.Graphics, x: number, y0: number, y1: number, span: number): void {
  const half = span / 2
  const sub = half * 0.72
  for (const cx of [x - half / 2, x + half / 2]) {
    g.lineStyle(13, STONE, 1)
    g.beginPath()
    g.arc(cx, y0 + sub * 0.4, sub * 0.5, Math.PI * 1.1, Math.PI * 1.9)
    g.strokePath()
    g.fillStyle(STONE, 1)
    g.fillRect(cx - 8, y0 - sub * 0.12, 16, 16)
  }
  // shared central pier down to the gap floor
  g.fillStyle(STONE, 1)
  g.fillRect(x - 11, y0 + 6, 22, y1 - y0 - 6)
  g.fillStyle(RIM, 0.4)
  g.fillRect(x - 11, y0 + 6, 5, y1 - y0 - 6)
}

/** Rose window: ring, radial spokes, and a small center boss — reads as ornate, not just a hole. */
export function roseWindow(g: Phaser.GameObjects.Graphics, x: number, cy: number, innerR: number): void {
  g.lineStyle(20, STONE, 1)
  g.strokeCircle(x, cy, innerR + 14)
  g.fillStyle(STONE, 1)
  const petals = 8
  for (let i = 0; i < petals; i++) {
    const a = (Math.PI * 2 * i) / petals
    const kx = x + Math.cos(a) * (innerR + 14)
    const ky = cy + Math.sin(a) * (innerR + 14)
    g.fillCircle(kx, ky, 8)
  }
  g.lineStyle(6, STONE, 1)
  for (let i = 0; i < petals; i++) {
    const a = (Math.PI * 2 * i) / petals + Math.PI / petals
    g.beginPath()
    g.moveTo(x + Math.cos(a) * innerR * 0.35, cy + Math.sin(a) * innerR * 0.35)
    g.lineTo(x + Math.cos(a) * innerR, cy + Math.sin(a) * innerR)
    g.strokePath()
  }
  g.fillStyle(STONE, 1)
  g.fillCircle(x, cy, innerR * 0.32)
  g.lineStyle(5, RIM, 0.4)
  g.beginPath()
  g.arc(x, cy, innerR + 22, Math.PI * 0.7, Math.PI * 1.3)
  g.strokePath()
}

/** Broken tower crown: crenellations with one collapsed merlon and a diagonal fracture. */
export function towerCap(g: Phaser.GameObjects.Graphics, x: number, topY: number, hw: number): void {
  const merlons = 5
  const mw = (hw * 2) / merlons
  for (let i = 0; i < merlons; i++) {
    if (i === 2) continue // one collapsed gap in the battlement
    const mx = x - hw + i * mw
    const h = 16 + jag(x, i) * 8
    g.fillStyle(STONE, 1)
    g.fillRect(mx + 2, topY - h, mw - 4, h)
  }
  g.fillRect(x - hw, topY, hw * 2, 14)
  // diagonal fracture shadow down one side
  g.fillStyle(STONE_DARK, 0.5)
  g.beginPath()
  g.moveTo(x + hw * 0.3, topY + 14)
  g.lineTo(x + hw, topY + 14)
  g.lineTo(x + hw, topY + 70)
  g.closePath()
  g.fill()
}

/** A collapsed slab of wall leaning at an angle — reads as fallen rather than built. */
export function collapsedSlab(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, thick: number, tilt: number): void {
  g.save()
  g.translateCanvas(x, y)
  g.rotateCanvas(tilt)
  g.fillStyle(STONE, 1)
  g.fillRect(-len / 2, -thick / 2, len, thick)
  g.fillStyle(RIM, 0.4)
  g.fillRect(-len / 2, -thick / 2, len, thick * 0.3)
  g.fillStyle(STONE, 1)
  brokenEdgeLocal(g, -len / 2, len / 2, -thick / 2)
  g.restore()
}

function brokenEdgeLocal(g: Phaser.GameObjects.Graphics, x0: number, x1: number, y: number): void {
  const w = x1 - x0
  const teeth = Math.max(3, Math.round(w / 20))
  const tw = w / teeth
  for (let i = 0; i < teeth; i++) {
    const h = 5 + jag(x0, i) * 12
    g.fillRect(x0 + i * tw, y - h, tw + 1, h)
  }
}

/** Dense brittle curtain — thicker lattice of dead vine/vegetation blocking a gap until punched through. */
export function brittleCurtain(g: Phaser.GameObjects.Graphics, x: number, y0: number, y1: number, w: number): void {
  const cols = Math.max(4, Math.round(w / 14))
  for (let i = 0; i < cols; i++) {
    const vx = x - w / 2 + (w / (cols - 1 || 1)) * i
    const sway = (jag(x, i) - 0.5) * 10
    g.lineStyle(4, VINE, 0.85)
    g.beginPath()
    g.moveTo(vx, y0)
    g.lineTo(vx + sway, (y0 + y1) / 2)
    g.lineTo(vx, y1)
    g.strokePath()
  }
  // a couple of horizontal cross-strands for lattice density
  for (let j = 0; j < 3; j++) {
    const hy = y0 + ((y1 - y0) / 4) * (j + 1)
    g.lineStyle(3, VINE, 0.7)
    g.beginPath()
    g.moveTo(x - w / 2, hy)
    g.lineTo(x + w / 2, hy + (jag(x, j) - 0.5) * 8)
    g.strokePath()
  }
}
