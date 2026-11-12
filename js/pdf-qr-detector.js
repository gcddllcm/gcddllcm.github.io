import {msg,track} from './util.js?v=3.7.0';
import {loadPdf,loadPdfjs,extractPdfImageObjects,imageObjectToCanvas} from './pdf-to-jpg.js?v=3.7.0';
import {mountGuide} from './instruction-panel.js?v=3.7.0';
import {t} from './i18n.js?v=3.7.0';

const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
let qrDecoderPromise=null;
const QR_SCAN_MAX_SIDE=1600;

const ICON_QR_FRAME='<path d="M4 11V6a2 2 0 0 1 2-2h5M21 4h5a2 2 0 0 1 2 2v5M28 21v5a2 2 0 0 1-2 2h-5M11 28H6a2 2 0 0 1-2-2v-5"/><rect x="10" y="10" width="4.5" height="4.5" rx=".8"/><rect x="17.5" y="10" width="4.5" height="4.5" rx=".8"/><rect x="10" y="17.5" width="4.5" height="4.5" rx=".8"/><path d="M18 18h4v4h-4z"/>';
const svgAttrs='viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const ICON_DROP=`<svg ${svgAttrs}>${ICON_QR_FRAME}<path class="pdf-qr-scanline" d="M6 16h20"/></svg>`;
const ICON_EMPTY=`<svg ${svgAttrs}>${ICON_QR_FRAME}</svg>`;
const ICON_LOCK='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';

function formatDuration(seconds){
  const whole=Math.max(0,Math.floor(seconds)),hours=Math.floor(whole/3600),minutes=Math.floor(whole%3600/60),remaining=whole%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(remaining).padStart(2,'0')}`:`${minutes}:${String(remaining).padStart(2,'0')}`;
}

function appendPageLinks(container,pages,pdfUrl){
  [...pages].sort((a,b)=>a-b).forEach((page,index)=>{
    if(index)container.append(document.createTextNode(', '));
    if(!pdfUrl){container.append(document.createTextNode(String(page)));return}
    const link=document.createElement('a');
    link.href=`${pdfUrl}#page=${page}`;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent=String(page);link.setAttribute('aria-label',t('pdfQr.openPage',page));
    container.append(link);
  });
}

function qrLink(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'||url.protocol==='http:'?url.href:null;
  }catch{return null}
}

function qrPreview(bitmap,bounds){
  const padding=Math.ceil(Math.max(bounds.width,bounds.height)*.04);
  const x=Math.max(0,Math.floor(bounds.x-padding)),y=Math.max(0,Math.floor(bounds.y-padding));
  const right=Math.min(bitmap.width,Math.ceil(bounds.x+bounds.width+padding));
  const bottom=Math.min(bitmap.height,Math.ceil(bounds.y+bounds.height+padding));
  const canvas=document.createElement('canvas');
  const validBounds=right>x&&bottom>y;
  canvas.width=validBounds?right-x:bitmap.width;canvas.height=validBounds?bottom-y:bitmap.height;
  const context=canvas.getContext('2d');
  if(!context)throw new Error(t('pdfQr.canvasError'));
  if(validBounds)context.drawImage(bitmap,x,y,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  else context.drawImage(bitmap,0,0);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>{
    canvas.width=0;canvas.height=0;
    if(blob)resolve(blob);else reject(new Error(t('pdfQr.encodeError')));
  },'image/png'));
}

async function detectorForQr(){
  if(typeof globalThis.BarcodeDetector==='function'&&typeof globalThis.BarcodeDetector.getSupportedFormats==='function'){
    try{
      const formats=await globalThis.BarcodeDetector.getSupportedFormats();
      if(formats.includes('qr_code'))return new globalThis.BarcodeDetector({formats:['qr_code']});
    }catch(error){console.warn('Native QR detection is unavailable; using the local QR decoder:',error)}
  }
  if(!qrDecoderPromise){
    qrDecoderPromise=import('./vendor/jsqr.js?v=3.7.0').then(()=>{
      if(typeof globalThis.jsQR!=='function')throw new Error(t('pdfQr.decoderUnavailable'));
      return globalThis.jsQR;
    }).catch(error=>{qrDecoderPromise=null;throw error});
  }
  const decode=await qrDecoderPromise;
  return {
    async detect(bitmap){
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error(t('pdfQr.canvasError'));
      try{
        context.drawImage(bitmap,0,0);
        const pixels=context.getImageData(0,0,bitmap.width,bitmap.height);
        const result=decode(pixels.data,bitmap.width,bitmap.height,{inversionAttempts:'dontInvert'})
          ||decode(pixels.data,bitmap.width,bitmap.height,{inversionAttempts:'onlyInvert'});
        if(!result)return [];
        const points=[result.location.topLeftCorner,result.location.topRightCorner,result.location.bottomLeftCorner,result.location.bottomRightCorner];
        const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
        const left=Math.min(...xs),top=Math.min(...ys);
        return [{rawValue:result.data,boundingBox:{x:left,y:top,width:Math.max(...xs)-left,height:Math.max(...ys)-top}}];
      }finally{canvas.width=0;canvas.height=0}
    }
  };
}

