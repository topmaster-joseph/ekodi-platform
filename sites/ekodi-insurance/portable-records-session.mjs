// Insurance migration transaction prototype: NOT connected to any live page.
// Explicit injection of storage + explicit user acknowledgement before writes.
import {
  decryptPortableRecords, encryptPortableRecords, previewPortableMerge
} from './portable-records.mjs';

export const INSURANCE_LOCAL_STATE_KEY = 'ekodi-insurance-staging-v3';
const LEGACY_KEYS = ['ekodi-insurance-staging-v2', 'ekodi-insurance-staging-v1'];

function storageApi(storage) {
  if (!storage || typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new Error('browser local storage capability required');
  }
  return storage;
}
function readExisting(storage) {
  const mainRaw = storage.getItem(INSURANCE_LOCAL_STATE_KEY);
  const legacyKey = mainRaw === null
    ? LEGACY_KEYS.find(key => storage.getItem(key) !== null)
    : null;
  const raw = mainRaw ?? (legacyKey ? storage.getItem(legacyKey) : null);
  if (raw !== null && typeof raw !== 'string') throw new Error('local record type invalid');
  let parsed = {};
  if (raw !== null) {
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('existing browser records are malformed: migration blocked'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('existing browser records are malformed: migration blocked');
    }
  }
  return { raw, currentMainRaw: mainRaw, legacyKey: legacyKey || null, state: parsed };
}
function unchanged(storage, plan) {
  if (storage.getItem(INSURANCE_LOCAL_STATE_KEY) !== plan.originalMainRaw) {
    throw new Error('browser data changed since preview; repeat import');
  }
  if (plan.legacyKey && storage.getItem(plan.legacyKey) !== plan.originalLegacyRaw) {
    throw new Error('legacy browser data changed since preview; repeat import');
  }
}
// Returns a candidate only. Never writes to storage or sends network requests.
// The UI must require explicit clicks and user-selected encrypted file.
export async function planPortableImport({
  storage, encryptedFile, importPassphrase, backupPassphrase,
  webcrypto = globalThis.crypto
}) {
  const target = storageApi(storage);
  const before = readExisting(target);
  const imported = await decryptPortableRecords(encryptedFile, importPassphrase, { webcrypto });
  const { summary, nextState } = previewPortableMerge(before.state, imported);
  // Backup covers existing self-care fields, including optional diagnosis/chat.
  // Submitted consultations and browser-side revoke credentials are never exported.
  const backupEnvelope = await encryptPortableRecords(before.state, backupPassphrase, {
    includeDiagnosis: true, includeChat: true, webcrypto
  });
  const newRaw = JSON.stringify(nextState);
  return Object.freeze({
    summary: Object.freeze({ ...summary }),
    encryptedBackup: backupEnvelope,
    originalMainRaw: before.currentMainRaw,
    legacyKey: before.legacyKey,
    originalLegacyRaw: before.legacyKey ? before.raw : null,
    proposedMainRaw: newRaw
  });
}
export function commitPortableImport({
  storage, plan, acknowledgedBackup = false, explicitUserConsent = false
}) {
  const target = storageApi(storage);
  if (!acknowledgedBackup || !explicitUserConsent) {
    throw new Error('encrypted backup and explicit user consent required before import');
  }
  if (!plan || typeof plan.proposedMainRaw !== 'string') throw new Error('invalid import plan');
  unchanged(target, plan);
  // Browser storage setItem is an atomic same-origin key write: old legacy keys
  // are not removed, and consultation/revoke keys are never touched here.
  target.setItem(INSURANCE_LOCAL_STATE_KEY, plan.proposedMainRaw);
  if (target.getItem(INSURANCE_LOCAL_STATE_KEY) !== plan.proposedMainRaw) {
    throw new Error('local browser storage verification failed');
  }
  return Object.freeze({ committed: true, preservedLegacy: true, requiresPageReload: true });
}
export function rollbackPortableImport({ storage, plan, explicitUserConsent = false }) {
  const target = storageApi(storage);
  if (!explicitUserConsent) throw new Error('explicit rollback consent required');
  if (!plan || typeof plan.proposedMainRaw !== 'string') throw new Error('invalid import plan');
  if (target.getItem(INSURANCE_LOCAL_STATE_KEY) !== plan.proposedMainRaw) {
    throw new Error('browser data changed since import; automated rollback forbidden');
  }
  if (plan.originalMainRaw === null) target.removeItem(INSURANCE_LOCAL_STATE_KEY);
  else target.setItem(INSURANCE_LOCAL_STATE_KEY, plan.originalMainRaw);
  if (target.getItem(INSURANCE_LOCAL_STATE_KEY) !== plan.originalMainRaw) {
    throw new Error('rollback verification failed');
  }
  return Object.freeze({ restored: true, preservedLegacy: true, requiresPageReload: true });
}
