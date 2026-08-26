import { Obstacle } from './obstacles'
import { ART } from './artManifest'

/**
 * DAY — ANCIENT RUINS, built from the supplied art kit.
 *
 * A feature is a PLACED ART PIECE: the sprite is the visual, and its colliders
 * come from the manifest's alpha-derived rects, scaled with the piece. Art and
 * collision stay decoupled — nothing visible is collision geometry.
 *
 * PACING RULE: every obstacle must be readable 2-4s before arrival. At
 * SCROLL_SPEED that is >=356px of clearance between event x positions; at
 * PRESSURE_SPEED >=428px. pacingReport() asserts this.
 */

export interface PieceFeature {
  x: number // center x
  y: number // center y (only meaningful for mount: 'mid')
  mount: 'gnd' | 'top' | 'mid'
  art: keyof typeof ART & string
  h: number // REQUESTED display height (may be reduced by pieceScale clamps)
  flipX?: boolean
  sway?: boolean // gentle rotation tween (visual only)
  brittle?: boolean // all colliders become breakable
  wide?: boolean // opt out of the 520px display-width clamp (big set pieces)
  alpha?: number
  /** Perfect Flow gate: pass cleanly in this formation for Flow credit. */
  flow?: 'spread' | 'gather'
  /** Rhythmic, readable motion — art AND colliders move together. */
  motion?: { kind: 'pendulum' | 'bob'; amp: number; period: number }
}

export interface WindZone {
  x0: number
  x1: number
  vx: number // push, px/s^2-ish (applied like the old crosswind)
  vy: number
  kind: 'cross' | 'updraft' | 'down' | 'gust'
}

export interface StrayDef {
  x: number
  y: number
  count: number
}

export interface PromptDef {
  key: string
  x: number
  text: string
}

export const SCROLL_SPEED = 178
export const PRESSURE_SPEED = 214
export const PRESSURE_START = 12000
export const ROOST_X = 26600
export const ROOST_Y = 430
export const SLICE_END = ROOST_X + 700
export const SKY_TOP = 40
export const SKY_BOTTOM = 830

export interface Landmark {
  x: number
  name: string
}

/** Named landmarks double as checkpoints (~45-60s apart). x=0 is the silent start. */
export const LANDMARKS: Landmark[] = [
  { x: 0, name: '' },
  { x: 4600, name: 'Sun Gate' },
  { x: 9600, name: 'Bell Tower' },
  { x: 14400, name: 'Rose Ruin' },
  { x: 20400, name: 'Broken Spire' },
  { x: 23200, name: 'Last Arch' },
]

const GROUND = 948 // pieces sink into the foreground garden so bases read planted, never floating

/** bottom-mounted piece: sits on the ground line whatever its final scale */
const gnd = (x: number, art: PieceFeature['art'], h: number, extra: Partial<PieceFeature> = {}): PieceFeature => ({
  x,
  y: 0,
  mount: 'gnd',
  art,
  h,
  ...extra,
})
/** top-mounted piece: hangs from above the sky line */
const top = (x: number, art: PieceFeature['art'], h: number, extra: Partial<PieceFeature> = {}): PieceFeature => ({
  x,
  y: 0,
  mount: 'top',
  art,
  h,
  ...extra,
})
/** free-floating piece at explicit center y */
const mid = (x: number, y: number, art: PieceFeature['art'], h: number, extra: Partial<PieceFeature> = {}): PieceFeature => ({
  x,
  y,
  mount: 'mid',
  art,
  h,
  ...extra,
})

