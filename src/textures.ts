import Phaser from 'phaser'
import { ART } from './artManifest'

/**
 * All visible art comes from the supplied asset kit (public/assets/processed/),
 * loaded here. Only tiny particle textures remain procedural.
 */
export function createCoreTextures(scene: Phaser.Scene): void {
  makeSoftDot(scene)
  makeLeafTexture(scene)
  makeFeatherTexture(scene)
  makeVerticalFade(scene)
  makeStreakTexture(scene)
  makeAlarmRing(scene)
  makeCageTexture(scene)
  makeMoteTexture(scene)
  makeFogRoll(scene)
  makeShardTexture(scene)
}

/** An angular chip of broken matter. Feathers drift; SHARDS have corners and
 * a lit facet, which is the whole difference between "it faded" and "it broke".
 * Drawn white for runtime tinting. */
function makeShardTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('shard')) return
  const w = 26
  const h = 18
  const canvas = scene.textures.createCanvas('shard', w, h)
  if (!canvas) return
  const ctx = canvas.context
  // irregular quad — no two edges parallel, so rotation always reads
  ctx.beginPath()
  ctx.moveTo(1, 7)
  ctx.lineTo(15, 1)
  ctx.lineTo(25, 11)
  ctx.lineTo(9, 17)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()
  // a brighter facet along the top-left break, so it catches light as it spins
  ctx.beginPath()
  ctx.moveTo(1, 7)
  ctx.lineTo(15, 1)
  ctx.lineTo(13, 6)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,1)'
  ctx.fill()
  canvas.refresh()
}

/** Load every curated piece from the manifest as a plain image. */
/** Painted nightfall fog. Each piece is a real cutout with its own tendrils. */
export const FOG_PIECES = [
  'fog_wall_00', 'fog_wall_01', 'fog_wall_02', 'fog_wall_03',
  'fog_puff_00', 'fog_edge_00',
] as const

