// Applies the theme chosen on the Penguin Logistics site (bridge.js copies it into chrome.storage).
// Dark is the default. The last value is also kept in localStorage so the popup opens in the right colours at once.
(() => {
  const set = t => document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  let cached = 'dark';
  try { cached = localStorage.getItem('plTheme') || 'dark'; } catch {}
  set(cached);
  try {
    chrome.storage.local.get('plTheme', r => {
      const t = r && r.plTheme === 'light' ? 'light' : 'dark';
      set(t);
      try { localStorage.setItem('plTheme', t); } catch {}
    });
    chrome.storage.onChanged.addListener(c => { if (c.plTheme) set(c.plTheme.newValue); });
  } catch {}
})();
