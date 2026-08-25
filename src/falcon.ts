import Phaser from 'phaser'
import { Flock, Bird } from './flock'
import { Obstacle } from './obstacles'
import { GameAudio } from './audio'
import {
  FALCON_WINDOWS,
  FALCON_TAKE_SPREAD,
  FALCON_TAKE_NEUTRAL,
  FALCON_TAKE_GATHER,
} from './config'

export interface FalconZone {
  x: number
  done: boolean
  window: number
}

type Phase = 'idle' | 'unease' | 'shadow' | 'window' | 'strike' | 'exit'

/**
 * Authored predator set piece. Telegraph sequence: exposed upper birds react →
 * a broad shadow sweeps the top of the screen → screech, music thins → a
 * reaction window → the falcon explodes in from above the frame.
 *
 * A well-timed Gather makes it miss; a dispersed flock hands it targets.
 * Spread never SUMMONS a falcon — zones are authored — it only exposes birds.
 */
export class FalconSystem {
  zones: FalconZone[]
  phase: Phase = 'idle'
  private timer = 0
  private scene: Phaser.Scene
  private audio: GameAudio
  private shadow!: Phaser.GameObjects.Image
  private falcon!: Phaser.GameObjects.Image
  private strikeX = 0
  private window = 1.0
  private obstacles: Obstacle[] = []
  private strikeTargets: Bird[] = []
  private carried: { sprite: Phaser.GameObjects.Image; dx: number; dy: number }[] = []
  firstEncounter = true
  /** birds taken this strike, for HUD messaging */
  lastTaken = 0
  onStrikeResolved: ((taken: number, gathered: boolean) => void) | null = null

  constructor(scene: Phaser.Scene, audio: GameAudio, zoneXs: number[]) {
    this.scene = scene
    this.audio = audio
    this.zones = zoneXs.map((x, i) => ({ x, done: false, window: FALCON_WINDOWS[Math.min(i, FALCON_WINDOWS.length - 1)] }))

    // shadow: soft dark silhouette decal, screen-space, upper sky
    this.shadow = scene.add
      .image(0, 120, 'falcon')
      .setScale(3.2)
      .setTintFill(0x1a1226)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(8)
    // normalize display size regardless of source art resolution; the stand-in
    // (a scaled supplied bird pose) is darkened toward raptor silhouette
    this.falcon = scene.add.image(0, -400, 'falcon').setDepth(9).setVisible(false)
    const tex = scene.textures.get('falcon').getSourceImage() as { width: number; height: number }
    const span = 310
    this.falcon.setScale(span / tex.width)
    if (!scene.textures.exists('falcon-art')) this.falcon.setTint(0x151024)
    this.shadow.setScale((span * 1.45) / tex.width)
  }

  update(dt: number, flock: Flock, scrollX: number, viewW: number, obstacles: Obstacle[] = []): void {
    this.obstacles = obstacles
    // arm the next zone when the flock approaches
    if (this.phase === 'idle') {
      for (const z of this.zones) {
        if (!z.done && flock.centerX > z.x - 150 && flock.centerX < z.x + 600) {
          z.done = true
          this.window = z.window
          this.phase = 'unease'
          this.timer = 0
        }
      }
      return
    }

    this.timer += dt
    const t = this.timer

    if (this.phase === 'unease') {
      // exposed upper birds dip inward and tighten — the earliest tell
      for (const b of flock.birds) {
        if (b.y < flock.centerY - 60) {
          b.vy += 140 * dt
          b.panic = Math.max(b.panic, 0.35)
        }
      }
      if (t > 0.7) {
        this.phase = 'shadow'
        this.timer = 0
        this.audio.falconScreech()
      }
    } else if (this.phase === 'shadow') {
      // broad shadow sweeps the upper screen
      const sw = (this.timer / 0.9) * (viewW + 700) - 350
      this.shadow.setPosition(sw, 110 + Math.sin(this.timer * 3) * 14)
      this.shadow.setAlpha(Math.min(0.34, this.timer * 1.4))
      this.shadow.setFlipX(false)
      if (t > 0.9) {
        this.phase = 'window'
        this.timer = 0
      }
    } else if (this.phase === 'window') {
      this.shadow.setAlpha(Math.max(0, 0.34 - this.timer * 0.5))
      if (t > this.window) {
        this.phase = 'strike'
        this.timer = 0
        this.beginStrike(flock)
      }
    } else if (this.phase === 'strike') {
      // dive along a steep arc through the flock's x
      const p = Math.min(1, this.timer / 0.55)
      const fx = this.strikeX + (p - 0.5) * 260
      const fy = -160 + p * (flock.centerY + 240)
      this.falcon.setPosition(fx, fy)
      this.falcon.setRotation(0.9 - p * 0.5)
      // carried birds trail from the talons
      for (const c of this.carried) c.sprite.setPosition(fx + c.dx, fy + c.dy)
      if (p >= 1) {
        this.phase = 'exit'
        this.timer = 0
      }
    } else if (this.phase === 'exit') {
      const p = Math.min(1, this.timer / 0.8)
      const fx = this.strikeX + 130 + p * 900
      const fy = flock.centerY + 80 - p * (flock.centerY + 500)
      this.falcon.setPosition(fx, fy)
      this.falcon.setRotation(-0.4)
      this.falcon.setFlipX(false)
      for (const c of this.carried) c.sprite.setPosition(fx + c.dx, fy + c.dy)
      if (p >= 1) {
        this.falcon.setVisible(false)
        for (const c of this.carried) c.sprite.destroy()
        this.carried = []
        this.phase = 'idle'
      }
    }
  }

