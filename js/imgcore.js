// Shared image helpers (PNG/JPEG/BMP/WebP headers, DPI, Lanczos resize). Used by the main page and by resizer-worker.js,
// so a fix here applies to both. Pure functions: no DOM, no globals.
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export const crc32 = b => {
  let c = ~0;
  for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};
export const ppm = dpi => Math.round(dpi / 0.0254);

export function pngSetDpi(u8, dpi) {
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

// Patch the DPI stored in an EXIF block (XResolution / YResolution / ResolutionUnit) in place,
// so programs that read EXIF instead of JFIF see the same value. Returns silently if there is none.
function jpgPatchExifDpi(u8, dpi) {
  let p = 2;
  while (p + 4 < u8.length) {
    if (u8[p] !== 0xFF) break;
    const m = u8[p + 1];
    if (m === 0xDA || m === 0xD9) break;
    const len = (u8[p + 2] << 8) | u8[p + 3];
    if (m === 0xE1 && len >= 16 && u8[p + 4] === 0x45 && u8[p + 5] === 0x78 && u8[p + 6] === 0x69 && u8[p + 7] === 0x66 && u8[p + 8] === 0 && u8[p + 9] === 0) {
      const base = p + 10, end = Math.min(u8.length, p + 2 + len);
      const le = u8[base] === 0x49 && u8[base + 1] === 0x49;
      if (!le && !(u8[base] === 0x4D && u8[base + 1] === 0x4D)) return;
      const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const g16 = o => v.getUint16(o, le), g32 = o => v.getUint32(o, le);
      if (base + 8 > end) return;
      const ifd = base + g32(base + 4);
      if (ifd + 2 > end) return;
      const n = g16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > end) return;
        const tag = g16(e), type = g16(e + 2), cnt = g32(e + 4);
        if ((tag === 0x011A || tag === 0x011B) && type === 5 && cnt === 1) {
          const o = base + g32(e + 8);
          if (o + 8 <= end) { v.setUint32(o, dpi, le); v.setUint32(o + 4, 1, le); }
        } else if (tag === 0x0128 && type === 3 && cnt === 1) {
          v.setUint16(e + 8, 2, le);   // 2 = inches
        }
      }
      return;
    }
    p += 2 + len;
  }
}

