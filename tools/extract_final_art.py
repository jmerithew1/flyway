"""Extract the flyway_final_artwork drop with friendly names + manifest append.

Own segmentation loop (components from extract_assets) so we keep bbox
centers for position-based naming. Outputs to public/assets/processed/final/;
appends ART entries to src/artManifest.ts (skipping keys that already exist).

Usage: python tools/extract_final_art.py
"""

import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from extract_assets import components, merge_boxes  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_raw', 'final_artwork')
OUT = os.path.join(ROOT, 'public', 'assets', 'processed', 'final')
MANIFEST = os.path.join(ROOT, 'src', 'artManifest.ts')
DOWN = 4
MIN_AREA = 34 * 34


def segment(path, thresh, gap):
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
    out = []
    for (x0, y0, x1, y1) in boxes:
        piece = im.crop((max(0, x0 - 2), max(0, y0 - 2), min(w, x1 + 2), min(h, y1 + 2)))
        bb = piece.getbbox()
        if bb:
            piece = piece.crop(bb)
        cx01 = ((x0 + x1) / 2) / w
        cy01 = ((y0 + y1) / 2) / h
        out.append((piece, cx01, cy01))
    return out


def save(piece, key, family, entries):
    fname = f'{key}.png'
    piece.save(os.path.join(OUT, fname))
    entries.append(
        {
            'key': key,
            'file': f'assets/processed/final/{fname}',
            'w': piece.size[0],
            'h': piece.size[1],
            'family': family,
        }
    )
    print(f'  {key}: {piece.size[0]}x{piece.size[1]} ({family})')


