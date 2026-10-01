/**
 * Parsers for the BHANSA eAIP (Bosnia and Herzegovina) HTML pages:
 *  - ENR 5.1 prohibited / restricted / danger areas (table rows)
 *  - ENR 2.1 TMAs (free text)
 *  - AD 2.17 CTRs (free text)
 * Pure functions, used by build-data.mjs to produce the bundled airspace
 * GeoJSON, and unit-tested against small fixtures.
 */

const FT = 0.3048;
const NM = 1852;
const EARTH_R = 6371008.8;

/** `432144.98N 0174901.02E` / `443547N0190618E` → [lon, lat]. */
export const COORD_RE =
  /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])\s*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])/g;

export function parseCoordinate(match) {
  const [, latD, latM, latS, ns, lonD, lonM, lonS, ew] = match;
  let lat = Number(latD) + Number(latM) / 60 + Number(latS) / 3600;
  let lon = Number(lonD) + Number(lonM) / 60 + Number(lonS) / 3600;
  if (ns === 'S') lat = -lat;
  if (ew === 'W') lon = -lon;
  return [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}

/** All coordinates in a text, in order. */
export function parseCoordinates(text) {
  return [...String(text).matchAll(COORD_RE)].map(parseCoordinate);
}

/** Decode the few HTML entities the eAIP uses and strip tags. */
export function htmlToText(html) {
  return String(html)
    .replace(/<br\b[^>]*>|<\/?p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/**
 * Parse one vertical limit, e.g. `FL 250`, `9500 FT AMSL`, `2300 FT ALT`,
 * `1000 FT AGL`, `GND`.
 * @returns {{text:string, meters:number, ref:'MSL'|'AGL'|'FL'|'GND'}|null}
 */
export function parseLimit(raw) {
  const text = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!text) return null;
  if (/^(GND|SFC)\b/.test(text)) return { text: 'GND', meters: 0, ref: 'GND' };
  let m = text.match(/^FL\s*(\d{2,3})/);
  if (m) {
    const fl = Number(m[1]);
    return { text: `FL ${fl}`, meters: Math.round(fl * 100 * FT), ref: 'FL' };
  }
  m = text.match(/^(\d{3,5})\s*FT\s*(AMSL|MSL|ALT|AMLS|AGL|AAL)?/);
  if (m) {
    const ft = Number(m[1]);
    const ref = m[2] === 'AGL' || m[2] === 'AAL' ? 'AGL' : 'MSL';
    return {
      text: `${ft} FT ${ref === 'AGL' ? 'AGL' : 'AMSL'}`,
      meters: Math.round(ft * FT),
      ref,
    };
  }
  return null;
}

/** Parse `UPPER / LOWER` as printed in ENR 5.1 column 2. */
export function parseVerticalPair(raw) {
  const [upper, lower] = String(raw || '').split('/');
  const u = parseLimit(upper);
  const l = parseLimit(lower);
  return u && l ? { upper: u, lower: l } : null;
}

/** Circle → closed ring (lon/lat) with `steps` segments. */
export function circleRing([lon, lat], radiusM, steps = 48) {
  const ring = [];
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const d = radiusM / EARTH_R;
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * (i % steps)) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(brg),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([
      Math.round(((lon2 * 180) / Math.PI) * 1e6) / 1e6,
      Math.round(((lat2 * 180) / Math.PI) * 1e6) / 1e6,
    ]);
  }
  return ring;
}

/** `A circle radius 1.50 KM centered on 432803N 0182442E` → ring. */
export function parseCircle(text) {
  const m = String(text).match(
    /circle\s+radius\s+(\d+(?:\.\d+)?)\s*(NM|KM|M)\b/i,
  );
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toUpperCase();
  const radius =
    unit === 'NM' ? value * NM : unit === 'KM' ? value * 1000 : value;
  const center = parseCoordinates(text.slice(m.index + m[0].length))[0];
  if (!center || !(radius > 0)) return null;
  return { ring: circleRing(center, radius), center, radiusM: radius };
}

