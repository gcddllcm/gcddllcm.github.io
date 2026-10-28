import {GOATCOUNTER_CODE} from '../config.js?v=3.2.1';
export const $ = id => document.getElementById(id);

// Usage counting: numbers only (tool names + counts). Never file names or file contents.
let gcState=GOATCOUNTER_CODE?'idle':'off';const gcQueue=[];   // idle -> loading -> ready (or off when the script is blocked)
const gcSend=(path,title)=>{try{ window.goatcounter && window.goatcounter.count && window.goatcounter.count({path,title:title||path,event:true}); }catch{}};
export function loadAnalytics(){
  if(gcState!=='idle') return;
  gcState='loading';
  const s=document.createElement('script');
  s.async=true; s.src='https://gc.zgo.at/count.js';
  s.dataset.goatcounter=`https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  s.onload=()=>{gcState='ready';for(const a of gcQueue.splice(0))gcSend(...a)};
  s.onerror=()=>{gcState='off';gcQueue.length=0};   // ad-blocker or offline: drop quietly
  document.head.append(s);
}
export function track(path,title){
  if(gcState==='ready')gcSend(path,title);
  else if(gcState==='loading'&&gcQueue.length<20)gcQueue.push([path,title]);   // script still loading: send it once it is there
}
// One event per run (file counts in size buckets) instead of one beacon per file.
export const countBucket=n=>n<=1?'1':n<=5?'2-5':n<=10?'6-10':n<=20?'11-20':n<=50?'21-50':'51+';
// Let the page breathe between heavy steps. setTimeout(0) is throttled to about 1 s per call in a background tab, so use a message channel there.
export function yieldNow(){
  if(document.hidden&&typeof MessageChannel!=='undefined')return new Promise(r=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();r()};c.port2.postMessage(0)});
  return new Promise(r=>setTimeout(r));
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
