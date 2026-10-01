import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-power layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-power', { reason: 'not built yet' });
}
