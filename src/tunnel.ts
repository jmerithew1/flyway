import Phaser from 'phaser'
import { Bird, Flock } from './flock'
import { ART } from './artManifest'
import { W as VIEW_W } from './backdrop'
import { INK, display, safeArea } from './ui'
import { isTouch } from './touch'

/**
 * THE TUNNEL — the finale set piece.
 *
 * An authored corridor immediately before the roost. The flock is taken into
 * TWO STREAMS at a gate, and from there the tunnel is an EXAM: the corridor
 * weaves and squeezes (steering), while hazards rush up that each demand a verb
 * the player already owns (surge / flare / gather / echo), prompted just in
 * time. Correct answers fill a BREAKTHROUGH METER; misses cost a chunk of birds
 * and let it slip back.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SPLIT IS AUTHORED
 *
 * A player-performed split needs two simultaneous inputs, which is a chord, and
 * a chord is effectively impossible on touch (see touch.ts — the Brace chord was
 * cut for exactly this reason). So the gate flashes a prompt for ONE button, and
 * the split happens. No new verb, no new input, and it works identically on a
 * keyboard and a phone.
 *
 * WHY THE LANES NEED AN OVERRIDE
 *
 * Flock's `wHome` (anti-fragmentation leash) and `wIntent` (700, the single
 * shared intention point) both pull every bird toward one place. Nothing in the
 * boid rules can hold two streams apart on its own: the moment the geometry that
 * separated them ends, they merge within a second. That is the measured reason a
 * performed split was rejected, and it is why the lane hold below is a deliberate
 * KINEMATIC override applied after Flock.update has already integrated — the
 * same shape as Flock's own shape-signal code, which snaps birds onto their seats
 * for exactly the same reason (a force alone loses to the boid rules).
 *
 * WHY THERE ARE NO TWEENS IN HERE
 *
 * DayScene runs several slow-motion multipliers on its own dt (card ease,
 * reckoning, brace — and now this file's `timeScale`). `tweens.add` ignores every
 * one of them, so a tween fired during a hitstop sprints while the world crawls.
 * Everything below is procedural per-frame math off a real-time clock.
 *
 * WHY THERE IS NO ALLOCATION IN update()
 *
 * This project's #1 measured performance defect was ~3.1 MB of garbage per 60
 * frames and the GC pauses the owner felt as chop. Every sprite, buffer and
 * scratch value here is built in the constructor and mutated forever. No object
 * literals, no map/filter/slice, no closures, indexed loops throughout.
 */

// --------------------------------------------------------------------- types

export type TunnelVerb = 'surge' | 'flare' | 'gather' | 'echo'

export type TunnelPhase =
  | 'idle'
  | 'approach'
  | 'run'
  | 'breakout'
  | 'done'

/** One authored corridor. Two of these ship: a teaching run and the finale. */
export interface TunnelSpec {
  /** World x of the mouth. The gate is drawn here. */
  x: number
  /** Corridor length in px, mouth to breakout. */
  length: number
  /** Corridor centre y at the mouth. */
  y?: number
  /**
   * 0..1. Scales EVERYTHING that can hurt: the squeeze, the weave, the speed
   * ramp, how tight the answer windows get, and what a miss costs. At 0 a miss
   * costs nothing at all, which is what makes the first encounter safe.
   */
  intensity?: number
  /** Short teaching schedule (one split, one prompt) instead of the gauntlet. */
  teaching?: boolean
  /** Landmark name for the checkpoint the scene should place at the mouth. */
  name?: string
}

// ----------------------------------------------------------------- constants

const TAU = Math.PI * 2

/** Corridor half-height at its most open / most squeezed, in px. */
const HALF_OPEN = 268
const HALF_TIGHT = 156
/**
 * Wavelength and amplitude of the corridor's vertical weave.
 *
 * The period is long relative to the amplitude on purpose. The wall is drawn as
 * a run of overlapping segments, and the steeper the weave the more each segment
 * has to be rotated away from its neighbour — past about half a radian of
 * difference the band stops reading as one wall and starts reading as a stack of
 * tilted cards, which is exactly what a first pass at this looked like.
 */
const WEAVE_PERIOD = 1600
const WEAVE_MAX = 95
/** Lane centre, as a fraction of the corridor half-height. */
const LANE_FRACTION = 0.46
/** How close to a wall the player's steering is allowed to push the streams. */
const PILOT_MARGIN = 54
/** Lane hold: a spring (reads as flight) plus a kinematic pull (actually wins
 * against wIntent, which the spring alone does not). */
const LANE_SPRING = 11
const LANE_SNAP = 6.5
/** Wall containment. */
const WALL_PAD = 30
const WALL_SPRING = 30
/** Forward push at full speed ramp, px/s^2 — the tunnel is faster than the sky. */
const FORWARD_PUSH = 300
/** Scroll multiplier the scene should apply at the end of the corridor. */
const SPEED_RAMP = 0.62
/** How far the world slows at the moment of impact (1 - this = the floor). */
const IMPACT_SLOW = 0.55
/** Slow eases IN fast (the hitch has to land) and OUT slower (the release). */
const SLOW_IN = 17
const SLOW_OUT = 7
/** Seconds a resolved prompt spends bursting through / paying, in real time. */
const DECAY_T = 0.45
/** How far ahead of the mouth the corridor starts easing into existence. */
const APPROACH_LEAD = 1000
/** Corridor ease-in / ease-out distances, px. */
const EASE_IN_PX = 260
const EASE_OUT_PX = 300
/** Where the walls sit while the corridor is not yet formed. Far enough off
 * screen that the containment is genuinely inert rather than merely generous. */
const WALLS_PARKED = 1000

/** Wall band segments: small enough that the weave reads as a curve. */
const SEG_W = 76
const SEG_STEP = 66
/** Display height of a wall band, and where its lit lip sits inside the art. */
const BAND_H = 320
const BAND_LIP = 0.82
/** Spine beams are intermittent — the player must see THROUGH the divider. */
const SPINE_STEP = 148
const SPINE_H = 56

const WALL_TEX = 'tunnel-band'
const SPINE_TEX = 'tunnel-spine'
const FILL_TEX = 'tunnel-fill'
const PLATE_TEX = 'tunnel-plate'

/** Depth plane. Birds fly at 3.6 and every collider in this game sits behind
 * them (obstacles 3), so the tunnel obeys the same rule: the flock is always in
 * front of the stone it is threading. UI sits above the scene's own prompt (20)
 * and its floating callouts (21). */
const MOUTH_DEPTH = 2.94
const WALL_DEPTH = 3.02
const SPINE_DEPTH = 3.05
const HAZARD_DEPTH = 3.1
const UI_DEPTH = 22

/** The exam's four questions, and the control that answers each one. The prompt
 * MUST name the control the player actually has on their device — a phone has no
 * SPACE bar, and a prompt naming one is a prompt that cannot be obeyed. */
const CONTROL_KEY: Record<TunnelVerb, string> = {
  surge: 'TAP SPACE',
  flare: 'TAP SHIFT',
  gather: 'HOLD SPACE',
  echo: 'PRESS C',
}
const CONTROL_TOUCH: Record<TunnelVerb, string> = {
  surge: 'TAP GATHER',
  flare: 'TAP SPREAD',
  gather: 'HOLD GATHER',
  echo: 'TAP CALL',
}

/** What each hazard is made of. The verb is never guessed from the art — the
 * plate says the word — but the art has to agree with it or the tunnel reads as
 * arbitrary. */
type HazardShape = 'curtain' | 'slab' | 'pinch' | 'gust'

