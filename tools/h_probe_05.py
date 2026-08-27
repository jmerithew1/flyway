import asyncio, json, os
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\h5"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

async def main():
    out = {}
    async with async_playwright() as br0:
        b = await br0.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=60000)
        await page.wait_for_timeout(1500)

        # ---- A: does the world force you forward? measure scrollX with the
        #         player doing NOTHING (mouse parked far left = flock lags)
        await page.mouse.move(120, 420)
        await page.evaluate("""() => { window.__tr=[]; window.__t0=performance.now();
          window.__iv=setInterval(()=>{const d=window.__day;
            window.__tr.push([Math.round(performance.now()-window.__t0), Math.round(d.scrollX),
              Math.round(d.flock.centerX), d.flock.count, Math.round(d.flock.centerX-d.scrollX)]);},250);}""")
        await page.wait_for_timeout(20000)
        tr = await page.evaluate("()=>{clearInterval(window.__iv);return window.__tr;}")
        out['idle_20s'] = {'samples': tr[::8], 'first': tr[0], 'last': tr[-1],
            'scrollPerSec': round((tr[-1][1]-tr[0][1])/((tr[-1][0]-tr[0][0])/1000),1),
            'birdsLost': tr[0][3]-tr[-1][3],
            'relMin': min(s[4] for s in tr), 'relMax': max(s[4] for s in tr)}
        await page.screenshot(path=SHOTS + r"\A_idle_left_edge.png")

        # ---- B: deliberate crash. Fresh page, drive the flock into ground stone.
        await ctx.close()
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=60000)
        await page.wait_for_timeout(2000)
        # steer hard into the low stone and hold there
        await page.mouse.move(900, 760)
        await page.evaluate("""() => { window.__ev=[]; const d=window.__day; window.__lastN=d.flock.count;
          window.__iv2=setInterval(()=>{ const n=d.flock.count;
            if(n!==window.__lastN){window.__ev.push({t:Math.round(performance.now()),from:window.__lastN,to:n,
              sx:Math.round(d.scrollX)}); window.__lastN=n;} },60); }""")
        # burst-capture across the first loss window
        for k in range(14):
            await page.mouse.move(900, 760)
            await page.screenshot(path=SHOTS + f"\\B_crash_{k:02d}.png")
            await page.wait_for_timeout(400)
        out['loss_events'] = (await page.evaluate("()=>{clearInterval(window.__iv2);return window.__ev;}"))[:20]

        # ---- C: what visual channels fire on a loss? measure screen luminance
        #         change frame-to-frame around the loss (a flash would show).
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
