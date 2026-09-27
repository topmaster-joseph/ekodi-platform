import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCloudflareAccounts,
  classifyCloudflareWorkload,
  selectCloudflareAccount,
  assertAuxiliaryCannotOwnProduction
} from '../cloudflare-account-pool.js';

const env={
  CLOUDFLARE_ACCOUNT_ID:'primary-account',
  CLOUDFLARE_API_TOKEN:'primary-token',
  CLOUDFLARE_AUXILIARY_ACCOUNT_ID:'aux-account',
  CLOUDFLARE_AUXILIARY_API_TOKEN:'aux-token'
};

test('production-critical workloads always select the Paid primary account',()=>{
  for(const workload of ['production-release','auth','identity','finance','orders','root-security']){
    const selected=selectCloudflareAccount({workload,env});
    assert.equal(selected.account.id,'primary-account');
    assert.equal(selected.account.source,'primary');
    assert.equal(selected.fallback,false);
  }
});

test('noncritical workloads prefer the auxiliary account',()=>{
  for(const workload of ['development','staging','batch','backup','snapshot','diagnostics','synthetic-verification']){
    const selected=selectCloudflareAccount({workload,env});
    assert.equal(selected.account.id,'aux-account');
    assert.equal(selected.policy,'auxiliary_preferred');
  }
});

test('legacy development credentials remain an auxiliary compatibility alias',()=>{
  const accounts=resolveCloudflareAccounts({
    CLOUDFLARE_ACCOUNT_ID:'primary',
    CLOUDFLARE_API_TOKEN:'pt',
    CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID:'legacy-aux',
    CLOUDFLARE_DEVELOPMENT_API_TOKEN:'at'
  });
  assert.equal(accounts.auxiliary.id,'legacy-aux');
  assert.equal(accounts.auxiliary.source,'legacy-development');
});

test('critical production work never fails over to auxiliary',()=>{
  assert.throws(()=>selectCloudflareAccount({
    workload:'finance',
    env:{
      CLOUDFLARE_AUXILIARY_ACCOUNT_ID:'aux',
      CLOUDFLARE_AUXILIARY_API_TOKEN:'token'
    }
  }),/CLOUDFLARE_PRIMARY_REQUIRED_FAIL_CLOSED/);
  assert.throws(()=>assertAuxiliaryCannotOwnProduction({
    workload:'auth',
    accountSource:'auxiliary'
  }),/CLOUDFLARE_AUXILIARY_PRODUCTION_OWNERSHIP_FORBIDDEN/);
});

test('account id collision is rejected',()=>{
  assert.throws(()=>resolveCloudflareAccounts({
    CLOUDFLARE_ACCOUNT_ID:'same',
    CLOUDFLARE_API_TOKEN:'p',
    CLOUDFLARE_AUXILIARY_ACCOUNT_ID:'same',
    CLOUDFLARE_AUXILIARY_API_TOKEN:'a'
  }),/CLOUDFLARE_ACCOUNT_POOL_BOUNDARY_COLLISION/);
});

test('auxiliary loss may fall back to primary only for noncritical work and only when budget allows',()=>{
  const primaryOnly={CLOUDFLARE_ACCOUNT_ID:'primary',CLOUDFLARE_API_TOKEN:'token'};
  const fallback=selectCloudflareAccount({workload:'backup',env:primaryOnly,primaryBudgetAllowsFallback:true});
  assert.equal(fallback.account.id,'primary');
  assert.equal(fallback.fallback,true);
  assert.throws(()=>selectCloudflareAccount({workload:'backup',env:primaryOnly,primaryBudgetAllowsFallback:false}),/CLOUDFLARE_NONCRITICAL_CAPACITY_UNAVAILABLE/);
});

test('unknown workload defaults to primary instead of silently escaping to auxiliary',()=>{
  assert.equal(classifyCloudflareWorkload('future-service'),'primary_default');
  assert.equal(selectCloudflareAccount({workload:'future-service',env}).account.id,'primary-account');
});
