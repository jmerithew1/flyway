import { MOTE_CHAIN_WINDOW, MOTE_TIERS } from './config'

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
 *
 * ---------------------------------------------------------------------------
 * WHAT LIGHT PAYS FOR — and what it used to pay for
 *
 * Light used to award mastery PER MOTE, at 0.02 each. There are 179 motes and
 * the multiplier only spans 1..5, so simply touching all the light was worth
 * +3.58 of a 4.00 range: mastery measured ATTENDANCE, and the acts that are
 * actually hard (driving off the falcon, a whole passage flown clean) were
 * rounding errors inside it. It also meant the clean-streak counter — "N CLEAN
 * IN A ROW" — was really a mote counter, and 179 popups a run said LIGHT ×+0.02
 * until the words stopped meaning anything.
 *
 * Light now pays mastery ONCE PER CHAIN, scaled by the tier the chain reached.
 * Grazing a stray mote is worth nothing. A swept arc is worth real multiplier.
 * That is the same total budget aimed at the skill instead of at the count.
 */

export type MasteryEvent = 'flow' | 'cleanPass' | 'breakthrough' | 'mob' | 'light'

/** How much each act of skill lifts the multiplier. */
export const MASTERY_GAIN: Record<MasteryEvent, number> = {
  flow: 0.3, // a whole passage flown clean and controlled
  cleanPass: 0.1, // threading one real opening without losses
  breakthrough: 0.15, // bursting a brittle curtain
  mob: 0.5, // driving the falcon off
  // per TIER REACHED by a completed harvest chain, not per mote. A full
  // 13-arc run of tier-2/3 sweeps lands near +1.0 — a real share of the
  // multiplier, earned by sweeping, not by vacuuming.
  light: 0.03,
}

export const MASTERY_LABEL: Record<MasteryEvent, string> = {
  flow: 'PERFECT FLOW',
  cleanPass: 'CLEAN PASS',
  breakthrough: 'BREAKTHROUGH',
  mob: 'THE FLOCK FIGHTS BACK',
  light: 'LIGHT CHAINS',
}

/** A collision costs this much multiplier — always less than one clean pass,
 * so a mistake is a setback, never a spiral. */
export const MASTERY_PENALTY = 0.08

export const MASTERY_START = 1
export const MASTERY_MAX = 5

/** Flying the day quickly is worth a little mastery, paid once at the roost. */
export const NIGHTFALL_PAR = 200
export const NIGHTFALL_GAIN_PER_10S = 0.05

// ---------------------------------------------------------------- the harvest

/** Motes per tier. Five rungs of five, matching the pentatonic audio cycle. */
export const MOTE_TIER_STEP = 5
/** The highest tier index — MOTE_TIERS[4] is 'THE FLYWAY REMEMBERS'. */
export const MOTE_TIER_MAX = MOTE_TIERS.length - 1

/**
 * What a chain pays, per mote, in DAYLIGHT — which is not a score, it is the
 * distance between the flock and the dark. Skill buying survival is legitimate;
 * skill making the fog irrelevant is not, so this ladder is deliberately the
 * one already play-tested against the two-sided difficulty contract and is
 * NOT being raised. The chain's job is to make the same daylight arrive as a
 * rhythm you can lose, not to hand out more of it.
 */
export const MOTE_TIER_MULT = [1, 1.25, 1.6, 2, 3]

/**
 * Daylight one plain mote returns. MUST equal MOTE_GAIN in src/nightfall.ts —
 * it is duplicated here only because that constant is module-private, and the
 * chain cannot report what it wasted against the cap without knowing it. If
 * nightfall's number moves, move this one; better still, export it there and
 * import it here.
 */
export const MOTE_DAYLIGHT = 0.095

/** A chain of at least this many is worth mourning out loud when stone ends it. */
export const CHAIN_LOSS_FLOOR = 4
/** A chain that dies this close to your best reads as "so nearly". */
export const NEAR_MISS_BAND = 3

