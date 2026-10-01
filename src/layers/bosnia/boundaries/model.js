/**
 * Pure model for the BiH entities / cantons / municipalities layer.
 * Data: geoBoundaries gbOpen BIH ADM1–3 (public domain) joined with the 2013
 * census final results (BHAS). No Cesium here so it stays unit-testable.
 */

export const ENTITY_LABELS = Object.freeze({
  FBiH: 'Federation of Bosnia and Herzegovina',
  RS: 'Republika Srpska',
  BD: 'Brčko District of BiH',
});

export const LINE_LEVELS = Object.freeze([
  'municipal',
  'canton',
  'entity',
  'national',
]);

/** Line styles (screen px) — entity lines bold, cantons medium, municipalities thin. */
export const LINE_STYLE = Object.freeze({
  national: { color: '#ffd166', alpha: 0.95, width: 3.5 },
  entity: { color: '#ffd166', alpha: 0.95, width: 3 },
  canton: { color: '#66c7ff', alpha: 0.85, width: 2 },
  municipal: { color: '#9aa7b4', alpha: 0.85, width: 1.25 },
});

/** Population density classes (people per km²) for the optional choropleth. */
export const DENSITY_BREAKS = Object.freeze([25, 50, 100, 200, 500]);
export const DENSITY_COLORS = Object.freeze([
  '#fff5c4',
  '#fed98e',
  '#fe9929',
  '#e5652a',
  '#c2362a',
  '#7f0f2e',
]);

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value, max = 120) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}

function validRing(ring) {
  return (
    Array.isArray(ring) &&
    ring.length >= 4 &&
    ring.every(
      (p) =>
        Array.isArray(p) &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    )
  );
}

/**
 * Turn a Polygon/MultiPolygon geometry into a list of polygons (ring lists).
 * Invalid rings are dropped; a polygon without a valid outer ring is dropped.
 * @param {object} geometry GeoJSON geometry.
 * @returns {number[][][][]} Polygons → rings → [lon, lat].
 */
export function polygonsFromGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  const out = [];
  for (const poly of polys || []) {
    if (!Array.isArray(poly) || !validRing(poly[0])) continue;
    out.push(poly.filter(validRing));
  }
  return out;
}

/** Turn a LineString/MultiLineString into a list of coordinate paths. */
export function pathsFromGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];
  const lines =
    geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : [];
  return (lines || []).filter(
    (line) =>
      Array.isArray(line) &&
      line.length >= 2 &&
      line.every(
        (p) =>
          Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
      ),
  );
}

/**
 * Validate the bundled municipality collection.
 * @param {object} geojson FeatureCollection from municipalities.geojson.
 * @returns {object[]} Municipality records.
 */
export function normalizeMunicipalities(geojson) {
  if (!Array.isArray(geojson?.features))
    throw new Error('Municipality data is not a FeatureCollection');
  const out = [];
  const ids = new Set();
  for (const feature of geojson.features) {
    const p = feature?.properties || {};
    const id = cleanText(p.id, 16);
    const name = cleanText(p.name, 80);
    const entity = ['FBiH', 'RS', 'BD'].includes(p.entity) ? p.entity : null;
    const polygons = polygonsFromGeometry(feature?.geometry);
    if (!id || ids.has(id) || !name || !entity || !polygons.length) continue;
    ids.add(id);
    const population = finite(p.population2013);
    const area = finite(p.areaKm2);
    const canton =
      Number.isInteger(p.canton) && p.canton >= 1 && p.canton <= 10
        ? p.canton
        : null;
    out.push({
      id,
      name,
      entity,
      canton,
      population2013: population != null && population >= 0 ? population : null,
      areaKm2: area != null && area > 0 ? area : null,
      density:
        population != null && area
          ? Math.round((population / area) * 10) / 10
          : null,
      labelLon: finite(p.labelLon),
      labelLat: finite(p.labelLat),
      polygons,
    });
  }
  if (!out.length) throw new Error('No valid municipalities in bundled data');
  return out;
}

