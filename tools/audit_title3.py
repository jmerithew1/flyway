import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

async def shot(vw, vh, tag, res):
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(120000)
        await pg.goto(BASE+"/", wait_until="networkidle")
        await pg.wait_for_timeout(9000)
        await pg.screenshot(path=SHOTS+f"\\tt_{tag}.png")
        # bottom third crop
        await pg.screenshot(path=SHOTS+f"\\tt_{tag}_low.png",
                            clip={'x':0,'y':max(0,vh-260),'width':vw,'height':min(260,vh)})
        res[tag] = await pg.evaluate("""() => {
          const g=window.__game, sm=g.scale;
          const r=g.canvas.getBoundingClientRect();
          const s=g.scene.scenes.find(x=>x.scene.key==='Title');
          const t=s.children.list.filter(o=>o.type==='Text').map(o=>({
             t:o.text.slice(0,28), gy:o.y, a:o.alpha,
             screenY: r.top + o.y*(r.height/960),
             screenX: r.left + (o.x - o.width/2)*(r.width/1536),
             screenW: o.width*(r.width/1536)}));
          return {canvas:{t:r.top,l:r.left,w:r.width,h:r.height},
                  vh:innerHeight, vw:innerWidth, texts:t};
        }""")
        await c.close(); await b.close()

async def main():
    res={}
    for vw,vh,tag in [(1280,720,'1280x720'),(1366,768,'1366x768'),(1920,1080,'1920x1080')]:
        await shot(vw,vh,tag,res)
    print(json.dumps(res, indent=1, default=str))

asyncio.run(main())
