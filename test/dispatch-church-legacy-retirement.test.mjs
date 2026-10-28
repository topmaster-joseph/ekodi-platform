import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  authorizedIssueCommand, verifiedRecoveryPr, verifiedReceipt, dispatch
} from '../scripts/dispatch-church-legacy-retirement.mjs';

const TASK = 'orch_recovery_ea4e45c278acbdb16ca379e0419740b4';
const BRANCH = 'ai/chatgpt/' + TASK;
const repo = 'topmaster-joseph/ekodi-platform';
const env = { GITHUB_EVENT_NAME: 'issue_comment', GITHUB_ACTOR: 'topmaster-joseph', GITHUB_REPOSITORY: repo, GH_TOKEN: 'unit-test-only' };
const event = {
  action: 'created',
  sender: { login: 'topmaster-joseph' },
  issue: { number: 6533 },
  comment: { user: { login: 'topmaster-joseph' }, body: 'EKODI-CHURCH-C3-EXECUTE' }
};
const pr = {
  number: 6535, state: 'closed', merged: true, merged_at: '2026-10-28T14:05:56Z',
  merge_commit_sha: '50f8e7859a6d9b3a5213f7e7530664d6611099cd',
  base: { ref: 'main' },
  head: { ref: BRANCH, repo: { full_name: repo } }
};
const receipt = { authorized: true, authority: 'ekodi-orchestrator', taskId: TASK, branchRef: BRANCH, state: 'approved' };

test('only exact repo owner C3 issue comment can dispatch', () => {
  assert.equal(authorizedIssueCommand(event, env), true);
  for (const other of [
    { ...event, issue: { number: 6534 } },
    { ...event, issue: { number: 6533, pull_request: {} } },
    { ...event, comment: { user: { login: 'attacker' }, body: event.comment.body } },
    { ...event, comment: { ...event.comment, body: 'EKODI-CHURCH-C3-EXECUTE force' } },
    { ...event, sender: { login: 'bot' } }
  ]) assert.equal(authorizedIssueCommand(other, env), false);
  assert.equal(authorizedIssueCommand(event, { ...env, GITHUB_REPOSITORY: 'some/other' }), false);
  assert.equal(authorizedIssueCommand(event, { ...env, GITHUB_ACTOR: 'bot' }), false);
});

test('only authentic merged protected PR and EKODI release receipt authorize', () => {
  assert.ok(verifiedRecoveryPr(pr));
  assert.ok(!verifiedRecoveryPr({ ...pr, merged: false }));
  assert.ok(!verifiedRecoveryPr({ ...pr, merge_commit_sha: 'other' }));
  assert.ok(!verifiedRecoveryPr({ ...pr, head: { ref:'ai/chatgpt/other', repo: { full_name: repo } } }));
  assert.equal(verifiedReceipt(receipt,200), true);
  assert.equal(verifiedReceipt({ ...receipt, authorized: false },200), false);
  assert.equal(verifiedReceipt({ ...receipt, authority: 'owner' },200), false);
  assert.equal(verifiedReceipt({ ...receipt, state: 'blocked' },200), false);
  assert.equal(verifiedReceipt(receipt,403), false);
});

test('authorized trigger dispatches ONLY the canonical guarded production workflow', async () => {
  const log = [];
  async function mockFetch(input, options = {}) {
    const url = String(input);
    const method = options.method || 'GET';
    log.push({ url, method, body: options.body || '' });
    if (url.endsWith('/pulls/6535')) return { ok:true, status:200, json:async()=>pr };
    if (url.includes('/api/orchestrator/release-receipt?')) return { ok:true, status:200, json:async()=>receipt };
    if (url === 'https://ekodi.kr/ekodichurch/') return { status:200, text:async()=> 'EKODI CHURCH' };
    if (url === 'https://ekodi.kr/ekodichurch/my/') return { status:200, text:async()=> 'MY PAGE' };
    if (url.endsWith('/actions/workflows/retire-church-legacy-domain.yml/dispatches')) return { status:204 };
    throw new Error('unexpected URL: '+url);
  }
  const result = await dispatch({ event, env, fetchImpl:mockFetch });
  assert.equal(result.dispatched,true);
  const posts=log.filter(r=>r.method==='POST');
  assert.equal(posts.length,1);
  assert.match(posts[0].url,/\/actions\/workflows\/retire-church-legacy-domain\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(posts[0].body), {
    ref:'main', inputs:{release_branch_ref:BRANCH,release_task_id:TASK}
  });
});

test('invalid receipt fails closed and never dispatches', async()=>{
  const methods = [];
  const mockFetch=async(input,opts={})=>{
    const url=String(input);
    methods.push(opts.method||'GET');
    if(url.endsWith('/pulls/6535'))return{ok:true,status:200,json:async()=>pr};
    if(url.includes('release-receipt'))return{status:200,json:async()=>({...receipt,authorized:false})};
    throw new Error('request must not continue: '+url);
  };
  await assert.rejects(dispatch({event,env,fetchImpl:mockFetch}),/not authorized/);
  assert.deepEqual(methods,['GET','GET']);
});

test('dispatcher workflow is restricted to owner-created issue comments, no direct DNS writes',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/dispatch-church-legacy-retirement.yml',import.meta.url),'utf8');
  assert.match(workflow,/issue_comment:/);
  assert.match(workflow,/github\.event\.issue\.number == 6533/);
  assert.match(workflow,/github\.actor == 'topmaster-joseph'/);
  assert.match(workflow,/github\.event\.comment\.body == 'EKODI-CHURCH-C3-EXECUTE'/);
  assert.match(workflow,/actions: write/);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|dns_records\/|pages\/projects\/.*\/domains/);
});
