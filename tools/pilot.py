import sys
"""A pilot that actually plays the game, for two-sided fairness testing.

The previous probe steered toward the clearest lane and held Gather, and did
WORSE than doing nothing (died at x~11,000 where a parked pointer reached
16,500). Three reasons, all fixed here:

  1. It used one verb of six. It never called, surged, flared or dived - and
     ~45% of knocked-out birds are RECOVERABLE, so it abandoned birds a human
     gets back by pressing C. That alone accounted for a large share of its
     "losses".
  2. Its lane-finding sampled clearance at a SINGLE x. The flock is ~200px
     wide, so a gap clear at the sample point can be sealed 200px later - it
     confidently steered into pockets that closed.
  3. It aimed with a 5%/frame lerp at a target that could jump hundreds of
     pixels, so it was permanently heading where it should have been, and
     sometimes arrived inside the obstacle it was avoiding.

This version samples a CORRIDOR, accounts for the flock's own size, steers
proportionally to how urgent the correction is, and uses the ability layer.
It is still not a good player - but it is a fair floor for "did a competent
person have a chance", which is the only thing the difficulty contract needs.
"""
from playwright.sync_api import sync_playwright

DEV = 'http://localhost:5199/?day'
END = 25400

PILOT = """(cfg) => {
  const d = window.__day, dt = 16.667;
  let steps = 0, gf = 0, calls = 0, surges = 0;
  let aim = 500, gatherT = 0, callT = 0;

  const clearAt = (x, y) => {
    // clearance for a body the size of the flock, not a point
    let worst = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid') continue;
      if (x < o.x - o.hw - 300 || x > o.x + o.hw + 300) continue;
      const dx = Math.abs(x - o.x) - o.hw - cfg.halfW;
      const dy = Math.abs(y - o.y) - o.hh - cfg.halfH;
      // graded, never disqualifying: penetration is a big negative rather than
      // a veto, so there is always a least-bad lane to steer for
      const dist = (dx < 0 && dy < 0) ? Math.max(dx, dy) * 3 : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < worst) worst = dist;
    }
    return worst;
  };

  while (steps < 14000 && d.flock && d.flock.count > 0 && d.scrollX < 25400) {
    const f = d.flock;

    // --- pick a lane by scoring the whole CORRIDOR the flock must fly through
    let best = aim, bestScore = -1e9;
    for (let y = 190; y <= 810; y += 22) {
      let score = 0;
      for (let s = 1; s <= cfg.samples; s++) {
        const x = f.centerX + (cfg.look * s) / cfg.samples;
        // ease from the current altitude toward the candidate, as we would fly
        const yy = f.centerY + (y - f.centerY) * (s / cfg.samples);
        // nearer samples matter more - they are the ones about to happen
        const w = 1 + (cfg.samples - s) / cfg.samples;
        score += Math.min(clearAt(x, yy), 260) * w;
      }
      // CHASE THE LIGHT. Daylight is the resource the whole game runs on, so a
      // pilot that ignores motes is not playing it - it just flies down empty
      // corridors until the dark eats it. Lanes that pass through light are
      // worth a detour, and worth more the darker it gets.
      const hunger = 1 + (1 - (d.night ? d.night.daylight : 1)) * 2.5;
      for (const m of d.motes) {
        if (!m.img.visible) continue;
        const mdx = m.x - f.centerX;
        if (mdx < -60 || mdx > cfg.look * 1.5) continue;
        const mdy = Math.abs(m.y - y);
        if (mdy < 190) score += (190 - mdy) * 0.45 * hunger;
      }
      score -= Math.abs(y - 500) * 0.5;        // prefer mid-air over the extremes
      score -= Math.abs(y - f.centerY) * 0.35; // prefer not to lurch
      if (score > bestScore) { bestScore = score; best = y; }
    }

    // --- steer: correct faster when the correction is bigger
    const err = best - aim;
    aim += err * Math.min(0.35, 0.04 + Math.abs(err) / 1400);
    const ptr = d.input.activePointer;
    ptr.x = Math.max(1, Math.min(1535, f.centerX - d.scrollX + cfg.lead));
    ptr.y = Math.max(120, Math.min(860, aim));

    // --- gather when stone is genuinely near, and let go so strain drains
    let near = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid') continue;
      const dx = Math.abs(f.centerX - o.x) - o.hw - cfg.halfW;
      const dy = Math.abs(f.centerY - o.y) - o.hh - cfg.halfH;
      const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < near) near = dist;
    }
    if (near < cfg.gatherAt) gatherT = 0.5;
    gatherT = Math.max(0, gatherT - dt / 1000);
    d.touch.gather = gatherT > 0;
    if (gatherT > 0) gf++;

    // --- SPREAD to harvest light when nothing is close (the new mechanic's
    //     central trade: wide when safe, tight when not)
    // SPREAD is how you harvest, and a wide flock clips more stone - so only
    // pay that price when there is actually light within reach. Holding it
    // indiscriminately is what a bad player does.
    let lightNear = false;
    for (const m of d.motes) {
      if (!m.img.visible) continue;
      const mdx = m.x - f.centerX;
      if (mdx > -40 && mdx < 900 && Math.abs(m.y - f.centerY) < 300) { lightNear = true; break; }
    }
    d.touch.spread = gatherT <= 0 && near > cfg.spreadAt && lightNear;

    // --- ECHO CALL to recover scattered birds. This is the verb the old probe
    //     ignored entirely, and it is where a large part of the loss went.
    callT = Math.max(0, callT - dt / 1000);
    if (callT <= 0 && d.scatter && d.scatter.recoverableCount > 1) {
      try { d.echoCall(); calls++; callT = 6.5; } catch (e) {}
    }

    // a player reads and dismisses; a probe that does not is measuring a
    // world held at 18% speed by an open teaching card
    if (d.card) d.dismissCard();
    d.update(performance.now() + steps * dt, dt);
    steps++;
  }
  return {
    birds: d.flock ? d.flock.count : 0,
    x: Math.round(d.scrollX),
    collisions: d.stats ? d.stats.collisionEvents : -1,
    lost: d.stats ? d.stats.lost : -1,
    daylight: d.night ? Math.round(d.night.daylight * 100) : -1,
    gatherPct: Math.round(gf / Math.max(1, steps) * 100),
    calls, steps,
  };
}"""

