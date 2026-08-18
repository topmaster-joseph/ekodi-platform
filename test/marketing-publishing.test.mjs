import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { backoffMinutes, nextRecurrence, safeUrl } from '../marketing-publishing-worker.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('publication queue is first-class for person tenant and store subjects', async () => {
  const migration = await read('migrations/0026_marketing_publication_queue.sql');
  assert.match(migration, /subject_type IN \('person','tenant','store'\)/);
  assert.match(migration, /marketing_brand_profiles/);
  assert.match(migration, /marketing_publication_jobs/);
  assert.match(migration, /credentials_required/);
  assert.match(migration, /external_post_id/);
  assert.match(migration, /external_post_url/);
});

test('worker exposes real scheduled publishing lifecycle and never persists provider tokens', async () => {
  const worker = await read('marketing-publishing-worker.js');
  assert.match(worker, /scheduled\(_event, env, ctx\)/);
  assert.match(worker, /runScheduler/);
  assert.match(worker, /status='publishing'/);
  assert.match(worker, /status='published'/);
  assert.match(worker, /status = credential \? 'credentials_required' : retryable \? 'retrying' : 'failed'/);
  assert.match(worker, /credential_ref/);
  assert.doesNotMatch(worker, /INSERT[^\n]+accessToken/i);
  assert.match(worker, /instagram_business/);
  assert.match(worker, /facebook_page/);
  assert.match(worker, /media_publish/);
  assert.match(worker, /media_type:'CAROUSEL'/);
});

test('personal brand subject resolves to authenticated person without tenant membership', async () => {
  const worker = await read('marketing-publishing-worker.js');
  assert.match(worker, /subjectType === 'person'/);
  assert.match(worker, /key:identity\.id/);
  assert.match(worker, /personalBrand:true/);
  assert.match(worker, /AI_PUBLISH_REQUIRES_DELEGATION/);
});

test('scheduler helpers preserve recurrence and bounded retry behavior', () => {
  assert.equal(nextRecurrence('2026-08-18T03:00:00.000Z','daily'),'2026-08-19T03:00:00.000Z');
  assert.equal(nextRecurrence('2026-08-18T03:00:00.000Z','weekly'),'2026-08-25T03:00:00.000Z');
  assert.equal(backoffMinutes(1),5);
  assert.equal(backoffMinutes(5),1440);
  assert.equal(safeUrl('http://example.com'),'');
  assert.equal(safeUrl('https://example.com/a'),'https://example.com/a');
});

test('staging is read-only while production owns the one-minute scheduler', async () => {
  const [staging,production] = await Promise.all([
    read('wrangler.marketing-publishing.staging.toml'),
    read('wrangler.marketing-publishing.toml'),
  ]);
  assert.match(staging, /ALLOW_MUTATIONS = "false"/);
  assert.doesNotMatch(staging, /marketing-publish-api\.ekodi\.kr/);
  assert.match(production, /marketing-publish-api\.ekodi\.kr/);
  assert.match(production, /crons = \["\* \* \* \* \*"\]/);
});
