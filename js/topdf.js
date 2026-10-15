import {msg,track} from './util.js';
import {shell,download} from './nbtool.js?v=20261015i';
import {t} from './i18n.js';

// The conversion runs the desktop app's own Python code (PyMuPDF) in a Web Worker.
let worker=null,seq=0,prepared=false;const waits=new Map();let onStatus=()=>{};
function localStatus(text){
  if(text==='Loading PDF engine…')return t('pdf.load');
  if(text==='PDF engine ready and cached on this device.')return t('pdf.cached');
  let m=text.match(/^PDF engine cached: (.+)$/);if(m)return t('pdf.cachedFile',m[1]);
  m=text.match(/^PDF engine ready: (.+)$/);if(m)return t('pdf.readyFile',m[1]);
  m=text.match(/^PDF engine could not load: (.+)$/);if(m)return t('pdf.loadError',m[1]);
  m=text.match(/^Loading PDF engine: (.+?) · ([\d.]+)(?: \/ ([\d.]+))? MB$/);if(m)return t('pdf.loading',m[1],m[2],m[3]);
  return text;
}
function getWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('./pdfworker.js',import.meta.url),{type:'module'});
  worker.onmessage=e=>{const m=e.data;if(m.type==='status'){onStatus(localStatus(m.text),m.progress);return}const w=waits.get(m.id);if(!w)return;
    if(m.type==='page')w.onPage(m.d,m.t);else{waits.delete(m.id);m.type==='done'?w.res(m):w.rej(new Error(m.message))}};
  worker.onerror=e=>{for(const w of waits.values())w.rej(new Error(t('pdf.engineFail')+' ('+(e.message||'unknown')+')'));waits.clear();worker=null};
  return worker;
}
function convert(buf,title,onPage,quality){return new Promise((res,rej)=>{const id=++seq;waits.set(id,{res,rej,onPage});getWorker().postMessage({id,data:buf,title,quality},[buf])})}
export function prepare(){if(prepared)return;prepared=true;getWorker().postMessage({type:'init'})}

async function exportNb(entry,decide,onPage,quality){
  const pdfName=entry.file.name.replace(/\.[^.]*$/,'')+'.pdf';
  if(entry.dir){let exists=false;try{await entry.dir.getFileHandle(pdfName);exists=true}catch{}
    if(exists&&await decide(pdfName)!=='overwrite')return {state:'skipped'}}
  const r=await convert(await entry.file.arrayBuffer(),pdfName.replace(/\.pdf$/i,''),onPage,quality);
  if(entry.dir){const fh=await entry.dir.getFileHandle(pdfName,{create:true}),w=await fh.createWritable();await w.write(r.bytes);await w.close()}else download(pdfName,r.bytes);
  return {state:'done',failed:r.failed,err:r.err};
}
export function mount(root){
  const ui=shell(root,{title:t('tool.topdf'),sub:t('pdf.sub'),
    hideFolder:true,
    top:`<div class="quality-row"><label for="pdf-quality">${t('pdf.quality')}</label><select id="pdf-quality" data-q="quality"><option value="70">70%</option><option value="80">80%</option><option value="90" selected>90${t('pdf.recommended')}</option><option value="95">95%</option></select></div>`,
    info:t('pdf.info'),
    async run(entries,ign,ui){
      const quality=+ui.root.querySelector('[data-q=quality]').value;
      onStatus=(text,fraction)=>{ui.status(text);if(fraction!=null)ui.progress(Math.max(0,Math.round(fraction*100)));if(text.startsWith(t('pdf.loadError',''))){prepared=false;worker?.terminate();worker=null}};let converted=0,kept=0;const failures=[],total=entries.length;
      const decide=async name=>{const a=await msg(t('pdf.existsTitle'),t('pdf.exists',name),'warning',[t('pdf.skip'),t('pdf.overwrite')]);return a===1?'overwrite':'skip'};
      ui.progress(0,total*100);
      for(let i=0;i<total;i++){
        const name=entries[i].file.name;ui.status(t('pdf.converting',i+1,total,name));
        try{
          const r=await exportNb(entries[i],decide,(d,p)=>{ui.progress(i*100+d*100/p);ui.status(t('pdf.page',i+1,total,name,d,p))},quality);
          if(r.state==='skipped')kept++;else{converted++;if(r.failed)failures.push(t('pdf.pageFail',name,r.failed,r.err))}
        }catch(e){failures.push(`${name}: ${e.message||e}`)}
        ui.progress((i+1)*100);
      }
      track('topdf/run','Convert to pdf run');for(let i=0;i<Math.min(converted,50);i++)track('topdf/file','Convert to pdf file');
      const notes=[];if(kept)notes.push(t('pdf.skipped',kept));if(ign)notes.push(t('pdf.ignored',ign));
      const note=notes.length?` (${notes.join('; ')})`:'';
      if(failures.length){ui.status(t('pdf.problemStatus',failures.length,note));await msg(t('pdf.errorTitle'),t('pdf.errorMsg',converted,total,note,failures.slice(0,10).join('\n')+(failures.length>10?'\n...':'')),'warning')}
      else if(!converted){ui.status(t('pdf.nothingStatus',note));await msg(t('pdf.nothingTitle'),t('pdf.nothingMsg',note))}
      else{ui.status(t('pdf.doneStatus',converted,note));await msg(t('pdf.doneTitle'),t('pdf.doneMsg',converted,note))}
    }});
  onStatus=(text,fraction)=>{ui.status(localStatus(text));if(fraction!=null)ui.progress(Math.round(fraction));if(text.startsWith(t('pdf.loadError',''))){prepared=false;worker?.terminate();worker=null}};
}
