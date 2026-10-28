// WEATHER tab — alerts, sun/twilight, forecaster discussions, per-checkpoint forecast + wind chart.
import {
  esc, arr, isNum, toDate, fmtTime, fmtDate, fmtWeekday, ago, safeUrl, $$, TZ_MT, hourIn, relDay,
} from '../util.js';
import {
  GUST, gustAt, upcomingPeriods, isPassName, zoneForLon, zoneLabel, hourlyAt, maxGustWindow,
} from '../derive.js';
import { ICON } from '../icons.js';

const ui = { open: new Set(['Lookout Pass']) };

export function skeleton(root) { root.innerHTML = `${'<div class="sk sk-card"></div>'.repeat(4)}`; }

export function render(root, ctx) {
  const d = ctx.data;
  const now = ctx.now;
  root.innerHTML = [
    alertsCard(d, now),
    sunCard(d, now),
    afdCard(d),
    `<h2 class="group-h">Checkpoints · I-90 westbound</h2>`,
    arr(d?.points).map((p) => pointCard(p, now)).join('') || '<div class="card empty"><p>No forecast points in this update.</p></div>',
  ].join('');
  $$('details[data-pt]', root).forEach((det) => det.addEventListener('toggle', () => {
    if (det.open) ui.open.add(det.dataset.pt); else ui.open.delete(det.dataset.pt);
  }));
}

/* ------------------------------------------------------------------ alerts */
function alertsCard(d, now) {
  const alerts = arr(d?.alerts).filter((a) => { const e = toDate(a?.ends); return !e || e > now; });
  if (!alerts.length) {
    return `<article class="card ok-card"><header class="card-h"><h2>${ICON.bell}NWS alerts</h2><span class="pill pill-go">none</span></header>
      <p class="good">No active watches, warnings or advisories along the route.</p></article>`;
  }
  return `<article class="card"><header class="card-h"><h2>${ICON.bell}NWS alerts</h2><span class="pill pill-wait">${alerts.length}</span></header>
    ${alerts.map((a) => alertItem(a, now)).join('')}</article>`;
}

