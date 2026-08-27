import asyncio, json
from playwright.async_api import async_playwright
BASE = "http://localhost:58759"

async def main():
    frames = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1536,'height':960}, device_scale_factor=1)
        page = await ctx.new_page(); page.set_default_timeout(60000)
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=30000)
        await page.wait_for_timeout(2000)
        fps = await page.evaluate("""() => new Promise(res => {
          let n = 0; const t0 = performance.now();
          const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
            else res({frames: n, ms: performance.now() - t0, fps: n / ((performance.now()-t0)/1000)}); };
          requestAnimationFrame(tick); }) """)
        print("rAF fps:", fps)
        gfps = await page.evaluate("""() => { const g = window.__day.game;
          return { actualFps: g.loop.actualFps, targetFps: g.loop.targetFps, delta: g.loop.delta,
                   renderer: g.renderer.type }; }""")
        print("phaser:", gfps)

        cdp = await ctx.new_cdp_session(page)
        async def ack(sid):
            try: await cdp.send("Page.screencastFrameAck", {"sessionId": sid})
            except Exception: pass
        def on_frame(ev):
            frames.append(ev['metadata'].get('timestamp'))
            asyncio.ensure_future(ack(ev['sessionId']))
        cdp.on("Page.screencastFrame", on_frame)
        await cdp.send("Page.startScreencast", {"format":"jpeg","quality":80,"everyNthFrame":1,
                                                "maxWidth":1536,"maxHeight":960})
        await page.wait_for_timeout(3000)
        await cdp.send("Page.stopScreencast")
        print("screencast frames in 3s:", len(frames))
        if len(frames) > 2:
            print("span s:", round(frames[-1]-frames[0],3), "→ fps", round(len(frames)/(frames[-1]-frames[0]),1))
        await ctx.close(); await b.close()

asyncio.run(main())
