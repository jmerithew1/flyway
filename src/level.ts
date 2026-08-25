import { Obstacle } from './obstacles'

/**
 * DAY 1 — ANCIENT RUINS. Declarative world layout.
 *
 * A "wall" is a vertical stone face at x pierced by openings. Anything NOT
 * listed as an opening is solid stone. An opening is either a true gap or,
 * if `brittle`, a breakable curtain a fast gathered flock can punch through.
 *
 * ---------------------------------------------------------------------------
 * PACING RULE (this is what the spacing numbers below are derived from):
 * the player must read every obstacle 2-4 seconds before reaching it. At
 * SCROLL_SPEED that is 356-712px of clearance; at PRESSURE_SPEED it is
 * 448-896px. Nothing is spaced tighter than that floor — difficulty comes
 * from transition timing and route choice, never from stolen reaction time.
 */

export type GapDeco = 'arch' | 'pointedArch' | 'window' | 'rose' | 'vines' | 'doubleArch' | 'none'

export interface Opening {
  y0: number
  y1: number
  deco: GapDeco
  brittle?: boolean
}

export interface WallFeature {
  type: 'wall'
  x: number
  hw: number
  openings: Opening[]
}

export interface PillarFeature {
  type: 'pillar'
  x: number
  top: number
  bottom: number
  hw: number
  huge?: boolean
}

export type Feature = WallFeature | PillarFeature

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

/** ~45-60s apart at the speed of the section each one sits in. */
export const CHECKPOINTS = [0, 2100, 4600, 7100, 9600, 12000, 14400, 17400, 20400, 23200]

const w = (x: number, hw: number, openings: Opening[]): WallFeature => ({ type: 'wall', x, hw, openings })
const p = (x: number, top: number, bottom: number, hw: number, huge = false): PillarFeature => ({
  type: 'pillar',
  x,
  top,
  bottom,
  hw,
  huge,
})

