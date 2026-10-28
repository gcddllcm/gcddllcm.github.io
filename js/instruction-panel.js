import {t} from './i18n.js?v=3.2.1';

const GUIDES = {
  creator: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
        title: 'guide.creator.step1.title',
        desc: 'guide.creator.step1.desc',
        targets: ['#cr-drop']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>',
        title: 'guide.creator.step2.title',
        desc: 'guide.creator.step2.desc',
        targets: ['#cr-list', '.cr-actions']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg>',
        title: 'guide.creator.step3.title',
        desc: 'guide.creator.step3.desc',
        targets: ['#cr-prev', '.preview-controls']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        title: 'guide.creator.step4.title',
        desc: 'guide.creator.step4.desc',
        targets: ['#cr-save']
      }
    ],
    detailsKey: 'guide.creator.details'
  },
  topdf: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>',
        title: 'guide.topdf.step1.title',
        desc: 'guide.topdf.step1.desc',
        targets: ['[data-q="quality"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
        title: 'guide.topdf.step2.title',
        desc: 'guide.topdf.step2.desc',
        targets: ['[data-q="drop"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        title: 'guide.topdf.step3.title',
        desc: 'guide.topdf.step3.desc',
        targets: ['.tool-progress']
      }
    ],
    detailsKey: 'guide.topdf.details'
  },
  pagelock: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        title: 'guide.pagelock.step1.title',
        desc: 'guide.pagelock.step1.desc',
        targets: ['.seg']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 3 3 3-3"/></svg>',
        title: 'guide.pagelock.step2.title',
        desc: 'guide.pagelock.step2.desc',
        targets: ['[data-q="drop"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        title: 'guide.pagelock.step3.title',
        desc: 'guide.pagelock.step3.desc',
        targets: ['.tool-progress']
      }
    ],
    detailsKey: 'guide.pagelock.details'
  },
  resizer: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        title: 'guide.resizer.step1.title',
        desc: 'guide.resizer.step1.desc',
        targets: ['.row3', '.resizer-settings']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        title: 'guide.resizer.step2.title',
        desc: 'guide.resizer.step2.desc',
        targets: ['#rz-out', '#rz-path']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        title: 'guide.resizer.step3.title',
        desc: 'guide.resizer.step3.desc',
        targets: ['#rz-drop']
      }
    ],
    detailsKey: 'guide.resizer.details'
  }
};

export function mountGuide(layout, toolKey){
  const conf = GUIDES[toolKey];
  if(!conf || !layout) return;

  const existing = layout.querySelector('.tool-guide');
  if(existing) existing.remove();

  const guideEl = document.createElement('aside');
  guideEl.className = 'tool-guide';
  guideEl.setAttribute('aria-label', t('guide.title'));

  const stepsHtml = conf.steps.map((s, index) => `
    <li class="guide-step" data-guide-step="${index}">
      <div class="guide-step-icon" aria-hidden="true">${s.icon}</div>
      <div class="guide-step-content">
        <strong class="guide-step-title">${t(s.title)}</strong>
        <span class="guide-step-desc">${t(s.desc)}</span>
      </div>
    </li>
  `).join('');

  const detailsText = t(conf.detailsKey);

  guideEl.innerHTML = `
    <div class="guide-header">
      <div class="guide-eyebrow">${t('guide.title')}</div>
      <div class="guide-sub">${t('guide.sub')}</div>
    </div>
    <ol class="guide-steps">
      ${stepsHtml}
    </ol>
    <details class="guide-details">
      <summary class="guide-details-summary">
        <span>${t('guide.more')}</span>
        <kbd class="page-shortcut-key guide-shortcut-key" aria-label="${t('guide.shortcut')}">I</kbd>
        <svg class="guide-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="guide-details-content">${detailsText}</div>
    </details>
  `;

  const tool = layout.querySelector('.tool');
  if(tool)guideEl.querySelectorAll('.guide-step').forEach((step, index) => {
    const targets = conf.steps[index].targets.flatMap(selector => [...tool.querySelectorAll(selector)]);
    let overlays = [];
    const updateHighlights = () => overlays.forEach((overlay, targetIndex) => {
      const rect = targets[targetIndex].getBoundingClientRect();
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    });
    const clearHighlight = () => {
      step.classList.remove('is-hovered');
      overlays.forEach(overlay => overlay.remove());
      overlays = [];
      document.removeEventListener('scroll', updateHighlights, true);
      window.removeEventListener('resize', updateHighlights);
    };
    step.addEventListener('pointerenter', () => {
      clearHighlight();
      step.classList.add('is-hovered');
      overlays = targets.map(target => {
        const overlay = document.createElement('span');
        overlay.className = 'guide-highlight-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        const radius = getComputedStyle(target).borderRadius;
        overlay.style.borderRadius = radius === '0px' ? '8px' : radius;
        document.body.append(overlay);
        return overlay;
      });
      updateHighlights();
      document.addEventListener('scroll', updateHighlights, true);
      window.addEventListener('resize', updateHighlights);
    });
    step.addEventListener('pointerleave', clearHighlight);
  });

  const details = guideEl.querySelector('.guide-details');
  const content = guideEl.querySelector('.guide-details-content');
  let expanded = false, animation = null;
  const clearAnimationStyles = () => {
    content.style.height = '';
    content.style.overflow = '';
    content.style.opacity = '';
  };
  const setExpanded = open => {
    if (open === expanded && !animation) return;
    const startHeight = details.open ? content.getBoundingClientRect().height : 0;
    const startOpacity = details.open ? Number.parseFloat(getComputedStyle(content).opacity) || 0 : 0;
    if (animation) animation.cancel();
    animation = null;
    expanded = open;
    details.classList.toggle('closing', !open);
    details.open = true;
    const endHeight = open ? content.scrollHeight : 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      details.open = open;
      details.classList.remove('closing');
      clearAnimationStyles();
      return;
    }
    content.style.overflow = 'hidden';
    content.style.height = `${startHeight}px`;
    content.style.opacity = `${startOpacity}`;
    const duration = Math.min(380, Math.max(180, Math.abs(endHeight - startHeight) * .35));
    animation = content.animate(
      [{height:`${startHeight}px`,opacity:startOpacity},{height:`${endHeight}px`,opacity:open?1:0}],
      {duration,easing:'cubic-bezier(.22,1,.36,1)'}
    );
    animation.onfinish = () => {
      if (expanded !== open) return;
      details.classList.remove('closing');
      if (!open) details.open = false;
      clearAnimationStyles();
      animation = null;
    };
  };
  guideEl.toggleDetails = () => setExpanded(!expanded);
  details.querySelector('summary').addEventListener('click', event => {
    event.preventDefault();
    guideEl.toggleDetails();
  });

  layout.appendChild(guideEl);
}
