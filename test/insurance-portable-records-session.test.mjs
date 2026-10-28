import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { encryptPortableRecords, decryptPortableRecords } from '../sites/ekodi-insurance/portable-records.mjs';
import {
  INSURANCE_LOCAL_STATE_KEY, planPortableImport, commitPortableImport,
  rollbackPortableImport
} from '../sites/ekodi-insurance/portable-records-session.mjs';

const passphrase = 'synthetic-test-password-long';
const legacyKey = 'ekodi-insurance-staging-v2';
const revocationKey = 'ekodi-insurance-consultation-access-v1';

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: k => map.has(k) ? map.get(k) : null,
    setItem(k,v) { map.set(k,String(v)); },
    removeItem(k) { map.delete(k); },
    snapshot: () => Object.fromEntries(map.entries())
  };
}
function existing() {
  return {
    policies: [{ id: 'prior', company: 'Current', featureNotInArchive: 'must survive' }],
    claims: [], diagnosis: { memo: 'current diagnosis' },
    consultations: [{ id: 'c1', contact: 'no-transfer' }],
    advisorChat: { messages: [{ id: 'old', role: 'user', text: 'private old history' }] }
  };
}
async function archive() {
  return encryptPortableRecords({
    policies: [{ id: 'new', company: 'Previous browser' }],
    claims: [{ id: 'claim', type: '통원진료', detail: 'Synthetic note' }]
  }, passphrase, { webcrypto });
}

test('staged import has no storage side effects, requires explicit backup acknowledgement and consent', async () => {
  const old = existing();
  const local = storage({
    [legacyKey]: JSON.stringify(old),
    [revocationKey]: JSON.stringify([{ id: 'remote', accessToken: 'KEEP-SECRET' }])
  });
  const before = local.snapshot();
  const plan = await planPortableImport({
    storage: local, encryptedFile: await archive(),
    importPassphrase: passphrase, backupPassphrase: passphrase,
    webcrypto
  });
  assert.deepEqual(local.snapshot(), before, 'planning cannot write state');
  assert.equal(plan.summary.addedPolicies, 1);
  assert.equal(plan.summary.addedClaims, 1);
  assert.equal(plan.legacyKey, legacyKey);
  const backup = await decryptPortableRecords(plan.encryptedBackup, passphrase, { webcrypto });
  assert.equal(backup.policies.length, 1);
  assert.equal(backup.messages.length, 1);
  assert.equal(backup.diagnosis.memo, 'current diagnosis');
  assert.doesNotMatch(plan.encryptedBackup, /KEEP-SECRET|no-transfer|private old history/);
  assert.throws(() => commitPortableImport({ storage: local, plan, explicitUserConsent: true }), /backup.*consent/);
  assert.deepEqual(local.snapshot(), before);
  assert.throws(() => commitPortableImport({ storage: local, plan, acknowledgedBackup: true }), /backup.*consent/);
  const result = commitPortableImport({
    storage: local, plan, acknowledgedBackup: true, explicitUserConsent: true
  });
  assert.equal(result.committed, true);
  const merged = JSON.parse(local.getItem(INSURANCE_LOCAL_STATE_KEY));
  assert.equal(merged.policies.length, 2);
  assert.equal(merged.policies[0].featureNotInArchive, 'must survive');
  assert.equal(merged.consultations[0].contact, 'no-transfer');
  assert.equal(local.getItem(revocationKey), before[revocationKey]);
  assert.equal(local.getItem(legacyKey), before[legacyKey]);
  assert.equal(result.requiresPageReload, true);
  const rolled = rollbackPortableImport({ storage: local, plan, explicitUserConsent: true });
  assert.equal(rolled.restored, true);
  assert.equal(local.getItem(INSURANCE_LOCAL_STATE_KEY), null);
  assert.deepEqual(local.snapshot(), before);
});

test('concurrent storage changes block import and rollback rather than overwrite new data', async () => {
  const local = storage({ [INSURANCE_LOCAL_STATE_KEY]: JSON.stringify(existing()) });
  const plan = await planPortableImport({
    storage: local, encryptedFile: await archive(),
    importPassphrase: passphrase, backupPassphrase: passphrase, webcrypto
  });
  local.setItem(INSURANCE_LOCAL_STATE_KEY, '{"newer":"user-edited"}');
  assert.throws(() => commitPortableImport({
    storage: local, plan, acknowledgedBackup: true, explicitUserConsent: true
  }), /changed since preview/);
  local.setItem(INSURANCE_LOCAL_STATE_KEY, plan.originalMainRaw);
  commitPortableImport({ storage: local, plan, acknowledgedBackup: true, explicitUserConsent: true });
  local.setItem(INSURANCE_LOCAL_STATE_KEY, '{"newer":"user-edited-after-import"}');
  assert.throws(() => rollbackPortableImport({ storage: local, plan, explicitUserConsent: true }), /changed since import/);
  assert.equal(local.getItem(INSURANCE_LOCAL_STATE_KEY), '{"newer":"user-edited-after-import"}');
});

test('corrupt existing browser records fail closed, without overwriting either origin key', async () => {
  const local = storage({ [legacyKey]: '{bad-json', [revocationKey]: 'private' });
  const before = local.snapshot();
  await assert.rejects(planPortableImport({
    storage: local, encryptedFile: await archive(),
    importPassphrase: passphrase, backupPassphrase: passphrase, webcrypto
  }), /malformed/);
  assert.deepEqual(local.snapshot(), before);
});


test('importing optional diagnosis and chat requires fresh target-side consent', async () => {
  const sensitive = {
    policies: [], claims: [],
    diagnosis: { memo: 'fictional health-related note' },
    advisorChat: { messages: [{ id: 'm2', role: 'user', text: 'fictional AI conversation' }] }
  };
  const encryptedFile = await encryptPortableRecords(sensitive, passphrase, {
    includeDiagnosis: true, includeChat: true, webcrypto
  });
  const local = storage({ [INSURANCE_LOCAL_STATE_KEY]: JSON.stringify(existing()) });
  const before = local.snapshot();
  const args = {
    storage: local, encryptedFile, importPassphrase: passphrase,
    backupPassphrase: passphrase, webcrypto
  };
  await assert.rejects(planPortableImport(args), /diagnosis import requires separate explicit consent/);
  await assert.rejects(planPortableImport({ ...args, includeDiagnosis: true }), /AI chat import requires separate explicit consent/);
  assert.deepEqual(local.snapshot(), before, 'failed consent gates never mutate storage');
  const plan = await planPortableImport({ ...args, includeDiagnosis: true, includeChat: true });
  assert.equal(plan.summary.diagnosisInArchive, true);
  assert.equal(plan.summary.messagesInArchive, 1);
  assert.equal(plan.summary.addedMessages, 1);
  assert.deepEqual(local.snapshot(), before, 'consent permits preview, not automatic commit');
});
