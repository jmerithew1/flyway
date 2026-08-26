/**
 * Touch controls — the phone half of the intention-point model.
 *
 * On a phone the finger on the sky IS the intention, so steering needs no
 * widget at all. What the keyboard supplies and touch does not is the
 * formation grammar: SPACE/SHIFT are hold-for-formation, tap-for-ability.
 * This module mirrors that grammar exactly with two soft thumb pads (GATHER
 * bottom-left, SPREAD bottom-right) plus a small CALL glyph above SPREAD —
 * hold = formation, release under TAP_MS = the ability.
 *
 * Nothing here renders or listens unless `isTouch` is true, so a desktop
 * build behaves exactly as it did before this file existed.
 *
 * STEERING PROTECTION — the one subtle part. DayScene steers from
 * `this.input.activePointer`, and Phaser re-points `activePointer` at
 * whichever pointer last fired an event: the instant a thumb lands on a pad,
 * the flock would lunge at that corner. Rather than edit the scene, the
 * controls install a scene-local shim over `input.activePointer` that reports
 * a virtual pointer tracking only fingers that are NOT owned by a pad. A
 * finger dragging the sky steers; a thumb on a pad never does; and when the
 * sky finger lifts, the virtual pointer holds its last position (the flock
 * keeps its last intention, exactly like a mouse left where it was).
 */

import Phaser from 'phaser'
import { display, INK, safeArea } from './ui'

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
// Audit finding (mobile-pads-invisible): a dark violet disc at 0.22 alpha
// vanished against the sunset AND shrank to ~21px after Scale.FIT. Pads are
// now near-white, ringed, and sized against the SHORT edge of the canvas so
// they stay thumb-sized on any phone.
const FILL = 0xfdf2e4
const IDLE_ALPHA = 0.4
const HELD_ALPHA = 0.72
const FACE_ALPHA = 0.82 // label / glyph at rest; +0.18 while held

/** Layout in the game's fixed 1536×960 logical space (Scale.FIT does the rest). */
const PAD_R = 96 // logical px; ~78 device px at a 844x390 phone fit
const CALL_R = 34
const MARGIN_X = 172
const MARGIN_Y = 150
const TOUCH_SLOP = 20 // hit radius is forgivingly larger than the visual

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

/** One thumb pad: a tinted disc, a label or glyph, and its own pointer. */
class Pad {
  readonly disc: Phaser.GameObjects.Image
  readonly face: Phaser.GameObjects.Text | Phaser.GameObjects.Image
  private readonly zone: Phaser.GameObjects.Zone
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
    face: { label: string } | { glyph: string },
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

    if ('label' in face) {
      this.face = scene.add
        .text(cx, cy, face.label, display(Math.round(r * 0.24), '#fff4e2', 3, 500))
        .setOrigin(0.5)
        .setAlpha(FACE_ALPHA)
        .setScrollFactor(0)
        .setDepth(depth + 0.1)
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

    this.zone = scene.add
      .zone(cx, cy, this.hitR * 2, this.hitR * 2)
      .setScrollFactor(0)
      .setDepth(depth)
      .setInteractive(new Phaser.Geom.Circle(this.hitR, this.hitR, this.hitR), Phaser.Geom.Circle.Contains)
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(p))
  }

  /** Geometric ownership test — used by the steering shim so it never has to
   * care whether Phaser dispatched the zone handler before or after ours. */
  contains(x: number, y: number): boolean {
    return Math.hypot(x - this.cx, y - this.cy) <= this.hitR
  }

  private press(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== null) return
    this.pointerId = p.id
    this.held = true
    this.downMs = p.downTime || this.scene.time.now
    this.disc.setAlpha(HELD_ALPHA)
    this.disc.setScale(this.disc.scaleX * 1.06, this.disc.scaleY * 1.06)
    this.face.setAlpha(Math.min(1, this.faceAlpha + 0.18))
  }

  /** Returns true if this release was a tap (and fires the tap action). */
  release(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== p.id) return
    const up = p.upTime || this.scene.time.now
    this.pointerId = null
    this.held = false
    this.disc.setAlpha(IDLE_ALPHA)
    this.disc.setDisplaySize(this.r * 2, this.r * 2)
    this.face.setAlpha(this.faceAlpha)
    if (up - this.downMs < TAP_MS) this.onTap()
  }

  /** Baseline face alpha — the CALL glyph dims itself through this. */
  setFaceAlpha(a: number): void {
    this.faceAlpha = a
    this.face.setAlpha(this.held ? Math.min(1, a + 0.18) : a)
  }

  destroy(): void {
    this.zone.destroy()
    this.face.destroy()
    this.disc.destroy()
    this.ring.destroy()
  }
}

