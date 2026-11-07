import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/verify-points-manual-backup-evidence.yml',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/verify-points-manual-backup-receipt.mjs',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../storage-gateway.js',import.meta.url),'utf8');
const writer=readFileSync(new URL('../canonical-drive-writer.js',import.meta.url),'utf8');

test('manual proof workflow never accepts public Drive file IDs as dispatch inputs',()=>{
  assert.doesNotMatch(workflow,/inputs\.(?:encrypted_file_id|signed_receipt_file_id)/);
  assert.match(workflow,/secrets\.POINTS_MANUAL_ARCHIVE_FILE_ID/);
  assert.match(workflow,/secrets\.POINTS_MANUAL_RECEIPT_FILE_ID/);
  assert.match(workflow,/secrets\.POINTS_MANUAL_EXPECTED_MANIFEST_FOLDER_ID/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
});
test('signed claims are verified before any externally claimed evidence ID is dereferenced',()=>{
  const signatureCheck=workflow.indexOf('--signed-pointers');
  const evidenceFetch=workflow.indexOf('fetch_protected "files/$evidence_id"');
  assert.ok(signatureCheck>0 && evidenceFetch>signatureCheck);
  assert.match(workflow,/test "\$archive_id" = "\$ARCHIVE_ID"/);
  assert.match(workflow,/POINTS_MANUAL_RESTORE_FILE_ID/);
  assert.match(workflow,/file-provenance\/\$ARCHIVE_ID/);
  assert.match(workflow,/file-provenance\/\$RECEIPT_ID/);
  assert.match(workflow,/file-provenance\/\$evidence_id/);
  assert.match(workflow,/--max-redirs 0/);
});
test('Storage Gateway exposes only authenticated no-store Google metadata, not raw OAuth state',()=>{
  assert.match(gateway,/if \(!authorized\(request, env\)\)/);
  assert.match(gateway,/readCanonicalDriveMetadata\(env,fileId\)/);
  assert.match(gateway,/cache-control': 'no-store'/);
  assert.match(writer,/export async function readCanonicalDriveMetadata/);
  assert.match(writer,/metadata\?\.driveId!==connection\.drive_id/);
  assert.match(writer,/fields=id,driveId,parents,size,mimeType/);
  assert.doesNotMatch(gateway,/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
});
test('new provenance verification never promotes production points, backups, or economic awards',()=>{
  assert.match(source,/production_schema_write_authorized:false/);
  assert.match(source,/points_activation_authorized:false/);
  assert.match(source,/verifyRestoreEvidenceFile/);
  assert.match(source,/actual_google_drive_parents_verified/);
  assert.doesNotMatch(workflow,/supabase db push|supabase db reset|supabase functions deploy|POINTS_ENABLED=true/);
});
