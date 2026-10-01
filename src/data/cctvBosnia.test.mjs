import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBosniaSourcesFromCatalog } from '../../server/providers/cctv/sources.js';

test('Bosnia catalog registers BIHAMK and AMS RS stills only', (t) => {
  t.mock.method(console, 'log', () => {});
  const cameras = loadBosniaSourcesFromCatalog();
  assert.ok(cameras.length >= 40, `${cameras.length} cameras`);
  const ids = new Set();
  for (const camera of cameras) {
    assert.ok(!ids.has(camera.id), camera.id);
    ids.add(camera.id);
    assert.match(
      camera.url,
      /^https:\/\/(video-nadzor\.bihamk\.ba\/videosurveillence\/[A-Z0-9]+\.jpg|gp\.satwork\.net\/AMSRS_\d\d_GP_[A-Z]{2}\d\d\/slika\.jpg)$/,
    );
    assert.equal(camera.snapshotUrl, camera.url);
    assert.equal(camera.feedType, 'image');
    assert.equal(camera.cityId, 'bosnia');
    assert.ok(camera.lat > 42.4 && camera.lat < 45.4, camera.id);
    assert.ok(camera.lon > 15.6 && camera.lon < 19.8, camera.id);
    assert.ok(Number.isFinite(camera.headingDeg));
    assert.ok(camera.license.length > 10);
  }
  assert.ok(ids.has('ba-bihamk-skenderija'));
  assert.ok(ids.has('ba-amsrs-ra02-02'));
});

test('Bosnia loader rejects off-host URLs, out-of-country points and junk', (t) => {
  t.mock.method(console, 'log', () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-bosnia-'));
  fs.mkdirSync(path.join(dir, 'config'));
  const ok = 'https://video-nadzor.bihamk.ba/videosurveillence/STUP.jpg';
  fs.writeFileSync(
    path.join(dir, 'config', 'cctv_sources.bosnia.json'),
    JSON.stringify([
      { id: 'ok', url: ok, lat: 43.84, lon: 18.33, headingDeg: 400 },
      { id: 'ok', url: ok, lat: 43.84, lon: 18.33 },
      { id: 'query', url: `${ok}?123`, lat: 43.84, lon: 18.33 },
      {
        id: 'evil',
        url: 'https://evil.example/STUP.jpg',
        lat: 43.8,
        lon: 18.3,
      },
      {
        id: 'traversal',
        url: 'https://gp.satwork.net/AMSRS_01_GP_GR01/../x/slika.jpg',
        lat: 43.8,
        lon: 18.3,
      },
      { id: 'vienna', url: ok, lat: 48.2, lon: 16.37 },
      { id: 'text', url: ok, lat: '43.8', lon: '18.3' },
      null,
    ]),
  );
  const cameras = loadBosniaSourcesFromCatalog({ sourceRoot: dir });
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['ok'],
  );
  assert.equal(cameras[0].headingDeg, 40);
});

test('Bosnia loader tolerates a missing catalog file', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(
    loadBosniaSourcesFromCatalog({ sourceRoot: '/nonexistent' }),
    [],
  );
});
