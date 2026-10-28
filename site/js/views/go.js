// GO tab — the hero dashboard.
import {
  esc, arr, isNum, toDate, fmtTime, relDay, ago, fmtDur, nf, safeUrl, $, $$, TZ_MT, TZ_PT,
  hourIn, fmtWeekday, haptic, cardinal,
} from '../util.js';
import {
  LEVEL_CLASS, GUST, hourlyAt, gustAt, upcomingPeriods, parseIdWx, signMessage, eventText, visibleEvents,
  dedupeEvents, metarView, futureBest, carMinutes, scoreBad, scoreLevel, isPassName, nearestPointIdx, etaAt,
  zoneForLon, zoneLabel, findPoint, camName, frictionLevel,
} from '../derive.js';
import { ICON, KIND_ICON, KIND_LABEL } from '../icons.js';
import {
  DEFAULT_ORIGIN, DEFAULT_DEST, DEST_LL, ORIGIN_LL, VENTUSKY, ventuskyUrl, WX_LINKS, METAR_URL,
} from '../consts.js';
import { watchCams, unwatchCams } from '../camimg.js';
import { openViewer } from '../viewer.js';

// UI state that survives re-renders.
const ui = { selCand: null, gen: null, openPoints: new Set() };

/* ---------------------------------------------------------------- skeleton */
export function skeleton(root) {
  root.innerHTML = `
    <div class="sk sk-hero" aria-hidden="true"></div>
    <div class="sk sk-card" aria-hidden="true"></div>
    <div class="sk sk-card tall" aria-hidden="true"></div>
    <p class="sr-only" role="status">Loading conditions…</p>`;
}

/* ------------------------------------------------------------------ render */
export function render(root, ctx) {
  const d = ctx.data;
  const now = ctx.now;
  unwatchCams(root);
  // Each section renders independently: one malformed feed must not blank the dashboard.
  const safe = (name, fn) => {
    try { return fn(); } catch (err) {
      console.error(`[haul] go/${name}`, err);
      return `<div class="card empty"><p>${esc(name)} unavailable in this update.</p></div>`;
    }
  };
  root.innerHTML = [
    safe('Verdict', () => verdictCard(ctx.verdict)),
    safe('Best departure', () => departureCard(d, now)),
    safe('Route', () => routeStrip(d, now)),
    safe('Pass report', () => passCards(d, now)),
    safe('Road events', () => eventsCard(d)),
    safe('Navigation', () => navCard(ctx)),
    safe('METARs', () => metarCard(d, now)),
    appsCard(),
    `<p class="foot muted">Data: NWS, MDT &amp; ITD RWIS, MT/Idaho 511, aviationweather.gov. Always obey posted signs.</p>`,
  ].join('');
  wire(root, ctx);
  watchCams(root);
}

export function onShow() { /* cams resume automatically via IntersectionObserver */ }

/* ------------------------------------------------------------------ verdict */
function verdictCard(v) {
  if (!v) return '<article class="card verdict"><h1 class="verdict-word">—</h1><p class="verdict-reason">Verdict unavailable — check the pass reports and cams below.</p></article>';
  const cls = LEVEL_CLASS[v.level];
  const sub = { go: 'Conditions support towing now', caution: 'Tow with care — slow down on the passes', wait: 'Hold off if you can' }[cls];
  const factors = v.factors.length
    ? `<details class="why">
        <summary>Why ${esc(v.label)}? <span class="muted">${v.factors.length} signal${v.factors.length > 1 ? 's' : ''}</span></summary>
        <ul class="factors">${v.factors.map((f) => `
          <li class="factor lvl-${LEVEL_CLASS[f.level]}">
            <span class="dot" aria-hidden="true"></span>
            <div><b>${esc(f.title)}</b>${f.detail ? `<small>${esc(f.detail)}</small>` : ''}</div>
          </li>`).join('')}
        </ul>
      </details>` : '';
  return `
  <article class="card verdict verdict-${cls}" aria-labelledby="verdictWord">
    <div class="verdict-glow" aria-hidden="true"></div>
    <div class="verdict-top">
      <span class="eyebrow">Tow right now?</span>
      <button class="chip chip-ghost" data-goto="notices">${ICON.bell}<span>Notices</span></button>
    </div>
    <h1 class="verdict-word" id="verdictWord">${esc(v.label)}</h1>
    <p class="verdict-reason">${esc(v.reason)}</p>
    <p class="verdict-sub muted">${sub}</p>
    ${factors}
  </article>`;
}

