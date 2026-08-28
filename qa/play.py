"""Full mobile playthrough probe. Usage: play.py <outdir> <WxH>"""
import sys, json, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe import *

R = {"findings": [], "notes": {}}


def note(k, v):
    R["notes"][k] = v
    print(f"  . {k} = {json.dumps(v)[:300]}", flush=True)


SCENE = "()=>window.__game? window.__game.scene.getScenes(true).map(s=>s.scene.key):'x'"

# logical -> css mapping
MAP = """(pt)=>{const g=window.__game;const r=g.canvas.getBoundingClientRect();
 const kx=r.width/g.scale.width, ky=r.height/g.scale.height;
 return {x:+(pt[0]*kx+r.left).toFixed(1), y:+(pt[1]*ky+r.top).toFixed(1)}}"""

TEXTS = """()=>{
  const g=window.__game; if(!g) return [];
  const r=g.canvas.getBoundingClientRect();
  const kx=r.width/g.scale.width, ky=r.height/g.scale.height;
  const out=[];
  for (const s of g.scene.getScenes(true)) {
    const walk=(o,px,py,pa,pv)=>{
      const a=pa*o.alpha, v=pv&&o.visible;
      if(o.type==='Container'){for(const c of o.list) walk(c,px+o.x,py+o.y,a,v); return;}
      if(o.type!=='Text') return;
      const b=o.getBounds();
      out.push({sc:s.scene.key,txt:(o.text||'').replace(/\\n/g,'|').slice(0,60),a:+a.toFixed(2),vis:v,
        cx:+((b.centerX+px)*kx+r.left).toFixed(1),cy:+((b.centerY+py)*ky+r.top).toFixed(1),
        w:+(b.width*kx).toFixed(1),h:+(b.height*ky).toFixed(1),px:o.style.fontSize});
    };
    for(const o of s.children.list) walk(o,0,0,1,true);
  }
  return out;
}"""

DAY = """()=>{const d=window.__day; if(!d) return null;
 try{ return {daylight:+d.night.daylight.toFixed(3), edgeX:Math.round(d.night.edgeX),
   encroach:+d.night.encroach.toFixed(3), scrollX:Math.round(d.scrollX),
   birds:d.flock.birds.filter(b=>b.alive!==false).length, total:d.flock.birds.length,
   cx:Math.round(d.flock.centerX), cy:Math.round(d.flock.centerY),
   failing:!!d.failing, finishing:!!d.finishing, cp:d.checkpoint&&d.checkpoint.x};
 }catch(e){return {err:''+e}}}"""


