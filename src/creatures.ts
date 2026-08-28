import Phaser from 'phaser'
import { Flock, Bird } from './flock'
import { ART } from './artManifest'
import { W as VIEW_W } from './backdrop'

/**
 * CREATURES — the two living hazards that want the flock's LIGHT rather than
 * its birds.
 *
 * The falcon takes birds; nightfall takes stragglers. Neither argues with the
 * fuel economy, so daylight was a resource with exactly one predator (the
 * clock). These two put the light itself under threat, and each is answered by
 * a different verb the player already owns:
 *
 *   night-moths  — answered by going WIDE (spread) or by a Flare
 *   light-thief  — answered by Vortex, the flock spiralling around it
 *
 * Three hard rules, all learned the expensive way:
 *
 *  1. NOTHING MOVES RANDOMLY. Every creature rides a `Patrol`, which is a
 *     closed-form function of a phase clock rather than an integrator. A player
 *     can watch a moth cluster for two seconds and know where it will be in the
 *     third, and it will still be there on the next attempt. A hazard you can
 *     read is a skill test; one you cannot is noise, and noise in a game about
 *     committing to a line is just an unfair tax.
 *  2. NO REPEATING TWEENS, NO PER-FRAME ALLOCATION. Object and tween count is
 *     this project's measured frame pressure, and garbage in the per-frame path
 *     is its measured #1 defect. Every sprite, buffer and scratch value below is
 *     built once in a constructor and reused; the update paths allocate nothing,
 *     use indexed loops rather than iterators, and never build an object literal.
 *  3. THE LIGHT GRAMMAR IS FIXED. Warm gold moving = fuel. The thief's hoard is
 *     STOLEN fuel, so it is warm gold and it is the only bird-shaped thing in
 *     the sky lit from within. Moths TAKE light and are not made of it, so they
 *     are tinted to murk — the painted pieces are pale and warm out of the box,
 *     and shipping them untinted would put them on the wrong side of the whole
 *     grammar.
 *
 * Both systems are self-contained: constructed with the scene, advanced once a
 * frame, publishing plain read-only state. Nothing here reaches into DayScene,
 * and nothing here needs DayScene to function — every callback and setter below
 * is optional enrichment, and the creature is complete without it.
 */

// --------------------------------------------------------------- depth plane
// Birds fly at BIRD_DEPTH (3.6), obstacles at 3, motes at 2.5. Creatures have
// to be IN the play space and, critically, an attached moth has to be visible
// ON the bird it is riding — behind the flock it would be invisible exactly
// when the player most needs to count them. Everything authored to sit over the
// flock (leader glow 3.9, sparks 4, near dust 5, foreground 6/6.6, falcon 8/9,
// fog 11) still keeps its claim in front.
const MOTH_CLUSTER_DEPTH = 3.68
const MOTH_DEPTH = 3.7
const THIEF_TRAIL_DEPTH = 3.76
const THIEF_DEPTH = 3.78
const THIEF_EMBER_DEPTH = 3.79
const BURST_DEPTH = 3.82

const TAU = Math.PI * 2

/** Construction-time only. Seeded so a cluster looks identical every run — a
 * patrol the player memorised on one attempt must be the same on the next. */
let RSEED = 0x5eed1e
function rnd(): number {
  RSEED = (RSEED * 1664525 + 1013904223) >>> 0
  return RSEED / 4294967296
}

// ============================================================================
// ART PLUMBING
// ============================================================================

/** First key in the list that actually loaded. Every creature piece is guarded:
 * a missing asset must degrade to a smaller sprite, never take the frame down
 * with a texture-not-found. */
function firstKey(scene: Phaser.Scene, keys: readonly string[], last: string): string {
  for (let i = 0; i < keys.length; i++) if (scene.textures.exists(keys[i])) return keys[i]
  return last
}

/**
 * Size a manifest piece by its LONGEST axis, preserving aspect.
 *
 * Fitting by height is the obvious choice and is wrong for the thief: its poses
 * run from 346x163 (level flight) to 295x336 (launch), so a shared height would
 * blow the level pose out to 250px wide — more than twice the launch pose's
 * apparent mass — and the bird would appear to change SIZE every time it
 * changed state. Longest-axis holds its apparent size constant across the swap,
 * which is the only way a pose change reads as animation rather than a glitch.
 */
function fitLongest(img: Phaser.GameObjects.Image, key: string, span: number): void {
  const p = ART[key]
  const w = p ? p.w : img.frame.width
  const h = p ? p.h : img.frame.height
  const k = span / Math.max(w, h)
  img.setDisplaySize(w * k, h * k)
}

/** Size a piece by height, preserving aspect — a moth is read by how tall it
 * sits against the sky, and the six painted smalls have wildly different aspect
 * ratios (56x50 through 84x70), so a shared WIDTH would make them uneven. */
function fitHeight(img: Phaser.GameObjects.Image, key: string, height: number): void {
  const p = ART[key]
  const w = p ? p.w : img.frame.width
  const h = p ? p.h : img.frame.height
  const k = height / h
  img.setDisplaySize(w * k, h * k)
}

// FX textures. These are the only procedural pieces left — they are effects,
// not creature art, and neither is worth an asset.
const GLOW_TEX = 'creature_glow'
const STREAK_TEX = 'creature_streak'

function makeGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_TEX)) return
  const size = 64
  const canvas = scene.textures.createCanvas(GLOW_TEX, size, size)
  if (!canvas) return
  const ctx = canvas.context
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.28, 'rgba(255,255,255,0.72)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.24)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  canvas.refresh()
}

function makeStreakTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(STREAK_TEX)) return
  const w = 128
  const h = 8
  const canvas = scene.textures.createCanvas(STREAK_TEX, w, h)
  if (!canvas) return
  const ctx = canvas.context
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // FEATHER THE OTHER AXIS. A linear gradient filled across a full-height rect
  // is soft on X and a HARD CUT on Y, so it renders as a rectangle with sharp
  // top and bottom edges — the owner saw these as "subtle squares" around the
  // birds. It is the identical defect that produced the black boxes in the fog,
  // where a gradient smooth on one axis was a straight edge on the other.
  // Masking with a vertical falloff makes every edge reach zero alpha.
  const fade = ctx.createLinearGradient(0, 0, 0, h)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.5, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  canvas.refresh()
}

/** Idempotent; both creature classes call it. */
export function createCreatureTextures(scene: Phaser.Scene): void {
  makeGlowTexture(scene)
  makeStreakTexture(scene)
}

// ============================================================================
// SHARED MOTION
// ============================================================================

export type PatrolMode = 'patrol' | 'hover' | 'shadow'

export interface PatrolSpec {
  mode: PatrolMode
  /** anchor: the centre of a patrol line, the perch of a hover */
  x: number
  y: number
  /** patrol: HALF-extent of the line, signed, so the axis can be diagonal */
  spanX?: number
  spanY?: number
  /** seconds for one full there-and-back (patrol) or one bob (hover/weave) */
  period?: number
  /** 0..1 start offset around the cycle — stagger a cluster with this */
  phase?: number
  /** hover: vertical bob amplitude */
  bob?: number
  /** shadow: the offset held from the flock centre */
  holdX?: number
  holdY?: number
  /** shadow: per-second approach rate toward the held offset */
  chase?: number
  /** shadow: lateral weave amplitude on top of the hold */
  weave?: number
}

