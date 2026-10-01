import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BA_EIC,
  buildEntsoeRequests,
  entsoePeriod,
  entsoeUrl,
  normaliseLivePayload,
  parseEntsoeXml,
  redactToken,
  summariseFlow,
  summariseGeneration,
  summariseLoad,
  NEIGHBOURS,
} from './entsoe.js';
import { createPowerLiveHandler } from '../../../../server/providers/bosnia/power.js';

const LOAD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<GL_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-6:generationloaddocument:3:0">
  <mRID>abc</mRID>
  <TimeSeries>
    <mRID>1</mRID>
    <outBiddingZone_Domain.mRID codingScheme="A01">10YBA-JPCC-----D</outBiddingZone_Domain.mRID>
    <Period>
      <timeInterval><start>2026-10-01T10:00Z</start><end>2026-10-01T13:00Z</end></timeInterval>
      <resolution>PT60M</resolution>
      <Point><position>1</position><quantity>1180</quantity></Point>
      <Point><position>2</position><quantity>1215.5</quantity></Point>
      <Point><position>3</position><quantity>1240</quantity></Point>
    </Period>
  </TimeSeries>
</GL_MarketDocument>`;

const GEN_XML = `<ns:GL_MarketDocument xmlns:ns="urn:x">
  <ns:TimeSeries>
    <ns:inBiddingZone_Domain.mRID codingScheme="A01">10YBA-JPCC-----D</ns:inBiddingZone_Domain.mRID>
    <ns:MktPSRType><ns:psrType>B02</ns:psrType></ns:MktPSRType>
    <ns:Period>
      <ns:timeInterval><ns:start>2026-10-01T11:00Z</ns:start><ns:end>2026-10-01T13:00Z</ns:end></ns:timeInterval>
      <ns:resolution>PT60M</ns:resolution>
      <ns:Point><ns:position>1</ns:position><ns:quantity>700</ns:quantity></ns:Point>
      <ns:Point><ns:position>2</ns:position><ns:quantity>710</ns:quantity></ns:Point>
    </ns:Period>
  </ns:TimeSeries>
  <ns:TimeSeries>
    <ns:inBiddingZone_Domain.mRID codingScheme="A01">10YBA-JPCC-----D</ns:inBiddingZone_Domain.mRID>
    <ns:MktPSRType><ns:psrType>B12</ns:psrType></ns:MktPSRType>
    <ns:Period>
      <ns:timeInterval><ns:start>2026-10-01T11:00Z</ns:start><ns:end>2026-10-01T13:00Z</ns:end></ns:timeInterval>
      <ns:resolution>PT60M</ns:resolution>
      <ns:Point><ns:position>1</ns:position><ns:quantity>400</ns:quantity></ns:Point>
      <ns:Point><ns:position>2</ns:position><ns:quantity>n/a</ns:quantity></ns:Point>
    </ns:Period>
  </ns:TimeSeries>
  <ns:TimeSeries>
    <ns:outBiddingZone_Domain.mRID codingScheme="A01">10YBA-JPCC-----D</ns:outBiddingZone_Domain.mRID>
    <ns:MktPSRType><ns:psrType>B10</ns:psrType></ns:MktPSRType>
    <ns:Period>
      <ns:timeInterval><ns:start>2026-10-01T11:00Z</ns:start><ns:end>2026-10-01T13:00Z</ns:end></ns:timeInterval>
      <ns:resolution>PT60M</ns:resolution>
      <ns:Point><ns:position>2</ns:position><ns:quantity>200</ns:quantity></ns:Point>
    </ns:Period>
  </ns:TimeSeries>
</ns:GL_MarketDocument>`;

const flowXml = (mw) => `<Publication_MarketDocument xmlns="urn:y">
  <TimeSeries>
    <Period>
      <timeInterval><start>2026-10-01T11:00Z</start><end>2026-10-01T12:00Z</end></timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>1</position><quantity>${mw - 10}</quantity></Point>
      <Point><position>4</position><quantity>${mw}</quantity></Point>
      <Point><position>5</position><quantity>9999</quantity></Point>
    </Period>
  </TimeSeries>
</Publication_MarketDocument>`;

const ACK_XML = `<?xml version="1.0"?>
<Acknowledgement_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-1:acknowledgementdocument:7:0">
  <Reason><code>999</code><text>No matching data found for Data item <script>x</script></text></Reason>
