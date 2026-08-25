import Phaser from 'phaser'
import { Obstacle, avoidSteer, obstacleField } from './obstacles'
import { birdFrameKey } from './textures'

/**
 * The heart of the game: a lightweight boid flock with personality variation,
 * cursor-intent steering, and a gather/spread "form" axis.
 *
 * Design contract (from the brief):
 *  - cursor = intention, not position
 *  - ~75-80% flock response, ~20-25% organic variation
 *  - gather/spread transition smoothly, shapes emerge from motion
 *  - obstacles split the flock naturally; reunion is imperfect
 */

export const TUNING = {
  viewRadius: 96,
  sepRadiusNeutral: 62,
  sepRadiusGather: 13,
  sepRadiusSpread: 112,
  wCohesion: 300, // local centroid pull, per-100px-of-offset
  wSeparation: 250,
  wAlignment: 150,
  wIntent: 700,
  wJitter: 36,
  wSwirl: 38, // internal circulation currents
  wAvoid: 2600,
  // pull toward the flock centroid: prevents permanent fragmentation
  // and produces the imperfect post-split reunion
  wHome: 4.5,
  homeRadiusNeutral: 300,
  // envelope asymmetry along heading: dense leading edge, streaming tail
  leadTighten: 0.72,
  tailStretch: 1.65,
  homeRadiusGather: 60,
  homeRadiusSpread: 540,
  homeMax: 560,
  // neutral murmuration cloud is wider than tall (screen-axis envelope)
  envelopeYSquash: 1.9,
  envelopeXRelax: 0.85,
  cruiseSpeed: 235,
  minSpeed: 110,
  maxSpeed: 430,
  maxAccel: 1500,
  intentLerp: 9, // how fast the shared intent point chases the cursor
  formLerpAttack: 2.9, // pressing gather/spread responds quickly...
  formLerpRelease: 1.1, // ...but the flock relaxes back slowly (shape memory)
  gatherSpeedBoost: 0.22,
  spreadSpeedDrag: 0.12,
}

export interface Bird {
  x: number
  y: number
  vx: number
  vy: number
  alive: boolean
  // personality (fixed at spawn)
  speedFactor: number // 0.9..1.12
  agility: number // scales max accel, 0.75..1.25
  intentResponse: number // 0.65..1.35
  intentLagRate: number // per-bird intent smoothing speed — front reacts before tail
  myIntentX: number // this bird's delayed view of the shared intent point
  myIntentY: number
  orbitBias: number // signed: internal circulation direction
  homeBias: number // per-bird leash multiplier — ragged flock boundary
  edginess: number // jitter amplitude scale
  sidePref: number // -1..1 bias when splitting head-on
  flapPhase: number
  flapFreq: number
  renderAngle: number // smoothed heading for the sprite (kills rotation jitter)
  depth: number // 0.75..1.15 pseudo-depth for scale/alpha richness
  // transient
  panic: number // 0..1, spikes on close calls, adds flutter
  sprite: Phaser.GameObjects.Image
}

export interface FlockInput {
  intentX: number // raw cursor (world coords)
  intentY: number
  gather: boolean
  spread: boolean
}

interface Grid {
  cell: number
  map: Map<number, number[]>
}

const STEP = 1 / 60
const MAX_STEPS = 6
/** On-screen wingspan of an average bird, in game px. */
const BIRD_PX = 27

/**
 * Sprite scale derived from the actual rasterized texture width, so the art
 * stays the right size regardless of what resolution the SVG was rasterized at.
 */
function birdScale(scene: Phaser.Scene): number {
  const tex = scene.textures.get('bird-mid')?.getSourceImage() as { width?: number } | undefined
  return BIRD_PX / (tex?.width || 128)
}

