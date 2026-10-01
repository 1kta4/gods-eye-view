import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  awarenessLevel,
  awarenessType,
  parseMeteoalarmAtom,
  regionCard,
  warningsByRegion,
} from './model.js';
import { readWarningsPayload, warningStats } from '../weatherWarnings.js';

const EMPTY_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
  <id>tag:meteoalarm.org,2021-02-19:BA</id>
  <title>MeteoAlarm - Alerting Europe for Extreme Weather</title>
  <updated>2026-10-01T13:05:10.522149Z</updated>
</feed>`;

const entry = ({
  code,
  area,
  event,
  severity = 'Moderate',
  onset,
  expires,
  id,
  status = 'Actual',
}) => `
  <entry>
    <cap:geocode><valueName>EMMA_ID</valueName><value>${code}</value></cap:geocode>
    <cap:areaDesc>${area}</cap:areaDesc>
    <cap:event>${event}</cap:event>
    <cap:sent>2026-10-01T06:00:00+00:00</cap:sent>
    <cap:expires>${expires}</cap:expires>
    <cap:effective>2026-10-01T06:00:00+00:00</cap:effective>
    <cap:onset>${onset}</cap:onset>
    <cap:certainty>Likely</cap:certainty>
    <cap:severity>${severity}</cap:severity>
    <cap:urgency>Future</cap:urgency>
    <cap:message_type>Alert</cap:message_type>
    <cap:status>${status}</cap:status>
    <cap:identifier>${id}</cap:identifier>
    <title>${event} issued for Bosnia and Herzegovina - ${area}</title>
  </entry>`;

const FIXTURE = EMPTY_FEED.replace(
  '</feed>',
  [
    entry({
      code: 'BA006',
      area: 'SARAJEVO',
      event: 'Orange thunderstorm warning',
      severity: 'Severe',
      onset: '2026-10-01T14:00:00+00:00',
      expires: '2026-10-01T22:00:00+00:00',
      id: '2.49.0.0.70.0.BA.1_orange_BA006',
    }),
    entry({
      code: 'BA006',
      area: 'SARAJEVO',
      event: 'Yellow wind warning',
      onset: '2026-10-01T12:00:00+00:00',
      expires: '2026-10-02T06:00:00+00:00',
      id: '2.49.0.0.70.0.BA.2_yellow_BA006',
    }),
    entry({
      code: 'BA008',
      area: 'MOSTAR &amp; surroundings',
      event: 'High-temperature warning',
      severity: 'Extreme',
      onset: '2026-10-01T10:00:00+00:00',
      expires: '2026-10-01T20:00:00+00:00',
      id: 'red-heat',
    }),
    entry({
      code: 'BA001',
      area: 'BIHAC',
      event: 'Yellow rain warning',
      onset: '2026-09-29T10:00:00+00:00',
      expires: '2026-09-30T10:00:00+00:00',
      id: 'expired',
    }),
    entry({
      code: 'BA002',
      area: 'PRIJEDOR',
      event: 'Yellow test warning',
      onset: '2026-10-01T10:00:00+00:00',
      expires: '2026-10-02T10:00:00+00:00',
      id: 'exercise',
      status: 'Exercise',
    }),
  ].join('') + '</feed>',
);

const NOW = Date.parse('2026-10-01T13:30:00Z');

test('an empty Meteoalarm feed parses to zero warnings, not an error', () => {
  const result = parseMeteoalarmAtom(EMPTY_FEED, NOW);
  assert.equal(result.updated, '2026-10-01T13:05:10.522Z');
  assert.deepEqual(result.warnings, []);
  const stats = warningStats(result.warnings, new Map());
  assert.equal(stats.count, 0);
  assert.equal(stats.loadingLabel, 'no warnings in force');
});

test('fixture warnings parse level, type, region and validity window', () => {
  const { warnings } = parseMeteoalarmAtom(FIXTURE, NOW);
  assert.equal(warnings.length, 3, 'expired and non-Actual entries dropped');
  const [storm, wind, heat] = warnings;
  assert.equal(storm.level, 'orange');
  assert.equal(storm.type, 'Thunderstorm');
  assert.deepEqual(storm.geocodes, ['BA006']);
  assert.equal(storm.onset, '2026-10-01T14:00:00.000Z');
  assert.equal(storm.expires, '2026-10-01T22:00:00.000Z');
  assert.equal(wind.level, 'yellow');
  // No colour in the event text: severity decides (Extreme → red).
  assert.equal(heat.level, 'red');
  assert.equal(heat.type, 'High-temperature');
  assert.equal(heat.areaDesc, 'MOSTAR & surroundings');
});

test('regions take their most severe warning; card and stats summarise', () => {
  const { warnings } = parseMeteoalarmAtom(FIXTURE, NOW);
  const regions = warningsByRegion(warnings);
  assert.equal(regions.get('BA006').level, 'orange');
  assert.equal(regions.get('BA006').warnings[0].type, 'Thunderstorm');
  const card = regionCard('Sarajevo', regions.get('BA006'));
  assert.equal(card.title, 'Sarajevo · Orange warning');
  assert.match(card.details[0], /^Orange Thunderstorm · /);
  const names = new Map([
    ['BA006', { name: 'Sarajevo' }],
    ['BA008', { name: 'Mostar' }],
  ]);
  const stats = warningStats(warnings, names);
  assert.equal(stats.count, 3);
  assert.match(stats.loadingLabel, /^Red max · Sarajevo, Mostar/);
});

test('awareness helpers and payload validation', () => {
  assert.equal(awarenessLevel('Red flood warning', 'Moderate'), 'red');
  assert.equal(awarenessLevel('Flood warning', 'Severe'), 'orange');
  assert.equal(awarenessType('Yellow snow-ice warning'), 'Snow-ice');
  assert.throws(() => parseMeteoalarmAtom('<html/>'), /meteoalarm_invalid/);
  const ok = readWarningsPayload({
    fetchedAt: 1,
    warnings: [
      { geocodes: ['BA006'], level: 'yellow' },
      { geocodes: ['BA006'], level: 'purple' },
    ],
  });
  assert.equal(ok.warnings.length, 1);
  assert.throws(
    () => readWarningsPayload({ fetchedAt: null, error: 'down', warnings: [] }),
    /down/,
  );
});

test('bundled region polygons cover the ten BiH Meteoalarm codes', () => {
  const geojson = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../data/local_data/bosnia/weather/meteoalarm-regions.geojson',
        import.meta.url,
      ),
    ),
  );
  const codes = geojson.features.map((f) => f.properties.code).sort();
  assert.deepEqual(
    codes,
    Array.from({ length: 10 }, (_, i) => `BA${String(i + 1).padStart(3, '0')}`),
  );
  assert.ok(geojson.features.every((f) => f.geometry.type === 'Polygon'));
});
