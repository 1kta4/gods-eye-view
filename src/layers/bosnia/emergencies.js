import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import {
  createBundledVectorLayer,
  fetchBundledJson,
} from './boundaries/vectorLayer.js';
import {
  EMS_COLORS,
  activationAnalystRecords,
  activationCard,
  activationLabel,
  normalizeActivations,
  normalizeEventGeometry,
} from './emergencies/model.js';

const indexUrl = new URL(
  '../../data/local_data/bosnia/emergencies/activations.json',
  import.meta.url,
).href;
// Vite needs literal paths to bundle each asset.
const GEOMETRY_URLS = Object.freeze({
  'EMSR922.geojson': new URL(
    '../../data/local_data/bosnia/emergencies/EMSR922.geojson',
    import.meta.url,
  ).href,
  'EMSR854.geojson': new URL(
    '../../data/local_data/bosnia/emergencies/EMSR854.geojson',
    import.meta.url,
  ).href,
  'EMSR797.geojson': new URL(
    '../../data/local_data/bosnia/emergencies/EMSR797.geojson',
    import.meta.url,
  ).href,
  'EMSR770.geojson': new URL(
    '../../data/local_data/bosnia/emergencies/EMSR770.geojson',
    import.meta.url,
  ).href,
  'EMSR665.geojson': new URL(
    '../../data/local_data/bosnia/emergencies/EMSR665.geojson',
    import.meta.url,
  ).href,
});

const color = (kind, alpha) =>
  Cesium.Color.fromCssColorString(
    EMS_COLORS[kind] || EMS_COLORS.flood,
  ).withAlpha(alpha);

/**
 * Copernicus EMS Rapid Mapping activations covering BiH: delineated flood
 * extent (blue), burnt area (orange-red) and landslides (brown), plus one
 * marker per activation. Bundled snapshot; older activations without public
 * vector packages show their centroid only.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-emergencies');
  return createBundledVectorLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'Copernicus EMS',
      async load({ signal }) {
        const activations = normalizeActivations(
          await fetchBundledJson(indexUrl, { signal }),
        );
        const geometry = new Map();
        await Promise.all(
          activations
            .filter((a) => a.geometry && GEOMETRY_URLS[a.geometry])
            .map(async (a) => {
              const json = await fetchBundledJson(GEOMETRY_URLS[a.geometry], {
                signal,
              });
              geometry.set(a.code, normalizeEventGeometry(json, a.code));
            }),
        );
        return { activations, geometry };
      },
      groundAnchors: (model) =>
        model.activations.map((a) => ({ lon: a.lon, lat: a.lat })),
      render(model, draw) {
        const fills = [];
        const outlines = [];
        const points = [];
        const labels = [];
        for (const a of model.activations) {
          const card = activationCard(a);
          const pick = draw.pick({
            key: a.code,
            title: card.title,
            details: card.details,
            accent: EMS_COLORS[a.category],
            lon: a.lon,
            lat: a.lat,
            context: {
              category: a.category,
              activationTime: a.activationTime,
              url: a.url,
              mappedHa: a.mappedHa,
            },
          });
          const pointPick = draw.pick({
            ...pick,
            key: `${a.code}:marker`,
            anchorAtFeature: true,
          });
          const geo = model.geometry.get(a.code);
          for (const poly of geo?.polygons || [])
            fills.push({
              rings: poly.rings,
              color: color(poly.kind, 0.6),
              pick,
            });
          for (const aoi of geo?.aois || [])
            outlines.push({
              positions: aoi.ring,
              color: color(a.category, 0.55),
              width: 1.5,
              pick,
            });
          points.push({
            lon: a.lon,
            lat: a.lat,
            color: color(a.category, 1),
            size: 11,
            outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
            outlineWidth: 2,
            pick: pointPick,
          });
          labels.push({
            id: a.code,
            lon: a.lon,
            lat: a.lat,
            title: activationLabel(a),
            accent: EMS_COLORS[a.category],
            priority: Number(a.activationTime.slice(0, 4)),
            maxDistance: 900_000,
            gapPx: 10,
          });
        }
        draw.polygons(fills);
        draw.lines(outlines);
        draw.points(points);
        draw.labels(labels);
        return model.activations.length;
      },
      analystRecords: (model) => activationAnalystRecords(model.activations),
    },
    deps,
  );
}
