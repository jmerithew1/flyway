import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\h7"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

async def main():
    out = {'phases': []}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        page.set_default_timeout(90000)
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.falcon", timeout=60000)
        await page.wait_for_timeout(1200)
        # jump to just before the first falcon zone (8150)
        await page.evaluate("""() => { const d = window.__day;
            d.scrollX = 7500; d.cameras.main.scrollX = 7500;
            d.flock.birds.forEach(b => { b.x += 7500 - 200; });
        }""")
        await page.mouse.move(700, 400)
        await page.wait_for_timeout(1500)
        seen = set()
        for k in range(46):
            st = await page.evaluate("""() => { const d=window.__day, f=d.falcon;
              return {phase: f.phase, warn: f.inWarning, shadowA: +(f.shadow?f.shadow.alpha:0).toFixed(3),
                      sx: Math.round(d.scrollX), birds: d.flock.count, t:+d.simClock.toFixed(1)};}""")
            out['phases'].append(st)
            if st['phase'] not in seen and st['phase'] != 'idle':
                seen.add(st['phase'])
                await page.screenshot(path=SHOTS + f"\\falcon_{st['phase']}_{k:02d}.png")
            elif k % 9 == 0:
                await page.screenshot(path=SHOTS + f"\\falcon_t{k:02d}_{st['phase']}.png")
            await page.mouse.move(700, 400 + (30 if k%2 else -30))
            await page.wait_for_timeout(900)
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
