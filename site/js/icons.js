// Inline SVG icon set (stroke icons, currentColor). Kept tiny and dependency-free.
const s = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  go: s('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  cam: s('<rect x="2" y="6" width="15" height="12" rx="2"/><path d="m17 10 5-3v10l-5-3"/>'),
  map: s('<path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>'),
  wx: s('<path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.8A7 7 0 1 0 4 15.3"/><path d="M8 19v2M12 17v2M16 19v2"/>'),
  check: s('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  refresh: s('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  close: s('<path d="M18 6 6 18M6 6l12 12"/>'),
  back: s('<path d="m15 18-6-6 6-6"/>'),
  chev: s('<path d="m9 18 6-6-6-6"/>'),
  nav: s('<path d="m3 11 19-9-9 19-2-8-8-2z"/>'),
  ext: s('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  locate: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>'),
  layers: s('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  mountain: s('<path d="m3 20 6-11 4 6 2-3 6 8z"/>'),
  wind: s('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>'),
  thermo: s('<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>'),
  alert: s('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  cone: s('<path d="M9 3h6l4 16H5z"/><path d="M3 21h18M7.5 11h9M6.5 15h11"/>'),
  ban: s('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
  truck: s('<path d="M1 7h12v9H1zM13 10h4l3 3v3h-7z"/><circle cx="5" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>'),
  sign: s('<rect x="2" y="4" width="20" height="11" rx="2"/><path d="M12 15v6M8 21h8"/>'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  bell: s('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
  play: s('<path d="M5 3v18l15-9z"/>'),
};

/** Icon per event kind, used in lists and the route strip. */
export const KIND_ICON = {
  closure: ICON.ban, construction: ICON.cone, incident: ICON.alert,
  restriction: ICON.truck, weather: ICON.wx, event: ICON.info, sign: ICON.sign,
};
export const KIND_LABEL = {
  closure: 'Closure', construction: 'Construction', incident: 'Incident',
  restriction: 'Restriction', weather: 'Weather', event: 'Event', sign: 'Overhead sign',
};
