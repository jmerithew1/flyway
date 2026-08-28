import Phaser from 'phaser'
import { Flock, Bird } from '../flock'
import { Obstacle, AVOID } from '../obstacles'
import { StrayGroup } from '../strays'
import { ScatterSystem } from '../scatter'
import { Nightfall } from '../nightfall'
import { Skyline } from '../skyline'
import { GameAudio } from '../audio'
import { scoreFeathers } from '../result'
import { ScoreBook, MasteryEvent, NIGHTFALL_PAR } from '../score'
import { FalconSystem } from '../falcon'
import { MothSwarm, LightThief, createCreatureTextures } from '../creatures'
import { birdFrameKey } from '../textures'
import { ART } from '../artManifest'
import {
  passableGaps,
  FEATURES,
  STRAYS,
  PROMPTS,
  PROMPT_TEXT,
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
  GROUND,
} from '../level'
import { paintFogTile, W as VIEW_W, H as VIEW_H } from '../backdrop'
import { AbilityBar } from '../hud'
import { VFXDirector } from '../vfx'
import { CameraDirector } from '../camera'
import { TunnelSequence, TUNNELS } from '../tunnel'
import { DAY_NAME, DAY_SUBTITLE, START_BIRDS, FAIL_BIRDS, WARN_BIRDS,
  MOTE_CHAIN_WINDOW,
  MOTE_TIERS,
  CALL_WAVE_SPEED,
  CALL_WAVE_REACH,
  RECKON_REAL_TIME,
} from '../config'
import {
  BRACE_CHORD_DELAY,
  BRACE_COOLDOWN,
  BRACE_EASE,
  BRACE_MAX_TIME,
  BRACE_WORLD_SCALE,
  GESTURE_CENTRE_RATE,
  GESTURE_COOLDOWN,
  GESTURE_MIN_RADIUS,
  GESTURE_UNWIND,
  TAILWIND_ALIGN_MIN,
  TAILWIND_SPREAD_MIN,
} from '../config'
import { display, voice, INK, safeArea } from '../ui'
import { Atmosphere, hazeScenery } from '../atmosphere'
import { TouchControls, decorScale, isTouch } from '../touch'

