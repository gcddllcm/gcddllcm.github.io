import {APP_VERSION} from '../config.js?v=3.2.1';
import {$,msg,track,loadAnalytics} from './util.js?v=3.2.1';
import * as resizer from './resizer.js?v=3.2.1';
import * as creator from './creator.js?v=3.2.1';
import * as pagelock from './pagelock.js?v=3.2.1';
import * as topdf from './topdf.js?v=3.2.1';
import {strings,t} from './i18n.js?v=3.2.1';

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
let hasChosenTool=false;
const landing=$('landing-page');
landing.innerHTML=`<section class="landing-content"><div class="landing-intro"><h1 id="landing-title">${t('landing.title')}</h1><p>${t('landing.sub')}</p></div><div class="landing-tools"></div></section>`;
const landingTools=landing.querySelector('.landing-tools');
for(const [key,shortLabel,label,,icon,description] of TOOLS){
  const card=document.createElement('button');card.type='button';card.className='landing-tool';card.dataset.tool=key;card.setAttribute('aria-label',`${label}. ${description}${key==='creator'?`. ${t('landing.creatorShortcut')}`:''}`);
  card.innerHTML=`<span class="landing-tool-icon" aria-hidden="true">${icon}</span><span class="landing-tool-copy"><strong>${label}</strong><span>${description}</span></span><span class="landing-tool-action">${key==='creator'?`<kbd class="page-shortcut-key" aria-hidden="true">SPACE</kbd>`:''}<span class="landing-tool-arrow" aria-hidden="true">→</span></span>`;
  card.onclick=()=>{hasChosenTool=true;selectTool(key);showPage('tools')};
  landingTools.append(card);
}
if(matchMedia('(hover: hover) and (pointer: fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  for(const card of landingTools.querySelectorAll('.landing-tool')){
    card.addEventListener('pointermove',e=>{
      const bounds=card.getBoundingClientRect(),x=(e.clientX-bounds.left)/bounds.width,y=(e.clientY-bounds.top)/bounds.height;
      card.style.setProperty('--tilt-x',`${(x-.5)*8}deg`);
      card.style.setProperty('--tilt-y',`${(.5-y)*8}deg`);
      card.style.setProperty('--pointer-x',`${x*100}%`);
      card.style.setProperty('--pointer-y',`${y*100}%`);
    });
    card.addEventListener('pointerleave',()=>{
      card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');
      card.style.removeProperty('--pointer-x');card.style.removeProperty('--pointer-y');
    });
  }
}
const main=$('tools'),navList=$('tool-nav-list');
$('tool-nav').setAttribute('aria-label',t('sidebar.title'));
$('tool-nav-eyebrow').innerHTML=`<span>${t('sidebar.title')}</span><kbd class="page-shortcut-key tool-nav-space-shortcut" aria-label="Press Space to select the next tool" title="Press Space to select the next tool">SPACE</kbd>`;
const views={};
for(const [key,shortLabel,label,category,icon,description,mod] of TOOLS){
  const v=document.createElement('section');v.className='view';v.dataset.tool=key;main.append(v);views[key]=v;
  if(mod) mod.mount(v); else v.innerHTML=`<div class="center"><h2>${label}</h2><div class="sub">${t('app.transition')}</div></div>`;
}
let activeIndex=-1;
const categories=[
  {label:t('library.categoryNotebook'),tools:TOOLS.filter(item=>item[3]===t('library.categoryNotebook'))},
  {label:t('library.categoryImages'),tools:TOOLS.filter(item=>item[3]===t('library.categoryImages'))},
];
function updateNavSelection(){
  const active=TOOLS[activeIndex]?.[0];
  for(const button of navList.querySelectorAll('.tool-nav-item')){
    const selected=button.dataset.tool===active;button.classList.toggle('active',selected);
    if(selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  }
}
for(const category of categories){
  const group=document.createElement('section');group.className='tool-nav-group';
  const heading=document.createElement('h3');heading.className='tool-nav-category';heading.textContent=category.label;
  group.append(heading);
  for(const [key,shortLabel,, ,icon,description] of category.tools){
    const number=TOOLS.findIndex(item=>item[0]===key)+1;
    const button=document.createElement('button');
    button.type='button';button.className='tool-nav-item';button.dataset.tool=key;
    button.setAttribute('aria-label',`${shortLabel}. ${description}. ${t('tool.shortcutNumber',number)}`);
    button.innerHTML=`<span class="tool-nav-icon" aria-hidden="true">${icon}</span><span class="tool-nav-copy"><span class="tool-nav-name">${shortLabel}</span><span class="tool-nav-desc">${description}</span></span><kbd class="page-shortcut-key tool-nav-shortcut" aria-hidden="true">${number}</kbd>`;
    button.onclick=()=>selectTool(key);
    group.append(button);
  }
  navList.append(group);
}
let toolTransition=0;
function selectTool(key,{log=true}={}){
  const next=views[key],current=main.querySelector('.view.on'),index=TOOLS.findIndex(item=>item[0]===key);
  if(!next||index<0)return;
  activeIndex=index;updateNavSelection();
  next.scrollTop=0;
  document.getElementById('main').scrollTop=0;
  const token=++toolTransition;
  if(current!==next){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||!current){if(current)current.classList.remove('on','leaving','entering');next.classList.add('on');next.classList.remove('leaving','entering')}
    else{current.classList.remove('entering');current.classList.add('leaving');setTimeout(()=>{if(token!==toolTransition)return;current.classList.remove('on','leaving');next.classList.add('on','entering');setTimeout(()=>{if(token===toolTransition)next.classList.remove('entering')},260)},145)}
  }else current.classList.remove('leaving');
  if(log)track('open/'+key,'Open '+TOOLS[index][1]);
  if(key==='topdf')topdf.prepare();
}
selectTool('creator',{log:false});
// Keep keyboard focus styling visible while the user is navigating with Tab.
// Any other key (including app shortcuts) switches the visual treatment off.
document.addEventListener('keydown',e=>{
  document.body.classList.toggle('keyboard-tab-nav',e.key==='Tab');
},true);
document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-tab-nav'),true);
document.addEventListener('keydown',e=>{
  if($('dlg')?.open)return;
  const target=e.target,typing=target instanceof Element&&target.matches('input,textarea,select,[contenteditable="true"]'),interactive=target instanceof Element&&target.closest('button,a,[role="button"],[tabindex]:not([tabindex="-1"])');
  if(typing||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.code==='Space'&&landing.classList.contains('on')&&!(target instanceof Element&&target.closest('button,a,[role="button"]'))){e.preventDefault();landingTools.querySelector('[data-tool="creator"]')?.click();return}
  if(e.code==='Space'&&!e.repeat&&!interactive&&document.getElementById('tools-page').classList.contains('on')){e.preventDefault();selectTool(TOOLS[(activeIndex+1)%TOOLS.length][0]);return}
  const digit=/^Digit([1-9])$/.exec(e.code)?.[1]??(/^[1-9]$/.test(e.key)?e.key:null),numberShortcut=digit&&Number(digit)<=TOOLS.length?Number(digit)-1:-1;   // 1..N for the N tools
  if(numberShortcut>=0&&document.getElementById('tools-page').classList.contains('on')){e.preventDefault();selectTool(TOOLS[numberShortcut][0]);return}
  const shortcut={KeyQ:'q',KeyE:'e',KeyI:'i'}[e.code]||(e.key&&['q','e','i'].includes(e.key.toLowerCase())?e.key.toLowerCase():null);
  if(shortcut==='q'||shortcut==='e'){
    e.preventDefault();
    const selectedIndex=pageTabs.findIndex(button=>button.classList.contains('active'));
    const index=selectedIndex<0?0:selectedIndex;
    const step=shortcut==='q'?-1:1;
    showPage(pageTabs[(index+step+pageTabs.length)%pageTabs.length].dataset.page);
  }
  else if(shortcut==='i'){
    const guide=main.querySelector('.view.on .tool-guide');
    if(guide?.toggleDetails){e.preventDefault();guide.toggleDetails()}
  }
});

