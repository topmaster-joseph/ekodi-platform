import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DOMAIN, RULE_NAME, NAVER_FILE_PATH, EXCLUSION, PHASE,
  findChurchRule, planChurchNaverExclusion, patchBody,
  assertOtherRulesUnchanged, reconcileChurchNaverRedirect,
} from '../scripts/cloudflare-church-naver-redirect-exception.mjs';

const accountId = '6986fd633f4e33bf804c921697b2d797';
const zoneId = '1234567890abcdef1234567890abcdef';
const rulesetId = 'abcdefabcdefabcdefabcdefabcdefab';
const originalRule = {
  id: 'a1', action: 'redirect', enabled: true, ref: 'church-redirect',
  description: RULE_NAME,
  expression: '(http.host eq "ekodichurch.kr")',
  action_parameters: { from_value: { target_url: { expression: 'concat("https://ekodi.kr/ekodichurch", http.request.uri.path)' }, status_code: 301, preserve_query_string: true } },
};
const otherRule = {
  id: 'b2', action: 'redirect', enabled: true, ref: 'unrelated',
  description: 'Unrelated rule',
  expression: 'http.host eq "another.example"',
  action_parameters: { from_value: { target_url: { value: 'https://elsewhere.example/' }, status_code: 302 } },
};
const ruleset = { id: rulesetId, phase: PHASE, rules: [originalRule, otherRule] };

test('patch targets only exact church rule and exact owner-issued path', () => {
  assert.equal(DOMAIN, 'ekodichurch.kr');
  assert.equal(NAVER_FILE_PATH, '/naver85321326d5553a0caa3a944158fc2969.html');
  assert.deepEqual(findChurchRule(ruleset), originalRule);
  const planned = planChurchNaverExclusion(originalRule);
  assert.equal(planned.changed, true);
  assert.equal(planned.expression, '(' + originalRule.expression + ') and ' + EXCLUSION);
  assert.deepEqual(patchBody(originalRule, planned.expression).action_parameters, originalRule.action_parameters);
  assert.equal(planChurchNaverExclusion({ ...originalRule, expression: planned.expression }).changed, false);
});

test('deny ambiguous, disabled, unrelated or previously special-cased redirect', () => {
  assert.throws(() => findChurchRule({...ruleset, rules: [originalRule, originalRule]}), /exactly one/);
  assert.throws(() => findChurchRule({...ruleset, rules: [otherRule]}), /exactly one/);
  assert.throws(() => findChurchRule({...ruleset, rules: [{...originalRule, enabled:false}]}), /enabled/);
  assert.throws(() => findChurchRule({...ruleset, rules: [{...originalRule, action_parameters:{from_value:{target_url:{value:"https://wrong.example"}}}}]}), /target changed/);
  assert.throws(() => planChurchNaverExclusion({...originalRule, expression:'http.request.uri.path eq "'+NAVER_FILE_PATH+'"'}), /special handling/);
});

test('guarded remote plan is read-only and PATCH preserves every unrelated rule', async () => {
  const requests = [];
  let current = structuredClone(ruleset);
  const request = async (_token, endpoint, method='GET', payload) => {
    requests.push({endpoint,method,payload});
    if(endpoint.startsWith('/zones?')) return [{id:zoneId,name:DOMAIN,status:'active'}];
    if(endpoint.endsWith('/entrypoint')) return structuredClone(current);
    if(endpoint.includes('/rules/')) {
      assert.equal(method,'PATCH');
      assert.ok(!endpoint.includes('dns_records') && !endpoint.includes('pages/projects'));
      assert.equal(endpoint,'/zones/'+zoneId+'/rulesets/'+rulesetId+'/rules/a1');
      current = structuredClone({...current,rules:[{...originalRule,...payload},otherRule]});
      return structuredClone(current);
    }
    throw new Error('Unexpected API endpoint '+endpoint);
  };
  const plan = await reconcileChurchNaverRedirect({ token:'test',accountId,mode:'inspect',request });
  assert.equal(plan.changed,true);
  assert.equal(requests.filter(x=>x.method!=='GET').length,0);
  const changed = await reconcileChurchNaverRedirect({token:'test',accountId,request});
  assert.equal(changed.outcome,'updated');
  assert.deepEqual(current.rules[1],otherRule);
  assert.equal(current.rules[0].action_parameters.from_value.status_code,301);
  assert.equal(requests.filter(x=>x.method==='PATCH').length,1);
  const repeat = await reconcileChurchNaverRedirect({token:'test',accountId,request});
  assert.equal(repeat.outcome,'already_excluded');
  assert.equal(requests.filter(x=>x.method==='PATCH').length,1);
});

