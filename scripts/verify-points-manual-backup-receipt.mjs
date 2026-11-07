#!/usr/bin/env node
// POINTS-MANUAL-BACKUP-001: cryptographic proof integrity ONLY.
// Never exports/restores production data, authorizes migrations or activates points.
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_PROJECT = 'renzehysxirjilvdxacv';
export const AGE_HEADER = 'age-encryption.org/v1\n';
const REQUIRED_CHECKS = Object.freeze([
  'isolated_restore_success', 'critical_tables_present', 'rls_and_grants_checked',
  'identity_integrity_checked', 'row_counts_compared'
]);
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{12,160}$/;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function assert(condition, code) { if (!condition) throw new Error(code); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  assert(value === null || ['string','number','boolean'].includes(typeof value), 'RECEIPT_VALUE_INVALID');
  if (typeof value === 'number') assert(Number.isFinite(value), 'RECEIPT_NUMBER_INVALID');
  return JSON.stringify(value);
}
export const canonicalReceiptStatement = canonical;

function checkedTime(value, label, now) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), label + '_INVALID_FORMAT');
  const ms = Date.parse(value);
  assert(Number.isFinite(ms) && new Date(ms).toISOString() === value, label + '_INVALID_DATE');
  assert(ms <= now + MAX_CLOCK_SKEW_MS, label + '_FUTURE');
  return ms;
}
function validEd25519(pem) {
  assert(typeof pem === 'string' && pem.includes('BEGIN PUBLIC KEY'), 'RECEIPT_PUBLIC_KEY_MISSING');
  const key = createPublicKey(pem);
  assert(key.asymmetricKeyType === 'ed25519', 'RECEIPT_KEY_TYPE_INVALID');
  return key;
}
function checkedSignature(signature, key, statement, label) {
  assert(typeof signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(signature), label + '_MISSING');
  const raw = Buffer.from(signature, 'base64');
  assert(raw.length === 64 && raw.toString('base64') === signature, label + '_INVALID_ENCODING');
  assert(verifySignature(null, statement, key, raw), label + '_INVALID');
}

// The expected Drive IDs and independent public keys must be injected by the
// protected environment; never hardcode their values in public source.
export function verifyPointsManualReceipt(packet, {expectedCommit, expectedDriveId,
  encryptedFolderId, restoreFolderId, backupOperatorPublicKey,
  independentRestorerPublicKey, now = new Date()} = {}) {
  assert(packet && typeof packet === 'object' && !Array.isArray(packet), 'RECEIPT_PACKET_REQUIRED');
  const s = packet.statement;
  assert(s && typeof s === 'object' && !Array.isArray(s), 'RECEIPT_STATEMENT_REQUIRED');
  assert(s.version === 1 && s.type === 'ekodi_points_manual_backup_restore', 'RECEIPT_VERSION_INVALID');
  assert(s.project_ref === PRODUCTION_PROJECT, 'RECEIPT_PROJECT_MISMATCH');
  assert(typeof expectedCommit === 'string' && COMMIT.test(expectedCommit), 'RECEIPT_EXPECTED_COMMIT_REQUIRED');
  assert(s.source_commit === expectedCommit, 'RECEIPT_SOURCE_COMMIT_MISMATCH');
  for (const [label,id] of [['DRIVE',expectedDriveId],['ENCRYPTED_FOLDER',encryptedFolderId],['RESTORE_FOLDER',restoreFolderId]]) {
    assert(typeof id === 'string' && DRIVE_ID.test(id), 'RECEIPT_EXPECTED_' + label + '_REQUIRED');
  }
  const created = checkedTime(s.backup_created_at, 'RECEIPT_BACKUP_TIME', now.getTime());
  const restored = checkedTime(s.restore_verified_at, 'RECEIPT_RESTORE_TIME', now.getTime());
  assert(restored >= created, 'RECEIPT_RESTORE_BEFORE_BACKUP');
  assert(now.getTime() - created <= MAX_AGE_MS, 'RECEIPT_BACKUP_STALE');
  assert(now.getTime() - restored <= MAX_AGE_MS, 'RECEIPT_RESTORE_STALE');
  const a = s.archive;
  assert(a && a.encryption === 'age-x25519-v1', 'RECEIPT_ENCRYPTION_INVALID');
  assert(a.drive_id === expectedDriveId && a.parent_folder_id === encryptedFolderId, 'RECEIPT_ARCHIVE_LOCATION_MISMATCH');
  assert(DRIVE_ID.test(String(a.file_id || '')) && SHA.test(String(a.sha256 || '')), 'RECEIPT_ARCHIVE_ID_OR_HASH_INVALID');
  assert(Number.isSafeInteger(a.bytes) && a.bytes >= 256, 'RECEIPT_ARCHIVE_BYTES_INVALID');
  const restore = s.restore;
  assert(restore && restore.target === 'isolated_nonproduction_postgres' && restore.success === true,
    'RECEIPT_RESTORE_NOT_VERIFIED');
  assert(restore.folder_id === restoreFolderId && DRIVE_ID.test(String(restore.evidence_file_id || '')),
    'RECEIPT_RESTORE_EVIDENCE_LOCATION_INVALID');
  assert(Array.isArray(restore.checks) && REQUIRED_CHECKS.every(check => restore.checks.includes(check)),
    'RECEIPT_RESTORE_CHECKS_MISSING');
  assert(SHA.test(String(restore.evidence_sha256||'')) &&
    Number.isSafeInteger(restore.evidence_bytes) && restore.evidence_bytes>=64 &&
    restore.evidence_bytes<=1048576, 'RECEIPT_RESTORE_EVIDENCE_HASH_OR_SIZE_INVALID');
  const op = packet.signatures?.backup_operator;
  const auditor = packet.signatures?.independent_restorer;
  assert(op && auditor && op.actor && auditor.actor && op.actor !== auditor.actor,
    'RECEIPT_TWO_INDEPENDENT_ACTORS_REQUIRED');
  const opKey = validEd25519(backupOperatorPublicKey);
  const restoreKey = validEd25519(independentRestorerPublicKey);
  assert(opKey.export({type:'spki',format:'der'}).toString('hex') !== restoreKey.export({type:'spki',format:'der'}).toString('hex'),
    'RECEIPT_TWO_INDEPENDENT_KEYS_REQUIRED');
  const message = Buffer.from(canonical(s), 'utf8');
  checkedSignature(op.signature, opKey, message, 'RECEIPT_BACKUP_SIGNATURE');
  checkedSignature(auditor.signature, restoreKey, message, 'RECEIPT_RESTORE_SIGNATURE');
  return {
    status:'signed_restore_receipt_valid', project_ref:PRODUCTION_PROJECT,
    signature_roles_verified:2, encrypted_artifact_hash_required:true,
    bytes:a.bytes, sha256:a.sha256,
    backup_age_hours:Math.max(0,(now.getTime()-created)/3600000),
    production_schema_write_authorized:false, points_activation_authorized:false,
    backup_restore_owner_approval_required:true,
  };
}

