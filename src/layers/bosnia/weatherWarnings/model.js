/**
 * Meteoalarm (EUMETNET) warnings for Bosnia and Herzegovina — pure parser and
 * presentation helpers shared by the Vite proxy and the browser layer.
 * Feed: https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-bosnia-herzegovina
 * (Atom with CAP 1.2 fields; an empty feed means no warnings are in force).
 */

export const AWARENESS_LEVELS = Object.freeze({
  green: { rank: 1, label: 'Green', color: '#2E9E44' },
  yellow: { rank: 2, label: 'Yellow', color: '#F5D000' },
  orange: { rank: 3, label: 'Orange', color: '#FF8C00' },
  red: { rank: 4, label: 'Red', color: '#E0001B' },
});

const SEVERITY_LEVEL = Object.freeze({
  Minor: 'green',
  Moderate: 'yellow',
  Severe: 'orange',
  Extreme: 'red',
});

const MAX_ENTRIES = 400;

function decodeXml(text) {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&');
}

function clean(value, max = 160) {
  return decodeXml(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const match = re.exec(block);
  return match ? clean(match[1], 400) : '';
}

function isoOrNull(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Awareness level key from the CAP event text, falling back to severity. */
export function awarenessLevel(event, severity) {
  const match = /\b(green|yellow|orange|red)\b/i.exec(event || '');
  if (match) return match[1].toLowerCase();
  return SEVERITY_LEVEL[severity] || 'yellow';
}

/** "Yellow wind warning" → "Wind"; "Orange High-temperature warning" → "High-temperature". */
export function awarenessType(event) {
  const text = String(event || '')
    .replace(/\b(green|yellow|orange|red)\b/gi, '')
    .replace(/\bwarning\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Weather';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Parse the legacy Meteoalarm Atom feed.
 * @param {string} xml Feed body.
 * @param {number} [now] Drop warnings that expired before this instant.
 * @returns {{updated:string|null, warnings:object[]}}
 */
export function parseMeteoalarmAtom(xml, now = Date.now()) {
  if (typeof xml !== 'string' || !/<feed\b/i.test(xml))
    throw new Error('meteoalarm_invalid');
  const head = xml.split(/<entry\b/i)[0];
  const updated = isoOrNull(tag(head, 'updated'));
  const warnings = [];
  const seen = new Set();
  const entries = xml.split(/<entry\b/i).slice(1, MAX_ENTRIES + 1);
  for (const raw of entries) {
    const block = raw.split(/<\/entry>/i)[0];
    const status = tag(block, 'cap:status');
    if (status && status !== 'Actual') continue;
    const messageType = tag(block, 'cap:message_type');
    if (messageType === 'Cancel') continue;
    const geocodes = [];
    const geoRe = /<cap:geocode>([\s\S]*?)<\/cap:geocode>/gi;
    let geo;
    while ((geo = geoRe.exec(block))) {
      const valueName = tag(geo[1], 'valueName');
      const value = tag(geo[1], 'value');
      if (/^EMMA_ID$/i.test(valueName) && /^[A-Z]{2}\d{3,6}$/.test(value))
        geocodes.push(value);
    }
    const event = tag(block, 'cap:event');
    const severity = tag(block, 'cap:severity');
    const expires = isoOrNull(tag(block, 'cap:expires'));
    if (expires && Date.parse(expires) < now) continue;
    const id = tag(block, 'cap:identifier') || tag(block, 'id');
    const level = awarenessLevel(event, severity);
    const key = `${id}|${geocodes.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push({
      id: id.slice(0, 200),
      geocodes,
      areaDesc: tag(block, 'cap:areaDesc').slice(0, 120),
      event: event.slice(0, 120),
      type: awarenessType(event).slice(0, 60),
      level,
      severity: severity.slice(0, 20) || null,
      certainty: tag(block, 'cap:certainty').slice(0, 20) || null,
      urgency: tag(block, 'cap:urgency').slice(0, 20) || null,
      onset: isoOrNull(tag(block, 'cap:onset')),
      effective: isoOrNull(tag(block, 'cap:effective')),
      expires,
      sent: isoOrNull(tag(block, 'cap:sent')),
      title: tag(block, 'title').slice(0, 200),
    });
  }
  return { updated, warnings };
}

/**
 * Group warnings by Meteoalarm region code; each region gets its most severe
 * level and the warnings sorted most severe first.
 * @returns {Map<string, {level:string, warnings:object[]}>}
 */
export function warningsByRegion(warnings) {
  const regions = new Map();
  for (const warning of warnings) {
    for (const code of warning.geocodes) {
      const entry = regions.get(code) || { level: 'green', warnings: [] };
      entry.warnings.push(warning);
      if (
        AWARENESS_LEVELS[warning.level].rank >
        AWARENESS_LEVELS[entry.level].rank
      )
        entry.level = warning.level;
      regions.set(code, entry);
    }
  }
  for (const entry of regions.values())
    entry.warnings.sort(
      (a, b) =>
        AWARENESS_LEVELS[b.level].rank - AWARENESS_LEVELS[a.level].rank ||
        String(a.onset).localeCompare(String(b.onset)),
    );
  return regions;
}

function formatWhen(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '?';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sarajevo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

/** Card copy for one region (plain text). */
export function regionCard(regionName, entry) {
  if (!entry || !entry.warnings.length)
    return {
      title: `${regionName} · no warnings`,
      details: ['Meteoalarm · no warning in force'],
      accent: AWARENESS_LEVELS.green.color,
    };
  const details = entry.warnings
    .slice(0, 4)
    .map(
      (w) =>
        `${AWARENESS_LEVELS[w.level].label} ${w.type} · ${formatWhen(w.onset || w.effective)} → ${formatWhen(w.expires)}`,
    );
  if (entry.warnings.length > 4)
    details.push(`+${entry.warnings.length - 4} more`);
  details.push('Meteoalarm (EUMETNET) · CC BY 4.0');
  return {
    title: `${regionName} · ${AWARENESS_LEVELS[entry.level].label} warning`,
    details,
    accent: AWARENESS_LEVELS[entry.level].color,
  };
}
