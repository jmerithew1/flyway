import Phaser from 'phaser'
import { DayStats } from './DayScene'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { ART } from '../artManifest'
import { DAY_NAME, FLOCK_STAR_RETURNED, FLOW_STAR_FRACTION } from '../config'

/**
 * End-of-day rating. Every star shows WHY it was earned or missed — the
 * player should leave knowing exactly what to improve.
 */
export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results')
  }

  create(stats: DayStats): void {
    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'bg_plate').setDisplaySize(plate.w * cover, plate.h * cover)
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.38).setOrigin(0)

    const cx = VIEW_W / 2
    const style = (size: number, color = '#f2e8f5', ls = 0) =>
      ({ fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, letterSpacing: ls }) as Phaser.Types.GameObjects.Text.TextStyle

    const title = this.add.text(cx, 128, `${DAY_NAME} — HOME`, style(38, '#f7f0ea', 6)).setOrigin(0.5).setAlpha(0)

    // ---- the three numbers that tell the story of the run
    const rows: Array<[string, string, string]> = [
      ['Returned', String(stats.returned), '#f2e8f5'],
      ['Found', `+${stats.found}`, '#ffd9a0'],
      ['Lost', String(stats.lost), '#c9a2a2'],
    ]
    const rowObjs: Phaser.GameObjects.Text[] = []
    rows.forEach(([k, v, c], i) => {
      const y = 218 + i * 40
      rowObjs.push(this.add.text(cx - 30, y, k, style(21, '#cdbdd4')).setOrigin(1, 0.5).setAlpha(0))
      rowObjs.push(this.add.text(cx + 30, y, v, style(24, c)).setOrigin(0, 0.5).setAlpha(0))
    })

    // ---- stars, each with its reason
    const flowNeeded = Math.max(1, Math.ceil(stats.flowTotal * FLOW_STAR_FRACTION))
    const homeStar = true // reaching this scene IS reaching the roost
    const flockStar = stats.returned >= FLOCK_STAR_RETURNED
    const flowStar = stats.flow >= flowNeeded

    const reasons: Array<[string, boolean, string]> = [
      ['HOME', homeStar, 'Reached the roost.'],
      [
        'FLOCK',
        flockStar,
        flockStar ? `Returned with ${stats.returned} birds.` : `${stats.returned} / ${FLOCK_STAR_RETURNED} required`,
      ],
      ['FLOW', flowStar, `${stats.flow} / ${stats.flowTotal} Perfect Flow passages`],
    ]

    const starRow = this.add.container(cx, 452).setAlpha(0)
    reasons.forEach(([label, earned, why], i) => {
      const x = (i - 1) * 320
      starRow.add(
        this.add
          .text(x, 0, earned ? '★' : '☆', { fontFamily: 'Georgia, serif', fontSize: '46px', color: earned ? '#f6d9b8' : '#5c5270' })
          .setOrigin(0.5),
      )
      starRow.add(this.add.text(x, 46, label, style(15, '#dccce0', 4)).setOrigin(0.5))
      starRow.add(this.add.text(x, 74, why, style(13, earned ? '#c9b8a2' : '#a08f96')).setOrigin(0.5))
    })

    const earnedCount = [homeStar, flockStar, flowStar].filter(Boolean).length
    const overall = this.add
      .text(cx, 588, '★'.repeat(earnedCount) + '☆'.repeat(3 - earnedCount), style(32, '#f6d9b8'))
      .setOrigin(0.5)
      .setAlpha(0)

    const replay = this.add
      .text(cx, 680, 'REPLAY DAY', style(22, '#f7f0ea', 5))
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    const replayHint = this.add.text(cx, 712, 'click, or press R', style(13, '#a597ae')).setOrigin(0.5).setAlpha(0)
    replay.on('pointerover', () => replay.setColor('#ffe6bf'))
    replay.on('pointerout', () => replay.setColor('#f7f0ea'))
    const restart = () => this.scene.start('Day')
    replay.on('pointerdown', restart)
    this.input.keyboard?.once('keydown-R', restart)

    this.tweens.add({ targets: title, alpha: 0.96, duration: 900 })
    this.tweens.add({ targets: rowObjs, alpha: 0.92, duration: 800, delay: 500 })
    this.tweens.add({ targets: starRow, alpha: 1, duration: 900, delay: 1100 })
    this.tweens.add({ targets: overall, alpha: 1, duration: 700, delay: 1900 })
    this.tweens.add({ targets: [replay, replayHint], alpha: 0.9, duration: 700, delay: 2400 })
  }
}
