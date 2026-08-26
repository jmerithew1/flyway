import Phaser from 'phaser'
import { Flock, Bird } from '../flock'
import { Obstacle } from '../obstacles'
import { StrayGroup } from '../strays'
import { ScatterSystem } from '../scatter'
import { GameAudio } from '../audio'
import { scoreFeathers } from '../result'
import { FalconSystem } from '../falcon'
import { birdFrameKey } from '../textures'
import { ART } from '../artManifest'
import {
  FEATURES,
  STRAYS,
  PROMPTS,
  LANDMARKS,
  WIND_ZONES,
  MOTE_ARCS,
  buildObstacles,
  pieceDisplay,
  PieceFeature,
  WindZone,
  SCROLL_SPEED,
  PRESSURE_SPEED,
  PRESSURE_START,
  ROOST_X,
  ROOST_Y,
  SKY_TOP,
  SKY_BOTTOM,
} from '../level'
import { paintFogTile, W as VIEW_W, H as VIEW_H } from '../backdrop'
import { DAY_NAME, DAY_SUBTITLE, START_BIRDS, FAIL_BIRDS, WARN_BIRDS } from '../config'
import { display, voice, INK } from '../ui'
import { Atmosphere, hazeScenery } from '../atmosphere'

export interface DayStats {
  startCount: number
  found: number
  lost: number
  collisionEvents: number
  resets: number
  returned: number
  flow: number
  flowTotal: number
  recovered: number
}

interface ActivePrompt {
  key: string
  done: () => boolean
  fading: boolean
}

interface CheckpointState {
  x: number
  name: string
  count: number
  found: number
  flow: number
}

interface AmbientFlock {
  birds: Phaser.GameObjects.Image[]
  x: number
  y: number
  vx: number
  vy: number
}

interface ParallaxImg {
  img: Phaser.GameObjects.Image
  factor: number
  spacing: number
  baseX: number
  y: number
}

export class DayScene extends Phaser.Scene {
  private flock!: Flock
  private obstacles: Obstacle[] = []
  private featureSprites = new Map<PieceFeature, Phaser.GameObjects.Image>()
  private obstacleFeature = new Map<Obstacle, PieceFeature>()
  private strays: { group: StrayGroup; def: (typeof STRAYS)[number] }[] = []
  private scatter!: ScatterSystem
  private roostSwirl: { sprite: Phaser.GameObjects.Image; a: number; r: number; s: number; ph: number }[] = []
  private ambientFlocks: AmbientFlock[] = []
  private audio = new GameAudio()
  private falcon!: FalconSystem

  private keySpace!: Phaser.Input.Keyboard.Key
  private keyShift!: Phaser.Input.Keyboard.Key
  private fogFar!: Phaser.GameObjects.TileSprite
  private leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private parallax: ParallaxImg[] = []
  private fgGround!: Phaser.GameObjects.TileSprite
  private fgBranch!: Phaser.GameObjects.Image
  private fgColumn!: Phaser.GameObjects.Image
  private colliderGfx!: Phaser.GameObjects.Graphics
  private roostHorizon!: Phaser.GameObjects.Image
  private warmth!: Phaser.GameObjects.Rectangle
  private atmo!: Atmosphere
  /** decorative echo birds that swell the final murmuration into the hundreds */
  private echoes: { img: Phaser.GameObjects.Image; leader: Bird; dx: number; dy: number; ph: number }[] = []
  private joinTimer = 0

  private scrollX = 0
  private countText!: Phaser.GameObjects.Text
  private debugText!: Phaser.GameObjects.Text
  private debugVisible = false
  private promptText!: Phaser.GameObjects.Text
  private landmarkText!: Phaser.GameObjects.Text
  private deltaText!: Phaser.GameObjects.Text
  private scatteredText!: Phaser.GameObjects.Text
  private recoveredText!: Phaser.GameObjects.Text
  private duskOverlay!: Phaser.GameObjects.Rectangle
  private failTexts: Phaser.GameObjects.Text[] = []
  private lastShownCount = START_BIRDS
  private prompt: ActivePrompt | null = null
  private shownPrompts = new Set<string>()
  private lastHit = new Map<Bird, number>()
  private brittleCharge = new Map<Obstacle, number>()
  private stuckTime = new Map<Bird, number>()
  private lossTimes: number[] = []
  private flowGates = new Map<PieceFeature, { state: 'idle' | 'active' | 'done' | 'failed'; clean: boolean; entryCount: number }>()
  private movers: {
    f: PieceFeature
    sprite: Phaser.GameObjects.Image
    baseY: number
    obs: { o: Obstacle; baseY: number }[]
    phase: number
  }[] = []
  private motes: { x: number; y: number; img: Phaser.GameObjects.Image }[] = []
  private flowStreak = 0
  private mouseTravel = 0
  private lastPointer = { x: 0, y: 0 }
  private gatherHeld = 0
  private spreadHeld = 0

  private stats: DayStats = { startCount: 120, found: 0, lost: 0, collisionEvents: 0, resets: 0, returned: 0, flow: 0, flowTotal: 0, recovered: 0 }
  private checkpoint: CheckpointState = { x: 0, name: '', count: START_BIRDS, found: 0, flow: 0 }
  private mercyTime = 0
  private lastGrazeTime = -10
  private prevGather = false
  private prevSpread = false
  private hitStop = 0
  private camKick = 0
  private lastCreak = new Map<Obstacle, number>()
  private openingZones: {
    f: PieceFeature
    x: number
    y: number
    hw: number
    hh: number
    seen: Set<Bird>
    entryLost: number
    state: 'idle' | 'active' | 'done'
  }[] = []
  private failing = false
  private finishing = false
  private finishTimer = 0
  private fadeRect!: Phaser.GameObjects.Rectangle

  constructor() {
    super('Day')
  }

  create(): void {
    if (!this.textures.exists('fog-tile')) paintFogTile(this)

    this.scrollX = 0
    this.shownPrompts.clear()
    this.lastHit.clear()
    this.brittleCharge.clear()
    this.stuckTime.clear()
    this.lossTimes = []
    this.strays = []
    this.ambientFlocks = []
    this.roostSwirl = []
    this.echoes = []
    this.joinTimer = 0
    this.parallax = []
    this.featureSprites.clear()
    this.obstacleFeature.clear()
    this.prompt = null
    this.mercyTime = 0
    this.flingTimes = []
    this.lastGrazeTime = -10
    this.prevGather = false
    this.prevSpread = false
    this.hitStop = 0
    this.camKick = 0
    this.lastCreak.clear()
    this.openingZones = []
    this.mouseTravel = 0
    this.gatherHeld = 0
    this.spreadHeld = 0
    this.failing = false
    this.finishing = false
    this.finishTimer = 0
    this.stats = {
      startCount: 120,
      found: 0,
      lost: 0,
      collisionEvents: 0,
      resets: 0,
      returned: 0,
      flow: 0,
      flowTotal: FEATURES.filter((f) => f.flow).length,
      recovered: 0,
    }
    this.checkpoint = { x: 0, name: '', count: START_BIRDS, found: 0, flow: 0 }

    // ---- backdrop: the supplied painted plate, covering the view
    const plate = ART['bg_plate']
    const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
    this.add
      .image(VIEW_W / 2, VIEW_H / 2, 'bg_plate')
      .setDisplaySize(plate.w * cover, plate.h * cover)
      .setScrollFactor(0)
      .setDepth(-10)

    // ---- slow parallax: misty ruin clusters from the panorama sheet
    const clusters: Array<[string, number, number, number, number]> = [
      // key, factor, spacing, y, alpha — TRUE painted vistas only (01/03/04
      // are segmentation fragments that upscale into blurry cards)
      ['panorama_2', 0.08, 3400, 738, 0.5],
      ['panorama_6', 0.12, 2900, 730, 0.55],
      ['panorama_5', 0.16, 2900, 748, 0.6],
      ['panorama_0', 0.12, 4100, 734, 0.5],
    ]
    for (const [key, factor, spacing, y, alpha] of clusters) {
      const art = ART[key]
      const scale = 235 / art.h
      const img = this.add.image(0, y, key).setScale(scale).setAlpha(alpha).setScrollFactor(0).setDepth(-6)
      this.parallax.push({ img, factor, spacing, baseX: Math.random() * spacing, y })
    }

    this.fogFar = this.add
      .tileSprite(0, VIEW_H - 400, VIEW_W, 200, 'fog-tile')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.14)
      .setDepth(-4)

