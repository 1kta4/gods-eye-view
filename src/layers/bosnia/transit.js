import { createInProductionLayer } from './inProduction.js';

/** No public data yet; the toggle keeps the gap visible. */
export function createLayer() {
  return createInProductionLayer('ba-transit', {
    reason:
      'GRAS Sarajevo publishes no GTFS or live vehicle feed. Needs a GTFS / GTFS-RT agreement with GRAS.',
    source: 'GRAS · no feed',
  });
}