  /** Resolve the strike against the flock's CURRENT formation. */
  private beginStrike(flock: Flock): void {
    this.falcon.setVisible(true).setFlipX(false)
    this.strikeX = flock.centerX
    const gathered = flock.form > 0.35
    const spreadOrFrayed = flock.form < -0.3 || flock.spreadStrain > 0.4 || flock.gatherStrain > 0.6

    const range = gathered ? FALCON_TAKE_GATHER : spreadOrFrayed ? FALCON_TAKE_SPREAD : FALCON_TAKE_NEUTRAL
    let want = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1))

    // strike lane varies a little — reading the flock's position matters
    this.strikeX += (Math.random() - 0.5) * 180

    // stone overhead is COVER: birds under a solid band within ~300px above
    // cannot be taken — steering under an arch beats the falcon
    const covered = (b: Bird): boolean => {
      for (const o of this.obstacles) {
        if (o.shape !== 'rect' || o.kind !== 'solid') continue
        if (b.x > o.x - o.hw && b.x < o.x + o.hw) {
          const bandBottom = o.y + o.hh
          if (bandBottom < b.y && b.y - bandBottom < 300) return true
        }
      }
      return false
    }

    // targets: the most exposed birds (furthest above/outside the core),
    // excluding anything sheltered by architecture
    const exposed = [...flock.birds]
      .filter((b) => !covered(b))
      .map((b) => ({ b, d: Math.hypot(b.x - flock.centerX, b.y - flock.centerY) + (flock.centerY - b.y) * 0.6 }))
      .sort((a, bb) => bb.d - a.d)
    this.strikeTargets = exposed.slice(0, want).map((e) => e.b)
    this.lastTaken = this.strikeTargets.length

    // flock buckles away from the strike line
    for (const b of flock.birds) {
      const dx = b.x - this.strikeX
      const push = Math.exp(-Math.abs(dx) / 160) * 300
      b.vy += push
      b.vx += Math.sign(dx || 1) * push * 0.4
      b.panic = Math.max(b.panic, 0.6)
    }

    // take the targets: they become carried sprites trailing the talons
    for (const tb of this.strikeTargets) {
      const spr = this.scene.add.image(tb.x, tb.y, 'bird-mid').setScale(0.2).setDepth(9)
      this.carried.push({ sprite: spr, dx: (Math.random() - 0.5) * 60, dy: 40 + Math.random() * 40 })
      flock.removeBird(tb)
    }

    if (this.lastTaken > 0) this.audio.falconHit()
    else this.audio.falconMiss()
    this.onStrikeResolved?.(this.lastTaken, gathered)
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  get inWarning(): boolean {
    return this.phase === 'shadow' || this.phase === 'window'
  }

  reset(beforeX: number): void {
    for (const z of this.zones) if (z.x > beforeX) z.done = false
    this.phase = 'idle'
    this.falcon.setVisible(false)
    this.shadow.setAlpha(0)
    for (const c of this.carried) c.sprite.destroy()
    this.carried = []
  }
}
