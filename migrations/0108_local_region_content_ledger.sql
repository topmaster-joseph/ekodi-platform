CREATE TABLE IF NOT EXISTS local_region_content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'item',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  starts_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  contact_text TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_region_content_public
  ON local_region_content_items(region_id,module_id,visibility,status,sort_order,updated_at);

CREATE INDEX IF NOT EXISTS idx_local_region_content_admin
  ON local_region_content_items(region_id,module_id,updated_at);

CREATE TABLE IF NOT EXISTS local_region_content_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  region_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  item_id INTEGER,
  event_type TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  event_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_region_content_events_module
  ON local_region_content_events(region_id,module_id,event_at DESC,id DESC);
