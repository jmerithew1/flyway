import Phaser from 'phaser'
import { Flock, Bird } from '../flock'
import { Obstacle } from '../obstacles'
import { StrayGroup } from '../strays'
import { ScatterSystem } from '../scatter'
import * as Ruins from '../ruins'
import { GameAudio } from '../audio'
import {
  FEATURES,
  STRAYS,
  PROMPTS,
  CHECKPOINTS,
  buildObstacles,
  SCROLL_SPEED,
  PRESSURE_SPEED,
  PRESSURE_START,
  ROOST_X,
  ROOST_Y,
  SLICE_END,
  SKY_TOP,
  SKY_BOTTOM,
} from '../level'
import {
  paintBackdrop,
  paintRuinStrip,
  paintFoliageStrip,
  paintFogTile,
  W as VIEW_W,
  H as VIEW_H,
} from '../backdrop'

/** Crosswind zone: adds a reason to change formation without a new control. */
const WIND_START = 6450
const WIND_END = 11500
const WIND_STRENGTH = 70

export interface DayStats {
  startCount: number
  found: number
  lost: number
  collisionEvents: number
  resets: number
  returned: number
}

interface ActivePrompt {
  key: string
  done: () => boolean
  fading: boolean
}

interface CheckpointState {
  x: number
  count: number
  found: number
}

interface AmbientFlock {
  birds: Phaser.GameObjects.Image[]
  x: number
  y: number
  vx: number
  vy: number
}

export class DayScene extends Phaser.Scene {
  private flock!: Flock
  private obstacles: Obstacle[] = []
  private strays: { group: StrayGroup; def: (typeof STRAYS)[number] }[] = []
  private scatter!: ScatterSystem
  private ruinsGfx!: Phaser.GameObjects.Graphics
  private roostGfx!: Phaser.GameObjects.Graphics
  private roostSwirl: { sprite: Phaser.GameObjects.Image; a: number; r: number; s: number; ph: number }[] = []
  private ambientFlocks: AmbientFlock[] = []
  private audio = new GameAudio()

  private keySpace!: Phaser.Input.Keyboard.Key
  private keyShift!: Phaser.Input.Keyboard.Key
  private ruinStrip!: Phaser.GameObjects.TileSprite
  private foliageStrip!: Phaser.GameObjects.TileSprite
  private fogFar!: Phaser.GameObjects.TileSprite
  private fogNear!: Phaser.GameObjects.TileSprite
  private leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter

  private scrollX = 0
  private countText!: Phaser.GameObjects.Text
  private debugText!: Phaser.GameObjects.Text
  private debugVisible = false
  private promptText!: Phaser.GameObjects.Text
  private prompt: ActivePrompt | null = null
  private shownPrompts = new Set<string>()
  private lastHit = new Map<Bird, number>()
  private brittleCharge = new Map<Obstacle, number>()
  private stuckTime = new Map<Bird, number>()
  private lossTimes: number[] = []
  private mouseTravel = 0
  private lastPointer = { x: 0, y: 0 }
  private gatherHeld = 0
  private spreadHeld = 0

  private stats: DayStats = { startCount: 120, found: 0, lost: 0, collisionEvents: 0, resets: 0, returned: 0 }
  private checkpoint: CheckpointState = { x: 0, count: 120, found: 0 }
  private failing = false
  private finishing = false
  private finishTimer = 0
  private fadeRect!: Phaser.GameObjects.Rectangle

  constructor() {
    super('Day')
  }

