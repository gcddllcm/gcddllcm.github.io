import {msg,track} from './util.js?v=3.4.0';
import {download} from './nbtool.js?v=3.4.0-tool-workspace-v1';
import {extractNotebookPages} from './jpgcore.js?v=3.4.0-page-order-v2';
import {mountGuide} from './instruction-panel.js?v=3.4.0';
import {t} from './i18n.js?v=3.4.0';

const MAX_CANVAS_PIXELS=16000000;
const MAX_CANVAS_SIDE=8192;
const BASE_EXPORT_SCALE=4.5;
let nextPageId=0;

function svgUrl(svg){return URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}))}
function pageSize(page){
  const baseWidth=Number.isFinite(page.width)&&page.width>0?page.width:800;
  const baseHeight=Number.isFinite(page.height)&&page.height>0?page.height:1000;
  const density=Number.isFinite(page.renderScale)?Math.min(16,Math.max(BASE_EXPORT_SCALE,page.renderScale)):BASE_EXPORT_SCALE;
  const width=baseWidth*density,height=baseHeight*density,pixels=width*height;
  const scale=Math.min(1,Math.sqrt(MAX_CANVAS_PIXELS/pixels),MAX_CANVAS_SIDE/width,MAX_CANVAS_SIDE/height);
  return [Math.max(1,Math.floor(width*scale)),Math.max(1,Math.floor(height*scale))];
}
function renderJpeg(page,quality){
  return new Promise((resolve,reject)=>{
    const [width,height]=pageSize(page),image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');
        if(!context)throw new Error('The browser could not create an image canvas.');
        context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The browser could not encode this page as JPEG.')),'image/jpeg',quality);
      }catch(error){reject(error)}
    };
    image.onerror=()=>reject(new Error('The browser could not render this notebook page.'));
    image.src=page.previewUrl;
  });
}
function safeStem(name){return name.replace(/\.[^.]*$/,'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()||'notebook'}
const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');

export function mount(root){
  root.innerHTML=`<div class="tool-layout wide-tool"><div class="tool wideview jpg-tool">
    <h1 class="tool-title-sr">${t('tool.jpgMaker')}</h1>
    <input type="file" data-q="file" accept=".notebook" multiple hidden>
    <div class="jpg-workspace">
      <div class="jpg-pages-column">
        <section class="jpg-panel jpg-pages-panel" data-q="drop" tabindex="0" aria-keyshortcuts="Enter Space" aria-labelledby="jpg-pages-title">
          <div class="jpg-panel-head">
            <h2 id="jpg-pages-title">${t('jpg.pages')}</h2><span class="jpg-page-count" data-q="count"></span>
            <div class="jpg-panel-tools">
              <button type="button" class="btn jpg-mini" data-q="deselect-all" disabled>${t('jpg.clearSelection')}</button>
              <button type="button" class="btn jpg-mini jpg-view-toggle" data-q="view-toggle" disabled aria-label="${t('jpg.switchToMediumIcons')}" title="${t('jpg.switchToMediumIcons')}" aria-pressed="false"></button>
            </div>
          </div>
          <div class="jpg-import-feedback" data-q="import-feedback" hidden aria-live="polite"><span class="jpg-import-spinner" aria-hidden="true"></span><span class="jpg-import-label" data-q="import-label"></span><progress data-q="import-progress" max="1" value="0" aria-label="${t('a11y.progressImport')}"></progress></div>
          <div class="jpg-list" data-q="pages"></div>
        </section>
        <div class="jpg-file-controls"><button type="button" class="btn" data-q="browse">${t('jpg.browse')}</button><button type="button" class="btn" data-q="clear" disabled>${t('jpg.removeAllFiles')}</button></div>
      </div>
      <div class="jpg-preview-column">
        <section class="jpg-panel jpg-preview-panel" aria-label="${t('jpg.previewTitle')}">
          <div class="jpg-panel-head">
            <h2 class="jpg-preview-title" data-q="preview-caption">${t('jpg.previewTitle')}</h2>
          </div>
          <div class="jpg-preview" data-q="preview">${t('jpg.previewEmpty')}</div>
        </section>
        <div class="jpg-preview-controls"><button type="button" class="btn" data-q="zoom-out" aria-label="${t('creator.zoomOut')}">−</button><span data-q="zoom-label">${t('creator.fit')}</span><button type="button" class="btn" data-q="zoom-in" aria-label="${t('creator.zoomIn')}">+</button><button type="button" class="btn" data-q="zoom-fit">${t('creator.fit')}</button></div>
      </div>
    </div>
    <div class="jpg-footer">
      <div class="jpg-status-wrap">
        <progress data-q="progress" max="1" value="0" hidden aria-label="${t('a11y.progressExport')}"></progress>
        <div class="sub jpg-status" data-q="status" role="status" aria-live="polite" aria-atomic="true">${t('jpg.ready')}</div>
      </div>
      <div class="jpg-export">
        <div class="quality-row"><label for="jpg-quality">${t('jpg.quality')}</label><select id="jpg-quality" data-q="quality"><option value="70">70%</option><option value="80">80%</option><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option><option value="100" selected>100%</option></select></div>
        <button type="button" class="btn" data-q="selected" disabled>${t('jpg.exportSelectedCount',0)}</button>
        <button type="button" class="btn primary" data-q="all" disabled>${t('jpg.exportAll')}</button>
      </div>
    </div>
    <dialog class="imgview jpg-imgview" data-q="fullscreen" aria-label="${t('creator.viewAria')}"><img alt="" draggable="false"><button type="button" class="imgview-close" data-q="fullscreen-close" aria-label="${t('creator.viewClose')}" title="${t('creator.viewClose')}">×</button><div class="imgview-zoom" role="group" aria-label="${t('creator.viewZoom')}"><button type="button" data-q="fullscreen-zoom-in" aria-label="${t('creator.zoomIn')}">+</button><button type="button" data-q="fullscreen-zoom-out" aria-label="${t('creator.zoomOut')}">−</button><button type="button" data-q="fullscreen-zoom-fit">${t('creator.fit')}</button><span data-q="fullscreen-zoom-label">100%</span></div><div class="imgview-name" data-q="fullscreen-name"></div><div class="imgview-hint">${t('creator.viewHint')}</div></dialog>
  </div></div>`;

  const q=key=>root.querySelector(`[data-q="${key}"]`),notebooks=[],selected=new Set();
  let busy=false,previewId=null,anchorId=null,previewZoom=1,previewPanX=0,previewPanY=0,pan=null,viewMode='details';
  const fullscreen=q('fullscreen'),fullscreenImage=fullscreen.querySelector('img');
  let fullscreenZoom=1,fullscreenPanX=0,fullscreenPanY=0,fullscreenDrag=null,fullscreenPanned=false;
  const pageItems=()=>notebooks.flatMap(notebook=>notebook.pages);
  const pageById=id=>pageItems().find(page=>page.id===id)||null;
  const notebookOf=page=>notebooks.find(notebook=>notebook.pages.includes(page));
  const status=text=>{q('status').textContent=text};
  const revokeNotebook=notebook=>{
    for(const page of notebook.pages)URL.revokeObjectURL(page.previewUrl);
  };

  // Enables or disables every control to match the busy state. Rows are rebuilt only on list changes,
  // so their controls are updated here too; otherwise a file could be removed mid-export.
  function updateActions(){
    const count=pageItems().length,picked=selected.size,current=pageById(previewId);
    q('count').textContent=count?t('jpg.pageCount',count):t('jpg.noPages');
    q('clear').disabled=busy||!count;
    q('browse').disabled=busy;
    q('deselect-all').disabled=busy||!picked;
    q('view-toggle').disabled=busy||!count;
    updateViewToggle();
    q('selected').disabled=busy||!picked;
    q('selected').textContent=t('jpg.exportSelectedCount',picked);
    q('all').disabled=busy||!count;
    q('quality').disabled=busy;
    q('drop').classList.toggle('jpg-drop-disabled',busy);
    q('drop').setAttribute('aria-disabled',String(busy));
    q('progress').hidden=!busy;
    q('zoom-in').disabled=busy||!current;q('zoom-out').disabled=busy||!current;q('zoom-fit').disabled=busy||!current;
    for(const row of q('pages').querySelectorAll('.jpg-page-row')){
      const id=Number(row.dataset.pageId),on=selected.has(id);
      row.classList.toggle('sel',on);row.classList.toggle('previewing',id===previewId);
      row.querySelector('input').checked=on;
      row.querySelector('input').disabled=busy;
      row.querySelector('.jpg-page-caption').disabled=busy;
      row.querySelector('.jpg-page-state').textContent=on?t('jpg.rowSelected'):t('jpg.rowNotSelected');
    }
    for(const button of q('pages').querySelectorAll('.jpg-file-remove'))button.disabled=busy;
  }
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
          old.addEventListener('animationend',cleanup,{once:true});
          setTimeout(cleanup,260);
        }
        button.querySelector('.jpg-view-icon').insertAdjacentHTML('beforeend',icon.replace('<svg','<svg class="jpg-icon-enter"'));
      }else button.innerHTML=`<span class="jpg-view-icon">${icon}</span>`;
      button.dataset.mode=viewMode;
    }
    button.setAttribute('aria-label',label);
    button.title=label;
    button.setAttribute('aria-pressed',String(medium));
    for(const section of q('pages').querySelectorAll('.jpg-file'))section.classList.toggle('jpg-file-medium',medium);
  }
  function applyFullscreenView(){
    if(fullscreenZoom<=1)fullscreenPanX=fullscreenPanY=0;
    else if(fullscreenImage.naturalWidth){
      const width=fullscreenImage.clientWidth,height=fullscreenImage.clientHeight;
      const fit=Math.min(width/fullscreenImage.naturalWidth,height/fullscreenImage.naturalHeight);
      const maxX=Math.max(0,(fullscreenImage.naturalWidth*fit*fullscreenZoom-width)/2),maxY=Math.max(0,(fullscreenImage.naturalHeight*fit*fullscreenZoom-height)/2);
      fullscreenPanX=Math.min(maxX,Math.max(-maxX,fullscreenPanX));fullscreenPanY=Math.min(maxY,Math.max(-maxY,fullscreenPanY));
    }
    fullscreenImage.style.transform=`translate(${fullscreenPanX}px,${fullscreenPanY}px) scale(${fullscreenZoom})`;
    fullscreenImage.classList.toggle('zoomed',fullscreenZoom>1);
    q('fullscreen-zoom-label').textContent=`${Math.round(fullscreenZoom*100)}%`;
  }
  function setFullscreenZoom(value){fullscreenZoom=Math.min(4,Math.max(1,value));applyFullscreenView()}
  function openFullscreen(){
    const page=pageById(previewId);if(!page||fullscreen.open)return;
    fullscreenImage.src=page.previewUrl;fullscreenImage.alt=`${t('jpg.pageLabel',page.number)} · ${notebookOf(page).file.name}`;
    q('fullscreen-name').textContent=notebookOf(page).file.name;
    fullscreenZoom=previewZoom;fullscreenPanX=previewPanX;fullscreenPanY=previewPanY;
    fullscreenDrag=null;fullscreenPanned=false;fullscreen.classList.remove('panning');
    fullscreen.showModal();requestAnimationFrame(applyFullscreenView);
  }
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
  function renderPreview(){
    const page=pageById(previewId),box=q('preview'),caption=q('preview-caption');
    box.replaceChildren();
    if(!page){box.classList.remove('pan','panning');box.textContent=t('jpg.previewEmpty');caption.textContent=t('jpg.previewTitle');caption.removeAttribute('title');zoomLabel();return}
    const image=new Image();image.src=page.previewUrl;image.alt=t('jpg.pageLabel',page.number);image.draggable=false;
    image.ondragstart=event=>event.preventDefault();image.style.transform=`translate(${previewPanX}px,${previewPanY}px) scale(${previewZoom})`;image.onload=applyPreviewView;
    const expand=document.createElement('button');expand.type='button';expand.className='pv-full';expand.title=t('creator.viewFullscreen');expand.setAttribute('aria-label',t('creator.viewFullscreen'));
    expand.innerHTML='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    expand.onclick=event=>{event.stopPropagation();openFullscreen()};
    box.append(image,expand);
    const label=`${t('jpg.pageLabel',page.number)} · ${notebookOf(page).file.name}`;
    caption.textContent=label;caption.title=label;
  }
  q('preview').onclick=event=>{if(event.altKey&&(event.target===q('preview').querySelector('img')||event.target===q('preview')))openFullscreen()};
  function zoomLabel(){const label=q('zoom-label');if(label)label.textContent=previewZoom===1?t('creator.fit'):`${Math.round(previewZoom*100)}%`}
  function applyPreviewView(){
    const box=q('preview'),image=box.querySelector('img');if(!image)return;
    if(previewZoom<=1)previewPanX=previewPanY=0;
    else if(image.naturalWidth){
      const width=box.clientWidth,height=box.clientHeight;
      const fit=Math.min(width/image.naturalWidth,height/image.naturalHeight);
      const maxX=Math.max(0,(image.naturalWidth*fit*previewZoom-width)/2),maxY=Math.max(0,(image.naturalHeight*fit*previewZoom-height)/2);
      previewPanX=Math.min(maxX,Math.max(-maxX,previewPanX));previewPanY=Math.min(maxY,Math.max(-maxY,previewPanY));
    }
    image.style.transform=`translate(${previewPanX}px,${previewPanY}px) scale(${previewZoom})`;
    box.classList.toggle('pan',previewZoom>1);
  }
  function setZoom(value){previewZoom=Math.min(4,Math.max(1,value));applyPreviewView();zoomLabel()}
  function setPreview(id){if(id===previewId)return;previewId=id;previewZoom=1;previewPanX=previewPanY=0;renderPreview();updateActions()}
  function pageRow(notebook,page){
    const row=document.createElement('li');row.className='jpg-page-row';row.dataset.pageId=String(page.id);
    const check=document.createElement('span');check.className='jpg-page-check';
    const box=document.createElement('input');box.type='checkbox';
    box.setAttribute('aria-label',t('jpg.selectPage',notebook.file.name,page.number));
    // The click event (not change) is used so Shift+click can see the modifier key.
    box.onclick=event=>togglePage(page.id,box.checked,event.shiftKey);
    check.append(box);
    const caption=document.createElement('button');caption.type='button';caption.className='jpg-page-caption';
    caption.onclick=event=>{
      if(event.ctrlKey||event.metaKey){event.preventDefault();togglePage(page.id,!selected.has(page.id),false);return}
      setPreview(page.id);
    };
    const thumb=new Image();thumb.className='jpg-thumb';thumb.src=page.previewUrl;thumb.alt='';thumb.loading='lazy';thumb.decoding='async';
    const meta=document.createElement('span');meta.className='jpg-page-meta';
    const title=document.createElement('strong');title.textContent=t('jpg.pageLabel',page.number);
    const state=document.createElement('span');state.className='jpg-page-state';
    meta.append(title,state);caption.append(thumb,meta);
    row.append(check,caption);
    return row;
  }
  function renderPages(){
    const list=q('pages');list.replaceChildren();
    if(!notebooks.length){
      const empty=document.createElement('div');empty.className='jpg-empty';empty.textContent=t('jpg.emptyList');list.append(empty);
    }
    for(const notebook of notebooks){
      const section=document.createElement('section');section.className='jpg-file';section.setAttribute('aria-label',notebook.file.name);
      const head=document.createElement('div');head.className='jpg-file-head';
      const name=document.createElement('button');name.type='button';name.className='jpg-file-name';name.textContent=notebook.file.name;name.title=notebook.file.name;name.setAttribute('aria-expanded','true');
      const count=document.createElement('span');count.className='jpg-file-count';count.textContent=t('jpg.filePages',notebook.pages.length);
      const remove=document.createElement('button');remove.type='button';remove.className='btn jpg-mini jpg-file-remove';remove.setAttribute('aria-label',t('jpg.removeThisFile'));remove.title=t('jpg.removeThisFile');
      remove.innerHTML='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"><path d="M4.5 7h15M9 7V4.75h6V7m2.75 0-.85 12.25H7.1L6.25 7m4 3.25v5.5m3.5-5.5v5.5"/></svg>';
      remove.onclick=()=>removeNotebook(notebook);
      head.append(name,count,remove);
      const items=document.createElement('ul');items.className='jpg-file-pages';
      for(const page of notebook.pages)items.append(pageRow(notebook,page));
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
    if(!pageItems().some(page=>page.id===previewId)){previewId=pageItems()[0]?.id??null;previewZoom=1;previewPanX=previewPanY=0}
    renderPreview();updateActions();
  }
  function togglePage(id,on,extend){
    const pages=pageItems(),from=pages.findIndex(page=>page.id===anchorId),to=pages.findIndex(page=>page.id===id);
    if(extend&&from>=0&&to>=0){
      const [low,high]=from<to?[from,to]:[to,from];
      for(const page of pages.slice(low,high+1))on?selected.add(page.id):selected.delete(page.id);
    }else{on?selected.add(id):selected.delete(id)}
    anchorId=id;
    updateActions();
  }
  function removeNotebook(notebook){
    if(busy)return;
    const index=notebooks.indexOf(notebook);if(index<0)return;
    notebooks.splice(index,1);revokeNotebook(notebook);
    for(const page of notebook.pages)selected.delete(page.id);
    if(!pageItems().some(page=>page.id===previewId))previewId=null;
    status(notebooks.length?t('jpg.removed',notebook.file.name):t('jpg.ready'));
    renderPages();
  }
  async function addFiles(files){
    if(busy)return;
    const list=[...files],accepted=list.filter(file=>/\.notebook$/i.test(file.name));
    const rejected=list.filter(file=>!/\.notebook$/i.test(file.name));
    if(rejected.length)await msg(t('jpg.unsupportedTitle'),t('jpg.unsupported',rejected.map(file=>file.name).join('\n')),'warning');
    if(!accepted.length)return;
    busy=true;updateActions();q('progress').max=accepted.length;q('progress').value=0;
    q('import-feedback').hidden=false;q('import-progress').max=accepted.length;q('import-progress').value=0;
    const failures=[];
    for(let i=0;i<accepted.length;i++){
      const file=accepted[i],loading=t('jpg.loading',i+1,accepted.length,file.name);
      status(loading);q('import-label').textContent=loading;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      try{
        const extracted=extractNotebookPages(await file.arrayBuffer());
        const notebook={file,pages:[],view:'details'};
        try{
          for(const page of extracted.pages)notebook.pages.push({...page,id:++nextPageId,previewUrl:svgUrl(page.svg)});
        }catch(error){revokeNotebook(notebook);throw error}
        notebooks.push(notebook);
      }catch(error){failures.push(`${file.name}: ${error.message||error}`)}
      q('progress').value=i+1;q('import-progress').value=i+1;
    }
    busy=false;q('import-feedback').hidden=true;renderPages();
    status(failures.length?t('jpg.loadErrors',failures.length):t('jpg.loaded',pageItems().length));
    if(failures.length)await msg(t('jpg.loadErrorTitle'),failures.slice(0,10).join('\n')+(failures.length>10?'\n…':''),'warning');
  }
  async function exportPages(exportAll){
    const pages=pageItems(),targets=exportAll?pages:pages.filter(page=>selected.has(page.id));
    if(!targets.length){await msg(t('jpg.noSelectionTitle'),t('jpg.noSelection'),'warning');return}
    busy=true;updateActions();q('progress').max=targets.length;q('progress').value=0;
    const quality=Number(q('quality').value)/100,failures=[],usedNames=new Set();
    for(let i=0;i<targets.length;i++){
      const page=targets[i],notebook=notebookOf(page);
      status(t('jpg.exporting',i+1,targets.length,notebook.file.name,page.number));
      try{
        const blob=await renderJpeg(page,quality),stem=safeStem(notebook.file.name),suffix=String(page.number).padStart(2,'0');
        let name=`${stem}-page-${suffix}.jpg`,copy=2;
        while(usedNames.has(name.toLowerCase()))name=`${stem}-page-${suffix}-${copy++}.jpg`;
        usedNames.add(name.toLowerCase());download(name,blob);
        if(i+1<targets.length)await new Promise(resolve=>setTimeout(resolve,300));
      }catch(error){failures.push(`${notebook.file.name} — ${t('jpg.pageLabel',page.number)}: ${error.message||error}`)}
      q('progress').value=i+1;
    }
    busy=false;updateActions();
    const exported=targets.length-failures.length;
    status(failures.length?t('jpg.exportErrors',exported,targets.length):t('jpg.exported',exported));
    track('jpg-maker/export','Convert to JPG export');
    if(failures.length)await msg(t('jpg.exportErrorTitle'),failures.slice(0,10).join('\n')+(failures.length>10?'\n…':''),'warning');
  }

  const drop=q('drop'),input=q('file');
  const preview=q('preview');
  q('zoom-in').onclick=()=>setZoom(previewZoom+.25);
  q('zoom-out').onclick=()=>setZoom(previewZoom-.25);
  q('zoom-fit').onclick=()=>setZoom(1);
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
  preview.addEventListener('dblclick',event=>{if(previewZoom>1&&preview.querySelector('img'))setZoom(1)});
  preview.addEventListener('wheel',event=>{
    if(!pageById(previewId))return;
    event.preventDefault();setZoom(previewZoom+(event.deltaY<0?.2:-.2));
  },{passive:false});
  new ResizeObserver(()=>{if(previewZoom>1)applyPreviewView()}).observe(preview);
  const browse=()=>{if(!busy)input.click()};
  q('browse').onclick=browse;
  drop.onclick=event=>{
    if(event.target.closest('button,input,select,textarea,a,.jpg-file,.jpg-panel-head,.jpg-import-feedback'))return;
    browse();
  };
  drop.onkeydown=event=>{if(event.target===drop&&(event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();browse()}};
  input.onchange=()=>{const picked=[...input.files];input.value='';addFiles(picked)};
  // Listening on the whole tool (not just the drop box) stops the browser from opening a .notebook dropped elsewhere and losing the work.
  drop.addEventListener('dragover',event=>{if(!busy&&hasFiles(event))drop.classList.add('jpg-drop-hot')});
  drop.addEventListener('dragleave',event=>{if(!drop.contains(event.relatedTarget))drop.classList.remove('jpg-drop-hot')});
  root.addEventListener('dragover',event=>{if(hasFiles(event))event.preventDefault()});
  root.addEventListener('drop',event=>{
    if(!hasFiles(event))return;
    event.preventDefault();drop.classList.remove('jpg-drop-hot');
    addFiles([...event.dataTransfer.files]);
  });
  document.addEventListener('paste',event=>{
    if(!document.getElementById('tools-page').classList.contains('on')||!root.closest('.view')?.classList.contains('on'))return;
    const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
    if(files.length){event.preventDefault();addFiles(files)}
  });
  q('clear').onclick=()=>{
    if(busy)return;
    for(const notebook of notebooks)revokeNotebook(notebook);
    notebooks.length=0;selected.clear();previewId=null;anchorId=null;q('progress').value=0;status(t('jpg.ready'));renderPages();
  };
  q('deselect-all').onclick=()=>{selected.clear();updateActions()};
  q('view-toggle').onclick=()=>{viewMode=viewMode==='medium'?'details':'medium';updateViewToggle(true)};
  q('pages').onkeydown=event=>{
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    const pages=pageItems();if(!pages.length)return;
    event.preventDefault();
    const index=pages.findIndex(page=>page.id===previewId),step=event.key==='ArrowDown'?1:-1;
    const next=pages[Math.min(pages.length-1,Math.max(0,index+step))];
    setPreview(next.id);
    q('pages').querySelector(`[data-page-id="${next.id}"] .jpg-page-caption`)?.focus({preventScroll:false});
  };
  q('selected').onclick=()=>exportPages(false);
  q('all').onclick=()=>exportPages(true);
  mountGuide(root.querySelector('.tool-layout'),'jpg-maker');
  renderPages();
  addEventListener('beforeunload',event=>{
    if(busy){event.preventDefault();event.returnValue=''}
    for(const notebook of notebooks)revokeNotebook(notebook);
  });
}
