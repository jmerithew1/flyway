"""Convert every runtime art asset to WebP, and rewrite the code that names them.

Why: the shipped bundle was 88 MB of PNG, which is slow on ANY host — that is a
payload problem, not a hosting problem. Measured on a sample, WebP lands at ~13%
of PNG for this art: soft painted gradients and large flat alpha regions are
exactly what it compresses best. Opaque plates drop to ~5%.

Quality is deliberately split. Opaque backgrounds (skies, title plates) take
lossy q82 — they are hazy paintings with no hard edges to shimmer. Cutouts with
alpha take q92, because lossy alpha at lower quality frays soft feathered edges,
and feathered edges are load-bearing here: an artefact at a piece's border is
exactly the "square in the fog" defect this project already fought twice.
"""
import io
import os
import re
import sys

from PIL import Image

ROOT = 'C:/dev/game-week'
ASSETS = os.path.join(ROOT, 'public/assets/processed')
CODE = [os.path.join(ROOT, 'src/artManifest.ts'), os.path.join(ROOT, 'src/textures.ts')]


def convert_all() -> tuple[int, int, int]:
    before = after = n = 0
    for dirpath, _dirnames, filenames in os.walk(ASSETS):
        for fn in filenames:
            if not fn.lower().endswith('.png'):
                continue
            src = os.path.join(dirpath, fn)
            dst = src[:-4] + '.webp'
            im = Image.open(src)
            has_alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
            if has_alpha:
                im = im.convert('RGBA')
                q = 92
            else:
                im = im.convert('RGB')
                q = 82
            im.save(dst, 'WEBP', quality=q, method=6)
            b, a = os.path.getsize(src), os.path.getsize(dst)
            before += b
            after += a
            n += 1
            os.remove(src)
    return n, before, after


def rewrite_code() -> None:
    for path in CODE:
        if not os.path.exists(path):
            continue
        s = io.open(path, encoding='utf-8').read()
        # only rewrite paths that point into the processed asset tree
        s2 = re.sub(r"(assets/processed/[^'\"`]*?)\.png", r"\1.webp", s)
        if s2 != s:
            io.open(path, 'w', encoding='utf-8').write(s2)
            print(f'  rewrote paths in {os.path.basename(path)}')


if __name__ == '__main__':
    n, before, after = convert_all()
    print(f'{n} files: {before/1e6:.1f} MB -> {after/1e6:.1f} MB '
          f'({100*after/max(1,before):.0f}%)')
    rewrite_code()
    # any remaining .png reference into processed/ would 404 at runtime
    leftover = 0
    for path in CODE:
        if os.path.exists(path):
            s = io.open(path, encoding='utf-8').read()
            leftover += len(re.findall(r"assets/processed/[^'\"`]*?\.png", s))
    print('remaining .png references in code:', leftover)
    sys.exit(0)
