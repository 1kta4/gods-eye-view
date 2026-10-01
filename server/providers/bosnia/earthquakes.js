import {
  readResponseBytesCapped,
  readResponseJsonCapped,
  coalesceProxyRequest,
} from '../common/http.js';
import { makeRateLimiter, clientKey } from '../common/rate-limit.js';
import {
  emscQueryUrl,
  normalizeEmscEvents,
  parseFhmzQuakes,
  mergeFhmzIntensity,
  filterQuakeWindow,
} from '../../../src/layers/bosnia/earthquakes/records.js';

export const BA_USER_AGENT = 'GodsEyeView-BiH/0.1 (personal local use)';
const FHMZ_QUAKES_URL = 'https://fhmzbih.gov.ba/latinica/SEIZMO/potresi.php';
const EMSC_TTL_MS = 120_000;
const FHMZ_TTL_MS = 30 * 60_000;
const MIB = 1024 * 1024;

/**
 * Decode an HTML page that mixes UTF-8 and Windows-1250 bytes (FHMZ serves
 * both): valid UTF-8 wins, otherwise fall back to Windows-1250 per run.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeMixedHtml(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    /* mixed page — decode line by line */
  }
  let cp1250;
  try {
    cp1250 = new TextDecoder('windows-1250');
  } catch {
    cp1250 = new TextDecoder('latin1');
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const out = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length && bytes[i] !== 0x0a) continue;
    const line = bytes.subarray(start, Math.min(i + 1, bytes.length));
    try {
      out.push(utf8.decode(line));
    } catch {
      out.push(cp1250.decode(line));
    }
    start = i + 1;
  }
  return out.join('');
}

/** EMSC + FHMZ earthquakes for BiH, merged and cached (~2 min). */
export function baEarthquakesProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  const inFlight = new Map();
  let emscCache = null; // { savedAt, value }
  let fhmzCache = null;
  const allow = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 600 });

  async function get(url, timeout) {
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
    return { response, signal };
  }

  async function loadEmsc() {
    const { response, signal } = await get(emscQueryUrl(now()), 20_000);
    // FDSN answers 204 No Content when the window is empty.
    if (response.status === 204) return [];
    const rows = normalizeEmscEvents(
      await readResponseJsonCapped(response, 4 * MIB, signal),
    );
    if (!rows) throw new Error('invalid_emsc_payload');
    return rows;
  }

  async function loadFhmz() {
    const { response, signal } = await get(FHMZ_QUAKES_URL, 15_000);
    const bytes = await readResponseBytesCapped(response, 2 * MIB, signal);
    return parseFhmzQuakes(decodeMixedHtml(bytes));
  }

  async function cached(key, ttl, holder, load) {
    const previous = holder();
    if (previous && now() - previous.savedAt < ttl)
      return { value: previous.value, stale: false, ok: true };
    try {
      const { promise } = coalesceProxyRequest(inFlight, key, load);
      const value = await promise;
      return { value, stale: false, ok: true, fresh: true };
    } catch (error) {
      if (previous) return { value: previous.value, stale: true, ok: false };
      throw error;
    }
  }

  async function snapshot() {
    const emsc = await cached('emsc', EMSC_TTL_MS, () => emscCache, loadEmsc);
    if (emsc.fresh) emscCache = { savedAt: now(), value: emsc.value };
    let fhmz = { value: [], ok: false, stale: false };
    try {
      fhmz = await cached('fhmz', FHMZ_TTL_MS, () => fhmzCache, loadFhmz);
      if (fhmz.fresh) fhmzCache = { savedAt: now(), value: fhmz.value };
    } catch {
      /* optional enrichment */
    }
    const events = filterQuakeWindow(
      mergeFhmzIntensity(emsc.value, fhmz.value, { nowMs: now() }),
      now(),
    );
    return {
      fetchedAt: emscCache?.savedAt ?? now(),
      stale: emsc.stale,
      sources: { emsc: emsc.ok, fhmz: fhmz.ok },
      events,
    };
  }

  async function handler(req, res) {
    const json = (status, value, stale = false) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
        ...(stale ? { 'X-Data-Stale': 'true' } : {}),
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = (req.url || '/').split('?')[0];
    if (path !== '/' && path !== '')
      return json(404, { error: 'unknown_route' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    try {
      const value = await snapshot();
      json(200, value, value.stale);
    } catch {
      json(502, { error: 'earthquakes_unavailable' });
    }
  }

  return {
    name: 'ba-earthquakes',
    configureServer({ middlewares }) {
      middlewares.use('/api/ba/earthquakes', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/ba/earthquakes', handler);
    },
  };
}

/** Vite middleware plugins for the Bosnia earthquakes layer. */
export function plugins() {
  return [baEarthquakesProxy()];
}
