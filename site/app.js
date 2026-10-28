// HAUL — app shell: data loading, tab routing, header/banners, pull-to-refresh, settings.
import { $, $$, esc, toDate, fmtTime, ago, load, save, haptic, reducedMotion, arr } from './js/util.js';
import { computeVerdict } from './js/derive.js';
import { ICON } from './js/icons.js';
import { DEFAULT_ORIGIN, DEFAULT_DEST } from './js/consts.js';
import * as goView from './js/views/go.js';
import * as camsView from './js/views/cams.js';
import * as mapView from './js/views/map.js';
import * as wxView from './js/views/weather.js';
import * as checkView from './js/views/checklist.js';
import * as noticesView from './js/views/notices.js';

const DATA_URL = 'data/data.json';
const REFRESH_MS = 5 * 60 * 1000;
const STALE_MIN = 45;

const VIEWS = {
  go: goView, cams: camsView, map: mapView, wx: wxView, check: checkView, notices: noticesView,
};
const TABS = ['go', 'cams', 'map', 'wx', 'check'];

const state = {
  data: null,
  verdict: null,
  tab: 'go',
  fromCache: false,
  fetchFailed: false,
  loading: false,
  lastFetch: 0,
  rendered: new Set(), // views rendered with the current data
};

/** Context object handed to every view. */
const ctx = {
  get data() { return state.data; },
  get verdict() { return state.verdict; },
  get now() { return new Date(); },
  go: (tab) => navigate(tab),
  refresh: () => refresh(true),
  openSettings: () => openSettings(),
  addresses: () => {
    const a = load('haul.addr', {});
    return {
      origin: (a.origin || '').trim(),
      dest: (a.dest || '').trim(),
      reverse: !!a.reverse,
    };
  },
};

/* ------------------------------------------------------------------ data */

async function fetchData() {
  // Cache-bust so neither the browser nor GitHub Pages' CDN serve an old copy.
  // The service worker strips the query when storing its offline copy.
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object') throw new Error('Bad JSON');
  return { json, cached: res.headers.get('x-haul-cache') === 'hit' };
}

async function refresh(user = false) {
  if (state.loading) return;
  state.loading = true;
  document.body.classList.add('is-loading');
  $('#refreshBtn')?.setAttribute('aria-busy', 'true');
  try {
    const { json, cached } = await fetchData();
    const changed = !state.data || json.generated !== state.data.generated;
    state.fromCache = cached;
    state.fetchFailed = false;
    state.lastFetch = Date.now();
    if (changed || user) {
      state.data = json;
      state.verdict = safeVerdict(json);
      state.rendered.clear();
      renderActive();
    }
    if (user) toast(cached ? 'Offline — showing saved data' : changed ? 'Updated with the latest data' : 'Already up to date');
  } catch (err) {
    console.warn('[haul] data fetch failed', err);
    state.fetchFailed = true;
    if (!state.data) renderFatal(err);
    else if (user) toast('Could not refresh — showing saved data');
  } finally {
    state.loading = false;
    document.body.classList.remove('is-loading');
    $('#refreshBtn')?.removeAttribute('aria-busy');
    updateHeader();
  }
}

/** A malformed field must never take the whole app down — fall back to "no verdict". */
function safeVerdict(json) {
  try { return computeVerdict(json, new Date()); } catch (e) { console.error('[haul] verdict', e); return null; }
}

function renderFatal(err) {
  const root = $('#view-go');
  root.innerHTML = `
    <div class="card fatal" role="alert">
      <div class="fatal-ico">${ICON.alert}</div>
      <h2>Can't load trip data</h2>
      <p>${navigator.onLine ? 'The data file did not load.' : 'You are offline and no saved copy exists yet.'}</p>
      <p class="muted">${esc(err?.message || '')}</p>
      <button class="btn btn-primary" id="retryBtn">Try again</button>
    </div>`;
  $('#retryBtn', root)?.addEventListener('click', () => refresh(true));
}

/* --------------------------------------------------------------- header */

function updateHeader() {
  const el = $('#updated');
  const d = state.data;
  const gen = toDate(d?.generated);
  if (!gen) { el.textContent = state.fetchFailed ? 'No data' : 'Loading…'; }
  else el.innerHTML = `Updated <b>${fmtTime(gen)} MT</b> · ${esc(ago(gen))}`;

  const banners = [];
  const offline = !navigator.onLine || state.fromCache;
  if (offline || (state.fetchFailed && d)) {
    const what = offline ? '<b>Offline</b>' : '<b>Can\'t reach the server</b>';
    banners.push(`<div class="banner banner-offline" role="status">${ICON.wx}<span>${what} — showing saved data${gen ? ` from ${fmtTime(gen)} MT` : ''}.</span></div>`);
  }
  if (gen && (Date.now() - gen.getTime()) / 6e4 > STALE_MIN) {
    banners.push(`<div class="banner banner-stale" role="status">${ICON.alert}<span><b>Data is ${esc(ago(gen).replace(' ago', ''))} old.</b> Conditions may have changed — check the cams.</span><button class="banner-btn" data-action="refresh">Refresh</button></div>`);
  }
  if (arr(d?.errors).length) {
    banners.push(`<div class="banner banner-note" role="note">${ICON.info}<span>Some sources failed this update (${arr(d.errors).length}). Shown data may be incomplete.</span></div>`);
  }
  const b = $('#banners');
  const html = banners.join('');
  if (b.innerHTML !== html) b.innerHTML = html;
}

/* --------------------------------------------------------------- routing */

function navigate(tab, { replace = false } = {}) {
  if (!VIEWS[tab]) tab = 'go';
  const hash = `#${tab}`;
  if (location.hash !== hash) {
    if (replace) history.replaceState(null, '', hash); else history.pushState(null, '', hash);
  }
  show(tab);
}

