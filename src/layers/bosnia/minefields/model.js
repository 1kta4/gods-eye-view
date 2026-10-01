/**
 * Pure helpers for the ba-minefields layer (OSM community mapping of
 * mine-suspected areas). No Cesium, no DOM.
 */

export const MINE_RED = '#ff2a2a';

/** Shown on first enable, kept in getStats and on every card. Verbatim. */
export const MINE_WARNING =
  'INCOMPLETE community mapping, NOT official data. Absence of a marking does NOT mean an area is safe. ~775 km² (1.5% of BiH) is still suspected hazardous (BHMAC, Jan 2026). Official information: BHMAC (www.bhmac.org), EUFOR minefield maps (https://www.euforbih.org/index.php/en/bih-minefield-maps). Stay on paved roads; never enter marked or abandoned areas.';

export const MINE_OFFICIAL_LINKS = Object.freeze([
  Object.freeze({ label: 'BHMAC', url: 'https://www.bhmac.org/' }),
  Object.freeze({
    label: 'EUFOR minefield maps',
    url: 'https://www.euforbih.org/index.php/en/bih-minefield-maps',
  }),
]);

export const MINE_KIND_LABELS = Object.freeze({
  minefield: 'Mine-suspected area (hazard=minefield)',
  uxo: 'Unexploded ordnance hazard',
  danger_area: 'Military danger area (unspecified)',
  warning: 'Mapped mine warning',
});

function text(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function validCoord(c) {
  return (
    Array.isArray(c) &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1]) &&
    Math.abs(c[0]) <= 180 &&
    Math.abs(c[1]) <= 90
  );
}

/**
 * Validate one bundled feature. Polygons become `polygons:[[outer, ...holes]]`
 * (rings as [lon,lat] arrays); lines `lines:[[...]]`; points none.
 * @param {object} feature
 * @returns {object|null}
 */
export function normaliseMineFeature(feature) {
  const p = feature?.properties;
  const g = feature?.geometry;
  if (!p || !g) return null;
  const id = text(p.id, 40);
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const polygons = [];
  const lines = [];
  const ringOk = (ring) =>
    Array.isArray(ring) && ring.length >= 4 && ring.every(validCoord);
  if (g.type === 'Polygon') {
    if (g.coordinates?.every?.(ringOk)) polygons.push(g.coordinates);
  } else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates || [])
      if (poly?.every?.(ringOk)) polygons.push(poly);
  } else if (g.type === 'LineString') {
    if (g.coordinates?.length >= 2 && g.coordinates.every(validCoord))
      lines.push(g.coordinates);
  } else if (g.type !== 'Point') {
    return null;
  }
  if ((g.type === 'Polygon' || g.type === 'MultiPolygon') && !polygons.length)
    return null;
  const kind = MINE_KIND_LABELS[p.kind] ? p.kind : 'minefield';
  return {
    id,
    kind,
    name: text(p.name, 120),
    description: text(p.description, 300),
    descriptionLocal: text(p.descriptionLocal, 300),
    note: text(p.note, 300),
    osmSource: text(p.osmSource, 200),
    areaKm2:
      Number.isFinite(p.areaKm2) && p.areaKm2 >= 0 ? Number(p.areaKm2) : null,
    lat,
    lon,
    polygons,
    lines,
  };
}

/** "w123" → https://www.openstreetmap.org/way/123 */
export function osmUrl(id) {
  const m = /^([nwr])(\d{1,12})$/.exec(String(id || ''));
  if (!m) return null;
  const type = { n: 'node', w: 'way', r: 'relation' }[m[1]];
  return `https://www.openstreetmap.org/${type}/${m[2]}`;
}

function formatArea(km2) {
  if (km2 === null) return null;
  return km2 >= 1 ? `${km2.toFixed(2)} km²` : `${Math.round(km2 * 100)} ha`;
}

export function mineLabel(record) {
  return {
    title:
      record.kind === 'minefield'
        ? 'Mine-suspected area'
        : MINE_KIND_LABELS[record.kind],
    details: record.areaKm2 !== null ? [formatArea(record.areaKm2)] : [],
    accent: MINE_RED,
  };
}

