import Phaser from 'phaser'
import { ACT_PLATES, BEAMS, ActPlate } from './level'
import { Flock, Bird } from './flock'
import { W as VIEW_W, H as VIEW_H } from './backdrop'

/**
 * ATMOSPHERE — the light and act-identity layer.
 *
 * Three jobs, all of them washes rather than filters:
 *  1. Section Mood Plates: six acts, each with its own tint / fog / particle
 *     colour, crossfaded across ~600px so the world CHANGES without a cut.
 *  2. Sunbeam Threading: god-rays aimed through the level's real openings —
 *     diegetic markers for the flow gates, and a strain-relief reward for
 *     flying through them (the scene applies the relief; we report the ratio).
 *  3. Storm wisps across the Wind Heights band at two parallax rates.
 *
 * Everything here is additive/overlay and deliberately restrained: this is a
 * painted sky, not a light show. The scene owns its own `warmth` and `fogFar`
 * layers; we only nudge them.
 */

// ---------------------------------------------------------------- act plates
const PLATE_DEPTH = 7.4 // just under the scene's dusk `warmth` rect (7.5)
const PLATE_FADE = 600 // px of crossfade at each act boundary
const FOG_LERP = 1.8 // per-second approach rate for the fog band
const FOG_MIN = 0.06
const FOG_MAX = 0.3
/** extra golden lift the final act adds ON TOP of the scene's dusk warmth */
const GOLD_LIFT = 0.06
const WARMTH_CAP = 0.3

// --------------------------------------------------------------------- beams
const BEAM_KEY = 'god_ray'
const BEAM_DEPTH = 2.5 // behind the stone (depth 3), in front of parallax
const BEAM_ASPECT = 320 / 1072 // god_ray art: long axis is its width
const BEAM_TINT = 0xfff0d2
const BEAM_BREATH = 0.34 // alpha swing of the breathing tween
const BEAM_BREATH_MS = 3200
const BEAM_BREATH_JITTER_MS = 1500
const BEAM_CULL_PAD = 640 // px beyond the view before a beam stops being tested
/** the light quad is narrower than the drawn shaft — the art fades at its edges */
const BEAM_HIT_LEN = 0.46 // fraction of h, half-length
const BEAM_HIT_WIDE = 0.34 // fraction of thickness, half-width

// ------------------------------------------------------------------ sparkles
const SPARKLE_KEY = 'softdot'
const SPARKLE_DEPTH = 6.2
const SPARKLE_POOL = 26 // hard cap on live sparkles — no unbounded spawning
const SPARKLE_PER_SEC = 16 // at full in-beam saturation
const SPARKLE_LIFE = 0.62
const SPARKLE_SIZE = 26
const SPARKLE_RISE = 34 // px it drifts up over its life
/** pre-baked tint ramp so the in-beam bird pulse never allocates a colour */
const BEAM_BIRD_TINTS = [0xffe6ba, 0xfff0d0, 0xfff8e6, 0xfff0d0]
const BEAM_BIRD_PULSE_HZ = 1.6

// --------------------------------------------------------------------- wisps
const WISP_KEYS = ['storm_wisp_a', 'storm_wisp_b', 'storm_wisp_c']
const WISP_X0 = 11500
const WISP_X1 = 15000
const WISP_FADE = 420 // px of alpha ramp at each end of the band
const WISP_BACK_DEPTH = -5
const WISP_FORE_DEPTH = 7
const WISP_BACK_FACTOR = 0.35 // scroll rate relative to the world
const WISP_FORE_FACTOR = 1.35
const WISP_BACK_ALPHA = 0.3
const WISP_FORE_ALPHA = 0.17
const WISP_BACK_COUNT = 6
const WISP_FORE_COUNT = 2
const WISP_DRIFT = -22 // px/s of self-drift, on top of parallax
const WISP_BACK_TINT = 0xcfd4e6
const WISP_FORE_TINT = 0xe6e2f0
const WISP_WRAP = WISP_X1 - WISP_X0 + 1200

// --------------------------------------------------------------- depth cues
/**
 * Non-colliding scenery must SIT BACK. Colliders keep full contrast; deco is
 * hazed toward the sky so the eye reads "that one is not in my way".
 */
const HAZE: Record<'far' | 'mid' | 'near', { tint: number; alpha: number }> = {
  far: { tint: 0x9d99c4, alpha: 0.58 },
  mid: { tint: 0xc3bcd8, alpha: 0.8 },
  near: { tint: 0xffffff, alpha: 1 },
}

/**
 * Push a piece of scenery visually backward (or restore it to the flight
 * plane). Absolute recipe, so calling it twice is idempotent.
 */