/* ---------------------------------------------------------------- departure */
function departureCard(d, now) {
  const plan = d?.plan;
  if (!plan) return '';
  const best = futureBest(plan, now);
  const pick = best[0];
  const car = carMinutes(d);
  const cands = arr(plan.candidates).filter((c) => toDate(c.depart));
  // New data → candidate indices shift, so re-select the best hour.
  if (ui.gen !== d.generated) { ui.gen = d.generated; ui.selCand = null; }
  if (ui.selCand === null || !cands[ui.selCand]) {
    const i = pick ? cands.findIndex((c) => c.depart === pick.depart) : -1;
    ui.selCand = i >= 0 ? i : 0;
  }

  let hero = '<p class="muted">No departure window in the current forecast.</p>';
  if (pick) {
    const dep = toDate(pick.depart);
    const arr_ = toDate(pick.arrive);
    hero = `
      <div class="dep-hero">
        <div class="dep-leg">
          <span class="dep-day"><b>Leave</b> ${esc(relDay(dep, TZ_MT, now))}</span>
          <span class="dep-row"><span class="dep-time">${esc(fmtTime(dep, TZ_MT))}<small>MT</small></span></span>
        </div>
        <div class="dep-leg dep-arr">
          <span class="dep-day"><b>Arrive</b> ${esc(relDay(arr_, TZ_PT, now) === relDay(dep, TZ_MT, now) ? '' : relDay(arr_, TZ_PT, now))}</span>
          <span class="dep-row">
            <span class="dep-time pt">${esc(fmtTime(arr_, TZ_PT))}<small>PT</small></span>
            <span class="dep-alt">${esc(fmtTime(arr_, TZ_MT))} MT</span>
          </span>
        </div>
      </div>
      <div class="dep-stats">
        <div><span class="k">Towing</span><span class="v">${fmtDur(pick.minutes)}</span></div>
        <div><span class="k">Car</span><span class="v muted-v">${fmtDur(car)}</span></div>
        <div><span class="k">Score</span><span class="v lvl-txt-${LEVEL_CLASS[scoreLevel(pick.score)]}">${isNum(pick.score) ? pick.score.toFixed(1) : '—'}</span></div>
      </div>
      ${arr(pick.why).length ? `<p class="dep-why">${arr(pick.why).map(esc).join(' · ')}</p>` : '<p class="dep-why good">No weather penalties in this window.</p>'}
      ${best.length > 1 ? `<div class="dep-alts" role="list" aria-label="Runner-up departures">${best.slice(1).map((b) => `
        <span class="chip" role="listitem">${esc(relDay(b.depart, TZ_MT, now))} ${esc(fmtTime(b.depart, TZ_MT))} <span class="muted">· ${isNum(b.score) ? b.score.toFixed(1) : '—'}</span></span>`).join('')}</div>` : ''}`;
  }

  return `
  <article class="card" aria-labelledby="depTitle">
    <header class="card-h"><h2 id="depTitle">${ICON.truck}Best departure</h2>
      ${plan.main_closure ? '<span class="pill pill-caution" title="The planner saw a closure on the main corridor">closure flagged</span>' : ''}</header>
    ${hero}
    ${cands.length ? heatStrip(cands, now, pick) : ''}
    <details class="logic">
      <summary>How this is decided</summary>
      <ul>${arr(plan.logic).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </details>
  </article>`;
}

