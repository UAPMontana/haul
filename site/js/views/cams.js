// CAMS tab — route-ordered camera feed with filters, lazy loading and 60 s refresh.
import { esc, arr, isNum, ago, safeUrl, nf, $$, load, save } from '../util.js';
import { camName, viewName, camElev, isPassName, nearestPointIdx } from '../derive.js';
import { watchCams, unwatchCams } from '../camimg.js';
import { openViewer } from '../viewer.js';
import { ICON } from '../icons.js';

const CORR_LABEL = { main: 'I-90 · Lookout Pass route', alt_12: 'US-12 Lolo Pass alternate', alt_200: 'MT-200 / Sandpoint alternate' };
const ui = load('haul.camFilter', { route: 'main', passes: false });

export function skeleton(root) {
  root.innerHTML = `<div class="sk sk-chips"></div>${'<div class="sk sk-cam"></div>'.repeat(3)}`;
}

function filtered(cams) {
  return cams.map((c, i) => ({ c, i })).filter(({ c }) => {
    if (!arr(c?.views).some((v) => safeUrl(v?.img))) return false;
    if (ui.route === 'main' && c.corr !== 'main') return false;
    if (ui.route === 'alt' && c.corr === 'main') return false;
    if (ui.passes && !(isPassName(c.name) || /summit/i.test(c.name || ''))) return false;
    return true;
  });
}

export function render(root, ctx) {
  const d = ctx.data;
  const cams = arr(d?.cams);
  const pts = arr(d?.points);
  const list = filtered(cams);
  const now = ctx.now;
  unwatchCams(root);

  const chip = (key, val, label) => `<button type="button" class="chip seg${ui[key] === val ? ' on' : ''}" data-f="${key}" data-v="${val}" aria-pressed="${ui[key] === val}">${label}</button>`;
  let lastCorr = null;
  const cards = list.map(({ c, i }) => {
    const views = arr(c.views).filter((v) => safeUrl(v?.img));
    const v0 = views[0];
    let elev = camElev(c);
    if (!elev && c.corr === 'main' && isNum(c.mi)) {
      const p = pts[nearestPointIdx(pts, c.mi)];
      if (p && Math.abs(p.mi - c.mi) <= 5) elev = p.elev;
    }
    const pass = isPassName(c.name) || /summit/i.test(c.name || '');
    const head = [isNum(c.mi) ? `MP ${Math.round(c.mi)}` : '', camName(c.name), elev ? `${nf(elev)} ft` : ''].filter(Boolean).join(' · ');
    const group = ui.route === 'all' && c.corr !== lastCorr ? `<h2 class="group-h">${esc(CORR_LABEL[c.corr] || c.corr || 'Other')}</h2>` : '';
    lastCorr = c.corr;
    return `${group}
      <article class="cam-card${pass ? ' pass' : ''}">
        <header class="cam-h">
          <span class="cam-chip">${pass ? ICON.mountain : ''}${esc(head)}</span>
          <span class="cam-src src-${c.src === 'MDT RWIS' ? 'mt' : 'id'}">${esc(c.src === 'MDT RWIS' ? 'MDT' : c.src === 'Idaho 511' ? 'ITD 511' : (c.src || ''))}</span>
        </header>
        <button type="button" class="cam-frame" data-cam="${i}" aria-label="Open ${esc(camName(c.name))} full screen">
          <img class="camimg" data-src="${esc(safeUrl(v0.img))}" alt="${esc(camName(c.name))} — ${esc(viewName(v0, c))}" width="640" height="360">
          <span class="cam-err-msg">Camera unavailable</span>
          <span class="cam-badge">${v0.t ? esc(ago(v0.t, now)) : 'live'}${views.length > 1 ? ` · ${views.length} views` : ''}</span>
        </button>
        <p class="cam-cap muted">${esc(viewName(v0, c))}</p>
      </article>`;
  }).join('');

  root.innerHTML = `
    <div class="filters" role="toolbar" aria-label="Camera filters">
      <div class="seg-group" role="group" aria-label="Route">
        ${chip('route', 'main', 'I-90')}${chip('route', 'alt', 'Alternates')}${chip('route', 'all', 'All')}
      </div>
      <button type="button" class="chip seg${ui.passes ? ' on' : ''}" data-f="passes" aria-pressed="${ui.passes}">${ICON.mountain}Passes</button>
    </div>
    <p class="muted small cams-note">${list.length} camera${list.length === 1 ? '' : 's'} in route order · refreshes every 60 s · tap for full screen, swipe between cams</p>
    <div class="cam-list">${cards || `<div class="card empty"><p>No cameras match these filters.</p></div>`}</div>`;

  $$('[data-f]', root).forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.f;
    if (f === 'passes') ui.passes = !ui.passes; else ui.route = b.dataset.v;
    save('haul.camFilter', ui);
    render(root, ctx);
  }));
  if (!root.dataset.wired) {
    root.dataset.wired = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cam]');
      if (!b) return;
      // Swipe through the currently filtered cams in the viewer.
      const all = arr(ctx.data?.cams);
      const sub = filtered(all);
      const pos = sub.findIndex(({ i }) => i === Number(b.dataset.cam));
      openViewer(sub.map(({ c }) => c), Math.max(0, pos), 0);
    });
  }
  watchCams(root);
}