export const FEATURES: PieceFeature[] = [
  // ===== OPENING (0-2100): open flight, then teach ==========================
  gnd(900, 'grand_arch', 560, { wide: true }), // generous arch — learn Gather
  top(1600, 'root_tangle', 300),
  gnd(1600, 'wall_double_arch', 330), // wide low wall + hang above = 2 easy routes

  // ===== EARLY RUINS (2100-4600): route choices =============================
  // three-route ruin: hang piece / open middle / low arcade
  top(2600, 'root_tangle', 330),
  gnd(2600, 'triple_arcade', 400),
  gnd(3150, 'obelisk_a', 600), // split obelisk
  top(3150, 'curtain_beaded', 300, { brittle: true }), // Surge teacher: a small veil to punch through
  gnd(3650, 'gothic_arch', 520, { flow: 'gather' }), // narrow: gather
  gnd(4150, 'wall_multi_window', 520, { flow: 'spread' }), // spread through windows
  top(4150, 'leaf_strand', 260),

  // ===== EARLY-MID (4600-7100): variety =====================================
  gnd(5100, 'double_arch_wall', 420), // divide or commit
  top(5100, 'leaf_strand', 300),
  gnd(5700, 'column_ring', 560), // steering column, painted detail
  gnd(6150, 'column_broken', 520, { flipX: true }),
  top(6150, 'ceiling_pods', 280, { sway: true }),
  gnd(6650, 'tall_gate', 620), // tall narrow gate — vertical compression

  // ===== MID RUINS (7100-9600): architecture peaks ==========================
  gnd(7500, 'pointed_arch', 540),
  gnd(8050, 'rose_window_big', 430), // solid tracery — fly around, strays under
  gnd(8450, 'keyhole_arch', 520),
  gnd(8950, 'column_pair', 460), // triple split, large-native
  top(8950, 'leaf_strand', 240, { flipX: true }),
  gnd(9450, 'wall_two_window', 500), // window threading
  top(9450, 'wisteria_curtain', 300, { brittle: true, motion: { kind: 'pendulum', amp: 46, period: 4.2 } }), // brittle shortcut above, visibly loose

  // ===== OVERGROWN RUINS (9600-12000): the organic turn =====================
  mid(10200, 380, 'thorn_ring', 360, { motion: { kind: 'bob', amp: 34, period: 4.2 } }), // drifting ring — clear lane beneath
  top(10750, 'wisteria_dense', 420, { brittle: true, motion: { kind: 'pendulum', amp: 90, period: 3.4 } }), // swinging brittle curtain
  gnd(10750, 'wall_circle_bite', 360),
  gnd(11300, 'organic_arch', 380), // vine arch
  top(11300, 'seed_pod_cluster_a', 340, { sway: true }), // seed grove: brush through, pods rain seeds
  gnd(11800, 'lattice_gate', 400, { flow: 'spread', motion: { kind: 'bob', amp: 50, period: 4.4 } }), // drifting lattice
  top(11800, 'seed_pod_cluster_b', 330, { sway: true }),

  // ===== WIND HEIGHTS (12000-14400): pressure + wind ========================
  gnd(12300, 'colonnade_arch', 480),
  top(12300, 'root_tangle', 280, { flipX: true, sway: true }),
  gnd(12900, 'obelisk_b', 580), // split in crosswind
  mid(13500, 340, 'web_net', 360, { brittle: true, sway: true }), // brittle net high
  gnd(13500, 'wall_four_arch', 380), // arch row low
  gnd(14100, 'gate_double', 440),

  // ===== RAPID MORPH (14400-17400) ==========================================
  gnd(14700, 'gothic_arch', 500, { flipX: true }),
  gnd(15300, 'wall_multi_window', 560, { flow: 'spread' }),
  top(15300, 'ceiling_pods', 250, { flipX: true }), // drop-window: the sky is shut — flare and thread the bays
  gnd(15900, 'grand_arch', 460, { flipX: true }), // large-native, light stone: matches the act's palette
  top(15900, 'root_tangle', 280, { flipX: true }),
  gnd(16500, 'triple_arcade', 480, { flipX: true }),
  top(16500, 'seed_pod_cluster_b', 260, { motion: { kind: 'bob', amp: 52, period: 3.6 } }), // breathing gap: the canopy sinks toward the columns
  top(17000, 'thorn_arc', 320, { sway: true }),
  gnd(17000, 'wall_arch_window', 420),

  // ===== SECOND CHOICE CLUSTER (17400-20400) ================================
  top(17700, 'wisteria_arch', 340),
  gnd(17700, 'aqueduct_slope', 420), // slope + organic above: 3 lanes
  gnd(18300, 'column_ring', 580, { flipX: true }),
  top(18300, 'curtain_ivy_lace', 380, { brittle: true }), // burst the lace — light waits behind
  gnd(18900, 'oval_window_wall', 440),
  mid(19500, 380, 'branch_cluster', 300, { sway: true }),
  gnd(19500, 'wall_double_arch', 340),
  gnd(20100, 'bent_arch', 500),
  top(20100, 'curtain_beaded', 360, { brittle: true, motion: { kind: 'pendulum', amp: 40, period: 4.6 } }),

  // ===== GAUNTLET (20400-23200) =============================================
  gnd(20700, 'column_pair', 520),
  top(20700, 'ceiling_pods', 260, { sway: true, flipX: true }),
  gnd(21300, 'gate_double', 460), // double gate split
  mid(21900, 320, 'wheel_diagonal', 235), // diagonal wheel high
  gnd(21900, 'wall_arch_inset', 380, { flipX: true }),
  gnd(22500, 'tall_gate', 580, { flipX: true }),
  top(22500, 'ceiling_pods', 300, { sway: true }), // canopy cover for the falcon zone
  top(23000, 'wisteria_curtain', 360, { brittle: true }),
  gnd(23000, 'triple_window_wall', 420),

  // ===== FINAL FLOW (23200-25400) ===========================================
  gnd(23600, 'pointed_arch', 520, { flipX: true, flow: 'gather' }), // gather, thread
  gnd(24250, 'gauntlet_gate', 720, { wide: true, flow: 'spread' }), // the monumental final gate — spread through its arches
  gnd(25000, 'aqueduct_run', 520, { wide: true }), // huge final split — the aqueduct run
  top(25000, 'root_tangle', 300, { sway: true }),
  // then open sky to the roost
]

