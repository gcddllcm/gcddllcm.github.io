export function timestampVideoRecordingInfo(previewUrl) {
  if (typeof previewUrl !== 'string' || !previewUrl) return null;
  let pathname;
  try {
    pathname = new URL(previewUrl, 'https://learncraft.invalid').pathname;
  } catch {
    return null;
  }
  const match = /\/video\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/preview\.(?:png|gif)$/i.exec(pathname);
  if (!match) return null;
  const date = match[2];
  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) return null;
  try {
    return {videoFileName: `${decodeURIComponent(match[1])}_${date}`, recordingDate: date};
  } catch {
    return null;
  }
}

export function timestampVideoPlaybackUrl(previewUrl) {
  if (typeof previewUrl !== 'string' || !previewUrl) return '';
  let url;
  try {
    url = new URL(previewUrl);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.hostname !== 'storage.cloud.google.com') return '';
  const match = /^\/prod-learncraft-asset-artifacts\/(.+\/video\/)([^/]+)\/(\d{4}-\d{2}-\d{2})\/preview\.(?:png|gif)$/i.exec(url.pathname);
  if (!match || !timestampVideoRecordingInfo(previewUrl)) return '';
  url.pathname = `/prod-learncraft-videos/${match[1]}${match[2]}_${match[3]}.mp4`;
  url.search = '';
  url.hash = '';
  return url.href;
}

