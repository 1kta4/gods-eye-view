/**
 * Small shared point-station layer for the Bosnia live layers (air quality,
 * weather now): Cesium point entities in one CustomDataSource, labels and a
 * click-to-select card painted by the shared world overlay host, contextStore
 * registration for voice/analyst "selected" queries, and honest getStats.
 * The caller supplies loading, styling and card copy.
 */
import * as Cesium from 'cesium';
import { isPointerFree } from '../../../data/inputOwnership.js';
import { registerDynamicCredit } from '../../../data/dataCredits.js';

const NOOP = () => {};

/**
 * @param {object} options
 * @param {string} options.id Manifest layer id.
 * @param {string} options.name Panel name.
 * @param {string} options.icon Panel icon.
 * @param {string} options.source Panel source label.
 * @param {number} options.updateInterval Refresh period (ms).
 * @param {(signal: AbortSignal) => Promise<{items: object[], stats?: object}>} options.load
 * @param {(item: object) => {color:string, pixelSize:number, outlineColor?:string, outlineWidth?:number, label?:string, labelPriority?:number, labelMaxDistance?:number}} options.style
 * @param {(item: object) => {title:string, details:string[], accent:string}} options.card
 * @param {(item: object) => object} [options.analyst]
 * @param {{key:string, html:string}[]} [options.credits]
 * @param {object} [services] localGeoJsonServices-shaped application services.
 */
