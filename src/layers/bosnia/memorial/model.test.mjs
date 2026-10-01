import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memorialCard, normaliseMemorialSite } from './model.js';

const bundle = JSON.parse(
  readFileSync(
    new URL(
      '../../../data/local_data/bosnia/memorial/memorial.json',
      import.meta.url,
    ),
  ),
);

test('unsourced or non-https entries never render', () => {
  const base = {
    id: 'a',
    name: 'A',
    lat: 43.85,
    lon: 18.4,
    description: 'd',
  };
  assert.equal(normaliseMemorialSite({ ...base, sources: [] }), null);
  assert.equal(
    normaliseMemorialSite({
      ...base,
      sources: [{ label: 'x', url: 'http://example.com' }],
    }),
    null,
  );
  const ok = normaliseMemorialSite({
    ...base,
    sources: [{ label: 'ICTY', url: 'https://www.icty.org/en/case/galic' }],
  });
  assert.equal(ok.sources.length, 1);
  assert.equal(normaliseMemorialSite({ ...ok, lat: 10 }), null);
});

test('bundled War Memory set: 25–40 sourced sites, unique ids', () => {
  const sites = bundle.sites.map(normaliseMemorialSite);
  assert.equal(sites.filter((s) => s === null).length, 0);
  assert.ok(sites.length >= 25 && sites.length <= 40, `${sites.length}`);
  assert.equal(new Set(sites.map((s) => s.id)).size, sites.length);
  for (const s of sites) {
    assert.ok(s.sources.length >= 1);
    assert.ok(s.date, s.id);
  }
  const card = memorialCard(sites[0]);
  assert.match(card.footer, /No victim-level data/);
});
