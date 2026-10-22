#!/bin/sh
# Run from anywhere: sh tests/run-all.sh
cd "$(dirname "$0")/.." || exit 1
status=0
for f in js/*.js js/locales/*.js config.js; do node --check "$f" || status=1; done
echo "syntax: checked all scripts"
node tests/imgcore.test.mjs || status=1
python3 tests/test_pdf.py || status=1
exit $status
