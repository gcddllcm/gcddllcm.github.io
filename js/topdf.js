import {msg,track,countBucket} from './util.js?v=3.2.1';
import {shell,download,ensureWriteAccess} from './nbtool.js?v=3.2.1';
import {t} from './i18n.js?v=3.2.1';

const PDF_RESOLUTION=0;   // always original size: pages are never scaled down (the worker reads 0 as "no downscale")
let worker=null,seq=0,prepared=false;const waits=new Map();let onStatus=()=>{};
let lastStatusText=null,lastProgress=null;
function localStatus(m){                       // the worker sends a code plus the values, so wording and translations live only here
  switch(m.code){
    case 'ready':return t('pdf.cached');
    case 'loadError':return t('pdf.loadError',m.error);
  }
  return m.text;
}
// The old PDF engine (Pyodide + PyMuPDF, ~30 MB) is no longer used: remove what it stored in this browser.
try{globalThis.caches?.keys().then(keys=>{for(const k of keys)if(k.startsWith('penguin-logistics-pdf-engine-'))globalThis.caches.delete(k)}).catch(()=>{})}catch{}
// A page that never finishes drawing is given up on after 50 s (the worker waits 60 s), so one bad page cannot hang the whole conversion.
function renderSvgPage(svgText,width,height,quality){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('drawing this page took too long')),50000);
    drawSvgPage(svgText,width,height,quality).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});
  });
}
function drawSvgPage(svgText,width,height,quality){
  return new Promise((resolve,reject)=>{
    try{
      let svg=svgText.replace(/^\uFEFF/,'').replace(/<\?xml\b[\s\S]*?\?>/gi,'').replace(/<!DOCTYPE\b[\s\S]*?>/gi,'').trim();
      if(!/<svg\b[^>]*\bxmlns\s*=/i.test(svg)){
        svg=svg.replace(/<svg\b/i,'<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if(!/<svg\b[^>]*\bxmlns:xlink\s*=/i.test(svg)){
        svg=svg.replace(/<svg\b/i,'<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      svg=svg.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g,'&amp;');
      if(!/\bviewBox\s*=/i.test(svg)){
        const wm=svg.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i);
        const hm=svg.match(/\bheight\s*=\s*["']\s*([\d.]+)/i);
        if(wm&&hm)svg=svg.replace(/<svg\b/i,`<svg viewBox="0 0 ${wm[1]} ${hm[1]}" preserveAspectRatio="none" `);
      }
      const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const img=new Image();
      let cleaned=false;
      const cleanup=()=>{if(!cleaned){cleaned=true;URL.revokeObjectURL(url)}};
      img.onload=()=>{
        try{
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
          ctx.drawImage(img,0,0,width,height);
          cleanup();
          canvas.toBlob(async b=>{
            if(!b)return reject(new Error('Canvas export failed'));
            try{
              const buf=await b.arrayBuffer();resolve({bytes:new Uint8Array(buf),w:width,h:height});
            }catch(err){reject(err)}
          },'image/jpeg',quality);
        }catch(err){cleanup();reject(err)}
      };
      img.onerror=()=>{
        cleanup();
        try{
          const parser=new DOMParser();
          const doc=parser.parseFromString(svg,'image/svg+xml');
          const pe=doc.querySelector('parsererror');
          if(pe)return reject(new Error('SVG XML syntax error: '+pe.textContent.slice(0,160)));
        }catch{}
        reject(new Error('Failed to load SVG in Image element'));
      };
      img.src=url;
    }catch(err){reject(err)}
  });
}
function getWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('./pdfworker.js?v=3.2.1',import.meta.url),{type:'module'});
  worker.onmessage=async e=>{
    const m=e.data;
    if(m.type==='renderSvg'){
      try{
        const res=await renderSvgPage(m.svgText,m.width,m.height,m.quality);
        worker.postMessage({type:'renderedSvg',reqId:m.reqId,ok:true,bytes:res.bytes,w:res.w,h:res.h},[res.bytes.buffer]);
      }catch(err){
        worker.postMessage({type:'renderedSvg',reqId:m.reqId,ok:false,error:String(err?.message||err)});
      }
      return;
    }
    if(m.type==='status'){
      lastStatusText=localStatus(m);
      lastProgress=m.progress;
      onStatus(lastStatusText,m.progress,m.code);
      return;
    }
    const w=waits.get(m.id);if(!w)return;
    if(m.type==='page')w.onPage(m.d,m.t);else{waits.delete(m.id);m.type==='done'?w.res(m):w.rej(new Error(m.message));if(m.fatal){worker?.terminate();worker=null;prepared=false}}};
  worker.onerror=e=>{for(const w of waits.values())w.rej(new Error(t('pdf.engineFail')+' ('+(e.message||'unknown')+')'));waits.clear();worker=null;prepared=false};
  return worker;
}
function convert(buf,title,onPage,quality,resolution){return new Promise((res,rej)=>{const id=++seq;waits.set(id,{res,rej,onPage});getWorker().postMessage({id,data:buf,title,quality,resolution},[buf])})}
export function prepare(){if(prepared)return;prepared=true;getWorker().postMessage({type:'init'})}

async function exportNb(entry,decide,onPage,quality,resolution){
  const pdfName=entry.file.name.replace(/\.[^.]*$/,'')+'.pdf';
  if(entry.dir){let exists=false;try{await entry.dir.getFileHandle(pdfName);exists=true}catch{}
    if(exists&&await decide(pdfName)!=='overwrite')return {state:'skipped'}}
  const r=await convert(await entry.file.arrayBuffer(),pdfName.replace(/\.pdf$/i,''),onPage,quality,resolution);
  let fallback=false;
  if(entry.dir){
    // The converted PDF is never thrown away: if the folder refuses the write (no permission), it is downloaded instead.
    try{const fh=await entry.dir.getFileHandle(pdfName,{create:true}),w=await fh.createWritable();await w.write(r.bytes);await w.close()}
    catch{download(pdfName,r.bytes);fallback=true}
  }else download(pdfName,r.bytes);
  return {state:'done',failed:r.failed,err:r.err,fallback};
}
export function mount(root){
  const ui=shell(root,{title:t('tool.topdf'),sub:t('pdf.sub'),guideKey:'topdf',
    hideFolder:true,
    top:`<div class="quality-row"><label for="pdf-quality">${t('pdf.quality')}</label><select id="pdf-quality" data-q="quality"><option value="70">70%</option><option value="80">80%</option><option value="90" selected>90${t('pdf.recommended')}</option><option value="95">95%</option><option value="100">100%</option></select></div>`,
    async run(entries,ign,ui){
      const quality=+ui.root.querySelector('[data-q=quality]').value;
      const resolution=PDF_RESOLUTION;
      onStatus=(text,fraction,code)=>{ui.status(text);if(code==='loadError'){prepared=false;worker?.terminate();worker=null}};let converted=0,kept=0,fallbacks=0,overwriteAll=false;const failures=[],total=entries.length;
      const decide=async name=>{if(overwriteAll)return 'overwrite';const a=await msg(t('pdf.existsTitle'),t('pdf.exists',name),'warning',[t('pdf.skip'),t('pdf.overwrite'),t('pdf.overwriteAll')]);if(a===2){overwriteAll=true;return 'overwrite'}return a===1?'overwrite':'skip'};
      await ensureWriteAccess(entries,{files:false});   // PDFs are only written into folders; asking for every single .notebook file would show one browser prompt per file
      ui.progress(0,total*100);
      for(let i=0;i<total;i++){
        const name=entries[i].file.name;ui.status(t('pdf.converting',i+1,total,name));
        try{
          const r=await exportNb(entries[i],decide,(d,p)=>{ui.progress(i*100+d*100/p);ui.status(t('pdf.page',i+1,total,name,d,p))},quality,resolution);
          if(r.state==='skipped')kept++;else{converted++;if(r.fallback)fallbacks++;if(r.failed)failures.push(t('pdf.pageFail',name,r.failed,r.err))}
        }catch(e){failures.push(`${name}: ${e.message||e}`)}
        ui.progress((i+1)*100);
      }
      track('topdf/run','Convert to pdf run');if(converted>0)track('topdf/files/'+countBucket(converted),'Convert to pdf files '+countBucket(converted));
      const notes=[];if(kept)notes.push(t('pdf.skipped',kept));if(ign)notes.push(t('pdf.ignored',ign));if(fallbacks)notes.push(t('pdf.fallback',fallbacks));
      const note=notes.length?` (${notes.join('; ')})`:'';
      if(failures.length){ui.status(t('pdf.problemStatus',failures.length,note));await msg(t('pdf.errorTitle'),t('pdf.errorMsg',converted,total,note,failures.slice(0,10).join('\n')+(failures.length>10?'\n...':'')),'warning')}
      else if(!converted){ui.status(t('pdf.nothingStatus',note));await msg(t('pdf.nothingTitle'),t('pdf.nothingMsg',note))}
      else{ui.status(t('pdf.doneStatus',converted,note));await msg(t('pdf.doneTitle'),t('pdf.doneMsg',converted,note))}
    }});
  onStatus=(text,fraction,code)=>{lastStatusText=text;lastProgress=fraction;ui.status(text);if(fraction!=null)ui.progress(fraction,1);if(code==='loadError'){prepared=false;worker?.terminate();worker=null}};
  if(lastStatusText){ui.status(lastStatusText);if(lastProgress!=null)ui.progress(lastProgress,1)}
}
