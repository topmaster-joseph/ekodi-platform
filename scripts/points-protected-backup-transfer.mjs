#!/usr/bin/env node
// Protected Supabase logical backup transfer — encrypted bytes ONLY.
// This does not run pg_dump, create keys, prove a restore or promote points.
// All sensitive execution must remain in a protected GitHub environment.
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const ORIGIN='https://ekodi.kr/api/storage/v1';
const PROJECT='renzehysxirjilvdxacv';
const MAX_ARCHIVE_BYTES=32*1024*1024;
const FILE_ID=/^[A-Za-z0-9_-]{12,160}$/;
const MAIN_SHA=/^[a-f0-9]{40}$/;
const AGE_HEADER=Buffer.from('age-encryption.org/v1\n');

function assert(ok,message){if(!ok)throw new Error(message);}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function storageRequest(path,{key,fetchImpl=fetch,method='GET',body}={}){
  assert(typeof key==='string'&&key.length>=16,'POINTS_BACKUP_STORAGE_KEY_MISSING');
  const response=await fetchImpl(ORIGIN+path,{
    method,redirect:'error',
    headers:{'x-ekodi-storage-key':key,...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  assert(response.ok,'POINTS_BACKUP_STORAGE_GATEWAY_HTTP_'+response.status);
  return response;
}
export async function checkBackupAcl({key,fetchImpl=fetch}={}){
  const response=await storageRequest('/backup-acl',{key,fetchImpl});
  const p=await response.json();
  assert(p?.ok===true&&p.status==='private_drive_acl_and_backup_folders_verified'&&
    p.publicOrUnknownMembershipAllowed===false&&p.directExtraFolderGrantsAllowed===false&&
    p.backupExportAuthorized===false&&p.productionSchemaWriteAuthorized===false&&
    p.pointsActivationAuthorized===false&&
    FILE_ID.test(String(p.canonicalDriveId||''))&&
    FILE_ID.test(String(p.subfolderIds?.ENCRYPTED_DUMPS||''))&&
    FILE_ID.test(String(p.subfolderIds?.MANIFESTS||'')),
    'POINTS_BACKUP_DRIVE_ACL_NOT_VERIFIED');
  return p;
}

async function verifyStoredFile({id,bytes,hash,folder,drive,key,fetchImpl}){
  assert(FILE_ID.test(String(id||'')),'POINTS_BACKUP_ARCHIVE_FILE_ID_INVALID');
  const actual=(await storageRequest('/file-provenance/'+encodeURIComponent(id),{key,fetchImpl})).json();
  const metadata=await actual;
  assert(metadata?.ok===true&&metadata.driveId===drive&&metadata.fileId===id&&
    Array.isArray(metadata.parentIds)&&metadata.parentIds.length===1&&
    metadata.parentIds[0]===folder&&metadata.bytes===bytes.length,
    'POINTS_BACKUP_ACTUAL_PARENT_MISMATCH');
  const fetched=await storageRequest('/files/'+encodeURIComponent(id),{key,fetchImpl});
  const raw=Buffer.from(await fetched.arrayBuffer());
  assert(raw.length===bytes.length&&sha(raw)===hash,
    'POINTS_BACKUP_CIPHERTEXT_READBACK_HASH_MISMATCH');
}

export async function uploadVerifiedEncryptedBackup({encryptedBytes,mainSha,recipient,now=new Date(),
  key,fetchImpl=fetch}={}){
  assert(Buffer.isBuffer(encryptedBytes)&&encryptedBytes.length>=256&&
    encryptedBytes.length<=MAX_ARCHIVE_BYTES,'POINTS_BACKUP_CIPHERTEXT_SIZE_INVALID');
  assert(encryptedBytes.subarray(0,AGE_HEADER.length).equals(AGE_HEADER),
    'POINTS_BACKUP_CIPHERTEXT_NOT_AGE');
  assert(MAIN_SHA.test(String(mainSha||'')),'POINTS_BACKUP_PROTECTED_MAIN_SHA_REQUIRED');
  assert(/^age1[a-z0-9]{30,120}$/.test(String(recipient||'')),
    'POINTS_BACKUP_AGE_RECIPIENT_REQUIRED');
  assert(now instanceof Date&&!Number.isNaN(now.getTime()),
    'POINTS_BACKUP_TIMESTAMP_INVALID');
  const acl=await checkBackupAcl({key,fetchImpl});
  const date=now.toISOString();
  const archiveHash=sha(encryptedBytes);
  const payload={
    spaceId:'ekodi',serviceId:'backup',storageRoute:'backup',
    recordType:'supabase_production_encrypted_logical_dump',
    createdBy:'ekodi-protected-backup-operator',retentionClass:'permanent',
    sourceModuleId:'ekodi.points.protected-backup',
    subfolderPath:'SUPABASE_PROD/ENCRYPTED_DUMPS',
    title:'supabase-prod-'+date.replace(/[:.]/g,'-')+'.age',
    mimeType:'application/octet-stream',
    contentBase64:encryptedBytes.toString('base64'),
  };
  const store=(await storageRequest('/records',{key,fetchImpl,method:'POST',body:payload})).json();
  const result=await store;
  const archiveId=String(result?.file?.id||'');
  await verifyStoredFile({id:archiveId,bytes:encryptedBytes,hash:archiveHash,
    folder:acl.subfolderIds.ENCRYPTED_DUMPS,drive:acl.canonicalDriveId,key,fetchImpl});

  const statement={
    version:1,type:'ekodi_points_backup_pending_independent_restore',
    project_ref:PROJECT,source_commit:mainSha,created_at:date,
    cipher:'age-x25519-v1',recipient_fingerprint_sha256:sha(Buffer.from(recipient)),
    encrypted_archive:{file_id:archiveId,sha256:archiveHash,bytes:encryptedBytes.length,
      drive_id:acl.canonicalDriveId,folder_id:acl.subfolderIds.ENCRYPTED_DUMPS},
    independent_restore_verified:false,
    two_signer_receipt_verified:false,
    production_schema_write_authorized:false,
    points_activation_authorized:false,
  };
  const manifest=Buffer.from(JSON.stringify(statement));
  const manifestHash=sha(manifest);
  const manifestStore=await (await storageRequest('/records',{key,fetchImpl,method:'POST',body:{
    spaceId:'ekodi',serviceId:'backup',storageRoute:'backup',
    recordType:'supabase_production_encrypted_backup_manifest_pending_restore',
    createdBy:'ekodi-protected-backup-operator',retentionClass:'permanent',
    sourceModuleId:'ekodi.points.protected-backup',
    subfolderPath:'SUPABASE_PROD/MANIFESTS',
    title:'supabase-prod-'+date.replace(/[:.]/g,'-')+'.manifest.json',
    mimeType:'application/json',contentText:manifest.toString('utf8')
  }})).json();
  const manifestId=String(manifestStore?.file?.id||'');
  await verifyStoredFile({id:manifestId,bytes:manifest,hash:manifestHash,
    folder:acl.subfolderIds.MANIFESTS,drive:acl.canonicalDriveId,key,fetchImpl});
  return {status:'encrypted_archive_and_manifest_readback_verified',
    project_ref:PROJECT,verified_archive_hash:true,verified_manifest_hash:true,
    independent_restore_verified:false,production_schema_write_authorized:false,
    points_activation_authorized:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const key=process.env.EKODI_STORAGE_GATEWAY_KEY;
    if(process.argv.includes('--acl-only')){
      await checkBackupAcl({key});
      console.log(JSON.stringify({status:'backup_acl_verified_only',
        export_executed:false,restore_verified:false,points_activation_authorized:false}));
    }else if(process.argv.includes('--encrypted-upload')){
      assert(process.env.POINTS_BACKUP_ENCRYPTED_PATH,
        'POINTS_BACKUP_ENCRYPTED_PATH_REQUIRED');
      const file=await stat(process.env.POINTS_BACKUP_ENCRYPTED_PATH);
      assert(file.isFile()&&file.size<=MAX_ARCHIVE_BYTES&&file.size>=256,
        'POINTS_BACKUP_CIPHERTEXT_SIZE_INVALID');
      const result=await uploadVerifiedEncryptedBackup({
        encryptedBytes:await readFile(process.env.POINTS_BACKUP_ENCRYPTED_PATH),
        mainSha:process.env.POINTS_BACKUP_EXPECTED_MAIN_SHA,
        recipient:process.env.POINTS_BACKUP_AGE_RECIPIENT,
        key
      });
      // Deliberately do not log sensitive Drive object IDs or backup contents.
      console.log(JSON.stringify(result));
    }else throw new Error('POINTS_BACKUP_MODE_REQUIRED');
  }catch(e){
    console.error('EKODI_POINTS_PROTECTED_BACKUP_BLOCKED:'+String(e?.message||'UNKNOWN'));
    process.exitCode=2;
  }
}
