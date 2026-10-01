import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVodaStations,
  parseFhmzHydro,
  normalizeRhmzStations,
  transliterateSerbian,
  trendFromSeries,
  normalizeRiverSnapshot,
  classifyStation,
  buildStationCard,
  stationLabelText,
  vodaGraphUrl,
  SEVERITY,
} from './records.js';
import { baRiversProxy } from '../../../../server/providers/bosnia/rivers.js';

const NOW = Date.parse('2026-10-01T13:30:00Z');

const vodaRow = (
  no,
  cls,
  value = '25.7',
  ts = '2026-10-01T15:00:00.000+02:00',
) => ({
  metadata_station_name: `HS Station ${no}`,
  metadata_station_no: String(no),
  metadata_site_no: '4',
  metadata_station_latitude: '43.96558356471353',
  metadata_station_longitude: '18.256887847750523',
  metadata_river_name: 'Bosna',
  metadata_catchment_name: 'Bosna',
  L1_ts_value: value,
  L1_timestamp: ts,
  L1_web_waterlevel_class: cls,
});

const LEVEL = [
  vodaRow(4024, '#MIN#'),
  vodaRow(4025, '#TH2#', '412.0'),
  vodaRow(2103, '#TH1#', '78.1', '2026-07-29T09:00:00.000+02:00'),
  vodaRow(4145, null, null),
  { ...vodaRow(9999, '#MIN#'), metadata_station_latitude: '0' },
  vodaRow(4024, '#MIN#'),
];
const FLOW = [
  {
    metadata_station_no: '4024',
    L1_ts_value: '0.485',
    L1_timestamp: '2026-10-01T15:00:00.000+02:00',
    L1_web_flow_class: '#RP50#',
  },
];

const FHMZ_HTML = `
<table id="table">
  <tr><td rowspan="2">Vodotok</td><td>Vodomjerna stanica</td><td colspan="13">V O D O S T A J</td></tr>
  <tr bgcolor="#E9F3FC">
    <td rowspan="2" align="center">Una</td>
    <td align="left"><a href="javascript:show_agencije('boxes1')">Bihać</a></td>
    <td align="center">1.10.2026</td>
    <td align="center">08:00</td>
    <td align="center">118</td>
    <td align="center"><img src="../../slike/zajednicke/karata BIH/R.png" /></td>
    <td align="center">100</td>
  </tr>
  <tr bgcolor="#E9F3FC">
    <td align="left"><a href="javascript:show_agencije('boxes7')">Martin Brod</a></td>
    <td align="center"> 1.10.2026 </td>
    <td align="center"> 15:00 </td>
    <td align="center">41</td>
    <td align="center"><img src="../../slike/zajednicke/karata BIH/O.png" /></td>
    <td align="center">&nbsp;</td>
  </tr>
  <tr><td>Neretva</td><td><a>Konjic</a></td><td>1.10.2026</td><td>15:00</td><td>122</td><td><img src="x/S2.png" /></td><td>&nbsp;</td></tr>
  <tr><td>Nowhere</td><td><a>Atlantis</a></td><td>1.10.2026</td><td>15:00</td><td>1</td><td></td><td></td></tr>
</table>`;

const RHMZ = [
  {
    Вријеме: '2026-10-01T13:00:00',
    Станица:
      '<a href="https://hidrologija.rhmzrs.com/dist/examples/ahsBratunacVodostaj.php" target="_blank">Братунац - Дрина</a>',
    Водостај: 63,
    'Температура Воде': '*',
    Проток: '*',
    Lat: '44.20447',
    Lon: '19.35786',
  },
  {
    Вријеме: '',
    Станица: '<a href="https://evil.example/x.php">Фоча - Ћехотина</a>',
    Водостај: '-',
    Lat: '43.50472',
    Lon: '18.77972',
  },
  {
    Вријеме: '',
    Станица: '<a href="x">Фоча - Дрина</a>',
    Водостај: '-',
    Lat: '43.51584',
    Lon: '18.77805',
  },
];

test('voda.ba stations merge level + flow and keep the WISKI class', () => {
  const rows = normalizeVodaStations(LEVEL, FLOW);
  assert.equal(rows.length, 4);
  const first = rows[0];
  assert.equal(first.name, 'Station 4024');
  assert.equal(first.levelCm, 25.7);
  assert.equal(first.flowM3s, 0.485);
  assert.equal(first.levelClass, '#MIN#');
  assert.equal(first.flowClass, '#RP50#');
  assert.equal(first.link, vodaGraphUrl('4', '4024'));
  assert.equal(normalizeVodaStations({}), null);
  assert.equal(vodaGraphUrl('4/../x', '1'), null);
});

test('classification: thresholds, flow return periods, staleness', () => {
  const [normalWithFlood, overflow, stale, empty] = normalizeVodaStations(
    LEVEL,
    FLOW,
  );
  // Flow ≥ 1/50-year outranks the normal water-level class.
  assert.equal(
    classifyStation(normalWithFlood, NOW).severity,
    SEVERITY.REGULAR_DEFENCE,
  );
  const out = classifyStation(overflow, NOW);
  assert.equal(out.severity, SEVERITY.REGULAR_DEFENCE);
  assert.ok(out.alert);
  assert.match(out.label, /regular defence/);
  const old = classifyStation(stale, NOW);
  assert.equal(old.severity, SEVERITY.NO_DATA);
  assert.ok(old.stale);
  assert.equal(old.alert, false);
  assert.equal(classifyStation(empty, NOW).label, 'No current reading');
});