export function hazeScenery(sprite: Phaser.GameObjects.Image, depthBand: 'far' | 'mid' | 'near'): void {
  const r = HAZE[depthBand]
  if (depthBand === 'near') sprite.clearTint()
  else sprite.setTint(r.tint)
  sprite.setAlpha(r.alpha)
}

/** Which act contains this scroll position. */
export function actIndexAt(scrollX: number): number {
  let i = 0
  for (let k = 0; k < ACT_PLATES.length; k++) if (scrollX >= ACT_PLATES[k].x0) i = k
  return i
}

/** Human-readable act name — for debug overlays and act-change beats. */
export function actName(scrollX: number): string {
  return ACT_PLATES[actIndexAt(scrollX)].name
}

interface BeamQuad {
  cx: number
  cy: number
  ux: number
  uy: number
  halfLen: number
  halfWide: number
}

interface WispBit {
  img: Phaser.GameObjects.Image
  baseX: number
  factor: number
  drift: number
  alpha: number
}

export class Atmosphere {
  private scene: Phaser.Scene
  private warmth: Phaser.GameObjects.Rectangle
  private fogFar: Phaser.GameObjects.TileSprite

  /** two overlay washes: A holds the current act, B fades the next one in */
  private plateA!: Phaser.GameObjects.Rectangle
  private washA!: Phaser.GameObjects.Rectangle
  private washB!: Phaser.GameObjects.Rectangle
  private plateB!: Phaser.GameObjects.Rectangle
  private plateAIdx = -1
  private plateBIdx = -1

  private beams: Phaser.GameObjects.Image[] = []
  private quads: BeamQuad[] = []
  private wisps: WispBit[] = []

  private sparkles: Phaser.GameObjects.Image[] = []
  private sparkleLife: number[] = []
  private sparkleBudget = 0

  /** in-beam bookkeeping, double-buffered so no set is allocated per frame */
  private lit = new Set<Bird>()
  private litNext = new Set<Bird>()
  /** scratch list of lit bird positions, reused; `litCount` is its live length */
  private litX: number[] = []
  private litY: number[] = []
  private litCount = 0

  private clock = 0
  /** current act index — read by the scene for act-change beats */
  act = 0
  /** true only on the frame the act index changed (re-tint emitters here) */
  actChanged = false

  constructor(scene: Phaser.Scene, layers: { warmth: Phaser.GameObjects.Rectangle; fogFar: Phaser.GameObjects.TileSprite }) {
    this.scene = scene
    this.warmth = layers.warmth
    this.fogFar = layers.fogFar

    this.plateA = this.makePlate()
    this.plateB = this.makePlate()
    this.washA = this.makeWash()
    this.washB = this.makeWash()

    for (let i = 0; i < SPARKLE_POOL; i++) {
      const img = scene.add
        .image(0, 0, SPARKLE_KEY)
        .setDisplaySize(SPARKLE_SIZE, SPARKLE_SIZE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(BEAM_TINT)
        .setDepth(SPARKLE_DEPTH)
        .setVisible(false)
      this.sparkles.push(img)
      this.sparkleLife.push(0)
    }
    this.litX.length = 0
    this.litY.length = 0
  }

  private makePlate(): Phaser.GameObjects.Rectangle {
    return this.scene.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff)
      .setOrigin(0)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(PLATE_DEPTH)
      .setAlpha(0)
  }

  /**
   * A MULTIPLY plate can only darken, so on a bright dusk sky it moved
   * luminance without moving hue — all six acts measured the same pink
   * (hue 338-6 degrees end to end). This companion wash blends normally,
   * pulling the whole frame a real distance toward the act's colour, which is
   * what makes The Overgrown read green and Wind Heights read bleached.
   */
  private makeWash(): Phaser.GameObjects.Rectangle {
    return this.scene.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(PLATE_DEPTH + 0.01)
      .setAlpha(0)
  }

  // ----------------------------------------------------------------- beams

