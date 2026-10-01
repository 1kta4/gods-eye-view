#!/usr/bin/env node
/**
 * Regenerate src/data/local_data/bosnia/airports/*.geojson.
 *
 *   node src/layers/bosnia/airports/build-data.mjs [AIRAC-date]
 *
 * Fetches OurAirports airports.csv + runways.csv (public domain) and the
 * current BHANSA eAIP (ENR 2.1 TMAs, ENR 5.1 P/R/D areas, AD 2.17 CTRs),
 * parses them with ./aip.js and ./model.js and writes compact GeoJSON.
 * Not imported by the app.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { airportsFromRows, parseCsv, runwaysFromRows } from './model.js';
import { parseAd217Ctr, parseEnr21Tmas, parseEnr51 } from './aip.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const outDir = path.join(root, 'src/data/local_data/bosnia/airports');
const UA = 'GodsEyeView-BiH/0.1 (personal local use)';
const airac = process.argv[2] || '2026-10-01';
const EAIP = `https://eaip.bhansa.gov.ba/${airac}-AIRAC/html/eAIP`;
const AERODROMES = ['LQSA', 'LQBK', 'LQMO', 'LQTZ'];

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

const round = (v) => Math.round(v * 1e6) / 1e6;
const feature = (properties, geometry) => ({
  type: 'Feature',
  properties,
  geometry,
});
const polygon = (ring) => ({
  type: 'Polygon',
  coordinates: [ring.map(([x, y]) => [round(x), round(y)])],
});

const lines = JSON.parse(
  await readFile(
    path.join(root, 'src/data/local_data/bosnia/boundaries/lines.geojson'),
    'utf8',
  ),
);
const national = lines.features.find((f) => f.properties.level === 'national');
const border = national.geometry.coordinates.reduce(
  (a, b) => (b.length > a.length ? b : a),
  [],
);

const airportRows = parseCsv(
  await get('https://davidmegginson.github.io/ourairports-data/airports.csv'),
);
const airports = airportsFromRows(airportRows, 'BA');
const refs = new Set(airports.map((a) => a.ref));
const runways = runwaysFromRows(
  parseCsv(
    await get('https://davidmegginson.github.io/ourairports-data/runways.csv'),
  ),
  refs,
);

const areas = [];
areas.push(...parseEnr51(await get(`${EAIP}/LQ-ENR-5.1-en-GB.html`)));
areas.push(
  ...parseEnr21Tmas(await get(`${EAIP}/LQ-ENR-2.1-en-GB.html`), border),
);
for (const icao of AERODROMES) {
  const ctr = parseAd217Ctr(await get(`${EAIP}/LQ-AD-2.${icao}-en-GB.html`));
  if (ctr) areas.push({ ...ctr, aerodrome: icao });
  else console.warn(`No CTR parsed for ${icao}`);
}

await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, 'airports.geojson'),
  JSON.stringify({
    type: 'FeatureCollection',
    features: airports.map(({ lon, lat, ref, ...p }) =>
      feature(p, { type: 'Point', coordinates: [round(lon), round(lat)] }),
    ),
  }),
);
await writeFile(
  path.join(outDir, 'runways.geojson'),
  JSON.stringify({
    type: 'FeatureCollection',
    features: runways.map(({ line, ...p }) =>
      feature(p, {
        type: 'LineString',
        coordinates: line.map(([x, y]) => [round(x), round(y)]),
      }),
    ),
  }),
);
await writeFile(
  path.join(outDir, 'airspace.geojson'),
  JSON.stringify({
    type: 'FeatureCollection',
    airac,
    features: areas.map(({ ring, ...p }) => feature(p, polygon(ring))),
  }),
);
const byType = {};
for (const a of areas) byType[a.type] = (byType[a.type] || 0) + 1;
console.log(
  `airports ${airports.length}, runways ${runways.length}, airspace`,
  byType,
);
