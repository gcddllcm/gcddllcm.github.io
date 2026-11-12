import "./theme-shim.mjs";
// Tests for the page locker, BMP headers, i18n keys and small helpers (no browser needed). Run: node tests/regressions.test.mjs
import {setLock, LOCK_VALUE} from '../js/lockcore.js';
import {readImageInfo, bmpEncode} from '../js/imgcore.js';
import {countBucket} from '../js/util.js';
import {fixName, fixNames} from '../js/zipnames.js';
import {ensureWriteAccess} from '../js/nbtool.js';
import {isMobileOrTabletDevice} from '../js/device-support.js';
import {ASSETS,extensionAssetUrl} from '../js/assets.js';
import en from '../js/locales/en.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } }
const L = ` locked="${LOCK_VALUE}"`;

await check('device support: phones and tablets are blocked while computers and laptops are allowed', () => {
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}), true);
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36'}), true);
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) Chrome/130 Safari/537.36'}), true);
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5}), true);
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36',platform:'Win32',maxTouchPoints:10}), false);
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:0}), false);
  assert.equal(isMobileOrTabletDevice({userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36',userAgentData:{mobile:true}}), true);
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /new Set\(\['learncraft','golive','timestamp-maker'\]\)/);
  assert.match(app, /isMobileOrTablet&&desktopOnlyTools\.has\(key\)/);
  assert.match(app, /ASSETS\.deviceNoticeMascot/);
  assert.ok(fs.existsSync(new URL(ASSETS.deviceNoticeMascot)));
  assert.equal(en['device.desktopOnlyTitle'], 'This tool needs a computer');
  assert.equal(en['device.desktopOnlyBack'], 'Back to all tools');
});

