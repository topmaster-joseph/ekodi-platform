CREATE TABLE IF NOT EXISTS seonammedi_page_sections (
  section_key TEXT PRIMARY KEY,
  body_json TEXT NOT NULL DEFAULT '{}',
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seonammedi_finance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('income','expense')),
  amount INTEGER NOT NULL CHECK(amount >= 0),
  purpose TEXT NOT NULL,
  related_event TEXT NOT NULL DEFAULT '',
  evidence_status TEXT NOT NULL DEFAULT 'none',
  public_note TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seonammedi_finance_public
ON seonammedi_finance_entries(visible,entry_date,id);

UPDATE customer_access_grants
SET capabilities_json='["seonammedi.notice.manage","seonammedi.channel.manage","seonammedi.content.manage","seonammedi.timeline.manage","seonammedi.voice.manage","seonammedi.page.manage","seonammedi.finance.manage"]',
    updated_at=CURRENT_TIMESTAMP
WHERE tenant_id=(SELECT id FROM customer_tenants WHERE slug='seonammedi' LIMIT 1)
  AND lower(trim(email))='ohwon69@gmail.com';
