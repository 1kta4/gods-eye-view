/**
 * Pure (Cesium-free) records for the Bosnia river-gauge layer. Shared by the
 * /api/ba/rivers proxy (server) and the layer (browser), and unit-tested.
 *
 * Sources:
 *  - Agencija za vodno područje rijeke Save (vodostaji.voda.ba, KISTERS WISKI
 *    web public): water level layer 10, flow layer 20. Threshold classes come
 *    from the app's own config/classification.json:
 *      #MIN#  Normalno stanje (N)            normal
 *      #TH1#  Pripremno stanje (P)           preparedness
 *      #TH2#  Izlijevanje iz korita (R)      out of banks — regular defence
 *      #TH3#  Poplave (V)                    flooding — emergency defence
 *      #TH4#  Značajne poplave (Z)           major flooding
 *    Values older than 6 h are shown grey ("Podaci stariji od šest sati").
 *  - FHMZ BiH hydrology page (12 stations incl. Neretva and Miljacka), with
 *    the "continuous public/civil-protection notification" level per station.
 *  - RHMZ Republike Srpske automatic stations feed (HidroPodaci.json).
 */
import { zonedTimeToUtc } from '../earthquakes/records.js';

export const STALE_AFTER_MS = 6 * 3_600_000;
export const MANUAL_STALE_AFTER_MS = 30 * 3_600_000;
export const VERY_STALE_AFTER_MS = 48 * 3_600_000;

/** Unified severity scale used for colour, size and labels. */
export const SEVERITY = Object.freeze({
  NO_DATA: -1,
  NO_THRESHOLDS: 0,
  NORMAL: 1,
  PREPAREDNESS: 2,
  REGULAR_DEFENCE: 3,
  EMERGENCY_DEFENCE: 4,
  MAJOR_FLOOD: 5,
});

export const SEVERITY_COLORS = Object.freeze({
  [-1]: '#8e8e93',
  0: '#64d2ff',
  1: '#34c759',
  2: '#ffd60a',
  3: '#ff9f0a',
  4: '#ff3b30',
  5: '#d0006f',
});

/** voda.ba water-level classes (from the app's classification.json). */
export const WATERLEVEL_CLASSES = Object.freeze({
  '#<MIN#': { severity: 1, label: 'Below normal — low water' },
  '#MIN#': { severity: 1, label: 'Normal (Normalno stanje)' },
  '#TH1#': { severity: 2, label: 'Preparedness (Pripremno stanje)' },
  '#TH2#': {
    severity: 3,
    label: 'Out of banks — regular defence (Izlijevanje iz korita)',
  },
  '#TH3#': { severity: 4, label: 'Flooding — emergency defence (Poplave)' },
  '#TH4#': { severity: 5, label: 'Major flooding (Značajne poplave)' },
});

/** voda.ba flow classes (return-period discharges). */
export const FLOW_CLASSES = Object.freeze({
  '#<MIN#': { severity: 1, label: 'Below normal flow' },
  '#MIN#': { severity: 1, label: 'Normal flow' },
  '#RP20#': { severity: 2, label: 'Flow ≥ 1-in-20-year flood (Q PP 1/20)' },
  '#RP50#': { severity: 3, label: 'Flow ≥ 1-in-50-year flood (Q PP 1/50)' },
  '#RP100#': { severity: 4, label: 'Flow ≥ 1-in-100-year flood (Q PP 1/100)' },
});

const VODA_BASE = 'https://vodostaji.voda.ba/data/internet';
export const VODA_URLS = Object.freeze({
  level: `${VODA_BASE}/layers/10/index.json`,
  flow: `${VODA_BASE}/layers/20/index.json`,
});
export const FHMZ_HYDRO_URL =
  'https://www.fhmzbih.gov.ba/latinica/HIDRO/index.php';
export const RHMZ_HYDRO_URL =
  'https://www.rhmzrs.com/data/feeds/HidroPodaci.json';

const text = (value, max = 80) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const out = String(value)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
  return out || null;
};
const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return Number.isFinite(n) ? n : null;
};
const validLatLon = (lat, lon) =>
  lat !== null &&
  lon !== null &&
  lat > 41 &&
  lat < 46.5 &&
  lon > 14.5 &&
  lon < 21;
