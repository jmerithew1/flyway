import Phaser from 'phaser'
import { Obstacle, avoidSteer, obstacleField } from './obstacles'
import { birdFrameKey } from './textures'
import {
  BANK_DECAY,
  BANK_DISCHARGE_GAIN,
  BANK_DISCHARGE_MIN,
  BANK_HOLD,
  BANK_MAX,
  BANK_RATE,
  BRACE_STRAIN_MULT,
  DIVE_FULL_HOLD,
  DIVE_INTENT_DROP,
  DIVE_LIFT_ACCEL,
  DIVE_LIFT_DECAY,
  DIVE_LIFT_SPEED,
  DIVE_MIN_HOLD,
  DIVE_PULL,
  DIVE_SPEED_BONUS,
  GATHER_HEALTHY,
  GATHER_OVER,
  HARMONY_ATTACK_MULT,
  HARMONY_BUILD,
  HARMONY_DECAY,
  HARMONY_FORM_BAND,
  HARMONY_SPEND_MIN,
  HARMONY_SPEND_TIME,
  HARMONY_STRAIN_MAX,
  SPREAD_HEALTHY,
  SPREAD_OVER,
  STRAIN_RECOVERY_RATE,
  VORTEX_ALIGN_RATE,
  VORTEX_COHESION_BOOST,
  VORTEX_DECAY,
  VORTEX_SWIRL_MULT,
} from './config'

/**
 * The heart of the game: a lightweight boid flock with personality variation,
 * cursor-intent steering, and a gather/spread "form" axis.
 *
 * Design contract (from the brief):
 *  - cursor = intention, not position
 *  - ~75-80% flock response, ~20-25% organic variation
 *  - gather/spread transition smoothly, shapes emerge from motion
 *  - obstacles split the flock naturally; reunion is imperfect
 */

export const TUNING = {
  viewRadius: 96,
  sepRadiusNeutral: 62,
  sepRadiusGather: 13,
  sepRadiusSpread: 112,
  wCohesion: 300, // local centroid pull, per-100px-of-offset
  wSeparation: 250,
  wAlignment: 150,
  wIntent: 700,
  wJitter: 36,
  wSwirl: 38, // internal circulation currents
  wAvoid: 2600,
  // pull toward the flock centroid: prevents permanent fragmentation
  // and produces the imperfect post-split reunion
  wHome: 4.5,
  homeRadiusNeutral: 300,
  // envelope asymmetry along heading: dense leading edge, streaming tail
  leadTighten: 0.72,
  tailStretch: 1.65,
  homeRadiusGather: 60,
  homeRadiusSpread: 540,
  homeMax: 560,
  // neutral murmuration cloud is wider than tall (screen-axis envelope)
  envelopeYSquash: 1.9,
  envelopeXRelax: 0.85,
  cruiseSpeed: 235,
  minSpeed: 110,
  maxSpeed: 430,
  maxAccel: 1500,
  intentLerp: 9, // how fast the shared intent point chases the cursor
  formLerpAttack: 2.9, // pressing gather/spread responds quickly...
  formLerpRelease: 1.1, // ...but the flock relaxes back slowly (shape memory)
  gatherSpeedBoost: 0.22,
  spreadSpeedDrag: 0.12,
}

export interface Bird {
  x: number
  y: number
  vx: number
  vy: number
  alive: boolean
  // personality (fixed at spawn)
  speedFactor: number // 0.9..1.12
  agility: number // scales max accel, 0.75..1.25
  intentResponse: number // 0.65..1.35
  intentLagRate: number // per-bird intent smoothing speed — front reacts before tail
  myIntentX: number // this bird's delayed view of the shared intent point
  myIntentY: number
  orbitBias: number // signed: internal circulation direction
  homeBias: number // per-bird leash multiplier — ragged flock boundary
  edginess: number // jitter amplitude scale
  sidePref: number // -1..1 bias when splitting head-on
  flapPhase: number
  flapFreq: number
  renderAngle: number // smoothed heading for the sprite (kills rotation jitter)
  depth: number // 0.75..1.15 pseudo-depth for scale/alpha richness
  // transient
  panic: number // 0..1, spikes on close calls, adds flutter
  fray: number // 0..1, strained birds squeezed loose from the formation
  danger: number // accumulates while lingering near solids ungathered; flings at 1
  sprite: Phaser.GameObjects.Image
}

export interface FlockInput {
  intentX: number // raw cursor (world coords)
  intentY: number
  gather: boolean
  spread: boolean
}

interface Grid {
  cell: number
  map: Map<number, number[]>
}

const STEP = 1 / 60
const MAX_STEPS = 6
/** On-screen wingspan of an average bird, in game px. */
const BIRD_PX = 27

/**
 * Sprite scale derived from the actual rasterized texture width, so the art
 * stays the right size regardless of what resolution the SVG was rasterized at.
 */
function birdScale(scene: Phaser.Scene): number {
  // poses are normalized onto a 128px canvas; the mid pose's wingspan is ~116px
  void scene
  return BIRD_PX / 116
}

export class Flock {
  scene: Phaser.Scene
  birds: Bird[] = []
  intentX = 0
  intentY = 0
  form = 0 // smoothed: +1 gather, -1 spread
  time = 0
  /** mean state, updated each frame */
  centerX = 0
  centerY = 0
  meanVX = 1
  meanVY = 0
  /** hidden formation strain: 0 = healthy, 1 = at the OVER threshold */
  gatherStrain = 0
  spreadStrain = 0
  gatherTime = 0
  private spreadTime = 0
  private fraySelect = 0

  /** birds that scraped an obstacle interior this frame (for loss rules later) */
  collisions: Bird[] = []
  breakthroughHits: { bird: Bird; obstacle: Obstacle }[] = []
  brushHits: { bird: Bird; obstacle: Obstacle }[] = []
  /** Birds flung out of formation by violent last-second evasions. */
  flungBirds: Bird[] = []
  /** Close passes this frame (urgency spike without contact) for AV feedback. */
  grazes: { bird: Bird; obstacle: Obstacle }[] = []

