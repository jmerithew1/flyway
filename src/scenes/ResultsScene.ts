import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { ART } from '../artManifest'
import { DAY_NAME, FLOCK_STAR_RETURNED, FLOW_STAR_FRACTION } from '../config'
import { FlightResult, FLOW_COLLISION_CAP, recordBest } from '../result'

/**
 * End-of-flight rating, fed ONLY by the FlightResult record. Feathers (bird
 * glyphs in our own art) instead of arcade stars; every feather shows WHY it
 * was earned or missed so the replay goal is obvious.
 */
export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results')
  }

  create(result: FlightResult): void {
    const prevBest = recordBest(result)

    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'bg_plate').setDisplaySize(plate.w * cover, plate.h * cover)
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.38).setOrigin(0)

    const cx = VIEW_W / 2
    const style = (size: number, color = '#f2e8f5', ls = 0) =>
      ({ fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, letterSpacing: ls }) as Phaser.Types.GameObjects.Text.TextStyle

    const title = this.add.text(cx, 118, `${DAY_NAME} — HOME`, style(38, '#f7f0ea', 6)).setOrigin(0.5).setAlpha(0)

    const rows: Array<[string, string, string]> = [
      ['Returned', String(result.birdsArrived), '#f2e8f5'],
      ['Found', `+${result.strayBirdsFound}`, '#ffd9a0'],
      ['Recovered', `+${result.scatteredBirdsRecovered}`, '#e8d9b8'],
      ['Lost', String(result.birdsPermanentlyLost), '#c9a2a2'],
    ]
    const rowObjs: Phaser.GameObjects.Text[] = []
    rows.forEach(([k, v, c], i) => {
      const y = 204 + i * 36
      rowObjs.push(this.add.text(cx - 30, y, k, style(20, '#cdbdd4')).setOrigin(1, 0.5).setAlpha(0))
      rowObjs.push(this.add.text(cx + 30, y, v, style(22, c)).setOrigin(0, 0.5).setAlpha(0))
    })

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
        result.flockFeather
          ? `Returned with ${result.birdsArrived} birds.`
          : `${result.birdsArrived} / ${FLOCK_STAR_RETURNED} required`,
      ],
      ['FLOW', result.flowFeather, flowReason],
    ]

    const row = this.add.container(cx, 448).setAlpha(0)
    const ratingKeys = ['rating_home', 'rating_flock', 'rating_flow']
    feathers.forEach(([label, earned, why], i) => {
      const x = (i - 1) * 320
      // the painted HOME/FLOCK/FLOW rating icons (earned vs unearned states)
      const key = `${ratingKeys[i]}_${earned ? 'on' : 'off'}`
      const icon = this.textures.exists(key)
        ? this.add.image(x, 0, key).setDisplaySize(96, 96)
        : this.add.image(x, 0, 'bird-up').setScale(0.42).setAngle(-18)
      if (!this.textures.exists(key)) {
        if (earned) icon.setTintFill(0xf6d9b8)
        else icon.setTintFill(0x504664).setAlpha(0.8)
      } else if (!earned) {
        icon.setAlpha(0.75)
      }
      row.add(icon)
      row.add(this.add.text(x, 52, label, style(15, earned ? '#f2e4d5' : '#8d8298', 4)).setOrigin(0.5))
      row.add(this.add.text(x, 80, why, style(13, earned ? '#c9b8a2' : '#a08f96')).setOrigin(0.5))
    })

    const earnedCount = feathers.filter(([, e]) => e).length
    const overall = this.add
      .text(cx, 592, `${earnedCount} of 3 feathers`, style(20, '#f6d9b8', 2))
      .setOrigin(0.5)
      .setAlpha(0)

    const bestLine =
      prevBest && (prevBest.birdsArrived > result.birdsArrived || (prevBest.birdsArrived === result.birdsArrived && prevBest.perfectFlows >= result.perfectFlows))
        ? `Best: ${prevBest.birdsArrived} birds · ${prevBest.perfectFlows} flows`
        : 'New best flight'
    const best = this.add.text(cx, 622, bestLine, style(14, '#a597ae')).setOrigin(0.5).setAlpha(0)

    const replay = this.add
      .text(cx, 692, 'REPLAY DAY', style(22, '#f7f0ea', 5))
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
    const replayHint = this.add.text(cx, 724, 'click, or press R', style(13, '#a597ae')).setOrigin(0.5).setAlpha(0)
    replay.on('pointerover', () => replay.setColor('#ffe6bf'))
    replay.on('pointerout', () => replay.setColor('#f7f0ea'))
    const restart = () => this.scene.start('Day')
    replay.on('pointerdown', restart)
    this.input.keyboard?.once('keydown-R', restart)

    this.tweens.add({ targets: title, alpha: 0.96, duration: 900 })
    this.tweens.add({ targets: rowObjs, alpha: 0.92, duration: 800, delay: 500 })
    this.tweens.add({ targets: row, alpha: 1, duration: 900, delay: 1100 })
    this.tweens.add({ targets: [overall, best], alpha: 1, duration: 700, delay: 1900 })
    this.tweens.add({ targets: [replay, replayHint], alpha: 0.9, duration: 700, delay: 2400 })
  }
}