/** Group bundled boundary lines by level. */
export function normalizeBoundaryLines(geojson) {
  const out = { national: [], entity: [], canton: [], municipal: [] };
  for (const feature of geojson?.features || []) {
    const level = feature?.properties?.level;
    if (!LINE_LEVELS.includes(level)) continue;
    out[level].push(...pathsFromGeometry(feature.geometry));
  }
  return out;
}

/** Validate entity / canton summary units. */
export function normalizeUnits(json) {
  const units = [];
  for (const u of json?.units || []) {
    if (u?.kind !== 'entity' && u?.kind !== 'canton') continue;
    const lon = finite(u.labelLon);
    const lat = finite(u.labelLat);
    if (lon == null || lat == null) continue;
    units.push({
      kind: u.kind,
      code: u.code,
      name: cleanText(u.name, 80),
      localName: cleanText(u.localName, 80),
      population2013: finite(u.population2013),
      areaKm2: finite(u.areaKm2),
      municipalities: finite(u.municipalities),
      labelLon: lon,
      labelLat: lat,
    });
  }
  return units;
}

/** Density class index 0..5 (null when unknown). */
export function densityClass(density) {
  if (!Number.isFinite(density)) return null;
  let i = 0;
  while (i < DENSITY_BREAKS.length && density >= DENSITY_BREAKS[i]) i++;
  return i;
}

/** Format an integer with thin grouping (55,181). */
export function formatInt(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Area with one decimal below 100 km², whole numbers above. */
export function formatArea(value) {
  if (!Number.isFinite(value)) return '—';
  return value < 100 ? value.toFixed(1) : formatInt(value);
}

/**
 * Card copy for one municipality.
 * @param {object} m Municipality record.
 * @param {Map<string, object>} cantons Canton units by code.
 * @returns {{title:string, details:string[]}}
 */
export function municipalityCard(m, cantons = new Map()) {
  const details = [];
  if (m.entity === 'BD') {
    details.push('Brčko District of BiH (self-governing unit)');
  } else {
    details.push(`Entity: ${ENTITY_LABELS[m.entity]}`);
  }
  if (m.canton) {
    const c = cantons.get(m.canton);
    details.push(
      c ? `Canton: ${c.name} (${c.localName})` : `Canton ${m.canton}`,
    );
  }
  details.push(`Population 2013: ${formatInt(m.population2013)} (BHAS census)`);
  if (m.areaKm2) {
    const density = m.density != null ? ` · ${formatInt(m.density)}/km²` : '';
    details.push(`Area: ${formatArea(m.areaKm2)} km²${density}`);
  }
  return { title: m.name, details };
}

/** Card copy for an entity or canton unit label. */
export function unitCard(u) {
  const details = [];
  if (u.localName && u.localName !== u.name) details.push(u.localName);
  details.push(
    `Population 2013: ${formatInt(u.population2013)} · ${formatInt(u.municipalities)} municipalities`,
  );
  if (u.areaKm2) details.push(`Area: ${formatInt(u.areaKm2)} km²`);
  return { title: u.name, details };
}

/** Card copy for the inter-entity line. */
export function boundaryLineCard(level) {
  if (level === 'entity')
    return {
      title: 'Inter-Entity Boundary Line',
      details: [
        'Federation of BiH / Republika Srpska / Brčko District',
        'Internal line set by the 1995 Dayton Agreement',
        'Not an international border',
      ],
    };
  if (level === 'national')
    return { title: 'State border of Bosnia and Herzegovina', details: [] };
  return null;
}

/** JSON-safe analyst rows. */
export function municipalityAnalystRecords(
  municipalities,
  cantons = new Map(),
) {
  return municipalities.map((m) => ({
    id: m.id,
    name: m.name,
    entity: m.entity,
    canton: m.canton ? cantons.get(m.canton)?.name || String(m.canton) : null,
    population2013: m.population2013,
    areaKm2: m.areaKm2,
    densityPerKm2: m.density,
    lat: m.labelLat,
    lon: m.labelLon,
  }));
}

/** Accept `{ choropleth: boolean }` via setParams. */
export function acceptBoundaryParams(next, current) {
  if (!next || typeof next !== 'object') return null;
  if (!('choropleth' in next)) return null;
  const choropleth = next.choropleth === true;
  if (choropleth === current.choropleth) return null;
  return { ...current, choropleth };
}
