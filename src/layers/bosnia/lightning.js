import { createInProductionLayer } from './inProduction.js';

/** No public data yet; the toggle keeps the gap visible. */
export function createLayer() {
  return createInProductionLayer('ba-lightning', {
    reason:
      'No openly licensed live lightning feed covers BiH (Blitzortung forbids redistribution; NOAA density stops at 0°).',
    source: 'no open feed',
  });
}
