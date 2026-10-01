/**
 * @module bosnia/borderCrossings/bihamk
 * @description Pure parsers for the BIHAMK (Bosanskohercegovački auto-moto
 * klub) road-information pages. No DOM, no Cesium — shared by the server proxy
 * (server/providers/bosnia/roads.js) and the browser layer, and unit tested on
 * fixture text.
 *
 * Every string that leaves this module is plain text (tags stripped, entities
 * decoded, control characters removed, length capped). Consumers must still
 * render it as text, never as HTML.
 */

export const BIHAMK_CROSSINGS_URL =
  'https://bihamk.ba/spi/stanje-na-cesti-u-bih/granicni-prijelazi';
export const BIHAMK_CONDITIONS_URL =
  'https://bihamk.ba/spi/stanje-na-cesti-u-bih';

const MAX_CROSSINGS = 80;
const MAX_NAME = 80;
const MAX_TEXT = 600;
const MAX_PARAGRAPHS = 16;
const MAX_PARAGRAPH = 700;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  scaron: 'š',
  Scaron: 'Š',
  zcaron: 'ž',
  Zcaron: 'Ž',
  ccaron: 'č',
  Ccaron: 'Č',
  cacute: 'ć',
  Cacute: 'Ć',
  dstrok: 'đ',
  Dstrok: 'Đ',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  deg: '°',
};

/** Decode the HTML entities BIHAMK pages actually use. */
export function decodeEntities(text) {
  return String(text ?? '').replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi,
    (match, body) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : '';
      }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
        ? NAMED_ENTITIES[body]
        : match;
    },
  );
}

/**
 * Collapse an HTML fragment to plain text: comments/scripts/styles dropped,
 * block boundaries become newlines, tags stripped, entities decoded, control
 * characters and stray angle brackets removed.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  const text = decodeEntities(
    String(html ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|article|section)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
  return text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function clamp(text, max) {
  const clean = String(text ?? '').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Stable key for a crossing name: "GP  Novi Grad" → "novi-grad",
 * "Granični prelaz Šamac" → "samac", "Gradiška - novi most" →
 * "gradiska-novi-most". Matches the `key` field of the bundled dataset.
 * @param {string} name
 * @returns {string}
 */
export function crossingKey(name) {
  return String(name ?? '')
    .trim()
    .replace(/^(?:GP|G\.P\.|Granični\s+prijelaz|Granični\s+prelaz)\s+/i, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Minutes east of UTC that `zone` observes at epoch `ms`. */
function zoneOffsetMinutes(ms, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - ms) / 60000);
}

/**
 * Convert a Sarajevo wall-clock time ("2026-10-01 13:31:24") to ISO UTC.
 * @param {string} local
 * @returns {string|null}
 */
export function sarajevoLocalToIso(local) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      String(local ?? '').trim(),
    );
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '0'] = match;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (!Number.isFinite(wall)) return null;
  // Two passes settle the offset across a DST boundary.
  let guess = wall - zoneOffsetMinutes(wall, 'Europe/Sarajevo') * 60000;
  guess = wall - zoneOffsetMinutes(guess, 'Europe/Sarajevo') * 60000;
  const date = new Date(guess);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Report timestamp from the page's `<time datetime="…">`, else the dd.mm.yyyy. u HH:MM text. */
export function parseReportTime(html) {
  const source = String(html ?? '');
  const attr = /<time\b[^>]*\bdatetime="([^"]{10,25})"/i.exec(source);
  if (attr) {
    const iso = sarajevoLocalToIso(attr[1]);
    if (iso) return iso;
  }
  const text = /(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*u\s*(\d{1,2}):(\d{2})/.exec(
    source,
  );
  if (!text) return null;
  const [, d, mo, y, h, mi] = text;
  return sarajevoLocalToIso(
    `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')} ${h.padStart(2, '0')}:${mi}`,
  );
}

/**
 * Return the JSON array literal that starts at `start` (a "["), honouring
 * string escapes, or null when it is unbalanced.
 */
