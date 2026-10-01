import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import { createBorderCrossingsLayer } from './borderCrossings/layer.js';
import { loadBundledJson } from '../../data/bundledJson.js';
import * as picking from '../../data/pickRegistry.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { isPointerFree } from '../../data/inputOwnership.js';

const datasetUrl = new URL(
  '../../data/local_data/bosnia/roads/border_crossings.json',
  import.meta.url,
);

/**
 * BiH border crossings (bundled BIHAMK + OSM points) coloured by the live
 * BIHAMK wait report, plus the national road-conditions summary card.
 * @param {object} [deps] Application services ({ localGeoJsonServices }).
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-border-crossings');
  const services = deps.localGeoJsonServices || {};
  return createBorderCrossingsLayer({
    name: row.name,
    icon: row.icon,
    loadDataset: ({ signal } = {}) =>
      loadBundledJson(
        datasetUrl,
        () =>
          import('../../data/local_data/bosnia/roads/border_crossings.json', {
            with: { type: 'json' },
          }),
        { signal },
      ),
    overlayHost: {
      setEntries: overlays.setOverlayEntries,
      setVisible: overlays.setOverlaySourceVisible,
      clearSource: overlays.clearOverlaySource,
    },
    hitTest: overlays.hitTestWorldOverlay,
    picking,
    pointer: { isPointerFree },
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    context: {
      registerEntityContext: services.registerEntityContext,
      selectEntityContext: services.selectEntityContext,
      clearSelectedEntityContextForLayer:
        services.clearSelectedEntityContextForLayer,
      removeEntityContextsForLayer: services.removeEntityContextsForLayer,
    },
  });
}