/**
 * How much of the patrol sweep is constant-speed rather than eased.
 *
 * A pure sine eases everywhere, which reads as floaty and gives the player no
 * stretch of predictable travel to time an entry against. A pure triangle is
 * constant speed but its turns are instantaneous, which reads as a teleport at
 * each end. Blending them gives the Donkey Kong Country platform: a long
 * readable constant-speed run through the middle, decelerating into each turn
 * and accelerating back out. That deceleration is the tell a player commits on.
 */
const PATROL_LINEAR = 0.45

/**
 * One readable movement pattern, evaluated in closed form from a phase clock.
 *
 * Deliberately NOT a velocity integrator: an integrator drifts, and a hazard
 * that has drifted 40px from where the player learned it is a hazard they can
 * no longer commit to. Position is a pure function of `t`, so the pattern
 * repeats exactly, forever. `vx/vy` are reported for facing only.
 */
export class Patrol {
  mode: PatrolMode
  anchorX: number
  anchorY: number
  x: number
  y: number
  vx = 0
  vy = 0
  spanX: number
  spanY: number
  period: number
  bob: number
  holdX: number
  holdY: number
  chase: number
  weave: number
  /** 0..1 phase clock */
  t: number

  constructor(spec: PatrolSpec) {
    this.mode = spec.mode
    this.anchorX = spec.x
    this.anchorY = spec.y
    this.x = spec.x
    this.y = spec.y
    this.spanX = spec.spanX ?? 0
    this.spanY = spec.spanY ?? 0
    this.period = Math.max(0.2, spec.period ?? 4)
    this.bob = spec.bob ?? 18
    this.holdX = spec.holdX ?? 0
    this.holdY = spec.holdY ?? 0
    this.chase = spec.chase ?? 1.6
    this.weave = spec.weave ?? 0
    this.t = spec.phase ?? 0
  }

  moveAnchor(x: number, y: number): void {
    this.anchorX = x
    this.anchorY = y
  }

  setMode(mode: PatrolMode): void {
    this.mode = mode
  }

  /** `flock` is only read in 'shadow' mode; pass null for the other two. */
  step(dt: number, flock: Flock | null): void {
    if (dt <= 0) return
    this.t += dt / this.period
    if (this.t >= 1) this.t -= Math.floor(this.t)
    const px = this.x
    const py = this.y

    if (this.mode === 'patrol') {
      const s = Math.sin(TAU * this.t)
      // triangle in phase with the sine: +1 at t=0.25, -1 at t=0.75
      const tri = 1 - 4 * Math.abs(((this.t + 0.25) % 1) - 0.5)
      const p = s * (1 - PATROL_LINEAR) + tri * PATROL_LINEAR
      this.x = this.anchorX + this.spanX * p
      this.y = this.anchorY + this.spanY * p
    } else if (this.mode === 'hover') {
      // a bob with a slower, smaller sway across it: two incommensurate rates,
      // so it never looks like a sprite on a sine and still returns to the same
      // place on the same beat
      this.x = this.anchorX + Math.sin(TAU * this.t * 0.63) * this.bob * 0.45
      this.y = this.anchorY + Math.sin(TAU * this.t) * this.bob
    } else {
      // SHADOW: pace the flock at a held distance. The exponential approach is
      // what makes it read as "keeping station" rather than "welded to you" —
      // it lags on a hard turn and catches up on a straight, and that lag is
      // the window the player gets to work in.
      const cx = flock ? flock.centerX : this.anchorX
      const cy = flock ? flock.centerY : this.anchorY
      const wob = Math.sin(TAU * this.t)
      const k = 1 - Math.exp(-this.chase * dt)
      this.x += (cx + this.holdX + wob * this.weave * 0.6 - this.x) * k
      this.y += (cy + this.holdY + wob * this.weave - this.y) * k
    }

    this.vx = (this.x - px) / dt
    this.vy = (this.y - py) / dt
  }
}

// ============================================================================
// 1. NIGHT-MOTHS
// ============================================================================

export interface MothClusterSpec {
  x: number
  y: number
  /** how many moths. Kept small on purpose — see MOTHS_PER_CLUSTER_CAP. */
  count?: number
  /** HALF-extent of the cluster's patrol line. Both zero = it hovers. */
  spanX?: number
  spanY?: number
  /** seconds for one full sweep of that line */
  period?: number
  /**
   * A harmless cluster telegraphs and reaches, but never latches. The FIRST
   * cluster in the level is forced harmless regardless of what is passed here —
   * see the constructor.
   */
  harmless?: boolean
}

export interface Moth {
  x: number
  y: number
  /** riding a bird right now */
  attached: boolean
  /** index into flock.birds of the bird being ridden; -1 while free */
  birdIndex: number
  /** which cluster spec this moth belongs to */
  cluster: number
  /**
   * 0..1 — how far into its approach. THE TELEGRAPH. Nothing ever attaches
   * without first spending LURE_TIME visibly drifting out of the cluster toward
   * the flock, in plain sight, with a reversible outcome. Being latched is
   * therefore always something the player watched happen and declined to
   * answer, never something that simply occurred.
   */
  lure: number

  // ---- internal; readable, but the scene owns none of it
  ride: Bird | null
  /** the bird this moth is drifting toward, -1 for none */
  aim: number
  /** seconds before it may take an interest again (post-shed) */
  cool: number
  orbA: number
  orbR: number
  orbSpeed: number
  flapPhase: number
  flapFreq: number
  /** display height in px — the painted pieces are sized per moth so a cluster
   * does not look stamped from one die */
  size: number
  key: string
  vx: number
  vy: number
  sprite: Phaser.GameObjects.Image
}

interface MothCluster {
  patrol: Patrol
  harmless: boolean
  first: number
  count: number
  /** 0..1 — how far the painted cluster piece has broken into individuals */
  broken: number
  piece: Phaser.GameObjects.Image | null
}

/** The six painted individuals, cycled so no two neighbours share a frame. */
const MOTH_SMALL_KEYS = [
  'moth_small_01',
  'moth_small_02',
  'moth_small_03',
  'moth_small_04',
  'moth_small_05',
  'moth_small_06',
] as const
/** Two bigger moths lead each cluster, for silhouette variety in the swarm. */
const MOTH_LARGE_KEYS = ['moth_large_a', 'moth_large_b'] as const
const MOTH_CLUSTER_KEY = 'moth_cluster'

/**
 * Murk. The painted moths are pale, warm and pink out of the box — beautiful,
 * and on exactly the wrong side of the light grammar, where warm means fuel.
 * The tint multiplies them down into dusty violet-black so they read as a hole
 * the light falls into. Attached moths go darker still: the swarm on your birds
 * should look hungrier than the swarm in the air.
 */
