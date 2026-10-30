import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reserveTrustedGitHubApiBudget,INSERT_GITHUB_API_RESERVATION} from '../github-api-budget-admission.js';
const NOW=Date.parse('2026-10-30T03:00:00Z');
const ID=54321,SHA='a'.repeat(40),key=n=>n.toString(16).padStart(64,'0');
const ctx={source:'ekodi-orchestrator',verifiedInstallationToken:true,installationId:ID};
const request=(n,other={})=>({installationId:ID,resource:'core',operationKey:key(n),headSha:SHA,nowMs:NOW,authContext:ctx,...other});
const env=DB=>({DB,EKODI_GITHUB_BUDGET_ADMISSION_ENABLED:'true',EKODI_GITHUB_INSTALLATION_ID:String(ID)});
test('not connected by default; no D1 read or write',async()=>{
  let n=0;const DB={prepare(){n++;throw Error('no calls');}};
  assert.deepEqual(await reserveTrustedGitHubApiBudget({DB},request(1)),{admitted:false,reason:'not_connected'});
  assert.equal(n,0);
});
test('unverified App context and wrong installation never touch DB',async()=>{
  let n=0;const e=env({prepare(){n++;throw Error('no calls');}});
  for(const change of [{installationId:99},{authContext:null},{authContext:{...ctx,verifiedInstallationToken:false}}]){
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(1,change))).reason,'not_authorized');
  }
  assert.equal(n,0);
});
test('bad key, SHA, resource, units or timestamp rejected before DB',async()=>{
  let n=0;const e=env({prepare(){n++;throw Error('no calls');}});
  for(const change of [{operationKey:'email'},{headSha:'invalid'},{resource:'bad'},{
    unitCost:6},{unitCost:0},{nowMs:0}]){
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(1,change))).reason,'invalid_request');
  }
  assert.equal(n,0);
});
test('single parameterized insert-select reserves a bounded lease',async()=>{
  let capture={};
  const e=env({prepare(sql){capture.sql=sql;return {bind(...values){capture.values=values;return {
    run:async()=>({meta:{changes:1}})};}};}});
  const a=await reserveTrustedGitHubApiBudget(e,request(1));
  assert.deepEqual(a,{admitted:true,reason:'reserved',expiresAtMs:NOW+15000});
  assert.equal(capture.sql,INSERT_GITHUB_API_RESERVATION);
  assert.match(capture.sql,/SELECT SUM\(a.unit_cost\)/);
  assert.match(capture.sql,/NOT EXISTS/);
  assert.equal(capture.values.length,15);
  assert.equal(capture.values[12],25);
});
test('zero changes and D1 error never issue an admission',async()=>{
  const zero=env({prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})};}};}});
  assert.equal((await reserveTrustedGitHubApiBudget(zero,request(1))).admitted,false);
  const broken=env({prepare(){throw Error('secret connector failure');}});
  const a=await reserveTrustedGitHubApiBudget(broken,request(1));
  assert.deepEqual(a,{admitted:false,reason:'storage_unavailable'});
});
test('SQLite quota floor preserves in-flight leases across newer measurements',async t=>{
  let DatabaseSync;
  try{({DatabaseSync}=await import('node:sqlite'));}catch{t.skip('requires node sqlite');return;}
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(await readFile(new URL('../migrations/202610300110_github_api_budget_observations.sql',import.meta.url),'utf8'));
    db.exec(await readFile(new URL('../migrations/202610301230_github_api_admissions.sql',import.meta.url),'utf8'));
    const DB={prepare(sql){return {bind(...args){return {run:async()=>{
      const a=db.prepare(sql).run(...args);return {meta:{changes:Number(a.changes)}};
    }};}};}};
    const e=env(DB);
    const upsert=(remaining,at=NOW)=>db.prepare(
      "INSERT INTO github_operations_api_budgets VALUES (?,?,?,?,?,?,?,'verified_response') "+
      "ON CONFLICT(installation_id,resource) DO UPDATE SET remaining_value=excluded.remaining_value,observed_at_ms=excluded.observed_at_ms"
    ).run(ID,'core',5000,remaining,NOW+3600000,at,0);
    upsert(27);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(1))).admitted,true);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(1))).admitted,false);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(2))).admitted,true);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(3))).admitted,false);
    upsert(4999,NOW-31000);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(4))).admitted,false);
    upsert(26,NOW);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(5))).admitted,false);
    upsert(26,NOW+1);
    // New response headers do not prove earlier 15-second leases were consumed.
    // Keep the 25-unit floor while those unexpired leases may still execute.
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(6,{nowMs:NOW+1}))).admitted,false);
    assert.equal((await reserveTrustedGitHubApiBudget(e,request(7,{nowMs:NOW+15001}))).admitted,true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM github_operations_api_admissions').get().n,3);
  }finally{db.close();}
});
test('not an HTTP route or live GitHub worker; no secrets in ledger',async()=>{
  const [js,sql]=await Promise.all([
    readFile(new URL('../github-api-budget-admission.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/202610301230_github_api_admissions.sql',import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(js,/fetch\(|new Response\(/);
  assert.match(js,/EKODI_GITHUB_BUDGET_ADMISSION_ENABLED/);
  assert.doesNotMatch(sql,/password|email|response_body|Bearer/i);
});
