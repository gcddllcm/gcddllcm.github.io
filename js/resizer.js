import {$,msg,track} from './util.js';
import {bindInstructionPanel} from './instruction-panel.js?v=20261015h';
import {t} from './i18n.js';
const HAS_FS='showDirectoryPicker' in window;
const sleep=()=>new Promise(r=>setTimeout(r));
const extOf=n=>(n.match(/\.[^.]+$/)||[''])[0].toLowerCase();

// ---- Lanczos-3 resize (same filter as Pillow's LANCZOS), premultiplied alpha ----
const lz=x=>{if(x===0)return 1;if(x<=-3||x>=3)return 0;const p=Math.PI*x;return 3*Math.sin(p)*Math.sin(p/3)/(p*p)};
function coeffs(inN,outN){
  const sc=inN/outN,fs=Math.max(sc,1),sup=3*fs;
  const los=new Int32Array(outN),lens=new Int32Array(outN),weights=[];
  for(let i=0;i<outN;i++){
    const c=(i+.5)*sc,lo=Math.max(0,Math.floor(c-sup+.5)),hi=Math.min(inN,Math.floor(c+sup+.5)),len=hi-lo;
    los[i]=lo;lens[i]=len;let s=0;const w=new Float32Array(len);
    for(let x=lo;x<hi;x++){const v=lz((x-c+.5)/fs);w[x-lo]=v;s+=v}
    const invS=1/s;for(let k=0;k<len;k++)w[k]*=invS;weights.push(w);
  }
  return {los,lens,weights};
}

export async function resize(img,ow,oh){
  const {width:iw,height:ih,data:src}=img;
  const cx=coeffs(iw,ow),cy=coeffs(ih,oh),nPix=iw*ih,inv255=1/255;
  let hasAlpha=false;
  for(let i=3;i<nPix*4;i+=4){if(src[i]!==255){hasAlpha=true;break}}
  const preSrc=new Float32Array(nPix*4);
  if(hasAlpha){
    for(let i=0;i<nPix*4;i+=4){const a=src[i+3],al=a*inv255;preSrc[i]=src[i]*al;preSrc[i+1]=src[i+1]*al;preSrc[i+2]=src[i+2]*al;preSrc[i+3]=a}
  }else{
    for(let i=0;i<nPix*4;i+=4){preSrc[i]=src[i];preSrc[i+1]=src[i+1];preSrc[i+2]=src[i+2];preSrc[i+3]=255}
  }
  const mid=new Float32Array(ow*ih*4),cxLos=cx.los,cxLens=cx.lens,cxWeights=cx.weights;
  for(let y=0;y<ih;y++){
    const srcRow=y*iw*4,midRow=y*ow*4;
    for(let x=0;x<ow;x++){
      const lo=cxLos[x],len=cxLens[x],w=cxWeights[x];let r=0,g=0,b=0,a=0,p=srcRow+(lo<<2);
      for(let k=0;k<len;k++){const f=w[k];r+=preSrc[p]*f;g+=preSrc[p+1]*f;b+=preSrc[p+2]*f;a+=preSrc[p+3]*f;p+=4}
      const q=midRow+(x<<2);mid[q]=r;mid[q+1]=g;mid[q+2]=b;mid[q+3]=a;
    }
    if(y%128===127)await sleep();
  }
  const out=new Uint8ClampedArray(ow*oh*4),lineAcc=new Float32Array(ow*4),rowFloats=ow*4;
  const cyLos=cy.los,cyLens=cy.lens,cyWeights=cy.weights;
  for(let y=0;y<oh;y++){
    lineAcc.fill(0);const lo=cyLos[y],len=cyLens[y],w=cyWeights[y];
    for(let k=0;k<len;k++){const f=w[k],midPtr=(lo+k)*rowFloats;for(let i=0;i<rowFloats;i++)lineAcc[i]+=mid[midPtr+i]*f}
    const outRow=y*rowFloats;
    if(hasAlpha){
      for(let x=0;x<ow;x++){
        const q=x<<2,a=lineAcc[q+3],al=(a<0?0:(a>255?255:a))*inv255,invAl=al>0?1/al:0,oq=outRow+q;
        out[oq]=lineAcc[q]*invAl;out[oq+1]=lineAcc[q+1]*invAl;out[oq+2]=lineAcc[q+2]*invAl;out[oq+3]=a;
      }
    }else{
      for(let i=0;i<rowFloats;i+=4){const oq=outRow+i;out[oq]=lineAcc[i];out[oq+1]=lineAcc[i+1];out[oq+2]=lineAcc[i+2];out[oq+3]=255}
    }
    if(y%128===127)await sleep();
  }
  return {width:ow,height:oh,data:out};
}

