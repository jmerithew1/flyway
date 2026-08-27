import asyncio, json, os, sys
from playwright.async_api import async_playwright

# capture OUTSIDE the repo: writing into shots/ mid-run makes vite's watcher
# full-reload the page and destroys the execution context
SHOTS = os.path.join(os.environ.get('HUD_WORK') or os.environ.get('TEMP', '.'), 'hudshots')
FINAL = r"C:\dev\game-week\shots\hud"
os.makedirs(SHOTS, exist_ok=True)
os.makedirs(FINAL, exist_ok=True)
BASE = "http://localhost:58759"
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"

ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

PROBE = """() => {
  const d = window.__day; if (!d) return {err:'no day'};
  const sa = (() => { const c=document.querySelector('canvas'); const r=c.getBoundingClientRect();
    const gh=d.scale.height, gw=d.scale.width; const k=r.height/gh||1;
    const left=Math.max(0,-r.left)/k, top=Math.max(0,-r.top)/k;
    const right=Math.max(0,r.right-innerWidth)/k, bottom=Math.max(0,r.bottom-innerHeight)/k;
    return {x:left,y:top,w:gw-left-right,h:gh-top-bottom}; })();
  const box = (o) => o ? {x:Math.round(o.x),y:Math.round(o.y),
     w:Math.round(o.displayWidth||o.width||0),h:Math.round(o.displayHeight||o.height||0),a:+(o.alpha||0).toFixed(2)} : null;
  const inSafe = (b, pad=0) => b ? (b.x>=sa.x-pad && b.y>=sa.y-pad && b.x<=sa.x+sa.w+pad && b.y<=sa.y+sa.h+pad) : null;
  const c = d.countText, fl = d.hudFlockLabel, dl = d.hudDayLabel, pl = d.hudPlaceLabel;
  const dial = d.hudDial, rib = d.hudRibbon;
  return {
    safe: sa,
    dial, ribbon: rib,
    ribbonRight: rib.x + rib.w,
    ribbonInSafe: rib.x >= sa.x && rib.x + rib.w <= sa.x + sa.w,
    dialInSafe: dial.x - dial.r >= sa.x && dial.y - dial.r >= sa.y,
    count: {text:c.text, x:Math.round(c.x), y:Math.round(c.y), a:+c.alpha.toFixed(2), color:c.style.color},
    flockLabel: {text: fl.text, x:Math.round(fl.x), y:Math.round(fl.y), a:+fl.alpha.toFixed(2), color:fl.style.color},
    dayLabel: {text: dl.text, x:Math.round(dl.x), y:Math.round(dl.y), a:+dl.alpha.toFixed(2)},
    placeLabel: {text: pl.text, x:Math.round(pl.x), y:Math.round(pl.y), a:+pl.alpha.toFixed(2)},
    labelBottom: Math.round(Math.max(dl.y+dl.height, pl.y+pl.height, fl.y+fl.height)),
    marker: box(d.hudMarker),
    arcShown: +d.hudArcShown.toFixed(3),
    dayShown: +d.hudDayShown.toFixed(3),
    progShown: +d.hudProgShown.toFixed(3),
    urgency: +d.hudUrgency.toFixed(3),
    night: {daylight:+d.night.daylight.toFixed(3), edgeX:Math.round(d.night.edgeX), encroach:+d.night.encroach.toFixed(3)},
    flock: {count: d.flock.count, centerX: Math.round(d.flock.centerX)},
    score: {x:Math.round(d.scoreText.x), y:Math.round(d.scoreText.y), text:d.scoreText.text},
    scoreLeft: Math.round(d.scoreText.x - d.scoreText.width),
  };
}"""


async def run(label, viewport, touch, dsf):
    out = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=ARGS)
        kw = dict(viewport=viewport, device_scale_factor=dsf)
        if touch:
            kw.update(has_touch=True, is_mobile=True, user_agent=UA)
        ctx = await browser.new_context(**kw)
        page = await ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on('pageerror', lambda e: logs.append(f"PAGEERROR: {e}"))
        page.set_default_timeout(90000)
        await page.goto(BASE + "/?day", wait_until="load")
        await page.wait_for_function("() => !!window.__day", timeout=60000)
        await page.wait_for_timeout(6500)
        await page.screenshot(path=f"{SHOTS}\\{label}_01_open.png")
        out['open'] = await page.evaluate(PROBE)

        # fly on a while so the ribbon marker moves and daylight drains
        await page.wait_for_timeout(9000)
        await page.screenshot(path=f"{SHOTS}\\{label}_02_underway.png")
        out['underway'] = await page.evaluate(PROBE)

        # ---- forced states: low daylight + critical flock
        await page.evaluate("""() => { const d=window.__day;
          d.night.daylight = 0.17;
          d.flock.centerX; }""")
        await page.wait_for_timeout(4200)
        await page.screenshot(path=f"{SHOTS}\\{label}_03_lowlight.png")
        out['lowlight'] = await page.evaluate(PROBE)

        # kill birds down to a critical flock
        await page.evaluate("""() => { const d=window.__day;
          while (d.flock.count > 41) d.flock.removeBird(d.flock.birds[d.flock.birds.length-1]);
          // put the sky back up: the urgent read has to survive a BRIGHT sky
          d.night.daylight = 0.62;
        }""")
        await page.wait_for_timeout(6500)
        await page.screenshot(path=f"{SHOTS}\\{label}_04_critical.png")
        out['critical'] = await page.evaluate(PROBE)

        # deepest urgent read: cut to just above the scatter threshold
        await page.evaluate("""() => { const d=window.__day;
          while (d.flock.count > 38) d.flock.removeBird(d.flock.birds[d.flock.birds.length-1]);
          d.night.daylight = 0.62; }""")
        await page.wait_for_timeout(2200)
        await page.screenshot(path=f"{SHOTS}\\{label}_06_urgent.png")
        out['urgent'] = await page.evaluate(PROBE)

        # zoomed crops of the HUD band
        vw, vh = viewport['width'], viewport['height']
        await page.screenshot(path=f"{SHOTS}\\{label}_05_crop.png",
                              clip={'x': 0, 'y': 0, 'width': vw, 'height': min(vh, int(vh * 0.34))})
        out['logs'] = [l for l in logs if 'PAGEERROR' in l or 'error' in l.lower()][-8:]
        await ctx.close(); await browser.close()
    return out


async def main():
    res = {}
    res['desktop'] = await run('desktop', {'width': 1536, 'height': 960}, False, 1)
    res['mobile'] = await run('mobile', {'width': 844, 'height': 390}, True, 3)
    import shutil
    for f in os.listdir(SHOTS):
        shutil.copy(os.path.join(SHOTS, f), os.path.join(FINAL, f))
    print(json.dumps(res, indent=1))

asyncio.run(main())
