import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('central common-service auth preserves source return target and bounded workspace context for My EKODI',async()=>{
  const auth=await read('auth-site/client-auth.js');
  assert.match(auth,/WORKSPACE_KEY_RE=\/\^\[a-z\]\+:/);
  assert.match(auth,/REQUESTED_WORKSPACE=requestedWorkspaceRaw\.length<=180/);
  assert.match(auth,/target\.searchParams\.set\('from',site\)/);
  assert.match(auth,/target\.searchParams\.set\('return_to',RETURN_TO\)/);
  assert.match(auth,/target\.searchParams\.set\('workspace',REQUESTED_WORKSPACE\)/);
  assert.match(auth,/commonServiceEntry&&proof\.platformAdmin!==true\?myEntryTarget\(\)/);
});

test('My common-service access guidance resolves only RLS-protected user access and never guesses another workspace',async()=>{
  const access=await read('my/access-context.js');
  execFileSync(process.execPath,['--check',new URL('../my/access-context.js',import.meta.url).pathname],{stdio:'pipe'});
  assert.match(access,/current_site_access/);
  assert.match(access,/current_site_workspaces/);
  assert.match(access,/ACTIVE_STATUSES/);
  assert.match(access,/requestedWorkspace&&!exact/);
  assert.match(access,/다른 공간으로 임의 전환하지 않습니다/);
  assert.match(access,/target\.origin!==base\.origin/);
  assert.match(access,/minimumTier/);
  assert.doesNotMatch(access,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(access,/service_role/);
});

test('My Worker injects access guidance into root and canonical private workspace shells',async()=>{
  const worker=await read('my-worker.js');
  assert.match(worker,/ACCESS_CONTEXT_TAG/);
  assert.match(worker,/\/access-context\.js\?v=20260829-common-service-access-1/);
  assert.match(worker,/if\(!source\.includes\('\/access-context\.js'\)\)/);
  assert.match(worker,/accessContextGuidance:true/);
  assert.match(worker,/return routedMyHome\(request,env,privateRoute\)/);
});
