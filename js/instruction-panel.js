import {t} from './i18n.js';

export function bindInstructionPanel(layout,toggle,panel,close,copy,instructions){
  toggle.title=t('instructions.open');toggle.setAttribute('aria-label',t('instructions.open'));
  close.setAttribute('aria-label',t('instructions.close'));
  const heading=panel.querySelector('.instruction-heading h2');if(heading)heading.textContent=t('instructions.title');
  const sub=panel.querySelector('.instruction-heading p');if(sub)sub.textContent=t('instructions.sub');
  copy.textContent=instructions||'';
  if(layout.querySelector('.wideview'))layout.classList.add('wide-tool');
  // Keep the wide File creator side-by-side on common laptop widths. The tool may
  // extend beyond the left edge so its instructions never overlay the tool.
  const drawerQuery=matchMedia('(min-width:761px) and (max-width:1253px)');
  const isDrawer=()=>layout.classList.contains('drawer');
  const syncDrawer=()=>layout.classList.toggle('drawer',drawerQuery.matches);
  syncDrawer();
  let open=false,sequence=0;
  const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isStacked=()=>getComputedStyle(layout).flexDirection==='column';
  const placePanel=()=>{
    if(!open||isStacked()||isDrawer()){
      panel.style.left='';panel.style.right='';return;
    }
    const bounds=layout.getBoundingClientRect(),tool=layout.querySelector('.tool').getBoundingClientRect();
    const left=Math.max(0,Math.min(tool.right-bounds.left+12,bounds.width-panel.offsetWidth));
    panel.style.left=`${left}px`;panel.style.right='auto';
  };
  const setOpen=value=>{
    if(open===value)return;
    open=value;const current=++sequence;
    toggle.setAttribute('aria-expanded',String(open));
    const finishOpening=()=>{
      if(!open||sequence!==current)return;
      placePanel();panel.setAttribute('aria-hidden','false');panel.inert=false;
      panel.classList.add('quick-open');layout.classList.add('with-instructions');close.focus();
      setTimeout(()=>panel.classList.remove('quick-open'),430);
    };
    const finishClosing=()=>{
      if(open||sequence!==current)return;
      layout.classList.remove('tool-shifted');panel.style.left='';panel.style.right='';toggle.focus();
    };
    if(open){
      panel.setAttribute('aria-hidden','true');panel.inert=true;
      if(!isDrawer())layout.classList.add('tool-shifted');
      if(isDrawer()||isStacked()||reducedMotion())finishOpening();else setTimeout(finishOpening,360);
    }else{
      panel.setAttribute('aria-hidden','true');panel.inert=true;
      panel.classList.remove('quick-open');
      layout.classList.remove('with-instructions');
      if(isDrawer()||isStacked()||reducedMotion())finishClosing();else setTimeout(finishClosing,200);
    }
  };
  toggle.onclick=()=>setOpen(!open);close.onclick=()=>setOpen(false);
  drawerQuery.addEventListener('change',()=>{syncDrawer();if(!open)return;layout.classList.toggle('tool-shifted',!isDrawer()&&!isStacked());placePanel()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open&&isDrawer()){e.preventDefault();setOpen(false)}});
  document.addEventListener('pointerdown',e=>{if(open&&isDrawer()&&!panel.contains(e.target)&&!toggle.contains(e.target))setOpen(false)});
  window.addEventListener('resize',()=>{if(open&&layout.classList.contains('with-instructions'))placePanel()});
  panel.inert=true;
}