export function alertItem(a, now = new Date()) {
  const sev = /extreme|severe/i.test(a?.severity || '') ? 'wait' : 'caution';
  const ends = toDate(a?.ends);
  const onset = toDate(a?.onset);
  const url = safeUrl(a?.url);
  return `
    <details class="alert alert-${sev}">
      <summary>
        <span class="alert-ev">${esc(a?.event || 'Alert')}</span>
        <span class="alert-time muted">${onset && onset > now ? `from ${esc(relDay(onset, TZ_MT, now))} ${esc(fmtTime(onset))} · ` : ''}${ends ? `until ${esc(relDay(ends, TZ_MT, now))} ${esc(fmtTime(ends))} MT` : ''}</span>
        ${a?.headline ? `<span class="alert-hl">${esc(a.headline)}</span>` : ''}
      </summary>
      <div class="alert-body">
        ${arr(a?.areas).length ? `<p class="muted"><b>Areas:</b> ${esc(arr(a.areas).join('; '))}</p>` : ''}
        ${a?.desc ? `<p class="pre">${esc(a.desc)}</p>` : ''}
        ${a?.instr ? `<p class="pre"><b>What to do:</b> ${esc(a.instr)}</p>` : ''}
        ${url ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener">Full alert ${ICON.ext}</a>` : ''}
      </div>
    </details>`;
}

/* --------------------------------------------------------------------- sun */
function sunCard(d, now) {
  const sun = d?.sun;
  const days = [sun?.today, sun?.tomorrow].filter((x) => x && toDate(x.sunrise));
  if (!days.length) return '';
  // The feed's "today" is the generator's date; label each by its real MT date instead.
  const cols = days.map((s) => {
    const sr = toDate(s.sunrise);
    const label = relDay(sr, TZ_MT, now);
    return `
      <div class="sun-day">
        <h3 class="h3">${esc(label === 'Today' || label === 'Tomorrow' ? label : fmtDate(sr))}</h3>
        <dl class="sun-dl">
          <div><dt>First light</dt><dd>${esc(fmtTime(s.civil_twilight_begin))}</dd></div>
          <div><dt>Sunrise</dt><dd>${esc(fmtTime(s.sunrise))}</dd></div>
          <div><dt>Sunset</dt><dd>${esc(fmtTime(s.sunset))}</dd></div>
          <div><dt>Last light</dt><dd>${esc(fmtTime(s.civil_twilight_end))}</dd></div>
        </dl>
      </div>`;
  }).join('');
  return `<article class="card"><header class="card-h"><h2>${ICON.sun}Daylight</h2><span class="muted small">times MT · Idaho is 1 h earlier</span></header>
    <div class="sun-grid">${cols}</div>
    <p class="muted small">Deer and elk move at dawn and dusk — plan to be past Alberton Gorge and St. Regis in daylight.</p></article>`;
}

/* --------------------------------------------------------------------- AFD */
function afdCard(d) {
  const afd = d?.afd || {};
  const offices = [['MSO', 'NWS Missoula'], ['OTX', 'NWS Spokane']].filter(([k]) => afd[k]?.text);
  if (!offices.length) return '';
  return `<article class="card"><header class="card-h"><h2>${ICON.info}Forecaster discussion</h2></header>
    ${offices.map(([k, name]) => {
    const a = afd[k];
    const text = String(a.text).replace(/^KEY MESSAGES:\s*/i, '').trim();
    // Split "- msg - msg" bullets when the text uses them.
    const bullets = text.split(/\s+-\s+|^-\s+/).map((s) => s.trim()).filter(Boolean);
    const body = bullets.length > 1 ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : `<p>${esc(text)}</p>`;
    return `<details class="afd"${k === 'MSO' ? ' open' : ''}>
        <summary><b>${esc(name)}</b> <span class="muted">${a.issued ? `issued ${esc(fmtTime(a.issued))} MT · ${esc(ago(a.issued))}` : ''}</span></summary>
        <div class="afd-body">${body}</div></details>`;
  }).join('')}
  </article>`;
}

/* ------------------------------------------------------------- checkpoints */
function pointCard(p, now) {
  const tz = zoneForLon(p.lon);
  const h = hourlyAt(p, now);
  const g24 = maxGustWindow(p, now, 24);
  const pers = upcomingPeriods(p, now).slice(0, 8);
  const pass = isPassName(p.name);
  const gcls = isNum(g24) ? (g24 >= GUST.DANGER ? 'wait' : g24 >= GUST.CAUTION ? 'caution' : 'go') : '';
  return `
  <details class="card acc${pass ? ' pass' : ''}" data-pt="${esc(p.name)}"${ui.open.has(p.name) ? ' open' : ''}>
    <summary class="acc-sum">
      <span class="acc-name">${pass ? ICON.mountain : ''}<b>${esc(p.name)}</b><small>mile ${isNum(p.mi) ? Math.round(p.mi) : '—'} · ${isNum(p.elev) ? p.elev.toLocaleString() : '—'} ft · ${zoneLabel(tz)}</small></span>
      <span class="acc-now">
        <span class="acc-temp${isNum(h?.temp) && h.temp <= 32 ? ' cold' : ''}">${isNum(h?.temp) ? `${h.temp}°` : '—'}</span>
        ${isNum(g24) ? `<span class="pill pill-${gcls}" title="Max gust next 24 h">G${g24}</span>` : ''}
      </span>
    </summary>
    <div class="acc-body">
      <p class="acc-short">${esc(h?.short || '')}</p>
      ${pers.length ? `<div class="periods no-ptr" role="list">${pers.map((x) => period(x)).join('')}</div>` : '<p class="muted">No forecast periods.</p>'}
      <h3 class="h3">Wind &amp; gusts · next 24 h <span class="muted">(${zoneLabel(tz)})</span></h3>
      ${windChart(p, now, tz)}
    </div>
  </details>`;
}

function period(x) {
  const icon = safeUrl(x.icon);
  return `<div class="period${x.isDay === false ? ' night' : ''}" role="listitem">
    <span class="per-name">${esc(x.name)}</span>
    ${icon ? `<img src="${esc(icon)}" alt="" width="56" height="56" loading="lazy">` : '<span class="per-noimg"></span>'}
    <span class="per-temp">${isNum(x.temp) ? `${x.temp}°` : '—'}</span>
    <span class="per-short">${esc(x.short || '')}</span>
    <span class="per-wind">${esc(x.dir || '')} ${esc(x.wind || '')}</span>
    ${isNum(x.pop) && x.pop > 0 ? `<span class="per-pop">${x.pop}%</span>` : ''}
  </div>`;
}

/** 24 h bar chart: sustained wind (solid) over gust (tinted), with 25/35/45 mph threshold lines. */
function windChart(p, now, tz) {
  const start = new Date(now); start.setMinutes(0, 0, 0);
  const hrs = arr(p.hourly).map((h) => ({ ...h, d: toDate(h.t) })).filter((h) => h.d);
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const t = new Date(start.getTime() + i * 36e5);
    const h = hrs.find((x) => Math.abs(x.d - t) < 30 * 6e4);
    rows.push({ t, wind: isNum(h?.wind) ? h.wind : null, gust: gustAt(p, t) });
  }
  if (!rows.some((r) => isNum(r.wind) || isNum(r.gust))) return '<p class="muted">No wind data for the next 24 h.</p>';

  const W = 340; const H = 190; const padL = 30; const padR = 8; const padT = 10; const padB = 26;
  const maxV = Math.max(50, ...rows.map((r) => Math.max(r.wind ?? 0, r.gust ?? 0))) + 2;
  const cw = (W - padL - padR) / rows.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxV);
  const col = (v) => (v >= GUST.NO_TOW ? 'var(--wait)' : v >= GUST.DANGER ? 'var(--danger)' : v >= GUST.CAUTION ? 'var(--caution)' : 'var(--go)');

  const bars = rows.map((r, i) => {
    const x = padL + i * cw;
    const g = isNum(r.gust) ? `<rect x="${(x + 1).toFixed(1)}" y="${y(r.gust).toFixed(1)}" width="${(cw - 2).toFixed(1)}" height="${(y(0) - y(r.gust)).toFixed(1)}" rx="2" fill="${col(r.gust)}" opacity=".35"/>` : '';
    const w = isNum(r.wind) ? `<rect x="${(x + cw * 0.22).toFixed(1)}" y="${y(r.wind).toFixed(1)}" width="${(cw * 0.56).toFixed(1)}" height="${(y(0) - y(r.wind)).toFixed(1)}" rx="1.5" fill="${col(r.wind)}"/>` : '';
    const hr = hourIn(r.t, tz);
    const lbl = i % 3 === 0 ? `<text x="${(x + cw / 2).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${hr === 0 ? esc(fmtWeekday(r.t, tz)) : `${hr % 12 || 12}${hr < 12 ? 'a' : 'p'}`}</text>` : '';
    return g + w + lbl;
  }).join('');
  const line = (v, c, tag) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${padL - 4}" y="${(y(v) + 4).toFixed(1)}" class="ax" text-anchor="end" fill="${c}">${tag}</text>`;
  const summary = rows.filter((r) => isNum(r.gust)).reduce((m, r) => Math.max(m, r.gust), 0);
  return `
    <figure class="chart no-ptr">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} wind next 24 hours, max gust ${summary} mph">
        <line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" />
        ${line(GUST.CAUTION, 'var(--caution)', '25')}
        ${line(GUST.DANGER, 'var(--danger)', '35')}
        ${line(GUST.NO_TOW, 'var(--wait)', '45')}
        ${bars}
      </svg>
      <figcaption class="chart-legend">
        <span><i class="lg-bar"></i>sustained</span><span><i class="lg-bar faint"></i>gust</span>
        <span><i class="lg-line c"></i>25 caution</span>
        <span><i class="lg-line d"></i>35 dangerous for high-profile trailer</span>
        <span><i class="lg-line w"></i>45 do not tow</span>
      </figcaption>
    </figure>`;
}