    // the roost, faint on the horizon from mid-game — WE'RE GETTING CLOSE
    this.roostHorizon = this.add
      .image(VIEW_W * 0.82, 742, 'roost_tree')
      .setOrigin(0.5, 1)
      .setDisplaySize(90, 64)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(-5)
    // dusk warms across the day (screen-space, restrained)
    this.warmth = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0xff9a5c)
      .setOrigin(0)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.OVERLAY)
      .setDepth(7.5)
      .setAlpha(0)

    // ---- obstacles: colliders from the manifest, sprites placed over them
    const built = buildObstacles()
    this.obstacles = built.obstacles
    for (const [feature, obs] of built.byFeature) {
      for (const o of obs) this.obstacleFeature.set(o, feature)
    }
    this.placePieces()
    // hero landmark scenery: checkpoint identity, deliberately non-colliding
    // (they sit just behind the flight plane; the flock passes in front)
    const bellH = 660
    this.add
      .image(9600, 942 - bellH / 2, 'bell_tower')
      .setDisplaySize((388 / 1056) * bellH, bellH)
      .setDepth(0.6)
      .setAlpha(0.92)
      .setTint(0xd9cfe8)
    const spireH = 600
    this.add
      .image(13600, 942 - spireH / 2, 'storm_spire')
      .setDisplaySize((492 / 936) * spireH, spireH)
      .setDepth(0.6)
      .setAlpha(0.9)
      .setTint(0xc9c2dd)
    this.placeWindFx()
    // Phase 5 light layer: act mood plates, sunbeams through real openings, wisps
    this.atmo = new Atmosphere(this, { warmth: this.warmth, fogFar: this.fogFar })
    this.atmo.createBeams()
    this.atmo.createWisps()
    this.drawRoost()
    this.flowGates.clear()
    for (const f of FEATURES) if (f.flow) this.flowGates.set(f, { state: 'idle', clean: true, entryCount: 0 })
    // real openings (arch mouths, window bays) become clean-pass zones
    for (const f of FEATURES) {
      const art = ART[f.art]
      if (!art.openings.length || f.brittle) continue
      const disp = pieceDisplay(f)
      const tlx = f.x - disp.w / 2
      const tly = disp.y - disp.h / 2
      for (const r of art.openings) {
        const rx = f.flipX ? art.w - r.x - r.w : r.x
        this.openingZones.push({
          f,
          x: tlx + (rx + r.w / 2) * disp.s,
          y: tly + (r.y + r.h / 2) * disp.s,
          hw: (r.w * disp.s) / 2,
          hh: (r.h * disp.s) / 2,
          seen: new Set(),
          entryLost: 0,
          state: 'idle',
        })
      }
    }
    // brittle pieces shimmer faintly at rest — the "this one is different" tell
    for (const [f, sprite] of this.featureSprites) {
      if (f.brittle && !f.motion) {
        this.tweens.add({ targets: sprite, alpha: (f.alpha ?? 1) * 0.82, duration: 1300 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      }
    }
    // moving obstacles: art and colliders travel together
    this.movers = []
    for (const [f, sprite] of this.featureSprites) {
      if (!f.motion) continue
      const obs: { o: Obstacle; baseY: number }[] = []
      for (const [o, feat] of this.obstacleFeature) if (feat === f) obs.push({ o, baseY: o.y })
      this.movers.push({ f, sprite, baseY: sprite.y, obs, phase: Math.random() * Math.PI * 2 })
    }
    this.motes = []
    for (const arc of MOTE_ARCS) {
      for (let i = 0; i < arc.count; i++) {
        // scatter along the arc rather than stepping it: evenly spaced,
        // identical dots read as a ruler, not as drifting light
        const t = (i + (Math.random() - 0.5) * 0.55) / (arc.count - 1)
        const mx = arc.x - arc.spanX / 2 + arc.spanX * t
        const my =
          arc.y + Math.sin(t * Math.PI) * -arc.spanY * 0.5 + arc.spanY * 0.18 + (Math.random() - 0.5) * 46
        const size = 26 + Math.random() * 18
        const img = this.add
          .image(mx, my, 'softdot')
          .setTint(0xffd9a0)
          .setDisplaySize(size, size)
          .setAlpha(0.6 + Math.random() * 0.25)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(2.5)
        this.tweens.add({
          targets: img,
          alpha: 0.38 + Math.random() * 0.12,
          duration: 800 + Math.random() * 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
        this.motes.push({ x: mx, y: my, img })
      }
    }

    this.colliderGfx = this.add.graphics().setDepth(19).setVisible(false)

    // authored predator zones: one mid-day, one in the final run
    this.falcon = new FalconSystem(this, this.audio, [8150, 22300])
    this.falcon.onStrikeResolved = (taken, gathered, mobbed) => {
      if (mobbed) {
        // THE FLOCK FIGHTS BACK — triumph, not relief
        this.mobLift = 1.5
        this.flock.gatherTime += 1.5
        this.hitStop = 0.07
        this.camKick = 2.6
        this.audio.falconScreech()
        this.perfectFlowFeedback()
        this.showLandmark('THE FLOCK FIGHTS BACK')
        return
      }
      if (taken > 0) {
        this.showPrompt('call', 'press C — call them back', () => this.scatter.recoveredThisFrame > 0)
        // sharp feather burst where the talons crossed the flock
        const burst = this.add.particles(this.flock.centerX, this.flock.centerY - 60, 'feather', {
          speed: { min: 120, max: 380 },
          angle: { min: -160, max: -20 },
          lifespan: { min: 700, max: 1500 },
          quantity: 30,
          scale: { min: 0.35, max: 0.75 },
          alpha: { start: 0.95, end: 0 },
          rotate: { min: 0, max: 360 },
          gravityY: 30,
          tint: [0x2a2440, 0x453a5e, 0x6b5f85],
          emitting: false,
        })
        burst.setDepth(9)
        burst.explode(30, 0, 0)
        this.time.delayedCall(1600, () => burst.destroy())
        this.hitStop = 0.06
        this.camKick = 2.6
      } else if (gathered) {
        // defensive success: a satisfying near-miss flourish
        this.perfectFlowFeedback()
      }
      // subtle camera emphasis — a nudge, never disorienting shake
      this.cameras.main.zoomTo(1.03, 120, 'Sine.easeOut', true)
      this.time.delayedCall(240, () => this.cameras.main.zoomTo(1, 320, 'Sine.easeInOut', true))
    }

    this.flock = new Flock(this, 120, 420, 430)
    this.flock.intentX = 600
    this.flock.intentY = 430
    this.scatter = new ScatterSystem(this)
    for (const def of STRAYS) this.strays.push({ group: new StrayGroup(this, def.x, def.y, def.count), def })

    this.leafEmitter = this.add
      .particles(0, 0, 'leaf', {
        x: { min: 0, max: VIEW_W },
        y: { min: 0, max: VIEW_H * 0.8 },
        lifespan: 9000,
        speedX: { min: -60, max: -25 },
        speedY: { min: -8, max: 14 },
        scale: { min: 0.25, max: 0.6 },
        alpha: { start: 0, end: 0.3, ease: 'Quad.easeOut' },
        rotate: { min: 0, max: 360 },
        quantity: 1,
        frequency: 700,
        tint: [0x3a2f4a, 0x4a3b58],
      })
      .setScrollFactor(0)
      .setDepth(5)
    this.add
      .particles(0, 0, 'softdot', {
        x: { min: 0, max: VIEW_W },
        y: { min: 0, max: VIEW_H * 0.9 },
        lifespan: 12000,
        speedX: { min: -30, max: -12 },
        speedY: { min: -6, max: 6 },
        scale: { min: 0.03, max: 0.09 },
        alpha: { start: 0, end: 0.25, ease: 'Quad.easeOut' },
        quantity: 1,
        frequency: 900,
        tint: 0xf7e0bd,
      })
      .setScrollFactor(0)
      .setDepth(-3)

    // ---- foreground: garden overlay pieces, edges only (≤ ~12% coverage)
    this.fgGround = this.add
      .tileSprite(0, VIEW_H - 86, VIEW_W, 86, 'fg_ground')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(6)
    const groundArt = ART['fg_ground']
    this.fgGround.tileScaleY = 86 / groundArt.h
    this.fgGround.tileScaleX = this.fgGround.tileScaleY
    this.fgBranch = this.add
      .image(-20, -16, 'fg_tl_branch')
      .setOrigin(0, 0)
      .setDisplaySize(430, 210)
      .setScrollFactor(0)
      .setDepth(6.6)
      .setAlpha(0.96)
    this.fgColumn = this.add
      .image(VIEW_W + 20, -14, 'fg_tr_column')
      .setOrigin(1, 0)
      .setDisplaySize(215, 175)
      .setScrollFactor(0)
      .setDepth(6.6)
      .setAlpha(0.96)

    const kb = this.input.keyboard!
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    kb.on('keydown-C', () => this.echoCall())
    kb.on('keydown-E', () => this.echoCall())
    kb.on('keydown-D', () => {
      this.debugVisible = !this.debugVisible
      this.debugText.setVisible(this.debugVisible)
      this.colliderGfx.setVisible(this.debugVisible)
    })
    this.input.once('pointermove', () => this.audio.start())
    kb.once('keydown', () => this.audio.start())

    this.fadeRect = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(50)
      .setAlpha(0)

    // ---- minimal HUD: bird icon + count only
    this.add
      .image(30, 32, 'bird-mid')
      .setScale(0.34)
      .setTintFill(0xf2e8f5)
      .setAlpha(0.9)
      .setScrollFactor(0)
      .setDepth(20)
    this.countText = this.add
      .text(52, 18, '120', display(28, INK.bright, 1))
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(20)
    this.debugText = this.add
      .text(14, 60, '', display(14, '#ffffff'))
      .setAlpha(0.7)
      .setScrollFactor(0)
      .setDepth(20)
      .setVisible(false)
    this.promptText = this.add
      .text(0, 0, '', voice(23, '#f7ecdf'))
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.landmarkText = this.add
      .text(VIEW_W / 2, 150, '', display(22, '#f2e4d5', 6, 300))
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.deltaText = this.add
      .text(96, 44, '', display(19, INK.bright, 1))
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.scatteredText = this.add
      .text(52, 46, '', display(13, '#d8c0a8', 1, 300))
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.recoveredText = this.add
      .text(52, 68, '', display(13, '#ffd9a0', 1, 300))
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.lastShownCount = START_BIRDS
    // dusk tint used by the failure sequence (and later, journey warmth)
    this.duskOverlay = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x2a1f3d)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(48)
      .setAlpha(0)
    this.failTexts = []

    // ---- day intro: over live gameplay, no confirmation
    const introBits = [
      this.add.text(VIEW_W / 2, 330, DAY_NAME, display(42, '#f7f0ea', 14, 300)).setOrigin(0.5).setScrollFactor(0).setDepth(30),
      this.add.text(VIEW_W / 2, 386, DAY_SUBTITLE, display(18, '#dccce0', 9, 300)).setOrigin(0.5).setScrollFactor(0).setDepth(30),
      this.add.text(VIEW_W / 2, 442, `${START_BIRDS} birds`, display(18, INK.bright, 2, 300)).setOrigin(0.5).setScrollFactor(0).setDepth(30),
      this.add.text(VIEW_W / 2, 472, 'Reach the roost.', voice(19, INK.soft)).setOrigin(0.5).setScrollFactor(0).setDepth(30),
    ]
    for (const t of introBits) t.setAlpha(0)
    this.tweens.add({ targets: introBits, alpha: 0.95, duration: 550, hold: 1300, yoyo: true, onComplete: () => introBits.forEach((t) => t.destroy()) })

    this.time.delayedCall(1400, () =>
      this.showPrompt('steer', 'move the mouse — steer the flock', () => this.mouseTravel > 900),
    )

    ;(window as unknown as Record<string, unknown>).__day = this
    ;(window as unknown as Record<string, unknown>).__flock = this.flock
  }

  // ------------------------------------------------------------------ visuals

  /** Place one sprite per feature. Art overhangs its simple colliders freely. */
  private placePieces(): void {
    for (const f of FEATURES) {
      const { s, y } = pieceDisplay(f)
      const img = this.add
        .image(f.x, y, f.art)
        .setScale(s)
        .setFlipX(!!f.flipX)
        .setDepth(3)
        .setAlpha(f.alpha ?? 1)
      // ---- dusk grade: the sheets were painted lit-from-above at noon
      // strength, which is what made stone read as pasted-on cards. Every
      // placed piece gets a warm multiply toward the sunset palette, keyed
      // to height so airborne pieces sit further back in the haze, plus a
      // little per-placement variance so the family never looks stamped.
      const airborne = f.mount === 'top' || f.mount === 'mid'
      const t = Phaser.Math.Clamp((SKY_BOTTOM - y) / (SKY_BOTTOM - SKY_TOP), 0, 1)
      const warm = airborne ? 0xe6c6d6 : 0xf3ded8
      const sky = 0xcfb6d8
      const grade = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(warm),
        Phaser.Display.Color.ValueToColor(sky),
        100,
        Math.round((airborne ? 55 : 26) * t),
      )
      const jitter = 1 - Math.random() * 0.05
      img.setTint(
        Phaser.Display.Color.GetColor(
          Math.round(grade.r * jitter),
          Math.round(grade.g * jitter),
          Math.round(grade.b * jitter),
        ),
      )
      if (airborne) img.setAlpha((f.alpha ?? 1) * (1 - 0.06 * t))
      // ground haze: every grounded base sinks into the garden mist instead
      // of ending on a hard silhouette line
      if (!airborne) {
        const disp = pieceDisplay(f)
        this.add
          .image(f.x, y + (disp.h / 2) * 0.88, 'softdot')
          .setTint(0x6a5c86)
          .setDisplaySize(disp.w * 1.15, 96)
          .setAlpha(0.3)
          .setDepth(3.4)
      }
      if (f.sway) {
        img.setAngle(-2)
        this.tweens.add({
          targets: img,
          angle: 2,
          duration: 2600 + Math.random() * 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }
      this.featureSprites.set(f, img)
    }
  }

  /** Wind FX sprites make each wind zone readable before the flock enters it. */
  private placeWindFx(): void {
    for (const z of WIND_ZONES) {
      const streamKey = z.kind === 'cross' ? 'wind_stream_long' : 'wind_stream_wave'
      const angle = z.kind === 'updraft' ? -18 : z.kind === 'down' ? 16 : 0
      const ys = z.kind === 'down' ? [260, 520] : [220, 430, 640]
      let i = 0
      for (let x = z.x0 + 240; x < z.x1; x += 520) {
        const y = ys[i % ys.length]
        i++
        const img = this.add.image(x, y, streamKey).setDisplaySize(560, 96).setAngle(angle).setAlpha(0.5).setDepth(2)
        this.tweens.add({
          targets: img,
          alpha: 0.28,
          x: x + 46,
          duration: 1500 + (i % 3) * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }
    }
  }

  private drawRoost(): void {
    // soft distant swirl behind the tree, then the tree itself
    this.add.image(ROOST_X - 60, ROOST_Y - 190, 'flock_swirl').setDisplaySize(420, 420).setAlpha(0.5).setDepth(1.6)
    const roostKey = this.textures.exists('roost_tree_hero') ? 'roost_tree_hero' : 'roost_tree'
    const roostArt = ART[roostKey]
    const roostH = 620
    this.add
      .image(ROOST_X, 900, roostKey)
      .setOrigin(0.5, 1)
      .setDisplaySize((roostArt.w / roostArt.h) * roostH, roostH)
      .setDepth(2)
    // the roost stands in its own mist, like every other grounded piece
    this.add
      .image(ROOST_X, 872, 'softdot')
      .setTint(0x6a5c86)
      .setDisplaySize((roostArt.w / roostArt.h) * roostH * 1.1, 150)
      .setAlpha(0.34)
      .setDepth(2.4)
    for (let i = 0; i < 30; i++) {
      const sprite = this.add.image(ROOST_X, ROOST_Y, 'bird-mid').setScale(0.16).setDepth(2)
      this.roostSwirl.push({
        sprite,
        a: Math.random() * Math.PI * 2,
        r: 140 + Math.random() * 210,
        s: 0.45 + Math.random() * 0.75,
        ph: Math.random() * Math.PI * 2,
      })
    }
  }

  // ------------------------------------------------------------------ prompts

  private promptQueue: { key: string; text: string; done: () => boolean }[] = []
  private promptAge = 0
  private spaceDownT = -10
  private shiftDownT = -10
  private callTimer = 0
  private callCooldown = 0
  private callStrength = 1
  private mobLift = 0
  private draftTrailT = 0
  private journeyTick = 0

  /** Surge: tap SPACE — whipcrack pulse. Weak and ragged when strained. */
  private doSurge(): void {
    this.flock.surge()
    this.audio.surgeWhoosh(1 - this.flock.gatherStrain * 0.5)
    // speed streaks along the direction of travel
    const m = Math.hypot(this.flock.meanVX, this.flock.meanVY) || 1
    const p = this.add
      .particles(this.flock.centerX, this.flock.centerY, 'softdot', {
        speedX: { min: (this.flock.meanVX / m) * 380 - 40, max: (this.flock.meanVX / m) * 520 + 40 },
        speedY: { min: (this.flock.meanVY / m) * 380 - 40, max: (this.flock.meanVY / m) * 520 + 40 },
        lifespan: { min: 220, max: 420 },
        scale: { start: 0.42, end: 0.02 },
        alpha: { start: 0.7, end: 0 },
        tint: 0xfff1dc,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(6)
    p.explode(14)
    this.time.delayedCall(500, () => p.destroy())
  }

  /** Flare: tap SHIFT — the flock blooms wide and air-brakes. */
  private doFlare(): void {
    this.flock.flare()
    this.audio.formSnap('spread')
    this.formFlourish(false)
  }

  /** Echo Call: tap C — the flock cries out; the scattered and the stray
   * turn toward home. Hoarse (weak) while on its diegetic cooldown. */
  private echoCall(): void {
    if (this.finishing || this.failing) return
    const strained = Math.max(this.flock.gatherStrain, this.flock.spreadStrain) > 0.6
    if (this.callCooldown > 0) {
      this.audio.echoCall(0.35) // hoarse — the voice hasn't returned yet
      return
    }
    this.callStrength = strained ? 0.55 : 1
    this.callTimer = 2.5
    this.callCooldown = 6
    this.audio.echoCall(this.callStrength)
    // the cry propagates: three expanding rings, and birds flash warm as
    // the wave passes over them
    for (let i = 0; i < 3; i++) {
      const ring = this.add
        .image(this.flock.centerX, this.flock.centerY, 'softdot')
        .setTint(0xffd9a0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(6)
        .setAlpha((0.45 - i * 0.1) * this.callStrength)
        .setDisplaySize(120, 120)
      this.tweens.add({
        targets: ring,
        displayWidth: (700 + i * 260) * this.callStrength,
        displayHeight: (700 + i * 260) * this.callStrength,
        alpha: 0,
        duration: 1000 + i * 260,
        delay: i * 140,
        ease: 'Sine.easeOut',
        onComplete: () => ring.destroy(),
      })
    }
    const cx = this.flock.centerX
    const cy = this.flock.centerY
    for (const b of this.flock.birds) {
      const d = Math.hypot(b.x - cx, b.y - cy)
      this.time.delayedCall(d * 1.6, () => {
        if (!b.sprite.active) return
        b.sprite.setTint(0xffe6c4)
        this.time.delayedCall(130, () => b.sprite.active && b.sprite.clearTint())
      })
    }
  }

  /** One-time prompts queue instead of being dropped when the slot is busy,
   * and every prompt times out — nothing can hog the screen. */
  private showPrompt(key: string, text: string, done: () => boolean): void {
    if (this.shownPrompts.has(key)) return
    this.shownPrompts.add(key)
    if (this.prompt) {
      if (this.promptQueue.length < 4) this.promptQueue.push({ key, text, done })
      return
    }
    this.beginPrompt({ key, text, done })
  }

  private beginPrompt(p: { key: string; text: string; done: () => boolean }): void {
    this.prompt = { key: p.key, done: p.done, fading: false }
    this.promptAge = 0
    this.promptText.setText(p.text).setAlpha(0)
    this.tweens.add({ targets: this.promptText, alpha: 0.9, duration: 600 })
  }

  private updatePrompt(dt: number): void {
    if (!this.prompt) {
      const next = this.promptQueue.shift()
      if (next) this.beginPrompt(next)
      return
    }
    this.promptAge += dt
    const sx = Phaser.Math.Clamp(this.flock.centerX - this.scrollX, 200, VIEW_W - 220)
    const sy = Phaser.Math.Clamp(this.flock.centerY - 150, 70, VIEW_H - 60)
    this.promptText.setPosition(sx, sy)
    if (!this.prompt.fading && (this.prompt.done() || this.promptAge > 7)) {
      this.prompt.fading = true
      this.tweens.add({
        targets: this.promptText,
        alpha: 0,
        duration: 900,
        onComplete: () => {
          this.prompt = null
        },
      })
    }
  }

  // ------------------------------------------------------------------- update

  private simClock = 0

  update(timeMs: number, deltaMs: number): void {
    let dt = Math.min(deltaMs / 1000, 1 / 20)
    // hit-stop: a 40-80ms time-dip that gives the big three impacts a punch
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt)
      dt *= 0.12
    }
    // logic clock = accumulated sim time, so cooldown windows track the sim
    // wherever it runs (real loop, slow machines, headless drivers) rather
    // than the wall clock
    this.simClock += dt
    const time = this.simClock
    const cam = this.cameras.main

    if (!this.finishing && !this.failing) {
      const rel = this.flock.centerX - this.scrollX
      const baseSpeed = this.scrollX >= PRESSURE_START ? PRESSURE_SPEED : SCROLL_SPEED
      // rubber-band mercy: a battered flock that falls behind gets a MOMENT to
      // recover — but mercy decays under sustained neglect, so parking at the
      // screen edge is a death sentence, not a strategy
      if (rel < VIEW_W * 0.3) this.mercyTime += dt
      else this.mercyTime = Math.max(0, this.mercyTime - dt * 2)
      const mercy = rel < VIEW_W * 0.3 && this.mercyTime < 6 ? 0.55 : 1
      this.scrollX += baseSpeed * mercy * dt
    } else if (this.finishing) {
      const targetScroll = ROOST_X - VIEW_W * 0.58
      this.scrollX += (targetScroll - this.scrollX) * Math.min(dt * 1.1, 1)
    }
    // decaying micro-kick on the 3 sanctioned impact events (never sustained)
    this.camKick *= Math.exp(-dt * 13)
    cam.scrollX = this.scrollX + this.camKick * Math.sin(this.simClock * 70)

    // parallax clusters loop across the view at their own depths
    for (const p of this.parallax) {
      const span = p.spacing
      let x = ((p.baseX - this.scrollX * p.factor) % span) + span / 2
      if (x < -400) x += span
      if (x > span) x -= span
      p.img.x = x
    }
    // world speed: the meadow the ruins stand in must move WITH them
    this.fgGround.tilePositionX = this.scrollX
    this.fgBranch.x = -20 - ((this.scrollX * 0.3) % 2200) * 0.12
    this.fgColumn.x = VIEW_W + 20 + ((this.scrollX * 0.24) % 1800) * 0.1
    this.fogFar.tilePositionX = this.scrollX * 0.22 + time * 5

    // input → flock
    const p = this.input.activePointer
    const untouched = p.x === 0 && p.y === 0
    if (!untouched) {
      this.mouseTravel += Math.hypot(p.x - this.lastPointer.x, p.y - this.lastPointer.y)
      this.lastPointer.x = p.x
      this.lastPointer.y = p.y
    }
    const world = cam.getWorldPoint(untouched ? VIEW_W * 0.45 : p.x, untouched ? VIEW_H * 0.45 : p.y)
    const gather = !this.finishing && this.keySpace.isDown
    const spread = !this.finishing && this.keyShift.isDown
    if (gather) this.gatherHeld += dt
    if (spread) this.spreadHeld += dt

    // formation snap: every press/release is a felt, heard transient —
    // and a short tap is an ABILITY (Surge / Flare)
    if (gather && !this.prevGather) {
      this.spaceDownT = time
      this.audio.formSnap('gather')
      this.formFlourish(true)
    }
    if (!gather && this.prevGather && time - this.spaceDownT < 0.22) this.doSurge()
    if (spread && !this.prevSpread) {
      this.shiftDownT = time
      this.audio.formSnap('spread')
      this.formFlourish(false)
    }
    if (!spread && this.prevSpread && time - this.shiftDownT < 0.22) this.doFlare()
    if (!gather && !spread && (this.prevGather || this.prevSpread)) this.audio.formSnap('release')
    this.prevGather = gather
    this.prevSpread = spread

    // ability envelopes that live outside the flock sim
    this.callTimer = Math.max(0, this.callTimer - dt)
    this.callCooldown = Math.max(0, this.callCooldown - dt)
    this.mobLift = Math.max(0, this.mobLift - dt)

    // progressive difficulty: dusk sharpens the world — sloppy flying costs
    // more per act (Rapid Morph +15%, Gauntlet +30%), on top of the faster
    // scroll and denser terrain
    this.flock.dangerScale = this.scrollX > 20400 ? 1.3 : this.scrollX > 14400 ? 1.15 : 1

    this.flock.update(
      dt,
      {
        intentX: this.finishing
          ? ROOST_X
          : Phaser.Math.Clamp(world.x, this.scrollX + VIEW_W * 0.07, this.scrollX + VIEW_W * 0.82),
        intentY: this.finishing
          ? ROOST_Y
          : this.mobLift > 0
            ? SKY_TOP + 90 // the mob rises around the falcon
            : Phaser.Math.Clamp(world.y, SKY_TOP + 20, SKY_BOTTOM),
        gather,
        spread,
      },
      this.visibleObstacles(),
    )

    this.falcon.update(dt, this.flock, this.scrollX, VIEW_W, this.visibleObstacles())
    if (this.falcon.inWarning && this.falcon.firstEncounter) {
      this.showPrompt('falcon', 'Gather!', () => !this.falcon.inWarning)
      this.falcon.firstEncounter = false
    }
    this.applyWind(dt)

    // soft bounds
    const leftEdge = this.scrollX + 50
    const rightEdge = this.scrollX + VIEW_W * 0.88
    for (const b of this.flock.birds) {
      if (b.x < leftEdge) b.vx += (leftEdge - b.x) * 14 * dt
      if (b.x > rightEdge) b.vx -= (b.x - rightEdge) * 8 * dt
      if (b.y < SKY_TOP) b.vy += (SKY_TOP - b.y) * 10 * dt
      if (b.y > SKY_BOTTOM) b.vy -= (b.y - SKY_BOTTOM) * 10 * dt
    }

    this.processCollisions(time)
    this.processFlung(time)
    this.processGrazes(time)
    this.processBrittle(dt, time)
    this.updateBrittleHints()
    this.updateOpeningZones()
    this.cullStragglers(dt)
    const spreadAmt = Math.max(-this.flock.form, 0)
    // Echo Call: the cry extends recovery reach and stirs distant strays;
    // Spread still closes the deal — call sets up, spread collects
    const callBoost = this.callTimer > 0 ? 0.8 * this.callStrength : 0
    this.scatter.update(dt, time, this.flock, Math.min(1, spreadAmt + callBoost))
    for (const s of this.strays) {
      if (s.group.depleted) continue
      const joined = s.group.update(dt, time, this.flock, 200 + spreadAmt * 220 + callBoost * 340)
      if (joined > 0) this.stats.found += joined
    }

    // drafting streamlines: clean straight flight visibly cuts the air
    if (this.flock.draft > 0.55) {
      this.draftTrailT -= dt
      if (this.draftTrailT <= 0) {
        this.draftTrailT = 0.1
        const b = this.flock.birds[(Math.random() * this.flock.birds.length) | 0]
        if (b) {
          const streak = this.add
            .image(b.x - b.vx * 0.06, b.y - b.vy * 0.06, 'softdot')
            .setTint(0xf5ead8)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.4)
            .setDisplaySize(46, 7)
            .setRotation(Math.atan2(b.vy, b.vx))
            .setDepth(5.5)
          this.tweens.add({ targets: streak, alpha: 0, displayWidth: 90, duration: 380, onComplete: () => streak.destroy() })
        }
      }
    }

    this.updateMovers(time)
    this.updateFlowGates()
    this.updateMotes()
    // environmental progress storytelling: roost clarifies, light warms,
    // distant flocks appear late — never a progress bar
    const prog = Phaser.Math.Clamp(this.flock.centerX / ROOST_X, 0, 1)
    if (prog > 0.42) {
      const t01 = Phaser.Math.Clamp((prog - 0.42) / 0.5, 0, 1)
      // fade the horizon stand-in away as the REAL roost scrolls into view
      const handoff = Phaser.Math.Clamp((ROOST_X - VIEW_W - this.scrollX) / 900, 0, 1)
      this.roostHorizon.setAlpha(Math.min(0.55, t01 * 0.55) * handoff)
      const grow = 90 + t01 * 130
      this.roostHorizon.setDisplaySize(grow, grow * 0.72)
    }
    this.warmth.setAlpha(prog * 0.16)
    this.updateRoostSwirl(dt, time)
    this.updateAmbientFlocks(dt)

    for (const pr of PROMPTS) {
      if (pr.x < 0) continue
      if (this.scrollX > pr.x) {
        if (pr.key === 'gather')
          this.showPrompt('gather', pr.text, () => this.gatherHeld > 0.3 && this.flock.centerX > 1020)
        else if (pr.key === 'spread')
          this.showPrompt('spread', pr.text, () => this.stats.found > 0 || this.spreadHeld > 1.6)
        else if (pr.key === 'surge') this.showPrompt('surge', pr.text, () => this.flock.pulse > 0.3)
        else if (pr.key === 'flare') this.showPrompt('flare', pr.text, () => this.flock.flareAmt > 0.3)
      }
    }
    // teach Neutral once, right after the spread lesson lands
    if (this.shownPrompts.has('spread') && !this.prompt && !this.shownPrompts.has('regroup') && this.scrollX > 1900) {
      this.showPrompt('regroup', 'release — regroup', () => Math.abs(this.flock.form) < 0.15 && this.flock.gatherStrain < 0.1)
    }
    const zoneAhead = this.windZoneAt(this.flock.centerX + 500)
    if (zoneAhead) {
      this.showPrompt('wind', 'wind ahead — Gather cuts through it', () => this.flock.centerX > zoneAhead.x0 + 600)
    }
    this.updatePrompt(dt)

    this.checkCheckpoints()
    this.checkFail()
    this.checkFinish(dt)

    const meanSpeed = Math.hypot(this.flock.meanVX, this.flock.meanVY) / 430
    const journey01 = Phaser.Math.Clamp(this.flock.centerX / ROOST_X, 0, 1)
    // gauntlet intensity drives the low drone; the act index colors the key
    const intensity = this.scrollX > 20400 ? 0.85 : this.scrollX > 14400 ? 0.5 : 0.15
    this.audio.musicTick(dt, Phaser.Math.Clamp(journey01 + this.flowStreak * 0.08, 0, 1), intensity)
    this.journeyTick -= dt
    if (this.journeyTick <= 0) {
      this.journeyTick = 0.5
      const ratio = Phaser.Math.Clamp((this.flock.count + this.scatter.recoverableCount) / START_BIRDS, 0, 1)
      this.audio.setJourney(journey01, ratio, this.scrollX > 20400 ? 2 : this.scrollX > 12000 ? 1 : 0)
    }
    this.audio.setStrain(this.flock.gatherStrain, this.flock.spreadStrain)
    this.audio.setFlockState(this.flock.form, Phaser.Math.Clamp(meanSpeed, 0, 1))
    // first-time strain hints, once each, fading on recovery
    if (this.flock.gatherStrain > 0.55)
      this.showPrompt('strain-g', 'too tight — release to regroup', () => this.flock.gatherStrain < 0.2)
    if (this.flock.spreadStrain > 0.55)
      this.showPrompt('strain-s', 'the flock is losing cohesion', () => this.flock.spreadStrain < 0.2)
    if (this.finishing) this.audio.warmth(Math.min(1, this.finishTimer / 4))

    this.updateHudCount()
    const displayed = this.flock.count + this.scatter.recoverableCount
    if (displayed <= WARN_BIRDS && !this.finishing) {
      this.countText.setColor('#e0a898')
      this.audio.setThin(true)
      this.showPrompt('lowflock', 'the flock is too small to hold together', () => this.flock.count + this.scatter.recoverableCount > WARN_BIRDS + 6)
    } else if (displayed > WARN_BIRDS) {
      this.audio.setThin(false)
      if (this.countText.style.color === '#e0a898') this.countText.setColor('#f2e8f5')
    }
    if (this.debugVisible) {
      this.debugText.setText(
        `fps ${Math.round(this.game.loop.actualFps)}  form ${this.flock.form.toFixed(2)}  x ${Math.round(this.scrollX)}  cp ${this.checkpoint.x}`,
      )
      this.drawColliderOverlay()
    }
    void timeMs
  }

  /** Count ticks with a visible ±N so every change has a readable cause. */
  private updateHudCount(): void {
    // scattered-but-recoverable birds still count — they aren't lost yet
    const n = this.flock.count + this.scatter.recoverableCount
    if (this.scatter.recoverableCount > 0) {
      this.scatteredText.setText(`${this.scatter.recoverableCount} scattered`).setAlpha(0.85).setPosition(16, 74)
    } else {
      this.scatteredText.setAlpha(0)
    }
    // a recoverable bird becomes a real loss only when its window expires
    this.stats.lost += this.scatter.expiredThisFrame
    if (this.scatter.recoveredThisFrame > 0) {
      this.stats.recovered += this.scatter.recoveredThisFrame
      this.tweens.killTweensOf(this.recoveredText)
      this.recoveredText.setText(`Recovered ${this.scatter.recoveredThisFrame}`).setAlpha(1)
      this.tweens.add({ targets: this.recoveredText, alpha: 0, duration: 1400, delay: 500 })
    }
    if (n === this.lastShownCount) return
    const delta = n - this.lastShownCount
    this.lastShownCount = n
    this.countText.setText(String(n))
    this.tweens.killTweensOf(this.deltaText)
    this.deltaText
      .setText(delta > 0 ? `+${delta}` : `${delta}`)
      .setColor(delta > 0 ? '#ffd9a0' : '#e8a090')
      .setAlpha(1)
      .setY(44)
    this.tweens.add({ targets: this.deltaText, alpha: 0, y: delta > 0 ? 30 : 58, duration: 1100, ease: 'Quad.easeOut' })
    if (delta < 0) {
      // muted warm-red pulse + tiny feather scatter at the counter
      this.countText.setColor('#e8a090')
      this.time.delayedCall(420, () => this.countText.setColor('#f2e8f5'))
      const burst = this.add.particles(66, 32, 'leaf', {
        speed: { min: 30, max: 90 },
        angle: { min: 40, max: 140 },
        lifespan: 600,
        quantity: Math.min(6, -delta),
        scale: { start: 0.4, end: 0.1 },
        alpha: { start: 0.8, end: 0 },
        tint: 0x2a2440,
        emitting: false,
      })
      burst.setScrollFactor(0).setDepth(21)
      burst.explode(Math.min(6, -delta), 0, 0)
      this.time.delayedCall(700, () => burst.destroy())
    } else {
      this.countText.setColor('#ffd9a0')
      this.time.delayedCall(420, () => this.countText.setColor('#f2e8f5'))
      this.audio.collectBloom(delta)
    }
  }

  /** Rhythmic obstacle motion: readable, slow, colliders move with the art. */
  /** First two brittle encounters get a floating hint ON the structure —
   * after that the visual language (shimmer, sway, tremble) carries alone. */
  private brittleHints = 0
  private hintedFeatures = new Set<PieceFeature>()
  private updateBrittleHints(): void {
    if (this.brittleHints >= 2) return
    for (const [f, sprite] of this.featureSprites) {
      if (!f.brittle || this.hintedFeatures.has(f)) continue
      const anyIntact = [...this.obstacleFeature.entries()].some(([o, ft]) => ft === f && !o.broken)
      if (!anyIntact) continue
      if (Math.abs(f.x - this.flock.centerX) > 520) continue
      this.hintedFeatures.add(f)
      this.brittleHints++
      const label = this.add
        .text(sprite.x, sprite.y - sprite.displayHeight / 2 - 26, 'loose — tap SPACE', display(15, '#ffe2b8', 2))
        .setOrigin(0.5)
        .setDepth(7)
        .setAlpha(0)
      label.setShadow(0, 1, '#2a2036', 4)
      this.tweens.add({ targets: label, alpha: 0.95, duration: 400, yoyo: true, hold: 2400, onComplete: () => label.destroy() })
    }
  }

  /** Tremble amplitude (0..1) for a brittle feature under charge. */
  private featureTremble(f: PieceFeature): number {
    let best = 0
    for (const [ob, feat] of this.obstacleFeature) {
      if (feat !== f) continue
      best = Math.max(best, Math.min((this.brittleCharge.get(ob) ?? 0) / 8, 1))
    }
    return best
  }

  private updateMovers(time: number): void {
    const moverFeatures = new Set<PieceFeature>()
    for (const m of this.movers) {
      moverFeatures.add(m.f)
      const mo = m.f.motion!
      const t = (time / mo.period) * Math.PI * 2 + m.phase
      // brittle charge shudders the art (composed with the motion, never fighting it)
      const tr = m.f.brittle ? this.featureTremble(m.f) : 0
      const jx = Math.sin(time * 55) * 4 * tr
      const ja = Math.sin(time * 47) * 0.022 * tr
      if (mo.kind === 'bob') {
        const dy = Math.sin(t) * mo.amp
        m.sprite.y = m.baseY + dy
        m.sprite.x = m.f.x + jx
        for (const e of m.obs) e.o.y = e.baseY + dy
      } else {
        // pendulum: sway the sprite and swing colliders along the arc's x
        const a = Math.sin(t) * 0.14
        m.sprite.setRotation(a + ja)
        const dy = Math.abs(Math.sin(t)) * mo.amp * 0.2
        const dx = Math.sin(t) * mo.amp
        m.sprite.x = m.f.x + dx * 0.4 + jx
        for (const e of m.obs) {
          e.o.x = m.f.x + dx * 0.4
          e.o.y = e.baseY + dy
        }
      }
    }
    // static brittle pieces shudder in place under charge
    for (const [f, sprite] of this.featureSprites) {
      if (!f.brittle || moverFeatures.has(f)) continue
      const tr = this.featureTremble(f)
      sprite.x = f.x + (tr > 0 ? Math.sin(time * 55) * 4 * tr : 0)
      sprite.setAngle(tr > 0 ? Math.sin(time * 47) * 1.2 * tr : 0)
    }
  }

  /**
   * Perfect Flow: pass a designated gate in the intended formation, with zero
   * losses across its window and the flock holding together.
   */
  private updateFlowGates(): void {
    const cx = this.flock.centerX
    for (const [f, g] of this.flowGates) {
      const enter = f.x - 260
      const exit = f.x + 260
      if (g.state === 'idle' && cx > enter && cx < f.x) {
        g.state = 'active'
        g.clean = true
        g.entryCount = this.flock.count
      } else if (g.state === 'active') {
        // outcome-based: permanent losses or losing control voids the pass —
        // HOW the player flew it (gather, spread, neutral) is their choice
        if (this.flock.count + this.scatter.recoverableCount < g.entryCount) g.clean = false
        // 0.92 (not 0.85) so ability strain surcharges never void exciting
        // play, and the mob's commanded climb is exempt entirely
        if (Math.max(this.flock.gatherStrain, this.flock.spreadStrain) > 0.92 && this.mobLift <= 0) g.clean = false
        if (cx >= exit) {
          // cohesion: most of the flock made it through together
          let near = 0
          for (const b of this.flock.birds) {
            if (Math.hypot(b.x - this.flock.centerX, b.y - this.flock.centerY) < 420) near++
          }
          const cohesive = near >= this.flock.count * 0.8
          if (g.clean && cohesive) {
            g.state = 'done'
            this.stats.flow++
            this.flowStreak++
            this.perfectFlowFeedback()
          } else {
            this.flowStreak = 0
            g.state = 'failed'
          }
        }
      }
    }
  }

  private perfectFlowFeedback(): void {
    this.audio.chime(523, 0)
    const sx = Phaser.Math.Clamp(this.flock.centerX - this.scrollX, 220, VIEW_W - 220)
    const sy = Phaser.Math.Clamp(this.flock.centerY - 120, 80, VIEW_H - 80)
    const t = this.add
      .text(sx, sy, 'PERFECT FLOW', display(19, '#ffe6bf', 8, 500))
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(21)
    this.tweens.add({ targets: t, alpha: 0.95, y: sy - 26, duration: 700, hold: 900, yoyo: true, onComplete: () => t.destroy() })
    // restrained ripple: a soft expanding glow through the flock
    const ring = this.add
      .image(this.flock.centerX, this.flock.centerY, 'softdot').setTint(0xffd9a0)
      .setDisplaySize(120, 120)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4)
    this.tweens.add({ targets: ring, displayWidth: 560, displayHeight: 560, alpha: 0, duration: 900, onComplete: () => ring.destroy() })
  }

  /** Wide rewards: golden motes; a spread flock sweeps far more of them. */
  private updateMotes(): void {
    const x0 = this.scrollX - 100
    const x1 = this.scrollX + VIEW_W + 100
    for (const m of this.motes) {
      if (!m.img.visible || m.x < x0 || m.x > x1) continue
      for (const b of this.flock.birds) {
        const dx = b.x - m.x
        const dy = b.y - m.y
        if (dx * dx + dy * dy < 42 * 42) {
          m.img.setVisible(false)
          this.audio.collectBloom(1)
          const spark = this.add
            .image(m.x, m.y, 'softdot').setTint(0xffd9a0)
            .setDisplaySize(40, 40)
            .setAlpha(0.9)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(4)
          this.tweens.add({ targets: spark, displayWidth: 110, displayHeight: 110, alpha: 0, duration: 450, onComplete: () => spark.destroy() })
          break
        }
      }
    }
  }

  /** Debug: outline every active collider so art/collision mismatch is visible. */
  private drawColliderOverlay(): void {
    const g = this.colliderGfx
    g.clear()
    g.lineStyle(2, 0xff5577, 0.9)
    for (const o of this.visibleObstacles()) {
      if (o.shape === 'rect') g.strokeRect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2)
      else g.strokeCircle(o.x, o.y, o.r)
    }
  }

  // --------------------------------------------------------------- subsystems

  private visCache: Obstacle[] = []
  private visCacheScroll = -1

  private visibleObstacles(): Obstacle[] {
    if (this.visCacheScroll === this.scrollX) return this.visCache
    this.visCacheScroll = this.scrollX
    this.visCache = this.filterVisible()
    return this.visCache
  }

  private filterVisible(): Obstacle[] {
    const x0 = this.scrollX - 300
    const x1 = this.scrollX + VIEW_W + 600
    return this.obstacles.filter((o) => {
      const half = o.shape === 'circle' ? o.r : o.hw
      return o.x + half > x0 && o.x - half < x1 && !o.broken
    })
  }

  private windZoneAt(x: number): WindZone | null {
    for (const z of WIND_ZONES) if (x >= z.x0 && x <= z.x1) return z
    return null
  }

  private applyWind(dt: number): void {
    const zone = this.windZoneAt(this.flock.centerX)
    if (!zone) return
    const gather = Math.max(this.flock.form, 0)
    const spread = Math.max(-this.flock.form, 0)
    // gathered flocks cut through; spread flocks catch the full push
    const resist = (1 - gather * 0.72) * (1 + spread * 0.6)
    for (const b of this.flock.birds) {
      b.vx += zone.vx * resist * dt
      b.vy += zone.vy * resist * dt
    }
    this.leafEmitter.setParticleSpeed({ min: -60 + zone.vx, max: -25 + zone.vx * 0.6 } as never)
  }

  private processCollisions(time: number): void {
    for (const bird of this.flock.collisions) {
      const last = this.lastHit.get(bird) ?? -10
      if (time - last < 0.5) continue
      this.lastHit.set(bird, time)
      this.lossTimes = this.lossTimes.filter((t) => time - t < 0.7)
      const capped = this.lossTimes.length >= 5
      // Contact is full price everywhere — a neglected flock should die in
      // Act 1-2. Learning players are protected by readable routes and the
      // burst cap, never by a hidden discount.
      if (!capped && Math.random() < 0.22) {
        this.lossTimes.push(time)
        this.stats.collisionEvents++
        this.audio.collisionThump()
        this.featherPuff(bird.x, bird.y, 4, this.flock.meanVX * 0.35, -20)
        if (!this.scatter.spawn(bird.x, bird.y, bird.x - this.flock.centerX, bird.y - this.flock.centerY)) this.stats.lost++
        this.flock.removeBird(bird)
        this.lastHit.delete(bird)
      } else {
        bird.panic = 1
        const dx = this.flock.centerX - bird.x
        const dy = this.flock.centerY - bird.y
        const d = Math.hypot(dx, dy) || 1
        const sp = Math.max(Math.hypot(bird.vx, bird.vy), 200)
        bird.vx = (dx / d) * sp * 0.8
        bird.vy = (dy / d) * sp * 0.8
      }
    }
  }

  /** Feathers: the universal loss language. Small puffs per bird; the
   * failure sequence erupts a full cloud. White art tinted flock-navy. */
  private featherPuff(x: number, y: number, n: number, vx = 0, vy = 0): void {
    const p = this.add
      .particles(x, y, 'feather', {
        speedX: { min: vx - 90, max: vx + 90 },
        speedY: { min: vy - 80, max: vy + 30 },
        lifespan: { min: 900, max: 1800 },
        scale: { min: 0.35, max: 0.72 },
        alpha: { start: 0.95, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 26,
        tint: [0x2a2440, 0x453a5e, 0x6b5f85],
        emitting: false,
      })
      .setDepth(6.5)
    p.explode(n)
    this.time.delayedCall(1900, () => p.destroy())
  }

  /** Near-miss: several birds skim stone at once → air-rush + stone dust. */
  private processGrazes(time: number): void {
    if (this.flock.grazes.length < 3 || time - this.lastGrazeTime < 0.8) return
    this.lastGrazeTime = time
    let mx = 0
    let my = 0
    for (const g of this.flock.grazes) {
      mx += g.bird.x
      my += g.bird.y
    }
    mx /= this.flock.grazes.length
    my /= this.flock.grazes.length
    this.audio.nearMissWhoosh()
    const puff = this.add
      .particles(mx, my, 'softdot', {
        speedX: { min: this.flock.meanVX * 0.3 - 30, max: this.flock.meanVX * 0.3 + 50 },
        speedY: { min: -40, max: 40 },
        lifespan: { min: 380, max: 720 },
        scale: { start: 0.5, end: 0.05 },
        alpha: { start: 0.45, end: 0 },
        tint: [0x8d8298, 0xb9a8c0],
        emitting: false,
      })
      .setDepth(6)
    puff.explode(9)
    this.time.delayedCall(820, () => puff.destroy())
  }

  /** Press-edge flourish: a ring that snaps inward (gather) or blooms (spread). */
  private formFlourish(inward: boolean): void {
    const ring = this.add
      .image(this.flock.centerX, this.flock.centerY, 'softdot').setTint(0xffd9a0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(6)
      .setAlpha(0.42)
      .setDisplaySize(inward ? 260 : 90, inward ? 260 : 90)
    this.tweens.add({
      targets: ring,
      displayWidth: inward ? 70 : 300,
      displayHeight: inward ? 70 : 300,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  /** Clean pass: enough birds thread a real opening with zero losses. */
  private updateOpeningZones(): void {
    const cx = this.flock.centerX
    for (const z of this.openingZones) {
      if (z.state === 'done') continue
      if (z.state === 'idle') {
        if (cx > z.x - 700 && cx < z.x) {
          z.state = 'active'
          z.entryLost = this.stats.lost
          z.seen.clear()
        }
        continue
      }
      for (const b of this.flock.birds) {
        if (Math.abs(b.x - z.x) < z.hw && Math.abs(b.y - z.y) < z.hh) z.seen.add(b)
      }
      if (cx > z.x + 90) {
        z.state = 'done'
        if (z.seen.size >= 10 && this.stats.lost === z.entryLost) {
          this.audio.cleanPassBloom()
          const bloom = this.add
            .image(z.x, z.y, 'softdot').setTint(0xffd9a0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(6)
            .setAlpha(0.75)
            .setDisplaySize(z.hw * 1.4, z.hh * 1.4)
            .setTint(0xffd9a0)
          this.tweens.add({
            targets: bloom,
            displayWidth: z.hw * 3.4,
            displayHeight: z.hh * 3.4,
            alpha: 0,
            duration: 700,
            ease: 'Cubic.easeOut',
            onComplete: () => bloom.destroy(),
          })
        }
      }
    }
  }

  /** Blown-wide birds tumble into the scatter pool — recoverable if the
   * player reacts (spread / echo call), gone if ignored. The steady cost of
   * unmanaged flying through dense terrain. */
  private flingTimes: number[] = []
  private processFlung(time: number): void {
    for (const bird of this.flock.flungBirds) {
      this.flingTimes = this.flingTimes.filter((t) => time - t < 0.7)
      if (this.flingTimes.length >= 3) break
      this.flingTimes.push(time)
      const dx = bird.x - this.flock.centerX
      const dy = bird.y - this.flock.centerY
      this.featherPuff(bird.x, bird.y, 3, dx * 0.6, -30)
      if (!this.scatter.spawn(bird.x, bird.y, dx || 1, dy - 0.4)) this.stats.lost++
      this.flock.removeBird(bird)
      this.lastHit.delete(bird)
    }
  }

  private processBrittle(dt: number, time: number): void {
    for (const [o, c] of this.brittleCharge) {
      const next = c * Math.exp(-2.2 * dt)
      if (next < 0.05) this.brittleCharge.delete(o)
      else this.brittleCharge.set(o, next)
    }
    if (this.flock.breakthroughHits.length === 0) return
    const meanSpeed = Math.hypot(this.flock.meanVX, this.flock.meanVY)
    for (const { bird, obstacle } of this.flock.breakthroughHits) {
      if (obstacle.broken) continue
      const charge = (this.brittleCharge.get(obstacle) ?? 0) + 1
      this.brittleCharge.set(obstacle, charge)
      // audible/visible charge: creak + falling dust every 2 charge steps
      const lastTick = this.lastCreak.get(obstacle) ?? 0
      if (Math.floor(charge / 2) > Math.floor(lastTick / 2)) {
        this.audio.brittleCreak(Math.min(charge / 8, 1))
        const f = this.obstacleFeature.get(obstacle)
        const sprite = f ? this.featureSprites.get(f) : undefined
        if (sprite) {
          const dust = this.add
            .particles(sprite.x + (Math.random() - 0.5) * sprite.displayWidth * 0.5, sprite.y - sprite.displayHeight * 0.3, 'leaf', {
              speedY: { min: 40, max: 120 },
              speedX: { min: -30, max: 30 },
              lifespan: { min: 500, max: 900 },
              scale: { start: 0.5, end: 0.1 },
              alpha: { start: 0.7, end: 0 },
              tint: [0x453a5e, 0x2a2440],
              emitting: false,
            })
            .setDepth(6)
          dust.explode(5)
          this.time.delayedCall(950, () => dust.destroy())
        }
      }
      this.lastCreak.set(obstacle, charge)
      if (charge >= 8 && (this.flock.form > 0.35 || this.flock.pulse > 0.2) && meanSpeed > 230) {
        // a held Gather OR a well-timed Surge carries the breaking commitment
        this.breakFeature(obstacle)
        continue
      }
      // a curtain that doesn't break REPELS: same loss discipline as solid
      // collisions (per-bird cooldown + global cap + feedback), never a shred
      const last = this.lastHit.get(bird) ?? -10
      if (time - last < 0.5) continue
      this.lastHit.set(bird, time)
      this.lossTimes = this.lossTimes.filter((t) => time - t < 0.7)
      const capped = this.lossTimes.length >= 5
      if (this.flock.form < -0.3) {
        // third technique: a SPREAD flock slips THROUGH the curtain — a
        // shortcut paid in blown-wide edges instead of a bounce
        this.flingTimes = this.flingTimes.filter((t) => time - t < 0.7)
        if (this.flingTimes.length < 3 && Math.random() < 0.4) {
          this.flingTimes.push(time)
          this.featherPuff(bird.x, bird.y, 2, 60, -20)
          if (!this.scatter.spawn(bird.x, bird.y, 1, -0.4)) this.stats.lost++
          this.flock.removeBird(bird)
          this.lastHit.delete(bird)
        }
      } else if (!capped && this.flock.form <= 0.1 && Math.random() < 0.12) {
        this.lossTimes.push(time)
        this.stats.collisionEvents++
        this.audio.collisionThump()
        this.featherPuff(bird.x, bird.y, 4, -50, -20)
        if (!this.scatter.spawn(bird.x, bird.y, -1, -0.3)) this.stats.lost++
        this.flock.removeBird(bird)
        this.lastHit.delete(bird)
      } else {
        bird.panic = 1
        bird.vx = -Math.abs(bird.vx) * 0.7 - 60
        bird.vy += (bird.y > this.flock.centerY ? 1 : -1) * 40
      }
    }
  }

  /** Breaking one brittle collider clears the whole curtain it belongs to. */
  private breakFeature(o: Obstacle): void {
    const feature = this.obstacleFeature.get(o)
    if (feature) {
      for (const [ob, f] of this.obstacleFeature) if (f === feature) ob.broken = true
      const sprite = this.featureSprites.get(feature)
      if (sprite) this.tweens.add({ targets: sprite, alpha: 0, duration: 450 })
    } else {
      o.broken = true
    }
    const mvx = this.flock.meanVX
    const mvy = this.flock.meanVY
    const emitter = this.add.particles(o.x, o.y, 'leaf', {
      speedX: { min: mvx * 0.5 - 90, max: mvx * 0.9 + 90 },
      speedY: { min: mvy * 0.6 - 110, max: mvy * 0.6 + 110 },
      lifespan: { min: 500, max: 1400 },
      quantity: 44,
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 0.9, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0x2a2440, 0x3a2f55],
      emitting: false,
    })
    emitter.setDepth(3)
    emitter.explode(46, 0, 0)
    this.time.delayedCall(1600, () => emitter.destroy())
    this.hitStop = 0.07
    this.camKick = 3
    this.cameras.main.zoomTo(1.02, 100, 'Sine.easeOut', true)
    this.time.delayedCall(200, () => this.cameras.main.zoomTo(1, 280, 'Sine.easeInOut', true))
    this.audio.collisionThump()
  }

  private updateRoostSwirl(dt: number, time: number): void {
    if (ROOST_X - this.scrollX > VIEW_W + 500) return
    for (const b of this.roostSwirl) {
      b.a += b.s * dt
      const px = ROOST_X + Math.cos(b.a) * b.r
      const py = ROOST_Y + Math.sin(b.a * 0.85 + b.ph) * b.r * 0.5 - 40
      b.sprite.rotation = Math.atan2(py - b.sprite.y, px - b.sprite.x)
      b.sprite.x = px
      b.sprite.y = py
      void time
    }
  }

  /** Small distant flocks that appear once the roost is close and drift toward it. */
  private updateAmbientFlocks(dt: number): void {
    if (ROOST_X - this.scrollX > VIEW_W * 1.4 || ROOST_X - this.scrollX < -400) return
    if (this.ambientFlocks.length < 3 && Math.random() < dt * 0.4) {
      const birds: Phaser.GameObjects.Image[] = []
      const n = 6 + Math.floor(Math.random() * 6)
      const sx = this.scrollX + VIEW_W * (0.7 + Math.random() * 0.3)
      const sy = SKY_TOP + Math.random() * 260
      for (let i = 0; i < n; i++) {
        const s = this.add.image(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 40, 'bird-mid')
        s.setScale(0.18).setAlpha(0.65).setDepth(1)
        birds.push(s)
      }
      this.ambientFlocks.push({ birds, x: sx, y: sy, vx: 60, vy: 0 })
    }
    for (const af of this.ambientFlocks) {
      const dx = ROOST_X - af.x
      const dy = ROOST_Y - 60 - af.y
      const d = Math.hypot(dx, dy) || 1
      af.vx += (dx / d) * 40 * dt
      af.vy += (dy / d) * 40 * dt
      const sp = Math.hypot(af.vx, af.vy) || 1
      af.vx = (af.vx / sp) * 90
      af.vy = (af.vy / sp) * 90
      af.x += af.vx * dt
      af.y += af.vy * dt
      for (const s of af.birds) {
        s.x += af.vx * dt + (Math.random() - 0.5) * 2
        s.y += af.vy * dt + (Math.random() - 0.5) * 2
        s.rotation = Math.atan2(af.vy, af.vx)
      }
    }
  }

  /** Birds hopelessly left behind peel away visibly rather than grinding on walls. */
  private cullStragglers(dt: number): void {
    for (const b of this.flock.birds) {
      if (this.flock.centerX - b.x > 760) {
        const t = (this.stuckTime.get(b) ?? 0) + dt
        if (t > 3) {
          this.stuckTime.delete(b)
          if (!this.scatter.spawn(b.x, b.y, -0.6, -1)) this.stats.lost++
          this.flock.removeBird(b)
          continue
        }
        this.stuckTime.set(b, t)
      } else if (this.stuckTime.has(b)) {
        this.stuckTime.delete(b)
      }
    }
  }

  private checkCheckpoints(): void {
    for (const lm of LANDMARKS) {
      if (lm.x > this.checkpoint.x && this.flock.centerX >= lm.x) {
        this.checkpoint = { x: lm.x, name: lm.name, count: this.flock.count, found: this.stats.found, flow: this.stats.flow }
        if (lm.name) {
          this.showLandmark(`${lm.name} reached`)
          this.audio.landmarkTone(lm.name)
          this.audio.celebrationSwell(0.55)
        }
      }
    }
  }

  /** Landmark banner: separate slot from tutorial prompts, never collides. */
  private showLandmark(text: string): void {
    this.landmarkText.setText(text).setAlpha(0)
    this.tweens.add({ targets: this.landmarkText, alpha: 0.85, duration: 500, hold: 1300, yoyo: true })
  }

  private checkFail(): void {
    if (this.failing || this.finishing) return
    if (this.flock.count >= FAIL_BIRDS) return
    this.failing = true
    this.stats.resets++
    this.audio.failureFade()

    // 1) the remaining flock erupts into a cloud of feathers rolling across
    //    the darkening sky — the dramatic image of the day ending badly
    const survivors = [...this.flock.birds]
    const cloud = this.add
      .particles(0, 0, 'feather', {
        speedX: { min: -110, max: 150 },
        speedY: { min: -170, max: 40 },
        lifespan: { min: 1600, max: 3400 },
        scale: { min: 0.35, max: 0.8 },
        alpha: { start: 0.95, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 22,
        tint: [0x2a2440, 0x453a5e, 0x6b5f85],
        emitting: false,
      })
      .setDepth(8)
    for (const b of survivors) {
      cloud.emitParticleAt(b.x, b.y, 4)
      this.scatter.spawn(b.x, b.y, b.x - this.flock.centerX, b.y - this.flock.centerY - 40)
      this.flock.removeBird(b)
    }
    this.time.delayedCall(3600, () => cloud.destroy())
    // 2) colour drains toward dusk, then the message
    this.promptText.setAlpha(0)
    this.landmarkText.setAlpha(0)
    this.prompt = null
    this.tweens.add({ targets: this.duskOverlay, alpha: 0.55, duration: 1400 })
    this.tweens.add({ targets: this.fadeRect, alpha: 0.85, duration: 1700, delay: 500 })
    this.time.delayedCall(1500, () => {
      const cx = VIEW_W / 2
      const name = this.checkpoint.name || 'the morning sky'
      const mk = (y: number, txt: string, size: number, color: string, ls = 0) =>
        this.add
          .text(cx, y, txt, ls >= 3 ? display(size, color, ls, 300) : voice(size, color))
          .setOrigin(0.5)
          .setAlpha(0)
          .setScrollFactor(0)
          .setDepth(52)
      this.failTexts = [
        mk(360, 'THE FLOCK SCATTERED', 34, '#f2e4d5', 8),
        mk(414, 'Too few birds remained together.', 17, '#b9a8be'),
        mk(478, `Returning to ${name}`, 20, '#dccce0', 2),
        mk(522, `${this.checkpoint.count} BIRDS`, 24, '#f2e8f5', 3),
      ]
      this.tweens.add({ targets: this.failTexts, alpha: 0.95, duration: 700 })
    })
    // 3) restart from the landmark
    this.time.delayedCall(4300, () => {
      this.respawnAtCheckpoint()
      if (this.checkpoint.name) this.audio.landmarkTone(this.checkpoint.name)
      for (const t of this.failTexts) t.destroy()
      this.failTexts = []
      this.tweens.add({ targets: [this.fadeRect, this.duskOverlay], alpha: 0, duration: 1100, delay: 150 })
      this.audio.failureRecover()
      this.failing = false
    })
  }

  private respawnAtCheckpoint(): void {
    const cp = this.checkpoint
    this.scrollX = Math.max(cp.x - VIEW_W * 0.35, 0)
    this.cameras.main.scrollX = this.scrollX
    this.scatter.clear()
    this.lastHit.clear()
    this.brittleCharge.clear()
    this.stuckTime.clear()
    const targetCount = Math.max(cp.count, 60)
    while (this.flock.count > targetCount) this.flock.removeBird(this.flock.birds[this.flock.birds.length - 1])
    while (this.flock.count < targetCount) this.flock.spawnBird(cp.x + rand(-120, 120), 430 + rand(-80, 80))
    for (const b of this.flock.birds) {
      b.x = cp.x + rand(-140, 140)
      b.y = 430 + rand(-90, 90)
      b.vx = rand(180, 240)
      b.vy = rand(-30, 30)
    }
    this.flock.intentX = cp.x + 200
    this.flock.intentY = 430
    this.stats.found = cp.found
    this.stats.flow = cp.flow
    for (const z of this.openingZones) if (z.x > cp.x) z.state = 'idle'
    // reset flow gates and motes ahead of the checkpoint
    for (const [f, g] of this.flowGates) if (f.x > cp.x) { g.state = 'idle'; g.clean = true }
    for (const m of this.motes) if (m.x > cp.x && !m.img.visible) m.img.setVisible(true)
    for (const s of this.strays) {
      if (s.def.x > cp.x) s.group.reset(s.def.count)
    }
    this.falcon.reset(cp.x)
    // un-break brittle features ahead of the checkpoint and restore their art
    for (const [f, sprite] of this.featureSprites) {
      if (f.x <= cp.x) continue
      let restored = false
      for (const [ob, feat] of this.obstacleFeature) {
        if (feat === f && ob.broken) {
          ob.broken = false
          restored = true
        }
      }
      if (restored) sprite.setAlpha(f.alpha ?? 1)
    }
  }

  private checkFinish(dt: number): void {
    // FINAL MURMURATION: distant flocks converge and JOIN the player's flock
    const cx = this.flock.centerX
    if (!this.finishing && cx > ROOST_X - 1500 && cx < ROOST_X - 200) {
      this.joinTimer -= dt
      if (this.joinTimer <= 0) {
        this.joinTimer = 0.35
        // real sim birds up to a perf-safe cap...
        if (this.flock.count < 220) {
          for (let i = 0; i < 5; i++) {
            const side = Math.random() < 0.5 ? -1 : 1
            this.flock.spawnBird(
              cx + rand(300, 700) * side * 0.6 + 200,
              this.flock.centerY + rand(-320, 320),
              180,
              rand(-40, 40),
            )
          }
        }
        // ...plus echo birds for visual mass into the hundreds
        if (this.echoes.length < 120 && this.flock.birds.length > 0) {
          for (let i = 0; i < 9; i++) {
            const leader = this.flock.birds[(Math.random() * this.flock.birds.length) | 0]
            const img = this.add
              .image(leader.x + rand(-60, 60), leader.y + rand(-50, 50), 'bird-mid')
              .setScale(rand(0.13, 0.2))
              .setAlpha(rand(0.5, 0.8))
              .setDepth(3.5)
            this.echoes.push({ img, leader, dx: rand(-70, 70), dy: rand(-56, 56), ph: rand(0, 6) })
          }
        }
        if (this.echoes.length === 9) {
          this.audio.homeSwell()
          this.audio.celebrationSwell(1)
        }
      }
    }
    // echoes trail their leaders — hundreds of birds for the cost of a lerp
    const t = this.game.loop.time / 1000
    for (const e of this.echoes) {
      if (!e.leader.alive) {
        if (this.flock.birds.length === 0) continue
        e.leader = this.flock.birds[(Math.random() * this.flock.birds.length) | 0]
      }
      const wob = Math.sin(t * 2.2 + e.ph) * 7
      e.img.x += (e.leader.x + e.dx + wob - e.img.x) * 0.12
      e.img.y += (e.leader.y + e.dy + wob * 0.6 - e.img.y) * 0.12
      e.img.rotation = e.leader.sprite.rotation
      e.img.setTexture(birdFrameKey(t, e.ph, 9))
    }

    if (this.finishing) {
      this.finishTimer += dt
      if (this.finishTimer > 7.5) {
        this.stats.returned = this.flock.count
        const result = scoreFeathers({
          flightId: 'ancient-ruins',
          startingBirds: this.stats.startCount,
          strayBirdsFound: this.stats.found,
          scatteredBirdsRecovered: this.stats.recovered,
          birdsPermanentlyLost: this.stats.lost,
          birdsArrived: this.flock.count,
          perfectFlows: this.stats.flow,
          totalFlowOpportunities: this.stats.flowTotal,
          collisionEvents: this.stats.collisionEvents,
          checkpointsUsed: this.stats.resets,
        })
        this.scene.start('Results', result)
      }
      return
    }
    if (cx >= ROOST_X - 240) {
      this.finishing = true
      this.promptText.setAlpha(0)
      this.prompt = null
      this.showPrompt('home', 'home', () => this.finishTimer > 3)
      this.audio.chime(392, 0.3)
      this.audio.warmth(1)
    }
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
