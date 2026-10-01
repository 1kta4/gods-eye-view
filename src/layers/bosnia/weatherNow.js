import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-weather-now layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-weather-now', { reason: 'not built yet' });
}
