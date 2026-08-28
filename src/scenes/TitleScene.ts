import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { TAGLINE } from '../config'
import { birdFrameKey } from '../textures'
import { isTouch } from '../touch'
import { display, voice, INK, safeArea } from '../ui'
import { GameAudio } from '../audio'
import type { FlightResult } from '../result'

/**
 * One bird of the flight threading the frame.
 *
 * `s` is its position ALONG the composed path, not an orbit angle. An earlier
 * version drifted birds around an ellipse and read as a screensaver; a flock
 * has somewhere it is going, and every bird here is going there.
 */
interface PathBird {
  img: Phaser.GameObjects.Image
  /** 0..1 along the flight line */
  s: number
  /** per-bird speed, so the line never marches in step */
  sp: number
  /** signed offset across the line, in path-widths */
  off: number
  /** wander phase, and the flap phase */
  ph: number
  scale: number
}

/** The one flight the game currently ships. DayScene stamps this id onto its
 * result and result.ts derives its storage key from it, but exports no reader,
 * so the key is rebuilt here rather than left unread. */
const BEST_KEY = 'flyway-best-ancient-ruins'

/** Where every band of the screen sits, resolved against the VISIBLE rect. */
interface Layout {
  cx: number
  top: number
  bot: number
  h: number
  chromeY: number
  chromeRowTop: number
  hintY: number
  buttonY: number
  plateW: number
  plateH: number
  ideaY: number
  tagY: number
  wordY: number
  wordW: number
  wordH: number
}

/**
 * The title screen is one composed frame of the game, not a menu and not a
 * demo loop.
 *
 * It is built the way the poster would be: near-black painted foreground in the
 * corners and along the bottom-left, one genuinely hot light falling from the
 * right, and between them the flock — streaming out of the dark and into the
 * light along a single composed line. That picture IS the idea the screen has
 * to land, so the copy stays to one sentence and the control reference lives
 * behind a press, where it costs the frame nothing.
 */
export class TitleScene extends Phaser.Scene {
  private audio = new GameAudio()
  private rotateCard?: Phaser.GameObjects.Container
  private loaderCard?: Phaser.GameObjects.Container
  private loaderFill?: Phaser.GameObjects.Rectangle
  private loaderRailW = 300

