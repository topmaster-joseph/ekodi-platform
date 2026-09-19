-- Realtime recording lifecycle, tenant management, R2 multipart assembly and durable archive metadata.
ALTER TABLE realtime_recordings ADD COLUMN upload_id TEXT;
ALTER TABLE realtime_recordings ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'video/webm';
ALTER TABLE realtime_recordings ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE realtime_recordings ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE realtime_recordings ADD COLUMN archive_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE realtime_recordings ADD COLUMN drive_file_id TEXT;
ALTER TABLE realtime_recordings ADD COLUMN drive_web_view_link TEXT;
ALTER TABLE realtime_recordings ADD COLUMN youtube_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE realtime_recordings ADD COLUMN youtube_video_id TEXT;
ALTER TABLE realtime_recordings ADD COLUMN youtube_url TEXT;
ALTER TABLE realtime_recordings ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE realtime_recordings ADD COLUMN created_by TEXT;
ALTER TABLE realtime_recordings ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS realtime_recording_parts (
  recording_id TEXT NOT NULL,
  part_number INTEGER NOT NULL CHECK (part_number >= 1),
  etag TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recording_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_realtime_recording_parts_recording
  ON realtime_recording_parts(recording_id, part_number);

CREATE INDEX IF NOT EXISTS idx_realtime_recordings_tenant_status_created
  ON realtime_recordings(tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_realtime_recordings_storage_key
  ON realtime_recordings(storage_key);
