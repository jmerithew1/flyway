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

/** The single idea this screen exists to land. The flight teaches the actions,
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
  /** left edge and width of the VISIBLE rect — never VIEW_W, and never
   * `cx - VIEW_W / 2`, which is off-screen the moment anything is cropped */
  safeX: number
  safeW: number
}

/**
 * The title screen is a POSTER, not a menu and not a demo loop.
 *
 * It is built in three horizontal values, because the measured reason this game
 * read as soft was that every frame lived in a 25-75% mid-tone band:
 *
 *   - a near-black CEILING across the top, which is the ground the wordmark and
 *     the one line of copy are set on;
 *   - a hot BAND across the middle — the painting's own low sun and the lit
 *     roost — with the murmuration hanging in it as pure silhouette and a bank
 *     of ruins going black on the left, the dark the flock is outrunning;
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

    // The row is as tall as its own boosted label needs, so nothing above it
    // can ever creep down into the share controls — and its BASELINE is pushed
    // up by that same height, because a pill centred 42px off the bottom edge
    // hangs off the screen the moment the boost makes it taller than 84.
    const rowH = Math.round((isTouch ? 64 : 50) * this.boost)
    const chromeY = bot - Math.max(isTouch ? 42 : 46, rowH / 2 + 8)
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

    // The three values. Both dark bands are SOLID past the type they carry —
    // measuring the rendered pixels is what caught that a ramp alone leaves the
    // copy sitting in its own falloff — and only then fade out.
    const ceilY = ideaY + Math.round(24 * this.boost)
    const floorY = Math.min(buttonY - plateH / 2 - h * 0.02, bot - h * 0.14)

    return {
      cx, top, bot, h,
      chromeY, chromeRowTop, hintY,
      safeX: safe.x, safeW: safe.w,
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
  private wash(edge: number, solidTo: number, tail: number, color: number, alpha: number, depth: number): void {
    // A SOLID CORE, then a soft tail — not one long ramp.
    //
    // The first pass drew a single `vfade` across each band and got two faults
    // at once. Because a ramp's darkness is front-loaded, the copy sitting near
    // the far end of the band was barely covered at all and measured 2.79:1 on
    // a phone; and because `vfade` ends its gradient exactly at its own edge,
    // the slope discontinuity there read as a hairline straight across the
    // picture, which looks like a rendering fault. A solid rectangle holds the
    // value where the type actually is, and the ramp only has to carry it out
    // to nothing — with a second, shorter ramp overlapping so the two kinks land
    // in different places and each is half as strong.
    const down = solidTo > edge
    const solidH = Math.abs(solidTo - edge)
    const ramps = this.textures.exists('vfade')
      ? ([
          [1, alpha * 0.66],
          [0.45, alpha * 0.45],
        ] as const)
      : []
    // THE JUNCTION MUST BE EXACT. Handing the rectangle its own alpha left it
    // darker than the ramps composite to where they meet, and a 0.14 alpha step
    // across the full width of a painting is not subtle — it drew a hard rule
    // across the picture at both band edges. The rectangle therefore takes the
    // value the ramps actually start at, computed rather than guessed.
    const junction = ramps.reduce((acc, [, a]) => 1 - (1 - acc) * (1 - a), 0)
    this.add
      .rectangle(VIEW_W / 2, edge, VIEW_W, solidH, color, ramps.length ? junction : alpha)
      .setOrigin(0.5, down ? 0 : 1)
      .setDepth(depth)
    for (const [hMul, a] of ramps) {
      const img = this.add
        .image(VIEW_W / 2, solidTo, 'vfade')
        .setOrigin(0.5, down ? 0 : 1)
        .setDisplaySize(VIEW_W, tail * hMul)
        .setTint(color)
        .setAlpha(a)
        .setDepth(depth)
      if (down) img.setFlipY(true)
    }
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

    // ONE source, and it is small. The first pass hung a full-height shaft here
    // as well; the roost covered where it landed and the near-black ceiling ate
    // its head, so all it contributed was a brown smear in the top corner. What
    // actually makes light read is a small hot core with a near-black shape in
    // front of it, which is what the flock arriving at the roost already is.
    if (this.textures.exists('softdot')) {
      const core = this.add
        .image(VIEW_W * 0.705, L.top + L.h * 0.55, 'softdot')
        .setTint(0xffdda0)
        .setDisplaySize(VIEW_W * 0.16, L.h * 0.26)
        .setAlpha(0.6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-22)
      this.breathers.push({ img: core, base: 0.6, amp: 0.06, ph: 1.9 })
    }

    // The destination, standing in its own light: the one piece on this screen
    // allowed to stay fully saturated, and the reason it is drawn ABOVE the
    // near-black ceiling is that the ceiling was eating the only genuinely hot
    // value in the frame — the lamps in its crown.
    this.piece('roost_lit', gx, L.floorY + L.h * 0.14, L.h * 0.56, { oy: 1, alpha: 1, depth: -12 })
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
    // NO painted flock decals. The first pass dropped `flock_decal_a/b` into the
    // open sky for depth and at the size the composition wanted them they read
    // as two dark smudges on the plate, not as distant birds.
    if (!this.textures.exists('bird-mid')) return
    const p0x = VIEW_W * 0.155, p0y = L.top + L.h * 0.66
    const p1x = VIEW_W * 0.36, p1y = L.top + L.h * 0.62
    const p2x = VIEW_W * 0.55, p2y = L.top + L.h * 0.47
    const p3x = VIEW_W * 0.735, p3y = L.top + L.h * 0.45

    // Density follows the CANVAS. The canvas width derives from the device
    // aspect, so a fixed count spreads the same body over a third more sky on a
    // wide phone and the mass stops cohering — which is precisely how a flock
    // turns back into a scatter of specks.
    const n = Math.min(260, Math.round((isTouch ? 132 : 178) * (VIEW_W / 1536)))
    for (let i = 0; i < n; i++) {
      // biased toward the tail, so the body has a mass and the head a point
      const s = Math.pow((i + Math.random()) / n, 1.15)
      const u = 1 - s
      const x = u * u * u * p0x + 3 * u * u * s * p1x + 3 * u * s * s * p2x + s * s * s * p3x
      const y = u * u * u * p0y + 3 * u * u * s * p1y + 3 * u * s * s * p2y + s * s * s * p3y
      const d0 = 3 * u * u, d1 = 6 * u * s, d2 = 3 * s * s
      const tx = d0 * (p1x - p0x) + d1 * (p2x - p1x) + d2 * (p3x - p2x)
      const ty = d0 * (p1y - p0y) + d1 * (p2y - p1y) + d2 * (p3y - p2y)
      const m = Math.hypot(tx, ty) || 1
      const nx = -ty / m
      const ny = tx / m

      // A TEARDROP, not a fan. Making the ribbon widest at s=0 spread the
      // rearmost birds over a 400px band where they were far too sparse to
      // cohere, and a sparse band of specks is exactly the "flies" read this
      // screen keeps being rejected for. Narrow at the tail, a mass a quarter of
      // the way along, and a point at the head is the shape a flock leaving a
      // roost actually makes.
      const thick = L.h * 0.15 * Math.sin(Math.PI * Math.pow(s, 0.55)) + L.h * 0.018
      // three uniforms summed: a soft core with stragglers, not an even band
      const off = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
      const reach = off * thick

      const scale = (0.155 - 0.055 * s) * (0.72 + Math.random() * 0.56)
      const img = this.add
        .image(x + nx * reach, y + ny * reach, 'bird-mid')
        .setDepth(-20)
        .setTint(0x0b0818)
        .setScale(scale)
        .setRotation(Math.atan2(ty, tx))
        // the tail sinks into the dark rather than stopping at an edge
        .setAlpha(0.6 + 0.4 * Math.min(1, s / 0.22))

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
    // The left edge of the plate is a pale painted arch that no wash reaches,
    // so it is closed with real art rather than left as a bright strip.
    this.piece('occluder_column_foliage_l', 0, L.bot, L.h * 0.86, {
      ox: 0,
      oy: 1,
      tint: BLACK,
      alpha: 0.98,
      depth: -15,
    })
    this.piece('storm_spire', VIEW_W * 0.135, L.bot, L.h * 0.8, { oy: 1, tint: BLACK, alpha: 1, depth: -16 })
    this.piece('bell_tower', VIEW_W * 0.255, L.bot, L.h * 0.58, { oy: 1, tint: 0x080619, alpha: 0.98, depth: -17 })
    // Further back reads LIGHTER, but only just: the first pass put these at 80
    // and 90 percent over a bright mist band and they came out as pale grey
    // cut-outs floating in the haze — stamps, not silhouettes.
    this.piece('colonnade_triple', VIEW_W * 0.355, L.floorY + L.h * 0.035, L.h * 0.19, {
      oy: 1,
      tint: 0x0b0820,
      alpha: 0.96,
      depth: -18,
    })
    this.piece('statue_robed', VIEW_W * 0.45, L.floorY + L.h * 0.025, L.h * 0.125, {
      oy: 1,
      tint: 0x0e0a26,
      alpha: 0.94,
      depth: -19,
    })

    // ONE lamp still burning inside the black. A near-black mass with a hot
    // point in it is the whole value argument in miniature, it is the only
    // fully-lit thing on the dark half of the frame, and it is literally the
    // light the game asks you to gather.
    const lamp = this.piece('lamp_small_lit', VIEW_W * 0.298, L.floorY + L.h * 0.015, L.h * 0.135, {
      oy: 1,
      depth: -14,
    })
    if (lamp && this.textures.exists('softdot')) {
      const halo = this.add
        .image(lamp.x, lamp.y - lamp.displayHeight * 0.72, 'softdot')
        .setTint(0xffcf8e)
        .setDisplaySize(L.h * 0.16, L.h * 0.16)
        .setAlpha(0.4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-13)
      this.breathers.push({ img: halo, base: 0.4, amp: 0.07, ph: 3.4 })
    }
  }

  /**
   * The near-black ceiling. This is the ground the wordmark and the one line of
   * copy are set on, which is why contrast up here does not depend on what the
   * painting happens to be doing behind them.
   */
  private buildCeiling(L: Layout): void {
    this.wash(L.top, L.ceilY, L.h * 0.3, 0x050409, 0.8, -30)
    this.piece('occluder_canopy_tl', 0, L.top, L.h * 0.3, { ox: 0, oy: 0, tint: BLACK, alpha: 0.98, depth: -26 })
    // The mirrored canopy, NOT occluder_wisteria_tr: that piece carries an
    // opaque rectangle in its own corner, and mirroring it dragged that block
    // into open sky as a hard-edged dark slab that read as a rendering fault.
    this.piece('occluder_canopy_tl', VIEW_W, L.top, L.h * 0.22, {
      ox: 0,
      oy: 0,
      tint: BLACK,
      alpha: 0.96,
      depth: -26,
      flipX: true,
    })
  }

  /**
   * The near-black floor. Every control on this screen stands on it, so their
   * contrast is a property of the composition rather than a stack of backing
   * plates chasing whatever colour the sky is.
   */
  private buildFloor(L: Layout): void {
    // Deep enough to actually BE black. The first pass ramped once and the
    // bottom third stayed a mid-tone lavender ruin field with the controls
    // sitting on top of it; the ramp reaches the floor now, and the solid pad
    // under it guarantees the last stretch rather than approaching it.
    this.wash(L.bot, L.floorY, L.h * 0.26, 0x030208, 0.94, -8)
    this.piece('occluder_cypress_br', VIEW_W, L.bot, L.h * 0.34, { ox: 1, oy: 1, tint: BLACK, alpha: 0.98, depth: -7 })
    // Stretched to the FULL canvas width, never sized by its own aspect: this
    // strip is 1672px wide, so on any canvas wider than that it stops short and
    // reads as a dark rectangle laid across the bottom of the picture — which
    // is exactly what it did on a 2954-wide phone canvas.
    if (this.textures.exists('fg_ground')) {
      this.add
        .image(VIEW_W / 2, L.bot, 'fg_ground')
        .setOrigin(0.5, 1)
        .setDisplaySize(VIEW_W, L.h * 0.16)
        .setTint(BLACK)
        .setAlpha(0.92)
        .setDepth(-6)
    }
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
      .rectangle(L.cx, L.ideaY + idea.height * 0.62, Math.min(idea.width * 0.86, VIEW_W * 0.42), 1, 0xf0cf9a, 0.34)
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
    // ANCHORED TO THE VISIBLE RECT, NOT TO VIEW_W.
    //
    // `cx - VIEW_W / 2` is the canvas's left edge, which is only the same thing
    // as the visible left edge while nothing is cropped. It also cannot be
    // clamped: whatever the type ramp and the per-device boost do to the label,
    // the pill has to end up inside the frame, because the owner asked for the
    // share control specifically so he could share from his PHONE — the exact
    // device where the boost is largest and an unclamped row goes off-screen.
    const edge = isTouch ? 34 : 46
    const leftLimit = L.safeX + edge
    const rightLimit = L.safeX + L.safeW - edge
    const budget = (rightLimit - leftLimit) * (best ? 0.34 : 0.4)

    const leftInner = this.mkButton(leftLimit, L.chromeY, 'CONTROLS', 0, 'controls', () => this.openControls(), budget)

    let x = rightLimit
    if (best) {
      x =
        this.mkButton(x, L.chromeY, 'SHARE RESULT', 1, 'share-result', () => this.doShare(best), budget) -
        (isTouch ? 26 : 22)
    }
    const rightInner = this.mkButton(x, L.chromeY, 'SHARE', 1, 'share', () => this.doShare(null), budget)

    // The number to beat. recordBest() has been writing this since the first
    // flight and nothing has ever read it back, so the screen has been offering
    // no reason to fly again. It takes whatever room the pills leave and never
    // one pixel more — a centred string that grows with the boost is the other
    // way this row eats itself on a phone.
    const gapL = leftInner + 18
    const gapR = rightInner - 18
    if (gapR - gapL > 90) {
      const t = this.add
        .text(
          (gapL + gapR) / 2,
          L.chromeY,
          this.bestLine(best, false),
          this.small(12, best ? '#f3cf9c' : INK.dim, 5, best ? 400 : 300),
        )
        .setOrigin(0.5)
        .setDepth(70)
        .setAlpha(0.94)
      // drop the feather list first, and only then shrink: losing a decoration
      // is better than losing legibility
      if (t.width > gapR - gapL) t.setText(this.bestLine(best, true))
      if (t.width > gapR - gapL) {
        const f = (gapR - gapL) / t.width
        t.setStyle(this.small(Math.max(8, Math.floor(12 * f)), best ? '#f3cf9c' : INK.dim, 3, best ? 400 : 300))
      }
      t.setVisible(t.width <= gapR - gapL)
    }

    this.toast = this.add
      .text(L.cx, L.chromeY - Math.round((isTouch ? 62 : 54) * this.boost), '', this.small(14, '#ffe6bf', 5))
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0)
  }

  /** What the player has to beat, in one line — `terse` drops the feathers. */
  private bestLine(best: FlightResult | null, terse: boolean): string {
    if (best) {
      const pts = Math.round(best.score ?? 0).toLocaleString('en-US')
      const head = `BEST  ${best.birdsArrived} HOME · ${pts} PTS`
      if (terse) return head
      // COUNTED, not listed. Spelling the feathers out put the word HOME on the
      // line twice — once as a count of birds and once as the name of a feather
      // — and the row read as gibberish.
      const earned = [best.homeFeather, best.flockFeather, best.flowFeather].filter(Boolean).length
      return earned ? `${head} · ${earned} FEATHER${earned === 1 ? '' : 'S'}` : head
    }
    const chain = loadBestChain()
    // Nothing at all until there IS a record. "NO FLIGHT ON RECORD" advertised
    // an absence — it read as a broken feature rather than an invitation, and
    // on a first visit it is the only line on the screen that says nothing.
    return chain > 0 ? `BEST RUN  ${chain} CLEAN` : ''
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
  private mkButton(
    x: number,
    y: number,
    labelText: string,
    originX: number,
    name: string,
    run: () => void,
    budget: number,
  ): number {
    const t = this.add
      .text(x, y, labelText, this.small(13, INK.soft, 5))
      .setOrigin(originX, 0.5)
      .setDepth(70)
      .setAlpha(0)
    const padX = isTouch ? 20 : 24
    // The label may not outgrow its share of the row. On a phone ui.ts's 1.65
    // ramp and this screen's own device boost multiply, and an unbudgeted
    // "SHARE RESULT" is wide enough to walk its pill off the side of the frame.
    if (t.width + padX * 2 > budget) {
      const f = (budget - padX * 2) / t.width
      t.setStyle(this.small(Math.max(9, Math.floor(13 * f)), INK.soft, 3))
      t.setOrigin(originX, 0.5)
    }
    const left = x - t.width * originX
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
   * not free — strain weakens every action it touches — and that trade is the
   * interesting thing about these controls, so it is what the panel says.
   *
   * The rest were checked the same way: ECHO is bound to C *and* E and carries
   * a six-second cooldown (DayScene.echoCall), and a strained flock's cry goes
   * out at 0.55 strength.
   *
   * DIVE and BRACE are both CUT and must not appear here. Dive's job was never
   * built — the deep light it existed to reach was never placed, so it traded
   * height for speed toward nothing. Brace was a world-slow on a two-key chord,
   * which is not something a flock can do and not something a thumb can press.
   * A controls panel listing an action the game does not have is worse than no
   * panel, because the player spends the flight looking for it.
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
        isTouch ? 'ECHO' : 'C or E',
        'ECHO — a cry rings outward and turns lost birds home; six seconds before your voice returns',
      ],
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
    // Centre the BLOCK, not the gutter. Hanging the keys off cx - 28 and the
    // descriptions off cx + 28 centres the gap between two columns of very
    // different widths, which pushes the whole list visibly right.
    const keyStyle = this.small(15, '#ffe6bf', 5)
    const whatStyle = this.smallVoice(18, '#ded2ea')
    const measure = (s: string, st: Phaser.Types.GameObjects.Text.TextStyle): number => {
      const p = this.add.text(0, -4000, s, st)
      const w = p.width
      p.destroy()
      return w
    }
    const gut = Math.round(52 * this.boost)
    const keyW = Math.max(...lines.map(([k]) => measure(k, keyStyle)))
    const whatW = Math.max(...lines.map(([, w]) => measure(w, whatStyle)))
    const blockLeft = Math.max(safe.x + 24, cx - (keyW + gut + whatW) / 2)
    lines.forEach(([key, what], i) => {
      const y = blockTop + i * step
      kids.push(this.add.text(blockLeft + keyW, y, key, keyStyle).setOrigin(1, 0.5))
      kids.push(this.add.text(blockLeft + keyW + gut, y, what, whatStyle).setOrigin(0, 0.5))
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
