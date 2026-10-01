import { createStationLayer } from './airQuality/stationLayer.js';
import {
  NO_DATA_COLOR,
  airAnalystRecord,
  airStationCard,
  eaqiBand,
} from './airQuality/model.js';

const ENDPOINT = '/api/ba/air';

export const AIR_CREDITS = Object.freeze([
  {
    key: 'ba-air-fhmz',
    html: 'Air quality (FBiH): <a href="https://www.fhmzbih.gov.ba/latinica/ZRAK/AQI-satne.php" target="_blank" rel="noopener">Federalni hidrometeorološki zavod (FHMZ)</a>',
  },
  {
    key: 'ba-air-rhmzrs',
    html: 'Air quality (RS): <a href="https://www.rhmzrs.com/kontrola-kvaliteta-vazduha" target="_blank" rel="noopener">RHMZ Republike Srpske</a>',
  },
  {
    key: 'ba-air-sensor-community',
    html: 'Citizen PM sensors: <a href="https://sensor.community" target="_blank" rel="noopener">Sensor.Community</a> (ODbL)',
  },
]);

const SOURCE_SHORT = {
  fhmz: 'FHMZ',
  rhmzrs: 'RHMZ RS',
  sensorCommunity: 'Sensor.Community',
  waqi: 'WAQI',
};

/** Validate the proxy payload into station items + panel stats. */
export function readAirPayload(payload) {
  if (!payload || !Array.isArray(payload.stations))
    throw new Error('air proxy returned no stations');
  const items = payload.stations.filter(
    (s) =>
      s &&
      typeof s.id === 'string' &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lon),
  );
  const sources = payload.sources || {};
  const failed = Object.entries(sources)
    .filter(([, s]) => s && !s.ok && !s.disabled)
    .map(([k]) => SOURCE_SHORT[k] || k);
  const official = items.filter((s) => s.official).length;
  const worst = items
    .filter((s) => s.official && Number.isFinite(s.level))
    .reduce((max, s) => Math.max(max, s.level), 0);
  if (!items.length)
    throw new Error(
      failed.length ? `${failed.join(', ')} unavailable` : 'no stations',
    );
  const stats = {
    countLabel: `${official} official · ${items.length - official} citizen`,
    degraded: failed.length > 0,
    loadingLabel: failed.length
      ? `${failed.join(', ')} unavailable`
      : worst
        ? `worst official: ${eaqiBand(worst).label}`
        : undefined,
  };
  return { items, stats };
}

/** Bosnia air quality: FHMZ + RHMZ RS official networks, Sensor.Community citizen PM. */
export function createLayer(deps = {}) {
  const services = deps.localGeoJsonServices || {};
  const fetchImpl = deps.fetchImpl || ((...a) => globalThis.fetch(...a));
  return createStationLayer(
    {
      id: 'ba-air-quality',
      name: 'Air Quality',
      icon: '💨',
      source: 'FHMZ · RHMZ RS · Sensor.Community',
      updateInterval: 5 * 60_000,
      credits: AIR_CREDITS,
      async load(signal) {
        const response = await fetchImpl(ENDPOINT, { signal });
        if (!response.ok) throw new Error(`air proxy HTTP ${response.status}`);
        return readAirPayload(await response.json());
      },
      style(station) {
        const band = eaqiBand(station.level);
        const color = band?.color || NO_DATA_COLOR;
        if (station.official)
          return {
            color,
            pixelSize: 15,
            outlineColor: '#FFFFFF',
            outlineWidth: 2,
            label: band ? `${station.name} ${band.level}` : station.name,
            labelPriority: station.level ?? 0,
            labelMaxDistance: 150_000,
          };
        return {
          color,
          pixelSize: 8,
          outlineColor: '#202020',
          outlineWidth: 1,
        };
      },
      card: airStationCard,
      analyst: airAnalystRecord,
    },
    services,
  );
}
