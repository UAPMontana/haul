// CHECKLIST tab — pre-trip towing checklist persisted in localStorage.
import { esc, fmtTime, relDay, load, save, haptic, $, TZ_MT } from '../util.js';
import { CHECKLIST } from '../consts.js';
import { ICON } from '../icons.js';

const KEY = 'haul.check';
const TOTAL = CHECKLIST.reduce((n, g) => n + g.items.length, 0);

const getState = () => {
  const s = load(KEY, null);
  return s && typeof s === 'object' && s.items && typeof s.items === 'object' ? s : { items: {}, reset: null };
};

export function render(root) {
  const st = getState();
  root.innerHTML = `
    <article class="card check-head">
      <div class="ring-wrap">${ring(st)}</div>
      <div class="check-meta">
        <h1 class="h1">Pre-trip check</h1>
        <p class="muted" id="checkSub">${subline(st)}</p>
        <button type="button" class="btn btn-danger" id="resetBtn">${ICON.refresh}<span>Reset for new trip</span></button>
      </div>
    </article>
    ${CHECKLIST.map((g, gi) => `
      <section class="card check-group" aria-labelledby="cg${gi}">
        <header class="card-h"><h2 id="cg${gi}">${esc(g.group)}</h2><span class="pill" data-gcount="${gi}">${groupCount(g, st)}</span></header>
        <ul class="check-list">${g.items.map(([id, label]) => item(id, label, st)).join('')}</ul>
      </section>`).join('')}
    <p class="foot muted">Saved on this phone. Tire PSI: use the door placard for the truck and the max cold PSI on the trailer sidewall.</p>`;

  root.onclick = (e) => {
    const b = e.target.closest('.check-item');
    if (b) { toggle(root, b.dataset.id); return; }
    if (e.target.closest('#resetBtn')) {
      if (!confirm('Clear every check for a new trip?')) return;
      save(KEY, { items: {}, reset: Date.now() });
      haptic(20);
      render(root);
    }
  };
}

function toggle(root, id) {
  const st = getState();
  if (st.items[id]) delete st.items[id]; else st.items[id] = Date.now();
  save(KEY, st);
  haptic(st.items[id] ? 10 : 4);
  // Update in place (keeps scroll position and avoids flashing).
  const btn = $(`.check-item[data-id="${CSS.escape(id)}"]`, root);
  if (btn) btn.outerHTML = item(id, btn.dataset.label, st);
  CHECKLIST.forEach((g, gi) => { const p = $(`[data-gcount="${gi}"]`, root); if (p) p.textContent = groupCount(g, st); });
  $('.ring-wrap', root).innerHTML = ring(st);
  $('#checkSub', root).innerHTML = subline(st);
}

function item(id, label, st) {
  const ts = st.items[id];
  return `<li><button type="button" class="check-item${ts ? ' done' : ''}" data-id="${esc(id)}" data-label="${esc(label)}" role="checkbox" aria-checked="${ts ? 'true' : 'false'}">
    <span class="cbox" aria-hidden="true">${ts ? '<svg viewBox="0 0 24 24" width="22" height="22"><path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span>
    <span class="clabel">${esc(label)}</span>
    ${ts ? `<span class="cts">${esc(relDay(ts, TZ_MT))} ${esc(fmtTime(ts))}</span>` : ''}
  </button></li>`;
}

const doneCount = (st) => CHECKLIST.reduce((n, g) => n + g.items.filter(([id]) => st.items[id]).length, 0);
const groupCount = (g, st) => `${g.items.filter(([id]) => st.items[id]).length}/${g.items.length}`;

function subline(st) {
  const n = doneCount(st);
  const parts = [n === TOTAL ? '<b class="good">All set — drive safe.</b>' : `${TOTAL - n} item${TOTAL - n === 1 ? '' : 's'} left`];
  if (st.reset) parts.push(`reset ${esc(relDay(st.reset, TZ_MT))} ${esc(fmtTime(st.reset))}`);
  return parts.join(' · ');
}

function ring(st) {
  const n = doneCount(st);
  const pct = TOTAL ? n / TOTAL : 0;
  const r = 42; const c = 2 * Math.PI * r;
  const color = pct === 1 ? 'var(--go)' : pct >= 0.5 ? 'var(--accent)' : 'var(--caution)';
  return `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${n} of ${TOTAL} checks done">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)" class="ring-arc"/>
    <text x="50" y="49" text-anchor="middle" class="ring-n">${n}</text>
    <text x="50" y="67" text-anchor="middle" class="ring-of">of ${TOTAL}</text>
  </svg>`;
}