  create(): void {
    if (!this.textures.exists('backdrop')) {
      paintBackdrop(this)
      paintRuinStrip(this)
      paintFoliageStrip(this)
      paintFogTile(this)
    }

    this.scrollX = 0
    this.shownPrompts.clear()
    this.lastHit.clear()
    this.brittleCharge.clear()
    this.stuckTime.clear()
    this.lossTimes = []
    this.strays = []
    this.ambientFlocks = []
    this.roostSwirl = []
    this.prompt = null
    this.mouseTravel = 0
    this.gatherHeld = 0
    this.spreadHeld = 0
    this.failing = false
    this.finishing = false
    this.finishTimer = 0
    this.stats = { startCount: 120, found: 0, lost: 0, collisionEvents: 0, resets: 0, returned: 0 }
    this.checkpoint = { x: 0, count: 120, found: 0 }

    this.add.image(0, 0, 'backdrop').setOrigin(0).setScrollFactor(0).setDepth(-10)
    this.ruinStrip = this.add
      .tileSprite(0, VIEW_H - 470, VIEW_W, 340, 'ruin-strip')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.5)
      .setDepth(-6)
    this.fogFar = this.add
      .tileSprite(0, VIEW_H - 400, VIEW_W, 200, 'fog-tile')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.16)
      .setDepth(-4)
    this.foliageStrip = this.add
      .tileSprite(0, VIEW_H - 170, VIEW_W, 170, 'foliage-strip')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(6)
    this.fogNear = this.add
      .tileSprite(0, VIEW_H - 240, VIEW_W, 200, 'fog-tile')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.2)
      .setDepth(7)

    this.obstacles = buildObstacles()
    this.ruinsGfx = this.add.graphics().setDepth(3)
    this.drawRuins()
    this.roostGfx = this.add.graphics().setDepth(2)
    this.drawRoost()

    this.flock = new Flock(this, 120, 420, 430)
    this.flock.intentX = 600
    this.flock.intentY = 430
    this.scatter = new ScatterSystem(this)
    for (const def of STRAYS) this.strays.push({ group: new StrayGroup(this, def.x, def.y, def.count, 0x533c4a), def })

    this.leafEmitter = this.add
      .particles(0, 0, 'leaf', {
        x: { min: 0, max: VIEW_W },
        y: { min: 0, max: VIEW_H * 0.8 },
        lifespan: 9000,
        speedX: { min: -60, max: -25 },
        speedY: { min: -8, max: 14 },
        scale: { min: 0.25, max: 0.6 },
        alpha: { start: 0, end: 0.35, ease: 'Quad.easeOut' },
        rotate: { min: 0, max: 360 },
        quantity: 1,
        frequency: 700,
        tint: [0x3a2f4a, 0x4a3b58],
      })
      .setScrollFactor(0)
      .setDepth(5)
    this.add
      .particles(0, 0, 'softdot', {
        x: { min: 0, max: VIEW_W },
        y: { min: 0, max: VIEW_H * 0.9 },
        lifespan: 12000,
        speedX: { min: -30, max: -12 },
        speedY: { min: -6, max: 6 },
        scale: { min: 0.03, max: 0.09 },
        alpha: { start: 0, end: 0.25, ease: 'Quad.easeOut' },
        quantity: 1,
        frequency: 900,
        tint: 0xf7e0bd,
      })
      .setScrollFactor(0)
      .setDepth(-3)

    const kb = this.input.keyboard!
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    kb.on('keydown-D', () => {
      this.debugVisible = !this.debugVisible
      this.debugText.setVisible(this.debugVisible)
    })
    this.input.once('pointermove', () => this.audio.start())
    kb.once('keydown', () => this.audio.start())

    this.fadeRect = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x1a1530)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(50)
      .setAlpha(0)

    // ---- minimal HUD: bird icon + count only
    this.add.image(30, 32, 'bird').setScale(0.42).setTint(0xf2e8f5).setAlpha(0.9).setScrollFactor(0).setDepth(20)
    this.countText = this.add
      .text(52, 18, '120', { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#f2e8f5' })
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(20)
    this.debugText = this.add
      .text(14, 60, '', { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffffff' })
      .setAlpha(0.7)
      .setScrollFactor(0)
      .setDepth(20)
      .setVisible(false)
    this.promptText = this.add
      .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '21px', color: '#f7ecdf' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(20)

    this.time.delayedCall(1400, () =>
      this.showPrompt('steer', 'move the mouse — steer the flock', () => this.mouseTravel > 900),
    )

    ;(window as unknown as Record<string, unknown>).__day = this
    ;(window as unknown as Record<string, unknown>).__flock = this.flock
  }

  // ------------------------------------------------------------------ visuals

  private drawRuins(): void {
    const g = this.ruinsGfx
    g.clear()
    for (const f of FEATURES) {
      if (f.type === 'wall') {
        const edges: number[] = [0]
        for (const o of f.openings) edges.push(o.y0, o.y1)
        edges.push(960)
        for (let i = 0; i < edges.length; i += 2) {
          const y0 = edges[i]
          const y1 = edges[i + 1]
          if (y1 - y0 < 8) continue
          if (y0 >= 780) Ruins.rubble(g, f.x, 860, f.hw * 2 + 90)
          else Ruins.brokenColumn(g, f.x, y0, Math.min(y1, 850), f.hw)
        }
        for (const o of f.openings) {
          if (o.brittle) {
            const match = this.obstacles.find(
              (ob) => ob.kind === 'brittle' && ob.x === f.x && Math.abs(ob.y - (o.y0 + o.y1) / 2) < 1,
            )
            if (!match?.broken) Ruins.brittleCurtain(g, f.x, o.y0, o.y1, f.hw * 2)
            continue
          }
          const mid = (o.y0 + o.y1) / 2
          const r = (o.y1 - o.y0) / 2
          if (o.deco === 'arch') Ruins.archCrown(g, f.x, o.y0, 150)
          else if (o.deco === 'pointedArch') Ruins.pointedArch(g, f.x, o.y0, 110)
          else if (o.deco === 'window') Ruins.roundWindow(g, f.x, mid, r)
          else if (o.deco === 'rose') Ruins.roseWindow(g, f.x, mid, r)
          else if (o.deco === 'doubleArch') Ruins.doubleArch(g, f.x, o.y0, o.y1, f.hw * 2 + 40)
          else if (o.deco === 'vines') Ruins.vines(g, f.x, o.y0, f.hw * 2 + 36, 5)
        }
      } else {
        const capR = f.hw * (f.huge ? 1.15 : 1.45)
        g.fillStyle(Ruins.STONE, 1)
        g.fillCircle(f.x, f.top, capR)
        g.fillStyle(Ruins.RIM, 0.4)
        g.fillRect(f.x - capR + 6, f.top - capR * 0.55, 7, capR * 1.1)
        if (f.huge) Ruins.towerCap(g, f.x, f.top - capR * 0.7, f.hw)
        g.fillStyle(Ruins.STONE, 1)
        g.fillRect(f.x - f.hw - 16, f.top + capR * 0.75, (f.hw + 16) * 2, 18)
        Ruins.brokenColumn(g, f.x, f.top + capR * 0.75 + 18, f.bottom, f.hw)
        Ruins.rubble(g, f.x, 860, f.hw * 2 + 120)
        Ruins.vines(g, f.x, f.top + capR * 0.75 + 12, f.hw * 2, f.huge ? 5 : 3)
      }
    }
  }

  private drawRoost(): void {
    const g = this.roostGfx
    g.fillStyle(0x241a30, 1)
    g.fillRect(ROOST_X - 24, ROOST_Y + 60, 48, 420)
    g.fillCircle(ROOST_X, ROOST_Y, 160)
    g.fillCircle(ROOST_X - 130, ROOST_Y + 65, 100)
    g.fillCircle(ROOST_X + 130, ROOST_Y + 60, 106)
    g.fillCircle(ROOST_X - 45, ROOST_Y - 118, 90)
    g.fillCircle(ROOST_X + 60, ROOST_Y - 90, 76)
    for (let i = 0; i < 30; i++) {
      const sprite = this.add.image(ROOST_X, ROOST_Y, 'bird').setScale(0.2).setTint(0x241a30).setDepth(2)
      this.roostSwirl.push({
        sprite,
        a: Math.random() * Math.PI * 2,
        r: 140 + Math.random() * 210,
        s: 0.45 + Math.random() * 0.75,
        ph: Math.random() * Math.PI * 2,
      })
    }
  }

  // ------------------------------------------------------------------ prompts

  private showPrompt(key: string, text: string, done: () => boolean): void {
    if (this.shownPrompts.has(key) || this.prompt) return
    this.shownPrompts.add(key)
    this.prompt = { key, done, fading: false }
    this.promptText.setText(text).setAlpha(0)
    this.tweens.add({ targets: this.promptText, alpha: 0.9, duration: 600 })
  }

  private updatePrompt(): void {
    if (!this.prompt) return
    const sx = Phaser.Math.Clamp(this.flock.centerX - this.scrollX, 200, VIEW_W - 220)
    const sy = Phaser.Math.Clamp(this.flock.centerY - 150, 70, VIEW_H - 60)
    this.promptText.setPosition(sx, sy)
    if (!this.prompt.fading && this.prompt.done()) {
      this.prompt.fading = true
      this.tweens.add({
        targets: this.promptText,
        alpha: 0,
        duration: 900,
        onComplete: () => {
          this.prompt = null
        },
      })
    }
  }

  // ------------------------------------------------------------------- update

  update(timeMs: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 20)
    const time = this.game.loop.time / 1000
    const cam = this.cameras.main

    if (!this.finishing && !this.failing) {
      const rel = this.flock.centerX - this.scrollX
      const baseSpeed = this.scrollX >= PRESSURE_START ? PRESSURE_SPEED : SCROLL_SPEED
      // rubber-band mercy: a battered flock that falls behind gets a moment to
      // recover instead of being ground through obstacles by the screen edge
      const speed = rel < VIEW_W * 0.3 ? baseSpeed * 0.55 : baseSpeed
      this.scrollX += speed * dt
    } else if (this.finishing) {
      const targetScroll = ROOST_X - VIEW_W * 0.58
      this.scrollX += (targetScroll - this.scrollX) * Math.min(dt * 1.1, 1)
    }
    cam.scrollX = this.scrollX
    this.ruinStrip.tilePositionX = this.scrollX * 0.14
    this.foliageStrip.tilePositionX = this.scrollX * 0.5
    this.fogFar.tilePositionX = this.scrollX * 0.22 + time * 5
    this.fogNear.tilePositionX = this.scrollX * 0.55 + time * 9

    // input → flock
    const p = this.input.activePointer
    const untouched = p.x === 0 && p.y === 0
    if (!untouched) {
      this.mouseTravel += Math.hypot(p.x - this.lastPointer.x, p.y - this.lastPointer.y)
      this.lastPointer.x = p.x
      this.lastPointer.y = p.y
    }
    const world = cam.getWorldPoint(untouched ? VIEW_W * 0.45 : p.x, untouched ? VIEW_H * 0.45 : p.y)
    const gather = !this.finishing && this.keySpace.isDown
    const spread = !this.finishing && this.keyShift.isDown
    if (gather) this.gatherHeld += dt
    if (spread) this.spreadHeld += dt

    this.flock.update(
      dt,
      {
        intentX: this.finishing ? ROOST_X : Phaser.Math.Clamp(world.x, this.scrollX + VIEW_W * 0.07, this.scrollX + VIEW_W * 0.82),
        intentY: this.finishing ? ROOST_Y : Phaser.Math.Clamp(world.y, SKY_TOP + 20, SKY_BOTTOM),
        gather,
        spread,
      },
      this.visibleObstacles(),
    )

    this.applyWind(dt)

    // soft bounds
    const leftEdge = this.scrollX + 50
    const rightEdge = this.scrollX + VIEW_W * 0.88
    for (const b of this.flock.birds) {
      if (b.x < leftEdge) b.vx += (leftEdge - b.x) * 14 * dt
      if (b.x > rightEdge) b.vx -= (b.x - rightEdge) * 8 * dt
      if (b.y < SKY_TOP) b.vy += (SKY_TOP - b.y) * 10 * dt
      if (b.y > SKY_BOTTOM) b.vy -= (b.y - SKY_BOTTOM) * 10 * dt
    }

    this.processCollisions(time)
    this.processBrittle(dt)
    this.cullStragglers(dt)
    this.scatter.update(dt, time, this.flock)

    const spreadAmt = Math.max(-this.flock.form, 0)
    for (const s of this.strays) {
      if (s.group.depleted) continue
      const joined = s.group.update(dt, time, this.flock, 200 + spreadAmt * 220)
      if (joined > 0) this.stats.found += joined
    }

    this.updateRoostSwirl(dt, time)
    this.updateAmbientFlocks(dt)

    for (const pr of PROMPTS) {
      if (pr.x < 0) continue
      if (this.scrollX > pr.x) {
        if (pr.key === 'gather') this.showPrompt('gather', pr.text, () => this.gatherHeld > 0.7)
        else if (pr.key === 'spread') this.showPrompt('spread', pr.text, () => this.spreadHeld > 0.7)
      }
    }
    if (this.scrollX > 6500 && this.scrollX < WIND_END) {
      this.showPrompt('wind', 'crosswind — Gather cuts through it', () => this.scrollX > 7100)
    }
    this.updatePrompt()

    this.checkCheckpoints()
    this.checkFail()
    this.checkFinish(dt)

    const meanSpeed = Math.hypot(this.flock.meanVX, this.flock.meanVY) / 430
    this.audio.setFlockState(this.flock.form, Phaser.Math.Clamp(meanSpeed, 0, 1))
    if (this.finishing) this.audio.warmth(Math.min(1, this.finishTimer / 4))

    this.countText.setText(String(this.flock.count))
    if (this.debugVisible) {
      this.debugText.setText(
        `fps ${Math.round(this.game.loop.actualFps)}  form ${this.flock.form.toFixed(2)}  x ${Math.round(this.scrollX)}  cp ${this.checkpoint.x}`,
      )
    }
    void timeMs
  }

  // --------------------------------------------------------------- subsystems

  private visibleObstacles(): Obstacle[] {
    const x0 = this.scrollX - 300
    const x1 = this.scrollX + VIEW_W + 600
    return this.obstacles.filter((o) => {
      const half = o.shape === 'circle' ? o.r : o.hw
      return o.x + half > x0 && o.x - half < x1 && !o.broken
    })
  }

  private applyWind(dt: number): void {
    const x = this.flock.centerX
    if (x < WIND_START || x > WIND_END) return
    const gather = Math.max(this.flock.form, 0)
    const resist = 1 - gather * 0.72
    const wx = Math.sin(x * 0.0006) * WIND_STRENGTH * resist
    const wy = Math.cos(x * 0.0009 + 1) * WIND_STRENGTH * 0.4 * resist
    for (const b of this.flock.birds) {
      b.vx += wx * dt
      b.vy += wy * dt
    }
    this.leafEmitter.setParticleSpeed({ min: -60 - wx, max: -25 - wx * 0.6 } as never)
  }

  private processCollisions(time: number): void {
    for (const bird of this.flock.collisions) {
      const last = this.lastHit.get(bird) ?? -10
      if (time - last < 0.5) continue
      this.lastHit.set(bird, time)
      this.lossTimes = this.lossTimes.filter((t) => time - t < 0.7)
      const capped = this.lossTimes.length >= 4
      if (!capped && Math.random() < 0.22) {
        this.lossTimes.push(time)
        this.stats.collisionEvents++
        this.stats.lost++
        this.audio.collisionThump()
        this.scatter.spawn(bird.x, bird.y, bird.x - this.flock.centerX, bird.y - this.flock.centerY)
        this.flock.removeBird(bird)
        this.lastHit.delete(bird)
      } else {
        bird.panic = 1
        const dx = this.flock.centerX - bird.x
        const dy = this.flock.centerY - bird.y
        const d = Math.hypot(dx, dy) || 1
        const sp = Math.max(Math.hypot(bird.vx, bird.vy), 200)
        bird.vx = (dx / d) * sp * 0.8
        bird.vy = (dy / d) * sp * 0.8
      }
    }
  }

  private processBrittle(dt: number): void {
    for (const [o, c] of this.brittleCharge) {
      const next = c * Math.exp(-2.2 * dt)
      if (next < 0.05) this.brittleCharge.delete(o)
      else this.brittleCharge.set(o, next)
    }
    if (this.flock.breakthroughHits.length === 0) return
    const meanSpeed = Math.hypot(this.flock.meanVX, this.flock.meanVY)
    for (const { bird, obstacle } of this.flock.breakthroughHits) {
      if (obstacle.broken) continue
      const charge = (this.brittleCharge.get(obstacle) ?? 0) + 1
      this.brittleCharge.set(obstacle, charge)
      if (charge >= 8 && this.flock.form > 0.35 && meanSpeed > 230) {
        this.breakObstacle(obstacle)
      } else if (this.flock.form <= 0.1 && Math.random() < 0.1) {
        this.scatter.spawn(bird.x, bird.y, -1, -0.3)
        this.flock.removeBird(bird)
        this.stats.lost++
      }
    }
  }

  private breakObstacle(o: Obstacle): void {
    o.broken = true
    this.drawRuins()
    const emitter = this.add.particles(o.x, o.y, 'leaf', {
      speed: { min: 80, max: 320 },
      angle: { min: -180, max: 180 },
      lifespan: { min: 500, max: 1400 },
      quantity: 44,
      scale: { start: 0.9, end: 0.2 },
      alpha: { start: 0.9, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0x2f3a2a, 0x46523a],
      emitting: false,
    })
    emitter.setDepth(3)
    emitter.explode(46, 0, 0)
    this.time.delayedCall(1600, () => emitter.destroy())
    this.cameras.main.shake(110, 0.0015)
    this.audio.collisionThump()
  }

  private updateRoostSwirl(dt: number, time: number): void {
    if (ROOST_X - this.scrollX > VIEW_W + 500) return
    for (const b of this.roostSwirl) {
      b.a += b.s * dt
      const px = ROOST_X + Math.cos(b.a) * b.r
      const py = ROOST_Y + Math.sin(b.a * 0.85 + b.ph) * b.r * 0.5 - 40
      b.sprite.rotation = Math.atan2(py - b.sprite.y, px - b.sprite.x)
      b.sprite.x = px
      b.sprite.y = py
      void time
    }
  }

  /** Small distant flocks that appear once the roost is close and drift toward it. */
  private updateAmbientFlocks(dt: number): void {
    if (ROOST_X - this.scrollX > VIEW_W * 1.4 || ROOST_X - this.scrollX < -400) return
    if (this.ambientFlocks.length < 3 && Math.random() < dt * 0.4) {
      const birds: Phaser.GameObjects.Image[] = []
      const n = 6 + Math.floor(Math.random() * 6)
      const sx = this.scrollX + VIEW_W * (0.7 + Math.random() * 0.3)
      const sy = SKY_TOP + Math.random() * 260
      for (let i = 0; i < n; i++) {
        const s = this.add.image(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 40, 'bird')
        s.setScale(0.24).setTint(0x2a2038).setAlpha(0.7).setDepth(1)
        birds.push(s)
      }
      this.ambientFlocks.push({ birds, x: sx, y: sy, vx: 60, vy: 0 })
    }
    for (const af of this.ambientFlocks) {
      const dx = ROOST_X - af.x
      const dy = ROOST_Y - 60 - af.y
      const d = Math.hypot(dx, dy) || 1
      af.vx += (dx / d) * 40 * dt
      af.vy += (dy / d) * 40 * dt
      const sp = Math.hypot(af.vx, af.vy) || 1
      af.vx = (af.vx / sp) * 90
      af.vy = (af.vy / sp) * 90
      af.x += af.vx * dt
      af.y += af.vy * dt
      for (const s of af.birds) {
        s.x += af.vx * dt + (Math.random() - 0.5) * 2
        s.y += af.vy * dt + (Math.random() - 0.5) * 2
        s.rotation = Math.atan2(af.vy, af.vx)
      }
    }
  }

  /** Birds hopelessly left behind peel away visibly rather than grinding on walls. */
  private cullStragglers(dt: number): void {
    for (const b of this.flock.birds) {
      if (this.flock.centerX - b.x > 760) {
        const t = (this.stuckTime.get(b) ?? 0) + dt
        if (t > 3) {
          this.stuckTime.delete(b)
          this.scatter.spawn(b.x, b.y, -0.6, -1)
          this.flock.removeBird(b)
          continue
        }
        this.stuckTime.set(b, t)
      } else if (this.stuckTime.has(b)) {
        this.stuckTime.delete(b)
      }
    }
  }

  private checkCheckpoints(): void {
    for (const cp of CHECKPOINTS) {
      if (cp > this.checkpoint.x && this.flock.centerX >= cp) {
        this.checkpoint = { x: cp, count: this.flock.count, found: this.stats.found }
      }
    }
  }

  private checkFail(): void {
    if (this.failing || this.finishing) return
    if (this.flock.count >= 35) return
    this.failing = true
    this.stats.resets++
    this.tweens.add({
      targets: this.fadeRect,
      alpha: 1,
      duration: 700,
      onComplete: () => {
        this.respawnAtCheckpoint()
        this.tweens.add({ targets: this.fadeRect, alpha: 0, duration: 900, delay: 150 })
        this.failing = false
      },
    })
  }

  private respawnAtCheckpoint(): void {
    const cp = this.checkpoint
    this.scrollX = Math.max(cp.x - VIEW_W * 0.35, 0)
    this.cameras.main.scrollX = this.scrollX
    this.scatter.clear()
    this.lastHit.clear()
    this.brittleCharge.clear()
    this.stuckTime.clear()
    const targetCount = Math.max(cp.count, 60)
    while (this.flock.count > targetCount) this.flock.removeBird(this.flock.birds[this.flock.birds.length - 1])
    while (this.flock.count < targetCount) this.flock.spawnBird(cp.x + rand(-120, 120), 430 + rand(-80, 80))
    for (const b of this.flock.birds) {
      b.x = cp.x + rand(-140, 140)
      b.y = 430 + rand(-90, 90)
      b.vx = rand(180, 240)
      b.vy = rand(-30, 30)
    }
    this.flock.intentX = cp.x + 200
    this.flock.intentY = 430
    this.stats.found = cp.found
    for (const s of this.strays) {
      if (s.def.x > cp.x) s.group.reset(s.def.count)
    }
    let redraw = false
    for (const o of this.obstacles) {
      if (o.broken && o.x > cp.x) {
        o.broken = false
        redraw = true
      }
    }
    if (redraw) this.drawRuins()
  }

  private checkFinish(dt: number): void {
    if (this.finishing) {
      this.finishTimer += dt
      if (this.finishTimer > 6) {
        this.stats.returned = this.flock.count
        this.scene.start('Results', this.stats)
      }
      return
    }
    if (this.flock.centerX >= ROOST_X - 280) {
      this.finishing = true
      this.showPrompt('home', 'home', () => this.finishTimer > 3)
      this.audio.chime(392, 0.3)
    }
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
