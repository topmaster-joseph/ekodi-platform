// Shared validation for the guarded devotional push subscription API.
// This module performs no network requests or paid transport calls.
const ALLOWED_SITES = new Set(['mission','church']);
const MAX_ENDPOINT_LENGTH = 2048;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
export function validatePushSubscription(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid subscription');
  const {site, subscription, consentVersion} = input;
  if (!ALLOWED_SITES.has(site)) throw new TypeError('Invalid site');
  if (consentVersion !== 'devotional-push-v1') throw new TypeError('Consent required');
  if (!subscription || typeof subscription !== 'object') throw new TypeError('Invalid push subscription');
  const {endpoint, keys} = subscription;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) throw new TypeError('Invalid endpoint');
  let url;
  try { url = new URL(endpoint); } catch { throw new TypeError('Invalid endpoint'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname || url.port) throw new TypeError('Invalid endpoint');
  // Allow only well-known Web Push providers; do not permit arbitrary user-supplied SSRF targets.
  const host = url.hostname.toLowerCase();
  const allowedHost = host === 'fcm.googleapis.com'
    || host === 'updates.push.services.mozilla.com'
    || host === 'web.push.apple.com'
    || host === 'push.apple.com';
  if (!allowedHost) throw new TypeError('Unsupported push provider');
  if (!keys || typeof keys !== 'object' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') throw new TypeError('Missing push keys');
  if (keys.p256dh.length < 40 || keys.p256dh.length > 200 || !BASE64URL.test(keys.p256dh)) throw new TypeError('Invalid p256dh');
  if (keys.auth.length < 16 || keys.auth.length > 100 || !BASE64URL.test(keys.auth)) throw new TypeError('Invalid auth');
  return {site, endpoint:url.href, p256dh:keys.p256dh, authSecret:keys.auth, consentVersion};
}
export function sameOriginRequest(request, origin='https://ekodi.kr') {
  if (!request || !['POST','DELETE'].includes(request.method)) return false;
  const header = request.headers.get('Origin');
  if (header !== origin) return false;
  const type = request.headers.get('Content-Type') || '';
  return type.toLowerCase().split(';',1)[0].trim() === 'application/json';
}
