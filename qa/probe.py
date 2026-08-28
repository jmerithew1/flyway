"""FLYWAY mobile QA probe. Read-only: drives the production preview build."""
import sys, json, time, os, math
from playwright.sync_api import sync_playwright

URL = "http://localhost:5211/flyway/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "qa/shots/p1"
W, H = (int(x) for x in (sys.argv[2].split("x") if len(sys.argv) > 2 else ["844", "390"]))
os.makedirs(OUT, exist_ok=True)

UA = ("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Mobile Safari/537.36")

logs, neterr = [], []


def mk(p, w=W, h=H, dsf=3):
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader",
                                "--disable-web-security", "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=True, is_mobile=True,
                        device_scale_factor=dsf, user_agent=UA)
    pg = ctx.new_page()
    pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"[:400]))
    pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"[:400]))
    pg.on("response", lambda r: neterr.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    return b, ctx, pg


def shot(pg, name):
    path = f"{OUT}/{name}.png"
    pg.screenshot(path=path)
    return path


def tap(pg, x, y):
    pg.touchscreen.tap(x, y)


def hold(pg, x, y, ms):
    pg.evaluate("""([x,y,id])=>{
      const c=document.querySelector('canvas');
      const t=(ty,ax,ay)=>{const tt=new Touch({identifier:id,target:c,clientX:ax,clientY:ay,
        radiusX:12,radiusY:12,force:1});
        c.dispatchEvent(new TouchEvent(ty,{bubbles:true,cancelable:true,touches:ty==='touchend'?[]:[tt],
          targetTouches:ty==='touchend'?[]:[tt],changedTouches:[tt]}));};
      window.__T=window.__T||{}; window.__T[id]=t; t('touchstart',x,y);
    }""", [x, y, 900])
    pg.wait_for_timeout(ms)
    pg.evaluate("""([x,y,id])=>{window.__T[id]('touchend',x,y)}""", [x, y, 900])


class Finger:
    """A raw multi-touch finger, so pads and stick can be held simultaneously."""
    def __init__(self, pg, ident):
        self.pg, self.id = pg, ident
        self.x = self.y = 0
        self.down = False

    def _ev(self, ty, x, y):
        self.pg.evaluate("""([ty,x,y,id,live])=>{
          const c=document.querySelector('canvas');
          window.__F=window.__F||{};
          if(ty==='touchend') delete window.__F[id]; else window.__F[id]={x,y};
          const mkT=(i,px,py)=>new Touch({identifier:+i,target:c,clientX:px,clientY:py,radiusX:12,radiusY:12,force:1});
          const all=Object.entries(window.__F).map(([i,p])=>mkT(i,p.x,p.y));
          const ch=[mkT(id,x,y)];
          c.dispatchEvent(new TouchEvent(ty,{bubbles:true,cancelable:true,touches:all,targetTouches:all,changedTouches:ch}));
        }""", [ty, x, y, self.id, True])

    def start(self, x, y):
        self.x, self.y, self.down = x, y, True
        self._ev("touchstart", x, y)

    def move(self, x, y):
        self.x, self.y = x, y
        self._ev("touchmove", x, y)

    def end(self):
        if self.down:
            self._ev("touchend", self.x, self.y)
            self.down = False


def js(pg, expr):
    try:
        return pg.evaluate(expr)
    except Exception as e:
        return {"err": str(e)}
