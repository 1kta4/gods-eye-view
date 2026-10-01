import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-minefields layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-minefields', { reason: 'not built yet' });
}