export function mineCard(record) {
  const links = [...MINE_OFFICIAL_LINKS];
  const osm = osmUrl(record.id);
  if (osm) links.push({ label: 'OSM feature', url: osm });
  return {
    title: record.name || MINE_KIND_LABELS[record.kind],
    subtitle: 'OpenStreetMap community mapping',
    accent: MINE_RED,
    warning: MINE_WARNING,
    rows: [
      ['Type', MINE_KIND_LABELS[record.kind]],
      ['Mapped area', formatArea(record.areaKm2)],
      ['Description', record.description],
      ['Local text', record.descriptionLocal],
      ['Note', record.note],
      ['OSM source tag', record.osmSource],
    ],
    links,
    footer: '© OpenStreetMap contributors (ODbL).',
  };
}

/**
 * Diagonal hatch segments clipped to a polygon (even-odd over all rings, so
 * holes stay open). Works in a local equirectangular metre frame around the
 * first vertex — the polygons are a few km across at most.
 * @param {Array<Array<[number,number]>>} rings Outer ring then holes, [lon,lat].
 * @param {object} [options]
 * @param {number} [options.spacingM=70]
 * @param {number} [options.angleDeg=45]
 * @param {number} [options.maxSegments=400]
 * @returns {Array<[[number,number],[number,number]]>} Segments in [lon,lat].
 */
export function hatchSegments(
  rings,
  { spacingM = 70, angleDeg = 45, maxSegments = 400 } = {},
) {
  if (!Array.isArray(rings) || !rings.length || !rings[0]?.length) return [];
  const [lon0, lat0] = rings[0][0];
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Rotate by -angle so hatch lines become horizontal (constant v).
  const toUV = ([lon, lat]) => {
    const x = (lon - lon0) * kx;
    const y = (lat - lat0) * ky;
    return [x * cos + y * sin, -x * sin + y * cos];
  };
  const fromUV = (u, v) => {
    const x = u * cos - v * sin;
    const y = u * sin + v * cos;
    return [lon0 + x / kx, lat0 + y / ky];
  };
  const edges = [];
  let minV = Infinity;
  let maxV = -Infinity;
  for (const ring of rings) {
    const pts = ring.map(toUV);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (p[1] === q[1]) continue;
      edges.push([p, q]);
      minV = Math.min(minV, p[1], q[1]);
      maxV = Math.max(maxV, p[1], q[1]);
    }
  }
  if (!edges.length) return [];
  const out = [];
  const first = Math.ceil(minV / spacingM) * spacingM;
  for (let v = first; v <= maxV && out.length < maxSegments; v += spacingM) {
    const xs = [];
    for (const [p, q] of edges) {
      const lo = Math.min(p[1], q[1]);
      const hi = Math.max(p[1], q[1]);
      // Half-open so a vertex exactly on the scanline counts once.
      if (v < lo || v >= hi) continue;
      xs.push(p[0] + ((v - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length && out.length < maxSegments; i += 2) {
      if (xs[i + 1] - xs[i] < 1) continue;
      out.push([fromUV(xs[i], v), fromUV(xs[i + 1], v)]);
    }
  }
  return out;
}

/**
 * Canton/entity breakdown of the suspected hazardous area, validated.
 * @param {object} raw Bundled suspected-area JSON.
 */
export function normaliseSuspectedStats(raw) {
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  return {
    asOf: text(raw?.asOf, 40),
    source: text(raw?.source, 200),
    url:
      typeof raw?.url === 'string' && raw.url.startsWith('https://')
        ? raw.url
        : null,
    rows: rows
      .map((r) => ({
        area: text(r?.area, 60),
        level:
          r?.level === 'entity' || r?.level === 'total' ? r.level : 'canton',
        km2: Number.isFinite(r?.km2) ? r.km2 : null,
      }))
      .filter((r) => r.area && r.km2 !== null),
  };
}
