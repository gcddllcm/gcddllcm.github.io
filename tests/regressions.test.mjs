// Tests for the page locker, BMP headers, i18n keys and small helpers (no browser needed). Run: node tests/regressions.test.mjs
import {setLock, LOCK_VALUE} from '../js/lockcore.js';
import {readImageInfo, bmpEncode} from '../js/imgcore.js';
import {countBucket} from '../js/util.js';
import {fixName, fixNames} from '../js/zipnames.js';
import {ensureWriteAccess} from '../js/nbtool.js';
import en from '../js/locales/en.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } }
const L = ` locked="${LOCK_VALUE}"`;

await check('lock: self-closing <image/> gets the attribute before the slash', () => {
  assert.equal(setLock('<svg><image x="0" href="a.png"/></svg>', true), `<svg><image x="0" href="a.png"${L}/></svg>`);
  assert.equal(setLock('<svg><image x="0" href="a.png" /></svg>', true), `<svg><image x="0" href="a.png"${L}/></svg>`);
});
await check('lock: <image></image> pairs stay well-formed (the closing tag is not touched)', () => {
  assert.equal(setLock('<svg><image x="0" href="a.png"></image></svg>', true), `<svg><image x="0" href="a.png"${L}></image></svg>`);
  assert.equal(setLock('<svg><image href="a.png"><title>t</title></image></svg>', true), `<svg><image href="a.png"${L}><title>t</title></image></svg>`);
});
await check('lock: an already locked image is left alone, data-locked does not count as locked', () => {
  const done = `<image href="a.png"${L}/>`;
  assert.equal(setLock(done, true), done);
  assert.equal(setLock('<image data-locked="1" href="a.png"/>', true), `<image data-locked="1" href="a.png"${L}/>`);
});
await check('lock: a ">" inside a quoted attribute does not cut the tag short', () => {
  assert.equal(setLock('<image title="a>b" href="a.png"/>', true), `<image title="a>b" href="a.png"${L}/>`);
});
await check('lock: embedded data: images and images without href are skipped', () => {
  const s = '<image href="data:image/png;base64,AAAA"/><image x="1"/>';
  assert.equal(setLock(s, true), s);
});
await check('unlock: removes the attribute only, and lock then unlock gives back the original', () => {
  const orig = '<svg><image x="0" href="a.png"/><image href="b.png"></image><rect/></svg>';
  assert.equal(setLock(setLock(orig, true), false), orig);
  assert.equal(setLock(`<image href="a.png"${L} y="2"/>`, false), '<image href="a.png" y="2"/>');
});
await check('lock: other tags starting with "image" are not touched', () => {
  const s = '<imageFilter href="a.png"/>';
  assert.equal(setLock(s, true), s);
});

await check('BMP: an old OS/2 (12 byte) header is not read as if it had DPI fields', () => {
  const u = new Uint8Array(64); u[0] = 0x42; u[1] = 0x4D; new DataView(u.buffer).setUint32(14, 12, true);
  const info = readImageInfo(u, '.bmp');
  assert.equal(info.width, 0); assert.equal(info.dpi, undefined);
});
await check('BMP: a normal 40 byte header still reads size and DPI', async () => {
  const blob = bmpEncode({width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4)}, 150);
  const info = readImageInfo(new Uint8Array(await blob.arrayBuffer()), '.bmp');
  assert.equal(info.width, 3); assert.equal(info.height, 2); assert.equal(info.dpi, 150);
});

await check('zip names: Thai names read as Latin-1 are repaired, real Latin-1 / Unicode / ASCII names are left alone', () => {
  const thai = 'images/ข้อสอบประยุกต์_01.jpg';
  const mojibake = Buffer.from(thai, 'utf8').toString('latin1');
  assert.notEqual(mojibake, thai);
  assert.equal(fixName(mojibake), thai);
  assert.equal(fixName(thai), thai);                          // already decoded correctly (UTF-8 flag was set)
  assert.equal(fixName('images/page_01.jpg'), 'images/page_01.jpg');
  assert.equal(fixName('images/caf\u00e9.jpg'), 'images/caf\u00e9.jpg');   // a lone Latin-1 byte is not valid UTF-8
  const files = fixNames({[mojibake]: 1, 'page1.svg': 2});
  assert.deepEqual(Object.keys(files), [thai, 'page1.svg']);
});

