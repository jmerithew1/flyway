import { describe, it, expect } from 'vitest'
import {
  AVOID,
  avoidSteer,
  avoidSteerInto,
  createAvoidResult,
  createFieldSample,
  obstacleField,
  obstacleFieldInto,
} from './obstacles'
import type { Obstacle, RectObstacle } from './obstacles'

/**
 * `obstacles.ts` is the hottest code in the game — per bird, per nearby
 * obstacle, every fixed step, up to six steps a frame, at 120 birds. It was
 * rewritten to fill caller-owned scratch structs instead of returning fresh
 * literals, which removed the largest single source of the GC stutter that read
 * as "choppy" (measured: 2,191 objects/frame → 0).
 *
 * That rewrite bought its speed with an ALIASING CONTRACT: the returned object
 * is a shared buffer that the next call overwrites. The contract is invisible
 * in the types and catastrophic if broken — a caller that stores the result
 * gets a value that mutates underneath it. These tests pin it down so it cannot
 * be broken by someone who did not know it existed.
 */

const box = (x: number, y: number, hw: number, hh: number): RectObstacle => ({
  shape: 'rect',
  kind: 'solid',
  x,
  y,
  hw,
  hh,
  broken: false,
})

/** Straight-ahead flight into a wall: the case avoidance exists for. */
const steerAt = (o: Obstacle, px: number, out = createAvoidResult()) =>
  avoidSteerInto(o, px, 300, 200, 0, 0, undefined, out)

describe('the aliasing contract', () => {
  it('obstacleField hands back the SAME buffer every call', () => {
    const a = obstacleField(box(100, 100, 40, 40), 90, 100)
    const b = obstacleField(box(500, 500, 40, 40), 490, 500)
    expect(a).toBe(b) // identity, not equality: this IS the contract
  })

  it('a stored sample is overwritten by the next call — the trap being documented', () => {
    const held = obstacleField(box(100, 300, 40, 40), 50, 300)
    const distNear = held.dist
    obstacleField(box(5000, 300, 40, 40), 50, 300)
    // the same object now describes a completely different obstacle
    expect(held.dist).not.toBeCloseTo(distNear, 3)
  })

  it('the *Into form writes only the buffer it was handed', () => {
    const mine = createFieldSample()
    const theirs = createFieldSample()
    const before = { ...theirs }
    obstacleFieldInto(box(100, 300, 40, 40), 50, 300, mine)
    expect(theirs).toEqual(before)
  })

  it('avoidSteerInto returns the caller buffer rather than allocating', () => {
    const out = createAvoidResult()
    const r1 = steerAt(box(300, 300, 60, 60), 150, out)
    const r2 = steerAt(box(300, 300, 60, 60), 160, out)
    expect(r1).toBe(out)
    expect(r2).toBe(out)
  })
})

describe('the distance field', () => {
  it('reports a true signed distance outside a rect', () => {
    const s = obstacleField(box(300, 300, 50, 50), 200, 300)
    // 100px from centre, 50px half-width → 50px of clear air
    expect(s.dist).toBeCloseTo(50, 1)
  })

  it('goes negative inside the rect, so "inside" is expressible', () => {
    const s = obstacleField(box(300, 300, 50, 50), 300, 300)
    expect(s.dist).toBeLessThan(0)
  })

  it('the surface normal points away from the obstacle', () => {
    const s = obstacleField(box(300, 300, 50, 50), 200, 300)
    expect(s.nx).toBeLessThan(0) // sampled to the left → pushed further left
    expect(Math.abs(s.ny)).toBeLessThan(0.001)
  })
})

describe('avoidance behaviour', () => {
  it('steers when flying straight at stone', () => {
    const out = createAvoidResult()
    const r = steerAt(box(300, 300, 60, 60), 180, out)
    expect(r).not.toBeNull()
    expect(Math.hypot(out.fx, out.fy)).toBeGreaterThan(0)
    expect(out.urgency).toBeGreaterThan(0)
  })

  it('ignores stone already behind the bird', () => {
    expect(steerAt(box(50, 300, 40, 40), 800)).toBeNull()
  })

  it('ignores BROKEN stone — burst pieces must stop steering the flock', () => {
    const b = box(300, 300, 60, 60)
    b.broken = true
    expect(steerAt(b, 180)).toBeNull()
  })

  it('urgency rises as the wall gets closer, and saturates at 1', () => {
    // The ramp is short: lookahead 0.62 at 200px/s is ~124px, plus a 60px
    // margin. Sampling both ends inside that window is the only way to see the
    // gradient — a first draft compared two points that had both already
    // clamped, and read 1 > 1.
    const far = createAvoidResult()
    const mid = createAvoidResult()
    steerAt(box(300, 300, 60, 60), 60, far)
    steerAt(box(300, 300, 60, 60), 120, mid)
    expect(mid.urgency).toBeGreaterThan(far.urgency)
    const touching = createAvoidResult()
    steerAt(box(300, 300, 60, 60), 235, touching)
    expect(touching.urgency).toBeCloseTo(1, 3)
  })

  it('the legacy wrapper agrees with the *Into form exactly', () => {
    const out = createAvoidResult()
    steerAt(box(300, 300, 60, 60), 180, out)
    const legacy = avoidSteer(box(300, 300, 60, 60), 180, 300, 200, 0, 0, undefined)
    expect(legacy).not.toBeNull()
    expect(legacy!.fx).toBeCloseTo(out.fx, 6)
    expect(legacy!.fy).toBeCloseTo(out.fy, 6)
    expect(legacy!.urgency).toBeCloseTo(out.urgency, 6)
  })
})

describe('the shipped tuning', () => {
  it('AVOID holds the values the difficulty contract was measured against', () => {
    // tools/pilot.py proves both sides of the contract at these numbers. If
    // they move, that gate has to be re-run — this test is the reminder.
    expect(AVOID.lookahead).toBeCloseTo(0.62, 3)
    expect(AVOID.margin).toBe(60)
  })
})
