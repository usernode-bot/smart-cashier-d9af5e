'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { accessDecision, GUEST_API_PATHS } = require('../lib/access');

const guest = { guest: true };
const fixtureUser = { id: 'u1', username: 'demo_owner' };
const publicPaths = new Set(['/health', '/api/auth/oauth/signin', '/api/auth/oauth/callback']);

function decide(method, path, identity) {
  return accessDecision({ method, path, publicPaths, ...(identity || {}) });
}
function denied(status, error) {
  return { allow: false, status, error };
}

test('a guest is refused every shop read, existing shop or not', () => {
  assert.deepStrictEqual(decide('GET', '/api/shops/1/catalog', guest), denied(401, 'account_required'));
  // An id that does not exist answers exactly the same, so ids cannot be probed.
  assert.deepStrictEqual(decide('GET', '/api/shops/999999/insights', guest), denied(401, 'account_required'));
  assert.deepStrictEqual(decide('GET', '/api/shops/1/sales', guest), denied(401, 'account_required'));
  assert.deepStrictEqual(decide('GET', '/api/shops/1/finance/summary', guest), denied(401, 'account_required'));
  assert.deepStrictEqual(decide('GET', '/api/shops/1/staff', guest), denied(401, 'account_required'));
  assert.deepStrictEqual(decide('GET', '/api/shops/1/roles', guest), denied(401, 'account_required'));
});

test('a guest may read only /api/me, and only as a GET', () => {
  assert.strictEqual(GUEST_API_PATHS.has('/api/me'), true);
  assert.deepStrictEqual(decide('GET', '/api/me', guest), { allow: true });
  assert.deepStrictEqual(decide('HEAD', '/api/me', guest), { allow: true });
  assert.deepStrictEqual(decide('POST', '/api/me', guest), denied(401, 'account_required'));
});

test('the OAuth round-trip stays public, its other routes do not', () => {
  assert.deepStrictEqual(decide('GET', '/api/auth/oauth/signin', guest), { allow: true });
  assert.deepStrictEqual(decide('GET', '/api/auth/oauth/callback', guest), { allow: true });
  assert.deepStrictEqual(decide('GET', '/api/auth/oauth/methods', guest), denied(401, 'account_required'));
  assert.deepStrictEqual(decide('GET', '/api/auth/oauth/status', guest), denied(401, 'account_required'));
});

test('a guest may not write', () => {
  assert.deepStrictEqual(decide('POST', '/api/shops', guest), denied(401, 'account_required'));
  assert.deepStrictEqual(decide('DELETE', '/api/shops/1/payouts/2', guest), denied(401, 'account_required'));
});

test('a guest still gets the HTML shell for the sign-in screen', () => {
  assert.deepStrictEqual(decide('GET', '/', guest), { allow: true });
  assert.deepStrictEqual(decide('GET', '/tailwind.css', guest), { allow: true });
});

test('a visitor with no identity at all is told to authenticate', () => {
  assert.deepStrictEqual(decide('GET', '/api/me'), denied(401, 'Not authenticated'));
  assert.deepStrictEqual(decide('GET', '/api/shops/1/catalog'), denied(401, 'Not authenticated'));
  assert.deepStrictEqual(decide('GET', '/'), { allow: true });
});

test('a signed-in person reaches the register and every route behind its roles', () => {
  assert.deepStrictEqual(decide('GET', '/api/me', { user: fixtureUser }), { allow: true });
  assert.deepStrictEqual(decide('GET', '/api/shops/1/catalog', { user: fixtureUser }), { allow: true });
});
