import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

PROBE = """() => {
  const g = window.__game;
  const s = g.scene.getScene('Title');
  const res=[];
  s.children.list.forEach(o=>{
    if(o.type==='Text'){
      res.push({t:o.text, x:Math.round(o.x), y:Math.round(o.y),
        alpha:+o.alpha.toFixed(2), vis:o.visible,
        w:Math.round(o.width), h:Math.round(o.height),
        size:o.style.fontSize, col:o.style.color});
    }
  });
  const sm=g.scale;
  return {scene:s.scene.key, running:s.scene.isActive(),
    texts:res,
    scale:{mode:sm.scaleMode, gw:sm.gameSize.width, gh:sm.gameSize.height,
           dw:sm.displaySize.width, dh:sm.displaySize.height,
           cw:sm.canvasBounds.width, ch:sm.canvasBounds.height,
           zoom:sm.zoom, dsX:+sm.displayScale.x.toFixed(3), dsY:+sm.displayScale.y.toFixed(3)},
    canvas:{w:g.canvas.width,h:g.canvas.height,
            cssw:g.canvas.getBoundingClientRect().width,
            cssh:g.canvas.getBoundingClientRect().height,
            top:g.canvas.getBoundingClientRect().top,
            left:g.canvas.getBoundingClientRect().left},
    camScroll:{x:s.cameras.main.scrollX,y:s.cameras.main.scrollY,
               zoom:s.cameras.main.zoom, w:s.cameras.main.width, h:s.cameras.main.height}};
}"""

async def run(vw, vh, tag):
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(120000)
        await pg.goto(BASE+"/", wait_until="networkidle")
        await pg.wait_for_timeout(9000)
        info = await pg.evaluate(PROBE)
        await pg.screenshot(path=SHOTS+f"\\ti_{tag}.png")
        await c.close(); await b.close()
        return info

async def main():
    out={}
    for vw,vh,tag in [(1280,720,'1280x720'),(1536,960,'1536x960'),(1920,1080,'1920x1080')]:
        out[tag]=await run(vw,vh,tag)
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