const MOTH_TINT = 0x574a7e
const MOTH_TINT_FED = 0x342a52
/** Display heights, px. Individuals must be countable at a glance. */
const MOTH_SMALL_H = 24
const MOTH_SMALL_H_VARY = 10
const MOTH_LARGE_H = 42
/** Longest-axis size of the un-broken painted cluster piece. */
const MOTH_CLUSTER_SPAN = 168
/** Hard cap per cluster. The player must be able to COUNT the cost; past about
 * eight the swarm becomes a texture and the number stops being readable. */
const MOTHS_PER_CLUSTER_CAP = 8
/** How near the flock centre must come before a cluster takes an interest —
 * and the range at which the painted cluster breaks into individuals. */
const NOTICE_RANGE = 380
/** Seconds the cluster piece takes to dissolve into its individuals. */
const BREAK_TIME = 0.55
/** Seconds of visible approach before a latch can land. */
const LURE_TIME = 1.15
/** A harmless cluster's lure ceiling: it reaches, hangs, and falls back — the
 * entire read taught once, for free, before it ever costs anything. */
const LURE_HARMLESS_CAP = 0.72
/** Within this of its aim bird, a fully-lured moth takes hold. */
const ATTACH_DIST = 26
/** Daylight per second per attached moth. Base nightfall drain is 0.024/s, so
 * six of these double the clock — expensive, visible, and shakeable. */
const MOTH_DRAIN_EACH = 0.005
/** How fast one moth eats the carried light (Bird.litT) off its host. */
const MOTH_EAT = 1.6
/** Attached moths beyond this add no further drain: the swarm is a pressure,
 * not a death sentence, and an unshakeable spiral is not a skill test. */
const MAX_DRAINING = 10
/** Spread magnitude (-flock.form) past which the flock starts shaking them. */
const SPREAD_SHED_MIN = 0.4
/** Moths torn loose per second at full spread. */
const SPREAD_SHED_RATE = 3.2
/** Seconds a shed moth stays uninterested — long enough that one clean answer
 * buys real distance rather than being immediately undone. */
const SHED_COOLDOWN = 2.4
/** How hard a shed moth is thrown, so the answer LANDS visibly. */
const SHED_KICK = 210
const MOTH_CULL_PAD = 260

export class MothSwarm {
  /** Every moth in the level, in cluster order. Read-only for the scene. */
  moths: Moth[] = []
  /** Daylight per second the scene should subtract while this is non-zero. */
  drainPerSec = 0
  attachedCount = 0
  /** 0..1 — how much of the flock's light the swarm currently owns. Drives any
   * light-carrying HUD or glow the scene wants to visibly dim. */
  dimming = 0

  private scene: Phaser.Scene
  private clusters: MothCluster[] = []
  /**
   * Bird occupancy, maintained incrementally on attach/detach and never rebuilt
   * per frame. One moth per bird, so the swarm spreads across the flock instead
   * of stacking into an uncountable pile on one unlucky bird.
   */
  private ridden = new Set<Bird>()
  /** Indices of birds currently carrying light, refilled in place each frame. */
  private litBuf: number[] = []
  private litN = 0
  private shedAccum = 0
  private clock = 0

