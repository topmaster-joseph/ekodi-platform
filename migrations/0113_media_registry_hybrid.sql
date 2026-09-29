CREATE TABLE IF NOT EXISTS media_registry (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_drive',
  provider_file_id TEXT NOT NULL,
  drive_id TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  byte_size INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','link','public')),
  delivery_tier TEXT NOT NULL DEFAULT 'drive' CHECK (delivery_tier IN ('drive','r2','youtube','external_cdn')),
  delivery_url TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  event_id TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, provider, provider_file_id)
);
CREATE INDEX IF NOT EXISTS idx_media_registry_service_visibility ON media_registry(service_id, visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_registry_workspace_event ON media_registry(workspace_id, event_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_registry_delivery_tier ON media_registry(delivery_tier, updated_at DESC);
