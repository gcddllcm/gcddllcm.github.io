import {msg,track} from './util.js?v=3.2.0';
import {mountGuide} from './instruction-panel.js?v=3.2.0';
import {t} from './i18n.js?v=3.2.0';
export const isNb=n=>/\.notebook$/i.test(n);
const NBTYPES=[{description:'SMART Notebook',accept:{'application/octet-stream':['.notebook']}}];
export function download(name,bytes){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}

// Shared shell for the two .notebook tools: drop box, "open folder", progress, status.
// run(entries, ignoredCount, ui) does the work. entry = {file, handle|null, dir|null}
export function shell(root,{title,sub,guideKey,top='',hideFolder=false,run}){
  root.innerHTML=`<div class="tool-layout"><div class="tool"><div class="head"><h1>${title}</h1></div><div class="sub">${sub}</div>${top}
  <div class="drop" data-q="drop" tabindex="0"><span class="drop-label">${t('nb.drop')}</span></div>
  ${hideFolder?'':'<div class="btnrow"><button class="btn" data-q="folder">'+t('nb.folder')+'</button></div>'}
  <div><progress data-q="prog" max="1" value="0"></progress><div class="sub" data-q="status">${t('nb.ready')}</div></div><input type="file" data-q="file" multiple accept=".notebook" hidden></div></div>`;
  const q=k=>root.querySelector(`[data-q=${k}]`);let busy=false;
  addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});   // closing the tab mid-run would leave files half done
  const ui={status:t=>q('status').textContent=t,progress:(v,m)=>{if(m)q('prog').max=m;q('prog').value=v},root};
  mountGuide(root.querySelector('.tool-layout'),guideKey);
  if(!hideFolder&&!('showDirectoryPicker' in window))q('folder').hidden=true;
  async function go(entries,ignored){
    if(busy)return;
    if(!entries.length){msg(t('nb.noFilesTitle'),t('nb.noFiles'),'error');return}
    busy=true;q('drop').classList.add('off');
    try{await run(entries,ignored,ui)}catch(e){msg(t('nb.error'),String(e.message||e),'error')}
    busy=false;q('drop').classList.remove('off');ui.progress(0);
  }
  const pick=async()=>{if(busy)return;
    if('showOpenFilePicker' in window){try{const hs=await showOpenFilePicker({multiple:true,types:NBTYPES});go(await Promise.all(hs.map(async h=>({file:await h.getFile(),handle:h,dir:null}))),0)}catch{}}
    else q('file').click()};
  const q$=q('drop');q$.onclick=pick;q$.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')pick()};
  q('file').onchange=e=>{go([...e.target.files].map(file=>({file,handle:null,dir:null})),0);e.target.value=''};
  const folderBtn=q('folder');if(folderBtn)folderBtn.onclick=async()=>{if(busy)return;let d;try{d=await showDirectoryPicker({mode:'readwrite'})}catch{return}
    const out=[];let ign=0;for await(const [n,h] of d.entries())if(h.kind==='file')isNb(n)?out.push({file:await h.getFile(),handle:h,dir:d}):ign++;go(out,ign)};
  q$.ondragover=e=>{e.preventDefault();q$.classList.add('hot')};q$.ondragleave=()=>q$.classList.remove('hot');
  q$.ondrop=async e=>{
    e.preventDefault();q$.classList.remove('hot');if(busy)return;
    const its=[...e.dataTransfer.items].filter(i=>i.kind==='file').map(it=>({hp:it.getAsFileSystemHandle?it.getAsFileSystemHandle():null,f:it.getAsFile()}));
    const out=[];let ign=0;
    for(const {hp,f} of its){let h=null;try{h=await hp}catch{}
      if(h&&h.kind==='directory'){for await(const [n,fh] of h.entries())if(fh.kind==='file')isNb(n)?out.push({file:await fh.getFile(),handle:fh,dir:h}):ign++}
      else if(isNb((h&&h.name)||(f&&f.name)||''))out.push({file:f||await h.getFile(),handle:h&&h.kind==='file'?h:null,dir:null});else ign++}
    go(out,ign);
  };
  return ui;
}
// Ask once, up front, for permission to write into the dropped/picked folders, so files can be saved beside the originals.
// Best effort: if the browser refuses (it wants a fresh click), callers fall back to downloading.
export async function ensureWriteAccess(entries,{files=true}={}){
  const m={mode:'readwrite'};
  for(const dir of new Set(entries.map(e=>e.dir).filter(Boolean))){
    try{if(await dir.queryPermission(m)!=='granted')await dir.requestPermission(m)}catch{}
  }
  if(files)for(const e of entries)if(!e.dir&&e.handle){   // files picked one by one have no folder handle: ask for them too
    try{if(await e.handle.queryPermission(m)!=='granted')await e.handle.requestPermission(m)}catch{}
  }
}

// Write bytes over a file handle. Returns false when the browser refuses, so the caller can fall back to a download.
// createWritable() is always tried (it can prompt by itself) unless the user has already said no.
export async function saveToHandle(handle,bytes){
  const m={mode:'readwrite'};let p='prompt';
  try{p=await handle.queryPermission(m);if(p==='prompt')p=await handle.requestPermission(m)}catch{}
  if(p==='denied')return false;
  try{const w=await handle.createWritable();await w.write(bytes);await w.close();return true}catch{return false}
}