  constructor(scene: Phaser.Scene, clusters: MothClusterSpec[]) {
    this.scene = scene
    createCreatureTextures(scene)

    const clusterKey = scene.textures.exists(MOTH_CLUSTER_KEY) ? MOTH_CLUSTER_KEY : ''
    // 'bird-mid' is the flock's own texture and is always present; if the moth
    // art is missing entirely the swarm still runs, just wearing the wrong coat
    const fallback = firstKey(scene, MOTH_SMALL_KEYS, 'bird-mid')

    // THE FIRST CLUSTER IS ALWAYS FREE. A hazard whose read has to be learned
    // cannot charge for the lesson: the earliest cluster in the level reaches
    // for the flock exactly like every later one and then falls away, so the
    // player sees the whole telegraph once with nothing at stake. Forced here
    // rather than left to the spec, because a level edit that reorders the
    // clusters must not be able to quietly delete the tutorial.
    let firstIdx = -1
    let firstX = Infinity
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].x < firstX) {
        firstX = clusters[i].x
        firstIdx = i
      }
    }

    for (let ci = 0; ci < clusters.length; ci++) {
      const spec = clusters[ci]
      const spanX = spec.spanX ?? 0
      const spanY = spec.spanY ?? 0
      const patrol = new Patrol({
        mode: spanX === 0 && spanY === 0 ? 'hover' : 'patrol',
        x: spec.x,
        y: spec.y,
        spanX,
        spanY,
        period: spec.period ?? 6,
        phase: rnd(),
        bob: 26,
      })
      const count = Math.min(MOTHS_PER_CLUSTER_CAP, Math.max(1, spec.count ?? 6))

      let piece: Phaser.GameObjects.Image | null = null
      if (clusterKey) {
        piece = scene.add
          .image(spec.x, spec.y, clusterKey)
          .setTint(MOTH_TINT)
          .setDepth(MOTH_CLUSTER_DEPTH)
          .setAlpha(0)
          .setVisible(false)
        fitLongest(piece, clusterKey, MOTH_CLUSTER_SPAN)
      }

      this.clusters.push({ patrol, harmless: ci === firstIdx ? true : spec.harmless === true, first: this.moths.length, count, broken: 0, piece })

      for (let i = 0; i < count; i++) {
        // two painted larges lead, then the six smalls cycle — offset by the
        // cluster index so adjacent clusters do not open on the same frame
        let key: string
        let size: number
        if (i < 2 && count >= 4) {
          key = MOTH_LARGE_KEYS[i]
          size = MOTH_LARGE_H
        } else {
          key = MOTH_SMALL_KEYS[(i + ci) % MOTH_SMALL_KEYS.length]
          size = MOTH_SMALL_H + ((i * 3 + ci) % 4) * (MOTH_SMALL_H_VARY / 3)
        }
        if (!scene.textures.exists(key)) key = fallback
        const sprite = scene.add
          .image(spec.x, spec.y, key)
          .setTint(MOTH_TINT)
          .setDepth(MOTH_DEPTH)
          .setAlpha(0)
          .setVisible(false)
        fitHeight(sprite, key, size)
        this.moths.push({
          x: spec.x,
          y: spec.y,
          attached: false,
          birdIndex: -1,
          cluster: ci,
          lure: 0,
          ride: null,
          aim: -1,
          cool: 0,
          // fixed personal orbit: the swarm churns without any of it being
          // random, so a cluster looks alive and stays entirely predictable
          orbA: (i / count) * TAU,
          orbR: 26 + rnd() * 30,
          orbSpeed: (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7),
          flapPhase: rnd() * TAU,
          flapFreq: 9 + rnd() * 6,
          size,
          key,
          vx: 0,
          vy: 0,
          sprite,
        })
      }
    }
  }

  // ------------------------------------------------------------------ public

  /**
   * Tear moths loose. `strength` 0..1 — 1 sheds the entire swarm.
   *
   * The scene calls this on a Flare. Spread does NOT need a call: it is handled
   * inside update() from flock.form, so the wide-flock answer works even in a
   * scene that never wires anything up.
   *
   * @returns how many actually let go, for the scene's feedback.
   */
  shed(strength: number): number {
    const s = strength < 0 ? 0 : strength > 1 ? 1 : strength
    if (s <= 0 || this.attachedCount === 0) return 0
    let want = Math.ceil(this.attachedCount * s)
    let freed = 0
    while (want > 0 && this.detachOne()) {
      want--
      freed++
    }
    this.attachedCount -= freed
    return freed
  }

  reset(): void {
    for (let i = 0; i < this.moths.length; i++) {
      const m = this.moths[i]
      if (m.attached) this.detach(m, false)
      m.lure = 0
      m.cool = 0
      m.aim = -1
      m.vx = 0
      m.vy = 0
    }
    for (let i = 0; i < this.clusters.length; i++) this.clusters[i].broken = 0
    this.ridden.clear()
    this.attachedCount = 0
    this.drainPerSec = 0
    this.dimming = 0
    this.shedAccum = 0
  }

  destroy(): void {
    for (let i = 0; i < this.moths.length; i++) this.moths[i].sprite.destroy()
    for (let i = 0; i < this.clusters.length; i++) this.clusters[i].piece?.destroy()
    this.moths.length = 0
    this.clusters.length = 0
    this.ridden.clear()
    this.litBuf.length = 0
  }

  // ------------------------------------------------------------------ update

  update(dt: number, flock: Flock, scrollX: number): void {
    this.clock += dt
    const birds = flock.birds

    // one pass for both jobs the frame needs: who is carrying light (the moths'
    // only reason to be interested at all) and a reusable pool of aim targets
    this.litN = 0
    for (let i = 0; i < birds.length; i++) {
      if (birds[i].litT <= 0.05) continue
      this.litBuf[this.litN] = i
      this.litN++
      if (this.litN >= 24) break
    }
    const carryingLight = this.litN > 0
    const spread = -flock.form

    // WIDE IS THE ANSWER. Handled here rather than left to the scene so the
    // shape of the answer cannot be lost in wiring: the further past neutral
    // the flock spreads, the faster the swarm is stripped off it.
    if (spread > SPREAD_SHED_MIN && this.attachedCount > 0) {
      const wide = Math.min(1, (spread - SPREAD_SHED_MIN) / (1 - SPREAD_SHED_MIN))
      this.shedAccum += wide * SPREAD_SHED_RATE * dt
      while (this.shedAccum >= 1) {
        this.shedAccum -= 1
        if (!this.detachOne()) break
        this.attachedCount--
      }
    } else {
      this.shedAccum = 0
    }

    const x0 = scrollX - MOTH_CULL_PAD
    const x1 = scrollX + VIEW_W + MOTH_CULL_PAD
    let attached = 0
    let aimCursor = 0

    for (let ci = 0; ci < this.clusters.length; ci++) {
      const cl = this.clusters[ci]
      cl.patrol.step(dt, null)
      // THE CLUSTER BREAKING APART IS THE FIRST TELEGRAPH. At distance it is one
      // painted mass — cheap, and it reads as "something is roosting there".
      // Inside NOTICE_RANGE the mass dissolves and the individuals fan out, so
      // the player is shown the exact count of what is about to come for them
      // before any of it moves.
      const dxc = flock.centerX - cl.patrol.x
      const dyc = flock.centerY - cl.patrol.y
      const near = dxc * dxc + dyc * dyc < NOTICE_RANGE * NOTICE_RANGE
      cl.broken = near
        ? Math.min(1, cl.broken + dt / BREAK_TIME)
        : Math.max(0, cl.broken - dt / (BREAK_TIME * 2))
      const piece = cl.piece
      if (piece) {
        const onScreen = cl.patrol.x > x0 && cl.patrol.x < x1
        const show = onScreen && cl.broken < 0.99
        if (piece.visible !== show) piece.setVisible(show)
        if (show) {
          piece.setPosition(cl.patrol.x, cl.patrol.y)
          piece.setAlpha(0.9 * (1 - cl.broken))
        }
      }
    }

    for (let i = 0; i < this.moths.length; i++) {
      const m = this.moths[i]
      const cl = this.clusters[m.cluster]
      if (m.cool > 0) m.cool -= dt

      if (m.attached) {
        const b = this.resolveRide(flock, m)
        if (b) {
          attached++
          // it rides in a tight orbit around the bird rather than pinned to it:
          // motion is what separates a parasite from a decal
          m.orbA += m.orbSpeed * 2.2 * dt
          m.x = b.x + Math.cos(m.orbA) * 13
          m.y = b.y + Math.sin(m.orbA) * 9 - 4
          // THE COST, MADE VISIBLE: the carried light is eaten in front of the
          // player, off the very bird they can see it happening to
          b.litT = Math.max(0, b.litT - dt * MOTH_EAT)
          b.panic = Math.max(b.panic, 0.28)
        }
      } else {
        // ---- free: orbit the cluster, and reach for the flock if interested.
        // The orbit radius opens with cl.broken, which is what makes the painted
        // mass appear to come apart into the individuals underneath it.
        m.orbA += m.orbSpeed * dt
        const r = m.orbR * (0.16 + 0.84 * cl.broken)
        const ox = cl.patrol.x + Math.cos(m.orbA) * r
        const oy = cl.patrol.y + Math.sin(m.orbA) * r * 0.6

        const dxc = flock.centerX - cl.patrol.x
        const dyc = flock.centerY - cl.patrol.y
        const nearCluster = dxc * dxc + dyc * dyc < NOTICE_RANGE * NOTICE_RANGE
        // a spread flock offers nothing to hold on to — the same state that
        // sheds them also refuses new ones, so the answer is never half an answer
        const interested = nearCluster && carryingLight && m.cool <= 0 && spread < SPREAD_SHED_MIN

        let tx = ox
        let ty = oy
        if (interested && this.litN > 0) {
          if (m.aim < 0 || birds[m.aim] === undefined || birds[m.aim].litT <= 0.05) {
            m.aim = this.litBuf[aimCursor % this.litN]
            aimCursor++
          }
          const target = birds[m.aim]
          if (target) {
            const cap = cl.harmless ? LURE_HARMLESS_CAP : 1
            m.lure = Math.min(cap, m.lure + dt / LURE_TIME)
            // a harmless cluster hangs at its ceiling for a beat and then falls
            // back: the whole approach performed once, with nothing at stake
            if (cl.harmless && m.lure >= cap) m.cool = 1.6
            // the drift toward you IS the warning — the position is interpolated
            // all the way from the cluster to the bird by `lure`
            tx = ox + (target.x - ox) * m.lure
            ty = oy + (target.y - oy) * m.lure
            if (!cl.harmless && m.lure >= 1) {
              const ddx = target.x - m.x
              const ddy = target.y - m.y
              if (ddx * ddx + ddy * ddy < ATTACH_DIST * ATTACH_DIST && !this.ridden.has(target)) {
                this.attach(m, target)
                attached++
              }
            }
          } else {
            m.aim = -1
          }
        } else {
          m.aim = -1
          m.lure = Math.max(0, m.lure - dt / (LURE_TIME * 0.7))
        }

        // approach the target point, plus whatever kick a shed left on it
        const k = 1 - Math.exp(-3.4 * dt)
        m.x += (tx - m.x) * k + m.vx * dt
        m.y += (ty - m.y) * k + m.vy * dt
        const drag = Math.exp(-2.6 * dt)
        m.vx *= drag
        m.vy *= drag
      }

      // ---- render
      const spr = m.sprite
      // while the cluster piece still holds them, the individuals stay hidden
      // underneath it; attached moths are always drawn, wherever they have got to
      const revealed = m.attached ? 1 : cl.broken
      const on = m.x > x0 && m.x < x1 && revealed > 0.01
      if (spr.visible !== on) spr.setVisible(on)
      if (!on) continue
      spr.setPosition(m.x, m.y)
      // wing beat by x-squash: one sprite, no frames, no tween, no allocation
      const beat = 0.74 + 0.26 * Math.abs(Math.sin(this.clock * m.flapFreq + m.flapPhase))
      const p = ART[m.key]
      const aspect = p ? p.w / p.h : 1
      spr.setDisplaySize(m.size * aspect * beat, m.size)
      // a lured moth firms up as it commits, so the telegraph still reads when
      // the drift was short because the flock came to the cluster
      spr.setAlpha(revealed * (0.62 + 0.36 * (m.attached ? 1 : m.lure)))
    }

    this.attachedCount = attached
    this.drainPerSec = Math.min(attached, MAX_DRAINING) * MOTH_DRAIN_EACH
    this.dimming = Math.min(1, attached / MAX_DRAINING)
  }

  // ----------------------------------------------------------------- private

  private attach(m: Moth, b: Bird): void {
    m.attached = true
    m.ride = b
    m.birdIndex = -1
    m.lure = 1
    m.aim = -1
    m.vx = 0
    m.vy = 0
    m.sprite.setTint(MOTH_TINT_FED)
    this.ridden.add(b)
  }

  private detach(m: Moth, kick: boolean): void {
    if (m.ride) this.ridden.delete(m.ride)
    m.attached = false
    m.ride = null
    m.birdIndex = -1
    m.lure = 0
    m.aim = -1
    m.cool = SHED_COOLDOWN
    m.sprite.setTint(MOTH_TINT)
    if (kick) {
      // thrown outward along its own orbit angle, so a shed reads as the flock
      // physically flinging them off rather than as sprites blinking free
      m.vx = Math.cos(m.orbA) * SHED_KICK
      m.vy = Math.sin(m.orbA) * SHED_KICK - 40
    }
  }

  /** Release the most recently attached moth, so a partial shed undoes the
   * newest damage rather than an arbitrary slice of it. */
  private detachOne(): boolean {
    for (let i = this.moths.length - 1; i >= 0; i--) {
      const m = this.moths[i]
      if (!m.attached) continue
      this.detach(m, true)
      return true
    }
    return false
  }

  /**
   * Find the ridden bird's CURRENT index.
   *
   * flock.removeBird() splices, so every death shifts the indices of the birds
   * after it — a stored index alone would silently re-point a moth at a
   * different bird, and deaths happen precisely during falcon strikes and fog
   * contact, i.e. exactly when moths are attached. The identity check is the
   * fast path and costs one comparison; the scan only runs on the frame a death
   * actually moved something, and a bird that is gone entirely drops its moth.
   */
  private resolveRide(flock: Flock, m: Moth): Bird | null {
    const b = m.ride
    if (!b) {
      m.attached = false
      m.birdIndex = -1
      return null
    }
    const birds = flock.birds
    if (birds[m.birdIndex] === b) return b
    for (let i = 0; i < birds.length; i++) {
      if (birds[i] === b) {
        m.birdIndex = i
        return b
      }
    }
    this.detach(m, false)
    return null
  }
}

