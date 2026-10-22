/* Who may reach what. Pure, so it is unit tested in test/access.test.js.
 *
 * A guest (a visitor with no Homeroom account) sees the sign-in screen and
 * nothing else: the only API they may read is GET /api/me, which tells that
 * screen which social providers are set up. Every other /api/* request from
 * a guest is answered 401 account_required, whether or not the thing asked
 * for exists, so shop ids cannot be probed.
 */
'use strict';

const GUEST_API_PATHS = new Set(['/api/me']);

function accessDecision({ method, path, user, guest, publicPaths } = {}) {
  const m = String(method || 'GET').toUpperCase();
  const isRead = m === 'GET' || m === 'HEAD';
  const isApi = typeof path === 'string' && path.startsWith('/api/');

  // Static files and the HTML shell (which shows the sign-in screen to a
  // guest, and the "Open in Homeroom" page to a visitor with no identity).
  if (!isApi && isRead) return { allow: true };
  // Paths deliberately open, like the OAuth round-trip, which lands here
  // with no platform token by definition.
  if (publicPaths && publicPaths.has(path)) return { allow: true };
  if (user) return { allow: true };
  if (guest) {
    if (isRead && GUEST_API_PATHS.has(path)) return { allow: true };
    return { allow: false, status: 401, error: 'account_required' };
  }
  return { allow: false, status: 401, error: 'Not authenticated' };
}

module.exports = { accessDecision, GUEST_API_PATHS };
