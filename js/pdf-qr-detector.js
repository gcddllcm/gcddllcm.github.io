import {msg,track} from './util.js?v=3.7.1';
import {loadPdf,loadPdfjs,extractPdfImageObjects,imageObjectToCanvas} from './pdf-to-jpg.js?v=3.7.1';
import {mountGuide} from './instruction-panel.js?v=3.7.1';
import {t} from './i18n.js?v=3.7.1';

const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
let qrDecoderPromise=null;
const QR_SCAN_MAX_SIDE=1600;
const QR_PAGE_RENDER_MAX_SIDE=1800;
const QR_WORKER_LIMIT=4;

function createQrWorkerPool(){
  if(typeof Worker!=='function')return null;
  const coreCount=Number.isInteger(navigator.hardwareConcurrency)?navigator.hardwareConcurrency:2;
  const size=Math.max(1,Math.min(QR_WORKER_LIMIT,coreCount-1));
  const workers=[],idle=[],queue=[],pending=new Map();
  let sequence=0,closed=false;
  function pump(){
    while(!closed&&idle.length&&queue.length){
      const request=queue.shift(),worker=idle.pop(),id=++sequence;
      pending.set(id,{...request,worker});worker._taskId=id;
      try{worker.postMessage({id,width:request.width,height:request.height,data:request.data},[request.data.buffer])}
      catch(error){pending.delete(id);worker._taskId=null;idle.push(worker);request.reject(error)}
    }
  }
  try{
    for(let index=0;index<size;index++){
      const worker=new Worker(new URL('./pdf-qr-worker.js?v=3.7.1',import.meta.url),{type:'module'});
      worker.onmessage=event=>{
        const {id,ok,detections,error}=event.data,request=pending.get(id);
        if(!request)return;
        pending.delete(id);worker._taskId=null;idle.push(worker);
        if(ok)request.resolve(detections);else request.reject(new Error(error||'QR worker failed'));
        pump();
      };
      worker.onerror=event=>{
        const id=worker._taskId,request=pending.get(id);
        if(request){pending.delete(id);request.reject(new Error(event.message||'QR worker failed'))}
        worker.terminate();
        const workerIndex=workers.indexOf(worker);if(workerIndex>=0)workers.splice(workerIndex,1);
        const idleIndex=idle.indexOf(worker);if(idleIndex>=0)idle.splice(idleIndex,1);
        if(!workers.length){
          for(const request of queue.splice(0))request.reject(new Error('QR workers are unavailable'));
        }
        pump();
      };
      workers.push(worker);idle.push(worker);
    }
  }catch(error){
    for(const worker of workers)worker.terminate();
    console.warn('QR workers are unavailable; using the main thread:',error);
    return null;
  }
  return {
    get size(){return workers.length},
    decode(data,width,height){
      if(closed||!workers.length)return Promise.reject(new Error('QR workers are unavailable'));
      return new Promise((resolve,reject)=>{queue.push({data,width,height,resolve,reject});pump()});
    },
    destroy(){
      closed=true;
      for(const request of pending.values())request.reject(new Error('QR worker pool was closed'));
      for(const request of queue)request.reject(new Error('QR worker pool was closed'));
      pending.clear();queue.length=0;
      for(const worker of workers)worker.terminate();
      workers.length=0;idle.length=0;
    }
  };
}

function normalizeDetectionBounds(bounds,canvas){
  if(!bounds||(!Number.isFinite(bounds.x)&&!Number.isFinite(bounds.y)&&!Number.isFinite(bounds.width)&&!Number.isFinite(bounds.height))){
    return {x:0,y:0,width:canvas.width,height:canvas.height};
  }
  const x=Number.isFinite(bounds.x)?bounds.x:0;
  const y=Number.isFinite(bounds.y)?bounds.y:0;
  const width=Number.isFinite(bounds.width)&&bounds.width>0?bounds.width:Math.max(1,canvas.width);
  const height=Number.isFinite(bounds.height)&&bounds.height>0?bounds.height:Math.max(1,canvas.height);
  return {x,y,width,height};
}

async function renderPdfPageCanvas(pdfDocument,pageNumber){
  const page=await pdfDocument.getPage(pageNumber);
  let canvas=null,completed=false;
  try{
    const viewport=page.getViewport({scale:1});
    const maxDimension=Math.max(viewport.width,viewport.height);
    const scale=QR_PAGE_RENDER_MAX_SIDE/maxDimension;
    const renderViewport=page.getViewport({scale});
    canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(renderViewport.width));
    canvas.height=Math.max(1,Math.ceil(renderViewport.height));
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error(t('pdfQr.canvasError'));
    context.fillStyle='#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:context,viewport:renderViewport}).promise;
    completed=true;
    return canvas;
  }finally{
    page.cleanup();
    if(!completed&&canvas){canvas.width=0;canvas.height=0}
  }
}