// ============================================================================
// 2. THE LIGHT-THIEF
// ============================================================================

export type ThiefState = 'waiting' | 'shadowing' | 'robbing' | 'fleeing'

const POSE_PERCHED = 'thief_perched'
const POSE_LEVEL = 'thief_level'
const POSE_LAUNCH = 'thief_launch'
const POSE_SCATTER_A = 'thief_scatter_a'
const POSE_SCATTER_B = 'thief_scatter_b'

/**
 * Which way each painted piece is drawn facing: +1 right, -1 left.
 *
 * THE SET IS NOT CONSISTENT — perched and scatter_a are painted facing left,
 * level, launch and scatter_b facing right. Without this table the thief flies
 * backwards through half of its own state machine, which is exactly the defect
 * the falcon's faceTravel() comment was written about after it shipped once.
 */
const POSE_FACING: Record<string, number> = {
  [POSE_PERCHED]: -1,
  [POSE_LEVEL]: 1,
  [POSE_LAUNCH]: 1,
  [POSE_SCATTER_A]: -1,
  [POSE_SCATTER_B]: 1,
}

/** Longest-axis span in px. The flock is 27px across, so this is ~4 birds: the
 * biggest thing in the sky short of the falcon, and unmistakably a bird. */
const THIEF_SPAN = 124
/** Warm gold. The hoard is STOLEN FUEL, so it obeys the same grammar as a mote.
 * Painted ON TOP of the piece additively — a glow placed BEHIND the sprite
 * reads as a lamp it is standing in front of, which was rejected once already. */
const EMBER_TINT = 0xffc98a
/** Hoard at which the chest is fully alight. Past it the bet stops paying more
 * VISIBLY, which is the cue that it is time to answer the thing. */
const HOARD_FULL = 14

/** How far ahead of the flock it perches before anything happens. */
const WAKE_AHEAD = 1500
/** Seconds of pacing before it commits to a robbery. Long on purpose: the
 * shadowing beat is the entire "interested, not hostile" read, and cutting it
 * short turns the creature into an ambush, which is a different and much worse
 * animal. */
const SHADOW_DWELL = 4.2
const SHADOW_HOLD_X = 300
const SHADOW_HOLD_Y = -170
/** Seconds the dart takes end to end. */
const ROB_DUR = 1.15
/** Radius around the impact point it strips light from. */
const STRIP_R = 190
/** Most it can take from the flock in one dart. */
const STRIP_MAX = 6
/** What it asks the scene for when a mote arc is aimed at (see onRobResolved). */
const ROB_WANT = 5
/** Seconds of flight after a robbery before it will consider another. */
const ROB_COOLDOWN = 2.6

/** Vortex pressure bleeds away this fast once the flock stops circling, so
 * panicking it takes a sustained answer rather than a lucky brush. */
const RATTLE_DECAY = 0.45
/** Grace after a disorient() call before decay resumes — one dropped frame of
 * gesture detection must not undo the whole answer. (Same shape as the flock's
 * bank hold, for the same reason.) */
const RATTLE_HOLD = 0.35
/**
 * The payout multiplier. Answering it must be strictly better than never having
 * met it, or the correct play is to avoid the encounter — and an encounter the
 * player should avoid is content that does not exist.
 */