  private grid: Grid = { cell: TUNING.viewRadius, map: new Map() }
  private tint: number
  private scale: number

  constructor(scene: Phaser.Scene, count: number, x: number, y: number, tint = 0x222638) {
    this.scene = scene
    this.tint = tint
    this.scale = birdScale(scene)
    this.intentX = x
    this.intentY = y
    for (let i = 0; i < count; i++) this.spawnBird(x + rand(-140, 140), y + rand(-90, 90))
  }

  spawnBird(x: number, y: number, vx?: number, vy?: number): Bird {
    const sprite = this.scene.add.image(x, y, 'bird-mid')
    const depth = rand(0.75, 1.15)
    sprite.setScale(this.scale * depth)
    sprite.setAlpha(0.82 + (depth - 0.75) * 0.45)
    const bird: Bird = {
      x,
      y,
      vx: vx ?? rand(160, 240),
      vy: vy ?? rand(-40, 40),
      alive: true,
      speedFactor: rand(0.92, 1.1),
      agility: rand(0.85, 1.2),
      intentResponse: rand(0.82, 1.25),
      // fast birds also react first → they lead, slow birds trail the tail
      intentLagRate: 0, // set below from speedFactor
      myIntentX: x,
      myIntentY: y,
      orbitBias: (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 1),
      homeBias: rand(0.7, 1.45),
      edginess: rand(0.4, 1.25),
      sidePref: Math.random() < 0.5 ? -rand(0.4, 1) : rand(0.4, 1),
      flapPhase: rand(0, Math.PI * 2),
      // most birds beat steadily; a few glide with slow lazy strokes
      flapFreq: Math.random() < 0.15 ? rand(2.5, 4) : rand(7, 11),
      renderAngle: 0,
      depth,
      panic: 0,
      fray: 0,
      danger: 0,
      sprite,
    }
    bird.intentLagRate = lerp(2.2, 10, (bird.speedFactor - 0.92) / 0.18) + rand(-0.8, 0.8)
    this.birds.push(bird)
    return bird
  }

  get count(): number {
    return this.birds.length
  }

  removeBird(bird: Bird): void {
    const i = this.birds.indexOf(bird)
    if (i >= 0) this.birds.splice(i, 1)
    bird.alive = false
    bird.sprite.destroy()
  }

  /** Fixed-timestep wrapper: stays correct through frame hitches / slow machines. */
  update(dtRaw: number, input: FlockInput, obstacles: Obstacle[]): void {
    this.collisions.length = 0
    this.breakthroughHits.length = 0
    this.brushHits.length = 0
    this.flungBirds.length = 0
    this.grazes.length = 0
    this.stepAccum = Math.min(this.stepAccum + dtRaw, STEP * MAX_STEPS)
    while (this.stepAccum >= STEP) {
      this.stepAccum -= STEP
      this.step(STEP, input, obstacles)
    }
    this.render(dtRaw)
  }

  private stepAccum = 0
  /** Colliders close enough to matter this step (broad-phase result). */
  nearObstacles: Obstacle[] = []

  // ---- ability state (tap verbs layered on the hold verbs) -----------------
  /** Surge: 0..1 whipcrack acceleration pulse, decays over ~0.5s. */
  pulse = 0

  /**
   * SHAPE SIGNALS — for one beat, the murmuration BECOMES the move.
   *
   * A tint or a flash is generic feedback that any game could use. A flock of
   * a hundred birds snapping into an arrowhead is unmistakable, needs no
   * legend, and is the thing this game can do that nothing else can. Each
   * ability throws its own silhouette, so you read what happened from the
   * flock itself rather than from a colour change you might miss.
   */
  shapeKind: 'arrow' | 'fan' | 'ring' | null = null
  private shapeT = 0
  private shapeDur = 0.72

  /** Throw a shape. It rams in over ~0.13s, holds, then releases back to boids. */
  formShape(kind: 'arrow' | 'fan' | 'ring', dur = 0.72): void {
    this.shapeKind = kind
    this.shapeT = 0
    this.shapeDur = dur
  }

  /** 0..1 envelope: hard attack so the snap lands, soft release so it melts. */
  private shapeEnvelope(): number {
    if (!this.shapeKind) return 0
    const p = this.shapeT / this.shapeDur
    if (p >= 1) return 0
    return p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82
  }

  /** Where bird `i` of `n` belongs in the current shape, in flock-local space
   * (x along the heading, y across it). */
  private shapeSlot(i: number, n: number): [number, number] {
    const spread = 30 + Math.sqrt(n) * 11
    // deterministic per-slot jitter keeps the form organic, never stencilled
    const j = Math.sin(i * 12.9898) * 0.5
    switch (this.shapeKind) {
      case 'arrow': {
        // two swept edges meeting at a point that leads the flock
        const t = (i / Math.max(1, n - 1)) * 2 - 1 // -1..1
        const a = Math.abs(t)
        return [spread * (1.25 - a * 2.1) + j * 6, t * spread * 0.62 + j * 5]
      }
      case 'fan': {
        // a wide braking crescent, wings out
        const t = (i / Math.max(1, n - 1)) * 2 - 1
        const ang = t * 1.15
        return [-Math.cos(ang) * spread * 0.5 - spread * 0.15 + j * 7, Math.sin(ang) * spread * 1.25 + j * 7]
      }
      case 'ring': {
        // the call going out: an open circle, everyone facing the world
        const ang = (i / Math.max(1, n)) * Math.PI * 2
        const r = spread * 0.95
        return [Math.cos(ang) * r + j * 6, Math.sin(ang) * r + j * 6]
      }
      default:
        return [0, 0]
    }
  }
  /** Flare: 0..1 air-brake bloom, decays over ~0.4s. */
  flareAmt = 0
  /** Drafting: 0..1, builds on straight clean flight, spills on sharp turns. */
  draft = 0
  /** Late-game intensity: scales danger accrual as dusk closes in (set per act). */
  dangerScale = 1
  /** 0..1 — a crowned leader makes the whole flock track intent a touch
   * crisper. Positive-only: losing her removes a bonus, never adds a tax. */
  leaderAura = 0
  private prevHeading = 0
  private turnRateSmooth = 0