AFK = """() => {
  const d = window.__day, dt = 16.667; let steps = 0;
  while (steps < 14000 && d.flock && d.flock.count > 0 && d.scrollX < 25400) {
    d.update(performance.now() + steps * dt, dt); steps++;
  }
  return { birds: d.flock ? d.flock.count : 0, x: Math.round(d.scrollX) };
}"""


def boot(pg):
    pg.set_default_timeout(120000)
    pg.goto(DEV, timeout=120000)
    pg.wait_for_load_state('networkidle')
    for _ in range(30):
        if pg.evaluate("() => !!window.__day"):
            return True
        pg.wait_for_timeout(700)
    return False


def main():
    cfg = {'look': 620, 'samples': 5, 'lead': 300, 'halfW': 70, 'halfH': 58,
           'gatherAt': 190, 'spreadAt': 420}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = b.new_page(viewport={'width': 1536, 'height': 960})
        failed = False

        for look, margin in [(0.62, 60), (0.72, 70)]:
            boot(pg)
            pg.evaluate("(c) => { window.__AVOID.lookahead = c.l; window.__AVOID.margin = c.m; }",
                        {'l': look, 'm': margin})
            pg.mouse.move(1150, 110)
            afk = pg.evaluate(AFK)
            afk_ok = afk['birds'] == 0

            boot(pg)
            pg.evaluate("(c) => { window.__AVOID.lookahead = c.l; window.__AVOID.margin = c.m; }",
                        {'l': look, 'm': margin})
            sk = pg.evaluate(PILOT, cfg)
            sk_ok = sk['x'] >= END and sk['birds'] > 0
            verdict = 'PASS' if (afk_ok and sk_ok) else 'fail'
            if not (afk_ok and sk_ok):
                failed = True
            print(f"{look:.2f}/{margin:<4} AFK {'dies@'+str(afk['x']) if afk_ok else 'SURVIVES!!':>12} | "
                  f"pilot x={sk['x']:>5} birds={sk['birds']:>3} col={sk['collisions']:>3} "
                  f"day={sk['daylight']:>3}% {verdict}")
        b.close()
    return 1 if failed else 0


if __name__ == '__main__':
    # A CRASH MUST NOT READ AS A PASS. This exited 0 after failing to reach the
    # dev server at all, so the two-sided difficulty contract could report
    # success having never run a single frame. A gate that cannot fail is not a
    # gate, and this one guards the whole balance of the game.
    try:
        sys.exit(main())
    except Exception as e:
        print(f'PILOT DID NOT RUN: {e}')
        print('the difficulty contract is UNVERIFIED — this is a failure, not a pass')
        sys.exit(2)
