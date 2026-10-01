import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import {
  createBundledVectorLayer,
  fetchBundledJson,
} from './boundaries/vectorLayer.js';
import {
  RAIL_STYLE,
  normalizeRailLines,
  normalizeStations,
  normalizeTimetable,
  railLineCard,
  railStyleKey,
  stationCard,
} from './rail/model.js';

const linesUrl = new URL(
  '../../data/local_data/bosnia/rail/lines.geojson',
  import.meta.url,
).href;
const stationsUrl = new URL(
  '../../data/local_data/bosnia/rail/stations.geojson',
  import.meta.url,
).href;
const timetableUrl = new URL(
  '../../data/local_data/bosnia/rail/zfbh-timetable.json',
  import.meta.url,
).href;

const DRAW_ORDER = [
  'abandoned',
  'disused',
  'construction',
  'preserved',
  'active',
  'activeElectrified',
];

/**
 * Railways of BiH from OpenStreetMap (active, electrified, heritage, disused
 * and abandoned narrow-gauge lines such as the old Ćiro routes) with stations
 * and halts. Station cards carry the ŽFBiH 2025/26 scheduled trains where the
 * public timetable lists them. Bundled snapshot.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-rail');
  return createBundledVectorLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'OpenStreetMap · ŽFBiH',
      async load({ signal }) {
        const [l, s, t] = await Promise.all([
          fetchBundledJson(linesUrl, { signal }),
          fetchBundledJson(stationsUrl, { signal }),
          fetchBundledJson(timetableUrl, { signal }),
        ]);
        return {
          lines: normalizeRailLines(l),
          stations: normalizeStations(s),
          timetable: normalizeTimetable(t),
        };
      },
      groundAnchors: (model) =>
        model.stations.map((s) => ({ lon: s.lon, lat: s.lat })),
      render(model, draw) {
        const items = [];
        const dashed = [];
        const sorted = [...model.lines].sort(
          (a, b) =>
            DRAW_ORDER.indexOf(railStyleKey(a)) -
            DRAW_ORDER.indexOf(railStyleKey(b)),
        );
        sorted.forEach((line, i) => {
          const style = RAIL_STYLE[railStyleKey(line)];
          const card = railLineCard(line);
          const pick = draw.pick({
            key: `line:${i}`,
            title: card.title,
            details: card.details,
            accent: style.color,
            lon: line.paths[0][0][0],
            lat: line.paths[0][0][1],
            context: { status: line.status, electrified: line.electrified },
          });
          const color = Cesium.Color.fromCssColorString(style.color).withAlpha(
            style.alpha,
          );
          const target = line.status === 'abandoned' ? dashed : items;
          for (const positions of line.paths)
            target.push({ positions, color, width: style.width, pick });
        });
        // Abandoned trackbeds dashed so they never read as working lines.
        draw.lines(dashed, {
          dash: Cesium.Color.fromCssColorString(
            RAIL_STYLE.abandoned.color,
          ).withAlpha(RAIL_STYLE.abandoned.alpha),
        });
        draw.lines(items);

        const points = [];
        const labels = [];
        for (const s of model.stations) {
          const card = stationCard(s, model.timetable);
          const major = s.kind === 'station' && !s.disused;
          const accent = s.operator === 'ŽRS' ? '#ff8fb8' : '#e0b3ff';
          points.push({
            lon: s.lon,
            lat: s.lat,
            color: Cesium.Color.fromCssColorString(
              s.disused || s.unfinished ? '#9e9e9e' : '#ffffff',
            ),
            outlineColor: Cesium.Color.fromCssColorString(accent),
            outlineWidth: 2,
            size: major ? 7 : 5,
            pick: draw.pick({
              key: s.id,
              title: card.title,
              details: card.details,
              accent,
              lon: s.lon,
              lat: s.lat,
              anchorAtFeature: true,
              context: { operator: s.operator, kind: s.kind, entity: s.entity },
            }),
          });
          labels.push({
            id: `st:${s.id}`,
            lon: s.lon,
            lat: s.lat,
            title: s.name,
            accent,
            priority: major ? 800 : 200,
            maxDistance: major ? 160_000 : 45_000,
            gapPx: 7,
          });
        }
        draw.points(points);
        draw.labels(labels);
        return model.stations.length;
      },
      analystRecords: (model) =>
        model.stations.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          operator: s.operator,
          entity: s.entity,
          lat: s.lat,
          lon: s.lon,
        })),
    },
    deps,
  );
}
