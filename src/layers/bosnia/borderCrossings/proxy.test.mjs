import test from 'node:test';
import assert from 'node:assert/strict';
import { borderCrossingsProxy } from '../../../../server/providers/bosnia/roads.js';

const CROSSINGS = `<time datetime="2026-10-01 13:31:24">x</time>
<article class="p-5"><h3>GP Brod</h3><div><p>Zadržavanja putničkih vozila nisu duža od 30 minuta.</p></div></article>`;
const CONDITIONS = `<time datetime="2026-10-01 13:31:24">x</time>
<div class="text-editor mt-5"><p>Pojačan je promet vozila na prilazima gradovima.</p></div><audio></audio>`;

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

async function call(proxy, url = '/') {
  let status = 0;
  let body = '';
  const res = {
    writableEnded: false,
    writeHead(code) {
      status = code;
    },
    end(text) {
      body = text;
      this.writableEnded = true;
    },
  };
  await proxy._handler(
    { method: 'GET', url, socket: { remoteAddress: '127.0.0.1' } },
    res,
  );
  return { status, json: JSON.parse(body) };
}

test('proxy parses both pages, caches, and serves stale on failure', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let clock = 1_000_000;
  let fail = false;
  const calls = [];
  const proxy = borderCrossingsProxy({
    now: () => clock,
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'error');
      assert.match(options.headers['User-Agent'], /GodsEyeView-BiH/);
      if (fail) throw new Error('offline');
      return htmlResponse(
        url.endsWith('granicni-prijelazi') ? CROSSINGS : CONDITIONS,
      );
    },
  });
  const first = await call(proxy);
  assert.equal(first.status, 200);
  assert.equal(first.json.crossings[0].key, 'brod');
  assert.equal(first.json.crossings[0].wait.cars, 30);
  assert.equal(first.json.updatedAt, '2026-10-01T11:31:24.000Z');
  assert.deepEqual(first.json.conditions.paragraphs, [
    'Pojačan je promet vozila na prilazima gradovima.',
  ]);
  assert.equal(first.json.stale, false);
  await call(proxy);
  assert.equal(calls.length, 2, 'second call is served from cache');

  clock += 11 * 60_000;
  fail = true;
  const stale = await call(proxy);
  assert.equal(stale.json.stale, true);
  assert.equal(stale.json.crossings.length, 1);
});

test('proxy reports unavailable without a cache and rejects other paths', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const proxy = borderCrossingsProxy({
    fetchImpl: async () => htmlResponse('nope', 503),
  });
  const down = await call(proxy);
  assert.equal(down.json.unavailable, true);
  assert.deepEqual(down.json.crossings, []);
  assert.equal((await call(proxy, '/../x')).status, 404);
});
