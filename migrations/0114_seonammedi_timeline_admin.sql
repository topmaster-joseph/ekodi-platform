-- Additive timeline management for Seonam Medi.
CREATE TABLE IF NOT EXISTS seonammedi_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_key TEXT UNIQUE,
  event_date TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  links_json TEXT NOT NULL DEFAULT '[]',
  media_json TEXT NOT NULL DEFAULT '[]',
  monitor_keywords_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seonammedi_timeline_public
  ON seonammedi_timeline(status,sort_order,id);

CREATE TABLE IF NOT EXISTS seonammedi_seed_state (
  seed_key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

UPDATE customer_access_grants
SET capabilities_json='["seonammedi.notice.manage","seonammedi.channel.manage","seonammedi.timeline.manage"]',
    updated_at=CURRENT_TIMESTAMP
WHERE tenant_id=(SELECT id FROM customer_tenants WHERE slug='seonammedi' LIMIT 1)
  AND lower(trim(email))='ohwon69@gmail.com';