const SHAPE_OF: Record<TunnelVerb, HazardShape> = {
  surge: 'curtain',
  flare: 'slab',
  gather: 'pinch',
  echo: 'gust',
}

type PromptState = 'pending' | 'buildup' | 'impact' | 'decay' | 'spent'

interface Hazard {
  verb: TunnelVerb
  /** What the plate says. The gate says SPLIT; everything else says its verb. */
  label: string
  shape: HazardShape
  /** -1 upper lane, +1 lower lane, 0 spans the corridor. */
  lane: number
  /** 0..1 along the corridor. */
  at: number
  /** Resolved world x, set when the tunnel arms. */
  x: number
  /** Distance before x at which the plate appears, and at which it opens. */
  lead: number
  impactLead: number
  /**
   * The answer window, in REAL seconds.
   *
   * Driving it off the slowed clock is the exact defect the falcon's reckoning
   * shipped with once: the world froze at a fraction of speed and the player got
   * ~7x the intended time. Slow motion is a gift of PERCEPTION; it must never
   * buy extra time.
   */
  window: number
  /** Birds a miss costs. Zero on the teaching run. */
  cost: number
  isSplit: boolean
  climax: boolean
  state: PromptState
  /** Real seconds spent in the current state. */
  t: number
  hit: boolean
  /** Slot in the shared hazard sprite pool. */
  slot: number
}

/** The finale's schedule: single prompts and generous windows at the mouth,
 * arriving closer together as the speed builds, and a rapid chain of DIFFERENT
 * verbs at the climax. No encounter's first appearance is also its first
 * difficulty — every verb here was taught somewhere safer. */
const PLAN_FULL_AT = [0.05, 0.19, 0.32, 0.45, 0.57, 0.71, 0.79, 0.87, 0.94]
const PLAN_FULL_VERB: TunnelVerb[] = [
  'flare', // THE GATE — the authored split
  'surge',
  'gather',
  'flare',
  'echo',
  'surge', // ---- the climax chain begins here
  'flare',
  'gather',
  'surge',
]
const PLAN_FULL_LANE = [0, -1, 0, 1, 0, -1, 1, 0, 1]
/** Index at which the chain starts — from here the plates crowd each other. */
const CLIMAX_FROM = 5

/** The teaching run: one split, one prompt, wide corridor, nothing moving,
 * no cost. The mechanic is met safely before it is ever charged for. */
const PLAN_EASY_AT = [0.16, 0.56]
const PLAN_EASY_VERB: TunnelVerb[] = ['flare', 'surge']
const PLAN_EASY_LANE = [0, -1]

/** Longest schedule, so the sprite pool is sized once and reused by both. */
const MAX_HAZARDS = 9

// ------------------------------------------------------------------ textures

/**
 * The corridor wall, painted at full colour rather than tinted white art.
 *
 * A tint MULTIPLIES, so a tinted band can never carry a lip brighter than the
 * tint — and the lit lip is the whole read: it is the line the player is flying
 * along. Baking the colour in gets a dark stone mass, a warm lit edge and a soft
 * haze under it out of one sprite, at one draw call per segment.
 */
function makeWallTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(WALL_TEX)) return
  const w = 32
  const h = 256
  const canvas = scene.textures.createCanvas(WALL_TEX, w, h)
  if (!canvas) return
  const ctx = canvas.context
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(24,16,38,1)')
  g.addColorStop(0.55, 'rgba(34,23,51,1)')
  g.addColorStop(0.72, 'rgba(52,36,74,1)')
  g.addColorStop(0.795, 'rgba(96,68,110,1)')
  g.addColorStop(BAND_LIP - 0.008, 'rgba(228,168,120,1)')
  g.addColorStop(BAND_LIP + 0.008, 'rgba(228,168,120,0.9)')
  g.addColorStop(0.87, 'rgba(120,80,120,0.42)')
  g.addColorStop(1, 'rgba(120,80,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  canvas.refresh()
}

/** The divider between the two streams: lit on both faces, dark in the middle,
 * feathered top and bottom so a run of beams reads as one structure. */
function makeSpineTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SPINE_TEX)) return
  const w = 32
  const h = 64
  const canvas = scene.textures.createCanvas(SPINE_TEX, w, h)
  if (!canvas) return
  const ctx = canvas.context
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(228,168,120,0)')
  g.addColorStop(0.17, 'rgba(228,168,120,0.95)')
  g.addColorStop(0.3, 'rgba(46,32,62,1)')
  g.addColorStop(0.7, 'rgba(46,32,62,1)')
  g.addColorStop(0.83, 'rgba(228,168,120,0.95)')
  g.addColorStop(1, 'rgba(228,168,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  canvas.refresh()
}

/** A flat white 8x8. Anything that needs a solid bar tints one of these. */
function makeFillTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FILL_TEX)) return
  const canvas = scene.textures.createCanvas(FILL_TEX, 8, 8)
  if (!canvas) return
  canvas.context.fillStyle = '#ffffff'
  canvas.context.fillRect(0, 0, 8, 8)
  canvas.refresh()
}

/**
 * THE BACKING PLATE, drawn at the exact size it will be shown.
 *
 * A light italic serif on a bright sky is what the owner has repeatedly reported
 * as unreadable, and the fix is not a bigger font — it is an opaque plate to put
 * the type on. Drawn 1:1 rather than scaled from a small tile, so its corners and
 * its rim stay crisp instead of smearing into a lozenge.
 */
function makePlateTexture(scene: Phaser.Scene, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const canvas = scene.textures.createCanvas(key, Math.max(8, Math.round(w)), Math.max(8, Math.round(h)))
  if (!canvas) return
  const ctx = canvas.context
  const W = canvas.width
  const H = canvas.height
  const r = Math.min(18, H * 0.28)
  const path = (inset: number): void => {
    const x0 = inset
    const y0 = inset
    const x1 = W - inset
    const y1 = H - inset
    const rr = Math.max(2, r - inset)
    ctx.beginPath()
    ctx.moveTo(x0 + rr, y0)
    ctx.lineTo(x1 - rr, y0)
    ctx.quadraticCurveTo(x1, y0, x1, y0 + rr)
    ctx.lineTo(x1, y1 - rr)
    ctx.quadraticCurveTo(x1, y1, x1 - rr, y1)
    ctx.lineTo(x0 + rr, y1)
    ctx.quadraticCurveTo(x0, y1, x0, y1 - rr)
    ctx.lineTo(x0, y0 + rr)
    ctx.quadraticCurveTo(x0, y0, x0 + rr, y0)
    ctx.closePath()
  }
  path(0)
  ctx.fillStyle = 'rgba(19,12,28,0.94)'
  ctx.fill()
  path(2.5)
  ctx.strokeStyle = 'rgba(246,217,184,0.62)'
  ctx.lineWidth = 3
  ctx.stroke()
  canvas.refresh()
}

// ------------------------------------------------------------------- helpers

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** First key in the list that actually loaded, or '' for the procedural
 * fallback. Every art reference in this file is guarded: a missing asset must
 * degrade to a plainer tunnel, never take the frame down. */
function firstKey(scene: Phaser.Scene, a: string, b: string, c: string): string {
  if (scene.textures.exists(a)) return a
  if (scene.textures.exists(b)) return b
  if (scene.textures.exists(c)) return c
  return ''
}

/** Stretch a manifest piece to a box, preserving nothing — hazards are walls,
 * and a wall that does not fill its lane is a lie about where the gap is. */
