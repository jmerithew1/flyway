import Phaser from 'phaser'
import { Flock, Bird } from './flock'
import { Obstacle } from './obstacles'
import { GameAudio } from './audio'
import {
  FALCON_WINDOWS,
  FALCON_TAKE_SPREAD,
  FALCON_TAKE_NEUTRAL,
  FALCON_TAKE_GATHER,
} from './config'

export interface FalconZone {
  x: number
  done: boolean
  window: number
}

type Phase = 'idle' | 'unease' | 'shadow' | 'window' | 'reckoning' | 'strike' | 'exit' | 'flee'
type Pose = 'bank' | 'dive' | 'strike' | 'retreat'

/**
 * Where the painted bird's NOSE points in each source image, in screen radians
 * (+x right, +y down), measured off the art.
 *
 * The poses are not drawn facing a single way — bank and strike look right,
 * retreat climbs up-left, dive plunges down-left — so the old blanket "they all
 * face left, flip when travelling right" rule sent half the sequence through
 * its own move tail-first, and its hand-tuned rotations were authored against a
 * stand-in that was never the final art. Aiming from a measured nose angle
 * removes the guesswork: give aim() a heading and the bird points along it.
 */
const POSE_NOSE: Record<Pose, number> = {
  bank: 0.0, // level, facing right
  dive: 2.18, // plunging down-left
  // On the strike frame the heading is where the TALONS go, not where the beak
  // points: the bird is already braking, head up, feet thrown out ahead of it.
  // Aiming this one off the beak rotated it 65 degrees and put the claws behind
  // the direction of travel — the exact frame that has to read as contact.
  strike: 1.82, // talons thrust down and slightly left
  retreat: -2.14, // climbing away, up-left
}

/** How far through the dive the talons cross the flock. The strike RESOLVES
 * here — not when the dive starts — so birds disappear on the frame the
 * predator reaches them instead of the frame it leaves the top of the sky. */
const IMPACT_P = 0.6
/** How long the player has to answer the reckoning, in SLOWED world seconds. */
const RECKON_TIME = 2.6
/** Dive duration. Short: this is the fastest thing in the game. */
const DIVE_DUR = 0.46
/** Ghost streaks laid along the dive path behind the falcon. */
const STREAKS = 9

/**
 * Authored predator set piece. Telegraph sequence: exposed upper birds react →
 * a broad shadow sweeps the top of the screen → screech, music thins → a
 * reaction window → the falcon explodes in from above the frame.
 *
 * A well-timed Gather makes it miss; a dispersed flock hands it targets.
 * Spread never SUMMONS a falcon — zones are authored — it only exposes birds.
 */
export class FalconSystem {
  zones: FalconZone[]
  phase: Phase = 'idle'
  private timer = 0
  private scene: Phaser.Scene
  private audio: GameAudio
  private shadow!: Phaser.GameObjects.Image
  private falcon!: Phaser.GameObjects.Image
  private strikeX = 0
  private window = 1.0
  private obstacles: Obstacle[] = []
  private strikeTargets: Bird[] = []
  private carried: { sprite: Phaser.GameObjects.Image; dx: number; dy: number }[] = []
  firstEncounter = true
  /** birds taken this strike, for HUD messaging */
  lastTaken = 0
  onStrikeResolved: ((taken: number, gathered: boolean, mobbed: boolean) => void) | null = null
  /** the slow-motion answer window opens / closes */
  onReckonBegin: (() => void) | null = null
  onReckonEnd: ((won: boolean) => void) | null = null
  private reckonFailed = false
  /** Fires the frame the dive commits, before anything is taken — the scene
   * uses it to dim the sky and drop the score to a held note. */
  onDiveBegin: (() => void) | null = null
  /** Fires the frame the flock's answer is decided as MOB, so the scene can
   * raise the column while the predator is still on screen. */
  onMobBegin: (() => void) | null = null
  /** 0..1 while the dive is in the air — drives the scene's sky dim. */
  diveT = 0
  private streaks: Phaser.GameObjects.Image[] = []
  /** targets chosen when the dive commits, taken when the talons arrive */
  private pendingTargets: Bird[] = []
  private pendingGathered = false
  private resolved = true
  private fleeFrom = { x: 0, y: 0 }
  private impactY = 430
  private baseScale = 1
  /** Flock size when the zone armed — mobbing needs ~70% of it intact. */
  private zoneArrivalCount = 120
  /** Which painted pose is currently on the sprite — aim() needs it to know
   * which way the art faces before it decides to mirror or rotate. */
  private pose: Pose = 'bank'
  private lastPos: { x: number; y: number } | null = null