export function createStationLayer(options, services = {}) {
  const {
    id,
    name,
    icon,
    source,
    updateInterval,
    load,
    style,
    card,
    analyst,
    credits = [],
  } = options;
  const overlayHost = services.overlayHost || null;
  const registerContext = services.registerEntityContext || NOOP;
  const selectContext = services.selectEntityContext || NOOP;
  const removeContexts = services.removeEntityContextsForLayer || NOOP;
  const clearSelected = services.clearSelectedEntityContextForLayer || NOOP;
  const requestRender = services.governorRequestRender || NOOP;
  const overlaySourceId = `${id}-selected`;
  const labelSourceId = `${id}-labels`;

  let viewer = null;
  let dataSource = null;
  let clickHandler = null;
  let enabled = false;
  let request = null;
  let items = new Map();
  let selectedId = null;
  let count = 0;
  let lastUpdate = null;
  let lastError = null;
  let extraStats = {};

  function hideCard() {
    selectedId = null;
    overlayHost?.clearSource(overlaySourceId);
  }

  /** Surface point for overlay text; `sample` also probes 3D tiles (costly). */
  function groundPosition(item, sample = false) {
    const carto = Cesium.Cartographic.fromDegrees(item.lon, item.lat);
    let height = Number.isFinite(item.elevation) ? item.elevation : 0;
    try {
      const scene = viewer?.scene;
      const sampled =
        scene?.globe?.show !== false
          ? scene?.globe?.getHeight(carto)
          : sample && scene?.sampleHeightSupported
            ? scene.sampleHeight(carto)
            : undefined;
      if (Number.isFinite(sampled)) height = sampled;
    } catch {
      /* keep the fallback height */
    }
    return Cesium.Cartesian3.fromDegrees(item.lon, item.lat, height + 2);
  }

  function showCard(itemId) {
    const item = items.get(itemId);
    if (!item || !overlayHost) return;
    selectedId = itemId;
    const copy = card(item);
    overlayHost.setVisible(overlaySourceId, true);
    overlayHost.setEntries(
      overlaySourceId,
      [
        {
          id: String(itemId),
          position: groundPosition(item, true),
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
          anchorRadiusPx: 9,
          minAnchorGapPx: 11,
          verticalOnly: true,
          placement: 'above',
          edgeFade: 'keyhole',
          horizonCull: true,
          terrainOcclusion: false,
        },
      ],
      { moving: false },
    );
    requestRender(`${id}-card`);
  }

  function installClick() {
    if (clickHandler || !viewer?.scene?.canvas) return;
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click) => {
      if (!enabled || !isPointerFree()) return;
      const picked = viewer.scene.pick(click.position);
      const entity = picked?.id;
      if (entity instanceof Cesium.Entity && entity.__baLayerId === id) {
        selectContext(entity);
        showCard(entity.__baItemId);
      } else if (selectedId) {
        hideCard();
        clearSelected(id);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function render(list) {
    const next = new Map();
    const labels = [];
    dataSource.entities.suspendEvents();
    try {
      dataSource.entities.removeAll();
      removeContexts(id);
      for (const item of list) {
        const look = style(item);
        const color = Cesium.Color.fromCssColorString(look.color);
        const entity = new Cesium.Entity({
          id: `${id}:${item.id}`,
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat),
          point: {
            pixelSize: look.pixelSize,
            color,
            outlineColor: Cesium.Color.fromCssColorString(
              look.outlineColor || '#000000',
            ),
            outlineWidth: look.outlineWidth ?? 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(2.0e4, 1.25, 1.5e6, 0.7),
          },
        });
        entity.__baLayerId = id;
        entity.__baItemId = item.id;
        dataSource.entities.add(entity);
        if (look.label)
          labels.push({
            id: String(item.id),
            position: groundPosition(item),
            variant: 'label',
            title: look.label,
            accent: look.color,
            priority: look.labelPriority ?? 0,
            collisionGroup: 'ambient-label',
            paintLane: 'ambient-label',
            interactive: false,
            maxDistance: look.labelMaxDistance ?? 450_000,
            edgeFade: 'keyhole',
            horizonCull: true,
            terrainOcclusion: false,
            gapPx: Math.round(look.pixelSize / 2 + 6),
            verticalOnly: true,
            placement: 'above',
          });
        const copy = card(item);
        registerContext(entity, {
          id: `${id}:${item.id}`,
          layerId: id,
          layerName: name,
          source,
          dataSource,
          label: copy.title,
          properties: analyst ? analyst(item) : { ...item },
          latitude: item.lat,
          longitude: item.lon,
        });
        next.set(item.id, item);
      }
    } finally {
      dataSource.entities.resumeEvents();
    }
    items = next;
    overlayHost?.setEntries(labelSourceId, labels, {
      cohortLimit: 96,
      collisionCapacity: 48,
      moving: false,
    });
    if (selectedId && items.has(selectedId)) showCard(selectedId);
    else if (selectedId) hideCard();
    requestRender(`${id}-update`);
  }

  return {
    id,
    name,
    icon,
    source,
    updateInterval,

    init(v) {
      viewer = v;
      dataSource = new Cesium.CustomDataSource(id);
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
      overlayHost?.setVisible(overlaySourceId, false);
      overlayHost?.setVisible(labelSourceId, false);
    },

    enable(v = viewer) {
      viewer = v || viewer;
      enabled = true;
      if (dataSource) dataSource.show = true;
      overlayHost?.setVisible(labelSourceId, true);
      for (const credit of credits) registerDynamicCredit(viewer, credit);
      installClick();
      requestRender(`${id}-enable`);
    },

    disable() {
      enabled = false;
      request?.abort();
      request = null;
      if (dataSource) dataSource.show = false;
      hideCard();
      overlayHost?.setVisible(overlaySourceId, false);
      overlayHost?.clearSource(labelSourceId);
      overlayHost?.setVisible(labelSourceId, false);
      clearSelected(id);
      clickHandler?.destroy();
      clickHandler = null;
      requestRender(`${id}-disable`);
    },

    async update() {
      if (!enabled || !dataSource) return false;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const result = await load(controller.signal);
        if (controller.signal.aborted || request !== controller || !enabled)
          return false;
        render(result.items);
        count = result.items.length;
        extraStats = result.stats || {};
        lastUpdate = Date.now();
        lastError = null;
        return true;
      } catch (error) {
        if (controller.signal.aborted || request !== controller || !enabled)
          return false;
        console.warn(`[Data:Bosnia] ${name} update failed:`, error);
        lastError = String(error?.message || 'source unavailable').slice(
          0,
          120,
        );
        // Keep the last good stations on screen; only a first failure fails.
        return count > 0;
      } finally {
        if (request === controller) request = null;
      }
    },

    destroy() {
      this.disable();
      overlayHost?.clearSource(overlaySourceId);
      removeContexts(id);
      if (dataSource && viewer) viewer.dataSources.remove(dataSource, true);
      dataSource = null;
      viewer = null;
      items = new Map();
      count = 0;
      lastUpdate = null;
      lastError = null;
    },

    getAnalystRecords(maxCount = 2000) {
      if (!enabled) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return [...items.values()]
        .slice(0, limit)
        .map((item) => (analyst ? analyst(item) : { ...item }));
    },

    getStats() {
      return {
        count,
        lastUpdate,
        error: lastError,
        ...extraStats,
      };
    },
  };
}
