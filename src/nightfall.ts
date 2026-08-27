import Phaser from 'phaser'
import { Flock, Bird } from './flock'

/**
 * NIGHTFALL — the game's core threat, and the reason light is worth having.
 *
 * A billowing fog of night rolls up the valley behind the flock. It does not
 * kill on contact: it takes birds that TRAIL, which keeps the whole mechanic
 * denominated in the only currency the game already runs on, and points every
 * ability at one threat — gather so nobody trails, call to retrieve what it
 * took, surge to outrun a bad stretch, spread to harvest the light that
 * drives it back.
 *
 * The design tension this resolves: motes cost time to reach, and a pursuing
 * wall punishes lost time, so the two would fight. They do not, because
 * collecting light is what PUSHES THE FOG BACK. The invariant that keeps that
 * true is MOTE_GAIN vs DRAIN_PER_SEC — a mote must be worth more than the
 * detour to reach it. Everything else here is presentation.
 */

/** Daylight lost per second of flight. */
const DRAIN_PER_SEC = 0.0135
/** Daylight returned by one mote. Must comfortably exceed the detour cost. */
const MOTE_GAIN = 0.055
/** How far behind the flock the fog sits at full daylight, and at none. */
const LEAD_FULL = 1500
const LEAD_EMPTY = -140
/** How fast the fog edge eases toward its target (px/sec of correction). */
const EDGE_LERP = 1.6
/** How many soft blobs build the fog body. */
const BLOBS = 54

export class Nightfall {
  /** 1 = broad day, 0 = the dark is on you. */
  daylight = 1
  /** World x of the fog's leading edge. */
  edgeX = -4000
  /** 0..1, how much of the frame the fog currently owns — drives the mix. */
  encroach = 0
  /** birds the dark took this frame, for the scene's drama + stats */
  takenThisFrame: Bird[] = []

  private scene: Phaser.Scene
  private deep!: Phaser.GameObjects.Rectangle
  private blobs: Phaser.GameObjects.Image[] = []
  private blobSpec: { dx: number; y: number; r: number; phase: number; speed: number; rise: number; depth: number }[] = []
  private rim!: Phaser.GameObjects.Image
  private edgeFade!: Phaser.GameObjects.Image
  private tendrils: Phaser.GameObjects.Image[] = []
  private tendrilT: number[] = []
  private tendrilY: number[] = []
  private intensity = 1

