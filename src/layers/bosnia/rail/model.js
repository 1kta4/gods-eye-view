/**
 * Pure model for BiH railways (OSM extract) and stations, plus the static
 * ŽFBiH timetable used for "scheduled trains" lines in station cards.
 */
import { pathsFromGeometry } from '../boundaries/model.js';

export const RAIL_STATUSES = Object.freeze([
  'active',
  'preserved',
  'construction',
  'disused',
  'abandoned',
]);

export const RAIL_STYLE = Object.freeze({
  activeElectrified: { color: '#ff4fa3', alpha: 0.95, width: 3.5 },
  active: { color: '#d07cff', alpha: 0.95, width: 3 },
  preserved: { color: '#ffb300', alpha: 0.95, width: 2.5 },
  construction: { color: '#4dd0e1', alpha: 0.9, width: 2 },
  disused: { color: '#e08a3c', alpha: 0.9, width: 2.5 },
  abandoned: { color: '#b0602a', alpha: 0.85, width: 2.5 },
});

const STATUS_LABEL = Object.freeze({
  active: 'Active railway',
  preserved: 'Heritage railway',
  construction: 'Under construction',
  disused: 'Disused railway',
  abandoned: 'Former railway (abandoned)',
});

const CYRILLIC = {
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

/** Serbian Cyrillic → Latin (Gaj). */
export function toLatin(value) {
  return String(value ?? '').replace(/[Ѐ-ӿ]/g, (ch) => {
    const upper = CYRILLIC[ch];
    if (upper) return upper;
    const lower = CYRILLIC[ch.toUpperCase()];
    return lower ? lower.toLowerCase() : ch;
  });
}

function clean(value, max = 80) {
  return toLatin(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Normalise the many OSM spellings of the two entity railway companies. */
export function normalizeOperator(raw, entity) {
  const text = clean(raw, 80);
  const folded = text.toLowerCase();
  if (/fbih|fbh|federacij/.test(folded))
    return { operator: 'ŽFBiH', inferred: false };
  if (/\bž?z?rs\b|žrs|republike srpske/.test(folded))
    return { operator: 'ŽRS', inferred: false };
  if (/srbij|infrastruktura železnice/.test(folded))
    return { operator: 'Infrastruktura železnice Srbije', inferred: false };
  if (text) return { operator: text, inferred: false };
  if (entity === 'FBiH') return { operator: 'ŽFBiH', inferred: true };
  if (entity === 'RS') return { operator: 'ŽRS', inferred: true };
  return { operator: null, inferred: true };
}

const MEANINGFUL_NAME =
  /pruga|bahn|želez|željez|railway|ćiro|tunel|most|kolosek/i;

/** Bundled lines GeoJSON → line groups. */
export function normalizeRailLines(geojson) {
  const out = [];
  for (const f of geojson?.features || []) {
    const p = f?.properties || {};
    if (!RAIL_STATUSES.includes(p.status)) continue;
    const paths = pathsFromGeometry(f.geometry);
    if (!paths.length) continue;
    const name = clean(p.name, 80);
    out.push({
      status: p.status,
      electrified: p.electrified === true,
      narrowGauge: p.narrowGauge === true,
      usage: clean(p.usage, 20) || null,
      // Abandoned trackbeds often carry the name of the road built on them.
      name:
        name && (p.status !== 'abandoned' || MEANINGFUL_NAME.test(name))
          ? name
          : null,
      paths,
    });
  }
  return out;
}

/** Style key for a line group. */
export function railStyleKey(line) {
  if (line.status === 'active')
    return line.electrified ? 'activeElectrified' : 'active';
  return line.status;
}

/** Card copy for a line group. */
export function railLineCard(line) {
  const details = [STATUS_LABEL[line.status]];
  const traits = [];
  if (line.electrified) traits.push('electrified');
  if (line.narrowGauge) traits.push('narrow gauge (760 mm)');
  if (line.usage) traits.push(`${line.usage} line`);
  if (traits.length) details.push(traits.join(' · '));
  details.push('OpenStreetMap contributors');
  return { title: line.name || STATUS_LABEL[line.status], details };
}

/**
 * Bundled stations GeoJSON → stations. Drops duplicates (same name within
 * ~1 km) and Cyrillic-only spellings are transliterated.
 */
export function normalizeStations(geojson) {
  const out = [];
  for (const f of geojson?.features || []) {
    const p = f?.properties || {};
    const [lon, lat] = f?.geometry?.coordinates || [];
    const name = clean(p.name, 60);
    if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (p.kind !== 'station' && p.kind !== 'halt') continue;
    const dup = out.some(
      (s) =>
        s.name === name &&
        Math.abs(s.lon - lon) < 0.012 &&
        Math.abs(s.lat - lat) < 0.009,
    );
    if (dup) continue;
    const entity = ['FBiH', 'RS', 'BD'].includes(p.entity) ? p.entity : null;
    const op = normalizeOperator(p.operator, entity);
    out.push({
      id: String(p.osmId ?? f.id ?? name),
      name,
      kind: p.kind,
      lon,
      lat,
      entity,
      municipality: clean(p.municipality, 60) || null,
      operator: op.operator,
      operatorInferred: op.inferred,
      disused: p.disused === true,
      unfinished: /unfinished/i.test(name),
    });
  }
  return out;
}

const fold = (s) =>
  toLatin(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'dj')
    .trim();

/** Validate the bundled timetable. */
export function normalizeTimetable(json) {
  const services = [];
  const time = /^\d{2}:\d{2}$/;
  for (const s of json?.services || []) {
    if (!time.test(s?.dep) || !time.test(s?.arr) || !s.from || !s.to) continue;
    services.push({
      train: clean(s.train, 8),
      rank: s.rank === 'fast' ? 'fast' : 'local',
      from: clean(s.from, 40),
      to: clean(s.to, 40),
      dep: s.dep,
      arr: s.arr,
      route: clean(s.route, 40) || null,
      note: clean(s.note, 40) || null,
    });
  }
  const routes = {};
  for (const [name, stops] of Object.entries(json?.routes || {}))
    if (Array.isArray(stops))
      routes[clean(name, 40)] = stops.map((x) => clean(x, 40));
  return { services, routes, period: clean(json?.period, 60) || null };
}

/**
 * Scheduled-train lines for a station card: departures/arrivals at termini,
 * and "calls at" summaries for intermediate stops (the public timetable only
 * lists terminus times).
 */
export function stationTimetableLines(stationName, timetable, max = 4) {
  if (!timetable?.services?.length) return [];
  const key = fold(stationName);
  const lines = [];
  const deps = timetable.services
    .filter((s) => fold(s.from) === key)
    .sort((a, b) => (a.dep < b.dep ? -1 : 1));
  for (const s of deps.slice(0, max))
    lines.push(
      `${s.dep} → ${s.to} (${s.rank === 'fast' ? 'fast ' : ''}${s.train})${s.note ? ` ${s.note}` : ''}`,
    );
  if (deps.length > max) lines.push(`+${deps.length - max} more departures`);
  if (!deps.length) {
    const arrivals = timetable.services.filter((s) => fold(s.to) === key);
    for (const s of arrivals.slice(0, 2))
      lines.push(`arr ${s.arr} from ${s.from} (${s.train})`);
  }
  if (!lines.length) {
    for (const [route, stops] of Object.entries(timetable.routes || {})) {
      const i = stops.findIndex((x) => fold(x) === key);
      if (i <= 0 || i === stops.length - 1) continue;
      const trains = timetable.services.filter(
        (s) => s.route === route && s.rank === 'fast',
      );
      if (trains.length)
        lines.push(
          `On ${route} line: trains ${trains.map((t) => t.train).join(', ')}`,
          '(timetable lists terminus times only)',
        );
    }
  }
  if (lines.length && timetable.period) lines.unshift(timetable.period);
  return lines;
}

/** Card copy for a station. */
export function stationCard(station, timetable) {
  const details = [
    `${station.kind === 'halt' ? 'Halt' : 'Station'}${station.disused ? ' (disused)' : ''}${station.unfinished ? ' (unfinished)' : ''}`,
  ];
  if (station.operator)
    details.push(
      `Operator: ${station.operator}${station.operatorInferred ? ' (by entity)' : ''}`,
    );
  if (station.municipality) details.push(station.municipality);
  details.push(...stationTimetableLines(station.name, timetable));
  return { title: station.name, details };
}
