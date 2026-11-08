import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,webcrypto} from 'node:crypto';
import {handleStorageGateway} from '../storage-gateway.js';

const key='unit-test-only-canonical-gateway-secret';
const drive='unit-test-canonical-ekodi-drive';
const root='unit-test-backup-folder';
async function fixtureEnv(){
  const material='test-only-canonical-encryption-key';
  const enc=await webcrypto.subtle.importKey('raw',createHash('sha256').update(material).digest(),
    'AES-GCM',false,['encrypt']);
  const iv=randomBytes(12);
  const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},enc,
    new TextEncoder().encode(JSON.stringify({refreshToken:'test-only-refresh'})));
  const conn={drive_id:drive,drive_name:'EKODI',
    credential_iv:iv.toString('base64url'),
    credential_ciphertext:Buffer.from(ciphertext).toString('base64url')};
  return {
    DB:{prepare(sql){
      if(sql.includes('storage_connections'))return {async first(){return conn}};
      if(sql.includes('storage_routes'))return {bind(){return {async first(){return {folder_id:root,folder_name:'99_BACKUP'}}}}};
      if(sql.includes('INSERT INTO storage_audit_logs'))return {bind(){return {async run(){return {success:true}}}}};
      throw new Error('unexpected fake DB query:'+sql);
    }},
    GOOGLE_DRIVE_CLIENT_ID:'unit-test-google-id',
    GOOGLE_DRIVE_CLIENT_SECRET:'unit-test-google-secret',
    STORAGE_CREDENTIAL_KEY:material,
    STORAGE_PRIMARY_SHARED_DRIVE_ID:drive,
    EKODI_STORAGE_GATEWAY_KEY:key,
  };
}
const record=(contentBase64)=>({
  spaceId:'ekodi',serviceId:'backup',storageRoute:'backup',
  recordType:'encrypted_production_test',createdBy:'fixture-owner',
  retentionClass:'permanent',title:'test-archive.age',
  mimeType:'application/octet-stream',contentBase64
});
function mockFetch(){
  const calls=[];
  const fetchImpl=async(input,init={})=>{
    const url=String(input);calls.push({url,init});
    if(url==='https://oauth2.googleapis.com/token')
      return Response.json({access_token:'fixture-only-access'});
    if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')){
      assert.match(init.headers['content-type'],/multipart\/related/);
      return Response.json({id:'fixture-multipart-file'});
    }
    if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable')){
      assert.equal(init.headers['content-type'],'application/json; charset=UTF-8');
      return new Response('',{status:200,
        headers:{location:'https://www.googleapis.com/upload/session/fixture-resumable'}});
    }
    if(url==='https://www.googleapis.com/upload/session/fixture-resumable'){
      assert.equal(init.method,'PUT');
      assert.ok(init.body instanceof Uint8Array);
      assert.equal(init.headers['content-length'],String(init.body.byteLength));
      return Response.json({id:'fixture-resumable-file'});
    }
    throw Error('unexpected real HTTP attempt: '+url);
  };
  return {calls,fetchImpl};
}
async function submit(env,contentBase64){
  return handleStorageGateway(new Request('https://ekodi.kr/api/storage/v1/records',{
    method:'POST',headers:{'x-ekodi-storage-key':key,'content-type':'application/json'},
    body:JSON.stringify(record(contentBase64))
  }),env);
}

test('small encrypted durable record keeps bounded multipart Google Drive path',async()=>{
  const env=await fixtureEnv(),f=mockFetch(),before=globalThis.fetch;
  globalThis.fetch=f.fetchImpl;
  try{
    const result=await submit(env,Buffer.alloc(32,0x42).toString('base64'));
    assert.equal(result.status,201);
    assert.equal((await result.json()).file.id,'fixture-multipart-file');
    assert.equal(f.calls.filter(x=>x.url.includes('uploadType=multipart')).length,1);
    assert.equal(f.calls.filter(x=>x.url.includes('uploadType=resumable')).length,0);
  }finally{globalThis.fetch=before;}
});

test('encrypted archive larger than 4 MiB uses resumable upload with exact bytes',async()=>{
  const env=await fixtureEnv(),f=mockFetch(),before=globalThis.fetch;
  globalThis.fetch=f.fetchImpl;
  try{
    const size=4*1024*1024+17;
    const result=await submit(env,Buffer.alloc(size,0x5a).toString('base64'));
    assert.equal(result.status,201);
    assert.equal((await result.json()).file.id,'fixture-resumable-file');
    assert.equal(f.calls.filter(x=>x.url.includes('uploadType=multipart')).length,0);
    assert.equal(f.calls.filter(x=>x.url.includes('uploadType=resumable')).length,1);
    const put=f.calls.find(x=>x.init?.method==='PUT');
    assert.equal(put.init.body.byteLength,size);
    assert.equal(put.init.headers['content-length'],String(size));
  }finally{globalThis.fetch=before;}
});

test('no Storage Gateway secret rejects large archive before any Drive access',async()=>{
  const env=await fixtureEnv(),f=mockFetch(),before=globalThis.fetch;
  globalThis.fetch=f.fetchImpl;
  try{
    const result=await handleStorageGateway(new Request('https://ekodi.kr/api/storage/v1/records',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(record(Buffer.alloc(4*1024*1024+17).toString('base64')))
    }),env);
    assert.equal(result.status,401);
    assert.equal(f.calls.length,0);
  }finally{globalThis.fetch=before;}
});
