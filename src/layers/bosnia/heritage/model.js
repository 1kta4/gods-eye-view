/**
 * Pure helpers for the ba-heritage layer: validate bundled features and
 * build their label/card/analyst presentation. No Cesium, no DOM.
 */

export const HERITAGE_COLORS = Object.freeze({
  unesco: '#f5c242',
  national: '#f2f2f2',
});

const BIH_BOUNDS = { south: 42.4, north: 45.4, west: 15.6, east: 19.8 };

function text(value, max = 200) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Validate one bundled GeoJSON feature into a flat record, or null.
 * @param {object} feature
 * @returns {object|null}
 */
export function normaliseHeritageFeature(feature) {
  const p = feature?.properties;
  const c = feature?.geometry?.coordinates;
  if (!p || feature?.geometry?.type !== 'Point' || !Array.isArray(c))
    return null;
  const [lon, lat] = c;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < BIH_BOUNDS.south ||
    lat > BIH_BOUNDS.north ||
    lon < BIH_BOUNDS.west ||
    lon > BIH_BOUNDS.east
  )
    return null;
  const tier = p.tier === 'unesco' ? 'unesco' : 'national';
  const name = text(p.name, 160);
  const id = text(p.id, 80);
  if (!name || !id) return null;
  const year = Number.isInteger(p.year) ? p.year : null;
  return {
    id,
    tier,
    name,
    nameEn: text(p.nameEn, 160),
    site: text(p.site, 160),
    year,
    ref: text(p.ref, 40),
    whc: text(p.whc, 200),
    place: text(p.place, 80),
    kind: text(p.kind, 80),
    tentative: p.tentative === true,
    wikidata: /^Q\d+$/.test(p.wikidata || '') ? p.wikidata : null,
    kons: /^\d{1,6}$/.test(String(p.kons ?? '')) ? String(p.kons) : null,
    image: text(p.image, 240),
    wiki: text(p.wiki, 400),
    lat,
    lon,
  };
}

/** Ambient label: UNESCO sites always outrank national monuments. */
export function heritageLabel(record) {
  const details = [];
  if (record.tier === 'unesco')
    details.push(`UNESCO ${record.year ?? ''}`.trim());
  else if (record.place) details.push(record.place);
  const title =
    record.name.length > 34 ? `${record.name.slice(0, 31)}…` : record.name;
  return {
    title,
    details,
    accent: HERITAGE_COLORS[record.tier],
  };
}

export function heritagePriority(record) {
  return (
    (record.tier === 'unesco' ? 5000 : 1000) +
    (record.wiki ? 100 : 0) +
    (record.image ? 50 : 0)
  );
}

/** Detail-card model (see baInfoCard.js). */
export function heritageCard(record) {
  const links = [];
  if (record.whc) links.push({ label: 'UNESCO', url: record.whc });
  if (record.wiki) links.push({ label: 'Wikipedia', url: record.wiki });
  if (record.wikidata)
    links.push({
      label: 'Wikidata',
      url: `https://www.wikidata.org/wiki/${record.wikidata}`,
    });
  if (record.image)
    links.push({
      label: 'Photo (Commons)',
      url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(record.image)}`,
    });
  const subtitle =
    record.tier === 'unesco'
      ? `UNESCO World Heritage · inscribed ${record.year ?? '—'}`
      : 'National Monument of Bosnia and Herzegovina';
  return {
    title: record.name,
    subtitle,
    accent: HERITAGE_COLORS[record.tier],
    image: record.image,
    rows: [
      ['English', record.nameEn],
      [
        'World Heritage property',
        record.tier === 'unesco' ? record.site : null,
      ],
      ['UNESCO ref.', record.ref],
      ['Type', record.kind],
      ['Place', record.place],
      ['KONS no.', record.kons],
      ['UNESCO tentative list', record.tentative ? 'yes' : null],
    ],
    links,
    footer:
      record.tier === 'unesco'
        ? 'UNESCO World Heritage Centre; positions from the UNESCO component list / Wikidata (CC0).'
        : 'Designation: Commission to Preserve National Monuments of BiH (KONS). Data: Wikidata (CC0); photo via Wikimedia Commons (see file page for licence).',
  };
}

export function heritageAnalyst(record) {
  return {
    id: record.id,
    name: record.name,
    tier: record.tier,
    year: record.year,
    place: record.place,
    kind: record.kind,
    lat: record.lat,
    lon: record.lon,
    wikidata: record.wikidata,
  };
}
