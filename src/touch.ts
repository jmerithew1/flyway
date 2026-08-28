/**
 * Touch controls — the phone half of FLYWAY.
 *
 * THE SHAPE (owner request L1/L2): the screen splits in two. The LEFT half is
 * a floating joystick that materialises wherever the thumb lands, so there is
 * no fixed target to hunt for and no need to look down. The RIGHT half is a
 * fixed ability cluster arranged along the right thumb's natural sweep:
 * GATHER and SPREAD are the two big held pads (a short tap on either fires
 * its ability — SURGE and FLARE, exactly mirroring the SPACE/SHIFT grammar),
 * with CALL as a smaller pad up the arc.
 *
 * STEERING — the one subtle part. DayScene steers from
 * `this.input.activePointer`, treating it as an *intention point on screen*:
 * the flock flies at wherever the cursor is. Phaser re-points `activePointer`
 * at whichever pointer last fired an event, so the instant a thumb landed on
 * a pad the flock would lunge at that corner. Rather than edit the scene, the
 * controls install a scene-local shim over `input.activePointer` reporting a
 * VIRTUAL pointer that only the joystick ever moves.
 *
 * The joystick maps its deflection onto that same intention point: neutral is
 * a fixed "home" spot in the middle of the visible frame, and full deflection
 * offsets it by REACH_X/REACH_Y. That keeps the desktop mental model intact
 * (you are pointing at a place on the screen) while giving a relative stick
 * that self-centres — so letting go levels the flock out instead of stranding
 * the intention wherever the thumb happened to lift, and picking the stick up
 * never causes a lurch, because a fresh touch starts at zero deflection.
 *
 * Nothing here renders or listens unless `isTouch` is true, so a desktop
 * build behaves exactly as it did before this file existed.
 */

import Phaser from 'phaser'
import { display, safeArea } from './ui'

/** Coarse pointer or a real touch digitiser — the only gate in this file. */
/** Decorative density multiplier. Phones pay for every tweened sprite, and
 * the flock must stay smooth — so ambience thins on touch while gameplay
 * (birds, colliders, abilities) is untouched. */
export const decorScale = ((): number => {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const touchy = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  return coarse || touchy ? 0.45 : 1
})()

export const isTouch: boolean =
  typeof window !== 'undefined' &&
  ((typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0))

/** A release faster than this is a tap (ability); longer is a hold (formation). */
const TAP_MS = 220

const PAD_TEX = 'touchpad-soft'
const STICK_TEX = 'touchstick-base'
const KNOB_TEX = 'touchstick-knob'
// Audit finding (mobile-pads-invisible): a dark violet disc at 0.22 alpha
// vanished against the sunset AND shrank to ~21px after the canvas fit. Pads
// are near-white, ringed, and sized in logical px against a canvas that is
// letterboxed by a known factor, so they stay thumb-sized on any phone.
// WHITE TYPE ON A WHITE DISC. The pad face was a near-white fill and the label
// was #fff4e2 on top of it: measured, the pad labels were the worst text in the
// game at 1.05-2.76 against a 3:1 floor, i.e. barely distinguishable from their
// own background in bright dusk.
//
// The disc is now a DARK plate with a warm rim, which is also the right read:
// a control should look like a thing you press, not like a smudge of light.
// The label keeps its warmth and now has something to sit against.
const FILL = 0x1a1430
const RIM = 0xe8cfa4
const IDLE_ALPHA = 0.5
const HELD_ALPHA = 0.82
const FACE_ALPHA = 0.82 // label / glyph at rest; +0.18 while held

/**
 * Layout in the game's fixed 1536x960 logical space. At the reference phone
 * (844x390 landscape) one logical px is ~0.55 device px and ~0.094 mm, so a
 * comfortable 50 mm thumb sweep is ~530 logical px — every control below sits
 * inside that arc of the bottom-right corner (see the reach table in L3).
 */
const PAD_R = 86 // big formation pads (~16 mm across)
const MINI_R = 50 // call
const SMALL_R = 44
const PAUSE_R = 38
const TOUCH_SLOP = 20 // hit radius is forgivingly larger than the visual

/** Floating joystick. The knob must never ride outside its well, so the
 * throw is the well's rim minus the knob's own radius. */
