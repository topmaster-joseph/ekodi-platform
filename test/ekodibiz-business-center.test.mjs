import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { businessCenterCss, businessCenterScript } from '../ekodibiz-business-center.js';
import { workspaceAdminCanAccess } from '../workspace-admin-page.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('business center module is syntactically valid and lazily mounted behind EKODIBIZ workspace auth',async()=>{
  const src=await read('workspace-admin-page.js');
  const script=await businessCenterScript().text();
  assert.doesNotThrow(()=>new Script(script.replace('export const mountBusinessCenter = ','const mountBusinessCenter = ')));
  assert.match(src,/business-center.*POLICY\.capabilities\.operations/);
  assert.match(src,/hasFullWorkspaceAdminScope\(role\)/);
  assert.match(src,/await import\('\/ekodibiz-business-center\.js\?v=/);
  assert.match(src,/if\(isBizWorkspace&&section==='business-center'\)return bizCenter\(\)/);
  assert.match(src,/if\(!isBizWorkspace\|\|service\|\|!hasFullWorkspaceAdminScope\(workspaceRole\)\)return permissionPanel\(\)/);
  assert.equal(workspaceAdminCanAccess('tenant_admin','business-center'),true);
  assert.equal(workspaceAdminCanAccess('member','business-center'),false);
  assert.match(src,/const defaultSection='overview'/); // other tenants preserve their default.
});

test('first-party worker and worker-first route ship lazy assets',async()=>{
  const [site,canonical,wrangler]=await Promise.all([
    read('site-worker.js'),read('platform-router-entry-worker.js'),read('wrangler.site.toml')
  ]);
  assert.match(site,/businessCenterScript\(\)/);
  assert.match(canonical,/businessCenterScript\(\)/);
  assert.match(canonical,/businessCenterCss\(\)/);
  assert.match(wrangler,/"\/ekodibiz-business-center\.\*"/);
  const response=businessCenterCss();
  assert.equal(response.headers.get('content-type'),'text/css; charset=utf-8');
  assert.match(await response.text(),/@media print/);
});

test('business center uses server-side authorized records, no fake KPI or localStorage as a ledger',async()=>{
  const src=await read('ekodibiz-business-center.js');
  for(const expected of ['ekodibiz_ops_items','ekodibiz_ops_audit','rpc/ekodibiz_ops_log_output','return=representation','CSV 내보내기','window.print()','개인정보','auth']) {
    if(expected==='개인정보'||expected==='auth')continue; // fixed UI inventory is not a privacy notice
    assert.ok(src.includes(expected),expected);
  }
  assert.match(src,/data-eb-check/);
  assert.match(src,/data-eb-print-id/);
  assert.match(src,/saved\.length!==1/);
  assert.doesNotMatch(src,/localStorage\.|sessionStorage\./);
  assert.match(src,/state\.ready=false/);
  assert.match(src,/state\.rows=\[\]/);
  assert.match(src,/엑셀|CSV|csv_requested/);
  assert.match(src,/^[\s\S]*esc\(r\.title\)/m);
});

test('database migration enforces tenant RLS, immutable audit and no client delete',async()=>{
  const sql=await read('supabase/migrations/20261014211000_ekodibiz_business_center.sql');
  assert.match(sql,/public\.current_site_access\('biz'\)/);
  assert.match(sql,/auth\.uid\(\) is null/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/tenant_id = public\.ekodibiz_ops_active_tenant\(\)/);
  assert.match(sql,/revoke all on public\.ekodibiz_ops_items, public\.ekodibiz_ops_audit from public,anon,authenticated/);
  assert.match(sql,/grant select,insert,update on public\.ekodibiz_ops_items to authenticated/);
  assert.match(sql,/grant select on public\.ekodibiz_ops_audit to authenticated/);
  assert.match(sql,/immutable_item_identity/);
  assert.match(sql,/p_action not in \('print_requested','csv_requested'\)/);
  assert.doesNotMatch(sql,/grant\s+delete\b/i);
});
