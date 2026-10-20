const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = b => {
  let c = ~0;
  for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};
const ppm = dpi => Math.round(dpi / 0.0254);

function pngSetDpi(u8, dpi) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let physPos = -1, physLen = 0;
  for (let p = 8; p + 8 <= u8.length;) {
    const len = v.getUint32(p);
    const tag = String.fromCharCode(...u8.subarray(p + 4, p + 8));
    if (tag === 'pHYs') { physPos = p; physLen = 12 + len; break; }
    if (tag === 'IDAT') break;
    p += 12 + len;
  }
  const chunk = new Uint8Array(21), cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  cv.setUint32(8, ppm(dpi));
  cv.setUint32(12, ppm(dpi));
  chunk[16] = 1;
  cv.setUint32(17, crc32(chunk.subarray(4, 17)));

  if (physPos !== -1 && physLen === 21) {
    const out = new Uint8Array(u8.length);
    out.set(u8);
    out.set(chunk, physPos);
    return out;
  }
  if (physPos !== -1) {
    const out = new Uint8Array(u8.length - physLen + 21);
    out.set(u8.subarray(0, physPos));
    out.set(chunk, physPos);
    out.set(u8.subarray(physPos + physLen), physPos + 21);
    return out;
  }
  let ihdrEnd = 33;
  if (v.getUint32(8) === 13 && String.fromCharCode(...u8.subarray(12, 16)) === 'IHDR') {
    ihdrEnd = 33;
  }
  const out = new Uint8Array(u8.length + 21);
  out.set(u8.subarray(0, ihdrEnd));
  out.set(chunk, ihdrEnd);
  out.set(u8.subarray(ihdrEnd), ihdrEnd + 21);
  return out;
}

function jpgSetDpi(u8, dpi) {
  if (!(u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A)) {
    const j = new Uint8Array([0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0]);
    const o = new Uint8Array(u8.length + 18);
    o.set(u8.subarray(0, 2));
    o.set(j, 2);
    o.set(u8.subarray(2), 20);
    u8 = o;
  }
  u8[13] = 1;
  u8[14] = dpi >> 8;
  u8[15] = dpi & 255;
  u8[16] = dpi >> 8;
  u8[17] = dpi & 255;
  return u8;
}

function bmpEncode(img, dpi) {
  const {width: w, height: h, data} = img, n = w * h * 4, u = new Uint8Array(54 + n), v = new DataView(u.buffer);
  u[0] = 66; u[1] = 77;
  v.setUint32(2, 54 + n, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, -h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 32, true);
  v.setUint32(34, n, true);
  v.setInt32(38, ppm(dpi), true);
  v.setInt32(42, ppm(dpi), true);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4, q = 54 + p;
    u[q] = data[p + 2]; u[q + 1] = data[p + 1]; u[q + 2] = data[p]; u[q + 3] = data[p + 3];
  }
  return new Blob([u], {type: 'image/bmp'});
}

function readImageInfo(u8, ext) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let width = 0, height = 0, dpi = undefined;
  if (ext === '.png') {
    if (u8.length >= 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
      width = v.getUint32(16);
      height = v.getUint32(20);
    }
    for (let p = 8; p + 8 <= u8.length;) {
      const len = v.getUint32(p);
      const tag = String.fromCharCode(...u8.subarray(p + 4, p + 8));
      if (tag === 'pHYs') dpi = Math.round(v.getUint32(p + 8) * 0.0254);
      if (tag === 'IDAT') break;
      p += 12 + len;
    }
  } else if (ext === '.jpg' || ext === '.jpeg') {
    if (u8.length >= 4 && u8[0] === 0xFF && u8[1] === 0xD8) {
      let p = 2;
      while (p + 4 < u8.length) {
        if (u8[p] !== 0xFF) { p++; continue; }
        const m = u8[p + 1];
        if (m === 0xD9 || m === 0xDA) break;
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          height = (u8[p + 5] << 8) | u8[p + 6];
          width = (u8[p + 7] << 8) | u8[p + 8];
          break;
        }
        const len = (u8[p + 2] << 8) | u8[p + 3];
        p += 2 + len;
      }
      if (u8[2] === 0xFF && u8[3] === 0xE0 && u8[13] === 1) {
        dpi = (u8[14] << 8) | u8[15];
      }
    }
  } else if (ext === '.bmp') {
    if (u8.length >= 26 && u8[0] === 0x42 && u8[1] === 0x4D) {
      width = v.getInt32(18, true);
      height = Math.abs(v.getInt32(22, true));
      if (u8.length >= 42) dpi = Math.round(v.getInt32(38, true) * 0.0254);
    }
  } else if (ext === '.webp') {
    if (u8.length >= 30 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) {
      const tag = String.fromCharCode(...u8.subarray(12, 16));
      if (tag === 'VP8 ') {
        width = (u8[26] | (u8[27] << 8)) & 0x3FFF;
        height = (u8[28] | (u8[29] << 8)) & 0x3FFF;
      } else if (tag === 'VP8L') {
        const b1 = u8[21], b2 = u8[22], b3 = u8[23], b4 = u8[24];
        width = 1 + (((b2 & 0x3F) << 8) | b1);
        height = 1 + (((b4 & 0xF) << 10) | (b3 << 2) | (b2 >> 6));
      } else if (tag === 'VP8X') {
        width = 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16));
        height = 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16));
      }
    }
  }
  return {width, height, dpi};
}

