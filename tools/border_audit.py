"""Find art with opaque borders — the cause of squares appearing around pieces.

The owner: "The black squares around elements when light flashes are even
there?!" That symptom is specific and diagnostic. A piece whose texture carries
non-transparent pixels at its frame edge draws a rectangle. Against a dark sky
that rectangle is invisible, so it survives every casual look — but the moment
anything brightens the scene, or the piece is drawn additively, the border
lights up and a square appears around the element.

This project has now hit the same defect three separate ways: fog art running to
its own frame edge, a gradient smooth on one axis and a hard cut on the other,
and most recently 115 pieces registered in one pass without ever going through
the feathering step in `tools/extract_fog.py`.

An opaque border is therefore not a cosmetic issue here, it is a recurring
structural one, and it deserves a check rather than another inspection.
"""
import io
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED = os.path.join(ROOT, 'public/assets/processed')

# Alpha above this at the frame edge reads as a hard line on screen. Soft
# painted edges land far below it; a genuine border sits near 255.
EDGE_ALPHA = 24
# What share of an edge must be lit before it draws as a line rather than as a
# few stray pixels the eye never resolves.
EDGE_SHARE = 0.06


def worst_edge(path: str, tiling: bool = False) -> tuple[float, int]:
    """Return (worst edge share, peak alpha) across the four borders."""
    im = Image.open(path)
    if im.mode not in ('RGBA', 'LA'):
        return 0.0, 0  # fully opaque plates (skies, title art) have no cutout
    im = im.convert('RGBA')
    a = im.split()[3]
    w, h = im.size
    px = a.load()
    worst, peak = 0.0, 0
    # A HORIZONTALLY TILING STRIP MUST KEEP ITS SIDE EDGES HARD, or the seam
    # between repeats becomes a visible gap — the opposite defect. Only its top
    # and bottom can give it away as a rectangle. Flagging edges that are
    # required to be opaque makes the check unsatisfiable, and an unsatisfiable
    # check is one everybody learns to ignore.
    edges = (
        ('top', [(x, 0) for x in range(w)]),
        ('bottom', [(x, h - 1) for x in range(w)]),
    ) if tiling else (
        ('top', [(x, 0) for x in range(w)]),
        ('bottom', [(x, h - 1) for x in range(w)]),
        ('left', [(0, y) for y in range(h)]),
        ('right', [(w - 1, y) for y in range(h)]),
    )
    for name, coords in edges:
        lit = 0
        for c in coords:
            v = px[c]
            if v > EDGE_ALPHA:
                lit += 1
            if v > peak:
                peak = v
        share = lit / max(1, len(coords))
        if share > worst:
            worst = share
    return worst, peak


def main() -> int:
    man = io.open(os.path.join(ROOT, 'src/artManifest.ts'), encoding='utf-8').read()
    files = set(re.findall(r"file: 'assets/processed/([^']+)'", man))

    # PATTERN-LOADED ART WAS NEVER AUDITED. textures.ts loads the fog, sky and
    # parallax sets by directory rather than through the manifest, so they were
    # invisible to this check — and the fog is the single most border-sensitive
    # art in the game, because it is drawn large, additively, over everything.
    # The owner reported "a white box around the fog cloud" in a screenshot that
    # this tool had just declared clean, which is exactly what a check with a
    # blind spot buys you.
    for group in ('fog', 'sky2x', 'parallax', 'fogpieces', 'shafts'):
        d = os.path.join(PROCESSED, group)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.lower().endswith('.webp'):
                files.add(f'{group}/{fn}')
    files = sorted(files)
    bad = []
    for rel in files:
        p = os.path.join(PROCESSED, rel)
        if not os.path.exists(p):
            continue
        try:
            share, peak = worst_edge(p, tiling=rel.startswith('parallax/'))
        except Exception as e:
            print(f'  ?? {rel}: {e}')
            continue
        if share >= EDGE_SHARE:
            bad.append((share, peak, rel))

    bad.sort(reverse=True)
    print(f'{len(files)} registered pieces checked')
    if not bad:
        print('PASS — no piece carries an opaque border')
        return 0
    print(f'\n{len(bad)} piece(s) with a hard edge that will draw as a square:\n')
    print(f'{"edge":>6} {"peak":>5}  file')
    for share, peak, rel in bad[:40]:
        print(f'{share*100:>5.0f}% {peak:>5}  {rel}')
    if len(bad) > 40:
        print(f'  ... and {len(bad) - 40} more')
    print('\nFAIL — feather these borders (see tools/extract_fog.py)')
    return 1


if __name__ == '__main__':
    sys.exit(main())
