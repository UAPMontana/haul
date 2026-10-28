// MAP tab — Leaflet (lazy-loaded from unpkg) on keyless Esri dark-gray tiles (OSM + imagery as alternates).
import { esc, arr, isNum, ago, fmtTime, safeUrl, bust, $ } from '../util.js';
import {
  camName, viewName, parseIdWx, signMessage, eventText, visibleEvents, hourlyAt, gustAt, isPassName,
} from '../derive.js';
import { ICON, KIND_LABEL } from '../icons.js';
import { POIS, POI_META } from '../consts.js';
import { openViewer } from '../viewer.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let L = null;
let map = null;
let groups = null;
let leafletPromise = null;
let meMarker = null;
let fitted = false;
let camList = [];      // [{c, i, v}] kept so the cam layer can re-cluster on zoom
let lastCtx = null;

// Below this zoom the checkpoint temp bubbles collapse to small dots (they overlap at route-fit zoom).
const WX_FULL_ZOOM = 9;
// Cams closer than this many screen px merge into one count bubble (Coeur d'Alene has a dozen).
const CAM_CLUSTER_PX = 44;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  // Wait for the stylesheet as well as the script: initialising Leaflet before its CSS applies
  // lays the panes out in normal flow and leaves an empty gray band above the tiles.
  const cssReady = new Promise((resolve) => {
    let css = document.querySelector(`link[href="${LEAFLET_CSS}"]`);
    if (css?.sheet) { resolve(); return; }
    if (!css) {
      css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
    }
    css.addEventListener('load', () => resolve(), { once: true });
    css.addEventListener('error', () => resolve(), { once: true }); // map still works, controls unstyled
  });
  const jsReady = new Promise((resolve, reject) => {
    const js = document.createElement('script');
    js.src = LEAFLET_JS; js.crossOrigin = 'anonymous'; js.async = true;
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet missing')));
    js.onerror = () => { leafletPromise = null; js.remove(); reject(new Error('Could not load the map library')); };
    document.head.appendChild(js);
  });
  leafletPromise = Promise.all([jsReady, cssReady]).then(([lib]) => lib);
  return leafletPromise;
}

export function skeleton(root) { if (!root.firstChild) root.innerHTML = '<div class="sk sk-map"></div>'; }

export function render(root, ctx) {
  if (!map) {
    root.innerHTML = `
      <div id="leaflet" class="leaflet-host" role="application" aria-label="Route map"></div>
      <div class="map-fab">
        <button type="button" class="fab" id="locateBtn" aria-label="Show my location">${ICON.locate}</button>
        <button type="button" class="fab" id="fitBtn" aria-label="Fit whole route">${ICON.map}</button>
      </div>
      <div class="map-msg" id="mapMsg" role="status" hidden></div>`;
    loadLeaflet().then((lib) => {
      L = lib;
      initMap(root, ctx);
      drawData(ctx);
    }).catch((err) => {
      const m = $('#mapMsg', root);
      m.hidden = false;
      m.innerHTML = `<b>Map unavailable</b><span>${esc(err.message)}${navigator.onLine ? '' : ' — you are offline'}.</span><button class="btn" type="button" id="mapRetry">Retry</button>`;
      $('#mapRetry', root)?.addEventListener('click', () => { root.innerHTML = ''; render(root, ctx); });
    });
    return;
  }
  drawData(ctx);
}

export function onShow(ctx) {
  // Leaflet measures its container, which was display:none while the tab was hidden.
  // Re-measure once layout has settled (two frames + after the view-in animation), then fit once.
  if (ctx) lastCtx = ctx;
  if (!map) return;
  requestAnimationFrame(() => requestAnimationFrame(resize));
  setTimeout(resize, 320);
}

function resize() {
  if (!map) return;
  const el = map.getContainer();
  if (!el.offsetWidth || !el.offsetHeight) return; // tab hidden
  map.invalidateSize({ pan: false });
  if (!fitted && lastCtx && fit(lastCtx)) fitted = true;
}

