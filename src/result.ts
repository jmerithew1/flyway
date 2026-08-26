import { FLOCK_STAR_RETURNED, FLOW_STAR_FRACTION } from './config'

/**
 * Clean flight-result record — the single shape both the results screen and
 * the future migration/campaign system consume. Nothing else reads DayScene
 * internals.
 */
export interface FlightResult {
  flightId: string
  startingBirds: number
  strayBirdsFound: number
  scatteredBirdsRecovered: number
  birdsPermanentlyLost: number
  birdsArrived: number
  perfectFlows: number
  totalFlowOpportunities: number
  collisionEvents: number
  checkpointsUsed: number
  homeFeather: boolean
  flockFeather: boolean
  flowFeather: boolean
  /** two-currency score, filled by the Day scene when the flight ends */
  score?: number
  scoreBySource?: Record<string, number>
  bestStreak?: number
  secondsSaved?: number
}

/** FLOW measures clean navigation, not survival: flows AND few collisions. */
export const FLOW_COLLISION_CAP = 15

export function scoreFeathers(r: Omit<FlightResult, 'homeFeather' | 'flockFeather' | 'flowFeather'>): FlightResult {
  const flowNeeded = Math.max(1, Math.ceil(r.totalFlowOpportunities * FLOW_STAR_FRACTION))
  return {
    ...r,
    homeFeather: true, // producing a result at all means the roost was reached
    flockFeather: r.birdsArrived >= FLOCK_STAR_RETURNED,
    flowFeather: r.perfectFlows >= flowNeeded && r.collisionEvents <= FLOW_COLLISION_CAP,
  }
}

const bestKey = (flightId: string) => `flyway-best-${flightId}`

/** Persist and return the best result for a flight (by birds, then flows). */
export function recordBest(result: FlightResult): FlightResult | null {
  try {
    const prevRaw = localStorage.getItem(bestKey(result.flightId))
    const prev = prevRaw ? (JSON.parse(prevRaw) as FlightResult) : null
    const better =
      !prev ||
      (result.score ?? 0) > (prev.score ?? 0) ||
      ((result.score ?? 0) === (prev.score ?? 0) && result.birdsArrived > prev.birdsArrived)
    if (better) {
      localStorage.setItem(bestKey(result.flightId), JSON.stringify(result))
      return prev
    }
    return prev
  } catch {
    return null
  }
}