  // ---- second ability wave (Phase 8) ---------------------------------------
  // Every field below is inert at its default, so a scene that never calls the
  // new setters gets byte-identical behaviour to the first wave.

  /** Dive: held. Read-only for the scene — flip it with setDive(). */
  dive = false
  /** Dive slingshot: 0..1 lift envelope living after a dive is released. */
  diveLift = 0
  private diveHold = 0
  /** Vortex Whirl: 0..1 rotating-column intensity, decays over VORTEX_DECAY. */
  vortex = 0
  private vortexDir = 1
  /** Harmony: 0..1 calm reservoir. Read-only feel value (HUD / audio calm). */
  harmony = 0
  /** Harmony is the one ability with no call site — it just happens. This is
   * the single switch that restores exact pre-Phase-8 strain behaviour, for
   * autopilot regressions that need the old baseline. */
  harmonyEnabled = true
  /** Remaining seconds of harmony-bought strain-free grace. */
  harmonyGrace = 0
  private prevFormTarget = 0
  private braced = false
  /** Tailwind / updraft bank: 0..1 stored aligned-wind momentum. */
  bank = 0
  private bankHold = 0

  /** True while brace is engaged (see setBrace). */
  get bracing(): boolean {
    return this.braced
  }

  /**
   * Strain-accrual multiplier shared by every strain source in this class.
   * Harmony's grace zeroes it outright (the gift wins over the brace price);
   * otherwise bracing doubles it.
   */
  private get strainMult(): number {
    if (this.harmonyGrace > 0) return 0
    return this.braced ? BRACE_STRAIN_MULT : 1
  }

  /** Bleed both strain clocks — sunbeams, roosting, anything restorative.
   * Must drain the CLOCKS: gatherStrain/spreadStrain are recomputed each step. */
  relieveStrain(seconds: number): void {
    this.gatherTime = Math.max(0, this.gatherTime - seconds)
    this.spreadTime = Math.max(0, this.spreadTime - seconds)
  }

  /** Tap SPACE: the flock snaps tight and slingshots forward. Strained
   * flocks produce a ragged, weaker pulse — strain is the anti-spam. */
  surge(): void {
    const strength = 1 - this.gatherStrain * 0.6
    this.pulse = Math.max(this.pulse, strength)
    this.gatherTime += 0.5 * this.strainMult
    // A raised speed CEILING alone produced no surge at all: accelerating
    // toward the cursor shrinks `idist`, which collapses the `chase` term by
    // almost exactly what the pulse added (measured 325 -> 326 px/s). So the
    // slingshot has to be a real impulse in the world frame — velocity the
    // steering has to catch up to, not a limit it never reaches.
    const hx = this.meanVX, hy = this.meanVY
    const hm = Math.hypot(hx, hy) || 1
    const kick = 190 * strength
    for (const b of this.birds) {
      b.vx += (hx / hm) * kick
      b.vy += (hy / hm) * kick
    }
  }

  /** Tap SHIFT: wings flare, momentum dies — the overshoot panic button. */
  flare(): void {
    this.flareAmt = Math.max(this.flareAmt, 1 - this.spreadStrain * 0.5)
    this.spreadTime += 0.4 * this.strainMult
  }

  /**
   * DIVE — hold to trade altitude for speed, release to slingshot.
   *
   * While held the shared intention sinks DIVE_INTENT_DROP px below the
   * cursor and a constant downward accel is added, so the flock commits to a
   * stoop the player still steers. The speed ceiling lifts by DIVE_SPEED_BONUS
   * but ONLY for birds that are actually descending (vy > 0) — a dive that has
   * bottomed out earns nothing, which is what keeps it altitude-for-speed
   * rather than a free speed button.
   *
   * The release impulse is handled here, not by the scene: holding past
   * DIVE_MIN_HOLD converts the dive into a lift envelope (diveLift) scaled by
   * how long it was held, and that envelope is what climbs and accelerates.
   */
  setDive(on: boolean): void {
    if (on === this.dive) return
    this.dive = on
    if (on) {
      this.diveHold = 0
      return
    }
    if (this.diveHold >= DIVE_MIN_HOLD) {
      this.diveLift = Math.max(this.diveLift, clamp(this.diveHold / DIVE_FULL_HOLD, 0, 1))
    }
    this.diveHold = 0
  }

  /**
   * VORTEX WHIRL — the scene detects the circular gesture, this makes it real.
   *
   * `dir` is the gesture's rotation sign (+1 clockwise in screen space, -1
   * counter-clockwise); its sign is all that is read. While the whirl lives,
   * every bird's orbitBias slews toward that one direction and the swirl force
   * is multiplied, so the cloud's normally-cancelling internal currents line up
   * into a single rotating column, with a gentle cohesion boost holding the
   * column's radius in. The alignment is deliberately NOT reverted on decay —
   * a whirled flock keeps a faint after-spin until per-bird noise scatters it.
   */
  enterVortex(dir = 1, strength = 1): void {
    this.vortexDir = dir < 0 ? -1 : 1
    this.vortex = Math.max(this.vortex, clamp(strength, 0, 1))
  }

  /**
   * BRACE — hold SPACE+SHIFT: perception bought with formation health.
   *
   * CONTRACT (deliberately NOT a public `braceScale` the scene multiplies dt
   * by — that would leak time dilation into the sim's envelopes):
   *  - The SCENE owns the world-slow. It decides what eases to ~60% speed
   *    (scroll, movers, falcon, timers, particles) and for how long.
   *  - The FLOCK owns the price. setBrace(true) multiplies EVERY strain-clock
   *    accrual inside this class by BRACE_STRAIN_MULT — held formations, and
   *    the surge()/flare() surcharges alike — via `strainMult`.
   *  - The price is per unit of the dt this class is handed. If the scene also
   *    slows the dt it passes to update(), the net cost is
   *    braceScale x BRACE_STRAIN_MULT (0.6 x 2 = 1.2x real time) — still a
   *    premium, which is the intended shape. What the scene must never do is
   *    scale dt *in order to* price brace: dt scaling re-times pulse, flare,
   *    diveLift, vortex and bank too, and the price would then depend on the
   *    slowdown factor instead of on the player's choice.
   *  - Harmony's grace outranks brace: while grace runs, accrual is zero.
   */
  setBrace(on: boolean): void {
    this.braced = on
  }

