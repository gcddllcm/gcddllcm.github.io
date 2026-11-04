// Penguin Logistics - LearnCraft bridge (service worker).
// It lists LearnCraft tabs, reads course structure, and runs the requested course workflow.
// It only touches https://craft.learn.co.th/* tabs and accepts requests from its popup or your own Penguin Logistics page.
const HOST = 'craft.learn.co.th';
const POPUP_URL = chrome.runtime.getURL('popup.html');
const POPUP_RUN_KEY = 'plLcPopupRun';
const DEFAULT_ACTION_TITLE = 'Ultimate Go Live';
const MASTER_CODE_RE = /^(?:[A-Z]+)?\d+-V\d+[A-Za-z]*$/;
// Only these Penguin Logistics pages may talk to this extension. Keep in step with content_scripts.matches in manifest.json.
// Hosting the site somewhere else? Add its origin to both places (see README.txt).
const ALLOWED_ORIGINS = [/^https:\/\/gcddllcm\.github\.io$/, /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/];
const fromAllowedPage = s => { try { return !!(s && s.tab && ALLOWED_ORIGINS.some(r => r.test(new URL(s.url).origin))); } catch { return false; } };
const fromPopup = s => s && s.id === chrome.runtime.id && s.url === POPUP_URL;
const fromCourseTab = s => { try { return !!(s && s.tab && new URL(s.url).hostname === HOST); } catch { return false; } };

const jobs = new Map();       // request id -> course tab and the page or popup that started the job
const busyTabs = new Set();   // course tabs that are being read right now
let popupRunState = null;
let popupRunWrite = Promise.resolve();
let popupActionWrite = Promise.resolve();

function setPopupActionStatus(code, progress = null) {
  let detail = 'Starting';
  if (progress && progress.event === 'variants') {
    detail = `Master ready; ${progress.codes.length} variants queued`;
  } else if (progress && progress.event === 'variant-done') {
    detail = `${progress.code}: ${progress.ok ? 'Ready' : 'Needs attention'}`;
  } else if (progress) {
    detail = progress.did
      ? `Clicked ${progress.did}`
      : progress.message || progress.state || 'Working';
  }
  const currentCode = progress && progress.code ? progress.code : 'Master Canvas';
  const title = `Go Live · ${code} · ${currentCode} · ${detail}`.replace(/\s+/g, ' ').trim().slice(0, 75);
  popupActionWrite = popupActionWrite.then(async () => {
    await chrome.action.setBadgeBackgroundColor({color: '#B4233D'});
    await chrome.action.setBadgeText({text: 'RUN'});
    await chrome.action.setTitle({title});
  }).catch(error => {
    console.warn('Could not update the Go Live extension badge:', error);
  });
  return popupActionWrite;
}

function clearPopupActionStatus() {
  popupActionWrite = popupActionWrite.then(async () => {
    await chrome.action.setBadgeText({text: ''});
    await chrome.action.setTitle({title: DEFAULT_ACTION_TITLE});
  }).catch(error => {
    console.warn('Could not clear the Go Live extension badge:', error);
  });
  return popupActionWrite;
}

function persistPopupRun(snapshot) {
  popupRunState = snapshot;
  popupRunWrite = popupRunWrite.then(() => chrome.storage.local.set({[POPUP_RUN_KEY]: snapshot})).catch(error => {
    console.warn('Could not save popup run status:', error);
  });
  return popupRunWrite;
}

async function getPopupRun() {
  if (!popupRunState) {
    const stored = await chrome.storage.local.get(POPUP_RUN_KEY);
    popupRunState = stored[POPUP_RUN_KEY] || null;
  }
  if (popupRunState && popupRunState.active && !jobs.has(popupRunState.reqId)) {
    popupRunState.active = false;
    popupRunState.result = {
      ok: false,
      state: 'interrupted',
      message: 'The extension stopped before this run finished. Check the course by hand.',
      dryRun: popupRunState.dryRun,
      log: [],
      results: [],
      elapsedMs: Date.now() - popupRunState.startedAt,
    };
    await persistPopupRun(popupRunState);
    await clearPopupActionStatus();
  }
  return popupRunState;
}

async function clearPopupRun() {
  const clear = popupRunWrite.then(() => chrome.storage.local.remove(POPUP_RUN_KEY));
  popupRunWrite = clear.catch(error => {
    console.warn('Could not clear popup run status:', error);
  });
  await clear;
  popupRunState = null;
  await clearPopupActionStatus();
}

chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (!m || sender.id !== chrome.runtime.id) return;
  if (m.ns === 'pl-lc-tick') {            // progress sent by the script running inside the course tab
    const job = jobs.get(m.job);
    if (job && fromCourseTab(sender) && sender.tab.id === job.tabId) {
      const progress = {id: m.job, progress: m.progress};
      if (job.popup) {
        chrome.runtime.sendMessage({ns: 'pl-lc-popup-progress', ...progress}).catch(() => {});
      } else {
        chrome.tabs.sendMessage(job.pageTabId, {ns: 'pl-lc-progress', ...progress}).catch(() => cancelJob(m.job));
      }
    }
    return;
  }
  const popup = m.ns === 'pl-lc-popup' && fromPopup(sender);
  if ((!popup && m.ns !== 'pl-lc') || (!popup && !fromAllowedPage(sender))) return;   // anything else (including other web pages) is ignored
  const task = popup ? handlePopup(m, sender) : handle(m, sender);
  task.then(data => send({ok: true, data}), err => send({ok: false, error: String((err && err.message) || err)}));
  return true;   // answer arrives asynchronously
});

const withTimeout = (p, ms) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
};
async function run(tabId, func, args) {
  const spec = {target: {tabId}, func};
  if (args) spec.args = args;
  const [r] = await chrome.scripting.executeScript(spec);
  return r ? r.result : null;
}
// Tells the script that is running inside the course tab to stop (the page gave up, the tab of the page closed, or it timed out).
function cancelJob(reqId) {
  const job = jobs.get(reqId);
  if (!job || job.cancelled) return;
  job.cancelled = true;
  chrome.scripting.executeScript({target: {tabId: job.tabId}, args: [reqId], func: id => { const f = globalThis.__plLcCancel = globalThis.__plLcCancel || {}; f[id] = true; }}).catch(() => {});
}

async function activateCourseTab(reqId) {
  const job = jobs.get(reqId);
  if (!job || job.cancelled) return false;
  try {
    const [pageTab, focusedWindow] = await Promise.all([
      chrome.tabs.get(job.pageTabId),
      chrome.windows.getLastFocused(),
    ]);
    if (!pageTab.active || focusedWindow.id !== job.pageWindowId || job.cancelled) return false;
    await chrome.tabs.update(job.tabId, {active: true});
    job.switchedToCourse = true;
    await chrome.windows.update(job.courseWindowId, {focused: true});
    return true;
  } catch (e) {
    console.warn('Could not switch to the LearnCraft tab:', e);
    return false;
  }
}

async function restorePageTab(job, force = false) {
  if (!job.switchedToCourse && !force) return;
  try {
    if (!force) {
      const [courseTab, focusedWindow] = await Promise.all([
        chrome.tabs.get(job.tabId),
        chrome.windows.getLastFocused(),
      ]);
      if (!courseTab.active || focusedWindow.id !== job.courseWindowId) return;
    }
    await chrome.tabs.update(job.pageTabId, {active: true});
    await chrome.windows.update(job.pageWindowId, {focused: true});
  } catch (e) {
    console.warn('Could not return to the Penguin Logistics tab:', e);
  }
}

async function handle(m, sender) {
  if (m.action === 'list') return listTabs();
  if (m.action === 'golive') return runGoLive(m, sender);
  if (m.action === 'list-timestamp-assets') return listTimestampAssets(m);
  if (m.action === 'fill-timestamps') return fillTimestamps(m, sender);
  if (m.action === 'cancel') {
    const job = typeof m.reqId === 'string' ? jobs.get(m.reqId) : null;
    if (job && job.pageTabId === sender.tab.id) cancelJob(m.reqId);
    return true;
  }
  if (m.action === 'extract') {
    const tabId = Number(m.tabId), reqId = typeof m.reqId === 'string' ? m.reqId.slice(0, 80) : '';
    if (!Number.isInteger(tabId) || !reqId) throw new Error('Bad request.');
    const tab = await chrome.tabs.get(tabId);
    const u = tab && tab.url ? new URL(tab.url) : null;
    if (!u || u.protocol !== 'https:' || u.hostname !== HOST) throw new Error('That tab is not a LearnCraft tab any more.');
    if (tab.discarded || tab.status !== 'complete') throw new Error('The tab is still loading or asleep. Open it once, wait until it finishes, then try again.');
    if (busyTabs.has(tabId)) throw new Error('This tab is already being read. Wait for it to finish.');
    busyTabs.add(tabId);
    const job = {
      tabId,
      pageTabId: sender.tab.id,
      pageWindowId: sender.tab.windowId,
      courseWindowId: tab.windowId,
      cancelled: false,
      switchedToCourse: false,
      activationTimer: null,
      activationPromise: null,
    };
    jobs.set(reqId, job);
    job.activationTimer = setTimeout(() => {
      job.activationPromise = activateCourseTab(reqId);
    }, 3000);
    try {
      // Leave time for very large courses; lcExtract has its own bounded scan time.
      const res = await withTimeout(run(tab.id, lcExtract, [reqId]), 270000);
      if (!res) throw new Error('The tab did not answer.');
      return res;
    } catch (e) {
      cancelJob(reqId);   // timeout or a closed tab: do not leave the script clicking in the background
      throw e;
    } finally {
      clearTimeout(job.activationTimer);
      if (job.activationPromise) await job.activationPromise;
      await restorePageTab(job);
      busyTabs.delete(tabId);
      setTimeout(() => jobs.delete(reqId), 5000);
    }
  }
  throw new Error('Unknown action');
}

