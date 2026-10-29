import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const helper=fileURLToPath(new URL('../scripts/github-status-transient.sh',import.meta.url));
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function simulate(codes){
  const dir=mkdtempSync(join(tmpdir(),'ekodi-status-'));
  try{
    const bin=join(dir,'bin');mkdirSync(bin);
    const sequence=join(dir,'codes'),hits=join(dir,'hits');
    writeFileSync(sequence,codes.join('\n')+'\n');writeFileSync(hits,'');
    const fake=[
      '#!/usr/bin/env bash','set -euo pipefail',
      'body=""',
      'while [[ $# -gt 0 ]]; do',
      '  if [[ "$1" == "-o" ]]; then body="$2";shift 2;continue;fi',
      '  shift',
      'done',
      'n=$(wc -l < "$FAKE_HITS")',
      'i=$((n+1))',
      'code=$(head -n "$i" "$FAKE_CODES" | tail -n 1)',
      'echo "$code" >> "$FAKE_HITS"',
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
    const result=spawnSync('bash',['-c','source "$1"; curl --fail-with-body -sS https://api.github.com/repos/test/pr','bash',helper],{
      encoding:'utf8',timeout:15000,
      env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_HITS:hits,FAKE_CODES:sequence}
    });
    return {code:result.status,stdout:result.stdout,stderr:result.stderr,
      calls:readFileSync(hits,'utf8').trim().split('\n').filter(Boolean)};
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