function heatStrip(cands, now, pick) {
  const cells = cands.map((c, i) => {
    const b = scoreBad(c.score);
    const hue = Math.round(140 * (1 - b));
    const past = toDate(c.depart) < now - 30 * 6e4;
    const isBest = pick && c.depart === pick.depart;
    const h = hourIn(c.depart, TZ_MT);
    const lbl = `${relDay(c.depart, TZ_MT, now)} ${fmtTime(c.depart, TZ_MT)} MT, score ${isNum(c.score) ? c.score.toFixed(1) : 'unknown'}`;
    return `<button class="hs-cell${past ? ' past' : ''}${isBest ? ' best' : ''}${i === ui.selCand ? ' sel' : ''}${h === 0 ? ' midnight' : ''}"
      style="--h:${hue};--b:${b.toFixed(2)}" data-i="${i}" aria-label="${esc(lbl)}" aria-pressed="${i === ui.selCand}"></button>`;
  }).join('');
  // Hour ticks every 6 h; day name at midnight.
  const ticks = cands.map((c, i) => {
    const h = hourIn(c.depart, TZ_MT);
    if (h % 6) return '';
    const t = h === 0 ? fmtWeekday(c.depart, TZ_MT) : (h === 12 ? 'noon' : `${h % 12}${h < 12 ? 'a' : 'p'}`);
    return `<span class="hs-tick${h === 0 ? ' day' : ''}" style="left:${((i + 0.5) / cands.length) * 100}%">${esc(t)}</span>`;
  }).join('');
  return `
    <div class="hs no-ptr">
      <div class="hs-head"><span>Next ${cands.length} h · departure score</span><span class="hs-legend"><i class="lg-go"></i>good <i class="lg-wait"></i>bad</span></div>
      <div class="hs-cells" role="group" aria-label="Departure score by hour, tap or drag to inspect" style="--n:${cands.length}">${cells}</div>
      <div class="hs-ticks" aria-hidden="true">${ticks}</div>
      <div class="hs-detail" id="hsDetail" aria-live="polite">${candDetail(cands[ui.selCand], now)}</div>
    </div>`;
}

