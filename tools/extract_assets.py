"""Segment the supplied art sheets into individual game-ready sprites.

- Copies the 10 raw sheets from Downloads into assets_raw/ (canonical names)
- Connected-component segmentation on the alpha channel (sheets have real alpha)
- Tight-crops each piece into public/assets/processed/<category>/
- Auto-derives simple collider rects (alpha occupancy grid) + enclosed openings
- Emits assets_raw/manifest_draft.json and labeled contact sheets for curation
"""

import glob
import json
import os
import sys
from collections import deque

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets_raw')
OUT = os.path.join(ROOT, 'public', 'assets', 'processed')
SHOTS = os.path.join(ROOT, 'shots')

CANONICAL = [
    ('misty_ruins_at_golden_horizon', 'environment'),
    ('ethereal_violet_ruins_panorama', 'environment'),
    ('twilight_ruins_garden_overlay', 'foreground'),
    ('navy_bird_flight_sprite_sheet', 'birds'),
    ('pastel_ruins_obstacle_sprite_sheet', 'ruins'),
    ('pastel_ruined_architecture_sprite_sheet', 'ruins'),
    ('ruined_violet_arch_tileset', 'ruins'),
    ('murmuration_ruins_organic_obstacle_asset_sheet', 'organic'),
    ('dreamy_ruins_flock_asset_sheet', 'ending'),
    ('dreamy_pastel_wind_fx_sprite_sheet', 'fx'),
]

DOWN = 4  # segmentation downscale factor
MERGE_GAP = 8  # px: merge components closer than this (keeps leaves with vines)
MIN_AREA = 900  # px^2: discard specks smaller than this


def copy_raw():
    os.makedirs(RAW, exist_ok=True)
    src = sorted(
        glob.glob(os.path.expanduser('~/Downloads/ChatGPT Image Aug 24, 2026, 08_29*.png')),
        key=os.path.getmtime,
    )
    assert len(src) == 10, f'expected 10 raw files, found {len(src)}'
    paths = []
    for s, (name, _cat) in zip(src, CANONICAL):
        dst = os.path.join(RAW, name + '.png')
        if not os.path.exists(dst):
            Image.open(s).save(dst)
        paths.append(dst)
    return paths


def components(mask_w, mask_h, solid):
    """Label connected components (4-neighbour) in a flat boolean list."""
    seen = [False] * (mask_w * mask_h)
    boxes = []
    for start in range(mask_w * mask_h):
        if not solid[start] or seen[start]:
            continue
        q = deque([start])
        seen[start] = True
        x0 = x1 = start % mask_w
        y0 = y1 = start // mask_w
        while q:
            i = q.popleft()
            x, y = i % mask_w, i // mask_w
            x0, x1 = min(x0, x), max(x1, x)
            y0, y1 = min(y0, y), max(y1, y)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < mask_w and 0 <= ny < mask_h:
                    j = ny * mask_w + nx
                    if solid[j] and not seen[j]:
                        seen[j] = True
                        q.append(j)
        boxes.append([x0, y0, x1, y1])
    return boxes


def merge_boxes(boxes, gap):
    changed = True
    while changed:
        changed = False
        out = []
        while boxes:
            a = boxes.pop()
            merged = False
            for b in out:
                if (
                    a[0] - gap <= b[2]
                    and b[0] - gap <= a[2]
                    and a[1] - gap <= b[3]
                    and b[1] - gap <= a[3]
                ):
                    b[0] = min(a[0], b[0])
                    b[1] = min(a[1], b[1])
                    b[2] = max(a[2], b[2])
                    b[3] = max(a[3], b[3])
                    merged = True
                    changed = True
                    break
            if not merged:
                out.append(a)
        boxes = out
    return boxes


