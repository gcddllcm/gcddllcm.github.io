// LearnCraft course data helpers: time maths, counting, checks and the table that is copied to Google Sheets.
// No DOM here, so it can be tested in Node (tests/lccore.test.mjs).
//
// A course is a list of nodes: {level, title, duration, children: [], assets: []}
//   level    = 'part' | 'section' | 'mission' (Eggspace only) | 'subsection'
//   duration = 'HH:MM:SS' exactly as LearnCraft shows it ("Label Duration"), or null
//   assets   = [{type, title, version, time, detail: [], href}]   (only on the deepest level)
const TIME = /^\d{1,3}:\d{2}(?::\d{2})?$/;

// 'HH:MM:SS' or 'MM:SS' -> seconds. Anything else (e.g. 'PDF', '15 คะแนน') -> null.
export function toSeconds(s) {
  if (typeof s !== 'string' || !TIME.test(s.trim())) return null;
  const p = s.trim().split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}
export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
// Always HH:MM:SS. Google Sheets reads a bare "05:25" as 5 hours 25 minutes, so short times are padded.
export const normTime = s => { const n = toSeconds(s); return n == null ? '' : fmtTime(n); };

export function sumAssetTimes(assets) {
  return assets.reduce((total, asset) => {
    const seconds = toSeconds(asset.time);
    return seconds == null
      ? {...total, withoutDuration: total.withoutDuration + 1}
      : {...total, seconds: total.seconds + seconds};
  }, {seconds: 0, withoutDuration: 0});
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const nodesOf = r => (r && Array.isArray(r.tree)) ? r.tree : [];

// {part, section, mission, subsection, assets, byType:{VIDEO:n,...}, seconds}
export function countTree(result) {
  const c = {part: 0, section: 0, mission: 0, subsection: 0, assets: 0, byType: {}, seconds: 0};
  const walk = nodes => {
    for (const n of nodes) {
      if (n.level in c && typeof c[n.level] === 'number') c[n.level]++;
      for (const a of n.assets || []) {
        c.assets++;
        const k = (a.type || '?').toUpperCase();
        c.byType[k] = (c.byType[k] || 0) + 1;
      }
      walk(n.children || []);
    }
  };
  walk(nodesOf(result));
  c.seconds = nodesOf(result).reduce((sum, n) => sum + (toSeconds(n.duration) || 0), 0);
  return c;
}

// Compares every shown time with the sum of what is inside it. Returns [{node,level,title,shown,computed}].
export function checkTimes(result) {
  const issues = [];
  const walk = nodes => {
    for (const n of nodes) {
      const shown = toSeconds(n.duration);
      let parts = null;
      if (n.children && n.children.length) parts = n.children.map(x => toSeconds(x.duration));
      else if (n.assets && n.assets.some(a => toSeconds(a.time) != null)) parts = n.assets.map(a => toSeconds(a.time));
      if (shown != null && parts && !parts.includes(null)) {
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum !== shown) issues.push({node: n, level: n.level, title: n.title, shown: fmtTime(shown), computed: fmtTime(sum)});
      }
      walk(n.children || []);
    }
  };
  walk(nodesOf(result));
  return issues;
}

// Things that make the result look incomplete (usually a part of the page that is still collapsed).
export function findGaps(result) {
  const gaps = [];
  const last = (result.levels || []).slice(-1)[0];
  const walk = nodes => {
    for (const n of nodes) {
      const missingChildren=n.level!==last&&!(n.children&&n.children.length);
      const missingAssets=n.level===last&&!(n.assets&&n.assets.length);
      if (missingChildren||missingAssets) gaps.push({level: n.level, title: n.title, ...(Number.isInteger(n.sourceIndex) ? {sourceIndex: n.sourceIndex} : {})});
      walk(n.children || []);
    }
  };
  walk(nodesOf(result));
  return gaps;
}

export function tableHeader(levels) {
  const h = [];
  for (const l of levels) h.push(cap(l), cap(l) + ' time');
  return h.concat(['Asset', 'Type', 'Version', 'Asset time', 'Detail']);
}

// One row per asset (a subsection without assets still gets a row). repeat=false blanks cells that repeat the row above.
export function tableRows(result, {repeat = true} = {}) {
  const levels = result.levels || [];
  const rows = [], prev = [];
  const walk = (nodes, ctx) => {
    for (const n of nodes) {
      const i = levels.indexOf(n.level);
      const cx = ctx.slice();
      if (i >= 0) cx[i] = n;
      if (n.children && n.children.length) { walk(n.children, cx); continue; }
      const list = n.assets && n.assets.length ? n.assets : [null];
      for (const a of list) {
        const row = [];
        let same = true;
        for (let k = 0; k < levels.length; k++) {
          const node = cx[k];
          same = same && node && prev[k] === node;
          const hide = !repeat && same;
          row.push(!node || hide ? '' : node.title, !node || hide ? '' : normTime(node.duration));
          prev[k] = node;
        }
        row.push(a ? a.title : '', a ? a.type : '', a ? a.version : '', a ? normTime(a.time) : '', a ? (a.detail || []).join(' · ') : '');
        rows.push(row);
      }
    }
  };
  walk(nodesOf(result), []);
  return rows;
}

// Tab-separated text, safe to paste into Google Sheets.
export function cell(v) {
  v = v == null ? '' : String(v).replace(/\r?\n|\t/g, ' ');
  if (/^[=+@]/.test(v)) v = "'" + v;            // stop Sheets from reading text as a formula
  return /"/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
export const toTsv = rows => rows.map(r => r.map(cell).join('\t')).join('\n');

export function tableTsv(result, opts) {
  return toTsv([tableHeader(result.levels || []), ...tableRows(result, opts)]);
}

export function csvCell(v) {
  v = v == null ? '' : String(v);
  if (/^[\t\r\n ]*[=+\-@]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
}

export function tableCsv(result, opts) {
  return [tableHeader(result.levels || []), ...tableRows(result, opts)]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function summaryTsv(result) {
  const c = countTree(result), m = result.meta || {};
  const rows = [
    ['Course', m.code || ''], ['Name', m.name || ''], ['Type', m.kind === 'eggspace' ? 'Eggspace' : m.kind === 'traditional' ? 'Traditional' : (m.kindLabel || '')],
    ['Version', m.version || ''], ['Status', m.status || ''], ['Last update', m.lastUpdate || ''],
    ['Parts', c.part], ['Sections', c.section],
  ];
  if ((result.levels || []).includes('mission')) rows.push(['Missions', c.mission]);
  rows.push(['Subsections', c.subsection], ['Assets', c.assets]);
  for (const [k, v] of Object.entries(c.byType)) rows.push(['  ' + k, v]);
  rows.push(['Total time', fmtTime(c.seconds)]);
  return toTsv(rows);
}

// "8116-V14" -> {number:'8116', version:'V14'}; anything else -> null
export function parseCode(code) {
  const m = /^(\d+)-(V\d+[A-Za-z]*)$/.exec(code || '');
  return m ? {number: m[1], version: m[2]} : null;
}
