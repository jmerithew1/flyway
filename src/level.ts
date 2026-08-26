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
  kind: 'cross' | 'updraft' | 'down'
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

const GROUND = 880 // visual ground line where bottom-mounted pieces sit

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
  gnd(3650, 'gothic_arch', 520, { flow: 'gather' }), // narrow: gather
  gnd(4150, 'wall_multi_window', 520, { flow: 'spread' }), // spread through windows
  top(4150, 'leaf_strand', 260),

  // ===== EARLY-MID (4600-7100): variety =====================================
  gnd(5100, 'double_arch_wall', 420), // divide or commit
  top(5100, 'leaf_strand', 300),
  gnd(5700, 'tall_shard', 560), // steering column
  gnd(6150, 'column_broken', 520, { flipX: true }),
  top(6150, 'ceiling_pods', 280, { sway: true }),
  gnd(6650, 'tall_gate', 620), // tall narrow gate — vertical compression

  // ===== MID RUINS (7100-9600): architecture peaks ==========================
  gnd(7500, 'pointed_arch', 540),
  mid(8050, 300, 'rose_window_big', 380), // solid tracery — fly around, strays under
  gnd(8450, 'keyhole_arch', 520),
  gnd(8950, 'triple_column', 460), // triple split
  top(8950, 'leaf_strand', 240, { flipX: true }),
  gnd(9450, 'wall_two_window', 500), // window threading
  top(9450, 'wisteria_curtain', 300, { brittle: true, motion: { kind: 'pendulum', amp: 46, period: 4.2 } }), // brittle shortcut above, visibly loose

  // ===== OVERGROWN RUINS (9600-12000): the organic turn =====================
  mid(10200, 380, 'thorn_ring', 360, { motion: { kind: 'bob', amp: 34, period: 4.2 } }), // drifting ring — clear lane beneath
  top(10750, 'wisteria_dense', 420, { brittle: true, motion: { kind: 'pendulum', amp: 90, period: 3.4 } }), // swinging brittle curtain
  gnd(10750, 'wall_circle_bite', 360),
  gnd(11300, 'organic_arch', 500), // vine arch
  top(11300, 'ceiling_pods', 300, { sway: true }),
  gnd(11800, 'lattice_gate', 480, { flow: 'spread', motion: { kind: 'bob', amp: 50, period: 4.4 } }), // drifting lattice

  // ===== WIND HEIGHTS (12000-14400): pressure + wind ========================
  gnd(12300, 'colonnade_arch', 480),
  top(12300, 'root_tangle', 280, { flipX: true, sway: true }),
  gnd(12900, 'obelisk_b', 580), // split in crosswind
  mid(13500, 340, 'web_net', 360, { brittle: true, sway: true }), // brittle net high
  gnd(13500, 'wall_four_arch', 380), // arch row low
  gnd(14100, 'twin_arch', 440),

  // ===== RAPID MORPH (14400-17400) ==========================================
  gnd(14700, 'gothic_arch', 500, { flipX: true }),
  gnd(15300, 'wall_multi_window', 560, { flow: 'spread' }),
  gnd(15900, 'arch_fragment', 460),
  top(15900, 'root_tangle', 280, { flipX: true }),
  gnd(16500, 'triple_column', 480, { flipX: true }),
  top(17000, 'thorn_arc', 320, { sway: true }),
  gnd(17000, 'wall_arch_window', 420),

  // ===== SECOND CHOICE CLUSTER (17400-20400) ================================
  top(17700, 'wisteria_arch', 340),
  gnd(17700, 'aqueduct_slope', 420), // slope + organic above: 3 lanes
  gnd(18300, 'column_ring', 580, { flipX: true }),
  gnd(18900, 'oval_window_wall', 440),
  mid(19500, 380, 'branch_cluster', 300, { sway: true }),
  gnd(19500, 'wall_double_arch', 340),
  gnd(20100, 'bent_arch', 500),

  // ===== GAUNTLET (20400-23200) =============================================
  gnd(20700, 'column_pair', 520),
  top(20700, 'ceiling_pods', 260, { sway: true, flipX: true }),
  gnd(21300, 'gate_double', 460), // double gate split
  mid(21900, 320, 'wheel_diagonal', 360), // diagonal wheel high
  gnd(21900, 'wall_arch_inset', 380, { flipX: true }),
  gnd(22500, 'tall_gate', 580, { flipX: true }),
  top(22500, 'ceiling_pods', 300, { sway: true }), // canopy cover for the falcon zone
  top(23000, 'wisteria_curtain', 360, { brittle: true }),
  gnd(23000, 'triple_window_wall', 420),

  // ===== FINAL FLOW (23200-25400) ===========================================
  gnd(23600, 'pointed_arch', 520, { flipX: true, flow: 'gather' }), // gather, thread
  gnd(24250, 'wall_multi_window', 600, { flow: 'spread' }), // spread through windows
  gnd(25000, 'aqueduct_run', 520, { wide: true }), // huge final split — the aqueduct run
  top(25000, 'root_tangle', 300, { sway: true }),
  // then open sky to the roost
]

export const WIND_ZONES: WindZone[] = [
  { x0: 12000, x1: 13300, vx: -52, vy: 0, kind: 'cross' },
  { x0: 13500, x1: 14400, vx: -30, vy: -46, kind: 'updraft' },
  { x0: 20400, x1: 21600, vx: -46, vy: 34, kind: 'down' },
]

export const STRAYS: StrayDef[] = [
  { x: 1700, y: 230, count: 6 },
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
  { x: 9950, y: 520, count: 8, spanX: 420, spanY: 300 },
  { x: 15650, y: 380, count: 9, spanX: 480, spanY: 280 },
  { x: 24700, y: 360, count: 10, spanX: 520, spanY: 300 },
]

export const PROMPTS: PromptDef[] = [
  { key: 'steer', x: -1, text: 'move the mouse — steer the flock' },
  { key: 'gather', x: 520, text: 'hold SPACE — gather' },
  { key: 'spread', x: 1250, text: 'hold SHIFT — spread' },
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
