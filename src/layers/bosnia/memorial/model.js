/**
 * Pure helpers for the ba-memorial ("War Memory 1992–95") layer.
 * Wording comes verbatim from the curated, sourced bundle; nothing here adds
 * interpretation. No Cesium, no DOM.
 */

export const MEMORIAL_COLOR = '#cfc8bd';
export const MEMORIAL_KINDS = Object.freeze({
  memorial: 'Memorial',
  site: 'Site of a documented crime',
  camp: 'Former detention camp',
  context: 'Context',
});

function text(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Validate one curated site; null when it lacks a position, a description
 * or at least one https source (an unsourced claim never renders).
 * @param {object} raw
 * @returns {object|null}
 */
export function normaliseMemorialSite(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < 42.4 ||
    lat > 45.4 ||
    lon < 15.6 ||
    lon > 19.8
  )
    return null;
  const id = text(raw.id, 60);
  const name = text(raw.name, 120);
  const description = text(raw.description, 600);
  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .map((s) => ({ label: text(s?.label, 60), url: httpsUrl(s?.url) }))
    .filter((s) => s.label && s.url)
    .slice(0, 6);
  if (!id || !name || !description || sources.length === 0) return null;
  return {
    id,
    name,
    nameLocal: text(raw.nameLocal, 120),
    date: text(raw.date, 60),
    kind: MEMORIAL_KINDS[raw.kind] ? raw.kind : 'site',
    description,
    approximate: raw.approximate === true,
    sources,
    lat,
    lon,
  };
}

export function memorialLabel(site) {
  return {
    title: site.name.length > 34 ? `${site.name.slice(0, 31)}…` : site.name,
    details: site.date ? [site.date] : [],
    accent: MEMORIAL_COLOR,
  };
}

export function memorialCard(site) {
  return {
    title: site.name,
    subtitle: [site.nameLocal !== site.name ? site.nameLocal : null, site.date]
      .filter(Boolean)
      .join(' · '),
    accent: MEMORIAL_COLOR,
    text: site.description,
    rows: [
      ['Category', MEMORIAL_KINDS[site.kind]],
      [
        'Position',
        site.approximate ? 'approximate (settlement level)' : 'site',
      ],
    ],
    links: site.sources,
    footer:
      'Summaries of findings by the ICTY/IRMCT, the ICJ or courts in BiH, or descriptions of memorials. No victim-level data. See the linked sources for the full record.',
  };
}

export function memorialAnalyst(site) {
  return {
    id: site.id,
    name: site.name,
    date: site.date,
    kind: site.kind,
    lat: site.lat,
    lon: site.lon,
    approximate: site.approximate,
  };
}