// The actual encrypted object must be read back and hashed. Signed JSON alone
// is never sufficient. Format sniffing does not prove ciphertext decryptability;
// only a separate real restore drill, signed by another key, can attest that.
export async function verifyEncryptedArtifact(path, {sha256,bytes}) {
  assert(typeof path === 'string' && path.length > 0, 'RECEIPT_ENCRYPTED_ARTIFACT_REQUIRED');
  const f = await stat(path);
  assert(f.isFile() && f.size === bytes, 'RECEIPT_ARCHIVE_SIZE_MISMATCH');
  const hash = createHash('sha256');
  let prefix = Buffer.alloc(0);
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    if (prefix.length < AGE_HEADER.length) prefix = Buffer.concat([prefix,chunk]).subarray(0,AGE_HEADER.length);
  }
  assert(prefix.toString('utf8') === AGE_HEADER, 'RECEIPT_ARCHIVE_NOT_AGE_FORMAT');
  assert(hash.digest('hex') === sha256, 'RECEIPT_ARCHIVE_HASH_MISMATCH');
  return {artifact_hash_verified:true,artifact_bytes:bytes};
}


/**
 * Confirm actual Drive metadata fetched server-side through EKODI Storage
 * Gateway; signed claims alone do not establish physical file locations.
 */
export function verifyPointsDriveProvenance(packet, metadata, options={}) {
  verifyPointsManualReceipt(packet,options);
  const statement=packet.statement;
  const files=[
    ['ARCHIVE',metadata?.archive,statement.archive.file_id,options.expectedArchiveFileId,
      options.encryptedFolderId,statement.archive.bytes],
    ['RECEIPT',metadata?.receipt,options.expectedReceiptFileId,options.expectedReceiptFileId,
      options.manifestFolderId,null],
    ['RESTORE',metadata?.restore,statement.restore.evidence_file_id,options.expectedRestoreFileId,
      options.restoreFolderId,statement.restore.evidence_bytes],
  ];
  assert(DRIVE_ID.test(String(options.manifestFolderId||'')), 'RECEIPT_MANIFEST_FOLDER_REQUIRED');
  for(const [kind,got,signedId,requestedId,parentId,expectedBytes] of files) {
    assert(DRIVE_ID.test(String(requestedId||'')) && signedId===requestedId,
      'RECEIPT_'+kind+'_FILE_ID_MISMATCH');
    assert(got && got.ok===true && got.fileId===signedId &&
      got.driveId===options.expectedDriveId &&
      Array.isArray(got.parentIds) && got.parentIds.length===1 &&
      got.parentIds[0]===parentId,'RECEIPT_'+kind+'_DRIVE_PROVENANCE_MISMATCH');
    assert(Number.isSafeInteger(got.bytes) && got.bytes>0 &&
      (expectedBytes===null || got.bytes===expectedBytes),
      'RECEIPT_'+kind+'_DRIVE_SIZE_MISMATCH');
  }
  return {actual_google_drive_parents_verified:3,production_schema_write_authorized:false,
    points_activation_authorized:false};
}

