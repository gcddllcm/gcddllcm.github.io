#!/usr/bin/env python3
"""Set the release version everywhere in one go.

    python tools/release.py 3.1.4

Updates APP_VERSION (config.js) and the ?v=<version> cache-busting
token on every local file reference (index.html, js/*.js, js/locales/*.js, workers).
Run it once before every release so browsers never mix old and new files.
The vendored library (js/vendor/fflate.js) is imported with ?v= too, so a new build never mixes with a cached copy; its own file is not edited.
"""
import json, pathlib, re, sys

if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    sys.exit("usage: python tools/release.py MAJOR.MINOR.PATCH   (e.g. 3.1.4)")
ver = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent

def read(p):  return p.read_bytes().decode("utf-8")
def write(p, s): p.write_bytes(s.encode("utf-8"))

cfg = root / "config.js"
s = read(cfg)
s, n = re.subn(r'(APP_VERSION\s*=\s*")[^"]*(")', r"\g<1>%s\g<2>" % ver, s)
assert n == 1, "APP_VERSION not found in config.js"
write(cfg, s)

targets = [root / "index.html", *sorted((root / "js").glob("*.js")), *sorted((root / "js" / "locales").glob("*.js"))]
total = 0
for p in targets:
    s = read(p)
    s2, n = re.subn(r"\?v=[0-9A-Za-z._-]+", "?v=" + ver, s)
    if n and s2 != s:
        write(p, s2)
    total += n
print(f"Version {ver}: config.js and {total} ?v= references updated.")

# ---- sanity checks (warnings only) ----
en = read(root / "js" / "locales" / "en.js")
top = re.search(r"RELEASES:\s*\[\s*\{\s*version:'v([^']+)'", en)
if not top or top.group(1) != ver:
    print(f"WARNING: the newest entry in RELEASES (js/locales/en.js) is v{top.group(1) if top else '?'}, not v{ver}. Add the release notes.")
