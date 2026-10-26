import {GOATCOUNTER_CODE} from '../config.js?v=3.1.4';
export const $ = id => document.getElementById(id);

// Usage counting: numbers only (tool names + counts). Never file names or file contents.
export function loadAnalytics(){
  if(!GOATCOUNTER_CODE) return;
  const s=document.createElement('script');
  s.async=true; s.src='https://gc.zgo.at/count.js';
  s.dataset.goatcounter=`https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  document.head.append(s);
}
export function track(path,title){
  try{ window.goatcounter && window.goatcounter.count && window.goatcounter.count({path,title:title||path,event:true}); }catch{}
}

// Themed modal. buttons: labels, last = primary. Resolves with the clicked index (Esc = 0).
let msgChain=Promise.resolve();   // dialogs wait for each other: showModal() throws if the dialog is already open
export function msg(title,text,kind='info',buttons=['OK']){
  const show=()=>new Promise(res=>{
    const d=$('dlg');
    if(d.open)d.close();
    d.innerHTML='<div class="dl"><div class="badge"></div><div><h3></h3><p></p></div></div><div class="btns"></div>';
    const b=d.querySelector('.badge'); b.classList.add(kind); b.textContent={info:'i',warning:'!',error:'×'}[kind]||'i';
    d.querySelector('h3').textContent=title; d.querySelector('p').textContent=text;
    buttons.forEach((t,i)=>{const x=document.createElement('button');x.className='btn'+(i===buttons.length-1?' primary':'');x.textContent=t;x.onclick=()=>{d.close();res(i)};d.querySelector('.btns').append(x)});
    d.oncancel=()=>res(0); d.showModal();
  });
  const p=msgChain.then(show);
  msgChain=p.catch(()=>{});
  return p;
}
