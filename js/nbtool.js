import {msg,track} from './util.js?v=3.1.4';
import {bindInstructionPanel} from './instruction-panel.js?v=3.1.4';
import {t} from './i18n.js?v=3.1.4';
export const isNb=n=>/\.notebook$/i.test(n);
const NBTYPES=[{description:'SMART Notebook',accept:{'application/octet-stream':['.notebook']}}];
export const sleep=()=>new Promise(r=>setTimeout(r));
export function download(name,bytes){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}

// Shared shell for the two .notebook tools: drop box, "open folder", progress, status.
// run(entries, ignoredCount, ui) does the work. entry = {file, handle|null, dir|null}
export function shell(root,{title,sub,info,top='',hideFolder=false,run}){
  root.innerHTML=`<div class="tool-layout"><div class="tool"><div class="head"><h1>${title}</h1><button class="iconbtn instruction-toggle" data-q="info" title="Instructions" aria-label="Open instructions" aria-expanded="false">i</button></div><div class="sub">${sub}</div>${top}
  <div class="drop" data-q="drop" tabindex="0">${t('nb.drop')}</div>
  ${hideFolder?'':'<div class="btnrow"><button class="btn" data-q="folder">'+t('nb.folder')+'</button></div>'}
  <div><progress data-q="prog" max="1" value="0"></progress><div class="sub" data-q="status">${t('nb.ready')}</div></div><input type="file" data-q="file" multiple accept=".notebook" hidden></div>
  <aside class="instruction-panel" data-q="instruction" aria-hidden="true" inert><div class="instruction-heading"><div><h2>Instructions</h2><p>How to use</p></div><button class="iconbtn" data-q="close-instruction" aria-label="Close instructions">×</button></div><div class="instruction-copy" data-q="instruction-copy"></div></aside></div>`;
  const q=k=>root.querySelector(`[data-q=${k}]`);let busy=false;
  const ui={status:t=>q('status').textContent=t,progress:(v,m)=>{if(m)q('prog').max=m;q('prog').value=v},root};
  bindInstructionPanel(root.querySelector('.tool-layout'),q('info'),q('instruction'),q('close-instruction'),q('instruction-copy'),info);
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
export const finishMsg=(failures,okText,warnTitle,note,total,done)=>failures.length
  ?msg(warnTitle,`${done} / ${total} file(s) ${okText}.${note}\n\nProblems:\n${failures.slice(0,10).join('\n')}${failures.length>10?'\n...':''}`,'warning')
  :msg('Done',`${okText[0].toUpperCase()+okText.slice(1)} ${total} file(s) successfully.${note}`);

// Ask once, up front, for permission to write into the dropped/picked folders, so files can be saved beside the originals.
// Best effort: if the browser refuses (it wants a fresh click), callers fall back to downloading.
export async function ensureWriteAccess(entries){
  for(const dir of new Set(entries.map(e=>e.dir).filter(Boolean))){
    try{if(await dir.queryPermission({mode:'readwrite'})!=='granted')await dir.requestPermission({mode:'readwrite'})}catch{}
  }
}
