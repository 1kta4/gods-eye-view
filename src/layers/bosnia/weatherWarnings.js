import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { registerDynamicCredit } from '../../data/dataCredits.js';
import {
  AWARENESS_LEVELS,
  regionCard,
  warningsByRegion,
} from './weatherWarnings/model.js';

const ENDPOINT = '/api/ba/weather/warnings';
const REGIONS_URL = new URL(
  '../../data/local_data/bosnia/weather/meteoalarm-regions.geojson',
  import.meta.url,
).href;
const OVERLAY_SOURCE = 'ba-weather-warnings-selected';
const LABEL_SOURCE = 'ba-weather-warnings-labels';
const CREDIT = Object.freeze({
  key: 'ba-meteoalarm',
  html: 'Weather warnings: <a href="https://meteoalarm.org" target="_blank" rel="noopener">MeteoAlarm.org</a> (EUMETNET, CC BY 4.0)',
});

/** Validate the proxy payload (pure). */
export function readWarningsPayload(payload) {
  if (!payload || !Array.isArray(payload.warnings))
    throw new Error('warnings proxy returned no list');
  if (payload.error && !payload.fetchedAt) throw new Error(payload.error);
  const warnings = payload.warnings.filter(
    (w) =>
      w &&
      Array.isArray(w.geocodes) &&
      Object.prototype.hasOwnProperty.call(AWARENESS_LEVELS, w.level),
  );
  return {
    warnings,
    stale: payload.stale === true,
    feedUpdated: payload.feedUpdated || null,
  };
}

/** Panel stats for a warning list (pure): zero warnings is a valid state. */
export function warningStats(warnings, regionsByCode) {
  if (!warnings.length)
    return {
      count: 0,
      countLabel: '0',
      loadingLabel: 'no warnings in force',
    };
  const regions = warningsByRegion(warnings);
  const worst = [...regions.values()].reduce(
    (max, entry) =>
      AWARENESS_LEVELS[entry.level].rank > AWARENESS_LEVELS[max].rank
        ? entry.level
        : max,
    'green',
  );
  const names = [...regions.keys()]
    .map((code) => regionsByCode.get(code)?.name || code)
    .slice(0, 3);
  return {
    count: warnings.length,
    countLabel: String(warnings.length),
    loadingLabel: `${AWARENESS_LEVELS[worst].label} max · ${names.join(', ')}${regions.size > 3 ? '…' : ''}`,
  };
}

function ringPositions(ring) {
  return Cesium.Cartesian3.fromDegreesArray(ring.flat());
}

