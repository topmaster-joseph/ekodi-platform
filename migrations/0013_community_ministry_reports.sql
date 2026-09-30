CREATE TABLE IF NOT EXISTS community_report_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipient_email TEXT NOT NULL DEFAULT '',
  cc_email TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT 'EKODI Community',
  due_day INTEGER NOT NULL DEFAULT 0,
  auto_send_after_approval INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

INSERT OR IGNORE INTO community_report_settings
  (id, recipient_email, cc_email, sender_name, due_day, auto_send_after_approval)
VALUES (1, '', '', 'EKODI Community', 0, 1);

CREATE TABLE IF NOT EXISTS community_ministry_reports (
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
  approved_by INTEGER,
  sent_at TEXT NOT NULL DEFAULT '',
  gmail_message_id TEXT NOT NULL DEFAULT '',
  send_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  UNIQUE(report_year, report_month),
  CHECK (report_month IN (2,4,6,8,10,12)),
  FOREIGN KEY (approved_by) REFERENCES admins(id),
  FOREIGN KEY (updated_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_period ON community_ministry_reports(report_year DESC, report_month DESC);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_ministry_reports(status, updated_at DESC);
