import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const deploy=await readFile(new URL('../.github/workflows/deploy-ekodi-church-homepage.yml',import.meta.url),'utf8');
test('Church Pages release must verify the canonical RLS-preserving Supabase CSP allowlist',()=>{
  assert.match(deploy,/test -s church\/_headers/);
  assert.match(deploy,/connect-src 'self' https:\/\/api\.ekodi\.kr https:\/\/renzehysxirjilvdxacv\.supabase\.co;/);
  assert.match(deploy,/curl -L -sS -D \/tmp\/church-csp-headers -o \/tmp\/church\.html/);
  assert.match(deploy,/grep -Eiq '\^content-security-policy:/);
  assert.match(deploy,/scope=worship-access/);
  assert.match(deploy,/EKODI_RELEASE_BRANCH_REF/);
  assert.match(deploy,/EKODI_RELEASE_TASK_ID/);
});
test('CSP proof does not weaken application scripts or bypass Orchestrator release',()=>{
  assert.match(deploy,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.doesNotMatch(deploy,/--skip-gate|--no-orchestrator|--ignore-csp/);
});
