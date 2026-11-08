// style.css and extension/popup.css keep their colours in theme tokens (--kbg12, --ktx3 ...).
// The older source-text tests assert the dark colours, so reading those two files through
// fs.readFileSync returns the CSS with every token replaced by its dark value.
import fs from 'node:fs';

const original = fs.readFileSync;
const expand = css => {
  const dark = new Map();
  for (const m of css.matchAll(/(--k(?:bg|tx|bd|sh)\d+):([^;}]+)/g)) if (!dark.has(m[1])) dark.set(m[1], m[2]);
  return css.replace(/var\((--k(?:bg|tx|bd|sh)\d+)\)/g, (all, name) => dark.get(name) ?? all);
};
fs.readFileSync = function (file, ...rest) {
  const result = original.call(this, file, ...rest);
  const name = String(file instanceof URL ? file.pathname : file);
  if (typeof result === 'string' && /(^|[\\/])(style|popup)\.css$/.test(name)) return expand(result);
  return result;
};
