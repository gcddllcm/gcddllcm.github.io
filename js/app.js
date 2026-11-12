import {APP_VERSION} from '../config.js?v=3.7.0';
import {$,msg,track,loadAnalytics} from './util.js?v=3.7.0';
import * as resizer from './resizer.js?v=3.7.0';
import * as creator from './creator.js?v=3.7.0';
import * as pagelock from './pagelock.js?v=3.7.0';
import * as topdf from './topdf.js?v=3.7.0';
import * as pdfToJpg from './pdf-to-jpg.js?v=3.7.0';
import * as pdfQrDetector from './pdf-qr-detector.js?v=3.7.0';
import * as jpgMaker from './jpg-maker.js?v=3.7.0';
import * as learncraft from './learncraft.js?v=3.7.0';
import * as golive from './golive.js?v=3.7.0';
import * as timestampMaker from './timestamp-maker.js?v=3.7.0';
import {isMobileOrTabletDevice,isPhoneDevice} from './device-support.js?v=3.7.0';
import {strings,t} from './i18n.js?v=3.7.0';
import {ASSETS} from './assets.js?v=3.7.0';
import './animated-select.js?v=3.7.0';
import './effects.js?v=3.7.0';
import {initTheme} from './theme.js?v=3.7.0';

document.querySelector('[data-page="tools"]').textContent=t('nav.tools');
document.querySelector('[data-page="updates"]').textContent=t('nav.updates');
document.querySelector('[data-page="about"]').textContent=t('nav.about');
document.querySelector('.tabs').setAttribute('aria-label',t('nav.main'));
initTheme();

