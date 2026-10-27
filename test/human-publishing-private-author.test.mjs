import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = path => readFile(new URL('../'+path,import.meta.url),'utf8');

test('Human Publishing storage extends Creator AI ownership without public paid writes', async()=>{
  const migration=await load('supabase/migrations/20261028010000_human_author_membership_writing.sql');
  for(const marker of ['human_author_subscriptions','human_author_enrollments','human_author_interview_turns',
    'enable row level security','for select to authenticated','owner_user_id = (select auth.uid())',
    'revoke all on public.human_author_subscriptions','revoke all on public.human_author_enrollments',
    'human_author_reserve_project','owned_writer_project_required',
    'verified_paid_human_subscription_required','monthly_human_author_project_limit_reached',
    'pg_advisory_xact_lock','revoke all on function public.human_author_reserve_project']){
    assert.ok(migration.includes(marker),marker);
  }
  assert.ok(!migration.includes('create policy human_author_enrollments_owner_insert'),
    'client may never mint paid quota records');
  assert.match(migration,/author_project_id uuid not null unique references public\.author_projects/);
  assert.match(migration,/author_project_id = p_author_project_id/);
  assert.match(migration,/writing_mode = 'human'/);
});

test('Author UI opens owner-scoped private journal, not a billed provider or automatic publication',async()=>{
  const [author,widget]=await Promise.all([load('author/app.js'),load('author/human-writer.js')]);
  assert.match(author,/import \{ openHumanAuthorJournal \}/);
  assert.match(author,/data-human>휴먼 집필 인터뷰/);
  assert.match(widget,/human_author_reserve_project/);
  assert.match(widget,/human_author_interview_turns/);
  assert.match(widget,/writing_mode/);
  assert.match(widget,/session\.user\.id/);
  assert.doesNotMatch(widget,/js\.tosspayments|api\.openai\.com|service_role/);
});
