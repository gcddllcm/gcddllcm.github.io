import "./theme-shim.mjs";
import {assetMatchesDateSelection, flattenTimestampAssets, groupTimestampUpdates, normalizeTimestampTree, parseTimestampPaste, selectedTimestampUpdates, summarizeRecordingDays, timestampGroupAssetIndices, timestampPageAndProblemFromTitle, timestampUpdates, timestampVideoPlaybackUrl, timestampVideoRecordingInfo} from '../js/timestampcore.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } }

const course = {tree: [
  {sourceIndex: 0, level: 'part', title: 'Part 1', assets: [], children: [
    {sourceIndex: 1, level: 'section', title: 'Section A', assets: [], children: [
      {sourceIndex: 2, level: 'subsection', title: 'Lesson 1', assets: [
        {sourceIndex: 2, assetIndex: 0, type: 'VIDEO', title: 'Video 1', href: 'https://example.test/1'},
        {sourceIndex: 2, assetIndex: 1, type: 'PDF', title: 'Slides', href: 'https://example.test/2'},
      ], children: []},
    ]},
  ]},
]};

await check('flatten: asset locations remain stable and include their course path', () => {
  const assets = flattenTimestampAssets(course);
  assert.equal(assets.length, 2);
  assert.equal(assets[0].id, '2:0');
  assert.deepEqual(assets[1].path.map(item => item.title), ['Part 1', 'Section A', 'Lesson 1']);
  assert.equal(assets[1].type, 'PDF');
});
await check('flatten: rejects missing stable asset locations', () => {
  assert.throws(() => flattenTimestampAssets({tree: [{sourceIndex: 0, assets: [{title: 'broken'}]}]}), /stable location/);
  assert.throws(() => flattenTimestampAssets(null), /course data is invalid/);
});
await check('flatten: accepts flat assets from the current Master Canvas layout', () => {
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 0, type: 'VIDEO', title: 'Video 1', href: 'https://example.test/1', path: [{level: '', title: 'Part 1'}]},
    {assetIndex: 1, type: 'PDF', title: 'Slides', href: '', path: []},
  ]});
  assert.deepEqual(assets.map(asset => asset.id), ['0', '1']);
  assert.deepEqual(assets[0].path.map(item => item.title), ['Part 1']);
  assert.throws(() => flattenTimestampAssets({assets: [{assetIndex: 0, path: []}, {assetIndex: 0, path: []}]}), /stable location/);
});
await check('recording date: derives the displayed video filename and date from its preview path', () => {
  const previewUrl = 'https://storage.cloud.google.com/prod-learncraft-asset-artifacts/OE/MATH/8303/V15/video/130801_8303_V15_ภาคตัดกรวย-ทบทวนวงรี/2026-10-16/preview.png';
  assert.deepEqual(timestampVideoRecordingInfo(previewUrl), {
    videoFileName: '130801_8303_V15_ภาคตัดกรวย-ทบทวนวงรี_2026-10-16',
    recordingDate: '2026-10-16',
  });
  assert.equal(timestampVideoRecordingInfo('https://example.test/video/name/2026-02-30/preview.png'), null);
  assert.equal(timestampVideoRecordingInfo('https://example.test/video/name/2026-10-16/source.mp4'), null);
});
await check('video preview: derives the full recording URL from the LearnCraft preview path', () => {
  const previewUrl = 'https://storage.cloud.google.com/prod-learncraft-asset-artifacts/OE/MATH/8318/V05/video/020408_8318_V05_%E0%B9%80%E0%B8%8B%E0%B8%95-%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%97%E0%B8%B5%E0%B9%88%207/2026-10-01/preview.png';
  assert.equal(timestampVideoPlaybackUrl(previewUrl), 'https://storage.cloud.google.com/prod-learncraft-videos/OE/MATH/8318/V05/video/020408_8318_V05_%E0%B9%80%E0%B8%8B%E0%B8%95-%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%97%E0%B8%B5%E0%B9%88%207_2026-10-01.mp4');
  assert.equal(timestampVideoPlaybackUrl('https://example.test/prod-learncraft-asset-artifacts/OE/MATH/video/name/2026-10-01/preview.png'), '');
  assert.equal(timestampVideoPlaybackUrl('https://storage.cloud.google.com/prod-learncraft-asset-artifacts/OE/MATH/video/name/2026-02-30/preview.png'), '');
});
await check('flatten: associates recording date metadata with video assets only', () => {
  const previewUrl = 'https://storage.cloud.google.com/prod-learncraft-asset-artifacts/OE/MATH/video/video-name/2026-10-16/preview.gif';
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 0, type: 'VIDEO', title: 'Lesson', previewUrl},
    {assetIndex: 1, type: 'PDF', title: 'Slides', previewUrl},
  ], tree: []});
  assert.equal(assets[0].videoFileName, 'video-name_2026-10-16');
  assert.equal(assets[0].recordingDate, '2026-10-16');
  assert.equal(assets[0].videoUrl, 'https://storage.cloud.google.com/prod-learncraft-videos/OE/MATH/video/video-name_2026-10-16.mp4');
  assert.equal(assets[1].recordingDate, '');
  assert.equal(assets[1].videoUrl, '');
});
await check('prefill: reads page and problem numbers from Thai asset titles', () => {
  assert.deepEqual(timestampPageAndProblemFromTitle('ภาคตัดกรวย หน้า 99 ข้อที่ 12'), {pageNo: '99', problemNo: '12'});
  assert.deepEqual(timestampPageAndProblemFromTitle('หน้าที่ 101 - ข้อ 89-92'), {pageNo: '101', problemNo: '89-92'});
  assert.deepEqual(timestampPageAndProblemFromTitle('แนะนำคอร์สเรียน'), {pageNo: '', problemNo: ''});
});
await check('paste: parses tabular Page/Pb values and newline-only field values', () => {
  assert.deepEqual(parseTimestampPaste('131\t218\r\n132\t219\r\n135-139\t-\r\n-\t-'), [
    ['131', '218'], ['132', '219'], ['135-139', '-'], ['-', '-'],
  ]);
  assert.deepEqual(parseTimestampPaste('131\r\n132\r\n133\r\n'), [['131'], ['132'], ['133']]);
  assert.equal(parseTimestampPaste('131'), null);
  assert.throws(() => parseTimestampPaste('a\tb\tc'), /one or two columns/);
});
await check('prefill: only unnumbered video assets get suggested values', () => {
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 0, type: 'VIDEO', title: 'หน้า 99 ข้อ 12'},
    {assetIndex: 1, type: 'VIDEO', title: 'หน้าที่ 100 ข้อที่ 13', hasNumberedTimestamp: true},
    {assetIndex: 2, type: 'PDF', title: 'หน้า 101 ข้อ 14'},
  ], tree: []});
  assert.deepEqual(assets.map(({pageNo, problemNo}) => [pageNo, problemNo]), [['99', '12'], ['', ''], ['', '']]);
  assert.deepEqual(assets.map(({pageNoPrefilled, problemNoPrefilled}) => [pageNoPrefilled, problemNoPrefilled]), [
    [true, true], [false, false], [false, false],
  ]);
});
await check('prefill: legacy tree assets respect numbered timestamps', () => {
  const assets = flattenTimestampAssets({tree: [{
    sourceIndex: 0, level: 'section', title: 'Section', children: [], assets: [
      {sourceIndex: 0, assetIndex: 0, type: 'VIDEO', title: 'หน้า 99 ข้อ 12'},
      {sourceIndex: 0, assetIndex: 1, type: 'VIDEO', title: 'หน้า 100 ข้อ 13', hasNumberedTimestamp: true},
    ],
  }]});
  assert.deepEqual(assets.map(({canFill, pageNo, problemNo}) => [canFill, pageNo, problemNo]), [
    [true, '99', '12'], [false, '', ''],
  ]);
});
await check('course structure: retains empty subsections and marks only video assets fillable', () => {
  const result = {ok: true, assets: [
    {assetIndex: 4, type: 'VIDEO', title: 'Lesson video', href: ''},
    {assetIndex: 9, type: 'DOCUMENT', title: 'Slides', href: ''},
  ], tree: [{
    level: 'section', title: 'Section A', duration: '00:00:00', assetIndices: [], children: [
      {level: 'subsection', title: 'Lesson 1', duration: '00:00:00', assetIndices: [4, 9], children: []},
      {level: 'subsection', title: 'Empty lesson', duration: '00:00:00', assetIndices: [], children: []},
    ],
  }]};
  const assets = flattenTimestampAssets(result);
  const tree = normalizeTimestampTree(result, assets);
  assert.equal(assets[0].canFill, true);
  assert.equal(assets[0].pageNoPrefilled, false);
  assert.equal(assets[1].canFill, false);
  assert.equal(assets[0].rowIndex, 0);
  assert.deepEqual(tree[0].children[0].assetIndices, [0, 1]);
  assert.deepEqual(tree[0].children.map(node => node.title), ['Lesson 1', 'Empty lesson']);
  assert.deepEqual(tree[0].children[1].assetIndices, []);
  assets[1].pageNo = '10';
  assert.throws(() => timestampUpdates(assets), /only be filled for video/);
});
await check('numbered timestamps make video assets non-fillable', () => {
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 2, type: 'VIDEO', title: 'Already timestamped', hasNumberedTimestamp: true},
    {assetIndex: 3, type: 'VIDEO', title: 'Ready to timestamp', hasNumberedTimestamp: false},
  ], tree: []});
  assert.equal(assets[0].canFill, false);
  assert.equal(assets[1].canFill, true);
  assets[0].pageNo = '12';
  assert.throws(() => timestampUpdates(assets), /already has a filled timestamp/);
});
await check('updates: ignores blank rows and keeps intentional dash values', () => {
  const assets = flattenTimestampAssets(course);
  assets[0].pageNo = '247';
  assets[0].problemNo = '-';
  assert.deepEqual(timestampUpdates(assets), [{
    assetIndex: 0, title: 'Video 1', type: 'VIDEO', href: 'https://example.test/1', pageNo: '247', problemNo: '-',
  }]);
});
await check('updates: includes only checked assets', () => {
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 0, type: 'VIDEO', title: 'หน้า 10', href: 'https://example.test/0'},
    {assetIndex: 1, type: 'VIDEO', title: 'หน้า 11', href: 'https://example.test/1'},
    {assetIndex: 2, type: 'VIDEO', title: 'หน้า 12', href: 'https://example.test/2'},
  ], tree: []});
  assert.deepEqual(selectedTimestampUpdates(assets, [1]), [{
    assetIndex: 1, title: 'หน้า 11', type: 'VIDEO', href: 'https://example.test/1', pageNo: '11', problemNo: '',
  }]);
});
await check('updates: groups selected assets by subsection and leaves other assets separate', () => {
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 0, type: 'VIDEO', title: 'Video 1', href: 'https://example.test/1'},
    {assetIndex: 1, type: 'VIDEO', title: 'Video 2', href: 'https://example.test/2'},
    {assetIndex: 2, type: 'VIDEO', title: 'Video 3', href: 'https://example.test/3'},
    {assetIndex: 3, type: 'VIDEO', title: 'Video 4', href: 'https://example.test/4'},
  ], tree: [
    {level: 'section', title: 'Section A', assetIndices: [3], children: [
      {level: 'subsection', title: 'Lesson 1', assetIndices: [0, 1], children: []},
      {level: 'subsection', title: 'Lesson 2', assetIndices: [2], children: []},
    ]},
  ]});
  assets.forEach((asset, index) => { asset.pageNo = String(index + 1); });
  const groups = groupTimestampUpdates(assets, normalizeTimestampTree({tree: [
    {level: 'section', title: 'Section A', assetIndices: [3], children: [
      {level: 'subsection', title: 'Lesson 1', assetIndices: [0, 1], children: []},
      {level: 'subsection', title: 'Lesson 2', assetIndices: [2], children: []},
    ]},
  ]}, assets), [0, 1, 2, 3]);
  assert.deepEqual(groups.map(group => group.map(entry => entry.assetIndex)), [[0, 1], [2], [3]]);
});
await check('updates: preserves subsection asset order so duplicate titles can be identified', () => {
  const assets = flattenTimestampAssets({ok: true, assets: [
    {assetIndex: 0, type: 'VIDEO', title: 'หลักการนับเบื้องต้น และความน่าจะเป็น-4 วิธีการจัดหมู่', href: ''},
    {assetIndex: 1, type: 'VIDEO', title: 'หลักการนับเบื้องต้น และความน่าจะเป็น-4 วิธีการจัดหมู่', href: ''},
    {assetIndex: 2, type: 'VIDEO', title: 'Another video', href: ''},
  ], tree: [{
    level: 'subsection', title: 'Lesson 1', assetIndices: [0, 1, 2], children: [],
  }]});
  const tree = normalizeTimestampTree({tree: [{
    level: 'subsection', title: 'Lesson 1', assetIndices: [0, 1, 2], children: [],
  }]}, assets);
  assets[0].pageNo = '1';
  assets[1].pageNo = '2';
  const groups = groupTimestampUpdates(assets, tree, [0, 1]);
  assert.deepEqual(timestampGroupAssetIndices(assets, tree, groups), [[0, 1, 2]]);
});
await check('updates: rejects newlines and oversized field values', () => {
  const assets = flattenTimestampAssets(course);
  assets[0].pageNo = '247\n248';
  assert.throws(() => timestampUpdates(assets), /invalid/);
  assets[0].pageNo = '1'.repeat(41);
  assert.throws(() => timestampUpdates(assets), /invalid/);
});
await check('integration: the LearnCraft directory includes the guarded extension fill action', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const module = fs.readFileSync(new URL('../js/timestamp-maker.js', import.meta.url), 'utf8');
  const bridge = fs.readFileSync(new URL('../extension/bridge.js', import.meta.url), 'utf8');
  const background = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const golive = fs.readFileSync(new URL('../js/golive.js', import.meta.url), 'utf8');
  const learncraft = fs.readFileSync(new URL('../js/learncraft.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.match(app, /'timestamp-maker'.*t\('library\.categoryLearnCraft'\)/);
  assert.match(app, /timestampMaker\.activate\(\)/);
  assert.match(module, /ask\('fill-timestamps'/);
  assert.match(module, /learncraft-progress/);
  assert.match(module, /timestampMaker\.workingSwitch/);
  assert.match(module, /timestampMaker\.progressAsset/);
  assert.match(module, /finally\{\s*busy=false;stopRequested=false;activeFillRequestId=null;[\s\S]*?updatePending\(\);\s*\$result\.scrollIntoView\(\{behavior:matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\?'auto':'smooth',block:'end'\}\);/);
  assert.match(module, /import \{[^}]*parseTimestampPaste[^}]*\} from '\.\/timestampcore\.js\?v=\d+\.\d+\.\d+'/);
  assert.match(module, /input\.addEventListener\('paste',event=>\{[\s\S]*?parseTimestampPaste\(text\)[\s\S]*?const paired=pastedRows\.some\(row=>row\.length>1\)/);
  assert.match(module, /const fields=paired\?\['pageNo','problemNo'\]:\[input\.dataset\.field\]/);
  assert.match(module, /field\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
  assert.match(module, /ask\('list-timestamp-assets'/);
  assert.match(module, /The extension returned no asset list/);
  assert.match(module, /normalizeTimestampTree/);
  assert.match(module, /locked=!asset\.canFill/);
  assert.match(module, /selected=selectedIndices\(\),updates=selectedTimestampUpdates\(assets,selected\)/);
  assert.match(module, /value="\$\{esc\(asset\.pageNo\)\}"/);
  assert.match(module, /asset\.pageNoPrefilled\?' tf-prefilled':''/);
  assert.match(module, /input\.classList\.remove\('tf-prefilled'\)/);
  assert.match(module, /tf-input-empty/);
  assert.match(module, /classList\.toggle\('tf-input-empty',!input\.value\.trim\(\)\)/);
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.tf-input-shell\.tf-input-empty\{/);
  assert.match(bridge, /m\.action !== 'fill-timestamps'/);
  assert.match(bridge, /m\.action !== 'list-timestamp-assets'/);
  assert.match(bridge, /courseCode: m\.courseCode, entries: m\.entries, groups: m\.groups, subsectionAssetIndices: m\.subsectionAssetIndices/);
  assert.match(background, /if \(m\.action === 'list-timestamp-assets'\) return listTimestampAssets\(m\)/);
  assert.match(background, /The LearnCraft page did not return an asset list/);
  assert.match(background, /const assetTitle = \(nav, root\) =>/);
  assert.match(background, /durationInfo = scope =>/);
  assert.match(background, /compareDocumentPosition\(b\.element\)/);
  assert.match(background, /stack\[stack\.length - 1\]\.assetIndices\.push\(assetIndex\)/);
  assert.match(background, /querySelectorAll\('li'\)\.length === 1/);
  assert.match(background, /querySelectorAll\('nav'\)\]\.filter\(nav =>\s*nav\.classList\.contains\('MuiBreadcrumbs-root'\) && nav\.querySelectorAll\('li'\)\.length === 1/);
  assert.match(background, /if \(m\.action === 'fill-timestamps'\) return fillTimestamps\(m, sender\)/);
  assert.match(background, /run\(tabId, lcFillTimestamps, \[groups, subsectionAssetIndices, courseCode, reqId\]\)/);
  assert.match(background, /const groups = m\.groups\.map\(group =>/);
  assert.match(background, /group\.every\(entry =>/);
  assert.match(background, /all subsection assets to show their filled timestamps/);
  assert.match(module, /groups:groups\.map\(group=>group\.map\(entry=>entry\.assetIndex\)\)/);
  assert.match(module, /timestampGroupAssetIndices\(assets,tree,groups\)/);
  assert.match(bridge, /groups: m\.groups/);
  assert.match(background, /findDialogAsset = \(entry, dialog, subsectionIndices\)/);
  assert.match(background, /const expectedIndex = subsectionIndices\.indexOf\(entry\.assetIndex\)/);
  assert.match(background, /const cancelled = \(\) => !!\(globalThis\.__plLcCancel && globalThis\.__plLcCancel\[reqId\]\)/);
  assert.match(background, /state: stopped \? 'cancelled' : 'done'/);
  assert.match(background, /ns: 'pl-lc-tick', job: reqId, progress/);
  assert.match(background, /if \(!\(await activateCourseTab\(reqId\)\)\)/);
  assert.match(background, /await restorePageTab\(job\)/);
  assert.match(background, /completed = result\.state === 'done'/);
  assert.match(background, /await restorePageTab\(job, completed\)/);
  assert.match(background, /async function restorePageTab\(job, force = false\)/);
  assert.match(background, /The Master Canvas itself is never saved here/);
  assert.match(background, /hasNumberedTimestamp: \/\^Timestamp/);
  assert.match(background, /const previewOf = row => \[\.\.\.row\.querySelectorAll\('img\[src\]'\)\]/);
  assert.match(background, /const waitFor = async \(find, label, timeout = 10000\) =>/);
  assert.match(background, /setTimeout\(resolve, 100\)/);
  assert.match(background, /select\.dispatchEvent\(new MouseEvent\('mousedown'/);
  assert.match(background, /select\.getAttribute\('aria-expanded'\) !== 'true'/);
  assert.match(background, /const listboxId = select\.getAttribute\('aria-controls'\)/);
  assert.match(background, /listbox\.querySelectorAll\('\[role="option"\]'\)/);
  assert.match(background, /await clickWithErrorRecovery\(save\);\s*saved = true;\s*await waitFor\(\(\) => !findDialog\(\), 'the timestamp dialog to close'\);\s*await waitFor\(\(\) => \{/);
  assert.match(background, /Could not uniquely identify/);
  assert.match(background, /await clickWithErrorRecovery\(targetAsset\.row\);\s*await settleTimestampEditor\(\);/);
  assert.match(background, /const settleTimestampEditor = \(\) => new Promise\(resolve => setTimeout\(resolve, 300\)\)/);
  assert.match(background, /if \(entry\.problemNo\) setInputValue\(problemInput, entry\.problemNo\);\s*if \(index \+ 1 < group\.length\) await settleTimestampEditor\(\);/);
  assert.match(background, /const refreshErrorDialog = async \(\) =>/);
  assert.match(background, /เกิดข้อผิดพลาด\|error\\s\*:/);
  assert.match(background, /querySelectorAll\('\[role="dialog"\],\[role="alertdialog"\]'\)/);
  assert.match(background, /buttonByText\(item, 'Refresh'\)/);
  assert.match(background, /buttonByText\(dialog, 'Refresh'\)\.click\(\)/);
  assert.match(background, /if \(await refreshErrorDialog\(\)\) continue/);
  assert.match(background, /const clickWithErrorRecovery = async element =>/);
  assert.match(background, /errorRefreshAttempts > 10/);
  assert.match(background, /lazy-load-image-background/);
  assert.match(module, /data-day="\$\{date\}"/);
  assert.match(module, /data-month="\$\{month\}"/);
  assert.match(module, /data-undated/);
  assert.match(module, /event\.shiftKey/);
  assert.match(module, /summarizeRecordingDays/);
  assert.match(module, /assetMatchesDateSelection/);
  assert.match(module, /class="tf-date-panel"/);
  assert.match(module, /makeStatus\('filled',filled,t\('timestampMaker\.filledLabel'\)\)/);
  assert.match(module, /makeStatus\('unfilled',unfilled,t\('timestampMaker\.unfilledLabel'\)\)/);
  assert.match(module, /tf-day-status-\$\{kind\}/);
  assert.match(module, /timestampMaker\.dateFilterHint/);
  assert.match(module, /data-action=stop/);
  assert.match(module, /import \{copyInternalPage,installStepsHtml\} from '\.\/install-help\.js\?v=\d+\.\d+\.\d+'/);
  assert.match(module, /function showMissing\(\)/);
  assert.match(module, /function showOutdated\(version\)/);
  assert.match(module, /function showDuplicate\(info\)/);
  assert.match(module, /\[data-q=dl\]/);
  assert.match(module, /installStepsHtml\(\{update:true\}\)/);
  assert.match(module, /function extensionFiles\(manifest\)/);
  assert.match(module, /action:'cancel',target:activeFillRequestId/);
  assert.match(module, /timestampMaker\.stopped/);
  assert.match(module, /if\(dragState\.originInput\)\{\s*const bounds=dragState\.inputBounds;/);
  assert.match(module, /if\(inside\)return;/);
  assert.match(module, /originInput:input,inputBounds:input\.getBoundingClientRect\(\)/);
  assert.match(bridge, /if \(m\.action === 'cancel'\)/);
  assert.match(background, /if \(m\.action === 'cancel'\) \{\s*const job = typeof m\.reqId === 'string' \? jobs\.get\(m\.reqId\) : null;\s*if \(job && job\.pageTabId === sender\.tab\.id\) cancelJob\(m\.reqId\)/);
  assert.match(module, /data-video-preview/);
  assert.match(module, /preload="none"/);
  assert.match(module, /videoDialog\.showModal\(\)/);
  assert.match(module, /videoPlayer\.play\(\)\.catch/);
  assert.match(module, /videoPlayer\.removeAttribute\('src'\)/);
  assert.match(module, /videoViewport\.addEventListener\('wheel'/);
  assert.match(module, /videoViewport\.addEventListener\('pointerdown'/);
  assert.match(module, /videoPanDrag\.panX\+dx/);
  assert.match(module, /event\.ctrlKey/);
  assert.match(module, /nextZoom=Math\.max\(1,Math\.min\(3,videoZoom/);
  assert.match(module, /resetVideoZoom\(\)/);
  assert.match(background, /already has a filled timestamp\./);
  assert.equal(manifest.version, '1.3.0');
  assert.match(module, /const EXT_MIN='1\.3\.0'/);
  assert.match(learncraft, /const EXT_MIN='1\.3\.0'/);
  assert.match(golive, /const EXT_MIN = '1\.3\.0'/);
});

await check('date filter: summarizes recorded days in order and counts undated videos separately', () => {
  const assets = [
    {type: 'VIDEO', recordingDate: '2026-10-20'},
    {type: 'VIDEO', recordingDate: '2026-09-03'},
    {type: 'VIDEO', recordingDate: '2026-10-20'},
    {type: 'VIDEO', recordingDate: ''},
    {type: 'PDF', recordingDate: ''},
  ];
  assert.deepEqual(summarizeRecordingDays(assets), {days: [{date: '2026-09-03', count: 1}, {date: '2026-10-20', count: 2}], undated: 1});
});
await check('date filter: empty selection shows everything; days and undated videos match separately', () => {
  const dated = {type: 'VIDEO', recordingDate: '2026-10-20'};
  const undatedVideo = {type: 'VIDEO', recordingDate: ''};
  const pdf = {type: 'PDF', recordingDate: ''};
  assert.equal(assetMatchesDateSelection(pdf, {}), true);
  assert.equal(assetMatchesDateSelection(dated, {dates: new Set(['2026-10-20'])}), true);
  assert.equal(assetMatchesDateSelection(dated, {dates: new Set(['2026-10-21'])}), false);
  assert.equal(assetMatchesDateSelection(undatedVideo, {dates: new Set(['2026-10-20'])}), false);
  assert.equal(assetMatchesDateSelection(undatedVideo, {undated: true}), true);
  assert.equal(assetMatchesDateSelection(pdf, {undated: true}), false);
});

if (failed) { console.log(failed + ' test(s) failed'); process.exit(1); }
console.log('All Timestamp Maker helper tests passed');
