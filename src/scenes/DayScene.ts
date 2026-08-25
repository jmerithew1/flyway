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
      // key, factor, spacing, y, alpha
      ['panorama_1', 0.08, 2600, 742, 0.5],
      ['panorama_3', 0.12, 3400, 726, 0.55],
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
    this.placeWindFx()
    this.drawRoost()
    this.flowGates.clear()
    for (const f of FEATURES) if (f.flow) this.flowGates.set(f, { state: 'idle', clean: true, entryCount: 0 })
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
        const t = i / (arc.count - 1)
        const mx = arc.x - arc.spanX / 2 + arc.spanX * t
        const my = arc.y + Math.sin(t * Math.PI) * -arc.spanY * 0.5 + arc.spanY * 0.18
        const img = this.add
          .image(mx, my, 'glow_warm')
          .setDisplaySize(34, 34)
          .setAlpha(0.75)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(2.5)
        this.tweens.add({ targets: img, alpha: 0.45, duration: 900 + i * 90, yoyo: true, repeat: -1 })
        this.motes.push({ x: mx, y: my, img })
      }
    }

    this.colliderGfx = this.add.graphics().setDepth(19).setVisible(false)

    // authored predator zones: one mid-day, one in the final run
    this.falcon = new FalconSystem(this, this.audio, [8150, 22300])
    this.falcon.onStrikeResolved = (taken, gathered) => {
      if (taken > 0) {
        // feather burst where the talons crossed the flock
        const burst = this.add.particles(this.flock.centerX, this.flock.centerY - 60, 'leaf', {
          speed: { min: 120, max: 380 },
          angle: { min: -160, max: -20 },
          lifespan: { min: 500, max: 1200 },
          quantity: 26,
          scale: { start: 0.55, end: 0.1 },
          alpha: { start: 0.95, end: 0 },
          rotate: { min: 0, max: 360 },
          tint: [0x222638, 0x3a3355],
          emitting: false,
        })
        burst.setDepth(9)
        burst.explode(26, 0, 0)
        this.time.delayedCall(1400, () => burst.destroy())
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
      .text(52, 18, '120', { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#f2e8f5' })
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(20)
    this.debugText = this.add
      .text(14, 60, '', { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffffff' })
      .setAlpha(0.7)
      .setScrollFactor(0)
      .setDepth(20)
      .setVisible(false)
    this.promptText = this.add
      .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '21px', color: '#f7ecdf' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.landmarkText = this.add
      .text(VIEW_W / 2, 150, '', { fontFamily: 'Georgia, serif', fontSize: '24px', color: '#f2e4d5', letterSpacing: 3 } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.deltaText = this.add
      .text(96, 44, '', { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f2e8f5' })
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.scatteredText = this.add
      .text(52, 46, '', { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#d8c0a8' })
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.recoveredText = this.add
      .text(52, 68, '', { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#ffd9a0' })
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
      this.add.text(VIEW_W / 2, 330, DAY_NAME, { fontFamily: 'Georgia, serif', fontSize: '44px', color: '#f7f0ea', letterSpacing: 10 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5).setScrollFactor(0).setDepth(30),
      this.add.text(VIEW_W / 2, 386, DAY_SUBTITLE, { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#dccce0', letterSpacing: 6 } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5).setScrollFactor(0).setDepth(30),
      this.add.text(VIEW_W / 2, 442, `${START_BIRDS} birds`, { fontFamily: 'Georgia, serif', fontSize: '19px', color: '#f2e8f5' }).setOrigin(0.5).setScrollFactor(0).setDepth(30),
      this.add.text(VIEW_W / 2, 472, 'Reach the roost.', { fontFamily: 'Georgia, serif', fontSize: '17px', color: '#cdbdd4' }).setOrigin(0.5).setScrollFactor(0).setDepth(30),
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
    this.add.image(ROOST_X, 892, 'roost_tree').setOrigin(0.5, 1).setDisplaySize(860, 600).setDepth(2)
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

  private showPrompt(key: string, text: string, done: () => boolean): void {
    if (this.shownPrompts.has(key) || this.prompt) return
    this.shownPrompts.add(key)
    this.prompt = { key, done, fading: false }
    this.promptText.setText(text).setAlpha(0)
    this.tweens.add({ targets: this.promptText, alpha: 0.9, duration: 600 })
  }

  private updatePrompt(): void {
    if (!this.prompt) return
    const sx = Phaser.Math.Clamp(this.flock.centerX - this.scrollX, 200, VIEW_W - 220)
    const sy = Phaser.Math.Clamp(this.flock.centerY - 150, 70, VIEW_H - 60)
    this.promptText.setPosition(sx, sy)
    if (!this.prompt.fading && this.prompt.done()) {
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

  update(timeMs: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 20)
    const time = this.game.loop.time / 1000
    const cam = this.cameras.main

    if (!this.finishing && !this.failing) {
      const rel = this.flock.centerX - this.scrollX
      const baseSpeed = this.scrollX >= PRESSURE_START ? PRESSURE_SPEED : SCROLL_SPEED
      // rubber-band mercy: a battered flock that falls behind gets a moment to
      // recover instead of being ground through obstacles by the screen edge
      const speed = rel < VIEW_W * 0.3 ? baseSpeed * 0.55 : baseSpeed
      this.scrollX += speed * dt
    } else if (this.finishing) {
      const targetScroll = ROOST_X - VIEW_W * 0.58
      this.scrollX += (targetScroll - this.scrollX) * Math.min(dt * 1.1, 1)
    }
    cam.scrollX = this.scrollX

    // parallax clusters loop across the view at their own depths
    for (const p of this.parallax) {
      const span = p.spacing
      let x = ((p.baseX - this.scrollX * p.factor) % span) + span / 2
      if (x < -400) x += span
      if (x > span) x -= span
      p.img.x = x
    }
    this.fgGround.tilePositionX = this.scrollX * 0.62
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

    this.flock.update(
      dt,
      {
        intentX: this.finishing
          ? ROOST_X
          : Phaser.Math.Clamp(world.x, this.scrollX + VIEW_W * 0.07, this.scrollX + VIEW_W * 0.82),
        intentY: this.finishing ? ROOST_Y : Phaser.Math.Clamp(world.y, SKY_TOP + 20, SKY_BOTTOM),
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
    this.processBrittle(dt)
    this.cullStragglers(dt)
    const spreadAmt = Math.max(-this.flock.form, 0)
    this.scatter.update(dt, time, this.flock, spreadAmt)
    for (const s of this.strays) {
      if (s.group.depleted) continue
      const joined = s.group.update(dt, time, this.flock, 200 + spreadAmt * 220)
      if (joined > 0) this.stats.found += joined
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
    this.updatePrompt()

    this.checkCheckpoints()
    this.checkFail()
    this.checkFinish(dt)

    const meanSpeed = Math.hypot(this.flock.meanVX, this.flock.meanVY) / 430
    this.audio.musicTick(dt, Phaser.Math.Clamp(this.flock.centerX / ROOST_X + this.flowStreak * 0.08, 0, 1))
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
      this.showPrompt('lowflock', 'the flock is too small to hold together', () => displayed > WARN_BIRDS + 6)
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
      this.scatteredText.setText(`${this.scatter.recoverableCount} scattered`).setAlpha(0.85)
    } else {
      this.scatteredText.setAlpha(0)
    }
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
  private updateMovers(time: number): void {
    for (const m of this.movers) {
      const mo = m.f.motion!
      const t = (time / mo.period) * Math.PI * 2 + m.phase
      if (mo.kind === 'bob') {
        const dy = Math.sin(t) * mo.amp
        m.sprite.y = m.baseY + dy
        for (const e of m.obs) e.o.y = e.baseY + dy
      } else {
        // pendulum: sway the sprite and swing colliders along the arc's x
        const a = Math.sin(t) * 0.14
        m.sprite.setRotation(a)
        const dy = Math.abs(Math.sin(t)) * mo.amp * 0.2
        const dx = Math.sin(t) * mo.amp
        m.sprite.x = m.f.x + dx * 0.4
        for (const e of m.obs) {
          e.o.x = m.f.x + dx * 0.4
          e.o.y = e.baseY + dy
        }
      }
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
        if (Math.max(this.flock.gatherStrain, this.flock.spreadStrain) > 0.85) g.clean = false
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
      .text(sx, sy, 'PERFECT FLOW', {
        fontFamily: 'Georgia, serif',
        fontSize: '21px',
        color: '#ffe6bf',
        letterSpacing: 4,
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(21)
    this.tweens.add({ targets: t, alpha: 0.95, y: sy - 26, duration: 700, hold: 900, yoyo: true, onComplete: () => t.destroy() })
    // restrained ripple: a soft expanding glow through the flock
    const ring = this.add
      .image(this.flock.centerX, this.flock.centerY, 'glow_warm')
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
            .image(m.x, m.y, 'glow_warm')
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

  private visibleObstacles(): Obstacle[] {
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
      const capped = this.lossTimes.length >= 4
      if (!capped && Math.random() < 0.22) {
        this.lossTimes.push(time)
        this.stats.collisionEvents++
        this.stats.lost++
        this.audio.collisionThump()
        this.scatter.spawn(bird.x, bird.y, bird.x - this.flock.centerX, bird.y - this.flock.centerY)
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

  private processBrittle(dt: number): void {
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
      if (charge >= 8 && this.flock.form > 0.35 && meanSpeed > 230) {
        this.breakFeature(obstacle)
      } else if (this.flock.form <= 0.1 && Math.random() < 0.1) {
        this.scatter.spawn(bird.x, bird.y, -1, -0.3)
        this.flock.removeBird(bird)
        this.stats.lost++
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
          this.scatter.spawn(b.x, b.y, -0.6, -1)
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

    // 1) the remaining flock visibly scatters across the sky
    const survivors = [...this.flock.birds]
    for (const b of survivors) {
      this.scatter.spawn(b.x, b.y, b.x - this.flock.centerX, b.y - this.flock.centerY - 40)
      this.flock.removeBird(b)
    }
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
          .text(cx, y, txt, { fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, letterSpacing: ls } as Phaser.Types.GameObjects.Text.TextStyle)
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
        if (this.echoes.length === 9) this.audio.homeSwell()
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