const DISGORGE_BONUS = 1.6
const FLEE_DUR = 1.6
/** Seconds between scatter poses while it comes apart. Fast: the panic has to
 * read as thrashing, and two painted poses alternating IS the animation. */
const SCATTER_SWAP = 0.11
const BURST_N = 14
const BURST_LIFE = 1.05
const TRAIL_N = 5
const THIEF_CULL_PAD = 700

/**
 * A magpie-shaped scavenger that steals LIGHT, hoards it visibly in its chest,
 * and gives back more than it took the moment the flock answers it.
 *
 * Four states, one arrow through them: it is seen perched and already glowing
 * long before it matters (waiting) → it takes an interest once the flock is
 * carrying something worth taking (shadowing) → it darts (robbing) → and if the
 * flock spirals around it, it panics and dumps everything (fleeing).
 *
 * It has no attack and cannot take a bird. The whole creature is a bet: the
 * longer the player leaves it alone the more it is carrying, and the bigger the
 * payout when they finally answer. Every state is therefore readable from the
 * chest alone — how bright it burns IS how much is at stake.
 */
export class LightThief {
  readonly perchX: number
  readonly perchY: number
  x: number
  y: number
  state: ThiefState = 'waiting'
  /** Motes' worth currently in its chest. The ember is a pure function of it. */
  hoard: number
  /** 0..1 — how close the flock's circling has driven it to panic. */
  rattle = 0
  /** Light waiting to be handed back. Non-zero only after it has panicked. */
  pendingGift = 0
  /** True once it has fled and is finished with the level. */
  done = false

  /**
   * Fires the frame the dart crosses its target, BEFORE the hoard updates. The
   * scene may surrender motes from an arc at (x, y) and returns how many it
   * actually gave up; that count is added to the hoard on top of whatever was
   * stripped off the flock. Unwired, the thief simply robs the flock — the mote
   * arc theft is enrichment, not a dependency.
   */
  onRobResolved: ((x: number, y: number, want: number) => number) | null = null
  /** Fires the frame it commits to a dart — the scene's cue for a caw. */
  onRobBegin: (() => void) | null = null
  /** Fires the frame it panics, carrying the gift about to become available. */
  onPanic: ((gift: number) => void) | null = null

  private scene: Phaser.Scene
  private body: Phaser.GameObjects.Image
  /**
   * THE HOARD, PAINTED ON TOP OF ITSELF. The same piece, same transform, ADD
   * blend, tinted warm: wherever the bird has substance it lights up from
   * inside, brightest where the art's own fire already lives. A separate glow
   * sprite behind the body reads as a lamp it is standing in front of.
   */
  private ember: Phaser.GameObjects.Image
  private trail: Phaser.GameObjects.Image[] = []
  private burst: Phaser.GameObjects.Image[] = []
  private burstLife: number[] = []
  private burstVX: number[] = []
  private burstVY: number[] = []
  private patrol: Patrol
  private poseKey: string
  private fallbackPose: string
  private clock = 0
  private dwell = 0
  private cooldown = 0
  private rattleHold = 0
  private robT = 0
  private robbed = false
  private fleeT = 0
  private scatterT = 0
  private scatterOn = false
  // dart control points, laid down at commit and never re-allocated
  private p0x = 0
  private p0y = 0
  private p1x = 0
  private p1y = 0
  private p2x = 0
  private p2y = 0
  private aimX = 0
  private aimY = 0
  private aimValid = false
  // position history for the trail; a ring buffer, so no per-frame array work
  private histX: number[] = []
  private histY: number[] = []
  private histI = 0
  private emberFlash = 0
  private vx = 1
  private vy = 0
  private scaleK = 1

  constructor(scene: Phaser.Scene, perchX: number, perchY: number, seedHoard = 3) {
    this.scene = scene
    createCreatureTextures(scene)
    this.perchX = perchX
    this.perchY = perchY
    this.x = perchX
    this.y = perchY
    this.hoard = seedHoard
    this.fallbackPose = firstKey(scene, [POSE_LEVEL, POSE_PERCHED, POSE_LAUNCH], 'bird-mid')
    this.poseKey = this.resolve(POSE_PERCHED)

    this.patrol = new Patrol({
      mode: 'hover',
      x: perchX,
      y: perchY,
      period: 3.4,
      // A PERCHED BIRD DOES NOT BOB. The painted piece includes the ruin it is
      // standing on, so any vertical motion floats the stone with it.
      bob: 0,
      holdX: SHADOW_HOLD_X,
      holdY: SHADOW_HOLD_Y,
      chase: 1.15,
      weave: 46,
    })

    this.body = scene.add.image(perchX, perchY, this.poseKey).setDepth(THIEF_DEPTH)
    this.ember = scene.add
      .image(perchX, perchY, this.poseKey)
      .setTint(EMBER_TINT)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(THIEF_EMBER_DEPTH)
    this.applyPose(this.poseKey)

    for (let i = 0; i < TRAIL_N; i++) {
      this.trail.push(
        scene.add.image(0, 0, STREAK_TEX).setTint(0x0f0b1a).setDepth(THIEF_TRAIL_DEPTH).setVisible(false),
      )
    }
    for (let i = 0; i < BURST_N; i++) {
      this.burst.push(
        scene.add
          .image(0, 0, GLOW_TEX)
          .setTint(EMBER_TINT)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(BURST_DEPTH)
          .setVisible(false),
      )
      this.burstLife.push(0)
      this.burstVX.push(0)
      this.burstVY.push(0)
    }
    for (let i = 0; i < 16; i++) {
      this.histX.push(perchX)
      this.histY.push(perchY)
    }
  }

  // ------------------------------------------------------------------ public

  /** True once it has panicked and the gift is sitting there to be taken. */
  get readyToDisgorge(): boolean {
    return this.pendingGift > 0
  }

  /**
   * Point the next robbery at a place worth robbing — a mote arc the flock has
   * not reached yet. Without it the thief robs the flock directly, which is the
   * same theft but a lesser read: the best version of this creature beats you to
   * the light rather than mugging you for it.
   */
  aimAt(x: number, y: number): void {
    this.aimX = x
    this.aimY = y
    this.aimValid = true
  }

  clearAim(): void {
    this.aimValid = false
  }

  /** Add to the hoard. The chest brightens by exactly this much, because the
   * ember's alpha is derived from `hoard` and nothing else. */
  steal(n: number): void {
    if (!(n > 0)) return
    this.hoard += n
    this.emberFlash = 1
  }

  /**
   * VORTEX PRESSURE. The scene calls this while the flock is spiralling near the
   * thief; `amount` is however much of that gesture landed this frame
   * (rate * dt). It only bites while the thief is actually engaged — one perched
   * a screen away cannot be frightened by a whirl it has not noticed.
   */
  disorient(amount: number): void {
    if (!(amount > 0)) return
    if (this.state !== 'shadowing' && this.state !== 'robbing') return
    this.rattle = Math.min(1.4, this.rattle + amount)
    this.rattleHold = RATTLE_HOLD
    if (this.rattle >= 1) this.panic()
  }

