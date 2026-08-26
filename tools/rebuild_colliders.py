"""Rebuild artManifest.ts colliders as silhouette-minus-openings.

The shipped band-collider policy made most vertical art mass (arch legs, piers,
gate jambs, hanging curtains) non-collidable and, worse, left painted windows
INSIDE solid bands. This tool re-derives colliders from each processed PNG's
alpha channel so physics matches the silhouette:

- solid = alpha occupancy at fine grid resolution
- enclosed transparent holes (arch mouths, windows) are punched OPEN, inflated
  slightly so advertised passages are forgiving at flock scale
- greedy-merged into rects, capped for perf

Brittle ('organic-brittle') pieces keep full-bbox colliders — they are meant to
be walls until broken. bird/fx/deco families stay collider-free.

Usage: python tools/rebuild_colliders.py        (rewrites src/artManifest.ts)
"""

import json
import re
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'src' / 'artManifest.ts'
PUBLIC = ROOT / 'public'

NO_COLLIDE = {'bird', 'fx', 'deco'}
KEEP_AS_IS = {'organic-brittle'}

CELL = 12          # native px per grid cell (finest pass)
SOLID_A = 110      # alpha above which a cell is solid
OPEN_A = 60        # alpha below which a cell counts as open for hole detection
MIN_HOLE = 20      # native px — smaller holes are decoration, not passages
HOLE_INFLATE = 0.30  # inflate passages so they're forgiving at flock scale
MIN_PASSAGE = 44   # native px — punched passages open to at least this (≈90px world)
MAX_RECTS = 22

# Hand-authored passages (native px) for route-advertising pieces whose
# openings the alpha scan can't see (painted windows) or sees only as
# to-the-edge corridors (arch mouths/bays). Punched like holes (widened to
# MIN_PASSAGE) and emitted in `openings` for celebrations/sunbeams.
HAND_OPENINGS = {
    'wall_multi_window': [
        {'x': 60, 'y': 70, 'w': 42, 'h': 90},
        {'x': 120, 'y': 70, 'w': 46, 'h': 90},
        {'x': 170, 'y': 70, 'w': 46, 'h': 90},
        {'x': 18, 'y': 54, 'w': 28, 'h': 28},
        {'x': 200, 'y': 40, 'w': 32, 'h': 32},
    ],
    'wall_two_window': [
        {'x': 92, 'y': 32, 'w': 42, 'h': 75},
        {'x': 52, 'y': 58, 'w': 30, 'h': 45},
    ],
    'wall_double_arch': [
        {'x': 52, 'y': 38, 'w': 50, 'h': 74},
        {'x': 132, 'y': 48, 'w': 54, 'h': 64},
        {'x': 198, 'y': 68, 'w': 30, 'h': 44},
    ],
    'gothic_arch': [{'x': 68, 'y': 80, 'w': 82, 'h': 190}],
    'tall_gate': [{'x': 55, 'y': 55, 'w': 85, 'h': 135}],
    'grand_arch': [{'x': 95, 'y': 90, 'w': 155, 'h': 186}],
    'keyhole_arch': [{'x': 130, 'y': 40, 'w': 85, 'h': 160}],
}


def grid_of(piece, cell):
    w, h = piece.size
    a = piece.getchannel('A')
    gw, gh = max(1, round(w / cell)), max(1, round(h / cell))
    small = a.resize((gw, gh), Image.BILINEAR)
    px = small.load()
    solid = [[px[x, y] > SOLID_A for x in range(gw)] for y in range(gh)]
    open_ = [[px[x, y] < OPEN_A for x in range(gw)] for y in range(gh)]
    return solid, open_, gw, gh