const SAFE_ID = /^[A-Za-z0-9_-]{1,16}$/;

/** voda.ba 7-day graph for one station/parameter (a real per-station page). */
export function vodaGraphUrl(siteNo, stationNo, param = 'H') {
  if (!SAFE_ID.test(String(siteNo)) || !SAFE_ID.test(String(stationNo)))
    return null;
  const p = param === 'Q' ? 'Q' : 'H';
  return `${VODA_BASE}/stations/${siteNo}/${stationNo}/${p}/large_${p.toLowerCase()}_week.png`;
}

/** voda.ba 7-day series JSON (used for the trend). */
export function vodaWeekUrl(siteNo, stationNo) {
  if (!SAFE_ID.test(String(siteNo)) || !SAFE_ID.test(String(stationNo)))
    return null;
  return `${VODA_BASE}/stations/${siteNo}/${stationNo}/H/week.json`;
}

/** "HS Ljubnići" → "Ljubnići"; pumping stations keep their "CS" prefix. */
export function cleanStationName(name) {
  const raw = text(name);
  if (!raw) return null;
  return raw.replace(/^HS\s+/, '').replace(/\s+/g, ' ');
}

/**
 * Normalise the voda.ba water-level (layer 10) and flow (layer 20) arrays.
 * @returns {Array<object>|null} null when the level payload is not an array.
 */
export function normalizeVodaStations(levelLayer, flowLayer = []) {
  if (!Array.isArray(levelLayer)) return null;
  const flows = new Map();
  for (const row of Array.isArray(flowLayer) ? flowLayer : []) {
    const no = text(row?.metadata_station_no, 16);
    if (no) flows.set(no, row);
  }
  const out = [];
  const seen = new Set();
  for (const row of levelLayer) {
    const stationNo = text(row?.metadata_station_no, 16);
    const siteNo = text(row?.metadata_site_no, 16);
    const lat = finite(row?.metadata_station_latitude);
    const lon = finite(row?.metadata_station_longitude);
    if (!stationNo || !SAFE_ID.test(stationNo) || seen.has(stationNo)) continue;
    if (!validLatLon(lat, lon)) continue;
    seen.add(stationNo);
    const levelTime = Date.parse(row.L1_timestamp);
    const flow = flows.get(stationNo);
    const flowTime = Date.parse(flow?.L1_timestamp);
    const levelClass = text(row.L1_web_waterlevel_class, 12);
    const flowClass = text(flow?.L1_web_flow_class, 12);
    out.push({
      id: `voda:${stationNo}`,
      source: 'voda.ba',
      agency: 'Agencija za vodno područje rijeke Save',
      name:
        cleanStationName(row.metadata_station_name) || `Station ${stationNo}`,
      river: text(row.metadata_river_name) || text(row.metadata_WTO_OBJECT),
      catchment: text(row.metadata_catchment_name),
      lat,
      lon,
      levelCm: finite(row.L1_ts_value),
      levelTime: Number.isFinite(levelTime) ? levelTime : null,
      levelClass:
        levelClass && WATERLEVEL_CLASSES[levelClass] ? levelClass : null,
      flowM3s: finite(flow?.L1_ts_value),
      flowTime: Number.isFinite(flowTime) ? flowTime : null,
      flowClass: flowClass && FLOW_CLASSES[flowClass] ? flowClass : null,
      thresholdCm: null,
      thresholdLabel: null,
      trend: null,
      siteNo: siteNo && SAFE_ID.test(siteNo) ? siteNo : null,
      stationNo,
      link:
        vodaGraphUrl(siteNo, stationNo, 'H') || 'https://vodostaji.voda.ba/',
    });
  }
  return out;
}

/**
 * FHMZ hydrology stations. Coordinates are those FHMZ itself publishes in the
 * page's map comment block; detail pages are FHMZ's per-station pages.
 */
