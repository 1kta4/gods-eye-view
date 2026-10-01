/**
 * Pure model for BiH airports (OurAirports, public domain), runways and
 * BHANSA eAIP airspace. Build-time helpers (CSV) and runtime normalisers.
 */
import {
  pathsFromGeometry,
  polygonsFromGeometry,
  formatInt,
} from '../boundaries/model.js';

export const AIRPORT_TYPES = Object.freeze([
  'large_airport',
  'medium_airport',
  'small_airport',
  'heliport',
  'seaplane_base',
  'closed',
]);

export const AIRPORT_STYLE = Object.freeze({
  large_airport: { color: '#00e5ff', size: 12, label: 'International airport' },
  medium_airport: { color: '#00e5ff', size: 10, label: 'Airport' },
  small_airport: { color: '#7fdbff', size: 7, label: 'Airfield' },
  heliport: { color: '#c3a6ff', size: 6, label: 'Heliport' },
  seaplane_base: { color: '#7fdbff', size: 6, label: 'Seaplane base' },
  closed: { color: '#8a939b', size: 6, label: 'Closed airfield' },
});

export const AIRSPACE_STYLE = Object.freeze({
  ctr: { color: '#00b4ff', alpha: 0.16, label: 'Control zone (CTR)' },
  tma: { color: '#00b4ff', alpha: 0.9, label: 'Terminal area (TMA)' },
  prohibited: { color: '#ff3b3b', alpha: 0.3, label: 'Prohibited area' },
  restricted: { color: '#ff8c1a', alpha: 0.24, label: 'Restricted area' },
  danger: { color: '#ffd21a', alpha: 0.22, label: 'Danger area' },
});

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function num(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clean(value, max = 100) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f�]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** OurAirports rows → airport records for one country. */
export function airportsFromRows(rows, country = 'BA') {
  const out = [];
  for (const r of rows) {
    if (r.iso_country !== country) continue;
    const lat = num(r.latitude_deg);
    const lon = num(r.longitude_deg);
    if (lat == null || lon == null || !AIRPORT_TYPES.includes(r.type)) continue;
    out.push({
      ident: clean(r.ident, 12),
      type: r.type,
      name: clean(r.name),
      lat,
      lon,
      elevationFt: num(r.elevation_ft),
      municipality: clean(r.municipality, 60) || null,
      scheduled: r.scheduled_service === 'yes',
      icao: clean(r.icao_code || r.gps_code, 6) || null,
      iata: clean(r.iata_code, 4) || null,
      ref: num(r.id),
    });
  }
  return out;
}

/** OurAirports runway rows → runway centre-lines for the given airport refs. */
export function runwaysFromRows(rows, airportRefs) {
  const out = [];
  for (const r of rows) {
    if (!airportRefs.has(num(r.airport_ref))) continue;
    const a = [num(r.le_longitude_deg), num(r.le_latitude_deg)];
    const b = [num(r.he_longitude_deg), num(r.he_latitude_deg)];
    if (a.includes(null) || b.includes(null)) continue;
    out.push({
      airportIdent: clean(r.airport_ident, 12),
      ends: `${clean(r.le_ident, 4)}/${clean(r.he_ident, 4)}`,
      lengthFt: num(r.length_ft),
      widthFt: num(r.width_ft),
      surface: clean(r.surface, 30) || null,
      lighted: r.lighted === '1',
      closed: r.closed === '1',
      line: [a, b],
    });
  }
  return out;
}

/** Bundled airports GeoJSON → records. */
export function normalizeAirports(geojson) {
  const out = [];
  const seen = new Set();
  for (const f of geojson?.features || []) {
    const p = f?.properties || {};
    const [lon, lat] = f?.geometry?.coordinates || [];
    const ident = clean(p.ident, 12);
    if (
      !ident ||
      seen.has(ident) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    )
      continue;
    if (!AIRPORT_TYPES.includes(p.type)) continue;
    seen.add(ident);
    out.push({
      ident,
      type: p.type,
      name: clean(p.name),
      lon,
      lat,
      elevationFt: Number.isFinite(p.elevationFt) ? p.elevationFt : null,
      municipality: clean(p.municipality, 60) || null,
      scheduled: p.scheduled === true,
      icao: clean(p.icao, 6) || null,
      iata: clean(p.iata, 4) || null,
    });
  }
  return out;
}

