-- EKODI Live: multilingual interpretation captions + external simulcast (YouTube/Facebook).
-- Additive only. Shared by every tenant in realtime-tenant-registry.js.

-- One caption session per tenant broadcast. room_id links to an EKODI SFU room
-- when the broadcast runs in the browser studio; it stays NULL when the program
-- is ingested through an RTMPS encoder (OBS, Larix) into the simulcast engine.
CREATE TABLE IF NOT EXISTS live_caption_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_id TEXT,
  source_lang TEXT NOT NULL DEFAULT 'ko',
  target_langs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_by TEXT,
  segment_count INTEGER NOT NULL DEFAULT 0 CHECK (segment_count >= 0),
  translation_failures INTEGER NOT NULL DEFAULT 0 CHECK (translation_failures >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_caption_sessions_tenant ON live_caption_sessions(tenant_id, status, updated_at);

-- Each spoken segment is stored once per language (source + every target).
-- seq is monotonic per session so viewers poll with ?after=<seq>.
CREATE TABLE IF NOT EXISTS live_caption_segments (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  is_source INTEGER NOT NULL DEFAULT 0 CHECK (is_source IN (0,1)),
  translation_status TEXT NOT NULL DEFAULT 'ok' CHECK (translation_status IN ('ok','source','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, seq, lang)
);
CREATE INDEX IF NOT EXISTS idx_live_caption_segments_lang ON live_caption_segments(session_id, lang, seq);

-- Simulcast engine state. The ingest stream key and the destination stream keys
-- live only inside Cloudflare Stream; EKODI keeps identifiers and masked hints.
CREATE TABLE IF NOT EXISTS live_stream_inputs (
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'cloudflare-stream',
  live_input_uid TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_stream_outputs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  live_input_uid TEXT NOT NULL,
  provider_output_uid TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','facebook','custom')),
  label TEXT NOT NULL DEFAULT '',
  ingest_host TEXT NOT NULL DEFAULT '',
  key_hint TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_stream_outputs_tenant ON live_stream_outputs(tenant_id, created_at);
