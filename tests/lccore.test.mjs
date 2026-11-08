import "./theme-shim.mjs";
// Tests for the LearnCraft helpers (time maths, checks, table for Google Sheets). Run: node tests/lccore.test.mjs
import {toSeconds, fmtTime, normTime, sumAssetTimes, countTree, checkTimes, findGaps, tableHeader, tableRows, tableTsv, csvCell, tableCsv, summaryTsv, cell, parseCode} from '../js/lccore.js';
import assert from 'node:assert/strict';

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } }

const asset = (type, title, time, extra = {}) => ({type, title, version: 'Ver.1', time, detail: [], href: '', ...extra});
const sub = (title, duration, assets) => ({level: 'subsection', title, duration, children: [], assets});
const trad = {
  meta: {code: '8116-V14', name: 'Demo', kind: 'traditional'},
  levels: ['part', 'section', 'subsection'],
  tree: [
    {level: 'part', title: 'P1', duration: '00:10:00', assets: [], children: [
      {level: 'section', title: 'S1', duration: '00:10:00', assets: [], children: [
        sub('A', '00:05:25', [asset('VIDEO', 'a', '05:25')]),
        sub('B', '00:04:35', [asset('VIDEO', 'b', '04:35'), asset('DOCUMENT', 'b.pdf', null, {detail: ['PDF']})]),
      ]},
      {level: 'section', title: 'S2', duration: '00:00:00', assets: [], children: [
        sub('C', '00:00:00', [asset('QUIZ', 'q', null, {detail: ['จำนวน 15 ข้อ', '15 คะแนน']})]),
      ]},
    ]},
  ],
};

