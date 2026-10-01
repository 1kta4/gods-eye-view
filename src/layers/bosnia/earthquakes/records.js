/**
 * Pure (Cesium-free) records for the Bosnia earthquakes layer. Shared by the
 * /api/ba/earthquakes proxy (server) and the layer (browser), and unit-tested.
 *
 * Sources:
 *  - EMSC FDSN event service (GeoJSON): the authoritative event list.
 *  - FHMZ BiH "potresi" page: lists felt intensity (MSK) for recent BiH events;
 *    merged into the matching EMSC event by time, or kept as its own event.
 */

/** BiH plus a margin, so neighbouring Croatian/Serbian/Montenegrin events show. */
export const BA_QUAKE_BBOX = Object.freeze({
  minLat: 42.4,
  maxLat: 45.4,
  minLon: 15.6,
  maxLon: 19.8,
});
export const BA_QUAKE_MIN_MAG = 1.5;
export const BA_QUAKE_WINDOW_DAYS = 30;
export const SARAJEVO_TZ = 'Europe/Sarajevo';
const DAY_MS = 86_400_000;

/** EMSC event page for one event id. */
export function emscEventUrl(unid) {
  const id = String(unid || '');
  return /^[A-Za-z0-9_-]{4,40}$/.test(id)
    ? `https://www.seismicportal.eu/eventdetails.html?unid=${id}`
    : null;
}

/** EMSC FDSN query URL for the last `days` days ending at `nowMs`. */
export function emscQueryUrl(nowMs = Date.now(), days = BA_QUAKE_WINDOW_DAYS) {
  const start = new Date(nowMs - days * DAY_MS).toISOString().slice(0, 19);
  const params = new URLSearchParams({
    format: 'json',
    minlat: String(BA_QUAKE_BBOX.minLat),
    maxlat: String(BA_QUAKE_BBOX.maxLat),
    minlon: String(BA_QUAKE_BBOX.minLon),
    maxlon: String(BA_QUAKE_BBOX.maxLon),
    minmag: String(BA_QUAKE_MIN_MAG),
    starttime: start,
    orderby: 'time',
    limit: '500',
  });
  return `https://www.seismicportal.eu/fdsnws/event/1/query?${params}`;
}

const text = (value, max = 120) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const out = String(value)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
  return out || null;
};
const finite = (value) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
};
const inBox = (lat, lon, pad = 0) =>
  lat >= BA_QUAKE_BBOX.minLat - pad &&
  lat <= BA_QUAKE_BBOX.maxLat + pad &&
  lon >= BA_QUAKE_BBOX.minLon - pad &&
  lon <= BA_QUAKE_BBOX.maxLon + pad;

/** Title-case an EMSC Flinn-Engdahl region ("BOSNIA AND HERZEGOVINA"). */
export function titleCaseRegion(region) {
  const raw = text(region);
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/(^|[\s-])([a-zà-ž])/g, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/\b(And|Of|The)\b/g, (w) => w.toLowerCase());
}

/**
 * Normalise an EMSC FDSN GeoJSON payload. Malformed features are skipped, not
 * fatal; a payload that is not a FeatureCollection returns null.
 * @param {object} geojson
 * @returns {Array<object>|null}
 */
export function normalizeEmscEvents(geojson) {
  if (!geojson || !Array.isArray(geojson.features)) return null;
  const rows = [];
  const seen = new Set();
  for (const feature of geojson.features) {
    const p = feature?.properties;
    if (!p || typeof p !== 'object') continue;
    const coords = feature?.geometry?.coordinates;
    const lat = finite(p.lat ?? coords?.[1]);
    const lon = finite(p.lon ?? coords?.[0]);
    const mag = finite(p.mag);
    const time = Date.parse(p.time);
    if (
      lat === null ||
      lon === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    if (mag === null || mag < 0 || mag > 10 || !Number.isFinite(time)) continue;
    const unid = text(p.unid ?? feature.id, 40);
    if (!unid || seen.has(unid)) continue;
    seen.add(unid);
    // EMSC geometry carries depth as a negative altitude; properties.depth is km.
    let depthKm = finite(p.depth);
    if (depthKm === null && Number.isFinite(coords?.[2]))
      depthKm = Math.abs(coords[2]);
    rows.push({
      id: unid,
      unid,
      source: 'EMSC',
      time,
      lat,
      lon,
      depthKm,
      mag,
      magType: text(p.magtype, 8),
      region: titleCaseRegion(p.flynn_region),
      auth: text(p.auth, 24),
      evtype: text(p.evtype, 8),
      url: emscEventUrl(unid),
      intensity: null,
      place: null,
    });
  }
  return rows;
}

/** Offset (ms) of `timeZone` from UTC at instant `utcMs`. */
export function timeZoneOffsetMs(utcMs, timeZone = SARAJEVO_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convert a wall-clock time in `timeZone` to epoch ms. */
export function zonedTimeToUtc(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  timeZone = SARAJEVO_TZ,
) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(guess)) return NaN;
  const first = guess - timeZoneOffsetMs(guess, timeZone);
  return guess - timeZoneOffsetMs(first, timeZone);
}

