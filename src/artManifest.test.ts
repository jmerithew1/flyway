import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ART } from './artManifest'

/**
 * The manifest is generated, and it has been silently corrupted twice: once
 * when two separate tools rewrote the generated file after the generator ran
 * (leaving 86 of 100 entries pointing at deleted .png files), and once when the
 * collider model was swapped for full silhouettes, which made every arch leg
 * solid and the game unwinnable.
 *
 * Neither failed a typecheck. Both were caught by a person playing. These are
 * the assertions that would have caught them in a second instead.
 */

const PUBLIC = join(process.cwd(), 'public')
const pieces = Object.entries(ART)

describe('every entry resolves', () => {
  it('points at a file that exists on disk', () => {
    const dead = pieces.filter(([, p]) => !existsSync(join(PUBLIC, p.file))).map(([k, p]) => `${k} -> ${p.file}`)
    expect(dead).toEqual([])
  })

  it('is never a zero-byte file', () => {
    // An asset-processing tool truncated two files to zero bytes when two of
    // its runs overlapped: Pillow writes in place, so a second writer opening
    // the same path mid-write leaves nothing behind. The file still EXISTED,
    // so an existence check passed while the art was gone.
    const empty = pieces
      .filter(([, p]) => existsSync(join(PUBLIC, p.file)) && statSync(join(PUBLIC, p.file)).size === 0)
      .map(([k]) => k)
    expect(empty).toEqual([])
  })

  it('is large enough to be real art, not a stub', () => {
    const tiny = pieces
      .filter(([, p]) => existsSync(join(PUBLIC, p.file)) && statSync(join(PUBLIC, p.file)).size < 200)
      .map(([k]) => k)
    expect(tiny).toEqual([])
  })

  it('ships no .png references — everything was converted to WebP', () => {
    const png = pieces.filter(([, p]) => p.file.endsWith('.png')).map(([k]) => k)
    expect(png).toEqual([])
  })

  it('agrees with its own key', () => {
    for (const [key, p] of pieces) expect(p.key).toBe(key)
  })

  it('has real dimensions everywhere', () => {
    for (const [key, p] of pieces) {
      expect(p.w, key).toBeGreaterThan(0)
      expect(p.h, key).toBeGreaterThan(0)
    }
  })
})

describe('colliders keep their promises', () => {
  it('never lets a family that must not collide carry colliders', () => {
    // 'deco' and 'bird' are drawn-only by definition; a collider on one is an
    // invisible wall.
    const bad = pieces
      .filter(([, p]) => (p.family === 'deco' || p.family === 'bird') && p.colliders.length > 0)
      .map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('keeps every collider inside the piece it belongs to', () => {
    const escaped: string[] = []
    for (const [key, p] of pieces) {
      for (const r of p.colliders) {
        if (r.x < -1 || r.y < -1 || r.x + r.w > p.w + 1 || r.y + r.h > p.h + 1) escaped.push(key)
      }
    }
    expect([...new Set(escaped)]).toEqual([])
  })

  it('never seals a painted opening with a collider', () => {
    // THE RULE THE WHOLE WORLD RESTS ON: a marking must never imply an opening
    // is flyable when the collider refuses it. A gap the art advertises and the
    // physics denies is what teaches a player that shapes mean nothing.
    const sealed: string[] = []
    for (const [key, p] of pieces) {
      for (const o of p.openings) {
        // the centre of a painted opening must be clear of every collider
        const cx = o.x + o.w / 2
        const cy = o.y + o.h / 2
        const blocked = p.colliders.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)
        if (blocked) sealed.push(`${key} @ ${Math.round(cx)},${Math.round(cy)}`)
      }
    }
    expect(sealed).toEqual([])
  })

  it('stays sparse — the 2.5D band model, not full silhouettes', () => {
    // Full-silhouette colliders averaged far more rects per piece and made
    // every mullion solid: a competent pilot died at x=19,000 with 0 birds and
    // 262 collisions. Bands average under ~4. This is the canary for that
    // regression returning.
    const collidable = pieces.filter(([, p]) => p.colliders.length > 0)
    const avg = collidable.reduce((n, [, p]) => n + p.colliders.length, 0) / collidable.length
    expect(avg).toBeLessThan(8)
  })
})