export function timestampPageAndProblemFromTitle(title) {
  const text = String(title || '');
  const readNumber = expression => {
    const match = expression.exec(text);
    return match ? match[1].replace(/\s+/g, '') : '';
  };
  return {
    pageNo: readNumber(/(?:^|[\s([{_-])(?:หน้าที่|หน้า)\s*[:：.]?\s*(\d+(?:\s*[-–]\s*\d+)?)(?!\d)/u),
    problemNo: readNumber(/(?:^|[\s([{_-])(?:ข้อที่|ข้อ)\s*[:：.]?\s*(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+)?)(?!\d)/u),
  };
}

export function flattenTimestampAssets(result) {
  const assets = [];
  if (result && Array.isArray(result.assets)) {
    const seen = new Set();
    const paths = new Map();
    const collectPaths = (nodes, path = []) => {
      for (const node of nodes || []) {
        if (!node || typeof node.level !== 'string' || typeof node.title !== 'string' ||
            !Array.isArray(node.children || []) || !Array.isArray(node.assetIndices || [])) {
          throw new Error('The LearnCraft course structure is invalid.');
        }
        const nextPath = [...path, {level: node.level, title: node.title}];
        for (const index of node.assetIndices || []) {
          if (paths.has(index)) throw new Error('The LearnCraft extension returned an asset in multiple locations.');
          paths.set(index, nextPath);
        }
        collectPaths(node.children, nextPath);
      }
    };
    if (result.tree !== undefined && !Array.isArray(result.tree)) throw new Error('The LearnCraft course structure is invalid.');
    collectPaths(result.tree);
    for (const asset of result.assets) {
      if (!asset || !Number.isInteger(asset.assetIndex) || asset.assetIndex < 0 || seen.has(asset.assetIndex) ||
          (asset.path !== undefined && (!Array.isArray(asset.path) || asset.path.some(item => !item || typeof item.title !== 'string')))) {
        throw new Error('The LearnCraft extension returned an asset without a stable location.');
      }
      seen.add(asset.assetIndex);
      const path = paths.get(asset.assetIndex) || asset.path || [];
      const isVideo = String(asset.type || '').trim().toUpperCase() === 'VIDEO';
      const recordingInfo = isVideo
        ? timestampVideoRecordingInfo(asset.previewUrl)
        : null;
      const videoUrl = isVideo ? timestampVideoPlaybackUrl(asset.previewUrl) : '';
      const fillValues = String(asset.type || '').trim().toUpperCase() === 'VIDEO' && asset.hasNumberedTimestamp !== true
        ? timestampPageAndProblemFromTitle(asset.title)
        : {pageNo: '', problemNo: ''};
      assets.push({
        rowIndex: assets.length,
        id: String(asset.assetIndex),
        assetIndex: asset.assetIndex,
        type: asset.type || '',
        title: asset.title || '',
        href: asset.href || '',
        videoFileName: recordingInfo?.videoFileName || '',
        recordingDate: recordingInfo?.recordingDate || '',
        videoUrl,
        path,
        hasNumberedTimestamp: asset.hasNumberedTimestamp === true,
        canFill: String(asset.type || '').trim().toUpperCase() === 'VIDEO' && asset.hasNumberedTimestamp !== true,
        pageNo: fillValues.pageNo,
        problemNo: fillValues.problemNo,
        pageNoPrefilled: Boolean(fillValues.pageNo),
        problemNoPrefilled: Boolean(fillValues.problemNo),
      });
    }
    for (const index of paths.keys()) {
      if (!seen.has(index)) throw new Error('The LearnCraft course structure refers to a missing asset.');
    }
    return assets;
  }
  const walk = (nodes, path = []) => {
    for (const node of nodes || []) {
      const nextPath = [...path, {level: node.level, title: node.title}];
      (node.assets || []).forEach(asset => {
        if (!Number.isInteger(node.sourceIndex) || !Number.isInteger(asset.sourceIndex) || !Number.isInteger(asset.assetIndex)) {
          throw new Error('The LearnCraft extension returned an asset without a stable location.');
        }
        const fillValues = String(asset.type || '').trim().toUpperCase() === 'VIDEO'
          && asset.hasNumberedTimestamp !== true
          ? timestampPageAndProblemFromTitle(asset.title)
          : {pageNo: '', problemNo: ''};
        const hasNumberedTimestamp = asset.hasNumberedTimestamp === true;
        assets.push({
          rowIndex: assets.length,
          id: `${asset.sourceIndex}:${asset.assetIndex}`,
          sourceIndex: asset.sourceIndex,
          assetIndex: asset.assetIndex,
          type: asset.type || '',
          title: asset.title || '',
          href: asset.href || '',
          videoFileName: '',
          recordingDate: '',
          videoUrl: '',
          path: nextPath,
          hasNumberedTimestamp,
          canFill: String(asset.type || '').trim().toUpperCase() === 'VIDEO' && !hasNumberedTimestamp,
          pageNo: fillValues.pageNo,
          problemNo: fillValues.problemNo,
          pageNoPrefilled: Boolean(fillValues.pageNo),
          problemNoPrefilled: Boolean(fillValues.problemNo),
        });
      });
      walk(node.children, nextPath);
    }
  };
  if (!result || !Array.isArray(result.tree)) throw new Error('The LearnCraft course data is invalid.');
  walk(result.tree);
  return assets;
}

export function parseTimestampPaste(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!normalized.includes('\n') && !normalized.includes('\t')) return null;
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const rows = lines.map(line => line.split('\t'));
  if (rows.some(row => row.length > 2)) {
    throw new Error('Paste data must have one or two columns.');
  }
  return rows;
}

export function normalizeTimestampTree(result, assets) {
  if (!result || !Array.isArray(result.tree)) return [];
  const indexById = new Map(assets.map((asset, index) => [asset.id, index]));
  const indexByAssetIndex = new Map(assets.map((asset, index) => [asset.assetIndex, index]));
  const assigned = new Set();
  const walk = nodes => nodes.map(node => {
    if (!node || typeof node.title !== 'string' || typeof node.level !== 'string' ||
        !Array.isArray(node.children || []) || !Array.isArray(node.assetIndices || [])) {
      throw new Error('The LearnCraft course structure is invalid.');
    }
    let assetIndices = (node.assetIndices || []).map(index => indexByAssetIndex.get(index));
    if (!assetIndices.length && Array.isArray(node.assets)) {
      assetIndices = node.assets.map(asset => indexById.get(`${asset.sourceIndex}:${asset.assetIndex}`));
    }
    for (const index of assetIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= assets.length || assigned.has(index)) {
        throw new Error('The LearnCraft course structure contains an invalid asset location.');
      }
      assigned.add(index);
    }
    return {
      level: node.level,
      title: node.title,
      duration: typeof node.duration === 'string' ? node.duration : '',
      assetIndices,
      children: walk(node.children || []),
    };
  });
  return walk(result.tree);
}

export function timestampUpdates(assets) {
  return assets.flatMap(asset => {
    const pageNo = String(asset.pageNo ?? '').trim();
    const problemNo = String(asset.problemNo ?? '').trim();
    if (!pageNo && !problemNo) return [];
    if (asset.hasNumberedTimestamp) {
      throw new Error(`Page no. and Pb no. cannot be filled because "${asset.title}" already has a filled timestamp.`);
    }
    if (asset.canFill === false || String(asset.type || '').trim().toUpperCase() !== 'VIDEO') {
      throw new Error(`Page no. and Pb no. can only be filled for video assets ("${asset.title}").`);
    }
    if (pageNo.length > 40 || problemNo.length > 40 || /[\r\n\t]/.test(pageNo + problemNo)) {
      throw new Error(`Page no. or Pb no. is invalid for "${asset.title}".`);
    }
    return [{
      assetIndex: asset.assetIndex,
      title: asset.title,
      type: asset.type,
      href: asset.href,
      pageNo,
      problemNo,
    }];
  });
}

export function selectedTimestampUpdates(assets, selectedIndices) {
  const selected = new Set(selectedIndices);
  return timestampUpdates(assets.filter((_, index) => selected.has(index)));
}

export function groupTimestampUpdates(assets, tree, selectedIndices) {
  const updates = selectedTimestampUpdates(assets, selectedIndices);
  const subsectionByAsset = new Map();
  const visit = (nodes, subsection = null) => {
    for (const node of nodes || []) {
      const current = node.level === 'subsection' ? node : subsection;
      for (const index of node.assetIndices || []) {
        const asset = assets[index];
        if (current && asset) subsectionByAsset.set(asset.assetIndex, current);
      }
      visit(node.children, current);
    }
  };
  visit(tree);
  const grouped = new Map();
  for (const update of updates) {
    const key = subsectionByAsset.get(update.assetIndex) || update;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(update);
  }
  return [...grouped.values()];
}

const isVideoAsset = asset => String(asset?.type || '').trim().toUpperCase() === 'VIDEO';

export function summarizeRecordingDays(assets) {
  const counts = new Map();
  let undated = 0;
  for (const asset of assets || []) {
    if (asset?.recordingDate) counts.set(asset.recordingDate, (counts.get(asset.recordingDate) || 0) + 1);
    else if (isVideoAsset(asset)) undated++;
  }
  const days = [...counts].map(([date, count]) => ({date, count})).sort((a, b) => a.date.localeCompare(b.date));
  return {days, undated};
}

export function assetMatchesDateSelection(asset, {dates = new Set(), undated = false} = {}) {
  if (!dates.size && !undated) return true;
  if (asset?.recordingDate) return dates.has(asset.recordingDate);
  return undated && isVideoAsset(asset);
}
