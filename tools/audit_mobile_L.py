"""L1/L2/L3 audit: floating joystick, right-hand cluster, thumb reach.

Drives the real build with REAL touch events (CDP Input.dispatchTouchEvent),
reads the game's own resolved layout out of window.__touch, and captures a
screenshot at every step so the result can be LOOKED at rather than inferred.
"""
import asyncio, json, math, os, sys
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\mobileL"
os.makedirs(SHOTS, exist_ok=True)
UA = ("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36")
BASE = "http://localhost:58790"
W, H = 844, 390

L2C = """(a) => { const r=document.querySelector('canvas').getBoundingClientRect();
  const k=r.width/1536; return {x:r.left+a[0]*k, y:r.top+a[1]*k, k}; }"""


class Touch:
    """Multi-finger touch driver over CDP."""
    def __init__(self, cdp):
        self.cdp = cdp
        self.pts = {}

    async def _send(self, kind):
        await self.cdp.send("Input.dispatchTouchEvent", {
            "type": kind,
            "touchPoints": [{"x": p[0], "y": p[1], "id": i} for i, p in self.pts.items()],
        })

    async def down(self, fid, x, y):
        self.pts[fid] = (x, y)
        await self._send("touchStart")

    async def move(self, fid, x, y):
        self.pts[fid] = (x, y)
        await self._send("touchMove")

    async def glide(self, fid, x, y, steps=8, ms=16):
        sx, sy = self.pts[fid]
        for i in range(1, steps + 1):
            await self.move(fid, sx + (x - sx) * i / steps, sy + (y - sy) * i / steps)
            await asyncio.sleep(ms / 1000)

    async def up_all(self):
        self.pts = {}
        await self.cdp.send("Input.dispatchTouchEvent",
                            {"type": "touchEnd", "touchPoints": []})


