// Ultimate Go Live helpers: turns the raw progress events of the extension into something a person can read.
// No DOM and no imports here, so it can be tested in Node (tests/golive.test.mjs).
//
// Progress events sent by the extension (extension/background.js):
//   step      {round, page, code, state, did, message, queue, of}   one look at a page (queue 0 = the Master)
//   variants  {event: 'variants', codes: [...]}                      the Master is ready, these variants will run
//   finished  {event: 'variant-done', code, ok, state, message}      one variant is finished (ok or not)

export const fmtElapsed = ms => {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
};

// L = {did(did) -> label, clicked(label), waitClick, waitDialog, waitLoad, ready}
export function stepText(p, L) {
  if (!p) return '';
  if (p.did) return L.clicked(L.did(p.did));
  if (p.state === 'click-wait') return L.waitClick;
  if (p.state === 'dialog-wait') return L.waitDialog;
  if (p.state === 'loading') return L.waitLoad;
  if (p.state === 'done') return L.ready;
  return p.message || '';
}

export function newRun() {
  return {master: {state: 'working', text: ''}, variants: [], log: []};
}

const find = (run, code) => run.variants.find(v => v.code === code);
const add = (run, code) => { const v = {code, state: 'queued', text: ''}; run.variants.push(v); return v; };

// Folds one progress event into the run. Returns true when something visible changed.
export function applyProgress(run, p, L, now = Date.now()) {
  if (!p || typeof p !== 'object') return false;
  if (p.event === 'variants') {
    run.master.state = 'done';
    run.master.text = L.masterReady;
    for (const code of p.codes || []) if (!find(run, code)) add(run, code);
    return true;
  }
  if (p.event === 'variant-done') {
    const v = find(run, p.code) || add(run, p.code);
    v.state = p.ok ? 'done' : 'failed';
    v.text = p.ok ? '' : (p.message || '');
    return true;
  }
  if (!p.round) return false;
  run.log.push({...p, at: now});
  const text = stepText(p, L);
  if (p.queue > 0) {
    const v = find(run, p.code) || add(run, p.code);
    if (v.state !== 'done' && v.state !== 'failed') { v.state = 'working'; v.text = text; }
  } else if (run.master.state !== 'done') {
    run.master.state = 'working';
    run.master.text = text;
  }
  return true;
}

// One line for the log (and the .txt download).
export function logLine(p, L, startedAt) {
  const when = startedAt && p.at ? `[${fmtElapsed(p.at - startedAt)}] ` : '';
  const who = p.queue > 0 ? `${p.code} · ` : (p.code ? `${p.code} · ` : '');
  const what = stepText(p, L);
  const raw = p.did ? ` (${p.did})` : '';
  return `${p.round}. ${when}${who}${what}${raw}`.trim();
}

// Counts for the result card: how many variants were ready and how many need a person.
export function summarize(res) {
  const results = (res && res.results) || [];
  const ready = results.filter(r => r.ok).length;
  return {total: results.length, ready, failed: results.length - ready, failedCodes: results.filter(r => !r.ok).map(r => r.code)};
}

// Why a Master Canvas tab cannot be started yet (null = it can). Same order as the extractor's tab check.
export function tabProblem(r) {
  const p = r.probe;
  if (r.discarded) return 'asleep';
  if (r.status !== 'complete') return 'loading';
  if (r.probeError) return 'noAccess';
  if (p && p.loggedIn === false) return 'login';
  if (!p || !p.hasCanvas) return 'notOverview';
  return null;
}

// A tab probe only reports Ready when it sees the same visible status used by the workflow.
export const masterIsReady = r => r?.probe?.courseStatus === 'ready';
export const masterStage = r => {
  const stage = r?.probe?.courseStatus;
  return stage && stage !== 'ready' ? stage : null;
};
