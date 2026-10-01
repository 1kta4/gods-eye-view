import {
  createLivePointLayer,
  fetchJson,
} from './earthquakes/livePointLayer.js';
import {
  normalizeRiverSnapshot,
  classifyStation,
  buildStationCard,
  stationLabelText,
  SEVERITY,
} from './rivers/records.js';

export const BA_RIVERS_CREDIT = Object.freeze({
  key: 'ba-rivers',
  html: 'River gauges: <a href="https://vodostaji.voda.ba/" target="_blank" rel="noopener noreferrer">Agencija za vodno područje rijeke Save</a> · <a href="https://www.fhmzbih.gov.ba/latinica/HIDRO/index.php" target="_blank" rel="noopener noreferrer">FHMZ BiH</a> · <a href="https://www.rhmzrs.com/page/hidrologija-mapa-stanica" target="_blank" rel="noopener noreferrer">RHMZ RS</a>',
});

/** Close-zoom name labels for ordinary stations (camera distance, metres). */
const NORMAL_LABEL_MAX_DISTANCE_M = 90_000;

/**
 * River gauges across BiH (Sava agency, FHMZ, RHMZ RS) coloured by the
 * agencies' own warning classes: green normal → yellow preparedness → orange
 * out-of-banks/regular defence → red flooding/emergency defence → magenta
 * major flooding; grey when the reading is older than 6 h. Stations at or
 * above a warning threshold are larger, labelled and pulse.
 */
export function createLayer(deps = {}) {
  return createLivePointLayer({
    id: 'ba-rivers',
    sourceLabel: 'voda.ba · FHMZ · RHMZ RS',
    updateInterval: 600_000,
    credit: BA_RIVERS_CREDIT,
    services: deps.localGeoJsonServices,
    async load(signal) {
      const rows = normalizeRiverSnapshot(
        await fetchJson('/api/ba/rivers', signal, 60_000),
      );
      if (!rows) throw new Error('Malformed river response');
      return rows;
    },
    describe(rows) {
      const nowMs = Date.now();
      const alerts = rows.filter((s) => classifyStation(s, nowMs).alert).length;
      return `${rows.length} gauges, ${alerts} above a warning level`;
    },
    present(station, nowMs) {
      const status = classifyStation(station, nowMs);
      const alert = status.alert;
      const pixelSize = alert
        ? 12 + (status.severity - SEVERITY.PREPAREDNESS) * 3
        : status.stale
          ? 7
          : 9;
      return {
        key: station.id,
        lat: station.lat,
        lon: station.lon,
        color: status.color,
        alpha: status.stale ? 0.65 : 0.95,
        pixelSize,
        outlineColor: alert ? '#ffffff' : '#0b1a2a',
        outlineWidth: alert ? 2 : 1.5,
        pulse: alert,
        accent: status.color,
        label: alert
          ? {
              title: `⚠ ${stationLabelText(station)}`,
              priority: 50_000 + status.severity * 1000,
            }
          : status.stale
            ? null
            : {
                title: station.name,
                priority: 1000,
                maxDistance: NORMAL_LABEL_MAX_DISTANCE_M,
              },
        card: buildStationCard(station, nowMs),
        link: station.link,
        contextLabel: `${station.name}${station.river ? ` (${station.river})` : ''}`,
        analyst: {
          id: station.id,
          station: station.name,
          river: station.river,
          levelCm: station.levelCm,
          flowM3s: station.flowM3s,
          timeMs: station.levelTime ?? station.flowTime,
          status: status.label,
          severity: status.severity,
          source: station.source,
        },
      };
    },
    // voda.ba carries no trend; fetch it lazily for the selected station.
    onSelect(station, refresh, signal) {
      if (station.source !== 'voda.ba' || !station.siteNo || !station.stationNo)
        return;
      const url = `/api/ba/rivers/trend?site=${encodeURIComponent(station.siteNo)}&station=${encodeURIComponent(station.stationNo)}`;
      fetchJson(url, signal, 20_000)
        .then((payload) => {
          const trend = payload?.trend;
          if (!trend || !['rising', 'falling', 'steady'].includes(trend.trend))
            return;
          const card = buildStationCard(station, Date.now(), trend);
          refresh(() => ({ title: card.title, details: card.details }));
        })
        .catch(() => {});
    },
  });
}
