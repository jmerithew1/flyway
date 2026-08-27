/**
 * Obstacle primitives for the flock world.
 * Kept engine-agnostic (plain data + math) so the sim stays testable and simple.
 *
 * ALLOCATION NOTE (read before editing anything below).
 * These two functions run per-bird x per-near-obstacle, every frame. At 120-220
 * birds that is thousands of calls a frame, and every object literal returned
 * from here is dead within microseconds. A profile put ~3.1 MB of garbage per 60
 * frames on the game, and the GC pauses that collects are exactly what the owner
 * feels as "choppy" - so the sim's inner loop is now a strict no-allocation zone.
 * Everything here fills a reusable struct instead of returning a fresh one. If
 * you add a helper in this file, give it the same shape.
 */

// 'soft' = brush-through vegetation: slows and rustles, never removes a bird
export type ObstacleKind = 'solid' | 'brittle' | 'soft'

export interface CircleObstacle {
  shape: 'circle'
  kind: ObstacleKind
  x: number
  y: number
  r: number
  broken?: boolean
}

export interface RectObstacle {
  shape: 'rect'
  kind: ObstacleKind
  x: number // center
  y: number // center
  hw: number // half width
  hh: number // half height
  broken?: boolean
}

export type Obstacle = CircleObstacle | RectObstacle

/**
 * One sample of the distance field around an obstacle. Named so it can be
 * declared once and refilled forever rather than minted per query.
 */
export interface FieldSample {
  nx: number
  ny: number
  dist: number
}

export interface AvoidResult {
  // Steering push (unit-ish direction * urgency 0..1)
  fx: number
  fy: number
  urgency: number
  inside: boolean
  obstacle: Obstacle
}

/** A blank obstacle to seed scratch results with; never read, never steered against. */
const NULL_OBSTACLE: CircleObstacle = { shape: 'circle', kind: 'solid', x: 0, y: 0, r: 0 }

/** Fresh scratch buffers for callers that want their own (e.g. to hold a result across a call). */
export function createFieldSample(): FieldSample {
  return { nx: 0, ny: 0, dist: 0 }
}
export function createAvoidResult(): AvoidResult {
  return { fx: 0, fy: 0, urgency: 0, inside: false, obstacle: NULL_OBSTACLE }
}

/**
 * Distance info from a point to an obstacle, written into a caller-owned struct:
 * vector from closest surface point toward the query point, and signed distance
 * (negative = inside). Returns `out` so it still reads as an expression.
 *
 * Both branches are exact signed distance functions of their shape, which
 * `avoidSteerInto` leans on to skip work - keep them exact if you touch them.
 */
export function obstacleFieldInto(o: Obstacle, px: number, py: number, out: FieldSample): FieldSample {
  if (o.shape === 'circle') {
    const dx = px - o.x
    const dy = py - o.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-6) {
      out.nx = 1
      out.ny = 0
      out.dist = -o.r
      return out
    }
    out.nx = dx / d
    out.ny = dy / d
    out.dist = d - o.r
    return out
  }
  // rect
  const dx = px - o.x
  const dy = py - o.y
  const qx = Math.abs(dx) - o.hw
  const qy = Math.abs(dy) - o.hh
  if (qx > 0 || qy > 0) {
    // outside: closest point on boundary
    const cx = Math.max(qx, 0)
    const cy = Math.max(qy, 0)
    const d = Math.hypot(cx, cy)
    if (d > 1e-6) {
      out.nx = (cx * Math.sign(dx || 1)) / d
      out.ny = (cy * Math.sign(dy || 1)) / d
    } else {
      out.nx = Math.sign(dx || 1)
      out.ny = 0
    }
    out.dist = d
    return out
  }
  // inside: push out along smallest penetration axis
  if (qx > qy) {
    out.nx = Math.sign(dx || 1)
    out.ny = 0
    out.dist = qx
    return out
  }
  out.nx = 0
  out.ny = Math.sign(dy || 1)
  out.dist = qy
  return out
}

/**
 * Shared scratch for the convenience wrappers below. Two field slots because a
 * single avoid query samples the field at two points (here, and where the bird
 * will be) and needs both alive at once.
 */
const scratchNow: FieldSample = createFieldSample()
const scratchAhead: FieldSample = createFieldSample()
const scratchAvoid: AvoidResult = createAvoidResult()
// Deliberately NOT one of the two above: the flock loop queries the field again
// inside the branch it took on an avoid result, and a shared buffer there would
// quietly overwrite the answer it is still acting on.
const scratchField: FieldSample = createFieldSample()

/**
 * Convenience form of `obstacleFieldInto`.
 *
 * IMPORTANT: the returned object is a SHARED module buffer, not a fresh one -
 * that is the whole point, and it is why the flock loop no longer churns the
 * heap. Read what you need out of it before the next call; if you need to keep a
 * sample around, pass your own struct to `obstacleFieldInto` instead.
 */
