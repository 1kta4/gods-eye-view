import {
  readResponseBytesCapped,
  coalesceProxyRequest,
} from '../common/http.js';
import { makeRateLimiter, clientKey } from '../common/rate-limit.js';
import { BA_USER_AGENT, decodeMixedHtml } from './earthquakes.js';
import {
  VODA_URLS,
  FHMZ_HYDRO_URL,
  RHMZ_HYDRO_URL,
  normalizeVodaStations,
  parseFhmzHydro,
  normalizeRhmzStations,
  trendFromSeries,
  vodaWeekUrl,
} from '../../../src/layers/bosnia/rivers/records.js';

const SNAPSHOT_TTL_MS = 10 * 60_000;
const TREND_TTL_MS = 10 * 60_000;
const MAX_TRENDS = 256;
const MIB = 1024 * 1024;

/** Strip a UTF-8 BOM before JSON.parse (WISKI and RHMZ both emit one). */
function parseJsonText(bytes) {
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

/**
 * River gauges for BiH from three agencies, merged and cached (~10 min):
 *   GET /api/ba/rivers                          → { fetchedAt, sources, stations }
 *   GET /api/ba/rivers/trend?site=4&station=4024 → voda.ba 7-day trend
 */
export function baRiversProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  const inFlight = new Map();
  let snapshotCache = null;
  const trends = new Map();
  const allow = makeRateLimiter({
    windowMs: 60_000,
    max: 120,
    globalMax: 1200,
  });

  async function get(url, cap, timeout = 20_000) {
    const signal = AbortSignal.timeout(timeout);
    const response = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: { 'User-Agent': BA_USER_AGENT, Accept: '*/*' },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`upstream_http_${response.status}`);
    }
    return readResponseBytesCapped(response, cap, signal);
  }

  async function loadVoda() {
    const [level, flow] = await Promise.all([
      get(VODA_URLS.level, 4 * MIB).then(parseJsonText),
      get(VODA_URLS.flow, 4 * MIB)
        .then(parseJsonText)
        .catch(() => []),
    ]);
    const rows = normalizeVodaStations(level, flow);
    if (!rows) throw new Error('invalid_voda_payload');
    return rows;
  }
  async function loadFhmz() {
    return parseFhmzHydro(decodeMixedHtml(await get(FHMZ_HYDRO_URL, 2 * MIB)));
  }
  async function loadRhmz() {
    const rows = normalizeRhmzStations(
      parseJsonText(await get(RHMZ_HYDRO_URL, 2 * MIB)),
    );
    if (!rows) throw new Error('invalid_rhmz_payload');
    return rows;
  }

  async function loadSnapshot() {
    const previous = snapshotCache?.value;
    const results = await Promise.allSettled([
      loadVoda(),
      loadFhmz(),
      loadRhmz(),
    ]);
    const names = ['voda', 'fhmz', 'rhmz'];
    const sources = {};
    const stations = [];
    results.forEach((result, i) => {
      const name = names[i];
      if (result.status === 'fulfilled' && result.value.length) {
        sources[name] = { ok: true, count: result.value.length };
        stations.push(...result.value);
      } else {
        // Keep the last good rows for a failed source rather than dropping it.
        const kept =
          previous?.stations.filter((s) => s.id.startsWith(`${name}:`)) || [];
        sources[name] = {
          ok: false,
          count: kept.length,
          stale: kept.length > 0,
        };
        stations.push(...kept);
      }
    });
    if (!stations.length) throw new Error('no_river_data');
    return { fetchedAt: now(), sources, stations };
  }

  async function snapshot() {
    if (snapshotCache && now() - snapshotCache.savedAt < SNAPSHOT_TTL_MS)
      return snapshotCache.value;
    try {
      const { promise } = coalesceProxyRequest(
        inFlight,
        'snapshot',
        loadSnapshot,
      );
      const value = await promise;
      if (!snapshotCache || snapshotCache.value !== value)
        snapshotCache = { savedAt: now(), value };
      return value;
    } catch (error) {
      if (snapshotCache) return { ...snapshotCache.value, stale: true };
      throw error;
    }
  }

  async function trend(site, station) {
    const key = `${site}/${station}`;
    const hit = trends.get(key);
    if (hit && now() - hit.savedAt < TREND_TTL_MS) return hit.value;
    const url = vodaWeekUrl(site, station);
    if (!url) throw Object.assign(new Error('bad_station'), { status: 400 });
    if (!inFlight.has(`trend:${key}`) && inFlight.size >= 32)
      throw Object.assign(new Error('busy'), { status: 429 });
    const { promise } = coalesceProxyRequest(
      inFlight,
      `trend:${key}`,
      async () => {
        const series = parseJsonText(await get(url, 2 * MIB, 15_000));
        return trendFromSeries(series);
      },
    );
    const value = await promise;
    trends.delete(key);
    trends.set(key, { savedAt: now(), value });
    if (trends.size > MAX_TRENDS) trends.delete(trends.keys().next().value);
    return value;
  }

  async function handler(req, res) {
    const json = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
        ...(value?.stale ? { 'X-Data-Stale': 'true' } : {}),
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const [path, query = ''] = (req.url || '/').split('?');
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      if (path === '/' || path === '') return json(200, await snapshot());
      if (path === '/trend') {
        const params = new URLSearchParams(query);
        const site = params.get('site') || '';
        const station = params.get('station') || '';
        if (!/^\d{1,6}$/.test(site) || !/^\d{1,6}$/.test(station))
          return json(400, { error: 'invalid_station' });
        return json(200, { site, station, trend: await trend(site, station) });
      }
      return json(404, { error: 'unknown_route' });
    } catch (error) {
      json(error.status === 400 || error.status === 429 ? error.status : 502, {
        error: 'rivers_unavailable',
      });
    }
  }

  return {
    name: 'ba-rivers',
    configureServer({ middlewares }) {
      middlewares.use('/api/ba/rivers', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/ba/rivers', handler);
    },
  };
}

/** Vite middleware plugins for the Bosnia rivers layer. */
export function plugins() {
  return [baRiversProxy()];
}
