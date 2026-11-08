import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,webcrypto} from 'node:crypto';
import {handleStorageGateway} from '../storage-gateway.js';

const drive='test-ekodi-canonical-drive';
const root='test-99-backup';
const base='test-supabase-prod';
const leafs={ENCRYPTED_DUMPS:'test-encrypted-dumps',MANIFESTS:'test-manifests',
  RESTORE_EVIDENCE:'test-restore-evidence'};
const gatewayKey='test-only-private-storage-key';
const approved=[
  {type:'user',role:'organizer',emailAddress:'joseph@ekodi.kr'},
  {type:'user',role:'writer',emailAddress:'topmaster.joseph@gmail.com'},
  {type:'user',role:'writer',emailAddress:'ekodibiz@gmail.com'}
];

async function envFixture() {
  const material='fixture-only-encrypted-credential';
  const key=await webcrypto.subtle.importKey('raw',
    createHash('sha256').update(material).digest(),'AES-GCM',false,['encrypt']);
  const iv=randomBytes(12);
  const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,
    new TextEncoder().encode(JSON.stringify({refreshToken:'unit-test-refresh-secret'})));
  const connection={drive_id:drive,drive_name:'EKODI',credential_iv:iv.toString('base64url'),
    credential_ciphertext:Buffer.from(ciphertext).toString('base64url')};
  const folder={service_key:'backup',folder_name:'99_BACKUP',folder_id:root};
  return {
    DB:{prepare(sql){
      if(sql.includes('storage_connections'))return {async first(){return connection}};
      if(sql.includes('storage_routes'))return {bind(){return {async first(){return folder}}}};
      throw new Error('UNEXPECTED_QUERY:'+sql);
    }},
    STORAGE_PRIMARY_SHARED_DRIVE_ID:drive,
    STORAGE_CREDENTIAL_KEY:material,
    GOOGLE_DRIVE_CLIENT_SECRET:'unit-test-google-oauth-client',
    GOOGLE_DRIVE_CLIENT_ID:'unit-test-google-oauth-id',
    EKODI_STORAGE_GATEWAY_KEY:gatewayKey,
  };
}

function fakeDrive({permissions=approved,augmented=null,absent=null}={}) {
  const urls=[];
  const resources={
    [root]:{name:'99_BACKUP',parent:drive},
    [base]:{name:'SUPABASE_PROD',parent:root},
    ...Object.fromEntries(Object.entries(leafs).map(([name,id])=>[id,{name,parent:base}]))
  };
  async function fetchMock(input,init={}){
    const url=String(input);urls.push(url);
    if(url==='https://oauth2.googleapis.com/token'){
      assert.equal(init.method,'POST');
      return new Response(JSON.stringify({access_token:'fixture-only-access'}),{status:200});
    }
    if(!url.startsWith('https://www.googleapis.com/drive/v3/'))
      throw new Error('UNEXPECTED_URL:'+url);
    assert.equal(init.headers.get('authorization'),'Bearer fixture-only-access');
    const u=new URL(url),path=u.pathname;
    if(path.includes('/permissions')){
      return new Response(JSON.stringify({permissions}),{status:200});
    }
    if(path.endsWith('/files')){
      const q=u.searchParams.get('q')||'';
      const match=q.match(/name = '([^']+)'/);
      const sought=match?.[1]||'';
      const found=Object.entries(resources).filter(([id,r])=>
        r.name===sought&&q.includes("'"+r.parent+"' in parents")&&id!==absent);
      return new Response(JSON.stringify({files:found.map(([id,r])=>({
        id,name:r.name,driveId:drive,parents:[r.parent],
        mimeType:'application/vnd.google-apps.folder',hasAugmentedPermissions:false
      }))}),{status:200});
    }
    const id=decodeURIComponent(path.split('/').at(-1));
    const f=resources[id];
    if(!f)return new Response(JSON.stringify({error:'not_found'}),{status:404});
    return new Response(JSON.stringify({id,name:f.name,driveId:drive,parents:[f.parent],
      mimeType:'application/vnd.google-apps.folder',
      hasAugmentedPermissions:augmented===id?true:false}),{status:200});
  }
  return {fetchMock,urls};
}
function request(header){
  return new Request('https://ekodi.kr/api/storage/v1/backup-acl',{
    headers:header?{'x-ekodi-storage-key':header}:{},
  });
}

test('private backup ACL proof rejects anonymous requests before any Google call',async()=>{
  const env=await envFixture();
  const d=fakeDrive(),old=globalThis.fetch;globalThis.fetch=d.fetchMock;
  try{
    for(const supplied of [undefined,'fake-key']){
      const res=await handleStorageGateway(request(supplied),env);
      assert.equal(res.status,401);
      assert.equal(res.headers.get('cache-control'),'no-store');
    }
    assert.equal(d.urls.length,0);
  }finally{globalThis.fetch=old;}
});

test('approved canonical drive members and private original folders pass, with no identity leakage',async()=>{
  const env=await envFixture();
  const d=fakeDrive(),old=globalThis.fetch;globalThis.fetch=d.fetchMock;
  try{
    const response=await handleStorageGateway(request(gatewayKey),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.status,'private_drive_acl_and_backup_folders_verified');
    assert.equal(body.approvedMembershipCount,3);
    assert.equal(body.subfolderIds.ENCRYPTED_DUMPS,leafs.ENCRYPTED_DUMPS);
    assert.equal(body.productionSchemaWriteAuthorized,false);
    assert.equal(body.backupExportAuthorized,false);
    assert.equal(body.pointsActivationAuthorized,false);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const serialized=JSON.stringify(body);
    for(const p of approved)assert.equal(serialized.includes(p.emailAddress),false);
    assert.equal(serialized.includes('fixture-only-access'),false);
    assert.equal(d.urls.filter(x=>x.includes('/permissions')).length,1);
  }finally{globalThis.fetch=old;}
});

test('unknown group, anyone, domain, or unlisted direct Drive membership fails closed',async()=>{
  const env=await envFixture();
  for(const unexpected of [
    {type:'anyone',role:'reader'},
    {type:'domain',role:'reader',domain:'example.com'},
    {type:'group',role:'reader',emailAddress:'group@example.com'},
    {type:'user',role:'writer',emailAddress:'unapproved@example.com'}
  ]){
    const d=fakeDrive({permissions:[...approved,unexpected]});
    const old=globalThis.fetch;globalThis.fetch=d.fetchMock;
    try{
      const res=await handleStorageGateway(request(gatewayKey),env);
      assert.notEqual(res.status,200);
      assert.equal((await res.json()).code,'CANONICAL_BACKUP_MEMBERSHIP_UNAPPROVED');
    }finally{globalThis.fetch=old;}
  }
});

test('unverifiable folder inheritance or deleted/weak steward membership blocks backup',async()=>{
  const env=await envFixture();
  const scenarios=[
    {augmented:leafs.MANIFESTS},
    {absent:leafs.RESTORE_EVIDENCE},
    {permissions:[{...approved[0],role:'writer'},approved[1],approved[2]]},
    {permissions:[{...approved[0],deleted:true},approved[1],approved[2]]},
    {permissions:[]}
  ];
  for(const options of scenarios){
    const d=fakeDrive(options),old=globalThis.fetch;
    globalThis.fetch=d.fetchMock;
    try{
      const res=await handleStorageGateway(request(gatewayKey),env);
      assert.notEqual(res.status,200);
      const body=await res.json();
      assert.equal(body.ok,false);
      assert.equal(body.status,'access_not_verified');
    }finally{globalThis.fetch=old;}
  }
});
