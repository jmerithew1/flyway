import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from './backdrop'

/**
 * SKY AND DEPTH — six painted skies, and a skyline that recedes.
 *
 * Two defects this replaces, both measured by an art-direction audit:
 *
 * 1. **One painting for the whole game.** A single background plate was tinted
 *    by full-screen colour rectangles to produce six "acts", so the identical
 *    aqueduct silhouette appeared in the same screen position in three of them.
 *    Six real paintings, each with its own light direction, end that — and let
 *    the flat tint rectangles that were flattening every frame go away.
 *
 * 2. **The sky never moved.** The plate was pinned with `setScrollFactor(0)`,
 *    so across 25,000px of flight the sun stayed at the same screen pixel. The
 *    eye reads that instantly as flying in place against a poster. The sky now
 *    creeps, and three silhouette layers recede behind it at increasing
 *    parallax — which is what turns a backdrop into distance.
 *
 * The near strip is deliberately near-black. The same audit found the whole
 * frame sat in a 25-75% mid-tone band with no true black anywhere, which is the
 * single largest reason it read as soft rather than dramatic.
 */

/** The six acts, in flight order, matching ACT_PLATES in level.ts. */
export const SKY_KEYS = [
  'sky_dawn_approach',
  'sky_sun_gate',
  'sky_overgrown',
  'sky_wind_heights',
  'sky_gauntlet',
  'sky_homeward',
] as const

/** Three silhouette depths. Far is hazed almost to nothing; near is the black
 * floor the frame has been missing. */
const LAYERS = [
  { key: 'strip_far', factor: 0.055, y: 690, tint: 0xb9aed0, alpha: 0.55, scale: 1.35 },
  { key: 'strip_mid', factor: 0.11, y: 748, tint: 0x8578a8, alpha: 0.72, scale: 1.6 },
  { key: 'strip_near', factor: 0.2, y: 812, tint: 0x2a2340, alpha: 0.95, scale: 2.0 },
] as const

/** How fast the sky itself creeps. Small on purpose: enough that the horizon
 * is alive, not so much that the sun visibly races the flock. */
const SKY_FACTOR = 0.03

export class Skyline {
  private scene: Phaser.Scene
  private plates: Phaser.GameObjects.Image[] = []
  private strips: Phaser.GameObjects.TileSprite[] = []
  private current = 0
  private shown = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    // One plate per act, stacked and cross-faded. They are wider than the
    // canvas so they have room to creep without ever showing an edge.
    for (let i = 0; i < SKY_KEYS.length; i++) {
      const key = SKY_KEYS[i]
      if (!scene.textures.exists(key)) continue
      const img = scene.add
        .image(0, 0, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-20 + i * 0.001)
        .setAlpha(i === 0 ? 1 : 0)
      // cover the canvas height, keeping the painting's aspect
      const src = scene.textures.get(key).getSourceImage() as { width: number; height: number }
      const k = Math.max(VIEW_W / src.width, VIEW_H / src.height) * 1.08
      img.setDisplaySize(src.width * k, src.height * k)
      this.plates[i] = img
    }

    for (const L of LAYERS) {
      if (!scene.textures.exists(L.key)) continue
      const src = scene.textures.get(L.key).getSourceImage() as { width: number; height: number }
      const t = scene.add
        .tileSprite(0, L.y, VIEW_W, Math.round(src.height * L.scale), L.key)
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setTint(L.tint)
        .setAlpha(L.alpha)
        .setDepth(-19 + LAYERS.indexOf(L) * 0.01)
      t.tileScaleX = L.scale
      t.tileScaleY = L.scale
      this.strips.push(t)
    }
  }

  /** Which act's sky should be showing at this scroll position. */
  setAct(index: number): void {
    this.current = Phaser.Math.Clamp(index, 0, this.plates.length - 1)
  }

  update(dt: number, scrollX: number): void {
    // the sky creeps rather than sitting still, and drifts down a touch as the
    // flock climbs, so the horizon answers altitude
    for (let i = 0; i < this.plates.length; i++) {
      const p = this.plates[i]
      if (!p) continue
      p.x = -((scrollX * SKY_FACTOR) % Math.max(1, p.displayWidth - VIEW_W))
    }

    // cross-fade toward the current act rather than snapping
    this.shown += (this.current - this.shown) * (1 - Math.exp(-1.1 * dt))
    for (let i = 0; i < this.plates.length; i++) {
      const p = this.plates[i]
      if (!p) continue
      const d = Math.abs(i - this.shown)
      p.setAlpha(Phaser.Math.Clamp(1 - d, 0, 1))
    }

    for (let i = 0; i < this.strips.length; i++) {
      this.strips[i].tilePositionX = (scrollX * LAYERS[i].factor) / LAYERS[i].scale
    }
  }

  destroy(): void {
    for (const p of this.plates) p?.destroy()
    for (const s of this.strips) s.destroy()
  }
}
