/**
 * Live ENTSO-E summary for the Bosnia and Herzegovina power layer.
 *
 * GET /api/ba/power/live → JSON (never the raw XML, never the token).
 *
 * Optional: only active when process.env.ENTSOE_API_TOKEN is set (free
 * registration on transparency.entsoe.eu). Without it the route answers
 * `{ configured:false, keyRequired:true }` so the layer can say what is
 * missing while its bundled plants/grid still draw.
 *
 * One refresh = 8 small XML documents (load, generation per type, physical
 * flows both ways with HR/RS/ME). Results are cached for 20 minutes; a
 * failed refresh serves the previous summary for up to 3 hours marked stale.
 */
import { readResponseTextCapped } from '../common/http.js';
import { clientKey, makeRateLimiter } from '../common/rate-limit.js';
import {
  NEIGHBOURS,
  buildEntsoeRequests,
  entsoeUrl,
  parseEntsoeXml,
  redactToken,
  summariseFlow,
  summariseGeneration,
  summariseLoad,
} from '../../../src/layers/bosnia/power/entsoe.js';

const ROUTE = '/api/ba/power/live';
const USER_AGENT = 'GodsEyeView-BiH/0.1 (personal local use)';
const CACHE_MS = 20 * 60_000;
const STALE_MAX_MS = 3 * 3_600_000;
const RETRY_AFTER_FAILURE_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Fetch one ENTSO-E document and parse it. An acknowledgement ("no data")
 * resolves to a parsed `ack`, which summarises to null rather than failing
 * the whole refresh.
 * @param {string} url
 * @param {AbortSignal} signal
 * @param {typeof fetch} fetchImpl
 */
async function fetchDocument(url, signal, fetchImpl) {
  const response = await fetchImpl(url, {
    signal,
    redirect: 'error',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' },
  });
  const type = String(response.headers.get('content-type') || '');
  if (/zip/i.test(type)) {
    await response.body?.cancel().catch(() => {});
    throw new Error('entsoe_unexpected_zip');
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => {});
    throw Object.assign(new Error('entsoe_token_rejected'), { fatal: true });
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    throw new Error('entsoe_rate_limited');
  }
  const text = await readResponseTextCapped(response, MAX_BYTES, signal);
  // ENTSO-E answers "no matching data" with HTTP 400 + an acknowledgement.
  if (!response.ok && !/Acknowledgement_MarketDocument/.test(text))
    throw new Error(`entsoe_http_${response.status}`);
  return parseEntsoeXml(text);
}

/**
 * Run one refresh against ENTSO-E and build the browser summary.
 * @param {object} options
 * @param {string} options.token
 * @param {number} options.now
 * @param {AbortSignal} options.signal
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function refreshEntsoeSummary({
  token,
  now,
  signal,
  fetchImpl = fetch,
}) {
  const requests = buildEntsoeRequests(now);
  const results = new Map();
  const failures = [];
  // Sequential: eight tiny requests, far below ENTSO-E's 400/min allowance,
  // and a rejected token stops the run after the first call.
  for (const request of requests) {
    signal.throwIfAborted();
    try {
      results.set(
        request.key,
        await fetchDocument(
          entsoeUrl(request.params, token),
          signal,
          fetchImpl,
        ),
      );
    } catch (error) {
      if (error?.fatal) throw error;
      if (signal.aborted) throw error;
      failures.push(`${request.key}: ${redactToken(error?.message, token)}`);
    }
  }
  if (results.size === 0) throw new Error('entsoe_unavailable');
  return {
    load: summariseLoad(results.get('load')),
    generation: summariseGeneration(results.get('generation')),
    flows: NEIGHBOURS.map((n) =>
      summariseFlow(
        n,
        results.get(`import:${n.code}`) || null,
        results.get(`export:${n.code}`) || null,
      ),
    ),
    partial: failures.length > 0,
    failures: failures.slice(0, 8),
  };
}

/**
 * @param {object} [options]
 * @param {() => string|undefined} [options.readToken]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 */
export function createPowerLiveHandler({
  readToken = () => process.env.ENTSOE_API_TOKEN,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  let cache = null; // { summary, fetchedAt }
  let lastError = null;
  let attemptedAt = -Infinity;
  let inFlight = null;
  const allow = makeRateLimiter({ windowMs: 60_000, max: 30, globalMax: 120 });

  async function acquire() {
    const token = String(readToken() || '').trim();
    if (!token) return { configured: false };
    if (cache && now() - cache.fetchedAt < CACHE_MS)
      return { configured: true };
    if (now() - attemptedAt < RETRY_AFTER_FAILURE_MS && !inFlight)
      return { configured: true };
    if (!inFlight) {
      attemptedAt = now();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS * 3,
      );
      inFlight = refreshEntsoeSummary({
        token,
        now: now(),
        signal: controller.signal,
        fetchImpl,
      })
        .then((summary) => {
          cache = { summary, fetchedAt: now() };
          lastError = null;
        })
        .catch((error) => {
          lastError = redactToken(
            error?.name === 'AbortError'
              ? 'entsoe_timeout'
              : error?.message || 'entsoe_unavailable',
            token,
          );
          console.warn(`[ba-power] ENTSO-E refresh failed: ${lastError}`);
        })
        .finally(() => {
          clearTimeout(timer);
          inFlight = null;
        });
    }
    await inFlight;
    return { configured: true };
  }

  function describe(configured) {
    if (!configured) {
      return {
        schemaVersion: 1,
        source: 'ENTSO-E Transparency Platform',
        configured: false,
        keyRequired: true,
        error: null,
        fetchedAt: null,
        load: null,
        generation: null,
        flows: [],
      };
    }
    const fresh = cache && now() - cache.fetchedAt < CACHE_MS;
    const usable = cache && now() - cache.fetchedAt <= STALE_MAX_MS;
    const summary = usable ? cache.summary : null;
    return {
      schemaVersion: 1,
      source: 'ENTSO-E Transparency Platform',
      configured: true,
      keyRequired: false,
      stale: Boolean(usable && !fresh),
      partial: Boolean(summary?.partial),
      error: fresh ? null : lastError,
      fetchedAt: usable ? new Date(cache.fetchedAt).toISOString() : null,
      load: summary?.load ?? null,
      generation: summary?.generation ?? null,
      flows: summary?.flows ?? [],
    };
  }

  return async function handler(req, res) {
    const json = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = String(req.url || '').split('?')[0];
    if (path !== '/' && path !== '')
      return json(404, { error: 'unknown_route' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      const { configured } = await acquire();
      json(200, describe(configured));
    } catch {
      json(200, describe(true));
    }
  };
}

/** Vite middleware plugins for the Bosnia power layer. */
export function plugins() {
  const handler = createPowerLiveHandler();
  return [
    {
      name: 'ba-power-live',
      configureServer({ middlewares }) {
        middlewares.use(ROUTE, handler);
      },
      configurePreviewServer({ middlewares }) {
        middlewares.use(ROUTE, handler);
      },
    },
  ];
}
