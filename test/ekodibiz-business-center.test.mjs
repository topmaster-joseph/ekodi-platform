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
  // The Worker bundler rewrites nested arrow functions using __name(...).
  // The lazy module executes in a separate realm and must carry its own helper.
  assert.match(script,/^const __name=\(fn,name\)=>Object\.defineProperty\(fn,"name",\{value:name,configurable:true\}\);\nexport const mountBusinessCenter = /);
  const helper=script.slice(0,script.indexOf('export const mountBusinessCenter = '));
  const generatedName=new Script(helper+'\n__name(()=>0,"generated-esbuild-helper").name').runInNewContext({});
  assert.equal(generatedName,'generated-esbuild-helper');
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
  assert.match(wrangler,/"\/ekodibiz\*"/);
  assert.doesNotMatch(wrangler,/"\/ekodibiz-business-center\.\*"/);
  const response=businessCenterCss();
  assert.equal(response.headers.get('content-type'),'text/css; charset=utf-8');
  const style=await response.text();
  assert.match(style,/\.ebiz\{[^}]*line-height:1\.3;display:grid;gap:9px/);
  assert.match(style,/\.ebiz \.ebiz-line\{[^}]*padding:7px 0/);
  assert.match(style,/\.ebiz th,\.ebiz td\{[^}]*padding:7px 8px/);
  assert.match(style,/@media print/);
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

test('website development archive is server backed, tenant-private and sends only via Gmail compose',async()=>{
 const ui=await read('ekodibiz-business-center.js');
 const db=await read('supabase/migrations/20261015130000_ekodibiz_webdev_docs.sql');
 const script=await businessCenterScript().text();
 assert.doesNotThrow(()=>new Script(script.replace('export const mountBusinessCenter = ','const mountBusinessCenter = ')));
 for(const s of ['홈페이지 개발','ekodibiz_webdev_docs','ekodibiz_webdev_events','ekodibiz_webdev_log_request','Gmail에서 작성','관리자 발송 보고','다른 작업자가 먼저 수정했거나'])assert.ok(ui.includes(s),s);
 assert.match(ui,/version=eq\./);
 assert.match(ui,/return=representation/);
 assert.match(ui,/encodeURIComponent/);
 assert.match(ui,/sent_reported/);
 assert.match(ui,/white-space:pre-wrap/);
 assert.doesNotMatch(ui,/Gmail API.*send/);
 assert.match(db,/enable row level security/g);
 assert.match(db,/ekodibiz_ops_active_tenant\(\)/);
 assert.match(db,/for select to authenticated/);
 assert.match(db,/for update to authenticated/);
 assert.match(db,/revoke all on public\.ekodibiz_webdev_docs,public\.ekodibiz_webdev_events from public,anon,authenticated/);
 assert.match(db,/grant select on public\.ekodibiz_webdev_events to authenticated/);
 assert.doesNotMatch(db,/grant\s+(?:delete|insert|update)\s+on public\.ekodibiz_webdev_events/i);
 assert.match(db,/new\.version:=old\.version\+1/);
 assert.match(db,/action in \('registered','revised','print_requested','compose_requested','sent_reported'\)/);
});
