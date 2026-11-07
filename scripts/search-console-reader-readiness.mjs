// SEARCH-VISIBILITY-GSC-PROVISION-20261104 — readiness proof for the read-only Search Console
// reader. Validates the service-account key shape and lists only the Search Console property
// names + permission levels the key can read. Never prints the key, token or private fields.
import { webcrypto } from 'node:crypto';
import { GOOGLE_SEARCH_SCOPE } from '../google-search-console-readonly.js';

const raw = String(process.env.GOOGLE_SEARCH_SA_KEY_JSON || '');
function fail(message) { console.error(`[GSC-READINESS] ${message}`); process.exit(1); }
let key;
try { key = JSON.parse(raw); } catch { fail('GOOGLE_SEARCH_SA_KEY_JSON is not valid JSON'); }
if (key?.type !== 'service_account' || !/^.+@.+\.iam\.gserviceaccount\.com$/.test(key?.client_email || '')
  || typeof key?.private_key !== 'string' || !key.private_key.includes('BEGIN PRIVATE KEY')) {
  fail('GOOGLE_SEARCH_SA_KEY_JSON is not a Google service-account key');
}
const b64url = bytes => Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const input = `${b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${b64url(Buffer.from(JSON.stringify({
  iss: key.client_email, scope: GOOGLE_SEARCH_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600,
})))}`;
const der = Buffer.from(key.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''), 'base64');
const privateKey = await webcrypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
const signature = new Uint8Array(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, Buffer.from(input)));
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${b64url(signature)}` }),
  signal: AbortSignal.timeout(10_000),
});
if (!tokenResponse.ok) fail(`Google token request failed: HTTP ${tokenResponse.status}`);
const accessToken = (await tokenResponse.json()).access_token;
const sitesResponse = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
  headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
});
if (!sitesResponse.ok) fail(`Search Console sites request failed: HTTP ${sitesResponse.status}`);
const entries = ((await sitesResponse.json()).siteEntry || [])
  .filter(entry => typeof entry?.siteUrl === 'string')
  .map(entry => ({ property: entry.siteUrl.slice(0, 200), permissionLevel: String(entry.permissionLevel || '').slice(0, 40) }));
const readable = entries.filter(entry => ['siteOwner', 'siteFullUser', 'siteRestrictedUser'].includes(entry.permissionLevel));
console.log(JSON.stringify({ readableProperties: readable, otherProperties: entries.length - readable.length }));
if (!readable.length) fail('the service account cannot read any Search Console property yet');
