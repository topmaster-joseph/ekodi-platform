const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value) {
  const normal = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normal + '='.repeat((4 - normal.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}
function material(env) {
  return String(env.MAIL_CREDENTIAL_KEY || '').trim();
}
export function mailCredentialReady(env) { return Boolean(material(env)); }
async function aesKey(env) {
  if (!material(env)) throw Object.assign(new Error('MAIL_CREDENTIAL_KEY_MISSING'), { code: 'MAIL_CREDENTIAL_KEY_MISSING' });
  return crypto.subtle.importKey('raw', await sha256(`ekodi-mail-aes-v1:${material(env)}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
}export async function encryptMailCredential(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), plain));
  return { ciphertext: b64url(cipher), iv: b64url(iv) };
}
export async function decryptMailCredential(env, row) {
  if (!row?.credential_ciphertext || !row?.credential_iv) throw Object.assign(new Error('MAIL_CREDENTIAL_NOT_FOUND'), { code: 'MAIL_CREDENTIAL_NOT_FOUND' });
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(row.credential_iv) }, await aesKey(env), fromB64url(row.credential_ciphertext));
  return JSON.parse(decoder.decode(plain));
}
async function hmacKey(env) {
  if (!material(env)) throw Object.assign(new Error('MAIL_CREDENTIAL_KEY_MISSING'), { code: 'MAIL_CREDENTIAL_KEY_MISSING' });
  return crypto.subtle.importKey('raw', await sha256(`ekodi-mail-state-v1:${material(env)}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signMailState(env, payload) {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), encoder.encode(body)));
  return `${body}.${b64url(sig)}`;
}export async function readMailState(env, state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sig), encoder.encode(body));
  if (!ok) return null;
  try { return JSON.parse(decoder.decode(fromB64url(body))); } catch { return null; }
}
export async function mailNonceHash(value) { return b64url(await sha256(String(value))); }