async function handlePopup(m, sender) {
  if (m.action === 'list') return listTabs();
  if (m.action === 'get-run') return getPopupRun();
  if (m.action === 'clear-run') {
    const run = await getPopupRun();
    if (run && run.active) throw new Error('Wait for the current run to finish before refreshing.');
    await clearPopupRun();
    return true;
  }
  if (m.action === 'golive') return runGoLive(m, sender, true);
  if (m.action === 'cancel') {
    const job = typeof m.reqId === 'string' ? jobs.get(m.reqId) : null;
    if (job && job.popup) cancelJob(m.reqId);
    return true;
  }
  throw new Error('Unknown popup action');
}

async function listTabs() {
  const tabs = await chrome.tabs.query({url: 'https://' + HOST + '/*'});
  return Promise.all(tabs.map(async tab => {
    const u = new URL(tab.url);
    const m = /^\/master-canvas\/([^/]+)\/([^/]+)\/?([^/]*)/.exec(u.pathname);
    const candidateCode = m ? decodeURIComponent(m[2]) : null;
    const code = candidateCode && MASTER_CODE_RE.test(candidateCode) ? candidateCode : null;
    const row = {
      tabId: tab.id, windowId: tab.windowId, active: tab.active, title: tab.title || '', url: tab.url,
      status: tab.status, discarded: !!tab.discarded, route: m ? m[1] : null, code, page: code ? (m[3] || '') : null,
      probe: null,
    };
    if (!tab.discarded && tab.status === 'complete') {
      try { row.probe = await withTimeout(run(tab.id, lcProbe), 4000); } catch (e) { row.probeError = String((e && e.message) || e); }
    }
    return row;
  }));
}

// ---------------------------------------------------------------------------
// The two functions below are INJECTED into the LearnCraft tab, so each must be fully self-contained.

// Is the tab logged in, and as whom? Best effort: LearnCraft does not show the address on the page.
async function lcProbe() {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
  const out = {path: location.pathname, hasCanvas: false, loggedIn: null, email: null, emailFrom: null, courseTitle: null, kindLabel: null, courseStatus: null, variantCount: 0, variantCodes: []};
  const h4 = document.querySelector('h4');
  out.courseTitle = h4 ? clean(h4.textContent) : null;
  const chip = document.querySelector('.MuiChip-label');
  out.kindLabel = chip ? clean(chip.textContent) : null;
  out.hasCanvas = [...document.querySelectorAll('span,div,h6,p')].some(e => !e.children.length && clean(e.textContent) === 'Course Canvas');
  const status = [...document.querySelectorAll('h6')].find(h =>
    h.getClientRects().length > 0 && /^(draft|ready|alert|approving)$/.test(clean(h.textContent)));
  out.courseStatus = status ? clean(status.textContent).toLowerCase() : null;
  const variants = new Set();
  for (const a of document.querySelectorAll('a[href*="/course-variant/normal/"]')) {
    const url = new URL(a.getAttribute('href'), location.href);
    const m = /^\/course-variant\/normal\/([^/]+)\/overview\/?$/.exec(url.pathname);
    if (m) variants.add(decodeURIComponent(m[1]));
  }
  out.variantCount = variants.size;
  out.variantCodes = [...variants];

  const fromJson = (v, d = 0) => {
    if (v == null || typeof v !== 'object' || d > 4) return null;
    if (typeof v.email === 'string' && RE.test(v.email)) return v.email;
    for (const k in v) { const r = fromJson(v[k], d + 1); if (r) return r; }
    return null;
  };
  // 1) what the site keeps in this browser (e.g. its sign-in session)
  for (const st of [localStorage, sessionStorage]) {
    try {
      for (let i = 0; i < st.length && !out.email; i++) {
        const v = st.getItem(st.key(i));
        if (!v || v.length > 200000) continue;
        let j = null; try { j = JSON.parse(v); } catch {}
        const e = j ? fromJson(j) : (v.length < 200 && RE.test(v) ? RE.exec(v)[0] : null);
        if (e) { out.email = e; out.emailFrom = 'storage'; }
      }
    } catch {}
  }
  // 2) Firebase keeps its session in IndexedDB (only opened if it already exists)
  if (!out.email && indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      if (dbs.some(d => d.name === 'firebaseLocalStorageDb')) {
        out.email = await new Promise(res => {
          const r = indexedDB.open('firebaseLocalStorageDb');
          r.onerror = () => res(null);
          r.onsuccess = () => {
            try {
              const db = r.result;
              if (!db.objectStoreNames.contains('firebaseLocalStorage')) { db.close(); return res(null); }
              const q = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
              q.onsuccess = () => { db.close(); let e = null; for (const row of q.result) { e = fromJson(row && row.value); if (e) break; } res(e); };
              q.onerror = () => { db.close(); res(null); };
            } catch { res(null); }
          };
        });
        if (out.email) out.emailFrom = 'storage';
      }
    } catch {}
  }
  // 3) an address shown in the page header (avatar tooltip etc.)
  if (!out.email) {
    const bar = document.querySelector('header,.MuiAppBar-root');
    if (bar) {
      const bits = [bar.innerText || '', ...[...bar.querySelectorAll('[aria-label],[title],img[alt]')].map(e => e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('alt') || '')];
      for (const b of bits) { const m = RE.exec(b); if (m) { out.email = m[0]; out.emailFrom = 'page'; break; } }
    }
  }
  const loginPath = /(^|\/)(login|signin|sign-in|auth)(\/|$)/i.test(location.pathname);
  const googleBtn = /sign in with google|continue with google|log ?in with google/i.test((document.body && document.body.innerText || '').slice(0, 5000));
  out.loggedIn = (loginPath || googleBtn) ? false : (out.hasCanvas || out.email ? true : null);
  return out;
}

