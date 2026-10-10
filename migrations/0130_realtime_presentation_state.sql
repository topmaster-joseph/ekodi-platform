-- EKODI Live: tenant-scoped, room-owned presenter slide cursor.
-- Shared D1 migration; state is public only when its room permits anonymous viewers.
-- No stream keys, passwords, text transcripts or viewer identities are recorded.
CREATE TABLE IF NOT EXISTS realtime_presentation_state (
  room_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  deck_id TEXT NOT NULL,
  slide_index INTEGER NOT NULL DEFAULT 0 CHECK (slide_index BETWEEN 0 AND 119),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_realtime_presentation_state_tenant ON realtime_presentation_state(tenant_id,room_id);
