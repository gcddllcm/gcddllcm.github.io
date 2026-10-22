"""Tests for the embedded Notebook -> PDF code (js/pdfpy.js). Run: python3 tests/test_pdf.py  (needs: pip install pymupdf pillow)"""
import io, json, re, subprocess, sys, zipfile, pathlib
import pymupdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = subprocess.check_output(['node', '-e', "import('./js/pdfpy.js').then(m=>process.stdout.write(m.PDF_PY))"], cwd=ROOT).decode('utf-8')
ns = {}
exec(compile(src, 'pdfpy', 'exec'), ns)
convert = ns['convert']; simple = ns['_is_simple_image_page']

def png(w, h, color):
    b = io.BytesIO(); Image.new('RGB', (w, h), color).save(b, 'PNG'); return b.getvalue()

def creator_svg(w, h, href='images/a.png'):   # same markup as js/creator.js pageSvg()
    cx, cy = w / 2, h / 2
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<svg width="{round(w)}" height="{round(h)}" xml:id="page.1"><title>Untitled</title><g class="foreground">'
            '<image xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'x="0.00" y="0.00" width="{w:.2f}" height="{h:.2f}" RotationPoint="({cx:.6f},{cy:.6f})" '
            f'transform="rotate(0.00,{cx:.2f},{cy:.2f})" xml:id="annotation.2" visible="1" xlink:href="{href}" locked="30"/></g></svg>')

def notebook(svg, img):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        z.writestr('page1.svg', svg); z.writestr('images/a.png', img)
    return b.getvalue()

def run(svg, img, **kw):
    out, failed = convert(notebook(svg, img), 't', lambda *a: None, lambda *a: None, **kw)
    assert failed == 0
    d = pymupdf.open(stream=out, filetype='pdf')
    return d[0], d

def px(page, fx, fy):
    pix = page.get_pixmap(dpi=36)
    return tuple(pix.pixel(int(pix.width * fx), int(pix.height * fy)))

def near(a, b, tol=4):   # JPEG rounds colours slightly
    return all(abs(x - y) <= tol for x, y in zip(a, b))

fails = 0
def check(name, cond):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name)
    fails += 0 if cond else 1

# 1. Creator-made page: fast path, image embedded untouched
check('creator page is a simple image page', simple(creator_svg(800, 1000)))
p, d = run(creator_svg(800, 1000), png(800, 1000, (255, 0, 0)))
check('creator page: red, page ratio kept', near(px(p, .5, .5), (255, 0, 0)) and abs(p.rect.height / p.rect.width - 1.25) < .01)

# 2. Small picture on a black page must NOT take the fast path (this was the bug)
svg = ('<svg width="800" height="1000"><rect x="0" y="0" width="800" height="1000" fill="#000000"/>'
       '<g><image x="300" y="400" width="200" height="200" xlink:href="images/a.png"/></g></svg>')
check('small picture + black background is not "simple"', not simple(svg))
p, d = run(svg, png(200, 200, (255, 0, 0)))
check('small picture: page is 800x1000 shaped', abs(p.rect.height / p.rect.width - 1.25) < .01)
check('small picture: black corner, red centre', near(px(p, .02, .02), (0, 0, 0)) and near(px(p, .5, .5), (255, 0, 0)))

# 3. Other things that must use the normal renderer
check('rect without fill (black by default)', not simple('<svg width="100" height="100"><rect x="0" y="0" width="100" height="100"/><image x="0" y="0" width="100" height="100" xlink:href="a.png"/></svg>'))
check('white background rect is fine', simple('<svg width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="#ffffff"/><image x="0" y="0" width="100" height="100" xlink:href="a.png"/></svg>'))
check('moved image', not simple('<svg width="100" height="100"><image x="10" y="0" width="100" height="100" xlink:href="a.png"/></svg>'))
check('smaller image', not simple('<svg width="100" height="100"><image x="0" y="0" width="60" height="100" xlink:href="a.png"/></svg>'))
check('scaled group', not simple('<svg width="100" height="100"><g transform="scale(0.5)"><image x="0" y="0" width="100" height="100" xlink:href="a.png"/></g></svg>'))
check('rotated image', not simple('<svg width="100" height="100"><image x="0" y="0" width="100" height="100" transform="rotate(5,50,50)" xlink:href="a.png"/></svg>'))
check('semi-transparent image', not simple('<svg width="100" height="100"><image x="0" y="0" width="100" height="100" opacity="0.5" xlink:href="a.png"/></svg>'))
check('page without size', not simple('<svg viewBox="0 0 100 100"><image x="0" y="0" width="100" height="100" xlink:href="a.png"/></svg>'))
check('drawing on top', not simple(creator_svg(100, 100).replace('</g>', '<path d="M0 0L5 5"/></g>')))

# 4. Output width: default downsizes a big picture, 0 (original) keeps it
big = png(3000, 3750, (10, 200, 10)); svg = creator_svg(1600, 2000)
p, d = run(svg, big)
check('default width: 3000px picture -> 1600px', d.get_page_images(0)[0][2] == 1600)
p, d = run(svg, big, output_width_px=0)
check('original size: 3000px picture embedded untouched', d.get_page_images(0)[0][2] == 3000)
# complex page (ink on a big picture) rendered at the picture's width in 'original' mode
ink = creator_svg(1600, 2000).replace('</g>', '<path d="M10 10 L200 200" stroke="#f00" stroke-width="4" fill="none"/></g>')
p, d = run(ink, big, output_width_px=0)
check('original size, page with ink: rendered at ~3000px', 2900 <= d.get_page_images(0)[0][2] <= 3508)
p, d = run(ink, big)
check('default width, page with ink: 1600px', d.get_page_images(0)[0][2] == 1600)

# 5. Image cache stays bounded
z = zipfile.ZipFile(io.BytesIO(notebook(creator_svg(10, 10), png(10, 10, (1, 2, 3)))))
cache = {}; names = {n.lower(): n for n in z.namelist()}
ns['_PDF_CACHE_LIMIT'] = 100
for i in range(3):
    ns['_pdf_inline_images'](creator_svg(10, 10), z, names, cache)
check('cache is bounded', len([k for k in cache if k != '\0size']) <= 1)

print('\nFAILED' if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
