// Checks for js/extcore.js: several installed copies of the extension, and downloads that must never be stale.
import assert from 'node:assert/strict';
import {older, summarizeBridges, staleDownload, freshUrl, FRESH} from '../js/extcore.js';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let failed = 0;
const check = (name, fn) => { try { fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } };

check('older compares dotted versions numerically', () => {
  assert.equal(older('1.2.9', '1.3.0'), true);
  assert.equal(older('1.3.1', '1.3.0'), false);
  assert.equal(older('1.3', '1.3.0'), false);
  assert.equal(older('1.10.0', '1.9.9'), false);
});
check('nobody answering means the extension is missing', () => {
  assert.equal(summarizeBridges([]), null);
  assert.equal(summarizeBridges(null), null);
  assert.equal(summarizeBridges([{}, {version: ''}]), null);
});
check('one copy: its version, not a duplicate', () => {
  const s = summarizeBridges([{version: '1.3.1', id: 'a'}]);
  assert.equal(s.version, '1.3.1');
  assert.equal(s.duplicate, false);
  assert.equal(s.count, 1);
});
check('an old copy answering first must not hide the new one, and the page must say there are two', () => {
  const s = summarizeBridges([{version: '1.2.9'}, {version: '1.3.1', id: 'b'}]);
  assert.equal(s.version, '1.3.1');
  assert.deepEqual(s.versions, ['1.3.1', '1.2.9']);
  assert.equal(s.duplicate, true);
  assert.equal(s.count, 2);
});
check('two copies of the same version are still a duplicate', () => {
  assert.equal(summarizeBridges([{version: '1.3.1', id: 'a'}, {version: '1.3.1', id: 'b'}]).duplicate, true);
});
check('a download of an old extension is refused with a readable reason', () => {
  assert.match(staleDownload('1.2.9', '1.3.1'), /v1\.2\.9.*v1\.3\.1/);
  assert.match(staleDownload('1.2.9', '1.3.1'), /Reload this page and try again/);
  assert.doesNotMatch(staleDownload('1.2.9', '1.3.1'), /restart the local server/);
  assert.equal(staleDownload('1.3.1', '1.3.1'), '');
  assert.equal(staleDownload('1.4.0', '1.3.1'), '');
});
check('downloads bypass every cache: unique address and cache:reload', () => {
  const a = freshUrl('extension/manifest.json', 'http://localhost:8000/index.html', 1);
  const b = freshUrl('extension/manifest.json', 'http://localhost:8000/index.html', 2);
  assert.equal(a.pathname, '/extension/manifest.json');
  assert.notEqual(a.href, b.href);
  assert.equal(FRESH.cache, 'reload');
});
check('both pages ask every copy (pingAll) and block work while two copies exist', () => {
  for (const f of ['js/learncraft.js', 'js/golive.js']) {
    const src = read(f);
    assert.match(src, /pingAll\(/);
    assert.match(src, /summarizeBridges\(/);
    assert.match(src, /staleDownload\(/);
    assert.match(src, /freshUrl\('extension\/manifest\.json'/);
    assert.doesNotMatch(src, /ask\('ping'/);
    assert.match(src, /learncraft\.duplicateBlocked/);
  }
});
check('the extension answers ping with its id and an orphaned copy stays silent', () => {
  const bridge = read('extension/bridge.js');
  assert.match(bridge, /version: VERSION, id: chrome\.runtime\.id/);
  assert.match(bridge, /if \(!alive\) return;/);
});
console.log(failed ? `${failed} extcore check(s) failed` : 'Extension helper checks passed');
process.exit(failed ? 1 : 0);