// Lanczos-3 (Pillow-compatible, premultiplied alpha, vectorized memory access)
const lz = x => {
  if (x === 0) return 1;
  if (x <= -3 || x >= 3) return 0;
  const p = Math.PI * x;
  return 3 * Math.sin(p) * Math.sin(p / 3) / (p * p);
};

function coeffs(inN, outN) {
  const sc = inN / outN, fs = Math.max(sc, 1), sup = 3 * fs;
  const los = new Int32Array(outN), lens = new Int32Array(outN), weights = [];
  for (let i = 0; i < outN; i++) {
    const c = (i + 0.5) * sc;
    const lo = Math.max(0, Math.floor(c - sup + 0.5));
    const hi = Math.min(inN, Math.floor(c + sup + 0.5));
    const len = hi - lo;
    los[i] = lo;
    lens[i] = len;
    let s = 0;
    const w = new Float32Array(len);
    for (let x = lo; x < hi; x++) {
      const v = lz((x - c + 0.5) / fs);
      w[x - lo] = v;
      s += v;
    }
    const invS = 1 / s;
    for (let k = 0; k < len; k++) w[k] *= invS;
    weights.push(w);
  }
  return {los, lens, weights};
}

export function resizeLanczos(img, ow, oh) {
  const {width: iw, height: ih, data: src} = img;
  const cx = coeffs(iw, ow), cy = coeffs(ih, oh);
  const nPix = iw * ih, inv255 = 1 / 255;

  let hasAlpha = false;
  for (let i = 3; i < nPix * 4; i += 4) {
    if (src[i] !== 255) { hasAlpha = true; break; }
  }

  const preSrc = new Float32Array(nPix * 4);
  if (hasAlpha) {
    for (let i = 0; i < nPix * 4; i += 4) {
      const a = src[i + 3], al = a * inv255;
      preSrc[i]     = src[i]     * al;
      preSrc[i + 1] = src[i + 1] * al;
      preSrc[i + 2] = src[i + 2] * al;
      preSrc[i + 3] = a;
    }
  } else {
    for (let i = 0; i < nPix * 4; i += 4) {
      preSrc[i]     = src[i];
      preSrc[i + 1] = src[i + 1];
      preSrc[i + 2] = src[i + 2];
      preSrc[i + 3] = 255;
    }
  }

  const mid = new Float32Array(ow * ih * 4);
  const cxLos = cx.los, cxLens = cx.lens, cxWeights = cx.weights;

  // Pass 1: Horizontal filter
  for (let y = 0; y < ih; y++) {
    const srcRow = y * iw * 4, midRow = y * ow * 4;
    for (let x = 0; x < ow; x++) {
      const lo = cxLos[x], len = cxLens[x], w = cxWeights[x];
      let r = 0, g = 0, b = 0, a = 0, p = srcRow + (lo << 2);
      for (let k = 0; k < len; k++) {
        const f = w[k];
        r += preSrc[p]     * f;
        g += preSrc[p + 1] * f;
        b += preSrc[p + 2] * f;
        a += preSrc[p + 3] * f;
        p += 4;
      }
      const q = midRow + (x << 2);
      mid[q]     = r;
      mid[q + 1] = g;
      mid[q + 2] = b;
      mid[q + 3] = a;
    }
  }

  // Pass 2: Vertical filter with contiguous row accumulation (cache-optimized)
  const out = new Uint8ClampedArray(ow * oh * 4);
  const lineAcc = new Float32Array(ow * 4), rowFloats = ow * 4;
  const cyLos = cy.los, cyLens = cy.lens, cyWeights = cy.weights;

  for (let y = 0; y < oh; y++) {
    lineAcc.fill(0);
    const lo = cyLos[y], len = cyLens[y], w = cyWeights[y];
    for (let k = 0; k < len; k++) {
      const f = w[k], midPtr = (lo + k) * rowFloats;
      for (let i = 0; i < rowFloats; i++) {
        lineAcc[i] += mid[midPtr + i] * f;
      }
    }
    const outRow = y * rowFloats;
    if (hasAlpha) {
      for (let x = 0; x < ow; x++) {
        const q = x << 2, a = lineAcc[q + 3];
        const al = (a < 0 ? 0 : (a > 255 ? 255 : a)) * inv255;
        const invAl = al > 0 ? 1 / al : 0, oq = outRow + q;
        out[oq]     = lineAcc[q]     * invAl;
        out[oq + 1] = lineAcc[q + 1] * invAl;
        out[oq + 2] = lineAcc[q + 2] * invAl;
        out[oq + 3] = a;
      }
    } else {
      for (let i = 0; i < rowFloats; i += 4) {
        const oq = outRow + i;
        out[oq]     = lineAcc[i];
        out[oq + 1] = lineAcc[i + 1];
        out[oq + 2] = lineAcc[i + 2];
        out[oq + 3] = 255;
      }
    }
  }
  return {width: ow, height: oh, data: out};
}