function closeRing(points) {
  if (points.length < 3) return null;
  const [a, b] = [points[0], points[points.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? points : [...points, a];
}

function nearestIndex(ring, [lon, lat]) {
  let best = 0;
  let bestD = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < ring.length; i++) {
    const dx = (ring[i][0] - lon) * k;
    const dy = ring[i][1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Vertices of `border` (closed ring) between the points nearest `from` and
 * `to`, walking whichever direction is shorter. Endpoints excluded.
 */
export function borderArc(border, from, to) {
  if (!Array.isArray(border) || border.length < 4) return [];
  const ring =
    border[0][0] === border[border.length - 1][0] &&
    border[0][1] === border[border.length - 1][1]
      ? border.slice(0, -1)
      : border;
  const n = ring.length;
  const i = nearestIndex(ring, from);
  const j = nearestIndex(ring, to);
  if (i === j) return [];
  const forward = (j - i + n) % n;
  const backward = (i - j + n) % n;
  const out = [];
  if (forward <= backward) {
    for (let k = 1; k < forward; k++) out.push(ring[(i + k) % n]);
  } else {
    for (let k = 1; k < backward; k++) out.push(ring[(i - k + n) % n]);
  }
  return out;
}

/**
 * Lateral limits written as `P1; P2; along ... boundary; P3; ...`. Each
 * "along" segment follows the national border between its neighbours.
 */
export function parseLateralPath(text, border = null) {
  const tokens = [];
  const re = new RegExp(
    `${COORD_RE.source}|along[^;,]*?(?:boundary|BDRY)`,
    'gi',
  );
  for (const m of String(text).matchAll(re)) {
    if (/^along/i.test(m[0])) tokens.push('ALONG');
    else tokens.push(parseCoordinate(m));
  }
  const points = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t !== 'ALONG') {
      points.push(t);
      continue;
    }
    const prev = points[points.length - 1];
    const next = tokens.slice(k + 1).find((x) => x !== 'ALONG') || points[0];
    if (border && prev && next) points.push(...borderArc(border, prev, next));
  }
  return closeRing(points);
}

/**
 * ENR 5.1 → areas. Rows hold `<strong>LQR3 NAME</strong>` + lateral text,
 * then `UPPER / LOWER`, then remarks.
 */
export function parseEnr51(html) {
  const areas = [];
  const rows = String(html).split(/<tr\b/i).slice(1);
  for (const row of rows) {
    const cells = row
      .split(/<td\b/i)
      .slice(1)
      .map((cell) => htmlToText(`<td${cell}`.replace(/<\/tr>[\s\S]*$/i, '')));
    if (cells.length < 2) continue;
    const head = cells[0].match(/^(LQ[PRD]\d+[A-Z]?)\s+([^\n]+)/);
    if (!head) continue;
    const [, ident, name] = head;
    const lateral = cells[0].slice(head[0].length);
    const vertical = parseVerticalPair(cells[1]);
    const circle = /circle/i.test(lateral) ? parseCircle(lateral) : null;
    const ring = circle ? circle.ring : closeRing(parseCoordinates(lateral));
    if (!ring || !vertical) continue;
    const type = { P: 'prohibited', R: 'restricted', D: 'danger' }[ident[2]];
    areas.push({
      ident,
      name: name.trim(),
      type,
      ring,
      upper: vertical.upper,
      lower: vertical.lower,
      remarks: (cells[2] || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    });
  }
  return areas;
}

/** ENR 2.1 → TMAs (`X TMA ... coordinates: ... Upper/Lower limit ...`). */
export function parseEnr21Tmas(html, border = null) {
  const text = htmlToText(html).replace(/\n/g, ' ');
  const out = [];
  const re =
    /([A-Z][A-Z ]+?) TMA \(outside of [A-Z ]+ CTR\), are defined by the following coordinates:\s*(.*?)(?=(?:Upper|Lower) [Ll]imit)((?:(?:Upper|Lower) [Ll]imit:?\s*(?:FL\s*\d+|\d+\s*FT\s*\w+)\s*){2})(?:Classification:\s*Class\s*([A-Z/]+))?/g;
  for (const m of text.matchAll(re)) {
    const name = m[1].trim();
    const ring = parseLateralPath(m[2], border);
    const upper = parseLimit(
      m[3].match(/Upper [Ll]imit:?\s*(FL\s*\d+|\d+\s*FT\s*\w+)/)?.[1],
    );
    const lower = parseLimit(
      m[3].match(/Lower [Ll]imit:?\s*(FL\s*\d+|\d+\s*FT\s*\w+)/)?.[1],
    );
    if (!ring || !upper || !lower) continue;
    out.push({
      ident: `${name} TMA`,
      name: `${name} TMA`,
      type: 'tma',
      ring,
      upper,
      lower,
      airspaceClass: m[4] || null,
    });
  }
  return out;
}

/** AD 2.17 → CTR (`X CTR coords. 2 Vertical limits GND - 6500 FT AMSL 3 Airspace classification D`). */
export function parseAd217Ctr(html) {
  const text = htmlToText(html).replace(/\n/g, ' ');
  const m = text.match(
    /AD 2\.17\s+ATS Airspace.*?([A-Z][A-Z ]+ CTR)\s+(.*?)\s+2\s+Vertical limits\s+(.*?)\s+3\s+Airspace classification\s+([A-G])\b/,
  );
  if (!m) return null;
  const ring = closeRing(parseCoordinates(m[2]));
  const [lowerRaw, upperRaw] = m[3].split(/\s+-\s+|\s+–\s+/);
  const lower = parseLimit(lowerRaw);
  const upper = parseLimit(upperRaw);
  if (!ring || !lower || !upper) return null;
  return {
    ident: m[1].trim(),
    name: m[1].trim(),
    type: 'ctr',
    ring,
    upper,
    lower,
    airspaceClass: m[4],
  };
}
