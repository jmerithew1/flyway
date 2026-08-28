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

/**
 * The five ways a cage can be met. One cage type taught one lesson and then
 * repeated it for the whole flight; these each ask something different, and
 * the FIRST cage a player ever meets is always `perched` — safe, still, at a
 * comfortable height — because no encounter's first appearance may also be its
 * first difficulty.
 */
export type CageKind = 'perched' | 'hanging' | 'high' | 'sunken' | 'great'

export class StrayGroup {
  x: number
  y: number
  remaining: number
  readonly kind: CageKind
  private birds: StrayBird[] = []
  private scene: Phaser.Scene
  private joinTimer = 0
  private tint: number
  private glow: Phaser.GameObjects.Image | null = null
  /** What it hangs from. The break has to tear it off something, or the cage
   * merely vanishes and nothing was overcome. */
  private mount: Phaser.GameObjects.Image | null = null
  private startCount: number
  private strain = 0

  constructor(scene: Phaser.Scene, x: number, y: number, count: number, tint = 0x2a2038, index = 0) {
    this.scene = scene
    this.x = x
    this.y = y
    this.tint = tint
    this.remaining = count
    this.startCount = count
    // Derived from the placement it was already given rather than from a new
    // field, so the level's existing geometry decides the kind and the two
    // files stay independent. Height and prize size are exactly the qualities
    // a player reads off a cage at distance, so deriving from them cannot
    // disagree with what the screen shows.
    this.kind =
      index === 0 ? 'perched'
        : count >= 9 ? 'great'
          : y < 320 ? 'high'
            : y > 620 ? 'sunken'
              : index % 2 === 0 ? 'hanging' : 'perched'
    // A soft blob is shapeless and means nothing at a glance. A CAGE says
    // "birds are held here, come free them" with no explanation needed - and
    // in a game about a flock it is the one enclosure that reads instantly.
    // A great cage is visibly larger because the prize is larger — the detour
    // has to be worth taking from far enough away to decide on it.
    const swings = this.kind === 'hanging' || this.kind === 'high'
    const art = this.kind === 'great' ? 'cage_great' : swings ? 'cage' : 'cage_box'
    const size = this.kind === 'great' ? 190 : this.kind === 'sunken' ? 118 : 132
    this.glow = scene.add
      .image(x, y, scene.textures.exists(art) ? art : 'cage').setTint(0xffb35e)
      .setDisplaySize(size, size)
      .setAlpha(0.72)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1.5)
    scene.tweens.add({ targets: this.glow, alpha: 0.5, duration: 1600, yoyo: true, repeat: -1 })
    if (swings && scene.textures.exists('streak')) {
      // the chain up out of frame — cheap, and it is the entire reason the
      // collapse reads as a structure failing rather than a prop despawning
      this.mount = scene.add
        .image(x, y - size * 0.46 - 60, 'streak')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffb35e)
        .setDisplaySize(3, 130)
        .setAlpha(0.5)
        .setDepth(1.45)
    }
    if (swings) {
      // A hanging cage swings, and the swing is the difficulty: you time the
      // approach to it. A perched one must stay still, or the tell is a lie.
      scene.tweens.add({
        targets: this.glow, rotation: this.kind === 'high' ? 0.16 : 0.1,
        duration: this.kind === 'high' ? 1900 : 2400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
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
    // BUILDUP. A cage that is about to give way must LOOK about to give way:
    // strain climbs as it empties, and the shudder is the warning. Without it
    // the break is a surprise rather than a payoff you watched arrive.
    if (this.glow && this.startCount > 0) {
      this.strain = 1 - this.remaining / this.startCount
      const k = this.strain * this.strain
      const shake = k * 5.5
      this.glow.x = this.x + Math.sin(time * 26) * shake
      this.glow.y = this.y + Math.sin(time * 31 + 1.7) * shake * 0.7
      if (this.mount) {
        this.mount.x = this.glow.x
        // the chain draws taut and brightens as the load comes onto it
        this.mount.setAlpha(0.5 + k * 0.45)
        this.mount.setDisplaySize(3 + k * 2, 130)
      }
    }
    if (this.remaining === 0 && this.glow) {
      // FREEING THE CAGE. It used to just fade out, which threw away the whole
      // payoff: the cage bursts white, breaks open, and tumbles out of the sky
      // while a shockwave rings off it. You are meant to feel you broke it.
      const g = this.glow
      this.glow = null
      g.setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff)
      // THE MOUNT FAILS FIRST. The chain snaps upward as the load leaves it,
      // in the opposite direction to the falling wreck — that opposition is
      // what makes the break read as something giving way rather than as an
      // object being deleted.
      if (this.mount) {
        const m = this.mount
        this.mount = null
        this.scene.tweens.add({
          targets: m,
          y: m.y - 46,
          displayHeight: 74,
          alpha: 0,
          duration: 380,
          ease: 'Quad.easeOut',
          onComplete: () => m.destroy(),
        })
      }

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
    this.mount?.destroy()
    this.mount = null
    for (const b of this.birds) b.sprite.destroy()
    this.birds = []
    this.glow?.destroy()
    this.glow = null
  }
}
