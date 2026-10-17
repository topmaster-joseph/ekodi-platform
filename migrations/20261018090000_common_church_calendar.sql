-- Common church calendar: independent from the approved Scripture registry.
CREATE TABLE IF NOT EXISTS common_church_calendar_entries (
 id TEXT PRIMARY KEY,
 event_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('liturgical','denominational','local')),
 approval TEXT NOT NULL CHECK(approval IN ('draft','approved','archived')),
 bulletin TEXT NOT NULL DEFAULT '',
 sermon_focus TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '',
 source_note TEXT NOT NULL DEFAULT '',
 updated_by TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_church_calendar_events_date ON common_church_calendar_entries (event_date,end_date,approval);
CREATE TABLE IF NOT EXISTS common_church_calendar_audit (
 audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL,
 operation TEXT NOT NULL,
 actor TEXT NOT NULL,
 payload TEXT NOT NULL,
 at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
