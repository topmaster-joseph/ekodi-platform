import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes, webcrypto} from 'node:crypto';
import {writeCanonicalDriveFile, writeCanonicalDriveStream} from '../canonical-drive-writer.js';

// Synthetic-only OAuth, D1 and Drive fixtures; no real credentials or HTTP.
async function fixture() {
  const material='synthetic-drive-key';
  const iv=randomBytes(12);
  const cipher=await webcrypto.subtle.importKey('raw',
    createHash('sha256').update(material).digest(),'AES-GCM',false,['encrypt']);
  const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},cipher,
    new TextEncoder().encode(JSON.stringify({refreshToken:'synthetic-refresh'})));
  const connection={
    drive_id:'synthetic-shared-drive',drive_name:'EKODI',
    credential_iv:iv.toString('base64url'),
    credential_ciphertext:Buffer.from(encrypted).toString('base64url')
  };
  const env={
    STORAGE_CREDENTIAL_KEY:material,
    STORAGE_PRIMARY_SHARED_DRIVE_ID:'synthetic-shared-drive',
    GOOGLE_DRIVE_CLIENT_ID:'synthetic-client',
    GOOGLE_DRIVE_CLIENT_SECRET:'synthetic-secret',
    DB:{prepare(sql) {
      if(sql.includes('storage_connections'))return {first:async()=>connection};
      if(sql.includes('storage_routes'))return {bind:()=>({
        first:async()=>({folder_id:'synthetic-route-root',folder_name:'99_BACKUP'})
      })};
      throw new Error('unexpected database access');
    }}
  };
  return env;
}

async function exercise(path, stream=false) {
  const env=await fixture();
  const originalFetch=globalThis.fetch;
  const lookups=[];
  let uploadParent='';
  const uploads=[];
  globalThis.fetch=async(input,init={})=>{
    const url=String(input);
    if(url==='https://oauth2.googleapis.com/token')
      return Response.json({access_token:'synthetic-access'});
    if(url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      const query=new URL(url).searchParams.get('q')||'';
      lookups.push(query);
      assert.match(query,/name = 'ENCRYPTED_DUMPS'/);
      return Response.json({files:[{id:'synthetic-dumps-folder'}]});
    }
    if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
      uploads.push(url);
      const body=init.body instanceof Uint8Array
        ? Buffer.from(init.body).toString('utf8')
        : String(init.body||'');
      const parent=path==='ENCRYPTED_DUMPS/'?'synthetic-dumps-folder':'synthetic-route-root';
      uploadParent=parent;
      assert.ok(body.includes('"parents":["'+parent+'"]'),
        'actual upload must use the correct route/subfolder parent');
      if(url.includes('uploadType=resumable'))return new Response('',{
        status:200,headers:{location:'https://www.googleapis.com/upload/session/synthetic'}
      });
      return Response.json({id:'synthetic-file'});
    }
    if(url==='https://www.googleapis.com/upload/session/synthetic') {
      uploads.push(url);
      assert.equal(init.method,'PUT');
      return Response.json({id:'synthetic-file'});
    }
    throw new Error('unexpected network destination '+url);
  };
  try{
    const common={
      storageRoute:'backup',serviceId:'backup',title:'synthetic-ciphertext.age',
      mimeType:'application/octet-stream',spaceId:'ekodi',
      recordType:'encrypted_test',createdBy:'synthetic',retentionClass:'temporary',
      subfolderPath:path
    };
    const stored=stream
      ?await writeCanonicalDriveStream(env,{...common,body:new Uint8Array([1,2,3]),size:3})
      :await writeCanonicalDriveFile(env,{...common,bytes:new Uint8Array([1,2,3])});
    assert.equal(stored.id,'synthetic-file');
    return {lookups,uploads,uploadParent};
  }finally{globalThis.fetch=originalFetch;}
}

test('empty root subfolder must not create the accidental record directory',async()=>{
  for(const path of ['', '/', '///', ' / / ']){
    const result=await exercise(path);
    assert.deepEqual(result.lookups,[]);
    assert.equal(result.uploadParent,'synthetic-route-root');
    assert.equal(result.uploads.length,1);
  }
});

test('resumable root upload also stays in the canonical route folder',async()=>{
  const result=await exercise('',true);
  assert.deepEqual(result.lookups,[]);
  assert.equal(result.uploadParent,'synthetic-route-root');
  assert.equal(result.uploads.length,2);
});

test('real backup subfolder name remains intact and ignores trailing separators',async()=>{
  const result=await exercise('ENCRYPTED_DUMPS/');
  assert.equal(result.lookups.length,1);
  assert.equal(result.uploadParent,'synthetic-dumps-folder');
  assert.equal(result.uploads.length,1);
});
