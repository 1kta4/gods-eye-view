import * as Cesium from 'cesium';
import { isPointerFree } from '../../../data/inputOwnership.js';
import { createInfrastructureOverlayEntry } from '../../../data/infrastructureOverlayEntry.js';
import {
  LOCAL_OVERLAY_COHORT_LIMIT,
  localDatasetError,
  selectLocalInfrastructureOverlayCohort,
} from '../../../data/localGeojsonCore.js';
import { closeInfoCard, showInfoCard } from './baInfoCard.js';

/**
 * Lean renderer shared by the bundled Bosnia reference layers (heritage,
 * war memory, minefields, power). The generic local GeoJSON layer
 * (localGeojsonCore.js) draws one colour of stemmed point; these layers need
 * per-feature colour/size, polygons and lines, so each supplies a `build`
 * that adds its own entities/primitives to a CustomDataSource and returns
 * one record per clickable feature. This module owns the shared lifecycle:
 * fetch-once dataset cache, data source add/remove, click → context store +
 * detail card, and the screen-grid label cohort on the shared overlay host.
 *
 * Entities are removed on disable (not parked hidden): a hidden data source
 * still costs every frame, see localGeojsonCore.js.
 */

const LABEL_COLLISION_CAPACITY = 96;
const MAX_HEIGHT_SAMPLES_PER_PASS = 24;
const HEIGHT_SAMPLE_MAX_DISTANCE_M = 120_000;

/**
 * Fetch a bundled JSON asset; a 404 must read as "dataset unavailable",
 * not as a JSON parse error.
 * @param {string} url
 * @param {AbortSignal} [signal]
 */
