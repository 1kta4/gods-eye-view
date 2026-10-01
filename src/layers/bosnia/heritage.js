import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import { createBaGeoLayer, fetchBundledJson } from './heritage/baGeoLayer.js';
import {
  HERITAGE_COLORS,
  heritageAnalyst,
  heritageCard,
  heritageLabel,
  heritagePriority,
  normaliseHeritageFeature,
} from './heritage/model.js';

const DATA_URL = new URL(
  '../../data/local_data/bosnia/heritage/heritage.geojson',
  import.meta.url,
).href;

/**
 * ba-heritage — UNESCO World Heritage components in BiH (gold) and National
 * Monuments of BiH designated by KONS (white), bundled from Wikidata.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-heritage');
  let tiers = { unesco: 0, national: 0 };
  return createBaGeoLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'UNESCO · KONS via Wikidata',
      accent: HERITAGE_COLORS.unesco,
      labelMax: 90,
      labelGridPx: 130,
      loadData: (signal) => fetchBundledJson(DATA_URL, signal),
      build(data, { dataSource }) {
        const records = [];
        tiers = { unesco: 0, national: 0 };
        const features = Array.isArray(data?.features) ? data.features : [];
        // National monuments first so UNESCO markers draw on top.
        const rows = features
          .map(normaliseHeritageFeature)
          .filter(Boolean)
          .sort((a, b) =>
            a.tier === b.tier ? 0 : a.tier === 'unesco' ? 1 : -1,
          );
        const gold = Cesium.Color.fromCssColorString(HERITAGE_COLORS.unesco);
        const white = Cesium.Color.fromCssColorString(HERITAGE_COLORS.national);
        for (const record of rows) {
          tiers[record.tier]++;
          const unesco = record.tier === 'unesco';
          const entity = dataSource.entities.add({
            id: `ba-heritage:${record.id}`,
            position: Cesium.Cartesian3.fromDegrees(record.lon, record.lat),
            point: {
              pixelSize: unesco ? 13 : 7,
              color: unesco ? gold : white.withAlpha(0.92),
              outlineColor: unesco
                ? Cesium.Color.fromCssColorString('#3a2a00')
                : Cesium.Color.fromCssColorString('#222222'),
              outlineWidth: unesco ? 2.5 : 1.5,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: unesco
                ? undefined
                : new Cesium.NearFarScalar(2.0e4, 1.25, 1.2e6, 0.7),
            },
          });
          records.push({
            id: record.id,
            lat: record.lat,
            lon: record.lon,
            entity,
            label: heritageLabel(record),
            priority: heritagePriority(record),
            card: () => heritageCard(record),
            properties: {
              name: record.name,
              tier: record.tier,
              year: record.year,
              place: record.place,
              kind: record.kind,
              wikidata: record.wikidata,
            },
            analyst: heritageAnalyst(record),
          });
        }
        return { records };
      },
      extraStats: () => ({
        unesco: tiers.unesco,
        nationalMonuments: tiers.national,
      }),
    },
    deps,
  );
}
