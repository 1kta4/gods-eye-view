/**
 * Pure model for Copernicus EMS Rapid Mapping activations in BiH.
 * Bundled: activations.json (one row per activation) + <CODE>.geojson with
 * observed flood extent / burnt area / landslide delineations clipped to BiH
 * and the area-of-interest outlines.
 */
import {
  pathsFromGeometry,
  polygonsFromGeometry,
} from '../boundaries/model.js';

export const EMS_KINDS = Object.freeze(['flood', 'fire', 'landslide']);

export const EMS_COLORS = Object.freeze({
  flood: '#2f8cff',
  fire: '#ff4f1f',
  landslide: '#9a5b2e',
});

export const EMS_KIND_LABEL = Object.freeze({
  flood: 'Flood',
  fire: 'Wildfire',
  landslide: 'Landslide / debris flow',
});

const CODE_RE = /^EMSR\d{3,4}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function text(value, max = 400) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Public activation page for a code. */
export function activationUrl(code) {
  return `https://mapping.emergency.copernicus.eu/activations/${code}/`;
}

/**
 * Validate the bundled activation index.
 * @param {object} json activations.json payload.
 * @returns {object[]} Activations, newest first.
 */
export function normalizeActivations(json) {
  if (!Array.isArray(json?.activations))
    throw new Error('Activation index missing');
  const out = [];
  const seen = new Set();
  for (const a of json.activations) {
    const code = String(a?.code || '');
    if (!CODE_RE.test(code) || seen.has(code)) continue;
    const lon = finite(a.lon);
    const lat = finite(a.lat);
    if (lon == null || lat == null || Math.abs(lon) > 180 || Math.abs(lat) > 90)
      continue;
    const activationTime = ISO_RE.test(a.activationTime || '')
      ? a.activationTime
      : null;
    if (!activationTime) continue;
    seen.add(code);
    const mapped = {};
    for (const kind of EMS_KINDS) {
      const ha = finite(a.mappedHa?.[kind]);
      if (ha != null && ha >= 0) mapped[kind] = ha;
    }
    out.push({
      code,
      name: text(a.name, 120),
      category: EMS_KINDS.includes(a.category) ? a.category : 'flood',
      hasLandslide: mapped.landslide != null,
      activationTime,
      eventTime: ISO_RE.test(a.eventTime || '') ? a.eventTime : null,
      countries: Array.isArray(a.countries)
        ? a.countries.map((c) => text(c, 60)).filter(Boolean)
        : [],
      reason: text(a.reason, 600),
      note: text(a.note, 200),
      lon,
      lat,
      aoisInBiH: Array.isArray(a.aoisInBiH)
        ? a.aoisInBiH.map((x) => text(x, 60)).filter(Boolean)
        : [],
      products: finite(a.products),
      mappedHa: mapped,
      geometry:
        typeof a.geometry === 'string' &&
        /^EMSR\d{3,4}\.geojson$/.test(a.geometry)
          ? a.geometry
          : null,
      url: activationUrl(code),
    });
  }
  out.sort((x, y) => (x.activationTime < y.activationTime ? 1 : -1));
  return out;
}

/**
 * Split one activation's GeoJSON into delineation polygons and AOI outlines.
 * @param {object} geojson
 * @param {string} code Expected activation code.
 */
export function normalizeEventGeometry(geojson, code) {
  const out = { polygons: [], aois: [] };
  for (const feature of geojson?.features || []) {
    const p = feature?.properties || {};
    if (p.code !== code) continue;
    if (p.kind === 'aoi') {
      for (const poly of polygonsFromGeometry(feature.geometry))
        out.aois.push({ name: text(p.aoi, 60), ring: poly[0] });
      for (const path of pathsFromGeometry(feature.geometry))
        out.aois.push({ name: text(p.aoi, 60), ring: path });
    } else if (EMS_KINDS.includes(p.kind)) {
      for (const rings of polygonsFromGeometry(feature.geometry))
        out.polygons.push({ kind: p.kind, rings });
    }
  }
  return out;
}

function monthYear(iso) {
  const [y, m] = iso.slice(0, 7).split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[Number(m) - 1] || m} ${y}`;
}

/** Short label for the map marker. */
export function activationLabel(a) {
  return `${a.code} · ${monthYear(a.activationTime)}`;
}

/** Wrap long text into card lines of at most `width` characters. */
export function wrapLines(value, width = 64, maxLines = 3) {
  const words = text(value, 1000).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else line = `${line} ${word}`.trim();
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (
    lines.length === maxLines &&
    words.join(' ').length > lines.join(' ').length
  )
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]?$/, '')}…`;
  return lines;
}

/** Card copy for one activation. */
export function activationCard(a) {
  const kinds = [
    a.category,
    ...(a.hasLandslide && a.category !== 'landslide' ? ['landslide'] : []),
  ];
  const details = [
    `${kinds.map((k) => EMS_KIND_LABEL[k]).join(' + ')} · activated ${a.activationTime.slice(0, 10)}`,
  ];
  if (a.name) details.push(a.name);
  if (a.note) details.push(...wrapLines(a.note, 64, 2));
  else if (a.reason) details.push(...wrapLines(a.reason, 64, 2));
  const mapped = Object.entries(a.mappedHa)
    .map(
      ([k, ha]) =>
        `${EMS_KIND_LABEL[k].split(' ')[0].toLowerCase()} ${ha >= 100 ? Math.round(ha) : ha} ha`,
    )
    .join(' · ');
  if (mapped) details.push(`Mapped in BiH: ${mapped}`);
  else if (!a.geometry)
    details.push('Delineations not public — marker at activation centroid');
  if (a.aoisInBiH.length)
    details.push(`AOIs: ${a.aoisInBiH.join(', ')}`.slice(0, 80));
  details.push(a.url.replace('https://', ''));
  return { title: `${a.code} — ${EMS_KIND_LABEL[a.category]}`, details };
}

/** JSON-safe analyst rows. */
export function activationAnalystRecords(activations) {
  return activations.map((a) => ({
    id: a.code,
    name: a.name,
    category: a.category,
    activationTime: a.activationTime,
    lat: a.lat,
    lon: a.lon,
    mappedHa: { ...a.mappedHa },
    url: a.url,
  }));
}
