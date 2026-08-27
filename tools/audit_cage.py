import asyncio, json, os, time
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

SETUP = """() => {
  const d=window.__day, f=d.flock;
  const e = d.strays.find(s=>!s.group.depleted); const sg = e && e.group;
  if(!sg) return 'none';
  // park the cage just above/right of the flock centre, on screen
  const nx = f.centerX + 150, ny = f.centerY - 90;
  const ddx = nx-sg.x, ddy=ny-sg.y;
  sg.x=nx; sg.y=ny;
  if(sg.glow){sg.glow.x=nx; sg.glow.y=ny;}
  sg.birds.forEach(b=>{b.sprite.x+=ddx; b.sprite.y+=ddy;});
  window.__sg = sg;
  return {x:nx, y:ny, n:sg.birds.length, scrollX:Math.round(d.scrollX),
          screenX: nx-d.scrollX, screenY: ny};
}"""

async def main():
    out={}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(120000)
        await pg.goto(BASE+"/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day", timeout=60000)
        await pg.wait_for_timeout(6000)
        # steer the flock up a bit so the cage sits in clear sky
        await pg.mouse.move(640, 300)
        await pg.wait_for_timeout(2500)

        out['setup'] = await pg.evaluate(SETUP)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=SHOTS+r"\c0_cage_before.png")
        # zoom crop around cage
        info = await pg.evaluate("""() => {const d=window.__day,s=window.__sg;
            const r=window.__game.canvas.getBoundingClientRect();
            return {sx:(s.x-d.scrollX)*(r.width/1536), sy:s.y*(r.height/960)};}""")
        cx,cy = info['sx'], info['sy']
        await pg.screenshot(path=SHOTS+r"\c0_cage_zoom.png",
            clip={'x':max(0,cx-160),'y':max(0,cy-160),'width':320,'height':320})

        # ---- force the release: pump update with a huge attract radius ----
        await pg.evaluate("""() => {
          window.__t0 = performance.now();
          const d=window.__day, s=window.__sg;
          const step=()=>{
            if(s.depleted && window.__burstAt===undefined){window.__burstAt=performance.now();}
            s.update(1/60, performance.now()/1000, d.flock, 100000);
            if(performance.now()-window.__t0 < 4000) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }""")
        seq=[]
        t0=time.time()
        for i in range(9):
            await pg.screenshot(path=SHOTS+f"\\c1_burst_{i}.png",
                clip={'x':max(0,cx-230),'y':max(0,cy-200),'width':460,'height':460})
            seq.append(round((time.time()-t0)*1000))
        out['burst_frame_times_ms']=seq
        out['burstAt'] = await pg.evaluate("() => window.__burstAt ? Math.round(window.__burstAt-window.__t0) : null")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=SHOTS+r"\c2_after.png")
        await c.close(); await b.close()
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
