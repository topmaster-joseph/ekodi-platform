import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {pointMigrations,migrationName,assess,inspect,SCHEMA_QUERY,MIGRATION_QUERY,
  PREREQUISITES,POINTS_CONTRACT,PROJECTS} from '../scripts/verify-points-release-readiness.mjs';

const sourceFiles=readdirSync(new URL('../supabase/migrations/',import.meta.url));
const expected=pointMigrations(sourceFiles);
const completeSchema=Object.fromEntries([...PREREQUISITES,...POINTS_CONTRACT].map(key=>[key,true]));
const applied=expected.map((name,i)=>({name:i%2?'20261101020000_'+name:name,version:String(i+1)}));
const functions=[{slug:'points-api',status:'ACTIVE',verify_jwt:true}];

test('catalog uses only ordered EKODI points migrations from the source of truth',()=>{
  assert.equal(expected.length,20);
  assert.equal(new Set(expected).size,expected.length);
  assert.ok(expected[0].includes('site_activity_points_foundation'));
  assert.ok(expected.at(-1).includes('recognition_goals_person_idx'));
  assert.equal(migrationName({name:'20261101020000_ekodi_points_member_claims_view'}),'ekodi_points_member_claims_view');
  assert.ok(!expected.some(name=>name.includes('/')));
});

test('production clean install is reported as not installed, never silently activated',()=>{
  const r=assess({schema:{...completeSchema,...Object.fromEntries(POINTS_CONTRACT.map(k=>[k,false]))},
    migrations:[],functions:[],expected});
  assert.equal(r.state,'points_not_installed');
  assert.equal(r.migration_count_recognized,0);
  assert.equal(r.missing_migrations.length,20);
  assert.equal(r.prerequisites_ok,true);
  assert.equal(r.points_activation_authorized,false);
});
test('partial or insecure schema must never pass release contract',()=>{
  const partial=assess({schema:completeSchema,migrations:applied.slice(0,5),functions,expected});
  assert.equal(partial.state,'points_partially_installed');
  assert.equal(partial.missing_migrations.length,15);
  const insecure=assess({schema:{...completeSchema,anon_goals_denied:false},
    migrations:applied,functions,expected});
  assert.equal(insecure.state,'points_contract_incomplete');
  assert.deepEqual(insecure.missing_contracts,['anon_goals_denied']);
  const exposedTables=assess({schema:{...completeSchema,points_tables_secure:false},
    migrations:applied,functions,expected});
  assert.equal(exposedTables.state,'points_contract_incomplete');
  assert.deepEqual(exposedTables.missing_contracts,['points_tables_secure']);
  const missingJwt=assess({schema:completeSchema,migrations:applied,
    functions:[{slug:'points-api',status:'ACTIVE',verify_jwt:false}],expected});
  assert.equal(missingJwt.state,'points_contract_incomplete');
  assert.equal(missingJwt.points_api.jwt_verified,false);
});
test('complete technical state still never authorizes an earning or economic release',()=>{
  const r=assess({schema:completeSchema,migrations:applied,functions,expected});
  assert.equal(r.state,'technically_ready_for_policy_review');
  assert.equal(r.points_activation_authorized,false);
  assert.equal(r.missing_migrations.length,0);
  assert.equal(r.missing_contracts.length,0);
});
test('prerequisites missing takes precedence over all points readiness',()=>{
  const r=assess({schema:{...completeSchema,people:false},migrations:applied,functions,expected});
  assert.equal(r.state,'prerequisites_missing');
  assert.deepEqual(r.missing_prerequisites,['people']);
});

test('real management requests are read-only, strictly project-scoped, never expose token in report',async()=>{
  const requests=[];
  const fakeFetch=async (url,options)=>{
    requests.push({url,method:options.method,query:options.body&&JSON.parse(options.body).query,
      authorization:options.headers.authorization});
    const data=url.endsWith('/functions')?functions:
      options.body.includes('schema_migrations')?applied:[completeSchema];
    return {ok:true,json:async()=>data};
  };
  const result=await inspect({environment:'development',token:'test-only-secret',
    fetchImpl:fakeFetch,files:sourceFiles});
  assert.equal(result.project_ref,PROJECTS.development);
  assert.equal(result.state,'technically_ready_for_policy_review');
  assert.equal(result.points_activation_authorized,false);
  assert.equal(requests.length,3);
  assert.ok(requests.every(x=>x.url.startsWith('https://api.supabase.com/v1/projects/'+PROJECTS.development+'/')));
  assert.deepEqual(requests.map(x=>x.method),['POST','POST','GET']);
  assert.ok(requests.every(x=>x.authorization==='Bearer test-only-secret'));
  assert.doesNotMatch(JSON.stringify(result),/test-only-secret/);
  assert.match(SCHEMA_QUERY,/bool_and\(/);
  assert.match(SCHEMA_QUERY,/c\.relrowsecurity/);
  assert.match(SCHEMA_QUERY,/has_table_privilege\('anon'/);
  assert.match(SCHEMA_QUERY,/has_table_privilege\('authenticated'/);
  for(const query of [SCHEMA_QUERY,MIGRATION_QUERY])
    assert.doesNotMatch(query,/^\s*(?:insert|update|delete|drop|truncate|alter|create|grant|revoke|call)\b/im);
});
test('unknown environment, missing credential, and malformed results are rejected',async()=>{
  await assert.rejects(inspect({environment:'other',token:'x',files:sourceFiles}),/invalid_points_environment/);
  await assert.rejects(inspect({environment:'production',token:'',files:sourceFiles}),/management_credential_required/);
  await assert.rejects(inspect({environment:'production',token:'x',files:sourceFiles,fetchImpl:async()=>({ok:true,json:async()=>({unexpected:true})})}),/points_readiness_unexpected_result/);
});
test('no production migration, API deployment or flag modification path is present',()=>{
  const source=readFileSync(new URL('../scripts/verify-points-release-readiness.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/api\/supabase.*\/apply_migration|functions deploy|supabase db push|method:\s*'PUT'|method:\s*'PATCH'/);
  assert.match(source,/points_activation_authorized:false/);
  assert.match(source,/database\/query\/read-only/);
});
