import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crossingKey,
  durationsInMinutes,
  formatWait,
  headlineWaitMinutes,
  htmlToText,
  parseBihamkConditionsPage,
  parseBihamkCrossingsPage,
  parseWaitText,
  sarajevoLocalToIso,
  waitBand,
} from './bihamk.js';

// Trimmed from https://bihamk.ba/spi/stanje-na-cesti-u-bih/granicni-prijelazi
// (2026-10-01): the report cards plus the map's marker list.
const CROSSINGS_PAGE = `
<span class="text-black text-xs font-bold">Stanje na cestama <time datetime="2026-10-01 13:31:24">01.10.2026. u 13:31</time> sati</span>
<div x-show="activeTab === 'tabHome'" class="grid gap-2 mt-5">
  <article class="w-full flex flex-col relative  bg-white p-5">
    <h3 class="text-sm font-bold">
        GP Velika Kladu&scaron;a
    </h3>
    <div class="text-[10px] font-medium mt-2"> <p><span>Zadržavanja putničkih vozila nisu duža od 30 minuta.</span></p></div>
  </article>
  <article class="w-full flex flex-col relative  bg-white p-5">
    <h3 class="text-sm font-bold">
        GP  Novi Grad
    </h3>
    <div class="text-[10px] font-medium mt-2"> <p>Putnička vozila na izlazu iz BiH čekaju oko 1 sat, a teretna do 3 sata.</p></div>
  </article>
  <article class="w-full flex flex-col relative  bg-white p-5">
    <h3 class="text-sm font-bold">GP Šepak</h3>
    <div class="text-[10px] font-medium mt-2"><p>Zadržavanja putničkih vozila nisu duža od 30 minuta.</p>
    <p>Na graničnom prelazu Šepak zabranjen je saobraćaj za sva teretna vozila.</p></div>
  </article>
  <article class="w-full flex flex-col relative  bg-white p-5">
    <h3 class="text-sm font-bold">GP Brčko</h3>
    <div><p>Granični prelaz Brčko od 19.06.2025. godine otvoren je za putnička vozila do 3,5 tone.</p><script>alert(1)</script><img src=x onerror=alert(1)></div>
  </article>
</div>
<script>
  const properties = [{"name":"GP Velika Kladu\\u0161a","position":{"lat":45.195473892239,"lng":15.792626916748},"text":"Zadr\\u017eavanja putni\\u010dkih vozila nisu du\\u017ea od 30 minuta.","icon":"granicni_prelazi","road":null},{"name":"GP  Novi Grad","position":{"lat":45.049520637057,"lng":16.373271524292},"text":"x [y] {z}","icon":"granicni_prelazi","road":null}];
</script>`;

test('crossingKey normalises BIHAMK names to dataset keys', () => {
  assert.equal(crossingKey('GP  Novi Grad'), 'novi-grad');
  assert.equal(crossingKey('GP Šamac'), 'samac');
  assert.equal(crossingKey('Granični prelaz Hadžin Potok'), 'hadzin-potok');
  assert.equal(crossingKey('GP Gradiška - novi most'), 'gradiska-novi-most');
  assert.equal(crossingKey('GP Neum II'), 'neum-ii');
});

test('sarajevoLocalToIso honours CEST and CET', () => {
  assert.equal(
    sarajevoLocalToIso('2026-10-01 13:31:24'),
    '2026-10-01T11:31:24.000Z',
  );
  assert.equal(
    sarajevoLocalToIso('2026-01-15 08:00'),
    '2026-01-15T07:00:00.000Z',
  );
  assert.equal(sarajevoLocalToIso('yesterday'), null);
});

test('htmlToText strips markup, scripts and entities', () => {
  assert.equal(
    htmlToText('<p>A &amp; B<script>evil()</script></p><p>&lt;b&gt;x</p>'),
    'A & B\nbx',
  );
  assert.ok(!/[<>]/.test(htmlToText('<img src=x onerror=alert(1)>1 < 2')));
});

test('parseBihamkCrossingsPage reads cards, coordinates and timestamp', () => {
  const page = parseBihamkCrossingsPage(CROSSINGS_PAGE);
  assert.equal(page.updatedAt, '2026-10-01T11:31:24.000Z');
  assert.deepEqual(
    page.crossings.map((row) => row.key),
    ['velika-kladusa', 'novi-grad', 'sepak', 'brcko'],
  );
  const [kladusa, noviGrad, sepak, brcko] = page.crossings;
  assert.equal(kladusa.name, 'Velika Kladuša');
  assert.equal(kladusa.lat, 45.195473892239);
  assert.equal(noviGrad.lon, 16.373271524292);
  assert.equal(sepak.lat, null);
  assert.equal(kladusa.wait.cars, 30);
  assert.equal(kladusa.wait.upTo, true);
  assert.equal(noviGrad.wait.cars, 60);
  assert.equal(noviGrad.wait.trucks, 180);
  assert.equal(noviGrad.wait.exit, 180);
  assert.equal(sepak.wait.truckBan, true);
  assert.equal(brcko.wait.cars, null, 'weight limit is not a wait');
  assert.ok(!/[<>]|alert/.test(brcko.text));
});

