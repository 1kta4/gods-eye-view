/**
 * @module bosnia/borderCrossings/model
 * @description Pure joins and card copy for the BiH border-crossings layer:
 * bundled crossing points + the live BIHAMK report → display rows, overlay
 * card models and analyst records. No Cesium, no DOM.
 */
import {
  WAIT_BANDS,
  crossingKey,
  formatWait,
  headlineWaitMinutes,
  waitBand,
} from './bihamk.js';

export const COUNTRY_NAMES = Object.freeze({
  HR: 'Croatia',
  RS: 'Serbia',
  ME: 'Montenegro',
});

const CARD_LINE_MAX = 96;

function clampLine(text, max = CARD_LINE_MAX) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function finite(value, min, max) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

/**
 * Validate the bundled dataset rows; malformed rows are dropped.
 * @param {unknown} rows
 * @returns {Array<object>}
 */
export function normalizeCrossingDataset(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const lat = finite(row.lat, 42, 46);
    const lon = finite(row.lon, 15, 20);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (lat === null || lon === null || !name) continue;
    const key = crossingKey(row.key || name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `ba-gp-${key}`,
      key,
      name,
      lat,
      lon,
      elevationM: finite(row.elevationM, -50, 3000) ?? 0,
      country: COUNTRY_NAMES[row.country] ? row.country : null,
      neighbourCrossing:
        typeof row.neighbourCrossing === 'string' && row.neighbourCrossing
          ? row.neighbourCrossing
          : null,
      cameras: Array.isArray(row.cameras)
        ? row.cameras.filter(
            (id) => typeof id === 'string' && /^ba-[a-z0-9-]+$/.test(id),
          )
        : [],
    });
  }
  return out;
}

/**
 * Join bundled crossings with the live BIHAMK rows by name key. Live rows
 * without a bundled point keep BIHAMK's own map coordinates when present.
 * @param {Array<object>} dataset normalizeCrossingDataset() output.
 * @param {{crossings?: Array<object>, updatedAt?: string|null}|null} report
 * @returns {Array<object>}
 */
export function mergeCrossings(dataset, report) {
  const live = new Map();
  for (const item of Array.isArray(report?.crossings) ? report.crossings : []) {
    if (item && typeof item.key === 'string') live.set(item.key, item);
  }
  const updatedAt =
    typeof report?.updatedAt === 'string' ? report.updatedAt : null;
  const rows = dataset.map((base) => decorate(base, live.get(base.key)));
  const known = new Set(dataset.map((row) => row.key));
  for (const [key, item] of live) {
    if (known.has(key)) continue;
    const lat = finite(item.lat, 42, 46);
    const lon = finite(item.lon, 15, 20);
    if (lat === null || lon === null) continue;
    rows.push(
      decorate(
        {
          id: `ba-gp-${key}`,
          key,
          name: String(item.name || key),
          lat,
          lon,
          elevationM: 0,
          country: null,
          neighbourCrossing: null,
          cameras: [],
        },
        item,
      ),
    );
  }
  for (const row of rows) row.updatedAt = row.live ? updatedAt : null;
  return rows;
}

function decorate(base, item) {
  const wait = item?.wait && typeof item.wait === 'object' ? item.wait : null;
  const minutes = headlineWaitMinutes(wait);
  const upTo = Boolean(wait?.upTo);
  const band =
    wait?.closed && minutes === null
      ? WAIT_BANDS[4]
      : waitBand(minutes, { upTo });
  return {
    ...base,
    live: item
      ? { text: typeof item.text === 'string' ? item.text : '', wait }
      : null,
    minutes,
    upTo,
    band,
  };
}

/** "13:31, 1 Oct" in Sarajevo time. */
export function formatReportTime(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sarajevo',
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    }).formatToParts(new Date(ms));
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return `${get('hour')}:${get('minute')}, ${get('day')} ${get('month')}`;
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** Short wait text for an ambient label. */
export function shortWait(row) {
  if (!row.live) return 'no report';
  if (row.live.wait?.closed && row.minutes === null) return 'closed';
  return formatWait(row.minutes, { upTo: row.upTo });
}

/**
 * Card copy for one selected crossing.
 * @param {object} row mergeCrossings() row.
 * @returns {{title: string, details: string[]}}
 */