function fitBox(img: Phaser.GameObjects.Image, w: number, h: number): void {
  img.setDisplaySize(w, h)
}

// =============================================================================

export class TunnelSequence {
  // ------------------------------------------------------------ public state

  /** True from the moment the mouth is in reach until the breakout finishes. */
  get active(): boolean {
    return this.phase !== 'idle' && this.phase !== 'done'
  }

  /** Where the sequence is. The scene may read it; nothing here needs it to. */
  phase: TunnelPhase = 'idle'

  /**
   * Scroll multiplier the scene should apply to its own scroll speed. 1 outside
   * the tunnel; ramps to 1 + SPEED_RAMP by the climax.
   */
  speedMult = 1

  /**
   * What the scene should multiply its world dt by THIS FRAME. 1 outside an
   * impact; dips toward 1 - IMPACT_SLOW while a window is open.
   *
   * The flock must NOT be slowed by this: DayScene already hands the flock its
   * own `rawDt`, and that is deliberate. The game may slow time to frame a
   * moment; the flock may not — a slowed flock is a player power, and this is a
   * director's choice.
   */
  timeScale = 1

  /** 0..1 breakthrough meter. Fills only from correct verbs under time
   * pressure — it is a progress readout for the chain, never a mash bar. */
  meter = 0

  /** True once the meter was full at the moment of breakout. */
  brokeThrough = false

  /** True while the flock is running as two streams. */
  get split(): boolean {
    return this.splitEase > 0.05
  }

  /** 0..1 how far through the current corridor the flock is. */
  progress = 0

  /**
   * Birds torn off by the last miss. A SHARED buffer, refilled in place — read
   * it inside onPromptMiss and do not keep it.
   */
  readonly victims: Bird[] = []

  // -------------------------------------------------------------- callbacks

  /** A plate has just appeared. `label` is what it says (SPLIT / SURGE / ...). */
  onPromptShow: ((verb: TunnelVerb, label: string, climax: boolean) => void) | null = null
  /** The window has opened and the world is dipping. */
  onPromptImpact: ((verb: TunnelVerb, climax: boolean) => void) | null = null
  /** Answered. `meter` is already updated when this fires. */
  onPromptHit: ((verb: TunnelVerb, climax: boolean, x: number, y: number) => void) | null = null
  /** Missed. The scene applies the loss to `victims` — this file never removes
   * a bird, because the loss law belongs to the scene. */
  onPromptMiss: ((verb: TunnelVerb, victims: Bird[], x: number, y: number) => void) | null = null
  /** The gate takes the flock. */
  onSplit: (() => void) | null = null
  /** The mouth is in reach — the scene's cue to swell the score. */
  onEnter: ((spec: TunnelSpec) => void) | null = null
  /** Out the far side. `full` is whether the meter was filled. */
  onBreakout: ((full: boolean) => void) | null = null

  // ---------------------------------------------------------------- private

  private scene: Phaser.Scene
  private specs: TunnelSpec[]
  /** Index of the spec currently armed, or -1. */
  private cur = -1
  /** Specs already run, so a tunnel never re-arms behind the flock. */
  private spent: boolean[] = []

  /** Corridor ease, 0 outside, 1 fully formed. Never a hard cut: the walls come
   * in from off screen so the mouth reads as an arrival. */
  private corridorEase = 0
  private splitEase = 0
  private splitFired = false
  /** 0..1 eased impact dip that drives timeScale. */
  private impactEase = 0
  private inImpact = false
  /** Real seconds since the sequence armed — every clock in here is real. */
  private clock = 0
  /** Live schedule for the armed spec. Rebuilt in place, never re-allocated. */
  private hazards: Hazard[] = []
  private hazardN = 0
  private meterStep = 0.2
  private baseY = 430
  private intensity = 1
  private mouthX = 0
  private lengthX = 1
  /** Non-zero for a beat after a hit / miss — drives the lip flash. */
  private hitFlash = 0
  private missFlash = 0
  private breakoutT = 0

  /** Which stream each bird belongs to, decided once at the gate by where the
   * bird already was. Assigning at random would make the split read as 120 birds
   * crossing each other rather than as a flock dividing. Cleared on rejoin so it
   * never pins a bird the flock has since lost. */
  private lane = new Map<Bird, number>()
  /** The flock this sequence was last handed. See update(). */
  private curFlock: Flock | null = null

  // sprites — all pooled, all built once
  private mouth: Phaser.GameObjects.Image
  private topSeg: Phaser.GameObjects.Image[] = []
  private botSeg: Phaser.GameObjects.Image[] = []
  private spineSeg: Phaser.GameObjects.Image[] = []
  private hzA: Phaser.GameObjects.Image[] = []
  private hzB: Phaser.GameObjects.Image[] = []

  // prompt UI
  private plate: Phaser.GameObjects.Image
  private verbText: Phaser.GameObjects.Text
  private ctrlText: Phaser.GameObjects.Text
  private windowBar: Phaser.GameObjects.Image
  private meterTrack: Phaser.GameObjects.Image
  private meterFill: Phaser.GameObjects.Image
  private meterText: Phaser.GameObjects.Text
  private plateW = 520
  private plateH = 120
  private uiX = 0
  private uiY = 0
  private meterY = 0
  private meterW = 460
  /** What the plate currently says, so setText only runs on a change. */
  private shownLabel = ''

  // hazard art keys, resolved once
  private keyCurtain: string
  private keySlab: string
  private keyPinch: string
  private keyGust: string

