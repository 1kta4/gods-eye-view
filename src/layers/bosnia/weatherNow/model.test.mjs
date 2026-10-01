import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BA_TOWNS,
  normaliseOpenMeteo,
  openMeteoForecastUrl,
  temperatureColor,
  townCard,
  townLabel,
} from './model.js';
import { readWeatherNowPayload } from '../weatherNow.js';
import { parseRainViewerManifest, radarTileTemplate } from '../radar/model.js';
import { createWeatherProxies } from '../../../../server/providers/bosnia/weather.js';
import { effisProviderOptions, fwiForecastDate } from '../fireDanger.js';

const TOWNS = BA_TOWNS.slice(0, 2);
const current = (t) => ({
  latitude: 43.875,
  longitude: 18.375,
  utc_offset_seconds: 7200,
  elevation: 543,
  current: {
    time: '2026-10-01T15:30',
    temperature_2m: t,
    relative_humidity_2m: 27,
    apparent_temperature: t - 3,
    precipitation: 0.4,
    weather_code: 61,
    cloud_cover: 90,
    wind_speed_10m: 9,
    wind_direction_10m: 225,
    wind_gusts_10m: 16.9,
    snow_depth: 0.12,
    is_day: 1,
  },
});

test('one batched URL carries every town in order', () => {
  const url = new URL(openMeteoForecastUrl(BA_TOWNS));
  const lats = url.searchParams.get('latitude').split(',');
  assert.equal(lats.length, BA_TOWNS.length);
  assert.ok(BA_TOWNS.length >= 25);
  assert.equal(
    url.searchParams.get('elevation').split(',').length,
    BA_TOWNS.length,
  );
  assert.match(url.searchParams.get('current'), /snow_depth/);
  assert.ok(BA_TOWNS.some((t) => t.name === 'Bihać'));
});

test('Open-Meteo arrays normalise with air garnish and units', () => {
  const towns = normaliseOpenMeteo(
    [current(21), current(-4.6)],
    [{ current: { european_aqi: 30, pm2_5: 3.8, pm10: 5 } }, { current: {} }],
    TOWNS,
  );
  assert.equal(towns[0].name, 'Sarajevo');
  assert.equal(towns[0].temperature, 21);
  assert.equal(towns[0].snowDepthCm, 12);
  assert.equal(towns[0].observedAt, '2026-10-01T13:30:00.000Z');
  assert.equal(towns[0].europeanAqi, 30);
  assert.equal(towns[1].europeanAqi, null);
  assert.equal(townLabel(towns[1]), 'Banja Luka -5°');
  const card = townCard(towns[0]);
  assert.equal(card.title, 'Sarajevo · 21.0°C');
  assert.match(card.details[1], /Wind SW 9 km\/h/);
  assert.match(card.details[2], /snow 12 cm/);
  assert.match(card.details[3], /EAQI 30/);
  assert.throws(() => normaliseOpenMeteo([current(1)], null, TOWNS), /shape/);
});

test('temperature colours run cold-blue to hot-red', () => {
  assert.equal(temperatureColor(-30), '#5E3C99');
  assert.equal(temperatureColor(50), '#960028');
  assert.equal(temperatureColor(null), '#9AA0A6');
  assert.notEqual(temperatureColor(0), temperatureColor(25));
});

test('weather-now payload reader rejects empty payloads', () => {
  assert.throws(() => readWeatherNowPayload({ towns: [], error: 'x' }), /x/);
  const { items, stats } = readWeatherNowPayload({
    towns: [
      { id: 'a', lat: 1, lon: 1, temperature: 3.4 },
      { id: 'b', lat: 1, lon: 1, temperature: 18.6 },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(stats.loadingLabel, '3…19°C');
});

test('RainViewer manifest validation keeps recent, well-formed frames', () => {
  const now = 1790861134000;
  const { frames, latest } = parseRainViewerManifest(
    {
      host: 'https://tilecache.rainviewer.com',
      radar: {
        past: [
          { time: 1790860200, path: '/v2/radar/8d0d433d318c' },
          { time: 1790860800, path: '/v2/radar/92283ef917f5' },
          { time: 1790860800, path: '/../../evil' },
          { time: 1700000000, path: '/v2/radar/old' },
        ],
      },
    },
    now,
  );
  assert.equal(frames.length, 2);
  assert.equal(latest.path, '/v2/radar/92283ef917f5');
  assert.equal(
    radarTileTemplate(latest),
    'https://tilecache.rainviewer.com/v2/radar/92283ef917f5/256/{z}/{x}/{y}/2/1_1.png',
  );
  assert.throws(
    () => parseRainViewerManifest({ host: 'https://evil.example' }),
    /rainviewer_host/,
  );
});

test('EFFIS options request today’s FWI over BiH', () => {
  assert.equal(
    fwiForecastDate(Date.parse('2026-09-30T22:30:00Z')),
    '2026-10-01',
  );
  const options = effisProviderOptions('mf010.fwi', { time: '2026-10-01' });
  assert.equal(options.layers, 'mf010.fwi');
  assert.equal(options.parameters.time, '2026-10-01');
  assert.equal(options.parameters.transparent, true);
  assert.ok(options.rectangle.west < 15.8 && options.rectangle.east > 19.6);
});

function fakeResponse(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  });
}

async function callRoute(plugin, url = '/') {
  let handler;
  plugin.configureServer({
    middlewares: { use: (_path, fn) => (handler = fn) },
  });
  return new Promise((resolve) => {
    const res = {
      writableEnded: false,
      writeHead(status) {
        this.status = status;
      },
      end(body) {
        this.writableEnded = true;
        resolve({ status: this.status, body: JSON.parse(body) });
      },
    };
    handler({ method: 'GET', url, socket: { remoteAddress: 't' } }, res);
  });
}

test('warnings proxy returns count 0 for an empty feed and caches', async () => {
  let calls = 0;
  const [, warnings] = createWeatherProxies({
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(init.redirect, 'error');
      assert.match(init.headers['User-Agent'], /GodsEyeView-BiH/);
      assert.match(String(url), /meteoalarm-legacy-atom-bosnia-herzegovina/);
      return fakeResponse(
        '<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-10-01T13:05:10Z</updated></feed>',
      );
    },
  });
  const first = await callRoute(warnings);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.warnings, []);
  assert.equal(first.body.error, null);
  await callRoute(warnings);
  assert.equal(calls, 1);
  assert.equal((await callRoute(warnings, '/other')).status, 404);
});

test('weather proxy survives an air-quality failure and reports upstream errors', async () => {
  const [now] = createWeatherProxies({
    fetchImpl: async (url) =>
      String(url).includes('air-quality')
        ? fakeResponse('nope', 500)
        : fakeResponse(BA_TOWNS.map((_, i) => current(i))),
  });
  const ok = await callRoute(now);
  assert.equal(ok.body.towns.length, BA_TOWNS.length);
  assert.equal(ok.body.towns[0].europeanAqi, null);

  const [down] = createWeatherProxies({
    fetchImpl: async () => fakeResponse('x', 503),
  });
  const failed = await callRoute(down);
  assert.equal(failed.status, 200);
  assert.deepEqual(failed.body.towns, []);
  assert.match(failed.body.error, /upstream_http_503/);
});
