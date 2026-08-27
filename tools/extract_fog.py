"""Prepare the supplied fog art for the nightfall system.

Run once the source PNGs are in public/assets/source/fog/. Filenames do not
matter - each piece is identified by its shape:

  wall    very wide, dense on one side, tendrils trailing off the other
  edge    tall and narrow: the vertical transition strip
  puff    roughly square: an isolated billow for building irregular mass
  wisp    long and thin: a single reaching finger of vapour

Two things get checked and fixed, both learned the hard way on earlier art:

  ALPHA. A previous asset arrived with a painted background and could not be
  used at all. If a piece has no real transparency this reports it loudly
  rather than silently shipping a black box.

  FRINGING. The supplied tendrils show magenta/blue/green speckle where the
  alpha feathers out - the signature of a matte being keyed rather than true
  transparency. Those pixels are barely visible alone but they sparkle against
  a dusk sky. Any pixel whose saturation spikes far above its neighbourhood
  gets its colour pulled back toward the local fog hue, leaving alpha intact.
"""
import io
import os
import sys

from PIL import Image

SRC = 'public/assets/source/fog'
OUT = 'public/assets/processed/fog'


def classify(w: int, h: int) -> str:
    ar = w / h
    if ar > 2.6:
        return 'wisp' if h < w * 0.32 else 'wall'
    if ar > 1.4:
        return 'wall'
    if ar < 0.7:
        return 'edge'
    return 'puff'


def alpha_report(im: Image.Image) -> tuple[float, bool]:
    a = im.getchannel('A')
    hist = a.histogram()
    total = sum(hist)
    transparent = sum(hist[:16]) / total if total else 0
    # real cutout art has a substantial fully-transparent region
    return transparent, transparent > 0.04


def strip_fringe(im: Image.Image) -> int:
    """Pull over-saturated edge pixels back toward the fog's own hue."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    fixed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a > 240:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            if mx == 0:
                continue
            sat = (mx - mn) / mx
            # fog is desaturated indigo; anything vivid on a soft edge is a
            # keying artefact, not paint
            if sat > 0.55:
                v = (r + g + b) // 3
                px[x, y] = (int(v * 0.82), int(v * 0.78), int(v * 1.0), a)
                fixed += 1
    return fixed


def feather_borders(im: Image.Image, span: int = 90) -> int:
    """Ramp alpha to zero at any border the art runs right up to.

    Measured: fog_wall_00 and fog_wall_02 are opaque (alpha 253-254) down their
    entire left edge, and fog_edge_00 on three sides. Scaled up in game, an
    opaque border IS a straight line - which is the "square in the fog" the
    owner reported repeatedly. No amount of code fixes it; the piece has to
    dissolve at its own boundary.
    """
    # NOTE: operate on `im` itself. convert('RGBA') returns a COPY, so an
    # earlier version of this feathered a temporary and saved the original.
    a = im.getchannel('A')
    px = a.load()
    w, h = im.size
    touched = 0
    # which borders actually need it
    left = max(px[0, y] for y in range(0, h, 5)) > 40
    right = max(px[w - 1, y] for y in range(0, h, 5)) > 40
    top = max(px[x, 0] for x in range(0, w, 5)) > 40
    bot = max(px[x, h - 1] for x in range(0, w, 5)) > 40
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if v == 0:
                continue
            k = 1.0
            if left and x < span:
                k = min(k, x / span)
            if right and x > w - 1 - span:
                k = min(k, (w - 1 - x) / span)
            if top and y < span:
                k = min(k, y / span)
            if bot and y > h - 1 - span:
                k = min(k, (h - 1 - y) / span)
            if k < 1.0:
                # smoothstep so the dissolve reads as vapour, not as a gradient
                kk = k * k * (3 - 2 * k)
                px[x, y] = int(v * kk)
                touched += 1
    im.putalpha(a)
    return touched


def main() -> int:
    if not os.path.isdir(SRC):
        print(f'no source folder: {SRC}')
        return 1
    files = [f for f in sorted(os.listdir(SRC)) if f.lower().endswith(('.png', '.webp'))]
    if not files:
        print(f'no images in {SRC} yet - drop the fog PNGs there first')
        return 1
    os.makedirs(OUT, exist_ok=True)

    seen: dict[str, int] = {}
    rows = []
    for f in files:
        im = Image.open(os.path.join(SRC, f)).convert('RGBA')
        w, h = im.size
        kind = classify(w, h)
        transparent, ok = alpha_report(im)
        if not ok:
            print(f'  !! {f}: only {transparent*100:.1f}% transparent - looks like a '
                  f'baked background, NOT usable as a cutout')
            continue
        fixed = strip_fringe(im)
        feathered = feather_borders(im)
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
        n = seen.get(kind, 0)
        seen[kind] = n + 1
        name = f'fog_{kind}_{n:02d}.png'
        im.save(os.path.join(OUT, name))
        rows.append((name, im.size, f'{transparent*100:.0f}% alpha', f'{fixed} fringe px'))
        print(f'  {f}  ->  {name}  {im.size}  ({transparent*100:.0f}% transparent, '
              f'{fixed} fringe px, {feathered} border px dissolved)')

    print(f'\n{len(rows)} pieces written to {OUT}')
    for kind, n in sorted(seen.items()):
        print(f'  {kind}: {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
