import Phaser from 'phaser'
import { Flock } from './flock'
import { birdFrameKey } from './textures'

/**
 * Birds knocked out of the flock by collisions. They visibly scatter away
 * tumbling; a fraction linger fluttering and can be re-collected if the flock
 * comes near before they fade.
 */

interface ScatterBird {
  sprite: Phaser.GameObjects.Image
  vx: number
  vy: number
  life: number
  spin: number
  recoverable: boolean
  phase: number
}

export class ScatterSystem {
  private scene: Phaser.Scene
  private birds: ScatterBird[] = []
  /** birds still in their recovery window — shown as 'scattered', not lost */
  recoverableCount = 0
  /** per-frame events for HUD messaging */
  recoveredThisFrame = 0
  expiredThisFrame = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /** Spawn a scattering bird at (x, y). Returns whether it can be recovered —
   * a non-recoverable spawn is a permanent loss the caller should count. */
  spawn(x: number, y: number, awayX: number, awayY: number): boolean {
    const sprite = this.scene.add.image(x, y, 'bird-mid')
    sprite.setScale(0.3)
    const m = Math.hypot(awayX, awayY) || 1
    const recoverable = Math.random() < 0.45
    this.birds.push({
      sprite,
      vx: (awayX / m) * (220 + Math.random() * 160) + (Math.random() - 0.5) * 120,
      vy: (awayY / m) * (220 + Math.random() * 160) + (Math.random() - 0.5) * 120 - 60,
      life: recoverable ? 2.0 : 1.6 + Math.random() * 0.8,
      spin: (Math.random() - 0.5) * 14,
      recoverable,
      phase: Math.random() * Math.PI * 2,
    })
    return recoverable
  }

  /** Returns number of birds recovered into the flock this frame.
   * `spread01` widens the recollect radius — Spread is the recovery tool. */
  update(dt: number, time: number, flock: Flock | null, spread01 = 0): number {
    let recovered = 0
    this.recoveredThisFrame = 0
    this.expiredThisFrame = 0
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]
      b.life -= dt
      if (b.life <= 0) {
        if (b.recoverable) this.expiredThisFrame++
        b.sprite.destroy()
        this.birds.splice(i, 1)
        continue
      }
      if (b.recoverable) {
        // decelerate, then fly loosely alongside the flock (recoverable window)
        b.vx *= Math.exp(-2.5 * dt)
        b.vy *= Math.exp(-2.5 * dt)
        if (flock) {
          b.vx += (flock.meanVX * 0.75 - b.vx) * (1 - Math.exp(-1.6 * dt))
          b.vy += (flock.meanVY * 0.75 - b.vy) * (1 - Math.exp(-1.6 * dt))
        }
        b.sprite.x += b.vx * dt + Math.sin(time * 5 + b.phase) * 30 * dt
        b.sprite.y += b.vy * dt + Math.cos(time * 4.2 + b.phase) * 26 * dt
        b.sprite.setTexture(birdFrameKey(time, b.phase, 11))
        b.sprite.alpha = Math.min(1, b.life)
        if (flock) {
          const d = Math.hypot(flock.centerX - b.sprite.x, flock.centerY - b.sprite.y)
          if (d < 130 + spread01 * 280) {
            flock.spawnBird(b.sprite.x, b.sprite.y)
            b.sprite.destroy()
            this.birds.splice(i, 1)
            recovered++
            this.recoveredThisFrame++
          }
        }
      } else {
        // tumble away and fade
        b.vy += 150 * dt
        b.sprite.x += b.vx * dt
        b.sprite.y += b.vy * dt
        b.sprite.rotation += b.spin * dt
        b.sprite.alpha = Math.min(1, b.life / 1.2)
      }
    }
    this.recoverableCount = this.birds.filter((b) => b.recoverable).length
    return recovered
  }

  clear(): void {
    this.recoverableCount = 0
    this.recoveredThisFrame = 0
    this.expiredThisFrame = 0
    for (const b of this.birds) b.sprite.destroy()
    this.birds = []
  }
}