// An independently signed receipt must reference a real bounded evidence file
// whose hash and fields match the restored archive and all required checks.
// No private evidence contents are logged or returned to the operator.
export async function verifyRestoreEvidenceFile(path,packet) {
  assert(typeof path==='string' && path.length>0,'RECEIPT_RESTORE_EVIDENCE_FILE_REQUIRED');
  const s=packet.statement;
  const evidence=s.restore;
  const info=await stat(path);
  assert(info.isFile() && info.size===evidence.evidence_bytes,
    'RECEIPT_RESTORE_EVIDENCE_SIZE_MISMATCH');
  assert(info.size<=1048576 && info.size>=64,'RECEIPT_RESTORE_EVIDENCE_SIZE_INVALID');
  const file=await readFile(path);
  assert(createHash('sha256').update(file).digest('hex')===evidence.evidence_sha256,
    'RECEIPT_RESTORE_EVIDENCE_HASH_MISMATCH');
  let data;
  try{data=JSON.parse(file.toString('utf8'));}catch{throw new Error('RECEIPT_RESTORE_EVIDENCE_JSON_INVALID');}
  assert(data && !Array.isArray(data) && data.project_ref===s.project_ref &&
    data.source_commit===s.source_commit &&
    data.archive_sha256===s.archive.sha256 &&
    data.archive_file_id===s.archive.file_id &&
    data.target==='isolated_nonproduction_postgres' &&
    data.verified_at===s.restore_verified_at &&
    data.success===true &&
    data.checks && !Array.isArray(data.checks) &&
    REQUIRED_CHECKS.every(name=>data.checks[name]===true),
    'RECEIPT_RESTORE_EVIDENCE_CONTENT_MISMATCH');
  return {actual_restore_evidence_hash_verified:true,production_schema_write_authorized:false,
    points_activation_authorized:false};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receiptPath=process.env.POINTS_MANUAL_RECEIPT_PATH;
    assert(receiptPath,'RECEIPT_PROTECTED_INPUTS_REQUIRED');
    const packet=JSON.parse(await readFile(receiptPath,'utf8'));
    const options={
      expectedCommit:process.env.POINTS_MANUAL_EXPECTED_MAIN_SHA,
      expectedDriveId:process.env.POINTS_MANUAL_EXPECTED_DRIVE_ID,
      encryptedFolderId:process.env.POINTS_MANUAL_EXPECTED_ENCRYPTED_FOLDER_ID,
      manifestFolderId:process.env.POINTS_MANUAL_EXPECTED_MANIFEST_FOLDER_ID,
      restoreFolderId:process.env.POINTS_MANUAL_EXPECTED_RESTORE_FOLDER_ID,
      expectedArchiveFileId:process.env.POINTS_MANUAL_ARCHIVE_FILE_ID,
      expectedReceiptFileId:process.env.POINTS_MANUAL_RECEIPT_FILE_ID,
      expectedRestoreFileId:process.env.POINTS_MANUAL_RESTORE_FILE_ID,
      backupOperatorPublicKey:process.env.POINTS_MANUAL_BACKUP_OPERATOR_PUBKEY,
      independentRestorerPublicKey:process.env.POINTS_MANUAL_INDEPENDENT_RESTORER_PUBKEY,
    };
    const result=verifyPointsManualReceipt(packet,options);
    if(process.argv.includes('--signed-pointers')){
      // This mode verifies both independent signatures before the protected
      // workflow fetches any receipt-declared file IDs. No secrets returned.
      console.log(JSON.stringify({archive_file_id:packet.statement.archive.file_id,
        restore_evidence_file_id:packet.statement.restore.evidence_file_id}));
    }else{
      const encryptedPath=process.env.POINTS_MANUAL_ENCRYPTED_ARTIFACT_PATH;
      const evidencePath=process.env.POINTS_MANUAL_RESTORE_EVIDENCE_PATH;
      const metaPath=process.env.POINTS_MANUAL_DRIVE_METADATA_PATH;
      assert(encryptedPath && evidencePath && metaPath,'RECEIPT_PROTECTED_INPUTS_REQUIRED');
      const metadata=JSON.parse(await readFile(metaPath,'utf8'));
      const locations=verifyPointsDriveProvenance(packet,metadata,options);
      const artifact=await verifyEncryptedArtifact(encryptedPath,result);
      const evidence=await verifyRestoreEvidenceFile(evidencePath,packet);
      console.log(JSON.stringify({
        status:'signed_restore_artifact_and_drive_provenance_verified',
        signature_roles_verified:result.signature_roles_verified,
        actual_google_drive_parents_verified:locations.actual_google_drive_parents_verified,
        artifact_hash_verified:artifact.artifact_hash_verified,
        actual_restore_evidence_hash_verified:evidence.actual_restore_evidence_hash_verified,
        production_schema_write_authorized:false,
        points_activation_authorized:false,
        backup_restore_owner_approval_required:true,
      }));
    }
  } catch(e) {
    console.error('EKODI_POINTS_MANUAL_BACKUP_BLOCKED:'+String(e?.message||'UNKNOWN'));
    process.exitCode=2;
  }
}
