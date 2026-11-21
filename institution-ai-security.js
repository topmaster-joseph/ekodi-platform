// EKODIBIZ institution AI: server-to-server tenant boundary, not a browser credential API.
// Secrets must be stored in Worker secret bindings, never in source code or client state.
const encoder = new TextEncoder();
const ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const KEY_VERSION = /^[a-zA-Z0-9_-]{1,32}$/;
const ROLES = new Set(['submit', 'assistant', 'read', 'approve', 'execute', 'backup', 'restore']);
export const INSTITUTION_AI_MAX_BODY_BYTES = 24 * 1024;
export const INSTITUTION_AI_HIGH_IMPACT = Object.freeze(['payment', 'contract', 'external_send', 'publish', 'delete', 'account_change']);
export const INSTITUTION_AI_TASK_TYPES = Object.freeze(['analysis', 'draft', 'document', ...INSTITUTION_AI_HIGH_IMPACT]);
export const INSTITUTION_AI_CLASSIFICATIONS = Object.freeze(['public', 'internal', 'confidential', 'restricted']);

const utf8 = value => encoder.encode(String(value));
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
function parseSecretObject(value) {
  if (!value || typeof value !== 'string') throw new Error('INSTITUTION_AI_NOT_CONFIGURED');
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error();
    return parsed;
  } catch { throw new Error('INSTITUTION_AI_NOT_CONFIGURED'); }
}
function constantTimeEqual(a, b) {
  const x = utf8(a), y = utf8(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0 && x.length >= 32;
}
export function authorizeInstitutionServer(request, env, tenantId, role) {
  if (!ID.test(String(tenantId || '')) || !ROLES.has(role)) return false;
  const tenants = parseSecretObject(env.INSTITUTION_AI_TENANTS_JSON);
  const tenant = Object.hasOwn(tenants, tenantId) ? tenants[tenantId] : null;
  if (tenant?.status !== 'active') return false;
  const candidates = tenant?.keys?.[role];
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 3) return false;
  const presented = request.headers.get('x-ekodi-institution-key') || '';
  // Always evaluate all active keys: supports bounded, overlap-only credential rotation.
  let valid = false;
  for (const key of candidates) valid = constantTimeEqual(presented, String(key)) || valid;
  return valid;
}
function masterSecret(env, version) {
  const keys = parseSecretObject(env.INSTITUTION_AI_KEYRING_JSON);
  const raw = keys[version];
  if (!KEY_VERSION.test(String(version || '')) || typeof raw !== 'string' || utf8(raw).length < 32) {
    throw new Error('INSTITUTION_AI_KEY_UNAVAILABLE');
  }
  return raw;
}
export function activeInstitutionKeyVersion(env) {
  const version = String(env.INSTITUTION_AI_ACTIVE_KEY_VERSION || '');
  masterSecret(env, version);
  return version;
}
async function deriveKey(env, tenantId, version) {
  const material = await crypto.subtle.importKey('raw', utf8(masterSecret(env, version)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: utf8('ekodi-institution-ai:tenant:' + tenantId),
    info: utf8('work-record:aes-gcm:v1'),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function aad(tenantId, operationId, version) {
  return utf8(JSON.stringify([tenantId, operationId, version, 'institution-ai-v1']));
}
export async function encryptInstitutionPayload(env, tenantId, operationId, payload) {
  const version = activeInstitutionKeyVersion(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(env, tenantId, version);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(tenantId, operationId, version) },
    key, utf8(JSON.stringify(payload)),
  );
  return Object.freeze({ version, iv: b64(iv), ciphertext: b64(ciphertext) });
}
export async function decryptInstitutionPayload(env, tenantId, operationId, sealed) {
  if (!sealed || !KEY_VERSION.test(String(sealed.version || ''))) throw new Error('INSTITUTION_AI_RECORD_INVALID');
  const key = await deriveKey(env, tenantId, sealed.version);
  const decrypted = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: unb64(sealed.iv),
    additionalData: aad(tenantId, operationId, sealed.version),
  }, key, unb64(sealed.ciphertext));
  return JSON.parse(new TextDecoder().decode(decrypted));
}
export async function fingerprintInstitutionRequest(env, tenantId, operationId, taskType, classification, payload) {
  // A dedicated, stable HMAC secret survives encryption key rotations.
  const secret = String(env.INSTITUTION_AI_HMAC_KEY || '');
  if (utf8(secret).length < 32) throw new Error('INSTITUTION_AI_HMAC_UNAVAILABLE');
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, utf8(JSON.stringify([tenantId, operationId, taskType, classification, payload])));
  return b64(signature);
}
export function validateInstitutionJob(body) {
  if (!ID.test(String(body?.tenantId || ''))) throw new Error('INVALID_TENANT');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(String(body?.operationId || ''))) throw new Error('INVALID_OPERATION_ID');
  if (!INSTITUTION_AI_TASK_TYPES.includes(body?.taskType)) throw new Error('INVALID_TASK_TYPE');
  if (!INSTITUTION_AI_CLASSIFICATIONS.includes(body?.classification)) throw new Error('INVALID_CLASSIFICATION');
  if (!body || !Object.hasOwn(body, 'payload') || body.payload === null || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    throw new Error('INVALID_PAYLOAD');
  }
}
export async function readInstitutionJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!/^application\/json(?:;|$)/i.test(type)) throw new Error('CONTENT_TYPE_REQUIRED');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BODY_REQUIRED');
  const chunks = []; let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > INSTITUTION_AI_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(buffer));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error();
    return parsed;
  } catch { throw new Error('INVALID_JSON'); }
}
export function institutionExternalModelAllowed(classification, approvedIds = [], providerId = '') {
  // Sensitive documents stay in tenant-controlled storage until a separate reviewed data-transfer gate exists.
  return ['public', 'internal'].includes(classification) && approvedIds.includes(providerId);
}
