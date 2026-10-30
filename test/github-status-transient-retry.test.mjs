import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const helper=fileURLToPath(new URL('../scripts/github-status-transient.sh',import.meta.url));
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function simulate(codes,{twoCalls=false,quotaHeader=false,withSummary=false}={}){
  const dir=mkdtempSync(join(tmpdir(),'ekodi-status-'));
  try{
    const bin=join(dir,'bin');mkdirSync(bin);
    const sequence=join(dir,'codes'),hits=join(dir,'hits'),summaryPath=join(dir,'summary.md');
    writeFileSync(summaryPath,'');
    writeFileSync(sequence,codes.join('\n')+'\n');writeFileSync(hits,'');
    const fake=[
      '#!/usr/bin/env bash','set -euo pipefail',
      'body=""',
      'headers=""',
      'while [[ $# -gt 0 ]]; do',
      '  if [[ "$1" == "-o" ]]; then body="$2";shift 2;continue;fi',
      '  if [[ "$1" == "-D" ]]; then headers="$2";shift 2;continue;fi',
      '  shift',
      'done',
      'n=$(wc -l < "$FAKE_HITS")',
      'i=$((n+1))',
      'code=$(head -n "$i" "$FAKE_CODES" | tail -n 1)',
      'echo "$code" >> "$FAKE_HITS"',
      'if [[ "$code" == 403 && "${FAKE_QUOTA_HEADER:-0}" == 1 && -n "$headers" ]]; then',
      '  printf "x-ratelimit-remaining: 0\\r\\n" > "$headers"',
      'fi',
      'if [[ "$code" =~ ^2 ]]; then',
      '  printf \'{"merge_commit_sha":"verified"}\' > "$body"',
      '  printf "%s" "$code"',
      '  exit 0',
      'fi',
      'printf \'{"message":"Server Error"}\' > "$body"',
      'printf "%s" "$code"',
      'exit 22'
    ].join('\n')+'\n';
    const fakePath=join(bin,'curl');writeFileSync(fakePath,fake);chmodSync(fakePath,0o755);
    const command=twoCalls
      ? 'source "$1"; curl --fail-with-body -sS https://api.github.com/repos/test/pr >/dev/null || :; curl --fail-with-body -sS https://api.github.com/repos/test/pr >/dev/null'
      : 'source "$1"; curl --fail-with-body -sS https://api.github.com/repos/test/pr';
    const result=spawnSync('bash',['-c',command,'bash',helper],{
      encoding:'utf8',timeout:15000,
      env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_HITS:hits,FAKE_CODES:sequence,
        FAKE_QUOTA_HEADER:quotaHeader?'1':'0',RUNNER_TEMP:twoCalls?dir:'',
        GITHUB_ACTIONS:withSummary?'true':'false',GITHUB_STEP_SUMMARY:withSummary?summaryPath:'',
        GITHUB_RUN_ID:twoCalls?'12345':'',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:twoCalls?'test':''}
    });
    return {code:result.status,stdout:result.stdout,stderr:result.stderr,
      calls:readFileSync(hits,'utf8').trim().split('\n').filter(Boolean),
      summary:readFileSync(summaryPath,'utf8')};
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('HTTP 502 and 503 retry twice at most and return the real response',()=>{
  const x=simulate([502,503,200]);
  assert.equal(x.code,0,x.stderr);
  assert.deepEqual(x.calls,['502','503','200']);
  assert.match(x.stdout,/merge_commit_sha/);
});
test('HTTP 502 remains an error after bounded retries, never green',()=>{
  const x=simulate([502,502,502]);
  assert.notEqual(x.code,0);
  assert.equal(x.calls.length,3);
  assert.doesNotMatch(x.stdout,/merge_commit_sha/);
});
for(const status of [403,429,401,422]){
  test('HTTP '+status+' is not retried even if a later fake response is 200',()=>{
    const x=simulate([status,200]);
    assert.notEqual(x.code,0);
    assert.deepEqual(x.calls,[String(status)]);
    assert.doesNotMatch(x.stdout,/merge_commit_sha/);
  });
}
test('CI, orchestration, and late-revocation keep authentic head and merge contexts',()=>{
  const ci=read('.github/workflows/ci.yml');
  const gate=read('.github/workflows/ekodi-ai-orchestration-gate.yml');
  for(const flow of [ci,gate]){
    assert.match(flow,/source scripts\/github-status-transient\.sh/);
    assert.match(flow,/live_merge_sha=\$\(curl/);
    assert.match(flow,/for sha in "\$STATUS_HEAD_SHA" "\$merge_sha"/);
    assert.match(flow,/statuses\/\$\{sha\}/);
  }
  assert.equal((ci.match(/source scripts\/github-status-transient\.sh/g)||[]).length,2);
  assert.equal((gate.match(/source scripts\/github-status-transient\.sh/g)||[]).length,1);
  assert.doesNotMatch(read('scripts/github-status-transient.sh'),/git push|merge_method|update-branch|workflow_dispatch/);
});

test('measured 403 primary quota blocks later status attempts in the same CI job',()=>{
  const x=simulate([403,200],{twoCalls:true,quotaHeader:true});
  assert.notEqual(x.code,0);
  assert.deepEqual(x.calls,['403']);
  assert.match(x.stderr,/job quota circuit open/);
});
test('403 permission denial without quota evidence never sets the circuit marker',()=>{
  const x=simulate([403,200],{twoCalls:true});
  assert.equal(x.code,0,x.stderr);
  assert.deepEqual(x.calls,['403','200']);
  assert.doesNotMatch(x.stderr,/job quota circuit open/);
});
test('HTTP 429 blocks repeated same-job GitHub status attempts without a second call',()=>{
  const x=simulate([429,200],{twoCalls:true});
  assert.notEqual(x.code,0);
  assert.deepEqual(x.calls,['429']);
});

test('verified GitHub primary limit is visible in nonsecret Actions summary',()=>{
  const x=simulate([403,200],{twoCalls:true,quotaHeader:true,withSummary:true});
  assert.notEqual(x.code,0);
  assert.deepEqual(x.calls,['403']);
  assert.match(x.summary,/quota_primary/);
  assert.match(x.summary,/quota_circuit_suppressed/);
  assert.match(x.summary,/HTTP \`403\`/);
  assert.doesNotMatch(x.summary,/Bearer|Server Error|api\.github\.com|FAKE_|x-ratelimit|secret/i);
});
test('HTTP 429 is a limit event, not a fabricated 403 primary limit',()=>{
  const x=simulate([429],{withSummary:true});
  assert.notEqual(x.code,0);
  assert.match(x.summary,/rate_limited_429/);
  assert.doesNotMatch(x.summary,/quota_primary|quota_secondary/);
});
test('permission-only HTTP 403 is never classified as rate limit in summary',()=>{
  const x=simulate([403],{withSummary:true});
  assert.notEqual(x.code,0);
  assert.match(x.summary,/permission_denied/);
  assert.doesNotMatch(x.summary,/quota_primary|quota_secondary|quota_circuit_suppressed/);
});
test('disabled summary produces no additional network calls or artifacts',()=>{
  const x=simulate([403],{quotaHeader:true});
  assert.notEqual(x.code,0);
  assert.deepEqual(x.calls,['403']);
  assert.equal(x.summary,'');
});
