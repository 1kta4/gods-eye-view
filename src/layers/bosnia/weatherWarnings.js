import { createInProductionLayer } from './inProduction.js';

/** Placeholder until the ba-weather-warnings layer is built. */
export function createLayer() {
  return createInProductionLayer('ba-weather-warnings', {
    reason: 'not built yet',
  });
}