const TOOLS=[
  ['creator',t('tool.creator.short'),t('tool.creator'),t('library.categoryNotebook'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 7h35l17 17v54H13V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M48 8v17h16" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="22" y="31" width="34" height="24" rx="3" stroke="currentColor" stroke-width="3.5"/><circle cx="46" cy="38" r="3.5" fill="var(--ic-teal)"/><path d="m25 51 9-9 7 7 5-5 7 7" stroke="var(--ic-teal)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M39 62v16m-7-7 7 7 7-7" stroke="var(--ic-teal)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.creator.desc'),creator],
  ['topdf',t('tool.topdf.short'),t('tool.topdf'),t('library.categoryNotebook'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 7h35l17 17v54H12V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M47 8v17h16M22 36h22M22 45h18M22 54h13" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="62" r="16" fill="var(--ic-chip)" stroke="var(--ic-coral)" stroke-width="4"/><path d="M48 70V54h6a5 5 0 0 1 0 10h-6" stroke="var(--ic-coral)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.topdf.desc'),topdf],
  ['pdf-to-jpg',t('tool.pdfToJpg.short'),t('tool.pdfToJpg'),t('library.categoryPdf'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 7h35l17 17v54H12V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M47 8v17h16M22 37h30M22 47h20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><rect x="29" y="53" width="34" height="23" rx="3" fill="var(--ic-chip)" stroke="var(--ic-teal)" stroke-width="3.5"/><circle cx="52" cy="60" r="3" fill="var(--ic-teal)"/><path d="m32 71 8-8 7 6 5-4 8 6" stroke="var(--ic-teal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.pdfToJpg.desc'),pdfToJpg],
  ['pdf-qr-detector',t('tool.pdfQrDetector.short'),t('tool.pdfQrDetector'),t('library.categoryPdf'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 11V6a2 2 0 0 1 2-2h5M21 4h5a2 2 0 0 1 2 2v5M28 21v5a2 2 0 0 1-2 2h-5M11 28H6a2 2 0 0 1-2-2v-5"/><rect x="10" y="10" width="4.5" height="4.5" rx=".8"/><rect x="17.5" y="10" width="4.5" height="4.5" rx=".8"/><rect x="10" y="17.5" width="4.5" height="4.5" rx=".8"/><path d="M18 18h4v4h-4z"/></svg>`,t('tool.pdfQrDetector.desc'),pdfQrDetector],
  ['jpg-maker',t('tool.jpgMaker.short'),t('tool.jpgMaker'),t('library.categoryNotebook'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 7h35l17 17v54H12V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M47 8v17h16" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><rect x="21" y="34" width="38" height="28" rx="4" stroke="currentColor" stroke-width="3.5"/><circle cx="49" cy="42" r="4" fill="var(--ic-teal)"/><path d="m24 57 10-10 8 8 6-6 8 8" stroke="var(--ic-teal)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M50 68h14" stroke="var(--ic-coral)" stroke-width="4" stroke-linecap="round"/></svg>`,t('tool.jpgMaker.desc'),jpgMaker],
  ['pagelock',t('tool.pagelock.short'),t('tool.pagelock'),t('library.categoryArchive'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 7h35l17 17v54H12V7Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M47 8v17h16M22 37h22M22 47h18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="39" y="52" width="25" height="20" rx="4" fill="var(--ic-chip)" stroke="var(--ic-teal)" stroke-width="3.5"/><path d="M45 52v-5a6.5 6.5 0 0 1 13 0v5" stroke="var(--ic-teal)" stroke-width="3.5" stroke-linecap="round"/><circle cx="51.5" cy="61" r="2.5" fill="var(--ic-teal)"/><path d="M51.5 63v3" stroke="var(--ic-teal)" stroke-width="2.5" stroke-linecap="round"/></svg>`,t('tool.pagelock.desc'),pagelock],
  ['resizer',t('tool.resizer.short'),t('tool.resizer'),t('library.categoryImages'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M28 10H12v16m40-16h16v16M12 54v16h16m40-16v16H52" stroke="var(--ic-teal)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="23" y="24" width="34" height="32" rx="3" stroke="currentColor" stroke-width="3.5"/><circle cx="47" cy="33" r="3.5" fill="var(--ic-teal)"/><path d="m27 51 9-10 7 7 5-5 6 8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.resizer.desc'),resizer],
  ['learncraft',t('tool.learncraft.short'),t('tool.learncraft'),t('library.categoryLearnCraft'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="17" width="62" height="50" rx="5" stroke="currentColor" stroke-width="4"/><path d="M9 29h62M19 17v-5h20v5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="40" r="3.5" fill="var(--ic-teal)"/><path d="M24 44v14h11M24 51h11" stroke="var(--ic-teal)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 51h20M42 58h14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>`,t('tool.learncraft.desc'),learncraft],
  ['golive',t('tool.golive.short'),t('tool.golive'),t('library.categoryLearnCraft'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="28" stroke="currentColor" stroke-width="4"/><path d="M33 27v26l22-13-22-13Z" fill="var(--ic-teal)" stroke="var(--ic-teal)" stroke-width="3" stroke-linejoin="round"/></svg>`,t('tool.golive.desc'),golive],
  ['timestamp-maker',t('tool.timestampMaker.short'),t('tool.timestampMaker'),t('library.categoryLearnCraft'),`<svg aria-hidden="true" focusable="false" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="11" y="13" width="58" height="54" rx="6" stroke="currentColor" stroke-width="4"/><path d="M11 29h58M27 29v38m27-38v38" stroke="currentColor" stroke-width="3.5"/><path d="m35 45 4 4 8-9" stroke="var(--ic-teal)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,t('tool.timestampMaker.desc'),timestampMaker],
];
const NEW_TOOL_KEYS=new Set(['pdf-qr-detector']);
let hasChosenTool=false;
const landing=$('landing-page');
landing.innerHTML=`<section class="landing-content"><div class="landing-intro"><h1 id="landing-title">${t('landing.title')}</h1><p>${t('landing.sub')}</p></div><div class="landing-tools"></div></section>`;
const landingTools=landing.querySelector('.landing-tools');
const landingCategories=[
  {label:t('library.categoryNotebook'),className:'notebook',keys:['creator','topdf','jpg-maker']},
  {label:t('library.categoryLearnCraft'),className:'learncraft',keys:['learncraft','golive','timestamp-maker']},
  {label:t('landing.categoryMoreTools'),className:'more',keys:['resizer','pdf-to-jpg','pdf-qr-detector']},
];
let landingCardIndex=0;
for(const category of landingCategories){
  const group=document.createElement('section');group.className=`landing-tool-group landing-tool-group-${category.className}`;
  const heading=document.createElement('h2');heading.className='landing-tool-group-title';heading.textContent=category.label;
  const cards=document.createElement('div');cards.className='landing-tool-list';
  group.append(heading,cards);
  for(const [key,shortLabel,label,toolCategory,icon,description] of category.keys.map(key=>TOOLS.find(item=>item[0]===key)).filter(Boolean)){
    const isNewTool=NEW_TOOL_KEYS.has(key);
    const showCategory=category.className==='more';
    const displayCategory=key==='pdf-to-jpg'||key==='pdf-qr-detector'?'I PHILO PDF':toolCategory;
    const cardWrap=document.createElement('div');cardWrap.className='landing-tool-wrap';
    const card=document.createElement('button');card.type='button';card.className=`landing-tool${isNewTool?' landing-tool-new-card':''}`;card.dataset.tool=key;card.setAttribute('aria-label',`${showCategory?`${displayCategory}. `:''}${shortLabel}. ${description}${isNewTool?`. ${t('landing.newAccessible')}`:''}`);
    const cardIndex=landingCardIndex++;
    card.style.setProperty('--landing-delay',`${40+cardIndex*40}ms`);
    const categoryLabel=displayCategory==='I PHILO PDF'?'<span class="release-brand-gradient">I PHILO PDF</span>':displayCategory;
    card.innerHTML=`<span class="landing-tool-icon${key==='pdf-qr-detector'?' landing-tool-icon-qr':''}" aria-hidden="true">${icon}</span><span class="landing-tool-copy">${showCategory?`<span class="landing-tool-category">${categoryLabel}</span>`:''}<strong>${shortLabel}</strong><span>${description}</span></span>${isNewTool?`<span class="landing-tool-new" aria-hidden="true">${t('landing.new')}</span>`:''}<span class="landing-tool-action"><span class="landing-tool-arrow" aria-hidden="true">→</span></span>`;
    card.onclick=()=>{hasChosenTool=true;selectTool(key);showPage('tools')};
    cardWrap.append(card);
    cards.append(cardWrap);
  }
  landingTools.append(group);
}
let edgeLightRestartTimer;
document.addEventListener('click',()=>{
  document.body.classList.add('new-edge-light-stopped');
  clearTimeout(edgeLightRestartTimer);
  edgeLightRestartTimer=setTimeout(()=>document.body.classList.remove('new-edge-light-stopped'),3000);
},{capture:true});
if(matchMedia('(hover: hover) and (pointer: fine)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  for(const card of landing.querySelectorAll('.landing-tool')){
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
const main=$('tools'),navList=$('tool-nav-list'),navActions=$('tool-nav-actions');
const phoneToolCurrent=$('phone-tool-current');
const searchDialog=$('tool-search-dialog'),searchInput=$('tool-search-input'),searchResults=$('tool-search-results');
searchInput.placeholder=t('toolPicker.searchPlaceholder');
$('tool-search-title').textContent=t('toolPicker.search');
const nextToolButton=document.createElement('button');nextToolButton.type='button';nextToolButton.className='tool-next-shortcut';
nextToolButton.setAttribute('aria-label',t('toolPicker.nextTool'));
nextToolButton.setAttribute('aria-keyshortcuts','Space');
nextToolButton.classList.add('page-shortcut-key');
nextToolButton.textContent='SPACE';
const searchButton=document.createElement('button');searchButton.type='button';searchButton.className='tool-search-open';
searchButton.setAttribute('aria-haspopup','dialog');searchButton.setAttribute('aria-label',t('toolPicker.searchLabel'));
searchButton.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><span>${t('toolPicker.search')}</span><kbd>Ctrl+K</kbd>`;
const guideButton=document.createElement('button');guideButton.type='button';guideButton.className='tool-guide-open';
guideButton.id='tool-guide-open';
guideButton.setAttribute('aria-keyshortcuts','G');
guideButton.title=t('guide.openShortcut');
guideButton.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.35 2.35 0 1 1 4.1 1.55c-1.1 1.08-1.8 1.35-1.8 2.7M12 16.8v.1"/></svg><span>${t('guide.title')}</span><kbd>G</kbd>`;
const howToButton=document.createElement('button');howToButton.type='button';howToButton.className='tool-how-to-use';
howToButton.setAttribute('aria-label',t('toolPicker.howToUse'));
howToButton.setAttribute('aria-keyshortcuts','Y');
howToButton.innerHTML=`<svg viewBox="0 0 24 18" aria-hidden="true"><rect x="1" y="1" width="22" height="16" rx="5" fill="#ff0033"/><path d="m10 5 6 4-6 4z" fill="#fff"/></svg><span>${t('toolPicker.howToUse')}</span><kbd>Y</kbd>`;
const installExtensionButton=document.createElement('button');installExtensionButton.type='button';installExtensionButton.className='tool-how-to-use tool-extension-action';
installExtensionButton.setAttribute('aria-label',t('toolPicker.installExtension'));
installExtensionButton.setAttribute('aria-keyshortcuts','Y');
installExtensionButton.innerHTML=`<svg viewBox="0 0 24 18" aria-hidden="true"><rect x="1" y="1" width="22" height="16" rx="5" fill="#ff0033"/><path d="m10 5 6 4-6 4z" fill="#fff"/></svg><span>${t('toolPicker.installExtension')}</span><kbd>Y</kbd>`;
const updateExtensionButton=document.createElement('button');updateExtensionButton.type='button';updateExtensionButton.className='tool-how-to-use tool-extension-action';
updateExtensionButton.setAttribute('aria-label',t('toolPicker.updateExtension'));
updateExtensionButton.setAttribute('aria-keyshortcuts','Y');
updateExtensionButton.innerHTML=`<svg viewBox="0 0 24 18" aria-hidden="true"><rect x="1" y="1" width="22" height="16" rx="5" fill="#ff0033"/><path d="m10 5 6 4-6 4z" fill="#fff"/></svg><span>${t('toolPicker.updateExtension')}</span><kbd>Y</kbd>`;
navActions.append(searchButton,guideButton,howToButton,installExtensionButton,updateExtensionButton);
const attentionItems=[
  {button:howToButton,dismissed:new Set(),visible:()=>views[TOOLS[activeIndex]?.[0]]?.dataset.extensionUpToDate==='true'},
  {button:installExtensionButton,dismissed:new Set(),visible:()=>views[TOOLS[activeIndex]?.[0]]?.dataset.extensionState==='missing'},
  {button:updateExtensionButton,dismissed:new Set(),visible:()=>views[TOOLS[activeIndex]?.[0]]?.dataset.extensionState==='outdated'},
];
function resetAttention(item){
  clearTimeout(item.timer);
  item.button.classList.remove('is-idle');
  const tool=TOOLS[activeIndex]?.[0];
  if(item.dismissed.has(tool)||item.button.hidden)return;
  item.timer=setTimeout(()=>{if(!item.dismissed.has(tool)&&TOOLS[activeIndex]?.[0]===tool&&!item.button.hidden)item.button.classList.add('is-idle')},3000);
}
function dismissAttention(item,tool=TOOLS[activeIndex]?.[0]){
  item.dismissed.add(tool);clearTimeout(item.timer);item.button.classList.remove('is-idle');
}
howToButton.addEventListener('click',()=>{
  dismissAttention(attentionItems[0]);
  const activeTool=TOOLS[activeIndex]?.[0];
  const howToUrl=activeTool==='learncraft'?'https://youtu.be/JMnQttGXSgA':activeTool==='golive'?'https://youtu.be/wO8VaQBCo4U':activeTool==='timestamp-maker'?'https://youtu.be/6dOhwv1GJ8c':null;
  if(howToUrl)window.open(howToUrl,'_blank','noopener,noreferrer');
});
installExtensionButton.addEventListener('click',()=>{
  dismissAttention(attentionItems[1]);
  window.open('https://youtu.be/gf6kIhidBVo','_blank','noopener,noreferrer');
});
updateExtensionButton.addEventListener('click',()=>{
  dismissAttention(attentionItems[2]);
  window.open('https://youtu.be/8F8IkAqI7QM','_blank','noopener,noreferrer');
});
document.addEventListener('click',()=>{
  for(const item of attentionItems)if(item.button.classList.contains('is-idle'))dismissAttention(item);
},true);
const noteHowToPointerActivity=()=>{for(const item of attentionItems)if(!item.button.classList.contains('is-idle'))resetAttention(item)};
document.addEventListener('pointerdown',noteHowToPointerActivity,{passive:true,capture:true});
document.addEventListener('touchstart',noteHowToPointerActivity,{passive:true,capture:true});
for(const type of ['keydown','wheel','scroll']){
  document.addEventListener(type,()=>{for(const item of attentionItems)if(!item.dismissed.has(TOOLS[activeIndex]?.[0])&&!item.button.hidden)resetAttention(item)},{passive:true,capture:true});
}
const scrollbarTimers=new WeakMap();
document.addEventListener('scroll',event=>{
  const scroller=event.target===document?document.scrollingElement:event.target;
  if(!(scroller instanceof HTMLElement))return;
  scroller.classList.add('scrollbar-active');
  clearTimeout(scrollbarTimers.get(scroller));
  scrollbarTimers.set(scroller,setTimeout(()=>{
    scroller.classList.remove('scrollbar-active');
    scrollbarTimers.delete(scroller);
  },750));
},{passive:true,capture:true});
const views={};
const isMobileOrTablet=isMobileOrTabletDevice(navigator);
const isPhone=isPhoneDevice(navigator);
if(isPhone){$('tools-page').classList.add('phone-tool-device');$('tool-picker-row').inert=true;}
const desktopOnlyTools=new Set(['learncraft','golive','timestamp-maker']);
for(const [key,shortLabel,label,category,icon,description,mod] of TOOLS){
  const v=document.createElement('section');v.className='view';v.dataset.tool=key;main.append(v);views[key]=v;
  v.addEventListener('extensionstatechange',updateNavSelection);
  if(isMobileOrTablet&&desktopOnlyTools.has(key)){
    v.innerHTML=`<section class="device-notice" aria-labelledby="device-notice-title"><img class="device-notice-mascot" src="${ASSETS.deviceNoticeMascot}" alt=""><div class="device-notice-copy"><p class="device-notice-eyebrow">${t('device.desktopOnlyEyebrow')}</p><h1 id="device-notice-title">${t('device.desktopOnlyTitle')}</h1><p>${t('device.desktopOnlyDescription')}</p><p class="device-notice-note">${t('device.desktopOnlyOtherTools')}</p><button class="device-notice-back" type="button">${t('device.desktopOnlyBack')}</button></div></section>`;
    v.querySelector('.device-notice-back').onclick=()=>{hasChosenTool=false;showPage('tools')};
  }else if(mod) mod.mount(v); else v.innerHTML=`<div class="center"><h2>${label}</h2><div class="sub">${t('app.transition')}</div></div>`;
}
let activeIndex=-1;
nextToolButton.onclick=selectNextTool;
const categories=[
  {label:t('library.categoryNotebook'),tools:TOOLS.filter(item=>item[3]===t('library.categoryNotebook'))},
  {label:t('library.categoryLearnCraft'),tools:TOOLS.filter(item=>item[3]===t('library.categoryLearnCraft'))},
  {label:t('library.categoryImages'),tools:TOOLS.filter(item=>item[3]===t('library.categoryImages'))},
  {label:t('library.categoryPdf'),tools:TOOLS.filter(item=>item[3]===t('library.categoryPdf'))},
  {label:t('library.categoryArchive'),tools:TOOLS.filter(item=>item[3]===t('library.categoryArchive')),collapsed:true},
];
function setPhoneToolPickerOpen(open,{restoreFocus=false}={}){
  if(!isPhone)return;
  const nav=$('tool-nav'),pickerRow=$('tool-picker-row'),wasOpen=phoneToolCurrent.getAttribute('aria-expanded')==='true';
  if(open===wasOpen){if(restoreFocus)phoneToolCurrent.focus({preventScroll:true});return}
  clearTimeout(phonePickerCloseTimer);
  nav.classList.remove('phone-tool-picker-closing');
  nav.classList.toggle('phone-tool-picker-expanded',open);
  pickerRow.inert=!open;
  phoneToolCurrent.setAttribute('aria-expanded',String(open));
  if(open){
    navList.querySelectorAll('.tool-nav-item').forEach((item,index)=>item.style.setProperty('--option-delay',`${Math.min(index*14,210)}ms`));
  }else if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    nav.classList.add('phone-tool-picker-closing');
    phonePickerCloseTimer=setTimeout(()=>nav.classList.remove('phone-tool-picker-closing'),200);
  }
  if(restoreFocus)phoneToolCurrent.focus({preventScroll:true});
}
let phonePickerCloseTimer=0;
phoneToolCurrent.addEventListener('click',()=>setPhoneToolPickerOpen(phoneToolCurrent.getAttribute('aria-expanded')!=='true'));
document.addEventListener('keydown',event=>{
  if(isPhone&&event.key==='Escape'&&phoneToolCurrent.getAttribute('aria-expanded')==='true'){
    event.preventDefault();setPhoneToolPickerOpen(false,{restoreFocus:true});
  }
});
document.addEventListener('pointerdown',event=>{
  if(isPhone&&phoneToolCurrent.getAttribute('aria-expanded')==='true'&&!$('tool-nav').contains(event.target))setPhoneToolPickerOpen(false);
},{capture:true});
function updateNavSelection(){
  const active=TOOLS[activeIndex]?.[0];
  for(const button of navList.querySelectorAll('.tool-nav-item')){
    const selected=button.dataset.tool===active;button.classList.toggle('active',selected);
    if(selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  }
  const currentToolButton=navList.querySelector('.tool-nav-item.active');
  phoneToolCurrent.querySelector('.phone-tool-current-icon').innerHTML=currentToolButton?.querySelector('.tool-nav-icon')?.innerHTML||'';
  phoneToolCurrent.querySelector('.phone-tool-current-name').textContent=TOOLS[activeIndex]?.[1]||t('toolPicker.search');
  guideButton.disabled=!views[active]?.querySelector('.tool-guide');
  for(const item of attentionItems){
    item.button.hidden=!['learncraft','golive','timestamp-maker'].includes(active)||!item.visible();
    if(item.button.hidden){clearTimeout(item.timer);item.button.classList.remove('is-idle')}
    else resetAttention(item);
  }
}
function toolButton(item,{searchResult=false}={}){
  const [key,shortLabel,, ,icon,description]=item;
  const button=document.createElement('button');button.type='button';button.className='tool-nav-item';button.dataset.tool=key;
  if(searchResult)button.setAttribute('role','option');
  button.setAttribute('aria-label',`${shortLabel}. ${description}`);
  const isNewTool=NEW_TOOL_KEYS.has(key);
  if(isNewTool)button.setAttribute('aria-label',`${shortLabel}. ${description}. ${t('landing.newAccessible')}`);
  button.innerHTML=`<span class="tool-nav-icon" aria-hidden="true">${icon}</span><span class="tool-nav-copy"><span class="tool-nav-title-row"><span class="tool-nav-name">${shortLabel}</span>${isNewTool?`<span class="tool-nav-new" aria-hidden="true">${t('landing.new')}</span>`:''}</span><span class="tool-nav-desc">${description}</span></span>`;
  button.onclick=()=>{hasChosenTool=true;selectTool(key);showPage('tools');if(isPhone)setPhoneToolPickerOpen(false,{restoreFocus:true})};return button;
}
for(const [index,category] of categories.entries()){
  const group=document.createElement('section');group.className='tool-nav-group';
  if(category.collapsed&&!isPhone)group.classList.add('collapsed');
  const headingRow=document.createElement('div');headingRow.className='tool-nav-category-row';
  const heading=document.createElement('button');heading.type='button';heading.className='tool-nav-category';heading.id=`tool-nav-group-${index}`;heading.textContent=category.label;heading.setAttribute('aria-expanded',String(!category.collapsed||isPhone));heading.addEventListener('click',()=>{
    const collapsed=group.classList.toggle('collapsed');
    heading.setAttribute('aria-expanded',String(!collapsed));
    body.inert=collapsed;
  });
  headingRow.append(heading);
  if(index===0)headingRow.append(nextToolButton);
  group.setAttribute('aria-labelledby',heading.id);
  group.append(headingRow);
  const body=document.createElement('div');body.className='tool-nav-group-body';body.inert=Boolean(category.collapsed&&!isPhone);
  const items=document.createElement('div');items.className='tool-nav-group-items';
  for(const item of category.tools)items.append(toolButton(item));
  body.append(items);
  group.append(body);
  navList.append(group);
}
function selectNextTool(){
  const order=[...navList.querySelectorAll('.tool-nav-item')].map(button=>button.dataset.tool);
  if(!order.length)return;
  const current=TOOLS[activeIndex]?.[0],index=order.indexOf(current);
  selectTool(order[(index+1+order.length)%order.length]);
}
function closeToolSearch(){if(searchDialog.open)searchDialog.close();searchInput.value='';searchResults.replaceChildren()}
let searchReturnFocus=null;
function openToolSearch(){
  searchReturnFocus=document.activeElement;
  renderSearchResults('');if(!searchDialog.open)searchDialog.showModal();searchInput.focus();searchInput.select();
}
function renderSearchResults(query){
  const normalized=query.trim().toLocaleLowerCase();searchResults.replaceChildren();let count=0;
  for(const category of categories){
    const matches=category.tools.filter(([key,shortLabel,label,group,,description])=>!normalized||`${key} ${shortLabel} ${label} ${group} ${description}`.toLocaleLowerCase().includes(normalized));
    if(!matches.length)continue;
    const section=document.createElement('section');section.className='tool-search-group';
    const heading=document.createElement('h3');heading.textContent=category.label;section.append(heading);
    for(const item of matches){const option=toolButton(item,{searchResult:true});option.classList.add('tool-search-option');section.append(option);count++}
    searchResults.append(section);
  }
  if(!count){const empty=document.createElement('p');empty.className='tool-search-empty';empty.textContent=t('toolPicker.noResults');searchResults.append(empty)}
}
searchButton.onclick=openToolSearch;searchInput.addEventListener('input',()=>renderSearchResults(searchInput.value));
searchDialog.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target===searchInput){const first=searchResults.querySelector('.tool-search-option');if(first){event.preventDefault();first.click()}return}
  if(!['ArrowDown','ArrowUp'].includes(event.key))return;
  const options=[...searchResults.querySelectorAll('.tool-search-option')];if(!options.length)return;
  event.preventDefault();const index=options.indexOf(document.activeElement);
  if(event.key==='ArrowDown')options[index<0?0:(index+1)%options.length].focus();
  else if(index<=0)searchInput.focus();else options[index-1].focus();
});
searchDialog.querySelector('.tool-search-close').onclick=()=>searchDialog.close();
searchDialog.addEventListener('click',event=>{if(event.target===searchDialog)searchDialog.close()});
searchDialog.addEventListener('close',()=>{
  searchInput.value='';searchResults.replaceChildren();
  const focusTarget=searchReturnFocus?.isConnected&&searchReturnFocus.getClientRects().length?searchReturnFocus:document.getElementById('tools-page').classList.contains('on')?searchButton:null;
  searchReturnFocus=null;focusTarget?.focus();
});
guideButton.onclick=()=>{
  main.querySelector('.view.on .tool-guide')?.openGuide?.();
  if(isPhone)setPhoneToolPickerOpen(false);
};
searchResults.addEventListener('keydown',event=>{if(event.key==='Enter'){const first=searchResults.querySelector('.tool-search-option');if(first){event.preventDefault();first.click()}}});
let toolTransition=0;
function selectTool(key,{log=true}={}){
  const next=views[key],current=main.querySelector('.view.on'),index=TOOLS.findIndex(item=>item[0]===key);
  if(!next||index<0)return;
  closeToolSearch();
  for(const view of main.querySelectorAll('.view'))view.querySelector('.tool-guide')?.closeGuide?.();
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
  if(key==='learncraft'&&!isMobileOrTablet)learncraft.activate();
  if(key==='golive'&&!isMobileOrTablet)golive.activate();
  if(key==='timestamp-maker'&&!isMobileOrTablet)timestampMaker.activate();
}
selectTool('creator',{log:false});
document.querySelector('.brand').addEventListener('click',event=>{
  event.preventDefault();
  hasChosenTool=false;
  showPage('tools');
});
document.addEventListener('keydown',e=>{
  if(e.key==='Tab')document.body.classList.add('keyboard-tab-nav');
},true);
document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-tab-nav'),true);
const isEditingCreatorTitle=target=>target instanceof Element&&target.matches('.lrow-title');
document.addEventListener('keydown',e=>{
  if(isEditingCreatorTitle(e.target)||e.target instanceof Element&&e.target.matches('input,textarea,[contenteditable="true"]'))return;
  if((e.code!=='KeyG'&&e.key?.toLowerCase()!=='g')||e.repeat||e.altKey||e.ctrlKey||e.metaKey||!$('tools-page').classList.contains('on'))return;
  const guide=main.querySelector('.view.on .tool-guide');
  if(!guide?.openGuide)return;
  e.preventDefault();
  e.stopPropagation();
  if(guide.parentElement.classList.contains('guide-open'))guide.closeGuide(true);
  else{guide.openGuide();if(isPhone)setPhoneToolPickerOpen(false)}
},true);
document.addEventListener('keydown',event=>{
  if(isEditingCreatorTitle(event.target))return;
  if((event.code!=='KeyY'&&event.key?.toLowerCase()!=='y')||event.repeat||event.altKey||event.ctrlKey||event.metaKey||!$('tools-page').classList.contains('on')||searchDialog.open||main.querySelector('.view.on .tool-layout.guide-open'))return;
  const target=event.target,typing=target instanceof Element&&target.matches('input,textarea,select,[contenteditable="true"]');
  if(typing)return;
  const activeButton=attentionItems.find(item=>!item.button.hidden)?.button;
  if(!activeButton)return;
  event.preventDefault();activeButton.click();
},true);
document.addEventListener('keydown',e=>{
  if(isEditingCreatorTitle(e.target))return;
  if(document.querySelector('dialog[open]'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
    e.preventDefault();openToolSearch();return;
  }
  const target=e.target,typing=target instanceof Element&&target.matches('input,textarea,select,[contenteditable="true"]');
  const shortcut=e.code==='KeyI'||e.key?.toLowerCase()==='i'?'i':null;
  if(typing||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.code==='Space'&&!e.repeat&&$('tools-page').classList.contains('on')){e.preventDefault();hasChosenTool=true;selectNextTool();showPage('tools');return}
  if(shortcut==='i'){
    const guide=main.querySelector('.view.on .tool-guide');
    if(guide?.toggleDetails){e.preventDefault();guide.openGuide?.();guide.toggleDetails();if(isPhone)setPhoneToolPickerOpen(false)}
  }
});

const pageTabs=[...document.querySelectorAll('.tab')],tabIndicator=document.querySelector('.tab-indicator');
let pageTransition=0,releaseRevealObserver;
function resetReleaseReveal(){
  if(!releaseRevealObserver)return;
  releaseRevealObserver.disconnect();
  for(const release of timeline.querySelectorAll('.release')){
    release.classList.remove('revealed');
    release.classList.add('reveal-pending');
    releaseRevealObserver.observe(release);
  }
}
function syncTabIndicator(){const active=pageTabs.find(b=>b.classList.contains('active'));if(!active||!tabIndicator)return;tabIndicator.style.width=`${active.offsetWidth}px`;tabIndicator.style.transform=`translateX(${active.offsetLeft}px)`}
function showPage(name){
  const pageName=name==='tools'&&!hasChosenTool?'landing':name;
  if(pageName!=='tools'){
    for(const view of main.querySelectorAll('.view'))view.querySelector('.tool-guide')?.closeGuide?.();
    if(searchDialog.open)searchDialog.close();
  }
  const next=document.getElementById(`${pageName}-page`),current=document.querySelector('.page.on');
  if(!next)return;
  pageTabs.forEach(b=>{const current=b.dataset.page===name;b.classList.toggle('active',current);if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});requestAnimationFrame(syncTabIndicator);
  if(name==='updates')resetReleaseReveal();
  if(current===next){current.classList.remove('leaving');if(name==='updates')requestAnimationFrame(fitTimeline);return}
  if(name==='about')animateProjectCounts();
  const token=++pageTransition;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!current){if(current)current.classList.remove('on','leaving','entering');next.classList.add('on');next.classList.remove('leaving','entering');if(name==='updates')requestAnimationFrame(fitTimeline);return}
  current.classList.remove('entering');current.classList.add('leaving');
  setTimeout(()=>{if(token!==pageTransition)return;current.classList.remove('on','leaving');next.classList.add('on','entering');if(name==='updates')requestAnimationFrame(fitTimeline);setTimeout(()=>{if(token===pageTransition)next.classList.remove('entering')},260)},145);
}
pageTabs.forEach(b=>b.onclick=()=>showPage(b.dataset.page));
requestAnimationFrame(syncTabIndicator);addEventListener('resize',syncTabIndicator);
const updates=$('updates-page');
const reduceReleaseMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
updates.innerHTML=`<div class="page-heading"><img class="page-icon" src="${ASSETS.brandLogo}" alt=""><div><h1>${t('updates.title')}</h1><div class="sub">${t('updates.sub')}</div></div></div><div class="timeline">${strings.RELEASES.map((r,i)=>`<article class="release${reduceReleaseMotion?'':' reveal-pending'}" style="--reveal-delay:${Math.min(i,5)*70}ms"><div class="release-date">${r.date}</div><div class="timeline-dot ${i===0?'latest':''}"></div><div class="release-card"><h2>${r.version}${i===0?`<span class="latest-pill">${t('updates.latest')}</span>`:''}</h2>${r.transition?`<div class="platform-transition" aria-label="${t('updates.transition')}"><div class="platform-node"><svg class="platform-icon exe-window" viewBox="0 0 40 36" aria-hidden="true" focusable="false"><rect x="4" y="3" width="32" height="22" rx="2"/><path d="M14 32h12M20 25v7"/></svg><strong>${t('updates.desktop')}</strong><small>.EXE</small></div><span class="transition-arrow" aria-hidden="true">→</span><div class="platform-node"><svg class="platform-icon web-window" viewBox="0 0 40 36" aria-hidden="true" focusable="false"><rect x="4" y="3" width="32" height="28" rx="2"/><path d="M4 10h32M9 6.5h.1M13 6.5h.1M17 6.5h.1"/></svg><strong>${t('updates.web')}</strong><small>${t('updates.browser')}</small></div></div>`:''}${r.sections.map(s=>s.paragraphs?`<div class="release-story">${s.paragraphs.map(p=>`<p>${p}</p>`).join('')}</div>`:`<div class="release-section"><h3>${s.title}</h3><ul>${s.items.map(x=>`<li>${x}</li>`).join('')}</ul>`).join('')}</div></article>`).join('')}<div class="timeline-line" aria-hidden="true"></div></div>`;
function loadReleaseLinkPreview(link){
  if(link.dataset.previewRequested)return;
  const image=link.querySelector('.release-link-preview-image');
  if(!image)return;
  link.dataset.previewRequested='true';
  image.addEventListener('load',()=>link.classList.add('preview-loaded'),{once:true});
  const params=new URLSearchParams({
    url:link.dataset.previewUrl,
    screenshot:'true',
    meta:'false',
    embed:'screenshot.url',
    colorScheme:'dark',
    'viewport.isMobile':'true',
    'viewport.deviceScaleFactor':'1',
    'viewport.width':'600',
    'viewport.height':'375'
  });
  image.src=`https://api.microlink.io/?${params}`;
}
function releasePreviewLink(target){return target instanceof Element?target.closest('.release-link-preview'):null}
for(const container of [updates,landingTools]){
  container.addEventListener('pointerover',event=>{const link=releasePreviewLink(event.target);if(link)loadReleaseLinkPreview(link)});
  container.addEventListener('focusin',event=>{const link=releasePreviewLink(event.target);if(link)loadReleaseLinkPreview(link)});
  container.addEventListener('pointermove',event=>{
    const link=releasePreviewLink(event.target);
    if(!link)return;
    const rect=link.getBoundingClientRect();
    const shift=Math.max(-28,Math.min(28,(event.clientX-rect.left-rect.width/2)/2));
    link.style.setProperty('--release-preview-shift',`${shift}px`);
  });
}
const timeline=updates.querySelector('.timeline'),timelineLine=timeline.querySelector('.timeline-line');
function fitTimeline(){const dots=[...timeline.querySelectorAll('.timeline-dot')];if(dots.length<2)return;const parent=timeline.getBoundingClientRect(),first=dots[0].getBoundingClientRect(),last=dots[dots.length-1].getBoundingClientRect();timelineLine.style.top=`${first.top+first.height/2-parent.top}px`;timelineLine.style.height=`${last.top-first.top-first.height/2}px`}
requestAnimationFrame(fitTimeline);addEventListener('resize',fitTimeline);new ResizeObserver(fitTimeline).observe(timeline);
if(!reduceReleaseMotion){releaseRevealObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('revealed');entry.target.classList.remove('reveal-pending');releaseRevealObserver.unobserve(entry.target)}}},{root:document.getElementById('main'),rootMargin:'0px 0px -8% 0px',threshold:.08});timeline.querySelectorAll('.release.reveal-pending').forEach(el=>releaseRevealObserver.observe(el))}
const about=$('about-page');
const PROJECT_CHARACTER_COUNT=4540065;
const PROJECT_LINE_COUNT=28308,PROJECT_FILE_COUNT=93;
about.innerHTML=`<div class="page-heading"><img class="page-icon" src="${ASSETS.aboutMascot}" alt=""><div><h1>${t('about.title')}</h1><div class="sub">Penguin Logistics</div></div></div><div class="about-container"><article class="about-lines" aria-label="${t('about.snapshotLabel')}"><div class="about-stat about-stat-characters"><span class="about-lines-label">${t('about.charactersLabel')}</span><strong class="about-characters-value">${PROJECT_CHARACTER_COUNT.toLocaleString()}</strong><span class="about-lines-note">${t('about.charactersNote')}</span></div><div class="about-stat about-stat-lines"><span class="about-lines-label">${t('about.linesLabel')}</span><strong class="about-lines-value">${PROJECT_LINE_COUNT.toLocaleString()}</strong><span class="about-lines-note">${t('about.linesNote')}</span></div><div class="about-stat about-stat-files"><span class="about-lines-label">${t('about.filesLabel')}</span><strong class="about-files-value">${PROJECT_FILE_COUNT.toLocaleString()}</strong><span class="about-lines-note">${t('about.filesNote')}</span></div></article><div class="about-details"><a class="about-detail about-detail-contact" data-tone="violet" href="https://www.larksuite.com/invitation/page/add_contact/?token=e39p7e0c-09b3-49b3-b59f-e9e497v47fle" target="_blank" rel="noopener noreferrer"><span class="about-detail-badge" aria-hidden="true"><svg class="about-detail-icon" viewBox="0 0 24 24" focusable="false"><path class="duo" d="M5 4.5h14a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2h-6.6l-4.4 3.6v-3.6H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"/><circle class="dot" cx="8.2" cy="10.6" r="1.1"/><circle class="dot" cx="12" cy="10.6" r="1.1"/><circle class="dot" cx="15.8" cy="10.6" r="1.1"/></svg></span><span class="about-detail-text">${t('about.contact')}</span><svg class="about-detail-go" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 17 17 7M9 7h8v8"/></svg></a><p class="about-detail about-detail-creator" data-tone="violet"><span class="about-detail-badge" aria-hidden="true"><svg class="about-detail-icon" viewBox="0 0 24 24" focusable="false"><path d="m4 20 9.6-9.6"/><path class="duo" d="M17 2.8l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2Z"/><path d="M5.5 4.6v2.8M4.1 6h2.8M18.6 15.6v2.8M17.2 17h2.8"/></svg></span><span class="about-detail-text">${t('about.creator')} Champ (AT Math) + Claude, Codex, Zhipu, Antigravity, Copilot, and Cursor (all of them are free btw)</span></p><p class="about-detail about-detail-version" data-tone="violet"><span class="about-detail-badge" aria-hidden="true"><svg class="about-detail-icon" viewBox="0 0 24 24" focusable="false"><path class="duo" d="M3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8l-7 7a2 2 0 0 1-2.8 0l-7.4-7.4a2 2 0 0 1-.6-1.4Z"/><circle class="dot" cx="7.6" cy="7.6" r="1.4"/></svg></span><span class="about-detail-text">${t('about.version')} <strong>${APP_VERSION}</strong></span></p><p class="about-detail about-detail-privacy" data-tone="violet"><span class="about-detail-badge" aria-hidden="true"><svg class="about-detail-icon" viewBox="0 0 24 24" focusable="false"><path class="duo" d="M12 2.8 19.5 5.8v5.6c0 4.6-3 8.1-7.5 9.8-4.5-1.7-7.5-5.2-7.5-9.8V5.8Z"/><path d="m8.7 12.1 2.3 2.3 4.4-4.8"/></svg></span><span class="about-detail-text">${t('about.privacy')}</span></p></div></div>`;
const aboutIcons=[
  ['.about-detail-contact','<path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/><circle cx="8" cy="11" r=".7"/><circle cx="12" cy="11" r=".7"/><circle cx="16" cy="11" r=".7"/>'],
  ['.about-detail-creator','<path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z"/>'],
  ['.about-detail-version','<path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12h5M10 16h5"/>'],
  ['.about-detail-privacy','<path d="m12 3 7 3v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>']
];
for(const [selector,paths] of aboutIcons)about.querySelector(`${selector} .about-detail-icon`).innerHTML=paths;
let characterCountAnimation=0,lineCountAnimation=0,fileCountAnimation=0;
function animateProjectCharacterCount(){
  const value=about.querySelector('.about-characters-value');
  if(!value)return;
  cancelAnimationFrame(characterCountAnimation);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){value.textContent=PROJECT_CHARACTER_COUNT.toLocaleString();return}
  const started=performance.now(),duration=1900;
  function tick(now){
    const progress=Math.min((now-started)/duration,1);
    const eased=progress===1?1:2**(-10*progress)*Math.sin((progress*10-.75)*(2*Math.PI/3))+1;
    value.textContent=Math.round(PROJECT_CHARACTER_COUNT*eased).toLocaleString();
    if(progress<1)characterCountAnimation=requestAnimationFrame(tick);
  }
  value.textContent='0';
  characterCountAnimation=requestAnimationFrame(tick);
}
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
const animateProjectCounts=()=>{animateProjectCharacterCount();animateProjectLineCount();animateProjectFileCount()};

const scrollHint=document.getElementById('scroll-hint');
let scrollHintFrame=0;
function updateScrollHint(){
  scrollHintFrame=0;
  const elements=[document.scrollingElement,...document.querySelectorAll('#main,.page.on,.view.on,.tool-nav,.tool-nav-list,.tool-layout>.tool,.tool-guide')];
  let best=null,bestArea=0;
  for(const element of elements){
    if(!(element instanceof HTMLElement)||element.clientHeight<80||element.scrollHeight-element.clientHeight<24)continue;
    const bounds=element.getBoundingClientRect();
    if(bounds.bottom<=0||bounds.top>=innerHeight||bounds.right<=0||bounds.left>=innerWidth)continue;
    const style=getComputedStyle(element);
    if(element!==document.scrollingElement&&!['auto','scroll'].includes(style.overflowY))continue;
    const area=Math.min(bounds.width,innerWidth)*Math.min(bounds.height,innerHeight);
    if(area>=bestArea){best=element;bestArea=area}
  }
  if(!best||best.scrollTop>6){scrollHint.classList.remove('visible');return}
  const bounds=best.getBoundingClientRect();
  const left=Math.max(100,Math.min(innerWidth-100,bounds.left+bounds.width/2));
  const top=Math.max(12,Math.min(innerHeight-48,bounds.bottom-48));
  scrollHint.style.left=`${left}px`;
  scrollHint.style.top=`${top}px`;
  scrollHint.classList.add('visible');
}
function scheduleScrollHint(){
  if(!scrollHintFrame)scrollHintFrame=requestAnimationFrame(updateScrollHint);
}
document.addEventListener('scroll',scheduleScrollHint,{passive:true,capture:true});
addEventListener('resize',scheduleScrollHint,{passive:true});
new MutationObserver(scheduleScrollHint).observe(document.getElementById('main'),{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open']});
scheduleScrollHint();

loadAnalytics(); track('app/start','App start');
if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(()=>topdf.prepare(),{timeout:2500})}else{setTimeout(()=>topdf.prepare(),1200)}