/** ±8%-ish per-channel tint variation so the flock isn't one flat stamp. */
function varyTint(base: number): number {
  const r = (base >> 16) & 0xff
  const g = (base >> 8) & 0xff
  const b = base & 0xff
  const v = () => 0.92 + Math.random() * 0.18
  const clamp8 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return (clamp8(r * v()) << 16) | (clamp8(g * v()) << 8) | clamp8(b * v())
}

export class Flock {
  scene: Phaser.Scene
  birds: Bird[] = []
  intentX = 0
  intentY = 0
  form = 0 // smoothed: +1 gather, -1 spread
  time = 0
  /** mean state, updated each frame */
  centerX = 0
  centerY = 0
  meanVX = 1
  meanVY = 0
  /** birds that scraped an obstacle interior this frame (for loss rules later) */
  collisions: Bird[] = []
  breakthroughHits: { bird: Bird; obstacle: Obstacle }[] = []

  private grid: Grid = { cell: TUNING.viewRadius, map: new Map() }
  private tint: number
  private scale: number

  constructor(scene: Phaser.Scene, count: number, x: number, y: number, tint = 0x222638) {
    this.scene = scene
    this.tint = tint
    this.scale = birdScale(scene)
    this.intentX = x
    this.intentY = y
    for (let i = 0; i < count; i++) this.spawnBird(x + rand(-140, 140), y + rand(-90, 90))
  }

  spawnBird(x: number, y: number, vx?: number, vy?: number): Bird {
    const sprite = this.scene.add.image(x, y, 'bird-mid')
    const depth = rand(0.75, 1.15)
    sprite.setScale(this.scale * depth)
    sprite.setTint(varyTint(this.tint))
    sprite.setAlpha(0.82 + (depth - 0.75) * 0.45)
    const bird: Bird = {
      x,
      y,
      vx: vx ?? rand(160, 240),
      vy: vy ?? rand(-40, 40),
      alive: true,
      speedFactor: rand(0.92, 1.1),
      agility: rand(0.85, 1.2),
      intentResponse: rand(0.82, 1.25),
      // fast birds also react first → they lead, slow birds trail the tail
      intentLagRate: 0, // set below from speedFactor
      myIntentX: x,
      myIntentY: y,
      orbitBias: (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 1),
      homeBias: rand(0.7, 1.45),
      edginess: rand(0.4, 1.25),
      sidePref: Math.random() < 0.5 ? -rand(0.4, 1) : rand(0.4, 1),
      flapPhase: rand(0, Math.PI * 2),
      // most birds beat steadily; a few glide with slow lazy strokes
      flapFreq: Math.random() < 0.15 ? rand(2.5, 4) : rand(7, 11),
      renderAngle: 0,
      depth,
      panic: 0,
      sprite,
    }
    bird.intentLagRate = lerp(2.2, 10, (bird.speedFactor - 0.92) / 0.18) + rand(-0.8, 0.8)
    this.birds.push(bird)
    return bird
  }

  get count(): number {
    return this.birds.length
  }

  removeBird(bird: Bird): void {
    const i = this.birds.indexOf(bird)
    if (i >= 0) this.birds.splice(i, 1)
    bird.alive = false
    bird.sprite.destroy()
  }

  /** Fixed-timestep wrapper: stays correct through frame hitches / slow machines. */
  update(dtRaw: number, input: FlockInput, obstacles: Obstacle[]): void {
    this.collisions.length = 0
    this.breakthroughHits.length = 0
    this.stepAccum = Math.min(this.stepAccum + dtRaw, STEP * MAX_STEPS)
    while (this.stepAccum >= STEP) {
      this.stepAccum -= STEP
      this.step(STEP, input, obstacles)
    }
    this.render(dtRaw)
  }

  private stepAccum = 0

