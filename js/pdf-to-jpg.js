import {msg,track,countBucket} from './util.js?v=3.4.0';
import {download} from './nbtool.js?v=3.4.0-tool-workspace-v1';
import {jpgSetDpi} from './imgcore.js?v=3.4.0';
import {zipSync} from './vendor/fflate.js';
import {mountGuide} from './instruction-panel.js?v=3.4.0';
import {t} from './i18n.js?v=3.4.0';

const MAX_CANVAS_PIXELS=16000000;
const MAX_CANVAS_SIDE=8192;
const THUMBNAIL_SCALE=.25;
const PREVIEW_MAX_ZOOM=4;
let nextPageId=0,pdfjsPromise=null;
const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');

function loadPdfjs(){
  if(!pdfjsPromise){
    pdfjsPromise=import('./vendor/pdfjs/build/pdf.mjs').then(pdfjs=>{
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/build/pdf.worker.mjs',import.meta.url).href;
      return pdfjs;
    }).catch(error=>{pdfjsPromise=null;throw error});
  }
  return pdfjsPromise;
}

function safeStem(name){
  return name.replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').trim()||'document';
}

function uniqueStem(name,used){
  const stem=safeStem(name);
  let candidate=stem,index=2;
  while(used.has(candidate.toLocaleLowerCase()))candidate=`${stem} (${index++})`;
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function renderJpeg(page,scale,maxSide,dpi=0){
  const viewport=page.getViewport({scale});
  const factor=Math.min(1,Math.sqrt(MAX_CANVAS_PIXELS/(viewport.width*viewport.height)),maxSide/viewport.width,maxSide/viewport.height);
  const outputViewport=page.getViewport({scale:scale*factor});
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(outputViewport.width));
  canvas.height=Math.max(1,Math.ceil(outputViewport.height));
  const context=canvas.getContext('2d',{alpha:false});
  if(!context)throw new Error(t('pdfToJpg.canvasError'));
  context.fillStyle='#fff';
  context.fillRect(0,0,canvas.width,canvas.height);
  return page.render({canvasContext:context,viewport:outputViewport}).promise.then(()=>new Promise((resolve,reject)=>{
    canvas.toBlob(async blob=>{
      if(!blob){reject(new Error(t('pdfToJpg.encodeError')));return}
      try{
        const bytes=new Uint8Array(await blob.arrayBuffer());
        resolve(dpi?jpgSetDpi(bytes,dpi):bytes);
      }catch(error){reject(error)}
      finally{canvas.width=0;canvas.height=0}
    },'image/jpeg',1);
  }),error=>{canvas.width=0;canvas.height=0;throw error});
}

function blobBytes(blob){
  return new Promise((resolve,reject)=>{
    if(!blob){reject(new Error(t('pdfToJpg.imageEncodeError')));return}
    blob.arrayBuffer().then(buffer=>resolve(new Uint8Array(buffer)),reject);
  });
}

async function imageObjectToPng(image,pdfjs){
  const {width,height}=image||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_CANVAS_PIXELS||Math.max(width,height)>MAX_CANVAS_SIDE){
    throw new Error(t('pdfToJpg.imageSizeError'));
  }
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context)throw new Error(t('pdfToJpg.canvasError'));
  if(image.bitmap||image instanceof HTMLImageElement){
    context.drawImage(image.bitmap||image,0,0,width,height);
  }else if(image.data){
    const output=context.createImageData(width,height),source=image.data;
    if(image.kind===pdfjs.ImageKind.RGBA_32BPP||source.length===width*height*4){
      output.data.set(source.subarray?source.subarray(0,output.data.length):source.slice(0,output.data.length));
    }else if(image.kind===pdfjs.ImageKind.RGB_24BPP){
      for(let sourceIndex=0,targetIndex=0;sourceIndex<source.length&&targetIndex<output.data.length;sourceIndex+=3,targetIndex+=4){
        output.data[targetIndex]=source[sourceIndex];output.data[targetIndex+1]=source[sourceIndex+1];output.data[targetIndex+2]=source[sourceIndex+2];output.data[targetIndex+3]=255;
      }
    }else if(image.kind===pdfjs.ImageKind.GRAYSCALE_1BPP){
      for(let index=0;index<width*height;index++){
        const value=source[index>>3]&(128>>(index&7))?255:0,target=index*4;
        output.data[target]=output.data[target+1]=output.data[target+2]=value;output.data[target+3]=255;
      }
    }else throw new Error(t('pdfToJpg.imageFormatError'));
    context.putImageData(output,0,0);
  }else throw new Error(t('pdfToJpg.imageFormatError'));
  try{return await blobBytes(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')))}
  finally{canvas.width=0;canvas.height=0}
}

async function extractPdfImages(pdf,pdfjs,onProgress){
  const output={},usedObjects=new Set(),failures=[];
  let count=0;
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber);
    try{
      onProgress(pageNumber,pdf.numPages);
      const {fnArray,argsArray}=await page.getOperatorList(),refs=new Map(),inline=[];
      for(let index=0;index<fnArray.length;index++){
        const args=argsArray[index]||[],operation=fnArray[index];
        if(operation===pdfjs.OPS.paintImageXObject||operation===pdfjs.OPS.paintImageXObjectRepeat||operation===pdfjs.OPS.paintImageMaskXObjectRepeat){
          if(typeof args[0]==='string')refs.set(args[0],operation===pdfjs.OPS.paintImageMaskXObjectRepeat);
          else if(operation===pdfjs.OPS.paintImageMaskXObjectRepeat&&args[0]&&!args[0].kind)inline.push({...args[0],kind:pdfjs.ImageKind.GRAYSCALE_1BPP});
          else if(operation===pdfjs.OPS.paintImageMaskXObjectRepeat&&args[0])inline.push(args[0]);
        }else if(operation===pdfjs.OPS.paintInlineImageXObject||operation===pdfjs.OPS.paintImageMaskXObject||operation===pdfjs.OPS.paintInlineImageXObjectGroup){
          const image=args[0];
          inline.push(operation===pdfjs.OPS.paintImageMaskXObject&&image&&!image.kind?{...image,kind:pdfjs.ImageKind.GRAYSCALE_1BPP}:image);
        }else if(operation===pdfjs.OPS.paintImageMaskXObjectGroup){
          inline.push(...(args[0]||[]).map(image=>image?.kind?image:{...image,kind:pdfjs.ImageKind.GRAYSCALE_1BPP}));
        }
      }
      const viewport=page.getViewport({scale:1}),factor=Math.min(1,Math.sqrt(MAX_CANVAS_PIXELS/(viewport.width*viewport.height)),MAX_CANVAS_SIDE/viewport.width,MAX_CANVAS_SIDE/viewport.height),renderViewport=page.getViewport({scale:factor});
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(renderViewport.width));canvas.height=Math.max(1,Math.ceil(renderViewport.height));
      const context=canvas.getContext('2d');
      if(!context)throw new Error(t('pdfToJpg.canvasError'));
      try{await page.render({canvasContext:context,viewport:renderViewport}).promise}
      finally{canvas.width=0;canvas.height=0}
      const images=[...inline];
      for(const [id,isMask] of refs){
        const objects=id.startsWith('g_')?page.commonObjs:page.objs;
        if(objects.has(id)){
          const image=objects.get(id);
          images.push(isMask&&!image.kind?{...image,kind:pdfjs.ImageKind.GRAYSCALE_1BPP}:image);
        }
        else failures.push(t('pdfToJpg.imageUnavailable',pageNumber));
      }
      let pageImage=0;
      for(const [imageIndex,image] of images.entries()){
        if(!image||typeof image!=='object'||!('width'in image)||!('height'in image))continue;
        const key=image.id||`${pageNumber}:${imageIndex}`;
        if(usedObjects.has(key))continue;
        usedObjects.add(key);
        try{
          const bytes=await imageObjectToPng(image,pdfjs);
          pageImage++;count++;
          output[`page-${String(pageNumber).padStart(String(pdf.numPages).length,'0')}-image-${String(pageImage).padStart(3,'0')}.png`]=bytes;
        }catch(error){failures.push(`${t('jpg.pageLabel',pageNumber)}: ${error.message||error}`)}
      }
    }finally{page.cleanup()}
  }
  return {output,count,failures};
}

