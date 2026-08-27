import asyncio, json, base64
from playwright.async_api import async_playwright
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
SHOTS = r"C:\dev\game-week\shots\polish"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=ARGS)
        c = await b.new_context(viewport={'width':1280,'height':800})
        pg = await c.new_page(); pg.set_default_timeout(120000)
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type=='error' else None)
        await pg.goto(BASE+"/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day", timeout=60000)
        await pg.wait_for_timeout(5000)
        r = await pg.evaluate("""() => new Promise(res=>{
            const g=window.__game;
            const t=setTimeout(()=>res({ok:false, why:'timeout',
                rtype:g.renderer.type, has:typeof g.renderer.snapshotArea}),3000);
            try{
              g.renderer.snapshotArea(300,200,400,400,(img)=>{
                clearTimeout(t);
                res({ok:true, kind:img && img.constructor && img.constructor.name,
                     len: img && img.src ? img.src.length : -1,
                     src: img && img.src ? img.src.slice(0,40) : null});
              }, 'image/jpeg', 0.85);
            }catch(e){clearTimeout(t); res({ok:false, err:String(e)});}
        })""")
        print(json.dumps(r, indent=1))
        print("ERRS", errs[-6:])
        await c.close(); await b.close()

asyncio.run(main())