async def main():
    out = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await browser.new_context(viewport={'width': W, 'height': H},
                                        has_touch=True, is_mobile=True,
                                        device_scale_factor=2, user_agent=UA)
        page = await ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on('pageerror', lambda e: logs.append(f"PAGEERROR: {e}"))
        cdp = await ctx.new_cdp_session(page)
        t = Touch(cdp)

        await page.goto(BASE + "/?day", wait_until="networkidle")
        await page.wait_for_function("() => !!window.__touch && !!window.__day", timeout=60000)
        await page.wait_for_timeout(3500)

        geo = await page.evaluate("""() => {
          const t = window.__touch; if (!t) return null;
          return {safe:t.safe, stickZoneRight:t.stickZoneRight, home:t.home, pads:t.pads};
        }""")
        out['geometry'] = geo
        if not geo:
            print(json.dumps({'FATAL': 'window.__touch missing', 'logs': logs[-15:]}, indent=1))
            return

        async def l2c(lx, ly):
            r = await page.evaluate(L2C, [lx, ly])
            return r['x'], r['y']

        async def shot(rel):
            await page.screenshot(path=SHOTS + rel, timeout=90000)

        async def state():
            return await page.evaluate("() => window.__touch.state()")

        # ---------- L3: reach maths, in millimetres ----------
        # 844 CSS px of landscape width on a 6.1" phone is ~145mm, so
        # 1536 logical px = 145mm -> 10.6 logical px per mm.
        PXMM = 1536 / 145.0
        safe = geo['safe']
        Rx, By = safe['x'] + safe['w'], safe['y'] + safe['h']
        pivot = (Rx - 30, By - 120)   # right thumb root: right edge, above the corner
        reach = []
        for pad in geo['pads']:
            d = math.hypot(pad['x'] - pivot[0], pad['y'] - pivot[1])
            reach.append({'name': pad['name'], 'logical': round(d),
                          'mm': round(d / PXMM, 1),
                          'ok': d / PXMM <= 52 or pad['name'] == 'PAUSE'})
        out['reach_from_right_thumb'] = reach
        # on-screen containment, including the tap captions under the big pads
        clip = []
        for pad in geo['pads']:
            low = pad['y'] + pad['r'] + (34 if pad['name'] in ('GATHER', 'SPREAD') else 0)
            clip.append({'name': pad['name'],
                         'left': round(pad['x'] - pad['r']), 'right': round(pad['x'] + pad['r']),
                         'top': round(pad['y'] - pad['r']), 'bottom': round(low),
                         'inside': pad['x'] - pad['r'] >= safe['x'] and pad['x'] + pad['r'] <= Rx
                                   and pad['y'] - pad['r'] >= safe['y'] and low <= By})
        out['containment'] = clip
        # no two hit circles overlap (an ambiguous press is a mis-tap)
        ov = []
        for i in range(len(geo['pads'])):
            for j in range(i + 1, len(geo['pads'])):
                a, b = geo['pads'][i], geo['pads'][j]
                d = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                if d < a['hitR'] + b['hitR']:
                    ov.append(f"{a['name']}/{b['name']} overlap {round(a['hitR']+b['hitR']-d)}px")
        out['hit_overlaps'] = ov or 'none'

        await page.screenshot(timeout=90000, path=SHOTS + r"\n01_idle.png")

        # ---------- L1: the joystick appears wherever the thumb lands ----------
        probes = [(300, 760), (620, 380), (180, 300)]
        appears = []
        for i, (lx, ly) in enumerate(probes):
            cx, cy = await l2c(lx, ly)
            await t.down(1, cx, cy)
            await page.wait_for_timeout(200)
            s = await state()
            appears.append({'touch_logical': [lx, ly], 'stick_active': s['stick']['active'],
                            'intent': [round(s['intent']['x']), round(s['intent']['y'])]})
            await page.screenshot(timeout=90000, path=SHOTS + rf"\n02_stick_{i}.png")
            await t.up_all()
            await page.wait_for_timeout(200)
        out['L1_stick_appears'] = appears

        # ---------- L1: deflection steers, and the base is sticky ----------
        cx, cy = await l2c(300, 700)
        await t.down(1, cx, cy)
        await page.wait_for_timeout(120)
        neutral = await state()
        ux, uy = await l2c(320, 560)      # up and slightly right
        await t.glide(1, ux, uy, steps=10)
        await page.wait_for_timeout(500)
        up = await state()
        await page.screenshot(timeout=90000, path=SHOTS + r"\n03_stick_up.png")
        dx, dy = await l2c(120, 880)      # hard down-left, past full throw
        await t.glide(1, dx, dy, steps=12)
        await page.wait_for_timeout(500)
        down = await state()
        await page.screenshot(timeout=90000, path=SHOTS + r"\n04_stick_downleft.png")
        out['L1_deflection'] = {
            'neutral': {'v': [round(neutral['stick']['vx'], 2), round(neutral['stick']['vy'], 2)],
                        'intent': [round(neutral['intent']['x']), round(neutral['intent']['y'])]},
            'up_right': {'v': [round(up['stick']['vx'], 2), round(up['stick']['vy'], 2)],
                         'intent': [round(up['intent']['x']), round(up['intent']['y'])]},
            'down_left': {'v': [round(down['stick']['vx'], 2), round(down['stick']['vy'], 2)],
                          'intent': [round(down['intent']['x']), round(down['intent']['y'])]},
        }

        # ---------- L2: a pad press must NOT steal steering ----------
        before = await state()
        pads = {q['name']: q for q in geo['pads']}
        gx, gy = await l2c(pads['GATHER']['x'], pads['GATHER']['y'])
        await t.down(2, gx, gy)           # second finger, stick still held
        await page.wait_for_timeout(400)
        during = await state()
        await page.screenshot(timeout=90000, path=SHOTS + r"\n05_stick_plus_gather.png")
        out['L2_no_steal'] = {
            'gather_held': during['gather'],
            'stick_still_active': during['stick']['active'],
            'intent_before': [round(before['intent']['x']), round(before['intent']['y'])],
            'intent_during': [round(during['intent']['x']), round(during['intent']['y'])],
            'intent_moved': round(math.hypot(during['intent']['x'] - before['intent']['x'],
                                             during['intent']['y'] - before['intent']['y']), 1),
        }
        await t.up_all()
        await page.wait_for_timeout(400)

        # ---------- L2: every pad, hold and tap ----------
        results = {}
        for name, flag in (('GATHER', 'gather'), ('SPREAD', 'spread'),
                           ('DIVE', 'dive'), ('BRACE', 'brace')):
            px, py = await l2c(pads[name]['x'], pads[name]['y'])
            await t.down(3, px, py)
            if name == 'BRACE':
                # the bullet-time window is 0.11s..0.81s after the press, so
                # sample it inside the page rather than across a round trip
                results['brace_slows_world'] = await page.evaluate(
                    """() => new Promise(r => { let hit=false;
                         const id=setInterval(()=>{ if(window.__day.braceOn) hit=true }, 20);
                         setTimeout(()=>{clearInterval(id); r(hit)}, 700) })""")
            await page.wait_for_timeout(700)
            s = await state()
            results[name + '_hold'] = s[flag]
            await page.screenshot(timeout=90000, path=SHOTS + rf"\n06_hold_{name}.png")
            await t.up_all()
            await page.wait_for_timeout(500)

        # taps: shapeKind is set by doSurge/doFlare/echoCall.
        # swiftshader stalls frames, so an emulated press can measure ~1s
        # through no fault of the game — retry until the press lands inside
        # the real 220ms tap window, and report the duration that did.
        for name, want in (('GATHER', 'arrow'), ('SPREAD', 'fan'), ('CALL', 'ring')):
            px, py = await l2c(pads[name]['x'], pads[name]['y'])
            rec = None
            for _ in range(6):
                await page.evaluate("() => { window.__day.flock.shapeKind = null }")
                await t.down(4, px, py)
                await t.up_all()
                await page.wait_for_timeout(200)
                got = await page.evaluate("() => window.__day.flock.shapeKind")
                pr = [q for q in (await state())['presses'] if q['name'] == name][0]
                rec = {'want': want, 'got': got, 'ok': got == want,
                       'press_ms': pr['ms'], 'counted_as_tap': pr['tap']}
                if pr['tap']:
                    break
                await page.wait_for_timeout(400)
            results[name + '_tap'] = rec
            await page.wait_for_timeout(500)
        results['CALL_cooldown_after_tap'] = await page.evaluate("() => window.__day.callCooldown")
        out['L2_actions'] = results
        await page.screenshot(timeout=90000, path=SHOTS + r"\n07_after_taps.png")

        # ---------- pause pad ----------
        async def tap_pause():
            px, py = await l2c(pads['PAUSE']['x'], pads['PAUSE']['y'])
            for _ in range(6):
                await t.down(5, px, py)
                await t.up_all()
                await page.wait_for_timeout(500)
                pr = [q for q in (await state())['presses'] if q['name'] == 'PAUSE'][0]
                if pr['tap']:
                    return pr['ms']
            return -1

        out['pause_press_ms'] = await tap_pause()
        out['pause_works'] = await page.evaluate("() => window.__day.paused")
        await page.screenshot(timeout=90000, path=SHOTS + r"\n08_paused.png")
        await tap_pause()
        out['unpaused'] = not await page.evaluate("() => window.__day.paused")

        # ---------- a touch in the right-hand sky must do nothing ----------
        s0 = await state()
        rx, ry = await l2c(1100, 380)
        await t.down(6, rx, ry)
        await page.wait_for_timeout(250)
        s1 = await state()
        out['right_sky_inert'] = {
            'stick_active': s1['stick']['active'],
            'intent_moved': round(math.hypot(s1['intent']['x'] - s0['intent']['x'],
                                             s1['intent']['y'] - s0['intent']['y']), 1)}
        await t.up_all()

        out['logs'] = [l for l in logs if 'PAGEERROR' in l or 'error' in l.lower()][-10:]
        await ctx.close(); await browser.close()
    print(json.dumps(out, indent=1))

asyncio.run(main())
