/**
 * FLYWAY — owner-tunable game constants. Everything a designer might want to
 * retitle or rebalance lives here.
 */

export const GAME_TITLE = 'FLYWAY'
export const TAGLINE = 'Bring the flock home before nightfall.'
export const TITLE_HINT = 'Change shape. Choose your path. Keep the flock together.'

export const DAY_NAME = 'DAY 1'
export const DAY_SUBTITLE = 'ANCIENT RUINS'

export const START_BIRDS = 120
/** Below this the flock scatters and returns to the last landmark. */
export const FAIL_BIRDS = 35
/** At/below this the flock audibly/visibly thins — the pre-failure warning. */
export const WARN_BIRDS = 45

/** FLOCK star: birds returned required. */
export const FLOCK_STAR_RETURNED = 110
/** FLOW star: fraction of Perfect Flow passages required (ceil). */
export const FLOW_STAR_FRACTION = 0.75

// ---- formation strain (seconds; hidden system, tuned by playtest) ----------
// Deliberately asymmetric: Gather is already survival-strong, so it strains
// faster; Spread needs a longer healthy window to actually perform collection
// and multi-opening maneuvers.
export const GATHER_HEALTHY = 1.7
export const GATHER_HIGH = 2.6
export const GATHER_OVER = 3.4
export const SPREAD_HEALTHY = 2.2
export const SPREAD_HIGH = 3.3
export const SPREAD_OVER = 4.4
/** Strain decays this many times faster than it accumulates, in neutral. */
export const STRAIN_RECOVERY_RATE = 2.2

// ---- falcon ----------------------------------------------------------------
/** Reaction windows per authored zone — later encounters tighten slightly. */
export const FALCON_WINDOWS = [1.0, 0.9]
export const FALCON_TAKE_SPREAD: [number, number] = [6, 12]
export const FALCON_TAKE_NEUTRAL: [number, number] = [2, 5]
export const FALCON_TAKE_GATHER: [number, number] = [0, 2]
