import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('EKODIBIZ public site keeps partner login inside business-area detail',async()=>{
  const [html,site]=await Promise.all([read('ekodibiz/index.html'),read('ekodibiz/site.js')]);
  assert.ok(html.includes('WHAT WE DO'));
  assert.ok(html.includes('data-i18n="partnerLogin"'));
  assert.ok(!html.match(/<header[\s\S]*관계자 로그인[\s\S]*<\/header>/));
  assert.ok(site.includes("if(type==='trade')return 'https://ekodi.kr/ekodibiz/trade'"));
  assert.ok(!html.includes('id="goalForm"'));
  assert.ok(!html.includes('무엇을 이루고 싶으세요?'));
});

test('trade partner and trade admin routes are apex workspace routes',async()=>{
  const [router,wrangler,portal,admin]=await Promise.all([
    read('platform-router-entry-worker.js'),read('wrangler.site.toml'),read('workspace-trade-portal.js'),read('workspace-trade-admin-page.js')
  ]);
  assert.ok(router.includes("from './workspace-trade-portal.js'"));
  assert.ok(router.includes('isTradePartnerPath(url.pathname)'));
  assert.ok(portal.includes('export function isTradePartnerPath'));
  assert.ok(portal.includes('/ekodibiz\\/trade'));
  assert.ok(admin.includes('/trade\\/admin'));
  for(const asset of ['/workspace-trade-admin.js','/workspace-trade-portal.css','/workspace-trade-portal.js'])assert.ok(wrangler.includes(`"${asset}"`),asset);
});

test('trade auth uses EKODIBIZ tenant and canonical apex portal',async()=>{
  const [auth,access]=await Promise.all([read('auth-site/auth.js'),read('supabase/functions/access-api/index.ts')]);
  assert.ok(auth.includes("trade:{name:'EKODI Global Trading',tenant:'ekodi-biz'"));  assert.ok(auth.includes("returnTo:'https://ekodi.kr/ekodibiz/trade'"));
  assert.ok(auth.includes('requestable:false'));
  assert.ok(access.includes('trade:["https://ekodi.kr","https://trade.biz.ekodi.kr","https://trade.ekodi.kr"]'));
});

test('trade authority supports overall and scoped company administration',async()=>{
  const sql=await read('supabase/migrations/20260903004000_trade_counterparty_admin_scopes.sql');
  for(const table of ['trade_counterparties','trade_admin_grants','trade_admin_company_scopes','trade_access_audit_log'])assert.ok(sql.includes(`public.${table}`));
  assert.ok(sql.includes("scope_mode in ('all','selected')"));
  assert.ok(sql.includes("role in ('trade_admin','trade_manager','trade_viewer')"));
  assert.ok(sql.includes('trade_workspace_admin'));
  assert.ok(sql.includes('selected_companies_required'));
  assert.ok(sql.includes('site_access_registry'));
  assert.ok(sql.includes("p_status='disabled' then 'revoked'"));
});

test('partner portal binds EKODI identity and keeps official history append-only',async()=>{
  const sql=await read('supabase/migrations/20260903005000_trade_partner_portal.sql');
  for(const table of ['trade_company_members','trade_engagements','trade_records','trade_record_acknowledgements'])assert.ok(sql.includes(`public.${table}`));
  assert.ok(sql.includes('trade_claim_company_memberships'));
  assert.ok(sql.includes('ekodi_id'));
  assert.ok(sql.includes('supersedes_id uuid references public.trade_records'));
  assert.ok(sql.includes("status in ('draft','confirmed','superseded')"));
  assert.ok(sql.includes('official_record_forbidden'));
  assert.ok(sql.includes('trade_confirm_record'));
  assert.ok(sql.includes('trade_acknowledge_record'));
  assert.ok(!sql.includes('trade_update_record'));
  assert.ok(sql.includes('revoke all on table public.trade_records from anon, authenticated'));
});
test('workspace API exposes authenticated trade partner operations',async()=>{
  const api=await read('supabase/functions/workspace-api/index.ts');
  for(const token of ['/trade/partner/claim','/trade/partner/companies','trade_list_company_members','trade_upsert_engagement','trade_create_record','trade_confirm_record','trade_acknowledge_record'])assert.ok(api.includes(token),token);
});

test('canonical EKODIBIZ URL slug maps to immutable internal tenant slug',async()=>{
  const [portal,admin,auth]=await Promise.all([read('workspace-trade-portal.js'),read('workspace-trade-admin-page.js'),read('auth-site/auth.js')]);
  assert.ok(portal.includes("const WORKSPACE='ekodi-biz'"));
  assert.ok(admin.includes("workspaceUrlSlug==='ekodibiz'?'ekodi-biz':workspaceUrlSlug"));
  assert.ok(auth.includes("tenant:'ekodi-biz'"));
});

test('EKODIBIZ canonical workspace root is backed by the EKODIBIZ service',async()=>{
  const [router,wrangler,html,manifestText]=await Promise.all([read('platform-router-entry-worker.js'),read('wrangler.site.toml'),read('ekodibiz/index.html'),read('deploy/manifests/shared-site.worker.json')]);
  assert.ok(router.includes('EKODIBIZ_PUBLIC_ROUTE'));
  assert.ok(router.includes("env?.EKODIBIZ?.fetch"));
  assert.ok(router.includes("x-ekodi-workspace-gateway','ekodibiz-service-binding"));
  assert.ok(router.includes("const EKODIBIZ_ASSETS=new Set(['style.css','site.js'])"));
  assert.ok(router.includes("on('script[src]'"));
  assert.match(wrangler,/binding = "EKODIBIZ"[\s\S]*service = "ekodibiz-revenue-os"/);
  assert.ok(html.includes('<link rel="canonical" href="https://ekodi.kr/ekodibiz">'));
  const manifest=JSON.parse(manifestText);assert.ok(manifest.worker.requests.some(x=>x.url==='https://ekodi.kr/ekodibiz'));
});