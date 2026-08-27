import asyncio, json
from playwright.async_api import async_playwright
BASE = "http://localhost:58759"

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1536,'height':960}, device_scale_factor=1)
        page = await ctx.new_page(); page.set_default_timeout(60000)
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=30000)
        await page.wait_for_timeout(2500)
        print("keys:", await page.evaluate("() => Object.keys(window.__day)"))
        st = await page.evaluate("""() => { const s = window.__day.scene || null; return {
            hasScene: !!s, simClock: window.__day.simClock }; }""")
        print(st)
        await page.evaluate("""() => { const d=window.__day; window.__w=[];
          window.__iv=setInterval(()=>{window.__w.push([d.simClock&&+d.simClock.toFixed(2),
            d.flock.shapeKind||'', d.flock.pulse.toFixed(2)]);},60); }""")
        await page.mouse.move(1300, 480)
        await page.wait_for_timeout(800)
        await page.keyboard.down("Space"); await page.wait_for_timeout(70); await page.keyboard.up("Space")
        await page.wait_for_timeout(900)
        w = await page.evaluate("()=>{clearInterval(window.__iv);return window.__w;}")
        print("no-focus:", [r for r in w if r[1]][:3], "pulseMax", max(float(r[2]) for r in w))

        # now with an explicit canvas focus/click
        await page.evaluate("""() => { const d=window.__day; window.__w2=[];
          window.__iv2=setInterval(()=>{window.__w2.push([d.flock.shapeKind||'',
            +d.flock.shapeT.toFixed(3), +d.flock.pulse.toFixed(2)]);},50); }""")
        cv = await page.query_selector("canvas")
        await cv.click(position={'x': 700, 'y': 480})
        await page.wait_for_timeout(600)
        await page.keyboard.down("Space"); await page.wait_for_timeout(70); await page.keyboard.up("Space")
        await page.wait_for_timeout(900)
        w2 = await page.evaluate("()=>{clearInterval(window.__iv2);return window.__w2;}")
        print("focused casts:", [r for r in w2 if r[0]][:6], "n=", len([r for r in w2 if r[0]]))
        await ctx.close(); await b.close()

asyncio.run(main())
