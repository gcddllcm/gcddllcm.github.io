import {$,msg,track} from './util.js';
import {bindInstructionPanel} from './instruction-panel.js?v=20261015h';
import {t} from './i18n.js';
const HAS_FS='showDirectoryPicker' in window;
const sleep=()=>new Promise(r=>setTimeout(r));
const extOf=n=>(n.match(/\.[^.]+$/)||[''])[0].toLowerCase();

// ---- Lanczos-3 resize (same filter as Pillow's LANCZOS), premultiplied alpha ----
const lz=x=>{if(x===0)return 1;if(x<=-3||x>=3)return 0;const p=Math.PI*x;return 3*Math.sin(p)*Math.sin(p/3)/(p*p)};
function coeffs(inN,outN){
  const sc=inN/outN,fs=Math.max(sc,1),sup=3*fs,out=[];
  for(let i=0;i<outN;i++){
    const c=(i+.5)*sc,lo=Math.max(0,Math.floor(c-sup+.5)),hi=Math.min(inN,Math.floor(c+sup+.5)),w=[];let s=0;
    for(let x=lo;x<hi;x++){const v=lz((x-c+.5)/fs);w.push(v);s+=v}
    for(let k=0;k<w.length;k++)w[k]/=s;
    out.push({lo,w});
  }
  return out;
}
export async function resize(img,ow,oh){
  const {width:iw,height:ih,data:src}=img,cx=coeffs(iw,ow),cy=coeffs(ih,oh);
  const mid=new Float32Array(ow*ih*4);
  for(let y=0;y<ih;y++){
    for(let x=0;x<ow;x++){
      const {lo,w}=cx[x];let r=0,g=0,b=0,a=0;
      for(let k=0;k<w.length;k++){const p=((y*iw)+lo+k)*4,al=src[p+3]/255,f=w[k];r+=src[p]*al*f;g+=src[p+1]*al*f;b+=src[p+2]*al*f;a+=src[p+3]*f}
      const q=(y*ow+x)*4;mid[q]=r;mid[q+1]=g;mid[q+2]=b;mid[q+3]=a;
    }
    if(y%64===63)await sleep();
  }
  const out=new Uint8ClampedArray(ow*oh*4);
  for(let y=0;y<oh;y++){
    const {lo,w}=cy[y];
    for(let x=0;x<ow;x++){
      let r=0,g=0,b=0,a=0;
      for(let k=0;k<w.length;k++){const p=((lo+k)*ow+x)*4,f=w[k];r+=mid[p]*f;g+=mid[p+1]*f;b+=mid[p+2]*f;a+=mid[p+3]*f}
      const q=(y*ow+x)*4,al=Math.min(255,Math.max(0,a))/255;
      out[q]=al?r/al:0;out[q+1]=al?g/al:0;out[q+2]=al?b/al:0;out[q+3]=a;
    }
    if(y%64===63)await sleep();
  }
  return {width:ow,height:oh,data:out};
}

// ---- decode / encode ----
export async function decode(file){
  const bmp=await createImageBitmap(file,{imageOrientation:'none'});   // no EXIF rotation, like the desktop app
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0);bmp.close();
  const d=x.getImageData(0,0,c.width,c.height);return {width:c.width,height:c.height,data:d.data};
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=~0;for(const v of b)c=CRC[(c^v)&255]^(c>>>8);return ~c>>>0};
const ppm=dpi=>Math.round(dpi/0.0254);
function pngSetDpi(u8,dpi){            // insert a pHYs chunk right after IHDR
  const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);
  v.setUint32(0,9);chunk.set([0x70,0x48,0x59,0x73],4);v.setUint32(8,ppm(dpi));v.setUint32(12,ppm(dpi));chunk[16]=1;v.setUint32(17,crc32(chunk.subarray(4,17)));
  const out=new Uint8Array(u8.length+21);out.set(u8.subarray(0,33));out.set(chunk,33);out.set(u8.subarray(33),54);return out;
}
function jpgSetDpi(u8,dpi){            // JFIF density: units=1 (dots per inch)
  if(!(u8[2]===0xFF&&u8[3]===0xE0&&u8[6]===0x4A)){
    const j=new Uint8Array([0xFF,0xE0,0,16,0x4A,0x46,0x49,0x46,0,1,1,1,0,1,0,1,0,0]);
    const o=new Uint8Array(u8.length+18);o.set(u8.subarray(0,2));o.set(j,2);o.set(u8.subarray(2),20);u8=o;
  }
  u8[13]=1;u8[14]=dpi>>8;u8[15]=dpi&255;u8[16]=dpi>>8;u8[17]=dpi&255;return u8;
}
function bmpEncode(img,dpi){           // 32-bit top-down BMP with pixel-per-metre fields
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
  const blob=await new Promise(r=>c.toBlob(r,type,0.75));       // 75 = Pillow's default JPEG quality
  if(!blob||blob.type!==type)throw new Error(t('resizer.encodeError'));
  const u8=new Uint8Array(await blob.arrayBuffer());
  if(type==='image/png')return new Blob([pngSetDpi(u8,dpi)],{type});
  if(type==='image/jpeg')return new Blob([jpgSetDpi(u8,dpi)],{type});
  return blob;                                                   // WebP has no DPI field (same as Pillow)
}

