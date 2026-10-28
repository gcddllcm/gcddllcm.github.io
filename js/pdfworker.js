import { unzipSync, zlibSync } from './vendor/fflate.js';
const SKIP_ENTRY = /(^|\/)thumbnails\/|^preview\.png$|\.(mp4|m4v|mov|avi|wmv|mpe?g|webm|mp3|wav|ogg|m4a|wma|swf|flv)$/i;
import { readImageInfo } from './imgcore.js?v=3.2.1';
import { fixNames } from './zipnames.js?v=3.2.1';

const PAGE_WIDTH_PT = 595.28;
const B64_CACHE_LIMIT = 48 * 1024 * 1024;
const WHITE_SET = new Set(['none', 'transparent', 'white', '#fff', '#ffffff', 'rgb(255,255,255)']);
const DISALLOWED_TAGS = ['<path', '<polyline', '<polygon', '<text', '<circle', '<ellipse', '<line', '<use', '<pattern', '<foreignObject', '<clipPath', '<mask', '<filter'];
const FANCY_RE = /<g\s[^>]*class="fancypen"[^>]*>[\s\S]*?<\/g><\/g><\/g>/gi;
const POLY_RE = /<polyline\b[^>]*>/gi;

let renderReqSeq = 0;
const renderWaits = new Map();

// Safari on iPhone/iPad refuses canvases larger than ~16.7 million pixels, so a page is never drawn bigger than this.
const MAX_CANVAS_PIXELS = 16000000;
const RENDER_TIMEOUT_MS = 60000;

function fitCanvas(w, h) {
  const px = w * h;
  if (px <= MAX_CANVAS_PIXELS) return [w, h];
  const k = Math.sqrt(MAX_CANVAS_PIXELS / px);
  return [Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k))];
}

function requestRenderSvg(svgText, width, height, quality) {
  return new Promise((resolve, reject) => {
    const reqId = ++renderReqSeq;
    // If the page never finishes drawing, give up on that page instead of waiting forever.
    const timer = setTimeout(() => {
      if (renderWaits.delete(reqId)) reject(new Error('drawing this page took longer than 60 seconds'));
    }, RENDER_TIMEOUT_MS);
    renderWaits.set(reqId, {
      resolve: v => { clearTimeout(timer); resolve(v); },
      reject: e => { clearTimeout(timer); reject(e); }
    });
    postMessage({ type: 'renderSvg', reqId, svgText, width, height, quality });
  });
}

function svgNum(tag, attr) {
  const re = new RegExp(`(?<![\\w:-])${attr}\\s*=\\s*["']\\s*(-?[\\d.]+)\\s*(?:px)?\\s*["']`, 'i');
  const m = tag.match(re);
  return m ? parseFloat(m[1]) : null;
}

function decodeRef(ref) {
  try {
    const txt = ref.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return decodeURIComponent(txt);
  } catch {
    return ref;
  }
}

function normPath(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length) stack.pop();
    } else stack.push(part);
  }
  return stack.join('/');
}

