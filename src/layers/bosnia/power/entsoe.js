/**
 * ENTSO-E Transparency Platform helpers for the Bosnia and Herzegovina power
 * layer. Pure: no network, no DOM. The Vite proxy
 * (server/providers/bosnia/power.js) fetches the XML documents and uses these
 * to turn them into the small JSON summary the browser draws.
 *
 * Documents used (bidding zone BA, EIC 10YBA-JPCC-----D):
 *   A65/A16  actual total load
 *   A75/A16  actual generation per production type
 *   A11      cross-border physical flows (one document per direction)
 */

export const BA_EIC = '10YBA-JPCC-----D';
export const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';

/** Neighbouring control areas with a physical interconnection to BiH. */
export const NEIGHBOURS = Object.freeze([
  Object.freeze({
    code: 'HR',
    name: 'Croatia',
    eic: '10YHR-HEP------M',
    capital: 'Zagreb',
    lat: 45.815,
    lon: 15.982,
  }),
  Object.freeze({
    code: 'RS',
    name: 'Serbia',
    eic: '10YCS-SERBIATSOV',
    capital: 'Belgrade',
    lat: 44.787,
    lon: 20.457,
  }),
  Object.freeze({
    code: 'ME',
    name: 'Montenegro',
    eic: '10YCS-CG-TSO---S',
    capital: 'Podgorica',
    lat: 42.441,
    lon: 19.263,
  }),
]);

/** ENTSO-E production type (psrType) codes → label and layer fuel key. */
export const PSR_TYPES = Object.freeze({
  B01: ['Biomass', 'biomass'],
  B02: ['Lignite', 'coal'],
  B03: ['Coal-derived gas', 'coal'],
  B04: ['Fossil gas', 'gas'],
  B05: ['Hard coal', 'coal'],
  B06: ['Oil', 'oil'],
  B07: ['Oil shale', 'oil'],
  B08: ['Peat', 'coal'],
  B09: ['Geothermal', 'other'],
  B10: ['Hydro pumped storage', 'pumped'],
  B11: ['Hydro run-of-river', 'hydro'],
  B12: ['Hydro reservoir', 'hydro'],
  B13: ['Marine', 'other'],
  B14: ['Nuclear', 'other'],
  B15: ['Other renewable', 'other'],
  B16: ['Solar', 'solar'],
  B17: ['Waste', 'other'],
  B18: ['Wind offshore', 'wind'],
  B19: ['Wind onshore', 'wind'],
  B20: ['Other', 'other'],
});

const RESOLUTION_MINUTES = Object.freeze({
  PT15M: 15,
  PT30M: 30,
  PT60M: 60,
  PT1H: 60,
  P1D: 1440,
});
const MAX_POINTS_PER_PERIOD = 2000;
const MAX_SERIES = 200;

/**
 * Format a Date as the ENTSO-E `yyyyMMddHHmm` UTC period bound.
 * @param {Date|number} date
 * @returns {string}
 */
