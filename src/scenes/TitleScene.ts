import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from '../backdrop'
import { TAGLINE } from '../config'
import { birdFrameKey } from '../textures'
import { isTouch } from '../touch'
import { display, voice, INK, safeArea } from '../ui'
import { GameAudio } from '../audio'
import type { FlightResult } from '../result'

/** One bird of the demonstration murmuration. */
interface DemoBird {
  img: Phaser.GameObjects.Image
  /** stable per-bird phase; drives orbit angle, flap and shape lag */
  ph: number
  /** how far out in the flock body this bird sits, 0..1 */
  rad: number
  /** how strongly it answers a shape change — a flock does not turn as one */
  lag: number
}

/** A mote of light streaming past the flock, and whether it is still uncollected. */
interface DemoMote {
  img: Phaser.GameObjects.Image
  x: number
  y: number
  live: boolean
}

/** The flock verbs the demonstration performs, in the order it performs them. */
type DemoPhase = 'cruise' | 'gather' | 'surge' | 'spread'

const PHASE_ORDER: DemoPhase[] = ['cruise', 'gather', 'surge', 'cruise', 'spread']
const PHASE_SECONDS: Record<DemoPhase, number> = { cruise: 3.4, gather: 3.0, surge: 2.2, spread: 3.2 }
/** Only the verbs get named; naming "cruise" would turn the demo into a legend. */
const PHASE_CAPTION: Partial<Record<DemoPhase, string>> = {
  gather: 'GATHER',
  surge: 'SURGE',
  spread: 'SPREAD',
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
  hintY: number
  buttonY: number
  plateW: number
  plateH: number
  ideaY: number
  tagY: number
  wordY: number
  wordW: number
  wordH: number
  laneY: number
  laneRy: number
}

/**
 * The title screen is the game's best frame, not a menu.
 *
 * The whole identity is light: the dark presses in from the left, a lane of
 * gold motes streams past, and a live murmuration sweeps them up and pushes
 * the dark back. Everything a player needs before flying is shown happening
 * rather than listed — the full control reference lives one press away, where
 * it costs the hero frame nothing.
 */
export class TitleScene extends Phaser.Scene {
  private audio = new GameAudio()
  private rotateCard?: Phaser.GameObjects.Container
  private loaderCard?: Phaser.GameObjects.Container
  private loaderFill?: Phaser.GameObjects.Rectangle
  private loaderRailW = 300

  private birds: DemoBird[] = []
  private motes: DemoMote[] = []
  private fogPieces: { img: Phaser.GameObjects.Image; base: number; drift: number }[] = []
  private murkWash: Phaser.GameObjects.Image[] = []
  private daylight = 0.72
  private railFill?: Phaser.GameObjects.Rectangle
  private railW = 260
  private caption?: Phaser.GameObjects.Text
  private phaseIdx = 0
  private phaseT = 0
  /** 0 = tight ribbon, 1 = open bloom; eased so the flock never snaps */
  private spreadNow = 0.55
  private surgeNow = 0
  private flockX = 0
  private flockY = 0
  private laneY = 0
  private laneRy = 100
  private started = false
  private toast?: Phaser.GameObjects.Text
  private toastTween?: Phaser.Tweens.Tween
  private panel?: Phaser.GameObjects.Container

  constructor() {
    super('Title')
  }

