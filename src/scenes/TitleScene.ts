import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { birdFrameKey } from '../textures'
import { isTouch } from '../touch'
import { display, voice, INK, safeArea } from '../ui'
import { GameAudio } from '../audio'
import { loadBestChain } from '../score'
import type { FlightResult } from '../result'

/**
 * One bird of the standing murmuration.
 *
 * Its home is FIXED. Earlier versions of this screen ran birds along a path or
 * around an ellipse, and both read the same way: a conveyor of evenly spaced
 * black specks crossing an empty sky, which is a screensaver. A real dusk
 * murmuration does not travel across your view — it hangs over the roost as one
 * body and churns inside itself. So the SHAPE here is authored once and never
 * moves; only the birds inside it breathe, and the mass is dense enough to read
 * as a single silhouette rather than as a scatter of dots.
 */
interface FlockBird {
  img: Phaser.GameObjects.Image
  /** authored home, already resolved from the ribbon */
  hx: number
  hy: number
  /** unit normal of the ribbon here, and this bird's signed reach along it */
  nx: number
  ny: number
  reach: number
  /** churn: amplitude and rate per axis, plus the phase that desynchronises it */
  ax: number
  ay: number
  wx: number
  wy: number
  ph: number
  /** flap rate, so the body never beats in unison */
  flap: number
}

/** The one flight the game currently ships. DayScene stamps this id onto its
 * result and result.ts derives its storage key from it, but exports no reader,
 * so the key is rebuilt here rather than left unread. */
const BEST_KEY = 'flyway-best-ancient-ruins'

/** The single idea this screen exists to land. The flight teaches the verbs,
 * and hud.ts's always-on ability bar names the one that answers each threat; a
 * title screen that also tries to teach them is a manual. */
const IDEA = 'Gather the light. Outrun the dark.'

/** Near-black. Every silhouette on this screen is tinted from this family, so
 * the frame always owns a value far below the painting's own 25-75% band. */
const BLACK = 0x04030c

/** Where every band of the screen sits, resolved against the VISIBLE rect. */
interface Layout {
  cx: number
  top: number
  bot: number
  h: number
  /** y of the bottom chrome row, and the top edge of the space it occupies */
  chromeY: number
  chromeRowTop: number
  hintY: number
  buttonY: number
  plateW: number
  plateH: number
  ideaY: number
  wordY: number
  wordW: number
  wordH: number
  /** where the near-black floor starts — everything below it is UI ground */
  floorY: number
  /** where the dark ceiling ends — everything above it is type ground */
  ceilY: number
}

/**
 * The title screen is a POSTER, not a menu and not a demo loop.
 *
 * It is built in three horizontal values, because the measured reason this game
 * read as soft was that every frame lived in a 25-75% mid-tone band:
 *
 *   - a near-black CEILING across the top, which is the ground the wordmark and
 *     the one line of copy are set on;
 *   - a hot BAND across the middle — the painting's own low sun, a shaft, and
 *     the lit roost — with the murmuration hanging in it as pure silhouette and
 *     a ruin going black on the left, the dark the flock is outrunning;
 *   - a near-black FLOOR across the bottom, which is the ground every control
 *     is set on, and the reason contrast here is structural rather than a
 *     stack of backing plates fighting whatever the sky happens to be doing.
 *
 * The picture carries the idea; the copy is one sentence; the controls
 * reference lives behind a press, where it costs the frame nothing.
 */
export class TitleScene extends Phaser.Scene {
  private audio = new GameAudio()
  private rotateCard?: Phaser.GameObjects.Container
  private loaderCard?: Phaser.GameObjects.Container
  private loaderFill?: Phaser.GameObjects.Rectangle
  private loaderRailW = 300

  private birds: FlockBird[] = []
  /** the roost lamps and the shaft: a slow, tiny, composed breath — nothing on
   * this screen drifts, and nothing repeats on a tween */
  private breathers: { img: Phaser.GameObjects.Image; base: number; amp: number; ph: number }[] = []
  private started = false
  private toast?: Phaser.GameObjects.Text
  private toastTween?: Phaser.Tweens.Tween
  private panel?: Phaser.GameObjects.Container
  /** device-corrected multiplier for the small labels; see measureTypeBoost */
  private boost = 1

  constructor() {
    super('Title')
  }

  /**
   * The painted title plate and wordmark ship in the asset kit; they were once
   * missing from the generated manifest and this screen silently fell back to
   * the procedural day plate and a letter-spaced text title. The manifest has
   * since been regenerated, so these loads are normally no-ops — they stay as
   * the guard against that regressing again, and cost nothing when it has not.
   */
  preload(): void {
    const extra: Array<[string, string]> = [
      ['title_bg', 'assets/processed/final/title_bg.webp'],
      ['wordmark', 'assets/processed/final/wordmark.webp'],
    ]
    for (const [key, file] of extra) {
      if (!this.textures.exists(key)) this.load.image(key, file)
    }
    // A missing optional plate must never take the screen down with it; every
    // use site is guarded by textures.exists, so swallowing the failure is the
    // whole recovery.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => undefined)
    this.buildLoaderCard()
  }

