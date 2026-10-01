import * as Cesium from 'cesium';
import { bosniaLayerRow } from './manifest.js';
import { createBaGeoLayer, fetchBundledJson } from './heritage/baGeoLayer.js';
import { normaliseLivePayload } from './power/entsoe.js';
import {
  BA_HUB,
  DAM_COLOR,
  FUEL_COLORS,
  LINE_COLORS,
  describeFlow,
  flowArc,
  liveCard,
  liveSummaryLine,
  normalisePowerFeature,
  plantPixelSize,
  powerCard,
  powerLabel,
  powerPriority,
} from './power/model.js';

const PLANTS_URL = new URL(
  '../../data/local_data/bosnia/power/plants.geojson',
  import.meta.url,
).href;
const GRID_URL = new URL(
  '../../data/local_data/bosnia/power/grid.geojson',
  import.meta.url,
).href;
const LIVE_URL = '/api/ba/power/live';
const LIVE_REFRESH_MS = 15 * 60_000;

/**
 * ba-power — bundled power plants (sized by MW, coloured by fuel), named
 * dams and 400/220 kV lines, plus — when the server has ENTSOE_API_TOKEN —
 * live load/generation and cross-border flow arcs from ENTSO-E.
 */
export function createLayer(deps = {}) {
  const row = bosniaLayerRow('ba-power');
  let counts = { plants: 0, dams: 0, lines: 0, mw: 0 };
  let live = null;
  let liveError = null;
  let liveRequest = null;

  function drawFlows(dataSource) {
    if (!live?.configured || !live.flows.length)
      return { records: [], entities: [] };
    const entities = [];
    const records = [];
    const hub = BA_HUB;
    for (const flow of live.flows) {
      const info = describeFlow(flow);
      if (info.direction === 'none' || !info.mw) continue;
      const toNeighbour = info.direction === 'export';
      const from = toNeighbour ? hub : flow;
      const to = toNeighbour ? flow : hub;
      const width = Math.max(8, Math.min(26, 6 + Math.sqrt(info.mw) * 0.9));
      const arc = dataSource.entities.add({
        id: `ba-power:flow:${flow.neighbour}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            flowArc(from, to),
          ),
          width,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineArrowMaterialProperty(
            Cesium.Color.fromCssColorString(
              toNeighbour ? '#ffd23f' : '#4fc3f7',
            ).withAlpha(0.85),
          ),
        },
      });
      entities.push(arc);
      const mid = {
        lat: (from.lat + to.lat) / 2,
        lon: (from.lon + to.lon) / 2,
      };
      // Anchor for the MW card on the shared overlay host (world text never
      // uses Cesium labels in this app) and a click target.
      const flowAnchor = dataSource.entities.add({
        id: `ba-power:flowlabel:${flow.neighbour}`,
        position: Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 47_000),
        point: {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString(
            toNeighbour ? '#ffd23f' : '#4fc3f7',
          ),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entities.push(flowAnchor);
      records.push({
        id: `flow-${flow.neighbour}`,
        lat: mid.lat,
        lon: mid.lon,
        heightM: 47_000,
        entity: flowAnchor,
        pickEntities: [arc],
        label: {
          title: info.text,
          details: ['ENTSO-E physical flow'],
          accent: toNeighbour ? '#ffd23f' : '#4fc3f7',
        },
        priority: 100_000 + info.mw,
        card: () => liveCard(live),
        properties: {
          neighbour: flow.name,
          netImportMw: flow.netImportMw,
          importMw: flow.importMw,
          exportMw: flow.exportMw,
          at: flow.at,
        },
        analyst: {
          id: `flow-${flow.neighbour}`,
          neighbour: flow.neighbour,
          netImportMw: flow.netImportMw,
          at: flow.at,
        },
      });
    }
    return { records, entities };
  }

  async function refreshLive({ signal } = {}) {
    liveRequest?.abort();
    const controller = new AbortController();
    liveRequest = controller;
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    const timer = setTimeout(abort, 90_000);
    try {
      const response = await fetch(LIVE_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      live = normaliseLivePayload(await response.json());
      liveError =
        live.configured && !live.load && !live.generation ? live.error : null;
    } catch (error) {
      if (controller.signal.aborted && signal?.aborted) return;
      liveError = error?.message || 'live data unavailable';
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
      if (liveRequest === controller) liveRequest = null;
    }
  }

  const layer = createBaGeoLayer(
    {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: 'OSM · WRI GPPD · ENTSO-E',
      accent: FUEL_COLORS.hydro,
      labelMax: 70,
      labelGridPx: 130,
      osmDerived: true,
      updateInterval: LIVE_REFRESH_MS,
      async loadData(signal) {
        const [plants, grid] = await Promise.all([
          fetchBundledJson(PLANTS_URL, signal),
          fetchBundledJson(GRID_URL, signal),
        ]);
        return { plants, grid };
      },
      build(data, { dataSource }) {
        const records = [];
        counts = { plants: 0, dams: 0, lines: 0, mw: 0 };
        for (const feature of data?.grid?.features || []) {
          const kv = feature?.properties?.kv;
          const coords = feature?.geometry?.coordinates;
          if (
            feature?.geometry?.type !== 'LineString' ||
            !LINE_COLORS[kv] ||
            !Array.isArray(coords) ||
            coords.length < 2 ||
            !coords.every(
              (c) => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]),
            )
          )
            continue;
          counts.lines++;
          dataSource.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
              width: kv === 400 ? 2.6 : 1.7,
              material: Cesium.Color.fromCssColorString(
                LINE_COLORS[kv],
              ).withAlpha(kv === 400 ? 0.9 : 0.75),
              clampToGround: true,
            },
          });
        }
        const rows = (data?.plants?.features || [])
          .map(normalisePowerFeature)
          .filter(Boolean)
          // Small markers first so large plants draw on top.
          .sort((a, b) => (a.mw || 0) - (b.mw || 0));
        for (const record of rows) {
          const isDam = record.kind === 'dam';
          if (isDam) counts.dams++;
          else {
            counts.plants++;
            counts.mw += record.mw || 0;
          }
          const color = Cesium.Color.fromCssColorString(
            isDam ? DAM_COLOR : FUEL_COLORS[record.fuel],
          );
          const entity = dataSource.entities.add({
            id: `ba-power:${record.kind}:${record.id}`,
            position: Cesium.Cartesian3.fromDegrees(record.lon, record.lat),
            point: {
              pixelSize: isDam ? 6 : plantPixelSize(record.mw),
              color: isDam ? color.withAlpha(0.35) : color.withAlpha(0.9),
              outlineColor: isDam
                ? color
                : Cesium.Color.fromCssColorString('#101010'),
              outlineWidth: isDam ? 2 : 1.5,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          records.push({
            id: `${record.kind}-${record.id}`,
            lat: record.lat,
            lon: record.lon,
            entity,
            label:
              record.major || isDam || (record.mw || 0) >= 5
                ? powerLabel(record)
                : null,
            priority: powerPriority(record),
            card: () => powerCard(record),
            properties: {
              name: record.name,
              kind: record.kind,
              fuel: record.fuel,
              mw: record.mw,
              operator: record.operator,
            },
            analyst: {
              id: record.id,
              kind: record.kind,
              name: record.name,
              fuel: record.fuel,
              mw: record.mw,
              operator: record.operator,
              lat: record.lat,
              lon: record.lon,
            },
          });
        }
        return { records };
      },
      async onUpdate(viewer, ctx) {
        await refreshLive(ctx);
        ctx.replaceDynamic?.((dataSource) => drawFlows(dataSource));
        return true;
      },
      onDisabled() {
        liveRequest?.abort();
      },
      extraStats() {
        const summary = liveSummaryLine(live);
        const base = {
          plants: counts.plants,
          dams: counts.dams,
          lines: counts.lines,
          installedMw: Math.round(counts.mw),
          live: live
            ? {
                configured: live.configured,
                load: live.load,
                generation: live.generation,
                flows: live.flows,
                fetchedAt: live.fetchedAt,
                stale: live.stale,
              }
            : null,
        };
        if (live && !live.configured)
          return {
            ...base,
            keyRequired: true,
            status: 'idle',
            statusMessage: summary,
          };
        if (live && summary)
          return {
            ...base,
            status: 'idle',
            statusMessage: summary,
            ...(live.stale ? { stale: true } : {}),
            ...(liveError ? { liveError } : {}),
          };
        return liveError ? { ...base, liveError } : base;
      },
    },
    deps,
  );
  // Registry key id the panel uses to name the missing variable. The
  // registry entry itself is a shared change (see the layer README).
  layer.requiresKeyId = 'entsoe';
  return layer;
}