const STICK_BASE_R = 132 // ~25 mm across at the reference phone
const STICK_KNOB_R = 44
const STICK_RIM = 0.92 // where the rim is drawn inside the texture
const STICK_THROW = STICK_BASE_R * STICK_RIM - STICK_KNOB_R - 3
const STICK_DEAD = 7 // ignore thumb jitter this small
/** Fraction of the visible width that belongs to the joystick. */
const STICK_ZONE = 0.52

/** Soft-edged disc, white for tinting: a pad, not a hard vector circle. */
function ensurePadTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PAD_TEX)) return
  const size = 160
  const canvas = scene.textures.createCanvas(PAD_TEX, size, size)
  if (!canvas) return
  const ctx = canvas.context
  const r = size / 2
  const grd = ctx.createRadialGradient(r, r, r * 0.08, r, r, r)
  grd.addColorStop(0, 'rgba(255,255,255,0.95)')
  grd.addColorStop(0.7, 'rgba(255,255,255,0.8)')
  grd.addColorStop(0.9, 'rgba(255,255,255,0.32)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2)
  ctx.fill()
  // a hairline rim so the pad reads as an object rather than a smudge
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(r, r, r * 0.8, 0, Math.PI * 2)
  ctx.stroke()
  canvas.refresh()
}

/**
 * The joystick's well: a barely-there wash with a bright rim, so it reads as
 * a socket the knob sits in rather than a second button. Engraved, not chunky.
 */
function ensureStickTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(STICK_TEX)) return
  const size = 224
  const canvas = scene.textures.createCanvas(STICK_TEX, size, size)
  if (!canvas) return
  const ctx = canvas.context
  const r = size / 2
  const grd = ctx.createRadialGradient(r, r, r * 0.1, r, r, r * STICK_RIM)
  grd.addColorStop(0, 'rgba(255,255,255,0.2)')
  grd.addColorStop(0.72, 'rgba(255,255,255,0.13)')
  grd.addColorStop(0.98, 'rgba(255,255,255,0.05)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(r, r, r * STICK_RIM, 0, Math.PI * 2)
  ctx.fill()
  // dark liner first, then the warm rim: survives a bright dusk sky
  ctx.strokeStyle = 'rgba(28,20,42,0.5)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(r, r, r * STICK_RIM, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,244,226,0.85)'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(r, r, r * STICK_RIM, 0, Math.PI * 2)
  ctx.stroke()
  // four tick marks on the axes — reads as a control, costs nothing
  ctx.strokeStyle = 'rgba(255,244,226,0.6)'
  ctx.lineWidth = 2.5
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    ctx.beginPath()
    ctx.moveTo(r + Math.cos(a) * r * 0.72, r + Math.sin(a) * r * 0.72)
    ctx.lineTo(r + Math.cos(a) * r * 0.86, r + Math.sin(a) * r * 0.86)
    ctx.stroke()
  }
  canvas.refresh()
}

/** The knob: solid enough to read as a physical thing the thumb is moving. */
function ensureKnobTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(KNOB_TEX)) return
  const size = 128
  const canvas = scene.textures.createCanvas(KNOB_TEX, size, size)
  if (!canvas) return
  const ctx = canvas.context
  const r = size / 2
  const grd = ctx.createRadialGradient(r, r * 0.78, r * 0.05, r, r, r * 0.86)
  grd.addColorStop(0, 'rgba(255,252,246,0.98)')
  grd.addColorStop(0.55, 'rgba(250,232,210,0.92)')
  grd.addColorStop(1, 'rgba(232,206,180,0.8)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(r, r, r * 0.86, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(46,32,62,0.55)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(r, r, r * 0.86, 0, Math.PI * 2)
  ctx.stroke()
  canvas.refresh()
}

/** One thumb pad: a tinted disc, a label, an optional tap caption. */
class Pad {
  readonly disc: Phaser.GameObjects.Image
  private rim!: Phaser.GameObjects.Arc
  readonly face: Phaser.GameObjects.Text | Phaser.GameObjects.Image
  private readonly sub?: Phaser.GameObjects.Text
  private readonly hitR: number

