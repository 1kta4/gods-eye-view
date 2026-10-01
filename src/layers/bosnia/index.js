import { createLayer as earthquakes } from './earthquakes.js';
import { createLayer as rivers } from './rivers.js';
import { createLayer as airQuality } from './airQuality.js';
import { createLayer as fireDanger } from './fireDanger.js';
import { createLayer as weatherWarnings } from './weatherWarnings.js';
import { createLayer as weatherNow } from './weatherNow.js';
import { createLayer as radar } from './radar.js';
import { createLayer as borderCrossings } from './borderCrossings.js';
import { createLayer as power } from './power.js';
import { createLayer as boundaries } from './boundaries.js';
import { createLayer as emergencies } from './emergencies.js';
import { createLayer as heritage } from './heritage.js';
import { createLayer as memorial } from './memorial.js';
import { createLayer as minefields } from './minefields.js';
import { createLayer as airports } from './airports.js';
import { createLayer as rail } from './rail.js';
import { createLayer as minesOfficial } from './minesOfficial.js';
import { createLayer as transit } from './transit.js';
import { createLayer as floodForecast } from './floodForecast.js';
import { createLayer as lightning } from './lightning.js';
import { BOSNIA_LAYER_IDS } from './manifest.js';
export { BOSNIA_LAYERS, BOSNIA_LAYER_IDS } from './manifest.js';

const FACTORIES = [
  earthquakes,
  rivers,
  airQuality,
  fireDanger,
  weatherWarnings,
  weatherNow,
  radar,
  borderCrossings,
  power,
  boundaries,
  emergencies,
  heritage,
  memorial,
  minefields,
  airports,
  rail,
  minesOfficial,
  transit,
  floodForecast,
  lightning,
];

/**
 * Construct every Bosnia and Herzegovina layer in manifest order.
 * @param {object} deps Application services ({ surface, overlayHost, ... }).
 * @returns {object[]}
 */
export function createBosniaLayers(deps = {}) {
  const layers = FACTORIES.map((create) => create(deps));
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  return BOSNIA_LAYER_IDS.map((id) => {
    const layer = byId.get(id);
    if (!layer) throw new Error(`Bosnia layer missing: ${id}`);
    return layer;
  });
}
