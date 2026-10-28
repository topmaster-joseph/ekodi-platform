// EKODI Insurance portable self-care records, candidate for privacy/security review.
// This file has no DOM, storage, network, consultation or credential side effects.
// It is intentionally NOT linked from either live origin pending protected review.
const ENVELOPE_FORMAT = 'ekodi-insurance-portable-v1';
const DATA_FORMAT = 'ekodi-insurance-selfcare-v1';
const ITERATIONS = 600000;
const MAX_ARCHIVE = 3 * 1024 * 1024;
const MAX_PLAINTEXT = 2 * 1024 * 1024;
const MAX_RECORDS = 500;
const aad = new TextEncoder().encode(ENVELOPE_FORMAT);

const POLICY_FIELDS = Object.freeze({
  id: 120, company: 200, product: 200, premium: 40,
  purpose: 120, reviewDate: 32, createdAt: 48
});
const CLAIM_FIELDS = Object.freeze({
  id: 120, type: 100, amount: 40, date: 32,
  policy: 120, detail: 2400, createdAt: 48
});
const DIAGNOSIS_FIELDS = Object.freeze({
  age: 60, family: 100, job: 100, premium: 40, policyCount: 12,
  concern: 200, memo: 2400, createdAt: 48
});
const MESSAGE_FIELDS = Object.freeze({
  id: 120, role: 20, text: 2400, createdAt: 48
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  return value;
}
function textField(value, size, label) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(label + ' must be text');
  }
  const result = String(value);
  if (result.length > size) throw new Error(label + ' exceeds allowed size');
  return result;
}
function cleanRow(raw, fields, label) {
  const row = object(raw, label);
  const result = Object.create(null);
  for (const [key, max] of Object.entries(fields)) {
    result[key] = textField(Object.hasOwn(row, key) ? row[key] : '', max, label + '.' + key);
  }
  return result;
}
function cleanList(raw, fields, label) {
  if (!Array.isArray(raw)) throw new Error(label + ' must be an array');
  if (raw.length > MAX_RECORDS) throw new Error(label + ' record limit exceeded');
  return raw.map((entry, index) => cleanRow(entry, fields, label + '[' + index + ']'));
}
function cleanDiagnosis(value) {
  if (value == null) return null;
  // Do not carry computed scoring, recommendations or unreviewed nested fields.
  return cleanRow(value, DIAGNOSIS_FIELDS, 'diagnosis');
}
function cleanMessages(value) {
  const messages = cleanList(value, MESSAGE_FIELDS, 'messages');
  for (const message of messages) {
    if (!['user', 'assistant'].includes(message.role)) throw new Error('invalid chat role');
  }
  return messages;
}
function safeRecords(input, options = {}) {
  const source = object(input, 'local records');
  const { includeDiagnosis = false, includeChat = false } = options;
  const result = {
    policies: cleanList(Object.hasOwn(source, 'policies') ? source.policies : [], POLICY_FIELDS, 'policies'),
    claims: cleanList(Object.hasOwn(source, 'claims') ? source.claims : [], CLAIM_FIELDS, 'claims')
  };
  if (includeDiagnosis) result.diagnosis = cleanDiagnosis(source.diagnosis);
  if (includeChat) {
    const hasChat = Object.hasOwn(source, 'advisorChat');
    const chat = hasChat ? object(source.advisorChat, 'advisorChat') : {};
    const messages = Object.hasOwn(chat, 'messages') ? chat.messages : [];
    result.messages = cleanMessages(messages);
  }
  // Never export consultations, encrypted server data, callback/contact data,
  // bearer access tokens, cookies, cross-site sessions or unknown fields.
  return result;
}
function validatePortable(data) {
  const root = object(data, 'plaintext archive');
  if (root.format !== DATA_FORMAT || root.version !== 1) throw new Error('unsupported self-care data version');
  if (!Object.hasOwn(root, 'records')) throw new Error('records missing');
  const source = object(root.records, 'records');
  const allowed = ['policies', 'claims', 'diagnosis', 'messages'];
  if (Object.keys(source).some(k => !allowed.includes(k))) throw new Error('unapproved records field');
  if (!Object.hasOwn(source, 'policies') || !Object.hasOwn(source, 'claims')) throw new Error('required record lists missing');
  const records = {
    policies: cleanList(source.policies, POLICY_FIELDS, 'policies'),
    claims: cleanList(source.claims, CLAIM_FIELDS, 'claims')
  };
  if (Object.hasOwn(source, 'diagnosis')) records.diagnosis = cleanDiagnosis(source.diagnosis);
  if (Object.hasOwn(source, 'messages')) records.messages = cleanMessages(source.messages);
  return records;
}
function getCrypto(webcrypto) {
  if (!webcrypto?.subtle || !webcrypto?.getRandomValues) throw new Error('Web Crypto unavailable');
  return webcrypto;
}
function passphraseText(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256) {
    throw new Error('Password must contain 12–256 characters');
  }
  return new TextEncoder().encode(passphrase);
}
function encode64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768) {
    result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(result);
}
function decode64(value, expectedLength = null) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > MAX_ARCHIVE * 2) {
    throw new Error('invalid encrypted archive');
  }
  let decoded;
  try {
    const str = atob(value);
    decoded = Uint8Array.from(str, ch => ch.charCodeAt(0));
  } catch {
    throw new Error('invalid encrypted archive');
  }
  if (expectedLength !== null && decoded.length !== expectedLength) throw new Error('invalid encryption parameter');
  return decoded;
}
async function keyFor(webcrypto, passphrase, salt, usage) {
  const input = await webcrypto.subtle.importKey('raw', passphraseText(passphrase), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    input, { name: 'AES-GCM', length: 256 }, false, [usage]
  );
}

