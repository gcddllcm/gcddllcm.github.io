// Interactive penguin mascot for the two LearnCraft tools.
// Purely cosmetic: it only READS the page (what is running, what finished) and never touches the extension.
//   - click / tap the penguin: recoil, muzzle flash, tracer, speech bubble (4 quick taps = "easy there")
//   - while a run is going: the laser sweeps
//   - when a run ends: confetti for success, a sweat drop for "needs attention"
import {t} from './i18n.js?v=3.3.0';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = list => list[Math.floor(Math.random() * list.length)];
const SPARKS = ['#ffd36b', '#00b894', '#6c5ce7', '#ff6b6b', '#74b9ff'];

export function initMascot(root, {kind, result}) {
  const wrap = root.querySelector('.lc-mascot-wrap'), heading = root.querySelector('.lc-heading');
  const $res = root.querySelector(result);
  if (!wrap || !heading || !$res) return;
  const mk = (tag, cls, parent) => { const n = document.createElement(tag); n.className = cls; n.setAttribute('aria-hidden', 'true'); parent.append(n); return n; };
  const muzzle = mk('span', 'lc-muzzle', wrap), bubble = mk('div', 'lc-bubble', heading);
  const tracer = mk('span', 'lc-tracer', heading);
  const visible = () => root.classList.contains('on');
  let bubbleTimer = 0, moodTimer = 0, busy = false, before = null, taps = [];

  const say = (text, ms = 2600) => {
    bubble.textContent = text; bubble.classList.add('on');
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('on'), ms);
  };
  const mood = (name, ms) => {
    wrap.classList.remove('m-win', 'm-warn'); clearTimeout(moodTimer);
    if (!name) return;
    void wrap.offsetWidth; wrap.classList.add(name);
    moodTimer = setTimeout(() => wrap.classList.remove(name), ms);
  };
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  function shoot() {
    restart(wrap, 'is-firing'); restart(muzzle, 'go');
    const w = wrap.getBoundingClientRect(), h = heading.getBoundingClientRect();
    const mx = w.left + w.width * .05;
    tracer.style.setProperty('--len', Math.max(40, Math.min(mx - h.left - 12, 280)) + 'px');
    tracer.style.top = (w.top + w.height * .505 - h.top) + 'px';
    tracer.style.right = (h.right - mx) + 'px';
    restart(tracer, 'go');
  }
  function confetti() {
    if (reduced()) return;
    for (let i = 0; i < 12; i++) {
      const s = mk('i', 'lc-spark', wrap), a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 40;
      s.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;background:${pick(SPARKS)}`;
      s.addEventListener('animationend', () => s.remove());
    }
  }

  wrap.addEventListener('click', () => {
    const now = Date.now(); taps = taps.filter(x => now - x < 1500); taps.push(now);
    shoot();
    say(taps.length >= 4 ? t('mascot.rapid') : pick(t('mascot.tap')), 1800);
  });

  // ---- follow the page: running / finished (read-only) ----
  function sync() {
    const running = kind === 'golive' ? document.body.classList.contains('app-operation-running') : !!root.querySelector('.lc-extract-progress');
    if (running && !busy) {
      busy = true; before = $res.firstElementChild;
      wrap.classList.add('m-scan'); say(t(kind === 'golive' ? 'mascot.runGolive' : 'mascot.runExtract'), 3200);
    }
    if (!running && busy) {
      busy = false; wrap.classList.remove('m-scan');
      const fresh = $res.firstElementChild !== before && !$res.hidden;
      if (fresh && $res.querySelector('.warn')) { mood('m-warn', 1400); say(t('mascot.warn')); }
      else if (fresh && kind === 'golive' && !$res.querySelector('.lc-complete')) say(t('mascot.preview'));   // a preview changes nothing
      else if (fresh) { mood('m-win', 1400); confetti(); say(t('mascot.win')); }
      else { mood('m-warn', 1400); say(t('mascot.oops')); }
    }
  }
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(); }); };
  const mo = new MutationObserver(schedule);
  root.querySelectorAll('.lc-card').forEach(c => mo.observe(c, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-busy', 'hidden']}));
  if (kind === 'golive') mo.observe(document.body, {attributes: true, attributeFilter: ['class']});

  // ---- idle chatter while the tool is open and nothing runs ----
  setInterval(() => { if (visible() && !busy && !bubble.classList.contains('on')) say(pick(t(kind === 'golive' ? 'mascot.idleGolive' : 'mascot.idleExtract')), 3200); }, 11000);
}