export const FHMZ_STATIONS = Object.freeze([
  {
    key: 'bihac',
    match: /^bihać|^bihac/i,
    name: 'Bihać',
    river: 'Una',
    lat: 44.81367,
    lon: 15.87508,
    page: 'hvsBihac.php',
    manual: true,
  },
  {
    key: 'mbrod',
    match: /^martin\s*brod/i,
    name: 'Martin Brod',
    river: 'Una',
    lat: 44.48052,
    lon: 16.14071,
    page: 'hvsMBrod.php',
  },
  {
    key: 'smost',
    match: /^sanski\s*most/i,
    name: 'Sanski Most',
    river: 'Sana',
    lat: 44.76649,
    lon: 16.6702,
    page: 'hvsSMost.php',
    manual: true,
  },
  {
    key: 'vrhpolje',
    match: /^vrhpolje/i,
    name: 'Vrhpolje',
    river: 'Sana',
    lat: 44.68999,
    lon: 16.7357,
    page: 'hvsVrhpolje.php',
  },
  {
    key: 'sarajevo',
    match: /^sarajevo/i,
    name: 'Sarajevo (Ćumurija)',
    river: 'Miljacka',
    lat: 43.85722,
    lon: 18.42672,
    page: 'hvsCumurija.php',
  },
  {
    key: 'reljevo',
    match: /^reljevo/i,
    name: 'Reljevo',
    river: 'Bosna',
    lat: 43.88669,
    lon: 18.31826,
    page: 'hvsReljevo.php',
  },
  {
    key: 'zenica',
    match: /^zenica/i,
    name: 'Zenica',
    river: 'Bosna',
    lat: 44.20795,
    lon: 17.90702,
    page: 'hvsZenica.php',
  },
  {
    key: 'kiseljak',
    match: /^kiselj/i,
    name: 'Kiseljak',
    river: 'Lepenica',
    lat: 43.94306,
    lon: 18.08198,
    page: 'hvsKiseljak.php',
  },
  {
    key: 'hbila',
    match: /^han\s*bila/i,
    name: 'Han Bila',
    river: 'Bila',
    lat: 44.18195,
    lon: 17.76615,
    page: 'hvsHBila.php',
  },
  {
    key: 'tuzla',
    match: /^tuzla/i,
    name: 'Tuzla',
    river: 'Jala',
    lat: 44.5393,
    lon: 18.66469,
    page: 'hvsTuzla.php',
  },
  {
    key: 'kasici',
    match: /^kaši|^kasi/i,
    name: 'Kašići',
    river: 'Neretva',
    lat: 43.53354,
    lon: 18.07264,
    page: 'hvsKasici.php',
  },
  {
    key: 'konjic',
    match: /^konjic/i,
    name: 'Konjic',
    river: 'Neretva',
    lat: 43.64218,
    lon: 17.96164,
    page: 'hvsKonjic.php',
  },
]);

const stripTags = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

function parseLocal(dateText, timeText) {
  const d = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(dateText ?? ''));
  const t = /(\d{1,2})[:.](\d{2})/.exec(String(timeText ?? ''));
  if (!d || !t) return null;
  const ms = zonedTimeToUtc(+d[3], +d[2], +d[1], +t[1], +t[2]);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Parse the FHMZ "aktuelni vodostaji" table. Station rows have: [river (only
 * on the first row of a rowspan group)], station, date, time, level, trend
 * image, notification level.
 * @param {string} html Decoded page text.
 * @returns {Array<object>}
 */