// Reads the course overview page: type, parts, sections, missions (Eggspace), subsections, assets and every time shown.
// Collapsed parts, sections and missions are opened first, so the user does not have to click them by hand.
async function lcExtract(job) {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  // Progress goes to the background script (max 4 per second), which relays it to the Penguin Logistics page.
  let lastTick = 0;
  const tick = (progress, force) => {
    const now = Date.now();
    if (!force && now - lastTick < 250) return;
    lastTick = now;
    try { const r = chrome.runtime.sendMessage({ns: 'pl-lc-tick', job, progress}); if (r && r.catch) r.catch(() => {}); } catch {}
  };
  const cancelled = () => !!(globalThis.__plLcCancel && globalThis.__plLcCancel[job]);
  tick({phase: 'metadata'}, true);
  const TIME = /^\d{1,3}:\d{2}(?::\d{2})?$/;
  const res = {ok: false, warnings: [], opened: 0};

  const findCard = () => {
    const label = [...document.querySelectorAll('span,div,h6,p')].find(e => !e.children.length && clean(e.textContent) === 'Course Canvas');
    return label && label.closest('.MuiCard-root');
  };
  let card = findCard();
  if (!card) { res.error = 'no-canvas'; return res; }

  // ---- course info (Mui* class names are stable; the mui-xxxx hash classes are not, so they are never used) ----
  const meta = {url: location.href};
  const h4 = document.querySelector('h4');
  const title = clean(h4 && h4.textContent);
  const tm = /^\[([^\]]+)\]\s*(.*)$/.exec(title);
  meta.code = tm ? tm[1] : ((/\/master-canvas\/[^/]+\/([^/]+)/.exec(location.pathname) || [])[1] || '');
  meta.name = tm ? tm[2] : title;
  const chip = document.querySelector('.MuiChip-label');
  meta.kindLabel = clean(chip && chip.textContent);
  // The chip is the reliable signal: "คอร์สตั้งไข่" (ไข่ = egg) is Eggspace. The URL route is "normal" for both kinds, so it is not used.
  if (/ดั้งเดิม|traditional/i.test(meta.kindLabel)) meta.kind = 'traditional';
  else if (/ตั้งไข่|ไข่|egg/i.test(meta.kindLabel)) meta.kind = 'eggspace';
  else meta.kind = 'unknown';
  const h6s = [...document.querySelectorAll('h6')];
  const st = h6s.find(h => /^[a-z][a-z ]{1,20}$/.test(clean(h.textContent)));
  meta.status = st ? clean(st.textContent) : '';
  const lu = h6s.find(h => clean(h.textContent) === 'Last Update:');
  meta.lastUpdate = lu ? [...lu.parentElement.querySelectorAll('h6')].filter(h => h !== lu).map(h => clean(h.textContent)).join(' ') : '';
  const details = {};
  for (const k of ['Course no.', 'Course name', 'Course no. relate with', 'Course version', 'Authors', 'Permalink', 'Note']) {
    const h = h6s.find(x => clean(x.textContent) === k);
    const p = h && h.parentElement.querySelector('p');
    if (p) details[k] = clean(p.textContent);
  }
  meta.details = details;
  meta.version = details['Course version'] || '';
  meta.authors = details['Authors'] || '';
  const courseCode = /^(?:[A-Z]+)?\d+-V\d+[A-Za-z]*$/;
  meta.variants = [...new Set([...document.querySelectorAll('a p')].map(p => clean(p.textContent)).filter(x => courseCode.test(x)))];

  // ---- the canvas: parts and sections are h5 (depth tells which); Eggspace missions are h6 titles with a mission chip ----
  const depthIn = (e, c) => { let d = 0; for (let n = e; n && n !== c; n = n.parentElement) d++; return d; };
  const isMission = e => {
    if (e.tagName !== 'H6' || !e.classList.contains('MuiTypography-h6')) return false;
    const row = e.parentElement;
    const chipEl = row && row.querySelector('.MuiChip-label');
    return !!chipEl && /ภารกิจ|mission/i.test(clean(chipEl.textContent));
  };
  // Duration shown for a mission: the first time-looking leaf in its header.
  const durationNear = e => {
    for (let a = e.parentElement, i = 0; a && i < 4; a = a.parentElement, i++) {
      const t = [...a.querySelectorAll('p,span')].find(x => !x.children.length && TIME.test(clean(x.textContent)));
      if (t) return clean(t.textContent);
      if (a.querySelector('h5')) break;
    }
    return null;
  };
  const itemsOf = c => [...c.querySelectorAll('h5, h6')].filter(e => e.tagName === 'H5' || isMission(e));
  const base3 = ['part', 'section', 'subsection'], base4 = ['part', 'section', 'mission', 'subsection'];
  const RANK = {part: 0, section: 1, mission: 2, subsection: 3};
  // The level of each h5 comes from its depth among the h5s on the page. Recomputed every pass, because
  // subsections (and their depth) may only appear once their parent is opened.
  const ctxOf = (items = itemsOf(card)) => {
    const depths = [...new Set(items.filter(h => h.tagName === 'H5').map(h => depthIn(h, card)))].sort((a, b) => a - b);
    let names;
    if (depths.length >= 4) names = base4.concat(depths.slice(4).map((_, i) => 'level' + (i + 5)));
    else if (depths.length === 3) names = base3;
    else names = base3.slice(0, depths.length);
    const nameOf = e => e.tagName === 'H6' ? 'mission' : names[depths.indexOf(depthIn(e, card))];
    const rankOf = e => { const n = nameOf(e); return RANK[n] != null ? RANK[n] : 4 + depths.indexOf(depthIn(e, card)); };
    return {depths, names, nameOf, rankOf};
  };
  let C = ctxOf();

  // ---- open whatever is collapsed ----
  // A heading is open when the next heading ranks deeper than it, or (subsection only) when its own block holds an asset row.
  // Clicking an open heading would close it, so a heading is only clicked when it looks closed, and only once.
  const scopeOf = h => { let a = h; while (a.parentElement && a.parentElement !== card && a.parentElement.querySelectorAll('h5').length === 1) a = a.parentElement; return a; };
  const isOpen = (items, i) => {
    const h = items[i], nxt = items[i + 1];
    // Prefer explicit disclosure state when LearnCraft exposes it.
    const disclosure = h.matches('[aria-expanded]') ? h : h.closest('[aria-expanded]');
    if (disclosure) return disclosure.getAttribute('aria-expanded') === 'true';
    const details = h.closest('details');
    if (details) return details.open;
    if (nxt && C.rankOf(nxt) > C.rankOf(h)) return true;
    if (C.rankOf(h) === RANK.subsection) return !!scopeOf(h).querySelector('nav li');
    return false;
  };
  // Resolves once the page stops changing for `quiet` ms (or after `max` ms).
  const settle = (el, onMutation, quiet = 140, max = 4000) => new Promise(done => {
    let t = null, cap = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true; obs.disconnect(); clearTimeout(t); clearTimeout(cap); clearInterval(cancelPoll); done();
    };
    const isHeading = heading => heading.tagName === 'H5' || isMission(heading);
    const hasHeading = node => node.nodeType === 1 && (isHeading(node) || [...node.querySelectorAll('h5,h6')].some(isHeading));
    const addsHeading = record => {
      const added = [...record.addedNodes];
      if (added.some(hasHeading)) return true;
      if (!added.some(node => node.nodeType === 1 && (node.matches('.MuiChip-label') || node.querySelector('.MuiChip-label')))) return false;
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return !!target && [...target.querySelectorAll('h6')].some(isMission);
    };
    const obs = new MutationObserver(records => {
      if (cancelled()) { finish(); return; }
      if (records.some(addsHeading)) onMutation();
      clearTimeout(t); t = setTimeout(finish, quiet);
    });
    obs.observe(el, {childList: true, subtree: true});
    onMutation();
    t = setTimeout(finish, quiet);
    cap = setTimeout(finish, max);
    const cancelPoll = setInterval(() => { if (cancelled()) finish(); }, 25);
  });
  const clicked = new WeakSet();
  const started = Date.now();
  let timedOut = false, pass = 0, attempted = 0;
  const countOpen = list => { let c = 0; for (let i = 0; i < list.length; i++) if (isOpen(list, i)) c++; return c; };
  const scanAndOpen = () => {
    if (cancelled()) return 0;
    card = findCard() || card;
    const items = itemsOf(card);
    C = ctxOf(items);
    pass++;
    const confirmed = countOpen(items);
    tick({phase: 'opening', pass, opened: confirmed, attempted, headings: items.length}, true);
    let n = 0, last = '';
    for (let i = 0; i < items.length; i++) {
      if (cancelled()) break;
      const h = items[i];
      if (clicked.has(h) || isOpen(items, i)) continue;
      clicked.add(h); n++; attempted++; last = clean(h.textContent); h.click();
    }
    if (n) {
      res.opened += n;
      tick({phase: 'waiting', pass, opened: confirmed, attempted, headings: items.length, current: last.slice(0, 80)}, true);
    }
    return n;
  };
  // Keep discovering newly rendered headings until a scan finds nothing left to open.
  // The time bound protects against a page that continually changes or never settles.
  let opened = scanAndOpen();
  while (opened && !cancelled() && Date.now() - started < 240000) {
    await settle(card, scanAndOpen);
    card = findCard() || card;
    if (Date.now() - started >= 240000) timedOut = true;
    opened = scanAndOpen();
  }
  if (cancelled()) { res.error = 'cancelled'; return res; }
  const finalItems = itemsOf(card);
  C = ctxOf(finalItems);
  const confirmed = finalItems.reduce((count, heading, index) => count + (isOpen(finalItems, index) ? 1 : 0), 0);
  const unconfirmed = finalItems.map((heading, index) => ({heading, index}))
    .filter(item => !isOpen(finalItems, item.index))
    .map(({heading, index}) => ({index, level: C.nameOf(heading), title: clean(heading.textContent)}));
  res.completeness = {complete: !timedOut && confirmed === finalItems.length, confirmed, total: finalItems.length, unconfirmed};
  if (timedOut) res.warnings.push('Stopped opening headings after 4 minutes. The result may be incomplete.');

  // ---- course type, warnings and levels, from the page as it is now ----
  const hasMissions = finalItems.some(e => e.tagName === 'H6');
  if (meta.kind === 'traditional' && C.depths.length >= 4) res.warnings.push('This is a Traditional course but the page has ' + C.depths.length + ' levels. Check the result.');
  if (meta.kind === 'unknown') { meta.kind = (C.depths.length >= 4 || hasMissions) ? 'eggspace' : 'traditional'; res.warnings.push('Course type was not recognised from the page; guessed from its structure.'); }
  if (!card.querySelector('h5') && !finalItems.length) { res.error = 'no-structure'; return res; }   // the page layout is not what this reader expects
  // Eggspace: missions sit between sections and subsections
  const levels = (hasMissions && C.names === base3) ? ['part', 'section', 'mission', 'subsection'] : C.names;

  // ---- build the tree in document order: a heading belongs to the nearest open heading above it with a lower rank ----
  const root = [], stack = [];
  const finalList = itemsOf(card);
  let assetCount = 0;
  tick({phase: 'reading', stage: 'structure', heading: 0, headings: finalList.length, assets: 0}, true);
  finalList.forEach((h, hi) => {
    const isLeaf = C.rankOf(h) === RANK.subsection;
    const node = {sourceIndex: hi, level: C.nameOf(h), title: clean(h.textContent), duration: null, children: [], assets: []};
    if (h.tagName === 'H6') node.duration = durationNear(h);
    else { const p = h.parentElement && h.parentElement.querySelector('p'); if (p && TIME.test(clean(p.textContent))) node.duration = clean(p.textContent); }
    while (stack.length && stack[stack.length - 1].rank >= C.rankOf(h)) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : root).push(node);
    stack.push({rank: C.rankOf(h), node});
    if (isLeaf) {                                             // subsection: read its assets
      const scope = scopeOf(h);
      for (const nav of [...scope.querySelectorAll('nav')].filter(n => n.querySelector('li'))) {
        let row = nav;
        while (row.parentElement && row.parentElement !== scope && row.parentElement.querySelectorAll('nav').length === 1) row = row.parentElement;
        const titleEl = nav.parentElement.querySelector('h6');
        const a = {type: clean(nav.querySelector('li').textContent), title: clean(titleEl && titleEl.textContent), version: '', time: null, detail: [], href: '', sourceIndex: hi, assetIndex: node.assets.length};
        for (const t of [...row.querySelectorAll('h6')].filter(x => x !== titleEl).map(x => clean(x.textContent))) {
          if (!t || t === 'Label Duration:') continue;
          if (/^Ver\.?\s*\d/i.test(t)) a.version = t;
          else if (TIME.test(t) && a.time === null) a.time = t;
          else a.detail.push(t);
        }
        const link = row.querySelector('a[href]');
        if (link) a.href = new URL(link.getAttribute('href'), location.origin).href;
        node.assets.push(a); assetCount++;
      }
    }
    tick({phase: 'reading', stage: isLeaf ? 'assets' : 'structure', heading: hi + 1, headings: finalList.length, assets: assetCount});
  });
  res.ok = true; res.meta = meta; res.levels = levels; res.tree = root;
  return res;
}

