import asyncio, json, os
from playwright.async_api import async_playwright
BASE = "http://localhost:58759"
SHOTS = r"C:\dev\game-week\shots\h8"
os.makedirs(SHOTS, exist_ok=True)

async def main():
    out = {}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page(); page.set_default_timeout(90000)
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.movers", timeout=60000)
        await page.wait_for_timeout(2000)

        # H2: does ANY moving piece ever narrow the passage? sample the true
        # passable gaps at each mover's x, 40x over 6 real seconds.
        await page.evaluate("""() => {
          window.__g = {};
          const d = window.__day;
          const SKY_TOP = 40, SKY_BOTTOM = 830, MIN_GAP = 86;
          // same rule the game uses: solid, unbroken colliders spanning this x
          window.__gapsAt = (x) => {
            const spans = [];
            for (const o of d.obstacles) {
              if (o.broken || o.kind !== 'solid') continue;
              const half = o.shape === 'circle' ? o.r : o.hw;
              if (x < o.x - half || x > o.x + half) continue;
              const vh = o.shape === 'circle' ? o.r : o.hh;
              spans.push([o.y - vh, o.y + vh]);
            }
            spans.sort((a,b)=>a[0]-b[0]);
            const gaps = []; let cur = SKY_TOP;
            for (const [a,bb] of spans) { if (a-cur >= MIN_GAP) gaps.push(a-cur); cur = Math.max(cur,bb); }
            if (SKY_BOTTOM-cur >= MIN_GAP) gaps.push(SKY_BOTTOM-cur);
            return gaps.map(Math.round);
          };
          window.__iv = setInterval(() => {
            for (const m of d.movers) {
              const key = m.f.x + ':' + m.f.art;
              (window.__g[key] = window.__g[key] || []).push(window.__gapsAt(m.f.x));
            }
          }, 150);
        }""")
        await page.wait_for_timeout(6000)
        raw = await page.evaluate("()=>{clearInterval(window.__iv);return window.__g;}")
        out['gapSamples'] = {}
        for k, series in raw.items():
            if series and series[0] == 'nofn':
                out['gapSamples'][k] = 'no gapsAt helper'
                continue
            widest = [max(s) if s else 0 for s in series]
            out['gapSamples'][k] = {'n': len(series), 'widestGapMin': min(widest),
                                    'widestGapMax': max(widest), 'variation': max(widest)-min(widest),
                                    'nGapsMin': min(len(s) for s in series),
                                    'nGapsMax': max(len(s) for s in series)}

        # H4: park the flock at the left edge for 25s. does anything punish it?
        await page.mouse.move(60, 420)
        await page.evaluate("""() => { window.__tr=[]; const d=window.__day;
          window.__iv2=setInterval(()=>{window.__tr.push([+d.simClock.toFixed(1),
            Math.round(d.scrollX), Math.round(d.flock.centerX-d.scrollX), d.flock.count]);},200);}""")
        await page.wait_for_timeout(25000)
        tr = await page.evaluate("()=>{clearInterval(window.__iv2);return window.__tr;}")
        out['leftEdgePark'] = {'first': tr[0], 'last': tr[-1], 'n': len(tr),
            'simSeconds': tr[-1][0]-tr[0][0],
            'scrollAdvanced': tr[-1][1]-tr[0][1],
            'screenRelMin': min(s[2] for s in tr), 'screenRelMax': max(s[2] for s in tr),
            'birdsLost': tr[0][3]-tr[-1][3],
            'every10': tr[::10]}
        await page.screenshot(path=SHOTS + r"\leftedge_25s.png")
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
