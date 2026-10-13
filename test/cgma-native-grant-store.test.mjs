import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CGMA_NATIVE_GRANT_STORE,ensureCgmaNativeGrantSchema,issueCgmaNativeGrant,consumeCgmaNativeGrant,revokeCgmaNativeGrant } from '../cgma-native-grant-store.js';
import { CGMA_NATIVE_CANARY } from '../cgma-native-canary-policy.js';

const now=1760000000000;
const deviceId='node:ekodi-native-001';
const principalId='admin:cgma-owner';
const taskId='hyb_123e4567-e89b-42d3-a456-426614174000';
const ids=['123e4567-e89b-42d3-a456-426614174000','223e4567-e89b-42d3-a456-426614174000'];
function fakeD1(){
  const sqlite=new DatabaseSync(':memory:');
  return {
    sqlite,
    db:{prepare(sql){
      let args=[];
      return {
        bind(...values){args=values;return this;},
        async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};},
        async first(){return sqlite.prepare(sql).get(...args)||null;},
      };
    }},
    close(){sqlite.close();},
  };
}
async function state(){
  const context=fakeD1();
  await ensureCgmaNativeGrantSchema(context.db);
  return context;
}
const verified=()=>({principalId,deviceId,boardRole:'owner',approvedAtMs:now,nowMs:now,
  verifiedSession:true,verifiedBoardMembership:true,humanConsent:true,attestedIsolation:true,ttlMs:60000});
async function create(db,overrides={},options={}){
  const queue=[...ids];
  return issueCgmaNativeGrant(db,{...verified(),...overrides},{uuid:()=>queue.shift(),...options});
}
function canary(g){return {origin:CGMA_NATIVE_CANARY.origin,boardId:CGMA_NATIVE_CANARY.boardId,confirmed:true,grantRef:g.grantRef,nonce:g.nonce};}
function consume(g,overrides={}){return {payload:canary(g),principalId,deviceId,taskId,nowMs:now+1,...overrides};}

test('isolated SQL schema pins task, origin, board and bounded lease',async()=>{
  const s=await state();
  try {
    assert.equal(CGMA_NATIVE_GRANT_STORE.maxLeaseMs,120000);
    assert.equal(CGMA_NATIVE_GRANT_STORE.boardId,'site:cgma:main');
    const grant=await create(s.db);
    assert.equal(grant.ok,true);
    assert.equal(grant.expiresAtMs,now+60000);
    const row=s.sqlite.prepare('SELECT * FROM cgma_native_canary_grants').get();
    assert.equal(row.status,'issued');
    assert.equal(row.principal_id,principalId);
    assert.equal(row.device_id,deviceId);
    assert.equal(row.board_id,CGMA_NATIVE_GRANT_STORE.boardId);
    assert.equal(row.task_type,CGMA_NATIVE_CANARY.taskType);
    assert.equal(row.expires_at_ms-now,60000);
    assert.ok(!Object.keys(row).some(k=>/password|token|cookie|session/.test(k)));
    assert.ok(!Object.keys(grant).some(k=>/password|token|cookie|session/.test(k)));
  }finally{s.close();}
});

test('grant issuance rejects forged or stale identity, consent, isolation, and board scope',async()=>{
  const s=await state();
  try {
    const cases=[
      [{verifiedSession:false},'AUTHORITATIVE_AUTH_REQUIRED'],
      [{verifiedBoardMembership:false},'AUTHORITATIVE_AUTH_REQUIRED'],
      [{boardRole:'member'},'BOARD_MANAGE_ROLE_REQUIRED'],
      [{humanConsent:false},'FRESH_HUMAN_CONSENT_REQUIRED'],
      [{approvedAtMs:now-65000},'FRESH_HUMAN_CONSENT_REQUIRED'],
      [{approvedAtMs:now+5},'FRESH_HUMAN_CONSENT_REQUIRED'],
      [{attestedIsolation:false},'ATTESTED_ISOLATION_REQUIRED'],
      [{deviceId:'wrong'},'IDENTITY_SCOPE_INVALID'],
      [{principalId:''},'IDENTITY_SCOPE_INVALID'],
      [{ttlMs:120001},'LEASE_SCOPE_INVALID'],
      [{ttlMs:999},'LEASE_SCOPE_INVALID'],
    ];
    for(const [input,code] of cases){
      const r=await create(s.db,input);
      assert.equal(r.ok,false,JSON.stringify(input));
      assert.equal(r.code,code);
    }
    assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM cgma_native_canary_grants').get().n,0);
  }finally{s.close();}
});

