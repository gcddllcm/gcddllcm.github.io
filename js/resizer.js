import {$,msg,track,countBucket,yieldNow} from './util.js?v=3.2.1';
import {mountGuide} from './instruction-panel.js?v=3.2.1';
import {t} from './i18n.js?v=3.2.1';
import {pngSetDpi,jpgSetDpi,bmpEncode,readImageInfo,resizeLanczos,ppm} from './imgcore.js?v=3.2.1';
import {zipSync} from './vendor/fflate.js';
const HAS_FS='showDirectoryPicker' in window;
const sleep=yieldNow;
const IN_THREAD_MAX_MP=40;     // the page itself only processes images up to this size (fallback path)
const HEAD_BYTES=262144;       // enough to read width/height from any common image header
const SUPPORTED=new Set(['.jpg','.jpeg','.png','.bmp','.webp']);
const extOf=n=>(n.match(/\.[^.]+$/)||[''])[0].toLowerCase();

// Same Lanczos code as the worker (imgcore.js); sleep() keeps the page responsive on this fallback path.
const resize=(img,ow,oh)=>resizeLanczos(img,ow,oh,sleep);

// ---- decode / encode ----
export async function decode(file){
  const bmp=await createImageBitmap(file,{imageOrientation:'none'});
  if(bmp.width*bmp.height>IN_THREAD_MAX_MP*1e6){const w=bmp.width,h=bmp.height;bmp.close();throw new Error(`Image too large: ${w}×${h} (${(w*h/1e6).toFixed(1)} MP) exceeds ${IN_THREAD_MAX_MP} MP safety limit`)}
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0);bmp.close();
  const d=x.getImageData(0,0,c.width,c.height);return {width:c.width,height:c.height,data:d.data};
}

