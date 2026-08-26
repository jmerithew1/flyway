import Phaser from 'phaser'
import { ART } from '../artManifest'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { FlightResult } from '../result'
import { birdFrameKey } from '../textures'

/**
 * The migration map — the flyway's six roosts on one arc. All state is drawn
 * at runtime from localStorage FlightResult records (never baked into art):
 * Ancient Ruins is the only real flight, so it alone is lit; the five future
 * roosts sit foggy and unclickable under "the flyway continues…".
 */

interface RoostNode {
  id: string // matches FlightResult.flightId → localStorage key
  markerKey: string
  label: string
  x: number
  y: number
}

/** Gentle left-to-right migration arc: lower-left rising to upper-right. */
const NODES: RoostNode[] = [
  { id: 'ancient-ruins', markerKey: 'marker_ancient_ruins', label: 'ANCIENT RUINS', x: 0.13, y: 0.72 },
  { id: 'wild-orchard', markerKey: 'marker_wild_orchard', label: 'WILD ORCHARD', x: 0.29, y: 0.56 },
  { id: 'river-gorge', markerKey: 'marker_river_gorge', label: 'RIVER GORGE', x: 0.45, y: 0.63 },
  { id: 'falcon-cliffs', markerKey: 'marker_falcon_cliffs', label: 'FALCON CLIFFS', x: 0.61, y: 0.47 },
  { id: 'wind-heights', markerKey: 'marker_wind_heights', label: 'WIND HEIGHTS', x: 0.76, y: 0.36 },
  { id: 'final-roost', markerKey: 'marker_final_roost', label: 'FINAL ROOST', x: 0.895, y: 0.25 },
]

/** Best stored result for a roost, or null (missing / unreadable / pre-schema). */
function readBest(id: string): FlightResult | null {
  try {
    const raw = localStorage.getItem(`flyway-best-${id}`)
    return raw ? (JSON.parse(raw) as FlightResult) : null
  } catch {
    return null
  }
}

export class FlywayMapScene extends Phaser.Scene {
  private orbiters: { img: Phaser.GameObjects.Image; ph: number; r: number; speed: number }[] = []
  private orbitCenter = { x: 0, y: 0 }

  constructor() {
    super('FlywayMap')
  }

  create(): void {
    // painted plate, cover-scaled, under a dusk vignette (ResultsScene pattern)
    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add.image(VIEW_W / 2, VIEW_H / 2, 'bg_plate').setDisplaySize(plate.w * cover, plate.h * cover)
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530, 0.52).setOrigin(0)

    const cx = VIEW_W / 2
    const style = (size: number, color = '#f2e8f5', ls = 0) =>
      ({ fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, letterSpacing: ls }) as Phaser.Types.GameObjects.Text.TextStyle

    const title = this.add.text(cx, 84, 'THE FLYWAY', style(36, '#f7f0ea', 8)).setOrigin(0.5).setAlpha(0)
    const subtitle = this.add
      .text(cx, 128, 'one flight of many — the migration heads on', style(16, '#cdbdd4', 1))
      .setOrigin(0.5)
      .setAlpha(0)

    const pts = NODES.map((n) => ({ x: n.x * VIEW_W, y: n.y * VIEW_H }))