test('single-use conditional D1 consumption denies concurrent retry, device mismatch, principal swap and nonce replay',async()=>{
  const s=await state();
  try {
    const g=await create(s.db);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g,{deviceId:'node:other-native-002'}))).ok,false);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g,{principalId:'admin:impostor'}))).ok,false);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g,{payload:{...canary(g),nonce:'cgma_333e4567-e89b-42d3-a456-426614174000'}}))).ok,false);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g,{payload:{...canary(g),authorization:'Bearer secret'}}))).ok,false);
    const both=await Promise.all([consumeCgmaNativeGrant(s.db,consume(g)),consumeCgmaNativeGrant(s.db,consume(g))]);
    assert.equal(both.filter(x=>x.ok).length,1);
    assert.equal(both.filter(x=>!x.ok).length,1);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g))).ok,false);
    const row=s.sqlite.prepare('SELECT status,consumed_job_id,consumed_at_ms FROM cgma_native_canary_grants WHERE grant_ref=?').get(g.grantRef);
    assert.equal(row.status,'consumed');assert.equal(row.consumed_job_id,taskId);assert.equal(row.consumed_at_ms,now+1);
  }finally{s.close();}
});

test('grant never survives expiry and rejected requests never change DB state',async()=>{
  const s=await state();
  try {
    const g=await create(s.db);
    const end=g.expiresAtMs;
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g,{nowMs:end}))).ok,false);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g,{nowMs:end+100}))).ok,false);
    assert.equal(s.sqlite.prepare('SELECT status FROM cgma_native_canary_grants').get().status,'issued');
  }finally{s.close();}
});

test('revocation is owner scoped and consumed grants cannot be revoked/reused',async()=>{
  const s=await state();
  try {
    const g=await create(s.db);
    assert.equal((await revokeCgmaNativeGrant(s.db,{grantRef:g.grantRef,principalId:'admin:someone-else',nowMs:now})).ok,false);
    assert.equal((await revokeCgmaNativeGrant(s.db,{grantRef:g.grantRef,principalId,nowMs:now})).ok,true);
    assert.equal((await consumeCgmaNativeGrant(s.db,consume(g))).ok,false);
    assert.equal((await revokeCgmaNativeGrant(s.db,{grantRef:g.grantRef,principalId,nowMs:now})).ok,false);
    assert.equal(s.sqlite.prepare('SELECT status FROM cgma_native_canary_grants').get().status,'revoked');
  }finally{s.close();}
});

test('issuance storage alone never unblocks native queue or constitutes authoritative audit evidence',async()=>{
  const source=await import('../cgma-native-canary-policy.js');
  assert.equal(source.CGMA_NATIVE_CANARY.status,'delegation_not_configured');
  const text=await (await import('node:fs/promises')).readFile(new URL('../hybrid-execution.js',import.meta.url),'utf8');
  assert.match(text,/CGMA_NATIVE_WRITE_DELEGATION_NOT_CONFIGURED/);
  assert.match(text,/return json\(\{code:'AUTH_REQUIRED'/);
  const grantSource=await (await import('node:fs/promises')).readFile(new URL('../cgma-native-grant-store.js',import.meta.url),'utf8');
  assert.doesNotMatch(grantSource,/\/api\/.+?grant/);
  assert.doesNotMatch(grantSource,/INSERT INTO ekodi_board_posts/);
});
