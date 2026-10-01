import * as Cesium from 'cesium';
import { registerDynamicCredit } from '../../data/dataCredits.js';
import {
  BA_RECTANGLE_DEG,
  createImageryOverlay,
} from './fireDanger/imageryOverlay.js';

/** EFFIS WMS (CORS-enabled; verified GetCapabilities 2026-10-01). */
export const EFFIS_WMS_URL = 'https://maps.effis.emergency.copernicus.eu/effis';
export const FWI_LAYER = 'mf010.fwi';
export const BURNT_AREA_LAYER = 'modis.ba.season';
const CREDIT_TEXT = '© European Union, Copernicus EMS/EFFIS';

const CREDIT = Object.freeze({
  key: 'ba-effis',
  html: 'Fire danger & burnt areas: <a href="https://forest-fire.emergency.copernicus.eu/" target="_blank" rel="noopener">© European Union, Copernicus EMS/EFFIS</a>',
});

/** Today's date (YYYY-MM-DD) in Bosnia and Herzegovina — the FWI forecast day. */
export function fwiForecastDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sarajevo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/** WMS provider options for one EFFIS layer (pure, testable). */
export function effisProviderOptions(layer, { time = null } = {}) {
  const parameters = {
    transparent: true,
    format: 'image/png',
    styles: '',
  };
  if (time) parameters.time = time;
  return {
    url: EFFIS_WMS_URL,
    layers: layer,
    parameters,
    rectangle: BA_RECTANGLE_DEG,
    credit: CREDIT_TEXT,
    maximumLevel: 12,
  };
}

/** EFFIS fire-weather-index forecast + current-season burnt areas over BiH. */
export function createLayer(deps = {}) {
  const requestRender =
    deps.localGeoJsonServices?.governorRequestRender || (() => {});
  const overlay = createImageryOverlay({
    Cesium,
    requestRender: () => requestRender('ba-fire-danger'),
  });
  let viewer = null;
  let enabled = false;
  let shownDate = null;
  let lastUpdate = null;
  let lastError = null;

  function provider(layer, time) {
    const options = effisProviderOptions(layer, { time });
    const r = options.rectangle;
    return new Cesium.WebMapServiceImageryProvider({
      ...options,
      rectangle: Cesium.Rectangle.fromDegrees(r.west, r.south, r.east, r.north),
      tilingScheme: new Cesium.GeographicTilingScheme(),
      credit: new Cesium.Credit(CREDIT_TEXT),
    });
  }

  function show() {
    const date = fwiForecastDate();
    shownDate = date;
    overlay.show([
      {
        key: `fwi:${date}`,
        alpha: 0.5,
        makeProvider: () => provider(FWI_LAYER, date),
      },
      {
        key: 'burnt-season',
        alpha: 0.95,
        makeProvider: () => provider(BURNT_AREA_LAYER, null),
      },
    ]);
  }

  return {
    id: 'ba-fire-danger',
    name: 'Fire Danger (EFFIS)',
    icon: '🔥',
    source: 'Copernicus EFFIS',
    updateInterval: 60 * 60_000,
    init(v) {
      viewer = v;
      overlay.attach(v);
    },
    enable(v = viewer) {
      viewer = v || viewer;
      overlay.attach(viewer);
      enabled = true;
      registerDynamicCredit(viewer, CREDIT);
    },
    disable() {
      enabled = false;
      overlay.hide();
      shownDate = null;
    },
    update() {
      if (!enabled) return false;
      try {
        // The forecast day rolls over at local midnight; otherwise keep tiles.
        if (shownDate !== fwiForecastDate() || overlay.mountedCount() === 0)
          show();
        lastUpdate = Date.now();
        lastError =
          overlay.hostKind() === 'none'
            ? 'Hidden by this map source · choose a globe map'
            : null;
        return true;
      } catch (error) {
        lastError = String(error?.message || 'EFFIS layer failed');
        return false;
      }
    },
    destroy() {
      enabled = false;
      overlay.destroy();
      viewer = null;
    },
    getStats() {
      return {
        count: enabled && overlay.mountedCount() ? 1 : 0,
        countLabel: shownDate ? `FWI ${shownDate}` : undefined,
        loadingLabel: shownDate
          ? 'fire weather index + season burnt areas'
          : undefined,
        lastUpdate,
        error: lastError,
      };
    },
  };
}
