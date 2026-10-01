import { createInProductionLayer } from './inProduction.js';

/** No public data yet; the toggle keeps the gap visible. */
export function createLayer() {
  return createInProductionLayer('ba-mines-official', {
    reason:
      'BHMAC does not publish its suspected hazardous area polygons (BHIMSMA is closed); EUFOR minefield sheets are PDF only. Ask BHMAC / EUFOR for a data agreement.',
    source: 'BHMAC · not public',
  });
}
