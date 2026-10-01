import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import {
  createBundledVectorLayer,
  fetchBundledJson,
} from './boundaries/vectorLayer.js';
import {
  DENSITY_COLORS,
  LINE_STYLE,
  acceptBoundaryParams,
  boundaryLineCard,
  densityClass,
  municipalityAnalystRecords,
  municipalityCard,
  normalizeBoundaryLines,
  normalizeMunicipalities,
  normalizeUnits,
} from './boundaries/model.js';

const municipalitiesUrl = new URL(
  '../../data/local_data/bosnia/boundaries/municipalities.geojson',
  import.meta.url,
).href;
const linesUrl = new URL(
  '../../data/local_data/bosnia/boundaries/lines.geojson',
  import.meta.url,
).href;
const unitsUrl = new URL(
  '../../data/local_data/bosnia/boundaries/units.json',
  import.meta.url,
).href;

const ACCENT = '#ffd166';
const NEUTRAL_FILL = Cesium.Color.fromCssColorString('#9fb3c8').withAlpha(0.04);

/**
 * Entities, cantons and municipalities of BiH (geoBoundaries, public domain)
 * with 2013 census population (BHAS). Bundled; no network beyond the app.
 * setParams({ choropleth: true }) shades municipalities by population density.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-boundaries');
  return createBundledVectorLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'geoBoundaries · BHAS 2013',
      params: { initial: { choropleth: false }, accept: acceptBoundaryParams },
      async load({ signal }) {
        const [m, l, u] = await Promise.all([
          fetchBundledJson(municipalitiesUrl, { signal }),
          fetchBundledJson(linesUrl, { signal }),
          fetchBundledJson(unitsUrl, { signal }),
        ]);
        const units = normalizeUnits(u);
        return {
          municipalities: normalizeMunicipalities(m),
          lines: normalizeBoundaryLines(l),
          units,
          cantons: new Map(
            units.filter((x) => x.kind === 'canton').map((x) => [x.code, x]),
          ),
        };
      },
      groundAnchors: (model) => [
        ...model.municipalities
          .filter((m) => m.labelLon != null)
          .map((m) => ({ lon: m.labelLon, lat: m.labelLat })),
        ...model.units.map((u) => ({ lon: u.labelLon, lat: u.labelLat })),
      ],
      render(model, draw, params) {
        const fills = [];
        for (const m of model.municipalities) {
          const card = municipalityCard(m, model.cantons);
          const pick = draw.pick({
            key: m.id,
            title: card.title,
            details: card.details,
            accent: ACCENT,
            lon: m.labelLon,
            lat: m.labelLat,
            context: {
              entity: m.entity,
              canton: m.canton ? model.cantons.get(m.canton)?.name : null,
              population2013: m.population2013,
              areaKm2: m.areaKm2,
            },
          });
          const cls = params.choropleth ? densityClass(m.density) : null;
          const color =
            cls == null
              ? NEUTRAL_FILL
              : Cesium.Color.fromCssColorString(DENSITY_COLORS[cls]).withAlpha(
                  0.5,
                );
          for (const rings of m.polygons) fills.push({ rings, color, pick });
        }
        draw.polygons(fills);

        const lineItems = [];
        for (const level of ['municipal', 'canton', 'entity', 'national']) {
          const style = LINE_STYLE[level];
          const color = Cesium.Color.fromCssColorString(style.color).withAlpha(
            style.alpha,
          );
          const card = boundaryLineCard(level);
          const pick = card
            ? draw.pick({
                key: `line:${level}`,
                title: card.title,
                details: card.details,
                accent: ACCENT,
                anchorAtFeature: false,
                lon: 17.8,
                lat: 44.2,
              })
            : undefined;
          for (const positions of model.lines[level])
            lineItems.push({ positions, color, width: style.width, pick });
        }
        draw.lines(lineItems);

        const labels = [];
        for (const u of model.units) {
          labels.push({
            id: `${u.kind}:${u.code}`,
            lon: u.labelLon,
            lat: u.labelLat,
            title: u.name,
            accent: u.kind === 'entity' ? ACCENT : '#66c7ff',
            priority: u.kind === 'entity' ? 3000 : 2000,
            minDistance: u.kind === 'entity' ? 180_000 : 45_000,
            maxDistance: u.kind === 'entity' ? 2_500_000 : 480_000,
          });
        }
        for (const m of model.municipalities) {
          if (m.labelLon == null) continue;
          labels.push({
            id: `m:${m.id}`,
            lon: m.labelLon,
            lat: m.labelLat,
            title: m.name,
            accent: '#e6edf3',
            priority: Math.round(m.population2013 || 0) / 1000,
            maxDistance: 95_000,
            gapPx: 2,
          });
        }
        draw.labels(labels, { collisionCapacity: 160 });
        return model.municipalities.length;
      },
      analystRecords: (model) =>
        municipalityAnalystRecords(model.municipalities, model.cantons),
    },
    deps,
  );
}
