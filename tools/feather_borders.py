"""Feather hard borders on registered art, in place.

`tools/border_audit.py` found 63 of 215 registered pieces running opaque to
their own frame edge, several at 100% edge coverage with peak alpha 253-255.
That is the owner's "black squares around elements when light flashes": the
border is invisible against a dark sky and lights up the moment anything
brightens the scene or the piece is drawn additively.

The cause is procedural rather than artistic — 115 pieces were registered in a
single sweep without ever passing through the feathering step, and several older
sheet slices were cut flush to their bounding box.

The ramp is deliberately short. A long fade would eat real painted detail at the
edges of pieces that legitimately fill their frame (ground strips, panorama
tiles); a few pixels is enough to turn a hard line into a soft one, which is all
that is needed for it to stop reading as a rectangle.
"""
import io
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED = os.path.join(ROOT, 'public/assets/processed')
RAMP = 7  # px


def feather(path: str) -> bool:
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        # A file PIL cannot even open is a shipped asset that will 404 or draw
        # as nothing — worth naming loudly rather than skipping silently.
        print(f'  !! UNREADABLE: {os.path.relpath(path, PROCESSED)} — {e}')
        return False
    if im.mode not in ('RGBA', 'LA'):
        return False  # opaque plates have no cutout edge to give away
    im = im.convert('RGBA')
    w, h = im.size
    # Scale the ramp to the piece rather than skipping small ones. A fixed 7px
    # ramp silently left every narrow sprite with its hard edge intact, which
    # is exactly the kind of quiet exemption that let this defect survive.
    ramp = max(2, min(RAMP, min(w, h) // 3))
    if min(w, h) < 6:
        return False
    a = im.split()[3]
    px = a.load()
    changed = False
    for i in range(ramp):
        # EXACTLY 0 on the outermost row, rising inward. A first pass used
        # (i+1)/(RAMP+1), which left the true edge at 1/8 alpha — still a lit
        # line, just a fainter one, and it still read as a square once anything
        # brightened the frame. The outermost pixel has to be genuinely
        # transparent or the rectangle survives.
        k = i / ramp
        for x in range(w):
            for y in (i, h - 1 - i):
                v = px[x, y]
                nv = int(v * k)
                if nv != v:
                    px[x, y] = nv
                    changed = True
        for y in range(h):
            for x in (i, w - 1 - i):
                v = px[x, y]
                nv = int(v * k)
                if nv != v:
                    px[x, y] = nv
                    changed = True
    if not changed:
        return False
    im.putalpha(a)
    # q92 for cutouts: lossy alpha below this frays soft feathered edges, and a
    # frayed edge is the very defect being repaired here.
    im.save(path, 'WEBP', quality=92, method=6)
    return True


def main() -> int:
    man = io.open(os.path.join(ROOT, 'src/artManifest.ts'), encoding='utf-8').read()
    files = sorted(set(re.findall(r"file: 'assets/processed/([^']+)'", man)))
    n = 0
    for rel in files:
        p = os.path.join(PROCESSED, rel)
        if os.path.exists(p) and feather(p):
            n += 1
    print(f'feathered {n} of {len(files)} registered pieces')
    return 0


if __name__ == '__main__':
    sys.exit(main())
