export function normalizedPath(path){
  const parts=path.replace(/\\/g,'/').split('/'),stack=[];
  for(const part of parts){if(!part||part==='.')continue;if(part==='..')stack.pop();else stack.push(part)}
  return stack.join('/');
}

export function orderNotebookPages(zip,entries,decoder){
  const manifestName=Object.keys(zip).find(name=>name.toLowerCase()==='imsmanifest.xml');
  if(!manifestName)return entries;
  const xml=decoder.decode(zip[manifestName]);
  const resources=[...xml.matchAll(/<resource\b([^>]*)>([\s\S]*?)<\/resource\s*>/gi)];
  const resourcesById=new Map(resources.map(([,attrs,body])=>{
    const id=attrs.match(/\bidentifier\s*=\s*(["'])(.*?)\1/i)?.[2];
    return [id,body];
  }).filter(([id])=>id));
  const byPath=new Map(entries.map(entry=>[normalizedPath(entry.name).toLowerCase(),entry]));
  const ordered=[],seen=new Set();
  const addResourcePages=body=>{
    for(const match of body.matchAll(/<file\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi)){
      const href=match[2].replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'");
      const entry=byPath.get(normalizedPath(href).toLowerCase());
      if(entry&&!seen.has(entry.name)){ordered.push(entry);seen.add(entry.name)}
    }
  };
  const organization=xml.match(/<organization\b[^>]*>([\s\S]*?)<\/organization\s*>/i)?.[1];
  if(organization){
    for(const match of organization.matchAll(/<item\b([^>]*)>/gi)){
      const idref=match[1].match(/\bidentifierref\s*=\s*(["'])(.*?)\1/i)?.[2];
      const body=idref&&resourcesById.get(idref);
      if(body)addResourcePages(body);
    }
  }
  if(!ordered.length){
    const fallback=resourcesById.get('pages')||resourcesById.get('group0_pages');
    if(fallback)addResourcePages(fallback);
  }
  return ordered.length?ordered.concat(entries.filter(entry=>!seen.has(entry.name)).sort((a,b)=>a.number-b.number)):entries;
}