test('FHMZ table parses stations, trend, threshold and Sarajevo time', () => {
  const rows = parseFhmzHydro(FHMZ_HTML);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Bihać', 'Martin Brod', 'Konjic'],
  );
  const [bihac, mbrod, konjic] = rows;
  assert.equal(bihac.levelCm, 118);
  assert.equal(bihac.thresholdCm, 100);
  assert.equal(bihac.trend, 'rising');
  assert.equal(bihac.levelTime, Date.parse('2026-10-01T06:00:00Z'));
  assert.equal(mbrod.trend, 'falling');
  assert.equal(mbrod.thresholdCm, null);
  assert.equal(konjic.river, 'Neretva');
  assert.equal(konjic.trend, 'steady');
  const status = classifyStation(bihac, NOW);
  assert.equal(status.severity, SEVERITY.PREPAREDNESS);
  assert.match(status.label, /notification level/);
  assert.equal(stationLabelText(bihac), 'Una 118 cm ▲');
});

test('RHMZ RS feed transliterates, validates links and keeps same-name stations apart', () => {
  assert.equal(transliterateSerbian('Бања Лука - Врбас'), 'Banja Luka - Vrbas');
  assert.equal(
    transliterateSerbian('Шековићи - Дрињача'),
    'Šekovići - Drinjača',
  );
  const rows = normalizeRhmzStations(RHMZ);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, 'Bratunac');
  assert.equal(rows[0].river, 'Drina');
  assert.equal(rows[0].levelCm, 63);
  assert.equal(rows[0].levelTime, Date.parse('2026-10-01T11:00:00Z'));
  assert.equal(
    rows[0].link,
    'https://hidrologija.rhmzrs.com/dist/examples/ahsBratunacVodostaj.php',
  );
  assert.equal(
    rows[1].link,
    'https://www.rhmzrs.com/page/hidrologija-mapa-stanica',
  );
  assert.notEqual(rows[1].id, rows[2].id);
  assert.equal(classifyStation(rows[0], NOW).severity, SEVERITY.NO_THRESHOLDS);
  assert.equal(classifyStation(rows[1], NOW).severity, SEVERITY.NO_DATA);
  assert.equal(normalizeRhmzStations({}), null);
});

test('trend from the 7-day series compares ~3 h back', () => {
  const series = [
    {
      data: [
        ['2026-10-01T10:00:00.000+02:00', 30],
        ['2026-10-01T11:00:00.000+02:00', 31],
        ['2026-10-01T12:00:00.000+02:00', 33],
        ['2026-10-01T13:00:00.000+02:00', 36],
        ['2026-10-01T14:00:00.000+02:00', 40],
      ],
    },
  ];
  assert.deepEqual(trendFromSeries(series), {
    trend: 'rising',
    deltaCm: 9,
    hours: 3,
  });
  assert.equal(trendFromSeries([{ data: [] }]), null);
  assert.equal(trendFromSeries(null), null);
});

test('client snapshot validation drops bad rows and foreign links', () => {
  const rows = normalizeRiverSnapshot({
    stations: [
      {
        id: 'voda:1',
        name: 'A',
        lat: 44,
        lon: 18,
        levelCm: 10,
        levelClass: '#TH3#',
        link: 'https://vodostaji.voda.ba/x.png',
      },
      { id: 'x', name: 'B', lat: 44, lon: 18, link: 'javascript:alert(1)' },
      { id: 'y', lat: 10, lon: 18 },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].link, null);
  const card = buildStationCard({ ...rows[0], levelTime: NOW }, NOW, {
    trend: 'falling',
    deltaCm: -4,
    hours: 3,
  });
  assert.equal(card.status.severity, SEVERITY.EMERGENCY_DEFENCE);
  assert.ok(
    card.details.some((line) =>
      line.includes('Trend: falling ▼ (-4 cm / 3 h)'),
    ),
  );
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

test('proxy merges the three agencies and tolerates one being down', async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith('/layers/10/index.json'))
      return new Response('﻿' + JSON.stringify(LEVEL), { status: 200 });
    if (u.endsWith('/layers/20/index.json'))
      return new Response(JSON.stringify(FLOW));
    if (u.includes('fhmzbih')) return new Response(FHMZ_HTML);
    return new Response('nope', { status: 500 });
  };
  const res = await runProxy(baRiversProxy({ fetchImpl, now: () => NOW }));
  assert.equal(res.status, 200);
  assert.equal(res.body.sources.voda.count, 4);
  assert.equal(res.body.sources.fhmz.count, 3);
  assert.equal(res.body.sources.rhmz.ok, false);
  assert.equal(res.body.stations.length, 7);
  const bad = await runProxy(
    baRiversProxy({ fetchImpl, now: () => NOW }),
    '/trend?site=4&station=../1',
  );
  assert.equal(bad.status, 400);
});
