import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Education hardening is additive to canonical development-verified migrations',async()=>{
 const [base,privateRole,guard]=await Promise.all([
  read('supabase/migrations/20261016010000_education_online_campus_rls.sql'),
  read('supabase/migrations/20261016011500_education_role_private_wrapper.sql'),
  read('supabase/migrations/20261016012000_education_lms_mutation_hardening.sql')
 ]);
 assert.match(base,/create table if not exists public\.education_course_posts/);
 assert.match(base,/create table if not exists public\.education_enrollments/);
 assert.match(base,/create table if not exists public\.education_learning_progress/);
 assert.match(privateRole,/education_private\.actor_role\(\)/);
 assert.match(privateRole,/security invoker/);
 assert.match(guard,/create or replace function education_private\.education_protect_enrollment_identity\(\)/);
 assert.match(guard,/new\.user_id is distinct from old\.user_id/);
 assert.match(guard,/new\.batch_id is distinct from old\.batch_id/);
 assert.match(guard,/new\.lesson_id is distinct from old\.lesson_id/);
 assert.match(guard,/revoke delete on public\.education_learning_progress from authenticated/);
 assert.match(guard,/education_posts_operator_create/);
 assert.match(guard,/education_posts_operator_update/);
 assert.match(guard,/status='draft' and published_at is null/);
 assert.doesNotMatch(guard,/drop table|truncate|alter table[^\n]*disable row level security/i);
 assert.doesNotMatch(guard,/grant execute on function education_private[^\n]* to anon/i);
});

test('Education web UI remains fail closed until schema and live feature flag are enabled',async()=>{
 const [worker,portal,campus,staging]=await Promise.all([
  read('education-worker.js'),read('education/portal/portal.js'),
  read('education/campus.js'),read('wrangler.education.staging.toml')
 ]);
 assert.match(worker,/lmsEnabled:env\.EDUCATION_LMS_ENABLED==='true'&&dataEnabled/);
 assert.match(portal,/cfg\.lmsEnabled===true&&cfg\.dataEnabled===true/);
 assert.match(campus,/cfg\.lmsEnabled!==true/);
 assert.match(staging,/DATA_ENABLED = "false"/);
 assert.doesNotMatch(portal,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.doesNotMatch(portal,/user_metadata.*(?:role|admin|instructor)/);
 assert.match(portal,/sb\.rpc\('education_actor_role'\)/);
 assert.match(portal,/searchParams\.set\('return_to',location\.href\)/);
 assert.match(portal,/role='learner'/);
 assert.match(portal,/manageNav'\)\.hidden=!roles\.includes\(role\)/);
});
