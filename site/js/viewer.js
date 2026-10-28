// Fullscreen camera viewer: native scroll-snap swiping across every view of every cam
// in the list passed in (so you can swipe Lookout → Wallace → Cataldo …).
import { esc, arr, ago, safeUrl, bust, $, isNum, haptic } from './util.js';
import { camName, viewName } from './derive.js';
import { ICON } from './icons.js';

let slides = [];
let current = 0;
let lastFocus = null;
let timer = null;
let scrollRaf = 0;
let closeTimer = null;

export function openViewer(cams, camIdx = 0, viewIdx = 0) {
  const el = $('#viewer');
  clearTimeout(closeTimer); // a quick close→reopen must not wipe the new content
  document.removeEventListener('keydown', onKey);
  slides = [];
  let start = 0;
  arr(cams).forEach((cam, ci) => arr(cam?.views).forEach((view, vi) => {
    if (!safeUrl(view?.img)) return;
    if (ci === camIdx && vi === viewIdx) start = slides.length;
    slides.push({ cam, view });
  }));
  if (!slides.length) return;
  lastFocus = document.activeElement;
  el.innerHTML = `
    <div class="vw-top">
      <button class="icon-btn vw-close" type="button" aria-label="Close camera viewer">${ICON.close}</button>
      <div class="vw-cap" aria-live="polite"></div>
      <a class="icon-btn vw-open" target="_blank" rel="noopener" aria-label="Open original image">${ICON.ext}</a>
    </div>
    <div class="vw-track" tabindex="0" aria-label="Swipe left or right for more cameras">
      ${slides.map((s, i) => `
        <figure class="vw-slide" data-i="${i}">
          <div class="cam-frame vw-frame is-loading">
            <img alt="${esc(camName(s.cam.name))} — ${esc(viewName(s.view, s.cam))}" decoding="async">
            <span class="cam-err-msg">Camera image unavailable</span>
          </div>
        </figure>`).join('')}
    </div>
    <div class="vw-bottom">
      <button class="icon-btn vw-prev" type="button" aria-label="Previous camera">${ICON.back}</button>
      <span class="vw-count"></span>
      <button class="icon-btn vw-next" type="button" aria-label="Next camera">${ICON.chev}</button>
    </div>`;
  el.hidden = false;
  document.body.classList.add('viewer-open');
  requestAnimationFrame(() => el.classList.add('show'));

  const track = $('.vw-track', el);
  track.scrollLeft = start * track.clientWidth;
  current = -1;
  setCurrent(start);

  $('.vw-close', el).addEventListener('click', closeViewer);
  $('.vw-prev', el).addEventListener('click', () => go(current - 1));
  $('.vw-next', el).addEventListener('click', () => go(current + 1));
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== current) setCurrent(i);
    });
  }, { passive: true });
  document.addEventListener('keydown', onKey);
  $('.vw-close', el).focus();

  // Refresh the frame you're looking at every 60 s.
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') loadSlide(current, true); }, 60 * 1000);
}

function go(i) {
  const track = $('#viewer .vw-track');
  if (!track) return;
  i = Math.max(0, Math.min(slides.length - 1, i));
  track.scrollTo({ left: i * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function setCurrent(i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  if (i === current) return;
  current = i;
  haptic(4);
  const s = slides[i];
  const el = $('#viewer');
  const mi = isNum(s.cam.mi) ? `mile ${Math.round(s.cam.mi)} · ` : '';
  const corr = s.cam.corr && s.cam.corr !== 'main' ? (s.cam.corr === 'alt_12' ? 'US-12 alt · ' : 'MT-200 alt · ') : '';
  $('.vw-cap', el).innerHTML = `<b>${esc(camName(s.cam.name))}</b><span>${esc(corr + mi)}${esc(viewName(s.view, s.cam))}${s.view.t ? ` · ${esc(ago(s.view.t))}` : ''}</span>`;
  $('.vw-open', el).href = safeUrl(s.view.img);
  $('.vw-count', el).textContent = `${i + 1} / ${slides.length}`;
  // Load this one and its neighbours.
  [i, i + 1, i - 1].forEach((j) => loadSlide(j));
}

function loadSlide(i, force = false) {
  const s = slides[i];
  const fig = document.querySelector(`#viewer .vw-slide[data-i="${i}"]`);
  if (!s || !fig) return;
  const img = fig.querySelector('img');
  const frame = fig.querySelector('.cam-frame');
  if (img.dataset.loaded && !force) return;
  img.dataset.loaded = '1';
  const probe = new Image();
  probe.onload = () => { img.src = probe.src; frame.classList.remove('is-loading', 'is-err'); };
  probe.onerror = () => { if (!img.src) frame.classList.add('is-err'); frame.classList.remove('is-loading'); };
  probe.src = bust(safeUrl(s.view.img));
}

function onKey(e) {
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowRight') go(current + 1);
  else if (e.key === 'ArrowLeft') go(current - 1);
  else if (e.key === 'Tab') {
    // Keep focus inside the dialog.
    const f = Array.from(document.querySelectorAll('#viewer button, #viewer a[href], #viewer [tabindex="0"]'));
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

export function closeViewer() {
  const el = $('#viewer');
  clearInterval(timer);
  document.removeEventListener('keydown', onKey);
  el.classList.remove('show');
  document.body.classList.remove('viewer-open');
  closeTimer = setTimeout(() => { el.hidden = true; el.innerHTML = ''; slides = []; }, 220);
  lastFocus?.focus?.();
}
