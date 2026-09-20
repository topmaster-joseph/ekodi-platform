CREATE TABLE IF NOT EXISTS realtime_interpretation_segments (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'ko-KR',
  source_text TEXT NOT NULL,
  translations_json TEXT NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'degraded' CHECK (status IN ('ready','degraded')),
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_interpretation_room_created
  ON realtime_interpretation_segments (room_id, created_at, id);
