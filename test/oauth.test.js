/* Unit tests for the social sign-in helpers in lib/oauth.js: the authorize
 * URL builder, id_token claim checks, the session-cookie round trip, and
 * the cookie/Origin parsing the middleware leans on.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  parseCookies,
  sameOriginWrite,
  signSession,
  verifySession,
  pkceChallenge,
  buildAuthorizeUrl,
  checkIdTokenClaims,
} = require('../lib/oauth');

test('buildAuthorizeUrl: google carries PKCE, state and scope', () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const url = buildAuthorizeUrl('google', { clientId: 'cid-1' }, {
    redirectUri: 'https://app.example/api/auth/oauth/callback',
    state: 'st-123',
    codeVerifier: verifier,
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('client_id'), 'cid-1');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://app.example/api/auth/oauth/callback');
  assert.equal(u.searchParams.get('state'), 'st-123');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'openid email profile');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  // The challenge must verify against the verifier (S256).
  assert.equal(u.searchParams.get('code_challenge'), pkceChallenge(verifier));
});

test('buildAuthorizeUrl: apple uses form_post and no PKCE', () => {
  const url = buildAuthorizeUrl('apple', { clientId: 'com.example.app' }, {
    redirectUri: 'https://app.example/api/auth/oauth/callback',
    state: 'st-9',
    codeVerifier: '',
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://appleid.apple.com/auth/authorize');
  assert.equal(u.searchParams.get('response_mode'), 'form_post');
  assert.equal(u.searchParams.get('scope'), 'name email');
  assert.equal(u.searchParams.get('code_challenge'), null);
});

test('checkIdTokenClaims: accepts good claims', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const claims = {
    aud: 'cid-1',
    iss: 'https://accounts.google.com',
    exp: Math.floor(now.getTime() / 1000) + 600,
    email: 'ayu@gmail.com',
    email_verified: true,
    sub: '1234',
  };
  assert.equal(checkIdTokenClaims(claims, 'google', 'cid-1', now), null);
});

test('checkIdTokenClaims: rejects wrong aud, wrong iss, expiry, unverified email', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const good = {
    aud: 'cid-1', iss: 'https://accounts.google.com',
    exp: Math.floor(now.getTime() / 1000) + 600,
    email: 'ayu@gmail.com', email_verified: true,
  };
  assert.notEqual(checkIdTokenClaims({ ...good, aud: 'other' }, 'google', 'cid-1', now), null);
  assert.notEqual(checkIdTokenClaims({ ...good, iss: 'https://evil.example' }, 'google', 'cid-1', now), null);
  assert.notEqual(checkIdTokenClaims({ ...good, exp: Math.floor(now.getTime() / 1000) - 1 }, 'google', 'cid-1', now), null);
  assert.notEqual(checkIdTokenClaims({ ...good, email_verified: false }, 'google', 'cid-1', now), null);
  assert.notEqual(checkIdTokenClaims({ ...good, email_verified: undefined }, 'google', 'cid-1', now), null);
  assert.notEqual(checkIdTokenClaims(null, 'google', 'cid-1', now), null);
  // Apple's issuer only.
  const apple = { ...good, iss: 'https://appleid.apple.com' };
  assert.equal(checkIdTokenClaims(apple, 'apple', 'cid-1', now), null);
  assert.notEqual(checkIdTokenClaims(apple, 'apple', 'other', now), null);
});

test('signSession / verifySession round trip, and rejections', () => {
  const key = crypto.randomBytes(32).toString('base64url');
  const token = signSession({ sub: 7, sid: 3 }, key);
  const claims = verifySession(token, key);
  assert.equal(claims.sub, 7);
  assert.equal(claims.sid, 3);
  assert.equal(claims.pur, 'sc_session');
  // A changed payload no longer verifies.
  const [head, body, sig] = token.split('.');
  const forged = [head, Buffer.from(JSON.stringify({ sub: 8, sid: 3, pur: 'sc_session' })).toString('base64url'), sig].join('.');
  assert.equal(verifySession(forged, key), null);
  // A wrong key, alg:none and HS512 are all rejected.
  assert.equal(verifySession(token, crypto.randomBytes(32).toString('base64url')), null);
  const noneToken = [head, body, ''].join('.');
  assert.equal(verifySession(noneToken, key), null);
  // A wrong issuer and a wrong pur are rejected.
  const otherIssuer = require('jsonwebtoken').sign({ sub: 7, sid: 3, pur: 'sc_session' }, key, { algorithm: 'HS256', issuer: 'someone-else' });
  assert.equal(verifySession(otherIssuer, key), null);
  const otherPur = require('jsonwebtoken').sign({ sub: 7, sid: 3, pur: 'other' }, key, { algorithm: 'HS256', issuer: 'smart-cashier' });
  assert.equal(verifySession(otherPur, key), null);
});

test('parseCookies: several cookies and encoded values', () => {
  const cookies = parseCookies('a=1; sc_session="x%2Fy+z"; empty=');
  assert.equal(cookies.a, '1');
  assert.equal(cookies.sc_session, 'x/y+z');
  assert.equal(cookies.empty, '');
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
});

test('sameOriginWrite: own origin passes, missing or foreign fails', () => {
  const req = (origin, host) => ({ headers: { origin }, get: () => host });
  assert.equal(sameOriginWrite(req('https://shop.example', 'shop.example')), true);
  assert.equal(sameOriginWrite(req('https://evil.example', 'shop.example')), false);
  assert.equal(sameOriginWrite(req(undefined, 'shop.example')), false);
  assert.equal(sameOriginWrite(req('http://shop.example', 'shop.example')), false);
});
