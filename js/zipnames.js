// Repairs file names read from a .zip / .notebook archive (no DOM, so it can be tested in Node).
//
// SMART Notebook (Windows) writes names as raw UTF-8 bytes but does NOT set the zip "UTF-8" flag.
// fflate then decodes such names as Latin-1, so "images/ข้อสอบ_01.jpg" comes out as "images/à¸\u0082à¹\u0089à¸­..." and
// never matches the href stored in pageN.svg: the image is silently dropped and only the handwriting is left.
// Names that really are Latin-1/CP437 (not valid UTF-8) and names already decoded as UTF-8 are left alone.
const utf8 = new TextDecoder('utf-8', {fatal: true});

export function fixName(name) {
  let ascii = true;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c > 255) return name;          // already real Unicode (the archive had the UTF-8 flag): nothing to repair
    if (c > 127) ascii = false;
  }
  if (ascii) return name;
  try { return utf8.decode(Uint8Array.from(name, ch => ch.charCodeAt(0))); }
  catch { return name; }               // not valid UTF-8 once turned back into bytes: it was a genuine Latin-1 name
}

// Same object as fflate's unzipSync result, with repaired keys. Order is kept; a clash keeps the first entry.
export function fixNames(files) {
  const out = {};
  for (const [name, data] of Object.entries(files)) {
    const fixed = fixName(name);
    if (!(fixed in out)) out[fixed] = data;
  }
  return out;
}
