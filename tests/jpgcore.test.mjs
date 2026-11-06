import {zipSync,strToU8} from '../js/vendor/fflate.js';
import {extractNotebookPages} from '../js/jpgcore.js';
import {prepareSvg} from '../js/svgfix.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import en from '../js/locales/en.js';

let failed=0;
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(error){failed++;console.log('FAIL '+name+'\n  '+error.message)}}
const notebook=files=>zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,typeof value==='string'?strToU8(value):value])));

await check('notebook pages are read in numeric order and embedded assets are resolved',async()=>{
  const bytes=notebook({
    'page10.svg':'<svg width="640" height="480"><image href="images/photo.png"/></svg>',
    'page2.svg':'<svg viewBox="0 0 800 600"><script>alert(1)</script><image href="images/photo.png" onload="bad()"/><image href="https://example.com/image.png"/></svg>',
    'images/photo.png':new Uint8Array([1,2,3])
  });
  const result=extractNotebookPages(bytes);
  assert.deepEqual(result.pages.map(page=>page.number),[2,10]);
  assert.deepEqual(result.pages.map(page=>[page.width,page.height]),[[800,600],[640,480]]);
  assert.match(result.pages[0].svg,/href="data:image\/png;base64,AQID"/);
  assert.doesNotMatch(result.pages[0].svg,/<script|onload=/);
  assert.match(result.pages[0].svg,/href=""/);
  assert.match(result.pages[0].svg,/<rect x="0" y="0" width="800" height="600" fill="#fff"\/><image/);
  assert.match(result.pages[1].svg,/fill="#fff"\/><image/);
});

await check('notebook group order follows the organization rather than the interleaved global page list',()=>{
  const result=extractNotebookPages(notebook({
    'page1.svg':'<svg width="640" height="480"></svg>',
    'page2.svg':'<svg width="800" height="600"></svg>',
    'page3.svg':'<svg width="900" height="700"></svg>',
    'page4.svg':'<svg width="1000" height="800"></svg>',
    'imsmanifest.xml':'<manifest><organizations><organization><item identifierref="group0_pages"><title>Mainmap</title></item><item identifierref="group1_pages"><title>Chapter 1</title></item></organization></organizations><resources><resource identifier="group0_pages"><file href="page4.svg"/><file href="page2.svg"/></resource><resource identifier="group1_pages"><file href="page3.svg"/><file href="page1.svg"/></resource><resource identifier="pages"><file href="page1.svg"/><file href="page2.svg"/><file href="page3.svg"/><file href="page4.svg"/></resource></resources></manifest>'
  }));
  assert.deepEqual(result.pages.map(page=>[page.name,page.number]),[['page4.svg',1],['page2.svg',2],['page3.svg',3],['page1.svg',4]]);
});

await check('multiple SMART Notebook page groups stay together in their organization order',()=>{
  const groups=[
    ['group0_pages',['page0.svg','page6.svg','page3.svg','page7.svg']],
    ['group1_pages',['page9.svg','page10.svg','page11.svg','page12.svg','page13.svg','page2.svg','page8.svg']],
    ['group2_pages',['page16.svg','page4.svg','page17.svg','page18.svg','page19.svg','page5.svg','page20.svg','page21.svg','page22.svg','page23.svg','page24.svg','page25.svg','page26.svg','page27.svg','page28.svg','page29.svg','page30.svg','page31.svg','page32.svg']]
  ];
  const files=Object.fromEntries(groups.flatMap(([,pages])=>pages).map(name=>[name,'<svg width="640" height="480"></svg>']));
  const organization=groups.map(([id],index)=>`<item identifierref="${id}"><title>Group ${index+1}</title></item>`).join('');
  const resources=groups.map(([id,pages])=>`<resource identifier="${id}">${pages.map(href=>`<file href="${href}"/>`).join('')}</resource>`).join('');
  files['imsmanifest.xml']=`<manifest><organizations><organization>${organization}</organization></organizations><resources>${resources}<resource identifier="pages">${Object.keys(files).filter(name=>name.endsWith('.svg')).map(href=>`<file href="${href}"/>`).join('')}</resource></resources></manifest>`;
  const result=extractNotebookPages(notebook(files));
  assert.deepEqual(result.pages.map(page=>page.name),groups.flatMap(([,pages])=>pages));
  assert.deepEqual(result.pages.map(page=>page.number),Array.from({length:30},(_,index)=>index+1));
});