function candDetail(c, now) {
  if (!c) return '';
  const lvl = LEVEL_CLASS[scoreLevel(c.score)];
  return `
    <div class="hs-d-top"><b>${esc(relDay(c.depart, TZ_MT, now))} ${esc(fmtTime(c.depart, TZ_MT))} MT</b>
      <span class="muted">→ ${esc(fmtTime(c.arrive, TZ_PT))} PT · ${fmtDur(c.minutes)}</span>
      <span class="pill pill-${lvl}">${isNum(c.score) ? c.score.toFixed(1) : '—'}</span></div>
    ${arr(c.why).length ? `<ul class="hs-why">${arr(c.why).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="good">Clean window — no penalties.</p>'}`;
}

/* --------------------------------------------------------------- route strip */
function routeStrip(d, now) {
  const pts = arr(d?.points);
  if (!pts.length) return '';
  const best = futureBest(d.plan, now)[0];
  const total = d?.routes?.main?.miles || pts[pts.length - 1]?.mi || 168;
  // Bucket main-corridor events onto their nearest checkpoint.
  const buckets = pts.map(() => []);
  visibleEvents(d).filter((e) => e.corr === 'main' && isNum(e.mi)).forEach((e) => {
    const i = nearestPointIdx(pts, e.mi);
    if (i >= 0) buckets[i].push(e);
  });

  const rows = pts.map((p, i) => {
    const h = hourlyAt(p, now);
    const g = gustAt(p, now);
    const pass = isPassName(p.name);
    const tz = zoneForLon(p.lon);
    const eta = best ? etaAt(best.depart, best.minutes, p.mi, total) : null;
    const evs = dedupeEvents(buckets[i]);
    const kinds = [...new Set(evs.map((e) => e.kind))];
    const temp = h?.temp;
    const cold = isNum(temp) && temp <= 32;
    const wcls = isNum(g) ? (g >= GUST.DANGER ? 'wait' : g >= GUST.CAUTION ? 'caution' : '') : '';
    const per = upcomingPeriods(p, now).slice(0, 2);
    const open = ui.openPoints.has(p.name);
    const crossLine = i > 0 && zoneForLon(pts[i - 1].lon) !== tz;
    return `
      ${crossLine ? `<li class="tl-line" aria-label="State line"><span>Idaho · Pacific time — clocks go back 1 h</span></li>` : ''}
      <li class="tl-item${pass ? ' pass' : ''}">
        <details data-pt="${esc(p.name)}"${open ? ' open' : ''}>
          <summary>
            <span class="tl-mi"><b>${isNum(p.mi) ? Math.round(p.mi) : '—'}</b><small>mi</small></span>
            <span class="tl-dot" aria-hidden="true">${pass ? ICON.mountain : ''}</span>
            <span class="tl-main">
              <span class="tl-name">${esc(p.name)}${pass ? '<span class="pill pill-pass">PASS</span>' : ''}</span>
              <span class="tl-sub">${nf(p.elev)} ft${eta ? ` · ETA ${esc(fmtTime(eta, tz))} ${zoneLabel(tz)}` : ''}</span>
              <span class="tl-wx">${esc(h?.short || per[0]?.short || '—')}</span>
              ${kinds.length ? `<span class="tl-evs">${kinds.map((k) => `<span class="ev-ico ev-${esc(k)}" title="${esc(KIND_LABEL[k] || k)}">${KIND_ICON[k] || ICON.info}<span class="sr-only">${esc(KIND_LABEL[k] || k)}</span></span>`).join('')}</span>` : ''}
            </span>
            <span class="tl-right">
              <span class="tl-temp${cold ? ' cold' : ''}">${isNum(temp) ? `${temp}°` : '—'}</span>
              <span class="tl-wind ${wcls}">${esc(h?.dir || '')} ${isNum(h?.wind) ? h.wind : '—'}${isNum(g) ? `<small> G${g}</small>` : ''}</span>
            </span>
          </summary>
          <div class="tl-more">
            ${per.map((x) => `<p><b>${esc(x.name)}:</b> ${esc(x.detail || x.short || '')}</p>`).join('')}
            ${evs.map((e) => eventLine(e)).join('')}
          </div>
        </details>
      </li>`;
  }).join('');

  return `
  <article class="card" aria-labelledby="routeTitle">
    <header class="card-h"><h2 id="routeTitle">${ICON.map}Route · I-90 westbound</h2><span class="muted small">tap a stop</span></header>
    <p class="muted small route-note">Conditions now${best ? ` · ETAs if you leave ${esc(relDay(best.depart, TZ_MT, now).toLowerCase())} ${esc(fmtTime(best.depart, TZ_MT))} MT` : ''}</p>
    <ol class="timeline">${rows}</ol>
  </article>`;
}

/* --------------------------------------------------------------- passes */
function passCards(d, now) {
  const idwx = arr(d?.id_wx).map((x) => parseIdWx(x, d?.generated));
  const cams = arr(d?.cams);
  const mdtLP = arr(d?.rwis).find((r) => /lookout/i.test(r?.name || ''));
  const itdLP = idwx.find((w) => /lookout/i.test(w.station));
  const itd4 = idwx.find((w) => /4th of july/i.test(w.station));
  const mlp = metarView(arr(d?.metars).find((m) => m?.id === 'KMLP'));
  // Prefer the MDT Lookout cam (its frames carry a timestamp), else any Lookout cam.
  const camLP = cams.findIndex((c) => /lookout/i.test(c?.name || '') && c.src === 'MDT RWIS');
  const camLPany = camLP >= 0 ? camLP : cams.findIndex((c) => /lookout/i.test(c?.name || ''));
  const cam4 = cams.findIndex((c) => /4th of july/i.test(c?.name || ''));

  const pLP = findPoint(d, /lookout/i);
  const p4 = findPoint(d, /4th of july/i);

  const surf = arr(mdtLP?.surface).find((s) => s && (s.cond || isNum(s.temp)));
  // NB: parsed values may be null, and `null <= 32` is true in JS — always isNum() first.
  const lpPave = isNum(itdLP?.surfTemp) ? itdLP.surfTemp : (isNum(surf?.temp) ? surf.temp : null);
  const lpVis = mlp && mlp.vis.n !== null ? mlp.vis : (isNum(itdLP?.vis) ? { n: itdLP.vis, label: `${itdLP.vis} mi` } : null);
  const lpStats = [
    stat('Air', isNum(mdtLP?.air) ? `${mdtLP.air}°` : (isNum(itdLP?.air) ? `${Math.round(itdLP.air)}°` : '—'), isNum(mdtLP?.air) ? 'MDT' : 'ITD'),
    stat('Pavement', isNum(lpPave) ? `${Math.round(lpPave)}°` : '—', isNum(itdLP?.surfTemp) ? 'ITD' : 'MDT', isNum(lpPave) && lpPave <= 32 ? 'wait' : ''),
    stat('Surface', itdLP?.status || surf?.cond || '—', itdLP?.status ? 'ITD' : 'MDT', /ice|snow|slush|frost/i.test(itdLP?.status || surf?.cond || '') ? 'caution' : ''),
    stat('Friction', itdLP?.friction || '—', 'ITD', ['', 'caution', 'wait'][frictionLevel(itdLP?.friction)]),
    stat('Visibility', lpVis ? lpVis.label : '—', mlp && mlp.vis.n !== null ? 'KMLP' : 'ITD', lpVis && lpVis.n < 1 ? 'caution' : ''),
    stat('Wind', windTxt(mdtLP?.wdir, mdtLP?.wind ?? itdLP?.wind, mdtLP?.gust ?? itdLP?.gust), 'live'),
    stat('Precip', mdtLP?.precip || itdLP?.precip || '—', mdtLP?.precip ? 'MDT' : 'ITD', /snow|sleet|freez/i.test(mdtLP?.precip || '') ? 'caution' : ''),
    stat('Weather', mlp?.wxText || (mlp ? 'Clear' : '—'), 'KMLP', /snow/i.test(mlp?.wxText || '') ? 'caution' : ''),
  ];
  const s4 = [
    stat('Air', isNum(itd4?.air) ? `${Math.round(itd4.air)}°` : '—', 'ITD'),
    stat('Pavement', isNum(itd4?.surfTemp) ? `${Math.round(itd4.surfTemp)}°` : '—', 'ITD', isNum(itd4?.surfTemp) && itd4.surfTemp <= 32 ? 'wait' : ''),
    stat('Surface', itd4?.status || '—', 'ITD', /ice|snow|slush|frost/i.test(itd4?.status || '') ? 'caution' : ''),
    stat('Friction', itd4?.friction || '—', 'ITD', ['', 'caution', 'wait'][frictionLevel(itd4?.friction)]),
    stat('Wind', windTxt(null, itd4?.wind, itd4?.gust), 'ITD'),
    stat('Precip', itd4?.precip || '—', 'ITD'),
  ];

  const srcLP = [
    mdtLP ? `MDT RWIS ${esc(ago(mdtLP.obs, now))}` : '',
    itdLP ? `ITD ${esc(itdAge(itdLP, now))}` : '',
    mlp ? `KMLP ${esc(ago(mlp.obs, now))}` : '',
  ].filter(Boolean).join(' · ');

  return `
  <div class="pass-grid">
    ${passCard('Lookout Pass', '4,710 ft · I-90 MP 0 / ID exit 0 · MT/ID line', cams, camLPany, lpStats, pLP, now, srcLP)}
    ${passCard('4th of July Pass', '3,081 ft · ID exits 28–34', cams, cam4, s4, p4, now, itd4 ? `ITD RWIS ${esc(itdAge(itd4, now))}` : '')}
  </div>`;
}

/** ITD stamp → "6 min ago" (resolved to an absolute time), or the raw text as a fallback. */
function itdAge(w, now) {
  if (w.updatedAt) return ago(w.updatedAt, now);
  return w.updated || 'time unknown';
}

function passCard(title, sub, cams, camIdx, stats, point, now, src) {
  const cam = cams[camIdx];
  const view = arr(cam?.views)[0];
  const per = point ? upcomingPeriods(point, now)[0] : null;
  const img = view && safeUrl(view.img)
    ? `<button class="cam-frame pass-cam" data-cam="${camIdx}" aria-label="Open ${esc(camName(cam.name))} camera full screen">
        <img class="camimg" data-src="${esc(safeUrl(view.img))}" alt="${esc(camName(cam.name))} camera" width="640" height="360">
        <span class="cam-err-msg">Camera unavailable</span>
        <span class="cam-badge">${esc(cam.src || '')}${view.t ? ` · ${esc(ago(view.t, now))}` : ' · live'}</span>
      </button>` : '';
  return `
  <article class="card pass" aria-label="${esc(title)} report">
    <header class="card-h"><h2>${ICON.mountain}${esc(title)}</h2></header>
    <p class="pass-sub muted">${esc(sub)}</p>
    ${img}
    <dl class="stats">${stats.join('')}</dl>
    ${per ? `<p class="pass-fc"><b>${esc(per.name)}:</b> ${esc(per.short)}${isNum(per.pop) ? ` · ${per.pop}%` : ''} · ${isNum(per.temp) ? `${per.temp}°` : ''}</p>` : ''}
    ${src ? `<p class="src muted">${src}</p>` : ''}
  </article>`;
}

function stat(k, v, src, lvl = '') {
  // (source tag lives inside <dt> — only dt/dd are valid children of a <dl> group div)
  return `<div class="stat${lvl ? ` lvl-${lvl}` : ''}"><dt>${esc(k)}${src ? `<span class="stat-src">${esc(src)}</span>` : ''}</dt><dd>${esc(v)}</dd></div>`;
}
function windTxt(dir, w, g) {
  if (!isNum(w) && !isNum(g)) return '—';
  return `${dir ? `${dir} ` : ''}${isNum(w) ? Math.round(w) : '—'}${isNum(g) ? ` G${Math.round(g)}` : ''} mph`;
}

/* ---------------------------------------------------------------- events */
function eventLine(e) {
  const sign = e.kind === 'sign' ? signMessage(e) : null;
  const text = sign ? `Overhead sign says: “${sign.msg}”` : eventText(e);
  const where = sign?.where || e.where || '';
  const long = text.length > 140;
  return `
    <div class="ev ev-k-${esc(e.kind)}">
      <span class="ev-ico ev-${esc(e.kind)}" aria-hidden="true">${KIND_ICON[e.kind] || ICON.info}</span>
      <div class="ev-body">
        <div class="ev-top"><b>${esc(KIND_LABEL[e.kind] || e.title || 'Event')}</b>
          <span class="muted">${isNum(e.mi) ? `mi ${Math.round(e.mi)}` : ''}${e.src ? ` · ${esc(e.src)}` : ''}</span></div>
        ${where ? `<div class="ev-where">${esc(where)}</div>` : ''}
        ${long ? `<details class="ev-txt"><summary>${esc(text.slice(0, 120))}…</summary><p>${esc(text)}</p></details>` : `<p class="ev-txt">${esc(text)}</p>`}
      </div>
    </div>`;
}

function eventsCard(d) {
  const ev = visibleEvents(d).filter((e) => e.corr === 'main');
  const active = dedupeEvents(ev.filter((e) => ['closure', 'incident', 'construction', 'weather', 'event', 'sign'].includes(e.kind)))
    .sort((a, b) => (a.mi ?? 0) - (b.mi ?? 0));
  const restr = dedupeEvents(ev.filter((e) => e.kind === 'restriction')).sort((a, b) => (a.mi ?? 0) - (b.mi ?? 0));
  const alt = dedupeEvents(visibleEvents(d).filter((e) => e.corr && e.corr !== 'main'));
  const order = { closure: 0, incident: 1, sign: 2, weather: 3, construction: 4, event: 5 };
  active.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || (a.mi ?? 0) - (b.mi ?? 0));
  return `
  <article class="card" aria-labelledby="evTitle">
    <header class="card-h"><h2 id="evTitle">${ICON.cone}On the route</h2><span class="pill">${active.length}</span></header>
    ${active.length ? active.map(eventLine).join('') : '<p class="good">No incidents, closures or roadwork reported on I-90.</p>'}
    ${restr.length ? `<details class="sub-list"><summary>${ICON.truck}<span>Truck restrictions <span class="pill">${restr.length}</span></span></summary>${restr.map(eventLine).join('')}</details>` : ''}
    ${alt.length ? `<details class="sub-list"><summary>${ICON.map}<span>Alternate routes <span class="pill">${alt.length}</span></span></summary>
      ${alt.map((e) => eventLine(e).replace('<b>', `<b>${e.corr === 'alt_12' ? 'US-12 · ' : 'MT-200 · '}`)).join('')}</details>` : ''}
  </article>`;
}