</Acknowledgement_MarketDocument>`;

test('entsoePeriod formats UTC yyyyMMddHHmm on the hour', () => {
  assert.equal(entsoePeriod(Date.UTC(2026, 9, 1, 7, 42)), '202610010700');
});

test('buildEntsoeRequests asks for load, generation and both flow directions per neighbour', () => {
  const requests = buildEntsoeRequests(Date.UTC(2026, 9, 1, 12, 5));
  assert.equal(requests.length, 2 + NEIGHBOURS.length * 2);
  const load = requests.find((r) => r.key === 'load');
  assert.equal(load.params.documentType, 'A65');
  assert.equal(load.params.outBiddingZone_Domain, BA_EIC);
  assert.equal(load.params.periodEnd, '202610011300');
  assert.equal(load.params.periodStart, '202609301000');
  const imp = requests.find((r) => r.key === 'import:HR');
  assert.equal(imp.params.in_Domain, BA_EIC);
  assert.equal(imp.params.out_Domain, '10YHR-HEP------M');
  const exp = requests.find((r) => r.key === 'export:HR');
  assert.equal(exp.params.out_Domain, BA_EIC);
  for (const r of requests) assert.equal(r.params.securityToken, undefined);
});

test('entsoeUrl carries the token and redactToken removes it', () => {
  const url = entsoeUrl({ documentType: 'A65' }, 'secret-123');
  assert.match(url, /securityToken=secret-123/);
  assert.equal(
    redactToken(`failed ${url}`, 'secret-123').includes('secret-123'),
    false,
  );
});

test('parseEntsoeXml reads a namespaced load document', () => {
  const parsed = parseEntsoeXml(LOAD_XML);
  assert.equal(parsed.kind, 'series');
  assert.equal(parsed.series.length, 1);
  assert.equal(parsed.series[0].direction, 'out');
  assert.deepEqual(summariseLoad(parsed), {
    mw: 1240,
    at: '2026-10-01T12:00:00.000Z',
  });
});

test('generation summary sums production types and keeps pumping separate', () => {
  const parsed = parseEntsoeXml(GEN_XML);
  assert.equal(parsed.series.length, 3);
  const gen = summariseGeneration(parsed);
  assert.equal(gen.at, '2026-10-01T12:00:00.000Z');
  // B12's latest numeric value is 400 (the n/a point is dropped).
  assert.deepEqual(
    gen.byType.map((r) => [r.code, r.mw, r.fuel]),
    [
      ['B02', 710, 'coal'],
      ['B12', 400, 'hydro'],
    ],
  );
  assert.equal(gen.totalMw, 1110);
  assert.equal(gen.pumpingMw, 200);
});

test('flows take the latest point inside the period and compute net import', () => {
  const hr = NEIGHBOURS[0];
  const flow = summariseFlow(
    hr,
    parseEntsoeXml(flowXml(300)),
    parseEntsoeXml(flowXml(120)),
  );
  assert.equal(flow.importMw, 300);
  assert.equal(flow.exportMw, 120);
  assert.equal(flow.netImportMw, 180);
  assert.equal(flow.at, '2026-10-01T11:45:00.000Z');
  const none = summariseFlow(hr, parseEntsoeXml(ACK_XML), null);
  assert.equal(none.netImportMw, null);
});

test('acknowledgements parse as no-data with sanitised reason text', () => {
  const ack = parseEntsoeXml(ACK_XML);
  assert.equal(ack.kind, 'ack');
  assert.equal(ack.reasonCode, '999');
  assert.equal(/[<>]/.test(ack.reason), false);
  assert.equal(summariseLoad(ack), null);
});

test('parseEntsoeXml rejects non-ENTSO-E bodies', () => {
  assert.throws(
    () => parseEntsoeXml('<html><body>oops</body></html>'),
    /entsoe_invalid_xml/,
  );
  assert.throws(() => parseEntsoeXml(''), /entsoe_invalid_xml/);
});

test('normaliseLivePayload drops unknown neighbours and junk values', () => {
  const live = normaliseLivePayload({
    configured: true,
    load: { mw: 'x' },
    generation: {
      totalMw: 5,
      byType: [{ code: 'B02', label: 'L', fuel: 'coal', mw: 5 }, null],
    },
    flows: [
      { neighbour: 'XX', netImportMw: 5 },
      { neighbour: 'RS', netImportMw: -50 },
    ],
  });
  assert.equal(live.load, null);
  assert.equal(live.generation.byType.length, 1);
  assert.equal(live.flows.length, 1);
  assert.equal(live.flows[0].capital, 'Belgrade');
});

function fakeRes() {
  return {
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.body = body;
    },
  };
}

test('proxy answers keyRequired without a token and never calls upstream', async () => {
  let calls = 0;
  const handler = createPowerLiveHandler({
    readToken: () => '',
    fetchImpl: async () => {
      calls++;
      throw new Error('should not fetch');
    },
  });
  const res = fakeRes();
  await handler({ method: 'GET', url: '/', socket: {} }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.configured, false);
  assert.equal(body.keyRequired, true);
  assert.equal(calls, 0);
});

test('proxy summarises upstream documents, caches them and hides the token', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    const u = new URL(url);
    const type = u.searchParams.get('documentType');
    const body =
      type === 'A65'
        ? LOAD_XML
        : type === 'A75'
          ? GEN_XML
          : u.searchParams.get('in_Domain') === BA_EIC
            ? flowXml(250)
            : flowXml(100);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/xml' },
    });
  };
  const handler = createPowerLiveHandler({
    readToken: () => 'tok-abc',
    fetchImpl,
    now: () => Date.UTC(2026, 9, 1, 12, 30),
  });
  const res = fakeRes();
  await handler({ method: 'GET', url: '/', socket: {} }, res);
  const body = JSON.parse(res.body);
  assert.equal(body.configured, true);
  assert.equal(body.load.mw, 1240);
  assert.equal(body.generation.totalMw, 1110);
  assert.equal(body.flows.length, 3);
  assert.equal(body.flows[0].netImportMw, 150);
  assert.equal(res.body.includes('tok-abc'), false);
  assert.equal(seen.length, 8);
  const res2 = fakeRes();
  await handler({ method: 'GET', url: '/', socket: {} }, res2);
  assert.equal(seen.length, 8, 'second request served from cache');
});

test('proxy reports a rejected token without leaking it', async () => {
  const handler = createPowerLiveHandler({
    readToken: () => 'tok-bad',
    fetchImpl: async () => new Response('Unauthorized', { status: 401 }),
  });
  const res = fakeRes();
  const warn = console.warn;
  console.warn = () => {};
  try {
    await handler({ method: 'GET', url: '/', socket: {} }, res);
  } finally {
    console.warn = warn;
  }
  const body = JSON.parse(res.body);
  assert.equal(body.configured, true);
  assert.equal(body.load, null);
  assert.equal(body.error, 'entsoe_token_rejected');
  assert.equal(res.body.includes('tok-bad'), false);
});