async function loadPdf(file){
  const pdfjs=await loadPdfjs();
  const loadingTask=pdfjs.getDocument({
    data:await file.arrayBuffer(),
    cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,
    cMapPacked:true,
    standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,
    useSystemFonts:true,
    isEvalSupported:false
  });
  let documentPdf=null;
  try{
    documentPdf=await loadingTask.promise;
    if(!documentPdf.numPages)throw new Error(t('pdfToJpg.noPages'));
    const pages=Array.from({length:documentPdf.numPages},(_,index)=>({id:++nextPageId,number:index+1,thumbnailUrl:null}));
    return {id:++nextPageId,file,document:documentPdf,pages};
  }catch(error){
    if(documentPdf)await documentPdf.destroy();else await loadingTask.destroy();
    throw error;
  }
}

export function mount(root){
  root.innerHTML=`<div class="tool-layout wide-tool"><div class="tool wideview jpg-tool pdf-jpg-tool">
    <h1 class="tool-title-sr">${t('tool.pdfToJpg')}</h1>
    <div class="pdf-jpg-modes" data-q="mode-tabs" data-active-mode="pages" role="tablist" aria-label="${t('pdfToJpg.modes')}"><button type="button" id="pdf-jpg-pages-tab" class="pdf-jpg-mode active" data-q="pages-tab" role="tab" aria-selected="true" aria-controls="pdf-jpg-pages-panel" tabindex="0">${t('pdfToJpg.pagesMode')}</button><button type="button" id="pdf-jpg-images-tab" class="pdf-jpg-mode" data-q="images-tab" role="tab" aria-selected="false" aria-controls="pdf-jpg-images-panel" tabindex="-1">${t('pdfToJpg.imagesMode')}</button></div>
    <div class="pdf-jpg-mode-stage">
    <div id="pdf-jpg-pages-panel" data-q="pages-mode" role="tabpanel" aria-labelledby="pdf-jpg-pages-tab" class="pdf-jpg-mode-content">
    <input type="file" data-q="file" accept=".pdf,application/pdf" multiple hidden>
    <div class="jpg-workspace">
      <div class="jpg-pages-column">
        <section class="jpg-panel jpg-pages-panel" data-q="drop" tabindex="0" role="region" aria-keyshortcuts="Enter Space" aria-disabled="false" aria-labelledby="pdf-jpg-pages-title">
          <div class="jpg-panel-head">
            <h2 id="pdf-jpg-pages-title">${t('pdfToJpg.pages')}</h2><span class="jpg-page-count" data-q="count"></span>
            <div class="jpg-panel-tools"><button type="button" class="btn jpg-mini" data-q="deselect-all" disabled>${t('jpg.clearSelection')}</button><button type="button" class="btn jpg-mini jpg-view-toggle" data-q="view-toggle" disabled aria-label="${t('jpg.switchToMediumIcons')}" title="${t('jpg.switchToMediumIcons')}" aria-pressed="false"></button></div>
          </div>
          <div class="jpg-list" data-q="pages"></div>
        </section>
        <div class="jpg-file-controls"><button type="button" class="btn" data-q="browse">${t('jpg.browse')}</button><button type="button" class="btn" data-q="clear" disabled>${t('jpg.removeAllFiles')}</button></div>
      </div>
      <div class="jpg-preview-column">
        <section class="jpg-panel jpg-preview-panel" aria-label="${t('jpg.previewTitle')}">
          <div class="jpg-panel-head"><h2 class="jpg-preview-title" data-q="preview-caption">${t('jpg.previewTitle')}</h2></div>
          <div class="jpg-preview" data-q="preview">${t('pdfToJpg.previewEmpty')}</div>
        </section>
        <div class="jpg-preview-controls"><button type="button" class="btn" data-q="zoom-out" aria-label="${t('creator.zoomOut')}">−</button><span data-q="zoom-label">${t('creator.fit')}</span><button type="button" class="btn" data-q="zoom-in" aria-label="${t('creator.zoomIn')}">+</button><button type="button" class="btn" data-q="zoom-fit">${t('creator.fit')}</button></div>
      </div>
    </div>
    <div class="jpg-footer">
      <div class="jpg-status-wrap"><progress data-q="progress" max="1" value="0" hidden aria-label="${t('a11y.progressPdf')}"></progress><div class="sub jpg-status" data-q="status" role="status" aria-live="polite" aria-atomic="true">${t('pdfToJpg.ready')}</div></div>
      <div class="jpg-export">
        <div class="quality-row"><label for="pdf-jpg-dpi">${t('pdfToJpg.dpi')}</label><select id="pdf-jpg-dpi" data-q="dpi"><option value="72">72 DPI</option><option value="150">150 DPI</option><option value="300" selected>300 DPI</option><option value="600">600 DPI</option></select></div>
        <button type="button" class="btn" data-q="selected" disabled>${t('jpg.exportSelectedCount',0)}</button>
        <button type="button" class="btn primary" data-q="all" disabled>${t('jpg.exportAll')}</button>
      </div>
    </div>
    </div>
    <section id="pdf-jpg-images-panel" data-q="images-mode" role="tabpanel" aria-labelledby="pdf-jpg-images-tab" class="pdf-image-mode" hidden>
      <input type="file" data-q="images-file" accept=".pdf,application/pdf" hidden>
      <div class="pdf-image-drop" data-q="images-drop" tabindex="0" role="region" aria-label="${t('pdfToJpg.imagesDrop')}">
        <div class="jpg-empty" data-q="images-name">${t('pdfToJpg.imagesDrop')}</div>
      </div>
      <div class="pdf-image-actions">
        <div class="jpg-status-wrap"><progress data-q="images-progress" max="1" value="0" hidden aria-label="${t('a11y.progressImages')}"></progress><div class="sub jpg-status" data-q="images-status" role="status" aria-live="polite" aria-atomic="true">${t('pdfToJpg.imagesReady')}</div></div>
        <button type="button" class="btn primary" data-q="images-download" disabled>${t('pdfToJpg.downloadImages')}</button>
      </div>
    </section>
    </div>
    <dialog class="imgview jpg-imgview" data-q="fullscreen" aria-label="${t('creator.viewAria')}"><img alt="" draggable="false"><button type="button" class="imgview-close" data-q="fullscreen-close" aria-label="${t('creator.viewClose')}" title="${t('creator.viewClose')}">×</button><div class="imgview-zoom" role="group" aria-label="${t('creator.viewZoom')}"><button type="button" data-q="fullscreen-zoom-in" aria-label="${t('creator.zoomIn')}">+</button><button type="button" data-q="fullscreen-zoom-out" aria-label="${t('creator.zoomOut')}">−</button><button type="button" data-q="fullscreen-zoom-fit">${t('creator.fit')}</button><span data-q="fullscreen-zoom-label">100%</span></div><div class="imgview-name" data-q="fullscreen-name"></div><div class="imgview-hint">${t('creator.viewHint')}</div></dialog>
  </div></div>`;

  const q=key=>root.querySelector(`[data-q="${key}"]`),pdfs=[],selected=new Set();
  let busy=false,activeMode='pages',previewId=null,anchorId=null,previewUrl=null,previewToken=0,previewZoom=1,previewPanX=0,previewPanY=0,pan=null,viewMode='details';
  const fullscreen=q('fullscreen'),fullscreenImage=fullscreen.querySelector('img');
  let fullscreenZoom=1,fullscreenPanX=0,fullscreenPanY=0,fullscreenDrag=null,fullscreenPanned=false;
  let extractionBusy=false,extractedZip=null,extractedName='';
  const pageItems=()=>pdfs.flatMap(pdf=>pdf.pages);
  const pageById=id=>pageItems().find(page=>page.id===id)||null;
  const pdfOf=page=>pdfs.find(pdf=>pdf.pages.includes(page));
  const status=text=>{q('status').textContent=text};
  const imageStatus=text=>{q('images-status').textContent=text};
  const releasePdf=pdf=>{
    for(const page of pdf.pages)URL.revokeObjectURL(page.thumbnailUrl);
    pdf.document.destroy().catch(error=>console.error('Could not release PDF document:',error));
  };
  const clearPreview=()=>{
    previewToken++;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=null;
  };
  function updateViewToggle(animate=false){
    const medium=viewMode==='medium',button=q('view-toggle');
    const label=medium?t('jpg.switchToDetails'):t('jpg.switchToMediumIcons');
    const icon=medium
      ?'<svg aria-hidden="true" focusable="false" viewBox="0 0 18 18" fill="none"><rect x="1.5" y="2" width="4" height="4" rx=".7"/><rect x="1.5" y="7" width="4" height="4" rx=".7"/><rect x="1.5" y="12" width="4" height="4" rx=".7"/><path d="M8 4h8.5M8 9h8.5M8 14h8.5"/></svg>'
      :'<svg aria-hidden="true" focusable="false" viewBox="0 0 18 18" fill="none"><rect x="1.5" y="1.5" width="6.2" height="6.2" rx="1"/><rect x="10.3" y="1.5" width="6.2" height="6.2" rx="1"/><rect x="1.5" y="10.3" width="6.2" height="6.2" rx="1"/><rect x="10.3" y="10.3" width="6.2" height="6.2" rx="1"/></svg>';
    if(button.dataset.mode!==viewMode){
      const oldIcons=button.querySelectorAll('.jpg-view-icon svg');
      if(animate&&oldIcons.length){
        for(const old of oldIcons){
          old.classList.remove('jpg-icon-enter');old.classList.add('jpg-icon-exit');
          const cleanup=()=>old.remove();
          old.addEventListener('animationend',cleanup,{once:true});setTimeout(cleanup,260);
        }
        button.querySelector('.jpg-view-icon').insertAdjacentHTML('beforeend',icon.replace('<svg','<svg class="jpg-icon-enter"'));
      }else button.innerHTML=`<span class="jpg-view-icon">${icon}</span>`;
      button.dataset.mode=viewMode;
    }
    button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(medium));
    for(const section of q('pages').querySelectorAll('.jpg-file'))section.classList.toggle('jpg-file-medium',medium);
  }
  function applyPreviewView(){
    const box=q('preview'),image=box.querySelector('img');if(!image)return;
    if(previewZoom<=1)previewPanX=previewPanY=0;
    else if(image.naturalWidth){
      const fit=Math.min(box.clientWidth/image.naturalWidth,box.clientHeight/image.naturalHeight);
      const maxX=Math.max(0,(image.naturalWidth*fit*previewZoom-box.clientWidth)/2);
      const maxY=Math.max(0,(image.naturalHeight*fit*previewZoom-box.clientHeight)/2);
      previewPanX=Math.min(maxX,Math.max(-maxX,previewPanX));previewPanY=Math.min(maxY,Math.max(-maxY,previewPanY));
    }
    image.style.transform=`translate(${previewPanX}px,${previewPanY}px) scale(${previewZoom})`;
    box.classList.toggle('pan',previewZoom>1);
  }
  function zoomLabel(){q('zoom-label').textContent=previewZoom===1?t('creator.fit'):`${Math.round(previewZoom*100)}%`}
  function setZoom(value){previewZoom=Math.min(4,Math.max(1,value));applyPreviewView();zoomLabel()}
  function applyFullscreenView(){
    if(fullscreenZoom<=1)fullscreenPanX=fullscreenPanY=0;
    else if(fullscreenImage.naturalWidth){
      const width=fullscreenImage.clientWidth,height=fullscreenImage.clientHeight;
      const fit=Math.min(width/fullscreenImage.naturalWidth,height/fullscreenImage.naturalHeight);
      const maxX=Math.max(0,(fullscreenImage.naturalWidth*fit*fullscreenZoom-width)/2);
      const maxY=Math.max(0,(fullscreenImage.naturalHeight*fit*fullscreenZoom-height)/2);
      fullscreenPanX=Math.min(maxX,Math.max(-maxX,fullscreenPanX));fullscreenPanY=Math.min(maxY,Math.max(-maxY,fullscreenPanY));
    }
    fullscreenImage.style.transform=`translate(${fullscreenPanX}px,${fullscreenPanY}px) scale(${fullscreenZoom})`;
    fullscreenImage.classList.toggle('zoomed',fullscreenZoom>1);
    q('fullscreen-zoom-label').textContent=`${Math.round(fullscreenZoom*100)}%`;
  }
  function setFullscreenZoom(value){fullscreenZoom=Math.min(4,Math.max(1,value));applyFullscreenView()}
  function openFullscreen(){
    const page=pageById(previewId);if(!page||fullscreen.open||!previewUrl)return;
    fullscreenImage.src=previewUrl;fullscreenImage.alt=`${t('jpg.pageLabel',page.number)} · ${pdfOf(page).file.name}`;
    q('fullscreen-name').textContent=pdfOf(page).file.name;
    fullscreenZoom=previewZoom;fullscreenPanX=previewPanX;fullscreenPanY=previewPanY;
    fullscreenDrag=null;fullscreenPanned=false;fullscreen.classList.remove('panning');
    fullscreen.showModal();requestAnimationFrame(applyFullscreenView);
  }
  async function loadThumbnails(pdf){
    for(const page of pdf.pages){
      if(!pdfs.includes(pdf))return;
      try{
        const pdfPage=await pdf.document.getPage(page.number);
        let bytes;
        try{bytes=await renderJpeg(pdfPage,THUMBNAIL_SCALE,256)}finally{pdfPage.cleanup()}
        if(!pdfs.includes(pdf))return;
        page.thumbnailUrl=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
        const image=q('pages').querySelector(`[data-page-id="${page.id}"] .jpg-thumb`);
        if(image)image.src=page.thumbnailUrl;
      }catch(error){
        if(!pdfs.includes(pdf))return;
        console.error(`Could not render thumbnail for ${pdf.file.name}, page ${page.number}:`,error);
      }
    }
  }
  function updateActions(){
    const count=pageItems().length,picked=selected.size,current=pageById(previewId);
    q('count').textContent=count?t('jpg.pageCount',count):t('jpg.noPages');
    q('clear').disabled=busy||!pdfs.length;
    q('browse').disabled=busy;
    q('deselect-all').disabled=busy||!picked;
    q('view-toggle').disabled=busy||!count;
    updateViewToggle();
    q('selected').disabled=busy||!picked;
    q('selected').textContent=t('jpg.exportSelectedCount',picked);
    q('all').disabled=busy||!count;
    q('dpi').disabled=busy;
    q('zoom-in').disabled=busy||!current;q('zoom-out').disabled=busy||!current;q('zoom-fit').disabled=busy||!current;
    q('drop').classList.toggle('jpg-drop-disabled',busy);
    q('drop').classList.toggle('jpg-drop-hot',false);
    q('drop').setAttribute('aria-disabled',String(busy));
    q('progress').hidden=!busy;
    for(const row of q('pages').querySelectorAll('.jpg-page-row')){
      const page=pageById(Number(row.dataset.pageId)),checkbox=row.querySelector('input');
      const isSelected=selected.has(page.id);
      row.classList.toggle('sel',isSelected);
      row.classList.toggle('previewing',page.id===previewId);
      checkbox.checked=isSelected;
      checkbox.disabled=busy;
      row.querySelector('.jpg-page-caption').disabled=busy;
      const state=row.querySelector('.jpg-page-state');
      state.textContent=isSelected?t('jpg.rowSelected'):t('jpg.rowNotSelected');
    }
    for(const button of q('pages').querySelectorAll('[data-q="remove-pdf"]'))button.disabled=busy;
    q('pages').onkeydown=event=>{
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      const pages=pageItems();if(!pages.length)return;
      event.preventDefault();
      const index=pages.findIndex(page=>page.id===previewId),step=event.key==='ArrowDown'?1:-1;
      const next=pages[Math.min(pages.length-1,Math.max(0,index+step))];
      setPreview(next.id);
      q('pages').querySelector(`[data-page-id="${next.id}"] .jpg-page-caption`)?.focus({preventScroll:false});
    };
  }
  async function setPreview(id){
    if(id===previewId&&previewUrl)return;
    if(id!==previewId){previewZoom=1;previewPanX=0;previewPanY=0}
    previewId=id;
    const token=++previewToken,page=pageById(id),box=q('preview');
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=null;
    box.replaceChildren();
    if(!page){box.textContent=t('pdfToJpg.previewEmpty');q('preview-caption').textContent=t('jpg.previewTitle');zoomLabel();updateActions();return}
    const pdf=pdfOf(page),caption=`${t('jpg.pageLabel',page.number)} · ${pdf.file.name}`;
    q('preview-caption').textContent=caption;q('preview-caption').title=caption;
    status(t('pdfToJpg.previewLoading',pdf.file.name,page.number));
    updateActions();
    try{
      const pdfPage=await pdf.document.getPage(page.number);
      let bytes;
      const viewport=pdfPage.getViewport({scale:1});
      const fit=Math.min(box.clientWidth/viewport.width,box.clientHeight/viewport.height);
      const scale=fit*(window.devicePixelRatio||1)*PREVIEW_MAX_ZOOM;
      try{bytes=await renderJpeg(pdfPage,scale,MAX_CANVAS_SIDE)}finally{pdfPage.cleanup()}
      if(token!==previewToken)return;
      previewUrl=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
      const image=new Image();image.src=previewUrl;image.alt=t('jpg.pageLabel',page.number);image.draggable=false;
      image.onerror=()=>{if(token===previewToken){box.textContent=t('pdfToJpg.previewError');status(t('pdfToJpg.previewError'))}};
      image.ondragstart=event=>event.preventDefault();
      image.onload=applyPreviewView;
      const expand=document.createElement('button');expand.type='button';expand.className='pv-full';expand.title=t('creator.viewFullscreen');expand.setAttribute('aria-label',t('creator.viewFullscreen'));
      expand.innerHTML='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      expand.onclick=openFullscreen;
      box.replaceChildren(image,expand);
      status(t('pdfToJpg.loaded',pdfs.reduce((sum,item)=>sum+item.pages.length,0)));
    }catch(error){
      if(token===previewToken){box.textContent=t('pdfToJpg.previewError');status(t('pdfToJpg.previewFailed',error.message||error))}
    }
  }
  function renderPages(){
    const list=q('pages');list.replaceChildren();
    if(!pdfs.length){const empty=document.createElement('div');empty.className='jpg-empty';empty.textContent=t('pdfToJpg.emptyList');list.append(empty)}
    for(const pdf of pdfs){
      const section=document.createElement('section');section.className='jpg-file';section.setAttribute('aria-label',pdf.file.name);
      const head=document.createElement('div');head.className='jpg-file-head';
      const name=document.createElement('button');name.type='button';name.className='jpg-file-name';name.textContent=pdf.file.name;name.title=pdf.file.name;name.setAttribute('aria-expanded','true');
      const count=document.createElement('span');count.className='jpg-file-count';count.textContent=t('jpg.filePages',pdf.pages.length);
      const remove=document.createElement('button');remove.type='button';remove.className='btn jpg-mini jpg-file-remove';remove.dataset.q='remove-pdf';remove.setAttribute('aria-label',t('jpg.removeThisFile'));remove.title=t('jpg.removeThisFile');
      remove.innerHTML='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"><path d="M4.5 7h15M9 7V4.75h6V7m2.75 0-.85 12.25H7.1L6.25 7m4 3.25v5.5m3.5-5.5v5.5"/></svg>';
      remove.onclick=()=>removePdf(pdf);
      head.append(name,count,remove);
      const items=document.createElement('ul');items.className='jpg-file-pages';
      for(const page of pdf.pages){
        const row=document.createElement('li');row.className='jpg-page-row';row.dataset.pageId=String(page.id);
        const check=document.createElement('span');check.className='jpg-page-check';
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label',t('jpg.selectPage',pdf.file.name,page.number));
        checkbox.onclick=event=>togglePage(page.id,checkbox.checked,event.shiftKey);check.append(checkbox);
        const caption=document.createElement('button');caption.type='button';caption.className='jpg-page-caption';caption.onclick=event=>{
          if(event.ctrlKey||event.metaKey){event.preventDefault();togglePage(page.id,!selected.has(page.id),false);return}
          setPreview(page.id);
        };
        const thumbnail=new Image();thumbnail.className='jpg-thumb';if(page.thumbnailUrl)thumbnail.src=page.thumbnailUrl;thumbnail.alt='';thumbnail.loading='lazy';thumbnail.decoding='async';
        const meta=document.createElement('span');meta.className='jpg-page-meta';
        const title=document.createElement('strong');title.textContent=t('jpg.pageLabel',page.number);
        const state=document.createElement('span');state.className='jpg-page-state';meta.append(title,state);
        caption.append(thumbnail,meta);row.append(check,caption);items.append(row);
      }
      const content=document.createElement('div');content.className='jpg-file-content';content.append(items);
      name.onclick=()=>{
        const collapsed=!section.classList.contains('jpg-file-collapsed');
        const start=content.getBoundingClientRect().height,end=collapsed?0:content.scrollHeight;
        section.classList.toggle('jpg-file-collapsed',collapsed);
        name.setAttribute('aria-expanded',String(!collapsed));
        content.inert=collapsed;
        content.style.height=`${start}px`;
        content.offsetHeight;
        content.style.height=`${end}px`;
        if(!collapsed){
          const finishOpen=event=>{
            if(event.target!==content||event.propertyName!=='height')return;
            content.removeEventListener('transitionend',finishOpen);
            if(!section.classList.contains('jpg-file-collapsed'))content.style.height='auto';
          };
          content.addEventListener('transitionend',finishOpen);
        }
      };
      section.append(head,content);list.append(section);
    }
    if(!pageItems().some(page=>page.id===previewId))previewId=pageItems()[0]?.id??null;
    renderPreview();updateActions();
  }
  function renderPreview(){
    clearPreview();
    const page=pageById(previewId),box=q('preview');
    box.replaceChildren();
    if(!page){box.textContent=t('pdfToJpg.previewEmpty');q('preview-caption').textContent=t('jpg.previewTitle');return}
    const pdf=pdfOf(page),caption=`${t('jpg.pageLabel',page.number)} · ${pdf.file.name}`;
    q('preview-caption').textContent=caption;q('preview-caption').title=caption;
    const image=new Image();if(page.thumbnailUrl)image.src=page.thumbnailUrl;image.alt=t('jpg.pageLabel',page.number);image.draggable=false;box.append(image);
    setPreview(page.id);
  }
  function togglePage(id,on,extend){
    const pages=pageItems(),from=pages.findIndex(page=>page.id===anchorId),to=pages.findIndex(page=>page.id===id);
    if(extend&&from>=0&&to>=0){
      const [low,high]=from<to?[from,to]:[to,from];
      for(const page of pages.slice(low,high+1))on?selected.add(page.id):selected.delete(page.id);
    }else{on?selected.add(id):selected.delete(id)}
    anchorId=id;updateActions();
  }
  function removePdf(pdf){
    if(busy)return;
    releasePdf(pdf);pdfs.splice(pdfs.indexOf(pdf),1);
    for(const page of pdf.pages)selected.delete(page.id);
    if(pdf.pages.some(page=>page.id===previewId)){previewId=null;clearPreview()}
    status(t('pdfToJpg.loaded',pageItems().length));renderPages();
  }
  async function addFiles(files){
    if(busy)return;
    const accepted=files.filter(file=>/\.pdf$/i.test(file.name)),ignored=files.length-accepted.length;
    if(!accepted.length){await msg(t('pdfToJpg.noFilesTitle'),t('pdfToJpg.noFiles'),'error');return}
    busy=true;updateActions();q('progress').max=accepted.length;q('progress').value=0;
    const failures=[];
    try{
      for(let index=0;index<accepted.length;index++){
        const file=accepted[index];
        status(t('pdfToJpg.loading',index+1,accepted.length,file.name));
        try{
          const pdf=await loadPdf(file);
          pdfs.push(pdf);renderPages();
          setTimeout(()=>loadThumbnails(pdf),0);
        }catch(error){failures.push(`${file.name}: ${error.message||error}`)}
        q('progress').value=index+1;
      }
      status(t('pdfToJpg.loaded',pageItems().length));
      if(failures.length)await msg(t('pdfToJpg.loadErrorsTitle'),t('pdfToJpg.loadErrors',failures.join('\n'),ignored),'warning');
    }finally{busy=false;updateActions();q('progress').value=0}
  }
  async function exportPages(all){
    if(busy)return;
    const pages=all?pageItems():pageItems().filter(page=>selected.has(page.id));
    if(!pages.length){await msg(t('jpg.noSelectionTitle'),t('jpg.noSelection'),'warning');return}
    busy=true;updateActions();q('progress').max=pages.length;q('progress').value=0;
    const outputs={},usedNames=new Set(),stems=new Map(pdfs.map(pdf=>[pdf,uniqueStem(pdf.file.name,usedNames)])),failures=[];
    try{
      for(let index=0;index<pages.length;index++){
        const page=pages[index],pdf=pdfOf(page);
        status(t('pdfToJpg.exporting',index+1,pages.length,pdf.file.name,page.number));
        try{
          const renderedPage=await pdf.document.getPage(page.number);
          let bytes;
          try{bytes=await renderJpeg(renderedPage,Number(q('dpi').value)/72,MAX_CANVAS_SIDE,Number(q('dpi').value))}finally{renderedPage.cleanup()}
          const stem=stems.get(pdf),number=String(page.number).padStart(String(pdf.document.numPages).length,'0');
          const prefix=pdfs.length>1?`${stem}/`:'';
          outputs[`${prefix}${stem}-page-${number}.jpg`]=bytes;
        }catch(error){failures.push(`${pdf.file.name}, ${t('jpg.pageLabel',page.number)}: ${error.message||error}`)}
        q('progress').value=index+1;
      }
      const completed=Object.keys(outputs).length;
      if(!completed){
        status(t('pdfToJpg.nothingExported',failures.length));
        await msg(t('pdfToJpg.errorTitle'),t('pdfToJpg.errorMessage',failures.join('\n')),'error');
        return;
      }
      const archive=zipSync(outputs,{level:0});
      const archiveName=pdfs.length===1?`${safeStem(pdfs[0].file.name)}-jpg.zip`:'pdf-to-jpg.zip';
      download(archiveName,archive);
      status(t('pdfToJpg.exported',completed,failures.length));
      track('pdf-to-jpg/run','PDF to JPG run');
      track('pdf-to-jpg/pages/'+countBucket(completed),'PDF to JPG pages '+countBucket(completed));
      if(failures.length)await msg(t('pdfToJpg.errorTitle'),t('pdfToJpg.partialMessage',completed,pages.length,failures.join('\n')),'warning');
      else await msg(t('pdfToJpg.doneTitle'),t('pdfToJpg.doneMessage',completed,archiveName));
    }finally{busy=false;updateActions();q('progress').value=0}
  }

  function setMode(mode){
    if(busy||extractionBusy)return;
    if(mode===activeMode)return;
    const outgoing=q(activeMode==='pages'?'pages-mode':'images-mode'),incoming=q(mode==='pages'?'pages-mode':'images-mode');
    outgoing.hidden=true;outgoing.inert=true;outgoing.setAttribute('aria-hidden','true');
    incoming.hidden=false;incoming.inert=false;incoming.setAttribute('aria-hidden','false');
    activeMode=mode;
    const tabs=q('mode-tabs');
    tabs.dataset.activeMode=mode;
    q('pages-tab').classList.toggle('active',mode==='pages');
    q('pages-tab').setAttribute('aria-selected',String(mode==='pages'));
    q('pages-tab').tabIndex=mode==='pages'?0:-1;
    q('images-tab').classList.toggle('active',mode==='images');
    q('images-tab').setAttribute('aria-selected',String(mode==='images'));
    q('images-tab').tabIndex=mode==='images'?0:-1;
  }
  async function extractImages(file){
    if(extractionBusy)return;
    if(!file||!/\.pdf$/i.test(file.name)){await msg(t('pdfToJpg.noFilesTitle'),t('pdfToJpg.noFiles'),'error');return}
    extractionBusy=true;extractedZip=null;extractedName='';q('images-download').disabled=true;
    q('images-name').textContent=file.name;q('images-progress').max=1;q('images-progress').value=0;q('images-progress').hidden=false;
    imageStatus(t('pdfToJpg.imagesLoading',file.name));
    let loaded=null;
    try{
      const pdfjs=await loadPdfjs();loaded=await loadPdf(file);
      q('images-progress').max=loaded.document.numPages;
      const {output,count,failures}=await extractPdfImages(loaded.document,pdfjs,(page,total)=>{
        q('images-progress').value=page;imageStatus(t('pdfToJpg.imagesPage',page,total,file.name));
      });
      if(!count){
        const message=failures.length?t('pdfToJpg.imagesNoneFailed'):t('pdfToJpg.imagesNone');
        imageStatus(message);
        const detail=failures.length?`\n\n${failures.join('\n')}`:'';
        await msg(t('pdfToJpg.imagesTitle'),`${message}${detail}`,'warning');
        return;
      }
      extractedZip=zipSync(output,{level:0});extractedName=`${safeStem(file.name)}-images.zip`;
      q('images-download').disabled=false;
      imageStatus(t('pdfToJpg.imagesDone',count,failures.length));
      track('pdf-to-jpg/extract-images','PDF embedded images extraction');
      if(failures.length)await msg(t('pdfToJpg.imagesTitle'),t('pdfToJpg.imagesPartial',count,failures.join('\n')),'warning');
    }catch(error){
      imageStatus(t('pdfToJpg.imagesFailed',error.message||error));
      await msg(t('pdfToJpg.imagesTitle'),t('pdfToJpg.imagesFailed',error.message||error),'error');
    }finally{
      if(loaded)releasePdf(loaded);
      extractionBusy=false;q('images-progress').value=0;q('images-progress').hidden=true;
    }
  }

  const browse=()=>{if(!busy)q('file').click()};
  q('pages-tab').onclick=()=>setMode('pages');
  q('images-tab').onclick=()=>setMode('images');
  q('mode-tabs').onkeydown=event=>{
    if(busy||extractionBusy)return;
    const tabs=[q('pages-tab'),q('images-tab')],index=tabs.indexOf(event.target);
    if(index<0)return;
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
    if(next<0)return;
    event.preventDefault();setMode(next===0?'pages':'images');tabs[next].focus();
  };
  q('browse').onclick=browse;
  q('drop').onclick=event=>{
    if(event.target.closest('button,input,select,textarea,a,.jpg-file,.jpg-panel-head'))return;
    browse();
  };
  q('drop').onkeydown=event=>{
    if(event.target===q('drop')&&(event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();browse()}
  };
  q('file').onchange=event=>{const files=[...event.target.files];event.target.value='';addFiles(files)};
  q('images-drop').onclick=event=>{
    if(!extractionBusy)q('images-file').click();
  };
  q('images-drop').onkeydown=event=>{
    if(event.target===q('images-drop')&&(event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();q('images-file').click()}
  };
  q('images-file').onchange=event=>{const file=event.target.files[0];event.target.value='';if(file)extractImages(file)};
  q('images-download').onclick=()=>{
    if(extractedZip&&extractedName){download(extractedName,extractedZip);track('pdf-to-jpg/download-images','PDF embedded images download')}
  };
  q('images-drop').addEventListener('dragover',event=>{
    if(!extractionBusy&&hasFiles(event)){event.preventDefault();q('images-drop').classList.add('jpg-drop-hot')}
  });
  q('images-drop').addEventListener('dragleave',event=>{
    if(!q('images-drop').contains(event.relatedTarget))q('images-drop').classList.remove('jpg-drop-hot');
  });
  root.addEventListener('dragover',event=>{if(hasFiles(event))event.preventDefault()});
  root.addEventListener('drop',event=>{
    if(!hasFiles(event))return;
    event.preventDefault();
    if(activeMode==='images'){
      q('images-drop').classList.remove('jpg-drop-hot');extractImages([...event.dataTransfer.files][0]);
    }else{
      q('drop').classList.remove('jpg-drop-hot');addFiles([...event.dataTransfer.files]);
    }
  });
  q('drop').addEventListener('dragover',event=>{if(!busy&&hasFiles(event)){event.preventDefault();q('drop').classList.add('jpg-drop-hot')}});
  q('drop').addEventListener('dragleave',event=>{if(!q('drop').contains(event.relatedTarget))q('drop').classList.remove('jpg-drop-hot')});
  document.addEventListener('paste',event=>{
    if(!document.getElementById('tools-page').classList.contains('on')||!root.closest('.view')?.classList.contains('on'))return;
    const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
    if(files.length){event.preventDefault();if(activeMode==='images')extractImages(files[0]);else addFiles(files)}
  });
  q('clear').onclick=()=>{
    if(busy)return;
    for(const pdf of pdfs)releasePdf(pdf);
    pdfs.length=0;selected.clear();previewId=null;anchorId=null;clearPreview();status(t('pdfToJpg.ready'));renderPages();
  };
  q('deselect-all').onclick=()=>{selected.clear();updateActions()};
  q('view-toggle').onclick=()=>{viewMode=viewMode==='medium'?'details':'medium';updateViewToggle(true)};
  q('selected').onclick=()=>exportPages(false);
  q('all').onclick=()=>exportPages(true);
  q('zoom-in').onclick=()=>setZoom(previewZoom+.25);
  q('zoom-out').onclick=()=>setZoom(previewZoom-.25);
  q('zoom-fit').onclick=()=>setZoom(1);
  const preview=q('preview');
  preview.onclick=event=>{
    if(event.altKey&&(event.target===preview.querySelector('img')||event.target===preview))openFullscreen();
  };
  preview.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.altKey||previewZoom<=1||!preview.querySelector('img')||event.target.closest('button'))return;
    event.preventDefault();pan={id:event.pointerId,x:event.clientX,y:event.clientY,px:previewPanX,py:previewPanY};
    preview.classList.add('panning');preview.setPointerCapture(event.pointerId);
  });
  preview.addEventListener('pointermove',event=>{
    if(!pan||event.pointerId!==pan.id)return;
    previewPanX=pan.px+event.clientX-pan.x;previewPanY=pan.py+event.clientY-pan.y;applyPreviewView();
  });
  const stopPan=event=>{
    if(!pan||event.pointerId!==pan.id)return;
    pan=null;preview.classList.remove('panning');
  };
  preview.addEventListener('pointerup',stopPan);preview.addEventListener('pointercancel',stopPan);preview.addEventListener('lostpointercapture',stopPan);
  preview.addEventListener('dblclick',()=>{if(previewZoom>1&&preview.querySelector('img'))setZoom(1)});
  preview.addEventListener('wheel',event=>{
    if(!pageById(previewId))return;
    event.preventDefault();setZoom(previewZoom+(event.deltaY<0?.2:-.2));
  },{passive:false});
  new ResizeObserver(()=>{if(previewZoom>1)applyPreviewView()}).observe(preview);
  fullscreenImage.addEventListener('load',()=>{if(fullscreen.open)applyFullscreenView()});
  new ResizeObserver(()=>{if(fullscreen.open&&fullscreenZoom>1)applyFullscreenView()}).observe(fullscreenImage);
  q('fullscreen-close').onclick=()=>fullscreen.close();
  q('fullscreen-zoom-in').onclick=()=>setFullscreenZoom(fullscreenZoom+.25);
  q('fullscreen-zoom-out').onclick=()=>setFullscreenZoom(fullscreenZoom-.25);
  q('fullscreen-zoom-fit').onclick=()=>setFullscreenZoom(1);
  fullscreen.onwheel=event=>{event.preventDefault();setFullscreenZoom(fullscreenZoom+(event.deltaY<0?.2:-.2))};
  fullscreen.onpointerdown=event=>{
    fullscreenPanned=false;
    if(event.button!==0||event.target.closest('button')||fullscreenZoom<=1)return;
    event.preventDefault();fullscreenDrag={id:event.pointerId,x:event.clientX,y:event.clientY,px:fullscreenPanX,py:fullscreenPanY,moved:false};
    fullscreen.setPointerCapture(event.pointerId);fullscreen.classList.add('panning');
  };
  fullscreen.onpointermove=event=>{
    if(!fullscreenDrag||event.pointerId!==fullscreenDrag.id)return;
    const dx=event.clientX-fullscreenDrag.x,dy=event.clientY-fullscreenDrag.y;
    if(Math.abs(dx)+Math.abs(dy)>3)fullscreenDrag.moved=true;
    fullscreenPanX=fullscreenDrag.px+dx;fullscreenPanY=fullscreenDrag.py+dy;applyFullscreenView();
  };
  const endFullscreenPan=event=>{
    if(!fullscreenDrag||event.pointerId!==fullscreenDrag.id)return;
    fullscreenPanned=fullscreenDrag.moved;fullscreenDrag=null;fullscreen.classList.remove('panning');
  };
  fullscreen.onpointerup=endFullscreenPan;fullscreen.onpointercancel=endFullscreenPan;fullscreen.onlostpointercapture=endFullscreenPan;
  fullscreen.onclick=event=>{if(event.target.closest('.imgview-zoom'))return;if(!fullscreenPanned)fullscreen.close()};
  fullscreen.oncancel=()=>fullscreen.close();
  fullscreen.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation()});
  mountGuide(root.querySelector('.tool-layout'),'pdfToJpg');
  renderPages();
  addEventListener('beforeunload',event=>{
    if(busy){event.preventDefault();event.returnValue=''}
    clearPreview();
    for(const pdf of pdfs)releasePdf(pdf);
  });
}