function createQrCard(code,includePages,index,pdfUrl){
  const card=document.createElement('article');card.className='pdf-qr-card';card.style.setProperty('--i',index);
  const download=document.createElement('a');download.className='pdf-qr-download';download.href=code.previewUrl;
  download.download=`qr-code-${index+1}.png`;download.setAttribute('aria-label',t('pdfQr.downloadCode',index+1));
  download.title=t('pdfQr.downloadCode',index+1);
  download.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v3h14v-3"/></svg>';
  const link=qrLink(code.value);
  const preview=document.createElement('div');preview.className='pdf-qr-preview';
  const image=document.createElement('img');image.src=code.previewUrl;image.decoding='async';
  if(link){
    // The text link below is the accessible one; the image link is a larger mouse/touch target only.
    const anchor=document.createElement('a');anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';
    anchor.tabIndex=-1;anchor.setAttribute('aria-hidden','true');image.alt='';anchor.append(image);preview.append(anchor);
  }else{image.alt=t('pdfQr.codeImage');preview.append(image)}
  const details=document.createElement('div');details.className='pdf-qr-details';
  const kind=document.createElement('span');kind.className='pdf-qr-kind';kind.textContent=link?t('pdfQr.kindLink'):t('pdfQr.kindText');
  const value=document.createElement('p');value.className='pdf-qr-value';
  if(link){
    const anchor=document.createElement('a');anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=code.value;
    const hint=document.createElement('span');hint.className='pdf-qr-sr';hint.textContent=` ${t('pdfQr.opensNewTab')}`;anchor.append(hint);
    value.append(anchor);
  }else value.textContent=code.value;
  details.append(kind,value);
  if(includePages){
    const pages=document.createElement('p');pages.className='pdf-qr-pages';
    const label=document.createElement('span'),list=document.createElement('strong');
    label.textContent=t('pdfQr.pagesLabel',code.pages.size);appendPageLinks(list,code.pages,pdfUrl);
    pages.append(label,list);details.append(pages);
  }
  card.append(download,preview,details);return card;
}

// kind: 'waiting' (before a scan), 'scanning' (during one), 'none' (scan finished without codes)
function renderEmpty(container,kind){
  container.replaceChildren();container.classList.add('is-empty');
  const empty=document.createElement('div');empty.className='pdf-qr-empty';empty.dataset.kind=kind;
  const icon=document.createElement('span');icon.className='pdf-qr-empty-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=ICON_EMPTY;
  const title=document.createElement('p');title.className='pdf-qr-empty-title';
  const hint=document.createElement('p');hint.className='pdf-qr-empty-hint';
  const copy={waiting:['pdfQr.waitingTitle','pdfQr.waitingHint'],scanning:['pdfQr.scanningTitle','pdfQr.scanningHint'],none:['pdfQr.noCodes','pdfQr.noCodesHint']}[kind];
  title.textContent=t(copy[0]);hint.textContent=t(copy[1]);
  empty.append(icon,title,hint);container.append(empty);
}

