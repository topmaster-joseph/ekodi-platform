import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildConnectionFit } from '../invest-lifecycle-runtime.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Invest lifecycle migration is additive and keeps regulated execution out of scope',async()=>{
  const sql=await read('migrations/0100_invest_lifecycle_management.sql');
  for(const table of ['investment_project_profiles','investment_interest_records','investment_connections','investment_aftercare_updates']){
    assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql,/REFERENCES investment_opportunities\(id\)/);
  assert.match(sql,/analysis, IR, connection and aftercare records/i);
  assert.doesNotMatch(sql,/broker_credentials|custody_balance|guaranteed_return|securities_order/i);
});

test('connection fit is compatibility evidence, not an investment recommendation',()=>{
  const project={sector:'food',region:'jeonnam',funding_target:100000000};
  const good=buildConnectionFit(project,{preferred_sector:'food',preferred_region:'jeonnam',ticket_min:50000000,ticket_max:200000000});
  assert.equal(good.compatibility,'compatible');
  assert.deepEqual(good.conflicts,[]);
  assert.equal(good.investmentRecommendation,false);
  assert.equal(good.transactionExecution,false);

  const mismatch=buildConnectionFit(project,{preferred_sector:'software',preferred_region:'seoul',ticket_min:300000000,ticket_max:500000000});
  assert.equal(mismatch.compatibility,'review_needed');
  assert.deepEqual(mismatch.conflicts.sort(),['region','sector','ticket']);

  const unknown=buildConnectionFit({}, {});
  assert.equal(unknown.compatibility,'insufficient_data');
});

test('workspace entry owns lifecycle routing and reports schema readiness',async()=>{
  const entry=await read('workspace-platform-entry-worker.js');
  assert.match(entry,/handleInvestLifecycleApi/);
  assert.match(entry,/investment_project_profiles/);
  assert.match(entry,/investment_interest_records/);
  assert.match(entry,/investment_connections/);
  assert.match(entry,/investment_aftercare_updates/);
  assert.match(entry,/investLifecycleSchemaReady/);
});

test('lifecycle API stays subject-bound and analysis-and-connection-only',async()=>{
  const runtime=await read('invest-lifecycle-runtime.js');
  assert.match(runtime,/investment_opportunities WHERE id=\? AND subject_type=\? AND subject_key=\?/);
  assert.match(runtime,/analysis-and-connection-only/);
  assert.match(runtime,/investmentRecommendation:false/);
  assert.match(runtime,/transactionExecution:false/);
  assert.match(runtime,/humanDecisionRequired:true/);
  assert.match(runtime,/custody:false/);
  assert.match(runtime,/guaranteedReturn:false/);
  assert.doesNotMatch(runtime,/placeOrder|executeTrade|brokerCredential|custodyBalance/);
});

test('signed-in Invest workspace exposes the full project lifecycle controls',async()=>{
  const router=await read('platform-router-worker.js');
  const page=await read('invest-user-page.js');
  for(const token of ['/lifecycle','/project','/interests','/connections','/aftercare'])assert.ok(router.includes(token));
  assert.match(router,/IR 프로젝트 프로필/);
  assert.match(router,/투자자 관심 · 조건 매칭/);
  assert.match(router,/사후관리 · 성과보고/);
  assert.match(router,/투자 권유·적합성 판단이나 수익 예측이 아닙니다/);
  assert.match(page,/lifecycle-grid/);
  assert.match(page,/lifecycle-row/);
});

test('both Invest validation and canonical Workspace release include lifecycle contracts',async()=>{
  const invest=await read('.github/workflows/release-invest-personalization.yml');
  const release=await read('.github/workflows/release-messenger-investment-functional.yml');
  for(const source of [invest,release]){
    assert.match(source,/invest-lifecycle-runtime\.js/);
    assert.match(source,/invest-lifecycle-runtime\.test\.mjs/);
  }
  assert.match(release,/SELECT 1 FROM investment_project_profiles LIMIT 0/);
  assert.match(release,/SELECT 1 FROM investment_aftercare_updates LIMIT 0/);
});