// ---- decode / encode ----
export async function decode(file){
  const bmp=await createImageBitmap(file,{imageOrientation:'none'});
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0);bmp.close();
  const d=x.getImageData(0,0,c.width,c.height);return {width:c.width,height:c.height,data:d.data};
}

const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=~0;for(const v of b)c=CRC[(c^v)&255]^(c>>>8);return ~c>>>0};
const ppm=dpi=>Math.round(dpi/0.0254);

function pngSetDpi(u8,dpi){
  const v=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let physPos=-1,physLen=0;
  for(let p=8;p+8<=u8.length;){
    const len=v.getUint32(p),tag=String.fromCharCode(...u8.subarray(p+4,p+8));
    if(tag==='pHYs'){physPos=p;physLen=12+len;break}
    if(tag==='IDAT')break;
    p+=12+len;
  }
  const chunk=new Uint8Array(21),cv=new DataView(chunk.buffer);
  cv.setUint32(0,9);chunk.set([0x70,0x48,0x59,0x73],4);cv.setUint32(8,ppm(dpi));cv.setUint32(12,ppm(dpi));chunk[16]=1;cv.setUint32(17,crc32(chunk.subarray(4,17)));
  if(physPos!==-1&&physLen===21){const out=new Uint8Array(u8.length);out.set(u8);out.set(chunk,physPos);return out}
  if(physPos!==-1){const out=new Uint8Array(u8.length-physLen+21);out.set(u8.subarray(0,physPos));out.set(chunk,physPos);out.set(u8.subarray(physPos+physLen),physPos+21);return out}
  const out=new Uint8Array(u8.length+21);out.set(u8.subarray(0,33));out.set(chunk,33);out.set(u8.subarray(33),54);return out;
}

function jpgSetDpi(u8,dpi){
  if(!(u8[2]===0xFF&&u8[3]===0xE0&&u8[6]===0x4A)){
    const j=new Uint8Array([0xFF,0xE0,0,16,0x4A,0x46,0x49,0x46,0,1,1,1,0,1,0,1,0,0]);
    const o=new Uint8Array(u8.length+18);o.set(u8.subarray(0,2));o.set(j,2);o.set(u8.subarray(2),20);u8=o;
  }
  u8[13]=1;u8[14]=dpi>>8;u8[15]=dpi&255;u8[16]=dpi>>8;u8[17]=dpi&255;return u8;
}

function bmpEncode(img,dpi){
  const {width:w,height:h,data}=img,n=w*h*4,u=new Uint8Array(54+n),v=new DataView(u.buffer);
  u[0]=66;u[1]=77;v.setUint32(2,54+n,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,w,true);v.setInt32(22,-h,true);
  v.setUint16(26,1,true);v.setUint16(28,32,true);v.setUint32(34,n,true);v.setInt32(38,ppm(dpi),true);v.setInt32(42,ppm(dpi),true);
  for(let i=0;i<w*h;i++){const p=i*4,q=54+p;u[q]=data[p+2];u[q+1]=data[p+1];u[q+2]=data[p];u[q+3]=data[p+3]}
  return new Blob([u],{type:'image/bmp'});
}

