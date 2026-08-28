import { isTouch } from './touch'

/**
 * HIGH / MEDIUM / LOW, and what each is allowed to take away.
 *
 * The rule that decides every number below: **LOW may cost spectacle, never
 * legibility and never control.** A player on a cheap phone must still see the
 * fog coming, still read which bird is in trouble, still get the same response
 * from the same input. What LOW gives up is richness — fewer fog blobs, no
 * bloom pass, a shorter effect pool — because those make the frame beautiful
 * rather than readable.
 *
 * This exists because the frame's measured pressure points are object count and
 * full-screen fill, and both are things a phone feels first. It is not a
 * general "graphics options" menu: three tiers, each a considered position,
 * with a conservative default on touch.
 */
export type Quality = 'high' | 'medium' | 'low'

export interface QualitySpec {
  /** Soft blobs building the fog body. The fog's silhouette degrades
   * gracefully — fewer, larger blobs still billow. */
  fogBlobs: number
  /** The camera bloom pass. A full-screen post-FX pass is the single most
   * expensive thing on a weak GPU, and the art survives without it. */
  bloom: boolean
  /** Ceiling on pooled VFX sprites alive at once. */
  vfxPool: number
  /** Ambient emitters (leaves, dust, wisps) — pure atmosphere, first to go. */
  ambient: number
  /** Whether the impact lens/chromatic pipeline may attach at all. */
  lens: boolean
  /** Multiplier on decorative sprite count (monuments and lamps still draw —
   * they carry the world's scale and story — but the fine litter thins). */
  decor: number
}

const SPECS: Record<Quality, QualitySpec> = {
  high: { fogBlobs: 26, bloom: true, vfxPool: 72, ambient: 1, lens: true, decor: 1 },
  medium: { fogBlobs: 18, bloom: true, vfxPool: 44, ambient: 0.6, lens: false, decor: 0.8 },
  low: { fogBlobs: 12, bloom: false, vfxPool: 24, ambient: 0.3, lens: false, decor: 0.55 },
}

const KEY = 'flyway-quality'

/**
 * Touch defaults to MEDIUM rather than HIGH, deliberately. A phone that stutters
 * on the first flight is a phone the player closes, and the difference between
 * medium and high is richness the player has not yet been given a reason to
 * care about. Desktop starts high.
 */
export function defaultQuality(): Quality {
  return isTouch ? 'medium' : 'high'
}

export function loadQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'high' || v === 'medium' || v === 'low') return v
  } catch {
    /* private browsing or a blocked store is not a reason to fail to boot */
  }
  return defaultQuality()
}

export function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q)
  } catch {
    /* the setting simply does not persist; the game still runs */
  }
}

export function qualitySpec(q: Quality = loadQuality()): QualitySpec {
  return SPECS[q]
}

/** The next tier in the cycle, for a single-control toggle. */
export function nextQuality(q: Quality): Quality {
  return q === 'high' ? 'medium' : q === 'medium' ? 'low' : 'high'
}
