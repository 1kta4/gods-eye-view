import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import {
  createBundledVectorLayer,
  fetchBundledJson,
} from './boundaries/vectorLayer.js';
import {
  AIRPORT_STYLE,
  AIRSPACE_STYLE,
  airportCard,
  airspaceCard,
  extrusionFor,
  normalizeAirports,
  normalizeAirspace,
  normalizeRunways,
} from './airports/model.js';

const airportsUrl = new URL(
  '../../data/local_data/bosnia/airports/airports.geojson',
  import.meta.url,
).href;
const runwaysUrl = new URL(
  '../../data/local_data/bosnia/airports/runways.geojson',
  import.meta.url,
).href;
const airspaceUrl = new URL(
  '../../data/local_data/bosnia/airports/airspace.geojson',
  import.meta.url,
).href;

const LABEL_RANGE = Object.freeze({
  large_airport: 1_400_000,
  medium_airport: 600_000,
  small_airport: 140_000,
  heliport: 50_000,
  seaplane_base: 50_000,
  closed: 60_000,
});

function css(color, alpha = 1) {
  return Cesium.Color.fromCssColorString(color).withAlpha(alpha);
}

function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  const n = ring.length - 1 || 1;
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

/**
 * Airports and aerodromes of BiH (OurAirports) with runway centre-lines and
 * BHANSA eAIP airspace: CTRs and prohibited / restricted / danger areas as
 * translucent volumes, TMAs as draped outlines. Bundled AIRAC snapshot.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-airports');
  return createBundledVectorLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'OurAirports · BHANSA eAIP',
      async load({ signal }) {
        const [a, r, s] = await Promise.all([
          fetchBundledJson(airportsUrl, { signal }),
          fetchBundledJson(runwaysUrl, { signal }),
          fetchBundledJson(airspaceUrl, { signal }),
        ]);
        return {
          airports: normalizeAirports(a),
          runways: normalizeRunways(r),
          airspace: normalizeAirspace(s),
          airac: typeof s?.airac === 'string' ? s.airac.slice(0, 10) : null,
        };
      },
      groundAnchors: (model) =>
        model.airports.map((a) => ({ lon: a.lon, lat: a.lat })),
      render(model, draw) {
        // Airspace first so airport dots and runways read on top.
        const volumes = [];
        const outlines = [];
        const labels = [];
        for (const area of model.airspace) {
          const style = AIRSPACE_STYLE[area.type];
          const card = airspaceCard(area);
          const [lon, lat] = ringCentroid(area.ring);
          const pick = draw.pick({
            key: `as:${area.ident}`,
            title: card.title,
            details: [
              ...card.details,
              model.airac ? `AIRAC ${model.airac}` : '',
            ].filter(Boolean),
            accent: style.color,
            lon,
            lat,
            context: {
              type: area.type,
              lower: area.lower.text,
              upper: area.upper.text,
              class: area.airspaceClass,
            },
          });
          if (area.type === 'tma') {
            outlines.push({
              positions: area.ring,
              color: css(style.color, style.alpha),
              width: 2.5,
              pick,
            });
            labels.push({
              id: `as:${area.ident}`,
              lon,
              lat,
              title: `${area.name} ${area.lower.text}–${area.upper.text}`,
              accent: style.color,
              priority: 500,
              minDistance: 120_000,
              maxDistance: 900_000,
            });
          } else {
            volumes.push({
              rings: [area.ring],
              color: css(style.color, style.alpha),
              extruded: extrusionFor(area),
              pick,
            });
            outlines.push({
              positions: area.ring,
              color: css(style.color, 0.9),
              width: area.type === 'ctr' ? 2 : 1.5,
              pick,
            });
            if (
              area.type === 'ctr' ||
              area.type === 'prohibited' ||
              area.type === 'restricted'
            )
              labels.push({
                id: `as:${area.ident}`,
                lon,
                lat,
                title: area.type === 'ctr' ? area.name : area.ident,
                accent: style.color,
                priority: 400,
                maxDistance: 160_000,
              });
          }
        }
        draw.polygons(volumes);

        const byAirport = new Map();
        for (const rw of model.runways) {
          if (!byAirport.has(rw.airportIdent))
            byAirport.set(rw.airportIdent, []);
          byAirport.get(rw.airportIdent).push(rw);
          outlines.push({
            positions: rw.path,
            color: css('#e8f7ff', rw.closed ? 0.4 : 0.95),
            width: 5,
          });
        }
        draw.lines(outlines);

        const points = [];
        for (const a of model.airports) {
          const style = AIRPORT_STYLE[a.type];
          const card = airportCard(
            a,
            byAirport.get(a.icao) || byAirport.get(a.ident) || [],
          );
          const fallback =
            a.elevationFt != null ? a.elevationFt * 0.3048 + 45 : 0;
          const height = draw.heightAt(a.lon, a.lat, fallback);
          const pick = draw.pick({
            key: a.ident,
            title: card.title,
            details: card.details,
            accent: style.color,
            lon: a.lon,
            lat: a.lat,
            anchorAtFeature: true,
            context: { icao: a.icao, iata: a.iata, type: a.type },
          });
          points.push({
            lon: a.lon,
            lat: a.lat,
            height,
            color: css(style.color),
            size: style.size,
            pick,
          });
          const codes = [a.icao, a.iata].filter(Boolean).join('/');
          labels.push({
            id: `ap:${a.ident}`,
            lon: a.lon,
            lat: a.lat,
            height,
            title: codes ? `${a.name} (${codes})` : a.name,
            accent: style.color,
            priority:
              a.type === 'large_airport'
                ? 3000
                : a.type === 'small_airport'
                  ? 1000
                  : 600,
            maxDistance: LABEL_RANGE[a.type],
            gapPx: 9,
          });
        }
        draw.points(points);
        draw.labels(labels);
        return model.airports.length;
      },
      analystRecords: (model) => [
        ...model.airports.map((a) => ({
          id: a.icao || a.ident,
          name: a.name,
          type: a.type,
          lat: a.lat,
          lon: a.lon,
          iata: a.iata,
          elevationFt: a.elevationFt,
        })),
        ...model.airspace.map((s) => ({
          id: s.ident,
          name: s.name,
          type: s.type,
          lower: s.lower.text,
          upper: s.upper.text,
          lat: null,
          lon: null,
        })),
      ],
    },
    deps,
  );
}
