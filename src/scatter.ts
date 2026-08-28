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
  halo: Phaser.GameObjects.Image | null
  vx: number
  vy: number
  life: number
  maxLife: number
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
  /** birds currently answering a call: their clock is stopped */
  private answering = new Set<ScatterBird>()
  expiredThisFrame = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /** Spawn a scattering bird at (x, y). Returns whether it can be recovered —
   * a non-recoverable spawn is a permanent loss the caller should count. */
  spawn(x: number, y: number, awayX: number, awayY: number): boolean {
    const sprite = this.scene.add.image(x, y, 'bird-mid')
    const m = Math.hypot(awayX, awayY) || 1
    // A 45% coin flip decided whether the player's own mistake was even
    // recoverable, which made both the save and the loss feel arbitrary and
    // turned Echo Call into a slot machine. Variance belongs in what you MEET,
    // never in what you EARN. Almost everything is now savable - but only if
    // you CALL, and only inside the window. Reversible if you act, permanent
    // if you do not.
    const recoverable = Math.random() < 0.78
    // a recoverable bird is a CHANCE, so it has to be visible: bigger than a
    // flock bird, warm-lit, and haloed. This is what Echo Call is for.
    sprite.setScale(recoverable ? 0.46 : 0.3).setDepth(6)
    let halo: Phaser.GameObjects.Image | null = null
    if (recoverable) {
      sprite.setTint(0xffd9a0)
      halo = this.scene.add
        .image(x, y, 'softdot')
        .setTint(0xffc98f)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(64, 64)
        .setAlpha(0.5)
        .setDepth(5.9)
      this.scene.tweens.add({
        targets: halo,
        alpha: 0.85,
        duration: 320,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
    this.birds.push({
      sprite,
      vx: (awayX / m) * (recoverable ? 220 : 120) + (Math.random() - 0.5) * (recoverable ? 120 : 70),
      vy: (awayY / m) * (recoverable ? 220 : 120) + (Math.random() - 0.5) * 90 - 60,
      life: recoverable ? 3.4 : 2.1 + Math.random() * 0.5,
      maxLife: recoverable ? 3.4 : 2.35,
      spin: (Math.random() - 0.5) * 14,
      recoverable,
      halo,
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
      // A bird that has ANSWERED a call stops dying while it flies home. This
      // is Echo's real gift - it stops the clock on the thing you are about to
      // lose forever - and it is why the verb can never be confused with
      // gather or spread, which only reshape the flock you still have.
      if (!this.answering.has(b)) b.life -= dt
      if (b.life <= 0) {
        if (b.recoverable) this.expiredThisFrame++
        b.sprite.destroy()
        b.halo?.destroy()
        this.birds.splice(i, 1)
        continue
      }
      if (b.recoverable) {
        // decelerate, then fly loosely alongside the flock (recoverable window)
        b.vx *= Math.exp(-2.5 * dt)
        b.vy *= Math.exp(-2.5 * dt)
        if (flock) {
          if (this.answering.has(b)) {
            // called home: it flies TO you, under its own power, from any
            // distance - you do not have to go and collect it
            const dx = flock.centerX - b.sprite.x
            const dy = flock.centerY - b.sprite.y
            const d = Math.hypot(dx, dy) || 1
            const speed = 520
            b.vx += ((dx / d) * speed - b.vx) * (1 - Math.exp(-5 * dt))
            b.vy += ((dy / d) * speed - b.vy) * (1 - Math.exp(-5 * dt))
          } else {
            b.vx += (flock.meanVX * 0.75 - b.vx) * (1 - Math.exp(-1.6 * dt))
            b.vy += (flock.meanVY * 0.75 - b.vy) * (1 - Math.exp(-1.6 * dt))
          }
        }
        b.sprite.x += b.vx * dt + Math.sin(time * 5 + b.phase) * 30 * dt
        b.sprite.y += b.vy * dt + Math.cos(time * 4.2 + b.phase) * 26 * dt
        b.sprite.setTexture(birdFrameKey(time, b.phase, 11))
        b.sprite.alpha = Math.min(1, b.life)
        // the halo rides along, and TIGHTENS as the window runs out — a lost
        // bird visibly becomes urgent instead of quietly vanishing
        if (b.halo) {
          const urgency = 1 - Math.min(1, b.life / 3.4)
          b.halo.setPosition(b.sprite.x, b.sprite.y)
          const size = 64 - urgency * 26
          b.halo.setDisplaySize(size, size)
          b.halo.setTint(urgency > 0.7 ? 0xff9a7a : 0xffc98f)
        }
        if (flock) {
          const d = Math.hypot(flock.centerX - b.sprite.x, flock.centerY - b.sprite.y)
          if (d < 130 + spread01 * 280) {
            // Only count a recovery that actually happened — the flock ceiling
            // can refuse the spawn, and destroying the bird anyway reported a
            // rescue that did not occur.
            if (flock.spawnBird(b.sprite.x, b.sprite.y)) {
              b.sprite.destroy()
              b.halo?.destroy()
              this.birds.splice(i, 1)
              recovered++
              this.recoveredThisFrame++
            }
          }
        }
      } else {
        // A BIRD IS LOST. This used to be a quiet tumble off-screen, which is
        // exactly why players never registered it. Now it reads: a white
        // flash, then it drops - lateral motion bleeds away fast so the fall
        // is vertical and unmistakable, wings folded, spinning down.
        // A BIRD IS LOST, in two beats you cannot miss.
        //
        // Beat one (~0.38s): it stalls out of the flock and STROBES, faster
        // and faster, like something losing its grip. Beat two: the strobe
        // stops dead and it drops straight down. A quiet tumble off-screen is
        // what players kept failing to notice at all.
        const age = 1 - b.life / b.maxLife
        const STALL = 0.38
        if (age < STALL) {
          const k = age / STALL // 0..1 through the stall
          const rate = 16 + k * 46 // the panic accelerates
          const on = Math.sin(k * k * rate * 6) > 0
          b.sprite.setTint(on ? 0xffffff : 0x2a2038)
          b.sprite.setAlpha(on ? 1 : 0.5)
          b.sprite.setScale(0.3 + (on ? 0.1 : 0))
          // it hangs, barely holding on
          b.vx *= Math.exp(-6 * dt)
          b.vy *= Math.exp(-6 * dt)
          b.sprite.x += b.vx * dt
          b.sprite.y += b.vy * dt + Math.sin(time * 30 + b.phase) * 26 * dt
        } else {
          b.sprite.setTint(0x241c33)
          b.sprite.setAlpha(Math.min(1, b.life / 0.9))
          b.sprite.setScale(0.3)
          b.vx *= Math.exp(-4.5 * dt) // the flock's momentum lets go of it
          b.vy += 1150 * dt // and it drops
          b.sprite.x += b.vx * dt
          b.sprite.y += b.vy * dt
          b.sprite.rotation += b.spin * dt
        }
      }
    }
    this.recoverableCount = this.birds.filter((b) => b.recoverable).length
    return recovered
  }

  /**
   * A call sweeps past: every recoverable bird the wavefront has reached is
   * tagged, freezes, and turns for home. Returns how many newly answered.
   */
  answerCall(radius: number): number {
    let n = 0
    for (const b of this.birds) {
      if (!b.recoverable || this.answering.has(b)) continue
      if (Math.hypot(b.sprite.x - this.callX, b.sprite.y - this.callY) > radius) continue
      this.answering.add(b)
      n++
    }
    return n
  }

  /** Where the current call was cast from. */
  private callX = 0
  private callY = 0
  beginCall(x: number, y: number): void {
    this.callX = x
    this.callY = y
  }

  endCall(): void {
    this.answering.clear()
  }

  /** Positions of every bird still inside its recovery window — so the scene
   * can show the player exactly who the call is reaching. */
  recoverables(): Array<{ x: number; y: number }> {
    return this.birds.filter((b) => b.recoverable).map((b) => ({ x: b.sprite.x, y: b.sprite.y }))
  }

  clear(): void {
    this.recoverableCount = 0
    this.recoveredThisFrame = 0
    this.expiredThisFrame = 0
    for (const b of this.birds) {
      b.sprite.destroy()
      b.halo?.destroy()
    }
    this.birds = []
  }
}
