import * as Cesium from 'cesium';
import { WAIT_BANDS, BIHAMK_CONDITIONS_URL } from './bihamk.js';
import {
  conditionsCardCopy,
  crossingAnalystRecords,
  crossingCardCopy,
  mergeCrossings,
  normalizeCrossingDataset,
  shortWait,
} from './model.js';

export const BORDER_OVERLAY_SOURCE_ID = 'ba-border-crossings';
export const BORDER_API = '/api/ba/border-crossings';
const LAYER_ID = 'ba-border-crossings';
const PICK_PREFIX = 'ba-border:';
const CONDITIONS_CARD_ID = 'ba-roads-conditions';
/** Card anchor for the national report: central Bosnia. */
const CONDITIONS_ANCHOR = Object.freeze({ lat: 44.05, lon: 17.75 });
const CARD_SHARED = Object.freeze({
  cardStyle: 'tactical',
  collisionGroup: 'ambient-card',
  edgeFade: 'keyhole',
  horizonCull: true,
  terrainOcclusion: false,
  verticalOnly: true,
  viewportMargin: 4,
  gapPx: 14,
  leaderOffsetPx: 8,
});
const HOST_OPTIONS = Object.freeze({
  cohortLimit: 64,
  collisionCapacity: 64,
  moving: false,
});

/** Read the proxy payload into the shape mergeCrossings expects. */
async function defaultFetchReport(fetchImpl, signal) {
  const response = await fetchImpl(BORDER_API, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== 'object' || !Array.isArray(body.crossings))
    throw new Error('Invalid border-crossing payload');
  return body;
}

/**
 * BiH border crossings coloured by the BIHAMK wait report, with a selection
 * card per crossing and a national road-conditions card.
 */