export function crossingCardCopy(row) {
  const details = [];
  const country = row.country ? COUNTRY_NAMES[row.country] : null;
  if (country)
    details.push(
      row.neighbourCrossing
        ? `→ ${country} · ${row.neighbourCrossing}`
        : `→ ${country}`,
    );
  const wait = row.live?.wait;
  if (!row.live) {
    details.push('No BIHAMK wait report for this crossing');
  } else {
    const parts = [];
    if (Number.isFinite(wait?.cars))
      parts.push(`Cars ${formatWait(wait.cars, { upTo: row.upTo })}`);
    if (Number.isFinite(wait?.trucks))
      parts.push(`Trucks ${formatWait(wait.trucks)}`);
    if (Number.isFinite(wait?.buses))
      parts.push(`Buses ${formatWait(wait.buses)}`);
    if (!parts.length && Number.isFinite(wait?.general))
      parts.push(`Wait ${formatWait(wait.general, { upTo: row.upTo })}`);
    if (!parts.length && wait?.noDelay) parts.push('No delay');
    if (parts.length) details.push(parts.join(' · '));
    const dir = [];
    if (Number.isFinite(wait?.entry))
      dir.push(`Entry ${formatWait(wait.entry)}`);
    if (Number.isFinite(wait?.exit)) dir.push(`Exit ${formatWait(wait.exit)}`);
    if (dir.length) details.push(dir.join(' · '));
    const flags = [];
    if (wait?.closed) flags.push('Closed');
    if (wait?.truckBan) flags.push('Trucks banned');
    if (flags.length) details.push(flags.join(' · '));
    for (const line of String(row.live.text || '')
      .split('\n')
      .filter(Boolean)
      .slice(0, 3))
      details.push(clampLine(line));
  }
  const at = row.updatedAt ? formatReportTime(row.updatedAt) : null;
  details.push(at ? `BIHAMK report ${at}` : 'Source: BIHAMK');
  if (row.cameras.length)
    details.push(
      `CCTV · ${row.cameras.length} still${row.cameras.length === 1 ? '' : 's'} · click card to view`,
    );
  return { title: `GP ${row.name}`, details };
}

/**
 * Card copy for the national road-conditions summary.
 * @param {{paragraphs?: string[], updatedAt?: string|null}|null} conditions
 * @param {number} [maxLines]
 */
export function conditionsCardCopy(conditions, maxLines = 3) {
  const paragraphs = Array.isArray(conditions?.paragraphs)
    ? conditions.paragraphs.filter((p) => typeof p === 'string' && p.trim())
    : [];
  if (!paragraphs.length) return null;
  const at = conditions.updatedAt
    ? formatReportTime(conditions.updatedAt)
    : null;
  const details = paragraphs.slice(0, maxLines).map((p) => clampLine(p));
  if (paragraphs.length > maxLines)
    details.push(
      `+${paragraphs.length - maxLines} more · click to open BIHAMK`,
    );
  else details.push('click to open BIHAMK');
  return {
    title: at ? `BiH roads · BIHAMK ${at}` : 'BiH roads · BIHAMK',
    details,
  };
}

/** JSON-safe analyst records (one per crossing). */
export function crossingAnalystRecords(rows, maxCount = 2000) {
  const limit = Number.isFinite(maxCount)
    ? Math.max(1, Math.floor(maxCount))
    : 2000;
  return rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    neighbourCountry: row.country ? COUNTRY_NAMES[row.country] : null,
    neighbourCrossing: row.neighbourCrossing,
    waitMinutes: row.minutes,
    waitIsUpperBound: row.upTo,
    waitBand: row.band.id,
    carsMinutes: row.live?.wait?.cars ?? null,
    trucksMinutes: row.live?.wait?.trucks ?? null,
    entryMinutes: row.live?.wait?.entry ?? null,
    exitMinutes: row.live?.wait?.exit ?? null,
    truckBan: Boolean(row.live?.wait?.truckBan),
    closed: Boolean(row.live?.wait?.closed),
    reportText: row.live?.text ?? null,
    reportedAt: row.updatedAt,
    cctvCameras: row.cameras.length,
  }));
}
