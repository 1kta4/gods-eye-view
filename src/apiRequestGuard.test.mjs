import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequestRefusal, hostHeaderName, isLanMode } from '../server/providers/common/api-guard.js';

const own = { host: 'localhost:4173' };

test('same-origin app requests pass', () => {
  assert.equal(apiRequestRefusal(own), null);
  assert.equal(
    apiRequestRefusal({
      ...own,
      'sec-fetch-site': 'same-origin',
      origin: 'http://localhost:4173',
    }),
    null,
  );
  assert.equal(apiRequestRefusal({ host: '127.0.0.1:4173' }), null);
  assert.equal(apiRequestRefusal({ host: '[::1]:4173' }), null);
  assert.equal(apiRequestRefusal({ ...own, 'sec-fetch-site': 'none' }), null);
});

test('DNS rebinding hosts are refused unless serving the LAN', () => {
  const rebound = { host: 'rebind.attacker.tld:4173' };
  assert.equal(apiRequestRefusal(rebound), 'foreign_host');
  assert.equal(
    apiRequestRefusal({ host: 'printer.local:4173' }),
    'foreign_host',
  );
  assert.equal(apiRequestRefusal({}), 'missing_host');
  assert.equal(apiRequestRefusal(rebound, { lanMode: true }), null);
});

test('cross-site and foreign-origin requests are refused', () => {
  for (const site of ['cross-site', 'same-site'])
    assert.equal(
      apiRequestRefusal({ ...own, 'sec-fetch-site': site }),
      'cross_site',
    );
  assert.equal(
    apiRequestRefusal({ ...own, origin: 'http://evil.example' }),
    'foreign_origin',
  );
  assert.equal(
    apiRequestRefusal({ ...own, origin: 'http://localhost:5173' }),
    'foreign_origin',
  );
  assert.equal(apiRequestRefusal({ ...own, origin: 'null' }), 'foreign_origin');
});

test('host parsing and LAN detection', () => {
  assert.equal(hostHeaderName('LocalHost:4173'), 'localhost');
  assert.equal(hostHeaderName('[::1]:4173'), '[::1]');
  assert.equal(hostHeaderName(''), '');
  assert.equal(isLanMode('0.0.0.0'), true);
  assert.equal(isLanMode('::'), true);
  assert.equal(isLanMode('localhost'), false);
  assert.equal(isLanMode(undefined), false);
});
