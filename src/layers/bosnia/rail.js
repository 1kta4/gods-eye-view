import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-rail layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-rail', { reason: 'not built yet' });
}
