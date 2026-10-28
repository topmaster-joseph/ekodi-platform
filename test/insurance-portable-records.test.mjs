import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  portableRecordPreview, encryptPortableRecords, decryptPortableRecords,
  previewPortableMerge
} from '../sites/ekodi-insurance/portable-records.mjs';

const pw = 'this-is-a-test-passphrase-only';
function sample() {
  return {
    policies: [{ id: 'p1', company: 'Example 보험', product: 'Local only', premium: '12000', purpose: '실손·의료', reviewDate: '2027-01-01', createdAt: '2026-10-28' }],
    claims: [{ id: 'c1', type: '통원진료', detail: 'Example claim private note', amount: '43000', date: '2026-10-28', policy: 'p1' }],
    diagnosis: { age: '40대', family: '자녀 있음', memo: 'Example personal concern', priority: { score: 100 } },
    advisorChat: { messages: [{ id: 'm1', role: 'user', text: 'Example sensitive chat', createdAt: '2026-10-28' }] },
    consultations: [{ id: 'server1', contact: '010-1234-5678', transcript: 'secret private data', accessToken: 'NEVER-EXPORT' }],
    'ekodi-insurance-consultation-access-v1': [{ accessToken: 'SECRET-CAPABILITY' }]
  };
}

test('opt-in portable format is fully encrypted and excludes sensitive handoff data by default', async () => {
  const s = sample();
  const preview = portableRecordPreview(s);
  assert.deepEqual(preview, {
    policies: 1, claims: 1, diagnosis: false, messages: 0,
    consultationsExcluded: true, accessTokensExcluded: true
  });
  const blob = await encryptPortableRecords(s, pw, { webcrypto });
  assert.doesNotMatch(blob, /Example 보험|Example claim|010-1234|NEVER-EXPORT|SECRET-CAPABILITY|Example personal concern|Example sensitive chat/);
  const decrypted = await decryptPortableRecords(blob, pw, { webcrypto });
  assert.equal(decrypted.policies[0].company, 'Example 보험');
  assert.equal(decrypted.claims[0].detail, 'Example claim private note');
  assert.equal(Object.hasOwn(decrypted, 'diagnosis'), false);
  assert.equal(Object.hasOwn(decrypted, 'messages'), false);
  assert.equal(Object.hasOwn(decrypted, 'consultations'), false);
  assert.equal(Object.hasOwn(decrypted, 'accessToken'), false);
});

test('diagnosis and AI chat require independent explicit opt-in', async () => {
  const s = sample();
  const blob = await encryptPortableRecords(s, pw, {
    webcrypto, includeChat: true, includeDiagnosis: true
  });
  const data = await decryptPortableRecords(blob, pw, { webcrypto });
  assert.equal(data.diagnosis.memo, 'Example personal concern');
  assert.equal(data.messages[0].text, 'Example sensitive chat');
  assert.equal(Object.hasOwn(data.diagnosis, 'priority'), false);
  assert.equal(Object.hasOwn(data, 'consultations'), false);
});

test('wrong password, archive edits and invalid crypto parameters fail closed', async () => {
  const blob = await encryptPortableRecords(sample(), pw, { webcrypto });
  await assert.rejects(decryptPortableRecords(blob, 'another-long-test-password', { webcrypto }), /incorrect|damaged/);
  const tampered = JSON.parse(blob);
  tampered.payload = tampered.payload.replace(/[A-Za-z0-9]/, x => x === 'A' ? 'B' : 'A');
  await assert.rejects(decryptPortableRecords(JSON.stringify(tampered), pw, { webcrypto }), /incorrect|damaged/);
  const downgrade = JSON.parse(blob);
  downgrade.kdf.iterations = 1000;
  await assert.rejects(decryptPortableRecords(JSON.stringify(downgrade), pw, { webcrypto }), /unsupported/);
  await assert.rejects(encryptPortableRecords(sample(), 'short', { webcrypto }), /12/);
  await assert.rejects(decryptPortableRecords('{', pw, { webcrypto }), /invalid/);
});

test('import preview preserves local consultations and existing records; repeated import is idempotent', async () => {
  const old = sample();
  const imported = await decryptPortableRecords(await encryptPortableRecords(old, pw, { webcrypto }), pw, { webcrypto });
  const current = {
    policies: [{ id: 'p1', company: 'Keep-current', product: 'Local record' }],
    claims: [],
    consultations: [{ id: 'existing', contact: 'keep-secret' }],
    advisorChat: { messages: [{ id: 'current', role: 'assistant', text: 'keep' }] },
    diagnosis: { memo: 'current wins' }
  };
  const result = previewPortableMerge(current, imported);
  assert.equal(result.summary.addedPolicies, 0);
  assert.equal(result.summary.addedClaims, 1);
  assert.equal(result.nextState.policies[0].company, 'Keep-current');
  assert.equal(result.nextState.diagnosis.memo, 'current wins');
  assert.strictEqual(result.nextState.consultations, current.consultations);
  assert.equal(current.claims.length, 0, 'preview must never mutate browser state');
  const duplicate = previewPortableMerge(result.nextState, imported);
  assert.equal(duplicate.summary.addedClaims, 0);
  assert.equal(duplicate.summary.addedPolicies, 0);
});

