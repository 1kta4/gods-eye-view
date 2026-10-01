/**
 * Bosnia and Herzegovina air-quality proxy (fixed upstreams only):
 *   GET /api/ba/air  merged stations from
 *     - FHMZ hourly AQI table (FBiH official network, HTML scrape, 10 min cache)
 *     - RHMZ RS EkoPodaci.json (RS official network, 10 min cache)
 *     - Sensor.Community country=BA (citizen PM sensors, 5 min cache)
 *     - WAQI map/bounds, only when process.env.WAQI_TOKEN is set (10 min cache)
 * The token never leaves the server; every upstream is capped, timed out and
 * normalised before it reaches the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { defaultSourceRoot } from '../common/source-root.js';
import { createCachedSource, fetchUpstreamText, jsonRoute } from './weather.js';
import {
  mergeAirStations,
  parseFhmzTable,
  parseRhmzRs,
  parseSensorCommunity,
  parseWaqiBounds,
} from '../../../src/layers/bosnia/airQuality/model.js';

const MINUTE = 60_000;
const FHMZ_URL = 'https://www.fhmzbih.gov.ba/latinica/ZRAK/AQI-satne.php';
const RHMZRS_URL = 'https://www.rhmzrs.com/data/feeds/EkoPodaci.json';
const SENSOR_COMMUNITY_URL =
  'https://data.sensor.community/airrohr/v1/filter/country=BA';
const WAQI_BOUNDS = '42.5,15.7,45.3,19.7';

function loadStationTable(sourceRoot) {
  const file = path.join(
    sourceRoot,
    'src/data/local_data/bosnia/air/fhmz-stations.json',
  );
  return JSON.parse(fs.readFileSync(file, 'utf8')).stations;
}

/** Build the air plugin; options are test seams. */
export function createAirProxy({
  fetchImpl = fetch,
  env = process.env,
  sourceRoot = defaultSourceRoot,
} = {}) {
  let stationTable = null;
  const table = () => (stationTable ??= loadStationTable(sourceRoot));
  const json = (text) => JSON.parse(text);
  const sources = {
    fhmz: createCachedSource({
      ttlMs: 10 * MINUTE,
      maxStaleMs: 3 * 60 * MINUTE,
      load: async () => {
        const parsed = parseFhmzTable(
          await fetchUpstreamText(FHMZ_URL, {
            fetchImpl,
            maxBytes: 1024 * 1024,
            accept: 'text/html',
          }),
          table(),
        );
        if (!parsed.stations.length) throw new Error('fhmz_no_stations');
        if (parsed.unknown.length)
          console.warn(
            '[ba-air] FHMZ stations without coordinates:',
            parsed.unknown.join(', '),
          );
        return parsed;
      },
    }),
    rhmzrs: createCachedSource({
      ttlMs: 10 * MINUTE,
      maxStaleMs: 3 * 60 * MINUTE,
      load: async () =>
        parseRhmzRs(
          json(
            await fetchUpstreamText(RHMZRS_URL, {
              fetchImpl,
              maxBytes: 256 * 1024,
              accept: 'application/json',
            }),
          ),
        ),
    }),
    sensorCommunity: createCachedSource({
      ttlMs: 5 * MINUTE,
      maxStaleMs: 60 * MINUTE,
      load: async () =>
        parseSensorCommunity(
          json(
            await fetchUpstreamText(SENSOR_COMMUNITY_URL, {
              fetchImpl,
              maxBytes: 4 * 1024 * 1024,
              accept: 'application/json',
            }),
          ),
        ),
    }),
  };
  const token = String(env.WAQI_TOKEN || '').trim();
  if (/^[A-Za-z0-9]{8,64}$/.test(token)) {
    sources.waqi = createCachedSource({
      ttlMs: 10 * MINUTE,
      maxStaleMs: 60 * MINUTE,
      load: async () =>
        parseWaqiBounds(
          json(
            await fetchUpstreamText(
              `https://api.waqi.info/map/bounds?latlng=${WAQI_BOUNDS}&token=${encodeURIComponent(token)}`,
              { fetchImpl, maxBytes: 1024 * 1024, accept: 'application/json' },
            ),
          ),
        ),
    });
  }

  return jsonRoute('/api/ba/air', async () => {
    const names = Object.keys(sources);
    const results = await Promise.all(names.map((name) => sources[name].get()));
    const status = {};
    const official = [];
    const secondary = [];
    names.forEach((name, i) => {
      const result = results[i];
      const stations = result.value?.stations || [];
      status[name] = {
        ok: Boolean(result.value),
        stale: result.stale,
        count: stations.length,
        fetchedAt: result.fetchedAt,
        observedAt: result.value?.observedAt ?? null,
        error: result.value ? null : result.error || 'unavailable',
      };
      (name === 'fhmz' || name === 'rhmzrs' ? official : secondary).push(
        ...stations,
      );
    });
    if (!sources.waqi)
      status.waqi = { ok: false, disabled: true, reason: 'WAQI_TOKEN not set' };
    return {
      schemaVersion: 1,
      fetchedAt: Date.now(),
      sources: status,
      stations: mergeAirStations({ official, secondary }),
    };
  });
}

/** Vite middleware plugins for the Bosnia air layers. */
export function plugins() {
  return [createAirProxy()];
}
