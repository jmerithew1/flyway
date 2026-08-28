import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from './backdrop'

/**
 * CAMERA — every camera behaviour in one place, and one rule above all of
 * them: READABILITY WINS. During play the camera is almost imperceptible, and
 * it is always interpolated; the only hard move in the whole module is
 * `impact`, which is hard on purpose and lasts under 200ms. Cinematic
 * behaviour exists, but it is reserved for authored moments and it announces
 * itself by taking the wheel (`engaged`) rather than by leaking into flight.
 *
 * THE CONTRACT WITH DayScene. This scene does not use `startFollow` - the
 * camera pulls the world at an authored rate and the flock is soft-bounded
 * inside it. Fighting that would break the level's pacing, so this director
 * does not write `scrollX` at all. It produces `offsetX` / `offsetY`, which
 * the scene ADDS to its own scroll, and it owns `zoom` only while a move is
 * actually running. Everything composes; nothing is seized.
 *
 * THE ZOOM FLOOR IS NOT A PREFERENCE. Every `scrollFactor(0)` layer in this
 * game - eight mood quads, the veils, the HUD ground - is sized exactly
 * VIEW_W x VIEW_H. Below zoom 1.0 the camera sees past their edges and the
 * frame visibly tears at the border. `pullBack` therefore CANNOT be a zoom-out
 * and is not implemented as one; see its own comment. `MIN_ZOOM` is a hard
 * clamp on every path in this file, and the only way past it is
 * `allowWideZoom`, which a caller may only use after those layers have been
 * oversized.
 */

/**
 * The floor, and the reason for it is above. Note that DayScene currently
 * violates this on its own at the `mobColumn` beat (`zoomTo(0.965)`) - that
 * one call is tearing the frame today, and routing it through `pushIn` here
 * fixes it.
 */
const MIN_ZOOM = 1
/** Past this the world stops reading as a place and starts reading as a map;
 * it is also where the painted art begins to show its resolution. */
const MAX_ZOOM = 1.35
/** Where the camera lives during flight. */
const REST_ZOOM = 1

// -------------------------------------------------------------- gameplay lead
/**
 * The gameplay camera's ENTIRE expressive range. A lead of 34px on a 1536px
 * frame is about two per cent - not noticed, only felt, which is the target.
 * Anything wider starts to hide obstacles behind the frame edge as the flock
 * moves, and an obstacle you could not see is not difficulty.
 */
const LEAD_X_MAX = 34
const LEAD_Y_MAX = 26
/** Per-second approach rate. Slow enough that a twitchy player cannot make the
 * camera twitch - the lag IS the smoothing. */
const LEAD_RATE = 1.9

// ------------------------------------------------------------------- impact
/** The one sanctioned hard move. Decays fast enough to be over before the
 * player can decide whether it was a hit or a bug. */
const IMPACT_DECAY = 13
const IMPACT_HZ = 70
/** px at full strength. Deliberately in the same range as the scene's existing
 * hand-rolled kicks (1.4 to 5), so migrating call sites changes nothing. */
const IMPACT_PX = 5.5

// -------------------------------------------------------------------- shake
/** Two incommensurable frequencies, so the shake never repeats a pattern the
 * eye can lock onto and read as a wobble. */
const SHAKE_HZ_A = 23.7
const SHAKE_HZ_B = 37.1
const SHAKE_PX = 9

/** Approach rates, per second. Authored moves are slower than corrections. */
const ZOOM_RATE_FAST = 6
const ZOOM_RATE_SLOW = 1.6
const PAN_RATE = 2.4

export class CameraDirector {
  private scene: Phaser.Scene
  private cam: Phaser.Cameras.Scene2D.Camera

  /** Add these to the scene's own scroll each frame. */
  offsetX = 0
  offsetY = 0

  private leadX = 0
  private leadY = 0
  /** Gameplay lead is faded out while an authored move runs, so the two never
   * argue over the same pixels. */
  private leadGain = 1

  private panX = 0
  private panY = 0
  private panRate = PAN_RATE

  private focusX = 0
  private focusY = 0
  private focusAmt = 0
  private focusTarget = 0

  private zoomCur = REST_ZOOM
  private zoomTarget = REST_ZOOM
  private zoomRate = ZOOM_RATE_SLOW
  private minZoom = MIN_ZOOM

  private impactAmt = 0
  private impactX = 1
  private impactY = 0

  private shakeAmt = 0
  private shakeDecay = 6

  private clock = 0
  private autoReset = 0

