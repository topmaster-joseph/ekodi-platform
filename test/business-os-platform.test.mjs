import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../business/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../business-worker.js',import.meta.url),'utf8');
const staging=readFileSync(new URL('../wrangler.business-staging.toml',import.meta.url),'utf8');
const production=readFileSync(new URL('../wrangler.business.toml',import.meta.url),'utf8');

test('Business OS exposes the operating surface and specialist network',()=>{
  for(const term of ['EKODI BUSINESS OS','CHIEF AI BRIEF','ACTION GATE','Marketing AI','Customer AI','Sales AI','Finance AI','Energy AI','Insurance AI']) assert.match(html,new RegExp(term,'i'));
  assert.match(html,/샘플 데이터/);
  assert.match(html,/Observe/);
  assert.match(html,/Verify/);
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
  assert.match(worker,/observe-discern-suggest-approve-act-verify-report/);
  assert.match(worker,/draft_only/);
  assert.match(worker,/execution_adapter_disabled/);
});
