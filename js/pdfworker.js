import {loadPyodide} from './vendor/pyodide/pyodide.mjs';
import {PDF_PY} from './pdfpy.js';
let ready=null;
let fetchWrapped=false;
const ENGINE_CACHE='penguin-logistics-pdf-engine-v1';
function installEngineCache(){
  if(fetchWrapped)return;fetchWrapped=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async(input,options)=>{
    const url=typeof input==='string'?input:input.url;
    if(!/\/vendor\/pyodide\/(?:[^?#]+\.(?:wasm|zip|whl)|pyodide-lock\.json)(?:[?#]|$)/i.test(url)||!globalThis.caches)return nativeFetch(input,options);
    const name=decodeURIComponent(url.split('/').pop().split(/[?#]/)[0]);
    try{
      const cache=await caches.open(ENGINE_CACHE),cached=await cache.match(url);
      if(cached){postMessage({type:'status',text:`PDF engine cached: ${name}`,progress:1});return cached}
      const response=await nativeFetch(input,options);if(!response.ok||!response.body)return response;
      const total=+(response.headers.get('content-length')||0),reader=response.body.getReader(),chunks=[];let loaded=0;
      while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;
        const mb=n=>(n/1048576).toFixed(1),text=total?`Loading PDF engine: ${name} · ${mb(loaded)} / ${mb(total)} MB`:`Loading PDF engine: ${name} · ${mb(loaded)} MB`;
        postMessage({type:'status',text,progress:total?Math.min(.99,loaded/total):null});
      }
      const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
      const headers=new Headers(response.headers),copy=new Response(bytes.slice(),{status:response.status,statusText:response.statusText,headers});
      try{await cache.put(url,copy)}catch{}
      postMessage({type:'status',text:`PDF engine ready: ${name}`,progress:1});
      return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
    }catch{return nativeFetch(input,options)}
  };
}
function init(){
  return ready||(ready=(async()=>{
    installEngineCache();postMessage({type:'status',text:'Loading PDF engine…',progress:0});
    const base=new URL('./vendor/pyodide/',import.meta.url).href;
    const py=await loadPyodide({indexURL:base});
    await py.loadPackage(base+'pymupdf-1.28.2-cp313-abi3-pyemscripten_2025_0_wasm32.whl');
    py.runPython(PDF_PY);
    return py;
  })());
}
onmessage=async e=>{
  if(e.data?.type==='init'){
    try{await init();postMessage({type:'status',text:'PDF engine ready and cached on this device.',progress:1})}
    catch(err){postMessage({type:'status',text:`PDF engine could not load: ${String(err?.message||err)}`,progress:0})}
    return;
  }
  const {id,data,title,quality=90}=e.data;
  try{
    const py=await init(),errs=[];
    const convert=py.globals.get('convert');
    const res=convert(new Uint8Array(data),title,(d,t)=>postMessage({type:'page',id,d,t}),m=>errs.push(m),quality);
    const [pdf,failed]=res.toJs();res.destroy?.();
    const bytes=pdf instanceof Uint8Array?pdf:new Uint8Array(pdf);
    postMessage({type:'done',id,bytes,failed,err:errs[0]||''},[bytes.buffer]);
  }catch(err){postMessage({type:'error',id,message:String((err&&err.message)||err).split('\n').filter(Boolean).pop()})}
};
