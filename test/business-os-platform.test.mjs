import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../business/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../business/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../business-worker.js',import.meta.url),'utf8');
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
  assert.match(worker,/connection_required/);
  assert.match(worker,/sales:null/);
  assert.match(worker,/customers:null/);
});

test('workspace routes and APIs are explicit and tenant-scoped',()=>{
  assert.match(worker,/\/api\/workspaces/);
  assert.match(worker,/\/api\/workspace\//);
  assert.match(worker,/unknown_workspace/);
  assert.match(app,/workspace:state\.current\?\.id/);
  assert.match(app,/localStorage\.setItem\('ekodi-business-workspace'/);
});

test('Business OS staging is isolated and cannot execute external actions',()=>{
  assert.match(staging,/BUSINESS_MODE = "isolated-staging"/);
  assert.match(staging,/INTEGRATIONS_ENABLED = "false"/);
  assert.match(staging,/EXECUTION_ENABLED = "false"/);
});

test('production MVP remains read-only until explicit integration release',()=>{
  assert.match(production,/pattern = "business\.ekodi\.kr"/);
  assert.match(production,/BUSINESS_MODE = "production-readonly-mvp"/);
  assert.match(production,/INTEGRATIONS_ENABLED = "false"/);
  assert.match(production,/EXECUTION_ENABLED = "false"/);
});

test('high-impact business decisions are permanently human-only in the MVP',()=>{
  for(const action of ['transfer_money','sign_contract','terminate_employee','bind_insurance','make_hiring_decision','file_tax_return']) assert.match(worker,new RegExp(action));
  assert.match(worker,/high_impact_human_only/);
  assert.match(worker,/explicit_human_approval_required/);
  assert.doesNotMatch(worker,/fetch\(['"]https?:\/\//);
});

test('Business OS follows the mission operating loop',()=>{
  assert.match(html,/Observe/);
  assert.match(html,/Verify/);
  assert.match(worker,/observe-discern-suggest-approve-act-verify-report/);
  assert.match(worker,/draft_only/);
  assert.match(worker,/execution_adapter_disabled/);
});