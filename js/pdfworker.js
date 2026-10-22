import {loadPyodide} from './vendor/pyodide/pyodide.mjs';
import {PDF_PY} from './pdfpy.js?v=3.1.3';
let ready=null;
let fetchWrapped=false;
// Cache-first storage for the big engine files. If the files in js/vendor/pyodide ever change (new Pyodide or PyMuPDF),
// bump the number: older caches are deleted automatically, so nobody keeps an engine that no longer matches.
const ENGINE_CACHE_PREFIX='penguin-logistics-pdf-engine-',ENGINE_CACHE=ENGINE_CACHE_PREFIX+'v1';
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
      if(cached){postMessage({type:'status',code:'cachedFile',file:name,text:`PDF engine cached: ${name}`,progress:1});return cached}
      const response=await nativeFetch(input,options);if(!response.ok||!response.body)return response;
      const total=+(response.headers.get('content-length')||0),reader=response.body.getReader(),chunks=[];let loaded=0;
      while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;
        const mb=n=>(n/1048576).toFixed(1),text=total?`Loading PDF engine: ${name} · ${mb(loaded)} / ${mb(total)} MB`:`Loading PDF engine: ${name} · ${mb(loaded)} MB`;
        postMessage({type:'status',code:'loading',file:name,loaded:mb(loaded),total:total?mb(total):undefined,text,progress:total?Math.min(.99,loaded/total):null});
      }
      const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
      const headers=new Headers(response.headers),copy=new Response(bytes.slice(),{status:response.status,statusText:response.statusText,headers});
      try{await cache.put(url,copy)}catch{}
      postMessage({type:'status',code:'readyFile',file:name,text:`PDF engine ready: ${name}`,progress:1});
      return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
    }catch{return nativeFetch(input,options)}
  };
}
function init(){
  return ready||(ready=(async()=>{
    installEngineCache();dropOldCaches();postMessage({type:'status',code:'start',text:'Loading PDF engine…',progress:0});
    const base=new URL('./vendor/pyodide/',import.meta.url).href;
    const py=await loadPyodide({indexURL:base});
    await py.loadPackage(base+'pymupdf-1.28.2-cp313-abi3-pyemscripten_2025_0_wasm32.whl');
    py.runPython(PDF_PY);
    return py;
  })().catch(err=>{ready=null;throw err}));   // a failed start can be tried again instead of failing forever
}
onmessage=async e=>{
  if(e.data?.type==='init'){
    try{await init();postMessage({type:'status',code:'ready',text:'PDF engine ready and cached on this device.',progress:1})}
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
