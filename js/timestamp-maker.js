import {msg} from './util.js?v=3.7.2';
import {download} from './nbtool.js?v=3.7.2';
import {t} from './i18n.js?v=3.7.2';
import {mountGuide} from './instruction-panel.js?v=3.7.2';
import {copyInternalPage,installStepsHtml} from './install-help.js?v=3.7.2';
import {zipSync} from './vendor/fflate.js?v=3.7.2';
import {older,summarizeBridges,staleDownload,freshUrl,FRESH} from './extcore.js?v=3.7.2';
import {assetMatchesDateSelection,flattenTimestampAssets,groupTimestampUpdates,normalizeTimestampTree,parseTimestampPaste,selectedTimestampUpdates,summarizeRecordingDays,timestampGroupAssetIndices} from './timestampcore.js?v=3.7.2';
import {extensionAssetUrl} from './assets.js?v=3.7.2';

const EXT_MIN='1.3.0';
const FORCE_RESET_PARAM='__pl_tf_reset';
if(new URL(location.href).searchParams.has(FORCE_RESET_PARAM)){
  const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete(FORCE_RESET_PARAM);
  history.replaceState(history.state,'',cleanUrl);
}
const target=location.origin==='null'?'*':location.origin;
let seq=0;
const waiting=new Map();
addEventListener('message',event=>{
  if(event.source!==window)return;
  const message=event.data;
  if(message?.pl==='learncraft-progress'&&waiting.has(message.id)){
    const request=waiting.get(message.id);
    if(request.progress)request.progress(message.progress);
    return;
  }
  if(message?.pl!=='learncraft-reply'||!waiting.has(message.id))return;
  const request=waiting.get(message.id);
  if(request.collect){if(message.ok)request.collect.push(message.data);return}
  waiting.delete(message.id);
  clearTimeout(request.timer);
  message.ok?request.resolve(message.data):request.reject(new Error(message.error||'Unknown extension error'));
});
function ask(action,extra={},timeout=15000,onProgress=null,onRequestId=null){
  return new Promise((resolve,reject)=>{
    const id=`tf${++seq}-${Date.now()}`;
    const timer=setTimeout(()=>{
      waiting.delete(id);
      reject(new Error('The extension did not respond before the request timed out.'));
    },timeout);
    waiting.set(id,{resolve,reject,timer,progress:onProgress});
    onRequestId?.(id);
    window.postMessage({pl:'learncraft',id,action,...extra},target);
  });
}
function pingAll(){
  return new Promise(resolve=>{
    const id=`tf${++seq}-${Date.now()}`,replies=[];
    const timer=setTimeout(()=>{waiting.delete(id);resolve(replies)},200);
    waiting.set(id,{collect:replies,timer});
    window.postMessage({pl:'learncraft',id,action:'ping'},target);
  });
}
const esc=value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
function extensionFiles(manifest){
  const files=new Set(['manifest.json','README.txt']);
  const add=file=>{if(typeof file==='string'&&/^[\w./-]+$/.test(file)&&!file.includes('..'))files.add(file.replace(/^\.?\//,''))};
  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  if(manifest.action?.default_popup){add('popup.js');add('popup.css');add('theme-init.js')}
  (manifest.content_scripts||[]).forEach(content=>[...(content.js||[]),...(content.css||[])].forEach(add));
  Object.values(manifest.icons||{}).forEach(add);
  return[...files];
}

export function mount(root){
  root.dataset.extensionUpToDate='false';
  root.dataset.extensionState='unknown';
  root.innerHTML=`<div class="tool-layout"><div class="tool wideview tf">
    <h1 class="tool-title-sr">${t('tool.timestampMaker')}</h1>
    <div class="lc-card tf-status" role="status" aria-live="polite"></div>
    <div class="lc-card tf-courses" hidden></div>
    <div class="lc-card tf-editor" hidden></div>
  </div></div>`;
  mountGuide(root.querySelector('.tool-layout'),'timestampMaker');
  const $status=root.querySelector('.tf-status'),$courses=root.querySelector('.tf-courses'),$editor=root.querySelector('.tf-editor');
  let extension=null,tabs=[],activeTab=null,assets=[],tree=[],busy=false,stopRequested=false,activeFillRequestId=null,dateSummary={days:[],undated:0},selectedDates=new Set(),includeUndated=false,ghostController=null,refreshGhostPosition=()=>{},updateRangeSummary=()=>{},lastEnteredIntegers={pageNo:null,problemNo:null};
  const setExtensionState=state=>{root.dataset.extensionState=state;root.dataset.extensionUpToDate=String(state==='up-to-date');root.dispatchEvent(new Event('extensionstatechange'))};
  async function checkCurrentVersion(info){
    setExtensionState(older(info.version,EXT_MIN)?'outdated':'checking');
    try{
      const response=await fetch(freshUrl('extension/manifest.json',document.baseURI),FRESH);
      if(!response.ok)throw new Error(`manifest.json (${response.status})`);
      const manifest=await response.json();
      if(typeof manifest.version!=='string'||! /^\d+(?:\.\d+){1,3}$/.test(manifest.version))throw new Error('The extension manifest has an invalid version.');
      setExtensionState(info.duplicate?'duplicate':older(info.version,EXT_MIN)||older(info.version,manifest.version)?'outdated':'up-to-date');
    }catch{setExtensionState(info.duplicate?'duplicate':older(info.version,EXT_MIN)?'outdated':'unknown')}
  }

  const status=(text,kind='')=>{$status.hidden=false;$status.className=`lc-card tf-status${kind?` ${kind}`:''}`;$status.textContent=text};
  const clearStatus=()=>{$status.hidden=true;$status.textContent=''};
  const showInstallNotice=(html,className='')=>{
    $status.hidden=false;
    $status.className=`lc-card${className?` ${className}`:''}`;
    $status.innerHTML=html;
    $courses.hidden=true;$editor.hidden=true;
    $status.scrollIntoView({block:'nearest'});
  };
  const forceReset=()=>{
    const url=new URL(location.href);
    url.searchParams.set(FORCE_RESET_PARAM,String(Date.now()));
    location.replace(url.href);
  };
  const bindInstallSteps=()=> $status.querySelectorAll('[data-q=copyChromeExtensions]').forEach(button=>{
    button.addEventListener('click',()=>copyInternalPage('chrome://extensions'));
  });
  const bindRefresh=()=> $status.querySelectorAll('[data-q=forcereset]').forEach(button=>button.addEventListener('click',forceReset));
  async function downloadExtension(button){
    if(button)button.disabled=true;
    try{
      const files={};
      const response=await fetch(freshUrl('extension/manifest.json',document.baseURI),FRESH);
      if(!response.ok)throw new Error(`manifest.json (${response.status})`);
      const manifestBytes=new Uint8Array(await response.arrayBuffer());
      files['manifest.json']=manifestBytes;
      const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
      if(typeof manifest.version!=='string'||! /^\d+(?:\.\d+){1,3}$/.test(manifest.version))throw new Error('The extension manifest has an invalid version.');
      const stale=staleDownload(manifest.version,EXT_MIN);
      if(stale)throw new Error(stale);
      for(const file of extensionFiles(manifest)){
        if(file==='manifest.json')continue;
        const fileResponse=await fetch(freshUrl(extensionAssetUrl(file)||`extension/${file}`,document.baseURI),FRESH);
        if(!fileResponse.ok)throw new Error(`${file} (${fileResponse.status})`);
        files[file]=new Uint8Array(await fileResponse.arrayBuffer());
      }
      download(`penguin-learncraft-extension-v${manifest.version}.zip`,zipSync(files,{level:6}));
    }catch(error){
      await msg(t('learncraft.downloadFail'),t('learncraft.downloadFailedDetail',String(error.message||error)),'error');
    }finally{
      if(button)button.disabled=false;
    }
  }
  function showMissing(){
    showInstallNotice(installStepsHtml(),'lc-install-notice');
    $status.querySelector('[data-q=dl]').addEventListener('click',event=>downloadExtension(event.currentTarget));
    bindInstallSteps();bindRefresh();
  }
  function showOutdated(version){
    showInstallNotice(`<section class="lc-update-panel" aria-labelledby="tf-update-title"><h2 class="lc-h" id="tf-update-title">${t('learncraft.updateAvailableTitle')}</h2><p class="lc-p">${t('learncraft.outdated',esc(version))}</p>${installStepsHtml({update:true})}</section>`);
    $status.querySelector('[data-q=dl]').addEventListener('click',event=>downloadExtension(event.currentTarget));
    bindInstallSteps();bindRefresh();
  }
  function showDuplicate(info){
    showInstallNotice(`<h2 class="lc-h">${t('learncraft.duplicateTitle')}</h2><p class="lc-p">${t('learncraft.duplicateText',info.count,esc(info.versions.map(version=>`v${version}`).join(', ')))}</p><ol class="lc-steps"><li>${t('learncraft.duplicate1')} <button type="button" class="lc-install-copy" data-q="copyChromeExtensions">${t('learncraft.updateChrome')}</button></li><li>${t('learncraft.duplicate2')}</li><li>${t('learncraft.duplicate3')}</li></ol><div class="btnrow"><button type="button" class="btn primary" data-q="forcereset">${t('learncraft.updateForceRefresh')}</button></div>`);
    bindInstallSteps();bindRefresh();
  }
  const copyFeedback=document.createElement('div');
  copyFeedback.className='tf-copy-feedback';
  copyFeedback.setAttribute('role','status');
  copyFeedback.setAttribute('aria-live','polite');
  copyFeedback.setAttribute('aria-atomic','true');
  let copyFeedbackTimer=null;
  const showCopyFeedback=(text,kind)=>{
    clearTimeout(copyFeedbackTimer);
    copyFeedback.textContent=text;
    copyFeedback.className=`tf-copy-feedback ${kind}`;
    if(!copyFeedback.isConnected)document.body.append(copyFeedback);
    requestAnimationFrame(()=>copyFeedback.classList.add('is-visible'));
    copyFeedbackTimer=setTimeout(()=>{
      copyFeedback.classList.remove('is-visible');
      copyFeedbackTimer=setTimeout(()=>copyFeedback.remove(),200);
    },1800);
  };
  function renderAsset(assetIndex){
    const asset=assets[assetIndex],locked=!asset.canFill,disabled=locked?' disabled':'';
    const lockedHint=asset.hasNumberedTimestamp?t('timestampMaker.lockedTimestamp'):t('timestampMaker.lockedVideoOnly');
    const videoPreview=asset.videoUrl?`<button class="tf-video-open" type="button" data-video-preview="${assetIndex}" aria-label="${esc(t('timestampMaker.previewVideo',asset.title))}" title="${esc(t('timestampMaker.previewVideo',asset.title))}">${t('timestampMaker.previewVideoAction')}</button>`:'';
    return`<li class="lc-asset tf-asset${locked?' tf-asset-disabled':''}">
      <span class="lc-select-slot">${locked?'':`<input class="lc-asset-select" type="checkbox" data-select-row="${assetIndex}" aria-label="${esc(t('timestampMaker.selectAsset',asset.title))}">`}</span>
      <span class="lc-type">${esc(asset.type||'—')}</span><span class="lc-atitle-wrap"><span class="lc-atitle" title="${esc(asset.title)}">${esc(asset.title||'—')}</span>${videoPreview}</span>
      <div class="tf-field-wrap"><label class="tf-inline-field"><span class="sr-only">${esc(t('timestampMaker.pageFor',asset.title))}</span><span class="tf-input-shell${locked?' tf-input-disabled':!String(asset.pageNo||'').trim()?' tf-input-empty':''}"><span class="tf-input-prefix" aria-hidden="true">PAGE</span><input class="tf-value${asset.pageNoPrefilled?' tf-prefilled':''}" type="text" maxlength="40" autocomplete="off" data-field="pageNo" data-index="${assetIndex}" aria-label="${esc(t('timestampMaker.pageFor',asset.title))}" value="${esc(asset.pageNo)}" placeholder="${locked?esc(lockedHint):''}"${disabled}></span></label><div class="tf-suggestions" hidden></div></div>
      <div class="tf-field-wrap"><label class="tf-inline-field"><span class="sr-only">${esc(t('timestampMaker.problemFor',asset.title))}</span><span class="tf-input-shell${locked?' tf-input-disabled':!String(asset.problemNo||'').trim()?' tf-input-empty':''}"><span class="tf-input-prefix" aria-hidden="true">PB</span><input class="tf-value${asset.problemNoPrefilled?' tf-prefilled':''}" type="text" maxlength="40" autocomplete="off" data-field="problemNo" data-index="${assetIndex}" aria-label="${esc(t('timestampMaker.problemFor',asset.title))}" value="${esc(asset.problemNo)}" placeholder="${locked?esc(lockedHint):''}"${disabled}></span></label><div class="tf-suggestions" hidden></div></div>
    </li>`;
  }
  function renderNode(node){
    const count=node.assetIndices.length+node.children.reduce((sum,child)=>sum+countNodeAssets(child),0);
    const empty=count===0,level=/^(part|section|mission|subsection)$/.test(node.level)?node.level:'subsection';
    const assetIndices=[...node.assetIndices,...node.children.flatMap(child=>collectNodeAssetIndices(child))];
    const children=node.children.map(renderNode).join('');
    const nodeAssets=node.assetIndices.length?`<ul class="lc-assets lc-level-assets">${node.assetIndices.map(renderAsset).join('')}</ul>`:'';
    return`<details class="lc-node lc-level-${level} tf-node${empty?' lc-empty-node':''}" data-node-assets="${assetIndices.join(',')}" open><summary><span class="lc-lv lv-${level}">${esc(t(`learncraft.lv.${level}`))}</span><span class="lc-title-wrap"><span class="lc-title" title="${esc(node.title)}">${esc(node.title)}</span></span><span class="lc-count${empty?' lc-no-assets':''}">${empty?t('learncraft.noAssets'):t('timestampMaker.assetCount',count)}</span>${node.duration?`<span class="lc-time">${esc(node.duration)}</span>`:''}</summary>${nodeAssets}${children?`<div class="lc-kids">${children}</div>`:''}</details>`;
  }
  function collectNodeAssetIndices(node){return[...node.assetIndices,...node.children.flatMap(child=>collectNodeAssetIndices(child))]}
  function countNodeAssets(node){return node.assetIndices.length+node.children.reduce((sum,child)=>sum+countNodeAssets(child),0)}
  const undatedVideo=asset=>String(asset.type||'').trim().toUpperCase()==='VIDEO'&&!asset.recordingDate;
  const fmtDate=(date,options)=>new Intl.DateTimeFormat('en',{timeZone:'UTC',...options}).format(new Date(`${date}T00:00:00Z`));
  const monthLabel=month=>fmtDate(`${month}-01`,{month:'long',year:'numeric'});
  const dayTitle=(date,count)=>`${fmtDate(date,{weekday:'short',day:'numeric',month:'short',year:'numeric'})} · ${t('timestampMaker.assetCount',count)}`;
  const dayStatusColor=(unfilled,total)=>{
    if(!unfilled)return'#66d297';
    const ratio=total?Math.max(0,Math.min(1,unfilled/total)):0,light=[255,174,174],deep=[220,38,38];
    return`#${light.map((value,index)=>Math.round(value+(deep[index]-value)*ratio).toString(16).padStart(2,'0')).join('')}`;
  };
  function renderDateFilters(){
    const summary=summarizeRecordingDays(assets);
    dateSummary=summary;
    const {days,undated}=summary;
    if(!days.length&&!undated)return'';
    const unfilledByDay=new Map();
    assets.forEach(asset=>{if(asset.recordingDate&&asset.canFill)unfilledByDay.set(asset.recordingDate,(unfilledByDay.get(asset.recordingDate)||0)+1)});
    const byMonth=new Map();
    days.forEach(day=>{const month=day.date.slice(0,7);if(!byMonth.has(month))byMonth.set(month,[]);byMonth.get(month).push(day)});
    const monthBlock=([month,items])=>{
      const total=items.reduce((sum,day)=>sum+day.count,0),allOn=items.every(day=>selectedDates.has(day.date)),label=monthLabel(month);
      const columns=items.map(({date,count})=>{
        const title=dayTitle(date,count),pressed=selectedDates.has(date),unfilled=unfilledByDay.get(date)||0;
        return`<button type="button" class="tf-day" data-day="${date}" style="--tf-day-color:${dayStatusColor(unfilled,count)}" aria-pressed="${pressed}" title="${esc(title)}" aria-label="${esc(title)}"><span class="tf-day-wd">${esc(fmtDate(date,{weekday:'short'}))}</span><span class="tf-day-num">${Number(date.slice(8))}</span><span class="tf-day-count">${count}</span></button>`;
      }).join('');
      return`<div class="tf-month" role="group" aria-label="${esc(label)}"><button type="button" class="tf-month-toggle" data-month="${month}" aria-pressed="${allOn}"><span>${esc(label)}</span><span class="tf-count">${total}</span></button><div class="tf-day-row">${columns}</div></div>`;
    };
    const undatedRow=undated?`<div class="tf-undated-row"><button type="button" class="tf-undated" data-undated aria-pressed="${includeUndated}"><span>${esc(t('timestampMaker.unknownDate'))}</span><span class="tf-count">${undated}</span></button></div>`:'';
    return`<section class="tf-date-panel"><div class="tf-date-panel-heading"><strong>${esc(t('timestampMaker.dateFilters'))}</strong><span>${esc(t('timestampMaker.dateFilterHint'))}</span><span class="tf-date-panel-actions"><span class="tf-shown" data-shown></span><button type="button" class="btn tf-clear" data-clear-dates>${esc(t('timestampMaker.clearDates'))}</button></span></div><div class="tf-months">${[...byMonth].map(monthBlock).join('')}</div>${undatedRow}</section>`;
  }
  const dateSelection=()=>({dates:selectedDates,undated:includeUndated});
  const selectionActive=()=>selectedDates.size>0||includeUndated;
  function toggleDay(date,additive){
    if(additive)selectedDates.has(date)?selectedDates.delete(date):selectedDates.add(date);
    else if(selectedDates.size===1&&selectedDates.has(date)&&!includeUndated)selectedDates.clear();
    else{selectedDates.clear();includeUndated=false;selectedDates.add(date)}
    applyDateSelection();
  }
  function toggleMonth(month,additive){
    const dates=dateSummary.days.filter(day=>day.date.startsWith(`${month}-`)).map(day=>day.date);
    const allOn=dates.length>0&&dates.every(date=>selectedDates.has(date));
    const onlyThisMonth=allOn&&selectedDates.size===dates.length&&!includeUndated;
    if(additive)dates.forEach(date=>allOn?selectedDates.delete(date):selectedDates.add(date));
    else if(onlyThisMonth){selectedDates.clear();includeUndated=false}
    else{selectedDates.clear();includeUndated=false;dates.forEach(date=>selectedDates.add(date))}
    applyDateSelection();
  }
  function toggleUndated(additive){
    if(additive)includeUndated=!includeUndated;
    else if(includeUndated&&selectedDates.size===0)includeUndated=false;
    else{selectedDates.clear();includeUndated=true}
    applyDateSelection();
  }
  function applyDateSelection(){
    const selection=dateSelection(),active=selectionActive(),matching=new Set();
    assets.forEach((asset,index)=>{if(assetMatchesDateSelection(asset,selection))matching.add(index)});
    $editor.querySelectorAll('.tf-asset').forEach(row=>{
      const index=Number(row.querySelector('[data-index]')?.dataset.index);
      row.hidden=active&&!matching.has(index);
      const checkbox=row.querySelector('[data-select-row]');
      if(!checkbox)return;
      if(row.hidden)checkbox.checked=false;
      else if(active)checkbox.checked=true;
    });
    $editor.querySelectorAll('[data-node-assets]').forEach(node=>{
      const indices=node.dataset.nodeAssets.split(',').filter(Boolean).map(Number);
      node.hidden=active&&!indices.some(index=>matching.has(index));
    });
    $editor.querySelectorAll('[data-day]').forEach(button=>button.setAttribute('aria-pressed',String(selectedDates.has(button.dataset.day))));
    $editor.querySelectorAll('[data-month]').forEach(button=>{
      const dates=dateSummary.days.filter(day=>day.date.startsWith(`${button.dataset.month}-`)).map(day=>day.date);
      button.setAttribute('aria-pressed',String(dates.length>0&&dates.every(date=>selectedDates.has(date))));
    });
    $editor.querySelector('[data-undated]')?.setAttribute('aria-pressed',String(includeUndated));
    $editor.querySelector('.tf-date-panel')?.classList.toggle('tf-active',active);
    const shown=$editor.querySelector('[data-shown]'),clear=$editor.querySelector('[data-clear-dates]');
    if(shown){
      const byDay=new Map();
      matching.forEach(index=>{
        const date=assets[index]?.recordingDate;
        if(!date)return;
        const counts=byDay.get(date)||{filled:0,unfilled:0};
        counts[assets[index].canFill?'unfilled':'filled']++;
        byDay.set(date,counts);
      });
      const filled=[...matching].filter(index=>!assets[index]?.canFill).length,unfilled=matching.size-filled;
      const highlightDates=(kind,on)=>$editor.querySelectorAll('[data-day]').forEach(button=>{
        button.classList.toggle(`tf-day-status-${kind}`,on&&(byDay.get(button.dataset.day)?.[kind]||0)>0);
      });
      const makeStatus=(kind,count,label)=>{
        const item=document.createElement('span');
        item.className=`tf-status-count tf-status-count-${kind}`;
        item.textContent=`${label} ${count}`;
        item.addEventListener('pointerenter',()=>highlightDates(kind,true));
        item.addEventListener('pointerleave',()=>highlightDates(kind,false));
        return item;
      };
      shown.replaceChildren(
        document.createTextNode(`${t('timestampMaker.showingStats',matching.size,assets.length,active)} · `),
        makeStatus('filled',filled,t('timestampMaker.filledLabel')),
        document.createTextNode(' · '),
        makeStatus('unfilled',unfilled,t('timestampMaker.unfilledLabel'))
      );
    }
    if(clear)clear.hidden=!active;
    updateRangeSummary();
    refreshGhostPosition();
    updatePending();
  }
  function showEditor(){
    if(!activeTab||(!assets.length&&!tree.length)){$editor.hidden=true;return}
    $editor.hidden=false;
    const treeAssetIndices=new Set();
    const collectAssetIndices=nodes=>nodes.forEach(node=>{node.assetIndices.forEach(index=>treeAssetIndices.add(index));collectAssetIndices(node.children)});
    collectAssetIndices(tree);
    const courseTitle=activeTab.probe?.courseTitle||activeTab.title||activeTab.code;
    selectedDates.clear();includeUndated=false;
    $editor.innerHTML=`<div class="tf-editor-heading"><div><strong>${esc(activeTab.code)} · ${esc(courseTitle)}</strong><span>${t('timestampMaker.assetCount',assets.length)}</span></div><button class="btn" type="button" data-action="back">${t('timestampMaker.changeCourse')}</button></div>
      ${renderDateFilters()}
      <div class="lc-scroll-ghost tf-scroll-ghost"><span class="lc-ghost-label">${t('learncraft.currentPosition')}</span><span class="lc-ghost-path" data-ghost-path></span><button type="button" class="lc-back-top" data-action="back-top" aria-label="${t('learncraft.backToTop')}"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="M8 13V3m0 0L4 7m4-4 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('learncraft.backToTop')}</button></div>
      <div class="tf-range-status" data-range-status hidden role="status" aria-live="polite"><span class="tf-range-message"><span data-range-label></span><span>·</span><kbd>Ctrl+C</kbd><span>${esc(t('timestampMaker.rangeCopyHint'))}</span><span>·</span><kbd>Esc</kbd><span>${esc(t('timestampMaker.rangeClearHint'))}</span></span><button type="button" class="tf-range-clear" data-clear-range>${esc(t('timestampMaker.clearRange'))}</button></div>
      <div class="lc-tree tf-tree">${tree.map(renderNode).join('')}${assets.filter((asset,index)=>!treeAssetIndices.has(index)).length?`<ul class="lc-assets lc-level-assets tf-root-assets">${assets.map((asset,index)=>treeAssetIndices.has(index)?'':renderAsset(index)).join('')}</ul>`:''}</div>
      <p class="tf-note">${t('timestampMaker.videoOnly')}</p>
      <div class="tf-submit"><span data-pending>${t('timestampMaker.noChanges')}</span><div class="tf-submit-actions"><button class="btn" type="button" data-action="stop" hidden>${t('timestampMaker.stop')}</button><button class="btn primary" type="button" data-action="confirm" disabled>${t('timestampMaker.confirm')}</button></div></div>
      <p class="tf-note">${t('timestampMaker.saveNote')}</p>
      <div class="tf-result" data-result hidden role="status" aria-live="polite"></div>
      <dialog class="tf-video-dialog" data-video-dialog aria-label="${esc(t('timestampMaker.videoPreview'))}">
        <div class="tf-video-dialog-heading"><strong data-video-title></strong><button class="tf-video-close" type="button" data-video-close>${t('timestampMaker.closeVideoPreview')}</button></div>
        <div class="tf-video-viewport" data-video-viewport><video class="tf-video-player" data-video-player controls playsinline preload="none"></video></div>
        <p class="tf-video-zoom-hint">${t('timestampMaker.videoZoomHint')}</p>
        <p class="tf-video-error" data-video-error hidden role="alert">${t('timestampMaker.videoPlaybackError')}</p>
      </dialog>`;
    $editor.querySelector('[data-action=back]').onclick=()=>{$editor.hidden=true;$courses.hidden=false};
    $editor.querySelector('[data-action=stop]').onclick=requestStop;
    $editor.querySelector('[data-action=back-top]').onclick=()=> $editor.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    const videoDialog=$editor.querySelector('[data-video-dialog]'),videoViewport=$editor.querySelector('[data-video-viewport]'),videoPlayer=$editor.querySelector('[data-video-player]'),videoTitle=$editor.querySelector('[data-video-title]'),videoError=$editor.querySelector('[data-video-error]');
    let videoZoom=1,videoPanX=0,videoPanY=0,videoPanDrag=null,suppressVideoClick=false;
    const applyVideoTransform=()=>{
      const maxX=videoViewport.clientWidth*(videoZoom-1)/2,maxY=videoViewport.clientHeight*(videoZoom-1)/2;
      videoPanX=Math.max(-maxX,Math.min(maxX,videoPanX));
      videoPanY=Math.max(-maxY,Math.min(maxY,videoPanY));
      videoViewport.dataset.zoomed=String(videoZoom>1);
      videoPlayer.style.transform=videoZoom>1?`translate(${videoPanX}px,${videoPanY}px) scale(${videoZoom})`:'';
    };
    const removeVideoPanListeners=()=>{
      window.removeEventListener('pointermove',moveVideoPan,true);
      window.removeEventListener('pointerup',finishVideoPan,true);
      window.removeEventListener('pointercancel',finishVideoPan,true);
    };
    const resetVideoZoom=()=>{
      videoZoom=1;
      videoPanX=0;videoPanY=0;
      videoPanDrag=null;suppressVideoClick=false;
      videoViewport.dataset.zoomed='false';
      videoViewport.classList.remove('tf-video-panning');
      videoPlayer.style.transform='';
      removeVideoPanListeners();
    };
    const finishVideoPan=event=>{
      if(!videoPanDrag||event.pointerId!==videoPanDrag.pointerId)return;
      const moved=videoPanDrag.moved;
      removeVideoPanListeners();
      if(moved){suppressVideoClick=true;setTimeout(()=>{suppressVideoClick=false},0)}
      videoViewport.classList.remove('tf-video-panning');
      videoPanDrag=null;
    };
    const moveVideoPan=event=>{
      if(!videoPanDrag||event.pointerId!==videoPanDrag.pointerId)return;
      const dx=event.clientX-videoPanDrag.x,dy=event.clientY-videoPanDrag.y;
      if(!videoPanDrag.moved&&Math.hypot(dx,dy)<4)return;
      event.preventDefault();
      videoPanDrag.moved=true;
      videoViewport.classList.add('tf-video-panning');
      videoPanX=videoPanDrag.panX+dx;videoPanY=videoPanDrag.panY+dy;
      applyVideoTransform();
    };
    videoViewport.addEventListener('pointerdown',event=>{
      if(videoZoom<=1||event.button!==0||event.target!==videoPlayer)return;
      const bounds=videoViewport.getBoundingClientRect();
      if(event.clientY>=bounds.bottom-52)return;
      videoPanDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,panX:videoPanX,panY:videoPanY,moved:false};
      window.addEventListener('pointermove',moveVideoPan,true);
      window.addEventListener('pointerup',finishVideoPan,true);
      window.addEventListener('pointercancel',finishVideoPan,true);
    });
    videoPlayer.addEventListener('click',event=>{
      if(!suppressVideoClick)return;
      event.preventDefault();event.stopPropagation();
      suppressVideoClick=false;
    },true);
    videoViewport.addEventListener('wheel',event=>{
      if(!event.ctrlKey)return;
      event.preventDefault();
      event.stopPropagation();
      const bounds=videoViewport.getBoundingClientRect(),nextZoom=Math.max(1,Math.min(3,videoZoom+(event.deltaY<0?0.1:-0.1)));
      const ratio=nextZoom/videoZoom,x=event.clientX-bounds.left-bounds.width/2,y=event.clientY-bounds.top-bounds.height/2;
      videoPanX=x-(x-videoPanX)*ratio;videoPanY=y-(y-videoPanY)*ratio;videoZoom=nextZoom;
      applyVideoTransform();
    },{passive:false});
    $editor.querySelectorAll('[data-video-preview]').forEach(button=>button.addEventListener('click',()=>{
      const asset=assets[Number(button.dataset.videoPreview)];
      if(!asset?.videoUrl){status(t('timestampMaker.videoPlaybackError'),'tf-error');return}
      videoTitle.textContent=asset.title||'';
      videoDialog.setAttribute('aria-label',t('timestampMaker.videoPreviewFor',asset.title||''));
      videoError.hidden=true;
      resetVideoZoom();
      videoPlayer.src=asset.videoUrl;
      videoDialog.showModal();
      videoPlayer.play().catch(()=>{
        videoError.textContent=t('timestampMaker.videoAutoplayBlocked');
        videoError.hidden=false;
      });
    }));
    $editor.querySelector('[data-video-close]').addEventListener('click',()=>videoDialog.close());
    videoDialog.addEventListener('click',event=>{if(event.target===videoDialog)videoDialog.close()});
    videoDialog.addEventListener('close',()=>{
      videoPlayer.pause();
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
      resetVideoZoom();
      videoError.hidden=true;
    });
    videoPlayer.addEventListener('error',()=>{videoError.hidden=false});
    $editor.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',event=>toggleDay(button.dataset.day,event.ctrlKey||event.metaKey)));
    $editor.querySelectorAll('[data-month]').forEach(button=>button.addEventListener('click',event=>toggleMonth(button.dataset.month,event.ctrlKey||event.metaKey)));
    $editor.querySelector('[data-undated]')?.addEventListener('click',event=>toggleUndated(event.ctrlKey||event.metaKey));
    $editor.querySelector('[data-clear-dates]')?.addEventListener('click',()=>{selectedDates.clear();includeUndated=false;applyDateSelection()});
    const valueInputs=[...$editor.querySelectorAll('.tf-value:not(:disabled)')];
    let rangeStart=null,rangeEnd=null,dragState=null;
    const visibleRows=()=>[...new Set(valueInputs.map(input=>input.closest('.tf-asset')).filter(row=>row&&!row.hidden&&row.getClientRects().length))];
    const rangeStatus=$editor.querySelector('[data-range-status]'),rangeLabel=$editor.querySelector('[data-range-label]');
    const refreshRangeStatus=()=>{
      const rows=visibleRows();
      if(rangeStart&&(!rows.includes(rangeStart)||!rows.includes(rangeEnd))){$editor.querySelectorAll('.tf-range-selected').forEach(row=>row.classList.remove('tf-range-selected'));rangeStart=null;rangeEnd=null}
      const count=rows.filter(row=>row.classList.contains('tf-range-selected')).length;
      rangeStatus.hidden=count===0;
      if(count)rangeLabel.textContent=t('timestampMaker.rangeSelected',count);
    };
    updateRangeSummary=refreshRangeStatus;
    const clearRange=()=>{
      $editor.querySelectorAll('.tf-range-selected').forEach(row=>row.classList.remove('tf-range-selected'));
      rangeStart=null;rangeEnd=null;refreshRangeStatus();
    };
    $editor.querySelector('[data-clear-range]').addEventListener('click',clearRange);
    const updateRange=(start,end)=>{
      const rows=visibleRows(),first=rows.indexOf(start),last=rows.indexOf(end);
      if(first<0||last<0)return;
      rangeStart=start;rangeEnd=end;
      rows.forEach((row,index)=>row.classList.toggle('tf-range-selected',index>=Math.min(first,last)&&index<=Math.max(first,last)));
      refreshRangeStatus();
    };
    const finishDrag=()=>{
      if(!dragState)return;
      window.removeEventListener('pointermove',moveDrag,true);window.removeEventListener('pointerup',finishDrag,true);window.removeEventListener('pointercancel',finishDrag,true);
      $editor.classList.remove('tf-range-dragging');dragState=null;
    };
    const moveDrag=event=>{
      if(!dragState)return;
      if(dragState.originInput){
        const bounds=dragState.inputBounds;
        const inside=event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom;
        if(inside)return;
      }
      if(!dragState.active&&Math.hypot(event.clientX-dragState.x,event.clientY-dragState.y)<5)return;
      dragState.active=true;event.preventDefault();$editor.classList.add('tf-range-dragging');
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.tf-asset');
      if(target)updateRange(dragState.row,target);
      document.getSelection()?.removeAllRanges();
    };
    valueInputs.forEach(input=>input.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      dragState={row:input.closest('.tf-asset'),x:event.clientX,y:event.clientY,active:false,originInput:input,inputBounds:input.getBoundingClientRect()};
      window.addEventListener('pointermove',moveDrag,true);window.addEventListener('pointerup',finishDrag,true);window.addEventListener('pointercancel',finishDrag,true);
    }));
    $editor.addEventListener('keydown',async event=>{
      if(event.key==='Escape'&&rangeStart&&rangeEnd){event.preventDefault();clearRange();return}
      if(!(event.ctrlKey||event.metaKey)||(event.code!=='KeyC'&&event.key.toLowerCase()!=='c')||!rangeStart||!rangeEnd)return;
      const rows=visibleRows(),first=rows.indexOf(rangeStart),last=rows.indexOf(rangeEnd);
      if(first<0||last<0)return;
      event.preventDefault();event.stopPropagation();
      const values=rows.slice(Math.min(first,last),Math.max(first,last)+1).map(row=>['pageNo','problemNo'].map(field=>row.querySelector(`.tf-value[data-field="${field}"]`)?.value||'').join('\t')).join('\n');
      try{await navigator.clipboard.writeText(values);status(t('timestampMaker.valuesCopied'),'tf-success');showCopyFeedback(t('timestampMaker.valuesCopied'),'tf-success')}
      catch{status(t('timestampMaker.copyFailed'),'tf-error');showCopyFeedback(t('timestampMaker.copyFailed'),'tf-error')}
    });
    valueInputs.forEach((input,index)=>{
      const fieldWrap=input.closest('.tf-field-wrap'),suggestionBox=fieldWrap.querySelector('.tf-suggestions');
      let removePositionListeners=()=>{};
      input.addEventListener('paste',event=>{
        const text=event.clipboardData?.getData('text/plain');
        if(text==null)return;
        let pastedRows;
        try{pastedRows=parseTimestampPaste(text)}catch{
          event.preventDefault();status(t('timestampMaker.pasteInvalid'),'tf-error');return;
        }
        if(!pastedRows)return;
        event.preventDefault();
        const rows=visibleRows(),start=rows.indexOf(input.closest('.tf-asset'));
        const paired=pastedRows.some(row=>row.length>1);
        if(start<0||start+pastedRows.length>rows.length){
          status(t('timestampMaker.pasteTooManyRows'),'tf-error');return;
        }
        const changes=[];
        for(let rowIndex=0;rowIndex<pastedRows.length;rowIndex++){
          const row=rows[start+rowIndex],values=pastedRows[rowIndex];
          const fields=paired?['pageNo','problemNo']:[input.dataset.field];
          for(let column=0;column<fields.length;column++){
            const field=row.querySelector(`.tf-value[data-field="${fields[column]}"]`);
            if(!field||field.disabled){
              status(t('timestampMaker.pasteTooManyRows'),'tf-error');return;
            }
            const value=values[column]??'';
            if(value.length>40){
              status(t('timestampMaker.pasteInvalid'),'tf-error');return;
            }
            changes.push({field,value});
          }
        }
        changes.forEach(({field,value})=>{
          field.value=value;
          field.dispatchEvent(new Event('input',{bubbles:true}));
        });
        status(t('timestampMaker.valuesPasted'),'tf-success');
        showCopyFeedback(t('timestampMaker.valuesPasted'),'tf-success');
      });
      const hideSuggestions=()=>{
        removePositionListeners();removePositionListeners=()=>{};
        suggestionBox.hidden=true;suggestionBox.replaceChildren();suggestionBox.style.left='';suggestionBox.style.top='';fieldWrap.append(suggestionBox);
      };
      const positionSuggestions=()=>{
        const field=input.getBoundingClientRect(),box=suggestionBox.getBoundingClientRect();
        const left=Math.min(Math.max(8,field.left-16),Math.max(8,innerWidth-box.width-8));
        const below=field.bottom+5,top=below+box.height<=innerHeight-8?below:Math.max(8,field.top-box.height-5);
        suggestionBox.style.left=`${left}px`;suggestionBox.style.top=`${top}px`;
      };
      input.addEventListener('focus',()=>{
        hideSuggestions();
        const lastEnteredInteger=lastEnteredIntegers[input.dataset.field];
        if(lastEnteredInteger===null)return;
        const arrows=document.createElement('span');arrows.className='tf-suggestion-arrows';arrows.setAttribute('aria-label','Arrow keys navigate fields');
        for(const key of ['↑','←','↓','→']){const keycap=document.createElement('kbd');keycap.textContent=key;arrows.append(keycap)}
        suggestionBox.append(arrows);
        for(const [index,value] of [lastEnteredInteger,lastEnteredInteger+1].filter(Number.isSafeInteger).entries()){
          const suggestion=document.createElement('button');
          suggestion.type='button';suggestion.className='tf-suggestion';suggestion.title=`Use ${value} (${['A','D'][index]})`;suggestion.setAttribute('aria-label',`Use suggestion ${value} with ${['A','D'][index]}`);
          const label=document.createElement('span');label.className='tf-suggestion-value';label.textContent=String(value);
          const shortcut=document.createElement('kbd');shortcut.className='tf-suggestion-key';shortcut.textContent=['A','D'][index];
          suggestion.append(label,shortcut);
          suggestion.addEventListener('pointerdown',event=>event.preventDefault());
          suggestion.addEventListener('click',()=>{
            input.value=String(value);
            input.dispatchEvent(new Event('input',{bubbles:true}));
            hideSuggestions();
          });
          suggestionBox.append(suggestion);
        }
        document.body.append(suggestionBox);
        suggestionBox.hidden=false;
        positionSuggestions();
        window.addEventListener('scroll',positionSuggestions,true);window.addEventListener('resize',positionSuggestions);
        removePositionListeners=()=>{window.removeEventListener('scroll',positionSuggestions,true);window.removeEventListener('resize',positionSuggestions)};
      });
      input.addEventListener('keydown',event=>{
        if(suggestionBox.hidden||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!/^[ad]$/i.test(event.key))return;
        const suggestion=suggestionBox.querySelectorAll('button')['ad'.indexOf(event.key.toLowerCase())];
        if(suggestion){event.preventDefault();suggestion.click()}
      });
      input.addEventListener('keydown',event=>{
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
        if(event.key==='ArrowLeft'&&(input.selectionStart!==0||input.selectionEnd!==0))return;
        if(event.key==='ArrowRight'&&(input.selectionStart!==input.value.length||input.selectionEnd!==input.value.length))return;
        let next;
        if(event.key==='ArrowUp'||event.key==='ArrowDown'){
          const rows=visibleRows(),rowIndex=rows.indexOf(input.closest('.tf-asset'));
          next=rows[rowIndex+(event.key==='ArrowUp'?-1:1)]?.querySelector(`.tf-value[data-field="${input.dataset.field}"]:not(:disabled)`);
        }else{
          const visibleInputs=visibleRows().flatMap(row=>[...row.querySelectorAll('.tf-value:not(:disabled)')]);
          const inputIndex=visibleInputs.indexOf(input);
          next=visibleInputs[inputIndex+(event.key==='ArrowLeft'?-1:1)];
        }
        if(next){event.preventDefault();next.focus()}
      });
      input.addEventListener('blur',()=>setTimeout(()=>{if(!suggestionBox.contains(document.activeElement))hideSuggestions()},0));
      input.addEventListener('input',()=>{
        const typed=input.value.trim();
        lastEnteredIntegers[input.dataset.field]=/^[+-]?\d+$/.test(typed)&&Number.isSafeInteger(Number(typed))?Number(typed):null;
        hideSuggestions();
        const assetIndex=Number(input.dataset.index);
        assets[assetIndex][input.dataset.field]=input.value;
        assets[assetIndex][`${input.dataset.field}Prefilled`]=false;
        input.classList.remove('tf-prefilled');
        input.closest('.tf-input-shell').classList.toggle('tf-input-empty',!input.value.trim());
        updatePending();
      });
      input.addEventListener('keydown',event=>{
        if(event.key!=='Tab')return;
        const next=valueInputs[index+(event.shiftKey?-1:1)];
        if(next){event.preventDefault();next.focus()}
      });
    });
    $editor.querySelectorAll('[data-select-row]:not(:disabled)').forEach(input=>input.addEventListener('change',updatePending));
    $editor.querySelector('[data-action=confirm]').onclick=applyChanges;
    setupCurrentPosition();
    applyDateSelection();
    updatePending();
  }
  function setupCurrentPosition(){
    ghostController?.abort();
    ghostController=new AbortController();
    const {signal}=ghostController;
    const ghostPath=$editor.querySelector('[data-ghost-path]'),treeRoot=$editor.querySelector('.tf-tree');
    const levels=['part','section','mission','subsection'];
    const headingSelector=levels.map(level=>`details.tf-node.lc-level-${level}>summary`).join(',');
    let scrollRoot=root,headings=[],frame=0;
    const refresh=()=>{
      scrollRoot=[root,$editor.closest('.tool')].find(element=>{
        if(!element)return false;
        const overflow=getComputedStyle(element).overflowY;
        return(overflow==='auto'||overflow==='scroll')&&element.scrollHeight>element.clientHeight+1;
      })||root;
      const bounds=scrollRoot.getBoundingClientRect(),scrollTop=scrollRoot.scrollTop;
      headings=[...treeRoot.querySelectorAll(headingSelector)].filter(heading=>heading.getClientRects().length).map(heading=>({heading,level:levels.find(level=>heading.parentElement.classList.contains(`lc-level-${level}`)),top:heading.getBoundingClientRect().top-bounds.top+scrollTop}));
    };
    const render=()=>{
      frame=0;
      if($editor.hidden)return;
      const bounds=scrollRoot.getBoundingClientRect(),marker=$editor.querySelector('.tf-scroll-ghost').getBoundingClientRect().bottom-bounds.top+12,threshold=scrollRoot.scrollTop+marker;
      let activeIndex=-1;
      for(let index=0;index<headings.length&&headings[index].top<=threshold;index++)activeIndex=index;
      const active={};
      for(let index=0;index<=activeIndex;index++){
        const {heading,level}=headings[index];
        active[level]=heading;
        for(const deeper of levels.slice(levels.indexOf(level)+1))delete active[deeper];
      }
      if(!active.part)active.part=headings.find(item=>item.level==='part')?.heading;
      ghostPath.replaceChildren();
      levels.forEach(level=>{
        const heading=active[level];
        if(!heading)return;
        const title=heading.querySelector('.lc-title')?.textContent||'';
        const badge=document.createElement('span');badge.className=`lc-lv lv-${level}`;badge.textContent=t(`learncraft.lv.${level}`);badge.title=title;badge.setAttribute('aria-label',`${t(`learncraft.lv.${level}`)}: ${title}`);
        const name=document.createElement('span');name.className='lc-ghost-title';name.textContent=title;name.title=title;
        ghostPath.append(badge,name);
      });
    };
    const update=()=>{if(!frame)frame=requestAnimationFrame(render)};
    const resize=()=>{refresh();update()};
    refreshGhostPosition=resize;
    [root,$editor.closest('.tool')].filter((element,index,list)=>element&&list.indexOf(element)===index).forEach(element=>element.addEventListener('scroll',update,{passive:true,signal}));
    window.addEventListener('resize',resize,{passive:true,signal});
    treeRoot.addEventListener('toggle',()=>{refresh();update()},true);
    refresh();update();
  }
  function updatePending(){
    const $pending=$editor.querySelector('[data-pending]'),$confirm=$editor.querySelector('[data-action=confirm]'),$stop=$editor.querySelector('[data-action=stop]');
    if(!$pending||!$confirm)return;
    if($stop)$stop.hidden=!busy;
    try{
      const selected=selectedIndices(),updates=selectedTimestampUpdates(assets,selected);
      $pending.textContent=updates.length?t('timestampMaker.pending',updates.length):selected.length?t('timestampMaker.noChanges'):t('timestampMaker.noSelection');
      $confirm.disabled=!updates.length||busy;
    }catch(error){$pending.textContent=error.message;$confirm.disabled=true}
  }
  function selectedIndices(){
    return [...$editor.querySelectorAll('[data-select-row]:checked')].filter(input=>!input.closest('.tf-asset')?.hidden).map(input=>Number(input.dataset.selectRow));
  }
  function requestStop(){
    if(!busy||!activeFillRequestId||stopRequested)return;
    stopRequested=true;
    const stopButton=$editor.querySelector('[data-action=stop]'),$result=$editor.querySelector('[data-result]');
    stopButton.disabled=true;stopButton.textContent=t('timestampMaker.stopping');
    $result.textContent=t('timestampMaker.stoppingAfterCurrent');
    window.postMessage({pl:'learncraft',id:`tfcancel-${++seq}-${Date.now()}`,action:'cancel',target:activeFillRequestId},target);
  }
  async function applyChanges(){
    if(busy)return;
    let groups,updates;
    try{
      groups=groupTimestampUpdates(assets,tree,selectedIndices());
      updates=groups.flat();
    }catch(error){status(error.message,'tf-error');return}
    if(!updates.length)return;
    if(!window.confirm(t('timestampMaker.confirmPrompt',updates.length)))return;
    busy=true;stopRequested=false;activeFillRequestId=null;
    const button=$editor.querySelector('[data-action=confirm]'),stopButton=$editor.querySelector('[data-action=stop]'),$result=$editor.querySelector('[data-result]');
    button.disabled=true;button.textContent=t('timestampMaker.working');
    stopButton.hidden=false;stopButton.disabled=false;stopButton.textContent=t('timestampMaker.stop');
    $result.hidden=false;$result.className='tf-result tf-working';$result.textContent=t('timestampMaker.workingSwitch',updates.length);
    try{
      const result=await ask('fill-timestamps',{tabId:activeTab.tabId,courseCode:activeTab.code,entries:updates,groups:groups.map(group=>group.map(entry=>entry.assetIndex)),subsectionAssetIndices:timestampGroupAssetIndices(assets,tree,groups)},300000,progress=>{
        if(stopRequested)return;
        if(progress?.phase==='asset'){
          $result.textContent=progress.state==='done'
            ?t('timestampMaker.progressDone',progress.current,progress.total,progress.title)
            :progress.state==='error'
              ?t('timestampMaker.progressError',progress.current,progress.total,progress.title)
              :t('timestampMaker.progressAsset',progress.current,progress.total,progress.title);
        }else if(progress?.phase==='start'){
          $result.textContent=t('timestampMaker.workingDetail',progress.total);
        }
      },id=>{activeFillRequestId=id});
      if(!result||!Array.isArray(result.results)||!Number.isInteger(result.updated)||result.updated<0||result.updated>updates.length)throw new Error('The extension returned an invalid update report.');
      if(result.results.length>updates.length)throw new Error('The extension returned an inconsistent update report.');
      const failures=result.results.filter(item=>!item.ok);
      if(failures.length+result.updated!==result.results.length)throw new Error('The extension returned an inconsistent update report.');
      if(result.state==='cancelled'){
        $result.className='tf-result tf-stopped';
        $result.textContent=t('timestampMaker.stopped',result.updated,updates.length);
        return;
      }
      const incomplete=result.results.length!==updates.length;
      $result.className=`tf-result ${failures.length||incomplete?'tf-error':'tf-success'}`;
      $result.textContent=failures.length||incomplete
        ?t('timestampMaker.partialResult',result.updated||0,updates.length,failures[0]?.message||t('timestampMaker.unknownError'))
        :t('timestampMaker.done',result.updated||0);
    }catch(error){
      $result.className='tf-result tf-error';$result.textContent=t('timestampMaker.failed',error.message||error);
    }finally{
      busy=false;stopRequested=false;activeFillRequestId=null;
      button.textContent=t('timestampMaker.confirm');stopButton.hidden=true;stopButton.disabled=false;stopButton.textContent=t('timestampMaker.stop');
      updatePending();
      $result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'end'});
    }
  }
  function renderTabs(rows,updateRequired=false){
    $courses.hidden=false;$editor.hidden=true;
    const windows=[...new Set(rows.map(tab=>tab.windowId))],courseTabs=rows.filter(tab=>tab.code);
    tabs=courseTabs;
    const tabsCount=`<div class="lc-line${updateRequired?' lc-tabs-count-locked':''}"><strong>${t('learncraft.tabsFound',rows.length,courseTabs.length)}</strong><span class="lc-grow"></span>${updateRequired?'':`<button class="btn" data-action="refresh">${t('learncraft.refresh')}</button>`}</div>`;
    if(!courseTabs.length){$courses.innerHTML=`${tabsCount}<p class="lc-p">${t('timestampMaker.noCourses')}</p>`}
    else $courses.innerHTML=`${tabsCount}<div class="lc-tablist">${courseTabs.map(tab=>{
      const state=tab.discarded?'asleep':tab.status!=='complete'?'loading':tab.probeError?'noAccess':tab.probe?.loggedIn===false?'login':!tab.probe?.hasCanvas?'notOverview':'ready';
      const isReady=!!tab.code&&state==='ready',canUse=isReady&&!updateRequired;
      const title=(tab.probe?.courseTitle||tab.title||tab.url||'').replace(/^\[[^\]]+\]\s*/,'');
      const loggedIn=tab.probe?.loggedIn,who=loggedIn===true?(tab.probe.email?t('learncraft.loggedInAs',esc(tab.probe.email)):t('learncraft.loggedIn')):loggedIn===false?t('learncraft.notLoggedIn'):t('learncraft.loginUnknown');
      const loginDot=loggedIn===true?'ok':loggedIn===false?'bad':'';
      return`<div class="lc-tab${isReady?'':' off'}${updateRequired?' update-locked':''}"${updateRequired?' aria-disabled="true"':''}><div class="lc-tab-main"><div class="lc-code">${esc(tab.code||'—')}</div><div class="lc-tab-info"><div class="lc-tab-title">${esc(title)}</div><div class="lc-tab-meta">${tab.probe?.kindLabel?`<span class="lc-chip">${esc(tab.probe.kindLabel)}</span>`:''}${windows.length>1?`<span class="lc-chip dim">${t('learncraft.window',windows.indexOf(tab.windowId)+1)}</span>`:''}${tab.active?`<span class="lc-chip dim">${t('learncraft.active')}</span>`:''}<span class="lc-who"><span class="lc-dot ${loginDot}" aria-hidden="true"></span>${who}</span></div></div></div><div class="lc-tab-act"><span class="lc-state ${canUse?'ok':''}">${updateRequired?t('golive.needUpdate'):t(`learncraft.state.${state}`)}</span><button class="btn primary" type="button" data-load="${tab.tabId}"${canUse&&!busy?'':' disabled'}>${t('timestampMaker.loadAssets')}</button></div></div>`;
    }).join('')}</div>`;
    $courses.querySelector('[data-action=refresh]')?.addEventListener('click',()=>refresh());
    $courses.querySelectorAll('[data-load]').forEach(button=>button.addEventListener('click',()=>loadAssets(Number(button.dataset.load),button)));
  }
  async function refresh(updateRequired=false){
    if(!extension||busy)return;
    $courses.hidden=false;
    $courses.innerHTML=`<div class="lc-line"><span class="lc-spin" aria-hidden="true"></span>${t('learncraft.listing')}</div>`;
    try{
      const result=await ask('list',{},20000);
      if(!Array.isArray(result))throw new Error('The extension returned an invalid tab list.');
      renderTabs(result,updateRequired);
      if(!updateRequired)clearStatus();
    }catch(error){
      const detail=t('learncraft.listFailureDetail',error.message||error);
      $courses.hidden=false;
      $courses.innerHTML=`<div class="warn">${detail}</div>`;
    }
  }
  async function loadAssets(tabId,button){
    if(busy)return;
    const tab=tabs.find(item=>item.tabId===tabId);
    if(!tab)return;
    busy=true;button.disabled=true;button.textContent=t('learncraft.reading');
    status(t('timestampMaker.loadingAssets',tab.code));
    try{
      const result=await ask('list-timestamp-assets',{tabId,courseCode:tab.code},300000);
      if(!result||result.ok!==true||!Array.isArray(result.assets)||!Array.isArray(result.tree)){
        throw new Error(result?.error||'The extension returned no asset list. Reload the extension and refresh this page.');
      }
      assets=flattenTimestampAssets(result);
      tree=normalizeTimestampTree(result,assets);
      if(!assets.length&&!tree.length)throw new Error(t('timestampMaker.noAssetsInCourse'));
      activeTab=tab;
      $courses.hidden=true;
      showEditor();
      status(t('timestampMaker.loaded',assets.length,tab.code));
      $editor.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    }catch(error){status(t('timestampMaker.loadFailed',error.message||error),'tf-error')}
    finally{busy=false;button.disabled=false;button.textContent=t('timestampMaker.loadAssets')}
  }
  async function activate(){
    if(busy)return;
    if(!$courses.hidden||!$editor.hidden){if(extension)checkCurrentVersion(extension);return}
    setExtensionState('checking');
    status(t('learncraft.checking'));
    const info=summarizeBridges(await pingAll());
    if(!info){extension=null;setExtensionState('missing');showMissing();return}
    if(info.duplicate){extension=null;setExtensionState('duplicate');showDuplicate(info);return}
    extension=info;
    checkCurrentVersion(info);
    if(older(info.version,EXT_MIN)){showOutdated(info.version);await refresh(true);return}
    await refresh();
  }
  root.__timestampMakerActivate=activate;
}

export const activate=()=>document.querySelector('.view[data-tool="timestamp-maker"]')?.__timestampMakerActivate?.();