export async function fetchBundledJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status ?? '?'}`);
  return response.json();
}

/**
 * @typedef {object} BaRecord
 * @property {string} id Stable id within the layer.
 * @property {number} lat
 * @property {number} lon
 * @property {object} [entity] Clickable entity (already in the data source).
 * @property {{title:string, details?:string[]}|null} [label] Ambient label.
 * @property {number} [priority] Label priority (higher wins a grid cell).
 * @property {() => object} [card] Detail-card model (see baInfoCard.js).
 * @property {object} [properties] Plain properties for the context store.
 * @property {object} [analyst] JSON-safe analyst record.
 */

/**
 * @param {object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {string} config.icon
 * @param {string} config.source
 * @param {string} config.accent Label accent colour.
 * @param {(signal:AbortSignal) => Promise<unknown>} config.loadData
 * @param {(data:unknown, ctx:{dataSource:Cesium.CustomDataSource, viewer:object}) => {records:BaRecord[], count?:number, primitives?:object[]}} config.build
 * @param {number} [config.labelMax]
 * @param {number} [config.labelGridPx]
 * @param {boolean} [config.osmDerived]
 * @param {(viewer:object) => void} [config.onEnabled]
 * @param {(viewer:object) => void} [config.onDisabled]
 * @param {() => object} [config.extraStats]
 * @param {number} [config.updateInterval]
 * @param {(viewer:object, ctx:object) => Promise<boolean|void>} [config.onUpdate]
 * @param {object} [deps] `{ localGeoJsonServices }` from constructCatalog.
 */
export function createBaGeoLayer(config, deps = {}) {
  const services = deps.localGeoJsonServices || {};
  const overlayHost = services.overlayHost || null;
  const {
    id,
    name,
    icon,
    source,
    accent,
    labelMax = 120,
    labelGridPx = 120,
  } = config;

  let _viewer = null;
  let _enabled = false;
  let _destroyed = false;
  let _data = null;
  let _dataSource = null;
  let _primitives = [];
  let _records = [];
  let _recordByEntity = new Map();
  let _count = 0;
  let _lastUpdate = null;
  let _error = null;
  let _loading = false;
  let _loadController = null;
  let _clickHandler = null;
  let _moveEndRemover = null;
  let _overlayVisible = false;
  let _dynamicEntities = [];

  function setOverlayVisible(visible) {
    if (!overlayHost || _overlayVisible === visible) return;
    _overlayVisible = visible;
    if (!visible) overlayHost.clearSource(id);
    overlayHost.setVisible(id, visible);
  }

  function sampleLabelHeights(viewer, candidates) {
    const scene = viewer.scene;
    const globe = scene.globe;
    const camera = viewer.camera.positionWC;
    let samples = 0;
    for (const record of candidates) {
      if (record.heightSampled || samples >= MAX_HEIGHT_SAMPLES_PER_PASS)
        continue;
      if (
        Cesium.Cartesian3.distance(camera, record.anchor) >
        HEIGHT_SAMPLE_MAX_DISTANCE_M
      )
        continue;
      samples++;
      let height;
      try {
        if (globe?.show) height = globe.getHeight(record.carto);
        else if (scene.sampleHeightSupported)
          height = scene.sampleHeight(record.carto);
      } catch {
        height = undefined;
      }
      if (!Number.isFinite(height) || Math.abs(height) > 9000) continue;
      record.heightSampled = true;
      Cesium.Cartesian3.fromRadians(
        record.carto.longitude,
        record.carto.latitude,
        height + 20,
        Cesium.Ellipsoid.WGS84,
        record.anchor,
      );
    }
  }

  function publishLabels() {
    if (!overlayHost || !_enabled || !_viewer || !_records.length) return;
    const viewer = _viewer;
    const scene = viewer.scene;
    const canvas = scene.canvas;
    const occluder = new Cesium.EllipsoidalOccluder(
      Cesium.Ellipsoid.WGS84,
      viewer.camera.positionWC,
    );
    const labelled = _records.filter(
      (record) =>
        record.entry &&
        record.visible !== false &&
        occluder.isPointVisible(record.anchor),
    );
    const project = (record) =>
      Cesium.SceneTransforms.worldToWindowCoordinates(scene, record.anchor);
    const width = canvas.clientWidth || canvas.width || 0;
    const height = canvas.clientHeight || canvas.height || 0;
    let cohort = selectLocalInfrastructureOverlayCohort(labelled, {
      maxEntries: labelMax,
      gridPx: labelGridPx,
      width,
      height,
      cohortLimit: LOCAL_OVERLAY_COHORT_LIMIT,
      project,
    });
    const chosen = new Set(cohort);
    sampleLabelHeights(
      viewer,
      labelled.filter((record) => chosen.has(record.entry)),
    );
    cohort = cohort.slice();
    overlayHost.setEntries(id, cohort, {
      cohortLimit: LOCAL_OVERLAY_COHORT_LIMIT,
      collisionCapacity: LABEL_COLLISION_CAPACITY,
      moving: false,
    });
    scene.requestRender?.();
  }

  function onClick(click) {
    if (!isPointerFree() || !_enabled || !_viewer) return;
    const picked = _viewer.scene.pick(click.position);
    const entity = picked?.id;
    const record =
      entity && entity.__baLayerId === id ? _recordByEntity.get(entity) : null;
    if (!record) return;
    services.selectEntityContext?.(entity);
    if (typeof record.card === 'function') {
      try {
        showInfoCard(id, record.card());
      } catch (error) {
        console.warn(`[${id}] card failed`, error);
      }
    }
    _viewer.scene.requestRender?.();
  }

  function registerRecord(record, dataSource) {
    record.carto = Cesium.Cartographic.fromDegrees(record.lon, record.lat);
    record.anchor = Cesium.Cartesian3.fromDegrees(
      record.lon,
      record.lat,
      record.heightM ?? 300,
    );
    record.heightSampled = Number.isFinite(record.heightM);
    if (record.label?.title && overlayHost) {
      record.entry = createInfrastructureOverlayEntry({
        id: record.id,
        source: id,
        position: record.anchor,
        title: record.label.title,
        details: record.label.details || [],
        accent: record.label.accent || accent,
        priority: record.priority ?? 0,
      });
    }
    for (const entity of [record.entity, ...(record.pickEntities || [])]) {
      if (!entity) continue;
      entity.__baLayerId = id;
      _recordByEntity.set(entity, record);
    }
    if (record.entity) {
      services.registerEntityContext?.(record.entity, {
        id: `${id}:${record.id}`,
        layerId: id,
        layerName: name,
        source,
        dataSource,
        label: record.label?.title || record.properties?.name || name,
        properties: record.properties || {},
        latitude: Number(record.lat.toFixed(6)),
        longitude: Number(record.lon.toFixed(6)),
      });
    }
  }

  function registerRecords(dataSource) {
    _recordByEntity = new Map();
    for (const record of _records) registerRecord(record, dataSource);
  }

  /**
   * Replace the layer's live ("dynamic") records — e.g. ENTSO-E flow arcs —
   * without rebuilding the bundled ones.
   * @param {(dataSource:Cesium.CustomDataSource) => {records?:BaRecord[], entities?:object[]}} build
   */
  function replaceDynamic(build) {
    if (!_dataSource || !_enabled) return false;
    for (const entity of _dynamicEntities) {
      _recordByEntity.delete(entity);
      _dataSource.entities.remove(entity);
    }
    _records = _records.filter((record) => !record.dynamic);
    const built = build(_dataSource) || {};
    _dynamicEntities = built.entities || [];
    for (const record of built.records || []) {
      record.dynamic = true;
      registerRecord(record, _dataSource);
      _records.push(record);
    }
    publishLabels();
    _viewer?.scene?.requestRender?.();
    return true;
  }

  function release(viewer) {
    services.removeEntityContextsForLayer?.(id);
    services.clearSelectedEntityContextForLayer?.(id);
    for (const primitive of _primitives) {
      try {
        viewer?.scene?.primitives?.remove(primitive);
      } catch {
        /* already gone */
      }
    }
    _primitives = [];
    if (_dataSource) {
      try {
        viewer?.dataSources?.remove(_dataSource, true);
      } catch {
        /* already gone */
      }
      _dataSource = null;
    }
    _records = [];
    _dynamicEntities = [];
    _recordByEntity = new Map();
  }

  async function buildScene(viewer) {
    const dataSource = new Cesium.CustomDataSource(id);
    dataSource.show = false;
    const built = config.build(_data, { dataSource, viewer });
    await viewer.dataSources.add(dataSource);
    if (_destroyed || !_enabled) {
      viewer.dataSources.remove(dataSource, true);
      for (const p of built.primitives || []) p.destroy?.();
      return;
    }
    _dataSource = dataSource;
    _primitives = built.primitives || [];
    for (const primitive of _primitives) viewer.scene.primitives.add(primitive);
    _records = built.records || [];
    _count = Number.isFinite(built.count) ? built.count : _records.length;
    registerRecords(dataSource);
    dataSource.show = true;
  }

  const layer = {
    id,
    name,
    icon,
    source,
    updateInterval: config.updateInterval || 0,
    statsRefreshInterval: 1000,

    init(viewer) {
      _viewer = viewer;
    },

    async enable(viewer) {
      if (_destroyed) return;
      _viewer = viewer;
      _enabled = true;
      _error = null;
      if (!_data) {
        _loading = true;
        _loadController = new AbortController();
        try {
          _data = await config.loadData(_loadController.signal);
        } catch (error) {
          _loading = false;
          if (_destroyed || error?.name === 'AbortError') return;
          _error = localDatasetError(error);
          console.error(`Failed to load ${id}:`, error);
          return;
        } finally {
          _loadController = null;
        }
        _loading = false;
      }
      if (!_enabled || _destroyed) return;
      try {
        if (!_dataSource) await buildScene(viewer);
        _lastUpdate = _lastUpdate || Date.now();
      } catch (error) {
        _error = localDatasetError(error);
        console.error(`Failed to build ${id}:`, error);
        release(viewer);
        return;
      }
      if (!_enabled || _destroyed) return;
      if (config.osmDerived && _count > 0) services.showOsmCredit?.(viewer, id);
      if (!_clickHandler) {
        _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        _clickHandler.setInputAction(
          onClick,
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );
      }
      if (!_moveEndRemover)
        _moveEndRemover = viewer.camera.moveEnd.addEventListener(() => {
          if (_enabled) publishLabels();
        });
      setOverlayVisible(true);
      publishLabels();
      config.onEnabled?.(viewer, layer);
      viewer.scene.requestRender?.();
    },

    disable(viewer = _viewer) {
      _enabled = false;
      _loadController?.abort();
      services.hideOsmCredit?.(viewer, id);
      closeInfoCard(id);
      setOverlayVisible(false);
      if (_moveEndRemover) {
        _moveEndRemover();
        _moveEndRemover = null;
      }
      if (_clickHandler) {
        _clickHandler.destroy();
        _clickHandler = null;
      }
      if (viewer?.selectedEntity?.__baLayerId === id)
        viewer.selectedEntity = undefined;
      release(viewer);
      config.onDisabled?.(viewer, layer);
      viewer?.scene?.requestRender?.();
    },

    async update(viewer, ctx = {}) {
      if (!_enabled || typeof config.onUpdate !== 'function') return true;
      const result = await config.onUpdate(viewer, {
        ...ctx,
        dataSource: _dataSource,
        layer,
        republishLabels: publishLabels,
        replaceDynamic,
      });
      return result !== false;
    },

    destroy(viewer = _viewer) {
      if (_destroyed) return;
      layer.disable(viewer);
      _destroyed = true;
      _data = null;
      _count = 0;
      _lastUpdate = null;
      _error = null;
      _viewer = null;
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _error,
        ...(_loading
          ? { loading: true, loadingLabel: 'loading dataset…' }
          : {}),
        ...(config.extraStats?.() || {}),
      };
    },

    /**
     * JSON-safe snapshot for the analyst query engine; [] while disabled.
     * @param {number} [maxCount]
     */
    getAnalystRecords(maxCount = 2000) {
      if (!_enabled) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return _records
        .filter((record) => record.analyst)
        .slice(0, limit)
        .map((record) => ({ ...record.analyst }));
    },

    /** Records currently built (tests/QA). */
    _records: () => _records,
  };
  return layer;
}
