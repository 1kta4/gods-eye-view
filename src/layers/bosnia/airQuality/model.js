/**
 * Pure air-quality model for the Bosnia layer: European AQI bands, and the
 * normalisers for every upstream (FHMZ hourly HTML table, RHMZ RS JSON feed,
 * Sensor.Community, optional WAQI). Shared by the Vite proxy
 * (server/providers/bosnia/air.js) and the browser layer; no DOM, no Cesium.
 */

/** European Air Quality Index bands (EEA, 2021 revision), level 1..6. */
export const EAQI_BANDS = Object.freeze([
  { level: 1, key: 'good', label: 'Good', local: 'Odličan', color: '#50F0E6' },
  { level: 2, key: 'fair', label: 'Fair', local: 'Dobar', color: '#50CCAA' },
  {
    level: 3,
    key: 'moderate',
    label: 'Moderate',
    local: 'Umjeren',
    color: '#F0E641',
  },
  { level: 4, key: 'poor', label: 'Poor', local: 'Zagađen', color: '#FF5050' },
  {
    level: 5,
    key: 'very-poor',
    label: 'Very poor',
    local: 'Vrlo zagađen',
    color: '#960032',
  },
  {
    level: 6,
    key: 'extremely-poor',
    label: 'Extremely poor',
    local: 'Izuzetno zagađen',
    color: '#7D2181',
  },
]);

export const NO_DATA_COLOR = '#9AA0A6';

/**
 * Upper bounds (µg/m³) of bands 1..5 per pollutant; above the last is band 6.
 * Same table FHMZ and RHMZ RS publish with their index.
 */
export const EAQI_BREAKPOINTS = Object.freeze({
  pm25: [10, 20, 25, 50, 75],
  pm10: [20, 40, 50, 100, 150],
  no2: [40, 90, 120, 230, 340],
  o3: [50, 100, 130, 240, 380],
  so2: [100, 200, 350, 500, 750],
});

export const POLLUTANT_LABELS = Object.freeze({
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
  o3: 'O₃',
  so2: 'SO₂',
  co: 'CO',
  h2s: 'H₂S',
});

export const SOURCE_LABELS = Object.freeze({
  fhmz: 'FHMZ (official, FBiH)',
  rhmzrs: 'RHMZ RS (official, RS)',
  'sensor.community': 'Sensor.Community (citizen)',
  waqi: 'WAQI (aggregated)',
});

/** @returns {object|null} The band for a level 1..6. */
export function eaqiBand(level) {
  return EAQI_BANDS.find((band) => band.level === level) || null;
}

/** European AQI level (1..6) for one pollutant concentration, or null. */
export function eaqiLevelFor(pollutant, value) {
  const bounds = EAQI_BREAKPOINTS[pollutant];
  if (!bounds || !Number.isFinite(value) || value < 0) return null;
  for (let i = 0; i < bounds.length; i++) if (value < bounds[i]) return i + 1;
  return 6;
}

/** Worst per-pollutant level over the values we can grade. */
export function eaqiOverall(pollutants = {}) {
  let worst = null;
  for (const key of Object.keys(EAQI_BREAKPOINTS)) {
    const level = eaqiLevelFor(key, pollutants[key]);
    if (level && (!worst || level > worst)) worst = level;
  }
  return worst;
}

function finiteOrNull(value, max = 100000) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function level16(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
}

function cleanText(value, max = 80) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function validCoord(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/** Inside a generous BiH bounding box (keeps neighbours' sensors out). */
export function inBosniaBox(lat, lon) {
  return lat >= 42.5 && lat <= 45.3 && lon >= 15.7 && lon <= 19.7;
}

/**
 * Convert a Europe/Sarajevo wall-clock time to an ISO instant (handles
 * CET/CEST without a tz database: probe the offset Intl reports).
 */
export function sarajevoLocalToIso(year, month, day, hour, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (instant) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sarajevo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
    );
    return asUtc - instant;
  };
  let instant = guess - offsetAt(guess);
  instant = guess - offsetAt(instant);
  return new Date(instant).toISOString();
}

// ---------------------------------------------------------------- FHMZ ---

const FHMZ_LETTER_LEVEL = Object.freeze({
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
});
const FHMZ_PAIRS = ['so2', 'no2', 'o3', 'pm10', 'pm25'];

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function cellText(html) {
  return cleanText(decodeEntities(String(html).replace(/<[^>]*>/g, ' ')));
}

function cellLevel(html) {
  const match = /index\/([a-g])\.png/i.exec(html);
  if (!match) return null;
  return FHMZ_LETTER_LEVEL[match[1].toLowerCase()] ?? null;
}

