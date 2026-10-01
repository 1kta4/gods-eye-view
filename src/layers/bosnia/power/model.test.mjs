import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describeFlow,
  flowArc,
  formatMw,
  liveSummaryLine,
  normalisePowerFeature,
  plantPixelSize,
  powerCard,
} from './model.js';
import { normaliseLivePayload } from './entsoe.js';

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../data/local_data/bosnia/power/${name}`, import.meta.url),
    ),
  );

test('marker size grows with capacity and is bounded', () => {
  assert.equal(plantPixelSize(null), 6);
  assert.ok(plantPixelSize(700) > plantPixelSize(50));
  assert.equal(plantPixelSize(100000), 34);
  assert.equal(formatMw(0.46), '460 kW');
  assert.equal(formatMw(30.6), '30.6 MW');
  assert.equal(formatMw(723), '723 MW');
});

test('flow wording follows the net direction', () => {
  assert.equal(
    describeFlow({ neighbour: 'HR', netImportMw: 120 }).text,
    'HR → BA 120 MW',
  );
  assert.equal(
    describeFlow({ neighbour: 'RS', netImportMw: -340.4 }).text,
    'BA → RS 340 MW',
  );
  assert.equal(
    describeFlow({ neighbour: 'ME', netImportMw: null }).direction,
    'none',
  );
  const arc = flowArc({ lat: 44, lon: 18 }, { lat: 45, lon: 16 }, { steps: 4 });
  assert.equal(arc.length, 15);
  assert.ok(arc[8] > arc[2], 'arc peaks mid-way');
});

test('live summary states a missing token instead of failing', () => {
  const missing = normaliseLivePayload({
    configured: false,
    keyRequired: true,
  });
  assert.match(liveSummaryLine(missing), /ENTSOE_API_TOKEN/);
  const ok = normaliseLivePayload({
    configured: true,
    load: { mw: 1500, at: '2026-10-01T12:00:00Z' },
    generation: { totalMw: 1800, byType: [] },
    flows: [
      { neighbour: 'HR', netImportMw: -200 },
      { neighbour: 'RS', netImportMw: -100 },
    ],
  });
  assert.equal(
    liveSummaryLine(ok),
    'ENTSO-E load 1500 MW · gen 1800 MW · net export 300 MW (12:00 UTC)',
  );
});

test('bundled plants/grid: major plants present with capacities', () => {
  const plants = read('plants.geojson').features.map(normalisePowerFeature);
  assert.equal(plants.filter((p) => p === null).length, 0);
  const byName = new Map(plants.map((p) => [p.name, p]));
  for (const name of [
    'TE Tuzla',
    'TE Kakanj',
    'TE Gacko',
    'TE Ugljevik',
    'TE Stanari',
    'HE Jablanica',
    'HE Višegrad',
    'PHE Čapljina',
    'VE Podveležje',
    'VE Mesihovina',
  ])
    assert.ok(byName.get(name)?.mw > 0, name);
  assert.ok(plants.some((p) => p.kind === 'dam'));
  assert.match(powerCard(byName.get('TE Tuzla')).footer, /CC BY 4\.0/);
  const grid = read('grid.geojson').features;
  assert.ok(grid.length > 20);
  assert.ok(
    grid.every((f) => f.properties.kv === 400 || f.properties.kv === 220),
  );
});
