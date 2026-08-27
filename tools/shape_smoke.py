import asyncio, json
from playwright.async_api import async_playwright
BASE = "http://localhost:58759"

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1536,'height':960}, device_scale_factor=1)
        page = await ctx.new_page(); page.set_default_timeout(60000)
        errs = []
        page.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        await page.goto(BASE + "/?day", wait_until="networkidle")
        try:
            await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=30000)
            ok = True
        except Exception as e:
            ok = False
        await page.wait_for_timeout(1500)
        info = await page.evaluate("""() => {
          const d = window.__day; if (!d) return {no:'__day'};
          const f = d.flock;
          return { count: f.count,
                   hasShapeEnvelope: typeof f.shapeEnvelope === 'function',
                   hasSlots: Array.isArray(f.shapeSlots),
                   slotIdx0: f.birds[0] ? f.birds[0].slotIdx : 'n/a' };
        }""")
        print(json.dumps({'booted': ok, 'info': info, 'errors': errs[:10]}, indent=1))
        await ctx.close(); await b.close()

asyncio.run(main())
