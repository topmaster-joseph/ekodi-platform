import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Creator AI keeps creations private and requires human approval before My EKODI handoff', async () => {
  const [html, app, foundation, creator] = await Promise.all([
    read('author/index.html'),
    read('author/app.js'),
    read('supabase/migrations/20260816010000_author_ai_foundation.sql'),
    read('supabase/migrations/20260816155146_creator_ai_my_ekodi.sql')
  ]);
  assert.match(html, /원고는 기본 비공개/);
  assert.match(html, /CREATOR APPROVED/);
  assert.match(app, /author\.approved/);
  assert.match(app, /publish_creator_to_my_ekodi/);
  assert.match(creator, /creator_human_approval_required/);
  assert.match(creator, /visibility text not null default 'private'/);
  assert.match(foundation, /chief_share_level text not null default 'metadata'/);
  assert.match(foundation, /owner_user_id = auth\.uid\(\)/);
});

test('Creator AI widens the Author compatibility service to eight creator modes', async () => {
  const [html, app, worker, access, ai] = await Promise.all([
    read('author/index.html'),
    read('author/app.js'),
    read('author-worker.js'),
    read('supabase/functions/author-access-api/index.ts'),
    read('supabase/functions/author-ai-api/index.ts')
  ]);
  for (const mode of ['writer','video','podcast','lecture','research','visual','mission','ai']) {
    assert.ok(app.includes(`${mode}: {`), `missing creator mode ${mode}`);
  }
  assert.match(html, /EKODI Creator AI/);
  assert.match(worker, /ekodi-creator-ai/);
  assert.match(access, /내 크리에이터 스튜디오/);
  assert.match(access, /my_ekodi_url/);
  assert.match(ai, /EKODI Creator AI/);
  assert.match(ai, /creator_mode/);
});

test('Creator AI remains an independent compatibility service with isolated staging', async () => {
  const [prod, staging, worker, auth] = await Promise.all([
    read('wrangler.author.toml'),
    read('wrangler.author.staging.toml'),
    read('author-worker.js'),
    read('auth-site/author-auth.js')
  ]);
  assert.match(prod, /author\.ekodi\.kr/);
  assert.doesNotMatch(staging, /author\.ekodi\.kr/);
  assert.match(worker, /ekodi-author-ai/);
  assert.match(worker, /author-events-v1/);
  assert.match(auth, /author-access-api/);
});

test('My EKODI portfolio is person-scoped across linked identities with private helper', async () => {
  const [migration, hardening, privateHelper] = await Promise.all([
    read('supabase/migrations/20260816155146_creator_ai_my_ekodi.sql'),
    read('supabase/migrations/20260816155153_creator_portfolio_person_policy_hardening.sql'),
    read('supabase/migrations/20260816155454_creator_portfolio_private_person_helper.sql')
  ]);
  assert.match(migration, /creator_portfolio_items/);
  assert.match(migration, /person_id uuid references public\.people/);
  assert.match(migration, /workspace_key/);
  assert.match(migration, /personal:/);
  assert.match(hardening, /current_person_id/);
  assert.match(privateHelper, /private\.current_person_id/);
  assert.match(privateHelper, /drop function if exists public\.current_person_id/);
});
