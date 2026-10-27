import {APP_VERSION} from '../config.js?v=3.1.5';
import {$,msg,track,loadAnalytics} from './util.js?v=3.1.5';
import * as resizer from './resizer.js?v=3.1.5';
import * as creator from './creator.js?v=3.1.5';
import * as pagelock from './pagelock.js?v=3.1.5';
import * as topdf from './topdf.js?v=3.1.5';
import {strings,t} from './i18n.js?v=3.1.5';

document.querySelector('[data-page="tools"]').textContent=t('nav.tools');
document.querySelector('[data-page="updates"]').textContent=t('nav.updates');
document.querySelector('[data-page="about"]').textContent=t('nav.about');
document.querySelector('.tabs').setAttribute('aria-label',t('nav.main'));

const TOOLS=[
  ['creator',t('tool.creator.short'),t('tool.creator'),t('library.categoryNotebook'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 7h35l17 17v54H13V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M48 8v17h16" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="22" y="31" width="34" height="24" rx="3" stroke="currentColor" stroke-width="3.5"/><circle cx="46" cy="38" r="3.5" fill="#85E8D8"/><path d="m25 51 9-9 7 7 5-5 7 7" stroke="#85E8D8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M39 62v16m-7-7 7 7 7-7" stroke="#85E8D8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.creator.desc'),creator],
  ['topdf',t('tool.topdf.short'),t('tool.topdf'),t('library.categoryNotebook'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 7h35l17 17v54H12V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M47 8v17h16M22 36h22M22 45h18M22 54h13" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="62" r="16" fill="#292A35" stroke="#FF927D" stroke-width="4"/><path d="M48 70V54h6a5 5 0 0 1 0 10h-6" stroke="#FF927D" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.topdf.desc'),topdf],
  ['pagelock',t('tool.pagelock.short'),t('tool.pagelock'),t('library.categoryNotebook'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 7h35l17 17v54H12V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M47 8v17h16M22 37h22M22 47h18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="39" y="52" width="25" height="20" rx="4" fill="#292A35" stroke="#85E8D8" stroke-width="3.5"/><path d="M45 52v-5a6.5 6.5 0 0 1 13 0v5" stroke="#85E8D8" stroke-width="3.5" stroke-linecap="round"/><circle cx="51.5" cy="61" r="2.5" fill="#85E8D8"/><path d="M51.5 63v3" stroke="#85E8D8" stroke-width="2.5" stroke-linecap="round"/></svg>`,t('tool.pagelock.desc'),pagelock],
  ['resizer',t('tool.resizer.short'),t('tool.resizer'),t('library.categoryImages'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M28 10H12v16m40-16h16v16M12 54v16h16m40-16v16H52" stroke="#85E8D8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="23" y="24" width="34" height="32" rx="3" stroke="currentColor" stroke-width="3.5"/><circle cx="47" cy="33" r="3.5" fill="#85E8D8"/><path d="m27 51 9-10 7 7 5-5 6 8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.resizer.desc'),resizer],
];
const main=$('tools'),carouselStage=$('carousel-stage'),library=$('tool-library'),libraryPanel=library.querySelector('.library-panel'),libraryGroups=$('library-groups'),allToolsButton=$('all-tools-button');
const startScreen=$('tool-start'),startCards=$('tool-start-cards'),toolbar=document.querySelector('#tools-page>.toolbar');
const home=document.createElement('section');home.className='view on';
home.innerHTML=`<div class="center"><div class="sub">${t('home.tag')}</div><h2>${t('home.title')}</h2><div class="sub">${t('home.help')}</div></div>`;
main.append(home);
const views={'':home};
for(const [key,shortLabel,label,category,icon,description,mod] of TOOLS){
  const v=document.createElement('section');v.className='view';v.dataset.tool=key;main.append(v);views[key]=v;
  if(mod) mod.mount(v); else v.innerHTML=`<div class="center"><h2>${label}</h2><div class="sub">${t('app.transition')}</div></div>`;
}
const categories=[
  {label:t('library.categoryNotebook'),tools:TOOLS.filter(item=>item[3]===t('library.categoryNotebook'))},
  {label:t('library.categoryImages'),tools:TOOLS.filter(item=>item[3]===t('library.categoryImages'))},
];
let activeIndex=-1,libraryTimer=0;
const startDescriptions={creator:t('start.creator'),topdf:t('start.topdf'),pagelock:t('start.pagelock'),resizer:t('start.resizer')};
startScreen.querySelector('.tool-start-eyebrow').textContent=t('start.eyebrow');
startScreen.querySelector('#tool-start-title').textContent=t('start.title');
startScreen.querySelector('.tool-start-heading p').textContent=t('start.sub');
for(const tool of TOOLS){
  const [key,shortLabel,,category,icon]=tool,card=document.createElement('button');
  card.type='button';card.className='tool-start-card';card.dataset.tool=key;
  card.innerHTML=`${key==='creator'?'<kbd class="tool-start-card-kbd">Space</kbd>':''}<span class="tool-start-card-icon" aria-hidden="true">${icon}</span><span class="tool-start-card-title">${shortLabel}</span><span class="tool-start-card-description">${startDescriptions[key]}</span><span class="tool-start-card-arrow" aria-hidden="true">→</span>`;
  card.setAttribute('aria-label',`${shortLabel}. ${startDescriptions[key]}`);
  card.onclick=()=>selectTool(key);
  startCards.append(card);
}
function cardMarkup(tool,position){
  const [key,shortLabel,,category,icon,description]=tool;
  return `<button type="button" class="carousel-card ${position}" data-tool="${key}" aria-label="${shortLabel}"><span class="carousel-card-icon" aria-hidden="true">${icon}</span><span class="carousel-card-copy"><span class="carousel-card-category">${category}</span><span class="carousel-card-title">${shortLabel}</span>${position==='current'?`<span class="carousel-card-description">${description}</span>`:''}</span></button>`;
}
function renderCarousel(direction=0,animate=false){
  const previous=TOOLS[activeIndex<0?TOOLS.length-1:(activeIndex-1+TOOLS.length)%TOOLS.length],current=activeIndex<0?null:TOOLS[activeIndex],next=TOOLS[activeIndex<0?0:(activeIndex+1)%TOOLS.length];
  const center=current?cardMarkup(current,'current'):`<button type="button" class="carousel-card current empty" data-open-library aria-label="${t('carousel.emptyTitle')}"><span class="carousel-card-icon" aria-hidden="true">＋</span><span class="carousel-card-copy"><span class="carousel-card-category">${t('carousel.emptyEyebrow')}</span><span class="carousel-card-title">${t('carousel.emptyTitle')}</span><span class="carousel-card-description">${t('carousel.emptyHint')}</span></span></button>`;
  carouselStage.innerHTML=`${cardMarkup(previous,'neighbor previous')}<button type="button" class="carousel-step previous" aria-label="${t('carousel.shortcutPrevious')}" title="${t('carousel.shortcutPrevious')}"><span aria-hidden="true">←</span><kbd>A</kbd></button>${center}<button type="button" class="carousel-step next" aria-label="${t('carousel.shortcutNext')}" title="${t('carousel.shortcutNext')}"><kbd>D</kbd><span aria-hidden="true">→</span></button>${cardMarkup(next,'neighbor next')}`;
  carouselStage.querySelector('.previous.neighbor').onclick=()=>selectTool(previous[0],{direction:-1});
  carouselStage.querySelector('.next.neighbor').onclick=()=>selectTool(next[0],{direction:1});
  carouselStage.querySelector('[data-open-library]')?.addEventListener('click',openLibrary);
  carouselStage.querySelector('.carousel-step.previous').onclick=()=>selectRelative(-1);
  carouselStage.querySelector('.carousel-step.next').onclick=()=>selectRelative(1);
  if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const offset=direction*28;
    carouselStage.querySelector('.current').animate([{opacity:0,transform:`translateX(${offset}px) scale(.97)`},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});
    for(const card of carouselStage.querySelectorAll('.neighbor'))card.animate([{opacity:0,transform:`translateX(${offset/2}px)`},{opacity:.2,transform:'translateX(0)'}],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  updateLibrarySelection();
}
function renderLibrary(){
  libraryGroups.innerHTML='';
  for(const category of categories){
    const group=document.createElement('section');group.className='library-category';group.dataset.category=category.label;
    const heading=document.createElement('h3');heading.className='library-category-title';heading.textContent=category.label;
    const grid=document.createElement('div');grid.className='library-grid';
    for(const tool of category.tools){
      const [key,shortLabel,,label,icon,description]=tool,button=document.createElement('button');
      button.type='button';button.className='library-card';button.dataset.tool=key;
      button.innerHTML=`<span class="library-card-icon" aria-hidden="true">${icon}</span><span class="library-card-title">${shortLabel}</span><span class="library-card-description">${description}</span><span class="library-card-arrow" aria-hidden="true">→</span>`;
      button.onclick=()=>{closeLibrary();selectTool(key)};grid.append(button);
    }
    group.append(heading,grid);libraryGroups.append(group);
  }
  updateLibrarySelection();
}
function updateLibrarySelection(){
  const active=TOOLS[activeIndex]?.[0];
  for(const button of libraryGroups.querySelectorAll('.library-card')){
    const selected=button.dataset.tool===active;button.classList.toggle('selected',selected);
    if(selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  }
}
function selectRelative(direction){const index=activeIndex<0?(direction<0?TOOLS.length-1:0):(activeIndex+direction+TOOLS.length)%TOOLS.length;selectTool(TOOLS[index][0],{direction})}
function closeLibrary(restoreFocus=true){
  if(library.hidden)return;
  const timer=++libraryTimer;library.classList.remove('open');
  setTimeout(()=>{if(timer===libraryTimer&&!library.classList.contains('open'))library.hidden=true},280);
  allToolsButton.setAttribute('aria-expanded','false');if(restoreFocus)allToolsButton.focus({preventScroll:true});
}
function openLibrary(){
  ++libraryTimer;library.hidden=false;
  allToolsButton.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>library.classList.add('open'));
  setTimeout(()=>libraryPanel.focus({preventScroll:true}),80);
}
function toggleLibrary(){library.hidden||!library.classList.contains('open')?openLibrary():closeLibrary()}
renderLibrary();
renderCarousel();
allToolsButton.onclick=toggleLibrary;
$('library-close').onclick=()=>closeLibrary();
library.querySelector('[data-library-close]').onclick=()=>closeLibrary();
let toolTransition=0;
let workspaceShown=false,enteringWorkspace=false;
function selectTool(key,{initial=false,log=true,direction}={}){
  const next=views[key],current=main.querySelector('.view.on'),index=TOOLS.findIndex(item=>item[0]===key);
  if(!next||index<0)return;
  if(!workspaceShown){
    if(enteringWorkspace)return;
    enteringWorkspace=true;startCards.querySelectorAll('button').forEach(button=>button.disabled=true);
    const reveal=()=>{
      startScreen.hidden=true;startScreen.classList.remove('leaving');
      toolbar.classList.remove('is-hidden');main.classList.remove('is-hidden');
      workspaceShown=true;enteringWorkspace=false;
      selectTool(key,{initial:true,log,direction});
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const active=views[key];active.classList.add('entering');setTimeout(()=>active.classList.remove('entering'),260)}
    };
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)reveal();
    else{startScreen.classList.add('leaving');setTimeout(reveal,180)}
    return;
  }
  const priorIndex=activeIndex,movement=direction??(priorIndex<0||((index-priorIndex+TOOLS.length)%TOOLS.length)<=TOOLS.length/2?1:-1);
  activeIndex=index;renderCarousel(movement,priorIndex!==index&&!initial);
  next.scrollTop=0;
  document.getElementById('main').scrollTop=0;
  const token=++toolTransition;
  if(current!==next){
    if(initial||matchMedia('(prefers-reduced-motion: reduce)').matches||!current){if(current)current.classList.remove('on','leaving','entering');next.classList.add('on');next.classList.remove('leaving','entering')}
    else{current.classList.remove('entering');current.classList.add('leaving');setTimeout(()=>{if(token!==toolTransition)return;current.classList.remove('on','leaving');next.classList.add('on','entering');setTimeout(()=>{if(token===toolTransition)next.classList.remove('entering')},260)},145)}
  }else current.classList.remove('leaving');
  if(log)track('open/'+key,'Open '+TOOLS[index][1]);
  if(key==='topdf')topdf.prepare();
}
document.addEventListener('keydown',e=>{
  if($('dlg')?.open)return;
  if(e.key==='Escape'&&library.classList.contains('open')){e.preventDefault();closeLibrary();return}
  const target=e.target,typing=target instanceof Element&&target.matches('input,textarea,select,[contenteditable="true"]');
  if(typing||e.altKey||e.ctrlKey||e.metaKey)return;
  const shortcut={KeyA:'a',KeyD:'d',KeyQ:'q',KeyE:'e',KeyF:'f',KeyI:'i'}[e.code]||e.key.toLowerCase();
  if(library.classList.contains('open')){if(shortcut==='f'){e.preventDefault();closeLibrary()}return}
  if(shortcut==='a'&&workspaceShown){e.preventDefault();selectRelative(-1)}
  else if(shortcut==='d'&&workspaceShown){e.preventDefault();selectRelative(1)}
  else if(shortcut==='q'||shortcut==='e'){
    e.preventDefault();
    const index=pageTabs.findIndex(button=>button.classList.contains('active'));
    const step=shortcut==='q'?-1:1;
    showPage(pageTabs[(index+step+pageTabs.length)%pageTabs.length].dataset.page);
  }
  else if(shortcut==='i'){
    const view=main.querySelector('.view.on'),instructionToggle=view?.querySelector('.iconbtn[aria-expanded]');
    if(instructionToggle){e.preventDefault();instructionToggle.click()}
  }
  else if(shortcut==='f'&&workspaceShown){e.preventDefault();openLibrary()}
  else if(e.code==='Space'&&!workspaceShown&&document.querySelector('#tools-page.on')&&!(target instanceof Element&&target.closest('button,a,summary,[role="button"]'))){e.preventDefault();selectTool('creator')}
});

const pageTabs=[...document.querySelectorAll('.tab')],tabIndicator=document.querySelector('.tab-indicator');
let pageTransition=0;
function syncTabIndicator(){const active=pageTabs.find(b=>b.classList.contains('active'));if(!active||!tabIndicator)return;tabIndicator.style.width=`${active.offsetWidth}px`;tabIndicator.style.transform=`translateX(${active.offsetLeft}px)`}
function showPage(name){
  const next=document.getElementById(`${name}-page`),current=document.querySelector('.page.on');
  if(!next)return;
  pageTabs.forEach(b=>b.classList.toggle('active',b.dataset.page===name));requestAnimationFrame(syncTabIndicator);
  if(current===next){current.classList.remove('leaving');if(name==='updates')requestAnimationFrame(fitTimeline);return}
  const token=++pageTransition;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!current){if(current)current.classList.remove('on','leaving','entering');next.classList.add('on');next.classList.remove('leaving','entering');if(name==='updates')requestAnimationFrame(fitTimeline);return}
  current.classList.remove('entering');current.classList.add('leaving');
  setTimeout(()=>{if(token!==pageTransition)return;current.classList.remove('on','leaving');next.classList.add('on','entering');if(name==='updates')requestAnimationFrame(fitTimeline);setTimeout(()=>{if(token===pageTransition)next.classList.remove('entering')},260)},145);
}
pageTabs.forEach(b=>b.onclick=()=>showPage(b.dataset.page));
requestAnimationFrame(syncTabIndicator);addEventListener('resize',syncTabIndicator);
const updates=$('updates-page');
const reduceReleaseMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
updates.innerHTML=`<div class="page-heading"><img class="page-icon" src="icon.ico" alt=""><div><h1>${t('updates.title')}</h1><div class="sub">${t('updates.sub')}</div></div></div><div class="timeline">${strings.RELEASES.map((r,i)=>`<article class="release${reduceReleaseMotion?'':' reveal-pending'}" style="--reveal-delay:${Math.min(i,5)*70}ms"><div class="release-date">${r.date}</div><div class="timeline-dot ${i===0?'latest':''}"></div><div class="release-card"><h2>${r.version}${i===0?`<span class="latest-pill">${t('updates.latest')}</span>`:''}</h2>${r.transition?`<div class="platform-transition" aria-label="${t('updates.transition')}"><div class="platform-node"><span class="platform-window exe-window"><i></i><i></i><i></i></span><strong>${t('updates.desktop')}</strong><small>.EXE</small></div><span class="transition-arrow" aria-hidden="true">→</span><div class="platform-node"><span class="platform-window web-window"><i></i><i></i><i></i></span><strong>${t('updates.web')}</strong><small>${t('updates.browser')}</small></div></div>`:''}${r.sections.map(s=>s.paragraphs?`<div class="release-story">${s.paragraphs.map(p=>`<p>${p}</p>`).join('')}</div>`:`<div class="release-section"><h3>${s.title}</h3><ul>${s.items.map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')}</div></article>`).join('')}<div class="timeline-line" aria-hidden="true"></div></div>`;
const timeline=updates.querySelector('.timeline'),timelineLine=timeline.querySelector('.timeline-line');
function fitTimeline(){const dots=[...timeline.querySelectorAll('.timeline-dot')];if(dots.length<2)return;const parent=timeline.getBoundingClientRect(),first=dots[0].getBoundingClientRect(),last=dots[dots.length-1].getBoundingClientRect();timelineLine.style.top=`${first.top+first.height/2-parent.top}px`;timelineLine.style.height=`${last.top+last.height/2-first.top-first.height/2}px`}
requestAnimationFrame(fitTimeline);addEventListener('resize',fitTimeline);new ResizeObserver(fitTimeline).observe(timeline);
if(!reduceReleaseMotion){const revealObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('revealed');entry.target.classList.remove('reveal-pending');revealObserver.unobserve(entry.target)}}},{root:document.getElementById('main'),rootMargin:'0px 0px -8% 0px',threshold:.08});timeline.querySelectorAll('.release.reveal-pending').forEach(el=>revealObserver.observe(el))}
const about=$('about-page');
about.innerHTML=`<section class="about-card"><div class="page-heading"><img class="page-icon" src="icon.ico" alt=""><div><h1>${t('about.title')}</h1><div class="sub">Penguin Logistics</div></div></div><p>${t('about.contact')}</p><p>${t('about.creator')} Champ, AT Math + Claude, Codex, Zhipu and Antigravity (all of them are free btw)</p><p>${t('about.version')} <strong>${APP_VERSION}</strong></p><p>${t('about.privacy')}</p></section>`;

const glowTargets=[...document.querySelectorAll('.center,.drop,.previewbox,.listbox,.release-card,.about-card,.instruction-panel,.carousel-card,.library-card,.tool-start-card')];
glowTargets.forEach(el=>el.classList.add('pointer-glow'));
let activeGlow=null,lastPointer=null;
function moveGlow(){
  if(!activeGlow||!lastPointer)return;
  const rect=activeGlow.getBoundingClientRect();
  // The glow sits inside the box's own scrolling content, so on a scrolled list it is shifted by the scroll position to stay under the pointer.
  activeGlow.style.setProperty('--glow-top',`${activeGlow.scrollTop}px`);
  activeGlow.style.setProperty('--glow-left',`${activeGlow.scrollLeft}px`);
  activeGlow.style.setProperty('--glow-x',`${lastPointer.x-rect.left-activeGlow.clientLeft}px`);
  activeGlow.style.setProperty('--glow-y',`${lastPointer.y-rect.top-activeGlow.clientTop}px`);
}
function dropGlow(){activeGlow?.classList.remove('pointer-active');activeGlow=null;lastPointer=null}
document.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch')return;
  const target=e.target.closest('.pointer-glow');
  if(target!==activeGlow){activeGlow?.classList.remove('pointer-active');activeGlow=target;activeGlow?.classList.add('pointer-active')}
  lastPointer={x:e.clientX,y:e.clientY};moveGlow();
});
document.addEventListener('scroll',e=>{if(e.target===activeGlow)moveGlow()},true);   // list scrolled by wheel or by the app while the pointer stays still
['dragstart','dragend','drop'].forEach(n=>document.addEventListener(n,dropGlow,true));   // no pointermove arrives during a drag, so the glow would stay frozen where the drag began

loadAnalytics(); track('app/start','App start');
if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(()=>topdf.prepare(),{timeout:2500})}else{setTimeout(()=>topdf.prepare(),1200)}
