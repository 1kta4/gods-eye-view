import { bosniaLayerRow } from './manifest.js';

/**
 * A toggle for a Bosnia layer whose data is not publicly available yet.
 * Turning it on draws nothing; the row reports IN PRODUCTION with the reason
 * and where the data would come from, so the gap stays visible.
 * @param {string} id Manifest layer id.
 * @param {object} details
 * @param {string} details.reason Why there is no data yet.
 * @param {string} [details.source] Who owns the data.
 */
export function createInProductionLayer(
  id,
  { reason, source = 'IN PRODUCTION' },
) {
  const row = bosniaLayerRow(id);
  const message = `IN PRODUCTION — ${reason}`;
  return {
    id: row.id,
    name: `${row.name} (in production)`,
    icon: row.icon,
    source,
    updateInterval: 0,
    inProduction: true,
    init() {},
    enable() {
      console.info(`[Data:Bosnia] ${row.name}: ${message}`);
    },
    disable() {},
    update() {
      return false;
    },
    destroy() {},
    getStats() {
      return { count: 0, status: 'unavailable', error: message };
    },
  };
}