  /** Place every authored god-ray, each breathing on its own slow cycle. */
  createBeams(): void {
    for (const b of BEAMS) {
      const thick = b.h * BEAM_ASPECT
      const img = this.scene.add
        .image(b.x, b.y, BEAM_KEY)
        .setDisplaySize(b.h, thick)
        .setAngle(b.angle)
        .setTint(BEAM_TINT)
        .setAlpha(b.alpha)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(BEAM_DEPTH)
      this.scene.tweens.add({
        targets: img,
        alpha: b.alpha * (1 - BEAM_BREATH),
        duration: BEAM_BREATH_MS + Math.random() * BEAM_BREATH_JITTER_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.beams.push(img)
      const a = (b.angle * Math.PI) / 180
      this.quads.push({
        cx: b.x,
        cy: b.y,
        ux: Math.cos(a),
        uy: Math.sin(a),
        halfLen: b.h * BEAM_HIT_LEN,
        halfWide: thick * BEAM_HIT_WIDE,
      })
    }
  }

  // ----------------------------------------------------------------- wisps

  /** Storm wisps crossing the Wind Heights band at two parallax rates. */
  createWisps(): void {
    const span = WISP_X1 - WISP_X0
    const make = (n: number, depth: number, factor: number, alpha: number, tint: number, scale: number): void => {
      for (let i = 0; i < n; i++) {
        const key = WISP_KEYS[i % WISP_KEYS.length]
        const baseX = WISP_X0 - 400 + ((i + 0.5) / n) * (span + 800)
        const y = 110 + ((i * 137) % 560)
        const img = this.scene.add
          .image(baseX, y, key)
          .setScale(scale)
          .setTint(tint)
          .setAlpha(0)
          .setDepth(depth)
          .setFlipX(i % 2 === 1)
        this.wisps.push({ img, baseX, factor, drift: 0, alpha })
      }
    }
    make(WISP_BACK_COUNT, WISP_BACK_DEPTH, WISP_BACK_FACTOR, WISP_BACK_ALPHA, WISP_BACK_TINT, 1.15)
    make(WISP_FORE_COUNT, WISP_FORE_DEPTH, WISP_FORE_FACTOR, WISP_FORE_ALPHA, WISP_FORE_TINT, 1.9)
  }

  // ---------------------------------------------------------------- update

  /**
   * Advance the whole layer.
   * @returns `inBeam` — fraction of living birds standing in a shaft of light
   *          (0..1). The scene turns that into strain relief.
   */
  update(dt: number, scrollX: number, flock: Flock): { inBeam: number } {
    this.clock += dt
    this.applyPlates(dt, scrollX)
    this.driftWisps(dt, scrollX)
    const inBeam = this.lightBirds(dt, scrollX, flock)
    this.stepSparkles(dt, inBeam)
    return { inBeam }
  }

  private applyPlates(dt: number, scrollX: number): void {
    const i = actIndexAt(scrollX)
    this.actChanged = i !== this.act || this.plateAIdx < 0
    this.act = i
    const cur = ACT_PLATES[i]
    const nextI = Math.min(i + 1, ACT_PLATES.length - 1)
    const next = ACT_PLATES[nextI]
    const t =
      nextI === i ? 0 : Phaser.Math.Clamp((scrollX - (cur.x1 - PLATE_FADE)) / PLATE_FADE, 0, 1)

    if (this.plateAIdx !== i) {
      this.plateA.setFillStyle(cur.tint)
      this.washA.setFillStyle(cur.tint)
      this.plateAIdx = i
    }
    if (this.plateBIdx !== nextI) {
      this.plateB.setFillStyle(next.tint)
      this.washB.setFillStyle(next.tint)
      this.plateBIdx = nextI
    }
    this.plateA.setAlpha(cur.tintAlpha * (1 - t))
    this.plateB.setAlpha(next.tintAlpha * t)
    this.washA.setAlpha(cur.washAlpha * (1 - t))
    this.washB.setAlpha(next.washAlpha * t)

    // fog eases toward the act's haze rather than snapping
    const fogTarget = Phaser.Math.Clamp(cur.fogAlpha + (next.fogAlpha - cur.fogAlpha) * t, FOG_MIN, FOG_MAX)
    this.fogFar.setAlpha(this.fogFar.alpha + (fogTarget - this.fogFar.alpha) * Math.min(1, dt * FOG_LERP))

    // the final act adds its own golden lift on top of the scene's dusk warmth
    const goldT = i === ACT_PLATES.length - 1 ? Phaser.Math.Clamp((scrollX - cur.x0) / 1600, 0, 1) : 0
    if (goldT > 0) this.warmth.setAlpha(Math.min(WARMTH_CAP, this.warmth.alpha + GOLD_LIFT * goldT))
  }

  /** The act's particle tints — hand straight to a Phaser emitter. */
  particleTint(scrollX: number): number[] {
    return ACT_PLATES[actIndexAt(scrollX)].particleTint
  }

  /** The whole plate for this position, if the scene wants more of it. */
  plateAt(scrollX: number): ActPlate {
    return ACT_PLATES[actIndexAt(scrollX)]
  }

  private driftWisps(dt: number, scrollX: number): void {
    if (scrollX < WISP_X0 - VIEW_W - WISP_FADE || scrollX > WISP_X1 + WISP_FADE) {
      for (const w of this.wisps) if (w.img.visible) w.img.setVisible(false)
      return
    }
    const focus = scrollX + VIEW_W * 0.5
    // band alpha: ramps in at the entrance, out past the far edge
    const band = Math.min(
      Phaser.Math.Clamp((focus - (WISP_X0 - WISP_FADE)) / WISP_FADE, 0, 1),
      Phaser.Math.Clamp((WISP_X1 + WISP_FADE - focus) / WISP_FADE, 0, 1),
    )
    for (const w of this.wisps) {
      w.drift += WISP_DRIFT * dt * w.factor
      if (w.drift < -WISP_WRAP) w.drift += WISP_WRAP
      // scrollFactor is 1, so a world x of base + scrollX*(1-f) scrolls at f
      w.img.x = w.baseX + scrollX * (1 - w.factor) + w.drift
      const on = band > 0.01
      if (w.img.visible !== on) w.img.setVisible(on)
      if (on) w.img.setAlpha(w.alpha * band)
    }
  }

  /**
   * Tint every bird standing in a shaft, untint the ones that left, and stash
   * their positions for the sparkle pass.
   */
  private lightBirds(dt: number, scrollX: number, flock: Flock): number {
    const x0 = scrollX - BEAM_CULL_PAD
    const x1 = scrollX + VIEW_W + BEAM_CULL_PAD
    const birds = flock.birds
    this.litCount = 0
    const step = BEAM_BIRD_TINTS[(this.clock * BEAM_BIRD_PULSE_HZ * BEAM_BIRD_TINTS.length) % BEAM_BIRD_TINTS.length | 0]

    for (let bi = 0; bi < birds.length; bi++) {
      const b = birds[bi]
      if (b.x < x0 || b.x > x1) continue
      let hit = false
      for (let qi = 0; qi < this.quads.length; qi++) {
        const q = this.quads[qi]
        if (q.cx < x0 || q.cx > x1) continue
        const dx = b.x - q.cx
        const dy = b.y - q.cy
        const along = dx * q.ux + dy * q.uy
        if (along > q.halfLen || along < -q.halfLen) continue
        const across = dy * q.ux - dx * q.uy
        if (across > q.halfWide || across < -q.halfWide) continue
        hit = true
        break
      }
      if (!hit) continue
      this.litNext.add(b)
      b.sprite.setTint(step)
      if (this.litCount < SPARKLE_POOL) {
        this.litX[this.litCount] = b.x
        this.litY[this.litCount] = b.y
        this.litCount++
      }
    }

    for (const b of this.lit) {
      if (this.litNext.has(b)) continue
      if (b.alive && b.sprite && b.sprite.scene) b.sprite.clearTint()
    }
    const swap = this.lit
    this.lit = this.litNext
    this.litNext = swap
    this.litNext.clear()

    void dt
    return birds.length ? this.lit.size / birds.length : 0
  }

  /** A few additive motes flicker off the birds that are in the light. */
  private stepSparkles(dt: number, inBeam: number): void {
    for (let i = 0; i < this.sparkles.length; i++) {
      if (this.sparkleLife[i] <= 0) continue
      this.sparkleLife[i] -= dt
      const img = this.sparkles[i]
      const k = Math.max(0, this.sparkleLife[i] / SPARKLE_LIFE)
      if (this.sparkleLife[i] <= 0) {
        img.setVisible(false)
        continue
      }
      img.y -= SPARKLE_RISE * dt
      img.setAlpha(0.75 * k * k)
      img.setDisplaySize(SPARKLE_SIZE * (0.5 + k * 0.7), SPARKLE_SIZE * (0.5 + k * 0.7))
    }
    if (this.litCount === 0) {
      this.sparkleBudget = 0
      return
    }
    this.sparkleBudget += SPARKLE_PER_SEC * Math.min(1, inBeam * 3) * dt
    while (this.sparkleBudget >= 1) {
      this.sparkleBudget -= 1
      let slot = -1
      for (let i = 0; i < this.sparkles.length; i++)
        if (this.sparkleLife[i] <= 0) {
          slot = i
          break
        }
      if (slot < 0) {
        this.sparkleBudget = 0
        return
      }
      const p = (Math.random() * this.litCount) | 0
      const img = this.sparkles[slot]
      img.setPosition(this.litX[p] + (Math.random() - 0.5) * 26, this.litY[p] + (Math.random() - 0.5) * 22)
      img.setVisible(true).setAlpha(0.75)
      this.sparkleLife[slot] = SPARKLE_LIFE
    }
  }

  /** Release everything this layer owns (scene restart). */
  destroy(): void {
    for (const b of this.beams) b.destroy()
    for (const w of this.wisps) w.img.destroy()
    for (const s of this.sparkles) s.destroy()
    this.beams.length = 0
    this.quads.length = 0
    this.wisps.length = 0
    this.sparkles.length = 0
    this.sparkleLife.length = 0
    this.lit.clear()
    this.litNext.clear()
    this.plateA.destroy()
    this.washA.destroy()
    this.washB.destroy()
    this.plateB.destroy()
  }
}
