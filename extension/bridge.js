// Runs on your Penguin Logistics page only (the page must contain <meta name="penguin-logistics">).
// Passes messages between the page and the extension. It never sends anything over the network.
(() => {
  if (!document.querySelector('meta[name="penguin-logistics"]')) return;
  let VERSION = '0';
  try { VERSION = chrome.runtime.getManifest().version; } catch { return; }
  const target = location.origin === 'null' ? '*' : location.origin;
  const reply = (id, payload) => window.postMessage({pl: 'learncraft-reply', id, ...payload}, target);
  // Progress of a long extraction, pushed by the background script while it is still running.
  chrome.runtime.onMessage.addListener(m => {
    if (m && m.ns === 'pl-lc-progress' && typeof m.id === 'string') window.postMessage({pl: 'learncraft-progress', id: m.id, progress: m.progress}, target);
  });

  window.addEventListener('message', e => {
    if (e.source !== window) return;
    const m = e.data;
    if (!m || m.pl !== 'learncraft' || typeof m.id !== 'string') return;
    // The id lets the page tell copies apart (Chrome can hold several copies of this extension at once).
    // A copy that was reloaded or removed while this page stayed open is orphaned: it stays silent on ping,
    // otherwise the page would keep hearing its old version.
    if (m.action === 'ping') {
      let alive = false;
      try { alive = !!(chrome.runtime && chrome.runtime.id); } catch {}
      if (!alive) return;
      return reply(m.id, {ok: true, data: {version: VERSION, id: chrome.runtime.id}});
    }
    if (m.action === 'cancel') {        // the page gave up waiting: stop the script that is still running in the course tab
      if (typeof m.target === 'string') { try { chrome.runtime.sendMessage({ns: 'pl-lc', action: 'cancel', reqId: m.target}, () => void chrome.runtime.lastError); } catch {} }
      return;
    }
    if (m.action !== 'list' && m.action !== 'extract' && m.action !== 'list-timestamp-assets' && m.action !== 'fill-timestamps' && m.action !== 'golive') return reply(m.id, {ok: false, error: 'Unknown action'});
    try {
      chrome.runtime.sendMessage({ns: 'pl-lc', action: m.action, tabId: m.tabId, reqId: m.id, dryRun: !!m.dryRun, closeDone: !!m.closeDone, variantCodes: m.variantCodes, courseCode: m.courseCode, entries: m.entries, groups: m.groups, subsectionAssetIndices: m.subsectionAssetIndices}, res => {
        if (chrome.runtime.lastError) return reply(m.id, {ok: false, error: chrome.runtime.lastError.message});
        reply(m.id, res || {ok: false, error: 'No answer from the extension'});
      });
    } catch {
      reply(m.id, {ok: false, error: 'The extension was reloaded. Refresh this page.'});
    }
  });
  // Share the site's colour theme with the popup (stored locally in the browser, never sent anywhere).
  const syncTheme = () => {
    try {
      const t = localStorage.getItem('pl-theme') === 'light' ? 'light' : 'dark';
      chrome.storage.local.set({plTheme: t});
    } catch {}
  };
  syncTheme();
  window.addEventListener('pl-theme-change', syncTheme);
  window.postMessage({pl: 'learncraft-ready', version: VERSION}, target);
})();
