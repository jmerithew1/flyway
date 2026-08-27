import asyncio, json, os, base64
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

SETUP = """() => {
  const d=window.__day, f=d.flock;
  const e = d.strays.find(s=>!s.group.depleted); const sg = e && e.group;
  if(!sg) return 'none';
  const nx = f.centerX + 170, ny = 300;
  const ddx = nx-sg.x, ddy=ny-sg.y;
  sg.x=nx; sg.y=ny;
  if(sg.glow){sg.glow.x=nx; sg.glow.y=ny;}
  sg.birds.forEach(b=>{b.sprite.x+=ddx; b.sprite.y+=ddy;});
  window.__sg = sg;
  return {wx:Math.round(nx), wy:Math.round(ny), n:sg.birds.length,
          screenX:Math.round(nx-d.scrollX), screenY:Math.round(ny)};
}"""

# grab a framebuffer region every other frame while pumping the release
RUN = """(box) => {
  const d=window.__day, s=window.__sg, g=window.__game;
  window.__frames=[]; window.__t0=performance.now(); window.__burstAt=null;
  let f=0, pending=false;
  const step=()=>{
    const t=performance.now()-window.__t0;
    if(!s.depleted) s.update(1/60, performance.now()/1000, d.flock, 100000);
    else if(window.__burstAt===null) window.__burstAt=Math.round(t);
    f++;
    if(f%3===0 && !pending && window.__frames.length<20){
      pending=true;
      g.renderer.snapshotArea(box.x, box.y, box.w, box.h, (img)=>{
        window.__frames.push([Math.round(t), img.src]); pending=false;
      }, 'image/jpeg', 0.86);
    }
    if(t < 2600) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}"""

async def main():
    out={}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(180000)
        await pg.goto(BASE+"/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day", timeout=60000)
        await pg.wait_for_timeout(6000)
        await pg.mouse.move(640, 330)
        await pg.wait_for_timeout(2500)
        out['setup'] = await pg.evaluate(SETUP)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=SHOTS+r"\c0_cage_before.png")

        sx, sy = out['setup']['screenX'], out['setup']['screenY']
        # canvas is 1536x960 internally; snapshotArea uses canvas pixels
        box = {'x': max(0, sx-260), 'y': max(0, sy-230), 'w': 520, 'h': 520}
        out['box']=box
        await pg.evaluate(RUN, box)
        await pg.wait_for_timeout(4000)
        frames = await pg.evaluate("() => window.__frames")
        out['burstAt_ms'] = await pg.evaluate("() => window.__burstAt")
        out['frame_times'] = [f[0] for f in frames]
        for i,(t,src) in enumerate(frames):
            data = base64.b64decode(src.split(',',1)[1])
            open(SHOTS+f"\\cb_{i:02d}_t{t}.jpg",'wb').write(data)
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SHOTS+r"\c2_after.png")
        await c.close(); await b.close()
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