async function listTimestampAssets(m) {
  const tabId = Number(m.tabId), courseCode = typeof m.courseCode === 'string' ? m.courseCode : '';
  if (!Number.isInteger(tabId) || !courseCode) throw new Error('Bad Timestamp Maker asset-list request.');
  const tab = await chrome.tabs.get(tabId);
  const url = tab?.url ? new URL(tab.url) : null;
  const match = url && /^\/master-canvas\/[^/]+\/([^/]+)\/?/.exec(url.pathname);
  if (!url || url.protocol !== 'https:' || url.hostname !== HOST || !match || decodeURIComponent(match[1]) !== courseCode) {
    throw new Error('That tab is not the selected Master Canvas any more.');
  }
  if (tab.discarded || tab.status !== 'complete') throw new Error('The LearnCraft tab is still loading or asleep. Open it once, wait until it finishes, then try again.');
  if (busyTabs.has(tabId)) throw new Error('This tab is already being read. Wait for it to finish.');
  busyTabs.add(tabId);
  // Lazy cover images only load for a visible tab, so show the course tab while it is read and put the previous tab back afterwards.
  let previousTabId = null;
  try {
    const [current] = await chrome.tabs.query({active: true, windowId: tab.windowId});
    if (current && current.id !== tabId) {
      previousTabId = current.id;
      await chrome.tabs.update(tabId, {active: true});
    }
  } catch (e) {
    previousTabId = null;
  }
  try {
    const result = await withTimeout(run(tabId, lcListTimestampAssets, [courseCode]), 120000);
    if (!result || result.ok !== true || !Array.isArray(result.assets) || !Array.isArray(result.tree)) {
      throw new Error('The LearnCraft page did not return an asset list. Reload the extension and refresh this page.');
    }
    return result;
  } finally {
    if (previousTabId !== null) chrome.tabs.update(previousTabId, {active: true}).catch(() => {});
    busyTabs.delete(tabId);
  }
}

async function fillTimestamps(m, sender) {
  const tabId = Number(m.tabId), courseCode = typeof m.courseCode === 'string' ? m.courseCode : '';
  if (!Number.isInteger(tabId) || !courseCode || !Array.isArray(m.entries) || !m.entries.length || m.entries.length > 2000 ||
      !Array.isArray(m.groups) || !m.groups.length || m.groups.length > m.entries.length) {
    throw new Error('Bad Timestamp Maker request.');
  }
  const entries = m.entries.map(entry => {
    if (!entry || !Number.isInteger(entry.assetIndex) || entry.assetIndex < 0 ||
        typeof entry.title !== 'string' || entry.title.length > 500 ||
        typeof entry.type !== 'string' || entry.type.length > 80 ||
        entry.type.trim().toUpperCase() !== 'VIDEO' ||
        typeof entry.href !== 'string' || entry.href.length > 2000 ||
        typeof entry.pageNo !== 'string' || entry.pageNo.length > 40 ||
        typeof entry.problemNo !== 'string' || entry.problemNo.length > 40 ||
        /[\r\n\t]/.test(entry.pageNo + entry.problemNo) ||
        (!entry.pageNo.trim() && !entry.problemNo.trim())) {
      throw new Error('Timestamp Maker contains an invalid asset or value.');
    }
    return {
      assetIndex: entry.assetIndex, title: entry.title, type: entry.type, href: entry.href,
      pageNo: entry.pageNo.trim(), problemNo: entry.problemNo.trim(),
    };
  });
  const entryByIndex = new Map(entries.map(entry => [entry.assetIndex, entry]));
  const assigned = new Set();
  const groups = m.groups.map(group => {
    if (!Array.isArray(group) || !group.length) throw new Error('Timestamp Maker contains an invalid subsection group.');
    return group.map(assetIndex => {
      if (!Number.isInteger(assetIndex) || !entryByIndex.has(assetIndex) || assigned.has(assetIndex)) {
        throw new Error('Timestamp Maker contains an invalid subsection group.');
      }
      assigned.add(assetIndex);
      return entryByIndex.get(assetIndex);
    });
  });
  if (assigned.size !== entries.length) throw new Error('Timestamp Maker contains an incomplete subsection group list.');
  const tab = await chrome.tabs.get(tabId);
  const url = tab?.url ? new URL(tab.url) : null;
  const match = url && /^\/master-canvas\/[^/]+\/([^/]+)\/?/.exec(url.pathname);
  if (!url || url.protocol !== 'https:' || url.hostname !== HOST || !match || decodeURIComponent(match[1]) !== courseCode) {
    throw new Error('That tab is not the selected Master Canvas any more.');
  }
  if (tab.discarded || tab.status !== 'complete') throw new Error('The LearnCraft tab is still loading or asleep. Open it once, wait until it finishes, then try again.');
  if (busyTabs.has(tabId)) throw new Error('This tab is already being read. Wait for it to finish.');
  const reqId = typeof m.reqId === 'string' ? m.reqId.slice(0, 80) : '';
  if (!reqId || !sender.tab || !Number.isInteger(sender.tab.id) || !Number.isInteger(sender.tab.windowId)) {
    throw new Error('Timestamp Maker could not identify the tool tab to return to.');
  }
  const job = {
    tabId, pageTabId: sender.tab.id, pageWindowId: sender.tab.windowId, courseWindowId: tab.windowId,
    cancelled: false, switchedToCourse: false,
  };
  busyTabs.add(tabId);
  jobs.set(reqId, job);
  let scriptStarted = false, completed = false;
  try {
    if (!(await activateCourseTab(reqId))) {
      if (job.cancelled) return {ok: false, state: 'cancelled', updated: 0, results: []};
      throw new Error('Could not switch to the LearnCraft tab. Keep the Timestamp Maker tab active and try again.');
    }
    await waitForCompleteTab(tabId);
    if (job.cancelled) return {ok: false, state: 'cancelled', updated: 0, results: []};
    scriptStarted = true;
    const result = await withTimeout(run(tabId, lcFillTimestamps, [groups, courseCode, reqId]), 300000);
    if (!result || !Array.isArray(result.results)) throw new Error('The LearnCraft page did not return an update report.');
    completed = result.state === 'done';
    return result;
  } catch (e) {
    if (scriptStarted) cancelJob(reqId);
    throw e;
  } finally {
    await restorePageTab(job, completed);
    busyTabs.delete(tabId);
    setTimeout(() => jobs.delete(reqId), 5000);
  }
}