export const FEATURES: Feature[] = [
  // ===== PHASE 1 — OPENING (0 - 2100): teach steer, gather, spread =========
  // one generous arch to learn compression on
  w(900, 44, [{ y0: 300, y1: 640, deco: 'arch' }]),
  // a wide three-opening comb: spread reads clearly here
  w(1600, 42, [
    { y0: 120, y1: 340, deco: 'none' },
    { y0: 430, y1: 640, deco: 'none' },
    { y0: 730, y1: 860, deco: 'none' },
  ]),

  // ===== PHASE 2 — SEQUENCE 1 (2100 - 4600) ================================
  // large ruin, three real routes: safe low arch / medium centre / tight
  // upper opening guarding 10 strays
  w(2600, 46, [
    { y0: 110, y1: 235, deco: 'vines' }, // reward: tight, strays behind
    { y0: 390, y1: 520, deco: 'window' }, // skill: medium
    { y0: 630, y1: 860, deco: 'arch' }, // safe: large
  ]),
  p(3150, 280, 660, 44), // immediately: pillar forces a split
  w(3650, 46, [{ y0: 400, y1: 545, deco: 'pointedArch' }]), // narrow: gather
  w(4150, 40, [
    // three openings: spread works well
    { y0: 130, y1: 320, deco: 'none' },
    { y0: 410, y1: 570, deco: 'none' },
    { y0: 660, y1: 850, deco: 'none' },
  ]),
  // ...then a short recovery before the next sequence

  // ===== PHASE 3 — SEQUENCE 2 (4600 - 7100) ================================
  // ruined wall with FIVE irregular holes: gather one, spread several, or
  // take the small upper gap for the optional birds
  w(5100, 44, [
    { y0: 90, y1: 190, deco: 'vines' }, // small upper: strays
    { y0: 265, y1: 400, deco: 'none' },
    { y0: 455, y1: 620, deco: 'rose' }, // the one large hole
    { y0: 680, y1: 780, deco: 'none' },
    { y0: 830, y1: 900, deco: 'none' },
  ]),
  p(5700, 300, 620, 38), // two columns demanding steering adjustment
  p(6150, 420, 780, 38),
  w(6650, 46, [{ y0: 380, y1: 530, deco: 'pointedArch' }]),

  // ===== PHASE 4 — SEQUENCE 3 (7100 - 9600) ================================
  w(7500, 46, [{ y0: 420, y1: 550, deco: 'pointedArch' }]), // tight passage
  // open area with a stray flock (no wall) around 8000
  w(8450, 44, [{ y0: 330, y1: 470, deco: 'arch' }]), // narrow arch
  p(8950, 300, 650, 42), // split pillar
  w(9450, 42, [
    // route choice again: brittle shortcut low, safe high
    { y0: 150, y1: 350, deco: 'none' },
    { y0: 620, y1: 740, deco: 'vines', brittle: true },
  ]),

  // ===== PHASE 5 — CHOICE CLUSTER (9600 - 12000) ===========================
  // four genuinely different ways through one big ruin
  w(10200, 44, [
    { y0: 90, y1: 240, deco: 'rose' }, // C: reward — 14 strays
    { y0: 340, y1: 440, deco: 'pointedArch' }, // B: narrow twin arches, fast
    { y0: 480, y1: 580, deco: 'pointedArch' },
    { y0: 640, y1: 750, deco: 'vines', brittle: true }, // D: brittle shortcut
    { y0: 800, y1: 900, deco: 'arch' }, // A: safe
  ]),
  w(10900, 42, [
    { y0: 220, y1: 450, deco: 'none' },
    { y0: 560, y1: 860, deco: 'none' },
  ]),
  p(11500, 280, 640, 40),

  // ===== PHASE 6 — PRESSURE (12000 - 14400) ================================
  // Runs at PRESSURE_SPEED, so spacing widens to ~480-600px to hold the
  // 2s reaction floor. (The previous 330px spacing here was the grinder.)
  w(12100, 44, [{ y0: 380, y1: 520, deco: 'pointedArch' }]),
  p(12650, 260, 620, 38),
  w(13200, 40, [
    { y0: 110, y1: 300, deco: 'none' },
    { y0: 390, y1: 570, deco: 'none' },
    { y0: 660, y1: 850, deco: 'none' },
  ]),
  w(13800, 44, [{ y0: 360, y1: 510, deco: 'arch' }]),

  // ===== PHASE 7 — RAPID MORPH CHAIN (14400 - 17400) =======================
  // alternating tight/wide so neither formation can be held through it
  w(14500, 46, [{ y0: 400, y1: 540, deco: 'pointedArch' }]),
  w(15100, 40, [
    { y0: 120, y1: 310, deco: 'none' },
    { y0: 400, y1: 580, deco: 'none' },
    { y0: 670, y1: 860, deco: 'none' },
  ]),
  w(15700, 46, [{ y0: 300, y1: 430, deco: 'window' }]),
  p(16300, 320, 700, 40),
  w(16850, 44, [
    { y0: 200, y1: 330, deco: 'vines' },
    { y0: 560, y1: 780, deco: 'arch' },
  ]),

  // ===== PHASE 8 — SECOND CHOICE CLUSTER (17400 - 20400) ===================
  w(17500, 44, [
    { y0: 100, y1: 210, deco: 'rose' }, // reward, 12 strays
    { y0: 420, y1: 530, deco: 'pointedArch' }, // skill
    { y0: 690, y1: 900, deco: 'arch' }, // safe
  ]),
  p(18100, 260, 600, 42),
  w(18700, 42, [{ y0: 430, y1: 600, deco: 'none' }]),
  w(19300, 40, [
    { y0: 150, y1: 330, deco: 'none' },
    { y0: 430, y1: 560, deco: 'vines', brittle: true },
    { y0: 680, y1: 860, deco: 'none' },
  ]),
  w(19950, 46, [{ y0: 360, y1: 500, deco: 'pointedArch' }]),

  // ===== PHASE 9 — GAUNTLET (20400 - 23200) ================================
  p(20500, 280, 640, 38),
  w(21100, 42, [
    { y0: 130, y1: 300, deco: 'none' },
    { y0: 400, y1: 540, deco: 'window' },
    { y0: 650, y1: 850, deco: 'none' },
  ]),
  w(21750, 46, [{ y0: 420, y1: 555, deco: 'pointedArch' }]),
  p(22350, 240, 580, 40),
  w(22950, 44, [
    { y0: 180, y1: 320, deco: 'vines' },
    { y0: 520, y1: 760, deco: 'arch' },
  ]),

  // ===== PHASE 10 — FINAL FLOW (23200 - 25400) =============================
  w(23600, 46, [{ y0: 400, y1: 540, deco: 'pointedArch' }]), // gather, thread
  w(24250, 36, [
    // spread through several openings
    { y0: 90, y1: 230, deco: 'window' },
    { y0: 320, y1: 440, deco: 'window' },
    { y0: 530, y1: 650, deco: 'window' },
    { y0: 740, y1: 870, deco: 'window' },
  ]),
  p(25000, 200, 780, 64, true), // split around a huge tower
  // then open sky to the roost
]