export function jpgSetDpi(u8, dpi) {
  dpi = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (!(u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A && u8[7] === 0x46 && u8[8] === 0x49 && u8[9] === 0x46 && u8[10] === 0)) {
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
  jpgPatchExifDpi(u8, dpi);
  return u8;
}

export function bmpEncode(img, dpi) {
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

export function readImageInfo(u8, ext) {
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
    if (u8.length >= 26 && u8[0] === 0x42 && u8[1] === 0x4D && v.getUint32(14, true) >= 40) {   // BITMAPINFOHEADER or newer
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

// Lanczos-3 resize (same filter as Pillow's LANCZOS), premultiplied alpha when the image has transparency.
// yieldFn (optional) is awaited every 128 rows so a main-thread caller can keep the page responsive.
export async function resizeLanczos(img, ow, oh, yieldFn) {
  const {width: iw, height: ih, data: src} = img;
  const cx = coeffs(iw, ow), cy = coeffs(ih, oh);
  const nPix = iw * ih, inv255 = 1 / 255;
  let hasAlpha = false;
  for (let i = 3; i < nPix * 4; i += 4) {
    if (src[i] !== 255) { hasAlpha = true; break; }
  }
  // Horizontal pass reads source rows directly (opaque) or premultiplies one row at a time (alpha):
  // no full-size float copy of the source.
  const mid = new Float32Array(ow * ih * 4), cxLos = cx.los, cxLens = cx.lens, cxWeights = cx.weights;
  const rowBuf = hasAlpha ? new Float32Array(iw * 4) : null;
  for (let y = 0; y < ih; y++) {
    const srcRow = y * iw * 4, midRow = y * ow * 4;
    if (hasAlpha) {
      for (let i = 0; i < iw * 4; i += 4) {
        const s = srcRow + i, a = src[s + 3], al = a * inv255;
        rowBuf[i] = src[s] * al; rowBuf[i + 1] = src[s + 1] * al; rowBuf[i + 2] = src[s + 2] * al; rowBuf[i + 3] = a;
      }
      for (let x = 0; x < ow; x++) {
        const lo = cxLos[x], len = cxLens[x], w = cxWeights[x];
        let r = 0, g = 0, b = 0, a = 0, p = lo << 2;
        for (let k = 0; k < len; k++) {
          const f = w[k];
          r += rowBuf[p] * f; g += rowBuf[p + 1] * f; b += rowBuf[p + 2] * f; a += rowBuf[p + 3] * f;
          p += 4;
        }
        const q = midRow + (x << 2);
        mid[q] = r; mid[q + 1] = g; mid[q + 2] = b; mid[q + 3] = a;
      }
    } else {
      for (let x = 0; x < ow; x++) {
        const lo = cxLos[x], len = cxLens[x], w = cxWeights[x];
        let r = 0, g = 0, b = 0, a = 0, p = srcRow + (lo << 2);
        for (let k = 0; k < len; k++) {
          const f = w[k];
          r += src[p] * f; g += src[p + 1] * f; b += src[p + 2] * f; a += 255 * f;
          p += 4;
        }
        const q = midRow + (x << 2);
        mid[q] = r; mid[q + 1] = g; mid[q + 2] = b; mid[q + 3] = a;
      }
    }
    if (yieldFn && y % 128 === 127) await yieldFn();
  }
  // Vertical pass with contiguous row accumulation (cache friendly)
  const out = new Uint8ClampedArray(ow * oh * 4), lineAcc = new Float32Array(ow * 4), rowFloats = ow * 4;
  const cyLos = cy.los, cyLens = cy.lens, cyWeights = cy.weights;
  for (let y = 0; y < oh; y++) {
    lineAcc.fill(0);
    const lo = cyLos[y], len = cyLens[y], w = cyWeights[y];
    for (let k = 0; k < len; k++) {
      const f = w[k], midPtr = (lo + k) * rowFloats;
      for (let i = 0; i < rowFloats; i++) lineAcc[i] += mid[midPtr + i] * f;
    }
    const outRow = y * rowFloats;
    if (hasAlpha) {
      for (let x = 0; x < ow; x++) {
        const q = x << 2, a = lineAcc[q + 3];
        const al = (a < 0 ? 0 : (a > 255 ? 255 : a)) * inv255;
        const invAl = al > 0 ? 1 / al : 0, oq = outRow + q;
        out[oq] = lineAcc[q] * invAl; out[oq + 1] = lineAcc[q + 1] * invAl; out[oq + 2] = lineAcc[q + 2] * invAl; out[oq + 3] = a;
      }
    } else {
      for (let i = 0; i < rowFloats; i += 4) {
        const oq = outRow + i;
        out[oq] = lineAcc[i]; out[oq + 1] = lineAcc[i + 1]; out[oq + 2] = lineAcc[i + 2]; out[oq + 3] = 255;
      }
    }
    if (yieldFn && y % 128 === 127) await yieldFn();
  }
  return {width: ow, height: oh, data: out};
}

// ---- Memory safety ----
// Peak memory of a Lanczos resize: source ImageData + working copies (about 20 bytes per source pixel),
// the float intermediate (16 bytes per pixel of ow x ih) and the output (4 bytes per output pixel).
export const MAX_MEGAPIXELS = 100;
export const MAX_BYTES = 2.4 * 1073741824;
export const estimatePixelBudget = (iw, ih, ow, oh) => iw * ih * 20 + ow * ih * 16 + ow * oh * 4;
// Returns a message when the job is too big for the browser to handle safely, otherwise null.
export function sizeProblem(iw, ih, ow, oh) {
  const mp = n => (n / 1e6).toFixed(1);
  if (iw * ih > MAX_MEGAPIXELS * 1e6)
    return `Image too large: ${iw}×${ih} (${mp(iw * ih)} MP) exceeds the ${MAX_MEGAPIXELS} MP safety limit`;
  if (ow * oh > MAX_MEGAPIXELS * 1e6)
    return `Output too large: ${ow}×${oh} (${mp(ow * oh)} MP) exceeds the ${MAX_MEGAPIXELS} MP safety limit`;
  const need = estimatePixelBudget(iw, ih, ow, oh);
  if (need > MAX_BYTES)
    return `Not enough memory: resizing ${iw}×${ih} to ${ow}×${oh} needs about ${(need / 1073741824).toFixed(1)} GB (limit ${(MAX_BYTES / 1073741824).toFixed(1)} GB)`;
  return null;
}
