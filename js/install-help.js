import {msg} from './util.js?v=3.7.2';
import {t} from './i18n.js?v=3.7.2';

export function installStepsHtml({update=false}={}) {
  const installHeader=update?'':`<header class="lc-install-header">
      <div class="lc-install-intro"><h2 class="lc-install-title" id="lc-install-title">${t('learncraft.missingTitle')}</h2><p class="lc-install-subtitle">${t('learncraft.installSubtitle')}</p></div>
    </header>`;
  return `<section class="lc-install-guide${update?' lc-install-guide-update':''}"${update?'':' aria-labelledby="lc-install-title"'}>
    ${installHeader}
    <ol class="lc-install-visual" aria-label="${t(update?'learncraft.updateStepsLabel':'learncraft.installVisualLabel')}">
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
      ${update?`<li class="lc-install-step">
        <span class="lc-install-number">03</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5m4-5v5"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.updateDeleteOldVersionTitle')}</h3><p>${t('learncraft.updateDeleteOldVersionDescription')}</p></div>
      </li>`:''}
      <li class="lc-install-step">
        <span class="lc-install-number">${String(update?4:3).padStart(2,'0')}</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="16" cy="12" r="3"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep3Title')}</h3><p>${t('learncraft.installStep3Description')}</p></div>
      </li>
      <li class="lc-install-step">
        <span class="lc-install-number">${String(update?5:4).padStart(2,'0')}</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 2 2 4-4"/><path d="M21 7v6.5"/><path d="M3 7v10a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M21 7a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 7"/><path d="m3.3 6 8.7 5 8.7-5"/><path d="M12 22V11"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep4Title')}</h3><p>${t('learncraft.installStep4Description')}</p></div>
      </li>
      <li class="lc-install-step">
        <span class="lc-install-number">${String(update?6:5).padStart(2,'0')}</span>
        <svg class="lc-install-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-2.64-6.36L21 8"/></svg>
        <div class="lc-install-content"><h3>${t('learncraft.installStep5Title')}</h3><p>${t('learncraft.installStep5Description')}</p></div>
        <button type="button" class="btn lc-install-copy lc-install-action" data-q="forcereset">${t('learncraft.installForceRefresh')}</button>
      </li>
    </ol>
  </section>`;
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
