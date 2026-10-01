import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-air-quality layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-air-quality', { reason: 'not built yet' });
}
