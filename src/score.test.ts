import { describe, it, expect } from 'vitest'
import { HarvestChain, MASTERY_MAX, MASTERY_START, ScoreBook } from './score'

/**
 * The harvest chain is the most frequent action in the game — 179 motes a run —
 * and it was the reward that paid nothing. Every test here corresponds to a
 * defect that shipped: a multiplier that evaporated exactly when it was earned,
 * a chain a collision could not break, and a "clean in a row" counter that was
 * really counting motes.
 */

describe('the harvest chain', () => {
  it('starts empty and pays no multiplier', () => {
    const h = new HarvestChain()
    expect(h.count).toBe(0)
    expect(h.collect(1, 0.5)).toBeCloseTo(1, 3)
  })

  it('pays more as the chain grows', () => {
    const h = new HarvestChain()
    let last = 0
    for (let i = 0; i < 20; i++) {
      const m = h.collect(1, 0.5)
      expect(m).toBeGreaterThanOrEqual(last)
      last = m
    }
    expect(last).toBeGreaterThan(1)
  })

  it('lapses when the window runs out, and reports what was lost', () => {
    const h = new HarvestChain()
    for (let i = 0; i < 7; i++) h.collect(1, 0.5)
    expect(h.tick(0.1)).toBe(0) // still inside the window
    const lapsed = h.tick(99)
    expect(lapsed).toBe(7)
    expect(h.count).toBe(0)
  })

  it('a BREAK is not a lapse — stone must be able to take the chain', () => {
    // `endMoteChain(true)` existed and was never called from anywhere, so you
    // could smash into stone mid-arc and a 12-chain sailed on untouched.
    const h = new HarvestChain()
    for (let i = 0; i < 12; i++) h.collect(1, 0.5)
    expect(h.breakNow()).toBe(12)
    expect(h.count).toBe(0)
  })

  it('records the best chain of the run', () => {
    const h = new HarvestChain()
    for (let i = 0; i < 9; i++) h.collect(1, 0.5)
    h.breakNow()
    for (let i = 0; i < 4; i++) h.collect(1, 0.5)
    expect(h.best).toBe(9)
  })

  it('spill is zero while daylight has room, and rises once it is capped', () => {
    // THE DEFECT THIS PINS: daylight caps at 1.0 and the route is ~4.7x
    // oversupplied, so for most of a good run a x3 chain paid EXACTLY what a x1
    // chain paid. `spill` is what lets the surplus be paid in something else;
    // if it ever reads 0 at full daylight the multiplier is decorative again.
    const h = new HarvestChain()
    for (let i = 0; i < 15; i++) h.collect(1, 0.2)
    const hungry = h.spill
    for (let i = 0; i < 15; i++) h.collect(1, 1)
    expect(h.spill).toBeGreaterThan(hungry)
  })
})

describe('mastery', () => {
  it('starts at the documented floor and never exceeds the ceiling', () => {
    const s = new ScoreBook()
    expect(s.mastery).toBeCloseTo(MASTERY_START, 3)
    for (let i = 0; i < 500; i++) s.award('mob')
    expect(s.mastery).toBeLessThanOrEqual(MASTERY_MAX)
  })

  it('light pays per COMPLETED chain, not per mote', () => {
    // It used to pay 0.02 per mote: 179 motes x 0.02 = +3.58 of a 4.00 range,
    // so simply touching the light nearly maxed the multiplier and everything
    // requiring actual skill became a rounding error inside it.
    const s = new ScoreBook()
    const before = s.mastery
    for (let i = 0; i < 30; i++) s.collectLight(1, 0.5)
    expect(s.mastery, 'collecting alone must not move mastery').toBeCloseTo(before, 3)
  })

  it('a stumble costs the streak', () => {
    const s = new ScoreBook()
    for (let i = 0; i < 4; i++) s.award('flow')
    expect(s.stumble()).toBeGreaterThan(0)
    expect(s.stumble()).toBe(0)
  })
})

describe('checkpoint rewind', () => {
  it('carries the run records but clears the live chain', () => {
    // A checkpoint costs you the arc you were part-way through; it is not an
    // eraser for the whole run.
    const s = new ScoreBook()
    for (let i = 0; i < 11; i++) s.collectLight(1, 0.5)
    const snap = s.snapshot()
    for (let i = 0; i < 3; i++) s.collectLight(1, 0.5)
    s.restore(snap)
    expect(s.harvest.count).toBe(0)
    expect(s.harvest.best).toBe(11)
  })

  it('restores mastery to the checkpoint value', () => {
    const s = new ScoreBook()
    s.award('mob')
    const snap = s.snapshot()
    const at = s.mastery
    s.award('mob')
    s.award('mob')
    s.restore(snap)
    expect(s.mastery).toBeCloseTo(at, 5)
  })
})