  /** Pointer id this pad owns while held, or null. */
  pointerId: number | null = null
  held = false
  private downMs = 0
  private faceAlpha = FACE_ALPHA
  private ring!: Phaser.GameObjects.Graphics

  constructor(
    private readonly scene: Phaser.Scene,
    readonly cx: number,
    readonly cy: number,
    readonly r: number,
    face: { label: string; sub?: string } | { glyph: string },
    depth: number,
    private readonly onTap: () => void,
  ) {
    this.hitR = r + TOUCH_SLOP
    this.disc = scene.add
      .image(cx, cy, PAD_TEX)
      .setDisplaySize(r * 2, r * 2)
      .setTint(FILL)
      .setAlpha(IDLE_ALPHA)
      .setScrollFactor(0)
      .setDepth(depth)
    // a thin warm rim so the dark plate still reads as a control against dark
    // terrain, rather than disappearing into it
    this.rim = scene.add
      .circle(cx, cy, r, 0x000000, 0)
      .setStrokeStyle(2, RIM, 0.5)
      .setScrollFactor(0)
      .setDepth(depth + 0.05)

    if ('label' in face) {
      this.face = scene.add
        .text(cx, cy, face.label, display(Math.max(11, Math.round(r * 0.2)), '#fff4e2', 3, 500))
        .setOrigin(0.5)
        .setAlpha(FACE_ALPHA)
        .setScrollFactor(0)
        .setDepth(depth + 0.1)
      if (face.sub) {
        // the tap half of the grammar, said out loud: "hold GATHER / tap SURGE"
        this.sub = scene.add
          .text(cx, cy + r + 20, face.sub, display(10, '#ffd9a0', 3, 400))
          .setOrigin(0.5)
          .setAlpha(0.72)
          .setScrollFactor(0)
          .setDepth(depth + 0.1)
      }
    } else {
      this.face = scene.add
        .image(cx, cy, face.glyph)
        .setDisplaySize(r * 1.15, r * 1.15 * 0.62)
        .setTint(0xf6d9b8) // INK.warm as a tint
        .setAlpha(FACE_ALPHA)
        .setScrollFactor(0)
        .setDepth(depth + 0.1)
    }

    // a crisp ring: the difference between "a glow" and "a button"
    const ring = scene.add.graphics().setScrollFactor(0).setDepth(depth + 0.05)
    ring.lineStyle(3, 0xfff4e2, 0.55)
    ring.strokeCircle(cx, cy, r * 0.92)
    ring.lineStyle(1.5, 0x3a2f55, 0.5)
    ring.strokeCircle(cx, cy, r * 0.92 + 2.5)
    this.ring = ring
  }

  /** Geometric ownership test. Every press in this file is resolved by
   * geometry rather than by Phaser hit-testing, because interactive Zones are
   * `topOnly` and would silently swallow one of two overlapping pads. */
  contains(x: number, y: number): boolean {
    return Math.hypot(x - this.cx, y - this.cy) <= this.hitR
  }

  press(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== null) return
    this.pointerId = p.id
    this.held = true
    this.downMs = p.downTime || this.scene.time.now
    this.disc.setAlpha(HELD_ALPHA)
    this.disc.setDisplaySize(this.r * 2 * 1.06, this.r * 2 * 1.06)
    this.face.setAlpha(Math.min(1, this.faceAlpha + 0.18))
  }

  /** Duration of the last completed press, and whether it counted as a tap.
   * Read by the mobile audit probe; free otherwise. */
  lastMs = -1
  lastWasTap = false

  /** Releases the pad, firing the tap action if the press was short. */
  release(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== p.id) return
    const up = p.upTime || this.scene.time.now
    this.pointerId = null
    this.held = false
    this.disc.setAlpha(IDLE_ALPHA)
    this.disc.setDisplaySize(this.r * 2, this.r * 2)
    this.face.setAlpha(this.faceAlpha)
    this.lastMs = up - this.downMs
    this.lastWasTap = this.lastMs < TAP_MS
    if (this.lastWasTap) this.onTap()
  }

  /** Baseline face alpha — the CALL pad dims itself through this. */
  setFaceAlpha(a: number): void {
    this.faceAlpha = a
    this.face.setAlpha(this.held ? Math.min(1, a + 0.18) : a)
  }

  destroy(): void {
    this.face.destroy()
    this.sub?.destroy()
    this.disc.destroy()
    this.rim?.destroy() // the rim is a sibling object; leaking it leaks a ring per pad per restart
    this.ring.destroy()
  }
}

