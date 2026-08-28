/**
 * The ability bar — the price tag on every verb.
 *
 * THE DEFECT THIS EXISTS TO FIX. The player was being charged costs they could
 * not see. Echo carries a six-second cooldown that was invisible, so calling
 * into a dead cooldown read as a broken button rather than as a spent voice.
 * Gather and Spread each run a hidden strain clock (`Flock.gatherStrain` /
 * `spreadStrain`) that is the whole reason a formation cannot simply be held
 * forever — and it was shown NOWHERE, so the economy the game is built on was
 * legible only to whoever wrote it. Surge and Flare surcharge those same two
 * clocks, silently. Every one of those costs now has a face on it.
 *
 * THE HIGHLIGHT IS THE POINT. The bar does not merely report; it answers. When
 * something is threatening the flock, the verb that beats it lights up —
 * SPREAD/FLARE while moths cling, GATHER when the hawk commits, ECHO when the
 * dark has a bird — and during a conflicting-demand moment TWO light at once
 * and the player has to choose. That teaches the counter wordlessly, every
 * time, forever, which is why the bar is always on rather than tucked behind a
 * menu.
 *
 * ONE SYSTEM, TWO PRESENTATIONS. On touch the pads in `touch.ts` already ARE
 * these icons, so the arcs are drawn ONTO those pads (their geometry comes from
 * the same exported `touchLayout()` the controls use) instead of a second,
 * competing control layer appearing in the corner. Nothing in this file listens
 * for input on either platform: desktop steers from the keyboard, touch from
 * the pads, and both are driven from one set of numbers the scene pushes in.
 *
 * PERFORMANCE. This project's #1 measured defect was GC stutter from per-frame
 * garbage, so `update()` allocates nothing: every array, text and sprite is
 * built once, one Graphics is cleared and redrawn in place, and the only
 * allocating call in the file (`safeArea`/`touchLayout`) runs in `layout()`.
 * There are no repeating tweens either — the pulse is procedural, so it cannot
 * drift out of phase with the state it is describing or survive a destroy.
 */

import Phaser from 'phaser'
import { INK, display, safeArea } from './ui'
import { isTouch, touchLayout } from './touch'

export type Verb = 'gather' | 'spread' | 'surge' | 'flare' | 'echo' | 'dive'

/** Reading order of the row. GATHER/SPREAD first because they are held, and
 * their taps are the next two — the bar mirrors the grammar of the hands. */
const INDEX: Record<Verb, number> = { gather: 0, spread: 1, surge: 2, flare: 3, echo: 4, dive: 5 }
const LABELS = ['GATHER', 'SPREAD', 'SURGE', 'FLARE', 'ECHO', 'DIVE']
const N = 6

/**
 * Which touch pad each verb lives on. SURGE is a tap on the GATHER pad and
 * FLARE a tap on the SPREAD pad (touch.ts's own grammar), so on a phone those
 * verbs have no separate control to decorate — they fold onto the pad the thumb
 * actually presses. Drawing them their own icon there would invent a control
 * that does not exist.
 */
const TOUCH_PAD = ['GATHER', 'SPREAD', 'GATHER', 'SPREAD', 'CALL', 'DIVE']

/**
 * The bar paints in the same ink as every other glyph, so the palette is READ
 * from INK rather than transcribed — a transcription is a copy that goes stale
 * the first time the palette is retuned. Parsed once at module load, because
 * Graphics wants packed numbers and parsing '#rrggbb' per frame is exactly the
 * garbage this file refuses to make.
 */
const packed = (css: string): number => parseInt(css.slice(1), 16)
const C_WARM = packed(INK.warm)
const C_ALERT = packed(INK.alert)
const C_BRIGHT = packed(INK.bright)
const C_DIM = packed(INK.dim)
const C_INK = 0x241a2e // the dark contact line ui.ts strokes every glyph with
const C_PLATE = 0x140e22
const LABEL_REST = INK.soft
const LABEL_LIT = '#ffe6c4'

/** Linear channel mix, returned as a packed int — no colour object per frame. */
function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255
  const r = (ar + (((b >> 16) & 255) - ar) * t) | 0
  const g = (ag + (((b >> 8) & 255) - ag) * t) | 0
  const bl = (ab + ((b & 255) - ab) * t) | 0
  return (r << 16) | (g << 8) | bl
}

