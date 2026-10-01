import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-radar layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-radar', { reason: 'not built yet' });
}
