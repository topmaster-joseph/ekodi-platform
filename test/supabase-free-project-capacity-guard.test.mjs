import test from 'node:test';
import assert from 'node:assert/strict';
import { findSupabaseProjectCreationAttempts, validateSupabaseFreeProjectCapacity } from '../scripts/validate-supabase-free-project-capacity.mjs';
import policy from '../config/free-tier-optimization-policy.json' with { type:'json' };

test('Free capacity policy blocks only new Supabase projects at 2/2',()=>{
  assert.deepEqual(validateSupabaseFreeProjectCapacity(policy),[]);
  const rule=policy.resourceGovernor.capacityRules['supabase.active_projects'];
  assert.equal(rule.fullAt,2);
  assert.equal(rule.existingProjectsRemainAvailable,true);
  assert.equal(rule.action,'block-new-project-only');
});

test('project creation root endpoint and CLI create are rejected',()=>{
  assert.deepEqual(
    findSupabaseProjectCreationAttempts("curl -X POST 'https://api.supabase.com/v1/projects' -d '{}'"),
    ['management-api-project-create']
  );
  assert.deepEqual(findSupabaseProjectCreationAttempts('supabase projects create new-ekodi-project'),['supabase-cli-project-create']);
});

test('existing-project Management API operations remain allowed',()=>{
  for(const sample of [
    "curl -X POST https://api.supabase.com/v1/projects/$PROJECT_REF/database/query",
    "curl -X PATCH https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth",
    "fetch('https://api.supabase.com/v1/projects/abc/database/query/read-only',{method:'POST'})",
  ]) assert.deepEqual(findSupabaseProjectCreationAttempts(sample),[]);
});
