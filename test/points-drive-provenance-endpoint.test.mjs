import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { handleStorageGateway } from '../storage-gateway.js';

const fileId='ekodi-backup-test-file';
const driveId='canonical-ekodi-drive';
const folderId='ekodi-backup-encrypted-folder';
const gatewayKey='unit-test-only-storage-gateway-key';

async function fixtureEnv() {
  const material='unit-test-only-encryption-material';
  const aes=await webcrypto.subtle.importKey('raw',createHash('sha256').update(material).digest(),
    'AES-GCM',false,['encrypt']);
  const iv=randomBytes(12);
  const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},aes,
    new TextEncoder().encode(JSON.stringify({refreshToken:'unit-test-only-refresh'})));
  const connection={
    drive_id:driveId,drive_name:'EKODI',
    credential_iv:iv.toString('base64url'),
    credential_ciphertext:Buffer.from(encrypted).toString('base64url')
  };
  return {
    DB:{prepare(){return {async first(){return connection;}};}},
    STORAGE_PRIMARY_SHARED_DRIVE_ID:driveId,
    STORAGE_CREDENTIAL_KEY:material,
    GOOGLE_DRIVE_CLIENT_SECRET:'unit-test-google-client-secret',
    GOOGLE_DRIVE_CLIENT_ID:'unit-test-google-client-id',
    EKODI_STORAGE_GATEWAY_KEY:gatewayKey,
  };
}

test('public provenance endpoint refuses requests without valid server-to-server storage key',async()=>{
  const env=await fixtureEnv();
  for(const header of [undefined,'wrong-server-key']){
    const request=new Request('https://ekodi.kr/api/storage/v1/file-provenance/'+fileId,
      header?{headers:{'x-ekodi-storage-key':header}}:{});
    const response=await handleStorageGateway(request,env);
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('authenticated metadata is queried from Google API without exposing OAuth credentials',async()=>{
  const env=await fixtureEnv();
  const old=globalThis.fetch;
  const urls=[];
  globalThis.fetch=async(input,init={})=>{
    const url=String(input);urls.push(url);
    if(url==='https://oauth2.googleapis.com/token'){
      assert.equal(init.method,'POST');
      return new Response(JSON.stringify({access_token:'unit-test-google-access'}),{status:200});
    }
    if(url.startsWith('https://www.googleapis.com/drive/v3/files/')){
      assert.equal(init.headers.get('authorization'),'Bearer unit-test-google-access');
      return new Response(JSON.stringify({id:fileId,driveId,parents:[folderId],size:'678',
        mimeType:'application/octet-stream'}),{status:200});
    }
    throw new Error('unexpected_network_path');
  };
  try{
    const response=await handleStorageGateway(new Request(
      'https://ekodi.kr/api/storage/v1/file-provenance/'+fileId,
      {headers:{'x-ekodi-storage-key':gatewayKey}}),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const data=await response.json();
    assert.deepEqual(data,{ok:true,fileId,driveId,parentIds:[folderId],bytes:678,
      mimeType:'application/octet-stream'});
    assert.equal(JSON.stringify(data).includes('unit-test-google-access'),false);
    assert.equal(JSON.stringify(data).includes('unit-test-only-refresh'),false);
    assert.equal(urls.length,2);
  }finally{globalThis.fetch=old;}
});

test('different Google Drive object ID/drive ID cannot be accepted as canonical provenance',async()=>{
  const env=await fixtureEnv();
  const original=globalThis.fetch;
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url==='https://oauth2.googleapis.com/token')
      return new Response(JSON.stringify({access_token:'test-access'}),{status:200});
    return new Response(JSON.stringify({id:fileId,driveId:'other-tenant-drive',
      parents:[folderId],size:'678',mimeType:'application/octet-stream'}),{status:200});
  };
  try {
    const result=await handleStorageGateway(new Request(
      'https://ekodi.kr/api/storage/v1/file-provenance/'+fileId,
      {headers:{'x-ekodi-storage-key':gatewayKey}}),env);
    assert.notEqual(result.status,200);
    assert.equal((await result.json()).code,'CANONICAL_STORAGE_FILE_PROVENANCE_MISMATCH');
  }finally{globalThis.fetch=original;}
});
