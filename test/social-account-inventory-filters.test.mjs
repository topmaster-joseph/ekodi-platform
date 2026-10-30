import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleSocialIdentityControl } from '../social-identity-control.js';

const url='https://ekodi.kr/api/control/external-accounts/social-identities';
const admin={userId:'ekodi-owner-1',superAdmin:true};
const member={userId:'ekodi-member-1',superAdmin:false};
const row=index=>({
  id:'link-'+index,ekodi_user_id:'ekodi-owner-1',provider:'instagram',
  provider_account_id:'instagram-'+index,display_name:'Profile '+index,
  status:'pending_provider_verification',created_at:'2026-10-28T00:00:00Z',verified_at:null
});
const fakeDB=results=>({
  prepare(sql){return {bind(...parameters){return {all:async()=>({results}),sql,parameters}},all:async()=>({results}),sql}}
});

test('super-admin receives a clearly marked bounded 500-row preview, never a false total',async()=>{
  const rows=Array.from({length:501},(_,i)=>row(i+1));
  const res=await handleSocialIdentityControl(new Request(url+'?scope=all'),{DB:fakeDB(rows)},admin);
  const json=await res.json();
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(json.ownerScope,'platform');
  assert.equal(json.recordLimit,500);
  assert.equal(json.recordsTruncated,true);
  assert.equal(json.accounts.length,500);
  assert.ok(!json.accounts.some(x=>x.id==='link-501'));
  assert.equal(json.providers.find(x=>x.id==='instagram').registered,500);
  assert.equal(json.policy.registrationEnabled,false);
  assert.equal(json.policy.oauthLinkingEnabled,false);
  assert.equal(json.policy.autoPublishingEnabled,false);
});

test('a personal view cannot access platform scope, and has an independent 100-row cap',async()=>{
  const rows=Array.from({length:101},(_,i)=>row(i+1));
  const denied=await handleSocialIdentityControl(new Request(url+'?scope=all'),{DB:fakeDB(rows)},member);
  assert.equal(denied.status,403);
  const personal=await handleSocialIdentityControl(new Request(url),{DB:fakeDB(rows)},member);
  const body=await personal.json();
  assert.equal(body.ownerScope,'person');
  assert.equal(body.recordLimit,100);
  assert.equal(body.recordsTruncated,true);
  assert.equal(body.accounts.length,100);
  assert.equal(body.existingServiceConnections.length,0);
});

test('empty storage view reports completeness, not truncation or success when DB is absent',async()=>{
  const res=await handleSocialIdentityControl(new Request(url+'?scope=all'),{},admin);
  const data=await res.json();
  assert.equal(data.storageReady,false);
  assert.equal(data.recordsTruncated,false);
  assert.equal(data.recordLimit,500);
  assert.equal(data.providers.length,13);
});

test('read-only admin UI supplies source, status and owner search; hiding overrides CSS display rules',()=>{
  const js=readFileSync(new URL('../social-account-admin.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../social-account-admin.css',import.meta.url),'utf8');
  for(const control of ['data-social-account-search','data-social-account-source','data-social-account-filter','data-social-account-count']){
    assert.match(js,new RegExp(control));
  }
  assert.match(js,/row\.dataset\.socialRecord=kind/);
  assert.match(js,/row\.dataset\.status=/);
  assert.match(js,/account\.ekodiUserId/);
  assert.match(js,/account\.providerAccountId/);
  assert.match(js,/recordsTruncated/);
  assert.match(js,/전체 건수 아님/);
  assert.match(css,/\[data-social-provider-card\]\[hidden\]/);
  assert.match(css,/\[data-social-record\]\[hidden\]/);
  assert.match(css,/display:none!important/);
  assert.doesNotMatch(js,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});