async function encode(img,ext,dpi){
  if(ext==='.bmp')return bmpEncode(img,dpi);
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  c.getContext('2d').putImageData(new ImageData(img.data,img.width,img.height),0,0);
  const type={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
  if(!type)throw new Error(t('resizer.unsupported',ext));
  const blob=await new Promise(r=>c.toBlob(r,type,0.75));
  if(!blob||blob.type!==type)throw new Error(t('resizer.encodeError'));
  const u8=new Uint8Array(await blob.arrayBuffer());
  if(type==='image/png')return new Blob([pngSetDpi(u8,dpi)],{type});
  if(type==='image/jpeg')return new Blob([jpgSetDpi(u8,dpi)],{type});
  return blob;
}

// ---- Fast Header Inspection: 0ms width, height and DPI verification ----
function readImageInfo(u8,ext){
  const v=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let width=0,height=0,dpi=undefined;
  if(ext==='.png'){
    if(u8.length>=24&&u8[0]===0x89&&u8[1]===0x50&&u8[2]===0x4E&&u8[3]===0x47){width=v.getUint32(16);height=v.getUint32(20)}
    for(let p=8;p+8<=u8.length;){
      const len=v.getUint32(p),tag=String.fromCharCode(...u8.subarray(p+4,p+8));
      if(tag==='pHYs')dpi=Math.round(v.getUint32(p+8)*0.0254);
      if(tag==='IDAT')break;
      p+=12+len;
    }
  }else if(ext==='.jpg'||ext==='.jpeg'){
    if(u8.length>=4&&u8[0]===0xFF&&u8[1]===0xD8){
      let p=2;
      while(p+4<u8.length){
        if(u8[p]!==0xFF){p++;continue}
        const m=u8[p+1];
        if(m===0xD9||m===0xDA)break;
        if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){height=(u8[p+5]<<8)|u8[p+6];width=(u8[p+7]<<8)|u8[p+8];break}
        const len=(u8[p+2]<<8)|u8[p+3];p+=2+len;
      }
      if(u8[2]===0xFF&&u8[3]===0xE0&&u8[13]===1)dpi=(u8[14]<<8)|u8[15];
    }
  }else if(ext==='.bmp'){
    if(u8.length>=26&&u8[0]===0x42&&u8[1]===0x4D){
      width=v.getInt32(18,true);height=Math.abs(v.getInt32(22,true));
      if(u8.length>=42)dpi=Math.round(v.getInt32(38,true)*0.0254);
    }
  }else if(ext==='.webp'){
    if(u8.length>=30&&u8[0]===0x52&&u8[1]===0x49&&u8[2]===0x46&&u8[3]===0x46){
      const tag=String.fromCharCode(...u8.subarray(12,16));
      if(tag==='VP8 '){width=(u8[26]|(u8[27]<<8))&0x3FFF;height=(u8[28]|(u8[29]<<8))&0x3FFF}
      else if(tag==='VP8L'){const b1=u8[21],b2=u8[22],b3=u8[23],b4=u8[24];width=1+(((b2&0x3F)<<8)|b1);height=1+(((b4&0xF)<<10)|(b3<<2)|(b2>>6))}
      else if(tag==='VP8X'){width=1+(u8[24]|(u8[25]<<8)|(u8[26]<<16));height=1+(u8[27]|(u8[28]<<8)|(u8[29]<<16))}
    }
  }
  return {width,height,dpi};
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
const WORKER_TIMEOUT_MS = 60000; // 60 seconds per task before force-kill

class ResizerPool {
  constructor(size){
    this.size=Math.max(1,Math.min(size||(navigator.hardwareConcurrency||4),8));
    this.workers=[];
    this.idle=[];
    this.queue=[];
    this.seq=0;
    this.handlers=new Map();  // id -> {res, rej, worker, timer}
    this.workerTaskMap=new Map(); // worker -> id (which task a worker is running)
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
    const w=new Worker(new URL('./resizer-worker.js',import.meta.url),{type:'module'});
    w.onmessage=e=>{
      const {id,ok,blob,w:rw,h:rh,dpi:rdpi,error}=e.data;
      const h=this.handlers.get(id);
      if(h){
        clearTimeout(h.timer);
        this.handlers.delete(id);
        this.workerTaskMap.delete(w);
        if(ok) h.res({blob,w:rw,h:rh,dpi:rdpi});
        else h.rej(new Error(error));
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
          h.rej(new Error(err?.message||'Worker crashed'));
        }
        this.workerTaskMap.delete(w);
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
    const w=h.worker;
    if(w){
      this.workerTaskMap.delete(w);
      // Terminate the hung worker and respawn
      this._removeWorker(w);
      try{ this._spawnWorker(); }catch{}
    }
    h.rej(new Error('Worker timeout: processing took longer than 60 seconds'));
    this.pump();
  }

  pump(){
    while(this.idle.length&&this.queue.length){
      const w=this.idle.pop(),{task,res,rej}=this.queue.shift();
      const id=++this.seq;
      const timer=setTimeout(()=>this._timeoutWorker(id),WORKER_TIMEOUT_MS);
      this.handlers.set(id,{res,rej,worker:w,timer});
      this.workerTaskMap.set(w,id);
      w.postMessage({id,...task});
    }
  }

  dispatch(task){
    return new Promise((res,rej)=>{
      if(!this.supported){rej(new Error('Workers not supported'));return}
      this.queue.push({task,res,rej});
      this.pump();
    });
  }

  destroy(){
    for(const [id,h] of this.handlers.entries()){
      clearTimeout(h.timer);
      h.rej(new Error('Pool destroyed'));
    }
    this.handlers.clear();
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

// In-thread fallback if workers are unsupported
async function processInThread(file,ow,oh,dpi,ext){
  if(!ow&&!oh){
    const buf=await file.arrayBuffer(),u8=new Uint8Array(buf);
    let outBlob;
    if(ext==='.png')outBlob=new Blob([pngSetDpi(u8,dpi)],{type:'image/png'});
    else if(ext==='.jpg'||ext==='.jpeg')outBlob=new Blob([jpgSetDpi(u8,dpi)],{type:'image/jpeg'});
    else if(ext==='.bmp'){
      const v=new DataView(u8.buffer);
      if(u8.length>=42){v.setInt32(38,ppm(dpi),true);v.setInt32(42,ppm(dpi),true)}
      outBlob=new Blob([u8],{type:'image/bmp'});
    }else outBlob=file;
    const outU8=new Uint8Array(await outBlob.arrayBuffer()),info=readImageInfo(outU8,ext);
    return {blob:outBlob,w:info.width,h:info.height};
  }
  let img=await decode(file);
  if(ow&&oh&&(img.width!==ow||img.height!==oh))img=await resize(img,ow,oh);
  const blob=await encode(img,ext,dpi);
  return {blob,w:img.width,h:img.height};
}

// ---- view ----
export function mount(root){
  root.innerHTML=`<div class="tool-layout"><div class="tool"><div class="head"><h1>${t('tool.resizer')}</h1><button class="iconbtn instruction-toggle" id="rz-info" title="Instructions" aria-label="Open instructions" aria-controls="rz-instructions" aria-expanded="false">i</button></div>
  <div class="sub">${t('resizer.sub')}</div>
  <div class="row3"><label>${t('resizer.dpi')}<input id="rz-dpi" value="300" inputmode="numeric"></label><label>${t('resizer.width')}<input id="rz-w" value="2480" inputmode="numeric"></label><label>${t('resizer.height')}<input id="rz-h" value="3508" inputmode="numeric"></label></div>
  <button class="btn reset-btn" id="rz-reset">${t('resizer.reset')}</button>
  <button class="btn primary wide" id="rz-out">${t('resizer.output')}</button><div class="path" id="rz-path">${HAS_FS?t('resizer.noFolder'):t('resizer.downloadMode')}</div>
  <div class="drop" id="rz-drop" tabindex="0">${t('resizer.drop')}</div>
  <div><progress id="rz-prog" max="1" value="0"></progress><div class="sub" id="rz-status">${t('resizer.ready')}</div></div>
  <input type="file" id="rz-file" multiple accept=".jpg,.jpeg,.png,.bmp,.webp" hidden></div>
  <aside class="instruction-panel" id="rz-instructions" aria-hidden="true" inert><div class="instruction-heading"><div><h2>Instructions</h2><p>How to use</p></div><button class="iconbtn" id="rz-info-close" aria-label="Close instructions">×</button></div><div class="instruction-copy" id="rz-info-copy"></div></aside></div>`;

  let outDir=null,busy=false;
  const drop=$('rz-drop'),status=t=>$('rz-status').textContent=t;
  const info=t('resizer.info');
  bindInstructionPanel(root.querySelector('.tool-layout'),$('rz-info'),$('rz-instructions'),$('rz-info-close'),$('rz-info-copy'),info);
  $('rz-reset').onclick=()=>{$('rz-dpi').value='300';$('rz-w').value='2480';$('rz-h').value='3508'};
  if(!HAS_FS)$('rz-out').hidden=true;
  $('rz-out').onclick=async()=>{try{outDir=await showDirectoryPicker({mode:'readwrite'});$('rz-path').textContent=outDir.name;$('rz-path').classList.add('set')}catch{}};
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
    for(const [l,r] of [[t('resizer.widthName'),w],[t('resizer.heightName'),h]])if(r&&(!/^\d+$/.test(r)||+r<=0))return bad(t('resizer.invalid'),t('resizer.dimensionError',l));
    if(!w!==!h)return bad(t('resizer.invalid'),t('resizer.bothError'));
    return {dpi:+dpi,w:w?+w:0,h:h?+h:0};
  }
  async function save(name,blob,src){
    if(!outDir){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return blob}
    let n=name;
    try{const ex=await outDir.getFileHandle(n);if(src&&await ex.isSameEntry(src))n=n.replace(/(\.[^.]*)?$/,'_resized$1')}catch{}
    const fh=await outDir.getFileHandle(n,{create:true}),wr=await fh.createWritable();await wr.write(blob);await wr.close();
    return fh.getFile();
  }

  async function run(entries){
    if(busy||!entries.length)return;const s=settings();if(!s)return;
    busy=true;drop.classList.add('off');$('rz-prog').max=entries.length*2;$('rz-prog').value=0;
    const fails=[],results=[];let ok=0,processed=0;
    const workerPool=getPool();

    // Phase 1: Parallel decoding, resizing, and encoding via Worker Pool
    status(t('resizer.processing',1,entries.length));
    const processEntry=async(entry)=>{
      const {file,handle}=entry,ext=extOf(file.name);
      try{
        let res;
        if(workerPool.supported){
          try{
            res=await workerPool.dispatch({file,ow:s.w,oh:s.h,dpi:s.dpi,ext});
          }catch(workerErr){
            // Fallback to in-thread processing on worker failure
            try{
              res=await processInThread(file,s.w,s.h,s.dpi,ext);
            }catch(fallbackErr){
              throw fallbackErr;
            }
          }
        }else{
          res=await processInThread(file,s.w,s.h,s.dpi,ext);
        }
        const why=await verify(res.blob,ext,res.w||s.w,res.h||s.h,s.dpi);
        if(why)throw new Error(why);
        results.push({file,handle,blob:res.blob,ext,w:res.w||s.w,h:res.h||s.h});
      }catch(e){
        fails.push(`${file.name}: ${e.message||e}`);
      }finally{
        processed++;
        $('rz-prog').value=processed;
        status(t('resizer.processing',Math.min(processed,entries.length),entries.length));
      }
    };

    // Bounded concurrency: limit in-flight tasks to pool size + small buffer
    // to prevent memory explosion from hundreds of simultaneous file reads
    const concurrency=Math.min(workerPool.supported?workerPool.size+2:2,entries.length);
    let cursor=0;
    const next=async()=>{while(cursor<entries.length){const entry=entries[cursor++];await processEntry(entry)}};
    await Promise.all(Array.from({length:concurrency},()=>next()));

    // Phase 2: Saving results
    if(!outDir&&results.length)await msg(t('resizer.downloadTitle'),t('resizer.downloadMsg',results.length),'info',[t('resizer.downloadAll')]);
    for(let i=0;i<results.length;i++){
      const r=results[i];status(t('resizer.saving',i+1,results.length,r.file.name));if(outDir)await sleep();
      try{
        const saved=await save(r.file.name,r.blob,r.handle);
        const why=outDir?await verify(saved,r.ext,r.w,r.h,s.dpi):null;
        if(why)throw new Error(why);
        ok++;
      }catch(e){
        fails.push(`${r.file.name}: ${e.message||e}`);
      }
      $('rz-prog').value=entries.length+i+1;
    }

    busy=false;drop.classList.remove('off');$('rz-prog').value=0;
    track('resizer/run','Resizer run');for(let i=0;i<Math.min(ok,50);i++)track('resizer/file','Resizer file');
    if(fails.length){status(t('resizer.errorStatus',fails.length));msg(t('resizer.errorTitle'),t('resizer.errorMsg',ok,entries.length,fails.slice(0,10).join('\n')+(fails.length>10?'\n...':'')),'warning')}
    else{status(t('resizer.successStatus',ok));msg(t('resizer.doneTitle'),t('resizer.doneMsg',ok))}
  }
}
