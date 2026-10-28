import {$,msg,track,countBucket,yieldNow} from './util.js?v=3.2.0';
import {mountGuide} from './instruction-panel.js?v=3.2.0';
import {zipSync} from './vendor/fflate.js';
import * as T from './nbtemplates.js?v=3.2.0';
import {t} from './i18n.js?v=3.2.0';
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
function pageSvg(pid,aid,w,h,href){
  const cx=w/2,cy=h/2;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+`<svg width="${Math.round(w)}" height="${Math.round(h)}" xml:id="page.${pid}">`+'<title>Untitled</title><g class="foreground"><image xmlns:xlink="http://www.w3.org/1999/xlink" '+
   `x="0.00" y="0.00" width="${w.toFixed(2)}" height="${h.toFixed(2)}" RotationPoint="(${cx.toFixed(6)},${cy.toFixed(6)})" transform="rotate(0.00,${cx.toFixed(2)},${cy.toFixed(2)})" xml:id="annotation.${aid}" visible="1" xlink:href="${href}" locked="30"/></g></svg>`;
}
async function build(items,report){
  const n=items.length,total=n+1,files={},hrefs=[],used=new Set(),pages=items.map((_,i)=>`page${i+1}.svg`),thumbs=[];let step=0,preview=null;
  for(let i=0;i<n;i++){
    const {raw,w,h,ext,th,pv}=await prep(items[i].file,i===0);
    thumbs.push(th);if(pv)preview=pv;
    let s=stem(items[i].file.name).replace(/[^A-Za-z0-9_-]/g,'');if(!s)s=`image${i+1}`;
    let name=`${s}.${ext}`,k=1;while(used.has(name.toLowerCase()))name=`${s}_${k++}.${ext}`;used.add(name.toLowerCase());
    files['images/'+name]=raw;hrefs.push('images/'+name);
    const m=Math.max(w,h),sc=m>T.TARGET_LONG_SIDE?T.TARGET_LONG_SIDE/m:1;
    files[pages[i]]=enc.encode(pageSvg(nid(),nid(),w*sc,h*sc,'images/'+name));
    report(++step,total,t('creator.progressEmbed',i+1,n));await tick();
  }
  const ft=pages.map(p=>`<file href="${p}"/>`).join(''),it=hrefs.map(p=>`<file href="${p}"/>`).join(''),fp=pages[0];
  files['imsmanifest.xml']=enc.encode(T.IMS_MANIFEST_HEADER+'<resources>'+
    `<resource identifier="group0_pages" href="${fp}" type="webcontent" adlcp:scormType="asset">${ft}</resource>`+
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
  root.innerHTML=`<div class="tool-layout"><div class="tool wideview"><div class="head"><h1>${t('tool.creator')}</h1></div>
  <div class="sub">${t('creator.sub')}</div>
  <div class="drop small" id="cr-drop" tabindex="0"><span class="drop-label">${t('creator.drop')}</span></div>
  <div class="cr"><div class="pane"><div class="listbox" id="cr-list" tabindex="0" role="listbox" aria-multiselectable="true"></div>
   <div class="btnrow cr-actions"><button class="btn" id="cr-top">${t('creator.top')}</button><button class="btn" id="cr-bot">${t('creator.bottom')}</button><button class="btn" id="cr-rm">${t('creator.remove')}</button><button class="btn" id="cr-clr">${t('creator.clear')}</button></div></div>
   <div class="pane"><div class="previewbox" id="cr-prev">${t('creator.selectPreview')}</div><div class="sub" id="cr-cap"></div><div class="preview-controls"><button class="btn" id="cr-zoom-out" aria-label="${t('creator.zoomOut')}">−</button><span id="cr-zoom-label">${t('creator.fit')}</span><button class="btn" id="cr-zoom-in" aria-label="${t('creator.zoomIn')}">+</button><button class="btn" id="cr-zoom-fit">${t('creator.fit')}</button></div></div></div>
  <div><progress id="cr-prog" max="1" value="0"></progress><div class="sub" id="cr-status">${t('creator.ready')}</div></div>
  <button class="btn primary wide" id="cr-save">${t('creator.save')}</button><input type="file" id="cr-file" multiple accept=".png,.jpg,.jpeg,.gif,.bmp" hidden></div>
  <dialog class="imgview" id="cr-view" aria-label="${t('creator.viewAria')}"><img alt="" draggable="false"><button type="button" class="imgview-close" id="cr-view-x" aria-label="${t('creator.viewClose')}" title="${t('creator.viewClose')}">×</button><div class="imgview-zoom" role="group" aria-label="${t('creator.viewZoom')}"><button type="button" id="cr-view-zi" aria-label="${t('creator.zoomIn')}">+</button><button type="button" id="cr-view-zo" aria-label="${t('creator.zoomOut')}">−</button><button type="button" id="cr-view-zf">${t('creator.fit')}</button><span id="cr-view-zl">100%</span></div><div class="imgview-name" id="cr-view-name"></div><div class="imgview-hint">${t('creator.viewHint')}</div></dialog>
  </div>`;
  let items=[],sel=new Set(),anchor=-1,busy=false,folder='',purl=null,zoom=1,panX=0,panY=0,previewItem=null;
  const list=$('cr-list'),status=s=>$('cr-status').textContent=s;
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
  $('cr-prev').onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.2:-.2))};
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
  function render(){
    if(!items.length)folder='';
    list.innerHTML='';items.forEach((it,i)=>{const r=document.createElement('div');r.className='lrow'+(sel.has(i)?' sel':'');r.setAttribute('role','option');r.setAttribute('aria-selected',sel.has(i));r.draggable=true;r.dataset.i=i;r.textContent=`${String(i+1).padStart(2,'0')}.  ${it.file.name}`;list.append(r)});
    status(items.length?t('creator.imageReady',items.length):t('creator.ready'));preview();
  }
  list.onclick=e=>{
    const r=e.target.closest('.lrow');if(!r||busy)return;const i=+r.dataset.i;
    if(e.shiftKey&&anchor>=0){sel=new Set();for(let k=Math.min(anchor,i);k<=Math.max(anchor,i);k++)sel.add(k)}
    else if(e.ctrlKey||e.metaKey){sel.has(i)?sel.delete(i):sel.add(i);anchor=i}else{sel=new Set([i]);anchor=i}
    refreshSel();
  };
  // Selection changed but the list did not: update the classes instead of rebuilding every row.
  function refreshSel(){list.querySelectorAll('.lrow').forEach(x=>{const on=sel.has(+x.dataset.i);x.classList.toggle('sel',on);x.setAttribute('aria-selected',on)});preview()}
  list.onkeydown=e=>{
    if(e.key==='Delete'){remove();return}
    const k=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;
    if(!k||busy||!items.length)return;
    e.preventDefault();
    const cur=sel.size?(k>0?Math.max(...sel):Math.min(...sel)):(k>0?-1:items.length),i=Math.min(items.length-1,Math.max(0,cur+k));
    sel=new Set([i]);anchor=i;refreshSel();
    list.querySelector(`.lrow[data-i="${i}"]`)?.scrollIntoView({block:'nearest'});
  };
  function remove(){if(busy||!sel.size)return;const next=Math.min(Math.min(...sel),items.length-sel.size-1);items=items.filter((_,i)=>!sel.has(i));sel=new Set();anchor=-1;if(items.length){const i=Math.max(0,next);sel.add(i);anchor=i}render()}
  function moveSel(toTop){
    if(busy||!sel.size)return;const idx=[...sel].sort((a,b)=>a-b),mv=idx.map(i=>items[i]),rest=items.filter((_,i)=>!sel.has(i));
    items=toTop?[...mv,...rest]:[...rest,...mv];const s=toTop?0:rest.length;sel=new Set(mv.map((_,k)=>s+k));render();
  }
  $('cr-top').onclick=()=>moveSel(true);$('cr-bot').onclick=()=>moveSel(false);$('cr-rm').onclick=remove;
  $('cr-clr').onclick=()=>{if(busy)return;items=[];sel=new Set();folder='';render()};
  // ---- adding files ----
  function add(files,skipped=[]){
    const ok=[],names=[...skipped];for(const f of files)SUP.test(f.name)?ok.push(f):names.push(f.name);
    if(files.length>1)ok.sort((a,b)=>coll.compare(a.name,b.name));
    for(const f of ok)items.push({file:f});
    if(ok.length){sel=new Set([items.length-1]);anchor=items.length-1}
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
  $('cr-drop').onclick=pick;$('cr-drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' ')pick()};
  $('cr-file').onchange=e=>{add([...e.target.files]);e.target.value=''};
  addEventListener('paste',e=>{if(root.classList.contains('on')&&root.closest('.page')?.classList.contains('on')&&!busy&&e.clipboardData.files.length)add([...e.clipboardData.files])});   // the view stays "on" while Home / Release Notes / About are shown, so the page must be visible too
  addEventListener('beforeunload',e=>{if(busy||items.length){e.preventDefault();e.returnValue=''}});   // the list of images would be lost
  // ---- drag: files in, or reorder rows ----
  const tool=root.firstElementChild;let dragging=false;
  const clearMarks=()=>list.querySelectorAll('.before,.after').forEach(x=>x.classList.remove('before','after'));
  const target=e=>{const r=e.target.closest('.lrow');if(!r)return {t:items.length,row:null};const b=r.getBoundingClientRect(),after=e.clientY>b.top+b.height/2;return {t:+r.dataset.i+(after?1:0),row:r,after}};
  list.ondragstart=e=>{const r=e.target.closest('.lrow');if(!r||busy){e.preventDefault();return}const i=+r.dataset.i;if(!sel.has(i)){sel=new Set([i]);list.querySelectorAll('.lrow').forEach(x=>x.classList.toggle('sel',+x.dataset.i===i));preview()}dragging=true;e.dataTransfer.setData('text/x-pl','1');e.dataTransfer.effectAllowed='move'};
  list.ondragend=()=>{dragging=false;clearMarks()};
  tool.ondragover=e=>{e.preventDefault();if(dragging){clearMarks();const {row,after}=target(e);if(row)row.classList.add(after?'after':'before')}else $('cr-drop').classList.add('hot')};
  tool.ondragleave=e=>{if(!tool.contains(e.relatedTarget)){clearMarks();$('cr-drop').classList.remove('hot')}};
  tool.ondrop=e=>{
    e.preventDefault();$('cr-drop').classList.remove('hot');if(busy)return;
    if(dragging&&!list.contains(e.target)){clearMarks();dragging=false;return}   // dropped outside the list: leave the order alone
    if(dragging){const {t:dropAt}=target(e);clearMarks();dragging=false;const idx=[...sel].sort((a,b)=>a-b),mv=idx.map(i=>items[i]),rest=items.filter((_,i)=>!sel.has(i)),at=dropAt-idx.filter(i=>i<dropAt).length;
      items=[...rest.slice(0,at),...mv,...rest.slice(at)];sel=new Set(mv.map((_,k)=>at+k));render()}
    else fromDrop(e.dataTransfer);
  };
  // ---- save ----
  $('cr-save').onclick=async()=>{
    if(busy)return;if(!items.length){msg(t('creator.noImagesTitle'),t('creator.noImages'),'warning');return}
    let handle=null,name=(folder||stem(items[0].file.name))+'.notebook';
    if('showSaveFilePicker' in window){try{handle=await showSaveFilePicker({suggestedName:name,types:[{description:'SMART Notebook',accept:{'application/octet-stream':['.notebook']}}]});name=handle.name}catch(err){if(err&&err.name==='AbortError')return;handle=null}}   // only a cancel stops here; any other picker problem falls back to a normal download
    else{const chosen=prompt(t('creator.prompt'),name);if(!chosen)return;name=chosen.trim();if(!name)return;if(!/\.notebook$/i.test(name))name+='.notebook'}
    busy=true;$('cr-save').disabled=true;$('cr-prog').value=0;
    try{
      const bytes=await build([...items],(c,tot,m)=>{$('cr-prog').max=tot;$('cr-prog').value=c;status(m)});
      if(handle){const w=await handle.createWritable();await w.write(bytes);await w.close()}
      else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
      track('creator/run','Creator run');track('creator/files/'+countBucket(items.length),'Creator pages '+countBucket(items.length));
      status(t('creator.doneStatus',items.length));await msg(t('creator.doneTitle'),t('creator.done',items.length,handle?handle.name:name));
    }catch(e){status(t('creator.failed'));msg(t('creator.failed'),String(e.message||e),'error')}
    busy=false;$('cr-save').disabled=false;$('cr-prog').value=0;
  };
}