/**
 * Parse the FHMZ hourly AQI table (https://www.fhmzbih.gov.ba/latinica/ZRAK/AQI-satne.php).
 * Values are µg/m³. Each pollutant pair is a value cell then an index image
 * cell; a missing pollutant is one `colspan="2"` cell. CO and H₂S are single
 * value cells. The station is keyed by its `ams*.php` detail page.
 * @param {string} html Page HTML.
 * @param {Record<string, {city:string,name:string,lat:number,lon:number,approximate?:boolean}>} stationTable
 * @returns {{observedAt:string|null, stations:object[], unknown:string[]}}
 */
export function parseFhmzTable(html, stationTable = {}) {
  if (typeof html !== 'string') throw new Error('fhmz_invalid');
  const stamp =
    /SATNE VRIJEDNOSTI[\s\S]{0,200}?(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*-\s*(\d{1,2})\s*<sup>\s*h/i.exec(
      html,
    ) ||
    /(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*(?:u|-)\s*(\d{1,2})\s*h/i.exec(html);
  let observedAt = null;
  if (stamp) {
    const [day, month, year, hour] = stamp.slice(1).map(Number);
    if (
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12 &&
      hour >= 0 &&
      hour <= 24
    )
      observedAt = sarajevoLocalToIso(year, month, day, hour);
  }
  const stations = [];
  const unknown = [];
  const seen = new Set();
  const rows = html.split(/<tr\b/i).slice(1);
  for (const rowHtml of rows) {
    const row = rowHtml.split(/<\/tr\s*>/i)[0];
    if (!/class="[^"]*\bIKZ\b/i.test(row)) continue;
    const link = /href="(ams[A-Za-z0-9]+)\.php"/.exec(row);
    if (!link) continue;
    const key = link[1];
    if (seen.has(key)) continue;
    seen.add(key);
    const cells = [];
    let afterLink = false;
    // Split on cell openings rather than matching `<td>…</td>` pairs: the
    // upstream table sometimes leaves a cell unclosed.
    for (const piece of row.split(/<td\b/i).slice(1)) {
      const close = piece.indexOf('>');
      if (close < 0) continue;
      const attrs = piece.slice(0, close);
      const inner = piece.slice(close + 1).split(/<\/td\s*>/i)[0];
      if (!afterLink) {
        if (/href="ams/.test(inner)) afterLink = true;
        continue;
      }
      const span = Math.min(
        4,
        Math.max(1, Number(/colspan="?(\d+)/i.exec(attrs)?.[1]) || 1),
      );
      for (let i = 0; i < span; i++) cells.push(i === 0 ? inner : '&nbsp;');
    }
    if (cells.length < 11) continue;
    const pollutants = {};
    const levels = {};
    FHMZ_PAIRS.forEach((pollutant, index) => {
      const value = finiteOrNull(cellText(cells[1 + index * 2]), 50000);
      const level = cellLevel(cells[2 + index * 2] || '');
      if (value !== null) pollutants[pollutant] = value;
      if (level) levels[pollutant] = level;
    });
    const co = finiteOrNull(cellText(cells[11] || ''), 100000);
    const h2s = finiteOrNull(cellText(cells[12] || ''), 10000);
    if (co !== null) pollutants.co = co; // µg/m³ on the FHMZ table
    if (h2s !== null) pollutants.h2s = h2s;
    const meta = stationTable[key];
    if (!meta || !validCoord(meta.lat, meta.lon)) {
      unknown.push(key);
      continue;
    }
    const reported = cellLevel(cells[0]);
    stations.push({
      id: `fhmz:${key}`,
      source: 'fhmz',
      official: true,
      name:
        meta.name && meta.name !== meta.city
          ? `${meta.city} — ${meta.name}`
          : meta.city,
      lat: meta.lat,
      lon: meta.lon,
      approximate: meta.approximate === true,
      level: reported ?? eaqiOverall(pollutants),
      levelSource: reported ? 'reported' : 'computed',
      levels,
      pollutants,
      coUnit: 'µg/m³',
      observedAt,
    });
  }
  return { observedAt, stations, unknown };
}

// -------------------------------------------------------------- RHMZ RS ---

/** dd.mm.yyyy hh:mm:ss in Europe/Sarajevo → ISO, or null. */
function parseRsTime(text) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})/.exec(String(text));
  if (!m) return null;
  const [day, month, year, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 24) return null;
  return sarajevoLocalToIso(year, month, day, hour, minute);
}

/** Latin display names for the RHMZ RS feed keys (feed names are Cyrillic). */
const RS_NAMES = Object.freeze({
  Banjaluka: 'Banja Luka',
  Brod: 'Brod',
  Gacko: 'Gacko',
  Doboj: 'Doboj',
  Prijedor: 'Prijedor',
  Trebinje: 'Trebinje',
  Bijeljina: 'Bijeljina',
  Ugljevik: 'Ugljevik',
  Zvornik: 'Zvornik',
});

/**
 * Parse RHMZ RS https://www.rhmzrs.com/data/feeds/EkoPodaci.json
 * (`trenutni` = hourly values µg/m³, CO mg/m³; `indeks` = [value, level]).
 */
export function parseRhmzRs(payload) {
  const current = payload?.trenutni;
  if (!current || typeof current !== 'object' || Array.isArray(current))
    throw new Error('rhmzrs_invalid');
  const index =
    payload.indeks && typeof payload.indeks === 'object' ? payload.indeks : {};
  const stations = [];
  for (const [key, raw] of Object.entries(current).slice(0, 64)) {
    if (!raw || typeof raw !== 'object') continue;
    const lat = Number(raw.Lat);
    const lon = Number(raw.Lon);
    if (!validCoord(lat, lon) || !inBosniaBox(lat, lon)) continue;
    const safeKey = cleanText(key, 40).replace(/[^A-Za-z0-9_-]/g, '');
    if (!safeKey) continue;
    const pollutants = {};
    const map = {
      pm25: raw['PM2.5'],
      pm10: raw.PM10,
      no2: raw.NO2,
      o3: raw.O3,
      so2: raw.SO2,
      h2s: raw.H2S,
    };
    for (const [name, value] of Object.entries(map)) {
      const n = finiteOrNull(value, 50000);
      if (n !== null) pollutants[name] = n;
    }
    const coMg = finiteOrNull(raw.CO, 1000);
    if (coMg !== null) pollutants.co = Math.round(coMg * 1000);
    const idx = index[key] && typeof index[key] === 'object' ? index[key] : {};
    const levels = {};
    for (const [name, field] of [
      ['pm25', 'PM2.5'],
      ['pm10', 'PM10'],
      ['no2', 'NO2'],
      ['o3', 'O3'],
      ['so2', 'SO2'],
    ]) {
      const level = Array.isArray(idx[field]) ? level16(idx[field][1]) : null;
      if (level) levels[name] = level;
    }
    const reported = Array.isArray(idx.indeks) ? level16(idx.indeks[1]) : null;
    stations.push({
      id: `rhmzrs:${safeKey}`,
      source: 'rhmzrs',
      official: true,
      name: RS_NAMES[safeKey] || safeKey,
      lat,
      lon,
      approximate: false,
      level: reported ?? eaqiOverall(pollutants),
      levelSource: reported ? 'reported' : 'computed',
      levels,
      pollutants,
      coUnit: 'µg/m³',
      observedAt: parseRsTime(raw.vrijeme),
    });
  }
  return { stations };
}

// ------------------------------------------------------ Sensor.Community ---

function parseSensorTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    String(text),
  );
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Parse https://data.sensor.community/airrohr/v1/filter/country=BA
 * (5-minute averages; P1 = PM10, P2 = PM2.5). Groups sensors by location,
 * drops indoor sensors and implausible readings, and grades PM only.
 */
