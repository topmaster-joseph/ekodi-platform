import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FIELD_KEYS,PROOF_SQL,compare,queryCatalog,run,sanitizeRows} from '../scripts/report-mission-schema-parity.mjs';

const all=()=>Object.fromEntries(FIELD_KEYS.map(k=>[k,true]));
const devRow=()=>({...all(),activities:false,activity_media_links:false,activity_public_shares:false,activity_participations:false,media_link:false,reserve_upload:false,finalize_upload:false,admin_hide:false,archive_snapshot:false,link_moderation_guard:false,reservation_moderation_guard:false,finalize_moderation_guard:false,anon_submit_rpc:false,anon_reserve_rpc:false,media_table_private:false});

test('catalog proof contains metadata only and omits all private row selection',()=>{
 assert.match(PROOF_SQL,/to_regclass\('public\.activity_media_links'\)/);
 assert.match(PROOF_SQL,/to_regprocedure\('public\.activity_public_finalize_media_upload/);
 assert.match(PROOF_SQL,/pg_get_functiondef/);
 assert.doesNotMatch(PROOF_SQL,/select\s+\*\s+from\s+public\.|from\s+public\.people|from\s+auth\.users|from\s+public\.person_contacts/i);
 assert.doesNotMatch(PROOF_SQL,/^\s*(?:insert\s+into|update\s+\w+|delete\s+from|alter\s+table|drop\s+|truncate\s+|grant\s+|revoke\s+|copy\s+)/im,'Audit must never contain mutating statements');
 assert.match(PROOF_SQL,/media_table_private/,'Public media table access remains part of the drift proof');
});

test('exactly one typed row and no extra JSON fields are accepted in report',()=>{
 const v=sanitizeRows([{...all(),private_contact:'should never appear'}]);
 assert.equal(v.private_contact,undefined);
 assert.deepEqual(Object.keys(v).sort(),[...FIELD_KEYS].sort());
 assert.throws(()=>sanitizeRows([{}]),/missing\/invalid/);
 assert.throws(()=>sanitizeRows([]),/exactly one/);
});

test('production status and DEV drift are independent, never mislabel as parity',()=>{
 const p=all(),d=devRow();
 const result=compare(p,d,'2026-10-13T00:00:00.000Z');
 assert.equal(result.disposition,'DEVELOPMENT_SCHEMA_DRIFT');
 assert.equal(result.productionGuardVerified,true);
 assert.equal(result.developmentParity,false);
 assert.ok(result.missingInDev.includes('activities'));
 assert.ok(result.missingInDev.includes('media_link'));
 assert.equal(compare(p,p).disposition,'PARITY_VERIFIED');
 assert.equal(compare({...p,link_moderation_guard:false},d).disposition,'PRODUCTION_GUARD_FAILED');
});

test('management API requests are read_only and fail closed on unavailable credentials',async()=>{
 let calls=0;
 const fetchImpl=async(_url,init)=>{
   calls++;
   assert.equal(init.method,'POST');
   assert.equal(init.headers.authorization,'Bearer temporary-example-secret');
   const body=JSON.parse(init.body);
   assert.equal(body.read_only,true);
   assert.equal(body.query,PROOF_SQL);
   return {status:201,json:async()=>[all()]};
 };
 const result=await queryCatalog({token:'temporary-example-secret',projectRef:'renzehysxirjilvdxacv',fetchImpl});
 assert.equal(result.media_table_private,true);
 assert.equal(calls,1);
 await assert.rejects(()=>queryCatalog({token:'',projectRef:'renzehysxirjilvdxacv',fetchImpl}),/missing/);
 await assert.rejects(()=>queryCatalog({token:'temporary-example-secret',projectRef:'not-valid',fetchImpl}),/invalid/);
 await assert.rejects(()=>queryCatalog({token:'temporary-example-secret',projectRef:'renzehysxirjilvdxacv',fetchImpl:async()=>({status:401})}),/HTTP 401/,'Unauthorized catalog reads must fail without attempting write or leaking response');
});

test('audit runs in two metadata-only lanes and writes a sanitized artifact',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ekodi-mission-parity-'));
 const fetchImpl=async url=>({
   status:201,
   json:async()=>[url.includes('renzehysxirjilvdxacv')?all():devRow()]
 });
 try{
   const result=await run({env:{SUPABASE_ACCESS_TOKEN:'test-secret'},fetchImpl,outputDir:dir,clock:()=>new Date('2026-10-13T00:00:00.000Z')});
   assert.equal(result.disposition,'DEVELOPMENT_SCHEMA_DRIFT');
   const onDisk=await readFile(path.join(dir,'report.json'),'utf8');
   assert.ok(!onDisk.includes('test-secret'));
   assert.equal(JSON.parse(onDisk).developmentParity,false);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('Owner-scoped repo event for native parity execution cannot be launched by a guest comment',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/mission-schema-parity-readonly.yml',import.meta.url),'utf8');
  assert.match(workflow,/issue_comment:/);
  assert.match(workflow,/types: \[created\]/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/github\.event\.issue\.number == 4259/);
  assert.match(workflow,/github\.event\.comment\.user\.login == 'topmaster-joseph'/);
  assert.match(workflow,/startsWith\(github\.event\.comment\.body, 'EKODI-MISSION-PARITY-RUN:'/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/read_only=true/);
  assert.doesNotMatch(workflow,/pull_request_target:/);
});
