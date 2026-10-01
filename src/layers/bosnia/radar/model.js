/**
 * RainViewer public weather-maps manifest → validated radar frames.
 * https://api.rainviewer.com/public/weather-maps.json (free for personal /
 * educational use, attribution link to rainviewer.com required, max zoom 7).
 * Coverage over BiH comes from the neighbouring national radars (checked
 * 2026-10-01 against RainViewer's coverage tiles: BiH is inside coverage).
 */

export const RAINVIEWER_MANIFEST_URL =
  'https://api.rainviewer.com/public/weather-maps.json';
export const RAINVIEWER_HOST = 'https://tilecache.rainviewer.com';
export const RAINVIEWER_MAX_LEVEL = 7;
/** Colour scheme 2 ("Universal Blue"), smoothed, snow shown separately. */
export const RAINVIEWER_STYLE = '2/1_1';

/**
 * @param {object} payload Manifest JSON.
 * @param {number} [now] Reject frames from the future or older than 6 h.
 * @returns {{frames:{time:number, path:string}[], latest:{time:number,path:string}|null}}
 */
export function parseRainViewerManifest(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object')
    throw new Error('rainviewer_invalid');
  if (payload.host !== RAINVIEWER_HOST) throw new Error('rainviewer_host');
  const past = Array.isArray(payload.radar?.past) ? payload.radar.past : [];
  const frames = [];
  for (const frame of past.slice(-48)) {
    const time = Number(frame?.time);
    const path = String(frame?.path || '');
    if (
      !Number.isInteger(time) ||
      !/^\/v2\/radar\/[A-Za-z0-9]{4,64}$/.test(path)
    )
      continue;
    const ms = time * 1000;
    if (ms > now + 10 * 60_000 || now - ms > 6 * 3600_000) continue;
    frames.push({ time, path });
  }
  frames.sort((a, b) => a.time - b.time);
  return { frames, latest: frames.at(-1) || null };
}

/** Tile URL template for one frame (Cesium {z}/{x}/{y} placeholders). */
export function radarTileTemplate(frame) {
  return `${RAINVIEWER_HOST}${frame.path}/256/{z}/{x}/{y}/${RAINVIEWER_STYLE}.png`;
}