  constructor(scene: Phaser.Scene, specs: TunnelSpec[]) {
    this.scene = scene
    this.specs = specs
    for (let i = 0; i < specs.length; i++) this.spent.push(false)

    makeWallTexture(scene)
    makeSpineTexture(scene)
    makeFillTexture(scene)

    this.keyCurtain = firstKey(scene, 'wisteria_curtain', 'web_net', 'lattice_gate')
    this.keySlab = firstKey(scene, 'wall_double_arch', 'wall_multi_window', 'rose_wall')
    this.keyPinch = firstKey(scene, 'pillar_a', 'column_clean', 'tall_shard')
    this.keyGust = firstKey(scene, 'wind_stream_wave', 'wind_stream_long', 'wind_cross')

    // THE MOUTH. gauntlet_gate is the monumental final gate already in the art
    // set — the natural thing to fly into. Guarded, because a missing gate must
    // cost the tunnel its ceremony and nothing else.
    const gateKey = firstKey(scene, 'gauntlet_gate', 'tall_gate', 'grand_arch')
    this.mouth = scene.add
      .image(0, 0, gateKey || WALL_TEX)
      .setDepth(MOUTH_DEPTH)
      .setVisible(false)
    if (gateKey) {
      const p = ART[gateKey]
      const aspect = p ? p.w / p.h : 0.88
      this.mouth.setDisplaySize(940 * aspect, 940)
    } else {
      this.mouth.setDisplaySize(120, 940)
    }
    this.mouth.setTint(0x6a5480)

    // Wall pool: enough segments to span the view plus a margin, sized ONCE off
    // the derived canvas width. Nothing here may assume 1536 — the canvas is as
    // wide as the device's aspect asks for (backdrop.ts).
    const segN = Math.ceil(VIEW_W / SEG_STEP) + 4
    for (let i = 0; i < segN; i++) {
      this.topSeg.push(
        scene.add.image(0, 0, WALL_TEX).setDepth(WALL_DEPTH).setFlipY(true).setVisible(false),
      )
      this.botSeg.push(scene.add.image(0, 0, WALL_TEX).setDepth(WALL_DEPTH).setVisible(false))
    }
    const spineN = Math.ceil(VIEW_W / SPINE_STEP) + 3
    for (let i = 0; i < spineN; i++) {
      this.spineSeg.push(
        scene.add.image(0, 0, SPINE_TEX).setDepth(SPINE_DEPTH).setVisible(false),
      )
    }
    for (let i = 0; i < MAX_HAZARDS; i++) {
      this.hzA.push(scene.add.image(0, 0, WALL_TEX).setDepth(HAZARD_DEPTH).setVisible(false))
      this.hzB.push(scene.add.image(0, 0, WALL_TEX).setDepth(HAZARD_DEPTH).setVisible(false))
      this.hazards.push({
        verb: 'surge',
        label: 'SURGE',
        shape: 'curtain',
        lane: 0,
        at: 0,
        x: 0,
        lead: 700,
        impactLead: 200,
        window: 0.9,
        cost: 0,
        isSplit: false,
        climax: false,
        state: 'spent',
        t: 0,
        hit: false,
        slot: i,
      })
    }

    // ---- UI. Built once, laid out from the VISIBLE rect (safeArea), because
    // the canvas is letterboxed on some devices and raw-canvas coordinates put
    // chrome off screen.
    this.plate = scene.add.image(0, 0, WALL_TEX).setScrollFactor(0).setDepth(UI_DEPTH).setVisible(false)
    this.windowBar = scene.add
      .image(0, 0, FILL_TEX)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 0.2)
      .setOrigin(0, 0.5)
      .setTint(0xffd9a0)
      .setVisible(false)
    this.verbText = scene.add
      .text(0, 0, '', display(38, INK.bright, 8, 500))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 0.3)
      .setVisible(false)
    this.ctrlText = scene.add
      .text(0, 0, '', display(17, INK.warm, 5, 400))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 0.3)
      .setVisible(false)
    this.meterTrack = scene.add
      .image(0, 0, FILL_TEX)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setOrigin(0, 0.5)
      .setTint(0x1b1228)
      .setAlpha(0.88)
      .setVisible(false)
    this.meterFill = scene.add
      .image(0, 0, FILL_TEX)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 0.1)
      .setOrigin(0, 0.5)
      .setTint(0xf6d9b8)
      .setVisible(false)
    this.meterText = scene.add
      .text(0, 0, 'BREAKTHROUGH', display(13, INK.soft, 6, 400))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 0.3)
      .setVisible(false)

    this.layout()
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  // ------------------------------------------------------------------ layout

  /**
   * Resolve the UI geometry from the visible rect. Called on construction and on
   * resize ONLY — safeArea() measures the canvas rect and builds an object, so
   * it must never be reached from the per-frame path.
   */
  private layout(): void {
    const safe = safeArea(this.scene)
    // touch renders the canvas at roughly 0.4, so everything on a phone has to
    // be bigger in logical px to survive the trip to device px
    const k = isTouch ? 1.22 : 1
    this.plateW = Math.min(safe.w * 0.5, 560 * k)
    this.plateH = 124 * k
    this.uiX = safe.x + safe.w * 0.5
    this.uiY = safe.y + safe.h * 0.175
    this.meterW = this.plateW
    this.meterY = this.uiY + this.plateH * 0.5 + 40 * k

    makePlateTexture(this.scene, PLATE_TEX, this.plateW, this.plateH)
    if (this.scene.textures.exists(PLATE_TEX)) this.plate.setTexture(PLATE_TEX)
    this.plate.setPosition(this.uiX, this.uiY).setDisplaySize(this.plateW, this.plateH)
    this.verbText.setPosition(this.uiX, this.uiY - this.plateH * 0.13)
    this.ctrlText.setPosition(this.uiX, this.uiY + this.plateH * 0.27)
    this.windowBar.setPosition(this.uiX - this.plateW * 0.5, this.uiY + this.plateH * 0.5 - 5)
    this.windowBar.setDisplaySize(this.plateW, 6)
    this.meterTrack.setPosition(this.uiX - this.meterW * 0.5, this.meterY).setDisplaySize(this.meterW, 22 * k)
    this.meterFill.setPosition(this.uiX - this.meterW * 0.5 + 3, this.meterY).setDisplaySize(1, 16 * k)
    this.meterText.setPosition(this.uiX, this.meterY + 26 * k)
  }

  // ------------------------------------------------------------------ inputs

  /**
   * A tap verb was fired. Call this from the SAME place the scene already runs
   * surge / flare / echo, AFTER doing the normal thing — the verb keeps its
   * ordinary effect in the world and answers the prompt as well, which is what
   * makes the finale an exam on what the player already knows rather than a
   * quick-time event bolted on top.
   *
   * @returns true if it answered an open window (for the scene's audio).
   */
  verb(v: TunnelVerb): boolean {
    if (!this.active || !this.curFlock) return false
    for (let i = 0; i < this.hazardN; i++) {
      const h = this.hazards[i]
      if (h.state !== 'impact') continue
      if (h.verb !== v) continue
      this.resolve(h, true, this.curFlock)
      return true
    }
    return false
  }

  /** Where the corridor owns the world, so the scene can suppress its own
   * colliders inside it. A level piece standing in the tunnel is a piece the
   * lane hold will drag birds straight through. */
  ownsWorldX(wx: number): boolean {
    if (this.cur < 0) return false
    return wx > this.mouthX - 160 && wx < this.mouthX + this.lengthX + 220
  }

  /** Where the scene should place a checkpoint landmark: at the mouth, so a
   * failed run is back in ~2 seconds. Failure has to be cheap — that is what
   * makes this addictive rather than punishing. */
  checkpointX(i: number): number {
    const s = this.specs[i]
    return s ? s.x - 120 : 0
  }

  // ------------------------------------------------------------------ update

  /**
   * @param dtReal  the scene's UNSLOWED dt. Every clock in here is real time on
   *                purpose (see Hazard.window).
   * @param gatherHeld  whether the gather formation is held THIS frame — the
   *                one hold verb the exam asks for.
   */
  update(dtReal: number, flock: Flock, scrollX: number, gatherHeld: boolean): void {
    const dt = dtReal > 0.05 ? 0.05 : dtReal
    // held for the frame so verb() — which the scene calls from its own input
    // handler, outside this call — can resolve against the live flock without
    // the scene having to hand it one
    this.curFlock = flock
    this.clock += dt
    this.hitFlash = this.hitFlash > 0 ? this.hitFlash - dt * 2.6 : 0
    this.missFlash = this.missFlash > 0 ? this.missFlash - dt * 2.2 : 0

    if (this.cur < 0) {
      this.tryArm(flock)
      if (this.cur < 0) {
        this.relax(dt)
        return
      }
    }

    const cx = flock.centerX
    const p = clamp((cx - this.mouthX) / this.lengthX, 0, 1)
    this.progress = p

    // Corridor forms over EASE_IN_PX and opens out again over the last
    // EASE_OUT_PX. While it is not formed the walls sit WALLS_PARKED px further
    // out, which makes the containment genuinely inert rather than merely wide.
    const inAmt = clamp((cx - this.mouthX) / EASE_IN_PX, 0, 1)
    const outAmt = clamp((this.mouthX + this.lengthX - cx) / EASE_OUT_PX, 0, 1)
    const wantEase = cx < this.mouthX ? 0 : Math.min(inAmt, outAmt)
    this.corridorEase += (wantEase - this.corridorEase) * (1 - Math.exp(-9 * dt))

    if (this.phase === 'approach' && cx > this.mouthX) this.phase = 'run'

    this.stepHazards(dt, flock, gatherHeld)

    // the streams rejoin as the corridor opens out — the leash and the shared
    // intention do the rest by themselves, which is the whole reason the hold
    // had to exist in the first place
    const wantSplit = this.splitFired && p < 0.94 ? 1 : 0
    this.splitEase += (wantSplit - this.splitEase) * (1 - Math.exp(-(wantSplit > 0 ? 4.5 : 2.6) * dt))
    if (this.splitEase < 0.05 && this.lane.size > 0 && wantSplit === 0) this.lane.clear()

    // the ramp: the tunnel is the fastest the game ever gets
    const ramp = p * p * (3 - 2 * p)
    this.speedMult = 1 + SPEED_RAMP * ramp * this.intensity

    this.applyFlock(dt, flock, ramp)
    this.renderWorld(flock, scrollX)
    this.renderUI()

    // ---- breakout
    if (this.phase === 'run' && p >= 1) {
      this.phase = 'breakout'
      this.breakoutT = 0
      this.brokeThrough = this.meter >= 0.995
      this.onBreakout?.(this.brokeThrough)
    }
    if (this.phase === 'breakout') {
      this.breakoutT += dt
      if (this.breakoutT > 1.4) {
        this.phase = 'done'
        this.spent[this.cur] = true
        this.cur = -1
        this.splitFired = false
        this.lane.clear()
        this.hide()
      }
    }

    // the dip eases in hard and out soft: the hitch has to LAND, and the release
    // is the beat the player bursts through on
    const wantSlow = this.inImpact ? 1 : 0
    this.impactEase += (wantSlow - this.impactEase) * (1 - Math.exp(-(wantSlow > 0 ? SLOW_IN : SLOW_OUT) * dt))
    this.timeScale = 1 - IMPACT_SLOW * this.impactEase
  }

  /** Nothing is armed: bleed every published value back to neutral so a scene
   * that multiplies by them unconditionally sees exactly no tunnel. */
  private relax(dt: number): void {
    this.speedMult += (1 - this.speedMult) * (1 - Math.exp(-6 * dt))
    this.impactEase = Math.max(0, this.impactEase - dt * SLOW_OUT * 0.2)
    this.timeScale = 1 - IMPACT_SLOW * this.impactEase
    this.corridorEase = Math.max(0, this.corridorEase - dt * 4)
    this.inImpact = false
  }

  private tryArm(flock: Flock): void {
    for (let i = 0; i < this.specs.length; i++) {
      if (this.spent[i]) continue
      const s = this.specs[i]
      if (flock.centerX < s.x - APPROACH_LEAD) continue
      if (flock.centerX > s.x + s.length) {
        // flown past without ever arming (a checkpoint jump): retire it quietly
        this.spent[i] = true
        continue
      }
      this.arm(i)
      return
    }
  }

  private arm(i: number): void {
    const s = this.specs[i]
    this.cur = i
    this.phase = 'approach'
    this.mouthX = s.x
    this.lengthX = Math.max(400, s.length)
    this.baseY = s.y ?? 430
    this.intensity = clamp(s.intensity ?? 1, 0, 1)
    this.meter = 0
    this.brokeThrough = false
    this.splitFired = false
    this.splitEase = 0
    this.progress = 0
    this.lane.clear()

    const at = s.teaching ? PLAN_EASY_AT : PLAN_FULL_AT
    const verbs = s.teaching ? PLAN_EASY_VERB : PLAN_FULL_VERB
    const lanes = s.teaching ? PLAN_EASY_LANE : PLAN_FULL_LANE
    this.hazardN = at.length
    this.meterStep = 1 / this.hazardN
    for (let k = 0; k < this.hazardN; k++) {
      const h = this.hazards[k]
      const a = at[k]
      h.at = a
      h.verb = verbs[k]
      h.lane = lanes[k]
      h.isSplit = k === 0
      h.label = h.isSplit ? 'SPLIT' : h.verb.toUpperCase()
      h.shape = h.isSplit ? 'gust' : SHAPE_OF[h.verb]
      h.climax = !s.teaching && k >= CLIMAX_FROM
      h.x = this.mouthX + this.lengthX * a
      // At the mouth: one verb at a time, generous windows, plenty of warning.
      // By the climax the plate arrives late and leaves early.
      h.lead = lerp(760, 380, a) * lerp(1, 0.82, this.intensity)
      h.impactLead = lerp(230, 155, a)
      h.window = lerp(0.95, 0.42, a * this.intensity)
      // A miss costs a CHUNK of birds, never the run — enough misses ends it
      // through the game's normal loss law, which is the scene's business.
      h.cost = h.isSplit
        ? Math.round(3 * this.intensity)
        : Math.round(lerp(4, 9, a) * this.intensity)
      h.state = 'pending'
      h.t = 0
      h.hit = false
      this.hzA[k].setVisible(false)
      this.hzB[k].setVisible(false)
    }
    for (let k = this.hazardN; k < MAX_HAZARDS; k++) {
      this.hazards[k].state = 'spent'
      this.hzA[k].setVisible(false)
      this.hzB[k].setVisible(false)
    }
    this.applyHazardArt()
    this.onEnter?.(s)
  }

  /** Bind the painted piece for each hazard once, at arm time. A texture swap
   * costs a bind, and the one place it is free is here. */
  private applyHazardArt(): void {
    for (let k = 0; k < this.hazardN; k++) {
      const h = this.hazards[k]
      const key =
        h.shape === 'curtain'
          ? this.keyCurtain
          : h.shape === 'slab'
            ? this.keySlab
            : h.shape === 'pinch'
              ? this.keyPinch
              : this.keyGust
      const a = this.hzA[k]
      const b = this.hzB[k]
      if (key) {
        if (a.texture.key !== key) a.setTexture(key)
        if (b.texture.key !== key) b.setTexture(key)
      } else {
        if (a.texture.key !== WALL_TEX) a.setTexture(WALL_TEX)
        if (b.texture.key !== WALL_TEX) b.setTexture(WALL_TEX)
      }
      // Murk, not pastel. The painted pieces are warm and pale out of the box,
      // and warm means FUEL in this game's light grammar — a hazard painted in
      // the reward colour is a lie the player pays for.
      const tint = h.shape === 'gust' ? 0xb9a2d8 : 0x4a3663
      a.setTint(tint)
      b.setTint(tint)
      a.setBlendMode(h.shape === 'gust' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      b.setBlendMode(h.shape === 'gust' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
    }
  }

  // ------------------------------------------------------------- the corridor

  /** Corridor centreline. A closed-form function of world x, exactly like the
   * creatures' Patrol: a corridor the player has learned must be the same
   * corridor on the next attempt, and an integrator would drift. */
  private centreAt(wx: number): number {
    const u = (wx - this.mouthX) / WEAVE_PERIOD
    const p = clamp((wx - this.mouthX) / this.lengthX, 0, 1)
    const amp = WEAVE_MAX * (0.3 + 0.7 * p) * (0.35 + 0.65 * this.intensity)
    return this.baseY + Math.sin(u * TAU) * amp + Math.sin(u * TAU * 0.41 + 1.1) * amp * 0.36
  }

  /**
   * TRUE corridor half-height, including the local pinch of any GATHER hazard —
   * the slot too narrow for a loose flock is real geometry, not a flag.
   *
   * Deliberately separate from `wallHalfAt`: the lane offset is a fraction of
   * this, and folding the ease-in term in here would open the streams to a
   * 300px separation at the mouth, before the corridor that justifies it exists.
   */
  private halfAt(wx: number): number {
    const p = clamp((wx - this.mouthX) / this.lengthX, 0, 1)
    let half = lerp(HALF_OPEN, HALF_TIGHT, p * this.intensity)
    half += Math.sin((wx - this.mouthX) / 260) * 22
    for (let k = 0; k < this.hazardN; k++) {
      const h = this.hazards[k]
      if (h.shape !== 'pinch') continue
      const d = Math.abs(wx - h.x)
      if (d > 300) continue
      const bite = 1 - d / 300
      half *= 1 - 0.42 * bite * bite * (0.45 + 0.55 * this.intensity)
    }
    return half
  }

  /** Where the stone actually IS. Parked far outside until the corridor has
   * eased in, so the containment is genuinely inert rather than merely wide. */
  private wallHalfAt(wx: number): number {
    return this.halfAt(wx) + (1 - this.corridorEase) * WALLS_PARKED
  }

  // -------------------------------------------------------------- the prompts

  private stepHazards(dt: number, flock: Flock, gatherHeld: boolean): void {
    const cx = flock.centerX
    let anyImpact = false
    for (let k = 0; k < this.hazardN; k++) {
      const h = this.hazards[k]
      if (h.state === 'spent') continue
      h.t += dt

      if (h.state === 'pending') {
        if (cx > h.x - h.lead) {
          h.state = 'buildup'
          h.t = 0
          this.onPromptShow?.(h.verb, h.label, h.climax)
        }
        continue
      }

      if (h.state === 'buildup') {
        if (cx > h.x - h.impactLead) {
          h.state = 'impact'
          h.t = 0
          this.onPromptImpact?.(h.verb, h.climax)
          // a hold verb is answered by ALREADY holding it — asking a player to
          // re-press a hold inside a 0.4s window is asking for a different verb
          if (h.verb === 'gather' && gatherHeld) this.resolve(h, true)
        }
        continue
      }

      if (h.state === 'impact') {
        if (h.verb === 'gather' && gatherHeld) {
          this.resolve(h, true)
          continue
        }
        anyImpact = true
        // the window closes on REAL time, or when the flock has physically
        // overrun the hazard — whichever comes first
        if (h.t >= h.window || cx > h.x + 70) this.resolve(h, false, flock)
        continue
      }

      if (h.state === 'decay' && h.t >= DECAY_T) h.state = 'spent'
    }
    this.inImpact = anyImpact
  }

  private resolve(h: Hazard, hit: boolean, flock?: Flock): void {
    h.state = 'decay'
    h.t = 0
    h.hit = hit
    if (hit) {
      this.meter = clamp(this.meter + this.meterStep, 0, 1)
      this.hitFlash = 1
      this.onPromptHit?.(h.verb, h.climax, h.x, this.centreAt(h.x))
    } else {
      // A miss lets the meter SLIP BACK rather than emptying it: the chain is a
      // progress readout, and a readout that resets on one mistake teaches
      // nothing except that the chain is unwinnable.
      this.meter = clamp(this.meter - this.meterStep * 0.6, 0, 1)
      this.missFlash = 1
      if (flock && h.cost > 0) this.tear(flock, h)
      else this.victims.length = 0
      this.onPromptMiss?.(h.verb, this.victims, h.x, this.centreAt(h.x))
    }
    // the split is authored: it happens whether or not the gate was answered.
    // Answering it buys a clean division; missing it buys a ragged one.
    if (h.isSplit && flock) this.fireSplit(flock)
  }

  /**
   * THE EDGES ARE TORN OFF. Not a random slice of the flock: the birds furthest
   * from the core, because that is what the fiction says happens and because it
   * makes gathering the visible answer.
   *
   * Selection is an insertion into a fixed-length prefix rather than a sort, so
   * a miss costs no allocation either — misses happen at the climax, which is
   * precisely when the frame is already busiest.
   */
  private tear(flock: Flock, h: Hazard): void {
    const birds = flock.birds
    const want = Math.min(h.cost, birds.length - 20)
    this.victims.length = 0
    if (want <= 0) return
    const cy = flock.centerY
    const cx = flock.centerX
    let n = 0
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      const dx = b.x - cx
      const dy = b.y - cy
      const d = dx * dx + dy * dy
      // insert into the sorted prefix by hand. Array.splice() returns a fresh
      // array of what it removed, which is exactly the kind of throwaway this
      // file exists without — and a miss happens at the climax, i.e. on the
      // busiest frame of the game.
      let at = n
      while (at > 0) {
        const o = this.victims[at - 1]
        const odx = o.x - cx
        const ody = o.y - cy
        if (odx * odx + ody * ody >= d) break
        at--
      }
      if (at >= want) continue
      const end = n < want ? n : want - 1
      for (let j = end; j > at; j--) this.victims[j] = this.victims[j - 1]
      this.victims[at] = b
      if (n < want) n++
    }
    this.victims.length = n
    // the flock buckles around the loss, so the price is felt and not merely
    // subtracted on a counter in the corner
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      const dy = b.y - this.centreAt(b.x)
      b.vy += Math.sign(dy || 1) * 160
      b.panic = Math.max(b.panic, 0.7)
    }
  }

  private fireSplit(flock: Flock): void {
    if (this.splitFired) return
    this.splitFired = true
    const birds = flock.birds
    const cy = flock.centerY
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      // decided by where the bird ALREADY IS. A random assignment would make the
      // gate read as 120 birds crossing paths rather than one flock dividing —
      // the same defect Flock.assignSlots() sorts its shape seats to avoid.
      const s = b.y < cy ? -1 : 1
      this.lane.set(b, s)
      b.vy += s * 90
      b.panic = Math.max(b.panic, 0.35)
    }
    this.onSplit?.()
  }

  // ------------------------------------------------------------ the flock hold

  /**
   * The lane hold and the wall containment, applied AFTER Flock.update has
   * already integrated this frame.
   *
   * This is a deliberate steering override, not steering: wHome and wIntent both
   * pull toward one point, and a force term alone loses to them (measured — the
   * streams merge inside a second). The kinematic pull is what actually holds
   * two streams apart, exactly as Flock's shape signals snap birds onto their
   * seats for the same reason.
   *
   * The sprite is written too, because Flock.render() has already run for this
   * frame — without it every correction would be one frame stale, which at the
   * tunnel's speed is 6px of visible lag on 120 birds.
   */
  private applyFlock(dt: number, flock: Flock, ramp: number): void {
    if (this.corridorEase < 0.01 && this.splitEase < 0.01) return
    const birds = flock.birds
    const s = this.splitEase
    const parked = (1 - this.corridorEase) * WALLS_PARKED
    const push = FORWARD_PUSH * ramp * this.intensity
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      if (b.perchT > 0) continue
      const mid = this.centreAt(b.x)
      const half = this.halfAt(b.x)
      const wall = half + parked

      // The player still owns where the flock sits IN the corridor; the hold
      // only decides how far each bird sits from its own stream's line. Taking
      // that away would leave nothing to steer, and steering under pressure is
      // the whole second half of this set piece.
      const pilot = clamp(flock.centerY, mid - wall + PILOT_MARGIN, mid + wall - PILOT_MARGIN)
      let sign = this.lane.get(b)
      if (sign === undefined) sign = b.sidePref < 0 ? -1 : 1
      const targetY = pilot + sign * half * LANE_FRACTION * s
      const dy = targetY - b.y
      b.vy += dy * LANE_SPRING * dt * s
      const snap = LANE_SNAP * dt * s
      b.y += dy * (snap > 0.42 ? 0.42 : snap)

      // walls: a spring inside the pad, a hard stop at the stone. Scraping the
      // lip costs no birds — the verbs own the price, and a corridor that also
      // billed for contact would be two taxes on one mistake.
      const top = mid - wall
      const bot = mid + wall
      if (b.y < top + WALL_PAD) {
        b.vy += (top + WALL_PAD - b.y) * WALL_SPRING * dt
        if (b.y < top) {
          b.y = top
          if (b.vy < 0) b.vy *= -0.25
          b.panic = Math.max(b.panic, 0.6)
        }
      } else if (b.y > bot - WALL_PAD) {
        b.vy -= (b.y - (bot - WALL_PAD)) * WALL_SPRING * dt
        if (b.y > bot) {
          b.y = bot
          if (b.vy > 0) b.vy *= -0.25
          b.panic = Math.max(b.panic, 0.6)
        }
      }

      if (push > 0) b.vx += push * dt
      b.sprite.x = b.x
      b.sprite.y = b.y
    }
  }

  // ---------------------------------------------------------------- rendering

  private renderWorld(flock: Flock, scrollX: number): void {
    const ease = this.corridorEase
    const x0 = scrollX - SEG_STEP * 2
    // the segment grid is anchored in WORLD space, so the band never swims
    // against the terrain it is part of
    const base = Math.floor(x0 / SEG_STEP) * SEG_STEP

    // ---- mouth
    const mvis = flock.centerX > this.mouthX - APPROACH_LEAD && flock.centerX < this.mouthX + 700
    if (this.mouth.visible !== mvis) this.mouth.setVisible(mvis)
    if (mvis) {
      this.mouth.setPosition(this.mouthX, this.centreAt(this.mouthX) + 60)
      this.mouth.setAlpha(clamp((this.mouthX + 700 - flock.centerX) / 500, 0, 1) * 0.95)
    }

    // ---- walls
    const lipWarm = 1 + this.hitFlash * 0.5
    for (let i = 0; i < this.topSeg.length; i++) {
      const wx = base + i * SEG_STEP
      const t = this.topSeg[i]
      const bm = this.botSeg[i]
      const inside = wx > this.mouthX - 120 && wx < this.mouthX + this.lengthX + 160 && ease > 0.02
      if (t.visible !== inside) {
        t.setVisible(inside)
        bm.setVisible(inside)
      }
      if (!inside) continue
      const mid = this.centreAt(wx)
      const half = this.wallHalfAt(wx)
      // local slope, so the band's lit lip follows the weave instead of
      // stair-stepping across it
      const rot = Math.atan2(this.centreAt(wx + SEG_STEP) - mid, SEG_STEP)
      const alpha = clamp(ease * 1.2, 0, 1) * (this.missFlash > 0 ? 1 : 0.98)
      t.setPosition(wx, mid - half - BAND_H * (BAND_LIP - 0.5))
      t.setDisplaySize(SEG_W, BAND_H)
      t.setRotation(rot)
      t.setAlpha(alpha)
      bm.setPosition(wx, mid + half + BAND_H * (BAND_LIP - 0.5))
      bm.setDisplaySize(SEG_W, BAND_H)
      bm.setRotation(rot)
      bm.setAlpha(alpha)
      // the lip catches fire for a beat on a correct answer, and goes cold on a
      // miss: the corridor itself reports the exam's result
      const tint = this.missFlash > 0.05 ? 0xd07a72 : lipWarm > 1.02 ? 0xffe7c6 : 0xffffff
      t.setTint(tint)
      bm.setTint(tint)
    }

    // ---- spine
    const sp = this.splitEase
    const sbase = Math.floor(x0 / SPINE_STEP) * SPINE_STEP
    for (let i = 0; i < this.spineSeg.length; i++) {
      const wx = sbase + i * SPINE_STEP
      const g = this.spineSeg[i]
      const inside = sp > 0.06 && wx > this.mouthX && wx < this.mouthX + this.lengthX
      if (g.visible !== inside) g.setVisible(inside)
      if (!inside) continue
      g.setPosition(wx, this.centreAt(wx))
      g.setDisplaySize(SPINE_STEP * 0.62, SPINE_H * sp)
      g.setRotation(Math.atan2(this.centreAt(wx + SPINE_STEP) - this.centreAt(wx), SPINE_STEP))
      g.setAlpha(sp * 0.92)
    }

    // ---- hazards
    for (let k = 0; k < this.hazardN; k++) {
      const h = this.hazards[k]
      const a = this.hzA[k]
      const b = this.hzB[k]
      const mid = this.centreAt(h.x)
      const half = this.halfAt(h.x)
      const near = h.x > scrollX - 400 && h.x < scrollX + VIEW_W + 600 && ease > 0.02
      const gone = h.state === 'spent' && h.hit
      const show = near && !gone
      if (a.visible !== show) a.setVisible(show)
      const twoPiece = h.shape === 'pinch' || h.shape === 'gust'
      if (b.visible !== (show && twoPiece)) b.setVisible(show && twoPiece)
      if (!show) continue

      // a hazard the flock ANSWERED opens and clears out of the way; one that
      // was missed stays, and the flock goes through it
      const opening = h.state === 'decay' && h.hit ? h.t / DECAY_T : 0
      const alpha = clamp(ease, 0, 1) * (1 - opening)

      if (h.shape === 'gust') {
        // no geometry: a pair of streaks tearing across the corridor. The ECHO
        // hazard is the pace itself, and the pace has no wall.
        const w = 520
        a.setPosition(h.x, mid - half * 0.5)
        fitBox(a, w, 66)
        a.setRotation(-0.12)
        a.setAlpha(alpha * 0.7)
        b.setPosition(h.x + 70, mid + half * 0.5)
        fitBox(b, w, 66)
        b.setRotation(0.1)
        b.setAlpha(alpha * 0.7)
        continue
      }

      if (h.shape === 'pinch') {
        // the slot: both walls send a column in, leaving a gap only a gathered
        // flock fits through
        const colH = half * 0.62
        a.setPosition(h.x, mid - half + colH * 0.5)
        fitBox(a, 92, colH)
        a.setAlpha(alpha)
        a.setRotation(0)
        b.setPosition(h.x, mid + half - colH * 0.5)
        fitBox(b, 92, colH)
        b.setAlpha(alpha)
        b.setRotation(0)
        continue
      }

      // curtain / slab: fills ONE lane, from the spine to that lane's wall, so
      // the two streams are offset against each other and the eye keeps moving
      const laneSign = h.lane === 0 ? -1 : h.lane
      const y0 = h.lane === 0 ? mid - half : laneSign < 0 ? mid - half : mid
      const hh = h.lane === 0 ? half * 2 : half
      a.setPosition(h.x + (opening > 0 ? laneSign * opening * 160 : 0), y0 + hh * 0.5)
      fitBox(a, h.shape === 'slab' ? 84 : 62, hh * (1 - opening * 0.35))
      a.setRotation(opening * laneSign * 0.5)
      a.setAlpha(alpha)
    }
  }

  /** Guarded exactly as `setText` already is: Phaser repaints the whole text
   * canvas on a colour change, so setting the same colour every frame is a
   * per-frame allocation and a texture re-upload for no visual difference. */
  private shownColor = ''
  private setVerbColor(c: string): void {
    if (this.shownColor === c) return
    this.shownColor = c
    this.verbText.setColor(c)
  }

  private renderUI(): void {
    let live: Hazard | null = null
    for (let k = 0; k < this.hazardN; k++) {
      const h = this.hazards[k]
      if (h.state === 'buildup' || h.state === 'impact' || h.state === 'decay') {
        live = h
        break
      }
    }

    // ---- meter: visible for the whole run, because the goal has to be on
    // screen before it is worth chasing
    const showMeter = this.phase === 'run' || this.phase === 'breakout'
    if (this.meterTrack.visible !== showMeter) {
      this.meterTrack.setVisible(showMeter)
      this.meterFill.setVisible(showMeter)
      this.meterText.setVisible(showMeter)
    }
    if (showMeter) {
      const w = Math.max(1, (this.meterW - 6) * this.meter)
      this.meterFill.setDisplaySize(w, this.meterFill.displayHeight)
      const full = this.meter >= 0.995
      // full reads differently from nearly-full: it PULSES, so the release is
      // legible in peripheral vision at the speed the climax runs at
      this.meterFill.setTint(full ? 0xfff2d8 : this.missFlash > 0.05 ? 0xd88a7e : 0xf6d9b8)
      this.meterFill.setAlpha(full ? 0.8 + 0.2 * Math.sin(this.clock * 12) : 1)
    }

    if (!live) {
      if (this.plate.visible) {
        this.plate.setVisible(false)
        this.verbText.setVisible(false)
        this.ctrlText.setVisible(false)
        this.windowBar.setVisible(false)
      }
      return
    }

    if (!this.plate.visible) {
      this.plate.setVisible(true)
      this.verbText.setVisible(true)
      this.ctrlText.setVisible(true)
      this.windowBar.setVisible(true)
    }
    if (this.shownLabel !== live.label) {
      this.shownLabel = live.label
      this.verbText.setText(live.label)
      this.ctrlText.setText(isTouch ? CONTROL_TOUCH[live.verb] : CONTROL_KEY[live.verb])
    }

    let alpha = 1
    let scale = 1
    if (live.state === 'buildup') {
      // BUILDUP: the plate flashes faster and faster as the hazard closes. The
      // ramp is scaled by the approach's own length in px over a nominal flock
      // speed, so a short late-tunnel warning tops out just as fast as a long
      // early one instead of never getting there.
      const k = clamp(live.t / Math.max(0.25, (live.lead - live.impactLead) / 340), 0, 1)
      const rate = lerp(2.4, 11, k * k)
      alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.clock * rate * TAU))
      scale = 1 + 0.03 * k
      this.setVerbColor(INK.bright)
      this.windowBar.setDisplaySize(this.plateW, 6)
      this.windowBar.setTint(0x6a5480)
    } else if (live.state === 'impact') {
      // IMPACT: the flashing STOPS and the plate goes solid. The window is open,
      // and a strobing plate at the moment of decision is noise.
      alpha = 1
      scale = 1.06
      this.setVerbColor('#fff6e6')
      const left = clamp(1 - live.t / live.window, 0, 1)
      this.windowBar.setDisplaySize(this.plateW * left, 8)
      this.windowBar.setTint(left > 0.35 ? 0xffd9a0 : 0xff9d86)
    } else {
      // DECAY: burst through, or pay. Both are one short beat, then gone.
      const k = live.t / DECAY_T
      alpha = 1 - k
      scale = live.hit ? 1.06 + k * 0.3 : 1.06 - k * 0.1
      this.setVerbColor(live.hit ? '#fff2d8' : '#ffb2a0')
      this.windowBar.setDisplaySize(this.plateW * (live.hit ? 1 : 0), 8)
      this.windowBar.setTint(live.hit ? 0xfff2d8 : 0xff9d86)
    }

    // a miss shakes the plate; a hit never does — the shake IS the report
    const shake = live.state === 'decay' && !live.hit ? (1 - live.t / DECAY_T) * 9 : 0
    const ox = shake > 0 ? Math.sin(this.clock * 62) * shake : 0
    this.plate.setPosition(this.uiX + ox, this.uiY).setAlpha(alpha)
    this.plate.setDisplaySize(this.plateW * scale, this.plateH * scale)
    this.verbText.setPosition(this.uiX + ox, this.uiY - this.plateH * 0.13).setAlpha(alpha)
    this.ctrlText.setPosition(this.uiX + ox, this.uiY + this.plateH * 0.27).setAlpha(alpha * 0.95)
    this.windowBar.setPosition(this.uiX + ox - this.plateW * 0.5, this.uiY + this.plateH * 0.5 - 5).setAlpha(alpha)
  }

  private hide(): void {
    this.mouth.setVisible(false)
    for (let i = 0; i < this.topSeg.length; i++) {
      this.topSeg[i].setVisible(false)
      this.botSeg[i].setVisible(false)
    }
    for (let i = 0; i < this.spineSeg.length; i++) this.spineSeg[i].setVisible(false)
    for (let i = 0; i < MAX_HAZARDS; i++) {
      this.hzA[i].setVisible(false)
      this.hzB[i].setVisible(false)
    }
    this.plate.setVisible(false)
    this.verbText.setVisible(false)
    this.ctrlText.setVisible(false)
    this.windowBar.setVisible(false)
    this.meterTrack.setVisible(false)
    this.meterFill.setVisible(false)
    this.meterText.setVisible(false)
  }

  // -------------------------------------------------------------- lifecycle

  /**
   * Checkpoint rewind: every tunnel whose mouth is ahead of `beforeX` is armed
   * again, so a failed run gets the whole set piece back rather than a corridor
   * with its hazards already spent. Mirrors FalconSystem.reset().
   */
  reset(beforeX: number): void {
    for (let i = 0; i < this.specs.length; i++) {
      if (this.specs[i].x > beforeX) this.spent[i] = false
    }
    this.cur = -1
    this.phase = 'idle'
    this.corridorEase = 0
    this.splitEase = 0
    this.splitFired = false
    this.impactEase = 0
    this.inImpact = false
    this.timeScale = 1
    this.speedMult = 1
    this.meter = 0
    this.brokeThrough = false
    this.progress = 0
    this.hazardN = 0
    this.victims.length = 0
    this.lane.clear()
    this.hide()
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this)
    this.mouth.destroy()
    for (let i = 0; i < this.topSeg.length; i++) {
      this.topSeg[i].destroy()
      this.botSeg[i].destroy()
    }
    for (let i = 0; i < this.spineSeg.length; i++) this.spineSeg[i].destroy()
    for (let i = 0; i < this.hzA.length; i++) {
      this.hzA[i].destroy()
      this.hzB[i].destroy()
    }
    this.topSeg.length = 0
    this.botSeg.length = 0
    this.spineSeg.length = 0
    this.hzA.length = 0
    this.hzB.length = 0
    this.plate.destroy()
    this.verbText.destroy()
    this.ctrlText.destroy()
    this.windowBar.destroy()
    this.meterTrack.destroy()
    this.meterFill.destroy()
    this.meterText.destroy()
    this.victims.length = 0
    this.lane.clear()
  }
}

/**
 * The two placements. No encounter's first appearance may also be its first
 * difficulty, so the mechanic is met once in still air with nothing at stake,
 * and only then as the gauntlet before the roost.
 *
 * The finale's mouth is the level's own `gauntlet_gate` at x=24250 — the
 * monumental final gate was already standing exactly where the tunnel wants to
 * begin.
 */
export const TUNNELS: TunnelSpec[] = [
  { x: 7000, length: 900, y: 430, intensity: 0, teaching: true, name: 'The Narrows' },
  { x: 24250, length: 1700, y: 430, intensity: 1, name: 'The Tunnel' },
]
