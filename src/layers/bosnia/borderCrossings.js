import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-border-crossings layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-border-crossings', {
    reason: 'not built yet',
  });
}