/**
 * Thumb pads + the steering shim. Construct unconditionally: on a desktop
 * (`isTouch === false`) the constructor builds nothing and every member is
 * an inert default.
 */
export class TouchControls {
  /** Tap actions — assign right after construction; no-ops until you do. */
  onSurge: () => void = () => {}
  onFlare: () => void = () => {}
  onCall: () => void = () => {}
  onPause: () => void = () => {}
  /** true while BOTH formation pads are held — the touch Brace chord. */
  get brace(): boolean {
    return this.gather && this.spread
  }
  /** true while the DIVE pad is held. */
  dive = false

  private pads: Pad[] = []
  private gatherPad?: Pad
  private spreadPad?: Pad
  private callPad?: Pad
  private divePad?: Pad
  private pausePad?: Pad
  private scene?: Phaser.Scene
  /** Pointer ids currently owned by a pad — excluded from steering. */
  private padPointers = new Set<number>()
  /** Steering proxy: only x/y are ever read (DayScene reads exactly those). */
  private virtual = { x: 0, y: 0 } as Phaser.Input.Pointer
  private shimmed = false

  constructor(scene: Phaser.Scene, depth = 26) {
    if (!isTouch) return
    this.scene = scene
    ensurePadTexture(scene)

    // anchor to what the player can actually SEE, not the raw canvas
    const safe = safeArea(scene)
    const w = safe.x + safe.w
    const bottom = safe.y + safe.h - MARGIN_Y
    const left = safe.x + MARGIN_X

    this.gatherPad = new Pad(scene, left, bottom, PAD_R, { label: 'GATHER' }, depth, () => this.onSurge())
    this.spreadPad = new Pad(scene, w - MARGIN_X, bottom, PAD_R, { label: 'SPREAD' }, depth, () => this.onFlare())
    this.callPad = new Pad(
      scene,
      w - MARGIN_X,
      bottom - PAD_R - CALL_R - 26,
      CALL_R,
      scene.textures.exists('bird-mid') ? { glyph: 'bird-mid' } : { label: 'CALL' },
      depth,
      () => this.onCall(),
    )
    // DIVE pad above GATHER — the audit found Dive/Brace unreachable on touch
    this.divePad = new Pad(scene, left, bottom - PAD_R - CALL_R - 26, CALL_R, { label: 'DIVE' }, depth, () => {})
    // PAUSE: small, out of the thumb arcs, top-right — touch had no chrome at all
    this.pausePad = new Pad(scene, w - 74, safe.y + 74, 42, { label: 'II' }, depth, () => this.onPause())
    this.pads = [this.gatherPad, this.spreadPad, this.callPad, this.divePad, this.pausePad]

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)

    // shadow the InputPlugin's prototype getter for THIS scene only
    Object.defineProperty(scene.input, 'activePointer', {
      configurable: true,
      get: () => this.virtual,
    })
    this.shimmed = true

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy())
  }

  /** True while the DIVE pad is held (touch equivalent of the mouse hold). */
  get diving(): boolean {
    return !!this.divePad?.held
  }

  /** True while the GATHER pad is held. */
  get gather(): boolean {
    return this.gatherPad?.held ?? false
  }

  /** True while the SPREAD pad is held. */
  get spread(): boolean {
    return this.spreadPad?.held ?? false
  }

  /** 0 = ready (bright), 1 = just fired (dim). Mirrors the hoarse cooldown. */
  setCallCooldown(t01: number): void {
    const k = Phaser.Math.Clamp(t01, 0, 1)
    this.callPad?.setFaceAlpha(FACE_ALPHA - k * 0.55)
    this.callPad?.disc.setAlpha(this.callPad.held ? HELD_ALPHA : IDLE_ALPHA * (1 - k * 0.45))
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const pad = this.pads.find((q) => q.contains(p.x, p.y))
    if (pad) {
      this.padPointers.add(p.id)
      return
    }
    this.virtual.x = p.x
    this.virtual.y = p.y
  }

  private onMove(p: Phaser.Input.Pointer): void {
    // a pad thumb never steers, even if it slides off the pad mid-hold
    if (this.padPointers.has(p.id)) return
    this.virtual.x = p.x
    this.virtual.y = p.y
  }

  private onUp(p: Phaser.Input.Pointer): void {
    for (const pad of this.pads) pad.release(p)
    this.padPointers.delete(p.id)
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
    this.gatherPad = this.spreadPad = this.callPad = undefined
    this.padPointers.clear()
    this.scene = undefined
  }
}