/** Parse "27.09.2026" / "28.08.2026." + "08:34" / "3:00" (Sarajevo time). */
export function parseLocalDateTime(dateText, timeText) {
  const d = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*$/.exec(
    String(dateText ?? ''),
  );
  const t = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(timeText ?? ''));
  if (!d || !t) return NaN;
  const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    return NaN;
  return zonedTimeToUtc(year, month, day, hour, minute);
}

const INTENSITY_RE =
  /^(?:I{1,3}|IV|V|VI{0,3}|IX|X|XI|XII)(?:\s*-\s*(?:I{1,3}|IV|V|VI{0,3}|IX|X|XI|XII))?$/;
const stripTags = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function fhmzRecord({
  date,
  time,
  place,
  mag,
  intensity,
  lat = null,
  lon = null,
}) {
  const ms = parseLocalDateTime(date, time);
  const m = finite(String(mag ?? '').replace(',', '.'));
  const inten = String(intensity ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!Number.isFinite(ms) || m === null || m < 0 || m > 10) return null;
  return {
    time: ms,
    place: text(stripTags(place), 60),
    mag: m,
    intensity: INTENSITY_RE.test(inten) ? inten : null,
    lat: lat !== null && Math.abs(lat) <= 90 ? lat : null,
    lon: lon !== null && Math.abs(lon) <= 180 ? lon : null,
  };
}

/**
 * Parse the FHMZ "potresi" page. Prefers the Leaflet marker popups (they carry
 * coordinates); falls back to the table rows. Returns [] on anything unknown.
 * @param {string} html Decoded page text.
 * @returns {Array<{time:number,place:string|null,mag:number,intensity:string|null,lat:number|null,lon:number|null}>}
 */
export function parseFhmzQuakes(html) {
  const page = String(html ?? '');
  const out = [];
  const markerRe =
    /L\.marker\(\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\][^)]*\)\s*\.bindPopup\(\s*'([^']{0,2000})'/g;
  const cell = (popup, label) => {
    const re = new RegExp(
      `${label}\\s*:?\\s*</td>\\s*<td[^>]*>([^<]{0,80})</td>`,
      'i',
    );
    return re.exec(popup)?.[1]?.trim() ?? null;
  };
  for (const match of page.matchAll(markerRe)) {
    const popup = match[3];
    const record = fhmzRecord({
      date: cell(popup, 'datum'),
      time: cell(popup, 'vrijeme'),
      place: cell(popup, 'mjesto'),
      mag: cell(popup, 'magnituda'),
      intensity: cell(popup, 'intenzitet'),
      lat: finite(match[1]),
      lon: finite(match[2]),
    });
    if (record) out.push(record);
    if (out.length >= 200) break;
  }
  if (out.length) return out;
  const rowRe = /<tr[^>]*>([\s\S]{0,1500}?)<\/tr>/gi;
  for (const row of page.matchAll(rowRe)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1]),
    );
    if (cells.length < 5 || !/^\d{1,2}\.\d{1,2}\.\d{4}/.test(cells[0]))
      continue;
    const record = fhmzRecord({
      date: cells[0],
      time: cells[1],
      place: cells[2],
      mag: cells[3],
      intensity: cells[cells.length - 1],
    });
    if (record) out.push(record);
    if (out.length >= 200) break;
  }
  return out;
}

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Attach FHMZ felt intensity to the matching EMSC event (same minute ±3 min,
 * within 80 km when FHMZ gives coordinates). FHMZ events with no EMSC match
 * that fall inside the window and box are kept as their own events.
 * @returns {Array<object>} New array; inputs are not mutated.
 */
