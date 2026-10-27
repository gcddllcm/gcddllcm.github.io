// Tests for js/pdfworker.js (no browser needed: the canvas and image decoding are replaced by stand-ins).
// Run: node tests/pdfworker.test.mjs
import {zipSync, unzlibSync, strToU8} from '../js/vendor/fflate.js';
import assert from 'node:assert/strict';

let failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } }

// ---- tiny fake image files: only the headers matter to the worker ----
const be16 = n => [n >> 8, n & 255], be32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const jpeg = (w, h, comps = 3) => new Uint8Array([0xFF, 0xD8, 0xFF, 0xC0, ...be16(8 + 3 * comps), 8, ...be16(h), ...be16(w), comps, ...Array(3 * comps).fill(1), 0xFF, 0xD9]);
const png = (w, h) => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const pageSvg = (w, h, href) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffffff"/><image x="0" y="0" width="${w}" height="${h}" xlink:href="${href}"/></svg>`;
const drawnSvg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="M0 0L10 10" stroke="#000"/></svg>`;
const notebook = files => { const o = {}; for (const [k, v] of Object.entries(files)) o[k] = typeof v === 'string' ? strToU8(v) : v; return zipSync(o); };

// ---- stand-ins for the browser, recording what the worker asked for ----
const canvases = [], posted = [];
let pixelAt = () => [255, 255, 255];
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {   // reads the size from the fake file header, like a real decoder would
  const b = new Uint8Array(await blob.arrayBuffer());
  const png = b[0] === 0x89, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return png ? {width: dv.getUint32(16), height: dv.getUint32(20), close() {}} : {width: dv.getUint16(9), height: dv.getUint16(7), close() {}};
};
globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.w = w; this.h = h; canvases.push([w, h]); }
  getContext() {
    return {fillRect() {}, drawImage() {}, getImageData: (x0, y0, w, h) => {   // the "decoded picture": whatever pixelAt says
      const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([...pixelAt(x, y), 255], (y * w + x) * 4);
      return {data: d};
    }};
  }
  async convertToBlob() { return new Blob([jpeg(this.w, this.h)]); }
};
globalThis.postMessage = m => {
  posted.push(m);
  if (m.type === 'renderSvg') {   // the page would draw the SVG here: answer with a JPEG of the requested size
    canvases.push([m.width, m.height]);
    setTimeout(() => globalThis.onmessage({data: {type: 'renderedSvg', reqId: m.reqId, ok: true, bytes: jpeg(m.width, m.height), w: m.width, h: m.height}}), 0);
  }
};
await import('../js/pdfworker.js');

let seq = 0;
async function run(files, {resolution = 1600, quality = 90, title = 'test'} = {}) {
  posted.length = 0; canvases.length = 0;
  const bytes = notebook(files);
  await globalThis.onmessage({data: {id: ++seq, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), title, quality, resolution}});
  const done = posted.find(m => m.type === 'done'), error = posted.find(m => m.type === 'error');
  assert.ok(done, 'no PDF was produced' + (error ? ': ' + error.message : ''));
  const text = Buffer.from(done.bytes).toString('latin1');
  const images = [...text.matchAll(/\/Width (\d+) \/Height (\d+) \/ColorSpace (\/\w+)/g)].map(m => ({w: +m[1], h: +m[2], cs: m[3]}));
  return {done, text, images, bytes: done.bytes};
}

await check('PDF structure: header, trailer and every xref offset point at the right object', async () => {
  const {text, bytes} = await run({'page1.svg': pageSvg(1024, 1365, 'a.jpg'), 'a.jpg': jpeg(1000, 1400), 'page2.svg': pageSvg(800, 600, 'b.jpg'), 'b.jpg': jpeg(800, 600)});
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const start = +text.match(/startxref\n(\d+)/)[1];
  assert.equal(text.slice(start, start + 4), 'xref');
  const lines = text.slice(start).split('\n'), count = +lines[1].split(' ')[1];
  for (let i = 1; i < count; i++) assert.ok(text.slice(+lines[2 + i].slice(0, 10)).startsWith(`${i} 0 obj`), `object ${i} is not at its xref offset`);
  assert.equal(bytes.length, Buffer.byteLength(text, 'latin1'));
});

await check('a normal JPEG page goes into the PDF unchanged (no canvas used)', async () => {
  const {images, done} = await run({'page1.svg': pageSvg(1024, 1365, 'a.jpg'), 'a.jpg': jpeg(1000, 1400)});
  assert.deepEqual(images, [{w: 1000, h: 1400, cs: '/DeviceRGB'}]);
  assert.equal(canvases.length, 0);
  assert.equal(done.failed, 0);
});

await check('grayscale JPEG keeps /DeviceGray', async () => {
  const {images} = await run({'page1.svg': pageSvg(800, 600, 'g.jpg'), 'g.jpg': jpeg(800, 600, 1)});
  assert.equal(images[0].cs, '/DeviceGray');
});

await check('CMYK JPEG is converted to RGB (it comes out black when embedded as it is)', async () => {
  const {images, done} = await run({'page1.svg': pageSvg(800, 600, 'c.jpg'), 'c.jpg': jpeg(800, 600, 4)});
  assert.equal(images[0].cs, '/DeviceRGB');
  assert.deepEqual(canvases, [[800, 600]]);
  assert.equal(done.failed, 0);
});

await check('an image wider than the chosen sharpness is scaled down', async () => {
  const {images} = await run({'page1.svg': pageSvg(1024, 768, 'big.jpg'), 'big.jpg': jpeg(3200, 2400)}, {resolution: 1600});
  assert.deepEqual(images, [{w: 1600, h: 1200, cs: '/DeviceRGB'}]);
});

await check('original size: a huge PNG is kept as large as the canvas limit allows', async () => {
  const {images} = await run({'page1.svg': pageSvg(1024, 1024, 'p.png'), 'p.png': png(5000, 5000)}, {resolution: 0});
  assert.equal(images.length, 1);
  assert.ok(images[0].w * images[0].h <= 16000000, 'canvas larger than 16 million pixels');
  assert.ok(Math.abs(images[0].w / images[0].h - 1) < 0.01, 'proportions changed');
});

await check('a page that has to be drawn is never requested bigger than the canvas limit', async () => {
  const {images} = await run({'page1.svg': drawnSvg(4000, 6000)}, {resolution: 4000});
  assert.equal(posted.filter(m => m.type === 'renderSvg').length, 1);
  assert.ok(images[0].w * images[0].h <= 16000000);
  assert.ok(Math.abs(images[0].w / images[0].h - 4000 / 6000) < 0.01, 'proportions changed');
});

await check('pages come out in page order and the title is stored (Thai works)', async () => {
  const {text, images} = await run({'page10.svg': pageSvg(100, 100, 'x.jpg'), 'page2.svg': pageSvg(100, 100, 'y.jpg'), 'x.jpg': jpeg(111, 100), 'y.jpg': jpeg(222, 100)}, {title: 'สมุด'});
  assert.deepEqual(images.map(i => i.w), [222, 111]);
  assert.ok(text.includes('/Title <FEFF' + [...'สมุด'].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>'));
});

await check('a notebook with no pages gives a clear error', async () => {
  posted.length = 0;
  const bytes = notebook({'readme.txt': 'x'});
  await globalThis.onmessage({data: {id: ++seq, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), title: 't', quality: 90, resolution: 1600}});
  assert.match(posted.find(m => m.type === 'error').message, /No pageX\.svg/);
});

await check('one page that cannot be drawn is skipped and reported, the rest still convert', async () => {
  const realPost = globalThis.postMessage;
  globalThis.postMessage = m => {
    if (m.type === 'renderSvg') return void setTimeout(() => globalThis.onmessage({data: {type: 'renderedSvg', reqId: m.reqId, ok: false, error: 'broken page'}}), 0);
    realPost(m);
  };
  try {
    const {done, images} = await run({'page1.svg': pageSvg(100, 100, 'x.jpg'), 'x.jpg': jpeg(100, 100), 'page2.svg': drawnSvg(100, 100)});
    assert.equal(images.length, 1);
    assert.equal(done.failed, 1);
    assert.match(done.err, /page 2: broken page/);
  } finally { globalThis.postMessage = realPost; }
});

// ---- lossless pages: read the pixels back out of the PDF and compare ----
function unfilter(data, w, h, bpp) {
  const rl = w * bpp, out = new Uint8Array(h * rl), used = new Set();
  for (let y = 0; y < h; y++) {
    const f = data[y * (rl + 1)]; used.add(f);
    for (let i = 0; i < rl; i++) {
      const x = data[y * (rl + 1) + 1 + i], a = i >= bpp ? out[y * rl + i - bpp] : 0, b = y ? out[(y - 1) * rl + i] : 0, c = y && i >= bpp ? out[(y - 1) * rl + i - bpp] : 0;
      const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      out[y * rl + i] = (x + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  return {out, used};
}
function flatePixels(text, bytes) {
  const at = text.indexOf('/Filter /FlateDecode');
  assert.ok(at > 0, 'no Flate image in the PDF');
  const head = text.slice(at, text.indexOf('stream\n', at));
  const parms = head.match(/\/Predictor 15 \/Colors (\d) \/BitsPerComponent 8 \/Columns (\d+)/);
  assert.ok(parms, 'missing PNG predictor settings');
  const len = +head.match(/\/Length (\d+)/)[1], start = text.indexOf('stream\n', at) + 7;
  return {bpp: +parms[1], w: +parms[2], ...(() => { const raw = unzlibSync(bytes.subarray(start, start + len)); return {raw}; })()};
}

await check('a PNG page keeps every pixel (Flate with PNG filters) and does not touch the JPEG canvas path', async () => {
  const W = 300, H = 200;
  pixelAt = (x, y) => x < 100 ? [10, 20, 30] : [(x * 7 + y * 3) & 255, ((x * x >> 3) ^ (y * 5)) & 255, ((x + y) * 11) & 255];
  const {text, bytes, images, done} = await run({'page1.svg': pageSvg(1024, 683, 'p.png'), 'p.png': png(W, H)});
  assert.equal(done.failed, 0);
  assert.deepEqual(images, [{w: W, h: H, cs: '/DeviceRGB'}]);
  const {bpp, w, raw} = flatePixels(text, bytes);
  assert.equal(bpp, 3); assert.equal(w, W);
  const {out, used} = unfilter(raw, W, H, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.deepEqual([...out.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)], pixelAt(x, y), `pixel ${x},${y}`);
  assert.ok(used.size > 1, 'only one PNG filter type was ever used');
});

await check('a black and white / grey PNG is stored as one channel (DeviceGray)', async () => {
  const W = 120, H = 90;
  pixelAt = (x, y) => { const v = (x * 3 + y) & 255; return [v, v, v]; };
  const {text, bytes, images} = await run({'page1.svg': pageSvg(1024, 768, 'g.png'), 'g.png': png(W, H)});
  assert.deepEqual(images, [{w: W, h: H, cs: '/DeviceGray'}]);
  const {bpp, raw} = flatePixels(text, bytes);
  assert.equal(bpp, 1);
  const {out} = unfilter(raw, W, H, 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(out[y * W + x], (x * 3 + y) & 255);
});

await check('WebP, GIF and BMP single-image pages also stay lossless', async () => {
  pixelAt = (x, y) => [x & 255, y & 255, 7];
  for (const ext of ['webp', 'gif', 'bmp']) {
    const f = ext === 'webp' ? 'RIFF....WEBPVP8 ' : 'x';   // readImageInfo cannot read the size: the "decoder" stand-in does
    globalThis.createImageBitmapOrig ??= globalThis.createImageBitmap;
    globalThis.createImageBitmap = async () => ({width: 64, height: 48, close() {}});
    try {
      const {images, text} = await run({'page1.svg': pageSvg(640, 480, `i.${ext}`), [`i.${ext}`]: strToU8(f)});
      assert.deepEqual(images, [{w: 64, h: 48, cs: '/DeviceRGB'}], ext);
      assert.ok(text.includes('/Filter /FlateDecode'), ext);
    } finally { globalThis.createImageBitmap = globalThis.createImageBitmapOrig; }
  }
});

await check('a PNG wider than the chosen sharpness, or larger than 12 million pixels, is saved as JPEG', async () => {
  pixelAt = () => [50, 60, 70];
  let r = await run({'page1.svg': pageSvg(1024, 768, 'w.png'), 'w.png': png(2400, 1800)}, {resolution: 1600});
  assert.deepEqual(r.images, [{w: 1600, h: 1200, cs: '/DeviceRGB'}]);
  assert.ok(!r.text.includes('/FlateDecode'));
  r = await run({'page1.svg': pageSvg(1024, 768, 'v.png'), 'v.png': png(4000, 3200)}, {resolution: 0});   // 12.8 million pixels
  assert.ok(!r.text.includes('/FlateDecode'));
  assert.equal(r.images.length, 1);
});

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
