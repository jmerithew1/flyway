"""Repair extraction artefacts in processed art pieces.

The art-quality sweep found four recurring defect classes, all born in
segmentation rather than in the source paintings:

  A. JUNK       — fragments of a neighbouring sheet piece left inside a crop
                  (gauntlet_gate's banner shred, lattice_gate's floating rock)
  B. SKY WASH   — semi-opaque source background inside the piece's bounds, so
                  the whole rectangle reads as a translucent card (root_tangle)
  C. BAKED GLOW — sheet lighting left as a mid-alpha strip along an edge
                  (wall_four_arch's base halo, the ceiling stubs' top seam)
  D. RAZOR CUT  — shapes sliced on machine-straight lines at the crop bounds,
                  hanging in open sky with flat ends (leaf_strand, root_tangle)

Each pass is conservative and idempotent; originals stay in assets_raw/.
Run: python tools/repair_art.py
"""

import os
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, 'public', 'assets', 'processed')

# --- A: keep only the main mass (+ anything close to it) -------------------
# key -> minimum fraction of the largest component a piece must reach to stay
DEJUNK = {
    'final/gauntlet_gate.png': 0.05,
    'final/curtain_beaded.png': 0.04,
    'organic/murmuration_ruins_organic_obstacle_asset_sheet__09.png': 0.05,  # lattice_gate
}

# --- B: pieces carrying a residual semi-opaque background wash --------------
DEHAZE = [
    'organic/murmuration_ruins_organic_obstacle_asset_sheet__03.png',  # root_tangle
    'organic/murmuration_ruins_organic_obstacle_asset_sheet__04.png',  # leaf_strand
]

# --- C: baked lighting strips along a bbox edge: (key, edge, depth px) ------
DEGLOW = [
    ('ruins/ruined_violet_arch_tileset__05.png', 'bottom', 16),  # wall_four_arch base halo
    ('ruins/pastel_ruined_architecture_sprite_sheet__07.png', 'bottom', 12),  # obelisk_b base
]

# --- D: feather straight crop cuts so nothing ends in a flat wall -----------
# (key, edges) — edges the sweep flagged as razor-straight in open sky
FEATHER = [
    ('organic/murmuration_ruins_organic_obstacle_asset_sheet__03.png', ('bottom',)),  # root strands
    ('organic/murmuration_ruins_organic_obstacle_asset_sheet__04.png', ('bottom',)),  # leaf strands
    ('organic/murmuration_ruins_organic_obstacle_asset_sheet__07.png', ('bottom',)),  # thorn ring
    ('ruins/ruined_violet_arch_tileset__24.png', ('left', 'right')),  # wheel_diagonal beam ends
    ('ruins/pastel_ruined_architecture_sprite_sheet__56.png', ('top', 'left')),  # keyhole fragments
]

FEATHER_DEPTH = 26  # px of taper applied inward from a cut edge


def load(rel):
    p = os.path.join(PROC, rel)
    return p, Image.open(p).convert('RGBA')


def components(px, w, h, thresh=16):
    """8-connected components of visible pixels, as (size, bbox, cells)."""
    seen = bytearray(w * h)
    out = []
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or px[sx, sy][3] <= thresh:
                continue
            q = deque([(sx, sy)])
            seen[i] = 1
            cells = []
            x0 = x1 = sx
            y0 = y1 = sy
            while q:
                cx, cy = q.popleft()
                cells.append((cx, cy))
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            j = ny * w + nx
                            if not seen[j] and px[nx, ny][3] > thresh:
                                seen[j] = 1
                                q.append((nx, ny))
            out.append((len(cells), (x0, y0, x1, y1), cells))
    return out


def dejunk(rel, keep_frac):
    p, im = load(rel)
    w, h = im.size
    px = im.load()
    comps = components(px, w, h)
    if not comps:
        return
    comps.sort(key=lambda c: -c[0])
    biggest = comps[0][0]
    removed = 0
    for size, _bbox, cells in comps[1:]:
        if size >= biggest * keep_frac:
            continue  # a legitimate secondary mass (a second tower, etc.)
        for x, y in cells:
            px[x, y] = (0, 0, 0, 0)
        removed += size
    im.save(p)
    print(f'  dejunk {os.path.basename(rel)}: {len(comps)} parts, removed {removed}px of strays')


