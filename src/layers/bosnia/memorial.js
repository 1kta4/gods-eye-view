import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import { createBaGeoLayer, fetchBundledJson } from './heritage/baGeoLayer.js';
import {
  MEMORIAL_COLOR,
  memorialAnalyst,
  memorialCard,
  memorialLabel,
  normaliseMemorialSite,
} from './memorial/model.js';

const DATA_URL = new URL(
  '../../data/local_data/bosnia/memorial/memorial.json',
  import.meta.url,
).href;

/**
 * ba-memorial — "War Memory 1992–95": a small curated set of memorials and
 * sites documented by the ICTY/IRMCT, the ICJ and courts in BiH. Deliberately
 * plain styling: muted markers, no pulses or HUD accents.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-memorial');
  return createBaGeoLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'Curated · ICTY / ICJ / memorial sources',
      accent: MEMORIAL_COLOR,
      labelMax: 40,
      labelGridPx: 150,
      loadData: (signal) => fetchBundledJson(DATA_URL, signal),
      build(data, { dataSource }) {
        const base = Cesium.Color.fromCssColorString(MEMORIAL_COLOR);
        const records = [];
        const sites = Array.isArray(data?.sites) ? data.sites : [];
        for (const site of sites.map(normaliseMemorialSite).filter(Boolean)) {
          const entity = dataSource.entities.add({
            id: `ba-memorial:${site.id}`,
            position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat),
            point: {
              pixelSize: site.approximate ? 8 : 9,
              // Approximate positions read as an open ring.
              color: site.approximate
                ? base.withAlpha(0.15)
                : base.withAlpha(0.95),
              outlineColor: site.approximate
                ? base
                : Cesium.Color.fromCssColorString('#2b2b2b'),
              outlineWidth: site.approximate ? 2 : 1.5,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          records.push({
            id: site.id,
            lat: site.lat,
            lon: site.lon,
            entity,
            label: memorialLabel(site),
            priority: site.kind === 'memorial' ? 1200 : 1000,
            card: () => memorialCard(site),
            properties: {
              name: site.name,
              date: site.date,
              kind: site.kind,
              description: site.description,
            },
            analyst: memorialAnalyst(site),
          });
        }
        return { records };
      },
    },
    deps,
  );
}
