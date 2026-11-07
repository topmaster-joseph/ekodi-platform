import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalReceiptStatement, verifyPointsManualReceipt, verifyEncryptedArtifact, AGE_HEADER,
  PRODUCTION_PROJECT } from '../scripts/verify-points-manual-backup-receipt.mjs';
const op = generateKeyPairSync('ed25519');
const restorer = generateKeyPairSync('ed25519');
const now = new Date('2026-11-07T12:00:00.000Z');
const keys = {
  expectedCommit:'a'.repeat(40),expectedDriveId:'shared-drive-fixture',
  encryptedFolderId:'encrypted-folder-fixture',restoreFolderId:'restore-folder-fixture',
  backupOperatorPublicKey:op.publicKey.export({type:'spki',format:'pem'}),
  independentRestorerPublicKey:restorer.publicKey.export({type:'spki',format:'pem'}),now,
};
const artifact=Buffer.concat([Buffer.from(AGE_HEADER),randomBytes(320)]);
const sha256=createHash('sha256').update(artifact).digest('hex');
function packet() {
  const statement={version:1,type:'ekodi_points_manual_backup_restore',project_ref:PRODUCTION_PROJECT,
    source_commit:keys.expectedCommit,backup_created_at:'2026-11-07T10:00:00.000Z',
    restore_verified_at:'2026-11-07T11:00:00.000Z',
    archive:{encryption:'age-x25519-v1',drive_id:keys.expectedDriveId,
      parent_folder_id:keys.encryptedFolderId,file_id:'encrypted-file-fixture',sha256,bytes:artifact.length},
    restore:{success:true,target:'isolated_nonproduction_postgres',folder_id:keys.restoreFolderId,
      evidence_file_id:'restore-proof-fixture',checks:[
        'pg_restore_success','critical_tables_present','rls_and_grants_checked',
        'identity_integrity_checked','row_counts_compared']}};
  const msg=Buffer.from(canonicalReceiptStatement(statement));
  return {statement,signatures:{
    backup_operator:{actor:'backup-custodian',signature:sign(null,msg,op.privateKey).toString('base64')},
    independent_restorer:{actor:'restore-auditor',signature:sign(null,msg,restorer.privateKey).toString('base64')},
  }};
}
const reseal=p=>{
 const m=Buffer.from(canonicalReceiptStatement(p.statement));
 p.signatures.backup_operator.signature=sign(null,m,op.privateKey).toString('base64');
 p.signatures.independent_restorer.signature=sign(null,m,restorer.privateKey).toString('base64');
 return p;
};

test('valid independent signatures and source-bound restore evidence remain non-authorizing',()=>{
 const v=verifyPointsManualReceipt(packet(),keys);
 assert.equal(v.status,'signed_restore_receipt_valid');
 assert.equal(v.points_activation_authorized,false);
 assert.equal(v.production_schema_write_authorized,false);
 assert.equal(v.signature_roles_verified,2);
});
test('tampered statement, forged signatures and same signer fail closed',()=>{
 const altered=packet();altered.statement.archive.sha256='b'.repeat(64);
 assert.throws(()=>verifyPointsManualReceipt(altered,keys),/SIGNATURE_INVALID/);
 const same=packet();same.signatures.independent_restorer.actor=same.signatures.backup_operator.actor;
 assert.throws(()=>verifyPointsManualReceipt(same,keys),/TWO_INDEPENDENT_ACTORS/);
 assert.throws(()=>verifyPointsManualReceipt(packet(),{...keys,independentRestorerPublicKey:keys.backupOperatorPublicKey}),/TWO_INDEPENDENT_KEYS/);
});
test('production scope, folder and release SHA are strict',()=>{
 const p=packet();p.statement.project_ref='lxcxwbdwwojjkgybbqii';reseal(p);
 assert.throws(()=>verifyPointsManualReceipt(p,keys),/PROJECT_MISMATCH/);
 const x=packet();x.statement.archive.parent_folder_id='other-folder-fixture';reseal(x);
 assert.throws(()=>verifyPointsManualReceipt(x,keys),/LOCATION_MISMATCH/);
 assert.throws(()=>verifyPointsManualReceipt(packet(),{...keys,expectedCommit:'b'.repeat(40)}),/SOURCE_COMMIT_MISMATCH/);
});
test('stale proof, missing restore check or untrusted restore target is refused',()=>{
 const stale=packet();stale.statement.backup_created_at='2026-11-03T00:00:00.000Z';reseal(stale);
 assert.throws(()=>verifyPointsManualReceipt(stale,keys),/BACKUP_STALE/);
 const checks=packet();checks.statement.restore.checks=['pg_restore_success'];reseal(checks);
 assert.throws(()=>verifyPointsManualReceipt(checks,keys),/RESTORE_CHECKS_MISSING/);
 const target=packet();target.statement.restore.target='production';reseal(target);
 assert.throws(()=>verifyPointsManualReceipt(target,keys),/RESTORE_NOT_VERIFIED/);
});
test('real encrypted artifact download must match its signed hash and length',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ekodi-points-proof-'));
 try {
   const path=join(dir,'fixture.age');await writeFile(path,artifact);
   const p=packet(), result=verifyPointsManualReceipt(p,keys);
   assert.equal((await verifyEncryptedArtifact(path,result)).artifact_hash_verified,true);
   await assert.rejects(verifyEncryptedArtifact(path,{...result,sha256:'0'.repeat(64)}),/HASH_MISMATCH/);
   await assert.rejects(verifyEncryptedArtifact(path,{...result,bytes:result.bytes+1}),/SIZE_MISMATCH/);
   const plain=join(dir,'plaintext.sql');await writeFile(plain,randomBytes(artifact.length));
   await assert.rejects(verifyEncryptedArtifact(plain,result),/NOT_AGE_FORMAT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
