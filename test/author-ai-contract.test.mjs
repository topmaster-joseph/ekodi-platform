import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Author AI keeps manuscript private and requires human publication approval', async () => {
  const [html, app, migration] = await Promise.all([read('author/index.html'), read('author/app.js'), read('supabase/migrations/20260816010000_author_ai_foundation.sql')]);
  assert.match(html, /원고는 기본 비공개/);
  assert.match(html, /AUTHOR APPROVED/);
  assert.match(app, /author\.approved/);
  assert.match(app, /books\.handoff\.requested/);
  assert.match(migration, /chief_share_level text not null default 'metadata'/);
  assert.match(migration, /owner_user_id = auth\.uid\(\)/);
});

test('Author AI is an independent service with isolated staging', async () => {
  const [prod, staging, worker, auth] = await Promise.all([read('wrangler.author.toml'), read('wrangler.author.staging.toml'), read('author-worker.js'), read('auth-site/author-auth.js')]);
  assert.match(prod, /author\.ekodi\.kr/);
  assert.doesNotMatch(staging, /author\.ekodi\.kr/);
  assert.match(worker, /ekodi-author-ai/);
  assert.match(worker, /author-events-v1/);
  assert.match(auth, /author-access-api/);
});

test('Author project model separates agents and queues future model-backed work', async () => {
  const migration = await read('supabase/migrations/20260816010000_author_ai_foundation.sql');
  for (const role of ['author-ai','research-ai','editor-ai','chief-ai','books']) assert.ok(migration.includes(role), `missing ${role}`);
  assert.match(migration, /author_agent_jobs/);
  assert.match(migration, /review_required/);
});