  /**
   * TAILWIND KICK / UPDRAFT RIDING — banking half.
   *
   * The scene decides what "aligned wind" means (zone kind, form, heading vs
   * zone vector) and reports it every frame as `alignment01 * dt`; the flock
   * stays dumb about the level. Bank bleeds away BANK_DECAY/s once the reports
   * stop (after a BANK_HOLD grace, so a one-frame gap does not empty it).
   */
  bankMomentum(amount: number): void {
    if (!(amount > 0)) return
    this.bank = Math.min(BANK_MAX, this.bank + amount * BANK_RATE)
    this.bankHold = BANK_HOLD
  }

  /**
   * TAILWIND KICK / UPDRAFT RIDING — discharge half, fired at zone exit.
   *
   * Converts the stored bank into a surge-shaped pulse (the SAME envelope
   * surge() uses, so it decays and reads identically) and returns the strength
   * spent, 0 if there was nothing worth spending — the scene scales its FX and
   * its prompt off that return value.
   */
  dischargeBank(): number {
    const banked = this.bank
    this.bank = 0
    this.bankHold = 0
    if (banked < BANK_DISCHARGE_MIN) return 0
    const strength = Math.min(1, banked * BANK_DISCHARGE_GAIN)
    this.pulse = Math.max(this.pulse, strength)
    return strength
  }

  /** Spend banked harmony on a formation change: HARMONY_SPEND_TIME seconds
   * of strain-free, fast-attack morphing. No-op below HARMONY_SPEND_MIN. */
  private spendHarmony(): void {
    if (!this.harmonyEnabled || this.harmony < HARMONY_SPEND_MIN) return
    this.harmonyGrace = Math.max(this.harmonyGrace, HARMONY_SPEND_TIME * this.harmony)
    this.harmony = 0
  }

