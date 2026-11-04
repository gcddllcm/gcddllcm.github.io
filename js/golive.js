// LearnCraft : Ultimate Go Live.
// Takes one open Master Canvas tab and takes the course to ready: approves the master, then updates every variant.
// It talks to the same companion extension as the Master Canvas extractor (extension/), and every click happens
// inside the course tab through that extension. Nothing is sent over the internet.
import {track,msg} from './util.js?v=3.4.0';
import {download} from './nbtool.js?v=3.4.0';
import {t} from './i18n.js?v=3.4.0';
import {initMascot} from './mascot.js?v=3.4.0';
import {copyInternalPage,installStepsHtml,updateStepsHtml} from './install-help.js?v=3.4.0';
import {zipSync} from './vendor/fflate.js?v=3.4.0';
import {older,summarizeBridges,staleDownload,freshUrl,FRESH} from './extcore.js?v=3.4.0';
import {mountGuide} from './instruction-panel.js?v=3.4.0';
import {fmtElapsed, newRun, applyProgress, logLine, summarize, tabProblem, masterIsReady, masterStage} from './glcore.js?v=3.4.0';
import {ASSETS,extensionAssetUrl} from './assets.js?v=3.4.0';

const EXT_MIN = '1.1.0';
const FORCE_RESET_PARAM = '__pl_gl_reset';
if (new URL(location.href).searchParams.has(FORCE_RESET_PARAM)) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete(FORCE_RESET_PARAM);
  history.replaceState(history.state, '', cleanUrl);
}
const target = location.origin === 'null' ? '*' : location.origin;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// ---- talking to the extension (same bridge as the extractor; request ids use their own prefix) ----
let seq = 0, ext = null, dup = null, onReady = () => {};
const waiting = new Map();
addEventListener('message', e => {
  if (e.source !== window) return;
  const m = e.data;
  if (!m) return;
  if (m.pl === 'learncraft-ready') { onReady(); return; }
  if (m.pl === 'learncraft-progress' && waiting.has(m.id)) { const p = waiting.get(m.id).onProgress; if (p) p(m.progress); return; }
  if (m.pl === 'learncraft-reply' && waiting.has(m.id)) {
    const w = waiting.get(m.id);
    if (w.collect) { if (m.ok) w.collect.push(m.data); return; }   // a ping: every installed copy of the extension answers, keep them all
    waiting.delete(m.id);
    clearTimeout(w.timer);
    m.ok ? w.res(m.data) : w.rej(new Error(m.error || 'Unknown error'));
  }
});
// Asks every installed copy of the extension who it is. Normally one answers; after a careless update there can be two.
function pingAll(wait = 200) {
  return new Promise(res => {
    const id = 'gl' + (++seq) + '-' + Date.now(), replies = [];
    const timer = setTimeout(() => { waiting.delete(id); res(replies); }, wait);
    waiting.set(id, {collect: replies, timer, onProgress: null});
    window.postMessage({pl: 'learncraft', id, action: 'ping'}, target);
  });
}
// forcedId lets the page know the request id before the answer comes (the Stop button needs it).
function ask(action, extra = {}, timeout = 10000, onProgress = null, forcedId = null) {
  return new Promise((res, rej) => {
    const id = forcedId || ('gl' + (++seq) + '-' + Date.now());
    const timer = setTimeout(() => {
      waiting.delete(id);
      // the page gave up: tell the extension to stop the script that is still running in the course tab
      if (action === 'golive') window.postMessage({pl: 'learncraft', id: id + '-cancel', action: 'cancel', target: id}, target);
      rej(new Error('timeout'));
    }, timeout);
    waiting.set(id, {res, rej, timer, onProgress});
    window.postMessage({pl: 'learncraft', id, action, ...extra}, target);
  });
}

