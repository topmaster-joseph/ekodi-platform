import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAccount, buildCleanupPlan, buildFinancialCleanupBrief, requiresHumanGate } from '../money/core.js';

test('inactive unlinked account is cleanup candidate',()=>{
  const r=classifyAccount({id:'a',institution:'A',alias:'old',balance:50000,inactiveDays:400,autoDebits:[]});
  assert.equal(r.status,'cleanup');
});

test('loan-linked account is never suggested for autonomous cleanup',()=>{
  const r=classifyAccount({id:'a',inactiveDays:700,linkedLoan:true});
  assert.equal(r.status,'attention');
});

test('cleanup order moves autopay before balance and closure',()=>{
  const plan=buildCleanupPlan([
    {id:'main',institution:'A',alias:'생활',primary:true,balance:1000,inactiveDays:1},
    {id:'old',institution:'B',alias:'예전',balance:30000,inactiveDays:400,autoDebits:[{name:'보험료',amount:10000}]}
  ],'main');
  const types=plan.steps.filter(x=>x.accountId==='old').map(x=>x.type);
  assert.deepEqual(types,['change-autopay','transfer-balance','close-account']);
  assert.equal(plan.autonomousFinancialExecution,false);
});

test('financial actions always require human gate',()=>{
  for(const action of ['transfer-balance','close-account','change-autopay','cancel-autopay','payment','withdraw']) assert.equal(requiresHumanGate(action),true);
  assert.equal(requiresHumanGate('analyze'),false);
});

test('brief remains decision support rather than execution',()=>{
  const brief=buildFinancialCleanupBrief([{id:'a',inactiveDays:500,balance:10000,autoDebits:[]}]);
  assert.equal(brief.plan.executionMode,'human-confirmed-handoff');
  assert.equal(brief.plan.autonomousFinancialExecution,false);
  assert.match(brief.disclaimer,/명시적 승인/);
});
