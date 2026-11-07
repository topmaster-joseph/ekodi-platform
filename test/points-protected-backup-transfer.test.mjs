import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {checkBackupAcl,uploadVerifiedEncryptedBackup} from '../scripts/points-protected-backup-transfer.mjs';

const key='fixture-only-server-to-server-gateway-key';
const drive='fixture-ekodi-shared-drive';
const folders={ENCRYPTED_DUMPS:'fixture-encrypted-folder',MANIFESTS:'fixture-manifests-folder'};
const acl={ok:true,status:'private_drive_acl_and_backup_folders_verified',
  canonicalDriveId:drive,subfolderIds:folders,publicOrUnknownMembershipAllowed:false,
  directExtraFolderGrantsAllowed:false,backupExportAuthorized:false,
  productionSchemaWriteAuthorized:false,pointsActivationAuthorized:false};
const recipient='age1'+'q'.repeat(59);
const mainSha='a'.repeat(40);
const ciphertext=Buffer.concat([Buffer.from('age-encryption.org/v1\n'),randomBytes(280)]);
const base='https://ekodi.kr/api/storage/v1';

function fakeStorage({scope=acl,alterParent=false,alterCiphertext=false}={}){
  const entries=new Map(),requests=[];
  const fetchImpl=async(url,init={})=>{
    assert.ok(url.startsWith(base));
    requests.push({url,method:init.method,headers:init.headers,body:init.body});
    if(init.headers['x-ekodi-storage-key']!==key)
      return new Response('unauthorized',{status:401});
    const path=url.slice(base.length);
    if(path==='/backup-acl')
      return Response.json(scope);
    if(path==='/records'&&init.method==='POST'){
      const record=JSON.parse(init.body);
      const id='fixture-uploaded-file-'+(entries.size+1);
      const bytes=record.contentBase64?Buffer.from(record.contentBase64,'base64'):
        Buffer.from(record.contentText);
      entries.set(id,{bytes,folder:record.recordType.includes('manifest')?folders.MANIFESTS:folders.ENCRYPTED_DUMPS,
        record});
      return Response.json({ok:true,file:{id}},{status:201});
    }
    if(path.startsWith('/file-provenance/')){
      const id=path.slice('/file-provenance/'.length),item=entries.get(id);
      if(!item)return new Response('{}',{status:404});
      return Response.json({ok:true,fileId:id,driveId:drive,
        parentIds:[alterParent?'fixture-wrong-parent':item.folder],bytes:item.bytes.length});
    }
    if(path.startsWith('/files/')){
      const id=path.slice('/files/'.length),item=entries.get(id);
      if(!item)return new Response('',{status:404});
      const bytes=alterCiphertext&&item.folder===folders.ENCRYPTED_DUMPS?
        Buffer.concat([item.bytes.subarray(0,-1),Buffer.from([item.bytes.at(-1)^1])]):item.bytes;
      return new Response(bytes,{status:200,headers:{'content-type':'application/octet-stream'}});
    }
    throw new Error('UNEXPECTED_PUBLIC_API:'+path);
  };
  return {fetchImpl,entries,requests};
}

test('private ACL must pass before data writes are even attempted',async()=>{
  const fake=fakeStorage({scope:{...acl,ok:false}});
  await assert.rejects(checkBackupAcl({key,fetchImpl:fake.fetchImpl}),
    /POINTS_BACKUP_DRIVE_ACL_NOT_VERIFIED/);
  await assert.rejects(uploadVerifiedEncryptedBackup({encryptedBytes:ciphertext,
    mainSha,recipient,key,fetchImpl:fake.fetchImpl}),
    /POINTS_BACKUP_DRIVE_ACL_NOT_VERIFIED/);
  assert.equal(fake.requests.filter(x=>x.method==='POST').length,0);
});

test('encryption marker, exact main SHA and recipient are mandatory',async()=>{
  const f=fakeStorage();
  for(const options of [
    {encryptedBytes:Buffer.alloc(350)},
    {mainSha:'not-a-main-sha'},
    {recipient:'missing-recovery-recipient'},
  ]){
    await assert.rejects(uploadVerifiedEncryptedBackup({
      encryptedBytes:ciphertext,mainSha,recipient,key,fetchImpl:f.fetchImpl,...options
    }),/POINTS_BACKUP_/);
  }
  assert.equal(f.requests.length,0);
});

test('actual ciphertext and manifest are independently read back from canonical private folders',async()=>{
  const f=fakeStorage();
  const outcome=await uploadVerifiedEncryptedBackup({
    encryptedBytes:ciphertext,mainSha,recipient,key,fetchImpl:f.fetchImpl,
    now:new Date('2026-11-08T01:00:00.000Z')
  });
  assert.equal(outcome.status,'encrypted_archive_and_manifest_readback_verified');
  assert.equal(outcome.independent_restore_verified,false);
  assert.equal(outcome.points_activation_authorized,false);
  assert.equal(f.entries.size,2);
  const records=[...f.entries.values()].map(x=>x.record);
  assert.equal(records[0].subfolderPath,'SUPABASE_PROD/ENCRYPTED_DUMPS');
  assert.equal(records[1].subfolderPath,'SUPABASE_PROD/MANIFESTS');
  assert.equal(records[0].storageRoute,'backup');
  assert.equal(records[0].contentBase64, ciphertext.toString('base64'));
  assert.equal(records[0].contentText,undefined);
  const manifest=JSON.parse(records[1].contentText);
  assert.equal(manifest.project_ref,'renzehysxirjilvdxacv');
  assert.equal(manifest.independent_restore_verified,false);
  assert.equal(manifest.two_signer_receipt_verified,false);
  assert.equal(manifest.points_activation_authorized,false);
  assert.ok(!JSON.stringify(outcome).includes('fixture-uploaded-file'));
  assert.equal(f.requests.filter(x=>x.method==='POST').length,2);
  assert.equal(f.requests.filter(x=>x.url.includes('/file-provenance/')).length,2);
});

test('wrong Drive parent or corrupted encrypted readback fails closed',async()=>{
  for(const scenario of [{alterParent:true},{alterCiphertext:true}]){
    const f=fakeStorage(scenario);
    await assert.rejects(uploadVerifiedEncryptedBackup({
      encryptedBytes:ciphertext,mainSha,recipient,key,fetchImpl:f.fetchImpl
    }),/POINTS_BACKUP_ACTUAL_PARENT_MISMATCH|POINTS_BACKUP_CIPHERTEXT_READBACK_HASH_MISMATCH/);
  }
});

test('network, missing keys or mismatched ACL result never cause production writes',async()=>{
  const f=fakeStorage();
  await assert.rejects(checkBackupAcl({key:'',fetchImpl:f.fetchImpl}),
    /POINTS_BACKUP_STORAGE_KEY_MISSING/);
  await assert.rejects(uploadVerifiedEncryptedBackup({
    encryptedBytes:ciphertext,mainSha,recipient,key:'',fetchImpl:f.fetchImpl}),
    /POINTS_BACKUP_STORAGE_KEY_MISSING/);
  assert.equal(f.requests.some(x=>x.method==='POST'),false);
});
