// Pure data → insight functions. No DOM here, so everything is easy to reason about.
import {
  TZ_MT, TZ_PT, arr, isNum, toDate, decodeEntities, cToF, ktToMph, parseWallStamp,
} from './util.js';

export const LEVEL = { GO: 0, CAUTION: 1, WAIT: 2 };
export const LEVEL_NAME = ['GO', 'CAUTION', 'WAIT'];
export const LEVEL_CLASS = ['go', 'caution', 'wait'];

// Gust thresholds for a ~10,000 lb high-profile trailer (spec: 25 / 35 / 45).
export const GUST = { CAUTION: 25, DANGER: 35, NO_TOW: 45 };

export const PASS_RE = /lookout|4th of july|fourth of july|lolo pass/i;
export const isPassName = (n) => PASS_RE.test(n || '');

/**
 * Which clock a place runs on. The MT/ID line is at Lookout Pass (~-115.70).
 * Lookout Pass itself (and the MDT station on the MT side) runs on Mountain time.
 */
export const zoneForLon = (lon) => (isNum(lon) && lon < -115.72 ? TZ_PT : TZ_MT);
export const zoneLabel = (tz) => (tz === TZ_PT ? 'PT' : 'MT');

/* ---------------------------------------------------------------- forecasts */

/** Hourly forecast entry covering `now` (last one starting at/before now). */
export function hourlyAt(point, when = new Date()) {
  const hrs = arr(point?.hourly);
  if (!hrs.length) return null;
  const t = when.getTime();
  let best = null;
  for (const h of hrs) {
    const d = toDate(h.t);
    if (d && d.getTime() <= t) best = h; else if (d) break;
  }
  // If data is newer than the clock (or clock skew), fall back to the first hour.
  return best || hrs[0];
}

/** Sorted gust grid as [{time:Date, mph}] (cached on the point object). */
function gustSeries(point) {
  if (!point) return [];
  if (!point._gs) {
    point._gs = arr(point.gusts)
      .map((g) => ({ time: toDate(g.t), mph: g.mph }))
      .filter((g) => g.time && isNum(g.mph))
      .sort((a, b) => a.time - b.time);
  }
  return point._gs;
}

/** Gust (mph) in effect at a moment. The NWS grid is a step function; hold each value ≤ 6 h. */
export function gustAt(point, when) {
  const s = gustSeries(point);
  const t = when.getTime();
  let v = null;
  for (const g of s) {
    if (g.time.getTime() <= t) { v = (t - g.time.getTime() <= 6 * 36e5) ? g.mph : null; } else break;
  }
  return v;
}

/** Max gust at a point within [from, from+hours]. */
export function maxGustWindow(point, from, hours) {
  const s = gustSeries(point);
  const end = from.getTime() + hours * 36e5;
  let max = gustAt(point, from);
  for (const g of s) {
    const t = g.time.getTime();
    if (t > from.getTime() && t <= end) max = max === null ? g.mph : Math.max(max, g.mph);
  }
  return max;
}

/** Periods that haven't fully ended yet (period i ends when period i+1 starts, or +12 h). */
export function upcomingPeriods(point, now = new Date()) {
  const ps = arr(point?.periods);
  const t = now.getTime();
  return ps.filter((p, i) => {
    const start = toDate(p.start);
    if (!start) return true;
    const next = toDate(ps[i + 1]?.start);
    const end = next ? next.getTime() : start.getTime() + 12 * 36e5;
    return end > t;
  });
}

const SNOWY = /snow|blizzard|sleet|ice|freezing|wintry/i;

/* --------------------------------------------------------------- road data */

/**
 * Idaho RWIS rows come as one flattened text blob. Pull out the values we care about.
 * Example: "Weather Station D1 - Lookout Pass General ... Air Temp 32.7 °F Surface Status Wet ..."
 */
