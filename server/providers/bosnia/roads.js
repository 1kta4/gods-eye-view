import { readResponseTextCapped } from '../common/http.js';
import { makeRateLimiter, clientKey } from '../common/rate-limit.js';
import {
  BIHAMK_CONDITIONS_URL,
  BIHAMK_CROSSINGS_URL,
  parseBihamkConditionsPage,
  parseBihamkCrossingsPage,
} from '../../../src/layers/bosnia/borderCrossings/bihamk.js';

/**
 * BIHAMK border-crossing waits and the national road-conditions report.
 *
 * GET /api/ba/border-crossings → parsed, plain-text JSON. Two fixed official
 * pages, fetched together at most once per CACHE_MS and shared by every
 * caller; on failure the last good report is served (marked stale) for up to
 * STALE_MS. No client input reaches an upstream URL.
 */
const CACHE_MS = 10 * 60_000;
const RETRY_MS = 60_000;
const STALE_MS = 6 * 3600_000;
const TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'GodsEyeView-BiH/0.1 (personal local use)';
const ATTRIBUTION =
  'BIHAMK — Bosanskohercegovački auto-moto klub (bihamk.ba), Stanje na cestama';

/** One upstream page as capped text; throws on HTTP or size failures. */
async function fetchPage(fetchImpl, url, signal) {
  const response = await fetchImpl(url, {
    signal,
    redirect: 'error',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'bs,hr;q=0.9,sr;q=0.8,en;q=0.5',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`bihamk_http_${response.status}`);
  }
  return readResponseTextCapped(response, MAX_PAGE_BYTES, signal);
}

/** Factory with injectable fetch/clock for tests. */
export function borderCrossingsProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cache = null;
  let inflight = null;
  let attemptedAt = -Infinity;
  const allow = makeRateLimiter({ windowMs: 60_000, max: 30, globalMax: 600 });

  async function refresh() {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const [crossingsResult, conditionsResult] = await Promise.allSettled([
      fetchPage(fetchImpl, BIHAMK_CROSSINGS_URL, signal),
      fetchPage(fetchImpl, BIHAMK_CONDITIONS_URL, signal),
    ]);
    const crossings =
      crossingsResult.status === 'fulfilled'
        ? parseBihamkCrossingsPage(crossingsResult.value)
        : null;
    const conditions =
      conditionsResult.status === 'fulfilled'
        ? parseBihamkConditionsPage(conditionsResult.value)
        : null;
    if (!crossings?.crossings.length) {
      // Keep the previous good crossing list rather than blanking it.
      throw new Error(
        crossingsResult.status === 'rejected'
          ? crossingsResult.reason?.message || 'bihamk_unavailable'
          : 'bihamk_unparseable',
      );
    }
    cache = {
      fetchedAt: now(),
      crossings,
      conditions:
        conditions && conditions.paragraphs.length
          ? conditions
          : (cache?.conditions ?? null),
    };
    return cache;
  }

  async function acquire() {
    if (cache && now() - cache.fetchedAt < CACHE_MS) return cache;
    if (inflight) return inflight;
    if (now() - attemptedAt < RETRY_MS) throw new Error('bihamk_retry_later');
    attemptedAt = now();
    inflight = refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function describe(value, reason = null) {
    const stale = Boolean(reason);
    return {
      schemaVersion: 1,
      source: 'BIHAMK',
      attribution: ATTRIBUTION,
      sourceUrl: BIHAMK_CROSSINGS_URL,
      conditionsUrl: BIHAMK_CONDITIONS_URL,
      fetchedAt: value ? new Date(value.fetchedAt).toISOString() : null,
      stale,
      unavailable: !value,
      reason,
      updatedAt: value?.crossings.updatedAt ?? null,
      crossings: value?.crossings.crossings ?? [],
      conditions: value?.conditions ?? null,
    };
  }

  async function handler(req, res) {
    const json = (status, body) => {
      if (res.writableEnded) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = String(req.url || '').split('?')[0];
    if (path !== '/' && path !== '') return json(404, { error: 'not_found' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      json(200, describe(await acquire()));
    } catch (error) {
      const usable = cache && now() - cache.fetchedAt <= STALE_MS;
      console.warn(
        '[BiH:Roads] BIHAMK refresh failed:',
        error?.message || error,
      );
      json(
        200,
        describe(
          usable ? cache : null,
          usable
            ? 'Cached BIHAMK report; upstream unavailable'
            : 'BIHAMK report unavailable',
        ),
      );
    }
  }

  return {
    name: 'ba-border-crossings',
    configureServer({ middlewares }) {
      middlewares.use('/api/ba/border-crossings', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/ba/border-crossings', handler);
    },
    /** Exposed for unit tests. */
    _handler: handler,
  };
}

/** Vite middleware plugins for the Bosnia roads layers. */
export function plugins() {
  return [borderCrossingsProxy()];
}