export const WIND_ZONES: WindZone[] = [
  { x0: 12000, x1: 13300, vx: -52, vy: 0, kind: 'cross' },
  { x0: 15800, x1: 16180, vx: -150, vy: 0, kind: 'gust' }, // gust wall: surge or gather to punch through
  { x0: 21850, x1: 22180, vx: -140, vy: -18, kind: 'gust' },
  { x0: 13500, x1: 14400, vx: -30, vy: -46, kind: 'updraft' },
  { x0: 20400, x1: 21600, vx: -46, vy: 34, kind: 'down' },
]

export const STRAYS: StrayDef[] = [
  { x: 1700, y: 230, count: 6 },
  { x: 10230, y: 790, count: 6 }, // alcove: tucked under the drifting ring
  { x: 15340, y: 120, count: 6 }, // alcove: above the shut sky
  { x: 20740, y: 135, count: 7 }, // alcove: high past the column pair
  { x: 2860, y: 170, count: 10 }, // above the early ruin
  { x: 5260, y: 140, count: 12 }, // over the double-arch wall
  { x: 5950, y: 200, count: 6 },
  { x: 8050, y: 620, count: 8 }, // beneath the rose window
  { x: 9650, y: 150, count: 7 }, // beyond the brittle wisteria
  { x: 10200, y: 420, count: 14 }, // INSIDE the thorn ring's reward line
  { x: 13350, y: 480, count: 7 }, // mid-wind
  { x: 19360, y: 495, count: 8 },
  { x: 23010, y: 250, count: 9 },
  { x: 24300, y: 160, count: 10 }, // final optional flock
]