def dehaze(rel):
    """Drop the flat semi-opaque wash: pixels that are faint AND far from any
    solid neighbourhood are source background, not soft art."""
    p, im = load(rel)
    w, h = im.size
    px = im.load()
    solid = [[px[x, y][3] > 150 for x in range(w)] for y in range(h)]
    # distance-to-solid via a coarse 12px box test
    R = 12
    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a > 110:
                continue
            near = False
            for yy in range(max(0, y - R), min(h, y + R + 1), 3):
                row = solid[yy]
                for xx in range(max(0, x - R), min(w, x + R + 1), 3):
                    if row[xx]:
                        near = True
                        break
                if near:
                    break
            if not near:
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    im.save(p)
    print(f'  dehaze {os.path.basename(rel)}: cleared {cleared}px of background wash')


def deglow(rel, edge, depth):
    """Erase a baked mid-alpha lighting strip hugging one bbox edge."""
    p, im = load(rel)
    w, h = im.size
    px = im.load()
    bbox = im.getbbox()
    if not bbox:
        return
    x0, y0, x1, y1 = bbox
    cleared = 0
    if edge == 'bottom':
        rows = range(max(y0, y1 - depth), y1)
    elif edge == 'top':
        rows = range(y0, min(y1, y0 + depth))
    else:
        rows = range(y0, y1)
    for y in rows:
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if 0 < a <= 200:  # the glow is never fully opaque; stone is
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    im.save(p)
    print(f'  deglow {os.path.basename(rel)} [{edge}]: cleared {cleared}px')


def feather(rel, edges):
    """Taper alpha toward a crop edge so sliced shapes fade instead of ending
    in a flat wall of pixels."""
    p, im = load(rel)
    w, h = im.size
    px = im.load()
    bbox = im.getbbox()
    if not bbox:
        return
    x0, y0, x1, y1 = bbox
    touched = 0
    for edge in edges:
        for y in range(y0, y1):
            for x in range(x0, x1):
                a = px[x, y][3]
                if a == 0:
                    continue
                if edge == 'bottom':
                    d = y1 - 1 - y
                elif edge == 'top':
                    d = y - y0
                elif edge == 'left':
                    d = x - x0
                else:
                    d = x1 - 1 - x
                if d >= FEATHER_DEPTH:
                    continue
                k = d / FEATHER_DEPTH
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, int(a * (k * k)))
                touched += 1
    im.save(p)
    print(f'  feather {os.path.basename(rel)} {edges}: tapered {touched}px')


# --- E: explicit region erases where the sweep gave exact coordinates ------
REGION_ERASE = [
    ('final/gauntlet_gate.png', (0, 0, 170, 300)),  # banner shred + rock chunk
    ('final/gauntlet_gate.png', (0, 380, 60, 480)),  # left-edge shreds
]

# --- F: crimson chroma fringe left by segmentation. The palette's warm
# accents (lanterns, sunset) are near-neutral gold (R-G small); the shreds
# are saturated crimson, so R-G is the safe discriminator.
DECHROMA = ['final/gauntlet_gate.png', 'final/bell_tower.png', 'final/storm_spire.png']
# NOTE: opaque pixels are never touched — the peach sun-side lighting in the
# source paintings is real art, only the semi-transparent crimson halo that
# segmentation leaves along cut edges is stripped.


def region_erase(rel, box):
    p, im = load(rel)
    px = im.load()
    x0, y0, x1, y1 = box
    n = 0
    for y in range(y0, min(y1, im.size[1])):
        for x in range(x0, min(x1, im.size[0])):
            if px[x, y][3]:
                px[x, y] = (0, 0, 0, 0)
                n += 1
    im.save(p)
    print(f'  erase {os.path.basename(rel)} {box}: {n}px')


def dechroma(rel):
    p, im = load(rel)
    w, h = im.size
    px = im.load()
    n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 235 and r - g > 78 and r > 130:
                px[x, y] = (0, 0, 0, 0)
                n += 1
    im.save(p)
    print(f'  dechroma {os.path.basename(rel)}: stripped {n}px of crimson fringe')


def main():
    print('E. region erases')
    for rel, box in REGION_ERASE:
        region_erase(rel, box)
    print('F. crimson fringe')
    for rel in DECHROMA:
        dechroma(rel)
    print('A. removing junk fragments')
    for rel, frac in DEJUNK.items():
        dejunk(rel, frac)
    print('B. clearing residual sky wash')
    for rel in DEHAZE:
        dehaze(rel)
    print('C. erasing baked lighting strips')
    for rel, edge, depth in DEGLOW:
        deglow(rel, edge, depth)
    print('D. feathering razor crop cuts')
    for rel, edges in FEATHER:
        feather(rel, edges)
    print('done — rerun tools/rebuild_colliders.py if silhouettes changed')


if __name__ == '__main__':
    main()
