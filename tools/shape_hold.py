"""Shape-signal proof.

Headless swiftshader renders this game at ~2.7fps, so real-time capture cannot
resolve 0.15/0.25/0.35s. Instead we use the pattern already used elsewhere in
tools/: fly for real, pause the SCENE, then hand-step Flock.update at a fixed
1/60 dt. shapeT then advances exactly 16.67ms per step, so step 9 IS t=0.150s,
step 15 IS t=0.250s, step 21 IS t=0.350s - and Flock.update calls render(), so
the sprites on screen are the ones the player would see at that instant.

Emits: PNGs per timestamp, the envelope curve, per-bird seat error, and a
slot-stability test that kills birds mid-hold.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:58759"
SHOTS = r"C:\dev\game-week\shots\shape"
os.makedirs(SHOTS, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

# steps of 1/60s -> the three requested times, plus context frames
STEP_TAGS = {0: 0.0, 3: 0.05, 6: 0.10, 9: 0.15, 15: 0.25, 21: 0.35,
             27: 0.45, 36: 0.60, 48: 0.80}

SETUP = """() => {
  const d = window.__day, f = d.flock;
  d.scene.pause();
  window.__step = () => {
    f.update(1/60, { intentX: f.centerX + 620, intentY: f.centerY,
                     gather: false, spread: false }, d.obstacles);
  };
  window.__local = () => {
    const sp = Math.hypot(f.meanVX, f.meanVY) || 1;
    const hx = f.meanVX / sp, hy = f.meanVY / sp;
    return f.birds.map(b => {
      const dx = b.x - f.centerX, dy = b.y - f.centerY;
      return [dx*hx + dy*hy, -dx*hy + dy*hx, b.slotIdx];
    });
  };
  // a FIXED-SIZE window centred on the flock: the three frames then share one
  // scale, which is what "the same chevron in all three" has to be judged on
  window.__clip = (side) => {
    const cam = d.cameras.main, r = d.game.canvas.getBoundingClientRect();
    const k = r.width / d.game.scale.gameSize.width;
    let sx = 0, sy = 0;
    for (const b of f.birds) { sx += b.sprite.x; sy += b.sprite.y; }
    sx /= f.birds.length; sy /= f.birds.length;
    const cx = r.left + (sx - cam.scrollX) * k, cy = r.top + (sy - cam.scrollY) * k;
    const w = Math.min(side * k, window.innerWidth), h = Math.min(side * k, window.innerHeight);
    return { x: Math.max(0, Math.min(window.innerWidth - w, cx - w/2)),
             y: Math.max(0, Math.min(window.innerHeight - h, cy - h/2)),
             width: w, height: h };
  };
  window.__state = () => ({ kind: f.shapeKind || '', t: +f.shapeT.toFixed(4),
    env: +f.shapeEnvelope().toFixed(4), n: f.birds.length,
    slots: f.shapeSlots.length, pulse: +f.pulse.toFixed(3) });
  return true;
}"""


def seat_stats(local, slots):
    errs = []
    for lx, ly, si in local:
        if si is None or si < 0 or si >= len(slots):
            continue
        sx, sy = slots[si]
        errs.append(((lx - sx) ** 2 + (ly - sy) ** 2) ** 0.5)
    n = len(errs) or 1
    xs = [-p[0] for p in local]
    ys = [abs(p[1]) for p in local]
    m = len(xs); mx = sum(xs)/m; my = sum(ys)/m
    num = sum((xs[i]-mx)*(ys[i]-my) for i in range(m))
    dx = sum((v-mx)**2 for v in xs) ** 0.5
    dy = sum((v-my)**2 for v in ys) ** 0.5
    return {
        'seated<=26px': round(sum(1 for e in errs if e <= 26)/n, 3),
        'meanSeatErr': round(sum(errs)/n, 1),
        'chevronCorr': round(num/(dx*dy), 3) if dx and dy else 0.0,
        'spanAlong': round(max(p[0] for p in local) - min(p[0] for p in local), 1),
        'spanAcross': round(max(p[1] for p in local) - min(p[1] for p in local), 1),
    }


async def cast_run(pg, kind, tag, trigger, shots=True):
    await pg.evaluate(trigger)
    slots = await pg.evaluate("() => window.__day.flock.shapeSlots")
    env_curve = []
    out = {'kind': kind, 'slotCount': len(slots), 'frames': {}, 'geometry': {}}
    for step in range(0, 55):
        st = await pg.evaluate("() => window.__state()")
        env_curve.append([round(st['t'], 3), st['env']])
        if step in STEP_TAGS:
            loc = await pg.evaluate("() => window.__local()")
            key = f"t{int(STEP_TAGS[step]*1000):03d}"
            out['geometry'][key] = dict(seat_stats(loc, slots), shapeT=st['t'], env=st['env'])
            if shots and STEP_TAGS[step] in (0.15, 0.25, 0.35):
                # Flock.update() only writes sprite.x/y; the canvas is not
                # repainted until Phaser's own rAF render runs, and that is
                # ~7fps under swiftshader. Without this wait the screenshot
                # shows a state several hand-steps stale.
                await pg.evaluate("""() => new Promise(r =>
                    requestAnimationFrame(() => requestAnimationFrame(() =>
                    requestAnimationFrame(r))))""")
                clip = await pg.evaluate("(s) => window.__clip(s)", 620)
                p = os.path.join(SHOTS, f"{tag}_{kind}_{key}.png")
                await pg.screenshot(path=p, clip=clip)
                out['frames'][key] = p
                pf = os.path.join(SHOTS, f"{tag}_{kind}_{key}_full.png")
                await pg.screenshot(path=pf)
                out['frames'][key + '_full'] = pf
        await pg.evaluate("() => window.__step()")
    out['envCurve'] = env_curve
    peak = [t for t, e in env_curve if e >= 0.999]
    out['framesAtFullForm'] = len(peak)
    out['holdSeconds'] = round(max(peak) - min(peak), 3) if len(peak) > 1 else 0.0
    read = [t for t, e in env_curve if e >= 0.7]
    out['secondsAbove0.7'] = round(max(read) - min(read), 3) if len(read) > 1 else 0.0
    out['castDuration'] = round(max(t for t, _ in env_curve), 3)
    return out


async def slot_stability(pg):
    """Kill 20 birds mid-hold. Under the old index-keyed slots every later bird
    shifted one seat along the curve; a stable slotIdx must not move anyone."""
    await pg.evaluate("() => window.__day.doSurge()")
    for _ in range(12):  # into the hold
        await pg.evaluate("() => window.__step()")
    before = await pg.evaluate("""() => {
      const f = window.__day.flock;
      return f.birds.map(b => [b.x, b.y, b.slotIdx]); }""")
    ctrl = await pg.evaluate("""() => {
      const f = window.__day.flock;
      const p = f.birds.map(b => [b.x, b.y]);
      window.__step();
      let mx = 0;
      f.birds.forEach((b,i) => { mx = Math.max(mx, Math.hypot(b.x-p[i][0], b.y-p[i][1])); });
      return +mx.toFixed(1); }""")
    res = await pg.evaluate("""() => {
      const f = window.__day.flock;
      const keep = new Map(f.birds.map(b => [b, [b.x, b.y, b.slotIdx]]));
      // kill 20 spread through the array, the way a falcon or the fog does
      const doomed = [];
      for (let i = 5; i < f.birds.length && doomed.length < 20; i += 5) doomed.push(f.birds[i]);
      for (const b of doomed) f.removeBird(b);
      let shifted = 0;
      for (const b of f.birds) if (keep.get(b)[2] !== b.slotIdx) shifted++;
      window.__step();
      let mx = 0, sum = 0;
      for (const b of f.birds) {
        const d = Math.hypot(b.x - keep.get(b)[0], b.y - keep.get(b)[1]);
        mx = Math.max(mx, d); sum += d;
      }
      return { killed: doomed.length, survivors: f.birds.length,
               birdsWhoseSlotChanged: shifted,
               maxJumpPx: +mx.toFixed(1), meanJumpPx: +(sum/f.birds.length).toFixed(1) }; }""")
    res['controlStepMaxJumpPx'] = ctrl
    res['birdsRemaining'] = before and len(before)
    return res


async def run(w, h, tag, mobile):
    out = {'viewport': f'{w}x{h}'}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=ARGS)
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1,
                                  has_touch=mobile, is_mobile=mobile)
        pg = await ctx.new_page(); pg.set_default_timeout(120000)
        # another agent is editing this repo live; vite's HMR socket would
        # reload the page mid-probe and wipe the paused, hand-stepped state
        await pg.add_init_script("""window.WebSocket = class {
            constructor(){ this.readyState = 0; }
            addEventListener(){} removeEventListener(){} send(){} close(){}
          };""")
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE + "/?day", wait_until="networkidle")
        await pg.wait_for_function("() => !!window.__day && !!window.__day.flock", timeout=60000)
        await pg.wait_for_timeout(3000)
        await pg.mouse.move(w * 0.85, h * 0.5)
        await pg.wait_for_timeout(3000)
        out['fpsNote'] = await pg.evaluate("() => +window.__day.game.loop.actualFps.toFixed(1)")
        await pg.evaluate(SETUP)
        out['arrow'] = await cast_run(pg, 'arrow', tag, "() => window.__day.doSurge()")
        out['fan'] = await cast_run(pg, 'fan', tag, "() => window.__day.doFlare()")
        out['ring'] = await cast_run(pg, 'ring', tag, "() => window.__day.echoCall()")
        out['slotStability'] = await slot_stability(pg)
        out['pageErrors'] = errs[:6]
        await ctx.close(); await b.close()
    return out


async def main():
    res = {}
    which = sys.argv[1] if len(sys.argv) > 1 else 'both'
    if which in ('both', 'desktop'):
        res['desktop'] = await run(1536, 960, 'desk', False)
    if which in ('both', 'mobile'):
        res['mobile'] = await run(844, 390, 'mob', True)
    print(json.dumps(res, indent=1))

asyncio.run(main())
