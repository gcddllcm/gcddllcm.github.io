# Penguin Logistics

## Releasing

    python tools/release.py X.Y.Z

Sets the version everywhere, then warns if the newest entry in `RELEASES` (js/locales/en.js) does not match.

## Tests

    sh tests/run-all.sh

Checks the syntax of every script, the image helpers (`js/imgcore.js`) and the Notebook to PDF worker (`js/pdfworker.js`).
Everything runs on Node only; no extra packages are needed.