    // route: faint dotted curve along the whole flyway; only the first
    // (travelled) segment glows warm — Ancient Ruins is the lone completed roost
    const route = this.add.graphics().setAlpha(0)
    const drawSegment = (a: { x: number; y: number }, b: { x: number; y: number }, lit: boolean) => {
      // a soft sag between roosts so the route reads as flight, not wire
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2 + 26
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(a.x, a.y),
        new Phaser.Math.Vector2(mx, my),
        new Phaser.Math.Vector2(b.x, b.y),
      )
      const dots = 22
      for (let i = 1; i < dots; i++) {
        const p = curve.getPoint(i / dots)
        if (lit) {
          route.fillStyle(0xffd9a0, 0.22)
          route.fillCircle(p.x, p.y, 5.5)
          route.fillStyle(0xffe6bf, 0.85)
          route.fillCircle(p.x, p.y, 2.4)
        } else {
          route.fillStyle(0x9c8fb5, 0.28)
          route.fillCircle(p.x, p.y, 1.8)
        }
      }
    }
    for (let i = 0; i < pts.length - 1; i++) drawSegment(pts[i], pts[i + 1], i === 0)

    // nodes
    const nodeObjs: Phaser.GameObjects.GameObject[] = []
    const markerH = 150
    NODES.forEach((node, i) => {
      const p = pts[i]
      const best = readBest(node.id)
      const isCurrent = i === 0 // Ancient Ruins: the only flight that exists
      const art = ART[node.markerKey]
      const h = isCurrent ? markerH * 1.18 : markerH
      const marker = this.add.image(p.x, p.y, node.markerKey).setDisplaySize((art.w / art.h) * h, h)
      nodeObjs.push(marker)

      if (isCurrent) {
        // warm ground-glow beneath the living roost (fade in, then breathe)
        const glow = this.add.image(p.x, p.y + 8, 'softdot').setTint(0xffd9a0).setScale(4.6).setAlpha(0)
        this.tweens.add({ targets: glow, alpha: 0.18, duration: 900, delay: 1200 })
        this.tweens.add({ targets: glow, alpha: 0.28, duration: 2100, delay: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

        nodeObjs.push(this.add.text(p.x, p.y + h * 0.62, node.label, style(17, '#f6d9b8', 3)).setOrigin(0.5))

        // earned feathers + best line, straight from the stored FlightResult
        if (best) {
          const featherStates: Array<[string, boolean]> = [
            ['rating_home', best.homeFeather],
            ['rating_flock', best.flockFeather],
            ['rating_flow', best.flowFeather],
          ]
          featherStates.forEach(([key, earned], fi) => {
            const texKey = `${key}_${earned ? 'on' : 'off'}`
            const fx = p.x + (fi - 1) * 44
            const fy = p.y + h * 0.62 + 42
            const icon = this.textures.exists(texKey)
              ? this.add.image(fx, fy, texKey).setDisplaySize(34, 34)
              : this.add.image(fx, fy, 'bird-up').setScale(0.16).setAngle(-18)
            if (!this.textures.exists(texKey)) {
              if (earned) icon.setTintFill(0xf6d9b8)
              else icon.setTintFill(0x504664).setAlpha(0.8)
            } else if (!earned) {
              icon.setAlpha(0.55)
            }
            nodeObjs.push(icon)
          })
          nodeObjs.push(
            this.add
              .text(p.x, p.y + h * 0.62 + 78, `best: ${best.birdsArrived} birds · ${best.perfectFlows} flows`, style(13, '#c9b8a2'))
              .setOrigin(0.5),
          )
        } else {
          nodeObjs.push(this.add.text(p.x, p.y + h * 0.62 + 42, 'awaiting first flight', style(13, '#a597ae')).setOrigin(0.5))
        }

        // a small flock circling home
        this.orbitCenter = { x: p.x, y: p.y - h * 0.28 }
        for (let b = 0; b < 5; b++) {
          const img = this.add.image(p.x, p.y, 'bird-mid').setScale(0.12).setAlpha(0.85)
          this.orbiters.push({ img, ph: (b / 5) * Math.PI * 2, r: 52 + b * 7, speed: 0.55 + b * 0.05 })
          nodeObjs.push(img)
        }
      } else {
        // future roosts: fogged, cool, never clickable — the flyway continues
        marker.setAlpha(0.45)
        const fog = this.add
          .image(p.x, p.y, 'softdot')
          .setTint(0x6a5f8a)
          .setScale(3.4 + (i % 3) * 0.4)
          .setAlpha(0)
        this.tweens.add({ targets: fog, alpha: 0.3, duration: 900, delay: 1200 })
        this.tweens.add({
          targets: fog,
          alpha: 0.38,
          duration: 2600 + i * 300,
          delay: 2200 + i * 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
        nodeObjs.push(this.add.text(p.x, p.y + h * 0.62, node.label, style(14, '#8d8298', 2)).setOrigin(0.5).setAlpha(0.8))
      }
    })

    const continues = this.add
      .text(cx + VIEW_W * 0.06, VIEW_H * 0.86, 'the flyway continues…', style(17, '#a597ae', 1))
      .setOrigin(0.5)
      .setAlpha(0)
    this.tweens.add({ targets: continues, alpha: 0.9, duration: 2400, delay: 3300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    // buttons — same language as the results screen's REPLAY DAY
    const makeButton = (x: number, y: number, label: string, target: string) => {
      const btn = this.add
        .text(x, y, label, style(22, '#f7f0ea', 5))
        .setOrigin(0.5)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => btn.setColor('#ffe6bf'))
      btn.on('pointerout', () => btn.setColor('#f7f0ea'))
      btn.on('pointerdown', () => this.scene.start(target))
      return btn
    }
    const flyAgain = makeButton(cx - 160, VIEW_H - 62, 'FLY AGAIN', 'Day')
    const home = makeButton(cx + 160, VIEW_H - 62, 'HOME', 'Title')
    this.input.keyboard?.once('keydown-R', () => this.scene.start('Day'))
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Title'))

    // reveal cadence: title → route → roosts → chrome
    this.tweens.add({ targets: [title, subtitle], alpha: 0.96, duration: 900 })
    this.tweens.add({ targets: route, alpha: 1, duration: 1100, delay: 500 })
    this.revealNodes(nodeObjs)
    this.tweens.add({ targets: continues, alpha: 0.55, duration: 800, delay: 2400 })
    this.tweens.add({ targets: [flyAgain, home], alpha: 0.9, duration: 700, delay: 2800 })
  }

  /** Stagger-fade node objects in from 0 to their authored alphas. */
  private revealNodes(objs: Phaser.GameObjects.GameObject[]): void {
    objs.forEach((o) => {
      const obj = o as unknown as { alpha: number; setAlpha(a: number): void }
      const target = obj.alpha
      obj.setAlpha(0)
      this.tweens.add({ targets: o, alpha: target, duration: 900, delay: 1000 + Math.random() * 700 })
    })
  }

  update(timeMs: number): void {
    const t = timeMs / 1000
    for (const o of this.orbiters) {
      const a = o.ph + t * o.speed
      o.img.x = this.orbitCenter.x + Math.cos(a) * o.r
      o.img.y = this.orbitCenter.y + Math.sin(a) * o.r * 0.42
      o.img.setFlipX(Math.cos(a + Math.PI / 2) < 0)
      o.img.setTexture(birdFrameKey(t, o.ph, 7))
    }
  }
}
