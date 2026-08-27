import asyncio, json, sys, os
sys.path.insert(0, r"C:\dev\game-week\tools")
from cast import Cast
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

SETUP = """() => {
  const d=window.__day, f=d.flock;
  const e = d.strays.find(s=>!s.group.depleted); const sg = e && e.group;
  if(!sg) return 'none';
  const nx = f.centerX + 190, ny = 320;
  const ddx = nx-sg.x, ddy=ny-sg.y;
  sg.x=nx; sg.y=ny;
  if(sg.glow){sg.glow.x=nx; sg.glow.y=ny;}
  sg.birds.forEach(b=>{b.sprite.x+=ddx; b.sprite.y+=ddy;});
  window.__sg=sg; window.__pump=false;
  const step=()=>{ if(window.__pump && !sg.depleted)
      sg.update(1/60, performance.now()/1000, d.flock, 100000);
      requestAnimationFrame(step); };
  requestAnimationFrame(step);
  return {wx:Math.round(nx), wy:Math.round(ny), n:sg.birds.length,
          screenX:Math.round(nx-d.scrollX), screenY:Math.round(ny),
          glowW:Math.round(sg.glow.displayWidth), glowA:+sg.glow.alpha.toFixed(2)};
}"""

async def main():
    out={}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(180000)
        await pg.goto(BASE+"/?day", wait_until="networkidle")
        cast = Cast(c, pg, SHOTS, "cg")
        await cast.start()
        await pg.wait_for_function("() => !!window.__day", timeout=60000)
        await pg.wait_for_timeout(7000)
        await pg.mouse.move(640, 330)
        await pg.wait_for_timeout(2000)
        out['setup'] = await pg.evaluate(SETUP)
        await pg.wait_for_timeout(1200)
        pre = cast.mark()
        await pg.evaluate("() => { window.__pump = true; }")
        await pg.wait_for_timeout(3500)
        post = cast.mark()
        out['total_frames'] = post
        out['pre_mark'] = pre
        await cast.stop()
        out['saved'] = [os.path.basename(x) for x in cast.save(max(0,pre-3), post, 1, "burst")]
        await c.close(); await b.close()
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
