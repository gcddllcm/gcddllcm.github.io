import "./theme-shim.mjs";
// The interactive penguin (js/mascot.js) is cosmetic: it only reads the page. Checks that it stays wired up and polite.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let failed = 0;
const check = (name, fn) => { try { fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n' + e.message); } };
const mascot = read('js/mascot.js'), css = read('style.css'), en = read('js/locales/en.js');
check('LearnCraft tools do not mount the interactive penguin', () => {
  assert.doesNotMatch(read('js/golive.js'), /\binitMascot\s*\(/);
  assert.doesNotMatch(read('js/learncraft.js'), /\binitMascot\s*\(/);
});
check('the penguin never talks to the extension or clicks anything on a page', () => {
  assert.doesNotMatch(mascot, /postMessage|chrome\.|\.submit\(|querySelector\([^)]*\)\.click\(/);
});
check('every mascot line exists in the English strings', () => {
  for (const m of mascot.matchAll(/t\(['"](mascot\.\w+)['"]/g)) assert.ok(en.includes("'" + m[1] + "'"), m[1]);
  assert.ok(en.includes("'mascot.idleExtract'") && en.includes("'mascot.idleGolive'") && en.includes("'mascot.tap'"));
});
check('reduced motion switches the penguin animations off', () => {
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.lc-mascot-body,[^}]*animation:none/);
  assert.match(mascot, /prefers-reduced-motion: reduce/);
});
check('speech bubble stays beside the penguin without covering its head', () => {
  assert.match(css, /\.lc-bubble\{position:absolute;z-index:2;right:144px;top:8px;max-width:min\(280px,calc\(100% - 152px\)\);[^}]*white-space:pre-line;overflow-wrap:anywhere/);
  assert.match(css, /\.lc-bubble::after\{[^}]*right:-5px;top:10px/);
});
check('Go Live idle quote uses two lines in its speech bubble', () => {
  assert.match(en, /'mascot\.idleGolive':\['Standing by\.\\nPick a course and I will take it to Ready\./);
  assert.match(css, /\.lc-bubble\{[^}]*white-space:pre-line/);
});
check('penguin firing flash and tracer use red light', () => {
  assert.match(css, /\.lc-muzzle\{[^}]*radial-gradient\(circle,#fff 0 22%,#ff5268 42%,#e6002e 62%,transparent 72%\)/);
  assert.match(css, /\.lc-tracer\{[^}]*linear-gradient\(270deg,#fff,#ff5268 25%,#e6002e00\);filter:drop-shadow\(0 0 3px #ff203a\)/);
});
check('Go Live does not draw targets or auto-fire when variants become Ready', () => {
  assert.doesNotMatch(mascot, /drawRange|lc-target|lc-range|mascot\.progress|shoot\([^)]/);
  assert.doesNotMatch(css, /\.lc-range|\.lc-target|lc-hit|lc-pulse/);
  assert.match(mascot, /wrap\.addEventListener\('click',[\s\S]*?shoot\(\)/);
});
process.exit(failed ? 1 : 0);
