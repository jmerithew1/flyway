import Phaser from 'phaser'

/**
 * All art is generated procedurally at boot — no external assets.
 */
export function createCoreTextures(scene: Phaser.Scene): void {
  makeBirdFrames(scene)
  makeSoftDot(scene)
  makeLeafTexture(scene)
}

export const BIRD_FRAMES = ['bird0', 'bird1', 'bird2'] as const

/**
 * Pick a flap frame for a given time/phase. Sin dwells briefly at the extremes,
 * which reads as a natural beat: extended → mid → folded → mid → …
 */
export function birdFrameKey(t: number, phase: number, freq: number): string {
  const s = (Math.sin(t * freq + phase) + 1) / 2
  return BIRD_FRAMES[Math.min(2, Math.floor(s * 3))]
}

/**
 * Stylized swallow silhouette, top-down, pointing right. Three wing states:
 * 0 = wings extended (crescent), 1 = mid sweep, 2 = folded back.
 * Drawn with canvas curves — smooth at small scales, still just a silhouette.
 */
function makeBirdFrames(scene: Phaser.Scene): void {
  const W = 64
  const H = 48

  const CX = 40 // shoulder joint, forward of center
  const CY = 24

  /**
   * Each wing is a single FILLED crescent (root → tapered tip, camber via two
   * bezier edges) — a solid silhouette, never a stroked line. `rise` lifts the
   * tip (up-stroke) or drops it (down-stroke); `back` is how far it trails.
   */
  const make = (key: string, rise: number, back: number, width: number) => {
    const canvas = scene.textures.createCanvas(key, W, H)
    if (!canvas) return
    const ctx = canvas.context
    ctx.fillStyle = '#ffffff'

    const wing = (sign: number) => {
      const sy = (y: number) => CY + sign * y
      const rootA: [number, number] = [CX + 1, sy(0.5)]
      const rootB: [number, number] = [CX - 1, sy(3.2)]
      const tip: [number, number] = [CX - back, sy(rise)]
      const outerCtrl: [number, number] = [CX - back * 0.42, sy(rise * 1.2 + width)]
      const innerCtrl: [number, number] = [CX - back * 0.55, sy(rise * 0.5 + width * 1.7)]
      ctx.beginPath()
      ctx.moveTo(rootA[0], rootA[1])
      ctx.quadraticCurveTo(outerCtrl[0], outerCtrl[1], tip[0], tip[1])
      ctx.quadraticCurveTo(innerCtrl[0], innerCtrl[1], rootB[0], rootB[1])
      ctx.closePath()
      ctx.fill()
    }
    wing(1)
    wing(-1)

    // small body + head nub ahead of the shoulders, and a short tail behind —
    // drawn last so the wing roots tuck cleanly under it
    ctx.beginPath()
    ctx.moveTo(CX - 10, CY)
    ctx.quadraticCurveTo(CX, CY - 3.4, CX + 9, CY - 1.8)
    ctx.quadraticCurveTo(CX + 13, CY - 1.1, CX + 15, CY) // head
    ctx.quadraticCurveTo(CX + 13, CY + 1.1, CX + 9, CY + 1.8)
    ctx.quadraticCurveTo(CX, CY + 3.4, CX - 10, CY)
    ctx.closePath()
    ctx.fill()
    // short tail wedge (not a spike — spikes read as arrows)
    ctx.beginPath()
    ctx.moveTo(CX - 8, CY - 2.4)
    ctx.lineTo(CX - 17, CY - 1.3)
    ctx.lineTo(CX - 17, CY + 1.3)
    ctx.lineTo(CX - 8, CY + 2.4)
    ctx.closePath()
    ctx.fill()

    canvas.refresh()
  }

  make('bird0', -13, 23, 5.5) // up-stroke: tips raised, wide "M"
  make('bird1', -2, 27, 4.6) // mid: nearly level, swept
  make('bird2', 9, 24, 4.8) // down-stroke: tips dropped, "W"
  // alias used by HUD icon and anything not flap-animated
  const src = scene.textures.get('bird0').getSourceImage() as HTMLCanvasElement
  scene.textures.addCanvas('bird', src)
}

function makeSoftDot(scene: Phaser.Scene): void {
  const size = 64
  const canvas = scene.textures.createCanvas('softdot', size, size)
  if (!canvas) return
  const ctx = canvas.context
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, size, size)
  canvas.refresh()
}

function makeLeafTexture(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  g.fillStyle(0xffffff, 1)
  g.fillEllipse(8, 4, 15, 6)
  g.generateTexture('leaf', 16, 8)
  g.destroy()
}

export interface SkyStop {
  at: number // 0..1 from top
  color: string
}

/** Vertical gradient texture, stretched to fill the sky. */
export function makeSkyTexture(scene: Phaser.Scene, key: string, stops: SkyStop[], height = 1024): void {
  const canvas = scene.textures.createCanvas(key, 32, height)
  if (!canvas) return
  const ctx = canvas.context
  const grd = ctx.createLinearGradient(0, 0, 0, height)
  for (const s of stops) grd.addColorStop(s.at, s.color)
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, 32, height)
  canvas.refresh()
}
