// Pure helpers for the page locker (no DOM), so they can be tested in Node.
export const LOCK_VALUE='30';
const IMAGE_TAG=/<image\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;   // the opening tag only (quoted values may contain ">")

export function setLock(text,lock){
  return text.replace(IMAGE_TAG,tag=>{
    const m=tag.match(/(?:xlink:href|href)\s*=\s*["']([^"']+)["']/i),href=m?m[1]:'';
    if(!href||href.startsWith('data:'))return tag;
    if(lock){
      if(/\slocked\s*=/i.test(tag))return tag;
      return tag.replace(/\s*(\/?)>$/,` locked="${LOCK_VALUE}"$1>`);
    }
    return tag.replace(/\s+locked\s*=\s*["'][^"']*["']/gi,'');
  });
}
