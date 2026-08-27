"""I1/I2/I3 drama-beat capture.

Headless screenshots cost ~15-20s each under swiftshader, so a real-time burst
samples the beat about twice. Instead this drives the game's own loop callback
by hand (game.loop.callback, NOT loop.sleep() which freezes the tween manager),
so every frame of a 0.46s dive can be rendered and photographed deterministically.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

SHOTS = r"C:\dev\game-week\shots\beats"
BASE = "http://localhost:58759"
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

FREEZE = """() => {
  const g = window.__game;
  if (!g.__cb) { g.__cb = g.loop.callback; g.__t = performance.now(); }
  g.loop.callback = () => {};
  return true;
}"""

STEP = """(n) => {
  const g = window.__game;
  for (let i = 0; i < n; i++) { g.__t += 16.667; g.__cb(g.__t, 16.667); }
  return +(g.__t).toFixed(0);
}"""

THAW = """() => { const g = window.__game; if (g.__cb) { g.loop.callback = g.__cb; g.__cb = null; } return true; }"""

STATE = """() => {
  const s = window.__day;
  if (!s || !s.falcon) return { gone: true };
  const f = s.falcon;
  const streaks = (f.streaks || []).filter(x => x.visible);
  const parts = s.children.list.filter(c => c.type === 'ParticleEmitter');
  return {
    phase: f.phase,
    diveT: +(f.diveT || 0).toFixed(3),
    fx: Math.round(f.falcon.x), fy: Math.round(f.falcon.y),
    fvis: f.falcon.visible, fa: +f.falcon.alpha.toFixed(2), fsc: +f.falcon.scaleX.toFixed(3),
    nStreak: streaks.length,
    streakA: streaks.map(x => +x.alpha.toFixed(2)).slice(0, 4),
    streakLen: streaks.map(x => Math.round(x.displayWidth)).slice(0, 4),
    veilA: +s.predatorVeil.alpha.toFixed(3),
    hitStop: +s.hitStop.toFixed(3),
    camKick: +s.camKick.toFixed(2),
    zoom: +s.cameras.main.zoom.toFixed(3),
    flock: s.flock.count,
    mobLift: +s.mobLift.toFixed(2),
    nEmitters: parts.length,
    alive: parts.reduce((a, p) => a + p.getAliveParticleCount(), 0),
    kids: s.children.list.length
  };
}"""

PLACE = """(args) => {
  const s = window.__day, wx = args[0], wy = args[1];
  const dx = wx - s.flock.centerX, dy = wy - s.flock.centerY;
  for (const b of s.flock.birds) { b.x += dx; b.y += dy; }
  s.scrollX = wx - 700;
  return { cx: Math.round(s.flock.centerX), cy: Math.round(s.flock.centerY), scroll: Math.round(s.scrollX) };
}"""

ARM = """(mob) => {
  const s = window.__day, f = s.falcon;
  s.flock.birds.forEach(b => { b.danger = 0; });
  f.phase = 'window'; f.timer = 0; f.window = 0.0001;
  f.zoneArrivalCount = mob ? s.flock.count : 99999;
  if (mob) { s.flock.form = 1; s.flock.gatherStrain = 0; }
  else { s.flock.form = -0.6; s.flock.spreadStrain = 0.8; }
  return { mob: !!mob, form: s.flock.form, n: s.flock.count };
}"""

FIND_BRITTLE = """() => {
  const s = window.__day;
  for (const [ob, f] of s.obstacleFeature) {
    if (f.brittle) { window.__bo = ob; window.__bf = f;
      return { x: Math.round(ob.x), y: Math.round(ob.y), fx: Math.round(f.x), art: f.art }; }
  }
  return null;
}"""

BREAK = """() => {
  const s = window.__day;
  const spr = s.featureSprites.get(window.__bf);
  s.flock.meanVX = 520; s.flock.meanVY = -70;
  const before = s.children.list.length;
  s.breakFeature(window.__bo);
  return { kidsBefore: before, kidsAfter: s.children.list.length,
           spriteVisible: spr ? spr.visible : null,
           hitStop: +s.hitStop.toFixed(3), camKick: +s.camKick.toFixed(2) };
}"""

SCHED = {
    # cumulative sim frames after the beat is armed (60fps)
    'I1': [1, 3, 6, 9, 12, 15, 17, 18, 19, 21, 24, 30, 40, 62, 95, 150],
    'I3': [1, 3, 6, 10, 15, 22, 30, 40, 55, 70, 90, 115, 150],
    'I2': [1, 2, 4, 6, 9, 13, 18, 24, 32, 42, 56, 75, 105],
}


async def march(pg, tag, frames, log):
    prev = 0
    for k, target in enumerate(frames):
        await pg.evaluate(STEP, target - prev)
        prev = target
        await pg.screenshot(path=f"{SHOTS}\\{tag}{k:02d}.png")
        try:
            log.append({'k': k, 'f': target, 't': round(target / 60, 3), **(await pg.evaluate(STATE))})
        except Exception as e:
            log.append({'k': k, 'f': target, 'err': str(e)[:200]})


async def beat(pw, w, h, mobile, tag, which):
    br = await pw.chromium.launch(headless=True, args=ARGS)
    ctx = await br.new_context(viewport={'width': w, 'height': h},
                               device_scale_factor=1,
                               has_touch=mobile, is_mobile=mobile)
    pg = await ctx.new_page()
    pg.set_default_timeout(180000)
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:400]))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:250]) if m.type == 'error' else None)
    out = {'console': errs}

    await pg.goto(BASE + "/?day", wait_until="networkidle")
    await pg.wait_for_function("() => !!window.__day", timeout=60000)
    await pg.wait_for_timeout(4500)
    await pg.mouse.move(w * 0.5, h * 0.45)
    await pg.wait_for_timeout(2000)
    log = []

    if which == 'I2':
        b = await pg.evaluate(FIND_BRITTLE)
        out['brittle'] = b
        out['place'] = await pg.evaluate(PLACE, [b['fx'], 420])
        await pg.wait_for_timeout(900)

    await pg.screenshot(path=f"{SHOTS}\\{tag}_{which}_pre.png")
    out['pre'] = await pg.evaluate(STATE)
    await pg.evaluate(FREEZE)

    if which == 'I1':
        out['arm'] = await pg.evaluate(ARM, False)
    elif which == 'I3':
        out['arm'] = await pg.evaluate(ARM, True)
    else:
        out['break'] = await pg.evaluate(BREAK)

    await march(pg, f"{tag}_{which}_", SCHED[which], log)
    await pg.evaluate(THAW)
    out['log'] = log
    await ctx.close()
    await br.close()
    return out


async def main():
    res = {}
    only = sys.argv[1:] or ['I1', 'I3', 'I2']
    async with async_playwright() as pw:
        for name, w, h, mob, tag in [('desktop', 1536, 960, False, 'D'),
                                     ('mobile', 844, 390, True, 'M')]:
            res[name] = {}
            for k in only:
                res[name][k] = await beat(pw, w, h, mob, tag, k)
    json.dump(res, open(SHOTS + r"\log.json", "w"), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str)[:14000])


asyncio.run(main())
