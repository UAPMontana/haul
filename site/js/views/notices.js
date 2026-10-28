// NOTICES — static route knowledge + live restrictions, signs and NWS alerts.
import { esc, arr, isNum, toDate } from '../util.js';
import { visibleEvents, dedupeEvents, eventText, signMessage } from '../derive.js';
import { ICON } from '../icons.js';
import { NOTICES } from '../consts.js';
import { alertItem } from './weather.js';

export function skeleton(root) { root.innerHTML = `${'<div class="sk sk-card"></div>'.repeat(3)}`; }

export function render(root, ctx) {
  const d = ctx.data;
  const now = ctx.now;
  const alerts = arr(d?.alerts).filter((a) => { const e = toDate(a?.ends); return !e || e > now; });
  const ev = visibleEvents(d);
  const restr = dedupeEvents(ev.filter((e) => e.kind === 'restriction'))
    .sort((a, b) => (a.corr === 'main' ? 0 : 1) - (b.corr === 'main' ? 0 : 1) || (a.mi ?? 0) - (b.mi ?? 0));
  const signs = ev.filter((e) => e.kind === 'sign');

  root.innerHTML = `
    <div class="sub-head">
      <button type="button" class="icon-btn" data-goto="go" aria-label="Back to Go">${ICON.back}</button>
      <h1 class="h1">Notices</h1>
    </div>

    ${alerts.length ? `<article class="card"><header class="card-h"><h2>${ICON.bell}NWS alerts</h2><span class="pill pill-wait">${alerts.length}</span></header>${alerts.map((a) => alertItem(a, now)).join('')}</article>` : ''}

    ${signs.length ? `<article class="card"><header class="card-h"><h2>${ICON.sign}Overhead signs</h2></header>
      ${signs.map((s) => { const m = signMessage(s); return `<div class="dms"><span class="dms-msg">${esc(m.msg)}</span><span class="muted small">${esc(m.where)}${isNum(s.mi) ? ` · mile ${Math.round(s.mi)}` : ''}</span></div>`; }).join('')}</article>` : ''}

    <article class="card"><header class="card-h"><h2>${ICON.truck}Live restrictions</h2><span class="pill">${restr.length}</span></header>
      ${restr.length ? restr.map((e) => `
        <div class="notice-ev">
          <span class="tag ${e.corr === 'main' ? 'tag-main' : 'tag-alt'}">${e.corr === 'main' ? 'I-90' : e.corr === 'alt_12' ? 'US-12 alt' : 'MT-200 alt'}</span>
          <p>${esc(eventText(e))}</p>
        </div>`).join('') : '<p class="good">No posted restrictions.</p>'}
    </article>

    ${NOTICES.map((n) => `
      <article class="card notice notice-${n.tone}">
        <h2 class="notice-t">${n.tone === 'wait' ? ICON.mountain : n.tone === 'caution' ? ICON.alert : ICON.info}<span>${esc(n.title)}</span></h2>
        <p>${esc(n.body)}</p>
      </article>`).join('')}
    <p class="foot muted">General guidance — always follow posted signs, chain laws and current 511 conditions.</p>`;
}