/**
 * The floating joystick. Invisible until a thumb lands in the left half, at
 * which point the well appears under the thumb — so the control comes to the
 * player rather than the player hunting for the control.
 */
class Stick {
  private readonly base: Phaser.GameObjects.Image
  private readonly knob: Phaser.GameObjects.Image
  /** Normalised deflection, -1..1 on each axis. */
  vx = 0
  vy = 0
  pointerId: number | null = null
  private bx = 0
  private by = 0

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: { x: number; y: number; w: number; h: number },
    depth: number,
  ) {
    ensureStickTexture(scene)
    ensureKnobTexture(scene)
    this.base = scene.add
      .image(0, 0, STICK_TEX)
      .setDisplaySize(STICK_BASE_R * 2, STICK_BASE_R * 2)
      .setScrollFactor(0)
      .setDepth(depth)
      .setAlpha(0)
      .setVisible(false)
    this.knob = scene.add
      .image(0, 0, KNOB_TEX)
      .setDisplaySize(STICK_KNOB_R * 2, STICK_KNOB_R * 2)
      .setScrollFactor(0)
      .setDepth(depth + 0.1)
      .setAlpha(0)
      .setVisible(false)
  }

  get active(): boolean {
    return this.pointerId !== null
  }

  begin(p: Phaser.Input.Pointer): void {
    this.pointerId = p.id
    this.bx = this.clampX(p.x)
    this.by = this.clampY(p.y)
    this.vx = 0
    this.vy = 0
    this.scene.tweens.killTweensOf([this.base, this.knob])
    this.base.setVisible(true)
    this.knob.setVisible(true)
    this.place()
    this.scene.tweens.add({ targets: this.base, alpha: 0.95, duration: 110, ease: 'Quad.easeOut' })
    this.scene.tweens.add({ targets: this.knob, alpha: 0.92, duration: 110, ease: 'Quad.easeOut' })
  }

  move(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== p.id) return
    let dx = p.x - this.bx
    let dy = p.y - this.by
    const d = Math.hypot(dx, dy)
    if (d > STICK_THROW) {
      // sticky base: past full throw the well slides after the thumb, so a
      // long drag keeps steering instead of pinning against the rim
      const k = (d - STICK_THROW) / d
      this.bx = this.clampX(this.bx + dx * k)
      this.by = this.clampY(this.by + dy * k)
      dx = p.x - this.bx
      dy = p.y - this.by
    }
    const dd = Math.hypot(dx, dy)
    if (dd < STICK_DEAD) {
      this.vx = 0
      this.vy = 0
    } else {
      const s = Math.min(1, dd / STICK_THROW) / dd
      this.vx = dx * s
      this.vy = dy * s
    }
    this.place()
  }

  end(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== p.id) return
    this.pointerId = null
    this.vx = 0
    this.vy = 0
    this.scene.tweens.killTweensOf([this.base, this.knob])
    this.scene.tweens.add({
      targets: [this.base, this.knob],
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.base.setVisible(false)
        this.knob.setVisible(false)
      },
    })
  }

  private place(): void {
    this.base.setPosition(this.bx, this.by)
    this.knob.setPosition(this.bx + this.vx * STICK_THROW, this.by + this.vy * STICK_THROW)
  }

  private clampX(x: number): number {
    const pad = STICK_BASE_R + 8
    return Phaser.Math.Clamp(x, this.bounds.x + pad, this.bounds.x + this.bounds.w - pad)
  }

  private clampY(y: number): number {
    const pad = STICK_BASE_R + 8
    return Phaser.Math.Clamp(y, this.bounds.y + pad, this.bounds.y + this.bounds.h - pad)
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.base, this.knob])
    this.base.destroy()
    this.knob.destroy()
  }
}

/**
 * Joystick + ability cluster + the steering shim. Construct unconditionally:
 * on a desktop (`isTouch === false`) the constructor builds nothing and every
 * member is an inert default.
 */