// ---- Memory safety: reject files that would exceed safe memory budget ----
// Lanczos resize allocates: preSrc (Float32 iw*ih*4) + mid (Float32 ow*ih*4) + out (Uint8Clamped ow*oh*4)
// Plus source ImageData. For a 100 MP image this is ~1.6 GB peak — reasonable limit for a worker.
const MAX_MEGAPIXELS = 100;

function estimatePixelBudget(iw, ih, ow, oh) {
  const srcPx = iw * ih;
  const dstPx = ow * oh;
  // preSrc: srcPx*16, mid: ow*ih*16, out: dstPx*4, source imagedata: srcPx*4
  return (srcPx * 20) + (ow * ih * 16) + (dstPx * 4);
}

// ---- Global error handlers to prevent silent worker death ----
let _currentTaskId = null;

self.onerror = (message, source, lineno, colno, error) => {
  const id = _currentTaskId;
  if (id != null) {
    try { self.postMessage({id, ok: false, error: `Worker error: ${message || error || 'unknown'}`}); } catch {}
  }
  _currentTaskId = null;
};

self.onunhandledrejection = (event) => {
  const id = _currentTaskId;
  const reason = event.reason;
  if (id != null) {
    try { self.postMessage({id, ok: false, error: `Unhandled rejection: ${reason?.message || reason || 'unknown'}`}); } catch {}
  }
  _currentTaskId = null;
};

self.onmessage = async e => {
  const {id, file, ow, oh, dpi, ext} = e.data;
  _currentTaskId = id;
  try {
    // Fast-path: keep original size (DPI-only change) -> 0ms recompression, 100% loss-free
    if (!ow && !oh) {
      const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf);
      let outBlob;
      if (ext === '.png') outBlob = new Blob([pngSetDpi(u8, dpi)], {type: 'image/png'});
      else if (ext === '.jpg' || ext === '.jpeg') outBlob = new Blob([jpgSetDpi(u8, dpi)], {type: 'image/jpeg'});
      else if (ext === '.bmp') {
        const v = new DataView(u8.buffer);
        if (u8.length >= 42) { v.setInt32(38, ppm(dpi), true); v.setInt32(42, ppm(dpi), true); }
        outBlob = new Blob([u8], {type: 'image/bmp'});
      } else {
        outBlob = file;
      }
      const outU8 = new Uint8Array(await outBlob.arrayBuffer());
      const info = readImageInfo(outU8, ext);
      _currentTaskId = null;
      self.postMessage({id, ok: true, blob: outBlob, w: info.width, h: info.height, dpi: info.dpi});
      return;
    }

    // Decoding via createImageBitmap + OffscreenCanvas
    const bmp = await createImageBitmap(file, {imageOrientation: 'none'});
    const iw = bmp.width, ih = bmp.height;

    // Memory safety check: reject if pixel budget exceeds safe threshold
    const srcMegapixels = (iw * ih) / 1e6;
    const dstMegapixels = (ow * oh) / 1e6;
    const peakMegapixels = Math.max(srcMegapixels, dstMegapixels);
    if (peakMegapixels > MAX_MEGAPIXELS) {
      bmp.close();
      throw new Error(`Image too large: ${iw}×${ih} (${srcMegapixels.toFixed(1)} MP) exceeds ${MAX_MEGAPIXELS} MP safety limit`);
    }

    const osc = new OffscreenCanvas(iw, ih), ctx = osc.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const d = ctx.getImageData(0, 0, iw, ih);

    // Resizing
    let resized;
    if (iw === ow && ih === oh) {
      resized = {width: ow, height: oh, data: d.data};
    } else {
      resized = resizeLanczos({width: iw, height: ih, data: d.data}, ow, oh);
    }

    // Encoding
    let outBlob;
    if (ext === '.bmp') {
      outBlob = bmpEncode(resized, dpi);
    } else {
      const outOsc = new OffscreenCanvas(ow, oh), outCtx = outOsc.getContext('2d');
      outCtx.putImageData(new ImageData(resized.data, ow, oh), 0, 0);
      const type = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}[ext];
      if (!type) throw new Error('Unsupported format');
      const encoded = await outOsc.convertToBlob({type, quality: 0.75});
      if (!encoded || encoded.type !== type) throw new Error('Encode error');
      const u8 = new Uint8Array(await encoded.arrayBuffer());
      if (type === 'image/png') outBlob = new Blob([pngSetDpi(u8, dpi)], {type});
      else if (type === 'image/jpeg') outBlob = new Blob([jpgSetDpi(u8, dpi)], {type});
      else outBlob = encoded;
    }

    const outU8 = new Uint8Array(await outBlob.arrayBuffer());
    const info = readImageInfo(outU8, ext);
    _currentTaskId = null;
    self.postMessage({id, ok: true, blob: outBlob, w: info.width || ow, h: info.height || oh, dpi: info.dpi});
  } catch (err) {
    _currentTaskId = null;
    self.postMessage({id, ok: false, error: String(err?.message || err)});
  }
};
