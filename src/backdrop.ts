import Phaser from 'phaser'

/**
 * The painted world. One rich static backdrop (sky, sun, valley, mist, far
 * ruins) plus two tileable parallax silhouette strips. All painted in canvas
 * at boot — zero external assets, mockup palette.
 */

/**
 * THE GAME'S WIDTH FOLLOWS THE DEVICE. Height is fixed; width is derived from
 * the viewport's aspect ratio.
 *
 * Why: the scale mode was `ENVELOP`, chosen so a wide phone would fill the
 * screen and "show more world", which is exactly right for a side-scroller.
 * But ENVELOP scales to COVER and crops the overflow, and on a viewport that is
 * short relative to 1.6 it crops VERTICALLY — the opposite of the intent. On a
 * Pixel held in landscape (~3.0 aspect) that removed roughly half the screen
 * height, taking the GATHER and SPREAD pads off-screen entirely and making the
 * game unplayable, while an iPhone at ~2.16 cropped only ~26% and survived. The
 * bug was invisible on the owner's own phone, which is why it shipped.
 *
 * Deriving the width instead delivers the original intent honestly: the canvas
 * aspect MATCHES the device, so FIT neither crops nor letterboxes, and a wider
 * phone genuinely sees more of the road ahead and more of the dark behind.
 *
 * The floor of 1536 is load-bearing — a great deal of layout is positioned
 * against this constant, so the world may grow wider but must never grow
 * narrower than the design it was composed for. Narrower devices letterbox
 * slightly rather than cropping, because a bar is honest and a missing control
 * is not.
 */
export const H = 960

function deriveWidth(): number {
  if (typeof window === 'undefined') return 1536
  const w = window.innerWidth || 1536
  const h = window.innerHeight || 960
  if (h <= 0) return 1536
  // clamped so a freak aspect cannot produce an absurd canvas
  return Math.round(Math.min(2560, Math.max(1536, H * (w / h))))
}

export const W = deriveWidth()

export function paintBackdrop(scene: Phaser.Scene): void {
  const canvas = scene.textures.createCanvas('backdrop', W, H)
  if (!canvas) return
  const ctx = canvas.context

  // ---- sky
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0.0, '#3f3760')
  sky.addColorStop(0.3, '#6d5a8b')
  sky.addColorStop(0.52, '#9b7398')
  sky.addColorStop(0.68, '#cf8f9e')
  sky.addColorStop(0.82, '#eec39f')
  sky.addColorStop(1.0, '#f7e0bd')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // ---- broad warm glow around the low sun
  const sunX = 430
  const sunY = 700
  let g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 460)
  g.addColorStop(0, 'rgba(255, 224, 178, 0.55)')
  g.addColorStop(0.5, 'rgba(255, 214, 170, 0.18)')
  g.addColorStop(1, 'rgba(255, 214, 170, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // ---- sun disc
  g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 64)
  g.addColorStop(0, 'rgba(255, 246, 224, 1)')
  g.addColorStop(0.72, 'rgba(252, 226, 180, 0.95)')
  g.addColorStop(1, 'rgba(252, 226, 180, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(sunX, sunY, 64, 0, Math.PI * 2)
  ctx.fill()

  // ---- soft cloud bands, upper sky — breaks up the flat gradient
  cloudBands(ctx)

  // ---- far mountain ridge
  ridge(ctx, 745, 60, 3, '#8878a6', 0.5, 11)
  // faint mist over its base
  mistBand(ctx, 700, 810, 0.28)
  // ---- distant ruins on the far ridge (tiny aqueduct + towers)
  distantRuins(ctx)
  // ---- nearer ridge
  ridge(ctx, 812, 46, 5, '#6f5f8f', 0.62, 7)
  mistBand(ctx, 780, 900, 0.34)
  // ---- valley floor haze
  mistBand(ctx, 860, 960, 0.5)

  // ---- restrained film grain so the gradient doesn't read as flat/digital
  grain(ctx)

  canvas.refresh()
}