await check('times: HH:MM:SS and MM:SS are read, anything else is not a time', () => {
  assert.equal(toSeconds('08:34:54'), 30894);
  assert.equal(toSeconds('05:25'), 325);
  assert.equal(toSeconds('PDF'), null);
  assert.equal(toSeconds('15 คะแนน'), null);
  assert.equal(toSeconds(null), null);
});
await check('times: short times are padded so Google Sheets does not read 05:25 as 5 hours', () => {
  assert.equal(normTime('05:25'), '00:05:25');
  assert.equal(normTime('08:34:54'), '08:34:54');
  assert.equal(normTime('PDF'), '');
  assert.equal(fmtTime(3600 * 30 + 61), '30:01:01');
});
await check('times: selected asset durations are summed and missing durations are counted', () => {
  assert.deepEqual(sumAssetTimes([asset('VIDEO', 'a', '02:30'), asset('DOCUMENT', 'b', null), asset('VIDEO', 'c', '00:00:00')]), {seconds: 150, withoutDuration: 1});
  assert.deepEqual(sumAssetTimes([]), {seconds: 0, withoutDuration: 0});
});
await check('count: levels, assets by type and total time', () => {
  const c = countTree(trad);
  assert.deepEqual([c.part, c.section, c.mission, c.subsection, c.assets], [1, 2, 0, 3, 4]);
  assert.deepEqual(c.byType, {VIDEO: 2, DOCUMENT: 1, QUIZ: 1});
  assert.equal(c.seconds, 600);
});
await check('time check: no complaint when everything adds up', () => {
  assert.deepEqual(checkTimes(trad), []);
});
await check('time check: a part that does not match its sections is reported with the node', () => {
  const bad = structuredClone(trad); bad.tree[0].duration = '00:11:00';
  const issues = checkTimes(bad);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].title, 'P1'); assert.equal(issues[0].shown, '00:11:00'); assert.equal(issues[0].computed, '00:10:00');
  assert.equal(issues[0].node, bad.tree[0]);
});
await check('time check: a subsection is compared with its video times, documents without a time are fine', () => {
  const bad = structuredClone(trad); bad.tree[0].children[0].children[0].duration = '00:05:00';
  assert.equal(checkTimes(bad).map(i => i.title).join(), 'S1,A');   // A itself, and S1 above it no longer adds up
});
await check('gaps: a section with nothing inside (collapsed in LearnCraft) is found', () => {
  assert.deepEqual(findGaps(trad), []);
  const g = structuredClone(trad); g.tree[0].children[1].children = [];
  assert.deepEqual(findGaps(g), [{level: 'section', title: 'S2'}]);
  g.tree[0].children[1].sourceIndex = 7;
  assert.deepEqual(findGaps(g), [{level: 'section', title: 'S2', sourceIndex: 7}]);
});
await check('gaps: deepest-level items with no assets are reported with jump targets', () => {
  const g = structuredClone(trad);
  const empty = g.tree[0].children[0].children[0];
  empty.assets = [];
  empty.sourceIndex = 12;
  assert.deepEqual(findGaps(g), [{level: 'subsection', title: 'A', sourceIndex: 12}]);
});
await check('table: one row per asset, parent names and times repeated, times as HH:MM:SS', () => {
  assert.deepEqual(tableHeader(trad.levels), ['Part', 'Part time', 'Section', 'Section time', 'Subsection', 'Subsection time', 'Asset', 'Type', 'Version', 'Asset time', 'Detail']);
  const rows = tableRows(trad);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], ['P1', '00:10:00', 'S1', '00:10:00', 'A', '00:05:25', 'a', 'VIDEO', 'Ver.1', '00:05:25', '']);
  assert.deepEqual(rows[2].slice(0, 6), ['P1', '00:10:00', 'S1', '00:10:00', 'B', '00:04:35']);   // second asset of B
  assert.equal(rows[3][10], 'จำนวน 15 ข้อ · 15 คะแนน');
});
await check('CSV: headers and table rows are quoted, escaped, and protected from formulas', () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell('=SUM(A1:A2)'), `"'=SUM(A1:A2)"`);
  const csv = tableCsv(trad);
  assert.ok(csv.startsWith('"Part","Part time","Section"'));
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes('"P1","00:10:00","S1"'));
});
await check('table: with repeat off a name that repeats the row above is left blank', () => {
  const rows = tableRows(trad, {repeat: false});
  assert.deepEqual(rows[1].slice(0, 6), ['', '', '', '', 'B', '00:04:35']);
  assert.deepEqual(rows[2].slice(0, 6), ['', '', '', '', '', '']);       // same subsection B again
  assert.deepEqual(rows[3].slice(0, 6), ['', '', 'S2', '00:00:00', 'C', '00:00:00']);
});
await check('table: collapsed nodes copy as summary rows without their hidden descendants or assets', () => {
  const section = trad.tree[0].children[0];
  const subsection = trad.tree[0].children[1].children[0];
  const rows = tableRows(trad, {collapsedNodes: new Set([section, subsection])});
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['P1', '00:10:00', 'S1', '00:10:00', '', '', '', '', '', '', '']);
  assert.deepEqual(rows[1], ['P1', '00:10:00', 'S2', '00:00:00', 'C', '00:00:00', '', '', '', '', '']);
});
await check('table: a subsection without assets still gets a row; Eggspace adds mission columns', () => {
  const egg = {meta: {kind: 'eggspace'}, levels: ['part', 'section', 'mission', 'subsection'], tree: [
    {level: 'part', title: 'P', duration: '00:01:00', assets: [], children: [
      {level: 'section', title: 'S', duration: '00:01:00', assets: [], children: [
        {level: 'mission', title: 'M1', duration: '00:01:00', assets: [], children: [sub('X', '00:01:00', [asset('VIDEO', 'x', '01:00')]), sub('Y', '00:00:00', [])]},
      ]},
    ]},
  ]};
  assert.equal(tableHeader(egg.levels).length, 13);
  const rows = tableRows(egg);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['P', '00:01:00', 'S', '00:01:00', 'M1', '00:01:00', 'Y', '00:00:00', '', '', '', '', '']);
  assert.equal(countTree(egg).mission, 1);
  assert.ok(summaryTsv(egg).includes('Missions\t1'));
});
await check('tsv: tabs and line breaks become spaces, quotes are doubled, formula starters are made text', () => {
  assert.equal(cell('a\tb\nc'), 'a b c');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(cell(null), '');
  const lines = tableTsv(trad).split('\n');
  assert.equal(lines.length, 5);
  assert.ok(lines.every(l => l.split('\t').length === 11));
});
await check('summary: type name, counts per asset type and total time', () => {
  const s = summaryTsv(trad);
  assert.ok(s.includes('Type\tTraditional'));
  assert.ok(s.includes('Total time\t00:10:00'));
  assert.ok(s.includes('  VIDEO\t2'));
  assert.ok(!s.includes('Missions'));
});
await check('course code: number and version are split, other text is refused', () => {
  assert.deepEqual(parseCode('8116-V14'), {number: '8116', version: 'V14'});
  assert.deepEqual(parseCode('8116-V14L'), {number: '8116', version: 'V14L'});
  assert.equal(parseCode('create'), null);
});

if (failed) { console.log(failed + ' test(s) failed'); process.exit(1); }
console.log('All LearnCraft helper tests passed');