  constructor(scene: Phaser.Scene, audio: GameAudio, zoneXs: number[]) {
    this.scene = scene
    this.audio = audio
    this.zones = zoneXs.map((x, i) => ({ x, done: false, window: FALCON_WINDOWS[Math.min(i, FALCON_WINDOWS.length - 1)] }))

    // THE SWEEPING SHADOW — the first thing the player sees, and for a long
    // time it was the wings-down STARLING pose at 3.2x, which is a fat little
    // songbird outline and reads as nothing at all. It is now a wings-fully-
    // spread soar, which is the shape a raptor casts from directly overhead.
    // Drawn tint-filled, so only the outline survives: this is the one place
    // the warm-rimmed flock/ hawk art is safe to use, because setTintFill
    // discards its colour entirely.
    const shadowKey = scene.textures.exists('falcon_soar') ? 'falcon_soar' : 'falcon'
    this.shadow = scene.add
      .image(0, 120, shadowKey)
      .setTintFill(0x1a1226)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(8)
    // normalize display size regardless of source art resolution
    const startKey = scene.textures.exists('falcon_bank') ? 'falcon_bank' : 'falcon'
    this.falcon = scene.add.image(0, -400, startKey).setDepth(9).setVisible(false)
    const tex = scene.textures.get(startKey).getSourceImage() as { width: number; height: number }
    const span = 310
    this.falcon.setScale(span / tex.width)
    this.baseScale = span / tex.width
    // Flat tint is the LAST resort: it is what makes a painted bird read as a
    // sticker. Only reach for it when there is genuinely no pose art loaded.
    if (!scene.textures.exists('falcon-art') && !scene.textures.exists('falcon_bank')) {
      this.falcon.setTint(0x151024)
    }
    const shTex = scene.textures.get(shadowKey).getSourceImage() as { width: number; height: number }
    this.shadow.setScale((span * 1.45) / shTex.width)

    // I1 — THE DIVE IS A HARD STREAK. A sprite sliding down the screen at 46
    // frames of travel reads as a sprite sliding down the screen; a stack of
    // ghost streaks laid along the path behind it reads as SPEED. The tail is
    // dark (it is a silhouette against dusk); the head carries one thin
    // additive core so the leading edge cuts.
    for (let i = 0; i < STREAKS; i++) {
      const s = scene.add
        .image(0, 0, 'streak')
        .setTint(i === 0 ? 0xffe6c8 : 0x0d0918)
        .setBlendMode(i === 0 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setDepth(8.9)
        .setVisible(false)
      this.streaks.push(s)
    }

    this.setPose('bank')
  }

  /** Lay the ghost trail along the dive path behind the talons. */
  private renderStreaks(p: number, at: (q: number) => { x: number; y: number }): void {
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i]
      // head streak sits ON the falcon; the tail samples back along the path
      const back = i === 0 ? 0.012 : 0.02 + (i - 1) * 0.036
      const q = p - back
      if (q < 0) {
        s.setVisible(false)
        continue
      }
      const a = at(q)
      const b = at(Math.max(0, q - 0.03))
      s.setVisible(true)
      s.setPosition(a.x, a.y)
      s.setRotation(Math.atan2(a.y - b.y, a.x - b.x))
      const k = i === 0 ? 1 : 1 - (i - 1) / (this.streaks.length - 1)
      s.setDisplaySize(i === 0 ? 300 : 150 + k * 260, i === 0 ? 9 : 4 + k * 26)
      // the whole trail fades as the dive lands, so nothing lingers after the hit
      const tail = Math.min(1, (1 - p) * 3.2)
      s.setAlpha((i === 0 ? 0.85 : 0.16 + k * 0.5) * tail)
    }
  }

  private hideStreaks(): void {
    for (const s of this.streaks) s.setVisible(false)
  }

  /** Authored pose sequence from the supplied art (bank/dive/strike/retreat);
   * falls back to the legacy single texture when the sheet isn't loaded. */
  private setPose(pose: Pose): void {
    const key = `falcon_${pose}`
    if (!this.scene.textures.exists(key)) return
    this.pose = pose
    if (this.falcon.texture.key !== key) {
      this.falcon.setTexture(key)
      this.falcon.clearTint()
      const src = this.scene.textures.get(key).getSourceImage() as { width: number; height: number }
      // Normalize the LONG axis, not the width. Width-normalizing made the
      // same bird change size every time it changed pose — the wide-spread
      // strike came out a third shorter than the bank, and the folded dive
      // came out narrow AND small, so the one frame that should hit hardest
      // was the smallest thing on screen. Long-axis normalizing keeps one
      // raptor at one size through the whole sequence.
      // The flock is 27px across, so 260 puts the hawk at ~10x a bird: clearly
      // the largest thing in the sky, and large enough to have presence.
      const s = 260 / Math.max(src.width, src.height)
      this.falcon.setScale(s)
      this.baseScale = s
    }
  }

  /**
   * Point the painted bird along `dir` (screen radians), plus an optional
   * `roll` for drama on top of the heading.
   *
   * Mirrors rather than spins whenever mirroring needs less rotation, so the
   * art is never rotated far from the attitude it was painted in — a raptor
   * spun 140 degrees stops reading as a raptor.
   */
  private aim(dir: number, roll = 0): void {
    const norm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))
    const nose = POSE_NOSE[this.pose]
    const straight = norm(dir - nose)
    const flipped = norm(dir - (Math.PI - nose))
    const flip = Math.abs(flipped) < Math.abs(straight)
    this.falcon.setFlipX(flip)
    this.falcon.setRotation((flip ? flipped : straight) + roll)
  }

  /** Aim along actual travel, measured frame to frame. Hovering (no real
   * movement) keeps the previous heading rather than snapping to noise. */
  private aimTravel(x: number, y: number, fallback: number, roll = 0): void {
    const prev = this.lastPos
    this.lastPos = { x, y }
    if (prev) {
      const dx = x - prev.x
      const dy = y - prev.y
      if (Math.hypot(dx, dy) > 2) {
        this.aim(Math.atan2(dy, dx), roll)
        return
      }
    }
    this.aim(fallback, roll)
  }

  update(dt: number, flock: Flock, scrollX: number, viewW: number, obstacles: Obstacle[] = []): void {
    this.obstacles = obstacles
    // arm the next zone when the flock approaches
    if (this.phase === 'idle') {
      for (const z of this.zones) {
        if (!z.done && flock.centerX > z.x - 150 && flock.centerX < z.x + 600) {
          z.done = true
          this.window = z.window
          this.phase = 'unease'
          this.timer = 0
          this.zoneArrivalCount = flock.count
        }
      }
      return
    }

    this.timer += dt
    const t = this.timer

    if (this.phase === 'unease') {
      // exposed upper birds dip inward and tighten — the earliest tell
      for (const b of flock.birds) {
        if (b.y < flock.centerY - 60) {
          b.vy += 140 * dt
          b.panic = Math.max(b.panic, 0.35)
        }
      }
      if (t > 0.7) {
        this.phase = 'shadow'
        this.timer = 0
        this.audio.falconScreech()
      }
    } else if (this.phase === 'shadow') {
      // broad shadow sweeps the upper screen
      const sw = (this.timer / 0.9) * (viewW + 700) - 350
      this.shadow.setPosition(sw, 110 + Math.sin(this.timer * 3) * 14)
      this.shadow.setAlpha(Math.min(0.34, this.timer * 1.4))
      this.shadow.setFlipX(false)
      if (t > 0.9) {
        this.phase = 'window'
        this.timer = 0
      }
    } else if (this.phase === 'reckoning') {
      // THE RECKONING — the hawk hangs, the world crawls, and the player must
      // answer a short sequence to throw the flock up as one enormous bird.
      //
      // Mobbing used to resolve automatically off a triple gate, so the single
      // triumph the game offers happened without the player doing anything and
      // almost nobody ever saw it. The gate still decides whether the CHANCE is
      // offered — a small or ragged flock cannot make the shape at all, which
      // is the whole game's discipline being paid out — but landing it is now
      // skill, under pressure, in slow motion.
      this.setPose('bank')
      this.falcon.setVisible(true)
      const hover = Math.sin(this.timer * 5.5)
      this.falcon.setPosition(this.strikeX + hover * 26, 150 + hover * 12)
      // it hangs there LOOKING AT the flock below and behind it. Aiming at the
      // travel vector here made it mirror-flip twice a second on the hover
      // wobble, which is a strobe, not a threat.
      this.aim(Math.PI + hover * 0.06)
      if (this.reckonFailed || t > RECKON_TIME) {
        // out of time, or a wrong input: it commits, and this one hurts
        this.phase = 'strike'
        this.resolved = false
        this.diveT = 0
        this.timer = 0
        this.onReckonEnd?.(false)
      }
    } else if (this.phase === 'window') {
      this.shadow.setAlpha(Math.max(0, 0.34 - this.timer * 0.5))
      // the falcon banks visibly high above the flock — the readable "decide
      // NOW" tell (art: falcon_bank)
      this.setPose('bank')
      this.falcon.setVisible(true)
      const wob = Math.sin(this.timer * 4.2)
      const bankX = flock.centerX + 60 + wob * 30
      this.falcon.setPosition(bankX, 120 + wob * 16)
      // it holds station ahead of and above the flock, turned back to watch it
      this.aim(Math.PI + wob * 0.08)
      if (t > this.window) {
        this.timer = 0
        this.armStrike(flock)
      }
    } else if (this.phase === 'strike') {
      // dive along a steep line through the flock's x (art: dive, then talons)
      const p = Math.min(1, this.timer / DIVE_DUR)
      this.diveT = p
      this.setPose(p < IMPACT_P ? 'dive' : 'strike')
      const at = (q: number): { x: number; y: number } => ({
        x: this.strikeX + (q - IMPACT_P) * 300,
        y: -220 + (q / IMPACT_P) * (this.impactY + 220),
      })
      const f = at(p)
      this.falcon.setPosition(f.x, f.y)
      // along the dive line itself — the same line the streaks are laid on, so
      // the bird and its speed trail can never disagree about where it is going
      // at() is linear, so sampling behind p is safe even on the first frame —
      // clamping it to 0 there would give a zero-length vector and a bird
      // pointing flat right for one frame of the fastest move in the game
      const back = at(p - 0.03)
      this.aim(Math.atan2(f.y - back.y, f.x - back.x))
      this.renderStreaks(p, at)
      // THE TALONS ARRIVE. Not a frame earlier: the screech, the hit-stop and
      // the birds all land together, on contact.
      if (!this.resolved && p >= IMPACT_P) this.resolveStrike(flock)
      // carried birds trail from the talons
      for (const c of this.carried) c.sprite.setPosition(f.x + c.dx, f.y + c.dy)
      if (p >= 1) {
        this.hideStreaks()
        this.diveT = 0
        this.lastPos = null
        this.phase = 'exit'
        this.timer = 0
      }
    } else if (this.phase === 'flee') {
      // I3 — MOBBED. The predator is driven off: a hard recoil away from the
      // column, then it climbs out of the frame shrinking as it goes.
      this.setPose('retreat')
      const p = Math.min(1, this.timer / 1.5)
      // recoil (first ~0.2) then flight; ease-out so it never decelerates
      const recoil = Math.max(0, 1 - p / 0.14)
      const run = Math.pow(Math.max(0, (p - 0.1) / 0.9), 1.7)
      const fx = this.fleeFrom.x - recoil * 90 + run * 1500
      const fy = this.fleeFrom.y - recoil * 40 - run * (this.fleeFrom.y + 620)
      this.falcon.setPosition(fx, fy)
      // it TUMBLES out of control at first, then straightens into the run —
      // the tumble rides on top of the heading rather than replacing it
      this.aimTravel(fx, fy, -0.9, -Math.sin(p * 22) * 0.5 * recoil)
      this.falcon.setAlpha(1 - Math.pow(p, 2.4) * 0.85)
      this.falcon.setScale(this.baseScale * (1 - run * 0.55))
      if (p >= 1) {
        this.falcon.setVisible(false).setAlpha(1).setScale(this.baseScale)
        this.phase = 'idle'
      }
    } else if (this.phase === 'exit') {
      // wheeling away (art: falcon_retreat) — also the mob/defense pose
      this.setPose('retreat')
      const p = Math.min(1, this.timer / 0.8)
      const fx = this.strikeX + 130 + p * 900
      const fy = flock.centerY + 80 - p * (flock.centerY + 500)
      this.falcon.setPosition(fx, fy)
      this.aimTravel(fx, fy, -0.9)
      for (const c of this.carried) c.sprite.setPosition(fx + c.dx, fy + c.dy)
      if (p >= 1) {
        this.falcon.setVisible(false)
        for (const c of this.carried) c.sprite.destroy()
        this.carried = []
        this.phase = 'idle'
      }
    }
  }

  /**
   * The dive COMMITS. Everything is decided here — who the falcon is coming
   * for, and whether the flock's answer turns it away — but nothing is taken
   * yet: the take waits for the talons (resolveStrike, at IMPACT_P).
   */
  private armStrike(flock: Flock): void {
    this.falcon.setVisible(true).setAlpha(1).setScale(this.baseScale)
    this.strikeX = flock.centerX
    this.impactY = flock.centerY
    const gathered = flock.form > 0.35

    // MOBBING: a large, healthy, committed flock turns the tables — it rises
    // around the falcon in a screeching column and drives it off. Triple-gated
    // (size + form + low strain) so it pays out the whole game's discipline.
    if (gathered && flock.count >= this.zoneArrivalCount * 0.7 && flock.gatherStrain < 0.4) {
      // The flock is big enough and tight enough to make the shape — so the
      // player is OFFERED the reckoning rather than handed the win.
      this.phase = 'reckoning'
      this.timer = 0
      this.reckonFailed = false
      this.onReckonBegin?.()
      return
    }

    // (the automatic mob path that used to live here is gone: mobbing is
    // now the player's answer to the reckoning, and mobNow() owns it.)

    this.phase = 'strike'
    this.resolved = false
    this.diveT = 0
    this.pendingGathered = gathered
    const spreadOrFrayed = flock.form < -0.3 || flock.spreadStrain > 0.4 || flock.gatherStrain > 0.6

    const range = gathered ? FALCON_TAKE_GATHER : spreadOrFrayed ? FALCON_TAKE_SPREAD : FALCON_TAKE_NEUTRAL
    let want = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1))

    // strike lane varies a little — reading the flock's position matters
    this.strikeX += (Math.random() - 0.5) * 180

    // stone overhead is COVER: birds under a solid band within ~300px above
    // cannot be taken — steering under an arch beats the falcon
    const covered = (b: Bird): boolean => {
      for (const o of this.obstacles) {
        if (o.shape !== 'rect' || o.kind !== 'solid') continue
        if (b.x > o.x - o.hw && b.x < o.x + o.hw) {
          const bandBottom = o.y + o.hh
          if (bandBottom < b.y && b.y - bandBottom < 300) return true
        }
      }
      return false
    }

    // targets: the most exposed birds (furthest above/outside the core),
    // excluding anything sheltered by architecture
    const exposed = [...flock.birds]
      .filter((b) => !covered(b))
      .map((b) => ({ b, d: Math.hypot(b.x - flock.centerX, b.y - flock.centerY) + (flock.centerY - b.y) * 0.6 }))
      .sort((a, bb) => bb.d - a.d)
    this.pendingTargets = exposed.slice(0, want).map((e) => e.b)

    // the sky goes cold and the score drops out — this is the scene's cue,
    // and it fires BEFORE the hit so the dive falls through a held breath
    this.onDiveBegin?.()
    this.audio.strikeHeldNote(DIVE_DUR + 0.95)
  }

  /**
   * The talons arrive. Birds leave the flock, the screech lands, and the
   * scene's impact (hit-stop, feathers, kick) fires on this same frame.
   */
  /** The player answered the reckoning: the flock becomes the bigger bird. */
  mobNow(flock: Flock): void {
    if (this.phase !== 'reckoning') return
    this.lastTaken = 0
    this.lastPos = null
    this.phase = 'flee'
    this.timer = 0
    this.fleeFrom = { x: flock.centerX + 40, y: Math.max(140, flock.centerY - 220) }
    this.falcon.setPosition(this.fleeFrom.x, this.fleeFrom.y)
    this.hideStreaks()
    this.audio.falconMiss()
    this.audio.falconRetreatScreech()
    this.audio.mobSwell()
    for (const b of flock.birds) {
      b.vy -= 260 + Math.random() * 160
      b.panic = Math.max(b.panic, 0.5)
    }
    this.onMobBegin?.()
    this.onReckonEnd?.(true)
    this.onStrikeResolved?.(0, true, true)
  }

  /** A wrong input during the reckoning: it commits early and unforgivingly. */
  failReckoning(): void {
    if (this.phase === 'reckoning') this.reckonFailed = true
  }

  private resolveStrike(flock: Flock): void {
    this.resolved = true
    // re-check membership: anything already lost to the dark or a collision
    // between commit and contact is no longer the falcon's to take
    this.strikeTargets = this.pendingTargets.filter((b) => flock.birds.includes(b))
    this.lastTaken = this.strikeTargets.length

    // flock buckles away from the strike line
    for (const b of flock.birds) {
      const dx = b.x - this.strikeX
      const push = Math.exp(-Math.abs(dx) / 160) * 300
      b.vy += push
      b.vx += Math.sign(dx || 1) * push * 0.4
      b.panic = Math.max(b.panic, 0.6)
    }

    // take the targets: they become carried sprites trailing the talons
    for (const tb of this.strikeTargets) {
      const spr = this.scene.add.image(tb.x, tb.y, 'bird-mid').setScale(0.2).setDepth(9)
      this.carried.push({ sprite: spr, dx: (Math.random() - 0.5) * 60, dy: 40 + Math.random() * 40 })
      flock.removeBird(tb)
    }

    // THE SCREECH LANDS ON THE HIT
    this.audio.falconStrikeScreech()
    if (this.lastTaken > 0) this.audio.falconHit()
    else this.audio.falconMiss()
    this.onStrikeResolved?.(this.lastTaken, this.pendingGathered, false)
    this.pendingTargets = []
  }

  /** Where the talons crossed the flock — the scene's impact origin. */
  get impactPoint(): { x: number; y: number } {
    return { x: this.strikeX, y: this.impactY }
  }

  get active(): boolean {
    return this.phase !== 'idle'
  }

  get inWarning(): boolean {
    return this.phase === 'shadow' || this.phase === 'window'
  }

  reset(beforeX: number): void {
    for (const z of this.zones) if (z.x > beforeX) z.done = false
    this.phase = 'idle'
    this.lastPos = null
    this.falcon.setVisible(false).setAlpha(1).setScale(this.baseScale)
    this.shadow.setAlpha(0)
    this.hideStreaks()
    this.diveT = 0
    this.resolved = true
    this.pendingTargets = []
    for (const c of this.carried) c.sprite.destroy()
    this.carried = []
  }
}
