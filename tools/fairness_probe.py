"""Two-sided fairness probe.

The contract the difficulty has to satisfy:
  - a player who does nothing must LOSE (otherwise there is no game),
  - a player who flies sensibly must FINISH (otherwise it is unfair).

The skilled pilot here is deliberately dumb - it reads the collider field
ahead, aims at the largest clear gap, and holds Gather when stone is close.
Anything a human would work out in twenty seconds. If this pilot cannot get
home, the level is not asking for skill, it is asking for luck.
"""
import sys
from playwright.sync_api import sync_playwright

DEV = 'http://localhost:5199'

PILOT = """(cfg) => {
  const d = window.__day;
  const dt = 16.667;
  let steps = 0, gatherFrames = 0;
  const H = window.__game.scale.height;

  while (steps < 12000 && d.flock && d.flock.count > 0 && d.scrollX < 25400) {
    const f = d.flock;
    // look ahead of the flock and find the roomiest lane
    const aheadX = f.centerX + cfg.look;
    let best = null, bestScore = -1;
    for (let y = 170; y <= 830; y += 20) {
      let clear = 1e9;
      for (const o of d.obstacles) {
        if (o.kind !== 'solid') continue;
        if (aheadX < o.x - o.hw - 260 || aheadX > o.x + o.hw + 260) continue;
        const dy = Math.abs(y - o.y) - o.hh;
        const dx = Math.abs(aheadX - o.x) - o.hw;
        const dist = Math.max(dy, 0) + Math.max(dx, 0) * 0.35;
        if (dist < clear) clear = dist;
      }
      // prefer clear air, mildly prefer staying near mid-height
      const score = Math.min(clear, 400) - Math.abs(y - 500) * 0.12;
      if (score > bestScore) { bestScore = score; best = y; }
    }

    // steer: the scene reads input.activePointer, so drive that directly
    const ptr = d.input.activePointer;
    ptr.x = Math.max(1, Math.min(1535, f.centerX - d.scrollX + cfg.look * 0.5));
    ptr.y = best;

    // Hold gather whenever stone is anywhere near the FLOCK - which is the
    // first thing any human works out, since gather is the shield. Scoring the
    // lookahead lane instead meant the pilot never gathered at all.
    let near = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid') continue;
      const dx = Math.abs(f.centerX - o.x) - o.hw;
      const dy = Math.abs(f.centerY - o.y) - o.hh;
      const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < near) near = dist;
    }
    const tight = near < cfg.tight;
    d.touch.gather = tight;
    if (tight) gatherFrames++;

    d.update(performance.now() + steps * dt, dt);
    steps++;
  }
  return {
    birds: d.flock ? d.flock.count : 0,
    x: Math.round(d.scrollX),
    collisions: d.stats ? d.stats.collisionEvents : -1,
    lost: d.stats ? d.stats.lost : -1,
    gatherPct: Math.round((gatherFrames / Math.max(1, steps)) * 100),
    steps,
  };
}"""

AFK = """(cfg) => {
  const d = window.__day; const dt = 16.667; let steps = 0;
  while (steps < 12000 && d.flock && d.flock.count > 0 && d.scrollX < 25400) {
    d.update(performance.now() + steps * dt, dt); steps++;
  }
  return { birds: d.flock ? d.flock.count : 0, x: Math.round(d.scrollX),
           collisions: d.stats ? d.stats.collisionEvents : -1,
           lost: d.stats ? d.stats.lost : -1, steps };
}"""


def run(script, cfg, mouse=None):
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = b.new_page(viewport={'width': 1536, 'height': 960})
        pg.goto(DEV + '/?day')
        pg.wait_for_load_state('networkidle')
        for _ in range(30):
            if pg.evaluate("() => !!window.__day"):
                break
            pg.wait_for_timeout(700)
        if mouse:
            pg.mouse.move(*mouse)
        r = pg.evaluate(script, cfg)
        b.close()
        return r


if __name__ == '__main__':
    print('--- AFK (must LOSE) ---')
    for mouse, lbl in [((1150, 110), 'parked high'), ((1150, 700), 'parked low')]:
        print(f'  {lbl:12} {run(AFK, {}, mouse)}')
    print('--- SKILLED (must FINISH) ---')
    for look, tight in [(520, 300), (620, 420)]:
        r = run(PILOT, {'look': look, 'tight': tight})
        ok = 'FINISHED' if r['x'] >= 25400 and r['birds'] > 0 else 'DIED'
        print(f"  look={look} tight={tight}: {ok}  {r}")
