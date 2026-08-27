import asyncio, json, os
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\h"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

# x positions to visit: mote arcs, movers, first-encounters
SWEEP = [
    ("m4850_arc1", 4850),
    ("m7000_draft", 7000),
    ("m9950_arc3", 9950),
    ("m15650_arc4", 15650),
    ("m17150_arc5", 17150),
    ("m19320_arc6", 19320),
    ("m24700_arc7", 24700),
    ("m25800_tailwind", 25800),
    ("dead_2000", 2000),
    ("dead_12500", 12500),
    ("dead_21000", 21000),
]

async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        logs=[]
        page.on('console', lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on('pageerror', lambda e: logs.append(f"PAGEERROR: {e}"))
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_timeout(6000)
        await page.screenshot(path=SHOTS + r"\00_boot.png")

        out['handles'] = await page.evaluate("""() => ({
            day: !!window.__day, game: !!window.__game,
            keys: window.__day ? Object.keys(window.__day).filter(k=>!k.startsWith('_')).slice(0,60) : []
        })""")

        # mote geometry: measured, not inferred
        out['motes'] = await page.evaluate("""() => {
          const d = window.__day; if (!d || !d.motes) return 'no motes field';
          const arcs = {};
          for (const m of d.motes) {
            const key = Math.round(m.x/1000)*1000;
            (arcs[key] = arcs[key] || []).push({x: Math.round(m.x), y: Math.round(m.y)});
          }
          const summary = [];
          for (const k of Object.keys(arcs)) {
            const a = arcs[k].sort((p,q)=>p.x-q.x);
            summary.push({bucket:+k, n:a.length,
              x0:a[0].x, x1:a[a.length-1].x,
              ymin: Math.min(...a.map(p=>p.y)), ymax: Math.max(...a.map(p=>p.y)),
              pts: a});
          }
          return {total: d.motes.length, arcs: summary};
        }""")

        for name, x in SWEEP:
            await page.evaluate(f"window.__day.scrollX = {x}")
            await page.wait_for_timeout(900)
            await page.screenshot(path=SHOTS + f"\\{name}.png")

        out['logs'] = logs[-20:]
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1)[:9000])

asyncio.run(main())