// INJECTED into the current Master Canvas layout, where Course Canvas is a breadcrumb rather than a card.
async function lcListTimestampAssets(expectedCode) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const durationInfo = scope => {
    const heading = [...scope.querySelectorAll('h6.MuiTypography-subtitle1')]
      .find(item => /^(Part|Section|Mission|Subsection) duration:/i.test(clean(item.textContent)));
    if (!heading) return null;
    const match = /^(Part|Section|Mission|Subsection) duration:\s*(.*)$/i.exec(clean(heading.textContent));
    return match ? {level: match[1].toLowerCase(), duration: match[2]} : null;
  };
  const assetTitle = (nav, root) => {
    for (let scope = nav.parentElement; scope && scope !== root; scope = scope.parentElement) {
      const heading = [...scope.querySelectorAll('h6')].find(item => !item.closest('nav'));
      if (heading) return clean(heading.textContent);
    }
    return '';
  };
  const codeMatch = /^\/master-canvas\/[^/]+\/([^/]+)/.exec(location.pathname);
  if (!codeMatch || decodeURIComponent(codeMatch[1]) !== expectedCode) throw new Error('The Master Canvas changed before its assets could be listed.');
  const root = document.querySelector('main');
  if (!root) throw new Error('The Master Canvas page content is unavailable.');
  // LearnCraft only creates a row's cover <img> once the row has been scrolled into view. Without this pass, videos that were never
  // shown have no preview URL, so their recording date is unknown and the date filter would silently leave them out.
  const rowOf = nav => {
    let row = nav;
    while (row.parentElement && row.parentElement !== root && row.parentElement.querySelectorAll('nav').length === 1) row = row.parentElement;
    return row;
  };
  const previewOf = row => [...row.querySelectorAll('img[src]')]
    .map(image => image.getAttribute('src'))
    .find(src => {
      try {
        return /\/video\/[^/]+\/\d{4}-\d{2}-\d{2}\/preview\.(?:png|gif)$/i.test(new URL(src, location.origin).pathname);
      } catch {
        return false;
      }
    }) || '';
  const assetNavs = [...root.querySelectorAll('nav')].filter(nav =>
    nav.classList.contains('MuiBreadcrumbs-root') && nav.querySelectorAll('li').length === 1);
  let coversMissing = 0;
  {
    const startX = window.scrollX, startY = window.scrollY, deadline = Date.now() + 60000;
    const waitFor = async (test, ms) => {
      const end = Date.now() + ms;
      while (!test()) {
        if (Date.now() >= end) return false;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return true;
    };
    for (const nav of assetNavs) {
      if (clean(nav.querySelector('li')?.textContent).toUpperCase() !== 'VIDEO') continue;
      const row = rowOf(nav);
      if (previewOf(row)) continue;
      if (Date.now() >= deadline) { coversMissing++; continue; }
      (row.querySelector('.lazy-load-image-background') || row).scrollIntoView({block: 'center', behavior: 'instant'});
      if (!(await waitFor(() => previewOf(row), 700))) coversMissing++;
    }
    window.scrollTo(startX, startY);
  }
  const events = [
    ...[...root.querySelectorAll('h6.MuiTypography-h6')].map(element => ({kind: 'heading', element})),
    ...assetNavs.map(element => ({kind: 'asset', element})),
  ].sort((a, b) => a.element === b.element ? 0 :
    (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
  const tree = [], stack = [];
  const navs = [];
  for (const event of events) {
    if (event.kind === 'heading') {
      const heading = event.element;
      let scope = heading.parentElement, info = null;
      while (scope && scope !== root) {
        info = durationInfo(scope);
        if (info) break;
        scope = scope.parentElement;
      }
      if (!info) continue;
      const node = {
        level: info.level, title: clean(heading.textContent), duration: info.duration,
        rank: {part: 0, section: 1, mission: 2, subsection: 3}[info.level],
        children: [], assetIndices: [],
      };
      while (stack.length && stack[stack.length - 1].rank >= node.rank) stack.pop();
      (stack.length ? stack[stack.length - 1].children : tree).push(node);
      stack.push(node);
      continue;
    }
    const nav = event.element;
    const assetIndex = navs.length;
    navs.push(nav);
    if (stack.length) stack[stack.length - 1].assetIndices.push(assetIndex);
  }
  const assets = navs.map((nav, assetIndex) => {
    const type = clean(nav.querySelector('li')?.textContent);
    const row = rowOf(nav);
    const title = assetTitle(nav, root);
    if (!type || !title) throw new Error('An asset title or type could not be read. Refresh the Master Canvas and try again.');
    const link = row.querySelector('a[href]');
    const href = link ? new URL(link.getAttribute('href'), location.origin).href : '';
    const previewUrl = previewOf(row);
    const timestampLabel = [...row.querySelectorAll('button')]
      .map(button => clean(button.textContent))
      .find(text => /^Timestamp(?:\s*\(\d+\))?$/.test(text)) || '';
    return {assetIndex, title, type, href, previewUrl, hasNumberedTimestamp: /^Timestamp\s*\(\d+\)$/.test(timestampLabel)};
  });
  const serialize = node => ({
    level: node.level, title: node.title, duration: node.duration,
    children: node.children.map(serialize), assetIndices: node.assetIndices,
  });
  const assigned = new Set();
  const collectAssigned = nodes => nodes.forEach(node => {
    node.assetIndices.forEach(index => assigned.add(index));
    collectAssigned(node.children);
  });
  collectAssigned(tree);
  return {ok: true, coversMissing, assets, tree: tree.map(serialize), assetIndices: assets.filter(asset => !assigned.has(asset.assetIndex)).map(asset => asset.assetIndex)};
}

// INJECTED into the selected Master Canvas tab. Each subsection is saved and verified before moving on.
// The Master Canvas itself is never saved here.
async function lcFillTimestamps(groups, expectedCode, reqId) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const shown = element => !!element && element.getClientRects().length > 0;
  const entries = groups.flat();
  const tick = progress => {
    try {
      const request = chrome.runtime.sendMessage({ns: 'pl-lc-tick', job: reqId, progress});
      if (request && request.catch) request.catch(() => {});
    } catch {}
  };
  const assetTitle = (nav, root) => {
    for (let scope = nav.parentElement; scope && scope !== root; scope = scope.parentElement) {
      const heading = [...scope.querySelectorAll('h6')].find(item => !item.closest('nav'));
      if (heading) return clean(heading.textContent);
    }
    return '';
  };
  const assetNavs = root => [...root.querySelectorAll('nav')].filter(item =>
    item.classList.contains('MuiBreadcrumbs-root') && item.querySelectorAll('li').length === 1);
  const assetRow = (nav, root) => {
    let row = nav;
    while (row.parentElement && row.parentElement !== root && row.parentElement.querySelectorAll('nav').length === 1) row = row.parentElement;
    return row;
  };
  const assetRecord = (nav, root, index) => {
    const row = assetRow(nav, root), link = row.querySelector('a[href]');
    return {
      index, nav, row, title: assetTitle(nav, root),
      type: clean(nav.querySelector('li')?.textContent),
      href: link ? new URL(link.getAttribute('href'), location.origin).href : '',
    };
  };
  const codeMatch = /^\/master-canvas\/[^/]+\/([^/]+)/.exec(location.pathname);
  if (!codeMatch || decodeURIComponent(codeMatch[1]) !== expectedCode) throw new Error('The Master Canvas changed before the values could be applied.');
  if (!document.querySelector('main')) throw new Error('The Master Canvas page content is no longer available.');
  const deadline = Date.now() + 240000;
  const findDialog = () => [...document.querySelectorAll('[role="dialog"]')].find(shown);
  const buttonByText = (root, text) => [...root.querySelectorAll('button')].find(button => shown(button) && clean(button.textContent) === text && !button.disabled);
  let errorRefreshAttempts = 0;
  const refreshErrorDialog = async () => {
    const dialog = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find(item =>
      shown(item) && /เกิดข้อผิดพลาด|error\s*:/i.test(clean(item.textContent)) && buttonByText(item, 'Refresh'));
    if (!dialog) return false;
    if (++errorRefreshAttempts > 10) throw new Error('LearnCraft showed too many error dialogs while applying timestamps.');
    buttonByText(dialog, 'Refresh').click();
    const end = Math.min(deadline, Date.now() + 10000);
    while (Date.now() < end) {
      if (!shown(dialog) || !document.contains(dialog)) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('The LearnCraft error dialog did not close after Refresh.');
  };
  const clickWithErrorRecovery = async element => {
    await refreshErrorDialog();
    if (!element || !element.isConnected || !shown(element) || element.disabled) {
      throw new Error('The LearnCraft control changed while recovering from an error. Review the course before continuing.');
    }
    element.click();
  };
  const waitFor = async (find, label, timeout = 10000) => {
    const end = Math.min(deadline, Date.now() + timeout);
    while (Date.now() < end) {
      if (await refreshErrorDialog()) continue;
      const element = find();
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (Date.now() >= deadline) throw new Error('The run reached its time limit. Remaining assets were not attempted.');
    throw new Error(`Timed out waiting for ${label}.`);
  };
  const settleTimestampEditor = () => new Promise(resolve => setTimeout(resolve, 300));
  const findMainAsset = (entry, root) => {
    const nav = assetNavs(root)[entry.assetIndex];
    if (!nav) throw new Error(`The asset "${entry.title}" could not be found. Refresh the asset list and try again.`);
    const record = assetRecord(nav, root, entry.assetIndex);
    if (record.title !== entry.title || record.type !== entry.type || record.href !== entry.href) {
      throw new Error('The asset list changed since it was loaded. Refresh the list before applying values.');
    }
    return record;
  };
  const findDialogAsset = (entry, dialog) => {
    const records = assetNavs(dialog).map((nav, index) => assetRecord(nav, dialog, index));
    const matches = records.filter(record =>
      record.title === entry.title && record.type === entry.type && record.href === entry.href);
    if (matches.length !== 1) throw new Error(`Could not uniquely identify "${entry.title}" in its subsection dialog.`);
    return matches[0];
  };
  const setInputValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('LearnCraft input controls are not supported.');
    setter.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.blur();
    if (input.value !== value) throw new Error('LearnCraft did not accept the entered value.');
  };
  const results = [];
  let updated = 0;
  const cancelled = () => !!(globalThis.__plLcCancel && globalThis.__plLcCancel[reqId]);
  tick({phase: 'start', total: entries.length});
  let completedEntries = 0;
  for (const group of groups) {
    if (cancelled()) break;
    const groupStart = completedEntries;
    if (Date.now() >= deadline) {
      const message = 'The run reached its time limit. Remaining assets were not attempted.';
      group.forEach((entry, index) => {
        results.push({ok: false, title: entry.title, message});
        tick({phase: 'asset', current: groupStart + index + 1, total: entries.length, title: entry.title, state: 'error', message});
      });
      break;
    }
    const root = document.querySelector('main');
    if (!root) {
      const message = 'The Master Canvas page content is no longer available.';
      group.forEach((entry, index) => {
        results.push({ok: false, title: entry.title, message});
        tick({phase: 'asset', current: groupStart + index + 1, total: entries.length, title: entry.title, state: 'error', message});
      });
      break;
    }
    let dialog;
    let saved = false;
    try {
      await refreshErrorDialog();
      const records = group.map(entry => findMainAsset(entry, root));
      for (let index = 0; index < records.length; index++) {
        const timestampButtons = [...records[index].row.querySelectorAll('button')].filter(button =>
          shown(button) && /^Timestamp(?:\s*\(\d+\))?$/.test(clean(button.textContent)));
        if (timestampButtons.some(button => /^Timestamp\s*\(\d+\)$/.test(clean(button.textContent)))) {
          throw new Error(`"${group[index].title}" already has a filled timestamp.`);
        }
        if (!timestampButtons.some(button => clean(button.textContent) === 'Timestamp' && !button.disabled)) {
          throw new Error(`"${group[index].title}" does not have an available Timestamp button.`);
        }
      }
      if (findDialog()) throw new Error('Close any open LearnCraft dialog before applying timestamp values.');
      const openButton = [...records[0].row.querySelectorAll('button')].find(button =>
        shown(button) && clean(button.textContent) === 'Timestamp' && !button.disabled);
      await clickWithErrorRecovery(openButton);
      dialog = await waitFor(() => {
        const current = findDialog();
        return current && clean(current.querySelector('h2')?.textContent) === 'Add Timestamp' ? current : null;
      }, 'the Add Timestamp dialog');
      const dialogRecords = group.map(entry => findDialogAsset(entry, dialog));
      for (let index = 0; index < group.length; index++) {
        const entry = group[index], targetAsset = dialogRecords[index];
        tick({phase: 'asset', current: groupStart + index + 1, total: entries.length, title: entry.title, state: 'working'});
        await clickWithErrorRecovery(targetAsset.row);
        await settleTimestampEditor();
        const inputPrefix = `assets.${targetAsset.index}.timestamps.`;
        const typeInputs = () => [...dialog.querySelectorAll('input[name$=".type"]')]
          .filter(input => input.name.startsWith(inputPrefix));
        const before = typeInputs().length;
        const addButton = buttonByText(dialog, 'Timestamp');
        if (!addButton) throw new Error('The dialog does not have an enabled Add Timestamp button.');
        await clickWithErrorRecovery(addButton);
        const overlayInput = await waitFor(() => typeInputs().find(input => input.value === '') || null,
          `a new timestamp row for "${entry.title}"`);
        if (typeInputs().length <= before) throw new Error(`LearnCraft did not add a timestamp row for "${entry.title}".`);
        const control = overlayInput.closest('.MuiFormControl-root');
        const select = control && control.querySelector('[role="combobox"]');
        if (!select) throw new Error('The timestamp type selector is unavailable.');
        select.focus();
        select.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, button: 0, buttons: 1, view: window,
        }));
        const listboxId = select.getAttribute('aria-controls');
        const listbox = await waitFor(() => {
          if (select.getAttribute('aria-expanded') !== 'true') return null;
          const controlledListbox = listboxId && document.getElementById(listboxId);
          if (controlledListbox && shown(controlledListbox)) return controlledListbox;
          return [...document.querySelectorAll('[role="listbox"]')].find(shown) || null;
        }, 'the timestamp type options');
        const option = await waitFor(() => [...listbox.querySelectorAll('[role="option"]')].find(item =>
          shown(item) && /^Video overlay$/i.test(clean(item.textContent))), 'the Video overlay option');
        await clickWithErrorRecovery(option);
        await waitFor(() => overlayInput.value === 'VIDEO_OVERLAY' ? overlayInput : null, 'the selected Video overlay type');
        const prefix = overlayInput.name.replace(/\.type$/, '');
        const pageInput = dialog.querySelector(`input[name="${prefix}.pageNo"]`);
        const problemInput = dialog.querySelector(`input[name="${prefix}.problemNo"]`);
        if ((entry.pageNo && !pageInput) || (entry.problemNo && !problemInput)) throw new Error('The Page no. or Pb no. field is missing.');
        if (entry.pageNo) setInputValue(pageInput, entry.pageNo);
        if (entry.problemNo) setInputValue(problemInput, entry.problemNo);
        if (index + 1 < group.length) await settleTimestampEditor();
      }
      const save = buttonByText(dialog, 'Save');
      if (!save) throw new Error('The timestamp dialog does not have an enabled Save button.');
      await clickWithErrorRecovery(save);
      saved = true;
      await waitFor(() => !findDialog(), 'the timestamp dialog to close');
      await waitFor(() => {
        const currentRoot = document.querySelector('main');
        if (!currentRoot) return null;
        return group.every(entry => {
          const currentRecords = assetNavs(currentRoot);
          const currentNav = currentRecords[entry.assetIndex];
          if (!currentNav) return false;
          const current = assetRecord(currentNav, currentRoot, entry.assetIndex);
          return current.title === entry.title && current.type === entry.type && current.href === entry.href &&
            [...current.row.querySelectorAll('button')].some(button =>
              shown(button) && /^Timestamp\s*\(\d+\)$/.test(clean(button.textContent)));
        }) ? true : null;
      }, 'all subsection assets to show their filled timestamps');
      group.forEach((entry, index) => {
        updated++;
        results.push({ok: true, title: entry.title});
        tick({phase: 'asset', current: groupStart + index + 1, total: entries.length, title: entry.title, state: 'done'});
      });
    } catch (error) {
      const message = String(error && error.message || error);
      if (saved) {
        const currentRoot = document.querySelector('main');
        const currentRecords = currentRoot ? assetNavs(currentRoot) : [];
        for (let index = 0; index < group.length; index++) {
          const entry = group[index], nav = currentRecords[entry.assetIndex];
          const current = nav && assetRecord(nav, currentRoot, entry.assetIndex);
          const ok = !!current && current.title === entry.title && current.type === entry.type && current.href === entry.href &&
            [...current.row.querySelectorAll('button')].some(button =>
              shown(button) && /^Timestamp\s*\(\d+\)$/.test(clean(button.textContent)));
          if (ok) updated++;
          results.push(ok ? {ok: true, title: entry.title} : {ok: false, title: entry.title, message});
          tick({
            phase: 'asset', current: groupStart + index + 1, total: entries.length, title: entry.title,
            state: ok ? 'done' : 'error', ...(ok ? {} : {message}),
          });
        }
      } else {
        group.forEach((entry, index) => {
          results.push({ok: false, title: entry.title, message});
          tick({phase: 'asset', current: groupStart + index + 1, total: entries.length, title: entry.title, state: 'error', message});
        });
      }
      break;
    }
    completedEntries += group.length;
  }
  const stopped = cancelled() && results.length < entries.length;
  return {ok: !stopped && results.every(result => result.ok), state: stopped ? 'cancelled' : 'done', updated, results};
}

