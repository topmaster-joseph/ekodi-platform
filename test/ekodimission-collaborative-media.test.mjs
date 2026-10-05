import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);

test('EKODI Mission archive supports participant media-link collection with dedupe and admin hide',async()=>{
  const worker=await readFile(new URL('space-worker.js',root),'utf8');
  const migration=await readFile(new URL('supabase/migrations/20261005041500_activity_collaborative_media_links.sql',root),'utf8');
  const client=await readFile(new URL('space/ekodimission-archive.js',root),'utf8');

  assert.match(worker,/MISSION_ACTIVITY_MEDIA_RE/);
  assert.match(worker,/activity_public_submit_media_link/);
  assert.match(worker,/activity_admin_hide_media_link/);
  assert.match(worker,/data-media-submit/);
  assert.match(worker,/ekodimission\/assets\/archive\.js/);

  assert.match(migration,/activity_media_links_canonical_unique/);
  assert.match(migration,/on conflict\(activity_id,canonical_url\)/);
  assert.match(migration,/hidden_at/);
  assert.match(migration,/activity_public_archive_snapshot/);
  assert.match(migration,/hidden_at is null/);

  assert.match(client,/같은 링크가 이미 있으면 하나로 정리됩니다/);
  assert.match(client,/activity_admin_hide_media_link/);
  assert.match(client,/location\.reload\(\)/);
});
