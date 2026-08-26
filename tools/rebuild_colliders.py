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
HOLE_INFLATE = 0.12  # inflate passages so they're forgiving at flock scale
MIN_PASSAGE = 30   # native px — punched passages open to at least this (≈90px world)
MAX_RECTS = 22

# Hand-authoring was tried and rejected: eyeballing hole rectangles from a
# thumbnail is a guess, and a guess that overshoots deletes real structure
# (a too-large 'opening' on grand_arch erased its left pier and crown). The
# passage detector below derives them instead — see find_passages().

def grid_of(piece, cell):
    w, h = piece.size
    a = piece.getchannel('A')
    gw, gh = max(1, round(w / cell)), max(1, round(h / cell))
    small = a.resize((gw, gh), Image.BILINEAR)
    px = small.load()
    solid = [[px[x, y] > SOLID_A for x in range(gw)] for y in range(gh)]
    open_ = [[px[x, y] < OPEN_A for x in range(gw)] for y in range(gh)]
    return solid, open_, gw, gh


def find_passages(solid, open_, gw, gh):
    """Passages = open space WALLED ON BOTH SIDES.

    An arch mouth, a window, a gate: at each row, an open run with solid mass
    somewhere to its left AND somewhere to its right is a way through the
    piece. This finds them whether or not they touch the crop border (an arch
    mouth opens downward, so enclosed-hole detection alone always missed it),
    and it can never mistake open sky beside a piece for a route.
    """
    passage = [[False] * gw for _ in range(gh)]
    for y in range(gh):
        row_solid = solid[y]
        first = next((x for x in range(gw) if row_solid[x]), None)
        last = next((x for x in range(gw - 1, -1, -1) if row_solid[x]), None)
        if first is None or last is None or last - first < 2:
            continue
        x = first
        while x <= last:
            if row_solid[x]:
                x += 1
                continue
            run0 = x
            while x <= last and not row_solid[x]:
                x += 1
            # walled on both sides by construction (inside first..last)
            for xx in range(run0, x):
                passage[y][xx] = True
    # group the passage mask into rects
    seen = [[False] * gw for _ in range(gh)]
    out = []
    for y in range(gh):
        for x in range(gw):
            if not passage[y][x] or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < gw and 0 <= ny < gh and passage[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            # ignore slivers between adjacent stones
            if (x1 - x0 + 1) >= 2 and (y1 - y0 + 1) >= 2 and n >= 6:
                out.append((x0, y0, x1, y1))
    return out


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


def silhouette_colliders(path):
    """Returns (collider_rects, opening_bboxes). Openings are the TRUE hole
    bboxes (for clean-pass detection / sunbeams); the collider punch is wider
    (inflation + minimum passage) so play is forgiving."""
    piece = Image.open(path).convert('RGBA')
    w, h = piece.size
    openings = []
    for cell in (CELL, 16, 20, 26):
        solid, open_, gw, gh = grid_of(piece, cell)
        openings = []
        for (x0, y0, x1, y1) in find_passages(solid, open_, gw, gh):
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
        rects, openings = silhouette_colliders(png)
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
