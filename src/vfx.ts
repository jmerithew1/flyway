import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from './backdrop'

/**
 * VFX — the one place an effect is allowed to be born.
 *
 * Two rules shape everything below.
 *
 *  1. EVERY EFFECT HAS A LIFE CYCLE: buildup -> impact -> decay. A thing that
 *     springs into existence at full strength and then blinks out is the exact
 *     defect this module exists to delete. Even a 90ms feedback tick spends its
 *     first third gathering, so the eye reads a cause and then a consequence.
 *
 *  2. FOUR TIERS, AND ONLY ONE OF THEM OWNS THE SCREEN. `ambient` is weather,
 *     `feedback` answers an input, `reward` marks a thing you did well, and
 *     `spectacle` is the whole frame changing. If every beat is celebrated the
 *     player stops reading celebration as information, so spectacle is gated
 *     behind a ticket you have to ask for and can be refused - see
 *     `requestSpectacle`. Making it awkward is the feature.
 *
 * WHY THERE IS NOT A SINGLE TWEEN IN HERE. The profiler counts active tweens
 * because each one is a per-frame object update, and the baseline was already
 * 395 of them. More importantly, DayScene runs four independent slow-motion
 * multipliers on its own `dt` (hit-stop, first-encounter card, the Reckoning,
 * Brace) and `tweens.add` ignores all four - it runs on wall clock. So an
 * impact fired during a hit-stop would sprint while the world crawled, which
 * is precisely backwards: the hit-stop exists to let you SEE the impact.
 * Every effect here is a pooled sprite stepped by hand from the scene's own
 * dt, so effects slow when the world slows, and the tween count never moves.
 *
 * Allocation budget: zero. The pool, the free list and all per-slot state are
 * allocated once in the constructor. Nothing in `update` builds an object, an
 * array, a closure or a colour. That is why the spawn helpers take long
 * positional argument lists instead of a config object - a `{ }` at a call
 * site fired sixty times a second is 3MB of garbage a minute, and GC pauses
 * are what a player actually feels as choppiness.
 */

// ---------------------------------------------------------------- the pool
/**
 * Hard cap, in the house style (cf. SPARKLE_POOL = 26, MAX_RISK_RINGS = 14).
 * Past this the screen stops reading as "something happened there" and starts
 * reading as confetti, so an overflowing spawn is DROPPED rather than grown -
 * a dropped sprite is invisible, an unbounded pool is a stutter.
 */
const POOL = 72
/** Beats waiting on a stillness ramp. Small on purpose: two pending dramatic
 * moments is already a scheduling bug, not a composition. */
const BEATS = 8

const K_GLOW = 0
const K_RING = 1
const K_STREAK = 2
const K_DEBRIS = 3
const K_SHAFT = 4
const K_WASH = 5

/** Texture per kind. All are white-drawn for runtime tinting (see textures.ts). */
// 'smear', not 'vfade'. A vfade reaches full opacity at its bottom edge and
// across its whole width — correct for a wash whose hard edge sits off frame,
// and a flashing rectangle when drawn as a free sprite.
const KIND_TEX = ['softdot', 'alarmring', 'streak', 'feather', 'smear', 'softdot']

// ------------------------------------------------------------------ depths
/** Just above the flock (formFlourish already lives at 6) and below the mood
 * plates at 7.4, so a reward effect is lit by the act's colour rather than
 * painted over it. */
const D_WORLD = 6.05
/** Above nightVeil (10.9), below duskOverlay (48): the only band from which an
 * effect may address the whole frame. */
const D_SCREEN = 11.5

// -------------------------------------------------------------- intensity
/**
 * The tiers are not labels, they are a budget. Peak alpha and reach are
 * multiplied by these, which is what makes the hierarchy VISIBLE - if the
 * numbers were close the tiers would be a comment rather than a design.
 */
const TIER_GAIN = { ambient: 0.34, feedback: 0.62, reward: 1, spectacle: 1 }

/** Shortest gap between two spectacles. A second one inside this window is not
 * a bigger moment, it is the first one being forgotten. */
const SPECTACLE_MIN_GAP = 8

// --------------------------------------------------------------- stillness
/**
 * The cheapest dramatic tool available: turn the ambient world DOWN for a
 * beat before the big thing lands, so the beat arrives into near-silence.
 * Its cost is negative - it removes work - and it is the single most reliable
 * reason an effect reads as expensive rather than as busy.
 */
const HUSH_FLOOR = 0.12
/** Asymmetric, mirroring the house `predatorDim` idiom: the world goes quiet
 * quickly (a held breath) and comes back slowly (a room refilling). */
const HUSH_IN_RATE = 9
const HUSH_OUT_RATE = 2.4
/** How long the stillness runs before a spectacle actually fires. Measured in
 * the same 350ms the direction calls for; shorter reads as lag, longer reads
 * as a bug. */
const HUSH_LEAD = 0.35

