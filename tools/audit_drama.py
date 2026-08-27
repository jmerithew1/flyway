import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\polish"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

FREEZE = """() => {
  const d=window.__day; let fx=d.scrollX;
  Object.defineProperty(d,'scrollX',{get:()=>fx,set:()=>{},configurable:true});
  return Math.round(fx);
}"""

GEOM = """() => {
  const d=window.__day, f=d.flock;
  const halos=(f.riskHalos||[]).filter(h=>h.visible).map(h=>({
     x:Math.round(h.x), y:Math.round(h.y), w:Math.round(h.displayWidth),
     a:+h.alpha.toFixed(2), tint:h.tintTopLeft.toString(16)}));
  const b=f.birds[0];
  return {nHalos:halos.length, halos,
    birdDisp:{w:+(b.sprite.displayWidth).toFixed(1), h:+(b.sprite.displayHeight).toFixed(1)},
    flockN:f.birds.length,
    dangerMax:+Math.max(...f.birds.map(x=>x.danger)).toFixed(2),
    dangerOver55:f.birds.filter(x=>x.danger>0.55).length,
    dangerOver12:f.birds.filter(x=>x.danger>0.12).length};
}"""

FORCE = """(n) => {
  const d=window.__day, f=d.flock;
  const R=Math.random; Math.random=()=>0.99;
  for(let i=0;i<n;i++) d.scatter.spawn(f.centerX+(i-(n-1)/2)*130, 380, 1, -0.2);
  Math.random=R;
  return {n:d.scatter.birds.length, recov:d.scatter.birds.filter(b=>b.recoverable).length};
}"""

STEPINFO = """() => {
  const bs=window.__day.scatter.birds.filter(b=>!b.recoverable);
  return bs.map(b=>({tint:b.sprite.tintTopLeft.toString(16), a:+b.sprite.alpha.toFixed(2),
     s:+b.sprite.scaleX.toFixed(3), y:Math.round(b.sprite.y), life:+b.life.toFixed(3),
     age:+(1-b.life/b.maxLife).toFixed(3)}));
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
        await pg.mouse.move(660, 340)
        await pg.wait_for_timeout(2500)
        out['geom_cruise'] = await pg.evaluate(GEOM)

        # ================= LOSS: paused scene, hand-stepped =================
        await pg.evaluate("() => { window.__day.scene.pause(); window.__day.scatter.clear(); }")
        out['loss_spawn'] = await pg.evaluate(FORCE, 5)
        rec=[]
        for i in range(12):
            info = await pg.evaluate(STEPINFO)
            rec.append({'step':i, 'birds':info[:3]})
            await pg.screenshot(path=SHOTS+f"\\L{i:02d}.png")
            await pg.evaluate("""() => { for(let k=0;k<2;k++)
                window.__day.scatter.update(1/60, performance.now()/1000, null, 0); }""")
        out['loss_record']=rec
        await pg.evaluate("() => { window.__day.scatter.clear(); window.__day.scene.resume(); }")
        await pg.wait_for_timeout(1200)

        # ================= CAGE BURST: frozen cam, slow tweens ==============
        out['frozen_at'] = await pg.evaluate(FREEZE)
        setup = await pg.evaluate("""() => {
          const d=window.__day, f=d.flock;
          const e=d.strays.find(s=>!s.group.depleted); if(!e) return 'none';
          const sg=e.group; const nx=d.scrollX+680, ny=330;
          const dx=nx-sg.x, dy=ny-sg.y; sg.x=nx; sg.y=ny;
          if(sg.glow){sg.glow.x=nx;sg.glow.y=ny;}
          sg.birds.forEach(b=>{b.sprite.x+=dx;b.sprite.y+=dy;});
          window.__sg=sg;
          return {screenX:Math.round(nx-d.scrollX), screenY:ny, n:sg.birds.length};
        }""")
        out['cage_setup']=setup
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=SHOTS+r"\C_before.png")
        # slow the tween clock so the 1.26s burst stretches to ~18s
        await pg.evaluate("""() => {
          const d=window.__day; d.tweens.timeScale=0.07;
          // empty the cage instantly, without letting birds animate away
          const s=window.__sg;
          while(s.birds.length){ const b=s.birds.pop(); b.sprite.destroy(); }
          s.remaining=0;
          s.update(1/60, performance.now()/1000, d.flock, 0);
        }""")
        for i in range(14):
            await pg.screenshot(path=SHOTS+f"\\C{i:02d}.png")
        st = await pg.evaluate("""() => {
          const s=window.__sg; return {glowGone: s.glow===null};}""")
        out['cage_state']=st
        await c.close(); await br.close()
    print(json.dumps(out, indent=1, default=str))

asyncio.run(main())