export function loadArt(scene: Phaser.Scene): void {
  for (const piece of Object.values(ART)) {
    scene.load.image(piece.key, piece.file)
  }
  for (const key of FOG_PIECES) {
    scene.load.image(key, `assets/processed/fog/${key}.png`)
  }
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

/** Vertical fade (transparent top → solid bottom), white for tinting. Used
 * anywhere a wash must sink into a scene without leaving a hard edge. */
function makeVerticalFade(scene: Phaser.Scene): void {
  if (scene.textures.exists('vfade')) return
  const h = 256
  const canvas = scene.textures.createCanvas('vfade', 8, h)
  if (!canvas) return
  const ctx = canvas.context
  const grd = ctx.createLinearGradient(0, 0, 0, h)
  grd.addColorStop(0, 'rgba(255,255,255,0)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  grd.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, 8, h)
  canvas.refresh()
}

/** A soft ring — marks a single bird without covering it, so the silhouette
 * still reads. A filled glow washes the bird out; a ring circles it. */
function makeAlarmRing(scene: Phaser.Scene): void {
  if (scene.textures.exists('alarmring')) return
  const size = 96
  const canvas = scene.textures.createCanvas('alarmring', size, size)
  if (!canvas) return
  const ctx = canvas.context
  const c = size / 2
  const grd = ctx.createRadialGradient(c, c, size * 0.24, c, c, size * 0.5)
  grd.addColorStop(0, 'rgba(255,255,255,0)')
  grd.addColorStop(0.55, 'rgba(255,255,255,0.95)')
  grd.addColorStop(0.78, 'rgba(255,255,255,0.5)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(c, c, c, 0, Math.PI * 2)
  ctx.fill()
  canvas.refresh()
}

/**
 * A hanging birdcage: dome, bars, and a base ring.
 *
 * Strays used to be marked by a soft radial blob, which is shapeless and says
 * nothing — you cannot tell a blob means "birds in here, come free them". A
 * cage says it instantly, and in a game about a flock it is the one enclosure
 * that needs no explanation.
 */
function makeCageTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('cage')) return
  const size = 160
  const canvas = scene.textures.createCanvas('cage', size, size)
  if (!canvas) return
  const ctx = canvas.context
  const cx = size / 2
  const top = size * 0.16
  const bot = size * 0.86
  const rx = size * 0.32
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'

  // the hook it hangs from
  ctx.beginPath()
  ctx.arc(cx, top - size * 0.06, size * 0.045, Math.PI * 0.15, Math.PI * 1.5)
  ctx.stroke()

  // meridian bars, bowing out to the cage's waist
  const midY = (top + bot) / 2
  for (let i = 0; i < 7; i++) {
    const f = (i / 6) * 2 - 1 // -1..1 across the cage
    const x = cx + f * rx
    ctx.beginPath()
    ctx.moveTo(cx + f * rx * 0.12, top)
    ctx.quadraticCurveTo(x * 1.0 + cx * 0, midY, cx + f * rx * 0.86, bot)
    ctx.stroke()
  }

  // horizontal hoops
  for (const [y, k] of [[top + (bot - top) * 0.18, 0.62], [midY, 1], [bot, 0.86]] as [number, number][]) {
    ctx.beginPath()
    ctx.ellipse(cx, y, rx * k, size * 0.038, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // a soft inner light so the bird inside reads as held, not caged in shadow
  const grd = ctx.createRadialGradient(cx, midY, 0, cx, midY, rx)
  grd.addColorStop(0, 'rgba(255,255,255,0.30)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.ellipse(cx, midY, rx, (bot - top) / 2, 0, 0, Math.PI * 2)
  ctx.fill()
  canvas.refresh()
}

/**
 * A mote of light, with its dark contact ring baked in.
 *
 * This used to be TWO sprites per mote - a dark halo and a bright core - which
 * doubled the object count and the draw calls for the most numerous thing on
 * screen. Baking the ring into one texture halves both.
 */
function makeMoteTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('mote')) return
  const size = 128
  const canvas = scene.textures.createCanvas('mote', size, size)
  if (!canvas) return
  const ctx = canvas.context
  const c = size / 2
  // dark contact ring: the mote always sits on its own shadow, so it reads
  // against a warm sky as well as a cool one
  // A faint dark seat, pushed right out to the rim so it never competes with
  // the core. The first version peaked INSIDE the glow and the motes rendered
  // as dark rings - the opposite of light.
  const dark = ctx.createRadialGradient(c, c, size * 0.30, c, c, c)
  dark.addColorStop(0, 'rgba(22,14,36,0)')
  dark.addColorStop(0.62, 'rgba(22,14,36,0.34)')
  dark.addColorStop(1, 'rgba(22,14,36,0)')
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.arc(c, c, c, 0, Math.PI * 2)
  ctx.fill()
  // a big, unmistakably BRIGHT core - this is the thing the whole game is
  // about, so it should be the brightest object on screen
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.46)
  core.addColorStop(0, 'rgba(255,255,252,1)')
  core.addColorStop(0.22, 'rgba(255,248,226,0.98)')
  core.addColorStop(0.55, 'rgba(255,226,168,0.55)')
  core.addColorStop(1, 'rgba(255,214,150,0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(c, c, size * 0.46, 0, Math.PI * 2)
  ctx.fill()
  // a hard little star at the centre so it catches the eye in motion
  const star = ctx.createRadialGradient(c, c, 0, c, c, size * 0.1)
  star.addColorStop(0, 'rgba(255,255,255,1)')
  star.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = star
  ctx.beginPath()
  ctx.arc(c, c, size * 0.1, 0, Math.PI * 2)
  ctx.fill()
  canvas.refresh()
}

/**
 * Tiling billow for the nightfall fog. Not a flat wash — clumped blobs of
 * varying size so three layers scrolling at different rates read as churning
 * cloud rather than a sliding curtain.
 */
function makeFogRoll(scene: Phaser.Scene): void {
  if (scene.textures.exists('fogroll')) return
  const size = 256
  const canvas = scene.textures.createCanvas('fogroll', size, size)
  if (!canvas) return
  const ctx = canvas.context
  ctx.clearRect(0, 0, size, size)
  // seeded so the billow is identical every run
  let seed = 20260827
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 18 + rnd() * 52
    // draw each blob 4x wrapped so the tile has no visible seam
    for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [size, size], [-size, 0], [0, -size]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
      g.addColorStop(0, `rgba(18,12,30,${0.5 + rnd() * 0.34})`)
      g.addColorStop(1, 'rgba(18,12,30,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  canvas.refresh()
}

/** A speed streak: bright core tapering to nothing at both ends. A stretched
 * radial dot just makes a smudge — motion needs a real line. */
function makeStreakTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('streak')) return
  const w = 256
  const h = 8
  const canvas = scene.textures.createCanvas('streak', w, h)
  if (!canvas) return
  const ctx = canvas.context
  const grd = ctx.createLinearGradient(0, 0, w, 0)
  grd.addColorStop(0, 'rgba(255,255,255,0)')
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)')
  grd.addColorStop(0.62, 'rgba(255,255,255,1)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, h / 2 - 1.5, w, 3)
  const soft = ctx.createLinearGradient(0, 0, w, 0)
  soft.addColorStop(0, 'rgba(255,255,255,0)')
  soft.addColorStop(0.5, 'rgba(255,255,255,0.28)')
  soft.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = soft
  ctx.fillRect(0, 0, w, h)
  canvas.refresh()
}

/** Procedural feather (fallback until the painted feather sheet arrives):
 * tapered vane around a pale spine, drawn white for runtime tinting. */
function makeFeatherTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('feather')) return
  const w = 44
  const h = 14
  const canvas = scene.textures.createCanvas('feather', w, h)
  if (!canvas) return
  const ctx = canvas.context
  ctx.translate(0, h / 2)
  // vane: two mirrored quadratic lobes, tapering to the tip
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.beginPath()
  ctx.moveTo(2, 0)
  ctx.quadraticCurveTo(w * 0.35, -h * 0.48, w - 3, -1.2)
  ctx.quadraticCurveTo(w * 0.55, 1.6, 2, 0)
  ctx.moveTo(2, 0)
  ctx.quadraticCurveTo(w * 0.3, h * 0.42, w - 6, 1.4)
  ctx.quadraticCurveTo(w * 0.5, -1.2, 2, 0)
  ctx.fill()
  // spine
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(1, 0)
  ctx.lineTo(w - 2, -0.6)
  ctx.stroke()
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
