import * as Cesium from 'cesium';
import { isPointerFree } from '../../../data/inputOwnership.js';

/**
 * Shared renderer for the bundled Bosnia vector layers (boundaries, disaster
 * history, airports, railways). Data ships with the build, so a layer loads
 * once, keeps the parsed model across toggles and rebuilds only its batched
 * primitives:
 *  - polygon fills  -> one GroundPrimitive (draped) or Primitive (extruded)
 *  - polylines      -> one GroundPolylinePrimitive per style batch
 *  - points         -> one PointPrimitiveCollection
 *  - labels / cards -> the shared world-overlay host (canvas, no DOM text)
 * Batches carry per-instance pick ids so one click handler resolves any
 * feature to a card plus a contextStore record.
 */

const SELECTED_SOURCE_SUFFIX = ':selected';
const HEIGHT_RESOLVE_TIMEOUT_MS = 4000;

/** Stable key for a rounded coordinate used by the ground-height cache. */
export function heightKey(lon, lat) {
  return `${Number(lon).toFixed(3)},${Number(lat).toFixed(3)}`;
}

/** Ground draped primitives classify the surface the active map stack shows. */
function classificationForScene(scene) {
  if (!scene?.globe) return Cesium.ClassificationType.BOTH;
  return scene.globe.show === false
    ? Cesium.ClassificationType.CESIUM_3D_TILE
    : Cesium.ClassificationType.TERRAIN;
}

function toCartesians(coords, height = 0) {
  const flat = [];
  for (const [lon, lat] of coords) flat.push(lon, lat);
  return height
    ? Cesium.Cartesian3.fromDegreesArray(flat).map((p) => {
        const c = Cesium.Cartographic.fromCartesian(p);
        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, height);
      })
    : Cesium.Cartesian3.fromDegreesArray(flat);
}

function dropClosingVertex(ring) {
  if (ring.length < 2) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}

function hierarchyFromRings(rings) {
  const [outer, ...holes] = rings;
  return new Cesium.PolygonHierarchy(
    toCartesians(dropClosingVertex(outer)),
    holes.map(
      (hole) =>
        new Cesium.PolygonHierarchy(toCartesians(dropClosingVertex(hole))),
    ),
  );
}

/**
 * Create one Bosnia bundled vector layer.
 * @param {object} spec
 * @param {string} spec.id Manifest id.
 * @param {string} spec.name Panel name.
 * @param {string} spec.icon Panel icon.
 * @param {string} spec.source Short source label.
 * @param {function({signal:AbortSignal}):Promise<object>} spec.load Fetch + normalise bundled data.
 * @param {function(object, object):number} spec.render Draw the model; returns feature count.
 * @param {function(object):Array<{lon:number,lat:number}>} [spec.groundAnchors] Points to lift onto the surface.
 * @param {function(object, number):object[]} [spec.analystRecords]
 * @param {object} [spec.params] `{ initial, accept(params, current) -> next|null }`.
 * @param {object} deps `{ surface, localGeoJsonServices }`.
 */
