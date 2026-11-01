import {msg} from './util.js?v=3.3.0';
import {t} from './i18n.js?v=3.3.0';

export function installStepsHtml() {
  return `<div class="lc-install-visual" aria-label="${t('learncraft.installVisualLabel')}">
      <article class="lc-install-step"><span class="lc-install-number">1</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5h15l9 9v29H13z"/><path d="M28 5v9h9"/><path d="M25 21v13m-6-6 6 6 6-6"/></svg><span class="lc-install-text">${t('learncraft.installVisual1')}</span></article>
      <article class="lc-install-step"><span class="lc-install-number">2</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="38" height="30" rx="4"/><path d="M5 18h38"/><circle cx="10.5" cy="13.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="13.5" r=".6" fill="currentColor"/><rect x="12" y="24" width="24" height="9" rx="2" fill="currentColor" fill-opacity=".2"/></svg><span class="lc-install-text">${t('learncraft.installVisual2')}</span><button type="button" class="lc-install-copy" data-q="copyChromeExtensions">Copy chrome://extensions</button></article>
      <article class="lc-install-step"><span class="lc-install-number">3</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="14" width="38" height="20" rx="10" fill="currentColor" fill-opacity=".2"/><circle cx="33" cy="24" r="5" fill="currentColor"/></svg><span class="lc-install-text">${t('learncraft.installVisual3')}</span></article>
      <article class="lc-install-step"><span class="lc-install-number">4</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="4" width="18" height="18" rx="2.5"/><path d="M24 4v4m0 4v4m0 4v2" stroke-width="2"/><path d="M24 27v9m-5-5 5 5 5-5"/><path d="M8 37v3a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3v-3"/></svg><span class="lc-install-text">${t('learncraft.installVisual4')}</span></article>
      <article class="lc-install-step"><span class="lc-install-number">5</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M38 24a14 14 0 1 1-3.3-9"/><path d="M35 7v8h-8"/></svg><span class="lc-install-text">${t('learncraft.installVisual5')}</span></article>
    </div>
    <details class="lc-install-details"><summary>${t('learncraft.installDetails')}</summary><ol class="lc-steps"><li>${t('learncraft.install1')}</li><li>${t('learncraft.install2')}</li><li>${t('learncraft.install3')}</li><li>${t('learncraft.install4')}</li><li>${t('learncraft.install5')}</li></ol></details>`;
}

export async function copyInternalPage(url) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable');
    await navigator.clipboard.writeText(url);
    msg(t('learncraft.internalPageActionTitle'), t('learncraft.internalPageCopied', url));
  } catch (error) {
    msg(t('learncraft.internalPageActionTitle'), `${t('learncraft.internalPageCopyFail', url)} (${String(error.message || error)})`, 'warning');
  }
}
