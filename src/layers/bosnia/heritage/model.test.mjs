import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  heritageCard,
  heritageLabel,
  heritagePriority,
  normaliseHeritageFeature,
} from './model.js';
import { commonsThumbUrl, safeHttpsUrl } from './baInfoCard.js';

const bundle = JSON.parse(
  readFileSync(
    new URL(
      '../../../data/local_data/bosnia/heritage/heritage.geojson',
      import.meta.url,
    ),
  ),
);

const feature = (props, coords = [17.815, 43.337]) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coords },
  properties: { id: 'x', name: 'Stari most', ...props },
});

test('normaliseHeritageFeature keeps valid points and rejects others', () => {
  const r = normaliseHeritageFeature(
    feature({ tier: 'unesco', year: 2005, kons: '1234', wikidata: 'Q188528' }),
  );
  assert.equal(r.tier, 'unesco');
  assert.equal(r.year, 2005);
  assert.equal(r.kons, '1234');
  assert.equal(normaliseHeritageFeature(feature({}, [2.35, 48.85])), null);
  assert.equal(normaliseHeritageFeature(feature({ name: '' })), null);
  assert.equal(
    normaliseHeritageFeature(feature({ wikidata: 'javascript:alert(1)' }))
      .wikidata,
    null,
  );
  assert.equal(
    normaliseHeritageFeature(feature({ tier: 'weird' })).tier,
    'national',
  );
});

test('UNESCO sites outrank national monuments and cards link out', () => {
  const unesco = normaliseHeritageFeature(
    feature({
      tier: 'unesco',
      year: 2016,
      whc: 'https://whc.unesco.org/en/list/1504',
    }),
  );
  const national = normaliseHeritageFeature(
    feature({ tier: 'national', wiki: 'https://bs.wikipedia.org/wiki/X' }),
  );
  assert.ok(heritagePriority(unesco) > heritagePriority(national));
  assert.deepEqual(heritageLabel(unesco).details, ['UNESCO 2016']);
  const card = heritageCard(national);
  assert.match(card.subtitle, /National Monument/);
  assert.ok(card.links.some((l) => l.label === 'Wikipedia'));
});

test('bundled heritage dataset: all 24 UNESCO components plus KONS monuments', () => {
  const rows = bundle.features.map(normaliseHeritageFeature);
  assert.equal(rows.filter((r) => r === null).length, 0);
  const unesco = rows.filter((r) => r.tier === 'unesco');
  assert.equal(unesco.length, 24);
  assert.equal(
    unesco.filter((r) => r.site === 'Stećci Medieval Tombstone Graveyards')
      .length,
    20,
  );
  assert.ok(unesco.some((r) => r.year === 2024 && /Vjetrenica/.test(r.name)));
  assert.ok(unesco.some((r) => r.year === 2021 && /Janj/.test(r.name)));
  assert.ok(rows.filter((r) => r.tier === 'national').length > 500);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test('info-card URL guards', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('http://example.com'), null);
  assert.equal(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
  assert.match(
    commonsThumbUrl('Stari Most 2.jpg'),
    /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Stari%20Most%202\.jpg\?width=320$/,
  );
  assert.equal(commonsThumbUrl('../evil'), null);
});