export function parseSensorCommunity(payload) {
  if (!Array.isArray(payload)) throw new Error('sensor_community_invalid');
  const byLocation = new Map();
  for (const row of payload.slice(0, 5000)) {
    const location = row?.location;
    const id = Number(location?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (String(location.indoor) === '1') continue;
    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    if (!validCoord(lat, lon) || !inBosniaBox(lat, lon)) continue;
    const values = Array.isArray(row.sensordatavalues)
      ? row.sensordatavalues
      : [];
    const pm10 = finiteOrNull(
      values.find((v) => v?.value_type === 'P1')?.value,
      999,
    );
    const pm25 = finiteOrNull(
      values.find((v) => v?.value_type === 'P2')?.value,
      999,
    );
    if (pm10 === null && pm25 === null) continue;
    const entry = byLocation.get(id) || {
      lat,
      lon,
      pm10: [],
      pm25: [],
      observedAt: null,
      sensorType: cleanText(row.sensor?.sensor_type?.name, 24),
    };
    if (pm10 !== null) entry.pm10.push(pm10);
    if (pm25 !== null) entry.pm25.push(pm25);
    const time = parseSensorTime(row.timestamp);
    if (time && (!entry.observedAt || time > entry.observedAt))
      entry.observedAt = time;
    byLocation.set(id, entry);
  }
  const mean = (list) =>
    list.length
      ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
      : null;
  const stations = [];
  for (const [id, entry] of byLocation) {
    const pollutants = {};
    const pm10 = mean(entry.pm10);
    const pm25 = mean(entry.pm25);
    if (pm10 !== null) pollutants.pm10 = pm10;
    if (pm25 !== null) pollutants.pm25 = pm25;
    stations.push({
      id: `sensor.community:${id}`,
      source: 'sensor.community',
      official: false,
      name: `Sensor.Community #${id}`,
      lat: entry.lat,
      lon: entry.lon,
      approximate: false,
      level: eaqiOverall(pollutants),
      levelSource: 'computed',
      levels: {},
      pollutants,
      sensorType: entry.sensorType || null,
      observedAt: entry.observedAt,
    });
  }
  return { stations };
}

// ------------------------------------------------------------------ WAQI ---

/** US-EPA-style WAQI index → nearest European band (indicative only). */
export function waqiLevel(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  if (aqi <= 25) return 1;
  if (aqi <= 50) return 2;
  if (aqi <= 100) return 3;
  if (aqi <= 150) return 4;
  if (aqi <= 200) return 5;
  return 6;
}

/** Parse https://api.waqi.info/map/bounds (requires a token). */
export function parseWaqiBounds(payload) {
  if (payload?.status !== 'ok' || !Array.isArray(payload.data))
    throw new Error('waqi_invalid');
  const stations = [];
  for (const row of payload.data.slice(0, 500)) {
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    const uid = Number(row?.uid);
    if (!Number.isInteger(uid) || !validCoord(lat, lon)) continue;
    if (!inBosniaBox(lat, lon)) continue;
    const aqi = finiteOrNull(row.aqi, 2000);
    const time = Date.parse(String(row.station?.time || ''));
    stations.push({
      id: `waqi:${uid}`,
      source: 'waqi',
      official: false,
      name: cleanText(row.station?.name, 80) || `WAQI #${uid}`,
      lat,
      lon,
      approximate: false,
      level: waqiLevel(aqi),
      levelSource: 'computed',
      levels: {},
      pollutants: {},
      waqiAqi: aqi,
      observedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
    });
  }
  return { stations };
}

/** Haversine distance in metres. */
export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Merge official and secondary stations; WAQI rows that duplicate an official
 * station (within `dedupeMeters`) are dropped since WAQI re-publishes them.
 */
export function mergeAirStations(
  { official = [], secondary = [] },
  dedupe = 1500,
) {
  const merged = [...official];
  for (const station of secondary) {
    if (
      station.source === 'waqi' &&
      official.some((o) => distanceMeters(o, station) < dedupe)
    )
      continue;
    merged.push(station);
  }
  return merged;
}

// --------------------------------------------------------- presentation ---

function formatValue(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 100 ? String(Math.round(value)) : String(+value.toFixed(1));
}

function formatLocalTime(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return 'time unknown';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sarajevo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

/** Card copy (plain text; the overlay paints it on a canvas). */
export function airStationCard(station) {
  const band = eaqiBand(station.level);
  const title = `${station.name} · ${band ? `${band.label} (${band.level})` : 'no index'}`;
  const p = station.pollutants || {};
  const details = [];
  const first = ['pm25', 'pm10', 'no2']
    .filter((k) => Number.isFinite(p[k]))
    .map((k) => `${POLLUTANT_LABELS[k]} ${formatValue(p[k])}`);
  const second = ['o3', 'so2', 'h2s']
    .filter((k) => Number.isFinite(p[k]))
    .map((k) => `${POLLUTANT_LABELS[k]} ${formatValue(p[k])}`);
  if (first.length) details.push(`${first.join(' · ')} µg/m³`);
  const secondLine = second.length ? [`${second.join(' · ')} µg/m³`] : [];
  if (Number.isFinite(p.co))
    secondLine.push(`CO ${formatValue(p.co / 1000)} mg/m³`);
  if (secondLine.length) details.push(secondLine.join(' · '));
  if (station.source === 'waqi' && Number.isFinite(station.waqiAqi))
    details.push(`WAQI index ${station.waqiAqi} (US scale, indicative)`);
  if (!first.length && !secondLine.length && station.source !== 'waqi')
    details.push('No valid measurements this hour');
  const sourceLine = [
    SOURCE_LABELS[station.source] || station.source,
    formatLocalTime(station.observedAt),
  ];
  if (station.source === 'sensor.community')
    sourceLine.push('5-min, indicative');
  if (station.approximate) sourceLine.push('position approx.');
  details.push(sourceLine.join(' · '));
  return { title, details, accent: band?.color || NO_DATA_COLOR };
}

/** JSON-safe analyst record. */
export function airAnalystRecord(station) {
  const band = eaqiBand(station.level);
  return {
    id: station.id,
    name: station.name,
    source: station.source,
    official: station.official,
    lat: station.lat,
    lon: station.lon,
    eaqiLevel: station.level ?? null,
    eaqiBand: band?.label ?? null,
    pm25: station.pollutants?.pm25 ?? null,
    pm10: station.pollutants?.pm10 ?? null,
    no2: station.pollutants?.no2 ?? null,
    o3: station.pollutants?.o3 ?? null,
    so2: station.pollutants?.so2 ?? null,
    observedAt: station.observedAt ?? null,
  };
}
