import test from 'node:test';
import assert from 'node:assert/strict';
import { gather, compareRequired, summarizeStatuses, summarizeCheckRuns, summarizeRequiredRules } from '../scripts/diagnose-protected-merge-checks.mjs';

test('distinguish required commit statuses from checks with the same name',()=>{
  const statuses=summarizeStatuses({statuses:[{context:'test',state:'success',creator:{login:'github-actions[bot]'}}]});
  const checks=summarizeCheckRuns({check_runs:[{name:'test',status:'completed',conclusion:'failure',app:{slug:'github-actions'}}]});
  const summary=compareRequired(statuses,checks);
  assert.equal(summary[0].commitStatus,'success');
  assert.equal(summary[0].checkRuns[0].conclusion,'failure');
  assert.equal(summary[1].commitStatus,'missing');
  assert.equal(summary[1].checkRunPresent,false);
});

test('read current effective branch rules without misreporting unavailable data',()=>{
  const rules=summarizeRequiredRules([{type:'required_status_checks',parameters:{
    required_status_checks:[{context:'test',integration_id:15368}]
  }},{type:'pull_request'}]);
  assert.equal(rules.length,1);
  assert.equal(rules[0].contexts[0].integrationId,15368);
  assert.deepEqual(summarizeRequiredRules({message:'forbidden'}),[]);
});

test('diagnostic uses only GET and redacts bearer from output',async()=>{
  const shaA='a'.repeat(40), shaB='b'.repeat(40);
  const calls=[];
  const get=async (url,opts)=>{
    calls.push({url,method:opts.method||'GET',headers:opts.headers});
    const item=url.includes('/pulls/')?{state:'open',mergeable:true,head:{sha:shaA},base:{sha:shaB},merge_commit_sha:shaB}:
      url.includes('/commits/')&&url.includes('/status')?{statuses:[{context:'test',state:'success',creator:{login:'test-bot'}}]}:
      url.includes('/check-runs')?{check_runs:[{name:'test',status:'completed',conclusion:'success',app:{slug:'github-actions'}}]}:
      url.includes('/rules/branches/main')?[{type:'required_status_checks',parameters:{required_status_checks:[{context:'test',integration_id:15368}]}}]:
      url.includes('/required_status_checks')?{contexts:['test'],checks:[{context:'test',app_id:15368}]}:{};
    return {ok:true,status:200,json:async()=>item};
  };
  const result=await gather({token:'synthetic-private-test-token',prNumbers:[4392],fetcher:get});
  assert.equal(result.mutationPerformed,false);
  assert.equal(result.prs.length,1);
  assert.equal(result.prs[0].targets.length,2);
  assert.equal(result.prs[0].targets[0].requiredComparison[0].checkRunPresent,true);
  assert.ok(calls.every(c=>c.method==='GET'));
  assert.doesNotMatch(JSON.stringify(result),/synthetic-private-test-token/);
  assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/repos/topmaster-joseph/ekodi-platform/')));
});
