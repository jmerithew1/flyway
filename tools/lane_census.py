"""Does the terrain actually CONSTRAIN the flight lane?

The owner's report: "you can fly over a lot of obstacles... all are over" and
"why aren't any of the ruins making them have to go under?"

The suspicion this tests: pieces are placed, but placed clear of the lane the
flock actually flies in. A ground piece 400px tall sits at y=548..948 while the
flock cruises around y=430 — so it is scenery, not an obstacle. A top-mounted
piece 260px tall hangs at y=0..234 and is likewise never in the way. The level
would then LOOK dense while asking nothing of the player, which is exactly the
reported experience.

For every piece this reports the vertical span it occupies and whether it
intrudes into the lane band at all, and classifies what it asks the player to
do: fly UNDER it, fly OVER it, thread THROUGH an opening, or nothing.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GROUND = 948
# The band the flock actually occupies in normal flight. The intent point sits
# near 430 and the murmuration is roughly 200px deep at neutral spread.
LANE_TOP, LANE_BOT = 330, 560

PLACE = re.compile(r"^\s*(gnd|mid|top)\(\s*(-?\d+)\s*,\s*(?:(-?\d+)\s*,\s*)?'([a-z0-9_]+)'\s*,\s*(\d+)")


def spans():
    src = io.open(os.path.join(ROOT, 'src/level.ts'), encoding='utf-8').read().splitlines()
    out = []
    for line in src:
        m = PLACE.match(line)
        if not m:
            continue
        # Scenery is drawn, never collided with, and seated behind the play
        # plane. It asks nothing BY DESIGN, so counting it as an inert obstacle
        # measures the opposite of the truth — it would punish composing scale
        # into the world, which is the thing this level most needed.
        if 'decor: true' in line:
            continue
        mount, x, midy, key, h = m.group(1), int(m.group(2)), m.group(3), m.group(4), int(m.group(5))
        if mount == 'gnd':
            cy = GROUND - h / 2
        elif mount == 'top':
            cy = h / 2 - 26
        else:
            cy = int(midy) if midy else 430
        top, bot = cy - h / 2, cy + h / 2
        out.append((x, mount, key, h, top, bot, 'openings:' in line or 'flow:' in line))
    return out


def main() -> int:
    rows = spans()
    under = over = through = nothing = 0
    clear_top = clear_bot = 0
    print(f'{"x":>7} {"mount":<5} {"h":>5} {"span":>13}  asks')
    for x, mount, key, h, top, bot, has_open in sorted(rows):
        # how much lane is left above and below this piece
        room_above = max(0, top - LANE_TOP)
        room_below = max(0, LANE_BOT - bot)
        intrudes = not (bot < LANE_TOP or top > LANE_BOT)
        if not intrudes:
            ask = 'NOTHING — clear of the lane entirely'
            nothing += 1
        elif has_open:
            ask = 'THREAD an opening'
            through += 1
        elif mount == 'top':
            ask = 'fly UNDER'
            under += 1
        else:
            ask = 'fly OVER'
            over += 1
        if mount == 'top' and bot < LANE_TOP:
            clear_top += 1
        if mount == 'gnd' and top > LANE_BOT:
            clear_bot += 1
        print(f'{x:>7} {mount:<5} {h:>5} {int(top):>5}..{int(bot):<6}  {ask}')

    n = len(rows)
    print(f'\n{n} placed pieces')
    print(f'  fly OVER   {over}')
    print(f'  fly UNDER  {under}')
    print(f'  THREAD     {through}')
    print(f'  NOTHING    {nothing}   <- placed, but never in the flight lane')
    print(f'\n{clear_top} top-mounted pieces hang entirely ABOVE the lane (they cannot force a descent)')
    print(f'{clear_bot} ground pieces sit entirely BELOW the lane (they cannot force a climb)')

    fails = []
    if nothing > n * 0.3:
        fails.append(f'{nothing} of {n} pieces ({100*nothing//n}%) never enter the flight lane — the level looks dense but asks nothing')
    if under < n * 0.15:
        fails.append(f'only {under} of {n} pieces ask the player to fly UNDER — the flight is one-note vertically')
    if fails:
        print('\nFAIL')
        for f in fails:
            print(f'  - {f}')
        return 1
    print('\nPASS — the terrain genuinely constrains the lane, in both directions')
    return 0


if __name__ == '__main__':
    sys.exit(main())
