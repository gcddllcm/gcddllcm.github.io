import "./theme-shim.mjs";
// Ultimate Go Live: the page, bridge and background must agree on the protocol, and the page may only ask for the allowed clicks.
// Run: node tests/golive.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = read('js/golive.js'), bridge = read('extension/bridge.js'), background = read('extension/background.js');
const manifest = JSON.parse(read('extension/manifest.json'));
const learncraft = read('js/learncraft.js');
let failed = 0;
const check = (name, fn) => { try { fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message.split('\n')[0]); } };

check('bridge forwards the golive action with its options', () => {
  assert.match(bridge, /m\.action !== 'list' && m\.action !== 'extract' && m\.action !== 'list-timestamp-assets' && m\.action !== 'fill-timestamps' && m\.action !== 'golive'/);
  assert.match(bridge, /dryRun: !!m\.dryRun/);
  assert.match(bridge, /variantCodes: m\.variantCodes/);
  assert.match(bridge, /courseCode: m\.courseCode, entries: m\.entries/);
});
check('course stage appears before Ready to Go Live except when already Ready', () => {
  assert.match(page, /const stage = masterStage\(r\)/);
  assert.match(page, /const variantCount = Number\.isInteger\(p\.variantCount\) \? t\('golive\.variantCount', p\.variantCount\) : ''/);
  assert.match(page, /const stageLabel = status => `\$\{status\}\$\{variantCount \? `, \$\{variantCount\}` : ''\}`/);
  assert.match(page, /const stageChip = stage \? `<span class="lc-chip dim lc-status-stage\$\{stage === 'alert' \? ' lc-status-stage-alert' : ''\}">\$\{esc\(stageLabel/);
  assert.match(page, /class="lc-tab-meta">\$\{stageChip\}\$\{state\}/);
  assert.match(page, /masterStage/);
  assert.equal(masterStage({probe: {courseStatus: 'alert'}}), 'alert');
  assert.equal(masterStage({probe: {courseStatus: 'draft'}}), 'draft');
  assert.equal(masterStage({probe: {courseStatus: 'approving'}}), 'approving');
  assert.equal(masterStage({probe: {courseStatus: 'ready'}}), null);
  assert.equal(masterStage({probe: {}}), null);
  assert.match(page, /<span class="lc-status-go-live">\$\{t\('golive\.tabUsable'\)\}<\/span>/);
});
check('missing extension offers Force refresh instead of Check again', () => {
  assert.match(page, /installStepsHtml\(\)/);
  assert.match(page, /\$s\.querySelector\('\[data-q=forcereset\]'\)\.onclick = forceReset/);
  assert.doesNotMatch(page, /data-q="retry">\$\{t\('golive\.checkAgain'\)\}/);
});
check('Go Live hides connected status unless update guidance is needed', () => {
  assert.doesNotMatch(page, /installation-guide|learncraft\.connected/);
  assert.match(page, /\$s\.innerHTML = panel;\s*\$s\.hidden = !panel/);
  assert.match(page, /function showMissing\(\) \{\s*\$s\.hidden = false/);
});
check('Go Live is disabled when the Master Canvas is already Ready', () => {
  assert.match(background, /courseStatus: null/);
  assert.match(background, /variantCount: 0/);
  assert.ok(background.includes('document.querySelectorAll(\'a[href*="/course-variant/normal/"]\')'));
  assert.ok(background.includes('const m = /^\\/course-variant\\/normal\\/([^/]+)\\/overview\\/?$/.exec(url.pathname)'));
  assert.ok(background.includes('if (m) variants.add(decodeURIComponent(m[1]))'));
  assert.ok(background.includes('out.variantCount = variants.size'));
  assert.match(background, /out\.courseStatus = status \? clean\(status\.textContent\)\.toLowerCase\(\) : null/);
  assert.match(page, /const alreadyReady = masterIsReady\(r\)/);
  assert.match(page, /!extensionOld && !alreadyReady \? '' : ' disabled'/);
  assert.match(page, /t\('golive\.ready'\)/);
  assert.match(page, /lc-status-ready-green/);
  assert.match(page, /const state = alreadyReady[\s\S]*?extensionOld/);
  assert.match(page, /const readyNote = alreadyReady \? `<span>\$\{t\('golive\.noNeedGoLive'\)\}<\/span>` : ''/);
  assert.match(page, /class="lc-tab-meta">\$\{stageChip\}\$\{state\}\$\{readyNote\}/);
  assert.match(page, /extensionOld \? ' update-locked' : ''/);
  assert.equal(en['golive.noNeedGoLive'], 'No need to Go Live');
  assert.equal(en['golive.variantCount'](0), '0 variant');
  assert.equal(en['golive.variantCount'](1), '1 variant');
  assert.equal(en['golive.variantCount'](3), '3 variants');
  const css = read('style.css');
  assert.match(css, /\.lc-status-go-live\{color:#ffb84d\}/);
  assert.match(css, /\.lc-chip\.dim\.lc-status-ready-green\{border-color:#00b89466;background:#00b89420;color:#8fe9d6\}/);
  assert.match(css, /\.lc-chip\.dim\.lc-status-stage-alert\{border-color:#ff6b6b80;background:#ff6b6b24;color:#ff9b9b\}/);
  assert.equal(en['golive.alreadyReady'], undefined);
  assert.equal(en['golive.ready'], 'Ready');
  assert.equal(en['golive.tabUsable'], 'Ready to Go Live');
});
check('courses that can be taken to Ready sort above unavailable courses on the web page and popup', () => {
  assert.match(page, /masters\.sort\(\(a, b\) => \{\s*const aCanGoLive = !tabProblem\(a\) && !extensionOld && !masterIsReady\(a\);\s*const bCanGoLive = !tabProblem\(b\) && !extensionOld && !masterIsReady\(b\);\s*return Number\(bCanGoLive\) - Number\(aCanGoLive\);/);
  assert.match(read('extension/popup.js'), /masters\.sort\(\(a, b\) => \{\s*const aCanGoLive = !problem\(a\) && a\.probe\.courseStatus !== 'ready';\s*const bCanGoLive = !problem\(b\) && b\.probe\.courseStatus !== 'ready';\s*return Number\(bCanGoLive\) - Number\(aCanGoLive\);/);
});
check('Master tabs with alphabetic course-code prefixes are recognized', () => {
  const patternSource = /const MASTER_CODE_RE = (\/[^/]+\/[a-z]*);/.exec(background);
  assert.ok(patternSource, 'Master course code matcher must be declared');
  const pattern = new Function(`return ${patternSource[1]}`)();
  for (const code of ['EC9203-V01', 'P2030-V03', '1234-V1', 'P2030-V03D']) assert.ok(pattern.test(code), code);
  for (const code of ['EC9203', 'P2030-V', 'P2030-V03/overview']) assert.equal(pattern.test(code), false, code);
  assert.match(background, /MASTER_CODE_RE\.test\(candidateCode\)/);
  assert.ok(background.includes('const courseCode = /^(?:[A-Z]+)?\\d+-V\\d+[A-Za-z]*$/;'));
});
check('background routes golive and keeps the injected step self-contained', () => {
  assert.match(background, /if \(m\.action === 'golive'\) return runGoLive\(m, sender\);/);
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background);
  assert.ok(body, 'lcGoLiveStep must exist');
  // only globals a page has, plus its own helpers
  for (const name of ['chrome.', 'require(', 'HOST', 'jobs.', 'busyTabs']) assert.ok(!body[1].includes(name), `lcGoLiveStep uses ${name}`);
});
check('the step clicks only the allowed labels', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  // reading the Go live button for its state is fine; clicking it or the other forbidden buttons is not
  for (const forbidden of ['Go live', 'Reject', 'Go to Edit', 'Back to Edit']) {
    assert.ok(!new RegExp(`find\\('${forbidden}'`).test(body), `must never look up "${forbidden}" to click it`);
  }
  assert.ok(!/act\(goLive/.test(body), 'Go live must never be passed to act()');
  assert.ok(!/act\(\w*(Reject|Back|Edit|Cancel)/.test(body), 'no act() on Reject / Back to Edit / Cancel');
});
check('the timestamp dialog checks Ignore and confirms with Approve or Submit', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  assert.match(body, /if \(title === 'Found Asset without Timestamp'\)/);
  assert.match(body, /const ignoreText = 'Ignore Asset without Timestamp'/);
  assert.match(body, /input\[type="checkbox"\], \[role="checkbox"\]/);
  assert.match(body, /input\.closest\('label, \.MuiFormControlLabel-root, \[role="checkbox"\]'\)/);
  assert.match(body, /el => clean\(el\.textContent\) === ignoreText/);
  assert.match(body, /const controls = checkboxes\.filter\(control => parent\.contains\(control\)\)/);
  assert.match(body, /if \(!relatedBox\) return stop\('dialog'/);
  assert.match(body, /if \(!checked\) return act\(relatedBox, 'tick-ignore-timestamp', 'dialog'\)/);
  assert.match(body, /const masterApproving = kind === 'master' &&/);
  assert.match(body, /!dialog\.contains\(button\)/);
  assert.match(body, /button\.classList\.contains\('MuiButton-containedSuccess'\)/);
  assert.match(body, /return act\(masterApprove, 'approve-master-after-ignore', 'approving'\)/);
  assert.match(body, /const dialogButtons = \[\.\.\.dialog\.querySelectorAll\('button'\)\]/);
  assert.match(body, /if \(approve && !approve\.disabled\) return act\(approve, 'approve-after-ignore', 'dialog'\)/);
  assert.match(body, /if \(submit && !submit\.disabled\) return act\(submit, 'submit-after-ignore', 'dialog'\)/);
  assert.match(body, /if \(\(approve && approve\.disabled\) \|\| \(submit && submit\.disabled\)\)/);
  assert.match(body, /report\('dialog-wait', \{next: 'wait'/);
  assert.match(body, /The timestamp dialog is still open without an enabled Approve or Submit button/);
  assert.ok(body.indexOf('approve-master-after-ignore') < body.indexOf("const submit = dialogButtons.find"), 'Master Approve must be checked before retrying dialog Submit');
  assert.match(body, /return act\(approve, 'approve-after-ignore', 'dialog'\)/);
  assert.match(body, /return act\(submit, 'submit-after-ignore', 'dialog'\)/);
  assert.match(background, /The dialog did not close or offer its next enabled confirmation button within \$\{GOLIVE_MAX_WAITS\} seconds/);
  assert.doesNotMatch(body, /opt\.ignoreTimestamp/);
  assert.doesNotMatch(page, /gl-ignore|ignoreTimestamp/);
});
check('the Master approval confirmation submits only for an approving Master', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  assert.match(body, /kind === 'master' && title === 'Confirm Approval \?'/);
  assert.match(body, /clean\(h\.textContent\) === 'approving'/);
  assert.match(body, /if \(!approving\) return stop\('dialog'/);
  assert.match(body, /const submit = inDialog\(label => label === 'Submit'\)/);
  assert.match(body, /act\(submit, 'confirm-master-approval', 'approving'\)/);
  assert.match(body, /approval confirmation dialog has no enabled Submit button/);
  assert.match(body, /report\('dialog-wait', \{next: 'wait'/);
});
check('an alert Master clicks its red Update button and confirms only its Master Update dialog', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  assert.match(body, /if \(kind === 'master'\) \{\s*if \(status === 'alert'\)/);
  assert.match(body, /find\('Update', button => button\.classList\.contains\('MuiButton-containedError'\)\)/);
  assert.match(body, /act\(update, 'update-master-alert', 'alert'\)/);
  assert.ok(body.includes("if (kind === 'master' && /^Update this (?:Master Canvas|Course)\\s*\\?$/.test(title))"));
  assert.match(body, /act\(update, 'confirm-master-update', 'dialog'\)/);
  assert.match(body, /The Master Update confirmation is disabled/);
  const ids = [...body.matchAll(/act\([^,]+,\s*'([a-z-]+)'/g)].map(m => m[1]);
  for (const id of ['update-master-alert', 'confirm-master-update']) assert.ok(ids.includes(id), id);
  for (const id of ['update-master-alert', 'confirm-master-update']) assert.ok(`golive.did.${id}` in en, id);
});
check('the Master Canvas update dialog confirms Update and never Cancel', () => {
  let updateClicks = 0, cancelClicks = 0;
  const update = el('Update', {click: () => { updateClicks++; }});
  const cancel = el('Cancel', {click: () => { cancelClicks++; }});
  const dialog = {
    textContent: 'Update this Master Canvas ? Course นี้กำลังจะถูกอัปเดต',
    getClientRects: () => [1],
    querySelector: () => el('Update this Master Canvas ?'),
    querySelectorAll: selector => selector === 'button' ? [cancel, update] : [],
  };
  const doc = {
    querySelectorAll: selector => selector === '[role="dialog"]' ? [dialog] : selector === 'h6' ? [el('alert')] : selector === 'button' ? [cancel, update] : [],
  };
  const loc = {pathname: '/master-canvas/normal/8306-V13/overview', href: 'https://craft.learn.co.th/master-canvas/normal/8306-V13/overview'};
  const step = stepFn(doc, loc);
  const preview = step({dryRun: true, clicked: []});
  assert.equal(preview.planned, 'confirm-master-update');
  assert.equal(updateClicks, 0);
  const real = step({dryRun: false, clicked: []});
  assert.equal(real.did, 'confirm-master-update');
  assert.equal(updateClicks, 1);
  assert.equal(cancelClicks, 0);
});
check('a disabled variant Update confirmation waits for LearnCraft instead of stopping', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  assert.match(body, /kind === 'variant' && \/\^Update this Course Variant\/\.test\(title\)/);
  assert.match(body, /button => clean\(button\.textContent\) === 'Update' && button\.disabled/);
  assert.match(body, /The Update confirmation is disabled\. Waiting for LearnCraft to finish updating this variant\./);
  assert.match(body, /: stop\('dialog', 'The Update dialog has no Update button/);
});
check('a disabled Submit for Ready confirmation waits for the variant to become ready', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  assert.match(body, /kind === 'variant' && \/\^Submit for Ready\/\.test\(title\)/);
  assert.match(body, /button => clean\(button\.textContent\) === 'Submit' && button\.disabled/);
  assert.match(body, /The Submit for Ready confirmation is disabled\. Waiting for LearnCraft to finish processing this variant\./);
  assert.match(body, /: stop\('dialog', 'The Submit for Ready dialog has no Submit button/);
  const readyBranch = body.indexOf("if (status === 'ready')");
  assert.notEqual(readyBranch, -1, 'ready status handler remains available for the next green Update step');
});
check('after a click, Go Live waits up to 60 seconds before giving up and does not repeat the same click', () => {
  const body = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];
  assert.match(background, /const GOLIVE_MAX_WAITS = 60/);
  assert.match(background, /opts\.clicked\.push\(clickKey\)/);
  assert.match(body, /if \(opt\.clicked && opt\.clicked\.includes\(clickKey\)\)/);
  assert.match(body, /return report\('click-wait', \{next: 'wait'/);
});
check('the page and the extension agree on the extension version', () => {
  const min = /const EXT_MIN = '([\d.]+)'/.exec(page);
  assert.ok(min, 'EXT_MIN in js/golive.js');
  assert.equal(min[1], manifest.version);
  assert.match(learncraft, new RegExp(`const EXT_MIN='${manifest.version.replace(/\./g, '\\.')}'`));
});
check('an outdated extension hides Refresh tabs and dims Master Canvas tabs', () => {
  assert.match(page, /const refreshButton = extensionOld \? '' : `<button class="btn" data-q="refresh"/);
  assert.match(page, /const tabsCount = `<div class="lc-line\$\{extensionOld \? ' lc-tabs-count-locked' : ''\}"><strong>\$\{t\('learncraft\.tabsFound', rows\.length, courses\.length\)\}<\/strong><span class="lc-grow"><\/span>\$\{refreshButton\}<\/div>`/);
  assert.match(page, /if \(refreshButtonEl\) refreshButtonEl\.onclick = refresh;/);
  assert.match(page, /class="lc-tab\$\{ok \? '' : ' off'\}\$\{extensionOld \? ' update-locked' : ''\}"/);
  assert.match(read('style.css'), /\.lc-tab\.update-locked\{opacity:\.48;filter:grayscale\(\.55\);pointer-events:none;cursor:not-allowed\}/);
});
check('an outdated extension shows but disables the close-ready-tabs option', () => {
  assert.match(page, /const closeOption = `<label class="gl-option\$\{extensionOld \? ' disabled' : ''\}"\$\{extensionOld \? ' aria-disabled="true"' : ''\}><input type="checkbox" data-q="close"\$\{closeDone \? ' checked' : ''\}\$\{extensionOld \? ' disabled' : ''\}>/);
  assert.match(page, /\$\{closeOption\}/);
  assert.match(page, /if \(closeOptionInput\) closeOptionInput\.onchange =/);
  assert.match(read('style.css'), /\.gl-option\.disabled\{cursor:not-allowed\}/);
  assert.match(read('style.css'), /\.gl-option\.disabled \.gl-option-copy\{opacity:\.48;filter:grayscale\(\.55\)\}/);
});
check('close-ready-tabs option appears before course tabs on the web page and popup', () => {
  const popupHtml = read('extension/popup.html');
  assert.ok(page.indexOf('${tabsCount}${safety}${closeOption}') < page.indexOf('<div class="lc-tablist">'));
  assert.ok(popupHtml.indexOf('id="close-ready"') < popupHtml.indexOf('id="courses"'));
});
check('Go Live shows the Canvas extractor tab count with matching markup', () => {
  assert.match(page, /const courses = rows\.filter\(r => r\.code\)/);
  assert.match(page, /const tabsCount = `<div class="lc-line\$\{extensionOld \? ' lc-tabs-count-locked' : ''\}"><strong>\$\{t\('learncraft\.tabsFound', rows\.length, courses\.length\)\}<\/strong><span class="lc-grow"><\/span>\$\{refreshButton\}<\/div>`/);
  assert.match(page, /\$\{tabsCount\}\$\{safety\}/);
  assert.equal(en['golive.courses'], undefined);
  assert.equal(en['learncraft.tabsFound'](2, 1), '2 LearnCraft tabs open · 1 course found');
  assert.equal(en['learncraft.tabsFound'](2, 3), '2 LearnCraft tabs open · 3 courses found');
  assert.match(read('style.css'), /\.lc-tabs-count-locked\{opacity:\.48;filter:grayscale\(\.55\)\}/);
});
check('Go Live uses the Canvas extractor extension update guide and checks the latest version', () => {
  assert.match(page, /async function latestExtensionVersion\(\)/);
  assert.match(page, /fetch\(freshUrl\('extension\/manifest\.json', document\.baseURI\), FRESH\)/);
  assert.match(page, /const updateAvailable = latestVersion && older\(ext\.version, latestVersion\)/);
  assert.match(page, /installStepsHtml\(\{update:true\}\)/);
  assert.match(read('js/install-help.js'), /learncraft\.updateStepsLabel/);
  assert.doesNotMatch(page, /learncraft\.updateDetail[1-5]|learncraft\.updateDetails/);
  assert.match(read('js/install-help.js'), /data-q="dl"/);
  assert.match(page, /\[data-q=forcereset\]/);
  assert.match(page, /\[data-q=copyChromeExtensions\]/);
  assert.match(page, /const extensionOld = older\(ext\.version, EXT_MIN\) \|\| !!\(latestVersion && older\(ext\.version, latestVersion\)\)/);
  assert.match(page, /extensionOld \? ' update-locked' : ''/);
  assert.match(page, /data-tab="\$\{r\.tabId\}"\$\{extensionOld \? ' aria-disabled="true"' : ''\}/);
});
check('extension downloads include the packaged manifest version in their filename', () => {
  for (const source of [page, learncraft]) {
    assert.match(source, /const manifest\s*=\s*JSON\.parse\(new TextDecoder\(\)\.decode\(mbytes\)\)/);
    assert.match(source, /penguin-learncraft-extension-v\$\{manifest\.version\}\.zip/);
    assert.match(source, /add\(manifest\.action\?\.default_popup\)/);
    assert.match(source, /add\('popup\.js'\)/);
    assert.match(source, /add\('popup\.css'\)/);
  }
});
check('extension popup is trusted, can list/run Go Live, and does not steal focus', () => {
  const popup = read('extension/popup.js');
  assert.equal(manifest.version, '1.2.0');
  assert.deepEqual(manifest.action, {default_title: 'Ultimate Go Live', default_popup: 'popup.html'});
  assert.ok(manifest.permissions.includes('storage'));
  assert.match(background, /m\.ns === 'pl-lc-popup' && fromPopup\(sender\)/);
  assert.match(background, /s\.url === POPUP_URL/);
  assert.match(background, /if \(m\.action === 'golive'\) return runGoLive\(m, sender, true\)/);
  assert.doesNotMatch(/async function runGoLive\(m, sender, popup = false\) \{([\s\S]*?)\n\}/.exec(background)[1], /activationTimer|activateCourseTab/);
  assert.match(background, /chrome\.action\.setBadgeText\(\{text: 'RUN'\}\)/);
  assert.match(background, /chrome\.action\.setTitle\(\{title\}\)/);
  assert.match(background, /chrome\.action\.setBadgeText\(\{text: ''\}\)/);
  assert.match(background, /if \(!dryRun\) await clearPopupActionStatus\(\)/);
  assert.match(background, /if \(!dryRun\) setPopupActionStatus\(snapshot\.code, p\)/);
  assert.match(page, /ok && !busy && !extensionOld && !alreadyReady \? '' : ' disabled'/);
  assert.match(background, /if \(dryRun\) \{\s*const r = await stepGoLive\(tabId, opts\)/);
  assert.match(popup, /action: 'cancel'/);
  assert.match(popup, /runLogOpen = Boolean\(\$run\.querySelector\('\.run-log'\)\?\.open\)/);
  assert.match(popup, /<details class="run-log"\$\{runLogOpen \? ' open' : ''\}/);
  assert.match(popup, /data-action="copy-log">Copy log/);
  assert.match(popup, /navigator\.clipboard\.writeText\(runState\.log\.join\('\\n'\)\)/);
  assert.match(popup, /Could not copy run log: \$\{error\.message\}/);
  assert.ok(manifest.permissions.includes('clipboardWrite'));
  assert.match(background, /variantCodes: \[\]/);
  assert.match(background, /out\.variantCodes = \[\.\.\.variants\]/);
  assert.match(background, /selectedVariantCodes = Array\.isArray\(m\.variantCodes\) \? new Set\(m\.variantCodes\) : null/);
  assert.match(background, /linkedVariants\.filter\(variant => selectedVariantCodes\.has\(variant\.code\)\)/);
  assert.match(background, /No variants were selected, so nothing more was clicked/);
  assert.match(background, /selectedVariantCodes\]\.filter\(code => !linkedCodes\.has\(code\)\)/);
  assert.match(popup, /data-action="toggle-variants"/);
  assert.match(popup, /data-action="variant-choice"/);
  assert.match(popup, /<div class="course-actions">\$\{variantPicker\}<button class="course-button primary"/);
  assert.match(popup, /<\/div>\s*\$\{variantPanel\}\s*<\/article>/);
  assert.match(popup, /const selectedVariants = variantCodes\.filter\(code => !excluded\.has\(code\)\)/);
  assert.match(popup, /class="variant-badge" data-selected-count="\$\{row\.tabId\}">\$\{selectedVariants\.length\}\/\$\{variantCodes\.length\}/);
  assert.match(popup, /const variantCodes = \(row && row\.probe && row\.probe\.variantCodes \|\| \[\]\)\.filter\(code => !excluded\.has\(code\)\)/);
  assert.match(page, /data-q="variant-choice"/);
  assert.match(page, /<div class="lc-tab-act">\$\{variantPicker\}/);
  assert.match(page, /class="gl-variant-badge" data-q="variant-selected-count"/);
  assert.match(page, /\$\{variantPanel\}<\/div>`;/);
  assert.match(page, /const selectedVariants = variantCodes\.filter\(code => !excluded\.has\(code\)\)/);
  assert.match(page, /const variantCodes = \(row && row\.probe && row\.probe\.variantCodes \|\| \[\]\)\.filter\(code => !excluded\.has\(code\)\)/);
  assert.match(page, /variantCodes\}, 1200000/);
  assert.match(popup, /pl-lc-popup-progress/);
  assert.match(popup, /data-action="confirm"[\s\S]*?>Go Live<\/button>/);
  assert.match(popup, /\$confirmTitle\.textContent = `Take \$\{code\} to Ready\?`/);
  assert.match(popup, /\$confirmText\.textContent = variantCodes\.length/);
  assert.match(popup, /The tool will approve the Master only\. No variants will be updated/);
  assert.doesNotMatch(popup, /course-button-icon|golive-icon\.svg/);
  assert.doesNotMatch(popup, /data-action="preview"|>Preview<\/button>/);
  assert.match(popup, /row\.probe && row\.probe\.courseStatus === 'ready'/);
  assert.match(popup, /const stage = row\.probe && row\.probe\.courseStatus \|\| ''/);
  assert.match(popup, /const variantCount = row\.probe && Number\.isInteger\(row\.probe\.variantCount\) \? row\.probe\.variantCount : null/);
  assert.match(popup, /const stageClass = stage === 'ready' \? ' course-stage-ready' : stage === 'alert' \? ' course-stage-alert' : ''/);
  assert.match(popup, /const stageLabel = stage \? `\$\{stage\[0\]\.toUpperCase\(\) \+ stage\.slice\(1\)\}\$\{variantCount == null \? '' : `, \$\{variantCount\} variant\$\{variantCount > 1 \? 's' : ''\}`\}` : ''/);
  assert.match(popup, /escapeHtml\(stageLabel\)/);
  assert.match(popup, /const readyNote = alreadyReady \? '<span class="course-meta">No need to Go Live<\/span>' : ''/);
  assert.match(popup, /<span class="course-status">\$\{stage \?/);
  assert.match(popup, /course-meta course-stage\$\{stageClass\}[\s\S]*\$\{readyNote\}[\s\S]*course-ready-to-go-live/);
  assert.doesNotMatch(popup, /Already Ready/);
  assert.match(popup, /disabled \|\| running \|\| alreadyReady \? ' disabled' : ''/);
  assert.match(popup, /alreadyReady \? 'Ready' : 'Go Live'/);
  assert.match(popup, /canGoLive = !disabled && !alreadyReady/);
  assert.match(popup, /course-ready-to-go-live">Ready to Go Live/);
  assert.match(read('extension/popup.css'), /\.course-status\{display:flex;align-items:center;flex-wrap:wrap;gap:6px\}/);
  assert.match(read('extension/popup.css'), /\.course-actions\{display:flex;align-items:center;gap:8px\}/);
  assert.match(read('extension/popup.css'), /\.course-actions \.course-button,\.course-actions \.variant-toggle\{height:32px;min-height:32px\}/);
  assert.match(read('extension/popup.css'), /\.variant-badge\{padding:2px 6px;border-radius:999px/);
  assert.match(read('extension/popup.css'), /\.course-stage\{padding:2px 8px;border:1px solid #ffffff1a;border-radius:999px;background:#ffffff08;color:#b0b3be\}/);
  assert.match(read('extension/popup.css'), /\.course-stage-ready\{border-color:#00b89466;background:#00b89420;color:#8fe9d6\}/);
  assert.match(read('extension/popup.css'), /\.course-stage-alert\{border-color:#ff6b6b80;background:#ff6b6b24;color:#ff9b9b\}/);
  assert.match(read('extension/popup.css'), /\.course-ready-to-go-live\{color:#ffb84d\}/);
  assert.match(read('style.css'), /\.lc-tab-act\{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:none;margin-left:auto\}/);
  assert.match(read('style.css'), /\.lc-tab-act \.btn\{height:40px;padding-block:0\}/);
  assert.match(read('style.css'), /\.gl-variant-panel\{flex:1 1 100%;margin:0 0 0 106px\}/);
  const popupCss = read('extension/popup.css');
  assert.match(popupCss, /\.course-button\.primary\{background:transparent;border-color:#ffb84d;color:#ffb84d\}/);
  assert.match(popupCss, /\.course-button\.primary:hover:not\(:disabled\)\{background:#ffb84d1f;border-color:#ffb84d;color:#ffb84d\}/);
  assert.match(popupCss, /\.course-button\.primary:disabled\{background:#33353f;border-color:#33353f;color:#9498a3;opacity:\.72\}/);
  assert.doesNotMatch(popup, /Active tab|Open tab/);
  assert.match(popup, /const title = row\.probe && row\.probe\.courseTitle/);
  assert.match(popup, /course-title.*escapeHtml\(title\)/);
  assert.doesNotMatch(popup, /course-meta.*row\.code/);
  assert.doesNotMatch(popup, /disabled \? `<p class="course-error">/);
  assert.match(popup, /masters\.sort\(\(a, b\) => \{\s*const aCanGoLive = !problem\(a\) && a\.probe\.courseStatus !== 'ready';\s*const bCanGoLive = !problem\(b\) && b\.probe\.courseStatus !== 'ready';\s*return Number\(bCanGoLive\) - Number\(aCanGoLive\);/);
  assert.doesNotMatch(popup, />Take to Ready<\/button>/);
  assert.match(read('extension/README.txt'), /never clicks LearnCraft's Go live button/i);
});
check('popup run status survives closing and reopening until Refresh is clicked', () => {
  const popup = read('extension/popup.js');
  assert.match(background, /const POPUP_RUN_KEY = 'plLcPopupRun'/);
  assert.match(background, /if \(m\.action === 'get-run'\) return getPopupRun\(\)/);
  assert.match(background, /if \(m\.action === 'clear-run'\)/);
  assert.match(background, /snapshot\.progress\.push\(p\)/);
  assert.match(background, /snapshot\.result = result/);
  assert.match(background, /if \(job\.popup\) \{\s*chrome\.runtime\.sendMessage\(\{ns: 'pl-lc-popup-progress', \.\.\.progress\}\)\.catch\(\(\) => \{\}\);/);
  assert.match(popup, /function restoreRun\(snapshot\)/);
  assert.match(popup, /action: 'get-run'/);
  assert.match(popup, /action: 'clear-run'/);
  assert.match(popup, /\$refresh\.addEventListener\('click', \(\) => refresh\(true\)\)/);
  assert.match(popup, /await refresh\(false, true\)/);
});
check('popup remembers the close-ready checkbox across reopening and Refresh', () => {
  const popup = read('extension/popup.js');
  assert.match(popup, /const CLOSE_READY_KEY = 'plLcCloseReady'/);
  assert.match(popup, /chrome\.storage\.local\.get\(CLOSE_READY_KEY\)/);
  assert.match(popup, /typeof stored\[CLOSE_READY_KEY\] === 'boolean'\) \$closeReady\.checked = stored\[CLOSE_READY_KEY\]/);
  assert.match(popup, /chrome\.storage\.local\.set\(\{\[CLOSE_READY_KEY\]: \$closeReady\.checked\}\)/);
  assert.match(popup, /\$closeReady\.addEventListener\('change'/);
  assert.match(popup, /if \(clearRun\) \{\s*try \{ await request\(\{ns: 'pl-lc-popup', action: 'clear-run'\}\);/);
});
check('web app and extension popup share the Penguin Logistics logo', () => {
  const index = read('index.html'), popupHtml = read('extension/popup.html'), app = read('js/app.js'), assets = read('js/assets.js');
  assert.match(index, /src="assets\/images\/loy-krathong-2026\.png"/);
  assert.match(index, /href="assets\/images\/loy-krathong-2026\.png"/);
  assert.match(popupHtml, /src="assets\/images\/loy-krathong-2026\.png"/);
  assert.match(popupHtml, /class="popup-brand"/);
  assert.match(popupHtml, /class="site-button" href="https:\/\/gcddllcm\.github\.io\/" target="_blank" rel="noopener noreferrer">Visit site<\/a>/);
  assert.match(read('extension/popup.css'), /\.site-button\{[^}]*text-decoration:none/);
  assert.match(app, /ASSETS\.brandLogo/);
  assert.match(assets, /'assets\/images\/loy-krathong-2026\.png':ASSETS\.brandLogo/);
  assert.match(page, /extensionAssetUrl\(n\)/);
  assert.match(learncraft, /extensionAssetUrl\(n\)/);
  assert.ok(fs.statSync(new URL('../assets/images/loy-krathong-2026.png', import.meta.url)).size > 10000);
  assert.match(read('js/app.js'), /<svg aria-hidden="true" focusable="false" viewBox="0 0 80 80"/);
});
check('the app and LearnCraft modules use a fresh cache key for this extension version', () => {
  const app = read('js/app.js'), index = read('index.html');
  const appCacheKey = /<script type="module" src="js\/app\.js\?v=([^"]+)"/.exec(index)?.[1];
  const learncraftCacheKey = /import \* as learncraft from '\.\/learncraft\.js\?v=([^']+)'/.exec(app)?.[1];
  const goliveCacheKey = /import \* as golive from '\.\/golive\.js\?v=([^']+)'/.exec(app)?.[1];
  assert.ok(appCacheKey, 'index.html must cache-bust app.js');
  assert.equal(learncraftCacheKey, appCacheKey);
  assert.equal(goliveCacheKey, appCacheKey);
});
check('the page never opens a URL outside LearnCraft variant pages', () => {
  assert.match(background, /url\.hostname !== HOST \|\| !url\.pathname\.startsWith\('\/course-variant\/'\)/);
});

// ---- behaviour: run the injected step against a tiny fake page ----
function stepFn(doc, loc) {
  const injected = new Function('document', 'location', `return (${/function lcGoLiveStep\(opt\) \{[\s\S]*?\n\}\n/.exec(background)[0]})`);
  return injected(doc, loc);
}
function el(text, extra = {}) {
  return {textContent: text, getClientRects: () => [1], disabled: false, classList: {contains: () => false}, ...extra};
}
const fakePage = ({path, h6 = [], buttons = [], links = []}) => {
  const doc = {querySelectorAll: sel => sel === 'h6' ? h6.map(t => el(t)) : sel === 'button' ? buttons.map(t => el(t)) : sel.startsWith('a[href') ? links.map(h => ({getAttribute: () => h})) : []};
  return stepFn(doc, {pathname: path, href: 'https://craft.learn.co.th' + path})({dryRun: true});
};
check('a ready master without variant links is not a stop', () => {
  const r = fakePage({path: '/master-canvas/normal/1234-V1/overview', h6: ['ready']});
  assert.equal(r.next, 'variants');
  assert.deepEqual(r.variants, []);
});
check('a ready master with links lists them once', () => {
  const l = '/course-variant/normal/1234-V1A/overview';
  const r = fakePage({path: '/master-canvas/normal/1234-V1/overview', h6: ['ready'], links: [l, l, '/course-variant/normal/1234-V1B/overview']});
  assert.deepEqual(r.variants.map(v => v.code), ['1234-V1A', '1234-V1B']);
});
check('alphabetic-prefix Masters support no-variant and multi-variant courses', () => {
  const noVariants = fakePage({
    path: '/master-canvas/normal/EC9203-V01/overview',
    h6: ['ready'],
    links: ['/course-variant/normal/EC9203-V01/new/']
  });
  assert.equal(noVariants.code, 'EC9203-V01');
  assert.deepEqual(noVariants.variants, []);
  const withVariants = fakePage({
    path: '/master-canvas/normal/P2030-V03/overview',
    h6: ['ready'],
    links: [
      '/course-variant/normal/P2030-V03D/overview/',
      '/course-variant/normal/P2030-V03E/overview/',
      '/course-variant/normal/P2030-V03L/overview/',
      '/course-variant/normal/P2030-V03/new/'
    ]
  });
  assert.equal(withVariants.code, 'P2030-V03');
  assert.deepEqual(withVariants.variants.map(variant => variant.code), ['P2030-V03D', 'P2030-V03E', 'P2030-V03L']);
});
check('an unknown status keeps waiting, and the report says what the page showed', () => {
  const r = fakePage({path: '/master-canvas/normal/1234-V1/overview', h6: ['live'], buttons: ['Go live']});
  assert.equal(r.next, 'wait');
  assert.equal(r.state, 'loading');
  assert.deepEqual(r.seen.status, ['live']);
  assert.deepEqual(r.seen.buttons, ['Go live']);
});
check('an alert Master plans and clicks only its red Update button', () => {
  let clicks = 0;
  const update = el('Update', {
    classList: {contains: name => name === 'MuiButton-containedError'},
    click: () => { clicks++; },
  });
  const doc = {querySelectorAll: sel => sel === 'h6' ? [el('alert')] : sel === 'button' ? [update] : []};
  const loc = {pathname: '/master-canvas/normal/8306-V13/overview', href: 'https://craft.learn.co.th/master-canvas/normal/8306-V13/overview'};
  const step = stepFn(doc, loc);
  const preview = step({dryRun: true, clicked: []});
  assert.equal(preview.planned, 'update-master-alert');
  assert.equal(clicks, 0);
  const real = step({dryRun: false, clicked: []});
  assert.equal(real.did, 'update-master-alert');
  assert.equal(clicks, 1);
});
check('the runner finishes a course without variants and does not stop it', () => {
  assert.match(background, /noVariants <= 4/);
  assert.match(background, /This course has no variant links/);
});
check('all variants run in parallel background tabs without activating them', () => {
  assert.match(background, /chrome\.tabs\.create\(\{url: url\.href, active: false, windowId: tab\.windowId, openerTabId: tabId\}\)/);
  assert.match(background, /Promise\.all\(variants\.map\(async \(variant, index\)/);
  assert.match(background, /Promise\.all\(created\.map\(item => item\.error/);
  assert.match(background, /Background variant tabs were left open/);
  assert.doesNotMatch(background, /function openVariant\(/);
  assert.match(background, /tell\(\{\.\.\.entry, queue: index \+ 1, of: total\}/);
});
check('web Go Live does not activate the selected course tab, while Extract still does', () => {
  const runGoLiveBody = /async function runGoLive\(m, sender, popup = false\) \{([\s\S]*?)\n\}/.exec(background)[1];
  const extractHandler = /if \(m\.action === 'extract'\) \{([\s\S]*?)\n  \}\n/.exec(background)[1];
  assert.doesNotMatch(runGoLiveBody, /activateCourseTab|activationTimer|tabs\.update\([^)]*\{\s*active:\s*true/);
  assert.match(extractHandler, /job\.activationTimer = setTimeout\(\(\) => \{\s*job\.activationPromise = activateCourseTab\(reqId\)/);
  assert.match(extractHandler, /await restorePageTab\(job\)/);
});
check('Go Live uses vector status favicons and text instead of emoji in the tab title', () => {
  assert.match(page, /setTitle\('running'\)/);
  assert.match(page, /setTitle\(res\.ok \? 'complete' : 'attention'\)/);
  assert.match(page, /statusTitles = \{running: 'Running', complete: 'Complete', attention: 'Needs attention'\}/);
  assert.match(page, /ASSETS\.goLiveStatus\[status\]/);
  assert.match(page, /favicon\.href = status \?/);
  assert.doesNotMatch(page, /setTitle\('\u23f3'\)|setTitle\(res\.ok \? '\u2713' : '\u26a0'\)/);
  for (const name of ['running', 'complete', 'attention']) {
    const svg = read(`assets/images/golive-${name}.svg`);
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${name} icon is SVG`);
    assert.doesNotMatch(svg, /<text\b/, `${name} icon uses vector shapes, not text glyphs`);
  }
});
check('Go Live results offer Copy log without a Download log button', () => {
  assert.match(page, /data-q="copylog">\$\{t\('golive\.copyLog'\)\}/);
  assert.doesNotMatch(page, /data-q="dllog"|golive-\$\{new Date\(\)\.toISOString/);
  assert.doesNotMatch(en['guide.golive.details'], /Download log/);
  assert.equal('golive.downloadLog' in en, false);
  assert.doesNotMatch(String(en['golive.copyFailed']), /Download log/);
});

// ---- 1.3.0: closing finished tabs, retries that only look, progress events, readable labels ----
import en from '../js/locales/en.js';
import {fmtElapsed, newRun, applyProgress, logLine, summarize, tabProblem, masterIsReady, masterStage, stepText} from '../js/glcore.js';
const stepBody = /function lcGoLiveStep\(opt\) \{([\s\S]*?)\n\}\n/.exec(background)[1];

check('closing finished variant tabs is enabled by default and never closes a variant that needs attention', () => {
  assert.match(bridge, /closeDone: !!m\.closeDone/);
  assert.match(background, /const dryRun = !!m\.dryRun, closeDone = !!m\.closeDone/);
  assert.match(background, /if \(outcome\.ok && closeDone && outcome\.tabId != null\)/);
  assert.match(background, /chrome\.tabs\.remove\(outcome\.tabId\)/);
  assert.match(page, /closeDone = true/, 'the page starts with the option on');
  assert.match(read('extension/popup.html'), /<input id="close-ready" type="checkbox" checked>/, 'the popup starts with the option on');
  assert.match(page, /ask\('golive', \{tabId, dryRun, closeDone, variantCodes\}/);
});
check('a failed look at the page is retried without clicking', () => {
  assert.match(background, /attempt \? \{\.\.\.opts, observe: true\} : opts/);
  assert.match(stepBody, /if \(opt\.observe\) return report\(state, \{next: 'wait'/);
  assert.ok(stepBody.indexOf('opt.dryRun') < stepBody.indexOf('opt.observe'), 'a dry run is answered before the observe check');
  assert.ok(stepBody.indexOf('opt.observe') < stepBody.indexOf('el.click()'), 'observe must be decided before the click');
});
check('observe mode looks but never clicks, normal mode clicks once', () => {
  let clicks = 0;
  const btn = {textContent: 'Submit for Approval', getClientRects: () => [1], disabled: false, classList: {contains: () => false}, click: () => { clicks++; }};
  const h6 = {textContent: 'draft', getClientRects: () => [1]};
  const doc = {querySelectorAll: sel => sel === 'h6' ? [h6] : sel === 'button' ? [btn] : []};
  const loc = {pathname: '/master-canvas/normal/1234-V1/overview', href: 'https://craft.learn.co.th/master-canvas/normal/1234-V1/overview'};
  const seen = stepFn(doc, loc)({dryRun: false, clicked: [], observe: true});
  assert.equal(clicks, 0);
  assert.equal(seen.did, null);
  const real = stepFn(doc, loc)({dryRun: false, clicked: []});
  assert.equal(clicks, 1);
  assert.equal(real.did, 'submit-for-approval');
});
check('the extension tells the page which variants will run and how each one ended', () => {
  assert.match(background, /tell\(\{event: 'variants', codes: variants\.map\(variant => variant\.code\)\}\)/);
  assert.match(background, /tell\(\{event: 'variant-done', code: outcome\.code, ok: outcome\.ok/);
  assert.match(background, /elapsedMs: Date\.now\(\) - started/);
});
check('every click the step can make has a readable label', () => {
  const ids = [...stepBody.matchAll(/act\([^,]+,\s*'([a-z-]+)'/g)].map(m => m[1]);
  assert.ok(ids.length >= 10, 'found the click ids');
  const missing = [...new Set(ids)].filter(id => !(`golive.did.${id}` in en));
  assert.deepEqual(missing, [], 'missing golive.did labels: ' + missing.join(', '));
});
check('starting a run for real asks in a concise dialog', () => {
  assert.match(page, /await msg\(t\('golive\.confirmTitle'/);
  assert.match(page, /t\('golive\.confirmText', variantCodes\.length\), 'warning'/);
  assert.match(page, /if \(pick === 1\) run\(/);
  assert.doesNotMatch(page, /data-preview/);
  assert.match(page, /class="btn gl-go" data-golive=/);
  assert.doesNotMatch(page, /previewed|golive\.notPreviewed/);
  const withVariants = en['golive.confirmText'](2);
  const withoutVariants = en['golive.confirmText'](0);
  assert.match(withVariants, /approve the Master.*2 selected variants.*until each one is Ready/);
  assert.match(withoutVariants, /approve the Master only\. No variants will be updated/);
  assert.match(withVariants, /press Stop at any time/);
  assert.equal(en['golive.notPreviewed'], undefined);
  assert.equal(en['golive.goLive'], 'Go Live');
});
check('leaving the page while a run is going asks first', () => {
  assert.match(page, /addEventListener\('beforeunload', leaveGuard\)/);
  assert.match(page, /removeEventListener\('beforeunload', leaveGuard\)/);
});

const L = {did: id => en[`golive.did.${id}`] || id, clicked: l => en['golive.clicked'](l), waitClick: en['golive.waitClick'], waitDialog: en['golive.waitDialog'], waitLoad: en['golive.waitLoad'], ready: en['golive.ready'], masterReady: en['golive.masterReady']};
check('fmtElapsed: mm:ss, and h:mm:ss after an hour', () => {
  assert.equal(fmtElapsed(0), '00:00');
  assert.equal(fmtElapsed(83000), '01:23');
  assert.equal(fmtElapsed(3725000), '1:02:05');
  assert.equal(fmtElapsed(-5), '00:00');
  assert.equal(fmtElapsed(undefined), '00:00');
});
check('stepText: clicks and waits are written in plain words', () => {
  assert.equal(stepText({did: 'update-alert'}, L), 'Clicked the red Update');
  assert.equal(stepText({state: 'click-wait'}, L), L.waitClick);
  assert.equal(stepText({state: 'dialog-wait'}, L), L.waitDialog);
  assert.equal(stepText({state: 'loading'}, L), L.waitLoad);
  assert.equal(stepText({state: 'alert', message: 'Something'}, L), 'Something');
});
check('progress: the Master row, then one row per variant, updated independently', () => {
  const run = newRun();
  assert.ok(applyProgress(run, {round: 1, code: '1234-V1', state: 'draft', did: 'submit-for-approval', queue: 0, of: 0}, L, 1000));
  assert.equal(run.master.state, 'working');
  assert.equal(run.master.text, 'Clicked Submit for Approval');
  assert.deepEqual(run.variants, []);
  applyProgress(run, {event: 'variants', codes: ['1234-V1A', '1234-V1B']}, L);
  assert.equal(run.master.state, 'done');
  assert.deepEqual(run.variants.map(v => [v.code, v.state]), [['1234-V1A', 'queued'], ['1234-V1B', 'queued']]);
  applyProgress(run, {round: 2, code: '1234-V1A', state: 'alert', did: 'update-alert', queue: 1, of: 2}, L, 2000);
  applyProgress(run, {round: 3, code: '1234-V1B', state: 'dialog-wait', queue: 2, of: 2}, L, 2500);
  assert.deepEqual(run.variants.map(v => v.state), ['working', 'working']);
  assert.equal(run.variants[1].text, L.waitDialog);
  applyProgress(run, {event: 'variant-done', code: '1234-V1A', ok: true}, L);
  applyProgress(run, {event: 'variant-done', code: '1234-V1B', ok: false, message: 'Unexpected dialog'}, L);
  assert.deepEqual(run.variants.map(v => v.state), ['done', 'failed']);
  assert.equal(run.variants[1].text, 'Unexpected dialog');
  // a late step of a finished variant must not bring it back to "working"
  applyProgress(run, {round: 4, code: '1234-V1A', state: 'ready', queue: 1, of: 2}, L, 3000);
  assert.equal(run.variants[0].state, 'done');
  assert.equal(run.log.length, 4);
});
check('progress: unknown or empty events are ignored', () => {
  const run = newRun();
  assert.equal(applyProgress(run, null, L), false);
  assert.equal(applyProgress(run, {message: 'no round'}, L), false);
  assert.equal(run.log.length, 0);
});
check('logLine: number, time since start, who, what and the raw id for support', () => {
  assert.equal(logLine({round: 2, at: 66000, code: '1234-V1A', queue: 1, did: 'update-alert'}, L, 1000), '2. [01:05] 1234-V1A · Clicked the red Update (update-alert)');
});
check('summarize and tabProblem', () => {
  assert.deepEqual(summarize({results: [{code: 'A', ok: true}, {code: 'B', ok: false}]}), {total: 2, ready: 1, failed: 1, failedCodes: ['B']});
  assert.deepEqual(summarize({}), {total: 0, ready: 0, failed: 0, failedCodes: []});
  const ok = {status: 'complete', discarded: false, probe: {hasCanvas: true}};
  assert.equal(tabProblem(ok), null);
  assert.equal(tabProblem({...ok, discarded: true}), 'asleep');
  assert.equal(tabProblem({...ok, status: 'loading'}), 'loading');
  assert.equal(tabProblem({...ok, probeError: 'x'}), 'noAccess');
  assert.equal(tabProblem({...ok, probe: {hasCanvas: true, loggedIn: false}}), 'login');
  assert.equal(tabProblem({...ok, probe: {hasCanvas: false}}), 'notOverview');
  for (const k of ['asleep', 'loading', 'noAccess', 'login', 'notOverview', 'ready']) assert.ok(`learncraft.state.${k}` in en, k);
});
check('Master Ready is detected from the tab probe status', () => {
  assert.equal(masterIsReady({probe: {courseStatus: 'ready'}}), true);
  assert.equal(masterIsReady({probe: {courseStatus: 'draft'}}), false);
  assert.equal(masterIsReady({probe: {}}), false);
  assert.equal(masterIsReady(null), false);
});
check('Go Live has a Quick Guide whose steps all have texts', () => {
  const panel = read('js/instruction-panel.js');
  assert.match(panel, /golive: \{/);
  assert.match(panel, /icon: '<svg viewBox="0 0 24 24"[^']*<path d="m10 11 5 3-5 3z"\/><\/svg>',\s*title: 'guide\.golive\.step2\.title'/);
  assert.doesNotMatch(panel, /<path d="M2 12s3\.6-7 10-7/);
  for (const k of ['step1', 'step2', 'step3']) for (const part of ['title', 'desc']) assert.ok(`guide.golive.${k}.${part}` in en, `${k}.${part}`);
  assert.ok('guide.golive.details' in en);
  for (const id of ['gl-status', 'gl-courses', 'gl-result']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /mountGuide\(root\.querySelector\('\.tool-layout'\), 'golive'\)/);
  assert.doesNotMatch(page, /gl-flow|golive\.flow/);
  assert.doesNotMatch(read('style.css'), /\.gl-flow/);
  for (const key of ['golive.flowTitle', 'golive.flow.master', 'golive.flow.masterSteps', 'golive.flow.variants', 'golive.flow.variantSteps']) assert.equal(key in en, false, key);
});
check('Go Live heading keeps the LearnCraft heading layout and the mascot styles', () => {
  const css = read('style.css');
  assert.match(css, /\.lc-heading\{[^}]*padding:0 8px;overflow:clip/);
  assert.match(css, /\.view\.on\{[^}]*scrollbar-gutter:stable/);
  assert.match(css, /\.tool-layout>\.tool,\.tool-layout>\.tool\.wideview\{overflow-y:auto;scrollbar-gutter:auto/);
  assert.match(css, /\.lc-scope-glint\{[^}]*background:transparent;box-shadow:none/);
});
check('the close-ready-tabs option has clear primary and helper text', () => {
  assert.match(page, /const closeOption = `<label class="gl-option\$\{extensionOld \? ' disabled' : ''\}"[\s\S]*class="gl-option-copy"><strong>\$\{t\('golive\.optClose'\)\}<\/strong><small>\$\{t\('golive\.optCloseHelp'\)\}<\/small>/);
  assert.match(read('extension/popup.html'), /id="close-ready"[\s\S]*Close variant tabs when they are ready[\s\S]*id="courses"/);
  assert.equal(en['golive.optClose'], 'Close variant tabs when they are ready');
  assert.equal(en['golive.optCloseHelp'], 'Tabs for variants that need attention will stay open.');
  assert.match(read('style.css'), /\.gl-option-copy strong\{color:var\(--text\);font-size:13px;line-height:1\.35\}/);
  assert.match(read('style.css'), /\.gl-option small\{color:#a9abb5;font-size:11px;line-height:1\.45\}/);
  assert.match(read('style.css'), /body\.keyboard-tab-nav \.gl-option:focus-within\{outline:2px solid #8e82ff;outline-offset:2px\}/);
  assert.doesNotMatch(read('style.css'), /(?<!keyboard-tab-nav )\.gl-option:focus-within\{/);
});
check('safety section is removed from the Detailed Guide', () => {
  assert.doesNotMatch(en['guide.golive.details'], /Safety|A run is stopped after 15 minutes|Assets without timestamp/);
  assert.doesNotMatch(en['guide.golive.details'], /What happens|All variants open in their own background tabs/);
  assert.doesNotMatch(page, /golive\.ignoreHelp|Assets without a timestamp/);
  assert.equal('golive.ignoreHelp' in en, false);
});
check('v3.4.0 release notes cover Timestamp Maker and LearnCraft tool updates', () => {
  const v340 = en.RELEASES.find(r => r.version === 'v3.4.0');
  assert.ok(v340, 'v3.4.0 stays in the release history');
  const release = v340.sections.map(x => x.items.join(' ')).join(' ');
  assert.match(release, /LearnCraft : Timestamp Maker/);
  assert.match(release, /How to use/);
  assert.match(release, /Visit site/);
  assert.match(release, /stay in place/);
});
if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('Ultimate Go Live checks passed');