export function entsoePeriod(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}00`
  );
}

/**
 * The query window for "latest" values: the last 26 hours up to the next
 * full hour, so late-published series still have a point in range.
 * @param {number} now Epoch ms.
 * @returns {{periodStart:string, periodEnd:string}}
 */
export function latestWindow(now) {
  const hour = 3_600_000;
  const end = Math.floor(now / hour) * hour + hour;
  return {
    periodStart: entsoePeriod(end - 27 * hour),
    periodEnd: entsoePeriod(end),
  };
}

/**
 * Build the list of ENTSO-E requests for one refresh. The token is added
 * only by the caller that actually fetches, so these descriptors are safe
 * to log or test.
 * @param {number} now Epoch ms.
 * @returns {Array<{key:string, params:Record<string,string>}>}
 */
export function buildEntsoeRequests(now) {
  const window = latestWindow(now);
  const requests = [
    {
      key: 'load',
      params: {
        documentType: 'A65',
        processType: 'A16',
        outBiddingZone_Domain: BA_EIC,
        ...window,
      },
    },
    {
      key: 'generation',
      params: {
        documentType: 'A75',
        processType: 'A16',
        in_Domain: BA_EIC,
        ...window,
      },
    },
  ];
  for (const n of NEIGHBOURS) {
    requests.push({
      key: `import:${n.code}`,
      params: {
        documentType: 'A11',
        in_Domain: BA_EIC,
        out_Domain: n.eic,
        ...window,
      },
    });
    requests.push({
      key: `export:${n.code}`,
      params: {
        documentType: 'A11',
        in_Domain: n.eic,
        out_Domain: BA_EIC,
        ...window,
      },
    });
  }
  return requests;
}

/**
 * Compose the request URL. Kept separate so the token never reaches logs:
 * callers redact with {@link redactToken} before printing anything.
 * @param {Record<string,string>} params
 * @param {string} token
 * @returns {string}
 */
export function entsoeUrl(params, token) {
  const url = new URL(ENTSOE_API);
  url.searchParams.set('securityToken', token);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return url.href;
}

/** Remove a security token from any text before it is logged or returned. */
export function redactToken(text, token) {
  const value = String(text ?? '');
  if (!token) return value;
  return value.split(token).join('[redacted]');
}

function stripNamespaces(xml) {
  return xml
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1');
}

function blocks(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  let match;
  while ((match = re.exec(xml))) out.push(match[1]);
  return out;
}

function first(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
  const match = re.exec(xml);
  return match ? decodeEntities(match[1].trim()) : null;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function isoMinute(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?Z$/.exec(value);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return Number.isFinite(t) ? t : null;
}

/** Strip control characters and bound the length of upstream reason text. */
function cleanText(text, max = 160) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Parse an ENTSO-E XML document (GL_MarketDocument,
 * Publication_MarketDocument or Acknowledgement_MarketDocument).
 *
 * Returns time series as `{ psrType, direction, points:[{t, mw}] }`, where
 * `direction` is 'in' for generation/flow into the queried domain and 'out'
 * for the consumption leg ENTSO-E reports for pumped storage in A75. Points
 * with non-numeric quantities are dropped; a curveType A03 period (points
 * omitted while the value repeats) is returned as given — the last point
 * still carries the latest value.
 *
 * @param {string} xml Upstream body.
 * @returns {{kind:'ack', reasonCode:string|null, reason:string}|{kind:'series', series:Array<object>}}
 * @throws {Error} `entsoe_invalid_xml` for anything that is not a known document.
 */
export function parseEntsoeXml(xml) {
  if (typeof xml !== 'string' || !xml.trim())
    throw new Error('entsoe_invalid_xml');
  const doc = stripNamespaces(xml);
  if (/<Acknowledgement_MarketDocument[\s>]/.test(doc)) {
    const reason = first(doc, 'Reason') || '';
    return {
      kind: 'ack',
      reasonCode: cleanText(first(reason, 'code'), 8) || null,
      reason: cleanText(first(reason, 'text')) || 'No data',
    };
  }
  if (!/<(GL|Publication)_MarketDocument[\s>]/.test(doc))
    throw new Error('entsoe_invalid_xml');
  const series = [];
  for (const ts of blocks(doc, 'TimeSeries').slice(0, MAX_SERIES)) {
    const psrType = first(ts, 'psrType');
    const outZone =
      /<outBiddingZone_Domain\.mRID[\s>]/.test(ts) &&
      !/<inBiddingZone_Domain\.mRID[\s>]/.test(ts);
    const points = [];
    for (const period of blocks(ts, 'Period')) {
      const interval = first(period, 'timeInterval') || '';
      const start = isoMinute(first(interval, 'start'));
      const end = isoMinute(first(interval, 'end'));
      const minutes = RESOLUTION_MINUTES[first(period, 'resolution') || ''];
      if (start === null || !minutes) continue;
      const step = minutes * 60_000;
      for (const point of blocks(period, 'Point').slice(
        0,
        MAX_POINTS_PER_PERIOD,
      )) {
        const position = Number(first(point, 'position'));
        const quantity = Number(first(point, 'quantity'));
        if (!Number.isInteger(position) || position < 1) continue;
        if (!Number.isFinite(quantity) || Math.abs(quantity) > 1e6) continue;
        const t = start + (position - 1) * step;
        if (end !== null && t >= end) continue;
        points.push({ t, mw: quantity });
      }
    }
    points.sort((a, b) => a.t - b.t);
    series.push({
      psrType: psrType && /^B\d\d$/.test(psrType) ? psrType : null,
      direction: outZone ? 'out' : 'in',
      points,
    });
  }
  return { kind: 'series', series };
}

/**
 * Latest point across the given series (by timestamp), or null.
 * @param {Array<{points:Array<{t:number,mw:number}>}>} series
 * @returns {{t:number, mw:number}|null}
 */
export function latestPoint(series) {
  let best = null;
  for (const s of series || []) {
    const p = s.points?.[s.points.length - 1];
    if (p && (!best || p.t > best.t)) best = p;
  }
  return best;
}

/** Value of a single-series document at its latest timestamp. */
function sumAt(series, t) {
  let total = 0;
  let found = false;
  for (const s of series) {
    let value = null;
    for (const p of s.points) {
      if (p.t <= t) value = p.mw;
      else break;
    }
    if (value !== null) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}

/**
 * Summarise a parsed A65 document to the latest load.
 * @param {ReturnType<typeof parseEntsoeXml>} parsed
 * @returns {{mw:number, at:string}|null}
 */
export function summariseLoad(parsed) {
  if (parsed?.kind !== 'series') return null;
  const latest = latestPoint(parsed.series);
  if (!latest) return null;
  const mw = sumAt(parsed.series, latest.t);
  return mw === null
    ? null
    : { mw: Math.round(mw), at: new Date(latest.t).toISOString() };
}

/**
 * Summarise a parsed A75 document: per production type at the most recent
 * timestamp shared by the series, plus the total. Pumping consumption
 * ('out' series) is reported separately and not added to generation.
 * @param {ReturnType<typeof parseEntsoeXml>} parsed
 * @returns {{totalMw:number, pumpingMw:number|null, at:string, byType:Array<{code:string,label:string,fuel:string,mw:number}>}|null}
 */
export function summariseGeneration(parsed) {
  if (parsed?.kind !== 'series') return null;
  const generation = parsed.series.filter((s) => s.direction === 'in');
  const latest = latestPoint(generation);
  if (!latest) return null;
  const byCode = new Map();
  for (const s of generation) {
    if (!s.psrType) continue;
    const value = sumAt([s], latest.t);
    if (value === null) continue;
    byCode.set(s.psrType, (byCode.get(s.psrType) || 0) + value);
  }
  const byType = [...byCode.entries()]
    .map(([code, mw]) => {
      const [label, fuel] = PSR_TYPES[code] || [code, 'other'];
      return { code, label, fuel, mw: Math.round(mw) };
    })
    .sort((a, b) => b.mw - a.mw);
  const pumping = sumAt(
    parsed.series.filter((s) => s.direction === 'out'),
    latest.t,
  );
  return {
    totalMw: byType.reduce((sum, row) => sum + row.mw, 0),
    pumpingMw: pumping === null ? null : Math.round(pumping),
    at: new Date(latest.t).toISOString(),
    byType,
  };
}

/**
 * Combine the import and export A11 documents for one neighbour.
 * @param {object} neighbour Row from {@link NEIGHBOURS}.
 * @param {ReturnType<typeof parseEntsoeXml>|null} imported Flow neighbour → BA.
 * @param {ReturnType<typeof parseEntsoeXml>|null} exported Flow BA → neighbour.
 * @returns {{neighbour:string,name:string,capital:string,lat:number,lon:number,importMw:number|null,exportMw:number|null,netImportMw:number|null,at:string|null}}
 */
export function summariseFlow(neighbour, imported, exported) {
  const imp = imported?.kind === 'series' ? latestPoint(imported.series) : null;
  const exp = exported?.kind === 'series' ? latestPoint(exported.series) : null;
  const importMw = imp ? Math.round(imp.mw) : null;
  const exportMw = exp ? Math.round(exp.mw) : null;
  const t = Math.max(imp?.t ?? -Infinity, exp?.t ?? -Infinity);
  return {
    neighbour: neighbour.code,
    name: neighbour.name,
    capital: neighbour.capital,
    lat: neighbour.lat,
    lon: neighbour.lon,
    importMw,
    exportMw,
    netImportMw:
      importMw === null && exportMw === null
        ? null
        : (importMw ?? 0) - (exportMw ?? 0),
    at: Number.isFinite(t) ? new Date(t).toISOString() : null,
  };
}

/**
 * Validate the JSON the proxy returns before the browser draws it. Anything
 * malformed collapses to null fields rather than throwing mid-render.
 * @param {unknown} payload
 * @returns {object}
 */
export function normaliseLivePayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const iso = (v) =>
    typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
  const load =
    p.load && num(p.load.mw) !== null
      ? { mw: num(p.load.mw), at: iso(p.load.at) }
      : null;
  const gen = p.generation;
  const generation =
    gen && num(gen.totalMw) !== null && Array.isArray(gen.byType)
      ? {
          totalMw: num(gen.totalMw),
          pumpingMw: num(gen.pumpingMw),
          at: iso(gen.at),
          byType: gen.byType
            .filter((r) => r && num(r.mw) !== null)
            .slice(0, 24)
            .map((r) => ({
              code: cleanText(r.code, 4),
              label: cleanText(r.label, 40),
              fuel: cleanText(r.fuel, 16),
              mw: num(r.mw),
            })),
        }
      : null;
  const known = new Map(NEIGHBOURS.map((n) => [n.code, n]));
  const flows = Array.isArray(p.flows)
    ? p.flows
        .filter((f) => f && known.has(f.neighbour))
        .map((f) => {
          const n = known.get(f.neighbour);
          return {
            neighbour: n.code,
            name: n.name,
            capital: n.capital,
            lat: n.lat,
            lon: n.lon,
            importMw: num(f.importMw),
            exportMw: num(f.exportMw),
            netImportMw: num(f.netImportMw),
            at: iso(f.at),
          };
        })
    : [];
  return {
    configured: p.configured === true,
    keyRequired: p.keyRequired === true,
    stale: p.stale === true,
    fetchedAt: iso(p.fetchedAt),
    error: typeof p.error === 'string' ? cleanText(p.error) : null,
    load,
    generation,
    flows,
  };
}
