import json, re, os
from PIL import Image
SH = r"C:\dev\game-week\shots\h4"
LOG = r"C:\dev\game-week\shots\h4.log"

def lum(p): return 0.2126*p[0]+0.7152*p[1]+0.0722*p[2]

def patch(im, x, y, r):
    a = im.load(); W,H = im.size
    vals=[]
    for yy in range(max(0,y-r), min(H,y+r+1)):
        for xx in range(max(0,x-r), min(W,x+r+1)):
            vals.append(lum(a[xx,yy]))
    return vals

rows=[]
for line in open(LOG, encoding='utf8', errors='replace'):
    m = re.match(r'^(\S+) (\{.*)', line.strip())
    if not m: continue
    tag = m.group(1); raw = m.group(2)
    # the printed json was truncated at 400 chars; recover screenPts we can parse
    pts = re.findall(r'\[(\d+), (\d+)\]', raw)
    off = os.path.join(SH, tag+"_off.png"); on = os.path.join(SH, tag+"_on.png")
    if not os.path.exists(off): continue
    A = Image.open(off).convert('RGB'); B = Image.open(on).convert('RGB')
    per=[]
    for sx, sy in pts:
        x,y = int(sx), int(sy)
        if not (0 <= x < 1280 and 0 <= y < 800): continue
        core_on  = max(patch(B, x, y, 4))
        core_off = max(patch(A, x, y, 4))
        ring     = sorted(patch(A, x, y, 26))
        bg = ring[len(ring)//2]
        per.append({'x':x,'y':y,'bg':round(bg,1),'moteL':round(core_on,1),
                    'deltaL':round(core_on-core_off,1),
                    'weber': round((core_on-bg)/max(bg,1),3)})
    if per:
        rows.append({'arc':tag,'n':len(per),
                     'medianDeltaL': round(sorted(p['deltaL'] for p in per)[len(per)//2],1),
                     'maxDeltaL': round(max(p['deltaL'] for p in per),1),
                     'medianWeber': round(sorted(p['weber'] for p in per)[len(per)//2],3),
                     'pts':per})
for r in rows:
    print(f"{r['arc']:10s} n={r['n']:2d}  medianDeltaL={r['medianDeltaL']:6.1f}  maxDeltaL={r['maxDeltaL']:6.1f}  medianWeber={r['medianWeber']:+.3f}")
    for p in r['pts']:
        print(f"     @({p['x']:4d},{p['y']:3d}) sky L={p['bg']:5.1f} -> mote L={p['moteL']:5.1f}  dL={p['deltaL']:+6.1f}  weber={p['weber']:+.3f}")
