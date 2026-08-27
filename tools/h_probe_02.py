import asyncio, json, os
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\h2"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.movers", timeout=60000)
        await page.wait_for_timeout(3000)

        # what movers exist, and their real amplitude measured over 6 seconds
        out['movers_decl'] = await page.evaluate("""() => {
          const d = window.__day;
          return (d.movers||[]).map(m => ({x: m.f.x, art: m.f.art, mount: m.f.mount,
             kind: m.f.motion.kind, amp: m.f.motion.amp, period: m.f.motion.period,
             baseY: Math.round(m.baseY), nObs: m.obs.length}));
        }""")

        # sample sprite y over time -> measured travel in px
        await page.evaluate("""() => { window.__samp = []; window.__t0 = performance.now();
          window.__iv = setInterval(() => {
            const d = window.__day;
            window.__samp.push({t: Math.round(performance.now()-window.__t0),
              ys: (d.movers||[]).map(m => Math.round(m.sprite.y)),
              rot: (d.movers||[]).map(m => +(m.sprite.rotation||0).toFixed(3))});
          }, 120); }""")
        await page.wait_for_timeout(8000)
        samp = await page.evaluate("() => { clearInterval(window.__iv); return window.__samp; }")
        n = len(samp[0]['ys']) if samp else 0
        travel = []
        for i in range(n):
            ys = [s['ys'][i] for s in samp]
            rs = [s['rot'][i] for s in samp]
            travel.append({'i': i, 'yMin': min(ys), 'yMax': max(ys), 'yTravel': max(ys)-min(ys),
                           'rotTravelDeg': round((max(rs)-min(rs))*57.2958, 1)})
        out['measured_travel_8s'] = travel

        # visual: park at each mover x, burst 6 frames across ~1 period
        movers = out['movers_decl']
        for m in movers:
            x = m['x']
            await page.evaluate(f"window.__day.scrollX = {x}")
            await page.wait_for_timeout(600)
            per = m['period']
            for k in range(5):
                await page.screenshot(path=SHOTS + f"\\mv_{x}_{m['art']}_f{k}.png")
                await page.wait_for_timeout(int(per*1000/4))
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
