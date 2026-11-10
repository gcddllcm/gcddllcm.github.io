import {$,msg,track,countBucket,yieldNow} from './util.js?v=3.6.2';
import {mountGuide} from './instruction-panel.js?v=3.6.2';
import {zipSync} from './vendor/fflate.js?v=3.6.2';
import * as T from './nbtemplates.js?v=3.6.2';
import {t} from './i18n.js?v=3.6.2';
const SUP=/\.(png|jpe?g|gif|bmp)$/i,coll=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',nid=(n=25)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>A[b%36]).join('');
const enc=new TextEncoder(),tick=yieldNow;
const stem=n=>n.replace(/\.[^.]*$/,'');

function thumbOf(bmp,W,H){                    // centred on white, like the desktop thumbnails
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,W,H);x.imageSmoothingQuality='high';
  const r=Math.min(W/bmp.width,H/bmp.height),nw=Math.max(1,Math.floor(bmp.width*r)),nh=Math.max(1,Math.floor(bmp.height*r));
  x.drawImage(bmp,Math.floor((W-nw)/2),Math.floor((H-nh)/2),nw,nh);
  return new Promise(r=>c.toBlob(r,'image/png')).then(b=>b.arrayBuffer()).then(a=>new Uint8Array(a));
}
async function prep(file,wantPreview){         // JPEG/PNG embedded as-is; everything else becomes PNG. Decoded once: thumbnails come from the same bitmap.
  const u=new Uint8Array(await file.arrayBuffer()),bmp=await createImageBitmap(file,{imageOrientation:'none'});
  try{
    const w=bmp.width,h=bmp.height,jpg=u[0]===0xFF&&u[1]===0xD8,png=u[0]===0x89&&u[1]===0x50&&u[2]===0x4E&&u[3]===0x47;
    const th=await thumbOf(bmp,160,120),pv=wantPreview?await thumbOf(bmp,320,240):null;
    if(jpg||png)return {raw:u,w,h,ext:jpg?'jpg':'png',th,pv};
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(bmp,0,0);
    return {raw:new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer()),w,h,ext:'png',th,pv};
  }finally{bmp.close()}
}
const xmlText=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function pageSvg(pid,aid,w,h,href,title){
  const cx=w/2,cy=h/2;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+`<svg width="${Math.round(w)}" height="${Math.round(h)}" xml:id="page.${pid}">`+`<title>${xmlText(title||'Untitled')}</title><g class="foreground"><image xmlns:xlink="http://www.w3.org/1999/xlink" `+
   `x="0.00" y="0.00" width="${w.toFixed(2)}" height="${h.toFixed(2)}" RotationPoint="(${cx.toFixed(6)},${cy.toFixed(6)})" transform="rotate(0.00,${cx.toFixed(2)},${cy.toFixed(2)})" xml:id="annotation.${aid}" visible="1" xlink:href="${href}" locked="30"/></g></svg>`;
}
async function build(items,groups,report){
  const orderedGroups=groups.map(group=>({...group,items:items.filter(item=>item.groupId===group.id)})).filter(group=>group.items.length);
  const orderedItems=orderedGroups.flatMap(group=>group.items);
  const n=orderedItems.length,total=n+1,files={},hrefs=[],used=new Set(),pages=orderedItems.map((_,i)=>`page${i+1}.svg`),thumbs=[];let step=0,preview=null;
  for(let i=0;i<n;i++){
    const {raw,w,h,ext,th,pv}=await prep(orderedItems[i].file,i===0);
    thumbs.push(th);if(pv)preview=pv;
    let s=stem(orderedItems[i].file.name).replace(/[^A-Za-z0-9_-]/g,'');if(!s)s=`image${i+1}`;
    let name=`${s}.${ext}`,k=1;while(used.has(name.toLowerCase()))name=`${s}_${k++}.${ext}`;used.add(name.toLowerCase());
    files['images/'+name]=raw;hrefs.push('images/'+name);
    const m=Math.max(w,h),sc=m>T.TARGET_LONG_SIDE?T.TARGET_LONG_SIDE/m:1;
    files[pages[i]]=enc.encode(pageSvg(nid(),nid(),w*sc,h*sc,'images/'+name,orderedItems[i].title));
    report(++step,total,t('creator.progressEmbed',i+1,n));await tick();
  }
  let pageIndex=0;
  const groupItems=orderedGroups.map(group=>`<item id="${group.id}" identifierref="${group.id}_pages"><title>${xmlText(group.name)}</title></item>`).join('');
  const groupResources=orderedGroups.map(group=>{
    const groupPages=pages.slice(pageIndex,pageIndex+group.items.length);pageIndex+=group.items.length;
    const ft=groupPages.map(page=>`<file href="${page}"/>`).join('');
    return `<resource identifier="${group.id}_pages" href="${groupPages[0]}" type="webcontent" adlcp:scormType="asset">${ft}</resource>`;
  }).join('');
  const ft=pages.map(p=>`<file href="${p}"/>`).join(''),it=hrefs.map(p=>`<file href="${p}"/>`).join(''),fp=pages[0];
  files['imsmanifest.xml']=enc.encode(T.IMS_MANIFEST_HEADER+groupItems+'</organization></organizations><resources>'+
    groupResources+
    `<resource identifier="pages" href="${fp}" type="webcontent" adlcp:scormType="asset">${ft}</resource>`+
    `<resource identifier="images">${it}</resource>`+'<resource identifier="sounds"/><resource identifier="attachments"/><resource identifier="flash"/><resource identifier="videos"/><resource identifier="annotationmetadata"/><resource identifier="brush"/></resources></manifest>');
  files['metadata.xml']=enc.encode(T.METADATA_XML_TEMPLATE.replace('{doc_id}',nid(12)).replace('{created}',new Date().toISOString().slice(0,19)));
  files['metadata.rdf']=enc.encode(T.METADATA_RDF);files['settings.xml']=enc.encode(T.SETTINGS_XML);
  report(++step,total,t('creator.progressMeta'));
  files['preview.png']=preview;
  for(let i=0;i<n;i++)files[`Thumbnails/thumbnail${i+1}.png`]=thumbs[i];
  await tick();
  // PNG/JPEG are already compressed: store them as-is (level 0) and only deflate the small text files.
  const out={};for(const [name,data] of Object.entries(files))out[name]=/^(images\/|Thumbnails\/)|^preview\.png$/.test(name)?[data,{level:0}]:data;
  return zipSync(out,{level:6});
}

