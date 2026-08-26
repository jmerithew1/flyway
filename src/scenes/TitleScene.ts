import Phaser from 'phaser'
import { ART } from '../artManifest'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { GAME_TITLE, TAGLINE, TITLE_HINT } from '../config'
import { birdFrameKey } from '../textures'

/** Minimal elegant title screen on the painted plate, with drifting birds. */
export class TitleScene extends Phaser.Scene {
  private drifting: { img: Phaser.GameObjects.Image; vx: number; vy: number; ph: number }[] = []

  constructor() {
    super('Title')
  }

  create(): void {
    // the supplied title/home painting; fall back to the day plate
    const bgKey = this.textures.exists('title_bg') ? 'title_bg' : 'bg_plate'
    const plate = ART[bgKey] ?? ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add.image(VIEW_W / 2, VIEW_H / 2, bgKey).setDisplaySize(plate.w * cover, plate.h * cover)
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.18).setOrigin(0)

    // perched birds resting on the foreground — the flock at home
    if (this.textures.exists('perched_a')) {
      const perches: Array<[string, number, number, number]> = [
        ['perched_a', VIEW_W * 0.115, VIEW_H * 0.83, 64],
        ['perched_sleep', VIEW_W * 0.165, VIEW_H * 0.845, 46],
        ['perched_b', VIEW_W * 0.88, VIEW_H * 0.79, 60],
      ]
      for (const [key, x, y, h] of perches) {
        const art = ART[key]
        this.add.image(x, y, key).setDisplaySize((art.w / art.h) * h, h).setAlpha(0.95)
      }
    }

    // a handful of birds drifting lazily across the sky
    this.drifting = []
    for (let i = 0; i < 14; i++) {
      const img = this.add
        .image(Math.random() * VIEW_W, 80 + Math.random() * 380, 'bird-mid')
        .setScale(0.14 + Math.random() * 0.1)
        .setAlpha(0.55 + Math.random() * 0.3)
      this.drifting.push({ img, vx: 26 + Math.random() * 22, vy: (Math.random() - 0.5) * 8, ph: Math.random() * 7 })
    }

    const cx = VIEW_W / 2
    const serif = (size: number, color = '#f5edf3', ls = 0) =>
      ({ fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, letterSpacing: ls }) as Phaser.Types.GameObjects.Text.TextStyle

    // the painted FLYWAY wordmark (never tiny); text fallback keeps it working
    let title: Phaser.GameObjects.Image | Phaser.GameObjects.Text
    if (this.textures.exists('wordmark')) {
      const wm = ART['wordmark']
      const wmW = Math.min(560, VIEW_W * 0.42)
      title = this.add
        .image(cx, 288, 'wordmark')
        .setDisplaySize(wmW, (wm.h / wm.w) * wmW)
        .setAlpha(0)
    } else {
      const t = this.add.text(cx, 300, GAME_TITLE, serif(84, '#f7f0ea', 26)).setOrigin(0.5).setAlpha(0)
      t.setShadow(0, 2, '#3a2f4a', 8)
      title = t
    }
    const tag = this.add.text(cx, 396, TAGLINE, serif(21, '#eddfd8', 2)).setOrigin(0.5).setAlpha(0)

    const controls = [
      ['Mouse', 'Steer'],
      ['SPACE', 'hold Gather · tap Surge'],
      ['SHIFT', 'hold Spread · tap Flare'],
      ['C', 'Call the lost home'],
    ]
    const ctrlObjs: Phaser.GameObjects.Text[] = []
    controls.forEach(([k, v], i) => {
      const y = 484 + i * 34
      ctrlObjs.push(this.add.text(cx - 24, y, k, serif(18, '#f5edf3', 2)).setOrigin(1, 0.5).setAlpha(0))
      ctrlObjs.push(this.add.text(cx + 24, y, v, serif(18, '#cdbdd4', 1)).setOrigin(0, 0.5).setAlpha(0))
    })
    const hint = this.add.text(cx, 612, TITLE_HINT, serif(15, '#f0e6ee', 1)).setOrigin(0.5).setAlpha(0)
    hint.setShadow(0, 1, '#3a2f4a', 4)

    const begin = this.add
      .text(cx, 700, 'BEGIN FLIGHT', serif(24, '#f7f0ea', 6))
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    begin.on('pointerover', () => begin.setColor('#ffe6bf'))
    begin.on('pointerout', () => begin.setColor('#f7f0ea'))

    const start = () => this.scene.start('Day')
    begin.on('pointerdown', start)
    this.input.keyboard?.once('keydown-ENTER', start)
    this.input.keyboard?.once('keydown-SPACE', start)

    this.tweens.add({ targets: title, alpha: 1, duration: 1100 })
    this.tweens.add({ targets: tag, alpha: 0.95, duration: 900, delay: 500 })
    this.tweens.add({ targets: ctrlObjs, alpha: 1, duration: 800, delay: 950 })
    this.tweens.add({ targets: hint, alpha: 0.9, duration: 800, delay: 1250 })
    this.tweens.add({ targets: begin, alpha: 1, duration: 800, delay: 1500 })
    this.tweens.add({ targets: begin, scale: 1.045, duration: 1300, delay: 2300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
  }

  update(timeMs: number, deltaMs: number): void {
    const dt = deltaMs / 1000
    const t = timeMs / 1000
    for (const d of this.drifting) {
      d.img.x += d.vx * dt
      d.img.y += (d.vy + Math.sin(t * 0.8 + d.ph) * 6) * dt
      if (d.img.x > VIEW_W + 40) {
        d.img.x = -40
        d.img.y = 80 + Math.random() * 380
      }
      d.img.setTexture(birdFrameKey(t, d.ph, 6))
      d.img.rotation = Math.sin(t * 0.5 + d.ph) * 0.06
    }
  }
}