async function addDetectedQr(detection,canvas,pageNumber,codes,previewUrls){
  const rawValue=detection?.rawValue||detection?.data;
  if(!rawValue)return;
  let code=codes.get(rawValue);
  if(!code){
    const bounds=normalizeDetectionBounds(detection.boundingBox,canvas);
    const preview=await qrPreview(canvas,bounds);
    code={value:rawValue,pages:new Set(),previewUrl:URL.createObjectURL(preview)};
    previewUrls.push(code.previewUrl);
    codes.set(code.value,code);
  }
  code.pages.add(pageNumber);
}

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
  let nativeDetector=null;
  if(typeof globalThis.BarcodeDetector==='function'&&typeof globalThis.BarcodeDetector.getSupportedFormats==='function'){
    try{
      const formats=await globalThis.BarcodeDetector.getSupportedFormats();
      if(formats.includes('qr_code'))nativeDetector=new globalThis.BarcodeDetector({formats:['qr_code']});
    }catch(error){console.warn('Native QR detection is unavailable; using the local QR decoder:',error)}
  }
  const workerPool=createQrWorkerPool();
  function decodePixels(decode,data,width,height){
    const result=decode(data,width,height,{inversionAttempts:'attemptBoth'});
    if(!result)return [];
    const points=[result.location.topLeftCorner,result.location.topRightCorner,result.location.bottomLeftCorner,result.location.bottomRightCorner];
    const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
    const left=Math.min(...xs),top=Math.min(...ys);
    return [{rawValue:result.data,boundingBox:{x:left,y:top,width:Math.max(...xs)-left,height:Math.max(...ys)-top}}];
  }
  async function decodeWithJsQr(bitmap){
    if(!qrDecoderPromise){
      qrDecoderPromise=import('./vendor/jsqr.js?v=3.7.1').then(()=>{
        if(typeof globalThis.jsQR!=='function')throw new Error(t('pdfQr.decoderUnavailable'));
        return globalThis.jsQR;
      }).catch(error=>{qrDecoderPromise=null;throw error});
    }
    const decode=await qrDecoderPromise;
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error(t('pdfQr.canvasError'));
    try{
      context.drawImage(bitmap,0,0);
      const pixels=context.getImageData(0,0,bitmap.width,bitmap.height);
      if(workerPool){
        try{return await workerPool.decode(pixels.data,bitmap.width,bitmap.height)}
        catch(error){
          console.warn('QR worker decoding failed; retrying on the main thread:',error);
          return decodePixels(decode,context.getImageData(0,0,bitmap.width,bitmap.height).data,bitmap.width,bitmap.height);
        }
      }
      return decodePixels(decode,pixels.data,bitmap.width,bitmap.height);
    }finally{canvas.width=0;canvas.height=0}
  }
  return {
    get concurrency(){return Math.max(1,workerPool?.size||1)},
    destroy(){workerPool?.destroy()},
    async detect(bitmap){
      if(nativeDetector){
        try{
          const detections=await nativeDetector.detect(bitmap);
          if(detections.length)return detections;
        }catch(error){console.warn('Native QR detection failed; trying the local QR decoder:',error)}
      }
      return decodeWithJsQr(bitmap);
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
  function showTiming(startedAt,currentStep,totalSteps,end=''){
    const elapsed=(performance.now()-startedAt)/1000,elapsedText=formatDuration(elapsed);
    q('timing').textContent=end==='done'?t('pdfQr.timingDone',elapsedText)
      :end==='stopped'?t('pdfQr.timingStopped',elapsedText)
      :currentStep?t('pdfQr.timingEta',elapsedText,formatDuration(Math.max(1,Math.ceil(elapsed/currentStep*(totalSteps-currentStep+1)))))
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
    const startedAt=performance.now();let currentStep=0,totalPages=0,totalSteps=0,finished=false;
    q('timing').hidden=false;showTiming(startedAt,currentStep,totalSteps);
    const timer=setInterval(()=>showTiming(startedAt,currentStep,totalSteps,finished?'done':''),250);
    setStatus(t('pdfQr.loading',file.name));
    let loaded=null,detector=null;
    try{
      sourcePdfUrl=URL.createObjectURL(file);
      detector=await detectorForQr();
      loaded=await loadPdf(file);
      totalPages=loaded.document.numPages;totalSteps=totalPages*2;q('progress').max=totalSteps;
      setStatus(t('pdfQr.scanning'));
      setDetail(t('pdfQr.checkingImages'));
      const codes=new Map(),imageCodeValues=new Map();
      let imageCount=0,pageRenderFailures=0;
      const pdfjs=await loadPdfjs();
      const {images,failures}=await extractPdfImageObjects(loaded.document,pdfjs,page=>{
        currentStep=page;q('progress').value=currentStep;
      },async(entry,page)=>{
        const priorCodes=imageCodeValues.get(entry.key);
        if(priorCodes){
          for(const value of priorCodes)codes.get(value)?.pages.add(page);
          return;
        }
        imageCount++;
        let canvas=null;const foundValues=[];
        try{
          canvas=imageObjectToCanvas(entry.image,pdfjs,{maxSide:QR_SCAN_MAX_SIDE,maxPixels:QR_SCAN_MAX_SIDE*QR_SCAN_MAX_SIDE});
          const detections=await detector.detect(canvas);
          for(const detection of detections){
            const rawValue=detection.rawValue||detection.data;
            if(!rawValue)continue;
            let code=codes.get(rawValue);
            if(!code){
              const preview=await qrPreview(canvas,normalizeDetectionBounds(detection.boundingBox,canvas));
              code={value:rawValue,pages:new Set(),previewUrl:URL.createObjectURL(preview)};
              previewUrls.push(code.previewUrl);codes.set(code.value,code);
            }
            code.pages.add(page);foundValues.push(rawValue);
          }
          imageCodeValues.set(entry.key,[...new Set(foundValues)]);
        }catch(error){
          imageCodeValues.set(entry.key,[...new Set(foundValues)]);
          throw error;
        }finally{if(canvas){canvas.width=0;canvas.height=0}}
      });
      let renderedPages=0;
      const pageConcurrency=detector.concurrency;
      for(let firstPage=1;firstPage<=totalPages;firstPage+=pageConcurrency){
        const pageNumbers=Array.from({length:Math.min(pageConcurrency,totalPages-firstPage+1)},(_,index)=>firstPage+index);
        const scannedPages=await Promise.all(pageNumbers.map(async pageNumber=>{
          let pageCanvas=null;
          try{
            pageCanvas=await renderPdfPageCanvas(loaded.document,pageNumber);
            const detections=await detector.detect(pageCanvas);
            return {pageNumber,pageCanvas,detections};
          }catch(error){
            if(pageCanvas){pageCanvas.width=0;pageCanvas.height=0}
            return {pageNumber,error};
          }
        }));
        for(const scan of scannedPages){
          try{
            if(scan.error)throw scan.error;
            for(const detection of scan.detections||[]){
              await addDetectedQr(detection,scan.pageCanvas,scan.pageNumber,codes,previewUrls);
            }
          }catch(error){
            pageRenderFailures++;
            console.warn(`Page render scan failed on page ${scan.pageNumber}:`,error);
          }finally{
            if(scan.pageCanvas){scan.pageCanvas.width=0;scan.pageCanvas.height=0}
            renderedPages++;
            currentStep=totalPages+renderedPages;q('progress').value=currentStep;
            setDetail(t('pdfQr.renderingPage',scan.pageNumber,totalPages));
          }
        }
      }
      const found=[...codes.values()];
      detectedCodes=found;
      const head=q('results-head');
      head.hidden=!found.length;q('view-tabs').hidden=!found.length;q('view-qr').disabled=!found.length;q('view-page').disabled=!found.length;
      if(found.length)q('summary').textContent=t('pdfQr.summary',found.length,new Set(found.flatMap(code=>[...code.pages])).size);
      renderResults(results,detectedCodes,resultMode,sourcePdfUrl);
      setDetail('');
      if(found.length){
        setStatus(t('pdfQr.found',found.length));setState('done');
        if(pageRenderFailures)setDetail(t('pdfQr.renderFailures',pageRenderFailures));
        track('pdf-qr-detector/scan','PDF QR detection');
      }else if(pageRenderFailures){
        setStatus(t('pdfQr.renderFailures',pageRenderFailures));setState('warn');
      }else if(!imageCount){
        setStatus(failures.length?t('pdfQr.imagesFailed'):t('pdfQr.noImages'));setState(failures.length?'error':'empty');
      }else{
        setStatus(failures.length?t('pdfQr.noneWithErrors',failures.length):t('pdfQr.noneFound',imageCount));setState(failures.length?'warn':'empty');
      }
      finished=true;showTiming(startedAt,currentStep,totalSteps,'done');
      if(failures.length&&found.length)await msg(t('pdfQr.title'),t('pdfQr.found',found.length),'success');
      if(!images.length&&failures.length&&!found.length)await msg(t('pdfQr.title'),t('pdfQr.imagesFailedDetails',failures.join('\n')),'warning');
    }catch(error){
      clearInterval(timer);showTiming(startedAt,currentStep,totalSteps,'stopped');
      clearResults();
      detectedCodes=[];q('results-head').hidden=true;q('view-tabs').hidden=true;
      setDetail('');setState('error');
      setStatus(t('pdfQr.failed',error.message||error));
      await msg(t('pdfQr.title'),t('pdfQr.failed',error.message||error),'error');
    }finally{
      clearInterval(timer);
      if(!finished)showTiming(startedAt,currentStep,totalSteps,'stopped');
      if(loaded)loaded.document.destroy().catch(error=>console.error('Could not release PDF document:',error));
      detector?.destroy();
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