export function createBorderCrossingsLayer({
  name = 'Border Crossings',
  icon = '🛂',
  loadDataset,
  fetchImpl = (...args) => globalThis.fetch(...args),
  overlayHost = null,
  hitTest = null,
  picking = null,
  pointer = null,
  screenSpaceEventHandlerFactory = null,
  openExternal = null,
  context = null,
} = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _dataset = null;
  let _rows = [];
  let _report = null;
  let _lastUpdate = null;
  let _error = null;
  let _selectedId = null;
  let _clickHandler = null;
  let _request = null;
  const _entityById = new Map();

  function rowById(id) {
    return _rows.find((row) => row.id === id) || null;
  }

  function position(row, lift = 0) {
    return Cesium.Cartesian3.fromDegrees(
      row.lon,
      row.lat,
      (row.elevationM || 0) + lift,
    );
  }

  function publishCards() {
    if (!overlayHost) return;
    if (!_enabled) return;
    const entries = [];
    for (const row of _rows) {
      const selected = row.id === _selectedId;
      const copy = selected
        ? crossingCardCopy(row)
        : { title: row.name, details: [shortWait(row)] };
      entries.push({
        ...CARD_SHARED,
        id: `crossing:${row.id}`,
        position: position(row, 20),
        variant: selected ? 'selected' : 'card',
        title: copy.title,
        details: copy.details,
        accent: row.band.color,
        selected,
        protected: selected,
        interactive: true,
        priority: selected
          ? Number.MAX_SAFE_INTEGER
          : 1000 + (Number.isFinite(row.minutes) ? row.minutes : 0),
        maxDistance: selected ? Number.POSITIVE_INFINITY : 900_000,
      });
    }
    const conditions = conditionsCardCopy(_report?.conditions);
    if (conditions) {
      entries.push({
        ...CARD_SHARED,
        id: CONDITIONS_CARD_ID,
        position: Cesium.Cartesian3.fromDegrees(
          CONDITIONS_ANCHOR.lon,
          CONDITIONS_ANCHOR.lat,
          1200,
        ),
        variant: 'card',
        title: conditions.title,
        details: conditions.details,
        accent: '#7fe6ed',
        selected: false,
        protected: false,
        interactive: true,
        priority: 5000,
        maxDistance: 1_500_000,
      });
    }
    overlayHost.setVisible(BORDER_OVERLAY_SOURCE_ID, true);
    overlayHost.setEntries(BORDER_OVERLAY_SOURCE_ID, entries, HOST_OPTIONS);
  }

  function styleEntity(entity, row) {
    const selected = row.id === _selectedId;
    entity.point.color = Cesium.Color.fromCssColorString(row.band.color);
    entity.point.pixelSize = selected ? 15 : 11;
    entity.point.outlineWidth = selected ? 3 : 2;
  }

  function registerContext(entity, row) {
    context?.registerEntityContext?.(entity, {
      id: `${LAYER_ID}:${row.id}`,
      layerId: LAYER_ID,
      layerName: name,
      source: 'BIHAMK',
      dataSource: _dataSource,
      label: `GP ${row.name}`,
      properties: crossingAnalystRecords([row])[0],
      latitude: row.lat,
      longitude: row.lon,
    });
  }

  function render() {
    if (!_dataSource) return;
    const keep = new Set();
    for (const row of _rows) {
      keep.add(row.id);
      let entity = _entityById.get(row.id);
      if (!entity) {
        entity = _dataSource.entities.add({
          id: `${PICK_PREFIX}${row.id}`,
          position: position(row),
          point: {
            pixelSize: 11,
            color: Cesium.Color.GRAY,
            outlineColor: Cesium.Color.fromCssColorString('#0b0f14'),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(2e4, 1.3, 2e6, 0.7),
          },
        });
        _entityById.set(row.id, entity);
      }
      styleEntity(entity, row);
      registerContext(entity, row);
    }
    for (const [id, entity] of _entityById) {
      if (keep.has(id)) continue;
      _dataSource.entities.remove(entity);
      _entityById.delete(id);
    }
    publishCards();
    _viewer?.scene?.requestRender?.();
  }

  function selectedCamera() {
    const row = _selectedId ? rowById(_selectedId) : null;
    return row?.cameras?.[0] || null;
  }

  function onClick(click) {
    if (!_enabled || !_viewer) return;
    if (pointer && !pointer.isPointerFree()) return;
    const cardHit = hitTest?.(click.position?.x, click.position?.y, {
      sourceId: BORDER_OVERLAY_SOURCE_ID,
    });
    if (cardHit) {
      if (cardHit.entryId === CONDITIONS_CARD_ID) {
        openExternal?.(BIHAMK_CONDITIONS_URL);
        return;
      }
      const id = String(cardHit.entryId).replace(/^crossing:/, '');
      if (id === _selectedId) {
        const camera = selectedCamera();
        if (camera)
          openExternal?.(`/api/cctv/frame/${encodeURIComponent(camera)}`);
        return;
      }
      select(id);
      return;
    }
    const picked = _viewer.scene.pick(click.position);
    const pickId = picking ? picking.resolvePickId(picked) : picked?.id?.id;
    if (typeof pickId === 'string' && pickId.startsWith(PICK_PREFIX)) {
      select(pickId.slice(PICK_PREFIX.length));
      return;
    }
    if (picked && pickId && picking?.isOwnedByOtherLayer(LAYER_ID, pickId))
      return;
    if (_selectedId) select(null);
  }

  function select(id) {
    const row = id ? rowById(id) : null;
    _selectedId = row ? row.id : null;
    for (const r of _rows) {
      const entity = _entityById.get(r.id);
      if (entity) styleEntity(entity, r);
    }
    if (row) {
      const entity = _entityById.get(row.id);
      if (entity) context?.selectEntityContext?.(entity);
    } else {
      context?.clearSelectedEntityContextForLayer?.(LAYER_ID);
    }
    publishCards();
    _viewer?.scene?.requestRender?.();
  }

  async function ensureDataset(signal) {
    if (_dataset) return _dataset;
    const rows = await loadDataset({ signal });
    _dataset = normalizeCrossingDataset(rows);
    return _dataset;
  }

  const layer = {
    id: LAYER_ID,
    name,
    icon,
    source: 'BIHAMK · OSM',
    updateInterval: 10 * 60_000,

    init(viewer) {
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      picking?.registerPickOwner?.(
        LAYER_ID,
        (pickedId) =>
          typeof pickedId === 'string' && pickedId.startsWith(PICK_PREFIX),
      );
      console.log('[Data:BiH] Border crossings initialized');
    },

    async enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      if (!_clickHandler && screenSpaceEventHandlerFactory && viewer) {
        _clickHandler = screenSpaceEventHandlerFactory(viewer);
        _clickHandler.setInputAction(
          onClick,
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );
      }
      try {
        await ensureDataset();
        if (!_rows.length) _rows = mergeCrossings(_dataset, _report);
        render();
      } catch (error) {
        _error = `Bundled crossings unavailable: ${error?.message || error}`;
      }
      return true;
    },

    disable() {
      _enabled = false;
      _request?.abort();
      _request = null;
      if (_dataSource) _dataSource.show = false;
      _clickHandler?.destroy();
      _clickHandler = null;
      if (_selectedId) context?.clearSelectedEntityContextForLayer?.(LAYER_ID);
      _selectedId = null;
      overlayHost?.clearSource(BORDER_OVERLAY_SOURCE_ID);
      overlayHost?.setVisible(BORDER_OVERLAY_SOURCE_ID, false);
    },

    async update(viewer, { signal } = {}) {
      if (!_enabled) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      const abort = () => request.abort();
      signal?.addEventListener?.('abort', abort, { once: true });
      try {
        await ensureDataset(request.signal);
        const report = await defaultFetchReport(fetchImpl, request.signal);
        if (request.signal.aborted || !_enabled) return false;
        _report = report;
        _rows = mergeCrossings(_dataset, report);
        if (_selectedId && !rowById(_selectedId)) _selectedId = null;
        render();
        _lastUpdate = Date.now();
        _error = report.unavailable
          ? report.reason || 'BIHAMK report unavailable'
          : report.stale
            ? report.reason || 'Stale BIHAMK report'
            : null;
        return !report.unavailable;
      } catch (error) {
        if (request.signal.aborted) return false;
        console.warn('[Data:BiH] Border crossings update failed:', error);
        _error = error?.message || 'Border-crossing report unavailable';
        return false;
      } finally {
        signal?.removeEventListener?.('abort', abort);
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      layer.disable();
      picking?.unregisterPickOwner?.(LAYER_ID);
      context?.removeEntityContextsForLayer?.(LAYER_ID);
      if (_dataSource && viewer) viewer.dataSources.remove(_dataSource, true);
      _dataSource = null;
      _entityById.clear();
      _rows = [];
      _viewer = null;
    },

    getStats() {
      const live = _rows.filter((row) => row.live).length;
      return {
        count: _rows.length,
        live,
        lastUpdate: _lastUpdate,
        reportedAt: _report?.updatedAt ?? null,
        error: _error,
        summary: _report?.conditions?.paragraphs?.[0] ?? null,
      };
    },

    getAnalystRecords(maxCount = 2000) {
      if (!_enabled) return [];
      const records = crossingAnalystRecords(_rows, maxCount);
      const paragraphs = _report?.conditions?.paragraphs;
      if (
        Array.isArray(paragraphs) &&
        paragraphs.length &&
        records.length < maxCount
      )
        records.push({
          id: 'ba-road-conditions',
          name: 'BIHAMK road conditions (Bosnia and Herzegovina)',
          lat: CONDITIONS_ANCHOR.lat,
          lon: CONDITIONS_ANCHOR.lon,
          reportedAt: _report.conditions.updatedAt ?? null,
          reportText: paragraphs.join('\n'),
        });
      return records;
    },

    getRowControls() {
      const reported = _report?.updatedAt
        ? `BIHAMK report ${new Date(_report.updatedAt).toLocaleString()}`
        : 'BIHAMK report pending';
      const summary = _report?.conditions?.paragraphs?.[0];
      return {
        chips: [],
        legend: WAIT_BANDS.map((band, index) => ({
          label: band.label,
          color: band.color,
          count: _rows.filter((row) => row.band.id === band.id).length,
          ...(index === 0
            ? {
                blurb: `Passenger-car wait at the crossing. ${reported}.${summary ? ` ${summary}` : ''}`,
              }
            : {}),
        })),
      };
    },
  };
  return layer;
}