export class TouchControls {
  /** Tap actions — assign right after construction; no-ops until you do. */
  onSurge: () => void = () => {}
  onFlare: () => void = () => {}
  onCall: () => void = () => {}
  onPause: () => void = () => {}

  private pads: Pad[] = []
  private gatherPad?: Pad
  private spreadPad?: Pad
  private callPad?: Pad
  private pausePad?: Pad
  private stick?: Stick
  private scene?: Phaser.Scene
  /** Pointer ids currently owned by a pad — never allowed to steer. */
  private padPointers = new Set<number>()
  /** Right-hand boundary of the joystick half, in logical px. */
  private stickZoneRight = 0
  /** Steering proxy: only x/y are ever read (DayScene reads exactly those). */
  private virtual = { x: 0, y: 0 } as Phaser.Input.Pointer
  /** Neutral intention point, and how far full deflection moves it. */
  private homeX = 0
  private homeY = 0
  private reachX = 0
  private reachY = 0
  private shimmed = false

  constructor(scene: Phaser.Scene, depth = 26) {
    if (!isTouch) return
    this.scene = scene
    ensurePadTexture(scene)

    // anchor to what the player can actually SEE, not the raw canvas: the
    // canvas is cropped by the phone's aspect and the crop is NOT symmetric
    const safe = safeArea(scene)

    this.stickZoneRight = safe.x + safe.w * STICK_ZONE
    this.homeX = safe.x + safe.w * 0.42
    this.homeY = safe.y + safe.h * 0.5
    this.reachX = safe.w * 0.3
    this.reachY = safe.h * 0.44
    this.virtual.x = this.homeX
    this.virtual.y = this.homeY

    this.stick = new Stick(
      scene,
      { x: safe.x, y: safe.y, w: this.stickZoneRight - safe.x, h: safe.h },
      depth - 0.5,
    )

    // ---- the right-hand cluster, ordered by how often a thumb needs it:
    // GATHER nearest the corner, then SPREAD, then DIVE / CALL up the arc,
    // with BRACE (rare, deliberate) furthest inboard. Positions come from
    // touchLayout() so an audit probe measures the SAME numbers the game uses.
    const at = (name: string) => {
      const s = touchLayout(safe).find((q) => q.name === name)!
      return s
    }
    const mk = (
      name: string,
      face: { label: string; sub?: string } | { glyph: string },
      tap: () => void,
    ): Pad => {
      const s = at(name)
      return new Pad(scene, s.x, s.y, s.r, face, depth, tap)
    }
    this.gatherPad = mk('GATHER', { label: 'GATHER', sub: 'tap · SURGE' }, () => this.onSurge())
    this.spreadPad = mk('SPREAD', { label: 'SPREAD', sub: 'tap · FLARE' }, () => this.onFlare())
    this.callPad = mk('ECHO', { label: 'ECHO' }, () => this.onCall())
    // PAUSE: small, out of the thumb arcs, top-right — touch had no chrome at all
    this.pausePad = mk('PAUSE', { label: 'II' }, () => this.onPause())
    this.pads = [this.gatherPad, this.spreadPad, this.callPad, this.pausePad]

    // audit hook: the resolved geometry, so a probe can check reachability
    // and hit-testing against the real layout rather than a transcription
    ;(window as unknown as Record<string, unknown>).__touch = {
      safe,
      stickZoneRight: this.stickZoneRight,
      home: { x: this.homeX, y: this.homeY, reachX: this.reachX, reachY: this.reachY },
      pads: touchLayout(safe).map((s) => ({ ...s, hitR: s.r + TOUCH_SLOP })),
      state: () => ({
        gather: this.gather,
        spread: this.spread,
        dive: this.diving,
        brace: this.brace,
        stick: { active: !!this.stick?.active, vx: this.stick?.vx ?? 0, vy: this.stick?.vy ?? 0 },
        intent: { x: this.virtual.x, y: this.virtual.y },
        presses: touchLayout(safe).map((s, i) => ({
          name: s.name,
          ms: Math.round(this.pads[i]?.lastMs ?? -1),
          tap: !!this.pads[i]?.lastWasTap,
        })),
      }),
    }

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)

