/**
 * Bosnia and Herzegovina weather proxies (fixed upstreams, no user URLs):
 *   GET /api/ba/weather/now       Open-Meteo current conditions, 28 towns (15 min cache)
 *   GET /api/ba/weather/warnings  Meteoalarm Atom feed, parsed (10 min cache)
 * Also exports the small cached-upstream helpers the air proxy reuses.
 */
import { readResponseTextCapped } from '../common/http.js';
import { clientKey, makeRateLimiter } from '../common/rate-limit.js';
import {
  BA_TOWNS,
  normaliseOpenMeteo,
  openMeteoAirUrl,
  openMeteoForecastUrl,
} from '../../../src/layers/bosnia/weatherNow/model.js';
import { parseMeteoalarmAtom } from '../../../src/layers/bosnia/weatherWarnings/model.js';

export const BA_USER_AGENT = 'GodsEyeView-BiH/0.1 (personal local use)';
const MINUTE = 60_000;

/**
 * Fetch one fixed upstream as text with a byte cap, timeout and no redirects.
 * @returns {Promise<string>}
 */
export async function fetchUpstreamText(
  url,
  { fetchImpl = fetch, maxBytes, timeoutMs = 15_000, accept = '*/*' } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('upstream_timeout')),
    timeoutMs,
  );
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: accept, 'User-Agent': BA_USER_AGENT },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`upstream_http_${response.status}`);
    }
    return await readResponseTextCapped(response, maxBytes, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One cached, coalesced upstream: fresh for `ttlMs`, failures are retried no
 * sooner than `retryMs`, and the last good value is served (marked stale) for
 * up to `maxStaleMs` while the upstream is down.
 */
export function createCachedSource({
  load,
  ttlMs,
  retryMs = MINUTE,
  maxStaleMs = 6 * 60 * MINUTE,
  now = () => Date.now(),
}) {
  let value = null;
  let fetchedAt = 0;
  let error = null;
  let failedAt = -Infinity;
  let inflight = null;
  async function get() {
    const t = now();
    const fresh = value !== null && t - fetchedAt < ttlMs;
    if (!fresh && !inflight && t - failedAt >= retryMs) {
      inflight = (async () => {
        try {
          value = await load();
          fetchedAt = now();
          error = null;
        } catch (e) {
          failedAt = now();
          error = String(e?.message || e).slice(0, 120);
        } finally {
          inflight = null;
        }
      })();
    }
    if (inflight) await inflight;
    const usable = value !== null && now() - fetchedAt <= maxStaleMs;
    return {
      value: usable ? value : null,
      fetchedAt: usable ? fetchedAt : null,
      stale: usable && now() - fetchedAt >= ttlMs,
      error,
    };
  }
  return { get };
}

/** JSON route helper with method/URL validation and a per-client rate limit. */
export function jsonRoute(path, produce, { perMinute = 60 } = {}) {
  const allow = makeRateLimiter({
    windowMs: MINUTE,
    max: perMinute,
    globalMax: perMinute * 10,
  });
  async function handler(req, res) {
    const send = (status, body) => {
      if (res.writableEnded) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(status === 429 ? { 'Retry-After': '10' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });
    const rest = String(req.url || '').split('?')[0];
    if (rest !== '/' && rest !== '') return send(404, { error: 'not_found' });
    if (!allow(clientKey(req))) return send(429, { error: 'rate_limited' });
    try {
      send(200, await produce());
    } catch (error) {
      send(502, { error: String(error?.message || 'upstream_failed') });
    }
  }
  return {
    name: `ba-${path.replace(/[^a-z0-9]+/gi, '-')}`,
    configureServer({ middlewares }) {
      middlewares.use(path, handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use(path, handler);
    },
  };
}

const METEOALARM_URL =
  'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-bosnia-herzegovina';

/** Build the weather plugins; `fetchImpl` is a test seam. */
export function createWeatherProxies({ fetchImpl = fetch } = {}) {
  const forecast = createCachedSource({
    ttlMs: 15 * MINUTE,
    maxStaleMs: 3 * 60 * MINUTE,
    load: async () => {
      const [weatherText, airText] = await Promise.all([
        fetchUpstreamText(openMeteoForecastUrl(BA_TOWNS), {
          fetchImpl,
          maxBytes: 512 * 1024,
          accept: 'application/json',
        }),
        // The CAMS air numbers are a garnish; a failure must not hide weather.
        fetchUpstreamText(openMeteoAirUrl(BA_TOWNS), {
          fetchImpl,
          maxBytes: 256 * 1024,
          accept: 'application/json',
        }).catch(() => null),
      ]);
      let air = null;
      try {
        air = airText ? JSON.parse(airText) : null;
      } catch {
        air = null;
      }
      return normaliseOpenMeteo(JSON.parse(weatherText), air, BA_TOWNS);
    },
  });
  const warnings = createCachedSource({
    ttlMs: 10 * MINUTE,
    maxStaleMs: 6 * 60 * MINUTE,
    load: async () =>
      parseMeteoalarmAtom(
        await fetchUpstreamText(METEOALARM_URL, {
          fetchImpl,
          maxBytes: 2 * 1024 * 1024,
          // Meteoalarm answers 406 without a wildcard in Accept.
          accept: 'application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        }),
      ),
  });
  return [
    jsonRoute('/api/ba/weather/now', async () => {
      const result = await forecast.get();
      return {
        schemaVersion: 1,
        source: 'Open-Meteo',
        attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        error: result.value ? null : result.error || 'unavailable',
        towns: result.value || [],
      };
    }),
    jsonRoute('/api/ba/weather/warnings', async () => {
      const result = await warnings.get();
      // Drop warnings that expired since the cached fetch.
      const t = Date.now();
      const list = (result.value?.warnings || []).filter(
        (w) => !w.expires || Date.parse(w.expires) >= t,
      );
      return {
        schemaVersion: 1,
        source: 'Meteoalarm',
        attribution: 'MeteoAlarm.org (EUMETNET), CC BY 4.0',
        fetchedAt: result.fetchedAt,
        feedUpdated: result.value?.updated ?? null,
        stale: result.stale,
        error: result.value ? null : result.error || 'unavailable',
        warnings: list,
      };
    }),
  ];
}

/** Vite middleware plugins for the Bosnia weather layers. */
export function plugins() {
  return createWeatherProxies();
}
