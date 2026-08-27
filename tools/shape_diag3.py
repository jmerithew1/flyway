import asyncio, json
from playwright.async_api import async_playwright
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=ARGS)
        ctx = await b.new_context(viewport={'width':1536,'height':960}, device_scale_factor=1)
        pg = await ctx.new_page(); pg.set_default_timeout(90000)
        await pg.add_init_script("window.WebSocket = class { constructor(){this.readyState=0;} addEventListener(){} removeEventListener(){} send(){} close(){} };")
        await pg.goto(BASE + "/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=60000)
        await pg.wait_for_timeout(3000)
        await pg.mouse.move(1300, 480); await pg.wait_for_timeout(3000)
        info = await pg.evaluate("""() => {
          const d = window.__day, f = d.flock, cam = d.cameras.main;
          const r = d.game.canvas.getBoundingClientRect();
          const g = d.game.scale;
          let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
          for (const bb of f.birds) { x0=Math.min(x0,bb.sprite.x); x1=Math.max(x1,bb.sprite.x);
                                      y0=Math.min(y0,bb.sprite.y); y1=Math.max(y1,bb.sprite.y); }
          const b0 = f.birds[0];
          return { rect:{l:r.left,t:r.top,w:r.width,h:r.height},
                   gameSize:{w:g.gameSize.width,h:g.gameSize.height},
                   displaySize:{w:g.displaySize.width,h:g.displaySize.height},
                   camZoom:cam.zoom, camScroll:[cam.scrollX,cam.scrollY],
                   camRot:cam.rotation, camView:[cam.worldView.x,cam.worldView.y,cam.worldView.width,cam.worldView.height],
                   bbox:[x0,y0,x1,y1], bboxWH:[x1-x0,y1-y0],
                   bird0:{x:b0.x,y:b0.y,sx:b0.sprite.x,sy:b0.sprite.y},
                   heading:[f.meanVX,f.meanVY],
                   nBirds:f.birds.length,
                   noSlot:f.birds.filter(z=>z.slotIdx<0).length };
        }""")
        print(json.dumps(info, indent=1))
        await ctx.close(); await b.close()

asyncio.run(main())
