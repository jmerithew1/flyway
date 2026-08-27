import asyncio, json, os
from playwright.async_api import async_playwright
SHOTS = r"C:\dev\game-week\shots\h6"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

async def main():
    out = {}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        page.set_default_timeout(90000)
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=60000)
        await page.wait_for_timeout(1500)

        # instrument: log EVERY lossCause fired, and every bird-count change
        await page.evaluate("""() => {
          const d = window.__day;
          window.__causes = []; window.__drops = [];
          const oc = d.lossCause.bind(d);
          d.lossCause = function(text,x,y,t){ window.__causes.push({text, t:+t.toFixed(2), n:d.flock.count}); return oc(text,x,y,t); };
          // count the SUPPRESSED ones too (the 2.4s cooldown swallows them)
          window.__attempt = 0;
          const raw = d.lossCause;
          d.lossCause = function(text,x,y,t){ window.__attempt++; return raw(text,x,y,t); };
          let last = d.flock.count;
          window.__iv = setInterval(()=>{ const n = d.flock.count;
            if (n !== last) { window.__drops.push({t:+d.simClock.toFixed(2), from:last, to:n, sx:Math.round(d.scrollX)}); last = n; }
          }, 50);
        }""")

        # PART A: play normally, mouse mid-screen, 55s
        await page.mouse.move(760, 420)
        for i in range(11):
            await page.mouse.move(760, 400 + (40 if i%2 else -40))
            await page.wait_for_timeout(5000)
        a = await page.evaluate("""() => ({causes: window.__causes, attempts: window.__attempt,
            drops: window.__drops, birds: window.__day.flock.count, sx: Math.round(window.__day.scrollX),
            simClock: +window.__day.simClock.toFixed(1)})""")
        lost = sum(d['from']-d['to'] for d in a['drops'] if d['to'] < d['from'])
        out['normalPlay_55s'] = {'simClock': a['simClock'], 'scrollX': a['sx'], 'birdsLeft': a['birds'],
            'birdsLostTotal': lost, 'lossEvents': len(a['drops']),
            'causeMessagesShown': len(a['causes']), 'causeCallsAttempted': a['attempts'],
            'causeTexts': a['causes'][:14],
            'dropsFirst12': a['drops'][:12]}
        await page.screenshot(path=SHOTS + r"\A_after55s.png")
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