test('fail closed before mutations on account mismatch, unrelated target change, ruleset drift', async () => {
  await assert.rejects(reconcileChurchNaverRedirect({token:'test',accountId:'wrong',request:async()=>{throw Error('should not call');}}),/account/);
  assert.throws(()=>assertOtherRulesUnchanged(ruleset,{...ruleset,rules:[{...originalRule,expression:EXCLUSION},{...otherRule,enabled:false}]},'a1'),/Unrelated rule/);
});

test('production workflow gates the single-rule API patch, deploys proof and verifies unchanged homepage', async () => {
  const wf=await readFile(new URL('../.github/workflows/deploy-church-naver-proof.yml',import.meta.url),'utf8');
  const src=await readFile(new URL('../scripts/cloudflare-church-naver-redirect-exception.mjs',import.meta.url),'utf8');
  assert.match(wf,/workflow_dispatch:/);
  assert.match(wf,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(wf,/cloudflare-church-naver-redirect-exception\.mjs --inspect/);
  assert.match(wf,/cloudflare-church-naver-redirect-exception\.mjs\n/);
  assert.ok(wf.indexOf('wrangler.church-naver-proof.toml') < wf.indexOf('cloudflare-church-naver-redirect-exception.mjs --inspect'));
  assert.ok(wf.indexOf('cloudflare-church-naver-redirect-exception.mjs\n') < wf.indexOf('Verify real Naver owner proof'));
  assert.match(wf,/church Naver proof status=/);
  assert.match(wf,/Unexpected church homepage redirect/);
  assert.match(src,/\/rulesets\/phases\//);
  assert.match(src,/'PATCH'/);
  assert.doesNotMatch(src,/['"]PUT['"]|dns_records|pages\/projects/);
});


test('dedicated Cloudflare church Single Redirect token cannot leak to generic worker release stages', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-church-naver-proof.yml', import.meta.url), 'utf8');
  const script = await readFile(new URL('../scripts/cloudflare-church-naver-redirect-exception.mjs', import.meta.url), 'utf8');
  const name = 'CLOUDFLARE_CHURCH_RULES_API_TOKEN';
  assert.ok(workflow.includes('secrets.' + name));
  assert.equal((workflow.match(new RegExp('secrets\\.' + name, 'g')) || []).length, 2);
  // Token is step-scoped, never included in the whole job or worker deployment.
  const workerStart = workflow.indexOf('name: Deploy exact Naver proof route');
  const inspectStart = workflow.indexOf('name: Inspect exact existing church');
  const applyStart = workflow.indexOf('name: Exclude only Naver proof URL');
  const liveStart = workflow.indexOf('name: Verify real Naver owner proof');
  assert.ok(workerStart >= 0 && inspectStart > workerStart && applyStart > inspectStart && liveStart > applyStart);
  assert.ok(!workflow.slice(0,inspectStart).includes(name));
  assert.ok(!workflow.slice(liveStart).includes(name));
  assert.match(script, /process\.env\.CLOUDFLARE_CHURCH_RULES_API_TOKEN/);
  assert.doesNotMatch(script, /token: process\.env\.CLOUDFLARE_API_TOKEN/);
  assert.ok(script.includes('Single Redirect Edit'));
});