/** Wide-reward mote arcs: broad patterns Spread sweeps better. */
export interface MoteArc {
  x: number
  y: number
  count: number
  spanX: number
  spanY: number
}
export const MOTE_ARCS: MoteArc[] = [
  { x: 4850, y: 330, count: 9, spanX: 460, spanY: 260 },
  // the drafting straight: a long level lane of light — hold the line, sweep it all
  { x: 7000, y: 430, count: 12, spanX: 1300, spanY: 60 },
  { x: 9950, y: 520, count: 8, spanX: 420, spanY: 300 },
  { x: 15650, y: 380, count: 9, spanX: 480, spanY: 280 },
  // rewards tucked behind the two late brittle curtains — bursting pays
  { x: 17150, y: 420, count: 6, spanX: 260, spanY: 200 },
  { x: 19320, y: 460, count: 6, spanX: 260, spanY: 200 },
  { x: 24700, y: 360, count: 10, spanX: 520, spanY: 300 },
  // tailwind finale lane: full speed into the homecoming
  { x: 25800, y: 400, count: 12, spanX: 1100, spanY: 80 },
]

export const PROMPTS: PromptDef[] = [
  { key: 'steer', x: -1, text: 'move the mouse — steer the flock' },
  { key: 'gather', x: 520, text: 'hold SPACE — gather' },
  { key: 'spread', x: 1250, text: 'hold SHIFT — spread' },
  { key: 'surge', x: 2650, text: 'tap SPACE — surge' },
  { key: 'flare', x: 9150, text: 'tap SHIFT — flare, and wait' },
]

/**
 * Final scale for a placed piece: the requested display height, clamped so the
 * displayed width never exceeds ~520px (unless the piece opts out via wide).
 * Used by BOTH sprite placement and collider generation so they always agree.
 */
export function pieceScale(f: PieceFeature): number {
  const art = ART[f.art]
  let s = f.h / art.h
  const maxW = f.wide ? 10000 : 520
  if (art.w * s > maxW) s = maxW / art.w
  // never blow small fragments up into blur — cap the upscale
  return Math.min(s, 2.2)
}

/** Final display geometry: TRUE size after clamps, and the resolved center y. */
export function pieceDisplay(f: PieceFeature): { s: number; w: number; h: number; y: number } {
  const art = ART[f.art]
  const s = pieceScale(f)
  const w = art.w * s
  const h = art.h * s
  const y = f.mount === 'gnd' ? GROUND - h / 2 : f.mount === 'top' ? h / 2 - 26 : f.y
  return { s, w, h, y }
}

/** World-space colliders for a placed piece. */
export function pieceObstacles(f: PieceFeature): Obstacle[] {
  const art = ART[f.art]
  const { s, w, h, y } = pieceDisplay(f)
  const tlx = f.x - w / 2
  const tly = y - h / 2
  const kind =
    f.brittle || art.family === 'organic-brittle'
      ? 'brittle'
      : art.family === 'organic-hang'
        ? 'soft' // dangling vegetation brushes, it doesn't kill
        : 'solid'
  return art.colliders.map((r) => {
    const rx = f.flipX ? art.w - r.x - r.w : r.x
    return {
      shape: 'rect' as const,
      kind: kind as 'solid' | 'brittle' | 'soft',
      x: tlx + (rx + r.w / 2) * s,
      y: tly + (r.y + r.h / 2) * s,
      hw: (r.w * s) / 2,
      hh: (r.h * s) / 2,
    }
  })
}

export function buildObstacles(): { obstacles: Obstacle[]; byFeature: Map<PieceFeature, Obstacle[]> } {
  const obstacles: Obstacle[] = []
  const byFeature = new Map<PieceFeature, Obstacle[]>()
  for (const f of FEATURES) {
    const obs = pieceObstacles(f)
    byFeature.set(f, obs)
    obstacles.push(...obs)
  }
  return { obstacles, byFeature }
}

// ===========================================================================
// SECTION MOOD PLATES — six readable acts
// ===========================================================================