def enclosed_holes(open_, gw, gh):
    """Interior open regions (not reachable from the border) as cell bboxes."""
    seen = [[False] * gw for _ in range(gh)]
    q = deque()
    for x in range(gw):
        for y in (0, gh - 1):
            if open_[y][x] and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(gh):
        for x in (0, gw - 1):
            if open_[y][x] and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < gw and 0 <= ny < gh and open_[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True
                q.append((nx, ny))
    holes = []
    hseen = [[False] * gw for _ in range(gh)]
    for y in range(gh):
        for x in range(gw):
            if open_[y][x] and not seen[y][x] and not hseen[y][x]:
                q = deque([(x, y)])
                hseen[y][x] = True
                x0 = x1 = x
                y0 = y1 = y
                while q:
                    cx, cy = q.popleft()
                    x0, x1 = min(x0, cx), max(x1, cx)
                    y0, y1 = min(y0, cy), max(y1, cy)
                    for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                        if 0 <= nx < gw and 0 <= ny < gh and open_[ny][nx] and not seen[ny][nx] and not hseen[ny][nx]:
                            hseen[ny][nx] = True
                            q.append((nx, ny))
                holes.append((x0, y0, x1, y1))
    return holes


def merge_rects(solid, gw, gh, w, h, cell):
    rects = []
    used = [[False] * gw for _ in range(gh)]
    for y in range(gh):
        x = 0
        while x < gw:
            if solid[y][x] and not used[y][x]:
                x2 = x
                while x2 + 1 < gw and solid[y][x2 + 1] and not used[y][x2 + 1]:
                    x2 += 1
                y2 = y
                while y2 + 1 < gh and all(
                    solid[y2 + 1][xx] and not used[y2 + 1][xx] for xx in range(x, x2 + 1)
                ):
                    y2 += 1
                for yy in range(y, y2 + 1):
                    for xx in range(x, x2 + 1):
                        used[yy][xx] = True
                rects.append(
                    {
                        'x': round(x * w / gw),
                        'y': round(y * h / gh),
                        'w': round((x2 - x + 1) * w / gw),
                        'h': round((y2 - y + 1) * h / gh),
                    }
                )
                x = x2 + 1
            else:
                x += 1
    # drop specks; thin-but-long structures (legs, jambs) are real
    return [r for r in rects if r['w'] * r['h'] >= 2 * cell * cell]


def silhouette_colliders(path, hand=None):
    """Returns (collider_rects, opening_bboxes). Openings are the TRUE hole
    bboxes (for clean-pass detection / sunbeams); the collider punch is wider
    (inflation + minimum passage) so play is forgiving."""
    piece = Image.open(path).convert('RGBA')
    w, h = piece.size
    openings = []
    for cell in (CELL, 16, 20, 26):
        solid, open_, gw, gh = grid_of(piece, cell)
        openings = []
        hand_cells = [
            (
                int(r['x'] * gw / w),
                int(r['y'] * gh / h),
                int((r['x'] + r['w']) * gw / w),
                int((r['y'] + r['h']) * gh / h),
            )
            for r in (hand or [])
        ]
        for (x0, y0, x1, y1) in hand_cells + enclosed_holes(open_, gw, gh):
            hw = (x1 - x0 + 1) * w / gw
            hh = (y1 - y0 + 1) * h / gh
            if hw < MIN_HOLE or hh < MIN_HOLE:
                continue
            openings.append(
                {
                    'x': round(x0 * w / gw),
                    'y': round(y0 * h / gh),
                    'w': round(hw),
                    'h': round(hh),
                }
            )
            # punch: inflate, then widen further until the passage meets the
            # minimum playable width on each axis
            ix = (x1 - x0 + 1) * HOLE_INFLATE
            iy = (y1 - y0 + 1) * HOLE_INFLATE
            ix = max(ix, (MIN_PASSAGE * gw / w - (x1 - x0 + 1)) / 2)
            iy = max(iy, (MIN_PASSAGE * gh / h - (y1 - y0 + 1)) / 2)
            ix = max(1, round(ix))
            iy = max(1, round(iy))
            for yy in range(max(0, y0 - iy), min(gh, y1 + iy + 1)):
                for xx in range(max(0, x0 - ix), min(gw, x1 + ix + 1)):
                    solid[yy][xx] = False
        rects = merge_rects(solid, gw, gh, w, h, cell)
        if len(rects) <= MAX_RECTS:
            return rects, openings
    rects.sort(key=lambda r: -(r['w'] * r['h']))
    return rects[:MAX_RECTS], openings


def main():
    src = MANIFEST.read_text(encoding='utf-8')
    entry_re = re.compile(
        r"^(  '(?P<key>[^']+)': \{ key: '[^']+', file: '(?P<file>[^']+)', w: \d+, h: \d+, "
        r"family: '(?P<family>[^']+)', colliders: )(?P<coll>\[[^\]]*\]), openings: (?P<open>\[[^\]]*\])(?P<rest> \}.*)$",
        re.M,
    )
    changed = 0

    def sub(m):
        nonlocal changed
        fam = m.group('family')
        if fam in NO_COLLIDE or fam in KEEP_AS_IS:
            return m.group(0)
        png = PUBLIC / m.group('file')
        rects, openings = silhouette_colliders(png, HAND_OPENINGS.get(m.group('key')))
        if not rects:
            # thin structures (rings, filigree) can vanish under the speck
            # filter — keep the previous colliders rather than going ghost
            print(f"{m.group('key')}: empty result, keeping existing colliders")
            return m.group(0)
        new = json.dumps(rects)
        new_open = json.dumps(openings)
        if new != m.group('coll') or new_open != m.group('open'):
            changed += 1
            print(f"{m.group('key')}: {len(rects)} rects, {len(openings)} openings")
        return m.group(1) + new + ', openings: ' + new_open + m.group('rest')

    out = entry_re.sub(sub, src)
    n_entries = len(entry_re.findall(src))
    if n_entries < 80:
        raise SystemExit(f'manifest parse matched only {n_entries} entries — format drift, aborting')
    MANIFEST.write_text(out, encoding='utf-8')
    print(f'\n{changed} pieces updated ({n_entries} entries scanned)')


if __name__ == '__main__':
    main()
