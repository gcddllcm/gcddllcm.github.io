import {msg,track,countBucket,yieldNow} from './util.js?v=3.2.0';
import {shell,download,ensureWriteAccess,saveToHandle} from './nbtool.js?v=3.2.0';
import {setLock} from './lockcore.js?v=3.2.0';
import {fixNames} from './zipnames.js?v=3.2.0';
import {unzipSync,zipSync} from './vendor/fflate.js';
import {t} from './i18n.js?v=3.2.0';
const dec=new TextDecoder('utf-8'),enc=new TextEncoder();

async function process(file,lock){
  const z=fixNames(unzipSync(new Uint8Array(await file.arrayBuffer()))),out={};let pages=0;   // fixNames: Thai names stay Thai when the archive is written back
  for(const [n,d] of Object.entries(z)){if(n.endsWith('/'))continue;
    if(/^page\d+\.svg$/i.test(n)){pages++;out[n]=enc.encode(setLock(dec.decode(d),lock))}
    else out[n]=/\.(png|jpe?g|gif|bmp|webp)$/i.test(n)?[d,{level:0}]:d}   // images are already compressed: store as-is
  if(!pages)throw new Error(t('pagelock.noPages'));
  return zipSync(out,{level:6});
}
export function mount(root){
  let mode='lock';
  const ui=shell(root,{title:t('tool.pagelock'),sub:t('pagelock.sub'),guideKey:'pagelock',hideFolder:true,
    top:`<div class="seg"><button class="btn on" data-m="lock">${t('pagelock.lock')}</button><button class="btn danger" data-m="unlock">${t('pagelock.unlock')}</button></div>
    <div class="warn">${t('pagelock.warn')}</div>`,
    async run(entries,ign,ui){
      const lock=mode==='lock',ing=t(lock?'pagelock.locking':'pagelock.unlocking'),ed=t(lock?'pagelock.locked':'pagelock.unlocked'),failures=[],fallbacks=[];
      await ensureWriteAccess(entries);
      ui.progress(0,entries.length);
      for(let i=0;i<entries.length;i++){
        const {file,handle}=entries[i];ui.status(t('pagelock.processing',ing,i+1,entries.length,file.name));await yieldNow();
        try{
          const bytes=await process(file,lock);
          if(handle&&await saveToHandle(handle,bytes)){/* saved over the original */}
          else{download(file.name,bytes);if(handle)fallbacks.push(file.name)}
        }catch(e){failures.push(`${file.name}: ${e.message||e}`)}
        ui.progress(i+1);
      }
      track('pagelock/run','Page locker run');if(entries.length>failures.length)track('pagelock/files/'+countBucket(entries.length-failures.length),'Page locker files '+countBucket(entries.length-failures.length));
      const note=[ign?t('pagelock.ignored',ign):null,fallbacks.length?t('pagelock.fallback',fallbacks.length):null].filter(Boolean);
      const suffix=note.length?` (${note.join('; ')})`:'';
      ui.status(failures.length?t('pagelock.errorStatus',failures.length,suffix):t('pagelock.doneStatus',ed,entries.length,suffix));
      if(failures.length)await msg(t('pagelock.finished'),t('pagelock.failure',ed,entries.length-failures.length,entries.length,suffix,failures.slice(0,10).join('\n')+(failures.length>10?'\n...':'')),'warning');
      else await msg(t('pagelock.done'),t('pagelock.success',ed,entries.length,suffix));
    }});
  root.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{mode=b.dataset.m;root.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x===b))});
}
