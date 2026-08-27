import sys, os
from PIL import Image

SH = r"C:\dev\game-week\shots\hud"

def crop(name, box, scale, out):
    im = Image.open(os.path.join(SH, name))
    c = im.crop(box)
    c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
    c.save(os.path.join(SH, out))
    print(out, c.size, 'from', im.size)

for a in sys.argv[1:]:
    name, x, y, w, h, s, out = a.split(',')
    crop(name, (int(x), int(y), int(x) + int(w), int(y) + int(h)), float(s), out)
