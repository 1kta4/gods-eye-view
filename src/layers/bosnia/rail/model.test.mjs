import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOperator,
  normalizeRailLines,
  normalizeStations,
  normalizeTimetable,
  railLineCard,
  stationCard,
  stationTimetableLines,
  toLatin,
} from './model.js';

const pt = (name, lon, lat, extra = {}) => ({
  properties: { name, kind: 'station', osmId: Math.round(lon * 1e4), ...extra },
  geometry: { type: 'Point', coordinates: [lon, lat] },
});

test('Cyrillic names are transliterated to Latin', () => {
  assert.equal(toLatin('Руданка'), 'Rudanka');
  assert.equal(toLatin('Љеб'), 'Ljeb');
  assert.equal(toLatin('Čapljina'), 'Čapljina');
});

test('operator spellings collapse to ŽFBiH / ŽRS, else inferred by entity', () => {
  assert.deepEqual(normalizeOperator('Željeznice FBiH', 'FBiH'), {
    operator: 'ŽFBiH',
    inferred: false,
  });
  assert.deepEqual(normalizeOperator('JP ŽFBiH d.o.o. Sarajevo'), {
    operator: 'ŽFBiH',
    inferred: false,
  });
  assert.deepEqual(normalizeOperator('Željeznice Republike Srpske'), {
    operator: 'ŽRS',
    inferred: false,
  });
  assert.equal(
    normalizeOperator('Инфраструктура железнице Србије').operator,
    'Infrastruktura železnice Srbije',
  );
  assert.deepEqual(normalizeOperator(null, 'RS'), {
    operator: 'ŽRS',
    inferred: true,
  });
  assert.deepEqual(normalizeOperator('', 'BD'), {
    operator: null,
    inferred: true,
  });
});

test('stations: validation and near-duplicate removal', () => {
  const stations = normalizeStations({
    features: [
      pt('Sarajevo', 18.39895, 43.86046, {
        entity: 'FBiH',
        operator: 'Željeznice FBiH',
      }),
      pt('Avde Hume', 18.35, 43.85, { kind: 'halt' }),
      pt('Avde Hume', 18.351, 43.8505, { kind: 'halt' }),
      pt('', 18, 44),
      pt('Nowhere', 'x', 44),
      {
        properties: { name: 'Tram', kind: 'tram_stop' },
        geometry: { type: 'Point', coordinates: [18, 44] },
      },
    ],
  });
  assert.deepEqual(
    stations.map((s) => s.name),
    ['Sarajevo', 'Avde Hume'],
  );
  assert.equal(stations[0].operator, 'ŽFBiH');
});

test('abandoned trackbeds drop road names; cards describe status', () => {
  const lines = normalizeRailLines({
    features: [
      {
        properties: { status: 'abandoned', name: 'Bulevar', narrowGauge: true },
        geometry: {
          type: 'LineString',
          coordinates: [
            [17, 43],
            [17.1, 43],
          ],
        },
      },
      {
        properties: {
          status: 'abandoned',
          name: 'nekadašnja pruga uskog koloseka Trebinje-Bileća',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [17, 43],
            [17.1, 43],
          ],
        },
      },
      {
        properties: {
          status: 'active',
          electrified: true,
          name: 'Unska pruga',
        },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [17, 43],
              [17.1, 43],
            ],
          ],
        },
      },
      {
        properties: { status: 'teleport' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [17, 43],
            [17.1, 43],
          ],
        },
      },
    ],
  });
  assert.equal(lines.length, 3);
  assert.equal(lines[0].name, null);
  assert.match(lines[1].name, /Trebinje/);
  assert.equal(railLineCard(lines[0]).title, 'Former railway (abandoned)');
  assert.ok(
    railLineCard(lines[2]).details.some((d) => d.includes('electrified')),
  );
});

const timetable = normalizeTimetable({
  period: 'ŽFBiH timetable 2025/2026',
  routes: { 'Sarajevo–Čapljina': ['Sarajevo', 'Konjic', 'Mostar', 'Čapljina'] },
  services: [
    {
      train: '723',
      rank: 'fast',
      from: 'Sarajevo',
      to: 'Čapljina',
      dep: '07:15',
      arr: '09:40',
      route: 'Sarajevo–Čapljina',
    },
    {
      train: '720',
      rank: 'fast',
      from: 'Čapljina',
      to: 'Sarajevo',
      dep: '06:03',
      arr: '08:35',
      route: 'Sarajevo–Čapljina',
    },
    { train: 'x', from: 'A', to: 'B', dep: 'soon', arr: '09:00' },
  ],
});

test('timetable lines for termini and intermediate stops', () => {
  assert.equal(timetable.services.length, 2);
  const sarajevo = stationTimetableLines('Sarajevo', timetable);
  assert.equal(sarajevo[0], 'ŽFBiH timetable 2025/2026');
  assert.equal(sarajevo[1], '07:15 → Čapljina (fast 723)');
  const mostar = stationTimetableLines('Mostar', timetable);
  assert.match(mostar[1], /723, 720/);
  assert.deepEqual(stationTimetableLines('Doboj', timetable), []);
  const card = stationCard(
    {
      name: 'Capljina',
      kind: 'station',
      operator: 'ŽFBiH',
      operatorInferred: true,
    },
    timetable,
  );
  assert.ok(card.details.includes('Operator: ŽFBiH (by entity)'));
  assert.ok(card.details.some((d) => d.startsWith('06:03')));
});
