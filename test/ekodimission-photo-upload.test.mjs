import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Mission collaborative photo upload stays inside EKODI storage boundary and deduplicates before write',async()=>{
  const [worker,client,migration,spaceConfig,storageWorker,workflow]=await Promise.all([
    read('space-worker.js'),
    read('space/ekodimission-archive.js'),
    read('supabase/migrations/20261005121000_activity_collaborative_photo_uploads.sql'),
    read('wrangler.space.toml'),
    read('storage-worker.js'),
    read('.github/workflows/deploy-activity-public-share-schema.yml'),
  ]);

  assert.match(worker,/MISSION_ACTIVITY_MEDIA_UPLOAD_RE/);
  assert.match(worker,/MISSION_ACTIVITY_MEDIA_FILE_RE/);
  assert.match(worker,/MISSION_MEDIA_MAX_FILE_BYTES=8\*1024\*1024/);
  assert.match(worker,/activity_public_reserve_media_upload/);
  assert.match(worker,/activity_public_finalize_media_upload/);
  assert.match(worker,/activity_public_fail_media_upload/);
  assert.match(worker,/activity_public_media_file_ref/);
  assert.match(worker,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(worker,/https:\/\/storage\.internal\/api\/storage\/v1\/records/);
  assert.match(worker,/storageRoute:'media'/);
  assert.match(worker,/retentionClass:'permanent'/);
  assert.match(worker,/subfolderPath:'EKODI Mission\/Activities\/'/);
  assert.match(worker,/image\/jpeg/);
  assert.match(worker,/image\/heic/);

  assert.match(client,/data-photo-upload/);
  assert.match(client,/name="photos"/);
  assert.match(client,/files\.length>20/);
  assert.match(client,/8\*1024\*1024/);
  assert.match(client,/photoApi/);

  assert.match(migration,/activity_media_links_content_sha256_unique/);
  assert.match(migration,/where content_sha256 is not null/);
  assert.match(migration,/upload_state='uploading'/);
  assert.match(migration,/upload_state='ready'/);
  assert.match(migration,/storage_provider='google_workspace_shared_drive'/);
  assert.match(migration,/activity_public_media_file_ref/);
  assert.match(migration,/upload_token/);

  assert.match(spaceConfig,/binding = "STORAGE"/);
  assert.match(spaceConfig,/service = "ekodi-storage-control"/);
  assert.match(storageWorker,/url\.hostname==='storage\.internal'/);
  assert.match(storageWorker,/handleStorageGateway/);

  assert.match(workflow,/PHOTO_UPLOAD_MIGRATION/);
  assert.match(workflow,/20261005121000_activity_collaborative_photo_uploads\.sql/);
});
