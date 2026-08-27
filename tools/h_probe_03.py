import asyncio, json, os
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\h3"
os.makedirs(SHOTS, exist_ok=True)
BASE = "http://localhost:58759"

async def snap(page, name, notes):
    st = await page.evaluate("""() => {
      const d = window.__day, f = d.flock;
      return {sx: Math.round(d.scrollX), cx: Math.round(f.centerX), cy: Math.round(f.centerY),
        birds: f.count, prompt: d.prompt ? (d.prompt.text || (d.promptEl && d.promptEl.text) || '?') : null,
        scattered: d.scatter ? d.scatter.recoverableCount : null};
    }""")
    await page.screenshot(path=SHOTS + "\\" + name + ".png")
    notes.append({'shot': name, **st})
    return st

async def main():
    out = {'timeline': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}, device_scale_factor=1)
        page = await ctx.new_page()
        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=60000)
        await page.wait_for_timeout(1500)

        # capture the prompt text element directly so we can read the teaching copy
        await page.evaluate("""() => {
          window.__promptLog = [];
          const d = window.__day;
          const orig = d.showPrompt.bind(d);
          d.showPrompt = function(key, text, done) {
            window.__promptLog.push({key, text, sx: Math.round(d.scrollX), t: Math.round(performance.now())});
            return orig(key, text, done);
          };
        }""")

        # ---- fly the level normally, steering mid-height, for 75s ----
        await page.mouse.move(640, 420)
        n = 0
        for i in range(26):
            await page.mouse.move(640, 400 + (30 if i % 2 else -30))
            await page.wait_for_timeout(2200)
            n += 1
            await snap(page, f"p{n:02d}", out['timeline'])
        out['prompts_seen'] = await page.evaluate("() => window.__promptLog")
        await ctx.close(); await b.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
