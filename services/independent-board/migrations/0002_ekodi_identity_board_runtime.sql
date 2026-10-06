ALTER TABLE board_posts ADD COLUMN owner_subject TEXT NOT NULL DEFAULT '';
ALTER TABLE board_replies ADD COLUMN owner_subject TEXT NOT NULL DEFAULT '';
ALTER TABLE board_files ADD COLUMN owner_subject TEXT NOT NULL DEFAULT '';
ALTER TABLE board_files ADD COLUMN object_key TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS board_members (
  subject TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_members_role ON board_members(role,status);

CREATE TABLE IF NOT EXISTS board_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_subject TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_audit_created ON board_audit(created_at DESC);

-- Authentication is intentionally not stored here. EKODI/Supabase is the sole identity provider.
DROP TABLE IF EXISTS board_sessions;
DROP TABLE IF EXISTS board_admins;