  /**
   * The painted title plate, wordmark and roost ship in the asset kit but are
   * absent from the generated manifest, so this screen was falling back to the
   * procedural day plate and a letter-spaced text title. Pulling them in here
   * keeps the fix inside this scene instead of waiting on a manifest rebuild.
   */
  preload(): void {
    const extra: Array<[string, string]> = [
      ['title_bg', 'assets/processed/final/title_bg.webp'],
      ['wordmark', 'assets/processed/final/wordmark.webp'],
      ['roost_lit', 'assets/processed/roost/roost_lit.webp'],
      ['perched_a', 'assets/processed/final/perched_a.webp'],
      ['perched_sleep', 'assets/processed/final/perched_sleep.webp'],
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
   * The boot veil in index.html hands over to Phaser's flat #3f3760 clear
   * colour with nothing drawn on it, so the brand dissolves into a lighter,
   * emptier field before the title appears — the loudest reason the load reads
   * as broken. Painting this scene's own near-black plate during preload means
   * the canvas is never that empty grey, and the rail below reports REAL byte
   * progress rather than index.html's endless CSS sweep, which looks identical
   * at one percent and at a hang.
   */
  private buildLoaderCard(): void {
    const kids: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0a0716, 1).setOrigin(0),
    ]
    if (this.textures.exists('softdot')) {
      kids.push(
        this.add
          .image(VIEW_W / 2, VIEW_H * 0.46, 'softdot')
          .setTint(0x2a2148)
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
    this.motes = []
    this.fogPieces = []
    this.murkWash = []
    this.daylight = 0.72
    this.phaseIdx = 0
    this.phaseT = 0
    this.spreadNow = 0.55
    this.surgeNow = 0

    const L = this.measureLayout()
    this.laneY = L.laneY
    this.laneRy = L.laneRy
    this.flockX = VIEW_W * 0.4
    this.flockY = L.laneY

    this.buildSky()
    this.buildMurk(L)
    this.buildDestination(L)
    this.buildMotes()
    this.buildFlock()
    this.buildForeground(L)
    this.buildTypeGround(L)
    this.buildRail(L)
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
   * Two things make a fixed y-table wrong here. Scale.ENVELOP crops ~125
   * logical px off the top and bottom on a landscape phone, and the type ramp
   * in ui.ts scales every string by 1.65 on touch — so the same table that
   * breathes on desktop has the button, the hint and the chrome row sitting on
   * top of each other on a phone. Measuring the button first and stacking
   * upward from a known bottom is what keeps them apart at both sizes.
   */
  private measureLayout(): Layout {
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
    // the keyboard hint has no audience on touch, and on a cropped phone the
    // space it wants is the space the chrome row needs
    const hintY = isTouch ? chromeY : chromeY - 46
    const buttonY = (isTouch ? chromeY - 40 : hintY - 26) - plateH / 2
    const ideaY = buttonY - plateH / 2 - (isTouch ? 30 : 38)
    const tagY = ideaY - (isTouch ? 44 : 52)

    const wordW = Math.min(VIEW_W * 0.44, h * 0.72)
    let wordH = wordW * 0.315
    if (this.textures.exists('wordmark')) {
      const f = this.frameSize('wordmark')
      wordH = (f.h / f.w) * wordW
    }
    const wordY = top + h * 0.185 + wordH / 2 - h * 0.06

    // the flock owns the whole gap between the wordmark and the type block,
    // and is sized to fit it rather than being allowed to grow into the words
    const gapTop = wordY + wordH / 2 - h * 0.05
    const gapBot = tagY - (isTouch ? 26 : 34)
    const laneY = (gapTop + gapBot) / 2
    const laneRy = Math.max(52, Math.min(104, (gapBot - gapTop) / 2 - 44))

    return { cx, top, bot, h, chromeY, hintY, buttonY, plateW, plateH, ideaY, tagY, wordY, wordW, wordH, laneY, laneRy }
  }

  private beginStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return display(isTouch ? 28 : 34, '#fff3dc', 10, 400)
  }

  // ---------------------------------------------------------------- painting

  /** Native pixel size of a loaded texture, for art that is not in the manifest. */
  private frameSize(key: string): { w: number; h: number } {
    const f = this.textures.get(key).get()
    return { w: f.width, h: f.height }
  }

  private buildSky(): void {
    // title_bg already carries a near-black arch on the left and a hot sun on
    // the right, which is the value range the procedural bg_plate never had.
    const key = this.textures.exists('title_bg')
      ? 'title_bg'
      : this.textures.exists('sky_homeward')
        ? 'sky_homeward'
        : 'bg_plate'
    if (this.textures.exists(key)) {
      const { w, h } = this.frameSize(key)
      const cover = Math.max(VIEW_W / w, VIEW_H / h)
      this.add
        .image(VIEW_W / 2, VIEW_H / 2, key)
        .setDisplaySize(w * cover, h * cover)
        .setDepth(-100)
    }
    // one flat knock-down so the painted midtones sit below the type, not with it
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x120c26, 0.2).setOrigin(0).setDepth(-99)
  }

  /**
   * The dark, pressing in from the left. Every frame in this game needs a
   * near-black; the painting alone sits in a 25-75% band and reads soft, so
   * the murk is what makes the light on the right mean anything.
   */
  private buildMurk(L: Layout): void {
    if (this.textures.exists('softdot')) {
      const blobs: Array<[number, number, number, number]> = [
        [-160, VIEW_H / 2, 1400, 0.92],
        [30, L.top + L.h * 0.28, 900, 0.62],
        [110, L.top + L.h * 0.8, 1000, 0.55],
      ]
      for (const [x, y, size, a] of blobs) {
        this.murkWash.push(
          this.add
            .image(x, y, 'softdot')
            .setTint(0x05030d)
            .setDisplaySize(size, size * 1.15)
            .setAlpha(a)
            .setDepth(-70),
        )
      }
    }
    // the painted nightfall itself, so the dark has tendrils and not just a gradient
    const pieces = ['fog_wall_00', 'fog_wall_02', 'fog_edge_00'].filter((k) => this.textures.exists(k))
    pieces.forEach((key, i) => {
      const { w, h } = this.frameSize(key)
      const dh = L.h * (0.8 - i * 0.06)
      const img = this.add
        .image(0, L.top + L.h * (0.44 + i * 0.08), key)
        .setDisplaySize((w / h) * dh, dh)
        .setTint(0x241b3d)
        .setAlpha(0.58 - i * 0.1)
        .setDepth(-68 + i)
      this.fogPieces.push({ img, base: -110 + i * 80, drift: 0.55 + i * 0.35 })
    })
  }

  /** Where the flock is going: a lit roost on the right, and its glow. */
  private buildDestination(L: Layout): void {
    const gx = VIEW_W * 0.845
    if (this.textures.exists('softdot')) {
      // ADD, not OVERLAY — Phaser's WebGL renderer implements only
      // NORMAL/ADD/MULTIPLY/SCREEN, and OVERLAY silently renders wrong.
      this.add
        .image(gx, L.top + L.h * 0.6, 'softdot')
        .setTint(0xffbe72)
        .setDisplaySize(780, 640)
        .setAlpha(0.46)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-60)
    }
    if (this.textures.exists('roost_lit')) {
      const { w, h } = this.frameSize('roost_lit')
      const dh = L.h * 0.34
      this.add
        .image(gx, L.top + L.h * 0.79, 'roost_lit')
        .setOrigin(0.5, 1)
        .setDisplaySize((w / h) * dh, dh)
        .setAlpha(0.92)
        .setDepth(-58)
    }
  }