  private step(dt: number, input: FlockInput, obstacles: Obstacle[]): void {
    this.time += dt

    // shared intent point chases the cursor — collective reaction delay
    const ik = 1 - Math.exp(-TUNING.intentLerp * dt)
    this.intentX += (input.intentX - this.intentX) * ik
    this.intentY += (input.intentY - this.intentY) * ik

    // gather/spread axis — quick to respond, slow to relax (shape memory)
    const formTarget = input.gather ? 1 : input.spread ? -1 : 0
    const formRate = formTarget === 0 ? TUNING.formLerpRelease : TUNING.formLerpAttack
    this.form += (formTarget - this.form) * (1 - Math.exp(-formRate * dt))
    const f = this.form
    const gather = Math.max(f, 0)
    const spread = Math.max(-f, 0)

    const sepRadius =
      f >= 0
        ? lerp(TUNING.sepRadiusNeutral, TUNING.sepRadiusGather, gather)
        : lerp(TUNING.sepRadiusNeutral, TUNING.sepRadiusSpread, spread)
    // neutral flocks cohere loosely (big living cloud); gathering multiplies pull
    const wCoh = TUNING.wCohesion * lerp(0.35, 1, Math.abs(f)) * (1 + gather * 2.1 - spread * 0.6)
    const wSep = TUNING.wSeparation * (1 + spread * 0.5 - gather * 0.25)
    const wInt = TUNING.wIntent * (1 + gather * 0.35)
    const wJit = TUNING.wJitter * (1 + spread * 0.9)

    this.rebuildGrid()
    this.updateMeanState()

    // flock heading for anisotropic gather (elongates along motion = ribbons/spears)
    const meanSpeed = Math.hypot(this.meanVX, this.meanVY) || 1
    const hx = this.meanVX / meanSpeed
    const hy = this.meanVY / meanSpeed

    const view2 = TUNING.viewRadius * TUNING.viewRadius
    const neighborIdx: number[] = []

    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]

      // --- gather neighbors from grid
      neighborIdx.length = 0
      this.nearby(b.x, b.y, neighborIdx)

