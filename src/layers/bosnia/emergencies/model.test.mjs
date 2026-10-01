import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activationCard,
  activationLabel,
  normalizeActivations,
  normalizeEventGeometry,
  wrapLines,
} from './model.js';

const ring = [
  [17.7, 43.6],
  [17.8, 43.6],
  [17.8, 43.7],
  [17.7, 43.6],
];

test('normalizeActivations validates codes, dates and positions', () => {
  const rows = normalizeActivations({
    activations: [
      {
        code: 'EMSR087',
        activationTime: '2014-05-16T12:30:00',
        lon: 18.5,
        lat: 44.3,
        category: 'flood',
      },
      {
        code: 'EMSR770',
        activationTime: '2024-10-04T15:59:00',
        lon: 17.9,
        lat: 43.9,
        category: 'flood',
        mappedHa: { flood: 88.6, landslide: 171.6 },
        geometry: 'EMSR770.geojson',
        reason: 'a\r\nb',
      },
      { code: 'BAD', activationTime: '2024-10-04T15:59:00', lon: 1, lat: 1 },
      { code: 'EMSR001', activationTime: 'yesterday', lon: 1, lat: 1 },
      { code: 'EMSR002', activationTime: '2020-01-01T00:00', lon: 500, lat: 1 },
      {
        code: 'EMSR003',
        activationTime: '2020-01-01T00:00',
        lon: 1,
        lat: 1,
        geometry: '../../etc/passwd',
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.code),
    ['EMSR770', 'EMSR003', 'EMSR087'],
  );
  assert.equal(rows[0].hasLandslide, true);
  assert.equal(rows[0].reason, 'a b');
  assert.equal(rows[1].geometry, null);
  assert.equal(
    rows[0].url,
    'https://mapping.emergency.copernicus.eu/activations/EMSR770/',
  );
  assert.throws(() => normalizeActivations({}));
});

test('normalizeEventGeometry splits delineations from AOIs', () => {
  const out = normalizeEventGeometry(
    {
      features: [
        {
          properties: { code: 'EMSR770', kind: 'aoi', aoi: 'Jablanica' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          properties: { code: 'EMSR770', kind: 'landslide' },
          geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] },
        },
        {
          properties: { code: 'EMSR999', kind: 'flood' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          properties: { code: 'EMSR770', kind: 'volcano' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    },
    'EMSR770',
  );
  assert.equal(out.aois.length, 1);
  assert.equal(out.polygons.length, 2);
  assert.equal(out.polygons[0].kind, 'landslide');
});

test('activation card and label', () => {
  const [a] = normalizeActivations({
    activations: [
      {
        code: 'EMSR087',
        activationTime: '2014-05-16T12:30:00',
        lon: 18.5,
        lat: 44.3,
        category: 'flood',
        note: 'Catastrophic floods.',
      },
    ],
  });
  assert.equal(activationLabel(a), 'EMSR087 · May 2014');
  const card = activationCard(a);
  assert.equal(card.title, 'EMSR087 — Flood');
  assert.ok(card.details.some((d) => d.includes('not public')));
  assert.ok(card.details.at(-1).startsWith('mapping.emergency.copernicus.eu/'));
});

test('wrapLines bounds long text', () => {
  const lines = wrapLines('word '.repeat(80), 20, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  assert.deepEqual(wrapLines('short', 20, 2), ['short']);
});

test('bundled activations cover the nine BiH events', () => {
  const json = JSON.parse(
    readFileSync(
      new URL(
        '../../../data/local_data/bosnia/emergencies/activations.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const rows = normalizeActivations(json);
  assert.equal(rows.length, 9);
  assert.equal(rows.filter((r) => r.geometry).length, 5);
});