  /**
   * The boot veil in index.html hands over to Phaser's flat clear colour with
   * nothing drawn on it, so the brand dissolves into a lighter, emptier field
   * before the title appears — the loudest reason the load reads as broken.
   * Painting this scene's own near-black plate during preload means the canvas
   * is never that empty grey, and the rail below reports REAL byte progress
   * rather than index.html's endless CSS sweep, which looks identical at one
   * percent and at a hang.
   */
  private buildLoaderCard(): void {
    const kids: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05040e, 1).setOrigin(0),
    ]
    const word = this.add.text(VIEW_W / 2, VIEW_H * 0.44, 'FLYWAY', display(60, '#e9dcf4', 22, 300)).setOrigin(0.5)
    const line = this.add.text(VIEW_W / 2, VIEW_H * 0.44 + 74, IDEA, voice(20, '#b9aacb')).setOrigin(0.5)
    const railY = VIEW_H * 0.44 + 132
    const track = this.add.rectangle(VIEW_W / 2, railY, this.loaderRailW, 3, 0xf0cf9a, 0.2)
    this.loaderFill = this.add
      .rectangle(VIEW_W / 2 - this.loaderRailW / 2, railY, 2, 3, 0xf0cf9a, 0.95)
      .setOrigin(0, 0.5)
    kids.push(word, line, track, this.loaderFill)
    this.loaderCard = this.add.container(0, 0, kids).setDepth(900)

    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      this.loaderFill?.setSize(Math.max(2, this.loaderRailW * p), 3)
    })
  }

  create(): void {
    this.started = false
    this.birds = []
    this.breathers = []

    const L = this.measureLayout()

    this.buildBand(L)
    this.buildLight(L)
    this.buildMurmuration(L)
    this.buildDarkSide(L)
    this.buildCeiling(L)
    this.buildFloor(L)
    this.buildWords(L)
    this.buildStart(L)
    this.buildChrome(L)
    this.buildRotateCard()

    // The loader plate stays on top and dissolves, so the handover from the
    // boot veil to the painted frame is one continuous fade rather than a grey
    // gap followed by a pop.
    if (this.loaderCard) {
      const card = this.loaderCard
      this.tweens.add({ targets: card, alpha: 0, duration: 520, delay: 60, onComplete: () => card.destroy() })
      this.loaderCard = undefined
    }
  }

  // ---------------------------------------------------------------- layout

  /**
   * Resolve every band against the VISIBLE rect, stacking the lower block from
   * the bottom edge upwards.
   *
   * A fixed y-table cannot survive this game's scaling. The canvas width now
   * follows the device aspect (backdrop.ts), and the type ramp in ui.ts scales
   * every string by 1.65 on touch — so the same table that breathes on desktop
   * has the button, the hint and the chrome row on top of each other on a
   * phone. Measuring the button first and stacking upward from a known bottom
   * is what keeps them apart at every size.
   */
  private measureLayout(): Layout {
    this.boost = this.measureTypeBoost()
    const safe = safeArea(this)
    const cx = safe.x + safe.w / 2
    const top = safe.y
    const bot = safe.y + safe.h
    const h = safe.h

    // measure the real button before anything is placed against it
    const probe = this.add.text(0, -4000, 'BEGIN FLIGHT', this.beginStyle()).setOrigin(0.5)
    const ink = this.inkBox(probe)
    probe.destroy()
    const padX = isTouch ? 76 : 94
    const padY = isTouch ? 30 : 38
    const plateW = Math.min(VIEW_W - 96, Math.round(ink.w + padX * 2))
    const plateH = Math.round(ink.h + padY * 2)

    const chromeY = bot - (isTouch ? 42 : 46)
    // the row is as tall as its own boosted label needs, so nothing above it
    // can ever creep down into the share controls
    const rowH = Math.round((isTouch ? 64 : 50) * this.boost)
    const chromeRowTop = chromeY - rowH / 2
    // the keyboard hint has no audience on touch, and the space it wants is the
    // space the chrome row needs
    const hintY = isTouch ? chromeY : chromeRowTop - 24
    const buttonBottom = isTouch ? chromeRowTop - 24 : hintY - 22
    const buttonY = buttonBottom - plateH / 2

    const wordW = Math.min(VIEW_W * 0.4, h * 0.66)
    let wordH = wordW * 0.315
    if (this.textures.exists('wordmark')) {
      const f = this.frameSize('wordmark')
      wordH = (f.h / f.w) * wordW
    }
    const wordY = top + h * 0.15 + wordH / 2
    const ideaY = wordY + wordH / 2 + Math.round((isTouch ? 48 : 42) * this.boost)

    // The three values. The ceiling has to clear the copy with room to spare —
    // it IS the copy's ground — and the floor has to start above the button for
    // the same reason.
    const ceilY = Math.min(top + h * 0.5, ideaY + h * 0.09)
    const floorY = Math.max(top + h * 0.66, buttonY - plateH / 2 - h * 0.06)

    return {
      cx, top, bot, h,
      chromeY, chromeRowTop, hintY,
      buttonY, plateW, plateH,
      ideaY, wordY, wordW, wordH,
      floorY, ceilY,
    }
  }

  private beginStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return display(isTouch ? 28 : 34, '#fff3dc', 10, 400)
  }

  /**
   * Extra type scale for the small labels on THIS screen.
   *
   * ui.ts ramps every string by a flat 1.65 on touch. That was calibrated when
   * the canvas was a fixed 1536 wide, so a phone drew it at about 0.55 and a
   * 13px label landed near 12 device px. The canvas width now follows the
   * device aspect, so a 3:1 phone gets a ~2880-wide canvas drawn at ~0.29 — and
   * the same ramp puts that label at six device px. Measuring what a probe
   * actually resolves to on THIS device and topping it up keeps the bottom row
   * readable, and collapses to 1.0 wherever the ramp is already enough, so it
   * can never double-apply.
   */
  private measureTypeBoost(): number {
    const probe = this.add.text(0, -4000, 'X', display(13))
    const px = parseFloat(String(probe.style.fontSize)) || 13
    probe.destroy()
    const rect = this.game.canvas?.getBoundingClientRect()
    const pxPerLogical = rect && rect.width ? rect.width / this.scale.width : 1
    const FLOOR_DEVICE_PX = 12
    return Phaser.Math.Clamp(FLOOR_DEVICE_PX / Math.max(1, px * pxPerLogical), 1, 1.9)
  }

  /** Small display type, corrected for how small this device actually draws it. */
  private small(size: number, color: string, tracking = 0, weight: 300 | 400 | 500 = 400): Phaser.Types.GameObjects.Text.TextStyle {
    return display(Math.round(size * this.boost), color, tracking, weight)
  }

  /** The spoken voice at the same correction, for the controls reference. */
  private smallVoice(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return voice(Math.round(size * this.boost), color)
  }

  // ---------------------------------------------------------------- painting

  /** Native pixel size of a loaded texture. */
  private frameSize(key: string): { w: number; h: number } {
    const f = this.textures.get(key).get()
    return { w: f.width, h: f.height }
  }

  /**
   * Place a painted piece by its height, anchored anywhere, guarded by key.
   * Every art call on this screen goes through here so a missing piece is a
   * missing piece and never a crash or a green placeholder.
   */
  private piece(
    key: string,
    x: number,
    y: number,
    h: number,
    opts: {
      ox?: number
      oy?: number
      tint?: number
      alpha?: number
      depth?: number
      flipX?: boolean
      angle?: number
      add?: boolean
    } = {},
  ): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(key)) return null
    const f = this.frameSize(key)
    const img = this.add
      .image(x, y, key)
      .setOrigin(opts.ox ?? 0.5, opts.oy ?? 0.5)
      .setDisplaySize((f.w / f.h) * h, h)
      .setDepth(opts.depth ?? 0)
      .setAlpha(opts.alpha ?? 1)
    if (opts.tint !== undefined) img.setTint(opts.tint)
    if (opts.flipX) img.setFlipX(true)
    if (opts.angle) img.setAngle(opts.angle)
    // ADD, never OVERLAY — Phaser's WebGL renderer implements only
    // NORMAL/ADD/MULTIPLY/SCREEN, and OVERLAY silently renders wrong.
    if (opts.add) img.setBlendMode(Phaser.BlendModes.ADD)
    return img
  }

  /**
   * A soft directional wash built from the procedural `vfade` ramp (transparent
   * at one end, solid at the other). Used for the ceiling and the floor: a
   * hard-edged rectangle across a painting reads as a rendering fault, and a
   * ramp reads as depth.
   */
  private wash(y: number, height: number, color: number, alpha: number, fromTop: boolean, depth: number): void {
    if (this.textures.exists('vfade')) {
      const img = this.add
        .image(VIEW_W / 2, y, 'vfade')
        .setOrigin(0.5, fromTop ? 0 : 1)
        .setDisplaySize(VIEW_W, height)
        .setTint(color)
        .setAlpha(alpha)
        .setDepth(depth)
      if (fromTop) img.setFlipY(true)
      return
    }
    this.add
      .rectangle(VIEW_W / 2, y, VIEW_W, height, color, alpha * 0.7)
      .setOrigin(0.5, fromTop ? 0 : 1)
      .setDepth(depth)
  }

  /**
   * The painted plate, pushed down and cooled so it can be a BAND rather than
   * the whole picture. The plate is a lovely pastel dusk on its own, and pastel
   * everywhere is exactly the 25-75% wash the audit named; knocking the whole
   * thing down here is what lets the light added on top of it actually read as
   * hot instead of as one more mid-tone.
   */
  private buildBand(L: Layout): void {
    const key = this.textures.exists('title_bg')
      ? 'title_bg'
      : this.textures.exists('sky_homeward')
        ? 'sky_homeward'
        : 'bg_plate'
    if (this.textures.exists(key)) {
      const { w, h } = this.frameSize(key)
      const cover = Math.max(VIEW_W / w, VIEW_H / h)
      this.add
        .image(VIEW_W / 2, L.top + L.h * 0.52, key)
        .setDisplaySize(w * cover, h * cover)
        .setDepth(-100)
    }
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0a0718, 0.42).setOrigin(0).setDepth(-99)
  }

  /**
   * The hot value: a single shaft standing over the lit roost, on the right.
   *
   * Deliberately ONE source, tightly placed. The previous pass scattered seven
   * painted motes across the right third and let a wide warm blob sit under
   * them; together they stopped being light and became blurry white smudges
   * over the painting — the "weird wave of motes". Light needs a source, a
   * direction and something it falls ON, and one shaft landing on the roost is
   * all three.
   */
  private buildLight(L: Layout): void {
    const gx = VIEW_W * 0.795

    const shaft =
      this.piece('shaft_column_04', gx, L.top - L.h * 0.02, L.h * 0.78, { oy: 0, add: true, alpha: 0.42, depth: -70 }) ??
      this.piece('shaft_diag_05', gx, L.top + L.h * 0.36, L.h * 0.46, { add: true, alpha: 0.45, depth: -70 })
    if (shaft) this.breathers.push({ img: shaft, base: shaft.alpha, amp: 0.05, ph: 0 })

    // The hot core, kept SMALL. A big warm blob is a wash; a small one next to
    // a near-black silhouette is a light source.
    if (this.textures.exists('softdot')) {
      const core = this.add
        .image(gx, L.top + L.h * 0.6, 'softdot')
        .setTint(0xffe0a8)
        .setDisplaySize(VIEW_W * 0.13, L.h * 0.2)
        .setAlpha(0.55)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-69)
      this.breathers.push({ img: core, base: 0.55, amp: 0.06, ph: 1.9 })
    }

    // The destination, standing in its own light: the one piece on this screen
    // allowed to stay fully saturated.
    this.piece('roost_lit', gx, L.floorY + L.h * 0.12, L.h * 0.56, { oy: 1, alpha: 1, depth: -55 })
  }

  /**
   * The murmuration: one authored ribbon of birds hanging in the hot band.
   *
   * The ribbon is a cubic that starts BEHIND the black ruin on the left and
   * narrows to a point as it reaches the light, so the body reads as the flock
   * pulling out of the dark. Thickness, density and per-bird scale are all
   * functions of position along it, which is the difference between a flock and
   * a line of evenly spaced specks; birds are tinted to near-black so the mass
   * is a silhouette against the one hot value in the frame.
   */
  private buildMurmuration(L: Layout): void {
    // painted distant flocks, static, for a depth the sprites cannot buy cheaply
    this.piece('flock_decal_a', VIEW_W * 0.55, L.ceilY + L.h * 0.06, L.h * 0.045, {
      tint: 0x120d24,
      alpha: 0.6,
      depth: -52,
    })
    this.piece('flock_decal_b', VIEW_W * 0.68, L.ceilY + L.h * 0.14, L.h * 0.032, {
      tint: 0x120d24,
      alpha: 0.45,
      depth: -52,
    })

    if (!this.textures.exists('bird-mid')) return
    const p0x = VIEW_W * 0.09, p0y = L.top + L.h * 0.68
    const p1x = VIEW_W * 0.32, p1y = L.top + L.h * 0.63
    const p2x = VIEW_W * 0.55, p2y = L.top + L.h * 0.44
    const p3x = VIEW_W * 0.74, p3y = L.top + L.h * 0.4

    const n = isTouch ? 150 : 200
    for (let i = 0; i < n; i++) {
      // biased toward the tail, so the body has a mass and the head a point
      const s = Math.pow((i + Math.random()) / n, 1.2)
      const u = 1 - s
      const x = u * u * u * p0x + 3 * u * u * s * p1x + 3 * u * s * s * p2x + s * s * s * p3x
      const y = u * u * u * p0y + 3 * u * u * s * p1y + 3 * u * s * s * p2y + s * s * s * p3y
      const d0 = 3 * u * u, d1 = 6 * u * s, d2 = 3 * s * s
      const tx = d0 * (p1x - p0x) + d1 * (p2x - p1x) + d2 * (p3x - p2x)
      const ty = d0 * (p1y - p0y) + d1 * (p2y - p1y) + d2 * (p3y - p2y)
      const m = Math.hypot(tx, ty) || 1
      const nx = -ty / m
      const ny = tx / m

      // wide at the tail, a point at the head
      const thick = (L.h * 0.22) * Math.pow(1 - s, 1.1) + L.h * 0.025
      // three uniforms summed: a soft core with stragglers, not an even band
      const off = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
      const reach = off * thick

      const scale = (0.155 - 0.055 * s) * (0.72 + Math.random() * 0.56)
      const img = this.add
        .image(x + nx * reach, y + ny * reach, 'bird-mid')
        .setDepth(-45)
        .setTint(0x0b0818)
        .setScale(scale)
        .setRotation(Math.atan2(ty, tx))
        // the tail sinks into the dark rather than stopping at an edge
        .setAlpha(0.45 + 0.55 * Math.min(1, s / 0.3))

      this.birds.push({
        img,
        hx: x, hy: y,
        nx, ny, reach,
        ax: 5 + Math.random() * 11,
        ay: 4 + Math.random() * 8,
        wx: 0.35 + Math.random() * 0.5,
        wy: 0.45 + Math.random() * 0.65,
        ph: Math.random() * 6.283,
        flap: 5 + Math.random() * 3.5,
      })
    }
  }

  /**
   * The dark the flock is outrunning: a bank of monuments on the left going to
   * near-black, stepping back and lightening as they recede.
   *
   * Deliberately NOT the nightfall fog. That system (src/nightfall.ts) is a
   * gameplay object driven by a live Flock and a scroll position; the
   * hand-tinted fog cutouts this screen used instead read as smoke scribbled
   * over the painting, which is exactly the complaint. Depth of value carries
   * the dark far better than smoke does, and it puts the frame's blackest mass
   * right where the flock is leaving from.
   *
   * These sit ABOVE the birds in depth, so the tail of the murmuration is
   * occluded by the ruin and genuinely emerges from behind it.
   */
  private buildDarkSide(L: Layout): void {
    this.piece('storm_spire', VIEW_W * 0.105, L.bot, L.h * 0.82, { oy: 1, tint: BLACK, alpha: 1, depth: -30 })
    this.piece('bell_tower', VIEW_W * 0.235, L.bot, L.h * 0.6, { oy: 1, tint: 0x0a0820, alpha: 0.97, depth: -31 })
    this.piece('colonnade_triple', VIEW_W * 0.345, L.floorY + L.h * 0.05, L.h * 0.2, {
      oy: 1,
      tint: 0x110d28,
      alpha: 0.9,
      depth: -32,
    })
    this.piece('statue_robed', VIEW_W * 0.44, L.floorY + L.h * 0.04, L.h * 0.13, {
      oy: 1,
      tint: 0x171136,
      alpha: 0.8,
      depth: -33,
    })
  }

  /**
   * The near-black ceiling. This is the ground the wordmark and the one line of
   * copy are set on, which is why contrast up here does not depend on what the
   * painting happens to be doing behind them.
   */
  private buildCeiling(L: Layout): void {
    this.wash(L.top, L.ceilY - L.top, 0x040309, 0.94, true, -20)
    this.piece('occluder_canopy_tl', 0, L.top, L.h * 0.3, { ox: 0, oy: 0, tint: BLACK, alpha: 0.98, depth: -18 })
    // The mirrored canopy, NOT occluder_wisteria_tr: that piece carries an
    // opaque rectangle in its own corner, and mirroring it dragged that block
    // into open sky as a hard-edged dark slab that read as a rendering fault.
    this.piece('occluder_canopy_tl', VIEW_W, L.top, L.h * 0.22, {
      ox: 0,
      oy: 0,
      tint: BLACK,
      alpha: 0.96,
      depth: -18,
      flipX: true,
    })
  }

  /**
   * The near-black floor. Every control on this screen stands on it, so their
   * contrast is a property of the composition rather than a stack of backing
   * plates chasing whatever colour the sky is.
   */
  private buildFloor(L: Layout): void {
    this.wash(L.bot, L.bot - L.floorY, 0x030208, 0.97, false, -8)
    this.piece('occluder_cypress_br', VIEW_W, L.bot, L.h * 0.34, { ox: 1, oy: 1, tint: BLACK, alpha: 0.98, depth: -7 })
    this.piece('fg_ground', VIEW_W / 2, L.bot, L.h * 0.17, { oy: 1, tint: BLACK, alpha: 0.9, depth: -6 })
    // a hairline of warm at the horizon line, so the floor meets the band as an
    // edge rather than as a fade into nothing
    this.add
      .rectangle(VIEW_W / 2, L.floorY, VIEW_W, 2, 0xffcf94, 0.16)
      .setOrigin(0.5, 0)
      .setDepth(-5)
  }

  private buildWords(L: Layout): void {
    let title: Phaser.GameObjects.GameObject
    if (this.textures.exists('wordmark')) {
      title = this.add.image(L.cx, L.wordY, 'wordmark').setDisplaySize(L.wordW, L.wordH).setAlpha(0).setDepth(40)
    } else {
      title = this.add
        .text(L.cx, L.wordY, 'FLYWAY', display(76, '#fff4e6', 24, 300))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(40)
    }

    // ONE line, in the game's own voice, set directly under the mark where a
    // poster puts its line. The abilities are not explained here and the second
    // slogan is gone: two lines saying the same thing was the copy reading as
    // filler.
    const idea = this.add
      .text(L.cx, L.ideaY, IDEA, voice(Math.round(26 * this.boost), '#ffe7c4'))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(40)

    // a rule under the line, the width of the line: it turns a floating string
    // into a set block, and it is the cheapest possible piece of art direction
    const rule = this.add
      .rectangle(L.cx, L.ideaY + idea.height * 0.62, Math.min(idea.width * 1.12, VIEW_W * 0.5), 1, 0xf0cf9a, 0.34)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(40)

    this.tweens.add({ targets: title, alpha: 1, duration: 1000 })
    this.tweens.add({ targets: [idea, rule], alpha: 0.97, duration: 800, delay: 420 })
  }

  /**
   * Measure the real ink of a rendered Text, in its own local pixels.
   *
   * Centring a plate on a Text's LINE BOX leaves all-caps type sitting visibly
   * high inside its own button, because the box carries ascender and descender
   * leading no capital ever uses — and the touch type ramp multiplies that
   * leading by 1.65, which is why the button read as misaligned on a phone and
   * only slightly off on desktop. Letter-spacing adds a trailing gap on the
   * right for the same reason. Reading the glyph coverage off the text canvas
   * settles both without guessing at font metrics.
   */
  private inkBox(t: Phaser.GameObjects.Text): { x: number; y: number; w: number; h: number } {
    const fallback = { x: 0, y: 0, w: t.width, h: t.height }
    const canvas = t.canvas
    if (!canvas || !canvas.width || !canvas.height) return fallback
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    let data: Uint8ClampedArray
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    } catch {
      return fallback
    }
    let x0 = canvas.width
    let y0 = canvas.height
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        // the dark halo from ui.legible() fades out gradually; 60 keeps the
        // measurement on the glyphs and their contact shadow, not the bloom
        if (data[(y * canvas.width + x) * 4 + 3] < 60) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) return fallback
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
  }

  private buildStart(L: Layout): void {
    const label = this.add
      .text(L.cx, L.buttonY, 'BEGIN FLIGHT', this.beginStyle())
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(52)

    // Re-centre the label so the INK, not the text box, sits in the middle of
    // the plate drawn around it.
    const ink = this.inkBox(label)
    label.setPosition(
      L.cx - (ink.x + ink.w / 2 - label.width / 2),
      L.buttonY - (ink.y + ink.h / 2 - label.height / 2),
    )

    const x0 = L.cx - L.plateW / 2
    const y0 = L.buttonY - L.plateH / 2
    const r = L.plateH / 2
    const plate = this.add.graphics().setAlpha(0).setDepth(50)
    plate.fillStyle(0x0b0818, 0.96)
    plate.fillRoundedRect(x0, y0, L.plateW, L.plateH, r)
    plate.lineStyle(2, 0xf5d49c, 0.95)
    plate.strokeRoundedRect(x0, y0, L.plateW, L.plateH, r)

    let glow: Phaser.GameObjects.Image | undefined
    if (this.textures.exists('softdot')) {
      glow = this.add
        .image(L.cx, L.buttonY, 'softdot')
        .setTint(0xffc987)
        .setDisplaySize(L.plateW * 1.45, L.plateH * 3)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(49)
    }

    if (!isTouch) {
      const hint = this.add
        .text(L.cx, L.hintY, 'or press SPACE', this.small(13, '#ddd0e8', 5, 300))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(52)
      this.tweens.add({ targets: hint, alpha: 0.85, duration: 700, delay: 1000 })
    }

    /**
     * A Zone, not the Text. THIS WAS THE HIT-BOX BUG.
     *
     * Phaser's Text.updateText() rewrites input.hitArea.width/height on every
     * re-render unless input.customHitArea is true. The old button assigned a
     * plate-sized hit rectangle to the LABEL but left customHitArea false, so
     * the first hover — which recoloured the label and therefore re-rendered
     * it — collapsed the box back to glyph size while KEEPING the custom
     * negative offset, leaving the pressable region sitting above and left of
     * the button it was drawn on. Hover reported the button; the press missed
     * it, and only a scene-wide click-anywhere listener hid that on desktop. On
     * a phone there is no hover to disguise it, which is why it was reported as
     * a mobile bug. A Zone never re-renders, so the target cannot drift.
     *
     * The reveal below is deliberately short for a related reason: the zone is
     * live from create(), so a long fade would leave the primary control
     * pressable while it is still invisible.
     */
    const zone = this.add
      .zone(L.cx, L.buttonY, L.plateW, L.plateH)
      .setName('begin')
      .setOrigin(0.5)
      .setDepth(60)
      .setInteractive({ useHandCursor: true })

    const setLit = (on: boolean): void => {
      label.setColor(on ? '#ffe6bf' : '#fff3dc')
      glow?.setAlpha(on ? 0.38 : 0.18)
    }
    zone.on('pointerover', () => setLit(true))
    zone.on('pointerout', () => setLit(false))
    zone.on('pointerdown', () => this.beginFlight())

    // Pressing the sky must still fly, but a press anywhere at all must not.
    // The sky stops clear of the chrome row rather than merely sitting below it
    // in depth: relying on depth sorting alone left a few pixels where the two
    // targets genuinely overlapped, and that is the bug this screen is fixing.
    const skyBot = Math.min(L.buttonY + L.plateH / 2 + (isTouch ? 14 : 18), L.chromeRowTop - 10)
    this.add
      .zone(VIEW_W / 2, (L.top + skyBot) / 2, VIEW_W, Math.max(120, skyBot - L.top))
      .setName('sky')
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive()
      .on('pointerdown', () => this.beginFlight())

    this.input.keyboard?.once('keydown-ENTER', () => this.beginFlight())
    this.input.keyboard?.once('keydown-SPACE', () => this.beginFlight())
    // the score wakes on a mere hover, before any commitment
    this.input.once('pointermove', () => this.audio.start())
    this.input.keyboard?.once('keydown', () => this.audio.start())

    this.tweens.add({ targets: [plate, label], alpha: 1, duration: 620, delay: 700 })
    if (glow) {
      this.tweens.add({ targets: glow, alpha: 0.18, duration: 760, delay: 700 })
    }
  }

  private beginFlight(): void {
    if (this.started || this.panel) return
    this.started = true
    this.audio.start() // must ride a real gesture, so unlock here
    this.scene.start('Day')
  }

  // ------------------------------------------------------------------ chrome

  /**
   * The bottom band: the controls reference, the best flight, and sharing.
   *
   * All of it sits on the near-black floor, below the sky zone's reach and
   * above it in depth, so none of these can swallow — or be swallowed by — the
   * BEGIN FLIGHT press. That exact class of overlap is the bug this screen is
   * also fixing.
   */
  private buildChrome(L: Layout): void {
    const best = this.loadBest()
    const edge = isTouch ? 40 : 52
    this.mkButton(L.cx - VIEW_W / 2 + edge, L.chromeY, 'CONTROLS', 0, 'controls', () => this.openControls())

    let x = L.cx + VIEW_W / 2 - edge
    if (best) {
      x = this.mkButton(x, L.chromeY, 'SHARE RESULT', 1, 'share-result', () => this.doShare(best)) - (isTouch ? 30 : 26)
    }
    this.mkButton(x, L.chromeY, 'SHARE', 1, 'share', () => this.doShare(null))

    // The number to beat. recordBest() has been writing this since the first
    // flight and nothing has ever read it back, so the screen has been offering
    // no reason to fly again.
    this.add
      .text(L.cx, L.chromeY, this.bestLine(best), this.small(12, best ? '#f3cf9c' : INK.dim, 5, best ? 400 : 300))
      .setOrigin(0.5)
      .setDepth(70)
      .setAlpha(0.94)

    this.toast = this.add
      .text(L.cx, L.chromeY - Math.round((isTouch ? 62 : 54) * this.boost), '', this.small(14, '#ffe6bf', 5))
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0)
  }

  /** What the player has to beat, in one line. */
  private bestLine(best: FlightResult | null): string {
    if (best) {
      const earned = [best.homeFeather ? 'HOME' : '', best.flockFeather ? 'FLOCK' : '', best.flowFeather ? 'FLOW' : '']
        .filter(Boolean)
        .join(' · ')
      const pts = Math.round(best.score ?? 0).toLocaleString('en-US')
      return `BEST  ${best.birdsArrived} HOME · ${pts} PTS${earned ? `  ·  ${earned}` : ''}`
    }
    const chain = loadBestChain()
    return chain > 0 ? `BEST RUN  ${chain} CLEAN` : 'NO FLIGHT ON RECORD'
  }

  /**
   * A label, its own outlined pill, and its own Zone — returning the label's
   * outer edge so the next one can be packed against it.
   *
   * The pill matters: bare tracked capitals in the corner of a picture read as
   * a caption, not as something you can press. The zone is the ONLY interactive
   * part, for the same reason BEGIN FLIGHT is a zone: a Text that ever
   * re-renders silently resizes its own hit area.
   */
  private mkButton(x: number, y: number, labelText: string, originX: number, name: string, run: () => void): number {
    const t = this.add
      .text(x, y, labelText, this.small(13, INK.soft, 5))
      .setOrigin(originX, 0.5)
      .setDepth(70)
      .setAlpha(0)
    const left = x - t.width * originX
    const padX = isTouch ? 22 : 24
    const w = t.width + padX * 2
    const h = Math.round((isTouch ? 64 : 50) * this.boost)
    const cxp = left + t.width / 2

    const pill = this.add.graphics().setDepth(69).setAlpha(0)
    const drawPill = (lit: boolean): void => {
      pill.clear()
      pill.fillStyle(0x0c0a1c, lit ? 0.9 : 0.62)
      pill.fillRoundedRect(cxp - w / 2, y - h * 0.36, w, h * 0.72, h * 0.36)
      pill.lineStyle(1, 0xf0cf9a, lit ? 0.7 : 0.3)
      pill.strokeRoundedRect(cxp - w / 2, y - h * 0.36, w, h * 0.72, h * 0.36)
    }
    drawPill(false)

    const zone = this.add
      .zone(cxp, y, w, h)
      .setName(name)
      .setOrigin(0.5)
      .setDepth(72)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => {
      t.setColor('#ffe6bf')
      drawPill(true)
    })
    zone.on('pointerout', () => {
      t.setColor(INK.soft)
      drawPill(false)
    })
    zone.on('pointerdown', () => run())
    this.tweens.add({ targets: [t, pill], alpha: 0.92, duration: 700, delay: 1000 })
    return originX === 1 ? left - padX : left + t.width + padX
  }

  private loadBest(): FlightResult | null {
    try {
      const raw = localStorage.getItem(BEST_KEY)
      return raw ? (JSON.parse(raw) as FlightResult) : null
    } catch {
      return null
    }
  }

  private showToast(msg: string): void {
    if (!this.toast) return
    this.toast.setText(msg).setAlpha(1)
    this.toastTween?.remove()
    this.toastTween = this.tweens.add({ targets: this.toast, alpha: 0, duration: 900, delay: 1900 })
  }

  /**
   * Share the game, or a flight that actually happened.
   *
   * The Web Share API is the only route into a phone's own share sheet and it
   * must be invoked inside the gesture, which is why this runs straight off
   * pointerdown. Where it does not exist the link goes to the clipboard
   * instead, and either way the player is TOLD what happened — a share button
   * with no visible answer is indistinguishable from a broken one.
   */
  private doShare(best: FlightResult | null): void {
    const url = `${location.origin}${location.pathname}`
    const text = best
      ? `I brought ${best.birdsArrived} birds home before nightfall in FLYWAY.`
      : 'FLYWAY — steer a murmuration home before nightfall.'
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>
    }
    if (typeof nav.share === 'function') {
      nav
        .share({ title: 'FLYWAY', text, url })
        .then(() => this.showToast('SHARED'))
        // a cancelled share sheet is not a failure, and must not fall through
        // to the clipboard — that would copy behind the player's back
        .catch(() => undefined)
      return
    }
    this.copyToClipboard(`${text} ${url}`)
  }

  private copyToClipboard(payload: string): void {
    const fallback = (): void => {
      // execCommand is deprecated but is the only path left on a page served
      // without a secure context, where navigator.clipboard is undefined
      try {
        const el = document.createElement('textarea')
        el.value = payload
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        const ok = document.execCommand('copy')
        el.remove()
        this.showToast(ok ? 'LINK COPIED' : 'COPY BLOCKED')
      } catch {
        this.showToast('COPY BLOCKED')
      }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(payload)
        .then(() => this.showToast('LINK COPIED'))
        .catch(fallback)
      return
    }
    fallback()
  }

  /**
   * The full control reference, one press away.
   *
   * Every line here is checked against src/flock.ts and src/scenes/DayScene.ts
   * rather than written from memory. SURGE in particular was described as "tap
   * to SURGE forward", which hid both halves of what it is: Flock.surge() snaps
   * the flock tight AND adds a real velocity impulse of 190 * strength along
   * the current heading, where strength = 1 - gatherStrain * 0.6. Holding is
   * not free — every verb strain touches comes out weaker — and that trade is
   * the interesting thing about these controls, so it is what the panel says.
   *
   * The rest were checked the same way and two more were wrong: ECHO is bound
   * to C *and* E and carries a six-second cooldown (DayScene.echoCall), and a
   * strained flock's call goes out at 0.55 strength; DIVE is a mouse hold or V.
   * BRACE was missing entirely.
   */
  private openControls(): void {
    if (this.panel) return
    const hold = isTouch ? ['GATHER', 'SPREAD'] : ['SPACE', 'SHIFT']
    const lines: Array<[string, string]> = [
      [
        'STEER',
        isTouch ? 'left thumb anywhere — the stick appears where you touch' : 'move the mouse — the flock follows your intention',
      ],
      [hold[0], 'hold to tighten · tap to SURGE: tight formation and a real shove along your heading'],
      [hold[1], 'hold to widen · tap to FLARE: wings out, momentum dies — the overshoot brake'],
      [
        isTouch ? 'CALL' : 'C or E',
        'ECHO — a cry rings outward and turns lost birds home; six seconds before your voice returns',
      ],
      [
        isTouch ? 'DIVE' : 'MOUSE or V',
        'hold to trade height for speed — earned only while still descending; release to slingshot',
      ],
      [isTouch ? 'BOTH PADS' : 'SPACE+SHIFT', 'BRACE — the world slows, and strain accrues twice as fast'],
    ]
    const safe = safeArea(this)
    const cx = safe.x + safe.w / 2
    const cy = safe.y + safe.h / 2
    // Row pitch follows the TYPE, not the viewport. Spacing rows by a fraction
    // of the safe height opened them to 100px apart on desktop, where the copy
    // is 19px tall, and the list stopped reading as a list.
    const step = Math.min(safe.h * 0.1, (isTouch ? 70 : 56) * this.boost)
    const blockTop = cy - ((lines.length - 1) * step) / 2
    const kids: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05040c, 0.97).setOrigin(0),
      this.add.text(cx, blockTop - step * 1.4, 'CONTROLS', this.small(20, '#f0cf9a', 10)).setOrigin(0.5),
    ]
    lines.forEach(([key, what], i) => {
      const y = blockTop + i * step
      kids.push(this.add.text(cx - 28, y, key, this.small(15, '#ffe6bf', 5)).setOrigin(1, 0.5))
      kids.push(this.add.text(cx + 28, y, what, this.smallVoice(18, '#ded2ea')).setOrigin(0, 0.5))
    })
    const blockBot = blockTop + (lines.length - 1) * step
    kids.push(
      this.add
        .text(cx, blockBot + step * 1.1, 'HOLD TOO LONG AND EVERY VERB COMES OUT WEAKER', this.small(12, '#c9b2a0', 5, 300))
        .setOrigin(0.5),
    )
    kids.push(
      this.add
        .text(
          cx,
          blockBot + step * 1.7,
          isTouch ? 'TAP TO CLOSE' : 'CLICK OR PRESS ESC TO CLOSE',
          this.small(12, INK.dim, 6, 300),
        )
        .setOrigin(0.5),
    )
    const panel = this.add.container(0, 0, kids).setDepth(300).setAlpha(0)
    this.panel = panel
    this.tweens.add({ targets: panel, alpha: 1, duration: 220 })

    // A zone across the whole panel, added last and above it, so the press that
    // closes the panel can never reach BEGIN FLIGHT underneath.
    const closer = this.add
      .zone(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H)
      .setName('panel-close')
      .setOrigin(0.5)
      .setDepth(310)
      .setInteractive({ useHandCursor: true })
    const close = (): void => {
      closer.destroy()
      panel.destroy()
      this.panel = undefined
    }
    closer.on('pointerdown', close)
    this.input.keyboard?.once('keydown-ESC', close)
  }

  /**
   * Portrait rotate card. A phone held upright shows the flyway as a keyhole,
   * so ask for the wide view before the player starts rather than after.
   * Touch devices only — a tall desktop window is a window, not a phone.
   */
  private buildRotateCard(): void {
    if (!isTouch) return
    const scrim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05040e, 0.97).setOrigin(0)
    const line = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 14, 'turn your phone to fly', voice(38, INK.warm))
      .setOrigin(0.5)
    const sub = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 46, 'THE FLOCK NEEDS THE WIDE SKY', display(16, INK.soft, 8, 300))
      .setOrigin(0.5)
    this.rotateCard = this.add.container(0, 0, [scrim, line, sub]).setDepth(400).setScrollFactor(0)
    this.tweens.add({ targets: line, alpha: 0.55, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this.syncRotateCard()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.syncRotateCard, this)
    this.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, this.syncRotateCard, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.syncRotateCard, this)
      this.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, this.syncRotateCard, this)
    })
  }

  private syncRotateCard(): void {
    this.rotateCard?.setVisible(window.innerHeight > window.innerWidth)
  }

  // ------------------------------------------------------------------ motion

  update(timeMs: number, _deltaMs: number): void {
    const t = timeMs / 1000
    this.audio.musicTick(Math.min(0.05, _deltaMs / 1000), 0.35, 0)
    this.audio.setJourney(0.2, 1, 0)

    for (const b of this.breathers) {
      b.img.setAlpha(b.base + Math.sin(t * 0.42 + b.ph) * b.amp)
    }
    this.stepMurmuration(t)
  }

  /**
   * The body breathes; it does not travel.
   *
   * One shared slow inhale scales every bird's reach across the ribbon, so the
   * mass widens and gathers as one thing, and each bird adds its own small
   * bounded churn on top. Everything here is arithmetic on preallocated fields:
   * no array, vector or string is created, because GC stutter is this project's
   * #1 measured defect, and there is no repeating tween anywhere on the screen.
   */
  private stepMurmuration(t: number): void {
    const breath = 1 + Math.sin(t * 0.23) * 0.11
    for (const b of this.birds) {
      const r = b.reach * breath
      b.img.x = b.hx + b.nx * r + Math.cos(t * b.wx + b.ph) * b.ax
      b.img.y = b.hy + b.ny * r + Math.sin(t * b.wy + b.ph * 1.7) * b.ay
      const frame = birdFrameKey(t, b.ph, b.flap)
      if (frame !== b.img.texture.key) b.img.setTexture(frame)
    }
  }
}