      let cx = 0
      let cy = 0
      let avx = 0
      let avy = 0
      let n = 0
      let sepX = 0
      let sepY = 0
      for (const j of neighborIdx) {
        if (j === i) continue
        const o = this.birds[j]
        const dx = o.x - b.x
        const dy = o.y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 > view2) continue
        n++
        cx += o.x
        cy += o.y
        avx += o.vx
        avy += o.vy
        if (d2 < sepRadius * sepRadius && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          // capped 1/d: overlapping birds ease apart instead of popping
          const push = (1 - d / sepRadius) / Math.max(d, 12)
          sepX -= dx * push
          sepY -= dy * push
        }
      }

      let ax = 0
      let ay = 0

      if (n > 0) {
        cx /= n
        cy /= n
        // cohesion toward local centroid; when gathered, squeeze the axis
        // perpendicular to flock heading harder than along it (stream shapes)
        let gx = cx - b.x
        let gy = cy - b.y
        // neutral cloud is wider than tall: squash vertical offsets at every scale
        const neutralW = 1 - Math.abs(f)
        gx *= lerp(1, TUNING.envelopeXRelax, neutralW)
        gy *= lerp(1, TUNING.envelopeYSquash, neutralW)
        if (gather > 0.02) {
          const along = gx * hx + gy * hy
          const px = gx - along * hx
          const py = gy - along * hy
          const perpBoost = 1 + gather * 2.6
          const alongDamp = 1 - gather * 0.82
          gx = along * hx * alongDamp + px * perpBoost
          gy = along * hy * alongDamp + py * perpBoost
        }
        ax += gx * (wCoh / 100)
        ay += gy * (wCoh / 100)

        // alignment
        avx /= n
        avy /= n
        const as = Math.hypot(avx, avy)
        if (as > 1) {
          const bs = Math.hypot(b.vx, b.vy) || 1
          ax += (avx / as - b.vx / bs) * TUNING.wAlignment * (this.alignScale(f))
          ay += (avy / as - b.vy / bs) * TUNING.wAlignment * (this.alignScale(f))
        }

        ax += sepX * wSep
        ay += sepY * wSep
      }

      // --- cursor intent (per-bird delayed copy: front reacts before the tail,
      //     laggards whip around late on sharp reversals)
      const bk = 1 - Math.exp(-b.intentLagRate * dt)
      b.myIntentX += (this.intentX - b.myIntentX) * bk
      b.myIntentY += (this.intentY - b.myIntentY) * bk
      const ix = b.myIntentX - b.x
      const iy = b.myIntentY - b.y
      const idist = Math.hypot(ix, iy)
      if (idist > 8) {
        const pull = Math.min(idist / 240, 1.25) * wInt * b.intentResponse
        ax += (ix / idist) * pull
        ay += (iy / idist) * pull
      }

      // --- weak global pull toward the flock centroid (anti-fragmentation / reunion)
      // The envelope is a living ellipse: wider than tall at neutral, and
      // stretched along the direction of travel when gathered (streams/spears).
      const neutralAmt = 1 - Math.abs(f)
      let gcx: number
      let gcy: number
      if (gather > 0.02) {
        const rx = this.centerX - b.x
        const ry = this.centerY - b.y
        const along = (rx * hx + ry * hy) * lerp(1, 0.28, gather)
        const perp = (-rx * hy + ry * hx) * lerp(1, 2.6, gather)
        gcx = along * hx - perp * hy
        gcy = along * hy + perp * hx
      } else {
        gcx = (this.centerX - b.x) * lerp(1, TUNING.envelopeXRelax, neutralAmt)
        gcy = (this.centerY - b.y) * lerp(1, TUNING.envelopeYSquash, neutralAmt)
      }
      const gcd = Math.hypot(gcx, gcy)
      let homeR =
        f >= 0
          ? lerp(TUNING.homeRadiusNeutral, TUNING.homeRadiusGather, gather)
          : lerp(TUNING.homeRadiusNeutral, TUNING.homeRadiusSpread, spread)

      // A murmuration is not an ellipse: it packs at the leading edge and
      // streams out behind. Birds *behind* the centroid get a much longer
      // leash (the tail); birds ahead of it get reined in (the dense front).
      const alongOff = (b.x - this.centerX) * hx + (b.y - this.centerY) * hy
      const tailAmt = alongOff < 0 ? 1 : 0
      homeR *= lerp(TUNING.leadTighten, TUNING.tailStretch, tailAmt)
      // per-bird leash variation ragged-edges the boundary instead of
      // cutting every bird off at the same clean radius
      homeR *= b.homeBias

      if (gcd > homeR) {
        const homePull = Math.min((gcd - homeR) * TUNING.wHome, TUNING.homeMax)
        ax += (gcx / gcd) * homePull
        ay += (gcy / gcd) * homePull
      }

      // --- internal circulation: each bird carries a lazy orbital tendency
      // around the local mass, so the cloud churns instead of freezing
      if (gcd > 1) {
        const swirl = TUNING.wSwirl * b.orbitBias * (1 - gather * 0.7)
        ax += (-gcy / gcd) * swirl
        ay += (gcx / gcd) * swirl
      }

      // --- organic jitter (perpendicular flutter, stronger at edges/spread/panic)
      const bs = Math.hypot(b.vx, b.vy) || 1
      const jitter =
        Math.sin(this.time * b.flapFreq * 0.6 + b.flapPhase * 3.1) *
        wJit *
        b.edginess *
        (1 + b.panic * 1.4)
      ax += (-b.vy / bs) * jitter
      ay += (b.vx / bs) * jitter

      // --- obstacle avoidance
      for (const o of obstacles) {
        const res = avoidSteer(o, b.x, b.y, b.vx, b.vy, b.sidePref, this.centerY)
        if (!res) continue
        // brittle curtains barely repel — a committed flock flies into them
        const kindScale = o.kind === 'brittle' ? 0.22 : 1
        const power = TUNING.wAvoid * kindScale * res.urgency * res.urgency
        ax += res.fx * power
        ay += res.fy * power
        if (res.urgency > 0.75) b.panic = Math.min(1, b.panic + dt * 3)
        if (res.inside) {
          if (o.kind === 'brittle') this.breakthroughHits.push({ bird: b, obstacle: o })
          else this.collisions.push(b)
          // hard positional correction so birds never sink into solids
          const field = obstacleField(o, b.x, b.y)
          b.x += field.nx * (-field.dist + 2)
          b.y += field.ny * (-field.dist + 2)
        }
      }

      // --- integrate with capped accel (this is the inertia)
      const maxA = TUNING.maxAccel * b.agility * (1 + gather * 0.22)
      const am = Math.hypot(ax, ay)
      if (am > maxA) {
        ax = (ax / am) * maxA
        ay = (ay / am) * maxA
      }
      b.vx += ax * dt
      b.vy += ay * dt

      // --- speed shepherding toward cruise (chasing a far cursor speeds birds up)
      const chase = Math.min(Math.max(idist - 200, 0) / 500, 1) * 0.45
      const cruise =
        TUNING.cruiseSpeed *
        b.speedFactor *
        (1 + chase + gather * TUNING.gatherSpeedBoost - spread * TUNING.spreadSpeedDrag)
      const sp = Math.hypot(b.vx, b.vy) || 1
      const targetSp = clamp(
        sp + (cruise - sp) * (1 - Math.exp(-2.2 * dt)),
        TUNING.minSpeed,
        TUNING.maxSpeed,
      )
      b.vx = (b.vx / sp) * targetSp
      b.vy = (b.vy / sp) * targetSp

      b.x += b.vx * dt
      b.y += b.vy * dt
      b.panic = Math.max(0, b.panic - dt * 1.4)
    }
  }

  private render(dt: number): void {
    const rk = 1 - Math.exp(-9 * dt)
    for (const b of this.birds) {
      const s = b.sprite
      s.x = b.x
      s.y = b.y
      // smoothed heading: velocity noise never reaches the eye
      const target = Math.atan2(b.vy, b.vx)
      b.renderAngle += wrapAngle(target - b.renderAngle) * rk
      s.rotation = b.renderAngle
      const key = birdFrameKey(this.time, b.flapPhase, b.flapFreq)
      if (s.texture.key !== key) s.setTexture(key)
      // faint breathing keeps silhouettes from feeling stamped
      const flap = Math.sin(this.time * b.flapFreq + b.flapPhase)
      s.scaleY = this.scale * b.depth * (0.94 + 0.08 * flap)
      s.scaleX = this.scale * b.depth
    }
  }

  private alignScale(f: number): number {
    // spread flocks align noticeably less (loose, independent edges)
    return 1 - Math.max(-f, 0) * 0.5
  }

  private updateMeanState(): void {
    let sx = 0
    let sy = 0
    let svx = 0
    let svy = 0
    for (const b of this.birds) {
      sx += b.x
      sy += b.y
      svx += b.vx
      svy += b.vy
    }
    const n = this.birds.length || 1
    this.centerX = sx / n
    this.centerY = sy / n
    this.meanVX = svx / n
    this.meanVY = svy / n
  }

  private rebuildGrid(): void {
    this.grid.map.clear()
    const c = this.grid.cell
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      const key = gridKey(Math.floor(b.x / c), Math.floor(b.y / c))
      let arr = this.grid.map.get(key)
      if (!arr) {
        arr = []
        this.grid.map.set(key, arr)
      }
      arr.push(i)
    }
  }

  private nearby(x: number, y: number, out: number[]): void {
    const c = this.grid.cell
    const gx = Math.floor(x / c)
    const gy = Math.floor(y / c)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = this.grid.map.get(gridKey(gx + dx, gy + dy))
        if (arr) for (const i of arr) out.push(i)
      }
    }
  }
}

function gridKey(x: number, y: number): number {
  return (x + 4096) * 16384 + (y + 4096)
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}