export class AbilityBar {
  // ---- state the scene pushes in, one slot per verb
  private readonly strain = new Float32Array(N)
  private readonly cool = new Float32Array(N)
  private readonly avail = new Float32Array(N)
  private readonly sug = new Float32Array(N)
  // ---- eased mirrors of the above; nothing in this HUD is allowed to snap,
  // for the same reason the flock dial eases: a snap reads as a glitch
  private readonly arcT = new Float32Array(N) // remaining capacity, 1 = full
  private readonly sugT = new Float32Array(N)
  private readonly availT = new Float32Array(N)
  // ---- per-frame fold, so two verbs sharing one touch pad draw as one gauge
  private readonly fArc = new Float32Array(N)
  private readonly fSug = new Float32Array(N)
  private readonly fAvail = new Float32Array(N)
  private readonly fCool = new Float32Array(N)
  /** Slot that owns the drawing for slot i (itself, unless folded onto a pad). */
  private readonly owner = new Int8Array(N)

  // ---- resolved geometry
  private readonly px = new Float32Array(N)
  private readonly py = new Float32Array(N)
  private readonly pr = new Float32Array(N)
  private plateX = 0
  private plateY = 0
  private plateW = 0
  private plateH = 0
  private uiK = 1

  private readonly g: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[] = []
  private readonly glows: Phaser.GameObjects.Image[] = []
  /** Text.setColor re-renders the glyph canvas, so it is driven off a latch
   * rather than per frame — the same reason drawHud latches its count colour. */
  private readonly labelLit = new Uint8Array(N)

  private clock = 0
  private alpha = 1
  private wasBlank = false

