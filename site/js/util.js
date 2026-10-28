// Shared helpers: escaping, time zones, formatting, small DOM utilities.
// All times in data.json are absolute (UTC or offset ISO / unix seconds);
// we only ever *display* them in America/Denver (MT) or America/Los_Angeles (PT).

export const TZ_MT = 'America/Denver';
export const TZ_PT = 'America/Los_Angeles';

/** HTML-escape any value coming from data feeds. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Decode the few HTML entities that leak through feed names ("21st &amp; Main"). */
export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

/** Only allow http(s) URLs from data into href/src attributes. */
export function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const url = new URL(u, location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const arr = (v) => (Array.isArray(v) ? v : []);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Parse ISO string, unix seconds, or Date → Date (or null). */
export function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Intl formatters are relatively expensive; cache them per zone/options.
const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }); fmtCache.set(key, f); }
  return f;
}

/** "11:42 PM" */
export function fmtTime(v, tz = TZ_MT) {
  const d = toDate(v);
  return d ? fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(d) : '—';
}
/** "11 PM" (compact hour) */
export function fmtHour(v, tz = TZ_MT) {
  const d = toDate(v);
  return d ? fmt(tz, { hour: 'numeric' }).format(d).replace(' ', ' ') : '';
}
/** "Wed" */
export function fmtWeekday(v, tz = TZ_MT) {
  const d = toDate(v);
  return d ? fmt(tz, { weekday: 'short' }).format(d) : '';
}
/** "Wed Oct 28" */
export function fmtDate(v, tz = TZ_MT) {
  const d = toDate(v);
  return d ? fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(d) : '';
}
/** Calendar day key ("10/28/2026") in a zone — only used for equality checks. */
export function dayKey(v, tz = TZ_MT) {
  const d = toDate(v);
  return d ? fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '';
}
/** Hour-of-day 0..23 in a zone. */
export function hourIn(v, tz = TZ_MT) {
  const d = toDate(v);
  if (!d) return NaN;
  const h = parseInt(fmt(tz, { hour: '2-digit', hourCycle: 'h23' }).format(d), 10);
  return h === 24 ? 0 : h;
}

/** UTC offset (ms) of a zone at a given instant. */
function zoneOffset(tz, ms) {
  const p = {};
  for (const x of fmt(tz, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in a zone → Date (DST-safe, two-pass). */
export function zonedTime(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo, d, h, mi);
  let t = guess - zoneOffset(tz, guess);
  t = guess - zoneOffset(tz, t);
  return new Date(t);
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
/**
 * Parse a zone-less stamp like "Oct 27 2026, 11:30 PM". Feeds don't say which zone it is
 * (ITD stamps turn out to be Mountain even for Pacific-time stations), so try MT and PT and
 * keep the one that is not in the future relative to `ref` (data generation time), closest to it.
 */
export function parseWallStamp(s, ref) {
  const m = String(s || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AP]M)/);
  if (!m || MONTHS[m[1]] === undefined) return null;
  let h = +m[4] % 12; if (m[6] === 'PM') h += 12;
  const refMs = (toDate(ref) || new Date()).getTime() + 10 * 6e4; // 10 min clock-skew tolerance
  const opts = [TZ_MT, TZ_PT].map((tz) => zonedTime(+m[3], MONTHS[m[1]], +m[2], h, +m[5], tz));
  const past = opts.filter((d) => d.getTime() <= refMs);
  return (past.length ? past : opts).sort((a, b) => b - a)[0];
}

/** "Today" / "Tomorrow" / "Fri" relative to now, judged in the given zone. */
export function relDay(v, tz = TZ_MT, now = new Date()) {
  const d = toDate(v);
  if (!d) return '';
  const k = dayKey(d, tz);
  if (k === dayKey(now, tz)) return 'Today';
  if (k === dayKey(new Date(now.getTime() + 864e5), tz)) return 'Tomorrow';
  if (k === dayKey(new Date(now.getTime() - 864e5), tz)) return 'Yesterday';
  return fmtWeekday(d, tz);
}

/** "6 min ago", "2 h ago", "in 3 h" */
export function ago(v, now = Date.now()) {
  const d = toDate(v);
  if (!d) return '';
  const s = Math.round((now - d.getTime()) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  let txt;
  if (a < 45) return future ? 'now' : 'just now';
  if (a < 3600) txt = `${Math.round(a / 60)} min`;
  else if (a < 86400) { const h = a / 3600; txt = `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`; }
  else txt = `${Math.round(a / 86400)} d`;
  return future ? `in ${txt}` : `${txt} ago`;
}

/** 213 → "3 h 33 m" */
export function fmtDur(min) {
  if (!isNum(min)) return '—';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} m` : `${m} m`;
}

export const cToF = (c) => (isNum(c) ? Math.round(c * 9 / 5 + 32) : null);
export const ktToMph = (k) => (isNum(k) ? Math.round(k * 1.15078) : null);
export const nf = (n) => (isNum(n) ? n.toLocaleString('en-US') : '—');
export const deg = (n) => (isNum(n) ? `${Math.round(n)}°` : '—');

const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const cardinal = (d) => (isNum(d) ? CARD[Math.round(((d % 360) + 360) % 360 / 22.5) % 16] : '');

/** "5 to 10 mph" → 10 ; "2 mph" → 2 */
export function maxMph(s) {
  if (isNum(s)) return s;
  if (!s) return null;
  const nums = String(s).match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

/** Tiny DOM helpers */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Append a cache-busting param to a URL (keeps existing query intact). */
export function bust(u) {
  if (!u) return '';
  return u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
}

/** localStorage JSON helpers that never throw (Safari private mode, quota). */
export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

/** Light haptic tick where supported (Android); harmless elsewhere. */
export function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* noop */ } }

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