// ------------------------------------------------------------- impact lens
/**
 * Chromatic aberration and the lens pinch are MILLISECOND events, never a
 * filter. The pipeline is not merely set to zero between impacts - it is
 * removed from the camera entirely, so in normal play it costs no pass, no
 * uniform upload and no texture fetch. That is the only version of "chromify"
 * that can survive the requirement that the game measure smoother afterwards.
 */
const IMPACT_KEY = 'flywayImpact'
/** Below this the lens is imperceptible, so the pass is detached rather than
 * left running at a strength nobody can see. */
const LENS_OFF = 0.012
const LENS_DECAY = 7.5

const IMPACT_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float amount;
varying vec2 outTexCoord;
void main () {
  vec2 d = outTexCoord - 0.5;
  float r2 = dot(d, d);
  vec2 uv = 0.5 + d * (1.0 - amount * 0.05 * (0.25 + r2));
  vec2 off = d * amount * (0.004 + r2 * 0.018);
  vec4 c = texture2D(uMainSampler, uv);
  c.r = texture2D(uMainSampler, uv + off).r;
  c.b = texture2D(uMainSampler, uv - off).b;
  gl_FragColor = c;
}
`

/**
 * One radial pass doing chromatic split and a lens pinch together. They are
 * one uniform because they are one physical idea - a lens being struck - and
 * splitting them would let a caller fire half an impact.
 */
class ImpactPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  amount = 0

  constructor(game: Phaser.Game) {
    super({ game, name: IMPACT_KEY, fragShader: IMPACT_FRAG })
  }

  onPreRender(): void {
    this.set1f('amount', this.amount)
  }
}

/**
 * A permission slip for a whole-screen moment. It exists so that firing one
 * costs two lines and a null check at the call site instead of one word -
 * see the module header on why casual spectacle is the defect.
 */
export interface SpectacleTicket {
  readonly reason: string
  readonly id: number
}

export type VFXTier = 'ambient' | 'feedback' | 'reward' | 'spectacle'

const BEAT_NONE = 0
const BEAT_FAILURE = 1
const BEAT_SUCCESS = 2
const BEAT_REVEAL = 3

export class VFXDirector {
  private scene: Phaser.Scene
  private cam: Phaser.Cameras.Scene2D.Camera

  private imgs: Phaser.GameObjects.Image[] = []
  /** Free slots as a stack, so acquiring one is O(1) rather than the linear
   * scan the sparkle pool does - this pool is four times larger and is walked
   * on impact frames, when there is least room to spare. */
  private free: Int32Array
  private freeTop = 0
  private live: Int32Array
  private liveN = 0
  /** Where slot i sits inside `live`, so releasing is a swap-remove. */
  private at: Int32Array

  private kind: Int32Array
  private tint: Int32Array
  private age: Float32Array
  private tBuild: Float32Array
  private tImpact: Float32Array
  private tLife: Float32Array
  private px: Float32Array
  private py: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private drag: Float32Array
  private grav: Float32Array
  private s0: Float32Array
  private s1: Float32Array
  private peak: Float32Array
  private spin: Float32Array
  /**
   * Reciprocal of each slot's source frame size, cached at spawn.
   * `setDisplaySize` looks the frame up and divides by it every time it is
   * called, which at 70 live effects is 140 divisions and 140 property chains
   * per frame for numbers that cannot change while a slot is alive.
   */
  private invW: Float32Array
  private invH: Float32Array
  /** Last texture / depth / scroll factor written per slot, so the setters are
   * only touched on a real change - `setDepth` dirties the display list's
   * sort, and a dirty sort allocates a new sorted array for the WHOLE scene. */
  private curKind: Int32Array
  private curDepth: Float32Array
  private curScroll: Int32Array

  /** Envelope scratch. Two fields rather than a returned pair, because a
   * returned object here would allocate once per live effect per frame. */
  private envA = 0
  private envS = 0

  // -- stillness -------------------------------------------------------------
  private hushTarget = 0
  private hushAmt = 0
  private hushHold = 0
  /**
   * Ambient scale, 1 = the world as normal, HUSH_FLOOR = held breath. Read
   * this every frame and multiply it into ambient emitter rates, wisp drift
   * and bed gain; the director already applies it to its own ambient tier.
   */
  calm = 1

  // -- transient grade -------------------------------------------------------
  /**
   * Additive lift on the scene's calibrated bloom, 0..1. The scene owns the
   * bloom object and rewrites it every frame from daylight, so this is exposed
   * as a delta to ADD rather than written here - otherwise nightfall would
   * clobber every impact on the following frame.
   */
  bloomLift = 0
  private lens = 0
  private lensAttached = false
  private pipeOK = false

  // -- spectacle gating ------------------------------------------------------
  private lastSpectacle = -999
  private clock = 0
  private ticketId = 0
  private liveTicket = -1

  // -- staged beats ----------------------------------------------------------
  private beatT: Float32Array
  private beatKind: Int32Array
  private beatX: Float32Array
  private beatY: Float32Array
  private beatP: Float32Array

  // -- ambient budget --------------------------------------------------------
  private ambientBudget = 0

  /**
   * Set false to run without the custom post pipeline; every effect still
   * fires, minus the chromatic split. Also flipped automatically if the
   * renderer is Canvas or the pipeline fails to register, so a shader problem
   * degrades to the sprite path instead of taking the frame with it.
   */
  useLens = true

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.cam = scene.cameras.main

    this.free = new Int32Array(POOL)
    this.live = new Int32Array(POOL)
    this.at = new Int32Array(POOL)
    this.kind = new Int32Array(POOL)
    this.tint = new Int32Array(POOL)
    this.age = new Float32Array(POOL)
    this.tBuild = new Float32Array(POOL)
    this.tImpact = new Float32Array(POOL)
    this.tLife = new Float32Array(POOL)
    this.px = new Float32Array(POOL)
    this.py = new Float32Array(POOL)
    this.vx = new Float32Array(POOL)
    this.vy = new Float32Array(POOL)
    this.drag = new Float32Array(POOL)
    this.grav = new Float32Array(POOL)
    this.s0 = new Float32Array(POOL)
    this.s1 = new Float32Array(POOL)
    this.peak = new Float32Array(POOL)
    this.spin = new Float32Array(POOL)
    this.invW = new Float32Array(POOL)
    this.invH = new Float32Array(POOL)
    this.curKind = new Int32Array(POOL)
    this.curDepth = new Float32Array(POOL)
    this.curScroll = new Int32Array(POOL)

    for (let i = 0; i < POOL; i++) {
      const img = scene.add
        .image(0, 0, KIND_TEX[K_GLOW])
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(D_WORLD)
        .setVisible(false)
        .setActive(false)
      this.imgs.push(img)
      this.free[i] = i
      this.at[i] = -1
      this.curKind[i] = K_GLOW
      this.curDepth[i] = D_WORLD
      this.curScroll[i] = 1
      this.invW[i] = 1 / img.frame.realWidth
      this.invH[i] = 1 / img.frame.realHeight
    }
    this.freeTop = POOL

    this.beatT = new Float32Array(BEATS)
    this.beatKind = new Int32Array(BEATS)
    this.beatX = new Float32Array(BEATS)
    this.beatY = new Float32Array(BEATS)
    this.beatP = new Float32Array(BEATS)

    this.registerPipeline()
  }

  private registerPipeline(): void {
    const rend = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer
    // Canvas has no shaders at all, and a half-registered pipeline would throw
    // once per frame rather than once - fall back loudly here, silently later.
    if (!rend || rend.type !== Phaser.WEBGL || !rend.pipelines) {
      this.useLens = false
      return
    }
    try {
      if (!rend.pipelines.has(IMPACT_KEY)) rend.pipelines.addPostPipeline(IMPACT_KEY, ImpactPipeline)
      this.pipeOK = true
    } catch {
      this.pipeOK = false
      this.useLens = false
    }
  }

  // ==================================================================== pool

  /**
   * Positional rather than a config object, and private for the same reason:
   * this is the hot path, and an object literal here is the module's whole
   * allocation budget spent on syntax sugar. Callers use the named API below.
   */
  private spawn(
    kind: number,
    x: number,
    y: number,
    size0: number,
    size1: number,
    alpha: number,
    tint: number,
    build: number,
    impact: number,
    life: number,
    vx: number,
    vy: number,
    drag: number,
    grav: number,
    rot: number,
    spin: number,
    screen: boolean,
    depth: number,
  ): void {
    if (this.freeTop === 0) return // see POOL: overflow is dropped, never grown
    const i = this.free[--this.freeTop]

    this.kind[i] = kind
    this.tint[i] = tint
    this.age[i] = 0
    this.tBuild[i] = build
    this.tImpact[i] = impact
    this.tLife[i] = life
    this.px[i] = x
    this.py[i] = y
    this.vx[i] = vx
    this.vy[i] = vy
    this.drag[i] = drag
    this.grav[i] = grav
    this.s0[i] = size0
    this.s1[i] = size1
    this.peak[i] = alpha
    this.spin[i] = spin

    const img = this.imgs[i]
    if (this.curKind[i] !== kind) {
      img.setTexture(KIND_TEX[kind])
      this.curKind[i] = kind
      this.invW[i] = 1 / img.frame.realWidth
      this.invH[i] = 1 / img.frame.realHeight
    }
    if (this.curDepth[i] !== depth) {
      img.setDepth(depth)
      this.curDepth[i] = depth
    }
    const sf = screen ? 0 : 1
    if (this.curScroll[i] !== sf) {
      img.setScrollFactor(sf)
      this.curScroll[i] = sf
    }
    img.setPosition(x, y)
    img.setTint(tint)
    img.setRotation(rot)
    this.size(i, size0, size0)
    // Born at zero and grown by the envelope on the very first step: an effect
    // whose first drawn frame is already bright is the pop this module deletes.
    img.setAlpha(0)
    img.setActive(true).setVisible(true)

    this.at[i] = this.liveN
    this.live[this.liveN++] = i
  }

  /** `setDisplaySize` in target pixels, without its per-call frame lookup and
   * division - see `invW`. */
  private size(i: number, w: number, h: number): void {
    this.imgs[i].setScale(w * this.invW[i], h * this.invH[i])
  }

  private release(i: number): void {
    const img = this.imgs[i]
    img.setActive(false).setVisible(false)
    const slot = this.at[i]
    const last = this.live[--this.liveN]
    this.live[slot] = last
    this.at[last] = slot
    this.at[i] = -1
    this.free[this.freeTop++] = i
  }

  /**
   * buildup -> impact -> decay as one branchless-enough envelope, written into
   * `envA` / `envS`.
   *
   * Alpha gathers quietly through the buildup (a squared ramp to about a third
   * of peak), snaps to full across the impact, then falls away squared. Size
   * is deliberately FROZEN during the buildup and only expands afterwards, so
   * the shape reads as something coiling and then being let go, rather than as
   * something simply growing.
   */
  private envelope(i: number): void {
    const t = this.age[i]
    const b = this.tBuild[i]
    const m = this.tImpact[i]
    const life = this.tLife[i]
    const p = this.peak[i]

    if (t < b) {
      const u = t / b
      this.envA = p * 0.38 * u * u
    } else if (t < b + m) {
      const v = m > 0 ? (t - b) / m : 1
      const e = 1 - (1 - v) * (1 - v)
      this.envA = p * (0.38 + 0.62 * e)
    } else {
      const w = (t - b - m) / Math.max(1e-4, life - b - m)
      const k = 1 - w
      this.envA = p * k * k
    }

    const g = Phaser.Math.Clamp((t - b) / Math.max(1e-4, life - b), 0, 1)
    const o = 1 - g
    this.envS = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - o * o * o)
  }

  // ================================================================== update

  /**
   * @param dt   the scene's already-slowed dt. Effects ride this so that a
   *             hit-stop actually holds the impact still, which is the entire
   *             point of having one.
   * @param rawDt real seconds. Only the stillness ramp and the lens decay use
   *             it - a held breath that slows down with the world would never
   *             end, and the lens is a camera artefact, not a world event.
   */
  update(dt: number, rawDt: number): void {
    this.clock += rawDt
    this.stepHush(rawDt)
    this.stepBeats(rawDt)
    this.stepLens(rawDt)

    for (let n = this.liveN - 1; n >= 0; n--) {
      const i = this.live[n]
      this.age[i] += dt
      if (this.age[i] >= this.tLife[i]) {
        this.release(i)
        continue
      }
      this.envelope(i)

      const d = Math.exp(-this.drag[i] * dt)
      this.vx[i] *= d
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt

      const img = this.imgs[i]
      img.x = this.px[i]
      img.y = this.py[i]
      img.setAlpha(this.envA)
      if (this.spin[i] !== 0) img.rotation += this.spin[i] * dt

      const k = this.kind[i]
      if (k === K_STREAK) {
        // a streak keeps its 32:1 art ratio - scaling it square turns a line
        // of speed into a smear, which reads as blur rather than as motion
        this.size(i, this.envS, Math.max(2, this.envS * 0.055))
      } else if (k === K_SHAFT) {
        this.size(i, Math.max(4, this.envS * 0.22), this.envS)
      } else {
        this.size(i, this.envS, this.envS)
      }
    }
  }

  private stepHush(rawDt: number): void {
    if (this.hushHold > 0) {
      this.hushHold -= rawDt
      if (this.hushHold <= 0) this.hushTarget = 0
    }
    const rate = this.hushTarget > this.hushAmt ? HUSH_IN_RATE : HUSH_OUT_RATE
    this.hushAmt += (this.hushTarget - this.hushAmt) * (1 - Math.exp(-rate * rawDt))
    this.calm = 1 - this.hushAmt * (1 - HUSH_FLOOR)
  }

  private stepBeats(rawDt: number): void {
    for (let i = 0; i < BEATS; i++) {
      if (this.beatKind[i] === BEAT_NONE) continue
      this.beatT[i] -= rawDt
      if (this.beatT[i] > 0) continue
      const k = this.beatKind[i]
      this.beatKind[i] = BEAT_NONE
      if (k === BEAT_FAILURE) this.fireFailure(this.beatX[i], this.beatY[i], this.beatP[i])
      else if (k === BEAT_SUCCESS) this.fireSuccess(this.beatX[i], this.beatY[i], this.beatP[i])
      else this.fireReveal(this.beatX[i], this.beatY[i], this.beatP[i])
    }
  }

  private schedule(kind: number, delay: number, x: number, y: number, p: number): void {
    for (let i = 0; i < BEATS; i++) {
      if (this.beatKind[i] !== BEAT_NONE) continue
      this.beatKind[i] = kind
      this.beatT[i] = delay
      this.beatX[i] = x
      this.beatY[i] = y
      this.beatP[i] = p
      return
    }
  }

  private stepLens(rawDt: number): void {
    if (this.bloomLift > 0) {
      this.bloomLift -= this.bloomLift * (1 - Math.exp(-6 * rawDt)) + rawDt * 0.15
      if (this.bloomLift < 0.002) this.bloomLift = 0
    }
    if (this.lens <= 0) return
    this.lens *= Math.exp(-LENS_DECAY * rawDt)
    if (this.lens < LENS_OFF) {
      this.lens = 0
      this.detachLens()
      return
    }
    const pipe = this.lensPipe()
    if (pipe) pipe.amount = this.lens
  }

  /** Cached across the decay. Phaser's getPostPipeline allocates a results
   * array internally on every call, and this ran every frame the lens was
   * decaying — in the module that documents itself as allocation-free. */
  private lensCache: ImpactPipeline | null = null

  private lensPipe(): ImpactPipeline | null {
    if (this.lensCache) return this.lensCache
    const got = this.cam.getPostPipeline(ImpactPipeline)
    if (!got) return null
    this.lensCache = (Array.isArray(got) ? got[0] : got) as ImpactPipeline
    return this.lensCache
  }

  /**
   * Strength 0..1, and it is deliberately not a public verb: the lens is a
   * seasoning on an impact that is already carried by sprites, never the
   * impact itself. Attaching only on demand is what keeps the steady-state
   * frame free of an extra full-screen pass.
   */
  private strikeLens(amount: number): void {
    if (!this.useLens || !this.pipeOK) return
    this.lens = Math.max(this.lens, Phaser.Math.Clamp(amount, 0, 1))
    if (this.lensAttached) return
    try {
      this.cam.setPostPipeline(ImpactPipeline)
      this.lensAttached = true
    } catch {
      this.pipeOK = false
      this.useLens = false
    }
  }

  private detachLens(): void {
    if (!this.lensAttached) return
    this.lensAttached = false
    try {
      // remove the INSTANCE we hold, never `resetPostPipeline` - the scene's
      // calibrated bloom lives on the same camera and would go with it
      const pipe = this.lensPipe()
      if (pipe) this.cam.removePostPipeline(pipe)
      this.lensCache = null // the cache must not outlive the pipeline it points at
    } catch {
      /* the camera is being torn down; nothing to restore */
    }
  }

  // =============================================================== stillness

  /**
   * Ease the world down and hold it there. Call it BEFORE the beat, not with
   * it - the silence is what makes the beat land, so it has to arrive first.
   * Spectacle-tier effects do this for themselves; everything else should ask.
   *
   * @param holdSeconds how long to stay quiet before releasing. The release is
   *        slow by design and is not part of this number.
   */
  stillness(holdSeconds = HUSH_LEAD): void {
    this.hushTarget = 1
    this.hushHold = Math.max(this.hushHold, holdSeconds)
  }

  /** Let the world back in early - for an interruption, not for tidiness. */
  releaseStillness(): void {
    this.hushHold = 0
    this.hushTarget = 0
  }

  // ============================================================== spectacle

  /**
   * Ask for the screen. Returns null if the last spectacle is still recent
   * enough that a second one would erase it rather than top it. A null here is
   * a correct answer, not an error - drop the beat and let the reward tier
   * carry it.
   */
  requestSpectacle(reason: string): SpectacleTicket | null {
    if (this.clock - this.lastSpectacle < SPECTACLE_MIN_GAP) return null
    this.lastSpectacle = this.clock
    this.ticketId++
    this.liveTicket = this.ticketId
    return { reason, id: this.ticketId }
  }

  private redeem(t: SpectacleTicket | null): boolean {
    if (!t || t.id !== this.liveTicket) return false
    this.liveTicket = -1 // one moment per ticket; a reused ticket is a bug
    return true
  }

  // ================================================================ ambient

  /**
   * TIER: ambient. The world breathing - dust lifting off a ruin, a warm
   * flicker where light pools. Rate-limited by a budget accumulator rather
   * than a per-frame chance, so it cannot burst, and scaled by `calm`, so it
   * is the first thing to fall silent before a beat.
   *
   * @param intensity 0..1 - how alive this stretch of world is.
   */
  environmentPulse(x: number, y: number, tint: number, intensity: number, dt: number): void {
    this.ambientBudget += intensity * this.calm * 5 * dt
    if (this.ambientBudget < 1) return
    this.ambientBudget -= 1
    const g = TIER_GAIN.ambient
    const r = Math.random()
    this.spawn(
      K_GLOW,
      x + (r - 0.5) * 90,
      y + (Math.random() - 0.5) * 70,
      14,
      44,
      0.5 * g,
      tint,
      0.5,
      0.18,
      1.9,
      (r - 0.5) * 12,
      -16 - r * 14,
      0.5,
      0,
      0,
      0,
      false,
      D_WORLD - 0.4,
    )
  }

  // =============================================================== feedback

  /**
   * TIER: feedback. Something nearly hit you. Reads as air being displaced
   * past the flock, not as a hit - two short streaks raking away from the
   * obstacle, and no colour shift, because a near miss is information rather
   * than a reward.
   *
   * @param angle radians, the direction the danger passed in.
   */
  nearMiss(x: number, y: number, angle: number, strength = 1): void {
    const g = TIER_GAIN.feedback * Phaser.Math.Clamp(strength, 0, 1)
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    for (let i = 0; i < 2; i++) {
      const off = i === 0 ? 26 : -26
      this.spawn(
        K_STREAK,
        x - s * off,
        y + c * off,
        90,
        260,
        0.5 * g,
        0xd8e2ff,
        0.05,
        0.06,
        0.32,
        c * 210,
        s * 210,
        3.4,
        0,
        angle,
        0,
        false,
        D_WORLD,
      )
    }
  }

  /**
   * TIER: feedback. Contact with the flock's own body - a graze, a bird
   * clipped, a landing. Feathers, because they are the one debris in this game
   * that says whose it was.
   */
  featherBurst(x: number, y: number, count = 5, tint = 0xf6e7cd): void {
    const n = Math.min(count, 8) // eight is already a puff; more is a pillow
    const g = TIER_GAIN.feedback
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 60 + Math.random() * 130
      this.spawn(
        K_DEBRIS,
        x,
        y,
        18,
        26,
        0.85 * g,
        tint,
        0.04,
        0.08,
        0.75 + Math.random() * 0.4,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 40,
        2.1,
        180,
        a,
        (Math.random() - 0.5) * 6,
        false,
        D_WORLD + 0.1,
      )
    }
  }

  /**
   * TIER: feedback. Moving air made visible - a gust band, an updraft, a
   * thermal. Long, thin, slow, and always travelling: wind that sits still
   * reads as a decal.
   *
   * @param dirX,dirY unit-ish direction the air is moving.
   */
  windBurst(x: number, y: number, dirX: number, dirY: number, strength = 1): void {
    const g = TIER_GAIN.feedback * Phaser.Math.Clamp(strength, 0, 1)
    const a = Math.atan2(dirY, dirX)
    const sp = 260 + 220 * strength
    for (let i = 0; i < 3; i++) {
      const j = (i - 1) * 46
      this.spawn(
        K_STREAK,
        x - dirY * j,
        y + dirX * j,
        140,
        420 + 180 * strength,
        0.3 * g,
        0xe9f0ff,
        0.16, // a long gather: wind arrives before it passes
        0.1,
        0.72,
        dirX * sp,
        dirY * sp,
        1.5,
        0,
        a,
        0,
        false,
        D_WORLD - 0.2,
      )
    }
  }

  // ================================================================= reward

  /**
   * TIER: reward. You did the thing well - a clean gate, a held formation, a
   * chain rung. One ring that gathers inward and then releases outward, which
   * is the only shape in this vocabulary that says "that was YOURS" rather
   * than "something happened".
   */
  perfectMove(x: number, y: number, tint = 0xffd9a0, strength = 1): void {
    const g = TIER_GAIN.reward * Phaser.Math.Clamp(strength, 0.3, 1)
    this.spawn(K_RING, x, y, 120, 340, 0.5 * g, tint, 0.13, 0.09, 0.62, 0, 0, 0, 0, 0, 0, false, D_WORLD)
    // a soft core under the ring so the beat has a centre to have come FROM
    this.spawn(K_GLOW, x, y, 40, 190, 0.36 * g, tint, 0.13, 0.07, 0.52, 0, 0, 0, 0, 0, 0, false, D_WORLD - 0.05)
    this.bloomLift = Math.max(this.bloomLift, 0.22 * g)
  }

  /**
   * TIER: reward. A checkpoint claimed. Deliberately vertical and slow where
   * `perfectMove` is radial and quick - the player must be able to tell a
   * place they reached from a thing they did, without reading text.
   */
  checkpoint(x: number, y: number, tint = 0xffe0a8): void {
    const g = TIER_GAIN.reward
    this.spawn(K_SHAFT, x, y - 120, 300, 620, 0.34 * g, tint, 0.3, 0.22, 1.5, 0, -30, 0.9, 0, 0, 0, false, D_WORLD - 0.3)
    this.spawn(K_RING, x, y, 90, 420, 0.4 * g, tint, 0.3, 0.12, 1.05, 0, 0, 0, 0, 0, 0, false, D_WORLD)
    this.bloomLift = Math.max(this.bloomLift, 0.3)
  }

  /**
   * TIER: reward. Surge, dive release, tailwind discharge - speed you earned.
   * The streaks trail BACKWARD from the flock rather than leading it, because
   * the flock is what the eye is tracking and streaks in front of it read as
   * obstacles.
   */
  speedBurst(x: number, y: number, headingX: number, headingY: number, strength = 1): void {
    const s = Phaser.Math.Clamp(strength, 0, 1)
    const g = TIER_GAIN.reward * s
    const a = Math.atan2(headingY, headingX)
    const n = 3 + Math.round(s * 3)
    for (let i = 0; i < n; i++) {
      const j = (Math.random() - 0.5) * 190
      this.spawn(
        K_STREAK,
        x - headingX * 70 - headingY * j,
        y - headingY * 70 + headingX * j,
        120,
        380 + 220 * s,
        0.45 * g,
        0xfff0d2,
        0.05,
        0.07,
        0.34,
        -headingX * (300 + 300 * s),
        -headingY * (300 + 300 * s),
        2.6,
        0,
        a,
        0,
        false,
        D_WORLD - 0.1,
      )
    }
    this.bloomLift = Math.max(this.bloomLift, 0.18 * g)
  }

  /**
   * TIER: reward. A hard, local consequence - a column broken, a cage burst, a
   * falcon driven off. This is the one reward-tier effect allowed to touch the
   * lens, and only for the ~150ms the ring is still expanding.
   */
  shockwave(x: number, y: number, radius = 460, tint = 0xffffff, strength = 1): void {
    const s = Phaser.Math.Clamp(strength, 0, 1)
    const g = TIER_GAIN.reward * s
    this.spawn(K_RING, x, y, radius * 0.16, radius, 0.6 * g, tint, 0.06, 0.07, 0.46, 0, 0, 0, 0, 0, 0, false, D_WORLD + 0.2)
    this.spawn(K_GLOW, x, y, radius * 0.5, radius * 0.1, 0.4 * g, tint, 0.06, 0.05, 0.3, 0, 0, 0, 0, 0, 0, false, D_WORLD)
    this.bloomLift = Math.max(this.bloomLift, 0.34 * g)
    this.strikeLens(0.3 * s)
  }

  // ============================================================== spectacle

  /**
   * TIER: spectacle. The frame changes. Requires a ticket from
   * `requestSpectacle`, and stages itself: the world goes quiet FIRST and the
   * light arrives 350ms later, into the silence.
   *
   * Returns false if the ticket was refused or already spent, in which case
   * nothing at all happened and the caller should fall back to a reward-tier
   * beat rather than retrying.
   */
  reveal(t: SpectacleTicket | null, x: number, y: number, strength = 1): boolean {
    if (!this.redeem(t)) return false
    this.stillness(HUSH_LEAD + 0.5)
    this.schedule(BEAT_REVEAL, HUSH_LEAD, x, y, Phaser.Math.Clamp(strength, 0, 1))
    return true
  }

  /** TIER: spectacle. The flock scattered / the run is lost. See `reveal`. */
  failureImpact(t: SpectacleTicket | null, x: number, y: number, strength = 1): boolean {
    if (!this.redeem(t)) return false
    this.stillness(HUSH_LEAD + 0.7)
    this.schedule(BEAT_FAILURE, HUSH_LEAD, x, y, Phaser.Math.Clamp(strength, 0, 1))
    return true
  }

  /** TIER: spectacle. The roost, the arrival, the graded landing. See `reveal`. */
  successMoment(t: SpectacleTicket | null, x: number, y: number, strength = 1): boolean {
    if (!this.redeem(t)) return false
    this.stillness(HUSH_LEAD + 0.9)
    this.schedule(BEAT_SUCCESS, HUSH_LEAD, x, y, Phaser.Math.Clamp(strength, 0, 1))
    return true
  }

  /**
   * The screen opening. A wash that grows from nothing at the focus and a wide
   * slow ring - the only full-screen quad this module ever creates, and it
   * lives for under two seconds.
   */
  private fireReveal(x: number, y: number, p: number): void {
    const g = TIER_GAIN.spectacle * p
    this.spawn(K_WASH, VIEW_W * 0.5, VIEW_H * 0.5, VIEW_W * 0.35, VIEW_W * 1.7, 0.26 * g, 0xfff2d8, 0.34, 0.3, 1.7, 0, 0, 0, 0, 0, 0, true, D_SCREEN)
    this.spawn(K_RING, x, y, 200, 1500, 0.42 * g, 0xffe9c4, 0.3, 0.16, 1.35, 0, 0, 0, 0, 0, 0, false, D_WORLD + 0.3)
    this.spawn(K_SHAFT, x, y - 200, 520, 1000, 0.3 * g, 0xfff0d2, 0.34, 0.3, 1.6, 0, -40, 0.8, 0, 0, 0, false, D_WORLD - 0.3)
    this.bloomLift = Math.max(this.bloomLift, 0.6 * g)
    this.strikeLens(0.28 * p)
  }

  /**
   * Loss is COLD and it collapses inward - the opposite motion to every reward
   * in the vocabulary, so it cannot be misread as one even at a glance.
   */
  private fireFailure(x: number, y: number, p: number): void {
    const g = TIER_GAIN.spectacle * p
    this.spawn(K_WASH, VIEW_W * 0.5, VIEW_H * 0.5, VIEW_W * 1.9, VIEW_W * 0.6, 0.4 * g, 0x2a2450, 0.1, 0.12, 1.25, 0, 0, 0, 0, 0, 0, true, D_SCREEN)
    this.spawn(K_RING, x, y, 900, 120, 0.5 * g, 0x8f8fd0, 0.08, 0.1, 0.85, 0, 0, 0, 0, 0, 0, false, D_WORLD + 0.3)
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2
      this.spawn(K_DEBRIS, x + Math.cos(a) * 150, y + Math.sin(a) * 110, 22, 30, 0.7 * g, 0xbfb6d8, 0.06, 0.1, 1.3, Math.cos(a) * 70, Math.sin(a) * 40 - 20, 1.3, 210, a, (Math.random() - 0.5) * 5, false, D_WORLD + 0.1)
    }
    this.strikeLens(0.55 * p)
  }

  /** Arrival is WARM and it opens. Slower than anything else here on purpose:
   * the run is over, and there is nothing left to be legible for. */
  private fireSuccess(x: number, y: number, p: number): void {
    const g = TIER_GAIN.spectacle * p
    this.spawn(K_WASH, VIEW_W * 0.5, VIEW_H * 0.5, VIEW_W * 0.2, VIEW_W * 2, 0.34 * g, 0xffd9a0, 0.4, 0.5, 2.4, 0, 0, 0, 0, 0, 0, true, D_SCREEN)
    this.spawn(K_RING, x, y, 140, 1300, 0.46 * g, 0xffe0a8, 0.4, 0.3, 2, 0, 0, 0, 0, 0, 0, false, D_WORLD + 0.3)
    this.spawn(K_GLOW, x, y, 90, 720, 0.4 * g, 0xfff2d8, 0.4, 0.4, 2.2, 0, -18, 0.6, 0, 0, 0, false, D_WORLD)
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.2
      this.spawn(K_DEBRIS, x, y, 20, 28, 0.6 * g, 0xf6e7cd, 0.3, 0.2, 2.1, Math.cos(a) * 90, Math.sin(a) * 110, 1, -30, a, (Math.random() - 0.5) * 3, false, D_WORLD + 0.1)
    }
    this.bloomLift = Math.max(this.bloomLift, 0.7 * g)
    this.strikeLens(0.2 * p)
  }

  // ============================================================ diagnostics

  /** Live effect count - for the profiler and the debug overlay, not for logic. */
  get liveCount(): number {
    return this.liveN
  }

  // ============================================================== lifecycle

  /** Silence everything without tearing down the pool (checkpoint respawn). */
  reset(): void {
    for (let n = this.liveN - 1; n >= 0; n--) this.release(this.live[n])
    for (let i = 0; i < BEATS; i++) this.beatKind[i] = BEAT_NONE
    this.hushTarget = 0
    this.hushHold = 0
    this.hushAmt = 0
    this.calm = 1
    this.bloomLift = 0
    this.lens = 0
    this.liveTicket = -1
    this.detachLens()
  }

  /** Release everything this layer owns (scene restart). */
  destroy(): void {
    this.detachLens()
    for (const img of this.imgs) img.destroy()
    this.imgs.length = 0
    this.liveN = 0
    this.freeTop = 0
  }
}

/**
 * Set an alpha AND take the quad out of the render entirely when it is not
 * doing anything.
 *
 * Eight stacked full-screen quads currently carry all the mood work, and the
 * ones in the act-plate stack rewrite their alpha every frame and stay VISIBLE
 * at values around 0.056 - a value no player can see, costing a full 1536x960
 * blend each, every frame, on the device least able to afford it. This is a
 * drop-in replacement for `rect.setAlpha(a)` at those call sites; below the
 * threshold the object stops being drawn instead of being drawn invisibly.
 *
 * Allocation-free and idempotent, so it is safe in a per-frame path.
 */
export function gateQuad(rect: Phaser.GameObjects.Rectangle, alpha: number): void {
  // THE THRESHOLD HAS TO MATCH THE ALPHAS ACTUALLY IN USE. At 0.004 this never
  // fired once: the act plates are scaled by k = 0.28 when painted skies are
  // present, which puts them at 0.056-0.095 — measured as DRAWN every frame,
  // at the very alpha the docstring calls invisible.
  //
  // 0.06 is set against that measurement. Below it a full-screen wash cannot
  // be told from the frame behind it, and skipping it removes a whole-screen
  // blend; above it the quad is doing visible work and must stay.
  const on = alpha > 0.06
  if (rect.visible !== on) rect.setVisible(on)
  if (on) rect.setAlpha(alpha)
}
