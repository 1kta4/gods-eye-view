/**
 * Draped imagery for the Bosnia raster layers (fire danger, radar). Follows
 * the Recent Imagery host rule: drape on `viewer.imageryLayers` while the
 * globe is shown, otherwise on the photoreal tileset's own `imageryLayers`.
 * Bosnia layers are not handed the tileset, so it is found among the scene
 * primitives. Every layer is removed from the collection that owns it, so a
 * map-source switch or a replaced frame never strands one.
 */

/** Find the imagery collection for the current map stack. */
export function resolveBosniaImageryHost(viewer, Cesium) {
  const scene = viewer?.scene;
  if (scene?.globe?.show === true && viewer.imageryLayers)
    return { collection: viewer.imageryLayers, kind: 'globe' };
  const primitives = scene?.primitives;
  const visit = (collection, depth) => {
    if (!collection || depth > 2) return null;
    for (let i = 0; i < (collection.length || 0); i++) {
      const item = collection.get(i);
      if (!item || item.isDestroyed?.()) continue;
      if (
        Cesium?.Cesium3DTileset &&
        item instanceof Cesium.Cesium3DTileset &&
        item.show !== false &&
        item.imageryLayers
      )
        return item.imageryLayers;
      if (
        Cesium?.PrimitiveCollection &&
        item instanceof Cesium.PrimitiveCollection
      ) {
        const nested = visit(item, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  };
  const tilesetCollection = visit(primitives, 0);
  if (tilesetCollection)
    return { collection: tilesetCollection, kind: 'tileset' };
  return { collection: null, kind: 'none' };
}

/**
 * @param {object} options
 * @param {object} options.Cesium Cesium namespace.
 * @param {() => void} [options.requestRender]
 * @param {number} [options.hostPollMs] How often to re-check the map stack while shown.
 */
export function createImageryOverlay({
  Cesium,
  requestRender = () => {},
  hostPollMs = 3000,
}) {
  let viewer = null;
  let host = { collection: null, kind: 'none' };
  /** @type {{key:string, makeProvider:() => object, alpha:number, show?:boolean}[]} */
  let specs = [];
  /** @type {Map<string, {layer:object, collection:object}>} */
  const mounted = new Map();
  let timer = null;

  function unmount(key) {
    const record = mounted.get(key);
    if (!record) return;
    mounted.delete(key);
    try {
      record.collection.remove(record.layer, true);
    } catch {
      /* collection already destroyed */
    }
  }

  function unmountAll() {
    for (const key of [...mounted.keys()]) unmount(key);
  }

  function sync() {
    if (!viewer) return;
    const next = resolveBosniaImageryHost(viewer, Cesium);
    if (next.collection !== host.collection) {
      unmountAll();
      host = next;
    }
    if (!host.collection) return;
    const wanted = new Set(specs.map((s) => s.key));
    for (const key of [...mounted.keys()]) if (!wanted.has(key)) unmount(key);
    for (const spec of specs) {
      let record = mounted.get(spec.key);
      if (!record) {
        const layer = host.collection.addImageryProvider(spec.makeProvider());
        record = { layer, collection: host.collection };
        mounted.set(spec.key, record);
      }
      record.layer.alpha = spec.alpha;
      record.layer.show = spec.show !== false;
      host.collection.raiseToTop?.(record.layer);
    }
    requestRender();
  }

  return {
    attach(v) {
      viewer = v;
    },
    /** Replace the shown layers (keys identify reusable layers). */
    show(nextSpecs) {
      specs = nextSpecs;
      sync();
      if (!timer && hostPollMs > 0)
        timer = setInterval(() => {
          const next = resolveBosniaImageryHost(viewer, Cesium);
          if (next.collection !== host.collection) sync();
        }, hostPollMs);
    },
    setVisible(key, visible) {
      const spec = specs.find((s) => s.key === key);
      if (spec) spec.show = visible;
      const record = mounted.get(key);
      if (record) record.layer.show = visible;
      requestRender();
    },
    hide() {
      specs = [];
      clearInterval(timer);
      timer = null;
      unmountAll();
      requestRender();
    },
    hostKind() {
      return viewer ? resolveBosniaImageryHost(viewer, Cesium).kind : 'none';
    },
    mountedCount() {
      return mounted.size;
    },
    destroy() {
      this.hide();
      viewer = null;
      host = { collection: null, kind: 'none' };
    },
  };
}

/** Rough Bosnia and Herzegovina rectangle with a margin (degrees). */
export const BA_RECTANGLE_DEG = Object.freeze({
  west: 15.4,
  south: 42.3,
  east: 19.9,
  north: 45.5,
});
