// Lazy-loading + 60-second auto-refresh for camera images.
// Usage: <img class="camimg" data-src="https://..." alt="..."> then call watchCams(root).
// Only images that are on screen AND in a visible tab get refreshed.
import { bust, safeUrl } from './util.js';

const REFRESH_MS = 60 * 1000;
const visible = new Set();

const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const img = e.target;
      if (e.isIntersecting) {
        visible.add(img);
        // Load the first time it scrolls into view, or if the copy is older than the refresh period.
        if (!img.dataset.loaded || Date.now() - Number(img.dataset.loaded) > REFRESH_MS) loadImg(img);
      } else visible.delete(img);
    }
  }, { rootMargin: '300px 0px' })
  : null;

function loadImg(img) {
  const src = safeUrl(img.dataset.src);
  if (!src) { markError(img); return; }
  img.dataset.loaded = String(Date.now());
  // Load off-DOM first so a failed refresh doesn't replace a good frame with a broken icon.
  const probe = new Image();
  probe.decoding = 'async';
  probe.onload = () => {
    img.src = probe.src;
    img.closest('.cam-frame')?.classList.remove('is-err', 'is-loading');
    img.closest('.cam-frame')?.classList.add('is-ok');
    const ts = img.closest('.cam-frame')?.querySelector('.cam-fetched');
    if (ts) ts.dataset.t = String(Date.now());
  };
  probe.onerror = () => { if (!img.src || !img.closest('.cam-frame')?.classList.contains('is-ok')) markError(img); };
  probe.src = bust(src);
}

function markError(img) {
  img.closest('.cam-frame')?.classList.add('is-err');
  img.closest('.cam-frame')?.classList.remove('is-loading');
}

/** Start watching all un-watched .camimg elements under root. */
export function watchCams(root) {
  root.querySelectorAll('img.camimg:not([data-watched])').forEach((img) => {
    img.dataset.watched = '1';
    img.closest('.cam-frame')?.classList.add('is-loading');
    if (io) io.observe(img); else loadImg(img);
  });
}

/** Stop watching images under root (before re-rendering it). */
export function unwatchCams(root) {
  root.querySelectorAll('img.camimg[data-watched]').forEach((img) => { io?.unobserve(img); visible.delete(img); });
}

/** Force-load a specific image now (used by the fullscreen viewer). */
export function loadNow(img) { if (img) loadImg(img); }

setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  for (const img of visible) {
    // Skip images in hidden tabs or detached nodes.
    if (!img.isConnected) { visible.delete(img); continue; }
    if (img.closest('.view:not(.active)')) continue;
    loadImg(img);
  }
}, REFRESH_MS);