export function createBundledVectorLayer(spec, deps = {}) {
  const services = deps.localGeoJsonServices || {};
  const overlayHost = services.overlayHost || null;
  const requestRender = (reason) =>
    services.governorRequestRender?.(`${spec.id}:${reason}`);
  const labelSource = spec.id;
  const selectedSource = `${spec.id}${SELECTED_SOURCE_SUFFIX}`;

  let viewer = null;
  let enabled = false;
  let model = null;
  let loadPromise = null;
  let loadController = null;
  let primitives = [];
  let pointCollection = null;
  let clickHandler = null;
  let count = 0;
  let lastUpdate = null;
  let error = null;
  let heights = new Map();
  let params = { ...(spec.params?.initial || {}) };
  let selectedPick = null;
  const picks = new Set();

  function clearDrawing() {
    for (const primitive of primitives) {
      try {
        if (viewer?.scene) {
          viewer.scene.groundPrimitives.remove(primitive) ||
            viewer.scene.primitives.remove(primitive);
        }
      } catch {
        /* already destroyed */
      }
    }
    primitives = [];
    if (pointCollection && viewer?.scene) {
      viewer.scene.primitives.remove(pointCollection);
    }
    pointCollection = null;
    overlayHost?.clearSource(labelSource);
    clearSelection();
    services.removeEntityContextsForLayer?.(spec.id);
    picks.clear();
  }

  function heightAt(lon, lat, fallback = 0) {
    const h = heights.get(heightKey(lon, lat));
    return Number.isFinite(h) ? h : fallback;
  }

  /** Register a pick payload: `{ title, details, lon, lat, context }`. */
  function pick(payload) {
    const record = { ...payload, gevBosniaLayer: spec.id, show: true };
    picks.add(record);
    return record;
  }

  const draw = {
    pick,
    heightAt,
    /**
     * @param {Array<{rings:number[][][], color:Cesium.Color, pick?:object}>} items
     * @param {{extruded?:{lower:number, upper:number}}} [options]
     */
    polygons(items, { extruded = false } = {}) {
      if (!items.length) return;
      const scene = viewer.scene;
      const instances = [];
      const extInstances = [];
      for (const item of items) {
        if (!item.rings?.length || item.rings[0].length < 3) continue;
        const color = Cesium.ColorGeometryInstanceAttribute.fromColor(
          item.color,
        );
        const polygonHierarchy = hierarchyFromRings(item.rings);
        if (extruded || item.extruded) {
          const ext = item.extruded || extruded;
          extInstances.push(
            new Cesium.GeometryInstance({
              geometry: new Cesium.PolygonGeometry({
                polygonHierarchy,
                height: ext.lower,
                extrudedHeight: ext.upper,
                vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              id: item.pick,
              attributes: { color },
            }),
          );
        } else {
          instances.push(
            new Cesium.GeometryInstance({
              geometry: new Cesium.PolygonGeometry({ polygonHierarchy }),
              id: item.pick,
              attributes: { color },
            }),
          );
        }
      }
      if (instances.length) {
        const primitive = new Cesium.GroundPrimitive({
          geometryInstances: instances,
          classificationType: classificationForScene(scene),
          appearance: new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          asynchronous: true,
        });
        scene.groundPrimitives.add(primitive);
        primitives.push(primitive);
      }
      if (extInstances.length) {
        const primitive = new Cesium.Primitive({
          geometryInstances: extInstances,
          appearance: new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: true,
            closed: true,
          }),
          asynchronous: true,
        });
        scene.primitives.add(primitive);
        primitives.push(primitive);
      }
    },
    /**
     * Draped polylines. Width is in screen pixels.
     * @param {Array<{positions:number[][], color:Cesium.Color, width:number, pick?:object}>} items
     * @param {{dash?:Cesium.Color}} [options] Draw the batch dashed in one colour.
     */
    lines(items, { dash = null } = {}) {
      const usable = items.filter((item) => item.positions?.length >= 2);
      if (!usable.length) return;
      const scene = viewer.scene;
      if (!Cesium.GroundPolylinePrimitive.isSupported(scene)) {
        // Fallback: plain polylines on the ellipsoid.
        const collection = new Cesium.PolylineCollection();
        for (const item of usable) {
          collection.add({
            positions: toCartesians(item.positions),
            width: item.width,
            material: Cesium.Material.fromType('Color', { color: item.color }),
            id: item.pick,
          });
        }
        scene.primitives.add(collection);
        primitives.push(collection);
        return;
      }
      const primitive = new Cesium.GroundPolylinePrimitive({
        geometryInstances: usable.map(
          (item) =>
            new Cesium.GeometryInstance({
              geometry: new Cesium.GroundPolylineGeometry({
                positions: toCartesians(item.positions),
                width: item.width,
              }),
              id: item.pick,
              attributes: dash
                ? {}
                : {
                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                      item.color,
                    ),
                  },
            }),
        ),
        classificationType: classificationForScene(scene),
        appearance: dash
          ? new Cesium.PolylineMaterialAppearance({
              material: Cesium.Material.fromType('PolylineDash', {
                color: dash,
                dashLength: 14,
              }),
            })
          : new Cesium.PolylineColorAppearance({ translucent: true }),
        asynchronous: true,
      });
      scene.groundPrimitives.add(primitive);
      primitives.push(primitive);
    },
    /**
     * Screen-sized dots, never depth-culled against the photoreal mesh.
     * @param {Array<{lon:number, lat:number, height?:number, color:Cesium.Color, size?:number, pick?:object}>} items
     */
    points(items) {
      if (!items.length) return;
      if (!pointCollection) {
        pointCollection = new Cesium.PointPrimitiveCollection();
        viewer.scene.primitives.add(pointCollection);
      }
      for (const item of items) {
        pointCollection.add({
          position: Cesium.Cartesian3.fromDegrees(
            item.lon,
            item.lat,
            item.height ?? heightAt(item.lon, item.lat),
          ),
          color: item.color,
          pixelSize: item.size || 8,
          outlineColor: item.outlineColor || Cesium.Color.BLACK.withAlpha(0.85),
          outlineWidth: item.outlineWidth ?? 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: item.scaleByDistance,
          id: item.pick,
        });
      }
    },
    /**
     * Ambient labels on the shared overlay host.
     * @param {Array<{id:string, lon:number, lat:number, height?:number, title:string,
     *   details?:string[], accent?:string, priority?:number, minDistance?:number,
     *   maxDistance?:number, variant?:string}>} items
     */
    labels(items, options = {}) {
      if (!overlayHost) return;
      const entries = items.map((item) => ({
        id: String(item.id),
        position: Cesium.Cartesian3.fromDegrees(
          item.lon,
          item.lat,
          item.height ?? heightAt(item.lon, item.lat),
        ),
        variant: item.variant || 'label',
        title: item.title,
        // The label variant paints the title only; details would just pad the box.
        details: item.variant === 'card' ? item.details || [] : [],
        accent: item.accent,
        priority: item.priority ?? 0,
        collisionGroup:
          item.variant === 'card' ? 'ambient-card' : 'ambient-label',
        interactive: false,
        minDistance: item.minDistance ?? 0,
        maxDistance: item.maxDistance ?? Number.POSITIVE_INFINITY,
        distanceFadeStartRatio: 0.8,
        edgeFade: 'keyhole',
        horizonCull: true,
        terrainOcclusion: false,
        gapPx: item.gapPx ?? 4,
        verticalOnly: true,
        placement: 'above',
      }));
      overlayHost.setEntries(labelSource, entries, {
        cohortLimit: Math.min(900, Math.max(64, entries.length)),
        collisionCapacity: options.collisionCapacity ?? 96,
        moving: false,
      });
      overlayHost.setVisible(labelSource, enabled);
    },
  };

  function clearSelection() {
    if (!selectedPick) return;
    selectedPick = null;
    overlayHost?.clearSource(selectedSource);
    services.clearSelectedEntityContextForLayer?.(spec.id);
  }

  function selectPick(record, clickPosition) {
    selectedPick = record;
    let position = clickPosition;
    if (!position) {
      position = Cesium.Cartesian3.fromDegrees(
        record.lon,
        record.lat,
        heightAt(record.lon, record.lat),
      );
    }
    overlayHost?.setEntries(
      selectedSource,
      [
        {
          id: 'selected',
          position,
          variant: 'selected',
          selected: true,
          protected: true,
          paintLane: 'selected',
          collisionGroup: 'ambient-card',
          title: record.title,
          details: record.details || [],
          accent: record.accent,
          priority: Number.MAX_SAFE_INTEGER,
          interactive: false,
          anchorRadiusPx: 7,
          minAnchorGapPx: 11,
          edgeFade: 'keyhole',
          horizonCull: true,
          terrainOcclusion: false,
          verticalOnly: true,
          placement: 'above',
        },
      ],
      { cohortLimit: 1, collisionCapacity: 0, moving: false },
    );
    overlayHost?.setVisible(selectedSource, true);
    if (services.registerEntityContext && services.selectEntityContext) {
      services.registerEntityContext(record, {
        id: `${spec.id}:${record.key || record.title}`,
        layerId: spec.id,
        layerName: spec.name,
        source: spec.source,
        label: record.title,
        properties: record.context || {},
        latitude: Number(record.lat?.toFixed?.(6) ?? record.lat),
        longitude: Number(record.lon?.toFixed?.(6) ?? record.lon),
      });
      services.selectEntityContext(record);
    }
    requestRender('select');
  }

  function installClick() {
    if (clickHandler || !viewer?.scene?.canvas) return;
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click) => {
      if (!isPointerFree() || !enabled) return;
      const picked = viewer.scene.pick(click.position);
      const record = picked?.id;
      if (record && record.gevBosniaLayer === spec.id && picks.has(record)) {
        let position = null;
        try {
          if (viewer.scene.pickPositionSupported)
            position = viewer.scene.pickPosition(click.position) || null;
        } catch {
          position = null;
        }
        if (record.anchorAtFeature) position = null;
        selectPick(record, position);
      } else if (selectedPick) {
        clearSelection();
        requestRender('deselect');
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  async function resolveHeights(signal) {
    const anchors = spec.groundAnchors?.(model) || [];
    const resolver = deps.surface?.terrain?.resolveEllipsoidalGround;
    if (!anchors.length || typeof resolver !== 'function') return;
    const coords = anchors.map((a) => ({ lat: a.lat, lon: a.lon }));
    let timer = null;
    try {
      const result = await Promise.race([
        resolver(coords, { signal }),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), HEIGHT_RESOLVE_TIMEOUT_MS);
        }),
      ]);
      if (!Array.isArray(result)) return;
      const next = new Map(heights);
      result.forEach((entry, i) => {
        if (Number.isFinite(entry?.ellipsoid))
          next.set(heightKey(coords[i].lon, coords[i].lat), entry.ellipsoid);
      });
      heights = next;
    } catch {
      /* heights are cosmetic: keep ellipsoid 0 / data elevations */
    } finally {
      clearTimeout(timer);
    }
  }

  function render() {
    if (!viewer || !model || !enabled) return;
    clearDrawing();
    count = spec.render(model, draw, params) || 0;
    requestRender('render');
  }

  function onStackChanged() {
    // Ground classification depends on the active map stack.
    if (enabled && model) render();
  }

  async function ensureLoaded() {
    if (model) return model;
    if (!loadPromise) {
      loadController = new AbortController();
      const signal = loadController.signal;
      loadPromise = (async () => {
        const loaded = await spec.load({ signal });
        signal.throwIfAborted();
        model = loaded;
        await resolveHeights(signal);
        return model;
      })().finally(() => {
        loadPromise = null;
      });
    }
    return loadPromise;
  }

  const layer = {
    id: spec.id,
    name: spec.name,
    icon: spec.icon,
    source: spec.source,
    updateInterval: 0,

    init(v) {
      viewer = v;
      overlayHost?.setVisible(labelSource, false);
    },

    async enable(v = viewer) {
      viewer = v || viewer;
      enabled = true;
      installClick();
      globalThis.window?.addEventListener?.(
        'gev:map-stack-changed',
        onStackChanged,
      );
      overlayHost?.setVisible(labelSource, true);
      if (model) render();
    },

    disable() {
      enabled = false;
      loadController?.abort();
      loadController = null;
      globalThis.window?.removeEventListener?.(
        'gev:map-stack-changed',
        onStackChanged,
      );
      clearDrawing();
      overlayHost?.setVisible(labelSource, false);
      clickHandler?.destroy();
      clickHandler = null;
      count = 0;
      requestRender('disable');
    },

    async update() {
      if (!enabled) return false;
      try {
        await ensureLoaded();
        if (!enabled) return false;
        if (!primitives.length && !pointCollection) render();
        lastUpdate = lastUpdate || Date.now();
        error = null;
        return true;
      } catch (e) {
        if (e?.name === 'AbortError' || !enabled) return false;
        error = e?.message || 'Bundled data failed to load';
        console.error(`[Data:Bosnia] ${spec.name}:`, e);
        return false;
      }
    },

    destroy() {
      layer.disable();
      model = null;
      viewer = null;
    },

    getStats() {
      return { count, lastUpdate, error };
    },

    getAnalystRecords(maxCount = 2000) {
      if (!enabled || !model || !spec.analystRecords) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return spec.analystRecords(model, limit).slice(0, limit);
    },
  };

  if (spec.params) {
    layer.getParams = () => ({ ...params });
    layer.setParams = (next = {}) => {
      const accepted = spec.params.accept(next, params);
      if (!accepted) return false;
      params = accepted;
      if (enabled && model) render();
      return true;
    };
  }

  return layer;
}

/** Fetch one bundled JSON asset with a size guard. */
export async function fetchBundledJson(
  url,
  { signal, maxBytes = 6_000_000 } = {},
) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const text = await response.text();
  if (text.length > maxBytes)
    throw new Error(`Bundled asset too large: ${url}`);
  return JSON.parse(text);
}
