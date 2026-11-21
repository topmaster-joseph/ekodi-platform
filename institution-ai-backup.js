// Isolated-staging sealed recovery archive. No backup key, plaintext data or AI
// provider token is ever included in an archive.
const FORMAT = 'ekodi.institution-ai.encrypted-backup/v1';
export const INSTITUTION_AI_BACKUP_FORMAT = FORMAT;
export const INSTITUTION_AI_BACKUP_MAX_BYTES = 12 * 1024;
const encoder = new TextEncoder();
const utf8 = value => encoder.encode(value);
const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = string => Uint8Array.from(atob(string), char => char.charCodeAt(0));

function backupKeyMaterial(env, version) {
  const stored = env?.INSTITUTION_AI_BACKUP_KEYS_JSON;
  if (typeof stored !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(String(version || ''))) {
    throw new Error('BACKUP_KEY_UNAVAILABLE');
  }
  let ring;
  try { ring = JSON.parse(stored); } catch { throw new Error('BACKUP_KEY_UNAVAILABLE'); }
  if (!ring || typeof ring !== 'object' || Array.isArray(ring) ||
      !Object.hasOwn(ring, version) || typeof ring[version] !== 'string' ||
      utf8(ring[version]).length < 32) throw new Error('BACKUP_KEY_UNAVAILABLE');
  return ring[version];
}
async function backupKey(env, tenantId, version) {
  const material = await crypto.subtle.importKey(
    'raw', utf8(backupKeyMaterial(env, version)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256',
    salt: utf8('ekodi-institution-ai:backup-tenant:' + tenantId),
    info: utf8('sealed-backup:aes-gcm:v1'),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const aad = (tenantId, operationId, version) =>
  utf8(JSON.stringify([FORMAT, tenantId, operationId, version]));

export async function sealInstitutionBackup(env, tenantId, operationId, record, audit) {
  const version = String(env?.INSTITUTION_AI_BACKUP_KEY_VERSION || '');
  const key = await backupKey(env, tenantId, version);
  const serialized = utf8(JSON.stringify({ format: FORMAT, tenantId, operationId, record, audit }));
  // Enforce a small, testable pilot size until chunked encrypted storage exists.
  // Never silently omit conversation messages or evidence.
  if (serialized.byteLength > INSTITUTION_AI_BACKUP_MAX_BYTES) throw new Error('BACKUP_TOO_LARGE');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: aad(tenantId, operationId, version),
  }, key, serialized);
  return { format: FORMAT, tenantId, operationId, keyVersion: version,
    iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function openInstitutionBackup(env, tenantId, operationId, archive) {
  if (!archive || archive.format !== FORMAT || archive.tenantId !== tenantId ||
      archive.operationId !== operationId ||
      typeof archive.ciphertext !== 'string' || typeof archive.iv !== 'string' ||
      archive.ciphertext.length > 20000) throw new Error('BACKUP_INVALID');
  const version = String(archive.keyVersion || '');
  const key = await backupKey(env, tenantId, version);
  let bundle;
  try {
    const iv = fromBase64(archive.iv);
    if (iv.length !== 12) throw new Error('invalid iv');
    const bytes = fromBase64(archive.ciphertext);
    if (bytes.length > INSTITUTION_AI_BACKUP_MAX_BYTES + 16) throw new Error('oversize');
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv, additionalData: aad(tenantId, operationId, version),
    }, key, bytes);
    bundle = JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error('BACKUP_INVALID'); }
  if (bundle?.format !== FORMAT || bundle.tenantId !== tenantId ||
      bundle.operationId !== operationId || bundle.record?.tenantId !== tenantId ||
      bundle.record?.operationId !== operationId || !Array.isArray(bundle.audit)) {
    throw new Error('BACKUP_INVALID');
  }
  return { record: bundle.record, audit: bundle.audit };
}
