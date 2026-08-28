"""Design-lead play harness. Read-only: drives the PRODUCTION preview build.

Not a QA smoke test. This exists to answer design questions: where the run
peaks, when each verb is actually demanded, what kills you and whether the
game ever says so. It steps the scene deterministically (so headless
SwiftShader's 5fps does not distort the run), then hands a frame back to the
renderer before every capture so the screenshot is of a real rendered frame.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5212/flyway/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "qa/shots/dl"
os.makedirs(OUT, exist_ok=True)

logs = []

# A competent-but-human pilot. Steers a corridor, gathers near stone, spreads
# for light, calls when birds are adrift. Same shape as tools/pilot.py so the
# difficulty read is comparable, but it also RECORDS a timeline.
PLAY = """(cfg) => {
  const d = window.__day, dt = 16.667;
  let steps = 0, aim = 500, gatherT = 0, callT = 0;
  const tl = [];           // timeline samples
  const events = [];       // discrete events
  let lastCount = d.flock.count, lastX = 0, lastCause = '';
  let gf = 0, sf = 0, calls = 0, surges = 0, flares = 0, dives = 0;
  let peakChain = 0, cardsSeen = 0, cardOpen = false, cardFrames = 0;
  let collideFrames = 0;

  const clearAt = (x, y) => {
    let worst = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid' || o.broken) continue;
      if (x < o.x - o.hw - 300 || x > o.x + o.hw + 300) continue;
      const dx = Math.abs(x - o.x) - o.hw - cfg.halfW;
      const dy = Math.abs(y - o.y) - o.hh - cfg.halfH;
      const dist = (dx < 0 && dy < 0) ? Math.max(dx, dy) * 3
                 : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < worst) worst = dist;
    }
    return worst;
  };

  while (steps < cfg.maxSteps && d.flock && d.flock.count > 0 && d.scrollX < cfg.stopX) {
    const f = d.flock;

    let best = aim, bestScore = -1e9;
    for (let y = 190; y <= 810; y += 22) {
      let score = 0;
      for (let s = 1; s <= 5; s++) {
        const x = f.centerX + (620 * s) / 5;
        const yy = f.centerY + (y - f.centerY) * (s / 5);
        score += Math.min(clearAt(x, yy), 260) * (1 + (5 - s) / 5);
      }
      const hunger = 1 + (1 - (d.night ? d.night.daylight : 1)) * 2.5;
      for (const m of d.motes) {
        if (m.taken) continue;
        const mdx = m.x - f.centerX;
        if (mdx < -60 || mdx > 930) continue;
        const mdy = Math.abs(m.y - y);
        if (mdy < 190) score += (190 - mdy) * 0.45 * hunger;
      }
      score -= Math.abs(y - 500) * 0.5;
      score -= Math.abs(y - f.centerY) * 0.35;
      if (score > bestScore) { bestScore = score; best = y; }
    }
    const err = best - aim;
    aim += err * Math.min(0.35, 0.04 + Math.abs(err) / 1400);
    const ptr = d.input.activePointer;
    ptr.x = Math.max(1, Math.min(1535, f.centerX - d.scrollX + 300));
    ptr.y = Math.max(120, Math.min(860, aim));

    let near = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid' || o.broken) continue;
      const dx = Math.abs(f.centerX - o.x) - o.hw - cfg.halfW;
      const dy = Math.abs(f.centerY - o.y) - o.hh - cfg.halfH;
      const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < near) near = dist;
    }
    if (near < 190) gatherT = 0.5;
    gatherT = Math.max(0, gatherT - dt / 1000);
    d.touch.gather = gatherT > 0;
    if (gatherT > 0) gf++;

    let lightNear = false;
    for (const m of d.motes) {
      if (m.taken) continue;
      const mdx = m.x - f.centerX;
      if (mdx > -40 && mdx < 900 && Math.abs(m.y - f.centerY) < 300) { lightNear = true; break; }
    }
    d.touch.spread = gatherT <= 0 && near > 420 && lightNear;
    if (d.touch.spread) sf++;

    callT = Math.max(0, callT - dt / 1000);
    if (callT <= 0 && d.scatter && d.scatter.recoverableCount > 1) {
      try { d.echoCall(); calls++; callT = 6.5; } catch (e) {}
    }

    // --- record what the game is TELLING the player, before dismissing
    if (d.card) {
      if (!cardOpen) { cardOpen = true; cardsSeen++; }
      cardFrames++;
      d.dismissCard();
    } else cardOpen = false;
    // the two teaching systems are unaware of each other: count the frames
    // where a CARD and a PROMPT are both on screen at once
    if (d.card && d.prompt) collideFrames++;

    d.update(performance.now() + steps * dt, dt);
    steps++;

    // --- detect losses and whether a cause was ever named
    const c = d.flock.count;
    if (c < lastCount) {
      const cause = d.lastLossSource || '';
      events.push({ x: Math.round(d.scrollX), t: +(steps * dt / 1000).toFixed(1),
                    lost: lastCount - c, left: c, cause,
                    named: cause !== '' && cause !== lastCause });
      lastCause = cause;
      lastCount = c;
    }
    if (d.score && d.score.bestChain > peakChain) peakChain = d.score.bestChain;

    if (d.scrollX - lastX > 500) {
      lastX = d.scrollX;
      tl.push({ x: Math.round(d.scrollX), t: +(steps * dt / 1000).toFixed(1),
                birds: c,
                day: d.night ? +d.night.daylight.toFixed(3) : -1,
                enc: d.night ? +d.night.encroach.toFixed(3) : -1,
                form: +f.form.toFixed(2),
                gStrain: +f.gatherStrain.toFixed(2),
                sStrain: +f.spreadStrain.toFixed(2) });
    }
  }
  return { birds: d.flock ? d.flock.count : 0, x: Math.round(d.scrollX),
           secs: +(steps * dt / 1000).toFixed(1),
           day: d.night ? Math.round(d.night.daylight * 100) : -1,
           lost: d.stats ? d.stats.lost : -1,
           collisions: d.stats ? d.stats.collisionEvents : -1,
           gatherPct: Math.round(gf / Math.max(1, steps) * 100),
           spreadPct: Math.round(sf / Math.max(1, steps) * 100),
           calls, peakChain, cardsSeen,
           cardSecs: +(cardFrames * dt / 1000).toFixed(1),
           prompts: [...(d.shownPrompts||[])], collideFrames, tl, events };
}"""

# A REAL first-time player: steers, and does nothing else. No verbs at all.
NAIVE = """(cfg) => {
  const d = window.__day, dt = 16.667;
  let steps = 0, aim = 500;
  const events = []; const tl = [];
  let lastCount = d.flock.count, lastX = 0;
  const clearAt = (x, y) => {
    let worst = 1e9;
    for (const o of d.obstacles) {
      if (o.kind !== 'solid' || o.broken) continue;
      if (x < o.x - o.hw - 300 || x > o.x + o.hw + 300) continue;
      const dx = Math.abs(x - o.x) - o.hw - 70;
      const dy = Math.abs(y - o.y) - o.hh - 58;
      const dist = (dx < 0 && dy < 0) ? Math.max(dx, dy) * 3
                 : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if (dist < worst) worst = dist;
    }
    return worst;
  };
  while (steps < cfg.maxSteps && d.flock && d.flock.count > 0 && d.scrollX < cfg.stopX) {
    const f = d.flock;
    // a beginner steers around stone and toward pretty lights, badly, and
    // never touches a key. This is the honest floor for "did they learn".
    let best = aim, bestScore = -1e9;
    for (let y = 220; y <= 780; y += 40) {
      let score = 0;
      for (let s = 1; s <= 3; s++) {
        const x = f.centerX + (380 * s) / 3;
        score += Math.min(clearAt(x, f.centerY + (y - f.centerY) * (s / 3)), 240);
      }
      for (const m of d.motes) {
        if (m.taken) continue;
        const mdx = m.x - f.centerX;
        if (mdx < 0 || mdx > 600) continue;
        if (Math.abs(m.y - y) < 150) score += 40;
      }
      score -= Math.abs(y - f.centerY) * 0.5;
      if (score > bestScore) { bestScore = score; best = y; }
    }
    aim += (best - aim) * 0.08;   // slower, human-ish correction
    const ptr = d.input.activePointer;
    ptr.x = Math.max(1, Math.min(1535, f.centerX - d.scrollX + 260));
    ptr.y = Math.max(120, Math.min(860, aim));
    if (d.card) d.dismissCard();
    d.update(performance.now() + steps * dt, dt);
    steps++;
    const c = d.flock.count;
    if (c < lastCount) {
      events.push({ x: Math.round(d.scrollX), t: +(steps*dt/1000).toFixed(1),
                    lost: lastCount - c, left: c, cause: d.lastLossSource || '' });
      lastCount = c;
    }
    if (d.scrollX - lastX > 1000) {
      lastX = d.scrollX;
      tl.push({ x: Math.round(d.scrollX), birds: c,
                day: d.night ? +d.night.daylight.toFixed(3) : -1 });
    }
  }
  return { birds: d.flock ? d.flock.count : 0, x: Math.round(d.scrollX),
           secs: +(steps*dt/1000).toFixed(1),
           day: d.night ? Math.round(d.night.daylight*100) : -1,
           failing: !!d.failing, tl, events };
}"""


def boot(pg, url):
    pg.set_default_timeout(120000)
    pg.goto(url, timeout=120000)
    pg.wait_for_load_state('networkidle')
    for _ in range(40):
        if pg.evaluate("() => !!window.__day"):
            pg.wait_for_timeout(400)
            return True
        pg.wait_for_timeout(600)
    return False


def main():
    mode = sys.argv[2] if len(sys.argv) > 2 else 'play'
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = b.new_page(viewport={'width': 1536, 'height': 960})
        pg.on('console', lambda m: logs.append(f"[{m.type}] {m.text}"[:300]))
        pg.on('pageerror', lambda e: logs.append(f"[pageerror] {e}"[:300]))

        if mode == 'title':
            pg.goto(BASE, timeout=120000)
            pg.wait_for_load_state('networkidle')
            pg.wait_for_timeout(6000)
            pg.screenshot(path=f"{OUT}/00_title.png")
            print(json.dumps({'logs': logs[-15:]}))
            b.close(); return

        cfg = {'halfW': 70, 'halfH': 58, 'maxSteps': 20000, 'stopX': 25400}

        if mode == 'naive':
            boot(pg, BASE + '?day')
            r = pg.evaluate(NAIVE, cfg)
            pg.wait_for_timeout(400)
            pg.screenshot(path=f"{OUT}/naive_end.png")
            r['logs'] = logs[-10:]
            print(json.dumps(r, indent=1))
            b.close(); return

        if mode == 'shots':
            # seek to authored x positions and READ the frame at each
            marks = [int(x) for x in sys.argv[3].split(',')]
            boot(pg, BASE + '?day')
            for m in marks:
                c = dict(cfg); c['stopX'] = m
                pg.evaluate(PLAY, c)
                pg.wait_for_timeout(500)   # hand a frame back to the renderer
                pg.screenshot(path=f"{OUT}/x{m:05d}.png")
                st = pg.evaluate("()=>{const d=window.__day;return{x:Math.round(d.scrollX),birds:d.flock.count,day:+d.night.daylight.toFixed(2),enc:+d.night.encroach.toFixed(2)}}")
                print(m, st)
            print(json.dumps({'logs': logs[-10:]}))
            b.close(); return

        boot(pg, BASE + '?day')
        r = pg.evaluate(PLAY, cfg)
        pg.wait_for_timeout(600)
        pg.screenshot(path=f"{OUT}/play_end.png")
        r['logs'] = logs[-12:]
        print(json.dumps(r, indent=1))
        b.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'RUN FAILED: {e}')