/* ------------------------------------------------------------- navigation */
function navLinks(ctx) {
  const a = ctx.addresses();
  let origin = a.origin || DEFAULT_ORIGIN;
  let dest = a.dest || DEFAULT_DEST;
  let destSaved = !!a.dest; let originSaved = !!a.origin;
  let destLL = DEST_LL; let originLL = ORIGIN_LL;
  if (a.reverse) {
    [origin, dest] = [dest, origin];
    [originSaved, destSaved] = [destSaved, originSaved];
    [originLL, destLL] = [destLL, originLL];
  }
  const q = encodeURIComponent;
  return {
    origin, dest, reverse: a.reverse, custom: !!(a.origin || a.dest),
    google: `https://www.google.com/maps/dir/?api=1&origin=${q(origin)}&destination=${q(dest)}&travelmode=driving&waypoints=${q('Lookout Pass, ID')}`,
    traffic: 'https://www.google.com/maps/@47.35,-115.4,9z/data=!5m1!1e1',
    waze: destSaved ? `https://www.waze.com/ul?q=${q(dest)}&navigate=yes` : `https://www.waze.com/ul?ll=${destLL}&navigate=yes`,
    wazeLive: `https://www.waze.com/live-map/directions?to=ll.${destLL}&from=ll.${originLL}`,
    apple: `https://maps.apple.com/?saddr=${q(origin)}&daddr=${q(dest)}&dirflg=d`,
  };
}