  constructor(
    private readonly scene: Phaser.Scene,
    depth = isTouch ? 26.6 : 20.4,
  ) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth)
    for (let i = 0; i < N; i++) {
      this.avail[i] = 1
      this.availT[i] = 1
      this.arcT[i] = 1
      this.owner[i] = i
    }
    // The answer-glow is additive light, not a painted ring: Phaser's WebGL
    // renderer implements only NORMAL/ADD/MULTIPLY/SCREEN, and ADD is the one
    // that reads as "this is glowing" over both a bright dusk sky and the dark.
    if (scene.textures.exists('softdot')) {
      for (let i = 0; i < N; i++) {
        this.glows.push(
          scene.add
            .image(0, 0, 'softdot')
            .setTint(0xffd9a0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0)
            .setScrollFactor(0)
            .setDepth(depth - 0.1),
        )
      }
    }
    if (!isTouch) {
      for (let i = 0; i < N; i++) {
        const t = scene.add
          .text(0, 0, LABELS[i], display(11, LABEL_REST, 3, 400))
          .setOrigin(0.5, 0)
          .setScrollFactor(0)
          .setDepth(depth + 0.1)
        t.setStroke('#241a2e', 2)
        t.setShadow(0, 1, '#241a2e', 3, true, false)
        this.labels.push(t)
      }
    }
    this.layout()
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy())
  }

  // ------------------------------------------------------------------- API

  /** 0 fresh, 1 exhausted. Feed `Flock.gatherStrain` / `spreadStrain`. */
  setStrain(verb: Verb, t01: number): void {
    this.strain[INDEX[verb]] = t01 < 0 ? 0 : t01 > 1 ? 1 : t01
  }

  /** 1 just fired, 0 ready. Feed `callCooldown / 6`. */
  setCooldown(verb: Verb, t01: number): void {
    this.cool[INDEX[verb]] = t01 < 0 ? 0 : t01 > 1 ? 1 : t01
  }

  /** Hard availability — a verb the game will refuse right now. A live
   * cooldown already counts as unavailable without the scene saying so twice,
   * because "the button did nothing" was the reported defect and one call site
   * is one fewer place to forget. */
  setAvailable(verb: Verb, on: boolean): void {
    this.avail[INDEX[verb]] = on ? 1 : 0
  }

  /** "This verb is the answer right now." The teaching signal: raise it while
   * the threat is live, drop it when the threat resolves. Two at once is a
   * legitimate state — the conflicting-demand moment where the player chooses. */
  suggest(verb: Verb, on: boolean): void {
    this.sug[INDEX[verb]] = on ? 1 : 0
  }

  /** Master fade — the scene's HUD already has one, and this rides it. */
  setAlpha(a: number): void {
    this.alpha = a < 0 ? 0 : a > 1 ? 1 : a
  }

  /**
   * Re-resolve geometry. Called once by the constructor; call again only if the
   * visible frame changes, since it is the one allocating function here.
   */
  layout(): void {
    const safe = safeArea(this.scene)
    if (isTouch) {
      // The pads ARE the icons. Their positions come from touch.ts's own
      // exported layout so the gauge can never drift off the control it
      // describes — one source of truth, the same rule the audit probe uses.
      const pads = touchLayout(safe)
      for (let i = 0; i < N; i++) {
        this.owner[i] = i
        let px = 0
        let py = 0
        let r = 40
        for (let j = 0; j < pads.length; j++) {
          if (pads[j].name !== TOUCH_PAD[i]) continue
          px = pads[j].x
          py = pads[j].y
          r = pads[j].r
          break
        }
        this.px[i] = px
        this.py[i] = py
        // OUTSIDE the pad's bright body, not across it. The pads are painted
        // near-white at up to 0.72 alpha, and a warm hairline drawn over that
        // measured almost no contrast — the gauge was invisible on exactly the
        // control it describes. Sitting it past the rim puts it on sky.
        // 10px, not more: the GATHER/SPREAD pads carry a "tap · SURGE" caption
        // 20px below them, and a wider ring printed across it
        this.pr[i] = r * 0.92 + 10
      }
      // fold the tap verbs onto the pad the thumb actually presses
      this.owner[INDEX.surge] = INDEX.gather
      this.owner[INDEX.flare] = INDEX.spread
    } else {
      this.uiK = this.measureK()
      const k = this.uiK
      const r = 20 * k
      // the gap has to clear the WIDEST label, not just the icons: at an 18px
      // gap "GATHER" and "SPREAD" ran into each other and read as one word
      const gap = 32 * k
      const step = r * 2 + gap
      const total = step * N - gap
      const pad = 12 * k
      // measure AFTER resizing, or the plate is sized around the old metrics
      // and clips the descenders of the row it is supposed to be backing
      for (let i = 0; i < this.labels.length; i++) this.labels[i].setFontSize(Math.round(10 * k))
      const labelH = this.labels.length > 0 ? this.labels[0].height : 14 * k
      // low on the screen, centred, clear of the bottom edge on a phone-shaped
      // desktop window as well as a 16:10 one
      const bottom = safe.y + safe.h - 20 * k
      const cy = bottom - pad - labelH - 4 * k - r
      const x0 = safe.x + safe.w / 2 - total / 2 + r
      for (let i = 0; i < N; i++) {
        this.owner[i] = i
        this.px[i] = x0 + step * i
        this.py[i] = cy
        this.pr[i] = r
      }
      this.plateX = x0 - r - pad
      this.plateY = cy - r - pad * 0.8
      this.plateW = total + pad * 2
      this.plateH = r * 2 + pad * 1.7 + labelH + 5 * k
      for (let i = 0; i < N; i++) {
        const t = this.labels[i]
        if (!t) continue
        t.setPosition(this.px[i], cy + r + 5 * k)
      }
    }
    const glowR = isTouch ? 3.1 : 3.4
    for (let i = 0; i < this.glows.length; i++) {
      this.glows[i].setPosition(this.px[i], this.py[i]).setDisplaySize(this.pr[i] * glowR, this.pr[i] * glowR)
    }
  }

  /**
   * A short viewport scales the fixed 960-tall canvas down hard — at 844x390
   * one logical px is ~0.41 device px, which turned a 20px icon into 8px of
   * glass. Measuring the real canvas rect and inflating against it keeps the
   * bar the same PHYSICAL size on a laptop and on a short window, which is the
   * defect ui.ts's UI_SCALE fixes for text and this fixes for the vectors.
   */
  private measureK(): number {
    const c = this.scene.game.canvas
    if (!c) return 1
    const rect = c.getBoundingClientRect()
    const k = rect.height / (this.scene.scale.height || 960)
    if (!(k > 0)) return 1
    return Phaser.Math.Clamp(1 / k, 1, 2.2)
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    this.clock += dt
    const ease = 1 - Math.exp(-dt * 9)
    const fast = 1 - Math.exp(-dt * 13)
    for (let i = 0; i < N; i++) {
      const spent = this.strain[i] > this.cool[i] ? this.strain[i] : this.cool[i]
      this.arcT[i] += (1 - spent - this.arcT[i]) * ease
      this.sugT[i] += (this.sug[i] - this.sugT[i]) * fast
      // a live cooldown is unavailability, whatever the scene last declared
      const live = this.avail[i] > 0.5 && this.cool[i] <= 0.001 ? 1 : 0
      this.availT[i] += (live - this.availT[i]) * ease
    }
    // fold shared pads: the gauge on a pad must report the WORST of the verbs
    // it stands for, or a thumb would see a healthy ring on a spent control
    for (let i = 0; i < N; i++) {
      this.fArc[i] = 1
      this.fSug[i] = 0
      this.fAvail[i] = 0
      this.fCool[i] = 0
    }
    for (let i = 0; i < N; i++) {
      const o = this.owner[i]
      if (this.arcT[i] < this.fArc[o]) this.fArc[o] = this.arcT[i]
      if (this.sugT[i] > this.fSug[o]) this.fSug[o] = this.sugT[i]
      if (this.availT[i] > this.fAvail[o]) this.fAvail[o] = this.availT[i]
      if (this.cool[i] > this.fCool[o]) this.fCool[o] = this.cool[i]
    }
    this.draw()
  }

  private draw(): void {
    const g = this.g
    const a = this.alpha
    if (a <= 0.01) {
      // clear ONCE and then leave the buffer alone: a hidden HUD should cost
      // nothing per frame, which is the whole reason drawHud early-outs too
      if (!this.wasBlank) {
        g.clear()
        for (let i = 0; i < this.glows.length; i++) this.glows[i].setAlpha(0)
        for (let i = 0; i < this.labels.length; i++) this.labels[i].setAlpha(0)
        this.wasBlank = true
      }
      return
    }
    this.wasBlank = false
    g.clear()
    g.setAlpha(a)

    // a breath quicker than the flock dial's dread pulse (3.1 rad/s): this one
    // is a call to act, not a warning to fear
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4.4)

    if (!isTouch) {
      // The owner has repeatedly reported UI as hard to read. Small glyphs over
      // a bright dusk sky measured near 1.1:1; a dark plate under them is cheap,
      // never fails, and costs one fill.
      g.fillStyle(C_PLATE, 0.56)
      g.fillRoundedRect(this.plateX, this.plateY, this.plateW, this.plateH, 14 * this.uiK)
      g.lineStyle(1.5, 0xd6cae2, 0.14)
      g.strokeRoundedRect(this.plateX, this.plateY, this.plateW, this.plateH, 14 * this.uiK)
    }

    for (let i = 0; i < N; i++) {
      if (this.owner[i] !== i) continue // folded onto another pad; drawn there
      this.drawIcon(i, pulse, a)
    }
    // labels never fold, so a folded verb still names itself under its own icon
    for (let i = 0; i < this.labels.length; i++) {
      const o = this.owner[i]
      const lit = this.fSug[o]
      const av = 0.36 + 0.64 * this.fAvail[o]
      this.labels[i].setAlpha((0.62 * av + lit * (0.25 + pulse * 0.13)) * a)
      const want = lit > 0.5 ? 1 : 0
      if (this.labelLit[i] !== want) {
        this.labelLit[i] = want
        this.labels[i].setColor(want ? LABEL_LIT : LABEL_REST)
      }
    }
  }

  private drawIcon(i: number, pulse: number, a: number): void {
    const g = this.g
    const cx = this.px[i]
    const cy = this.py[i]
    const r = this.pr[i]
    const remain = this.fArc[i]
    const av = this.fAvail[i]
    const lit = this.fSug[i]
    // dim is not decoration: a dead cooldown has to LOOK dead, or the player
    // reads an unresponsive button as a broken one
    const life = 0.34 + 0.66 * av
    // ...but the GAUGE is exempt from the dim. Dimming it too made Echo's
    // countdown fade out at exactly the moment the player wants to read it —
    // "is it nearly back?" is the only question a dead button raises, and the
    // filling ring is the answer. Cooling keeps it bright; merely unavailable
    // does not, because a full ring on a disabled verb would be a lie.
    const gauge = Math.max(life, this.fCool[i])
    // Every stroke scales with the icon. A fixed 3px hairline is right at a
    // 20px desktop icon and a thread at an 86px thumb pad — the touch gauge
    // read as smudge until the weight followed the radius.
    const sw = Phaser.Math.Clamp(r / 20, 1, 2.8)

    // ---- the seat. On touch the pad already is one; here it separates the
    // icon from whatever the sky is doing behind it.
    if (!isTouch) {
      g.fillStyle(C_PLATE, 0.5)
      g.fillCircle(cx, cy, r * 1.02)
    }

    // ---- engraved track: a dark contact line under a pale one, cut into the
    // sky rather than painted on it — the same treatment as the flock dial
    g.lineStyle(3.5 * sw, C_INK, 0.45 * life)
    g.strokeCircle(cx, cy + 1 * sw, r)
    g.lineStyle(1.6 * sw, C_DIM, 0.26 * life)
    g.strokeCircle(cx, cy, r)

    // ---- the depleting arc. It shows what is LEFT, so watching it drain is
    // watching the cost being paid: strain on the hold verbs, cooldown on Echo.
    const A0 = -Math.PI / 2
    if (remain > 0.002) {
      const spent = 1 - remain
      // it goes coral as it runs out, so "nearly gone" is legible without a
      // number and without reading the arc's length precisely
      const col = spent > 0.55 ? mixHex(C_WARM, C_ALERT, Math.min(1, (spent - 0.55) / 0.45)) : C_WARM
      const end = A0 + Math.PI * 2 * remain
      // the arc carries its own dark liner, the way the joystick rim in
      // touch.ts does — a warm line alone dies over a bright dusk sky
      g.lineStyle(5.4 * sw, C_INK, 0.42 * gauge)
      g.beginPath()
      g.arc(cx, cy, r, A0, end, false)
      g.strokePath()
      g.lineStyle(3.2 * sw, col, (0.6 + 0.32 * remain) * gauge)
      g.beginPath()
      g.arc(cx, cy, r, A0, end, false)
      g.strokePath()
      // a tick at the head of the fill, so the drain has an edge to watch
      const hc = Math.cos(end)
      const hs = Math.sin(end)
      // the tick's LENGTH is deliberately capped below the stroke scale: at a
      // thumb pad's radius a proportional tick grew long enough to print over
      // the pad's own "tap · SURGE" caption
      const tl = 4 * Math.min(sw, 1.9)
      g.lineStyle(2 * sw, 0xfff0dc, 0.85 * gauge)
      g.lineBetween(cx + hc * (r - tl), cy + hs * (r - tl), cx + hc * (r + tl), cy + hs * (r + tl))
    }

    // ---- the verb's own mark, engraved twice: dark shadow, then light.
    // NOT on touch: the pad already carries its own word in the middle, and a
    // mark drawn there would print straight over it. On a phone this class adds
    // the gauge to an existing control; it does not redecorate it.
    if (!isTouch) {
      const m = r * 0.5
      g.lineStyle(3.4 * sw, C_INK, 0.5 * life)
      this.markPath(i, cx, cy + 1.5 * sw, m)
      g.lineStyle(2 * sw, lit > 0.02 ? mixHex(C_BRIGHT, 0xfff3e2, lit) : C_BRIGHT, (0.5 + 0.42 * av + lit * 0.3) * life)
      this.markPath(i, cx, cy, m)
    }

    // ---- unavailable: a scrim over the seat. Dimming alone can be mistaken
    // for a dark sky behind the icon; a scrim cannot.
    if (av < 0.985) {
      g.fillStyle(C_PLATE, (1 - av) * 0.5)
      g.fillCircle(cx, cy, r * 0.99)
    }

    // ---- THE ANSWER. A second ring outside the gauge plus additive light:
    // whichever verb beats what is on you right now, pulsing until it is dealt
    // with. This is the bar's reason to exist.
    if (lit > 0.01) {
      g.lineStyle(2.4 * sw, 0xffd9a0, lit * (0.3 + pulse * 0.5))
      g.strokeCircle(cx, cy, r * 1.26 + pulse * r * 0.06)
      g.lineStyle(1.4 * sw, 0xffd9a0, lit * (0.14 + pulse * 0.22))
      g.strokeCircle(cx, cy, r * 1.42 + pulse * r * 0.1)
    }
    for (let j = 0; j < this.glows.length; j++) {
      if (this.owner[j] !== i) continue
      this.glows[j].setAlpha(this.fSug[i] * (0.1 + pulse * 0.2) * a)
    }
  }

  /**
   * The six marks, as bare path emission so the caller can stroke each one
   * twice (dark, then light) without describing the geometry twice. Every verb
   * gets a shape that says what it DOES — arrows in, arrows out, a shove
   * forward, a wall to brake on, a ping, a stoop — because a bar of six
   * identical dots teaches nothing.
   */
  private markPath(i: number, cx: number, cy: number, m: number): void {
    const g = this.g
    switch (i) {
      case 0: {
        // GATHER: three arrowheads converging on a point that is actually
        // there. Without the dot the same three strokes read as a star, which
        // is a shape, not an instruction.
        for (let k = 0; k < 3; k++) {
          const ang = -Math.PI / 2 + (k * Math.PI * 2) / 3
          const tx = cx + Math.cos(ang) * m * 0.42
          const ty = cy + Math.sin(ang) * m * 0.42
          g.lineBetween(tx, ty, cx + Math.cos(ang - 0.5) * m * 0.95, cy + Math.sin(ang - 0.5) * m * 0.95)
          g.lineBetween(tx, ty, cx + Math.cos(ang + 0.5) * m * 0.95, cy + Math.sin(ang + 0.5) * m * 0.95)
        }
        g.beginPath()
        g.arc(cx, cy, m * 0.15, 0, Math.PI * 2)
        g.strokePath()
        break
      }
      case 1: {
        // SPREAD: the same three arrowheads turned outward, with the arms kept
        // short and wide. Longer arms closed into a triangle, and a triangle
        // beside GATHER's star was two shapes rather than one idea reversed.
        for (let k = 0; k < 3; k++) {
          const ang = -Math.PI / 2 + (k * Math.PI * 2) / 3
          const tx = cx + Math.cos(ang) * m
          const ty = cy + Math.sin(ang) * m
          g.lineBetween(tx, ty, cx + Math.cos(ang - 0.85) * m * 0.62, cy + Math.sin(ang - 0.85) * m * 0.62)
          g.lineBetween(tx, ty, cx + Math.cos(ang + 0.85) * m * 0.62, cy + Math.sin(ang + 0.85) * m * 0.62)
          g.lineBetween(cx + Math.cos(ang) * m * 0.2, cy + Math.sin(ang) * m * 0.2, tx, ty)
        }
        break
      }
      case 2: {
        // SURGE: a double chevron driving forward, with the air it left behind
        for (let k = 0; k < 2; k++) {
          const bx = cx - m * 0.5 + k * m * 0.62
          g.lineBetween(bx - m * 0.3, cy - m * 0.62, bx + m * 0.26, cy)
          g.lineBetween(bx + m * 0.26, cy, bx - m * 0.3, cy + m * 0.62)
        }
        g.lineBetween(cx - m * 1.05, cy, cx - m * 0.68, cy)
        break
      }
      case 3: {
        // FLARE: three lines fanning into a wall of air — the brake, not a burst
        g.lineBetween(cx + m * 0.52, cy - m * 0.82, cx + m * 0.52, cy + m * 0.82)
        for (let k = -1; k <= 1; k++) {
          g.lineBetween(cx - m * 0.95, cy + k * m * 0.72, cx + m * 0.24, cy + k * m * 0.3)
        }
        break
      }
      case 4: {
        // ECHO: a voice, and the wavefront leaving it
        const ox = cx - m * 0.62
        g.lineBetween(ox, cy - m * 0.16, ox, cy + m * 0.16)
        for (let k = 1; k <= 3; k++) {
          g.beginPath()
          g.arc(ox, cy, m * 0.4 * k, -0.72, 0.72, false)
          g.strokePath()
        }
        break
      }
      default: {
        // DIVE: a stoop — the line of the fall, and the head of it
        g.lineBetween(cx, cy - m * 0.95, cx, cy + m * 0.3)
        g.lineBetween(cx - m * 0.55, cy - m * 0.12, cx, cy + m * 0.6)
        g.lineBetween(cx + m * 0.55, cy - m * 0.12, cx, cy + m * 0.6)
        break
      }
    }
  }

  destroy(): void {
    this.g.destroy()
    for (let i = 0; i < this.labels.length; i++) this.labels[i].destroy()
    this.labels.length = 0
    for (let i = 0; i < this.glows.length; i++) this.glows[i].destroy()
    this.glows.length = 0
  }
}