  /** The road: a lane of gold motes streaming right to left past the flock. */
  private buildMotes(): void {
    if (!this.textures.exists('mote')) return
    const n = isTouch ? 16 : 22
    for (let i = 0; i < n; i++) {
      const x = 200 + (i / n) * (VIEW_W + 900)
      const img = this.add
        .image(x, 0, 'mote')
        .setDisplaySize(30, 30)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-40)
      this.motes.push({ img, x, y: 0, live: true })
    }
  }

  private buildFlock(): void {
    if (!this.textures.exists('bird-mid')) return
    const n = isTouch ? 62 : 108
    for (let i = 0; i < n; i++) {
      const img = this.add
        .image(0, -400, 'bird-mid')
        .setScale(0.14 + Math.random() * 0.07)
        .setDepth(-30)
      this.birds.push({
        img,
        ph: Math.random() * Math.PI * 2,
        rad: Math.sqrt(Math.random()),
        lag: 0.35 + Math.random() * 0.65,
      })
    }
  }

  /** The near-black floor. Without it the bottom third floats and the type has
   * nothing to sit on. */
  private buildForeground(L: Layout): void {
    if (this.textures.exists('vfade')) {
      this.add
        .image(VIEW_W / 2, VIEW_H, 'vfade')
        .setOrigin(0.5, 1)
        .setDisplaySize(VIEW_W, 340)
        .setTint(0x06040e)
        .setAlpha(0.88)
        .setDepth(-22)
    }
    if (this.textures.exists('strip_near')) {
      const { w, h } = this.frameSize('strip_near')
      const dh = 116
      this.add
        .image(VIEW_W / 2, VIEW_H, 'strip_near')
        .setOrigin(0.5, 1)
        .setDisplaySize(Math.max(VIEW_W, (w / h) * dh), dh)
        .setTint(0x06040e)
        .setAlpha(0.95)
        .setDepth(-20)
    }
    // the flock at rest, in silhouette, standing ON the dark floor rather than
    // buried inside it
    const perch: Array<[string, number, number]> = [
      ['perched_a', VIEW_W * 0.075, 68],
      ['perched_sleep', VIEW_W * 0.132, 50],
    ]
    for (const [key, x, dh] of perch) {
      if (!this.textures.exists(key)) continue
      const { w, h } = this.frameSize(key)
      this.add
        .image(x, Math.min(L.bot - 4, VIEW_H - 74), key)
        .setOrigin(0.5, 1)
        .setDisplaySize((w / h) * dh, dh)
        .setTint(0x2b2244)
        .setAlpha(0.95)
        .setDepth(-19)
    }
  }

  /** Ground for the type. Sampling the painted plate behind the words gave
   * contrast ratios near 1.2:1 in the bright band; these are what buy the 3:1
   * floor no matter what the sky happens to be doing behind them. */
  private buildTypeGround(L: Layout): void {
    if (!this.textures.exists('softdot')) return
    const plates: Array<[number, number, number, number, number]> = [
      [L.cx, L.wordY, L.wordW * 1.9, L.wordH * 3.2, 0.5],
      [L.cx, (L.tagY + L.buttonY) / 2, 1180, L.h * 0.46, 0.62],
      [L.cx, L.chromeY, VIEW_W * 1.1, 300, 0.5],
    ]
    for (const [x, y, w, hh, a] of plates) {
      this.add.image(x, y, 'softdot').setTint(0x0a0716).setDisplaySize(w, hh).setAlpha(a).setDepth(-15)
    }
  }

  /**
   * The daylight rail. This is the marketing idea made literal: the gold you
   * are holding is the gap between the flock and the dark, so the rail sits on
   * the murk side of the frame and the fog answers it.
   */
  private buildRail(L: Layout): void {
    const x = L.cx - VIEW_W / 2 + 54
    const y = L.top + 42
    this.railW = isTouch ? 200 : 250
    this.add
      .text(x, y - 20, 'DAYLIGHT', display(11, '#e8caa0', 7, 400))
      .setOrigin(0, 0.5)
      .setDepth(31)
      .setAlpha(0.92)
    this.add.rectangle(x, y, this.railW, 4, 0x0a0716, 0.85).setOrigin(0, 0.5).setDepth(30)
    this.railFill = this.add
      .rectangle(x, y, this.railW * this.daylight, 4, 0xffd18a, 1)
      .setOrigin(0, 0.5)
      .setDepth(31)
  }

  private buildWords(L: Layout): void {
    // ---- the painted wordmark is the hero and the only large art
    let title: Phaser.GameObjects.GameObject
    if (this.textures.exists('wordmark')) {
      title = this.add
        .image(L.cx, L.wordY, 'wordmark')
        .setDisplaySize(L.wordW, L.wordH)
        .setAlpha(0)
        .setDepth(40)
    } else {
      title = this.add
        .text(L.cx, L.wordY, 'FLYWAY', display(76, '#fff4e6', 24, 300))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(40)
    }

    const tag = this.add
      .text(L.cx, L.tagY, TAGLINE, voice(25, '#f9ecdf'))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(40)

    // The ONE idea, short enough to land in a glance. Everything else about how
    // the flock flies is taught by the level, or lives behind CONTROLS.
    const idea = this.add
      .text(L.cx, L.ideaY, 'GATHER LIGHT · OUTRUN THE DARK', display(16, '#ffd9a2', 8, 400))
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(40)

    this.tweens.add({ targets: title, alpha: 1, duration: 1100 })
    this.tweens.add({ targets: tag, alpha: 0.97, duration: 900, delay: 460 })
    this.tweens.add({ targets: idea, alpha: 0.97, duration: 900, delay: 900 })
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
    plate.fillStyle(0x0b0718, 0.93)
    plate.fillRoundedRect(L.cx - L.plateW / 2, L.buttonY - L.plateH / 2, L.plateW, L.plateH, L.plateH / 2)
    plate.lineStyle(2, 0xf0cf9a, 0.9)
    plate.strokeRoundedRect(L.cx - L.plateW / 2, L.buttonY - L.plateH / 2, L.plateW, L.plateH, L.plateH / 2)

    // the hot value on the control itself, so the eye lands here first
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
        .text(L.cx, L.hintY, 'or press SPACE', display(13, '#ddd0e8', 5, 300))
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(52)
      this.tweens.add({ targets: hint, alpha: 0.9, duration: 760, delay: 1400 })
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

    // Pressing the sky must still fly, but a press anywhere at all must not —
    // the share and controls affordances live in the bottom band, outside this
    // zone and above it in depth, so neither can swallow the other.
    const skyBot = L.buttonY + L.plateH / 2 + (isTouch ? 14 : 18)
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

    this.tweens.add({ targets: [plate, label], alpha: 1, duration: 760, delay: 1200 })
    if (glow) {
      this.tweens.add({ targets: glow, alpha: 0.17, duration: 900, delay: 1200 })
      // the pulse rides the GLOW, never the label: scaling the text moved the
      // glyphs inside a plate that stayed put, which is half of "not aligning"
      this.tweens.add({
        targets: glow,
        scaleX: glow.scaleX * 1.1,
        scaleY: glow.scaleY * 1.14,
        duration: 1900,
        delay: 2200,
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
      this.add
        .text(L.cx, L.chromeY, line, display(12, '#e8caa0', 4, 400))
        .setOrigin(0.5)
        .setDepth(70)
        .setAlpha(0.9)
    }

    this.toast = this.add
      .text(L.cx, L.chromeY - (isTouch ? 56 : 64), '', display(14, '#ffe6bf', 5, 400))
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0)
  }

  /**
   * A label plus its own Zone, returning the label's outer edge so the next
   * one can be packed against it. The zone is the ONLY interactive part, for
   * the same reason BEGIN FLIGHT is a zone: a Text that ever re-renders
   * silently resizes its own hit area.
   */
  private mkButton(x: number, y: number, labelText: string, originX: number, name: string, run: () => void): number {
    const t = this.add
      .text(x, y, labelText, display(13, INK.soft, 5, 400))
      .setOrigin(originX, 0.5)
      .setDepth(70)
      .setAlpha(0)
    const left = x - t.width * originX
    const w = t.width + (isTouch ? 22 : 26) * 2
    const h = isTouch ? 60 : 48
    const zone = this.add
      .zone(left + t.width / 2, y, w, h)
      .setName(name)
      .setOrigin(0.5)
      .setDepth(72)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => t.setColor('#ffe6bf'))
    zone.on('pointerout', () => t.setColor(INK.soft))
    zone.on('pointerdown', () => run())
    this.tweens.add({ targets: t, alpha: 0.9, duration: 700, delay: 1700 })
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
   * The full control reference, one press away. It belongs here and not on the
   * hero frame: a static list of key names is what the title screen used to be,
   * and it taught nothing the first thirty seconds of flight does not.
   */
  private openControls(): void {
    if (this.panel) return
    const lines: Array<[string, string]> = isTouch
      ? [
          ['STEER', 'left thumb anywhere — the stick appears where you touch'],
          ['GATHER', 'hold to tighten the flock · tap to SURGE forward'],
          ['SPREAD', 'hold to widen the flock · tap to FLARE and brake'],
          ['CALL', 'brings scattered birds back to you'],
          ['DIVE', 'trades height for speed'],
        ]
      : [
          ['STEER', 'move the mouse — the flock follows your intention'],
          ['SPACE', 'hold to tighten the flock · tap to SURGE forward'],
          ['SHIFT', 'hold to widen the flock · tap to FLARE and brake'],
          ['C', 'calls scattered birds back to you'],
          ['MOUSE', 'hold the button to DIVE'],
        ]
    const safe = safeArea(this)
    const cx = safe.x + safe.w / 2
    const cy = safe.y + safe.h / 2
    const kids: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07050f, 0.94).setOrigin(0),
      this.add.text(cx, cy - safe.h * 0.34, 'CONTROLS', display(20, '#f0cf9a', 10, 400)).setOrigin(0.5),
    ]
    const step = safe.h * 0.105
    lines.forEach(([key, what], i) => {
      const y = cy - safe.h * 0.17 + i * step
      kids.push(this.add.text(cx - 28, y, key, display(15, '#ffe6bf', 5, 400)).setOrigin(1, 0.5))
      kids.push(this.add.text(cx + 28, y, what, voice(19, '#ded2ea')).setOrigin(0, 0.5))
    })
    kids.push(
      this.add
        .text(cx, cy + safe.h * 0.4, isTouch ? 'TAP TO CLOSE' : 'CLICK OR PRESS ESC TO CLOSE', display(13, INK.dim, 6, 300))
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
    const scrim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0a0716, 0.95).setOrigin(0)
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

    this.stepPhase(dt)
    this.stepFlock(t)
    this.stepMotes(dt)
    this.stepDaylight(dt)
  }

  /** Walk the demonstration through its verbs, naming only the ones it does. */
  private stepPhase(dt: number): void {
    this.phaseT += dt
    if (this.phaseT > PHASE_SECONDS[PHASE_ORDER[this.phaseIdx]]) {
      this.phaseT = 0
      this.phaseIdx = (this.phaseIdx + 1) % PHASE_ORDER.length
      const caption = PHASE_CAPTION[PHASE_ORDER[this.phaseIdx]]
      if (caption) this.showPhaseCaption(caption)
    }
    const now = PHASE_ORDER[this.phaseIdx]
    const wantSpread = now === 'gather' ? 0.06 : now === 'spread' ? 1 : now === 'surge' ? 0.2 : 0.55
    const wantSurge = now === 'surge' ? 1 : 0
    // ease, never snap: a murmuration changes shape over a second, not a frame
    this.spreadNow += (wantSpread - this.spreadNow) * Math.min(1, dt * 2.2)
    this.surgeNow += (wantSurge - this.surgeNow) * Math.min(1, dt * (wantSurge > this.surgeNow ? 4 : 1.6))
  }

  /** Name the verb beside the flock, as it happens — the difference between a
   * demonstration and the key legend this screen used to be. It sits out on the
   * dark side, where there is nothing for it to collide with. */
  private showPhaseCaption(word: string): void {
    if (!this.caption) {
      this.caption = this.add
        .text(0, 0, '', display(14, '#ffdca8', 9, 400))
        .setOrigin(1, 0.5)
        .setDepth(45)
        .setAlpha(0)
    }
    const cap = this.caption
    cap.setText(word).setPosition(Math.max(190, this.flockX - 330), this.flockY).setAlpha(0)
    this.tweens.add({ targets: cap, alpha: 0.95, duration: 320, yoyo: true, hold: 1200 })
  }

  private stepFlock(t: number): void {
    if (!this.birds.length) return
    // the flock holds station and the world streams past it, exactly the way
    // the flight reads, so the title frame and the game frame are the same shot
    this.flockX = VIEW_W * 0.4 + Math.sin(t * 0.21) * VIEW_W * 0.045 + this.surgeNow * 120
    this.flockY = this.laneY + Math.sin(t * 0.33) * 26 + Math.sin(t * 0.17 + 1.4) * 14

    const open = this.spreadNow
    // tight = a long thin ribbon, open = a round bloom: one number, both shapes
    const rx = 105 + open * 190
    const ry = this.laneRy * (0.22 + open * 0.78)
    for (const b of this.birds) {
      const shape = 1 - (1 - open) * b.lag * 0.55
      const a = b.ph * 6.283 + t * (0.42 + b.rad * 0.5)
      const r = b.rad * shape
      b.img.x = this.flockX + Math.cos(a) * rx * r + Math.sin(t * 0.8 + b.ph) * 12
      b.img.y = this.flockY + Math.sin(a) * ry * r + Math.cos(t * 0.9 + b.ph * 2) * 6
      // a surging flock leans forward; a spreading one levels off
      b.img.rotation = -0.16 * this.surgeNow + Math.sin(t * 0.6 + b.ph) * 0.07
      const frame = birdFrameKey(t, b.ph, 6 + this.surgeNow * 4)
      if (frame !== b.img.texture.key) b.img.setTexture(frame)
    }
  }

  private stepMotes(dt: number): void {
    if (!this.motes.length) return
    const speed = 168 + this.surgeNow * 90
    for (const m of this.motes) {
      m.x -= speed * dt
      m.y = this.laneY + Math.sin(m.x * 0.0032) * this.laneRy * 0.9 + Math.sin(m.x * 0.0011 + 2) * this.laneRy * 0.5
      if (m.x < -80) {
        m.x = VIEW_W + 120 + Math.random() * 420
        m.live = true
        m.img.setVisible(true).setAlpha(1).setDisplaySize(30, 30)
      }
      if (!m.live) continue
      m.img.setPosition(m.x, m.y)
      // the pulse is what makes gold read as FUEL rather than decoration
      m.img.setAlpha(0.72 + 0.28 * Math.sin(m.x * 0.02))
      const dx = m.x - this.flockX
      const dy = m.y - this.flockY
      const reach = 84 + this.spreadNow * 96
      if (dx * dx + dy * dy < reach * reach) {
        m.live = false
        this.daylight = Math.min(1, this.daylight + 0.055)
        this.tweens.add({
          targets: m.img,
          alpha: 0,
          displayWidth: 92,
          displayHeight: 92,
          duration: 340,
          onComplete: () => m.img.setVisible(false),
        })
      }
    }
  }

  /** The whole promise of the game in one loop: light gained pushes the dark
   * back, light lost lets it in. The demonstration never actually loses. */
  private stepDaylight(dt: number): void {
    this.daylight = Math.max(0.34, this.daylight - dt * 0.05)
    this.railFill?.setSize(Math.max(2, this.railW * this.daylight), 4)
    const push = (1 - this.daylight) * 300
    for (const f of this.fogPieces) {
      f.img.x = f.base + push * f.drift
      f.img.setAlpha(Phaser.Math.Clamp(0.3 + (1 - this.daylight) * 0.5, 0.22, 0.74))
    }
    for (const w of this.murkWash) {
      w.setAlpha(Phaser.Math.Clamp(0.48 + (1 - this.daylight) * 0.5, 0.4, 0.95))
    }
  }
}