export function obstacleField(o: Obstacle, px: number, py: number): FieldSample {
  return obstacleFieldInto(o, px, py, scratchField)
}

// These were raised to 0.95s/92px to stop silhouette colliders over-punishing,
// and overshot catastrophically: an audit drove the full level with the pointer
// PARKED and no key ever pressed, and finished with 223 birds, zero collisions,
// at any altitude. The birds were solving the level by themselves - there was
// no game left. Avoidance must read as flock instinct, not as an autopilot:
// enough to make a murmuration feel alive around stone, not enough to route it.
/**
 * How far ahead a bird anticipates stone, and how much room it wants.
 *
 * This pair decides whether there is a game at all. At 0.95s/92px an audit
 * drove the entire level with the pointer PARKED and finished with 223 birds
 * and zero collisions - the flock solved it alone. At 0.5s/46px even a pilot
 * holding Gather 85% of the time died at x=12905. Mutable so the fairness
 * probe can sweep the space in one session rather than one rebuild per guess.
 */
export const AVOID = { lookahead: 0.62, margin: 60 }

/**
 * Anticipatory avoidance steering for one bird against one obstacle, written
 * into a caller-owned result. Returns `out` when the obstacle is close enough to
 * matter, or null when it can be ignored entirely.
 *
 * sidePref biases which way a bird slides around a head-on obstacle,
 * which is what makes flock splits organic.
 */
export function avoidSteerInto(
  o: Obstacle,
  px: number,
  py: number,
  vx: number,
  vy: number,
  sidePref: number,
  goalY: number | undefined,
  out: AvoidResult,
): AvoidResult | null {
  if (o.broken) return null
  const now = obstacleFieldInto(o, px, py, scratchNow)

  // Cheap exact reject before the second sample. Both shapes give a true signed
  // distance, so over one lookahead a bird can only close on the surface by the
  // distance it actually travels. If it is further outside the margin than it
  // could possibly fly in that time, the ahead sample cannot change the answer -
  // so skip it. Identical outcome, and it spares the far majority of pairs the
  // second field evaluation entirely.
  const slack = now.dist - AVOID.margin
  if (slack > 0) {
    const reach = AVOID.lookahead
    if (slack * slack > (vx * vx + vy * vy) * reach * reach) return null
  }

  const ax = px + vx * AVOID.lookahead
  const ay = py + vy * AVOID.lookahead
  const ahead = obstacleFieldInto(o, ax, ay, scratchAhead)
  const dist = Math.min(now.dist, ahead.dist)
  if (dist > AVOID.margin) return null

  const urgency = 1 - Math.max(dist, 0) / AVOID.margin
  // Base push: away from the surface (use the more urgent sample).
  const src = ahead.dist < now.dist ? ahead : now
  let fx = src.nx
  let fy = src.ny

  // Tangential slide: steer around, not just away. Pick the tangent that agrees
  // with current lateral offset; when nearly head-on, personality decides.
  const speed = Math.hypot(vx, vy)
  if (speed > 1) {
    const dirx = vx / speed
    const diry = vy / speed
    // lateral sign of the surface normal relative to travel direction
    let lateral = src.nx * -diry + src.ny * dirx
    if (Math.abs(lateral) < 0.25) {
      lateral += sidePref * 0.45
      // stragglers slide toward where the rest of the flock went (the gap)
      if (goalY !== undefined) lateral += Math.sign(goalY - py) * Math.sign(dirx || 1) * 0.35
    }
    const s = Math.sign(lateral || 1)
    // tangent perpendicular to travel dir
    const tx = -diry * s
    const ty = dirx * s
    const slide = 0.85
    fx = fx * (1 - slide * 0.5) + tx * slide
    fy = fy * (1 - slide * 0.5) + ty * slide
  }
  const m = Math.hypot(fx, fy) || 1
  out.fx = fx / m
  out.fy = fy / m
  out.urgency = urgency
  // grazing contact is forgiven; only real penetration counts as a collision
  out.inside = now.dist < -7
  out.obstacle = o
  return out
}

/**
 * Convenience form of `avoidSteerInto`.
 *
 * IMPORTANT: the returned object is a SHARED module buffer, reused by every
 * call. Consume it before the next query - the flock loop does, which is what
 * turned thousands of throwaway objects a frame into zero. Anything that wants
 * to stash a result must pass its own struct to `avoidSteerInto`.
 */
export function avoidSteer(
  o: Obstacle,
  px: number,
  py: number,
  vx: number,
  vy: number,
  sidePref: number,
  goalY?: number,
): AvoidResult | null {
  return avoidSteerInto(o, px, py, vx, vy, sidePref, goalY, scratchAvoid)
}
