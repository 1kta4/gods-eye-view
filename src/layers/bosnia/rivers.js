import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-rivers layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-rivers', { reason: 'not built yet' });
}
