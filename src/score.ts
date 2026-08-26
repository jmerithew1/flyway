/**
 * Two-currency scoring.
 *
 * SURVIVAL is what you bring home; MASTERY is how beautifully you flew. The
 * point values are tuned so a cautious bird-rich run and a stylish bird-poor
 * run land in the same range — topping the score needs both. Only mastery
 * events take the streak multiplier, so style compounds and hoarding doesn't.
 */

export type ScoreSource =
  | 'flow'
  | 'cleanPass'
  | 'breakthrough'
  | 'mob'
  | 'recovered'
  | 'found'
  | 'light'
  | 'birds'
  | 'nightfall'

export const POINTS: Record<ScoreSource, number> = {
  flow: 900, // a whole passage flown clean and controlled
  cleanPass: 260, // threading one real opening without losses
  breakthrough: 300, // bursting a brittle curtain
  mob: 1000, // driving the falcon off
  recovered: 15, // winning a scattered bird back — a rebate on your own
  // mistake, never a payday (audit: a sloppy run banked 2,250 here)
  found: 60, // a stray joining the flock
  light: 25, // a mote of the old flyway
  birds: 90, // per bird that reaches the roost
  nightfall: 20, // per second saved against par
}

/** Events that compound with the streak — style, not survival. */
const STREAKABLE: ReadonlySet<ScoreSource> = new Set(['flow', 'cleanPass', 'breakthrough', 'mob'])

/** Seconds of flight the "before nightfall" bonus measures against. */
export const NIGHTFALL_PAR = 200

export const SOURCE_LABEL: Record<ScoreSource, string> = {
  flow: 'PERFECT FLOW',
  cleanPass: 'CLEAN PASS',
  breakthrough: 'BREAKTHROUGH',
  mob: 'THE FLOCK FIGHTS BACK',
  recovered: 'RECOVERED',
  found: 'FOUND',
  light: 'LIGHT',
  birds: 'FLOCK HOME',
  nightfall: 'BEFORE NIGHTFALL',
}

export interface ScoreEvent {
  source: ScoreSource
  points: number
  multiplier: number
  label: string
}

export class ScoreBook {
  total = 0
  streak = 0
  /** running totals per source, for the results breakdown */
  bySource: Partial<Record<ScoreSource, number>> = {}
  /** the streak value at its highest this flight (a bragging stat) */
  bestStreak = 0

  /** Award one event. Returns what to show, or null if it scored nothing. */
  award(source: ScoreSource, count = 1): ScoreEvent | null {
    if (count <= 0) return null
    const base = POINTS[source] * count
    let multiplier = 1
    if (STREAKABLE.has(source)) {
      this.streak++
      this.bestStreak = Math.max(this.bestStreak, this.streak)
      multiplier = this.streakMultiplier()
    }
    const points = Math.round(base * multiplier)
    this.total += points
    this.bySource[source] = (this.bySource[source] ?? 0) + points
    return { source, points, multiplier, label: SOURCE_LABEL[source] }
  }

  /** Clean flying compounds: x2 from the 3rd link, x3 from the 6th, x4 from
   * the 10th. The top tier exists so mastery can out-run luck — the audit
   * measured run-to-run variance (1.79x) exceeding the whole skill gap. */
  streakMultiplier(): number {
    if (this.streak >= 10) return 4
    if (this.streak >= 6) return 3
    if (this.streak >= 3) return 2
    return 1
  }

  /** A collision breaks the chain. Returns true if a streak was actually lost. */
  breakStreak(): boolean {
    const had = this.streak >= 3
    this.streak = 0
    return had
  }

  snapshot(): { total: number; streak: number; bySource: Partial<Record<ScoreSource, number>>; bestStreak: number } {
    return { total: this.total, streak: this.streak, bySource: { ...this.bySource }, bestStreak: this.bestStreak }
  }

  restore(s: { total: number; streak: number; bySource: Partial<Record<ScoreSource, number>>; bestStreak: number }): void {
    this.total = s.total
    this.streak = s.streak
    this.bySource = { ...s.bySource }
    this.bestStreak = s.bestStreak
  }
}