/** Why a chain ended. `none` = still running. */
export type ChainEnd = 'none' | 'lapsed' | 'broken'

/**
 * THE HARVEST CHAIN.
 *
 * One mote opens a window. Every mote inside the window raises the count, the
 * audio rung and the daylight paid — so a 14-mote arc swept in one spread pass
 * is a rising fourteen-note run that visibly shoves the fog backward, and the
 * same fourteen motes picked up one at a time over half a minute are fourteen
 * separate nothings. That difference is the entire reward loop of the most
 * frequent action in the game, and it is bought purely with WHEN you fly, not
 * with any extra content.
 *
 * Every method here returns a number or a boolean and mutates preallocated
 * fields. Nothing in this class allocates, because `tick` is on the per-frame
 * path and this project's worst measured defect was GC stutter.
 */
export class HarvestChain {
  /** motes in the live chain (0 = no chain running) */
  count = 0
  /** seconds of window left; > 0 exactly when a chain is live */
  window = 0
  /** 0..4, the named rung this chain has climbed to */
  tier = 0
  /** true for the one collect that crossed into a new tier — read and clear */
  tierRose = false
  /** daylight multiplier the last collect earned */
  pay = 1
  /**
   * The share of the last collect's BONUS that could not fit, because daylight
   * is capped at 1. Without this the multiplier silently evaporates exactly
   * when the player is flying best — see `collect`.
   */
  spill = 0

  /** longest chain this flight */
  best = 0
  /** longest chain the player has ever finished here (seeded from storage) */
  bestEver = 0
  /** true once this flight's best has passed the stored one */
  beatBestEver = false
  /** every mote taken this flight */
  harvested = 0
  /** how many motes the route holds, for a visible ladder */
  budget = 0
  /** chains that reached a named tier */
  chainsScored = 0
  /** chains stone took from you */
  chainsBroken = 0
  /** the longest chain a collision ended — the one that stings */
  worstBreak = 0
  /** the last ended chain's length and cause, for the readout */
  lastEnded = 0
  lastEnd: ChainEnd = 'none'
  /** the last break died within NEAR_MISS_BAND of your best */
  lastNearMiss = false

  /** Motes still out there, if the budget was declared. */
  get remaining(): number {
    return Math.max(0, this.budget - this.harvested)
  }

  /** 0..1 of the route's light actually taken — a bar that only ever fills. */
  get progress01(): number {
    return this.budget > 0 ? this.harvested / this.budget : 0
  }

  /** The name of the rung currently held ('' below the first). */
  get tierName(): string {
    return MOTE_TIERS[this.tier] ?? ''
  }

  /** How many more motes to the next rung; 0 at the top. */
  get toNextTier(): number {
    if (this.tier >= MOTE_TIER_MAX) return 0
    return (this.tier + 1) * MOTE_TIER_STEP - this.count
  }

  /** Tell the chain how much light the route holds (called once, at build). */
  setBudget(n: number): void {
    this.budget = n
  }

  /** Seed the cross-run target so a live chain can be measured against it. */
  setBestEver(n: number): void {
    this.bestEver = Math.max(0, Math.floor(n) || 0)
  }

  /**
   * One mote taken.
   *
   * `daylight01` is the meter BEFORE this mote lands. It is passed in so the
   * chain can report `spill`: daylight is clamped at 1, so once the meter is
   * near full a ×3 chain pays exactly what a ×1 chain pays and the reward the
   * player just earned disappears into the cap. `spill` is the fraction of the
   * bonus that had nowhere to go, and it is the caller's job to pay it in some
   * currency that is not capped — strain relief, banked momentum, mastery.
   * A reward that silently evaporates when you play well is worse than no
   * reward, because the player learns the multiplier is decorative.
   *
   * Returns the daylight multiplier for this mote.
   */
  collect(worth = 1, daylight01 = 0): number {
    this.count += 1
    this.window = MOTE_CHAIN_WINDOW
    this.harvested += 1
    if (this.count > this.best) {
      this.best = this.count
      if (this.best > this.bestEver) this.beatBestEver = true
    }

    const t = Math.min(MOTE_TIER_MAX, Math.floor(this.count / MOTE_TIER_STEP))
    this.tierRose = t > this.tier
    this.tier = t
    this.pay = MOTE_TIER_MULT[t]

    // how much of the BONUS above the base mote is wasted against the cap
    const base = worth
    const bonus = worth * (this.pay - 1)
    const room = Math.max(0, 1 - daylight01)
    const headroom = Math.max(0, room - base * MOTE_DAYLIGHT)
    this.spill = bonus > 0 ? 1 - Math.min(1, headroom / (bonus * MOTE_DAYLIGHT)) : 0

    return this.pay
  }