  private step(dt: number, input: FlockInput, obstacles: Obstacle[]): void {
    this.time += dt

    // ability envelopes decay (all of them, inside the fixed step)
    this.pulse = Math.max(0, this.pulse - dt / 0.5)
    if (this.shapeKind) {
      this.shapeT += dt
      if (this.shapeT >= this.shapeDur) this.shapeKind = null
    }
    this.flareAmt = Math.max(0, this.flareAmt - dt / 0.4)
    this.diveLift = Math.max(0, this.diveLift - dt / DIVE_LIFT_DECAY)
    this.vortex = Math.max(0, this.vortex - dt / VORTEX_DECAY)
    this.harmonyGrace = Math.max(0, this.harmonyGrace - dt)
    if (this.dive) this.diveHold += dt
    if (this.bankHold > 0) this.bankHold = Math.max(0, this.bankHold - dt)
    else this.bank = Math.max(0, this.bank - dt * BANK_DECAY)

    // shared intent point chases the cursor — collective reaction delay
    const ik = 1 - Math.exp(-TUNING.intentLerp * dt)
    this.intentX += (input.intentX - this.intentX) * ik
    this.intentY += (input.intentY - this.intentY) * ik

    // gather/spread axis — quick to respond, slow to relax (shape memory)
    const formTarget = input.gather ? 1 : input.spread ? -1 : 0
    // HARMONY: a formation change (the press edge out of neutral) cashes in the
    // calm reservoir — the morph snaps and costs nothing for HARMONY_SPEND_TIME
    if (formTarget !== 0 && this.prevFormTarget === 0) this.spendHarmony()
    this.prevFormTarget = formTarget
    const strainRelief = 1 + Math.max(this.gatherStrain, this.spreadStrain) * 0.8
    const attack = TUNING.formLerpAttack * (this.harmonyGrace > 0 ? HARMONY_ATTACK_MULT : 1)
    const formRate = formTarget === 0 ? TUNING.formLerpRelease * strainRelief : attack
    this.form += (formTarget - this.form) * (1 - Math.exp(-formRate * dt))
    const f = this.form
    const gather = Math.max(f, 0)
    const spread = Math.max(-f, 0)

    // ---- drafting: sustained straight flight strings the flock out and
    // builds speed; a sharp intent turn spills it. Clean air also halves
    // gather-strain accrual, making strain situational rather than a tax.
    const meanSp0 = Math.hypot(this.meanVX, this.meanVY)
    if (meanSp0 > 40) {
      const heading = Math.atan2(this.meanVY, this.meanVX)
      let dh = heading - this.prevHeading
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      this.prevHeading = heading
      const rate = Math.abs(dh) / dt
      this.turnRateSmooth += (rate - this.turnRateSmooth) * (1 - Math.exp(-4 * dt))
      if (this.turnRateSmooth < 0.35 && meanSp0 > 180) this.draft = Math.min(1, this.draft + dt / 2)
      else this.draft = Math.max(0, this.draft - dt * 1.6)
    } else {
      this.draft = Math.max(0, this.draft - dt * 1.6)
    }

    // ---- hidden strain clocks: holding a formation past its healthy window
    // squeezes birds loose (gather) or lets the edges drift (spread).
    // Neutral is REGROUP: strain drains fast and loose birds return.
    // HARMONY: calm neutral flight is banked. It builds only while genuinely
    // idle-handed (near-neutral form AND both strains near zero) and drains
    // once that stops, so it reads as "the flock settled" rather than a meter.
    const calm =
      Math.abs(f) < HARMONY_FORM_BAND &&
      this.gatherStrain < HARMONY_STRAIN_MAX &&
      this.spreadStrain < HARMONY_STRAIN_MAX
    if (!this.harmonyEnabled) {
      this.harmony = 0
      this.harmonyGrace = 0
    } else if (calm) {
      if (this.harmonyGrace <= 0) this.harmony = Math.min(1, this.harmony + dt * HARMONY_BUILD)
    } else {
      this.harmony = Math.max(0, this.harmony - dt * HARMONY_DECAY)
    }

    // Held-formation accrual runs through strainMult: harmony grace zeroes it,
    // brace doubles it. Recovery is never scaled — mercy is not for sale.
    const accrual = this.strainMult
    const cleanAir = this.draft > 0.5 ? 0.5 : 1
    if (f > 0.5) this.gatherTime += dt * cleanAir * accrual
    else this.gatherTime = Math.max(0, this.gatherTime - dt * STRAIN_RECOVERY_RATE)
    if (f < -0.5) this.spreadTime += dt * accrual
    else this.spreadTime = Math.max(0, this.spreadTime - dt * STRAIN_RECOVERY_RATE)
    this.gatherStrain = clamp((this.gatherTime - GATHER_HEALTHY) / (GATHER_OVER - GATHER_HEALTHY), 0, 1)
    this.spreadStrain = clamp((this.spreadTime - SPREAD_HEALTHY) / (SPREAD_OVER - SPREAD_HEALTHY), 0, 1)
    const gStrain = this.gatherStrain
    const sStrain = this.spreadStrain

    // recruit a rotating subset of frayed birds while strain is high
    this.fraySelect -= dt
    const activeStrain = Math.max(gStrain, sStrain)
    if (activeStrain > 0.4 && this.fraySelect <= 0) {
      this.fraySelect = 0.35
      const want = Math.ceil(this.birds.length * (0.03 + activeStrain * 0.09))
      for (let k = 0; k < want; k++) {
        const b = this.birds[(Math.random() * this.birds.length) | 0]
        if (b) b.fray = Math.min(1, b.fray + 0.6 + Math.random() * 0.4)
      }
    }

    const sepRadius =
      (f >= 0
        ? lerp(TUNING.sepRadiusNeutral, TUNING.sepRadiusGather, gather)
        : lerp(TUNING.sepRadiusNeutral, TUNING.sepRadiusSpread, spread)) *
      (1 + this.flareAmt * 0.7)
    // neutral flocks cohere loosely (big living cloud); gathering multiplies pull.
    // VORTEX adds a gentle inward term so the whirl reads as a column with a
    // held radius instead of a cloud that merely spins in place.
    const wCoh =
      TUNING.wCohesion *
      lerp(0.35, 1, Math.abs(f)) *
      (1 + gather * 2.1 - spread * 0.6) *
      (1 + this.vortex * VORTEX_COHESION_BOOST)
    const wSep = TUNING.wSeparation * (1 + spread * 0.5 - gather * 0.25)
    const wInt = TUNING.wIntent * (1 + gather * 0.35 + this.leaderAura * 0.1)
    const wJit = TUNING.wJitter * (1 + spread * 0.9) * (1 + gStrain * 1.2 + sStrain * 0.5)

    this.rebuildGrid()
    this.updateMeanState()

    // ---- broad phase: the visible set spans the whole screen, but the flock
    // occupies a fraction of it. Culling once per step turns an O(birds x
    // screen) test into O(birds x neighbourhood) — the single hottest loop.
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const b of this.birds) {
      if (b.x < minX) minX = b.x
      if (b.x > maxX) maxX = b.x
      if (b.y < minY) minY = b.y
      if (b.y > maxY) maxY = b.y
    }
    const pad = 260 // lookahead reach + comfort margin
    this.nearObstacles.length = 0
    for (const o of obstacles) {
      if (o.broken) continue
      const hw = o.shape === 'circle' ? o.r : o.hw
      const hh = o.shape === 'circle' ? o.r : o.hh
      if (o.x + hw < minX - pad || o.x - hw > maxX + pad) continue
      if (o.y + hh < minY - pad || o.y - hh > maxY + pad) continue
      this.nearObstacles.push(o)
    }
    const near = this.nearObstacles

    // flock heading for anisotropic gather (elongates along motion = ribbons/spears)
    const meanSpeed = Math.hypot(this.meanVX, this.meanVY) || 1
    const hx = this.meanVX / meanSpeed
    const hy = this.meanVY / meanSpeed

