import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeTokenHandler } from '../server/providers/openai/realtime.js';

function call(handler) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler({ method: 'POST', url: '/api/realtime/token', headers: {} }, res);
  });
}

test('token mints are capped per hour and request a short-lived secret', async () => {
  let clock = 0;
  const bodies = [];
  const handler = createRealtimeTokenHandler({
    resolveApiKey: () => 'sk-fixture-only-not-a-real-key',
    now: () => clock,
    maxMintsPerHour: 2,
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response('{"value":"ek_fixture"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal((await call(handler)).status, 200);
  assert.equal((await call(handler)).status, 200);
  assert.equal((await call(handler)).status, 429);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].expires_after, {
    anchor: 'created_at',
    seconds: 120,
  });
  clock += 3600_001;
  assert.equal((await call(handler)).status, 200);
});