await check('nested relative and percent-encoded image paths are embedded for SVG image rendering',()=>{
  const bytes=notebook({
    'pages/page1.svg':'<svg viewBox="0 0 100 50"><image href="../images/photo%20one.png"/></svg>',
    'images/photo one.png':new Uint8Array([4,5,6])
  });
  const page=extractNotebookPages(bytes).pages[0];
  assert.match(page.svg,/href="data:image\/png;base64,BAUG"/);
});

await check('page dimensions preserve physical SVG units and viewBox proportions',()=>{
  const result=extractNotebookPages(notebook({
    'page1.svg':'<svg width="210mm" viewBox="0 0 1000 500"></svg>',
    'page2.svg':'<svg width="100%" height="100%" viewBox="-20 5 400 200"></svg>'
  }));
  assert.ok(Math.abs(result.pages[0].width/result.pages[0].height-2)<0.001);
  assert.deepEqual([result.pages[1].width,result.pages[1].height],[400,200]);
  assert.match(result.pages[1].svg,/<rect x="-20" y="5" width="400" height="200" fill="#fff"\/>/);
});

await check('invalid notebooks and notebooks without page SVGs report a clear error',()=>{
  assert.throws(()=>extractNotebookPages(new Uint8Array([1,2,3])),/invalid|signature|zip/i);
  assert.throws(()=>extractNotebookPages(notebook({'readme.txt':'no pages'})),/No pageX\.svg/);
});

await check('SMART Notebook SVG pen and dot fixes are shared with JPG previews',()=>{
  const fancypen='<g class="fancypen" points="10,20 30,40" stroke-width="2" transform="rotate(0)"><path d="M0 0 L10 10" /></g></g></g>';
  const fixed=prepareSvg(fancypen);
  assert.doesNotMatch(fixed,/class="fancypen"/);
  assert.equal((fixed.match(/<path\b/g)||[]).length,2);
  assert.match(prepareSvg('<svg><polyline points="4,8" /></svg>'),/points="4\.000,8\.000 4\.500,8\.000"/);
  const page=extractNotebookPages(notebook({'page1.svg':fancypen})).pages[0];
  assert.doesNotMatch(page.svg,/class="fancypen"/);
  assert.ok(page.svg.indexOf('fill="#fff"')<page.svg.indexOf('<path'));
});

await check('Convert to JPG is registered in the SMART Notebook category and starts with no selected pages',()=>{
  const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  const tool=fs.readFileSync(new URL('../js/jpg-maker.js',import.meta.url),'utf8');
  assert.match(app,/\['jpg-maker'.*t\('library\.categoryNotebook'\)/);
  assert.match(tool,/selected\.add\(/);
  assert.doesNotMatch(tool,/checkbox\.checked\s*=\s*true/);
  assert.match(tool,/onclick=\(\)=>exportPages\(false\)/);
  assert.match(tool,/onclick=\(\)=>exportPages\(true\)/);
  assert.match(tool,/class="jpg-workspace"/);
  assert.match(tool,/data-q="pages"/);
  assert.match(tool,/data-q="preview"/);
  assert.equal(en['tool.jpgMaker.short'],'Convert to JPG');
  assert.equal(en['jpg.quality'],'JPEG quality');
});

await check('Convert to JPG: every label it shows exists, including the empty preview text',()=>{
  const tool=fs.readFileSync(new URL('../js/jpg-maker.js',import.meta.url),'utf8');
  const used=[...tool.matchAll(/t\('(jpg\.[A-Za-z]+)'/g)].map(m=>m[1]);
  const missing=[...new Set(used)].filter(key=>!(key in en));
  assert.deepEqual(missing,[]);
  assert.equal(typeof en['jpg.exportSelectedCount'],'function');
  assert.equal(en['jpg.exportSelectedCount'](3),'Export selected (3)');
});

await check('Convert to JPG: a dropped file never navigates away and busy state locks every row control',()=>{
  const tool=fs.readFileSync(new URL('../js/jpg-maker.js',import.meta.url),'utf8');
  assert.match(tool,/root\.addEventListener\('drop'/);
  assert.match(tool,/row\.querySelector\('input'\)\.disabled=busy/);
  assert.match(tool,/button\.disabled=busy/);
});

if(failed)process.exitCode=1;