test('malicious imported fields and too many rows are rejected or discarded without prototype pollution', async () => {
  const source = sample();
  source.policies[0] = JSON.parse('{"id":"safe","company":"Example","__proto__":{"polluted":true},"accessToken":"bad"}');
  const archive = await encryptPortableRecords(source, pw, { webcrypto });
  const records = await decryptPortableRecords(archive, pw, { webcrypto });
  assert.equal(Object.hasOwn(records.policies[0], '__proto__'), false);
  assert.equal(Object.hasOwn(records.policies[0], 'accessToken'), false);
  assert.equal({}.polluted, undefined);
  assert.throws(() => previewPortableMerge(sample(), { policies: [], claims: [], consultations: [] }), /unapproved/);
  const many = sample();
  many.policies = Array.from({ length: 501 }, (_, i) => ({ id: String(i) }));
  await assert.rejects(encryptPortableRecords(many, pw, { webcrypto }), /limit/);
});

test('module has no imports, localStorage, network, file writes or DOM side effects', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../sites/ekodi-insurance/portable-records.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /(?:\blocalStorage\.|\bindexedDB\.|\bdocument\.|\bwindow\.|\bfetch\(|\bXMLHttpRequest\b|navigator\.sendBeacon|\bwriteFile\()/);
  assert.match(src, /PBKDF2/);
  assert.match(src, /AES-GCM/);
});


test('merge preview retains every preexisting local field and original object reference', async () => {
  const existingRow = {
    id: 'old1', company: 'Current', product: 'Existing',
    coverageNote: 'future metadata must not disappear',
    nestedFutureField: { renew: 'unknown', tags: ['a', 'b'] }
  };
  const old = {
    policies: [existingRow],
    claims: [{ id: 'old-claim', detail: 'do not remove or mutate', unrecognizedLocalField: true }],
    consultations: [{ id: 'server-item', contact: 'must remain' }],
    advisorChat: { messages: [] }
  };
  const incoming = {
    policies: [{ id: 'old1', company: 'Old version' }, { id: 'new1', company: 'Imported' }],
    claims: []
  };
  const result = previewPortableMerge(old, incoming);
  assert.equal(result.summary.addedPolicies, 1);
  assert.strictEqual(result.nextState.policies[0], existingRow);
  assert.strictEqual(result.nextState.claims[0], old.claims[0]);
  assert.deepEqual(result.nextState.policies[0].nestedFutureField, existingRow.nestedFutureField);
  assert.strictEqual(result.nextState.consultations, old.consultations);
  assert.equal(old.policies.length, 1, 'merge preview must not alter original array');
  assert.equal(result.nextState.policies[1].company, 'Imported');
});

test('corrupt local records fail closed instead of silently exporting empty lists', async () => {
  await assert.rejects(encryptPortableRecords({ policies: null, claims: [] }, pw, { webcrypto }), /policies.*array/);
  await assert.rejects(encryptPortableRecords({ policies: [], claims: null }, pw, { webcrypto }), /claims.*array/);
  assert.throws(() => portableRecordPreview({ policies: { id: 'bad' }, claims: [] }), /policies.*array/);
  assert.throws(() => previewPortableMerge({ policies: 'wrong', claims: [] }, { policies: [], claims: [] }), /policies.*array/);
});

test('encrypted envelope rejects covert unencrypted metadata or unexpected parameters', async () => {
  const blob = await encryptPortableRecords(sample(), pw, { webcrypto });
  const archive = JSON.parse(blob);
  archive.accessToken = 'MUST-REJECT-PLAINTEXT';
  await assert.rejects(decryptPortableRecords(JSON.stringify(archive), pw, { webcrypto }), /unexpected archive field/);
  delete archive.accessToken;
  archive.kdf.contact = 'unexpected-plaintext-contact';
  await assert.rejects(decryptPortableRecords(JSON.stringify(archive), pw, { webcrypto }), /unexpected kdf field/);
  delete archive.kdf.contact;
  archive.cipher.note = 'untrusted-plain-text';
  await assert.rejects(decryptPortableRecords(JSON.stringify(archive), pw, { webcrypto }), /unexpected cipher field/);
});
