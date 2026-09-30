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
function material(env) { return String(env?.AMAZON_CREDENTIAL_KEY || '').trim(); }
export function amazonCredentialVaultReady(env) { return Boolean(material(env)); }
async function aesKey(env) {
  if (!material(env)) throw Object.assign(new Error('AMAZON_CREDENTIAL_KEY_MISSING'), { code:'AMAZON_CREDENTIAL_KEY_MISSING' });
  return crypto.subtle.importKey('raw', await sha256(`ekodi-amazon-aes-v1:${material(env)}`), 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function encryptAmazonCredential(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value || {}));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await aesKey(env), plain));
  return { ciphertext:b64url(cipher), iv:b64url(iv), version:1 };
}
export async function decryptAmazonCredential(env, row) {
  if (!row?.credential_ciphertext || !row?.credential_iv) throw Object.assign(new Error('AMAZON_CREDENTIAL_NOT_FOUND'), { code:'AMAZON_CREDENTIAL_NOT_FOUND' });
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:fromB64url(row.credential_iv) }, await aesKey(env), fromB64url(row.credential_ciphertext));
  return JSON.parse(decoder.decode(plain));
}
