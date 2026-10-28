#!/usr/bin/env python3
"""Stamp every local file reference with one build token (used by the Pages workflow).

    python tools/cache_bust.py <token>

Rewrites the ?v=<anything> part of every local reference (index.html, style.css link,
js/*.js imports, worker URLs, js/locales/*.js) to ?v=<token>. The workflow passes the
commit SHA, so every deploy gets brand-new URLs for ALL files and a browser can never
combine a new app.js with an old, cached module. js/vendor/ is left alone.
"""
import pathlib
import re
import sys

REF = re.compile(r"\?v=[0-9A-Za-z._-]+")
APP_REF = re.compile(r"js/app\.js\?v=")


def stamp(root: pathlib.Path, token: str) -> int:
    targets = [root / "index.html", *sorted((root / "js").glob("*.js")), *sorted((root / "js" / "locales").glob("*.js"))]
    total = 0
    for path in targets:
        source = path.read_bytes().decode("utf-8")
        updated, count = REF.subn("?v=" + token, source)
        if count and updated != source:
            path.write_bytes(updated.encode("utf-8"))   # bytes in, bytes out: line endings stay as they are
        total += count
    return total


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[0-9A-Za-z._-]+", sys.argv[1]):
        sys.exit("usage: python tools/cache_bust.py <token>   (letters, digits, . _ - only)")
    root = pathlib.Path(__file__).resolve().parent.parent
    index = (root / "index.html").read_text(encoding="utf-8")
    if len(APP_REF.findall(index)) != 1:
        sys.exit("Expected one js/app.js script reference in index.html")
    total = stamp(root, sys.argv[1])
    left = [p for p in [root / "index.html", *(root / "js").glob("*.js"), *(root / "js" / "locales").glob("*.js")]
            if any(m != "?v=" + sys.argv[1] for m in REF.findall(p.read_text(encoding="utf-8")))]
    if left:
        sys.exit("Some references were not stamped: " + ", ".join(str(p.relative_to(root)) for p in left))
    print(f"Stamped {total} references with ?v={sys.argv[1]}")


if __name__ == "__main__":
    main()
