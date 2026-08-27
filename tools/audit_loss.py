import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

# force a NON-recoverable spawn (recoverable = Math.random() < 0.45)
FORCE = """(n) => {
  const d=window.__day, f=d.flock;
  const R=Math.random; Math.random=()=>0.99;
  const made=[];
  for(let i=0;i<n;i++){
    const x=f.centerX + (i-(n-1)/2)*110, y=f.centerY;
    d.scatter.spawn(x,y,1,-0.2);
  }
  Math.random=R;
  return {n:d.scatter.birds.length,
          recov:d.scatter.birds.filter(b=>b.recoverable).length,
          cx:Math.round(f.centerX), cy:Math.round(f.centerY),
          scrollX:Math.round(d.scrollX),
          flockScale: f.birds && f.birds[0] ? f.birds[0].sprite.scaleX : null};
}"""

# record per-frame appearance of the lost birds
REC = """() => {
  const d=window.__day;
  window.__rec=[]; window.__t0=performance.now();
  const step=()=>{
    const bs=d.scatter.birds.filter(b=>!b.recoverable);
    if(bs.length){
      const b=bs[0];
      window.__rec.push([Math.round(performance.now()-window.__t0),
        b.sprite.tintTopLeft.toString(16), +b.sprite.alpha.toFixed(2),
        +b.sprite.scaleX.toFixed(3), Math.round(b.sprite.x), Math.round(b.sprite.y),
        +b.life.toFixed(3)]);
    }
    if(performance.now()-window.__t0 < 2600) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}"""

async def main():
    out={}
    async with async_playwright() as p:
        br = await p.chromium.launch(headless=True, args=ARGS)
        c = await br.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        pg = await c.new_page(); pg.set_default_timeout(180000)
        await pg.goto(BASE+"/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day", timeout=60000)
        await pg.wait_for_timeout(6000)
        await pg.mouse.move(640, 380)
        await pg.wait_for_timeout(2000)

        # ---- PASS 1: numeric record of the strobe ----
        await pg.evaluate(REC)
        out['spawn'] = await pg.evaluate(FORCE, 1)
        await pg.wait_for_timeout(3000)
        out['record'] = await pg.evaluate("() => window.__rec")

        # ---- PASS 2: stepped frames (scene paused, scatter stepped by hand) ----
        await pg.evaluate("() => { window.__day.scene.pause(); }")
        await pg.evaluate("""() => { window.__day.scatter.clear(); }""")
        await pg.evaluate(FORCE, 6)
        for i in range(10):
            await pg.screenshot(path=SHOTS+f"\\L_step_{i:02d}.png",
                clip={'x':180,'y':180,'width':920,'height':420})
            await pg.evaluate("""() => { for(let k=0;k<3;k++)
                window.__day.scatter.update(1/60, performance.now()/1000, null, 0); }""")
        await pg.evaluate("() => { window.__day.scene.resume(); }")

        # ---- PASS 3: real-time free-run frames of a big loss event ----
        await pg.evaluate("() => window.__day.scatter.clear()")
        await pg.evaluate(FORCE, 10)
        for i in range(6):
            await pg.screenshot(path=SHOTS+f"\\L_rt_{i}.png")
        await c.close(); await br.close()
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
