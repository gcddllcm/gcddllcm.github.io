import {msg} from './util.js?v=3.4.0';
import {t} from './i18n.js?v=3.4.0-install-guide-v5';

export function installStepsHtml() {
  return `<section class="lc-install-guide" aria-labelledby="lc-install-title">
    <header class="lc-install-header">
      <div class="lc-install-intro"><h2 class="lc-install-title" id="lc-install-title">${t('learncraft.missingTitle')}</h2><p class="lc-install-subtitle">${t('learncraft.installSubtitle')}</p></div>
    </header>
    <ol class="lc-install-visual" aria-label="${t('learncraft.installVisualLabel')}">
      <li class="lc-install-step">
        <span class="lc-install-number">01</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep1Title')}</h3><p>${t('learncraft.installStep1Description')}</p></div>
        <button type="button" class="btn primary lc-install-action" data-q="dl">${t('learncraft.installDownloadZip')}</button>
      </li>
      <li class="lc-install-step">
        <span class="lc-install-number">02</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 6.5h.01M10 6.5h.01"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep2Title')}</h3><p>${t('learncraft.installStep2Description')}</p></div>
        <button type="button" class="btn lc-install-copy lc-install-action" data-q="copyChromeExtensions">${t('learncraft.updateChrome')}</button>
      </li>
      <li class="lc-install-step">
        <span class="lc-install-number">03</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="16" cy="12" r="3"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep3Title')}</h3><p>${t('learncraft.installStep3Description')}</p></div>
      </li>
      <li class="lc-install-step">
        <span class="lc-install-number">04</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 2 2 4-4"/><path d="M21 7v6.5"/><path d="M3 7v10a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M21 7a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 7"/><path d="m3.3 6 8.7 5 8.7-5"/><path d="M12 22V11"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep4Title')}</h3><p>${t('learncraft.installStep4Description')}</p></div>
      </li>
      <li class="lc-install-step">
        <span class="lc-install-number">05</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-2.64-6.36L21 8"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep5Title')}</h3><p>${t('learncraft.installStep5Description')}</p></div>
        <button type="button" class="btn lc-install-copy lc-install-action" data-q="forcereset">${t('learncraft.installForceRefresh')}</button>
      </li>
    </ol>
  </section>`;
}

export function updateStepsHtml() {
  return `<ol class="lc-install-visual" aria-label="${t('learncraft.updateStepsLabel')}">
      <li class="lc-install-step lc-install-step-guide"><span class="lc-install-number">1</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5h15l9 9v29H13z"/><path d="M28 5v9h9"/><path d="M25 21v13m-6-6 6 6 6-6"/></svg><span class="lc-install-content"><span class="lc-install-text">${t('learncraft.updateStep1')}</span><button type="button" class="btn primary lc-install-action lc-install-download" data-q="update" aria-label="${t('learncraft.downloadUpdate')}" title="${t('learncraft.downloadUpdate')}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v3h14v-3"/></svg></button></span></li>
      <li class="lc-install-step lc-install-step-guide"><span class="lc-install-number">2</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="38" height="30" rx="4"/><path d="M5 18h38"/><circle cx="10.5" cy="13.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="13.5" r=".6" fill="currentColor"/><rect x="12" y="24" width="24" height="9" rx="2" fill="currentColor" fill-opacity=".2"/></svg><span class="lc-install-content"><span class="lc-install-text">${t('learncraft.updateStep2')}</span><button type="button" class="lc-install-copy lc-install-action" data-q="copyChromeExtensions">${t('learncraft.updateChrome')}</button></span></li>
      <li class="lc-install-step lc-install-step-guide"><span class="lc-install-number">3</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="14" width="38" height="20" rx="10" fill="currentColor" fill-opacity=".2"/><circle cx="33" cy="24" r="5" fill="currentColor"/></svg><span class="lc-install-content"><span class="lc-install-text">${t('learncraft.updateStep3')}</span></span></li>
      <li class="lc-install-step lc-install-step-guide"><span class="lc-install-number">4</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="4" width="18" height="18" rx="2.5"/><path d="M24 4v4m0 4v4m0 4v2" stroke-width="2"/><path d="M24 27v9m-5-5 5 5 5-5"/><path d="M8 37v3a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3v-3"/></svg><span class="lc-install-content"><span class="lc-install-text">${t('learncraft.updateStep4')}</span></span></li>
      <li class="lc-install-step lc-install-step-guide"><span class="lc-install-number">5</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12h34"/><path d="M17 12V8h14v4"/><path d="m11 12 2 28h22l2-28"/><path d="M20 21v13m8-13v13"/></svg><span class="lc-install-content"><span class="lc-install-text">${t('learncraft.updateStep5')}</span></span></li>
      <li class="lc-install-step lc-install-step-guide"><span class="lc-install-number">6</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M38 24a14 14 0 1 1-3.3-9"/><path d="M35 7v8h-8"/></svg><span class="lc-install-content"><span class="lc-install-text">${t('learncraft.updateStep6')}</span><button type="button" class="lc-install-copy lc-install-action" data-q="forcereset">${t('learncraft.updateForceRefresh')}</button></span></li>
    </ol>`;
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