export function renderResults(container,codes,mode,pdfUrl=null){
  if(!codes.length){renderEmpty(container,'none');return}
  container.replaceChildren();container.classList.remove('is-empty');
  const fragment=document.createDocumentFragment();
  let index=0;
  if(mode==='page'){
    const pages=new Map();
    for(const code of codes){
      for(const page of code.pages){
        if(!pages.has(page))pages.set(page,[]);
        pages.get(page).push(code);
      }
    }
    for(const [page,codesOnPage] of [...pages].sort(([a],[b])=>a-b)){
      const group=document.createElement('section');group.className='pdf-qr-page-group';
      const heading=document.createElement('h3');
      const name=pdfUrl?document.createElement('a'):document.createElement('span');
      name.textContent=t('pdfQr.pageHeading',page);
      if(pdfUrl){name.href=`${pdfUrl}#page=${page}`;name.target='_blank';name.rel='noopener noreferrer';name.setAttribute('aria-label',t('pdfQr.openPage',page))}
      const count=document.createElement('small');count.textContent=t('pdfQr.codeCount',codesOnPage.length);
      heading.append(name,count);
      const cards=document.createElement('div');cards.className='pdf-qr-page-codes';
      for(const code of codesOnPage)cards.append(createQrCard(code,false,index++,pdfUrl));
      group.append(heading,cards);fragment.append(group);
    }
  }else{
    for(const code of codes)fragment.append(createQrCard(code,true,index++,pdfUrl));
  }
  container.append(fragment);
  // A scrollable value must be reachable by keyboard (WCAG 2.1.1).
  requestAnimationFrame(()=>{
    for(const value of container.querySelectorAll('.pdf-qr-value')){
      if(value.scrollHeight>value.clientHeight+1){value.tabIndex=0;value.setAttribute('role','group');value.setAttribute('aria-label',t('pdfQr.valueScroll'))}
    }
  });
}

