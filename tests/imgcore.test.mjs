// Tests for js/imgcore.js (no browser needed). Run: node tests/imgcore.test.mjs
import {crc32, pngSetDpi, jpgSetDpi, readImageInfo, resizeLanczos, sizeProblem, bmpEncode} from '../js/imgcore.js';
import assert from 'node:assert/strict';

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } }
const be32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => { const t = [...type].map(c => c.charCodeAt(0)); const body = new Uint8Array([...t, ...data]); return [...be32(data.length), ...body, ...be32(crc32(body))]; };
const png = (w, h) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...chunk('IHDR', [...be32(w), ...be32(h), 8, 6, 0, 0, 0]), ...chunk('IDAT', [0x78, 0x9C, 3, 0, 0, 0, 0, 1]), ...chunk('IEND', [])]);

await check('PNG: write and read back DPI', () => {
  const out = pngSetDpi(png(40, 30), 300);
  const info = readImageInfo(out, '.png');
  assert.equal(info.width, 40); assert.equal(info.height, 30); assert.equal(info.dpi, 300);
  assert.equal(readImageInfo(pngSetDpi(out, 96), '.png').dpi, 96);   // replacing an existing pHYs chunk
});

// minimal JPEG: SOI, optional JFIF, EXIF (II, IFD0 with XRes/YRes/Unit), SOF0, EOI
function jpeg({jfif, exif}) {
  const seg = (m, d) => [0xFF, m, (d.length + 2) >> 8, (d.length + 2) & 255, ...d];
  const parts = [0xFF, 0xD8];
  if (jfif) parts.push(...seg(0xE0, [0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0]));
  if (exif) {
    const le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255], le16 = n => [n & 255, n >> 8];
    const entries = [[0x011A, 5, 1, 38], [0x011B, 5, 1, 46], [0x0128, 3, 1, 0]];   // value offsets point past the IFD (8 + 2 + 36 + 4 = 50 -> use 38/46 from TIFF start)
    const ifd = [...le16(3)];
    for (const [tag, type, cnt, val] of entries) ifd.push(...le16(tag), ...le16(type), ...le32(cnt), ...(tag === 0x0128 ? [...le16(1), 0, 0] : le32(val)));
    ifd.push(...le32(0));
    const tiff = [0x49, 0x49, 42, 0, ...le32(8), ...ifd, ...le32(72), ...le32(1), ...le32(72), ...le32(1)];
    // IFD0 starts at 8, has 2 + 36 + 4 = 42 bytes -> data at 50; fix offsets to 50 and 58
    tiff.splice(8 + 2 + 8, 4, ...le32(50)); tiff.splice(8 + 2 + 12 + 8, 4, ...le32(58));
    parts.push(...seg(0xE1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]));
  }
  parts.push(...seg(0xC0, [8, 0, 30, 0, 40, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), 0xFF, 0xD9);
  return new Uint8Array(parts);
}
function exifDpi(u8) {   // read XResolution back out of the EXIF block
  const dv = new DataView(u8.buffer, u8.byteOffset);
  let p = 2; while (!(u8[p + 1] === 0xE1)) p += 2 + dv.getUint16(p + 2);
  const base = p + 10, ifd = base + dv.getUint32(base + 4, true);
  for (let i = 0; i < dv.getUint16(ifd, true); i++) {
    const e = ifd + 2 + i * 12;
    if (dv.getUint16(e, true) === 0x011A) { const o = base + dv.getUint32(e + 8, true); return dv.getUint32(o, true) / dv.getUint32(o + 4, true); }
  }
}
await check('JPEG with JFIF + EXIF: both updated', () => {
  const out = jpgSetDpi(jpeg({jfif: true, exif: true}), 300);
  assert.equal(readImageInfo(out, '.jpg').dpi, 300); assert.equal(exifDpi(out), 300);
  assert.equal(readImageInfo(out, '.jpg').width, 40); assert.equal(readImageInfo(out, '.jpg').height, 30);
});
await check('JPEG with EXIF only: JFIF added in front, both correct', () => {
  const src = jpeg({jfif: false, exif: true}), out = jpgSetDpi(src, 200);
  assert.equal(out.length, src.length + 18); assert.equal(readImageInfo(out, '.jpg').dpi, 200); assert.equal(exifDpi(out), 200);
});
await check('JPEG without EXIF still works', () => {
  assert.equal(readImageInfo(jpgSetDpi(jpeg({jfif: false, exif: false}), 150), '.jpg').dpi, 150);
});
await check('JPEG: DPI is clamped to 16 bits', () => {
  assert.equal(readImageInfo(jpgSetDpi(jpeg({jfif: true, exif: false}), 70000), '.jpg').dpi, 65535);
});
await check('BMP: header carries size and DPI', async () => {
  const out = new Uint8Array(await bmpEncode({width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4).fill(255)}, 300).arrayBuffer());
  const info = readImageInfo(out, '.bmp'); assert.equal(info.width, 3); assert.equal(info.height, 2); assert.equal(info.dpi, 300);
});

const solid = (w, h, r, g, b, a = 255) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } return {width: w, height: h, data: d}; };
await check('resize: solid colour stays solid (down and up)', async () => {
  for (const [w, h] of [[10, 7], [90, 70]]) {
    const o = await resizeLanczos(solid(40, 30, 200, 100, 50), w, h);
    assert.equal(o.width, w); assert.equal(o.height, h);
    for (let i = 0; i < o.data.length; i += 4) assert.deepEqual([...o.data.subarray(i, i + 4)], [200, 100, 50, 255]);
  }
});
await check('resize: transparent pixels keep their alpha and no dark fringe', async () => {
  const o = await resizeLanczos(solid(40, 30, 10, 220, 30, 128), 20, 15);
  for (let i = 0; i < o.data.length; i += 4) { assert.ok(Math.abs(o.data[i + 3] - 128) <= 1); assert.ok(Math.abs(o.data[i + 1] - 220) <= 2); }
});
await check('resize: yield callback is called on tall images', async () => {
  let n = 0; await resizeLanczos(solid(8, 300, 1, 2, 3), 4, 150, async () => { n++; });
  assert.ok(n > 0);
});
await check('size check: sensible jobs pass, huge ones are refused with the right reason', () => {
  assert.equal(sizeProblem(4000, 3000, 2480, 3508), null);
  assert.match(sizeProblem(12000, 9000, 100, 100), /Image too large/);
  assert.match(sizeProblem(100, 100, 12000, 9000), /Output too large/);
  assert.match(sizeProblem(9000, 10000, 9000, 10000), /memory|too large/i);
});

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
