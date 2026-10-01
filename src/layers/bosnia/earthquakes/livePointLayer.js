import * as Cesium from 'cesium';
import { isPointerFree } from '../../../data/inputOwnership.js';
import { registerDynamicCredit } from '../../../data/dataCredits.js';
import { hitTestWorldOverlay } from '../../../overlays/worldOverlay.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../../../renderGovernor.js';
import { bosniaLayerRow } from '../manifest.js';

const noop = () => {};
const PULSE_PERIOD_MS = 1600;

/**
 * A live point layer for Bosnia feeds (earthquakes, river gauges): one
 * CustomDataSource of point entities, ambient overlay labels, an optional
 * pulsing ring for alert points, and a selected-card overlay whose click opens
 * the source's own page. Selection is published to the shared context store.
 *
 * @param {object} options
 * @param {string} options.id Manifest layer id.
 * @param {string} options.sourceLabel Short source text for the layer row.
 * @param {number} options.updateInterval Refresh period (ms).
 * @param {{key:string, html:string}} [options.credit] Attribution credit.
 * @param {object} [options.services] localGeoJsonServices.
 * @param {(signal:AbortSignal)=>Promise<Array<object>>} options.load
 * @param {(row:object, nowMs:number)=>object} options.present Row presentation:
 *   {key, lat, lon, color, pixelSize, outlineColor?, outlineWidth?, pulse?,
 *    label?: {title, priority, maxDistance?, accent?}, card: {title, details},
 *    link?, accent, analyst, contextLabel}
 * @param {(row:object, refresh:Function, signal:AbortSignal)=>void} [options.onSelect]
 *   Optional lazy enrichment for the selected row (e.g. a trend fetch).
 * @param {(rows:Array<object>)=>string} [options.describe] Console summary.
 */