export const STRAYS: StrayDef[] = [
  { x: 1700, y: 230, count: 6 }, // phase 1 comb
  { x: 2860, y: 170, count: 10 }, // seq 1 reward route
  { x: 4350, y: 720, count: 5 }, // seq 1 spread openings
  { x: 5260, y: 140, count: 12 }, // seq 2 small upper gap
  { x: 5950, y: 200, count: 6 }, // seq 2 between the columns
  { x: 8000, y: 430, count: 8 }, // seq 3 open area
  { x: 9600, y: 690, count: 7 }, // beyond the brittle shortcut
  { x: 10380, y: 165, count: 14 }, // choice cluster reward route
  { x: 11000, y: 330, count: 6 },
  { x: 13250, y: 480, count: 7 }, // pressure comb
  { x: 16900, y: 265, count: 6 }, // rapid-morph chain
  { x: 17580, y: 155, count: 12 }, // second cluster reward route
  { x: 19360, y: 495, count: 8 }, // beyond the second brittle shortcut
  { x: 21160, y: 470, count: 7 }, // gauntlet
  { x: 23010, y: 250, count: 9 },
  { x: 24300, y: 160, count: 10 }, // final optional flock
]

export const PROMPTS: PromptDef[] = [
  { key: 'steer', x: -1, text: 'move the mouse — steer the flock' },
  { key: 'gather', x: 520, text: 'hold SPACE — gather' },
  { key: 'spread', x: 1250, text: 'hold SHIFT — spread' },
]

/** Build collidable Obstacle[] from FEATURES. */
export function buildObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = []
  for (const f of FEATURES) {
    if (f.type === 'wall') {
      const edges: number[] = [0]
      for (const o of f.openings) edges.push(o.y0, o.y1)
      edges.push(960)
      for (let i = 0; i < edges.length; i += 2) {
        const y0 = edges[i]
        const y1 = edges[i + 1]
        if (y1 - y0 < 8) continue
        obstacles.push({ shape: 'rect', kind: 'solid', x: f.x, y: (y0 + y1) / 2, hw: f.hw, hh: (y1 - y0) / 2 })
      }
      for (const o of f.openings) {
        if (!o.brittle) continue
        obstacles.push({ shape: 'rect', kind: 'brittle', x: f.x, y: (o.y0 + o.y1) / 2, hw: f.hw, hh: (o.y1 - o.y0) / 2 })
      }
    } else {
      const capR = f.hw * (f.huge ? 1.15 : 1.45)
      obstacles.push({ shape: 'circle', kind: 'solid', x: f.x, y: f.top, r: capR })
      obstacles.push({
        shape: 'rect',
        kind: 'solid',
        x: f.x,
        y: (f.top + 30 + f.bottom) / 2,
        hw: f.hw,
        hh: (f.bottom - f.top - 30) / 2,
      })
    }
  }
  return obstacles
}

/** Dev assertion: no obstacle may sit closer than the 2s reaction floor. */
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
