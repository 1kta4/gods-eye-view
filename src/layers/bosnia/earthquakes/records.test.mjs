import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmscEvents,
  parseFhmzQuakes,
  mergeFhmzIntensity,
  filterQuakeWindow,
  normalizeQuakeSnapshot,
  parseLocalDateTime,
  quakeAgeClass,
  quakePixelSize,
  buildQuakeCard,
  emscEventUrl,
  emscQueryUrl,
  titleCaseRegion,
} from './records.js';
import {
  baEarthquakesProxy,
  decodeMixedHtml,
} from '../../../../server/providers/bosnia/earthquakes.js';

const NOW = Date.parse('2026-10-01T12:00:00Z');

const feature = (unid, time, mag, extra = {}) => ({
  type: 'Feature',
  id: unid,
  geometry: { type: 'Point', coordinates: [18.66, 43.77, -4.9] },
  properties: {
    unid,
    time,
    mag,
    magtype: 'ml',
    depth: 4.9,
    flynn_region: 'BOSNIA AND HERZEGOVINA',
    auth: 'EMSC',
    lat: 43.7692,
    lon: 18.6642,
    evtype: 'ke',
    ...extra,
  },
});

const EMSC = {
  type: 'FeatureCollection',
  features: [
    feature('20260927_0000001', '2026-09-27T06:34:34.81Z', 2.8),
    feature('20261001_0000111', '2026-10-01T08:21:10.1Z', 2.1, {
      flynn_region: 'CROATIA',
      auth: 'CSS',
      lat: 43.4647,
      lon: 17.1048,
    }),
    feature('bad-mag', '2026-09-30T00:00:00Z', 'x'),
    feature('20260927_0000001', '2026-09-27T06:34:34.81Z', 2.8),
    { type: 'Feature', properties: null },
  ],
};

const FHMZ_HTML = `
<script>
const mPotres0 = L.marker([43.90,18.73],{icon:M23Icon}).bindPopup('<table width="20%" border="0" cellspacing="0"><tr><td width="36%">datum :</td><td width="64%">27.09.2026</td></tr><tr><td>vrijeme:</td><td>08:34</td></tr><tr><td>mjesto :</td><td>Podromanija</td></tr><tr><td>magnituda:</td><td>2.7</td></tr><tr><td>intenzitet :</td><td>III-IV</td></tr></table>').addTo(cities);
const mPotres1 = L.marker([44.96,17.50],{icon:M24Icon}).bindPopup('<table><tr><td>datum :</td><td>28.09.2026.</td></tr><tr><td>vrijeme:</td><td>9:27</td></tr><tr><td>mjesto :</td><td>Laktaši</td></tr><tr><td>magnituda:</td><td>2.9</td></tr><tr><td>intenzitet :</td><td>IV</td></tr></table>').addTo(cities);
</script>`;

test('EMSC events are normalised, deduplicated and malformed rows skipped', () => {
  const rows = normalizeEmscEvents(EMSC);
  assert.equal(rows.length, 2);
  const [first] = rows;
  assert.equal(first.mag, 2.8);
  assert.equal(first.depthKm, 4.9);
  assert.equal(first.region, 'Bosnia and Herzegovina');
  assert.equal(
    first.url,
    'https://www.seismicportal.eu/eventdetails.html?unid=20260927_0000001',
  );
  assert.equal(normalizeEmscEvents({}), null);
});

test('EMSC URLs are built from safe ids and a 30-day window', () => {
  assert.equal(emscEventUrl('x"><script>'), null);
  const url = new URL(emscQueryUrl(NOW));
  assert.equal(url.searchParams.get('starttime'), '2026-09-01T12:00:00');
  assert.equal(url.searchParams.get('minmag'), '1.5');
  assert.equal(titleCaseRegion('SERBIA'), 'Serbia');
});

test('Sarajevo local time converts with the summer/winter offset', () => {
  assert.equal(
    parseLocalDateTime('27.09.2026', '08:34'),
    Date.parse('2026-09-27T06:34:00Z'),
  );
  assert.equal(
    parseLocalDateTime('15.01.2026.', '3:00'),
    Date.parse('2026-01-15T02:00:00Z'),
  );
  assert.ok(Number.isNaN(parseLocalDateTime('31.13.2026', '08:00')));
});

test('FHMZ popups parse with coordinates and intensity', () => {
  const rows = parseFhmzQuakes(FHMZ_HTML);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { ...rows[0] },
    {
      time: Date.parse('2026-09-27T06:34:00Z'),
      place: 'Podromanija',
      mag: 2.7,
      intensity: 'III-IV',
      lat: 43.9,
      lon: 18.73,
    },
  );
  assert.equal(rows[1].place, 'Laktaši');
});

