import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { ART } from '../artManifest'
import { DAY_NAME, FLOCK_STAR_RETURNED, FLOW_STAR_FRACTION } from '../config'
import { FlightResult, FLOW_COLLISION_CAP, recordBest } from '../result'
import { SOURCE_LABEL, ScoreSource } from '../score'
import { display, voice, INK } from '../ui'

/**
 * The arrival ceremony's second half: the roost stays visible behind a rising
 * reckoning — tallies spin up, each score source lands as its own line, then
 * the three feathers reveal one at a time. Every number comes from the
 * FlightResult record; nothing here is decorative. A click or SPACE skips to
 * the end, because a repeat player chasing a best should never be held
 * hostage by their own reward screen.
 */
export class ResultsScene extends Phaser.Scene {
  private spins: { text: Phaser.GameObjects.Text; value: number; shown: number; prefix: string }[] = []
  private skipped = false
  private steps: Phaser.Time.TimerEvent[] = []

  constructor() {
    super('Results')
  }

  create(result: FlightResult): void {
    const prevBest = recordBest(result)
    this.spins = []
    this.steps = []
    this.skipped = false

    // the roost we just reached, still there behind the reckoning
    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'bg_plate').setDisplaySize(plate.w * cover, plate.h * cover)
    if (this.textures.exists('roost_tree_hero')) {
      const art = ART['roost_tree_hero']
      const h = 540
      this.add
        .image(VIEW_W * 0.79, VIEW_H * 0.99, 'roost_tree_hero')
        .setOrigin(0.5, 1)
        .setDisplaySize((art.w / art.h) * h, h)
        .setAlpha(0.5)
    }
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.5).setOrigin(0)

    const cx = VIEW_W * 0.4
    const style = (size: number, color: string = INK.bright, ls = 0) => display(size, color, ls, 300)

    const title = this.add.text(cx, 92, `${DAY_NAME} — HOME`, style(32, '#f7f0ea', 8)).setOrigin(0.5).setAlpha(0)

    // ---- the flock, counted back
    const rows: Array<[string, number, string, string]> = [
      ['Returned', result.birdsArrived, '', INK.bright],
      ['Found', result.strayBirdsFound, '+', '#ffd9a0'],
      ['Recovered', result.scatteredBirdsRecovered, '+', '#e8d9b8'],
      ['Lost', result.birdsPermanentlyLost, '', '#c9a2a2'],
    ]
    const rowObjs: Phaser.GameObjects.Text[] = []
    rows.forEach(([k, v, prefix, c], i) => {
      const y = 158 + i * 32
      rowObjs.push(this.add.text(cx - 24, y, k, style(17, INK.soft)).setOrigin(1, 0.5).setAlpha(0))
      const val = this.add.text(cx + 24, y, `${prefix}0`, style(20, c, 1)).setOrigin(0, 0.5).setAlpha(0)
      rowObjs.push(val)
      this.at(800 + i * 240, () => this.spins.push({ text: val, value: v, shown: 0, prefix }))
    })

    // ---- the flight, scored
    const bySource = (result.scoreBySource ?? {}) as Record<string, number>
    const order: ScoreSource[] = ['flow', 'cleanPass', 'breakthrough', 'mob', 'recovered', 'found', 'light', 'birds', 'nightfall']
    const lines = order.filter((k) => (bySource[k] ?? 0) > 0)
    lines.forEach((key, i) => {
      const y = 316 + i * 26
      const label = this.add.text(cx - 24, y, SOURCE_LABEL[key], style(13, '#a89bb4', 3)).setOrigin(1, 0.5).setAlpha(0)
      const val = this.add.text(cx + 24, y, `+${bySource[key]}`, style(14, '#e6d6c2', 1)).setOrigin(0, 0.5).setAlpha(0)
      this.at(1900 + i * 140, () => this.tweens.add({ targets: [label, val], alpha: 0.95, duration: 240 }))
    })

    const totalY = 316 + Math.max(lines.length, 1) * 26 + 32
    const totalLabel = this.add.text(cx - 24, totalY, 'SCORE', style(19, '#f6d9b8', 6)).setOrigin(1, 0.5).setAlpha(0)
    const totalVal = this.add.text(cx + 24, totalY, '0', display(30, '#ffe6bf', 2, 500)).setOrigin(0, 0.5).setAlpha(0)
    const streakLine =
      (result.bestStreak ?? 0) >= 3
        ? this.add.text(cx + 24, totalY + 30, `best chain ×${result.bestStreak}`, style(13, '#a89bb4', 2)).setOrigin(0, 0.5).setAlpha(0)
        : null
    this.at(1900 + lines.length * 140 + 220, () => {
      this.tweens.add({ targets: [totalLabel, totalVal, ...(streakLine ? [streakLine] : [])], alpha: 1, duration: 280 })
      this.spins.push({ text: totalVal, value: result.score ?? 0, shown: 0, prefix: '' })
    })

    // ---- the three feathers, one at a time
    const flowNeeded = Math.max(1, Math.ceil(result.totalFlowOpportunities * FLOW_STAR_FRACTION))
    const flowReason = result.flowFeather
      ? `${result.perfectFlows} / ${result.totalFlowOpportunities} Perfect Flow passages`
      : result.perfectFlows < flowNeeded
        ? `${result.perfectFlows} / ${flowNeeded} Perfect Flows needed`
        : `${result.collisionEvents} collisions — ${FLOW_COLLISION_CAP} or fewer for Flow`
    const feathers: Array<[string, boolean, string]> = [
      ['HOME', result.homeFeather, 'Reached the roost.'],
      [
        'FLOCK',
        result.flockFeather,
        result.flockFeather ? `Returned with ${result.birdsArrived} birds.` : `${result.birdsArrived} / ${FLOCK_STAR_RETURNED} required`,
      ],
      ['FLOW', result.flowFeather, flowReason],
    ]
    const ratingKeys = ['rating_home', 'rating_flock', 'rating_flow']
    const featherBase = 1900 + lines.length * 140 + 800
    feathers.forEach(([label, earned, why], i) => {
      const x = cx + (i - 1) * 250
      const y = VIEW_H - 218
      const key = `${ratingKeys[i]}_${earned ? 'on' : 'off'}`
      const icon = this.textures.exists(key)
        ? this.add.image(x, y, key).setDisplaySize(90, 90)
        : this.add.image(x, y, 'bird-up').setScale(0.42).setAngle(-18)
      if (!this.textures.exists(key)) icon.setTintFill(earned ? 0xf6d9b8 : 0x504664)
      const cap = this.add.text(x, y + 62, label, style(14, earned ? '#f2e4d5' : '#8d8298', 5)).setOrigin(0.5)
      const reason = this.add.text(x, y + 88, why, voice(15, earned ? '#c9b8a2' : '#a08f96')).setOrigin(0.5)
      icon.setAlpha(0)
      cap.setAlpha(0)
      reason.setAlpha(0)
      const baseScale = icon.scale
      this.at(featherBase + i * 480, () => {
        this.tweens.add({ targets: [icon], alpha: earned ? 1 : 0.7, duration: 360 })
        this.tweens.add({ targets: [cap, reason], alpha: earned ? 1 : 0.75, duration: 360 })
        if (earned) {
          icon.setScale(baseScale * 1.2)
          this.tweens.add({ targets: icon, scale: baseScale, duration: 420, ease: 'Back.easeOut' })
        }
      })
    })

    // ---- best flight
    const beatBest = !prevBest || (result.score ?? 0) > (prevBest.score ?? 0)
    const bestLine = beatBest ? 'NEW BEST FLIGHT' : `Best: ${prevBest?.score ?? 0} · ${prevBest?.birdsArrived ?? 0} birds`
    const best = this.add
      .text(cx, VIEW_H - 100, bestLine, display(beatBest ? 18 : 14, beatBest ? '#ffe6bf' : INK.dim, beatBest ? 6 : 2, beatBest ? 500 : 300))
      .setOrigin(0.5)
      .setAlpha(0)
    this.at(featherBase + 1600, () => this.tweens.add({ targets: best, alpha: 1, duration: 480 }))

    // ---- chrome
    const mk = (x: number, label: string, hint: string, run: () => void, warm = false) => {
      const base = warm ? INK.warm : INK.bright
      const btn = this.add
        .text(x, VIEW_H - 52, label, display(19, base, 6, 400))
        .setOrigin(0.5)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true })
      // a text-sized hit box is a miss on a phone; pad it to a real target
      btn.input!.hitArea = new Phaser.Geom.Rectangle(-60, -30, btn.width + 120, btn.height + 60)
      btn.input!.hitAreaCallback = Phaser.Geom.Rectangle.Contains
      btn.on('pointerover', () => btn.setColor('#ffe6bf'))
      btn.on('pointerout', () => btn.setColor(base))
      btn.on('pointerdown', run)
      const sub = this.add.text(x, VIEW_H - 28, hint, display(11, INK.dim, 2, 300)).setOrigin(0.5).setAlpha(0)
      this.at(featherBase + 1800, () => this.tweens.add({ targets: [btn, sub], alpha: 0.92, duration: 480 }))
    }
    mk(cx - 175, 'REPLAY FLIGHT', 'press R', () => this.scene.start('Day'), true)
    mk(cx + 175, 'CONTINUE JOURNEY', 'press J', () => this.scene.start('FlywayMap'))
    this.input.keyboard?.once('keydown-R', () => this.scene.start('Day'))
    this.input.keyboard?.once('keydown-J', () => this.scene.start('FlywayMap'))

    this.tweens.add({ targets: title, alpha: 0.96, duration: 800 })
    this.tweens.add({ targets: rowObjs, alpha: 0.92, duration: 600, delay: 600 })

    this.input.on('pointerdown', () => this.skip())
    this.input.keyboard?.on('keydown-SPACE', () => this.skip())
  }

  /** Schedule a ceremony beat a skip can fast-forward. */
  private at(ms: number, run: () => void): void {
    this.steps.push(this.time.delayedCall(ms, run))
  }

  private skip(): void {
    if (this.skipped) return
    this.skipped = true
    for (const ev of this.steps) {
      if (ev.getProgress() < 1) {
        const cb = ev.callback as () => void
        ev.remove(false)
        cb.call(this)
      }
    }
    for (const s of this.spins) {
      s.shown = s.value
      s.text.setText(`${s.prefix}${s.value}`)
    }
    this.tweens.getTweens().forEach((t) => t.seek(t.duration))
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000
    for (const s of this.spins) {
      if (s.shown >= s.value) continue
      // odometer: quick at first, easing into the final digits
      s.shown = Math.min(s.value, s.shown + Math.max(1, Math.ceil((s.value - s.shown) * dt * 6)))
      s.text.setText(`${s.prefix}${s.shown}`)
    }
  }
}
