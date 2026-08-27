import asyncio, json, os, sys
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\polish"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

async def main():
    out = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=ARGS)
        ctx = await browser.new_context(viewport={'width':1280,'height':720},
                                        device_scale_factor=1)
        page = await ctx.new_page()
        page.set_default_timeout(120000)
        logs=[]
        page.on('console', lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on('pageerror', lambda e: logs.append(f"PAGEERROR: {e}"))

        # ---------------- TITLE ----------------
        await page.goto(BASE + "/", wait_until="networkidle")
        await page.wait_for_timeout(6000)
        await page.screenshot(path=SHOTS + r"\t1_title.png")
        out['title_texts'] = await page.evaluate("""() => {
          const g = window.__game; if(!g) return 'no game';
          const s = g.scene.scenes.find(s=>s.scene.key==='Title'||s.scene.key==='TitleScene')
                    || g.scene.getScenes(true)[0];
          const res=[];
          s.children.list.forEach(o=>{
            if(o.type==='Text'){
              res.push({t:o.text, x:Math.round(o.x), y:Math.round(o.y),
                        size:o.style.fontSize, col:o.style.color,
                        alpha:+o.alpha.toFixed(2), vis:o.visible,
                        ox:o.originX, w:Math.round(o.width), h:Math.round(o.height),
                        depth:o.depth});
            }
          });
          return {key:s.scene.key, texts:res};
        }""")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=SHOTS + r"\t2_title_late.png")

        # ---------------- DAY ----------------
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_timeout(7000)
        out['boot'] = await page.evaluate("""() => {
          const d=window.__day; if(!d) return 'no __day';
          return {scrollX:Math.round(d.scrollX),
                  keys:Object.keys(d).filter(k=>!k.startsWith('_')).slice(0,80)};
        }""")
        await page.screenshot(path=SHOTS + r"\d0_boot.png")

        # brittle inventory
        out['brittle'] = await page.evaluate("""() => {
          const d=window.__day;
          const bg=d.brittleGlows||[];
          return bg.map(g=>({x:Math.round(g.f.x), art:g.f.art,
              glowAlpha:+g.glow.alpha.toFixed(3), tint:g.glow.tintTopLeft.toString(16),
              blend:g.glow.blendMode, vis:g.glow.visible,
              dw:Math.round(g.glow.displayWidth), dh:Math.round(g.glow.displayHeight),
              spriteAlpha:+g.sprite.alpha.toFixed(2)}));
        }""")

        # ---------------- BREAKABLE SITES ----------------
        for x in [3150, 9450, 10750, 18300, 20100]:
            await page.evaluate(f"window.__day.scrollX = {x-380}")
            await page.wait_for_timeout(1800)
            await page.screenshot(path=SHOTS + f"\\b_{x}.png")
            await page.wait_for_timeout(1400)
            await page.screenshot(path=SHOTS + f"\\b_{x}_b.png")

        out['logs'] = logs[-30:]
        await ctx.close(); await browser.close()
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