test('FHMZ table rows are a fallback when the map is missing', () => {
  const rows = parseFhmzQuakes(
    '<table><tr align="center"><td>24.09.2026</td><td>23:25</td><td>Pale</td><td>2.7</td><td><img src="x.png"></td><td>III-IV</td></tr></table>',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lat, null);
  assert.equal(rows[0].intensity, 'III-IV');
});

test('intensity merges into the matching EMSC event; unmatched FHMZ events are kept', () => {
  const merged = mergeFhmzIntensity(
    normalizeEmscEvents(EMSC),
    parseFhmzQuakes(FHMZ_HTML),
    {
      nowMs: NOW,
    },
  );
  const matched = merged.find((e) => e.id === '20260927_0000001');
  assert.equal(matched.intensity, 'III-IV');
  assert.equal(matched.place, 'Podromanija');
  const own = merged.find((e) => e.source === 'FHMZ');
  assert.equal(own.place, 'Laktaši');
  assert.equal(own.intensity, 'IV');
  assert.equal(merged.length, 3);
  assert.ok(merged[0].time >= merged[1].time);
});

test('window filter drops old, small and far events', () => {
  const rows = filterQuakeWindow(
    [
      { id: 'a', time: NOW - 1000, mag: 2, lat: 44, lon: 18 },
      { id: 'old', time: NOW - 40 * 86_400_000, mag: 3, lat: 44, lon: 18 },
      { id: 'small', time: NOW, mag: 1.2, lat: 44, lon: 18 },
      { id: 'far', time: NOW, mag: 4, lat: 38, lon: 22 },
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a'],
  );
});

test('client snapshot validation and presentation helpers', () => {
  assert.equal(normalizeQuakeSnapshot({}), null);
  const rows = normalizeQuakeSnapshot({
    events: [
      {
        id: 'e1',
        unid: 'e1',
        source: 'EMSC',
        time: NOW - 3_600_000,
        lat: 44,
        lon: 18,
        mag: 2.4,
        depthKm: 7,
        magType: 'ml',
        region: '<b>x</b>',
        auth: 'EMSC',
      },
      { id: 'bad', lat: 'x' },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].region, 'bx/b');
  assert.equal(quakeAgeClass(NOW - 3_600_000, NOW), 'day');
  assert.equal(quakeAgeClass(NOW - 3 * 86_400_000, NOW), 'week');
  assert.equal(quakeAgeClass(NOW - 20 * 86_400_000, NOW), 'month');
  assert.ok(quakePixelSize(3, 'day') > quakePixelSize(3, 'month'));
  assert.ok(quakePixelSize(3, 'month') > quakePixelSize(2, 'month'));
  const card = buildQuakeCard({ ...rows[0], intensity: 'III' }, NOW);
  assert.equal(card.title, 'M2.4 earthquake');
  assert.ok(card.details.some((line) => line.includes('Sarajevo')));
  assert.ok(card.details.some((line) => line.includes('III MSK')));
  assert.ok(card.details.some((line) => line.includes('depth 7 km')));
});

test('mixed UTF-8 / Windows-1250 pages decode per line', () => {
  const utf8 = new TextEncoder().encode('ZABILJEŽENI\n');
  const cp1250 = Uint8Array.from([
    0x4c, 0x61, 0x6b, 0x74, 0x61, 0x9a, 0x69, 0x0a,
  ]); // "Laktaši"
  const bytes = new Uint8Array([...utf8, ...cp1250]);
  assert.equal(decodeMixedHtml(bytes), 'ZABILJEŽENI\nLaktaši\n');
});

function runProxy(plugin, url = '/') {
  let handler;
  plugin.configureServer({
    middlewares: { use: (_path, fn) => (handler = fn) },
  });
  return new Promise((resolve) => {
    handler(
      { method: 'GET', url, socket: { remoteAddress: 't' } },
      {
        writeHead(status) {
          this.status = status;
        },
        end(body) {
          resolve({ status: this.status, body: JSON.parse(body) });
        },
      },
    );
  });
}

test('proxy merges EMSC with FHMZ, caches, and survives an FHMZ outage', async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert.match(init.headers['User-Agent'], /GodsEyeView-BiH/);
    if (String(url).includes('seismicportal'))
      return new Response(JSON.stringify(EMSC), { status: 200 });
    return new Response('down', { status: 503 });
  };
  const plugin = baEarthquakesProxy({ fetchImpl, now: () => NOW });
  const first = await runProxy(plugin);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.sources, { emsc: true, fhmz: false });
  assert.equal(first.body.events.length, 2);
  const before = calls;
  await runProxy(plugin);
  // EMSC is cached; only the failed optional FHMZ source is retried.
  assert.equal(calls, before + 1);
});
