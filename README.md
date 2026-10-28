# Penguin Logistics

## Releasing

    python tools/release.py X.Y.Z

Sets the version everywhere, then warns if the newest entry in `RELEASES` (js/locales/en.js) does not match.

## Publishing

The GitHub Pages workflow runs these steps before every deployment (a failing test stops the deploy):

1. `sh tests/run-all.sh` runs all checks.
2. `tools/update_project_line_count.py` counts lines and files in all UTF-8 text files (excluding `.git` and generated dependency/build folders) and updates the About Us statistic (both the line count and the file count).
3. `tools/cache_bust.py <commit SHA>` replaces every `?v=...` reference (index.html, js/, js/locales/) with the commit SHA, so a browser never mixes new and old cached files after a deploy.

Set the repository's Pages source to **GitHub Actions** for the workflow to publish the site.
`python tools/release.py X.Y.Z` still sets the readable version for local use; the SHA stamp is applied only to the deployed copy.

## Tests

    sh tests/run-all.sh

Checks the syntax of every script, the image helpers (`js/imgcore.js`) and the Notebook to PDF worker (`js/pdfworker.js`).
Everything runs on Node only; no extra packages are needed.