  /**
   * Per-frame. Bleeds the window and closes the chain when it runs out.
   * Returns the length of the chain that just lapsed, or 0.
   *
   * A lapse is not a punishment — it is the chain simply finishing, the way a
   * held note ends. Only stone BREAKS one.
   */
  tick(dt: number): number {
    if (this.count <= 0) return 0
    this.window -= dt
    if (this.window > 0) return 0
    return this.end('lapsed')
  }

  /**
   * Stone, talons or the dark ended it. Returns the length lost, or 0 if there
   * was nothing to lose.
   *
   * This exists as a separate door from `tick` because a chain that LAPSED and
   * a chain that was TAKEN are different feelings and must not sound the same.
   * Silence on a break reads to the player as "nothing happened", which is the
   * exact opposite of the truth.
   */
  breakNow(): number {
    if (this.count <= 0) return 0
    const had = this.count
    this.chainsBroken += 1
    if (had > this.worstBreak) this.worstBreak = had
    this.end('broken')
    return had
  }

  /** Was the chain just lost big enough that the player should hear it? */
  get lastLossMatters(): boolean {
    return this.lastEnd === 'broken' && this.lastEnded >= CHAIN_LOSS_FLOOR
  }

  /**
   * The mastery a just-ended chain is worth: paid per TIER REACHED, so an arc
   * swept whole pays and a mote brushed in passing does not. Read it after
   * `tick`/`breakNow` return non-zero, then hand it to ScoreBook.award.
   * Returns the tier count to award (0 = award nothing).
   */
  get lastWorth(): number {
    return this.lastEndTier
  }

  private lastEndTier = 0

  private end(how: ChainEnd): number {
    const had = this.count
    this.lastEnded = had
    this.lastEnd = how
    this.lastEndTier = this.tier
    this.lastNearMiss =
      how === 'broken' && this.bestEver > 0 && had >= this.bestEver - NEAR_MISS_BAND && had < this.bestEver
    if (this.tier > 0) this.chainsScored += 1
    this.count = 0
    this.window = 0
    this.tier = 0
    this.tierRose = false
    this.pay = 1
    return had
  }

  /** Wipe the live chain without scoring it (checkpoint rewind, roost). */
  clear(): void {
    this.count = 0
    this.window = 0
    this.tier = 0
    this.tierRose = false
    this.pay = 1
    this.lastEnded = 0
    this.lastEnd = 'none'
    this.lastEndTier = 0
    this.lastNearMiss = false
  }
}

const BEST_CHAIN_KEY = 'flyway-best-chain'

/** The longest chain ever swept here. A number to beat, available before the
 * run starts — which is what makes it a ladder instead of a receipt. */
export function loadBestChain(): number {
  try {
    return Number(localStorage.getItem(BEST_CHAIN_KEY)) || 0
  } catch {
    return 0
  }
}

