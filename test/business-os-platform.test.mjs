import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../business/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../business/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../business-worker.js',import.meta.url),'utf8');
const liveWorker=readFileSync(new URL('../business-live-worker.js',import.meta.url),'utf8');
const authRouter=readFileSync(new URL('../auth-site/auth-router.js',import.meta.url),'utf8');
const businessAuth=readFileSync(new URL('../auth-site/business-auth.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260817003000_business_os_live_data.sql',import.meta.url),'utf8');
const staging=readFileSync(new URL('../wrangler.business-staging.toml',import.meta.url),'utf8');
const production=readFileSync(new URL('../wrangler.business.toml',import.meta.url),'utf8');

test('Business OS exposes EKODIBIZ and Jadam tenant workspaces',()=>{
  for(const term of ['EKODI BUSINESS OS','에코디비즈','자담치킨 목포대점','CHIEF AI BRIEF','ACTION GATE','Marketing AI','Customer AI','Sales AI','Finance AI','AI Report']) assert.match(html,new RegExp(term,'i'));
  assert.match(worker,/ekodibiz/);
  assert.match(worker,/jadam/);
  assert.match(worker,/https:\/\/biz\.ekodi\.kr/);
  assert.match(worker,/https:\/\/jadam\.ai\.ekodi\.kr/);
  assert.match(worker,/external_client/);
  assert.match(worker,/internal/);
});

test('Business OS does not present fabricated sample metrics as live data',()=>{
  assert.doesNotMatch(html,/기능 검증용 샘플/);
  assert.doesNotMatch(app,/1284000|sample\.sales|sample\.customers/);
  assert.match(html,/연결 대기/);
  assert.match(worker,/sales:null/);
  assert.match(worker,/customers:null/);
  assert.match(app,/\/api\/snapshot/);
});

test('workspace routes and APIs are explicit and tenant-scoped',()=>{
  assert.match(worker,/\/api\/workspaces/);
  assert.match(worker,/\/api\/workspace\//);
  assert.match(worker,/unknown_workspace/);
  assert.match(app,/workspace:state\.current\?\.id/);
  assert.match(app,/localStorage\.setItem\('ekodi-business-workspace'/);
  assert.match(migration,/business_os_snapshot/);
  assert.match(migration,/has_tenant_access/);
  assert.match(migration,/has_store_private_access/);
});

test('Business OS staging stays isolated while production enables only read aggregates',()=>{
  assert.match(staging,/main = "business-live-worker\.js"/);
  assert.match(staging,/BUSINESS_MODE = "isolated-staging"/);
  assert.match(staging,/INTEGRATIONS_ENABLED = "false"/);
  assert.match(staging,/EXECUTION_ENABLED = "false"/);
  assert.match(production,/main = "business-live-worker\.js"/);
  assert.match(production,/pattern = "business\.ekodi\.kr"/);
  assert.match(production,/BUSINESS_MODE = "production-readonly-mvp"/);
  assert.match(production,/INTEGRATIONS_ENABLED = "true"/);
  assert.match(production,/EXECUTION_ENABLED = "false"/);
  assert.match(production,/SUPABASE_URL/);
  assert.match(production,/SUPABASE_PUBLISHABLE_KEY/);
});

test('live gateway forwards authenticated aggregate RPCs and never contains a service role key',()=>{
  assert.match(liveWorker,/business_os_snapshot/);
  assert.match(liveWorker,/business_os_propose_action/);
  assert.match(liveWorker,/business_os_decide_action/);
  assert.match(liveWorker,/\/api\/auth\/exchange/);
  assert.match(liveWorker,/authorization:`Bearer/);
  assert.doesNotMatch(liveWorker,/SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test('Business OS central auth has a dedicated one-time handoff path',()=>{
  assert.match(authRouter,/site==='business'/);
  assert.match(authRouter,/business-auth\.js/);
  assert.match(businessAuth,/business-handoff-api/);
  assert.match(businessAuth,/Google 계정/);
  assert.match(businessAuth,/ekodi_token/);
});

test('high-impact business decisions are permanently human-only',()=>{
  for(const action of ['transfer_money','sign_contract','terminate_employee','bind_insurance','make_hiring_decision','file_tax_return']){
    assert.match(worker,new RegExp(action));assert.match(migration,new RegExp(action));
  }
  assert.match(worker,/high_impact_human_only/);
  assert.match(migration,/high_impact_human_only/);
  assert.match(migration,/executed.*false/);
});

test('customer PII is used only for internal aggregation and never emitted by the snapshot',()=>{
  assert.match(migration,/md5\(trim\(o\.customer_phone\)\)/);
  assert.match(migration,/containsCustomerPii/);
  assert.doesNotMatch(migration,/jsonb_build_object\([^]*customer_phone/);
  assert.doesNotMatch(migration,/jsonb_build_object\([^]*customer_name/);
});

test('Business OS follows the stewardship operating loop',()=>{
  assert.match(html,/Observe/);
  assert.match(html,/Verify/);
  assert.match(worker,/observe-discern-suggest-approve-act-verify-report/);
  assert.match(worker,/draft_only/);
  assert.match(worker,/execution_adapter_disabled/);
});