  private birds: PathBird[] = []
  /** cubic control points of the flight line, in world space */
  private path: Array<{ x: number; y: number }> = []
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
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x08060f, 1).setOrigin(0),
    ]
    if (this.textures.exists('softdot')) {
      kids.push(
        this.add
          .image(VIEW_W / 2, VIEW_H * 0.46, 'softdot')
          .setTint(0x241d3e)
          .setDisplaySize(1100, 700)
          .setAlpha(0.5),
      )
    }
    const word = this.add.text(VIEW_W / 2, VIEW_H * 0.44, 'FLYWAY', display(60, '#e9dcf4', 22, 300)).setOrigin(0.5)
    const line = this.add.text(VIEW_W / 2, VIEW_H * 0.44 + 72, TAGLINE, voice(20, '#b9aacb')).setOrigin(0.5)
    const railY = VIEW_H * 0.44 + 128
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

    this.buildSky()
    this.buildDark(L)
    this.buildLight(L)
    this.buildFlightLine(L)
    this.buildNearBlackFrame(L)
    this.buildTypeGround(L)
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
    const padX = isTouch ? 74 : 92
    const padY = isTouch ? 30 : 38
    const plateW = Math.min(VIEW_W - 96, Math.round(ink.w + padX * 2))
    const plateH = Math.round(ink.h + padY * 2)

    const chromeY = bot - (isTouch ? 36 : 46)
    // the keyboard hint has no audience on touch, and the space it wants is
    // the space the chrome row needs
    const hintY = isTouch ? chromeY : chromeY - 46
    const buttonY = (isTouch ? chromeY - 56 : hintY - 26) - plateH / 2
    const ideaY = buttonY - plateH / 2 - (isTouch ? 30 : 38)
    const tagY = ideaY - (isTouch ? 44 : 52)

    const wordW = Math.min(VIEW_W * 0.44, h * 0.72)
    let wordH = wordW * 0.315
    if (this.textures.exists('wordmark')) {
      const f = this.frameSize('wordmark')
      wordH = (f.h / f.w) * wordW
    }
    const wordY = top + h * 0.16 + wordH / 2

    // the row is as tall as its own boosted label needs, so the sky zone above
    // it never creeps back over the share controls
    const chromeRowTop = chromeY - Math.round((isTouch ? 60 : 48) * this.boost) / 2

    return { cx, top, bot, h, chromeY, chromeRowTop, hintY, buttonY, plateW, plateH, ideaY, tagY, wordY, wordW, wordH }
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

  private buildSky(): void {
    const key = this.textures.exists('title_bg')
      ? 'title_bg'
      : this.textures.exists('sky_homeward')
        ? 'sky_homeward'
        : 'bg_plate'
    if (this.textures.exists(key)) {
      const { w, h } = this.frameSize(key)
      const cover = Math.max(VIEW_W / w, VIEW_H / h)
      this.add.image(VIEW_W / 2, VIEW_H / 2, key).setDisplaySize(w * cover, h * cover).setDepth(-100)
    }
    // one flat knock-down so the painted midtones sit below the type, not with it
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x120c26, 0.24).setOrigin(0).setDepth(-99)
  }

  /**
   * The dark the flock is outrunning, on the left.
   *
   * Deliberately NOT the nightfall fog. That system (src/nightfall.ts) is a
   * gameplay object driven by a live Flock and a scroll position, and the
   * hand-tinted fog cutouts this screen used instead read as smoke scribbled
   * over the painting. Depth of value carries the dark far better than smoke
   * does, and a monumental ruin sinking into it says the same thing without a
   * single wisp.
   */
  private buildDark(L: Layout): void {
    if (this.textures.exists('softdot')) {
      const blobs: Array<[number, number, number, number]> = [
        [-VIEW_W * 0.06, VIEW_H * 0.5, VIEW_W * 0.72, 0.95],
        [VIEW_W * 0.06, L.top + L.h * 0.86, VIEW_W * 0.5, 0.8],
      ]
      for (const [x, y, size, a] of blobs) {
        this.add
          .image(x, y, 'softdot')
          .setTint(0x04030b)
          .setDisplaySize(size, size * 1.4)
          .setAlpha(a)
          .setDepth(-80)
      }
    }
    // a broken belltower far back on the dark side, for scale and for a
    // silhouette the eye can measure the flock against
    this.piece('belltower_ruin', VIEW_W * 0.17, L.top + L.h * 0.7, L.h * 0.26, {
      oy: 1,
      tint: 0x16112a,
      alpha: 0.9,
      depth: -78,
    })
  }

  /**
   * The hot value, on the right: one shaft of late light falling to a lit
   * roost. Every frame in this game needs a near-black and one genuinely hot
   * value; the painting alone sits in a 25-75% mid-tone band and reads soft.
   */
  private buildLight(L: Layout): void {
    const gx = VIEW_W * 0.8
    // A shaft has EDGES. The first pass scaled this to 0.72 of the frame height
    // and let a wide warm blob sit under it, and the two together stopped being
    // a beam and became a pale wash over the whole right third — read as a lens
    // flare, and drowned the roost it was supposed to light.
    const shaft =
      this.piece('shaft_diag_05', VIEW_W * 0.845, L.top + L.h * 0.36, L.h * 0.46, {
        add: true,
        alpha: 0.55,
        depth: -62,
        flipX: true,
      }) ?? this.piece('shaft_fan_wide_06', gx, L.top + L.h * 0.36, L.h * 0.46, { add: true, alpha: 0.52, depth: -62 })
    if (shaft) this.breathers.push({ img: shaft, base: shaft.alpha, amp: 0.06, ph: 0 })

    if (this.textures.exists('softdot')) {
      this.add
        .image(gx, L.top + L.h * 0.64, 'softdot')
        .setTint(0xffbe72)
        .setDisplaySize(VIEW_W * 0.2, L.h * 0.36)
        .setAlpha(0.34)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-64)
    }

    // the destination, standing in its own light
    this.piece('roost_lit', gx, L.top + L.h * 0.86, L.h * 0.4, { oy: 1, alpha: 0.96, depth: -60 })
    // a hung lamp under the right-hand canopy: a second warm accent, and the
    // reason there is light on this side at all
    this.piece('lamp_tall_lit', VIEW_W * 0.945, L.top + L.h * 0.16, L.h * 0.17, { oy: 0, alpha: 0.95, depth: -59 })

    // Painted light, PLACED. A procedural train of identical dots drifting past
    // is what read as generic; these are composed along the beam the way a
    // painter would put them there, and they only breathe.
    const lights: Array<[string, number, number, number, number]> = [
      ['mote_streak_long', VIEW_W * 0.7, L.top + L.h * 0.34, L.h * 0.12, 0.95],
      ['mote_spiral_large', VIEW_W * 0.885, L.top + L.h * 0.46, L.h * 0.11, 0.9],
      ['mote_curl_01', VIEW_W * 0.775, L.top + L.h * 0.5, L.h * 0.06, 0.85],
      ['mote_curl_02', VIEW_W * 0.93, L.top + L.h * 0.3, L.h * 0.05, 0.75],
      ['mote_tiny_01', VIEW_W * 0.66, L.top + L.h * 0.44, L.h * 0.026, 0.8],
      ['mote_tiny_02', VIEW_W * 0.82, L.top + L.h * 0.26, L.h * 0.024, 0.75],
      ['mote_tiny_03', VIEW_W * 0.74, L.top + L.h * 0.6, L.h * 0.026, 0.7],
    ]
    for (const [key, x, y, h, a] of lights) {
      const img = this.piece(key, x, y, h, { add: true, alpha: a, depth: -58 })
      if (img) this.breathers.push({ img, base: a, amp: 0.16, ph: Math.random() * 6.283 })
    }
  }

  /**
   * The flock, threading from the dark into the light along ONE line.
   *
   * The previous version drifted birds around an ellipse. A flock orbiting in
   * place is exactly what generic motion looks like — it has nowhere to be. So
   * the birds here run along a composed cubic from the dark on the left up into
   * the shaft on the right, tight where the dark is and blooming as they reach
   * the light, fading in and out at the ends so the recycle never shows. The
   * frame would still read as a poster with this frozen; the motion only says
   * which way home is.
   */
  private buildFlightLine(L: Layout): void {
    // The line runs THROUGH the middle of the frame, not across its top. Sitting
    // it high left the whole mid band an empty mid-tone wash with nothing in it,
    // which is a third of the picture doing no work.
    this.path = [
      { x: -VIEW_W * 0.06, y: L.top + L.h * 0.62 },
      { x: VIEW_W * 0.26, y: L.top + L.h * 0.56 },
      { x: VIEW_W * 0.6, y: L.top + L.h * 0.36 },
      { x: VIEW_W * 1.02, y: L.top + L.h * 0.26 },
    ]
    // painted distant flocks, static, for depth the sprites cannot buy cheaply
    this.piece('flock_decal_a', VIEW_W * 0.5, L.top + L.h * 0.2, L.h * 0.05, {
      tint: 0x2a2244,
      alpha: 0.5,
      depth: -50,
    })
    this.piece('flock_swirl', VIEW_W * 0.33, L.top + L.h * 0.3, L.h * 0.1, {
      tint: 0x2a2244,
      alpha: 0.35,
      depth: -50,
    })

    if (!this.textures.exists('bird-mid')) return
    const n = isTouch ? 76 : 104
    for (let i = 0; i < n; i++) {
      this.birds.push({
        img: this.add.image(0, -600, 'bird-mid').setDepth(-46),
        s: i / n,
        sp: 0.026 + Math.random() * 0.016,
        // clustered toward the line, not spread evenly across it: a flock has a
        // dense core and stragglers, and an even band reads as a conveyor belt
        off: (Math.random() - 0.5) * (Math.random() + 0.35) * 1.6,
        ph: Math.random() * 6.283,
        scale: 0.1 + Math.random() * 0.075,
      })
    }
  }

  /** Cubic Bezier point and tangent for the flight line. */
  private onPath(s: number): { x: number; y: number; tx: number; ty: number } {
    const [p0, p1, p2, p3] = this.path
    const u = 1 - s
    const x = u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x
    const y = u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y
    const d0 = 3 * u * u
    const d1 = 6 * u * s
    const d2 = 3 * s * s
    const tx = d0 * (p1.x - p0.x) + d1 * (p2.x - p1.x) + d2 * (p3.x - p2.x)
    const ty = d0 * (p1.y - p0.y) + d1 * (p2.y - p1.y) + d2 * (p3.y - p2.y)
    return { x, y, tx, ty }
  }

  /**
   * The near-black. Painted occluders in the corners and a fallen colossus in
   * the lower left, so the darkest value in the frame is real art rather than a
   * gradient — and so the frame has a foreground at all.
   */
  private buildNearBlackFrame(L: Layout): void {
    const DARK = 0x100c20
    this.piece('occluder_canopy_tl', 0, L.top, L.h * 0.34, { ox: 0, oy: 0, tint: DARK, alpha: 0.97, depth: -12 })
    // The mirrored canopy, NOT occluder_wisteria_tr: that piece carries an
    // opaque rectangle in its own corner, and mirroring it dragged that block
    // into open sky as a hard-edged dark slab that read as a rendering fault.
    this.piece('occluder_canopy_tl', VIEW_W, L.top, L.h * 0.26, {
      ox: 0,
      oy: 0,
      tint: DARK,
      alpha: 0.95,
      depth: -12,
      flipX: true,
    })
    this.piece('occluder_cypress_br', VIEW_W, L.bot, L.h * 0.4, { ox: 1, oy: 1, tint: DARK, alpha: 0.97, depth: -11 })
    this.piece('occluder_column_foliage_l', 0, L.bot, L.h * 0.62, {
      ox: 0,
      oy: 1,
      tint: 0x151030,
      alpha: 0.95,
      depth: -11,
    })

    // The colossus is the frame's darkest mass and its foreground. It keeps a
    // faint rim rather than going flat black — a flat shape is a hole in a
    // painting, while a dark one the sun still catches is a foreground — but it
    // has to sit well below the mid-tone band or it stops being a silhouette
    // and becomes a pale wall across the corner, which is what it was.
    // Tint is a balance, not a floor: 0x39 read as a pale wall across the
    // corner, 0x1b erased the face into a formless lump. This keeps the head
    // legible as a monument while still sitting below every mid-tone in the
    // frame, which is the whole job of a foreground.
    this.piece('colossus_head', VIEW_W * 0.13, L.bot + L.h * 0.05, L.h * 0.4, {
      oy: 1,
      tint: 0x2b2450,
      alpha: 0.98,
      depth: -10,
    })

    if (this.textures.exists('vfade')) {
      this.add
        .image(VIEW_W / 2, VIEW_H, 'vfade')
        .setOrigin(0.5, 1)
        .setDisplaySize(VIEW_W, L.h * 0.3)
        .setTint(0x05040c)
        .setAlpha(0.82)
        .setDepth(-9)
    }
  }

  /** Ground for the wordmark. Sampling the painted plate behind the words gave
   * contrast ratios near 1.2:1 in the bright band; this is what buys the 3:1
   * floor no matter what the sky happens to be doing behind it. */
  private buildTypeGround(L: Layout): void {
    if (!this.textures.exists('softdot')) return
    this.add
      .image(L.cx, L.wordY, 'softdot')
      .setTint(0x08060f)
      .setDisplaySize(L.wordW * 2, L.wordH * 3.4)
      .setAlpha(0.42)
      .setDepth(-8)
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

    const tag = this.add.text(L.cx, L.tagY, TAGLINE, voice(25, '#f9ecdf')).setOrigin(0.5).setAlpha(0).setDepth(40)

    // The ONE idea, short enough to land in a glance. How the flock actually
    // flies is taught by the flight and by the ability bar in the HUD; a title
    // screen that tries to teach it is a manual, and that has been rejected.
    const idea = this.add
      .text(L.cx, L.ideaY, 'GATHER THE LIGHT · OUTRUN THE DARK', this.small(16, '#ffd9a2', 8))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(40)

    // Ground sized to the RUNS themselves. A single centred blob left the ends
    // of these lines out in the gradient's falloff, where the brightest pixel of
    // the mist band measured 1.8:1 behind the copy on a phone — the ends are
    // exactly where wide type goes missing.
    if (this.textures.exists('softdot')) {
      const blockW = Math.max(tag.width, idea.width) + 240
      const blockY = (L.tagY + L.ideaY) / 2
      const blockH = (L.ideaY - L.tagY) * 2 + 220
      for (const f of [-0.31, 0, 0.31]) {
        this.add
          .image(L.cx + f * blockW, blockY, 'softdot')
          .setTint(0x06040e)
          .setDisplaySize(blockW * 0.78, blockH)
          .setAlpha(0.74)
          .setDepth(30)
      }
    }

    this.tweens.add({ targets: title, alpha: 1, duration: 1000 })
    this.tweens.add({ targets: tag, alpha: 0.97, duration: 780, delay: 340 })
    this.tweens.add({ targets: idea, alpha: 0.97, duration: 780, delay: 620 })
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

    const plate = this.add.graphics().setAlpha(0).setDepth(50)
    plate.fillStyle(0x0a0716, 0.95)
    plate.fillRoundedRect(L.cx - L.plateW / 2, L.buttonY - L.plateH / 2, L.plateW, L.plateH, L.plateH / 2)
    plate.lineStyle(2, 0xf0cf9a, 0.9)
    plate.strokeRoundedRect(L.cx - L.plateW / 2, L.buttonY - L.plateH / 2, L.plateW, L.plateH, L.plateH / 2)

    let glow: Phaser.GameObjects.Image | undefined
    if (this.textures.exists('softdot')) {
      glow = this.add
        .image(L.cx, L.buttonY, 'softdot')
        .setTint(0xffc987)
        .setDisplaySize(L.plateW * 1.5, L.plateH * 3.2)
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
      this.tweens.add({ targets: hint, alpha: 0.9, duration: 700, delay: 1000 })
    }

    /**
     * A Zone, not the Text.
     *
     * Phaser's Text.updateText() rewrites input.hitArea.width/height on every
     * re-render unless input.customHitArea is true. The old button assigned a
     * plate-sized hit rectangle but left customHitArea false, so the first
     * hover — which recoloured the label and therefore re-rendered it —
     * collapsed the box back to glyph size while KEEPING the custom -75/-27
     * offset, leaving the pressable region sitting above and to the left of the
     * button it was drawn on. Hover reported the button; the press missed it,
     * and only a scene-wide click-anywhere listener hid that. A Zone never
     * re-renders, so the target cannot drift.
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
      glow?.setAlpha(on ? 0.36 : 0.17)
    }
    zone.on('pointerover', () => setLit(true))
    zone.on('pointerout', () => setLit(false))
    zone.on('pointerdown', () => this.beginFlight())

    // Pressing the sky must still fly, but a press anywhere at all must not.
    // The sky stops clear of the chrome row rather than merely sitting below it
    // in depth: relying on depth sorting alone left a few pixels where the two
    // targets genuinely overlapped, and that is the bug this screen is fixing.
    const skyBot = Math.min(L.buttonY + L.plateH / 2 + (isTouch ? 14 : 18), L.chromeRowTop - 8)
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

    this.tweens.add({ targets: [plate, label], alpha: 1, duration: 620, delay: 760 })
    if (glow) {
      this.tweens.add({ targets: glow, alpha: 0.17, duration: 760, delay: 760 })
      // the pulse rides the GLOW, never the label: scaling the text moved the
      // glyphs inside a plate that stayed put, which is half of "not aligning"
      this.tweens.add({
        targets: glow,
        scaleX: glow.scaleX * 1.1,
        scaleY: glow.scaleY * 1.14,
        duration: 1900,
        delay: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
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
   * All of it sits below the sky zone's reach and above it in depth, so none of
   * these can swallow — or be swallowed by — the BEGIN FLIGHT press. That exact
   * class of overlap is the bug this screen is also fixing.
   */
  private buildChrome(L: Layout): void {
    const best = this.loadBest()
    this.mkButton(L.cx - VIEW_W / 2 + 54, L.chromeY, 'CONTROLS', 0, 'controls', () => this.openControls())

    let x = L.cx + VIEW_W / 2 - 54
    if (best) {
      x = this.mkButton(x, L.chromeY, 'SHARE RESULT', 1, 'share-result', () => this.doShare(best)) - (isTouch ? 34 : 30)
    }
    this.mkButton(x, L.chromeY, 'SHARE', 1, 'share', () => this.doShare(null))

    if (best) {
      const earned = [best.homeFeather ? 'HOME' : '', best.flockFeather ? 'FLOCK' : '', best.flowFeather ? 'FLOW' : '']
        .filter(Boolean)
        .join('·')
      const line = `BEST — ${best.birdsArrived} HOME · ${Math.round(best.score ?? 0)} PTS${earned ? ` · ${earned}` : ''}`
      this.add.text(L.cx, L.chromeY, line, this.small(12, '#e8caa0', 4)).setOrigin(0.5).setDepth(70).setAlpha(0.9)
    }

    this.toast = this.add
      .text(L.cx, L.chromeY - (isTouch ? 56 : 64), '', this.small(14, '#ffe6bf', 5))
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0)
  }

  /**
   * A label plus its own Zone, returning the label's outer edge so the next one
   * can be packed against it. The zone is the ONLY interactive part, for the
   * same reason BEGIN FLIGHT is a zone: a Text that ever re-renders silently
   * resizes its own hit area.
   */
  private mkButton(x: number, y: number, labelText: string, originX: number, name: string, run: () => void): number {
    const t = this.add
      .text(x, y, labelText, this.small(13, INK.soft, 5))
      .setOrigin(originX, 0.5)
      .setDepth(70)
      .setAlpha(0)
    const left = x - t.width * originX
    const w = t.width + (isTouch ? 22 : 26) * 2
    const h = Math.round((isTouch ? 60 : 48) * this.boost)
    const zone = this.add
      .zone(left + t.width / 2, y, w, h)
      .setName(name)
      .setOrigin(0.5)
      .setDepth(72)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => t.setColor('#ffe6bf'))
    zone.on('pointerout', () => t.setColor(INK.soft))
    zone.on('pointerdown', () => run())
    this.tweens.add({ targets: t, alpha: 0.9, duration: 700, delay: 1100 })
    return originX === 1 ? left : left + t.width
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
    this.toastTween = this.tweens.add({ targets: this.toast, alpha: 0, duration: 900, delay: 1700 })
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
   * Every line here is checked against src/flock.ts rather than written from
   * memory. SURGE in particular was described as "tap to SURGE forward", which
   * hid both halves of what it is: Flock.surge() snaps the flock tight AND adds
   * a real velocity impulse of 190 * strength along the current heading, where
   * strength = 1 - gatherStrain * 0.6. Holding is not free — every verb strain
   * touches comes out weaker — and that trade is the interesting thing about
   * these controls, so it is what the panel says.
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
      [isTouch ? 'CALL' : 'C', 'a cry travels outward; every lost bird it reaches turns for home'],
      [
        isTouch ? 'DIVE' : 'MOUSE',
        'hold to trade height for speed — earned only while still descending; release to slingshot',
      ],
    ]
    const safe = safeArea(this)
    const cx = safe.x + safe.w / 2
    const cy = safe.y + safe.h / 2
    // Row pitch follows the TYPE, not the viewport. Spacing rows by a fraction
    // of the safe height opened them to 100px apart on desktop, where the copy
    // is 19px tall, and the list stopped reading as a list.
    const step = Math.min(safe.h * 0.105, (isTouch ? 76 : 60) * this.boost)
    const blockTop = cy - ((lines.length - 1) * step) / 2
    const kids: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x06050d, 0.96).setOrigin(0),
      this.add.text(cx, blockTop - step * 1.35, 'CONTROLS', this.small(20, '#f0cf9a', 10)).setOrigin(0.5),
    ]
    lines.forEach(([key, what], i) => {
      const y = blockTop + i * step
      kids.push(this.add.text(cx - 28, y, key, this.small(15, '#ffe6bf', 5)).setOrigin(1, 0.5))
      kids.push(this.add.text(cx + 28, y, what, this.smallVoice(18, '#ded2ea')).setOrigin(0, 0.5))
    })
    const blockBot = blockTop + (lines.length - 1) * step
    kids.push(
      this.add
        .text(cx, blockBot + step * 1.15, 'HOLD TOO LONG AND EVERY VERB COMES OUT WEAKER', this.small(12, '#c9b2a0', 5, 300))
        .setOrigin(0.5),
    )
    kids.push(
      this.add
        .text(
          cx,
          blockBot + step * 1.75,
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
    const scrim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x08060f, 0.96).setOrigin(0)
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

  update(timeMs: number, deltaMs: number): void {
    // a backgrounded tab returns one enormous delta; clamping keeps the flock
    // from teleporting across the frame on the first tick back
    const dt = Math.min(0.05, deltaMs / 1000)
    const t = timeMs / 1000
    this.audio.musicTick(dt, 0.35, 0)
    this.audio.setJourney(0.2, 1, 0)

    for (const b of this.breathers) {
      b.img.setAlpha(b.base + Math.sin(t * 0.5 + b.ph) * b.amp)
    }
    this.stepFlightLine(t, dt)
  }

  private stepFlightLine(t: number, dt: number): void {
    if (!this.birds.length || this.path.length !== 4) return
    for (const b of this.birds) {
      b.s += b.sp * dt
      if (b.s > 1) b.s -= 1
      const p = this.onPath(b.s)
      const m = Math.hypot(p.tx, p.ty) || 1
      // across the line, not around a centre
      const nx = -p.ty / m
      const ny = p.tx / m
      // tight in the dark, blooming as it reaches the light: the whole game in
      // one number, and the reason the line is worth animating at all
      const bloom = 26 + b.s * b.s * 150
      b.img.x = p.x + nx * b.off * bloom + Math.cos(t * 0.5 + b.ph) * 7
      b.img.y = p.y + ny * b.off * bloom + Math.sin(t * 0.7 + b.ph) * 9
      b.img.rotation = Math.atan2(p.ty, p.tx) + Math.sin(t * 0.6 + b.ph) * 0.06
      // the far end of the line is further away, so it is smaller
      b.img.setScale(b.scale * (1 - b.s * 0.34))
      // fade in and out at the ends so the recycle is never a pop
      const edge = Math.min(b.s, 1 - b.s)
      b.img.setAlpha(Phaser.Math.Clamp(edge / 0.09, 0, 1) * 0.95)
      const frame = birdFrameKey(t, b.ph, 6)
      if (frame !== b.img.texture.key) b.img.setTexture(frame)
    }
  }
}
