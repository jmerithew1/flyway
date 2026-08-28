"""Measure how much of the flight actually MOVES, per R21.

The defect this exists to catch: the level had ~200 placed pieces and exactly 6
of them moved, so 25,400px of flight read as a static gallery the player is
carried past rather than a world with a tempo. Nothing in the build could
detect that, which is precisely why it survived so long.

A single total is not enough, because two failure modes both produce a healthy
number. All the movers clumped into one act is as wrong as none at all, and a
perfectly even sprinkle is worse than either -- constant motion everywhere reads
as noise and gives the eye no rest, so the busy passages stop landing. What the
census therefore measures is the SHAPE of motion across the flight: counts per
2,000px band, and whether those counts alternate.

Reported, not asserted, on purpose. "Composed" is a judgement about rhythm; this
tool's job is to put the numbers in front of that judgement and to fail only on
the two things that are unambiguously wrong -- a band of real encounters with
nothing moving in it, and a flat distribution.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAND = 2000
LEVEL_END = 26600

# gnd/mid/top all take x as their first argument; that is the only position
# information the census needs.
PLACE = re.compile(r'^\s*(gnd|mid|top)\(\s*(-?\d+)')


def census() -> tuple[list[int], list[int]]:
    """Return (moving, total) counts per band."""
    path = os.path.join(ROOT, 'src', 'level.ts')
    src = io.open(path, encoding='utf-8').read().splitlines()
    n = LEVEL_END // BAND + 1
    moving = [0] * n
    total = [0] * n
    for line in src:
        m = PLACE.match(line)
        if not m:
            continue
        x = int(m.group(2))
        if x < 0:
            continue
        b = min(x // BAND, n - 1)
        total[b] += 1
        # a placement is one line in this file's style, so the motion field is
        # on the same line as the x it belongs to
        if 'motion:' in line:
            moving[b] += 1
    return moving, total


def main() -> int:
    moving, total = census()
    print(f'{sum(moving)} moving of {sum(total)} placed pieces\n')
    print(f'{"band":>14}  {"move":>4} {"all":>4}  profile')
    for i, (mv, tot) in enumerate(zip(moving, total)):
        lo = i * BAND
        bar = '#' * mv + '.' * max(0, min(tot, 24) - mv)
        print(f'{lo:>6}-{lo+BAND:<7} {mv:>4} {tot:>4}  {bar}')

    fails = []

    # 1) a stretch with real encounters and nothing moving in it is dead air
    dead = [i for i, (mv, tot) in enumerate(zip(moving, total)) if tot >= 4 and mv == 0]
    if dead:
        where = ', '.join(f'{i*BAND}-{(i+1)*BAND}' for i in dead)
        fails.append(f'{len(dead)} populated band(s) with zero motion: {where}')

    # 2) a flat profile is not a composition. Measured as the spread of the
    #    populated bands' moving counts: if every band carries roughly the same
    #    number, nothing alternates and there is no rhythm to read.
    live = [mv for mv, tot in zip(moving, total) if tot >= 4]
    if len(live) >= 4:
        lo, hi = min(live), max(live)
        if hi - lo < 2:
            fails.append(f'motion is flat across the flight (every band {lo}-{hi}) — no density rhythm')

    if fails:
        print('\nR21 FAIL')
        for f in fails:
            print(f'  - {f}')
        return 1
    print('\nR21 PASS — every populated stretch moves, and the density alternates')
    return 0


if __name__ == '__main__':
    sys.exit(main())