/** Soft elongated cloud puffs: draw a radial gradient, then squash it flat. */
function cloudPuff(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx / ry, 1)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry)
  g.addColorStop(0, `rgba(232, 216, 236, ${alpha})`)
  g.addColorStop(1, 'rgba(232, 216, 236, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, ry, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function cloudBands(ctx: CanvasRenderingContext2D): void {
  const bands: Array<[number, number, number]> = [
    [120, 0.14, 34],
    [235, 0.1, 26],
    [175, 0.08, 20],
  ]
  for (const [y, alpha, ry] of bands) {
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 640 + jag2(y, i) * 500) % (W + 400)) - 200
      cloudPuff(ctx, cx, y, ry * 8, ry, alpha)
    }
  }
}

function jag2(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function grain(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.globalAlpha = 0.035
  for (let i = 0; i < 900; i++) {
    const x = jag2(i, 1) * W
    const y = jag2(i, 2) * H
    ctx.fillStyle = jag2(i, 3) > 0.5 ? '#ffffff' : '#000000'
    ctx.fillRect(x, y, 1.4, 1.4)
  }
  ctx.restore()
}

function ridge(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  amp: number,
  bumps: number,
  color: string,
  alpha: number,
  seed: number,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let x = 0; x <= W; x += 8) {
    const t = (x / W) * Math.PI * bumps
    const y =
      baseY -
      Math.abs(Math.sin(t + seed)) * amp -
      Math.sin(t * 2.7 + seed * 2) * amp * 0.35 -
      Math.sin(t * 6.1 + seed) * amp * 0.12
    ctx.lineTo(x, y)
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function mistBand(ctx: CanvasRenderingContext2D, y0: number, y1: number, strength: number): void {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, 'rgba(247, 224, 189, 0)')
  g.addColorStop(0.55, `rgba(247, 224, 189, ${strength})`)
  g.addColorStop(1, `rgba(247, 224, 189, ${strength * 0.4})`)
  ctx.fillStyle = g
  ctx.fillRect(0, y0, W, y1 - y0)
}

function distantRuins(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = '#7a6a95'
  // small aqueduct row on the right
  const base = 742
  for (let i = 0; i < 5; i++) {
    const x = 1010 + i * 86
    ctx.fillRect(x, base - 64, 18, 64)
  }
  ctx.fillRect(1010, base - 64, 4 * 86 + 18, 12)
  // a distant dome silhouette — breaks up the tower repetition
  ctx.beginPath()
  ctx.arc(560, base - 30, 34, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(560 - 30, base - 30, 60, 32)
  // lone broken towers
  tower(ctx, 210, 738, 26, 68)
  tower(ctx, 700, 748, 20, 50)
  tower(ctx, 1460, 745, 24, 58)
  ctx.restore()
}

function tower(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number): void {
  ctx.fillRect(x - w / 2, baseY - h, w, h)
  // broken top notch
  ctx.clearRect(x - w / 2 + w * 0.55, baseY - h, w * 0.25, 10)
}

/** Mid-distance ruin silhouettes — tileable strip for slow parallax. */
export function paintRuinStrip(scene: Phaser.Scene): void {
  const SW = 1536
  const SH = 340
  const canvas = scene.textures.createCanvas('ruin-strip', SW, SH)
  if (!canvas) return
  const ctx = canvas.context
  ctx.fillStyle = '#63548a'

  // arcade of arches (kept clear of the tile seam)
  const colW = 26
  const archSpan = 118
  const baseY = SH
  const arcadeTop = 150
  for (let i = 0; i < 6; i++) {
    const x = 180 + i * archSpan
    ctx.fillRect(x, arcadeTop, colW, SH - arcadeTop)
  }
  // beam with gaps (ruined)
  ctx.fillRect(180, arcadeTop - 16, archSpan * 3 + colW, 16)
  ctx.fillRect(180 + archSpan * 4, arcadeTop - 16, archSpan + colW, 16)
  // arch curves
  for (let i = 0; i < 5; i++) {
    if (i === 3) continue // broken span
    const x0 = 180 + i * archSpan + colW
    const x1 = 180 + (i + 1) * archSpan
    const mid = (x0 + x1) / 2
    const r = (x1 - x0) / 2
    ctx.beginPath()
    ctx.arc(mid, arcadeTop + r + 6, r, Math.PI, 0)
    ctx.lineTo(x1, arcadeTop)
    ctx.lineTo(x1, arcadeTop + 30)
    ctx.arc(mid, arcadeTop + r + 6, r - 22, 0, Math.PI, true)
    ctx.closePath()
    ctx.fill()
  }
  // broken tower cluster
  ctx.fillRect(1120, 90, 44, SH - 90)
  ctx.fillRect(1174, 150, 30, SH - 150)
  ctx.beginPath()
  ctx.moveTo(1120, 90)
  ctx.lineTo(1142, 60)
  ctx.lineTo(1164, 92)
  ctx.closePath()
  ctx.fill()
  // low crumbled wall
  ctx.fillRect(60, SH - 60, 90, 60)
  ctx.fillRect(1350, SH - 48, 120, 48)
  canvas.refresh()
}

/**
 * Dark foreground foliage silhouette — tileable strip. Kept LOW: it frames the
 * bottom edge without eating the playfield.
 */
export function _unusedPaintFoliageStrip(scene: Phaser.Scene): void {
  const SW = 1536
  const SH = 170
  const canvas = scene.textures.createCanvas('foliage-strip', SW, SH)
  if (!canvas) return
  const ctx = canvas.context
  ctx.fillStyle = '#241a30'

  // continuous low ground band (tiles seamlessly)
  ctx.fillRect(0, SH - 42, SW, 42)
  // gentle brush bumps along the whole width (wrap-safe: sine-based)
  for (let x = 0; x <= SW; x += 44) {
    const h = 16 + 18 * Math.abs(Math.sin(x * 0.013)) + 10 * Math.abs(Math.sin(x * 0.037 + 2))
    ctx.beginPath()
    ctx.arc(x, SH - 40 - h * 0.2, h * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  // a couple of taller clumps, well apart (kept off the seam)
  blob(ctx, 330, SH - 78, 48)
  blob(ctx, 1010, SH - 86, 56)
  cypress(ctx, 640, SH - 40, 18, 88)
  cypress(ctx, 1360, SH - 40, 15, 70)
  canvas.refresh()
}

/** Soft fog puffs — tileable, drifted slowly across the lower sky. */
export function paintFogTile(scene: Phaser.Scene): void {
  const SW = 768
  const SH = 200
  const canvas = scene.textures.createCanvas('fog-tile', SW, SH)
  if (!canvas) return
  const ctx = canvas.context
  const puff = (x: number, y: number, r: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(247, 224, 189, 0.5)')
    g.addColorStop(1, 'rgba(247, 224, 189, 0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 12; i++) {
    const x = (i * 137) % SW
    const y = 60 + 60 * Math.sin(i * 2.1)
    const r = 90 + 50 * Math.sin(i * 1.3 + 1)
    puff(x, y, r)
    // duplicate across the seam for a seamless wrap
    puff(x >= SW / 2 ? x - SW : x + SW, y, r)
  }
  canvas.refresh()
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.arc(x - r * 0.7, y + r * 0.35, r * 0.7, 0, Math.PI * 2)
  ctx.arc(x + r * 0.75, y + r * 0.4, r * 0.65, 0, Math.PI * 2)
  ctx.fill()
}

function cypress(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number): void {
  ctx.beginPath()
  ctx.moveTo(x, baseY - h)
  ctx.quadraticCurveTo(x + w * 0.9, baseY - h * 0.55, x + w * 0.35, baseY)
  ctx.lineTo(x - w * 0.35, baseY)
  ctx.quadraticCurveTo(x - w * 0.9, baseY - h * 0.55, x, baseY - h)
  ctx.closePath()
  ctx.fill()
}