export function mount(root){
  root.innerHTML=`<div class="tool-layout"><div class="tool wideview"><h1 class="tool-title-sr">${t('tool.creator')}</h1>
  <div class="cr-mode-row"><div class="cr-mode-actions"><div class="cr-new-group-slot" aria-hidden="true"><button type="button" class="btn" id="cr-new-group" aria-label="${t('creator.newGroup')}" title="${t('creator.addGroup')}" disabled>${t('creator.newGroup')}</button></div><button type="button" class="btn flow-button" id="cr-advanced" aria-pressed="false" aria-controls="cr-list"><span class="flow-arrow flow-arrow-left" aria-hidden="true">&#8594;</span><span class="flow-label">${t('creator.advancedMode')}</span><span class="flow-circle" aria-hidden="true"></span><span class="flow-arrow flow-arrow-right" aria-hidden="true">&#8594;</span></button></div></div>
  <div class="cr"><div class="pane cr-left-pane" id="cr-drop" tabindex="0" aria-keyshortcuts="Enter Space"><div class="listbox" id="cr-list" tabindex="0" role="listbox" aria-label="${t('creator.imageList')}" aria-multiselectable="true"></div>
   <div class="btnrow cr-actions"><button class="btn" id="cr-top">${t('creator.top')}</button><button class="btn" id="cr-bot">${t('creator.bottom')}</button><button class="btn" id="cr-browse">${t('creator.browse')}</button><button class="btn" id="cr-rm">${t('creator.remove')}</button><button class="btn" id="cr-clr">${t('creator.clear')}</button></div>
    </div>
   <div class="pane"><div class="previewbox" id="cr-prev">${t('creator.selectPreview')}</div><div class="sub" id="cr-cap"></div><div class="preview-controls"><button class="btn" id="cr-zoom-out" aria-label="${t('creator.zoomOut')}">−</button><span id="cr-zoom-label">${t('creator.fit')}</span><button class="btn" id="cr-zoom-in" aria-label="${t('creator.zoomIn')}">+</button><button class="btn" id="cr-zoom-fit">${t('creator.fit')}</button></div></div></div>
  <div class="sub cr-status-sr" id="cr-status" role="status" aria-live="polite" aria-atomic="true">${t('creator.ready')}</div>
  <button class="btn primary wide" id="cr-save"><span>${t('creator.save')}</span></button><input type="file" id="cr-file" multiple accept=".png,.jpg,.jpeg,.gif,.bmp" hidden></div>
  <dialog class="imgview" id="cr-view" aria-label="${t('creator.viewAria')}"><img alt="" draggable="false"><button type="button" class="imgview-close" id="cr-view-x" aria-label="${t('creator.viewClose')}" title="${t('creator.viewClose')}">×</button><div class="imgview-zoom" role="group" aria-label="${t('creator.viewZoom')}"><button type="button" id="cr-view-zi" aria-label="${t('creator.zoomIn')}">+</button><button type="button" id="cr-view-zo" aria-label="${t('creator.zoomOut')}">−</button><button type="button" id="cr-view-zf">${t('creator.fit')}</button><span id="cr-view-zl">100%</span></div><div class="imgview-name" id="cr-view-name"></div><div class="imgview-hint">${t('creator.viewHint')}</div></dialog>
  </div>`;
  let items=[],groups=[{id:'group0',name:t('creator.groupDefault',1)}],nextGroupId=1,sel=new Set(),anchor=-1,activeIndex=-1,busy=false,folder='',purl=null,zoom=1,panX=0,panY=0,previewItem=null,advancedMode=false,titleSuggestion=null;
  const list=$('cr-list'),drop=$('cr-drop'),status=s=>$('cr-status').textContent=s;
  mountGuide(root.querySelector('.tool-layout'),'creator');
  function preview(){
    const i=sel.size===1?[...sel][0]:-1,box=$('cr-prev');
    if(i>=0&&items[i]&&items[i]===previewItem&&purl)return;   // the same image is already shown: do not decode it again
    if(purl){URL.revokeObjectURL(purl);purl=null}
    if(i<0||!items[i]){box.textContent=t('creator.selectPreview');box.classList.remove('pan','panning');$('cr-cap').textContent='';zoom=1;panX=panY=0;previewItem=null;zoomLabel();return}
    if(items[i]!==previewItem){zoom=1;panX=panY=0;previewItem=items[i]}
    purl=URL.createObjectURL(items[i].file);box.innerHTML='';const im=new Image();im.src=purl;im.draggable=false;im.ondragstart=e=>e.preventDefault();im.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;im.onload=applyView;box.append(im,fullBtn);$('cr-cap').textContent=items[i].file.name;zoomLabel();
  }
  function zoomLabel(){const l=$('cr-zoom-label');if(l)l.textContent=zoom===1?t('creator.fit'):`${Math.round(zoom*100)}%`}
  // Pan limits: the visible picture (contained in the box, then scaled) may not leave the box.
  function applyView(){
    const box=$('cr-prev'),im=box.querySelector('img');if(!im)return;
    if(zoom<=1){panX=panY=0}
    else if(im.naturalWidth){
      const bw=box.clientWidth,bh=box.clientHeight,s=Math.min(bw/im.naturalWidth,bh/im.naturalHeight);
      const mx=Math.max(0,(im.naturalWidth*s*zoom-bw)/2),my=Math.max(0,(im.naturalHeight*s*zoom-bh)/2);
      panX=Math.min(mx,Math.max(-mx,panX));panY=Math.min(my,Math.max(-my,panY));
    }
    im.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;box.classList.toggle('pan',zoom>1);
  }
  function setZoom(v){zoom=Math.min(4,Math.max(1,v));applyView();zoomLabel()}
  $('cr-zoom-in').onclick=()=>setZoom(zoom+.25);$('cr-zoom-out').onclick=()=>setZoom(zoom-.25);$('cr-zoom-fit').onclick=()=>setZoom(1);
  $('cr-prev').addEventListener('wheel',e=>{if(!previewItem)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.2:-.2))},{passive:false});
  // Click and drag the zoomed picture to look at its details.
  {
    const pv=$('cr-prev');let drag=null;
    const endPan=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;pv.classList.remove('panning')};
    pv.onpointerdown=e=>{if(e.button!==0||e.altKey||zoom<=1||!pv.querySelector('img')||e.target.closest('button'))return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};pv.setPointerCapture(e.pointerId);pv.classList.add('panning')};
    pv.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;applyView()};
    pv.ondblclick=e=>{if(e.target.closest('button'))return;if(zoom>1&&pv.querySelector('img'))setZoom(1)};
    pv.onpointerup=endPan;pv.onpointercancel=endPan;pv.onlostpointercapture=endPan;
    new ResizeObserver(()=>{if(zoom>1)applyView()}).observe(pv);
  }
  // ---- fullscreen preview: hover the picture and click the corner button, or Alt+click it ----
  const view=$('cr-view'),viewImg=view.querySelector('img'),pvBox=$('cr-prev');
  let vz=1,vpx=0,vpy=0,viewDrag=null,viewPanned=false;
  // Same clamp rules as the inline pane: the picture may not leave the window.
  function viewApply(){
    if(vz<=1){vpx=vpy=0}
    else if(viewImg.naturalWidth){
      const bw=viewImg.clientWidth,bh=viewImg.clientHeight,s=Math.min(bw/viewImg.naturalWidth,bh/viewImg.naturalHeight);
      const mx=Math.max(0,(viewImg.naturalWidth*s*vz-bw)/2),my=Math.max(0,(viewImg.naturalHeight*s*vz-bh)/2);
      vpx=Math.min(mx,Math.max(-mx,vpx));vpy=Math.min(my,Math.max(-my,vpy));
    }
    viewImg.style.transform=`translate(${vpx}px,${vpy}px) scale(${vz})`;
    viewImg.classList.toggle('zoomed',vz>1);
    $('cr-view-zl').textContent=`${Math.round(vz*100)}%`;
  }
  const viewZoom=v=>{vz=Math.min(4,Math.max(1,v));viewApply()};
  const openView=()=>{
    if(!previewItem||!purl||view.open)return;
    viewImg.src=purl;viewImg.alt=previewItem.file.name;
    $('cr-view-name').textContent=previewItem.file.name;
    vz=zoom;vpx=panX;vpy=panY;           // carry the zoom level you were inspecting in the pane
    viewDrag=null;view.classList.remove('panning');
    view.showModal();viewApply();
  };
  viewImg.addEventListener('load',()=>{if(view.open)viewApply()});
  new ResizeObserver(()=>{if(view.open&&vz>1)viewApply()}).observe(viewImg);
  $('cr-view-zi').onclick=()=>viewZoom(vz+.25);
  $('cr-view-zo').onclick=()=>viewZoom(vz-.25);
  $('cr-view-zf').onclick=()=>viewZoom(1);
  view.onwheel=e=>{e.preventDefault();viewZoom(vz+(e.deltaY<0?.2:-.2))};
  // Drag pans while zoomed. Buttons never start a drag; after a drag the release
  // click must not close the window (only a clean click closes).
  view.onpointerdown=e=>{
    viewPanned=false;
    if(e.button!==0||e.target.closest('button')||vz<=1)return;
    e.preventDefault();viewDrag={id:e.pointerId,x:e.clientX,y:e.clientY,px:vpx,py:vpy,moved:false};
    view.setPointerCapture(e.pointerId);view.classList.add('panning');
  };
  view.onpointermove=e=>{
    if(!viewDrag||e.pointerId!==viewDrag.id)return;
    const dx=e.clientX-viewDrag.x,dy=e.clientY-viewDrag.y;
    if(Math.abs(dx)+Math.abs(dy)>3)viewDrag.moved=true;
    vpx=viewDrag.px+dx;vpy=viewDrag.py+dy;viewApply();
  };
  const endViewDrag=e=>{
    if(!viewDrag||e.pointerId!==viewDrag.id)return;
    if(viewDrag.moved)viewPanned=true;
    viewDrag=null;view.classList.remove('panning');
  };
  view.onpointerup=endViewDrag;view.onpointercancel=endViewDrag;view.onlostpointercapture=endViewDrag;
  // Clean click anywhere closes; clicks on the zoom rail must not.
  view.onclick=e=>{if(e.target.closest('.imgview-zoom'))return;if(!viewPanned)view.close()};
  view.oncancel=()=>view.close();
  // While the fullscreen view is open, tool shortcuts (A/D/I/F...) must not fire behind it.
  view.addEventListener('keydown',e=>{if(e.key!=='Escape')e.stopPropagation()});
  const fullBtn=document.createElement('button');
  fullBtn.type='button';fullBtn.className='pv-full';
  fullBtn.title=t('creator.viewFullscreen');fullBtn.setAttribute('aria-label',t('creator.viewFullscreen'));
  fullBtn.innerHTML='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  fullBtn.onclick=openView;
  pvBox.onclick=e=>{if(e.altKey&&(e.target===pvBox.querySelector('img')||e.target===pvBox)){e.preventDefault();openView()}};
  function syncAdvancedControls(){
    const newGroup=$('cr-new-group');
    const index=sel.size===1?[...sel][0]:-1;
    newGroup.parentElement.classList.toggle('is-visible',advancedMode);
    newGroup.parentElement.setAttribute('aria-hidden',String(!advancedMode));
    newGroup.disabled=busy||!advancedMode||sel.size!==1||index<=0||items[index-1]?.groupId!==items[index]?.groupId;
  }
  function groupSeparator(group){
    const row=document.createElement('div');row.className='cr-group-separator';row.dataset.group=group.id;row.setAttribute('role','group');row.setAttribute('aria-label',`${t('creator.groupName')}: ${group.name||t('creator.unnamedGroup')}`);
    const index=document.createElement('span');index.className='cr-group-index';index.setAttribute('aria-hidden','true');index.textContent=String(groups.indexOf(group)+1).padStart(2,'0');
    const input=document.createElement('input');input.className='cr-group-name';input.type='text';input.maxLength=80;input.value=group.name;input.setAttribute('aria-label',t('creator.groupName'));
    let merge=null;
    input.oninput=()=>{group.name=input.value;row.setAttribute('aria-label',`${t('creator.groupName')}: ${group.name||t('creator.unnamedGroup')}`);if(merge)merge.setAttribute('aria-label',t('creator.mergeGroupNamed',group.name||t('creator.unnamedGroup')))};
    const count=document.createElement('span');count.className='cr-group-count';count.textContent=t('creator.groupPages',items.filter(item=>item.groupId===group.id).length);
    row.append(index,input,count);
    if(groups[0]?.id!==group.id){
      merge=document.createElement('button');merge.type='button';merge.className='cr-group-merge';merge.title=t('creator.mergeGroup');merge.setAttribute('aria-label',t('creator.mergeGroupNamed',group.name||t('creator.unnamedGroup')));
      merge.innerHTML='<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="none"><path d="M10.5 3.5 7 7l3.5 3.5M7 7h3a3 3 0 0 1 3 3v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      merge.onclick=()=>mergeGroup(group.id);row.append(merge);
    }
    return row;
  }
  function mergeGroup(groupId){
    if(busy)return;const index=groups.findIndex(group=>group.id===groupId);if(index<=0)return;
    const previous=groups[index-1],group=groups[index];
    for(const item of items)if(item.groupId===group.id)item.groupId=previous.id;
    groups.splice(index,1);render();
  }
  $('cr-advanced').onclick=()=>{
    if(busy)return;advancedMode=!advancedMode;
    $('cr-advanced').setAttribute('aria-pressed',String(advancedMode));
    render();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)root.querySelector('.cr').animate([{opacity:.55,transform:'translateY(12px) scale(.975)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:200,easing:'cubic-bezier(.2,.75,.25,1)'});
  };
  function addGroupBefore(index){
    if(busy)return;
    const item=items[index];if(!item)return;
    const currentGroup=groups.find(group=>group.id===item.groupId);if(!currentGroup)return;
    const groupIndex=groups.indexOf(currentGroup),id=`group${nextGroupId++}`,name=t('creator.groupDefault',groups.length+1);
    const sameGroupIndices=items.map((entry,i)=>entry.groupId===currentGroup.id?i:-1).filter(i=>i>=0);
    const splitBeforeFirst=index===sameGroupIndices[0];
    for(const pageIndex of sameGroupIndices)if(pageIndex>=index)items[pageIndex].groupId=id;
    groups.splice(groupIndex+(splitBeforeFirst?0:1),0,{id,name});
    render();
  }
  $('cr-new-group').onclick=()=>{if(sel.size===1)addGroupBefore([...sel][0])};
  function render(){
    if(!items.length)folder='';
    root.classList.toggle('advanced-mode',advancedMode);
    groups=groups.filter(group=>items.some(item=>item.groupId===group.id));
    if(!groups.length)groups=[{id:'group0',name:t('creator.groupDefault',1)}];
    for(const item of items)if(!groups.some(group=>group.id===item.groupId))item.groupId=groups[groups.length-1].id;
    list.innerHTML='';list.classList.toggle('empty',!items.length);
    if(activeIndex>=items.length)activeIndex=items.length-1;
    if(activeIndex<0&&sel.size)activeIndex=[...sel][0];
    if(!items.length){const empty=document.createElement('div');empty.className='cr-empty';empty.setAttribute('aria-hidden','true');empty.innerHTML=t('creator.drop');list.append(empty)}
    else items.forEach((it,i)=>{
      if(advancedMode&&(i===0||items[i-1].groupId!==it.groupId)){
        const group=groups.find(entry=>entry.id===it.groupId);
        if(group)list.append(groupSeparator(group));
      }
      const r=document.createElement('div');r.id=`cr-option-${i}`;r.className='lrow'+(sel.has(i)?' sel':'');r.setAttribute('role','option');r.setAttribute('aria-selected',sel.has(i));r.draggable=true;r.dataset.i=i;
      if(advancedMode){
        const filename=document.createElement('span');filename.className='lrow-file';filename.textContent=`${String(i+1).padStart(2,'0')}.  ${it.file.name}`;
        const titleRow=document.createElement('div');titleRow.className='lrow-title-row';
        const titleText=document.createElement('button');titleText.type='button';titleText.className='lrow-title-trigger';titleText.textContent=it.title||t('creator.untitledPage');titleText.setAttribute('aria-label',`${t('creator.editPageTitle')}: ${it.file.name}`);titleText.title=t('creator.editPageTitle');
        const title=document.createElement('input');title.type='text';title.className='lrow-title';title.maxLength=120;title.value=it.title;title.placeholder=t('creator.untitledPage');title.setAttribute('aria-label',`${t('creator.pageTitle')}: ${it.file.name}`);title.hidden=true;
        const suggestionHint=document.createElement('span');suggestionHint.className='lrow-title-suggestion';suggestionHint.setAttribute('aria-live','polite');suggestionHint.setAttribute('aria-label',t('creator.applyTitleSuggestion'));suggestionHint.hidden=true;
        const suggestionKey=document.createElement('kbd');suggestionKey.textContent='Tab';
        const suggestionArrow=document.createElement('span');suggestionArrow.className='lrow-title-suggestion-arrow';suggestionArrow.textContent='→';suggestionArrow.setAttribute('aria-hidden','true');
        const suggestionText=document.createElement('span');suggestionText.className='lrow-title-suggestion-text';
        suggestionHint.append(suggestionKey,suggestionArrow,suggestionText);
        let originalTitle=it.title;
        const startEditing=()=>{
          originalTitle=it.title;title.value=it.title;
          title.style.width=`${titleText.getBoundingClientRect().width}px`;
          const suggestion=titleSuggestion?.targetIndex===i?titleSuggestion.value:'';
          title.placeholder=suggestion||t('creator.untitledPage');
          suggestionText.textContent=suggestion;
          suggestionHint.hidden=!suggestion;
          titleRow.classList.add('is-editing');titleText.hidden=true;title.hidden=false;title.focus();title.select();
        };
        titleText.onclick=()=>{selectImage(i,{});startEditing()};
        title.oninput=()=>{it.title=title.value};
        title.onkeydown=e=>{
          if(e.key==='Enter'){e.preventDefault();title.blur()}
          else if(e.key==='Escape'){e.preventDefault();it.title=originalTitle;title.value=originalTitle;title.blur()}
          else if(e.key==='Tab'&&titleSuggestion?.targetIndex===i){e.preventDefault();title.value=titleSuggestion.value;title.dispatchEvent(new Event('input',{bubbles:true}));titleSuggestion=null;suggestionHint.hidden=true;title.placeholder=t('creator.untitledPage')}
          else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
            const nextIndex=i+(e.key==='ArrowUp'?-1:1);
            if(nextIndex>=0&&nextIndex<items.length){e.preventDefault();title.blur();selectImage(nextIndex,{});list.querySelector(`#cr-option-${nextIndex} .lrow-title-trigger`)?.click()}
          }
        };
        title.onblur=()=>{
          it.title=title.value;
          if(title.value!==originalTitle){
            const match=/(\d+)(?!.*\d)/.exec(title.value),number=match?Number(match[0]):NaN;
            titleSuggestion=match&&Number.isSafeInteger(number)&&i+1<items.length?{targetIndex:i+1,value:`${title.value.slice(0,match.index)}${String(number+1).padStart(match[0].length,'0')}${title.value.slice(match.index+match[0].length)}`}:null;
          }
          titleText.textContent=it.title||t('creator.untitledPage');title.hidden=true;titleText.hidden=false;suggestionHint.hidden=true;titleRow.classList.remove('is-editing')
        };
        titleRow.append(titleText,title,suggestionHint);
        r.append(filename,titleRow);
      }else r.textContent=`${String(i+1).padStart(2,'0')}.  ${it.file.name}`;
      list.append(r);
    });
    if(activeIndex>=0)list.setAttribute('aria-activedescendant',`cr-option-${activeIndex}`);else list.removeAttribute('aria-activedescendant');
    drop.classList.toggle('has-images',items.length>0);
    status(items.length?t('creator.imageReady',items.length):t('creator.ready'));preview();syncAdvancedControls();
  }
  render();
  list.onclick=e=>{
    if(e.target.closest('input,button'))return;
    const r=e.target.closest('.lrow');if(!r||busy)return;const i=+r.dataset.i;
    selectImage(i,e);
  };
  function selectImage(i,e){if(busy)return;activeIndex=i;list.focus();if(e.shiftKey&&anchor>=0){sel=new Set();for(let k=Math.min(anchor,i);k<=Math.max(anchor,i);k++)sel.add(k)}else if(e.ctrlKey||e.metaKey){sel.has(i)?sel.delete(i):sel.add(i);anchor=i}else{sel=new Set([i]);anchor=i}refreshSel()}
  // Selection changed but the list did not: update the classes instead of rebuilding every row.
  function refreshSel(){list.querySelectorAll('.lrow').forEach(x=>{const on=sel.has(+x.dataset.i);x.classList.toggle('sel',on);x.setAttribute('aria-selected',on)});if(activeIndex>=0)list.setAttribute('aria-activedescendant',`cr-option-${activeIndex}`);else list.removeAttribute('aria-activedescendant');preview();syncAdvancedControls()}
  list.onkeydown=e=>{
    if(e.target.closest('input,button'))return;
    if(e.key==='F2'&&activeIndex>=0){e.preventDefault();list.querySelector(`#cr-option-${activeIndex} .lrow-title-trigger`)?.click();return}
    if(e.key==='Delete'){remove();return}
    const k=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;
    if(!k||busy||!items.length)return;
    e.preventDefault();
    const cur=activeIndex>=0?activeIndex:(k>0?-1:items.length),i=Math.min(items.length-1,Math.max(0,cur+k));
    activeIndex=i;sel=new Set([i]);anchor=i;refreshSel();
    list.querySelector(`.lrow[data-i="${i}"]`)?.scrollIntoView({block:'nearest'});
  };
  function remove(){if(busy||!sel.size)return;const next=Math.min(Math.min(...sel),items.length-sel.size-1);items=items.filter((_,i)=>!sel.has(i));sel=new Set();anchor=-1;activeIndex=-1;if(items.length){const i=Math.max(0,next);sel.add(i);anchor=i;activeIndex=i}render()}
  function moveSel(toTop){
    if(busy||!sel.size)return;
    const idx=[...sel].sort((a,b)=>a-b),mv=idx.map(i=>items[i]);
    if(advancedMode){
      const groupIds=new Set(mv.map(item=>item.groupId));if(groupIds.size!==1)return;
      const groupId=mv[0].groupId,groupIndexes=items.map((item,i)=>item.groupId===groupId?i:-1).filter(i=>i>=0);
      const rest=items.filter((_,i)=>!sel.has(i)),remainingIndexes=rest.map((item,i)=>item.groupId===groupId?i:-1).filter(i=>i>=0);
      if(!remainingIndexes.length)return;
      const insertAt=toTop?remainingIndexes[0]:remainingIndexes[remainingIndexes.length-1]+1;
      const position=Number.isFinite(insertAt)?insertAt:(toTop?groupIndexes[0]:rest.length);
      items=[...rest.slice(0,position),...mv,...rest.slice(position)];sel=new Set(mv.map((_,k)=>position+k));activeIndex=position;render();return;
    }
    const rest=items.filter((_,i)=>!sel.has(i));items=toTop?[...mv,...rest]:[...rest,...mv];const s=toTop?0:rest.length;sel=new Set(mv.map((_,k)=>s+k));activeIndex=s;render();
  }
  $('cr-top').onclick=()=>moveSel(true);$('cr-bot').onclick=()=>moveSel(false);$('cr-rm').onclick=remove;
  $('cr-clr').onclick=()=>{if(busy)return;items=[];sel=new Set();folder='';render()};
  // ---- adding files ----
  function add(files,skipped=[]){
    const ok=[],names=[...skipped];for(const f of files)SUP.test(f.name)?ok.push(f):names.push(f.name);
    if(files.length>1)ok.sort((a,b)=>coll.compare(a.name,b.name));
    for(const f of ok)items.push({file:f,title:'',groupId:groups[groups.length-1].id});
    if(ok.length){sel=new Set([items.length-1]);anchor=items.length-1;activeIndex=items.length-1}
    render();if(ok.length)list.scrollTop=list.scrollHeight;
    if(names.length)msg(t('creator.unsupportedTitle'),t('creator.unsupported',names.slice(0,12).join('\n')+(names.length>12?'\n...':'')),'warning');
  }
  const readDir=async entry=>{const out=[],rd=entry.createReader();let b;do{b=await new Promise(r=>rd.readEntries(r,()=>r([])));out.push(...b)}while(b.length);
    const fs=await Promise.all(out.filter(e=>e.isFile).map(e=>new Promise(r=>e.file(r,()=>r(null)))));return fs.filter(Boolean).sort((a,b)=>coll.compare(a.name,b.name))};
  async function fromDrop(dt){
    const ents=[...dt.items].filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?i.webkitGetAsEntry():null),flat=[...dt.files];
    const all=[];let first=true;
    if(ents.length&&ents.every(Boolean)){for(const e of ents){if(e.isDirectory){if(first)folder=e.name;all.push(...await readDir(e))}else{const f=await new Promise(r=>e.file(r,()=>r(null)));if(f)all.push(f)}first=false}}
    else all.push(...flat);
    add(all);
  }
  const pick=async()=>{if(busy)return;if('showOpenFilePicker' in window){try{const hs=await showOpenFilePicker({multiple:true,types:[{description:'Images',accept:{'image/*':['.png','.jpg','.jpeg','.gif','.bmp']}}]});add(await Promise.all(hs.map(h=>h.getFile())))}catch{}}else $('cr-file').click()};
  $('cr-browse').onclick=pick;
  drop.onclick=e=>{if(e.target.closest('button,.lrow')||(items.length&&e.target.closest('#cr-list')))return;pick()};
  drop.onkeydown=e=>{if(e.target===drop&&(e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();pick()}};
  $('cr-file').onchange=e=>{add([...e.target.files]);e.target.value=''};
  addEventListener('paste',e=>{if(root.classList.contains('on')&&root.closest('.page')?.classList.contains('on')&&!busy&&e.clipboardData.files.length)add([...e.clipboardData.files])});   // the view stays "on" while Home / Release Notes / About are shown, so the page must be visible too
  addEventListener('beforeunload',e=>{if(busy||items.length){e.preventDefault();e.returnValue=''}});   // the list of images would be lost
  // ---- drag: files in, or reorder rows ----
  const tool=root.firstElementChild;let dragging=false;
  const clearMarks=()=>list.querySelectorAll('.before,.after').forEach(x=>x.classList.remove('before','after'));
  const target=e=>{const r=e.target.closest('.lrow');if(!r)return {t:items.length,row:null};const b=r.getBoundingClientRect(),after=e.clientY>b.top+b.height/2;return {t:+r.dataset.i+(after?1:0),row:r,after}};
  list.ondragstart=e=>{const r=e.target.closest('.lrow');if(!r||e.target.closest('input,button')||busy){e.preventDefault();return}const i=+r.dataset.i;if(!sel.has(i)){sel=new Set([i]);list.querySelectorAll('.lrow').forEach(x=>x.classList.toggle('sel',+x.dataset.i===i));preview()}dragging=true;e.dataTransfer.setData('text/x-pl','1');e.dataTransfer.effectAllowed='move'};
  list.ondragend=()=>{dragging=false;clearMarks()};
  tool.ondragover=e=>{e.preventDefault();if(dragging){clearMarks();const {row,after}=target(e);if(row)row.classList.add(after?'after':'before')}else if(drop.contains(e.target)&&[...(e.dataTransfer?.types||[])].includes('Files'))drop.classList.add('hot')};
  tool.ondragleave=e=>{if(!tool.contains(e.relatedTarget))clearMarks();if(!drop.contains(e.relatedTarget))drop.classList.remove('hot')};
  tool.ondrop=e=>{
    e.preventDefault();drop.classList.remove('hot');if(busy)return;
    if(dragging&&!list.contains(e.target)){clearMarks();dragging=false;return}   // dropped outside the list: leave the order alone
    if(dragging){const {t:dropAt,row}=target(e);clearMarks();dragging=false;const idx=[...sel].sort((a,b)=>a-b),mv=idx.map(i=>items[i]),rest=items.filter((_,i)=>!sel.has(i)),at=dropAt-idx.filter(i=>i<dropAt).length;
      if(advancedMode){
        const destination=items[row?+row.dataset.i:items.length-1]?.groupId;
        if(destination)for(const item of mv)item.groupId=destination;
      }
      items=[...rest.slice(0,at),...mv,...rest.slice(at)];sel=new Set(mv.map((_,k)=>at+k));activeIndex=at;render()}
    else if(drop.contains(e.target))fromDrop(e.dataTransfer);
  };
  // ---- save ----
  $('cr-save').onclick=async()=>{
    if(busy)return;const saveButton=$('cr-save');if(!items.length){msg(t('creator.noImagesTitle'),t('creator.noImages'),'warning');return}
    let handle=null,name=(folder||stem(items[0].file.name))+'.notebook';
    if('showSaveFilePicker' in window){try{handle=await showSaveFilePicker({suggestedName:name,types:[{description:'SMART Notebook',accept:{'application/octet-stream':['.notebook']}}]});name=handle.name}catch(err){if(err&&err.name==='AbortError')return;handle=null}}   // only a cancel stops here; any other picker problem falls back to a normal download
    else{const chosen=prompt(t('creator.prompt'),name);if(!chosen)return;name=chosen.trim();if(!name)return;if(!/\.notebook$/i.test(name))name+='.notebook'}
    busy=true;$('cr-save').disabled=true;$('cr-advanced').disabled=true;
    root.querySelectorAll('.cr-group-separator input,.cr-group-merge,.lrow-title,#cr-new-group').forEach(el=>{el.disabled=true});
    saveButton.classList.add('is-building');
    saveButton.setAttribute('aria-busy','true');
    saveButton.style.setProperty('--save-progress','0%');
    try{
      const bytes=await build([...items],groups,(c,tot,m)=>{
        saveButton.style.setProperty('--save-progress',`${Math.round(c/tot*100)}%`);
        status(m);
      });
      if(handle){const w=await handle.createWritable();await w.write(bytes);await w.close()}
      else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)}
      track('creator/run','Creator run');track('creator/files/'+countBucket(items.length),'Creator pages '+countBucket(items.length));
      status(t('creator.doneStatus',items.length));await msg(t('creator.doneTitle'),t('creator.done',items.length,handle?handle.name:name));
    }catch(e){status(t('creator.failed'));msg(t('creator.failed'),String(e.message||e),'error')}
    busy=false;saveButton.disabled=false;saveButton.classList.remove('is-building');saveButton.removeAttribute('aria-busy');saveButton.style.removeProperty('--save-progress');$('cr-advanced').disabled=false;
    root.querySelectorAll('.cr-group-separator input,.cr-group-merge,.lrow-title,#cr-new-group').forEach(el=>{el.disabled=false});
    syncAdvancedControls();
  };
}
