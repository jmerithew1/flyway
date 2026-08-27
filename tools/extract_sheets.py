"""Split the eight FLYWAY art sheets into individual game-ready PNGs.

Source: public/assets/source/new/*.png  (identified by pixel dimensions, not
filename - the filenames are ChatGPT export junk and will change).

    1536x1024 opaque   sheet 1  six act skies, 2 cols x 3 rows      -> sky/
    1024x1536          sheet 2  parallax silhouette strips          -> parallax/
    1536x1024 alpha    sheet 3  roost tree, unlit | lit             -> roost/
    1086x1448          sheet 4  colossus fragments, perch statuary  -> colossus/
    1024x1536          sheet 5  light shafts / god rays             -> shafts/
    1086x1448          sheet 6  fog masses, motes, vessels          -> fogpieces/
    1448x1086          sheet 7  falcons, light-thieves, moths       -> flock/
    1086x1448          sheet 8  lamps, ribbons, bells, occluders    -> fixtures/

Sheets 4-8 are alpha cutouts and go through one shared pipeline
(`extract_cutouts`): threshold -> connected components -> per-component soft
gate -> fringe strip -> crop -> border feather.  Sheets 1-3 have known
geometry and are sliced directly.

THREE THINGS THIS GUARDS AGAINST, all learned the hard way on earlier art:

  KEYING FRINGE.  Every cutout sheet carries pure red / magenta / yellow
  speckle where the matte was keyed rather than painted transparent.  Measured:
  7.7% of sheet 7 is pure red at a mean alpha of 4.  Invisible on black,
  sparkles against the dusk sky.  `strip_fringe` kills it - but only OUTSIDE
  the solid art body, because the lantern flames on sheet 8 and the rim light
  on the falcons are the same saturation and must not be touched.

  OPAQUE BORDERS.  Any piece whose art runs to its own image edge renders as a
  straight line in game.  That is the "square in the fog" reported three times.
  `feather_borders` dissolves it.  Skipped for the opaque sky plates, and the
  left/right edges of parallax strips are left hard on purpose so they tile.

  BBOX OVERLAP IS NOT PIXEL OVERLAP.  Several pieces have bounding boxes that
  enclose their neighbours (the sheet-8 column occluder's box contains the
  bells; the sheet-5 shafts share one continuous haze).  Cropping by bbox alone
  drags the neighbour into the crop.  Every piece is therefore masked by its
  OWN component - softened, so the mask edge is not itself a hard line.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = 'public/assets/source/new'
OUT = 'public/assets/processed'
SHOTS = 'shots'

# ---------------------------------------------------------------- primitives


def np_rgba(im: Image.Image) -> np.ndarray:
    return np.asarray(im.convert('RGBA')).astype(np.int16).copy()


def pil_rgba(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def vivid_mask(arr: np.ndarray, sat_min=0.55, val_min=90) -> np.ndarray:
    """Pixels saturated enough to be keying residue rather than paint."""
    rgb = arr[:, :, :3]
    mx = rgb.max(2)
    mn = rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return (sat > sat_min) & (mx > val_min)


def soft_dilate(mask: np.ndarray, cells: int, ds: int, blur: float) -> np.ndarray:
    """Grow a boolean mask into a 0..1 float gate with a soft shoulder.

    Done at 1/ds resolution (cheap), then bilinear-upscaled, which supplies
    most of the softness for free; `blur` finishes it.
    """
    h, w = mask.shape
    H, W = h // ds, w // ds
    m = mask[:H * ds, :W * ds].reshape(H, ds, W, ds).max(axis=(1, 3))
    for _ in range(cells):
        m = (m | np.roll(m, 1, 0) | np.roll(m, -1, 0)
             | np.roll(m, 1, 1) | np.roll(m, -1, 1))
    g = Image.fromarray((m * 255).astype(np.uint8), 'L').resize((w, h), Image.BILINEAR)
    if blur:
        g = g.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(g).astype(np.float32) / 255.0


def label_components(mask: np.ndarray, ds: int = 4):
    """Two-pass union-find CCL on a 1/ds downsample. Returns (labels_ds, n).

    Downsampling is deliberate: it costs a few pixels of precision that the
    soft gate gives back anyway, and it dissolves single-pixel speckle that
    would otherwise become hundreds of junk components.
    """
    h, w = mask.shape
    H, W = h // ds, w // ds
    m = mask[:H * ds, :W * ds].reshape(H, ds, W, ds).max(axis=(1, 3))
    lab = np.zeros((H, W), np.int32)
    parent = [0]

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    nxt = 1
    for y in range(H):
        row = m[y]
        for x in range(W):
            if not row[x]:
                continue
            # 8-connected backward neighbours
            n = []
            if x and lab[y, x - 1]:
                n.append(lab[y, x - 1])
            if y:
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if 0 <= xx < W and lab[y - 1, xx]:
                        n.append(lab[y - 1, xx])
            if n:
                lab[y, x] = min(n)
                for v in n:
                    union(lab[y, x], v)
            else:
                lab[y, x] = nxt
                parent.append(nxt)
                nxt += 1
    if nxt > 1:
        root = np.array([find(i) for i in range(nxt)], np.int32)
        remap = {}
        for i in range(1, nxt):
            r = root[i]
            if r not in remap:
                remap[r] = len(remap) + 1
        lut = np.zeros(nxt, np.int32)
        for i in range(1, nxt):
            lut[i] = remap[root[i]]
        lab = lut[lab]
        return lab, len(remap)
    return lab, 0


def strip_fringe(arr: np.ndarray, tint=(1.00, 0.95, 0.92)) -> tuple[int, int]:
    """Remove keyed matte residue without touching painted colour.

    Two populations, measured on these sheets:
      pure red / magenta at mean alpha 1-18 - matte residue, deleted outright.
      vivid pixels on genuine soft edges    - desaturated toward the local hue.
    Both are restricted to the fringe zone (outside the solid body) so that
    lantern flame, mote cores and falcon rim light survive untouched.
    """
    a = arr[:, :, 3]
    body = soft_dilate(a > 200, cells=1, ds=4, blur=1.5) > 0.5
    zone = vivid_mask(arr) & (~body) & (a > 0)
    killed = zone & (a < 48)
    arr[killed, 3] = 0
    soft = zone & (a >= 48) & (a <= 250)
    if soft.any():
        v = arr[:, :, :3][soft].mean(1)
        arr[:, :, 0][soft] = v * tint[0]
        arr[:, :, 1][soft] = v * tint[1]
        arr[:, :, 2][soft] = v * tint[2]
    return int(killed.sum()), int(soft.sum())


def feather_borders(im: Image.Image, span: int = 48, edges='lrtb') -> int:
    """Ramp alpha to zero at any border the art actually runs up to.

    NOTE: operates on `im` itself. `im.convert('RGBA')` returns a COPY, so an
    earlier version of this feathered a temporary and saved the original.
    """
    a = im.getchannel('A')
    arr = np.asarray(a).astype(np.float32)
    h, w = arr.shape
    span = max(4, min(span, w // 3, h // 3))
    need = {
        'l': 'l' in edges and arr[:, 0].max() > 40,
        'r': 'r' in edges and arr[:, -1].max() > 40,
        't': 't' in edges and arr[0, :].max() > 40,
        'b': 'b' in edges and arr[-1, :].max() > 40,
    }
    if not any(need.values()):
        return 0
    k = np.ones((h, w), np.float32)
    ramp = np.linspace(0, 1, span, endpoint=False, dtype=np.float32)
    ramp = ramp * ramp * (3 - 2 * ramp)          # smoothstep: reads as vapour
    if need['l']:
        k[:, :span] = np.minimum(k[:, :span], ramp[None, :])
    if need['r']:
        k[:, -span:] = np.minimum(k[:, -span:], ramp[::-1][None, :])
    if need['t']:
        k[:span, :] = np.minimum(k[:span, :], ramp[:, None])
    if need['b']:
        k[-span:, :] = np.minimum(k[-span:, :], ramp[::-1][:, None])
    out = arr * k
    touched = int(((arr > 0) & (out < arr)).sum())
    im.putalpha(Image.fromarray(out.astype(np.uint8), 'L'))
    return touched


def report(path: str, im: Image.Image, note: str) -> dict:
    """Size, transparency and the edge-opacity check the brief asks for."""
    a = np.asarray(im.getchannel('A'))
    edges = (int(a[:, 0].max()), int(a[:, -1].max()),
             int(a[0, :].max()), int(a[-1, :].max()))
    return {
        'path': path, 'w': im.size[0], 'h': im.size[1],
        'transparent': float((a < 8).mean() * 100),
        'edge_max': edges, 'edge_worst': max(edges), 'note': note,
    }


def save(im: Image.Image, sub: str, name: str, note: str, rows: list):
    d = os.path.join(OUT, sub)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    im.save(p)
    rows.append(report(f'{sub}/{name}', im, note))


# ------------------------------------------------------------ shared cutouts


def absorb_contained(boxes, pad_cells=18):
    """Fold a small component into a big one whose box (padded) encloses it.

    This is what reunites the light-thief's shed feathers with the bird and the
    chandelier's bowl with its chains, WITHOUT swallowing the free-flying moths
    - they sit inside nobody's box.
    """
    order = sorted(range(len(boxes)), key=lambda i: -boxes[i][4])
    merged = {i: list(boxes[i]) for i in range(len(boxes))}
    gone = set()
    for i in order:
        if i in gone:
            continue
        bx0, by0, bx1, by1, ba = merged[i]
        for j in order:
            if j == i or j in gone or boxes[j][4] > ba * 0.45:
                continue
            x0, y0, x1, y1, _ = boxes[j]
            if (x0 >= bx0 - pad_cells and x1 <= bx1 + pad_cells
                    and y0 >= by0 - pad_cells and y1 <= by1 + pad_cells):
                gone.add(j)
                merged[i] = [min(bx0, x0), min(by0, y0),
                             max(bx1, x1), max(by1, y1), ba]
                bx0, by0, bx1, by1, ba = merged[i]
    return {i: merged[i] for i in range(len(boxes)) if i not in gone}, gone


def extract_cutouts(arr, thr, min_cells, gate_cells, gate_blur, tint,
                    ds=4, absorb=True):
    """Threshold -> label -> absorb fragments -> soft-gated per-piece crop."""
    a = arr[:, :, 3]
    lab, n = label_components(a > thr, ds)
    boxes = []
    keep_ids = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < min_cells:
            continue
        boxes.append((int(xs.min()), int(ys.min()), int(xs.max()) + 1,
                      int(ys.max()) + 1, len(ys)))
        keep_ids.append(i)
    if absorb:
        merged, gone = absorb_contained(boxes)
    else:
        merged, gone = {i: list(b) for i, b in enumerate(boxes)}, set()

    pieces = []
    for i, box in sorted(merged.items(), key=lambda kv: (kv[1][1] // 30, kv[1][0])):
        ids = [keep_ids[i]] + [keep_ids[j] for j in gone
                               if _inside(boxes[j], box)]
        m = np.isin(lab, ids)
        full = np.zeros(a.shape, bool)
        H, W = m.shape
        full[:H * ds, :W * ds] = np.repeat(np.repeat(m, ds, 0), ds, 1)
        gate = soft_dilate(full, gate_cells, ds, gate_blur)
        piece = arr.copy()
        piece[:, :, 3] = (a * gate).astype(np.int16)
        killed, softened = strip_fringe(piece, tint)
        im = pil_rgba(piece)
        bb = Image.fromarray((np.asarray(im.getchannel('A')) > 6).astype(np.uint8) * 255).getbbox()
        if not bb:
            continue
        im = im.crop(bb)
        if im.size[0] < 24 or im.size[1] < 24:
            continue
        centre = ((box[0] + box[2]) * ds / 2.0, (box[1] + box[3]) * ds / 2.0)
        pieces.append((im, killed, softened, centre))
    return pieces


def _inside(b, box, pad=18):
    return (b[0] >= box[0] - pad and b[2] <= box[2] + pad
            and b[1] >= box[1] - pad and b[3] <= box[3] + pad)


def name_pieces(pieces, names, prefix):
    """Attach names in the deterministic reading order the sorter produced."""
    out = []
    for i, p in enumerate(pieces):
        if i < len(names):
            nm, desc = names[i]
        else:
            nm, desc = f'{prefix}_extra_{i:02d}', 'UNNAMED - inspect contact sheet'
        out.append((p, nm, desc))
    return out


# ------------------------------------------------------------- contact sheet


def _font(size=15):
    for f in ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf',
              'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except Exception:
            pass
    return ImageFont.load_default()


def contact(pieces_named, title, path, cols=5, cell=280):
    n = max(1, len(pieces_named))
    rows = (n + cols - 1) // cols
    W, H = cols * cell, rows * cell + 34
    sheet = Image.new('RGB', (W, H), (128, 128, 128))
    d = ImageDraw.Draw(sheet)
    fb, fs = _font(17), _font(15)
    d.rectangle([0, 0, W, 30], fill=(38, 38, 42))
    d.text((8, 7), f'{title}   ({len(pieces_named)} pieces)  mid-grey backdrop',
           fill=(240, 240, 240), font=fb)
    for i, (im, nm, _desc) in enumerate(pieces_named):
        cx, cy = (i % cols) * cell, 34 + (i // cols) * cell
        d.rectangle([cx + 1, cy + 1, cx + cell - 2, cy + cell - 2],
                    outline=(96, 96, 100))
        t = im.copy()
        t.thumbnail((cell - 16, cell - 34), Image.LANCZOS)
        cellbg = Image.new('RGBA', t.size, (128, 128, 128, 255))
        cellbg.alpha_composite(t)
        sheet.paste(cellbg.convert('RGB'),
                    (cx + (cell - t.size[0]) // 2, cy + 6))
        d.text((cx + 7, cy + cell - 25), f'{i:02d} {nm}', fill=(16, 16, 16), font=fs)
        d.text((cx + 6, cy + cell - 26), f'{i:02d} {nm}', fill=(255, 246, 190), font=fs)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    sheet.save(path)
    return path


# ------------------------------------------------------------------- sheet 1


SKY = ['dawn_approach', 'sun_gate', 'overgrown',
       'wind_heights', 'gauntlet', 'homeward']
SKY_DESC = {
    'dawn_approach': 'cool lavender pre-dawn valley, low mist, distant spires',
    'sun_gate': 'hot orange sunrise, sun on the horizon, ruin city silhouette',
    'overgrown': 'green-gold jungle canopy under a violet storm sky',
    'wind_heights': 'pale bleached high-altitude haze over ridge lines',
    'gauntlet': 'deep indigo storm cloud over a burning ember horizon band',
    'homeward': 'golden full sunset, warm cloud deck, ruin city',
}


def do_sky(arr, rows, inset=4):
    """2 cols x 3 rows. Opaque backgrounds: no alpha work, no feathering.

    A 3-4px darker seam runs between cells in the source; `inset` trims it.
    """
    h, w = arr.shape[:2]
    cw, ch = w // 2, h / 3
    named = []
    for i, key in enumerate(SKY):
        r, c = divmod(i, 2)
        x0, x1 = c * cw + inset, (c + 1) * cw - inset
        y0, y1 = int(round(r * ch)) + inset, int(round((r + 1) * ch)) - inset
        im = pil_rgba(arr[y0:y1, x0:x1]).convert('RGB').convert('RGBA')
        save(im, 'sky', f'sky_{key}.png', SKY_DESC[key], rows)
        named.append((im, f'sky_{key}', SKY_DESC[key]))
    return named


# ------------------------------------------------------------------- sheet 2


def do_parallax(arr, rows, core=0.30, floor=0.02):
    """Horizontal strips: segment by row coverage, not by components.

    The strips within a block touch through their own haze, so connected
    components merge them (10 blobs for 18 strips). A row-coverage profile at
    0.30 finds all 18 cores cleanly; each core is then grown outward until
    coverage falls to `floor` or the midpoint to the neighbouring core.

    Left/right edges are NOT feathered - the strips span the full sheet width
    and are meant to scroll/tile horizontally, so a soft side would show a seam.
    """
    a = arr[:, :, 3]
    h, w = a.shape
    cov = (a > 10).sum(1) / w
    cores, cur = [], None
    for y, v in enumerate(cov > core):
        if v and cur is None:
            cur = y
        if not v and cur is not None:
            cores.append((cur, y))
            cur = None
    if cur is not None:
        cores.append((cur, h))

    spans = []
    for i, (s, e) in enumerate(cores):
        lo = 0 if i == 0 else (cores[i - 1][1] + s) // 2
        hi = h if i == len(cores) - 1 else (e + cores[i + 1][0]) // 2
        y0 = s
        while y0 > lo and cov[y0 - 1] > floor:
            y0 -= 1
        y1 = e
        while y1 < hi and cov[min(y1, h - 1)] > floor:
            y1 += 1
        spans.append((y0, y1))

    named = []
    for i, (y0, y1) in enumerate(spans):
        piece = arr[y0:y1].copy()
        strip_fringe(piece, tint=(0.82, 0.78, 1.00))
        im = pil_rgba(piece)
        feather_borders(im, span=14, edges='tb')
        blk, layer = divmod(i, 3)
        desc = (f'parallax band {blk + 1} layer {["far", "mid", "near"][layer]} - '
                f'ruin-and-tree silhouette ridge, source rows {y0}-{y1}')
        nm = f'strip_{i:02d}.png'
        save(im, 'parallax', nm, desc, rows)
        named.append((im, nm[:-4], desc))
    return named


# ------------------------------------------------------------------- sheet 3


def do_roost(arr, rows, seam=2):
    """Unlit | lit, split down the middle.

    Both halves are cropped with ONE shared bounding box (the union of the two)
    so the pair stays pixel-registered and can crossfade without drift.
    """
    h, w = arr.shape[:2]
    half = w // 2
    halves = [arr[:, seam:half - seam].copy(), arr[:, half + seam:w - seam].copy()]
    bbs = []
    for hf in halves:
        ys, xs = np.nonzero(hf[:, :, 3] > 10)
        bbs.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    box = (min(b[0] for b in bbs), min(b[1] for b in bbs),
           max(b[2] for b in bbs), max(b[3] for b in bbs))
    named = []
    for hf, key, desc in zip(
            halves, ('unlit', 'lit'),
            ('the roost tree, lanterns dark - great wisteria-covered tree with '
             'a stone tower grown into its trunk, nests and hanging lanterns',
             'the roost tree, lanterns lit - identical framing, every lantern '
             'and the tower windows burning warm gold')):
        piece = hf[box[1]:box[3], box[0]:box[2]].copy()
        strip_fringe(piece, tint=(0.95, 0.88, 1.00))
        im = pil_rgba(piece)
        feather_borders(im, span=40)
        save(im, 'roost', f'roost_{key}.png', desc, rows)
        named.append((im, f'roost_{key}', desc))
    if named[0][0].size != named[1][0].size:
        print('  !! roost halves differ in size - crossfade WILL drift')
    return named


# ------------------------------------------------------------- sheets 4 - 8


CUTOUT_SHEETS = {
    4: dict(sub='colossus', thr=235, min_cells=45, gate=5, blur=6,
            tint=(1.00, 0.95, 0.90), cols=5,
            title='sheet 4 - colossus fragments & perch-worn statuary',
            names=[
                ('colossus_head', 'toppled colossal head, one eye socket open, moss and wisteria over the brow'),
                ('colossus_hand', 'colossal open hand and forearm resting on a ruined arch, vines trailing'),
                ('colossus_foot', 'colossal sandalled foot and shin on rubble, flowering vine'),
                ('colossus_torso_draped', 'colossal draped shoulder and chest with an arch and column beneath'),
                ('colossus_ribcage', 'hollow colossal ribcage under a stone drape, open to nesting'),
                ('statue_robed', 'standing robed statue with outstretched arm, vine-wrapped'),
                ('arch_window_nest', 'broken arched window in a rubble base, nest on the sill'),
                ('colonnade_triple', 'three-arch colonnade fragment, nests on the capitals'),
                ('lintel_fallen', 'fallen lintel / beam span with hanging moss'),
                ('belltower_ruin', 'small ruined bell tower / cupola on rubble, nest inside'),
                ('dome_broken', 'collapsed dome shell opened to the sky'),
                ('stair_broken', 'broken flight of stone stairs climbing to nothing'),
                ('niche_nest', 'standing niche / aedicula with an arched recess and a nest'),
            ]),
    5: dict(sub='shafts', thr=210, min_cells=45, gate=10, blur=14,
            tint=(1.00, 0.97, 0.92), cols=3, absorb=False,
            title='sheet 5 - light shafts / god rays',
            names=[
                ('shaft_diag_01', 'narrow diagonal shaft raking down-right from a high left source'),
                ('shaft_fan_02', 'broad fan of rays spreading down-left from a high right source'),
                ('shaft_fan_03', 'wide fan raking down-right from a left source, heavy dust motes'),
                ('shaft_column_04', 'narrow near-vertical column of light with a bright cap'),
                ('shaft_diag_05', 'long shallow diagonal shaft from the lower-left'),
                ('shaft_fan_wide_06', 'tall wide vertical fan under a bright horizontal slot'),
            ]),
    6: dict(sub='fogpieces', thr=180, min_cells=45, gate=4, blur=6,
            tint=(0.82, 0.78, 1.00), cols=5,
            title='sheet 6 - fog masses, motes & vessels',
            names=[
                ('fog_bank_wide', 'very wide fog bank, dense indigo at left dissolving to lit tendrils right'),
                ('fog_bank_tall', 'tall dense fog wall, curled boiling edge on the right'),
                ('fog_cloud_mid', 'horizontal fog cloud with a flat base and a lit crest'),
                ('fog_wisp_low', 'low serpentine wisp, a single reaching finger of vapour'),
                ('mote_01', 'small comet mote, bright core with a short tail'),
                ('mote_02', 'comet mote with a curling tail'),
                ('mote_03', 'large spiral mote, bright core in a swirl of vapour'),
                ('mote_04', 'small round mote'),
                ('mote_05', 'small mote with a soft halo'),
                ('mote_streak_06', 'long bright mote streak, comet head and a wide trailing plume'),
                ('vessel_bottle', 'stoppered glass bottle in a wire cradle, light trapped inside'),
                ('vessel_lamp', 'ornate brass lamp with a filigree cage, burning core'),
                ('vessel_orb', 'engraved brass orb venting a plume of light'),
                ('vessel_feather', 'long indigo feather with a burning quill'),
            ]),
    7: dict(sub='flock', thr=150, min_cells=45, gate=4, blur=5,
            tint=(1.00, 0.95, 0.92), cols=5,
            title='sheet 7 - falcons, light-thieves & moths',
            names=[
                ('falcon_dive', 'falcon in a full stoop, wings folded tight, diving right-down'),
                ('falcon_soar', 'falcon soaring level, wings fully spread, seen from above'),
                ('thief_scatter_a', 'light-thief shedding feathers, wings back, pale flecks breaking away'),
                ('falcon_bank', 'falcon banking, wings raised in a deep upstroke'),
                ('falcon_glide', 'falcon gliding wings wide, talons dropped to land'),
                ('thief_scatter_b', 'light-thief mid-scatter, body dissolving into drifting feathers'),
                ('thief_launch', 'light-thief launching from a mound, glowing chest, wings up'),
                ('falcon_turn', 'falcon turning away, wings swept, teal sheen on the primaries'),
                ('thief_perched', 'light-thief perched on a mossy stump, glowing chest, tail down'),
                ('thief_level', 'light-thief in level flight, glowing chest, wings streaming back'),
                ('moth_large_a', 'large pale moth, wings spread flat, eye-spots on all four wings'),
                ('moth_large_b', 'pale moth, wings angled, three-quarter view'),
                ('moth_small_01', 'small moth, wings spread'),
                ('moth_small_02', 'small moth, wings angled'),
                ('moth_small_03', 'small moth, wings raised'),
                ('moth_small_04', 'small moth, wings half-folded'),
                ('moth_small_05', 'small moth in profile'),
                ('moth_small_06', 'small moth, wings back'),
                ('moth_cluster', 'a drift of many small moths clustered together'),
            ]),
    8: dict(sub='fixtures', thr=235, min_cells=45, gate=5, blur=6,
            tint=(1.00, 0.94, 0.90), cols=6,
            title='sheet 8 - lamps, ribbons, bells & near-plane occluders',
            names=[]),   # named by anchor, see SHEET8_ANCHORS
}

# Sheet 8 is the one that will not sort cleanly by reading order: the
# near-plane occluders bleed off three frame edges and their bounding boxes
# interleave with the lamps and bells, so row-banded ordering is unstable.
# Pieces are matched to these anchor points (centre x, centre y in source
# pixels) instead, which survives small changes in the art.
SHEET8_ANCHORS = [
    ('occluder_canopy_tl', 190, 130, 'near-plane leaf canopy bleeding in from the top-left corner'),
    ('occluder_wisteria_tr', 880, 120, 'near-plane wisteria curtain hanging from the top-right'),
    ('lantern_small_unlit', 54, 388, 'small hanging lantern, glass dark'),
    ('lantern_small_lit', 134, 388, 'small hanging lantern, warm flame lit'),
    ('sconce_unlit', 246, 340, 'wall sconce on a scrolled bracket, lantern dark'),
    ('sconce_lit', 344, 338, 'wall sconce on a scrolled bracket, lantern lit'),
    ('lantern_tall_unlit', 470, 298, 'tall leaf-capped lantern on a chain, glass dark violet'),
    ('lantern_tall_lit', 600, 280, 'tall leaf-capped lantern on a chain, burning gold'),
    ('chandelier_unlit', 780, 326, 'hanging chandelier basket on three chains, unlit'),
    ('chandelier_lit', 976, 328, 'hanging chandelier basket on three chains, full of flame'),
    ('ribbon_short', 122, 566, 'short pennant ribbon on a ring, folded close'),
    ('ribbon_stream_a', 426, 564, 'long ribbon streaming right from a ring'),
    ('ribbon_stream_b', 834, 574, 'long twisting ribbon banner on a ring'),
    ('ribbon_bell', 302, 706, 'ribbon on a ring with a small bell hung beneath'),
    ('ribbon_stream_c', 812, 702, 'long ribbon curling back on itself'),
    ('ribbon_stream_d', 280, 838, 'ribbon streaming right, pale and violet panels'),
    ('ribbon_stream_e', 808, 844, 'wide ribbon banner, deep fold in the middle'),
    ('bell_hanging_a', 218, 1006, 'hanging bronze bell with a leaf crown and a tail clapper'),
    ('bell_hanging_b', 350, 1014, 'hanging bronze bell, verdigris, tail clapper'),
    ('bell_fallen', 528, 1040, 'bell fallen on its side in the grass, mouth open'),
    ('bell_small', 684, 1012, 'small bell on a short chain'),
    ('bell_large', 814, 1008, 'large bronze bell with a heavy visible clapper'),
    ('bell_bracket', 990, 1010, 'empty iron mounting bracket / yoke'),
    ('occluder_column_l', 75, 950, 'near-plane stone column bleeding in from the left edge'),
    ('occluder_foliage_bl', 200, 1300, 'near-plane dark foliage mass along the bottom-left'),
    ('occluder_capital_b', 614, 1344, 'near-plane fallen capital and plinth on the bottom edge'),
    ('occluder_cypress_br', 954, 1258, 'near-plane cypress silhouettes on the bottom-right'),
]


def match_anchors(pieces_boxes, anchors):
    """Greedy nearest-centre assignment of anchors to extracted pieces."""
    used = set()
    out = {}
    pairs = []
    for ai, (nm, ax, ay, desc) in enumerate(anchors):
        for pi, (cx, cy) in enumerate(pieces_boxes):
            pairs.append((((cx - ax) ** 2 + (cy - ay) ** 2) ** 0.5, ai, pi))
    pairs.sort()
    for d, ai, pi in pairs:
        if ai in out or pi in used:
            continue
        out[ai] = (pi, d)
        used.add(pi)
    return out, used


def do_cutout_sheet(n, arr, rows):
    cfg = CUTOUT_SHEETS[n]
    pieces = extract_cutouts(arr, cfg['thr'], cfg['min_cells'], cfg['gate'],
                             cfg['blur'], cfg['tint'],
                             absorb=cfg.get('absorb', True))
    named = []
    if n == 8:
        centres = [p[3] for p in pieces]
        assign, used = match_anchors(centres, SHEET8_ANCHORS)
        lbl = {}
        for ai, (pi, d) in assign.items():
            nm, _x, _y, desc = SHEET8_ANCHORS[ai]
            lbl[pi] = (nm, desc, d)
        for pi, p in enumerate(pieces):
            im = p[0]
            nm, desc, d = lbl.get(pi, (f'fixture_extra_{pi:02d}',
                                       'UNNAMED - inspect contact sheet', 0.0))
            if d > 190:
                desc += f'  [anchor {d:.0f}px away - VERIFY]'
            named.append((im, nm, desc))
    else:
        for i, (im, k, s, _c) in enumerate(pieces):
            if i < len(cfg['names']):
                nm, desc = cfg['names'][i]
            else:
                nm, desc = f"{cfg['sub']}_extra_{i:02d}", 'UNNAMED - inspect contact sheet'
            named.append((im, nm, desc))

    out = []
    for im, nm, desc in named:
        feather_borders(im, span=36)
        save(im, cfg['sub'], f'{nm}.png', desc, rows)
        out.append((im, nm, desc))
    return out


# ------------------------------------------------------------------- driver


def main() -> int:
    if not os.path.isdir(SRC):
        print(f'no source folder: {SRC}')
        return 1
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.png'))
    if len(files) != 8:
        print(f'expected 8 sheets in {SRC}, found {len(files)}')

    # map by the "(n)" suffix the export uses, falling back to dimensions
    sheets = {}
    for f in files:
        p = os.path.join(SRC, f)
        for n in range(1, 9):
            if f'({n})' in f:
                sheets[n] = p
    if len(sheets) != 8:
        print('could not identify all sheets by index; got', sorted(sheets))
        return 1

    rows: list[dict] = []
    made = {}
    print('reading sheets from', SRC)
    for n in range(1, 9):
        arr = np_rgba(Image.open(sheets[n]))
        h, w = arr.shape[:2]
        print(f'\n--- sheet {n}  {w}x{h} ---')
        if n == 1:
            named = do_sky(arr, rows)
            title = 'sheet 1 - six act skies (opaque backgrounds)'
        elif n == 2:
            named = do_parallax(arr, rows)
            title = 'sheet 2 - parallax silhouette strips'
        elif n == 3:
            named = do_roost(arr, rows)
            title = 'sheet 3 - the roost tree, unlit / lit'
        else:
            named = do_cutout_sheet(n, arr, rows)
            title = CUTOUT_SHEETS[n]['title']
        made[n] = named
        cols = CUTOUT_SHEETS.get(n, {}).get('cols', 3 if n == 3 else 5)
        cs = contact(named, title, os.path.join(SHOTS, f'sheet{n}_contact.png'),
                     cols=cols)
        print(f'  {len(named)} pieces  ->  contact {cs}')

    print('\n' + '=' * 96)
    print('INVENTORY')
    print('=' * 96)
    print(f'{"path":46} {"size":>11} {"transp":>7} {"edgemax L/R/T/B":>18}')
    bad = []
    for r in rows:
        e = r['edge_max']
        flag = ''
        if r['transparent'] > 0.5 and r['edge_worst'] > 60:
            flag = '  <-- OPAQUE BORDER'
            bad.append(r['path'])
        print(f'{r["path"]:46} {r["w"]:5}x{r["h"]:<5} {r["transparent"]:6.1f}% '
              f'{e[0]:4}{e[1]:4}{e[2]:4}{e[3]:4}{flag}')
    print(f'\n{len(rows)} pieces written under {OUT}')
    if bad:
        print(f'{len(bad)} piece(s) still show an opaque border:')
        for b in bad:
            print('   ', b)
    else:
        print('no cutout piece has an opaque outer border.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
