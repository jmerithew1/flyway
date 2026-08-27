import asyncio, json, os, sys
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\mobileL"
os.makedirs(SHOTS, exist_ok=True)
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
BASE = "http://localhost:58759"
TAG = sys.argv[1] if len(sys.argv) > 1 else "base"

async def main():
    out = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await browser.new_context(viewport={'width':844,'height':390},
            has_touch=True, is_mobile=True, device_scale_factor=2, user_agent=UA)
        page = await ctx.new_page()
        logs=[]
        page.on('console', lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on('pageerror', lambda e: logs.append(f"PAGEERROR: {e}"))

        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_timeout(6000)
        await page.screenshot(path=f"{SHOTS}\\{TAG}_01_day.png")
        out['metrics'] = await page.evaluate("""() => {
          const c = document.querySelector('canvas');
          const r = c.getBoundingClientRect();
          return {rect:{l:r.left,t:r.top,w:r.width,h:r.height},
                  vw:innerWidth, vh:innerHeight, dpr:devicePixelRatio,
                  touchPoints: navigator.maxTouchPoints,
                  coarse: matchMedia('(pointer: coarse)').matches};
        }""")
        await page.wait_for_timeout(5000)
        await page.screenshot(path=f"{SHOTS}\\{TAG}_02_day_later.png")
        out['logs'] = logs[-20:]
        await ctx.close(); await browser.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