const pageTabs=[...document.querySelectorAll('.tab')],tabIndicator=document.querySelector('.tab-indicator');
let pageTransition=0;
function syncTabIndicator(){const active=pageTabs.find(b=>b.classList.contains('active'));if(!active||!tabIndicator)return;tabIndicator.style.width=`${active.offsetWidth}px`;tabIndicator.style.transform=`translateX(${active.offsetLeft}px)`}
function showPage(name){
  const pageName=name==='tools'&&!hasChosenTool?'landing':name;
  const next=document.getElementById(`${pageName}-page`),current=document.querySelector('.page.on');
  if(!next)return;
  pageTabs.forEach(b=>b.classList.toggle('active',b.dataset.page===name));requestAnimationFrame(syncTabIndicator);
  if(current===next){current.classList.remove('leaving');if(name==='updates')requestAnimationFrame(fitTimeline);return}
  if(name==='about')animateProjectCounts();
  const token=++pageTransition;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!current){if(current)current.classList.remove('on','leaving','entering');next.classList.add('on');next.classList.remove('leaving','entering');if(name==='about')animateAboutCard();if(name==='updates')requestAnimationFrame(fitTimeline);return}
  current.classList.remove('entering');current.classList.add('leaving');
  setTimeout(()=>{if(token!==pageTransition)return;current.classList.remove('on','leaving');next.classList.add('on','entering');if(name==='about')animateAboutCard();if(name==='updates')requestAnimationFrame(fitTimeline);setTimeout(()=>{if(token===pageTransition)next.classList.remove('entering')},260)},145);
}
pageTabs.forEach(b=>b.onclick=()=>showPage(b.dataset.page));
requestAnimationFrame(syncTabIndicator);addEventListener('resize',syncTabIndicator);
const updates=$('updates-page');
const reduceReleaseMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
updates.innerHTML=`<div class="page-heading"><img class="page-icon" src="icon.ico" alt=""><div><h1>${t('updates.title')}</h1><div class="sub">${t('updates.sub')}</div></div></div><div class="timeline">${strings.RELEASES.map((r,i)=>`<article class="release${reduceReleaseMotion?'':' reveal-pending'}" style="--reveal-delay:${Math.min(i,5)*70}ms"><div class="release-date">${r.date}</div><div class="timeline-dot ${i===0?'latest':''}"></div><div class="release-card"><h2>${r.version}${i===0?`<span class="latest-pill">${t('updates.latest')}</span>`:''}</h2>${r.transition?`<div class="platform-transition" aria-label="${t('updates.transition')}"><div class="platform-node"><span class="platform-window exe-window"><i></i><i></i><i></i></span><strong>${t('updates.desktop')}</strong><small>.EXE</small></div><span class="transition-arrow" aria-hidden="true">→</span><div class="platform-node"><span class="platform-window web-window"><i></i><i></i><i></i></span><strong>${t('updates.web')}</strong><small>${t('updates.browser')}</small></div></div>`:''}${r.sections.map(s=>s.paragraphs?`<div class="release-story">${s.paragraphs.map(p=>`<p>${p}</p>`).join('')}</div>`:`<div class="release-section"><h3>${s.title}</h3><ul>${s.items.map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')}</div></article>`).join('')}<div class="timeline-line" aria-hidden="true"></div></div>`;
const timeline=updates.querySelector('.timeline'),timelineLine=timeline.querySelector('.timeline-line');
function fitTimeline(){const dots=[...timeline.querySelectorAll('.timeline-dot')];if(dots.length<2)return;const parent=timeline.getBoundingClientRect(),first=dots[0].getBoundingClientRect(),last=dots[dots.length-1].getBoundingClientRect();timelineLine.style.top=`${first.top+first.height/2-parent.top}px`;timelineLine.style.height=`${last.top-first.top-first.height/2}px`}
requestAnimationFrame(fitTimeline);addEventListener('resize',fitTimeline);new ResizeObserver(fitTimeline).observe(timeline);
if(!reduceReleaseMotion){const revealObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('revealed');entry.target.classList.remove('reveal-pending');revealObserver.unobserve(entry.target)}}},{root:document.getElementById('main'),rootMargin:'0px 0px -8% 0px',threshold:.08});timeline.querySelectorAll('.release.reveal-pending').forEach(el=>revealObserver.observe(el))}
const about=$('about-page');
const PROJECT_LINE_COUNT=6262,PROJECT_FILE_COUNT=33;
about.innerHTML=`<section class="about-card"><div class="about-hero"><div class="page-heading"><div><h1>${t('about.title')}</h1><div class="sub">Penguin Logistics</div></div></div><div class="about-radar" aria-hidden="true"><span class="about-radar-sweep"></span><img src="icon.ico" alt=""><span class="about-radar-point"></span></div></div><article class="about-lines" aria-label="${t('about.linesLabel')}"><div class="about-stat"><span class="about-lines-label">${t('about.linesLabel')}</span><strong class="about-lines-value">${PROJECT_LINE_COUNT.toLocaleString()}</strong><span class="about-lines-note">${t('about.linesNote',PROJECT_FILE_COUNT.toLocaleString())}</span></div><div class="about-stat about-stat-files"><span class="about-lines-label">${t('about.filesLabel')}</span><strong class="about-files-value">${PROJECT_FILE_COUNT}</strong><span class="about-lines-note">${t('about.filesNote')}</span></div></article><div class="about-details"><p class="about-detail about-detail-contact"><svg class="about-detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-11.2 6.5L4 19l1-4.1A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 11.5h6m-3-3v6"/></svg>${t('about.contact')}</p><p class="about-detail about-detail-creator"><svg class="about-detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10" cy="8" r="3"/><path d="M4.5 19a5.5 5.5 0 0 1 11 0m3-12 .8 1.7L21 9.5l-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8L18.5 7Z"/></svg>${t('about.creator')} Champ (AT Math) + Claude, Codex, Zhipu, Antigravity, Copilot, and Cursor (all of them are free btw)</p><p class="about-detail about-detail-version"><svg class="about-detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.5h10l4 4v9H5z"/><path d="M15 5.5v4h4m-10 4h6m-6 3h6"/></svg>${t('about.version')} <strong>${APP_VERSION}</strong></p><p class="about-detail about-detail-privacy"><svg class="about-detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 19 6v5c0 4.5-2.9 7.8-7 10-4.1-2.2-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>${t('about.privacy')}</p></div></section>`;
function animateAboutCard(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const card=about.querySelector('.about-lines');
  if(!card)return;
  card.classList.remove('about-lines-arriving');
  void card.offsetWidth;
  card.classList.add('about-lines-arriving');
}
about.querySelector('.about-lines').addEventListener('animationend',event=>{
  if(event.animationName==='about-lines-arrive')event.currentTarget.classList.remove('about-lines-arriving');
});
let lineCountAnimation=0,fileCountAnimation=0;
function animateProjectLineCount(){
  const value=about.querySelector('.about-lines-value');
  if(!value)return;
  cancelAnimationFrame(lineCountAnimation);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){value.textContent=PROJECT_LINE_COUNT.toLocaleString();return}
  const started=performance.now(),duration=1900;
  function tick(now){
    const progress=Math.min((now-started)/duration,1);
    const eased=progress===1?1:2**(-10*progress)*Math.sin((progress*10-.75)*(2*Math.PI/3))+1;
    value.textContent=Math.round(PROJECT_LINE_COUNT*eased).toLocaleString();
    if(progress<1)lineCountAnimation=requestAnimationFrame(tick);
  }
  value.textContent='0';
  lineCountAnimation=requestAnimationFrame(tick);
}
function animateProjectFileCount(){
  const value=about.querySelector('.about-files-value');
  if(!value)return;
  cancelAnimationFrame(fileCountAnimation);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){value.textContent=PROJECT_FILE_COUNT.toLocaleString();return}
  const started=performance.now(),duration=2400;
  function tick(now){
    const progress=Math.min((now-started)/duration,1);
    const eased=1-(1-progress)**3;
    value.textContent=Math.round(PROJECT_FILE_COUNT*eased).toLocaleString();
    if(progress<1)fileCountAnimation=requestAnimationFrame(tick);
  }
  value.textContent='0';
  fileCountAnimation=requestAnimationFrame(tick);
}
const animateProjectCounts=()=>{animateProjectLineCount();animateProjectFileCount()};