// ---- read the saved file back and confirm size + DPI really changed ----
async function readDpi(blob,ext){
  const u=new Uint8Array(await blob.arrayBuffer()),v=new DataView(u.buffer);
  if(ext==='.png'){for(let p=8;p+8<=u.length;){const len=v.getUint32(p),t=String.fromCharCode(...u.subarray(p+4,p+8));if(t==='pHYs')return Math.round(v.getUint32(p+8)*0.0254);if(t==='IDAT')break;p+=12+len}return null}
  if(ext==='.jpg'||ext==='.jpeg'){return u[2]===0xFF&&u[3]===0xE0&&u[13]===1?(u[14]<<8)|u[15]:null}
  if(ext==='.bmp')return Math.round(v.getInt32(38,true)*0.0254);
  return undefined;                                              // WebP: nothing to check
}
async function verify(blob,ext,w,h,dpi){
  const b=await createImageBitmap(blob,{imageOrientation:'none'}),ok=b.width===w&&b.height===h;b.close();
  if(!ok)return t('resizer.sizeError');
  const d=await readDpi(blob,ext);
  if(d!==undefined&&d!==dpi)return t('resizer.dpiMismatch',d,dpi);
  return null;
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
    return fh.getFile();                                         // read back from disk for verification
  }
  async function run(entries){
    if(busy||!entries.length)return;const s=settings();if(!s)return;
    busy=true;drop.classList.add('off');$('rz-prog').max=entries.length*2;$('rz-prog').value=0;
    const fails=[],results=[];let ok=0;
    for(let i=0;i<entries.length;i++){
      const {file,handle}=entries[i];status(t('resizer.processing',i+1,entries.length));await sleep();
      try{
        let img=await decode(file);if(s.w)img=await resize(img,s.w,s.h);
        const ext=extOf(file.name),blob=await encode(img,ext,s.dpi),why=await verify(blob,ext,img.width,img.height,s.dpi);
        if(why)throw new Error(why);results.push({file,handle,blob,ext,w:img.width,h:img.height});
      }catch(e){fails.push(`${file.name}: ${e.message||e}`)}
      $('rz-prog').value=i+1;
    }
    if(!outDir&&results.length)await msg(t('resizer.downloadTitle'),t('resizer.downloadMsg',results.length),'info',[t('resizer.downloadAll')]);
    for(let i=0;i<results.length;i++){
      const r=results[i];status(t('resizer.saving',i+1,results.length,r.file.name));if(outDir)await sleep();
      try{const saved=await save(r.file.name,r.blob,r.handle),why=outDir?await verify(saved,r.ext,r.w,r.h,s.dpi):null;if(why)throw new Error(why);ok++}
      catch(e){fails.push(`${r.file.name}: ${e.message||e}`)}
      $('rz-prog').value=entries.length+i+1;
    }
    busy=false;drop.classList.remove('off');$('rz-prog').value=0;
    track('resizer/run','Resizer run');for(let i=0;i<Math.min(ok,50);i++)track('resizer/file','Resizer file');
    if(fails.length){status(t('resizer.errorStatus',fails.length));msg(t('resizer.errorTitle'),t('resizer.errorMsg',ok,entries.length,fails.slice(0,10).join('\n')+(fails.length>10?'\n...':'')),'warning')}
    else{status(t('resizer.successStatus',ok));msg(t('resizer.doneTitle'),t('resizer.doneMsg',ok))}
  }
}