// ---------------------------------------------------------------------------
// LearnCraft : Ultimate Go Live.
// Takes the Master to ready, then processes each variant in its own background tab.
// Each tab gets an independent worker and clicks only the steps listed in lcGoLiveStep.
const GOLIVE_MAX_ROUNDS = 160;       // total rounds in one run
const GOLIVE_MAX_WAITS = 60;         // seconds to wait for LearnCraft after a click or while a dialog is processing
const GOLIVE_TOTAL_MS = 15 * 60 * 1000;
const pause = ms => new Promise(r => setTimeout(r, ms));

async function waitForCompleteTab(tabId, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const t = await chrome.tabs.get(tabId);
    if (t.discarded) throw new Error('The LearnCraft tab went to sleep. Open it once, wait until it finishes, then try again.');
    if (t.status === 'complete') return t;
    if (Date.now() > end) throw new Error('The LearnCraft tab is still loading.');
    await pause(300);
  }
}

// One look at the page. A page that is reloading can make the script fail for a moment, so a failure is tried again:
// the retry only LOOKS (observe), it never clicks, so a click whose answer was lost is not repeated.
async function stepGoLive(tabId, opts) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withTimeout(run(tabId, lcGoLiveStep, [attempt ? {...opts, observe: true} : opts]), 15000);
      if (res) return res;
      last = new Error('The tab did not answer.');
    } catch (e) {
      last = e;
      if (/No tab with id/i.test(String((e && e.message) || e))) throw new Error('The LearnCraft tab was closed.');
    }
    await pause(1500);
  }
  throw last;
}