def main():
    os.makedirs(OUT, exist_ok=True)
    entries = []

    # ---- falcon: 4 poses by quadrant
    for piece, cx, cy in segment(os.path.join(SRC, 'setpieces/falcon_animation_sheet.png'), 60, 0):
        name = {'tl': 'falcon_bank', 'tr': 'falcon_dive', 'bl': 'falcon_strike', 'br': 'falcon_retreat'}[
            ('t' if cy < 0.5 else 'b') + ('l' if cx < 0.5 else 'r')
        ]
        save(piece, name, 'fx', entries)

    # ---- hero landmarks: 3 columns
    for piece, cx, cy in segment(os.path.join(SRC, 'setpieces/hero_landmarks_sheet.png'), 60, 0):
        name = 'bell_tower' if cx < 0.33 else 'storm_spire' if cx < 0.62 else 'gauntlet_gate'
        save(piece, name, 'wall', entries)

    # ---- perched birds: quadrants
    for piece, cx, cy in segment(os.path.join(SRC, 'setpieces/perched_birds_sheet.png'), 60, 0):
        name = {'tl': 'perched_a', 'tr': 'perched_b', 'bl': 'perched_c', 'br': 'perched_sleep'}[
            ('t' if cy < 0.5 else 'b') + ('l' if cx < 0.5 else 'r')
        ]
        save(piece, name, 'deco', entries)

    # ---- seed / curtain / storm / light
    seed_i = 0
    wisp_names = []
    for piece, cx, cy in segment(os.path.join(SRC, 'setpieces/seed_curtain_storm_light_sheet.png'), 30, 0):
        w, h = piece.size
        if cy < 0.42 and cx < 0.34 and w > 300:
            save(piece, 'seed_pod_cluster_a', 'organic-hang', entries)
        elif cy < 0.42 and cx < 0.63 and w > 300:
            save(piece, 'seed_pod_cluster_b', 'organic-hang', entries)
        elif cy < 0.42 and cx > 0.8 and h > 200:
            save(piece, 'seed_feather_deco', 'deco', entries)
        elif cy < 0.45 and w <= 300 and h <= 200:
            save(piece, f'seed_loose_{seed_i:02d}', 'fx', entries)
            seed_i += 1
        elif 0.38 <= cy <= 0.78 and cx < 0.34 and w > 300:
            save(piece, 'curtain_beaded', 'organic-brittle', entries)
        elif 0.38 <= cy <= 0.78 and cx < 0.63 and w > 300:
            save(piece, 'curtain_ivy_lace', 'organic-brittle', entries)
        elif cx > 0.6 and 0.38 <= cy <= 0.85 and w > 400:
            wisp_names.append((cy, piece))
        elif cy > 0.7 and w > 900:
            save(piece, 'god_ray', 'fx', entries)
        else:
            save(piece, f'seed_extra_{cx:.2f}_{cy:.2f}'.replace('.', ''), 'deco', entries)
    for i, (cy, piece) in enumerate(sorted(wisp_names)):
        save(piece, f'storm_wisp_{chr(97 + i)}', 'deco', entries)

    # ---- rating icons: 3x3-ish grid + emblems
    for piece, cx, cy in segment(os.path.join(SRC, 'progression/feather_rating_system.png'), 40, 0):
        w, h = piece.size
        if w < 120 or h < 120:
            continue  # sparkles/specks
        col = 'home' if cx < 0.36 else 'flock' if cx < 0.68 else 'flow'
        if cy < 0.36:
            save(piece, f'rating_{col}_on', 'deco', entries)
        elif cy < 0.66:
            save(piece, f'rating_{col}_off', 'deco', entries)
        else:
            idx = min(int(cx * 4), 3)
            save(piece, f'emblem_{chr(97 + idx)}', 'deco', entries)

    # ---- roost markers: 3x2 grid, row-major
    marks = []
    for piece, cx, cy in segment(os.path.join(SRC, 'progression/roost_destination_markers.png'), 40, 0):
        if piece.size[0] < 200:
            continue
        marks.append((round(cy, 1), round(cx, 1), piece))
    marks.sort()
    names = ['marker_ancient_ruins', 'marker_wild_orchard', 'marker_river_gorge', 'marker_falcon_cliffs', 'marker_wind_heights', 'marker_final_roost']
    for (cy, cx, piece), name in zip(marks, names):
        save(piece, name, 'deco', entries)

    # ---- wordmark + title bg
    for piece, cx, cy in segment(os.path.join(SRC, 'progression/flyway_wordmark.png'), 30, 40):
        save(piece, 'wordmark', 'deco', entries)
        break
    tb = Image.open(os.path.join(SRC, 'progression', 'title_home_background.png'))
    tb.save(os.path.join(OUT, 'title_bg.png'))
    entries.append({'key': 'title_bg', 'file': 'assets/processed/final/title_bg.png', 'w': tb.size[0], 'h': tb.size[1], 'family': 'deco'})
    print(f'  title_bg: {tb.size[0]}x{tb.size[1]} (deco)')

    # ---- append new entries to artManifest.ts (skip existing keys)
    src = open(MANIFEST, encoding='utf-8').read()
    lines = []
    for e in entries:
        if f"'{e['key']}':" in src:
            print(f"  (manifest: {e['key']} already present, skipping)")
            continue
        # brittle curtains get standard full-bbox colliders; the rest start
        # empty (landmarks gain silhouette colliders via rebuild_colliders)
        coll = [{'x': 0, 'y': 0, 'w': e['w'], 'h': e['h']}] if e['family'] == 'organic-brittle' else []
        lines.append(
            f"  '{e['key']}': {{ key: '{e['key']}', file: '{e['file']}', w: {e['w']}, h: {e['h']}, "
            f"family: '{e['family']}', colliders: {json.dumps(coll)}, openings: [] }},"
        )
    if lines:
        src = re.sub(r'\n\}\n\s*$', '\n' + '\n'.join(lines) + '\n}\n', src)
        open(MANIFEST, 'w', encoding='utf-8').write(src)
    print(f'\n{len(lines)} manifest entries appended')


if __name__ == '__main__':
    main()