export function parseIdWx(item, ref) {
  const t = (item?.text || '').replace(/\s+/g, ' ');
  const num = (re) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  const str = (re) => { const m = t.match(re); return m ? m[1].trim() : null; };
  const station = str(/Weather Station\s+(?:D\d+\s*-\s*)?(.+?)\s+General\b/) || str(/Weather Station\s+(?:D\d+\s*-\s*)?(.+?)\s+Air Temp/) || 'ITD station';
  const friction = str(/Surface Friction\s+(.+?)\s+(?=Visibility|Wind Speed|Last Updated|Dewpoint|Surface Temp|Relative|Precip|$)/);
  const updated = str(/Last Updated\s+([A-Z][a-z]{2} \d{1,2} \d{4}, \d{1,2}:\d{2} [AP]M)/);
  return {
    src: item?.src || 'ITD RWIS',
    station,
    lat: item?.lat, lon: item?.lon, mi: item?.mi, corr: item?.corr,
    air: num(/Air Temp\s+(-?[\d.]+)/),
    surfTemp: num(/(?:^|\s)Surface Temp\s+(-?[\d.]+)/),
    status: str(/Surface Status\s+(.+?)\s+(?=Precip \(|Surface Friction|Visibility|Wind Speed|Last Updated|Air Temp|$)/),
    friction,
    vis: num(/Visibility\s+([\d.]+)\s*mi/),
    wind: num(/Wind Speed \(avg\)\s+([\d.]+)/),
    gust: num(/Wind Speed \(gust\)\s+([\d.]+)/),
    rh: num(/Relative Humidity\s+([\d.]+)/),
    precip: str(/Precipitation\s+(.+?)\s+(?=Precip One|Precip Three|Precip Six|Precip 24|Wind|$)/),
    updated,
    // Zone-less stamp → absolute time (resolved against the data's generation time).
    updatedAt: parseWallStamp(updated, ref),
  };
}

/** Friction: "Good"/"Fair"/"Poor" or a 0..1 coefficient → 0 ok, 1 fair, 2 poor. */
export function frictionLevel(f) {
  if (!f) return 0;
  const n = parseFloat(f);
  if (isNum(n) && /^[\d.]+$/.test(f.trim())) return n < 0.5 ? 2 : n < 0.7 ? 1 : 0;
  if (/poor|bad|low/i.test(f)) return 2;
  if (/fair|medium|moderate/i.test(f)) return 1;
  return 0;
}

const SURF_BAD = /ice|icy|snow|slush|frost|black/i;

/** Overhead DMS text → message only, or null if blank (NO_MESSAGE). */
export function signMessage(ev) {
  const raw = (ev?.text || '').trim();
  if (!raw || /NO_MESSAGE/i.test(raw)) return null;
  let s = raw.replace(/^Message Sign\s+/i, '')
    .replace(/\s+[A-Z][a-z]{2} \d{1,2} \d{4},\s*\d{1,2}:\d{2}\s*[AP]M\s*$/, '');
  // Location is mixed-case ("I-90 W at Elm Street - Coeur d'Alene"); the message is ALL CAPS.
  const words = s.split(' ');
  for (let i = 0; i < words.length; i++) {
    const rest = words.slice(i).join(' ');
    if (!/[a-z]/.test(rest) && /[A-Z]{2,}/.test(rest)) {
      return { where: words.slice(0, i).join(' ').trim(), msg: rest.replace(/\s*·\s*/g, ' · ').trim() };
    }
  }
  return { where: '', msg: s };
}

/** Clean event text: drop the redundant leading kind word Idaho 511 prefixes. */
export function eventText(ev) {
  return decodeEntities((ev?.text || '').replace(/^(Roadwork|Closure|Restriction|Incident|Warning)\s+/i, '').trim());
}

/** A closure that actually shuts the I-90 mainline (not a ramp or a side road). */
export function isMainlineClosure(ev) {
  if (ev?.kind !== 'closure' || ev.corr !== 'main') return false;
  const t = `${ev.title || ''} ${ev.text || ''} ${ev.where || ''}`;
  if (!/\bI-?90\b/i.test(t)) return false;
  if (/\bramp\b|on-?ramp|off-?ramp|exit only|frontage/i.test(t)) return false;
  return /all lanes|closed|closure/i.test(t);
}

/** Visible events (signs only when they carry a real message). */
export function visibleEvents(data) {
  return arr(data?.events).filter((e) => e && (e.kind !== 'sign' || signMessage(e)));
}

/** Remove events with identical (kind, cleaned text) — feeds often duplicate EB/WB. */
export function dedupeEvents(list) {
  const seen = new Set();
  return list.filter((e) => {
    const k = `${e.kind}|${eventText(e).slice(0, 120)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ------------------------------------------------------------------ METARs */

const WX_CODES = {
  SN: 'snow', RA: 'rain', DZ: 'drizzle', FG: 'fog', BR: 'mist', HZ: 'haze', FU: 'smoke',
  GR: 'hail', GS: 'small hail', PL: 'ice pellets', SG: 'snow grains', IC: 'ice crystals',
  UP: 'unknown precip', TS: 'thunderstorm', SQ: 'squalls', BL: 'blowing', DR: 'drifting',
  FZ: 'freezing', SH: 'showers', VC: 'nearby', MI: 'shallow', BC: 'patches', PR: 'partial', DU: 'dust', SA: 'sand',
};

/** "-SN BR" → "Light snow, mist" */
export function decodeWx(wx) {
  if (!wx) return '';
  return String(wx).split(/\s+/).filter(Boolean).map((tok) => {
    let s = tok;
    let intensity = '';
    if (s.startsWith('-')) { intensity = 'light '; s = s.slice(1); } else if (s.startsWith('+')) { intensity = 'heavy '; s = s.slice(1); }
    const parts = s.match(/.{1,2}/g) || [];
    let words = parts.map((p) => WX_CODES[p] || p);
    // "SHSN" reads better as "snow showers"
    if (words[0] === 'showers' && words.length > 1) words = [...words.slice(1), 'showers'];
    return intensity + words.join(' ');
  }).join(', ').replace(/^./, (c) => c.toUpperCase());
}

/** Visibility value ('10+', 0.75, '1/2') → { n: number|null, label } */
export function visInfo(v) {
  if (v === null || v === undefined || v === '') return { n: null, label: '—' };
  if (typeof v === 'string' && v.includes('+')) return { n: parseFloat(v), label: `${parseFloat(v)}+ mi` };
  let n = typeof v === 'number' ? v : parseFloat(v);
  if (typeof v === 'string' && /^\d+\/\d+$/.test(v)) { const [a, b] = v.split('/').map(Number); n = a / b; }
  if (!isNum(n)) return { n: null, label: String(v) };
  const fr = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.125: '⅛' };
  const label = fr[n] ? `${fr[n]} mi` : `${Math.round(n * 100) / 100} mi`;
  return { n, label };
}

export function metarView(m) {
  if (!m) return null;
  return {
    ...m,
    tempF: cToF(m.temp_c),
    windMph: ktToMph(m.wind_kt),
    gustMph: ktToMph(m.gust_kt),
    wxText: decodeWx(m.wx),
    vis: visInfo(m.vis),
  };
}

/* -------------------------------------------------------------------- cams */

/** "I-90 Lookout Pass," / "US-12 21st &amp; Main" → tidy label. */
export function camName(s) {
  return decodeEntities(s || '').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();
}
/** View caption: drop the repeated cam name & "N/A", keep the interesting tail. */
export function viewName(view, cam) {
  const base = camName(cam?.name);
  let v = decodeEntities(view?.name || '').trim();
  const parts = v.split(',').map((x) => x.trim()).filter((x) => x && x !== 'N/A');
  const uniq = [...new Set(parts)];
  v = uniq.filter((p) => p !== base).join(' · ') || uniq.join(' · ');
  return v || base;
}
export function camElev(cam) {
  for (const v of arr(cam?.views)) { const m = (v.name || '').match(/Elev\s+(\d{3,5})/i); if (m) return +m[1]; }
  return null;
}

/* ---------------------------------------------------------------- planning */

/** plan.best filtered to departures not already in the past (data may be hours old). */
export function futureBest(plan, now = new Date()) {
  const cut = now.getTime() - 30 * 6e4;
  const best = arr(plan?.best).filter((b) => toDate(b.depart)?.getTime() >= cut);
  if (best.length) return best;
  // Fall back to the best remaining candidate.
  const c = arr(plan?.candidates).filter((b) => toDate(b.depart)?.getTime() >= cut);
  return c.sort((a, b) => (a.score ?? 99) - (b.score ?? 99)).slice(0, 3);
}

/** Car drive time: trust the route value unless it is implausible (≥ towing time). */
export function carMinutes(data) {
  const r = data?.routes?.main;
  const tow = data?.plan?.base_minutes;
  if (isNum(r?.car_minutes) && (!isNum(tow) || r.car_minutes < tow)) return r.car_minutes;
  const miles = isNum(r?.miles) ? r.miles : 168;
  return Math.round(miles / 65 * 60);
}

/** Score → 0..1 badness for colouring (0 = perfect, ≥30 = bad). */
export const scoreBad = (s) => (isNum(s) ? Math.max(0, Math.min(1, s / 30)) : 1);
export const scoreLevel = (s) => (!isNum(s) ? 2 : s < 6 ? 0 : s < 18 ? 1 : 2);

/* ------------------------------------------------------------------ verdict */

export function findPoint(data, re) { return arr(data?.points).find((p) => re.test(p.name || '')); }

/**
 * GO / CAUTION / WAIT, computed from live inputs. Returns factors in priority order;
 * each factor = { level, title, detail }.
 */
export function computeVerdict(data, now = new Date()) {
  const f = [];
  const add = (level, title, detail = '') => f.push({ level, title, detail });

  // 1 · Closures on the I-90 mainline
  const closures = arr(data?.events).filter((e) => e?.kind === 'closure' && e.corr === 'main');
  const mainline = closures.filter(isMainlineClosure);
  mainline.forEach((e) => add(LEVEL.WAIT, `I-90 closed near mile ${Math.round(e.mi ?? 0)}`, eventText(e)));
  if (!mainline.length && closures.length) {
    add(LEVEL.GO, `${closures.length} local closure${closures.length > 1 ? 's' : ''} off the mainline`,
      closures.map((e) => eventText(e).slice(0, 90)).join(' • '));
  }

  // 2 · NWS alerts
  for (const a of arr(data?.alerts)) {
    const ends = toDate(a?.ends);
    if (ends && ends < now) continue;
    const ev = a?.event || 'Alert';
    if (/blizzard|winter storm warning|ice storm|high wind warning|extreme wind/i.test(ev)) add(LEVEL.WAIT, ev, a.headline || '');
    else if (/winter|snow|wind|freez|ice|frost|dense fog|avalanche/i.test(ev)) add(LEVEL.CAUTION, ev, a.headline || '');
  }

  // Sensor readings older than this are ignored for the verdict (still shown in the cards).
  const FRESH_MS = 3 * 36e5;
  const fresh = (t) => { const d = toDate(t); return !d || now - d < FRESH_MS; };

  // 3 · KMLP (Mullan Pass, 1 mi from Lookout) — best live visibility/weather at the pass
  const mlp = arr(data?.metars).find((m) => m?.id === 'KMLP');
  if (mlp && mlp.obs && fresh(mlp.obs)) {
    const v = visInfo(mlp.vis);
    const wx = mlp.wx || '';
    if (/FZ|\+SN|PL/.test(wx)) add(LEVEL.WAIT, `Mullan Pass: ${decodeWx(wx).toLowerCase()}`, mlp.raw || '');
    else if (/SN/.test(wx)) add(LEVEL.CAUTION, `Snowing at Lookout/Mullan Pass${v.n !== null && v.n < 3 ? `, ${v.label} visibility` : ''}`, mlp.raw || '');
    else if (v.n !== null && v.n < 1) add(LEVEL.CAUTION, `Mullan Pass visibility ${v.label}`, mlp.raw || '');
  }

  // 3b · Lookout Pass surface — MDT RWIS (MT side)
  const lpMdt = arr(data?.rwis).find((r) => /lookout/i.test(r?.name || ''));
  if (lpMdt && fresh(lpMdt.obs)) {
    const surf = arr(lpMdt.surface).find((s) => s && (s.cond || isNum(s.temp)));
    if (surf?.cond && SURF_BAD.test(surf.cond)) add(/ice|icy/i.test(surf.cond) ? LEVEL.WAIT : LEVEL.CAUTION, `Lookout Pass road: ${surf.cond.toLowerCase()}`, 'MDT RWIS surface sensor');
    if (lpMdt.precip && /snow|sleet|freez|ice/i.test(lpMdt.precip)) add(LEVEL.CAUTION, `Lookout Pass sensor: ${lpMdt.precip.toLowerCase()}`, `MDT RWIS · air ${isNum(lpMdt.air) ? `${lpMdt.air}°F` : '—'}`);
    if (isNum(surf?.temp) && surf.temp <= 32 && lpMdt.precip && !/^no/i.test(lpMdt.precip)) add(LEVEL.CAUTION, `Lookout Pass pavement ${surf.temp}°F with precip`, 'Freezing pavement — black ice risk');
  }

  // 3c · ITD RWIS — Lookout & 4th of July
  for (const raw of arr(data?.id_wx)) {
    const w = parseIdWx(raw, data?.generated);
    if (!/lookout|4th of july/i.test(w.station)) continue;
    if (w.updatedAt && !fresh(w.updatedAt)) continue;
    const name = /lookout/i.test(w.station) ? 'Lookout Pass' : '4th of July Pass';
    const fl = frictionLevel(w.friction);
    if (w.status && SURF_BAD.test(w.status)) add(/ice|icy/i.test(w.status) || fl === 2 ? LEVEL.WAIT : LEVEL.CAUTION, `${name} road: ${w.status.toLowerCase()}`, `ITD sensor · friction ${w.friction || '—'}`);
    else if (fl === 2) add(LEVEL.WAIT, `${name}: poor friction`, `ITD sensor · ${w.friction}`);
    else if (fl === 1) add(LEVEL.CAUTION, `${name}: fair friction`, `ITD sensor · ${w.friction}`);
    if (isNum(w.surfTemp) && w.surfTemp <= 33 && w.status && /wet|damp|moist/i.test(w.status)) add(LEVEL.CAUTION, `${name}: wet pavement at ${Math.round(w.surfTemp)}°F`, 'Near-freezing — black ice possible');
  }

  // 4 · Gusts along route, next 4 h
  let gMax = null; let gWhere = '';
  for (const p of arr(data?.points)) {
    const g = maxGustWindow(p, now, 4);
    if (isNum(g) && (gMax === null || g > gMax)) { gMax = g; gWhere = p.name; }
  }
  if (isNum(gMax)) {
    if (gMax >= GUST.NO_TOW) add(LEVEL.WAIT, `Gusts ${gMax} mph at ${gWhere}`, 'Do not tow a high-profile trailer');
    else if (gMax >= GUST.DANGER) add(LEVEL.WAIT, `Gusts ${gMax} mph at ${gWhere}`, 'Dangerous for a high-profile trailer');
    else if (gMax >= GUST.CAUTION) add(LEVEL.CAUTION, `Gusts to ${gMax} mph at ${gWhere}`, 'Next 4 h — keep both hands on it');
  }

  // 5 · Snow in upcoming forecast periods at the passes
  for (const re of [/lookout/i, /4th of july/i]) {
    const p = findPoint(data, re);
    if (!p) continue;
    const next = upcomingPeriods(p, now).slice(0, 2);
    const snowy = next.find((x) => SNOWY.test(x.short || '') && (x.pop ?? 100) >= 30);
    if (snowy) {
      const heavy = /heavy snow|blizzard/i.test(`${snowy.short} ${snowy.detail || ''}`);
      add(heavy ? LEVEL.WAIT : LEVEL.CAUTION, `${p.name}: ${snowy.short.toLowerCase()} ${isNum(snowy.pop) ? snowy.pop + '%' : ''}`.trim(), `${snowy.name}: ${snowy.detail || ''}`);
    }
  }

  const level = f.reduce((m, x) => Math.max(m, x.level), 0);
  const top = f.filter((x) => x.level === level && level > 0);
  let reason;
  if (level === 0) reason = isNum(gMax) ? `Roads clear, gusts ≤ ${gMax} mph, no I-90 closures.` : 'Roads clear and no I-90 closures.';
  else reason = top[0].title + (top.length > 1 ? ` · +${top.length - 1} more` : '');
  return { level, label: LEVEL_NAME[level], reason, factors: f.sort((a, b) => b.level - a.level), gMax, gWhere };
}

/** Nearest checkpoint index for a route mile on the main corridor. */
export function nearestPointIdx(points, mi) {
  let best = -1; let d = Infinity;
  arr(points).forEach((p, i) => { const dd = Math.abs((p.mi ?? 0) - mi); if (dd < d) { d = dd; best = i; } });
  return best;
}

/** ETA at a route mile given a departure and total minutes (linear by distance). */
export function etaAt(depart, minutes, mi, totalMiles = 168) {
  const d = toDate(depart);
  if (!d || !isNum(minutes) || !isNum(mi)) return null;
  return new Date(d.getTime() + minutes * 6e4 * Math.min(1, mi / totalMiles));
}