test('parseBihamkCrossingsPage falls back to the map marker list', () => {
  const page = parseBihamkCrossingsPage(
    CROSSINGS_PAGE.replace(/<article[\s\S]*<\/article>/, ''),
  );
  assert.deepEqual(
    page.crossings.map((row) => row.name),
    ['Velika Kladuša', 'Novi Grad'],
  );
  assert.equal(page.crossings[1].text, 'x [y] {z}');
});

test('parseBihamkCrossingsPage tolerates junk', () => {
  assert.deepEqual(parseBihamkCrossingsPage(''), {
    updatedAt: null,
    crossings: [],
  });
  assert.deepEqual(
    parseBihamkCrossingsPage('const properties = [{"name":').crossings,
    [],
  );
});

test('durationsInMinutes covers hours, minutes and words', () => {
  assert.deepEqual(durationsInMinutes('do 30 minuta'), [30]);
  assert.deepEqual(durationsInMinutes('oko 1 sat i 30 minuta'), [90]);
  assert.deepEqual(durationsInMinutes('sat i po'), []);
  assert.deepEqual(durationsInMinutes('jedan sat i po'), [90]);
  assert.deepEqual(durationsInMinutes('dva sata'), [120]);
  assert.deepEqual(durationsInMinutes('pola sata'), [30]);
  assert.deepEqual(durationsInMinutes('od 10 do 30 minuta'), [30]);
  assert.deepEqual(durationsInMinutes('1,5 h'), [90]);
  assert.deepEqual(durationsInMinutes('u 13:30 sati'), []);
});

test('parseWaitText splits vehicle classes and directions', () => {
  const wait = parseWaitText(
    'Na ulazu u BiH putnička vozila čekaju 45 minuta, a teretna oko 2 sata. Na izlazu iz BiH autobusi čekaju 20 min.',
  );
  assert.equal(wait.cars, 45);
  assert.equal(wait.trucks, 120);
  assert.equal(wait.buses, 20);
  assert.equal(wait.entry, 120);
  assert.equal(wait.exit, 20);
  assert.equal(wait.upTo, false);
});

test('parseWaitText flags no-delay, closures and opening hours', () => {
  assert.equal(parseWaitText('Nema zadržavanja.').noDelay, true);
  assert.equal(headlineWaitMinutes(parseWaitText('Bez čekanja.')), 0);
  assert.equal(
    parseWaitText('Granični prelaz je zatvoren zbog radova.').closed,
    true,
  );
  const hours = parseWaitText('Granični prelaz radi od 08 do 20 sati.');
  assert.equal(headlineWaitMinutes(hours), null);
  const general = parseWaitText('Kolone vozila, čeka se do 3 sata.');
  assert.equal(general.general, 180);
  assert.equal(headlineWaitMinutes(general), 180);
});

test('waitBand colours by the published thresholds', () => {
  assert.equal(waitBand(10).id, 'short');
  assert.equal(waitBand(30, { upTo: true }).id, 'short');
  assert.equal(waitBand(30).id, 'moderate');
  assert.equal(waitBand(60).id, 'moderate');
  assert.equal(waitBand(90).id, 'long');
  assert.equal(waitBand(121).id, 'severe');
  assert.equal(waitBand(null).id, 'unknown');
  assert.equal(formatWait(30, { upTo: true }), '≤30 min');
  assert.equal(formatWait(90), '1 h 30 min');
  assert.equal(formatWait(0), 'no delay');
});

const CONDITIONS_PAGE = `
<span>Stanje na cestama <time datetime="2026-10-01 13:31:24">01.10.2026. u 13:31</time> sati</span>
<div class="mt-5 bg-white p-5 lg:p-10"><h2 class="font-bold text-2xl">Izvještaj</h2>
<div class="text-editor mt-5"><p><!--StartFragment --></p>
<p><strong>Pojačan je promet vozila na prilazima gradovima.</strong></p>
<p>Za saobraćaj svih vozila zatvorena je dionica autoceste <span style="color:#ff0000"><strong>A-1 Kakanj-Lašva</strong></span>, a saobraćaj je preusmjeren.</p>
<p><a href="https://bihamk.ba/vijesti/x" onclick="evil()">EES &ndash; moguća su duža zadržavanja.</a></p>
<p></p></div>
<h3 class="text-xl font-bold mt-5 lg:mt-10">Audio izvještaj</h3><p>Stanje na cestama 13:30</p>`;

test('parseBihamkConditionsPage returns escaped plain paragraphs', () => {
  const report = parseBihamkConditionsPage(CONDITIONS_PAGE);
  assert.equal(report.updatedAt, '2026-10-01T11:31:24.000Z');
  assert.deepEqual(report.paragraphs, [
    'Pojačan je promet vozila na prilazima gradovima.',
    'Za saobraćaj svih vozila zatvorena je dionica autoceste A-1 Kakanj-Lašva, a saobraćaj je preusmjeren.',
    'EES – moguća su duža zadržavanja.',
  ]);
  assert.deepEqual(parseBihamkConditionsPage('<html></html>').paragraphs, []);
});
