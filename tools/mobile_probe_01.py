import asyncio, json, os
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\mobile"
os.makedirs(SHOTS, exist_ok=True)
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
BASE = "http://localhost:58759"

async def main():
    out = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await browser.new_context(viewport={'width':844,'height':390},
            has_touch=True, is_mobile=True, device_scale_factor=3, user_agent=UA)
        page = await ctx.new_page()
        logs=[]
        page.on('console', lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on('pageerror', lambda e: logs.append(f"PAGEERROR: {e}"))

        # ---------- TITLE ----------
        await page.goto(BASE + "/", wait_until="networkidle")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=SHOTS + r"\01_title.png")
        out['title_metrics'] = await page.evaluate("""() => {
          const c = document.querySelector('canvas');
          const r = c.getBoundingClientRect();
          return {canvasRect:{l:r.left,t:r.top,w:r.width,h:r.height,right:r.right,bottom:r.bottom},
                  vw:innerWidth, vh:innerHeight,
                  dpr:devicePixelRatio,
                  bodyScrollW: document.body.scrollWidth, bodyScrollH: document.body.scrollHeight,
                  touchPoints: navigator.maxTouchPoints,
                  coarse: matchMedia('(pointer: coarse)').matches};
        }""")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=SHOTS + r"\02_title_later.png")

        out['logs_title'] = logs[-25:]
        await ctx.close(); await browser.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
