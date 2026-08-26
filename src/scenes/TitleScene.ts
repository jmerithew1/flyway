import Phaser from 'phaser'
import { ART } from '../artManifest'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { GAME_TITLE, TAGLINE, TITLE_HINT } from '../config'
import { birdFrameKey } from '../textures'
import { isTouch } from '../touch'
import { display, voice, INK } from '../ui'

/** Minimal elegant title screen on the painted plate, with drifting birds. */
export class TitleScene extends Phaser.Scene {
  private drifting: { img: Phaser.GameObjects.Image; vx: number; vy: number; ph: number }[] = []
  private rotateCard?: Phaser.GameObjects.Container

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
    const serif = (size: number, color: string = INK.bright, ls = 0) => display(size, color, ls, 300)

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
    const tag = this.add.text(cx, 396, TAGLINE, voice(24, '#eddfd8')).setOrigin(0.5).setAlpha(0)

    // the same grammar, named for the hand that's playing it
    // every verb, and what it DOES — the audit found half the control set
    // undocumented and the documented half naming effects it never explained
    const controls = isTouch
      ? [
          ['Drag', 'steer the flock'],
          ['GATHER', 'hold: tighten · tap: surge forward'],
          ['SPREAD', 'hold: widen, gather strays · tap: brake'],
          ['DIVE', 'hold: trade height for speed'],
          ['CALL', 'cry out — the lost turn home'],
          ['BOTH PADS', 'brace: the world slows'],
          ['circle', 'whirl the flock into a column'],
        ]
      : [
          ['Mouse', 'steer the flock'],
          ['SPACE', 'hold: tighten · tap: surge forward'],
          ['SHIFT', 'hold: widen, gather strays · tap: brake'],
          ['Mouse hold', 'dive: trade height for speed'],
          ['C', 'cry out — the lost turn home'],
          ['SPACE+SHIFT', 'brace: the world slows'],
          ['circle', 'whirl the flock into a column'],
        ]
    const ctrlObjs: Phaser.GameObjects.Text[] = []
    controls.forEach(([k, v], i) => {
      const y = 470 + i * 27
      ctrlObjs.push(this.add.text(cx - 18, y, k, serif(15, '#f5edf3', 2)).setOrigin(1, 0.5).setAlpha(0))
      ctrlObjs.push(this.add.text(cx + 18, y, v, serif(15, '#bdb0c9', 0)).setOrigin(0, 0.5).setAlpha(0))
    })
    const hint = this.add.text(cx, 676, TITLE_HINT, voice(17, '#f0e6ee')).setOrigin(0.5).setAlpha(0)
    hint.setShadow(0, 1, '#3a2f4a', 4)

    const begin = this.add
      .text(cx, 700, isTouch ? 'TAP TO BEGIN FLIGHT' : 'BEGIN FLIGHT', serif(24, '#f7f0ea', 6))
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    if (!isTouch) {
      // hover is cosmetic only — and on touch it would stick gold after a tap
      begin.on('pointerover', () => begin.setColor('#ffe6bf'))
      begin.on('pointerout', () => begin.setColor('#f7f0ea'))
    }

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

    this.buildRotateCard()
  }

  /**
   * Portrait rotate card. A phone held upright shows the flyway as a keyhole,
   * so ask for the wide view before the player starts rather than after.
   * Touch devices only — a tall desktop window is a window, not a phone.
   */
  private buildRotateCard(): void {
    if (!isTouch) return
    const scrim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x14102a, 0.93).setOrigin(0)
    const line = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 14, 'turn your phone to fly', voice(38, INK.warm))
      .setOrigin(0.5)
    const sub = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 46, 'THE FLOCK NEEDS THE WIDE SKY', display(16, INK.dim, 8, 300))
      .setOrigin(0.5)
    this.rotateCard = this.add.container(0, 0, [scrim, line, sub]).setDepth(200).setScrollFactor(0)
    this.tweens.add({ targets: line, alpha: 0.55, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this.syncRotateCard()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.syncRotateCard, this)
    this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, this.syncRotateCard, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.syncRotateCard, this)
      this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, this.syncRotateCard, this)
    })
  }

  private syncRotateCard(): void {
    this.rotateCard?.setVisible(window.innerHeight > window.innerWidth)
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