def main():
    with sync_playwright() as p:
        b, ctx, pg = mk(p)
        pg.goto(URL, wait_until="domcontentloaded")
        for i in range(90):
            pg.wait_for_timeout(1000)
            if isinstance(js(pg, SCENE), list) and js(pg, SCENE):
                break
        note("boot_s", i + 1)
        pg.wait_for_timeout(4000)
        note("scenes", js(pg, SCENE))
        note("scale", js(pg, "()=>{const s=window.__game.scale;const r=window.__game.canvas.getBoundingClientRect();return{mode:s.scaleMode,game:[s.width,s.height],rect:[+r.left.toFixed(1),+r.top.toFixed(1),+r.width.toFixed(1),+r.height.toFixed(1)],win:[innerWidth,innerHeight]}}"))
        shot(pg, "10-title")
        t = js(pg, TEXTS)
        note("titleTexts", [(x["txt"], x["cx"], x["cy"], x["a"], x["vis"]) for x in t])

        # --- tap CONTROLS at its visual centre
        c = next((x for x in t if x["txt"] == "CONTROLS" and x["vis"]), None)
        if c:
            tap(pg, c["cx"], c["cy"])
            pg.wait_for_timeout(1600)
            shot(pg, "11-tap-controls")
            note("afterControls_scene", js(pg, SCENE))
            note("afterControls_texts", [x["txt"] for x in js(pg, TEXTS) if x["vis"] and x["a"] > 0.05][:20])
            # dismiss
            tap(pg, 30, 30)
            pg.wait_for_timeout(1200)
            shot(pg, "12-controls-dismissed")
            note("afterDismiss_scene", js(pg, SCENE))

        # --- if we're still on Title, tap BEGIN FLIGHT at visual centre
        if "Title" in (js(pg, SCENE) or []):
            t = js(pg, TEXTS)
            bf = next((x for x in t if "BEGIN FLIGHT" in x["txt"] and x["vis"]), None)
            note("beginFlightBox", bf)
            if bf:
                tap(pg, bf["cx"], bf["cy"])
            pg.wait_for_timeout(2500)
        note("scene_after_begin", js(pg, SCENE))
        shot(pg, "13-after-begin")

        if "Day" not in (js(pg, SCENE) or []):
            note("FAIL", "did not reach Day scene")
            print(json.dumps(R, indent=1)); b.close(); return

        pg.wait_for_timeout(3000)
        shot(pg, "20-day-start")
        note("day", js(pg, DAY))
        tl = js(pg, "()=>{const t=window.__touch; if(!t) return null; return {safe:t.safe, stickZoneRight:t.stickZoneRight, home:t.home, pads:t.pads}}")
        note("touchLayout", tl)

        # map every pad to CSS coords
        pads = {}
        if tl:
            for pd in tl["pads"]:
                pads[pd["name"]] = js(pg, MAP, ) if False else pg.evaluate(MAP, [pd["x"], pd["y"]])
                pads[pd["name"]]["r_css"] = pg.evaluate(
                    "(r)=>{const g=window.__game;return +(r*g.canvas.getBoundingClientRect().width/g.scale.width).toFixed(1)}", pd["r"])
        note("padsCss", pads)

        # --- every pad, tapped at its VISUAL centre
        padresult = {}
        for name, pos in pads.items():
            before = js(pg, "()=>window.__touch.state()")
            f = Finger(pg, 11)
            f.start(pos["x"], pos["y"])
            pg.wait_for_timeout(120)
            held = js(pg, "()=>window.__touch.state()")
            f.end()
            pg.wait_for_timeout(200)
            after = js(pg, "()=>window.__touch.state()")
            pr = next((q for q in after["presses"] if q["name"] == name), None)
            padresult[name] = {"pressRegistered": pr, "heldState": {k: held[k] for k in ("gather", "spread", "dive", "brace")}}
        note("padTapTest", padresult)
        shot(pg, "21-pads")

        # --- steering: joystick, hold right and fly
        stick = Finger(pg, 21)
        sx, sy = pg.evaluate(MAP, [tl["safe"]["x"] + tl["safe"]["w"] * 0.2, tl["safe"]["y"] + tl["safe"]["h"] * 0.5]).values()
        stick.start(sx, sy)
        pg.wait_for_timeout(200)
        shot(pg, "22-stick-visible")
        note("stickState", js(pg, "()=>window.__touch.state().stick"))
        stick.move(sx + 60, sy)
        pg.wait_for_timeout(400)
        note("stickDeflected", js(pg, "()=>window.__touch.state()"))

        # fly a while, capturing fog at daylight thresholds
        targets = [0.9, 0.7, 0.5, 0.35, 0.2, 0.08]
        got = set()
        t0 = time.time()
        step = 0
        while time.time() - t0 < 170:
            step += 1
            # weave: chase motes by oscillating vertically
            phase = (step % 8)
            dy = [-40, -20, 0, 20, 40, 20, 0, -20][phase]
            stick.move(sx + 55, sy + dy)
            pg.wait_for_timeout(700)
            d = js(pg, DAY)
            if not d or d.get("err"):
                note("dayReadErr", d); break
            for tgt in targets:
                if tgt not in got and d["daylight"] <= tgt + 0.03:
                    got.add(tgt)
                    shot(pg, f"30-fog-day{int(tgt*100):03d}")
                    note(f"fog@{tgt}", d)
            if d["failing"] or d["finishing"]:
                note("stateChange", d); break
            if d["daylight"] <= 0.03:
                shot(pg, "30-fog-day000"); note("fog@0", d); break
        note("afterFly", js(pg, DAY))
        shot(pg, "39-after-fly")
        stick.end()
        pg.wait_for_timeout(500)

        print(json.dumps(R, indent=1))
        print("LOGS:", [l for l in logs if 'GL Driver' not in l and 'Phaser v3' not in l][-30:])
        print("NETERR:", neterr[:30])
        b.close()


main()
