import Phaser from 'phaser'
import { ART } from '../artManifest'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { FlightResult } from '../result'
import { birdFrameKey } from '../textures'
import { display, voice, INK } from '../ui'

/**
 * The migration map — the flyway's six roosts seen at night, from above the
 * weather. Composition rules that keep it from reading as stickers on a sky:
 *
 *  - VALUE: the plate is pushed deep and cool so the warm painted vignettes
 *    are the only bright things on screen.
 *  - HIERARCHY: the roost you have actually flown is large, fully lit and
 *    haloed; every future roost is smaller, colder, and veiled in cloud.
 *  - INTEGRATION: each marker sits in its own cloud bank with mist drifting
 *    across its base, so no vignette shows a cut edge.
 *
 * All state is runtime — feathers, best line, route lighting and fog come
 * from the stored FlightResult records, never from baked art.
 */

interface RoostNode {
  id: string // matches FlightResult.flightId → localStorage key
  markerKey: string
  label: string
  x: number
  y: number
  /** distance up the flyway reads as smaller and colder */
  depth: number
}

const NODES: RoostNode[] = [
  { id: 'ancient-ruins', markerKey: 'marker_ancient_ruins', label: 'ANCIENT RUINS', x: 0.155, y: 0.6, depth: 1 },
  { id: 'wild-orchard', markerKey: 'marker_wild_orchard', label: 'WILD ORCHARD', x: 0.335, y: 0.49, depth: 0.72 },
  { id: 'river-gorge', markerKey: 'marker_river_gorge', label: 'RIVER GORGE', x: 0.48, y: 0.59, depth: 0.62 },
  { id: 'falcon-cliffs', markerKey: 'marker_falcon_cliffs', label: 'FALCON CLIFFS', x: 0.63, y: 0.45, depth: 0.55 },
  { id: 'wind-heights', markerKey: 'marker_wind_heights', label: 'WIND HEIGHTS', x: 0.775, y: 0.34, depth: 0.48 },
  { id: 'final-roost', markerKey: 'marker_final_roost', label: 'FINAL ROOST', x: 0.9, y: 0.25, depth: 0.44 },
]

