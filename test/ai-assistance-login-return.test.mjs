import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client=fs.readFileSync(new URL('../ai-control/commons.js',import.meta.url),'utf8');
const begin=client.indexOf('const assistanceState={notice:null,catalog:null,chosen:new Set(),busy:false};');
const end=client.indexOf('function moneyKRW(',begin);
assert.ok(begin>=0&&end>begin,'canonical assistance login helpers exist');

function harness(href='https://ekodi.kr/ai/?support_notice=government%3Anotice-123#support-detail',auth='/auth/?site=ai'){
  const nodes={};
  const changes=[];
  const ctx={
    URL,
    Set,
    location:{href,origin:'https://ekodi.kr'},
    state:{config:{authUrl:auth}},
    history:{replaceState(_state,_title,url){changes.push(new URL(url.toString()).href);ctx.location.href=url.toString()}},
    $:id=>nodes[id]??(nodes[id]={href:'',hidden:false,textContent:'',scrollIntoView(){nodes.scrolled=true}})
  };
  vm.runInNewContext(client.slice(begin,end)+'\n'+
    'globalThis.helpers={assistanceState,assistanceReturnHref,assistanceLoginLink,updateAssistanceLoginLinks,restoreAssistanceAfterLogin,supportNoticeKey};',ctx);
  return {ctx,nodes,changes,...ctx.helpers};
}

test('return_to preserves the exact notice, original query and hash with selected service IDs only',()=>{
  const t=harness('https://ekodi.kr/ai/?source=education&support_notice=gov%3A78#support-detail');
  t.assistanceState.notice={source:'gov',id:'78',title:'정부 공고'};
  t.assistanceState.catalog={plans:[{id:'information'},{id:'eligibility'},{id:'document'}]};
  t.assistanceState.chosen=new Set(['eligibility','document','forged']);
  assert.equal(t.updateAssistanceLoginLinks(true),true);
  const url=new URL(t.nodes.assistanceLoginLink.href);
  assert.equal(url.origin,'https://ekodi.kr');
  assert.equal(url.pathname,'/auth/');
  assert.equal(url.searchParams.get('site'),'ai');
  const back=new URL(url.searchParams.get('return_to'));
  assert.equal(back.pathname,'/ai/');
  assert.equal(back.hash,'#support-detail');
  assert.equal(back.searchParams.get('source'),'education');
  assert.equal(back.searchParams.get('support_notice'),'gov:78');
  assert.equal(back.searchParams.get('support_plans'),'eligibility,document');
  assert.equal(back.searchParams.get('support_intent'),'request');
  assert.equal(new URL(t.nodes.loginLink.href).searchParams.get('return_to').includes('support_intent=request'),false,
    'global login preserves view without claiming form submitted');
  assert.doesNotMatch(url.href,/applicant|organization|consent|typedName|signature|amount/i);
});
test('post-login return restores allowed plans without automatically submitting or reusing personal fields',()=>{
  const t=harness('https://ekodi.kr/ai/?support_notice=gov%3A78&support_plans=eligibility%2Cforged%2Cdocument&support_intent=request#support-detail');
  t.assistanceState.catalog={plans:[{id:'eligibility'},{id:'document'}]};
  const notice={source:'gov',id:'78'};
  const yes=t.restoreAssistanceAfterLogin(notice);
  assert.equal(yes,true);
  assert.equal([...t.assistanceState.chosen].join(','),'eligibility,document');
  assert.equal(t.nodes.assistanceRequestStatus.textContent.includes('다시 확인'),true);
  assert.equal(t.nodes.scrolled,true);
  const ret=new URL(t.changes[0]);
  assert.equal(ret.searchParams.get('support_notice'),'gov:78');
  assert.equal(ret.searchParams.has('support_plans'),false);
  assert.equal(ret.searchParams.has('support_intent'),false);
  assert.equal(ret.hash,'#support-detail');
});
test('external authentication origin is denied and no return-to open redirect is generated',()=>{
  const t=harness('https://ekodi.kr/ai/#support-programs','https://untrusted.example/auth/');
  assert.equal(t.assistanceLoginLink(),null);
  assert.equal(t.updateAssistanceLoginLinks(true),false);
  assert.equal(t.nodes.assistanceLoginLink.hidden,true);
});
test('no stale header link, stale notice deep link or unsafe auto-submission remains',()=>{
  assert.doesNotMatch(client,/location\.href\.split\('#'\)\[0\]/);
  assert.match(client,/if\(new URL\(location\.href\)\.searchParams\.has\('support_notice'\)\)/);
  assert.match(client,/updateAssistanceLoginLinks\(true\)/);
  assert.match(client,/restoreAssistanceAfterLogin\(item\);assistanceRenderPlans\(\)/);
  assert.match(client,/support_plans/);
  assert.match(client,/history\.replaceState\(null,'',target\)/);
  const helper=client.slice(begin,end);
  assert.doesNotMatch(helper,/localStorage|sessionStorage/);
  assert.doesNotMatch(helper,/searchParams\.(?:set|append)\(['\"](?:applicantName|organization|consent|paymentConfirmed)/);
});
