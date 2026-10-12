/* Social sign-in, on top of the platform's own sign-in (which stays the
 * main way in). A person links a Google or Apple account to their existing
 * Smart Cashier account; the linked account can then sign them in at the
 * app's own address with an app-issued session cookie.
 *
 * Pure helpers are exported for unit tests; createOAuthRouter(pool) holds
 * the routes. Provider keys come from dapp.json secrets (env vars) and are
 * optional: without them every social button shows an honest "not set up"
 * state and the app deploys unchanged.
 */
'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const ISSUERS = {
  google: ['https://accounts.google.com', 'accounts.google.com'],
  apple: ['https://appleid.apple.com'],
};

// ── Provider configuration (from env, set by dapp.json secrets) ──────────

function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { clientId: id, clientSecret: secret };
}

function appleConfig() {
  const id = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!id || !teamId || !keyId || !privateKey) return null;
  return { clientId: id, teamId, keyId, privateKey };
}

const CONFIGS = { google: googleConfig, apple: appleConfig };

function isConfigured(provider) {
  const cfg = CONFIGS[provider];
  return !!(cfg && cfg());
}
function configuredProviders() {
  return Object.keys(CONFIGS).filter(isConfigured);
}

// ── Pure helpers (unit tested) ───────────────────────────────────────────

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try { out[name] = decodeURIComponent(value); } catch (_) { out[name] = value; }
  }
  return out;
}

// A write that used only the session cookie (no platform token) must come
// from this app's own origin: a cross-site form or script cannot set it.
function sameOriginWrite(req) {
  const origin = req.headers && req.headers.origin;
  const host = req.get && req.get('host');
  return !!origin && !!host && origin === 'https://' + host;
}

function signSession(payload, key) {
  return jwt.sign({ ...payload, pur: 'sc_session' }, key, {
    algorithm: 'HS256',
    issuer: 'smart-cashier',
    expiresIn: '30d',
  });
}

function verifySession(token, key) {
  try {
    const claims = jwt.verify(token, key, {
      algorithms: ['HS256'],
      issuer: 'smart-cashier',
    });
    if (!claims || claims.pur !== 'sc_session') return null;
    if (!Number.isInteger(claims.sub) || !Number.isInteger(claims.sid)) return null;
    return claims;
  } catch (_) {
    return null;
  }
}

function b64url(buf) { return buf.toString('base64url'); }

function pkceChallenge(verifier) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

