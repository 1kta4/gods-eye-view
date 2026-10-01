import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-earthquakes layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-earthquakes', { reason: 'not built yet' });
}