/** Persist a new longest chain. Returns true if it was actually a record. */
export function saveBestChain(n: number): boolean {
  try {
    if (n <= loadBestChain()) return false
    localStorage.setItem(BEST_CHAIN_KEY, String(Math.floor(n)))
    return true
  } catch {
    return false
  }
}

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

  /** the live harvest chain — the game's most frequent reward, in one object */
  readonly harvest = new HarvestChain()

  /**
   * The one preallocated tick every award reuses. `award` is called on the
   * mote path, and returning a fresh object literal there is the shape of
   * allocation that produced this project's measured GC stutter. Callers read
   * it immediately and never retain it.
   */
  private readonly tick: MasteryTick = { event: 'light', gain: 0, label: '', mastery: 1 }

  /** Record an act of skill. Returns what to show, or null if it scored none. */
  award(event: MasteryEvent, count = 1): MasteryTick | null {
    if (count <= 0) return null
    return this.applyGain(event, MASTERY_GAIN[event] * count, count)
  }

  /**
   * The one place mastery moves. `gain` and `times` are separate because a
   * harvest chain is ONE event worth several tiers — the ceremony must count
   * "LIGHT CHAINS x13", not "x37".
   *
   * Note `chain` (the clean streak) advances by ONE per event, not by `times`.
   * It used to advance by `count`, which meant 179 motes made the streak read
   * "179 CLEAN IN A ROW" and the phrase stopped describing anything.
   */
  private applyGain(event: MasteryEvent, gain: number, times: number): MasteryTick {
    this.mastery = Math.min(MASTERY_MAX, this.mastery + gain)
    this.gains[event] = (this.gains[event] ?? 0) + gain
    this.counts[event] = (this.counts[event] ?? 0) + times
    this.chain += 1
    this.bestChain = Math.max(this.bestChain, this.chain)
    this.bestMastery = Math.max(this.bestMastery, this.mastery)
    this.tick.event = event
    this.tick.gain = gain
    this.tick.label = MASTERY_LABEL[event]
    this.tick.mastery = this.mastery
    return this.tick
  }

  /**
   * A mote landed. Advances the harvest chain and returns the daylight
   * multiplier to pay. Mastery is NOT touched here — it is paid when the chain
   * ends, by `closeHarvest`, so the multiplier measures sweeping rather than
   * attendance. See the note at the top of this file.
   */
  collectLight(worth = 1, daylight01 = 0): number {
    return this.harvest.collect(worth, daylight01)
  }

  /**
   * The mastery a just-closed chain paid, or null if it paid none. Points at
   * the shared preallocated tick — read it in the same frame, never retain it.
   */
  harvestTick: MasteryTick | null = null

  /**
   * Per-frame chain clock. Returns the length of a chain that just lapsed (0
   * otherwise) and pays its mastery. Allocation-free.
   */
  tickHarvest(dt: number): number {
    const ended = this.harvest.tick(dt)
    if (ended > 0) this.payHarvest()
    return ended
  }

  /**
   * Stone took the chain. Returns the length lost. The chain still earns the
   * mastery it climbed to — the player DID sweep those motes — but the streak
   * is gone, and that gap between "you earned it" and "you lost it" is what
   * makes the loss land without feeling arbitrary.
   */
  breakHarvest(): number {
    const lost = this.harvest.breakNow()
    if (lost > 0) this.payHarvest()
    return lost
  }

  private payHarvest(): void {
    const tiers = this.harvest.lastWorth
    this.harvestTick = tiers > 0 ? this.applyGain('light', MASTERY_GAIN.light * tiers, 1) : null
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
      harvestBest: this.harvest.best,
      harvested: this.harvest.harvested,
      chainsScored: this.harvest.chainsScored,
      chainsBroken: this.harvest.chainsBroken,
      worstBreak: this.harvest.worstBreak,
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
    // the live chain never survives a rewind — you re-fly the arc — but the
    // flight's records do, so a checkpoint is not an eraser
    this.harvest.clear()
    this.harvest.best = s.harvestBest ?? 0
    this.harvest.harvested = s.harvested ?? 0
    this.harvest.chainsScored = s.chainsScored ?? 0
    this.harvest.chainsBroken = s.chainsBroken ?? 0
    this.harvest.worstBreak = s.worstBreak ?? 0
  }
}