    // shadow the InputPlugin's prototype getter for THIS scene only
    Object.defineProperty(scene.input, 'activePointer', {
      configurable: true,
      get: () => this.readVirtual(),
    })
    this.shimmed = true

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy())
  }

  /** The intention point the joystick is currently asking for. */
  private readVirtual(): Phaser.Input.Pointer {
    const s = this.stick
    this.virtual.x = this.homeX + (s ? s.vx : 0) * this.reachX
    this.virtual.y = this.homeY + (s ? s.vy : 0) * this.reachY
    return this.virtual
  }

  /** True while the DIVE pad is held (touch equivalent of the mouse hold). */
  get diving(): boolean {
    return false // DIVE is cut; the pad is gone
  }

  /** True while the GATHER pad is held. */
  get gather(): boolean {
    return this.gatherPad?.held ?? false
  }

  /** True while the SPREAD pad is held. */
  get spread(): boolean {
    return this.spreadPad?.held ?? false
  }

  /**
   * The Brace chord. On a keyboard it is SPACE+SHIFT; one thumb cannot hold
   * two pads, so touch gets a pad of its own — while still honouring the
   * two-finger version for anyone who finds it.
   */
  get brace(): boolean {
    // Brace is cut. The getter stays only so callers compile; it is always
    // false, and the two-finger chord no longer does anything either — a chord
    // was never viable on touch, which is why the verb was cut in the first
    // place.
    return false
  }

  /** 0 = ready (bright), 1 = just fired (dim). Mirrors the hoarse cooldown. */
  setCallCooldown(t01: number): void {
    const k = Phaser.Math.Clamp(t01, 0, 1)
    this.callPad?.setFaceAlpha(FACE_ALPHA - k * 0.55)
    this.callPad?.disc.setAlpha(this.callPad.held ? HELD_ALPHA : IDLE_ALPHA * (1 - k * 0.45))
  }

  private onDown(p: Phaser.Input.Pointer): void {
    // pads win: a thumb reaching for an ability must never move the flock
    let hit = false
    for (const pad of this.pads) {
      if (pad.contains(p.x, p.y)) {
        pad.press(p)
        hit = true
      }
    }
    if (hit) {
      this.padPointers.add(p.id)
      return
    }
    if (p.x <= this.stickZoneRight && this.stick && !this.stick.active) this.stick.begin(p)
  }

  private onMove(p: Phaser.Input.Pointer): void {
    // a pad thumb never steers, even if it slides off the pad mid-hold
    if (this.padPointers.has(p.id)) return
    this.stick?.move(p)
  }

  private onUp(p: Phaser.Input.Pointer): void {
    for (const pad of this.pads) pad.release(p)
    this.padPointers.delete(p.id)
    this.stick?.end(p)
  }

  destroy(): void {
    const scene = this.scene
    if (scene) {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
      scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this)
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
      if (this.shimmed) {
        delete (scene.input as unknown as Record<string, unknown>).activePointer
        this.shimmed = false
      }
    }
    for (const pad of this.pads) pad.destroy()
    this.pads = []
    this.stick?.destroy()
    this.stick = undefined
    this.gatherPad = this.spreadPad = this.callPad = this.pausePad = undefined
    this.padPointers.clear()
    this.scene = undefined
  }
}

/**
 * Where every touch control sits, for tests and audits (L3 reachability).
 * Mirrors the constructor exactly — one source of truth for the layout means
 * a probe can measure the real thing rather than a guess about it.
 */
export function touchLayout(safe: { x: number; y: number; w: number; h: number }): {
  name: string
  x: number
  y: number
  r: number
}[] {
  const R = safe.x + safe.w
  const B = safe.y + safe.h
  return [
    { name: 'GATHER', x: R - 146, y: B - 160, r: PAD_R },
    { name: 'SPREAD', x: R - 368, y: B - 160, r: PAD_R },
    { name: 'DIVE', x: R - 140, y: B - 352, r: MINI_R },
    { name: 'ECHO', x: R - 330, y: B - 362, r: MINI_R },
    { name: 'BRACE', x: R - 524, y: B - 250, r: SMALL_R },
    { name: 'PAUSE', x: R - 92, y: safe.y + 78, r: PAUSE_R },
  ]
}