// Every file the extension needs, read from its own manifest (same rule as the extractor).
function extensionFiles(manifest) {
  const files = new Set(['manifest.json', 'README.txt']);
  const add = f => { if (typeof f === 'string' && /^[\w./-]+$/.test(f) && !f.includes('..')) files.add(f.replace(/^\.?\//, '')); };
  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  if (manifest.action?.default_popup) { add('popup.js'); add('popup.css'); }
  (manifest.content_scripts || []).forEach(c => [...(c.js || []), ...(c.css || [])].forEach(add));
  Object.values(manifest.icons || {}).forEach(add);
  return [...files];
}
async function downloadExtension(button) {
  if (button) button.disabled = true;
  try {
    const files = {};
    const mr = await fetch(freshUrl('extension/manifest.json', document.baseURI), FRESH);
    if (!mr.ok) throw new Error('manifest.json (' + mr.status + ')');
    const mbytes = new Uint8Array(await mr.arrayBuffer());
    files['manifest.json'] = mbytes;
    const manifest = JSON.parse(new TextDecoder().decode(mbytes));
    if (typeof manifest.version !== 'string' || ! /^\d+(?:\.\d+){1,3}$/.test(manifest.version)) throw new Error('The extension manifest has an invalid version.');
    const stale = staleDownload(manifest.version, EXT_MIN);   // never hand back an old extension without saying so
    if (stale) throw new Error(stale);
    for (const n of extensionFiles(manifest)) {
      if (n === 'manifest.json') continue;
      const r = await fetch(freshUrl(extensionAssetUrl(n)||'extension/' + n, document.baseURI), FRESH);
      if (!r.ok) throw new Error(n + ' (' + r.status + ')');
      files[n] = new Uint8Array(await r.arrayBuffer());
    }
    download(`penguin-learncraft-extension-v${manifest.version}.zip`, zipSync(files, {level: 6}));
  } catch (e) {
    await msg(t('learncraft.downloadFail'), t('learncraft.downloadFailedDetail', String(e.message || e)), 'error');
  }
  if (button) button.disabled = false;
}

// Words the progress helpers (js/glcore.js) need, in the current language.
const L = {
  did: id => { const k = 'golive.did.' + id, v = t(k); return v === k ? id : v; },
  clicked: label => t('golive.clicked', label),
  waitClick: t('golive.waitClick'), waitDialog: t('golive.waitDialog'), waitLoad: t('golive.waitLoad'),
  ready: t('golive.ready'), masterReady: t('golive.masterReady'),
};

export function mount(root) {
  root.dataset.extensionUpToDate = 'false';
  root.dataset.extensionState = 'unknown';
  root.innerHTML = `<div class="tool-layout"><div class="tool wideview lc">
    <div class="lc-heading"><div><h1>${t('tool.golive')}</h1><div class="sub">${t('golive.sub')}</div></div><div class="lc-mascot-wrap" aria-hidden="true"><div class="lc-mascot-body"><img class="lc-mascot" src="${ASSETS.learncraftMascot}" alt="" loading="lazy" decoding="async"><span class="lc-scope-glint"></span><span class="lc-laser-beam"></span></div></div></div>
    <div class="lc-card" id="gl-status"></div>
    <div class="lc-card" id="gl-courses" hidden></div>
    <div class="lc-card" id="gl-result" hidden></div>
  </div></div>`;
  const mascotWrap = root.querySelector('.lc-mascot-wrap'), mascotHeading = root.querySelector('.lc-heading');
  const updateMascot = e => {
    if (e.pointerType === 'touch') return;
    const rect = mascotWrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right), dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
    const near = Math.hypot(dx, dy) <= 72, hovered = dx === 0 && dy === 0;
    mascotWrap.classList.toggle('is-near', near);
    mascotWrap.classList.toggle('is-hovered', hovered);
    if (!near) return;
    const localX = (e.clientX - rect.left) / rect.width;
    mascotWrap.style.setProperty('--lc-mascot-tilt', `${Math.max(-1.8, Math.min(1.8, (localX - .5) * 3.6))}deg`);
  };
  const resetMascot = () => {
    mascotWrap.classList.remove('is-near', 'is-hovered');
    mascotWrap.style.removeProperty('--lc-mascot-tilt');
  };
  mascotHeading.addEventListener('pointermove', updateMascot);
  mascotHeading.addEventListener('pointerleave', resetMascot);
  initMascot(root, {kind: 'golive', result: '#gl-result'});
  mountGuide(root.querySelector('.tool-layout'), 'golive');
  const $s = root.querySelector('#gl-status'), $c = root.querySelector('#gl-courses'), $r = root.querySelector('#gl-result');
  let busy = false, checking = false, checkingUpdate = false, closeDone = true, current = null;
  const excludedVariants = new Map(), openVariantPickers = new Set();
  let latestVersion = null, courseRows = null;
  const setExtensionState = state => { root.dataset.extensionState = state; root.dataset.extensionUpToDate = String(state === 'up-to-date'); root.dispatchEvent(new Event('extensionstatechange')); };
  const visible = () => root.classList.contains('on');
  const baseTitle = document.title;
  const favicon = document.querySelector('link[rel="icon"]');
  const baseFavicon = favicon.href;
  const statusTitles = {running: 'Running', complete: 'Complete', attention: 'Needs attention'};
  const setTitle = status => {
    document.title = status ? `${statusTitles[status]} | ${baseTitle}` : baseTitle;
    favicon.href = status ? ASSETS.goLiveStatus[status] : baseFavicon;
  };
  // Leaving the page while a run is going would orphan the clicking in the course tabs.
  const leaveGuard = e => { e.preventDefault(); e.returnValue = ''; };
  addEventListener('focus', () => { if (!busy) setTitle(''); });

  function showChecking() {
    $s.hidden = false;
    $s.className = 'lc-card';
    $s.innerHTML = `<div class="lc-line"><span class="lc-spin" aria-hidden="true"></span>${t('learncraft.checking')}</div>`;
    $c.hidden = true;
  }
  function showMissing() {
    $s.hidden = false;
    $s.className = 'lc-card';
    $c.hidden = true;
    $s.innerHTML = `<h2 class="lc-h">${t('learncraft.missingTitle')}</h2>
      <p class="lc-p">${t('learncraft.missingText')}</p>${installStepsHtml()}`;
    $s.querySelector('[data-q=dl]').onclick = e => downloadExtension(e.currentTarget);
    $s.querySelector('[data-q=forcereset]').onclick = forceReset;
    $s.querySelectorAll('[data-q=copyChromeExtensions]').forEach(b => b.onclick = () => copyInternalPage('chrome://extensions'));
  }
  function forceReset() {
    const url = new URL(location.href);
    url.searchParams.set(FORCE_RESET_PARAM, String(Date.now()));
    location.replace(url.href);
  }
  function showConnected(updateCheckError = null) {
    const old = older(ext.version, EXT_MIN);
    const updateAvailable = latestVersion && older(ext.version, latestVersion);
    $s.className = 'lc-card';
    const panel = `${dup ? `<div class="warn"><strong>${t('learncraft.duplicateTitle')}</strong><br>${t('learncraft.duplicateText', dup.count, esc(dup.versions.map(v => 'v' + v).join(', ')))}<ol class="lc-steps"><li>${t('learncraft.duplicate1')}</li><li>${t('learncraft.duplicate2')}</li><li>${t('learncraft.duplicate3')}</li></ol><button class="btn primary" data-q="dup-recheck">${t('learncraft.updateForceRefresh')}</button></div>` : ''}${old || updateAvailable ? `<section class="lc-update-panel" aria-labelledby="lc-update-title"><h2 class="lc-h" id="lc-update-title">${t('learncraft.updateAvailableTitle')}</h2><p class="lc-p">${updateAvailable ? t('learncraft.updateAvailable', esc(latestVersion)) : t('learncraft.outdated', esc(ext.version))}</p>${updateStepsHtml()}</section>` : ''}${updateCheckError ? `<div class="warn">${t('learncraft.updateCheckFailed', esc(updateCheckError.message || updateCheckError))}</div>` : ''}`;
    $s.innerHTML = panel;
    $s.hidden = !panel;
    const recheck = $s.querySelector('[data-q=dup-recheck]');
    if (recheck) recheck.onclick = forceReset;
    const updateButton = $s.querySelector('[data-q=update]');
    if (updateButton) updateButton.onclick = e => downloadExtension(e.currentTarget);
    const forceRefreshButton = $s.querySelector('[data-q=forcereset]');
    if (forceRefreshButton) forceRefreshButton.onclick = forceReset;
    $s.querySelectorAll('[data-q=copyChromeExtensions]').forEach(button => button.onclick = () => copyInternalPage('chrome://extensions'));
  }
  async function latestExtensionVersion() {
    const response = await fetch(freshUrl('extension/manifest.json', document.baseURI), FRESH);
    if (!response.ok) throw new Error(`manifest.json (${response.status})`);
    const manifest = await response.json();
    if (typeof manifest.version !== 'string' || ! /^\d+(?:\.\d+){1,3}$/.test(manifest.version)) throw new Error('The extension manifest has an invalid version.');
    return manifest.version;
  }
  async function checkUpdates() {
    if (!ext || checkingUpdate) return;
    checkingUpdate = true;
    setExtensionState(older(ext.version, EXT_MIN) ? 'outdated' : 'checking');
    try {
      latestVersion = await latestExtensionVersion();
      showConnected();
      setExtensionState(dup ? 'duplicate' : older(ext.version, EXT_MIN) || older(ext.version, latestVersion) ? 'outdated' : 'up-to-date');
    } catch (error) {
      latestVersion = null;
      showConnected(error);
      setExtensionState(dup ? 'duplicate' : older(ext.version, EXT_MIN) ? 'outdated' : 'unknown');
    } finally {
      checkingUpdate = false;
      if (courseRows && !busy) renderCourses(courseRows);
    }
  }
  async function connect() {
    if (checking) return;
    checking = true;
    setExtensionState('checking');
    showChecking();
    const answers = await pingAll();
    checking = false;
    const info = summarizeBridges(answers);   // newest version heard; flags a second installed copy
    if (!info) { ext = null; dup = null; setExtensionState('missing'); showMissing(); return; }
    ext = info;
    dup = info.duplicate ? info : null;
    setExtensionState(dup ? 'duplicate' : older(ext.version, EXT_MIN) ? 'outdated' : 'checking');
    latestVersion = null;
    showConnected();
    refresh();
    checkUpdates();
  }

  // ---- the Master Canvas tabs that can be taken to ready ----
  async function refresh() {
    if (!ext || busy) return;
    $c.hidden = false;
    $c.innerHTML = `<div class="lc-line"><span class="lc-spin" aria-hidden="true"></span>${t('learncraft.listing')}</div>`;
    let rows;
    try { rows = await ask('list', {}, 20000); }
    catch (e) { $c.innerHTML = `<div class="warn">${t('learncraft.listError')}: ${t('learncraft.listFailureDetail',esc(e.message))}</div>`; return; }
    renderCourses(rows);
  }
  function renderCourses(rows) {
    courseRows = rows;
    const masters = rows.filter(r => r.code && r.url && new URL(r.url).pathname.startsWith('/master-canvas/'));
    const courses = rows.filter(r => r.code);
    const extensionOld = older(ext.version, EXT_MIN) || !!(latestVersion && older(ext.version, latestVersion));
    masters.sort((a, b) => {
      const aCanGoLive = !tabProblem(a) && !extensionOld && !masterIsReady(a);
      const bCanGoLive = !tabProblem(b) && !extensionOld && !masterIsReady(b);
      return Number(bCanGoLive) - Number(aCanGoLive);
    });
    const refreshButton = extensionOld ? '' : `<button class="btn" data-q="refresh"${busy ? ' disabled' : ''}>${t('learncraft.refresh')}</button>`;
    const tabsCount = `<div class="lc-line${extensionOld ? ' lc-tabs-count-locked' : ''}"><strong>${t('learncraft.tabsFound', rows.length, courses.length)}</strong><span class="lc-grow"></span>${refreshButton}</div>`;
    const safety = `<p class="lc-p gl-safety">${t('golive.safety')}</p>`;
    const closeOption = `<label class="gl-option${extensionOld ? ' disabled' : ''}"${extensionOld ? ' aria-disabled="true"' : ''}><input type="checkbox" data-q="close"${closeDone ? ' checked' : ''}${extensionOld ? ' disabled' : ''}><span class="gl-option-copy"><strong>${t('golive.optClose')}</strong><small>${t('golive.optCloseHelp')}</small></span></label>`;
    if (!masters.length) {
      $c.innerHTML = `${tabsCount}${safety}<div class="lc-p">${t('golive.noMaster')}</div>`;
      const refreshButtonEl = $c.querySelector('[data-q=refresh]');
      if (refreshButtonEl) refreshButtonEl.onclick = refresh;
      return;
    }
    $c.innerHTML = `${tabsCount}${safety}${closeOption}
      <div class="lc-tablist">${masters.map(r => {
        const problem = tabProblem(r), ok = !problem;
        const p = r.probe || {};
        const alreadyReady = masterIsReady(r);
        const stage = masterStage(r);
        const variantCount = Number.isInteger(p.variantCount) ? t('golive.variantCount', p.variantCount) : '';
        const stageLabel = status => `${status}${variantCount ? `, ${variantCount}` : ''}`;
        const stageChip = stage ? `<span class="lc-chip dim lc-status-stage${stage === 'alert' ? ' lc-status-stage-alert' : ''}">${esc(stageLabel(stage[0].toUpperCase() + stage.slice(1)))}</span>` : '';
        const title = (p.courseTitle || r.title || '').replace(/^\[[^\]]+\]\s*/, '');
        const state = alreadyReady
            ? `<span class="lc-chip dim lc-status-ready-green">${esc(stageLabel(t('golive.ready')))}</span>`
            : extensionOld
            ? `<span class="lc-chip dim">${t('golive.needUpdate')}</span>`
            : ok
              ? `<span class="lc-status-go-live">${t('golive.tabUsable')}</span>`
              : `<span class="lc-chip dim">${t(`learncraft.state.${problem}`)}</span>`;
        const readyNote = alreadyReady ? `<span>${t('golive.noNeedGoLive')}</span>` : '';
        const variantCodes = Array.isArray(p.variantCodes) ? [...new Set(p.variantCodes)] : [];
        let excluded = excludedVariants.get(r.tabId);
        if (!excluded) { excluded = new Set(); excludedVariants.set(r.tabId, excluded); }
        for (const code of excluded) if (!variantCodes.includes(code)) excluded.delete(code);
        const selectedVariants = variantCodes.filter(code => !excluded.has(code));
        const pickerDisabled = extensionOld || !ok || busy;
        const variantPicker = !alreadyReady && variantCodes.length ? `<button type="button" class="btn gl-variant-toggle" data-q="variant-picker" data-tab="${r.tabId}" aria-expanded="${openVariantPickers.has(r.tabId)}"${pickerDisabled ? ' disabled' : ''}><span>${t('golive.chooseVariantsButton')}</span><span class="gl-variant-badge" data-q="variant-selected-count" data-tab="${r.tabId}">${selectedVariants.length}/${variantCodes.length}</span></button>` : '';
        const variantPanel = !alreadyReady && openVariantPickers.has(r.tabId) && variantCodes.length ? `<div class="gl-variant-panel"><div class="gl-variant-panel-head"><div><strong>${t('golive.chooseVariantsTitle')}</strong><small>${t('golive.masterAlwaysReady')}</small></div><div class="gl-variant-bulk"><button type="button" class="gl-variant-link" data-q="select-all-variants" data-tab="${r.tabId}"${pickerDisabled ? ' disabled' : ''}>${t('golive.selectAll')}</button><button type="button" class="gl-variant-link" data-q="clear-variants" data-tab="${r.tabId}"${pickerDisabled ? ' disabled' : ''}>${t('golive.clear')}</button></div></div>
            <div class="gl-variant-options">${variantCodes.map(code => `<label class="gl-variant-option"><input type="checkbox" data-q="variant-choice" data-tab="${r.tabId}" value="${esc(code)}"${excluded.has(code) ? '' : ' checked'}${pickerDisabled ? ' disabled' : ''}><span>${esc(code)}</span></label>`).join('')}</div>
            <small class="gl-variant-count" data-q="variant-count" data-tab="${r.tabId}">${t('golive.selectedVariants', selectedVariants.length, variantCodes.length)}</small>
          </div>` : '';
        return `<div class="lc-tab${ok ? '' : ' off'}${extensionOld ? ' update-locked' : ''}" data-tab="${r.tabId}"${extensionOld ? ' aria-disabled="true"' : ''}>
          <div class="lc-tab-main"><div class="lc-code">${esc(r.code)}</div><div class="lc-tab-info"><div class="lc-tab-title">${esc(title || r.url)}</div><div class="lc-tab-meta">${stageChip}${state}${readyNote}</div></div></div>
          <div class="lc-tab-act">${variantPicker}
            <button class="btn gl-go" data-golive="${r.tabId}" data-code="${esc(r.code)}" title="${alreadyReady ? t('golive.ready') : t('golive.goLive')}"${ok && !busy && !extensionOld && !alreadyReady ? '' : ' disabled'}>${t('golive.goLive')}</button>
          </div>${variantPanel}</div>`;
      }).join('')}</div>`;
    const refreshButtonEl = $c.querySelector('[data-q=refresh]');
    if (refreshButtonEl) refreshButtonEl.onclick = refresh;
    const closeOptionInput = $c.querySelector('[data-q=close]');
    if (closeOptionInput) closeOptionInput.onchange = e => { closeDone = e.currentTarget.checked; };
    $c.querySelectorAll('[data-q=variant-picker]').forEach(button => button.onclick = () => {
      const tabId = Number(button.dataset.tab);
      if (openVariantPickers.has(tabId)) openVariantPickers.delete(tabId);
      else openVariantPickers.add(tabId);
      renderCourses(courseRows);
    });
    $c.querySelectorAll('[data-q=select-all-variants]').forEach(button => button.onclick = () => {
      excludedVariants.delete(Number(button.dataset.tab));
      renderCourses(courseRows);
    });
    $c.querySelectorAll('[data-q=clear-variants]').forEach(button => button.onclick = () => {
      const tabId = Number(button.dataset.tab);
      const row = courseRows.find(item => item.tabId === tabId);
      excludedVariants.set(tabId, new Set(row && row.probe && row.probe.variantCodes || []));
      renderCourses(courseRows);
    });
    $c.querySelectorAll('[data-q=variant-choice]').forEach(input => input.onchange = () => {
      const tabId = Number(input.dataset.tab), excluded = excludedVariants.get(tabId) || new Set();
      if (input.checked) excluded.delete(input.value);
      else excluded.add(input.value);
      excludedVariants.set(tabId, excluded);
      const row = courseRows.find(item => item.tabId === tabId);
      const codes = row && row.probe && row.probe.variantCodes || [];
      const selectedCount = codes.filter(code => !excluded.has(code)).length;
      const count = $c.querySelector(`[data-q=variant-count][data-tab="${tabId}"]`);
      const toggleCount = $c.querySelector(`[data-q=variant-selected-count][data-tab="${tabId}"]`);
      if (count) count.textContent = t('golive.selectedVariants', selectedCount, codes.length);
      if (toggleCount) toggleCount.textContent = `${selectedCount}/${codes.length}`;
    });
    $c.querySelectorAll('[data-golive]').forEach(b => b.onclick = async () => {
      // starting changes a course for real, so it asks once in a dialog
      const row = courseRows.find(item => item.tabId === Number(b.dataset.golive));
      const excluded = excludedVariants.get(Number(b.dataset.golive)) || new Set();
      const variantCodes = (row && row.probe && row.probe.variantCodes || []).filter(code => !excluded.has(code));
      const pick = await msg(t('golive.confirmTitle', b.dataset.code), t('golive.confirmText', variantCodes.length), 'warning', [t('golive.confirmCancel'), t('golive.confirmStart')]);
      if (pick === 1) run(Number(b.dataset.golive), false, b, variantCodes);
    });
  }

  // ---- one run (preview or take to ready) ----
  const rowHtml = (code, state, text, label) => `<div class="gl-row gl-${state}">
      <div class="lc-code">${esc(code)}</div>
      <div class="gl-row-text">${state === 'working' ? '<span class="lc-spin" aria-hidden="true"></span>' : ''}<span>${esc(text || '')}</span></div>
      <span class="gl-chip gl-chip-${state}">${esc(label)}</span></div>`;
  function paintRun() {
    const run = current;
    if (!run) return;
    const m = run.run.master;
    const variants=run.run.variants,finished=variants.filter(v=>v.state==='done'||v.state==='failed').length;
    run.$live.textContent=variants.length?t('golive.progressVariants',finished,variants.length,variants.length-finished):t('golive.running');
    run.$master.innerHTML = rowHtml(t('golive.masterRow'), m.state, m.text, t(`golive.chip.${m.state === 'working' ? 'working' : 'done'}`));
    run.$variants.hidden = !run.run.variants.length;
    run.$variants.innerHTML = run.run.variants.length
      ? `<h3 class="gl-sub">${t('golive.variantsHeading')}</h3>` + run.run.variants.map(v => rowHtml(v.code, v.state, v.text || (v.state === 'queued' ? t('golive.waitingForMaster') : ''), t(`golive.chip.${v.state}`))).join('')
      : '';
  }
  function logHtml(entries, startedAt) {
    return entries.length
      ? `<details class="gl-log"><summary>${t('golive.log', entries.length)}</summary><ol class="golive-log">${entries.map(p => `<li>${esc(logLine(p, L, startedAt))}</li>`).join('')}</ol></details>`
      : '';
  }
  async function run(tabId, dryRun, button, variantCodes) {
    if (busy || !ext) return;
    if (dup) { await msg(t('learncraft.duplicateTitle'), t('learncraft.duplicateBlocked'), 'warning'); return; }   // two copies would each click
    busy = true;
    document.body.classList.add('app-operation-running');
    const startedAt = Date.now();
    current = {run: newRun(), startedAt, dryRun};
    $r.hidden = false;
    $r.className = 'lc-card lc-result';
    $r.innerHTML = `<div class="lc-line gl-run-head"><span class="lc-spin" aria-hidden="true"></span><strong data-q="live" aria-live="polite">${t('golive.running')}</strong><span class="gl-elapsed" data-q="time">${t('golive.elapsed', fmtElapsed(0))}</span><span class="lc-grow"></span><button class="btn gl-stop" data-q="stop">${t('golive.stop')}</button></div>
      <div class="gl-rows"><div data-q="master"></div><div data-q="variants" hidden></div></div>`;
    current.$master = $r.querySelector('[data-q=master]');
    current.$variants = $r.querySelector('[data-q=variants]');
    const live = current.$live = $r.querySelector('[data-q=live]'), time = $r.querySelector('[data-q=time]'), stop = $r.querySelector('[data-q=stop]');
    $r.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    const reqId = 'gl' + (++seq) + '-' + Date.now();
    stop.onclick = () => {
      stop.disabled = true;
      live.textContent = t('golive.stopping');
      window.postMessage({pl: 'learncraft', id: reqId + '-stop', action: 'cancel', target: reqId}, target);
    };
    const timer = setInterval(() => { time.textContent = t('golive.elapsed', fmtElapsed(Date.now() - startedAt)); }, 1000);
    paintRun();
    const onProgress = p => { if (applyProgress(current.run, p, L)) paintRun(); };
    const controls = [...$c.querySelectorAll('button, input'), ...$s.querySelectorAll('button')];
    controls.forEach(b => b.disabled = true);
    if (button) button.setAttribute('aria-busy', 'true');
    addEventListener('beforeunload', leaveGuard);
    setTitle('running');
    let res;
    try {
      res = await ask('golive', {tabId, dryRun, closeDone, variantCodes}, 1200000, onProgress, reqId);
      track('learncraft/golive', dryRun ? 'Ultimate Go Live preview' : 'Ultimate Go Live');
    } catch (e) {
      res = {ok: false, state: 'error', message: e.message === 'timeout' ? t('golive.timeout') : String(e.message || e), results: []};
    } finally {
      clearInterval(timer);
      removeEventListener('beforeunload', leaveGuard);
      busy = false;
      document.body.classList.remove('app-operation-running');
      if (button) button.removeAttribute('aria-busy');
    }
    res.elapsedMs = res.elapsedMs ?? (Date.now() - startedAt);
    renderResult(res, current);
    setTitle(res.ok ? 'complete' : 'attention');
    if (ext) showConnected();
    refresh();
  }

  function renderResult(res, run) {
    const startedAt = run.startedAt, entries = run.run.log, sum = summarize(res);
    const nDone = sum.total;
    let head;
    if (res.dryRun) head = t('golive.previewResult');
    else if (res.ok) head = nDone ? t('golive.done', nDone) : t('golive.doneMaster');
    else head = sum.ready && sum.failed ? t('golive.partial') : t('golive.stopped');
    // preview: say what would happen next, in words
    let preview = '';
    if (res.dryRun) {
      const bits = [];
      if (res.planned) bits.push(t('golive.previewNext', L.did(res.planned)));
      if (res.variants && res.variants.length) bits.push(t('golive.previewVariants', res.variants.length) + ': ' + res.variants.map(v => v.code).join(', '));
      if (!bits.length && res.ok && res.state !== 'loading') bits.push(t('golive.previewNothing'));
      preview = bits.length ? `<ul class="gl-preview">${bits.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
    }
    const stats = !res.dryRun && sum.total ? `<div class="lc-stats">
        <div class="lc-stat"><span>${t('golive.stat.total')}</span><strong>${sum.total}</strong></div>
        <div class="lc-stat"><span>${t('golive.stat.ready')}</span><strong>${sum.ready}</strong></div>
        <div class="lc-stat${sum.failed ? ' gl-stat-bad' : ''}"><span>${t('golive.stat.failed')}</span><strong>${sum.failed}</strong></div>
        <div class="lc-stat"><span>${t('golive.stat.time')}</span><strong>${fmtElapsed(res.elapsedMs)}</strong></div></div>` : '';
    const rows = (res.results || []).map(r => rowHtml(r.code, r.ok ? 'done' : 'failed', r.ok ? '' : r.message, t(`golive.chip.${r.ok ? 'done' : 'failed'}`))).join('');
    $r.className = 'lc-card lc-result';
    $r.innerHTML = `<div class="lc-rhead"><div class="lc-rinfo"><div class="lc-rtitle">${esc(head)}</div></div></div>
      ${res.dryRun && res.planned ? '' : `<div class="${res.ok ? 'lc-notices lc-complete' : 'lc-notices warn'} gl-message" role="status">${esc(res.message || '')}</div>`}
      ${preview}${stats}
      ${rows ? `<div class="gl-rows">${rows}</div>` : ''}
      ${sum.failed ? `<p class="lc-p">${t('golive.leftOpen')}</p>` : ''}
      ${logHtml(entries, startedAt)}
      ${res.dryRun ? '' : `<div class="btnrow lc-actions"><button class="btn" data-q="copylog">${t('golive.copyLog')}</button></div>`}`;
    const copy = $r.querySelector('[data-q=copylog]');
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(logText(res, run)); copy.textContent = t('golive.copiedLog'); setTimeout(() => { copy.textContent = t('golive.copyLog'); }, 1600); }
      catch (error) { await msg(t('golive.copyLog'), t('golive.copyFailed', String(error.message || error)), 'warning'); }
    };
    $r.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
  }
  function logText(res, run) {
    const lines = run.run.log.map(p => logLine(p, L, run.startedAt));
    const failed = (res.results || []).filter(r => !r.ok).map(r => `  ${r.code}: ${r.message}`);
    return [`LearnCraft : Ultimate Go Live`, `Result: ${res.ok ? 'ok' : 'stopped'} (${res.state || ''}), ${fmtElapsed(res.elapsedMs)}`, res.message || '',
      ...(failed.length ? ['', 'Need attention:', ...failed] : []), '', ...lines].join('\n');
  }

  onReady = () => { if (visible() && !ext) connect(); };
  api = {activate: () => { if (checking || busy) return; if (ext) refresh(); else connect(); }};
}

let api = null;
// Called every time the tool is opened.
export const activate = () => { if (api) api.activate(); };
