import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_PROVIDER_CATALOG, validateEvidence, handleSearchVisibilityControl } from '../search-visibility-control.js';

const sites = Object.freeze([
  {url:'https://ekodi.kr/seonammedi/',propertyType:'canonical'},
  {url:'https://seonammedi.kr/',propertyType:'independent-domain'},
]);
const input = (fields={})=>({
  siteUrl:sites[0].url,
  providerId:'naver',
  checkType:'ownership',
  state:'confirmed_manually',
  evidenceUrl:'https://searchadvisor.naver.com/console',
  detail:'Owner manually checked the provider dashboard',
  ...fields,
});
function reject(fields,code){
  assert.throws(()=>validateEvidence(input(fields),sites),err=>err instanceof Error&&err.message===code,code);
}

test('provider catalog contains 15 unique, explicitly grouped properties',()=>{
  assert.equal(SEARCH_PROVIDER_CATALOG.length,15);
  assert.equal(new Set(SEARCH_PROVIDER_CATALOG.map(x=>x.id)).size,15);
  assert.equal(SEARCH_PROVIDER_CATALOG.filter(x=>x.group==='search').length,4);
  assert.equal(SEARCH_PROVIDER_CATALOG.filter(x=>x.group==='indexnow').length,6);
  assert.equal(SEARCH_PROVIDER_CATALOG.filter(x=>x.group==='ai').length,5);
});

test('a valid manual ownership record is bounded to its exact canonical site',()=>{
  const entry=validateEvidence(input(),sites);
  assert.deepEqual(entry,{
    siteUrl:sites[0].url,providerId:'naver',checkType:'ownership',
    state:'confirmed_manually',evidenceUrl:'https://searchadvisor.naver.com/console',
    detail:'Owner manually checked the provider dashboard',
  });
  assert.equal(Object.hasOwn(entry,'source'),false,'caller cannot claim provider-verified provenance');
  assert.equal(Object.hasOwn(entry,'actor'),false,'server must stamp the current administrator identity');
});

test('an independent domain is a distinct provider property and never inherits canonical evidence',()=>{
  const domain=validateEvidence(input({siteUrl:sites[1].url}),sites);
  assert.equal(domain.siteUrl,sites[1].url);
  assert.notEqual(domain.siteUrl,sites[0].url);
  reject({siteUrl:'https://other.example/'},'SITE_NOT_PUBLIC');
  reject({siteUrl:'https://ekodi.kr/seonammedi/other/'},'SITE_NOT_PUBLIC');
  reject({siteUrl:'http://ekodi.kr/seonammedi/'},'SITE_NOT_PUBLIC');
  reject({siteUrl:'https://ekodi.kr/admin/'},'SITE_NOT_PUBLIC');
  reject({siteUrl:'https://seonammedi.kr/foo'},'SITE_NOT_PUBLIC');
});

test('provider IDs, check types and state values cannot be forged',()=>{
  reject({providerId:'google-search-console-admin'},'UNKNOWN_PROVIDER');
  reject({providerId:'__proto__'},'UNKNOWN_PROVIDER');
  reject({checkType:'delete-all'},'INVALID_CHECK_OR_STATE');
  reject({state:'verified'},'INVALID_CHECK_OR_STATE');
  reject({state:'indexed'},'INVALID_CHECK_OR_STATE');
  reject({state:'provider_verified'},'INVALID_CHECK_OR_STATE');
  reject({providerId:'ai-chatgpt',checkType:'registration'},'AI_REGISTRATION_NOT_SUPPORTED');
  for(const providerId of ['ai-google','ai-copilot','ai-perplexity','ai-claude']){
    reject({providerId,checkType:'registration'},'AI_REGISTRATION_NOT_SUPPORTED');
  }
});

test('manual confirmation requires an explicit proof and never accepts secret-bearing URLs',()=>{
  reject({evidenceUrl:'',detail:''},'CONFIRMATION_REQUIRES_EVIDENCE');
  for(const evidenceUrl of ['javascript:alert(1)','data:text/html,test','http://searchadvisor.naver.com/',
    'https://user:secret@example.com/','https://:secret@example.com/','not-a-url']){
    reject({evidenceUrl},evidenceUrl==='not-a-url'?'INVALID_EVIDENCE_URL':
      ['http://','javascript:','data:'].some(p=>evidenceUrl.startsWith(p))?'EVIDENCE_MUST_BE_HTTPS':'EVIDENCE_MUST_BE_HTTPS');
  }
  const manualNote=validateEvidence(input({evidenceUrl:'',detail:'Evidence inspected offline'}),sites);
  assert.equal(manualNote.evidenceUrl,'');
  assert.equal(manualNote.state,'confirmed_manually');
  const unknown=validateEvidence(input({state:'unknown',evidenceUrl:'',detail:''}),sites);
  assert.equal(unknown.state,'unknown');
});

test('untrusted client cannot set a claimed source, actor or observation timestamp',()=>{
  const entry=validateEvidence(input({
    source:'provider_api_verified',actor:'root',observedAt:'2050-01-01T00:00:00Z',
  }),sites);
  assert.equal(Object.hasOwn(entry,'source'),false);
  assert.equal(Object.hasOwn(entry,'actor'),false);
  assert.equal(Object.hasOwn(entry,'observedAt'),false);
});

test('control endpoint rejects unsupported HTTP method before any database action',async()=>{
  const response=await handleSearchVisibilityControl(new Request('https://ekodi.kr/api/control/search-visibility',{method:'DELETE'}),{});
  assert.equal(response.status,405);
  assert.deepEqual(await response.json(),{ok:false,code:'METHOD_NOT_ALLOWED'});
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('control endpoint rejects cross-origin GET without inspecting session or DB',async()=>{
  const response=await handleSearchVisibilityControl(new Request('https://ekodi.kr/api/control/search-visibility',{headers:{Origin:'https://other.example'}}),{});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{ok:false,code:'ORIGIN_FORBIDDEN'});
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});