function initMap(root, ctx) {
  lastCtx = ctx;
  const host = $('#leaflet', root);
  map = L.map(host, { zoomControl: false, center: [47.3, -115.4], zoom: 8 });
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Panes: labels just above base tiles (200), routes above overlays (400), markers (600) on top.
  map.createPane('labels').style.zIndex = 250;
  map.getPane('labels').style.pointerEvents = 'none';
  map.createPane('routes').style.zIndex = 450;

  // Keyless basemaps — CARTO now serves "API KEY REQUIRED" watermark tiles.
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const esriAttr = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>';
  const dark = L.layerGroup([
    L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: `${esriAttr} — Esri, HERE, Garmin, © OpenStreetMap contributors` }),
    L.tileLayer(`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: 'labels' }),
  ]);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const imagery = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 18, attribution: `${esriAttr} — Esri, Maxar, Earthstar Geographics`,
  });
  dark.addTo(map);

  groups = {
    main: L.layerGroup().addTo(map),
    alts: L.layerGroup().addTo(map),
    wx: L.layerGroup().addTo(map),
    cams: L.layerGroup().addTo(map),
    events: L.layerGroup().addTo(map),
    rwis: L.layerGroup().addTo(map),
    facilities: L.layerGroup().addTo(map),
    pois: L.layerGroup().addTo(map),
  };
  L.control.layers({
    'Dark (Esri)': dark,
    'Streets (OSM)': osm,
    'Satellite (Esri)': imagery,
  }, {
    'I-90 route': groups.main,
    'Alternate routes': groups.alts,
    'Checkpoint weather': groups.wx,
    'Cameras': groups.cams,
    'Road events': groups.events,
    'Road sensors (RWIS)': groups.rwis,
    'Rest areas / truck parking': groups.facilities,
    'Tow POIs (approx.)': groups.pois,
  }, { position: 'topleft', collapsed: true }).addTo(map);

  $('#locateBtn', root).addEventListener('click', () => {
    map.locate({ setView: true, maxZoom: 11, enableHighAccuracy: true, timeout: 15000 });
  });
  $('#fitBtn', root).addEventListener('click', () => fit(lastCtx || ctx));
  map.on('locationfound', (e) => {
    if (meMarker) meMarker.remove();
    meMarker = L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 })
      .addTo(map).bindPopup('You are here');
  });
  map.on('locationerror', (e) => flash(root, `Location unavailable: ${e.message}`));

  // Zoom-dependent declutter: compact weather dots when zoomed out, re-cluster cams.
  const compact = () => host.classList.toggle('wx-compact', map.getZoom() < WX_FULL_ZOOM);
  map.on('zoomend', () => { compact(); drawCams(); });
  compact();

  // Keep Leaflet's size in sync with the container: tab switches, rotation, banners coming and going.
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  // Cam popups: load the frame only when the popup opens (fresh each time).
  map.on('popupopen', (e) => {
    const el = e.popup.getElement();
    const img = el?.querySelector('img[data-src]');
    if (img) img.src = bust(img.dataset.src);
    // onclick (not addEventListener) so re-opening a popup never stacks handlers.
    // Cluster pick-lists have several buttons; single-cam popups have one.
    el?.querySelectorAll('[data-open-cam]').forEach((btn) => {
      btn.onclick = () => openViewer(arr((lastCtx || ctx).data?.cams), Number(btn.dataset.openCam), 0);
    });
  });
}

function flash(root, msg) {
  const m = $('#mapMsg', root);
  if (!m) return;
  m.hidden = false; m.innerHTML = `<span>${esc(msg)}</span>`;
  setTimeout(() => { m.hidden = true; }, 4000);
}

// Fit the I-90 route, leaving room for controls (layers/zoom on top, FABs bottom-right).
// Returns false when there's nothing to fit or the container has no size yet.
function fit(ctx) {
  const c = arr(ctx.data?.routes?.main?.coords).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  const el = map.getContainer();
  if (c.length < 2 || !el.offsetWidth || !el.offsetHeight) return false;
  map.invalidateSize({ pan: false });
  map.fitBounds(L.latLngBounds(c), { paddingTopLeft: [24, 64], paddingBottomRight: [72, 32], maxZoom: 12 });
  return true;
}

const icon = (cls, html = '', size = 30) => L.divIcon({ className: `mk ${cls}`, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
const valid = (o) => o && isNum(o.lat) && isNum(o.lon);

function drawData(ctx) {
  if (!map || !groups) return;
  const d = ctx.data;
  const now = ctx.now;
  Object.values(groups).forEach((g) => g.clearLayers());

  // Routes — alternates first so the main route always paints over them; all in the 'routes' pane.
  const routes = d?.routes || {};
  const entries = Object.entries(routes).sort(([a], [b]) => (a === 'main') - (b === 'main'));
  for (const [key, r] of entries) {
    const coords = arr(r?.coords).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
    if (coords.length < 2) continue;
    const tip = `${esc(r.name)} · ${r.miles ?? '—'} mi`;
    if (key === 'main') {
      L.polyline(coords, { pane: 'routes', color: '#020617', weight: 13, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(groups.main);
      L.polyline(coords, { pane: 'routes', color: '#38a3ff', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' }).bindTooltip(tip, { sticky: true }).addTo(groups.main);
    } else {
      L.polyline(coords, { pane: 'routes', color: '#020617', weight: 7, opacity: 0.55, interactive: false }).addTo(groups.alts);
      L.polyline(coords, { pane: 'routes', color: '#a3adbd', weight: 4, opacity: 0.9, dashArray: '8 10' }).bindTooltip(tip, { sticky: true }).addTo(groups.alts);
    }
  }

  // Checkpoint weather bubbles
  for (const p of arr(d?.points).filter(valid)) {
    const h = hourlyAt(p, now);
    const g = gustAt(p, now);
    const t = h?.temp;
    const cls = `mk-wx${isNum(t) && t <= 32 ? ' cold' : ''}${isPassName(p.name) ? ' pass' : ''}`;
    L.marker([p.lat, p.lon], { icon: icon(cls, `<span>${isNum(t) ? `${t}°` : '—'}</span>`, 34), zIndexOffset: 500, keyboard: true, title: `${p.name}${isNum(t) ? ` ${t}°F` : ''}` })
      .bindPopup(`<b>${esc(p.name)}</b><br>${esc(h?.short || '')}<br>Wind ${esc(h?.dir || '')} ${h?.wind ?? '—'} mph${isNum(g) ? ` · gusts ${g}` : ''}<br><span class="muted">mile ${p.mi ?? '—'} · ${p.elev ?? '—'} ft</span>`)
      .addTo(groups.wx);
  }

  // Cameras: collected here, drawn (and re-clustered on zoom) by drawCams().
  lastCtx = ctx;
  camList = [];
  arr(d?.cams).forEach((c, i) => {
    if (!valid(c)) return;
    const v = arr(c.views).find((x) => safeUrl(x?.img));
    if (v) camList.push({ c, i, v });
  });
  drawCams();

  // Events (signs only with a real message)
  for (const e of visibleEvents(d).filter(valid)) {
    const sign = e.kind === 'sign' ? signMessage(e) : null;
    const text = sign ? `Overhead sign says: “${sign.msg}”` : eventText(e);
    L.marker([e.lat, e.lon], { icon: icon(`mk-ev ev-${e.kind}`, '', 20), title: KIND_LABEL[e.kind] || e.kind })
      .bindPopup(`<b>${esc(KIND_LABEL[e.kind] || e.title || 'Event')}</b> <span class="muted">${esc(e.src || '')}</span><p>${esc(text.slice(0, 400))}</p>`, { maxWidth: 280 })
      .addTo(groups.events);
  }

  // Rest areas / truck parking
  for (const f of arr(d?.facilities).filter(valid)) {
    L.marker([f.lat, f.lon], { icon: icon('mk-fac', 'P', 24), title: f.name })
      .bindPopup(`<b>${esc(f.name)}</b><br><span class="muted">${esc(f.type || '')}${f.dir ? ` · ${esc(f.dir)}B` : ''}</span>${f.note ? `<p>${esc(f.note.slice(0, 300))}</p>` : ''}`, { maxWidth: 280 })
      .addTo(groups.facilities);
  }

  // RWIS: MDT + ITD
  for (const r of arr(d?.rwis).filter(valid)) {
    const s = arr(r.surface).find((x) => x && (x.cond || isNum(x.temp)));
    L.marker([r.lat, r.lon], { icon: icon('mk-rwis', `${ICON.thermo}<b>${isNum(r.air) ? `${r.air}°` : '—'}</b>`, 30), title: r.name })
      .bindPopup(`<b>${esc(r.name)}</b> <span class="muted">MDT RWIS · ${esc(r.where || '')}</span><br>
        Air ${isNum(r.air) ? `${r.air}°F` : '—'} · Pavement ${isNum(s?.temp) ? `${s.temp}°F` : '—'}${s?.cond ? ` · ${esc(s.cond)}` : ''}<br>
        ${esc(r.precip || 'No precip data')} · Wind ${esc(r.wdir || '')} ${r.wind ?? '—'} G${r.gust ?? '—'}<br><span class="muted">${esc(ago(r.obs, now))}</span>`)
      .addTo(groups.rwis);
  }
  for (const raw of arr(d?.id_wx).filter(valid)) {
    const w = parseIdWx(raw, d?.generated);
    L.marker([w.lat, w.lon], { icon: icon('mk-rwis id', `${ICON.thermo}<b>${isNum(w.air) ? `${Math.round(w.air)}°` : '—'}</b>`, 30), title: w.station })
      .bindPopup(`<b>${esc(w.station)}</b> <span class="muted">ITD RWIS</span><br>
        Air ${isNum(w.air) ? `${Math.round(w.air)}°F` : '—'} · Pavement ${isNum(w.surfTemp) ? `${Math.round(w.surfTemp)}°F` : '—'}<br>
        Surface ${esc(w.status || '—')} · Friction ${esc(w.friction || '—')}<br>
        Wind ${w.wind ?? '—'} G${w.gust ?? '—'} mph · Vis ${w.vis ?? '—'} mi<br><span class="muted">${w.updatedAt ? `${esc(fmtTime(w.updatedAt))} MT · ${esc(ago(w.updatedAt, now))}` : esc(w.updated || '')}</span>`)
      .addTo(groups.rwis);
  }

  // Static tow POIs — approximate
  for (const p of POIS) {
    const m = POI_META[p.kind] || POI_META.info;
    L.marker([p.lat, p.lon], { icon: icon(`mk-poi poi-${p.kind}`, esc(m.glyph), 26), title: p.name })
      .bindPopup(`<b>${esc(p.name)}</b><br><span class="muted">${esc(m.label)} · approximate — verify</span><p>${esc(p.note)}</p>`, { maxWidth: 260 })
      .addTo(groups.pois);
  }

  if (!fitted && fit(ctx)) fitted = true;
}

function camPopup({ c, i, v }, now) {
  return `<div class="pop-cam"><b>${esc(camName(c.name))}</b>
    <img data-src="${esc(safeUrl(v.img))}" alt="${esc(viewName(v, c))}" width="240" height="135">
    <span class="muted">${esc(c.src || '')}${v.t ? ` · ${esc(ago(v.t, now))}` : ''}</span>
    <button type="button" class="btn btn-sm" data-open-cam="${i}">Full screen</button></div>`;
}

// Greedy screen-space clustering, recomputed on every zoom. A cluster shows its count; tapping
// zooms in to its cams, or (near max zoom / cams at the same spot) opens a pick-list popup.
function drawCams() {
  if (!map || !groups) return;
  groups.cams.clearLayers();
  const now = lastCtx?.now;
  const z = map.getZoom();
  const clusters = [];
  for (const item of camList) {
    const pt = map.project([item.c.lat, item.c.lon], z);
    const hit = clusters.find((k) => k.pt.distanceTo(pt) < CAM_CLUSTER_PX);
    if (hit) hit.items.push(item); else clusters.push({ pt, items: [item] });
  }
  for (const k of clusters) {
    if (k.items.length === 1) {
      const it = k.items[0];
      L.marker([it.c.lat, it.c.lon], { icon: icon(`mk-cam${it.c.corr === 'main' ? '' : ' alt'}`, ICON.cam, 28), title: camName(it.c.name) })
        .bindPopup(camPopup(it, now), { maxWidth: 260, minWidth: 240 })
        .addTo(groups.cams);
      continue;
    }
    const n = k.items.length;
    const bounds = L.latLngBounds(k.items.map((it) => [it.c.lat, it.c.lon]));
    const m = L.marker(bounds.getCenter(), { icon: icon('mk-cam mk-cluster', `${ICON.cam}<b>${n}</b>`, 40), title: `${n} cameras` });
    const sameSpot = map.distance(bounds.getNorthEast(), bounds.getSouthWest()) < 30;
    if (sameSpot || z >= map.getMaxZoom() - 1) {
      m.bindPopup(`<b>${n} cameras</b><ul class="pop-list">${k.items.map((it) => `
        <li><button type="button" class="btn btn-sm" data-open-cam="${it.i}">${esc(camName(it.c.name))}</button></li>`).join('')}</ul>`, { maxWidth: 280 });
    } else {
      m.on('click', () => map.fitBounds(bounds.pad(0.5), { maxZoom: Math.min(z + 3, map.getMaxZoom()) }));
    }
    m.addTo(groups.cams);
  }
}