export function portableRecordPreview(state, options = {}) {
  const r = safeRecords(state, options);
  return Object.freeze({
    policies: r.policies.length,
    claims: r.claims.length,
    diagnosis: Boolean(r.diagnosis),
    messages: r.messages?.length || 0,
    consultationsExcluded: true,
    accessTokensExcluded: true
  });
}

export async function encryptPortableRecords(state, passphrase, {
  includeDiagnosis = false, includeChat = false, webcrypto = globalThis.crypto
} = {}) {
  const wc = getCrypto(webcrypto);
  const records = safeRecords(state, { includeDiagnosis, includeChat });
  const data = new TextEncoder().encode(JSON.stringify({ format: DATA_FORMAT, version: 1, records }));
  if (data.byteLength > MAX_PLAINTEXT) throw new Error('self-care archive exceeds size limit');
  const salt = wc.getRandomValues(new Uint8Array(16));
  const iv = wc.getRandomValues(new Uint8Array(12));
  const key = await keyFor(wc, passphrase, salt, 'encrypt');
  const payload = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, data));
  const envelope = JSON.stringify({
    format: ENVELOPE_FORMAT, version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: encode64(salt) },
    cipher: { name: 'AES-256-GCM', iv: encode64(iv) }, payload: encode64(payload)
  });
  if (new TextEncoder().encode(envelope).length > MAX_ARCHIVE) throw new Error('encrypted archive exceeds size limit');
  return envelope;
}

export async function decryptPortableRecords(envelopeText, passphrase, { webcrypto = globalThis.crypto } = {}) {
  const wc = getCrypto(webcrypto);
  if (typeof envelopeText !== 'string' || new TextEncoder().encode(envelopeText).length > MAX_ARCHIVE) {
    throw new Error('encrypted archive exceeds size limit');
  }
  let e;
  try { e = JSON.parse(envelopeText); } catch { throw new Error('invalid encrypted archive'); }
  object(e, 'encrypted archive');
  if (e.format !== ENVELOPE_FORMAT || e.version !== 1 ||
      e.kdf?.name !== 'PBKDF2' || e.kdf?.hash !== 'SHA-256' || e.kdf?.iterations !== ITERATIONS ||
      e.cipher?.name !== 'AES-256-GCM') {
    throw new Error('unsupported encrypted archive version');
  }
  // Reject unexpected plaintext metadata: the encrypted file must never become
  // a covert carrier for contact data or bearer capability outside ciphertext.
  const exactly = (record, fields, label) => {
    const names = Object.keys(object(record, label));
    if (names.length !== fields.length || names.some(name => !fields.includes(name))) {
      throw new Error('unexpected ' + label + ' field');
    }
  };
  exactly(e, ['format', 'version', 'kdf', 'cipher', 'payload'], 'archive');
  exactly(e.kdf, ['name', 'hash', 'iterations', 'salt'], 'kdf');
  exactly(e.cipher, ['name', 'iv'], 'cipher');
  const salt = decode64(e.kdf.salt, 16);
  const iv = decode64(e.cipher.iv, 12);
  const cipher = decode64(e.payload);
  if (cipher.length < 17 || cipher.length > MAX_PLAINTEXT + 16) throw new Error('invalid encrypted archive');
  const key = await keyFor(wc, passphrase, salt, 'decrypt');
  let bytes;
  try { bytes = await wc.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, cipher); }
  catch { throw new Error('Password incorrect or encrypted archive damaged'); }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('invalid self-care records'); }
  return validatePortable(data);
}
function signature(record) {
  // Internal merge key only; never transmitted, stored, logged or exported.
  return record.id || JSON.stringify(record);
}
function mergeList(current, imported, fields, label) {
  // Validate existing records for merge-key safety but preserve every original
  // object and future field byte-for-byte: never replace local data with the
  // portable export's intentionally reduced allowlist.
  const existing = current == null ? [] : current;
  const left = cleanList(existing, fields, label);
  const seen = new Set(left.map(signature));
  const result = existing.slice();
  let added = 0;
  for (const item of imported) {
    const key = signature(item);
    if (seen.has(key)) continue;
    if (result.length >= MAX_RECORDS) throw new Error(label + ' merge would exceed record limit');
    result.push(item);
    seen.add(key);
    added += 1;
  }
  return { entries: result, added };
}
export function previewPortableMerge(existingState, importedRecords) {
  const current = object(existingState, 'existing browser records');
  const imported = validatePortable({ format: DATA_FORMAT, version: 1, records: importedRecords });
  const policy = mergeList(current.policies, imported.policies, POLICY_FIELDS, 'policies');
  const claim = mergeList(current.claims, imported.claims, CLAIM_FIELDS, 'claims');
  const summary = { addedPolicies: policy.added, addedClaims: claim.added, keptExistingDiagnosis: Boolean(current.diagnosis), consultationsUnaffected: true, accessTokensUnaffected: true };
  const nextState = {
    ...current, policies: policy.entries, claims: claim.entries,
    diagnosis: current.diagnosis || imported.diagnosis || null
  };
  if (Object.hasOwn(imported, 'messages')) {
    const chat = mergeList(current.advisorChat?.messages, imported.messages, MESSAGE_FIELDS, 'messages');
    // Existing local chat log has its own 60-message retention bound.
    nextState.advisorChat = { ...current.advisorChat, messages: chat.entries.slice(-60) };
    summary.addedMessages = chat.added;
  }
  // No localStorage writes here. The UI must require explicit confirm + backup
  // before applying nextState; consultation and revoke capability remain intact.
  return { summary, nextState };
}