  /**
   * Take the payout. Panics the thief first if it has not already broken, so a
   * scene can force the resolution.
   *
   * @returns motes' worth of light to hand back — strictly more than was taken
   *          (DISGORGE_BONUS). Returns 0 once collected.
   */
  disgorge(): number {
    if (this.state !== 'fleeing') this.panic()
    const g = this.pendingGift
    this.pendingGift = 0
    return g
  }

  reset(): void {
    this.state = 'waiting'
    this.x = this.perchX
    this.y = this.perchY
    this.patrol.setMode('hover')
    this.patrol.moveAnchor(this.perchX, this.perchY)
    this.patrol.x = this.perchX
    this.patrol.y = this.perchY
    this.rattle = 0
    this.rattleHold = 0
    this.pendingGift = 0
    this.done = false
    this.dwell = 0
    this.cooldown = 0
    this.robbed = false
    this.fleeT = 0
    this.scatterOn = false
    this.aimValid = false
    this.scaleK = 1
    this.setPose(POSE_PERCHED)
    this.body.setVisible(true).setAlpha(1)
    this.ember.setVisible(true)
    for (let i = 0; i < this.trail.length; i++) this.trail[i].setVisible(false)
    for (let i = 0; i < this.burst.length; i++) {
      this.burstLife[i] = 0
      this.burst[i].setVisible(false)
    }
  }

  destroy(): void {
    this.body.destroy()
    this.ember.destroy()
    for (let i = 0; i < this.trail.length; i++) this.trail[i].destroy()
    for (let i = 0; i < this.burst.length; i++) this.burst[i].destroy()
    this.trail.length = 0
    this.burst.length = 0
  }

  // ------------------------------------------------------------------ update

  update(dt: number, flock: Flock, scrollX: number): void {
    this.clock += dt
    // the burst outlives the bird, so it is stepped even after `done`
    this.stepBurst(dt)
    if (this.done) return

    if (this.rattleHold > 0) this.rattleHold -= dt
    else this.rattle = Math.max(0, this.rattle - dt * RATTLE_DECAY)
    if (this.cooldown > 0) this.cooldown -= dt

    if (this.state === 'waiting') {
      this.patrol.step(dt, null)
      this.x = this.patrol.x
      this.y = this.patrol.y
      // It wakes only for a flock that is BOTH close enough to matter and
      // actually carrying something. Perching in view for a full screen-width
      // before that is the entire point: by the time it moves, the player has
      // already noticed the one bird in the sky burning from inside.
      const ahead = this.perchX - flock.centerX
      if (ahead < WAKE_AHEAD && ahead > -700 && this.flockLight(flock) > 0) {
        this.state = 'shadowing'
        this.dwell = 0
        this.patrol.setMode('shadow')
        this.setPose(POSE_LEVEL)
      }
    } else if (this.state === 'shadowing') {
      this.patrol.step(dt, flock)
      this.x = this.patrol.x
      this.y = this.patrol.y
      // dwell only builds while there is light to take: a dark flock is simply
      // not interesting, and the creature declining to attack anyway is what
      // makes it read as a scavenger rather than a predator
      if (this.flockLight(flock) > 0 && this.cooldown <= 0) this.dwell += dt
      if (this.dwell >= SHADOW_DWELL) this.beginRob(flock)
    } else if (this.state === 'robbing') {
      this.robT += dt
      const p = Math.min(1, this.robT / ROB_DUR)
      // quadratic Bezier whose control point is placed so the curve passes
      // EXACTLY through the target at p=0.5 — the theft resolves where the dart
      // visibly crosses the light, not where it started or where it ended up
      const q = 1 - p
      this.x = q * q * this.p0x + 2 * q * p * this.p1x + p * p * this.p2x
      this.y = q * q * this.p0y + 2 * q * p * this.p1y + p * p * this.p2y
      if (!this.robbed && p >= 0.5) this.resolveRob(flock)
      if (p >= 1) {
        this.state = 'shadowing'
        this.dwell = 0
        this.cooldown = ROB_COOLDOWN
        this.patrol.setMode('shadow')
        this.patrol.x = this.x
        this.patrol.y = this.y
        this.setPose(POSE_LEVEL)
      }
    } else {
      // FLEEING. The light is already dumped; this is the exit. It goes BACKWARD
      // and up — away over the flock's shoulder, abandoning the flyway — which
      // also lets the scatter poses read the way they were painted, with the
      // shed feathers and embers trailing behind it rather than into its face.
      this.fleeT += dt
      const p = Math.min(1, this.fleeT / FLEE_DUR)
      const recoil = Math.max(0, 1 - p / 0.16)
      const run = Math.pow(Math.max(0, (p - 0.12) / 0.88), 1.8)
      this.x -= (recoil * 320 + run * 1250) * dt
      this.y -= (recoil * 180 + run * 900) * dt
      this.scatterT += dt
      if (this.scatterT >= SCATTER_SWAP) {
        this.scatterT -= SCATTER_SWAP
        this.scatterOn = !this.scatterOn
        this.setPose(this.scatterOn ? POSE_SCATTER_B : POSE_SCATTER_A)
      }
      this.scaleK = 1 - run * 0.4
      this.body.setAlpha(1 - Math.pow(p, 2.2))
      if (p >= 1) {
        this.done = true
        this.body.setVisible(false)
        this.ember.setVisible(false)
        for (let i = 0; i < this.trail.length; i++) this.trail[i].setVisible(false)
        return
      }
    }

    this.render(dt, scrollX)
  }

  // ----------------------------------------------------------------- private

  private resolve(key: string): string {
    return this.scene.textures.exists(key) ? key : this.fallbackPose
  }

  /** Swap the painted pose. Costs one texture bind on a STATE CHANGE, which is
   * where the whole of this creature's animation budget goes — no tweens, no
   * frames, no per-frame work. */
  private setPose(key: string): void {
    const k = this.resolve(key)
    if (k === this.poseKey) return
    this.poseKey = k
    this.body.setTexture(k)
    this.ember.setTexture(k)
    this.applyPose(k)
  }

  /** Re-fit both layers after a pose swap; the pieces have different aspects. */
  private applyPose(key: string): void {
    fitLongest(this.body, key, THIEF_SPAN * this.scaleK)
    fitLongest(this.ember, key, THIEF_SPAN * this.scaleK)
  }

  /** How many birds are carrying light right now. One pass, nothing kept. */
  private flockLight(flock: Flock): number {
    const birds = flock.birds
    let n = 0
    for (let i = 0; i < birds.length; i++) if (birds[i].litT > 0.05) n++
    return n
  }

