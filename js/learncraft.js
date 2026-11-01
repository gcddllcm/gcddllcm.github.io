// LearnCraft : Master Canvas extractor.
// A web page cannot read other browser tabs, so a small companion extension (extension/) does the reading and this
// tool talks to it through window.postMessage (extension/bridge.js). Course data stays in this browser tab.
import {msg,track} from './util.js?v=3.3.0';
import {mountGuide} from './instruction-panel.js?v=3.3.0';
import {download} from './nbtool.js?v=3.3.0';
import {t} from './i18n.js?v=3.3.0';
import {initMascot} from './mascot.js?v=3.3.0';
import {copyInternalPage,installStepsHtml} from './install-help.js?v=3.3.0';
import {zipSync} from './vendor/fflate.js?v=3.3.0';
import {older,summarizeBridges,staleDownload,freshUrl,FRESH} from './extcore.js?v=3.3.0';
import {countTree,checkTimes,findGaps,tableTsv,tableCsv,tableRows,summaryTsv,fmtTime,normTime,toSeconds,sumAssetTimes} from './lccore.js?v=3.3.0';
import {fmtElapsed} from './glcore.js?v=3.3.0';

const EXT_MIN='1.0.0';
// Every file the extension needs, read from its own manifest, so adding a file to the extension never needs a change here.
function extensionFiles(manifest){
  const files=new Set(['manifest.json','README.txt']);
  const add=f=>{if(typeof f==='string'&&/^[\w./-]+$/.test(f)&&!f.includes('..'))files.add(f.replace(/^\.?\//,''))};
  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  if(manifest.action?.default_popup){add('popup.js');add('popup.css');add('assets/loy-krathong-2026.png');}
  (manifest.content_scripts||[]).forEach(c=>[...(c.js||[]),...(c.css||[])].forEach(add));
  Object.values(manifest.icons||{}).forEach(add);
  return[...files];
}
const FORCE_RESET_PARAM='__pl_lc_force_reset';
if(new URL(location.href).searchParams.has(FORCE_RESET_PARAM)){
  const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete(FORCE_RESET_PARAM);
  history.replaceState(history.state,'',cleanUrl);
}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const target=location.origin==='null'?'*':location.origin;
let api=null;   // set by mount(): {activate}

// ---- talking to the extension ----
let seq=0;const waiting=new Map();let onReady=()=>{};
addEventListener('message',e=>{
  if(e.source!==window)return;
  const m=e.data;if(!m)return;
  if(m.pl==='learncraft-ready'){onReady();return}
  if(m.pl==='learncraft-progress'&&waiting.has(m.id)){
    const progress=waiting.get(m.id).onProgress;
    if(progress)progress(m.progress);
    return;
  }
  if(m.pl==='learncraft-reply'&&waiting.has(m.id)){
    const w=waiting.get(m.id);
    if(w.collect){if(m.ok)w.collect.push(m.data);return}   // a ping: every installed copy of the extension answers, keep them all
    waiting.delete(m.id);clearTimeout(w.timer);
    m.ok?w.res(m.data):w.rej(new Error(m.error||'Unknown error'));
  }
});
function ask(action,extra={},timeout=10000,onProgress=null){
  return new Promise((res,rej)=>{
    const id='lc'+(++seq)+'-'+Date.now();
    const timer=setTimeout(()=>{waiting.delete(id);rej(new Error('timeout'));
      // tell the extension to stop the script that is still running in the course tab
      if(action==='extract')window.postMessage({pl:'learncraft',id:id+'-cancel',action:'cancel',target:id},target);
    },timeout);
    waiting.set(id,{res,rej,timer,onProgress});
    window.postMessage({pl:'learncraft',id,action,...extra},target);
  });
}

// Asks every installed copy of the extension who it is. Normally one answers; after a careless update there can be two.
function pingAll(wait=450){
  return new Promise(res=>{
    const id='lc'+(++seq)+'-'+Date.now(),replies=[];
    const timer=setTimeout(()=>{waiting.delete(id);res(replies)},wait);
    waiting.set(id,{collect:replies,timer,onProgress:null});
    window.postMessage({pl:'learncraft',id,action:'ping'},target);
  });
}

// Full key names (not built from pieces) so the i18n test can see every key that is used.
const STATE_KEY={ready:'learncraft.state.ready',loading:'learncraft.state.loading',asleep:'learncraft.state.asleep',notOverview:'learncraft.state.notOverview',login:'learncraft.state.login',other:'learncraft.state.other',noAccess:'learncraft.state.noAccess'};
const LV_KEY={part:'learncraft.lv.part',section:'learncraft.lv.section',mission:'learncraft.lv.mission',subsection:'learncraft.lv.subsection'};
const STAT_KEY={part:'learncraft.stat.part',section:'learncraft.stat.section',mission:'learncraft.stat.mission',subsection:'learncraft.stat.subsection',asset:'learncraft.stat.asset',time:'learncraft.stat.time'};
const kindOf=row=>{
  const p=row.probe||{};
  if(/ดั้งเดิม|traditional/i.test(p.kindLabel||''))return'traditional';
  if(/ตั้งไข่|ไข่|egg/i.test(p.kindLabel||''))return'eggspace';
  return'';
};
const kindName=k=>k==='traditional'?t('learncraft.kindTraditional'):k==='eggspace'?t('learncraft.kindEggspace'):t('learncraft.kindUnknown');

export function mount(root){
  root.innerHTML=`<div class="tool-layout"><div class="tool wideview lc">
    <div class="lc-heading"><div><h1>${t('tool.learncraft')}</h1><div class="sub">${t('learncraft.sub')}</div></div><div class="lc-mascot-wrap" aria-hidden="true"><img class="lc-mascot" src="assets/learncraft-mascot.png" alt="" loading="lazy" decoding="async"><span class="lc-scope-glint"></span><span class="lc-laser-beam"></span></div></div>
    <div class="lc-card" id="lc-status"></div>
    <div class="lc-card" id="lc-tabs" hidden></div>
    <div class="lc-card" id="lc-result" hidden></div>
  </div></div>`;
  const $s=root.querySelector('#lc-status'),$t=root.querySelector('#lc-tabs'),$r=root.querySelector('#lc-result');
  const mascotWrap=root.querySelector('.lc-mascot-wrap'),mascotHeading=root.querySelector('.lc-heading');
  const updateMascot=(e)=>{
    if(e.pointerType==='touch')return;
    const rect=mascotWrap.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const x=e.clientX,y=e.clientY;
    const dx=Math.max(rect.left-x,0,x-rect.right),dy=Math.max(rect.top-y,0,y-rect.bottom);
    const near=Math.hypot(dx,dy)<=72,hovered=dx===0&&dy===0;
    mascotWrap.classList.toggle('is-near',near);
    mascotWrap.classList.toggle('is-hovered',hovered);
    if(!near)return;
    const localX=(x-rect.left)/rect.width;
    mascotWrap.style.setProperty('--lc-mascot-tilt',`${Math.max(-1.8,Math.min(1.8,(localX-.5)*3.6))}deg`);
  };
  const resetMascot=()=>{
    mascotWrap.classList.remove('is-near','is-hovered');
    mascotWrap.style.removeProperty('--lc-mascot-tilt');
  };
  mascotHeading.addEventListener('pointermove',updateMascot);
  mascotHeading.addEventListener('pointerleave',resetMascot);
  initMascot(root,{kind:'learncraft',result:'#lc-result'});
  mountGuide(root.querySelector('.tool-layout'),'learncraft');
  let ext=null,dup=null,latestVersion=null,busy=false,repeat=true,depth='assets',current=null,checking=false,checkingUpdate=false,refreshingTabs=false,needsExtensionUpdate=false,tabRows=null,ghostTargets=[],ghostUpdate=null,ghostResize=null,ghostFrame=0;
  const visible=()=>!!root.classList.contains('on');
  function stopGhostTracking(){
    if(ghostUpdate)ghostTargets.forEach(target=>target.removeEventListener('scroll',ghostUpdate));
    if(ghostResize)window.removeEventListener('resize',ghostResize);
    if(ghostFrame)cancelAnimationFrame(ghostFrame);
    ghostTargets=[];ghostUpdate=null;ghostResize=null;ghostFrame=0;
  }

  // ---- extension status / install help ----
  function showChecking(){$s.className='lc-card';$s.innerHTML=`<div class="lc-line"><span class="lc-spin" aria-hidden="true"></span>${t('learncraft.checking')}</div>`;$t.hidden=true}
  function showMissing(){
    $s.className='lc-card';$t.hidden=true;
    $s.innerHTML=`<h2 class="lc-h">${t('learncraft.missingTitle')}</h2><p class="lc-p">${t('learncraft.missingText')}</p>
    ${installStepsHtml()}
    <div class="btnrow"><button class="btn primary" data-q="dl">${t('learncraft.download')}</button><button class="btn" data-q="forcereset">${t('learncraft.forceReset')}</button></div>`;
    $s.querySelector('[data-q=dl]').onclick=downloadExtension;
    $s.querySelector('[data-q=forcereset]').onclick=forceReset;
    $s.querySelectorAll('[data-q=copyChromeExtensions]').forEach(button=>button.onclick=()=>copyInternalPage('chrome://extensions'));
  }
  function forceReset(){
    const url=new URL(location.href);
    url.searchParams.set(FORCE_RESET_PARAM,String(Date.now()));
    location.replace(url.href);
  }
  function showConnected(latestVersion=null,updateCheckError=null){
    const old=older(ext.version,EXT_MIN);
    const updateAvailable=latestVersion&&older(ext.version,latestVersion);
    needsExtensionUpdate=!!(old||updateAvailable||dup);
    const updateSteps=[
      [t('learncraft.updateStep1'),'<path d="M13 5h15l9 9v29H13z"/><path d="M28 5v9h9"/><path d="M25 21v13m-6-6 6 6 6-6"/>'],
      [t('learncraft.updateStep2'),'<rect x="5" y="9" width="38" height="30" rx="4"/><path d="M5 18h38"/><circle cx="10.5" cy="13.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="13.5" r=".6" fill="currentColor"/><rect x="12" y="24" width="24" height="9" rx="2" fill="currentColor" fill-opacity=".2"/>'],
      [t('learncraft.updateStep3'),'<rect x="15" y="4" width="18" height="18" rx="2.5"/><path d="M24 4v4m0 4v4m0 4v2" stroke-width="2"/><path d="M24 27v9m-5-5 5 5 5-5"/><path d="M8 37v3a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3v-3"/>'],
      [t('learncraft.updateStep4'),'<path d="M38 24a14 14 0 1 1-3.3-9"/><path d="M35 7v8h-8"/>'],
    ];
    $s.className='lc-card lc-slim';
    const headerActions=old||updateAvailable?'':`<button class="btn" data-q="installation-guide">${t('learncraft.installationGuide')}</button>`;
    $s.innerHTML=`<div class="lc-line"><span class="lc-dot ok" aria-hidden="true"></span><span>${t('learncraft.connected',esc(ext.version))}</span><span class="lc-grow"></span>${headerActions}</div>${dup?`<section class="lc-update-panel lc-dup-panel" aria-labelledby="lc-dup-title"><h2 class="lc-h" id="lc-dup-title">${t('learncraft.duplicateTitle')}</h2><p class="lc-p">${t('learncraft.duplicateText',dup.count,esc(dup.versions.map(v=>'v'+v).join(', ')))}</p><ol class="lc-steps"><li>${t('learncraft.duplicate1')} <button type="button" class="lc-install-copy" data-q="copyChromeExtensions">${t('learncraft.updateChrome')}</button></li><li>${t('learncraft.duplicate2')}</li><li>${t('learncraft.duplicate3')}</li></ol><div class="btnrow"><button class="btn primary" data-q="dup-recheck">${t('learncraft.updateForceRefresh')}</button></div></section>`:''}${old||updateAvailable?`<section class="lc-update-panel" aria-labelledby="lc-update-title"><h2 class="lc-h" id="lc-update-title">${t('learncraft.updateAvailableTitle')}</h2><p class="lc-p">${updateAvailable?t('learncraft.updateAvailable',esc(latestVersion)):t('learncraft.outdated',esc(ext.version))}</p><ol class="lc-install-visual" aria-label="${t('learncraft.updateStepsLabel')}">${updateSteps.map(([text,icon],index)=>`<li class="lc-install-step"><span class="lc-install-number">${index+1}</span><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span class="lc-install-text">${text}</span>${index===1?`<span class="lc-update-step-actions"><button type="button" class="lc-install-copy" data-q="copyChromeExtensions">${t('learncraft.updateChrome')}</button></span>`:''}</li>`).join('')}</ol><details class="lc-install-details"><summary>${t('learncraft.updateDetails')}</summary><ol class="lc-steps"><li>${t('learncraft.updateDetail1')}</li><li>${t('learncraft.updateDetail2')}</li><li>${t('learncraft.updateDetail3')}</li><li>${t('learncraft.updateDetail4')}</li></ol></details><div class="btnrow"><button class="btn primary" data-q="update">${t('learncraft.downloadUpdate')}</button><button class="btn" data-q="forcereset">${t('learncraft.updateForceRefresh')}</button></div></section>`:''}${updateCheckError?`<div class="warn">${t('learncraft.updateCheckFailed',esc(updateCheckError.message||updateCheckError))}</div>`:''}`;
    const installationGuide=$s.querySelector('[data-q=installation-guide]');
    if(installationGuide)installationGuide.onclick=showMissing;
    const updateButton=$s.querySelector('[data-q=update]');
    if(updateButton)updateButton.onclick=()=>downloadExtension(updateButton);
    const forceRefreshButton=$s.querySelector('[data-q=forcereset]');
    if(forceRefreshButton)forceRefreshButton.onclick=forceReset;
    $s.querySelectorAll('[data-q=copyChromeExtensions]').forEach(copyChrome=>copyChrome.onclick=()=>copyInternalPage('chrome://extensions'));
    const recheck=$s.querySelector('[data-q=dup-recheck]');
    if(recheck)recheck.onclick=forceReset;
  }
  async function downloadExtension(button=$s.querySelector('[data-q=dl]')){
    if(button)button.disabled=true;
    try{
      const files={};
      const mr=await fetch(freshUrl('extension/manifest.json',document.baseURI),FRESH);
      if(!mr.ok)throw new Error('manifest.json ('+mr.status+')');
      const mbytes=new Uint8Array(await mr.arrayBuffer());
      files['manifest.json']=mbytes;
      const manifest=JSON.parse(new TextDecoder().decode(mbytes));
      if(typeof manifest.version!=='string'||! /^\d+(?:\.\d+){1,3}$/.test(manifest.version))throw new Error('The extension manifest has an invalid version.');
      const stale=staleDownload(manifest.version,EXT_MIN);   // never hand back an old extension without saying so
      if(stale)throw new Error(stale);
      for(const n of extensionFiles(manifest)){
        if(n==='manifest.json')continue;
        const r=await fetch(freshUrl('extension/'+n,document.baseURI),FRESH);
        if(!r.ok)throw new Error(n+' ('+r.status+')');
        files[n]=new Uint8Array(await r.arrayBuffer());
      }
      download(`penguin-learncraft-extension-v${manifest.version}.zip`,zipSync(files,{level:6}));
    }catch(e){msg(t('learncraft.downloadFail'),t('learncraft.downloadFailedDetail',String(e.message||e)),'error')}
    if(button)button.disabled=false;
  }
  async function latestExtensionVersion(){
    const response=await fetch(freshUrl('extension/manifest.json',document.baseURI),FRESH);
    if(!response.ok)throw new Error(`manifest.json (${response.status})`);
    const manifest=await response.json();
    if(typeof manifest.version!=='string'||! /^\d+(?:\.\d+){1,3}$/.test(manifest.version))throw new Error('The extension manifest has an invalid version.');
    return manifest.version;
  }
  async function checkUpdates(){
    if(!ext||checkingUpdate)return;
    checkingUpdate=true;
    try{latestVersion=await latestExtensionVersion();showConnected(latestVersion)}
    catch(error){latestVersion=null;showConnected(null,error)}
    finally{checkingUpdate=false;if(tabRows&&!busy&&!refreshingTabs)renderTabs(tabRows)}
  }
  async function connect(){
    if(checking)return;checking=true;showChecking();
    let answers=[];
    for(let i=0;i<3&&!answers.length;i++){
      answers=await pingAll();
      if(!answers.length)await new Promise(r=>setTimeout(r,i?500:250));
    }
    checking=false;
    const info=summarizeBridges(answers);   // newest version heard; flags a second installed copy
    if(!info){ext=null;dup=null;showMissing();return}
    ext=info;dup=info.duplicate?info:null;latestVersion=null;showConnected();refresh();checkUpdates();
  }

  // ---- list of LearnCraft tabs ----
  async function refresh(){
    if(!ext||busy||refreshingTabs)return;   // never rebuild the list while a course is being read or refreshed
    refreshingTabs=true;
    $t.hidden=false;$t.innerHTML=`<div class="lc-line"><span class="lc-spin" aria-hidden="true"></span>${t('learncraft.listing')}</div>`;
    try{
      const rows=await ask('list',{},20000);
      if(!Array.isArray(rows))throw new Error('The extension returned an invalid tab list.');
      renderTabs(rows);
    }catch(e){$t.innerHTML=`<div class="warn">${t('learncraft.listError')}: ${t('learncraft.listFailureDetail',esc(e.message||e))}</div>`}
    finally{refreshingTabs=false}
  }
  function stateOf(r){
    const p=r.probe;
    if(!r.code)return{key:'other',ok:false};
    if(r.discarded)return{key:'asleep',ok:false};
    if(r.status!=='complete')return{key:'loading',ok:false};
    if(r.probeError)return{key:'noAccess',ok:false};
    if(p&&p.loggedIn===false)return{key:'login',ok:false};
    if(!p||!p.hasCanvas)return{key:'notOverview',ok:false};
    return{key:'ready',ok:true};
  }
  function renderTabs(rows){
    tabRows=rows;
    const windows=[...new Set(rows.map(r=>r.windowId))];
    const courses=rows.filter(r=>r.code);
    const order=[...rows].sort((a,b)=>(b.code?1:0)-(a.code?1:0)||windows.indexOf(a.windowId)-windows.indexOf(b.windowId)||a.tabId-b.tabId);
    const updateRequired=older(ext.version,EXT_MIN)||!!(latestVersion&&older(ext.version,latestVersion));
    const refreshButton=updateRequired?'':`<button class="btn" data-q="refresh"${busy?' disabled':''}>${t('learncraft.refresh')}</button>`;
    const tabsCount=`<div class="lc-line${needsExtensionUpdate?' lc-tabs-count-locked':''}"><strong>${t('learncraft.tabsFound',rows.length,courses.length)}</strong><span class="lc-grow"></span>${refreshButton}</div>`;
    if(!rows.length){$t.innerHTML=`${tabsCount}<div class="lc-p">${t('learncraft.noTabs')}</div>`;const refreshButtonEl=$t.querySelector('[data-q=refresh]');if(refreshButtonEl)refreshButtonEl.onclick=()=>{refresh();checkUpdates()};return}
    $t.innerHTML=`${tabsCount}<div class="lc-tablist">${order.map(r=>{
      const st=stateOf(r),p=r.probe||{},k=kindOf(r),who=p.loggedIn===true?(p.email?t('learncraft.loggedInAs',esc(p.email)):t('learncraft.loggedIn')):p.loggedIn===false?t('learncraft.notLoggedIn'):t('learncraft.loginUnknown');
      const dot=p.loggedIn===true?'ok':p.loggedIn===false?'bad':'';
      return`<div class="lc-tab${st.ok?'':' off'}${st.key==='other'?' not-master-page':''}${needsExtensionUpdate?' update-locked':''}" data-tab="${r.tabId}"${st.key==='other'||needsExtensionUpdate?' aria-disabled="true"':''}>
        <div class="lc-tab-main"><div class="lc-code">${esc(r.code||'—')}</div>
          <div class="lc-tab-info"><div class="lc-tab-title">${esc((p.courseTitle||r.title||r.url).replace(/^\[[^\]]+\]\s*/,''))}</div>
            <div class="lc-tab-meta">${k?`<span class="lc-chip">${kindName(k)}</span>`:''}${windows.length>1?`<span class="lc-chip dim">${t('learncraft.window',windows.indexOf(r.windowId)+1)}</span>`:''}${r.active?`<span class="lc-chip dim">${t('learncraft.active')}</span>`:''}<span class="lc-who"><span class="lc-dot ${dot}" aria-hidden="true"></span>${who}</span></div></div></div>
        <div class="lc-tab-act"><span class="lc-state ${st.ok?'ok':''}">${t(STATE_KEY[st.key])}</span><span class="lc-extract-btn"><button class="btn primary" data-extract="${r.tabId}"${st.ok&&!needsExtensionUpdate?'':' disabled'}>${t('learncraft.extract')}</button></span></div></div>`}).join('')}</div>`;
    const refreshButtonEl=$t.querySelector('[data-q=refresh]');if(refreshButtonEl)refreshButtonEl.onclick=()=>{refresh();checkUpdates()};
    $t.querySelectorAll('[data-extract]').forEach(b=>b.onclick=()=>extract(Number(b.dataset.extract),b));
  }

  // ---- extract one tab ----
  async function extract(tabId,btn){
    if(needsExtensionUpdate){await msg(t('learncraft.updateAvailableTitle'),dup?t('learncraft.duplicateBlocked'):t('learncraft.updateRequiredExtract'),'warning');return}
    if(busy)return;busy=true;
    const all=[...$t.querySelectorAll('[data-extract]')];all.forEach(b=>b.disabled=true);btn.textContent=t('learncraft.reading');btn.setAttribute('aria-busy','true');
    const progressText=document.createElement('span');progressText.className='lc-extract-progress';progressText.setAttribute('aria-live','off');
    btn.closest('.lc-tab-act').prepend(progressText);
    const started=Date.now(),switchDeadline=started+3000;
    let switchTimer;
    const updateSwitchCountdown=()=>{const seconds=Math.ceil((switchDeadline-Date.now())/1000);if(seconds<=0){progressText.textContent='';clearInterval(switchTimer);return}progressText.textContent=t('learncraft.switchingTabsIn',seconds)};
    updateSwitchCountdown();
    switchTimer=setInterval(updateSwitchCountdown,200);
    const elapsedTimer=setInterval(()=>{if(Date.now()>=switchDeadline)progressText.textContent=t('learncraft.readingElapsed',fmtElapsed(Date.now()-started))},1000);
    try{
      const res=await ask('extract',{tabId},300000);
      if(!res.ok){const detail=res.error==='no-canvas'?t('learncraft.noCanvas'):res.error==='no-structure'?t('learncraft.noStructure'):t('learncraft.extractFailureDetail',String(res.error||t('learncraft.extractError')));await msg(t('learncraft.extractError'),detail,'warning');}
      else{current=res;depth='assets';track('learncraft/run','LearnCraft extract');renderResult();}
    }catch(e){
      const error=String(e.message||e);
      await msg(t('learncraft.extractError'),/timeout|timed out/i.test(error)?t('learncraft.extractBackgroundHelp',error):t('learncraft.extractFailureDetail',error),'error');
    }
    finally{
      clearInterval(switchTimer);clearInterval(elapsedTimer);busy=false;btn.textContent=t('learncraft.extract');btn.removeAttribute('aria-busy');all.forEach(b=>b.disabled=false);progressText.remove();
    }
    if(current)$r.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }

  // ---- result ----
  const lvName=l=>LV_KEY[l]?t(LV_KEY[l]):l;
  function renderResult(){
    stopGhostTracking();
    const r=current,m=r.meta,c=countTree(r),bad=new Map(checkTimes(r).map(i=>[i.node,i])),gaps=findGaps(r),egg=r.levels.includes('mission');
    if(!egg&&depth==='mission')depth='subsection';
    const stat=(k,v)=>`<div class="lc-stat"><span>${t(STAT_KEY[k])}</span><strong>${v}</strong></div>`;
    const leaf=r.levels[r.levels.length-1];
    const copyButton=(kind,value)=>value?`<span class="lc-copy-wrap${kind==='time'?' lc-copy-wrap-time':''}"><button type="button" class="lc-copy-row" data-row-copy="${kind}" data-copy-value="${esc(value)}" aria-label="${esc(t(kind==='title'?'learncraft.copyTitle':'learncraft.copyTime'))}" title="${esc(t(kind==='title'?'learncraft.copyTitle':'learncraft.copyTime'))}"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H4.5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5" stroke="currentColor" stroke-width="1.4"/></svg></button></span>`:'';
    const selectableAssets=[],selectableNodes=[],nodeAssetIndices=new WeakMap(),nodeSelectionIndices=new WeakMap(),assetSelectionIndices=new WeakMap(),selectedAssets=new Set();
    const registerSelection=n=>{
      const indices=(n.assets||[]).map(asset=>{
        const index=selectableAssets.push(asset)-1;
        assetSelectionIndices.set(asset,index);
        return index;
      });
      for(const child of n.children||[])for(const index of registerSelection(child))indices.push(index);
      nodeAssetIndices.set(n,indices);
      nodeSelectionIndices.set(n,selectableNodes.push(n)-1);
      return indices;
    };
    r.tree.forEach(registerSelection);
    const assetLine=a=>{
      const index=assetSelectionIndices.get(a);
      return`<li class="lc-asset"><span class="lc-select-slot"><input class="lc-asset-select" type="checkbox" data-asset-index="${index}" aria-label="${esc(t('learncraft.selectAsset',a.title))}"></span><span class="lc-type">${esc(a.type)}</span><span class="lc-atitle-wrap"><span class="lc-atitle">${esc(a.title)}</span>${copyButton('title',a.title)}</span>${a.version?`<span class="lc-ver">${esc(a.version)}</span>`:''}${a.detail&&a.detail.length?`<span class="lc-detail">${esc(a.detail.join(' · '))}</span>`:''}<span class="lc-time${toSeconds(a.time)===0?' lc-time-zero':''}">${a.time?esc(normTime(a.time)):''}</span>${a.time?copyButton('time',normTime(a.time)):''}</li>`;
    };
    const flag=n=>{const i=bad.get(n);return i?`<span class="lc-flag" title="${esc(t('learncraft.timeMismatch',i.shown,i.computed))}"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 2.5 18 17H2L10 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 7v4.5m0 2.2v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>`:''};
    const selectionControl=n=>nodeAssetIndices.get(n).length?`<span class="lc-select-slot"><input class="lc-node-select" type="checkbox" data-node-index="${nodeSelectionIndices.get(n)}" aria-label="${esc(t('learncraft.selectNodeAssets',n.title))}"></span>`:'';
    const head=(n,extra,noAssets=false)=>`${selectionControl(n)}<span class="lc-lv lv-${n.level}">${esc(lvName(n.level))}</span><span class="lc-title-wrap"><span class="lc-title">${esc(n.title)}</span>${copyButton('title',n.title)}</span>${extra?`<span class="lc-count">${extra}</span>`:''}${noAssets?`<span class="lc-count lc-no-assets">${t('learncraft.noAssets')}</span>`:''}${flag(n)}<span class="lc-time${toSeconds(n.duration)===0?' lc-time-zero':''}">${n.duration?esc(normTime(n.duration)):''}</span>${n.duration?copyButton('time',normTime(n.duration)):''}`;
    const plural=(n,l)=>t('learncraft.count',n,lvName(l).toLowerCase());
    const hasAssets=n=>!!n.assets.length||(n.children||[]).some(hasAssets);
    const node=n=>{
      const sourceIndex=Number.isInteger(n.sourceIndex)?` data-source-index="${n.sourceIndex}"`:'';
      if(n.children&&n.children.length){
        const cl=n.children[0].level;
        const empty=!hasAssets(n);
        return`<details class="lc-node lc-level-${n.level}${empty?' lc-empty-node':''}"${sourceIndex} open><summary>${head(n,plural(n.children.length,cl),empty)}</summary><div class="lc-kids">${n.children.map(node).join('')}</div></details>`;
      }
      if(n.level==='subsection')return`<details class="lc-node lc-level-${n.level}${n.assets.length?'':' lc-empty-node'}"${sourceIndex} open><summary>${head(n,n.assets.length?t('learncraft.assetCount',n.assets.length):'',!n.assets.length)}</summary>${n.assets.length?`<ul class="lc-assets lc-level-assets">${n.assets.map(assetLine).join('')}</ul>`:''}</details>`;
      if(n.level===leaf)return`<div class="lc-leaf lc-level-${n.level}"${sourceIndex}><div class="lc-leafhead">${head(n,t('learncraft.assetCount',n.assets.length))}</div>${n.assets.length?`<ul class="lc-assets lc-level-assets">${n.assets.map(assetLine).join('')}</ul>`:''}</div>`;
      return`<div class="lc-leaf lc-level-${n.level}"${sourceIndex}><div class="lc-leafhead">${head(n,t('learncraft.empty'))}</div></div>`;
    };
    const issues=[...bad.values()];
    const notices=[];
    const jumpLink=(label,index)=>Number.isInteger(index)?`<button type="button" class="lc-notice-jump" data-jump-index="${index}">${esc(label)}</button>`:esc(label);
    const addNotice=(text,html=esc(text))=>notices.push({text,html});
    if(r.completeness?.complete)addNotice(t('learncraft.extractComplete',r.completeness.confirmed));
    else if(r.completeness){
      const gapIndexes=new Set(gaps.map(g=>g.sourceIndex).filter(Number.isInteger));
      const unconfirmed=r.completeness.unconfirmed||[];
      const failed=unconfirmed.filter(item=>!gapIndexes.has(item.index));
      if(unconfirmed.length&&!failed.length)addNotice(t('learncraft.extractCompleteShort'));
      else{
        const failedNames=failed.map(item=>`${lvName(item.level)}: ${item.title}`);
        const text=t('learncraft.extractIncomplete',r.completeness.confirmed,r.completeness.total,failedNames.join(', '));
        const base=t('learncraft.extractIncomplete',r.completeness.confirmed,r.completeness.total,'');
        const linked=failed.map(item=>jumpLink(`${lvName(item.level)}: ${item.title}`,item.index)).join(', ');
        addNotice(text,`${esc(base)}${failed.length?` · ${esc(t('learncraft.notConfirmed'))} ${linked}`:''}`);
      }
    }
    for(const warning of r.warnings||[])addNotice(warning);
    if(gaps.length){
      const names=gaps.map(g=>`${lvName(g.level)}: ${g.title}`).join(', ');
      const marker='__LEARNCRAFT_GAP_NAMES__';
      const text=t('learncraft.gaps',gaps.length,names),parts=t('learncraft.gaps',gaps.length,marker).split(marker);
      const linked=gaps.map(g=>jumpLink(`${lvName(g.level)}: ${g.title}`,g.sourceIndex)).join(' · ');
      addNotice(text,`${esc(parts[0])}${linked}${esc(parts.slice(1).join(marker))}`);
    }
    if(issues.length){
      const shown=issues.slice(0,5);
      const text=`${t('learncraft.timeIssues',issues.length)} ${shown.map(i=>`${i.title}: ${t('learncraft.timeMismatch',i.shown,i.computed)}`).join(' · ')}${issues.length>5?' · …':''}`;
      const linked=shown.map(i=>`${jumpLink(i.title,i.node.sourceIndex)}: ${esc(t('learncraft.timeMismatch',i.shown,i.computed))}`).join(' · ');
      addNotice(text,`${esc(t('learncraft.timeIssues',issues.length))} ${linked}${issues.length>5?' · …':''}`);
    }
    const noticeText=notices.map(notice=>notice.text).join(' · ');
    const noticeHtml=notices.map(notice=>notice.html).join(' · ');
    const hasNoticeWarning=!r.completeness?.complete||(r.warnings||[]).length>0||gaps.length>0||issues.length>0;
    $r.hidden=false;$r.className='lc-card lc-result';
    $r.innerHTML=`<div class="lc-rhead"><div class="lc-code big">${esc(m.code)}</div><div class="lc-rinfo"><div class="lc-rtitle">${esc(m.name)}</div>
        <div class="lc-tab-meta"><span class="lc-chip">${kindName(m.kind)}</span>${m.status?`<span class="lc-chip dim${m.status.toLowerCase()==='ready'?' lc-status-ready':''}">${esc(m.status)}</span>`:''}${m.lastUpdate?`<span class="lc-who">${t('learncraft.lastUpdate')}: ${esc(m.lastUpdate)}</span>`:''}</div></div><button type="button" class="btn lc-download-csv" data-q="download-csv">${t('learncraft.downloadCsv')}</button></div>
      <div class="lc-stats">${stat('part',c.part)}${stat('section',c.section)}${egg?stat('mission',c.mission):''}${stat('subsection',c.subsection)}${stat('asset',c.assets)}${stat('time',fmtTime(c.seconds))}</div>
      ${noticeText?`<div class="lc-notices ${hasNoticeWarning?'warn':'lc-complete'}" role="status" title="${esc(noticeText)}">${noticeHtml}</div>`:''}
      <div class="btnrow lc-actions"><button class="btn lc-copy-table" data-q="copy"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="4" y="3" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>${t('learncraft.copyTable')}</button><button class="btn" data-q="copysum">${t('learncraft.copySummary')}</button><button type="button" class="btn lc-toggle" data-q="repeat" aria-label="${t('learncraft.repeatNames')}" aria-pressed="${repeat}"><span class="lc-toggle-label">${t('learncraft.repeatNames')}</span><span class="lc-toggle-track" aria-hidden="true"></span></button><span class="sub" data-q="copied" role="status">${t(repeat?'learncraft.repeatNamesOnHelp':'learncraft.repeatNamesOffHelp')}</span></div>
      <div class="btnrow lc-depth-controls" role="group" aria-label="${t('learncraft.showThrough')}">${['part','section',...(egg?['mission']:[]),'subsection','assets'].map(level=>`<button type="button" class="btn lc-depth-btn" data-depth="${level}" aria-pressed="${depth===level}">${esc(level==='assets'?t(STAT_KEY.asset):lvName(level))}</button>`).join('')}<button type="button" class="btn lc-quick-math" data-q="quick-math" aria-pressed="false">${t('learncraft.quickMath')}</button><button class="btn lc-clear" data-q="clear">${t('learncraft.clear')}</button></div>
      <div class="lc-selection-summary" data-q="selection-summary" hidden><div class="lc-selection-copy" role="status" aria-live="polite"><strong data-q="selection-count"></strong><span class="lc-selection-total" data-q="selection-total"></span><span class="lc-selection-missing" data-q="selection-missing"></span></div><button type="button" class="btn lc-selection-clear" data-q="clear-selection">${t('learncraft.clearSelection')}</button></div>
      <div class="lc-scroll-ghost"><span class="lc-ghost-label">${t('learncraft.currentPosition')}</span><span class="lc-ghost-path" data-q="ghost-path"></span><button type="button" class="lc-back-top" data-q="back-top" aria-label="${t('learncraft.backToTop')}"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="M8 13V3m0 0L4 7m4-4 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('learncraft.backToTop')}</button></div>
      <div class="lc-tree" data-depth="${depth}">${r.tree.map(node).join('')}</div>`;
    const say=s=>{const o=$r.querySelector('[data-q=copied]');o.textContent=s};
    const copyFeedbackTimers=new WeakMap();
    const showCopyActionFeedback=(button,ok)=>{
      button.classList.remove('lc-copy-action-success','lc-copy-action-failed','lc-copy-action-press','lc-copy-action-shake');
      button.offsetWidth;
      button.classList.add(ok?'lc-copy-action-success':'lc-copy-action-failed',ok?'lc-copy-action-press':'lc-copy-action-shake');
      clearTimeout(copyFeedbackTimers.get(button));
      copyFeedbackTimers.set(button,setTimeout(()=>{
        button.classList.remove('lc-copy-action-success','lc-copy-action-failed','lc-copy-action-press','lc-copy-action-shake');
      },1100));
    };
    const showCopyFeedback=(button,ok,restoreMarkup)=>{
      let feedback=button.nextElementSibling;
      if(!feedback?.classList.contains('lc-copy-feedback')){
        feedback=document.createElement('span');feedback.className='lc-copy-feedback';feedback.setAttribute('role','status');
        button.after(feedback);
      }
      feedback.textContent=ok?t('learncraft.copiedShort'):t('learncraft.copyFailShort');
      feedback.classList.remove('show');feedback.classList.toggle('failed',!ok);button.classList.remove('lc-copy-pulse','lc-copy-failed');
      button.offsetWidth;feedback.offsetWidth;
      button.innerHTML=ok?'<svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m3 8.5 3.2 3.2L13 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':restoreMarkup;button.classList.add(ok?'lc-copy-pulse':'lc-copy-failed');feedback.classList.add('show');
      clearTimeout(copyFeedbackTimers.get(button));
      copyFeedbackTimers.set(button,setTimeout(()=>{
        feedback.classList.remove('show');button.classList.remove('lc-copy-pulse','lc-copy-failed');button.innerHTML=restoreMarkup;
      },1500));
    };
    $r.querySelectorAll('[data-row-copy]').forEach(button=>button.onclick=async e=>{
      e.preventDefault();e.stopPropagation();
      const ok=await copy(button.dataset.copyValue||'');
      showCopyFeedback(button,ok,button.innerHTML);
    });
    $r.querySelector('[data-q=copy]').onclick=async e=>{
      const button=e.currentTarget,ok=await copy(tableTsv(r,{repeat}));
      say(ok?t('learncraft.copied',tableRows(r,{repeat}).length):t('learncraft.copyFail'));showCopyActionFeedback(button,ok);
    };
    $r.querySelector('[data-q=download-csv]').onclick=()=>{
      const filePart=value=>String(value||'').trim().replace(/[^\w.-]+/g,'_').replace(/^\.+/,'')||'unknown';
      const course=filePart(r.meta.code||'course');
      const bytes=new TextEncoder().encode('\uFEFF'+tableCsv(r,{repeat}));
      download(`mastercanvas-${course}.csv`,bytes);
    };
    $r.querySelector('[data-q=copysum]').onclick=async e=>{
      const button=e.currentTarget,ok=await copy(summaryTsv(r));
      say(ok?t('learncraft.copiedSummary'):t('learncraft.copyFail'));showCopyActionFeedback(button,ok);
    };
    $r.querySelector('[data-q=repeat]').onclick=e=>{
      repeat=!repeat;e.currentTarget.setAttribute('aria-pressed',String(repeat));
      const description=t(repeat?'learncraft.repeatNamesOnHelp':'learncraft.repeatNamesOffHelp');
      say(description);
    };
    $r.querySelector('[data-q=clear]').onclick=()=>{current=null;stopGhostTracking();$r.replaceChildren();$r.hidden=true};
    const tree=$r.querySelector('.lc-tree');
    const selectionSummary=$r.querySelector('[data-q=selection-summary]');
    const updateSelectionControls=()=>{
      $r.querySelectorAll('.lc-asset-select').forEach(checkbox=>{
        const selected=selectedAssets.has(Number(checkbox.dataset.assetIndex));
        checkbox.checked=selected;
        checkbox.closest('.lc-asset').classList.toggle('lc-asset-selected',selected);
      });
      $r.querySelectorAll('.lc-node-select').forEach(checkbox=>{
        const indices=nodeAssetIndices.get(selectableNodes[Number(checkbox.dataset.nodeIndex)]);
        const count=indices.reduce((total,index)=>total+Number(selectedAssets.has(index)),0);
        checkbox.checked=count===indices.length;
        checkbox.indeterminate=count>0&&count<indices.length;
        checkbox.setAttribute('aria-checked',checkbox.indeterminate?'mixed':String(checkbox.checked));
      });
      const total=sumAssetTimes([...selectedAssets].map(index=>selectableAssets[index]));
      selectionSummary.hidden=!selectedAssets.size;
      $r.querySelector('[data-q=selection-count]').textContent=t('learncraft.selectedAssets',selectedAssets.size);
      $r.querySelector('[data-q=selection-total]').textContent=t('learncraft.selectedDuration',fmtTime(total.seconds));
      $r.querySelector('[data-q=selection-missing]').textContent=total.withoutDuration?t('learncraft.selectedMissingDuration',total.withoutDuration):'';
    };
    $r.querySelectorAll('.lc-asset-select').forEach(checkbox=>checkbox.onchange=()=>{
      const index=Number(checkbox.dataset.assetIndex);
      if(checkbox.checked)selectedAssets.add(index);else selectedAssets.delete(index);
      updateSelectionControls();
    });
    $r.querySelectorAll('.lc-node-select').forEach(checkbox=>{
      checkbox.addEventListener('click',event=>event.stopPropagation());
      checkbox.onchange=()=>{
        const indices=nodeAssetIndices.get(selectableNodes[Number(checkbox.dataset.nodeIndex)]);
        indices.forEach(index=>checkbox.checked?selectedAssets.add(index):selectedAssets.delete(index));
        updateSelectionControls();
      };
    });
    $r.querySelector('[data-q=clear-selection]').onclick=()=>{
      selectedAssets.clear();
      updateSelectionControls();
    };
    const quickMathButton=$r.querySelector('[data-q=quick-math]');
    quickMathButton.onclick=()=>{
      const active=quickMathButton.getAttribute('aria-pressed')!=='true';
      quickMathButton.setAttribute('aria-pressed',String(active));
      $r.classList.toggle('lc-quick-math',active);
    };
    const ghostPath=$r.querySelector('[data-q=ghost-path]');
    $r.querySelector('[data-q=back-top]').onclick=()=> $r.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    $r.querySelectorAll('.lc-notice-jump').forEach(button=>button.onclick=()=>{
      const target=tree.querySelector(`[data-source-index="${Number(button.dataset.jumpIndex)}"]`);
      if(!target)return;
      for(let parent=target;parent&&parent!==tree;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
      target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
    });
    const levels=egg?['part','section','mission','subsection']:['part','section','subsection'];
    const headingSelector=levels.map(level=>`details.lc-level-${level}>summary,.lc-level-${level}>.lc-leafhead`).join(',');
    let ghostHeadings=[],ghostScrollRoot=root;
    const refreshGhostHeadings=()=>{
      ghostScrollRoot=[root,$r.closest('.tool')].find(element=>{
        if(!element)return false;
        const overflow=getComputedStyle(element).overflowY;
        return (overflow==='auto'||overflow==='scroll')&&element.scrollHeight>element.clientHeight+1;
      })||root;
      const bounds=ghostScrollRoot.getBoundingClientRect(),scrollTop=ghostScrollRoot.scrollTop;
      ghostHeadings=[];
      for(const heading of tree.querySelectorAll(headingSelector)){
        if(!heading.getClientRects().length)continue;
        const level=levels.find(name=>heading.parentElement.classList.contains(`lc-level-${name}`));
        if(level)ghostHeadings.push({heading,level,top:heading.getBoundingClientRect().top-bounds.top+scrollTop});
      }
    };
    const renderGhost=()=>{
      ghostFrame=0;
      if($r.hidden)return;
      const rootBounds=ghostScrollRoot.getBoundingClientRect();
      const marker=$r.querySelector('.lc-scroll-ghost').getBoundingClientRect().bottom-rootBounds.top+12;
      const threshold=ghostScrollRoot.scrollTop+marker;
      let low=0,high=ghostHeadings.length;
      while(low<high){const mid=(low+high)>>1;if(ghostHeadings[mid].top<=threshold)low=mid+1;else high=mid}
      const active={};
      for(let i=0;i<low;i++){
        const {heading,level}=ghostHeadings[i];
        active[level]=heading;
        const index=levels.indexOf(level);
        for(const deeper of levels.slice(index+1))delete active[deeper];
      }
      if(!active.part){
        active.part=ghostHeadings.find(item=>item.level==='part')?.heading;
      }
      ghostPath.replaceChildren();
      levels.forEach(level=>{
        const heading=active[level];
        if(!heading)return;
        const currentTitle=heading.querySelector('.lc-title')?.textContent||'';
        const badge=document.createElement('span');badge.className=`lc-lv lv-${level}`;badge.textContent=lvName(level);badge.title=currentTitle;badge.setAttribute('aria-label',`${lvName(level)}: ${currentTitle}`);
        const title=document.createElement('span');title.className='lc-ghost-title';title.textContent=currentTitle;title.title=currentTitle;
        ghostPath.append(badge,title);
      });
    };
    ghostUpdate=()=>{if(!ghostFrame)ghostFrame=requestAnimationFrame(renderGhost)};
    ghostResize=()=>{refreshGhostHeadings();ghostUpdate()};
    ghostTargets=[...new Set([root,$r.closest('.tool')].filter(Boolean))];
    ghostTargets.forEach(target=>target.addEventListener('scroll',ghostUpdate,{passive:true}));
    window.addEventListener('resize',ghostResize,{passive:true});
    tree.addEventListener('toggle',()=>{refreshGhostHeadings();ghostUpdate()},true);
    refreshGhostHeadings();
    ghostUpdate();
    $r.querySelectorAll('.lc-depth-btn').forEach(b=>b.onclick=()=>{
      depth=b.dataset.depth;
      tree.dataset.depth=depth;
      const cutoff=depth==='assets'?levels.length:Math.max(0,levels.indexOf(depth));
      tree.querySelectorAll('details.lc-node').forEach(node=>{
        const level=levels.find(name=>node.classList.contains(`lc-level-${name}`));
        if(level)node.open=levels.indexOf(level)<cutoff;
      });
      $r.querySelectorAll('.lc-depth-btn').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.depth===depth)));
      ghostUpdate();
    });
  }
  async function copy(text){
    try{await navigator.clipboard.writeText(text);return true}catch{}
    try{const a=document.createElement('textarea');a.value=text;a.style.cssText='position:fixed;opacity:0';document.body.append(a);a.select();const ok=document.execCommand('copy');a.remove();return ok}catch{return false}
  }

  onReady=()=>{if(visible()&&!ext)connect()};
  api={activate:()=>{if(checking||busy)return;if(ext){refresh();checkUpdates()}else connect()}};
}
// Called every time the tool is opened: look for the extension again and refresh the tab list.
export const activate=()=>{if(api)api.activate()};
