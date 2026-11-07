# kh-logo.png から社名ロゴ（上部の Disney・SQUARE ENIX）を除いた透かし用画像 kh-logo-mark.png を作る（2026-11-08）。
# 使い方: python3 scripts/make-kh-logo-mark.py web/kingdomhearts/kh-logo.png web/kingdomhearts/kh-logo-mark.png
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
assert im.size == (465, 310), im.size
c = im.crop((0, 36, im.width, im.height))
c = c.crop(c.getbbox())
px = c.load()
for y in range(6):
    for x in range(c.width):
        r, g, b, a = px[x, y]
        if a > 0 and min(r, g, b) > 150:
            px[x, y] = (0, 0, 0, 0)
assert c.size == (458, 273), c.size
c.save(dst, optimize=True)
print("ok", c.size)
