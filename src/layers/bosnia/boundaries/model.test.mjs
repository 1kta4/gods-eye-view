import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  acceptBoundaryParams,
  densityClass,
  formatArea,
  formatInt,
  municipalityCard,
  normalizeBoundaryLines,
  normalizeMunicipalities,
  normalizeUnits,
  polygonsFromGeometry,
} from './model.js';

const square = [
  [17, 44],
  [17.1, 44],
  [17.1, 44.1],
  [17, 44.1],
  [17, 44],
];

test('polygonsFromGeometry keeps valid rings and drops junk', () => {
  assert.equal(
    polygonsFromGeometry({ type: 'Polygon', coordinates: [square] }).length,
    1,
  );
  assert.equal(
    polygonsFromGeometry({
      type: 'MultiPolygon',
      coordinates: [[square], [[[0, 0]]]],
    }).length,
    1,
  );
  assert.deepEqual(
    polygonsFromGeometry({ type: 'Point', coordinates: [1, 2] }),
    [],
  );
  assert.deepEqual(polygonsFromGeometry(null), []);
});

test('normalizeMunicipalities validates entity, ids and density', () => {
  const rows = normalizeMunicipalities({
    features: [
      {
        properties: {
          id: 'm1',
          name: 'Brčko',
          entity: 'BD',
          canton: null,
          population2013: 83516,
          areaKm2: 487.1,
        },
        geometry: { type: 'Polygon', coordinates: [square] },
      },
      {
        properties: { id: 'm1', name: 'dup', entity: 'RS' },
        geometry: { type: 'Polygon', coordinates: [square] },
      },
      {
        properties: { id: 'm2', name: 'x', entity: 'XX' },
        geometry: { type: 'Polygon', coordinates: [square] },
      },
      {
        properties: {
          id: 'm3',
          name: 'Centar Sarajevo',
          entity: 'FBiH',
          canton: 9,
          population2013: 55181,
          areaKm2: 33,
        },
        geometry: { type: 'Polygon', coordinates: [square] },
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['m1', 'm3'],
  );
  assert.equal(rows[0].density, 171.5);
  assert.equal(rows[1].canton, 9);
  assert.throws(() => normalizeMunicipalities({ features: [] }));
  assert.throws(() => normalizeMunicipalities(null));
});

test('density classes and number formatting', () => {
  assert.equal(densityClass(10), 0);
  assert.equal(densityClass(25), 1);
  assert.equal(densityClass(499), 4);
  assert.equal(densityClass(6752), 5);
  assert.equal(densityClass(null), null);
  assert.equal(formatInt(3531159), '3,531,159');
  assert.equal(formatArea(9.94), '9.9');
  assert.equal(formatArea(1212.9), '1,213');
});

test('municipality card is neutral and complete', () => {
  const cantons = new Map([
    [9, { name: 'Sarajevo Canton', localName: 'Kanton Sarajevo' }],
  ]);
  const card = municipalityCard(
    {
      name: 'Novo Sarajevo',
      entity: 'FBiH',
      canton: 9,
      population2013: 64814,
      areaKm2: 9.6,
      density: 6751.5,
    },
    cantons,
  );
  assert.equal(card.title, 'Novo Sarajevo');
  assert.ok(card.details.includes('Canton: Sarajevo Canton (Kanton Sarajevo)'));
  assert.ok(card.details.some((d) => d.includes('64,814')));
  const brcko = municipalityCard({
    name: 'Brčko',
    entity: 'BD',
    population2013: 83516,
    areaKm2: 487,
  });
  assert.match(brcko.details[0], /Brčko District/);
});

test('choropleth params accept only a real change', () => {
  assert.deepEqual(
    acceptBoundaryParams({ choropleth: true }, { choropleth: false }),
    { choropleth: true },
  );
  assert.equal(
    acceptBoundaryParams({ choropleth: false }, { choropleth: false }),
    null,
  );
  assert.equal(acceptBoundaryParams({ other: 1 }, { choropleth: false }), null);
});

test('bundled boundary data matches the 2013 census totals', () => {
  const read = (f) =>
    JSON.parse(
      readFileSync(
        new URL(
          `../../../data/local_data/bosnia/boundaries/${f}`,
          import.meta.url,
        ),
        'utf8',
      ),
    );
  const munis = normalizeMunicipalities(read('municipalities.geojson'));
  assert.equal(munis.length, 142);
  assert.equal(
    munis.reduce((s, m) => s + m.population2013, 0),
    3531159,
  );
  const units = normalizeUnits(read('units.json'));
  const entity = (code) =>
    units.find((u) => u.kind === 'entity' && u.code === code);
  assert.equal(entity('FBiH').population2013, 2219220);
  assert.equal(entity('RS').population2013, 1228423);
  assert.equal(units.filter((u) => u.kind === 'canton').length, 10);
  const lines = normalizeBoundaryLines(read('lines.geojson'));
  for (const level of ['national', 'entity', 'canton', 'municipal'])
    assert.ok(lines[level].length > 0, level);
});