  constructor(scene: Phaser.Scene, viewW: number, viewH: number) {
    this.scene = scene

    // A cropped TileSprite is always a RECTANGLE, which is exactly what it
    // looked like. Fog has to be built from soft radial blobs - dozens of
    // them, each drifting and breathing on its own phase - so the mass churns
    // and the boundary is ragged by construction rather than by trickery.
    //
    // Deep behind the edge one flat plate guarantees true opacity; it sits far
    // enough back that the blob field always covers its edge.
    this.deep = scene.add
      .rectangle(0, 0, viewW * 2, viewH * 1.4, 0x0a0714)
      .setOrigin(1, 0.5)
      .setPosition(0, viewH / 2)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(11)

    for (let i = 0; i < BLOBS; i++) {
      const img = scene.add
        .image(0, 0, 'softdot')
        .setTint(0x0f0a1c)
        .setScrollFactor(0)
        .setAlpha(0)
        .setDepth(11.01)
      this.blobs.push(img)
      // depth 0 = the leading wisps, 1 = the body far behind
      const d = i / (BLOBS - 1)
      this.blobSpec.push({
        // clustered behind the edge, densest deep, sparse and reaching at the front
        dx: 90 - Math.pow(d, 0.75) * 980 - Math.random() * 150,
        y: Math.random() * viewH,
        r: 190 + Math.random() * 230 + d * 190,
        phase: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.5,
        rise: 12 + Math.random() * 34,
        depth: d,
      })
    }

    // the boundary itself: a dark gradient that hides the tile's hard edge and
    // makes the fog dissolve into lit air instead of stopping at a ruled line
    this.edgeFade = scene.add
      .image(0, viewH / 2, 'vfade')
      .setDisplaySize(viewH * 1.25, 460)
      .setRotation(-Math.PI / 2)
      .setTint(0x120c1e)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(11.03)

    // a bright edge where the dark eats into lit air, so the boundary is
    // never ambiguous — this is the single most important pixel of the effect
    this.rim = scene.add
      .image(0, viewH / 2, 'vfade')
      .setDisplaySize(viewH * 1.2, 300)
      .setRotation(Math.PI / 2)
      .setTint(0xffb98a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(11.05)

    // reaching tendrils: they telegraph before they take, so being caught is
    // always something you saw coming
    for (let i = 0; i < 5; i++) {
      const t = scene.add
        .image(0, 0, 'streak')
        .setTint(0x0b0716)
        .setDisplaySize(260, 46)
        .setScrollFactor(0)
        .setAlpha(0)
        .setDepth(11.04)
      this.tendrils.push(t)
      this.tendrilT.push(Math.random() * 6)
    }
  }

  /** Later acts are hungrier — the chase tightens as the day runs out. */
  setIntensity(k: number): void {
    this.intensity = k
  }

  /** One mote's worth of daylight. */
  feed(): void {
    this.daylight = Math.min(1, this.daylight + MOTE_GAIN)
  }

  reset(flockX: number): void {
    this.daylight = 1
    this.edgeX = flockX - LEAD_FULL
    this.encroach = 0
  }

  update(dt: number, flock: Flock, scrollX: number, viewW: number, viewH: number): void {
    this.takenThisFrame.length = 0
    this.daylight = Math.max(0, this.daylight - dt * DRAIN_PER_SEC * this.intensity)

    // the fog wants to sit LEAD behind the flock, and LEAD shrinks with the light
    const lead = LEAD_EMPTY + (LEAD_FULL - LEAD_EMPTY) * this.daylight
    const want = flock.centerX - lead
    this.edgeX += (want - this.edgeX) * (1 - Math.exp(-EDGE_LERP * dt))
    // it never retreats past its full-daylight standoff, so light buys room
    // rather than erasing the threat
    this.edgeX = Math.max(this.edgeX, flock.centerX - LEAD_FULL)

    const screenEdge = this.edgeX - scrollX
    this.encroach = Phaser.Math.Clamp((screenEdge + 200) / (viewW * 0.75), 0, 1)

    // ---- the dark takes birds that trail into it
    for (const b of flock.birds) {
      if (b.x < this.edgeX) {
        const depth = Math.min(1, (this.edgeX - b.x) / 220)
        b.danger += dt * (0.5 + depth * 2.2)
        b.panic = Math.max(b.panic, 0.5)
        if (b.danger > 1) {
          b.danger = 0
          this.takenThisFrame.push(b)
        }
      }
    }

    this.render(dt, screenEdge, viewW, viewH, flock, scrollX)
  }

  private render(dt: number, screenEdge: number, viewW: number, viewH: number, flock: Flock, scrollX: number): void {
    const vis = this.encroach > 0.001
    const t = this.scene.time.now * 0.001

    this.deep.setVisible(vis)
    if (vis) {
      // right edge kept far behind the front so the blobs always hide it
      this.deep.x = screenEdge - 430
      this.deep.setAlpha(Math.min(0.96, this.encroach * 1.6))
    }

    for (let i = 0; i < this.blobs.length; i++) {
      const img = this.blobs[i]
      const sp = this.blobSpec[i]
      img.setVisible(vis)
      if (!vis) continue
      // it BREATHES: every blob swells and shrinks and rides a slow updraft on
      // its own phase, so the mass never repeats and never sits still
      const breathe = Math.sin(t * sp.speed + sp.phase)
      const r = sp.r * (0.82 + breathe * 0.22)
      const y = sp.y + Math.sin(t * sp.speed * 0.7 + sp.phase * 1.7) * sp.rise
      const x = screenEdge + sp.dx + Math.cos(t * sp.speed * 0.55 + sp.phase) * 46
      img.setPosition(x, y)
      img.setDisplaySize(r * 1.55, r)
      // leading wisps stay thin, the body behind is dense
      const body = 0.34 + sp.depth * 0.78
      img.setAlpha(Math.min(0.95, this.encroach * 1.5 * body * (0.75 + breathe * 0.25)))
    }

    this.edgeFade.setVisible(vis)
    if (vis) {
      this.edgeFade.x = screenEdge - 130
      this.edgeFade.setAlpha(Math.min(0.95, this.encroach * 1.5))
    }

    this.rim.setVisible(vis)
    if (vis) {
      this.rim.x = screenEdge + 40
      this.rim.setAlpha(Math.min(0.55, 0.18 + this.encroach * 0.5))
    }

    // tendrils reach out of the murk toward the nearest trailing birds
    const trailing = flock.birds
      .filter((b) => b.x - this.edgeX < 520)
      .sort((a, b) => a.x - b.x)
      .slice(0, this.tendrils.length)
    for (let i = 0; i < this.tendrils.length; i++) {
      const t = this.tendrils[i]
      const target = trailing[i]
      if (!vis || !target) {
        t.setAlpha(Math.max(0, t.alpha - dt * 2))
        if (t.alpha <= 0.01) t.setVisible(false)
        continue
      }
      this.tendrilT[i] += dt * (0.7 + i * 0.11)
      // a slow reach-and-withdraw cycle: the telegraph IS the cycle
      const reach = (Math.sin(this.tendrilT[i]) * 0.5 + 0.5) ** 2
      const tx = target.x - scrollX
      const ty = target.y
      const fromX = screenEdge - 60
      t.setVisible(true)
      t.setPosition(fromX + (tx - fromX) * reach * 0.95, ty + Math.sin(this.tendrilT[i] * 1.7) * 26)
      // it STRETCHES as it reaches and thins as it extends - a finger of fog,
      // not a blob sliding across
      t.setDisplaySize(220 + reach * 420, 60 - reach * 26)
      t.setRotation(Math.atan2(ty - (this.tendrilY[i] || ty), 260) * 0.8)
      this.tendrilY[i] = ty
      t.setAlpha(this.encroach * (0.3 + reach * 0.6))
    }
  }

  destroy(): void {
    for (const bl of this.blobs) bl.destroy()
    this.deep.destroy()
    this.edgeFade.destroy()
    for (const t of this.tendrils) t.destroy()
    this.rim.destroy()
  }
}
