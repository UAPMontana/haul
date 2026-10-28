// Static content: tow-relevant POIs, deep links, checklist, notices.
// POI coordinates are APPROXIMATE — every one is labelled "verify" in the UI.

export const DEFAULT_ORIGIN = 'Missoula, MT';
export const DEFAULT_DEST = "Coeur d'Alene, ID";
export const DEST_LL = '47.68,-116.78';
export const ORIGIN_LL = '46.87,-114.03';

/** kind: fuel | chain | ramp | port */
export const POIS = [
  { kind: 'fuel', name: 'Town Pump – Superior (exit 47)', note: 'Diesel. Last easy top-off before the pass eastbound/westbound.', lat: 47.19, lon: -114.89 },
  { kind: 'fuel', name: 'St. Regis Travel Center (exit 33)', note: 'Diesel + big lot. Best fuel stop before Lookout.', lat: 47.30, lon: -115.10 },
  { kind: 'info', name: 'Lookout Pass – exit 0', note: 'No services except the ski area. Do not plan fuel here.', lat: 47.456, lon: -115.697 },
  { kind: 'fuel', name: 'Wallace (exit 61/62)', note: 'Fuel in town; tight streets with a trailer.', lat: 47.47, lon: -115.92 },
  { kind: 'fuel', name: 'Kellogg / Smelterville (exit 49)', note: 'Diesel.', lat: 47.54, lon: -116.17 },
  { kind: 'fuel', name: 'Cataldo / Kingston (exit 43)', note: 'Limited services.', lat: 47.55, lon: -116.27 },
  { kind: 'chain', name: 'Lookout Pass WB brake-check area (MT side)', note: '~MP 0–5. Check brakes before the 6% descent into Idaho.', lat: 47.44, lon: -115.66 },
  { kind: 'chain', name: 'EB chain-up / brake check near Mullan (~exit 68)', note: 'Chain-up before climbing to Lookout eastbound.', lat: 47.47, lon: -115.80 },
  { kind: 'chain', name: '4th of July Pass chain-up (east side)', note: 'Chain area when signed.', lat: 47.55, lon: -116.45 },
  { kind: 'chain', name: '4th of July Pass chain-up (west side)', note: 'Chain area when signed.', lat: 47.58, lon: -116.55 },
  { kind: 'ramp', name: 'Runaway truck ramp – EB descent from Lookout (MT side)', note: 'Approximate location toward Taft.', lat: 47.43, lon: -115.62 },
  { kind: 'port', name: 'Haugan / St. Regis port of entry (~MP 16)', note: 'Personal-use pickups with trailers are usually exempt in MT unless commercial (GVWR > 26,000 combined & business use) — follow signage.', lat: 47.38, lon: -115.40 },
  { kind: 'port', name: 'Huetter port of entry (ID)', note: 'West of Coeur d\'Alene — past the destination. Follow signage.', lat: 47.70, lon: -116.86 },
];

export const POI_META = {
  fuel: { label: 'Diesel / fuel', glyph: '⛽' },
  chain: { label: 'Chain-up / brake check', glyph: '⛓' },
  ramp: { label: 'Runaway truck ramp', glyph: '⤴' },
  port: { label: 'Port of entry / weigh', glyph: '⚖' },
  info: { label: 'Info', glyph: 'i' },
};

/** Weather app deep links, all centred on the I-90 corridor. */
export const VENTUSKY = [
  { label: 'Gusts', layer: 'gust' },
  { label: 'Radar', layer: 'radar' },
  { label: 'Snow', layer: 'snow-cover' },
  { label: 'Temp', layer: 'temperature-2m' },
];
export const ventuskyUrl = (layer) => `https://www.ventusky.com/?p=47.25;-115.4;8&l=${layer}`;

export const WX_LINKS = [
  {
    group: 'Weather Underground',
    items: [
      { label: 'WunderMap', url: 'https://www.wunderground.com/wundermap?lat=47.3&lon=-115.4&zoom=8' },
      { label: 'Missoula', url: 'https://www.wunderground.com/forecast/us/mt/missoula' },
      { label: 'Mullan', url: 'https://www.wunderground.com/forecast/us/id/mullan' },
      { label: "Coeur d'Alene", url: "https://www.wunderground.com/forecast/us/id/coeur-d'alene" },
    ],
  },
  {
    group: 'NWS',
    items: [
      { label: 'Lookout Pass forecast', url: 'https://forecast.weather.gov/MapClick.php?lat=47.456&lon=-115.697' },
      { label: 'Missoula forecast', url: 'https://forecast.weather.gov/MapClick.php?lat=46.87&lon=-114.03' },
      { label: "CdA forecast", url: 'https://forecast.weather.gov/MapClick.php?lat=47.68&lon=-116.78' },
      { label: 'Radar KMSX', url: 'https://radar.weather.gov/station/kmsx/standard' },
      { label: 'Radar KOTX', url: 'https://radar.weather.gov/station/kotx/standard' },
    ],
  },
  {
    group: 'Roads & cams',
    items: [
      { label: 'FAA WeatherCams', url: 'https://weathercams.faa.gov/map/-115.4,47.3,8' },
      { label: 'MDT 511', url: 'https://www.511mt.net/#zoom=8&lon=-115.4&lat=47.2' },
      { label: 'Idaho 511', url: 'https://511.idaho.gov/map' },
      { label: 'ITD truckers', url: 'https://511.idaho.gov/' },
    ],
  },
];