def occupancy_colliders(piece, max_rects=14):
    """Greedy-merged solid rects from an alpha occupancy grid."""
    w, h = piece.size
    a = piece.getchannel('A')
    for cell in (12, 18, 24, 36, 48):
        gw, gh = max(1, w // cell), max(1, h // cell)
        small = a.resize((gw, gh), Image.BILINEAR)
        px = small.load()
        grid = [[px[x, y] > 110 for x in range(gw)] for y in range(gh)]
        rects = []
        used = [[False] * gw for _ in range(gh)]
        for y in range(gh):
            x = 0
            while x < gw:
                if grid[y][x] and not used[y][x]:
                    x2 = x
                    while x2 + 1 < gw and grid[y][x2 + 1] and not used[y][x2 + 1]:
                        x2 += 1
                    y2 = y
                    while y2 + 1 < gh and all(
                        grid[y2 + 1][xx] and not used[y2 + 1][xx] for xx in range(x, x2 + 1)
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
        # drop single-cell specks only; thin-but-long structures are real
        rects = [r for r in rects if r['w'] * r['h'] >= 2 * cell * cell]
        if len(rects) <= max_rects:
            return rects
    return rects[:max_rects]


def enclosed_openings(piece):
    """Interior transparent regions (holes the flock can fly through)."""
    w, h = piece.size
    a = piece.getchannel('A').resize((max(1, w // DOWN), max(1, h // DOWN)), Image.BILINEAR)
    gw, gh = a.size
    px = a.load()
    open_ = [px[i % gw, i // gw] < 60 for i in range(gw * gh)]
    # flood from borders: anything reachable is outside, remainder = holes
    seen = [False] * (gw * gh)
    q = deque()
    for x in range(gw):
        for y in (0, gh - 1):
            i = y * gw + x
            if open_[i] and not seen[i]:
                seen[i] = True
                q.append(i)
    for y in range(gh):
        for x in (0, gw - 1):
            i = y * gw + x
            if open_[i] and not seen[i]:
                seen[i] = True
                q.append(i)
    while q:
        i = q.popleft()
        x, y = i % gw, i // gw
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < gw and 0 <= ny < gh:
                j = ny * gw + nx
                if open_[j] and not seen[j]:
                    seen[j] = True
                    q.append(j)
    interior = [open_[i] and not seen[i] for i in range(gw * gh)]
    holes = components(gw, gh, interior)
    out = []
    for x0, y0, x1, y1 in holes:
        bw, bh = (x1 - x0 + 1) * DOWN, (y1 - y0 + 1) * DOWN
        if bw * bh >= 1600:
            out.append({'x': x0 * DOWN, 'y': y0 * DOWN, 'w': bw, 'h': bh})
    return out


def segment_sheet(path, category, manifest, thresh=40, gap=MERGE_GAP):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    a = im.getchannel('A').resize((w // DOWN, h // DOWN), Image.BILINEAR)
    gw, gh = a.size
    px = a.load()
    solid = [px[i % gw, i // gw] > thresh for i in range(gw * gh)]
    boxes = components(gw, gh, solid)
    boxes = [[b[0] * DOWN, b[1] * DOWN, (b[2] + 1) * DOWN, (b[3] + 1) * DOWN] for b in boxes]
    if gap > 0:
        boxes = merge_boxes(boxes, gap)
    boxes = [b for b in boxes if (b[2] - b[0]) * (b[3] - b[1]) >= MIN_AREA]
    boxes.sort(key=lambda b: (b[1] // 200, b[0]))  # row-major-ish ordering
    name = os.path.splitext(os.path.basename(path))[0]
    outdir = os.path.join(OUT, category)
    os.makedirs(outdir, exist_ok=True)
    pieces = []
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        piece = im.crop((max(0, x0 - 2), max(0, y0 - 2), min(w, x1 + 2), min(h, y1 + 2)))
        bbox = piece.getbbox()
        if bbox:
            piece = piece.crop(bbox)
        fname = f'{name}__{i:02d}.png'
        piece.save(os.path.join(outdir, fname))
        pieces.append(
            {
                'id': f'{name}__{i:02d}',
                'category': category,
                'file': f'assets/processed/{category}/{fname}',
                'w': piece.size[0],
                'h': piece.size[1],
                'colliders': occupancy_colliders(piece),
                'openings': enclosed_openings(piece),
            }
        )
    manifest.extend(pieces)
    return pieces


def contact_sheet(pieces, title):
    if not pieces:
        return
    cols = 6
    cell = 240
    rows = (len(pieces) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * (cell + 24)), (150, 140, 160))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(pieces):
        img = Image.open(os.path.join(ROOT, 'public', p['file'])).convert('RGBA')
        img.thumbnail((cell - 12, cell - 12))
        bg = Image.new('RGB', img.size, (235, 228, 240))
        bg.paste(img, (0, 0), img)
        x0 = (i % cols) * cell
        y0 = (i // cols) * (cell + 24)
        sheet.paste(bg, (x0 + 6, y0 + 22))
        d.text((x0 + 6, y0 + 4), f"{i:02d}  {p['w']}x{p['h']}", fill=(20, 15, 30))
    sheet.save(os.path.join(SHOTS, f'curate_{title}.png'))


def garden_overlay_crops(path, manifest):
    """Sheet 3 is a designed frame: crop by region instead of components."""
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    regions = {
        'garden_tl_branch': (0, 0, int(w * 0.42), int(h * 0.30)),
        'garden_tr_column': (int(w * 0.62), 0, w, int(h * 0.38)),
        'garden_bl_arch': (0, int(h * 0.40), int(w * 0.24), h),
        'garden_br_column': (int(w * 0.74), int(h * 0.42), w, h),
        'garden_ground_strip': (0, int(h * 0.72), w, h),
    }
    outdir = os.path.join(OUT, 'foreground')
    os.makedirs(outdir, exist_ok=True)
    pieces = []
    for key, box in regions.items():
        piece = im.crop(box)
        bbox = piece.getbbox()
        if bbox:
            piece = piece.crop(bbox)
        fname = key + '.png'
        piece.save(os.path.join(outdir, fname))
        pieces.append(
            {
                'id': key,
                'category': 'foreground',
                'file': f'assets/processed/foreground/{fname}',
                'w': piece.size[0],
                'h': piece.size[1],
                'colliders': [],
                'openings': [],
            }
        )
    manifest.extend(pieces)
    return pieces


def main():
    paths = copy_raw()
    os.makedirs(SHOTS, exist_ok=True)
    manifest = []

    # background plate: copy through untouched
    env_dir = os.path.join(OUT, 'environment')
    os.makedirs(env_dir, exist_ok=True)
    Image.open(paths[0]).convert('RGB').save(os.path.join(env_dir, 'ancient_ruins_bg.png'))
    manifest.append(
        {
            'id': 'ancient_ruins_bg',
            'category': 'environment',
            'file': 'assets/processed/environment/ancient_ruins_bg.png',
            'w': Image.open(paths[0]).size[0],
            'h': Image.open(paths[0]).size[1],
            'colliders': [],
            'openings': [],
        }
    )

    seg_plan = [
        (paths[1], 'environment', 'panorama', 150, 0),
        (paths[3], 'birds', 'birds', 40, 8),
        (paths[4], 'ruins', 'ruins_a', 110, 0),
        (paths[5], 'ruins', 'ruins_b', 150, 0),
        (paths[6], 'ruins', 'ruins_c', 40, 6),
        (paths[7], 'organic', 'organic', 150, 4),
        (paths[8], 'ending', 'ending', 40, 8),
        (paths[9], 'fx', 'fx', 150, 4),
    ]
    for path, cat, title, thresh, gap in seg_plan:
        pieces = segment_sheet(path, cat, manifest, thresh, gap)
        contact_sheet(pieces, title)
        print(f'{title}: {len(pieces)} pieces')

    garden = garden_overlay_crops(paths[2], manifest)
    contact_sheet(garden, 'foreground')
    print(f'foreground: {len(garden)} pieces')

    with open(os.path.join(RAW, 'manifest_draft.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    print(f'total {len(manifest)} entries -> manifest_draft.json')


if __name__ == '__main__':
    sys.exit(main())