export function parseFhmzHydro(html) {
  const out = [];
  const seen = new Set();
  const rows = String(html ?? '').matchAll(
    /<tr[^>]*>([\s\S]{0,3000}?)<\/tr>/gi,
  );
  for (const row of rows) {
    const cellsRaw = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (c) => c[1],
    );
    if (cellsRaw.length < 6) continue;
    // Find the date cell; the station is the cell before it.
    const dateIdx = cellsRaw.findIndex((c) =>
      /^\s*\d{1,2}\.\d{1,2}\.\d{4}\s*$/.test(stripTags(c)),
    );
    if (dateIdx < 1 || cellsRaw.length < dateIdx + 4) continue;
    const stationName = stripTags(cellsRaw[dateIdx - 1]);
    const station = FHMZ_STATIONS.find((s) => s.match.test(stationName));
    if (!station || seen.has(station.key)) continue;
    seen.add(station.key);
    const levelCm = finite(stripTags(cellsRaw[dateIdx + 2]));
    const trendImg = /([A-Za-z0-9]+)\.png/i.exec(
      cellsRaw[dateIdx + 3] || '',
    )?.[1];
    const trend = /^R/i.test(trendImg || '')
      ? 'rising'
      : /^O/i.test(trendImg || '')
        ? 'falling'
        : /^S/i.test(trendImg || '')
          ? 'steady'
          : null;
    const threshold = finite(stripTags(cellsRaw[dateIdx + 4] || ''));
    out.push({
      id: `fhmz:${station.key}`,
      source: 'FHMZ',
      agency: 'Federalni hidrometeorološki zavod',
      name: station.name,
      river: station.river,
      catchment: null,
      lat: station.lat,
      lon: station.lon,
      levelCm,
      levelTime: parseLocal(
        stripTags(cellsRaw[dateIdx]),
        stripTags(cellsRaw[dateIdx + 1]),
      ),
      levelClass: null,
      flowM3s: null,
      flowTime: null,
      flowClass: null,
      thresholdCm: threshold,
      thresholdLabel:
        threshold !== null
          ? 'Public & civil-protection notification level'
          : null,
      trend,
      // Bihać and Sanski Most are read manually once a day.
      staleAfterMs: station.manual ? MANUAL_STALE_AFTER_MS : STALE_AFTER_MS,
      link: `https://www.fhmzbih.gov.ba/latinica/HIDRO/${station.page}`,
    });
  }
  return out;
}

const CYR = {
  А: 'A',
  Б: 'B',
  В: 'V',
  Г: 'G',
  Д: 'D',
  Ђ: 'Đ',
  Е: 'E',
  Ж: 'Ž',
  З: 'Z',
  И: 'I',
  Ј: 'J',
  К: 'K',
  Л: 'L',
  Љ: 'Lj',
  М: 'M',
  Н: 'N',
  Њ: 'Nj',
  О: 'O',
  П: 'P',
  Р: 'R',
  С: 'S',
  Т: 'T',
  Ћ: 'Ć',
  У: 'U',
  Ф: 'F',
  Х: 'H',
  Ц: 'C',
  Ч: 'Č',
  Џ: 'Dž',
  Ш: 'Š',
};
/** Serbian Cyrillic → Latin (Gaj) transliteration. */
export function transliterateSerbian(value) {
  return String(value ?? '').replace(/[Ѐ-ӿ]/g, (ch) => {
    const upper = CYR[ch];
    if (upper) return upper;
    const lower = CYR[ch.toUpperCase()];
    return lower ? lower.toLowerCase() : ch;
  });
}

/**
 * Normalise the RHMZ RS feed: [{Вријеме, Станица (<a href> "Name - River"),
 * Водостај, Температура Воде, Проток, Lat, Lon}]. Missing values are "-"/"*".
 * @returns {Array<object>|null}
 */
export function normalizeRhmzStations(payload) {
  if (!Array.isArray(payload)) return null;
  const out = [];
  const seen = new Set();
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue;
    const html = String(row['Станица'] ?? '');
    const label = transliterateSerbian(stripTags(html));
    const [namePart, riverPart] = label.split(/\s+-\s+/);
    const name = text(namePart);
    const lat = finite(row.Lat);
    const lon = finite(row.Lon);
    if (!name || !validLatLon(lat, lon)) continue;
    const id = `rhmz:${[name, riverPart]
      .filter(Boolean)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9čćđšž]+/g, '-')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let link = 'https://www.rhmzrs.com/page/hidrologija-mapa-stanica';
    const href = /href="([^"]{1,200})"/.exec(html)?.[1];
    try {
      const url = new URL(href);
      if (
        url.protocol === 'https:' &&
        url.hostname === 'hidrologija.rhmzrs.com' &&
        /^\/[A-Za-z0-9_/.-]+\.php$/.test(url.pathname)
      )
        link = `https://hidrologija.rhmzrs.com${url.pathname}`;
    } catch {
      /* keep the map page */
    }
    const timeRaw = String(row['Вријеме'] ?? '');
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(timeRaw);
    const levelTime = m
      ? zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5])
      : null;
    out.push({
      id,
      source: 'RHMZ RS',
      agency: 'Republički hidrometeorološki zavod Republike Srpske',
      name,
      river: text(riverPart),
      catchment: null,
      lat,
      lon,
      levelCm: finite(row['Водостај']),
      levelTime: Number.isFinite(levelTime) ? levelTime : null,
      levelClass: null,
      flowM3s: finite(row['Проток']),
      flowTime: Number.isFinite(levelTime) ? levelTime : null,
      flowClass: null,
      waterTempC: finite(row['Температура Воде']),
      thresholdCm: null,
      thresholdLabel: null,
      trend: null,
      link,
    });
  }
  return out;
}

