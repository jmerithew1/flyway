import { Obstacle } from './obstacles'

/**
 * DAY 1 — ANCIENT RUINS. Declarative world layout.
 *
 * A "wall" is a vertical stone face at x pierced by openings. Anything NOT
 * listed as an opening is solid stone. An opening is either a true gap
 * (nothing there) or, if `brittle` is set, a breakable curtain obstacle that
 * a fast, gathered flock can punch through — a real shortcut, not free space.
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

// ---------------------------------------------------------------------------
// Layout. Phase boundaries are commented with their approximate elapsed time
// at the section's scroll speed, for pacing reference during design.

export const SCROLL_SPEED = 178
export const PRESSURE_SPEED = 224
export const PRESSURE_START = 8200
export const ROOST_X = 15200
export const ROOST_Y = 430
export const SLICE_END = ROOST_X + 700
export const SKY_TOP = 40
export const SKY_BOTTOM = 830

export const CHECKPOINTS = [0, 1900, 3100, 4300, 6450, 8200, 11500]

export const FEATURES: Feature[] = [
  // ===== PHASE 1 — OPEN SKY (0 – 1900): teach steer, gather, spread =====
  { type: 'wall', x: 850, hw: 44, openings: [{ y0: 330, y1: 620, deco: 'arch' }] },
  {
    type: 'wall',
    x: 1500,
    hw: 42,
    openings: [
      { y0: 130, y1: 350, deco: 'none' },
      { y0: 430, y1: 650, deco: 'none' },
      { y0: 720, y1: 850, deco: 'none' },
    ],
  },

  // ===== PHASE 2 — RUIN ROUTES (1900 – 3100): three real routes =====
  {
    type: 'wall',
    x: 2500,
    hw: 46,
    openings: [
      { y0: 110, y1: 240, deco: 'vines' }, // reward: tight, strays behind
      { y0: 380, y1: 500, deco: 'pointedArch' }, // skill: tight, fast
      { y0: 610, y1: 850, deco: 'arch' }, // safe: large, easy
    ],
  },

  // ===== PHASE 3 — SPLIT FLOW (3100 – 4300): pillar, then 2→3 openings =====
  { type: 'pillar', x: 3450, top: 280, bottom: 650, hw: 44 },
  {
    type: 'wall',
    x: 3800,
    hw: 42,
    openings: [
      { y0: 200, y1: 420, deco: 'none' },
      { y0: 520, y1: 850, deco: 'none' },
    ],
  },
  {
    type: 'wall',
    x: 4200,
    hw: 40,
    openings: [
      { y0: 120, y1: 300, deco: 'none' },
      { y0: 400, y1: 560, deco: 'none' },
      { y0: 650, y1: 850, deco: 'none' },
    ],
  },

  // ===== PHASE 4 — RAPID MORPHING (4300 – 6450): tight beats, ~2.5s apart =====
  { type: 'wall', x: 4700, hw: 46, openings: [{ y0: 380, y1: 540, deco: 'pointedArch' }] },
  {
    type: 'wall',
    x: 5150,
    hw: 38,
    openings: [
      { y0: 100, y1: 260, deco: 'window' },
      { y0: 380, y1: 560, deco: 'window' },
      { y0: 660, y1: 850, deco: 'window' },
    ],
  },
  { type: 'wall', x: 5600, hw: 46, openings: [{ y0: 420, y1: 570, deco: 'pointedArch' }] },
  { type: 'pillar', x: 6000, top: 300, bottom: 640, hw: 40 },
  { type: 'wall', x: 6450, hw: 46, openings: [{ y0: 440, y1: 580, deco: 'arch' }] },

  // ===== PHASE 5 — CHOICE CLUSTER (6450 – 8200): 4 real tradeoffs =====
  {
    type: 'wall',
    x: 6900,
    hw: 42,
    openings: [
      { y0: 90, y1: 250, deco: 'rose' }, // C: reward — 18 strays
      { y0: 340, y1: 430, deco: 'pointedArch' }, // B: narrow twin arches (fast)
      { y0: 460, y1: 560, deco: 'pointedArch' }, // B cont'd
      { y0: 590, y1: 700, deco: 'vines', brittle: true }, // D: brittle shortcut
      { y0: 720, y1: 850, deco: 'arch' }, // A: safe
    ],
  },
  {
    type: 'wall',
    x: 7500,
    hw: 42,
    openings: [
      { y0: 250, y1: 470, deco: 'none' },
      { y0: 560, y1: 850, deco: 'none' },
    ],
  },

  // ===== PHASE 6 — PRESSURE (8200 – 11500): speed up, tighten spacing =====
  { type: 'wall', x: 8500, hw: 46, openings: [{ y0: 400, y1: 540, deco: 'pointedArch' }] },
  { type: 'pillar', x: 8850, top: 260, bottom: 620, hw: 38 },
  {
    type: 'wall',
    x: 9200,
    hw: 36,
    openings: [
      { y0: 110, y1: 290, deco: 'none' },
      { y0: 380, y1: 560, deco: 'none' },
      { y0: 650, y1: 830, deco: 'none' },
    ],
  },
  { type: 'wall', x: 9550, hw: 44, openings: [{ y0: 380, y1: 520, deco: 'arch' }] },
  {
    type: 'wall',
    x: 9880,
    hw: 40,
    openings: [
      { y0: 300, y1: 410, deco: 'doubleArch' },
      { y0: 460, y1: 580, deco: 'doubleArch' },
    ],
  },
  { type: 'pillar', x: 10230, top: 300, bottom: 650, hw: 40 },
  { type: 'wall', x: 10560, hw: 46, openings: [{ y0: 420, y1: 560, deco: 'pointedArch' }] },

  // ===== PHASE 7 — FINAL FLOW (11500 – 13200): choreographed set piece =====
  { type: 'wall', x: 11800, hw: 46, openings: [{ y0: 400, y1: 540, deco: 'pointedArch' }] },
  {
    type: 'wall',
    x: 12150,
    hw: 34,
    openings: [
      { y0: 80, y1: 220, deco: 'window' },
      { y0: 300, y1: 420, deco: 'window' },
      { y0: 500, y1: 620, deco: 'window' },
      { y0: 700, y1: 850, deco: 'window' },
    ],
  },
  { type: 'pillar', x: 12600, top: 200, bottom: 760, hw: 64, huge: true },
]

export const STRAYS: StrayDef[] = [
  { x: 1650, y: 240, count: 6 }, // phase 1, spread comb
  { x: 2760, y: 175, count: 12 }, // phase 2, reward route
  { x: 4050, y: 350, count: 4 }, // phase 3, reform A
  { x: 4350, y: 610, count: 4 }, // phase 3, reform B
  { x: 5150, y: 470, count: 5 }, // phase 4, between windows
  { x: 6450, y: 210, count: 6 }, // phase 4, above tight gate
  { x: 7050, y: 170, count: 18 }, // phase 5, reward route
  { x: 9200, y: 470, count: 6 }, // phase 6, pressure comb
  { x: 10560, y: 200, count: 8 }, // phase 6, above tight gate
  { x: 12150, y: 160, count: 10 }, // phase 7, final optional flock
]

export const PROMPTS: PromptDef[] = [
  { key: 'steer', x: -1, text: 'move the mouse — steer the flock' },
  { key: 'gather', x: 500, text: 'hold SPACE — gather' },
  { key: 'spread', x: 1150, text: 'hold SHIFT — spread' },
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
