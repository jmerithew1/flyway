import Phaser from 'phaser'
import { ART } from './artManifest'

/**
 * All visible art comes from the supplied asset kit (public/assets/processed/),
 * loaded here. Only tiny particle textures remain procedural.
 */
export function createCoreTextures(scene: Phaser.Scene): void {
  makeSoftDot(scene)
  makeLeafTexture(scene)
}

/** Load every curated piece from the manifest as a plain image. */
export function loadArt(scene: Phaser.Scene): void {
  for (const piece of Object.values(ART)) {
    scene.load.image(piece.key, piece.file)
  }
  // falcon: replaceable art slot — drop a real falcon at assets/processed/falcon.png
  scene.load.image('falcon-art', 'assets/processed/falcon.png')
}

/**
 * After load: 'falcon' resolves to the owner-supplied art if present,
 * otherwise a scaled dark stand-in built from the wings-down bird pose.
 */
export function resolveFalconTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('falcon-art')) {
    const src = scene.textures.get('falcon-art').getSourceImage() as HTMLCanvasElement
    scene.textures.addImage('falcon', src as unknown as HTMLImageElement)
    return
  }
  // stand-in: bird-down pose, enlarged and darkened at draw time by tint/scale
  const src = scene.textures.get('bird-down').getSourceImage() as HTMLCanvasElement
  scene.textures.addImage('falcon', src as unknown as HTMLImageElement)
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

/** Vertical gradient texture (sandbox sky). */
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