  private beginRob(flock: Flock): void {
    this.state = 'robbing'
    this.robT = 0
    this.robbed = false
    this.p0x = this.x
    this.p0y = this.y
    this.setPose(POSE_LAUNCH)

    // the aimed mote arc if the scene gave it one, otherwise the flock itself
    let tx = flock.centerX
    let ty = flock.centerY
    if (this.aimValid) {
      tx = this.aimX
      ty = this.aimY
    } else {
      const birds = flock.birds
      let best = -1
      let bestLit = 0.05
      for (let i = 0; i < birds.length; i++) {
        if (birds[i].litT > bestLit) {
          bestLit = birds[i].litT
          best = i
        }
      }
      if (best >= 0) {
        tx = birds[best].x
        ty = birds[best].y
      }
    }

    // the exit continues past the target along the entry line, so the dart is
    // one clean stroke through the light rather than a stop-and-turn
    let dx = tx - this.p0x
    let dy = ty - this.p0y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= d
    dy /= d
    this.p2x = tx + dx * 460
    this.p2y = ty + dy * 460 - 130
    // control point chosen so B(0.5) lands exactly on the target
    this.p1x = 2 * tx - 0.5 * (this.p0x + this.p2x)
    this.p1y = 2 * ty - 0.5 * (this.p0y + this.p2y)
    this.onRobBegin?.()
  }

  private resolveRob(flock: Flock): void {
    this.robbed = true
    const birds = flock.birds
    let taken = 0
    const r2 = STRIP_R * STRIP_R
    for (let i = 0; i < birds.length && taken < STRIP_MAX; i++) {
      const b = birds[i]
      if (b.litT <= 0.05) continue
      const dx = b.x - this.x
      const dy = b.y - this.y
      if (dx * dx + dy * dy > r2) continue
      b.litT = 0
      b.panic = Math.max(b.panic, 0.4)
      taken++
    }
    const fromArc = this.onRobResolved ? this.onRobResolved(this.x, this.y, ROB_WANT) : 0
    this.aimValid = false
    this.steal(taken + fromArc)
  }

  /** It breaks. Everything in the chest becomes a gift, with interest. */
  private panic(): void {
    if (this.state === 'fleeing' || this.done) return
    this.state = 'fleeing'
    this.fleeT = 0
    this.scatterT = 0
    this.rattle = 1
    this.pendingGift = Math.ceil(this.hoard * DISGORGE_BONUS)
    this.hoard = 0
    this.setPose(POSE_SCATTER_A)
    this.fireBurst()
    this.onPanic?.(this.pendingGift)
  }

  private fireBurst(): void {
    for (let i = 0; i < this.burst.length; i++) {
      const a = (i / this.burst.length) * TAU + this.clock
      const sp = 260 + (i % 4) * 90
      this.burstVX[i] = Math.cos(a) * sp
      this.burstVY[i] = Math.sin(a) * sp - 60
      this.burstLife[i] = BURST_LIFE
      this.burst[i].setPosition(this.x, this.y).setVisible(true).setAlpha(1).setDisplaySize(64, 64)
    }
  }

  private stepBurst(dt: number): void {
    for (let i = 0; i < this.burst.length; i++) {
      if (this.burstLife[i] <= 0) continue
      this.burstLife[i] -= dt
      const img = this.burst[i]
      if (this.burstLife[i] <= 0) {
        img.setVisible(false)
        continue
      }
      const k = this.burstLife[i] / BURST_LIFE
      img.x += this.burstVX[i] * dt
      img.y += this.burstVY[i] * dt
      this.burstVX[i] *= Math.exp(-2.2 * dt)
      this.burstVY[i] = this.burstVY[i] * Math.exp(-2.2 * dt) + 210 * dt
      img.setAlpha(k * k)
      img.setDisplaySize(26 + k * 58, 26 + k * 58)
    }
  }

  private render(dt: number, scrollX: number): void {
    const on = this.x > scrollX - THIEF_CULL_PAD && this.x < scrollX + VIEW_W + THIEF_CULL_PAD
    if (this.body.visible !== on) {
      this.body.setVisible(on)
      this.ember.setVisible(on)
      if (!on) for (let i = 0; i < this.trail.length; i++) this.trail[i].setVisible(false)
    }

    // heading, smoothed off the ring buffer's previous sample so a hovering
    // thief never spins on sub-pixel noise
    const prevI = (this.histI - 1 + this.histX.length) % this.histX.length
    const pdx = this.x - this.histX[prevI]
    const pdy = this.y - this.histY[prevI]
    if (pdx * pdx + pdy * pdy > 1) {
      const k = 1 - Math.exp(-10 * dt)
      this.vx += (pdx - this.vx) * k
      this.vy += (pdy - this.vy) * k
    }
    this.histX[this.histI] = this.x
    this.histY[this.histI] = this.y
    this.histI = (this.histI + 1) % this.histX.length

    if (!on) return

    // WAITING keeps the piece's painted facing: it is drawn looking left, back
    // down the flyway, which means it is looking straight at the flock as it
    // comes. Flipping it to "face travel" it is not doing would throw that away.
    const perched = this.state === 'waiting'
    const artFacing = POSE_FACING[this.poseKey] ?? 1
    const dir = this.vx >= 0 ? 1 : -1
    const flip = perched ? false : dir !== artFacing
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy)
    // rotation only from the vertical component, and only while travelling —
    // a perched bird that tilts with its own idle reads as broken
    const tilt = perched || speed <= 0.6 ? 0 : Math.atan2(this.vy, Math.abs(this.vx) || 1) * 0.55
    const rot = dir >= 0 ? tilt : -tilt

    this.body.setPosition(this.x, this.y).setFlipX(flip).setRotation(rot)

    // ---- THE HOARD. Alpha is a pure function of it, so "its glow brightens by
    // exactly what it took" is literally true. The ember rides the body's exact
    // transform, additively, so the light comes from inside the bird.
    this.emberFlash = Math.max(0, this.emberFlash - dt * 2.4)
    const fill = Math.min(1, this.hoard / HOARD_FULL)
    const breath = 1 + Math.sin(this.clock * 2.6) * 0.07
    this.ember.setPosition(this.x, this.y).setFlipX(flip).setRotation(rot)
    this.ember.setAlpha(
      Math.min(1, (0.1 + fill * 0.62) * breath + this.emberFlash * 0.35) * this.body.alpha,
    )
    // the flee shrink has to reach both layers, and only changes while fleeing
    if (this.state === 'fleeing') this.applyPose(this.poseKey)

    // ---- trail: only while it is actually fast. A permanent trail on a
    // shadowing bird makes a patient creature look like it is always charging.
    const streaking = this.state === 'robbing' || this.state === 'fleeing'
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i]
      if (!streaking) {
        if (t.visible) t.setVisible(false)
        continue
      }
      const back = 2 + i * 2
      const si = (this.histI - 1 - back + this.histX.length * 2) % this.histX.length
      const sj = (si - 2 + this.histX.length) % this.histX.length
      const ax = this.histX[si]
      const ay = this.histY[si]
      const bx = this.histX[sj]
      const by = this.histY[sj]
      const k = 1 - i / this.trail.length
      t.setVisible(true)
      t.setPosition(ax, ay)
      t.setRotation(Math.atan2(ay - by, ax - bx))
      t.setDisplaySize(90 + k * 130, 5 + k * 16)
      t.setAlpha(0.14 + k * 0.4)
    }
  }
}