await check('write access: one prompt per folder; per-file prompts only when asked for (Page locker), never for Convert to pdf', async () => {
  const handle = () => ({asked: 0, queryPermission: async () => 'prompt', requestPermission: async function () { this.asked++; return 'granted'; }});
  const dir = handle(), files = [handle(), handle(), handle()];
  const inDir = [{dir, handle: handle()}, {dir, handle: handle()}];
  await ensureWriteAccess(inDir);
  assert.equal(dir.asked, 1);                                  // 2 files from the same folder: one prompt
  assert.deepEqual(inDir.map(e => e.handle.asked), [0, 0]);    // their handles are covered by the folder
  await ensureWriteAccess(files.map(h => ({dir: null, handle: h})));
  assert.deepEqual(files.map(h => h.asked), [1, 1, 1]);        // default (Page locker): unchanged behaviour
  const more = [handle(), handle(), handle()];
  await ensureWriteAccess(more.map(h => ({dir: null, handle: h})), {files: false});
  assert.deepEqual(more.map(h => h.asked), [0, 0, 0]);         // Convert to pdf: no per-file prompts
  const d2 = handle();
  await ensureWriteAccess([{dir: d2, handle: handle()}, {dir: d2, handle: handle()}], {files: false});
  assert.equal(d2.asked, 1);                                   // folders are still asked, once
});
await check('convert to pdf: only the JPEG quality option (70-100 %) is offered, pages stay at original size', () => {
  const src = fs.readFileSync(new URL('../js/topdf.js', import.meta.url), 'utf8');
  assert.ok(!/pdf-resolution|data-q=.?resolution|pdf\.res[A-Z]|pdf\.resolution/.test(src), 'sharpness selector is still there');
  assert.deepEqual([...src.matchAll(/<option value="(\d+)"/g)].map(m => +m[1]), [70, 80, 90, 95, 100]);
  assert.match(src, /const PDF_RESOLUTION=0;/);
  assert.match(src, /const resolution=PDF_RESOLUTION;/);
  for (const k of ['pdf.resolution', 'pdf.resFast', 'pdf.resStandard', 'pdf.resHigh', 'pdf.resOriginal']) assert.ok(!(k in en), k + ' should be removed');
});

await check('i18n: every key used as t(\'...\') in js/ exists in en.js', () => {
  const used = new Set();
  for (const f of fs.readdirSync(new URL('../js/', import.meta.url))) {
    if (!f.endsWith('.js')) continue;
    const s = fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
    for (const m of s.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter(k => !(k in en));
  assert.deepEqual(missing, [], 'missing keys: ' + missing.join(', '));
});

await check('About Us: the file count in the text is dynamic and the line/file constants keep the shape the build script edits', () => {
  assert.equal(typeof en['about.linesNote'], 'function');
  assert.ok(en['about.linesNote'](42).includes('42 text files'), 'the number must come from the argument');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  // tools/update_project_line_count.py rewrites exactly this pair; if it is reformatted the Pages build stops
  assert.equal(app.match(/const PROJECT_LINE_COUNT=\d+,PROJECT_FILE_COUNT=\d+;/g)?.length, 1);
  assert.ok(app.includes("t('about.linesNote',PROJECT_FILE_COUNT"), 'app.js must pass the file count to the text');
});

await check('creator: pasting only adds images while the Tools page is the one on screen', () => {
  const src = fs.readFileSync(new URL('../js/creator.js', import.meta.url), 'utf8');
  const line = src.split('\n').find(l => l.includes("addEventListener('paste'"));
  assert.ok(line && line.includes("root.closest('.page')?.classList.contains('on')"), 'paste handler must check that the page is visible');
});

await check('i18n: no old carousel / library strings or the stale PDF-engine sentence are left', () => {
  for (const k of Object.keys(en)) assert.ok(!/^(carousel|start|home)\./.test(k), k + ' is unused and should stay removed');
  assert.ok(!en['guide.topdf.details'].includes('PDF engine'), 'the converter is built in now: nothing is cached');
});

await check('analytics: file counts are grouped into buckets', () => {
  assert.deepEqual([1, 2, 5, 6, 10, 11, 20, 21, 50, 51, 300].map(countBucket), ['1', '2-5', '2-5', '6-10', '6-10', '11-20', '11-20', '21-50', '21-50', '51+', '51+']);
});

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
