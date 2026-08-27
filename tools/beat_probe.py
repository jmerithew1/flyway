"""Fast numeric probe of the I1 dive — no screenshots, just the state per frame."""
import asyncio, json
from playwright.async_api import async_playwright

BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

FREEZE = """() => { const g = window.__game; if (!g.__cb) { g.__cb = g.loop.callback; g.__t = performance.now(); } g.loop.callback = () => {}; return true; }"""
STEP = """(n) => { const g = window.__game; for (let i = 0; i < n; i++) { g.__t += 16.667; g.__cb(g.__t, 16.667); } return 1; }"""

ARM = """(mob) => {
  const s = window.__day, f = s.falcon;
  f.phase = 'window'; f.timer = 0; f.window = 0.0001;
  f.zoneArrivalCount = mob ? s.flock.count : 99999;
  if (mob) { s.flock.form = 1; s.flock.gatherStrain = 0; } else { s.flock.form = -0.6; }
  return { view: [s.cameras.main.width, s.cameras.main.height],
           veil: { w: s.predatorVeil.width, h: s.predatorVeil.height, d: s.predatorVeil.depth,
                   x: s.predatorVeil.x, y: s.predatorVeil.y, sf: s.predatorVeil.scrollFactorX } };
}"""

ST = """() => {
  const s = window.__day, f = s.falcon;
  const vis = f.streaks.filter(x => x.visible);
  return { ph: f.phase, p: +f.diveT.toFixed(2), veil: +s.predatorVeil.alpha.toFixed(3),
    dim: +s.predatorDim.toFixed(3), tgt: s.predatorDimTarget, vv: s.predatorVeil.visible,
    n: vis.length, a: vis.map(x => +x.alpha.toFixed(2)),
    xy: vis.map(x => [Math.round(x.x - s.scrollX), Math.round(x.y)]),
    wh: vis.map(x => [Math.round(x.displayWidth), Math.round(x.displayHeight)]),
    fal: [Math.round(f.falcon.x - s.scrollX), Math.round(f.falcon.y)],
    hs: +s.hitStop.toFixed(3), flock: s.flock.count };
}"""


async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True, args=ARGS)
        c = await br.new_context(viewport={'width': 1536, 'height': 960})
        pg = await c.new_page()
        pg.set_default_timeout(120000)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto(BASE + "/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day", timeout=60000)
        await pg.wait_for_timeout(5000)
        await pg.mouse.move(760, 430)
        await pg.wait_for_timeout(1500)
        await pg.evaluate(FREEZE)
        info = await pg.evaluate(ARM, False)
        rows = []
        for f in range(0, 46):
            await pg.evaluate(STEP, 1)
            rows.append({'f': f, **(await pg.evaluate(ST))})
        print(json.dumps({'info': info, 'errs': errs}, indent=1))
        for r in rows:
            print(r)
        await br.close()

asyncio.run(main())
