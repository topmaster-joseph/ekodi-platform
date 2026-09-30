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
function material(env) { return String(env.CHANNEL_CREDENTIAL_KEY || '').trim(); }
export function channelCredentialReady(env) { return Boolean(material(env)); }
async function aesKey(env) {
  if (!material(env)) throw Object.assign(new Error('CHANNEL_CREDENTIAL_KEY_MISSING'), { code:'CHANNEL_CREDENTIAL_KEY_MISSING' });
  return crypto.subtle.importKey('raw', await sha256(`ekodi-channel-aes-v1:${material(env)}`), 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function encryptChannelCredential(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value || {}));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await aesKey(env), plain));
  return { ciphertext:b64url(cipher), iv:b64url(iv) };
}

export async function decryptChannelCredential(env, row) {
  if (!row?.credential_ciphertext || !row?.credential_iv) throw Object.assign(new Error('CHANNEL_CREDENTIAL_NOT_FOUND'), { code:'CHANNEL_CREDENTIAL_NOT_FOUND' });
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:fromB64url(row.credential_iv) }, await aesKey(env), fromB64url(row.credential_ciphertext));
  return JSON.parse(decoder.decode(plain));
}

export async function channelStateHash(value) { return b64url(await sha256(String(value || ''))); }
export function randomChannelToken(bytes = 32) { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export function randomChannelId(prefix = 'chn') { return `${prefix}_${randomChannelToken(18)}`; }