/**
 * One act's light. `tint` is composited by a screen-space OVERLAY rectangle,
 * so alphas stay tiny — this is a wash over the painted plate, never a filter.
 * `particleTint` re-tints the drifting leaf/grit field so the AIR changes with
 * the stone. Palette stays inside the game's navy/violet/lavender + peach/gold
 * language: nothing saturated, nothing that reads as a colour filter.
 */
export interface ActPlate {
  x0: number
  x1: number
  /** OVERLAY wash colour. */
  tint: number
  /** OVERLAY wash alpha — capped at 0.14 by house rule. */
  tintAlpha: number
  /** target alpha for the far fog band. */
  fogAlpha: number
  /** drifting-particle tints for this act. */
  particleTint: number[]
  name: string
}

/** Acts align to the level's existing section comments and its landmarks. */
export const ACT_PLATES: ActPlate[] = [
  // pale open dawn — cool lavender air, the world not yet warm
  { x0: 0, x1: 4600, tint: 0xbfc8e6, tintAlpha: 0.08, fogAlpha: 0.16, particleTint: [0x4a4468, 0x5a5480], name: 'Dawn Approach' },
  // warm stone — the sun finds the ruins; peach on every western face
  { x0: 4600, x1: 9600, tint: 0xe8b487, tintAlpha: 0.1, fogAlpha: 0.11, particleTint: [0x5c4a52, 0x6e5a4e], name: 'The Sun Gate' },
  // green-violet overgrown — muted sage under violet shade
  { x0: 9600, x1: 12000, tint: 0xa6c2a8, tintAlpha: 0.09, fogAlpha: 0.13, particleTint: [0x3f5a48, 0x4d6b52], name: 'The Overgrown' },
  // bleached windy heights — colour scoured out, haze thick
  { x0: 12000, x1: 14400, tint: 0xdfe3ee, tintAlpha: 0.11, fogAlpha: 0.24, particleTint: [0x8f93a8, 0xa8a5b8], name: 'Wind Heights' },
  // cool dark gauntlet ramp — the long slide into violet dusk
  { x0: 14400, x1: 23200, tint: 0x4a4570, tintAlpha: 0.14, fogAlpha: 0.12, particleTint: [0x2a2440, 0x37304f], name: 'The Gauntlet' },
  // golden final flow — homecoming light, feeding the existing dusk ramp
  { x0: 23200, x1: SLICE_END, tint: 0xffc98a, tintAlpha: 0.13, fogAlpha: 0.08, particleTint: [0xc9a06a, 0xb08a5e], name: 'Homeward Light' },
]

// ===========================================================================
// SUNBEAM THREADING — god rays aimed through REAL openings
// ===========================================================================

/**
 * A placed shaft of light. `x`/`y` are the sprite CENTRE, `angle` the sprite
 * rotation in degrees (the god_ray art's long axis is its width), `h` the
 * displayed length along that axis. Thickness follows the art's aspect.
 */
export interface Beam {
  x: number
  y: number
  angle: number
  h: number
  alpha: number
}

/** one sun: every shaft falls within a few degrees of the same direction */
const BEAM_ANGLE = 72
/** fraction of the shaft that sits ABOVE the hole it lands in */
const BEAM_RISE = 0.3

interface BeamSpec {
  /** feature x to attach to */
  x: number
  art: keyof typeof ART & string
  /** index into ART[art].openings; falls back to the piece heart if absent */
  opening: number
  h: number
  alpha: number
  angle?: number
  /** what this shaft marks, for the record */
  note: string
}

/**
 * Chosen so the light is DIEGETIC: every shaft lands in a hole the flock can
 * actually thread, and all six Perfect-Flow gates are lit. The 900 shaft is the
 * front-loaded one — it is on screen inside the first ~10 seconds.
 */
