/**
 * Pure helpers for the ba-power layer: bundled plant/dam/grid validation,
 * marker styling and the live ENTSO-E presentation. No Cesium, no DOM.
 */

export const FUEL_COLORS = Object.freeze({
  hydro: '#3fa9f5',
  pumped: '#8a7dff',
  coal: '#b08968',
  wind: '#6fe3c1',
  solar: '#ffd23f',
  biomass: '#8bc34a',
  oil: '#ff8a65',
  gas: '#ff7043',
  other: '#bdbdbd',
});
export const FUEL_LABELS = Object.freeze({
  hydro: 'Hydro',
  pumped: 'Pumped-storage hydro',
  coal: 'Coal / lignite',
  wind: 'Wind',
  solar: 'Solar',
  biomass: 'Biomass',
  oil: 'Oil',
  gas: 'Gas',
  other: 'Other',
});
export const DAM_COLOR = '#9ec9e8';
export const LINE_COLORS = Object.freeze({ 400: '#ff5a36', 220: '#ffa726' });
/** Where flow arcs start: roughly the middle of BiH. */
export const BA_HUB = Object.freeze({ lat: 44.05, lon: 17.95 });

function text(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function inBih(lat, lon) {
  return lat >= 42.4 && lat <= 45.4 && lon >= 15.6 && lon <= 19.8;
}

/**
 * Validate a plants.geojson feature (power plant or dam).
 * @param {object} feature
 * @returns {object|null}
 */
export function normalisePowerFeature(feature) {
  const p = feature?.properties;
  const c = feature?.geometry?.coordinates;
  if (!p || feature?.geometry?.type !== 'Point' || !Array.isArray(c))
    return null;
  const [lon, lat] = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBih(lat, lon))
    return null;
  const kind = p.kind === 'dam' ? 'dam' : p.kind === 'plant' ? 'plant' : null;
  const id = text(p.id, 40);
  if (!kind || !id) return null;
  const mw = Number.isFinite(p.mw) && p.mw > 0 && p.mw < 5000 ? p.mw : null;
  return {
    id,
    kind,
    name: text(p.name, 120),
    fuel: FUEL_COLORS[p.fuel] ? p.fuel : kind === 'plant' ? 'other' : null,
    mw,
    operator: text(p.operator, 120),
    osm: /^[nwr]\d+$/.test(p.osm || '') ? p.osm : null,
    wri: /^[A-Z0-9]{4,20}$/.test(p.wri || '') ? p.wri : null,
    wikidata: /^Q\d+$/.test(p.wikidata || '') ? p.wikidata : null,
    year: Number.isInteger(p.year) ? p.year : null,
    note: text(p.note, 240),
    major: p.major === true,
    heightM: Number.isFinite(p.heightM) ? p.heightM : null,
    lat,
    lon,
  };
}

/** Marker pixel size by installed capacity (area ∝ MW). */
export function plantPixelSize(mw) {
  if (!Number.isFinite(mw) || mw <= 0) return 6;
  return Math.max(6, Math.min(34, 5 + Math.sqrt(mw) * 1.05));
}

export function formatMw(mw) {
  if (!Number.isFinite(mw)) return null;
  if (mw >= 100) return `${Math.round(mw)} MW`;
  if (mw >= 1) return `${Number(mw.toFixed(1))} MW`;
  return `${Math.round(mw * 1000)} kW`;
}

export function plantTitle(record) {
  if (record.name) return record.name;
  if (record.kind === 'dam') return 'Dam';
  return `${FUEL_LABELS[record.fuel] || 'Power'} plant`;
}

export function powerLabel(record) {
  const title = plantTitle(record);
  const details = [];
  if (record.kind === 'plant') {
    const mw = formatMw(record.mw);
    details.push([FUEL_LABELS[record.fuel], mw].filter(Boolean).join(' · '));
  } else {
    details.push('Dam');
  }
  return {
    title: title.length > 34 ? `${title.slice(0, 31)}…` : title,
    details,
    accent: record.kind === 'dam' ? DAM_COLOR : FUEL_COLORS[record.fuel],
  };
}

export function powerPriority(record) {
  if (record.kind === 'dam') return 200 + (record.heightM || 0);
  return (record.major ? 3000 : 0) + (record.mw || 0) + (record.name ? 100 : 0);
}

export function powerCard(record) {
  const links = [];
  if (record.osm) {
    const type = { n: 'node', w: 'way', r: 'relation' }[record.osm[0]];
    links.push({
      label: 'OSM',
      url: `https://www.openstreetmap.org/${type}/${record.osm.slice(1)}`,
    });
  }
  if (record.wikidata)
    links.push({
      label: 'Wikidata',
      url: `https://www.wikidata.org/wiki/${record.wikidata}`,
    });
  return {
    title: plantTitle(record),
    subtitle:
      record.kind === 'dam'
        ? 'Dam (OSM waterway=dam)'
        : [FUEL_LABELS[record.fuel], formatMw(record.mw)]
            .filter(Boolean)
            .join(' · '),
    accent: record.kind === 'dam' ? DAM_COLOR : FUEL_COLORS[record.fuel],
    rows: [
      ['Operator', record.operator],
      ['Installed', formatMw(record.mw)],
      ['Since', record.year],
      ['Dam height', record.heightM ? `${record.heightM} m` : null],
      ['WRI GPPD id', record.wri],
      ['Note', record.note],
    ],
    links,
    footer:
      'Plants: © OpenStreetMap contributors (ODbL) and WRI Global Power Plant Database (CC BY 4.0); capacities are nameplate values and may be out of date.',
  };
}

