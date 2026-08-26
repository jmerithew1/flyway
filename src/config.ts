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

// ---- Phase 8: second ability wave ------------------------------------------
// All of these are OFF by default: the flock behaves exactly as before until
// the scene calls setDive / enterVortex / setBrace / bankMomentum, and harmony
// only ever *removes* strain, never adds it.

// -- Dive (hold): altitude traded for speed, released as a slingshot ----------
/** How far below the cursor the shared intention sinks while diving (px). */
export const DIVE_INTENT_DROP = 340
/** Constant downward accel while diving — the "gravity gets a vote" term. */
export const DIVE_PULL = 420
/** Cruise + max-speed cap lift while diving, applied ONLY to birds with vy > 0. */
export const DIVE_SPEED_BONUS = 0.25
/** A dive shorter than this buys no slingshot (prevents tap-spam kicks). */
export const DIVE_MIN_HOLD = 0.18
/** Dive seconds needed for a full-strength slingshot. */
export const DIVE_FULL_HOLD = 0.7
/** Seconds for the release lift envelope to decay to zero. */
export const DIVE_LIFT_DECAY = 0.45
/** Upward accel at full lift envelope — the slingshot's climb. */
export const DIVE_LIFT_ACCEL = 760
/** Cruise multiplier added at full lift envelope. */
export const DIVE_LIFT_SPEED = 0.3

// -- Vortex Whirl (circular gesture): a rotating column ----------------------
/** Seconds for the whirl to spin down from full. */
export const VORTEX_DECAY = 1.6
/** Multiplier on TUNING.wSwirl at full vortex — the column's rotation. */
export const VORTEX_SWIRL_MULT = 5.5
/** Extra cohesion (fraction of wCohesion) at full vortex — the inward pull. */
export const VORTEX_COHESION_BOOST = 0.9
/** Per-second rate at which every bird's orbitBias slews to the whirl's sign. */
export const VORTEX_ALIGN_RATE = 3.2

// -- Harmony: calm neutral flight banked, spent on the next formation change --
/** Harmony gained per second of calm neutral flight (1/3 → ~3s to full). */
export const HARMONY_BUILD = 1 / 3
/** Harmony lost per second once flight stops being calm. */
export const HARMONY_DECAY = 1 / 1.2
/** |form| must stay under this to count as neutral. */
export const HARMONY_FORM_BAND = 0.15
/** Both strains must stay under this to count as calm. */
export const HARMONY_STRAIN_MAX = 0.1
/** Harmony needed before a formation change can spend it. */
export const HARMONY_SPEND_MIN = 0.55
/** Seconds of strain-free grace bought by a full-harmony spend. */
export const HARMONY_SPEND_TIME = 0.7
/** Form-attack multiplier during the grace — the "instant" formation change. */
export const HARMONY_ATTACK_MULT = 2.2

// -- Brace (hold SPACE+SHIFT): perception bought with formation health -------
/** Strain-clock accrual multiplier while braced. See Flock.setBrace's contract. */
export const BRACE_STRAIN_MULT = 2

// -- Tailwind Kick / Updraft Riding: banked wind, discharged at zone exit -----
/** Ceiling on stored bank. */
export const BANK_MAX = 1
/** Bank gained per unit of reported aligned wind (scene passes alignment*dt). */
export const BANK_RATE = 0.55
/** Grace after the last bankMomentum() report before the bank starts bleeding. */
export const BANK_HOLD = 0.35
/** Bank bled per second once the scene stops reporting aligned wind. */
export const BANK_DECAY = 0.35
/** Below this, dischargeBank() is a no-op (and clears) — no free micro-kicks. */
export const BANK_DISCHARGE_MIN = 0.2
/** bank → surge-pulse strength on discharge. */
export const BANK_DISCHARGE_GAIN = 1.15

// -- Flock Voice: sparse procedural chirp chorus (src/audio.ts) --------------
/** Longest gap between chirp clusters, at minimum density (seconds). */
export const VOICE_GAP_MAX = 3.2
/** Shortest gap between chirp clusters, at full density (seconds). */
export const VOICE_GAP_MIN = 0.34
/** Below this density the voice falls silent entirely. */
export const VOICE_DENSITY_FLOOR = 0.06
/** Peak gain of a single chirp — deliberately below the bell motif. */
export const VOICE_PEAK = 0.026
/** Calm's share of density (the rest comes from flock size). */
export const VOICE_CALM_SHARE = 0.6

// -- Scene-side numbers for the same wave (DayScene owns the call sites) -----
// Flock.setBrace prices the formation cost; these price the world-slow half.
/** World dt multiplier while fully braced (the ~60% ease). */
export const BRACE_WORLD_SCALE = 0.6
/** Seconds the chord can hold the world down before it lapses on its own. */
export const BRACE_MAX_TIME = 0.7
/** Seconds before the chord can brace again. */
export const BRACE_COOLDOWN = 2
/** Seconds for the world-slow to ease in/out (never a hard cut). */
export const BRACE_EASE = 6
/** Chord must be held this long before it reads as brace and not gather+spread. */
export const BRACE_CHORD_DELAY = 0.11

/** Vortex gesture: minimum radius, in screen px, before a wind counts. */
export const GESTURE_MIN_RADIUS = 42
/** Vortex gesture: how fast the rolling gesture centre chases the pointer. */
export const GESTURE_CENTRE_RATE = 2.2
/** Vortex gesture: accumulated winding bleeds this fast if the player dawdles. */
export const GESTURE_UNWIND = 0.9
/** Vortex gesture: seconds before another whirl can be spun up. */
export const GESTURE_COOLDOWN = 2.5

/** Tailwind: |cos| between flock heading and wind vector needed to bank. */
export const TAILWIND_ALIGN_MIN = 0.35
/** Tailwind: spread needed to catch the wind (Tailwind Kick / Updraft Riding). */
export const TAILWIND_SPREAD_MIN = 0.35

// -- Brace tone (src/audio.ts) ----------------------------------------------
/** Wing-bed cutoff multiplier while braced — the world darkens. */
export const BRACE_TONE_MULT = 0.62
/** Cents the pad/drone bend flat while braced — time thickening. */
export const BRACE_DETUNE = -32

// ---- falcon ----------------------------------------------------------------
/** Reaction windows per authored zone — later encounters tighten slightly. */
export const FALCON_WINDOWS = [1.0, 0.9]
export const FALCON_TAKE_SPREAD: [number, number] = [6, 12]
export const FALCON_TAKE_NEUTRAL: [number, number] = [2, 5]
export const FALCON_TAKE_GATHER: [number, number] = [0, 2]
