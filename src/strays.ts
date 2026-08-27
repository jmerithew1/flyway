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
    // A soft blob is shapeless and means nothing at a glance. A CAGE says
    // "birds are held here, come free them" with no explanation needed - and
    // in a game about a flock it is the one enclosure that reads instantly.
    this.glow = scene.add
      .image(x, y, 'cage').setTint(0xffb35e)
      .setDisplaySize(132, 132)
      .setAlpha(0.72)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1.5)
    // it hangs and sways, the way a cage would
    scene.tweens.add({ targets: this.glow, alpha: 0.5, duration: 1600, yoyo: true, repeat: -1 })
    scene.tweens.add({
      targets: this.glow, rotation: 0.05, duration: 2400,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    for (let i = 0; i < count; i++) {
      const sprite = scene.add.image(x, y, 'bird-mid')
      sprite.setScale(0.2)
      sprite.setAlpha(0.85)
      this.birds.push({
        sprite,
        angle: Math.random() * Math.PI * 2,
        radius: 9 + Math.random() * 22,
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
        // they press toward the flock they can see, but the bars hold them
        const leanX = noticing ? Math.max(-14, Math.min(14, dx * 0.12)) : 0
        const leanY = noticing ? Math.max(-14, Math.min(14, dy * 0.12)) : 0
        const wob = Math.sin(time * 1.3 + b.phase) * 4
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
      // FREEING THE CAGE. It used to just fade out, which threw away the whole
      // payoff: the cage bursts white, breaks open, and tumbles out of the sky
      // while a shockwave rings off it. You are meant to feel you broke it.
      const g = this.glow
      this.glow = null
      g.setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff)

      // the burst
      this.scene.tweens.add({
        targets: g,
        displayWidth: g.displayWidth * 1.5,
        displayHeight: g.displayHeight * 1.5,
        alpha: 1,
        duration: 110,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // then it gives way and falls, spinning
          g.setTint(0xffd9a0)
          this.scene.tweens.add({
            targets: g,
            y: g.y + 260,
            rotation: g.rotation + (Math.random() < 0.5 ? -1 : 1) * 2.1,
            displayWidth: g.displayWidth * 0.7,
            displayHeight: g.displayHeight * 0.7,
            alpha: 0,
            duration: 1150,
            ease: 'Quad.easeIn',
            onComplete: () => g.destroy(),
          })
        },
      })

      // the shockwave off the break
      const ring = this.scene.add
        .image(g.x, g.y, 'alarmring')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffe9c4)
        .setDisplaySize(90, 90)
        .setDepth(1.6)
        .setAlpha(0.9)
      this.scene.tweens.add({
        targets: ring,
        displayWidth: 420,
        displayHeight: 420,
        alpha: 0,
        duration: 620,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      })

      // and the bars themselves scatter
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random()
        const bar = this.scene.add
          .image(g.x, g.y, 'streak')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffd9a0)
          .setDisplaySize(26 + Math.random() * 16, 3)
          .setRotation(a)
          .setDepth(1.6)
          .setAlpha(0.95)
        this.scene.tweens.add({
          targets: bar,
          x: g.x + Math.cos(a) * (110 + Math.random() * 90),
          y: g.y + Math.sin(a) * (70 + Math.random() * 60) + 120,
          rotation: a + (Math.random() - 0.5) * 3,
          alpha: 0,
          duration: 760 + Math.random() * 380,
          ease: 'Quad.easeIn',
          onComplete: () => bar.destroy(),
        })
      }
    }
    return joined
  }

  reset(count: number): void {
    // re-populate after a checkpoint restart
    if (!this.glow) {
      this.glow = this.scene.add
        .image(this.x, this.y, 'cage').setTint(0xffb35e)
        .setDisplaySize(132, 132)
        .setAlpha(0.72)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(1.5)
    }
    for (const b of this.birds) b.sprite.destroy()
    this.birds = []
    this.joinTimer = 0
    for (let i = 0; i < count; i++) {
      const sprite = this.scene.add.image(this.x, this.y, 'bird-mid')
      sprite.setScale(0.2)
      sprite.setAlpha(0.85)
      this.birds.push({
        sprite,
        angle: Math.random() * Math.PI * 2,
        radius: 9 + Math.random() * 22,
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
