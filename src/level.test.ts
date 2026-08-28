import { describe, it, expect } from 'vitest'
import { ART } from './artManifest'
import {
  FEATURES,
  GROUND,
  MOTE_ARCS,
  ROOST_X,
  STRAYS,
  buildObstacles,
  pacingReport,
  passableGaps,
  pieceDisplay,
  pieceObstacles,
} from './level'

/**
 * The level is data, and every bug it has ever had was a data bug that no type
 * could catch: art keys pointing at deleted files, colliders contradicting
 * painted openings, encounters stacked at the same x, decor that was supposed
 * to be inert quietly handing out awards. Each test here corresponds to a
 * defect that actually shipped.
 */

describe('every placement is real', () => {
  it('names an art key that exists in the manifest', () => {
    // 86 of 100 manifest entries once pointed at .png files that had been
    // deleted, and `ART[key]` being undefined crashed `pieceScale` at module
    // load — a black screen, twice.
    const missing = FEATURES.filter((f) => !ART[f.art]).map((f) => `${f.x}:${f.art}`)
    expect(missing).toEqual([])
  })

  it('gives every piece a positive display size', () => {
    for (const f of FEATURES) {
      const d = pieceDisplay(f)
      expect(d.w, `${f.art} @ ${f.x}`).toBeGreaterThan(0)
      expect(d.h, `${f.art} @ ${f.x}`).toBeGreaterThan(0)
    }
  })

  it('places nothing past the roost', () => {
    for (const f of FEATURES) expect(f.x, `${f.art}`).toBeLessThanOrEqual(ROOST_X)
  })
})

describe('scenery is inert, and only scenery', () => {
  it('decor pieces contribute no colliders at all', () => {
    // "Never collided with" has to mean never INTERACTIVE. Decor skipped
    // collider generation but still registered opening zones, which handed out
    // four free clean-pass awards a run at zero risk.
    for (const f of FEATURES.filter((p) => p.decor)) {
      expect(pieceObstacles(f), `${f.art} @ ${f.x}`).toHaveLength(0)
    }
  })

  it('no decor piece claims a flow gate', () => {
    expect(FEATURES.filter((f) => f.decor && f.flow)).toEqual([])
  })

  it('buildObstacles omits decor entirely', () => {
    const { byFeature } = buildObstacles()
    for (const f of FEATURES.filter((p) => p.decor)) {
      expect(byFeature.get(f) ?? []).toHaveLength(0)
    }
  })

  it('still builds real colliders for the pieces that ARE solid', () => {
    const { obstacles } = buildObstacles()
    expect(obstacles.length).toBeGreaterThan(50)
  })
})

describe('the flight lane', () => {
  // The band the murmuration actually occupies in normal flight.
  const LANE_TOP = 330
  const LANE_BOT = 560

  const asks = (f: (typeof FEATURES)[number]): 'over' | 'under' | 'none' => {
    const d = pieceDisplay(f)
    const top = d.y - d.h / 2
    const bot = d.y + d.h / 2
    if (bot < LANE_TOP || top > LANE_BOT) return 'none'
    return f.mount === 'top' ? 'under' : 'over'
  }

  it('asks the player to fly UNDER, not only over', () => {
    // Measured baseline before this was fixed: 38 over, 6 thread, ZERO under —
    // every top-mounted piece hung entirely above the lane, so the vertical
    // axis of the game did not exist.
    const live = FEATURES.filter((f) => !f.decor)
    const under = live.filter((f) => asks(f) === 'under').length
    expect(under).toBeGreaterThan(5)
  })

  it('does not fill the level with pieces that ask nothing', () => {
    const live = FEATURES.filter((f) => !f.decor)
    const inert = live.filter((f) => asks(f) === 'none').length
    expect(inert / live.length).toBeLessThan(0.3)
  })

  it('leaves a passable gap wherever it places solid stone', () => {
    // A piece that seals the lane is unwinnable terrain. Sampled across the
    // whole flight rather than per-piece, because pieces overlap.
    const { obstacles } = buildObstacles()
    const sealed: number[] = []
    for (let x = 200; x < ROOST_X; x += 250) {
      if (passableGaps(x, obstacles).length === 0) sealed.push(x)
    }
    expect(sealed).toEqual([])
  })
})

describe('composition', () => {
  it('reports no pacing violations', () => {
    expect(pacingReport().violations).toEqual([])
  })

  it('keeps the light supply on the route, not above the ceiling', () => {
    for (const a of MOTE_ARCS) {
      expect(a.y, `arc @ ${a.x}`).toBeGreaterThan(80)
      expect(a.y, `arc @ ${a.x}`).toBeLessThan(GROUND - 60)
    }
  })

  it('places every cage inside the world', () => {
    for (const s of STRAYS) {
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(ROOST_X)
      expect(s.count).toBeGreaterThan(0)
    }
  })
})
