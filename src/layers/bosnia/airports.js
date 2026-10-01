import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-airports layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-airports', { reason: 'not built yet' });
}
