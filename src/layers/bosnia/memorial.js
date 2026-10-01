import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-memorial layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-memorial', { reason: 'not built yet' });
}
