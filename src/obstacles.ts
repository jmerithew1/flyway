/**
 * Obstacle primitives for the flock world.
 * Kept engine-agnostic (plain data + math) so the sim stays testable and simple.
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

export interface AvoidResult {
  // Steering push (unit-ish direction * urgency 0..1)
  fx: number
  fy: number
  urgency: number
  inside: boolean
  obstacle: Obstacle
}

/**
 * Distance info from a point to an obstacle:
 * returns vector from closest surface point toward the query point and signed distance
 * (negative = inside).
 */
export function obstacleField(o: Obstacle, px: number, py: number): { nx: number; ny: number; dist: number } {
  if (o.shape === 'circle') {
    const dx = px - o.x
    const dy = py - o.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-6) return { nx: 1, ny: 0, dist: -o.r }
    return { nx: dx / d, ny: dy / d, dist: d - o.r }
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
    let nx: number
    let ny: number
    if (d > 1e-6) {
      nx = (cx * Math.sign(dx || 1)) / d
      ny = (cy * Math.sign(dy || 1)) / d
    } else {
      nx = Math.sign(dx || 1)
      ny = 0
    }
    return { nx, ny, dist: d }
  }
  // inside: push out along smallest penetration axis
  if (qx > qy) {
    return { nx: Math.sign(dx || 1), ny: 0, dist: qx }
  }
  return { nx: 0, ny: Math.sign(dy || 1), dist: qy }
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
 * Anticipatory avoidance steering for one bird against one obstacle.
 * sidePref biases which way a bird slides around a head-on obstacle,
 * which is what makes flock splits organic.
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
  if (o.broken) return null
  const now = obstacleField(o, px, py)
  const ax = px + vx * AVOID.lookahead
  const ay = py + vy * AVOID.lookahead
  const ahead = obstacleField(o, ax, ay)
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
  // grazing contact is forgiven; only real penetration counts as a collision
  return { fx: fx / m, fy: fy / m, urgency, inside: now.dist < -7, obstacle: o }
}