const glowTargets=[...document.querySelectorAll('.center,.drop,.previewbox,.listbox,.release-card,.about-card,.about-lines,.instruction-panel,.tool-nav,.tool-nav-item,.tool-guide')];
glowTargets.forEach(el=>el.classList.add('pointer-glow'));
let activeGlow=null,lastPointer=null;
function moveGlow(){
  if(!activeGlow||!lastPointer)return;
  const rect=activeGlow.getBoundingClientRect();
  // The glow sits inside the box's own scrolling content, so on a scrolled list it is shifted by the scroll position to stay under the pointer.
  activeGlow.style.setProperty('--glow-top',`${activeGlow.scrollTop}px`);
  activeGlow.style.setProperty('--glow-left',`${activeGlow.scrollLeft}px`);
  const x=lastPointer.x-rect.left-activeGlow.clientLeft,y=lastPointer.y-rect.top-activeGlow.clientTop;
  activeGlow.style.setProperty('--glow-x',`${x}px`);
  activeGlow.style.setProperty('--glow-y',`${y}px`);
  if(activeGlow.matches('.about-lines')){
    activeGlow.style.setProperty('--tilt-x',`${((.5-y/activeGlow.clientHeight)*12).toFixed(2)}deg`);
    activeGlow.style.setProperty('--tilt-y',`${((x/activeGlow.clientWidth-.5)*14).toFixed(2)}deg`);
  }
}
function dropGlow(){activeGlow?.classList.remove('pointer-active');activeGlow?.style.setProperty('--tilt-x','0deg');activeGlow?.style.setProperty('--tilt-y','0deg');activeGlow=null;lastPointer=null}
document.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch')return;
  const target=e.target.closest('.pointer-glow');
  if(target!==activeGlow){activeGlow?.classList.remove('pointer-active');activeGlow?.style.setProperty('--tilt-x','0deg');activeGlow?.style.setProperty('--tilt-y','0deg');activeGlow=target;activeGlow?.classList.add('pointer-active')}
  lastPointer={x:e.clientX,y:e.clientY};moveGlow();
});
document.addEventListener('scroll',e=>{if(e.target===activeGlow)moveGlow()},true);   // list scrolled by wheel or by the app while the pointer stays still
['dragstart','dragend','drop'].forEach(n=>document.addEventListener(n,dropGlow,true));   // no pointermove arrives during a drag, so the glow would stay frozen where the drag began

loadAnalytics(); track('app/start','App start');
if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(()=>topdf.prepare(),{timeout:2500})}else{setTimeout(()=>topdf.prepare(),1200)}
