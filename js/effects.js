// Small scroll helper for the motion polish in style.css.
// This file only sets CSS variables; every visual lives in the stylesheet.
// Release Notes: the bright head of the timeline line follows how far the page is scrolled.
const main = document.getElementById('main');
const updates = document.getElementById('updates-page');
let frame = 0;
function syncTimelineProgress() {
  frame = 0;
  const timeline = updates && updates.querySelector('.timeline');
  if (!timeline || !main || !updates.classList.contains('on')) return;
  const max = main.scrollHeight - main.clientHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, main.scrollTop / max)) : 0;
  timeline.style.setProperty('--tl-p', p.toFixed(4));
}
const queueSync = () => { if (!frame) frame = requestAnimationFrame(syncTimelineProgress); };
if (main && updates) {
  main.addEventListener('scroll', queueSync, {passive: true});
  addEventListener('resize', queueSync);
  new MutationObserver(queueSync).observe(updates, {attributes: true, attributeFilter: ['class']});
}