/**
 * Trend from a voda.ba week.json series: compares the latest value with the
 * value ~3 h earlier. ±2 cm counts as steady.
 * @returns {{trend:'rising'|'falling'|'steady', deltaCm:number, hours:number}|null}
 */
export function trendFromSeries(payload) {
  const series = Array.isArray(payload) ? payload[0] : payload;
  const data = Array.isArray(series?.data) ? series.data : null;
  if (!data) return null;
  const points = [];
  for (const point of data) {
    const t = Date.parse(point?.[0]);
    const v = finite(point?.[1]);
    if (Number.isFinite(t) && v !== null) points.push([t, v]);
  }
  if (points.length < 2) return null;
  points.sort((a, b) => a[0] - b[0]);
  const [lastT, lastV] = points[points.length - 1];
  let ref = points[0];
  for (const point of points)
    if (point[0] <= lastT - 3 * 3_600_000) ref = point;
  const hours = Math.max(1, Math.round((lastT - ref[0]) / 3_600_000));
  const delta = Math.round((lastV - ref[1]) * 10) / 10;
  return {
    trend: delta > 2 ? 'rising' : delta < -2 ? 'falling' : 'steady',
    deltaCm: delta,
    hours,
  };
}

/** Validate the proxy payload before it replaces the displayed snapshot. */
export function normalizeRiverSnapshot(payload) {
  if (!payload || !Array.isArray(payload.stations)) return null;
  const out = [];
  for (const s of payload.stations) {
    const lat = finite(s?.lat);
    const lon = finite(s?.lon);
    const id = text(s?.id, 64);
    if (!id || !validLatLon(lat, lon)) continue;
    out.push({
      id,
      source: text(s.source, 16),
      agency: text(s.agency, 100),
      name: text(s.name) || id,
      river: text(s.river),
      catchment: text(s.catchment),
      lat,
      lon,
      levelCm: finite(s.levelCm),
      levelTime: finite(s.levelTime),
      levelClass: WATERLEVEL_CLASSES[s.levelClass] ? s.levelClass : null,
      flowM3s: finite(s.flowM3s),
      flowTime: finite(s.flowTime),
      flowClass: FLOW_CLASSES[s.flowClass] ? s.flowClass : null,
      waterTempC: finite(s.waterTempC),
      thresholdCm: finite(s.thresholdCm),
      thresholdLabel: text(s.thresholdLabel, 80),
      trend: ['rising', 'falling', 'steady'].includes(s.trend) ? s.trend : null,
      staleAfterMs:
        finite(s.staleAfterMs) !== null
          ? Math.min(
              Math.max(finite(s.staleAfterMs), 3_600_000),
              VERY_STALE_AFTER_MS,
            )
          : STALE_AFTER_MS,
      siteNo: SAFE_ID.test(String(s.siteNo ?? '')) ? String(s.siteNo) : null,
      stationNo: SAFE_ID.test(String(s.stationNo ?? ''))
        ? String(s.stationNo)
        : null,
      link: /^https:\/\/(vodostaji\.voda\.ba|www\.fhmzbih\.gov\.ba|hidrologija\.rhmzrs\.com|www\.rhmzrs\.com)\//.test(
        String(s.link ?? ''),
      )
        ? String(s.link)
        : null,
    });
  }
  return out;
}

