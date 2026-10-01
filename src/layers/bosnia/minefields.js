import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import { createBaGeoLayer, fetchBundledJson } from './heritage/baGeoLayer.js';
import {
  MINE_RED,
  MINE_WARNING,
  hatchSegments,
  mineCard,
  mineLabel,
  normaliseMineFeature,
  normaliseSuspectedStats,
} from './minefields/model.js';
import {
  hideMinefieldWarning,
  showMinefieldWarning,
} from './minefields/warningBanner.js';

const DATA_URL = new URL(
  '../../data/local_data/bosnia/minefields/minefields.geojson',
  import.meta.url,
).href;
const STATS_URL = new URL(
  '../../data/local_data/bosnia/minefields/suspected_area_2025.json',
  import.meta.url,
).href;

/** Official total the warning cites (BHMAC, Jan 2026). */
const OFFICIAL_SUSPECTED_KM2 = 775;
const MAX_HATCH_SEGMENTS = 30_000;

/**
 * ba-minefields — OSM community-mapped mine-suspected areas, drawn as red
 * translucent fill + red outline + diagonal hatch, with a centroid marker so
 * small areas stay findable from far away. Never presented as complete.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-minefields');
  let summary = { features: 0, polygons: 0, mappedKm2: 0, stats: null };

  return createBaGeoLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'OpenStreetMap (community)',
      accent: MINE_RED,
      labelMax: 50,
      labelGridPx: 140,
      osmDerived: true,
      async loadData(signal) {
        const [geo, stats] = await Promise.all([
          fetchBundledJson(DATA_URL, signal),
          fetchBundledJson(STATS_URL, signal).catch(() => null),
        ]);
        return { geo, stats: stats ? normaliseSuspectedStats(stats) : null };
      },
      build(data, { dataSource }) {
        const red = Cesium.Color.fromCssColorString(MINE_RED);
        const fill = red.withAlpha(0.35);
        const records = [];
        const hatchInstances = [];
        let polygons = 0;
        let mappedKm2 = 0;
        const features = Array.isArray(data?.geo?.features)
          ? data.geo.features
          : [];
        for (const record of features
          .map(normaliseMineFeature)
          .filter(Boolean)) {
          const shapes = [];
          for (const rings of record.polygons) {
            polygons++;
            const [outer, ...holes] = rings;
            shapes.push(
              dataSource.entities.add({
                polygon: {
                  hierarchy: new Cesium.PolygonHierarchy(
                    Cesium.Cartesian3.fromDegreesArray(outer.flat()),
                    holes.map(
                      (hole) =>
                        new Cesium.PolygonHierarchy(
                          Cesium.Cartesian3.fromDegreesArray(hole.flat()),
                        ),
                    ),
                  ),
                  material: fill,
                  classificationType: Cesium.ClassificationType.BOTH,
                },
              }),
            );
            for (const ring of rings) {
              shapes.push(
                dataSource.entities.add({
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
                    width: 2.5,
                    material: red,
                    clampToGround: true,
                    classificationType: Cesium.ClassificationType.BOTH,
                  },
                }),
              );
            }
            if (hatchInstances.length < MAX_HATCH_SEGMENTS) {
              for (const [a, b] of hatchSegments(rings, { spacingM: 60 })) {
                hatchInstances.push(
                  new Cesium.GeometryInstance({
                    geometry: new Cesium.GroundPolylineGeometry({
                      positions: Cesium.Cartesian3.fromDegreesArray([
                        ...a,
                        ...b,
                      ]),
                      width: 1.5,
                    }),
                  }),
                );
              }
            }
          }
          for (const line of record.lines) {
            shapes.push(
              dataSource.entities.add({
                polyline: {
                  positions: Cesium.Cartesian3.fromDegreesArray(line.flat()),
                  width: 3,
                  material: new Cesium.PolylineDashMaterialProperty({
                    color: red,
                  }),
                  clampToGround: true,
                },
              }),
            );
          }
          if (record.areaKm2) mappedKm2 += record.areaKm2;
          const entity = dataSource.entities.add({
            id: `ba-minefields:${record.id}`,
            position: Cesium.Cartesian3.fromDegrees(record.lon, record.lat),
            point: {
              pixelSize: 9,
              color: red,
              outlineColor: Cesium.Color.fromCssColorString('#1a0000'),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          records.push({
            id: record.id,
            lat: record.lat,
            lon: record.lon,
            entity,
            pickEntities: shapes,
            label: mineLabel(record),
            priority: Math.round((record.areaKm2 || 0) * 1000),
            card: () => mineCard(record),
            properties: {
              kind: record.kind,
              areaKm2: record.areaKm2,
              warning: MINE_WARNING,
            },
            analyst: {
              id: record.id,
              kind: record.kind,
              areaKm2: record.areaKm2,
              lat: record.lat,
              lon: record.lon,
              note: 'Incomplete OSM community mapping; not official data.',
            },
          });
        }
        const primitives = hatchInstances.length
          ? [
              new Cesium.GroundPolylinePrimitive({
                geometryInstances: hatchInstances,
                appearance: new Cesium.PolylineMaterialAppearance({
                  material: Cesium.Material.fromType('Color', {
                    color: red.withAlpha(0.75),
                  }),
                }),
                classificationType: Cesium.ClassificationType.BOTH,
                asynchronous: true,
              }),
            ]
          : [];
        summary = {
          features: records.length,
          polygons,
          mappedKm2,
          stats: data?.stats || null,
        };
        return { records, primitives };
      },
      onEnabled() {
        showMinefieldWarning(summary.stats);
      },
      onDisabled() {
        hideMinefieldWarning();
      },
      extraStats: () => ({
        ...(summary.features > 0 ? { status: 'idle' } : {}),
        statusMessage: `${summary.features} OSM features · ${summary.mappedKm2.toFixed(1)} km² mapped of ~${OFFICIAL_SUSPECTED_KM2} km² suspected · INCOMPLETE, NOT official — absence ≠ safe`,
        warning: MINE_WARNING,
        coverage: `OSM-mapped ${summary.mappedKm2.toFixed(1)} km² ≈ ${Math.round((summary.mappedKm2 / OFFICIAL_SUSPECTED_KM2) * 100)}% of the ~${OFFICIAL_SUSPECTED_KM2} km² officially suspected (BHMAC, Jan 2026)`,
        polygons: summary.polygons,
      }),
    },
    deps,
  );
}