/**
 * Elevated great-circle-ish arc between two points as [lon, lat, h] triples.
 * Linear interpolation is fine at these distances (< 400 km).
 * @param {{lat:number,lon:number}} from
 * @param {{lat:number,lon:number}} to
 * @param {{steps?:number, peakM?:number}} [options]
 * @returns {number[]} Flat [lon, lat, h, lon, lat, h, ...].
 */
export function flowArc(from, to, { steps = 32, peakM = 45_000 } = {}) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push(
      from.lon + (to.lon - from.lon) * t,
      from.lat + (to.lat - from.lat) * t,
      4 * peakM * t * (1 - t) + 1500,
    );
  }
  return out;
}

/**
 * Direction and wording for one neighbour flow.
 * @param {{neighbour:string, netImportMw:number|null, importMw:number|null, exportMw:number|null}} flow
 * @returns {{direction:'import'|'export'|'none', mw:number|null, text:string}}
 */
export function describeFlow(flow) {
  const net = flow?.netImportMw;
  if (!Number.isFinite(net))
    return {
      direction: 'none',
      mw: null,
      text: `${flow?.neighbour ?? '?'} ↔ BA n/a`,
    };
  if (Math.abs(net) < 1)
    return { direction: 'none', mw: 0, text: `${flow.neighbour} ↔ BA 0 MW` };
  return net > 0
    ? {
        direction: 'import',
        mw: Math.round(net),
        text: `${flow.neighbour} → BA ${Math.round(net)} MW`,
      }
    : {
        direction: 'export',
        mw: Math.round(-net),
        text: `BA → ${flow.neighbour} ${Math.round(-net)} MW`,
      };
}

function hhmm(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
    : null;
}

/**
 * One-line summary for the layer row and the live card.
 * @param {ReturnType<import('./entsoe.js').normaliseLivePayload>} live
 */
export function liveSummaryLine(live) {
  if (!live) return null;
  if (!live.configured)
    return 'static plants & grid · live ENTSO-E needs ENTSOE_API_TOKEN (server env)';
  const parts = [];
  if (live.load) parts.push(`load ${Math.round(live.load.mw)} MW`);
  if (live.generation)
    parts.push(`gen ${Math.round(live.generation.totalMw)} MW`);
  const nets = live.flows.map((f) => f.netImportMw).filter(Number.isFinite);
  if (nets.length) {
    const net = nets.reduce((a, b) => a + b, 0);
    parts.push(
      net >= 0
        ? `net import ${Math.round(net)} MW`
        : `net export ${Math.round(-net)} MW`,
    );
  }
  const at = hhmm(live.load?.at || live.generation?.at);
  if (!parts.length)
    return live.error ? `ENTSO-E: ${live.error}` : 'ENTSO-E: no recent data';
  return `ENTSO-E ${parts.join(' · ')}${at ? ` (${at})` : ''}${live.stale ? ' · stale' : ''}`;
}

export function liveCard(live) {
  const rows = [
    ['Actual load', live.load ? `${Math.round(live.load.mw)} MW` : 'n/a'],
    [
      'Generation',
      live.generation ? `${Math.round(live.generation.totalMw)} MW` : 'n/a',
    ],
  ];
  for (const g of live.generation?.byType || [])
    rows.push([`  ${g.label}`, `${g.mw} MW`]);
  if (Number.isFinite(live.generation?.pumpingMw))
    rows.push(['  Pumping (consumption)', `${live.generation.pumpingMw} MW`]);
  for (const f of live.flows) {
    rows.push([
      `Flow ${f.name}`,
      `${describeFlow(f).text} (in ${f.importMw ?? 'n/a'} / out ${f.exportMw ?? 'n/a'})`,
    ]);
  }
  rows.push(['Data time', hhmm(live.load?.at || live.generation?.at) || 'n/a']);
  return {
    title: 'BiH power system — live',
    subtitle: 'ENTSO-E bidding zone BA (10YBA-JPCC-----D)',
    accent: '#ffd23f',
    warning: live.stale ? 'Showing the last successful refresh (stale).' : null,
    rows,
    links: [
      { label: 'ENTSO-E Transparency', url: 'https://transparency.entsoe.eu/' },
    ],
    footer:
      'Source: ENTSO-E Transparency Platform (actual total load A65, generation per type A75, physical flows A11). Physical flows are measured at the borders; arcs are drawn to neighbouring capitals for legibility.',
  };
}