const BEAM_SPECS: BeamSpec[] = [
  { x: 900, art: 'grand_arch', opening: 0, h: 1000, alpha: 0.3, angle: 70, note: 'first-minute beam — the grand arch mouth' },
  { x: 2600, art: 'triple_arcade', opening: 0, h: 940, alpha: 0.24, angle: 74, note: 'left bay of the three-route arcade' },
  { x: 3650, art: 'gothic_arch', opening: 0, h: 980, alpha: 0.32, angle: 71, note: 'FLOW GATE (gather)' },
  { x: 4150, art: 'wall_multi_window', opening: 1, h: 960, alpha: 0.3, angle: 73, note: 'FLOW GATE (spread) — centre window bay' },
  { x: 6650, art: 'tall_gate', opening: 0, h: 1000, alpha: 0.24, angle: 70, note: 'the tall narrow gate' },
  { x: 8450, art: 'keyhole_arch', opening: 0, h: 940, alpha: 0.28, angle: 75, note: 'the keyhole' },
  { x: 11800, art: 'lattice_gate', opening: 0, h: 900, alpha: 0.3, angle: 72, note: 'FLOW GATE (spread) — lattice has no authored hole, aimed at its heart' },
  { x: 13500, art: 'wall_four_arch', opening: 2, h: 880, alpha: 0.2, angle: 76, note: 'centre arch of the wind-heights row (thin, storm-washed)' },
  { x: 15300, art: 'wall_multi_window', opening: 1, h: 960, alpha: 0.3, angle: 72, note: 'FLOW GATE (spread) — under the shut sky' },
  { x: 18900, art: 'oval_window_wall', opening: 0, h: 900, alpha: 0.22, angle: 74, note: 'the oval window' },
  { x: 23600, art: 'pointed_arch', opening: 0, h: 980, alpha: 0.34, angle: 69, note: 'FLOW GATE (gather) — flipped, opening mirrored' },
  { x: 24250, art: 'gauntlet_gate', opening: 0, h: 760, alpha: 0.36, angle: 68, note: 'FLOW GATE (spread) — the monumental final gate' },
]

/** World centre of one authored opening (flip-aware); piece heart if absent. */
function openingCenter(f: PieceFeature, i: number): { x: number; y: number } {
  const art = ART[f.art]
  const d = pieceDisplay(f)
  const r = art.openings[i]
  if (!r) return { x: f.x, y: d.y }
  const rx = f.flipX ? art.w - r.x - r.w : r.x
  return {
    x: f.x - d.w / 2 + (rx + r.w / 2) * d.s,
    y: d.y - d.h / 2 + (r.y + r.h / 2) * d.s,
  }
}

/** Derived at module load from the real placements, so beams can never drift
 * off their holes when a piece is re-tuned. */
function buildBeams(): Beam[] {
  const out: Beam[] = []
  for (const spec of BEAM_SPECS) {
    const f = FEATURES.find((q) => q.x === spec.x && q.art === spec.art)
    if (!f) continue
    const c = openingCenter(f, spec.opening)
    const deg = spec.angle ?? BEAM_ANGLE
    const a = (deg * Math.PI) / 180
    out.push({
      x: c.x - Math.cos(a) * spec.h * BEAM_RISE,
      y: c.y - Math.sin(a) * spec.h * BEAM_RISE,
      angle: deg,
      h: spec.h,
      alpha: spec.alpha,
    })
  }
  return out
}

export const BEAMS: Beam[] = buildBeams()

/** Dev assertion: no obstacle event closer than the 2s reaction floor. */
export function pacingReport(): { gaps: number[]; violations: string[] } {
  const xs = [...new Set(FEATURES.map((f) => f.x))].sort((a, b) => a - b)
  const gaps: number[] = []
  const violations: string[] = []
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1]
    gaps.push(gap)
    const speed = xs[i] >= PRESSURE_START ? PRESSURE_SPEED : SCROLL_SPEED
    const seconds = gap / speed
    if (seconds < 1.9) violations.push(`x=${xs[i]}: ${seconds.toFixed(2)}s after previous (gap ${gap})`)
  }
  return { gaps, violations }
}
