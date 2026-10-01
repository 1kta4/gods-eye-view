import * as Cesium from 'cesium';
import { registerDynamicCredit } from '../../data/dataCredits.js';
import { createImageryOverlay } from './fireDanger/imageryOverlay.js';
import {
  RAINVIEWER_MANIFEST_URL,
  RAINVIEWER_MAX_LEVEL,
  parseRainViewerManifest,
  radarTileTemplate,
} from './radar/model.js';

const CREDIT = Object.freeze({
  key: 'ba-rainviewer',
  html: 'Precipitation radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
});

/** Regional window around BiH so approaching showers are visible too. */
const RADAR_RECTANGLE = Object.freeze({
  west: 13.0,
  south: 41.0,
  east: 22.5,
  north: 46.8,
});

/** Latest RainViewer radar composite over BiH, draped as imagery. */
export function createLayer(deps = {}) {
  const fetchImpl = deps.fetchImpl || ((...a) => globalThis.fetch(...a));
  const requestRender =
    deps.localGeoJsonServices?.governorRequestRender || (() => {});
  const overlay = createImageryOverlay({
    Cesium,
    requestRender: () => requestRender('ba-radar'),
  });
  let viewer = null;
  let enabled = false;
  let request = null;
  let frame = null;
  let lastUpdate = null;
  let lastError = null;

  function provider(target) {
    const r = RADAR_RECTANGLE;
    return new Cesium.UrlTemplateImageryProvider({
      url: radarTileTemplate(target),
      minimumLevel: 0,
      maximumLevel: RAINVIEWER_MAX_LEVEL,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      rectangle: Cesium.Rectangle.fromDegrees(r.west, r.south, r.east, r.north),
      credit: new Cesium.Credit('RainViewer'),
      hasAlphaChannel: true,
    });
  }

  return {
    id: 'ba-radar',
    name: 'Precipitation Radar',
    icon: '🌧',
    source: 'RainViewer',
    updateInterval: 5 * 60_000,
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
      request?.abort();
      request = null;
      overlay.hide();
      frame = null;
    },
    async update() {
      if (!enabled) return false;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetchImpl(RAINVIEWER_MANIFEST_URL, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`RainViewer HTTP ${response.status}`);
        const { latest } = parseRainViewerManifest(await response.json());
        if (controller.signal.aborted || !enabled) return false;
        if (!latest) throw new Error('no recent radar frame');
        if (frame?.path !== latest.path || overlay.mountedCount() === 0) {
          frame = latest;
          overlay.show([
            {
              key: `radar:${latest.path}`,
              alpha: 0.75,
              makeProvider: () => provider(latest),
            },
          ]);
        }
        lastUpdate = Date.now();
        lastError =
          overlay.hostKind() === 'none'
            ? 'Hidden by this map source · choose a globe map'
            : null;
        return true;
      } catch (error) {
        if (controller.signal.aborted || !enabled) return false;
        console.warn('[Data:Bosnia] Radar update failed:', error);
        lastError = String(error?.message || 'radar unavailable').slice(0, 120);
        return Boolean(frame);
      } finally {
        if (request === controller) request = null;
      }
    },
    destroy() {
      this.disable();
      overlay.destroy();
      viewer = null;
    },
    getStats() {
      const frameTime = frame ? frame.time * 1000 : null;
      return {
        count: frame ? 1 : 0,
        countLabel: frame
          ? new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Europe/Sarajevo',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }).format(new Date(frameTime))
          : undefined,
        stale: frameTime ? Date.now() - frameTime > 40 * 60_000 : false,
        loadingLabel: frame ? 'latest radar frame (≤ zoom 7)' : undefined,
        lastUpdate,
        error: lastError,
      };
    },
  };
}
