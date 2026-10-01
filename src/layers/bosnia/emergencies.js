import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-emergencies layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-emergencies', { reason: 'not built yet' });
}
