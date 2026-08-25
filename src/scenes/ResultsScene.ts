import Phaser from 'phaser'
import { DayStats } from './DayScene'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { ART } from '../artManifest'

/**
 * Restrained end-of-day rating. HOME always lights (you only arrive here by
 * reaching the roost); FLOCK rewards a strong return / good stray collection;
 * FLOW rewards a clean flight with few resets and few collisions.
 */
export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results')
  }

  create(stats: DayStats): void {
    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'bg_plate').setDisplaySize(plate.w * cover, plate.h * cover)
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.35).setOrigin(0)

    const cx = VIEW_W / 2
    const style = (size: number, color = '#f2e8f5', letterSpacing = 0) =>
      ({
        fontFamily: 'Georgia, serif',
        fontSize: `${size}px`,
        color,
        letterSpacing,
      }) as Phaser.Types.GameObjects.Text.TextStyle

    const title = this.add.text(cx, 150, 'DAY 1 — HOME', style(38, '#f2e8f5', 6)).setOrigin(0.5).setAlpha(0)

    const returned = this.add
      .text(cx, 250, `Returned    ${stats.returned}`, style(24))
      .setOrigin(0.5)
      .setAlpha(0)
    const found = this.add
      .text(cx, 288, `Found    ${stats.found}`, style(24, '#d8c8dc'))
      .setOrigin(0.5)
      .setAlpha(0)

    const homeStar = stats.returned > 0
    const flockStar = stats.returned >= 100 || stats.found >= 20
    const flowStar = stats.collisionEvents <= 12 && stats.resets === 0

    const starRow = this.add.container(cx, 400).setAlpha(0)
    const labels = [
      ['HOME', homeStar, 'Reached the roost.'],
      ['FLOCK', flockStar, 'Returned strong, or gathered the optional birds.'],
      ['FLOW', flowStar, 'Clean flight — few collisions, no resets.'],
    ] as const
    labels.forEach(([label, earned], i) => {
      const x = (i - 1) * 220
      const star = this.add
        .text(x, 0, earned ? '★' : '☆', {
          fontFamily: 'Georgia, serif',
          fontSize: '44px',
          color: earned ? '#f6d9b8' : '#5c5270',
        })
        .setOrigin(0.5)
      const lab = this.add
        .text(x, 42, label, { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#d8c8dc', letterSpacing: 3 } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0.5)
      starRow.add([star, lab])
    })

    const earnedCount = [homeStar, flockStar, flowStar].filter(Boolean).length
    const overall = this.add
      .text(cx, 470, '★'.repeat(earnedCount) + '☆'.repeat(3 - earnedCount), {
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        color: '#f6d9b8',
      })
      .setOrigin(0.5)
      .setAlpha(0)

    const replay = this.add
      .text(cx, 560, 'REPLAY DAY', style(18, '#f2e8f5', 4))
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    const replayHint = this.add
      .text(cx, 590, 'click, or press R', { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#a597ae' })
      .setOrigin(0.5)
      .setAlpha(0)

    replay.on('pointerover', () => replay.setColor('#f6d9b8'))
    replay.on('pointerout', () => replay.setColor('#f2e8f5'))
    const restart = () => this.scene.start('Day')
    replay.on('pointerdown', restart)
    this.input.keyboard?.once('keydown-R', restart)

    this.tweens.add({ targets: title, alpha: 0.95, duration: 900 })
    this.tweens.add({ targets: [returned, found], alpha: 0.9, duration: 900, delay: 500 })
    this.tweens.add({ targets: starRow, alpha: 1, duration: 900, delay: 1100 })
    this.tweens.add({ targets: overall, alpha: 1, duration: 700, delay: 1900 })
    this.tweens.add({ targets: [replay, replayHint], alpha: 0.85, duration: 700, delay: 2400 })
  }
}
