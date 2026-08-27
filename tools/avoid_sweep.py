"""Sweep the avoidance pair for the two-sided fairness contract, in one session.

Contract:
  AFK (pointer parked, no keys)     must DIE, and ideally before mid-level.
  SKILLED (steers + holds Gather)   must FINISH with birds to spare.

Both runs are driven deterministically off the same fixed dt, and the page is
reloaded between runs so no state leaks. window.__AVOID is mutated live.
"""
from playwright.sync_api import sync_playwright

DEV = 'http://localhost:5199/?day'
END = 25400

AFK = """() => {
  const d = window.__day, dt = 16.667; let steps = 0;
  while (steps < 12000 && d.flock && d.flock.count > 0 && d.scrollX < 25400) {
    d.update(performance.now() + steps * dt, dt); steps++;
  }
  return { birds: d.flock ? d.flock.count : 0, x: Math.round(d.scrollX) };
}"""

PILOT = """(cfg) => {
  const d = window.__day, dt = 16.667; let steps = 0, gf = 0;
  // A human does not re-aim every 16ms, and does not hold Gather forever.
  let aim = 500, gatherT = 0;
  while (steps < 12000 && d.flock && d.flock.count > 0 && d.scrollX < 25400) {
    const f = d.flock;
    const aheadX = f.centerX + cfg.look;
    let best = 500, bestScore = -1;
    for (let y = 170; y <= 830; y += 20) {
      let clear = 1e9;
      for (const o of d.obstacles) {
        if (o.kind !== 'solid') continue;
        if (aheadX < o.x - o.hw - 260 || aheadX > o.x + o.hw + 260) continue;
        const dy = Math.abs(y - o.y) - o.hh, dx = Math.abs(aheadX - o.x) - o.hw;
        const dist = Math.max(dy, 0) + Math.max(dx, 0) * 0.35;
        if (dist < clear) clear = dist;
      }
      const score = Math.min(clear, 400) - Math.abs(y - 500) * 0.12;
      if (score > bestScore) { bestScore = score; best = y; }
    }
    // ease toward the chosen lane instead of snapping to it: chasing a lane
    // that moves every frame whipsaws the flock straight into stone
    aim += (best - aim) * 0.05;
    const ptr = d.input.activePointer;
    ptr.x = Math.max(1, Math.min(1535, f.centerX - d.scrollX + cfg.look * 0.5));
    ptr.y = aim;
    let near = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid') continue;
      const dx = Math.abs(f.centerX - o.x) - o.hw, dy = Math.abs(f.centerY - o.y) - o.hh;
      const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < near) near = dist;
    }
    // gather only for real threats, and let go so strain can drain
    if (near < 150) gatherT = 0.55;
    gatherT = Math.max(0, gatherT - dt / 1000);
    const tight = gatherT > 0;
    d.touch.gather = tight;
    if (tight) gf++;
    d.update(performance.now() + steps * dt, dt); steps++;
  }
  return { birds: d.flock ? d.flock.count : 0, x: Math.round(d.scrollX),
           collisions: d.stats ? d.stats.collisionEvents : -1,
           gatherPct: Math.round(gf / Math.max(1, steps) * 100) };
}"""


def boot(pg):
    pg.goto(DEV)
    pg.wait_for_load_state('networkidle')
    for _ in range(30):
        if pg.evaluate("() => !!window.__day"):
            return True
        pg.wait_for_timeout(700)
    return False


def main():
    grid = [(0.88, 84), (0.95, 92)]
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = b.new_page(viewport={'width': 1536, 'height': 960})
        print(f"{'look/margin':>14} | {'AFK dies at':>12} | {'skilled':>26}")
        for look, margin in grid:
            boot(pg)
            pg.evaluate("(c) => { window.__AVOID.lookahead = c.l; window.__AVOID.margin = c.m; }",
                        {'l': look, 'm': margin})
            pg.mouse.move(1150, 110)
            afk = pg.evaluate(AFK)

            boot(pg)
            pg.evaluate("(c) => { window.__AVOID.lookahead = c.l; window.__AVOID.margin = c.m; }",
                        {'l': look, 'm': margin})
            sk = pg.evaluate(PILOT, {'look': 560})

            afk_ok = afk['birds'] == 0 and afk['x'] < 14000
            sk_ok = sk['x'] >= END and sk['birds'] > 0
            verdict = 'PASS' if (afk_ok and sk_ok) else 'fail'
            print(f"{look:5.2f}/{margin:<3}    | {afk['x']:>7} {'OK' if afk_ok else '!!':>3} | "
                  f"x={sk['x']:>5} birds={sk['birds']:>3} col={sk['collisions']:>3} "
                  f"g={sk['gatherPct']:>2}% {verdict}")
        b.close()


if __name__ == '__main__':
    main()
