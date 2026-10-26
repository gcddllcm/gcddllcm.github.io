import {loadPyodide} from './vendor/pyodide/pyodide.mjs';
import {PDF_PY} from './pdfpy.js?v=3.1.4';
let ready=null;
let fetchWrapped=false;
// Cache-first storage for the big engine files. If the files in js/vendor/pyodide ever change (new Pyodide or PyMuPDF),
// bump the number: older caches are deleted automatically, so nobody keeps an engine that no longer matches.
const ENGINE_CACHE_PREFIX='penguin-logistics-pdf-engine-',ENGINE_CACHE=ENGINE_CACHE_PREFIX+'v1';
// Setup is shown as 4 stages, each one a real milestone (not just "a file arrived"):
// 1 engine core (package list + wasm + Python library), 2 PyMuPDF download/install, 3 load PyMuPDF into Python, 4 load the conversion code.
// The long silent parts (compiling the wasm, unpacking the wheel, importing PyMuPDF) block this worker, so a message is posted BEFORE each one starts
// and the page keeps its own clock to show that setup is still running.
const WHEEL='pymupdf-1.28.2-cp313-abi3-pyemscripten_2025_0_wasm32.whl';
const STAGES=4,STAGE_FILES={1:['pyodide-lock.json','pyodide.asm.wasm','python_stdlib.zip'],2:[WHEEL]};
const FILE_LABELS={'pyodide-lock.json':'package list','pyodide.asm.wasm':'engine core','python_stdlib.zip':'Python library',[WHEEL]:'PyMuPDF'};
const labelOf=name=>FILE_LABELS[name]||name,doneFiles=new Set(),inFlight=new Map();
let stage=1;
function stageFraction(){const f=STAGE_FILES[stage]||[];if(!f.length)return 0;let s=0;for(const n of f)s+=doneFiles.has(n)?1:(inFlight.get(n)||0);return s/f.length}
function setupProgress(){return Math.min(.99,(stage-1+stageFraction())/STAGES)}   // whole setup, not one file
function setupStatus(code,extra){const f=STAGE_FILES[stage]||[];postMessage({type:'status',code,stage,stages:STAGES,n:f.filter(x=>doneFiles.has(x)).length,of:f.length,pending:f.filter(x=>!doneFiles.has(x)).map(labelOf).join(', '),progress:setupProgress(),...extra})}
async function dropOldCaches(){try{for(const k of await caches.keys())if(k.startsWith(ENGINE_CACHE_PREFIX)&&k!==ENGINE_CACHE)await caches.delete(k)}catch{}}
function installEngineCache(){
  if(fetchWrapped)return;fetchWrapped=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async(input,options)=>{
    const url=typeof input==='string'?input:input.url;
    if(!/\/vendor\/pyodide\/(?:[^?#]+\.(?:wasm|zip|whl)|pyodide-lock\.json)(?:[?#]|$)/i.test(url)||!globalThis.caches)return nativeFetch(input,options);
    const name=decodeURIComponent(url.split('/').pop().split(/[?#]/)[0]);
    try{
      const cache=await caches.open(ENGINE_CACHE),cached=await cache.match(url);
      if(cached){inFlight.delete(name);doneFiles.add(name);setupStatus('cachedFile',{file:name,text:`PDF engine cached: ${name}`});return cached}
      const response=await nativeFetch(input,options);if(!response.ok||!response.body)return response;
      const total=+(response.headers.get('content-length')||0),reader=response.body.getReader(),chunks=[];let loaded=0;
      while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;
        const mb=n=>(n/1048576).toFixed(1),text=total?`Loading PDF engine: ${name} · ${mb(loaded)} / ${mb(total)} MB`:`Loading PDF engine: ${name} · ${mb(loaded)} MB`;
        inFlight.set(name,total?Math.min(.99,loaded/total):0);
        setupStatus('loading',{file:name,label:labelOf(name),loaded:mb(loaded),total:total?mb(total):undefined,text});
      }
      const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
      const headers=new Headers(response.headers),copy=new Response(bytes.slice(),{status:response.status,statusText:response.statusText,headers});
      try{await cache.put(url,copy)}catch{}
      inFlight.delete(name);doneFiles.add(name);setupStatus('readyFile',{file:name,text:`PDF engine ready: ${name}`});
      return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
    }catch{return nativeFetch(input,options)}
  };
}
function init(){
  return ready||(ready=(async()=>{
    installEngineCache();dropOldCaches();doneFiles.clear();inFlight.clear();stage=1;setupStatus('start',{text:'Loading PDF engine…'});
    const base=new URL('./vendor/pyodide/',import.meta.url).href;
    const py=await loadPyodide({indexURL:base});
    stage=2;setupStatus('stage',{text:'Installing PyMuPDF…'});
    await py.loadPackage(base+WHEEL);
    stage=3;setupStatus('stage',{text:'Loading PyMuPDF…'});   // importing the library blocks this worker for a while
    py.runPython('import pymupdf');
    stage=4;setupStatus('stage',{text:'Loading conversion code…'});
    py.runPython(PDF_PY);
    postMessage({type:'setupDone'});
    return py;
  })().catch(err=>{ready=null;throw err}));   // a failed start can be tried again instead of failing forever
}
onmessage=async e=>{
  if(e.data?.type==='init'){
    try{await init();postMessage({type:'status',code:'ready',stage:STAGES,stages:STAGES,text:'PDF engine ready and cached on this device.',progress:1})}
    catch(err){const error=String(err?.message||err);postMessage({type:'status',code:'loadError',error,text:`PDF engine could not load: ${error}`,progress:0})}
    return;
  }
  const {id,data,title,quality=90,resolution=1600}=e.data;
  try{
    const py=await init(),errs=[];
    const convert=py.globals.get('convert');
    const res=convert(new Uint8Array(data),title,(d,t)=>postMessage({type:'page',id,d,t}),m=>errs.push(m),quality,resolution);
    const [pdf,failed]=res.toJs();res.destroy?.();
    const bytes=pdf instanceof Uint8Array?pdf:new Uint8Array(pdf);
    postMessage({type:'done',id,bytes,failed,err:errs[0]||''},[bytes.buffer]);
  }catch(err){
    const full=String((err&&err.message)||err);
    // After running out of memory the Python engine can be left in a bad state: ask the page for a fresh worker.
    postMessage({type:'error',id,message:full.split('\n').filter(Boolean).pop(),fatal:/memory|alloc|abort|unreachable/i.test(full)});
  }
};