async function runGoLive(m, sender, popup = false) {
  const tabId = Number(m.tabId), reqId = typeof m.reqId === 'string' ? m.reqId.slice(0, 80) : '';
  if (!Number.isInteger(tabId) || !reqId) throw new Error('Bad request.');
  if (Array.isArray(m.variantCodes) && (m.variantCodes.length > 500 || m.variantCodes.some(code => typeof code !== 'string' || !code || code.length > 100))) {
    throw new Error('Bad variant selection.');
  }
  const dryRun = !!m.dryRun, closeDone = !!m.closeDone;
  const selectedVariantCodes = Array.isArray(m.variantCodes) ? new Set(m.variantCodes) : null;
  const opts = {dryRun, clicked: []};
  const tab = await chrome.tabs.get(tabId);
  const u = tab && tab.url ? new URL(tab.url) : null;
  if (!u || u.protocol !== 'https:' || u.hostname !== HOST || !u.pathname.startsWith('/master-canvas/')) {
    throw new Error('Open the Master Canvas tab of the course first.');
  }
  if (tab.discarded || tab.status !== 'complete') throw new Error('The tab is still loading or asleep. Open it once, wait until it finishes, then try again.');
  if (busyTabs.has(tabId)) throw new Error('This tab is already being read. Wait for it to finish.');
  busyTabs.add(tabId);
  const job = {
    tabId, popup, pageTabId: popup ? null : sender.tab.id, pageWindowId: popup ? null : sender.tab.windowId, courseWindowId: tab.windowId,
    cancelled: false,
  };
  jobs.set(reqId, job);
  const log = [], results = [];
  const report = async (ok, state, message, extra = {}) => {
    const result = {ok, state, message, dryRun, log, results, elapsedMs: Date.now() - started, ...extra};
    if (popup) {
      const snapshot = popupRunState;
      if (snapshot && snapshot.reqId === reqId) {
        snapshot.active = false;
        snapshot.result = result;
        await persistPopupRun(snapshot);
      }
      if (!dryRun) await clearPopupActionStatus();
      chrome.runtime.sendMessage({ns: 'pl-lc-popup-finished', id: reqId, result}).catch(() => {});
    }
    return result;
  };
  const tell = p => {
    if (job.popup) {
      const snapshot = popupRunState;
      if (snapshot && snapshot.reqId === reqId) {
        snapshot.progress.push(p);
        persistPopupRun(snapshot);
        if (!dryRun) setPopupActionStatus(snapshot.code, p);
      }
      try { chrome.runtime.sendMessage({ns: 'pl-lc-popup-progress', id: reqId, progress: p}).catch(() => {}); } catch {}
      return;
    }
    try { chrome.tabs.sendMessage(job.pageTabId, {ns: 'pl-lc-progress', id: reqId, progress: p}).catch(() => {}); } catch {}
  };
  let waits = 0, noVariants = 0, progressRound = 0;
  const saw = r => {
    const s = r && r.seen;
    return s ? ` (The page showed: status [${s.status.join(', ')}]; buttons [${s.buttons.join(', ')}]${s.dialog ? `; dialog "${s.dialog}"` : ''}.)` : '';
  };
  // Tells the page how a variant ended, and (only when asked) closes the tab of a variant that finished OK.
  const finished = async (outcome) => {
    tell({event: 'variant-done', code: outcome.code, ok: outcome.ok, state: outcome.state, message: outcome.message});
    if (outcome.ok && closeDone && outcome.tabId != null) { try { await chrome.tabs.remove(outcome.tabId); } catch {} }
    return outcome;
  };
  const runVariant = async (variant, variantTabId, index, total) => {
    const variantOpts = {dryRun: false, clicked: []};
    let variantWaits = 0;
    for (let round = 1; round <= GOLIVE_MAX_ROUNDS; round++) {
      if (job.cancelled) return {code: variant.code, tabId: variantTabId, ok: false, state: 'cancelled', message: 'Stopped before this variant finished.'};
      if (Date.now() - started > GOLIVE_TOTAL_MS) return {code: variant.code, tabId: variantTabId, ok: false, state: 'timeout', message: 'The 15-minute run limit was reached.'};
      await waitForCompleteTab(variantTabId);
      if (job.cancelled) return {code: variant.code, tabId: variantTabId, ok: false, state: 'cancelled', message: 'Stopped before this variant finished.'};
      const step = await stepGoLive(variantTabId, variantOpts);
      const entry = {round: ++progressRound, page: step.kind, code: step.code || variant.code, state: step.state, did: step.did, message: step.message};
      log.push(entry);
      tell({...entry, queue: index + 1, of: total});
      if (step.next === 'stop') return {code: variant.code, tabId: variantTabId, ok: false, state: step.state, message: step.message + saw(step)};
      if (step.next === 'done') return {code: variant.code, tabId: variantTabId, ok: true, state: 'done', message: step.message};
      if (step.did) {
        variantWaits = 0;
        const clickKey = `${step.kind}|${step.code}|${step.state}|${step.did}`;
        if (!variantOpts.clicked.includes(clickKey)) variantOpts.clicked.push(clickKey);
        await pause(1000);
        continue;
      }
      if (++variantWaits > GOLIVE_MAX_WAITS) {
        const message = step.state === 'dialog-wait'
          ? `The dialog did not close or offer its next enabled confirmation button within ${GOLIVE_MAX_WAITS} seconds.`
          : step.state === 'click-wait'
            ? `The page did not move on after the click within ${GOLIVE_MAX_WAITS} seconds.`
            : 'The page did not show a known state.';
        return {code: variant.code, tabId: variantTabId, ok: false, state: step.state, message: message + saw(step)};
      }
      await pause(1000);
    }
    return {code: variant.code, tabId: variantTabId, ok: false, state: 'limit', message: 'Too many steps in this variant.'};
  };
  const started = Date.now();
  if (popup) {
    const snapshot = {
      reqId,
      code: typeof m.code === 'string' ? m.code.slice(0, 100) : tab.title || 'Course',
      dryRun,
      startedAt: started,
      active: true,
      progress: [],
      result: null,
    };
    await persistPopupRun(snapshot);
    if (!dryRun) await setPopupActionStatus(snapshot.code);
  }
  try {
    if (dryRun) {
      const r = await stepGoLive(tabId, opts);
      const variants = r.variants && selectedVariantCodes ? r.variants.filter(variant => selectedVariantCodes.has(variant.code)) : r.variants || null;
      return report(r.next !== 'stop' || !!r.planned, r.state, r.message + (r.next === 'stop' && !r.planned ? saw(r) : ''), {planned: r.planned || null, variants, page: r.kind});
    }
    for (let round = 1; round <= GOLIVE_MAX_ROUNDS; round++) {
      if (job.cancelled) return report(false, 'cancelled', 'Stopped. Nothing more was clicked.', {results});
      if (Date.now() - started > GOLIVE_TOTAL_MS) return report(false, 'timeout', 'Stopped after 15 minutes. Check the course by hand.', {results});
      await waitForCompleteTab(tabId);
      if (job.cancelled) return report(false, 'cancelled', 'Stopped. Nothing more was clicked.', {results});
      const r = await stepGoLive(tabId, opts);
      const entry = {round: ++progressRound, page: r.kind, code: r.code, state: r.state, did: r.did, message: r.message};
      log.push(entry);
      tell({...entry, queue: 0, of: 0});
      if (r.next === 'stop') return report(false, r.state, r.message + saw(r), {results});

      if (r.next === 'variants') {                     // Master is ready: open only the selected variants without activating their tabs
        const linkedVariants = r.variants || [];
        if (selectedVariantCodes && selectedVariantCodes.size === 0) {
          tell({event: 'variants', codes: []});
          return report(true, 'done', 'The Master Canvas is ready. No variants were selected, so nothing more was clicked.', {results});
        }
        if (!linkedVariants.length) {
          if (selectedVariantCodes && selectedVariantCodes.size > 0) {
            if (++noVariants <= 4) { await pause(1500); continue; }
            return report(false, 'variants-changed', 'The selected variant links are no longer available on the Master Canvas. Refresh the course list and select variants again.', {results});
          }
          if (++noVariants <= 4) { await pause(1500); continue; }     // the variant links may still be loading
          return report(true, 'done', 'The Master Canvas is ready. This course has no variant links, so nothing more was clicked. If it should have variants, check it by hand.', {results});
        }
        noVariants = 0;
        const linkedCodes = new Set(linkedVariants.map(variant => variant.code));
        if (selectedVariantCodes) {
          const missing = [...selectedVariantCodes].filter(code => !linkedCodes.has(code));
          if (missing.length) {
            return report(false, 'variants-changed', `These selected variants are no longer linked to the Master Canvas: ${missing.join(', ')}. Refresh the course list and select variants again.`, {results});
          }
        }
        const variants = selectedVariantCodes
          ? linkedVariants.filter(variant => selectedVariantCodes.has(variant.code))
          : linkedVariants;
        const created = await Promise.all(variants.map(async (variant, index) => {
          try {
            const url = new URL(variant.href);
            if (url.protocol !== 'https:' || url.hostname !== HOST || !url.pathname.startsWith('/course-variant/')) {
              throw new Error('Refusing to open a link outside the LearnCraft variant pages.');
            }
            const variantTab = await chrome.tabs.create({url: url.href, active: false, windowId: tab.windowId, openerTabId: tabId});
            return {variant, index, tabId: variantTab.id};
          } catch (e) {
            return {variant, index, error: String((e && e.message) || e)};
          }
        }));
        tell({event: 'variants', codes: variants.map(variant => variant.code)});
        const outcomes = await Promise.all(created.map(item => item.error
          ? finished({code: item.variant.code, ok: false, state: 'tab-error', message: item.error})
          : runVariant(item.variant, item.tabId, item.index, variants.length).catch(e => ({
            code: item.variant.code, tabId: item.tabId, ok: false, state: 'error', message: String((e && e.message) || e),
          })).then(finished)));
        results.push(...outcomes);
        const failed = outcomes.filter(result => !result.ok);
        if (job.cancelled) {
          return report(false, 'cancelled', `Stopped. ${outcomes.length - failed.length} of ${variants.length} variants finished; background tabs were left open.`, {results});
        }
        if (failed.length) {
          return report(false, 'partial', `${outcomes.length - failed.length} of ${variants.length} variants ready; ${failed.length} need attention. ${closeDone ? 'Tabs of the ready variants were closed; the others were left open.' : 'Background variant tabs were left open.'}`, {results});
        }
        return report(true, 'done', `Done. All ${variants.length} variants are ready. ${closeDone ? 'Their tabs were closed.' : 'Background variant tabs were left open.'}`, {results});
      }
      if (r.next === 'done') {
        return report(true, 'done', 'The selected course is already ready.', {results});
      }
      if (r.did) {
        waits = 0;
        const clickKey = `${r.kind}|${r.code}|${r.state}|${r.did}`;
        if (!opts.clicked.includes(clickKey)) opts.clicked.push(clickKey);
        await pause(1000);
        continue;
      }
      if (++waits > GOLIVE_MAX_WAITS) {
        const message = r.state === 'dialog-wait'
          ? `The dialog did not close or offer its next enabled confirmation button within ${GOLIVE_MAX_WAITS} seconds. Check the course by hand.${saw(r)}`
          : r.state === 'click-wait'
            ? `The page did not move on after the click within ${GOLIVE_MAX_WAITS} seconds. Check the course by hand.${saw(r)}`
            : 'The page did not show a known state. Nothing more was clicked.' + saw(r);
        return report(false, r.state, message, {results});
      }
      await pause(1000);
    }
    return report(false, 'limit', 'Too many steps in one run. Check the course by hand.', {results});
  } catch (e) {
    return report(false, 'error', String((e && e.message) || e), {results});
  } finally {
    busyTabs.delete(tabId);
    setTimeout(() => jobs.delete(reqId), 5000);
  }
}

