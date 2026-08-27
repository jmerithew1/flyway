import asyncio, json, os
from playwright.async_api import async_playwright
from PIL import Image

SHOTS = r"C:\dev\game-week\shots\h4"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

# centre each arc: scrollX = arcx - 640
ARCS = [(4850,'a1'),(7000,'a2_draft'),(9950,'a3'),(15650,'a4'),(17150,'a5'),(19320,'a6'),(24700,'a7'),(25800,'a8_final')]

def lum(px):
    return 0.2126*px[0] + 0.7152*px[1] + 0.0722*px[2]

def analyse(off_path, on_path):
    A = Image.open(off_path).convert('RGB'); B = Image.open(on_path).convert('RGB')
    a = A.load(); b = B.load()
    W,H = A.size
    best = []
    diffmax = 0
    npx = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = abs(lum(b[x,y]) - lum(a[x,y]))
            if d > 2:
                npx += 1
            if d > diffmax:
                diffmax = d
            if d > 6:
                best.append((round(d,1), x, y, round(lum(a[x,y]),1), round(lum(b[x,y]),1)))
    best.sort(reverse=True)
    return {'maxDeltaL': round(diffmax,1), 'pxChanged_gt2': npx, 'top': best[:8]}

async def main():
    out = {}
    async with async_playwright() as p:
        br = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await br.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && window.__day.motes && window.__day.motes.length", timeout=60000)
        await page.wait_for_timeout(2500)
        # freeze mote twinkle so on/off frames differ ONLY by the motes
        await page.evaluate("""() => {
          const d = window.__day;
          for (const m of d.motes) { d.tweens.killTweensOf(m.img); m.img.setAlpha(0.75); }
          window.__moteToggle = (v) => { for (const m of window.__day.motes) m.img.setVisible(v); };
        }""")
        for ax, tag in ARCS:
            await page.evaluate(f"window.__day.scrollX = {ax-640}")
            await page.wait_for_timeout(1200)
            # re-freeze (create may re-tween) and count in-frame motes
            info = await page.evaluate(f"""() => {{
              const d = window.__day, sx = d.scrollX;
              const inFrame = d.motes.filter(m => m.x > sx-30 && m.x < sx+1310);
              for (const m of d.motes) {{ d.tweens.killTweensOf(m.img); m.img.setAlpha(0.75); }}
              return {{n: inFrame.length, pts: inFrame.map(m=>[Math.round(m.x-sx), Math.round(m.y)])}};
            }}""")
            await page.evaluate("window.__moteToggle(false)")
            await page.wait_for_timeout(700)
            off = SHOTS + f"\\{tag}_off.png"
            await page.screenshot(path=off)
            await page.evaluate("window.__moteToggle(true)")
            await page.wait_for_timeout(700)
            on = SHOTS + f"\\{tag}_on.png"
            await page.screenshot(path=on)
            r = analyse(off, on)
            r['motesInFrame'] = info['n']
            r['screenPts'] = info['pts']
            out[tag] = r
            print(tag, json.dumps(r)[:400], flush=True)
        await ctx.close(); await br.close()
    with open(r"C:\dev\game-week\shots\h4_contrast.json","w") as f: json.dump(out,f,indent=1)

asyncio.run(main())
