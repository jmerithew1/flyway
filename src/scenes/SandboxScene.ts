import Phaser from 'phaser'
import { Flock } from '../flock'
import { Obstacle } from '../obstacles'
import { makeSkyTexture } from '../textures'

/**
 * Phase 1 deliverable: an empty gradient-sky sandbox where moving the mouse
 * around with no level at all is already fun to watch.
 */
export class SandboxScene extends Phaser.Scene {
  private flock!: Flock
  private obstacles: Obstacle[] = []
  private keySpace!: Phaser.Input.Keyboard.Key
  private keyShift!: Phaser.Input.Keyboard.Key
  private debugText!: Phaser.GameObjects.Text
  private debugVisible = true
  private obstacleGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('Sandbox')
  }

  create(): void {
    const W = this.scale.width
    const H = this.scale.height

    makeSkyTexture(this, 'sky-sandbox', [
      { at: 0, color: '#463d6b' },
      { at: 0.35, color: '#7a6291' },
      { at: 0.62, color: '#c48ba0' },
      { at: 0.8, color: '#eebfa4' },
      { at: 1, color: '#f6d9b8' },
    ])
    this.add.image(0, 0, 'sky-sandbox').setOrigin(0).setDisplaySize(W, H)

    // sandbox obstacles: one tower circle, one wall rect
    this.obstacles = [
      { shape: 'circle', kind: 'solid', x: W * 0.62, y: H * 0.45, r: 85 },
      { shape: 'rect', kind: 'solid', x: W * 0.3, y: H * 0.78, hw: 40, hh: 150 },
    ]
    this.obstacleGfx = this.add.graphics()
    this.drawObstacles()

    // ?birds=N — bird-sprite inspection gate (renders a small flock at real scale)
    const birdCount = Number(new URLSearchParams(window.location.search).get('birds')) || 120
    this.flock = new Flock(this, birdCount, W * 0.35, H * 0.45)

    const kb = this.input.keyboard!
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    kb.on('keydown-D', () => {
      this.debugVisible = !this.debugVisible
      this.debugText.setVisible(this.debugVisible)
    })

    // debug hooks for automated feel-testing
    ;(window as unknown as Record<string, unknown>).__sandbox = this
    ;(window as unknown as Record<string, unknown>).__flock = this.flock

    this.debugText = this.add
      .text(14, 12, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setAlpha(0.75)
      .setDepth(10)

    this.add
      .text(W / 2, H - 34, 'steer with mouse   ·   hold SPACE to gather   ·   hold SHIFT to spread', {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setAlpha(0.55)
      .setDepth(10)
  }

  private drawObstacles(): void {
    const g = this.obstacleGfx
    g.clear()
    g.fillStyle(0x5a4a72, 0.9)
    for (const o of this.obstacles) {
      if (o.shape === 'circle') g.fillCircle(o.x, o.y, o.r)
      else g.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2)
    }
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000
    const p = this.input.activePointer
    const W = this.scale.width
    const H = this.scale.height

    this.flock.update(
      dt,
      {
        intentX: Phaser.Math.Clamp(p.worldX || W * 0.4, 30, W - 30),
        intentY: Phaser.Math.Clamp(p.worldY || H * 0.45, 30, H - 30),
        gather: this.keySpace.isDown,
        spread: this.keyShift.isDown,
      },
      this.obstacles,
    )

    // gentle soft bounds so overshooting birds curve back into view
    const margin = 40
    for (const b of this.flock.birds) {
      if (b.x < margin) b.vx += (margin - b.x) * 6 * dt
      if (b.x > W - margin) b.vx -= (b.x - (W - margin)) * 6 * dt
      if (b.y < margin) b.vy += (margin - b.y) * 6 * dt
      if (b.y > H - margin) b.vy -= (b.y - (H - margin)) * 6 * dt
    }

    this.debugText.setText(
      `birds ${this.flock.count}   fps ${Math.round(this.game.loop.actualFps)}   form ${this.flock.form.toFixed(2)}`,
    )
  }
}
