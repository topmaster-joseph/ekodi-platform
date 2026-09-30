-- Canonical ownership move: Community ministry reports -> EKODI Church.
-- Legacy tables remain intact for rollback; data is copied additively.
CREATE TABLE IF NOT EXISTS church_report_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipient_email TEXT NOT NULL DEFAULT '',
  cc_email TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '에코디교회',
  due_day INTEGER NOT NULL DEFAULT 0,
  auto_send_after_approval INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

INSERT OR IGNORE INTO church_report_settings
  (id, recipient_email, cc_email, sender_name, due_day, auto_send_after_approval, updated_at, updated_by)
SELECT id, recipient_email, cc_email,
       CASE WHEN sender_name = '' OR sender_name = 'Community' OR sender_name = 'EKODI Community'
            THEN '에코디교회' ELSE sender_name END,
       due_day, auto_send_after_approval, updated_at,
       CASE WHEN updated_by IS NULL THEN NULL ELSE CAST(updated_by AS TEXT) END
FROM community_report_settings
WHERE id = 1;

INSERT OR IGNORE INTO church_report_settings
  (id, sender_name, auto_send_after_approval)
VALUES (1, '에코디교회', 1);
CREATE TABLE IF NOT EXISTS church_ministry_reports (
  id TEXT PRIMARY KEY,
  report_year INTEGER NOT NULL,
  report_month INTEGER NOT NULL,
  activity_from TEXT NOT NULL,
  activity_to TEXT NOT NULL,
  plan_from TEXT NOT NULL,
  plan_to TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  activities_text TEXT NOT NULL DEFAULT '',
  outcomes_text TEXT NOT NULL DEFAULT '',
  evaluation_text TEXT NOT NULL DEFAULT '',
  plans_text TEXT NOT NULL DEFAULT '',
  requests_text TEXT NOT NULL DEFAULT '',
  prayers_text TEXT NOT NULL DEFAULT '',
  source_notes TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  ai_mode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  approved_at TEXT NOT NULL DEFAULT '',
  approved_by TEXT,
  sent_at TEXT NOT NULL DEFAULT '',
  gmail_message_id TEXT NOT NULL DEFAULT '',
  send_error TEXT NOT NULL DEFAULT '',
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  source_refreshed_at TEXT NOT NULL DEFAULT '',
  source_status TEXT NOT NULL DEFAULT 'not_loaded',
  source_count INTEGER NOT NULL DEFAULT 0,
  source_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  UNIQUE(report_year, report_month),
  CHECK (report_month IN (2,4,6,8,10,12))
);

INSERT OR IGNORE INTO church_ministry_reports (
  id, report_year, report_month, activity_from, activity_to, plan_from, plan_to,
  title, activities_text, outcomes_text, evaluation_text, plans_text,
  requests_text, prayers_text, source_notes, body_text, ai_mode, status,
  approved_at, approved_by, sent_at, gmail_message_id, send_error,
  source_snapshot_json, source_refreshed_at, source_status, source_count, source_error,
  created_at, updated_at, updated_by
)
SELECT id, report_year, report_month, activity_from, activity_to, plan_from, plan_to,
       REPLACE(title, 'Community ', '에코디교회 '),
       activities_text, outcomes_text, evaluation_text, plans_text,
       requests_text, prayers_text, source_notes, body_text, ai_mode, status,
       approved_at, CASE WHEN approved_by IS NULL THEN NULL ELSE CAST(approved_by AS TEXT) END,
       sent_at, gmail_message_id, send_error,
       source_snapshot_json, source_refreshed_at, source_status, source_count, source_error,
       created_at, updated_at,
       CASE WHEN updated_by IS NULL THEN NULL ELSE CAST(updated_by AS TEXT) END
FROM community_ministry_reports;
CREATE INDEX IF NOT EXISTS idx_church_reports_period
  ON church_ministry_reports(report_year DESC, report_month DESC);
CREATE INDEX IF NOT EXISTS idx_church_reports_status
  ON church_ministry_reports(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_reports_source_status
  ON church_ministry_reports(source_status, source_refreshed_at DESC);

CREATE TABLE IF NOT EXISTS church_report_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_church_report_audit_created
  ON church_report_audit_logs(created_at DESC);
