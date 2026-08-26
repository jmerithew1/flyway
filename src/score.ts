/**
 * Scoring you can hold in your head.
 *
 *     SCORE = BIRDS HOME  ×  MASTERY
 *
 * Both terms are things the player already watches. Birds are the counter in
 * the corner and the whole fantasy of the game. Mastery is a single visible
 * multiplier that skilled flying raises and collisions knock back — so the
 * question "am I doing well?" has one answer instead of nine.
 *
 * There are no abstract point values to learn, and nothing pays you for
 * failing: recovering a bird you scattered yourself restores the bird, which
 * is its own reward, and does not raise mastery.
 */

export type MasteryEvent = 'flow' | 'cleanPass' | 'breakthrough' | 'mob' | 'light'

/** How much each act of skill lifts the multiplier. */
export const MASTERY_GAIN: Record<MasteryEvent, number> = {
  flow: 0.3, // a whole passage flown clean and controlled
  cleanPass: 0.1, // threading one real opening without losses
  breakthrough: 0.15, // bursting a brittle curtain
  mob: 0.5, // driving the falcon off
  light: 0.02, // a mote of the old flyway
}

export const MASTERY_LABEL: Record<MasteryEvent, string> = {
  flow: 'PERFECT FLOW',
  cleanPass: 'CLEAN PASS',
  breakthrough: 'BREAKTHROUGH',
  mob: 'THE FLOCK FIGHTS BACK',
  light: 'LIGHT',
}

/** A collision costs this much multiplier — always less than one clean pass,
 * so a mistake is a setback, never a spiral. */
export const MASTERY_PENALTY = 0.08

export const MASTERY_START = 1
export const MASTERY_MAX = 5

/** Flying the day quickly is worth a little mastery, paid once at the roost. */
export const NIGHTFALL_PAR = 200
export const NIGHTFALL_GAIN_PER_10S = 0.05

export interface MasteryTick {
  event: MasteryEvent
  gain: number
  label: string
  mastery: number
}

export class ScoreBook {
  /** the live multiplier — shown in the HUD all flight */
  mastery = MASTERY_START
  /** highest it reached, for the results screen */
  bestMastery = MASTERY_START
  /** what each kind of skill contributed, for the results breakdown */
  gains: Partial<Record<MasteryEvent, number>> = {}
  /** how many of each happened — the ceremony counts them back */
  counts: Partial<Record<MasteryEvent, number>> = {}
  /** total multiplier lost to collisions */
  lostToCollisions = 0
  /** consecutive clean skill events (no collision between them) */
  chain = 0
  bestChain = 0

  /** Record an act of skill. Returns what to show, or null if it scored none. */
  award(event: MasteryEvent, count = 1): MasteryTick | null {
    if (count <= 0) return null
    const gain = MASTERY_GAIN[event] * count
    this.mastery = Math.min(MASTERY_MAX, this.mastery + gain)
    this.gains[event] = (this.gains[event] ?? 0) + gain
    this.counts[event] = (this.counts[event] ?? 0) + count
    this.chain += count
    this.bestChain = Math.max(this.bestChain, this.chain)
    this.bestMastery = Math.max(this.bestMastery, this.mastery)
    return { event, gain, label: MASTERY_LABEL[event], mastery: this.mastery }
  }

  /** A collision: mastery slips and the chain ends. Returns the chain lost. */
  stumble(): number {
    const had = this.chain
    this.chain = 0
    const before = this.mastery
    this.mastery = Math.max(MASTERY_START, this.mastery - MASTERY_PENALTY)
    this.lostToCollisions += before - this.mastery
    return had
  }

  /** Arriving early is worth a little more mastery. */
  awardNightfall(secondsSaved: number): number {
    if (secondsSaved <= 0) return 0
    const gain = (secondsSaved / 10) * NIGHTFALL_GAIN_PER_10S
    this.mastery = Math.min(MASTERY_MAX, this.mastery + gain)
    this.bestMastery = Math.max(this.bestMastery, this.mastery)
    return gain
  }

  /** The whole game in one line: the flock you brought, times how you flew. */
  finalScore(birdsHome: number): number {
    return Math.round(birdsHome * this.mastery)
  }

  snapshot() {
    return {
      mastery: this.mastery,
      bestMastery: this.bestMastery,
      gains: { ...this.gains },
      counts: { ...this.counts },
      lostToCollisions: this.lostToCollisions,
      chain: this.chain,
      bestChain: this.bestChain,
    }
  }

  restore(s: ReturnType<ScoreBook['snapshot']>): void {
    this.mastery = s.mastery
    this.bestMastery = s.bestMastery
    this.gains = { ...s.gains }
    this.counts = { ...s.counts }
    this.lostToCollisions = s.lostToCollisions
    this.chain = s.chain
    this.bestChain = s.bestChain
  }
}
