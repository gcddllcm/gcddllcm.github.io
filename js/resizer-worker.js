import {pngSetDpi, jpgSetDpi, bmpEncode, readImageInfo, resizeLanczos, sizeProblem, ppm} from './imgcore.js?v=3.1.4';

const HEAD_BYTES = 262144;   // enough to read width/height from any common image header
const TYPES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp'};

// ---- Global error handlers to prevent silent worker death ----
let _currentTaskId = null;

self.onerror = (message, source, lineno, colno, error) => {
  const id = _currentTaskId;
  if (id != null) {
    try { self.postMessage({id, ok: false, error: `Worker error: ${message || error || 'unknown'}`}); } catch {}
  }
  _currentTaskId = null;
  return true;   // handled here: do not also raise an error event on the page (it could be blamed on the next task)
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
  const {id, file, ow, oh, dpi, ext, quality = 0.75} = e.data;
  _currentTaskId = id;
  try {
    if (!TYPES[ext]) throw new Error(`${ext || 'This file type'} is not supported`);
    // Fast-path: keep original size (DPI-only change) -> 0ms recompression, 100% loss-free.
    // Also used when the requested size equals the image's current size (checked from the file header).
    let dpiOnly = !ow && !oh;
    if (!dpiOnly && ow && oh) {
      try {
        const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
        const hi = readImageInfo(head, ext);
        dpiOnly = hi.width === ow && hi.height === oh;
      } catch {}
    }
    if (dpiOnly) {
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

    // Memory safety check (real dimensions, before any large buffer is allocated)
    const problem = sizeProblem(iw, ih, ow || iw, oh || ih);
    if (problem) {
      bmp.close();
      throw new Error(problem);
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
      resized = await resizeLanczos({width: iw, height: ih, data: d.data}, ow, oh);
    }

    // Encoding
    let outBlob;
    if (ext === '.bmp') {
      outBlob = bmpEncode(resized, dpi);
    } else {
      const outOsc = new OffscreenCanvas(ow, oh), outCtx = outOsc.getContext('2d');
      outCtx.putImageData(new ImageData(resized.data, ow, oh), 0, 0);
      const type = TYPES[ext];
      if (!type) throw new Error('Unsupported format');
      const encoded = await outOsc.convertToBlob({type, quality});
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