export const METAR_URL = 'https://aviationweather.gov/data/metar/?ids=KMSO,KMLP,KCOE&hours=0&format=decoded';

/* ------------------------------------------------------------- checklist */
export const CHECKLIST = [
  { group: 'Hitch & coupling', items: [
    ['hc-torque', 'Ball & coupler torqued / latched'],
    ['hc-pin', 'Hitch pin & clip in'],
    ['hc-chains', 'Safety chains crossed, slack right'],
    ['hc-breakaway', 'Breakaway cable attached + switch tested'],
    ['hc-jaws', 'WDH bars / 5th-wheel jaws locked'],
  ] },
  { group: 'Brakes', items: [
    ['br-gain', 'Brake controller gain set for ~10,000 lb loaded'],
    ['br-manual', 'Manual brake test at walking speed'],
    ['br-fluid', 'Trailer brake fluid / magnets OK'],
  ] },
  { group: 'Tires', items: [
    ['ti-truck', 'Truck rear at door-placard towing PSI'],
    ['ti-trailer', 'Trailer tires at max cold PSI'],
    ['ti-lugs', 'Lug nuts torqued (truck + trailer)'],
    ['ti-spare', 'Spare + jack + lug wrench'],
  ] },
  { group: 'Lights', items: [
    ['li-all', 'Running / brake / turn / marker lights'],
    ['li-7pin', '7-pin plug clean & seated'],
  ] },
  { group: 'Load', items: [
    ['lo-6040', '60/40 load split, tongue weight 10–15% (1,000–1,500 lb)'],
    ['lo-secure', 'Cargo secured'],
    ['lo-gcwr', 'GCWR checked vs 2019 F-250 6.7 rating'],
    ['lo-def', 'DEF level'],
    ['lo-fuel', 'Fuel full before Lookout Pass'],
  ] },
  { group: 'Winter kit', items: [
    ['wk-chains', 'Chains for truck drive axle (Idaho requires when signed)'],
    ['wk-tchains', 'Trailer chains if brake-axle chains signed'],
    ['wk-gloves', 'Gloves + headlamp'],
    ['wk-shovel', 'Shovel + sand'],
    ['wk-blankets', 'Blankets, water, food'],
  ] },
  { group: 'Docs', items: [
    ['do-reg', 'Registration — truck & trailer'],
    ['do-ins', 'Insurance card'],
    ['do-tags', 'Trailer plate tags current'],
    ['do-id', 'Driver\'s license / ID'],
  ] },
];

/* --------------------------------------------------------------- notices */
export const NOTICES = [
  { tone: 'wait', title: 'Lookout Pass · I-90 MP 0 MT / ID exit 0 · ~4,710 ft',
    body: '~6% grades both sides. Westbound (into Idaho) the descent runs ~6% for 5–7 mi toward Mullan. Exhaust brake on, Tow/Haul, gear down, 45 mph max with the load. Use the brake-check pull-offs.' },
  { tone: 'caution', title: '4th of July Pass · ~3,081 ft · exits 28–34',
    body: '~5–6% grades and frequent black ice. Construction near I-90 MM 39–41 (see live events below).' },
  { tone: 'info', title: 'Time zone change',
    body: 'The Idaho panhandle is Pacific time. Clocks go back 1 hour at the MT/ID line (Lookout Pass).' },
  { tone: 'info', title: 'Speed limits',
    body: 'Montana I-90: 80 mph cars, 70 mph trucks. Idaho I-90: 75 mph, 65 mph for trucks over 26,000 lb. These are posted limits — tow at 55–65.' },
  { tone: 'caution', title: 'Chains',
    body: 'Idaho can mandate chains/traction devices on I-90 at Lookout and 4th of July; vehicles towing generally must chain when posted. Montana rarely posts chain requirements on I-90 but "chains required" signs are possible on passes — carry them.' },
  { tone: 'caution', title: 'Wind',
    body: 'Clark Fork valley (Alberton–Superior) and 4th of July Pass run gusty. High-profile trailer: 35+ mph gusts = consider waiting.' },
  { tone: 'info', title: 'Wildlife',
    body: 'Deer and elk at dusk and dawn, especially Alberton Gorge and St. Regis. Watch for wildlife throughout the corridor.' },
  { tone: 'info', title: 'Cell coverage',
    body: 'Gaps between Superior and Mullan. Download the offline Google Maps area before leaving.' },
  { tone: 'info', title: 'Fuel',
    body: 'No services at the Lookout Pass summit. Top off in St. Regis or Superior.' },
];
