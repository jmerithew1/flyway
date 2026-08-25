import Phaser from 'phaser'

/**
 * Particle textures only. All *art* (birds, ruins, world) is authored SVG in
 * public/art/ and loaded in BootScene.preload() — see ART_ASSETS below.
 */
export function createCoreTextures(scene: Phaser.Scene): void {
  makeSoftDot(scene)
  makeLeafTexture(scene)
}

/**
 * Authored SVG art, rasterized at load. `w`/`h` are the rasterization size in
 * source px; sprites are then scaled to whatever the level needs.
 */
export const ART_ASSETS: { key: string; file: string; w: number; h: number }[] = [
  { key: 'bird-up', file: 'art/bird-up.svg', w: 128, h: 128 },
  { key: 'bird-mid', file: 'art/bird-mid.svg', w: 128, h: 128 },
  { key: 'bird-down', file: 'art/bird-down.svg', w: 128, h: 128 },
  { key: 'wall-body', file: 'art/wall-body.svg', w: 140, h: 400 },
  { key: 'crown-top', file: 'art/crown-top.svg', w: 140, h: 80 },
  { key: 'crown-bottom', file: 'art/crown-bottom.svg', w: 140, h: 80 },
  { key: 'pillar', file: 'art/pillar.svg', w: 160, h: 420 },
  { key: 'arch', file: 'art/arch.svg', w: 260, h: 150 },
  { key: 'rose-window', file: 'art/rose-window.svg', w: 220, h: 220 },
  { key: 'vines', file: 'art/vines.svg', w: 180, h: 150 },
  { key: 'rubble', file: 'art/rubble.svg', w: 300, h: 130 },
  { key: 'roost-tree', file: 'art/roost-tree.svg', w: 760, h: 820 },
  { key: 'fg-branch', file: 'art/fg-branch.svg', w: 520, h: 300 },
  { key: 'fg-grass', file: 'art/fg-grass.svg', w: 420, h: 170 },
  { key: 'fg-ground', file: 'art/fg-ground.svg', w: 900, h: 120 },
]

/**
 * Rasterize SVGs at authored size × devicePixelRatio. Phaser rasterizes once at
 * load and GPU-scales after, so undersizing here is what makes SVGs look blurry.
 */
export function loadArt(scene: Phaser.Scene): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  for (const a of ART_ASSETS) {
    scene.load.svg(a.key, a.file, { width: Math.round(a.w * dpr), height: Math.round(a.h * dpr) })
  }
}

export const BIRD_FRAMES = ['bird-up', 'bird-mid', 'bird-down'] as const

/**
 * Pick a flap frame for a given time/phase. Sin dwells briefly at the extremes,
 * which reads as a natural beat: extended → mid → folded → mid → …
 */
export function birdFrameKey(t: number, phase: number, freq: number): string {
  const s = (Math.sin(t * freq + phase) + 1) / 2
  return BIRD_FRAMES[Math.min(2, Math.floor(s * 3))]
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