/** Owner's number for "the flock is in trouble" (POLISH_TRACKER J6 / I5). */
const CRITICAL_BIRDS = 25

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
  lost: number
  collisionEvents: number
  score: ReturnType<ScoreBook['snapshot']>
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
  private roostSwirlOn = true
  private ambientFlocks: AmbientFlock[] = []

  // --- ambient decoration, driven by arithmetic rather than by tween objects.
  // Every one of these sets scales with the LEVEL (a glow per flyable gap, a
  // haze per grounded ruin, motes per gap, ghosts per historic route), which
  // is exactly why they cannot be allowed to each own a repeating tween: the
  // cost grows with the world. Driven from one clock in updateDecor(), where
  // being off screen costs nothing instead of costing a tween update.
  private routeGlows: { img: Phaser.GameObjects.Image; amp: number; per: number; ph: number }[] = []
  private routeDrift: {
    img: Phaser.GameObjects.Image
    x0: number
    travel: number
    dur: number
    per: number
    ph: number
  }[] = []
  private ghostBirds: { img: Phaser.GameObjects.Image; peak: number; per: number; delay: number }[] = []
  /** Decoration that never animates but still gets a transform every frame. */
  private decorStatic: { img: Phaser.GameObjects.Image; pad: number }[] = []
  private audio = new GameAudio()
  /**
   * A hold override for automated probes. `tools/pilot.py` drove the two hold
   * verbs by assigning to `touch.gather` / `touch.spread`, which are GETTERS
   * with no setter — so the writes did nothing and the flock never formed up.
   * Both halves of the difficulty contract were therefore being proven by a
   * pilot that could not gather, which is to say they were not being proven at
   * all. A plain field cannot fail the same way.
   */
  readonly debugHold = { gather: false, spread: false }
  private promptPlate!: Phaser.GameObjects.Graphics
  private falcon!: FalconSystem
  private moths!: MothSwarm
  private thief!: LightThief

  private keySpace!: Phaser.Input.Keyboard.Key
  private keyShift!: Phaser.Input.Keyboard.Key
  private touch!: TouchControls
  private keyDive!: Phaser.Input.Keyboard.Key
  private prevDive = false
  private gestureCx = 0
  private gestureCy = 0
  private gestureAngle = 0
  private gestureWound = 0
  private gestureArmed = false
  private gestureCool = 0
  private braceOn = false
  private braceAmt = 0
  private braceHeld = 0
  private braceCool = 0
  private braceConsumed = false
  private windBankZone: WindZone | null = null
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

  // ---- the designed HUD (POLISH_TRACKER J1/J2/J5/J6) -----------------------
  /** every engraved line in the HUD: the flock dial, the ribbon, the ticks */
  private hudGfx!: Phaser.GameObjects.Graphics
  private hudGlyph!: Phaser.GameObjects.Image
  private hudFlockLabel!: Phaser.GameObjects.Text
  /** the flock's own position riding the journey ribbon */
  private hudMarker!: Phaser.GameObjects.Image
  /** the roost at the far end, warming as it nears (K1b-6, in miniature) */
  private hudRoostBead!: Phaser.GameObjects.Image
  private hudDayPct!: Phaser.GameObjects.Text
  /** bloom at the head of the daylight meter */
  private hudDayBead!: Phaser.GameObjects.Image
  private hudDayLabel!: Phaser.GameObjects.Text
  private hudPlaceLabel!: Phaser.GameObjects.Text
  /** the coral halo that carries the critical-flock read (J6) */
  private hudAlertBead!: Phaser.GameObjects.Image
  private hudDeltaX = 0
  private hudDeltaY = 0
  /** short ±N colour flash on the count, owned by drawHud so nothing fights */
  private hudFlash = ''
  private hudFlashUntil = 0
  private hudDial = { x: 0, y: 0, r: 0 }
  private hudRibbon = { x: 0, y: 0, w: 0 }
  /** eased readouts: the arc and the meters never snap, they settle */
  private hudArcShown = 1
  private hudDayShown = 1
  private hudProgShown = 0
  private hudUrgency = 0
  private duskOverlay!: Phaser.GameObjects.Rectangle
  /** the advancing dark, and the daylight that holds it off */
  /** camera bloom: strength rides the daylight so the dark glows hardest */
  private bloom!: Phaser.FX.Bloom
  private skyline!: Skyline
  private night!: Nightfall
  /** global dusk driven by the daylight level - the darker the world,
   * the more the motes blaze, so light is most visible when most needed */
  private nightVeil!: Phaser.GameObjects.Rectangle
  private failTexts: Phaser.GameObjects.Text[] = []
  private lastShownCount = START_BIRDS
  private prompt: ActivePrompt | null = null
  private shownPrompts = new Set<string>()
  private lastHit = new Map<Bird, number>()
  /** live mote chain: length, its remaining window, and the run's best */
  /** Overflow light banked toward a returned bird. */
  private bar!: AbilityBar
  private vfx!: VFXDirector
  private camDir!: CameraDirector
  private tunnel!: TunnelSequence
  private squeezeDrain: (() => void) | null = null
  /** Overflow light banked toward a returned bird. */
  private lightBank = 0
  private moteChain = 0
  private moteChainT = 0
  private moteChainBest = 0
  private lastLightTier = 0
  private tierRing?: Phaser.GameObjects.Image
  private brittleCharge = new Map<Obstacle, number>()
  /** the cold charge running through a breakable piece, and its host */
  private brittleGlows: {
    f: PieceFeature
    sprite: Phaser.GameObjects.Image
    glow: Phaser.GameObjects.Image
    phase: number
  }[] = []
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
  /** `worth` scales how much daylight the mote returns: the ones that cost
   * a detour pay for it. */
  private motes: {
    x: number
    y: number
    img: Phaser.GameObjects.Image
    worth: number
    /** collected by the flock */
    taken: boolean
    /** consumed by the dark instead — light you left behind */
    eaten: boolean
    /** drawn size, so the collect burst can scale from it */
    base: number
  }[] = []
  private chainPlate!: Phaser.GameObjects.Image
  private flowStreak = 0
  private mouseTravel = 0
  private lastPointer = { x: 0, y: 0 }
  private gatherHeld = 0
  private spreadHeld = 0

  private stats: DayStats = { startCount: 120, found: 0, lost: 0, collisionEvents: 0, resets: 0, returned: 0, flow: 0, flowTotal: 0, recovered: 0 }
  private checkpoint: CheckpointState = {
    x: 0,
    name: '',
    count: START_BIRDS,
    found: 0,
    flow: 0,
    lost: 0,
    collisionEvents: 0,
    score: new ScoreBook().snapshot(),
  }
  private mercyTime = 0
  private lastGrazeTime = -10
  private prevGather = false
  private prevSpread = false
  private hitStop = 0
  private camKick = 0
  /** I1 — the sky dims under a committed dive: 0 = clear, 1 = full shadow. */
  private predatorDim = 0
  private predatorDimTarget = 0
  private predatorVeil!: Phaser.GameObjects.Rectangle
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
    this.roostSwirlOn = true
    this.echoes = []
    this.joinTimer = 0
    this.parallax = []
    // the procedurally-driven and culled decoration sets are rebuilt from
    // scratch below, so their registries have to start empty or a restart
    // would keep animating destroyed sprites
    this.routeGlows = []
    this.routeDrift = []
    this.ghostBirds = []
    this.decorStatic = []
    this.brittleHintQueue = null
    this.visDirty = true
    this.featureSprites.clear()
    this.obstacleFeature.clear()
    this.prompt = null
    this.mercyTime = 0
    this.score = new ScoreBook()
    this.scoreShown = 0
    this.flightSeconds = 0
    this.flingTimes = []
    this.lastGrazeTime = -10
    this.prevGather = false
    this.prevSpread = false
    this.hitStop = 0
    this.camKick = 0
    this.predatorDim = 0
    this.predatorDimTarget = 0
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
    this.checkpoint = {
      x: 0,
      name: '',
      count: START_BIRDS,
      found: 0,
      flow: 0,
      lost: 0,
      collisionEvents: 0,
      score: this.score.snapshot(),
    }

    // ---- backdrop: six painted skies that creep, and three receding depths.
    // What was here before was ONE painting pinned with setScrollFactor(0) and
    // recoloured per act by full-screen tint rectangles - so the same aqueduct
    // silhouette sat at the same screen pixel in three different "acts", and
    // across 25,000px of flight the sun never moved. Skyline replaces both.
    this.skyline = new Skyline(this)
    if (!this.textures.exists('sky_dawn_approach')) {
      const plate = ART['bg_plate']
      const cover = Math.max(VIEW_W / plate.w, VIEW_H / plate.h)
      this.add
        .image(VIEW_W / 2, VIEW_H / 2, 'bg_plate')
        .setDisplaySize(plate.w * cover, plate.h * cover)
        .setScrollFactor(0)
        .setDepth(-10)
    }

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
    // ---- THE BREAKABLE LANGUAGE -------------------------------------------
    // One rule, learnable in a single encounter: a piece with COLD LIGHT
    // RUNNING THROUGH IT is one you can burst. Stone is opaque and inert.
    //
    // The light is the piece's own texture drawn over itself additively, so it
    // appears IN the material - along the beads, through the lace - rather
    // than as a halo behind a silhouette, which would only look backlit.
    // Deliberately not warm gold: that colour already means "collect this".
    this.brittleGlows = []
    if (!this.cardsShown.has('brittle')) for (const [f, sprite] of this.featureSprites) {
      if (!f.brittle) continue
      const glow = this.add
        .image(sprite.x, sprite.y, sprite.texture.key)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xdcefff)
        .setOrigin(sprite.originX, sprite.originY)
        .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
        .setFlipX(sprite.flipX)
        .setRotation(sprite.rotation)
        .setDepth(sprite.depth + 0.005)
        .setAlpha(0.3)
      this.brittleGlows.push({ f, sprite, glow, phase: Math.random() * Math.PI * 2 })
      // and they crumble: DARK flakes fall off loose matter. Stone sheds
      // nothing, and nothing here resembles a mote you were meant to collect.
      for (let i = 0; i < 3; i++) {
        const flake = this.add
          .image(sprite.x, sprite.y, 'leaf')
          .setTint(0x2b2440)
          .setDisplaySize(7, 9)
          .setDepth(sprite.depth + 0.01)
          .setAlpha(0)
        this.tweens.add({
          targets: flake,
          y: `+=${110 + Math.random() * 80}`,
          rotation: (Math.random() - 0.5) * 5,
          alpha: { from: 0.5, to: 0 },
          duration: 2400 + Math.random() * 1200,
          delay: Math.random() * 2800,
          repeat: -1,
          ease: 'Sine.easeIn',
          onRepeat: () => {
            const src = this.featureSprites.get(f)
            if (src) {
              flake.setPosition(src.x + (Math.random() - 0.5) * src.displayWidth * 0.7, src.y)
              flake.setRotation(0)
            }
          },
        })
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
        // ONE sprite per mote: the dark contact ring is baked into the
        // texture, which halves the object count for the most numerous thing
        // on screen.
        //
        // And they are NOT uniform. A field of identical evenly-spaced dots is
        // a ruler, not a reward: every mote is worth grabbing and none is worth
        // deciding about. Each arc now runs a mix - most are easy pickings on
        // the line, some sit out at the edges where you must spread or detour
        // to reach them, and those pay more. That is where the choice lives.
        const roll = Math.random()
        const tier = roll < 0.6 ? 0 : roll < 0.88 ? 1 : 2
        // tier 2 sits well off the arc's line, so it costs a real detour
        const stray = tier === 2 ? (Math.random() < 0.5 ? -1 : 1) * (170 + Math.random() * 150) : 0
        const my2 = Phaser.Math.Clamp(my + stray, 150, 830)
        const size = (tier === 0 ? 42 : tier === 1 ? 56 : 74) + Math.random() * 12
        const img = this.add
          .image(mx, my2, 'mote')
          .setDisplaySize(size, size)
          .setAlpha(0.9 + Math.random() * 0.1)
          .setDepth(2.5)
        this.motes.push({
          x: mx, y: my2, img, taken: false, eaten: false, base: size,
          worth: tier === 2 ? 2.2 : tier === 1 ? 1.35 : 1,
        })
      }
    }

    this.stormVeil = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x2a2450, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(7.2)
    this.storm = 0

    this.reachRing = this.add
      .image(0, 0, 'softdot')
      .setTint(0xffd9a0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setDepth(2.2)

    // The most frequently seen reward in the game. At 15px in warm grey it
    // vanished against a warm sky on a phone - the same washout that made the
    // motes unreadable. Bigger, near-white, and carried on its own dark plate
    // so it reads at arm's length on a 390px-tall screen.
    this.chainPlate = this.add
      .image(0, 0, 'softdot')
      .setTint(0x140d24)
      .setScrollFactor(0)
      .setDepth(20.9)
      .setAlpha(0)
    this.chainText = this.add
      .text(0, 0, '', display(26, '#fff6e4', 6, 500))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21)
      .setAlpha(0)
    this.chainText.setShadow(0, 2, '#2a2036', 6)

    this.leaderGlow = this.add
      .image(0, 0, 'softdot')
      .setTint(0xffd9a0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(46, 46)
      .setAlpha(0)
      .setDepth(3.9)
    this.leader = null
    this.leaderMourn = 0
    this.turnedAway = false
    this.resultsSent = false
    this.homecomingJoiners = 0

    this.colliderGfx = this.add.graphics().setDepth(19).setVisible(false)

    // I1 — the sky goes out under a committed dive. It sits ABOVE the world
    // and the flock but BELOW the falcon and its streaks (8.9 / 9), so the
    // predator is the only thing still lit while everything else drops away.
    this.predatorVeil = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x0a0715, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(8.5)
      .setAlpha(0)
      .setVisible(false)
    this.predatorDim = 0
    this.predatorDimTarget = 0

    // authored predator zones: one mid-day, one in the final run
    this.falcon = new FalconSystem(this, this.audio, [8150, 22300])
    // CREATURES. The flight was static geometry plus one scripted predator, so
    // nothing in the world had intent. Each of these is answered by a verb the
    // player already has, which is what finally makes the moveset load-bearing
    // rather than a list of keys.
    createCreatureTextures(this)
    // Placed off the line and spread across the flight so they are met one at a
    // time. The first cluster is forced harmless by the swarm itself, so the
    // lesson is always free — no creature's first appearance is its first threat.
    this.moths = new MothSwarm(this, [
      { x: 5200, y: 430, count: 6, harmless: true },
      { x: 11300, y: 360, count: 8, spanX: 260 },
      { x: 15600, y: 520, count: 9, spanX: 320, period: 5.2 },
      { x: 19900, y: 400, count: 10, spanX: 300 },
      { x: 23800, y: 470, count: 10, spanX: 360, period: 4.4 },
    ])
    // The thief waits on a ruin long before it matters, so it is seen, then
    // recognised, and only then does it cost anything.
    this.thief = new LightThief(this, 13400, 330, 4)
    this.thief.onPanic = () => this.tierFlash?.(2)
    // the dive commits: the light goes before the bird arrives
    this.falcon.onDiveBegin = () => {
      this.predatorDimTarget = 1
    }
    this.falcon.onMobBegin = () => this.mobColumn()
    this.falcon.onReckonBegin = () => this.beginReckoning()
    this.falcon.onReckonEnd = (won) => this.endReckoning(won)
    this.falcon.onStrikeResolved = (taken, gathered, mobbed) => {
      if (mobbed) {
        // THE FLOCK FIGHTS BACK — triumph, not relief
        this.mobLift = 2.2
        this.flock.gatherTime += 1.5
        this.hitStop = 0.07
        this.camKick = 2.6
        this.perfectFlowFeedback()
        this.awardScore('mob')
        return
      }
      // the sky comes back after the beat, not on the frame of impact
      this.predatorDimTarget = 0
      if (taken > 0) {
        this.showPrompt('call', '', () => this.scatter.recoveredThisFrame > 0)
        this.strikeImpact(taken)
      } else if (gathered) {
        // defensive success: a satisfying near-miss flourish
        this.perfectFlowFeedback()
      }
      // subtle camera emphasis — a nudge, never disorienting shake
      this.cameras.main.zoomTo(1.03, 120, 'Sine.easeOut', true)
      this.time.delayedCall(240, () => this.cameras.main.zoomTo(1, 320, 'Sine.easeInOut', true))
    }

    this.flock = new Flock(this, 120, 300, 640)
    // The ceiling is the run's start count: you are bringing YOUR flock home,
    // not farming a bigger one along the way.
    this.flock.maxBirds = START_BIRDS
    this.bar = new AbilityBar(this)
    this.vfx = new VFXDirector(this)
    this.camDir = new CameraDirector(this)
    this.tunnel = new TunnelSequence(this, TUNNELS)
    // The tunnel never removes a bird itself: the loss law belongs to the
    // scene, so a miss here costs exactly what a miss costs anywhere else.
    this.tunnel.onPromptMiss = (verb, victims, x, y) => {
      for (const b of victims) {
        this.scatter.spawn(b.x, b.y, b.vx * 0.4, b.vy * 0.4 - 40)
        this.flock.removeBird(b)
      }
      this.lastLossSource = `The ${verb.toUpperCase()} came too late — the walls took them.`
      this.breakScoreStreak()
      this.camDir.impact(0.8, -1, 0)
      this.vfx.featherBurst(x, y, 6)
    }
    this.tunnel.onPromptHit = (_v, climax, x, y) => {
      this.vfx.perfectMove(x, y, 0xffd9a0, climax ? 1 : 0.7)
      this.awardScore('breakthrough', 1, { x, y })
    }
    this.tunnel.onSplit = () => this.camDir.pushIn(1.06, 500)
    this.tunnel.onBreakout = (full) => {
      this.camDir.pullBack(900)
      if (full) this.vfx.shockwave(this.flock.centerX, this.flock.centerY, 520, 0xffe9c4, 1)
    }

    // Strain squeezes birds out of the formation; they become recoverable, so
    // holding gather finally costs something and Echo finally has a supply to
    // rescue. Drained here rather than inside the sim so the scatter system
    // stays the single owner of what a loose bird does.
    this.squeezeDrain = () => {
      for (const b of this.flock.squeezedThisFrame) {
        this.scatter.spawn(b.x, b.y, b.vx * 0.35, b.vy * 0.35 - 30)
        this.lastLossSource = 'The formation could not hold — they were squeezed loose.'
      }
    }
    this.flock.intentX = 600
    this.flock.intentY = 430
    this.scatter = new ScatterSystem(this)
    STRAYS.forEach((def, i) =>
      this.strays.push({ group: new StrayGroup(this, def.x, def.y, def.count, undefined, i), def }),
    )

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
    // Dive: hold the mouse button; V is the keyboard fallback (D is the overlay)
    this.keyDive = kb.addKey(Phaser.Input.Keyboard.KeyCodes.V)
    kb.on('keydown-C', () => this.echoCall())
    kb.on('keydown-E', () => this.echoCall())
    // touch pads mirror the keyboard grammar exactly; inert on desktop
    this.touch = new TouchControls(this)
    this.touch.onSurge = () => this.doSurge()
    this.touch.onFlare = () => this.doFlare()
    this.touch.onCall = () => this.echoCall()
    this.touch.onPause = () => this.togglePause()
    kb.on('keydown-P', () => this.togglePause())
    kb.on('keydown-M', () => {
      this.muted = !this.muted
      this.audio.setMuted(this.muted)
      this.showChromeToast(this.muted ? 'sound off' : 'sound on')
    })
    kb.on('keydown-R', () => this.scene.restart())
    // a tab that loses focus pauses rather than running the flock into stone
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.setPaused(true))
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

    const safe = safeArea(this)
    // ---- designed HUD: flock dial, journey ribbon, daylight (J1/J2/J5/J6)
    this.createHud()
    this.countText = this.add
      .text(safe.x + 52, safe.y + 18, String(START_BIRDS), display(30, INK.bright, 1))
      .setAlpha(0.95)
      .setScrollFactor(0)
      .setDepth(20)
    // the default legible() shadow is a blurred FILL, which reads as a dark
    // plate behind the numeral at the 1.65x touch ramp. Shadowing the stroke
    // only keeps the contrast and gives the engraved rim the style asks for.
    this.countText.setShadow(0, 2, '#1a1226', 6, true, false)
    this.debugText = this.add
      .text(safe.x + 14, safe.y + 60, '', display(14, '#ffffff'))
      .setAlpha(0.7)
      .setScrollFactor(0)
      .setDepth(20)
      .setVisible(false)
    // INSTRUCTIONS MUST BE READABLE, NOT BEAUTIFUL. A light italic serif over a
    // bright dusk sky is the worst possible combination for a line the player
    // has to act on in under a second, and a stroke alone could not save it —
    // the owner reported these as hard to read, and two of them overlapping.
    // A solid plate behind the text makes contrast independent of whatever the
    // sky is doing, which no amount of shadow tuning can achieve.
    this.promptPlate = this.add
      .graphics()
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(19.9)
    this.promptText = this.add
      .text(0, 0, '', display(21, '#fdf6ec', 1, 400))
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
    this.scoreText = this.add
      .text(safe.x + safe.w - 26, safe.y + 20, '×1.0', display(26, '#ffd9a0', 3))
      .setOrigin(1, 0)
      .setAlpha(0.9)
      .setScrollFactor(0)
      .setDepth(20)
    this.streakText = this.add
      .text(safe.x + safe.w - 26, safe.y + 56, '', display(17, '#ffd9a0', 5, 500))
      .setOrigin(1, 0)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.deltaText = this.add
      .text(safe.x + 122, safe.y + 44, '', display(19, INK.bright, 1))
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.scatteredText = this.add
      .text(safe.x + 52, safe.y + 50, '', display(13, '#d8c0a8', 1, 300))
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    this.recoveredText = this.add
      .text(safe.x + 52, safe.y + 74, '', display(13, '#ffd9a0', 1, 300))
      .setOrigin(0, 0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)
    ;(window as unknown as Record<string, unknown>).__AVOID = AVOID
    this.layoutHud(safe)
    this.lastShownCount = START_BIRDS
    // dusk tint used by the failure sequence (and later, journey warmth)
    this.duskOverlay = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x2a1f3d)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(48)
      .setAlpha(0)
    this.nightVeil = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x0d0a1c)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10.9)
      .setAlpha(0)
    // ---- BLOOM ------------------------------------------------------------
    // Light that bleeds is most of what separates a produced game from an
    // indie one, and Phaser ships it: one camera post-FX pass makes every
    // mote, sunbeam, cage burst and alarm pulse actually GLOW into the air
    // around it instead of being a bright sticker on a flat sky. It is also
    // the cheapest possible way to make the whole frame read as lit, because
    // it is a single pass rather than per-object work.
    //
    // Kept deliberately gentle: this is a painted dusk, not a neon one.
    this.bloom = this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 0.62, 0.34, 4)

    this.night = new Nightfall(this, VIEW_W, VIEW_H)
    this.night.reset(this.checkpoint.x)
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

    this.placeRouteLights()
    this.placeGhostFlyways()

    this.time.delayedCall(2600, () =>
      this.showPrompt('steer', '', () => this.mouseTravel > 900),
    )

    this.beginDeparture()
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
        const haze = this.add
          .image(f.x, y + (disp.h / 2) * 0.88, 'softdot')
          .setTint(0x6a5c86)
          .setDisplaySize(disp.w * 1.15, 96)
          .setAlpha(0.3)
          .setDepth(3.4)
        // one per grounded piece across the whole level: pure scenery that
        // nothing reads back, so it can be culled out of frame for free
        this.decorStatic.push({ img: haze, pad: disp.w * 0.6 })
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
  private falconWarned = false
  private popupSlot = 0
  private promptAge = 0
  private spaceDownT = -10
  private shiftDownT = -10
  private callTimer = 0
  private callCooldown = 0
  /** radius of the travelling call wavefront; -1 when no call is in flight */
  private callWave = -1
  private callStrength = 1
  private mobLift = 0
  private draftTrailT = 0
  private journeyTick = 0
  private score = new ScoreBook()
  private scoreText!: Phaser.GameObjects.Text
  private scoreShown = 0
  private streakText!: Phaser.GameObjects.Text
  private flightSeconds = 0

  /** Surge: tap SPACE — whipcrack pulse. Weak and ragged when strained. */
  private doSurge(): void {
    if (this.reckonOn) { this.reckonInput('surge'); return }
    this.flock.formShape('arrow')
    this.flock.surge()
    this.audio.surgeWhoosh(1 - this.flock.gatherStrain * 0.5)
    const m = Math.hypot(this.flock.meanVX, this.flock.meanVY) || 1
    const hx = this.flock.meanVX / m
    const hy = this.flock.meanVY / m
    const cx = this.flock.centerX
    const cy = this.flock.centerY

    // SPEED LINES streaking BACKWARD past the flock — the read every game
    // uses for "you just accelerated"
    for (let i = 0; i < 16; i++) {
      const off = (Math.random() - 0.5) * 210
      const sx = cx - hy * off
      const sy = cy + hx * off
      const line = this.add
        .image(sx, sy, 'streak')
        .setTint(0xfff1dc)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(150 + Math.random() * 150, 7)
        .setRotation(Math.atan2(hy, hx))
        .setAlpha(0.95)
        .setDepth(6)
      this.tweens.add({
        targets: line,
        x: sx - hx * (260 + Math.random() * 220),
        y: sy - hy * (260 + Math.random() * 220),
        displayWidth: 20,
        alpha: 0,
        duration: 380 + Math.random() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => line.destroy(),
      })
    }
    // a shove of air AHEAD of the flock: the thing being pushed through
    const bow = this.add
      .image(cx + hx * 90, cy + hy * 90, 'softdot')
      .setTint(0xffe9c9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(70, 190)
      .setRotation(Math.atan2(hy, hx))
      .setAlpha(0.5)
      .setDepth(6)
    this.tweens.add({
      targets: bow,
      displayWidth: 300,
      displayHeight: 70,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => bow.destroy(),
    })
    this.camKick = 1.6
  }

  /** Flare: tap SHIFT — the flock blooms wide and air-brakes. */
  private doFlare(): void {
    this.flock.formShape('fan')
    this.flock.flare()
    this.audio.formSnap('release')
    const m = Math.hypot(this.flock.meanVX, this.flock.meanVY) || 1
    const hx = this.flock.meanVX / m
    const hy = this.flock.meanVY / m
    const cx = this.flock.centerX
    const cy = this.flock.centerY

    // the AIR WALL the flock throws up in front of itself, pushed backward
    // as the flock's own speed dies against it
    for (let i = 0; i < 3; i++) {
      const wall = this.add
        .image(cx + hx * (120 + i * 26), cy + hy * (120 + i * 26), 'softdot')
        .setTint(0xe8ddff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(46, 210 + i * 30)
        .setRotation(Math.atan2(hy, hx))
        .setAlpha(0.42 - i * 0.1)
        .setDepth(6)
      this.tweens.add({
        targets: wall,
        x: cx + hx * (20 - i * 20),
        y: cy + hy * (20 - i * 20),
        displayWidth: 130,
        displayHeight: 300 + i * 40,
        alpha: 0,
        duration: 420 + i * 90,
        ease: 'Cubic.easeOut',
        onComplete: () => wall.destroy(),
      })
    }
    // feathers shed backward from the braking edge
    this.featherPuff(cx + hx * 60, cy + hy * 60, 5, -hx * 120, -hy * 120 - 30)
  }

  /** Echo Call: tap C — the flock cries out; the scattered and the stray
   * turn toward home. Hoarse (weak) while on its diegetic cooldown. */
  private echoCall(): void {
    this.flock.formShape('ring')
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
    // THE PING travels. Echo used to add to the same `spread01` scalar that
    // SPREAD widens, so it was mechanically a duplicate of another verb and
    // could only reach what was already close. Now a wavefront leaves the flock
    // at a finite speed and everything lost that it crosses ANSWERS: its
    // expiry clock stops and it turns for home under its own power.
    this.callWave = 0
    this.scatter.beginCall(this.flock.centerX, this.flock.centerY)
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

    // THE ANSWER: every lost bird within reach lights up and a thread of light
    // runs from the flock to it, so the call visibly DOES something to them
    const reach = 900 * this.callStrength
    let answered = 0
    for (const sb of this.scatter.recoverables()) {
      const d = Math.hypot(sb.x - cx, sb.y - cy)
      if (d > reach) continue
      answered++
      const g = this.add.graphics().setDepth(5.8).setAlpha(0)
      g.lineStyle(2, 0xffd9a0, 0.85)
      g.lineBetween(cx, cy, sb.x, sb.y)
      this.tweens.add({ targets: g, alpha: 1, duration: 160, delay: d * 0.6 })
      this.tweens.add({ targets: g, alpha: 0, duration: 420, delay: d * 0.6 + 220, onComplete: () => g.destroy() })
    }
    if (answered > 0) {
      const t = this.add
        .text(0, 0, `${answered} ${answered === 1 ? 'BIRD ANSWERS' : 'BIRDS ANSWER'}`, display(17, '#ffd9a0', 4, 500))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(21)
        .setAlpha(0)
      const at = this.floatAt(cx - this.scrollX, cy - 130)
      t.setPosition(at.x, at.y)
      t.setShadow(0, 2, '#2a2036', 6)
      this.tweens.add({ targets: t, alpha: 1, y: at.y - 22, duration: 300 })
      this.tweens.add({ targets: t, alpha: 0, duration: 600, delay: 900, onComplete: () => t.destroy() })
    }
  }

  /** One-time prompts queue instead of being dropped when the slot is busy,
   * and every prompt times out — nothing can hog the screen. */
  /** Resolve prompt copy for the player's actual hardware. */
  private say(key: string, fallback: string): string {
    const e = PROMPT_TEXT[key]
    if (!e) return fallback
    return isTouch ? e.touch : e.key
  }

  private showPrompt(key: string, text: string, done: () => boolean): void {
    text = this.say(key, text)
    if (this.shownPrompts.has(key)) return
    this.shownPrompts.add(key)
    if (this.prompt) {
      if (this.promptQueue.length < 4) this.promptQueue.push({ key, text, done })
      return
    }
    this.beginPrompt({ key, text, done })
  }

  /** Danger copy: clears whatever teaching line is on screen and shows now. */
  private alertPrompt(text: string): void {
    this.promptQueue.length = 0
    this.tweens.killTweensOf(this.promptText)
    this.prompt = { key: 'alert', done: () => !this.falcon.inWarning, fading: false }
    this.promptAge = 0
    this.promptText.setText(text).setAlpha(0).setColor('#ffd0b8')
    this.promptText.setShadow(0, 2, '#3a1a1a', 8)
    this.tweens.add({ targets: this.promptText, alpha: 1, duration: 200 })
  }

  private beginPrompt(p: { key: string; text: string; done: () => boolean }): void {
    this.promptText.setColor('#f7ecdf')
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
    // sit clear of BOTH the flock and the HUD corners (audit: prompts drawn
    // over the flock, prompt/HUD collision)
    const above = this.flock.centerY > VIEW_H * 0.45
    const at = this.floatAt(
      this.flock.centerX - this.scrollX,
      above ? this.flock.centerY - 190 : this.flock.centerY + 170,
    )
    // clamp by the string's real half-width: a fixed margin let the longest
    // teaching lines hang off the left edge of the frame
    const safe = safeArea(this)
    const half = this.promptText.width / 2 + 16
    this.promptText.setPosition(
      Phaser.Math.Clamp(at.x, safe.x + half, safe.x + safe.w - half),
      at.y,
    )
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
    if (this.paused) return
    let dt = Math.min(deltaMs / 1000, 1 / 20)
    // hit-stop: a 40-80ms time-dip that gives the big three impacts a punch
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt)
      dt *= 0.12
    }
    // logic clock = accumulated sim time, so cooldown windows track the sim
    // wherever it runs (real loop, slow machines, headless drivers) rather
    // than the wall clock
    // BRACE: the world eases to ~60%; the flock keeps its own clock, and
    // Flock.setBrace() prices the formation half (strain ticks double)
    const rawDt = dt
    // FIRST-ENCOUNTER CARD: the world eases rather than hard-freezing, so the
    // flock keeps flying and the moment stays alive while you read.
    this.cardEase += ((this.card ? 1 : 0) - this.cardEase) * (1 - Math.exp(-7 * rawDt))
    dt *= 1 - this.cardEase * 0.82
    // The tunnel's impact dip. This slows the WORLD, not the flock — DayScene
    // already hands the flock its own rawDt, deliberately. The game may slow
    // time to frame a moment; the flock may not, because a slowed flock would
    // be a player power rather than a director's choice.
    dt *= this.tunnel.timeScale
    // THE RECKONING crawls the world much harder than a card does — this is a
    // held breath, not a reading pause, and the slow motion IS the drama.
    if (this.card && this.cardAutoT > 0) {
      this.cardAutoT -= rawDt
      if (this.cardAutoT <= 0) this.dismissCard()
    }
    if (this.retryFallbackT > 0) {
      this.retryFallbackT -= rawDt
      if (this.retryFallbackT <= 0) this.retryGo?.()
    }
    this.reckonEase += ((this.reckonOn ? 1 : 0) - this.reckonEase) * (1 - Math.exp(-11 * rawDt))
    dt *= 1 - this.reckonEase * 0.88
    // The window must run on REAL time. Driving it from the slowed clock meant
    // a player who did not answer froze the world at 12% speed for ~21 real
    // seconds - the sim stalled outright, and both fairness probes hung at the
    // same x rather than finishing. Slow motion is for the player's benefit; it
    // must never buy them extra time.
    if (this.reckonOn) {
      this.reckonRealT += rawDt
      if (this.reckonRealT > RECKON_REAL_TIME) this.falcon.failReckoning()
    }
    this.updateBrace(rawDt)
    this.braceAmt += ((this.braceOn ? 1 : 0) - this.braceAmt) * (1 - Math.exp(-BRACE_EASE * rawDt))
    dt *= 1 - this.braceAmt * (1 - BRACE_WORLD_SCALE)
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
      this.scrollX += baseSpeed * mercy * this.tunnel.speedMult * dt
    } else if (this.finishing) {
      const targetScroll = ROOST_X - VIEW_W * 0.58
      this.scrollX += (targetScroll - this.scrollX) * Math.min(dt * 1.1, 1)
    }
    // decaying micro-kick on the 3 sanctioned impact events (never sustained)
    this.camKick *= Math.exp(-dt * 13)
    // The camera director produces an OFFSET; it never writes scrollX itself,
    // so the authored scroll pacing is untouched. camKick is retired into
    // camDir.impact(), which decays properly instead of ringing on a sine.
    this.camDir.followFlock(dt, this.flock.centerX, this.flock.centerY, this.scrollX)
    this.camDir.update(dt, rawDt)
    this.vfx.update(dt, rawDt)
    cam.scrollX = this.scrollX + this.camDir.offsetX
    cam.scrollY = this.camDir.offsetY

    // I1 — THE SKY DIMS FOR THE DIVE. It slams shut (the falcon takes the
    // light with it) and opens slowly afterwards, so the beat has a shape.
    // Capped at 0.5: tense, never unreadable, per the darkness floor guard.
    {
      const rate = this.predatorDimTarget > this.predatorDim ? 15 : 2.6
      this.predatorDim += (this.predatorDimTarget - this.predatorDim) * (1 - Math.exp(-rate * rawDt))
      const a = this.predatorDim * 0.5
      this.predatorVeil.setVisible(a > 0.004).setAlpha(a)
    }

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
    const gather =
      !this.finishing && !this.braceOn && (this.keySpace.isDown || this.touch.gather || this.debugHold.gather)
    const spread =
      !this.finishing && !this.braceOn && (this.keyShift.isDown || this.touch.spread || this.debugHold.spread)
    if (gather && this.reckonOn && !this.prevGatherForReckon) this.reckonInput('gather')
    this.prevGatherForReckon = gather
    if (gather) this.gatherHeld += dt
    if (spread) this.spreadHeld += dt

    // ---- DIVE: hold to stoop, release to slingshot (the flock owns the impulse)
    const diving = !this.finishing && !this.failing && (p.isDown || this.keyDive.isDown || this.touch.diving)
    if (diving !== this.prevDive) {
      this.flock.setDive(diving)
      if (diving) this.audio.formSnap('gather')
      else if (this.flock.diveLift > 0.05) {
        this.audio.surgeWhoosh(0.6 + this.flock.diveLift * 0.5)
        this.formFlourish(true)
      }
      this.prevDive = diving
    }
    if (diving) this.showPrompt('dive', '', () => !this.flock.dive)
    this.detectVortexGesture(dt, untouched ? VIEW_W * 0.45 : p.x, untouched ? VIEW_H * 0.45 : p.y)

    // formation snap: every press/release is a felt, heard transient —
    // and a short tap is an ABILITY (Surge / Flare)
    if (gather && !this.prevGather) {
      this.spaceDownT = time
      this.audio.formSnap('gather')
      this.formFlourish(true)
    }
    if (!gather && this.prevGather && !this.braceConsumed && time - this.spaceDownT < 0.22) this.doSurge()
    if (spread && !this.prevSpread) {
      this.shiftDownT = time
      this.audio.formSnap('spread')
      this.formFlourish(false)
    }
    if (!spread && this.prevSpread && !this.braceConsumed && time - this.shiftDownT < 0.22) this.doFlare()
    if (!this.keySpace.isDown && !this.keyShift.isDown) this.braceConsumed = false
    if (!gather && !spread && (this.prevGather || this.prevSpread)) this.audio.formSnap('release')
    this.prevGather = gather
    this.prevSpread = spread

    // ability envelopes that live outside the flock sim
    this.callTimer = Math.max(0, this.callTimer - dt)
    this.callCooldown = Math.max(0, this.callCooldown - dt)
    this.touch.setCallCooldown(this.callCooldown / 6)
    this.mobLift = Math.max(0, this.mobLift - dt)

    // progressive difficulty: dusk sharpens the world — sloppy flying costs
    // more per act (Rapid Morph +15%, Gauntlet +30%), on top of the faster
    // scroll and denser terrain
    this.flock.dangerScale = this.scrollX > 20400 ? 1.3 : this.scrollX > 14400 ? 1.15 : 1

    this.flock.update(
      rawDt,
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
    this.tunnel.update(rawDt, this.flock, this.scrollX, gather)

    // drain the squeeze immediately after the sim, before anything else can
    // read a flock count that is about to change
    if (this.squeezeDrain && this.flock.squeezedThisFrame.length > 0) this.squeezeDrain()

    // THE COSTS BECOME VISIBLE. Gather and Spread run strain clocks that are
    // central to the economy and were shown nowhere, and Echo's cooldown was
    // invisible — calling into a dead one felt like a broken button.
    this.bar.setStrain('gather', this.flock.gatherStrain)
    this.bar.setStrain('spread', this.flock.spreadStrain)
    this.bar.setCooldown('echo', Phaser.Math.Clamp(this.callCooldown / 6, 0, 1))
    this.bar.setAvailable('echo', this.callCooldown <= 0)
    // and the bar points at the answer: the verb that counters whatever has
    // hold of you right now, taught wordlessly, every time.
    this.bar.suggest('spread', this.moths.attachedCount > 0)
    this.bar.suggest('flare', this.moths.attachedCount > 0)
    this.bar.suggest('echo', this.scatter.recoverableCount > 0)
    this.bar.suggest('gather', this.falcon.phase === 'window' || this.falcon.phase === 'strike')
    this.bar.setAlpha(this.countText.alpha)
    this.bar.update(dt)

    this.falcon.update(dt, this.flock, this.scrollX, VIEW_W, this.visibleObstacles())
    this.moths.update(dt, this.flock, this.scrollX)
    // Moths take daylight while they cling — the cost is the point, and it is
    // visible on the meter the player is already watching.
    if (this.moths.drainPerSec > 0) {
      this.night.daylight = Math.max(0, this.night.daylight - this.moths.drainPerSec * dt)
    }
    this.thief.update(dt, this.flock, this.scrollX)
    if (this.thief.readyToDisgorge) {
      // it gives back MORE than it took, because it was already carrying what
      // it stole from others — that surplus is what makes the detour worth it
      const gift = this.thief.disgorge()
      for (let i = 0; i < gift; i++) this.night.feed()
    }
    // The one warning that can cost the run: it preempts the queue, and it
    // fires at every encounter, not once per session (audit: critical).
    if (this.falcon.inWarning && !this.falconWarned) {
      this.falconWarned = true
      this.alertPrompt(isTouch ? 'hold GATHER — the falcon dives' : 'hold SPACE — the falcon dives')
    } else if (!this.falcon.inWarning) {
      this.falconWarned = false
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
    this.updateLeader(dt)
    // the chain rides with the flock, just under it
    const chainAt = this.floatAt(this.flock.centerX - this.scrollX, this.flock.centerY + 96)
    this.chainText.setPosition(chainAt.x, chainAt.y)
    this.updateStorm(dt)
    this.updateOpeningZones()
    this.cullStragglers(dt)
    const spreadAmt = Math.max(-this.flock.form, 0)
    // Echo Call: the cry extends recovery reach and stirs distant strays;
    // Spread still closes the deal — call sets up, spread collects
    const callBoost = this.callTimer > 0 ? 0.8 * this.callStrength : 0
    this.updateReachRing(spreadAmt, callBoost)
    this.scatter.update(dt, time, this.flock, Math.min(1, spreadAmt + callBoost))
    for (const s of this.strays) {
      if (s.group.depleted) continue
      const wasCaged = !s.group.depleted
      const joined = s.group.update(dt, time, this.flock, 200 + spreadAmt * 220 + callBoost * 340)
      if (joined > 0) {
        this.stats.found += joined
        this.flockGain(joined, s.def.x, s.def.y)
        // FREED BIRDS FLY TO YOU, visibly. Without a streak the join is
        // invisible - the counter just ticks up and the cage means nothing.
        for (let i = 0; i < joined; i++) this.freedStreak(s.def.x, s.def.y)
      }
      if (wasCaged && s.group.depleted) this.cageFreed(s.def.x, s.def.y)
    }

    // drafting streamlines: clean straight flight visibly cuts the air
    if (this.flock.draft > 0.55) {
      this.draftTrailT -= dt
      if (this.draftTrailT <= 0) {
        this.draftTrailT = 0.1
        const b = this.flock.birds[(Math.random() * this.flock.birds.length) | 0]
        if (b) {
          const streak = this.add
            .image(b.x - b.vx * 0.06, b.y - b.vy * 0.06, 'streak')
            .setTint(0xf5ead8)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.55)
            .setDisplaySize(70, 6)
            .setRotation(Math.atan2(b.vy, b.vx))
            .setDepth(5.5)
          this.tweens.add({ targets: streak, alpha: 0, displayWidth: 90, duration: 380, onComplete: () => streak.destroy() })
        }
      }
    }

    this.updateMovers(time)
    this.updateFlowGates()
    this.updateMotes(dt)
    this.updateDecor(time)
    this.updateNightfall(dt)
    // the call's wavefront sweeps outward, answering what it reaches
    if (this.callWave >= 0) {
      const prev = this.callWave
      this.callWave += CALL_WAVE_SPEED * dt
      if (prev < CALL_WAVE_REACH) {
        const answered = this.scatter.answerCall(this.callWave)
        if (answered > 0) this.showCallAnswer(answered)
      } else {
        this.callWave = -1
        this.scatter.endCall()
      }
    }
    this.updateCards(dt)
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
    // act plates, sunbeams, wisps — the layer that gives each act its light.
    // (This call was silently dropped once; the audit caught six acts
    // measuring identical sky colour because of it.)
    const { inBeam } = this.atmo.update(dt, this.scrollX, this.flock)
    if (inBeam > 0) this.flock.relieveStrain(dt * 3.2 * inBeam)
    if (this.atmo.actChanged) {
      this.leafEmitter.setParticleTint(this.atmo.particleTint(this.scrollX) as never)
    }
    this.updateRoostSwirl(dt, time)
    this.updateAmbientFlocks(dt)

    for (const pr of PROMPTS) {
      if (pr.x < 0) continue
      if (this.scrollX > pr.x) {
        if (pr.key === 'gather')
          this.showPrompt('gather', '', () => this.gatherHeld > 0.3 && this.flock.centerX > 1020)
        else if (pr.key === 'spread')
          this.showPrompt('spread', '', () => this.stats.found > 0 || this.spreadHeld > 1.6)


      }
    }
    // teach Neutral once, right after the spread lesson lands
    if (this.shownPrompts.has('spread') && !this.prompt && !this.shownPrompts.has('regroup') && this.scrollX > 1900) {
      this.showPrompt('regroup', '', () => Math.abs(this.flock.form) < 0.15 && this.flock.gatherStrain < 0.1)
    }
    // teach Flare when the flock is genuinely closing too fast on stone
    if (
      this.flock.nearObstacles.length >= 2 &&
      Math.hypot(this.flock.meanVX, this.flock.meanVY) > 300 &&
      this.scrollX > 8600
    ) {
      this.showPrompt('flare', '', () => this.flock.flareAmt > 0.3)
    }
    // Dive: taught on the long open descent before the mid-game
    if (this.scrollX > 6100 && this.scrollX < 7400) {
      this.showPrompt('dive', '', () => this.flock.diveLift > 0.1)
    }
    // Vortex: taught where scattered birds are worth hoovering back
    if (this.scrollX > 10100 && this.scrollX < 11200 && this.scatter.recoverableCount >= 3) {
      this.showPrompt('vortex', '', () => this.flock.vortex > 0.1)
    }
    // Brace: taught entering the gauntlet, where reading the world matters
    if (this.scrollX > 20500 && this.scrollX < 21600) {
      this.showPrompt('brace', '', () => this.braceOn)
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
    // ---- HARMONY: earned by calm neutral flight, spent on the next change
    // ---- FLOCK VOICE: the murmuration talks to itself
    this.audio.setVoice(
      Phaser.Math.Clamp(this.flock.count / START_BIRDS, 0, 1),
      Phaser.Math.Clamp(
        (1 - Math.max(this.flock.gatherStrain, this.flock.spreadStrain)) *
          (1 - Math.abs(this.flock.form) * 0.4) *
          (this.falcon.inWarning ? 0.15 : 1) *
          0.72,
        0,
        1,
      ),
    )
    this.audio.voiceTick(dt)

    // first-time strain hints, once each, fading on recovery
    if (this.flock.gatherStrain > 0.55)
      this.showPrompt('strain-g', 'too tight — release to regroup', () => this.flock.gatherStrain < 0.2)
    if (this.flock.spreadStrain > 0.55)
      this.showPrompt('strain-s', 'the flock is losing cohesion', () => this.flock.spreadStrain < 0.2)
    if (this.finishing) this.audio.warmth(Math.min(1, this.finishTimer / 4))

    this.flightSeconds += dt
    this.scoreShown += (this.score.mastery - this.scoreShown) * Math.min(1, dt * 6)
    this.scoreText.setText(`×${this.scoreShown.toFixed(1)}`)
    this.updateHudCount()
    this.drawHud(dt)
    const displayed = this.flock.count + this.scatter.recoverableCount
    if (displayed <= WARN_BIRDS && !this.finishing) {
      // colour is owned by drawHud now, so the urgent ramp and the ±N flash
      // stop overwriting each other frame to frame
      this.audio.setThin(true)
      this.showPrompt('lowflock', 'the flock is too small to hold together', () => this.flock.count + this.scatter.recoverableCount > WARN_BIRDS + 6)
    } else if (displayed > WARN_BIRDS) {
      this.audio.setThin(false)
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
      .setPosition(this.hudDeltaX, this.hudDeltaY)
    this.tweens.add({
      targets: this.deltaText,
      alpha: 0,
      y: this.hudDeltaY + (delta > 0 ? -14 : 14),
      duration: 1100,
      ease: 'Quad.easeOut',
    })
    if (delta < 0) {
      // muted warm-red pulse + tiny feather scatter, thrown off the DIAL so
      // the loss reads at the same place the arc drains
      this.hudFlash = '#e8a090'
      this.hudFlashUntil = this.time.now + 420
      const burst = this.add.particles(this.hudDial.x, this.hudDial.y, 'leaf', {
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
      this.hudFlash = '#ffd9a0'
      this.hudFlashUntil = this.time.now + 420
      this.audio.collectBloom(delta)
    }
  }

  /** Rhythmic obstacle motion: readable, slow, colliders move with the art. */
  /** First two brittle encounters get a floating hint ON the structure —
   * after that the visual language (shimmer, sway, tremble) carries alone. */
  private brittleHints = 0
  private hintedFeatures = new Set<PieceFeature>()
  /** The brittle pieces still awaiting a hint, built once. Walking the whole
   * feature map every frame to find them was work done ~60×/s for a thing
   * that can fire exactly twice in a run. */
  private brittleHintQueue: { f: PieceFeature; sprite: Phaser.GameObjects.Image }[] | null = null
  private updateBrittleHints(): void {
    // hard stop once both hints have shown — after this the shimmer, sway and
    // tremble carry the language alone, so there is nothing left to compute
    if (this.brittleHints >= 2) return
    if (!this.brittleHintQueue) {
      this.brittleHintQueue = []
      for (const [f, sprite] of this.featureSprites) if (f.brittle) this.brittleHintQueue.push({ f, sprite })
    }
    const fx = this.flock.centerX
    for (const { f, sprite } of this.brittleHintQueue) {
      if (this.hintedFeatures.has(f)) continue
      // DISTANCE FIRST. The intact test has to walk the obstacle→feature map,
      // and the old order paid for that walk on every brittle piece in the
      // whole 25,000px level, every frame — allocating a full copy of the map
      // to do it. A hint that only ever appears at arm's length has no
      // business asking anything about a piece two acts away.
      if (Math.abs(f.x - fx) > 520) continue
      let anyIntact = false
      for (const [o, ft] of this.obstacleFeature) {
        if (ft === f && !o.broken) {
          anyIntact = true
          break
        }
      }
      if (!anyIntact) continue
      this.hintedFeatures.add(f)
      this.brittleHints++
      const label = this.add
        .text(sprite.x, sprite.y - sprite.displayHeight / 2 - 26, 'loose — tap SPACE', display(15, '#ffe2b8', 2))
        .setOrigin(0.5)
        .setDepth(7)
        .setAlpha(0)
      label.setShadow(0, 1, '#2a2036', 4)
      this.tweens.add({ targets: label, alpha: 0.95, duration: 400, yoyo: true, hold: 2400, onComplete: () => label.destroy() })
      if (this.brittleHints >= 2) return
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
    // the charge rides its piece exactly (curtains swing) and brightens as you
    // bear down on it, so a piece about to burst visibly strains first
    for (const g of this.brittleGlows) {
      // a shattered piece has no charge to show; it comes back with the art
      if (!g.sprite.visible) {
        if (g.glow.visible) g.glow.setVisible(false)
        continue
      }
      if (!g.glow.visible) g.glow.setVisible(true)
      const charge = this.featureTremble(g.f)
      g.glow.setPosition(g.sprite.x, g.sprite.y)
      g.glow.setRotation(g.sprite.rotation)
      g.glow.setDisplaySize(g.sprite.displayWidth, g.sprite.displayHeight)
      const breathe = 0.5 + 0.5 * Math.sin(time * 2.3 + g.phase)
      g.glow.setAlpha(0.22 + breathe * 0.16 + charge * 0.55)
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
            this.awardScore('flow', 1, { x: f.x, y: this.flock.centerY })
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

  /**
   * The dark advances, the light holds it off, and the world dims as daylight
   * goes. The dimming is the point: motes blaze against a darker sky, so the
   * thing you need is most visible exactly when you most need it.
   */
  private updateNightfall(dt: number): void {
    if (this.failing) return
    // The dark used to be switched off the instant `finishing` began, which
    // made a graded ending impossible: arriving hunted and arriving clean drew
    // the identical frame. It keeps advancing through the ceremony now — it
    // simply stops taking birds — so the fog on your heels is IN the ending.
    if (this.finishing) {
      this.night.update(dt, this.flock, this.scrollX, VIEW_W, VIEW_H)
      this.night.takenThisFrame.length = 0
      this.nightVeil.setAlpha((1 - this.night.daylight) * 0.5)
      return
    }
    // later acts are hungrier - the chase tightens as the day runs out
    this.skyline.setAct(this.atmo.act)
    this.skyline.update(dt, this.scrollX)
    this.night.setIntensity(1 + this.atmo.act * 0.16)
    this.night.update(dt, this.flock, this.scrollX, VIEW_W, VIEW_H)

    // global dusk from the daylight level
    const dark = 1 - this.night.daylight
    this.nightVeil.setAlpha(dark * 0.5)
    // and the darker it gets the harder the remaining light blooms, so the
    // game is at its most beautiful exactly when it is at its most desperate
    if (this.bloom) {
      // gentle: at full dark this reaches 0.5, not 2.5. The first pass blew
      // the whole frame to white - bloom should make lights bleed, not erase
      // the painting behind them.
      this.bloom.blurStrength = 0.62 + dark * 0.3
      this.bloom.strength = 0.34 + dark * 0.16
    }

    // birds the dark took: they strobe and fall like any other loss, so the
    // threat speaks the language the player already knows
    for (const bird of this.night.takenThisFrame) {
      const dx = bird.x - this.flock.centerX
      const dy = bird.y - this.flock.centerY
      if (!this.scatter.spawn(bird.x, bird.y, dx || -1, dy - 0.3)) this.stats.lost++
      this.flock.removeBird(bird)
      this.breakScoreStreak()
    }
    if (this.night.takenThisFrame.length > 0) {
      this.lossCause('the dark took them — keep the flock together', this.flock.centerX, this.flock.centerY, this.simClock)
      this.audio.falconHit()
    }
  }

  /** Wide rewards: golden motes; a spread flock sweeps far more of them. */
  /**
   * THE HARVEST — and the compounding loop the game already had and severed.
   *
   * A research panel found FLYWAY owns the best death-spiral substrate of any
   * game it surveyed, and had neutralised it at exactly one link:
   *
   *   miss light -> less daylight -> fog closer -> fog takes trailing birds ->
   *   fewer birds -> SMALLER NET -> fewer motes -> less daylight
   *
   * Every term is already on screen. The loop was broken because the harvest
   * radius was a fixed 42px per bird, so losing thirty birds cost you nothing
   * you could feel. It scales with flock size now, and the spiral closes.
   *
   * Guarded deliberately: the exponent is gentle and the radius has a floor, so
   * a battered flock is disadvantaged, never doomed. Compounding pressure, not
   * an unrecoverable slide.
   */
  private updateMotes(dt: number): void {
    const x0 = this.scrollX - 100
    const x1 = this.scrollX + VIEW_W + 100

    // the chain window: a live clock on the most frequent action in the game
    const lapsed = this.score.tickHarvest(dt)
    if (lapsed >= 5) this.audio.formSnap('gather')

    // spread widens the net, and a shrunken flock narrows it
    const spread01 = Math.max(0, -this.flock.form)
    const health = Phaser.Math.Clamp(this.flock.count / START_BIRDS, 0.35, 1)
    const reach = (26 + 104 * spread01) * (0.55 + 0.45 * Math.pow(health, 0.7))
    const reach2 = reach * reach

    for (const m of this.motes) {
      // `taken` used to be spelled `!img.visible`, which meant visibility was
      // already carrying state and could not also be used to cull. Now it can:
      // ~179 motes line the whole route and all but a handful are out of frame
      // at any moment, each one paying a transform and a draw for nothing.
      if (m.taken) continue

      // LIGHT YOU LEAVE IS FED TO THE THING CHASING YOU. A missed mote used to
      // be a non-event; now the dark visibly closes over it, which is what
      // makes missing cost something the player can see.
      if (!m.eaten && m.x < this.night.edgeX) {
        m.eaten = true
        m.taken = true
        this.moteEaten(m.x, m.y)
        continue
      }

      const on = m.x >= x0 && m.x <= x1
      if (m.img.visible !== on) m.img.setVisible(on)
      if (!on) continue

      for (const b of this.flock.birds) {
        const dx = b.x - m.x
        const dy = b.y - m.y
        if (dx * dx + dy * dy < reach2) {
          m.taken = true
          m.img.setVisible(false)
          this.collectMote(m)
          break
        }
      }
    }
  }

  /** One mote taken: the chain advances, and the chain is what pays. */
  private collectMote(m: { x: number; y: number; worth: number; base: number }): void {
    // The chain pays in DAYLIGHT, which is the fog's distance — so a long
    // sweep does not add an abstract score, it physically shoves the wall of
    // night backward. That is the reward the game already owns.
    const mult = this.score.collectLight(m.worth, this.night.daylight)
    const tier = this.score.harvest.tier
    this.flock.relieveStrain(0.5)
    this.night.feed(m.worth * mult)

    // SURPLUS LIGHT COMES BACK AS BIRDS — the upward loop the run did not have.
    // Daylight caps at 1.0 and the route carries roughly 4.7x more light than
    // the flight consumes, so for most of a good run a x3 chain paid EXACTLY
    // what a x1 chain paid: the multiplier was decorative precisely when it had
    // been earned, which teaches the player it is fake. `spill` is 0 while the
    // meter has room and 1 once the bonus is entirely wasted, so this pays
    // nothing while daylight still matters and cannot ever feed the fog.
    this.lightBank += this.score.harvest.spill * (mult - 1)
    if (this.lightBank >= 1) {
      this.lightBank -= 1
      if (this.scatter.recoverableCount > 0) this.scatter.answerCall(1e9)
      else this.flock.relieveStrain(1.2)
    }

    // A rising PENTATONIC rung, not a chromatic semitone: the score is G-major
    // pentatonic over a D2 drone, so a chromatic ladder leaves the key by the
    // second mote and grinds the drone by the fourth — and arcs run to 17.
    this.audio.collectBloom(this.moteChain)
    // the light enters the FLOCK, so the player sees that they took it
    this.flock.lightPulse(m.x, m.y, Math.min(1, tier * 0.5 + 0.4))

    const spark = this.add
      .image(m.x, m.y, 'mote')
      .setDisplaySize(m.base, m.base)
      .setAlpha(0.95)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4)
    // escalate the SIZE of what changes, never the NUMBER of things changing —
    // additive clutter is how reward feedback becomes noise
    const grow = m.base * (2.2 + tier * 0.75)
    this.tweens.add({
      targets: spark,
      displayWidth: grow,
      displayHeight: grow,
      alpha: 0,
      duration: 380 + tier * 90,
      onComplete: () => spark.destroy(),
    })
    if (tier > 0) this.showLightChain(tier)
  }

  /**
   * The screen answers a tier-up. One full-frame warm rim, in and out inside
   * 600ms — unmissable on a phone, and gone before it can become noise.
   */
  private tierFlash(tier: number): void {
    const safe = safeArea(this)
    if (!this.tierRing) {
      this.tierRing = this.add
        .image(0, 0, 'alarmring')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScrollFactor(0)
        .setDepth(46)
        .setAlpha(0)
    }
    const r = this.tierRing
    const tints = [0xffd9a0, 0xffe6bf, 0xfff2d8, 0xffffff]
    r.setTint(tints[Math.min(3, tier - 1)] ?? 0xffd9a0)
      .setPosition(safe.x + safe.w / 2, safe.y + safe.h / 2)
      .setDisplaySize(safe.w * 0.45, safe.h * 0.45)
      .setAlpha(0.5 + tier * 0.1)
    this.tweens.killTweensOf(r)
    this.tweens.add({
      targets: r,
      displayWidth: safe.w * 1.9,
      displayHeight: safe.h * 1.9,
      alpha: 0,
      duration: 520 + tier * 60,
      ease: 'Cubic.easeOut',
    })
    this.camKick = Math.max(this.camKick, 1 + tier * 0.5)
    if (tier >= 3) this.hitStop = Math.max(this.hitStop, 0.05)
  }

  /** N birds have heard the call and turned for home. */
  private showCallAnswer(n: number): void {
    const at = this.floatAt(this.flock.centerX - this.scrollX, this.flock.centerY - 120)
    const t = this.add
      .text(at.x, at.y, n === 1 ? 'ONE ANSWERS' : `${n} ANSWER`, display(24, '#dff0ff', 8, 500))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30)
    this.tweens.add({
      targets: t,
      y: at.y - 48,
      alpha: { from: 1, to: 0 },
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  /** The dark closes over light the player left behind. */
  private moteEaten(x: number, y: number): void {
    const g = this.add
      .image(x, y, 'mote')
      .setDisplaySize(46, 46)
      .setTint(0x6a5a86)
      .setDepth(4)
      .setAlpha(0.85)
    this.tweens.add({
      targets: g,
      displayWidth: 8,
      displayHeight: 8,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeIn',
      onComplete: () => g.destroy(),
    })
  }

  /** A chain ends — quietly when it simply lapses, loudly on a collision. */
  private endMoteChain(broken: boolean): void {
    if (this.moteChain >= 5) {
      // a long chain ending is worth hearing either way: a soft settle when it
      // simply lapsed, a harder fall when stone broke it
      this.audio.formSnap(broken ? 'spread' : 'gather')
    }
    this.moteChain = 0
    this.moteChainT = 0
    this.lastLightTier = 0
  }

  /**
   * The ambient decoration, animated and culled in one pass.
   *
   * Two facts drove this. First, the route glows, drift motes and ghost
   * flyways each used to own a `repeat: -1` tween, and there is one per piece
   * of level geometry rather than a fixed number — a per-frame scheduler cost
   * that grows every time the level does. Their motion is a raised cosine and
   * a linear slide, which is what a yoyoing Sine.easeInOut and a linear tween
   * literally are, so computing them off the sim clock is the same picture
   * with the objects deleted.
   *
   * Second, the flock only ever sees ~1,500px of a 25,000px world, so the
   * overwhelming majority of this decoration is off screen being transformed
   * and submitted for nothing. Hiding it is safe here precisely because none
   * of these sets read their own `visible` back as state — unlike the feature
   * sprites, where a hidden sprite means "shattered", or the motes, which
   * needed an explicit `taken` flag before they could be culled at all.
   *
   * Culling first also makes the animation cheap: an off-screen glow costs one
   * comparison instead of a cosine.
   */
  private updateDecor(t: number): void {
    const x0 = this.scrollX - 260
    const x1 = this.scrollX + VIEW_W + 260
    const TAU = Math.PI * 2

    for (const d of this.decorStatic) {
      const on = d.img.x + d.pad > x0 && d.img.x - d.pad < x1
      if (d.img.visible !== on) d.img.setVisible(on)
    }

    for (const g of this.routeGlows) {
      const on = g.img.x + 220 > x0 && g.img.x - 220 < x1
      if (g.img.visible !== on) g.img.setVisible(on)
      if (!on || g.amp === 0) continue
      g.img.setAlpha(0.17 + g.amp * (0.5 - 0.5 * Math.cos(((t + g.ph) / g.per) * TAU)))
    }

    for (const d of this.routeDrift) {
      const on = d.x0 + d.travel + 40 > x0 && d.x0 - 40 < x1
      if (d.img.visible !== on) d.img.setVisible(on)
      if (!on) continue
      // one slide-and-fade cycle, then a beat of nothing before it starts over
      const p = Math.min(((t + d.ph) % d.per) / d.dur, 1)
      d.img.x = d.x0 + d.travel * p
      d.img.setAlpha(0.62 * (1 - p))
    }

    for (const g of this.ghostBirds) {
      const on = g.img.x + 60 > x0 && g.img.x - 60 < x1
      if (g.img.visible !== on) g.img.setVisible(on)
      if (!on) continue
      // `delay` staggers the wake-up so the stream still lights bird by bird
      const u = t - g.delay
      g.img.setAlpha(u <= 0 ? 0 : g.peak * (0.5 - 0.5 * Math.cos((u / g.per) * TAU)))
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
  private visCacheBucket = Number.NaN
  private visDirty = true

  /**
   * The old key was raw `scrollX`, which moves EVERY frame — so this cache
   * never once hit while the flock was flying, and both callers (steering and
   * the falcon) re-filtered the whole obstacle list and allocated a fresh
   * array twice per frame. That is straight into the GC, and GC pauses are
   * what the player feels as chop.
   *
   * The window itself is padded 300px behind and 600px ahead, so the answer
   * does not actually change from one pixel of travel to the next. Bucketing
   * the key to 96px keeps every answer well inside that pad while letting a
   * couple of dozen consecutive frames share one array. Breaking or restoring
   * a piece changes membership without moving the camera, so those paths
   * mark the cache dirty by hand.
   */
  private visibleObstacles(): Obstacle[] {
    const bucket = Math.floor(this.scrollX / 96)
    if (!this.visDirty && this.visCacheBucket === bucket) return this.visCache
    this.visCacheBucket = bucket
    this.visDirty = false
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
    // leaving a zone you rode discharges the bank as a surge-shaped kick
    if (this.windBankZone && zone !== this.windBankZone) {
      const kick = this.flock.dischargeBank()
      if (kick > 0) {
        this.audio.surgeWhoosh(kick)
        this.formFlourish(true)
      }
      this.windBankZone = null
    }
    if (!zone) return
    const gather = Math.max(this.flock.form, 0)
    const spread = Math.max(-this.flock.form, 0)
    // gathered flocks cut through; spread flocks catch the full push
    const resist = (1 - gather * 0.72) * (1 + spread * 0.6)
    for (const b of this.flock.birds) {
      b.vx += zone.vx * resist * dt
      b.vy += zone.vy * resist * dt
    }
    // riding: spreading INTO an aligned wind banks momentum instead of merely
    // surviving it. Updrafts are caught by spreading; horizontal zones need
    // real heading alignment.
    const wm = Math.hypot(zone.vx, zone.vy) || 1
    const fm = Math.hypot(this.flock.meanVX, this.flock.meanVY) || 1
    const align = (zone.vx * this.flock.meanVX + zone.vy * this.flock.meanVY) / (wm * fm)
    if (spread >= TAILWIND_SPREAD_MIN && (zone.kind === 'updraft' || align >= TAILWIND_ALIGN_MIN)) {
      this.flock.bankMomentum(Math.max(align, 0.5) * spread * dt)
      this.windBankZone = zone
      this.showPrompt('tailwind', 'spread — ride the wind', () => this.flock.bank <= 0)
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
        this.breakScoreStreak()
        this.lossCause('struck the stone', bird.x, bird.y, time)
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

  /** SPREAD'S REACH, drawn. The collection radius was an invisible number,
   * so spreading looked like "the flock gets wider" instead of "I can now
   * gather birds from over there". */
  private reachRing!: Phaser.GameObjects.Image
  private updateReachRing(spreadAmt: number, callBoost: number): void {
    const reach = 200 + spreadAmt * 220 + callBoost * 340
    const strayNear = this.strays.some(
      (s) => !s.group.depleted && Math.abs(s.def.x - this.flock.centerX) < reach + 320,
    )
    const want = (spreadAmt > 0.15 || callBoost > 0) && (strayNear || this.scatter.recoverableCount > 0)
    this.reachRing.setPosition(this.flock.centerX, this.flock.centerY)
    this.reachRing.setDisplaySize(reach * 2, reach * 1.5)
    this.reachRing.setAlpha(Phaser.Math.Linear(this.reachRing.alpha, want ? 0.22 : 0, 0.12))
  }

  /** Birds joining the flock are announced as birds — never as points. */
  private flockGain(n: number, x: number, y: number): void {
    const at = this.floatAt(x - this.scrollX, y - 40)
    const t = this.add
      .text(at.x, at.y, `+${n} ${n === 1 ? 'BIRD' : 'BIRDS'}`, display(19, '#ffd9a0', 4, 500))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21)
      .setAlpha(0)
    t.setShadow(0, 2, '#2a2036', 6)
    this.tweens.add({ targets: t, alpha: 1, y: at.y - 26, duration: 340, ease: 'Cubic.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, y: at.y - 62, duration: 640, delay: 620, onComplete: () => t.destroy() })
  }

  /** Keep floating text inside the visible rect AND clear of the touch pads. */
  /** Rows recently claimed by a floating callout, with the time they free up.
   * Two popups landing on one spot overstrike into unreadable garbage
   * (the audit caught "++11 BBTRRFSDRRDDD"), so each one takes its own lane. */
  private floatLanes: { x: number; y: number; until: number }[] = []

  /**
   * Stack the corner readouts off their MEASURED heights. The offsets used to
   * be literals tuned at desktop size, so the 1.65x touch type ramp made the
   * bird count and the "N scattered" line land on top of each other, and put
   * the mastery multiplier hard against the right edge.
   */
  private layoutHud(safe: { x: number; y: number; w: number; h: number }): void {
    const edge = isTouch ? 40 : 26
    const left = safe.x + edge
    const right = safe.x + safe.w - edge
    const top = safe.y + (isTouch ? 14 : 18)

    // ---- J1: the flock dial. Glyph in the middle of a draining arc, the
    // count reading off its right, so the number and the loss share one object.
    const r = isTouch ? 30 : 27
    const cx = left + r + 2
    const cy = top + r + 4
    this.hudDial = { x: cx, y: cy, r }
    this.hudGlyph.setPosition(cx, cy)
    this.hudAlertBead.setPosition(cx, cy)
    const tx = cx + r + 14
    this.countText.setOrigin(0, 1).setPosition(tx, cy + 5)
    this.hudFlockLabel.setOrigin(0, 0).setPosition(tx + 2, cy + 8)
    this.hudDeltaX = tx + this.countText.width + 14
    this.deltaText.setOrigin(0, 0.5).setPosition(this.hudDeltaX, cy - 8)
    this.hudDeltaY = cy - 8

    let y = cy + r + 14 + this.hudFlockLabel.height
    this.scatteredText.setOrigin(0, 0.5).setPosition(left, y + this.scatteredText.height / 2)
    y += this.scatteredText.height + 4
    this.recoveredText.setOrigin(0, 0.5).setPosition(left, y + this.recoveredText.height / 2)
    this.debugText.setPosition(safe.x + 14, y + 26)

    // ---- J2/J5: the journey ribbon, centred, with the daylight read along it
    const rw = Math.min(isTouch ? 600 : 660, safe.w * 0.44)
    const rx = Math.round(safe.x + safe.w / 2 - rw / 2)
    const ry = Math.round(top + (isTouch ? 30 : 26))
    this.hudRibbon = { x: rx, y: ry, w: rw }
    this.hudRoostBead.setPosition(rx + rw, ry)
    // each label points AT its own rail: DAYLIGHT sits off the left end of the
    // meter, the destination off the right end of the journey
    this.hudDayLabel.setOrigin(1, 0.5).setPosition(rx - 14, ry + 12)
    this.hudDayPct.setOrigin(1, 0.5).setPosition(rx - 14, ry - 8)
    this.hudPlaceLabel.setOrigin(0, 0.5).setPosition(rx + rw + 16, ry)

    // the mastery readout clears the touch pause pad (r=42 at safe.y+74)
    const sTop = isTouch ? safe.y + 126 : top
    this.scoreText.setPosition(right, sTop)
    this.streakText.setPosition(right, sTop + this.scoreText.height + 6)
  }

  /**
   * The HUD's own furniture. Everything engraved is one Graphics object
   * redrawn per frame — a few dozen line segments, cheaper than keeping and
   * re-tweening a pile of sprites, and it lets the arc and the meters carry
   * real curves instead of chunky bars.
   */
  private createHud(): void {
    this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(20)
    // coral halo behind the dial: the readout's urgent state (J6) as light,
    // not as a box or a colour swap
    this.hudAlertBead = this.add
      .image(0, 0, 'softdot')
      .setDisplaySize(150, 150)
      .setTint(0xff8a6e)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(19.9)
    this.hudGlyph = this.add
      .image(0, 0, 'bird-mid')
      .setScale(0.3)
      .setTintFill(0xf2e8f5)
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(20.1)
    this.hudFlockLabel = this.add
      .text(0, 0, 'FLOCK', display(12, '#c8bad4', 5, 300))
      .setAlpha(0.72)
      .setScrollFactor(0)
      .setDepth(20.1)
    this.hudFlockLabel.setStroke('#241a2e', 2)
    this.hudFlockLabel.setShadow(0, 1, '#241a2e', 3, true, false)

    this.hudRoostBead = this.add
      .image(0, 0, 'softdot')
      .setDisplaySize(46, 46)
      .setTint(0xffcf94)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.2)
      .setScrollFactor(0)
      .setDepth(20.05)
    this.hudDayBead = this.add
      .image(0, 0, 'softdot')
      .setDisplaySize(30, 30)
      .setTint(0xffdca8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.5)
      .setScrollFactor(0)
      .setDepth(20.05)
    this.hudMarker = this.add
      .image(0, 0, 'bird-mid')
      .setScale(0.19)
      .setTintFill(0xfff3e2)
      .setScrollFactor(0)
      .setDepth(20.2)
    this.hudDayPct = this.add
      .text(0, 0, '', display(15, '#ffe6bf', 2, 500))
      .setScrollFactor(0)
      .setDepth(20)
      .setAlpha(0.95)
    this.hudDayLabel = this.add
      .text(0, 0, 'DAYLIGHT', display(12, '#c8bad4', 5, 300))
      .setAlpha(0.6)
      .setScrollFactor(0)
      .setDepth(20.1)
    this.hudDayLabel.setStroke('#241a2e', 2)
    this.hudDayLabel.setShadow(0, 1, '#241a2e', 3, true, false)
    this.hudPlaceLabel = this.add
      .text(0, 0, 'SUN GATE', display(12, '#f0d7b4', 5, 300))
      .setAlpha(0.75)
      .setScrollFactor(0)
      .setDepth(20.1)
    this.hudPlaceLabel.setStroke('#241a2e', 2)
    this.hudPlaceLabel.setShadow(0, 1, '#241a2e', 3, true, false)
  }

  /** Everything that moves in the HUD, eased so nothing ever snaps. */
  private drawHud(dt: number): void {
    const n = this.flock.count + this.scatter.recoverableCount
    const k = 1 - Math.exp(-dt * 6)
    this.hudArcShown += (Phaser.Math.Clamp(n / START_BIRDS, 0, 1) - this.hudArcShown) * k
    this.hudDayShown += (this.night.daylight - this.hudDayShown) * k
    this.hudProgShown += (Phaser.Math.Clamp(this.flock.centerX / ROOST_X, 0, 1) - this.hudProgShown) * k

    // The owner could not tell how much light they had or how much they needed.
    // A number says the first; colour and a warning word say the second - it
    // goes amber under a third and calls for light under a fifth, which is the
    // point at which the dark starts genuinely gaining.
    const day01 = this.night.daylight
    const pct = Math.round(day01 * 100)
    const low = day01 < 0.2
    this.hudDayPct.setText(low ? `${pct}%  FIND LIGHT` : `${pct}%`)
    this.hudDayPct.setColor(low ? '#ff9a7a' : day01 < 0.34 ? '#ffc98a' : '#ffe6bf')
    this.hudDayPct.setAlpha(low ? 0.75 + 0.25 * Math.sin(this.simClock * 7) : 0.95)

    // J6 — the urgent band. The owner asked for "~25 birds", but the flock
    // scatters back to its landmark at FAIL_BIRDS (35), so a read that only
    // began at 25 could never be seen: it ramps from the game's own warning
    // number and is fully urgent just before the scatter.
    const urgentFrom = Math.max(CRITICAL_BIRDS, WARN_BIRDS)
    const urgentTo = Math.max(CRITICAL_BIRDS, FAIL_BIRDS + 2)
    const uT = this.finishing ? 0 : Phaser.Math.Clamp((urgentFrom - n) / Math.max(1, urgentFrom - urgentTo), 0, 1)
    this.hudUrgency += (uT - this.hudUrgency) * (1 - Math.exp(-dt * 3))
    const u = this.hudUrgency
    const t = this.time.now * 0.001
    // a slow breath, not a strobe: urgency is dread, not an alarm
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1)

    const g = this.hudGfx
    g.clear()
    if (this.countText.alpha <= 0.01) {
      this.hudGlyph.setAlpha(0)
      this.hudMarker.setAlpha(0)
      this.hudRoostBead.setAlpha(0)
      this.hudDayBead.setAlpha(0)
      this.hudAlertBead.setAlpha(0)
      this.hudFlockLabel.setAlpha(0)
      this.hudDayLabel.setAlpha(0)
      this.hudPlaceLabel.setAlpha(0)
      return
    }
    // one master fade for the whole readout (see the ceremony's tween)
    const fade = this.countText.alpha
    g.setAlpha(fade)

    // ---------------------------------------------------- J1: the flock dial
    const { x: cx, y: cy, r } = this.hudDial
    const A0 = Phaser.Math.DegToRad(132)
    const SWEEP = Phaser.Math.DegToRad(276)
    // engraved: a dark contact line under a pale one, so the arc reads as cut
    // into the sky rather than painted on top of it
    g.lineStyle(4, 0x241a2e, 0.5)
    g.beginPath()
    g.arc(cx, cy + 1, r, A0, A0 + SWEEP, false)
    g.strokePath()
    g.lineStyle(2, 0xcdbfda, 0.24)
    g.beginPath()
    g.arc(cx, cy, r, A0, A0 + SWEEP, false)
    g.strokePath()
    // the fill DRAINS: the arc is the loss, the number is only the caption
    const arcCol = u > 0.02 ? this.mixHex(0xf6d9b8, 0xff9d84, u) : 0xf6d9b8
    g.lineStyle(3, arcCol, 0.55 + 0.35 * (1 - u) + u * pulse * 0.4)
    g.beginPath()
    g.arc(cx, cy, r, A0, A0 + SWEEP * Math.max(0.001, this.hudArcShown), false)
    g.strokePath()
    // a tick at the head of the fill, so the drain has an edge you can watch
    const ha = A0 + SWEEP * this.hudArcShown
    g.lineStyle(2, 0xfff0dc, 0.85)
    g.lineBetween(
      cx + Math.cos(ha) * (r - 5),
      cy + Math.sin(ha) * (r - 5),
      cx + Math.cos(ha) * (r + 5),
      cy + Math.sin(ha) * (r + 5),
    )
    this.hudGlyph.setAlpha(0.92 * fade).setTintFill(u > 0.02 ? this.mixHex(0xf2e8f5, 0xffb9a4, u) : 0xf2e8f5)
    this.hudAlertBead.setAlpha(u * (0.1 + pulse * 0.16) * fade)
    this.countText.setColor(
      this.time.now < this.hudFlashUntil ? this.hudFlash : u > 0.02 ? this.cssHex(this.mixHex(0xf2e8f5, 0xffb9a4, u)) : '#f2e8f5',
    )
    if (u > 0.35) {
      this.hudFlockLabel.setText('FLOCK CRITICAL').setColor('#ffb9a4').setAlpha((0.6 + pulse * 0.4) * fade)
    } else {
      this.hudFlockLabel.setText('FLOCK').setColor('#c8bad4').setAlpha(0.72 * fade)
    }

    // ------------------------------------- J2/J5: the journey, and the light
    const { x: rx, y: ry, w: rw } = this.hudRibbon
    const px = rx + rw * this.hudProgShown
    // the track: roost to roost, the whole day at a glance. Kept pale and
    // slight — the two rails must not read as one heavy double rule.
    g.lineStyle(3, 0x241a2e, 0.3)
    g.lineBetween(rx, ry + 1, rx + rw, ry + 1)
    g.lineStyle(2, 0xd6cae2, 0.3)
    g.lineBetween(rx, ry, rx + rw, ry)

    // the wall of night, placed on the map: the valley it has already taken
    const fogFrac = Phaser.Math.Clamp(this.night.edgeX / ROOST_X, 0, 1)
    const fogX = rx + rw * fogFrac
    if (this.night.encroach > 0.02 && fogX > rx + 1) {
      g.lineStyle(5, 0x0d0a1c, 0.5 + this.night.encroach * 0.4)
      g.lineBetween(rx, ry, fogX, ry)
      g.lineStyle(2, 0xffd0a8, 0.25 + this.night.encroach * 0.35)
      g.lineBetween(fogX - 3, ry, fogX, ry)
    }
    // the room you still have: from the dark's edge to where you are
    g.lineStyle(3, 0xf6d9b8, 0.62)
    g.lineBetween(Math.max(rx, fogX), ry, px, ry)

    // landmark ticks — place, and how far is left
    for (const lm of LANDMARKS) {
      if (!lm.name) continue
      const lx = rx + rw * Phaser.Math.Clamp(lm.x / ROOST_X, 0, 1)
      const passed = this.flock.centerX >= lm.x
      g.lineStyle(3, 0x241a2e, 0.32)
      g.lineBetween(lx, ry - 7, lx, ry + 6)
      g.lineStyle(2, passed ? 0xffd9a0 : 0xe2d8ec, passed ? 0.92 : 0.42)
      g.lineBetween(lx, ry - (passed ? 9 : 6), lx, ry + (passed ? 6 : 4))
    }
    // the two roosts: where you left, where you are going. A hollow mark
    // behind, a filled one ahead — the ribbon reads roost to roost.
    g.lineStyle(2, 0x241a2e, 0.4)
    g.lineBetween(rx, ry - 11, rx, ry + 8)
    g.lineStyle(2, 0xe8dcf0, 0.55)
    g.lineBetween(rx, ry - 10, rx, ry + 7)
    g.lineStyle(1, 0xe8dcf0, 0.5)
    g.strokeTriangle(rx - 5, ry - 12, rx + 5, ry - 12, rx, ry - 20)
    const roostLit = 0.45 + this.hudProgShown * 0.5
    g.lineStyle(2, 0xffd9a0, roostLit)
    g.lineBetween(rx + rw, ry - 11, rx + rw, ry + 8)
    g.fillStyle(0xffd9a0, roostLit)
    g.fillTriangle(rx + rw - 6, ry - 12, rx + rw + 6, ry - 12, rx + rw, ry - 22)
    this.hudRoostBead.setAlpha((0.16 + this.hudProgShown * 0.6) * fade).setDisplaySize(38 + this.hudProgShown * 26, 38 + this.hudProgShown * 26)

    // you, on the ribbon — a soft mark under the glyph so it is findable
    // against a busy sky without turning into a cursor
    g.fillStyle(0xfff3e2, 0.5)
    g.fillCircle(px, ry, 2.6)
    this.hudMarker.setAlpha(0.95 * fade).setPosition(px, ry - 13 + Math.sin(t * 2.2) * 1.2)

    // ---- the daylight meter, read along the same ribbon (J5)
    const dy = ry + 12
    g.lineStyle(3, 0x241a2e, 0.3)
    g.lineBetween(rx, dy + 1, rx + rw, dy + 1)
    g.lineStyle(2, 0xa495b6, 0.26)
    g.lineBetween(rx, dy, rx + rw, dy)
    const d = Math.max(0.004, this.hudDayShown)
    const dayCol = d < 0.24 ? this.mixHex(0xffb9a4, 0xff8f70, 1 - d / 0.24) : d < 0.55 ? this.mixHex(0xffc98a, 0xffdca8, (d - 0.24) / 0.31) : 0xffdca8
    g.lineStyle(3, dayCol, d < 0.24 ? 0.6 + pulse * 0.35 : 0.85)
    g.lineBetween(rx, dy, rx + rw * d, dy)
    this.hudDayBead
      .setPosition(rx + rw * d, dy)
      .setTint(dayCol)
      .setAlpha((0.35 + (d < 0.24 ? pulse * 0.4 : 0.2)) * fade)
    this.hudDayLabel.setAlpha(0.6 * fade).setColor(d < 0.24 ? '#ffb9a4' : '#c8bad4')

    // the place you are heading for — the platformer's "how far is left"
    const next = LANDMARKS.find((l) => !!l.name && l.x > this.flock.centerX)
    const place = next ? next.name : 'THE ROOST'
    if (this.hudPlaceLabel.text !== place.toUpperCase()) this.hudPlaceLabel.setText(place.toUpperCase())
    this.hudPlaceLabel.setAlpha(0.75 * fade)
  }

  private cssHex(c: number): string {
    return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`
  }

  /** Blend two packed RGB colours — used for the HUD's warm-to-alert ramps. */
  private mixHex(a: number, b: number, t: number): number {
    const k = Phaser.Math.Clamp(t, 0, 1)
    const ar = (a >> 16) & 255
    const ag = (a >> 8) & 255
    const ab = a & 255
    const br = (b >> 16) & 255
    const bg = (b >> 8) & 255
    const bb = b & 255
    return (
      ((ar + (br - ar) * k) << 16) |
      ((ag + (bg - ag) * k) << 8) |
      ((ab + (bb - ab) * k) | 0)
    )
  }

  private floatAt(x: number, y: number): { x: number; y: number } {
    const safe = safeArea(this)
    // the touch cluster now reaches up to the BRACE pad at safe.h-294, so
    // floating copy has to clear more of the lower-right than it used to
    const padGuard = isTouch ? 320 : 90
    const top = safe.y + 70
    const bottom = safe.y + safe.h - padGuard
    const cx = Phaser.Math.Clamp(x, safe.x + 210, safe.x + safe.w - 210)
    let cy = Phaser.Math.Clamp(y, top, bottom)

    const now = this.time.now
    this.floatLanes = this.floatLanes.filter((l) => l.until > now)
    const clashes = (ty: number): boolean =>
      this.floatLanes.some((l) => Math.abs(l.y - ty) < 42 && Math.abs(l.x - cx) < 300)
    if (clashes(cy)) {
      // walk outward in both directions for the nearest free lane
      let found = false
      for (let step = 44; step <= 220 && !found; step += 44) {
        for (const cand of [cy - step, cy + step]) {
          if (cand >= top && cand <= bottom && !clashes(cand)) {
            cy = cand
            found = true
            break
          }
        }
      }
    }
    this.floatLanes.push({ x: cx, y: cy, until: now + 900 })
    return { x: cx, y: cy }
  }

  /** Say WHY birds were lost, at the place it happened. Rate-limited so a
   * bad passage explains itself once instead of shouting every frame. */
  private lastCauseT = -10
  /** The last thing that actually killed birds, so failure can name it. */
  private lastLossSource = ''

  private lossCause(text: string, x: number, y: number, time: number): void {
    this.lastLossSource = text
    if (time - this.lastCauseT < 2.4) return
    this.lastCauseT = time
    const at = this.floatAt(x - this.scrollX, y + 44)
    const sx = at.x
    const sy = at.y
    const t = this.add
      .text(sx, sy, text, display(15, '#e6b3a4', 3, 400))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21)
      .setAlpha(0)
    t.setShadow(0, 2, '#2a2036', 6)
    this.tweens.add({ targets: t, alpha: 0.95, y: sy - 16, duration: 320 })
    this.tweens.add({ targets: t, alpha: 0, duration: 600, delay: 1200, onComplete: () => t.destroy() })
  }

  /** Award points and float the reason where the player was looking. */
  private awardScore(source: MasteryEvent, count = 1, at?: { x: number; y: number }): void {
    const ev = this.score.award(source, count)
    if (!ev) return
    const wx = at?.x ?? this.flock.centerX
    const wy = at?.y ?? this.flock.centerY
    const spot = this.floatAt(wx - this.scrollX, wy - 90)
    const sx = spot.x
    const sy = spot.y
    const big = ev.gain >= 0.25
    // stagger against anything still on screen so popups never stack
    this.popupSlot = (this.popupSlot + 1) % 4
    const slotY = (this.popupSlot - 1.5) * 30
    // every popup speaks the same language as the HUD: what you did, and
    // what it did to your multiplier
    const headline = `${ev.label}   ×+${ev.gain.toFixed(2)}`
    const label = this.add
      .text(sx, sy + slotY, headline, display(big ? 21 : 17, big ? '#ffe6bf' : '#f2e4d5', big ? 6 : 4, big ? 500 : 400))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21)
      .setAlpha(0)
    label.setShadow(0, 2, '#2a2036', 6)
    this.tweens.add({ targets: label, alpha: 1, y: sy + slotY - 26, duration: 380, ease: 'Cubic.easeOut' })
    this.tweens.add({ targets: label, alpha: 0, y: sy + slotY - 64, duration: 700, delay: 620, onComplete: () => label.destroy() })
    this.showChain()
  }

  /** The live chain, pinned beside the flock and PERSISTENT — the audit found
   * it invisible until x2, for 2.2s, in a corner the player never looks at. */
  private chainText!: Phaser.GameObjects.Text
  /**
   * The LIGHT chain readout. Distinct from showChain(), which reports the
   * mastery streak ("N CLEAN IN A ROW") — this one names the tier you have
   * climbed to, because a player can feel arriving somewhere named and cannot
   * feel the difference between a 1.25x and a 1.6x multiplier.
   */
  private showLightChain(tier: number): void {
    const label = `${this.moteChain}  ${MOTE_TIERS[tier]}`
    const colours = ['#cdbdd4', '#ffd9a0', '#ffe6bf', '#fff2d8', '#ffffff']
    this.chainText
      .setText(label)
      .setColor(colours[tier])
      .setAlpha(1)
      .setScale(1 + tier * 0.06)
    const at = this.floatAt(this.flock.centerX - this.scrollX, this.flock.centerY + 96)
    this.chainText.setPosition(at.x, at.y)
    this.chainPlate
      .setPosition(at.x, at.y)
      .setDisplaySize(this.chainText.width * 2.1, this.chainText.height * 3.4)
      .setAlpha(0.72)
    this.tweens.killTweensOf(this.chainText)
    this.tweens.killTweensOf(this.chainPlate)
    this.tweens.add({ targets: [this.chainText, this.chainPlate], alpha: 0, duration: 900, delay: 420 })

    // A TIER-UP takes the whole screen for a moment: a warm rim flashes in from
    // the edges and falls away. High contrast, instantly readable at any size,
    // and it costs one sprite - which is the anti-clutter rule (escalate the
    // SIZE of what changes, never the NUMBER of things changing).
    if (tier > this.lastLightTier) {
      this.lastLightTier = tier
      this.tierFlash(tier)
    }
  }

  private showChain(): void {
    const n = this.score.chain
    if (n <= 0) return
    const label = n >= 2 ? `${n} CLEAN IN A ROW` : '1 CLEAN'
    this.chainText
      .setText(label)
      .setColor(n >= 5 ? '#ffe6bf' : n >= 2 ? '#ffd9a0' : '#cdbdd4')
      .setAlpha(1)
      .setScale(1.25)
    this.tweens.killTweensOf(this.chainText)
    this.tweens.add({ targets: this.chainText, scale: 1, duration: 260, ease: 'Back.easeOut' })
  }

  /** A collision breaks the chain — the loss the player feels most. Even a
   * 2-link chain says so now; silence was reading as "nothing was lost". */
  private breakScoreStreak(): void {
    const lostChain = this.score.breakHarvest()
    if (this.score.harvest.lastLossMatters) {
      this.chainText.setText(`LIGHT CHAIN LOST  ${lostChain}`).setColor('#e0a898').setAlpha(1)
      this.tweens.killTweensOf(this.chainText)
      this.tweens.add({ targets: this.chainText, alpha: 0, duration: 900, delay: 900 })
    }
    const had = this.score.stumble()
    if (had < 1) return
    this.chainText.setText(had >= 3 ? `CHAIN BROKEN  ${had}` : 'chain broken').setColor('#e0a898').setAlpha(1)
    this.tweens.killTweensOf(this.chainText)
    this.tweens.add({ targets: this.chainText, alpha: 0, duration: 800, delay: 900 })
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

  // --------------------------------------------------- I1: the falcon strike

  /**
   * The moment of contact. Everything here fires on ONE frame: the flash, the
   * feathers thrown along the dive line, the hit-stop and a 2-3px kick. The
   * screech and the birds leaving the flock happen on the same frame, inside
   * FalconSystem.resolveStrike — that co-timing is the whole beat.
   */
  private strikeImpact(taken: number): void {
    const { x, y } = this.falcon.impactPoint

    // 1. the hit itself — a hard, brief pale flash at the talons. It lives for
    //    ~140ms: any longer and it reads as a glow rather than a blow.
    const flash = this.add
      .image(x, y, 'softdot')
      .setTint(0xfff0dc)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9.2)
      .setAlpha(0.9)
      .setDisplaySize(120, 120)
    this.tweens.add({
      targets: flash,
      displayWidth: 420,
      displayHeight: 420,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    })

    // 2. FEATHERS, thrown along the dive. The old burst sprayed upward at a
    //    fixed angle regardless of where the falcon came from; these leave
    //    along the strike line, which is what makes the impact look caused.
    const burst = this.add.particles(x, y, 'feather', {
      speed: { min: 180, max: 560 },
      angle: { min: 8, max: 96 }, // down-and-forward: the falcon's heading
      lifespan: { min: 800, max: 1700 },
      scale: { min: 0.4, max: 0.95 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 90,
      // pale enough to separate from the navy birds they were torn from —
      // dark-on-dark feathers were invisible in the wreckage
      tint: [0x6b5f85, 0x9c8db4, 0xc4b6d6, 0xe6dcee],
      emitting: false,
    })
    burst.setDepth(9.1)
    burst.explode(20 + taken * 6, 0, 0)
    // and a counter-spray kicked back UP out of the wound — a two-directional
    // burst reads as an explosion, a one-directional one reads as a jet
    const back = this.add.particles(x, y, 'feather', {
      speed: { min: 90, max: 300 },
      angle: { min: -170, max: -60 },
      lifespan: { min: 900, max: 2000 },
      scale: { min: 0.3, max: 0.7 },
      alpha: { start: 0.9, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 40,
      tint: [0x453a5e, 0x8d7fa6, 0xc4b6d6],
      emitting: false,
    })
    back.setDepth(9.1)
    back.explode(14 + taken * 3, 0, 0)
    this.time.delayedCall(2100, () => {
      burst.destroy()
      back.destroy()
    })

    // 3. ~70ms of held time, and a kick that peaks at ~2.6px. No shake.
    this.hitStop = 0.07
    this.camKick = 2.6
    this.lossCause('the falcon struck — gather or find cover', x, y, this.simClock)
  }

  // ------------------------------------------------- I3: mobbing the falcon

  /**
   * The one triumph the game offers, and it used to resolve in silence. The
   * flock RISES AS A COLUMN — the lift itself is driven by mobLift steering
   * intent; this is the image around it: a shaft of warm light standing where
   * the predator was, streaks tearing upward through it, and the sky opening
   * (a brief zoom out) instead of closing.
   */
  private mobColumn(): void {
    const cx = this.flock.centerX
    const cy = this.flock.centerY
    // no dim on this beat — the light comes UP
    this.predatorDimTarget = 0

    // the column: a tall warm shaft that stands up out of the flock
    const shaft = this.add
      .image(cx, cy, 'vfade')
      .setTint(0xffd7a0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7.5)
      .setAlpha(0)
      .setDisplaySize(240, 60)
      .setOrigin(0.5, 1)
    this.tweens.add({
      targets: shaft,
      alpha: 0.5,
      displayWidth: 380,
      displayHeight: 760,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: shaft,
          alpha: 0,
          displayHeight: 900,
          duration: 900,
          ease: 'Sine.easeIn',
          onComplete: () => shaft.destroy(),
        })
      },
    })

    // streaks tearing upward through the shaft — the flock's own rush
    for (let i = 0; i < 18; i++) {
      const sx = cx + (Math.random() - 0.5) * 300
      const sy = cy + 80 + Math.random() * 120
      const st = this.add
        .image(sx, sy, 'streak')
        .setTint(i % 3 === 0 ? 0xffe8c4 : 0x8f7fb0)
        .setBlendMode(i % 3 === 0 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setRotation(-Math.PI / 2 + (Math.random() - 0.5) * 0.35)
        .setDisplaySize(90 + Math.random() * 190, 3 + Math.random() * 7)
        .setDepth(7.6)
        .setAlpha(0)
      this.tweens.add({
        targets: st,
        y: sy - 420 - Math.random() * 320,
        alpha: { from: 0.75, to: 0 },
        duration: 520 + Math.random() * 380,
        delay: Math.random() * 260,
        ease: 'Quad.easeOut',
        onComplete: () => st.destroy(),
      })
    }

    // feathers thrown UPWARD — the mob's own noise, not a loss
    const up = this.add.particles(cx, cy, 'feather', {
      speed: { min: 220, max: 620 },
      angle: { min: -140, max: -40 },
      lifespan: { min: 900, max: 1900 },
      scale: { min: 0.3, max: 0.8 },
      alpha: { start: 0.85, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 120,
      tint: [0x453a5e, 0x6b5f85, 0xa08db8],
      emitting: false,
    })
    up.setDepth(7.4)
    up.explode(34, 0, 0)
    this.time.delayedCall(2100, () => up.destroy())

    // the sky OPENS: pull back, then settle. The strike zooms in; this is its
    // opposite, so the two beats never read the same.
    this.cameras.main.zoomTo(0.965, 260, 'Sine.easeOut', true)
    this.time.delayedCall(700, () => this.cameras.main.zoomTo(1, 900, 'Sine.easeInOut', true))
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
          this.awardScore('cleanPass', 1, { x: z.x, y: z.y })
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
      this.lossCause('blown wide — gather in close terrain', bird.x, bird.y, time)
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
      // teach Surge the instant a curtain refuses to break: the problem is on
      // screen, and the answer is the next thing the player presses
      if (charge >= 3 && this.flock.pulse < 0.2) {
        this.showPrompt('surge', '', () => this.flock.pulse > 0.3)
      }
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
        this.lossCause('the curtain held — surge or gather through', bird.x, bird.y, time)
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

  // ---------------------------------------------------- I2: the brittle break
  //
  // This used to be an alpha fade over 450ms — an audit called it invisible and
  // it was right: nothing that dissolves reads as broken. It now EXPLODES.
  // Three things carry it: the curtain's own art comes apart into slabs thrown
  // along the flock's heading, angular shards spray with them, and a shaft of
  // light stands up through the hole that was just made.

  /** Breaking one brittle collider clears the whole curtain it belongs to. */
  private breakFeature(o: Obstacle): void {
    const mvx = this.flock.meanVX
    const mvy = this.flock.meanVY
    const speed = Math.max(1, Math.hypot(mvx, mvy))
    // the flock's heading is the direction everything leaves in
    const hx = mvx / speed
    const hy = mvy / speed

    const feature = this.obstacleFeature.get(o)
    let sx = o.x
    let sy = o.y
    // membership of the visible-obstacle cache just changed without the camera
    // moving, so tell the cache rather than letting it hand out a stale list
    this.visDirty = true
    if (feature) {
      for (const [ob, f] of this.obstacleFeature) if (f === feature) ob.broken = true
      const sprite = this.featureSprites.get(feature)
      if (sprite) {
        sx = sprite.x
        sy = sprite.y
        this.shatterSprite(sprite, hx, hy, speed)
        sprite.setVisible(false)
      }
      // the cold charge dies with the piece — a broken curtain that still
      // glows "breakable" is a lie about the world. The entry is kept so a
      // checkpoint rewind can revive it with the art.
      for (const g of this.brittleGlows) {
        if (g.f !== feature) continue
        this.tweens.killTweensOf(g.glow)
        g.glow.setVisible(false)
      }
    } else {
      o.broken = true
    }

    // 1. SHARDS, thrown along the heading. Angular chips with corners, not
    //    drifting leaves — cone-biased forward so the direction is legible.
    const coneDeg = (Math.atan2(hy, hx) * 180) / Math.PI
    const shards = this.add.particles(sx, sy, 'shard', {
      speed: { min: 260, max: 900 },
      angle: { min: coneDeg - 46, max: coneDeg + 46 },
      lifespan: { min: 700, max: 1500 },
      scale: { min: 0.4, max: 1.25 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 340,
      tint: [0x191330, 0x2a2440, 0x3d3358, 0xb9cee0],
      emitting: false,
    })
    shards.setDepth(6.4)
    shards.explode(38, 0, 0)
    // a fine dust that stays put where the curtain stood, so the break has a
    // location after the shards have gone
    const dust = this.add.particles(sx, sy, 'softdot', {
      speed: { min: 20, max: 220 },
      lifespan: { min: 500, max: 1200 },
      scale: { start: 0.55, end: 0.05 },
      alpha: { start: 0.5, end: 0 },
      tint: [0x6f6288, 0x9a8bb0],
      emitting: false,
    })
    dust.setDepth(6.3)
    dust.explode(18, 0, 0)
    this.time.delayedCall(1700, () => {
      shards.destroy()
      dust.destroy()
    })

    // 2. THE SHAFT OF LIGHT through the new hole. The curtain was what stood
    //    between the flock and the light behind it; the hole is the payoff,
    //    and it is what tells you at a glance that the way is open.
    this.lightThroughHole(sx, sy)

    // 3. contact: held time and a small kick, never a sustained shake
    this.hitStop = 0.08
    this.camKick = 3
    this.awardScore('breakthrough', 1, { x: o.x, y: o.y })
    this.cameras.main.zoomTo(1.02, 100, 'Sine.easeOut', true)
    this.time.delayedCall(200, () => this.cameras.main.zoomTo(1, 280, 'Sine.easeInOut', true))
    this.audio.brittleShatter()
    this.audio.collisionThump()
  }

  /**
   * Tear the curtain's own art into slabs and throw them. Cropping the real
   * sprite (rather than spawning generic debris) means the thing the player
   * was looking at is the thing that comes apart.
   */
  private shatterSprite(sprite: Phaser.GameObjects.Image, hx: number, hy: number, speed: number): void {
    const src = this.textures.get(sprite.texture.key).getSourceImage() as { width: number; height: number }
    const COLS = 3
    const ROWS = 3
    for (let cxi = 0; cxi < COLS; cxi++) {
      for (let cyi = 0; cyi < ROWS; cyi++) {
        const piece = this.add
          .image(sprite.x, sprite.y, sprite.texture.key)
          .setOrigin(sprite.originX, sprite.originY)
          .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
          .setFlipX(sprite.flipX)
          .setRotation(sprite.rotation)
          .setDepth(sprite.depth + 0.02)
        piece.setCrop(
          (cxi * src.width) / COLS,
          (cyi * src.height) / ROWS,
          src.width / COLS,
          src.height / ROWS,
        )
        // outward from the middle of the piece, biased along the heading, so
        // the curtain blows open the way the flock went through it
        const ox = (cxi - (COLS - 1) / 2) / COLS
        const oy = (cyi - (ROWS - 1) / 2) / ROWS
        const kick = 0.55 + Math.random() * 0.7
        const vx = hx * speed * 0.75 * kick + ox * 620 + (Math.random() - 0.5) * 120
        const vy = hy * speed * 0.6 * kick + oy * 520 + (Math.random() - 0.5) * 120
        this.tweens.add({
          targets: piece,
          x: { value: piece.x + vx * 0.85, ease: 'Quad.easeOut' },
          y: { value: piece.y + vy * 0.85 + 260, ease: 'Quad.easeIn' },
          rotation: piece.rotation + (Math.random() - 0.5) * 1.5,
          alpha: { value: 0, ease: 'Quad.easeIn' },
          duration: 620 + Math.random() * 340,
          onComplete: () => piece.destroy(),
        })
      }
    }
  }

  /** A shaft standing in the hole the flock just made. */
  private lightThroughHole(x: number, y: number): void {
    const shaft = this.add
      .image(x, y, 'vfade')
      .setTint(0xffe2b4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(6.2)
      .setAlpha(0)
      .setRotation(-0.28)
      .setDisplaySize(60, 40)
    this.tweens.add({
      targets: shaft,
      alpha: 0.62,
      displayWidth: 300,
      displayHeight: 560,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: shaft,
          alpha: 0,
          displayWidth: 380,
          duration: 1100,
          ease: 'Sine.easeIn',
          onComplete: () => shaft.destroy(),
        })
      },
    })
    // a bright core right in the gap, so the hole itself is the brightest point
    const core = this.add
      .image(x, y, 'softdot')
      .setTint(0xfff2da)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(6.25)
      .setAlpha(0.85)
      .setDisplaySize(90, 90)
    this.tweens.add({
      targets: core,
      displayWidth: 300,
      displayHeight: 300,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => core.destroy(),
    })
  }

  private updateRoostSwirl(dt: number, time: number): void {
    // this already skipped the SIM while the roost was far off, but the 30
    // sprites were still being transformed and drawn for the whole flight —
    // hide them on the edge rather than every frame
    const on = ROOST_X - this.scrollX <= VIEW_W + 500
    if (this.roostSwirlOn !== on) {
      this.roostSwirlOn = on
      for (const b of this.roostSwirl) b.sprite.setVisible(on)
    }
    if (!on) return
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
  /**
   * Safety net for birds that are hopelessly stuck, and nothing more.
   *
   * This predates the nightfall fog, which now OWNS "birds that trail get
   * taken" - with a visible strobe and fall. At 760px/3s the two competed, and
   * this one won silently: a trace found ~60 of 134 losses had no collision
   * and no fog take behind them, and headwind zones push many more birds into
   * that window. It only catches the truly abandoned now.
   */
  private cullStragglers(dt: number): void {
    for (const b of this.flock.birds) {
      if (this.flock.centerX - b.x > 1500) {
        const t = (this.stuckTime.get(b) ?? 0) + dt
        if (t > 6) {
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
        this.checkpoint = {
          x: lm.x,
          name: lm.name,
          count: this.flock.count,
          found: this.stats.found,
          flow: this.stats.flow,
          lost: this.stats.lost,
          collisionEvents: this.stats.collisionEvents,
          score: this.score.snapshot(),
        }
        if (lm.name) {
          this.showLandmark(`${lm.name} reached`)
          this.audio.landmarkTone(lm.name)
          this.audio.celebrationSwell(0.55)
        }
      }
    }
  }

  /**
   * A bird breaking out of a cage and streaking home. The join used to be
   * silent - the count went up and nothing moved - so freeing a cage read as
   * bookkeeping instead of a rescue.
   */
  private freedStreak(x: number, y: number): void {
    const bird = this.add
      .image(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60, 'bird-mid')
      .setScale(0.34)
      .setTint(0xfff0d4)
      .setDepth(6.2)
    const trail = this.add
      .image(bird.x, bird.y, 'streak')
      .setTint(0xffd9a0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(90, 10)
      .setAlpha(0.85)
      .setDepth(6.1)
    const tx = this.flock.centerX + (Math.random() - 0.5) * 120
    const ty = this.flock.centerY + (Math.random() - 0.5) * 100
    trail.setRotation(Math.atan2(ty - bird.y, tx - bird.x))
    this.tweens.add({
      targets: [bird, trail],
      x: tx,
      y: ty,
      duration: 420 + Math.random() * 180,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        bird.destroy()
        trail.destroy()
      },
    })
    this.tweens.add({ targets: trail, alpha: 0, displayWidth: 220, duration: 460 })
  }

  /**
   * THE CAGE GIVES WAY. The whole point of a cage is the moment it breaks, so
   * this gets the full treatment: a white flash, a shockwave, hit-stop, a
   * camera kick, and a callout naming what you just won.
   */
  private cageFreed(x: number, y: number): void {
    this.hitStop = Math.max(this.hitStop, 0.07)
    this.camKick = 2.4
    this.audio.celebrationSwell(0.7)

    const flash = this.add
      .image(x, y, 'softdot')
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(120, 120)
      .setDepth(7)
    this.tweens.add({
      targets: flash,
      displayWidth: 620,
      displayHeight: 620,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
    const ring = this.add
      .image(x, y, 'alarmring')
      .setTint(0xffe6bf)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(80, 80)
      .setAlpha(0.95)
      .setDepth(7)
    this.tweens.add({
      targets: ring,
      displayWidth: 520,
      displayHeight: 520,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
    const at = this.floatAt(x - this.scrollX, y - 70)
    const t = this.add
      .text(at.x, at.y, 'FREED', display(30, '#ffe6bf', 10, 500))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30)
    this.tweens.add({
      targets: t,
      y: at.y - 60,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.8, to: 1.15 },
      duration: 1400,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  // ---- THE RECKONING ------------------------------------------------------
  /** the verbs the player must answer with, in order; null when not reckoning */
  private reckonSeq: Array<'gather' | 'surge' | 'flare'> = []
  private reckonStep = 0
  private reckonOn = false
  private prevGatherForReckon = false
  private reckonText: Phaser.GameObjects.Text | null = null

  /**
   * The hawk hangs, the world crawls, and the flock's survival is put in the
   * player's hands for two and a half seconds.
   *
   * This is the game's one triumph, and it used to resolve automatically off a
   * hidden triple gate — so almost nobody ever saw it happen, and nobody who
   * did could tell they had caused it. The gate still decides whether the
   * chance is OFFERED (a small or ragged flock simply cannot make the shape,
   * which is the whole run's discipline being paid out); landing it is skill.
   */
  private beginReckoning(): void {
    this.reckonOn = true
    this.reckonRealT = 0
    this.reckonStep = 0
    // three verbs the player already owns, in a random order so it is read and
    // not memorised
    const pool: Array<'gather' | 'surge' | 'flare'> = ['gather', 'surge', 'flare']
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    this.reckonSeq = pool
    this.cameras.main.zoomTo(1.08, 420, 'Sine.easeOut', true)
    this.audio.strikeHeldNote?.()
    this.showReckonPrompt()
  }

  private reckonLabel(v: 'gather' | 'surge' | 'flare'): string {
    if (isTouch) return v === 'gather' ? 'HOLD GATHER' : v === 'surge' ? 'TAP GATHER' : 'TAP SPREAD'
    return v === 'gather' ? 'HOLD SPACE' : v === 'surge' ? 'TAP SPACE' : 'TAP SHIFT'
  }

  private showReckonPrompt(): void {
    const v = this.reckonSeq[this.reckonStep]
    if (!v) return
    const safe = safeArea(this)
    if (!this.reckonText) {
      this.reckonText = this.add
        .text(0, 0, '', display(40, '#ffe6bf', 10, 500))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(58)
    }
    this.reckonText
      .setText(this.reckonLabel(v))
      .setPosition(safe.x + safe.w / 2, safe.y + safe.h * 0.3)
      .setAlpha(1)
      .setScale(1.25)
    this.tweens.killTweensOf(this.reckonText)
    // it pulses, faster as the window runs down — the tell IS the urgency
    this.tweens.add({
      targets: this.reckonText,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    })
  }

  /** One verb answered during the reckoning. Wrong answers end it early. */
  private reckonInput(v: 'gather' | 'surge' | 'flare'): void {
    if (!this.reckonOn) return
    if (v !== this.reckonSeq[this.reckonStep]) {
      this.falcon.failReckoning()
      return
    }
    this.reckonStep++
    this.camKick = 1.4
    this.audio.formSnap('gather')
    if (this.reckonStep >= this.reckonSeq.length) {
      this.falcon.mobNow(this.flock)
    } else {
      this.showReckonPrompt()
    }
  }

  private endReckoning(won: boolean): void {
    this.reckonOn = false
    this.reckonSeq = []
    this.cameras.main.zoomTo(1, 520, 'Sine.easeInOut', true)
    if (this.reckonText) {
      this.tweens.add({ targets: this.reckonText, alpha: 0, duration: 260 })
    }
    if (won) {
      // the flock becomes the bigger bird — the hero image of the whole game
      this.flock.formShape('ring')
      this.hitStop = Math.max(this.hitStop, 0.12)
      this.camKick = 4
      this.showLandmark('THE FLOCK TURNS ON IT')
    } else {
      // missing costs almost everything: the hawk goes through an unguarded
      // flock, which is what makes the window matter
      this.hitStop = Math.max(this.hitStop, 0.1)
      this.camKick = 5
      this.showLandmark('IT BROKE THROUGH')
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
    // Snapshot the run BEFORE the respawn rolls the counters back to the
    // checkpoint. Read afterwards these are all checkpoint values, which is
    // why the fail screen could never have shown the run that actually
    // happened.
    this.failMetrics = {
      reached: Math.round(this.furthestReached()),
      found: this.stats.found,
      held: this.flock.count,
      started: this.stats.startCount,
      recovered: this.stats.recovered,
    }
    this.stats.resets++
    this.audio.failureFade()

    // ---- THE FLOCK IS LOST -------------------------------------------------
    // This was four particles per bird - a tasteful puff. It is the single most
    // dramatic thing that happens in the game and it should FLOOD THE SCREEN.
    // Three layers, so it reads as depth rather than as one emitter:
    //   1. the eruption itself, from every bird, thrown hard and wide
    //   2. a screen-space downpour that fills the whole frame
    //   3. a few huge feathers tumbling right past the lens
    const survivors = [...this.flock.birds]
    this.hitStop = Math.max(this.hitStop, 0.14)
    this.camKick = 4.2

    const cloud = this.add
      .particles(0, 0, 'feather', {
        speedX: { min: -420, max: 520 },
        speedY: { min: -560, max: 220 },
        lifespan: { min: 2200, max: 4600 },
        scale: { min: 0.35, max: 1.15 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 90,
        tint: [0x2a2440, 0x453a5e, 0x6b5f85, 0x8a7aa6],
        emitting: false,
      })
      .setDepth(8)

    // the whole sky fills with falling feathers, in screen space so it does
    // not matter where the flock happened to be
    const downpour = this.add
      .particles(0, 0, 'feather', {
        x: { min: -80, max: VIEW_W + 80 },
        y: { min: -260, max: -40 },
        speedX: { min: -90, max: 90 },
        speedY: { min: 90, max: 300 },
        lifespan: { min: 2600, max: 5200 },
        scale: { min: 0.3, max: 0.95 },
        alpha: { start: 0.95, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 60,
        tint: [0x2a2440, 0x453a5e, 0x6b5f85],
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(49)

    // and a few enormous ones drifting past the lens, for depth
    const closeUp = this.add
      .particles(0, 0, 'feather', {
        x: { min: 0, max: VIEW_W },
        y: { min: -300, max: 0 },
        speedX: { min: -40, max: 40 },
        speedY: { min: 160, max: 300 },
        lifespan: 4200,
        scale: { min: 2.2, max: 3.6 },
        alpha: { start: 0.5, end: 0 },
        rotate: { min: 0, max: 360 },
        gravityY: 30,
        tint: [0x241d38, 0x352c4e],
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(50)

    for (const b of survivors) {
      cloud.emitParticleAt(b.x, b.y, 14)
      this.scatter.spawn(b.x, b.y, b.x - this.flock.centerX, b.y - this.flock.centerY - 40)
      this.flock.removeBird(b)
    }
    // the downpour arrives in waves so the screen keeps filling rather than
    // emptying out after one burst
    downpour.emitParticle(150)
    closeUp.emitParticle(5)
    for (let i = 1; i <= 5; i++) {
      this.time.delayedCall(i * 260, () => {
        downpour.emitParticle(110)
        if (i % 2 === 0) closeUp.emitParticle(4)
      })
    }
    this.time.delayedCall(7000, () => {
      cloud.destroy()
      downpour.destroy()
      closeUp.destroy()
    })
    // 2) colour drains toward dusk, then the message
    this.promptText.setAlpha(0)
    this.landmarkText.setAlpha(0)
    this.prompt = null
    this.promptQueue.length = 0
    this.tweens.add({ targets: this.duskOverlay, alpha: 0.55, duration: 1400 })
    this.tweens.add({ targets: this.fadeRect, alpha: 0.85, duration: 1700, delay: 500 })
    // RETRY SPEED. Measured, this sequence was 1500ms before any text, then
    // 4300ms before respawn, then 1150ms of forced pause - 5.45 seconds of
    // non-interactive time ending in a teleport, which is the single biggest
    // anti-retry feature in the build. Super Meat Boy restarts in ~0.5s and
    // Celeste under 1s, and both credit that for failure feeling fair rather
    // than punishing.
    //
    // The FIRST failure at a checkpoint keeps the full ceremony, because the
    // first time you lose the flock should land. Every repeat at the SAME
    // checkpoint is compressed hard: you already know what happened, and what
    // you want is to be flying again.
    // RETRY SPEED, resolved. Naming the loss is what makes difficulty read as
    // fair; a card between the player and the retry is the strongest possible
    // anti-retry feature. Both are true, so they are split by which loss this
    // is. The FIRST loss at a landmark gets the whole story and waits for the
    // player's own press — their press is what makes the continuity theirs
    // rather than something the game did to them. Every REPEAT at the same
    // landmark skips the card entirely and is flying again inside a second,
    // because you already know what happened and what you want is to be back
    // in the air. This is the Super Meat Boy / Celeste contract.
    const repeat = this.failsHere >= 1
    const tText = repeat ? 0 : 1200
    const tBack = repeat ? 700 : 0 // 0 = wait for input instead of a timer
    const tHold = repeat ? 100 : 420
    this.time.delayedCall(tText, () => {
      const cx = VIEW_W / 2
      const name = this.checkpoint.name || 'the morning sky'
      const mk = (y: number, txt: string, size: number, color: string, ls = 0) =>
        this.add
          .text(cx, y, txt, ls >= 3 ? display(size, color, ls, 300) : voice(size, color))
          .setOrigin(0.5)
          .setAlpha(0)
          .setScrollFactor(0)
          .setDepth(52)
      const m = this.failMetrics
      this.failTexts = [
        mk(304, 'THE FLOCK SCATTERED', 34, '#f2e4d5', 8),
        // NAME THE CAUSE. lossCause() already knew - 'the dark took them',
        // 'struck the stone', 'the falcon struck' - and this screen threw it
        // all away for a generic line, so players could not tell what had
        // happened, or whether the game was even over. Attribution is the
        // difference between difficulty that reads as fair and difficulty that
        // reads as arbitrary.
        mk(358, this.lastLossSource || 'Too few birds remained together.', 17, '#e8c9b8'),
        // THE RUN, in four numbers. Not a results screen — just enough to
        // understand what this attempt was, at the one moment the player most
        // wants to know. Shown only on a first loss; a repeat never sees it.
        mk(430, `${m.held} of ${m.started} still flying · ${m.found} lights gathered`, 16, '#cfc0d8'),
        mk(456, `${(m.reached / 1000).toFixed(1)}k of ${(ROOST_X / 1000).toFixed(1)}k flown${m.recovered ? ` · ${m.recovered} called back` : ''}`, 16, '#cfc0d8'),
        mk(516, `Returning to ${name}`, 20, '#dccce0', 2),
        mk(548, `${Math.max(this.checkpoint.count, 60)} BIRDS WILL FLY AGAIN`, 24, '#f2e8f5', 3),
      ]
      this.tweens.add({ targets: this.failTexts, alpha: 0.95, duration: 700 })
      if (!repeat) {
        const go = this.add
          .text(VIEW_W / 2, 622, isTouch ? 'TAP TO FLY AGAIN' : 'PRESS ANY KEY TO FLY AGAIN', display(18, '#f2e8f5', 5, 300))
          .setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(52)
        this.failTexts.push(go)
        // it breathes, so it never reads as a static label the player might
        // sit and wait behind
        this.tweens.add({ targets: go, alpha: 0.9, duration: 600, delay: 400 })
        this.tweens.add({ targets: go, alpha: 0.45, duration: 1100, delay: 1000, yoyo: true, repeat: -1 })
        this.time.delayedCall(500, () => {
          if (!this.retryGo) return
          this.input.once('pointerdown', () => this.retryGo?.())
          this.input.keyboard?.once('keydown', () => this.retryGo?.())
        })
      }
    })
    // 3) restart from the landmark
    const back = (): void => {
      this.retryGo = null
      this.retryFallbackT = 0
      this.respawnAtCheckpoint()
      // the world must be VISIBLE before it is dangerous again
      this.paused = true
      this.time.delayedCall(tHold, () => {
        this.paused = false
      })
      if (this.checkpoint.name) this.audio.landmarkTone(this.checkpoint.name)
      for (const t of this.failTexts) t.destroy()
      this.failTexts = []
      // the dark is pushed back to its standoff on a checkpoint restore, so a
      // retry is a real reprieve rather than resuming inside the fog
      this.night.reset(this.checkpoint.x)
      this.tweens.add({ targets: [this.fadeRect, this.duskOverlay], alpha: 0, duration: 1100, delay: 150 })
      this.audio.failureRecover()
      this.failing = false
    }
    if (repeat) {
      this.time.delayedCall(tBack, back)
    } else {
      this.retryGo = back
      // Never trap the player behind a press. A Phaser timer cannot be trusted
      // here — under a driven update loop it may not advance at all, which is
      // exactly how a card once hung the world forever — so the escape hatch
      // runs on the sim clock, which always ticks.
      this.retryFallbackT = 40
    }
  }

  /** Waiting on the player's press to return to the checkpoint. */
  private retryGo: (() => void) | null = null
  private retryFallbackT = 0
  private failMetrics = { reached: 0, found: 0, held: 0, started: 0, recovered: 0 }

  /** How far right the flock ever actually got, for the fail screen's tally.
   * Tracked here rather than read off the fog, because the fog's own furthest
   * mark is its anchor and is not ours to reach into. */
  private furthestX = 0

  private furthestReached(): number {
    this.furthestX = Math.max(this.furthestX, this.flock.centerX)
    return this.furthestX
  }

  private failsHere = 0
  private lastFailX = -1

  private respawnAtCheckpoint(): void {
    const cp = this.checkpoint
    // repeated failure at the same landmark earns real help, never a silent
    // difficulty nerf: more birds back, and the terrain that beat you is
    // pointed out explicitly
    if (Math.abs(cp.x - this.lastFailX) < 40) this.failsHere++
    else this.failsHere = 1
    this.lastFailX = cp.x
    this.scrollX = Math.max(cp.x - VIEW_W * 0.35, 0)
    this.cameras.main.scrollX = this.scrollX
    this.scatter.clear()
    this.lastHit.clear()
    this.brittleCharge.clear()
    this.stuckTime.clear()
    const targetCount = Math.max(cp.count, 60 + (this.failsHere - 1) * 18)
    while (this.flock.count > targetCount) this.flock.removeBird(this.flock.birds[this.flock.birds.length - 1])
    // Bounded, not `while (count < target)`. spawnBird can now refuse at the
    // flock ceiling, and a refusal inside an unbounded loop is an infinite one
    // — the tab would hang on a checkpoint restore rather than fail visibly.
    for (let i = this.flock.count; i < targetCount; i++) {
      if (!this.flock.spawnBird(cp.x + rand(-120, 120), 430 + rand(-80, 80))) break
    }
    // THE RETURN MUST FLY. Teleporting the flock into position is most of why
    // a restart read as a save-state reload rather than as the story
    // continuing: the birds simply existed again, in formation, facing right.
    // They now come in from off the left edge under their own power and gather
    // as they arrive, so the checkpoint is a place the flock flies BACK to.
    //
    // The camera's left edge is at cp.x - VIEW_W * 0.35, so spawning behind
    // that keeps every bird off-screen at frame one — the player sees empty
    // sky, then a flock arriving into it, which is the whole point.
    const gateX = this.scrollX
    let i = 0
    for (const b of this.flock.birds) {
      // a ragged column rather than a wall, so they arrive over about a second
      // instead of crossing the edge as one line
      b.x = gateX - 220 - (i % 7) * 90 - rand(0, 260)
      b.y = 430 + rand(-150, 150)
      // fast enough to catch up to the checkpoint quickly, and varied so the
      // column stretches and closes the way a real flock does
      b.vx = rand(330, 430)
      b.vy = rand(-20, 20)
      i++
    }
    // they steer toward the landmark itself, so the gather happens where the
    // player is about to need it
    this.flock.intentX = cp.x + 120
    this.flock.intentY = 430
    this.stats.found = cp.found
    this.stats.flow = cp.flow
    // roll the loss counters back too — otherwise a restart permanently
    // skews the FLOW feather's collision cap and the results breakdown
    this.stats.lost = cp.lost
    this.stats.collisionEvents = cp.collisionEvents
    this.score.restore(cp.score)
    this.scoreShown = this.score.mastery
    this.scoreText.setText(`×${this.scoreShown.toFixed(1)}`)
    this.callCooldown = 0
    this.callTimer = 0
    this.promptQueue.length = 0
    this.prompt = null
    this.promptText.setAlpha(0)
    if (this.failsHere >= 2) {
      this.shownPrompts.delete('help')
      this.time.delayedCall(1200, () =>
        this.showPrompt(
          'help',
          isTouch
            ? 'hold GATHER through tight stone — a tight flock survives it'
            : 'hold SPACE through tight stone — a tight flock survives it',
          () => this.flock.gatherStrain > 0.15,
        ),
      )
    }
    // a rewind un-breaks pieces, which changes the visible set with no camera
    // movement — same reason the shatter path marks it
    this.visDirty = true
    for (const z of this.openingZones) if (z.x > cp.x) z.state = 'idle'
    // reset flow gates and motes ahead of the checkpoint
    for (const [f, g] of this.flowGates) if (f.x > cp.x) { g.state = 'idle'; g.clean = true }
    // un-take the light ahead of the checkpoint; the cull decides on the next
    // frame whether it is actually in frame yet
    for (const m of this.motes) if (m.x > cp.x) m.taken = false
    for (const s of this.strays) {
      if (s.def.x > cp.x) s.group.reset(s.def.count)
    }
    this.falcon.reset(cp.x)
    this.predatorDimTarget = 0
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
      // the shatter hides the art rather than fading it, so the rewind has to
      // put it BACK on screen, not just back to full alpha
      if (restored) sprite.setVisible(true).setAlpha(f.alpha ?? 1)
    }
  }

  private turnedAway = false
  private resultsSent = false
  /** birds the homecoming adds for spectacle — never counted as YOUR flock */
  private homecomingJoiners = 0
  private leader: Bird | null = null
  private leaderGlow!: Phaser.GameObjects.Image
  private leaderMourn = 0

  /** Crown the strongest flier as a visible vanguard. Judges bond with
   * individuals, not clouds — and her loss is felt, never punished. */
  private updateLeader(dt: number): void {
    if (this.leaderMourn > 0) this.leaderMourn -= dt
    if (!this.leader || !this.leader.alive) {
      if (this.leader) {
        // she was lost: the wing bed thins and no one leads for a while
        this.leader = null
        this.leaderMourn = 8
        this.leaderGlow.setAlpha(0)
        this.audio.setThin(true)
        this.time.delayedCall(2600, () => this.audio.setThin(false))
      }
      if (this.leaderMourn <= 0 && this.flock.count > 4) {
        let best: Bird | null = null
        let bestScore = -1
        for (const b of this.flock.birds) {
          const sc = b.speedFactor * b.intentResponse
          if (sc > bestScore) {
            bestScore = sc
            best = b
          }
        }
        this.leader = best
        if (this.leader) {
          this.leader.sprite.setScale(this.leader.sprite.scale * 1.22)
          this.audio.chime(587, 0)
          this.showPrompt('leader', 'she leads', () => true)
        }
      }
    }
    if (this.leader && this.leader.alive) {
      this.leaderGlow.setPosition(this.leader.x, this.leader.y).setAlpha(0.3)
      // a crisper flock while she flies — a bonus, never a penalty when gone
      this.flock.leaderAura = 1
    } else {
      this.flock.leaderAura = 0
    }
  }

  private paused = false

  // ---- first-encounter cards -------------------------------------------
  /** the card currently showing, if any */
  private card: Phaser.GameObjects.Container | null = null
  private cardEase = 0
  private cardAutoT = 0
  private cardDismiss: (() => void) | null = null
  private reckonEase = 0
  private reckonRealT = 0
  private cardsShown = new Set<string>()
  private cardCooldown = 0

  /**
   * Teach one thing, once, at the moment it first matters.
   *
   * The world eases to ~18% speed instead of freezing - the flock keeps
   * flying, so the moment stays alive while you read - and ANY input dismisses
   * it. It never returns. This is the introduction the game was missing: moves
   * arrive one at a time as the world asks for them, rather than all at once
   * on a title card nobody reads.
   */
  private showCard(id: string, title: string, body: string): void {
    if (this.cardsShown.has(id) || this.card || this.cardCooldown > 0) return
    if (this.finishing || this.failing) return
    this.cardsShown.add(id)
    const safe = safeArea(this)
    const cx = safe.x + safe.w / 2
    const cy = safe.y + safe.h * 0.34
    const w = Math.min(720, safe.w - 80)

    const plate = this.add.graphics()
    plate.fillStyle(0x140d24, 0.93)
    plate.fillRoundedRect(-w / 2, -86, w, 172, 20)
    plate.lineStyle(2, 0xf0cf9a, 0.75)
    plate.strokeRoundedRect(-w / 2, -86, w, 172, 20)

    const t1 = this.add.text(0, -44, title, display(24, '#ffe6bf', 8, 400)).setOrigin(0.5)
    const t2 = this.add.text(0, 6, body, voice(21, '#f2e8f5')).setOrigin(0.5)
    t2.setWordWrapWidth(w - 76)
    const t3 = this.add.text(0, 62, isTouch ? 'tap to continue' : 'press any key to continue', display(13, INK.soft, 4, 300)).setOrigin(0.5)

    const c = this.add.container(cx, cy, [plate, t1, t2, t3])
      .setScrollFactor(0).setDepth(60).setAlpha(0)
    c.setScale(0.94)
    this.card = c
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.audio.landmarkTone?.(title)

    const dismiss = (): void => {
      if (this.card !== c) return
      this.cardAutoT = 0
      this.cardDismiss = null
      this.card = null
      this.cardCooldown = 2.5
      this.input.off('pointerdown', dismiss)
      this.input.keyboard?.off('keydown', dismiss)
      this.tweens.add({ targets: c, alpha: 0, scale: 0.96, duration: 200, onComplete: () => c.destroy() })
    }
    this.cardDismiss = dismiss
    // a beat of grace so the click that caused the encounter does not eat it
    this.time.delayedCall(360, () => {
      if (this.card !== c) return
      this.input.once('pointerdown', dismiss)
      this.input.keyboard?.once('keydown', dismiss)
    })
    // Never trap the player. This used to rely on a Phaser timer, which does
    // not advance under a driven update loop - so a card could stay open
    // forever, holding the world at 18% speed. The sim clock always advances,
    // so the escape hatch always fires.
    this.cardAutoT = 9
  }

  /** Close whatever card is open, from anywhere. */
  private dismissCard(): void {
    this.cardDismiss?.()
  }

  /** Fire each lesson the first time the world actually asks for it. */
  private updateCards(dt: number): void {
    this.cardCooldown = Math.max(0, this.cardCooldown - dt)
    if (this.card || this.cardCooldown > 0) return
    const fx = this.flock.centerX

    // each gate must be SKIPPED once its card has been seen - otherwise the
    // first one keeps matching and returning, and nothing after it ever fires
    if (!this.cardsShown.has('steer') && fx > 520) {
      this.showCard('steer', 'THE FLOCK FOLLOWS YOU',
        isTouch ? 'Drag the sky and they follow. Bring them home before nightfall.'
                : 'Move the mouse and they follow. Bring them home before nightfall.')
      return
    }
    // light, just before the first arc
    if (!this.cardsShown.has('light')) for (const m of this.motes) {
      // `!taken`, not `visible` — the card looks up to 900px AHEAD, which is
      // now often beyond the cull line, and "off screen" is not "collected"
      if (!m.taken && m.x - fx > 0 && m.x - fx < 900) {
        this.showCard('light', 'GATHER THE LIGHT',
          isTouch ? 'Light holds back the dark. Hold SPREAD to widen the flock and sweep more of it in.'
                  : 'Light holds back the dark. Hold SHIFT to spread wide and sweep more of it in.')
        return
      }
    }
    // the dark, once it is actually visible behind you
    if (!this.cardsShown.has('dark') && this.night.encroach > 0.12) {
      this.showCard('dark', 'THE DARK IS COMING',
        isTouch ? 'It takes birds that fall behind. Hold GATHER to keep them tight, and CALL to bring back the lost.'
                : 'It takes birds that fall behind. Hold SPACE to keep them tight, and press C to call back the lost.')
      return
    }
    // a breakable, when one is close enough to matter
    if (!this.cardsShown.has('brittle')) for (const [f, sprite] of this.featureSprites) {
      if (!f.brittle) continue
      const d = f.x - fx
      if (d > 0 && d < 950 && Math.abs(sprite.y - this.flock.centerY) < 340) {
        this.showCard('brittle', 'SOME THINGS BREAK',
          isTouch ? 'Cold light running through it means it will shatter. Tap GATHER to SURGE through.'
                  : 'Cold light running through it means it will shatter. Tap SPACE to SURGE through.')
        return
      }
    }
    // a cage of birds waiting to be freed
    if (!this.cardsShown.has('cage')) for (const s of this.strays) {
      const d = s.def.x - fx
      if (!s.group.depleted && d > 0 && d < 900) {
        this.showCard('cage', 'BIRDS ARE HELD HERE',
          'Free them and they join the flock. Fly close, or SURGE into the cage to break it open.')
        return
      }
    }
  }
  private muted = false
  private pauseVeil: Phaser.GameObjects.Container | null = null

  /** Brace = hold SPACE+SHIFT. The chord outranks both formations: while it is
   * engaged neither is passed to the flock, and the release edges are consumed
   * so letting go never fires Surge and Flare on the way out. */
  private updateBrace(rawDt: number): void {
    this.braceCool = Math.max(0, this.braceCool - rawDt)
    const chord =
      !this.finishing && !this.failing && ((this.keySpace.isDown && this.keyShift.isDown) || this.touch.brace)
    if (chord && this.braceCool <= 0) {
      this.braceHeld += rawDt
      const live = this.braceHeld > BRACE_CHORD_DELAY && this.braceHeld < BRACE_CHORD_DELAY + BRACE_MAX_TIME
      if (live && !this.braceOn) {
        this.braceOn = true
        this.braceConsumed = true
        this.flock.setBrace(true)
        this.audio.braceTone(true)
        this.showPrompt('brace', '', () => !this.braceOn)
      } else if (!live && this.braceOn) {
        this.endBrace()
      }
    } else {
      this.braceHeld = 0
      if (this.braceOn) this.endBrace()
    }
  }

  private endBrace(): void {
    this.braceOn = false
    this.braceCool = BRACE_COOLDOWN
    this.flock.setBrace(false)
    this.audio.braceTone(false)
  }

  /** A wind of >= 2*PI in ONE direction, at a real radius, spins the column up.
   * The centre is a rolling average of recent pointer travel, so the gesture
   * works anywhere on screen and slow steering drift never accumulates. */
  private detectVortexGesture(dt: number, px: number, py: number): void {
    this.gestureCool = Math.max(0, this.gestureCool - dt)
    const k = 1 - Math.exp(-GESTURE_CENTRE_RATE * dt)
    this.gestureCx += (px - this.gestureCx) * k
    this.gestureCy += (py - this.gestureCy) * k
    const dx = px - this.gestureCx
    const dy = py - this.gestureCy
    if (Math.hypot(dx, dy) < GESTURE_MIN_RADIUS) {
      this.gestureArmed = false
      this.gestureWound = 0
      return
    }
    const a = Math.atan2(dy, dx)
    if (!this.gestureArmed) {
      this.gestureArmed = true
      this.gestureAngle = a
      return
    }
    let da = a - this.gestureAngle
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    this.gestureAngle = a
    // one continuous direction only: a reversal restarts the wind
    if (this.gestureWound !== 0 && da !== 0 && Math.sign(da) !== Math.sign(this.gestureWound)) {
      this.gestureWound = 0
    }
    this.gestureWound = (this.gestureWound + da) * Math.exp(-GESTURE_UNWIND * dt)
    if (Math.abs(this.gestureWound) >= Math.PI * 2 && this.gestureCool <= 0 && !this.finishing && !this.failing) {
      this.doVortex(this.gestureWound < 0 ? -1 : 1)
      this.gestureWound = 0
      this.gestureArmed = false
      this.gestureCool = GESTURE_COOLDOWN
    }
  }

  /** Vortex Whirl: the flock winds into a rotating column that hoovers. */
  private doVortex(dir: number): void {
    this.flock.enterVortex(dir, 1)
    this.audio.surgeWhoosh(0.55)
    this.audio.formSnap('gather')
    const ring = this.add
      .image(this.flock.centerX, this.flock.centerY, 'softdot')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffd9a0)
      .setAlpha(0.5)
      .setDisplaySize(160, 160)
      .setDepth(6)
    this.tweens.add({
      targets: ring,
      displayWidth: 620,
      displayHeight: 620,
      alpha: 0,
      angle: dir * 420,
      duration: 1300,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    })
    // the column hoovers: reuse the Echo Call recovery reach while it spins
    this.callTimer = Math.max(this.callTimer, 1.6)
    this.showPrompt('vortex', '', () => this.flock.vortex <= 0)
  }

  private togglePause(): void {
    this.setPaused(!this.paused)
  }

  private setPaused(on: boolean): void {
    if (on === this.paused || this.failing) return
    this.paused = on
    this.audio.setMuted(on || this.muted) // a paused world is a silent one
    if (on) {
      const veil = this.add.container(0, 0).setScrollFactor(0).setDepth(60)
      veil.add(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0f0c22, 0.62).setOrigin(0))
      veil.add(this.add.text(VIEW_W / 2, VIEW_H / 2 - 24, 'PAUSED', display(30, INK.bright, 12, 300)).setOrigin(0.5))
      veil.add(
        this.add
          .text(VIEW_W / 2, VIEW_H / 2 + 26, 'P to fly on · M mute · R restart the day', voice(18, INK.soft))
          .setOrigin(0.5),
      )
      this.pauseVeil = veil
    } else {
      this.pauseVeil?.destroy()
      this.pauseVeil = null
    }
  }

  /** Small corner acknowledgement for chrome actions (mute, etc). */
  private showChromeToast(text: string): void {
    const t = this.add
      .text(VIEW_W / 2, VIEW_H - 60, text, display(15, INK.soft, 4, 300))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(60)
      .setAlpha(0)
    this.tweens.add({ targets: t, alpha: 0.9, duration: 220, yoyo: true, hold: 900, onComplete: () => t.destroy() })
  }

  private perched: Phaser.GameObjects.Image[] = []
  private departureBirds: Phaser.GameObjects.Image[] = []

  /** Dawn bookend: the flock is asleep in a roadside roost and lifts off in
   * ones and twos as the day begins. Control is live throughout — the player
   * is already steering the forming flock, so there is no dead cinematic. */
  /**
   * ROUTE LIGHT — the game's one honest answer to "over it or through it?".
   *
   * For every place the world narrows, we ask the COLLIDER FIELD (never the
   * paintings) which vertical spans are actually flyable, and hang a soft
   * warm light with a few drifting motes in each one. Because it is derived
   * from collision it can never lie, and it marks the gaps BETWEEN pieces —
   * usually the real routes — which per-piece art data never could.
   */
  private placeRouteLights(): void {
    const xs = [...new Set(FEATURES.map((f) => Math.round(f.x)))].sort((a, b) => a - b)
    for (const x of xs) {
      // Sample ACROSS the piece, not just down its centreline: a ruin is often
      // broken open exactly at its middle, and the route that matters is the
      // narrowest slice the flock must actually thread.
      let gaps: Array<{ y0: number; y1: number }> = []
      let tightest = Infinity
      const lightX = x
      for (const dx of [-140, -70, 0, 70, 140]) {
        const sx = x + dx
        const blocking = this.obstacles.some(
          (o) => o.kind === 'solid' && Math.abs(o.x - sx) < (o.shape === 'circle' ? o.r : o.hw),
        )
        if (!blocking) continue
        const g = passableGaps(sx, this.obstacles)
        const open = g.reduce((sum, s2) => sum + (s2.y1 - s2.y0), 0)
        if (open < tightest) {
          tightest = open
          gaps = g
        }
      }
      // open sky, or a piece with no real constriction, needs no signage
      if (!gaps.length || tightest > SKY_BOTTOM - SKY_TOP - 60) continue
      for (const g of gaps) {
        const h = g.y1 - g.y0
        const cy = (g.y0 + g.y1) / 2
        if (cy > SKY_BOTTOM - 30) continue
        // the light itself: wide, soft, and quiet — a suggestion, not a sign
        const glow = this.add
          .image(lightX, cy, 'softdot')
          .setTint(0xffd2a0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDisplaySize(Math.min(230, h * 1.25), Math.min(360, h * 1.05))
          .setAlpha(0.17)
          .setDepth(2.6)
        // The breathe used to be a repeating tween per glow — and there is one
        // glow per gap per narrowing, which scales with the level rather than
        // being a fixed cost. Together with the drift below they were most of
        // the ~400 live tweens standing in the scheduler at all times. A
        // yoyoing Sine.easeInOut IS a raised cosine, so driving it off the sim
        // clock is not an approximation: it is the same curve, with the tween
        // object deleted. Random phase keeps them from breathing in unison.
        this.routeGlows.push({
          img: glow,
          amp: decorScale >= 1 ? 0.11 : 0,
          per: (2 * (2200 + Math.random() * 1200)) / 1000,
          ph: Math.random() * 8,
        })
        // motes drifting THROUGH the gap: the route reads as a current
        const n = Math.max(1, Math.round((h > 260 ? 4 : 3) * decorScale))
        for (let i = 0; i < n; i++) {
          const m = this.add
            .image(lightX + rand(-60, 60), g.y0 + (h * (i + 0.5)) / n + rand(-16, 16), 'softdot')
            .setTint(0xffe3bd)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDisplaySize(13, 13)
            .setAlpha(0.62)
            .setDepth(2.7)
          // ~190 of these drift motes exist across the level, each formerly
          // holding its own endlessly-repeating tween. The motion is a linear
          // slide with a linear fade on a fixed cycle, which is two lines of
          // arithmetic off the clock — and unlike a tween it costs nothing at
          // all while the gap is off screen (see updateDecor).
          const dur = (2600 + Math.random() * 1600) / 1000
          this.routeDrift.push({
            img: m,
            x0: m.x,
            travel: rand(70, 130),
            dur,
            per: dur + Math.random() * 0.9,
            ph: Math.random() * 2.2,
          })
        }
      }
    }
  }

  /** Faint spectral bird-streams along the historic route — the flocks that
   * came before. They mark the generous lines through each act. */
  /** Wind Heights becomes a storm: the sky darkens, wisps race, and the
   * gusts bite — the act earns its name instead of being a modifier. */
  private storm = 0
  private stormVeil!: Phaser.GameObjects.Rectangle
  private updateStorm(dt: number): void {
    const inStorm = this.scrollX > 11800 && this.scrollX < 14900
    this.storm = Phaser.Math.Clamp(this.storm + (inStorm ? dt : -dt) * 0.55, 0, 1)
    if (this.storm <= 0 && this.stormVeil.alpha === 0) return
    this.stormVeil.setAlpha(this.storm * 0.3)
    if (this.storm > 0.25) {
      // the flock is buffeted: readable pressure, never invisible damage
      const gust = Math.sin(this.simClock * 1.7) * Math.sin(this.simClock * 0.6)
      for (const b of this.flock.birds) b.vy += gust * 46 * this.storm * dt * 60 * 0.016
      this.audio.setStormy(this.storm)
    }
  }

  private placeGhostFlyways(): void {
    const routes: Array<[number, number, number]> = [
      [2300, 300, 520],
      [7000, 430, 900],
      [12600, 250, 640],
      [18600, 520, 700],
      [24400, 360, 820],
    ]
    for (const [x, y, len] of routes) {
      const ghostN = Math.max(5, Math.round(14 * decorScale))
      for (let i = 0; i < ghostN; i++) {
        const t = i / (ghostN - 1)
        const gx = x + len * t
        const gy = y + Math.sin(t * Math.PI * 1.4) * 46
        const g = this.add
          .image(gx, gy, 'bird-mid')
          .setScale(0.1 + Math.random() * 0.04)
          .setAlpha(0)
          .setTint(0xd9cff0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(1.8)
        // ~70 ghosts, ~70 forever-repeating tweens, and every one of them off
        // screen for all but a couple of seconds of a 25,000px flight. Same
        // raised-cosine identity as the route glows; `delay` becomes a start
        // offset so the stream still wakes up bird by bird along the route.
        const dur = (1400 + Math.random() * 900) / 1000
        this.ghostBirds.push({
          img: g,
          peak: 0.16 + Math.random() * 0.1,
          per: dur * 2,
          delay: (i * 90) / 1000,
        })
      }
    }
  }

  /**
   * THE DEPARTURE — the flock leaves the roost, and it is the flock.
   *
   * What was here spawned fourteen decorative sprites that faded out and were
   * destroyed while the real flock was already airborne beside them, so it read
   * as "some birds leave a tree", not as "we are setting out". Now the actual
   * birds are held on the branches and released in waves, which means the
   * number that lifts off is exactly the number on the HUD.
   *
   * Style: no new visual language. The same painted roost, the same navy
   * silhouettes, the same warm dusk. The drama is in staging and timing -
   * stillness, then one bird, then a cascade - not in effects.
   */
  private beginDeparture(): void {
    const key = this.textures.exists('roost_unlit')
      ? 'roost_unlit'
      : this.textures.exists('roost_tree_hero')
        ? 'roost_tree_hero'
        : 'roost_tree'
    if (!this.textures.exists(key)) return

    const th = 620
    const art = ART[key] ?? { w: 764, h: 1010 }
    const treeW = (art.w / art.h) * th
    const treeX = 250
    const tree = this.add
      .image(treeX, GROUND + 18, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(treeW, th)
      .setDepth(2)
    // ground mist so the trunk sits IN the world rather than on top of it
    this.add
      .image(treeX, GROUND - 6, 'softdot')
      .setTint(0x6a5c86)
      .setDisplaySize(treeW * 1.25, 150)
      .setAlpha(0.3)
      .setDepth(2.4)

    // The camera starts close on the roost and eases out to flight framing, so
    // control arrives mid-takeoff rather than after a cutaway.
    const cam = this.cameras.main
    cam.setZoom(1.22)
    this.tweens.add({ targets: cam, zoom: 1, duration: 3400, ease: 'Sine.easeInOut' })

    // Hold the WHOLE flock on the branches. Waves are staggered so the tree
    // empties in a cascade, and the last bird leaves about two seconds in.
    const crownY = GROUND + 18 - th * 0.62
    const birds = this.flock.birds
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      // seat them across the crown, denser toward the middle
      const t = i / Math.max(1, birds.length - 1)
      const spread = (Math.random() - 0.5) * treeW * 0.74
      const px = treeX + spread
      const py = crownY + Math.sin(t * Math.PI) * -60 + (Math.random() - 0.5) * 150
      // waves of roughly eight, 0.11s apart, after a half-second of stillness
      const wave = Math.floor(i / 8)
      this.flock.perch(b, px, py, 0.55 + wave * 0.11 + Math.random() * 0.05)
    }

    // the flock's intention starts out over open air, so the moment they are
    // released they are already going somewhere
    this.flock.intentX = treeX + 620
    this.flock.intentY = 430

    // one wingbeat swell as the tree empties, and the day card holds until the
    // cascade is underway so the two never compete
    this.audio.formSnap('gather')
    this.time.delayedCall(560, () => this.audio.celebrationSwell(0.4))
  }



  /** The day's closing bookend: the camera eases in on the roost while the
   * flock settles into its branches, bird by bird. */
  /**
   * How the day ended. Computed once when the roost is reached, and it must be
   * readable with the sound off in a single frame — is the tree lit or in fog,
   * and are the birds ON the branches or circling above them.
   */
  private arrivalGrade: 'golden' | 'harried' | 'hunted' = 'golden'

  private gradeArrival(): void {
    const day = this.night.daylight
    const behind = this.flock.centerX - this.night.edgeX
    const held = this.flock.count / Math.max(1, this.stats.startCount)
    if (day < 0.25 || behind < 380) this.arrivalGrade = 'hunted'
    else if (day >= 0.55 && behind > 900 && held >= 0.7) this.arrivalGrade = 'golden'
    else this.arrivalGrade = 'harried'
  }

  private runArrivalCeremony(dt: number): void {
    void dt
    const cam = this.cameras.main
    const t = this.finishTimer
    // the HUD steps aside for the ceremony (and a zoomed camera would clip it)
    if (t > 0.4 && this.countText.alpha > 0) {
      this.tweens.add({
        // countText's alpha is the HUD's master fade: drawHud multiplies every
        // engraved piece by it, so the ribbon and the dial leave together
        // instead of being re-lit by the next frame's redraw.
        targets: [this.countText, this.scoreText, this.streakText, this.scatteredText, this.recoveredText, this.deltaText],
        alpha: 0,
        duration: 700,
      })
    }
    // ease the camera in on the roost (never a hard cut)
    const zoom = 1 + Math.min(1, Math.max(0, (t - 1.2) / 5)) * 0.26
    cam.setZoom(Phaser.Math.Linear(cam.zoom, zoom, 0.04))
    // birds land: one settles roughly every 0.12s once the flock is home
    if (t > 2.2 && this.textures.exists('perched_a')) {
      // Perch what you ACTUALLY brought home, not a hard-coded 26 — the tally
      // told in birds before a single number appears. A hunted flock cannot
      // settle at all: it circles the covered tree.
      const canLand =
        this.arrivalGrade === 'hunted'
          ? 0
          : this.arrivalGrade === 'harried'
            ? Math.floor(this.flock.count * 0.66)
            : this.flock.count
      const want = Math.min(Math.min(44, canLand), Math.floor((t - 2.2) / 0.1))
      while (this.perched.length < want) {
        const i = this.perched.length
        const key = ['perched_a', 'perched_b', 'perched_c', 'perched_sleep'][i % 4]
        const art = ART[key]
        const h = 26 + Math.random() * 8
        const px = ROOST_X + rand(-230, 230)
        const py = 470 + Math.random() * 210
        const img = this.add
          .image(px, py - 40, key)
          .setDisplaySize((art.w / art.h) * h, h)
          .setFlipX(Math.random() < 0.5)
          .setAlpha(0)
          .setDepth(4)
        this.perched.push(img)
        this.tweens.add({ targets: img, y: py, alpha: 0.95, duration: 520, ease: 'Sine.easeOut' })
        if (i % 5 === 0) this.audio.chime(392 + i * 11, 0)
      }
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
            this.homecomingJoiners++
            this.flock.spawnBird(
              cx + rand(300, 700) * side * 0.6 + 200,
              this.flock.centerY + rand(-320, 320),
              180,
              rand(-40, 40),
            )
          }
        }
        // ...plus echo birds for visual mass into the hundreds
        if (this.echoes.length < Math.round(120 * decorScale) && this.flock.birds.length > 0) {
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
      this.runArrivalCeremony(dt)
      if (this.finishTimer > 8.6 && !this.resultsSent) {
        this.resultsSent = true
        // the homecoming's joiners are spectacle, not achievement
        const arrived = Math.max(0, this.flock.count - this.homecomingJoiners)
        this.stats.returned = arrived
        // survival + the nightfall bonus land last, so the ceremony can
        // count them up as the closing beats
        const saved = Math.max(0, Math.round(NIGHTFALL_PAR - this.flightSeconds))
        this.score.awardNightfall(saved)
        const result = scoreFeathers({
          flightId: 'ancient-ruins',
          startingBirds: this.stats.startCount,
          strayBirdsFound: this.stats.found,
          scatteredBirdsRecovered: this.stats.recovered,
          birdsPermanentlyLost: this.stats.lost,
          birdsArrived: arrived,
          perfectFlows: this.stats.flow,
          totalFlowOpportunities: this.stats.flowTotal,
          collisionEvents: this.stats.collisionEvents,
          checkpointsUsed: this.stats.resets,
        })
        this.scene.start('Results', {
          ...result,
          score: this.score.finalScore(arrived),
          mastery: this.score.mastery,
          masteryGains: this.score.gains,
          masteryCounts: this.score.counts,
          masteryLost: this.score.lostToCollisions,
          bestStreak: this.score.bestChain,
          secondsSaved: Math.max(0, Math.round(NIGHTFALL_PAR - this.flightSeconds)),
        })
      }
      return
    }
    // the threat acknowledges the flock made it — high, distant, and gone
    if (!this.turnedAway && cx > ROOST_X - 2100 && this.textures.exists('falcon_retreat')) {
      this.turnedAway = true
      const f = this.add
        .image(cx + 700, 150, 'falcon_retreat')
        .setDisplaySize(150, 132)
        .setAlpha(0)
        .setDepth(9)
        .setTint(0xd8c6dc)
      this.audio.falconScreech()
      this.tweens.add({ targets: f, alpha: 0.75, duration: 900 })
      this.tweens.add({
        targets: f,
        x: cx + 1500,
        y: 60,
        alpha: 0,
        duration: 5200,
        delay: 900,
        ease: 'Sine.easeIn',
        onComplete: () => f.destroy(),
      })
    }
    if (cx >= ROOST_X - 240) {
      this.finishing = true
      this.promptText.setAlpha(0)
      this.prompt = null
      this.promptQueue.length = 0
      this.showPrompt('home', 'home', () => this.finishTimer > 3)
      this.audio.chime(392, 0.3)
      this.audio.warmth(1)
    }
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