function navCard(ctx) {
  const n = navLinks(ctx);
  return `
  <article class="card" aria-labelledby="navTitle">
    <header class="card-h"><h2 id="navTitle">${ICON.nav}Navigate</h2>
      <button class="chip" type="button" data-action="settings">${ICON.gear}<span>Addresses</span></button></header>
    <p class="nav-od"><span>${esc(n.origin)}</span><span class="muted" aria-hidden="true">→</span><span>${esc(n.dest)}</span></p>
    <p class="muted small">${n.custom ? 'Using your saved addresses (this device only).' : 'Town-level defaults. Tap Addresses to set exact ones.'} Google route forced via Lookout Pass.</p>
    <div class="nav-btns">
      <a class="nav-btn nb-google" href="${esc(n.google)}" target="_blank" rel="noopener"><span class="nb-logo" aria-hidden="true">G</span><span>Google Maps</span></a>
      <a class="nav-btn nb-waze" href="${esc(n.waze)}" target="_blank" rel="noopener"><span class="nb-logo" aria-hidden="true">W</span><span>Waze</span></a>
      <a class="nav-btn nb-apple" href="${esc(n.apple)}" target="_blank" rel="noopener"><span class="nb-logo" aria-hidden="true"></span><span>Apple Maps</span></a>
    </div>
    <div class="chips">
      <a class="chip" href="${esc(n.traffic)}" target="_blank" rel="noopener">Live traffic map ${ICON.ext}</a>
      <a class="chip" href="${esc(n.wazeLive)}" target="_blank" rel="noopener">Waze live map ${ICON.ext}</a>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ METARs */
function metarCard(d, now) {
  const ms = arr(d?.metars).map(metarView).filter(Boolean);
  if (!ms.length) return '';
  // Mullan Pass first — the best live pass observation.
  ms.sort((a, b) => (b.id === 'KMLP') - (a.id === 'KMLP'));
  const catCls = { VFR: 'go', MVFR: 'mvfr', IFR: 'wait', LIFR: 'lifr' };
  return `
  <article class="card" aria-labelledby="metarTitle">
    <header class="card-h"><h2 id="metarTitle">${ICON.wind}Airport obs (METAR)</h2>
      <a class="chip" href="${esc(METAR_URL)}" target="_blank" rel="noopener">AWC ${ICON.ext}</a></header>
    <ul class="metars">${ms.map((m) => `
      <li class="metar${m.id === 'KMLP' ? ' hl' : ''}">
        <div class="metar-top">
          <b class="metar-id">${esc(m.id)}</b>
          <span class="metar-name">${esc(m.name || '')}</span>
          ${m.cat ? `<span class="pill pill-${catCls[m.cat] || ''}">${esc(m.cat)}</span>` : ''}
        </div>
        <div class="metar-vals">
          <span><b>${isNum(m.tempF) ? `${m.tempF}°F` : '—'}</b></span>
          <span>${isNum(m.windMph) ? (m.windMph === 0 ? 'Calm' : `${m.wdir ? cardinalOf(m.wdir) + ' ' : ''}${m.windMph} mph`) : '—'}${isNum(m.gustMph) ? ` G${m.gustMph}` : ''}</span>
          <span>Vis ${esc(m.vis.label)}</span>
          ${m.wxText ? `<span class="metar-wx">${esc(m.wxText)}</span>` : ''}
        </div>
        <details class="metar-raw"><summary>${esc(ago(m.obs, now))} · raw</summary><code>${esc(m.raw || '')}</code></details>
      </li>`).join('')}
    </ul>
  </article>`;
}
const cardinalOf = cardinal;

/* ------------------------------------------------------- weather apps card */
function appsCard() {
  return `
  <article class="card" aria-labelledby="appsTitle">
    <header class="card-h"><h2 id="appsTitle">${ICON.wx}Brad's weather apps</h2></header>
    <h3 class="h3">Ventusky</h3>
    <div class="chips big">${VENTUSKY.map((v) => `<a class="chip chip-lg" href="${esc(ventuskyUrl(v.layer))}" target="_blank" rel="noopener">${esc(v.label)}</a>`).join('')}</div>
    <h3 class="h3">ForeFlight</h3>
    <div class="chips big">
      <a class="chip chip-lg chip-accent" href="foreflight://">Open ForeFlight</a>
      <a class="chip chip-lg" href="${esc(METAR_URL)}" target="_blank" rel="noopener">METARs ${ICON.ext}</a>
    </div>
    <p class="muted small">Maps tab → Lookout Pass area · layers: Radar, Icing, Winds. KMLP (Mullan Pass) is 1 mi from the summit.</p>
    ${WX_LINKS.map((g) => `
      <h3 class="h3">${esc(g.group)}</h3>
      <div class="chips">${g.items.map((i) => `<a class="chip" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.label)}</a>`).join('')}</div>`).join('')}
  </article>`;
}

/* ------------------------------------------------------------------ wiring */
function wire(root, ctx) {
  const d = ctx.data;
  const cands = arr(d?.plan?.candidates).filter((c) => toDate(c.depart));

  // Heat strip: tap or drag across to inspect an hour.
  const strip = $('.hs-cells', root);
  if (strip) {
    const select = (i) => {
      if (i === ui.selCand || !cands[i]) return;
      ui.selCand = i;
      $$('.hs-cell', strip).forEach((c, j) => { c.classList.toggle('sel', j === i); c.setAttribute('aria-pressed', String(j === i)); });
      $('#hsDetail', root).innerHTML = candDetail(cands[i], ctx.now);
      haptic(4);
    };
    const idxAt = (x) => {
      const r = strip.getBoundingClientRect();
      return Math.max(0, Math.min(cands.length - 1, Math.floor(((x - r.left) / r.width) * cands.length)));
    };
    let dragging = false;
    strip.addEventListener('pointerdown', (e) => { dragging = true; strip.setPointerCapture?.(e.pointerId); select(idxAt(e.clientX)); });
    strip.addEventListener('pointermove', (e) => { if (dragging) select(idxAt(e.clientX)); });
    const stop = () => { dragging = false; };
    strip.addEventListener('pointerup', stop);
    strip.addEventListener('pointercancel', stop);
    strip.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const i = Math.max(0, Math.min(cands.length - 1, ui.selCand + (e.key === 'ArrowRight' ? 1 : -1)));
        select(i);
        $$('.hs-cell', strip)[i]?.focus();
      }
    });
    strip.addEventListener('click', (e) => { const b = e.target.closest('.hs-cell'); if (b) select(Number(b.dataset.i)); });
  }

  // Remember which checkpoints are expanded across refreshes.
  $$('details[data-pt]', root).forEach((det) => det.addEventListener('toggle', () => {
    if (det.open) ui.openPoints.add(det.dataset.pt); else ui.openPoints.delete(det.dataset.pt);
  }));

  // Delegated clicks — attached once per root (render() runs again on every data refresh).
  if (!root.dataset.wired) {
    root.dataset.wired = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cam]');
      if (b) {
        // Swipe through I-90 cams only (route order), starting at the tapped one.
        const all = arr(ctx.data?.cams);
        const tapped = all[Number(b.dataset.cam)];
        const main = all.filter((c) => c?.corr === 'main');
        const list = main.includes(tapped) ? main : all;
        openViewer(list, Math.max(0, list.indexOf(tapped)), 0);
        return;
      }
      if (e.target.closest('[data-action="settings"]')) ctx.openSettings();
    });
  }
}
