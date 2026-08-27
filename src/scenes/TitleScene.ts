import Phaser from 'phaser'
import { ART } from '../artManifest'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { GAME_TITLE, TAGLINE, TITLE_HINT } from '../config'
import { birdFrameKey } from '../textures'
import { isTouch } from '../touch'
import { display, voice, INK } from '../ui'
import { GameAudio } from '../audio'

/** Minimal elegant title screen on the painted plate, with drifting birds. */
export class TitleScene extends Phaser.Scene {
  private drifting: { img: Phaser.GameObjects.Image; vx: number; vy: number; ph: number }[] = []
  private audio = new GameAudio()
  private musicT = 0
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
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.2).setOrigin(0)
    // the sunset is bright exactly where the words are; give them ground
    this.add
      .image(VIEW_W / 2, 300, 'softdot')
      .setTint(0x1a1332)
      .setDisplaySize(1180, 520)
      .setAlpha(0.34)
    this.add
      .image(VIEW_W / 2, 620, 'softdot')
      .setTint(0x16112c)
      .setDisplaySize(940, 520)
      .setAlpha(0.44)

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

    // ---- the painted FLYWAY wordmark: the hero, and the only large art
    let title: Phaser.GameObjects.Image | Phaser.GameObjects.Text
    if (this.textures.exists('wordmark')) {
      const wm = ART['wordmark']
      const wmW = Math.min(620, VIEW_W * 0.44)
      title = this.add.image(cx, 250, 'wordmark').setDisplaySize(wmW, (wm.h / wm.w) * wmW).setAlpha(0)
    } else {
      const t = this.add.text(cx, 250, GAME_TITLE, serif(84, '#fff6ec', 26)).setOrigin(0.5).setAlpha(0)
      t.setShadow(0, 3, '#180f28', 10)
      title = t
    }
    const tag = this.add.text(cx, 372, TAGLINE, voice(26, '#fdf1e8')).setOrigin(0.5).setAlpha(0)
    tag.setShadow(0, 2, '#180f28', 8)

    // ---- BEGIN FLIGHT: the one thing that matters, so it is the one thing
    // that is unmissable — a lit plate, big warm caps, and room around it
    // A soft radial blob behind the label read as a smudge, not a control.
    // A real plate with an edge reads as a button from across the room.
    const btnPlate = this.add
      .image(cx, 500, 'softdot')
      .setTint(0x0d0820)
      .setDisplaySize(880, 300)
      .setAlpha(0)
    const btnW = 440
    const btnH = 108
    const btnPlate2 = this.add.graphics().setAlpha(0)
    btnPlate2.fillStyle(0x120c26, 0.94)
    btnPlate2.fillRoundedRect(cx - btnW / 2, 500 - btnH / 2, btnW, btnH, btnH / 2)
    btnPlate2.lineStyle(2, 0xf0cf9a, 0.85)
    btnPlate2.strokeRoundedRect(cx - btnW / 2, 500 - btnH / 2, btnW, btnH, btnH / 2)
    const begin = this.add
      .text(cx, 498, 'BEGIN FLIGHT', serif(38, '#fff3dc', 10))
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    begin.setShadow(0, 3, '#160d24', 12)
    begin.input!.hitArea = new Phaser.Geom.Rectangle(-90, -50, begin.width + 180, begin.height + 100)
    begin.input!.hitAreaCallback = Phaser.Geom.Rectangle.Contains
    const beginHint = this.add
      .text(cx, 588, isTouch ? 'tap anywhere' : 'click, or press SPACE', serif(18, '#e6dcf0', 4))
      .setOrigin(0.5)
      .setAlpha(0)
    beginHint.setShadow(0, 3, '#180f28', 10, true, true)
    if (!isTouch) {
      begin.on('pointerover', () => begin.setColor('#ffe6bf'))
      begin.on('pointerout', () => begin.setColor('#fff3dc'))
    }

    // ---- the controls, compact and secondary: three lines a judge can scan,
    // because the rest is taught by the level as it is needed
    const controls = isTouch
      ? [
          'left thumb anywhere — the stick appears where you touch',
          'hold GATHER tighten · tap it to SURGE forward',
          'hold SPREAD widen · tap it to FLARE and brake',
          'CALL brings scattered birds back · DIVE trades height for speed',
        ]
      : [
          'move the mouse — steer the flock',
          'hold SPACE tighten · tap SPACE to SURGE forward',
          'hold SHIFT widen · tap SHIFT to FLARE and brake',
          'C calls scattered birds back · hold the mouse button to DIVE',
        ]
    const ctrlObjs: Phaser.GameObjects.Text[] = []
    controls.forEach((line, i) => {
      const t = this.add
        .text(cx, 812 + i * 29, line, serif(i === 0 ? 19 : 17, i === 0 ? '#f9f4fd' : '#ece4f4', 2))
        .setOrigin(0.5)
        .setAlpha(0)
      t.setShadow(0, 2, '#100a1e', 8)
      ctrlObjs.push(t)
    })
    const hint = ctrlObjs[2]

    // The screen says "click, or press SPACE" — and on touch, "tap anywhere" —
    // but this was bound to the BEGIN FLIGHT text object alone, so a click
    // anywhere else did nothing and the game looked broken at the very first
    // interaction anyone has with it. Any pointer down on the scene starts it.
    let started = false
    const start = (): void => {
      if (started) return
      started = true
      this.audio.start() // must ride a real gesture, so unlock here
      this.scene.start('Day')
    }
    begin.on('pointerdown', start)
    this.input.on('pointerdown', start)
    this.input.keyboard?.once('keydown-ENTER', start)
    this.input.keyboard?.once('keydown-SPACE', start)
    // the score also wakes on a mere hover, before any commitment
    this.input.once('pointermove', () => this.audio.start())
    this.input.keyboard?.once('keydown', () => this.audio.start())

    this.tweens.add({ targets: title, alpha: 1, duration: 1100 })
    this.tweens.add({ targets: tag, alpha: 0.95, duration: 900, delay: 500 })
    this.tweens.add({ targets: ctrlObjs, alpha: 1, duration: 800, delay: 1700 })
    this.tweens.add({ targets: hint, alpha: 1, duration: 800, delay: 1700 })
    this.tweens.add({ targets: [btnPlate], alpha: 0.55, duration: 800, delay: 1300 })
    this.tweens.add({ targets: [btnPlate2], alpha: 1, duration: 800, delay: 1300 })
    this.tweens.add({ targets: [begin, beginHint], alpha: 1, duration: 800, delay: 1400 })
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
      .text(VIEW_W / 2, VIEW_H / 2 + 46, 'THE FLOCK NEEDS THE WIDE SKY', display(16, INK.soft, 8, 300))
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
    this.musicT += dt
    this.audio.musicTick(dt, 0.35, 0)
    this.audio.setJourney(0.2, 1, 0)
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