const HERO_H = 250 // display height of the roost you have flown
const FUTURE_H = 215 // base height before depth scaling
const COOL = 0x5b6ba8 // the cold distance tint future roosts wear

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
  private drift: { img: Phaser.GameObjects.Image; vx: number }[] = []
  private routeMotes: { img: Phaser.GameObjects.Image; t: number; curve: Phaser.Curves.QuadraticBezier; speed: number }[] = []

  constructor() {
    super('FlywayMap')
  }

  create(): void {
    this.orbiters = []
    this.drift = []
    this.routeMotes = []

    // ---- ground: the world at night, pushed deep so the roosts can glow
    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add
      .image(VIEW_W / 2, VIEW_H / 2, 'bg_plate')
      .setDisplaySize(plate.w * cover, plate.h * cover)
      .setTint(0x5a5a9c)
      .setAlpha(0.8)
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0e0b22, 0.58).setOrigin(0)
    // night pooling under the flyway — a gradient, never a banded edge
    this.add
      .image(VIEW_W / 2, VIEW_H, 'vfade')
      .setOrigin(0.5, 1)
      .setDisplaySize(VIEW_W, VIEW_H * 0.82)
      .setTint(0x0d0a20)
      .setAlpha(0.72)
      .setDepth(0)
    for (const [x, y] of [
      [0, 0],
      [VIEW_W, 0],
      [0, VIEW_H],
      [VIEW_W, VIEW_H],
    ]) {
      this.add.image(x, y, 'softdot').setTint(0x080614).setScale(14).setAlpha(0.45)
    }

    // ---- weather: slow cloud banks the roosts sit inside
    for (let i = 0; i < 7; i++) {
      const img = this.add
        .image(Math.random() * VIEW_W, VIEW_H * (0.28 + Math.random() * 0.56), 'softdot')
        .setTint(i % 2 ? 0x3b3a6e : 0x2a2750)
        .setScale(9 + Math.random() * 7, 2.4 + Math.random() * 1.6)
        .setAlpha(0.16 + Math.random() * 0.1)
        .setDepth(1)
      this.drift.push({ img, vx: 3 + Math.random() * 5 })
    }

    const cx = VIEW_W / 2
    const style = (size: number, color: string = INK.bright, ls = 0) => display(size, color, ls, 300)

    // ---- title: the painted wordmark, small, with a quiet line beneath
    let title: Phaser.GameObjects.GameObject
    if (this.textures.exists('wordmark')) {
      const wm = ART['wordmark']
      const w = 300
      title = this.add
        .image(cx, 72, 'wordmark')
        .setDisplaySize(w, (wm.h / wm.w) * w)
        .setAlpha(0)
        .setDepth(6)
    } else {
      title = this.add.text(cx, 66, 'THE FLYWAY', style(32, INK.bright, 14)).setOrigin(0.5).setAlpha(0).setDepth(6)
    }
    const subtitle = this.add
      .text(cx, 122, 'one flight of many — the migration heads on', voice(19, INK.soft))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(6)

    const pts = NODES.map((n) => ({ x: n.x * VIEW_W, y: n.y * VIEW_H }))

    // ---- route: a flight path, warm only where it has actually been flown
    const route = this.add.graphics().setDepth(2).setAlpha(0)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(a.x, a.y),
        new Phaser.Math.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2 + 34),
        new Phaser.Math.Vector2(b.x, b.y),
      )
      const lit = i === 0
      const dots = 26
      for (let d = 1; d < dots; d++) {
        const p = curve.getPoint(d / dots)
        if (lit) {
          route.fillStyle(0xffc98f, 0.16)
          route.fillCircle(p.x, p.y, 6)
          route.fillStyle(0xffeacb, 0.9)
          route.fillCircle(p.x, p.y, 2.2)
        } else {
          route.fillStyle(0x8b93c8, 0.22)
          route.fillCircle(p.x, p.y, 1.6)
        }
      }
      if (lit) {
        // a light travelling the flown route — the journey is alive
        for (let m = 0; m < 2; m++) {
          const img = this.add
            .image(a.x, a.y, 'softdot')
            .setTint(0xffe6bf)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.7)
            .setAlpha(0)
            .setDepth(3)
          this.routeMotes.push({ img, t: m * 0.5, curve, speed: 0.16 })
        }
      }
    }

    // ---- roosts
    const nodeObjs: Phaser.GameObjects.GameObject[] = []
    NODES.forEach((node, i) => {
      const p = pts[i]
      const best = readBest(node.id)
      const isCurrent = i === 0 // Ancient Ruins: the only flight that exists
      const art = ART[node.markerKey]
      const h = (isCurrent ? HERO_H : FUTURE_H) * node.depth
      const w = (art.w / art.h) * h

      // cloud bank: the marker sits IN weather, never on glass
      nodeObjs.push(
        this.add
          .image(p.x, p.y + h * 0.34, 'softdot')
          .setTint(isCurrent ? 0x4a3f6e : 0x2b2a54)
          .setScale(w / 44, h / 150)
          .setAlpha(isCurrent ? 0.32 : 0.26)
          .setDepth(2),
      )

      if (isCurrent) {
        // the halo that makes home the brightest thing on the map
        const halo = this.add
          .image(p.x, p.y, 'softdot')
          .setTint(0xffb46e)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(9)
          .setAlpha(0)
          .setDepth(2)
        this.tweens.add({ targets: halo, alpha: 0.2, duration: 1100, delay: 900 })
        this.tweens.add({
          targets: halo,
          alpha: 0.3,
          scale: 9.8,
          duration: 2600,
          delay: 2100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }

      const marker = this.add.image(p.x, p.y, node.markerKey).setDisplaySize(w, h).setDepth(3)
      if (!isCurrent) marker.setTint(COOL).setAlpha(0.36 + node.depth * 0.18)
      nodeObjs.push(marker)

      // mist across the base breaks the vignette's cut edge
      for (let m = 0; m < 3; m++) {
        const mist = this.add
          .image(p.x + (Math.random() - 0.5) * w * 0.8, p.y + h * (0.27 + Math.random() * 0.16), 'softdot')
          .setTint(isCurrent ? 0x6a5a92 : 0x33325f)
          .setScale((w / 90) * (1.2 + Math.random()), 0.5 + Math.random() * 0.4)
          .setAlpha(isCurrent ? 0.3 : 0.42)
          .setDepth(4)
        this.drift.push({ img: mist, vx: (Math.random() - 0.5) * 4 })
        nodeObjs.push(mist)
      }

      if (isCurrent) {
        const labelY = p.y + h * 0.56
        nodeObjs.push(this.add.text(p.x, labelY, node.label, display(20, '#ffdcae', 8, 400)).setOrigin(0.5).setDepth(5))

        if (best) {
          const featherStates: Array<[string, boolean]> = [
            ['rating_home', best.homeFeather],
            ['rating_flock', best.flockFeather],
            ['rating_flow', best.flowFeather],
          ]
          featherStates.forEach(([key, earned], fi) => {
            const texKey = `${key}_${earned ? 'on' : 'off'}`
            const fx = p.x + (fi - 1) * 46
            const fy = labelY + 42
            const icon = this.textures.exists(texKey)
              ? this.add.image(fx, fy, texKey).setDisplaySize(38, 38)
              : this.add.image(fx, fy, 'bird-up').setScale(0.16).setAngle(-18)
            icon.setDepth(5)
            if (!this.textures.exists(texKey)) icon.setTintFill(earned ? 0xf6d9b8 : 0x504664)
            if (!earned) icon.setAlpha(0.4)
            nodeObjs.push(icon)
          })
          nodeObjs.push(
            this.add
              .text(p.x, labelY + 82, `${best.birdsArrived} birds  ·  ${best.perfectFlows} flows`, display(14, '#cbb9a4', 3, 300))
              .setOrigin(0.5)
              .setDepth(5),
          )
        } else {
          nodeObjs.push(this.add.text(p.x, labelY + 40, 'awaiting first flight', voice(17, INK.dim)).setOrigin(0.5).setDepth(5))
        }

        // a small flock circling home
        this.orbitCenter = { x: p.x, y: p.y - h * 0.3 }
        for (let b = 0; b < 6; b++) {
          const img = this.add.image(p.x, p.y, 'bird-mid').setScale(0.13).setAlpha(0.9).setDepth(5)
          this.orbiters.push({ img, ph: (b / 6) * Math.PI * 2, r: 62 + b * 8, speed: 0.5 + b * 0.04 })
          nodeObjs.push(img)
        }
      } else {
        // veiled: cloud drawn OVER the marker, not a flat alpha
        const veil = this.add
          .image(p.x, p.y + h * 0.05, 'softdot')
          .setTint(0x232247)
          .setScale(w / 52, h / 105)
          .setAlpha(0)
          .setDepth(4)
        this.tweens.add({ targets: veil, alpha: 0.4, duration: 1000, delay: 1200 + i * 120 })
        this.tweens.add({
          targets: veil,
          alpha: 0.5,
          duration: 3000 + i * 260,
          delay: 2400 + i * 140,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
        nodeObjs.push(
          this.add
            .text(p.x, p.y + h * 0.58, node.label, display(13, '#7f88b8', 5, 300))
            .setOrigin(0.5)
            .setAlpha(0.7)
            .setDepth(5),
        )
      }
    })

    const continues = this.add
      .text(VIEW_W * 0.63, VIEW_H * 0.78, 'the flyway continues…', voice(20, '#9aa2cf'))
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(0)
    this.tweens.add({
      targets: continues,
      alpha: 0.85,
      duration: 2800,
      delay: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // ---- chrome
    const makeButton = (x: number, label: string, hint: string, run: () => void, warm = false) => {
      const base = warm ? INK.warm : INK.bright
      const btn = this.add
        .text(x, VIEW_H - 76, label, display(21, base, 7, 400))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(6)
        .setInteractive({ useHandCursor: true })
      btn.input!.hitArea = new Phaser.Geom.Rectangle(-60, -30, btn.width + 120, btn.height + 60)
      btn.input!.hitAreaCallback = Phaser.Geom.Rectangle.Contains
      btn.on('pointerover', () => btn.setColor('#ffe6bf'))
      btn.on('pointerout', () => btn.setColor(base))
      btn.on('pointerdown', run)
      const sub = this.add
        .text(x, VIEW_H - 48, hint, display(12, INK.dim, 2, 300))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(6)
      return [btn, sub]
    }
    const flyAgain = makeButton(cx - 170, 'FLY AGAIN', 'click, or press R', () => this.scene.start('Day'), true)
    const home = makeButton(cx + 170, 'HOME', 'esc', () => this.scene.start('Title'))
    this.input.keyboard?.once('keydown-R', () => this.scene.start('Day'))
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Title'))

    // ---- reveal: title → route → roosts → chrome
    this.tweens.add({ targets: [title, subtitle], alpha: 0.96, duration: 1000 })
    this.tweens.add({ targets: route, alpha: 1, duration: 1200, delay: 600 })
    this.revealNodes(nodeObjs)
    this.tweens.add({ targets: continues, alpha: 0.6, duration: 900, delay: 2600 })
    this.tweens.add({ targets: [...flyAgain, ...home], alpha: 0.92, duration: 800, delay: 3000 })
  }

  /** Stagger-fade node objects in from 0 to their authored alphas. */
  private revealNodes(objs: Phaser.GameObjects.GameObject[]): void {
    objs.forEach((o) => {
      const obj = o as unknown as { alpha: number; setAlpha(a: number): void }
      const target = obj.alpha
      obj.setAlpha(0)
      this.tweens.add({ targets: o, alpha: target, duration: 1000, delay: 1000 + Math.random() * 800 })
    })
  }

  update(timeMs: number, deltaMs: number): void {
    const t = timeMs / 1000
    const dt = deltaMs / 1000
    for (const o of this.orbiters) {
      const a = o.ph + t * o.speed
      o.img.x = this.orbitCenter.x + Math.cos(a) * o.r
      o.img.y = this.orbitCenter.y + Math.sin(a) * o.r * 0.4
      o.img.setFlipX(Math.cos(a + Math.PI / 2) < 0)
      o.img.setTexture(birdFrameKey(t, o.ph, 7))
    }
    for (const d of this.drift) {
      d.img.x += d.vx * dt
      if (d.img.x > VIEW_W + 300) d.img.x = -300
      if (d.img.x < -300) d.img.x = VIEW_W + 300
    }
    for (const m of this.routeMotes) {
      m.t = (m.t + dt * m.speed) % 1
      const p = m.curve.getPoint(m.t)
      m.img.setPosition(p.x, p.y)
      m.img.setAlpha(0.8 * Math.sin(m.t * Math.PI))
    }
  }
}
