import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-boundaries layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-boundaries', { reason: 'not built yet' });
}