export function createLivePointLayer({
  id,
  sourceLabel,
  updateInterval,
  credit,
  services = {},
  load,
  present,
  onSelect,
  describe = (rows) => `${rows.length} points`,
}) {
  const row = bosniaLayerRow(id);
  const overlayHost = services.overlayHost || {
    setEntries: noop,
    setVisible: noop,
    clearSource: noop,
  };
  const registerContext = services.registerEntityContext || noop;
  const selectContext = services.selectEntityContext || noop;
  const removeContexts = services.removeEntityContextsForLayer || noop;
  const clearSelectedContext =
    services.clearSelectedEntityContextForLayer || noop;
  const requestRender = services.governorRequestRender || noop;
  const labelSource = id;
  const cardSource = `${id}-card`;
  const pulseOwner = `${id}-pulse`;

  let viewer = null;
  let dataSource = null;
  let enabled = false;
  let request = null;
  let selectRequest = null;
  let clickHandler = null;
  let rows = [];
  let presented = new Map(); // key -> { row, view, entity }
  let selectedKey = null;
  let selectedExtra = null;
  let count = 0;
  let lastUpdate = null;
  let lastError = null;
  let pulsing = false;

  const toColor = (css, alpha = 1) =>
    Cesium.Color.fromCssColorString(css).withAlpha(alpha);

  function setPulsing(next) {
    if (next === pulsing) return;
    pulsing = next;
    if (next) holdContinuousRender(pulseOwner);
    else releaseContinuousRender(pulseOwner);
  }

  function openLink(url) {
    if (!/^https:\/\//.test(String(url || ''))) return false;
    globalThis.open?.(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  function cardEntry(item) {
    const card = selectedExtra
      ? { ...item.view.card, ...selectedExtra(item.row) }
      : item.view.card;
    const link = item.view.link;
    return {
      id: String(item.view.key),
      position: Cesium.Cartesian3.fromDegrees(item.view.lon, item.view.lat),
      variant: 'selected',
      selected: true,
      protected: true,
      paintLane: 'selected',
      collisionGroup: 'ambient-card',
      priority: Number.MAX_SAFE_INTEGER,
      title: card.title,
      details: card.details,
      accent: item.view.accent,
      interactive: Boolean(link),
      ...(link
        ? {
            accessibilityLabel: `${card.title}: open source page`,
            activate: () => openLink(link),
          }
        : {}),
      anchorRadiusPx: Math.max(6, item.view.pixelSize / 2 + 2),
      minAnchorGapPx: 11,
      verticalOnly: true,
      placement: 'above',
      edgeFade: 'keyhole',
      horizonCull: true,
      terrainOcclusion: false,
    };
  }

  function publishCard() {
    const item = selectedKey ? presented.get(selectedKey) : null;
    if (!item || !enabled) {
      overlayHost.clearSource(cardSource);
      return;
    }
    overlayHost.setEntries(cardSource, [cardEntry(item)], {
      cohortLimit: 1,
      collisionCapacity: 4,
      moving: false,
    });
    overlayHost.setVisible(cardSource, true);
    requestRender(`${id}:card`);
  }

  function clearSelection() {
    selectRequest?.abort();
    selectRequest = null;
    selectedKey = null;
    selectedExtra = null;
    overlayHost.clearSource(cardSource);
    clearSelectedContext(id);
    requestRender(`${id}:deselect`);
  }

  function select(key) {
    const item = presented.get(key);
    if (!item) return;
    selectRequest?.abort();
    selectedKey = key;
    selectedExtra = null;
    selectContext(item.entity);
    publishCard();
    if (typeof onSelect === 'function') {
      const controller = new AbortController();
      selectRequest = controller;
      onSelect(
        item.row,
        (extra) => {
          if (controller.signal.aborted || selectedKey !== key) return;
          selectedExtra = extra;
          publishCard();
        },
        controller.signal,
      );
    }
  }

  function installClickHandler() {
    if (clickHandler || !viewer) return;
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click) => {
      if (!enabled || !isPointerFree() || !click?.position) return;
      const hit = hitTestWorldOverlay(click.position.x, click.position.y, {
        sourceId: cardSource,
      });
      if (hit) {
        const item = presented.get(hit.entryId);
        if (item?.view.link) openLink(item.view.link);
        return;
      }
      const picked = viewer.scene.pick(click.position);
      const entity = picked?.id;
      if (entity?.__baLayerId === id && presented.has(entity.__baKey)) {
        select(entity.__baKey);
        return;
      }
      if (selectedKey) clearSelection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    if (clickHandler && !clickHandler.isDestroyed?.()) clickHandler.destroy();
    clickHandler = null;
  }

  function render(nextRows) {
    const nowMs = Date.now();
    const entities = [];
    const labels = [];
    const next = new Map();
    let anyPulse = false;
    removeContexts(id, {
      retainIds: new Set(selectedKey ? [`${id}:${selectedKey}`] : []),
    });
    for (const r of nextRows) {
      const view = present(r, nowMs);
      if (!view || next.has(view.key)) continue;
      const position = Cesium.Cartesian3.fromDegrees(view.lon, view.lat);
      const color = toColor(view.color);
      const entity = new Cesium.Entity({
        id: `${id}:${view.key}`,
        position,
        point: {
          pixelSize: view.pixelSize,
          color: color.withAlpha(view.alpha ?? 0.9),
          outlineColor: toColor(view.outlineColor || '#000000', 0.85),
          outlineWidth: view.outlineWidth ?? 1.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entity.__baLayerId = id;
      entity.__baKey = view.key;
      entities.push(entity);
      if (view.pulse) {
        anyPulse = true;
        const started = nowMs;
        const base = view.pixelSize;
        const pulseColor = color;
        const ring = new Cesium.Entity({
          id: `${id}:pulse:${view.key}`,
          position,
          point: {
            pixelSize: new Cesium.CallbackProperty(() => {
              const phase =
                ((Date.now() - started) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
              return base + 4 + phase * base * 1.6;
            }, false),
            color: Cesium.Color.TRANSPARENT,
            outlineColor: new Cesium.CallbackProperty(() => {
              const phase =
                ((Date.now() - started) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
              return pulseColor.withAlpha(0.9 * (1 - phase));
            }, false),
            outlineWidth: 2.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        ring.__baLayerId = id;
        ring.__baKey = view.key;
        entities.push(ring);
      }
      if (view.label) {
        labels.push({
          id: String(view.key),
          position,
          variant: 'label',
          title: view.label.title,
          accent: view.label.accent || view.color,
          priority: view.label.priority ?? 0,
          collisionGroup: 'ambient-label',
          paintLane: 'ambient-label',
          interactive: false,
          edgeFade: 'keyhole',
          horizonCull: true,
          terrainOcclusion: false,
          gapPx: Math.max(10, view.pixelSize / 2 + 6),
          verticalOnly: true,
          placement: 'above',
          ...(Number.isFinite(view.label.maxDistance)
            ? { maxDistance: view.label.maxDistance }
            : {}),
        });
      }
      next.set(view.key, { row: r, view, entity });
      registerContext(entity, {
        id: `${id}:${view.key}`,
        layerId: id,
        layerName: row.name,
        source: sourceLabel,
        dataSource,
        label: view.contextLabel || view.card.title,
        properties: view.analyst,
        latitude: view.lat,
        longitude: view.lon,
      });
    }
    dataSource.entities.suspendEvents();
    dataSource.entities.removeAll();
    for (const entity of entities) dataSource.entities.add(entity);
    dataSource.entities.resumeEvents();
    presented = next;
    overlayHost.setEntries(
      labelSource,
      labels.sort((a, b) => b.priority - a.priority).slice(0, 120),
      { cohortLimit: 120, collisionCapacity: 60, moving: false },
    );
    overlayHost.setVisible(labelSource, true);
    if (selectedKey && !presented.has(selectedKey)) clearSelection();
    else if (selectedKey) publishCard();
    setPulsing(anyPulse && enabled);
    requestRender(`${id}:update`);
  }

  const layer = {
    id: row.id,
    name: row.name,
    icon: row.icon,
    source: sourceLabel,
    updateInterval,

    init(v) {
      viewer = v;
      dataSource = new Cesium.CustomDataSource(id);
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
      overlayHost.setVisible(labelSource, false);
    },

    enable() {
      enabled = true;
      if (dataSource) dataSource.show = true;
      overlayHost.setVisible(labelSource, true);
      installClickHandler();
      if (credit && viewer) registerDynamicCredit(viewer, credit);
      if (presented.size) render(rows);
    },

    disable() {
      enabled = false;
      request?.abort();
      request = null;
      clearSelection();
      removeClickHandler();
      setPulsing(false);
      if (dataSource) dataSource.show = false;
      overlayHost.clearSource(labelSource);
      overlayHost.setVisible(labelSource, false);
      removeContexts(id);
    },

    async update() {
      if (!enabled || !dataSource) return false;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const next = await load(controller.signal);
        if (controller.signal.aborted || request !== controller || !enabled)
          return false;
        rows = next;
        render(rows);
        count = presented.size;
        lastUpdate = Date.now();
        lastError = null;
        console.log(`[Data:Bosnia] ${row.name}: ${describe(rows)}`);
        return true;
      } catch (error) {
        if (controller.signal.aborted || request !== controller || !enabled)
          return false;
        console.warn(`[Data:Bosnia] ${row.name} fetch error:`, error);
        lastError = error?.message || 'source unavailable';
        return false;
      } finally {
        if (request === controller) request = null;
      }
    },

    destroy() {
      layer.disable();
      if (dataSource && viewer) viewer.dataSources.remove(dataSource, true);
      dataSource = null;
      viewer = null;
      presented = new Map();
      rows = [];
      count = 0;
      lastUpdate = null;
      lastError = null;
    },

    /** Plain JSON-safe records for the analyst query engine. */
    getAnalystRecords(maxCount = 2000) {
      if (!enabled) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      const out = [];
      for (const item of presented.values()) {
        if (out.length >= limit) break;
        out.push({
          ...item.view.analyst,
          lat: item.view.lat,
          lon: item.view.lon,
        });
      }
      return out;
    },

    getStats() {
      return { count, lastUpdate, error: lastError };
    },
  };
  return layer;
}

/** Fetch a same-origin JSON route with a timeout and abort support. */
export async function fetchJson(url, signal, timeoutMs = 30_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any
    ? AbortSignal.any([signal, timeout])
    : signal;
  const response = await fetch(url, { signal: combined });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
