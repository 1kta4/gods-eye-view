import { createStationLayer } from './airQuality/stationLayer.js';
import {
  BA_TOWNS,
  temperatureColor,
  townAnalystRecord,
  townCard,
  townLabel,
} from './weatherNow/model.js';

const ENDPOINT = '/api/ba/weather/now';
const TOWN_RANK = new Map(BA_TOWNS.map((town, i) => [town.id, i]));

const CREDITS = Object.freeze([
  {
    key: 'ba-open-meteo',
    html: 'Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)',
  },
]);

/** Validate the proxy payload into town items + panel stats. */
export function readWeatherNowPayload(payload) {
  if (!payload || !Array.isArray(payload.towns))
    throw new Error('weather proxy returned no towns');
  const items = payload.towns.filter(
    (t) =>
      t &&
      typeof t.id === 'string' &&
      Number.isFinite(t.lat) &&
      Number.isFinite(t.lon),
  );
  if (!items.length) throw new Error(payload.error || 'no towns');
  const temps = items
    .map((t) => t.temperature)
    .filter((t) => Number.isFinite(t));
  return {
    items,
    stats: {
      stale: payload.stale === true,
      loadingLabel: temps.length
        ? `${Math.round(Math.min(...temps))}…${Math.round(Math.max(...temps))}°C`
        : undefined,
    },
  };
}

/** Current conditions for ~28 BiH towns (Open-Meteo, one batched request). */
export function createLayer(deps = {}) {
  const services = deps.localGeoJsonServices || {};
  const fetchImpl = deps.fetchImpl || ((...a) => globalThis.fetch(...a));
  return createStationLayer(
    {
      id: 'ba-weather-now',
      name: 'Weather Now',
      icon: '🌡',
      source: 'Open-Meteo',
      updateInterval: 15 * 60_000,
      credits: CREDITS,
      async load(signal) {
        const response = await fetchImpl(ENDPOINT, { signal });
        if (!response.ok)
          throw new Error(`weather proxy HTTP ${response.status}`);
        return readWeatherNowPayload(await response.json());
      },
      style(town) {
        const color = temperatureColor(town.temperature);
        return {
          color,
          pixelSize: 9,
          outlineColor: '#000000',
          outlineWidth: 1,
          label: townLabel(town),
          // Larger towns first: BA_TOWNS is ordered roughly by size.
          labelPriority: 100 - Math.max(0, TOWN_RANK.get(town.id) ?? 99),
          labelMaxDistance: 1_500_000,
        };
      },
      card: townCard,
      analyst: townAnalystRecord,
    },
    services,
  );
}