  /**
   * True while an authored move is running. The scene can read this to
   * suppress anything that would fight it, and it is also the flag that
   * decides whether this module writes `cam.zoom` at all - so the scene's
   * existing `zoomTo` calls keep working untouched until they are migrated.
   */
  engaged = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.cam = scene.cameras.main
    this.zoomCur = this.cam.zoom || REST_ZOOM
    this.zoomTarget = REST_ZOOM
  }

  /**
   * Unlock zoom below 1.0. DO NOT CALL until every `scrollFactor(0)` layer has
   * been oversized to at least VIEW_W/min x VIEW_H/min - the frame tears at
   * their edges otherwise, and a torn frame is worse than a tight one.
   */
  allowWideZoom(min: number): void {
    this.minZoom = Phaser.Math.Clamp(min, 0.5, 1)
  }

  // =============================================================== gameplay

  /**
   * The flight camera. Leans a few pixels toward where the flock actually is
   * inside the frame, and toward its vertical drift, so the frame feels like
   * it is being carried by the flock without ever being driven by it.
   *
   * Call every frame with the scene's already-slowed dt. Writes `offsetX` /
   * `offsetY`; returns nothing, because a camera that returns a scroll
   * position is a camera that is trying to own the scroller.
   *
   * @param scrollX the scene's authored scroll, so the flock's position can be
   *        measured in FRAME space rather than world space.
   */
  followFlock(dt: number, flockX: number, flockY: number, scrollX: number): void {
    // where the flock sits in the frame, -1 (left edge) to +1 (right edge)
    const fx = Phaser.Math.Clamp(((flockX - scrollX) / VIEW_W - 0.5) * 2, -1, 1)
    const fy = Phaser.Math.Clamp((flockY / VIEW_H - 0.5) * 2, -1, 1)
    const k = 1 - Math.exp(-LEAD_RATE * dt)
    this.leadX += (fx * LEAD_X_MAX - this.leadX) * k
    this.leadY += (fy * LEAD_Y_MAX - this.leadY) * k
  }

  // ============================================================== cinematic

  /**
   * Draw the frame toward a world point without leaving the flock. `strength`
   * 0..1 is a FRACTION of the way there, never the whole way - a camera that
   * fully centres on an obstacle has stopped showing you the thing you are
   * steering, which is the readability failure this module exists to avoid.
   */
  focus(worldX: number, worldY: number, strength = 0.35, scrollX = this.cam.scrollX): void {
    this.focusX = worldX - (scrollX + VIEW_W * 0.5)
    this.focusY = worldY - VIEW_H * 0.5
    this.focusTarget = Phaser.Math.Clamp(strength, 0, 0.6)
    this.engaged = true
  }

  /**
   * Move in. Clamped at MAX_ZOOM, and always interpolated - `duration` is an
   * approach time, not a tween, so a second call mid-move retargets smoothly
   * instead of snapping to a new tween's start value.
   */
  pushIn(zoom: number, durationMs = 400): void {
    this.zoomTarget = Phaser.Math.Clamp(zoom, this.minZoom, MAX_ZOOM)
    this.zoomRate = 1000 / Math.max(60, durationMs) * 2.2
    this.engaged = true
  }

  /**
   * Move back out.
   *
   * THIS IS NOT A ZOOM-OUT, and that is deliberate, not a compromise. See the
   * module header: below zoom 1.0 the frame tears on every screen-space layer.
   * So `pullBack` is the RELEASE half of a push - it eases zoom back to rest
   * (or to `minZoom`, if a caller has explicitly oversized those layers and
   * unlocked it), lets go of any focus, and hands the frame back to the
   * gameplay lead. From rest it is nearly a no-op in zoom terms, and it still
   * does the thing that actually reads as pulling back: the camera stops
   * leaning at anything and the world becomes symmetric again.
   */
  pullBack(durationMs = 900): void {
    this.zoomTarget = this.minZoom
    this.zoomRate = 1000 / Math.max(60, durationMs) * 2.2
    this.focusTarget = 0
    this.panX = 0
    this.panY = 0
    this.engaged = true
  }

  /**
   * An authored move to somewhere the flock is not. Expressed as an offset on
   * top of the scene's scroll rather than as a scroll write, so the level's
   * pacing keeps running underneath and the camera returns to a frame that has
   * moved on - which is what makes a pan feel like a glance rather than a cut.
   */
  panTo(worldX: number, worldY: number, durationMs = 900, scrollX = this.cam.scrollX): void {
    this.panX = worldX - (scrollX + VIEW_W * 0.5)
    this.panY = worldY - VIEW_H * 0.5
    this.panRate = 1000 / Math.max(120, durationMs) * 2.2
    this.leadGain = 0
    this.engaged = true
  }

  /**
   * Show the player something. The composed cinematic move: hold on the point,
   * lean in a little, and release on its own after `holdMs` - self-terminating
   * because an authored move that relies on someone remembering to end it is
   * an authored move that will one day never end.
   */
  reveal(worldX: number, worldY: number, holdMs = 1200, scrollX = this.cam.scrollX): void {
    this.focus(worldX, worldY, 0.45, scrollX)
    this.pushIn(1.07, 700)
    this.autoReset = holdMs / 1000
    this.leadGain = 0
  }

  // ================================================================= impact

  /**
   * The one sanctioned hard snap. A directional kick that decays in about
   * 150ms - this is the house `camKick` idiom made directional and given a
   * decay the caller cannot forget to apply.
   *
   * @param strength 0..1
   * @param dirX,dirY which way the blow came from. Defaults to horizontal,
   *        matching the existing scroll-axis kick.
   */
  impact(strength = 1, dirX = 1, dirY = 0): void {
    const s = Phaser.Math.Clamp(strength, 0, 1)
    const m = Math.hypot(dirX, dirY) || 1
    this.impactX = dirX / m
    this.impactY = dirY / m
    this.impactAmt = Math.max(this.impactAmt, s)
  }

  /**
   * Sustained tremble - a collapsing structure, a storm gust. Distinct from
   * `impact`: impact is one blow, shake is a condition. Kept low-amplitude
   * because a shaking frame is an unreadable frame, and this game asks the
   * player to thread gaps.
   *
   * @param durationMs sets the decay rate; the shake always fades, never stops.
   */
  shake(strength = 0.5, durationMs = 400): void {
    this.shakeAmt = Math.max(this.shakeAmt, Phaser.Math.Clamp(strength, 0, 1))
    this.shakeDecay = 3000 / Math.max(120, durationMs)
  }

  // ================================================================== reset

  /**
   * Hand the frame back to gameplay. Everything eases; nothing snaps, because
   * the end of a cinematic moment is exactly when a snap is most visible.
   */
  reset(durationMs = 800): void {
    this.zoomTarget = REST_ZOOM
    this.zoomRate = 1000 / Math.max(60, durationMs) * 2.2
    this.focusTarget = 0
    this.panX = 0
    this.panY = 0
    this.panRate = 1000 / Math.max(120, durationMs) * 2.2
    this.autoReset = 0
    this.leadGain = 1
  }

  /** Instant, for a checkpoint respawn where there is nothing to ease from. */
  hardReset(): void {
    this.reset(1)
    this.leadX = 0
    this.leadY = 0
    this.focusAmt = 0
    this.impactAmt = 0
    this.shakeAmt = 0
    this.offsetX = 0
    this.offsetY = 0
    this.zoomCur = REST_ZOOM
    this.engaged = false
    this.cam.setZoom(REST_ZOOM)
  }

  // ================================================================= update

  /**
   * @param dt    the scene's slowed dt - the smooth, interpolated parts ride
   *              this so a hit-stop holds the frame still along with the world.
   * @param rawDt real seconds. The impact kick and the shake ride this: they
   *              are blows to the lens, not events in the world, and a kick
   *              that stretched out under slow motion would read as a wobble.
   */
  update(dt: number, rawDt: number): void {
    this.clock += rawDt

    if (this.autoReset > 0) {
      this.autoReset -= rawDt
      if (this.autoReset <= 0) this.reset(900)
    }

    const kSlow = 1 - Math.exp(-this.panRate * dt)
    this.panX -= this.panX * kSlow
    this.panY -= this.panY * kSlow

    this.focusAmt += (this.focusTarget - this.focusAmt) * (1 - Math.exp(-3.2 * dt))
    this.leadGain += ((this.panX === 0 && this.focusTarget === 0 ? 1 : 0) - this.leadGain) * (1 - Math.exp(-2 * dt))

    this.impactAmt *= Math.exp(-IMPACT_DECAY * rawDt)
    if (this.impactAmt < 0.002) this.impactAmt = 0
    this.shakeAmt *= Math.exp(-this.shakeDecay * rawDt)
    if (this.shakeAmt < 0.002) this.shakeAmt = 0

    const kick = this.impactAmt * IMPACT_PX * Math.sin(this.clock * IMPACT_HZ)
    const sh = this.shakeAmt * this.shakeAmt * SHAKE_PX
    const shx = sh * Math.sin(this.clock * SHAKE_HZ_A)
    const shy = sh * Math.sin(this.clock * SHAKE_HZ_B)

    this.offsetX = this.leadX * this.leadGain + this.panX + this.focusX * this.focusAmt + kick * this.impactX + shx
    this.offsetY = this.leadY * this.leadGain + this.panY + this.focusY * this.focusAmt + kick * this.impactY + shy

    // Zoom is only written while this director is actually running a move, so
    // the scene's own zoomTo calls and the arrival ceremony's per-frame setZoom
    // keep working until they are migrated here. Two owners writing the same
    // property every frame is a stutter you cannot debug from a screenshot.
    if (!this.engaged) return
    this.zoomCur += (this.zoomTarget - this.zoomCur) * (1 - Math.exp(-this.zoomRate * dt))
    // the clamp is applied to the WRITE, not just the target, so no easing
    // path and no caller arithmetic can ever put the camera under the floor
    this.cam.setZoom(Phaser.Math.Clamp(this.zoomCur, this.minZoom, MAX_ZOOM))
    if (
      Math.abs(this.zoomCur - REST_ZOOM) < 0.002 &&
      this.focusAmt < 0.004 &&
      Math.abs(this.panX) < 0.5 &&
      Math.abs(this.panY) < 0.5
    ) {
      this.zoomCur = REST_ZOOM
      this.cam.setZoom(REST_ZOOM)
      this.engaged = false
    }
  }

  /** Current zoom this director believes in - for the debug overlay. */
  get zoom(): number {
    return this.zoomCur
  }

  destroy(): void {
    void this.scene
  }
}
