const $status = document.querySelector('#status');
const $courses = document.querySelector('#courses');
const $run = document.querySelector('#run');
const $closeReady = document.querySelector('#close-ready');
const $refresh = document.querySelector('#refresh');
const CLOSE_READY_KEY = 'plLcCloseReady';
let requestNumber = 0, activeReqId = null, activeCode = '', running = false, stopping = false, runState = null;
let elapsedTimer = null;
let cachedRows = [];
const excludedVariants = new Map(), openVariantPickers = new Set();
let pendingRun = null;
const $runLive = document.querySelector('#run-live');
const $confirmDialog = document.querySelector('#confirm-dialog');
const $confirmTitle = document.querySelector('#confirm-title');
const $confirmText = document.querySelector('#confirm-text');
const $confirmStart = $confirmDialog.querySelector('[data-action="start"]');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const formatElapsed = ms => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const actionLabel = id => ({
  'submit-for-approval': 'Submit for Approval',
  approve: 'Approve the Master',
  'confirm-master-approval': 'Confirm Master approval',
  'tick-ignore-timestamp': 'Ignore assets without timestamps',
  'approve-master-after-ignore': 'Approve with timestamps ignored',
  'approve-after-ignore': 'Approve in the timestamp dialog',
  'submit-after-ignore': 'Submit in the timestamp dialog',
  'update-alert': 'Select Update',
  'confirm-update': 'Confirm the update',
  'submit-as-ready': 'Submit as Ready',
  'confirm-submit-ready': 'Confirm Submit as Ready',
  'update-green': 'Select the green Update'
}[id] || id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '));
function request(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!response || !response.ok) return reject(new Error(response && response.error || 'The extension did not answer.'));
      resolve(response.data);
    });
  });
}
function problem(row) {
  if (row.discarded) return 'This tab is asleep. Open it once, then refresh.';
  if (row.status !== 'complete') return 'This tab is still loading.';
  if (row.probeError) return 'The extension could not inspect this tab.';
  if (row.probe && row.probe.loggedIn === false) return 'Sign in to LearnCraft in this tab.';
  if (!row.probe || !row.probe.hasCanvas) return 'Open the Master Canvas Overview page.';
  return '';
}
function renderCourses(rows) {
  cachedRows = rows;
  const masters = rows.filter(row => row.code && row.url && new URL(row.url).pathname.startsWith('/master-canvas/'));
  masters.sort((a, b) => {
    const aCanGoLive = !problem(a) && a.probe.courseStatus !== 'ready';
    const bCanGoLive = !problem(b) && b.probe.courseStatus !== 'ready';
    return Number(bCanGoLive) - Number(aCanGoLive);
  });
  $courses.innerHTML = masters.length ? masters.map(row => {
    const disabled = problem(row);
    const alreadyReady = row.probe && row.probe.courseStatus === 'ready';
    const canGoLive = !disabled && !alreadyReady;
    const stage = row.probe && row.probe.courseStatus || '';
    const variantCount = row.probe && Number.isInteger(row.probe.variantCount) ? row.probe.variantCount : null;
    const stageClass = stage === 'ready' ? ' course-stage-ready' : stage === 'alert' ? ' course-stage-alert' : '';
    const readyNote = alreadyReady ? '<span class="course-meta">No need to Go Live</span>' : '';
    const title = row.probe && row.probe.courseTitle || row.title || row.code;
    const stageLabel = stage ? `${stage[0].toUpperCase() + stage.slice(1)}${variantCount == null ? '' : `, ${variantCount} variant${variantCount > 1 ? 's' : ''}`}` : '';
    const variantCodes = row.probe && Array.isArray(row.probe.variantCodes) ? [...new Set(row.probe.variantCodes)] : [];
    let excluded = excludedVariants.get(row.tabId);
    if (!excluded) { excluded = new Set(); excludedVariants.set(row.tabId, excluded); }
    for (const code of excluded) if (!variantCodes.includes(code)) excluded.delete(code);
    const selectedVariants = variantCodes.filter(code => !excluded.has(code));
    const variantPicker = !alreadyReady && variantCodes.length ? `<button class="variant-toggle" type="button" data-action="toggle-variants" data-tab="${row.tabId}" aria-expanded="${openVariantPickers.has(row.tabId)}"${running || disabled ? ' disabled' : ''}><span>Choose variants</span><span class="variant-badge" data-selected-count="${row.tabId}">${selectedVariants.length}/${variantCodes.length}</span></button>` : '';
    const variantPanel = !alreadyReady && openVariantPickers.has(row.tabId) && variantCodes.length ? `<div class="variant-panel"><div class="variant-panel-head"><div><strong>Choose variants to update</strong><small>The Master is always taken to Ready.</small></div><div class="variant-bulk"><button type="button" data-action="select-all-variants" data-tab="${row.tabId}"${running || disabled ? ' disabled' : ''}>Select all</button><button type="button" data-action="clear-variants" data-tab="${row.tabId}"${running || disabled ? ' disabled' : ''}>Clear</button></div></div>
        <div class="variant-options">${variantCodes.map(code => `<label class="variant-option"><input type="checkbox" data-action="variant-choice" data-tab="${row.tabId}" value="${escapeHtml(code)}"${excluded.has(code) ? '' : ' checked'}${running || disabled ? ' disabled' : ''}><span>${escapeHtml(code)}</span></label>`).join('')}</div>
        <small class="variant-count" data-variant-count="${row.tabId}">${selectedVariants.length} of ${variantCodes.length} variants selected</small>
      </div>` : '';
    return `<article class="course" aria-labelledby="course-title-${row.tabId}">
      <div class="course-heading"><span class="course-title" id="course-title-${row.tabId}" role="heading" aria-level="2">${escapeHtml(title)}</span><span class="course-status">${stage ? `<span class="course-meta course-stage${stageClass}">${escapeHtml(stageLabel)}</span>` : ''}${readyNote}${canGoLive ? '<span class="course-meta course-ready-to-go-live">Ready to Go Live</span>' : ''}</span>${disabled ? `<span class="course-meta course-error">${escapeHtml(disabled)}</span>` : ''}</div>
      <div class="course-actions">${variantPicker}<button class="course-button primary" type="button" data-action="confirm" data-tab="${row.tabId}" data-code="${escapeHtml(row.code)}" aria-label="Go Live: ${escapeHtml(title)}" title="${alreadyReady ? 'Ready' : 'Go Live'}"${disabled || running || alreadyReady ? ' disabled' : ''}>Go Live</button></div>
      ${variantPanel}
    </article>`;
  }).join('') : '<p class="run-message">No Master Canvas tabs found. Open a course Master Canvas Overview page and refresh.</p>';
  $status.textContent = masters.length ? `${masters.length} Master Canvas tab${masters.length === 1 ? '' : 's'} found.` : 'No Master Canvas tabs found.';
}
async function refresh(clearRun = false, force = false) {
  if (running && !force) return;
  $refresh.disabled = true;
  if (clearRun) {
    try { await request({ns: 'pl-lc-popup', action: 'clear-run'}); }
    catch (error) {
      $status.textContent = `Could not clear previous run status: ${error.message}`;
      $refresh.disabled = false;
      return;
    }
    runState = null;
    activeCode = '';
    activeReqId = null;
    $run.hidden = true;
    $run.replaceChildren();
    $runLive.textContent = '';
  }
  $status.textContent = 'Looking for Master Canvas tabs…';
  try { renderCourses(await request({ns: 'pl-lc-popup', action: 'list'})); }
  catch (error) { $status.textContent = `Could not list tabs: ${error.message}`; $courses.replaceChildren(); }
  finally {
    if (runState) $status.textContent = runState.statusText;
    $refresh.disabled = running;
  }
}
function showConfirmation(tabId, code, variantCodes) {
  $run.hidden = true;
  $confirmTitle.textContent = `Take ${code} to Ready?`;
  $confirmText.textContent = variantCodes.length
    ? `The tool will approve the Master, then update the ${variantCodes.length} selected variant${variantCodes.length === 1 ? '' : 's'} until each one is Ready. You can press Stop at any time.`
    : 'The tool will approve the Master only. No variants will be updated. You can press Stop at any time.';
  pendingRun = {tabId: Number(tabId), code, variantCodes};
  $confirmDialog.showModal();
}
function drawRun() {
  if (!runState) return;
  const runLogOpen = Boolean($run.querySelector('.run-log')?.open);
  const variants = runState.variants.map(item => `<div class="progress-row ${item.state === 'failed' ? 'failed' : item.state === 'done' ? 'done' : ''}"><span>${escapeHtml(item.code)}</span><span>${item.state === 'done' ? 'Ready' : item.state === 'failed' ? 'Needs attention' : item.state === 'working' ? 'Working' : 'Queued'}</span>${item.text ? `<small>${escapeHtml(item.text)}</small>` : ''}</div>`).join('');
  const master = `<div class="progress-row ${runState.masterDone ? 'done' : ''}"><span>Master Canvas</span><span>${runState.masterDone ? 'Ready' : runState.masterText ? 'Working' : 'Queued'}</span>${runState.masterText ? `<small>${escapeHtml(runState.masterText)}</small>` : ''}</div>`;
  const completed = runState.variants.filter(item => item.state === 'done' || item.state === 'failed').length;
  const progress = runState.variants.length ? `${completed} of ${runState.variants.length} variants done; ${runState.variants.length - completed} remaining.` : 'Working on the Master Canvas.';
  $runLive.textContent = running ? progress : '';
  $run.innerHTML = `<div class="run-heading"><strong>${escapeHtml(activeCode)} · ${running ? 'Working' : 'Result'} · <span data-q="elapsed">${formatElapsed(Date.now() - runState.startedAt)}</span></strong>${running ? `<button class="cancel-button" type="button" data-action="stop"${stopping ? ' disabled' : ''}>${stopping ? 'Stopping…' : 'Stop'}</button>` : ''}</div>${runState.message ? `<p class="run-message">${escapeHtml(runState.message)}</p>` : ''}${runState.summary ? `<p class="run-summary">${escapeHtml(runState.summary)}</p>` : ''}<div class="progress-list">${master}${variants}</div>${runState.log.length ? `<div class="run-log-controls"><details class="run-log"${runLogOpen ? ' open' : ''}><summary>Run log (${runState.log.length} steps)</summary><ol>${runState.log.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ol></details><button class="copy-log-button" type="button" data-action="copy-log">Copy log</button></div>` : ''}`;
  $run.hidden = false;
}
function applyProgress(progress) {
  if (!progress || !runState) return;
  if (progress.event === 'variants') {
    runState.masterDone = true;
    runState.variants = progress.codes.map(code => ({code, state: 'queued', text: ''}));
    runState.log.push(`${progress.codes.length} variant${progress.codes.length === 1 ? '' : 's'} found.`);
  } else if (progress.event === 'variant-done') {
    let variant = runState.variants.find(item => item.code === progress.code);
    if (!variant) { variant = {code: progress.code}; runState.variants.push(variant); }
    variant.state = progress.ok ? 'done' : 'failed';
    variant.text = progress.ok ? '' : progress.message || '';
    runState.log.push(`${progress.code}: ${progress.ok ? 'Ready' : `Needs attention${progress.message ? ` — ${progress.message}` : ''}`}`);
  } else if (progress.round) {
    const text = progress.did ? `Completed: ${actionLabel(progress.did)}` : progress.message || (progress.state === 'click-wait' ? 'Waiting for LearnCraft to respond' : '');
    if (text) runState.log.push(`${progress.code || 'Master Canvas'}: ${text}`);
    if (progress.queue > 0) {
      let variant = runState.variants.find(item => item.code === progress.code);
      if (!variant) { variant = {code: progress.code, state: 'queued'}; runState.variants.push(variant); }
      if (variant.state !== 'done' && variant.state !== 'failed') { variant.state = 'working'; variant.text = text; }
    } else {
      runState.masterText = text;
    }
  }
  drawRun();
}
function startElapsedTimer() {
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    const elapsed = $run.querySelector('[data-q=elapsed]');
    if (elapsed && runState) elapsed.textContent = formatElapsed(Date.now() - runState.startedAt);
  }, 1000);
}
function finishRun(result, dryRun) {
  if (!runState || runState.completed) return;
  runState.message = result.message || (result.ok ? 'Done.' : 'Stopped.');
  if (dryRun) {
    const planned = Array.isArray(result.planned) ? result.planned : result.planned ? [result.planned] : [];
    runState.masterDone = result.state === 'done';
    runState.masterText = planned.length ? `Would click: ${planned.map(actionLabel).join(' → ')}` : result.message || 'No click is planned.';
    runState.variants = (result.variants || []).map(variant => ({code: typeof variant === 'string' ? variant : variant.code, state: 'queued', text: 'Would be updated'}));
    runState.summary = `Preview only. Nothing was clicked.${runState.variants.length ? ` ${runState.variants.length} variant${runState.variants.length === 1 ? '' : 's'} would be updated.` : ''}`;
  } else {
    const outcomes = result.results || [];
    const ready = outcomes.filter(item => item.ok).length;
    const failed = outcomes.length - ready;
    runState.summary = result.ok
      ? `${ready} variant${ready === 1 ? '' : 's'} ready; ${failed} need attention.`
      : `Run stopped or did not finish. ${ready} variant${ready === 1 ? '' : 's'} ready; ${failed} need attention. Check the course by hand.`;
    if (runState.message) runState.log.push(runState.message);
  }
  runState.completed = true;
  runState.statusText = `${dryRun ? 'Preview' : 'Run'} ${result.ok ? 'finished' : 'stopped'}: ${result.message || result.state || ''}`;
  running = false;
  stopping = false;
  activeReqId = null;
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  $closeReady.disabled = false;
  renderCourses(cachedRows);
  $status.textContent = runState.statusText;
  $refresh.disabled = false;
  drawRun();
}
function restoreRun(snapshot) {
  if (!snapshot) return;
  activeReqId = snapshot.reqId;
  activeCode = snapshot.code;
  running = !!snapshot.active;
  stopping = false;
  runState = {masterText: '', masterDone: false, variants: [], message: '', summary: '', log: [], startedAt: snapshot.startedAt, dryRun: snapshot.dryRun, completed: false, statusText: ''};
  for (const progress of snapshot.progress || []) applyProgress(progress);
  if (snapshot.result) {
    finishRun(snapshot.result, snapshot.dryRun);
    return;
  }
  runState.statusText = `Working on ${activeCode}…`;
  $refresh.disabled = running;
  $closeReady.disabled = running;
  if (running) startElapsedTimer();
  renderCourses(cachedRows);
  $status.textContent = runState.statusText;
  drawRun();
}
async function run(tabId, code, dryRun, variantCodes) {
  if (running) return;
  running = true;
  activeCode = code;
  stopping = false;
  activeReqId = `popup-${Date.now()}-${++requestNumber}`;
  runState = {masterText: '', masterDone: false, variants: [], message: '', summary: '', log: [], startedAt: Date.now(), dryRun, completed: false};
  runState.statusText = dryRun ? `Previewing ${code}…` : `Working on ${code}…`;
  $status.textContent = runState.statusText;
  renderCourses(cachedRows);
  $closeReady.disabled = true;
  $refresh.disabled = true;
  drawRun();
  startElapsedTimer();
  try {
    const result = await request({ns: 'pl-lc-popup', action: 'golive', tabId: Number(tabId), code, reqId: activeReqId, dryRun, closeDone: $closeReady.checked, variantCodes});
    finishRun(result, dryRun);
  } catch (error) {
    runState.message = error.message;
    runState.summary = 'Run did not finish. Check the course by hand.';
    runState.log.push(runState.message);
    runState.statusText = `Could not complete the run: ${error.message}`;
    runState.completed = true;
    running = false;
    stopping = false;
    activeReqId = null;
    $closeReady.disabled = false;
    renderCourses(cachedRows);
    $status.textContent = runState.statusText;
    drawRun();
  } finally {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
    $refresh.disabled = false;
  }
}
$courses.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const tabId = Number(button.dataset.tab);
  if (button.dataset.action === 'toggle-variants') {
    if (openVariantPickers.has(tabId)) openVariantPickers.delete(tabId);
    else openVariantPickers.add(tabId);
    renderCourses(cachedRows);
  }
  if (button.dataset.action === 'select-all-variants') {
    excludedVariants.delete(tabId);
    renderCourses(cachedRows);
  }
  if (button.dataset.action === 'clear-variants') {
    const row = cachedRows.find(item => item.tabId === tabId);
    excludedVariants.set(tabId, new Set(row && row.probe && row.probe.variantCodes || []));
    renderCourses(cachedRows);
  }
  if (button.dataset.action === 'confirm') {
    const row = cachedRows.find(item => item.tabId === tabId);
    const excluded = excludedVariants.get(tabId) || new Set();
    const variantCodes = (row && row.probe && row.probe.variantCodes || []).filter(code => !excluded.has(code));
    showConfirmation(tabId, button.dataset.code, variantCodes);
  }
});
$courses.addEventListener('change', event => {
  const input = event.target.closest('input[data-action="variant-choice"]');
  if (!input) return;
  const tabId = Number(input.dataset.tab), excluded = excludedVariants.get(tabId) || new Set();
  if (input.checked) excluded.delete(input.value);
  else excluded.add(input.value);
  excludedVariants.set(tabId, excluded);
  const row = cachedRows.find(item => item.tabId === tabId);
  const codes = row && row.probe && row.probe.variantCodes || [];
  const selectedCount = codes.filter(code => !excluded.has(code)).length;
  const count = $courses.querySelector(`[data-selected-count="${tabId}"]`);
  const summary = $courses.querySelector(`[data-variant-count="${tabId}"]`);
  if (count) count.textContent = `${selectedCount}/${codes.length}`;
  if (summary) summary.textContent = `${selectedCount} of ${codes.length} variants selected`;
});
$confirmDialog.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'cancel-confirm') {
    pendingRun = null;
    $confirmDialog.close();
  }
  if (button.dataset.action === 'start') {
    const selected = pendingRun;
    $confirmDialog.close();
    pendingRun = null;
    if (selected) run(selected.tabId, selected.code, false, selected.variantCodes);
  }
});
$run.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'copy-log') {
    try {
      await navigator.clipboard.writeText(runState.log.join('\n'));
      button.textContent = 'Copied';
      $status.textContent = 'Run log copied to clipboard.';
    } catch (error) {
      button.textContent = 'Copy failed';
      button.title = error.message;
      $status.textContent = `Could not copy run log: ${error.message}`;
    }
    return;
  }
  if (button.dataset.action !== 'stop' || !activeReqId) return;
  stopping = true;
  drawRun();
  request({ns: 'pl-lc-popup', action: 'cancel', reqId: activeReqId}).catch(error => {
    stopping = false;
    runState.message = `Could not stop the run: ${error.message}`;
    drawRun();
  });
});
chrome.runtime.onMessage.addListener(message => {
  if (message && message.ns === 'pl-lc-popup-progress' && message.id === activeReqId) applyProgress(message.progress);
  if (message && message.ns === 'pl-lc-popup-finished' && message.id === activeReqId) finishRun(message.result, !!(runState && runState.dryRun));
});
async function initialize() {
  let restoreError = '';
  $closeReady.disabled = true;
  try {
    const stored = await chrome.storage.local.get(CLOSE_READY_KEY);
    if (typeof stored[CLOSE_READY_KEY] === 'boolean') $closeReady.checked = stored[CLOSE_READY_KEY];
  } catch (error) {
    restoreError = `Could not restore this option: ${error.message}`;
  }
  try { restoreRun(await request({ns: 'pl-lc-popup', action: 'get-run'})); }
  catch (error) { restoreError = `${restoreError ? `${restoreError} ` : ''}Could not restore previous run status: ${error.message}`; }
  if (!running) $closeReady.disabled = false;
  await refresh(false, true);
  if (restoreError) $status.textContent = restoreError;
}
$refresh.addEventListener('click', () => refresh(true));
$closeReady.addEventListener('change', async () => {
  try { await chrome.storage.local.set({[CLOSE_READY_KEY]: $closeReady.checked}); }
  catch (error) { $status.textContent = `Could not save this option: ${error.message}`; }
});
initialize();
