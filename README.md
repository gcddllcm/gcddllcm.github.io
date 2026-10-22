# Penguin Logistics

## Releasing

    python tools/release.py X.Y.Z

Sets the version everywhere, then warns if the newest entry in `RELEASES` (js/locales/en.js) does not match, or if the PDF engine files in `js/vendor/pyodide` changed (then bump `ENGINE_CACHE` in js/pdfworker.js).

## Tests

    sh tests/run-all.sh

Checks the syntax of every script, the image helpers (`js/imgcore.js`) and the Notebook to PDF code (`js/pdfpy.js`).
The PDF test needs `pip install pymupdf pillow`; everything else needs only Node.
