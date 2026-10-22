import {msg,track} from './util.js?v=3.1.3';
import {shell,download,ensureWriteAccess} from './nbtool.js?v=3.1.3';
import {t} from './i18n.js?v=3.1.3';

// The conversion runs the desktop app's own Python code (PyMuPDF) in a Web Worker.
let worker=null,seq=0,prepared=false;const waits=new Map();let onStatus=()=>{};
let lastStatusText=null,lastProgress=null;
function localStatus(m){                       // the worker sends a code plus the values, so wording and translations live only here
  switch(m.code){
    case 'start':return t('pdf.load');
    case 'ready':return t('pdf.cached');
    case 'cachedFile':return t('pdf.cachedFile',m.file);
    case 'readyFile':return t('pdf.readyFile',m.file);
    case 'loadError':return t('pdf.loadError',m.error);
    case 'loading':return t('pdf.loading',m.file,m.loaded,m.total);
  }
  return m.text;
}
function getWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('./pdfworker.js?v=3.1.3',import.meta.url),{type:'module'});
  worker.onmessage=e=>{
    const m=e.data;
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
  const ui=shell(root,{title:t('tool.topdf'),sub:t('pdf.sub'),
    hideFolder:true,
    top:`<div class="quality-row"><label for="pdf-resolution">${t('pdf.resolution')}</label><select id="pdf-resolution" data-q="resolution"><option value="1280">${t('pdf.resFast')}</option><option value="1600" selected>${t('pdf.resStandard')}</option><option value="2480">${t('pdf.resHigh')}</option><option value="0">${t('pdf.resOriginal')}</option></select><label for="pdf-quality">${t('pdf.quality')}</label><select id="pdf-quality" data-q="quality"><option value="70">70%</option><option value="80">80%</option><option value="90" selected>90${t('pdf.recommended')}</option><option value="95">95%</option></select></div>`,
    info:t('pdf.info'),
    async run(entries,ign,ui){
      const quality=+ui.root.querySelector('[data-q=quality]').value;
      const resolution=+ui.root.querySelector('[data-q=resolution]').value;
      onStatus=(text,fraction,code)=>{ui.status(text);if(code==='loadError'){prepared=false;worker?.terminate();worker=null}};let converted=0,kept=0,fallbacks=0,overwriteAll=false;const failures=[],total=entries.length;
      const decide=async name=>{if(overwriteAll)return 'overwrite';const a=await msg(t('pdf.existsTitle'),t('pdf.exists',name),'warning',[t('pdf.skip'),t('pdf.overwrite'),t('pdf.overwriteAll')]);if(a===2){overwriteAll=true;return 'overwrite'}return a===1?'overwrite':'skip'};
      await ensureWriteAccess(entries);
      ui.progress(0,total*100);
      for(let i=0;i<total;i++){
        const name=entries[i].file.name;ui.status(t('pdf.converting',i+1,total,name));
        try{
          const r=await exportNb(entries[i],decide,(d,p)=>{ui.progress(i*100+d*100/p);ui.status(t('pdf.page',i+1,total,name,d,p))},quality,resolution);
          if(r.state==='skipped')kept++;else{converted++;if(r.fallback)fallbacks++;if(r.failed)failures.push(t('pdf.pageFail',name,r.failed,r.err))}
        }catch(e){failures.push(`${name}: ${e.message||e}`)}
        ui.progress((i+1)*100);
      }
      track('topdf/run','Convert to pdf run');for(let i=0;i<Math.min(converted,50);i++)track('topdf/file','Convert to pdf file');
      const notes=[];if(kept)notes.push(t('pdf.skipped',kept));if(ign)notes.push(t('pdf.ignored',ign));if(fallbacks)notes.push(t('pdf.fallback',fallbacks));
      const note=notes.length?` (${notes.join('; ')})`:'';
      if(failures.length){ui.status(t('pdf.problemStatus',failures.length,note));await msg(t('pdf.errorTitle'),t('pdf.errorMsg',converted,total,note,failures.slice(0,10).join('\n')+(failures.length>10?'\n...':'')),'warning')}
      else if(!converted){ui.status(t('pdf.nothingStatus',note));await msg(t('pdf.nothingTitle'),t('pdf.nothingMsg',note))}
      else{ui.status(t('pdf.doneStatus',converted,note));await msg(t('pdf.doneTitle'),t('pdf.doneMsg',converted,note))}
    }});
  onStatus=(text,fraction,code)=>{lastStatusText=text;lastProgress=fraction;ui.status(text);if(fraction!=null)ui.progress(fraction,1);if(code==='loadError'){prepared=false;worker?.terminate();worker=null}};
  if(lastStatusText){ui.status(lastStatusText);if(lastProgress!=null)ui.progress(lastProgress,1)}
}
