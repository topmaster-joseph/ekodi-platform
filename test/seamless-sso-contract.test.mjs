import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const router=read('auth-site/auth-router.js');
const auth=read('auth-site/auth.js');
const client=read('auth-site/client-auth.js');
const business=read('auth-site/business-auth.js');
const author=read('auth-site/author-auth.js');
const marketing=read('auth-site/marketing-auth-hotfix.js');

test('normal user login is a pass-through instead of an auth dashboard stop',()=>{
  assert.doesNotMatch(router,/marketingHomeMode/);
  assert.doesNotMatch(router,/params\.set\('manage','1'\)/);
  assert.match(router,/dataset\.seamlessSso/);
  assert.match(router,/site==='admin'/);
});

test('generic SSO immediately routes an explicit or single authorized workspace',()=>{
  assert.match(auth,/requestedWorkspace/);
  assert.match(auth,/authorized\.find\(item=>item\.workspace_key===requestedWorkspace\)/);
  assert.match(auth,/authorized\.length===1&&workspaces\.length===1/);
  assert.match(auth,/await handoffToService\(authorized\[0\]\.workspace_key\)/);
});

test('ambiguous multi-workspace access still requires an explicit safe choice',()=>{
  assert.match(auth,/if\(authorized\.length>0\)/);
  assert.match(auth,/renderWorkspacePanel\(workspaces\)/);
  assert.match(auth,/이 서비스에서 사용할 공간을 선택해 주세요/);
});

test('user-site special auth modules preserve only same-origin HTTPS return targets',()=>{
  for(const source of [client,business,author]){
    assert.match(source,/params\.get\('return_to'\)/);
    assert.match(source,/target\.protocol!=='https:'/);
    assert.match(source,/target\.hash=''/);
    assert.match(source,/const RETURN_TO=safeReturn/);
  }
  assert.match(client,/target\.origin!==fallback\.origin/);
  assert.match(business,/target\.origin!=='https:\/\/business\.ekodi\.kr'/);
  assert.match(author,/target\.origin!=='https:\/\/author\.ekodi\.kr'/);
});

test('existing central sessions bypass repeated Google selection on user services',()=>{
  assert.match(client,/sb\.auth\.getSession/);
  assert.match(client,/if\(await handoffExistingSession\(\)\)return/);
  assert.match(business,/const existing=await session\(\);if\(existing\)/);
  assert.match(author,/const existing=await session\(\)/);
});

test('Marketing keeps credential handoff out of the browser URL',()=>{
  assert.match(marketing,/\/api\/marketing\/handoff\/start/);
  assert.match(marketing,/credentials:'include'/);
  assert.doesNotMatch(marketing,/target\.hash\s*=/);
});

test('modified auth modules remain syntactically valid',()=>{
  for(const path of ['auth-site/auth-router.js','auth-site/client-auth.js','auth-site/business-auth.js','auth-site/author-auth.js']){
    const result=spawnSync(process.execPath,['--check',new URL(`../${path}`,import.meta.url).pathname],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}\n${result.stderr||result.stdout}`);
  }
});
