import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MINE_WARNING,
  hatchSegments,
  mineCard,
  normaliseMineFeature,
  normaliseSuspectedStats,
  osmUrl,
} from './model.js';

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../data/local_data/bosnia/minefields/${name}`,
        import.meta.url,
      ),
    ),
  );

// ~1.1 km square near Sarajevo.
const SQUARE = [
  [18.4, 43.85],
  [18.414, 43.85],
  [18.414, 43.86],
  [18.4, 43.86],
  [18.4, 43.85],
];
const HOLE = [
  [18.405, 43.853],
  [18.409, 43.853],
  [18.409, 43.857],
  [18.405, 43.857],
  [18.405, 43.853],
];

test('hatch segments stay inside the polygon and skip holes', () => {
  const plain = hatchSegments([SQUARE], { spacingM: 100 });
  assert.ok(plain.length > 10);
  for (const seg of plain)
    for (const [lon, lat] of seg) {
      assert.ok(lon >= 18.4 - 1e-6 && lon <= 18.414 + 1e-6);
      assert.ok(lat >= 43.85 - 1e-6 && lat <= 43.86 + 1e-6);
    }
  const holed = hatchSegments([SQUARE, HOLE], { spacingM: 100 });
  assert.ok(holed.length > plain.length, 'lines crossing the hole are split');
  for (const [a, b] of holed) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inHole =
      mid[0] > 18.4051 &&
      mid[0] < 18.4089 &&
      mid[1] > 43.8531 &&
      mid[1] < 43.8569;
    assert.equal(inHole, false);
  }
  assert.equal(
    hatchSegments([SQUARE], { spacingM: 10, maxSegments: 5 }).length,
    5,
  );
  assert.deepEqual(hatchSegments([]), []);
});

test('normaliseMineFeature validates geometry and kinds', () => {
  const r = normaliseMineFeature({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [SQUARE] },
    properties: {
      id: 'w1',
      kind: 'minefield',
      lat: 43.855,
      lon: 18.407,
      areaKm2: 1.2,
    },
  });
  assert.equal(r.polygons.length, 1);
  assert.equal(
    normaliseMineFeature({
      geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
      properties: { id: 'w2', lat: 1, lon: 1 },
    }),
    null,
  );
  assert.equal(osmUrl('w123'), 'https://www.openstreetmap.org/way/123');
  assert.equal(osmUrl('x1'), null);
  const card = mineCard(r);
  assert.equal(card.warning, MINE_WARNING);
  assert.ok(card.links.some((l) => /euforbih/.test(l.url)));
});

test('warning text carries the required safety statements', () => {
  for (const phrase of [
    'INCOMPLETE community mapping, NOT official data',
    'does NOT mean an area is safe',
    '~775 km²',
    'www.bhmac.org',
    'https://www.euforbih.org/index.php/en/bih-minefield-maps',
    'never enter marked or abandoned areas',
  ])
    assert.ok(MINE_WARNING.includes(phrase), phrase);
});

test('bundled minefield dataset and suspected-area table are well formed', () => {
  const geo = read('minefields.geojson');
  const rows = geo.features.map(normaliseMineFeature);
  assert.equal(rows.filter((r) => r === null).length, 0);
  assert.ok(rows.length >= 150);
  assert.ok(rows.filter((r) => r.kind === 'minefield').length >= 150);
  const stats = normaliseSuspectedStats(read('suspected_area_2025.json'));
  const cantons = stats.rows.filter((r) => r.level === 'canton');
  const fbih = stats.rows.find((r) => r.area === 'Federacija BiH');
  const sum = cantons.reduce((a, r) => a + r.km2, 0);
  assert.ok(Math.abs(sum - fbih.km2) < 0.05, `${sum} vs ${fbih.km2}`);
  const total = stats.rows.find((r) => r.level === 'total').km2;
  const entities = stats.rows
    .filter((r) => r.level === 'entity')
    .reduce((a, r) => a + r.km2, 0);
  assert.ok(Math.abs(entities - total) < 0.05);
});
