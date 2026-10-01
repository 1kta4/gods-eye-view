import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  airStationCard,
  eaqiLevelFor,
  eaqiOverall,
  mergeAirStations,
  parseFhmzTable,
  parseRhmzRs,
  parseSensorCommunity,
  parseWaqiBounds,
  sarajevoLocalToIso,
} from './model.js';
import { readAirPayload } from '../airQuality.js';

const TABLE = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../data/local_data/bosnia/air/fhmz-stations.json',
      import.meta.url,
    ),
  ),
).stations;

// Trimmed from the real page (2026-10-01 15 h), including its quirks: an
// unclosed AQI cell, `colspan="2"` gaps and `#` for invalid values.
const FHMZ_HTML = `
<td colspan="15" class="naslov">SATNE VRIJEDNOSTI POLUTANATA (µg/m³) I INDEX KVALITETA ZRAKA 1.1.2026. - 9<sup>h</sup></td>
<tr>
  <td rowspan="9" class="desna">SARAJEVO</td>
  <td class="desna"><a href="amsVijecnica.php">Vijećnica</a></td>
  <td class="IKZ desna"><img src="index/f.png" /></td>
  <td >#</td><td class="desna"><img src="index/b.png" /></td>
  <td >4</td><td class="desna"><img src="index/b.png" /></td>
  <td class="nema" colspan="2">&nbsp;</td>
  <td>119</td><td class="desna"><img src="index/e.png"/></td>
  <td>88</td><td class="desna"><img src="index/f.png"/></td>
  <td class="desna">1700</td>
  <td class="nema">&nbsp;</td>
</tr>
<tr>
  <td class="desna"><a href="amsIlidza.php">Ilidža</a></td>
  <td class="IKZ desna"><img src="index/c.png" />
  <td>5</td><td class="desna"><img src="index/b.png" /></td>
  <td>19</td><td class="desna"><img src="index/c.png" /></td>
  <td>#</td><td class="desna"><img src="index/a.png" /></td>
  <td>13</td><td class="desna"><img src="index/b.png" /></td>
  <td>6</td><td class="desna"><img src="index/c.png" /></td>
  <td class="desna">#</td><td >#</td>
</tr>
<tr>
  <td class="desna"><a href="amsNovaStanica.php">Nova</a></td>
  <td class="IKZ desna"><img src="index/b.png" /></td>
  <td>1</td><td><img src="index/b.png" /></td><td>1</td><td><img src="index/b.png" /></td>
  <td>1</td><td><img src="index/b.png" /></td><td>1</td><td><img src="index/b.png" /></td>
  <td>1</td><td><img src="index/b.png" /></td><td>1</td><td>1</td>
</tr>
<table><tr><td><a href="amsVijecnica.php">Vijećnica</a></td></tr></table>`;

test('EAQI breakpoints grade pollutants into six European bands', () => {
  assert.equal(eaqiLevelFor('pm25', 9.9), 1);
  assert.equal(eaqiLevelFor('pm25', 10), 2);
  assert.equal(eaqiLevelFor('pm25', 80), 6);
  assert.equal(eaqiLevelFor('pm10', 45), 3);
  assert.equal(eaqiLevelFor('co', 5), null);
  assert.equal(eaqiOverall({ pm25: 12, no2: 250 }), 5);
  assert.equal(eaqiOverall({}), null);
});

test('Sarajevo wall clock converts across CET and CEST', () => {
  assert.equal(sarajevoLocalToIso(2026, 10, 1, 15), '2026-10-01T13:00:00.000Z');
  assert.equal(sarajevoLocalToIso(2026, 1, 1, 9), '2026-01-01T08:00:00.000Z');
});

test('FHMZ table parses values, per-pollutant levels and the reported AQI', () => {
  const { observedAt, stations, unknown } = parseFhmzTable(FHMZ_HTML, TABLE);
  assert.equal(observedAt, '2026-01-01T08:00:00.000Z');
  assert.deepEqual(unknown, ['amsNovaStanica']);
  assert.equal(stations.length, 2);
  const [vijecnica, ilidza] = stations;
  assert.equal(vijecnica.id, 'fhmz:amsVijecnica');
  assert.equal(vijecnica.name, 'Sarajevo — Vijećnica');
  assert.equal(vijecnica.official, true);
  assert.equal(vijecnica.level, 5);
  assert.equal(vijecnica.levelSource, 'reported');
  assert.deepEqual(vijecnica.pollutants, {
    no2: 4,
    pm10: 119,
    pm25: 88,
    co: 1700,
  });
  assert.equal(vijecnica.levels.pm25, 5);
  // The unclosed AQI cell must not shift the columns.
  assert.deepEqual(ilidza.pollutants, { so2: 5, no2: 19, pm10: 13, pm25: 6 });
  assert.equal(ilidza.level, 2);
  assert.ok(Math.abs(vijecnica.lat - 43.859) < 1e-6);
});

test('FHMZ parser rejects non-text input', () => {
  assert.throws(() => parseFhmzTable(null, TABLE), /fhmz_invalid/);
});

