import {unzipSync} from './vendor/fflate.js?v=3.6.1';
import {fixNames} from './zipnames.js?v=3.6.1';
import {prepareSvg} from './svgfix.js?v=3.6.1';
import {readImageInfo} from './imgcore.js?v=3.6.1';
import {orderNotebookPages,normalizedPath} from './notebook-pages.js?v=3.6.1';

const SKIP_ENTRY=/(^|\/)thumbnails\/|^preview\.png$|\.(mp4|m4v|mov|avi|wmv|mpe?g|webm|mp3|wav|ogg|m4a|wma|swf|flv)$/i;
const MIME_TYPES={'.bmp':'image/bmp','.gif':'image/gif','.jpeg':'image/jpeg','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};

function referencedPath(ref,pageName){
  const raw=ref.split(/[?#]/,1)[0].replace(/\\/g,'/'),absolute=raw.startsWith('/');
  const base=absolute?'':(pageName.includes('/')?pageName.slice(0,pageName.lastIndexOf('/')+1):'');
  const parts=[];
  for(const part of (base+raw.replace(/^\/+/, '')).split('/')){
    if(!part||part==='.')continue;
    if(part==='..'){if(!parts.length)return null;parts.pop()}else parts.push(part);
  }
  return parts.join('/').toLowerCase();
}
function mimeType(name){
  const ext=(name.match(/\.[^.]+$/)||[''])[0].toLowerCase();
  return MIME_TYPES[ext]||'application/octet-stream';
}
function base64(bytes){
  let binary='';
  for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(binary);
}
function svgDimensions(svg){
  const root=svg.match(/<svg\b[^>]*>/i)?.[0]||'';
  const read=key=>{
    const value=root.match(new RegExp(`\\b${key}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px|pt|pc|in|cm|mm)?\\s*["']`,'i'));
    if(!value)return 0;
    const amount=Number(value[1]),unit=(value[2]||'px').toLowerCase();
    return amount*({px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4}[unit]);
  };
  const width=read('width'),height=read('height');
  const viewBox=root.match(/\bviewBox\s*=\s*["']\s*([-+.\d]+)[\s,]+([-+.\d]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if(viewBox){
    const vbWidth=Number(viewBox[3]),vbHeight=Number(viewBox[4]);
    if(!(vbWidth>0&&vbHeight>0))return {width:300,height:150};
    if(width&&height)return {width,height};
    if(width&&vbWidth&&vbHeight)return {width,height:width*vbHeight/vbWidth};
    if(height&&vbWidth&&vbHeight)return {width:height*vbWidth/vbHeight,height};
    return {width:vbWidth,height:vbHeight};
  }
  // Percentages have no external viewport when an SVG is rasterized from a blob.
  // SVG's replaced-image fallback viewport is 300×150; preserve that 2:1 ratio.
  if(width&&height)return {width,height};
  if(width)return {width,height:width/2};
  if(height)return {width:height*2,height};
  return {width:300,height:150};
}
function embeddedRasterScale(svg,pageName,zip,namesLower){
  let renderScale=1;
  for(const tag of svg.match(/<image\b[^>]*>/gi)||[]){
    const href=tag.match(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/i)?.[2];
    if(!href||/^(?:data:|#|https?:|\/\/)/i.test(href))continue;
    let ref=href.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    try{ref=decodeURIComponent(ref)}catch{}
    const path=referencedPath(ref,pageName),real=path&&namesLower.get(path),ext=(real?.match(/\.[^.]+$/)||[''])[0].toLowerCase();
    if(!real||!['.jpg','.jpeg','.png','.bmp','.webp'].includes(ext))continue;
    const size=readImageInfo(zip[real],ext);
    const dimension=key=>{
      const value=tag.match(new RegExp(`\\b${key}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`,'i'));
      return value?Number(value[1]):0;
    };
    const width=dimension('width'),height=dimension('height');
    if(!(size.width>0&&size.height>0&&width>0&&height>0))continue;
    const transform=tag.match(/\btransform\s*=\s*(["'])(.*?)\1/i)?.[2]||'';
    const scaleMatch=transform.match(/\bscale\(\s*([-+]?\d*\.?\d+)(?:[ ,]+([-+]?\d*\.?\d+))?\s*\)/i);
    const scaleX=scaleMatch?Math.abs(Number(scaleMatch[1])):1,scaleY=scaleMatch?Math.abs(Number(scaleMatch[2]||scaleMatch[1])):1;
    const density=Math.min(size.width/(width*scaleX),size.height/(height*scaleY));
    if(Number.isFinite(density)&&density>renderScale)renderScale=density;
  }
  return renderScale;
}
function sanitizeSvg(svg){
  svg=svg.replace(/^\uFEFF/,'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi,'');
  const safeCss=css=>css.replace(/url\(\s*(["']?)(?!#|data:)(?:[^)"']|\\.)*?\1\s*\)/gi,'none');
  svg=svg.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,(_,open,css,close)=>open+safeCss(css)+close);
  svg=svg.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi,(_,quote,css)=>`style=${quote}${safeCss(css)}${quote}`);
  if(!/<svg\b[^>]*\bxmlns\s*=/i.test(svg))svg=svg.replace(/<svg\b/i,'<svg xmlns="http://www.w3.org/2000/svg"');
  if(!/<svg\b[^>]*\bxmlns:xlink\s*=/i.test(svg))svg=svg.replace(/<svg\b/i,'<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  return svg;
}
function withWhitePage(svg){
  const root=svg.match(/<svg\b[^>]*>/i)?.[0];
  if(!root)return svg;
  const viewBox=root.match(/\bviewBox\s*=\s*["']\s*([-+.\d]+)[\s,]+([-+.\d]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const background=viewBox
    ?`<rect x="${viewBox[1]}" y="${viewBox[2]}" width="${viewBox[3]}" height="${viewBox[4]}" fill="#fff"/>`
    :'<rect x="0" y="0" width="100%" height="100%" fill="#fff"/>';
  if(/\/\s*>$/.test(root))return svg.replace(root,root.replace(/\/\s*>$/,'>')+background+'</svg>');
  return svg.replace(root,root+background);
}
function correctOversizedImagePages(pages){
  const byWidth=new Map();
  for(const page of pages){
    const key=Math.round(page.width*100)/100;
    if(!byWidth.has(key))byWidth.set(key,[]);
    byWidth.get(key).push(page);
  }
  for(const siblings of byWidth.values()){
    if(siblings.length<3)continue;
    const heights=new Map();
    for(const page of siblings){const key=Math.round(page.height);heights.set(key,(heights.get(key)||0)+1)}
    const [referenceHeight,count]=[...heights].sort((a,b)=>b[1]-a[1])[0];
    if(count<siblings.length*0.6)continue;
    for(const page of siblings){
      if(page.height<=referenceHeight*1.25)continue;
      const root=page.svg.match(/<svg\b[^>]*>/i)?.[0],images=page.svg.match(/<image\b[^>]*>/gi)||[];
      const artwork=page.svg.replace(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" fill="#fff"\s*\/>/gi,'');
      if(!root||images.length!==1||/<(?:path|rect|circle|ellipse|line|polyline|polygon|text|use)\b/i.test(artwork))continue;
      const image=images[0],attr=name=>image.match(new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)(px)?["']`,'i'));
      const x=attr('x'),y=attr('y'),width=attr('width'),height=attr('height');
      const rootHeight=root.match(/\bheight\s*=\s*(["'])([\d.]+)(px)?\1/i);
      if(!x||!y||!width||!height||!rootHeight)continue;
      const [ix,iy,iw,ih]=[x,y,width,height].map(value=>Number(value[1]));
      const simpleRotation=/^rotate\(\s*[-+]?0(?:\.0+)?(?:\s*,[^)]*)?\s*\)$/i;
      const transform=image.match(/\btransform\s*=\s*(["'])(.*?)\1/i);
      if(transform&&!simpleRotation.test(transform[2]))continue;
      if(Math.abs(ix)>0.5||Math.abs(iy)>0.5||iw<page.width*0.98||iw>page.width*1.02||Math.abs(ih-referenceHeight)>referenceHeight*0.04)continue;
      if(iy+ih>referenceHeight*1.04)continue;
      const newRoot=root.replace(rootHeight[0],`height=${rootHeight[1]}${referenceHeight}${rootHeight[3]||''}${rootHeight[1]}`);
      page.svg=page.svg.replace(root,newRoot);
      page.height=referenceHeight;
    }
  }
}

export function extractNotebookPages(bytes){
  const zip=fixNames(unzipSync(new Uint8Array(bytes),{filter:file=>!SKIP_ENTRY.test(file.name)}));
  const namesLower=new Map();
  for(const name of Object.keys(zip))if(!namesLower.has(normalizedPath(name).toLowerCase()))namesLower.set(normalizedPath(name).toLowerCase(),name);
  let entries=Object.keys(zip).map(name=>({name,match:/(?:^|\/)page(\d+)\.svg$/i.exec(name)}))
    .filter(entry=>entry.match).map(entry=>({name:entry.name,number:Number(entry.match[1])}))
    .sort((a,b)=>a.number-b.number);
  if(!entries.length)throw new Error('No pageX.svg files were found inside this .notebook file.');

  const decoder=new TextDecoder('utf-8'),assetData=new Map();
  entries=orderNotebookPages(zip,entries,decoder).map((entry,index)=>({...entry,number:index+1}));
  function inlineAsset(name,stack=new Set()){
    if(assetData.has(name))return assetData.get(name);
    if(stack.has(name))return '';
    stack.add(name);
    let bytes=zip[name],mime=mimeType(name);
    if(mime==='image/svg+xml'){
      let svg=sanitizeSvg(decoder.decode(bytes));
      svg=svg.replace(/\b(xlink:href|href)\s*=\s*(["'])(.*?)\2/gi,(attribute,attr,quote,rawRef)=>{
        const ref=rawRef.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
        if(/^(?:data:|#)/i.test(ref))return `${attr}=${quote}${ref}${quote}`;
        if(/^(?:https?:|\/\/|javascript:|blob:|file:)/i.test(ref))return `${attr}=${quote}${quote}`;
        let decoded=ref;
        try{decoded=decodeURIComponent(ref)}catch{}
        const path=referencedPath(decoded,name),real=path&&namesLower.get(path);
        if(!real||!/\.(?:bmp|gif|jpe?g|png|svg|webp)$/i.test(real))return `${attr}=${quote}${quote}`;
        const data=inlineAsset(real,stack);
        return `${attr}=${quote}${data}${quote}`;
      });
      bytes=new TextEncoder().encode(svg);
    }
    stack.delete(name);
    const uri=`data:${mime};base64,${base64(bytes)}`;
    assetData.set(name,uri);
    return uri;
  }

  const pages=entries.map(({name,number})=>{
    let svg=sanitizeSvg(decoder.decode(zip[name]));
    const renderScale=embeddedRasterScale(svg,name,zip,namesLower);
    svg=svg.replace(/\b(xlink:href|href)\s*=\s*(["'])(.*?)\2/gi,(attribute,attr,quote,rawRef)=>{
      const ref=rawRef.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      if(/^(?:data:|#)/i.test(ref))return `${attr}=${quote}${ref}${quote}`;
      if(/^(?:https?:|\/\/|javascript:|blob:|file:)/i.test(ref))return `${attr}=${quote}${quote}`;
      let decoded=ref;
      try{decoded=decodeURIComponent(ref)}catch{}
      const path=referencedPath(decoded,name),real=path&&namesLower.get(path);
      if(!real||!/\.(?:bmp|gif|jpe?g|png|svg|webp)$/i.test(real))return `${attr}=${quote}${quote}`;
      return `${attr}=${quote}${inlineAsset(real)}${quote}`;
    });
    svg=withWhitePage(prepareSvg(svg));
    return {number,name,svg,renderScale,...svgDimensions(svg)};
  });
  correctOversizedImagePages(pages);
  return {pages};
}
