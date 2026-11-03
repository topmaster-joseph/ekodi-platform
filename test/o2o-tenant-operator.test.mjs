import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isO2OIssuedLinkPath, o2oIssuedLinkResponse } from '../o2o-issued-links.js';
import { tenantO2OSiteId, O2O_TENANT_PUBLIC_ROOTS } from '../tenant-o2o-manager.js';
import siteWorker from '../site-worker.js';
import { workspaceAdminScript, workspaceAdminCss } from '../workspace-admin-page.js';

const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test'};
const token='a'.repeat(48), url='https://ekodi.kr/o2o/go/'+token;
function mockResult(data, status=200){
  return async (_url, opts)=>{
    assert.equal(opts.method,'POST');
    assert.equal(JSON.parse(opts.body).p_token,token);
    assert.match(_url,/\/rest\/v1\/rpc\/o2o_public_resolve$/);
    return Response.json(data,{status});
  };
}

test('canonical opaque QR endpoints match only under the platform O2O root',()=>{
  assert.equal(isO2OIssuedLinkPath('/o2o/go/'+token),true);
  assert.equal(isO2OIssuedLinkPath('/ekodimission'),false);
  assert.equal(isO2OIssuedLinkPath('/o2o'),false);
});

test('live QR resolution redirects only to a site-matched public EKODI route',async()=>{
  const response=await o2oIssuedLinkResponse(new Request(url),env,mockResult({
    ok:true,site_id:'mission',target_path:'/ekodimission?meeting=2026-11-07#saturday'
  }));
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodimission?meeting=2026-11-07#saturday');
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  const head=await o2oIssuedLinkResponse(new Request(url,{method:'HEAD'}),env,mockResult({ok:true,site_id:'commerce',target_path:'/cgma'}));
  assert.equal(head.status,302);
  assert.equal(head.headers.get('location'),'https://ekodi.kr/cgma');
});

test('unknown, invalid, revoked or malformed QR never causes a public redirect',async()=>{
  assert.equal((await o2oIssuedLinkResponse(new Request(url),env,mockResult({ok:false}))).status,404);
  assert.equal((await o2oIssuedLinkResponse(new Request(url+'?leak=1'),env,mockResult({ok:true}))).status,404);
  assert.equal((await o2oIssuedLinkResponse(new Request('https://ekodi.kr/o2o/go/short'),env,mockResult({ok:true}))).status,404);
  assert.equal((await o2oIssuedLinkResponse(new Request(url,{method:'POST'}),env,mockResult({ok:true}))).status,405);
  assert.equal((await o2oIssuedLinkResponse(new Request(url),{},mockResult({ok:true}))).status,503);
  for(const [site_id,target_path] of [
    ['mission','https://evil.example/ekodimission'],
    ['mission','/cgma'],
    ['mission','/ekodimission/admin'],
    ['mission','/ekodimission?token=secret'],
    ['bogus','/ekodimission']
  ]){
    const out=await o2oIssuedLinkResponse(new Request(url),env,mockResult({ok:true,site_id,target_path}));
    assert.notEqual(out.status,302,target_path);
  }
});

test('the public Worker serves issued QR redirects with strict noindex, no custom auth',async()=>{
  const mockEnv={SUPABASE_URL:env.SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=mockResult({ok:true,site_id:'mission',target_path:'/ekodimission'});
  try{
    const res=await siteWorker.fetch(new Request(url),mockEnv);
    assert.equal(res.status,302);
    assert.equal(res.headers.get('location'),'https://ekodi.kr/ekodimission');
    assert.match(res.headers.get('x-robots-tag')||'',/noindex/);
    assert.match(res.headers.get('content-security-policy')||'',/script-src 'self'/);
  }finally{globalThis.fetch=originalFetch;}
});

test('site administrator uses only authorized tenant RPCs, never a second super-admin grant',async()=>{
  assert.equal(tenantO2OSiteId('ekodimission'),'mission');
  assert.equal(tenantO2OSiteId('cgma'),'commerce');
  assert.equal(tenantO2OSiteId('ekodibiz','mall'),'mall');
  assert.equal(tenantO2OSiteId('unrelated'),null);
  assert.equal(O2O_TENANT_PUBLIC_ROOTS.mission,'/ekodimission');
  const source=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
  assert.match(source,/mountTenantO2OManager/);
  assert.match(source,/authorization:'Bearer '\+token/);
  const js=await workspaceAdminScript().text();
  assert.match(js,/o2o_operator_snapshot/);
  assert.match(js,/o2o_operator_issue/);
  assert.match(js,/o2o_operator_revoke/);
  const css=await workspaceAdminCss().text();
  assert.match(css,/tenant-o2o/);
});

test('schema has no direct browser access and public projection contains only nonidentifying target data',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261103165945_o2o_tenant_operator_qr.sql',import.meta.url),'utf8');
  for(const name of ['o2o_campaign_links','o2o_campaign_audit']) {
    assert.match(sql,new RegExp('alter table public\\.'+name+' enable row level security'));
    assert.match(sql,new RegExp('revoke all on table public\\.'+name+' from public, anon, authenticated'));
  }
  for(const name of ['o2o_operator_issue','o2o_operator_revoke','o2o_operator_snapshot']){
    assert.match(sql,new RegExp('revoke all on function public\\.'+name+'\\('));
    assert.match(sql,new RegExp('grant execute on function public\\.'+name+'\\(.*\\) to authenticated'));
  }
  assert.match(sql,/public\.current_site_activity_contexts/);
  assert.doesNotMatch(sql,/public\.activities|p_activity_id/);
  assert.match(sql,/extensions\.gen_random_bytes\(24\)/);
  assert.match(sql,/extensions\.digest\(v_token,'sha256'\)/);
  assert.match(sql,/status='active' and expires_at>now\(\)/);
  const start=sql.indexOf('create or replace function public.o2o_public_resolve');
  const projection=sql.slice(start,sql.indexOf('revoke all on function',start));
  for(const forbidden of ['person_contacts','activity_participations','email','phone','created_by','actor_id'])
    assert.ok(!projection.includes(forbidden), forbidden);
  assert.match(projection,/'site_id',v_site,'target_path',v_path/);
  const client=readFileSync(new URL('../tenant-o2o-manager.js',import.meta.url),'utf8');
  assert.doesNotMatch(client,/localStorage|sessionStorage|service_role|window\.EKODI_ADMIN_OVERRIDE/);
});
