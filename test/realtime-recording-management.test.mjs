import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('realtime recording lifecycle uses R2 multipart storage and durable Drive archive',async()=>{
  const [control,storage,writer,wrangler,migration]=await Promise.all([
    read('realtime-control.js'),
    read('storage-gateway.js'),
    read('canonical-drive-writer.js'),
    read('wrangler.api.toml'),
    read('migrations/0096_realtime_recording_management.sql'),
  ]);
  assert.match(control,/createMultipartUpload\(/);
  assert.match(control,/resumeMultipartUpload\(/);
  assert.match(control,/recordingRoutes\(/);
  assert.match(control,/archiveRecordingToSharedDrive/);
  assert.match(control,/storage\.internal\/api\/storage\/v1\/archive-r2/);
  assert.doesNotMatch(control,/drive\.ekodi\.kr/);
  assert.match(wrangler,/binding = "STORAGE"/);
  assert.match(storage,/archiveR2ToCanonicalDrive/);
  assert.match(writer,/writeCanonicalDriveStream/);
  assert.match(writer,/ensureSubfolderPath/);
  assert.match(wrangler,/binding = "LIVE_RECORDINGS_BUCKET"/);
  assert.match(migration,/realtime_recording_parts/);
  assert.match(migration,/archive_status/);
});

test('recording management exposes private-by-default lifecycle controls',async()=>{
  const control=await read('realtime-control.js');
  assert.match(control,/0,'private','pending'/);
  assert.match(control,/visibility=\?/);
  assert.match(control,/retention_until=\?/);
  assert.match(control,/status='deleted'/);
  assert.match(control,/youtube_connection_required/);
});

test('generic live broadcaster writes recording parts without blocking media on recording failure',async()=>{
  const live=await read('tenant-live.js');
  assert.match(live,/RECORD_PART_TARGET=6\*1024\*1024/);
  assert.match(live,/MediaRecorder/);
  assert.match(live,/recordings\/\$\{encodeURIComponent\(rec\.id\)\}\/parts/);
  assert.match(live,/방송은 계속됩니다/);
});


test('public visibility is an actual delivery boundary and retention is enforced',async()=>{
  const [control,entry]=await Promise.all([read('realtime-control.js'),read('mission-control-entry-worker.js')]);
  assert.match(control,/recording\.visibility!=='public'/);
  assert.match(control,/recordings\/public/);
  assert.match(control,/runRealtimeRecordingRetention/);
  assert.match(control,/retention_until<=\?/);
  assert.match(entry,/runRealtimeRecordingRetention/);
});


test('manual recording deletion fails closed until durable copies are removed',async()=>{
  const control=await read('realtime-control.js');
  assert.match(control,/recording_delete_storage_not_configured/);
  assert.match(control,/recording_delete_archive_failed/);
  assert.match(control,/recording_delete_object_failed/);
  const archiveIndex=control.indexOf('recording_delete_archive_failed');
  const deletedIndex=control.indexOf("status='deleted'",archiveIndex);
  assert.ok(archiveIndex>=0&&deletedIndex>archiveIndex);
});
