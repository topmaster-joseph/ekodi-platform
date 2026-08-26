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

test('generic SSO immediately routes an explicit or authorized workspace',()=>{
  assert.match(auth,/requestedWorkspace/);
  assert.match(auth,/authorized\.find\(item=>item\.workspace_key===requestedWorkspace\)/);
  assert.match(auth,/if\(requested\)/);
  assert.match(auth,/if\(authorized\.length>0\)/);
  assert.match(auth,/await handoffToService\(requested\.workspace_key\)/);
  assert.match(auth,/await handoffToService\(\)/);
});

test('failed seamless handoff restores an explicit safe workspace choice',()=>{
  assert.match(auth,/if\(authorized\.length>0\)/);
  assert.match(auth,/renderWorkspacePanel\(workspaces\)/);
  assert.match(auth,/자동 복귀가 지연되어 사용할 공간을 선택할 수 있게 열었습니다/);
});

test('user-site special auth modules preserve only allowed same-service HTTPS return targets',()=>{
  for(const source of [client,business,author]){
    assert.match(source,/params\.get\('return_to'\)/);
    assert.match(source,/target\.protocol!=='https:'/);
    assert.match(source,/target\.hash=''/);
    assert.match(source,/const RETURN_TO=safeReturn/);
  }
  assert.match(client,/const allowedOrigins=new Set\(config\.origins\|\|\[fallback\.origin\]\)/);
  assert.match(client,/!allowedOrigins\.has\(target\.origin\)/);
  assert.match(business,/target\.origin!=='https:\/\/business\.ekodi\.kr'/);
  assert.match(author,/target\.origin!=='https:\/\/author\.ekodi\.kr'/);
});

test('existing central sessions bypass repeated Google selection on user services',()=>{
  assert.match(client,/sb\.auth\.getSession/);
  assert.match(client,/if\(await handoffExistingSession\(existing\)\)return/);
  assert.match(business,/existing=await session\(\)/);
  assert.match(business,/if\(existing\)\{await routeSession\(existing\);return\}/);
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