// INJECTED into the LearnCraft tab, so it must be fully self-contained.
// Looks at the page once, makes at most one allowed click (or, in a dry run, only reports the click it would make),
// and says what it saw. Allowed clicks:
//   Master: red "Update" (alert), "Submit for Approval" (draft), "Approve" (approving)
//   Variant: red "Update" (alert), "Submit as Ready" (draft), green "Update" when a warning shows (ready)
//   Dialogs: "Update" in "Update this Master Canvas ?", "Update this Course ?", or "Update this Course Variant ?",
//            "Submit" in "Submit for Ready ?",
//            tick "Ignore Asset without Timestamp", then approve the Master or confirm with "Approve"/"Submit"
// Never clicked: Go live, Reject, Go to Edit, Cancel, Back to Edit.
function lcGoLiveStep(opt) {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const shown = el => !!el && el.getClientRects().length > 0;
  const path = location.pathname;
  const kind = path.startsWith('/master-canvas/') ? 'master' : path.startsWith('/course-variant/') ? 'variant' : 'other';
  const codeOf = /^\/(?:master-canvas|course-variant)\/[^/]+\/([^/]+)/.exec(path);
  const code = codeOf ? decodeURIComponent(codeOf[1]) : '';
  const report = (state, o) => Object.assign({kind, code, state, did: null, planned: null, next: 'wait', message: '', variants: null, seen: describe()}, o || {});
  const stop = (state, message) => report(state, {next: 'stop', message});
  const buttons = [...document.querySelectorAll('button')].filter(shown);
  // What the page shows right now (status labels, button labels, open dialog). Only used to explain a stop.
  const describe = () => ({
    status: [...document.querySelectorAll('h6')].filter(shown).map(h => clean(h.textContent)).filter(Boolean).slice(0, 8),
    buttons: buttons.map(b => clean(b.textContent) + (b.disabled ? ' (disabled)' : '')).filter(Boolean).slice(0, 14),
    dialog: clean(([...document.querySelectorAll('[role="dialog"]')].find(shown) || {}).textContent).slice(0, 80),
  });
  const find = (label, pred) => buttons.find(b => clean(b.textContent) === label && !b.disabled && (!pred || pred(b)));
  // One click. In a dry run nothing is clicked; the click that would happen is reported instead.
  const act = (el, did, state) => {
    if (opt.dryRun) return report(state, {planned: did, next: 'stop', message: 'Dry run. Would click: ' + did});
    if (opt.observe) return report(state, {next: 'wait', message: 'Looking at the page again before clicking.'});
    const clickKey = `${kind}|${code}|${state}|${did}`;
    if (opt.clicked && opt.clicked.includes(clickKey)) {
      return report('click-wait', {next: 'wait', message: 'Waiting for LearnCraft to move on after ' + did + '.'});
    }
    el.click();
    return report(state, {did, next: 'wait', message: 'Clicked ' + did});
  };

  // A dialog that is open is a question LearnCraft is asking. Only the answers listed above are given.
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(shown);
  if (dialog) {
    const title = clean((dialog.querySelector('h2') || {}).textContent);
    const inDialog = pred => [...dialog.querySelectorAll('button')].find(b => !b.disabled && pred(clean(b.textContent)));
    if (kind === 'master' && title === 'Confirm Approval ?') {
      const approving = [...document.querySelectorAll('h6')]
        .some(h => shown(h) && clean(h.textContent) === 'approving');
      if (!approving) return stop('dialog', 'The approval confirmation appeared, but the Master Canvas is not in approving status. Nothing was clicked.');
      const submit = inDialog(label => label === 'Submit');
      return submit ? act(submit, 'confirm-master-approval', 'approving')
        : report('dialog-wait', {next: 'wait', message: 'The approval confirmation dialog has no enabled Submit button. Waiting for LearnCraft to finish processing.'});
    }
    if (kind === 'master' && /^Update this (?:Master Canvas|Course)\s*\?$/.test(title)) {
      const update = inDialog(label => label === 'Update');
      if (update) return act(update, 'confirm-master-update', 'dialog');
      const disabledUpdate = [...dialog.querySelectorAll('button')]
        .find(button => clean(button.textContent) === 'Update' && button.disabled);
      return disabledUpdate
        ? report('dialog-wait', {next: 'wait', message: 'The Master Update confirmation is disabled. Waiting for LearnCraft to finish processing.'})
        : stop('dialog', 'The Master Update dialog has no Update button. Nothing was clicked.');
    }
    if (title === 'Found Asset without Timestamp') {
      const ignoreText = 'Ignore Asset without Timestamp';
      const checkboxes = [...dialog.querySelectorAll('input[type="checkbox"], [role="checkbox"]')]
        .filter(control => !(control.getAttribute('role') === 'checkbox' && control.querySelector('input[type="checkbox"]')));
      const box = checkboxes.find(input => {
        const labels = [...(input.labels || [])].map(label => clean(label.textContent));
        const labelledBy = (input.getAttribute('aria-labelledby') || '').split(/\s+/)
          .map(id => document.getElementById(id))
          .filter(Boolean)
          .map(label => clean(label.textContent));
        const wrapper = input.closest('label, .MuiFormControlLabel-root, [role="checkbox"]');
        return [...labels, ...labelledBy, clean(input.getAttribute('aria-label')), clean(wrapper && wrapper.textContent)]
          .some(label => label.includes(ignoreText));
      }) || [...dialog.querySelectorAll('label, .MuiFormControlLabel-root')]
        .find(label => clean(label.textContent).includes(ignoreText))
        ?.querySelector('input[type="checkbox"], [role="checkbox"]');
      let relatedBox = box;
      if (!relatedBox) {
        const label = [...dialog.querySelectorAll('label, span, p, div')]
          .find(el => clean(el.textContent) === ignoreText);
        for (let parent = label, depth = 0; parent && parent !== dialog && depth < 5; parent = parent.parentElement, depth++) {
          const controls = checkboxes.filter(control => parent.contains(control));
          if (controls.length === 1) { relatedBox = controls[0]; break; }
        }
      }
      if (!relatedBox) return stop('dialog', 'The Assets without Timestamp dialog has no Ignore checkbox. Nothing was clicked.');
      const checked = 'checked' in relatedBox ? relatedBox.checked : relatedBox.getAttribute('aria-checked') === 'true';
      if (!checked) return act(relatedBox, 'tick-ignore-timestamp', 'dialog');
      const masterApproving = kind === 'master' &&
        [...document.querySelectorAll('h6')].some(h => shown(h) && clean(h.textContent) === 'approving');
      const masterApprove = masterApproving && buttons.find(button =>
        !dialog.contains(button) &&
        clean(button.textContent) === 'Approve' &&
        !button.disabled &&
        button.classList.contains('MuiButton-containedSuccess'));
      if (masterApprove) return act(masterApprove, 'approve-master-after-ignore', 'approving');
      const dialogButtons = [...dialog.querySelectorAll('button')];
      const approve = dialogButtons.find(button => clean(button.textContent) === 'Approve');
      if (approve && !approve.disabled) return act(approve, 'approve-after-ignore', 'dialog');
      const submit = dialogButtons.find(button => /^Submit/i.test(clean(button.textContent)));
      if (submit && !submit.disabled) return act(submit, 'submit-after-ignore', 'dialog');
      if ((approve && approve.disabled) || (submit && submit.disabled)) {
        return report('dialog-wait', {next: 'wait', message: 'The dialog confirmation button is disabled. Waiting for LearnCraft to finish processing.'});
      }
      return report('dialog-wait', {next: 'wait', message: 'The timestamp dialog is still open without an enabled Approve or Submit button. Waiting for LearnCraft to finish processing.'});
    }
    if (kind === 'variant' && /^Update this Course Variant/.test(title)) {
      const ok = inDialog(label => label === 'Update');
      if (ok) return act(ok, 'confirm-update', 'dialog');
      const disabledUpdate = [...dialog.querySelectorAll('button')]
        .find(button => clean(button.textContent) === 'Update' && button.disabled);
      return disabledUpdate
        ? report('dialog-wait', {next: 'wait', message: 'The Update confirmation is disabled. Waiting for LearnCraft to finish updating this variant.'})
        : stop('dialog', 'The Update dialog has no Update button. Nothing was clicked.');
    }
    if (kind === 'variant' && /^Submit for Ready/.test(title)) {
      const ok = inDialog(label => label === 'Submit');
      if (ok) return act(ok, 'confirm-submit-ready', 'dialog');
      const disabledSubmit = [...dialog.querySelectorAll('button')]
        .find(button => clean(button.textContent) === 'Submit' && button.disabled);
      return disabledSubmit
        ? report('dialog-wait', {next: 'wait', message: 'The Submit for Ready confirmation is disabled. Waiting for LearnCraft to finish processing this variant.'})
        : stop('dialog', 'The Submit for Ready dialog has no Submit button. Nothing was clicked.');
    }
    return stop('dialog', `Unexpected dialog "${title}". Nothing was clicked.`);
  }

  if (kind === 'other') return stop('other', 'This tab is not a Master Canvas or Course Variant page.');
  const statusEl = [...document.querySelectorAll('h6')].find(h => shown(h) && /^(draft|ready|alert|approving)$/.test(clean(h.textContent)));
  if (!statusEl) return report('loading', {message: 'Waiting for the page to show its status'});
  const status = clean(statusEl.textContent);

  if (kind === 'master') {
    if (status === 'alert') {
      const update = find('Update', button => button.classList.contains('MuiButton-containedError'));
      return update ? act(update, 'update-master-alert', 'alert') : stop('alert', 'The red Master Update button is not available. Nothing was clicked.');
    }
    if (status === 'draft') {
      const b = find('Submit for Approval');
      return b ? act(b, 'submit-for-approval', 'draft') : stop('draft', 'The Submit for Approval button is not available. Nothing was clicked.');
    }
    if (status === 'approving') {
      const b = find('Approve');
      return b ? act(b, 'approve', 'approving') : stop('approving', 'The Approve button is not available. Nothing was clicked.');
    }
    if (status === 'ready') {
      const seen = new Map();
      for (const a of document.querySelectorAll('a[href*="/course-variant/normal/"]')) {
        const url = new URL(a.getAttribute('href'), location.href);
        const m = /^\/course-variant\/normal\/([^/]+)\/overview\/?$/.exec(url.pathname);
        if (m && !seen.has(decodeURIComponent(m[1]))) seen.set(decodeURIComponent(m[1]), url.href);
      }
      const variants = [...seen].map(([c, href]) => ({code: c, href}));
      return report('ready', {next: 'variants', variants, message: variants.length ? variants.length + ' variant(s) found' : 'Master is ready. No variant links found on this page.'});
    }
    return stop(status, `Unknown master status "${status}". Nothing was clicked.`);
  }

  // kind === 'variant'
  if (status === 'alert') {
    const b = find('Update', x => x.classList.contains('MuiButton-containedError'));
    return b ? act(b, 'update-alert', 'alert') : stop('alert', 'The red Update button is not available. Nothing was clicked.');
  }
  if (status === 'draft') {
    const b = find('Submit as Ready');
    return b ? act(b, 'submit-as-ready', 'draft') : stop('draft', 'The Submit as Ready button is not available. Nothing was clicked.');
  }
  if (status === 'ready') {
    const warned = [...document.querySelectorAll('.MuiAlert-colorWarning')].some(shown);
    if (warned) {
      const b = find('Update', x => x.classList.contains('MuiButton-containedSuccess'));
      return b ? act(b, 'update-green', 'ready-warning') : report('ready-warning', {message: 'Waiting for the green Update button'});
    }
    const goLive = buttons.find(b => clean(b.textContent) === 'Go live') || [...document.querySelectorAll('button')].find(b => shown(b) && clean(b.textContent) === 'Go live');
    if (goLive && goLive.disabled) return report('done', {next: 'done', message: 'Variant is ready.'});
    return stop('ready', goLive ? 'Go live is enabled but LearnCraft shows no warning. Nothing was clicked; check this variant by hand.' : 'Ready, but no Go live button was found. Check this variant by hand.');
  }
  return stop(status, `Unknown variant status "${status}". Nothing was clicked.`);
}
