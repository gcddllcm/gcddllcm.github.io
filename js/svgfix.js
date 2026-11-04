const FANCY_RE=/<g\s[^>]*class="fancypen"[^>]*>[\s\S]*?<\/g><\/g><\/g>/gi;
const POLY_RE=/<polyline\b[^>]*>/gi;

function extent(values){
  let min=Infinity,max=-Infinity;
  for(const value of values){if(value<min)min=value;if(value>max)max=value}
  return [min,max];
}

function stampFancypen(block){
  try{
    const headMatch=block.match(/^<g\s[^>]*>/);
    if(!headMatch)return block;
    const head=headMatch[0],pointsMatch=head.match(/\spoints\s*=\s*["']([^"']*)["']/i),widthMatch=head.match(/\sstroke-width\s*=\s*["']([\d.]+)["']/i);
    const shapeMatch=block.slice(head.length).match(/<path\b[^>]*\sd\s*=\s*["']([^"']*)["'][^>]*\/>/i);
    if(!pointsMatch||!widthMatch||!shapeMatch)return block;
    const points=pointsMatch[1].trim().split(/\s+/).map(point=>point.split(',').map(Number));
    const numbers=(shapeMatch[1].match(/-?(?:\d+\.?\d*|\.\d+)/g)||[]).map(Number);
    if(!numbers.length||points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)))return block;
    const xs=[],ys=[];
    for(let i=0;i<numbers.length;i+=2){xs.push(numbers[i]);if(i+1<numbers.length)ys.push(numbers[i+1])}
    if(!xs.length||!ys.length)return block;
    const [minX,maxX]=extent(xs),[minY,maxY]=extent(ys),centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
    const size=Math.max(maxX-minX,maxY-minY);
    if(!points.length||size<=0)return block;
    const scale=Number.parseFloat(widthMatch[1])/size,transformMatch=head.match(/\stransform\s*=\s*["']([^"']*)["']/i),transform=transformMatch?transformMatch[1]:'';
    const stamps=points.map(([x,y])=>`<g transform="translate(${x.toFixed(3)},${y.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${(-centerX).toFixed(3)},${(-centerY).toFixed(3)})">${shapeMatch[0]}</g>`).join('');
    return `<g transform="${transform}">${stamps}</g>`;
  }catch{return block}
}

function fixDotPolyline(tag){
  const pointsMatch=tag.match(/(\spoints\s*=\s*["'])([^"']*)(["'])/i);
  if(!pointsMatch)return tag;
  const points=pointsMatch[2].trim().split(/\s+/).map(point=>point.split(',').map(Number));
  if(!points.length||points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)))return tag;
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const [minX,maxX]=extent(xs),[minY,maxY]=extent(ys);
  if(maxX-minX<0.5&&maxY-minY<0.5){
    const [x,y]=points[0],newPoints=`${x.toFixed(3)},${y.toFixed(3)} ${(x+0.5).toFixed(3)},${y.toFixed(3)}`;
    return tag.replace(pointsMatch[0],`${pointsMatch[1]}${newPoints}${pointsMatch[3]}`);
  }
  return tag;
}

export function prepareSvg(svgText){
  if(svgText.includes('class="fancypen"')||svgText.includes("class='fancypen'"))svgText=svgText.replace(FANCY_RE,stampFancypen);
  if(svgText.includes('<polyline'))svgText=svgText.replace(POLY_RE,fixDotPolyline);
  return svgText;
}