function sliceJsonArray(source, start) {
  if (source[start] !== '[') return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length && i - start < 1_000_000; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function finiteIn(value, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function crossingRow(rawName, rawText, lat = null, lon = null) {
  const name = clamp(
    htmlToText(rawName)
      .replace(/\s+/g, ' ')
      .replace(/^GP\s+/i, ''),
    MAX_NAME,
  );
  const key = crossingKey(name);
  if (!name || !key) return null;
  const text = clamp(htmlToText(rawText), MAX_TEXT);
  return {
    name,
    key,
    text,
    lat: finiteIn(lat, 42, 46),
    lon: finiteIn(lon, 15, 20),
    wait: parseWaitText(text),
  };
}

/** Map-data path: the page's `const properties = [...]` marker list. */
function crossingsFromMapData(html) {
  const marker = html.search(/\bconst\s+properties\s*=\s*\[/);
  if (marker < 0) return [];
  const literal = sliceJsonArray(html, html.indexOf('[', marker));
  if (!literal) return [];
  let parsed;
  try {
    parsed = JSON.parse(literal);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows = [];
  for (const item of parsed.slice(0, MAX_CROSSINGS)) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.name !== 'string' || typeof item.text !== 'string')
      continue;
    const row = crossingRow(
      item.name,
      item.text,
      item.position?.lat,
      item.position?.lng,
    );
    if (row) rows.push(row);
  }
  return rows;
}

/** Report path: `<article><h3>GP …</h3><div>…</div></article>` cards. */
function crossingsFromArticles(html) {
  const rows = [];
  const re =
    /<article\b[^>]*>\s*<h3\b[^>]*>([\s\S]{1,300}?)<\/h3>([\s\S]{0,6000}?)<\/article>/gi;
  let match;
  while ((match = re.exec(html)) && rows.length < MAX_CROSSINGS) {
    const row = crossingRow(match[1], match[2]);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Parse the BIHAMK border-crossings page.
 * @param {string} html
 * @returns {{updatedAt: string|null, crossings: Array<object>}}
 */
export function parseBihamkCrossingsPage(html) {
  const source = String(html ?? '');
  const articles = crossingsFromArticles(source);
  const mapRows = crossingsFromMapData(source);
  // The report cards are what readers see; the map data adds coordinates and
  // stands in when the card markup changes.
  let crossings = articles.length ? articles : mapRows;
  if (articles.length && mapRows.length) {
    const coords = new Map(mapRows.map((row) => [row.key, row]));
    crossings = articles.map((row) => {
      const located = coords.get(row.key);
      return located ? { ...row, lat: located.lat, lon: located.lon } : row;
    });
  }
  const seen = new Set();
  crossings = crossings.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
  return { updatedAt: parseReportTime(source), crossings };
}

/**
 * Parse the BIHAMK general road-conditions report into plain paragraphs.
 * @param {string} html
 * @returns {{updatedAt: string|null, paragraphs: string[]}}
 */
export function parseBihamkConditionsPage(html) {
  const source = String(html ?? '');
  const start = source.search(/<div\b[^>]*class="[^"]*\btext-editor\b[^"]*"/i);
  let block = '';
  if (start >= 0) {
    const rest = source.slice(start);
    const end = rest.search(
      /<h3\b[^>]*>\s*Audio\s+izvje|<audio\b|<footer\b|<\/main>/i,
    );
    block = rest.slice(0, end > 0 ? Math.min(end, 200_000) : 60_000);
  }
  const paragraphs = [];
  for (const line of htmlToText(block).split('\n')) {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (clean.length < 12) continue;
    if (paragraphs.includes(clean)) continue;
    paragraphs.push(clamp(clean, MAX_PARAGRAPH));
    if (paragraphs.length >= MAX_PARAGRAPHS) break;
  }
  return { updatedAt: parseReportTime(source), paragraphs };
}

// ---------------------------------------------------------------------------
// Wait-time text
// ---------------------------------------------------------------------------

/** A sentence about waiting (not, say, a crossing's opening hours). */
const WAIT_WORDS = /zadr[žz]a|[čc]eka|kolon|gu[žz]v|zastoj/;
const OPENING_HOURS = /\bradi\b|radno\s+vrijeme|otvoren\w*\s+(?:je\s+)?od\b/;
function isWaitSentence(sentence) {
  if (WAIT_WORDS.test(sentence)) return true;
  return /minut/.test(sentence) && !OPENING_HOURS.test(sentence);
}
const NUMBER_WORDS = {
  jedan: 1,
  jednog: 1,
  jedna: 1,
  jednu: 1,
  dva: 2,
  dvije: 2,
  dve: 2,
  tri: 3,
  četiri: 4,
  cetiri: 4,
  pet: 5,
  šest: 6,
  sest: 6,
};
const NUM = String.raw`(\d{1,3}(?:[.,]5)?|jedan|jednog|jedna|jednu|dva|dvije|dve|tri|četiri|cetiri|pet|šest|sest)`;
const HOURS = String.raw`(?:h\b|sat[a-i]?\b|sahat\w*|časa\b|cas[a]?\b)`;
const MINUTES = String.raw`(?:min\b\.?|minut\w*)`;
const HOUR_RE = new RegExp(
  String.raw`${NUM}\s*${HOURS}(?:\s*(?:i\s*)?(\d{1,2})\s*${MINUTES}|\s*i\s*po\b)?`,
  'g',
);
const MINUTE_RE = new RegExp(String.raw`${NUM}\s*${MINUTES}`, 'g');

function numberValue(token) {
  const lower = String(token).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, lower))
    return NUMBER_WORDS[lower];
  const n = Number(lower.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Every duration in a clause, in minutes. Clock times (13:30, 08.00) are
 * dropped first so working hours never read as waits.
 * @param {string} clause Lower-case text.
 * @returns {number[]}
 */
export function durationsInMinutes(clause) {
  let text = String(clause ?? '')
    .toLowerCase()
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, ' ');
  const found = [];
  text = text.replace(/\bpola\s+sata\b/g, () => {
    found.push(30);
    return ' ';
  });
  text = text.replace(HOUR_RE, (match, n, extraMinutes) => {
    const hours = numberValue(n);
    if (hours !== null) {
      let minutes = hours * 60;
      if (extraMinutes) minutes += Number(extraMinutes);
      else if (/\bi\s*po\b/.test(match)) minutes += 30;
      found.push(Math.round(minutes));
    }
    return ' ';
  });
  text.replace(MINUTE_RE, (match, n) => {
    const minutes = numberValue(n);
    if (minutes !== null) found.push(Math.round(minutes));
    return ' ';
  });
  return found.filter((m) => m >= 0 && m <= 48 * 60);
}

function vehicleClass(clause) {
  if (/teret|kamion|šlep|slep/.test(clause)) return 'trucks';
  if (/autobus/.test(clause)) return 'buses';
  if (/putni[čc]k|osobn|automobil|auta\b/.test(clause)) return 'cars';
  return null;
}

function directionOf(clause) {
  const entry = /\bulaz|ulasku|\bu bih\b|ulaze/.test(clause);
  const exit = /izlaz|izlasku|iz bih|izlaze/.test(clause);
  if (entry && !exit) return 'entry';
  if (exit && !entry) return 'exit';
  return null;
}

function maxOrNull(current, value) {
  return current === null || value > current ? value : current;
}

/**
 * Interpret one crossing's free-text status.
 *
 * Returns the longest wait per vehicle class and per direction, in minutes,
 * plus flags. `upTo` marks "not longer than N" phrasing (an upper bound);
 * `noDelay` marks an explicit "no waiting" statement.
 * @param {string} text
 */
export function parseWaitText(text) {
  const result = {
    cars: null,
    trucks: null,
    buses: null,
    general: null,
    entry: null,
    exit: null,
    upTo: false,
    noDelay: false,
    closed: false,
    truckBan: false,
  };
  const lower = String(text ?? '').toLowerCase();
  const sentences = lower
    .split(/\n+|(?<=[.!?])\s+(?=[^\d\s])/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (
      /zabranjen\w*\s+(?:je\s+)?(?:saobra[ćc]aj|promet)[^.]*teret|teret\w*[^.]*zabranjen|zatvoren\w*[^.]*teret/.test(
        sentence,
      )
    )
      result.truckBan = true;
    if (
      /\bzatvoren\w*\b/.test(sentence) &&
      !/teret|kamion|dionic|cest|put\b/.test(sentence)
    )
      result.closed = true;
    if (!isWaitSentence(sentence)) continue;
    if (
      /\b(?:nema|bez)\s+(?:du[žz]ih\s+|ve[ćc]ih\s+|ikakvih\s+)?(?:zadr[žz]avanj|[čc]ekanj|gu[žz]v|kolon|zastoj)/.test(
        sentence,
      )
    )
      result.noDelay = true;
    // Clause split: "putnička vozila čekaju 30 min, a teretna do 2 sata".
    let lastClass = null;
    let lastDirection = null;
    for (const clause of sentence.split(/,\s*(?:a|dok|dočim)\s+|;\s*/)) {
      const minutes = durationsInMinutes(clause);
      const cls = vehicleClass(clause) ?? lastClass;
      const dir = directionOf(clause) ?? lastDirection;
      lastClass = cls;
      lastDirection = dir;
      if (!minutes.length) continue;
      const worst = Math.max(...minutes);
      if (
        /\bnisu\s+du[žz]\w*\s+od|\bne\s+\S*\s*du[žz]e\s+od|\bdo\s+\d/.test(
          clause,
        )
      )
        result.upTo = true;
      result[cls ?? 'general'] = maxOrNull(result[cls ?? 'general'], worst);
      if (dir) result[dir] = maxOrNull(result[dir], worst);
    }
  }
  return result;
}

/**
 * The single wait that colours a crossing: passenger cars first, else the
 * unqualified figure, else zero for an explicit "no delay", else unknown.
 * @param {ReturnType<typeof parseWaitText>} wait
 * @returns {number|null}
 */
export function headlineWaitMinutes(wait) {
  if (!wait) return null;
  if (Number.isFinite(wait.cars)) return wait.cars;
  if (Number.isFinite(wait.general)) return wait.general;
  if (wait.noDelay) return 0;
  return null;
}

export const WAIT_BANDS = Object.freeze([
  Object.freeze({ id: 'short', label: 'Under 30 min', color: '#3ddc84' }),
  Object.freeze({ id: 'moderate', label: '30–60 min', color: '#ffd23f' }),
  Object.freeze({ id: 'long', label: '1–2 h', color: '#ff8c1a' }),
  Object.freeze({ id: 'severe', label: 'Over 2 h', color: '#ff3b30' }),
  Object.freeze({ id: 'unknown', label: 'No report', color: '#8a94a6' }),
]);

/**
 * Colour band for a wait. "Not longer than 30 minutes" (an upper bound of
 * 30) still counts as the short band; a reported 30-minute wait does not.
 * @param {number|null} minutes
 * @param {{upTo?: boolean}} [options]
 */
export function waitBand(minutes, { upTo = false } = {}) {
  const [short, moderate, long, severe, unknown] = WAIT_BANDS;
  if (!Number.isFinite(minutes)) return unknown;
  if (minutes < 30 || (upTo && minutes <= 30)) return short;
  if (minutes <= 60) return moderate;
  if (minutes <= 120) return long;
  return severe;
}

/** Short human wait text: "≤30 min", "about 1 h 30 min", "no delay". */
export function formatWait(minutes, { upTo = false } = {}) {
  if (!Number.isFinite(minutes)) return 'no report';
  if (minutes === 0) return 'no delay';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const body = h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  return upTo ? `≤${body}` : body;
}
