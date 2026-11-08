import {t} from './i18n.js?v=3.6.0';

const GUIDES = {
  learncraft: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5Z"/></svg>',
        title: 'guide.learncraft.step1.title',
        desc: 'guide.learncraft.step1.desc',
        targets: ['#lc-status']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 5V3"/></svg>',
        title: 'guide.learncraft.step2.title',
        desc: 'guide.learncraft.step2.desc',
        targets: ['#lc-tabs']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        title: 'guide.learncraft.step3.title',
        desc: 'guide.learncraft.step3.desc',
        targets: ['#lc-result']
      }
    ],
    detailsKey: 'guide.learncraft.details'
  },
  golive: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/></svg>',
        title: 'guide.golive.step1.title',
        desc: 'guide.golive.step1.desc',
        targets: ['#gl-status']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><path d="m10 11 5 3-5 3z"/></svg>',
        title: 'guide.golive.step2.title',
        desc: 'guide.golive.step2.desc',
        targets: ['#gl-courses']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></svg>',
        title: 'guide.golive.step3.title',
        desc: 'guide.golive.step3.desc',
        targets: ['#gl-result']
      }
    ],
    detailsKey: 'guide.golive.details'
  },
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
  pdfToJpg: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 16h8"/></svg>',
        title: 'guide.pdfToJpg.step1.title',
        desc: 'guide.pdfToJpg.step1.desc',
        targets: ['[data-q="drop"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/></svg>',
        title: 'guide.pdfToJpg.step2.title',
        desc: 'guide.pdfToJpg.step2.desc',
        targets: ['[data-q="dpi"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        title: 'guide.pdfToJpg.step3.title',
        desc: 'guide.pdfToJpg.step3.desc',
        targets: ['.tool-progress']
      }
    ],
    detailsKey: 'guide.pdfToJpg.details'
  },
  'jpg-maker': {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 16h8"/></svg>',
        title: 'guide.jpgMaker.step1.title',
        desc: 'guide.jpgMaker.step1.desc',
        targets: ['[data-q="drop"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M21 15l-5-5L5 21"/></svg>',
        title: 'guide.jpgMaker.step2.title',
        desc: 'guide.jpgMaker.step2.desc',
        targets: ['[data-q="pages"]']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        title: 'guide.jpgMaker.step3.title',
        desc: 'guide.jpgMaker.step3.desc',
        targets: ['[data-q="all"]', '[data-q="selected"]']
      }
    ],
    detailsKey: 'guide.jpgMaker.details'
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
  },
  timestampMaker: {
    steps: [
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"/><path d="M12 8 16 12"/></svg>',
        title: 'guide.timestampMaker.step1.title',
        desc: 'guide.timestampMaker.step1.desc',
        targets: []
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18v16H3z"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
        title: 'guide.timestampMaker.step2.title',
        desc: 'guide.timestampMaker.step2.desc',
        targets: ['.tf-courses']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="19" r="2"/></svg>',
        title: 'guide.timestampMaker.step3.title',
        desc: 'guide.timestampMaker.step3.desc',
        targets: ['.tf-date-panel', '.tf-tree']
      },
      {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>',
        title: 'guide.timestampMaker.step4.title',
        desc: 'guide.timestampMaker.step4.desc',
        targets: ['.tf-submit']
      }
    ],
    detailsKey: 'guide.timestampMaker.details'
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
  guideEl.setAttribute('role', 'dialog');
  guideEl.setAttribute('aria-modal', 'true');
  guideEl.setAttribute('aria-hidden', 'true');
  guideEl.tabIndex = -1;

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
      <div><div class="guide-eyebrow">${t('guide.title')}</div><div class="guide-sub">${t('guide.sub')}</div></div>
      <button type="button" class="guide-close" aria-label="${t('guide.close')}" title="${t('guide.close')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
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

  let activeHighlightCleanup=null;
  const tool = layout.querySelector('.tool');
  if(tool)guideEl.querySelectorAll('.guide-step').forEach((step, index) => {
    let targets = [];
    let overlays = [];
    const updateHighlights = () => {
      overlays.forEach((overlay,targetIndex)=>{
        const rect=targets[targetIndex].getBoundingClientRect();
        overlay.style.left=`${rect.left}px`;
        overlay.style.top=`${rect.top}px`;
        overlay.style.width=`${rect.width}px`;
        overlay.style.height=`${rect.height}px`;
      });
    };
    const clearHighlight = () => {
      step.classList.remove('is-hovered');
      overlays.forEach(overlay => overlay.remove());
      overlays = [];
      document.removeEventListener('scroll', updateHighlights, true);
      window.removeEventListener('resize', updateHighlights);
      if(activeHighlightCleanup===clearHighlight)activeHighlightCleanup=null;
    };
    step.addEventListener('pointerenter', () => {
      activeHighlightCleanup?.();
      targets = conf.steps[index].targets.flatMap(selector => [...tool.querySelectorAll(selector)]);
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
      activeHighlightCleanup=clearHighlight;
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
  const scrim = document.createElement('button');
  scrim.type = 'button';scrim.className = 'tool-guide-scrim';scrim.setAttribute('aria-label', t('guide.close'));scrim.tabIndex = -1;
  const closeGuide = restoreFocus => {
    activeHighlightCleanup?.();
    layout.classList.remove('guide-open');
    guideEl.setAttribute('aria-hidden', 'true');
    guideEl.inert = true;
    if(restoreFocus){
      const phonePicker=document.querySelector('#tools-page.phone-tool-device #phone-tool-current');
      (phonePicker||document.getElementById('tool-guide-open'))?.focus();
    }
  };
  guideEl.inert = true;
  guideEl.openGuide = () => {
    layout.classList.add('guide-open');
    guideEl.inert = false;
    guideEl.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(()=>guideEl.querySelector('.guide-close')?.focus());
  };
  guideEl.closeGuide = closeGuide;
  guideEl.querySelector('.guide-close').addEventListener('click',()=>closeGuide(true));
  scrim.addEventListener('click',()=>closeGuide(true));
  document.addEventListener('keydown',event=>{
    if(!layout.classList.contains('guide-open'))return;
    if(event.key==='Escape'){event.preventDefault();closeGuide(true);return}
    if(event.key!=='Tab')return;
    const focusable=[...guideEl.querySelectorAll('button:not(:disabled),summary,[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
    if(!focusable.length){event.preventDefault();guideEl.focus();return}
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  });
  layout.append(scrim,guideEl);
}
