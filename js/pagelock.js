import {msg,track} from './util.js';
import {shell,download} from './nbtool.js?v=20261015i';
import {unzipSync,zipSync} from './vendor/fflate.js';
import {t} from './i18n.js';
const LOCK_VALUE='30',dec=new TextDecoder('utf-8'),enc=new TextEncoder();

function setLock(text,lock){
  return text.replace(/<image\b[\s\S]*?(?:\/>|<\/image>)/gi,tag=>{
    const m=tag.match(/(?:xlink:href|href)\s*=\s*["']([^"']+)["']/i),href=m?m[1]:'';
    if(!href||href.startsWith('data:'))return tag;
    if(lock){if(/\blocked\s*=/i.test(tag))return tag;return tag.endsWith('/>')?tag.slice(0,-2)+` locked="${LOCK_VALUE}"/>`:tag.slice(0,-1)+` locked="${LOCK_VALUE}">`}
    return tag.replace(/\s+locked\s*=\s*["'][^"']*["']/gi,'');
  });
}
async function process(file,lock){
  const z=unzipSync(new Uint8Array(await file.arrayBuffer())),out={};let pages=0;
  for(const [n,d] of Object.entries(z)){if(n.endsWith('/'))continue;
    if(/^page\d+\.svg$/i.test(n)){pages++;out[n]=enc.encode(setLock(dec.decode(d),lock))}else out[n]=d}
  if(!pages)throw new Error(t('pagelock.noPages'));
  return zipSync(out,{level:6});
}
export function mount(root){
  let mode='lock';
  const ui=shell(root,{title:t('tool.pagelock'),sub:t('pagelock.sub'),hideFolder:true,
    top:`<div class="seg"><button class="btn on" data-m="lock">${t('pagelock.lock')}</button><button class="btn danger" data-m="unlock">${t('pagelock.unlock')}</button></div>
    <div class="warn">${t('pagelock.warn')}</div>`,
    info:t('pagelock.info'),
    async run(entries,ign,ui){
      const lock=mode==='lock',ing=t(lock?'pagelock.locking':'pagelock.unlocking'),ed=t(lock?'pagelock.locked':'pagelock.unlocked'),failures=[],fallbacks=[];
      ui.progress(0,entries.length);
      for(let i=0;i<entries.length;i++){
        const {file,handle}=entries[i];ui.status(t('pagelock.processing',ing,i+1,entries.length,file.name));await new Promise(r=>setTimeout(r));
        try{
          const bytes=await process(file,lock);
          if(handle){
            let permission='granted';try{permission=await handle.queryPermission({mode:'readwrite'});if(permission!=='granted')permission=await handle.requestPermission({mode:'readwrite'})}catch{}
            if(permission==='granted'){
              try{const w=await handle.createWritable();await w.write(bytes);await w.close()}
              catch{download(file.name,bytes);fallbacks.push(file.name)}
            }else{download(file.name,bytes);fallbacks.push(file.name)}
          }else download(file.name,bytes);
        }catch(e){failures.push(`${file.name}: ${e.message||e}`)}
        ui.progress(i+1);
      }
      track('pagelock/run','Page locker run');for(let i=0;i<Math.min(entries.length-failures.length,50);i++)track('pagelock/file','Page locker file');
      const note=[ign?t('pagelock.ignored',ign):null,fallbacks.length?t('pagelock.fallback',fallbacks.length):null].filter(Boolean);
      const suffix=note.length?` (${note.join('; ')})`:'';
      ui.status(failures.length?t('pagelock.errorStatus',failures.length,suffix):t('pagelock.doneStatus',ed,entries.length,suffix));
      if(failures.length)await msg(t('pagelock.finished'),t('pagelock.failure',ed,entries.length-failures.length,entries.length,suffix,failures.slice(0,10).join('\n')+(failures.length>10?'\n...':'')),'warning');
      else await msg(t('pagelock.done'),t('pagelock.success',ed,entries.length,suffix));
    }});
  root.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{mode=b.dataset.m;root.querySelectorAll('[data-m]').forEach(x=>x.classList.toggle('on',x===b))});
}