function polygonsOf(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** Meteoalarm awareness warnings drawn on the ten BiH Meteoalarm regions. */
export function createLayer(deps = {}) {
  const services = deps.localGeoJsonServices || {};
  const overlayHost = services.overlayHost || null;
  const requestRender = services.governorRequestRender || (() => {});
  const fetchImpl = deps.fetchImpl || ((...a) => globalThis.fetch(...a));
  let viewer = null;
  let dataSource = null;
  let clickHandler = null;
  let enabled = false;
  let request = null;
  /** @type {Map<string, {code:string,name:string,feature:object,center:object}>} */
  let regions = null;
  let byRegion = new Map();
  let warnings = [];
  let selected = null;
  let lastUpdate = null;
  let lastError = null;
  let stale = false;
  let loaded = false;

  async function loadRegions(signal) {
    if (regions) return regions;
    const response = await fetchImpl(REGIONS_URL, { signal });
    if (!response.ok) throw new Error('regions dataset unavailable');
    const geojson = await response.json();
    const map = new Map();
    for (const feature of geojson.features || []) {
      const code = feature?.properties?.code;
      if (!/^BA\d{3}$/.test(code || '')) continue;
      const outer = polygonsOf(feature.geometry)[0]?.[0] || [];
      const lon = outer.reduce((s, p) => s + p[0], 0) / (outer.length || 1);
      const lat = outer.reduce((s, p) => s + p[1], 0) / (outer.length || 1);
      map.set(code, {
        code,
        name: String(feature.properties.name || code),
        feature,
        center: { lon, lat },
      });
    }
    regions = map;
    return map;
  }

  function hideCard() {
    selected = null;
    overlayHost?.clearSource(OVERLAY_SOURCE);
  }

  function showCard(code) {
    const region = regions?.get(code);
    if (!region || !overlayHost) return;
    selected = code;
    const copy = regionCard(region.name, byRegion.get(code));
    overlayHost.setVisible(OVERLAY_SOURCE, true);
    overlayHost.setEntries(
      OVERLAY_SOURCE,
      [
        {
          id: code,
          position: Cesium.Cartesian3.fromDegrees(
            region.center.lon,
            region.center.lat,
            800,
          ),
          variant: 'selected',
          selected: true,
          protected: true,
          paintLane: 'selected',
          collisionGroup: 'ambient-card',
          priority: Number.MAX_SAFE_INTEGER,
          title: copy.title,
          details: copy.details,
          accent: copy.accent,
          interactive: false,
          placement: 'above',
          edgeFade: 'keyhole',
          horizonCull: true,
          terrainOcclusion: false,
        },
      ],
      { moving: false },
    );
    requestRender('ba-weather-warnings-card');
  }

  function render() {
    if (!dataSource || !regions) return;
    const labels = [];
    dataSource.entities.suspendEvents();
    try {
      dataSource.entities.removeAll();
      services.removeEntityContextsForLayer?.('ba-weather-warnings');
      for (const region of regions.values()) {
        const entry = byRegion.get(region.code);
        const level = entry ? AWARENESS_LEVELS[entry.level] : null;
        const css = level ? level.color : '#B8C4CC';
        const color = Cesium.Color.fromCssColorString(css);
        polygonsOf(region.feature.geometry).forEach((rings, index) => {
          const [outer, ...holes] = rings;
          if (!outer || outer.length < 4) return;
          const id = `ba-weather-warnings:${region.code}:${index}`;
          const entity = new Cesium.Entity({
            id,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(
                ringPositions(outer),
                holes.map((h) => new Cesium.PolygonHierarchy(ringPositions(h))),
              ),
              material: color.withAlpha(level ? 0.38 : 0.04),
              classificationType: Cesium.ClassificationType.BOTH,
            },
          });
          entity.__baLayerId = 'ba-weather-warnings';
          entity.__baRegion = region.code;
          dataSource.entities.add(entity);
          services.registerEntityContext?.(entity, {
            id,
            layerId: 'ba-weather-warnings',
            layerName: 'Weather Warnings',
            source: 'Meteoalarm',
            dataSource,
            label: regionCard(region.name, entry).title,
            properties: {
              region: region.name,
              code: region.code,
              level: entry?.level || null,
              warnings: (entry?.warnings || []).map((w) => ({
                type: w.type,
                level: w.level,
                onset: w.onset,
                expires: w.expires,
              })),
            },
            latitude: region.center.lat,
            longitude: region.center.lon,
          });
          const border = new Cesium.Entity({
            id: `${id}:border`,
            polyline: {
              positions: ringPositions(outer),
              width: level ? 2.5 : 1.2,
              material: color.withAlpha(level ? 0.95 : 0.55),
              clampToGround: true,
            },
          });
          border.__baLayerId = 'ba-weather-warnings';
          border.__baRegion = region.code;
          dataSource.entities.add(border);
        });
        labels.push({
          id: region.code,
          position: Cesium.Cartesian3.fromDegrees(
            region.center.lon,
            region.center.lat,
            600,
          ),
          variant: 'label',
          title: entry ? `${region.name} · ${level.label}` : region.name,
          accent: css,
          priority: entry ? AWARENESS_LEVELS[entry.level].rank * 10 : 0,
          collisionGroup: 'ambient-label',
          paintLane: 'ambient-label',
          interactive: false,
          maxDistance: 2_000_000,
          edgeFade: 'keyhole',
          horizonCull: true,
          terrainOcclusion: false,
          verticalOnly: true,
          placement: 'above',
        });
      }
    } finally {
      dataSource.entities.resumeEvents();
    }
    overlayHost?.setEntries(LABEL_SOURCE, labels, {
      cohortLimit: 16,
      collisionCapacity: 16,
      moving: false,
    });
    if (selected) showCard(selected);
    requestRender('ba-weather-warnings-update');
  }

  function installClick() {
    if (clickHandler || !viewer?.scene?.canvas) return;
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click) => {
      if (!enabled || !isPointerFree()) return;
      const entity = viewer.scene.pick(click.position)?.id;
      if (
        entity instanceof Cesium.Entity &&
        entity.__baLayerId === 'ba-weather-warnings'
      ) {
        if (entity.polygon) services.selectEntityContext?.(entity);
        showCard(entity.__baRegion);
      } else if (selected) {
        hideCard();
        services.clearSelectedEntityContextForLayer?.('ba-weather-warnings');
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  return {
    id: 'ba-weather-warnings',
    name: 'Weather Warnings',
    icon: '⚠',
    source: 'Meteoalarm',
    updateInterval: 10 * 60_000,
    init(v) {
      viewer = v;
      dataSource = new Cesium.CustomDataSource('ba-weather-warnings');
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
    },
    enable(v = viewer) {
      viewer = v || viewer;
      enabled = true;
      if (dataSource) dataSource.show = true;
      overlayHost?.setVisible(LABEL_SOURCE, true);
      registerDynamicCredit(viewer, CREDIT);
      installClick();
    },
    disable() {
      enabled = false;
      request?.abort();
      request = null;
      if (dataSource) dataSource.show = false;
      hideCard();
      overlayHost?.clearSource(LABEL_SOURCE);
      overlayHost?.setVisible(LABEL_SOURCE, false);
      services.clearSelectedEntityContextForLayer?.('ba-weather-warnings');
      clickHandler?.destroy();
      clickHandler = null;
      requestRender('ba-weather-warnings-disable');
    },
    async update() {
      if (!enabled) return false;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        await loadRegions(controller.signal);
        const response = await fetchImpl(ENDPOINT, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`warnings proxy HTTP ${response.status}`);
        const result = readWarningsPayload(await response.json());
        if (controller.signal.aborted || !enabled) return false;
        warnings = result.warnings;
        stale = result.stale;
        byRegion = warningsByRegion(warnings);
        render();
        loaded = true;
        lastUpdate = Date.now();
        lastError = null;
        return true;
      } catch (error) {
        if (controller.signal.aborted || !enabled) return false;
        console.warn('[Data:Bosnia] Weather warnings update failed:', error);
        lastError = String(error?.message || 'Meteoalarm unavailable').slice(
          0,
          120,
        );
        return loaded;
      } finally {
        if (request === controller) request = null;
      }
    },
    destroy() {
      this.disable();
      overlayHost?.clearSource(OVERLAY_SOURCE);
      if (dataSource && viewer) viewer.dataSources.remove(dataSource, true);
      dataSource = null;
      viewer = null;
    },
    getAnalystRecords(maxCount = 500) {
      if (!enabled) return [];
      return warnings.slice(0, maxCount).map((w) => ({
        id: w.id,
        type: w.type,
        level: w.level,
        regions: w.geocodes.map((c) => regions?.get(c)?.name || c),
        onset: w.onset,
        expires: w.expires,
      }));
    },
    getStats() {
      const base = loaded
        ? warningStats(warnings, regions || new Map())
        : { count: 0 };
      return { ...base, stale, lastUpdate, error: lastError };
    },
  };
}
