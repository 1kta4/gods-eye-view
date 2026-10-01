import test from 'node:test';
import assert from 'node:assert/strict';
import {
  borderArc,
  parseAd217Ctr,
  parseCircle,
  parseCoordinates,
  parseEnr21Tmas,
  parseEnr51,
  parseLimit,
  parseVerticalPair,
} from './aip.js';
import {
  airportsFromRows,
  normalizeAirspace,
  parseCsv,
  extrusionFor,
  airspaceCard,
} from './model.js';

test('coordinates: plain, decimal seconds and no separator', () => {
  const [a, b, c] = parseCoordinates(
    '434714N 0182102E; 432144.98N 0174901.02E 443547N0190618E',
  );
  assert.deepEqual(a, [18.350556, 43.787222]);
  assert.equal(b[1].toFixed(5), '43.36249');
  assert.deepEqual(c, [19.105, 44.596389]);
});

test('vertical limits', () => {
  assert.deepEqual(parseLimit('FL 250'), {
    text: 'FL 250',
    meters: 7620,
    ref: 'FL',
  });
  assert.equal(parseLimit('9500 FT AMSL').meters, 2896);
  assert.equal(parseLimit('2300 FT ALT').ref, 'MSL');
  assert.equal(parseLimit('1400 FT AMLS').ref, 'MSL');
  assert.equal(parseLimit('1000 FT AGL').ref, 'AGL');
  assert.equal(parseLimit('GND').meters, 0);
  assert.equal(parseLimit('bogus'), null);
  assert.equal(parseVerticalPair('FL 310 / GND').upper.text, 'FL 310');
});

test('circle areas', () => {
  const c = parseCircle('A circle radius 1.00 KM centered on 425223N 0182415E');
  assert.equal(c.radiusM, 1000);
  assert.equal(c.ring.length, 49);
  assert.deepEqual(c.ring[0], c.ring.at(-1));
  assert.equal(
    Math.round(
      parseCircle('A circle radius 0.10 NM centered on 434714N 0182102E')
        .radiusM * 10,
    ),
    1852,
  );
});

const ENR51 = `<table><tbody>
<tr id="a"><td><strong id="x">LQP1 ISTOCNA ILIDZA</strong><br id="y"/>A circle radius 0.10 NM centered on 434714N 0182102E</td><td>2300 FT ALT / GND</td><td>Permanently active - H24</td></tr>
<tr id="b"><td><strong>LQD19 GLAMOC</strong><p class="Cell-body">441010N 0165248E - 440741N 0165154E - 440542N 0165428E - 441010N 0165248E</p></td><td>9500 FT AMSL <span>/</span> GND</td><td><p>Medium ALT live firing range.</p></td></tr>
<tr id="c"><td><p><strong>LQR3 MANJACA HIGH</strong></p><p>443640N 0170355E - 443845N 0170618E - 444118N 0170305E - 443640N 0170355E</p></td><td>FL 250<span> / GND</span></td><td>AMC manageable area.</td></tr>
<tr id="d"><td>no ident here</td><td>FL 100 / GND</td></tr>
</tbody></table>`;

test('ENR 5.1 rows → prohibited / restricted / danger areas', () => {
  const areas = parseEnr51(ENR51);
  assert.deepEqual(
    areas.map((a) => `${a.ident}:${a.type}`),
    ['LQP1:prohibited', 'LQD19:danger', 'LQR3:restricted'],
  );
  assert.equal(areas[0].upper.meters, 701);
  assert.equal(areas[1].name, 'GLAMOC');
  assert.equal(areas[1].ring.length, 4);
  assert.equal(areas[2].upper.text, 'FL 250');
  assert.match(areas[1].remarks, /firing range/);
});

test('border arcs take the shorter way round', () => {
  const border = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
    [0, 0],
  ];
  assert.deepEqual(borderArc(border, [0.9, 0.05], [2, 1.05]), [[2, 0]]);
  assert.deepEqual(borderArc(border, [2, 1], [1, 0]), [[2, 0]]);
});

test('ENR 2.1 TMA with an along-the-boundary segment', () => {
  const border = [
    [17, 45],
    [17.5, 45.2],
    [18, 45],
    [18, 44],
    [17, 44],
    [17, 45],
  ];
  const html = `<p>BANJA LUKA TMA (outside of BANJA LUKA CTR), are defined by the following coordinates:
  442214N 0174535E; 445902N 0175810E; Along Zagreb FIR /Sarajevo FIR boundary; 450749N 0170000E; 442214N 0174535E.</p>
  <p>Upper Limit: FL 125</p><p>Lower Limit: 1000 FT AGL</p><p>Classification: Class E*</p>`;
  const [tma] = parseEnr21Tmas(html, border);
  assert.equal(tma.name, 'BANJA LUKA TMA');
  assert.equal(tma.upper.text, 'FL 125');
  assert.equal(tma.lower.ref, 'AGL');
  assert.equal(tma.airspaceClass, 'E');
  assert.ok(
    tma.ring.some(([x, y]) => x === 17.5 && y === 45.2),
    'follows the border vertex',
  );
  assert.deepEqual(tma.ring[0], tma.ring.at(-1));
});

test('AD 2.17 CTR', () => {
  const html = `LQSA AD 2.17 ATS Airspace 1 Designation and lateral limits SARAJEVO CTR 435500N 0175700E; 440000N 0180100E; 435500N 0181900E; 435500N 0175700E. 2 Vertical limits GND - 6500 FT AMSL 3 Airspace classification D 4 ATS unit`;
  const ctr = parseAd217Ctr(html);
  assert.equal(ctr.name, 'SARAJEVO CTR');
  assert.equal(ctr.upper.meters, 1981);
  assert.equal(ctr.airspaceClass, 'D');
  assert.equal(parseAd217Ctr('nothing'), null);
});

test('OurAirports CSV parsing and filtering', () => {
  const csv =
    '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","iso_country","municipality","scheduled_service","icao_code","iata_code","gps_code"\r\n' +
    '4469,"LQSA","large_airport","Sarajevo International Airport",43.8246,18.331499,1708,"BA","Sarajevo","yes","LQSA","SJJ","LQSA"\n' +
    '1,"X","small_airport","Elsewhere, ""quoted""",1,2,,"HR","","no","","",""\n' +
    '2,"BA-1","heliport","Bad",,18,,"BA","","no","","",""\n';
  const rows = parseCsv(csv);
  assert.equal(rows[1].name, 'Elsewhere, "quoted"');
  const airports = airportsFromRows(rows, 'BA');
  assert.equal(airports.length, 1);
  assert.equal(airports[0].iata, 'SJJ');
  assert.equal(airports[0].scheduled, true);
});

test('airspace normaliser, extrusion and card', () => {
  const [area] = normalizeAirspace({
    features: [
      {
        properties: {
          ident: 'LQR3',
          name: 'MANJACA HIGH',
          type: 'restricted',
          upper: { text: 'FL 250', meters: 7620, ref: 'FL' },
          lower: { text: 'GND', meters: 0, ref: 'GND' },
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [17, 44],
              [17.1, 44],
              [17.1, 44.1],
              [17, 44],
            ],
          ],
        },
      },
      { properties: { type: 'unknown' }, geometry: null },
    ],
  });
  assert.deepEqual(extrusionFor(area), { lower: 0, upper: 7620 });
  const card = airspaceCard(area);
  assert.equal(card.title, 'LQR3 MANJACA HIGH');
  assert.ok(card.details.some((d) => /not for navigation/.test(d)));
});
