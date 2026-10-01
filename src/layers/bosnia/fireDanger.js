import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-fire-danger layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-fire-danger', { reason: 'not built yet' });
}