/** Bundled runways GeoJSON → records. */
export function normalizeRunways(geojson) {
  const out = [];
  for (const f of geojson?.features || []) {
    const p = f?.properties || {};
    const [path] = pathsFromGeometry(f?.geometry);
    if (!path) continue;
    out.push({
      airportIdent: clean(p.airportIdent, 12),
      ends: clean(p.ends, 12),
      lengthFt: Number.isFinite(p.lengthFt) ? p.lengthFt : null,
      surface: clean(p.surface, 30) || null,
      closed: p.closed === true,
      path,
    });
  }
  return out;
}

function limit(l) {
  if (!l || typeof l !== 'object') return null;
  const meters = Number(l.meters);
  if (!Number.isFinite(meters) || meters < 0 || meters > 25000) return null;
  return { text: clean(l.text, 24), meters, ref: clean(l.ref, 4) };
}

/** Bundled airspace GeoJSON → records. */
export function normalizeAirspace(geojson) {
  const out = [];
  for (const f of geojson?.features || []) {
    const p = f?.properties || {};
    if (!AIRSPACE_STYLE[p.type]) continue;
    const [rings] = polygonsFromGeometry(f?.geometry);
    const upper = limit(p.upper);
    const lower = limit(p.lower);
    if (!rings || !upper || !lower) continue;
    out.push({
      ident: clean(p.ident, 24),
      name: clean(p.name, 60),
      type: p.type,
      airspaceClass: clean(p.airspaceClass, 8) || null,
      upper,
      lower,
      remarks: clean(p.remarks, 300),
      ring: rings[0],
    });
  }
  return out;
}

/** Extrusion bounds (metres above the ellipsoid; AGL treated as above GND). */
export function extrusionFor(area) {
  const lower = area.lower.ref === 'GND' ? 0 : area.lower.meters;
  const upper = Math.max(lower + 50, area.upper.meters);
  return { lower, upper };
}

/** Card copy for an airport. */
export function airportCard(a, runways = []) {
  const codes = [a.icao, a.iata].filter(Boolean).join(' / ');
  const details = [
    `${AIRPORT_STYLE[a.type]?.label || a.type}${codes ? ` · ${codes}` : ''}`,
  ];
  if (a.municipality) details.push(a.municipality);
  if (a.elevationFt != null)
    details.push(
      `Elevation ${formatInt(a.elevationFt)} ft (${formatInt(a.elevationFt * 0.3048)} m)`,
    );
  for (const r of runways.slice(0, 3)) {
    const len = r.lengthFt ? ` ${formatInt(r.lengthFt * 0.3048)} m` : '';
    details.push(
      `RWY ${r.ends}${len}${r.surface ? ` · ${r.surface}` : ''}${r.closed ? ' (closed)' : ''}`,
    );
  }
  if (a.scheduled) details.push('Scheduled passenger service');
  return { title: a.name, details };
}

/** Card copy for an airspace volume. */
export function airspaceCard(area) {
  const details = [
    `${AIRSPACE_STYLE[area.type].label}${area.airspaceClass ? ` · class ${area.airspaceClass}` : ''}`,
    `${area.lower.text} – ${area.upper.text}`,
  ];
  if (area.remarks) {
    const r = area.remarks;
    details.push(r.length > 70 ? `${r.slice(0, 69)}…` : r);
  }
  details.push('Source: BHANSA eAIP — not for navigation');
  return {
    title: area.ident === area.name ? area.name : `${area.ident} ${area.name}`,
    details,
  };
}
