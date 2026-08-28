import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe import *

SCENE = "()=>{const g=window.__game;if(!g)return'nogame';return g.scene.getScenes(true).map(s=>s.scene.key)}"

SCALE = """()=>{const g=window.__game;if(!g)return'nogame';const s=g.scale;const r=g.canvas.getBoundingClientRect();
 return {mode:s.scaleMode, gameSize:[s.width,s.height], parent:[s.parentSize.width,s.parentSize.height],
  display:[s.displaySize.width,s.displaySize.height],
  rect:{l:+r.left.toFixed(1),t:+r.top.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)},
  win:[innerWidth,innerHeight], dpr:devicePixelRatio}}"""

TEXTS = """()=>{
  const g=window.__game; if(!g) return 'nogame';
  const rect=g.canvas.getBoundingClientRect();
  const kx=rect.width/g.scale.width, ky=rect.height/g.scale.height;
  const out=[];
  for (const s of g.scene.getScenes(true)) {
    const walk=(obj,px,py)=>{
      if(obj.type==='Container'){for(const c of obj.list) walk(c,px+obj.x,py+obj.y); return;}
      if(obj.type!=='Text') return;
      const b=obj.getBounds();
      out.push({sc:s.scene.key, txt:(obj.text||'').replace(/\\n/g,'|').slice(0,50), a:+obj.alpha.toFixed(2), vis:obj.visible,
        cx:+((b.centerX+px)*kx+rect.left).toFixed(1), cy:+((b.centerY+py)*ky+rect.top).toFixed(1),
        w:+(b.width*kx).toFixed(1), h:+(b.height*ky).toFixed(1), px:obj.style.fontSize});
    };
    for(const o of s.children.list) walk(o,0,0);
  }
  return out;
}"""

report = {}
with sync_playwright() as p:
    b, ctx, pg = mk(p)
    pg.goto(URL, wait_until="domcontentloaded")
    # wait for the Title scene to actually exist
    for i in range(60):
        pg.wait_for_timeout(1000)
        sc = js(pg, SCENE)
        if isinstance(sc, list) and any(k in ("Title", "Day") for k in sc):
            report["bootSeconds"] = i + 1
            break
    report["scenes"] = js(pg, SCENE)
    report["scale"] = js(pg, SCALE)
    pg.wait_for_timeout(4000)
    shot(pg, "01-title")
    report["texts"] = js(pg, TEXTS)
    report["veil"] = js(pg, "()=>{const v=document.getElementById('boot-veil');return v? getComputedStyle(v).opacity : 'removed'}")
    print(json.dumps(report, indent=1))
    print("LOGS:", [l for l in logs if 'GL Driver' not in l][-30:])
    print("NETERR:", neterr[:30])
    b.close()