/**
 * Classify one station at `nowMs`.
 * @returns {{severity:number,label:string,stale:boolean,alert:boolean,color:string}}
 */
export function classifyStation(station, nowMs = Date.now()) {
  const t = station.levelTime ?? station.flowTime;
  const hasValue = station.levelCm !== null || station.flowM3s !== null;
  const age = Number.isFinite(t) ? nowMs - t : Infinity;
  const done = (severity, label, stale = false) => ({
    severity,
    label,
    stale,
    alert: severity >= SEVERITY.PREPAREDNESS,
    color: SEVERITY_COLORS[severity],
  });
  const staleAfter = Number.isFinite(station.staleAfterMs)
    ? station.staleAfterMs
    : STALE_AFTER_MS;
  if (!hasValue || age > staleAfter) {
    const label = !hasValue
      ? 'No current reading'
      : age > VERY_STALE_AFTER_MS
        ? 'No data for over 2 days'
        : `Data older than ${Math.round(staleAfter / 3_600_000)} hours`;
    return done(SEVERITY.NO_DATA, label, true);
  }
  let severity = SEVERITY.NO_THRESHOLDS;
  let label = 'No published warning thresholds';
  const level = WATERLEVEL_CLASSES[station.levelClass];
  if (level) ({ severity, label } = level);
  const flow = FLOW_CLASSES[station.flowClass];
  if (
    flow &&
    flow.severity > severity &&
    Number.isFinite(station.flowTime) &&
    nowMs - station.flowTime <= staleAfter
  )
    ({ severity, label } = flow);
  if (station.thresholdCm !== null && station.levelCm !== null) {
    if (station.levelCm >= station.thresholdCm) {
      severity = Math.max(severity, SEVERITY.PREPAREDNESS);
      label = `Above notification level (${station.thresholdCm} cm)`;
    } else if (severity < SEVERITY.NORMAL) {
      severity = SEVERITY.NORMAL;
      label = `Normal (notification level ${station.thresholdCm} cm)`;
    }
  }
  return done(severity, label);
}

const TREND_ARROW = { rising: '▲', falling: '▼', steady: '▶' };
export const trendArrow = (trend) => TREND_ARROW[trend] || '';

/** Short ambient label text: "Bosna 312 cm ▲". */
export function stationLabelText(station) {
  const level =
    station.levelCm !== null ? `${Math.round(station.levelCm)} cm` : '';
  return [station.river || station.name, level, trendArrow(station.trend)]
    .filter(Boolean)
    .join(' ');
}

function formatTime(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sarajevo',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

/** Card model {title, details[]} for one station. */
export function buildStationCard(
  station,
  nowMs = Date.now(),
  trendInfo = null,
) {
  const status = classifyStation(station, nowMs);
  const details = [];
  details.push(
    [
      station.river,
      station.catchment && station.catchment !== station.river
        ? `${station.catchment} basin`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'River gauge',
  );
  const parts = [];
  if (station.levelCm !== null) parts.push(`Level ${station.levelCm} cm`);
  if (station.flowM3s !== null) parts.push(`Flow ${station.flowM3s} m³/s`);
  if (Number.isFinite(station.waterTempC))
    parts.push(`${station.waterTempC} °C`);
  details.push(parts.join(' · ') || 'No current value');
  details.push(
    `${formatTime(station.levelTime ?? station.flowTime)} (Sarajevo)`,
  );
  details.push(`Status: ${status.label}`);
  const trend = trendInfo || (station.trend ? { trend: station.trend } : null);
  if (trend?.trend) {
    const delta = Number.isFinite(trend.deltaCm)
      ? ` (${trend.deltaCm > 0 ? '+' : ''}${trend.deltaCm} cm / ${trend.hours} h)`
      : '';
    details.push(`Trend: ${trend.trend} ${trendArrow(trend.trend)}${delta}`);
  }
  if (station.thresholdCm !== null)
    details.push(`Notification level ${station.thresholdCm} cm`);
  details.push(
    `Source: ${station.source}${station.link ? ' · click card ↗' : ''}`,
  );
  return { title: station.name, details, status };
}