function show(tab) {
  const prev = state.tab;
  state.tab = tab;
  $$('.view').forEach((v) => {
    const on = v.id === `view-${tab}`;
    v.classList.toggle('active', on);
    v.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) v.removeAttribute('inert'); else v.setAttribute('inert', '');
  });
  const tabKey = tab === 'notices' ? 'go' : tab;
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === tabKey;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (prev !== tab) VIEWS[prev]?.onHide?.(ctx);
  renderActive();
  VIEWS[tab]?.onShow?.(ctx);
  document.title = `HAUL · ${{ go: 'Go', cams: 'Cams', map: 'Map', wx: 'Weather', check: 'Checklist', notices: 'Notices' }[tab]}`;
}

function renderActive() {
  const tab = state.tab;
  const view = VIEWS[tab];
  if (!view) return;
  // Checklist doesn't need data; everything else waits for it.
  if (!state.data && tab !== 'check') { if (tab !== 'go') view.skeleton?.($(`#view-${tab}`)); return; }
  if (state.rendered.has(tab)) return;
  try {
    view.render($(`#view-${tab}`), ctx);
  } catch (err) {
    console.error(`[haul] render ${tab} failed`, err);
    $(`#view-${tab}`).innerHTML = `<div class="card fatal" role="alert"><h2>Something broke here</h2><p class="muted">${esc(err.message)}</p></div>`;
  }
  state.rendered.add(tab);
}

/* -------------------------------------------------------- pull-to-refresh */

function setupPullToRefresh() {
  const ptr = $('#ptr');
  let startY = 0; let pulling = false; let dy = 0; let scroller = null;
  const TH = 72;
  document.addEventListener('touchstart', (e) => {
    scroller = e.target.closest?.('.view.active.scroll');
    if (!scroller || scroller.scrollTop > 0 || e.touches.length !== 1 || e.target.closest('.no-ptr')) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0 || scroller.scrollTop > 0) { ptr.style.transform = ''; ptr.classList.remove('show', 'armed'); return; }
    const d = Math.min(110, dy * 0.5);
    ptr.classList.add('show');
    ptr.classList.toggle('armed', d >= TH * 0.75);
    ptr.style.transform = `translate(-50%, ${d}px) rotate(${d * 3}deg)`;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    const armed = ptr.classList.contains('armed');
    ptr.style.transform = '';
    ptr.classList.remove('show', 'armed');
    if (armed) { haptic(12); refresh(true); }
  });
}

/* ---------------------------------------------------------------- toast */

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------- settings */

function openSettings() {
  const dlg = $('#settings');
  const a = ctx.addresses();
  $('#setOrigin').value = a.origin;
  $('#setDest').value = a.dest;
  $('#setReverse').checked = a.reverse;
  $('#setOrigin').placeholder = DEFAULT_ORIGIN;
  $('#setDest').placeholder = DEFAULT_DEST;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

function setupSettings() {
  const dlg = $('#settings');
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  $('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    save('haul.addr', {
      origin: $('#setOrigin').value.trim().slice(0, 200),
      dest: $('#setDest').value.trim().slice(0, 200),
      reverse: $('#setReverse').checked,
    });
    close();
    state.rendered.delete('go');
    renderActive();
    toast('Saved on this device only');
  });
  $('#setClear').addEventListener('click', () => {
    save('haul.addr', {});
    $('#setOrigin').value = ''; $('#setDest').value = ''; $('#setReverse').checked = false;
    state.rendered.delete('go');
    renderActive();
    toast('Addresses cleared');
  });
  $('#setCancel').addEventListener('click', close);
  // Tap on the backdrop closes the sheet.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
}

/* ------------------------------------------------------------------ boot */

function boot() {
  // Inject tab icons.
  const TAB_ICON = { go: ICON.go, cams: ICON.cam, map: ICON.map, wx: ICON.wx, check: ICON.check };
  $$('.tab').forEach((t) => { t.querySelector('.tab-ico').innerHTML = TAB_ICON[t.dataset.tab] || ''; });
  $('#refreshBtn').innerHTML = ICON.refresh;
  $('#settingsBtn').innerHTML = ICON.gear;

  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    haptic();
    if (t.dataset.tab === state.tab) {
      // Second tap on the active tab scrolls to top, like native apps.
      $(`#view-${state.tab}`)?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    navigate(t.dataset.tab);
  }));
  $('#refreshBtn').addEventListener('click', () => refresh(true));
  $('#settingsBtn').addEventListener('click', openSettings);
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('[data-action="refresh"]');
    if (a) refresh(true);
    const g = e.target.closest?.('[data-goto]');
    if (g) { e.preventDefault(); navigate(g.dataset.goto); }
  });

  window.addEventListener('popstate', () => show(tabFromHash()));
  window.addEventListener('online', () => { updateHeader(); refresh(); });
  window.addEventListener('offline', updateHeader);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateHeader();
      if (Date.now() - state.lastFetch > 60 * 1000) refresh();
    }
  });

  setupSettings();
  setupPullToRefresh();
  goView.skeleton($('#view-go'));

  navigate(tabFromHash(), { replace: true });
  refresh();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
  setInterval(() => {
    updateHeader();
    // Re-evaluate the verdict as time moves (gust window, expiring alerts).
    if (state.data) {
      const v = safeVerdict(state.data);
      if (v && v.level !== state.verdict?.level || v.reason !== state.verdict?.reason) {
        state.verdict = v; state.rendered.delete('go'); if (state.tab === 'go') renderActive();
      }
    }
  }, 30 * 1000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('[haul] SW', e));
  }
}

function tabFromHash() {
  const h = (location.hash || '').slice(1);
  return VIEWS[h] ? h : 'go';
}

boot();