function uint8ToBase64(u8) {
  let binary = '';
  const len = u8.length, chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mimeOf(filename) {
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  const map = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' };
  return map[ext] || 'image/jpeg';
}

function stampFancypen(block) {
  try {
    const headMatch = block.match(/^<g\s[^>]*>/);
    if (!headMatch) return block;
    const head = headMatch[0];
    const ptsMatch = head.match(/\spoints\s*=\s*["']([^"']*)["']/i);
    const widthMatch = head.match(/\sstroke-width\s*=\s*["']([\d.]+)["']/i);
    const shapeMatch = block.slice(head.length).match(/<path\b[^>]*\sd\s*=\s*["']([^"']*)["'][^>]*\/>/i);
    if (!ptsMatch || !widthMatch || !shapeMatch) return block;
    const points = ptsMatch[1].trim().split(/\s+/).map(p => {
      const [x, y] = p.split(',').map(Number);
      return [x, y];
    });
    const nums = (shapeMatch[1].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    if (!nums.length) return block;
    const xs = [], ys = [];
    for (let i = 0; i < nums.length; i += 2) {
      xs.push(nums[i]);
      if (i + 1 < nums.length) ys.push(nums[i + 1]);
    }
    if (!xs.length || !ys.length) return block;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const size = Math.max(maxX - minX, maxY - minY);
    if (!points.length || size <= 0) return block;
    const k = parseFloat(widthMatch[1]) / size;
    const trMatch = head.match(/\stransform\s*=\s*["']([^"']*)["']/i);
    const tr = trMatch ? trMatch[1] : '';
    const stamps = points.map(([x, y]) =>
      `<g transform="translate(${x.toFixed(3)},${y.toFixed(3)}) scale(${k.toFixed(4)}) translate(${(-cx).toFixed(3)},${(-cy).toFixed(3)})">${shapeMatch[0]}</g>`
    ).join('');
    return `<g transform="${tr}">${stamps}</g>`;
  } catch {
    return block;
  }
}

function fixDotPolyline(tag) {
  const pm = tag.match(/(\spoints\s*=\s*["'])([^"']*)(["'])/i);
  if (!pm) return tag;
  const rawPts = pm[2].trim().split(/\s+/);
  const pts = rawPts.map(p => p.split(',').map(Number));
  if (!pts.length || pts.some(([x, y]) => isNaN(x) || isNaN(y))) return tag;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  if (Math.max(...xs) - Math.min(...xs) < 0.5 && Math.max(...ys) - Math.min(...ys) < 0.5) {
    const [x, y] = pts[0];
    const newPts = `${x.toFixed(3)},${y.toFixed(3)} ${(x + 0.5).toFixed(3)},${y.toFixed(3)}`;
    return tag.replace(pm[0], `${pm[1]}${newPts}${pm[3]}`);
  }
  return tag;
}

function prepareSvg(svgText) {
  if (svgText.includes('class="fancypen"') || svgText.includes("class='fancypen'")) {
    svgText = svgText.replace(FANCY_RE, stampFancypen);
  }
  if (svgText.includes('<polyline')) {
    svgText = svgText.replace(POLY_RE, fixDotPolyline);
  }
  return svgText;
}

function inlineImages(svgText, zip, namesLower, b64Cache, b64Ref) {
  return svgText.replace(/(xlink:href|href)\s*=\s*["']([^"']*)["']/gi, (match, attr, ref) => {
    if (/^(?:data:|#|https?:\/\/)/i.test(ref)) return match;
    const norm = normPath(decodeRef(ref)).toLowerCase().replace(/^\/+/, '');
    const real = namesLower.get(norm);
    if (!real || !zip[real]) return match;
    if (!b64Cache.has(real)) {
      if (b64Ref.size > B64_CACHE_LIMIT) {
        b64Cache.clear();
        b64Ref.size = 0;
      }
      const raw = zip[real];
      const mime = mimeOf(real);
      const uri = `data:${mime};base64,${uint8ToBase64(raw)}`;
      b64Cache.set(real, uri);
      b64Ref.size += uri.length;
    }
    return `${attr}="${b64Cache.get(real)}"`;
  });
}

function isSimpleImagePage(svgText) {
  for (const tag of DISALLOWED_TAGS) {
    if (svgText.includes(tag)) return false;
  }
  if (svgText.includes('class="fancypen"')) return false;
  const svgMatches = svgText.match(/<svg\b/gi);
  if (!svgMatches || svgMatches.length !== 1) return false;

  const rects = svgText.match(/<rect\b[^>]*>/gi) || [];
  for (const r of rects) {
    const sm = r.match(/\bstroke\s*=\s*["']([^"']*)["']/i);
    if (sm && !['none', 'transparent', ''].includes(sm[1].trim().toLowerCase())) return false;
    let fill = null;
    const fm = r.match(/(?<![\w-])fill\s*=\s*["']([^"']*)["']/i);
    if (fm) fill = fm[1];
    else {
      const stm = r.match(/style\s*=\s*["'][^"']*?(?<![\w-])fill\s*:\s*([^;"']*)/i);
      if (stm) fill = stm[1];
    }
    if (!fill || !WHITE_SET.has(fill.trim().toLowerCase().replace(/\s+/g, ''))) return false;
  }

  if (/(?<![\w-])(opacity|clip-path|mask|filter)\s*[=:]/i.test(svgText)) return false;

  const images = [...svgText.matchAll(/(?:xlink:href|href)\s*=\s*["']([^"']*)["']/gi)];
  if (images.length !== 1) return false;

  const trMatches = svgText.match(/transform\s*=\s*["']([^"']*)["']/gi) || [];
  for (const tr of trMatches) {
    const fnMatches = [...tr.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)];
    for (const [, fn, args] of fnMatches) {
      if (fn.toLowerCase() !== 'rotate') return false;
      const angle = parseFloat(args.trim().split(/[\s,]+/)[0]);
      if (isNaN(angle) || Math.abs(angle) > 0.001) return false;
    }
  }

  const rootMatch = svgText.match(/<svg\b[^>]*>/i);
  const imgMatch = svgText.match(/<image\b[^>]*>/i);
  if (!rootMatch || !imgMatch) return false;

  const pw = svgNum(rootMatch[0], 'width'), ph = svgNum(rootMatch[0], 'height');
  const iw = svgNum(imgMatch[0], 'width'), ih = svgNum(imgMatch[0], 'height');
  if (!pw || !ph || !iw || !ih) return false;

  const x = svgNum(imgMatch[0], 'x') || 0, y = svgNum(imgMatch[0], 'y') || 0;
  const tol = Math.max(1.5, 0.005 * Math.max(pw, ph));
  return Math.abs(x) <= tol && Math.abs(y) <= tol && Math.abs(iw - pw) <= tol && Math.abs(ih - ph) <= tol;
}

function peekImageSize(raw) {
  const b = raw;
  const n = b.length;
  if (n >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return [dv.getUint32(16), dv.getUint32(20)];
  }
  if (n >= 4 && b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2;
    while (i + 8 < n) {
      while (i < n && b[i] === 0xFF) i++;
      const mk = b[i]; i++;
      if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(mk)) {
        if (i + 6 < n) {
          return [(b[i + 5] << 8) | b[i + 6], (b[i + 3] << 8) | b[i + 4]];
        }
        break;
      }
      if (mk === 0xD9 || mk === 0x00) break;
      if (i + 1 < n) {
        i += (b[i] << 8) | b[i + 1];
      } else break;
    }
  }
  return [null, null];
}

function pdfOriginalWidth(svgText, zip, namesLower) {
  let best = 0;
  const images = [...svgText.matchAll(/(?:xlink:href|href)\s*=\s*["']([^"']*)["']/gi)];
  for (const [, ref] of images) {
    if (/^(?:data:|#|https?:\/\/)/i.test(ref)) continue;
    try {
      const norm = normPath(decodeRef(ref)).toLowerCase().replace(/^\/+/, '');
      const real = namesLower.get(norm);
      if (real && zip[real]) {
        const [w] = peekImageSize(zip[real]);
        if (w) best = Math.max(best, w);
      }
    } catch {}
  }
  return Math.max(1600, Math.min(best || 2480, 3508));
}

function getJpegColorSpace(bytes) {
  let i = 2;
  const n = bytes.length;
  while (i + 8 < n) {
    while (i < n && bytes[i] === 0xFF) i++;
    const mk = bytes[i]; i++;
    if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(mk)) {
      if (i + 7 < n) {
        const comps = bytes[i + 7];
        if (comps === 1) return '/DeviceGray';
        if (comps === 4) return '/DeviceCMYK';
      }
      break;
    }
    if (mk === 0xD9 || mk === 0x00) break;
    if (i + 1 < n) {
      i += (bytes[i] << 8) | bytes[i + 1];
    } else break;
  }
  return '/DeviceRGB';
}

// ---- lossless pages (PNG, WebP, GIF, BMP) ----
// Pixels go into the PDF with Flate compression and PNG row filters (/Predictor 15), so the page keeps every pixel, like a PNG file does.
const LOSSLESS_MAX_PIXELS = 12000000;   // above this the memory needed gets large, so such images are saved as JPEG instead

function pngFilterRows(px, w, h, bpp) {
  const rowLen = w * bpp, out = new Uint8Array(h * (rowLen + 1));
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowLen));
  const zero = new Uint8Array(rowLen);
  for (let y = 0; y < h; y++) {
    const cur = px.subarray(y * rowLen, (y + 1) * rowLen);
    const up = y ? px.subarray((y - 1) * rowLen, y * rowLen) : zero;
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = up[i], c = i >= bpp ? up[i - bpp] : 0, x = cur[i];
      cand[0][i] = x;
      cand[1][i] = (x - a) & 255;
      cand[2][i] = (x - b) & 255;
      cand[3][i] = (x - ((a + b) >> 1)) & 255;
      const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      cand[4][i] = (x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    // Same rule PNG encoders use: keep the filter whose result is closest to zero.
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let s = 0;
      const r = cand[f];
      for (let i = 0; i < rowLen; i++) s += r[i] < 128 ? r[i] : 256 - r[i];
      if (s < bestScore) { bestScore = s; best = f; }
    }
    const o = y * (rowLen + 1);
    out[o] = best;
    out.set(cand[best], o + 1);
  }
  return out;
}

async function decodeLossless(rawBytes, mime) {
  const blob = new Blob([rawBytes], { type: mime });
  const bmp = await createImageBitmap(blob, { imageOrientation: 'none' });
  const w = bmp.width, h = bmp.height;
  const osc = new OffscreenCanvas(w, h);
  const ctx = osc.getContext('2d');
  ctx.fillStyle = '#ffffff';   // transparent areas become white, like the paper of the page
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, w, h).data, n = w * h;
  let gray = true;
  for (let i = 0; i < n * 4; i += 4) {
    if (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2]) { gray = false; break; }
  }
  const bpp = gray ? 1 : 3, px = new Uint8Array(n * bpp);
  if (gray) for (let i = 0, j = 0; j < n; i += 4, j++) px[j] = rgba[i];
  else for (let i = 0, j = 0; i < n * 4; i += 4, j += 3) { px[j] = rgba[i]; px[j + 1] = rgba[i + 1]; px[j + 2] = rgba[i + 2]; }
  return {
    imageBytes: zlibSync(pngFilterRows(px, w, h, bpp), { level: 6 }),
    width: w, height: h,
    colorSpace: gray ? '/DeviceGray' : '/DeviceRGB',
    filter: '/FlateDecode',
    decodeParms: `<< /Predictor 15 /Colors ${bpp} /BitsPerComponent 8 /Columns ${w} >>`
  };
}