export function mergeFhmzIntensity(events, fhmz, { nowMs = Date.now() } = {}) {
  const merged = events.map((event) => ({ ...event }));
  const claimed = new Set();
  for (const felt of fhmz || []) {
    let best = null;
    let bestDt = Infinity;
    for (const event of merged) {
      if (claimed.has(event.id) || event.source !== 'EMSC') continue;
      const dt = Math.abs(event.time - felt.time);
      if (dt > 180_000 || dt >= bestDt) continue;
      if (
        felt.lat !== null &&
        felt.lon !== null &&
        distanceKm(felt.lat, felt.lon, event.lat, event.lon) > 80
      )
        continue;
      best = event;
      bestDt = dt;
    }
    if (best) {
      claimed.add(best.id);
      best.intensity = felt.intensity;
      best.place = felt.place;
      best.fhmzMag = felt.mag;
      continue;
    }
    if (
      felt.lat === null ||
      felt.lon === null ||
      !inBox(felt.lat, felt.lon) ||
      felt.time < nowMs - BA_QUAKE_WINDOW_DAYS * DAY_MS ||
      felt.mag < BA_QUAKE_MIN_MAG
    )
      continue;
    const id = `fhmz-${felt.time}`;
    if (merged.some((event) => event.id === id)) continue;
    merged.push({
      id,
      unid: null,
      source: 'FHMZ',
      time: felt.time,
      lat: felt.lat,
      lon: felt.lon,
      depthKm: null,
      mag: felt.mag,
      magType: 'ML',
      region: 'Bosnia and Herzegovina',
      auth: 'FHMZ',
      evtype: null,
      url: 'https://fhmzbih.gov.ba/latinica/SEIZMO/potresi.php',
      intensity: felt.intensity,
      place: felt.place,
    });
  }
  return merged.sort((a, b) => b.time - a.time);
}

/** Keep events inside the window, box and magnitude floor, newest first. */
export function filterQuakeWindow(events, nowMs = Date.now()) {
  const since = nowMs - BA_QUAKE_WINDOW_DAYS * DAY_MS;
  return (events || [])
    .filter(
      (e) =>
        e.time >= since &&
        e.time <= nowMs + 3_600_000 &&
        e.mag >= BA_QUAKE_MIN_MAG &&
        inBox(e.lat, e.lon, 0.05),
    )
    .sort((a, b) => b.time - a.time);
}

/**
 * Validate the proxy payload before it replaces the displayed snapshot.
 * @returns {Array<object>|null}
 */
export function normalizeQuakeSnapshot(payload) {
  if (!payload || !Array.isArray(payload.events)) return null;
  const rows = [];
  for (const e of payload.events) {
    const lat = finite(e?.lat);
    const lon = finite(e?.lon);
    const mag = finite(e?.mag);
    const time = finite(e?.time);
    const id = text(e?.id, 48);
    if (!id || lat === null || lon === null || mag === null || time === null)
      continue;
    rows.push({
      id,
      unid: text(e.unid, 40),
      source: e.source === 'FHMZ' ? 'FHMZ' : 'EMSC',
      time,
      lat,
      lon,
      depthKm: finite(e.depthKm),
      mag,
      magType: text(e.magType, 8),
      region: text(e.region),
      auth: text(e.auth, 24),
      url:
        e.source === 'FHMZ'
          ? 'https://fhmzbih.gov.ba/latinica/SEIZMO/potresi.php'
          : emscEventUrl(e.unid),
      intensity: text(e.intensity, 12),
      place: text(e.place, 60),
    });
  }
  return rows;
}

/** 'day' (<24 h), 'week' (<7 d) or 'month'. */
export function quakeAgeClass(timeMs, nowMs = Date.now()) {
  const age = nowMs - timeMs;
  if (age < DAY_MS) return 'day';
  if (age < 7 * DAY_MS) return 'week';
  return 'month';
}

/** Age-class accent colours (CSS). Last 24 h stand out in hot red. */
export const QUAKE_AGE_COLORS = Object.freeze({
  day: '#ff3b30',
  week: '#ff9f0a',
  month: '#ffd60a',
});

/** Marker pixel size grows with magnitude; recent events get a bonus. */
export function quakePixelSize(mag, ageClass) {
  const m = Math.max(1, Math.min(7, Number(mag) || 1));
  const base = 5 + (m - 1) * 4.2;
  return Math.round(ageClass === 'day' ? base + 4 : base);
}

/** "1 Oct 2026, 10:21" in Sarajevo local time. */
export function formatSarajevoTime(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SARAJEVO_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

/** "3 h ago" style relative age. */
export function formatAge(ms, nowMs = Date.now()) {
  const minutes = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Card model {title, details[]} for one event. */
export function buildQuakeCard(event, nowMs = Date.now()) {
  const mag = Number(event.mag).toFixed(1);
  const type = event.magType ? ` ${event.magType}` : '';
  const where = event.place
    ? `${event.place}${event.region ? ` · ${event.region}` : ''}`
    : event.region || 'Unknown region';
  const details = [
    `${formatSarajevoTime(event.time)} (Sarajevo) · ${formatAge(event.time, nowMs)}`,
    `M${mag}${type} · depth ${
      Number.isFinite(event.depthKm) ? `${Math.round(event.depthKm)} km` : '—'
    }`,
    where,
  ];
  if (event.intensity)
    details.push(`Felt intensity ${event.intensity} MSK (FHMZ)`);
  details.push(`Agency ${event.auth || '—'} · via ${event.source}`);
  if (event.url) details.push('Click card → event page ↗');
  return { title: `M${mag} earthquake`, details };
}
