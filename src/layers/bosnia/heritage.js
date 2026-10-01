import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-heritage layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-heritage', { reason: 'not built yet' });
}
