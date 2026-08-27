"""Profile what the frame is actually spending itself on.

The headless renderer here is SwiftShader (software), so absolute frame times
are meaningless - it reports ~500ms regardless. But CPU work is measured the
same way it would be on real hardware, and the things that usually make a
Phaser game choppy are countable rather than timed:

  - active tweens          (each is a per-frame object update)
  - display list size      (every entry gets a transform pass, on or off screen)
  - per-frame allocations  (arrays built in update() feed the GC, which is what
                            a player perceives as a periodic hitch rather than
                            a low frame rate)
  - sim cost               (flock.update, measured directly)

That last one matters most for "choppy" as opposed to "slow": a steady 30fps
feels smoother than a 60fps average punctuated by GC pauses.
"""
from playwright.sync_api import sync_playwright

DEV = 'http://localhost:5199/?day'

PROFILE = """() => new Promise(res => {
  const d = window.__day, g = window.__game;

  // ---- how much work is standing there every frame, regardless of drawing
  const tweens = g.scene.scenes.reduce((n, s) => n + (s.tweens ? s.tweens.getTweens().length : 0), 0);
  const display = d.children.list.length;
  let visible = 0, offscreen = 0;
  const W = g.scale.width, H = g.scale.height;
  for (const o of d.children.list) {
    if (!o.visible) continue;
    visible++;
    const x = o.x - (o.scrollFactorX === 0 ? 0 : d.scrollX);
    if (x < -600 || x > W + 600) offscreen++;
  }

  // ---- sim cost, timed directly
  const flock = d.flock;
  const obstacles = d.nearObstacles ? d.nearObstacles() : d.obstacles;
  let simMs = 0;
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) {
    flock.update(1 / 60, { x: flock.centerX + 200, y: flock.centerY, gather: false, spread: false }, obstacles);
  }
  simMs = (performance.now() - t0) / 30;

  // ---- GC pressure: watch heap growth over a second of real frames
  const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  let frames = 0;
  const times = [];
  let last = performance.now();
  const tick = () => {
    const t = performance.now();
    times.push(t - last);
    last = t;
    frames++;
    if (frames < 60) { requestAnimationFrame(tick); return; }
    const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    times.sort((a, b) => a - b);
    const med = times[30];
    const p95 = times[57];
    res({
      tweens, display, visible, offscreen,
      simMs: Math.round(simMs * 100) / 100,
      birds: flock.count,
      motes: d.motes.length,
      moteVisible: d.motes.filter(m => m.img.visible).length,
      heapGrowthKB: Math.round((heap1 - heap0) / 1024),
      medianMs: Math.round(med * 10) / 10,
      p95Ms: Math.round(p95 * 10) / 10,
      jitter: Math.round((p95 - med) * 10) / 10,
    });
  };
  requestAnimationFrame(tick);
})"""


def main() -> None:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--enable-precise-memory-info'])
        pg = b.new_page(viewport={'width': 1536, 'height': 960})
        pg.set_default_timeout(120000)
        pg.goto(DEV, timeout=120000)
        pg.wait_for_load_state('networkidle')
        for _ in range(35):
            if pg.evaluate("() => !!(window.__day && window.__day.night)"):
                break
            pg.wait_for_timeout(700)
        pg.wait_for_timeout(4000)

        for label, setup in [
            ('clear sky', "() => { window.__day.night.daylight = 1; }"),
            ('fog closing', "() => { const d=window.__day; d.night.daylight=0.25; "
                            "for(let i=0;i<150;i++) d.night.update(1/60,d.flock,d.scrollX,1536,960); }"),
        ]:
            pg.evaluate(setup)
            pg.wait_for_timeout(1500)
            r = pg.evaluate(PROFILE)
            print(f"\n--- {label}")
            print(f"  active tweens      {r['tweens']}")
            print(f"  display list       {r['display']}  ({r['visible']} visible, {r['offscreen']} of those off-screen)")
            print(f"  motes              {r['motes']} placed, {r['moteVisible']} visible")
            print(f"  flock.update       {r['simMs']} ms/frame  ({r['birds']} birds)")
            print(f"  heap growth        {r['heapGrowthKB']} KB / 60 frames   <- GC pressure = hitching")
            print(f"  frame median       {r['medianMs']} ms   p95 {r['p95Ms']} ms   JITTER {r['jitter']} ms")
        b.close()


if __name__ == '__main__':
    main()
