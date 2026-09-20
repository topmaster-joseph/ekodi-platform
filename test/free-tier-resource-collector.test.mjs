import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSupabase, collectSupabaseOidc, collectGitHub, snapshotsToSql } from '../scripts/collect-free-tier-resource-usage.mjs';

const observedAt='2026-09-20T08:30:00.000Z';

test('Supabase collector measures free project capacity and per-project database/storage without billing mutation',async()=>{
  const calls=[];
  const fetchJson=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',body:options.body});
    if(url.endsWith('/organizations'))return [{id:'org-free'}];
    if(url.endsWith('/organizations/org-free'))return {id:'org-free',plan:'free'};
    if(url.endsWith('/projects'))return [
      {ref:'project-a',organization_id:'org-free',status:'ACTIVE_HEALTHY'},
      {ref:'project-b',organization_id:'org-free',status:'ACTIVE_HEALTHY'},
    ];
    if(url.includes('/projects/project-a/database/query'))return [{database_bytes:'23325843',storage_object_bytes:'1000'}];
    if(url.includes('/projects/project-b/database/query'))return [{database_bytes:'12151955',storage_object_bytes:'33132'}];
    throw new Error(`unexpected ${url}`);
  };
  const result=await collectSupabase({token:'token',fetchJson,observedAt});
  const byMetric=new Map(result.snapshots.map(row=>[row.metric,row]));
  assert.equal(byMetric.get('active_projects').observedValue,2);
  assert.equal(byMetric.get('active_projects').freeLimit,2);
  assert.equal(byMetric.get('database_bytes:project-a').observedValue,23325843);
  assert.equal(byMetric.get('database_bytes:project-b').observedValue,12151955);
  assert.equal(byMetric.get('storage_bytes_org:org-free').observedValue,34132);
  assert.equal(calls.filter(call=>(call.method||'GET')!=='GET').length,2);
  for(const call of calls.filter(call=>call.method==='POST')){
    assert.match(call.body.query,/^select/i);
    assert.doesNotMatch(call.body.query,/\b(insert|update|delete|alter|drop|create)\b/i);
  }
});

test('Supabase collector reports missing telemetry when no management credential exists',async()=>{
  let called=false;
  const result=await collectSupabase({token:'',observedAt,fetchJson:async()=>{called=true;throw new Error('must not fetch');}});
  assert.equal(result.available,false);
  assert.equal(result.reason,'credential_missing');
  assert.deepEqual(result.snapshots,[]);
  assert.equal(called,false);
});

test('GitHub collector records public repository cache and artifact storage only',async()=>{
  const fetchJson=async(url)=>{
    if(url.endsWith('/repos/owner/repo'))return {visibility:'public',private:false};
    if(url.endsWith('/actions/cache/usage'))return {active_caches_size_in_bytes:2048,active_caches_count:2};
    if(url.includes('/actions/artifacts?'))return {artifacts:[
      {expired:false,size_in_bytes:4096},
      {expired:true,size_in_bytes:9999},
    ]};
    throw new Error(`unexpected ${url}`);
  };
  const result=await collectGitHub({repository:'owner/repo',token:'token',fetchJson,observedAt});
  assert.equal(result.repository.visibility,'public');
  assert.equal(result.snapshots.find(row=>row.metric==='cache_storage_bytes').observedValue,2048);
  assert.equal(result.snapshots.find(row=>row.metric==='artifact_storage_bytes').observedValue,4096);
});

test('collector emits additive quota snapshot upserts and never changes provider billing',()=>{
  const sql=snapshotsToSql([{
    provider:'supabase',metric:'active_projects',periodStart:'2026-09-20',
    observedValue:2,freeLimit:2,source:'supabase-management-api',observedAt
  }]);
  assert.match(sql,/INSERT INTO provider_quota_snapshots/);
  assert.match(sql,/ON CONFLICT\(provider,metric,period_start\) DO UPDATE/);
  assert.doesNotMatch(sql,/\b(BEGIN(?: TRANSACTION)?|COMMIT|SAVEPOINT)\b/i);
  assert.doesNotMatch(sql,/\b(DROP|ALTER|DELETE FROM|UPDATE provider_quota_state)\b/i);
});


test('Supabase OIDC fallback records per-project DB usage without fabricating organization capacity', async()=>{
  const config={
    audience:'ekodi-free-tier-governor',
    repository:'topmaster-joseph/ekodi-platform',
    requiredRef:'refs/heads/main',
    projects:[
      {ref:'project-a',usageEndpoint:'https://project-a.example/functions/v1/free-tier-usage'},
      {ref:'project-b',usageEndpoint:'https://project-b.example/functions/v1/free-tier-usage'},
    ],
  };
  const fetchJson=async(url,{token}={})=>{
    assert.equal(token,'oidc-token');
    if(url.includes('project-a'))return {database_bytes:23325843,storage_object_bytes:1000};
    if(url.includes('project-b'))return {database_bytes:12151955,storage_object_bytes:33132};
    throw new Error('unexpected endpoint');
  };
  const result=await collectSupabaseOidc({token:'oidc-token',config,fetchJson,observedAt});
  assert.equal(result.available,true);
  assert.equal(result.mode,'github_oidc');
  assert.equal(result.reason,null);
  assert.deepEqual(result.projects,['project-a','project-b']);
  assert.equal(result.snapshots.find(row=>row.metric==='database_bytes:project-a').freeLimit,500*1024*1024);
  assert.equal(result.snapshots.find(row=>row.metric==='storage_object_bytes:project-b').observedValue,33132);
  assert.equal(result.snapshots.some(row=>row.metric==='active_projects'),false);
});

test('Supabase OIDC fallback degrades to partial telemetry instead of inventing missing values', async()=>{
  const config={projects:[
    {ref:'project-a',usageEndpoint:'https://project-a.example/usage'},
    {ref:'project-b',usageEndpoint:'https://project-b.example/usage'},
  ]};
  const fetchJson=async(url)=>{
    if(url.includes('project-a'))return {database_bytes:1000,storage_object_bytes:20};
    throw new Error('HTTP_503');
  };
  const result=await collectSupabaseOidc({token:'oidc-token',config,fetchJson,observedAt});
  assert.equal(result.available,true);
  assert.equal(result.reason,'partial');
  assert.deepEqual(result.projects,['project-a']);
  assert.equal(result.snapshots.some(row=>row.metric==='database_bytes:project-b'),false);
});
