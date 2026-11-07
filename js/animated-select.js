const ICON='<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 7.5 5 5 5-5"/></svg>';
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

function enhance(select){
  if(select.dataset.animatedSelect||select.multiple||select.size>1)return;
  select.dataset.animatedSelect='true';
  const host=document.createElement('span');host.className='animated-select';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='animated-select-trigger';
  trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const accessibleLabel=select.labels?.[0]?.textContent?.trim();if(accessibleLabel)trigger.setAttribute('aria-label',accessibleLabel);
  const label=document.createElement('span');label.className='animated-select-value';
  const chevron=document.createElement('span');chevron.className='animated-select-chevron';chevron.innerHTML=ICON;
  trigger.append(label,chevron);
  const menu=document.createElement('div');menu.className='animated-select-menu';menu.setAttribute('role','listbox');menu.tabIndex=-1;
  const options=[];
  [...select.options].forEach((option,index)=>{
    if(option.disabled&&option.value==='')return;
    const item=document.createElement('button');item.type='button';item.className='animated-select-option';item.setAttribute('role','option');item.textContent=option.textContent;
    item.dataset.index=String(index);item.style.setProperty('--option-index',String(options.length));item.disabled=option.disabled;menu.append(item);options.push(item);
    item.addEventListener('click',()=>choose(index));
  });
  host.append(trigger,menu);select.insertAdjacentElement('afterend',host);select.classList.add('animated-select-native');
  function sync(){const current=select.selectedIndex;label.textContent=select.options[current]?.textContent||'';options.forEach(item=>{const selected=Number(item.dataset.index)===current;item.setAttribute('aria-selected',String(selected));item.classList.toggle('selected',selected)})}
  function wouldExtendWorkspace(){
    const savedDisplay=menu.style.display;
    menu.style.display='block';
    const menuHeight=menu.getBoundingClientRect().height;
    menu.style.display=savedDisplay;
    if(!menuHeight)return false;
    let panel=host.parentElement;
    while(panel&&panel!==document.body){
      const overflow=getComputedStyle(panel).overflowY;
      if(overflow==='auto'||overflow==='scroll')break;
      panel=panel.parentElement;
    }
    if(!panel||panel===document.body)return false;
    const display=menu.style.display;
    menu.style.display='none';
    const baseScrollHeight=panel.scrollHeight;
    menu.style.display=display;
    const panelRect=panel.getBoundingClientRect();
    const contentBottom=panelRect.top+panel.clientTop+baseScrollHeight-panel.scrollTop;
    const triggerBottom=host.getBoundingClientRect().bottom;
    return triggerBottom+7+menuHeight>contentBottom+1;
  }
  function close({restore=false}={}){host.classList.remove('open');trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus()}
  function open(){host.classList.toggle('opens-up',wouldExtendWorkspace());host.classList.add('open');trigger.setAttribute('aria-expanded','true');options.find(item=>Number(item.dataset.index)===select.selectedIndex)?.focus()||menu.focus()}
  function choose(index){select.selectedIndex=index;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();close({restore:true})}
  trigger.addEventListener('click',()=>host.classList.contains('open')?close():open());
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();open()}else if(event.key==='Escape')close()});
  menu.addEventListener('keydown',event=>{const current=options.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();close({restore:true});return}if(event.key==='Tab'){close();return}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(current+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();return}if(event.key==='Home'||event.key==='End'){event.preventDefault();(event.key==='Home'?options[0]:options.at(-1))?.focus();return}if(event.key==='Enter'||event.key===' '){event.preventDefault();if(current>=0)choose(Number(options[current].dataset.index))}});
  document.addEventListener('pointerdown',event=>{if(!host.contains(event.target))close()});
  select.addEventListener('change',sync);select.addEventListener('input',sync);
  new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});
  sync();
}

function scan(node){if(node instanceof Element){if(node.matches('select'))enhance(node);node.querySelectorAll('select').forEach(enhance)}}
scan(document);
new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(scan))).observe(document.documentElement,{childList:true,subtree:true});