test('RHMZ RS feed normalises values, CO units and the reported index', () => {
  const { stations } = parseRhmzRs({
    trenutni: {
      Banjaluka: {
        vrijeme: '01.10.2026 15:00:00',
        stanica: 'Бања Лука',
        O3: 92,
        CO: 0.3,
        SO2: 43,
        NO2: 16,
        PM10: 23,
        'PM2.5': 14,
        H2S: '*',
        Lat: '44.79804',
        Lon: '17.20496',
      },
      Doboj: { vrijeme: 'x', PM10: '-', Lat: '44.72629', Lon: '18.08894' },
      Faraway: { Lat: '51.5', Lon: '0.1' },
    },
    indeks: {
      Banjaluka: { indeks: [3, 3], 'PM2.5': [2, 2] },
      Doboj: { indeks: '-' },
    },
  });
  assert.equal(stations.length, 2);
  const [bl, doboj] = stations;
  assert.equal(bl.name, 'Banja Luka');
  assert.equal(bl.level, 3);
  assert.equal(bl.pollutants.co, 300);
  assert.equal(bl.pollutants.h2s, undefined);
  assert.equal(bl.observedAt, '2026-10-01T13:00:00.000Z');
  assert.equal(doboj.level, null);
  assert.equal(doboj.observedAt, null);
  assert.throws(() => parseRhmzRs({}), /rhmzrs_invalid/);
});

test('Sensor.Community groups by location, skips indoor and non-PM sensors', () => {
  const loc = (id, extra = {}) => ({
    id,
    latitude: '43.85',
    longitude: '18.40',
    indoor: 0,
    ...extra,
  });
  const { stations } = parseSensorCommunity([
    {
      timestamp: '2026-10-01 13:26:52',
      sensordatavalues: [
        { value_type: 'P1', value: '40.0' },
        { value_type: 'P2', value: '30.0' },
      ],
      sensor: { sensor_type: { name: 'SDS011' } },
      location: loc(1),
    },
    {
      timestamp: '2026-10-01 13:27:52',
      sensordatavalues: [
        { value_type: 'P1', value: '60.0' },
        { value_type: 'P2', value: '50.0' },
      ],
      location: loc(1),
    },
    {
      sensordatavalues: [{ value_type: 'temperature', value: '20' }],
      location: loc(2),
    },
    {
      sensordatavalues: [{ value_type: 'P2', value: '5' }],
      location: loc(3, { indoor: 1 }),
    },
  ]);
  assert.equal(stations.length, 1);
  assert.equal(stations[0].official, false);
  assert.deepEqual(stations[0].pollutants, { pm10: 50, pm25: 40 });
  assert.equal(stations[0].level, 4);
  assert.equal(stations[0].observedAt, '2026-10-01T13:27:52.000Z');
});

test('WAQI rows near an official station are dropped as duplicates', () => {
  const { stations: waqi } = parseWaqiBounds({
    status: 'ok',
    data: [
      {
        lat: 43.859,
        lon: 18.4349,
        uid: 1,
        aqi: '80',
        station: { name: 'Dup' },
      },
      { lat: 44.77, lon: 17.19, uid: 2, aqi: '-', station: { name: 'BL' } },
    ],
  });
  const official = [
    { id: 'fhmz:x', lat: 43.859, lon: 18.4348, official: true },
  ];
  const merged = mergeAirStations({ official, secondary: waqi });
  assert.deepEqual(
    merged.map((s) => s.id),
    ['fhmz:x', 'waqi:2'],
  );
  assert.equal(waqi[1].level, null);
});

test('station card copy names pollutants, source and time', () => {
  const { stations } = parseFhmzTable(FHMZ_HTML, TABLE);
  const card = airStationCard(stations[0]);
  assert.match(card.title, /Vijećnica · Very poor \(5\)/);
  assert.match(card.details[0], /PM2\.5 88 · PM10 119 · NO₂ 4 µg\/m³/);
  assert.match(card.details.at(-1), /FHMZ .* 01\/01, 09:00/);
});

test('proxy payload reader reports citizen/official split and failures', () => {
  const { items, stats } = readAirPayload({
    sources: { fhmz: { ok: true }, rhmzrs: { ok: false, error: 'x' } },
    stations: [
      { id: 'a', lat: 1, lon: 1, official: true, level: 4 },
      { id: 'b', lat: 1, lon: 1, official: false, level: 1 },
      { id: 'bad' },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(stats.countLabel, '1 official · 1 citizen');
  assert.equal(stats.degraded, true);
  assert.match(stats.loadingLabel, /RHMZ RS unavailable/);
  assert.throws(
    () => readAirPayload({ sources: { fhmz: { ok: false } }, stations: [] }),
    /FHMZ unavailable/,
  );
});

test('air proxy merges sources, keeps the WAQI token server-side', async () => {
  const { createAirProxy } =
    await import('../../../../server/providers/bosnia/air.js');
  const seen = [];
  const plugin = createAirProxy({
    env: {},
    fetchImpl: async (url) => {
      seen.push(String(url));
      if (String(url).includes('fhmzbih')) return new Response(FHMZ_HTML);
      if (String(url).includes('rhmzrs'))
        return new Response('down', { status: 502 });
      return new Response('[]');
    },
  });
  let handler;
  plugin.configureServer({ middlewares: { use: (_p, fn) => (handler = fn) } });
  const body = await new Promise((resolve) => {
    handler(
      { method: 'GET', url: '/', socket: { remoteAddress: 't' } },
      {
        writableEnded: false,
        writeHead() {},
        end(text) {
          resolve(JSON.parse(text));
        },
      },
    );
  });
  assert.equal(body.stations.length, 2);
  assert.equal(body.sources.fhmz.ok, true);
  assert.equal(body.sources.rhmzrs.ok, false);
  assert.equal(body.sources.sensorCommunity.count, 0);
  assert.equal(body.sources.waqi.disabled, true);
  assert.ok(seen.every((u) => !u.includes('waqi')));
});