function buildAuthorizeUrl(provider, cfg, opts) {
  const p = PROVIDERS[provider];
  const url = new URL(p.authorizeUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('state', opts.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', p.scope);
  if (p.pkce) {
    url.searchParams.set('code_challenge', pkceChallenge(opts.codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (p.responseMode) url.searchParams.set('response_mode', p.responseMode);
  return url.toString();
}

// Check the id_token claims (the token came straight from the provider over
// TLS, so decoding without verifying the signature is enough here). Returns
// null when the claims are good, else an error code.
function checkIdTokenClaims(claims, provider, clientId, now) {
  if (!claims || typeof claims !== 'object') return 'exchange_failed';
  if (claims.aud !== clientId) return 'exchange_failed';
  if (!ISSUERS[provider].includes(String(claims.iss || ''))) return 'exchange_failed';
  if (!(Number(claims.exp) > Math.floor(now.getTime() / 1000))) return 'exchange_failed';
  if (typeof claims.email !== 'string' || !claims.email.includes('@')) return 'unverified';
  if (claims.email_verified !== true) return 'unverified';
  return null;
}

// ── Provider descriptors ─────────────────────────────────────────────────

const PROVIDERS = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    pkce: true,
  },
  apple: {
    label: 'Apple',
    authorizeUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    scope: 'name email',
    pkce: false,
    responseMode: 'form_post', // Apple answers the callback with a form POST
  },
};

// Apple's client secret is a short-lived JWT signed with the team's .p8 key.
function appleClientSecret(cfg) {
  return jwt.sign({}, cfg.privateKey, {
    algorithm: 'ES256',
    keyid: cfg.keyId,
    issuer: cfg.teamId,
    audience: 'https://appleid.apple.com',
    expiresIn: '20m',
  });
}

// ── Session key (in the app_keys table, so no required secret) ───────────

let sessionKey = null;

async function ensureSessionKey(pool) {
  await pool.query(
    `INSERT INTO app_keys (name, secret) VALUES ('session', $1) ON CONFLICT (name) DO NOTHING`,
    [b64url(crypto.randomBytes(32))]);
  const row = (await pool.query(`SELECT secret FROM app_keys WHERE name = 'session'`)).rows[0];
  sessionKey = row ? row.secret : null;
}

function sessionReady() { return !!sessionKey; }

// ── Router ───────────────────────────────────────────────────────────────

const COOKIE = 'sc_session';
const STATE_TTL_MS = 10 * 60 * 1000;

function createOAuthRouter(pool) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  function wantsDemo(req) { return process.env.USERNODE_ENV === 'staging' && req.query.demo === '1'; }

  function setSession(res, identity) {
    const token = signSession({ sub: identity.user_id, sid: identity.id }, sessionKey);
    res.cookie(COOKIE, token, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/',
      maxAge: 30 * 24 * 3600 * 1000,
    });
  }

  // The HTML the popup ends on: self-contained, then closes itself.
  function popupPage(title, detail) {
    return `<!doctype html><meta charset=utf-8><title>${title}</title>` +
      `<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f3f4f1;color:#181c19;text-align:center">` +
      `<div style="max-width:20rem;padding:2rem"><h1 style="font-size:1.05rem;margin:0 0 .4rem">${title}</h1>` +
      `<p style="color:#545b56;font-size:.85rem;margin:0">${detail}</p></div>` +
      `<script>setTimeout(function(){try{window.close()}catch(e){}},600)<\/script></body>`;
  }

  async function insertState(provider, mode, userId, verifier, redirectUri) {
    // Sweep states older than a day, then store this one.
    await pool.query(`DELETE FROM oauth_states WHERE created_at < $1`,
      [new Date(Date.now() - 24 * 3600 * 1000).toISOString()]);
    const state = b64url(crypto.randomBytes(32));
    await pool.query(
      `INSERT INTO oauth_states (state, provider, mode, user_id, code_verifier, redirect_uri)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [state, provider, mode, userId, verifier, redirectUri]);
    return state;
  }

  // GET /methods — what the Sign-in methods sheet shows.
  router.get('/methods', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const linked = (await pool.query(
        `SELECT provider, email, created_at FROM social_identities WHERE user_id = $1`,
        [req.user.id])).rows;
      const byProvider = new Map(linked.map((r) => [r.provider, r]));
      const providers = Object.keys(PROVIDERS).map((provider) => {
        const row = byProvider.get(provider);
        return {
          provider,
          configured: isConfigured(provider),
          linked: row ? { email: row.email, linkedAt: row.created_at } : null,
        };
      });
      // The redirect address is Owner information: paste it into the
      // provider's console. Only an Owner of some shop sees it.
      const owner = (await pool.query(
        `SELECT count(*)::int AS c FROM staff st JOIN roles r ON r.id = st.role_id JOIN shops s ON s.id = st.shop_id
         WHERE st.user_id = $1 AND r.is_owner AND (NOT s.is_demo OR $2::boolean)`,
        [req.user.id, wantsDemo(req)])).rows[0];
      const answer = {
        signedInWith: (req.user.via === 'google' || req.user.via === 'apple') ? req.user.via : 'homeroom',
        providers,
      };
      if (owner && owner.c > 0) {
        answer.callbackUrl = 'https://' + req.get('host') + '/api/auth/oauth/callback';
      }
      res.json(answer);
    } catch (err) { next(err); }
  });

  // POST /start — begin linking a provider to the signed-in account.
  router.post('/start', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const provider = String((req.body && req.body.provider) || '');
      if (!PROVIDERS[provider]) return res.status(400).json({ error: 'bad_provider' });
      const cfg = CONFIGS[provider] && CONFIGS[provider]();
      if (!cfg) return res.status(503).json({ error: 'not_configured' });
      const verifier = b64url(crypto.randomBytes(32));
      const redirectUri = 'https://' + req.get('host') + '/api/auth/oauth/callback';
      const state = await insertState(provider, 'link', req.user.id, verifier, redirectUri);
      res.json({ url: buildAuthorizeUrl(provider, cfg, { redirectUri, state, codeVerifier: verifier }), state });
    } catch (err) { next(err); }
  });

  // GET /status?state= — the linking page polls this while the popup is open.
  router.get('/status', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const row = (await pool.query(
        `SELECT status, error, created_at FROM oauth_states WHERE state = $1 AND user_id = $2`,
        [String(req.query.state || ''), req.user.id])).rows[0];
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'pending' && req.now.getTime() - new Date(row.created_at).getTime() > STATE_TTL_MS) {
        return res.json({ status: 'failed', error: 'expired' });
      }
      res.json({ status: row.status, error: row.error });
    } catch (err) { next(err); }
  });

  // DELETE /:provider — unlink. Sessions naming the row stop working (the
  // middleware re-reads the row on every request).
  router.delete('/:provider', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const provider = String(req.params.provider);
      if (!PROVIDERS[provider]) return res.status(400).json({ error: 'bad_provider' });
      await pool.query(`DELETE FROM social_identities WHERE user_id = $1 AND provider = $2`,
        [req.user.id, provider]);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

  // POST /signout — end the app's own session cookie.
  router.post('/signout', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
      res.json({ signedOut: true });
    } catch (err) { next(err); }
  });

  // GET /signin?provider= — a signed-out visitor at the app's own address.
  router.get('/signin', async (req, res, next) => {
    try {
      const provider = String(req.query.provider || '');
      if (!PROVIDERS[provider]) return res.redirect(302, '/?signin=not_set_up');
      const cfg = CONFIGS[provider] && CONFIGS[provider]();
      if (!cfg) return res.redirect(302, '/?signin=not_set_up');
      const verifier = b64url(crypto.randomBytes(32));
      const redirectUri = 'https://' + req.get('host') + '/api/auth/oauth/callback';
      const state = await insertState(provider, 'signin', null, verifier, redirectUri);
      res.redirect(302, buildAuthorizeUrl(provider, cfg, { redirectUri, state, codeVerifier: verifier }));
    } catch (err) { next(err); }
  });

  // GET /callback — Google returns here with a redirect. POST /callback —
  // Apple returns here with a form POST (response_mode=form_post).
  async function handleCallback(req, res) {
    const provider = String(req.query.provider || (req.body && req.body.provider) || '');
    const stateValue = String(req.query.state || (req.body && req.body.state) || '');
    const code = String(req.query.code || (req.body && req.body.code) || '');
    const finish = (status, error, html) => {
      // Answer the popup HTML first, then record the outcome: the page's
      // /status poll only ever sees the terminal states.
      if (html) res.send(html);
      return pool.query(
        `UPDATE oauth_states SET status = $2, error = $3 WHERE state = $1`,
        [stateValue, status, error || null]);
    };
    try {
      if (req.query.error || (req.body && req.body.error)) {
        // The person said no, or closed the flow, at the provider's side.
        await finish('failed', 'cancelled');
        return res.send(popupPage('Linking was cancelled.', 'Nothing was changed. You can try again any time.'));
      }
      // Claim the state before exchanging the code: a replayed callback
      // never links twice.
      const claimed = (await pool.query(
        `UPDATE oauth_states SET status = 'done'
         WHERE state = $1 AND status = 'pending' AND created_at >= $2
         RETURNING provider, mode, user_id, code_verifier, redirect_uri`,
        [stateValue, new Date(req.now.getTime() - STATE_TTL_MS).toISOString()])).rows[0];
      if (!claimed) {
        return res.send(popupPage('Linking was cancelled.', 'The sign-in attempt expired. Close this window and try again.'));
      }
      const p = PROVIDERS[claimed.provider];
      const cfg = CONFIGS[claimed.provider] && CONFIGS[claimed.provider]();
      if (!p || !cfg) return res.send(popupPage('Something went wrong', 'That provider is not set up.'));

      const form = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: claimed.redirect_uri });
      if (claimed.provider === 'google') {
        form.set('client_id', cfg.clientId);
        form.set('client_secret', cfg.clientSecret);
        form.set('code_verifier', claimed.code_verifier);
      } else {
        form.set('client_id', cfg.clientId);
        form.set('client_secret', appleClientSecret(cfg));
      }
      let tokenData;
      try {
        const upstream = await fetch(p.tokenUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        if (!upstream.ok) throw new Error('token ' + upstream.status);
        tokenData = await upstream.json();
      } catch (err) {
        await finish('failed', 'exchange_failed');
        return res.send(popupPage('Google didn’t answer', 'The sign-in could not be completed. Try again.'));
      }
      const claims = tokenData && tokenData.id_token ? jwt.decode(tokenData.id_token) : null;
      const bad = checkIdTokenClaims(claims, claimed.provider, cfg.clientId, req.now);
      if (bad) {
        await finish('failed', bad);
        const words = bad === 'unverified'
          ? 'That account’s email is not confirmed, so it can’t be used.'
          : 'The sign-in could not be completed. Try again.';
        return res.send(popupPage('Linking was cancelled.', words));
      }
      const subject = String(claims.sub);
      const email = String(claims.email);

      if (claimed.mode === 'link') {
        const existing = (await pool.query(
          `SELECT id, user_id FROM social_identities WHERE provider = $1 AND provider_subject = $2`,
          [claimed.provider, subject])).rows[0];
        if (existing && existing.user_id !== claimed.user_id) {
          await finish('failed', 'taken');
          return res.send(popupPage('Already in use', 'That account is already linked to someone else.'));
        }
        const mine = (await pool.query(
          `SELECT id FROM social_identities WHERE user_id = $1 AND provider = $2`,
          [claimed.user_id, claimed.provider])).rows[0];
        if (mine && !existing) {
          await finish('failed', 'already_linked');
          return res.send(popupPage('Already linked', 'You already have an account linked here. Unlink it first.'));
        }
        // The row's username starts as the person's Homeroom username (kept
        // fresh by /api/me on every Homeroom sign-in).
        const staffRow = (await pool.query(
          `SELECT username FROM staff WHERE user_id = $1 LIMIT 1`, [claimed.user_id])).rows[0];
        const username = staffRow ? staffRow.username : email.split('@')[0];
        const row = existing
          ? (await pool.query(
              `UPDATE social_identities SET email = $2, username = $3 WHERE id = $1 RETURNING id, user_id`,
              [existing.id, email, username])).rows[0]
          : (await pool.query(
              `INSERT INTO social_identities (user_id, username, provider, provider_subject, email)
               VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, provider)
               DO UPDATE SET email = EXCLUDED.email RETURNING id, user_id`,
              [claimed.user_id, username, claimed.provider, subject, email])).rows[0];
        await finish('done', null);
        return res.send(popupPage('Account linked', 'You can close this window and go back to Smart Cashier.'));
      }

      // mode = signin: find whose account this is. First by the linked
      // provider account, then by a confirmed email linked by exactly one
      // person. Never create an account here.
      let identity = (await pool.query(
        `SELECT id, user_id FROM social_identities WHERE provider = $1 AND provider_subject = $2`,
        [claimed.provider, subject])).rows[0];
      if (!identity) {
        const byEmail = (await pool.query(
          `SELECT id, user_id FROM social_identities WHERE provider = $1 AND lower(email) = lower($2)`,
          [claimed.provider, email])).rows;
        if (byEmail.length === 1) identity = byEmail[0];
      }
      if (!identity) {
        await finish('failed', 'not_linked');
        return res.redirect(302, '/?signin=not_linked');
      }
      setSession(res, identity);
      await pool.query(`UPDATE social_identities SET last_signin_at = $2 WHERE id = $1`,
        [identity.id, req.now]);
      await pool.query(`UPDATE oauth_states SET status = 'done' WHERE state = $1`, [stateValue]);
      return res.redirect(302, '/');
    } catch (err) {
      try { await pool.query(`UPDATE oauth_states SET status = 'failed', error = 'exchange_failed' WHERE state = $1`, [stateValue]); } catch (_) {}
      throw err;
    }
  }

  router.get('/callback', (req, res, next) => { handleCallback(req, res).catch(next); });
  router.post('/callback', (req, res, next) => { handleCallback(req, res).catch(next); });

  return router;
}

module.exports = {
  PROVIDERS,
  SESSION_COOKIE: COOKIE,
  parseCookies,
  sameOriginWrite,
  signSession,
  verifySession,
  pkceChallenge,
  buildAuthorizeUrl,
  checkIdTokenClaims,
  googleConfig,
  appleConfig,
  isConfigured,
  configuredProviders,
  ensureSessionKey,
  sessionReady,
  getSessionKey: () => sessionKey,
  createOAuthRouter,
};
