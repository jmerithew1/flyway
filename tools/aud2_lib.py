import os, json, time
from playwright.sync_api import sync_playwright

SHOTS = r"C:\dev\game-week\shots"
URL = "http://localhost:58759/?day"
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

STATS_JS = """() => {
  const d = window.__day; if (!d) return null;
  const f = d.flock; const bs = f.birds.filter(b=>b.alive);
  const n = bs.length || 1;
  let sx=0, sy=0, svx=0, svy=0, sp=0;
  for (const b of bs){ sx+=b.x; sy+=b.y; svx+=b.vx; svy+=b.vy; sp+=Math.hypot(b.vx,b.vy); }
  const cx=sx/n, cy=sy/n;
  let sprd=0, wmax=-1e9, wmin=1e9, hmax=-1e9, hmin=1e9;
  for (const b of bs){ sprd += Math.hypot(b.x-cx, b.y-cy);
    wmax=Math.max(wmax,b.x); wmin=Math.min(wmin,b.x);
    hmax=Math.max(hmax,b.y); hmin=Math.min(hmin,b.y); }
  return {
    n: bs.length,
    meanSpeed: sp/n,
    netSpeed: Math.hypot(svx/n, svy/n),
    spread: sprd/n,
    bboxW: wmax-wmin, bboxH: hmax-hmin,
    cx, cy,
    pulse: f.pulse, flareAmt: f.flareAmt, shapeKind: f.shapeKind,
    diveLift: f.diveLift, dive: f.dive,
    gatherStrain: f.gatherStrain, spreadStrain: f.spreadStrain,
    scrollX: d.scrollX, simClock: d.simClock,
    callTimer: d.callTimer, callCooldown: d.callCooldown,
    tweens: d.tweens.getTweens().length,
    displayObjs: d.children.list.length,
  };
}"""


def boot(headless=True, w=1280, h=720):
    pw = sync_playwright().start()
    br = pw.chromium.launch(headless=headless, args=ARGS)
    pg = br.new_page(viewport={'width': w, 'height': h})
    pg.on('console', lambda m: print('CONSOLE', m.type, m.text[:200]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: print('PAGEERROR', str(e)[:300]))
    pg.goto(URL)
    pg.wait_for_function("() => window.__day && window.__day.flock && window.__day.flock.birds.length > 0", timeout=30000)
    pg.wait_for_timeout(1500)
    return pw, br, pg


def stats(pg):
    return pg.evaluate(STATS_JS)


def shot(pg, name, clip=None):
    p = os.path.join(SHOTS, name)
    pg.screenshot(path=p, clip=clip)
    return p