async function resizeToJpeg(rawBytes, mime, targetW, targetH, quality) {
  const blob = new Blob([rawBytes], { type: mime || 'image/jpeg' });
  const bmp = await createImageBitmap(blob, { imageOrientation: 'none' });
  const osc = new OffscreenCanvas(targetW, targetH);
  const ctx = osc.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(bmp, 0, 0, targetW, targetH);
  bmp.close();
  const outBlob = await osc.convertToBlob({ type: 'image/jpeg', quality });
  const buf = await outBlob.arrayBuffer();
  return { bytes: new Uint8Array(buf), w: targetW, h: targetH };
}

function createPdfDocument(pages, title) {
  const enc = new TextEncoder();
  const chunks = [];
  let currentOffset = 0;
  const offsets = [];

  function addChunk(buf) {
    chunks.push(buf);
    currentOffset += buf.length;
  }
  function addStr(str) {
    const buf = enc.encode(str);
    addChunk(buf);
  }
  function startObj(id) {
    offsets[id] = currentOffset;
    addStr(`${id} 0 obj\n`);
  }
  function endObj() {
    addStr(`endobj\n`);
  }

  addStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const numPages = pages.length;
  startObj(1);
  addStr(`<< /Type /Catalog /Pages 2 0 R >>\n`);
  endObj();

  const pageObjIds = [];
  for (let i = 0; i < numPages; i++) {
    pageObjIds.push(`${4 + i * 3} 0 R`);
  }
  startObj(2);
  addStr(`<< /Type /Pages /Kids [ ${pageObjIds.join(' ')} ] /Count ${numPages} >>\n`);
  endObj();

  startObj(3);
  let titleStr = '';
  if (title) {
    let hex = 'FEFF';
    for (let i = 0; i < title.length; i++) {
      hex += title.charCodeAt(i).toString(16).padStart(4, '0');
    }
    titleStr = `/Title <${hex}> `;
  }
  addStr(`<< ${titleStr}/Producer (Penguin Logistics) >>\n`);
  endObj();

  for (let i = 0; i < numPages; i++) {
    const p = pages[i];
    const pageId = 4 + i * 3;
    const contentId = 5 + i * 3;
    const imgId = 6 + i * 3;
    const pageH = Math.max(1, (PAGE_WIDTH_PT * p.height) / p.width);

    startObj(pageId);
    addStr(`<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${PAGE_WIDTH_PT.toFixed(2)} ${pageH.toFixed(2)} ] /Resources << /XObject << /Im1 ${imgId} 0 R >> /ProcSet [ /PDF /ImageC ] >> /Contents ${contentId} 0 R >>\n`);
    endObj();

    const contentStream = `q\n${PAGE_WIDTH_PT.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im1 Do\nQ\n`;
    const contentBuf = enc.encode(contentStream);
    startObj(contentId);
    addStr(`<< /Length ${contentBuf.length} >>\nstream\n`);
    addChunk(contentBuf);
    addStr(`endstream\n`);
    endObj();

    startObj(imgId);
    addStr(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace ${p.colorSpace || '/DeviceRGB'} /BitsPerComponent 8 /Filter ${p.filter || '/DCTDecode'}${p.decodeParms ? ' /DecodeParms ' + p.decodeParms : ''} /Length ${p.imageBytes.length} >>\nstream\n`);
    addChunk(p.imageBytes);
    addStr(`\nendstream\n`);
    endObj();
  }

  const totalObjs = 3 + numPages * 3;
  const xrefOffset = currentOffset;
  addStr(`xref\n0 ${totalObjs + 1}\n`);
  addStr(`0000000000 65535 f \n`);
  for (let i = 1; i <= totalObjs; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    addStr(`${off} 00000 n \n`);
  }

  addStr(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(currentOffset);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

self.onmessage = async e => {
  if (e.data?.type === 'renderedSvg') {
    const { reqId, ok, bytes, w, h, error } = e.data;
    const item = renderWaits.get(reqId);
    if (item) {
      renderWaits.delete(reqId);
      if (ok) item.resolve({ bytes, w, h });
      else item.reject(new Error(error || 'SVG render failed'));
    }
    return;
  }

  if (e.data?.type === 'init') {
    postMessage({
      type: 'status',
      code: 'ready',
      text: 'PDF tools ready.',
      progress: 1
    });
    return;
  }

  const { id, data, title, quality = 90, resolution = 1600 } = e.data;
  const q = (quality || 90) / 100;
  const outputWidth = resolution;

  try {
    // Skip entries that are never needed (video/audio/flash attachments, thumbnails): saves time and memory on big notebooks.
    // Thai (non-ASCII) file names written without the zip UTF-8 flag are repaired so they match the hrefs inside pageN.svg.
    const zip = fixNames(unzipSync(new Uint8Array(data), { filter: f => !SKIP_ENTRY.test(f.name) }));
    const namesLower = new Map();
    for (const name of Object.keys(zip)) {
      namesLower.set(name.toLowerCase(), name);
    }

    const pageEntries = [];
    for (const name of Object.keys(zip)) {
      const m = name.match(/^page(\d+)\.svg$/i);
      if (m) pageEntries.push({ num: parseInt(m[1], 10), name });
    }
    pageEntries.sort((a, b) => a.num - b.num);
    if (!pageEntries.length) {
      throw new Error("No pageX.svg files were found inside this .notebook file.");
    }

    const dec = new TextDecoder('utf-8');
    const pages = [];
    const errs = [];
    let ok = 0, failed = 0;
    const b64Cache = new Map();
    const b64Ref = { size: 0 };

    for (let i = 0; i < pageEntries.length; i++) {
      const { num, name } = pageEntries[i];
      try {
        let svgText = dec.decode(zip[name]).replace(/^\uFEFF/, '');
        let doneFast = false;

        if (isSimpleImagePage(svgText)) {
          try {
            const m = svgText.match(/(?:xlink:href|href)\s*=\s*["']([^"']*)["']/i);
            if (m) {
              const ref = m[1];
              const norm = normPath(decodeRef(ref)).toLowerCase().replace(/^\/+/, '');
              const real = namesLower.get(norm);
              if (real && /\.(jpe?g|png|webp|bmp|gif)$/i.test(real)) {
                const rawBytes = zip[real];
                const isJpg = /\.jpe?g$/i.test(real);
                const mime = mimeOf(real);
                let imgW = 0, imgH = 0;
                try {
                  const ext = (real.match(/\.[^.]+$/) || [''])[0].toLowerCase();
                  const info = readImageInfo(rawBytes, ext);
                  imgW = info.width;
                  imgH = info.height;
                } catch {}
                if (!imgW || !imgH) {
                  const bmp = await createImageBitmap(new Blob([rawBytes], { type: mime }), { imageOrientation: 'none' });
                  imgW = bmp.width;
                  imgH = bmp.height;
                  bmp.close();
                }

                if (imgW > 0 && imgH > 0) {
                  const needsResize = outputWidth && imgW > outputWidth;   // 0 = original size: never downscale
                  const colorSpace = isJpg ? getJpegColorSpace(rawBytes) : '/DeviceRGB';
                  // A normal JPEG goes into the PDF untouched. Other formats keep every pixel (Flate). CMYK JPEGs would come out wrong
                  // (usually black), so the browser converts them to RGB. Images that are scaled down or very large become JPEG.
                  if (isJpg && !needsResize && colorSpace !== '/DeviceCMYK') {
                    pages.push({ imageBytes: rawBytes, width: imgW, height: imgH, colorSpace });
                  } else if (!isJpg && !needsResize && imgW * imgH <= LOSSLESS_MAX_PIXELS) {
                    pages.push(await decodeLossless(rawBytes, mime));   // keeps every pixel, like the PNG itself
                  } else {
                    const wantW = needsResize ? outputWidth : imgW;
                    const wantH = Math.max(1, Math.round(imgH * wantW / imgW));
                    const [targetW, targetH] = fitCanvas(wantW, wantH);
                    const converted = await resizeToJpeg(rawBytes, mime, targetW, targetH, q);
                    pages.push({ imageBytes: converted.bytes, width: converted.w, height: converted.h, colorSpace: '/DeviceRGB' });
                  }
                  ok++;
                  doneFast = true;
                }
              }
            }
          } catch {
            doneFast = false;
          }
        }

        if (!doneFast) {
          let prepSvg = prepareSvg(svgText);
          let pageTargetW = outputWidth;
          if (!pageTargetW) {
            pageTargetW = pdfOriginalWidth(prepSvg, zip, namesLower);
          }
          prepSvg = inlineImages(prepSvg, zip, namesLower, b64Cache, b64Ref);

          const rootMatch = prepSvg.match(/<svg\b[^>]*>/i);
          let pw = rootMatch ? svgNum(rootMatch[0], 'width') : 0;
          let ph = rootMatch ? svgNum(rootMatch[0], 'height') : 0;
          if (!pw || !ph) {
            const vbm = rootMatch ? rootMatch[0].match(/viewBox\s*=\s*["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)/i) : null;
            if (vbm) {
              pw = pw || parseFloat(vbm[3]);
              ph = ph || parseFloat(vbm[4]);
            }
          }
          if (!pw || !ph) {
            pw = 800;
            ph = 1000;
          }

          const wantW = Math.round(pageTargetW);
          const [targetW, targetH] = fitCanvas(wantW, Math.max(1, Math.round(wantW * ph / pw)));

          const rendered = await requestRenderSvg(prepSvg, targetW, targetH, q);
          pages.push({
            imageBytes: rendered.bytes,
            width: rendered.w,
            height: rendered.h,
            colorSpace: '/DeviceRGB'
          });
          ok++;
        }
      } catch (err) {
        failed++;
        errs.push(`page ${num}: ${err.message || err}`);
      }
      postMessage({ type: 'page', id, d: i + 1, t: pageEntries.length });
    }

    if (ok === 0) {
      const sample = errs.length ? `: ${errs.slice(0, 3).join('; ')}` : '';
      throw new Error(`None of the pages could be rendered, so no PDF was created${sample}`);
    }

    const pdfBytes = createPdfDocument(pages, title);
    postMessage({ type: 'done', id, bytes: pdfBytes, failed, err: errs[0] || '' }, [pdfBytes.buffer]);
  } catch (err) {
    const full = String((err && err.message) || err);
    postMessage({ type: 'error', id, message: full.split('\n').filter(Boolean).pop(), fatal: false });
  }
};
