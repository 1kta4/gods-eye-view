import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  conditionsCardCopy,
  crossingAnalystRecords,
  crossingCardCopy,
  mergeCrossings,
  normalizeCrossingDataset,
  shortWait,
} from './model.js';
import { parseWaitText } from './bihamk.js';

const DATASET = [
  {
    id: 'ba-gp-brod',
    key: 'brod',
    name: 'Brod',
    lat: 45.14622,
    lon: 18.00591,
    country: 'HR',
    neighbourCrossing: 'Slavonski Brod',
    cameras: ['ba-bihamk-brod1', 'ba-amsrs-br02-04'],
    elevationM: 90,
  },
  {
    id: 'ba-gp-vitine',
    key: 'vitine',
    name: 'Vitine',
    lat: 43.39,
    lon: 19.03,
    country: 'ME',
    neighbourCrossing: null,
    cameras: [],
  },
  { name: 'Broken', lat: 'x', lon: 18 },
  { name: 'Outside', lat: 48, lon: 18 },
];

const REPORT = {
  updatedAt: '2026-10-01T11:31:24.000Z',
  crossings: [
    {
      key: 'brod',
      name: 'Brod',
      text: 'Putnička vozila čekaju 45 minuta, a teretna oko 3 sata.',
      wait: parseWaitText(
        'Putnička vozila čekaju 45 minuta, a teretna oko 3 sata.',
      ),
    },
    {
      key: 'novo-mjesto',
      name: 'Novo Mjesto',
      lat: 44.5,
      lon: 19.2,
      text: 'Nema zadržavanja.',
      wait: parseWaitText('Nema zadržavanja.'),
    },
    { key: 'no-coords', name: 'No Coords', text: '', wait: null },
  ],
};

test('bundled dataset is valid and complete', () => {
  const raw = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../data/local_data/bosnia/roads/border_crossings.json',
        import.meta.url,
      ),
    ),
  );
  const rows = normalizeCrossingDataset(raw);
  assert.equal(rows.length, raw.length);
  assert.ok(rows.length >= 45, `${rows.length} crossings`);
  assert.ok(rows.every((row) => row.country));
  const cameras = JSON.parse(
    fs.readFileSync(
      new URL('../../../../config/cctv_sources.bosnia.json', import.meta.url),
    ),
  );
  const cameraIds = new Set(cameras.map((camera) => camera.id));
  for (const row of rows)
    for (const id of row.cameras) assert.ok(cameraIds.has(id), id);
});

test('normalizeCrossingDataset drops malformed rows', () => {
  const rows = normalizeCrossingDataset(DATASET);
  assert.deepEqual(
    rows.map((row) => row.key),
    ['brod', 'vitine'],
  );
  assert.equal(normalizeCrossingDataset(null).length, 0);
});

test('mergeCrossings joins live waits by key and keeps unknowns grey', () => {
  const rows = mergeCrossings(normalizeCrossingDataset(DATASET), REPORT);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(byKey.brod.minutes, 45);
  assert.equal(byKey.brod.band.id, 'moderate');
  assert.equal(byKey.brod.updatedAt, REPORT.updatedAt);
  assert.equal(byKey.vitine.live, null);
  assert.equal(byKey.vitine.band.id, 'unknown');
  assert.equal(shortWait(byKey.vitine), 'no report');
  assert.equal(byKey['novo-mjesto'].band.id, 'short');
  assert.equal(byKey['no-coords'], undefined);
  const offline = mergeCrossings(normalizeCrossingDataset(DATASET), null);
  assert.ok(offline.every((row) => row.band.id === 'unknown'));
});

test('crossingCardCopy lists neighbour, waits, text, time and cameras', () => {
  const [brod] = mergeCrossings(normalizeCrossingDataset(DATASET), REPORT);
  const card = crossingCardCopy(brod);
  assert.equal(card.title, 'GP Brod');
  assert.equal(card.details[0], '→ Croatia · Slavonski Brod');
  assert.equal(card.details[1], 'Cars 45 min · Trucks 3 h');
  assert.ok(card.details.some((line) => /^BIHAMK report 13:31/.test(line)));
  assert.equal(card.details.at(-1), 'CCTV · 2 stills · click card to view');
});

test('conditionsCardCopy clamps the national report', () => {
  assert.equal(conditionsCardCopy(null), null);
  const card = conditionsCardCopy(
    {
      updatedAt: '2026-10-01T11:31:24.000Z',
      paragraphs: ['a'.repeat(300), 'b', 'c', 'd', 'e', 'f'],
    },
    5,
  );
  assert.match(card.title, /BIHAMK 13:31/);
  assert.equal(card.details[0].length, 96);
  assert.equal(card.details.at(-1), '+1 more · click to open BIHAMK');
});

test('crossingAnalystRecords are JSON-safe', () => {
  const rows = mergeCrossings(normalizeCrossingDataset(DATASET), REPORT);
  const records = crossingAnalystRecords(rows, 2);
  assert.equal(records.length, 2);
  assert.equal(records[0].neighbourCountry, 'Croatia');
  assert.equal(records[0].trucksMinutes, 180);
  assert.doesNotThrow(() => JSON.stringify(records));
});
