import { createInProductionLayer } from './inProduction.js';

/** No public data yet; the toggle keeps the gap visible. */
export function createLayer() {
  return createInProductionLayer('ba-flood-forecast', {
    reason:
      'The Sava FFWS (Delft-FEWS) and EFAS real-time forecasts are restricted to partner agencies.',
    source: 'Sava Commission · restricted',
  });
}