await check('landing: category order, concise titles, new badges and card arrows stay consistent', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /\.landing-tool-new-card\{animation:landing-card-in \.38s cubic-bezier\(\.2,\.75,\.25,1\) var\(--landing-delay,40ms\) both\}/);
  assert.match(css, /animation:landing-intro-in \.6s cubic-bezier\(\.2,\.75,\.25,1\) both/);
  assert.match(app, /card\.style\.setProperty\('--landing-delay',`\$\{40\+cardIndex\*40\}ms`\)/);
  assert.match(app, /const NEW_TOOL_KEYS=new Set\(\['pdf-qr-detector'\]\)/);
  assert.doesNotMatch(app, /landingPhiloLinks|landing-philo-links|landing-pdf-brand-trigger/);
  assert.doesNotMatch(css, /landing-philo-links|landing-pdf-brand-trigger/);
  assert.match(css, /\.landing-tool-copy \.landing-tool-category \.release-brand-gradient\{font-size:inherit;letter-spacing:inherit;line-height:inherit\}/);
  assert.equal(en['tool.pdfQrDetector.desc'], 'Find all QR codes in PDF file.');
  assert.match(app, /library\.categoryNotebook[\s\S]*library\.categoryLearnCraft[\s\S]*library\.categoryImages[\s\S]*library\.categoryPdf[\s\S]*library\.categoryArchive/);
  assert.match(app, /tools:TOOLS\.filter\(item=>item\[3\]===t\('library\.categoryNotebook'\)\)/);
  assert.doesNotMatch(app, /landing-archive|archiveDetails|expandArchiveAtBottom/);
  assert.match(app, /\{label:t\('library\.categoryArchive'\),tools:TOOLS\.filter\(item=>item\[3\]===t\('library\.categoryArchive'\)\),collapsed:true\}/);
  assert.match(app, /card\.onclick=\(\)=>\{hasChosenTool=true;selectTool\(key\);showPage\('tools'\)\}/);
  assert.match(css, /\.landing-tool-action\{[^}]*width:20px;height:20px;display:grid;place-items:center/);
  assert.match(css, /\.landing-tool-new\{position:absolute;top:7px;right:6px/);
  assert.match(css, /\.landing-tool-shortcut\{position:absolute;top:7px;right:6px/);
  assert.match(app, /isNewTool\?`<span class=\"landing-tool-new\"/);
  assert.match(css, /grid-template-columns:44px minmax\(0,1fr\) 20px/);
  assert.match(index, /style\.css\?v=\d+\.\d+\.\d+/);
  assert.match(index, /app\.js\?v=\d+\.\d+\.\d+/);
  assert.match(app, /i18n\.js\?v=\d+\.\d+\.\d+/);
  const i18n = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  assert.match(i18n, /locales\/en\.js\?v=\d+\.\d+\.\d+/);
  assert.match(app, /if\(key==='learncraft'&&!isMobileOrTablet\)learncraft\.activate\(\)[\s\S]*if\(key==='golive'&&!isMobileOrTablet\)golive\.activate\(\)[\s\S]*if\(key==='timestamp-maker'&&!isMobileOrTablet\)timestampMaker\.activate\(\)/);
  assert.match(app, /\$\{isNewTool\?\`<span class="landing-tool-new" aria-hidden="true">\$\{t\('landing\.new'\)\}<\/span>\`:''\}/);
});
await check('PDF to JPG mode tabs and workspaces transition accessibly', () => {
  const source = fs.readFileSync(new URL('../js/pdf-to-jpg.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(source, /class="pdf-jpg-modes" data-q="mode-tabs" data-active-mode="pages" role="tablist"/);
  assert.match(source, /<div class="pdf-jpg-mode-stage">[\s\S]*?data-q="pages-mode" role="tabpanel"[\s\S]*?data-q="images-mode" role="tabpanel"/);
  assert.match(source, /outgoing\.inert=true;outgoing\.setAttribute\('aria-hidden','true'\)/);
  assert.match(source, /incoming\.inert=false;incoming\.setAttribute\('aria-hidden','false'\)/);
  assert.match(source, /outgoing\.hidden=true;outgoing\.inert=true;outgoing\.setAttribute\('aria-hidden','true'\)/);
  assert.match(source, /incoming\.hidden=false;incoming\.inert=false;incoming\.setAttribute\('aria-hidden','false'\)/);
  assert.doesNotMatch(source, /modeTransitionTimer|is-entering|is-leaving/);
  assert.match(css, /\.pdf-jpg-modes\[data-active-mode="images"\]::after\{transform:translateX\(100%\)\}/);
  assert.match(css, /\.pdf-jpg-modes::after\{[^}]*transition:transform \.4s cubic-bezier\(\.22,1,\.36,1\)/);
  assert.doesNotMatch(source, /is-moving-to-(?:pages|images)|mode-tabs'\)\.addEventListener\('animationend'/);
  assert.doesNotMatch(css, /pdf-jpg-indicator-to-(?:pages|images)|\.pdf-jpg-modes\.is-moving-to-/);
  assert.match(css, /\.pdf-jpg-mode-stage\{flex:1 0 320px;min-height:0;/);
  assert.match(css, /\.pdf-jpg-mode-stage>\.pdf-jpg-mode-content,\.pdf-jpg-mode-stage>\.pdf-image-mode\{grid-area:1\/1\/2\/2/);
  assert.doesNotMatch(css, /pdf-jpg-mode-enter|pdf-jpg-mode-leave|\.pdf-jpg-mode-stage>\.is-(?:entering|leaving)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.pdf-jpg-modes::after,\.pdf-jpg-mode\{transition:none!important\}\}/);
});
await check('PDF QR detection reports successful results with positive feedback', () => {
  const source = fs.readFileSync(new URL('../js/pdf-qr-detector.js', import.meta.url), 'utf8');
  const util = fs.readFileSync(new URL('../js/util.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(source, /<div class="pdf-qr-meta"><span class="pdf-qr-timing" data-q="timing" hidden><\/span><span data-q="detail"><\/span><\/div>/);
  assert.match(source, /setStatus\(t\('pdfQr\.found',found\.length\)\);setState\('done'\)/);
  assert.match(source, /msg\(t\('pdfQr\.title'\),t\('pdfQr\.found',found\.length\),'success'\)/);
  assert.match(util, /success:'✓'/);
  assert.match(css, /\.badge\.success\{color:var\(--ok\)\}/);
  assert.equal(en['pdfQr.found'](2), 'Detection complete with 2 QR codes found.');
  assert.equal(en['pdfQr.timingEstimating']('0:03'), 'Elapsed 0:03s · Estimating time left…');
  assert.equal(en['pdfQr.timingEta']('0:03', '0:08'), 'Elapsed 0:03s · About 0:08s left');
  assert.equal(en['pdfQr.timingDone']('0:03'), 'Finished in 0:03s');
  assert.equal(en['pdfQr.timingStopped']('0:03'), 'Stopped after 0:03s');
  assert.match(source, /download\.download=`qr-code-\$\{index\+1\}\.png`/);
  assert.match(source, /card\.append\(download,preview,details\)/);
  assert.equal(en['pdfQr.downloadCode'](1), 'Download QR code 1');
  assert.match(source, /pdf-qr-tool is-pristine/);
  assert.match(source, /tool\.classList\.remove\('is-pristine'\)/);
  assert.match(css, /\.pdf-qr-tool\.is-pristine \.pdf-qr-status-card,\.pdf-qr-tool\.is-pristine \.pdf-qr-panel\{display:none\}/);
  assert.match(css, /\.pdf-qr-tool\.is-pristine \.pdf-qr-drop\{flex:1 1 0;min-height:0\}/);
  assert.match(css, /\.pdf-qr-download\{position:absolute;[^}]*top:8px;right:8px/);
  assert.match(css, /\.pdf-qr-download\{[^}]*opacity:0/);
  assert.match(css, /\.pdf-qr-card:hover \.pdf-qr-download,\.pdf-qr-download:focus-visible\{opacity:1\}/);
  assert.match(css, /@media\(hover:none\)\{\.pdf-qr-download\{opacity:1\}\}/);
});
await check('QR Detector landing icon matches the tool QR scanner icon', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(app, /viewBox="0 0 32 32"[^`]*M4 11V6a2 2 0 0 1 2-2h5M21 4h5a2 2 0 0 1 2 2v5/);
  assert.match(css, /\.landing-tool-icon-qr svg\{width:32px;height:32px\}/);
});
await check('file dropzones share QR Detector hover feedback', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.view\[data-tool="topdf"\] \.drop:not\(\.off\):not\(\.hot\):is\(:hover,:focus-within\)\{border-color:var\(--accent\);box-shadow:0 10px 30px -16px/);
  assert.match(css, /\.cr-left-pane:not\(\.has-images\):not\(\.hot\):is\(:hover,:focus-within\) \.listbox\.empty\{border-color:var\(--accent\);box-shadow:0 10px 30px -16px/);
  assert.match(css, /\.pdf-image-drop:not\(\.jpg-drop-hot\):is\(:hover,:focus-within\)\{border-color:var\(--accent\);box-shadow:0 10px 30px -16px/);
  assert.match(css, /\.view\[data-tool="resizer"\] \.rz-drop:not\(\.is-processing\):not\(\.hot\):is\(:hover,:focus-within\)\{border-color:var\(--accent\);box-shadow:0 10px 30px -16px/);
});
await check('PDF QR result page references open the scanned PDF at that page', () => {
  const source = fs.readFileSync(new URL('../js/pdf-qr-detector.js', import.meta.url), 'utf8');
  assert.match(source, /link\.href=`\$\{pdfUrl\}#page=\$\{page\}`/);
  assert.match(source, /renderResults\(results,detectedCodes,resultMode,sourcePdfUrl\)/);
  assert.match(source, /URL\.revokeObjectURL\(sourcePdfUrl\)/);
  assert.equal(en['pdfQr.openPage'](4), 'Open PDF on page 4 (opens in a new tab)');
});
await check('keyboard: Space does not switch tools while a Timestamp Maker video preview is open', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /if\(document\.querySelector\('dialog\[open\]'\)\)return;[\s\S]*if\(e\.code==='Space'&&!e\.repeat&&\$\('tools-page'\)\.classList\.contains\('on'\)\)/);
});
await check('Timestamp Maker: Page/Pb input text is vertically centered in its field', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.tf-inline-field \.tf-value\{[^}]*margin:0;/);
});
await check('Timestamp Maker: outdated extensions still list tabs in a locked state', () => {
  const app = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.match(app, /if\(older\(info\.version,EXT_MIN\)\)\{showOutdated\(info\.version\);await refresh\(true\);return\}/);
  assert.match(app, /function renderTabs\(rows,updateRequired=false\)/);
  assert.doesNotMatch(app, /timestampMaker\.chooseCourse|tf-course-heading/);
  assert.match(app, /updateRequired\?' update-locked':''/);
  assert.match(app, /updateRequired\?' aria-disabled="true"':''/);
  assert.match(app, /updateRequired\?t\('golive\.needUpdate'\)/);
  assert.match(app, /const isReady=!!tab\.code&&state==='ready',canUse=isReady&&!updateRequired/);
  assert.match(app, /if\(!updateRequired\)clearStatus\(\)/);
});
await check('Timestamp Maker: arrow keys navigate Page/Pb fields without interrupting text editing', () => {
  const app = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.match(app, /event\.key==='ArrowUp'\|\|event\.key==='ArrowDown'/);
  assert.match(app, /input\.selectionStart!==0\|\|input\.selectionEnd!==0/);
  assert.match(app, /input\.selectionStart!==input\.value\.length\|\|input\.selectionEnd!==input\.value\.length/);
  assert.doesNotMatch(app, /suggestionBox\.querySelector\('button'\)\?\.focus\(\)/);
});
await check('Timestamp Maker: A/D keys select visible suggestions', () => {
  const app = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.match(app, /lastEnteredInteger,lastEnteredInteger\+1\]\.filter\(Number\.isSafeInteger\)/);
  assert.match(app, /!\/\^\[ad\]\$\/i\.test\(event\.key\)/);
  assert.match(app, /suggestionBox\.querySelectorAll\('button'\)\['ad'\.indexOf\(event\.key\.toLowerCase\(\)\)\]/);
  assert.match(app, /tf-suggestion-key/);
  assert.match(app, /tf-suggestion-arrows/);
  assert.match(app, /for\(const key of \['↑','←','↓','→'\]\)\{const keycap=document\.createElement\('kbd'\)/);
  assert.match(app, /\['A','D'\]\[index\]/);
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.tf-suggestion-key\{/);
  assert.match(css, /\.tf-suggestion-arrows\{[^}]*display:grid;[^}]*grid-template-columns:repeat\(3,13px\)/);
  assert.match(css, /\.tf-suggestion-arrows kbd:nth-child\(4\)\{grid-row:2;grid-column:3\}/);
});
await check('LearnCraft tools use one short extension check', () => {
  const extractor = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const goLive = fs.readFileSync(new URL('../js/golive.js', import.meta.url), 'utf8');
  const timestampMaker = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.match(extractor, /function pingAll\(wait=200\)/);
  assert.match(extractor, /const answers=await pingAll\(\)/);
  assert.doesNotMatch(extractor, /for\(let i=0;i<3&&!answers\.length;i\+\+\)/);
  assert.match(goLive, /function pingAll\(wait = 200\)/);
  assert.match(goLive, /const answers = await pingAll\(\)/);
  assert.doesNotMatch(goLive, /for \(let i = 0; i < 3 && !answers\.length; i\+\+\)/);
  assert.match(timestampMaker, /setTimeout\(\(\)=>\{waiting\.delete\(id\);resolve\(replies\)\},200\)/);
});
await check('i18n: full page headings and concise card labels stay distinct', () => {
  for (const [key, expected] of [
    ['tool.creator', 'SMART Notebook : File Creator'],
    ['tool.topdf', 'SMART Notebook : Convert to PDF'],
    ['tool.pagelock', 'SMART Notebook : Page Locker'],
    ['tool.resizer', 'Image Resizer'],
    ['tool.learncraft', 'LearnCraft : Master Canvas Extractor'],
    ['tool.golive', 'LearnCraft : Ultimate Go Live'],
    ['tool.timestampMaker', 'LearnCraft : Timestamp Maker'],
  ]) assert.equal(en[key], expected);
  for (const [key, expected] of [
    ['tool.creator.short', 'File Creator'],
    ['tool.topdf.short', 'Convert to PDF'],
    ['tool.pagelock.short', 'Page Locker'],
    ['tool.resizer.short', 'Image Resizer'],
    ['tool.learncraft.short', 'Canvas Extractor'],
    ['tool.golive.short', 'Ultimate Go Live'],
    ['tool.timestampMaker.short', 'Timestamp Maker'],
  ]) assert.equal(en[key], expected);
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /<strong>\$\{shortLabel\}<\/strong>/);
  assert.match(app, /setAttribute\('aria-label',`\$\{shortLabel\}\./);
  assert.match(app, /<kbd>Ctrl\+K<\/kbd>/);
});
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
await check('LearnCraft install instructions: download and drag the ZIP into Chrome extensions', () => {
  const src = fs.readFileSync(new URL('../js/install-help.js', import.meta.url), 'utf8');
  assert.equal(en['learncraft.installStep4Description'], 'Drag and drop the downloaded extension ZIP file into the Chrome extensions page.');
  assert.equal(en['learncraft.installStep2Title'], 'Open Chrome Extensions');
  assert.equal(en['learncraft.installStep5Title'], 'Refresh Penguin Logistics');
  assert.equal(en['learncraft.installForceRefresh'], 'Force Refresh');
  assert.equal(en['learncraft.installVisualLabel'], 'Five steps to install the extension');
  assert.equal(en['learncraft.installSubtitle'], 'Follow these 5 simple steps to connect Penguin Logistics with your LearnCraft tabs.');
  assert.match(src, /class="lc-install-visual" aria-label="\$\{t\(update\?'learncraft\.updateStepsLabel':'learncraft\.installVisualLabel'\)\}"/);
  assert.equal((src.match(/class="lc-install-step"/g) || []).length, 6);
  assert.match(src, /learncraft\.updateDeleteOldVersionTitle/);
  assert.match(src, /learncraft\.updateDeleteOldVersionDescription/);
  assert.doesNotMatch(src, /installProgress|progressbar/);
  assert.match(src, /<path d="m16 16 2 2 4-4"\/>/);
  assert.match(src, /<path d="M21 2v6h-6"\/>/);
  assert.match(src, /<path d="M21 13a9 9 0 1 1-2\.64-6\.36L21 8"\/>/);
  assert.equal(en['learncraft.installProgressCount'], undefined);
  assert.equal(en['learncraft.installProgressLabel'], undefined);
  assert.match(src, /data-q="dl">\$\{t\('learncraft\.installDownloadZip'\)\}/);
  assert.match(src, /data-q="copyChromeExtensions"/);
  assert.match(src, /data-q="forcereset">\$\{t\('learncraft\.installForceRefresh'\)\}/);
  assert.match(src, /learncraft\.installStep4Description/);
  assert.doesNotMatch(src, /lc-install-details|learncraft\.installDetails|learncraft\.install[1-5]/);
  const page = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.match(page, /querySelectorAll\('\[data-q=copyChromeExtensions\]'\)\.forEach/);
  assert.doesNotMatch(page, /data-q="recheck"|data-q=recheck|learncraft\.recheck/);
  assert.match(src, /await navigator\.clipboard\.writeText\(url\)/);
  assert.match(page, /copyInternalPage\('chrome:\/\/extensions'\)/);
  const golive = fs.readFileSync(new URL('../js/golive.js', import.meta.url), 'utf8');
  const timestampMaker = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.match(page, /from '\.\/install-help\.js\?v=\d+\.\d+\.\d+'/);
  assert.match(golive, /from '\.\/install-help\.js\?v=\d+\.\d+\.\d+'/);
  assert.doesNotMatch(golive, /from '\.\/learncraft\.js/);
  assert.match(golive, /\$s\.querySelector\('\[data-q=forcereset\]'\)\.onclick = forceReset/);
  assert.match(timestampMaker, /bindRefresh=\(\)=> \$status\.querySelectorAll\('\[data-q=forcereset\]'\)/);
  assert.match(page, /\$s\.querySelector\('\[data-q=dl\]'\)\.onclick=e=>downloadExtension\(e\.currentTarget\)/);
  assert.match(golive, /\$s\.querySelector\('\[data-q=dl\]'\)\.onclick = e => downloadExtension\(e\.currentTarget\)/);
  assert.match(timestampMaker, /querySelector\('\[data-q=dl\]'\)\.addEventListener\('click',event=>downloadExtension\(event\.currentTarget\)\)/);
});
await check('LearnCraft: Force refresh reloads the page with a one-time cache-busting parameter', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const installHelp = fs.readFileSync(new URL('../js/install-help.js', import.meta.url), 'utf8');
  assert.match(installHelp, /data-q="forcereset">\$\{t\('learncraft\.installForceRefresh'\)\}/);
  assert.match(src, /url\.searchParams\.set\(FORCE_RESET_PARAM,String\(Date\.now\(\)\)\)/);
  assert.match(src, /location\.replace\(url\.href\)/);
  assert.match(src, /cleanUrl\.searchParams\.delete\(FORCE_RESET_PARAM\)/);
});
await check('LearnCraft extension version: the page asks for the version that is shipped, and the zip lists files from the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.deepEqual(manifest.icons, {
    '16': 'assets/images/loy-krathong-2026.png',
    '48': 'assets/images/loy-krathong-2026.png',
    '128': 'assets/images/loy-krathong-2026.png'
  });
  assert.equal(extensionAssetUrl(manifest.icons['16']),ASSETS.brandLogo);
  assert.ok(fs.existsSync(new URL(ASSETS.brandLogo)));
  assert.ok(fs.existsSync(new URL(ASSETS.learncraftMascot)));
  assert.deepEqual(Object.keys(ASSETS.goLiveStatus),['running','complete','attention']);
  for(const imageUrl of Object.values(ASSETS.goLiveStatus))assert.ok(fs.existsSync(new URL(imageUrl)));
  for (const archivedLogo of [
    '../assets/archive/branding/legacy-web-favicon.png',
    '../assets/archive/branding/legacy-extension-favicon.png',
    '../assets/archive/branding/legacy-extension-popup-logo.png'
  ]) assert.ok(fs.existsSync(new URL(archivedLogo, import.meta.url)), `${archivedLogo} must remain available`);
  const min = /const EXT_MIN='([\d.]+)'/.exec(src);
  assert.ok(min, 'EXT_MIN must exist');
  assert.equal(manifest.version, min[1], 'manifest.json and EXT_MIN must name the same version');
  assert.match(src, /function extensionFiles\(manifest\)/);
  assert.doesNotMatch(src, /EXT_FILES/);
  assert.match(src, /files\['manifest\.json'\]=mbytes/);
  assert.match(src, /files\[n\]=new Uint8Array\(await r\.arrayBuffer\(\)\)/);
  assert.match(src, /Object\.values\(manifest\.icons\|\|\{\}\)\.forEach\(add\)/);
  assert.doesNotMatch(src, /penguin-learncraft-extension\//);
});
await check('LearnCraft: notify about a newer extension and explain manual update/reload', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.match(src, /latestExtensionVersion\(\)/);
  assert.match(src, /fetch\(freshUrl\('extension\/manifest\.json',document\.baseURI\),FRESH\)/);
  assert.match(src, /older\(ext\.version,latestVersion\)/);
  assert.match(src, /downloadExtension\(updateButton\)/);
  assert.match(src, /\[data-q=copyChromeExtensions\]/);
  assert.equal(en['learncraft.updateAvailable']('3.3.2'), 'Update available: v3.3.2. Update to continue.');
  assert.equal(en['learncraft.updateDeleteOldVersionTitle'], 'Remove the old version');
  assert.match(en['learncraft.updateDeleteOldVersionDescription'], /Penguin Logistics - LearnCraft bridge/);
  assert.equal(en['learncraft.updateChrome'], 'Copy chrome://extensions');
  const installHelp = fs.readFileSync(new URL('../js/install-help.js', import.meta.url), 'utf8');
  assert.match(installHelp, /export function installStepsHtml\(\{update=false\}=\{\}\)/);
  assert.doesNotMatch(installHelp, /updateStepsHtml|data-q="update"/);
  assert.match(installHelp, /data-q="copyChromeExtensions"/);
  assert.match(installHelp, /data-q="forcereset"/);
  assert.match(src, /installStepsHtml\(\{update:true\}\)/);
  for (const file of ['golive.js', 'timestamp-maker.js']) {
    const app = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
    assert.match(app, /installStepsHtml\(\{update:true\}\)/, `${file} uses the shared update guide`);
    assert.match(app, /\[data-q=dl\]/, `${file} binds the shared download button`);
    assert.match(app, /from '\.\/install-help\.js\?v=\d+\.\d+\.\d+'/, `${file} imports the shared guide`);
  }
  assert.equal(en['learncraft.updateStepsLabel'], 'Six visual steps to update the extension');
  for (const key of ['updateDetails', 'updateDetail1', 'updateDetail2', 'updateDetail3', 'updateDetail4', 'updateDetail5']) {
    assert.equal(en[`learncraft.${key}`], undefined, `obsolete update-detail key ${key} must be removed`);
  }
  assert.equal(en['learncraft.updateForceRefresh'], 'Force refresh');
  assert.doesNotMatch(src, /lc-install-details|updateDetail[1-5]|updateDetails/);
  assert.match(src, /forceRefreshButton\.onclick=forceReset/);
  assert.match(src, /needsExtensionUpdate\?' update-locked':''/);
  assert.match(src, /lc-line\$\{needsExtensionUpdate\?' lc-tabs-count-locked':''\}/);
  assert.match(src, /aria-disabled="true"/);
  assert.match(src, /st\.ok\?'':' off'/);
  assert.match(src, /needsExtensionUpdate\?' aria-disabled="true"':''/);
  assert.match(src, /data-extract="\$\{r\.tabId\}"\$\{st\.ok&&!needsExtensionUpdate\?'':' disabled'\}/);
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.lc-tab\.not-master-page\{pointer-events:none;cursor:not-allowed\}/);
  assert.match(css, /\.lc-tab\.not-master-page \.lc-tab-main,\.lc-tab\.not-master-page \.lc-extract-btn\{opacity:\.48;filter:grayscale\(\.7\)\}/);
  assert.match(css, /\.lc-tab\.not-master-page \.btn\{cursor:not-allowed\}/);
  assert.match(css, /\.lc-tab\.update-locked\{[^}]*pointer-events:none/);
  assert.match(css, /\.lc-tabs-count-locked\{opacity:\.48;filter:grayscale\(\.55\)\}/);
  const readme = fs.readFileSync(new URL('../extension/README.txt', import.meta.url), 'utf8');
  assert.match(readme, /press "Force refresh"/);
  assert.match(readme, /replace the old folder/);
  assert.match(readme, /reload button/);
  assert.match(readme, /Drag and drop the downloaded ZIP onto the extensions page\. Do not extract it\./);
});
await check('LearnCraft result: nodes without assets are highlighted and copy buttons stay beside their values', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(src, /const hasAssets=n=>!!n\.assets\.length\|\|\(n\.children\|\|\[\]\)\.some\(hasAssets\)/);
  assert.match(src, /lc-empty-node/);
  assert.equal(en['learncraft.noAssets'], 'No assets');
  assert.match(src, /head\(n,plural\(n\.children\.length,cl\),empty\)/);
  assert.match(src, /head\(n,n\.assets\.length\?t\('learncraft\.assetCount',n\.assets\.length\):'',!n\.assets\.length\)/);
  assert.match(src, /<span class="lc-title-wrap"><span class="lc-title">\$\{esc\(n\.title\)\}<\/span>\$\{copyButton\('title',n\.title\)\}<\/span>/);
  assert.match(src, /<span class="lc-atitle-wrap"><span class="lc-atitle">\$\{esc\(a\.title\)\}<\/span>\$\{copyButton\('title',a\.title\)\}<\/span>/);
  assert.match(css, /\.lc-title\{flex:0 1 auto/);
  assert.match(css, /\.lc-atitle\{flex:0 1 auto/);
  assert.match(css, /\.lc-empty-node>summary\{border:1px solid/);
  assert.match(css, /\.lc-empty-node>summary \.lc-no-assets\{color:#ffd699/);
  assert.match(css, /\.lc-copy-wrap\{opacity:0/);
  assert.match(css, /\.lc-asset:hover \.lc-copy-wrap/);
  assert.match(css, /\.lc-copy-wrap:focus-within\{opacity:1\}/);
});
await check('LearnCraft result: selected assets show a live total duration', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(src, /sumAssetTimes/);
  assert.match(src, /class="lc-select-slot"><input class="lc-asset-select" type="checkbox" data-asset-index="\$\{index\}" aria-label="\$\{esc\(t\('learncraft\.selectAsset',a\.title\)\)\}"/);
  assert.match(src, /const index=assetSelectionIndices\.get\(a\)/);
  assert.match(src, /class="lc-select-slot"><input class="lc-node-select" type="checkbox" data-node-index="\$\{nodeSelectionIndices\.get\(n\)\}" aria-label="\$\{esc\(t\('learncraft\.selectNodeAssets',n\.title\)\)\}"/);
  assert.match(src, /const registerSelection=n=>/);
  assert.match(src, /for\(const child of n\.children\|\|\[\]\)for\(const index of registerSelection\(child\)\)indices\.push\(index\)/);
  assert.match(src, /checkbox\.indeterminate=count>0&&count<indices\.length/);
  assert.match(src, /event=>event\.stopPropagation\(\)/);
  assert.match(src, /indices\.forEach\(index=>checkbox\.checked\?selectedAssets\.add\(index\):selectedAssets\.delete\(index\)\)/);
  assert.match(src, /class="lc-selection-summary" data-q="selection-summary" hidden/);
  assert.match(src, /sumAssetTimes\(\[\.\.\.selectedAssets\]\.map\(index=>selectableAssets\[index\]\)\)/);
  assert.match(src, /data-q=clear-selection/);
  assert.match(src, /checkbox\.closest\('\.lc-asset'\)\.classList\.toggle\('lc-asset-selected',selected\)/);
  assert.equal(en['learncraft.clearSelection'], 'Clear selection');
  assert.equal(en['learncraft.selectNodeAssets']('Part 1'), 'Select all assets in: Part 1');
  assert.equal(en['learncraft.quickMath'], 'Quick Math');
  assert.match(src, /class="btn lc-quick-math" data-q="quick-math" aria-pressed="false"/);
  assert.doesNotMatch(src, /data-q="quick-math"><svg/);
  assert.match(src, /quickMathButton\.onclick=\(\)=>\{/);
  assert.match(src, /\$r\.classList\.toggle\('lc-quick-math',active\)/);
  assert.match(css, /\.lc-selection-summary\[hidden\]\{display:none\}/);
  assert.match(css, /\.lc-select-slot\{display:inline-flex;align-items:center;justify-content:flex-start;flex:none;width:0;height:18px;margin-right:-10px;overflow:hidden;opacity:0;transition:width \.18s ease,margin-right \.18s ease,opacity \.18s ease\}/);
  assert.match(css, /\.lc-result\.lc-quick-math \.lc-select-slot\{width:16px;margin-right:0;opacity:1\}/);
  assert.match(css, /\.lc-result:not\(\.lc-quick-math\) \.lc-asset-select,\.lc-result:not\(\.lc-quick-math\) \.lc-node-select\{visibility:hidden;pointer-events:none\}/);
  assert.match(css, /\.lc-depth-controls \.lc-quick-math\{margin-left:auto\}/);
  assert.match(css, /\.lc-depth-controls \.lc-quick-math\[aria-pressed="true"\]\{color:#fff;background:var\(--accent\);border-color:var\(--accent\)\}/);
  assert.match(css, /\.lc-asset-selected\{background:#7566ef16/);
});
await check('LearnCraft status chips use the current Ready colors', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(src, /m\.status\.toLowerCase\(\)==='ready'\?' lc-status-ready-green':''/);
  assert.match(src, /m\.status\.toLowerCase\(\)==='ready'\?'Ready':m\.status/);
  assert.match(css, /\.lc-chip\.dim\.lc-status-ready-green\{border-color:#00b89466;background:#00b89420;color:#8fe9d6\}/);
});
await check('Canvas Extractor uses plain Ready to extract text beside its action', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(src, /st\.ok\?`<span class="lc-extract-ready">\$\{t\('learncraft\.extractReady'\)\}<\/span>`/);
  assert.match(css, /\.lc-extract-ready\{color:#8fe9d6;font-size:12px\}/);
  assert.match(css, /\.lc-extract-btn:has\(\[aria-busy="true"\]\)::before\{[^}]*inset:-3px;padding:2px;border-radius:calc\(var\(--radius-control\) \+ 2px\)/);
  assert.equal(en['learncraft.extractReady'], 'Ready to extract');
});
await check('Canvas Extractor course-type chip matches Timestamp Maker', () => {
  const extractor = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const timestampMaker = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.match(extractor, /p\.kindLabel\?`<span class="lc-chip">\$\{esc\(p\.kindLabel\)\}<\/span>`:''/);
  assert.match(timestampMaker, /tab\.probe\?\.kindLabel\?`<span class="lc-chip">\$\{esc\(tab\.probe\.kindLabel\)\}<\/span>`:''/);
  assert.doesNotMatch(extractor, /kindOf\(/);
});
await check('Canvas Extractor result uses the course-type label from the course tab and styles Ready green', () => {
  const extractor = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.match(extractor, /esc\(m\.kindLabel\|\|kindName\(m\.kind\)\)/);
  assert.match(extractor, /m\.status\.toLowerCase\(\)==='ready'\?'Ready':m\.status/);
  assert.match(extractor, /lc-status-ready-green/);
});
await check('LearnCraft hides connected status unless update guidance is needed', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /installation-guide|learncraft\.connected/);
  assert.match(src, /\$s\.innerHTML=panel;\s*\$s\.hidden=!panel/);
  assert.match(src, /function showMissing\(\)\{/);
  assert.match(src, /dup=null,latestVersion=null/);
  assert.match(src, /try\{latestVersion=await latestExtensionVersion\(\);showConnected\(latestVersion\);/);
  assert.match(src, /catch\(error\)\{latestVersion=null;showConnected\(null,error\);/);
  assert.match(src, /const refreshButton=updateRequired\?'':`<button class="btn" data-q="refresh"/);
  assert.match(src, /const masters=rows\.filter\(r=>r\.code&&r\.url&&new URL\(r\.url\)\.pathname\.startsWith\('\/master-canvas\/'\)\)/);
  assert.match(src, /const order=\[\.\.\.masters\]\.sort/);
  assert.match(src, /rows\.length\?t\('golive\.noMaster'\):t\('learncraft\.noTabs'\)/);
  assert.match(src, /const tabsCount=`<div class="lc-line\$\{needsExtensionUpdate\?' lc-tabs-count-locked':''\}"><strong>\$\{t\('learncraft\.tabsFound',rows\.length,courses\.length\)\}<\/strong><span class="lc-grow"><\/span>\$\{refreshButton\}<\/div>`/);
  assert.match(src, /if\(refreshButtonEl\)refreshButtonEl\.onclick=\(\)=>\{refresh\(\);checkUpdates\(\)\}/);
  assert.match(src, /if\(!order\.length\)\{\$t\.innerHTML=`\$\{tabsCount\}<div class="lc-p">/);
  assert.match(src, /checkingUpdate=false;if\(tabRows&&!busy&&!refreshingTabs\)renderTabs\(tabRows\)/);
  assert.match(src, /if\(!ext\|\|busy\|\|refreshingTabs\)return/);
  assert.match(src, /if\(!Array\.isArray\(rows\)\)throw new Error\('The extension returned an invalid tab list\.'\)/);
  assert.match(src, /finally\{refreshingTabs=false\}/);
  const installHelp = fs.readFileSync(new URL('../js/install-help.js', import.meta.url), 'utf8');
  assert.match(installHelp, /class="btn primary lc-install-action" data-q="dl">/);
  assert.match(installHelp, /class="btn lc-install-copy lc-install-action" data-q="forcereset"/);
  assert.match(css, /\.btn\.primary\{background:var\(--accent\);border-color:var\(--accent\);color:#fff\}/);
  assert.match(css, /\.btn\.primary:hover:not\(:disabled\)\{background:var\(--accent-h\)\}/);
  assert.match(css, /\.btn:disabled\{background:var\(--border\);cursor:not-allowed\}/);
  assert.match(css, /\.lc-install-visual\{display:flex;flex-direction:column;gap:10px;width:min\(100%,800px\);margin:0;padding:0;list-style:none\}/);
  assert.match(css, /\.lc-install-step\{[^}]*grid-template-columns:30px 44px minmax\(0,1fr\) auto/);
  assert.match(css, /@container \(max-width:520px\)\{\.lc-install-step-guide\{grid-template-columns:30px 44px minmax\(0,1fr\)/);
  assert.match(css, /\.lc-install-step:not\(:last-child\)::after\{position:absolute/);
  assert.match(css, /\.lc-install-download\{display:grid;place-items:center;flex:none;width:38px;height:38px;padding:0/);
  assert.match(css, /\.lc-install-step \.lc-install-download svg\{width:21px;height:21px;padding:0/);
  assert.match(css, /\.lc-install-details>summary/);
});
await check('Timestamp Maker hides connected status after listing tabs', () => {
  const src = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /connectedStatus|timestampMaker\.connected/);
  assert.match(src, /const clearStatus=\(\)=>\{\$status\.hidden=true;\$status\.textContent=''\}/);
  assert.match(src, /renderTabs\(result,updateRequired\);\s*if\(!updateRequired\)clearStatus\(\)/);
});
await check('LearnCraft result: progress rail and Part navigation are removed', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /lc-progress|lc-part-list|progressFill|progressPercent|partList/);
  assert.match(src, /<div class="lc-tree" data-depth="\$\{depth\}"/);
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /lc-progress|lc-part-list|lc-part-item/);
});
await check('LearnCraft result: completeness and warnings are grouped together before actions', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const core = fs.readFileSync(new URL('../js/lccore.js', import.meta.url), 'utf8');
  const notices = src.indexOf('<div class="lc-notices ${hasNoticeWarning?');
  const actions = src.indexOf('<div class="btnrow lc-actions">');
  assert.ok(notices >= 0 && actions > notices, 'combined status and warnings must appear before action buttons');
  assert.match(src, /notices\.map\(notice=>notice\.html\)\.join\(' · '\)/);
  assert.match(src, /r\.completeness\.unconfirmed\|\|\[\]/);
  assert.match(src, /const gapIndexes=new Set\(gaps\.map\(g=>g\.sourceIndex\)\.filter\(Number\.isInteger\)\)/);
  assert.match(src, /const unconfirmed=r\.completeness\.unconfirmed\|\|\[\]/);
  assert.match(src, /const failed=unconfirmed\.filter\(item=>!gapIndexes\.has\(item\.index\)\)/);
  assert.match(src, /if\(unconfirmed\.length&&!failed\.length\)addNotice\(t\('learncraft\.extractCompleteShort'\)\)/);
  assert.equal(en['learncraft.extractCompleteShort'], 'Extraction complete');
  assert.match(en['learncraft.extractIncomplete'](4, 5, 'Part 1'), /Not confirmed: Part 1/);
  assert.match(src, /const sourceIndex=` data-view-index="\$\{nodeSelectionIndices\.get\(n\)\}"\$\{Number\.isInteger\(n\.sourceIndex\)/);
  assert.match(src, /const jumpLink=\(label,index\)=>Number\.isInteger\(index\)\?`<button type="button" class="lc-notice-jump" data-jump-index="\$\{index\}"/);
  assert.match(src, /button\.onclick=\(\)=>\{/);
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.lc-notices\{min-width:0;max-height:120px;overflow:auto;overflow-wrap:anywhere;line-height:1\.6\}/);
  assert.match(src, /tree\.querySelector\(`\[data-source-index="\$\{Number\(button\.dataset\.jumpIndex\)\}"\]`\)/);
  assert.match(core, /const missingAssets=n\.level===last&&!\(n\.assets&&n\.assets\.length\)/);
  assert.match(src, /const names=gaps\.map\(g=>`\$\{lvName\(g\.level\)\}: \$\{g\.title\}`\)\.join\(', '\)/);
  assert.match(src, /const linked=gaps\.map\(g=>jumpLink\(`\$\{lvName\(g\.level\)\}: \$\{g\.title\}`,g\.sourceIndex\)\)\.join\(' · '\)/);
  assert.doesNotMatch(src, /gaps\.slice\(0,3\)/);
  assert.match(src, /parent\.tagName==='DETAILS'\)parent\.open=true/);
  assert.match(src, /scrollIntoView\(\{behavior:matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\?'auto':'smooth',block:'center'\}\)/);
  assert.doesNotMatch(src, /lc-jump-highlight/);
  assert.doesNotMatch(css, /lc-jump-highlight/);
  assert.match(src, /class="lc-back-top" data-q="back-top" aria-label="\$\{t\('learncraft\.backToTop'\)\}"/);
  assert.match(src, /data-q=back-top\]'\)\.onclick=\(\)=> \$r\.scrollIntoView/);
  assert.match(src, /badge\.title=currentTitle;badge\.setAttribute\('aria-label',`\$\{lvName\(level\)\}: \$\{currentTitle\}`\)/);
  assert.match(src, /title\.textContent=currentTitle;title\.title=currentTitle/);
  assert.equal(en['learncraft.backToTop'], 'Back to top');
  assert.match(css, /\.lc-back-top svg\{width:13px;height:13px\}/);
  assert.match(css, /\.lc-notice-jump\{padding:1px 5px;border:1px solid #ffb84d55/);
  assert.doesNotMatch(css, /\.lc-notice-jump[^}]*text-decoration/);
});
await check('LearnCraft result: CSV download uses the same repeat setting as Copy table', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*tableCsv[^}]*\} from '\.\/lccore\.js/);
  assert.match(src, /data-q="download-csv">\$\{t\('learncraft\.downloadCsv'\)\}/);
  const header = /class="lc-rhead">([\s\S]*?)<\/div>\s*<div class="lc-stats"/.exec(src)?.[1] || '';
  assert.ok(header.indexOf('lc-rinfo') < header.indexOf('data-q="download-csv"'), 'CSV button must follow course details in the header');
  const controls = /class="btnrow lc-depth-controls"[\s\S]*?<\/div>/.exec(src)?.[0] || '';
  assert.ok(controls.indexOf('data-q="quick-math"') < controls.indexOf('data-q="clear"'), 'Quick Math must replace CSV in the level-control row');
  assert.doesNotMatch(/class="btnrow lc-actions"[\s\S]*?<\/div>/.exec(src)?.[0] || '', /data-q="clear"/);
  assert.match(src, /\$r\.querySelector\('\[data-q=clear\]'\)\.onclick=\(\)=>\{current=null;stopGhostTracking\(\);\$r\.replaceChildren\(\);\$r\.hidden=true\}/);
  assert.match(src, /download\(`mastercanvas-\$\{course\}\.csv`,bytes\)/);
  assert.match(src, /new TextEncoder\(\)\.encode\('\\uFEFF'\+tableCsv\(r,\{repeat\}\)\)/);
  const depths = /class="btnrow lc-depth-controls"[\s\S]*?<\/div>/.exec(src)?.[0] || '';
  assert.ok(depths.includes("['part','section',...(egg?['mission']:[]),'subsection','assets']"));
  assert.ok(depths.indexOf('.map(level=>') < depths.indexOf('data-q="quick-math"'), 'Quick Math must follow level filters');
  assert.equal(en['learncraft.downloadCsv'], 'Download as .csv');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.lc-rhead \.lc-download-csv\{flex:none;margin-left:auto\}/);
  assert.match(css, /\.lc-depth-controls \.lc-quick-math\{margin-left:auto\}/);
  assert.match(css, /\.lc-depth-controls \.lc-clear\{margin-left:0\}/);
  assert.match(css, /\.lc-rhead \.lc-download-csv\{align-self:flex-end\}/);
});
await check('LearnCraft: Copy current view exports collapsed nodes as summary rows', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const core = fs.readFileSync(new URL('../js/lccore.js', import.meta.url), 'utf8');
  assert.equal(en['learncraft.copyCurrentView'], 'Copy current view');
  assert.match(src, /data-q="copy-current-view">\$\{t\('learncraft\.copyCurrentView'\)\}/);
  assert.match(src, /tree\.querySelectorAll\('details\.lc-node:not\(\[open\]\)'\)/);
  assert.match(src, /tableTsv\(r,options\)/);
  assert.match(core, /collapsedNodes\.has\(n\)/);
});
await check('LearnCraft: the transparent penguin mascot asset and its styles are kept', () => {
  const src = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.ok(fs.existsSync(new URL(ASSETS.learncraftMascot)));
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.lc-scope-glint\{[^}]*background:transparent;box-shadow:none/);
  assert.match(css, /\.lc-scope-glint::before\{[^}]*background:linear-gradient\(90deg,transparent,rgba\(255,255,255,\.92\),rgba\(255,255,255,\.72\),transparent\)/);
  assert.match(css, /\.lc-laser-beam\{[^}]*#ff203a/);
  assert.match(css, /@keyframes lc-scope-shimmer/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{[^@]*\.lc-scope-glint::before\{animation:none/);
});
await check('LearnCraft extraction: page, bridge and background speak the same protocol (progress, cancel, request ids)', () => {
  const page = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const bridge = fs.readFileSync(new URL('../extension/bridge.js', import.meta.url), 'utf8');
  const background = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  // progress: background -> bridge -> page
  assert.match(background, /ns: 'pl-lc-progress'/);
  assert.match(bridge, /m\.ns === 'pl-lc-progress'/);
  assert.match(bridge, /pl: 'learncraft-progress'/);
  assert.match(page, /m\.pl==='learncraft-progress'/);
  // Phase details stay internal; the page shows only the switch countdown and elapsed reading time.
  for (const phase of ['metadata', 'opening', 'waiting', 'reading']) {
    assert.ok(background.includes(`phase: '${phase}'`), `background must send phase ${phase}`);
  }
  for (const key of ['extractMetadata', 'extractOpening', 'extractWaiting', 'extractStructure', 'extractAssets']) {
    assert.equal(en[`learncraft.${key}`], undefined, `obsolete visible progress key ${key} must be removed`);
  }
  assert.match(page, /learncraft\.switchingTabsIn/);
  assert.match(page, /const started=Date\.now\(\),switchDeadline=started\+3000/);
  assert.match(page, /setInterval\(updateSwitchCountdown,200\)/);
  assert.doesNotMatch(page, /phase==='metadata'|phase==='opening'|phase==='waiting'|phase==='reading'/);
  // request ids and cancelling
  assert.match(bridge, /reqId: m\.id/);
  assert.match(bridge, /m\.action === 'cancel'/);
  assert.match(page, /action:'cancel',target:id/);
  assert.match(page, /ask\('extract',\{tabId\},300000\)/);
  assert.match(background, /withTimeout\(run\(tab\.id, lcExtract, \[reqId\]\), 270000\)/);
  assert.match(background, /new MutationObserver\(records =>/);
  assert.match(background, /settle = \(el, onMutation, quiet = 140, max = 4000\)/);
  assert.match(background, /const cancelPoll = setInterval\(\(\) => \{ if \(cancelled\(\)\) finish\(\); \}, 25\)/);
  assert.match(background, /while \(opened && !cancelled\(\) && Date\.now\(\) - started < 240000\)/);
  assert.match(background, /if \(cancelled\(\)\) break/);
  assert.match(page, /const elapsedTimer=setInterval/);
  assert.match(page, /clearInterval\(elapsedTimer\)/);
  assert.match(page, /setAttribute\('aria-live','off'\)/);
  assert.equal(en['learncraft.readingElapsed']('00:04'), 'Reading the course... 00:04 (can take a few minutes)');
});
await check('keyboard shortcuts stay enabled, focus styling persists until pointer use, and drop zones are named buttons', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const background = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /singleKeyShortcutsEnabled|app-operation-running/);
  assert.doesNotMatch(app, /numberShortcut|TOOLS\[\(activeIndex\+1\)%TOOLS\.length\]/);
  assert.doesNotMatch(app, /tool-nav-shortcut|tool\.shortcutNumber/);
  assert.match(app, /if\(e\.code==='Space'&&!e\.repeat&&\$\('tools-page'\)\.classList\.contains\('on'\)\)/);
  assert.doesNotMatch(css, /tool-nav-shortcut/);
  assert.match(app, /setAttribute\('aria-keyshortcuts','G'\)/);
  assert.match(app, /e\.code!=='KeyG'&&e\.key\?\.toLowerCase\(\)!=='g'/);
  assert.match(app, /isEditingCreatorTitle\(e\.target\)\|\|e\.target instanceof Element&&e\.target\.matches\('input,textarea,\[contenteditable="true"\]'\)/);
  assert.match(app, /if\(guide\.parentElement\.classList\.contains\('guide-open'\)\)guide\.closeGuide\(true\);\s*else\{guide\.openGuide\(\);if\(isPhone\)setPhoneToolPickerOpen\(false\)\}/);
  assert.match(app, /if\(e\.key==='Tab'\)document\.body\.classList\.add\('keyboard-tab-nav'\)/);
  assert.match(css, /body\.keyboard-tab-nav :focus-visible\{outline:2px solid #8e82ff/);
  assert.doesNotMatch(index, /shortcut-toggle/);
  for (const file of ['creator.js', 'nbtool.js']) {
    const source = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
    assert.match(source, /aria-keyshortcuts="Enter Space"/, file);
    assert.match(source, /e\.preventDefault\(\);pick\(\)/, file);
  }
  const resizer = fs.readFileSync(new URL('../js/resizer.js', import.meta.url), 'utf8');
  const resizerCss = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.equal((resizerCss.match(/M24 31V9m-8 8 8-8 8 8M8 29v10h32V29/g) || []).length, 4, 'all CSS drop-zone icons point up (3 dark + 1 light-theme override)');
  assert.doesNotMatch(resizerCss, /M24 7v23m-8-8 8 8 8-8M8 33v9h32v-9/);
  assert.match(resizerCss, /\.advanced-mode \.lrow-title-trigger\{[^}]*background:#1b1c22/);
  assert.match(resizerCss, /\.advanced-mode \.lrow-title-trigger:hover\{[^}]*background:#1b1c22/);
  assert.match(resizerCss, /\.advanced-mode \.lrow-title-row input\.lrow-title\{[^}]*border-radius:5px;background:#1b1c22/);
  assert.match(resizer, /class="resizer-panel resizer-settings-panel"[\s\S]*?class="row3"[\s\S]*?class="resizer-settings"/);
  assert.match(resizer, /class="resizer-dimension-field"><span>\$\{t\('resizer\.dpi'\)\}<\/span><input id="rz-dpi"/);
  assert.match(resizer, /class="resizer-dimension-field"><span>\$\{t\('resizer\.widthName'\)\}<\/span><input id="rz-w"/);
  assert.match(resizer, /class="resizer-dimension-field"><span>\$\{t\('resizer\.heightName'\)\}<\/span><input id="rz-h"/);
  assert.match(resizer, /class="resizer-panel resizer-output-panel"[\s\S]*?id="rz-path"[\s\S]*?id="rz-out"/);
  assert.match(resizer, /class="btn primary" id="rz-out"/);
  assert.match(resizer, /id="rz-drop"[\s\S]*?id="rz-browse"/);
  assert.doesNotMatch(resizer, /rz-selection|rz-preview|rz-count|rz-clear|rz-remove/);
  assert.doesNotMatch(resizer, /resizer-action-panel|rz-run/);
  assert.match(resizer, /const addEntries=entries=>\{[\s\S]*?run\(added\)/, 'automatically resize images when selected');
  assert.match(resizer, /const updateControls=\(\)=>\{\$\('rz-browse'\)\.disabled=busy\}/);
  assert.match(resizer, /try\{await runBatch\(entries,s\)\}catch/);
  assert.match(resizer, /class="rz-meter" id="rz-progress" role="progressbar"[^>]*aria-valuenow="0"><span class="rz-meter-fill"><\/span><\/div><span class="rz-meter-percent" id="rz-percent" aria-hidden="true">/);
  assert.match(resizer, /drop\.classList\.add\('off','is-processing'\)/);
  assert.match(resizer, /updateProgress\(\+\+processed,entries\.length\)/);
  assert.match(resizer, /bar\.setAttribute\('aria-valuetext',t\('resizer\.filesProgress',completed,total\)\)/);
  assert.doesNotMatch(resizer + resizerCss, /is-segmented|MAX_SEGMENTS|--rz-seg/, 'the progress bar is one smooth bar for every batch size');
  assert.match(resizer, /bar\.style\.setProperty\('--rz-progress',`\$\{percent\}%`\)/);
  assert.doesNotMatch(resizerCss, /conic-gradient\(#6c5ce7|@property --rz-progress|\.rz-drop::after/, 'the old ring progress is removed');
  assert.match(resizerCss, /\.rz-meter-fill\{[^}]*width:var\(--rz-progress,0%\)[^}]*transition:width \.35s/);
  assert.match(resizerCss, /\.rz-drop\.is-processing \.rz-meter-row\{display:flex\}/);
  assert.match(resizerCss, /\.rz-drop\.is-processing :is\(\.rz-upload-icon,\.rz-drop-hint,\.rz-browse\)\{display:none\}/);
  assert.match(resizerCss, /prefers-reduced-motion:reduce\)\{[^}]*\.rz-meter-fill\{transition:none!important\}\.rz-meter::after\{animation:none!important/);
  assert.match(resizer, /drop\.onkeydown=e=>\{if\(e\.target===drop&&\(e\.key==='Enter'\|\|e\.key===' '\)/);
  assert.doesNotMatch(resizer, /rz-progress-container|rz-progress-list|rz-status/);
  assert.match(resizerCss, /\.resizer-settings-panel \.row3\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(resizerCss, /\.resizer-settings-panel \.row3 \.resizer-dimension-field\{display:flex;min-width:0;min-height:55px/);
  assert.match(resizerCss, /\.resizer-settings-panel \.row3 \.resizer-dimension-field:hover,\.resizer-settings-panel \.row3 \.resizer-dimension-field:focus-within\{border-color:#8173e9;box-shadow:0 0 0 1px #8173e955,0 0 16px #6c5ce744\}/);
  assert.match(resizerCss, /\.resizer-settings-panel \.row3 input:hover,\.resizer-settings-panel \.row3 input:focus\{border-color:transparent;box-shadow:none\}/);
  assert.match(resizerCss, /\.view\[data-tool="resizer"\] \.rz-drop::before\{display:none\}/);
  assert.match(resizerCss, /\.resizer-output-row\{display:flex;align-items:center;justify-content:space-between/);
  assert.doesNotMatch(resizerCss, /\.rz-selection|\.rz-preview|\.rz-remove|\.rz-clear/);
  assert.doesNotMatch(resizerCss, /\.resizer-action-panel/);
  assert.doesNotMatch(resizerCss, /\.rz-progress(?!-)/);
  assert.doesNotMatch(resizerCss, /\.rz-progress-sr/);
  assert.equal(en['resizer.imageSettings'], 'Image Settings');
  for (const key of ['resizer.resizeImages', 'resizer.selectedCount', 'resizer.noImages', 'resizer.clearAll', 'resizer.removeImage', 'resizer.imageInfo', 'resizer.imageDimensions']) {
    assert.equal(en[key], undefined, `unused preview label ${key} should be removed`);
  }
  assert.match(background, /const hasHeading = node => node\.nodeType === 1 && \(isHeading\(node\) \|\| \[\.\.\.node\.querySelectorAll\('h5,h6'\)\]\.some\(isHeading\)\)/);
  assert.match(background, /const addsHeading = record =>/);
  assert.match(background, /if \(records\.some\(addsHeading\)\) onMutation\(\)/);
  assert.match(background, /const unconfirmed = finalItems\.map\(\(heading, index\) => \(\{heading, index\}\)\)\s*\.filter\(item => !isOpen\(finalItems, item\.index\)\)/);
  assert.match(background, /unconfirmed\}/);
  assert.match(background, /const ALLOWED_ORIGINS = \[/);
  assert.match(background, /busyTabs\.has\(tabId\)/);
  assert.match(background, /job\.activationTimer = setTimeout\(\(\) => \{/);
  assert.match(background, /\}, 3000\)/);
  assert.match(background, /clearTimeout\(job\.activationTimer\)/);
  assert.match(background, /chrome\.windows\.update\(job\.courseWindowId, \{focused: true\}\)/);
  assert.match(background, /await chrome\.tabs\.update\(job\.tabId, \{active: true\}\)/);
  assert.match(background, /await restorePageTab\(job\)/);
  assert.match(background, /if \(!courseTab\.active \|\| focusedWindow\.id !== job\.courseWindowId\) return/);
  assert.doesNotMatch(background, /autoDiscardable/);
  assert.match(background, /chrome\.tabs\.create\(\{url: url\.href, active: false, windowId: tab\.windowId, openerTabId: tabId\}\)/);
  assert.match(background, /Refusing to open a link outside the LearnCraft variant pages/);
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8')).permissions, ['scripting', 'clipboardWrite', 'storage']);
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8')).host_permissions, ['https://craft.learn.co.th/*']);
  // the page must not rebuild the tab list while a course is being read
  assert.match(page, /if\(!ext\|\|busy\|\|refreshingTabs\)return/);
  assert.match(page, /api=\{activate:\(\)=>\{if\(checking\|\|busy\)return;/);
});
await check('Go Live popup uses a confirmation dialog, stable stopping state, elapsed time, summary and a concise live region', () => {
  const html = fs.readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../extension/popup.css', import.meta.url), 'utf8');
  assert.match(html, /<dialog id="confirm-dialog"/);
  assert.match(html, /id="run-live" class="sr-only" role="status" aria-live="polite"/);
  assert.match(html, /<section id="run" hidden>/);
  assert.match(js, /stopping = true/);
  assert.match(js, /stopping \? 'Stopping…' : 'Stop'/);
  assert.match(js, /formatElapsed\(Date\.now\(\) - runState\.startedAt\)/);
  assert.match(js, /Run log \(\$\{runState\.log\.length\} steps\)/);
  assert.match(css, /\.cancel-button\{min-height:30px;padding:6px 12px/);
});
await check('LearnCraft extension security: only the Penguin Logistics site may talk to it', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const background = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const matches = manifest.content_scripts.flatMap(c => c.matches);
  for (const m of matches) assert.doesNotMatch(m, /^https?:\/\/\*/, `"${m}" lets any site on a whole domain use the bridge`);
  assert.ok(matches.includes('https://gcddllcm.github.io/*'));
  // the allow-list in background.js accepts every origin the manifest injects into, and rejects strangers
  const list = /const ALLOWED_ORIGINS = (\[.*\]);/.exec(background);
  assert.ok(list, 'ALLOWED_ORIGINS must be declared on one line');
  const allowed = eval(list[1]);
  const ok = o => allowed.some(r => r.test(o));
  assert.ok(ok('https://gcddllcm.github.io') && ok('http://localhost:8080') && ok('http://127.0.0.1'));
  for (const bad of ['https://evil.github.io', 'https://gcddllcm.github.io.evil.com', 'http://localhost.evil.com', 'https://localhost']) assert.ok(!ok(bad), bad + ' must be refused');
  assert.match(background, /\(!popup && m\.ns !== 'pl-lc'\) \|\| \(!popup && !fromAllowedPage\(sender\)\)/);
  assert.match(background, /sender\.tab\.id === job\.tabId/);
});

await check('About Us: the line/file constants keep the shape the build script edits', () => {
  assert.equal(typeof en['about.linesNote'], 'string');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  // tools/update_project_line_count.py rewrites exactly this pair; if it is reformatted the Pages build stops
  assert.equal(app.match(/const PROJECT_LINE_COUNT=\d+,PROJECT_FILE_COUNT=\d+;/g)?.length, 1);
  assert.ok(app.includes('PROJECT_FILE_COUNT.toLocaleString()'), 'app.js must show the file count');
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

await check('Timestamp Maker: Quick Guide is mounted and covers the workflow', () => {
  const tool = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  const guide = fs.readFileSync(new URL('../js/instruction-panel.js', import.meta.url), 'utf8');
  assert.match(tool, /mountGuide\(root\.querySelector\('\.tool-layout'\),'timestampMaker'\)/);
  assert.match(guide, /timestampMaker:\s*\{[\s\S]*?targets: \['\.tf-courses'\][\s\S]*?targets: \['\.tf-date-panel', '\.tf-tree'\][\s\S]*?targets: \['\.tf-submit'\]/);
  for (const key of [
    'guide.timestampMaker.step1.title',
    'guide.timestampMaker.step1.desc',
    'guide.timestampMaker.step2.title',
    'guide.timestampMaker.step2.desc',
    'guide.timestampMaker.step3.title',
    'guide.timestampMaker.step3.desc',
    'guide.timestampMaker.details'
  ]) assert.equal(typeof en[key], 'string', `${key} should be translated`);
});

await check('analytics: file counts are grouped into buckets', () => {
  assert.deepEqual([1, 2, 5, 6, 10, 11, 20, 21, 50, 51, 300].map(countBucket), ['1', '2-5', '2-5', '6-10', '6-10', '11-20', '11-20', '21-50', '21-50', '51+', '51+']);
});

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
