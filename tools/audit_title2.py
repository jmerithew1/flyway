import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

PROBE = """() => {
  const g = window.__game;
  const all = g.scene.scenes.map(s=>({key:s.scene.key, active:s.scene.isActive(),
      visible:s.scene.isVisible(), sleeping:s.scene.isSleeping(),
      status:s.sys.settings.status, kids:s.children.list.length,
      types:s.children.list.reduce((a,o)=>{a[o.type]=(a[o.type]||0)+1;return a;},{})}));
  return all;
}"""

TEXTS = """() => {
  const g = window.__game;
  const out=[];
  g.scene.scenes.forEach(s=>{
    s.children.list.forEach(o=>{
      if(o.type==='Text') out.push({sc:s.scene.key, t:o.text, x:Math.round(o.x), y:Math.round(o.y),
        alpha:+o.alpha.toFixed(3), vis:o.visible, w:Math.round(o.width), h:Math.round(o.height),
        size:o.style.fontSize, col:o.style.color, depth:o.depth});
    });
  });
  return out;
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(120000)
        await pg.goto(BASE+"/", wait_until="networkidle")
        res={}
        for t in [3000,4000,6000]:
            await pg.wait_for_timeout(t)
            res[f'at_{t}'] = await pg.evaluate(PROBE)
        res['texts'] = await pg.evaluate(TEXTS)
        await pg.screenshot(path=SHOTS+r"\ti_full800.png")
        # measure pixel brightness in the control band
        res['band'] = await pg.evaluate("""() => {
          const cv=document.querySelector('canvas');
          const gl=cv.getContext('webgl2')||cv.getContext('webgl');
          return gl? 'webgl' : 'no';
        }""")
        await c.close(); await b.close()
    print(json.dumps(res, indent=1, default=str))

asyncio.run(main())
