import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePointsControl} from '../points-control.js';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../points-admin.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../api-worker.js',import.meta.url),'utf8');
const url='https://ekodi.kr/api/control/points/overview';
const key='test-server-only-key';
const env={POINTS_POLICY_READ_ENABLED:'true',POINTS_SOURCE_ENV:'production',POINTS_SUPABASE_URL:'https://renzehysxirjilvdxacv.supabase.co/',POINTS_SERVICE_ROLE_KEY:key};
const req=(method='GET')=>new Request(url,{method,headers:{authorization:'Bearer untrusted-client-token'}});
test('points admin API refuses writes and non-admin callers without hitting database',async()=>{
  let fetchCount=0;
  const fetcher=()=>{fetchCount++;throw Error('should not fetch');};
  assert.equal((await handlePointsControl(req('POST'),env,{role:'super_admin'},new Headers(),fetcher)).status,405);
  assert.equal((await handlePointsControl(req(),env,{role:'user'},new Headers(),fetcher)).status,403);
  assert.equal((await handlePointsControl(req(),{...env,POINTS_POLICY_READ_ENABLED:'false'},{role:'super_admin'},new Headers(),fetcher)).status,503);
  assert.equal(fetchCount,0);
});
test('points projection cannot target development database from canonical production',async()=>{
  let count=0;const fetcher=()=>{count++;throw Error('fetch forbidden');};
  const response=await handlePointsControl(req(),{
    ...env,POINTS_SOURCE_ENV:'development',POINTS_SUPABASE_URL:'https://lxcxwbdwwojjkgybbqii.supabase.co/'
  },{role:'super_admin'},new Headers(),fetcher);
  assert.equal(response.status,503);
  assert.equal(count,0);
});
test('points projection reads only explicit fields from approved server-side source',async()=>{
  const paths=[];
  const fetcher=async(url,opts)=>{
    const u=new URL(url);paths.push(u.pathname);
    assert.equal(u.origin,'https://renzehysxirjilvdxacv.supabase.co');
    assert.equal(opts.method,'GET');assert.equal(opts.headers.apikey,key);
    // Opaque sb_secret_-style keys go on apikey only (never as a Bearer JWT).
    assert.equal(opts.headers.Authorization,undefined);
    assert.equal(opts.redirect,'error');
    assert.ok(u.searchParams.get('select'));assert.ok(Number(u.searchParams.get('limit'))<=1000);
    return new Response('[]',{status:200});
  };
  const res=await handlePointsControl(req(),env,{role:'super_admin'},new Headers(),fetcher);
  assert.equal(res.status,200);
  const result=await res.json();assert.equal(result.read_only,true);
  assert.deepEqual([result.sites,result.rules,result.transfers,result.campaigns],[[],[],[],[]]);
  assert.deepEqual(paths.sort(),[
    '/rest/v1/ekodi_point_sites','/rest/v1/ekodi_point_rules',
    '/rest/v1/ekodi_point_transfer_policies','/rest/v1/ekodi_point_donation_campaigns'
  ].sort());
});
test('points projection fails closed on missing secret or failed table query',async()=>{
  assert.equal((await handlePointsControl(req(),{...env,POINTS_SERVICE_ROLE_KEY:''},{role:'super_admin'})).status,503);
  const failed=await handlePointsControl(req(),env,{role:'super_admin'},new Headers(),async()=>new Response('{}',{status:404}));
  assert.equal(failed.status,503);
});
test('admin user only sends EKODI session to same-origin, not directly to Supabase',()=>{
  assert.match(source,/fetch\('\/api\/control\/points\/overview'/);
  assert.match(source,/credentials:'same-origin'/);
  assert.doesNotMatch(source,/sb_publishable_|renzehysxirjilvdxacv|supabase\.co/);
  assert.match(worker,/handlePointsControl\(request, env, auth\.session, auth\.response\.headers\)/);
});

test('legacy JWT service keys are also sent as Bearer; any *.ekodi.kr host refuses development data',async()=>{
  const jwt='eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl';
  let seen;
  await handlePointsControl(req(),{...env,POINTS_SERVICE_ROLE_KEY:jwt},{role:'super_admin'},new Headers(),async(u,opts)=>{seen=opts.headers;return new Response('[]',{status:200});});
  assert.equal(seen.Authorization,'Bearer '+jwt);assert.equal(seen.apikey,jwt);
  const dev={...env,POINTS_SOURCE_ENV:'development',POINTS_SUPABASE_URL:'https://lxcxwbdwwojjkgybbqii.supabase.co/'};
  const never=()=>{throw Error('must not fetch');};
  const adminHost=new Request('https://admin.ekodi.kr/api/control/points/overview');
  assert.equal((await handlePointsControl(adminHost,dev,{role:'super_admin'},new Headers(),never)).status,503);
  const staging=new Request('https://ekodi-admin-staging.ekodi-development.workers.dev/api/control/points/overview');
  let hit=0;
  assert.equal((await handlePointsControl(staging,dev,{role:'super_admin'},new Headers(),async()=>{hit++;return new Response('[]',{status:200});})).status,200);
  assert.equal(hit,4);
});
