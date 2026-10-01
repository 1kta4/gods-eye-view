/**
 * Refuse /api requests that did not come from this app's own page.
 *
 * Provider middleware is mounted before Vite's Host allowlist runs, so without
 * this guard a page served from a rebinding domain (Host: attacker.example)
 * could read every proxy response, and any open tab could fire simple
 * cross-site requests that spend the configured provider keys.
 *
 * Rules, in order:
 *  1. Host must be a loopback name unless the server was started for the LAN
 *     (HOST=0.0.0.0 or ::), where the operator has accepted that exposure.
 *  2. Sec-Fetch-Site, when the browser sends it, must be same-origin or none.
 *  3. Origin, when present, must be exactly this request's own origin.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Hostname part of a Host header, lowercased; '' when malformed. */
export function hostHeaderName(hostHeader) {
  const raw = String(hostHeader || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end > 0 ? raw.slice(0, end + 1) : '';
  }
  return raw.split(':')[0];
}

/**
 * Decide whether an /api request may proceed.
 * @param {object} headers Lowercased Node request headers.
 * @param {object} [options]
 * @param {boolean} [options.lanMode] Server bound to every interface.
 * @returns {string|null} Refusal reason, or null when allowed.
 */
export function apiRequestRefusal(headers = {}, { lanMode = false } = {}) {
  const host = String(headers.host || '').trim();
  const hostname = hostHeaderName(host);
  if (!hostname) return 'missing_host';
  if (!lanMode && !LOOPBACK_HOSTNAMES.has(hostname)) return 'foreign_host';

  const fetchSite = String(headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')
    return 'cross_site';

  const origin = headers.origin;
  if (origin !== undefined) {
    const value = String(origin).trim().toLowerCase();
    if (
      value !== `http://${host.toLowerCase()}` &&
      value !== `https://${host.toLowerCase()}`
    )
      return 'foreign_origin';
  }
  return null;
}

/** True when the dev/preview server listens on every interface. */
export function isLanMode(host = process.env.HOST) {
  return host === '0.0.0.0' || host === '::';
}

/** Vite plugin that installs the guard ahead of every provider route. */
export function apiRequestGuard({ lanMode = isLanMode() } = {}) {
  function install(middlewares) {
    middlewares.use('/api', (req, res, next) => {
      const refusal = apiRequestRefusal(req.headers, { lanMode });
      if (!refusal) return next();
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'forbidden', reason: refusal }));
    });
  }
  return {
    name: 'gev-api-request-guard',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