    const view2 = TUNING.viewRadius * TUNING.viewRadius
    const neighborIdx: number[] = []

    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]

      // --- gather neighbors from grid
      neighborIdx.length = 0
      this.nearby(b.x, b.y, neighborIdx)

      let cx = 0
      let cy = 0
      let avx = 0
      let avy = 0
      let n = 0
      let sepX = 0
      let sepY = 0
      for (const j of neighborIdx) {
        if (j === i) continue
        const o = this.birds[j]
        const dx = o.x - b.x
        const dy = o.y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 > view2) continue
        n++
        cx += o.x
        cy += o.y
        avx += o.vx
        avy += o.vy
        if (d2 < sepRadius * sepRadius && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          // capped 1/d: overlapping birds ease apart instead of popping
          const push = (1 - d / sepRadius) / Math.max(d, 12)
          sepX -= dx * push
          sepY -= dy * push
        }
      }

      let ax = 0
      let ay = 0

      if (n > 0) {
        cx /= n
        cy /= n
        // cohesion toward local centroid; when gathered, squeeze the axis
        // perpendicular to flock heading harder than along it (stream shapes)
        let gx = cx - b.x
        let gy = cy - b.y
        // neutral cloud is wider than tall: squash vertical offsets at every scale
        const neutralW = 1 - Math.abs(f)
        gx *= lerp(1, TUNING.envelopeXRelax, neutralW)
        gy *= lerp(1, TUNING.envelopeYSquash, neutralW)
        if (gather > 0.02) {
          const along = gx * hx + gy * hy
          const px = gx - along * hx
          const py = gy - along * hy
          const perpBoost = 1 + gather * 2.6
          const alongDamp = 1 - gather * 0.82
          gx = along * hx * alongDamp + px * perpBoost
          gy = along * hy * alongDamp + py * perpBoost
        }
        ax += gx * (wCoh / 100)
        ay += gy * (wCoh / 100)

        // alignment
        avx /= n
        avy /= n
        const as = Math.hypot(avx, avy)
        if (as > 1) {
          const bs = Math.hypot(b.vx, b.vy) || 1
          ax += (avx / as - b.vx / bs) * TUNING.wAlignment * (this.alignScale(f))
          ay += (avy / as - b.vy / bs) * TUNING.wAlignment * (this.alignScale(f))
        }

        ax += sepX * wSep
        ay += sepY * wSep
      }

      // --- cursor intent (per-bird delayed copy: front reacts before the tail,
      //     laggards whip around late on sharp reversals)
      const bk = 1 - Math.exp(-b.intentLagRate * dt)
      b.myIntentX += (this.intentX - b.myIntentX) * bk
      b.myIntentY += (this.intentY - b.myIntentY) * bk
      const ix = b.myIntentX - b.x
      // DIVE: the shared intention sinks below the cursor — the player still
      // steers, but everything the flock wants is now downhill
      const iy = b.myIntentY + (this.dive ? DIVE_INTENT_DROP : 0) - b.y
      const idist = Math.hypot(ix, iy)
      if (idist > 8) {
        const pull = Math.min(idist / 240, 1.25) * wInt * b.intentResponse
        ax += (ix / idist) * pull
        ay += (iy / idist) * pull
      }

      // --- strain effects on frayed birds: they are REAL birds pushed loose,
      // exposed to real dangers; nothing kills them directly
      if (b.fray > 0.01) {
        const rx = b.x - this.centerX
        const ry = b.y - this.centerY
        const rd = Math.hypot(rx, ry) || 1
        if (gStrain > 0.01 && gather > 0.3) {
          // squeezed outward, cohesion saps
          const push = 240 * b.fray * gStrain
          ax += (rx / rd) * push
          ay += (ry / rd) * push
        }
        b.panic = Math.max(b.panic, 0.45 * b.fray)
        const calm = Math.max(gStrain, sStrain) < 0.2
        b.fray = Math.max(0, b.fray - dt * (calm ? 1.6 : 0.12))
      }

      // --- weak global pull toward the flock centroid (anti-fragmentation / reunion)
      // The envelope is a living ellipse: wider than tall at neutral, and
      // stretched along the direction of travel when gathered (streams/spears).
      const neutralAmt = 1 - Math.abs(f)
      let gcx: number
      let gcy: number
      if (gather > 0.02) {
        const rx = this.centerX - b.x
        const ry = this.centerY - b.y
        const along = (rx * hx + ry * hy) * lerp(1, 0.28, gather)
        const perp = (-rx * hy + ry * hx) * lerp(1, 2.6, gather)
        gcx = along * hx - perp * hy
        gcy = along * hy + perp * hx
      } else {
        gcx = (this.centerX - b.x) * lerp(1, TUNING.envelopeXRelax, neutralAmt)
        gcy = (this.centerY - b.y) * lerp(1, TUNING.envelopeYSquash, neutralAmt)
      }
      const gcd = Math.hypot(gcx, gcy)
      let homeR =
        f >= 0
          ? lerp(TUNING.homeRadiusNeutral, TUNING.homeRadiusGather, gather)
          : lerp(TUNING.homeRadiusNeutral, TUNING.homeRadiusSpread, spread)

      // A murmuration is not an ellipse: it packs at the leading edge and
      // streams out behind. Birds *behind* the centroid get a much longer
      // leash (the tail); birds ahead of it get reined in (the dense front).
      const alongOff = (b.x - this.centerX) * hx + (b.y - this.centerY) * hy
      const tailAmt = alongOff < 0 ? 1 : 0
      homeR *= lerp(TUNING.leadTighten, TUNING.tailStretch, tailAmt)
      // per-bird leash variation ragged-edges the boundary instead of
      // cutting every bird off at the same clean radius
      homeR *= b.homeBias
      // over-spread: loose birds drift on a much longer leash
      if (sStrain > 0.01 && spread > 0.3) homeR *= 1 + 1.7 * b.fray * sStrain

      if (gcd > homeR) {
        const homePull = Math.min((gcd - homeR) * TUNING.wHome, TUNING.homeMax)
        ax += (gcx / gcd) * homePull
        ay += (gcy / gcd) * homePull
      }

      // --- internal circulation: each bird carries a lazy orbital tendency
      // around the local mass, so the cloud churns instead of freezing.
      // VORTEX WHIRL: those biases normally cancel out; the whirl slews every
      // one of them onto a single sign and multiplies the force, turning the
      // churn into one rotating column.
      if (this.vortex > 0.001) {
        const want = this.vortexDir * Math.abs(b.orbitBias)
        b.orbitBias += (want - b.orbitBias) * (1 - Math.exp(-VORTEX_ALIGN_RATE * this.vortex * dt))
      }
      if (gcd > 1) {
        const swirl = TUNING.wSwirl * b.orbitBias * (1 - gather * 0.7) * (1 + this.vortex * VORTEX_SWIRL_MULT)
        ax += (-gcy / gcd) * swirl
        ay += (gcx / gcd) * swirl
      }

      // --- organic jitter (perpendicular flutter, stronger at edges/spread/panic)
      const bs = Math.hypot(b.vx, b.vy) || 1
      const jitter =
        Math.sin(this.time * b.flapFreq * 0.6 + b.flapPhase * 3.1) *
        wJit *
        b.edginess *
        (1 + b.panic * 1.4)
      ax += (-b.vy / bs) * jitter
      ay += (b.vx / bs) * jitter

      // --- obstacle avoidance (broad-phase culled set)
      for (const o of near) {
        const res = avoidSteer(o, b.x, b.y, b.vx, b.vy, b.sidePref, this.centerY)
        if (!res) continue
        // brittle curtains barely repel — a committed flock flies into them;
        // soft vegetation repels halfway and never hurts
        const kindScale = o.kind === 'brittle' ? 0.22 : o.kind === 'soft' ? 0.5 : 1
        const power = TUNING.wAvoid * kindScale * res.urgency * res.urgency
        ax += res.fx * power
        ay += res.fy * power
        if (res.urgency > 0.75 && o.kind !== 'soft') b.panic = Math.min(1, b.panic + dt * 3)
        if (res.urgency > 0.72 && !res.inside && o.kind === 'solid' && this.grazes.length < 40) {
          this.grazes.push({ bird: b, obstacle: o })
        }
        // Blown wide: LINGERING near stone while ungathered accumulates danger;
        // past the limit the bird is flung from the formation. Quick clean
        // threads pass free; a wide neutral flock dragged along dense terrain
        // bleeds from its edges. Holding Gather commits the flock and shields
        // it completely — formation choice matters everywhere, every second.
        if (o.kind === 'solid' && res.urgency > 0.4 && gather < 0.3) {
          b.danger += dt * (res.urgency - 0.4) * 2.4 * this.dangerScale
          if (b.danger > 1) {
            b.danger = 0
            this.flungBirds.push(b)
          }
        }
        if (res.inside) {
          if (o.kind === 'soft') {
            // brush-through: drag + flutter, no removal, no hard correction
            b.vx *= 1 - 1.6 * dt
            b.vy *= 1 - 1.6 * dt
            this.brushHits.push({ bird: b, obstacle: o })
          } else {
            if (o.kind === 'brittle') this.breakthroughHits.push({ bird: b, obstacle: o })
            else this.collisions.push(b)
            // hard positional correction so birds never sink into solids
            const field = obstacleField(o, b.x, b.y)
            b.x += field.nx * (-field.dist + 2)
            b.y += field.ny * (-field.dist + 2)
          }
        }
      }

      // danger heals in clean air (slower than it accrues, so it "remembers")
      b.danger = Math.max(0, b.danger - dt * 0.5)

      // SURGE SPIRAL: while the pulse lives, the flock corkscrews around its
      // flight axis — a travelling helix (phase = position along the heading),
      // so a surge reads as the murmuration drilling forward like a spear
      if (this.pulse > 0.12) {
        const proj = (b.x - this.centerX) * hx + (b.y - this.centerY) * hy
        const helix = Math.sin(this.time * 11 + proj * 0.025 + b.flapPhase * 0.6)
        const amp = 640 * this.pulse
        ax += -hy * helix * amp
        ay += hx * helix * amp
      }

      // DIVE / SLINGSHOT: gravity gets a vote while the stoop is held, and the
      // release converts it back into climb — one continuous arc, not two moves
      if (this.dive) ay += DIVE_PULL
      if (this.diveLift > 0) ay -= DIVE_LIFT_ACCEL * this.diveLift

      // --- integrate with capped accel (this is the inertia)
      const maxA = TUNING.maxAccel * b.agility * (1 + gather * 0.22 + this.pulse * 0.4)
      const am = Math.hypot(ax, ay)
      if (am > maxA) {
        ax = (ax / am) * maxA
        ay = (ay / am) * maxA
      }
      // SHAPE SIGNAL: applied AFTER the accel clamp, because this is an
      // authored move rather than steering — the boid rules would sand the
      // silhouette off before it ever became legible.
      const env = this.shapeEnvelope()
      if (env > 0.01) {
        const [sx, sy] = this.shapeSlot(i, this.birds.length)
        // lay the slot out along the flock's heading, so the arrow points
        // where the flock is actually going
        const tx = this.centerX + sx * hx - sy * hy
        const ty = this.centerY + sx * hy + sy * hx
        // A force alone loses to separation and the shape never becomes
        // legible (measured: the arrow read as an ordinary blob). For the
        // ~0.7s a signal is held, birds are drawn kinematically onto their
        // slot as well, so the silhouette actually arrives while velocity
        // continuity keeps it from looking teleported.
        const pull = 40 * env
        b.vx += (tx - b.x) * pull * dt
        b.vy += (ty - b.y) * pull * dt
        const snap = Math.min(0.55, env * env * 0.5)
        b.x += (tx - b.x) * snap
        b.y += (ty - b.y) * snap
      }

      b.vx += ax * dt
      b.vy += ay * dt

      // --- speed shepherding toward cruise (chasing a far cursor speeds birds up)
      // surge slingshots, drafting builds on clean straights, flare kills it
      const chase = Math.min(Math.max(idist - 200, 0) / 500, 1) * 0.45
      // DIVE: the ceiling only lifts for birds actually LOSING altitude, so the
      // bonus is bought with height every frame it is paid out — a bottomed-out
      // dive earns nothing. The released lift keeps the speed as it climbs.
      const stooping = this.dive && b.vy > 0 ? DIVE_SPEED_BONUS : 0
      const cruise =
        TUNING.cruiseSpeed *
        b.speedFactor *
        (1 + chase + gather * TUNING.gatherSpeedBoost - spread * TUNING.spreadSpeedDrag) *
        (1 + this.pulse * 0.45 + this.draft * 0.25 + stooping + this.diveLift * DIVE_LIFT_SPEED) *
        (1 - this.flareAmt * 0.62)
      const sp = Math.hypot(b.vx, b.vy) || 1
      // during a surge the shepherd only accelerates — otherwise it spends the
      // whole pulse dragging the impulse back down to cruise
      const shepherd =
        env > 0.35 ? 0.5 : this.flareAmt > 0.1 ? 5.2 : this.pulse > 0.12 && sp > cruise ? 0.35 : 2.2
      const targetSp = clamp(
        sp + (cruise - sp) * (1 - Math.exp(-shepherd * dt)),
        TUNING.minSpeed * (1 - this.flareAmt * 0.55),
        TUNING.maxSpeed * (1 + this.pulse * 0.5 + stooping + this.diveLift * DIVE_LIFT_SPEED * 0.5),
      )
      b.vx = (b.vx / sp) * targetSp
      b.vy = (b.vy / sp) * targetSp

      b.x += b.vx * dt
      b.y += b.vy * dt
      b.panic = Math.max(0, b.panic - dt * 1.4)
    }
  }

  /** Pool of alarm halos drawn BEHIND at-risk birds. Bright, cool-white and
   * pulsing, so they separate from both the navy flock and the warm sky. */
  private riskHalos: Phaser.GameObjects.Image[] = []
  private riskUsed = 0
  private riskCandidates: { b: Bird; d01: number }[] = []

  /** Never more than this many rings at once — past a dozen it stops reading
   * as "these birds" and starts reading as UI noise. */
  private static readonly MAX_RISK_RINGS = 6

  private markAtRisk(b: Bird, d01: number): void {
    if (this.riskUsed >= Flock.MAX_RISK_RINGS) return
    let h = this.riskHalos[this.riskUsed]
    if (!h) {
      h = this.scene.add
        .image(0, 0, 'alarmring')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(2.95)
      this.riskHalos.push(h)
    }
    this.riskUsed++
    const pulse = 0.72 + 0.28 * Math.sin(this.time * 13 + b.flapPhase)
    const size = 52 - d01 * 14 // the ring CLOSES in as the bird runs out of time
    h.setVisible(true)
      .setPosition(b.x, b.y)
      .setDisplaySize(size, size)
      // cool white-gold: bright against the navy birds AND the peach sky
      .setTint(d01 > 0.6 ? 0xfff4e6 : 0xffd9b0)
      .setAlpha((0.45 + d01 * 0.4) * pulse)
  }

  private render(dt: number): void {
    this.riskCandidates.length = 0
    this.riskUsed = 0
    const rk = 1 - Math.exp(-9 * dt)
    for (const b of this.birds) {
      const s = b.sprite
      s.x = b.x
      s.y = b.y
      // smoothed heading: velocity noise never reaches the eye
      const target = Math.atan2(b.vy, b.vx)
      b.renderAngle += wrapAngle(target - b.renderAngle) * rk
      s.rotation = b.renderAngle
      // FLARE: the whole flock snaps wings-up in unison — a one-beat firework
      const key = this.flareAmt > 0.45 ? 'bird-up' : birdFrameKey(this.time, b.flapPhase, b.flapFreq)
      if (s.texture.key !== key) s.setTexture(key)

      // ---- ONE OWNER FOR BIRD COLOUR. Danger outranks everything: a bird
      // about to be torn away burns warm and judders, so the player can SEE
      // the problem that Gather solves, and watch gathering snuff it out.
      if (b.danger > 0.12) {
        const d01 = Math.min(1, b.danger)
        // A steady glow reads as decoration. A BLINK reads as an alarm - and
        // it quickens as the bird runs out of time, so the flock visibly
        // starts strobing when you are about to lose birds.
        const rate = 7 + d01 * 22
        const on = Math.sin(this.time * rate + b.flapPhase * 3) > 0
        if (on && d01 > 0.3) {
          s.setTint(0xfff2df)
          s.setAlpha(1)
        } else {
          if (s.isTinted) s.clearTint()
          s.setAlpha(on || d01 < 0.3 ? 1 : 0.45)
        }
        s.x += Math.sin(this.time * 42 + b.flapPhase) * d01 * 2.6
        if (d01 > 0.55) this.riskCandidates.push({ b, d01 })
      } else if (this.pulse > 0.3) {
        // SURGE: the leading edge catches the light — a warm spear-tip
        const ahead = (b.x - this.centerX) * Math.cos(b.renderAngle) + (b.y - this.centerY) * Math.sin(b.renderAngle)
        if (ahead > 20) s.setTint(0xffdfb8)
        else if (s.isTinted) s.clearTint()
      } else if (s.isTinted) {
        s.clearTint()
      }
      // faint breathing keeps silhouettes from feeling stamped
      const flap = Math.sin(this.time * b.flapFreq + b.flapPhase)
      s.scaleY = this.scale * b.depth * (0.94 + 0.08 * flap)
      s.scaleX = this.scale * b.depth
    }

    // ring the birds in the WORST trouble, not the first few the loop reached
    if (this.riskCandidates.length > 1) this.riskCandidates.sort((p, q) => q.d01 - p.d01)
    for (const c of this.riskCandidates) this.markAtRisk(c.b, c.d01)
    for (let i = this.riskUsed; i < this.riskHalos.length; i++) this.riskHalos[i].setVisible(false)
  }

  private alignScale(f: number): number {
    // spread flocks align noticeably less (loose, independent edges);
    // spread STRAIN fragments alignment further
    return (1 - Math.max(-f, 0) * 0.5) * (1 - this.spreadStrain * 0.35)
  }

  private updateMeanState(): void {
    let sx = 0
    let sy = 0
    let svx = 0
    let svy = 0
    for (const b of this.birds) {
      sx += b.x
      sy += b.y
      svx += b.vx
      svy += b.vy
    }
    const n = this.birds.length || 1
    this.centerX = sx / n
    this.centerY = sy / n
    this.meanVX = svx / n
    this.meanVY = svy / n
  }

  private rebuildGrid(): void {
    this.grid.map.clear()
    const c = this.grid.cell
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      const key = gridKey(Math.floor(b.x / c), Math.floor(b.y / c))
      let arr = this.grid.map.get(key)
      if (!arr) {
        arr = []
        this.grid.map.set(key, arr)
      }
      arr.push(i)
    }
  }

  private nearby(x: number, y: number, out: number[]): void {
    const c = this.grid.cell
    const gx = Math.floor(x / c)
    const gy = Math.floor(y / c)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = this.grid.map.get(gridKey(gx + dx, gy + dy))
        if (arr) for (const i of arr) out.push(i)
      }
    }
  }
}

function gridKey(x: number, y: number): number {
  return (x + 4096) * 16384 + (y + 4096)
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}
