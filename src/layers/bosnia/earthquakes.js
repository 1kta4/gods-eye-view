import {
  createLivePointLayer,
  fetchJson,
} from './earthquakes/livePointLayer.js';
import {
  normalizeQuakeSnapshot,
  quakeAgeClass,
  quakePixelSize,
  QUAKE_AGE_COLORS,
  buildQuakeCard,
} from './earthquakes/records.js';

export const BA_EARTHQUAKES_CREDIT = Object.freeze({
  key: 'ba-earthquakes',
  html: 'Earthquakes: <a href="https://www.emsc-csem.org/" target="_blank" rel="noopener noreferrer">EMSC-CSEM</a> (seismicportal.eu) · felt intensity: <a href="https://fhmzbih.gov.ba/latinica/SEIZMO/potresi.php" target="_blank" rel="noopener noreferrer">FHMZ BiH</a>',
});

/**
 * Earthquakes in and around Bosnia and Herzegovina over the last 30 days
 * (EMSC, M1.5+), sized by magnitude and coloured by age; the last 24 h are
 * larger, hot red and pulse. FHMZ felt intensity is merged where it matches.
 */
export function createLayer(deps = {}) {
  return createLivePointLayer({
    id: 'ba-earthquakes',
    sourceLabel: 'EMSC · FHMZ',
    updateInterval: 120_000,
    credit: BA_EARTHQUAKES_CREDIT,
    services: deps.localGeoJsonServices,
    async load(signal) {
      const rows = normalizeQuakeSnapshot(
        await fetchJson('/api/ba/earthquakes', signal),
      );
      if (!rows) throw new Error('Malformed earthquake response');
      return rows;
    },
    describe: (rows) => `${rows.length} events (30 d, M1.5+)`,
    present(event, nowMs) {
      const age = quakeAgeClass(event.time, nowMs);
      const color = QUAKE_AGE_COLORS[age];
      const pixelSize = quakePixelSize(event.mag, age);
      return {
        key: event.id,
        lat: event.lat,
        lon: event.lon,
        color,
        alpha: age === 'month' ? 0.6 : 0.9,
        pixelSize,
        outlineColor: age === 'day' ? '#ffffff' : '#000000',
        outlineWidth: age === 'day' ? 2 : 1.5,
        pulse: age === 'day',
        accent: color,
        label: {
          title: `M${Number(event.mag).toFixed(1)}`,
          // Recent first, then magnitude.
          priority:
            (age === 'day' ? 30_000 : age === 'week' ? 20_000 : 10_000) +
            Math.round(event.mag * 1000),
          accent: color,
        },
        card: buildQuakeCard(event, nowMs),
        link: event.url,
        contextLabel:
          `M${Number(event.mag).toFixed(1)} ${event.place || event.region || ''}`.trim(),
        analyst: {
          id: event.id,
          magnitude: event.mag,
          magnitudeType: event.magType,
          depthKm: event.depthKm,
          timeMs: event.time,
          place: event.place || event.region,
          intensity: event.intensity,
          agency: event.auth,
          source: event.source,
        },
      };
    },
  });
}
