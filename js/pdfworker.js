import {loadPyodide} from './vendor/pyodide/pyodide.mjs';
import {PDF_PY} from './pdfpy.js?v=3.1.4';
let ready=null;
let fetchWrapped=false;
// Cache-first storage for the big engine files. If the files in js/vendor/pyodide ever change (new Pyodide or PyMuPDF),
// bump the number: older caches are deleted automatically, so nobody keeps an engine that no longer matches.
const ENGINE_CACHE_PREFIX='penguin-logistics-pdf-engine-',ENGINE_CACHE=ENGINE_CACHE_PREFIX+'v1';
// Setup is shown as "n of N steps done": one step per engine file fetched below (lock file, wasm, stdlib, PyMuPDF wheel) plus a last step that starts the engine.
// If the engine ever needs a different number of files, change ENGINE_FILES (the count only ever grows past it, so the display can't break).
const ENGINE_FILES=4,doneFiles=new Set(),inFlight=new Map();
const setupSteps=()=>Math.max(ENGINE_FILES,doneFiles.size)+1;
function setupProgress(){let part=0;for(const f of inFlight.values())part+=f;return Math.min(.99,(doneFiles.size+part)/setupSteps())}   // whole setup, not one file
function setupStatus(code,extra){postMessage({type:'status',code,done:doneFiles.size,steps:setupSteps(),progress:setupProgress(),...extra})}
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
        setupStatus('loading',{file:name,loaded:mb(loaded),total:total?mb(total):undefined,text});
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
    installEngineCache();dropOldCaches();doneFiles.clear();inFlight.clear();setupStatus('start',{text:'Loading PDF engine…'});
    const base=new URL('./vendor/pyodide/',import.meta.url).href;
    const py=await loadPyodide({indexURL:base});
    await py.loadPackage(base+'pymupdf-1.28.2-cp313-abi3-pyemscripten_2025_0_wasm32.whl');
    setupStatus('starting',{done:setupSteps()-1,text:'Starting PDF engine…'});   // last step
    py.runPython(PDF_PY);
    return py;
  })().catch(err=>{ready=null;throw err}));   // a failed start can be tried again instead of failing forever
}
onmessage=async e=>{
  if(e.data?.type==='init'){
    try{await init();postMessage({type:'status',code:'ready',done:setupSteps(),steps:setupSteps(),text:'PDF engine ready and cached on this device.',progress:1})}
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
