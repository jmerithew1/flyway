import Phaser from 'phaser'
import { Flock } from './flock'
import { birdFrameKey } from './textures'

/**
 * Small idle flocks placed off the safe path. They loiter around an anchor;
 * when the player's flock drifts near (much easier while spread), they stream
 * in and join the murmuration one by one.
 */

interface StrayBird {
  sprite: Phaser.GameObjects.Image
  angle: number
  radius: number
  speed: number
  phase: number
  joining: boolean
}

export class StrayGroup {
  x: number
  y: number
  remaining: number
  private birds: StrayBird[] = []
  private scene: Phaser.Scene
  private joinTimer = 0
  private tint: number
  private glow: Phaser.GameObjects.Image | null = null

  constructor(scene: Phaser.Scene, x: number, y: number, count: number, tint = 0x2a2038) {
    this.scene = scene
    this.x = x
    this.y = y
    this.tint = tint
    this.remaining = count
    // warm glow marker: signals "optional birds here" from a distance
    this.glow = scene.add
      .image(x, y, 'glow_warm')
      .setDisplaySize(88, 88)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1.5)
    scene.tweens.add({ targets: this.glow, alpha: 0.32, scale: this.glow.scale * 1.15, duration: 1600, yoyo: true, repeat: -1 })
    for (let i = 0; i < count; i++) {
      const sprite = scene.add.image(x, y, 'bird-mid')
      sprite.setScale(0.24)
      sprite.setAlpha(0.85)
      this.birds.push({
        sprite,
        angle: Math.random() * Math.PI * 2,
        radius: 18 + Math.random() * 42,
        speed: 1.2 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        joining: false,
      })
    }
  }

  get depleted(): boolean {
    return this.birds.length === 0
  }

  /** Returns the number of birds that joined the flock this frame. */
  update(dt: number, time: number, flock: Flock, attractRadius: number): number {
    let joined = 0
    const dx = flock.centerX - this.x
    const dy = flock.centerY - this.y
    const near = Math.hypot(dx, dy) < attractRadius

    this.joinTimer -= dt
    if (near && this.joinTimer <= 0 && this.birds.length > 0) {
      // release one bird toward the flock
      const idx = this.birds.findIndex((b) => !b.joining)
      if (idx >= 0) {
        this.birds[idx].joining = true
        this.joinTimer = 0.09
      }
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]
      if (b.joining) {
        // fly toward the flock center, then convert into a real flock bird
        const tx = flock.centerX
        const ty = flock.centerY
        const ddx = tx - b.sprite.x
        const ddy = ty - b.sprite.y
        const d = Math.hypot(ddx, ddy) || 1
        const sp = 380
        b.sprite.x += (ddx / d) * sp * dt
        b.sprite.y += (ddy / d) * sp * dt
        b.sprite.rotation = Math.atan2(ddy, ddx)
        b.sprite.setTexture(birdFrameKey(time, b.phase, 10))
        if (d < 60) {
          flock.spawnBird(b.sprite.x, b.sprite.y, (ddx / d) * 200, (ddy / d) * 200)
          b.sprite.destroy()
          this.birds.splice(i, 1)
          joined++
        }
      } else {
        // idle loiter: lazy orbit + bob; when the flock draws near they NOTICE —
        // the orbit leans toward the approaching murmuration before joining
        b.angle += b.speed * dt * 0.6
        const noticing = Math.hypot(dx, dy) < attractRadius * 1.6
        const leanX = noticing ? dx * 0.12 : 0
        const leanY = noticing ? dy * 0.12 : 0
        const wob = Math.sin(time * 1.3 + b.phase) * 8
        const px = this.x + leanX + Math.cos(b.angle) * (b.radius + wob)
        const py = this.y + leanY + Math.sin(b.angle * 0.9 + b.phase) * (b.radius * 0.55) + wob * 0.4
        b.sprite.rotation = Math.atan2(py - b.sprite.y, px - b.sprite.x)
        b.sprite.x = px
        b.sprite.y = py
        b.sprite.setTexture(birdFrameKey(time, b.phase, 8))
      }
    }
    this.remaining = this.birds.length
    if (this.remaining === 0 && this.glow) {
      const g = this.glow
      this.glow = null
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 700, onComplete: () => g.destroy() })
    }
    return joined
  }

  reset(count: number): void {
    // re-populate after a checkpoint restart
    if (!this.glow) {
      this.glow = this.scene.add
        .image(this.x, this.y, 'glow_warm')
        .setDisplaySize(88, 88)
        .setAlpha(0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.5)
    }
    for (const b of this.birds) b.sprite.destroy()
    this.birds = []
    this.joinTimer = 0
    for (let i = 0; i < count; i++) {
      const sprite = this.scene.add.image(this.x, this.y, 'bird-mid')
      sprite.setScale(0.24)
      sprite.setAlpha(0.85)
      this.birds.push({
        sprite,
        angle: Math.random() * Math.PI * 2,
        radius: 18 + Math.random() * 42,
        speed: 1.2 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        joining: false,
      })
    }
    this.remaining = count
  }

  destroy(): void {
    for (const b of this.birds) b.sprite.destroy()
    this.birds = []
    this.glow?.destroy()
    this.glow = null
  }
}