async function encode(img,ext,dpi,quality=1.0){
  if(ext==='.bmp')return bmpEncode(img,dpi);
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  c.getContext('2d').putImageData(new ImageData(img.data,img.width,img.height),0,0);
  const type={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
  if(!type)throw new Error(t('resizer.unsupported',ext));
  const blob=await new Promise(r=>c.toBlob(r,type,quality));
  if(!blob||blob.type!==type)throw new Error(t('resizer.encodeError'));
  const u8=new Uint8Array(await blob.arrayBuffer());
  if(type==='image/png')return new Blob([pngSetDpi(u8,dpi)],{type});
  if(type==='image/jpeg')return new Blob([jpgSetDpi(u8,dpi)],{type});
  return blob;
}

async function verify(blob,ext,w,h,dpi){
  const u8=new Uint8Array(await blob.arrayBuffer()),info=readImageInfo(u8,ext);
  let ok=(info.width===w&&info.height===h);
  if(!ok&&(info.width===0||info.height===0)){
    const b=await createImageBitmap(blob,{imageOrientation:'none'});
    ok=(b.width===w&&b.height===h);
    b.close();
  }
  if(!ok)return t('resizer.sizeError');
  if(info.dpi!==undefined&&info.dpi!==dpi)return t('resizer.dpiMismatch',info.dpi,dpi);
  return null;
}

// ---- Multi-threaded Web Worker Pool ----
// Hardened: per-task timeout, per-worker error isolation, automatic respawn
const WORKER_TIMEOUT_MS = 60000; // base time per task; big images get more (see pump) before the worker is force-killed

class ResizerPool {
  constructor(size){
    this.size=Math.max(1,Math.min(size||(navigator.hardwareConcurrency||4),8));
    this.workers=[];
    this.idle=[];
    this.queue=[];
    this.seq=0;
    this.handlers=new Map();  // id -> {res, rej, worker, timer}
    this.workerTaskMap=new Map(); // worker -> id (which task a worker is running)
    this.inflightCost=0;      // estimated bytes of memory used by tasks now running
    this.spawnFailures=0;     // workers that died before doing any work (e.g. script failed to load)
    // Memory budget for all running tasks together. Typical batches stay far below it, so every
    // worker keeps busy; only a handful of very large images at once get queued until others finish.
    this.budget=Math.min(4,Math.max(1,(navigator.deviceMemory||4)*0.5))*1073741824;
    this.supported=typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined';
    if(this.supported){
      try{
        for(let i=0;i<this.size;i++) this._spawnWorker();
      }catch{
        this.supported=false;
      }
    }
  }

  _spawnWorker(){
    const w=new Worker(new URL('./resizer-worker.js?v=3.2.1',import.meta.url),{type:'module'});
    w.onmessage=e=>{
      const {id,ok,blob,w:rw,h:rh,dpi:rdpi,error}=e.data;
      const h=this.handlers.get(id);
      w._alive=true;this.spawnFailures=0;
      if(h){
        clearTimeout(h.timer);
        this.handlers.delete(id);
        this.inflightCost-=h.cost;
        this.workerTaskMap.delete(w);
        if(ok) h.res({blob,w:rw,h:rh,dpi:rdpi});
        else h.rej(Object.assign(new Error(error),{fromWorker:true}));   // a real problem with this file
      }
      this.idle.push(w);
      this.pump();
    };
    w.onerror=err=>{
      // Only reject the task this specific worker was working on — not all tasks
      const taskId=this.workerTaskMap.get(w);
      if(taskId!=null){
        const h=this.handlers.get(taskId);
        if(h){
          clearTimeout(h.timer);
          this.handlers.delete(taskId);
          this.inflightCost-=h.cost;
          h.rej(Object.assign(new Error(err?.message||'Worker crashed'),{crash:true}));
        }
        this.workerTaskMap.delete(w);
      }else if(!w._alive&&++this.spawnFailures>=3){
        // Workers keep dying on start-up: stop respawning and let the page handle the files itself.
        this.supported=false;
        for(const x of [...this.workers])this._removeWorker(x);
        this._failQueue();
        return;
      }
      // Remove the crashed worker and respawn a replacement
      this._removeWorker(w);
      try{ this._spawnWorker(); }catch{}
      this.pump();
    };
    this.workers.push(w);
    this.idle.push(w);
    return w;
  }

  _removeWorker(w){
    try{w.terminate()}catch{}
    const wi=this.workers.indexOf(w);if(wi>=0)this.workers.splice(wi,1);
    const ii=this.idle.indexOf(w);if(ii>=0)this.idle.splice(ii,1);
  }

  _timeoutWorker(id){
    const h=this.handlers.get(id);
    if(!h)return;
    this.handlers.delete(id);
    this.inflightCost-=h.cost;
    const w=h.worker;
    if(w){
      this.workerTaskMap.delete(w);
      // Terminate the hung worker and respawn
      this._removeWorker(w);
      try{ this._spawnWorker(); }catch{}
    }
    h.rej(Object.assign(new Error(`Worker timeout: processing took longer than ${Math.round((h.limit||WORKER_TIMEOUT_MS)/1000)} seconds`),{timeout:true}));
    this.pump();
  }

  _failQueue(){
    for(const {rej} of this.queue.splice(0))rej(Object.assign(new Error('Workers unavailable'),{crash:true}));
  }

  pump(){
    while(this.idle.length&&this.queue.length){
      const next=this.queue[0];
      // Wait for running tasks to free memory first (the first task always runs, so this never stalls).
      if(this.handlers.size>0&&this.inflightCost+next.cost>this.budget)break;
      this.queue.shift();
      const w=this.idle.pop(),{task,res,rej,cost}=next;
      const id=++this.seq;
      // Time allowed grows with the estimated work (cost is in bytes): a 40 MP image gets roughly twice as long as a small one.
      const limit=WORKER_TIMEOUT_MS+Math.min(240000,Math.round(cost/1e9*60000));
      const timer=setTimeout(()=>this._timeoutWorker(id),limit);
      this.handlers.set(id,{res,rej,worker:w,timer,cost,limit});
      this.inflightCost+=cost;
      this.workerTaskMap.set(w,id);
      w.postMessage({id,...task});
    }
  }

  dispatch(task,cost=0){
    return new Promise((res,rej)=>{
      if(!this.supported){rej(Object.assign(new Error('Workers not supported'),{crash:true}));return}
      this.queue.push({task,res,rej,cost});
      this.pump();
    });
  }

  destroy(){
    for(const [id,h] of this.handlers.entries()){
      clearTimeout(h.timer);
      h.rej(new Error('Pool destroyed'));
    }
    this.handlers.clear();this.inflightCost=0;
    this.workerTaskMap.clear();
    for(const w of this.workers) try{w.terminate()}catch{}
    this.workers=[];this.idle=[];this.queue=[];
  }
}

let pool=null;
function getPool(){
  if(!pool)pool=new ResizerPool();
  return pool;
}

// Header-only look at a file: does it already have the requested pixel size?
async function headInfo(file,ext){
  try{return readImageInfo(new Uint8Array(await file.slice(0,HEAD_BYTES).arrayBuffer()),ext)}catch{return {width:0,height:0}}
}
// Rough peak memory a task will need, so large images are not all processed at the same moment.
function estimateCost(file,ow,oh,head){
  if(!ow||!oh)return file.size*2+1048576;
  const {width:iw,height:ih}=head;
  if(iw===ow&&ih===oh)return file.size*2+1048576;        // same size: DPI-only fast path
  const sw=iw||4000,sh=ih||3000;                          // unknown header: assume 12 MP
  return sw*sh*8+ow*sh*16+ow*oh*8;
}

// DPI-only change: rewrite just the header, never re-encode the pixels.
async function dpiOnly(file,dpi,ext){
  const buf=await file.arrayBuffer(),u8=new Uint8Array(buf);
  let outBlob;
  if(ext==='.png')outBlob=new Blob([pngSetDpi(u8,dpi)],{type:'image/png'});
  else if(ext==='.jpg'||ext==='.jpeg')outBlob=new Blob([jpgSetDpi(u8,dpi)],{type:'image/jpeg'});
  else if(ext==='.bmp'){
    const v=new DataView(u8.buffer);
    if(u8.length<54||v.getUint32(14,true)<40)throw new Error('Unsupported BMP header: DPI cannot be set on this file');   // an old OS/2 header has no DPI fields at these offsets
    v.setInt32(38,ppm(dpi),true);v.setInt32(42,ppm(dpi),true);
    outBlob=new Blob([u8],{type:'image/bmp'});
  }else outBlob=file;
  const outU8=new Uint8Array(await outBlob.arrayBuffer()),info=readImageInfo(outU8,ext);
  return {blob:outBlob,w:info.width,h:info.height};
}

// In-thread fallback, only used if workers are unavailable or crashed (never for a file the worker rejected)
async function processInThread(file,ow,oh,dpi,ext,quality){
  if(!ow&&!oh)return dpiOnly(file,dpi,ext);
  const head=await headInfo(file,ext);
  if(head.width===ow&&head.height===oh)return dpiOnly(file,dpi,ext);
  let img=await decode(file);
  if(ow&&oh&&(img.width!==ow||img.height!==oh))img=await resize(img,ow,oh);
  const blob=await encode(img,ext,dpi,quality);
  return {blob,w:img.width,h:img.height};
}

// ---- view ----
export function mount(root){
  root.innerHTML=`<div class="tool-layout"><div class="tool"><div class="head"><h1>${t('tool.resizer')}</h1></div>
  <div class="sub">${t('resizer.sub')}</div>
  <div class="row3"><label>${t('resizer.dpi')}<input id="rz-dpi" value="300" inputmode="numeric"></label><label>${t('resizer.width')}<input id="rz-w" value="2480" inputmode="numeric"></label><label>${t('resizer.height')}<input id="rz-h" value="3508" inputmode="numeric"></label></div>
  <div class="resizer-settings"><div class="quality-row"><label for="rz-q">${t('resizer.quality')}</label><select id="rz-q"><option value="75">75%</option><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option><option value="100" selected>${t('resizer.qualityDefault')}</option></select></div>
  <button class="btn reset-btn" id="rz-reset">${t('resizer.reset')}</button></div>
  <div class="resizer-output-row"><button class="btn primary" id="rz-out">${t('resizer.output')}</button><div class="path" id="rz-path">${HAS_FS?t('resizer.noFolder'):t('resizer.downloadMode')}</div></div>
  <div class="drop" id="rz-drop" tabindex="0"><span class="drop-label">${t('resizer.drop')}</span></div>
  <div class="tool-progress"><progress id="rz-prog" max="1" value="0"></progress><div class="sub" id="rz-status">${t('resizer.ready')}</div></div>
  <input type="file" id="rz-file" multiple accept=".jpg,.jpeg,.png,.bmp,.webp" hidden></div>
  </div>`;

  let outDir=null,busy=false;
  const drop=$('rz-drop'),status=t=>$('rz-status').textContent=t;
  mountGuide(root.querySelector('.tool-layout'),'resizer');
  $('rz-reset').onclick=()=>{$('rz-dpi').value='300';$('rz-w').value='2480';$('rz-h').value='3508';$('rz-q').value='100'};
  if(!HAS_FS)$('rz-out').hidden=true;
  $('rz-out').onclick=async()=>{if(busy)return;try{outDir=await showDirectoryPicker({mode:'readwrite'});$('rz-path').textContent=outDir.name;$('rz-path').classList.add('set')}catch{}};
  const pick=async()=>{
    if(busy)return;
    if('showOpenFilePicker' in window){try{const hs=await showOpenFilePicker({multiple:true,types:[{description:'Images',accept:{'image/*':['.jpg','.jpeg','.png','.bmp','.webp']}}]});run(await Promise.all(hs.map(async h=>({file:await h.getFile(),handle:h}))))}catch{}}
    else $('rz-file').click();
  };
  drop.onclick=pick;drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')pick()};
  $('rz-file').onchange=e=>{run([...e.target.files].map(file=>({file,handle:null})));e.target.value=''};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('hot')};drop.ondragleave=()=>drop.classList.remove('hot');
  drop.ondrop=async e=>{
    e.preventDefault();drop.classList.remove('hot');if(busy)return;
    const items=[...e.dataTransfer.items].filter(i=>i.kind==='file');
    run(await Promise.all(items.map(async it=>{const hp=it.getAsFileSystemHandle?it.getAsFileSystemHandle():null,file=it.getAsFile();let h=null;try{h=await hp}catch{}return{file,handle:h&&h.kind==='file'?h:null}})));
  };
  function settings(){
    const dpi=$('rz-dpi').value.trim(),w=$('rz-w').value.trim(),h=$('rz-h').value.trim(),bad=(title,s)=>{msg(title,s,'error');return null};
    if(HAS_FS&&!outDir){msg(t('nb.error'),t('resizer.selectFolder'),'error');return null}
    if(!/^\d+$/.test(dpi)||+dpi<=0)return bad(t('resizer.invalid'),t('resizer.dpiError'));
    if(+dpi>65535)return bad(t('resizer.invalid'),t('resizer.dpiRange'));
    for(const [l,r] of [[t('resizer.widthName'),w],[t('resizer.heightName'),h]]){
      if(r&&(!/^\d+$/.test(r)||+r<=0))return bad(t('resizer.invalid'),t('resizer.dimensionError',l));
      if(r&&+r>32767)return bad(t('resizer.invalid'),t('resizer.dimensionMax',l));
    }
    if(!w!==!h)return bad(t('resizer.invalid'),t('resizer.bothError'));
    return {dpi:+dpi,w:w?+w:0,h:h?+h:0,quality:(+$('rz-q').value||100)/100};
  }
  async function save(name,blob,src){
    if(!outDir){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return blob}
    let n=name;
    // A file with this name already exists. If it is the original (or we cannot tell, e.g. a dragged file has no handle) it must never be replaced.
    try{const ex=await outDir.getFileHandle(n);let same=true;if(src){try{same=await ex.isSameEntry(src)}catch{same=true}}if(same)n=n.replace(/(\.[^.]*)?$/,'_resized$1')}catch{}
    const fh=await outDir.getFileHandle(n,{create:true}),wr=await fh.createWritable();await wr.write(blob);await wr.close();
    return fh.getFile();
  }

  addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});   // closing the tab mid-run leaves files half written
  async function run(entries){
    if(busy||!entries.length)return;const s=settings();if(!s)return;
    busy=true;
    try{await runBatch(entries,s)}catch(e){msg(t('nb.error'),String(e&&e.message||e),'error')}
    finally{busy=false;drop.classList.remove('off');$('rz-prog').value=0}
  }
  async function runBatch(entries,s){
    drop.classList.add('off');$('rz-prog').max=entries.length*2;$('rz-prog').value=0;
    const fails=[],results=[],used=new Set(),direct=!!outDir;let ok=0,processed=0,steps=0,stretched=0,webp=0;
    const workerPool=getPool();
    const step=n=>{steps+=n;$('rz-prog').value=steps};
    // Two inputs with the same name (from different folders) must not overwrite each other in the output folder.
    const uniqueName=name=>{let n=name,k=1;while(used.has(n.toLowerCase()))n=name.replace(/(\.[^.]*)?$/,`_${++k}$1`);used.add(n.toLowerCase());return n};

    // Decode, resize and encode in the worker pool. With an output folder each result is written
    // straight away (overlapping disk writes with other files' processing), so results never pile up in memory.
    status(t('resizer.processing',1,entries.length));
    const processEntry=async(entry,index)=>{
      const {file,handle}=entry,ext=extOf(file.name);let credited=0;
      try{
        if(!SUPPORTED.has(ext))throw new Error(t('resizer.unsupportedInput',ext));
        const head=await headInfo(file,ext);
        let res;
        if(workerPool.supported){
          try{
            res=await workerPool.dispatch({file,ow:s.w,oh:s.h,dpi:s.dpi,ext,quality:s.quality},estimateCost(file,s.w,s.h,head));
          }catch(workerErr){
            // Only retry on this page if the worker itself died. A file the worker rejected (too large,
            // damaged...) or a timeout is reported as a failure, never re-run here where it could freeze the tab.
            if(!workerErr.crash)throw workerErr;
            res=await processInThread(file,s.w,s.h,s.dpi,ext,s.quality);
          }
        }else{
          res=await processInThread(file,s.w,s.h,s.dpi,ext,s.quality);
        }
        const outW=res.w||s.w,outH=res.h||s.h;
        const why=await verify(res.blob,ext,outW,outH,s.dpi);
        if(why)throw new Error(why);
        step(1);credited++;
        if(s.w&&s.h&&head.width&&head.height&&Math.abs(head.width/head.height/(s.w/s.h)-1)>0.02)stretched++;   // shape differs from the requested size
        if(ext==='.webp')webp++;                                                                              // WebP cannot hold a DPI value
        if(direct){
          const saved=await save(uniqueName(file.name),res.blob,handle);
          const why2=await verify(saved,ext,outW,outH,s.dpi);
          if(why2)throw new Error(why2);
          ok++;step(1);credited++;
        }else results.push({index,file,handle,blob:res.blob,ext,w:outW,h:outH});
      }catch(e){
        fails.push(`${file.name}: ${e.message||e}`);
      }finally{
        step((direct?2:1)-credited);
        processed++;
        status(t('resizer.processing',Math.min(processed,entries.length),entries.length));
      }
    };

    // Bounded concurrency: workers + a small buffer (a few more when files are also being written)
    const concurrency=Math.min(workerPool.supported?workerPool.size+(direct?5:2):2,entries.length);
    let cursor=0;
    const next=async()=>{while(cursor<entries.length){const index=cursor++;await processEntry(entries[index],index)}};
    await Promise.all(Array.from({length:concurrency},()=>next()));

    // Download mode (no output folder): hand the finished files to the browser in the original order
    results.sort((a,b)=>a.index-b.index);
    if(!direct&&results.length)await msg(t('resizer.downloadTitle'),t('resizer.downloadMsg',results.length),'info',[t('resizer.downloadAll')]);
    // Several results are bundled into one zip: browsers ask permission for (or drop) many automatic downloads.
    if(results.length>1){
      try{
        status(t('resizer.saving',1,results.length,'resized_images.zip'));
        const files={};
        for(const r of results)files[uniqueName(r.file.name)]=[new Uint8Array(await r.blob.arrayBuffer()),{level:0}];
        const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([zipSync(files)],{type:'application/zip'}));a.download='resized_images.zip';a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),4000);
        ok+=results.length;results.length=0;$('rz-prog').value=entries.length*2;
      }catch{/* zip failed (for example not enough memory): fall back to one download per file below */}
    }
    for(let i=0;i<results.length;i++){
      const r=results[i];status(t('resizer.saving',i+1,results.length,r.file.name));
      try{
        await save(r.file.name,r.blob,r.handle);
        ok++;
      }catch(e){
        fails.push(`${r.file.name}: ${e.message||e}`);
      }
      $('rz-prog').value=entries.length+i+1;
    }

    busy=false;drop.classList.remove('off');$('rz-prog').value=0;
    track('resizer/run','Resizer run');if(ok>0)track('resizer/files/'+countBucket(ok),'Resizer files '+countBucket(ok));
    const notes=[stretched?t('resizer.stretchNote',stretched):null,webp?t('resizer.webpNote',webp):null].filter(Boolean),extra=notes.length?'\n\n'+notes.join('\n'):'';
    if(fails.length){status(t('resizer.errorStatus',fails.length));msg(t('resizer.errorTitle'),t('resizer.errorMsg',ok,entries.length,fails.slice(0,10).join('\n')+(fails.length>10?'\n...':''))+extra,'warning')}
    else{status(t('resizer.successStatus',ok));msg(t('resizer.doneTitle'),t('resizer.doneMsg',ok)+extra,notes.length?'warning':'info')}
  }
}
