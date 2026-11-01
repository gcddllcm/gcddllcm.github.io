// Helpers shared by both LearnCraft tools for talking to the companion extension (extension/).
// Pure functions only (no DOM), so tests/extcore.test.mjs can run them in Node.

const vnum = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
// true when version a is older than version b
export const older = (a, b) => {
  const x = vnum(a), y = vnum(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};

// Chrome can hold several copies of the extension at once (dropping a ZIP onto chrome://extensions again installs a NEW copy
// and leaves the old one running). Every copy answers the page, so the page must listen to ALL answers to a ping, not just the first.
// replies: the data of every answer, e.g. [{version:'1.2.9'}, {version:'1.3.1', id:'abc...'}]
// Returns null when nobody answered, else {version: the newest one, versions: all of them (newest first), count, duplicate}.
export function summarizeBridges(replies) {
  const list = (replies || []).filter(r => r && typeof r.version === 'string' && r.version);
  if (!list.length) return null;
  const versions = list.map(r => r.version).sort((a, b) => (older(a, b) ? 1 : older(b, a) ? -1 : 0));
  return {version: versions[0], versions, count: list.length, duplicate: list.length > 1};
}

// A download must never silently hand back an old extension: if the server's manifest is older than the page needs,
// the folder being served is out of date (or an old copy was cached). Returns an error text, or '' when all is well.
export function staleDownload(foundVersion, neededVersion) {
  return older(foundVersion, neededVersion)
    ? `The extension download is outdated (v${foundVersion}; v${neededVersion} or newer is required). Reload this page and try again. If it still fails, contact the site administrator.`
    : '';
}

// Address of a file next to the page that can never come from an old cached copy (a unique query string plus cache:'reload').
export const freshUrl = (path, base, now = Date.now()) => {
  const u = new URL(path, base);
  u.searchParams.set('cb', String(now));
  return u;
};
export const FRESH = {cache: 'reload'};
