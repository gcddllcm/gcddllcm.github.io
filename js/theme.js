import {t} from './i18n.js?v=3.6.0';

// Light / dark theme.
// The choice is kept in localStorage ('pl-theme'), so every computer remembers its own last mode.
// index.html applies it before the first paint (inline script in <head>), which prevents a flash.
// Dark is the default for a computer that has never switched.
const KEY = 'pl-theme';
const COLORS = {dark: '#1e1f26', light: '#f3f4fa'};
const DURATION = 1000;
const EASE = 'cubic-bezier(.62,.02,.22,1)';
const root = document.documentElement;
let busy = false;

export const getTheme = () => (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

function store(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode or blocked storage: the choice just lasts for this visit */ }
}

// Applies a theme to the page (no animation). Also used when another tab of the site changes theme.
function paint(theme) {
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[theme]);
  const button = document.getElementById('theme-toggle');
  if (button) {
    const label = t(theme === 'light' ? 'nav.themeToDark' : 'nav.themeToLight');
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  // The Chrome extension's popup follows this site's theme (bridge.js listens for this event).
  try { window.dispatchEvent(new CustomEvent('pl-theme-change', {detail: {theme}})); } catch { /* ignore */ }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Expanding ring that rides the edge of the reveal. It is a named view-transition element,
// so it is drawn above both page snapshots.
function makeRing(x, y, radius, to) {
  const ring = document.createElement('div');
  ring.className = `theme-ring theme-ring-${to}`;
  ring.setAttribute('aria-hidden', 'true');
  ring.style.setProperty('--ring-x', `${x}px`);
  ring.style.setProperty('--ring-y', `${y}px`);
  ring.style.setProperty('--ring-r', '0px');
  document.body.appendChild(ring);
  return {
    ring,
    run: () => ring.animate({'--ring-r': ['0px', `${radius}px`], opacity: [1, 1, 0]}, {duration: DURATION, easing: EASE, fill: 'forwards'}).finished,
  };
}

async function switchWithReveal(next, origin) {
  const {x, y} = origin;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 40;
  root.classList.add('theme-switching');
  root.dataset.themeTo = next;
  let ringHandle = null;

  const update = () => {
    paint(next);
    store(next);
    ringHandle = makeRing(x, y, radius, next);
  };

  try {
    if (typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(update);
      await transition.ready;
      root.animate(
        {clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]},
        {duration: DURATION, easing: EASE, pseudoElement: '::view-transition-new(root)', fill: 'forwards'},
      );
      root.animate(
        {transform: ['scale(1)', 'scale(1.025)'], filter: ['blur(0px) brightness(1)', 'blur(5px) brightness(.9)']},
        {duration: DURATION, easing: EASE, pseudoElement: '::view-transition-old(root)', fill: 'forwards'},
      );
      if (ringHandle) ringHandle.run();
      await transition.finished;
    } else {
      await fallbackReveal(next, x, y, radius, update);
    }
  } catch {
    // If the animation cannot run, make sure the theme is still applied.
    if (getTheme() !== next) { paint(next); store(next); }
  } finally {
    if (ringHandle) ringHandle.ring.remove();
    root.classList.remove('theme-switching');
    delete root.dataset.themeTo;
  }
}

// Browsers without the View Transitions API: colours fade (CSS) while a wave of light sweeps the screen.
async function fallbackReveal(next, x, y, radius, update) {
  const wave = document.createElement('div');
  wave.className = `theme-wave theme-wave-${next}`;
  wave.style.setProperty('--wave-x', `${x}px`);
  wave.style.setProperty('--wave-y', `${y}px`);
  wave.setAttribute('aria-hidden', 'true');
  document.body.appendChild(wave);
  update();
  const done = wave.animate(
    {clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`], opacity: [0.9, 0.9, 0]},
    {duration: DURATION, easing: EASE, fill: 'forwards'},
  ).finished;
  await done;
  wave.remove();
}

async function toggle(event) {
  if (busy) return;
  const next = getTheme() === 'light' ? 'dark' : 'light';
  const button = event.currentTarget;
  if (reducedMotion()) { paint(next); store(next); return; }
  const box = button.getBoundingClientRect();
  busy = true;
  try {
    await switchWithReveal(next, {x: box.left + box.width / 2, y: box.top + box.height / 2});
  } finally {
    busy = false;
  }
}

export function initTheme() {
  paint(getTheme());           // keeps the button label and <meta theme-color> in step with the early inline script
  const button = document.getElementById('theme-toggle');
  if (button) button.addEventListener('click', toggle);
  // Another tab of this site switched theme: follow it right away.
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    const next = e.newValue === 'light' ? 'light' : 'dark';
    if (next !== getTheme()) paint(next);
  });
}