export function mount(root){
  root.innerHTML=`<div class="tool-layout wide-tool"><div class="tool wideview pdf-qr-tool is-pristine">
    <h1 class="tool-title-sr">${t('tool.pdfQrDetector')}</h1>
    <input type="file" data-q="file" accept=".pdf,application/pdf" hidden>
    <div class="pdf-qr-drop" data-q="drop">
      <span class="pdf-qr-drop-icon" aria-hidden="true">${ICON_DROP}</span>
      <div class="pdf-qr-drop-copy"><p class="pdf-qr-drop-title" data-q="drop-title">${t('pdfQr.dropTitle')}</p><p class="pdf-qr-drop-hint">${t('pdfQr.dropHint')}</p></div>
      <button type="button" class="btn primary" data-q="browse">${t('pdfQr.browse')}</button>
      <p class="pdf-qr-privacy">${ICON_LOCK}<span>${t('pdfQr.privacy')}</span></p>
    </div>
    <div class="pdf-qr-status-card" data-state="idle">
      <span class="pdf-qr-state" aria-hidden="true"></span>
      <div class="pdf-qr-status-body">
        <p class="pdf-qr-file" data-q="filename" hidden></p>
        <div class="pdf-qr-status" data-q="status" role="status" aria-live="polite" aria-atomic="true">${t('pdfQr.ready')}</div>
        <progress data-q="progress" max="1" hidden aria-label="${t('pdfQr.progress')}"></progress>
        <div class="pdf-qr-meta"><span class="pdf-qr-timing" data-q="timing" hidden></span><span data-q="detail"></span></div>
      </div>
    </div>
    <div class="pdf-qr-panel">
      <div class="pdf-qr-results-head" data-q="results-head" hidden>
        <div class="pdf-qr-results-heading"><h2 class="pdf-qr-results-title" data-q="summary"></h2><p class="pdf-qr-results-note">${t('pdfQr.dedupNote')}</p></div>
        <div class="pdf-qr-view-tabs" data-q="view-tabs" role="group" aria-label="${t('pdfQr.viewBy')}" hidden><button type="button" class="btn active" data-q="view-qr" aria-pressed="true" disabled>${t('pdfQr.viewQr')}</button><button type="button" class="btn" data-q="view-page" aria-pressed="false" disabled>${t('pdfQr.viewPage')}</button></div>
      </div>
      <section class="pdf-qr-results is-empty" data-q="results" aria-label="${t('pdfQr.results')}"></section>
    </div>
  </div></div>`;
  mountGuide(root.querySelector('.tool-layout'),'pdfQrDetector');
  const q=key=>root.querySelector(`[data-q="${key}"]`),results=q('results'),drop=q('drop'),tool=root.querySelector('.pdf-qr-tool'),statusCard=root.querySelector('.pdf-qr-status-card');
  let busy=false,previewUrls=[],detectedCodes=[],resultMode='qr',sourcePdfUrl=null;
  renderEmpty(results,'waiting');
  function clearResults(kind='waiting'){
    for(const url of previewUrls)URL.revokeObjectURL(url);
    previewUrls=[];
    if(sourcePdfUrl){URL.revokeObjectURL(sourcePdfUrl);sourcePdfUrl=null}
    renderEmpty(results,kind);
  }
  function setStatus(message){q('status').textContent=message}
  function setDetail(message){q('detail').textContent=message}
  function setState(state){statusCard.dataset.state=state}
  function setCompact(compact){
    drop.classList.toggle('is-compact',compact);
    q('drop-title').textContent=t(compact?'pdfQr.dropTitleAgain':'pdfQr.dropTitle');
    q('browse').textContent=t(compact?'pdfQr.browseAgain':'pdfQr.browse');
    q('browse').classList.toggle('primary',!compact);
  }
  // end: '' while running, 'done' when finished, 'stopped' after an error
  function showTiming(startedAt,currentPage,totalPages,end=''){
    const elapsed=(performance.now()-startedAt)/1000,elapsedText=formatDuration(elapsed);
    q('timing').textContent=end==='done'?t('pdfQr.timingDone',elapsedText)
      :end==='stopped'?t('pdfQr.timingStopped',elapsedText)
      :currentPage?t('pdfQr.timingEta',elapsedText,formatDuration(Math.max(1,Math.ceil(elapsed/currentPage*(totalPages-currentPage+1)))))
      :t('pdfQr.timingEstimating',elapsedText);
  }
  function paintViewButtons(mode){
    q('view-qr').classList.toggle('active',mode==='qr');q('view-page').classList.toggle('active',mode==='page');
    q('view-qr').setAttribute('aria-pressed',String(mode==='qr'));q('view-page').setAttribute('aria-pressed',String(mode==='page'));
  }
  function setResultMode(mode){
    resultMode=mode;paintViewButtons(mode);
    renderResults(results,detectedCodes,resultMode,sourcePdfUrl);
  }
  q('view-qr').onclick=()=>setResultMode('qr');
  q('view-page').onclick=()=>setResultMode('page');
  async function scanPdf(file){
    if(busy)return;
    if(!file||!/\.pdf$/i.test(file.name)){await msg(t('pdfQr.title'),t('pdfQr.invalidFile'),'warning');return}
    tool.classList.remove('is-pristine');
    busy=true;clearResults('scanning');detectedCodes=[];resultMode='qr';paintViewButtons('qr');
    q('results-head').hidden=true;q('view-tabs').hidden=true;q('view-qr').disabled=true;q('view-page').disabled=true;
    q('file').disabled=true;q('browse').disabled=true;
    drop.classList.add('is-busy');setCompact(true);results.setAttribute('aria-busy','true');
    q('filename').textContent=file.name;q('filename').title=file.name;q('filename').hidden=false;
    setState('busy');setDetail('');
    q('progress').removeAttribute('value');q('progress').hidden=false;
    const startedAt=performance.now();let currentPage=0,totalPages=0,finished=false;
    q('timing').hidden=false;showTiming(startedAt,currentPage,totalPages);
    const timer=setInterval(()=>showTiming(startedAt,currentPage,totalPages,finished?'done':''),250);
    setStatus(t('pdfQr.loading',file.name));
    let loaded=null;
    try{
      sourcePdfUrl=URL.createObjectURL(file);
      const detector=await detectorForQr();
      loaded=await loadPdf(file);
      totalPages=loaded.document.numPages;q('progress').max=totalPages;
      setStatus(t('pdfQr.scanning'));
      const codes=new Map(),imageCodeValues=new Map();
      let imageCount=0;
      const pdfjs=await loadPdfjs();
      const {images,failures}=await extractPdfImageObjects(loaded.document,pdfjs,page=>{
        currentPage=page;q('progress').value=page;setDetail(t('pdfQr.readingPage',page,totalPages));
      },async(entry,page)=>{
        const priorCodes=imageCodeValues.get(entry.key);
        if(priorCodes){
          for(const value of priorCodes)codes.get(value)?.pages.add(page);
          return;
        }
        imageCount++;
        setDetail(t('pdfQr.checkingImage',imageCount,page));
        let canvas=null;const foundValues=[];
        try{
          canvas=imageObjectToCanvas(entry.image,pdfjs,{maxSide:QR_SCAN_MAX_SIDE,maxPixels:QR_SCAN_MAX_SIDE*QR_SCAN_MAX_SIDE});
          const detections=await detector.detect(canvas);
          for(const detection of detections){
            if(!detection.rawValue)continue;
            let code=codes.get(detection.rawValue);
            if(!code){
              const bounds=detection.boundingBox||{x:0,y:0,width:canvas.width,height:canvas.height};
              const preview=await qrPreview(canvas,bounds);
              code={value:detection.rawValue,pages:new Set(),previewUrl:URL.createObjectURL(preview)};
              previewUrls.push(code.previewUrl);codes.set(code.value,code);
            }
            code.pages.add(page);foundValues.push(detection.rawValue);
          }
          imageCodeValues.set(entry.key,[...new Set(foundValues)]);
        }catch(error){
          imageCodeValues.set(entry.key,[...new Set(foundValues)]);
          throw error;
        }finally{if(canvas){canvas.width=0;canvas.height=0}}
      });
      const found=[...codes.values()];
      detectedCodes=found;
      const head=q('results-head');
      head.hidden=!found.length;q('view-tabs').hidden=!found.length;q('view-qr').disabled=!found.length;q('view-page').disabled=!found.length;
      if(found.length)q('summary').textContent=t('pdfQr.summary',found.length,new Set(found.flatMap(code=>[...code.pages])).size);
      renderResults(results,detectedCodes,resultMode,sourcePdfUrl);
      setDetail('');
      if(!imageCount){
        setStatus(failures.length?t('pdfQr.imagesFailed'):t('pdfQr.noImages'));setState(failures.length?'error':'empty');
      }else if(!found.length){
        setStatus(failures.length?t('pdfQr.noneWithErrors',failures.length):t('pdfQr.noneFound',imageCount));setState(failures.length?'warn':'empty');
      }else{
        setStatus(t('pdfQr.found',found.length));setState('done');
        track('pdf-qr-detector/scan','PDF embedded QR detection');
      }
      finished=true;showTiming(startedAt,currentPage,totalPages,'done');
      if(failures.length&&found.length)await msg(t('pdfQr.title'),t('pdfQr.found',found.length),'success');
      if(!images.length&&failures.length)await msg(t('pdfQr.title'),t('pdfQr.imagesFailedDetails',failures.join('\n')),'warning');
    }catch(error){
      clearInterval(timer);showTiming(startedAt,currentPage,totalPages,'stopped');
      clearResults();
      detectedCodes=[];q('results-head').hidden=true;q('view-tabs').hidden=true;
      setDetail('');setState('error');
      setStatus(t('pdfQr.failed',error.message||error));
      await msg(t('pdfQr.title'),t('pdfQr.failed',error.message||error),'error');
    }finally{
      clearInterval(timer);
      if(!finished)showTiming(startedAt,currentPage,totalPages,'stopped');
      if(loaded)loaded.document.destroy().catch(error=>console.error('Could not release PDF document:',error));
      busy=false;q('file').disabled=false;q('browse').disabled=false;q('progress').hidden=true;
      drop.classList.remove('is-busy');results.removeAttribute('aria-busy');
    }
  }
  const browse=()=>{if(!busy)q('file').click()};
  // One handler on the zone: a click on the real "Choose PDF" button bubbles up here, so the picker opens once.
  drop.onclick=browse;
  // Space on the focused button must open the picker, not trigger the app-wide "next tool" shortcut.
  q('browse').addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation()});
  q('file').onchange=event=>{const file=event.target.files[0];event.target.value='';if(file)scanPdf(file)};
  drop.addEventListener('dragover',event=>{if(!busy&&hasFiles(event))event.preventDefault()});
  root.addEventListener('dragover',event=>{if(hasFiles(event))event.preventDefault()});
  root.addEventListener('drop',event=>{
    if(!hasFiles(event))return;
    event.preventDefault();scanPdf([...event.dataTransfer.files][0]);
  });
  root.addEventListener('dragenter',event=>{if(!busy&&hasFiles(event))drop.classList.add('jpg-drop-hot')});
  root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))drop.classList.remove('jpg-drop-hot')});
  root.addEventListener('drop',()=>drop.classList.remove('jpg-drop-hot'));
}
